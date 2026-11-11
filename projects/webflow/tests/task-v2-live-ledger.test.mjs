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

test('V2 standing scope persists across restart and a new source A without V1 inheritance',async()=>{
  const h=harness(),candidate=candidateFor(2),request=await h.admit(candidate);
  assert.equal(request.pendingApproval,true);
  await approve(h,request,candidate);
  const settings=h.state[WEBFLOW_AUTO_GRANTS_KEY];
  assert.equal(settings.enabled,true);
  assert.equal(settings.grants[scope.taskId].intentProtocol,'webflow.task.intent.v2');
  assert.equal(settings.grants[scope.taskId].grantId,
    h.state[CHATGPT_BRIDGE_LEDGER_KEY][request.requestId].autoGrantId);
  h.restart();
  await assert.rejects(approve(h,request,candidate),{code:'E_WEBFLOW_V2_DENIED'});
  await h.ledger.assertV2WebTaskGrant({requestId:request.requestId,source,scope,
    grantId:h.state[CHATGPT_BRIDGE_LEDGER_KEY][request.requestId].autoGrantId,
    epoch:h.state[CHATGPT_BRIDGE_LEDGER_KEY][request.requestId].autoEpoch});
  const sourceA2={tabId:20,documentId:'new-source-A2',
    url:'https://chatgpt.com/c/69c4fd57-9662-44b3-b0ea-1cd0cdb4ba31'};
  const newer=await h.ledger.admitWebTask({source:sourceA2,site:CHATGPT_TASK_PROFILE,
    ...structuredClone(scope),candidate:candidateFor(3),allowPending:true});
  assert.equal(newer.pendingApproval,false);
  assert.equal(h.state[CHATGPT_BRIDGE_LEDGER_KEY][newer.requestId].status,'approved');
  assert.equal(h.state[CHATGPT_BRIDGE_LEDGER_KEY][newer.requestId].source.documentId,sourceA2.documentId);
  await assert.rejects(approve(h,newer,candidate),{code:'E_WEBFLOW_V2_DENIED'});
});

test('V2 standing scope denies parameter drift and remains revoked after restart',async()=>{
  const h=harness(),candidate=candidateFor(21),request=await h.admit(candidate);
  await approve(h,request,candidate);
  const changedArgs={query:'Different input requires review',limit:3};
  const changed=candidateFor(22);
  changed.text=JSON.stringify({protocol:'webflow.task.intent.v2',
    candidateId:changed.candidateId,taskId:scope.taskId,args:changedArgs});
  const fresh=await h.ledger.admitWebTask({source,site:CHATGPT_TASK_PROFILE,
    ...structuredClone(scope),args:changedArgs,candidate:changed,allowPending:true});
  assert.equal(fresh.pendingApproval,true);
  await h.ledger.revokeAuto(scope.taskId);
  h.restart();
  await assert.rejects(h.ledger.assertV2WebTaskGrant({requestId:request.requestId,source,scope,
    grantId:h.state[CHATGPT_BRIDGE_LEDGER_KEY][request.requestId].autoGrantId,
    epoch:h.state[CHATGPT_BRIDGE_LEDGER_KEY][request.requestId].autoEpoch}),{code:'E_WEBFLOW_V2_DENIED'});
});

test('enabling one newly approved V2 scope does not reactivate other paused task grants',async()=>{
  const h=harness();
  const google=BUILTIN_TASK_RELEASES.find(row=>row.taskId==='google.search.top3');
  assert.ok(google);
  const oldGrant={...structuredClone(scope),taskId:'google.search.top3',
    targetUrl:'https://www.google.com/',
    installation:{...structuredClone(scope.installation),version:google.version,
      manifestHash:google.manifestHash,contentHash:google.sourceHash,
      scriptId:`task:google.search.top3:${google.version}`}};
  await h.ledger.approveAuto(oldGrant);
  await h.ledger.setAutoEnabled(false);
  const candidate=candidateFor(31),request=await h.admit(candidate);
  assert.equal(request.pendingApproval,true);
  await approve(h,request,candidate);
  const settings=h.state[WEBFLOW_AUTO_GRANTS_KEY];
  assert.equal(settings.enabled,true);
  assert.equal(settings.grants[scope.taskId].state,'active');
  assert.equal(settings.grants[oldGrant.taskId].state,'revoked',
    'approving V2 cannot resume an unrelated task paused by the global switch');
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
  assert.throws(()=>h.ledger.approveV2Pending({source,requestId:request.requestId,candidate,
    scope:{...scope,targetUrl:'https://www.google.com/'}}),{code:'E_WEBFLOW_V2_DENIED'});
  await assert.rejects(h.ledger.approveV2Pending({source:{...source,documentId:'different'},requestId:request.requestId,candidate,
    scope}),{code:'E_WEBFLOW_V2_DENIED'});
  // The pinned ChatGPT draft Task is now a reviewed fixed target. An
  // unrelated dynamic Gemini Task must still be rejected before Controller.
  const dynamic={candidateId:'wf-v2-test-dynamic-1',turnKey:'turn-dynamic',answerKey:'answer-dynamic',
    text:JSON.stringify({protocol:'webflow.task.intent.v2',candidateId:'wf-v2-test-dynamic-1',
      taskId:'gemini.conversation.create',args:{send:false}})};
  assert.throws(()=>h.ledger.admitWebTask({source,site:CHATGPT_TASK_PROFILE,
    ...scope,taskId:'gemini.conversation.create',
    installation:{...scope.installation,scriptId:`task:gemini.conversation.create:${pin.version}`},
    candidate:dynamic,allowPending:true}),{
    code:'E_WEBFLOW_TARGET_UNBOUND'});
});

test('ChatGPT omitted send is persistently bound as false before one-use V2 approval',async()=>{
  const release=BUILTIN_TASK_RELEASES.find(row=>row.taskId==='chatgpt.conversation.create');
  assert.ok(release);
  const draftScope={taskId:'chatgpt.conversation.create',targetUrl:'https://chatgpt.com/',
    args:{prompt:'Prepare this B draft',send:false},sourceOrigin:'https://chatgpt.com',
    installation:{version:release.version,manifestHash:release.manifestHash,
      contentHash:release.sourceHash,scriptId:`task:chatgpt.conversation.create:${release.version}`,
      revision:1,installationId:'draft-install-v2',generation:1}};
  const id='wf-v2-draft-aaaaaaaaaaaaaaaaaaaa';
  const candidate={candidateId:id,turnKey:'source-a-turn',answerKey:'source-a-answer',
    text:JSON.stringify({protocol:'webflow.task.intent.v2',candidateId:id,
      taskId:'chatgpt.conversation.create',args:{prompt:'Prepare this B draft'}})};
  const h=harness();
  const admitted=await h.ledger.admitWebTask({source,site:CHATGPT_TASK_PROFILE,
    ...draftScope,candidate,allowPending:true});
  assert.equal(admitted.pendingApproval,true);
  assert.equal(h.state[CHATGPT_BRIDGE_LEDGER_KEY][admitted.requestId].scope.args.send,false);
  const reviewed=await h.ledger.approveV2Pending({source,requestId:admitted.requestId,candidate,
    scope:draftScope});
  assert.equal(reviewed.approved,true);
  h.restart();
  await assert.rejects(h.ledger.approveV2Pending({source,requestId:admitted.requestId,candidate,
    scope:draftScope}),{code:'E_WEBFLOW_V2_DENIED'});
});
