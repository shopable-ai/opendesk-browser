import {createDeveloperView} from '../../src/ui/develop-view.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
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
let MyTasksPage,TaskRunSheet,MyControl,createRoot;
function MyWorkbench({view,hidden=false}){
  return React.createElement(React.Fragment,null,
    React.createElement(MyTasksPage,{view,hidden}),React.createElement(TaskRunSheet,{view}));
}
test.before(async()=>{
  await mkdir(artifacts,{recursive:true});
  await build({stdin:{contents:'export {MyTasksPage} from "./src/ui/react/tabs/my-page.tsx"; export {TaskRunSheet} from "./src/ui/react/tabs/task-run-sheet.tsx"; export {MyControl} from "./src/ui/react/tabs/my-controls.tsx";',resolveDir:process.cwd()},
    bundle:true,packages:'external',platform:'node',format:'esm',outfile:new URL('page.mjs',artifacts).pathname,logLevel:'silent'});
  ({MyTasksPage,TaskRunSheet,MyControl}=await import(new URL('page.mjs',artifacts)));
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
  for(const name of ['workflow','develop','tools','cloud','catalog','debug']){
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
      if(['inspectTaskRun','cancelTaskRun','prepareTaskRun'].includes(action)&&state.taskRunRequest)return state.taskRunRequest(action,input);
      if(['readPageTaskRequest','listPageTaskRequests'].includes(action)&&state.pageTaskRequest)return state.pageTaskRequest(action,input);
      if(action==='inspectTaskRun')return null;
      if(action==='listTaskCatalog')return structuredClone({catalog:state.catalog,installed:state.installed});
      if(action==='importTaskPackage'){
        if(state.importConflict)throw Object.assign(Error('immutable version conflict'),{code:'E_REQUEST_CONFLICT'});
        return {taskId:input.package?.manifest?.taskId||'imported.task',
          version:input.package?.manifest?.version||'1.0.0',stage:state.importDuplicate?'available':'candidate',
          manifestHash:state.importDuplicate?'a'.repeat(64):'c'.repeat(64)};
      }
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
  const api={permissions:{contains:async input=>{state.permissionCalls.push({action:'contains',input});return state.pendingPermission?await state.pendingPermission:true;},
    request:async input=>{state.permissionCalls.push({action:'request',input});return true;},
    onAdded:{addListener:fn=>permissionAdded.add(fn),removeListener:fn=>permissionAdded.delete(fn)},
    onRemoved:{addListener:fn=>permissionRemoved.add(fn),removeListener:fn=>permissionRemoved.delete(fn)}},
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
    await React.act(async()=>root.render(React.createElement(MyWorkbench,{view})));
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
    assert.equal(rows.filter(row=>row.classList.contains('selected')).length,1);
    assert.equal(rows[0].classList.contains('selected'),true);
    assert.equal(rows[0].querySelector('.task-card-manage').getAttribute('aria-haspopup'),'menu');
    await f.fire(rows[0].querySelector('.task-card-run'),'click',{isTrusted:true});
    assert.equal(f.doc.getElementById('task-param-name').getAttribute('data-slot'),'input');
    assert.equal(f.doc.getElementById('task-params-json').getAttribute('data-slot'),'textarea');
    await f.input('task-param-name','任务一草稿');
    await f.fire(f.doc.getElementById('task-parameters-sheet'),'cancel');
    await f.fire(rows[1].querySelector('.task-card-run'),'click',{isTrusted:true});
    assert.equal(f.view.data.taskRows.selectedId,'other.task');
    assert.equal(f.doc.getElementById('task-parameters-sheet').open,true);
    assert.equal(f.doc.getElementById('task-param-name').value,'Alice');
    await f.fire(f.doc.getElementById('task-parameters-sheet'),'cancel');
    await f.fire(rows[0].querySelector('.task-card-run'),'click',{isTrusted:true});
    assert.equal(f.doc.getElementById('task-param-name').value,'任务一草稿');
    assert.equal(f.doc.querySelectorAll('#task-parameters-sheet').length,1);
    assert.equal(f.state.starts.length,0);assert.equal(f.state.permissionCalls.length,0);
  }finally{if(root)await React.act(async()=>root.unmount());f.dispose();}
});


test('shared TaskRunSheet restores the My bottom drawer and distinct cancel/prepare actions',async()=>{
  // Layout contract only; linkedom cannot verify Chromium dialog geometry or focus.
  const css=await readFile('src/ui/tool-shell.css','utf8');
  const sheetRule=css.match(/\.task-params-sheet\{([^}]*)\}/)?.[1]||'';
  assert.match(sheetRule,/inset:auto 0 0/,'the original My drawer must anchor to the bottom');
  assert.match(sheetRule,/width:100%/,'the shared drawer uses the host width');
  assert.match(sheetRule,/max-height:calc\(100dvh - var\(--space-4\)\)/);
  assert.doesNotMatch(sheetRule,/height:100dvh/,'the right-side full-height regression must not recur');
  const f=await fixture();let root;
  try{
    root=await f.mount();
    await f.fire(f.doc.getElementById('task-parameters-open'),'click');
    const sheet=f.doc.getElementById('task-parameters-sheet');
    const footer=sheet.querySelector('.task-params-sheet-actions');
    assert.equal(sheet.open,true);
    assert.equal(footer.firstElementChild.textContent.trim(),'取消','My retains the original cancel action');
    await f.input('task-param-name','我的草稿');
    await f.fire(footer.firstElementChild,'click');
    assert.equal(sheet.open,false);
    assert.equal(f.state.starts.length,0,'cancel does not execute');
    const task={...f.view.data.taskRows.identity,contentHash:f.state.catalog[0].manifest.program.sourceHash};
    await React.act(async()=>{assert.equal(await f.workbench.openTaskRunSheet({task,binding:{delegationId:'fixture-tool'}}),true);await tick();});
    assert.equal(sheet.open,true);
    assert.equal(f.doc.querySelectorAll('#task-parameters-sheet').length,1,'both entries reuse one dialog');
    assert.equal(f.doc.getElementById('task-param-name').value,'我的草稿','shared form keeps the draft');
    assert.deepEqual([...footer.querySelectorAll('button')].map(button=>button.textContent.trim()),
      ['关闭','保存并核对'],'Web Flow preserves its explicit prepare stage');
    assert.equal(f.state.starts.length,0,'Web Flow opening does not start RunHost');
  }finally{if(root)await React.act(async()=>root.unmount());f.dispose();}
});

