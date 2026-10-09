import {readFile, writeFile, mkdir, copyFile, chmod, rename, readdir} from 'node:fs/promises';
import {resolve, dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {filesAt, packageFingerprint} from './verify-package.mjs';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const ledger = 'docs/framework/source-compatibility-ledger.json';
export async function inputIdentity() {
  const state = JSON.parse(await readFile('docs/framework/wxt-progress.json'));
  const baseline = JSON.parse(await readFile(`${state.baselinePath}/manifest.json`));
  const productPaths = new Set(baseline.productInputs.map(row => row.path));
  for (const root of ['src','scripts']) for (const path of await filesAt(root)) productPaths.add(`${root}/${path}`);
  productPaths.add('wxt.config.mjs');
  const testRuntimeDirectories = new Set(['.cache','evidence','node_modules','profiles','downloads','artifacts','results']);
  const historicalRuntimePath = path => path.startsWith('tests/') &&
    path.split('/').slice(1,-1).some(part => testRuntimeDirectories.has(part));
  const excludedHistoricalRuntimeInputs = baseline.verificationInputs
    .filter(row => historicalRuntimePath(row.path))
    .map(row => ({path:row.path, reason:'test-runtime-directory'}))
    .sort((a,b) => a.path.localeCompare(b.path));
  const verificationPaths = new Set(baseline.verificationInputs
    .filter(row => !historicalRuntimePath(row.path)).map(row => row.path));
  async function testFiles(prefix='') {
    const found=[];
    for (const entry of await readdir(`tests/${prefix}`,{withFileTypes:true})) {
      if (testRuntimeDirectories.has(entry.name)) continue;
      const path=prefix?`${prefix}/${entry.name}`:entry.name;
      if (entry.isDirectory()) found.push(...await testFiles(path));
      else if (entry.isFile()) found.push(path);
      else throw new Error(`Unexpected verification input ${path}`);
    }
    return found;
  }
  for (const path of await testFiles())
    if (/\.(mjs|js|cjs|json|html|css|py|md|txt)$/.test(path)) verificationPaths.add(`tests/${path}`);
  for (const path of await filesAt('contracts/fixtures')) verificationPaths.add(`contracts/fixtures/${path}`);
  async function rows(paths) {
    return Promise.all([...paths].sort().map(async path => {
      const bytes = await readFile(path); return {path,bytes:bytes.length,sha256:sha(bytes)};
    }));
  }
  const productInputs = await rows(productPaths), verificationInputs = await rows(verificationPaths);
  return {productInputs,verificationInputs,excludedHistoricalRuntimeInputs,productInputsSha256:sha(JSON.stringify(productInputs)),
    verificationInputsSha256:sha(JSON.stringify(verificationInputs))};
}
export async function checkpoint({stepId,layer,nextAction,firstBlocker=null,evidencePaths=[]}) {
  const statePath = 'docs/framework/wxt-progress.json', state = JSON.parse(await readFile(statePath));
  const identity = await inputIdentity(), stamp = new Date().toISOString().replaceAll(':','-');
  const snapshotPath = `docs/framework/evidence/wxt/snapshots/${stamp}-${stepId}-${layer}`;
  const baseline = JSON.parse(await readFile(`${state.baselinePath}/manifest.json`));
  const old = new Map([...baseline.productInputs,...baseline.verificationInputs].map(row => [row.path,row]));
  const current = [...identity.productInputs,...identity.verificationInputs];
  const changedPaths = current.filter(row=>old.has(row.path) && old.get(row.path).sha256!==row.sha256).map(row=>row.path);
  const newPaths = current.filter(row=>!old.has(row.path)).map(row=>row.path);
  for (const row of current) {
    const dest = `${snapshotPath}/files/${row.path}`; await mkdir(dirname(dest),{recursive:true});
    await copyFile(row.path,dest);
    const readback=await readFile(dest);
    if (readback.length!==row.bytes || sha(readback)!==row.sha256) throw new Error(`Snapshot drift: ${row.path}`);
    await chmod(dest,0o444);
  }
  const packages={};
  for (const mode of ['production','development']) packages[mode]=await packageFingerprint(`dist/${mode}`);
  const zipHashes = Object.fromEntries(await Promise.all(['production','development'].map(async mode =>
    [mode,sha(await readFile(`artifacts/opendesk-browser-${mode}.zip`))])));
  const manifest={schemaVersion:1,stepId,layer,createdAt:new Date().toISOString(),ledger,...identity,changedPaths,newPaths,
    packageHashes:Object.fromEntries(Object.entries(packages).map(([mode,value])=>[mode,value.packageHash])),zipHashes};
  await writeFile(`${snapshotPath}/manifest.json`,JSON.stringify(manifest,null,2)+'\n');
  const manifestSha256=sha(await readFile(`${snapshotPath}/manifest.json`));
  await writeFile(`${snapshotPath}/manifest.sha256`,manifestSha256+'\n');
  await chmod(`${snapshotPath}/manifest.json`,0o444);
  Object.assign(state,{stepId,state:firstBlocker?'blocked':'in_progress',productInputsSha256:identity.productInputsSha256,
    verificationInputsSha256:identity.verificationInputsSha256,packageHashes:manifest.packageHashes,zipHashes,changedPaths,newPaths,
    firstBlocker,nextAction,updatedAt:manifest.createdAt,evidencePaths:[...new Set([...state.evidencePaths,...evidencePaths,snapshotPath])]});
  const snapshot={snapshotPath,manifestSha256,passedAtStep:state.lastPassedStep,layer};
  state.latestSnapshot=snapshot;
  if (layer.endsWith('_passed')) state.lastKnownGood=snapshot;
  const tmp=statePath+'.tmp'; await writeFile(tmp,JSON.stringify(state,null,2)+'\n'); await rename(tmp,statePath);
  return {snapshotPath,manifestSha256,productInputsSha256:identity.productInputsSha256,verificationInputsSha256:identity.verificationInputsSha256,packageHashes:manifest.packageHashes,zipHashes};
}
if (process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
  console.log(JSON.stringify(await checkpoint(JSON.parse(process.argv[2])),null,2));
