import test from 'node:test';
import assert from 'node:assert/strict';
import {createTaskDelegationHost} from '../../src/platform/host/task-delegation.js';
import {normalizeTaskDelegationRequest,normalizeTaskDelegations} from '../../src/platform/tasks/delegation-contract.js';
import {encodeValue} from '../../src/platform/page-port/codec.js';
import {createRunHost} from '../../src/run-host.js';
const pin={taskId:'fixed-task',version:'1.0.0',manifestHash:'a'.repeat(64),contentHash:'b'.repeat(64)};
const task={...pin,installationId:'12345678-1234-4123-8123-123456789abc',generation:1};
const payload={task,clientRequestId:'request-1',params:{}};
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};};
function fixture(overrides={}){
  let valid=true,alive=true;const calls=[],stops=[],cancels=[];
  const row={...task,scriptId:'task:fixed-task:1.0.0',revision:1,manifest:{deadlineMs:30000}};
  const result={runId:'run-1',resultId:'result-1',outcome:{ok:true,valueWire:encodeValue(42)}};
  const host={start:async request=>{calls.push(request);return {runId:'run-1',resultId:'result-1'};},
    stop:async request=>stops.push(request),cancelStart:id=>cancels.push(id),
    controller:{snapshotControllerRun:async()=>({run:{runId:'run-1',resultId:'result-1',state:'completed',retirementState:'released'},results:[result]})},...overrides.host};
  const service=createTaskDelegationHost({host,client:{request:async()=>row},
    currentPageTarget:{capture:()=>({windowId:1,tabId:2,frameId:0,documentId:'document-1',url:'https://example.com/'}),revalidate:async()=>{}},
    appId:'demo',instanceId:'original-frame',assertInstance:()=>assert.ok(alive),
    readApp:async()=>({appId:'demo',packageHash:'c'.repeat(64),generation:'epoch-1',tasks:[pin]}),
    assertApp:async()=>{if(!valid)throw Object.assign(new Error('revoked'),{code:'E_PERMISSION'});},...overrides,host});
  return {service,host,calls,stops,cancels,row,result,revoke:()=>valid=false,retire:()=>alive=false};
}
test('fixed source uses original RunHost, trustworthy borrowed document, and deterministic result',async()=>{
  const f=fixture(),started=await f.service.request('tasks.start',payload,{verifiedUserActivation:true});
  assert.equal(started.runId,'run-1');assert.equal(f.calls.length,1);
  assert.equal(f.calls[0].source.kind,'saved');assert.equal(f.calls[0].source.contentHash,pin.contentHash);
  assert.deepEqual(f.calls[0].target,{mode:'borrowed',tabId:2,frameId:0,documentId:'document-1',expectedUrl:'https://example.com/',expectedWindowId:1});
  assert.equal(f.calls[0].taskDelegation.instanceId,'original-frame');
  const read=await f.service.request('tasks.read',{clientRequestId:payload.clientRequestId});
  assert.equal(read.retirementState,'released');assert.equal(read.value,42);assert.deepEqual(read.result,f.result);
  await f.service.request('tasks.start',payload,{verifiedUserActivation:true});assert.equal(f.calls.length,1);
  await assert.rejects(f.service.request('tasks.start',{...payload,params:{changed:true}},{verifiedUserActivation:true}),{code:'E_REQUEST_CONFLICT'});
});
for(const key of ['generation','installationId','version','contentHash','manifestHash'])test('changed Task '+key+' rejected before execution',async()=>{
  const f=fixture();f.row[key]=key==='generation'?2:'different';
  await assert.rejects(f.service.request('tasks.start',payload,{verifiedUserActivation:true}),{code:'E_REVISION'});assert.equal(f.calls.length,0);
});
test('unreviewed task is rejected before execution',async()=>{
  const f=fixture();await assert.rejects(f.service.request('tasks.start',{...payload,task:{...task,taskId:'other'}},{verifiedUserActivation:true}),{code:'E_PERMISSION'});
  assert.equal(f.calls.length,0);
});
test('cancel before start delivery is a permanent tombstone',async()=>{
  const f=fixture();await f.service.request('tasks.stop',{clientRequestId:'request-1'});
  await assert.rejects(f.service.request('tasks.start',payload,{verifiedUserActivation:true}),{code:'E_CANCELLED'});assert.equal(f.calls.length,0);
});
test('cancel during resolve prevents admission',async()=>{
  const gate=deferred(),f=fixture({client:{request:()=>gate.promise}});
  const start=f.service.request('tasks.start',payload,{verifiedUserActivation:true});
  await f.service.request('tasks.stop',{clientRequestId:'request-1'});gate.resolve(f.row);
  await assert.rejects(start,{code:'E_CANCELLED'});assert.equal(f.calls.length,0);
});
test('cancel before start reply stops exactly the original admitted instance',async()=>{
  const gate=deferred(),entered=deferred(),f=fixture({host:{start:async()=>{entered.resolve();return gate.promise;}}});
  const start=f.service.request('tasks.start',payload,{verifiedUserActivation:true});await entered.promise;
  await f.service.request('tasks.stop',{clientRequestId:'request-1'});assert.equal(f.cancels.length,1);
  gate.resolve({runId:'run-1',resultId:'result-1'});await assert.rejects(start,{code:'E_CANCELLED'});
  assert.ok(f.stops.length>0);assert.ok(f.stops.every(row=>row.runId==='run-1'));
});
test('revocation denies cached results and repeat starts; Stop exposes no cached result',async()=>{
  const f=fixture();await f.service.request('tasks.start',payload,{verifiedUserActivation:true});await f.service.request('tasks.read',{clientRequestId:'request-1'});
  f.revoke();await assert.rejects(f.service.request('tasks.read',{clientRequestId:'request-1'}),{code:'E_PERMISSION'});
  await assert.rejects(f.service.request('tasks.start',payload,{verifiedUserActivation:true}),{code:'E_PERMISSION'});
  const stopped=await f.service.request('tasks.stop',{clientRequestId:'request-1'});assert.equal(stopped.result,null);
});
test('Authority result denial cannot be mistaken for empty success',async()=>{
  const f=fixture({host:{controller:{snapshotControllerRun:async()=>({resultDeliveryDenied:['run-1']})}}});
  await f.service.request('tasks.start',payload,{verifiedUserActivation:true});
  await assert.rejects(f.service.request('tasks.read',{clientRequestId:'request-1'}),{code:'E_PERMISSION'});
});
test('new iframe has no access to old run; dispose cancels original only',async()=>{
  const f=fixture(),other=fixture();await f.service.request('tasks.start',payload,{verifiedUserActivation:true});
  assert.equal((await other.service.request('tasks.read',{clientRequestId:'request-1'})).runId,null);
  await f.service.dispose();assert.deepEqual(f.stops,[{controller:true,runId:'run-1'}]);
  await assert.rejects(f.service.request('tasks.read',{clientRequestId:'request-1'}),{code:'E_OWNER'});
});
test('schema rejects source, target, arbitrary run IDs, missing identity, large params',()=>{
  for(const extra of [{source:'code'},{target:{tabId:1}},{runId:'other'}])
    assert.throws(()=>normalizeTaskDelegationRequest('tasks.start',{...payload,...extra}));
  assert.throws(()=>normalizeTaskDelegationRequest('tasks.start',{...payload,task:{...task,generation:null}}));
  assert.throws(()=>normalizeTaskDelegationRequest('tasks.start',{...payload,params:{text:'x'.repeat(8193)}}),{code:'E_BUDGET'});
  assert.throws(()=>normalizeTaskDelegations([pin,pin]));
  assert.throws(()=>normalizeTaskDelegations([{...pin,taskId:undefined}]));
});
test('real RunHost cancellation before ready creates no admission and cannot cancel another request',async()=>{
  const ready=deferred(),calls=[];
  const host=createRunHost({client:{ready:ready.promise,controller:{startControllerRun:async value=>calls.push(value)}},document:null,templateModuleFactory:null});
  const start=host.start({requestId:'original',source:{kind:'saved',scriptId:'task:fixed-task:1.0.0',revision:1,contentHash:pin.contentHash},params:{},target:{mode:'borrowed'}});
  assert.equal(host.cancelStart('other'),false);assert.equal(host.cancelStart('original'),true);ready.resolve();
  await assert.rejects(start,{code:'E_CANCELLED'});assert.equal(calls.length,0);await host.dispose();
});

