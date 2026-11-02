import assert from 'node:assert/strict';
import {test} from 'node:test';
import '../src/app-model.js';
import {resolveAiReply} from '../src/ai-actions.js';

const validate = globalThis.ScrapyAppModel.validateConfig;
const base = () => ({url:'https://example.com/catalog',itemConfig:{
  _listItem:'.product',title:'h2::text',url:'a::href'
}});
function changes(before,after) {
  const compare=(a,b,key)=>({key,before:a[key],after:b[key],kind:
    !Object.hasOwn(a,key)?'新增':!Object.hasOwn(b,key)?'删除':
    JSON.stringify(a[key])!==JSON.stringify(b[key])?'修改':'保留'});
  const fields=[...new Set([...Object.keys(before.itemConfig),...Object.keys(after.itemConfig)])]
    .filter(key=>!['_listContainer','_listItem'].includes(key))
    .map(key=>compare(before.itemConfig,after.itemConfig,key));
  const options=[...new Set([...Object.keys(before),...Object.keys(after)])]
    .filter(key=>key!=='itemConfig'&&JSON.stringify(before[key])!==JSON.stringify(after[key]));
  return {fields,listChanged:['_listItem','_listContainer'].some(key=>before.itemConfig[key]!==after.itemConfig[key]),
    optionChanges:options.map(key=>compare(before,after,key))};
}
const opts=config=>({base:config,expectedUrl:config.url,validate,changes});

test('field action keeps existing selectors, proposes price and warns about missing DOM evidence',()=>{
  const before=base();
  const reply=resolveAiReply({type:'actions',actions:[{kind:'field.upsert',key:'price',rule:'.price::text'}]},opts(before));
  assert.equal(reply.type,'proposal');
  assert.equal(reply.config.itemConfig.title,'h2::text');
  assert.equal(reply.config.itemConfig.url,'a::href');
  assert.equal(reply.config.itemConfig.price,'.price::text');
  assert.match(reply.warnings[0],/尚未经过网页验证/);
  assert.equal(before.itemConfig.price,undefined);
});
test('CSV display names and order never rename capture engine keys',()=>{
  const before={...base(),itemConfig:{...base().itemConfig,price:'.price::text'}};
  const reply=resolveAiReply({type:'actions',actions:[{kind:'csv.configure',
    fieldNames:{title:'商品名称',price:'商品价格'},fieldOrder:['price','title','url']}]},
    {...opts(before),hasSample:true});
  assert.deepEqual(reply.config.output.fieldOrder,['price','title','url']);
  assert.equal(reply.config.output.fieldNames.price,'商品价格');
  assert.equal(reply.config.itemConfig.title,'h2::text');
  assert.equal(reply.config.itemConfig.price,'.price::text');
  assert.equal(Object.hasOwn(reply.config.itemConfig,'商品价格'),false);
});
test('safe pagination shows real missing-selector warning',()=>{
  const before=base();
  const reply=resolveAiReply({type:'actions',actions:[{kind:'pagination.configure',maxPages:3}]},opts(before));
  assert.equal(reply.config.maxPages,3);
  assert.match(reply.warnings.join(' '),/下一页选择器/);
});
test('read-only and needs-input answers cannot mutate configuration',()=>{
  const before=base();
  const inspect=resolveAiReply({type:'explain',message:'包含两个采集字段。'},opts(before));
  const missing=resolveAiReply({type:'needs-input',message:'请提供列表 DOM 样本。',missing:['列表容器 HTML']},opts(before));
  assert.equal(inspect.type,'explain');
  assert.equal(missing.type,'needs-input');
  assert.equal(before.itemConfig.price,undefined);
});
test('unknown action, unsafe field and nonexistent CSV key are rejected',()=>{
  const before=base();
  assert.throws(()=>resolveAiReply({type:'actions',actions:[{kind:'script.run',code:'alert(1)'}]},opts(before)),/未授权/);
  assert.throws(()=>resolveAiReply({type:'actions',actions:[{kind:'field.upsert',key:'__proto__',rule:'a'}]},opts(before)),/字段名称/);
  assert.throws(()=>resolveAiReply({type:'actions',actions:[{kind:'csv.configure',fieldNames:{price:'价格'}}]},opts(before)),/不存在/);
});
test('unshared prior config cannot be replaced; target URL cannot change',()=>{
  const before=base();
  assert.throws(()=>resolveAiReply({type:'config.proposal',config:before},{...opts(before),allowFullConfig:false}),/增量动作/);
  assert.throws(()=>resolveAiReply({type:'actions',actions:[{kind:'pagination.configure',maxPages:3}]},
    {...opts(before),expectedUrl:'https://example.com/other'}),/目标网址/);
});
test('legacy complete config remains reviewable when user shared the original',()=>{
  const before=base();
  const next={...before,maxPages:2,nextPageSelector:'a.next'};
  const reply=resolveAiReply(next,opts(before));
  assert.equal(reply.type,'proposal');
  assert.equal(reply.config.maxPages,2);
});
