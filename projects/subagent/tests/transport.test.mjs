import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createMiniChatTransport} from '../src/transport.js';
import {createSession} from '../src/mini-chat/model.js';
import {REVIEWED_BUILTIN_TASK_RELEASES} from '../../../src/platform/tasks/builtin-releases.js';

const requestId='71811b88-050a-4e7a-9dfa-00b10b906fe8';
const prompt='请介绍 WebFlow 的三个主要优势。';
const result={requestId,trust:'host-verified',outcome:'completed',send:true,status:'reply-complete',
  runId:'original-run-id',resultId:'original-result-id',
  userMessageRef:'user-message-original',assistantMessageRef:'assistant-message-original',
  replyText:'完整回答。'.repeat(400),conversationUrl:'https://chatgpt.com/c/11111111-2222-4333-8444-555555555555'};
const complete={requestId,state:'completed',runId:result.runId,resultId:result.resultId,projection:result};
function fixture(){
  const calls=[];
  let response=complete,recovery={requestId:null,state:'idle'};
  const client={request:async(event,payload)=>{calls.push({event,payload});return {accepted:true,requestId,state:'pending-approval'};},
    read:async query=>{calls.push({read:query});return response;},restore:async()=>{calls.push({restore:true});return recovery;}};
  return {calls,client,transport:createMiniChatTransport(client),
    response:value=>{response=value;},recovery:value=>{recovery=value;}};
}
test('the project pins exactly the existing immutable WebFlow 0.2 Task and owned root',async()=>{
  const project=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
  const release=REVIEWED_BUILTIN_TASK_RELEASES.find(row=>row.taskId==='chatgpt.conversation.create'&&row.version==='0.2.0');
  assert.deepEqual(project.opendesk.delegatedTasks,[{taskId:release.taskId,version:release.version,
    manifestHash:release.manifestHash,contentHash:release.sourceHash,targetUrl:'https://chatgpt.com/'}]);
});
test('transport forwards the original event and exact input only to approval-request, never Controller',async()=>{
  const f=fixture(),event=Object.freeze({fixture:'original event object; Node only'});
  const session=createSession({transport:f.transport,initialRequest:f.transport.restore(),makeId:()=>requestId});
  await session.ready;
  await Promise.all([session.create(prompt,event),session.create(prompt,event)]);
  assert.equal(f.calls.filter(row=>row.payload).length,1);
  assert.equal(f.calls[1].event,event);
  assert.deepEqual(f.calls[1].payload,{requestId,taskId:'chatgpt.conversation.create',params:{prompt,send:true}});
  assert.match(session.snapshot.message,/审批/);assert.equal(session.snapshot.answer,'');
  await session.read();
  assert.equal(session.snapshot.answer,result.replyText);assert.ok(result.replyText.length>500);
  assert.equal(session.snapshot.conversationUrl,result.conversationUrl);
});
test('read distinguishes approval, pending, failure and UNKNOWN without using a preview as completion',async()=>{
  const f=fixture();
  for(const [state,outcome] of [['pending-approval','pending'],['prepared','pending'],['running','pending'],
    ['failed','failed'],['cancelled','failed'],['completed','unknown'],['paused_unknown','unknown'],['source-stale','unknown']]){
    f.response({requestId,state,replyPreview:'not the complete reply'});
    assert.equal((await f.transport.read({requestId})).outcome,outcome);
  }
  assert.equal(f.calls.filter(row=>row.payload).length,0);
});
test('mismatched projections and failed restore never unlock or start a new request',async()=>{
  const f=fixture();
  for(const response of [{...complete,requestId:'other'}, {...complete,runId:'other'},
    {...complete,resultId:'other'}, {...complete,state:'failed'},
    {...complete,projection:{...result,requestId:'other'}}]){
    f.response(response);await assert.rejects(f.transport.read({requestId}));
  }
  for(const recovery of [undefined,{}, {requestId:null,state:'unknown'},{requestId:'bad',state:'running'}]){
    f.recovery(recovery);
    const session=createSession({transport:f.transport,initialRequest:f.transport.restore(),makeId:()=>requestId});
    await session.ready;await session.create(prompt);
    assert.equal(session.snapshot.status,'unknown');assert.equal(f.calls.filter(row=>row.payload).length,0);
  }
});
test('restoration adopts only the original logical request ID and re-reads its result',async()=>{
  const f=fixture();f.recovery({...complete,answer:'do not trust cached text'});
  assert.deepEqual(await f.transport.restore(),{requestId});
  const session=createSession({transport:f.transport,initialRequest:f.transport.restore(),makeId:()=>assert.fail('no new request')});
  await session.ready;await session.create(prompt);await session.read();
  assert.equal(session.snapshot.answer,result.replyText);
  assert.equal(f.calls.filter(row=>row.payload).length,0);
});
