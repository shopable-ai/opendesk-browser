import {createDeveloperView} from '../../src/ui/develop-view.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir,rm} from 'node:fs/promises';
import {build} from 'esbuild';
import {parseHTML} from 'linkedom';
import * as React from 'react';
import {createMyWorkbenchView} from '../../src/ui/my-workbench-view.js';
import {myWorkbenchDefaults} from '../../src/ui/my-workbench-defaults.js';
import {createTaskWorkbench} from '../../src/ui/task-workbench.js';
import {createScheduledTaskWorkbench} from '../../src/ui/scheduled-task-workbench.js';
import {encodeValue} from '../../src/platform/page-port/codec.js';

// Simulated DOM/controller evidence only. No Chrome permissions, native Panel,
// alarms or real RunHost are claimed by this suite.
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const native=()=>({isTrusted:true,preventDefault(){},defaultPrevented:false});
const artifacts=new URL('../../artifacts/my-react-workbench-tests/',import.meta.url);
let MyTasksPage,TaskRunSheet,createRoot;
test.before(async()=>{
  await mkdir(artifacts,{recursive:true});
  await build({stdin:{contents:'export {MyTasksPage} from "./src/ui/react/tabs/my-page.tsx"; export {TaskRunSheet} from "./src/ui/react/tabs/task-run-sheet.tsx";',resolveDir:process.cwd()},
    bundle:true,packages:'external',platform:'node',format:'esm',outfile:new URL('page.mjs',artifacts).pathname,logLevel:'silent'});
  ({MyTasksPage,TaskRunSheet}=await import(new URL('page.mjs',artifacts)));
});
test.after(()=>rm(artifacts,{recursive:true,force:true}));

