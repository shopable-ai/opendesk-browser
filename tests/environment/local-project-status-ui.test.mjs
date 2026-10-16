import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocalProjectView} from '../../src/ui/local-project.js';

// Component evidence only; these events do not claim trusted browser input.
class Element {
  checked=false;disabled=false;value='';textContent='';dataset={};children=[];listeners=new Map();mutations=0;
  constructor(){
    this.dataset=new Proxy({},{set:(target,key,value)=>{this.mutations++;target[key]=value;return true;}});
    return new Proxy(this,{set:(target,key,value)=>{if(['hidden','disabled','value','textContent','title'].includes(key))target.mutations++;target[key]=value;return true;}});
  }
  addEventListener(event,callback){this.listeners.set(event,callback);}
  removeEventListener(event){this.listeners.delete(event);}
  fire(event,detail={}){this.listeners.get(event)?.({isTrusted:true,...detail});}
  replaceChildren(...children){this.mutations++;this.children=children;}
  append(child){this.mutations++;this.children.push(child);}
  removeAttribute(name){this.mutations++;delete this[name];}
}
globalThis.Option=class extends Element {constructor(text,value){super();this.textContent=text;this.value=value;}};
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
const project={bindingId:'local-a',name:'TOC',sourceId:'source-a',runtimeKind:'page-userscript',preparation:{state:'ready'}};
const workspace={workspaceId:'workspace-00000000-0000-0000-0000-000000000001',name:'prompt-shortcuts',sourceId:'source-'+'a'.repeat(24),access:'read-write',leaseEpoch:'lease-'+'a'.repeat(24)};
const fileCatalog=workspaces=>({workspaces,sessionId:'files-session-'+'a'.repeat(24)});
function fixture(t,{nativeConnected=true,connected=false,saved,files=[]}={}){
  const nodes=new Map(),find=id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);};
  find('local-project-mode').checked=true;
  let state={connected,nativeConnected,providerEpoch:connected?'epoch-a':null},projects=[project],listener;
  const calls=[],writes=[],opened=[];let changes=0;
  const client={requestLocalProject:async method=>{calls.push(method);return method==='status'?state:method==='workspaces.list'?fileCatalog(files):{providerEpoch:state.providerEpoch,projects};},
    subscribeLocalProjects:callback=>{listener=callback;return ()=>{listener=null;};}};
  const api={runtime:{getURL:path=>'chrome-extension://test/'+path,openOptionsPage:async()=>opened.push('options')},tabs:{create:async value=>opened.push(value)},storage:{local:{get:async()=>saved?{'opendesk.local-project.selection.v1':saved}:{},set:async value=>{writes.push(value);}}}};
  const view=createLocalProjectView({client,api,document:{getElementById:find},onChange:()=>changes++,preparationDelayMs:0});
  t.after(()=>view.dispose());
  return {view,find,calls,writes,opened,client,setState:value=>{state=value;},setProjects:value=>{projects=value;},setFiles:value=>{files=value;},notify:value=>listener(value),
    activity:()=>({mutations:[...nodes.values()].reduce((sum,node)=>sum+node.mutations,0),changes,writes:writes.length})};
}
test('file-only catalog stays metadata-only and opens only through a trusted explicit action',async t=>{
  const f=fixture(t,{files:[workspace]});await tick();
  const binding='file-workspace:'+workspace.workspaceId;
  assert.equal(f.find('local-project-select').value,binding);
  assert.match(f.find('local-project-select').children[1].textContent,/prompt-shortcuts · 文件工作区/);
  assert.equal(f.find('local-project-select').disabled,false);
  assert.equal(f.find('local-project-status').dataset.state,'entry-unavailable');
  assert.match(f.find('local-project-status').textContent,/尚未发现可运行入口.*package.json/);
  assert.equal(f.find('local-project-connect').textContent,'打开文件工作区 ↗');
  assert.equal(f.view.connected(),false);
  assert.throws(()=>f.view.capture(),{code:'E_DEV_DISCONNECTED'});
  await assert.rejects(f.view.resolve({generation:0,bindingId:binding,providerEpoch:null}),{code:'E_DEV_CONFLICT'});
  assert.deepEqual(f.opened,[]);
  f.find('local-project-select').fire('change');assert.deepEqual(f.opened,[]);
  f.find('local-project-connect').fire('click',{isTrusted:false});assert.deepEqual(f.opened,[]);
  f.find('local-project-connect').fire('click');await tick();
  assert.deepEqual(f.opened,[{url:'chrome-extension://test/native-agent/workspace.html?sourceId='+workspace.sourceId}]);
  assert.deepEqual(f.calls,['status','workspaces.list']);
  assert.equal(f.writes.at(-1)['opendesk.local-project.selection.v1'].bindingId,binding);
});
test('workspace without sourceId opens by workspaceId and saved file selection restores safely',async t=>{
  const {sourceId,...file}=workspace,binding='file-workspace:'+file.workspaceId;
  const f=fixture(t,{files:[file],saved:{bindingId:binding,name:file.name,paramsText:'{"saved":true}'}});await tick();
  assert.equal(f.view.selectedBindingId(),binding);
  assert.equal(f.find('local-project-params').value,'{"saved":true}');
  f.find('local-project-connect').fire('click');await tick();
  assert.equal(f.opened[0].url,'chrome-extension://test/native-agent/workspace.html?workspaceId='+file.workspaceId);
  assert.equal(f.view.connected(),false);
});
test('a directory without an executable binding keeps file opening auxiliary and reports the missing entry',async t=>{
  const f=fixture(t,{files:[workspace]});await tick();
  assert.equal(f.view.selectionKind(),'file-workspace');
  assert.equal(f.view.canOpenWorkspace(),true);
  assert.match(f.find('local-project-intro').textContent,/直接编辑.*同一运行流程/);
  assert.doesNotMatch(f.find('local-project-intro').textContent,/系统自动准备/);
  assert.equal(f.find('local-project-params-tools').hidden,true);
  assert.equal(f.view.canAttemptRun(),false);
  assert.equal(f.view.openWorkspace({isTrusted:false}),false);
  assert.equal(f.view.openWorkspace({isTrusted:true}),true);await tick();
  assert.equal(f.opened.length,1);
  f.setFiles([]);f.find('local-project-refresh').fire('click');await tick();
  assert.equal(f.view.selectionKind(),'missing');
  assert.equal(f.view.canOpenWorkspace(),false);
  assert.equal(f.view.openWorkspace({isTrusted:true}),false);
  assert.equal(f.opened.length,1);
});
test('workspace open failure names the operation and remains actionable across unchanged polling',async t=>{
  t.mock.timers.enable({apis:['setInterval']});
  const f=fixture(t,{files:[workspace]});await tick();
  // Component fixture only; actual browser actions are validated separately.
  const apiFailure=Object.assign(new Error('Tab creation failed'),{code:'E_TAB_CREATE'});
  f.opened.push=()=>{throw apiFailure;};
  f.view.openWorkspace({isTrusted:true});await tick();
  const message=f.find('local-project-status').textContent;
  assert.match(message,/未能打开文件工作区.*E_TAB_CREATE/);
  assert.match(message,/重试/);
  assert.doesNotMatch(message,/连接设置|扩展选项/);
  const before=f.activity();
  t.mock.timers.tick(4000);await tick();
  assert.equal(f.find('local-project-status').textContent,message);
  assert.deepEqual(f.activity(),before);
});
test('runnable source errors show the actual failing entry and repair direction',async t=>{
  const f=fixture(t,{connected:true});
  f.setProjects([{...project,preparation:{state:'source-error',error:{code:'E_ENTRY',message:'入口 src/missing.js 不存在'}}}]);
  await tick();
  assert.equal(f.view.selectionKind(),'program');
  assert.match(f.find('local-project-status').textContent,/E_ENTRY.*src\/missing\.js.*修改/);
  assert.equal(f.view.canAttemptRun(),false);
  assert.equal(f.view.openWorkspace({isTrusted:true}),false);
  assert.deepEqual(f.opened,[]);
});
test('quiet discovery and revocation update availability without changing an empty or offline selection',async t=>{
  t.mock.timers.enable({apis:['setInterval']});
  const other={...workspace,workspaceId:workspace.workspaceId.slice(0,-1)+'2',sourceId:'source-'+'b'.repeat(24),name:'other files'};
  for(const saved of [undefined,{bindingId:'old-project',name:'offline project',paramsText:'{}'}]){
    const f=fixture(t,{saved});await tick();
    assert.equal(f.find('local-project-select').disabled,true);
    f.setFiles([workspace,other]);t.mock.timers.tick(2000);await tick();
    assert.equal(f.find('local-project-select').disabled,false);
    assert.equal(f.view.selectedBindingId(),saved?.bindingId||'');
    assert.equal(f.find('local-project-status').dataset.state,'selection-needed');
    assert.match(f.find('local-project-status').textContent,/请选择已授权项目/);
    f.setFiles([]);t.mock.timers.tick(2000);await tick();
    assert.equal(f.find('local-project-select').disabled,true);
    assert.equal(f.view.selectedBindingId(),saved?.bindingId||'');
    f.view.dispose();
  }
});
test('mixed catalog deduplicates runnable workspace and keeps file selections unable to run',async t=>{
  const other={...workspace,workspaceId:workspace.workspaceId.slice(0,-1)+'2',sourceId:'source-'+'b'.repeat(24),name:'files only'};
  const f=fixture(t,{connected:true,files:[workspace,other]});
  f.setProjects([{...project,sourceId:workspace.sourceId}]);await tick();
  assert.deepEqual(f.find('local-project-select').children.map(row=>row.value),['',project.bindingId,'file-workspace:'+other.workspaceId]);
  f.find('local-project-select').value=project.bindingId;f.find('local-project-select').fire('change');
  const captured=f.view.capture();assert.equal(f.view.connected(),true);
  f.find('local-project-select').value='file-workspace:'+other.workspaceId;f.find('local-project-select').fire('change');
  assert.equal(f.view.connected(),false);assert.throws(()=>f.view.capture(),{code:'E_DEV_DISCONNECTED'});
  assert.throws(()=>f.view.assertCaptured(captured),{code:'E_DEV_CONFLICT'});
  f.setProjects([{...project,workspaceId:workspace.workspaceId,sourceId:'source-other'}]);
  f.find('local-project-refresh').fire('click');await tick();
  assert.equal(f.find('local-project-select').children.length,4,'conflicting source identity must not hide a workspace');
});
test('file revocation removes live metadata, retains an offline selection and blocks opening',async t=>{
  t.mock.timers.enable({apis:['setInterval']});
  const f=fixture(t,{files:[workspace]});await tick();const binding=f.view.selectedBindingId();
  f.setFiles([]);t.mock.timers.tick(2000);await tick();
  assert.equal(f.view.selectedBindingId(),binding);
  assert.match(f.find('local-project-select').children.at(-1).textContent,/离线/);
  assert.equal(f.find('local-project-select').disabled,true);
  assert.notEqual(f.find('local-project-connect').textContent,'打开文件工作区 ↗');
  f.find('local-project-connect').fire('click');await tick();assert.deepEqual(f.opened,['options']);
  assert.throws(()=>f.view.capture(),{code:'E_DEV_DISCONNECTED'});
  f.setFiles([workspace]);t.mock.timers.tick(2000);await tick();
  assert.equal(f.find('local-project-status').dataset.state,'entry-unavailable');
  f.notify({connected:false,nativeConnected:false,providerEpoch:null});
  assert.equal(f.find('local-project-select').disabled,true);assert.equal(f.view.connected(),false);
});
test('unchanged disconnected, file-only and runnable idle polls and duplicate notifications do not mutate DOM or notify editor',async t=>{
  t.mock.timers.enable({apis:['setInterval']});
  for(const config of [{nativeConnected:false},{},{files:[workspace]},{connected:true}]){
    const f=fixture(t,config);await tick();const before=f.activity(),options=f.find('local-project-select').children;
    for(let i=0;i<3;i++){t.mock.timers.tick(2000);await tick();}
    f.notify({connected:config.connected===true,nativeConnected:config.nativeConnected!==false,providerEpoch:config.connected?'epoch-a':null});await tick();
    assert.deepEqual(f.activity(),before,JSON.stringify(config));
    assert.equal(f.find('local-project-select').children,options);
    f.view.dispose();
  }
});
test('optional catalog rejects malformed metadata or unavailable bridge without breaking runnable flow',async t=>{
  for(const value of [{projects:[project]},fileCatalog([{...workspace,access:'owner'}]),{workspaces:[workspace]},fileCatalog([{...workspace,workspaceId:'javascript:alert(1)'}]),fileCatalog([{...workspace,sourceId:'bad'}]),fileCatalog([{...workspace,sourceId:''}]),fileCatalog([{...workspace,leaseEpoch:42}]),Object.assign(new Error('old bridge'),{code:'E_SCHEMA'}),Object.assign(new Error('offline'),{code:'E_FILES_DISCONNECTED'}),Object.assign(new Error('timeout'),{code:'E_FILES_TIMEOUT'})]){
    const f=fixture(t,{connected:true}),request=f.client.requestLocalProject;
    f.client.requestLocalProject=async(method,params)=>{if(method!=='workspaces.list')return request(method,params);if(value instanceof Error)throw value;return value;};
    await tick();assert.equal(f.view.connected(),true);assert.equal(f.find('local-project-select').children.length,2);
    assert.equal(f.view.capture().bindingId,project.bindingId);f.view.dispose();
  }
});
test('older statuses without explicit Native connectivity never query file metadata or infer file authority',async t=>{
  t.mock.timers.enable({apis:['setInterval']});
  for(const state of [{connected:true,providerEpoch:'epoch-a'},{connected:true,nativeConnected:false,providerEpoch:'epoch-a'},{connected:false}]){
    const f=fixture(t,{files:[workspace]});f.setState(state);await tick();
    t.mock.timers.tick(2000);await tick();
    assert.equal(f.calls.includes('workspaces.list'),false);
    assert.equal(f.view.connected(),state.connected);
    assert.equal(f.find('local-project-select').children.some(row=>/文件工作区/.test(row.textContent)),false);
    f.view.dispose();
  }
});
test('slow optional file catalog does not block runnable readiness or source metadata checks',async t=>{
  t.mock.timers.enable({apis:['setInterval']});
  const f=fixture(t,{connected:true}),gate=deferred(),request=f.client.requestLocalProject;
  let fileReads=0;
  f.client.requestLocalProject=async(method,params)=>{
    if(method==='workspaces.list'){fileReads++;return gate.promise;}
    return request(method,params);
  };
  await tick();assert.equal(f.view.connected(),true);
  const captured=f.view.capture();
  t.mock.timers.tick(2000);await f.view.assertReady(captured);await tick();
  assert.equal(fileReads,1);assert.equal(f.view.connected(),true);
  assert.equal(f.find('local-project-select').children.length,2);
  gate.resolve(fileCatalog([workspace]));await tick();
  assert.equal(f.find('local-project-select').children.length,3);
  f.view.assertCaptured(captured);
});
test('slow disconnected recovery stays quiet, skips timer ticks and invalidates late file discovery on mode switch',async t=>{
  t.mock.timers.enable({apis:['setInterval']});
  const f=fixture(t);await tick();const gate=deferred(),request=f.client.requestLocalProject;let reads=0;
  f.client.requestLocalProject=async(method,params)=>{if(method==='status'){reads++;return gate.promise;}return request(method,params);};
  const before=f.activity();
  t.mock.timers.tick(2000);await tick();t.mock.timers.tick(6000);await tick();
  assert.deepEqual(f.activity(),before);assert.equal(reads,1);
  f.find('local-project-mode').checked=false;f.find('local-project-mode').fire('change');
  const switched=f.activity();gate.resolve({connected:true,nativeConnected:true,providerEpoch:'epoch-a'});await tick();
  assert.deepEqual(f.activity(),switched);assert.equal(f.view.connected(),false);
});
test('changing selection among live rows and reordered file metadata never rebuilds idle options',async t=>{
  t.mock.timers.enable({apis:['setInterval']});
  const other={...workspace,workspaceId:workspace.workspaceId.slice(0,-1)+'2',name:'other files'};
  const f=fixture(t,{connected:true,files:[workspace,other]});await tick();
  f.find('local-project-select').value='file-workspace:'+other.workspaceId;f.find('local-project-select').fire('change');
  const before=f.activity(),options=f.find('local-project-select').children;
  f.setFiles([other,workspace]);t.mock.timers.tick(2000);await tick();
  assert.equal(f.find('local-project-select').children,options);assert.deepEqual(f.activity(),before);
});
test('file metadata remains independently available when the runnable catalog errors',async t=>{
  const f=fixture(t,{connected:true,files:[workspace]}),request=f.client.requestLocalProject;
  f.client.requestLocalProject=async(method,params)=>{if(method==='projects.list')throw Object.assign(new Error('provider unavailable'),{code:'E_DEV_CATALOG'});return request(method,params);};
  await tick();
  assert.equal(f.find('local-project-status').dataset.state,'entry-unavailable');
  assert.equal(f.view.connected(),false);assert.throws(()=>f.view.capture(),{code:'E_DEV_DISCONNECTED'});
  f.find('local-project-connect').fire('click');await tick();assert.match(f.opened[0].url,/workspace.html\?sourceId=/);
});
test('Native online without a source provider is distinct from a disconnected bridge',async t=>{
  const f=fixture(t);await tick();
  assert.equal(f.find('local-project-status').dataset.state,'source-unavailable');
  assert.match(f.find('local-project-status').textContent,/本机 OpenDesk 已连接/);
  assert.match(f.find('local-project-status').textContent,/opendesk-dev/);
  assert.match(f.find('local-project-status').title,/E_DEV_PROVIDER_UNAVAILABLE/);
  assert.equal(f.find('local-project-select').disabled,true);
  assert.equal(f.view.connected(),false);
  assert.throws(()=>f.view.capture(),{code:'E_DEV_DISCONNECTED'});
  assert.deepEqual(f.calls,['status','workspaces.list']);
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
  assert.deepEqual(f.calls,['status','workspaces.list','status','workspaces.list','projects.list']);
});
test('metadata polling recovers a missed online notification and stops on disposal',async t=>{
  t.mock.timers.enable({apis:['setInterval']});
  const f=fixture(t);await tick();
  f.setState({connected:true,nativeConnected:true,providerEpoch:'epoch-a'});
  t.mock.timers.tick(2000);await tick();
  assert.equal(f.view.connected(),true);
  assert.deepEqual(f.calls,['status','workspaces.list','status','workspaces.list','projects.list']);
  f.view.dispose();t.mock.timers.tick(4000);await tick();
  assert.equal(f.calls.length,5);
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
  assert.deepEqual(f.calls,['status','workspaces.list','projects.list']);
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
  f.client.requestLocalProject=async method=>{if(method==='workspaces.list')return fileCatalog([]);reads++;return gate.promise;};
  t.mock.timers.tick(2000);await tick();
  let ready=false;const waiting=f.view.assertReady(captured).then(()=>{ready=true;});
  t.mock.timers.tick(6000);await tick();
  assert.equal(reads,1);assert.equal(ready,false);
  gate.resolve({providerEpoch:'epoch-a',projects:[project]});await waiting;
  assert.equal(reads,1);assert.equal(ready,true);
});
test('provider notifications queue at most one follow-up metadata check',async t=>{
  const f=fixture(t,{connected:true});await tick();const captured=f.view.capture(),first=deferred(),second=deferred();let reads=0;
  f.client.requestLocalProject=async method=>{if(method==='workspaces.list')return fileCatalog([]);reads++;return reads===1?first.promise:second.promise;};
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
    f.client.requestLocalProject=async method=>{if(method==='workspaces.list')return fileCatalog([]);reads++;return gate.promise;};
    t.mock.timers.tick(2000);await tick();
    if(action==='manual'){f.find('local-project-mode').checked=false;f.find('local-project-mode').fire('change');}else f.view.dispose();
    gate.resolve({connected:true,nativeConnected:true,providerEpoch:'epoch-a'});await tick();
    assert.equal(reads,1);assert.equal(f.view.connected(),false);
    f.view.dispose();t.mock.timers.reset();
  }
});

