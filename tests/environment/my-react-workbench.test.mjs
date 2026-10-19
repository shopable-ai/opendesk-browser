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
let MyTasksPage,createRoot;
test.before(async()=>{
  await mkdir(artifacts,{recursive:true});
  await build({stdin:{contents:'export {MyTasksPage} from "./src/ui/react/tabs/tasks.tsx";',resolveDir:process.cwd()},
    bundle:true,packages:'external',platform:'node',format:'esm',outfile:new URL('page.mjs',artifacts).pathname,logLevel:'silent'});
  ({MyTasksPage}=await import(new URL('page.mjs',artifacts)));
});
test.after(()=>rm(artifacts,{recursive:true,force:true}));

async function fixture({twoTasks=false}={}){
  const {document:doc,window}=parseHTML('<html><body><nav class="workbench-nav"></nav><div id="outside"></div><div id="mount"></div></body></html>');
  globalThis.window=window;globalThis.document=doc;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
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
    paramsSchema:{type:'object',properties:{name:{type:'string',title:'名称',default:'Alice',minLength:1,maxLength:40},
      count:{type:'integer',title:'次数',default:2},accept:{type:'boolean',title:'确认',default:true},
      mode:{type:'string',title:'模式',enum:['a','b'],default:'a'}},required:['name'],additionalProperties:false}};
  const installed={taskId:manifest.taskId,version:manifest.version,scriptId:'task:test.task:1.0.0',enabled:true,manifestHash,
    installationId:'11111111-1111-4111-8111-111111111111',generation:1};
  const candidate={...installed,manifest,stage:'available',installed:true};
  const state={catalog:[candidate],installed:[installed],plans:[],runs:[],results:[],calls:[],starts:[],stops:[],
    changeResolved:false,failHistory:false,unknownSave:false,pendingPermission:null};
  if(twoTasks){state.catalog.push({...candidate,taskId:'other.task',manifest:{...manifest,taskId:'other.task',title:'第二任务'}});
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
  const api={permissions:{contains:async()=>state.pendingPermission?await state.pendingPermission:true,request:async()=>true,
    onAdded:{addListener:fn=>permissionAdded.add(fn),removeListener:fn=>permissionAdded.delete(fn)},
    onRemoved:{addListener:fn=>permissionRemoved.add(fn),removeListener:fn=>permissionRemoved.delete(fn)}},
    runtime:{getURL:path=>'chrome-extension://test/'+path},tabs:{create:async()=>({id:4})}};
  const view=createMyWorkbenchView({document:doc});
  const workbench=createTaskWorkbench({client,host,currentPageTarget,api,document:doc,myView:view,
    reactNavigation:{ownsPages:true,select:()=>{}},importDraft:()=>{}});
  const scheduler=createScheduledTaskWorkbench({client,host,taskWorkbench:workbench,api,document:doc,myView:view});
  await tick();await tick();
  const dispatch=async(id,event='click')=>{await React.act(async()=>{await view.actions[id.replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase())+event[0].toUpperCase()+event.slice(1)]?.(native());await tick();});};
  const input=async(id,value,event='input')=>{await React.act(async()=>{view.field(id).value=value;await view.actions[id.replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase())+event[0].toUpperCase()+event.slice(1)]?.(native());await tick();});};
  const mount=async()=>{
    ({createRoot}=await import('react-dom/client'));const root=createRoot(doc.getElementById('mount'));
    await React.act(async()=>root.render(React.createElement(MyTasksPage,{view})));
    return root;
  };
  return {state,host,view,workbench,scheduler,doc,dispatch,input,mount,
    counts:()=>[runSubscribers.size,pageSubscribers.size,installedSubscribers.size,connectionSubscribers.size,permissionAdded.size,permissionRemoved.size],
    dispose(){scheduler.dispose();workbench.dispose();}};
}

async function fillPlan(f,title='每天任务'){
  await f.scheduler.open();await f.dispatch('schedule-create');
  await f.input('schedule-title',title);await f.input('schedule-task-select','test.task','change');
  await f.input('schedule-target','https://example.com/form');await f.input('schedule-kind','daily','change');
  await f.input('schedule-clock','09:00','change');
}

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
    f.workbench.navigate('cloud');assert.equal(f.doc.getElementById('task-stop').disabled,false);
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