test('tool request uses the same hoisted Sheet and separate parent prepare, confirm and unknown-cancel callbacks',async()=>{
  const f=await fixture();let root;
  try{
    root=await f.mount();
    await React.act(async()=>{
      const task={...f.view.data.taskRows.identity,contentHash:f.state.catalog[0].manifest.program.sourceHash};
      await assert.rejects(f.workbench.openTaskRunSheet({task:{...task,contentHash:'c'.repeat(64)},
        binding:{delegationId:'fixture-tool'}}),error=>error?.code==='E_REVISION',
        'a different installed script hash must not open the trusted Sheet');
      assert.equal(f.view.data.taskRunSheet??null,null);
      await f.workbench.openTaskRunSheet({task,binding:{delegationId:'fixture-tool'}});
      assert.ok(f.state.calls.some(({action,input})=>action==='resolveInstalledTask'&&input.purpose==='configure'));
      await tick();
      root.render(React.createElement(MyWorkbench,{view:f.view,hidden:true}));
    });
    const sheet=f.doc.getElementById('task-parameters-sheet'),form=f.doc.getElementById('task-params-form');
    const name=f.doc.getElementById('task-param-name'),run=f.doc.getElementById('task-run');
    const identity=f.view.data.taskRunSheet.identity,calls=[];
    const button=label=>[...sheet.querySelectorAll('button')].find(node=>node.textContent===label);
    assert.equal(f.view.data.taskRunSheet.source,'tool');assert.equal(f.view.data.taskRunSheet.phase,'editing');
    assert.equal(sheet.open,true);assert.equal(sheet.closest('[hidden]'),null);
    assert.equal(f.doc.querySelectorAll('#task-parameters-sheet').length,1);
    assert.equal(button('停止'),undefined);assert.equal(button('取消准备'),undefined);
    assert.equal(run.textContent,'保存并核对');assert.equal(run.disabled,false);
    assert.equal(sheet.querySelector('fieldset').hasAttribute('disabled'),false);
    // Parent callbacks are presentation spies; this test does not emulate
    // Authority or claim a persisted preparation / real execution receipt.
    f.view.actions.taskSheetPrepareClick=f.view.action((...args)=>{
      assert.equal(args.length,2);assert.equal(args[0].isTrusted,true);assert.equal(args[1],identity);
      calls.push('prepare');f.view.project('taskRunSheet',{...f.view.data.taskRunSheet,phase:'prepared',preparationId:'fixture-preparation'});
      return false;
    });
    f.view.actions.taskSheetConfirmClick=f.view.action((...args)=>{
      assert.equal(args.length,2);assert.equal(args[0].isTrusted,true);assert.equal(args[1],identity);
      calls.push('confirm');f.view.project('taskRunSheet',{...f.view.data.taskRunSheet,phase:'submitted'});
      return false;
    });
    f.view.actions.taskSheetCancelClick=f.view.action((...args)=>{
      assert.equal(args.length,1);assert.equal(args[0].isTrusted,true);calls.push('cancel');
      f.view.project('taskRunSheet',{...f.view.data.taskRunSheet,phase:'cancelled'});
    });
    await React.act(async()=>{f.view.publish();await tick();});
    await f.fire(run,'click',{isTrusted:true});
    assert.deepEqual(calls,['prepare']);assert.equal(f.view.data.taskRunSheet.phase,'prepared');
    assert.equal(run.textContent,'确认执行一次');assert.equal(run.disabled,false);
    assert.equal(sheet.querySelector('fieldset').hasAttribute('disabled'),true);
    assert.ok([...sheet.querySelectorAll('.task-params-mode button')].every(node=>node.disabled));
    assert.equal(f.doc.getElementById('task-params-form'),form);assert.equal(f.doc.getElementById('task-param-name'),name);
    assert.equal(f.state.starts.length,0);assert.equal(f.state.permissionCalls.length,0);
    await f.fire(run,'click',{isTrusted:true});
    assert.deepEqual(calls,['prepare','confirm']);assert.equal(f.view.data.taskRunSheet.phase,'submitted');
    assert.equal(f.doc.getElementById('task-run'),null);assert.deepEqual(calls,['prepare','confirm']);
    await React.act(async()=>f.view.project('taskRunSheet',{...f.view.data.taskRunSheet,phase:'unknown',status:'准备回执未知'}));
    assert.equal(f.doc.getElementById('task-run'),null);assert.equal(sheet.querySelector('fieldset').hasAttribute('disabled'),true);
    assert.match(sheet.querySelector('[role="status"]').textContent,/准备回执未知/);
    assert.ok(button('取消准备'),'lost preparation ACK retains cancellation of the original identity');
    await f.fire(button('取消准备'),'click',{isTrusted:true});assert.deepEqual(calls,['prepare','confirm','cancel']);
    assert.equal(f.view.data.taskRunSheet.phase,'cancelled');assert.equal(f.view.data.taskRunSheet.preparationId,'fixture-preparation');
    assert.equal(f.state.starts.length,0);assert.equal(f.state.permissionCalls.length,0);
  }finally{if(root)await React.act(async()=>root.unmount());f.dispose();}
});


// This is a controlled Authority RPC fixture for the real Workbench and React
// Sheet. It proves consumer behavior, not installed Page authority or native input.
function pageRequestFixture(f,{prepared=false}={}){
  const task={...f.view.data.taskRows.identity,contentHash:f.state.catalog[0].manifest.program.sourceHash};
  const request={requestId:'71811b88-050a-4e7a-9dfa-00b10b906fe8',
    preparationId:'378a9542-3ed9-4c5e-9a77-e1426c156c15',task,approvalAllowed:true,
    params:{name:'原网页请求',count:3,accept:true,mode:'b'},
    target:{mode:'owned',url:'https://example.com/independent'},
    pageBinding:{programId:'opendesk.subagent',tabId:3,frameId:0,documentId:'doc-3',url:'https://example.com/form'}};
  const preparedValue=()=>({preparationId:request.preparationId,pageRequestId:request.requestId,
    state:'prepared',task,params:structuredClone(request.params),target:structuredClone(request.target),deadlineAt:Date.now()+30000});
  let preparation=prepared?preparedValue():null;
  const read=async(action,input)=>{
    assert.equal(action,'readPageTaskRequest');assert.equal(input.requestId,request.requestId);
    return structuredClone({request,preparation});
  };
  f.state.pageTaskRequest=read;
  f.state.taskRunRequest=async(action,input)=>{
    if(action==='prepareTaskRun'){
      assert.equal(input.preparationId,request.preparationId);assert.equal(input.pageRequestId,request.requestId);
      assert.deepEqual(input.params,request.params);assert.deepEqual(input.target,request.target);
      preparation=preparedValue();
    }else assert.equal(action,'inspectTaskRun');
    return structuredClone({preparation});
  };
  return {request,read,get preparation(){return preparation;}};
}

