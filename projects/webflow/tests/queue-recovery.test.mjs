import test from 'node:test';
import assert from 'node:assert/strict';
import {createQueueJournal,appendQueueEvent,replayQueueJournal} from '../src/queue/state.js';
import {createSingleOwnerQueue} from '../src/queue/repository.js';

const NOW=1800000000000,ownerId='owner-0001',workflowId='workflow-001';
const source={adapter:'chatgpt-web',conversationId:'conversation-001',turnId:'turn-001'};
const target={adapter:'codex-local',hostId:'local',projectId:'project-001',
  repoUrl:'https://github.com/shopable-ai/opendesk-browser',ref:'refs/heads/main',baseCommit:'a'.repeat(40),threadId:null};
const scope={expectedSource:source,expectedTarget:target};
const options={...scope,ownerId,workflowId,now:NOW};
const key=`opendesk.webflow.queue.v1:${workflowId}`;
function handoff(stepId='step-0001'){
  const d={protocol:'opendesk.workflow.handoff.v1',workflowId,stepId,handoffId:`handoff-${stepId}`,
    attemptId:'attempt-0001',source:{...source},target:{...target},returnTo:{...source},
    objective:'Write a bounded note',summary:'Neutral public facts and unresolved questions.',
    evidenceRefs:[{kind:'durable-result',id:'source-result',sha256:'b'.repeat(64)}],
    allowedFiles:['docs/note.md'],expectedArtifacts:['docs/note.md'],verificationCommands:['node --check example.js'],
    authorizationRef:'review-0001',limits:{maxSteps:2,maxHandoffs:1,deadlineAt:NOW+100000},
    stopConditions:['Stop if identity or permission changes.'],createdAt:NOW-100,expiresAt:NOW+50000};
  d.idempotencyKey=JSON.stringify([d.protocol,d.workflowId,d.stepId,d.handoffId]);return d;
}
const enqueue=(step='step-0001',dependsOn=[])=>({type:'enqueue',handoffJson:JSON.stringify(handoff(step)),dependsOn});
const executionRef={kind:'codex-task',id:'thread-original-001'};
const resultRef={executionId:executionRef.id,resultId:'result-original-001',sha256:'c'.repeat(64)};
const errorCode=code=>e=>e?.code===code;
function memoryStorage(){
  const data=new Map();return {data,async getItem(k){return data.get(k)??null;},async setItem(k,v){data.set(k,v);}};
}
const repo=(storage,extra={})=>createSingleOwnerQueue({storage,key,ownerId,workflowId,scope,clock:()=>NOW,...extra});
async function start(q){
  await q.apply(enqueue());await q.apply({type:'ready',jobId:'step-0001'});
  await q.apply({type:'claim',jobId:'step-0001',claimId:'claim-0001'});
  await q.apply({type:'record-dispatch-intent',jobId:'step-0001',claimId:'claim-0001'});
  return q.apply({type:'record-started',jobId:'step-0001',claimId:'claim-0001',executionRef});
}

test('saved handoff survives interruption, cannot be reclaimed, and reaches one original result',async()=>{
  const storage=memoryStorage(),first=repo(storage);await first.load();
  assert.equal((await start(first)).jobs[0].status,'RUNNING');
  const recovered=repo(storage);const state=await recovered.load();
  assert.equal(state.jobs[0].status,'UNKNOWN');assert.deepEqual(state.jobs[0].executionRef,executionRef);
  await assert.rejects(recovered.apply({type:'claim',jobId:'step-0001',claimId:'claim-0002'}),errorCode('E_QUEUE_STATE'));
  await assert.rejects(recovered.apply({type:'record-started',jobId:'step-0001',claimId:'claim-0001',executionRef}),errorCode('E_QUEUE_STATE'));
  const pending=await recovered.apply({type:'record-result',jobId:'step-0001',resultRef,outcome:'COMPLETED'});
  assert.equal(pending.jobs[0].status,'RESULT_PERSISTED');
  const done=await recovered.apply({type:'confirm-result',jobId:'step-0001',resultId:resultRef.resultId});
  assert.equal(done.jobs[0].status,'COMPLETED');const revision=done.revision;
  assert.equal((await recovered.apply({type:'record-result',jobId:'step-0001',resultRef:{...resultRef},outcome:'COMPLETED'})).revision,revision);
  await assert.rejects(recovered.apply({type:'record-result',jobId:'step-0001',resultRef:{...resultRef,resultId:'other-result'},outcome:'COMPLETED'}),errorCode('E_QUEUE_RESULT_CONFLICT'));
  const again=await repo(storage).load();assert.equal(again.jobs.length,1);
  assert.equal(again.jobs[0].resultRef.resultId,resultRef.resultId);assert.equal(again.revision,revision);
});

