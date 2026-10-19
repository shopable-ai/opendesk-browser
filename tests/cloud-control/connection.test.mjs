import test from 'node:test';
import assert from 'node:assert/strict';
import {createCloudConnection} from '../../src/cloud-control/connection.js';
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
function fixture({capabilitiesGate}={}){
  const sockets=[],sync=[],pending=[];let state='offline';
  class Socket{constructor(url){this.url=url;sockets.push(this);}send(){}close(){this.onclose?.();}}
  const service={read:async()=>({enabled:true,url:'https://provider.example',providerId:'p',tasks:[]}),
    post:async(_c,path)=>{
      if(path==='auth')return {providerId:'p',expiresAt:Date.now()+30000,ticket:'short-lived'};
      if(path==='capabilities'&&capabilitiesGate)await capabilitiesGate.promise;
      return {accepted:true};
    },
    reconcile:async({isCurrent})=>{const gate=deferred();pending.push({gate,isCurrent});await gate.promise;},
    connection:s=>{state=s;},setReconciled:s=>sync.push(s),attachConnection(){}};
  const connection=createCloudConnection({service,Socket,api:{},random:()=>0.5});
  return {connection,sockets,sync,pending,state:()=>state};
}
test('stopped socket cannot publish late reconciliation or install a heartbeat',async t=>{
  const f=fixture();t.after(()=>f.connection.stop());let timers=0;
  t.mock.method(globalThis,'setInterval',()=>{timers++;return 0;});await flush();
  const old=f.sockets[0],message=old.onmessage({data:JSON.stringify({type:'authenticated',providerId:'p'})});await flush();
  assert.equal(f.pending.length,1);f.connection.stop();f.pending[0].gate.resolve();await message;
  assert.deepEqual(f.sync,[]);assert.equal(timers,0);assert.equal(f.state(),'offline');assert.equal(f.pending[0].isCurrent(),false);
});
test('new socket performs its own reconciliation while old generation remains pending',async t=>{
  const f=fixture();t.after(()=>f.connection.stop());await flush();
  const old=f.sockets[0],oldMessage=old.onmessage({data:JSON.stringify({type:'authenticated',providerId:'p'})});await flush();
  f.connection.stop();await f.connection.start();const next=f.sockets[1];
  assert.equal(next.url,'wss://provider.example/v1/events');assert.equal(next.url.includes('ticket'),false);
  const nextMessage=next.onmessage({data:JSON.stringify({type:'authenticated',providerId:'p'})});await flush();
  assert.equal(f.pending.length,2);f.pending[0].gate.resolve();await oldMessage;assert.deepEqual(f.sync,[]);
  f.pending[1].gate.resolve();await nextMessage;assert.deepEqual(f.sync,[true]);
});


test('authenticated notify waits for capability acknowledgement before any reconciliation',async t=>{
  const capabilitiesGate=deferred(),f=fixture({capabilitiesGate});t.after(()=>f.connection.stop());
  await flush();const socket=f.sockets[0];
  const handshake=socket.onmessage({data:JSON.stringify({type:'authenticated',providerId:'p'})});
  await flush();
  await socket.onmessage({data:JSON.stringify({type:'notify'})});
  assert.equal(f.pending.length,0,'No claim/reconcile while capabilities are unacknowledged');
  capabilitiesGate.resolve();await flush();
  assert.equal(f.pending.length,1,'Initial pass picks up the pre-acknowledgement notify');
  f.pending[0].gate.resolve();await handshake;
  assert.deepEqual(f.sync,[true]);
});

test('notify burst during an in-flight reconciliation is coalesced into one serialized follow-up',async t=>{
  const f=fixture();t.after(()=>f.connection.stop());await flush();
  const socket=f.sockets[0];
  const handshake=socket.onmessage({data:JSON.stringify({type:'authenticated',providerId:'p'})});
  await flush();
  assert.equal(f.pending.length,1);
  const notify=()=>socket.onmessage({data:JSON.stringify({type:'notify'})});
  const first=notify(),second=notify();
  await flush();
  assert.equal(f.pending.length,1,'Concurrent reconciles must not run');
  f.pending[0].gate.resolve();await flush();
  assert.equal(f.pending.length,2,'New work cannot wait until the next heartbeat');
  f.pending[1].gate.resolve();await Promise.all([handshake,first,second]);
  assert.deepEqual(f.sync,[true,true]);
  await flush();assert.equal(f.pending.length,2,'One burst must not loop or duplicate a claim');
});

test('stop discards a pending notify and fences late reconciliation completion',async t=>{
  const f=fixture();t.after(()=>f.connection.stop());await flush();
  const socket=f.sockets[0];
  const handshake=socket.onmessage({data:JSON.stringify({type:'authenticated',providerId:'p'})});
  await flush();
  const notified=socket.onmessage({data:JSON.stringify({type:'notify'})});
  f.connection.stop();
  f.pending[0].gate.resolve();await Promise.all([handshake,notified]);
  await flush();
  assert.equal(f.pending.length,1,'Stop must not launch a queued follow-up');
  assert.deepEqual(f.sync,[]);assert.equal(f.state(),'offline');
});
