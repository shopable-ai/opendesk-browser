import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {encodeValue} from '../../../src/platform/page-port/codec.js';
import {REVIEWED_BUILTIN_TASK_RELEASES} from '../../../src/platform/tasks/builtin-releases.js';
import {CHAT_HANDOFF_PROTOCOL} from '../src/chat-handoff-contract.js';
import {attestChatHandoffBReply} from '../trusted/chat-handoff-receipt.js';

const digest=s=>createHash('sha256').update(s).digest('hex');
const NOW=1800000000000,CHAT='6af1df79-ab04-83e8-8e06-db19beebafab';
const REQ='request-0001',RUN='run-0001',PROMPT='Analyze this issue';
const pin=REVIEWED_BUILTIN_TASK_RELEASES.find(x=>x.taskId==='chatgpt.conversation.create'&&x.version==='0.2.0');
const install={version:pin.version,manifestHash:pin.manifestHash,contentHash:pin.sourceHash,
  scriptId:'task:chatgpt.conversation.create:'+pin.version,revision:1,
  installationId:'installation-0001',generation:1};
const request={taskId:'chatgpt.conversation.create',targetUrl:'https://chatgpt.com/',
  requestId:REQ,args:{prompt:PROMPT,send:true},installation:install};
const A={adapter:'chatgpt-web',profileId:'profile-001',conversationId:'conversation-001',turnId:'turn-001'};
const B={adapter:'chatgpt-web',profileId:A.profileId,mode:'create-new',conversationId:null};
const REF={kind:'github-issue',id:'issue-public-001',sha256:'a'.repeat(64)};
const h={protocol:CHAT_HANDOFF_PROTOCOL,workflowId:'workflow-001',stepId:'step-0001',
  handoffId:'handoff-001',attemptId:'attempt-001',idempotencyKey:JSON.stringify([
    CHAT_HANDOFF_PROTOCOL,'workflow-001','step-0001','handoff-001']),
  source:A,target:B,returnTo:A,objective:'Read only analysis',summary:'Public issue',
  inputRefs:[REF],expectedResult:{kind:'assistant-reply',mustIncludeEvidence:true},
  authorizationRef:'grantref-001',stopConditions:['Stop on credentials'],
  limits:{maxSteps:2,maxHandoffs:1,maxNewConversations:1,deadlineAt:NOW+10000},
  createdAt:NOW-1000,expiresAt:NOW+5000};
const scope={expectedSource:A,expectedTarget:B,expectedInputRefs:[REF],
  expectedAuthorizationRef:'grantref-001',expectedPromptSha256:digest(PROMPT)};
const value={kind:'chatgpt.conversation.create.result',version:2,status:'reply-complete',
  send:true,messageConfirmed:true,conversationId:CHAT,
  conversationUrl:'https://chatgpt.com/c/'+CHAT,sourceUrl:'https://chatgpt.com/',
  promptChars:PROMPT.length,readbackConfirmed:true,
  observedAt:'2026-11-10T12:30:00.000Z',
  userMessageRef:'user-msg-0001',assistantMessageRef:'assistant-msg-0001',
  replyText:'The issue has been reviewed; no side effects'};
function snapshot(v=value){
  const revision={scriptId:install.scriptId,revision:1,sourceHash:install.contentHash};
  return {run:{tag:'controller-run',runId:RUN,requestId:REQ,resultId:'result-0001',
    state:'completed',retirementState:'released',sourceKind:'saved',
    scriptId:install.scriptId,contentHash:install.contentHash,revision,
    targetDisposition:'retain-on-success',
    target:{mode:'owned',frameId:0,tabId:22,documentId:'document-0001',
      allowedOrigin:'https://chatgpt.com'},
    retainedTarget:{tabId:22,documentId:'document-0001',origin:'https://chatgpt.com',
      url:'https://chatgpt.com/c/'+CHAT}},
    results:[{runId:RUN,resultId:'result-0001',state:'completed',tag:'controller-result',
      sourceKind:'saved',revision,outcome:{ok:true,valueWire:encodeValue(v)}}],
    resultDeliveryDenied:[]};
}
const fixture=over=>({handoffJson:JSON.stringify(h),trustedScope:scope,
  approvedAt:NOW,operationRef:REQ,request,taskRunId:RUN,
  readController:async()=>snapshot(),assertLiveSource:async()=>({...A}),
  verifyTargetProfile:async()=>A.profileId,clock:()=>NOW+20000,...over});
