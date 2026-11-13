import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeValue} from '../../../src/platform/page-port/codec.js';
import {BUILTIN_TASK_RELEASES,REVIEWED_BUILTIN_TASK_RELEASES} from '../../../src/platform/tasks/builtin-releases.js';
import {verifyChatGPTTaskDurableResult,formatChatGPTInstalledResult}
  from '../../../src/native-agent/chatgpt-fixed-bridge-host.js';
import {validateChatGPTCreateResult,formatChatGPTCreateDelivery}
  from '../src/chatgpt-conversation-result.js';
import {reviewedChatGPTResultAdapter} from '../trusted/chatgpt-result-adapter.js';

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
function snapshot(value,installed=install){
  const revision={scriptId:installed.scriptId,revision:1,sourceHash:installed.contentHash};
  return {run:{runId:'run-0001',requestId:'request-0001',resultId:'result-0001',state:'completed',
    retirementState:'released',sourceKind:'saved',scriptId:installed.scriptId,
    contentHash:installed.contentHash,revision,targetDisposition:'retain-on-success',
    target:{mode:'owned',tabId:22,frameId:0,documentId:'document-0001',
      allowedOrigin:'https://chatgpt.com'},
    retainedTarget:{tabId:22,documentId:'document-0001',origin:'https://chatgpt.com',
      url:value.send?value.conversationUrl:'https://chatgpt.com/'}},
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
// Decode the actual escaped wire payload, rather than matching preview substrings.
const deliveryPayload=text=>JSON.parse(text.slice(text.indexOf('{')));
const bytes=text=>new TextEncoder().encode(text).byteLength;

test('R11 immutable 0.2.x releases require their own exact reviewed pins with the same complete-result contract',()=>{
  for(const version of ['0.2.0','0.2.1','0.2.2']){
    const release=REVIEWED_BUILTIN_TASK_RELEASES.find(row=>row.taskId===request().taskId&&row.version===version);
    assert.ok(release);
    const installed={...install,version,manifestHash:release.manifestHash,contentHash:release.sourceHash,
      scriptId:'task:chatgpt.conversation.create:'+version};
    for(const send of [false,true]){
      const a={...args,send},r={...request(a),installation:installed},value=send?base('完整正文。'.repeat(100)):draft();
      if(send&&version==='0.2.2')Object.assign(value,{
        userMessageRef:'1e0eae89-91d5-4b79-9d95-4d02168447d5',
        assistantMessageRef:'b85c4321-cef3-41ba-b1bd-f66cbeff2611'});
      const d=verifyChatGPTTaskDurableResult(snapshot(value,installed),'run-0001',installed,r);
      assert.deepEqual(d.value,value);
      const payload=deliveryPayload(formatChatGPTInstalledResult(r,d));
      assert.equal(payload.sourceHash,release.sourceHash);
      assert.equal(payload.data.replyText,send?value.replyText:undefined);
      assert.equal(payload.data.status,value.status);
      for(const patch of [{manifestHash:'0'.repeat(64)},{contentHash:'0'.repeat(64)},
        {scriptId:install.scriptId===installed.scriptId?'task:chatgpt.conversation.create:0.2.1':install.scriptId},
        {revision:2},{version:version==='0.2.0'?'0.2.1':'0.2.0'}])
        assert.throws(()=>reviewedChatGPTResultAdapter({...r,installation:{...installed,...patch}}),
          {code:'E_BRIDGE_RESULT'});
    }
  }
});

test('A receives the entire Chinese reply beyond 500 characters with original B and durable identities',()=>{
  const body='完整中文回复。'.repeat(100)+'\n末尾证据 / 路径  双空格 😀',d=verify(base(body));
  const output=formatChatGPTInstalledResult(request(),d),payload=deliveryPayload(output);
  assert.ok(body.length>500);
  assert.equal(payload.data.replyText,body);
  assert.equal(payload.data.replyPreview,body.slice(0,500));
  assert.equal(payload.data.replyPreviewComplete,false);
  assert.equal(payload.data.replyChars,body.length);
  assert.equal(payload.data.fullReplyInDurableResult,true);
  assert.equal(payload.requestId,'request-0001');
  assert.equal(payload.runId,d.runId);
  assert.equal(payload.resultId,d.resultId);
  assert.equal(payload.revision,d.revision);
  assert.equal(payload.sourceHash,d.sourceHash);
  assert.equal(payload.data.conversationId,uuid);
  assert.equal(payload.data.conversationUrl,d.value.conversationUrl);
  assert.equal(payload.data.userMessageRef,d.value.userMessageRef);
  assert.equal(payload.data.assistantMessageRef,d.value.assistantMessageRef);
  assert.ok(output.includes('[打开新对话 B]('+d.value.conversationUrl+')'));
  assert.ok(bytes(output)<=8192);
  assert.equal(d.value.replyText,body);
});
test('A UTF-8 budget includes the full escaped envelope: exactly 8192 passes, one byte more fails',()=>{
  const prefix='中'.repeat(501)+'😀\n/  '+'x'.repeat(500),seed=verify(base(prefix));
  const overhead=bytes(formatChatGPTCreateDelivery(request(),seed));
  const body=prefix+'x'.repeat(8192-overhead),d=verify(base(body));
  const output=formatChatGPTCreateDelivery(request(),d);
  assert.equal(bytes(output),8192);
  assert.equal(deliveryPayload(output).data.replyText,body);
  for(const suffix of ['x','中','😀']){
    const over=verify(base(body+suffix));
    assert.throws(()=>formatChatGPTInstalledResult(request(),over),error=>{
      assert.equal(error.code,'E_CHAT_CREATE_RESULT');
      assert.match(error.message,/不可交付/);
      assert.match(error.message,/持久 Run\/Result 保留全文/);
      assert.match(error.message,/未截断或发送/);
      return true;
    });
    assert.equal(over.value.replyText,body+suffix);
  }
});
test('oversized delivery preserves the complete durable reply and its independent 65536-byte limit',()=>{
  const body='中'.repeat(21845)+'x',d=verify(base(body));
  assert.equal(bytes(body),65536);
  assert.throws(()=>formatChatGPTCreateDelivery(request(),d),{
    code:'E_CHAT_CREATE_RESULT',message:/8192 UTF-8.*不可交付/
  });
  assert.equal(d.value.replyText,body);
  assert.throws(()=>validateChatGPTCreateResult(base(body+'x'),args),
    {code:'E_CHAT_CREATE_RESULT'});
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

test('unknown ChatGPT Task versions cannot bypass the reviewed result adapter',()=>{
  const old={...request(),installation:{...install,version:'0.1.0'}};
  const future={...request(),installation:{...install,version:'0.3.0'}};
  assert.doesNotThrow(()=>reviewedChatGPTResultAdapter(old));
  assert.equal(reviewedChatGPTResultAdapter(old),null);
  assert.throws(()=>reviewedChatGPTResultAdapter(future),{code:'E_BRIDGE_RESULT'});
});

test('draft B requires an original retained tab/document, not only a page-reported draft status',()=>{
  const a={...args,send:false},value=draft(),valid=snapshot(value);
  assert.equal(verify(value,a).value.status,'draft-prepared');
  const variants=[
    {retainedTarget:undefined},
    {retainedTarget:{...valid.run.retainedTarget,tabId:23}},
    {retainedTarget:{...valid.run.retainedTarget,documentId:'foreign-document'}},
    {retainedTarget:{...valid.run.retainedTarget,url:'https://chatgpt.com/c/'+uuid}},
    {targetDisposition:'close'},
    {requestId:'another-request'}
  ];
  for(const override of variants)assert.throws(()=>verify(value,a,{
    run:{...valid.run,...override}}),{code:'E_BRIDGE_RESULT'});
});

test('completed B must match the Controller-retained URL, not just self-reported page values',()=>{
  const valid=snapshot(base());
  for(const retainedTarget of [
    {...valid.run.retainedTarget,url:'https://chatgpt.com/'},
    {...valid.run.retainedTarget,url:'https://chatgpt.com/c/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'},
    {...valid.run.retainedTarget,origin:'https://evil.example'}
  ])assert.throws(()=>verify(base(),args,{
    run:{...valid.run,retainedTarget}}),{code:'E_BRIDGE_RESULT'});
  const wrongPin={...request(),installation:{...install,manifestHash:'0'.repeat(64)}};
  assert.throws(()=>verifyChatGPTTaskDurableResult(valid,'run-0001',
    wrongPin.installation,wrongPin),{code:'E_BRIDGE_RESULT'});
});
