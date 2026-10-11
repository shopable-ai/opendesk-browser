import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {BUILD_POLICY} from '../../scripts/build-contract.mjs';
import {FIXED_ENTRY_PATHS,summarizeFixedEntries,summarizePackageResources,measureFixedEntries,measurePackageResources} from '../../scripts/audit-fixed-entries.mjs';
import {BUILTIN_CATALOG} from '../../src/libs/catalog.js';
import {PAGE_FRAMEWORK_RUNTIMES,PAGE_FRAMEWORK_RESOURCE_LIMIT} from '../../src/libs/page-frameworks/contract.js';
const digest = 'a'.repeat(64);
const fixture = () => {
  const measured = {},bundleModules = [],files = [];
  for (const path of FIXED_ENTRY_PATHS) {
    const bytes = path === 'sw.js' ? 326907 : path === 'ui/tool-shell.js' ? 311536 : 1234;
    measured[path] = {bytes,sha256:digest};
    files.push({path,bytes,sha256:digest});
    bundleModules.push({target:path,bytes,sha256:digest,modules:[
      {path:'src/libs/runtime-contract.js',originalLength:100,renderedLength:70}
    ]});
  }
  return {measured,receipt:{mode:'production',status:'passed',report:{packageHash:digest,files},bundleModules}};
};
test('all approved fixed entries use actual minified byte counts and retain a non-blocking margin signal',()=>{
  const {receipt,measured} = fixture();
  const summary = summarizeFixedEntries(receipt,measured);
  assert.equal(summary.fixedEntryCount,FIXED_ENTRY_PATHS.length);
  assert.equal(summary.productionBudgetBytes,512 * 1024);
  assert.equal(summary.fixedEntryReviewBytes,320 * 1024);
  assert.deepEqual(summary.critical,[]);
  assert.deepEqual(summary.reviewRequired,[]);
  assert.equal(summary.serviceWorkerProductionBudgetBytes,1024*1024);
  assert.equal(summary.serviceWorkerReviewBytes,512*1024);
  assert.equal(summary.entries[0].remainingBytes,1024*1024-326907);
  assert.equal(summary.entries[0].risk,'normal');
  assert.equal(summary.entries[0].requiresSizeReview,false);
  assert.match(summary.attributionNote,/PRE-minification/);
});
function packageFixture(){
  const f=fixture();
  for(const path of [BUILTIN_CATALOG.bootstrap,...Object.values(BUILTIN_CATALOG.libraries).filter(row=>row.origin==='vendor').map(row=>row.output),
    ...Object.values(PAGE_FRAMEWORK_RUNTIMES).map(row=>row.output),
    'ui/tool.html','ui/tool-shell.css','native-agent/workspace.html','native-agent/workspace.css']){
    f.measured[path]={bytes:1000,sha256:digest};f.receipt.report.files.push({path,...f.measured[path]});
  }
  return f;
}
test('full inventory includes raw and static assets and sums the actual runtime resource sets',()=>{
  const f=packageFixture(),report=summarizePackageResources(f.receipt,f.measured);
  assert.equal(report.resources.length,Object.keys(f.measured).length);
  const sum=paths=>paths.reduce((n,path)=>n+f.measured[path].bytes,0);
  assert.equal(report.loadingGroups.find(row=>row.id==='background-startup').bytes,sum(['sw.js','sidebar-tools/preinstall-intent.js','agents/health-host.js','native-agent/transport.js','knowledge/knowledge-host.js','cloud-control/cloud-host.js','time-review/time-review-host.js','platform/context-menus.js']));
  const controller=report.loadingGroups.find(row=>row.id==='controller-default-libraries');
  assert.equal(controller.resources.length,5);
  assert.equal(controller.bytes,sum(controller.resources.map(row=>row.path)));
  assert.equal(controller.assembledBytes,controller.bytes+12);
  assert.equal(report.totalExecutableJsBytes,sum(Object.keys(f.measured).filter(path=>path.endsWith('.js'))));
  assert(report.unbudgetedResources.includes('ui/tool-shell.css'),'do not invent a CSS hard limit');
  const plan=report.runtimeResourcePlan,defaults=report.loadingGroups.find(row=>row.id==='page-default-libraries');
  assert.equal(plan.shipping,'extension-local-fixed-resources');
  assert.equal(plan.packageBytesIncludeDormantAssets,true);
  assert.equal(plan.optInSelection,'one-explicit-declaration-per-page-program');
  assert.deepEqual(plan.defaultPageResources,defaults.resources.map(row=>row.path));
  assert.equal(plan.onDemandPageAssets.length,
    Object.values(BUILTIN_CATALOG.libraries).filter(row=>!row.default).length+
      Object.keys(PAGE_FRAMEWORK_RUNTIMES).length);
  assert(plan.onDemandPageAssets.some(row=>row.id==='cheerio'&&row.kind==='library'));
  assert(plan.onDemandPageAssets.some(row=>row.id==='react'&&row.kind==='framework'));
  const startup=new Set(plan.backgroundStartupResources);
  for(const opt of plan.onDemandPageAssets){
    assert.equal(startup.has(opt.path),false,'optional Page library must not start with SW');
    assert.equal(plan.defaultPageResources.includes(opt.path),false,'optional library is not default');
    const picked=report.loadingGroups.find(row=>row.id===opt.groupId);
    assert(picked,'Every optional asset must have a measured single-selection scenario');
    assert.equal(picked.bytes,defaults.bytes+opt.bytes);
    assert.equal(picked.assembledBytes,picked.bytes+3*defaults.resources.length);
    assert.equal(opt.runtimeRemainingBytes,opt.runtimeBudgetBytes-opt.bytes);
    assert.equal(opt.runtimeBudgetBytes,opt.kind==='framework'?PAGE_FRAMEWORK_RESOURCE_LIMIT:
      opt.id==='jquery'?128*1024:BUILD_POLICY.productionBytes);
  }
  assert.equal(plan.onDemandPageAssetBytes,plan.onDemandPageAssets.reduce((n,row)=>n+row.bytes,0));

});
test('full inventory catches oversize raw code and missing or mismatched resources',()=>{
  const f=packageFixture(),path=BUILTIN_CATALOG.libraries.jquery.output;
  f.measured[path].bytes=128*1024+1;f.receipt.report.files.find(row=>row.path===path).bytes=f.measured[path].bytes;
  assert.throws(()=>summarizePackageResources(f.receipt,f.measured),/exceeds byte budget/);
  const frameworkOver=packageFixture(),react=PAGE_FRAMEWORK_RUNTIMES.react.output;
  frameworkOver.measured[react].bytes=PAGE_FRAMEWORK_RESOURCE_LIMIT+1;
  frameworkOver.receipt.report.files.find(row=>row.path===react).bytes=PAGE_FRAMEWORK_RESOURCE_LIMIT+1;
  assert.throws(()=>summarizePackageResources(frameworkOver.receipt,frameworkOver.measured),
    /Package resource exceeds byte budget: libs\/page-frameworks\/react/,
    'raw framework runtime cannot pass the generic 512 KiB budget while failing its 256 KiB loader');
  const missing=packageFixture();delete missing.measured['ui/tool.html'];
  assert.throws(()=>summarizePackageResources(missing.receipt,missing.measured),/physically measured/);
  const mismatch=packageFixture();mismatch.measured['ui/tool.html'].sha256='b'.repeat(64);
  assert.throws(()=>summarizePackageResources(mismatch.receipt,mismatch.measured),/size\/hash mismatch/);
});
test('SW review at 512 KiB is non-blocking and 1 MiB hard cap blocks +1 byte',()=>{
  const f=fixture(),sw=f.receipt.bundleModules.find(row=>row.target==='sw.js');
  const setBytes=bytes=>{
    sw.bytes=bytes;f.measured['sw.js'].bytes=bytes;
    f.receipt.report.files.find(row=>row.path==='sw.js').bytes=bytes;
  };
  setBytes(BUILD_POLICY.serviceWorkerReviewBytes-1);
  assert.deepEqual(summarizeFixedEntries(f.receipt,f.measured).reviewRequired,[]);
  setBytes(BUILD_POLICY.serviceWorkerReviewBytes);
  assert.deepEqual(summarizeFixedEntries(f.receipt,f.measured).reviewRequired,['sw.js']);
  assert.equal(summarizeFixedEntries(f.receipt,f.measured).entries.find(row=>row.path==='sw.js').remainingBytes,
    BUILD_POLICY.serviceWorkerProductionBytes-BUILD_POLICY.serviceWorkerReviewBytes);
  setBytes(BUILD_POLICY.serviceWorkerProductionBytes);
  assert.equal(summarizeFixedEntries(f.receipt,f.measured).entries.find(row=>row.path==='sw.js').remainingBytes,0);
  setBytes(BUILD_POLICY.serviceWorkerProductionBytes+1);
  assert.throws(()=>summarizeFixedEntries(f.receipt,f.measured),/exceeds configured/);
});
test('Sidebar and other generated scripts may cross 320 KiB, but 512 KiB remains a strict limit',()=>{
  const f=fixture(),path='ui/tool-shell.js',row=f.receipt.bundleModules.find(item=>item.target===path);
  const setBytes=bytes=>{
    row.bytes=bytes;f.measured[path].bytes=bytes;
    f.receipt.report.files.find(item=>item.path===path).bytes=bytes;
  };
  setBytes(BUILD_POLICY.fixedEntryReviewBytes-1);
  assert.deepEqual(summarizeFixedEntries(f.receipt,f.measured).reviewRequired,[]);
  setBytes(BUILD_POLICY.fixedEntryReviewBytes+1);
  let report=summarizeFixedEntries(f.receipt,f.measured);
  assert.deepEqual(report.reviewRequired,[path]);
  assert.equal(report.entries.find(item=>item.path===path).risk,'normal');
  setBytes(BUILD_POLICY.productionBytes);
  report=summarizeFixedEntries(f.receipt,f.measured);
  assert.equal(report.entries.find(item=>item.path===path).remainingBytes,0);
  setBytes(BUILD_POLICY.productionBytes+1);
  assert.throws(()=>summarizeFixedEntries(f.receipt,f.measured),/exceeds configured/);
});
test('development distinguishes SW budget and source maps from executable code',()=>{
  const f=packageFixture();f.receipt.mode='development';
  f.measured['sw.js'].bytes=400000;
  f.receipt.report.files.find(row=>row.path==='sw.js').bytes=400000;
  f.receipt.bundleModules.find(row=>row.target==='sw.js').bytes=400000;
  f.measured['sw.js.map']={bytes:500000,sha256:digest};
  f.receipt.report.files.push({path:'sw.js.map',...f.measured['sw.js.map']});
  const report=summarizePackageResources(f.receipt,f.measured);
  assert.equal(report.entries.find(row=>row.path==='sw.js').budgetBytes,1536*1024);
  assert.equal(report.entries.find(row=>row.path==='ui/tool-shell.js').budgetBytes,512*1024);
  assert.equal(report.sourceMapBytes,500000);
});
test('fails closed on missing, duplicated, unmeasured or mismatched fixed entries',()=>{
  const {receipt,measured} = fixture();
  delete measured['sw.js'];
  assert.throws(()=>summarizeFixedEntries(receipt,measured),/physically measured/);
  const good = fixture();
  good.receipt.bundleModules[0].sha256='b'.repeat(64);
  assert.throws(()=>summarizeFixedEntries(good.receipt,good.measured),/mismatch/);
  const duplicate = fixture();
  duplicate.receipt.bundleModules.push(duplicate.receipt.bundleModules[0]);
  assert.throws(()=>summarizeFixedEntries(duplicate.receipt,duplicate.measured),/missing, duplicated/);
});
test('does not allow lodash-es/dayjs implementation into privileged SW',()=>{
  for (const path of ['node_modules/lodash-es/get.js','node_modules/dayjs/dayjs.min.js','src/libs/core.js']) {
    const {receipt,measured}=fixture();
    receipt.bundleModules.find(row=>row.target==='sw.js').modules[0].path=path;
    assert.throws(()=>summarizeFixedEntries(receipt,measured),/implementation unexpectedly bundled/);
  }
});
test('build budget and receipt freshness failures remain hard blockers',()=>{
  const {receipt,measured}=fixture();
  receipt.mode='development';
  assert.throws(()=>summarizeFixedEntries(receipt,measured),/passed production/);
  const enlarged=fixture(), sw=enlarged.receipt.bundleModules.find(row=>row.target==='sw.js');
  sw.bytes=BUILD_POLICY.serviceWorkerProductionBytes+1;
  enlarged.measured['sw.js'].bytes=sw.bytes;
  enlarged.receipt.report.files.find(row=>row.path==='sw.js').bytes=sw.bytes;
  assert.throws(()=>summarizeFixedEntries(enlarged.receipt,enlarged.measured),/exceeds configured/);
});
test('physical measurements reject incomplete or mismatched attempts and retain portable historical receipts',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'opendesk-measure-freshness-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  const outputRoot=join(directory,'output'),receiptPath=join(directory,'build-production.json');
  const markerPath=join(directory,'build-production-latest.json'),f=fixture();
  for(const path of FIXED_ENTRY_PATHS) {
    const bytes=Buffer.from('var fixture=function(){}();\n');
    const physical={bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
    Object.assign(f.receipt.report.files.find(row=>row.path===path),physical);
    Object.assign(f.receipt.bundleModules.find(row=>row.target===path),physical);
    await mkdir(dirname(join(outputRoot,path)),{recursive:true});await writeFile(join(outputRoot,path),bytes);
  }
  const writeReceipt=()=>writeFile(receiptPath,JSON.stringify(f.receipt));
  await writeReceipt();
  assert.equal((await measureFixedEntries({outputRoot,receiptPath})).fixedEntryCount,FIXED_ENTRY_PATHS.length);
  f.receipt.attemptId='completed-attempt';await writeReceipt();
  await assert.rejects(measureFixedEntries({outputRoot,receiptPath}),/missing its completion marker/);
  const good={status:'passed',mode:'production',attemptId:f.receipt.attemptId,
    receipt:'build-production.json',packageHash:f.receipt.report.packageHash};
  for(const status of ['in_progress','failed','unexpected']) {
    await writeFile(markerPath,JSON.stringify({...good,status}));
    await assert.rejects(measureFixedEntries({outputRoot,receiptPath}),/latest production build is/);
    await assert.rejects(measurePackageResources({outputRoot,receiptPath}),/latest production build is/);
  }
  for(const change of [{mode:'development'},{attemptId:'previous-attempt'},
    {packageHash:'b'.repeat(64)},{receipt:'other-build.json'}]) {
    await writeFile(markerPath,JSON.stringify({...good,...change}));
    await assert.rejects(measureFixedEntries({outputRoot,receiptPath}),/does not match receipt identity/);
  }
  await writeFile(markerPath,JSON.stringify({...good,receipt:'/previous-machine/evidence/build-production.json'}));
  assert.equal((await measureFixedEntries({outputRoot,receiptPath})).fixedEntryCount,FIXED_ENTRY_PATHS.length);
});