test('verifies original B durable reply but does not claim delivery to A',async()=>{
  const actual=await attestChatHandoffBReply(fixture());
  assert.equal(actual.readOnly,true);assert.equal(actual.runId,RUN);
  assert.equal(actual.conversationId,CHAT);
  assert.equal(actual.replySha256,digest(value.replyText));
  assert.equal(Object.hasOwn(actual,'delivered'),false);
  assert.ok(Object.isFrozen(actual));assert.ok(Object.isFrozen(actual.source));
});
test('lost task ACK may read back original identity but never resubmit',async()=>{
  let reads=0;
  const actual=await attestChatHandoffBReply(fixture({taskRunId:null,
    readController:async q=>{reads++;return q.runId?snapshot():{runs:[{
      requestId:REQ,scriptId:install.scriptId,runId:RUN}]};}}));
  assert.equal(actual.runId,RUN);assert.equal(reads,2);
  await assert.rejects(attestChatHandoffBReply(fixture({taskRunId:null,
    readController:async()=>({runs:[]})})),{code:'E_CHAT_RECEIPT_UNKNOWN'});
});
test('wrong A, account, Controller run, or B target URL refuses attestation',async()=>{
  await assert.rejects(attestChatHandoffBReply(fixture({
    assertLiveSource:async()=>({...A,conversationId:'other-0001'})})),
    {code:'E_CHAT_RECEIPT_SOURCE'});
  await assert.rejects(attestChatHandoffBReply(fixture({
    verifyTargetProfile:async()=> 'other-profile'})),{code:'E_CHAT_RECEIPT_PROFILE'});
  const wrong=snapshot();wrong.run.requestId='other-0001';
  await assert.rejects(attestChatHandoffBReply(fixture({readController:async()=>wrong})),
    {code:'E_CHAT_RECEIPT_TARGET'});
  const forged=snapshot();forged.run.retainedTarget.url='https://chatgpt.com/c/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  await assert.rejects(attestChatHandoffBReply(fixture({readController:async()=>forged})),
    {code:'E_CHAT_RECEIPT_IDENTITY'});
});
test('only reviewed B-target mismatch is reclassified; broken durable records retain bridge error',async()=>{
  const broken=snapshot();broken.results=[];
  await assert.rejects(attestChatHandoffBReply(fixture({
    readController:async()=>broken})),{code:'E_BRIDGE_RESULT'});
});
test('bad approval, prompt drift and incomplete B reply are not success',async()=>{
  await assert.rejects(attestChatHandoffBReply(fixture({
    trustedScope:{...scope,expectedAuthorizationRef:'wrong-grant'}})),
    {code:'E_CHAT_HANDOFF_SCOPE'});
  await assert.rejects(attestChatHandoffBReply(fixture({
    trustedScope:{...scope,expectedPromptSha256:'b'.repeat(64)}})),
    {code:'E_CHAT_RECEIPT_PROMPT'});
  await assert.rejects(attestChatHandoffBReply(fixture({
    readController:async()=>snapshot({...value,status:'streaming'})})),
    {code:'E_CHAT_CREATE_RESULT'});
});
test('expired admission only allows read-only original reconciliation',async()=>{
  const actual=await attestChatHandoffBReply(fixture());
  assert.equal(actual.readOnly,true);
  assert.ok(actual.observedAt>h.expiresAt);
});