async function fixture({twoTasks=false,paramsSchema,otherParamsSchema}={}){
  const {document:doc,window}=parseHTML('<html><body><nav class="workbench-nav"></nav><div id="outside"></div><div id="mount"></div></body></html>');
  // Advertise the input events used by this fixture so React does not select
  // its legacy IE key-event value tracker (not implemented by linkedom).
  doc.oninput=null;
  // linkedom has no native dialog lifecycle. Simulate open/close only, not
  // Chromium's top layer, focus restoration or inert background.
  const dialogPrototype=Object.getPrototypeOf(doc.createElement('dialog'));
  Object.defineProperty(dialogPrototype,'open',{configurable:true,
    get(){return this.hasAttribute('open');},set(value){this.toggleAttribute('open',Boolean(value));}});
  dialogPrototype.showModal=function(){this.open=true;};
  dialogPrototype.close=function(){if(!this.open)return;this.open=false;this.dispatchEvent(new window.Event('close'));};
  globalThis.window=window;globalThis.document=doc;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  globalThis.HTMLElement=window.HTMLElement;globalThis.SVGElement=window.SVGElement;
  globalThis.Option=function(label,value){const option=doc.createElement('option');option.textContent=label;option.value=value;return option;};
  const outside=doc.getElementById('outside');
  for(const file of ['src/ui/task-workbench.js','src/ui/scheduled-task-workbench.js']){
    const source=await readFile(file,'utf8');
    for(const [,id]of source.matchAll(/get\('([^']+)'\)/g)){
      if(Object.hasOwn(myWorkbenchDefaults,id)||doc.getElementById(id))continue;
      const node=doc.createElement(id.endsWith('-run')||id.endsWith('-stop')?'button':'div');
      node.id=id;node.value='';outside.append(node);
    }
  }
  for(const name of ['tasks','workflow','develop','tools','cloud','catalog','debug']){
    if(!doc.getElementById('workbench-'+name)){const node=doc.createElement('div');node.id='workbench-'+name;outside.append(node);}
  }
  if(!doc.getElementById('workspace-content')){const node=doc.createElement('div');node.id='workspace-content';outside.append(node);}
  const manifestHash='a'.repeat(64),sourceHash='b'.repeat(64);
  const manifest={taskId:'test.task',version:'1.0.0',title:'已验证任务',description:'用于参数和停止验证',author:'OpenDesk',source:'local',
    siteOrigins:['https://example.com'],permissions:['page.automation'],program:{sourceHash},
    paramsSchema:paramsSchema??{type:'object',properties:{name:{type:'string',title:'名称',default:'Alice',minLength:1,maxLength:40},
      count:{type:'integer',title:'次数',default:2},accept:{type:'boolean',title:'确认',default:true},
      mode:{type:'string',title:'模式',enum:['a','b'],default:'a'}},required:['name'],additionalProperties:false}};
  const installed={taskId:manifest.taskId,version:manifest.version,scriptId:'task:test.task:1.0.0',enabled:true,manifestHash,
    installationId:'11111111-1111-4111-8111-111111111111',generation:1};
  const candidate={...installed,manifest,stage:'available',installed:true};
  const state={catalog:[candidate],installed:[installed],plans:[],runs:[],results:[],calls:[],starts:[],stops:[],
    changeResolved:false,failHistory:false,unknownSave:false,pendingPermission:null,permissionCalls:[]};
  if(twoTasks){state.catalog.push({...candidate,taskId:'other.task',manifest:{...manifest,taskId:'other.task',title:'第二任务',paramsSchema:otherParamsSchema??manifest.paramsSchema}});
    state.installed.push({...installed,taskId:'other.task',scriptId:'task:other.task:1.0.0',installationId:'22222222-2222-4222-8222-222222222222'});}
  const runSubscribers=new Set(),pageSubscribers=new Set(),installedSubscribers=new Set(),connectionSubscribers=new Set();
  let runId=null,resolveCompletion;
  const host={get currentRun(){return runId;},subscribe(fn){runSubscribers.add(fn);return ()=>runSubscribers.delete(fn);},
    async start(input){state.starts.push(input);runId='run-'+state.starts.length;host.completion=new Promise(resolve=>resolveCompletion=resolve);
      for(const fn of runSubscribers)fn({runId,state:'running'});return {runId};},
    async stop(input){state.stops.push(input);const id=runId;runId=null;
      state.runs.push({runId:id,state:'stopped',revision:{scriptId:installed.scriptId}});
      for(const fn of runSubscribers)fn({runId:id,state:'stopped'});resolveCompletion?.({});},
    finish({failed=false,value='done'}={}){const id=runId;runId=null;
      state.runs.push({runId:id,state:failed?'failed':'completed',revision:{scriptId:installed.scriptId}});
      state.results.push({runId:id,resultId:'result-'+id,state:failed?'failed':'completed',revision:{scriptId:installed.scriptId},
        outcome:failed?{ok:false,error:{code:'E_TEST',message:'可控运行错误'}}:{ok:true,valueWire:encodeValue(value)}});
      for(const fn of runSubscribers)fn({runId:id,state:failed?'failed':'completed'});resolveCompletion?.({});},
    forceRun(id){runId=id;for(const fn of runSubscribers)fn({runId:id,state:'running'});}};
  const client={ready:Promise.resolve(),subscribeConnection(fn){connectionSubscribers.add(fn);return ()=>connectionSubscribers.delete(fn);},
    subscribeInstalledTasks(fn){installedSubscribers.add(fn);return ()=>installedSubscribers.delete(fn);},
    controller:{async snapshotControllerRun(){return structuredClone({runs:state.runs,results:state.results});}},
    async request(action,input){state.calls.push({action,input:structuredClone(input)});
      if(action==='listTaskCatalog')return structuredClone({catalog:state.catalog,installed:state.installed});
      if(action==='listSchedules')return {schedules:structuredClone(state.plans)};
      if(action==='resolveInstalledTask')return {...structuredClone(installed),manifest,manifestHash,sourceHash,contentHash:sourceHash,
        revision:1,generation:state.changeResolved?2:1};
      if(action==='saveSchedule'){
        if(state.unknownSave)throw Object.assign(Error('timeout after possible commit'),{code:'E_EFFECT_UNKNOWN'});
        const prior=state.plans.find(plan=>plan.scheduleId===input.scheduleId);
        const plan={...structuredClone(input),scheduleId:input.scheduleId||'schedule-'+(state.plans.length+1),generation:(prior?.generation||0)+1,
          nextDueAt:Date.now()+60000,history:prior?.history||[]};
        if(prior)state.plans[state.plans.indexOf(prior)]=plan;else state.plans.push(plan);
        return {schedule:structuredClone(plan)};
      }
      if(action==='changeSchedule'){
        const plan=state.plans.find(plan=>plan.scheduleId===input.scheduleId);
        assert.equal(input.expectedGeneration,plan.generation);
        if(input.action==='delete')state.plans=state.plans.filter(row=>row!==plan);
        else{plan.paused=input.action==='pause';plan.generation++;}return {};
      }
      if(action==='listScheduleHistory'){
        if(state.failHistory)throw Error('可控历史加载失败');
        return {history:[{fireId:'older-fire',scheduledAt:1,status:'UNKNOWN',runId:'older-run'}],hasMore:false};
      }
      if(action==='setInstalledTaskEnabled'){state.installed[0].enabled=input.enabled;return {};}
      if(action==='uninstallTask'){assert.equal(input.expectedInstallationId,installed.installationId);state.installed=[];return {};}
      throw Error('Unexpected RPC '+action);
    }};
  const snapshot={status:'available',url:'https://example.com/form',tabId:3,windowId:7,documentId:'doc-3'};
  const currentPageTarget={snapshot,ready:Promise.resolve(),capture:()=>({...snapshot}),revalidate:async()=>{},
    subscribe(fn){pageSubscribers.add(fn);return ()=>pageSubscribers.delete(fn);}};
  const permissionAdded=new Set(),permissionRemoved=new Set();
  const localStore=new Map();
  const navigatorPrototype=globalThis.navigator||{};
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{
    ...navigatorPrototype,locks:{request:async(_key,_options,callback)=>callback()}
  }});
  state.localStore=localStore;
  const api={permissions:{contains:async input=>{state.permissionCalls.push({action:'contains',input});return state.pendingPermission?await state.pendingPermission:true;},
    request:async input=>{state.permissionCalls.push({action:'request',input});return true;},
    onAdded:{addListener:fn=>permissionAdded.add(fn),removeListener:fn=>permissionAdded.delete(fn)},
    onRemoved:{addListener:fn=>permissionRemoved.add(fn),removeListener:fn=>permissionRemoved.delete(fn)}},
    storage:{local:{
      async get(key){return {[key]:structuredClone(localStore.get(key))};},
      async set(record){for(const [key,value]of Object.entries(record))localStore.set(key,structuredClone(value));}
    }},
    runtime:{getURL:path=>'chrome-extension://test/'+path,sendMessage:async()=>({ok:true})},
    tabs:{create:async()=>({id:4})}};
  const view=createMyWorkbenchView({document:doc});
  const workbench=createTaskWorkbench({developerView:createDeveloperView(),client,host,currentPageTarget,api,document:doc,myView:view,
    reactNavigation:{ownsPages:true,connect:()=>{},select:()=>{}},importDraft:()=>{}});
  const scheduler=createScheduledTaskWorkbench({client,host,taskWorkbench:workbench,api,document:doc,myView:view});
  await tick();await tick();
  const dispatch=async(id,event='click')=>{await React.act(async()=>{await view.actions[id.replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase())+event[0].toUpperCase()+event.slice(1)]?.(native());await tick();});};
  const input=async(id,value,event='input')=>{await React.act(async()=>{view.field(id).value=value;await view.actions[id.replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase())+event[0].toUpperCase()+event.slice(1)]?.(native());await tick();});};
  const mount=async()=>{
    ({createRoot}=await import('react-dom/client'));const root=createRoot(doc.getElementById('mount'));
    await React.act(async()=>root.render(React.createElement(React.Fragment,null,
      React.createElement(MyTasksPage,{view}),React.createElement(TaskRunSheet,{view}))));
    return root;
  };
  const fire=async(node,type,properties={})=>{
    const event=new window.Event(type,{bubbles:true,cancelable:true});
    const taskOpen=type==='click'&&(node?.classList?.contains('task-card-run')||node?.id==='task-parameters-open');
    Object.defineProperties(event,Object.fromEntries(Object.entries({isTrusted:Boolean(taskOpen),...properties}).map(([key,value])=>[key,{value}])));
    await React.act(async()=>{node.dispatchEvent(event);await tick();});
    return event;
  };
  return {state,host,view,workbench,scheduler,doc,dispatch,input,mount,fire,
    counts:()=>[runSubscribers.size,pageSubscribers.size,installedSubscribers.size,connectionSubscribers.size,permissionAdded.size,permissionRemoved.size],
    dispose(){scheduler.dispose();workbench.dispose();}};
}

async function fillPlan(f,title='每天任务'){
  await React.act(async()=>f.scheduler.open());await f.dispatch('schedule-create');
  await f.input('schedule-title',title);await f.input('schedule-task-select','test.task','change');
  await f.input('schedule-target','https://example.com/form');await f.input('schedule-kind','daily','change');
  await f.input('schedule-clock','09:00','change');
}

