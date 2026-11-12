import test from 'node:test';
import assert from 'node:assert/strict';
import {createSession} from '../src/mini-chat/model.js';
import {taskRequest,verifiedResult} from '../src/contract.js';
const id='71811b88-050a-4e7a-9dfa-00b10b906fe8';
const good={trust:'host-verified',requestId:id,runId:'controller-run-01',resultId:'controller-result-01',
  outcome:'completed',send:true,status:'reply-complete',userMessageRef:'native-user-01',
  assistantMessageRef:'native-assistant-01',replyText:'真实回答',
  conversationUrl:'https://chatgpt.com/c/11111111-2222-4333-8444-555555555555'};
test('prompt and request are bounded; UI protocol does not embed Task installation',()=>{
  assert.deepEqual(taskRequest({requestId:id,prompt:'测试'}),{protocol:'subagent.task.request.v1',requestId:id,prompt:'测试'});
  assert.throws(()=>taskRequest({requestId:id,prompt:''}),{code:'E_SUBAGENT_PROMPT'});
  assert.throws(()=>taskRequest({requestId:id,prompt:'a'.repeat(3001)}),{code:'E_SUBAGENT_PROMPT'});
  assert.throws(()=>taskRequest({requestId:'fake',prompt:'测试'}),{code:'E_SUBAGENT_ID'});
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
    assert.throws(()=>verifiedResult({...good,...delta},id),{code:'E_SUBAGENT_RESULT'});
  }
  assert.equal(verifiedResult(good,id).answer,'真实回答');
});
test('completed B evidence requires canonical URL, distinct native messages and 64KiB UTF-8 reply',()=>{
  assert.throws(()=>verifiedResult({...good,
    conversationUrl:'https://chatgpt.com/c/'+'-'.repeat(36)},id),{code:'E_SUBAGENT_RESULT'});
  assert.throws(()=>verifiedResult({...good,
    assistantMessageRef:good.userMessageRef},id),{code:'E_SUBAGENT_RESULT'});
  assert.throws(()=>verifiedResult({...good,replyText:'汉'.repeat(21846)},id),
    {code:'E_SUBAGENT_RESULT'});
  const withinLimit='汉'.repeat(21845);
  assert.equal(verifiedResult({...good,replyText:withinLimit},id).answer,withinLimit);
});

test('invalid or mismatched host outcome stays unknown, never success',async()=>{
  const session=createSession({makeId:()=>id,transport:{
    async start(){return {accepted:true,requestId:id};},
    async read(){return {...good,runId:null};}}});
  await session.create('测试');await session.read();
  assert.equal(session.snapshot.status,'unknown');assert.equal(session.snapshot.answer,'');
});