test('page request renders one locked Sheet with source, fixed version and owned target, then uses original save and confirmation',async()=>{
  const f=await fixture();let root;
  try{
    root=await f.mount();const p=pageRequestFixture(f);
    await React.act(async()=>{assert.equal(await f.workbench.openPageTaskRequest(p.request.requestId),true);});
    const sheet=f.doc.getElementById('task-parameters-sheet');
    let run=f.doc.getElementById('task-run');
    const json=f.doc.getElementById('task-params-json');
    assert.equal(sheet.open,true);assert.equal(f.doc.querySelectorAll('#task-parameters-sheet').length,1);
    assert.equal(f.view.data.taskRunSheet.source,'page');assert.equal(f.view.data.taskRunSheet.paramsLocked,true);
    assert.match(sheet.textContent,/来源网页：https:\/\/example\.com\/form/);
    assert.match(sheet.textContent,/网页程序：opendesk\.subagent · 任务版本：1\.0\.0/);
    assert.match(sheet.textContent,/将新建独立网页：https:\/\/example\.com\/independent/);
    assert.equal(sheet.querySelector('fieldset').hasAttribute('disabled'),true);assert.equal(json.disabled,true);
    assert.ok([...sheet.querySelectorAll('.task-params-mode button')].every(node=>node.disabled));
    assert.deepEqual(JSON.parse(json.value),p.request.params);
    assert.equal(run.textContent,'保存并核对');assert.equal(f.state.starts.length,0);assert.equal(f.state.permissionCalls.length,0);
    await f.fire(run,'click',{isTrusted:false});
    assert.equal(f.state.calls.some(({action})=>action==='prepareTaskRun'),false);
    // Even a changed presentation field cannot replace the original request.
    f.view.field('task-params-json').value=JSON.stringify({...p.request.params,name:'改变的展示草稿'});
    await f.fire(run,'click',{isTrusted:true});await React.act(async()=>{await tick();await tick();});
    assert.equal(f.view.data.taskRunSheet.phase,'prepared');
    // The preparing phase hides the action; query the newly rendered button.
    run=f.doc.getElementById('task-run');assert.equal(run.textContent,'确认执行一次');
    assert.deepEqual(p.preparation.params,p.request.params);assert.equal(f.state.starts.length,0);
    await f.fire(run,'click',{isTrusted:false});assert.equal(f.state.starts.length,0);
    await f.fire(run,'click',{isTrusted:true});
    await React.act(async()=>{await tick();await tick();});
    assert.equal(f.state.starts.length,1);assert.deepEqual(f.state.starts[0].target,p.request.target);
    assert.deepEqual(f.state.starts[0].params,p.request.params);
    assert.equal(f.state.starts[0].taskPreparationId,p.request.preparationId);
    await React.act(async()=>{f.view.actions.taskSheetConfirmClick(native(),p.request.task);await tick();});
    assert.equal(f.state.starts.length,1);
    await React.act(async()=>{f.host.finish();await tick();await tick();});
  }finally{if(root)await React.act(async()=>root.unmount());f.dispose();}
});

for(const revokedAt of ['reopen','confirmation'])test(`page request source revocation at ${revokedAt} keeps the original request read-only without admission`,async()=>{
  const f=await fixture();let root;
  try{
    root=await f.mount();const p=pageRequestFixture(f,{prepared:true});
    if(revokedAt==='reopen')p.request.approvalAllowed=false;
    await React.act(async()=>{await f.workbench.openPageTaskRequest(p.request.requestId);});
    if(revokedAt==='confirmation'){
      const run=f.doc.getElementById('task-run');assert.equal(run.textContent,'确认执行一次');
      p.request.approvalAllowed=false;
      await f.fire(run,'click',{isTrusted:true});await React.act(async()=>{await tick();await tick();});
    }
    const sheet=f.doc.getElementById('task-parameters-sheet');
    assert.equal(f.view.data.taskRunSheet.recoveryOnly,true);assert.equal(f.doc.getElementById('task-run'),null);
    assert.match(sheet.textContent,/来源网页或任务授权已失效/);
    assert.deepEqual(JSON.parse(sheet.querySelector('[aria-label="原准备参数"]').textContent),p.request.params);
    await React.act(async()=>{f.view.actions.taskSheetConfirmClick(native(),p.request.task);await tick();});
    assert.equal(f.state.starts.length,0);assert.equal(f.view.data.taskRunSheet.preparationId,p.request.preparationId);
    assert.equal(f.state.calls.some(({action})=>action==='prepareTaskRun'),false);
  }finally{if(root)await React.act(async()=>root.unmount());f.dispose();}
});

test('page request late opening lookup cannot replace a newer Sheet or start a task',async()=>{
  const f=await fixture();let root,resolveRead,opening;
  try{
    root=await f.mount();const p=pageRequestFixture(f);
    f.state.pageTaskRequest=()=>new Promise(resolve=>{resolveRead=resolve;});
    await React.act(async()=>{opening=f.workbench.openPageTaskRequest(p.request.requestId);await tick();});
    await React.act(async()=>{
      f.view.actions.taskSheetClose();
      await f.workbench.openTaskRunSheet({task:p.request.task,binding:{appId:'new-sheet'}});
    });
    const current=f.view.data.taskRunSheet;
    await React.act(async()=>{resolveRead({request:p.request,preparation:null});assert.equal(await opening,false);});
    assert.equal(f.view.data.taskRunSheet,current);assert.equal(f.view.data.taskRunSheet.source,'tool');
    assert.equal(f.doc.getElementById('task-run').textContent,'保存并核对');
    assert.equal(f.state.starts.length,0);assert.equal(f.state.permissionCalls.length,0);
  }finally{resolveRead?.(null);if(root)await React.act(async()=>root.unmount());f.dispose();}
});

test('page request late approval lookup during query cannot retire or unlock a reopened Sheet',async()=>{
  const f=await fixture();let root,resolveRead;
  try{
    root=await f.mount();const p=pageRequestFixture(f,{prepared:true});
    await React.act(async()=>{await f.workbench.openPageTaskRequest(p.request.requestId);});
    f.state.pageTaskRequest=()=>new Promise(resolve=>{resolveRead=resolve;});
    const query=[...f.doc.querySelectorAll('#task-parameters-sheet button')].find(node=>node.textContent==='查询状态');
    await f.fire(query,'click',{isTrusted:true});
    assert.equal(typeof resolveRead,'function');assert.equal(f.view.data.taskRunSheet.busy,true);
    f.state.pageTaskRequest=p.read;
    await React.act(async()=>{
      f.view.actions.taskSheetClose();await f.workbench.openPageTaskRequest(p.request.requestId);
      f.view.project('taskRunSheet',{...f.view.data.taskRunSheet,busy:true,status:'新审批窗口保持原状态'});
    });
    const current=f.view.data.taskRunSheet;
    await React.act(async()=>{resolveRead({request:{...p.request,approvalAllowed:false},preparation:p.preparation});await tick();await tick();});
    assert.equal(f.view.data.taskRunSheet,current);assert.equal(f.view.data.taskRunSheet.busy,true);
    assert.equal(f.doc.getElementById('task-run').disabled,true);
    assert.match(f.doc.getElementById('task-parameters-sheet').textContent,/新审批窗口保持原状态/);
    assert.equal(f.state.starts.length,0);assert.equal(f.state.permissionCalls.length,0);
  }finally{resolveRead?.(null);if(root)await React.act(async()=>root.unmount());f.dispose();}
});

