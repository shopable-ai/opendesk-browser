import test from 'node:test';
import assert from 'node:assert/strict';
import {createCloudRunnerLoop} from '../../src/cloud-control/runner.js';

const connected=()=>({enabled:true,online:true,reconciled:true,slotAvailable:true});
function fixture(state=connected()){
  const calls=[],warnings=[],request={cloudRequestId:'cloud:assignment-a',params:{name:'OpenDesk'}};
  const client={cloud:{cloudStatus:async args=>{calls.push(['status',args]);return state;},
    cloudNext:async()=>{calls.push(['claim']);return {requestId:'cloud:assignment-a'};},
    cloudResolve:async()=>{calls.push(['resolve']);return request;}},dispose:()=>calls.push(['client-dispose'])};
  const host={executionPending:false,completion:Promise.resolve({state:'completed'}),
    start:async value=>{calls.push(['start',value]);return {runId:'run-a'};},
    dispose:()=>calls.push(['host-dispose'])};
  const loop=createCloudRunnerLoop({client,host,log:(...values)=>warnings.push(values)});
  return {calls,warnings,client,host,loop,request};
}
function addAppServices(f){
  let fire=0;
  f.client.request=async(method,args)=>{
    assert.equal(method,'listDueSchedules');assert.deepEqual(args,{profile:'app-service'});
    f.calls.push(['app-poll']);
    return {fires:[{appId:'installed-app',fireId:`app-fire-${++fire}`,owner:{appId:'installed-app'}}]};
  };
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

for(const method of ['cloudStatus','cloudNext','cloudResolve']){
  test(`continuous ${method} failures cannot starve app services; recovery restores alternating admission`,async()=>{
    const f=fixture();addAppServices(f);
    const query=f.client.cloud[method];
    f.client.cloud[method]=async()=>{f.calls.push(['query-failed',method]);throw Error(`${method} unavailable`);};
    try{
      for(let i=0;i<3;i++)assert.equal((await f.loop.tick()).runId,'run-a');
      const apps=f.calls.filter(([name])=>name==='start').map(([,request])=>request);
      assert.deepEqual(apps.map(request=>request.scheduledFireId),['app-fire-1','app-fire-2','app-fire-3']);
      assert.ok(apps.every(request=>request.profile==='app-service'&&request.appId==='installed-app'));
      assert.equal(f.calls.filter(([name])=>name==='query-failed').length,2);
      assert.equal(f.warnings.filter(row=>row.includes(`${method} unavailable`)).length,2);
      f.client.cloud[method]=query;
      await f.loop.tick();await f.loop.tick();await f.loop.tick();await f.loop.tick();
      const admitted=f.calls.filter(([name])=>name==='start').slice(3).map(([,request])=>request);
      assert.deepEqual(admitted.map(request=>request.profile??'controller'),['controller','app-service','controller','app-service']);
      assert.equal(admitted[0],f.request,'Recovered cloud still uses the resolved original Controller request');
    }finally{await f.loop.dispose();}
  });
}

test('a Controller Host start failure never falls through to a second app admission in the same tick',async()=>{
  const f=fixture();addAppServices(f);
  await f.loop.tick();
  const start=f.host.start;
  f.host.start=async request=>{assert.equal(request,f.request);await start(request);throw Error('admission failed');};
  try{
    await assert.rejects(f.loop.tick(),/admission failed/);
    assert.equal(f.calls.filter(([name])=>name==='start').length,2);
    assert.equal(f.calls.filter(([name])=>name==='app-poll').length,1);
    assert.deepEqual(f.warnings,[],'Host admission errors are not swallowed as query failures');
  }finally{await f.loop.dispose();}
});

test('disposal during a failed cloud query cannot poll or start another app service',async()=>{
  const f=fixture(),entered=Promise.withResolvers(),query=Promise.withResolvers();addAppServices(f);
  await f.loop.tick();
  f.client.cloud.cloudStatus=()=>{entered.resolve();return query.promise;};
  const pending=f.loop.tick();await entered.promise;
  await f.loop.dispose();query.reject(Error('status disconnected'));
  assert.equal(await pending,null);
  assert.equal(f.calls.filter(([name])=>name==='app-poll').length,1);
  assert.equal(f.calls.filter(([name])=>name==='start').length,1);
  assert.deepEqual(f.warnings,[]);
});