test('late accepted, invalid or rejected ACK cannot overwrite a verified terminal result',async()=>{
  for(const outcome of ['completed','failed'])for(const ack of ['accepted','invalid','rejected']){
    let resolveStart,rejectStart;
    const session=createSession({makeId:()=>id,transport:{
      start(){return new Promise((resolve,reject)=>{resolveStart=resolve;rejectStart=reject;});},
      async read(){return {...good,outcome};}}});
    const start=session.create('测试');
    await session.read();assert.equal(session.snapshot.status,outcome);
    const terminal=session.snapshot;
    if(ack==='rejected')rejectStart(new Error('late ACK failure'));
    else resolveStart({accepted:ack==='accepted',requestId:ack==='accepted'?id:'wrong-request'});
    await start;
    assert.equal(session.snapshot,terminal,`${outcome}: ${ack} ACK changed terminal state`);
  }
});
test('concurrent read calls share one in-flight trusted query',async()=>{
  let resolveRead,reads=0;
  const session=createSession({makeId:()=>id,transport:{
    async start(){return {accepted:true,requestId:id};},
    read(){reads++;return new Promise(resolve=>{resolveRead=resolve;});}}});
  await session.create('测试');
  const a=session.read(),b=session.read();await Promise.resolve();assert.equal(reads,1);
  resolveRead(good);await Promise.all([a,b]);
  assert.equal(session.snapshot.status,'completed');
  const completed=session.snapshot;
  await Promise.all([session.read(),session.read()]);
  assert.equal(reads,1);assert.equal(session.snapshot,completed);
});
test('a synchronous query error releases the read slot and only queries the original request again',async()=>{
  let starts=0,reads=0;
  const session=createSession({makeId:()=>id,transport:{
    async start(){starts++;return {accepted:true,requestId:id};},
    read(request){
      assert.equal(request.requestId,id);reads++;
      if(reads===1)throw new Error('synchronous read failure');
      return good;
    }}});
  await session.create('测试');await session.read();
  assert.equal(session.snapshot.status,'unknown');
  await session.create('不得重发');await session.read();
  assert.equal(starts,1);assert.equal(reads,2);assert.equal(session.snapshot.status,'completed');
});
test('dispose ignores late start and result responses and prevents any further dispatch',async()=>{
  let rejectStart,resolveRead,starts=0,reads=0,changes=0;
  const session=createSession({makeId:()=>id,onChange(){changes++;},transport:{
    start(){starts++;return new Promise((resolve,reject)=>{rejectStart=reject;});},
    read(){reads++;return new Promise(resolve=>{resolveRead=resolve;});}}});
  const start=session.create('测试'),read=session.read();await Promise.resolve();
  session.dispose();
  const retired=session.snapshot,retiredChanges=changes;
  rejectStart(new Error('late ACK failure'));resolveRead(good);
  await Promise.all([start,read]);await session.create('不得重发');await session.read();
  assert.equal(session.snapshot,retired);assert.equal(changes,retiredChanges);
  assert.equal(starts,1);assert.equal(reads,1);assert.equal(session.isAvailable,false);
});
test('an invalid source assertion retires the session before creating a request',async()=>{
  for(const assertCurrent of [()=>false,()=>{throw new Error('source changed');}]){
    let calls=0,changes=0;
    const session=createSession({assertCurrent,makeId:()=>id,onChange(){changes++;},transport:{
      start(){calls++;},read(){calls++;}}});
    await session.create('测试');await session.read();
    assert.equal(calls,0);assert.equal(changes,0);
    assert.equal(session.snapshot.requestId,null);assert.equal(session.isAvailable,false);
  }
});
test('source change during the first state callback prevents the start side effect',async()=>{
  let current=true,starts=0;
  const session=createSession({assertCurrent:()=>current,makeId:()=>id,
    onChange(){current=false;},transport:{start(){starts++;},read(){}}});
  await session.create('测试');current=true;await session.create('不得重发');
  assert.equal(starts,0);assert.equal(session.isAvailable,false);
});
test('source change before a queued query prevents the query and cannot reactivate the old session',async()=>{
  let current=true,reads=0;
  const session=createSession({assertCurrent:()=>current,makeId:()=>id,transport:{
    async start(){return {accepted:true,requestId:id};},read(){reads++;return good;}}});
  await session.create('测试');
  const read=session.read();current=false;await read;current=true;await session.read();
  assert.equal(reads,0);assert.equal(session.isAvailable,false);assert.equal(session.snapshot.answer,'');
});
test('source change while awaiting ACK and result prevents late publication',async()=>{
  let current=true,resolveStart,resolveRead,changes=0;
  const session=createSession({assertCurrent:()=>current,makeId:()=>id,onChange(){changes++;},transport:{
    start(){return new Promise(resolve=>{resolveStart=resolve;});},
    read(){return new Promise(resolve=>{resolveRead=resolve;});}}});
  const start=session.create('测试'),read=session.read();await Promise.resolve();
  const original=session.snapshot,originalChanges=changes;current=false;
  resolveStart({accepted:true,requestId:id});resolveRead(good);await Promise.all([start,read]);
  assert.equal(session.snapshot,original);assert.equal(changes,originalChanges);
  assert.equal(session.snapshot.answer,'');assert.equal(session.isAvailable,false);
});
test('the full reply is preserved beyond a preview and a wrong request can never replace it',async()=>{
  const replyText='这是独立对话 B 的完整回答。\n'.repeat(160);
  let reads=0,starts=0;
  const session=createSession({makeId:()=>id,transport:{
    async start(){starts++;return {accepted:true,requestId:id};},
    async read(){reads++;return {...good,requestId:reads===1?'different':id,
      replyText,replyPreview:replyText.slice(0,500)};}}});
  await session.create('测试');await session.read();
  assert.equal(session.snapshot.status,'unknown');assert.equal(session.snapshot.answer,'');
  await session.read();await session.read();await session.create('不得重发');
  assert.ok(replyText.length>500);assert.equal(session.snapshot.answer,replyText);
  assert.equal(session.snapshot.conversationUrl,good.conversationUrl);
  assert.equal(starts,1);assert.equal(reads,2);
});

