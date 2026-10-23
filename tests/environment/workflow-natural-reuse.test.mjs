import test from 'node:test';
import assert from 'node:assert/strict';
import {compileWorkflow} from '../../src/framework/workflow/compiler.js';
import {sealWorkflowBundle,replayParameterSchema,inferDynamicReplayPlan,
  WORKFLOW_DYNAMIC_BUNDLE_FORMAT,WORKFLOW_BUNDLE_FORMAT}
  from '../../src/ui/workflow/segment-replay.js';
import {naturalProductReply,selectSavedWorkflowRoute}
  from '../../src/ui/workflow/workflow-reuse.js';

const base='https://workflow.example';
const target={status:'available',frameId:0,origin:base,url:base+'/demo'};
const request='搜索 lens，打开 Lens Y 商品详情，核对名称和价格。';
async function record(id='wf-11111111-2222-3333-4444-555555555555'){
  const schema=(name,value)=>({type:'object',properties:{
    [name]:{type:'string',title:name,maxLength:120,default:value}},
    required:[name],additionalProperties:false});
  const workflow=(suffix,steps,paramsSchema)=>({
    format:'opendesk.workflow.v1',workflowId:id+'-'+suffix,
    title:'商品搜索与核验',description:'',siteOrigin:base,paramsSchema,steps});
  const first=workflow('s1',[
    {stepId:'fill',op:'fill',locatorKind:'css',selector:'#keyword',param:'query'},
    {stepId:'search',op:'click',locatorKind:'role',selector:'button',roleName:'Search'}
  ],schema('query','camera'));
  const second=workflow('s2',[
    {stepId:'link',op:'click',locatorKind:'role',selector:'link',roleName:'Camera X',
      param:'productName',linkGuard:{href:'/product/camera-x',
        url:base+'/product/camera-x',origin:base,name:'Camera X',
        sourceUrl:base+'/search?q=camera',locatorKind:'role',
        selector:'link',roleName:'Camera X'}}
  ],schema('productName','Camera X'));
  const segments=[];
  for(const [i,w] of [first,second].entries()){
    const freeze=await compileWorkflow(w,{verifyFill:i===0});
    segments.push({workflow:w,entryUrl:i===0?base+'/demo':base+'/search?q=camera',
      revision:1,sourceHash:freeze.sourceHash,
      verificationMode:i===0?'fill-readback':'none',
      evidence:i===0?{kind:'search-results'}:{kind:'product-page',name:'Camera X'},
      proof:{runId:'original-'+i,resultId:'receipt-'+i,sourceHash:freeze.sourceHash,
        origin:base,documentId:'document-'+i}});
  }
  const goal='搜索 camera，打开 Camera X 商品详情，核对名称和价格';
  const bindingPlan=inferDynamicReplayPlan({goal,segments});
  assert.ok(bindingPlan);
  const value=await sealWorkflowBundle({format:WORKFLOW_DYNAMIC_BUNDLE_FORMAT,
    bundleId:id,revision:1,goal,title:'商品搜索与核验',
    workflow:{workflowId:id,title:'商品搜索与核验',siteOrigin:base},
    segments,paramsSchema:replayParameterSchema(segments),bindingPlan});
  return {key:'opendesk.sidebar.workflow.v1:'+id+':1',...value};
}
const route=(records,requestText=request,targetValue=target)=>
  selectSavedWorkflowRoute({request:requestText,target:targetValue,records});
test('one exact v2 search-to-product candidate extracts new values without compiling source',async()=>{
  const saved=await record(),matched=route([saved]);
  assert.equal(matched.state,'MATCH');
  assert.equal(matched.record.key,saved.key);
  assert.deepEqual(matched.params,{query:'lens',productName:'Lens Y'});
  assert.equal(matched.record.segments[0].sourceHash,saved.segments[0].sourceHash);
});
test('new limits, negations and unrelated intents may not borrow a similar frozen source',async()=>{
  const saved=await record();
  for(const goal of [
    '搜索 lens，打开 Lens Y 商品详情，核对名称和价格，要求价格低于 ¥100。',
    '搜索 lens，但不要打开 Lens Y 商品详情，核对名称和价格。',
    '搜索 lens，打开 Lens Y 商品详情并购买。',
    '删除 Lens Y 商品',
    '搜索 lens，打开 Lens Y 商品详情，核对名称和评价。'
  ])assert.equal(route([saved],goal).state,'AI',goal);
});
test('wrong origin, entry, legacy v1 and malformed binding cannot dispatch saved execution',async()=>{
  const saved=await record();
  assert.equal(route([saved],request,{...target,origin:'https://evil.example'}).state,'AI');
  assert.equal(route([saved],request,{...target,url:base+'/other'}).state,'AI');
  assert.equal(route([{...saved,format:WORKFLOW_BUNDLE_FORMAT}]).state,'AI');
  assert.equal(route([{...saved,bindingPlan:{...saved.bindingPlan,allowedOrigin:'https://evil.example'}}]).state,'BLOCKED');
  assert.equal(route([{...saved,paramsSchema:{...saved.paramsSchema,required:[]}}]).state,'BLOCKED');
});
test('multiple matching versions require choice and missing product requires a real clarification',async()=>{
  const a=await record(),b=await record('wf-99999999-2222-3333-4444-555555555555');
  const many=route([a,b]);
  assert.equal(many.state,'AMBIGUOUS');
  assert.deepEqual(many.candidates.map(row=>row.key),[a.key,b.key]);
  const partial=route([a],'搜索 lens，打开商品详情，核对名称和价格');
  assert.equal(partial.state,'MISSING_PRODUCT');
  assert.equal(partial.query,'lens');
  assert.equal(naturalProductReply('Lens Y'),'Lens Y');
  assert.equal(naturalProductReply('<script>'),null);
  assert.equal(naturalProductReply(''),null);
});

test('bounded equivalent Chinese read-only goals reuse v2 without silently dropping clauses',async()=>{
  const saved=await record();
  for(const goal of [
    '请搜索 lens，打开 Lens Y 商品详情，核对名称和价格。',
    '查找 lens，点开 Lens Y 商品详情页，验证商品名称和售价。',
    '检索 lens，进入 Lens Y 详情页，检查名称与标价。'
  ]) {
    const result=route([saved],goal);
    assert.equal(result.state,'MATCH',goal);
    assert.deepEqual(result.params,{query:'lens',productName:'Lens Y'});
  }
  const missing=route([saved],'查找 lens，进入详情页，检查名称与售价');
  assert.equal(missing.state,'MISSING_PRODUCT');
  assert.equal(missing.query,'lens');
  for(const goal of [
    '查找 lens，点开 Lens Y 商品详情页，验证商品名称和售价，且不能超过 ¥100。',
    '查找 lens，点开 Lens Y 商品详情页，但不要验证商品名称和售价。',
    '查找 lens，点开 Lens Y 商品详情页，验证商品名称和售价并购买。'
  ])assert.equal(route([saved],goal).state,'AI',goal);
});
