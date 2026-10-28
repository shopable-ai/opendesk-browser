import test from 'node:test';
import assert from 'node:assert/strict';
import {selectInstalledTaskRoute} from '../../src/ui/workflow/installed-task-reuse.js';
import {createTaskPackage,verifyTaskPackage,validateTaskManifest} from '../../src/platform/tasks/contract.js';
import {digestUtf8} from '../../src/platform/protocol.js';
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
  assert.equal(matched.candidate.sensitive,true,
    'a self-described commerce Task cannot prove its source safe enough to skip review');
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
  for(const [goal,keyword] of [
    ['搜索lens，打开商品详情，核对名称和价格','lens'],
    ['查找 lens，进入详情页，检查名称与售价','lens'],
    ['请搜索 提交次数，点开商品详情，验证名称和价格','提交次数']
  ]){
    const reply=route(goal);
    assert.equal(reply.state,'MISSING_PARAMS',goal);
    assert.deepEqual(reply.candidates[0].fields,['productName'],goal);
  }
  for(const unsafe of [
    '搜索 lens不要，打开商品详情，核对名称和价格',
    '搜索 lens，然后下单，打开商品详情，核对名称和价格',
    '搜索 lens，打开商品详情，核对名称和价格，要求价格低于100'
  ])assert.equal(route(unsafe).state,'NO_MATCH',unsafe);
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

test('legacy verified demo search discovers keyword from complete operation contract, not its title',()=>{
  const manifest={taskId:'example.search',version:'1.0.0',title:'可重复搜索',
    description:'使用现代 Locator 填写演示搜索框、等待结果；仅作为待验证候选导入。',
    siteOrigins:['http://127.0.0.1:43111'],
    program:{revision:1,sourceHash:'a'.repeat(64)},
    paramsSchema:{type:'object',additionalProperties:false,
      properties:{keyword:{type:'string',title:'搜索关键词',minLength:1,maxLength:80,default:'OpenDesk'}},
      required:['keyword']}};
  const catalog=[{taskId:manifest.taskId,version:manifest.version,
    stage:'available',manifestHash:'b'.repeat(64),manifest}];
  const installed=[{taskId:manifest.taskId,version:manifest.version,
    enabled:true,manifestHash:'b'.repeat(64),generation:1,installationId:'test-installed'}];
  const page={status:'available',frameId:0,origin:manifest.siteOrigins[0],
    url:manifest.siteOrigins[0]+'/demo-form.html'};
  const match=input=>selectInstalledTaskRoute({request:input,target:page,catalog,installed});
  const done=match('在当前演示搜索页搜索 OpenDesk，并核对结果。');
  assert.equal(done.state,'MATCH');
  assert.equal(done.candidate.kind,'demo-search');
  assert.equal(done.candidate.sensitive,true,'opaque Task submission still requires an existing review');
  assert.deepEqual(done.candidate.params,{keyword:'OpenDesk'});
  const absent=match('在当前演示搜索页搜索，并核对结果。');
  assert.equal(absent.state,'MISSING_PARAMS','schema default cannot replace user-supplied dynamic keyword');
  assert.deepEqual(absent.candidates[0].fields,['keyword']);
  for(const unsafe of [
    '在当前演示搜索页搜索 OpenDesk，并核对结果，然后删除记录',
    '在当前演示搜索页搜索 OpenDesk，但不要点击搜索，并核对结果',
    '在当前演示搜索页搜索 OpenDesk，并核对提交日志'
  ])assert.equal(match(unsafe).state,'NO_MATCH',unsafe);
  assert.equal(selectInstalledTaskRoute({request:'在当前演示搜索页搜索 OpenDesk，并核对结果',
    target:{...page,origin:'https://other.example'},catalog,installed}).state,'NO_MATCH');
  manifest.paramsSchema.properties.keyword.title='密码';
  assert.equal(match('在当前演示搜索页搜索 OpenDesk，并核对结果').state,'NO_MATCH');
  manifest.paramsSchema.properties.keyword.title='搜索关键词';
  manifest.description='可重复搜索关键词';
  assert.equal(match('在当前演示搜索页搜索 OpenDesk，并核对结果').state,'NO_MATCH');
});