test('dependencies, duplicate handoffs and single-use claims preserve prior state',async()=>{
  const q=repo(memoryStorage());await q.load();let state=await q.apply(enqueue());
  assert.equal((await q.apply(enqueue())).revision,state.revision);
  const reordered=Object.fromEntries(Object.entries(handoff()).reverse());
  assert.equal((await q.apply({...enqueue(),handoffJson:JSON.stringify(reordered)})).revision,state.revision);
  const changed=handoff();changed.summary='Changed context';
  await assert.rejects(q.apply({...enqueue(),handoffJson:JSON.stringify(changed)}),errorCode('E_QUEUE_IDEMPOTENCY'));
  await q.apply(enqueue('step-0002',['step-0001']));
  await assert.rejects(q.apply({type:'ready',jobId:'step-0002'}),errorCode('E_QUEUE_DEPENDENCY'));
  await q.apply({type:'ready',jobId:'step-0001'});
  await q.apply({type:'claim',jobId:'step-0001',claimId:'claim-0001'});
  await assert.rejects(q.apply({type:'claim',jobId:'step-0001',claimId:'claim-0001'}),errorCode('E_QUEUE_STATE'));
  await q.apply({type:'record-dispatch-intent',jobId:'step-0001',claimId:'claim-0001'});
  await q.apply({type:'record-started',jobId:'step-0001',claimId:'claim-0001',executionRef});
  await assert.rejects(q.apply({type:'record-result',jobId:'step-0001',resultRef:{...resultRef,executionId:'different-thread'},outcome:'COMPLETED'}),errorCode('E_QUEUE_RESULT_CONFLICT'));
  await q.apply({type:'record-result',jobId:'step-0001',resultRef,outcome:'COMPLETED'});
  await q.apply({type:'confirm-result',jobId:'step-0001',resultId:resultRef.resultId});
  state=await q.apply({type:'ready',jobId:'step-0002'});assert.equal(state.jobs[1].status,'READY');
  await q.apply({type:'claim',jobId:'step-0002',claimId:'claim-0002'});
  await q.apply({type:'record-dispatch-intent',jobId:'step-0002',claimId:'claim-0002'});
  await assert.rejects(q.apply({type:'record-started',jobId:'step-0002',claimId:'claim-0002',executionRef}),errorCode('E_QUEUE_IDEMPOTENCY'));
  await q.apply({type:'record-started',jobId:'step-0002',claimId:'claim-0002',executionRef:{kind:'codex-task',id:'thread-original-002'}});
  await assert.rejects(q.apply({type:'record-result',jobId:'step-0002',resultRef:{...resultRef,executionId:'thread-original-002'},outcome:'COMPLETED'}),errorCode('E_QUEUE_RESULT_CONFLICT'));
});

test('waiting and pre-dispatch cancellation differ from a running cancellation request',async()=>{
  const q=repo(memoryStorage());await q.load();await q.apply(enqueue());
  assert.equal((await q.apply({type:'wait',jobId:'step-0001',status:'WAITING_HOST',code:'NO_HOST'})).jobs[0].status,'WAITING_HOST');
  assert.equal((await q.apply({type:'cancel',jobId:'step-0001'})).jobs[0].status,'CANCELLED');
  const running=repo(memoryStorage());await running.load();await start(running);
  const cancelled=await running.apply({type:'cancel',jobId:'step-0001'});
  assert.equal(cancelled.jobs[0].status,'RUNNING');assert.equal(cancelled.jobs[0].cancelRequested,true);
});

test('unknown dispatch without an execution identity remains stopped on recovery',async()=>{
  const storage=memoryStorage(),q=repo(storage);await q.load();await q.apply(enqueue());
  await q.apply({type:'ready',jobId:'step-0001'});await q.apply({type:'claim',jobId:'step-0001',claimId:'claim-0001'});
  await q.apply({type:'record-dispatch-intent',jobId:'step-0001',claimId:'claim-0001'});
  const restored=repo(storage);assert.equal((await restored.load()).jobs[0].status,'UNKNOWN');
  await assert.rejects(restored.apply({type:'record-result',jobId:'step-0001',resultRef,outcome:'COMPLETED'}),errorCode('E_QUEUE_RESULT_CONFLICT'));
});

test('claim write rejection after commit never claims success and recovery cannot replay it',async()=>{
  const storage=memoryStorage(),q=repo(storage);await q.load();await q.apply(enqueue());
  await q.apply({type:'ready',jobId:'step-0001'});
  const normal=storage.setItem;storage.setItem=async(k,v)=>{await normal(k,v);throw Error('Lost write acknowledgement');};
  await assert.rejects(q.apply({type:'claim',jobId:'step-0001',claimId:'claim-0001'}),errorCode('E_QUEUE_STORAGE_UNKNOWN'));
  assert.equal(q.snapshot().storageStatus,'UNKNOWN');assert.equal(q.snapshot().queue.jobs[0].status,'READY');
  await assert.rejects(q.apply({type:'claim',jobId:'step-0001',claimId:'claim-0001'}),errorCode('E_QUEUE_STORAGE_UNKNOWN'));
  storage.setItem=normal;const restored=await repo(storage).load();assert.equal(restored.jobs[0].status,'UNKNOWN');
});

