import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeValue} from '../../../src/platform/page-port/codec.js';
import {REVIEWED_BUILTIN_TASK_RELEASES,BUILTIN_TASK_RELEASES}
  from '../../../src/platform/tasks/builtin-releases.js';
import {verifyChatGPTTaskDurableResult,formatChatGPTInstalledResult}
  from '../../../src/native-agent/chatgpt-fixed-bridge-host.js';
import {validateChatGPTCreateResultV3}
  from '../src/chatgpt-conversation-result-v0.3.js';

const pin=REVIEWED_BUILTIN_TASK_RELEASES.find(x=>x.taskId==='chatgpt.conversation.create'&&x.version==='0.3.0');
const origin='https://chatgpt.com/',id='6af1df79-ab04-83e8-8e06-db19beebafab';
const prompt='Test approved original draft',when='2026-11-11T12:10:00.000Z';
const prepareIds={prepareRunId:'run-prepare-0001',prepareRequestId:'request-prepare-0001'};
const install=()=>({version:'0.3.0',manifestHash:pin.manifestHash,contentHash:pin.sourceHash,
  scriptId:'task:chatgpt.conversation.create:0.3.0',revision:1,
  installationId:'installation-v3-001',generation:4});
const req=phase=>({taskId:'chatgpt.conversation.create',targetUrl:origin,
  requestId:phase==='prepare'?prepareIds.prepareRequestId:'request-submit-0001',
  args:{prompt,phase,...(phase==='submit'?prepareIds:{})},installation:install()});
const draft=()=>({kind:'chatgpt.conversation.create.result',version:3,phase:'prepare',
  status:'draft-prepared',send:false,messageConfirmed:false,conversationId:null,
  conversationUrl:null,sourceUrl:origin,promptChars:prompt.length,
  readbackConfirmed:true,observedAt:when});
const reply=()=>({kind:'chatgpt.conversation.create.result',version:3,phase:'submit',
  status:'reply-complete',send:true,messageConfirmed:true,conversationId:id,
  conversationUrl:origin+'c/'+id,userMessageRef:'user-msg-0001',
  assistantMessageRef:'assistant-msg-0001',replyText:'The real B reply',
  sourceUrl:origin,promptChars:prompt.length,...prepareIds,
  readbackConfirmed:true,observedAt:when});
function snapshot(phase,value=phase==='prepare'?draft():reply()){
  const r=req(phase),revision={scriptId:r.installation.scriptId,
    revision:1,sourceHash:pin.sourceHash};
  const target={mode:phase==='prepare'?'owned':'borrowed',
    tabId:58,documentId:'document-retained-001',frameId:0,
    allowedOrigin:'https://chatgpt.com',url:phase==='prepare'?origin:value.conversationUrl};
  return {run:{tag:'controller-run',runId:phase==='prepare'?prepareIds.prepareRunId:'run-submit-0001',
    requestId:r.requestId,resultId:'result-0001',state:'completed',retirementState:'released',
    sourceKind:'saved',scriptId:r.installation.scriptId,contentHash:pin.sourceHash,
    revision,targetDisposition:'retain-on-success',target,
    selection:phase==='prepare'?{mode:'owned',url:origin}:
      {mode:'borrowed',tabId:58,frameId:0,documentId:'document-retained-001',expectedUrl:origin},
    ...(phase==='prepare'?{retainedTarget:{tabId:58,documentId:'document-retained-001',
      origin:'https://chatgpt.com',url:origin}}:{retainedFrom:{runId:prepareIds.prepareRunId,
      requestId:prepareIds.prepareRequestId}})},
    },
    results:[{tag:'controller-result',runId:phase==='prepare'?prepareIds.prepareRunId:'run-submit-0001',
      resultId:'result-0001',state:'completed',sourceKind:'saved',revision,
      outcome:{ok:true,valueWire:encodeValue(value)}}],
    resultDeliveryDenied:[]};
}
function verify(phase,value=phase==='prepare'?draft():reply(),patch={}){
  const snap=snapshot(phase,value);
  if(patch.run)snap.run={...snap.run,...patch.run};
  if(patch.results)snap.results=patch.results;
  if(patch.resultDeliveryDenied)snap.resultDeliveryDenied=patch.resultDeliveryDenied;
  const runId=snap.run.runId;
  return verifyChatGPTTaskDurableResult(snap,runId,install(),req(phase));
}

test('0.3 is an explicitly pinned manual release and does not auto-upgrade 0.2',()=>{
  assert.ok(pin);
  assert.equal(BUILTIN_TASK_RELEASES.find(x=>x.taskId===pin.taskId)?.version,'0.2.0');
});
test('0.3 PREPARE verifies only retained unsent original owned B',()=>{
  const found=verify('prepare');
  assert.equal(found.value.conversationUrl,null);
  assert.equal(found.value.status,'draft-prepared');
  assert.equal(verify('prepare',draft(),{run:{retainedContinuation:{runId:'run-submit-0001',requestId:'request-submit-0001'}}}).value.status,'draft-prepared');
  for(const patch of [
    {retainedTarget:null},
    {retainedTarget:{...snapshot('prepare').run.retainedTarget,tabId:59}},
    {target:{...snapshot('prepare').run.target,mode:'borrowed'}},
    {retainedFrom:{runId:'run-incorrect',requestId:'request-incorrect'}}
  ])assert.throws(()=>verify('prepare',draft(),{run:patch}),{code:'E_BRIDGE_RESULT'});
});
test('0.3 SUBMIT validates original borrowed B and exact PREPARE Run identity',()=>{
  const found=verify('submit');
  assert.equal(found.value.conversationUrl,origin+'c/'+id);
  assert.equal(found.value.replyText,'The real B reply');
  const publicRun=snapshot('submit');delete publicRun.run.selection;
  assert.equal(verifyChatGPTTaskDurableResult(publicRun,'run-submit-0001',
    install(),req('submit')).value.replyText,'The real B reply');
  for(const patch of [
    {retainedFrom:{...prepareIds,runId:'other-run-0001'}},
    {target:{...snapshot('submit').run.target,tabId:59}},
    {target:{...snapshot('submit').run.target,mode:'owned'}},
    {target:{...snapshot('submit').run.target,url:'https://chatgpt.com/c/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'}},
    {target:{...snapshot('submit').run.target,documentId:'replaced-document'}},
  ])assert.throws(()=>verify('submit',reply(),{run:patch}),{code:'E_BRIDGE_RESULT'});
});
test('page-controlled incomplete, renamed or extra business claims never pass 0.3',()=>{
  for(const patch of [
    {status:'completed'},
    {conversationUrl:'https://evil.example/c/'+id},
    {prepareRequestId:'not-original-0001'},
    {replyText:''},
    {messageConfirmed:false},
    {unexpected:true}
  ])assert.throws(()=>validateChatGPTCreateResultV3({...reply(),...patch},
    req('submit').args),{code:'E_CHAT_CREATE_RESULT'});
  assert.throws(()=>verify('submit',draft()),{code:'E_CHAT_CREATE_RESULT'});
});
test('0.3 never falls back to generic 7-KiB JSON or existing A delivery formatter',()=>{
  for(const phase of ['prepare','submit']){
    const found=verify(phase);
    assert.throws(()=>formatChatGPTInstalledResult(req(phase),found),{code:'E_BRIDGE_RESULT'});
  }
  const r=req('submit');r.installation.manifestHash='0'.repeat(64);
  assert.throws(()=>verifyChatGPTTaskDurableResult(snapshot('submit'),
    'run-submit-0001',r.installation,r),{code:'E_BRIDGE_RESULT'});
});
