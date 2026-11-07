import test from 'node:test';
import assert from 'node:assert/strict';
import {applyInlineField} from '../src/editor.js';

const config={url:'https://example.com',itemConfig:{_listContainer:'.list',_listItem:'li',title:'a::text',url:'a::href',complex:{selector:'p',read:'innerHTML'}},waitForSelector:'.list'};
const form={originalKey:'title',key:'title',rule:'h2 a::text',container:'.list',item:'li'};
test('one-line rule preserves text, attributes, shared scope and complex neighbours',()=>{
  assert.equal(applyInlineField(config,form).itemConfig.title,'h2 a::text');
  const next=applyInlineField(config,{...form,rule:'img::src'});
  assert.equal(next.itemConfig.title,'img::src');
  assert.deepEqual(next.itemConfig.complex,config.itemConfig.complex);
  assert.equal(next.waitForSelector,'.list');
  assert.equal(config.itemConfig.title,'a::text');
});
test('empty/unsupported rules and duplicate names fail at the right input',()=>{
  for(const rule of ['', '::text', '::href', 'xpath=//a', 'p::innerHTML', 'a::bad attr'])
    assert.throws(()=>applyInlineField(config,{...form,rule}),e=>e.fieldId==='field-rule');
  assert.throws(()=>applyInlineField(config,{...form,key:'url'}),e=>e.fieldId==='field-key');
  assert.throws(()=>applyInlineField(config,{...form,key:''}),e=>e.fieldId==='field-key');
});
test('new rows cannot overwrite names; renaming and scope-only changes remain lossless',()=>{
  assert.throws(()=>applyInlineField(config,{...form,originalKey:''}),/同名字段/);
  const renamed=applyInlineField(config,{...form,key:'heading'});
  assert.equal(renamed.itemConfig.heading,'h2 a::text');assert(!Object.hasOwn(renamed.itemConfig,'title'));
  assert.deepEqual(Object.keys(renamed.itemConfig),['_listContainer','_listItem','heading','url','complex']);
  const scope=applyInlineField(config,{...form,scopeOnly:true,container:'.books'});
  assert.deepEqual(scope.itemConfig,{...config.itemConfig,_listContainer:'.books'});
  assert.equal(applyInlineField(config,{...form,rule:'a',container:'.stale'}).itemConfig.title,'a');
  assert.equal(applyInlineField(config,{...form,container:'.stale'}).itemConfig._listContainer,'.list');
});
test('renaming carries its custom CSV label and preserves unrelated output metadata',()=>{
  const source={...config,output:{fieldNames:{title:'标题',heading:'旧映射',url:'链接'},fieldOrder:['title','url','complex']}};
  const next=applyInlineField(source,{...form,key:'heading'});
  assert.deepEqual(next.output.fieldNames,{heading:'标题',url:'链接'});
  assert.deepEqual(next.output.fieldOrder,['heading','url','complex']);
  assert.deepEqual(source.output.fieldNames,{title:'标题',heading:'旧映射',url:'链接'});
});
