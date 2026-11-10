// OD-AI-WORKFLOW-BRIDGE: V2 must never inherit any V1 grant or create a second Run ledger.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createChatGPTBridgeTriggerLedger,CHATGPT_BRIDGE_LEDGER_KEY} from '../../../src/native-agent/chatgpt-bridge-trigger-gate.js';
import {CHATGPT_TASK_PROFILE} from '../../../src/page-events/web-task-contract.js';
import {BUILTIN_TASK_RELEASES} from '../../../src/platform/tasks/builtin-releases.js';
import {encodeValue} from '../../../src/platform/page-port/codec.js';
import {WEBFLOW_AUTO_GRANTS_KEY} from '../src/auto-grants.js';

const source={tabId:19,documentId:'chat-document-v2',
  url:'https://chatgpt.com/c/0be71d2c-7f21-4d98-963a-5edbcabca394'};
const pin=BUILTIN_TASK_RELEASES.find(row=>row.taskId==='baidu.search.top3');
const scope={taskId:'baidu.search.top3',targetUrl:'https://www.baidu.com/',
  args:{query:'Chrome Side Panel API',limit:3},sourceOrigin:'https://chatgpt.com',
  installation:{version:pin.version,manifestHash:pin.manifestHash,contentHash:pin.sourceHash,
    scriptId:`task:baidu.search.top3:${pin.version}`,revision:1,installationId:'v2-install-1',generation:1}};
const candidateFor=n=>{
  const candidateId=`wf-v2-test-candidate-${n.toString().padStart(3,'0')}`;
  return {candidateId,turnKey:`turn-${n}`,answerKey:`answer-${n}`,
    text:JSON.stringify({protocol:'webflow.task.intent.v2',candidateId,taskId:scope.taskId,args:scope.args})};
};
function harness(){
  const state={},session={};let id=0;
  const storage={get:async key=>({[key]:structuredClone(state[key])}),
    set:async value=>{Object.assign(state,structuredClone(value));}};
  const revocationStorage={get:async key=>({[key]:structuredClone(session[key])}),
    set:async value=>{Object.assign(session,structuredClone(value));}};
  const create=()=>createChatGPTBridgeTriggerLedger({storage,revocationStorage,
    generateId:()=>`e0000000-0000-4000-8000-${String(++id).padStart(12,'0')}`});
  let ledger=create();
  return {
    get ledger(){return ledger;},get state(){return state;},
    restart(){ledger=create();},
    admit(candidate){return ledger.admitWebTask({source,site:CHATGPT_TASK_PROFILE,
      ...structuredClone(scope),candidate,allowPending:true});}
  };
}
const approve=async(h,request,candidate)=>h.ledger.approveV2Pending({
  requestId:request.requestId,source,candidate,scope});
const admission=request=>({requestId:request.requestId,
  source:{kind:'saved',scriptId:scope.installation.scriptId,
    revision:scope.installation.revision,contentHash:scope.installation.contentHash},
  paramsWire:encodeValue(scope.args),target:{mode:'owned',url:scope.targetUrl},
  expectedTaskGeneration:scope.installation.generation,
  expectedTaskInstallationId:scope.installation.installationId});

test('identical old V1 grant never automatically approves a V2 candidate',async()=>{
  const h=harness();
  await h.ledger.approveAuto(scope);await h.ledger.setAutoEnabled(true);
  const originalGrant=h.state[WEBFLOW_AUTO_GRANTS_KEY].grants[scope.taskId].grantId;
  const candidate=candidateFor(1),request=await h.admit(candidate);
  assert.equal(request.pendingApproval,true);
  assert.equal(h.state[CHATGPT_BRIDGE_LEDGER_KEY][request.requestId].status,'prepared');
  assert.equal(h.state[CHATGPT_BRIDGE_LEDGER_KEY][request.requestId].autoGrantId,undefined);
  await assert.rejects(h.ledger.approveAuto(scope,{pendingRequest:{source,requestId:request.requestId,candidate}}));
  assert.equal(await h.ledger.claimWebTask({documentId:'original-runner-document',verify:async()=>()=>{}}),null);
  assert.equal(h.state[WEBFLOW_AUTO_GRANTS_KEY].grants[scope.taskId].grantId,originalGrant);
});