test('local readiness hides connection help and Page parameters, without hiding offline recovery',async t=>{
  const f=fixture(t,{connected:true});await tick();
  assert.equal(f.find('local-project-recovery').hidden,true);
  assert.equal(f.find('local-project-connect').hidden,true);
  assert.equal(f.find('local-project-params-tools').hidden,true);
  assert.equal(f.view.readyForRun(),true);
  f.notify({connected:false,nativeConnected:false,providerEpoch:null});await tick();
  assert.equal(f.find('local-project-recovery').hidden,false);
  assert.equal(f.find('local-project-connect').hidden,false);
  assert.equal(f.view.readyForRun(),false);
});
test('catalogs without preparation metadata only read selected authorized source and verify hash',async t=>{
  const f=fixture(t,{connected:true});f.setProjects([{...project,preparation:undefined}]);
  const sourceUtf8='async function main() { return 1; }';
  const {createHash}=await import('node:crypto');
  const sourceHash=createHash('sha256').update(sourceUtf8).digest('hex');
  const prior=f.client.requestLocalProject,reads=[];
  f.client.requestLocalProject=async(method,params)=>{
    if(method==='project.resolve'){
      reads.push(params.bindingId);
      return {bindingId:params.bindingId,providerEpoch:'epoch-a',runtimeKind:'page-userscript',
        sourceUtf8,sourceBytes:Buffer.byteLength(sourceUtf8),sourceHash,inputHash:'a'.repeat(64)};
    }
    return prior(method,params);
  };
  await tick();f.find('local-project-refresh').fire('click');
  for(let n=0;n<20&&!f.view.readyForRun();n++)await new Promise(resolve=>setTimeout(resolve,5));
  assert.ok(reads.length>=1&&reads.length<=2&&reads.every(binding=>binding==='local-a'),
    'initial preparation and explicit Refresh may each read ONLY the selected authorized binding');
  assert.equal(f.view.readyForRun(),true);
  assert.equal(f.find('local-project-status').dataset.state,'ready');
  assert.match(f.find('local-project-diagnostics').textContent,/源码 SHA-256/);
  assert.equal((await f.view.resolve(f.view.capture())).sourceHash,sourceHash);
});
test('bad background SHA is non-executable and prior project stays visible offline',async t=>{
  const f=fixture(t,{connected:true,saved:{bindingId:'local-a',name:'TOC',localMode:true}});
  f.setProjects([{...project,preparation:undefined}]);
  const prior=f.client.requestLocalProject;
  f.client.requestLocalProject=async(method,params)=>method==='project.resolve'?
    {bindingId:params.bindingId,providerEpoch:'epoch-a',runtimeKind:'controller',
      sourceUtf8:'return 1',sourceBytes:8,sourceHash:'f'.repeat(64),inputHash:'a'.repeat(64)}:
    prior(method,params);
  await tick();f.find('local-project-refresh').fire('click');
  for(let n=0;n<20&&f.find('local-project-status').dataset.state!=='source-error';n++)
    await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal(f.view.readyForRun(),false);
  assert.equal(f.find('local-project-status').dataset.state,'source-error');
  assert.throws(()=>f.view.capture(),{code:'E_DEV_SOURCE'});
  f.setProjects([]);f.find('local-project-refresh').fire('click');await tick();
  assert.match(f.find('local-project-select').children.at(-1).textContent,/离线/);
  assert.equal(f.view.readyForRun(),false);
});