test('a pending original-request lookup disables creation until it confirms no prior request',async()=>{
  let finish,starts=0,ids=0;
  const initialRequest=new Promise(resolve=>{finish=resolve;});
  const session=createSession({initialRequest,makeId(){ids++;return id;},transport:{
    async start(){starts++;return {accepted:true,requestId:id};},async read(){return good;}}});
  assert.equal(session.snapshot.status,'restoring');
  await session.create('不得抢先发送');assert.equal(starts,0);assert.equal(ids,0);
  finish(null);await session.ready;
  assert.equal(session.snapshot.status,'idle');
  await session.create('测试');assert.equal(starts,1);assert.equal(ids,1);
});
test('a remount after a lost ACK adopts the trusted original request without creating B2',async()=>{
  let saved=null,starts=0,reads=0;
  const transport={async start(request){starts++;saved={requestId:request.requestId};throw new Error('ACK lost');},
    async read(request){reads++;assert.equal(request.requestId,id);return good;}};
  const first=createSession({transport,initialRequest:null,makeId:()=>id});
  await first.ready;await first.create('测试');assert.equal(first.snapshot.status,'unknown');first.dispose();
  const restored=createSession({transport,initialRequest:Promise.resolve(saved),
    makeId(){throw new Error('Restoration must not generate a new ID');}});
  await restored.ready;assert.equal(restored.snapshot.requestId,id);
  assert.equal(restored.snapshot.status,'unknown');assert.equal(restored.snapshot.answer,'');
  await restored.create('不得重发');await restored.read();
  assert.equal(restored.snapshot.status,'completed');assert.equal(restored.snapshot.answer,good.replyText);
  assert.equal(starts,1);assert.equal(reads,1);
});
test('failed, absent or malformed supplied recovery cannot be treated as proof of no prior task',async()=>{
  for(const restore of [()=>Promise.reject(new Error('lookup unavailable')),()=>undefined,
    ()=>({requestId:'wrong-id'}),()=>({requestId:id,answer:'forged saved result'}),()=>({})]){
    let calls=0;
    const session=createSession({initialRequest:restore(),transport:{start(){calls++;},read(){calls++;}}});
    await session.ready;await session.create('不得重发');await session.read();
    assert.equal(session.snapshot.status,'unknown');assert.equal(session.snapshot.requestId,null);
    assert.equal(session.snapshot.answer,'');assert.equal(calls,0);
  }
});
test('dispose or a changed source discards a late recovery response without starting or reading',async()=>{
  for(const retirement of ['dispose','source-change']){
    let finish,current=true,calls=0,changes=0;
    const session=createSession({initialRequest:new Promise(resolve=>{finish=resolve;}),
      assertCurrent:()=>current,onChange(){changes++;},transport:{start(){calls++;},read(){calls++;}}});
    const before=session.snapshot;
    if(retirement==='dispose')session.dispose();else current=false;
    finish({requestId:id});await session.ready;await session.create('不得重发');await session.read();
    assert.equal(session.snapshot,before);assert.equal(changes,0);assert.equal(calls,0);
    assert.equal(session.isAvailable,false);
  }
});
test('approval phases show the original review prompt without inferring a send or completion',async()=>{
  let starts=0,reads=0;
  const session=createSession({initialRequest:null,makeId:()=>id,transport:{
    async start(){starts++;return {accepted:true,requestId:id,phase:'awaiting-approval'};},
    async read(){reads++;return reads===1?{requestId:id,outcome:'pending',phase:'awaiting-approval'}:good;}}});
  await session.ready;await session.create('测试');
  assert.equal(session.snapshot.message,'请在 OpenDesk 原任务审批中确认');
  await session.read();assert.equal(session.snapshot.status,'running');
  assert.equal(session.snapshot.answer,'');assert.equal(session.snapshot.conversationUrl,null);
  await session.create('不得重发');await session.read();
  assert.equal(session.snapshot.status,'completed');assert.equal(starts,1);assert.equal(reads,2);
});

test('standalone Subagent project identity is not bound to Mini Chat demo name',async()=>{
  const {readFile}=await import('node:fs/promises');
  const file=new URL('../package.json',import.meta.url);
  const pkg=JSON.parse(await readFile(file,'utf8'));
  assert.equal(pkg.name,'@opendesk/subagent');
  assert.equal(pkg.opendesk.id,'opendesk.subagent');
  assert.equal(pkg.opendesk.runtimeKind,'page-userscript');
  assert.equal(pkg.opendesk.entry,'src/main.js');
  assert.deepEqual(pkg.opendesk.pageRules.matches,['https://chatgpt.com/*']);
});
