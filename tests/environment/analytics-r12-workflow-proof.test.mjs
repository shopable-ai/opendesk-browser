import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {encodeValue} from '../../src/platform/page-port/codec.js';
import {WORKFLOW_OBSERVE_SOURCE} from '../../src/ui/workflow/observation.js';
import {verifyWorkflowLinkBusinessProof} from '../../src/analytics/workflow-business-proof.js';
import {workflowLinkBusinessRunRefs} from '../../src/ui/workflow/direct-execution.js';

const observerHash=createHash('sha256').update(WORKFLOW_OBSERVE_SOURCE).digest('hex');
const actionHash='b'.repeat(64);
const entryUrl='https://shop.example/search?q=camera';
const destinationUrl='https://shop.example/products/camera-x';
const entryTarget={windowId:4,tabId:12,frameId:0,documentId:'entry-document',url:entryUrl};
const destinationTarget={...entryTarget,documentId:'detail-document',url:destinationUrl};
const when=offset=>new Date(Date.UTC(2026,9,24,0,0,offset)).toISOString();

function evidenceFixture(){
  const hostDocumentId='trusted-sidepanel-document',hostInstanceId=randomUUID();
  const namespace='analytics-workflow-test',origin=new URL(destinationUrl).origin;
  const actionRunId=randomUUID(),beforeRunId=randomUUID(),afterRunId=randomUUID();
  const actionResultId=randomUUID(),beforeResultId=randomUUID(),afterResultId=randomUUID();
  const makeRun=(runId,resultId,target,hash,at,observer=false)=>({
    tag:'controller-run',namespace,runId,resultId,
    hostDocumentId,hostInstanceId,target:{...target},
    state:'completed',workerRetired:true,retirementState:'released',
    sourceKind:observer?'draft':'saved',
    ...(observer?{draftSourceUtf8:WORKFLOW_OBSERVE_SOURCE}:{}),
    contentHash:hash,revision:{sourceHash:hash},createdAt:when(at)
  });
  const makeResult=(runId,resultId,hash,at,value)=>({
    tag:'controller-result',namespace,runId,resultId,
    state:'completed',revision:{sourceHash:hash},
    outcome:{ok:true,...(value?{valueWire:encodeValue(value)}:{})},
    committedAt:when(at)
  });
  const beforeValue={
    kind:'semantic-dom-summary',document:{documentId:entryTarget.documentId,url:entryUrl},
    title:'Search results',
    nodes:[{role:'link',name:'Camera X',state:{visible:true,disabled:false},
      navigation:{url:destinationUrl,origin}}]
  };
  const afterValue={
    kind:'semantic-dom-summary',document:{documentId:destinationTarget.documentId,url:destinationUrl},
    title:'Camera X',
    nodes:[{role:'heading',name:'Camera X',state:{visible:true}},
      {role:'text',text:'$199.00',state:{visible:true}}]
  };
  return {
    hostDocumentId,
    actionRun:makeRun(actionRunId,actionResultId,entryTarget,actionHash,10),
    actionResult:makeResult(actionRunId,actionResultId,actionHash,15),
    beforeRun:makeRun(beforeRunId,beforeResultId,entryTarget,observerHash,0,true),
    beforeResult:makeResult(beforeRunId,beforeResultId,observerHash,5,beforeValue),
    afterRun:makeRun(afterRunId,afterResultId,destinationTarget,observerHash,20,true),
    afterResult:makeResult(afterRunId,afterResultId,observerHash,25,afterValue),
    operations:[{tag:'controller-operation',runId:actionRunId,
      method:'locatorAction',state:'durable',reply:{success:true}}]
  };
}

function observation(run, result, documentId){
  return {format:'opendesk.workflow-observation.v1',runId:run.runId,
    resultId:result.resultId,sourceHash:run.contentHash,
    summary:{documentId}};
}