test('row parameter action selects its own task, opens the one Sheet and retains other drafts without running',async()=>{
  const f=await fixture({twoTasks:true});let root;
  try{
    root=await f.mount();
    const rows=[...f.doc.querySelectorAll('.task-card-group')];
    assert.equal(rows.filter(row=>row.classList.contains('task-card-group--action-visible')).length,1);
    assert.equal(rows[0].querySelector('.task-card-manage').getAttribute('aria-haspopup'),'menu');
    await f.fire(rows[0].querySelector('.task-card-run'),'click');
    assert.equal(f.doc.getElementById('task-param-name').getAttribute('data-slot'),'input');
    assert.equal(f.doc.getElementById('task-params-json').getAttribute('data-slot'),'textarea');
    await f.input('task-param-name','任务一草稿');
    await f.fire(f.doc.getElementById('task-parameters-sheet'),'cancel');
    await f.fire(rows[1].querySelector('.task-card-run'),'click');
    assert.equal(f.view.data.taskRows.selectedId,'other.task');
    assert.equal(f.doc.getElementById('task-parameters-sheet').open,true);
    assert.equal(f.doc.getElementById('task-param-name').value,'Alice');
    await f.fire(f.doc.getElementById('task-parameters-sheet'),'cancel');
    await f.fire(rows[0].querySelector('.task-card-run'),'click');
    assert.equal(f.doc.getElementById('task-param-name').value,'任务一草稿');
    assert.equal(f.doc.querySelectorAll('#task-parameters-sheet').length,1);
    assert.equal(f.state.starts.length,0);assert.equal(f.state.permissionCalls.length,0);
  }finally{if(root)await React.act(async()=>root.unmount());f.dispose();}
});


test('Web Flow opens the exact same trusted React Sheet, prepares without running, and confirms once',async()=>{
  const f=await fixture();let root;
  try{
    root=await f.mount();
    const pin={taskId:'test.task',version:'1.0.0',manifestHash:'a'.repeat(64),contentHash:'b'.repeat(64)};
    await assert.rejects(f.workbench.openTaskRunSheet('test.task',{expectedPin:{...pin,contentHash:'c'.repeat(64)}}),
      error=>error?.code==='E_REVISION','a different installed script hash must not open the trusted Sheet');
    assert.equal(f.state.starts.length,0);
    let opened;
    await React.act(async()=>{opened=await f.workbench.openTaskRunSheet('test.task',{expectedPin:pin});await tick();});
    assert.equal(opened,true);
    const sheet=f.doc.getElementById('task-parameters-sheet'),identity={...f.view.data.taskRows.identity};
    assert.equal(sheet.open,true);
    assert.equal(f.view.data.taskSheetRequest.source,'webflow');
    assert.equal(f.doc.querySelectorAll('#task-parameters-sheet').length,1);
    assert.equal(f.state.starts.length,0,'opening is UI only');
    await React.act(async()=>{
      assert.equal(await f.view.actions.taskRunSheetPrepare(native(),identity),true);await tick();
    });
    assert.equal(f.view.data.taskSheetStage,'ready');
    const saved=f.state.localStore.get('opendesk.shared-task-run-sheet.webflow.v1');
    assert.equal(saved?.state,'ready');
    assert.equal(f.state.starts.length,0,'save/readback must never invoke RunHost');
    await React.act(async()=>{
      assert.equal(f.view.actions.taskRunSheetConfirm(native(),identity),true);
      assert.equal(f.view.actions.taskRunSheetConfirm(native(),identity),false,'double click is rejected');
      await tick();await tick();
    });
    assert.equal(f.state.starts.length,1,'the original RunHost starts exactly once');
    const submitted=f.state.localStore.get('opendesk.shared-task-run-sheet.webflow.v1');
    assert.equal(submitted.state,'submitted');
    assert.equal(submitted.runId,'run-1','the real RunHost identity must persist for read-only recovery');
    await React.act(async()=>{assert.equal(await f.view.actions.taskRunSheetQuery(native(),identity),true);await tick();});
    assert.equal(f.view.data.taskSheetStage,'unknown','a pending run must never be inferred complete');
    assert.equal(f.state.starts.length,1,'read-only query cannot replay the operation');
    await React.act(async()=>{f.host.finish();await tick();});
  }finally{if(root)await React.act(async()=>root.unmount());f.dispose();}
});


test('Web Flow tool revocation blocks both saving and eventual RunHost submission',async()=>{
  const f=await fixture();let root;
  try{
    root=await f.mount();
    const pin={taskId:'test.task',version:'1.0.0',manifestHash:'a'.repeat(64),contentHash:'b'.repeat(64)};
    let authorized=true,checks=0;
    const assertAuthorized=async()=>{checks++;if(!authorized)throw Object.assign(
      new Error('tool generation changed'),{code:'E_TOOL_CHANGED'});};
    await React.act(async()=>{assert.equal(await f.workbench.openTaskRunSheet('test.task',{
      expectedPin:pin,assertAuthorized}),true);await tick();});
    const identity={...f.view.data.taskRows.identity};
    authorized=false;
    await React.act(async()=>{
      assert.equal(await f.view.actions.taskRunSheetPrepare(native(),identity),false);await tick();
    });
    assert.equal(f.state.localStore.has('opendesk.shared-task-run-sheet.webflow.v1'),false);
    assert.equal(f.state.starts.length,0,'a revoked tool cannot save a fresh executable step');
    authorized=true;
    await React.act(async()=>{
      assert.equal(await f.view.actions.taskRunSheetPrepare(native(),identity),true);await tick();
    });
    assert.equal(f.state.localStore.get('opendesk.shared-task-run-sheet.webflow.v1')?.state,'ready');
    authorized=false;
    await React.act(async()=>{
      assert.equal(f.view.actions.taskRunSheetConfirm(native(),identity),true);
      await tick();await tick();
    });
    assert.equal(f.state.starts.length,0,'revocation between save and confirmation cannot start RunHost');
    assert.equal(f.state.localStore.get('opendesk.shared-task-run-sheet.webflow.v1')?.state,'ready');
    assert.ok(checks>=4,'authority must be consulted at open, prepare and final admission');
  }finally{if(root)await React.act(async()=>root.unmount());f.dispose();}
});

test('My entry cannot bypass a Web Flow ready identity in the same TaskWorkbench',async()=>{
  const f=await fixture();let root;
  try{
    root=await f.mount();
    const pin={taskId:'test.task',version:'1.0.0',manifestHash:'a'.repeat(64),contentHash:'b'.repeat(64)};
    await React.act(async()=>{assert.equal(await f.workbench.openTaskRunSheet('test.task',{expectedPin:pin}),true);await tick();});
    const identity={...f.view.data.taskRows.identity};
    await React.act(async()=>{assert.equal(await f.view.actions.taskRunSheetPrepare(native(),identity),true);await tick();});
    await React.act(async()=>{f.view.actions.taskRunClick(native(),identity);await tick();await tick();});
    assert.equal(f.state.starts.length,0,'the shared prepared identity fences manual TaskWorkbench entry');
    assert.equal(f.state.localStore.get('opendesk.shared-task-run-sheet.webflow.v1')?.state,'ready');
  }finally{if(root)await React.act(async()=>root.unmount());f.dispose();}
});


