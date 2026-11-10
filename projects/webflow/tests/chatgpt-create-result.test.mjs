import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeValue} from '../../../src/platform/page-port/codec.js';
import {BUILTIN_TASK_RELEASES} from '../../../src/platform/tasks/builtin-releases.js';
import {verifyChatGPTTaskDurableResult,formatChatGPTInstalledResult}
  from '../../../src/native-agent/chatgpt-fixed-bridge-host.js';
import {validateChatGPTCreateResult,formatChatGPTCreateDelivery}
  from '../src/chatgpt-conversation-result.js';

const pin=BUILTIN_TASK_RELEASES.find(row=>row.taskId==='chatgpt.conversation.create');
const uuid='6af1df79-ab04-83e8-8e06-db19beebafab';
const when='2026-11-10T12:30:00.000Z';
const args={prompt:'Build the sample',send:true};
const install={version:pin.version,manifestHash:pin.manifestHash,
  scriptId:'task:chatgpt.conversation.create:'+pin.version,revision:1,
  contentHash:pin.sourceHash,installationId:'installation-0001',generation:1};
const request=(a=args)=>({taskId:'chatgpt.conversation.create',targetUrl:'https://chatgpt.com/',
  requestId:'request-0001',args:a,installation:install});
const base=(reply='Task completed')=>({
  kind:'chatgpt.conversation.create.result',version:2,status:'reply-complete',
  send:true,messageConfirmed:true,conversationId:uuid,
  conversationUrl:'https://chatgpt.com/c/'+uuid,sourceUrl:'https://chatgpt.com/',
  promptChars:args.prompt.length,readbackConfirmed:true,observedAt:when,
  userMessageRef:'user-msg-0001',assistantMessageRef:'assistant-msg-0001',replyText:reply
});
const draft=()=>({
  kind:'chatgpt.conversation.create.result',version:2,status:'draft-prepared',
  send:false,messageConfirmed:false,conversationId:null,conversationUrl:null,
  sourceUrl:'https://chatgpt.com/',promptChars:args.prompt.length,
  readbackConfirmed:true,observedAt:when
});
function snapshot(value){
  const revision={scriptId:install.scriptId,revision:1,sourceHash:pin.sourceHash};
  return {run:{runId:'run-0001',resultId:'result-0001',state:'completed',
    retirementState:'released',sourceKind:'saved',scriptId:install.scriptId,
    contentHash:pin.sourceHash,revision},
    results:[{runId:'run-0001',resultId:'result-0001',state:'completed',
      tag:'controller-result',sourceKind:'saved',revision,
      outcome:{ok:true,valueWire:encodeValue(value)}}],
    resultDeliveryDenied:[]};
}
const verify=(value,a=args,patch={})=>
  verifyChatGPTTaskDurableResult({...snapshot(value),...patch},'run-0001',install,request(a));

