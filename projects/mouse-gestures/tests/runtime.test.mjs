import assert from 'node:assert/strict';
import test from 'node:test';
import {createMouseGestureRuntime} from '../src/page/runtime.js';

function runtimeFixture(){
  const actions=[],timeouts=new Map(),disposers=[],listeners=[];
  let closed=false,nextTimer=1,enabled=undefined,revoked=false,mode="right",showTrace=true,gestureMappings={};
  const win={setTimeout(fn,delay){const id=nextTimer++;timeouts.set(id,{fn,delay});return id;},
    clearTimeout(id){timeouts.delete(id);}};
  const doc={defaultView:win};
  const ui={active:()=>!closed,onDispose(fn){disposers.push(fn);},on(target,type,fn){listeners.push([target,type,fn]);},
    destroy(){if(closed)return;closed=true;disposers.forEach(fn=>fn());}};
  const bridge={async readContext(){if(revoked)throw Error('E_PAGE_AUTHORIZATION');return {locale:'zh-CN'};},
    storage:{async get({key,withEtag}){assert.equal(key,'preferences');assert.equal(withEtag,true);
      if(revoked)throw Error('E_APP_PAGE_OWNER');return {value:enabled===undefined?null:{enabled,trigger:mode,showTrace,gestureMappings},etag:'v2'};}},
    onRequest(fn){actions.push(fn);return ()=>actions.splice(actions.indexOf(fn),1);}};
  const state={active:false,authorize:null,options:null};
  const mount=({enabled,authorizeGesture})=>{
    state.active=enabled;
    state.authorize=authorizeGesture;
    return {isActive:()=>state.active&&ui.active(),setEnabled(v){state.active=v;},setOptions(v){state.options=v;}};
  };
  const runtime=createMouseGestureRuntime({ui,bridge,doc,win,mount});
  return {runtime,ui,win,bridge,state,actions,timeouts,listeners,
    setEnabled(value){enabled=value;},setPreferences(value){mode=value.trigger;showTrace=value.showTrace;gestureMappings=value.gestureMappings||{};},revoke(){revoked=true;},isClosed:()=>closed};
}

test('Page runtime starts inactive pending authorization, then defaults ON without saved preferences',async()=>{
  const f=runtimeFixture();
  assert.equal(f.state.active,false); // Before async authority and settings read
  assert.deepEqual(await f.runtime.ready,{state:'ready',enabled:true});
  assert.equal(f.state.active,true);
  assert.deepEqual(f.state.options,{trigger:'right',showTrace:true,gestureMappings:{}});
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
  f.revoke();await assert.rejects(f.runtime.readPolicy(),/E_PAGE_AUTHORIZATION/);
  assert.equal(f.isClosed(),true);assert.equal(f.state.active,false);
  assert.equal(f.timeouts.size,0);
});

test('Page readback after disposal cannot re-enable old instance',async()=>{
  const f=runtimeFixture();await f.runtime.ready;
  f.setEnabled(true);f.ui.destroy();
  const result=await f.runtime.readPolicy();
  assert.equal(result,false);assert.equal(f.state.active,false);
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
  assert.deepEqual(f.state.options,{trigger:'alt-left',showTrace:false,gestureMappings:{}});
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
