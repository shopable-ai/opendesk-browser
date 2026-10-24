import test from 'node:test';
import assert from 'node:assert/strict';
import {canonical} from '../../src/platform/protocol.js';
import {compileWorkflow} from '../../src/framework/workflow/compiler.js';
import {sealWorkflowBundle,verifyWorkflowBundle,replayParameterSchema,
  verifyReplayBusinessEffect,assertLegacyReplayParameterScope,WORKFLOW_BUNDLE_FORMAT,
  WORKFLOW_DYNAMIC_BUNDLE_FORMAT,inferDynamicReplayPlan,dynamicReplayIntent} from '../../src/ui/workflow/segment-replay.js';

const schema=(name)=>({type:'object',properties:name?{[name]:{
  type:'string',title:name,maxLength:120,default:'camera'}}:{},
  required:name?[name]:[],additionalProperties:false});
const part=(id,origin,steps,paramsSchema=schema())=>({
  format:'opendesk.workflow.v1',workflowId:id,title:'搜索和商品核验',
  description:'',siteOrigin:origin,paramsSchema,steps});
const bundleId='wf-11111111-2222-3333-4444-555555555555';
const origin='https://example.com';
async function fixture(){
  const a=part(bundleId+'-s1',origin,[{stepId:'fill1',op:'fill',
    locatorKind:'css',selector:'#keyword',param:'query'}],schema('query'));
  const b=part(bundleId+'-s2',origin,[{stepId:'read1',op:'observe'}],schema());
  const [one,two]=await Promise.all([compileWorkflow(a,{verifyFill:true}),compileWorkflow(b)]);
  const segments=[{workflow:a,entryUrl:origin+'/search?q=camera',revision:1,
    sourceHash:one.sourceHash,verificationMode:'fill-readback',evidence:{kind:'input-readback'},
    proof:{runId:'run-1',resultId:'result-1',sourceHash:one.sourceHash,
      origin,documentId:'doc-search'}}, 
  {workflow:b,entryUrl:origin+'/products/1',revision:1,sourceHash:two.sourceHash,
    verificationMode:'none',evidence:{kind:'read-only'},
    proof:{runId:'run-2',resultId:'result-2',sourceHash:two.sourceHash,
      origin,documentId:'doc-product'}}];
  return {format:WORKFLOW_BUNDLE_FORMAT,bundleId,revision:1,
    goal:'搜索 camera，然后读取商品内容',title:'搜索和商品核验',
    workflow:{workflowId:bundleId,title:'搜索和商品核验',siteOrigin:origin},
    segments,paramsSchema:replayParameterSchema(segments)};
}
test('independent frozen scripts can be sealed into a complete, ordered bundle',async()=>{
  const record=await sealWorkflowBundle(await fixture());
  assert.equal(record.segments.length,2);
  assert.match(record.sourceHash,/^[a-f0-9]{64}$/);
  assert.deepEqual(await verifyWorkflowBundle(record),record);
  assert.equal(record.paramsSchema.properties.query.default,'camera');
});
test('Chrome storage object key ordering preserves bundle identity and dynamic routing',async()=>{
  const original=await sealWorkflowBundle(await dynamicCommerceFixture());
  const roundtrip=JSON.parse(canonical(original));
  assert.deepEqual(await verifyWorkflowBundle(roundtrip),roundtrip);
  assert.equal((await sealWorkflowBundle(roundtrip)).sourceHash,original.sourceHash);
  assert.deepEqual(dynamicReplayIntent(roundtrip,{query:'lens',productName:'Lens Y'}).values,
    {query:'lens',productName:'Lens Y'});
});
test('bundle rejects changed step order, script hash and parameter schema',async()=>{
  const record=await sealWorkflowBundle(await fixture());
  const reordered=structuredClone(record);reordered.segments.reverse();
  await assert.rejects(verifyWorkflowBundle(reordered),{code:'E_WORKFLOW_BUNDLE'});
  const edited=structuredClone(record);edited.segments[0].sourceHash='a'.repeat(64);
  // A mismatched proof is rejected as malformed evidence *before* bundle hash
  // verification. An internally consistent, changed segment still fails the
  // immutable manifest hash, independently of the proof/format invariant.
  await assert.rejects(verifyWorkflowBundle(edited),{code:'E_WORKFLOW_BUNDLE'});
  edited.segments[0].proof.sourceHash=edited.segments[0].sourceHash;
  await assert.rejects(verifyWorkflowBundle(edited),{code:'E_WORKFLOW_HASH'});
  const param=structuredClone(record);param.paramsSchema.properties.query.default='modified';
  await assert.rejects(verifyWorkflowBundle(param),{code:'E_WORKFLOW_BUNDLE'});
});
test('bundle denies query secrets, duplicate identities and conflicts',async()=>{
  const record=await fixture();
  record.segments[0].entryUrl=origin+'/search?token=secret';
  await assert.rejects(sealWorkflowBundle(record),{code:'E_WORKFLOW_BUNDLE'});
  record.segments[0].entryUrl=origin+'/search?q=camera';
  record.segments[1].workflow.workflowId=record.segments[0].workflow.workflowId;
  await assert.rejects(sealWorkflowBundle(record),{code:'E_WORKFLOW_BUNDLE'});
});
test('AI-off fragment progression requires a matching independently proven effect',()=>{
  const expected={kind:'product-page',name:'Camera X'};
  const good={ok:true,evidenceLevel:'BUSINESS_EFFECT_VERIFIED',
    effect:{kind:'product-page',name:'Camera X',price:'$99'}};
  assert.equal(verifyReplayBusinessEffect(expected,good),true);
  assert.equal(verifyReplayBusinessEffect(expected,{...good,effect:{...good.effect,name:'Camera Y'}}),false);
  assert.equal(verifyReplayBusinessEffect(expected,{...good,effect:{...good.effect,price:'??'}}),false);
  assert.equal(verifyReplayBusinessEffect(expected,{...good,evidenceLevel:'EXECUTION_RECEIPT_VERIFIED'}),false);
  assert.equal(verifyReplayBusinessEffect({kind:'input-readback'},
    {ok:true,evidenceLevel:'BUSINESS_EFFECT_VERIFIED',readbackVerified:true}),true);
  assert.equal(verifyReplayBusinessEffect({kind:'read-only'},
    {ok:true,readOnlyVerified:false}),false);
});
test('forged completion receipt never binds to another source revision',async()=>{
  const value=await fixture();
  value.segments[0].proof.resultId='';
  await assert.rejects(sealWorkflowBundle(value),{code:'E_WORKFLOW_BUNDLE'});
  value.segments[0].proof.resultId='result-1';
  value.segments[0].proof.sourceHash='0'.repeat(64);
  await assert.rejects(sealWorkflowBundle(value),{code:'E_WORKFLOW_BUNDLE'});
});

