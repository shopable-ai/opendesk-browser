// Build-only report for every WXT fixed entry. Never import from an extension runtime.
// A receipt without the matching physical files is NOT an acceptance measurement.
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {basename, dirname, join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {PACKAGE_ENTRIES, BUILD_POLICY, RESOURCE_LIMITS, entryByteBudget} from './build-contract.mjs';
import {assertLibraryModuleBoundary} from './bundle-provenance.mjs';
import {BUILTIN_CATALOG} from '../src/libs/catalog.js';
import {verifyPackage} from './verify-package.mjs';

export const FIXED_ENTRY_PATHS = Object.freeze(Object.keys(PACKAGE_ENTRIES).map(name => name + '.js').sort());
const SHA256 = /^[0-9a-f]{64}$/;
const byteHash = bytes => createHash('sha256').update(bytes).digest('hex');
const compare = (a,b) => JSON.stringify(a) === JSON.stringify(b);

export function summarizeFixedEntries(receipt, measuredFiles) {
  if(receipt?.mode!=='production')throw Error('A passed production build receipt with Rollup module evidence is required');
  return summarizeGeneratedEntries(receipt,measuredFiles);
}
function summarizeGeneratedEntries(receipt,measuredFiles) {
  if (!['production','development'].includes(receipt?.mode) || receipt.status !== 'passed' ||
      !Array.isArray(receipt.bundleModules) || !Array.isArray(receipt.report?.files) ||
      typeof receipt.report.packageHash !== 'string') {
    throw Error('A passed production build receipt with Rollup module evidence is required');
  }
  const targets = receipt.bundleModules.map(item => item.target).sort();
  if (!compare(targets, FIXED_ENTRY_PATHS)) throw Error('Fixed entry module evidence is missing, duplicated or unexpected');
  if (!measuredFiles || !compare(Object.keys(measuredFiles).sort(), FIXED_ENTRY_PATHS))
    throw Error('Every fixed entry must be physically measured from the matching output directory');
  const reportRows = new Map();
  for (const file of receipt.report.files) {
    if (typeof file.path !== 'string' || reportRows.has(file.path)) throw Error('Duplicate or invalid package path');
    reportRows.set(file.path, file);
  }
  const entries = receipt.bundleModules.map(row => {
    const budget=entryByteBudget(row.target,receipt.mode);
    const recorded = reportRows.get(row.target), physical = measuredFiles[row.target];
    if (!recorded || !Number.isSafeInteger(recorded.bytes) || recorded.bytes <= 0 ||
        !SHA256.test(recorded.sha256 || '') || !Number.isSafeInteger(row.bytes) ||
        row.bytes !== recorded.bytes || row.sha256 !== recorded.sha256 ||
        !physical || physical.bytes !== recorded.bytes || physical.sha256 !== recorded.sha256) {
      throw Error('Physical file / production receipt size or hash mismatch: ' + row.target);
    }
    if (!Array.isArray(row.modules) || !row.modules.length) throw Error('Missing module graph: ' + row.target);
    const paths = new Set();
    for (const module of row.modules) {
      if (typeof module.path !== 'string' || !module.path || paths.has(module.path) ||
          !Number.isSafeInteger(module.renderedLength) || module.renderedLength < 0 ||
          !Number.isSafeInteger(module.originalLength) || module.originalLength < 0) {
        throw Error('Invalid or duplicate Rollup module attribution: ' + row.target);
      }
      paths.add(module.path);
      assertLibraryModuleBoundary(row.target,module.path,module.npm?.name);
    }
    if (recorded.bytes > budget) throw Error('Fixed entry exceeds configured byte budget: ' + row.target);
    const reviewThresholdBytes=row.target==='sw.js'&&receipt.mode==='production'?BUILD_POLICY.serviceWorkerReviewBytes:null;
    const ratio = recorded.bytes / budget;
    return {
      path: row.target, bytes: recorded.bytes, sha256: recorded.sha256,
      budgetBytes: budget, remainingBytes: budget - recorded.bytes,
      reviewThresholdBytes, requiresSizeReview: reviewThresholdBytes!==null && recorded.bytes>=reviewThresholdBytes,
      usagePercent: Math.round(ratio * 10000) / 100,
      risk: ratio >= 0.9 ? 'critical' : ratio >= 0.8 ? 'watch' : 'normal',
      designReserveDebtBytes: Math.max(0, recorded.bytes - Math.floor(budget * 0.8)),
      moduleCount: row.modules.length,
      topModulesPreMinify: row.modules.slice().sort((a,b) => b.renderedLength - a.renderedLength)
        .slice(0, 5).map(module => ({path:module.path, renderedLength:module.renderedLength}))
    };
  }).sort((a,b) => b.bytes - a.bytes || a.path.localeCompare(b.path));
  return {
    kind: 'physical-verified-fixed-entry-budget', mode: receipt.mode,
    packageHash: receipt.report.packageHash,
    budgetSource: 'scripts/build-contract.mjs',
    productionBudgetBytes: BUILD_POLICY.productionBytes,
    serviceWorkerProductionBudgetBytes: BUILD_POLICY.serviceWorkerProductionBytes,
    serviceWorkerDevelopmentBudgetBytes: BUILD_POLICY.developmentBytes,
    serviceWorkerReviewBytes: BUILD_POLICY.serviceWorkerReviewBytes,
    policy: {watchAtPercent:80, criticalAtPercent:90, designReservePercent:20},
    attributionNote: 'renderedLength is PRE-minification Rollup length, NOT compressed bytes.',
    fixedEntryCount: entries.length,
    totalFixedJsBytes: entries.reduce((sum,row) => sum + row.bytes,0),
    critical: entries.filter(row => row.risk === 'critical').map(row => row.path),
    watch: entries.filter(row => row.risk === 'watch').map(row => row.path),
    reviewRequired: entries.filter(row => row.requiresSizeReview).map(row => row.path),
    entries
  };
}

function resourceKind(path) {
  if(FIXED_ENTRY_PATHS.includes(path))return 'generated-js';
  if(path.startsWith('libs/vendor/')&&path.endsWith('.js'))return 'raw-vendor-js';
  if(path.endsWith('.js'))return 'raw-runtime-js';
  if(path.endsWith('.map'))return 'source-map';
  if(path.startsWith('licenses/'))return 'license';
  if(path.endsWith('.html'))return 'html';
  if(path.endsWith('.css'))return 'css';
  return 'static-resource';
}

export function summarizePackageResources(receipt,measuredFiles) {
  const files=receipt?.report?.files;
  if(!Array.isArray(files)||!measuredFiles||
     !compare(files.map(row=>row.path).sort(),Object.keys(measuredFiles).sort()))
    throw Error('Every package resource must be physically measured');
  for(const row of files)if(!Number.isSafeInteger(row.bytes)||row.bytes<1||!SHA256.test(row.sha256||'')||
    row.bytes!==measuredFiles[row.path]?.bytes||row.sha256!==measuredFiles[row.path]?.sha256)
    throw Error('Physical package resource size/hash mismatch: '+row.path);
  const fixed=summarizeGeneratedEntries(receipt,Object.fromEntries(FIXED_ENTRY_PATHS.map(path=>[path,measuredFiles[path]])));
  const byPath=new Map(fixed.entries.map(row=>[row.path,row]));
  const resources=files.map(file=>{
    const kind=resourceKind(file.path),generated=byPath.get(file.path);
    const budget=generated?.budgetBytes??(kind==='raw-vendor-js'?RESOURCE_LIMITS.vendorBytes:
      kind==='raw-runtime-js'?BUILD_POLICY.productionBytes:kind==='license'?RESOURCE_LIMITS.licenseBytes:
      ['libs/manifest.json','framework/sdk-resources.json'].includes(file.path)?RESOURCE_LIMITS.manifestBytes:null);
    if(budget!==null&&file.bytes>budget)throw Error('Package resource exceeds byte budget: '+file.path);
    const ratio=budget===null?null:file.bytes/budget;
    return {...file,kind,budgetBytes:budget,remainingBytes:budget===null?null:budget-file.bytes,
      risk:ratio===null?'unbudgeted':ratio>=0.9?'critical':ratio>=0.8?'watch':'normal',
      reviewThresholdBytes:generated?.reviewThresholdBytes??null,
      requiresSizeReview:generated?.requiresSizeReview??false};
  }).sort((a,b)=>b.bytes-a.bytes||a.path.localeCompare(b.path));
  function group(id,paths,{assembled=false}={}) {
    if(new Set(paths).size!==paths.length)throw Error('Duplicate resource in loading group: '+id);
    const rows=paths.map(path=>{
      const row=measuredFiles[path];if(!row)throw Error('Missing loading-group resource: '+path);
      return {path,...row};
    });
    const bytes=rows.reduce((sum,row)=>sum+row.bytes,0);
    return {id,bytes,resources:rows,...(assembled?{assembledBytes:bytes+3*(paths.length-1)}:{})};
  }
  const libs=Object.values(BUILTIN_CATALOG.libraries);
  const libraryPaths=world=>[BUILTIN_CATALOG.bootstrap,
    ...libs.filter(row=>row.default&&row.worlds.includes(world)).map(row=>row.output),
    world==='CONTROLLER'?BUILTIN_CATALOG.controllerCore:BUILTIN_CATALOG.pageCore];
  const groups=[
    group('background-startup',['sw.js','native-agent/transport.js']),
    group('controller-default-libraries',libraryPaths('CONTROLLER'),{assembled:true}),
    group('page-default-libraries',libraryPaths('USER_SCRIPT'),{assembled:true}),
    group('page-with-jquery',[...libraryPaths('USER_SCRIPT'),BUILTIN_CATALOG.libraries.jquery.output]),
    group('automatic-page-injection',['agents/page-relay.js','framework/sdk-main.js']),
    group('sidebar-shell',['ui/tool.html','ui/tool-shell.css','ui/tool-shell.js']),
    group('workspace-shell',['native-agent/workspace.html','native-agent/workspace.css','native-agent/settings.js'])
  ];
  const sum=predicate=>resources.filter(predicate).reduce((n,row)=>n+row.bytes,0);
  return {...fixed,kind:'physical-verified-package-capacity',resources,loadingGroups:groups,
    totalPackageBytes:sum(()=>true),totalExecutableJsBytes:sum(row=>row.path.endsWith('.js')),
    sourceMapBytes:sum(row=>row.kind==='source-map'),
    loadingGroupNote:'Known package resource sets, not measured execution time or memory. Groups overlap and must not be summed. Library totals exclude user code, evaluation wrappers and optional dependencies; assembledBytes includes loader separators.',
    unbudgetedResources:resources.filter(row=>row.budgetBytes===null).map(row=>row.path)};
}

async function readCurrentReceipt(receiptPath,mode) {
  let latest;
  try{latest=JSON.parse(await readFile(join(dirname(receiptPath),`build-${mode}-latest.json`),'utf8'));}
  catch(error){if(error.code!=='ENOENT')throw error;}
  if(latest!==undefined&&latest?.status!=='passed')
    throw Error(`The latest ${mode} build is ${latest?.status||'invalid'}; inspect ${latest?.diagnostic||'the build log'}`);
  const receipt=JSON.parse(await readFile(receiptPath,'utf8'));
  if(receipt.mode!==mode)throw Error('Receipt mode does not match requested package');
  if(receipt.attemptId&&!latest)throw Error('Current build receipt is missing its completion marker');
  if(latest&&(typeof latest.receipt!=='string'||basename(latest.receipt)!==basename(receiptPath)||
      latest.packageHash!==receipt.report?.packageHash||latest.mode!==undefined&&latest.mode!==mode||
      receipt.attemptId&&(latest.attemptId!==receipt.attemptId||latest.mode!==mode)))
    throw Error('Build completion marker does not match receipt identity');
  // Historical receipts predate markers. Their physical files/hashes are still
  // required; their age or a different source HEAD is not itself a failure.
  return receipt;
}

export async function measurePackageResources({mode='production',outputRoot='dist/'+mode,
  receiptPath=(process.env.OPENDESK_BUILD_EVIDENCE_DIR||'docs/framework/evidence/wxt/builds')+'/build-'+mode+'.json'}={}) {
  const receipt=await readCurrentReceipt(receiptPath,mode);
  const measured=await verifyPackage(outputRoot,{mode});
  if(measured.packageHash!==receipt.report?.packageHash||!compare(measured.files,receipt.report.files))
    throw Error('Physical package does not match build receipt');
  return summarizePackageResources(receipt,Object.fromEntries(measured.files.map(({path,...row})=>[path,row])));
}

export async function measureFixedEntries({outputRoot = 'dist/production',
  receiptPath = (process.env.OPENDESK_BUILD_EVIDENCE_DIR||'docs/framework/evidence/wxt/builds')+'/build-production.json'} = {}) {
  const receipt = await readCurrentReceipt(receiptPath,'production');
  const measured = {};
  for (const path of FIXED_ENTRY_PATHS) {
    const bytes = await readFile(join(outputRoot,path));
    measured[path] = {bytes:bytes.length,sha256:byteHash(bytes)};
  }
  return summarizeFixedEntries(receipt, measured);
}

async function main() {
  const full=process.argv.includes('--all'),mode=process.argv.includes('--development')?'development':'production';
  if(!full&&mode==='development')throw Error('--development requires --all');
  const output = process.argv.slice(2).find(value=>!value.startsWith('--')) ||
    (full?`artifacts/package-size-${mode}.json`:'artifacts/fixed-entry-budget.json');
  const report = full?await measurePackageResources({mode}):await measureFixedEntries();
  await mkdir(dirname(resolve(output)), {recursive:true});
  await writeFile(output, JSON.stringify(report,null,2) + '\n');
  for (const row of report.entries) {
    console.log('FIXED_ENTRY ' + row.risk.toUpperCase() + ' ' + row.path + ': ' +
      row.bytes + '/' + row.budgetBytes + ' bytes; remaining=' + row.remainingBytes +
      '; modules=' + row.moduleCount);
  }
  console.log('FIXED_ENTRIES_VERIFIED=' + report.fixedEntryCount +
    ' PACKAGE_HASH=' + report.packageHash);
  if (report.critical.length) console.warn('ARCHITECTURE_DEBT critical entries: ' + report.critical.join(', '));
  for(const path of report.reviewRequired){
    const row=report.entries.find(item=>item.path===path);
    console.warn('SIZE_REVIEW_REQUIRED '+path+': '+row.bytes+' >= '+row.reviewThresholdBytes+
      ' bytes; still below hard cap '+row.budgetBytes+' bytes');
  }
  if(full){
    for(const row of report.resources)console.log('RESOURCE '+row.kind+' '+row.path+': '+row.bytes+' bytes'+
      (row.budgetBytes===null?'; no hard budget':'; remaining='+row.remainingBytes));
    for(const row of report.loadingGroups)console.log('LOADING_GROUP '+row.id+': '+row.bytes+' bytes');
    console.log('PACKAGE_BYTES='+report.totalPackageBytes+' EXECUTABLE_JS_BYTES='+report.totalExecutableJsBytes+' SOURCE_MAP_BYTES='+report.sourceMapBytes);
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().catch(error => {console.error(error);process.exitCode = 1;});