test('Run admission rejects a changed authoritative source hash and runtime type',async t=>{
  for(const mismatch of ['source-hash','runtime-kind'])await t.test(mismatch,async t=>{
    const f=fixture(t,{connected:true});await tick();
    const {createHash}=await import('node:crypto');
    const hash=text=>createHash('sha256').update(text).digest('hex');
    const previous='async function main(){return 1}',next='async function main(){return 2}';
    f.setProjects([{...project,preparation:{state:'ready',sourceHash:hash(previous),sourceRevision:'a'.repeat(64)}}]);
    f.find('local-project-refresh').fire('click');await tick();
    const captured=f.view.capture(),original=f.client.requestLocalProject;
    f.client.requestLocalProject=async(method,params)=>method==='project.resolve'?{
      bindingId:params.bindingId,providerEpoch:'epoch-a',runtimeKind:mismatch==='runtime-kind'?'controller':'page-userscript',
      sourceUtf8:mismatch==='runtime-kind'?previous:next,
      sourceHash:hash(mismatch==='runtime-kind'?previous:next),sourceBytes:Buffer.byteLength(mismatch==='runtime-kind'?previous:next)
    }:original(method,params);
    await assert.rejects(f.view.resolve(captured),{code:'E_DEV_CONFLICT'});
  });
});
test('read-only resolution does not claim the verified bytes already ran',async t=>{
  const f=fixture(t,{connected:true});await tick();
  const sourceUtf8='async function main(){return 1}',sourceHash=(await import('node:crypto')).createHash('sha256').update(sourceUtf8).digest('hex');
  const original=f.client.requestLocalProject;
  f.client.requestLocalProject=async(method,params)=>method==='project.resolve'?{
    bindingId:params.bindingId,providerEpoch:'epoch-a',runtimeKind:'page-userscript',sourceUtf8,
    sourceBytes:Buffer.byteLength(sourceUtf8),sourceHash
  }:original(method,params);
  await f.view.resolve(f.view.capture());
  assert.match(f.find('local-project-status').title,/最近读取源码（不代表已执行）/);
  assert.doesNotMatch(f.find('local-project-status').title,/上次运行源码/);
});

