import test from 'node:test';
import assert from 'node:assert/strict';
import {createCloudConnection} from '../../src/cloud-control/connection.js';
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
function fixture(){
  const sockets=[],sync=[],pending=[];let state='offline';
  class Socket{constructor(url){this.url=url;sockets.push(this);}send(){}close(){this.onclose?.();}}
  const service={read:async()=>({enabled:true,url:'https://provider.example',providerId:'p',tasks:[]}),
    post:async(_c,path)=>path==='auth'?{providerId:'p',expiresAt:Date.now()+30000,ticket:'short-lived'}:{accepted:true},
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
