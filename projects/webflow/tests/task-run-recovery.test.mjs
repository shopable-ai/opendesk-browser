import test from 'node:test';
import assert from 'node:assert/strict';
import {setImmediate as turn} from 'node:timers/promises';
import {withWebflowTaskRunRecovery} from '../trusted/task-run-recovery.js';
import {sidebarToolStorageKey} from '../../../src/ui/sidebar-tools/package.js';
const key=sidebarToolStorageKey('webflow');
const sheetKey='opendesk.shared-task-run-sheet.webflow.v1';
const sheetLock='opendesk.shared-task-run-sheet.webflow.lock.v1';
const apiFor=value=>({storage:{local:{get:async()=>({[key]:structuredClone(value)})}}});
for(const value of [
  {format:'opendesk.task-preparation.v1',id:'old-ready',state:'ready'},
  {format:'opendesk.task-preparation.v1',id:'old-submitted',state:'submitted',runId:'original-run'},
  {format:'opendesk.task-preparation.v1',id:'old-unknown',state:'unknown'},
  {format:'opendesk.task-preparation.v1',id:'broken',state:'invalid'},false,'malformed'
])test('old shared sheet alone still fences new admission '+JSON.stringify(value),async()=>{
  let started=0;
  const api={storage:{local:{get:async()=>({[sheetKey]:structuredClone(value)})}}};
  await assert.rejects(withWebflowTaskRunRecovery(api,()=>{started++;}),{code:'E_TASK_RECOVERY_REQUIRED'});
  assert.equal(started,0);
});
for(const state of ['cancelled','retired'])test('settled old shared sheet retains its original admission contract '+state,async()=>{
  const value={format:'opendesk.task-preparation.v1',id:'original',state};
  const api={storage:{local:{get:async()=>({[sheetKey]:structuredClone(value)})}}};
  assert.equal(await withWebflowTaskRunRecovery(api,()=>42),42);
});
test('old shared sheet is checked while holding its original lock',async()=>{
  const locks=navigator.locks;let release,entered;
  const ready=new Promise(done=>entered=done),gate=new Promise(done=>release=done);
  const prior=locks.request(sheetLock,async()=>{entered();await gate;});
  await ready;let read=false;
  const api={storage:{local:{get:async()=>{read=true;return {};}}}};
  const admission=withWebflowTaskRunRecovery(api,()=>42);
  await turn();assert.equal(read,false);release();await prior;
  assert.equal(await admission,42);
});
for(const value of [
  {'webflow.pending.v1':{clientRequestId:'webflow:fcd2a5b4-c77e-430e-ae7b-1cd2b5e68caa'}},
  {'webflow.pending.v1':false},
  {'webflow.recent.v1':[{state:'completed',retirementState:'pending'}]},
  {'webflow.recent.v1':[{state:'UNKNOWN'}]},
  {'webflow.recent.v1':[{state:'unknown',retirementState:'released',resultPersisted:false}]},
  {'webflow.recent.v1':[{state:'running',runId:'original',resultId:'original-result',notSubmittedFenced:true}]},
  {'webflow.recent.v1':'malformed'},'malformed'
])test('unverified legacy locator or cached release claim fences new admission '+JSON.stringify(value),async()=>{
  let started=0;
  await assert.rejects(withWebflowTaskRunRecovery(apiFor(value),()=>{started++;}),{code:'E_TASK_RECOVERY_REQUIRED'});
  assert.equal(started,0);
});
for(const value of [undefined,{}, {'webflow.pending.v1':null,'webflow.recent.v1':[]}])
  test('absent legacy requests permit admission '+JSON.stringify(value),async()=>{
    assert.equal(await withWebflowTaskRunRecovery(apiFor(value),()=>42),42);
  });
test('only original Authority evidence settles a locator; no cached fields are trusted or rewritten',async()=>{
  const locator={clientRequestId:'original-id',state:'unknown',retirementState:'held'};
  const saved={'webflow.pending.v1':locator,'webflow.recent.v1':[locator]},seen=[];
  const result=await withWebflowTaskRunRecovery(apiFor(saved),held=>held,{
    verifyRecovery:async(row,appId)=>{seen.push([row,appId]);return row.clientRequestId==='original-id';}});
  assert.deepEqual(result,['webflow']);
  assert.deepEqual(seen,[[locator,'webflow'],[locator,'webflow']]);
  assert.equal(saved['webflow.pending.v1'],locator);
});
test('recovery read failure fails closed without touching original records',async()=>{
  let started=false;const api={storage:{local:{get:async()=>{throw Error('unavailable');}}}};
  await assert.rejects(withWebflowTaskRunRecovery(api,()=>{started=true;}),/unavailable/);
  assert.equal(started,false);
});
test('admission and multi-App snapshot use the same lock ordering and do not deadlock',{timeout:3000},async()=>{
  const prefix='opendesk.sidebar-tools:tool:',locks=navigator.locks;
  let entered,release;const ready=new Promise(done=>entered=done),gate=new Promise(done=>release=done);
  const snapshot=locks.request(prefix+'webflow',async()=>{
    entered();await gate;return locks.request(prefix+'z-consumer',()=>true);
  });
  await ready;
  const admission=withWebflowTaskRunRecovery(apiFor({}),async held=>{
    assert.deepEqual(held,['webflow','z-consumer']);
    const {held:active}=await locks.query();
    assert.ok(held.every(id=>active.some(lock=>lock.name===prefix+id)));
    return true;
  },{appId:'z-consumer'});
  await turn();release();assert.deepEqual(await Promise.all([snapshot,admission]),[true,true]);
});