test('an authoritative updating source cannot dispatch a previously compiled valid hash',async t=>{
  const f=fixture(t,{connected:true});
  const sourceUtf8='async function main(){return 101;}';
  const sourceHash=(await import('node:crypto')).createHash('sha256').update(sourceUtf8).digest('hex');
  f.setProjects([{...project,preparation:{state:'updating',sourceHash}}]);
  const request=f.client.requestLocalProject;
  f.client.requestLocalProject=async(method,params)=>method==='project.resolve'?
    {bindingId:params.bindingId,providerEpoch:'epoch-a',runtimeKind:'page-userscript',
      sourceUtf8,sourceHash,sourceBytes:Buffer.byteLength(sourceUtf8)}:request(method,params);
  await tick();
  f.find('local-project-refresh').fire('click');await tick();
  assert.equal(f.view.readyForRun(),false);
  await assert.rejects(f.view.resolve(f.view.capture()),{code:'E_DEV_CONFLICT'});
  f.setProjects([{...project,preparation:{state:'ready',sourceHash}}]);
  f.notify({connected:true,nativeConnected:true,providerEpoch:'epoch-a'});
  await tick();await tick();
  assert.equal(f.view.readyForRun(),true);
  assert.equal((await f.view.resolve(f.view.capture())).sourceHash,sourceHash);
});