test('legacy bundle blocks changed parameters before any side effect can be replayed',async()=>{
  const record=await sealWorkflowBundle(await fixture());
  assert.doesNotThrow(()=>assertLegacyReplayParameterScope(record,{query:'camera'}));
  assert.throws(()=>assertLegacyReplayParameterScope(record,{query:'lens'}),
    {code:'E_WORKFLOW_PARAM_BINDING'});
  assert.throws(()=>assertLegacyReplayParameterScope(record,{}),
    {code:'E_WORKFLOW_PARAM_BINDING'});
});


async function dynamicCommerceFixture() {
  const querySchema={type:'object',properties:{query:{
    type:'string',title:'搜索关键词',maxLength:120,default:'camera'}},
    required:['query'],additionalProperties:false};
  const productSchema={type:'object',properties:{productName:{
    type:'string',title:'目标商品名称',maxLength:120,default:'Camera X'}},
    required:['productName'],additionalProperties:false};
  const first=part(bundleId+'-s1',origin,[
    {stepId:'fill',op:'fill',locatorKind:'css',selector:'#keyword',param:'query'},
    {stepId:'search',op:'click',locatorKind:'role',selector:'button',roleName:'Search'}
  ],querySchema);
  const guard={href:'/product/23',url:origin+'/product/23',origin,
    name:'Camera X',sourceUrl:origin+'/search?q=camera',
    locatorKind:'role',selector:'link',roleName:'Camera X'};
  const second=part(bundleId+'-s2',origin,[
    {stepId:'product',op:'click',locatorKind:'role',selector:'link',
      roleName:'Camera X',param:'productName',linkGuard:guard}
  ],productSchema);
  const frozenSearch=await compileWorkflow(first,{verifyFill:true});
  const frozenProduct=await compileWorkflow(second);
  const segments=[
    {workflow:first,entryUrl:origin+'/demo',revision:1,sourceHash:frozenSearch.sourceHash,
      verificationMode:'fill-readback',evidence:{kind:'search-results'},
      proof:{runId:'original-search',resultId:'receipt-search',
        sourceHash:frozenSearch.sourceHash,origin,documentId:'search-document'}},
    {workflow:second,entryUrl:origin+'/search?q=camera',revision:2,
      sourceHash:frozenProduct.sourceHash,verificationMode:'none',
      evidence:{kind:'product-page',name:'Camera X'},
      proof:{runId:'original-product',resultId:'receipt-product',
        sourceHash:frozenProduct.sourceHash,origin,documentId:'results-document'}}
  ];
  const goal='搜索 camera，打开 Camera X 商品详情，核对名称和价格';
  const bindingPlan=inferDynamicReplayPlan({goal,segments});
  return {format:WORKFLOW_DYNAMIC_BUNDLE_FORMAT,bundleId,revision:1,goal,
    title:'商品动态复跑',workflow:{workflowId:bundleId,title:'商品动态复跑',siteOrigin:origin},
    segments,paramsSchema:replayParameterSchema(segments),bindingPlan};
}
test('v2 seals only verified search-to-product source and rebinds explicit values without source changes',async()=>{
  const manifest=await dynamicCommerceFixture();
  assert.deepEqual(manifest.bindingPlan,{kind:'search-to-product.v1',
    queryParam:'query',productParam:'productName',searchStepId:'fill',
    linkStepId:'product',allowedOrigin:origin});
  const saved=await sealWorkflowBundle(manifest);
  assert.deepEqual(await verifyWorkflowBundle(saved),saved);
  assert.match(saved.sourceHash,/^[a-f0-9]{64}$/);
  const original=dynamicReplayIntent(saved,{query:'camera',productName:'Camera X'});
  const changed=dynamicReplayIntent(saved,{query:'lens',productName:'Lens Y'});
  assert.match(original.goal,/camera.*Camera X/);
  assert.match(changed.goal,/lens.*Lens Y/);
  assert.deepEqual(changed.values,{query:'lens',productName:'Lens Y'});
  assert.equal(saved.segments[0].sourceHash,manifest.segments[0].sourceHash);
  assert.equal(saved.segments[1].sourceHash,manifest.segments[1].sourceHash);
  const source=(await compileWorkflow(manifest.segments[1].workflow)).sourceUtf8;
  assert.match(source,/__odLinks/);
  assert.match(source,/__named\.count/);
  assert.doesNotMatch(source,/\/product\/23/,'frozen source must not embed old product href');
});
test('v2 refuses guessed targets, changed authority, forged binding plan and v1 implicit migration',async()=>{
  const original=await dynamicCommerceFixture(),saved=await sealWorkflowBundle(original);
  assert.throws(()=>dynamicReplayIntent(saved,{query:'lens'}),{code:'E_WORKFLOW_PARAM_BINDING'});
  assert.throws(()=>dynamicReplayIntent(saved,{query:'lens',productName:'<script>'}),
    {code:'E_WORKFLOW_PARAM_BINDING'});
  assert.throws(()=>dynamicReplayIntent(saved,{query:'lens',productName:'Camera X',extra:'bad'}),
    {code:'E_SCHEMA'});
  const forged=structuredClone(saved);
  forged.bindingPlan.allowedOrigin='https://evil.example';
  await assert.rejects(verifyWorkflowBundle(forged),{code:'E_WORKFLOW_PARAM_BINDING'});
  const changed=structuredClone(saved);
  changed.segments[1].workflow.steps[0].linkGuard.url='https://evil.example/other';
  await assert.rejects(verifyWorkflowBundle(changed),{code:'E_WORKFLOW_SCHEMA'});
  const unsafe=await dynamicCommerceFixture();
  unsafe.goal+='，付款并提交订单';
  assert.equal(inferDynamicReplayPlan(unsafe),null);
  const conditional=await dynamicCommerceFixture();
  conditional.goal+='，且价格必须低于 100 元';
  assert.equal(inferDynamicReplayPlan(conditional),null,
    'v2 must not drop extra original price conditions');
  const negated=await dynamicCommerceFixture();
  negated.goal='搜索 camera，但不要打开 Camera X 商品详情，核对名称和价格';
  assert.equal(inferDynamicReplayPlan(negated),null);
  await assert.rejects(sealWorkflowBundle(unsafe),{code:'E_WORKFLOW_PARAM_BINDING'});
  const v1={...original,format:WORKFLOW_BUNDLE_FORMAT};
  delete v1.bindingPlan;
  const legacy=await sealWorkflowBundle(v1);
  assert.throws(()=>assertLegacyReplayParameterScope(legacy,{query:'lens',productName:'Lens Y'}),
    {code:'E_WORKFLOW_PARAM_BINDING'});
  const unapproved=await dynamicCommerceFixture();
  unapproved.segments[1].workflow.siteOrigin='https://second.example';
  assert.throws(()=>inferDynamicReplayPlan(unapproved),{code:'E_WORKFLOW_SCHEMA'});
});
