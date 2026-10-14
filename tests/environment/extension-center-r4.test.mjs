import test from 'node:test';
import assert from 'node:assert/strict';
import {composeExtensionEntries,filterExtensionEntries} from '../../src/ui/extension-center-model.js';
const tool={id:'shared',title:'阅读目录',description:'目录',version:'1.0.0'};
const page={programId:'shared',manifestHash:'verified',installed:{manifestHash:'verified',
  title:'网页增强',revision:2,enabled:true,pageRules:{matches:['https://example.com/*']}}};
const official={id:'opendesk/shared',toolId:'shared',packageTitle:'阅读目录',description:'官方',version:'1.1.0'};
test('R4 preserves distinct app and Page identities without duplicating official IDs',()=>{
  const rows=composeExtensionEntries({installed:[tool],pages:[page],official:[official],enabled:{shared:false}});
  assert.equal(rows.length,2);
  assert.deepEqual(new Set(rows.map(x=>x.key)),new Set(['app:shared','page:shared']));
  assert.equal(rows.find(x=>x.kind==='app').enabled,false);
  assert.equal(rows.find(x=>x.kind==='app').update,true);
  assert.equal(rows.find(x=>x.kind==='page').enabled,true);
  assert.equal(filterExtensionEntries(rows).length,2);
  assert.equal(filterExtensionEntries(rows,{kind:'page'}).length,1);
  assert.equal(filterExtensionEntries(rows,{scope:'available'}).length,1);
});
test('R4 trusted candidate shows only after search or available filter',()=>{
  const rows=composeExtensionEntries({installed:[tool],official:[official,
    {...official,id:'opendesk/clip',toolId:'clip',packageTitle:'网页剪藏'}]});
  assert.equal(filterExtensionEntries(rows).length,1);
  assert.deepEqual(filterExtensionEntries(rows,{query:'剪藏'}).map(x=>x.id),['clip']);
  assert.equal(filterExtensionEntries(rows,{scope:'available'}).length,2);
  assert.equal(filterExtensionEntries(rows,{scope:'local'}).length,1);
});
test('R4 discards Page records that do not match their installed manifest hash',()=>{
  assert.deepEqual(composeExtensionEntries({pages:[{...page,manifestHash:'different'}]}),[]);
});
