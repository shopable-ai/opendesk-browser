import test from 'node:test';
import assert from 'node:assert/strict';
import {createCloudRunnerLoop} from '../../src/cloud-control/runner.js';

const connected=()=>({enabled:true,online:true,reconciled:true,slotAvailable:true});
function fixture(state=connected()){
  const calls=[],request={cloudRequestId:'cloud:assignment-a',params:{name:'OpenDesk'}};
  const client={cloud:{cloudStatus:async args=>{calls.push(['status',args]);return state;},
    cloudNext:async()=>{calls.push(['claim']);return {requestId:'cloud:assignment-a'};},
    cloudResolve:async()=>{calls.push(['resolve']);return request;}},dispose:()=>calls.push(['client-dispose'])};
  const host={executionPending:false,completion:Promise.resolve({state:'completed'}),
    start:async value=>{calls.push(['start',value]);return {runId:'run-a'};},
    dispose:()=>calls.push(['host-dispose'])};
  const loop=createCloudRunnerLoop({client,host,log:()=>{}});
  return {calls,client,host,loop,request};
}
test('offscreen loop binds a Provider assignment to existing Controller RunHost, without new engine',async()=>{
  const f=fixture(),reply=await f.loop.tick();
  assert.equal(reply.runId,'run-a');
  assert.deepEqual(f.calls,[['status',{includeRequests:false}],['claim'],['resolve'],['start',f.request]]);
  f.loop.dispose();
});
test('disabled, offline, unreconciled, occupied cloud cannot claim',async()=>{
  for(const patch of [{enabled:false},{online:false},{reconciled:false},{slotAvailable:false}]){
    const f=fixture({...connected(),...patch});
    assert.equal(await f.loop.tick(),null);
    assert.deepEqual(f.calls,[['status',{includeRequests:false}]]);
    f.loop.dispose();
  }
  const f=fixture();f.host.executionPending=true;
  assert.equal(await f.loop.tick(),null);assert.equal(f.calls.length,0);f.loop.dispose();
});
test('offscreen loop serializes claims and disposes original Host without replay',async()=>{
  const f=fixture();let release;
  f.client.cloud.cloudNext=()=>new Promise(resolve=>{f.calls.push(['claim']);release=resolve;});
  const pending=f.loop.tick();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(await f.loop.tick(),null);
  release({requestId:'cloud:assignment-a'});await pending;
  assert.equal(f.calls.filter(([name])=>name==='start').length,1);
  f.loop.dispose();assert.equal(await f.loop.tick(),null);
  assert.deepEqual(f.calls.slice(-2),[['host-dispose'],['client-dispose']]);
});

test('Offscreen pagehide keeps the original Host Client alive until durable RunHost shutdown settles',async()=>{
  const f=fixture(),events=f.calls;
  let finish;
  f.host.dispose=()=>{events.push(['host-dispose']);return new Promise(resolve=>{finish=resolve;});};
  const closing=f.loop.dispose();
  assert.equal(events.some(([name])=>name==='host-dispose'),true);
  assert.equal(events.some(([name])=>name==='client-dispose'),false,
    'Closing the transport before the original Run fence completes loses the settlement RPC');
  assert.equal(f.loop.dispose(),closing,'Repeated pagehide must not dispose the transport twice');
  assert.equal(await f.loop.tick(),null,'A disposing Runner must not claim another assignment');
  finish();
  await closing;
  assert.deepEqual(events.slice(-2),[['host-dispose'],['client-dispose']]);
});

test('Failed Host shutdown still releases the transport exactly once without replaying a job',async()=>{
  const f=fixture(),warnings=[];
  f.host.dispose=()=>Promise.reject(Object.assign(new Error('Host disappeared'),{code:'E_HOST_CLOSED'}));
  const loop=createCloudRunnerLoop({client:f.client,host:f.host,log:(...values)=>warnings.push(values)});
  await loop.dispose();
  assert.equal(f.calls.filter(([name])=>name==='client-dispose').length,1);
  assert.equal(f.calls.some(([name])=>name==='claim'),false);
  assert.ok(warnings.some(row=>row.includes('E_HOST_CLOSED')));
});
