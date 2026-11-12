import test from 'node:test';
import assert from 'node:assert/strict';
import {createSession} from '../src/model.js';
import {taskRequest,verifiedResult} from '../src/contract.js';
const id='71811b88-050a-4e7a-9dfa-00b10b906fe8';
const good={trust:'host-verified',requestId:id,runId:'controller-run-01',resultId:'controller-result-01',
  outcome:'completed',send:true,status:'reply-complete',userMessageRef:'native-user-01',
  assistantMessageRef:'native-assistant-01',replyText:'真实回答',
  conversationUrl:'https://chatgpt.com/c/11111111-2222-4333-8444-555555555555'};
test('prompt and request are bounded; UI protocol does not embed Task installation',()=>{
  assert.deepEqual(taskRequest({requestId:id,prompt:'测试'}),{protocol:'subagent.minichat.request.v1',requestId:id,prompt:'测试'});
  assert.throws(()=>taskRequest({requestId:id,prompt:''}),{code:'E_MINICHAT_PROMPT'});
  assert.throws(()=>taskRequest({requestId:id,prompt:'a'.repeat(3001)}),{code:'E_MINICHAT_PROMPT'});
  assert.throws(()=>taskRequest({requestId:'fake',prompt:'测试'}),{code:'E_MINICHAT_ID'});
});
test('no trusted bridge means no dispatch',async()=>{
  const session=createSession();
  assert.equal((await session.create('测试')).status,'failed');
  assert.equal(session.snapshot.requestId,null);
});
test('one request and duplicate clicks do not dispatch twice',async()=>{
  let sends=0,reads=0;
  const session=createSession({makeId:()=>id,transport:{
    async start(request){sends++;return {accepted:true,requestId:request.requestId};},
    async read(){reads++;return good;}}});
  await Promise.all([session.create('测试'),session.create('测试')]);
  assert.equal(sends,1);assert.equal(session.snapshot.status,'running');
  await session.read();assert.equal(reads,1);assert.equal(session.snapshot.status,'completed');
  assert.equal(session.snapshot.answer,'真实回答');
  assert.equal(session.snapshot.conversationUrl,good.conversationUrl);
  await session.create('再发');assert.equal(sends,1);
});
test('uncertain send is read-only; cannot create a second B',async()=>{
  let sends=0;
  const session=createSession({makeId:()=>id,transport:{
    async start(){sends++;throw new Error('ACK lost');},
    async read(){return {requestId:id,trust:'host-verified',outcome:'unknown'};}}});
  await session.create('测试');assert.equal(session.snapshot.status,'unknown');
  await session.create('测试');await session.read();assert.equal(sends,1);
  assert.equal(session.snapshot.status,'unknown');
});
test('wrong request and insufficient proof cannot display a forged success',async()=>{
  for(const delta of [{requestId:'different'}, {trust:'untrusted'}, {runId:null},
    {conversationUrl:'https://evil.example/c/11111111-2222-4333-8444-555555555555'},
    {status:'draft-prepared'}, {send:false}, {replyText:''}]){
    assert.throws(()=>verifiedResult({...good,...delta},id),{code:'E_MINICHAT_RESULT'});
  }
  assert.equal(verifiedResult(good,id).answer,'真实回答');
});
test('invalid or mismatched host outcome stays unknown, never success',async()=>{
  const session=createSession({makeId:()=>id,transport:{
    async start(){return {accepted:true,requestId:id};},
    async read(){return {...good,runId:null};}}});
  await session.create('测试');await session.read();
  assert.equal(session.snapshot.status,'unknown');assert.equal(session.snapshot.answer,'');
});

test('late create ACK cannot overwrite an already verified completion',async()=>{
  let resolveStart;
  const session=createSession({makeId:()=>id,transport:{
    start(){return new Promise(resolve=>{resolveStart=resolve;});},
    async read(){return good;}}});
  const start=session.create('测试');
  await session.read();assert.equal(session.snapshot.status,'completed');
  resolveStart({accepted:true,requestId:id});await start;
  assert.equal(session.snapshot.status,'completed');
});
test('concurrent read calls share one in-flight trusted query',async()=>{
  let resolveRead,reads=0;
  const session=createSession({makeId:()=>id,transport:{
    async start(){return {accepted:true,requestId:id};},
    read(){reads++;return new Promise(resolve=>{resolveRead=resolve;});}}});
  await session.create('测试');
  const a=session.read(),b=session.read();assert.equal(reads,1);
  resolveRead(good);await Promise.all([a,b]);
  assert.equal(session.snapshot.status,'completed');
});
