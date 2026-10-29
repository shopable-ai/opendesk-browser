// Read-only runtime evidence loader shared by offline preview and Vite HMR.
// No tool package/build-ready access and no compilation or platform writes.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve, join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {PAGE_FRAMEWORK_RUNTIMES,PAGE_FRAMEWORK_IMPORTS} from '../../../../src/libs/page-frameworks/contract.js';

const repo = fileURLToPath(new URL('../../../../', import.meta.url));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const same = (bytes, row) => row?.sha256 === sha(bytes) && row?.bytes === Buffer.byteLength(bytes);
const fail = message => {throw Error('E_SCRAPYJS_PREVIEW: ' + message);};

/** record(absolutePath) returns file bytes; callers may also record SHA evidence. */
export async function loadPreviewRuntime({
  runtimeDir = join(repo, 'artifacts/scrapyjs/original-sites-20261029/browser-source/dist/development'),
  runtimeReceipt = join(repo, 'artifacts/scrapyjs/original-sites-20261029/snapshot-receipt.json'),
  record = readFile, compilePreview = false
} = {}) {
  if(compilePreview)return compileCurrentPreviewRuntime(record);
  // A verified snapshot retains the failed normal build history. Its linked
  // diagnostic supplies compilation evidence; the later package report supplies
  // verification evidence. Neither is relabelled as a passed WXT build.
  const receiptPath = resolve(runtimeReceipt);
  const receipt = JSON.parse(await record(receiptPath));
  const snapshotVerified = receipt.status === 'COMPILED_AND_PACKAGE_VERIFIED';
  if ((!snapshotVerified && receipt.status !== 'passed') || !Array.isArray(receipt.sourceInputs))
    fail('Shared UI requires a passed build or a compiled/package-verified snapshot');
  let compilation = receipt, verification = receipt.report;
  let runtimeEvidence = {receiptStatus: receipt.status, wxtPassed: receipt.status === 'passed'};
  if (snapshotVerified) {
    if (typeof receipt.normalBuildDiagnostic !== 'string' || typeof receipt.packageVerification !== 'string' ||
        typeof receipt.snapshot !== 'string' || !receipt.verifierRepair?.path || !receipt.verifierRepair?.sha256 ||
        typeof receipt.normalBuildCommand !== 'string' || !receipt.normalBuildCommand.startsWith('FAILED'))
      fail('verified snapshot is missing its normal-build failure/repair history');
    compilation = JSON.parse(await record(resolve(dirname(receiptPath), receipt.normalBuildDiagnostic)));
    verification = JSON.parse(await record(resolve(dirname(receiptPath), receipt.packageVerification)));
    if (compilation.status !== 'failed' || verification.status !== 'passed' ||
        !/^[0-9a-f]{64}$/.test(receipt.packageHash) || verification.packageHash !== receipt.packageHash)
      fail('snapshot diagnostic/package verification does not match its recorded states');
    const repair = await record(resolve(dirname(receiptPath), receipt.snapshot, receipt.verifierRepair.path));
    if (sha(repair) !== receipt.verifierRepair.sha256) fail('snapshot verifier repair source drift');
    runtimeEvidence = {...runtimeEvidence, compiledAndPackageVerified: true,
      normalBuildCommand: receipt.normalBuildCommand, normalBuildDiagnostic: receipt.normalBuildDiagnostic,
      diagnosticStatus: compilation.status, verifierRepair: receipt.verifierRepair,
      packageVerification: receipt.packageVerification, packageVerificationStatus: verification.status,
      packageHash: receipt.packageHash, productionAcceptance: receipt.productionAcceptance};
  }
  const shared = await record(join(resolve(runtimeDir), 'sidebar-shared-ui.js'));
  const graph = compilation.bundleModules?.find(row => row.target === 'sidebar-shared-ui.js');
  const output = verification?.files?.find(row => row.path === 'sidebar-shared-ui.js');
  if (!same(shared, graph) || !same(shared, output) || !graph.modules?.length)
    fail('Shared UI bytes do not match compilation and package evidence; supply matching --runtime-dir/--runtime-receipt');
  const localModules = graph.modules.map(row => row.path.split('?')[0]).filter(path => path.startsWith('src/'));
  if (!localModules.includes('src/entrypoints/sidebar-shared-ui.js')) fail('Shared UI entry missing from module evidence');
  // Only actual Shared UI source inputs matter here, not unrelated framework
  // modules, an unrelated config comment, or the rest of the snapshot inventory.
  for (const name of new Set(localModules)) {
    const expected = receipt.sourceInputs.find(row => row.path === name);
    if (!same(await record(join(repo, name)), expected)) fail('stale Shared UI source: ' + name);
  }
  const reactContract = PAGE_FRAMEWORK_RUNTIMES.react;
  if (reactContract.version !== '19.2.0') fail('preview requires pinned React 19.2.0');
  const react = await record(join(repo, reactContract.source));
  if (!same(react, reactContract)) fail('React runtime differs from fixed registry SHA');
  await record(join(repo, 'src/libs/page-frameworks/contract.js'));
  return {react, shared, provenance: {...runtimeEvidence, reactVersion: reactContract.version}};
}

// Explicit preview-only fallback when this Mac has no historical Browser build
// attachment. Compile the SAME fixed Shared UI entry; never claim WXT/package PASS.
async function compileCurrentPreviewRuntime(record){
  const {build}=await import('esbuild');
  const entry=join(repo,'src/entrypoints/sidebar-shared-ui.js');
  const inputs={};
  const result=await build({entryPoints:[entry],bundle:true,write:false,minify:true,
    format:'iife',platform:'browser',target:'es2022',jsx:'automatic',metafile:true,
    plugins:[{name:'preview-fixed-runtime-adapter',setup(builder){
      builder.onResolve({filter:/^wxt\/utils\/define-unlisted-script$/},()=>({path:'wxt-preview-entry',namespace:'preview-runtime'}));
      builder.onResolve({filter:/^react(?:\/jsx-runtime)?$/},args=>({path:args.path,namespace:'preview-runtime'}));
      builder.onLoad({filter:/.*/,namespace:'preview-runtime'},args=>({contents:args.path==='wxt-preview-entry'?
        'export const defineUnlistedScript=initialize=>initialize();':
        'const value=globalThis.OpenDeskPageReact;export default value;export const {'+PAGE_FRAMEWORK_IMPORTS.react[args.path].join(',')+'}=value;',loader:'js'}));
      builder.onResolve({filter:/\.css\?raw$/},args=>({path:resolve(args.resolveDir,args.path.slice(0,-4)),namespace:'preview-css'}));
      builder.onLoad({filter:/.*/,namespace:'preview-css'},async args=>{
        const data=await record(args.path);inputs[args.path]={bytes:data.length,sha256:sha(data)};
        return {contents:'export default '+JSON.stringify(data.toString()),loader:'js'};
      });
    }}]});
  for(const name of Object.keys(result.metafile.inputs))if(!name.startsWith('preview-')){
    const file=resolve(repo,name),data=await record(file);inputs[file]={bytes:data.length,sha256:sha(data)};
  }
  const contract=PAGE_FRAMEWORK_RUNTIMES.react,react=await record(join(repo,contract.source));
  if(!same(react,contract))fail('React runtime differs from fixed registry SHA');
  return {react,shared:Buffer.from(result.outputFiles[0].contents),provenance:{
    receiptStatus:'PREVIEW_COMPONENTS_COMPILED',wxtPassed:false,publishedRuntime:'NOT_TESTED',
    reactVersion:contract.version,sourceEntry:'src/entrypoints/sidebar-shared-ui.js',inputs}};
}
