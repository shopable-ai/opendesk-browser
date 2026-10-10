import test from 'node:test';
import assert from 'node:assert/strict';
import {BUILD_POLICY} from '../../scripts/build-contract.mjs';
import {FIXED_ENTRY_PATHS,summarizeFixedEntries} from '../../scripts/audit-fixed-entries.mjs';
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
  assert.deepEqual(summary.critical,['sw.js','ui/tool-shell.js']);
  assert.equal(summary.entries[0].remainingBytes,773);
  assert.equal(summary.entries[0].risk,'critical');
  assert.match(summary.attributionNote,/PRE-minification/);
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
  sw.bytes=BUILD_POLICY.productionBytes+1;
  enlarged.measured['sw.js'].bytes=sw.bytes;
  enlarged.receipt.report.files.find(row=>row.path==='sw.js').bytes=sw.bytes;
  assert.throws(()=>summarizeFixedEntries(enlarged.receipt,enlarged.measured),/exceeds unchanged/);
});
