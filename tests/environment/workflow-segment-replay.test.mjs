import test from 'node:test';
import assert from 'node:assert/strict';
import {compileWorkflow} from '../../src/framework/workflow/compiler.js';
import {sealWorkflowBundle,verifyWorkflowBundle,replayParameterSchema,
  verifyReplayBusinessEffect,WORKFLOW_BUNDLE_FORMAT} from '../../src/ui/workflow/segment-replay.js';

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
test('bundle rejects changed step order, script hash and parameter schema',async()=>{
  const record=await sealWorkflowBundle(await fixture());
  const reordered=structuredClone(record);reordered.segments.reverse();
  await assert.rejects(verifyWorkflowBundle(reordered),{code:'E_WORKFLOW_BUNDLE'});
  const edited=structuredClone(record);edited.segments[0].sourceHash='a'.repeat(64);
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