test('unresolved pre-v1 Web Flow history without pending key fences My and shared prepare',async()=>{
  const f=await fixture();let root;
  try{
    root=await f.mount();
    const namespace='opendesk.sidebar-tools.data.v1:webflow';
    const original={clientRequestId:'webflow:legacy-unknown',
      taskId:'test.task',version:'1.0.0',state:'unknown',retirementState:'unknown',at:Date.now()};
    f.state.localStore.set(namespace,{'webflow.recent.v1':[original]});
    const identity={...f.view.data.taskRows.identity};
    await React.act(async()=>{f.view.actions.taskRunClick(native(),identity);await tick();await tick();});
    assert.equal(f.state.starts.length,0,'My cannot bypass an unreleased legacy summary');
    const pin={taskId:'test.task',version:'1.0.0',manifestHash:'a'.repeat(64),contentHash:'b'.repeat(64)};
    await React.act(async()=>{assert.equal(await f.workbench.openTaskRunSheet('test.task',{expectedPin:pin}),true);await tick();});
    await React.act(async()=>{
      assert.equal(await f.view.actions.taskRunSheetPrepare(native(),identity),false);await tick();
    });
    assert.equal(f.state.starts.length,0);
    assert.equal(f.state.localStore.has('opendesk.shared-task-run-sheet.webflow.v1'),false,
      'legacy history needs original-request reconciliation, never a new preparation');
    assert.equal(f.state.localStore.get(namespace)['webflow.recent.v1'][0].clientRequestId,
      original.clientRequestId,'the original evidence must remain untouched');
  }finally{if(root)await React.act(async()=>root.unmount());f.dispose();}
});

test('JSON editing uses original typed validation and preserves the editor draft across task selection',async()=>{
  const f=await fixture({twoTasks:true});let root;
  try{
    root=await f.mount();
    await React.act(async()=>f.view.actions.taskParamsModeChange('json'));
    const json=f.doc.getElementById('task-params-json');
    assert.deepEqual(JSON.parse(json.value),{name:'Alice',count:2,accept:true,mode:'a'});
    await f.input('task-params-json','{"name":"JSON 草稿","count":4,"accept":false,"mode":"b"}');
    await React.act(async()=>f.view.data.taskRows.onSelect('other.task'));
    assert.equal(f.view.data.taskParamsMode,'form');
    await React.act(async()=>f.view.data.taskRows.onSelect('test.task'));
    assert.equal(f.view.data.taskParamsMode,'json');
    assert.equal(f.doc.getElementById('task-params-json'),json);
    assert.equal(JSON.parse(json.value).name,'JSON 草稿');
    await React.act(async()=>f.view.actions.taskParamsModeChange('form'));
    assert.equal(f.doc.getElementById('task-param-count').value,'4');
    assert.equal(f.view.field('task-param-accept').checked,false);
    await React.act(async()=>f.view.actions.taskParamsModeChange('json'));
    await React.act(async()=>{assert.equal(f.view.actions.taskRunClick(native(),{...f.view.data.taskRows.identity}),true);await tick();});
    assert.deepEqual(f.state.starts[0].params,{name:'JSON 草稿',count:4,accept:false,mode:'b'});
  }finally{if(root)await React.act(async()=>root.unmount());f.dispose();}
});

for(const invalid of ['{','[]','{"name":"ok","count":1.5}','{"name":"ok","unknown":true}']){
  test(`invalid JSON parameters cannot request permission or start: ${invalid}`,async()=>{
    const f=await fixture();let root;
    try{
      root=await f.mount();await f.fire(f.doc.getElementById('task-parameters-open'),'click');
      await React.act(async()=>f.view.actions.taskParamsModeChange('json'));
      await f.input('task-params-json',invalid);
      await React.act(async()=>{assert.equal(f.view.actions.taskRunClick(native(),{...f.view.data.taskRows.identity}),false);await tick();});
      assert.equal(f.doc.getElementById('task-params-json').getAttribute('aria-invalid'),'true');
      assert.ok(f.doc.getElementById('task-params-json-error').textContent.trim());
      await React.act(async()=>f.view.actions.taskParamsModeChange('form'));
      assert.equal(f.view.data.taskParamsMode,'json','invalid JSON draft is retained, never replaced by older form data');
      assert.equal(f.view.field('task-params-json').value,invalid);
      assert.equal(f.doc.getElementById('task-parameters-sheet').open,true);
      assert.equal(f.state.permissionCalls.length,0);assert.equal(f.state.starts.length,0);
    }finally{if(root)await React.act(async()=>root.unmount());f.dispose();}
  });
}

test('JSON omission remains omitted on switching to form until that field is edited',async()=>{
  const f=await fixture({paramsSchema:{type:'object',properties:{name:{type:'string',title:'名称'},accept:{type:'boolean',title:'确认'}},required:['name'],additionalProperties:false}});let root;
  try{
    root=await f.mount();await f.input('task-param-name','可运行');
    await React.act(async()=>f.view.actions.taskParamsModeChange('json'));
    await f.input('task-params-json','{"name":"只提供名称"}');
    await React.act(async()=>f.view.actions.taskParamsModeChange('form'));
    await React.act(async()=>{f.view.actions.taskRunClick(native(),{...f.view.data.taskRows.identity});await tick();});
    assert.deepEqual(f.state.starts[0].params,{name:'只提供名称'});
    await React.act(async()=>{f.host.finish();await tick();});
    const accept=f.doc.getElementById('task-param-accept');accept.checked=true;await f.fire(accept,'click');
    await React.act(async()=>{f.view.actions.taskRunClick(native(),{...f.view.data.taskRows.identity});await tick();});
    assert.deepEqual(f.state.starts[1].params,{name:'只提供名称',accept:true});
  }finally{if(root)await React.act(async()=>root.unmount());f.dispose();}
});

test('Switch preserves initial omission, explicit false, required false and clearing without changing other fields',async()=>{
  const f=await fixture({paramsSchema:{type:'object',properties:{
    optional:{type:'boolean',title:'可选开关'},required:{type:'boolean',title:'必填开关'},
    off:{type:'boolean',title:'默认关闭',default:false}},required:['required'],additionalProperties:false}});let root;
  try{
    root=await f.mount();
    const control=f.doc.getElementById('task-param-optional');
    assert.equal(control.getAttribute('role'),'switch');assert.equal(control.name,'optional');
    assert.equal(f.doc.querySelector('label[for="task-param-optional"]').textContent,'可选开关');
    assert.equal(f.view.field('task-param-optional').omitted,true);
    assert.equal(f.doc.getElementById('task-param-required').hasAttribute('required'),false,'required boolean does not require true');
    await React.act(async()=>f.view.actions.taskParamsModeChange('json'));
    assert.deepEqual(JSON.parse(f.view.field('task-params-json').value),{required:false,off:false});
    await f.input('task-params-json','{"optional":false,"required":false}');
    await React.act(async()=>f.view.actions.taskParamsModeChange('form'));
    assert.equal(f.doc.getElementById('task-param-optional-state').textContent,'否');
    await f.fire(f.doc.querySelector('button[aria-label="不填写可选开关"]'),'click');
    assert.equal(f.doc.getElementById('task-param-optional-state').textContent,'未填写');
    await React.act(async()=>f.view.actions.taskParamsModeChange('json'));
    assert.deepEqual(JSON.parse(f.view.field('task-params-json').value),{required:false,off:false});
    assert.equal(f.state.permissionCalls.length,0);assert.equal(f.state.starts.length,0);
  }finally{if(root)await React.act(async()=>root.unmount());f.dispose();}
});

