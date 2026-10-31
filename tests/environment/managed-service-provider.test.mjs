import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createManagedServiceProvider} from '../../native-agent/managed-services/provider.mjs';
const protocol='opendesk.managed-services.v1',extensionId='a'.repeat(32);
const descriptor={serviceId:'usage',serviceInstanceId:'instance_1',productName:'Local usage',
  origin:'http://usage-0123456789abcdef01234567.localhost:43210',capabilities:['usage:manual-binding']};
const owner={extensionId,toolId:'cookie-editor',packageHash:'b'.repeat(64),installEpoch:'install_1'};
function fixture({handler=async()=>({ok:true}),version=1}={}){
  const writes=[];class Socket extends EventEmitter{
    destroyed=false;writableLength=0;
    write(buffer){const m=JSON.parse(buffer.toString());writes.push(m);
      if(m.kind==='auth')queueMicrotask(()=>this.emit('data',Buffer.from(JSON.stringify({v:1,kind:'authenticated',browserReady:true,managedServicesVersion:version})+'\n')));
      if(m.kind==='services.register')queueMicrotask(()=>this.emit('data',Buffer.from(JSON.stringify({v:1,kind:'services.registered',protocol,serviceId:'usage',serviceInstanceId:'instance_1',providerEpoch:'epoch_1'})+'\n')));
    }
    destroy(){if(this.destroyed)return;this.destroyed=true;this.emit('close');}
  }
  const socket=new Socket();let retired=0;
  const provider=createManagedServiceProvider({descriptor,handler,onDisconnect:()=>{retired++;},
    installation:()=>({extensionId,socketPath:'/private/fake-agent.sock',clientCredential:'c'.repeat(64)}),
    connect:()=>{queueMicrotask(()=>socket.emit('connect'));return socket;},timeoutMs:100});
  const ids=new Map();let sequence=0;
  const invoke=(id,extra={})=>{if(!ids.has(id))ids.set(id,'req_'+(++sequence));
    socket.emit('data',Buffer.from(JSON.stringify({v:1,kind:'services.invoke',protocol,
      requestId:ids.get(id),serviceId:'usage',serviceInstanceId:'instance_1',providerEpoch:'epoch_1',owner,action:'accounts',payload:{connectionId:'conn_1'},...extra})+'\n'));};
  return {provider,socket,writes,invoke,retired:()=>retired};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('provider authenticates on original socket and registers only negotiated descriptor',async()=>{
  const f=fixture();await f.provider.start();
  assert.deepEqual(f.writes.map(x=>x.kind),['auth','services.register']);
  assert.equal(f.provider.state().connected,true);
  assert.doesNotMatch(JSON.stringify(f.provider.state()),/cccccccc|credential|secret/);
  f.provider.close();assert.equal(f.retired(),1);assert.equal(f.provider.state().connected,false);
});
test('old Native capability rejects registration and no side effects are dispatched',async()=>{
  const f=fixture({version:0});await assert.rejects(f.provider.start(),{code:'E_SERVICE_UNSUPPORTED'});
  assert.deepEqual(f.writes.map(x=>x.kind),['auth']);assert.equal(f.retired(),1);
});
test('typed invoke uses exact service epoch and extension owner; forged requests do not reach handler',async()=>{
  const seen=[],f=fixture({handler:async request=>{seen.push(request);return {accounts:[]};}});await f.provider.start();
  f.invoke('read_1');await tick();assert.equal(seen.length,1);
  assert.equal(f.writes.at(-1).kind,'services.result');assert.deepEqual(f.writes.at(-1).result,{accounts:[]});
  f.invoke('read_2',{owner:{...owner,extensionId:'d'.repeat(32)}});await tick();
  assert.equal(seen.length,1);assert.equal(f.writes.at(-1).error.code,'E_SERVICE_OWNER');
  f.invoke('read_3',{action:'fetch',payload:{url:'https://example.test'}});await tick();
  assert.equal(seen.length,1);assert.equal(f.writes.at(-1).error.code,'E_SERVICE_SCHEMA');f.provider.close();
});
test('connection retirement drops late mutation result and clears provider-owned grants without replay',async()=>{
  let finish;const f=fixture({handler:()=>new Promise(resolve=>{finish=resolve;})});await f.provider.start();
  f.invoke('bind_1',{action:'bind'});await tick();f.socket.destroy();finish({bound:true});await tick();
  assert.equal(f.writes.filter(x=>x.kind==='services.result').length,0);assert.equal(f.retired(),1);
  await assert.rejects(f.provider.start(),{code:'E_SERVICE_CLOSED'});
});
test('handler errors are redacted and an uncertain mutation is never automatically sent again',async()=>{
  let calls=0;const f=fixture({handler:async()=>{calls++;throw Error('PRIVATE_TOKEN_do_not_log');}});await f.provider.start();
  f.invoke('bind_1',{action:'bind'});await tick();
  assert.equal(f.writes.at(-1).error.outcome,'OUTCOME_UNKNOWN');
  assert.doesNotMatch(JSON.stringify(f.writes.at(-1)),/PRIVATE_TOKEN/);
  f.invoke('bind_1',{action:'bind'});await tick();assert.equal(calls,1);
  assert.equal(f.writes.at(-1).error.code,'E_SERVICE_DUPLICATE');
  assert.equal(f.writes.at(-1).error.outcome,'OUTCOME_UNKNOWN');assert.equal(f.socket.destroyed,false);f.provider.close();
});
test('bounded monotonic Native IDs preserve receipt reads beyond 256 requests and reject old dispatches',async()=>{
  let calls=0,writes=0;
  const f=fixture({handler:async({action})=>{calls++;if(action==='bind'){writes++;throw Error('lost');}return {status:'CONFIRMED'};}});
  await f.provider.start();
  for(let i=0;i<300;i++){f.invoke('read_'+i);await tick();assert.ok(f.writes.at(-1).result);}
  f.invoke('lost',{action:'bind'});await tick();assert.equal(f.writes.at(-1).error.outcome,'OUTCOME_UNKNOWN');
  f.invoke('receipt',{action:'operation',payload:{operationId:'original'}});await tick();
  assert.equal(f.writes.at(-1).result.status,'CONFIRMED');
  f.invoke('lost',{action:'bind'});await tick();assert.equal(f.writes.at(-1).error.code,'E_SERVICE_DUPLICATE');
  f.invoke('read_0');await tick();assert.equal(f.writes.at(-1).error.code,'E_SERVICE_DUPLICATE');
  assert.equal(calls,302);assert.equal(writes,1);assert.equal(f.provider.state().connected,true);f.provider.close();
});
test('duplicate in-flight mutation stays unknown and original operation can be reconciled without a second invocation',async()=>{
  let finish,writes=0;
  const f=fixture({handler:({action})=>action==='bind'?(writes++,new Promise(resolve=>finish=resolve)):
    Promise.resolve({status:'CONFIRMED'})});
  await f.provider.start();f.invoke('bind_pending',{action:'bind'});await tick();
  // Even a changed action on the same old sequence cannot prove the original
  // call was never dispatched; the bounded watermark retains no old payload.
  f.invoke('bind_pending',{action:'accounts'});await tick();
  assert.equal(f.writes.at(-1).error.outcome,'OUTCOME_UNKNOWN');assert.equal(writes,1);
  finish({bound:true});await tick();
  f.invoke('receipt',{action:'operation',payload:{operationId:'original'}});await tick();
  assert.equal(f.writes.at(-1).result.status,'CONFIRMED');assert.equal(writes,1);f.provider.close();
});
test('a write followed by a 4xx confirmation error stays unknown and is never dispatched again',async()=>{
  let commits=0;
  const f=fixture({handler:async()=>{commits++;throw Object.assign(Error('confirmation unavailable'),{status:404,code:'NOT_FOUND'});}});
  await f.provider.start();f.invoke('committed',{action:'bind'});await tick();
  assert.equal(commits,1);assert.equal(f.writes.at(-1).error.outcome,'OUTCOME_UNKNOWN');
  f.invoke('committed',{action:'bind'});await tick();assert.equal(commits,1);
  assert.equal(f.writes.at(-1).error.outcome,'OUTCOME_UNKNOWN');f.provider.close();
});
