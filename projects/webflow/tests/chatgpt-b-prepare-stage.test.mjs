import test from 'node:test';
import assert from 'node:assert/strict';
import {attestReviewedBPrepare,isReviewedBPrepare}
  from '../trusted/chatgpt-b-prepare-stage.js';
import {createChatGPTBridgeTriggerLedger,CHATGPT_BRIDGE_LEDGER_KEY}
  from '../../../src/native-agent/chatgpt-bridge-trigger-gate.js';
import {CHATGPT_TASK_PROFILE} from '../../../src/page-events/web-task-contract.js';

const source={tabId:19,documentId:'original-chat-doc-001',
  url:'https://chatgpt.com/c/0be71d2c-7f21-4d98-963a-5edbcabca394'};
const original='Test 0.3 no-send draft';
const installation={version:'0.3.0',manifestHash:'a'.repeat(64),
  contentHash:'b'.repeat(64),scriptId:'task:chatgpt.conversation.create:0.3.0',
  revision:1,installationId:'installation-v3-001',generation:3};
const scope={taskId:'chatgpt.conversation.create',targetUrl:'https://chatgpt.com/',
  sourceOrigin:'https://chatgpt.com',args:{prompt:original,phase:'prepare'},
  installation};
function fixture(){
  const store={},session={};let seq=0;
  const storage={get:async key=>({[key]:structuredClone(store[key])}),
    set:async o=>Object.assign(store,structuredClone(o))};
  const revocationStorage={get:async key=>({[key]:structuredClone(session[key])}),
    set:async o=>Object.assign(session,structuredClone(o))};
  const create=()=>createChatGPTBridgeTriggerLedger({storage,revocationStorage,
    generateId:()=> 'a0000000-0000-4000-8000-'+String(++seq).padStart(12,'0')});
  let ledger=create();
  const admit=async()=>{
    const candidateId='wf-b-prepare-000001';
    const candidate={candidateId,turnKey:'turn-b-001',answerKey:'answer-b-001',
      text:JSON.stringify({protocol:'webflow.task.intent.v2',candidateId,
        taskId:scope.taskId,args:scope.args})};
    const row=await ledger.admitWebTask({source,site:CHATGPT_TASK_PROFILE,candidate,
      allowPending:true,...scope});
    await ledger.approveV2Pending({source,requestId:row.requestId,candidate,scope});
    await ledger.armWebTask(row.requestId,source);
    await ledger.claimWebTask({documentId:'trusted-runner-001',verify:async()=>()=>{}});
    // Test the proof ledger gate, not Controller dispatch.
    store[CHATGPT_BRIDGE_LEDGER_KEY][row.requestId].controllerSubmitted=true;
    return row.requestId;
  };
  return {store,admit, get ledger(){return ledger;},restart(){ledger=create();}};
}
function materials(requestId,{changedDocument=false,revoked=false}={}){
  const row={site:CHATGPT_TASK_PROFILE,intentProtocol:'webflow.task.intent.v2',
    status:'consumed',controllerSubmitted:true,requestId,source,scope};
  const run={tag:'controller-run',runId:'run-prepare-0001',requestId,
    resultId:'result-prepare-0001',state:'completed',retirementState:'released',
    targetDisposition:'retain-on-success',
    target:{mode:'owned',tabId:58,frameId:0,documentId:'document-b-001'},
    retainedTarget:{tabId:58,documentId:'document-b-001',
      origin:'https://chatgpt.com',url:'https://chatgpt.com/'}};
  const durable={runId:run.runId,resultId:run.resultId,value:{
    phase:'prepare',status:'draft-prepared',send:false,conversationUrl:null,promptChars:original.length}};
  const api={webNavigation:{getFrame:async()=>({documentId:changedDocument?
    'document-replaced':'document-b-001',url:'https://chatgpt.com/',
    documentLifecycle:'active'})},
    tabs:{get:async()=>({id:58,url:'https://chatgpt.com/',incognito:false,pendingUrl:null})},
    permissions:{contains:async()=>!revoked}};
  return {row,requestId,snapshot:{run},durable,api};
}
test('reviewed 0.3 PREPARE keeps original B and SHA but does not approve send',async()=>{
  const m=materials('request-prepare-0001');
  assert.equal(isReviewedBPrepare(m.row),true);
  const p=await attestReviewedBPrepare(m);
  assert.equal(p.prepareRunId,'run-prepare-0001');
  assert.equal(p.tabId,58);assert.equal(p.documentId,'document-b-001');
  assert.match(p.draftSha256,/^[a-f0-9]{64}$/);
  assert.equal(p.profileVerified,false);
});
test('changed/closed B, revoked origin, wrong original A cannot attest PREPARE',async()=>{
  for(const change of [{changedDocument:true},{revoked:true},{source:{...source,documentId:''}}]){
    const m=materials('request-prepare-0001',change);
    if(change.source)m.row.source=change.source;
    await assert.rejects(attestReviewedBPrepare(m),{code:'E_CHAT_B_PREPARE'});
  }
});
test('the existing trigger row persists PREPARE proof after worker restart',async()=>{
  const h=fixture(),requestId=await h.admit();
  const proof=await attestReviewedBPrepare(materials(requestId));
  const result=await h.ledger.recordWebTaskPreparedB(requestId,proof);
  assert.equal(result.stage,'prepared-account-unverified');
  const stored=h.store[CHATGPT_BRIDGE_LEDGER_KEY][requestId];
  assert.equal(stored.webBPrepared.draftSha256,proof.draftSha256);
  assert.equal(stored.webObservation.execution,'prepared-account-unverified');
  h.restart();
  const again=await h.ledger.recordWebTaskPreparedB(requestId,proof);
  assert.equal(again.stage,'prepared-account-unverified');
  await assert.rejects(h.ledger.recordWebTaskPreparedB(requestId,{...proof,tabId:60}),
    {code:'E_BRIDGE_REPLAY'});
});
test('unverified account, incomplete run or unapproved request never becomes a send grant',async()=>{
  const h=fixture(),requestId=await h.admit(),proof=await attestReviewedBPrepare(materials(requestId));
  await assert.rejects(h.ledger.recordWebTaskPreparedB(requestId,{...proof,profileVerified:true}),
    {code:'E_CHAT_B_PREPARE'});
  const row=h.store[CHATGPT_BRIDGE_LEDGER_KEY][requestId];
  row.status='prepared';
  await assert.rejects(h.ledger.recordWebTaskPreparedB(requestId,proof),{code:'E_CHAT_B_PREPARE'});
  row.status='consumed';row.controllerSubmitted=false;
  await assert.rejects(h.ledger.recordWebTaskPreparedB(requestId,proof),{code:'E_CHAT_B_PREPARE'});
  assert.equal(row.webBPrepared,undefined);
});
