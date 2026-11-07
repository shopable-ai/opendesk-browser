import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import * as editor from '../src/editor.js';

const {document}=parseHTML('<html><body></body></html>');
const config={itemConfig:{_listItem:'li',a:'a::text',b:'a::href',c:{selector:'p',read:'innerHTML'}},
  output:{fieldOrder:['a','b','c'],fieldNames:{a:'甲',b:'乙',c:'丙',other:'保留'}}};
const form={originalKey:'a',key:'a',rule:'a::text'};

test('inline CSS syntax errors reject the rule input before changing the draft',()=>{
  const before=structuredClone(config);
  for(const rule of ['[','[::text','a[::href','a,::text'])
    assert.throws(()=>editor.applyInlineField(config,{...form,rule},document),error=>error.fieldId==='field-rule');
  assert.deepEqual(config,before);
});

test('inline CSS validation preserves self, valid CSS, and the complex JSON boundary',()=>{
  for(const rule of ['.','.::text','.::href','a','a::href','li > a[data-id="x"]::text','a:is(.one, .two)::href']){
    const next=editor.applyInlineField(config,{...form,rule},document);
    assert.equal(next.itemConfig.a,rule);
    assert.deepEqual(next.itemConfig.c,config.itemConfig.c);
  }
  for(const rule of ['xpath=//a','p::innerHTML','p::html'])
    assert.throws(()=>editor.applyInlineField(config,{...form,rule},document),error=>error.fieldId==='field-rule');
});

test('deleting b removes only its output metadata and allows a to become b once',()=>{
  assert.equal(typeof editor.removeInlineField,'function');
  const before=structuredClone(config);
  const deleted=editor.removeInlineField(config,'b');
  assert.deepEqual(deleted.itemConfig,{_listItem:'li',a:'a::text',c:config.itemConfig.c});
  assert.deepEqual(deleted.output,{fieldOrder:['a','c'],fieldNames:{a:'甲',c:'丙',other:'保留'}});
  const renamed=editor.applyInlineField(deleted,{...form,key:'b'},document);
  assert.deepEqual(renamed.output,{fieldOrder:['b','c'],fieldNames:{b:'甲',c:'丙',other:'保留'}});
  assert.deepEqual(config,before);
});

test('deletion retains metadata used by a same-name detail field without migrating references',()=>{
  assert.equal(typeof editor.removeInlineField,'function');
  const source={...config,detail:{urlField:'b',identityField:'a',itemConfig:{a:'h1',b:'.detail'}}};
  const next=editor.removeInlineField(source,'b');
  assert.deepEqual(next.output,config.output);
  assert.deepEqual(next.detail,source.detail);
  assert.equal(Object.hasOwn(next.itemConfig,'b'),false);
  assert.deepEqual(editor.removeInlineField({itemConfig:config.itemConfig},'b'),
    {itemConfig:{_listItem:'li',a:'a::text',c:config.itemConfig.c}});
});

test('rename discards a stale destination order entry while keeping the source position and label',()=>{
  const source={...config,itemConfig:{_listItem:'li',a:'a::text',c:'p::text'},
    output:{fieldOrder:['b','c','a'],fieldNames:{a:'甲',b:'旧乙',c:'丙'}}};
  const before=structuredClone(source);
  const next=editor.applyInlineField(source,{...form,key:'b'},document);
  assert.deepEqual(next.output,{fieldOrder:['c','b'],fieldNames:{b:'甲',c:'丙'}});
  assert.deepEqual(source,before);
});