test('metadata resolves only the approved fixed Task and never reveals source bytes',async()=>{
  const f=fixture();assert.deepEqual(await f.service.request('tasks.read',{taskId:pin.taskId}),{task});
  await assert.rejects(f.service.request('tasks.read',{taskId:'other'}),{code:'E_PERMISSION'});
  assert.equal(f.calls.length,0);f.revoke();
  await assert.rejects(f.service.request('tasks.read',{taskId:pin.taskId}),{code:'E_PERMISSION'});
});
test('real RunHost in-flight cancellation returns original IDs without executing Worker',async()=>{
  const admission=deferred(),entered=deferred(),calls=[];
  const claim={runId:'admitted-run',resultId:'admitted-result',identity:{runId:'admitted-run'}};
  const host=createRunHost({client:{ready:Promise.resolve(),controller:{
    startControllerRun:async()=>{entered.resolve();return admission.promise;},
    stopControllerRun:async value=>calls.push(['stop',value.runId]),
    finishControllerRun:async value=>({run:{state:'stopped'},result:{runId:value.runId}}),
    retireControllerTarget:async()=>({state:'released'})
  }},document:null,controllerFactory:()=>{throw Error('Worker must never execute');},templateModuleFactory:null});
  const start=host.start({requestId:'original',source:{kind:'saved',scriptId:'task:fixed-task:1.0.0',revision:1,contentHash:pin.contentHash},params:{},target:{mode:'borrowed'}});
  await entered.promise;assert.equal(host.cancelStart('other'),false);assert.equal(host.cancelStart('original'),true);
  admission.resolve(claim);
  await assert.rejects(start,error=>error.runId===claim.runId&&error.resultId===claim.resultId);
  assert.deepEqual(calls,[['stop','admitted-run']]);assert.equal(host.executionPending,false);await host.dispose();
});

test('sandbox cannot start a Controller without trusted Host activation',async()=>{
  const f=fixture();await assert.rejects(f.service.request('tasks.start',payload),{code:'E_USER_GESTURE_REQUIRED'});assert.equal(f.calls.length,0);
});
