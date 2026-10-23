import test from 'node:test';
import assert from 'node:assert/strict';
import {selectInstalledTaskRoute} from '../../src/ui/workflow/installed-task-reuse.js';
const target={status:'available',frameId:0,origin:'https://shop.example',url:'https://shop.example/'};
const schema={type:'object',additionalProperties:false,properties:{
  query:{type:'string',title:'查询词',minLength:2,maxLength:120},
  productName:{type:'string',title:'商品名称',minLength:3,maxLength:120}
},required:['query','productName']};
function fixture({description='搜索 {query}，打开 {productName} 商品详情，核对名称和价格',
  enabled=true,stage='available',identity=true}={}){
  const manifest={taskId:'commerce.read',version:'1.0.0',title:'固定商品检查',
    description,siteOrigins:[target.origin],
    program:{revision:3,sourceHash:'a'.repeat(64)},paramsSchema:schema};
  return {catalog:[{taskId:manifest.taskId,version:manifest.version,
    stage,manifestHash:'b'.repeat(64),manifest}],
    installed:[{taskId:manifest.taskId,version:manifest.version,
      enabled,manifestHash:'b'.repeat(64),generation:2,
      installationId:identity?'installed-2':null}]};
}
const route=(request,data=fixture(),page=target)=>selectInstalledTaskRoute({
  request,target:page,...data});
test('pinned installed Task extracts params from declared complete operation chain',()=>{
  const matched=route('搜索 lens，打开 Lens Y 商品详情，核对名称和价格');
  assert.equal(matched.state,'MATCH');
  assert.deepEqual(matched.candidate.params,{query:'lens',productName:'Lens Y'});
  assert.equal(matched.candidate.expected.generation,2);
  assert.equal(matched.candidate.sourceHash,'a'.repeat(64));
  assert.equal(matched.candidate.sensitive,false);
});
test('read-only equivalents match, added conditions and negations cannot be dropped',()=>{
  assert.equal(route('查找 lens，进入 Lens Y 详情页，验证名称与售价').state,'MATCH');
  for(const extra of ['，价格必须低于¥100','，不要打开详情','，然后下单'])
    assert.equal(route('搜索 lens，打开 Lens Y 商品详情，核对名称和价格'+extra).state,'NO_MATCH');
});
test('similar title without declarative business goal does not authorize execution',()=>{
  assert.equal(route('搜索 lens，打开 Lens Y 商品详情，核对名称和价格',
    fixture({description:'可按名称检索商品的通用助手'})).state,'NO_MATCH');
});
test('disabled, unverified or legacy installation never falls back to AI',()=>{
  for(const variant of [{enabled:false},{stage:'candidate'},{identity:false}])
    assert.equal(route('搜索 lens，打开 Lens Y 商品详情，核对名称和价格',
      fixture(variant)).state,'BLOCKED');
});
test('origin, missing Catalog, duplicate matches have safe separate states',()=>{
  const request='搜索 lens，打开 Lens Y 商品详情，核对名称和价格';
  assert.equal(route(request,fixture(),{...target,origin:'https://else.example'}).state,'NO_MATCH');
  assert.equal(route(request,{catalog:null,installed:[]}).state,'LOADING');
  const data=fixture(),other={...data.catalog[0],taskId:'commerce.other',
    manifest:{...data.catalog[0].manifest,taskId:'commerce.other'}};
  data.catalog.push(other);
  data.installed.push({...data.installed[0],taskId:'commerce.other'});
  assert.equal(route(request,data).state,'AMBIGUOUS');
});

test('partial read-only commerce intent requests only missing product name',()=>{
  const input='搜索 lens，打开商品详情，核对名称和价格';
  const selected=route(input);
  assert.equal(selected.state,'MISSING_PARAMS');
  assert.deepEqual(selected.candidates[0].fields,['productName']);
  assert.equal(route(input,fixture(),{...target,origin:'https://else.example'}).state,'NO_MATCH');
  assert.equal(route(input,fixture({enabled:false})).state,'BLOCKED');
});
test('non-commerce installed Task demands explicit review even for read-like descriptions',()=>{
  const data=fixture({description:'读取 {productName} 商品价格'});
  data.catalog[0].manifest.paramsSchema={type:'object',additionalProperties:false,
    properties:{productName:schema.properties.productName},required:['productName']};
  const selected=route('读取 Lens Y 商品价格',data);
  assert.equal(selected.state,'MATCH');
  assert.equal(selected.candidate.sensitive,true,'opaque Task source cannot be assumed read-only');
});

test('exact declared sensitive Task needs a separate confirmation',()=>{
  const data=fixture({description:'自然语言任务：修改商品 {productName} 的备注'});
  assert.equal(route('修改商品 Lens Y 的备注',data).state,'MISSING_PARAMS');
  data.catalog[0].manifest.paramsSchema={type:'object',additionalProperties:false,
    properties:{productName:schema.properties.productName},required:['productName']};
  const result=route('修改商品 Lens Y 的备注',data);
  assert.equal(result.state,'MATCH');
  assert.equal(result.candidate.sensitive,true);
});