test('final dispatch gate rejects an authoritative hash changed after a successful Resolve',async t=>{
  const f=fixture(t,{connected:true});
  const sourceUtf8='async function main(){return 102;}';
  const createHash=(await import('node:crypto')).createHash;
  const sourceHash=createHash('sha256').update(sourceUtf8).digest('hex');
  const laterHash=createHash('sha256').update(sourceUtf8+'// edited').digest('hex');
  f.setProjects([{...project,preparation:{state:'ready',sourceHash}}]);
  const request=f.client.requestLocalProject;
  f.client.requestLocalProject=async(method,params)=>method==='project.resolve'?
    {bindingId:params.bindingId,providerEpoch:'epoch-a',runtimeKind:'page-userscript',
      sourceUtf8,sourceHash,sourceBytes:Buffer.byteLength(sourceUtf8)}:request(method,params);
  await tick();
  f.find('local-project-refresh').fire('click');await tick();
  const binding=f.view.capture();
  assert.equal((await f.view.resolve(binding)).sourceHash,sourceHash);
  f.setProjects([{...project,preparation:{state:'ready',sourceHash:laterHash}}]);
  f.notify({connected:true,nativeConnected:true,providerEpoch:'epoch-a'});
  await tick();await tick();
  await assert.rejects(f.view.assertReady(binding,sourceHash),{code:'E_DEV_CONFLICT'});
});


