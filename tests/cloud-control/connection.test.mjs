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


test('R19.5 keeps an authorized HTTPS Pull lease while re-probing WSS, then switches only after sync',async()=>{
  let state='offline',session=null,now=10000;
  const sockets=[],states=[],synchronized=[],capabilityGate=deferred(),reconcileGate=deferred();
  const config={enabled:true,url:'https://provider.example',providerId:'p',executorId:'e',
    pairingId:'pair',pairingGeneration:1,grantId:'g',tasks:[]};
  class Socket{
    constructor(url){this.url=url;sockets.push(this);}
    close(){this.onclose?.();}
    send(){}
  }
  const service={
    read:async()=>config,
    captureAuthentication:()=>()=>true,
    retryRevocation:async()=>{},
    post:async(_c,path)=>{
      if(path==='auth')return {providerId:'p',executorId:'e',pairingId:'pair',
        pairingGeneration:1,ticket:'ticket',expiresAt:now+30000};
      if(path==='capabilities'&&sockets.length===2)await capabilityGate.promise;
      if(path==='pull-open')return {providerId:'p',executorId:'e',pairingId:'pair',
        pairingGeneration:1,grantId:'g',sessionId:'pull-session',expiresAt:now+90000};
      return {accepted:true};
    },
    reconcile:async()=>{if(sockets.length===2)await reconcileGate.promise;},
    setPullSession:reply=>{session=reply;},
    setReconciled:value=>synchronized.push(value),
    connection:value=>{state=value;states.push(value);},
    attachConnection:()=>{}
  };
  const connection=createCloudConnection({service,Socket,api:{},clock:{now:()=>now},
    random:()=>0.5});
  try{
    await flush();
    assert.equal(sockets.length,1);
    sockets[0].close();
    for(let i=0;i<30&&state!=='pull-ready';i++)await new Promise(resolve=>setImmediate(resolve));
    assert.equal(state,'pull-ready');
    assert.equal(session.sessionId,'pull-session');
    await connection.start();
    assert.equal(sockets.length,2);
    assert.equal(state,'pull-ready','WSS re-probe must not interrupt valid HTTPS Pull');
    const handshake=sockets[1].onmessage({data:JSON.stringify({type:'authenticated',
      providerId:'p',executorId:'e',pairingId:'pair',pairingGeneration:1})});
    await flush();
    assert.equal(state,'pull-ready','WSS authentication alone cannot grant claim readiness');
    capabilityGate.resolve();
    await flush();
    assert.equal(state,'pull-ready','WSS must reconcile before replacing Pull');
    reconcileGate.resolve();
    await handshake;
    assert.equal(state,'authenticated');
    assert.deepEqual(states.filter(s=>s==='authenticated'),['authenticated']);
    assert.ok(synchronized.length>=2,'both Pull and WSS paths reconcile');
  }finally{connection.stop();}
});

test('R19.5 failed HTTPS renewal cannot tear down a still-live Pull lease during WSS outage',async()=>{
  let state='offline',now=10000,authCount=0;
  const sockets=[];
  const config={enabled:true,url:'https://provider.example',providerId:'p',executorId:'e',
    pairingId:'pair',pairingGeneration:1,grantId:'g',tasks:[]};
  class Socket{constructor(){sockets.push(this);}close(){this.onclose?.();}send(){}}
  const service={
    read:async()=>config,
    captureAuthentication:()=>()=>true,
    retryRevocation:async()=>{},
    post:async(_c,path)=>{
      if(path==='auth'){
        authCount++;
        if(authCount===4)throw Error('temporary HTTPS outage');
        return {providerId:'p',executorId:'e',pairingId:'pair',
          pairingGeneration:1,ticket:'ticket',expiresAt:now+30000};
      }
      if(path==='pull-open')return {providerId:'p',executorId:'e',pairingId:'pair',
        pairingGeneration:1,grantId:'g',sessionId:'pull-session',expiresAt:now+90000};
      return {accepted:true};
    },
    reconcile:async()=>{},
    setPullSession:()=>{},
    setReconciled:()=>{},
    connection:value=>{state=value;},
    attachConnection:()=>{}
  };
  const connection=createCloudConnection({service,Socket,api:{},clock:{now:()=>now},
    random:()=>0.5});
  try{
    await flush();sockets[0].close();
    for(let i=0;i<30&&state!=='pull-ready';i++)await new Promise(resolve=>setImmediate(resolve));
    assert.equal(state,'pull-ready');
    await connection.start();assert.equal(sockets.length,2);
    sockets[1].close();
    for(let i=0;i<30&&authCount<4;i++)await new Promise(resolve=>setImmediate(resolve));
    assert.equal(authCount,4);
    assert.equal(state,'pull-ready','temporary renewal error must not erase valid local Pull proof');
  }finally{connection.stop();}
});
