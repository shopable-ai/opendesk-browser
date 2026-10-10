import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {BUILD_POLICY} from '../../scripts/build-contract.mjs';
import {FIXED_ENTRY_PATHS,summarizeFixedEntries,summarizePackageResources,measureFixedEntries,measurePackageResources} from '../../scripts/audit-fixed-entries.mjs';
import {BUILTIN_CATALOG} from '../../src/libs/catalog.js';
const digest = 'a'.repeat(64);
const fixture = () => {
  const measured = {},bundleModules = [],files = [];
  for (const path of FIXED_ENTRY_PATHS) {
    const bytes = path === 'sw.js' ? 326907 : path === 'ui/tool-shell.js' ? 311536 : 1234;
    measured[path] = {bytes,sha256:digest};
    files.push({path,bytes,sha256:digest});
    bundleModules.push({target:path,bytes,sha256:digest,modules:[
      {path:'src/runtime/builtin-libraries/catalog.js',originalLength:100,renderedLength:70}
    ]});
  }
  return {measured,receipt:{mode:'production',status:'passed',report:{packageHash:digest,files},bundleModules}};
};
test('all approved fixed entries use actual minified byte counts and retain a non-blocking margin signal',()=>{
  const {receipt,measured} = fixture();
  const summary = summarizeFixedEntries(receipt,measured);
  assert.equal(summary.fixedEntryCount,FIXED_ENTRY_PATHS.length);
  assert.equal(summary.productionBudgetBytes,320 * 1024);
  assert.deepEqual(summary.critical,['ui/tool-shell.js']);
  assert.deepEqual(summary.reviewRequired,[]);
  assert.equal(summary.serviceWorkerProductionBudgetBytes,512*1024);
  assert.equal(summary.serviceWorkerReviewBytes,320*1024);
  assert.equal(summary.entries[0].remainingBytes,512*1024-326907);
  assert.equal(summary.entries[0].risk,'normal');
  assert.equal(summary.entries[0].requiresSizeReview,false);
  assert.match(summary.attributionNote,/PRE-minification/);
});
function packageFixture(){
  const f=fixture();
  for(const path of [BUILTIN_CATALOG.bootstrap,...Object.values(BUILTIN_CATALOG.libraries).filter(row=>row.origin==='vendor').map(row=>row.output),
    'ui/tool.html','ui/tool-shell.css','native-agent/workspace.html','native-agent/workspace.css']){
    f.measured[path]={bytes:1000,sha256:digest};f.receipt.report.files.push({path,...f.measured[path]});
  }
  return f;
}
test('full inventory includes raw and static assets and sums the actual runtime resource sets',()=>{
  const f=packageFixture(),report=summarizePackageResources(f.receipt,f.measured);
  assert.equal(report.resources.length,Object.keys(f.measured).length);
  const sum=paths=>paths.reduce((n,path)=>n+f.measured[path].bytes,0);
  assert.equal(report.loadingGroups.find(row=>row.id==='background-startup').bytes,sum(['sw.js','native-agent/transport.js']));
  const controller=report.loadingGroups.find(row=>row.id==='controller-default-libraries');
  assert.equal(controller.resources.length,5);
  assert.equal(controller.bytes,sum(controller.resources.map(row=>row.path)));
  assert.equal(controller.assembledBytes,controller.bytes+12);
  assert.equal(report.totalExecutableJsBytes,sum(Object.keys(f.measured).filter(path=>path.endsWith('.js'))));
  assert(report.unbudgetedResources.includes('ui/tool-shell.css'),'do not invent a CSS hard limit');
});
test('full inventory catches oversize raw code and missing or mismatched resources',()=>{
  const f=packageFixture(),path=BUILTIN_CATALOG.libraries.jquery.output;
  f.measured[path].bytes=128*1024+1;f.receipt.report.files.find(row=>row.path===path).bytes=f.measured[path].bytes;
  assert.throws(()=>summarizePackageResources(f.receipt,f.measured),/exceeds byte budget/);
  const missing=packageFixture();delete missing.measured['ui/tool.html'];
  assert.throws(()=>summarizePackageResources(missing.receipt,missing.measured),/physically measured/);
  const mismatch=packageFixture();mismatch.measured['ui/tool.html'].sha256='b'.repeat(64);
  assert.throws(()=>summarizePackageResources(mismatch.receipt,mismatch.measured),/size\/hash mismatch/);
});
test('old 320 KiB line is advisory; 512 KiB remains a strict SW production budget',()=>{
  const f=fixture(),sw=f.receipt.bundleModules.find(row=>row.target==='sw.js');
  const setBytes=bytes=>{
    sw.bytes=bytes;f.measured['sw.js'].bytes=bytes;
    f.receipt.report.files.find(row=>row.path==='sw.js').bytes=bytes;
  };
  setBytes(BUILD_POLICY.serviceWorkerReviewBytes-1);
  assert.deepEqual(summarizeFixedEntries(f.receipt,f.measured).reviewRequired,[]);
  setBytes(BUILD_POLICY.serviceWorkerReviewBytes+1);
  assert.deepEqual(summarizeFixedEntries(f.receipt,f.measured).reviewRequired,['sw.js']);
  setBytes(BUILD_POLICY.serviceWorkerProductionBytes);
  assert.equal(summarizeFixedEntries(f.receipt,f.measured).entries.find(row=>row.path==='sw.js').remainingBytes,0);
  setBytes(BUILD_POLICY.serviceWorkerProductionBytes+1);
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
  assert.equal(report.entries.find(row=>row.path==='sw.js').budgetBytes,768*1024);
  assert.equal(report.entries.find(row=>row.path==='ui/tool-shell.js').budgetBytes,320*1024);
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
  for (const path of ['node_modules/lodash-es/get.js','node_modules/dayjs/dayjs.min.js','src/runtime/builtin-libraries/core.js']) {
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