// Preparation persistence belongs to Authority, not this React fixture's local storage.
// The six incoming legacy Sheet cases are covered at their current owners:
// tests/environment/task-run-preparation.test.mjs:
// - Revocation before admission / changed package or epoch:
//   'revocation, replacement version, environment and document changes block prepared submission without releasing it'
//   'minimal original App binding remains pinned and uses its lifecycle lock; revoked App cannot submit or disclose Result'
// - My bypass / outstanding preparation:
//   'a shared preparation blocks My, drafts, legacy Task admission and other hosts until explicit cancellation'
// - Unresolved legacy history:
//   'injected business recovery fence holds through durable prepare and admission, failures block every entry'
//   'legacy AppStorage release flags require original matching delegation journal and Run/Result'
// - Durable fence / no replay / pinned identity:
//   'atomic preparation admission permits only one durable Run across retries and new request IDs'
//   'unknown durable submission is observed after a lost reply and never readmitted or replayed'
//   'atomic identity rejects changed params, source, deadline, target, installation and preparation binding'
// tests/environment/task-workbench.test.mjs:
//   'shared sheet opens without Run, freezes actual Schema params, confirms once through original Host'
//   'shared sheet lost save acknowledgement retains same identity and only queries or cancels'
// React drawer layout and prepared/unknown controls remain covered above; these
// presentation assertions do not claim Authority persistence or real execution.

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
      root=await f.mount();await f.fire(f.doc.getElementById('task-parameters-open'),'click',{isTrusted:true});
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
    root=await f.mount();await f.fire(f.doc.getElementById('task-parameters-open'),'click',{isTrusted:true});
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
    root=await f.mount();assert.equal(f.doc.getElementById('task-param-notes').tagName,'INPUT');
    assert.equal(f.doc.getElementById('task-param-notes').hasAttribute('maxlength'),false);
    // No schema maxLength; the original validator still applies its 1024-character default.
    const longNotes='长说明 "quoted" '.repeat(60);
    assert.equal(f.doc.getElementById('task-param-whole').getAttribute('step'),'1');
    assert.equal(f.doc.getElementById('task-param-decimal').getAttribute('step'),'any');
    for(const [whole,decimal]of [['0','-1'],['2','1']]){
      await f.input('task-param-whole',whole);await f.input('task-param-decimal',decimal);
      await f.input('task-param-notes',longNotes);
      await React.act(async()=>f.view.actions.taskParamsModeChange('json'));
      assert.deepEqual(JSON.parse(f.view.field('task-params-json').value),{whole:Number(whole),decimal:Number(decimal),notes:longNotes});
      await React.act(async()=>f.view.actions.taskParamsModeChange('form'));
      assert.equal(f.view.data.taskParamsMode,'form');
      assert.equal(f.doc.getElementById('task-param-notes').value,longNotes);
    }
    const pasted='\r\n第二行\n第三行 "原文"',notes=f.doc.getElementById('task-param-notes');
    const paste=await f.fire(notes,'paste',{clipboardData:{getData:type=>type==='text/plain'?pasted:''}});
    assert.equal(paste.defaultPrevented,true,'prevent native single-line paste from stripping newlines');
    assert.equal(f.view.data.taskParamsMode,'json');
    const multilineParams={whole:2,decimal:1,notes:longNotes+pasted};
    assert.deepEqual(JSON.parse(f.view.field('task-params-json').value),multilineParams);
    await React.act(async()=>f.view.actions.taskParamsModeChange('form'));
    assert.equal(f.view.data.taskParamsMode,'json','multiline text must not return to a lossy single-line input');
    assert.deepEqual(JSON.parse(f.view.field('task-params-json').value),multilineParams);
    assert.match(f.view.field('task-status').text,/E_PARAMS/);
    await f.input('task-params-json',JSON.stringify({...multilineParams,notes:longNotes}));
    await React.act(async()=>f.view.actions.taskParamsModeChange('form'));
    assert.equal(f.view.data.taskParamsMode,'form');
    assert.equal(f.doc.getElementById('task-param-notes').value,longNotes);
    for(const [name,value]of [['whole','1.5'],['whole','3'],['decimal','1.1']]){
      await f.input('task-param-whole','0');await f.input('task-param-decimal','0');await f.input('task-param-'+name,value);
      await React.act(async()=>{assert.equal(f.view.actions.taskRunClick(native(),{...f.view.data.taskRows.identity}),false);});
      assert.ok(f.view.field('task-param-'+name).error,'form submission keeps strict numeric validation');
      await React.act(async()=>f.view.actions.taskParamsModeChange('json'));
      assert.equal(f.view.data.taskParamsMode,'json','schema-invalid numbers can still be edited in JSON');
      assert.equal(JSON.parse(f.view.field('task-params-json').value)[name],Number(value));
      await React.act(async()=>{
        assert.equal(f.view.actions.taskRunClick(native(),{...f.view.data.taskRows.identity}),false);
        f.view.actions.taskParamsModeChange('form');
      });
      assert.equal(f.view.data.taskParamsMode,'json','JSON-to-form still rejects the invalid numeric value');
      await f.input('task-params-json','{"whole":0,"decimal":0}');
      await React.act(async()=>f.view.actions.taskParamsModeChange('form'));
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
      await f.fire(f.doc.getElementById('task-parameters-open'),'click',{isTrusted:true});assert.equal(sheet.open,true);
      name.value='保留草稿';await f.fire(name,'input');
      const permissions=f.state.permissionCalls.length;
      if(dismissal==='native close')await React.act(async()=>{sheet.close();await tick();});
      else if(dismissal==='native cancel')await f.fire(sheet,'cancel');
      else await f.fire(dismissal==='close button'?sheet.querySelector('[aria-label="关闭任务参数"]'):
        [...sheet.querySelectorAll('button')].find(node=>node.textContent==='取消'),'click');
      assert.equal(sheet.open,false);
      await f.fire(f.doc.getElementById('task-parameters-open'),'click',{isTrusted:true});
      assert.equal(sheet.open,true);assert.equal(f.doc.getElementById('task-params-form'),form);
      assert.equal(f.doc.getElementById('task-param-name'),name);assert.equal(name.value,'保留草稿');
      assert.equal(f.view.field('task-param-name').value,'保留草稿');
      assert.equal(f.state.permissionCalls.length,permissions);assert.equal(f.state.starts.length,0);
    }finally{if(root)await React.act(async()=>root.unmount());f.dispose();}
  });
}