test('boolean enums keep select values and typed drafts across representation and task changes',async()=>{
  const f=await fixture({twoTasks:true,paramsSchema:{type:'object',properties:{
    choice:{type:'boolean',title:'布尔枚举',enum:[false,true],default:false},
    optional:{type:'boolean',title:'可选布尔枚举',enum:[true,false]}},required:[],additionalProperties:false}});let root;
  try{
    root=await f.mount();const choice=f.doc.getElementById('task-param-choice');
    assert.equal(choice.tagName,'SELECT');assert.equal(choice.value,'false');
    await f.input('task-param-choice','true');await f.dispatch('task-params-form','change');
    await React.act(async()=>f.view.actions.taskParamsModeChange('json'));
    assert.deepEqual(JSON.parse(f.view.field('task-params-json').value),{choice:true});
    await React.act(async()=>f.view.data.taskRows.onSelect('other.task'));
    await React.act(async()=>f.view.data.taskRows.onSelect('test.task'));
    await React.act(async()=>f.view.actions.taskParamsModeChange('form'));
    assert.equal(choice.value,'true');
    const optional=f.doc.getElementById('task-param-optional');
    optional.querySelector('option[value="false"]').selected=true;await f.fire(optional,'change');
    await React.act(async()=>f.view.actions.taskParamsModeChange('json'));
    assert.deepEqual(JSON.parse(f.view.field('task-params-json').value),{choice:true,optional:false});
  }finally{if(root)await React.act(async()=>root.unmount());f.dispose();}
});

const realTaskFiles=['baidu.search.top3.v1','google.search.top3.v1','form-fill.v1','modern-search.v1','page.read.fixed.v1','visible-search-navigation'];
for(const file of realTaskFiles)test(`real task schema dynamically renders and round-trips: ${file}`,async()=>{
  const {manifest}=JSON.parse(await readFile(new URL('../../examples/tasks/'+file+'.opendesk-task.json',import.meta.url),'utf8'));
  const other=JSON.parse(await readFile(new URL('../../tests/fixtures/tasks/ui-readonly/ui-readonly.opendesk-task.json',import.meta.url),'utf8')).manifest.paramsSchema;
  const f=await fixture({twoTasks:true,paramsSchema:manifest.paramsSchema,otherParamsSchema:other});let root;
  try{
    root=await f.mount();const expected={};
    assert.equal(f.doc.querySelectorAll('[data-task-param]').length,Object.keys(manifest.paramsSchema.properties).length);
    for(const [name,rule]of Object.entries(manifest.paramsSchema.properties)){
      if(rule.enum)assert.equal(f.doc.getElementById('task-param-'+name).tagName,'SELECT');
      if(Object.hasOwn(rule,'default'))expected[name]=rule.default;
      else if(manifest.paramsSchema.required.includes(name)){
        expected[name]=rule.enum?.[0]??'用户输入';await f.input('task-param-'+name,String(expected[name]));
      }
    }
    await f.dispatch('task-params-form','input');
    await React.act(async()=>f.view.actions.taskParamsModeChange('json'));
    assert.deepEqual(JSON.parse(f.view.field('task-params-json').value),expected);
    await React.act(async()=>f.view.data.taskRows.onSelect('other.task'));
    assert.deepEqual(f.view.data.taskParams.map(x=>x.name),['query','holdMs','mode','caseSensitive']);
    assert.equal(f.doc.getElementById('task-param-holdMs').getAttribute('min'),'0');
    await React.act(async()=>f.view.data.taskRows.onSelect('test.task'));
    assert.equal(f.doc.getElementById('task-param-holdMs'),null);
    assert.deepEqual(JSON.parse(f.view.field('task-params-json').value),expected);
    await React.act(async()=>f.view.actions.taskParamsModeChange('form'));
    assert.equal(f.view.data.taskParamsMode,'form');assert.equal(f.state.starts.length,0);
  }finally{if(root)await React.act(async()=>root.unmount());f.dispose();}
});

test('numeric boundaries, unbounded long strings and invalid values retain the original schema validator',async()=>{
  const f=await fixture({paramsSchema:{type:'object',properties:{
    whole:{type:'integer',title:'整数',minimum:0,maximum:2,default:0},
    decimal:{type:'number',title:'小数',minimum:-1,maximum:1,default:0},
    notes:{type:'string',title:'长说明'}},required:['whole'],additionalProperties:false}});let root;
  try{
    root=await f.mount();assert.equal(f.doc.getElementById('task-param-notes').tagName,'TEXTAREA');
    assert.equal(f.doc.getElementById('task-param-whole').getAttribute('step'),'1');
    assert.equal(f.doc.getElementById('task-param-decimal').getAttribute('step'),'any');
    for(const [whole,decimal]of [['0','-1'],['2','1']]){
      await f.input('task-param-whole',whole);await f.input('task-param-decimal',decimal);
      await f.input('task-param-notes','第一行\n第二行');
      await React.act(async()=>f.view.actions.taskParamsModeChange('json'));
      assert.deepEqual(JSON.parse(f.view.field('task-params-json').value),{whole:Number(whole),decimal:Number(decimal),notes:'第一行\n第二行'});
      await React.act(async()=>f.view.actions.taskParamsModeChange('form'));
    }
    for(const [name,value]of [['whole','1.5'],['whole','3'],['decimal','1.1']]){
      await f.input('task-param-whole','0');await f.input('task-param-decimal','0');await f.input('task-param-'+name,value);
      await React.act(async()=>f.view.actions.taskParamsModeChange('json'));
      assert.equal(f.view.data.taskParamsMode,'form');assert.ok(f.view.field('task-param-'+name).error);
    }
    assert.equal(f.state.starts.length,0);assert.equal(f.state.permissionCalls.length,0);
  }finally{if(root)await React.act(async()=>root.unmount());f.dispose();}
});