test('a selected directory follows its unique live program identity when the Provider registers',async t=>{
  t.mock.timers.enable({apis:['setInterval']});
  const f=fixture(t,{files:[workspace]});await tick();
  const prior=f.view.selectedBindingId();
  assert.equal(prior,'file-workspace:'+workspace.workspaceId);
  f.find('local-project-params').value='{"selected":true}';
  f.setProjects([{...project,sourceId:workspace.sourceId,workspaceId:workspace.workspaceId}]);
  f.setState({connected:true,nativeConnected:true,providerEpoch:'epoch-a'});
  t.mock.timers.tick(2000);await tick();
  assert.equal(f.view.selectedBindingId(),project.bindingId);
  assert.equal(f.view.capture().bindingId,project.bindingId);
  assert.equal(f.view.canAttemptRun(),true);
  assert.equal(f.find('local-project-params').value,'{"selected":true}');
  assert.deepEqual(f.opened,[]);
  assert.ok(f.calls.every(method=>['status','workspaces.list','projects.list'].includes(method)), 'association must not resolve or execute source');
  const before=f.activity(),options=f.find('local-project-select').children;
  t.mock.timers.tick(6000);await tick();
  assert.deepEqual(f.activity(),before);
  assert.equal(f.find('local-project-select').children,options);
});