test('new immutable Task intent templates match declared operation, not marketing description or ID',()=>{
  const data=fixture({description:'一段不用于路由的普通产品描述'});
  const manifest=data.catalog[0].manifest;
  manifest.paramsSchema={type:'object',additionalProperties:false,
    properties:{keyword:{type:'string',title:'搜索关键词',minLength:1,maxLength:80,default:'OpenDesk'}},
    required:['keyword']};
  manifest.intent={
    templates:['在当前演示搜索页搜索 {keyword}，并核对结果'],
    resultTexts:['结果：{keyword}','提交次数：1']
  };
  const request='在当前演示搜索页搜索 OpenDesk，并核对结果';
  const selected=route(request,data);
  assert.equal(selected.state,'MATCH');
  assert.equal(selected.candidate.kind,'declared');
  assert.equal(selected.candidate.sensitive,true,'intent does not prove the JavaScript read-only');
  assert.deepEqual(selected.candidate.params,{keyword:'OpenDesk'});
  assert.deepEqual(selected.candidate.intent.resultTexts,manifest.intent.resultTexts);
  // Literal search terms are not authority to invoke other Task operations.
  // Do not over-block harmless terms merely containing an action-like verb.
  for(const keyword of ['提交次数','删除键','下载速度']){
    const benign=route('在当前演示搜索页搜索 '+keyword+'，并核对结果',data);
    assert.equal(benign.state,'MATCH',keyword);
    assert.equal(benign.candidate.params.keyword,keyword);
  }
  for(const keyword of ['OpenDesk 然后删除记录','OpenDesk 删除订单','删除所有记录']){
    assert.equal(route('在当前演示搜索页搜索 '+keyword+'，并核对结果',data).state,'NO_MATCH',
      'a concealed second action is not silently reduced to query text: '+keyword);
  }
  assert.equal(route('在当前演示搜索页搜索 ，并核对结果',data).state,'MISSING_PARAMS',
    'an authored default must not silently choose the user keyword');
  for(const changed of [
    request+'，然后删除记录',
    '在当前演示搜索页搜索 OpenDesk，但不要执行，并核对结果',
    '在当前演示搜索页搜索 OpenDesk，并核对日志'
  ])assert.equal(route(changed,data).state,'NO_MATCH',changed);
  assert.equal(route(request,data,{...target,origin:'https://else.example'}).state,'NO_MATCH');
});

test('new Task intent and DOM result claims are schema-bound and tamper-evident',async()=>{
  const source='async function main(){ return {result:"sample"}; }\n';
  const schema={type:'object',additionalProperties:false,
    properties:{keyword:{type:'string',title:'搜索关键词',minLength:1,maxLength:80}},
    required:['keyword']};
  const manifest={format:'opendesk.task.v1',taskId:'sample.intent-search',version:'1.0.1',
    title:'搜索并核对',description:'使用已安装的固定 JavaScript',
    author:'OpenDesk Browser',source:'local-demo',
    siteOrigins:['https://shop.example'],permissions:['page.automation'],entryFormat:'async-main',
    program:{revision:3,sourceHash:await digestUtf8(source)},
    paramsSchema:schema,
    intent:{templates:['搜索 {keyword}，核对结果'],
      resultTexts:['结果：{keyword}','提交次数：1']}};
  assert.equal(validateTaskManifest(manifest),manifest);
  const pkg=await createTaskPackage(manifest,source);
  assert.equal((await verifyTaskPackage(pkg)).manifestHash,pkg.manifestHash);
  await assert.rejects(verifyTaskPackage({...pkg,manifest:{...manifest,
    intent:{...manifest.intent,resultTexts:['结果：{keyword}','提交次数：2']}}}),{code:'E_HASH'});
  assert.throws(()=>validateTaskManifest({...manifest,
    intent:{templates:['搜索 {missing}，核对结果']}}),{code:'E_SCHEMA'});
  assert.throws(()=>validateTaskManifest({...manifest,
    intent:{templates:['搜索固定值，核对结果']}}),{code:'E_SCHEMA'});
  assert.throws(()=>validateTaskManifest({...manifest,
    intent:{templates:['搜索 {keyword}，核对结果'],
      resultTexts:['静态文字 1','静态文字 2']}}),{code:'E_SCHEMA'});
});


test('multi-origin installed reuse matches the actual non-first origin without losing fixed identity',()=>{
  const data=fixture(),manifest=data.catalog[0].manifest;
  manifest.siteOrigins=['https://first.example',target.origin,'https://third.example'];
  const request='搜索 lens，打开 Lens Y 商品详情，核对名称和价格';
  const selected=route(request,data);
  assert.equal(selected.state,'MATCH');
  assert.equal(selected.candidate.sourceHash,manifest.program.sourceHash);
  assert.equal(selected.candidate.revision,manifest.program.revision);
  assert.deepEqual(selected.candidate.expected,{version:'1.0.0',manifestHash:'b'.repeat(64),
    generation:2,installationId:'installed-2'});
  assert.equal(route(request,data,{...target,origin:'https://outside.example'}).state,'NO_MATCH');
  data.installed[0].manifestHash='c'.repeat(64);
  assert.equal(route(request,data).state,'BLOCKED');
  data.installed[0].manifestHash='b'.repeat(64);
  manifest.siteOrigins=[target.origin,target.origin];
  assert.equal(route(request,data).state,'NO_MATCH');
});
