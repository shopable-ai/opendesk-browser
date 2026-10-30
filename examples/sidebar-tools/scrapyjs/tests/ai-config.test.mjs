import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {parseProposal,changes,instructions,sameConfig} from '../src/ai-config.js';
const ctx=vm.createContext({URL,TextEncoder});
vm.runInContext(await readFile(new URL('../src/app-model.js',import.meta.url),'utf8'),ctx);
const {validateConfig}=ctx.ScrapyAppModel;
const base={url:'https://book.douban.com/tag/编程',itemConfig:{_listContainer:'.subject-list',_listItem:'li',title:'h2 a',url:'h2 a::href'},validation:{version:1,rowShape:'book'},fieldRequirements:[{key:'title',required:true,valueType:'text'}]};
test('real provider proposals are data and pass the original lossless validator',()=>{
 const next={...base,itemConfig:{...base.itemConfig,author:'.pub'}};
 assert.equal(JSON.stringify(parseProposal(JSON.stringify(next),validateConfig,base.url)),JSON.stringify(next));
 assert.match(instructions,/不返回代码/);assert(sameConfig(base,structuredClone(base)));
});
test('invalid output, executable keys and changed targets fail before application',()=>{
 for(const proposal of ['```json\n{}\n```','not json',JSON.stringify({...base,code:'alert(1)'}),JSON.stringify({...base,maxPages:11}),JSON.stringify({...base,url:'https://download.csdn.net/'})])assert.throws(()=>parseProposal(proposal,validateConfig,base.url));
});
test('diff shows removed complex fields, modified rules, options and list scope without mutating data',()=>{
 const before=JSON.stringify(base),next={...base,itemConfig:{...base.itemConfig,title:'h3 a',author:'.pub',_listItem:'article'},maxPages:2};delete next.itemConfig.url;
 const diff=changes(base,next);assert(diff.fields.some(r=>r.key==='url'&&r.kind==='删除'));assert(diff.fields.some(r=>r.key==='title'&&r.kind==='修改'));assert(diff.fields.some(r=>r.key==='author'&&r.kind==='新增'));assert(diff.listChanged);assert(diff.options.includes('maxPages'));assert.equal(JSON.stringify(base),before);
 assert.equal(diff.fields.find(r=>r.key==='title').before,'h2 a');assert.equal(diff.fields.find(r=>r.key==='title').after,'h3 a');
 const deleted=changes(base,{url:base.url,itemConfig:base.itemConfig});assert.equal(deleted.optionChanges.find(r=>r.key==='validation').kind,'删除');
});
test('proposal rejects prototype keys, oversized fields and broken detail identity with original validator',()=>{
 const dangerous='{"url":"https://book.douban.com/tag/编程","itemConfig":{"__proto__":"p"}}';
 assert.throws(()=>parseProposal(dangerous,validateConfig,base.url));
 assert.throws(()=>parseProposal({...base,itemConfig:{huge:'a'.repeat(4100)}},validateConfig,base.url));
 assert.throws(()=>parseProposal({...base,detail:{urlField:'url',identityField:'title',itemConfig:{price:'.price'}}},validateConfig,base.url));
});
test('diff includes every validator-accepted underscore field and only separates the two list keys',()=>{
 const before={...base,itemConfig:{...base.itemConfig,_modified:'.old',_removed:'.remove',_kept:'.keep',_listItemLabel:'.label'}};
 const after={...base,itemConfig:{...base.itemConfig,_modified:{selector:'.new',read:'text'},_added:'.add',_kept:'.keep',_listItemLabel:'.label',_listItem:'article'}};
 const snapshots=[JSON.stringify(before),JSON.stringify(after)];
 // Use the product validator to prove these are supported user fields.
 validateConfig(before);validateConfig(after);
 const diff=changes(before,after);
 for(const [key,kind] of [['_modified','修改'],['_removed','删除'],['_added','新增'],['_kept','保留'],['_listItemLabel','保留']]){
  const row=diff.fields.find(row=>row.key===key);
  assert.ok(row,`${key} must be reviewable`);
  assert.equal(row.kind,kind);assert.deepEqual(row.before,before.itemConfig[key]);assert.deepEqual(row.after,after.itemConfig[key]);
 }
 assert.deepEqual(diff.fields.map(row=>row.key).sort(),['title','url','_modified','_removed','_added','_kept','_listItemLabel'].sort());
 assert.equal(diff.listChanged,true);assert.equal(diff.listAfter._listItem,'article');
 assert.deepEqual([JSON.stringify(before),JSON.stringify(after)],snapshots);
});