for(const dismissal of ['cancel button','close button','native cancel','native close']){
  test(`parameter Sheet retains the same input and draft after ${dismissal} and reopening without starting`,async()=>{
    const f=await fixture();let root;
    try{
      root=await f.mount();
      const sheet=f.doc.getElementById('task-parameters-sheet'),form=f.doc.getElementById('task-params-form');
      const name=f.doc.getElementById('task-param-name');
      assert.equal(sheet.open,false);assert.ok(sheet.contains(form));
      await f.fire(f.doc.getElementById('task-parameters-open'),'click');assert.equal(sheet.open,true);
      name.value='保留草稿';await f.fire(name,'input');
      const permissions=f.state.permissionCalls.length;
      if(dismissal==='native close')await React.act(async()=>{sheet.close();await tick();});
      else if(dismissal==='native cancel')await f.fire(sheet,'cancel');
      else await f.fire(dismissal==='close button'?sheet.querySelector('[aria-label="关闭任务参数"]'):
        [...sheet.querySelectorAll('button')].find(node=>node.textContent==='取消'),'click');
      assert.equal(sheet.open,false);
      await f.fire(f.doc.getElementById('task-parameters-open'),'click');
      assert.equal(sheet.open,true);assert.equal(f.doc.getElementById('task-params-form'),form);
      assert.equal(f.doc.getElementById('task-param-name'),name);assert.equal(name.value,'保留草稿');
      assert.equal(f.view.field('task-param-name').value,'保留草稿');
      assert.equal(f.state.permissionCalls.length,permissions);assert.equal(f.state.starts.length,0);
    }finally{if(root)await React.act(async()=>root.unmount());f.dispose();}
  });
}

test('hiding the task page closes the parameter Sheet without reopening it on return',async()=>{
  const f=await fixture();let root;
  try{
    root=await f.mount();await f.fire(f.doc.getElementById('task-parameters-open'),'click');
    const sheet=f.doc.getElementById('task-parameters-sheet');assert.equal(sheet.open,true);
    await React.act(async()=>root.render(React.createElement(MyTasksPage,{view:f.view,hidden:true})));
    assert.equal(sheet.open,false);
    await React.act(async()=>root.render(React.createElement(MyTasksPage,{view:f.view,hidden:false})));
    assert.equal(sheet.open,false);assert.equal(f.state.starts.length,0);
  }finally{if(root)await React.act(async()=>root.unmount());f.dispose();}
});

for(const key of ['Enter','Escape']){
  test(`composing ${key} is prevented and cannot run or close the parameter Sheet`,async()=>{
    const f=await fixture();let root;
    try{
      root=await f.mount();await f.fire(f.doc.getElementById('task-parameters-open'),'click');
      const sheet=f.doc.getElementById('task-parameters-sheet'),name=f.doc.getElementById('task-param-name');
      const permissions=f.state.permissionCalls.length;
      const event=await f.fire(name,'keydown',{key,isComposing:true});
      assert.equal(event.defaultPrevented,true);assert.equal(sheet.open,true);
      assert.equal(f.state.permissionCalls.length,permissions);assert.equal(f.state.starts.length,0);
    }finally{if(root)await React.act(async()=>root.unmount());f.dispose();}
  });
}

test('an untrusted React Run click leaves the parameter Sheet open without starting',async()=>{
  const f=await fixture();let root;
  try{
    root=await f.mount();await f.fire(f.doc.getElementById('task-parameters-open'),'click');
    const permissions=f.state.permissionCalls.length;
    await f.fire(f.doc.getElementById('task-run'),'click');
    assert.equal(f.doc.getElementById('task-parameters-sheet').open,true);
    assert.equal(f.state.permissionCalls.length,permissions);assert.equal(f.state.starts.length,0);
  }finally{if(root)await React.act(async()=>root.unmount());f.dispose();}
});

test('schema-invalid parameters reject trusted Run before permission and leave the Sheet open',async()=>{
  const f=await fixture();let root;
  try{
    root=await f.mount();await f.fire(f.doc.getElementById('task-parameters-open'),'click');
    const name=f.doc.getElementById('task-param-name');name.value='';await f.fire(name,'input');
    const permissions=f.state.permissionCalls.length;let accepted;
    await React.act(async()=>{accepted=f.view.actions.taskRunClick(native(),{...f.view.data.taskRows.identity});await tick();});
    assert.equal(accepted,false);assert.equal(f.doc.getElementById('task-parameters-sheet').open,true);
    assert.match(f.doc.getElementById('task-status').textContent,/name|名称|参数/);
    assert.equal(f.state.permissionCalls.length,permissions);assert.equal(f.state.starts.length,0);
  }finally{if(root)await React.act(async()=>root.unmount());f.dispose();}
});

test('field validation errors are associated with their inputs and editing clears only that field error',async()=>{
  const f=await fixture();let root;
  try{
    root=await f.mount();await f.fire(f.doc.getElementById('task-parameters-open'),'click');
    const name=f.doc.getElementById('task-param-name'),count=f.doc.getElementById('task-param-count');
    name.value='';await f.fire(name,'input');count.value='1.5';await f.fire(count,'input');
    await React.act(async()=>{assert.equal(f.view.actions.taskRunClick(native(),{...f.view.data.taskRows.identity}),false);await tick();});
    for(const node of [name,count]){
      assert.equal(node.getAttribute('aria-invalid'),'true');
      const errorId=node.id+'-error',error=f.doc.getElementById(errorId);
      assert.ok(node.getAttribute('aria-describedby').split(/\s+/).includes(errorId));
      assert.ok(error.textContent.trim());assert.equal(error.getAttribute('role'),'alert');
    }
    const sheetStatus=f.doc.querySelector('#task-parameters-sheet .task-params-sheet-status');
    assert.match(f.doc.getElementById('task-status').textContent,/E_PARAMS/);
    assert.doesNotMatch(sheetStatus.textContent,/E_PARAMS/);
    await React.act(async()=>{f.view.setText('task-status','权限失效');});
    assert.match(sheetStatus.textContent,/权限失效/);
    assert.equal(name.getAttribute('aria-invalid'),'true');
    const countError=f.doc.getElementById(count.id+'-error').textContent;
    name.value='修正名称';await f.fire(name,'input');
    assert.equal(name.getAttribute('aria-invalid'),null);
    assert.equal(f.doc.getElementById(name.id+'-error'),null);
    assert.ok(!(name.getAttribute('aria-describedby')||'').split(/\s+/).includes(name.id+'-error'));
    assert.equal(count.getAttribute('aria-invalid'),'true');
    assert.equal(f.doc.getElementById(count.id+'-error').textContent,countError);
    assert.equal(f.state.starts.length,0);
  }finally{if(root)await React.act(async()=>root.unmount());f.dispose();}
});