test('V2 trusted single-candidate approval survives restart but cannot be repeated or used for a different candidate',async()=>{
  const h=harness();
  const candidate=candidateFor(2),request=await h.admit(candidate);
  assert.equal(request.pendingApproval,true,'V2 review works with legacy auto mode disabled');
  await approve(h,request,candidate);
  assert.equal(h.state[WEBFLOW_AUTO_GRANTS_KEY],undefined,'V2 approval must not create a V1 task-wide grant');
  assert.equal(h.state[CHATGPT_BRIDGE_LEDGER_KEY][request.requestId].status,'approved');
  h.restart();
  await assert.rejects(approve(h,request,candidate),{code:'E_WEBFLOW_V2_DENIED'});
  await h.ledger.assertV2WebTaskGrant({requestId:request.requestId,source,scope,
    grantId:h.state[CHATGPT_BRIDGE_LEDGER_KEY][request.requestId].autoGrantId,
    epoch:h.state[CHATGPT_BRIDGE_LEDGER_KEY][request.requestId].autoEpoch});
  const newer=await h.admit(candidateFor(3));
  assert.equal(newer.pendingApproval,true);
  assert.equal(h.state[CHATGPT_BRIDGE_LEDGER_KEY][newer.requestId].autoGrantId,undefined);
  await assert.rejects(approve(h,newer,candidate),{code:'E_WEBFLOW_V2_DENIED'});
});

test('one V2 approval enters the original Controller exactly once; UNKNOWN and revocation fail closed',async()=>{
  const h=harness(),candidate=candidateFor(4),request=await h.admit(candidate);
  await approve(h,request,candidate);
  await h.ledger.armWebTask(request.requestId,source);
  const claimed=await h.ledger.claimWebTask({documentId:'original-offscreen-host',
    verify:async()=>()=>{}});
  assert.equal(claimed.requestId,request.requestId);
  let starts=0;
  const verify=async()=>()=>{};
  await h.ledger.withControllerAdmission(admission(request),async()=>{starts++;return {runId:'run-once'};},verify);
  h.restart();
  await assert.rejects(h.ledger.withControllerAdmission(admission(request),async()=>{starts++;},verify),
    {code:'E_BRIDGE_REPLAY'});
  assert.equal(starts,1);
  assert.equal(h.state[CHATGPT_BRIDGE_LEDGER_KEY][request.requestId].controllerSubmitted,true);
  await h.ledger.revokeRequest({source,requestId:request.requestId});
  await assert.rejects(h.ledger.assertV2WebTaskGrant({requestId:request.requestId,source,scope,
    grantId:claimed.autoGrantId,epoch:claimed.autoEpoch}),{code:'E_WEBFLOW_V2_DENIED'});
});

test('V2 refuses a changed approved target, stale page identity, and unsupported dynamic task',async()=>{
  const h=harness(),candidate=candidateFor(5),request=await h.admit(candidate);
  await assert.rejects(h.ledger.approveV2Pending({source,requestId:request.requestId,candidate,
    scope:{...scope,targetUrl:'https://www.google.com/'}}),{code:'E_WEBFLOW_V2_DENIED'});
  await assert.rejects(h.ledger.approveV2Pending({source:{...source,documentId:'different'},requestId:request.requestId,candidate,
    scope}),{code:'E_WEBFLOW_V2_DENIED'});
  const dynamic={candidateId:'wf-v2-test-dynamic-1',turnKey:'turn-dynamic',answerKey:'answer-dynamic',
    text:JSON.stringify({protocol:'webflow.task.intent.v2',candidateId:'wf-v2-test-dynamic-1',
      taskId:'chatgpt.conversation.create',args:{send:false}})};
  await assert.rejects(h.ledger.admitWebTask({source,site:CHATGPT_TASK_PROFILE,
    ...scope,taskId:'chatgpt.conversation.create',
    installation:{...scope.installation,scriptId:`task:chatgpt.conversation.create:${pin.version}`},
    candidate:dynamic,allowPending:true}),{
    code:'E_WEBFLOW_TARGET_UNBOUND'});
});