test('hiding My leaves the hoisted parameter Sheet visible with the same draft on return',async()=>{
  const f=await fixture();let root;
  try{
    root=await f.mount();await f.fire(f.doc.getElementById('task-parameters-open'),'click',{isTrusted:true});
    const sheet=f.doc.getElementById('task-parameters-sheet');assert.equal(sheet.open,true);
    const form=f.doc.getElementById('task-params-form'),name=f.doc.getElementById('task-param-name');
    name.value='隐藏时保留';await f.fire(name,'input');
    await React.act(async()=>root.render(React.createElement(MyWorkbench,{view:f.view,hidden:true})));
    assert.equal(f.doc.getElementById('workbench-tasks').hidden,true);
    assert.equal(sheet.open,true);assert.equal(sheet.closest('[hidden]'),null);
    assert.equal(f.doc.querySelectorAll('#task-parameters-sheet').length,1);
    await React.act(async()=>root.render(React.createElement(MyWorkbench,{view:f.view,hidden:false})));
    assert.equal(sheet.open,true);assert.equal(f.doc.getElementById('task-params-form'),form);
    assert.equal(f.doc.getElementById('task-param-name'),name);assert.equal(name.value,'隐藏时保留');
    assert.equal(f.state.starts.length,0);assert.equal(f.state.permissionCalls.length,0);
  }finally{if(root)await React.act(async()=>root.unmount());f.dispose();}
});