test('correcting a parameter clears its obsolete summary without clearing other field or runtime errors',async()=>{
  const f=await fixture();let root;
  try{
    root=await f.mount();await f.fire(f.doc.getElementById('task-parameters-open'),'click');
    const name=f.doc.getElementById('task-param-name'),count=f.doc.getElementById('task-param-count');
    name.value='';await f.fire(name,'input');count.value='1.5';await f.fire(count,'input');
    await React.act(async()=>{f.view.actions.taskRunClick(native(),{...f.view.data.taskRows.identity});await tick();});
    assert.match(f.view.field('task-status').text,/Invalid string/);
    name.value='修正名称';await f.fire(name,'input');
    assert.equal(f.view.field('task-status').text,'');
    assert.equal(f.doc.getElementById('task-param-name-error'),null);
    assert.equal(count.getAttribute('aria-invalid'),'true');
    await React.act(async()=>{f.view.setText('task-status','权限失效');});
    count.value='2';await f.fire(count,'input');
    assert.equal(f.view.field('task-status').text,'权限失效');
    assert.equal(f.state.starts.length,0);
  }finally{if(root)await React.act(async()=>root.unmount());f.dispose();}
});

test('disabled task shows its disabled reason despite matching the current site',async()=>{
  const f=await fixture();let root;
  try{
    root=await f.mount();assert.equal(f.view.data.taskRunBlockedReason,'');
    await f.dispatch('task-toggle');
    await f.fire(f.doc.getElementById('task-parameters-open'),'click');
    assert.equal(f.state.installed[0].enabled,false);
    assert.equal(f.view.field('task-current-site').dataset.state,'matched');
    assert.equal(f.doc.getElementById('task-run').disabled,true);
    assert.match(f.view.data.taskRunBlockedReason,/已停用/);
    assert.ok(f.doc.querySelector('#task-parameters-sheet [role="status"]').textContent.includes(f.view.data.taskRunBlockedReason));
    await f.dispatch('task-toggle');
    assert.equal(f.doc.getElementById('task-run').disabled,false);
    assert.equal(f.view.data.taskRunBlockedReason,'');
  }finally{if(root)await React.act(async()=>root.unmount());f.dispose();}
});

test('a busy host shows the running reason and clears it when the host finishes',async()=>{
  const f=await fixture();let root;
  try{
    root=await f.mount();await f.fire(f.doc.getElementById('task-parameters-open'),'click');
    assert.equal(f.view.data.taskRunBlockedReason,'');
    await React.act(async()=>{f.host.forceRun('other-owner-run');await tick();});
    assert.equal(f.view.field('task-current-site').dataset.state,'matched');
    assert.equal(f.doc.getElementById('task-run').disabled,true);
    assert.match(f.view.data.taskRunBlockedReason,/已有任务正在运行/);
    assert.ok(f.doc.querySelector('#task-parameters-sheet [role="status"]').textContent.includes(f.view.data.taskRunBlockedReason));
    const permissions=f.state.permissionCalls.length;
    await React.act(async()=>{assert.equal(f.view.actions.taskRunClick(native(),{...f.view.data.taskRows.identity}),false);await tick();});
    assert.equal(f.state.permissionCalls.length,permissions);assert.equal(f.state.starts.length,0);
    await React.act(async()=>{f.host.finish();await tick();});
    assert.equal(f.doc.getElementById('task-run').disabled,false);
    assert.equal(f.view.data.taskRunBlockedReason,'');
  }finally{if(root)await React.act(async()=>root.unmount());f.dispose();}
});

for(const [key,value]of Object.entries({taskId:'other.task',version:'2.0.0',manifestHash:'c'.repeat(64),generation:2,
  installationId:'22222222-2222-4222-8222-222222222222'})){
  test(`trusted Run rejects stale captured ${key} before permission or host start`,async()=>{
    const f=await fixture();try{
      const captured={...f.view.data.taskRows.identity,[key]:value};
      const permissions=f.state.permissionCalls.length;let accepted;
      await React.act(async()=>{accepted=f.view.actions.taskRunClick(native(),captured);await tick();});
      assert.equal(accepted,false);assert.match(f.view.field('task-status').text,/固定版本或安装授权已变化/);
      assert.equal(f.state.permissionCalls.length,permissions);assert.equal(f.state.starts.length,0);
    }finally{f.dispose();}
  });
}

test('trusted explicit Run accepts the current captured identity and starts with its draft',async()=>{
  const f=await fixture();try{
    await f.input('task-param-name','明确运行');
    const captured={...f.view.data.taskRows.identity};let accepted;
    assert.deepEqual(Object.keys(captured).sort(),['generation','installationId','manifestHash','taskId','version']);
    await React.act(async()=>{accepted=f.view.actions.taskRunClick(native(),captured);await tick();});
    assert.equal(accepted,true);assert.equal(f.state.starts.length,1);
    assert.equal(f.state.starts[0].params.name,'明确运行');
    assert.equal(f.state.starts[0].expectedTaskGeneration,captured.generation);
    assert.equal(f.state.starts[0].expectedTaskInstallationId,captured.installationId);
  }finally{f.dispose();}
});

test('trusted snapshot Run accepts required empty string and empty enum values allowed by the schema',async()=>{
  const f=await fixture({paramsSchema:{type:'object',properties:{
    name:{type:'string',title:'名称',default:'',minLength:0},
    mode:{type:'string',title:'模式',default:'',enum:['','other']}
  },required:['name','mode'],additionalProperties:false}});let root;
  try{
    root=await f.mount();await f.fire(f.doc.getElementById('task-parameters-open'),'click');
    assert.equal(f.doc.getElementById('task-param-name').value,'');
    assert.equal(f.doc.getElementById('task-param-mode').value,'');
    let accepted;
    await React.act(async()=>{accepted=f.view.actions.taskRunClick(native(),{...f.view.data.taskRows.identity});await tick();});
    assert.equal(accepted,true);assert.equal(f.state.starts.length,1);
    assert.deepEqual(f.state.starts[0].params,{name:'',mode:''});
    assert.equal(f.doc.querySelector('#task-params-form [aria-invalid="true"]'),null);
  }finally{if(root)await React.act(async()=>root.unmount());f.dispose();}
});

test('React owns the full page, reflects errors, keeps edits across tab hiding and cleans its subscription',async()=>{
  const f=await fixture();let root;
  try{
    root=await f.mount();assert.equal(f.view.subscriberCount,1);
    assert.ok(f.doc.querySelector('#workbench-tasks #task-params-form input[data-task-param="name"]'));
    assert.equal(f.doc.getElementById('task-param-name').value,'Alice');
    await React.act(async()=>{
      const node=f.doc.getElementById('task-param-name');node.value='新草稿';node.dispatchEvent(new window.Event('input',{bubbles:true}));
    });
    assert.equal(f.view.field('task-param-name').value,'新草稿');
    await React.act(async()=>root.render(React.createElement(MyTasksPage,{view:f.view,hidden:true})));
    await React.act(async()=>root.render(React.createElement(MyTasksPage,{view:f.view,hidden:false})));
    assert.equal(f.doc.getElementById('task-param-name').value,'新草稿');
    await React.act(async()=>{f.view.setText('task-status','可控运行错误');});
    assert.match(f.doc.getElementById('task-status').textContent,/可控运行错误/);
    await fillPlan(f);await f.input('schedule-params','{');await f.dispatch('schedule-form','submit');
    assert.match(f.doc.getElementById('schedule-params-error').textContent,/JSON/);
    assert.equal(f.doc.getElementById('schedule-params').getAttribute('aria-invalid'),'true');
    assert.ok(f.doc.getElementById('schedule-task-manager'));
    await React.act(async()=>root.unmount());root=null;assert.equal(f.view.subscriberCount,0);
  }finally{if(root)await React.act(async()=>root.unmount());f.dispose();}
  assert.deepEqual(f.counts(),[0,0,0,0,0,0]);assert.deepEqual(Object.keys(f.view.actions),[]);
});

