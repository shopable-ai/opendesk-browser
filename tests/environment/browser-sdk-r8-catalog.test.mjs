import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseChromiumJson,compileNativeCatalog} from '../../scripts/sync-chrome-api-catalog.mjs';
import {BROWSER_OPERATIONS} from '../../src/framework/sdk/browser-contract.js';
test('R8 Chromium schema parser preserves literal URLs and strips comments',()=>{
  assert.deepEqual(parseChromiumJson('// header\n{"url":"https://example.org/a//b","number":42/*comment*/}'),
    {url:'https://example.org/a//b',number:42});
});
test('R8 pinned offline catalog deterministically matches committed discovery data',async()=>{
  const onDisk=JSON.parse(await readFile(new URL('../../docs/api/chrome-native-api-catalog.json',import.meta.url)));
  const built=await compileNativeCatalog();
  assert.deepEqual(built,onDisk);
  assert.equal(built.chromiumCommit.length,40);
  assert.ok(built.counts.methods>=60);
  assert.equal(built.counts.namespaces,8);
  assert.equal(built.entries.filter(x=>x.namespace==='cookies'&&x.kind==='METHOD').length>0,true);
  assert.ok(built.entries.every(x=>x.exposure!=='ALLOWED'));
  assert.ok(built.entries.every(x=>x.evidence==='SCHEMA_DISCOVERY_ONLY_NOT_CHROME_TESTED'));
});
test('R8 legacy map remains a non-binding historic snapshot only',async()=>{
  const data=JSON.parse(await readFile(new URL('../../docs/api/browser-sdk-compatibility-map.json',import.meta.url)));
  assert.equal(data.operations.length,35);
  assert.equal(data.archiveOnly,true);
  assert.equal(data.status,'HISTORICAL_PRELAUNCH_SNAPSHOT_NOT_BINDING');
  assert(Object.keys(BROWSER_OPERATIONS).some(op=>!data.operations.some(row=>row.legacyOperation===op)));
  const nativeCreate=(await compileNativeCatalog()).entries.find(row=>row.nativeApi==='chrome.tabs.create');
  assert.deepEqual(nativeCreate.opendeskOperation,['browser.tabs.create']);
  const nativeReload=(await compileNativeCatalog()).entries.find(row=>
    row.nativeApi==='chrome.tabs.reload');
  assert.deepEqual(nativeReload.opendeskOperation,['browser.tabs.reloadOwned']);
  assert.equal(nativeReload.exposure,'SEE_APPROVED_SDK_CONTRACT');
  assert.equal(BROWSER_OPERATIONS['browser.tabs.reloadOwned']?.implementation,'IMPLEMENTED');
  assert(data.operations.some(row=>!Object.hasOwn(BROWSER_OPERATIONS,row.legacyOperation)));
  for(const row of data.operations){
    assert.equal(row.currentPublicOperation,row.legacyOperation);
    assert.equal(row.deprecationState,'ACTIVE');
    assert.equal(row.removalEligibility,false);
    assert.ok(['DIRECT','SCOPED','COMPOSED','EXISTING_SERVICE','HOST_ONLY','UNSUPPORTED'].includes(row.mappingKind));
    assert.deepEqual([row.inputCompatibility,row.outputCompatibility,row.errorCompatibility],
      ['UNCHANGED','UNCHANGED','UNCHANGED']);
  }
});
