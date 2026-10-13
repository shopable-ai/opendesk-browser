import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocalProjectView} from '../../src/ui/local-project.js';

// Component evidence only; these events do not claim trusted browser input.
class Element {
  checked=false;disabled=false;value='';textContent='';dataset={};children=[];listeners=new Map();
  addEventListener(event,callback){this.listeners.set(event,callback);}
  removeEventListener(event){this.listeners.delete(event);}
  fire(event){this.listeners.get(event)?.({isTrusted:true});}
  replaceChildren(...children){this.children=children;}
  append(child){this.children.push(child);}
  removeAttribute(name){delete this[name];}
}
globalThis.Option=class extends Element {constructor(text,value){super();this.textContent=text;this.value=value;}};
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
const project={bindingId:'local-a',name:'TOC',sourceId:'source-a',runtimeKind:'page-userscript',preparation:{state:'ready'}};
function fixture(t,{nativeConnected=true,connected=false,saved}={}){
  const nodes=new Map(),find=id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);};
  find('local-project-mode').checked=true;
  let state={connected,nativeConnected,providerEpoch:connected?'epoch-a':null},projects=[project],listener;
  const calls=[],writes=[];
  const client={requestLocalProject:async method=>{calls.push(method);return method==='status'?state:{providerEpoch:state.providerEpoch,projects};},
    subscribeLocalProjects:callback=>{listener=callback;return ()=>{listener=null;};}};
  const api={storage:{local:{get:async()=>saved?{'opendesk.local-project.selection.v1':saved}:{},set:async value=>{writes.push(value);}}}};
  const view=createLocalProjectView({client,api,document:{getElementById:find}});
  t.after(()=>view.dispose());
  return {view,find,calls,writes,client,setState:value=>{state=value;},setProjects:value=>{projects=value;},notify:value=>listener(value)};
}
test('Native online without a source provider is distinct from a disconnected bridge',async t=>{
  const f=fixture(t);await tick();
  assert.equal(f.find('local-project-status').dataset.state,'source-unavailable');
  assert.match(f.find('local-project-status').textContent,/本机 OpenDesk 已连接/);
  assert.match(f.find('local-project-status').textContent,/opendesk-dev/);
  assert.match(f.find('local-project-status').title,/E_DEV_PROVIDER_UNAVAILABLE/);
  assert.equal(f.find('local-project-select').disabled,true);
  assert.equal(f.view.connected(),false);
  assert.throws(()=>f.view.capture(),{code:'E_DEV_DISCONNECTED'});
  assert.deepEqual(f.calls,['status']);
  assert.equal(f.find('local-project-refresh').disabled,false);
});
test('a disconnected Native bridge retains the connection recovery message',async t=>{
  const f=fixture(t,{nativeConnected:false});await tick();
  assert.equal(f.find('local-project-status').dataset.state,'disconnected');
  assert.match(f.find('local-project-status').textContent,/本地项目服务未连接/);
  assert.match(f.find('local-project-status').title,/E_DEV_DISCONNECTED/);
});
test('refresh after the provider registers enables and selects the authorized project without executing',async t=>{
  const f=fixture(t);await tick();
  f.setState({connected:true,nativeConnected:true,providerEpoch:'epoch-a'});
  f.find('local-project-refresh').fire('click');await tick();
  assert.equal(f.find('local-project-select').disabled,false);
  assert.equal(f.find('local-project-select').value,'local-a');
  assert.equal(f.view.connected(),true);
  assert.equal(f.view.capture().providerEpoch,'epoch-a');
  assert.deepEqual(f.calls,['status','status','projects.list']);
});
test('metadata polling recovers a missed online notification and stops on disposal',async t=>{
  t.mock.timers.enable({apis:['setInterval']});
  const f=fixture(t);await tick();
  f.setState({connected:true,nativeConnected:true,providerEpoch:'epoch-a'});
  t.mock.timers.tick(2000);await tick();
  assert.equal(f.view.connected(),true);
  assert.deepEqual(f.calls,['status','status','projects.list']);
  f.view.dispose();t.mock.timers.tick(4000);await tick();
  assert.equal(f.calls.length,3);
});
test('provider disappearance invalidates an in-flight catalog and cannot enable a stale project',async t=>{
  const f=fixture(t,{connected:true});await tick();const captured=f.view.capture(),gate=deferred();
  f.client.requestLocalProject=async method=>method==='status'?{connected:true,nativeConnected:true,providerEpoch:'epoch-a'}:gate.promise;
  f.find('local-project-refresh').fire('click');await tick();
  f.notify({connected:false,nativeConnected:true,providerEpoch:null});
  gate.resolve({providerEpoch:'epoch-a',projects:[project]});await tick();
  assert.equal(f.view.connected(),false);
  assert.equal(f.find('local-project-select').disabled,true);
  assert.equal(f.find('local-project-status').dataset.state,'source-unavailable');
  assert.throws(()=>f.view.assertCaptured(captured),{code:'E_DEV_CONFLICT'});
});
test('a saved offline selection never silently switches to another authorized project',async t=>{
  const f=fixture(t,{connected:true,saved:{bindingId:'local-old',name:'Earlier project',sourceId:'source-old'}});await tick();
  assert.equal(f.view.selectedBindingId(),'local-old');
  assert.equal(f.view.connected(),false);
  assert.equal(f.find('local-project-select').disabled,false);
  f.find('local-project-select').value='local-a';f.find('local-project-select').fire('change');
  assert.equal(f.view.connected(),true);
  assert.deepEqual(f.calls,['status','projects.list']);
});
test('an unsupported Native source transfer requires an update and metadata polls never disguise it as ready',async t=>{
  t.mock.timers.enable({apis:['setInterval']});
  const f=fixture(t,{connected:true});await tick();const request=f.client.requestLocalProject;
  f.client.requestLocalProject=async(method,params)=>{
    if(method==='project.resolve')throw Object.assign(new Error('Native source transfer unsupported'),{code:'E_NATIVE_UPDATE_REQUIRED'});
    return request(method,params);
  };
  await assert.rejects(f.view.resolve(f.view.capture()),{code:'E_NATIVE_UPDATE_REQUIRED'});
  assert.equal(f.find('local-project-status').dataset.state,'update-required');
  assert.match(f.find('local-project-status').textContent,/更新本机应用/);
  assert.doesNotMatch(f.find('local-project-status').textContent,/源码有错误/);
  assert.equal(f.view.connected(),false);
  assert.throws(()=>f.view.capture(),{code:'E_NATIVE_UPDATE_REQUIRED'});
  t.mock.timers.tick(2000);await tick();
  assert.equal(f.find('local-project-status').dataset.state,'update-required');
  assert.equal(f.view.connected(),false);
  f.find('local-project-refresh').fire('click');await tick();
  assert.equal(f.view.connected(),true,'an explicit refresh permits a new compatibility check');
});
test('a failed status request clears stale Native connectivity without inferring disconnect from a catalog failure',async t=>{
  const f=fixture(t,{connected:true});await tick();
  f.client.requestLocalProject=async method=>{
    if(method==='status')return {connected:true,nativeConnected:true,providerEpoch:'epoch-a'};
    throw Object.assign(new Error('catalog unavailable'),{code:'E_DEV_CATALOG'});
  };
  f.find('local-project-refresh').fire('click');await tick();
  assert.equal(f.find('local-project-status').dataset.state,'source-unavailable');
  f.client.requestLocalProject=async()=>{throw Object.assign(new Error('offline'),{code:'E_DEV_DISCONNECTED'});};
  f.find('local-project-refresh').fire('click');await tick();
  assert.equal(f.find('local-project-status').dataset.state,'disconnected');
  assert.match(f.find('local-project-status').textContent,/本地项目服务未连接/);
});
test('slow metadata polling skips timer ticks and readiness settles after the current catalog check',async t=>{
  t.mock.timers.enable({apis:['setInterval']});
  const f=fixture(t,{connected:true});await tick();const captured=f.view.capture(),gate=deferred();let reads=0;
  f.client.requestLocalProject=async()=>{reads++;return gate.promise;};
  t.mock.timers.tick(2000);await tick();
  let ready=false;const waiting=f.view.assertReady(captured).then(()=>{ready=true;});
  t.mock.timers.tick(6000);await tick();
  assert.equal(reads,1);assert.equal(ready,false);
  gate.resolve({providerEpoch:'epoch-a',projects:[project]});await waiting;
  assert.equal(reads,1);assert.equal(ready,true);
});
test('provider notifications queue at most one follow-up metadata check',async t=>{
  const f=fixture(t,{connected:true});await tick();const captured=f.view.capture(),first=deferred(),second=deferred();let reads=0;
  f.client.requestLocalProject=async()=>{reads++;return reads===1?first.promise:second.promise;};
  const online={connected:true,nativeConnected:true,providerEpoch:'epoch-a'};
  f.notify(online);await tick();f.notify(online);
  const waiting=f.view.assertReady(captured);
  first.resolve({providerEpoch:'epoch-a',projects:[project]});await tick();
  f.notify(online);second.resolve({providerEpoch:'epoch-a',projects:[project]});await waiting;
  assert.equal(reads,2);
});
test('an old source response is rejected after disconnect or a new provider epoch',async t=>{
  for(const state of [{connected:false,nativeConnected:false,providerEpoch:null},{connected:true,nativeConnected:true,providerEpoch:'epoch-b'}]){
    const f=fixture(t,{connected:true});await tick();const gate=deferred(),request=f.client.requestLocalProject;
    f.client.requestLocalProject=async(method,params)=>method==='project.resolve'?gate.promise:request(method,params);
    const resolving=f.view.resolve(f.view.capture());
    f.setState(state);f.notify(state);await tick();
    gate.resolve({providerEpoch:'epoch-a',bindingId:project.bindingId});
    await assert.rejects(resolving,{code:'E_DEV_CONFLICT'});
    f.view.dispose();
  }
});
test('a late offline status response cannot refresh after switching modes or disposing',async t=>{
  for(const action of ['manual','dispose']){
    t.mock.timers.enable({apis:['setInterval']});
    const f=fixture(t);await tick();const gate=deferred();let reads=0;
    f.client.requestLocalProject=async()=>{reads++;return gate.promise;};
    t.mock.timers.tick(2000);await tick();
    if(action==='manual'){f.find('local-project-mode').checked=false;f.find('local-project-mode').fire('change');}else f.view.dispose();
    gate.resolve({connected:true,nativeConnected:true,providerEpoch:'epoch-a'});await tick();
    assert.equal(reads,1);assert.equal(f.view.connected(),false);
    f.view.dispose();t.mock.timers.reset();
  }
});
