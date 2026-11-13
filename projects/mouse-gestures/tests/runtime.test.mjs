import assert from 'node:assert/strict';
import test from 'node:test';
import {createMouseGestureRuntime} from '../src/page/runtime.js';

function runtimeFixture({withoutContext=false}={}){
  const actions=[],timeouts=new Map(),disposers=[],listeners=[];
  const calls={context:0,policy:0};
  let closed=false,nextTimer=1,enabled=undefined,revoked=false,mode="right",menuPolicy="native-first",showTrace=true,gestureMappings={};
  const win={setTimeout(fn,delay){const id=nextTimer++;timeouts.set(id,{fn,delay});return id;},
    clearTimeout(id){timeouts.delete(id);}};
  const doc={defaultView:win};
  const ui={active:()=>!closed,onDispose(fn){disposers.push(fn);},on(target,type,fn){listeners.push([target,type,fn]);},
    destroy(){if(closed)return;closed=true;disposers.forEach(fn=>fn());}};
  const bridge={async readContext(){calls.context++;if(revoked)throw Error('E_PAGE_AUTHORIZATION');return {locale:'zh-CN'};},
    storage:{async get({key,withEtag}){assert.equal(key,'preferences');assert.equal(withEtag,true);
      calls.policy++;
      if(revoked)throw Error('E_APP_PAGE_OWNER');return {value:enabled===undefined?null:{enabled,trigger:mode,menuPolicy,showTrace,gestureMappings},etag:'v2'};}},
    onRequest(fn){actions.push(fn);return ()=>actions.splice(actions.indexOf(fn),1);}};
  if(withoutContext)delete bridge.readContext;
  const state={active:false,authorize:null,options:null};
  const mount=({enabled,authorizeGesture})=>{
    state.active=enabled;
    state.authorize=authorizeGesture;
    return {isActive:()=>state.active&&ui.active(),setEnabled(v){state.active=v;},setOptions(v){state.options=v;}};
  };
  const runtime=createMouseGestureRuntime({ui,bridge,doc,win,mount});
  return {runtime,ui,win,bridge,state,actions,timeouts,listeners,calls,
    setEnabled(value){enabled=value;},setPreferences(value){mode=value.trigger;menuPolicy=value.menuPolicy||"native-first";
      showTrace=value.showTrace;gestureMappings=value.gestureMappings||{};},revoke(){revoked=true;},isClosed:()=>closed};
}

test('Page runtime starts inactive pending authorization, then defaults ON without saved preferences',async()=>{
  const f=runtimeFixture();
  assert.equal(f.state.active,false); // Before async authority and settings read
  assert.deepEqual(await f.runtime.ready,{state:'ready',enabled:true});
  assert.equal(f.state.active,true);
  assert.deepEqual(f.state.options,{trigger:'right',menuPolicy:'native-first',showTrace:true,gestureMappings:{}});
  f.setEnabled(false);
  assert.equal((await f.actions[0]({operation:'gesture.refresh'})).enabled,false);
  assert.equal(f.runtime.isActive(),false);
  f.setEnabled(true);
  assert.equal(await f.state.authorize(),true);
  assert.equal(f.runtime.isActive(),true);
  assert.equal(f.timeouts.size,1);
  f.ui.destroy();assert.equal(f.timeouts.size,0);assert.equal(f.actions.length,0);
});

test('Page runtime rejects unauthenticated or unsupported cross-operation requests',async()=>{
  const f=runtimeFixture();await f.runtime.ready;
  await assert.rejects(f.actions[0]({operation:'toc.snapshot'}),/E_GESTURE_OPERATION/);
  f.revoke();await assert.rejects(f.runtime.readPolicy(),/E_APP_PAGE_OWNER/);
  assert.equal(f.isClosed(),true);assert.equal(f.state.active,false);
  assert.equal(f.timeouts.size,0);
});

test('Page readback after disposal cannot re-enable old instance',async()=>{
  const f=runtimeFixture();await f.runtime.ready;
  f.setEnabled(true);f.ui.destroy();
  const calls={...f.calls};
  const result=await f.runtime.readPolicy();
  assert.equal(result,false);assert.equal(f.state.active,false);
  assert.deepEqual(f.calls,calls); // No bridge round trip from a retired instance.
});

test('Page policy timer uses existing bridge and cleans up once',async()=>{
  const f=runtimeFixture();await f.runtime.ready;
  const [timer]=f.timeouts.values();assert.equal(timer.delay,1200);
  const [id]=f.timeouts.keys();f.timeouts.delete(id);f.setEnabled(true);
  await timer.fn();
  // Timer callback schedules a fresh poll; the async loop remains bounded.
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.state.active,true);
  assert.equal(f.timeouts.size,1);
  f.runtime.dispose();f.runtime.dispose();assert.equal(f.timeouts.size,0);
});


test('stored trigger and trace preferences are delivered to gesture engine',async()=>{
  const f=runtimeFixture();await f.runtime.ready;
  f.setPreferences({trigger:'alt-left',showTrace:false,gestureMappings:{}});
  f.setEnabled(true);await f.runtime.readPolicy();
  assert.deepEqual(f.state.options,{trigger:'alt-left',menuPolicy:'native-first',showTrace:false,gestureMappings:{}});
  f.ui.destroy();
});

test('malformed enabled state is fail-closed, never reinterpreted as default on',async()=>{
  const f=runtimeFixture();await f.runtime.ready;
  f.setEnabled('false');
  await assert.rejects(f.runtime.readPolicy(),/E_GESTURE_POLICY_ENABLED/);
  assert.equal(f.isClosed(),true);
  assert.equal(f.runtime.isActive(),false);
});