test('Workflow link B-grade references are three distinct durable observer/action IDs, never page content',()=>{
  const row=evidenceFixture();
  const before=observation(row.beforeRun,row.beforeResult,entryTarget.documentId);
  const after=observation(row.afterRun,row.afterResult,destinationTarget.documentId);
  const input={actionRunId:row.actionRun.runId,before,after,effect:{kind:'product-page'}};
  assert.deepEqual(workflowLinkBusinessRunRefs(input),{
    runId:row.actionRun.runId,beforeRunId:row.beforeRun.runId,afterRunId:row.afterRun.runId
  });
  assert.equal(workflowLinkBusinessRunRefs({...input,effect:{kind:'search-results'}}),null);
  assert.equal(workflowLinkBusinessRunRefs({...input,effect:{kind:'input-readback'}}),null);
  assert.equal(workflowLinkBusinessRunRefs({...input,before:null}),null);
  assert.equal(workflowLinkBusinessRunRefs({...input,after:{...after,runId:before.runId}}),null);
  assert.equal(workflowLinkBusinessRunRefs({...input,after:{...after,sourceHash:actionHash}}),null);
  assert.equal(workflowLinkBusinessRunRefs({...input,after:{...after,summary:before.summary}}),null);
  assert.equal(workflowLinkBusinessRunRefs({...input,after:{...after,resultId:before.resultId}}),null);
});

test('original Controller journals certify only observed navigation with settled Worker and readback',()=>{
  const good=evidenceFixture();
  assert.deepEqual(verifyWorkflowLinkBusinessProof(good),{
    actionTarget:entryTarget,resultTarget:destinationTarget
  });
  const denial=[
    ['no durable user action',v=>{v.operations=[];}],
    ['failure',v=>{v.actionResult.outcome.ok=false;}],
    ['unretired worker',v=>{v.actionRun.workerRetired=false;}],
    ['unknown effect',v=>{v.afterRun.retirementState='pending';}],
    ['wrong sidepanel',v=>{v.actionRun.hostDocumentId='other-document';}],
    ['cross-instance',v=>{v.beforeRun.hostInstanceId='different-instance';}],
    ['copied observer source',v=>{v.afterRun.draftSourceUtf8='async function main(){return true;}';}],
    ['tampered observer hash',v=>{v.afterRun.contentHash=actionHash;}],
    ['forged after result',v=>{v.afterResult.resultId=randomUUID();}],
    ['replayed run',v=>{v.afterRun.runId=v.beforeRun.runId;}],
    ['out-of-order readback',v=>{v.afterRun.createdAt=when(12);}],
    ['unobserved destination',v=>{v.afterRun.target.url='https://shop.example/elsewhere';}],
    ['same document',v=>{v.afterRun.target.documentId=entryTarget.documentId;}],
    ['auto/cloud execution',v=>{v.actionRun.cloudRequestId=randomUUID();}],
    ['wrong click receipt',v=>{v.operations[0].state='pending';}],
    ['nonmatching link',v=>{v.beforeResult.outcome.valueWire=encodeValue({
      kind:'semantic-dom-summary',document:{documentId:entryTarget.documentId,url:entryUrl},
      title:'Search results',nodes:[]});}]
  ];
  for(const [name,change] of denial){
    const evidence=structuredClone(good);
    change(evidence);
    assert.equal(verifyWorkflowLinkBusinessProof(evidence),null,name+' must fail closed');
  }
});

test('formal Workflow UI forwards only three-run link evidence; legacy one-run B-grade is gone',async()=>{
  const ui=await readFile(new URL('../../src/ui/workflow/workflow-view.js',import.meta.url),'utf8');
  assert.match(ui,/workflowLinkBusinessRunRefs\(\{/);
  assert.match(ui,/actionRunId:claim\.runId,before:prepared\.beforeObservation/);
  assert.match(ui,/after:linkEffectAfter,effect/);
  assert.match(ui,/if\(refs\)reportVerifiedWorkflowEffect\(refs\)/);
  assert.doesNotMatch(ui,/reportVerifiedWorkflowEffect\(claim\.runId\)/);
});