test('draft verified but never given a fabricated persistent conversation URL',()=>{
  const a={...args,send:false},value=draft(),d=verify(value,a);
  const text=formatChatGPTInstalledResult(request(a),d);
  assert.equal(d.value.conversationId,null);
  assert.equal(text.includes('https://chatgpt.com/c/'),false);
  assert.match(text,/没有发送/);
});
test('real B identities are validated before a clickable link returns to A',()=>{
  const d=verify(base()),text=formatChatGPTInstalledResult(request(),d);
  assert.equal(d.value.replyText,'Task completed');
  assert.match(text,/\[打开新对话 B\]\(https:\/\/chatgpt\.com\/c\//);
  assert.match(text,/run-0001/);
  assert.match(text,/result-0001/);
  assert.match(text,/assistant-msg-0001/);
});
test('long complete reply remains in durable result, bounded A delivery is explicit preview',()=>{
  const body='长回复。'.repeat(5000),d=verify(base(body));
  const output=formatChatGPTCreateDelivery(request(),d);
  assert.equal(d.value.replyText,body);
  assert.ok(new TextEncoder().encode(output).byteLength<8192);
  assert.match(output,/fullReplyInDurableResult/);
  assert.match(output,/replyPreviewComplete/);
  assert.ok(!output.includes(body));
});
test('wrong site, conversation ID, query, unstable message or extra field fail closed',()=>{
  for(const bad of [
    {conversationUrl:'https://evil.example/c/'+uuid},
    {conversationUrl:'https://chatgpt.com/c/'+uuid+'?x=1'},
    {conversationId:'fake-id'},
    {sourceUrl:'https://chatgpt.com/c/'+uuid},
    {userMessageRef:''},
    {assistantMessageRef:'user-msg-0001'},
    {promptChars:9999},{messageConfirmed:false},
    {status:'streaming'},{readbackConfirmed:false},{unexpected:true}
  ])assert.throws(()=>validateChatGPTCreateResult({...base(),...bad},args),
    {code:'E_CHAT_CREATE_RESULT'});
});
for(const field of ['userMessageRef','assistantMessageRef']){
  test(`${field} must be a present string without coercion`,()=>{
    const missing=base();
    delete missing[field];
    assert.throws(()=>validateChatGPTCreateResult(missing,args),
      {code:'E_CHAT_CREATE_RESULT'});
    for(const invalid of [undefined,null,12345678,{},
      {toString:()=> 'message-0001'},
      {toString:()=>{throw new Error('Must not coerce message reference');}}]){
      assert.throws(()=>validateChatGPTCreateResult({...base(),[field]:invalid},args),
        {code:'E_CHAT_CREATE_RESULT'});
    }
  });
}
test('unverified explicit model/effort and send mismatch cannot be reported as business success',()=>{
  for(const a of [
    {...args,model:'GPT-6'},{...args,effort:'High'},
    {...args,thinking:true},{...args,send:false}
  ])assert.throws(()=>validateChatGPTCreateResult(base(),a),{code:'E_CHAT_CREATE_RESULT'});
});
test('unsent draft cannot smuggle a URL, message or completed reply',()=>{
  for(const bad of [
    {conversationId:uuid},{conversationUrl:'https://chatgpt.com/c/'+uuid},
    {messageConfirmed:true},{status:'reply-complete'}
  ])assert.throws(()=>validateChatGPTCreateResult({...draft(),...bad},{...args,send:false}),
    {code:'E_CHAT_CREATE_RESULT'});
});
test('failed, incomplete or delivery-denied Controller result is never presented to A',()=>{
  for(const bad of [
    {run:{...snapshot(base()).run,state:'failed'}},
    {run:{...snapshot(base()).run,retirementState:'unknown'}},
    {results:[]},{resultDeliveryDenied:['run-0001']}
  ])assert.throws(()=>verify(base(),args,bad),{code:/E_BRIDGE_/});
});
test('delivery formatter refuses data with no verified original request identity',()=>{
  assert.throws(()=>formatChatGPTCreateDelivery({...request(),requestId:''},
    {runId:'run-0001',resultId:'result-0001',value:base()}),
  {code:'E_CHAT_CREATE_RESULT'});
});
for(const field of ['requestId','runId','resultId']){
  test(`delivery ${field} must be a present string without coercion`,()=>{
    const r=request(),d={runId:'run-0001',resultId:'result-0001',value:base()};
    const owner=field==='requestId'?r:d;
    delete owner[field];
    assert.throws(()=>formatChatGPTCreateDelivery(r,d),{code:'E_CHAT_CREATE_RESULT'});
    for(const invalid of [undefined,null,12345678,{},
      {toString:()=> 'receipt-0001'},
      {toString:()=>{throw new Error('Must not coerce receipt identity');}}]){
      owner[field]=invalid;
      assert.throws(()=>formatChatGPTCreateDelivery(r,d),{code:'E_CHAT_CREATE_RESULT'});
    }
  });
}
