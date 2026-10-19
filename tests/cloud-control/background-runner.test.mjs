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