for(const key of ['Enter','Escape']){
  test(`composing ${key} is prevented and cannot run or close the parameter Sheet`,async()=>{
    const f=await fixture();let root;
    try{
      root=await f.mount();await f.fire(f.doc.getElementById('task-parameters-open'),'click',{isTrusted:true});
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
    root=await f.mount();await f.fire(f.doc.getElementById('task-parameters-open'),'click',{isTrusted:true});
    const permissions=f.state.permissionCalls.length;
    await f.fire(f.doc.getElementById('task-run'),'click');
    assert.equal(f.doc.getElementById('task-parameters-sheet').open,true);
    assert.equal(f.state.permissionCalls.length,permissions);assert.equal(f.state.starts.length,0);
  }finally{if(root)await React.act(async()=>root.unmount());f.dispose();}
});

test('schema-invalid parameters reject trusted Run before permission and leave the Sheet open',async()=>{
  const f=await fixture();let root;
  try{
    root=await f.mount();await f.fire(f.doc.getElementById('task-parameters-open'),'click',{isTrusted:true});
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
    root=await f.mount();await f.fire(f.doc.getElementById('task-parameters-open'),'click',{isTrusted:true});
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
    root=await f.mount();await f.fire(f.doc.getElementById('task-parameters-open'),'click',{isTrusted:true});
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
    await f.fire(f.doc.getElementById('task-parameters-open'),'click',{isTrusted:true});
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
    root=await f.mount();await f.fire(f.doc.getElementById('task-parameters-open'),'click',{isTrusted:true});
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
    root=await f.mount();await f.fire(f.doc.getElementById('task-parameters-open'),'click',{isTrusted:true});
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
    root=await f.mount();assert.equal(f.view.subscriberCount,2);
    assert.ok(f.doc.querySelector('#task-parameters-sheet #task-params-form input[data-task-param="name"]'));
    assert.equal(f.doc.querySelector('#workbench-tasks #task-params-form'),null);
    assert.equal(f.doc.getElementById('task-param-name').value,'Alice');
    await React.act(async()=>{
      const node=f.doc.getElementById('task-param-name');node.value='新草稿';node.dispatchEvent(new window.Event('input',{bubbles:true}));
    });
    assert.equal(f.view.field('task-param-name').value,'新草稿');
    await React.act(async()=>root.render(React.createElement(MyWorkbench,{view:f.view,hidden:true})));
    await React.act(async()=>root.render(React.createElement(MyWorkbench,{view:f.view,hidden:false})));
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


for(const mode of ['form','json'])test(`tool ${mode} correction clears only its matching request summary`,async()=>{
  const f=await fixture();let root;
  try{
    root=await f.mount();
    await React.act(async()=>{await f.workbench.openTaskRunSheet({task:{...f.view.data.taskRows.identity,
      contentHash:f.state.catalog[0].manifest.program.sourceHash},binding:{appId:'webflow'}});});
    if(mode==='json')await React.act(async()=>f.view.actions.taskParamsModeChange('json'));
    const input=f.doc.getElementById(mode==='json'?'task-params-json':'task-param-name');
    input.value=mode==='json'?'{':'';await f.fire(input,'input');
    await React.act(async()=>{f.view.actions.taskSheetPrepareClick(native(),f.view.data.taskRunSheet.identity);});
    assert.match(f.view.data.taskRunSheet.status,/E_PARAMS/);
    input.value=mode==='json'?'{}':'corrected';await f.fire(input,'input');
    assert.equal(f.view.data.taskRunSheet.status,'');
    await React.act(async()=>{
      f.view.field(input.id).error='E_PARAMS: obsolete';
      f.view.field('task-param-count').error='unrelated count error';
      f.view.project('taskRunSheet',{...f.view.data.taskRunSheet,status:'权限失效'});
    });
    await f.fire(input,'input');
    assert.equal(f.view.data.taskRunSheet.status,'权限失效');
    assert.equal(f.view.field('task-param-count').error,'unrelated count error');assert.equal(f.state.starts.length,0);
  }finally{if(root)await React.act(async()=>root.unmount());f.dispose();}
});

test('settled and uninstalled recovery show original values without an execution control',async()=>{
  const f=await fixture();let root;
  try{
    root=await f.mount();
    await React.act(async()=>f.view.project('taskRunSheet',{identity:{taskId:'uninstalled'},title:'uninstalled',source:'tool',
      preparationId:'original',phase:'settled',recoveryOnly:true,originalParams:{original:'saved value'},
      status:'原运行已结算；请关闭后打开新配置。'}));
    const sheet=f.doc.getElementById('task-parameters-sheet');
    assert.equal(sheet.open,true);assert.equal(f.doc.getElementById('task-parameters-title').textContent,'uninstalled');
    assert.match(sheet.querySelector('[aria-label="原准备参数"]').textContent,/saved value/);
    assert.equal(f.doc.getElementById('task-run'),null);
    const labels=[...sheet.querySelectorAll('button')].map(node=>node.textContent);
    assert.ok(labels.includes('查询状态'));assert.ok(!labels.includes('停止'));assert.ok(!labels.includes('取消准备'));
    assert.match(sheet.textContent,/关闭后打开新配置/);assert.equal(f.state.starts.length,0);
  }finally{if(root)await React.act(async()=>root.unmount());f.dispose();}
});


for(const action of ['taskSheetQueryClick','taskSheetCancelClick']){
  for(const outcome of ['resolve','reject','stale'])test(`shared drawer ${action} publishes pending busy and fences ${outcome}`,async()=>{
    const f=await fixture();let root,resolvePending,rejectPending;
    try{
      root=await f.mount();
      const task={...f.view.data.taskRows.identity,contentHash:f.state.catalog[0].manifest.program.sourceHash};
      const binding={appId:'app-a',packageHash:'d'.repeat(64),generation:'epoch-a',instanceId:'frame-a',task};
      const preparation={preparationId:'original',state:'prepared',task,binding,
        params:{name:'Saved',count:2,accept:true,mode:'a'},target:{}};
      f.state.taskRunRequest=async()=>({preparation});
      await React.act(async()=>{await f.workbench.openTaskRunSheet({task,binding});});
      const pending=new Promise((resolve,reject)=>{resolvePending=resolve;rejectPending=reject;});
      f.state.taskRunRequest=()=>pending;
      await React.act(async()=>{f.view.actions[action](native());});
      assert.equal(f.view.data.taskRunSheet.busy,true,'pending state must reach the React store before the reply');
      const buttons=[...f.doc.getElementById('task-parameters-sheet').querySelectorAll('button')];
      for(const label of ['查询状态','取消准备','确认执行一次'])
        assert.equal(buttons.find(button=>button.textContent===label)?.disabled,true,label+' stays disabled while pending');
      const calls=f.state.calls.length;
      await React.act(async()=>{f.view.actions.taskSheetQueryClick(native());f.view.actions.taskSheetCancelClick(native());
        f.view.actions.taskSheetConfirmClick(native(),task);});
      assert.equal(f.state.calls.length,calls,'duplicate actions cannot reach the client');
      if(outcome==='stale'){
        await React.act(async()=>{f.view.actions.taskSheetClose();});
        f.state.taskRunRequest=async()=>({preparation});
        await React.act(async()=>{await f.workbench.openTaskRunSheet({task,binding});});
        // Same preparation ID, new sheet sequence: neither reply nor finally owns it.
        await React.act(async()=>f.view.project('taskRunSheet',{...f.view.data.taskRunSheet,busy:true,status:'new owner'}));
      }
      await React.act(async()=>{
        if(outcome==='reject')rejectPending(Object.assign(Error('query unavailable'),{code:'E_TEST'}));
        else resolvePending({preparation:{...preparation,state:'cancelled'}});
        await tick();await tick();
      });
      if(outcome==='stale'){
        assert.equal(f.view.data.taskRunSheet.status,'new owner');assert.equal(f.view.data.taskRunSheet.busy,true);
      }else{
        assert.equal(f.view.data.taskRunSheet.busy,false);
        assert.equal([...f.doc.querySelectorAll('#task-parameters-sheet button')].find(button=>button.textContent==='查询状态').disabled,false);
        if(outcome==='reject')assert.match(f.view.data.taskRunSheet.status,/E_TEST/);
        else assert.equal(f.view.data.taskRunSheet.phase,'cancelled');
      }
      assert.equal(f.state.starts.length,0);assert.equal(f.state.permissionCalls.length,0);
    }finally{resolvePending?.(null);if(root)await React.act(async()=>root.unmount());f.dispose();}
  });
}

for(const explicit of [false,true]){
  for(const mismatch of ['task','appId','packageHash','generation','unbound'])
    test(`shared drawer rejects ${explicit?'explicit':'global'} preparation with different ${mismatch}`,async()=>{
      const f=await fixture({twoTasks:true});let root;
      try{
        root=await f.mount();
        const task={...f.view.data.taskRows.identity,contentHash:f.state.catalog[0].manifest.program.sourceHash};
        const binding={appId:'app-a',packageHash:'d'.repeat(64),generation:'epoch-a',instanceId:'frame-a',task};
        const preparation={preparationId:'original-a',state:'prepared',task,binding,
          params:{name:'App A saved'},target:{}};
        f.state.taskRunRequest=async()=>({preparation});
        const requestedTask=mismatch==='task'?{...f.state.installed[1],contentHash:task.contentHash}:task;
        let requestedBinding={...binding,task:requestedTask,instanceId:'reopened-frame'};
        if(mismatch==='appId')requestedBinding.appId='app-b';
        if(mismatch==='packageHash')requestedBinding.packageHash='e'.repeat(64);
        if(mismatch==='generation')requestedBinding.generation='epoch-b';
        if(mismatch==='unbound')requestedBinding=null;
        await React.act(async()=>{
          await assert.rejects(f.workbench.openTaskRunSheet({task:requestedTask,binding:requestedBinding,
            ...(explicit?{preparationId:preparation.preparationId}:{})}),
            error=>['E_TASK_BUSY','E_REVISION'].includes(error?.code));
        });
        assert.equal(f.view.data.taskRunSheet??null,null,'a foreign preparation never becomes confirmable');
        assert.equal(f.state.calls.some(({action})=>['prepareTaskRun','cancelTaskRun','resolveInstalledTask'].includes(action)),false);
        assert.equal(f.state.starts.length,0);assert.equal(f.state.permissionCalls.length,0);
      }finally{if(root)await React.act(async()=>root.unmount());f.dispose();}
    });
}

test('shared drawer restores the same task and App package generation across frame reopen',async()=>{
  const f=await fixture();let root;
  try{
    root=await f.mount();
    const task={...f.view.data.taskRows.identity,contentHash:f.state.catalog[0].manifest.program.sourceHash};
    const binding={appId:'app-a',packageHash:'d'.repeat(64),generation:'epoch-a',instanceId:'original-frame',task};
    const preparation={preparationId:'original',state:'prepared',task,binding,params:{name:'Saved'},target:{}};
    f.state.taskRunRequest=async()=>({preparation});
    await React.act(async()=>{assert.equal(await f.workbench.openTaskRunSheet({task,binding:{...binding,instanceId:'new-frame'}}),true);});
    assert.equal(f.view.data.taskRunSheet.preparationId,'original');
    assert.equal(f.view.data.taskRunSheet.phase,'prepared');assert.equal(f.doc.getElementById('task-run').disabled,false);
    assert.equal(f.state.starts.length,0);
  }finally{if(root)await React.act(async()=>root.unmount());f.dispose();}
});


for(const draft of ['', '-', '1e', 'not-a-number', '1e999', ' '])
  test(`form draft switches to JSON with incomplete required text and numeric ${JSON.stringify(draft)}`,async()=>{
    const f=await fixture();let root;
    try{
      root=await f.mount();
      const task={...f.view.data.taskRows.identity,contentHash:f.state.catalog[0].manifest.program.sourceHash};
      await React.act(async()=>{await f.workbench.openTaskRunSheet({task,binding:{appId:'fixture-app'}});});
      await f.input('task-param-name','');await f.input('task-param-count',draft);
      // Form submissions still use the original validator before conversion.
      await React.act(async()=>{
        assert.equal(f.view.actions.taskSheetPrepareClick(native(),task),false);
        assert.equal(f.view.actions.taskRunClick(native(),task),false);
      });
      await React.act(async()=>f.view.actions.taskParamsModeChange('json'));
      assert.equal(f.view.data.taskParamsMode,'json','unfinished drafts are editable in JSON');
      const text=f.view.field('task-params-json').value;
      assert.deepEqual(JSON.parse(text),{name:'',count:draft,accept:true,mode:'a'},'invalid numeric input retains its exact text instead of null or zero');
      await React.act(async()=>{
        assert.equal(f.view.actions.taskSheetPrepareClick(native(),task),false);
        assert.equal(f.view.actions.taskRunClick(native(),task),false);
        f.view.actions.taskParamsModeChange('form');
      });
      assert.equal(f.view.data.taskParamsMode,'json','strict JSON-to-form validation retains the unfinished JSON');
      assert.equal(f.view.field('task-params-json').value,text);
      await f.input('task-params-json',JSON.stringify({...JSON.parse(text),name:'Valid name'}));
      await React.act(async()=>{
        assert.equal(f.view.actions.taskSheetPrepareClick(native(),task),false);
        assert.equal(f.view.actions.taskRunClick(native(),task),false);
      });
      assert.equal(f.state.calls.some(({action})=>action==='prepareTaskRun'),false);
      assert.equal(f.state.starts.length,0);assert.equal(f.state.permissionCalls.length,0);
    }finally{if(root)await React.act(async()=>root.unmount());f.dispose();}
  });

test('form draft switch keeps numeric and boolean primitives while required text is incomplete',async()=>{
  const f=await fixture({paramsSchema:{type:'object',properties:{
    name:{type:'string',title:'名称',minLength:1},count:{type:'integer',title:'次数',default:2},
    decimal:{type:'number',title:'比例',default:0.5},accept:{type:'boolean',title:'确认',default:false},
    mode:{type:'boolean',title:'模式',enum:[false,true],default:true}},required:['name'],additionalProperties:false}});let root;
  try{
    root=await f.mount();await f.input('task-param-name','');await f.input('task-param-count','7');
    await f.input('task-param-decimal','-0.25');
    await React.act(async()=>f.view.actions.taskParamsModeChange('json'));
    assert.equal(f.view.data.taskParamsMode,'json');
    assert.deepEqual(JSON.parse(f.view.field('task-params-json').value),{name:'',count:7,decimal:-0.25,accept:false,mode:true});
    assert.equal(f.state.starts.length,0);assert.equal(f.state.permissionCalls.length,0);
  }finally{if(root)await React.act(async()=>root.unmount());f.dispose();}
});

for(const frozen of ['prepared','busy'])test(`shared drawer ${frozen} freezes boolean labels and optional clear without losing drafts`,async()=>{
  // React Aria exposes its mouse fallback specifically for DOM test environments.
  const priorEnv=process.env.NODE_ENV;process.env.NODE_ENV='test';
  const f=await fixture({paramsSchema:{type:'object',properties:{
    name:{type:'string',title:'名称',default:'Alice'},accept:{type:'boolean',title:'确认',default:true},
    optional:{type:'boolean',title:'可选'},count:{type:'integer',title:'次数',default:2}},required:['name'],additionalProperties:false}});let root;
  try{
    root=await f.mount();
    const task={...f.view.data.taskRows.identity,contentHash:f.state.catalog[0].manifest.program.sourceHash};
    await React.act(async()=>{await f.workbench.openTaskRunSheet({task,binding:{appId:'fixture-app'}});});
    await f.input('task-param-name','editing draft');
    const label=name=>f.doc.getElementById('task-param-'+name).closest('.task-param-toggle').querySelector('label');
    // React Aria handles mouse presses on the label; a lone synthetic click
    // neither supplies button=0 nor starts that press in linkedom.
    const clickLabel=async name=>{
      const node=label(name);
      for(const type of ['mousedown','mouseup','click'])await f.fire(node,type,{button:0,detail:1});
    };
    await clickLabel('accept');assert.equal(f.view.field('task-param-accept').checked,false,'editing label can toggle');
    await clickLabel('optional');assert.equal(f.view.field('task-param-optional').checked,true,'editing optional label can toggle');
    assert.equal(f.view.field('task-param-optional').omitted,false);
    const order=[...f.doc.querySelectorAll('[data-task-param]')];
    const values=()=>f.view.data.taskParams.map(({name})=>{const field=f.view.field('task-param-'+name);return {value:field.value,checked:field.checked,omitted:field.omitted};});
    const draft=values();
    await React.act(async()=>f.view.project('taskRunSheet',{...f.view.data.taskRunSheet,
      phase:frozen==='prepared'?'prepared':'editing',busy:frozen==='busy'}));
    for(const name of ['accept','optional']){
      await clickLabel(name);
    }
    const clear=f.doc.querySelector('button[aria-label="不填写可选"]');
    await f.fire(clear,'click',{button:0});
    assert.deepEqual(values(),draft,'frozen clicks cannot mutate the captured draft');
    assert.equal(clear.disabled,true);
    for(const name of ['accept','optional'])assert.equal(f.doc.getElementById('task-param-'+name).disabled,true,'the React Aria input receives explicit disabled');
    assert.deepEqual([...f.doc.querySelectorAll('[data-task-param]')],order,'controls keep their order and instances');
    await React.act(async()=>f.view.project('taskRunSheet',{...f.view.data.taskRunSheet,phase:'editing',busy:false}));
    await clickLabel('accept');assert.equal(f.view.field('task-param-accept').checked,true);
    await f.fire(clear,'click');assert.equal(f.view.field('task-param-optional').omitted,true,'editing can clear an optional boolean');
    assert.equal(f.view.field('task-param-name').value,'editing draft');
    assert.equal(f.state.starts.length,0);assert.equal(f.state.permissionCalls.length,0);
  }finally{if(root)await React.act(async()=>root.unmount());f.dispose();
    if(priorEnv===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=priorEnv;}
});

test('public MyControl respects props.disabled and retains a disabled field override',async()=>{
  const f=await fixture();let root;
  try{
    root=await f.mount();
    const id='disabled-prop-fixture';
    for(const [propDisabled,fieldDisabled]of [[true,false],[false,true],[false,false]]){
      f.view.field(id).disabled=fieldDisabled;
      await React.act(async()=>root.render(React.createElement(MyControl,{view:f.view,as:'input',controlBase:'aria',id,disabled:propDisabled})));
      assert.equal(f.doc.getElementById(id).disabled,propDisabled||fieldDisabled);
    }
  }finally{if(root)await React.act(async()=>root.unmount());f.dispose();}
});

function importFixtureFile(name,source,size=source.length){
  return {name,size,text:async()=>source};
}
test('R1 file picker and drag-drop route through the same trusted import, never install or run',async()=>{
  const f=await fixture();let root;
  try{
    root=await f.mount();
    await f.dispatch('task-open-catalog');
    const dropZone=f.doc.getElementById('task-add-menu');
    assert.equal(dropZone.getAttribute('aria-label'),'添加任务：可拖放单个文件');
    assert.equal(dropZone.getAttribute('tabindex'),'0');
    const js=importFixtureFile('sample.js','async function main(){ return 1; }');
    await React.act(async()=>{f.view.field('task-add-file').files=[js];
      await f.view.actions.taskAddFileChange(native());});
    assert.match(f.view.field('task-add-status').text,/未保存草稿/);
    const dropEvent={dataTransfer:{types:['Files'],files:[js]},preventDefault(){},stopPropagation(){}};
    await React.act(async()=>{await f.view.actions.taskFileDrop('add',dropEvent);});
    assert.match(f.view.field('task-add-status').text,/未保存草稿/);
    assert.equal(f.state.calls.filter(x=>['importTaskPackage','installTask','runTask'].includes(x.action)).length,0);
    assert.equal(f.state.starts.length,0);
  }finally{if(root)await React.act(async()=>root.unmount());f.dispose();}
});

test('R1 malformed, multiple and disguised file import fail closed without Host admission',async()=>{
  const f=await fixture();
  try{
    const fake=(name,body,size)=>importFixtureFile(name,body,size);
    const invalid=[
      [fake('broken.json','{oops'),/JSON 语法错误/],
      [fake('blank.js','   '),/内容为空/],
      [fake('program.md','workflow'),/Markdown/],
      [fake('package.zip','binary'),/ZIP/],
      [fake('sidebar.opendesk-tool.json',JSON.stringify({format:'opendesk.sidebar-tool.v2'})),/Sidebar Tool/],
      [fake('page.json',JSON.stringify({format:'opendesk.page-userscript.v1'})),/Page USER_SCRIPT/],
      [fake('disguised.js',JSON.stringify({format:'opendesk.task-package.v1'})),/JSON 包/],
      [fake('too-large.js','x',Number.MAX_SAFE_INTEGER),/大小上限/]
    ];
    for(const [file,message] of invalid){
      await f.view.actions.taskFileDrop('add',{
        dataTransfer:{types:['Files'],files:[file]},preventDefault(){},stopPropagation(){}});
      assert.match(f.view.field('task-add-status').text,message,file.name);
    }
    await f.view.actions.taskFileDrop('add',{
      dataTransfer:{types:['Files'],files:[fake('one.js','a'),fake('two.js','b')]},
      preventDefault(){},stopPropagation(){}});
    assert.match(f.view.field('task-add-status').text,/一次只能导入 1 个文件/);
    await f.view.actions.taskFileDrop('add',{
      dataTransfer:{types:['Files'],files:[]},preventDefault(){},stopPropagation(){}});
    assert.match(f.view.field('task-add-status').text,/文件夹\/目录拖放暂不支持/);
    assert.equal(f.state.calls.some(x=>x.action==='importTaskPackage'),false);
    assert.equal(f.state.starts.length,0);
    assert.equal(f.state.permissionCalls.some(x=>x.action==='request'),false);
  }finally{f.dispose();}
});

test('R1 task package reaches only the existing Host candidate importer, not installer',async()=>{
  const f=await fixture();
  try{
    const packageBody=JSON.stringify({format:'opendesk.task-package.v1',
      manifest:{taskId:'imported.task',version:'1.0.0'}});
    await f.view.actions.taskFileDrop('add',{
      dataTransfer:{types:['Files'],files:[importFixtureFile('candidate.json',packageBody)]},
      preventDefault(){},stopPropagation(){}});
    assert.equal(f.state.calls.filter(x=>x.action==='importTaskPackage').length,1);
    assert.match(f.view.field('task-add-status').text,/待验证任务/);
    assert.equal(f.state.starts.length,0);
    assert.equal(f.state.calls.filter(x=>/install|runTask/.test(x.action)).length,0);
  }finally{f.dispose();}
});

test('R1 valid Program Draft goes to the original authoring route and catalog JS uses same Host bridge',async()=>{
  const f=await fixture();
  try{
    const source='async function main(){ return 1; }';
    const sha=createHash('sha256').update(source).digest('hex');
    const draft={format:'opendesk.program-draft.v1',
      project:{id:'import.example',version:'1.0.0',entry:'main.js'},
      runtimeKind:'controller',
      build:{mode:'development',sourceHash:sha,byteLength:Buffer.byteLength(source)},
      sourceUtf8:source,authoring:{files:[{path:'main.js',sourceUtf8:source,sha256:sha}]}};
    await f.view.actions.taskFileDrop('add',{
      dataTransfer:{types:['Files'],files:[importFixtureFile('authoring.json',JSON.stringify(draft))]},
      preventDefault(){},stopPropagation(){}});
    assert.match(f.view.field('task-add-status').text,/未保存草稿/);
    assert.equal(f.state.calls.filter(x=>x.action==='importTaskPackage').length,0);
    f.workbench.showCatalogPage();await tick();await tick();
    await f.view.actions.taskFileDrop('catalog',{
      dataTransfer:{types:['Files'],files:[importFixtureFile('catalog.js',source)]},
      preventDefault(){},stopPropagation(){}});
    assert.match(f.view.field('task-catalog-status').text,/同窗口.*未保存草稿/);
    assert.equal(f.state.starts.length,0);
  }finally{f.dispose();}
});

test('R1 existing immutable Task version reports idempotent duplicate or actionable conflict',async()=>{
  const f=await fixture();
  try{
    const body=JSON.stringify({format:'opendesk.task-package.v1',
      manifest:{taskId:'imported.task',version:'1.0.0'}});
    const event=()=>({dataTransfer:{types:['Files'],files:[importFixtureFile('same.json',body)]},
      preventDefault(){},stopPropagation(){}});
    f.state.importDuplicate=true;
    await f.view.actions.taskFileDrop('add',event());
    assert.match(f.view.field('task-add-status').text,/同一固定版本已存在/);
    f.state.importConflict=true;
    await f.view.actions.taskFileDrop('add',event());
    assert.match(f.view.field('task-add-status').text,/不能覆盖/);
    assert.equal(f.state.starts.length,0);
    assert.equal(f.state.calls.filter(x=>/install|runTask/.test(x.action)).length,0);
  }finally{f.dispose();}
});
