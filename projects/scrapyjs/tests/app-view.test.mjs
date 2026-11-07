import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {fieldForm,applyField,crawlForm,applyCrawl} from '../src/editor.js';
const context=vm.createContext({TextEncoder,URL});
vm.runInContext(await readFile(new URL('../src/app-model.js',import.meta.url),'utf8'),context);
const validate=value=>context.ScrapyAppModel.validateConfig(value);
const config={url:'http://127.0.0.1:43111/demo-form.html',itemConfig:{_listContainer:'#sample-list',_listItem:'li',title:'a::title',url:'a::href',nested:{selector:'p',read:'innerHTML'}},
  validation:{version:1,rowShape:'book'},fieldRequirements:[{key:'title',required:true,valueType:'text'}],processing:{version:1,rules:[{op:'splitPublication',field:'title'}]}};
test('editing an attribute preserves unrelated rules and all original processing/validation',()=>{
  const form={...fieldForm('title',config.itemConfig.title),container:'#sample-list',item:'li',selector:'h2 a'};
  const before=JSON.stringify(config),next=applyField(config,form);
  assert.equal(JSON.stringify(config),before);assert.equal(next.itemConfig.title,'h2 a::title');
  assert.deepEqual(next,{...config,itemConfig:{...config.itemConfig,title:'h2 a::title'}});validate(next);
});
test('renaming cannot overwrite a different field or invalidate dependent rules silently',()=>{
  const form={...fieldForm('title','a::title'),container:'#sample-list',item:'li',key:'url'};
  assert.throws(()=>applyField(config,form),/同名字段/);
  const next=applyField(config,{...form,key:'name'});assert(!Object.hasOwn(next.itemConfig,'title'));
  assert.equal(next.itemConfig.name,'a::title');assert.throws(()=>validate(next),/校验/);
});
test('nested, HTML and XPath rules stay in the lossless JSON editor',()=>{
  for(const value of [{selector:'p',read:'innerHTML'},'xpath=//a','//a','a::innerHTML','p::html'])assert.equal(fieldForm('complex',value),null);
  assert.equal(fieldForm('title','a::title').attr,'title');assert.equal(fieldForm('title','.::text').selector,'.');
});
test('list-only changes do not invent or delete a field; invalid attributes fail before application',()=>{
  const form={key:'',selector:'',attr:'',read:'text',container:'.rows',item:'article'};
  const next=applyField(config,form);assert.equal(next.itemConfig._listContainer,'.rows');assert.deepEqual(next.itemConfig.nested,config.itemConfig.nested);
  assert.throws(()=>applyField(config,{...form,key:'url',selector:'a',read:'attr',attr:'bad attr'}),/属性名/);
});
test('pagination/detail round-trip preserves hidden wait rules and validates identities and limits',()=>{
  const detail={urlField:'url',identityField:'title',waitForSelector:'.price',itemConfig:{title:'h1',price:'.price'},numberFields:['price']};
  const current={...config,detail,nextPageSelector:'a.next',maxPages:3,dedupeKey:'url'};
  assert.deepEqual(applyCrawl(current,crawlForm(current)),current);validate(current);
  assert.throws(()=>validate(applyCrawl(current,{...crawlForm(current),maxPages:'11'})),/1–10/);
  const next=applyCrawl(current,{...crawlForm(current),enabled:false,next:'',dedupe:''});
  assert(!next.detail);assert(!next.nextPageSelector);assert.deepEqual(next.processing,config.processing);
});
