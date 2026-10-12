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
test('R8 compatibility map retains every legacy public contract with no deprecations',async()=>{
  const data=JSON.parse(await readFile(new URL('../../docs/api/browser-sdk-compatibility-map.json',import.meta.url)));
  assert.equal(data.operations.length,35);
  assert.deepEqual(new Set(data.operations.map(x=>x.legacyOperation)),new Set(Object.keys(BROWSER_OPERATIONS)));
  for(const row of data.operations){
    assert.equal(row.currentPublicOperation,row.legacyOperation);
    assert.equal(row.deprecationState,'ACTIVE');
    assert.equal(row.removalEligibility,false);
    assert.ok(['DIRECT','SCOPED','COMPOSED','EXISTING_SERVICE','HOST_ONLY','UNSUPPORTED'].includes(row.mappingKind));
    assert.deepEqual([row.inputCompatibility,row.outputCompatibility,row.errorCompatibility],
      ['UNCHANGED','UNCHANGED','UNCHANGED']);
  }
});