test('a restored directory selection associates only by matching current source, never project name',async t=>{
  for(const by of ['sourceId','workspaceId']){
    const saved={bindingId:'file-workspace:'+workspace.workspaceId,name:workspace.name,sourceId:workspace.sourceId};
    const f=fixture(t,{connected:true,files:[workspace],saved});
    f.setProjects([{...project,sourceId:undefined,name:'different display name',[by]:workspace[by]}]);await tick();
    assert.equal(f.view.capture().bindingId,project.bindingId);f.view.dispose();
  }
  for(const rows of [
    [{...project,name:workspace.name}],
    [{...project,workspaceId:workspace.workspaceId,sourceId:'source-'+'b'.repeat(24)}],
    [{...project,sourceId:workspace.sourceId},{...project,bindingId:'local-b',sourceId:workspace.sourceId}]
  ]){
    const f=fixture(t,{connected:true,files:[workspace],saved:{bindingId:'file-workspace:'+workspace.workspaceId,name:workspace.name}});
    f.setProjects(rows);await tick();
    assert.equal(f.view.selectedBindingId(),'file-workspace:'+workspace.workspaceId);
    assert.equal(f.view.canAttemptRun(),false);
    assert.throws(()=>f.view.capture(),{code:'E_DEV_DISCONNECTED'});
    assert.deepEqual(f.opened,[]);f.view.dispose();
  }
});


test('restored directory identity cannot silently change to another source under the same workspaceId',async t=>{
  const oldSource='source-'+'b'.repeat(24),saved={bindingId:'file-workspace:'+workspace.workspaceId,name:'original',sourceId:oldSource};
  for(const connected of [false,true]){
    const f=fixture(t,{connected,files:[workspace],saved});
    f.setProjects([{...project,sourceId:workspace.sourceId,workspaceId:workspace.workspaceId}]);await tick();
    assert.equal(f.view.selectedBindingId(),saved.bindingId);
    assert.equal(f.view.canAttemptRun(),false);
    assert.throws(()=>f.view.capture(),{code:'E_DEV_DISCONNECTED'});
    f.find('local-project-select').fire('change');
    assert.equal(f.view.canAttemptRun(),false,'reselecting an offline row cannot accept a different source');
    assert.ok(f.writes.every(row=>row['opendesk.local-project.selection.v1'].sourceId!==workspace.sourceId));
    if(connected){
      f.find('local-project-select').value=project.bindingId;f.find('local-project-select').fire('change');
      assert.equal(f.view.capture().bindingId,project.bindingId,'only an explicit new selection accepts the new source');
    }
    f.view.dispose();
  }
});