test('Page runtime delivers configured combo mappings without a new permission',async()=>{
  const f=runtimeFixture();await f.runtime.ready;
  f.setEnabled(true);
  f.setPreferences({trigger:'right',showTrace:true,gestureMappings:{'left-down':'up'}});
  await f.runtime.readPolicy();
  assert.deepEqual(f.state.options.gestureMappings,{'left-down':'up'});
  f.ui.destroy();
});

test('Page runtime normalizes legacy gesture-first without changing authority scope',async()=>{
  const f=runtimeFixture();await f.runtime.ready;
  f.setPreferences({trigger:'right',menuPolicy:'gesture-first',showTrace:true,gestureMappings:{}});
  f.setEnabled(true);await f.runtime.readPolicy();
  assert.equal(f.state.options.menuPolicy,'native-first');
  f.revoke();await assert.rejects(f.runtime.readPolicy(),/E_APP_PAGE_OWNER/);
  assert.equal(f.runtime.isActive(),false);
});

async function overlappingRead(f,read=()=>f.state.authorize()){
  const get=f.bridge.storage.get;
  let entered,release;
  const started=new Promise(resolve=>{entered=resolve;});
  const pending=new Promise(resolve=>{release=resolve;});
  let first=true;
  f.bridge.storage.get=async args=>{
    const saved=await get(args);
    if(first){first=false;entered();await pending;}
    return saved;
  };
  const approval=read();
  await started;
  return {approval,release};
}

test('startup and each gesture use one fresh authorized storage read without a context round trip',async()=>{
  const f=runtimeFixture();await f.runtime.ready;
  assert.deepEqual(f.calls,{context:0,policy:1});
  assert.equal(await f.state.authorize(),true);
  assert.deepEqual(f.calls,{context:0,policy:2});
  f.setEnabled(false);
  assert.equal(await f.state.authorize(),false);
  assert.deepEqual(f.calls,{context:0,policy:3});
  f.ui.destroy();
});

test('the runtime needs only the existing authorized storage and request APIs',async()=>{
  const f=runtimeFixture({withoutContext:true});
  assert.deepEqual(await f.runtime.ready,{state:'ready',enabled:true});
  f.revoke();await assert.rejects(f.state.authorize(),/E_APP_PAGE_OWNER/);
  assert.equal(f.isClosed(),true);assert.equal(f.runtime.isActive(),false);
  assert.equal(f.timeouts.size,0);
});

test('a background policy poll cannot add another wait while a gesture read is in flight',async()=>{
  const f=runtimeFixture();await f.runtime.ready;
  const {approval,release}=await overlappingRead(f);
  const before=f.calls.policy;
  const [id,timer]=[...f.timeouts][0];f.timeouts.delete(id);
  timer.fn();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.calls.policy,before);
  assert.equal(f.timeouts.size,1);
  release();assert.equal(await approval,true);
  const [nextId,nextTimer]=[...f.timeouts][0];f.timeouts.delete(nextId);
  nextTimer.fn();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.calls.policy,before+1);
  assert.equal(f.timeouts.size,1);
  f.ui.destroy();
});

test('a new gesture never reuses the stale ON snapshot of an in-flight poll',async()=>{
  const f=runtimeFixture();await f.runtime.ready;
  const {approval:poll,release}=await overlappingRead(f,()=>f.runtime.readPolicy());
  f.setEnabled(false);
  const before=f.calls.policy;
  assert.equal(await f.state.authorize(),false);
  assert.equal(f.calls.policy,before+1);
  release();assert.equal(await poll,false);
  assert.equal(f.runtime.isActive(),false);
  f.ui.destroy();
});

test('a quick explicit refresh does not let a poll delay an older pending gesture read',async()=>{
  const f=runtimeFixture();await f.runtime.ready;
  const {approval,release}=await overlappingRead(f);
  assert.equal(await f.runtime.readPolicy(),true);
  const before=f.calls.policy;
  const [id,timer]=[...f.timeouts][0];f.timeouts.delete(id);
  timer.fn();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.calls.policy,before);
  assert.equal(f.timeouts.size,1);
  release();assert.equal(await approval,true);
  f.ui.destroy();
});

test('an overlapping enabled poll does not falsely deny a pending gesture authorization',async()=>{
  const f=runtimeFixture();await f.runtime.ready;
  const {approval,release}=await overlappingRead(f);
  assert.equal(await f.runtime.readPolicy(),true);
  release();assert.equal(await approval,true);
  f.ui.destroy();
});

test('an overlapping OFF read supersedes older ON authorization without re-enabling',async()=>{
  const f=runtimeFixture();await f.runtime.ready;
  const {approval,release}=await overlappingRead(f);
  f.setEnabled(false);assert.equal(await f.runtime.readPolicy(),false);
  release();assert.equal(await approval,false);
  assert.equal(f.runtime.isActive(),false);
  f.ui.destroy();
});

test('disposal or revocation wins over an overlapping enabled authorization',async()=>{
  for(const revoke of [false,true]){
    const f=runtimeFixture();await f.runtime.ready;
    const {approval,release}=await overlappingRead(f);
    if(revoke){
      f.revoke();await assert.rejects(f.runtime.readPolicy(),/E_APP_PAGE_OWNER/);
    }else{
      assert.equal(await f.runtime.readPolicy(),true);f.ui.destroy();
    }
    release();assert.equal(await approval,false);
    assert.equal(f.runtime.isActive(),false);
    assert.equal(f.timeouts.size,0);
  }
});