test('manual task passes typed params and fixed identity, stops the owning run, then runs again and reports errors',async()=>{
  const f=await fixture();try{
    await f.input('task-param-name','张三');await f.input('task-param-count','3');await f.dispatch('task-params-form','input');
    await f.dispatch('task-run');await tick();assert.equal(f.state.starts.length,1);
    assert.deepEqual(f.state.starts[0].params,{name:'张三',count:3,accept:true,mode:'a'});
    assert.equal(f.state.starts[0].expectedTaskInstallationId,'11111111-1111-4111-8111-111111111111');
    assert.equal(f.state.starts[0].expectedTaskGeneration,1);
    f.workbench.navigate('cloud');assert.equal(f.view.field('task-stop').disabled,false);
    await f.dispatch('task-stop');await tick();assert.deepEqual(f.state.stops,[{runId:'run-1',controller:true}]);
    f.workbench.navigate('tasks');await f.input('task-param-name','再次运行');await f.dispatch('task-run');await tick();
    assert.equal(f.state.starts.length,2);f.host.finish({failed:true});await tick();await tick();
    assert.match(f.view.data.taskHistory[0].text,/可控运行错误/);
    await f.dispatch('task-run');await tick();f.host.finish({value:'完成'});await tick();await tick();
    assert.match(f.view.data.taskHistory[0].text,/完成/);
  }finally{f.dispose();}
});

test('plan create, edit, explicit save, reopen, manager detour, dirty cancel and delete preserve exact identities',async()=>{
  const f=await fixture();try{
    await fillPlan(f);await f.dispatch('schedule-form','submit');
    assert.equal(f.state.calls.filter(row=>row.action==='saveSchedule').length,0,'review alone cannot commit');
    assert.equal(f.view.field('schedule-save-confirm').hidden,false);
    await f.dispatch('schedule-confirm-yes');assert.equal(f.state.plans.length,1);
    const plan=f.state.plans[0];assert.equal(plan.taskGeneration,1);assert.equal(plan.version,'1.0.0');
    assert.equal(plan.installationId,'11111111-1111-4111-8111-111111111111');
    f.view.data.planRows.onEdit(plan);assert.equal(f.view.field('schedule-title').value,'每天任务');
    await f.input('schedule-title','修改后的计划');await f.dispatch('schedule-manage-tasks');
    assert.equal(f.view.data.managerRows.canCreatePlan,false,'manager detour cannot silently create over the form');
    await f.dispatch('schedule-manager-back');assert.equal(f.view.field('schedule-title').value,'修改后的计划');
    f.workbench.navigate('cloud');f.workbench.navigate('tasks');assert.equal(f.view.field('schedule-title').value,'修改后的计划');
    await f.dispatch('schedule-cancel');assert.equal(f.view.field('schedule-discard-confirm').hidden,false);
    await f.dispatch('schedule-discard-no');assert.equal(f.view.field('schedule-title').value,'修改后的计划');
    await f.dispatch('schedule-form','submit');await f.dispatch('schedule-confirm-yes');
    assert.equal(f.state.plans[0].title,'修改后的计划');
    f.view.data.planRows.onOpen(plan.scheduleId);assert.equal(f.view.data.scheduleDetail.plan.title,'修改后的计划');
    await f.dispatch('schedule-detail-delete');assert.equal(f.state.plans.length,1);assert.equal(f.view.data.scheduleDetail.deleteReview,true);
    f.view.data.scheduleDetail.onCancelDelete();assert.equal(f.state.plans.length,1);
    await f.dispatch('schedule-detail-delete');await f.view.data.scheduleDetail.onDelete();await tick();
    assert.equal(f.state.plans.length,0);
  }finally{f.dispose();}
});

test('identity drift and unknown save never authorize replacement or automatic replay',async()=>{
  const f=await fixture();try{
    await fillPlan(f);f.state.changeResolved=true;await f.dispatch('schedule-form','submit');
    assert.equal(f.view.field('schedule-save-confirm').hidden,true);assert.match(f.view.field('schedule-message').text,/安装身份已变更/);
    assert.equal(f.state.calls.filter(row=>row.action==='saveSchedule').length,0);
    f.state.changeResolved=false;await f.dispatch('schedule-form','submit');f.state.unknownSave=true;await f.dispatch('schedule-confirm-yes');
    assert.match(f.view.field('schedule-message').text,/结果未知/);assert.equal(f.view.field('schedule-save-confirm').hidden,true);
    await f.dispatch('schedule-confirm-yes');assert.equal(f.state.calls.filter(row=>row.action==='saveSchedule').length,1);
  }finally{f.dispose();}
});

test('history paging deduplicates Fire identities, shows failures, and stop checks the exact current scheduled run',async()=>{
  const f=await fixture();try{
    await fillPlan(f);await f.dispatch('schedule-form','submit');await f.dispatch('schedule-confirm-yes');
    const plan=f.state.plans[0];plan.history=Array.from({length:20},(_,i)=>({fireId:'fire-'+i,scheduledAt:100-i,status:i===0?'RUNNING':'SUCCESS',runId:'schedule-run-'+i}));
    f.host.forceRun('schedule-run-0');await f.scheduler.refresh();
    f.view.data.planRows.onOpen(plan.scheduleId);
    f.state.failHistory=true;await f.view.data.scheduleDetail.onLoadMore();
    assert.match(f.view.data.scheduleDetail.historyError,/可控历史加载失败/);
    f.state.failHistory=false;await f.view.data.scheduleDetail.onLoadMore();
    assert.equal(f.view.data.scheduleDetail.records.length,21);
    await f.scheduler.refresh();assert.equal(f.view.data.scheduleDetail.records.length,21,'poll keeps already loaded pages');
    const fire=plan.history[0];f.host.forceRun('different-run');f.view.data.planRows.onStop(plan,fire);await tick();assert.equal(f.state.stops.length,0);
    f.host.forceRun(fire.runId);f.view.data.planRows.onStop(plan,fire);await tick();assert.equal(f.state.stops[0].runId,fire.runId);
  }finally{f.dispose();}
});
