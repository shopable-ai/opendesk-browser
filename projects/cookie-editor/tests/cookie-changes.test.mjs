import test from 'node:test';
import assert from 'node:assert/strict';
import {cookieChanges} from '../app/domain/cookie-changes.js';
import {createCookieController} from '../app/controller/cookie-controller.js';
import {createCookieObservation} from '../app/controller/cookie-observation.js';
import {createCookieSdkAdapter} from '../app/adapters/browser-sdk.js';
import {createMockSdk} from '../preview/react/src/mock-sdk.js';

const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function fixture(){
  const mock=createMockSdk(),snapshots=[];
  const adapter=createCookieSdkAdapter({getBrowser:()=>mock.browser,request:mock.request});
  const controller=createCookieController({adapter,onChange:value=>snapshots.push(value)});
  let allowed=true;
  const observer=createCookieObservation({adapter,controller,canRun:()=>allowed});
  return {mock,adapter,controller,observer,snapshots,block:()=>{allowed=false;},
    dispose:()=>{observer.dispose();controller.dispose();mock.dispose();}};
}
test('value-only overwrite is detected once without publishing values or a false deletion',async()=>{
  const f=fixture();
  try{
    await f.controller.load();assert.deepEqual(f.controller.snapshot().changes,[]);
    await f.observer.start();assert.equal(f.observer.snapshot().phase,'running');
    f.mock.simulateCookieChange('value');await f.observer.poll();
    const [change]=f.controller.snapshot().changes;
    assert.equal(change.name,'theme');assert.equal(change.kind,'updated');
    assert.deepEqual(change.fields,['内容或属性']);
    assert.equal(f.controller.snapshot().changes.length,1);
    await f.observer.poll();assert.equal(f.controller.snapshot().changes[0].revision,change.revision);
    assert.doesNotMatch(JSON.stringify(f.snapshots),/sess_demo_only|secret_preview_never_real|"value"|"light"|"night"/);
    assert.equal(f.mock.inspect().calls.some(({op,args})=>op==='get'||op==='set'||args?.includeValues),false);
  }finally{f.dispose();}
});
test('passive sync marks additions and deletions; clearing marks keeps the current baseline',async()=>{
  const f=fixture();
  try{
    await f.controller.load();await f.controller.syncMetadata();assert.deepEqual(f.controller.snapshot().changes,[]);
    f.mock.simulateCookieChange('added');await f.controller.syncMetadata();
    assert.equal(f.controller.snapshot().changes[0].kind,'added');
    f.mock.simulateCookieChange('removed');await f.controller.syncMetadata();
    const removed=f.controller.snapshot().changes.find(row=>row.name==='live_demo');
    assert.equal(removed.kind,'removed');
    assert.equal(f.controller.snapshot().rows.some(row=>row.id===removed.id),false);
    f.controller.clearChanges();await f.controller.syncMetadata();assert.deepEqual(f.controller.snapshot().changes,[]);
    f.mock.simulateCookieChange('added');await f.controller.syncMetadata();
    f.controller.invalidate();assert.deepEqual(f.controller.snapshot().changes,[]);
  }finally{f.dispose();}
});
test('attribute labels are precise and unpartitioned events cannot highlight other scopes',()=>{
  const row={id:'one',name:'sid',domain:'.example.com',path:'/',secure:false,httpOnly:false,session:true};
  const next={...row,secure:true,httpOnly:true};
  assert.deepEqual(cookieChanges([row],[next])[0].fields,['Secure','HttpOnly']);
  const event={name:'sid',domain:'example.com',path:'/'};
  assert.equal(cookieChanges([row],[row],[event]).length,1);
  for(const other of [{...row,id:'two',path:'/other'},
    {...row,id:'three',partitionKey:{topLevelSite:'https://other.example'}},
    {...row,id:'four',domain:'different.example'}])
    assert.deepEqual(cookieChanges([other],[other],[event]),[]);
  const other={...next,id:'other',name:'other'};
  assert.deepEqual(cookieChanges([row,other],[other,row]),[]);
});
test('an edit that begins during an observation read keeps its draft and rejects the late update',async()=>{
  const f=fixture(),pending=deferred();
  try{
    await f.controller.load();await f.observer.start();
    f.adapter.observeRead=()=>pending.promise;
    const read=f.observer.poll();f.block();
    pending.resolve({sessionRef:f.mock.inspect().observations[0],events:[{name:'theme',domain:'shop.example.com',path:'/'}],nextCursor:'1',gapCount:0});
    await read;assert.deepEqual(f.controller.snapshot().changes,[]);
    await f.observer.poll();assert.equal(f.observer.snapshot().phase,'idle');
    await Promise.resolve();assert.deepEqual(f.mock.inspect().observations,[]);
  }finally{f.dispose();}
});
test('stopping a pending start releases its late session and never begins reading',async()=>{
  const f=fixture(),pending=deferred(),stopped=[];
  try{
    await f.controller.load();
    f.adapter.observeStart=()=>pending.promise;
    f.adapter.observeStop=async(target,ref)=>{stopped.push(ref);};
    const starting=f.observer.start();f.observer.stop();
    pending.resolve({sessionRef:'late',expiresAt:Date.now()+10000});await starting;
    await Promise.resolve();assert.deepEqual(stopped,['late']);
    assert.equal(f.observer.snapshot().phase,'idle');
  }finally{f.dispose();}
});
test('navigation retires observation results, and authorization denial clears old data',async()=>{
  for(const navigate of [true,false]){
    const f=fixture(),pending=deferred();
    try{
      await f.controller.load();await f.observer.start();
      f.adapter.observeRead=()=>pending.promise;
      const reading=f.observer.poll();
      if(navigate)f.controller.invalidate();else f.block();
      pending.reject(Object.assign(Error('denied'),{code:'E_GRANT_REVOKED'}));await reading;
      assert.deepEqual(f.controller.snapshot().rows,[]);
      assert.deepEqual(f.controller.snapshot().changes,[]);
      if(!navigate)assert.equal(f.controller.snapshot().phase,'blocked');
    }finally{f.dispose();}
  }
});
test('event gaps trigger a fresh metadata read and an explicit incomplete-history status',async()=>{
  const f=fixture();
  try{
    await f.controller.load();await f.observer.start();
    const sessionRef=f.mock.inspect().observations[0];
    f.mock.simulateCookieChange('added');
    f.adapter.observeRead=async()=>({sessionRef,events:[],nextCursor:'51',gapCount:50});
    await f.observer.poll();assert.equal(f.observer.snapshot().gap,true);
    assert.equal(f.controller.snapshot().changes[0].name,'live_demo');
  }finally{f.dispose();}
});
test('the observation expires without renewal or background reads',async()=>{
  const f=fixture();let clock=Date.now();
  const observer=createCookieObservation({adapter:f.adapter,controller:f.controller,canRun:()=>true,now:()=>clock});
  try{
    await f.controller.load();clock=Date.now();
    const start=f.adapter.observeStart;
    f.adapter.observeStart=async target=>({...await start(target),expiresAt:clock+30000});
    await observer.start();
    clock=observer.snapshot().expiresAt;await observer.poll();
    assert.equal(observer.snapshot().phase,'ended');
    await Promise.resolve();assert.deepEqual(f.mock.inspect().observations,[]);
  }finally{observer.dispose();f.dispose();}
});
test('change marks stay bounded and snapshot consumers cannot mutate their baseline',async()=>{
  let rows=[];
  const adapter={targetFor:async()=>({target:{hostname:'example.com',origin:'https://example.com',url:'https://example.com/'}}),
    checkRead:async()=>({callableNow:true}),list:async()=>rows};
  const controller=createCookieController({adapter});
  try{
    await controller.load();
    rows=Array.from({length:125},(_,index)=>({name:'key_'+index,domain:'example.com',path:'/',hostOnly:true,storeId:'0',session:true}));
    await controller.syncMetadata();
    const snapshot=controller.snapshot();assert.equal(snapshot.changes.length,100);
    snapshot.changes[0].fields.push('mutated');snapshot.changes[0].name='changed';
    assert.equal(controller.snapshot().changes[0].name,'key_0');
    assert.deepEqual(controller.snapshot().changes[0].fields,[]);
    await controller.syncMetadata();assert.equal(controller.snapshot().changes.length,100);
  }finally{controller.dispose();}
});
test('a malformed observer receipt stops cleanly without accepting its events',async()=>{
  const f=fixture();
  try{
    await f.controller.load();await f.observer.start();
    f.adapter.observeRead=async()=>({sessionRef:'another-session',events:[{value:'UNTRUSTED_VALUE'}],nextCursor:'1',gapCount:0});
    await f.observer.poll();assert.equal(f.observer.snapshot().phase,'error');
    assert.deepEqual(f.controller.snapshot().changes,[]);
    assert.doesNotMatch(JSON.stringify(f.snapshots),/UNTRUSTED_VALUE/);
  }finally{f.dispose();}
});
test('clearing marks during a read accepts current rows without restoring retired marks',async()=>{
  const f=fixture(),pending=deferred();
  try{
    await f.controller.load();
    const row=f.controller.snapshot().rows[0];
    f.adapter.list=()=>pending.promise;
    const reading=f.controller.syncMetadata();f.controller.clearChanges();
    pending.resolve([{...row,name:'new_key'}]);await reading;
    assert.equal(f.controller.snapshot().rows[0].name,'new_key');
    assert.deepEqual(f.controller.snapshot().changes,[]);
  }finally{f.dispose();}
});