test('readback mismatch and observable stale writes fail without resetting the saved queue',async()=>{
  const storage=memoryStorage(),q=repo(storage);await q.load();await q.apply(enqueue());
  const original=storage.getItem;let reads=0;storage.getItem=async k=>++reads===2?'mismatched':original(k);
  await assert.rejects(q.apply({type:'ready',jobId:'step-0001'}),errorCode('E_QUEUE_STORAGE_UNKNOWN'));
  storage.getItem=original;const a=repo(storage),b=repo(storage);await a.load();await b.load();
  await b.apply({type:'wait',jobId:'step-0001',status:'WAITING_AUTH',code:'REVIEW_REQUIRED'});
  const raw=storage.data.get(key);
  await assert.rejects(a.apply({type:'claim',jobId:'step-0001',claimId:'claim-0001'}),errorCode('E_QUEUE_STALE'));
  assert.equal(storage.data.get(key),raw);assert.equal(a.snapshot().storageStatus,'UNKNOWN');
});

test('restoration rejects a different owner, changed repository scope, or corrupt log',async()=>{
  const storage=memoryStorage(),q=repo(storage);await q.load();await q.apply(enqueue());
  await assert.rejects(repo(storage,{ownerId:'owner-0002'}).load(),errorCode('E_QUEUE_SCOPE'));
  await assert.rejects(repo(storage,{scope:{...scope,expectedTarget:{...target,baseCommit:'d'.repeat(40)}}}).load(),errorCode('E_HANDOFF_SCOPE'));
  storage.data.set(key,'{invalid');await assert.rejects(repo(storage).load(),errorCode('E_QUEUE_SCHEMA'));
  assert.equal(storage.data.get(key),'{invalid');
});

test('pure replay is immutable, bounded, and does not admit expired work',()=>{
  let journal=createQueueJournal({ownerId,workflowId,now:NOW});
  journal=appendQueueEvent(journal,{...enqueue(),at:NOW},options);
  assert.equal(replayQueueJournal(journal,options).jobs[0].status,'QUEUED');
  assert.ok(Object.isFrozen(journal.events));
  journal=appendQueueEvent(journal,{type:'ready',jobId:'step-0001',at:NOW},options);
  const later={...options,now:NOW+60000};
  assert.throws(()=>appendQueueEvent(journal,{type:'claim',jobId:'step-0001',claimId:'claim-0001',at:later.now},later),errorCode('E_QUEUE_EXPIRED'));
  assert.throws(()=>appendQueueEvent(journal,{...enqueue('step-0002',['missing-step']),at:NOW},options),errorCode('E_QUEUE_DEPENDENCY'));
});

test('known failure and confirmed failed result remain terminal and block dependent work',async()=>{
  const q=repo(memoryStorage());await q.load();await q.apply(enqueue());await q.apply(enqueue('step-0002',['step-0001']));
  assert.equal((await q.apply({type:'fail',jobId:'step-0001',code:'INVALID_INPUT'})).jobs[0].status,'FAILED');
  await assert.rejects(q.apply({type:'ready',jobId:'step-0002'}),errorCode('E_QUEUE_DEPENDENCY'));
  const running=repo(memoryStorage());await running.load();await start(running);
  await running.apply({type:'record-result',jobId:'step-0001',resultRef,outcome:'FAILED'});
  assert.equal((await running.apply({type:'confirm-result',jobId:'step-0001',resultId:resultRef.resultId})).jobs[0].status,'FAILED');
});

test('one instance rejects overlapping updates; this is not a cross-host lock',async()=>{
  const storage=memoryStorage(),q=repo(storage);await q.load();await q.apply(enqueue());await q.apply({type:'ready',jobId:'step-0001'});
  let release,started;const gate=new Promise(resolve=>{release=resolve;});const entered=new Promise(resolve=>{started=resolve;});
  const normal=storage.setItem;storage.setItem=async(k,v)=>{started();await gate;return normal(k,v);};
  const pending=q.apply({type:'claim',jobId:'step-0001',claimId:'claim-0001'});await entered;
  await assert.rejects(q.apply({type:'claim',jobId:'step-0001',claimId:'claim-0002'}),errorCode('E_QUEUE_BUSY'));
  release();assert.equal((await pending).jobs[0].claimId,'claim-0001');
});

test('the bounded journal stops without deleting earlier pending or settled records',()=>{
  let journal=createQueueJournal({ownerId,workflowId,now:NOW});journal=appendQueueEvent(journal,{...enqueue(),at:NOW},options);
  for(let i=1;i<64;i++)journal=appendQueueEvent(journal,{type:'wait',jobId:'step-0001',status:i%2?'WAITING_HOST':'WAITING_AUTH',code:`WAIT_${i}`,at:NOW},options);
  assert.equal(journal.events.length,64);
  assert.throws(()=>appendQueueEvent(journal,{type:'ready',jobId:'step-0001',at:NOW},options),errorCode('E_QUEUE_LIMIT'));
  assert.equal(journal.events.length,64);
});
