import {taskConversationPolicy} from '../../src/ui/conversation/my-task-instructions.js';
import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {load} from 'cheerio';
import {programDraft} from '../fixtures/program-draft.mjs';
import {createTaskWorkbench} from '../../src/ui/task-workbench.js';
import {createDeveloperView} from '../../src/ui/develop-view.js';
import {createTaskReviewHandoff,taskReviewHandoffKey} from '../../src/ui/workflow/task-review-handoff.js';
import {encodeValue} from '../../src/platform/page-port/codec.js';
import {verifyTaskPackage} from '../../src/platform/tasks/contract.js';
import {createMyTaskAgent} from '../../src/ui/my-task-agent.js';
import {createSharedAIProviderRuntime} from '../../src/ui/ai/provider-runtime.js';
import {createBusinessConversation} from '../../src/ui/conversation/provider-consumer.js';


// Task business tests exercise registered React actions and view projections.
// The only document stub below records focus requests; it is not a DOM event engine.
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
// Diagnostic only: the Node test worker must exit after all per-test disposals.
// Keep the original assertions; report actual live resource kinds before any
// runner timeout, rather than force-closing the process or hiding a leak.
after(()=>{
  console.error('TASK_WORKBENCH_EXIT_RESOURCES='+JSON.stringify({
    activeResources:process.getActiveResourcesInfo?.()??[],
    activeHandles:process._getActiveHandles?.().map(handle=>handle.constructor?.name)??[]
  }));
});
const make=({installedInitially=true,secondTask=false,sharedStore=null,draftStorage,deadlineMs,notify,appTab}={})=>{
  const nodes=new Map();
  const doc={...(appTab?{location:{href:'chrome-extension://extension/app.html'}}:{}),documentElement:{dataset:{}},activeElement:null,querySelector:()=>null};
  const get=id=>{
    if(!nodes.has(id)){
      const node={focus(){doc.activeElement=node;},click(){},scrollTo(){}};
      nodes.set(id,node);
    }
    return nodes.get(id);
  };
  doc.getElementById=get;
  const programId='task:demo.form:1.0.0',hash='a'.repeat(64),manifestHash='b'.repeat(64);
  const manifest={title:'表单任务',description:'输入表单',author:'OpenDesk',source:'local',siteOrigins:['https://a.example'],
    permissions:['page.automation'],...(deadlineMs===undefined?{}:{deadlineMs}),program:{sourceHash:hash},paramsSchema:{type:'object',
      properties:{name:{type:'string',title:'姓名',minLength:1,maxLength:30,default:'Alice'}},required:['name'],additionalProperties:false}};
  const row={taskId:'demo.form',version:'1.0.0',manifest,manifestHash,stage:'available',installed:installedInitially,enabled:true};
  const installed={taskId:row.taskId,version:row.version,scriptId:programId,manifestHash,enabled:true,
    installationId:'11111111-1111-4111-8111-111111111111',generation:1};
  const other=secondTask?{...row,taskId:'demo.second',
    manifest:{...manifest,title:'另一个已安装任务',description:'演示切换时保留各自输入'}}:null;
  const otherInstalled=secondTask?{...installed,taskId:'demo.second',scriptId:'task:demo.second:1.0.0',installationId:'22222222-2222-4222-8222-222222222222'}:null;
  let installedState=installedInitially?[installed,...(secondTask?[otherInstalled]:[])]:[];
  if(sharedStore && !sharedStore.catalog){
    sharedStore.catalog=structuredClone(secondTask?[row,other]:[row]);
    sharedStore.installed=structuredClone(installedState);
  }
  const state=sharedStore || {catalog:secondTask?[row,other]:[row],installed:installedState};
  const catalogState=state;
  const starts=[],permissions=[],stops=[],catalogOpens=[],draftMessages=[],importedDrafts=[];
  let target={status:'available',url:'https://a.example/',tabId:9,windowId:7,documentId:'doc-9'};
  const page={
    get snapshot(){return target;},subscribe:fn=>{fn(target);return()=>{};},
    capture:()=>target,revalidate:async()=>true};
  const view={runs:[],results:[],slotAvailable:true,downloads:[],resultDeliveryDenied:[]};
  const client={ready:Promise.resolve(),subscribeConnection:()=>()=>{},
    controller:{snapshotControllerRun:async()=>structuredClone(view)},
    async request(method,payload) {
      if(method==='inspectTaskRun')return {preparation:null};
      if(method==='listTaskCatalog')return {catalog:structuredClone(state.catalog),installed:structuredClone(state.installed)};
      if(method==='installTask') {
        installedState=[installed];state.installed=structuredClone(installedState);
        state.catalog=state.catalog.map(item=>item.taskId===row.taskId?{...item,installed:true}:item);
        row.installed=true;return structuredClone(installed);
      }
      if(method==='resolveInstalledTask')return {taskId:row.taskId,version:row.version,scriptId:programId,
        revision:1,contentHash:hash,manifestHash,manifest,
        installationId:state.installed.find(value=>value.taskId===row.taskId)?.installationId??null,
        generation:state.installed.find(value=>value.taskId===row.taskId)?.generation??null};
      if(method==='getTaskCandidate')return {taskId:row.taskId,version:row.version,manifestHash:row.manifestHash,
        // The verified Task Service returns a complete immutable manifest;
        // the reader must reject any frozen package missing taskId or version.
        package:{manifestHash:row.manifestHash,
          manifest:{...row.manifest,taskId:row.taskId,version:row.version},
          sourceUtf8:'async function main(){return true;}'}};
      throw new Error('unexpected '+method);
    }};
  let active=null,finish;
  const host={
    get currentRun(){return active;},get completion(){return finish;},
    async start(request){
      starts.push(structuredClone(request));active='run-task-1';
      finish=new Promise(resolve=>{this.complete=value=>{
        view.runs.push({runId:active,state:'completed',revision:{scriptId:programId}});
        view.results.push({runId:active,resultId:'result-task-1',state:'completed',
          revision:{scriptId:programId},outcome:{ok:true,valueWire:encodeValue(value)}});
        active=null;resolve({state:'completed'});
      };});
      return {runId:'run-task-1'};
    },
    async stop(request){stops.push(request);active=null;return{state:'stopped'};},
    subscribe:()=>()=>{}
  };
  const api={storage:draftStorage?{session:draftStorage}:undefined,permissions:{contains:async()=>true,request:value=>{permissions.push(value);return Promise.resolve(true);}},
    runtime:{getURL:path=>'chrome-extension://extension/'+path,sendMessage:async message=>{draftMessages.push(message);return {ok:true};}},
    tabs:{...(appTab?{getCurrent:async()=>typeof appTab==='function'?appTab():appTab}:{}),create:async request=>{catalogOpens.push(request);return {id:99};}}};
  // Mirror the real React Side Panel: Task Workbench receives the shared
  // Developer view rather than a legacy DOM-only candidate control.
  const developerView=createDeveloperView();
  const workbench=createTaskWorkbench({client,host,currentPageTarget:page,api,document:doc,developerView,notify,
    importDraft:source=>importedDrafts.push(source)});
  const ui={...workbench,dispose(){workbench.dispose();developerView.dispose();}};
  // Business tests invoke exactly the actions wired to the production React
  // MyTasksPage/Dock. Node calls the same named actions as actual React.
  const action=(name,event={isTrusted:true})=>{
    const callback=workbench.myView.actions[name];
    assert.equal(typeof callback,'function',`Missing production React action: ${name}`);
    return callback(event);
  };
  const field=id=>workbench.myView.field(id);
  const click=async(id,trusted=true)=>{
    if(id.startsWith('tab-')){
      const tab={'tab-my-tasks':'tasks','tab-tools':'tools','tab-develop':'develop',
        'tab-cloud':'cloud','tab-workflow':'workflow'}[id];
      assert(tab,`Unknown production tab: ${id}`);
      ui.navigate(tab);
      if(tab==='tasks')await ui.refresh(undefined,{skipUnchanged:true});
    }else if(!field(id).disabled){
      await action(id.replace(/-([a-z])/g,(_,part)=>part.toUpperCase())+'Click',{isTrusted:trusted});
    }
    await tick();await tick();
  };
  return {ui,developerView,myView:workbench.myView,field,action,get,doc,page,host,client,view,starts,permissions,stops,catalogOpens,draftMessages,importedDrafts,api,catalogState,click};
};

const managementCases=[
  {name:'install',method:'installTask',action:'taskInstallClick',message:/已安装/,caption:/填写参数并运行/},
  {name:'disable',method:'setInstalledTaskEnabled',action:'taskToggleClick',message:/已停用/},
  {name:'enable',method:'setInstalledTaskEnabled',action:'taskToggleClick',message:/已重新启用/},
  {name:'uninstall',method:'uninstallTask',action:'taskUninstallYesClick',message:/已卸载/}
];
async function managementFixture(t,operation,notify){
  const f=make({installedInitially:operation.name!=='install',notify});
  t.after(()=>f.ui.dispose());await f.ui.refresh();await tick();await tick();
  if(operation.name==='install'){
    f.ui.showCatalogPage();await tick();await tick();
    f.action('taskCatalogSelect','demo.form@1.0.0');await tick();await tick();
  }
  if(operation.name==='enable'){
    f.catalogState.installed[0].enabled=false;await f.ui.refresh();
  }
  const request=f.client.request.bind(f.client);
  f.client.request=async(method,input)=>{
    if(method==='setInstalledTaskEnabled'){
      f.catalogState.installed[0].enabled=input.enabled;
      return structuredClone(f.catalogState.installed[0]);
    }
    if(method==='uninstallTask'){
      f.catalogState.installed=[];f.catalogState.catalog[0].installed=false;return {uninstalled:true};
    }
    return request(method,input);
  };
  if(operation.name==='uninstall')f.action('taskUninstallClick');
  return f;
}
for(const operation of managementCases){
  test('management success notification: '+operation.name,async t=>{
    const notices=[];
    const f=await managementFixture(t,operation,(message,options)=>notices.push({message,options}));
    const request=f.client.request.bind(f.client);
    let release;
    f.client.request=async(method,input)=>{
      if(method===operation.method)await new Promise(resolve=>{release=resolve;});
      return request(method,input);
    };
    const pending=f.action(operation.action);await tick();
    assert.equal(typeof release,'function');assert.deepEqual(notices,[],'no success before actual receipt');
    release();await pending;
    assert.equal(notices.length,1);assert.match(notices[0].message,operation.message);
    assert.equal(notices[0].options.type,'success');
    if(operation.caption)assert.match(notices[0].options.caption,operation.caption);
    assert.doesNotMatch(f.field('task-status').text,operation.message,'ordinary success is not footer status');
  });
  test('management success notification preserves legacy fallback: '+operation.name,async t=>{
    const f=await managementFixture(t,operation);
    await f.action(operation.action);
    assert.match(f.field('task-status').text,operation.message);
  });
  test('management success notification keeps unknown failure persistent: '+operation.name,async t=>{
    const notices=[],f=await managementFixture(t,operation,(...args)=>notices.push(args));
    const request=f.client.request.bind(f.client);
    f.client.request=async(method,input)=>{
      if(method===operation.method)throw {code:'E_OUTCOME_UNKNOWN',message:'结果未知，请勿重放'};
      return request(method,input);
    };
    await f.action(operation.action);
    assert.deepEqual(notices,[]);assert.match(f.field('task-status').text,/E_OUTCOME_UNKNOWN.*结果未知/);
  });
  for(const phase of ['receipt','refresh'])test('management success notification ignores disposed '+phase+': '+operation.name,async t=>{
    const notices=[],f=await managementFixture(t,operation,(...args)=>notices.push(args));
    const request=f.client.request.bind(f.client);
    let release;
    f.client.request=async(method,input)=>{
      if(method===(phase==='receipt'?operation.method:'listTaskCatalog'))
        await new Promise(resolve=>{release=resolve;});
      return request(method,input);
    };
    const pending=f.action(operation.action);await tick();
    assert.equal(typeof release,'function');f.ui.dispose();release();await pending;
    assert.deepEqual(notices,[]);
  });
}

test('manual installed Run uses the reviewed duration and keeps the legacy 30 second default',async t=>{
  for(const deadlineMs of [undefined,120000]){
    const f=make({deadlineMs});t.after(()=>f.ui.dispose());await tick();await tick();
    const before=Date.now();f.action('taskRunClick');await tick();await tick();
    assert.equal(f.starts.length,1);
    assert.ok(f.starts[0].deadlineAt>=before+(deadlineMs??30000));
    assert.ok(f.starts[0].deadlineAt<=Date.now()+(deadlineMs??30000));
    f.host.complete({ok:true});await tick();await tick();
    f.ui.dispose();
  }
});

test('ordinary Task Run returns immediately while the agent receives its exact completion',async t=>{
  const f=make();t.after(()=>f.ui.dispose());await tick();await tick();
  assert.equal(f.action('taskRunClick'),undefined);
  await tick();await tick();
  assert.equal(f.starts.length,1);
  f.host.complete({first:true});await tick();await tick();await tick();
  const installed=f.catalogState.installed[0];
  const pending=f.ui.runInstalledForAgent({taskId:installed.taskId,
    params:{name:'Agent'},event:{isTrusted:true},expected:{...installed}});
  assert.equal(typeof pending?.then,'function');
  await tick();await tick();
  assert.equal(f.starts.length,2);
  f.host.complete({agent:true});
  const result=await pending;
  assert.equal(result.runId,'run-task-1');
  assert.equal(result.taskId,installed.taskId);
  assert.equal(result.installationId,installed.installationId);
});

// Real Agent -> Consumer/Runtime -> Workbench -> Host admission. Only Chrome,
// model transport and the durable Host use the existing in-memory substitutes.
async function agentWorkbench(t){
  const f=make();t.after(()=>f.ui.dispose());await tick();await tick();
  f.page.snapshot.origin='https://a.example';
  let modelGranted=true,turn=0;
  const removed=new Set(),contains=f.api.permissions.contains;
  f.api.permissions.onRemoved={addListener:fn=>removed.add(fn),removeListener:fn=>removed.delete(fn)};
  f.api.permissions.contains=input=>input.origins?.includes('https://model.example/*')
    ?Promise.resolve(modelGranted):contains(input);
  const runtime=createSharedAIProviderRuntime({client:{requestWorkflowAI:async()=>({})},
    hostInstanceId:'agent-workbench-test',facadeFactory:()=>({
      generateStructured:async()=>({proposal:turn++===0?{actions:[{
        type:'run_task',taskId:'demo.form',params:{name:'Agent'}
      }]}:{question:'已核对执行结果'}})
    })});
  runtime.updateSettings({source:'custom_https',endpoint:'https://model.example/v1/responses',
    model:'memory-model',apiKey:'memory-only'});
  const provider=createBusinessConversation({api:f.api,providerRuntime:runtime,
    hostInstanceId:'agent-workbench-test',consumerId:'tasks',policy:taskConversationPolicy,instanceId:'my-agent'});
  const agent=createMyTaskAgent({client:f.client,taskWorkbench:f.ui,provider,
    currentPageTarget:f.page,api:f.api});
  t.after(()=>{agent.dispose();provider.dispose();runtime.dispose();});
  return {f,agent,runtime,revoke(notify=true){modelGranted=false;
    if(notify)for(const fn of [...removed])fn({origins:['https://model.example/*']});}};
}

for(const invalidation of ['model revocation','AI Stop','missing model grant without an event']){
  test('real Agent + Workbench blocks RunHost after '+invalidation+' during installed-task lookup',async t=>{
    const {f,agent,runtime,revoke}=await agentWorkbench(t);
    const generation=runtime.configuration().generation;
    await agent.send('运行表单任务',{isTrusted:true});
    assert.equal(agent.getSnapshot().status,'review');
    let entered,release;
    const resolving=new Promise(resolve=>{entered=resolve;});
    const gate=new Promise(resolve=>{release=resolve;});
    const request=f.client.request.bind(f.client);
    f.client.request=async(method,payload)=>{
      if(method==='resolveInstalledTask'){entered();await gate;}
      return request(method,payload);
    };
    const confirming=agent.confirm({isTrusted:true});
    await resolving;
    assert.equal(f.starts.length,0,'lookup is held before Host admission');
    if(invalidation==='AI Stop')await agent.stop();
    else revoke(invalidation==='model revocation');
    release();await confirming;
    assert.equal(runtime.configuration().generation,generation);
    assert.equal(f.starts.length,0,'invalidated Agent must never dispatch RunHost.start');
    assert.equal(f.stops.length,0,'pre-admission AI cancellation is not business Stop');
    assert.equal(agent.getSnapshot().pending,null);
    // Retire the confirmation once; releasing lookup cannot restore it.
    await agent.confirm({isTrusted:true});
    assert.equal(f.starts.length,0);
    assert.deepEqual(f.permissions,[{origins:['https://model.example/*']}],
      'only the original Send requests model access; preflight never prompts');
  });
}

test('real Agent + Workbench runs normally and AI Stop preserves an already submitted Host run',async t=>{
  const {f,agent}=await agentWorkbench(t);
  await agent.send('运行表单任务',{isTrusted:true});
  let entered;
  const submitted=new Promise(resolve=>{entered=resolve;});
  const start=f.host.start.bind(f.host);
  f.host.start=async input=>{const claim=await start(input);entered();return claim;};
  const confirming=agent.confirm({isTrusted:true});
  await submitted;
  assert.equal(f.starts.length,1);
  await agent.stop();
  assert.equal(f.host.currentRun,'run-task-1');
  assert.equal(f.stops.length,0,'AI Stop cannot cancel a business run already submitted');
  f.host.complete({done:true});await confirming;
  assert.equal(f.starts.length,1,'no automatic replay after completion');
  assert.match(agent.getSnapshot().rows.map(row=>row.message).join(' '),/可能已经提交/);
});

test('legacy first-run migration refreshes the installed identity before the next explicit Run',async t=>{
  const f=make();t.after(()=>f.ui.dispose());
  delete f.catalogState.installed[0].installationId;
  delete f.catalogState.installed[0].generation;
  await tick();await tick();
  const request=f.client.request.bind(f.client),start=f.host.start.bind(f.host);
  f.client.request=async(method,payload)=>{
    const result=await request(method,payload);
    if(method==='resolveInstalledTask')Object.assign(result,{
      installationId:f.catalogState.installed[0].installationId??null,
      generation:f.catalogState.installed[0].generation??null});
    return result;
  };
  f.host.start=async input=>{
    const result=await start(input);
    Object.assign(f.catalogState.installed[0],{
      installationId:'11111111-1111-4111-8111-111111111111',generation:1});
    return result;
  };
  await f.click('task-run');
  assert.equal(f.starts.length,1,'the React Run action must admit the first saved version');
  assert.equal(f.starts[0].expectedTaskInstallationId,null);
  f.host.complete(true);await tick();await tick();await tick();
  await f.click('task-run');
  assert.equal(f.starts.length,2,f.field('task-status').text);
  assert.equal(f.starts[1].expectedTaskInstallationId,f.catalogState.installed[0].installationId);
  assert.equal(f.starts[1].expectedTaskGeneration,1);
  assert.equal(f.permissions.length,0);
  f.host.complete(true);
});

test('Task Install requests only missing access on the trusted click and never installs after denial or close',async t=>{
  for(const closing of [false,true]){
    const f=make({installedInitially:false});t.after(()=>f.ui.dispose());
    await tick();await tick();
    f.api.permissions.contains=async()=>false;
    let release;const gate=new Promise(resolve=>release=resolve);
    f.api.permissions.request=request=>{f.permissions.push(request);return gate;};
    f.ui.showCatalogPage();
    f.field('task-catalog-list').value='demo.form@1.0.0';
    f.action('taskCatalogListChange');
    await tick();await tick();
    assert.equal(f.field('task-install').disabled,false);
    // Invoke the registered React action synchronously to preserve gesture
    // timing; awaiting first would invalidate the Chrome permission contract.
    void f.action('taskInstallClick',{isTrusted:false});
    assert.equal(f.permissions.length,0);
    await tick();
    void f.action('taskInstallClick',{isTrusted:true});
    assert.deepEqual(f.permissions,[{origins:['https://a.example/*']}],
      'the exact missing Chrome permission request begins in the trusted action stack');
    if(closing){f.ui.dispose();f.api.permissions.contains=async()=>true;}
    release(closing);await tick();await tick();
    assert.equal(f.catalogState.installed.length,0);
    assert.equal(f.starts.length,0);
  }
});

test('R25.1 fixed-version manager can focus an installed disabled Task without running it',async t=>{
  const f=make();t.after(()=>f.ui.dispose());
  f.catalogState.installed[0].enabled=false;
  await f.ui.refresh();await tick();
  f.ui.navigate('develop');
  assert.equal(f.ui.focusInstalledTask('demo.form'),true);
  assert.equal(f.doc.documentElement.dataset.opendeskTab,'tasks');
  assert.equal(f.field('task-installed-list').value,'demo.form');
  assert.equal(f.field('task-run').disabled,true,
    'management must not silently reenable a disabled installed Task');
  assert.equal(f.starts.length,0);
});

test('entering Sidebar task views reads external installations without executing and preserves unchanged form inputs',async t=>{
  const f=make();t.after(()=>f.ui.dispose());
  const installed=f.catalogState.installed.pop();
  await tick();await tick();
  assert.equal(f.myView.data.taskRows.rows.length,0);
  assert.match(f.myView.data.taskRows.emptyText,/暂无任务.*导入/);
  assert.equal(f.myView.data.taskRows.selectedId,'');
  assert.equal(f.myView.data.taskDetail,'','an empty task scope stays compact');
  assert.equal(f.field('task-run').disabled,true);
  f.catalogState.installed.push(installed);
  await f.click('tab-my-tasks');
  assert.equal(f.field('task-run').disabled,false);
  const input=f.field('task-param-name');
  input.value='Preserved native input';
  f.action('taskParamsFormInput');
  await f.click('tab-tools');
  assert.equal(f.field('task-search-panel').hidden,true);
  await f.click('tab-my-tasks');
  assert.equal(f.field('task-param-name'),input,'unchanged catalog preserves the live React field');
  assert.equal(input.value,'Preserved native input');
  assert.equal(f.starts.length,0);assert.equal(f.permissions.length,0);
  f.catalogState.installed=[];
  await f.click('tab-tools');
  await f.click('tab-my-tasks');
  assert.equal(f.myView.data.taskRows.rows.length,0);
  assert.match(f.myView.data.taskRows.emptyText,/暂无任务/);
});

test('installed tasks default page, render schema form and freeze the exact saved version/params/target',async t=>{
  const f=make();t.after(()=>f.ui.dispose());await tick();await tick();
  assert.equal(f.doc.documentElement.dataset.opendeskTab,'tasks');
  assert.equal(f.field('task-run').disabled,false);
  assert(f.myView.data.taskParams.some(item=>item.name==='name'));
  f.field('task-param-name').value='Bob';
  f.action('taskParamsFormInput');
  await f.click('task-run',false);
  assert.equal(f.starts.length,0,'an untrusted React action cannot start execution');
  await f.click('task-run');
  assert.equal(f.permissions.length,0);assert.equal(f.starts.length,1);
  assert.equal(f.starts[0].expectedTaskGeneration,1);
  assert.equal(f.starts[0].expectedTaskInstallationId,f.catalogState.installed[0].installationId);
  assert.deepEqual(f.starts[0].source,{kind:'saved',scriptId:'task:demo.form:1.0.0',revision:1,
    contentHash:'a'.repeat(64)});
  assert.deepEqual(f.starts[0].params,{name:'Bob'});
  assert.deepEqual(f.starts[0].target,{mode:'borrowed',tabId:9,frameId:0,documentId:'doc-9',
    expectedUrl:'https://a.example/',expectedWindowId:7});
  await f.click('tab-tools');
  assert.equal(f.doc.documentElement.dataset.opendeskTab,'tools');
  assert.equal(f.catalogOpens.length,0,'Extensions navigation must not open the catalog');
  assert.equal(f.myView.data.taskRows.rows.length,1,'installed Tasks use a single list');
  assert.equal(f.myView.data.runDock.taskHidden,false,
    'Task-owned Stop remains accessible across tabs');
  assert.equal(f.myView.data.runDock.developHidden,true,
    'Extensions must not expose a second runner');
  await f.click('tab-develop');
  assert.equal(f.doc.documentElement.dataset.opendeskTab,'develop');
  assert.equal(f.myView.data.runDock.taskHidden,false);
  assert.equal(f.myView.data.runDock.developHidden,true);
  assert.equal(f.host.currentRun,'run-task-1','switching views never retires RunHost');
  f.host.complete({ok:true});await tick();await tick();await tick();
  assert.match(f.field('task-result').text,/"ok": true/);
  const latest=f.myView.data.taskHistory[0];
  assert.match(latest.state,/成功/);
  assert.doesNotMatch(latest.state,/run-task-1/,'ordinary history hides internal IDs');
  assert.match(latest.technical,/run-task-1/,'advanced record retains exact identity');
  await f.click('tab-tools');
  assert.equal(f.myView.data.runDock.taskHidden,true,'idle Extensions cannot borrow Run');
});

test('installed task can be explicitly forked into an independent unsaved editor draft',async t=>{
  const f=make();t.after(()=>f.ui.dispose());await tick();await tick();
  await f.click('task-fork-draft');
  assert.equal(f.doc.documentElement.dataset.opendeskTab,'develop');
  assert.match(f.importedDrafts.at(-1),/async function main/,
    'fork delegates to the original source/compiled-artifact importer');
});

/* task-owned-stop-and-document-race-r3: business actions, not Chrome DOM evidence. */
test('task Stop cannot cancel another view\u0027s in-flight draft; parameter form never navigates',async t=>{
  const f=make();t.after(()=>f.ui.dispose());await tick();await tick();
  let prevented=false;
  f.action('taskParamsFormSubmit',{preventDefault(){prevented=true;}});
  assert.equal(prevented,true,'registered React form submit action prevents navigation');
  await f.host.start({source:{kind:'draft',sourceUtf8:'return 1;'}});
  await f.ui.refresh();
  assert.equal(f.field('task-stop').disabled,true,'another view owns the active run');
  await f.click('task-stop');
  assert.equal(f.stops.length,0,'Stop must not forward for another run owner');
  assert.equal(f.host.currentRun,'run-task-1');
  f.host.complete({ok:true});
});

test('installed task refuses stale target after async installed-version lookup',async t=>{
  const f=make();t.after(()=>f.ui.dispose());await tick();await tick();
  let checks=0;
  f.page.revalidate=async()=>{
    checks++;
    if(checks===2)throw Object.assign(new Error('Document changed during version lookup'),{code:'E_DOCUMENT_STALE'});
  };
  await f.click('task-run');await tick();await tick();
  assert.equal(checks,2,'must fence target before and after async saved-version resolve');
  assert.equal(f.starts.length,0,'stale document must never reach Controller admission');
  assert.match(f.field('task-status').text,/E_DOCUMENT_STALE/);
});

test('task cards retain readable selection and do not surface raw IDs as the main UI',async t=>{
  const f=make();t.after(()=>f.ui.dispose());await tick();await tick();
  const rows=f.myView.data.taskRows;
  assert.equal(rows.rows.length,1,'one installed Task projects one visible React card');
  assert.equal(rows.selectedId,'demo.form');
  assert.equal(rows.rows[0].title,'表单任务');
  assert.equal(rows.rows[0].description,'输入表单');
  assert.match(f.myView.data.taskDetail,/适用网站/);
  assert.doesNotMatch(f.myView.data.taskDetail,/输入表单|[a-f0-9]{64}/,
    'secondary details show permissions without repeating purpose or exposing hashes');
  // SSR is generated from the production React component tree, not hand-coded DOM.
  const {renderSidebarReact}=await import('../helpers/sidebar-react-fixture.mjs');
  const html=await renderSidebarReact({myView:f.myView});
  const row=load(html)('button.task-card[data-task-id="demo.form"]');
  assert.equal(row.length,1);
  assert.equal(row.attr('aria-pressed'),'true');
  assert.equal(row.attr('aria-expanded'),'true');
  assert.equal(row.attr('aria-controls'),'task-selected-workspace');
  assert.match(html,/task-card-copy[^>]*><strong>表单任务<\/strong><small>输入表单<\/small>/);
  assert.equal((html.match(/id="task-selected-workspace"/g)||[]).length,1,
    'React owns exactly one shared task workspace, not a duplicated form');
});

test('shared Task run sheet shortens visual labels without changing accessible names or action labels',async t=>{
  const f=make();t.after(()=>f.ui.dispose());await tick();await tick();
  f.myView.project('taskParams',[...f.myView.data.taskParams,{
    name:'showExecutionTab',rule:{type:'boolean',title:'显示执行标签页',default:true},required:false
  },{
    name:'prompt',rule:{type:'string',title:'待发送提示词',minLength:1,maxLength:3000},required:true
  }]);
  const {renderSidebarReact}=await import('../helpers/sidebar-react-fixture.mjs');
  const $=load(await renderSidebarReact({myView:f.myView}));
  const label=$('label[for="task-param-showExecutionTab"]');
  assert.equal(label.text().trim(),'显示标签页');
  assert.equal(label.attr('title'),'显示执行标签页');
  assert.equal($('#task-param-showExecutionTab').attr('aria-label'),'显示执行标签页');
  assert.equal($('input#task-param-prompt').length,1,'long string is a single-line input by default');
  assert.equal($('textarea#task-param-prompt').length,0,'maxLength does not force a multiline editor');
  assert.equal($('input#task-param-prompt').attr('aria-label'),'待发送提示词');
  assert.equal($('input#task-param-prompt').attr('maxlength'),'3000');
  assert.equal($('textarea#task-params-json').length,1,'explicit JSON mode remains multiline');
  const footer=$('#task-parameters-sheet .task-params-sheet-actions');
  assert.match(footer.text(),/取消/);
  assert.match(footer.text(),/运行任务/);
  assert(footer.find('button svg[aria-hidden="true"]').length>=2,'all footer actions retain visible labels beside decorative icons');
});

test('My keeps search inside installed task management without executing or requesting permissions',async t=>{
  const f=make({secondTask:true});t.after(()=>f.ui.dispose());await tick();await tick();
  assert.deepEqual(f.myView.data.taskRows.rows.map(row=>row.taskId),['demo.form','demo.second']);
  assert.equal(f.field('task-search-panel').hidden,true,'Contextual search is collapsed until management is opened');
  await f.click('task-manage-toggle');
  assert.equal(f.field('task-search-panel').hidden,false);
  assert.equal(f.field('task-manage-toggle').attributes['aria-pressed'],'true');
  f.field('local-discover-search').value='不存在的任务';f.action('localDiscoverSearchInput');
  assert.equal(f.myView.data.taskRows.rows.length,0);
  assert.match(f.myView.data.taskRows.emptyText,/没有匹配/);
  assert.match(f.field('local-discover-count').text,/0 个任务/);
  assert.equal(f.myView.data.taskRows.selectedId,'demo.form',
    'filtering never changes the authoritative installed selection');
  f.field('local-discover-search').value='表单';f.action('localDiscoverSearchInput');
  assert.deepEqual(f.myView.data.taskRows.rows.map(row=>row.taskId),['demo.form']);
  f.myView.data.taskRows.onSelect('demo.form');
  assert.equal(f.field('task-installed-list').value,'demo.form');
  assert.equal(f.starts.length,0);assert.equal(f.permissions.length,0);
  await f.click('task-manage-toggle');
  assert.equal(f.field('task-search-panel').hidden,true);
  assert.equal(f.field('task-manage-toggle').attributes['aria-pressed'],'false');
  assert.equal(f.field('local-discover-search').value,'');
  assert.equal(f.myView.data.taskRows.rows.length,2);
  await f.click('task-open-catalog');
  assert.equal(f.field('task-add-menu').hidden,false,'Add first opens inline actions');
  assert.equal(f.catalogOpens.length,0);
  await f.click('task-add-catalog');
  assert.equal(f.catalogOpens.length,1,'only explicit catalog choice opens full tab');
  assert.equal(f.catalogOpens[0].url,'chrome-extension://extension/sidepanel.html');
});

test('My Escape closes task management, clears filters and returns focus without Run',async t=>{
  const f=make({secondTask:true});t.after(()=>f.ui.dispose());await tick();await tick();
  await f.click('task-manage-toggle');
  f.field('local-discover-search').value='不存在的任务';
  f.action('localDiscoverSearchInput');
  await f.click('local-filter-current');
  assert.equal(f.field('task-run').disabled,true);
  let prevented=false;
  f.action('taskSearchPanelKeydown',{
    key:'Escape',defaultPrevented:false,isComposing:false,preventDefault(){prevented=true;}
  });
  await tick();
  assert.equal(prevented,true,'Escape action must consume the event');
  assert.equal(f.field('task-search-panel').hidden,true);
  assert.equal(f.field('task-manage-toggle').attributes['aria-pressed'],'false');
  assert.equal(f.field('local-discover-search').value,'');
  assert.equal(f.field('local-filter-all').attributes['aria-pressed'],'true');
  assert.equal(f.myView.data.taskRows.rows.length,2);
  // The Node fixture observes the focus instruction only; browser focus and
  // keyboard dispatch require actual React/Chrome, never a fake Element.fire.
  assert.equal(f.doc.activeElement,f.get('task-manage-toggle'),
    'production action restores focus to the management button');
  assert.equal(f.field('task-run').disabled,false);
  assert.equal(f.starts.length,0);assert.equal(f.permissions.length,0);
});

test('My task filters use the one installed list and never run or grant permissions',async t=>{
  const f=make({secondTask:true});t.after(()=>f.ui.dispose());await tick();await tick();
  f.catalogState.installed[1].enabled=false;
  f.catalogState.catalog[1].manifest.siteOrigins=['https://elsewhere.example'];
  await f.ui.refresh();
  assert.equal(f.field('task-run').disabled,false);
  const param=f.field('task-param-name');
  await f.click('task-manage-toggle');
  const visibleTaskIds=()=>f.myView.data.taskRows.rows.map(row=>row.taskId);
  await f.click('local-filter-disabled');
  assert.equal(f.field('local-filter-disabled').attributes['aria-pressed'],'true');
  assert.deepEqual(visibleTaskIds(),['demo.second']);
  assert.equal(f.field('task-run').disabled,true,
    'a hidden selected Task must not gain Run authority');
  assert.equal(f.field('task-param-name'),param,'filters retain the same live input state');
  await f.click('task-run');
  assert.equal(f.starts.length,0,'hidden selected Task cannot run');
  assert.equal(f.myView.data.taskRows.selectedId,'demo.form');
  assert.equal(visibleTaskIds().includes('demo.form'),false,
    'the selected workspace is not rendered as a visible filtered card');
  await f.click('local-filter-current');
  assert.equal(f.field('local-filter-current').attributes['aria-pressed'],'true');
  assert.deepEqual(visibleTaskIds(),['demo.form']);
  assert.equal(f.field('task-run').disabled,false);
  await f.click('local-filter-all');
  assert.equal(f.field('local-filter-all').attributes['aria-pressed'],'true');
  assert.deepEqual(visibleTaskIds(),['demo.form','demo.second']);
  assert.equal(f.starts.length,0);assert.equal(f.permissions.length,0);
});

test('opening the separate full-size catalog preserves its import and management view',async t=>{
  const f=make();t.after(()=>f.ui.dispose());await tick();await tick();
  f.ui.showCatalogPage();
  assert.equal(f.doc.documentElement.dataset.opendeskTab,'catalog');
  assert.equal(f.myView.data.runDock.taskHidden,true);
  assert.equal(f.myView.data.runDock.developHidden,true);
  assert.equal(f.myView.data.catalogRows.rows.length,1);
  f.field('task-search').value='no matches';
  f.action('taskSearchInput');
  assert.equal(f.myView.data.catalogRows.rows.length,0,'real React catalog projects empty rows');
  assert.match(f.field('task-catalog-count').text,/0 个/);
  assert.equal(f.catalogOpens.length,0,'opened full catalog cannot spawn another tab');
});

test('full-size catalog keeps its own reader after real install and re-reads the single Task Catalog state',async t=>{
  const f=make({installedInitially:false});t.after(()=>f.ui.dispose());await tick();await tick();
  f.ui.showCatalogPage();
  f.field('task-catalog-list').value='demo.form@1.0.0';
  f.action('taskCatalogListChange');
  assert.equal(f.field('task-install').disabled,true,
    'installation must wait for silent Chrome permission observation');
  await tick();await tick();
  assert.equal(f.field('task-install').disabled,false);
  await f.click('task-install');
  assert.equal(f.doc.documentElement.dataset.opendeskTab,'catalog');
  assert.equal(f.myView.data.runDock.taskHidden,true);
  assert.match(f.field('task-install-feedback').text,/已安装/);
  assert.equal(f.myView.data.taskRows.rows.length,1,'installed list re-reads original Task service');
  assert.equal(f.field('task-run').disabled,false,'eligible on its own site');
});

test('R4 idle Extensions has no fixed footer and My task search import still opens the authenticated catalog',async t=>{
  const f=make();t.after(()=>f.ui.dispose());await tick();await tick();
  await f.click('tab-tools');
  assert.equal(f.myView.data.runDock.hidden,true,'idle Extensions have no manual run dock');
  await f.click('tab-my-tasks');
  assert.equal(f.myView.data.runDock.taskHidden,true,'idle My keeps the stop-only dock hidden');
  assert.equal(f.field('task-run').disabled,false,'manual Run remains in the selected task workspace');
  await f.click('task-open-catalog');
  assert.equal(f.field('task-add-menu').hidden,false);
  assert.equal(f.catalogOpens.length,0,'Add is compact before selecting catalog');
  await f.click('task-add-catalog');
  assert.equal(f.catalogOpens.length,1,'explicit action opens authenticated catalog');
  assert.equal(f.starts.length,0);assert.equal(f.permissions.length,0);
});

test('R5 result/history stay out of sight until a task has runs',async t=>{
  const f=make();t.after(()=>f.ui.dispose());await tick();await tick();
  assert.equal(f.field('task-result-panel').hidden,true);
  assert.equal(f.field('task-history-panel').hidden,true);
  await f.click('tab-tools');
  assert.equal(f.field('task-result-panel').hidden,true);
  await f.click('tab-my-tasks');
  assert.equal(f.field('task-history-panel').hidden,true);
});

test('card view retains original action identities, history and parameter form across tab changes',async t=>{
  const f=make();t.after(()=>f.ui.dispose());await tick();await tick();
  for(const id of ['task-result','task-history','task-params-form','task-toggle','task-uninstall','task-refresh'])
    assert(f.field(id),'production My View field exists: '+id);
  const form=f.field('task-params-form'),param=f.field('task-param-name');
  const runAction=f.myView.actions.taskRunClick,stopAction=f.myView.actions.taskStopClick;
  param.value='unchanged';f.action('taskParamsFormInput');
  await f.click('tab-tools');await f.click('tab-develop');await f.click('tab-my-tasks');
  assert.equal(f.field('task-params-form'),form,'one original shared React form');
  assert.equal(f.field('task-param-name'),param);
  assert.equal(param.value,'unchanged');
  assert.equal(f.myView.actions.taskRunClick,runAction);
  assert.equal(f.myView.actions.taskStopClick,stopAction);
  assert.equal(f.myView.data.taskRows.rows.length,1);
});

test('reopening My Tasks restores independent parameter drafts without permissions or execution',async t=>{
  const values={};const draftStorage={
    get:async key=>({[key]:structuredClone(values[key])}),
    set:async next=>Object.assign(values,structuredClone(next))
  };
  const first=make({secondTask:true,draftStorage});await tick();await tick();
  first.field('task-param-name').value='First';first.action('taskParamsFormInput');
  first.myView.data.taskRows.onSelect('demo.second');
  first.field('task-param-name').value='Second';first.action('taskParamsFormInput');
  await tick();await tick();first.ui.dispose();
  const second=make({secondTask:true,draftStorage});t.after(()=>second.ui.dispose());
  await tick();await tick();
  assert.equal(second.field('task-param-name').value,'First');
  second.myView.data.taskRows.onSelect('demo.second');
  assert.equal(second.field('task-param-name').value,'Second');
  assert.equal(second.starts.length,0);assert.equal(second.permissions.length,0);
});

test('switching between two installed tasks preserves each independent unsaved parameter input',async t=>{
  const f=make({secondTask:true});t.after(()=>f.ui.dispose());await tick();await tick();
  const param=f.field('task-param-name');
  param.value='First';f.action('taskParamsFormInput');
  f.myView.data.taskRows.onSelect('demo.second');
  assert.equal(f.field('task-installed-list').value,'demo.second');
  param.value='Second';f.action('taskParamsFormInput');
  f.myView.data.taskRows.onSelect('demo.form');
  assert.equal(f.field('task-installed-list').value,'demo.form');
  assert.equal(param.value,'First');
  f.myView.data.taskRows.onSelect('demo.second');
  assert.equal(param.value,'Second');
  assert.equal(f.starts.length,0);assert.equal(f.permissions.length,0);
});

test('R4 accessible five production tabs support Arrow and Home/End',async t=>{
  const f=make();t.after(()=>f.ui.dispose());await tick();await tick();
  const {loadSidebarReact,renderSidebarReact}=await import('../helpers/sidebar-react-fixture.mjs');
  const {sidebarKeyboardDestination}=await loadSidebarReact();
  const available=[
    {key:'tasks',id:'tab-my-tasks'},{key:'tools',id:'tab-tools'},
    {key:'workflow',id:'tab-workflow'},{key:'develop',id:'tab-develop'},
    {key:'cloud',id:'tab-cloud'}];
  assert.equal(sidebarKeyboardDestination('Enter',0,available),null,
    'Enter/Space keep their native button activation');
  let index=0;
  const steps=[
    ['ArrowRight','tools'],['End','cloud'],['ArrowLeft','develop'],
    ['ArrowLeft','workflow'],['ArrowLeft','tools'],['Home','tasks'],
    ['ArrowLeft','cloud'],['ArrowRight','tasks']
  ];
  for(const [key,expected] of steps){
    const target=sidebarKeyboardDestination(key,index,available);
    assert.equal(target?.key,expected,'production keyboard handler routes '+key);
    f.ui.navigate(target.key);
    assert.equal(f.doc.documentElement.dataset.opendeskTab,expected);
    const html=await renderSidebarReact({myView:f.myView,activeTab:expected,debugEnabled:false});
    const button=html.match(new RegExp('<button[^>]*id="'+target.id+'"[^>]*>'))?.[0];
    assert(button,'real React tab renders '+target.id);
    assert.match(button,/role="tab"/);
    assert.match(button,/aria-selected="true"/);
    assert.match(button,/tabindex="0"/i);
    index=available.findIndex(row=>row.key===expected);
  }
  assert.equal(f.starts.length,0,'tab keyboard routes cannot execute code');
  // Actual event preventDefault(), roving focus and scroll remain Chrome-level checks.
});

test('R4 task selection and My management search retain React row identity; DOM focus needs Chrome',async t=>{
  const f=make({secondTask:true});t.after(()=>f.ui.dispose());await tick();await tick();
  assert.deepEqual(f.myView.data.taskRows.rows.map(row=>row.taskId),
    ['demo.form','demo.second']);
  const selected=f.myView.data.taskRows.selectedId;
  await f.ui.refresh();
  assert.equal(f.myView.data.taskRows.selectedId,selected,
    'authoritative refresh cannot discard the expanded Task selection');
  f.myView.data.taskRows.onSelect('demo.second');
  assert.equal(f.field('task-installed-list').value,'demo.second');
  await f.click('tab-my-tasks');
  await f.click('task-manage-toggle');
  f.field('local-discover-search').value='表单';
  f.action('localDiscoverSearchInput');
  assert.deepEqual(f.myView.data.taskRows.rows.map(row=>row.taskId),['demo.form']);
  f.myView.data.taskRows.onSelect('demo.form');
  assert.equal(f.field('task-installed-list').value,'demo.form');
  assert.equal(f.myView.data.taskRows.selectedId,'demo.form');
  assert.equal(f.starts.length,0,'search selection cannot execute');
  assert.equal(f.permissions.length,0);
  // React useLayoutEffect preserves focused card after rerender; verify in Chrome.
});

test('R32 visible Cloud tab selects its existing panel without execution or permission requests',async t=>{
  const f=make();t.after(()=>f.ui.dispose());await tick();await tick();
  await f.click('tab-cloud');
  assert.equal(f.doc.documentElement.dataset.opendeskTab,'cloud');
  assert.equal(f.myView.data.runDock.hidden,true,'idle Cloud cannot borrow Run');
  const {renderSidebarReact}=await import('../helpers/sidebar-react-fixture.mjs');
  const html=await renderSidebarReact({myView:f.myView,activeTab:'cloud',debugEnabled:false});
  assert.match(html,/<button[^>]+id="tab-cloud"[^>]+aria-selected="true"/);
  for(const page of ['tasks','workflow','develop','tools'])
    assert.match(html,new RegExp('id="workbench-'+page+'"[^>]*hidden=""'),
      page+' React panel stays hidden while Cloud is selected');
  assert.equal(f.starts.length,0);assert.equal(f.permissions.length,0);
  await f.click('tab-my-tasks');
  assert.equal(f.doc.documentElement.dataset.opendeskTab,'tasks');
});

test('twenty installed Task runs never request Chrome permission; revoked access stops admission',async t=>{
  const f=make();t.after(()=>f.ui.dispose());await tick();await tick();
  for(let n=0;n<20;n++){
    await f.click('task-run');
    assert.equal(f.starts.length,n+1,'each trusted React Run must reach the same RunHost exactly once');
    f.host.complete({iteration:n});
    await tick();await tick();
  }
  f.api.permissions.contains=async()=>false;
  await f.click('task-run');
  assert.equal(f.starts.length,20,'revoked access blocks admission');
  assert.equal(f.permissions.length,0,'ordinary Run cannot request new Chrome permissions');
  assert.match(f.field('task-status').text,/E_PERMISSION|恢复访问/);
});

test('R6 late run start/result cannot become the newly selected task status',async t=>{
  const f=make({secondTask:true});t.after(()=>f.ui.dispose());await tick();await tick();
  let release;
  f.api.permissions.contains=()=>new Promise(resolve=>{release=resolve;});
  f.action('taskRunClick',{isTrusted:true});
  f.myView.data.taskRows.onSelect('demo.second');
  assert.equal(f.field('task-installed-list').value,'demo.second');
  assert.match(f.field('task-status').text,/表单任务.*正在准备/);
  assert.equal(typeof release,'function');
  release(true);await tick();await tick();await tick();
  assert.equal(f.starts.length,1);
  assert.match(f.field('task-status').text,/表单任务.*正在运行/);
  assert.equal(f.field('task-stop').disabled,false,'Stop remains bound to original runId');
  f.host.complete({ok:true});await tick();await tick();await tick();
  assert.equal(f.field('task-result-panel').hidden,true,'B cannot see A result');
  assert.doesNotMatch(f.field('task-status').text,/表单任务|本次任务/);
  f.myView.data.taskRows.onSelect('demo.form');
  await tick();await tick();
  assert.match(f.field('task-result').text,/"ok": true/);
  assert.match(f.field('task-status').text,/成功/);
});

test('R6 previous-version notices and results do not leak after installed upgrade',async t=>{
  const f=make();t.after(()=>f.ui.dispose());await tick();await tick();
  await f.click('task-run');
  assert.equal(f.starts.length,1);
  f.host.complete({ok:true});await tick();await tick();await tick();
  assert.match(f.field('task-status').text,/成功/);
  f.catalogState.catalog[0].version='2.0.0';
  f.catalogState.installed[0].version='2.0.0';
  f.catalogState.installed[0].scriptId='task:demo.form:2.0.0';
  await f.ui.refresh();await tick();
  assert.equal(f.field('task-status').text,'','new installation identity has no prior run notice');
  assert.equal(f.field('task-history-panel').hidden,true);
  assert.equal(f.myView.data.taskHistory.length,0,'old-version durable results remain isolated');
});

test('two extension documents share only a refresh hint and re-read authoritative installed state',async t=>{
  const store={};
  const sidebar=make({installedInitially:false,sharedStore:store});
  const catalog=make({installedInitially:false,sharedStore:store});
  t.after(()=>{sidebar.ui.dispose();catalog.ui.dispose();});
  await tick();await tick();
  assert.equal(sidebar.myView.data.taskRows.rows.length,0);
  catalog.ui.showCatalogPage();
  catalog.field('task-catalog-list').value='demo.form@1.0.0';
  catalog.action('taskCatalogListChange');
  await tick();await tick();
  await catalog.click('task-install');
  for(let i=0;i<5;i++)await tick();
  assert.deepEqual(sidebar.myView.data.taskRows.rows.map(row=>row.taskId),['demo.form'],
    'recipient re-reads authoritative service after catalog refresh hint');
  assert.equal(sidebar.field('task-run').disabled,false);
  assert.equal(sidebar.starts.length,0);assert.equal(sidebar.permissions.length,0);
});

test('catalog installation stays in the complete directory and directs running back to Sidebar',async t=>{
  const f=make({installedInitially:false});t.after(()=>f.ui.dispose());await tick();await tick();
  f.ui.showCatalogPage();
  f.field('task-catalog-list').value='demo.form@1.0.0';
  f.action('taskCatalogListChange');await tick();await tick();
  await f.click('task-install');
  assert.equal(f.doc.documentElement.dataset.opendeskTab,'catalog');
  assert.equal(f.myView.data.runDock.taskHidden,true);
  assert.match(f.field('task-catalog-status').text,/已安装.*Sidebar「我的」/);
  assert.equal(f.starts.length,0);assert.equal(f.permissions.length,0);
});

test('compact task Add rejects Sidebar Tool packages and explains the correct import tab',async t=>{
  const f=make();t.after(()=>f.ui.dispose());await tick();await tick();
  const text=JSON.stringify({format:'opendesk.sidebar-tool.v2',id:'demo-tool',version:'1.0.0'});
  const input=f.field('task-add-file');
  input.files=[{name:'demo-tool.opendesk-tool.json',size:Buffer.byteLength(text),text:async()=>text}];
  await f.action('taskAddFileChange');
  assert.match(f.field('task-add-status').text,/扩展工具包/);
  assert.equal(f.catalogOpens.length,0,'wrong package cannot open Task Catalog');
  assert.equal(f.starts.length,0,'wrong package cannot execute');
  assert.equal(input.value,'','same file remains selectable after rejection');
});

test('catalog JS import hands source to Sidebar and never enters a view with a hidden runner',async t=>{
  const f=make();t.after(()=>f.ui.dispose());await tick();await tick();f.ui.showCatalogPage();
  const source='async function main() { return "file draft"; }';
  const file=f.field('task-package-file');
  file.value='draft.js';
  file.files=[{name:'draft.js',size:source.length,text:async()=>source}];
  await f.action('taskPackageFileChange');
  assert.deepEqual(f.draftMessages,[{protocol:'opendesk.sidebar.draft-import.v1',sourceUtf8:source}]);
  assert.equal(f.doc.documentElement.dataset.opendeskTab,'catalog');
  assert.equal(f.starts.length,0);assert.equal(f.permissions.length,0);
  assert.match(f.field('task-catalog-status').text,/未保存草稿/);
  assert.equal(file.value,'');
});

test('missing Sidebar refuses import with an actionable message, without losing the directory',async t=>{
  const f=make();t.after(()=>f.ui.dispose());await tick();await tick();f.ui.showCatalogPage();
  f.api.runtime.sendMessage=async()=>{throw Error('Receiving end does not exist');};
  const file=f.field('task-package-file');file.value='draft.js';
  file.files=[{name:'draft.js',size:1,text:async()=>'x'}];
  await f.action('taskPackageFileChange');
  assert.match(f.field('task-catalog-status').text,/同一窗口打开 Sidebar/);
  assert.equal(f.doc.documentElement.dataset.opendeskTab,'catalog');
  assert.equal(f.starts.length,0);assert.equal(file.value,'');
});

test('catalog draft transport errors retain their cause instead of claiming Sidebar is missing',async t=>{
  const f=make();t.after(()=>f.ui.dispose());await tick();await tick();f.ui.showCatalogPage();
  f.api.runtime.sendMessage=async()=>{throw Error('Extension context invalidated');};
  const file=f.field('task-package-file');file.value='draft.js';
  file.files=[{name:'draft.js',size:1,text:async()=>'x'}];
  await f.action('taskPackageFileChange');
  assert.match(f.field('task-catalog-status').text,/E_DRAFT_TRANSPORT：Extension context invalidated/);
  assert.equal(file.value,'');assert.equal(f.starts.length,0);
});

test('receiving a source-only import selects Sidebar Developer without creating a run',async t=>{
  const f=make();t.after(()=>f.ui.dispose());await tick();await tick();
  f.ui.receiveDraft('async function main() {}');
  assert.deepEqual(f.importedDrafts,['async function main() {}']);
  assert.equal(f.doc.documentElement.dataset.opendeskTab,'develop');
  assert.equal(f.starts.length,0);assert.equal(f.permissions.length,0);
});

test('R6.1 task-owned Stop is the sole cross-view action and names the launching task',async t=>{
  const f=make({secondTask:true});t.after(()=>f.ui.dispose());await tick();await tick();
  await f.click('task-run');
  assert.equal(f.myView.data.runDock.stopOnly,false,'owner view retains Run/Stop controls');
  f.myView.data.taskRows.onSelect('demo.second');
  assert.equal(f.myView.data.runDock.stopOnly,true,
    'selecting another Task cannot borrow the active owner slot');
  assert.equal(f.field('task-run').disabled,true);
  assert.match(f.field('task-stop').attributes['aria-label'],/表单任务/);
  for(const tab of ['tools','develop','cloud']){
    await f.click('tab-'+tab);
    assert.equal(f.doc.documentElement.dataset.opendeskTab,tab);
    assert.equal(f.myView.data.runDock.taskHidden,false,'owning Task Stop is available across '+tab);
    assert.equal(f.myView.data.runDock.developHidden,true);
    assert.equal(f.myView.data.runDock.stopOnly,true);
  }
  assert.equal(f.starts.length,1,'navigation never starts a second Task');
  f.host.complete({ok:true});await tick();await tick();await tick();
  assert.equal(f.myView.data.runDock.stopOnly,false,'retired owner no longer forces Stop-only');
  await f.click('tab-tools');
  assert.equal(f.myView.data.runDock.hidden,true,'idle Extensions cannot borrow Run');
});

test('R4 draft-owned run exposes only its Stop while viewing My or Extensions',async t=>{
  const f=make();t.after(()=>f.ui.dispose());await tick();await tick();
  await f.host.start({source:{kind:'draft',sourceUtf8:'return 1;'}});
  f.ui.navigate('tasks');
  assert.equal(f.myView.data.runDock.taskHidden,true);
  assert.equal(f.myView.data.runDock.developHidden,false);
  assert.equal(f.myView.data.runDock.stopOnly,true);
  f.ui.navigate('tools');
  assert.equal(f.myView.data.runDock.stopOnly,true);
  f.ui.navigate('develop');
  assert.equal(f.myView.data.runDock.stopOnly,false,'Developer owner view keeps draft actions');
  f.host.complete({ok:true});
  f.ui.navigate('tools');
  assert.equal(f.myView.data.runDock.hidden,true);
});

test('R6.1 stop-only footer CSS hides all non-owner actions without hiding Stop',async()=>{
  const css=await readFile('src/ui/tool-shell.css','utf8');
  assert.match(css,/\.workspace-dock\[data-stop-only="true"\] \.dock-buttons > :not\(#task-stop\):not\(#script-stop\):not\(#workflow-stop\)\{display:none\}/);
  assert.match(css,/\.workspace-dock\[data-stop-only="true"\] \.dock-buttons > #task-stop,/);
  assert.match(css,/#task-stop:disabled,#script-stop:disabled,#workflow-stop:disabled\{display:none\}/,
    'an unauthorized or already retired Stop must remain hidden');
});

test('catalog project JSON import validates snapshots and hands frozen bytes to Sidebar without running',async t=>{
  const f=make();t.after(()=>f.ui.dispose());await tick();await tick();f.ui.showCatalogPage();
  const draft=await programDraft(),text=JSON.stringify(draft,null,2)+'\n';
  const file=f.field('task-package-file');file.value='program.opendesk-draft.json';
  file.files=[{name:'program.opendesk-draft.json',size:Buffer.byteLength(text),text:async()=>text}];
  await f.action('taskPackageFileChange');
  assert.deepEqual(f.draftMessages,[{protocol:'opendesk.sidebar.draft-import.v1',draft}]);
  assert.equal(f.doc.documentElement.dataset.opendeskTab,'catalog');
  assert.equal(f.starts.length,0);assert.equal(f.permissions.length,0);
  assert.match(f.field('task-catalog-status').text,/未保存草稿/);
  assert.equal(file.value,'');
});

test('catalog rejects a changed project snapshot before handoff and permits reselecting the file',async t=>{
  const f=make();t.after(()=>f.ui.dispose());await tick();await tick();f.ui.showCatalogPage();
  const draft=await programDraft();draft.authoring.files[0].sourceUtf8+='\n// altered';
  const text=JSON.stringify(draft);
  const file=f.field('task-package-file');file.value='program.opendesk-draft.json';
  file.files=[{name:'program.opendesk-draft.json',size:Buffer.byteLength(text),text:async()=>text}];
  await f.action('taskPackageFileChange');
  assert.equal(f.draftMessages.length,0);assert.equal(f.starts.length,0);assert.equal(f.permissions.length,0);
  assert.match(f.field('task-catalog-status').text,/E_PROGRAM_HASH/);
  assert.equal(file.value,'');
});

test('R8 R2 task history masks sensitive values and exposes only durable technical identifiers',async t=>{
  const f=make();t.after(()=>f.ui.dispose());await tick();await tick();
  await f.click('task-run');
  f.host.complete({ok:true,apiKey:'must-not-display',description:'Bearer another-secret'});
  await tick();await tick();await tick();
  const history=f.myView.data.taskHistory[0],latest=f.field('task-result');
  assert.match(latest.text,/"ok": true/);
  assert.doesNotMatch(latest.text,/must-not-display|another-secret/);
  assert.match(history.technical,/runId：run-task-1/);
  assert.match(history.technical,/resultId：result-task-1/);
  assert.doesNotMatch(history.technical,/sourceHash：/,
    'must not invent missing source identity');
  assert.doesNotMatch(history.text,/must-not-display|another-secret/);
  assert.match(history.fullText,/must-not-display/,'full result is retained only for explicit reveal');
  const {renderSidebarReact}=await import('../helpers/sidebar-react-fixture.mjs');
  const markup=await renderSidebarReact({myView:f.myView});
  assert.match(markup,/class="task-result-reveal[^"]*"/,
    'production React renders the optional per-history reveal action');
  assert.doesNotMatch(markup,/must-not-display|another-secret/,
    'initial React render never exposes redacted secret content');
  assert.equal(f.field('task-result-reveal').hidden,false);
  f.action('taskResultRevealClick');
  assert.match(latest.text,/must-not-display/);
  f.action('taskResultRevealClick');
  assert.doesNotMatch(latest.text,/must-not-display/);
  // Per-history React useState click and focus remain real-Chrome acceptance.
});

test('R8 R2 a persisted timeout gives an actionable warning without leaking request credentials',async t=>{
  const f=make();t.after(()=>f.ui.dispose());await tick();await tick();
  f.view.runs.push({runId:'run-timeout',state:'failed',
    revision:{scriptId:'task:demo.form:1.0.0',revision:2,sourceHash:'f'.repeat(64)},
    target:{documentId:'doc-real',url:'https://a.example/search?token=should-hide'}});
  f.view.results.push({runId:'run-timeout',resultId:'result-timeout',state:'failed',
    revision:{scriptId:'task:demo.form:1.0.0',revision:2,sourceHash:'f'.repeat(64)},
    outcome:{ok:false,error:{code:'E_TIMEOUT',message:'https://a.example/search?token=should-hide failed'}}});
  await f.ui.refresh();await tick();
  const history=f.myView.data.taskHistory[0];
  assert.match(f.field('task-result').text,/E_TIMEOUT/);
  assert.match(f.field('task-result').text,/不要直接重复执行/);
  assert.doesNotMatch(f.field('task-result').text,/should-hide/);
  assert.match(history.technical,/sourceHash：f{64}/);
  assert.match(history.technical,/documentId：doc-real/);
});

test('R8 R2 an unresolved persisted run warns before an unsafe repeat',async t=>{
  const f=make();t.after(()=>f.ui.dispose());await tick();await tick();
  f.view.runs.push({runId:'run-unknown',state:'paused_unknown',
    revision:{scriptId:'task:demo.form:1.0.0'}});
  await f.ui.refresh();await tick();
  assert.match(f.field('task-result').text,/状态待确认/);
  assert.match(f.field('task-result').text,/不要直接重复执行/);
  assert.match(f.myView.data.taskHistory[0].text,/不要直接重复执行/);
});

test('R32 an in-flight task keeps its original Stop owner across Tools and Cloud navigation',async t=>{
  const f=make({secondTask:true});t.after(()=>f.ui.dispose());await tick();await tick();
  await f.click('task-run');
  f.myView.data.taskRows.onSelect('demo.second');
  for(const tab of ['tools','cloud']){
    await f.click('tab-'+tab);
    assert.equal(f.doc.documentElement.dataset.opendeskTab,tab);
    assert.equal(f.myView.data.runDock.taskHidden,false,'the original Task Stop remains visible');
    assert.equal(f.myView.data.runDock.developHidden,true);
    assert.equal(f.myView.data.runDock.stopOnly,true);
    assert.match(f.field('task-stop').attributes['aria-label'],/表单任务/);
    assert.equal(f.host.currentRun,'run-task-1','navigation cannot retire another run');
  }
  await f.click('task-stop');
  assert.deepEqual(f.stops.at(-1),{runId:'run-task-1',controller:true});
  assert.equal(f.host.currentRun,null);
  assert.equal(f.myView.data.runDock.hidden,true,'owner Stop retires after real RunHost stop');
});

test('R14.1 pending task RunHost admission cannot borrow the Developer Stop dock',async t=>{
  const f=make();t.after(()=>f.ui.dispose());await tick();await tick();
  let admit;const pending=new Promise(resolve=>{admit=resolve;});
  const start=f.host.start.bind(f.host);
  f.host.start=async request=>{const claim=await start(request);await pending;return claim;};
  await f.click('task-run');
  for(let i=0;i<10&&!f.starts.length;i++)await tick();
  assert.equal(f.starts.length,1,'original task request must reach RunHost');
  assert.equal(f.host.currentRun,'run-task-1','RunHost already claims slot');
  await f.click('tab-tools');
  assert.equal(f.myView.data.runDock.taskHidden,true,
    'Task Stop requires exact runId; admission pending cannot claim Stop');
  assert.equal(f.myView.data.runDock.developHidden,true,
    'unfinished Task start is never Developer draft');
  assert.equal(f.myView.data.runDock.hidden,true,'no unrelated Stop is available');
  admit();await tick();await tick();await tick();
  assert.equal(f.myView.data.runDock.taskHidden,false,'owning Stop appears on admission');
  assert.equal(f.myView.data.runDock.developHidden,true);
  assert.equal(f.myView.data.runDock.stopOnly,true);
  f.host.complete({ok:true});await tick();await tick();
  assert.equal(f.myView.data.runDock.hidden,true,'Stop retires on completion');
});

test('Final R2 tool navigation refusal leaves the selected pane and tab intact',async t=>{
  const f=make();t.after(()=>f.ui.dispose());await f.ui.refresh();await tick();
  let allow=false;
  f.ui.connectToolsView(visible=>visible||allow);
  await f.click('tab-tools');
  await f.click('tab-develop');
  assert.equal(f.doc.documentElement.dataset.opendeskTab,'tools',
    'dirty tool veto retains current React navigation selection');
  allow=true;await f.click('tab-develop');
  assert.equal(f.doc.documentElement.dataset.opendeskTab,'develop');
  assert.equal(f.starts.length,0);
});

test('tool editor navigation veto retains visible panel, selected tab and keyboard focus',async t=>{
  const f=make();t.after(()=>f.ui.dispose());await tick();
  f.ui.navigate('tools');
  f.get('tab-tools').focus();
  let dirty=true;
  f.ui.connectToolsView(next=>next||!dirty);
  assert.equal(f.ui.navigate('tasks'),false);
  assert.equal(f.doc.documentElement.dataset.opendeskTab,'tools');
  await f.click('tab-cloud');
  assert.equal(f.doc.documentElement.dataset.opendeskTab,'tools',
    'dirty tool veto also blocks Cloud without selecting it');
  assert.equal(f.doc.activeElement,f.get('tab-tools'),
    'rejected business navigation does not steal modeled focus');
  const {renderSidebarReact}=await import('../helpers/sidebar-react-fixture.mjs');
  const markup=await renderSidebarReact({myView:f.myView,activeTab:'tools'});
  assert.match(markup,/<button[^>]*id="tab-tools"[^>]*aria-selected="true"/);
  dirty=false;f.ui.navigate('tasks');
  assert.equal(f.doc.documentElement.dataset.opendeskTab,'tasks');
});

test('Scheduled Tasks preserves the idle stop-only dock and never borrows scheduled Run as Developer Stop',async t=>{
  const f=make();t.after(()=>f.ui.dispose());await tick();await tick();
  assert.equal(f.myView.data.runDock.taskHidden,true,'idle My has no Stop action');
  assert.equal(f.field('task-run').disabled,false,'ordinary My retains its workspace Run');
  f.ui.setScheduledSurfaceActive(true);
  assert.equal(f.myView.data.runDock.taskHidden,true);
  assert.equal(f.myView.data.runDock.hidden,true,'scheduled form hides unrelated manual Run');
  const admitted=await f.host.start({source:{kind:'saved'}});
  f.ui.setScheduledRunOwner(admitted.runId);
  f.ui.navigate('develop');
  assert.equal(f.myView.data.runDock.developHidden,true,'scheduled run is not Developer-owned');
  assert.equal(f.myView.data.runDock.workflowHidden,true,'scheduled run is not Workflow-owned');
  assert.equal(f.myView.data.runDock.hidden,true,'only the scheduled owner may Stop');
  f.host.complete(true);await f.host.completion;
  f.ui.setScheduledRunOwner(null);f.ui.setScheduledSurfaceActive(false);
  f.ui.navigate('tasks');
  assert.equal(f.myView.data.runDock.taskHidden,true,'idle dock stays hidden after scheduled Run');
  assert.equal(f.field('task-run').disabled,false,'ordinary workspace Run returns');
});

test('Workflow Task one-shot review handoff preselects exact candidate and runId but never verifies or installs',async t=>{
  const saved=new Map();
  const storage={
    async get(key){return {[key]:saved.get(key)};},
    async set(rows){for(const [key,value] of Object.entries(rows))saved.set(key,value);},
    async remove(key){saved.delete(key);}
  };
  const now=Date.now(),key=taskReviewHandoffKey(7);
  const hint=createTaskReviewHandoff({windowId:7,taskId:'demo.form',version:'1.0.0',
    sourceHash:'a'.repeat(64),manifestHash:'b'.repeat(64),
    siteOrigin:'https://a.example',runId:'run-previous-native-123',issuedAt:now});
  saved.set(key,hint);
  const f=make({installedInitially:false,draftStorage:storage});t.after(()=>f.ui.dispose());
  f.catalogState.catalog[0].stage='candidate';
  f.api.windows={getCurrent:async()=>({id:7})};
  f.ui.showCatalogPage();
  for(let i=0;i<5;i++)await tick();
  assert.equal(f.field('task-catalog-list').value,'demo.form@1.0.0');
  assert.equal(f.field('task-verify-run').value,'run-previous-native-123');
  assert.match(f.field('task-catalog-status').text,/仍需亲自核对/);
  assert.equal(f.field('task-verify').disabled,false);
  assert.equal(f.field('task-install').disabled,true);
  assert.equal(f.catalogState.catalog[0].stage,'candidate');
  assert.equal(f.catalogState.installed.length,0);
  assert.equal(f.starts.length,0);
  assert.equal(saved.has(key),false,'handoff is single-use');
});

test('Workflow Task review handoff rejects stale/wrong-hash hints without altering Task authority',async t=>{
  const key=taskReviewHandoffKey(7),store=new Map();
  const storage={async get(key){return {[key]:store.get(key)};},
    async set(value){for(const [k,v] of Object.entries(value))store.set(k,v);},
    async remove(key){store.delete(key);}};
  store.set(key,createTaskReviewHandoff({windowId:7,taskId:'demo.form',version:'1.0.0',
    sourceHash:'c'.repeat(64),manifestHash:'b'.repeat(64),
    siteOrigin:'https://a.example',runId:'run-other-version',issuedAt:Date.now()}));
  const f=make({installedInitially:false,draftStorage:storage});t.after(()=>f.ui.dispose());
  f.catalogState.catalog[0].stage='candidate';
  f.api.windows={getCurrent:async()=>({id:7})};
  f.ui.showCatalogPage();
  for(let i=0;i<5;i++)await tick();
  assert.equal(f.field('task-catalog-list').value,'');
  assert.equal(f.field('task-verify-run').value,'');
  assert.equal(f.field('task-install').disabled,true);
  assert.equal(f.catalogState.catalog[0].stage,'candidate');
  assert.equal(f.catalogState.installed.length,0);
  assert.equal(store.has(key),false);
});

// Controller-side source identity and selection races; actual React DOM is verified separately.
test('R6 Workflow handoff overrides an old directory default and clears a mismatched verification RunId',async t=>{
  const key=taskReviewHandoffKey(7),hint=createTaskReviewHandoff({windowId:7,taskId:'demo.form',
    version:'1.0.0',sourceHash:'a'.repeat(64),manifestHash:'b'.repeat(64),
    siteOrigin:'https://a.example',runId:null});
  const storage={async get(k){return {[k]:k===key?hint:undefined};},async remove(){},async set(){}};
  const f=make({installedInitially:false,secondTask:true,draftStorage:storage});
  t.after(()=>f.ui.dispose());await tick();await tick();
  f.api.windows={getCurrent:async()=>({id:7})};
  f.catalogState.catalog[0].stage='candidate';
  f.field('task-catalog-list').value='demo.second@1.0.0';
  f.field('task-verify-run').value='run-from-another-version';
  f.ui.showCatalogPage();for(let n=0;n<5;n++)await tick();
  assert.equal(f.field('task-catalog-list').value,'demo.form@1.0.0');
  assert.equal(f.field('task-verify-run').value,'');
  assert.equal(f.field('task-verify').disabled,false);
  assert.equal(f.field('task-install').disabled,true);
  assert.equal(f.starts.length,0);
});

test('R6 user selection during asynchronous handoff read is never overridden',async t=>{
  const key=taskReviewHandoffKey(7),hint=createTaskReviewHandoff({windowId:7,
    taskId:'demo.form',version:'1.0.0',sourceHash:'a'.repeat(64),manifestHash:'b'.repeat(64),
    siteOrigin:'https://a.example',runId:'run-native-previous'});
  let release;
  const storage={async get(k){if(k!==key)return {};return new Promise(resolve=>release=resolve);},
    async remove(){},async set(){}};
  const f=make({installedInitially:false,secondTask:true,draftStorage:storage});
  t.after(()=>f.ui.dispose());await tick();await tick();
  f.api.windows={getCurrent:async()=>({id:7})};
  f.ui.showCatalogPage();for(let n=0;n<3;n++)await tick();
  assert.equal(typeof release,'function');
  f.field('task-catalog-list').value='demo.second@1.0.0';
  f.action('taskCatalogListChange');
  release({[key]:hint});for(let n=0;n<4;n++)await tick();
  assert.equal(f.field('task-catalog-list').value,'demo.second@1.0.0');
  assert.equal(f.field('task-verify-run').value,'');
  assert.equal(f.starts.length,0);
});

test('R6 Task reader reveals read-only exact frozen source and typed parameters without execution',async t=>{
  const f=make({installedInitially:false});t.after(()=>f.ui.dispose());await tick();await tick();
  f.ui.showCatalogPage();await tick();
  f.field('task-catalog-list').value='demo.form@1.0.0';
  f.action('taskCatalogListChange');
  const detail=f.myView.data.catalogDetail;
  assert.equal(detail.key,'demo.form@1.0.0');
  assert.match(detail.paramsNote,/运行参数.*姓名.*必填/);
  assert.match(detail.source,/展开后从正式任务目录读取固定版本/);
  await f.action('taskCatalogSourceOpen',detail.key);
  assert.equal(detail.source,'async function main(){return true;}');
  assert.equal(detail.sourceLoaded,true);
  assert.equal(f.starts.length,0);assert.equal(f.permissions.length,0);
  assert.equal(f.catalogState.installed.length,0);
  const original=f.client.request.bind(f.client);
  f.client.request=async(method,payload)=>method==='getTaskCandidate'
    ? {manifestHash:'c'.repeat(64),package:{sourceUtf8:'async function main(){return "forged";}'}}
    : original(method,payload);
  f.action('taskCatalogListChange');
  const guarded=f.myView.data.catalogDetail;
  await f.action('taskCatalogSourceOpen',guarded.key);
  assert.match(guarded.sourceError,/E_REVIEW_IDENTITY|固定源码身份已变化/);
  assert.doesNotMatch(guarded.source,/forged/);
  assert.equal(f.starts.length,0);
});

test('R24 one installed management list opens focused actions and cancel protects installation',async t=>{
  const f=make({secondTask:true});t.after(()=>f.ui.dispose());await tick();await tick();
  const rowsBefore=f.myView.data.taskRows.rows.map(row=>row.taskId);
  await f.click('task-manage-toggle');
  assert.equal(f.field('task-manage-toggle').attributes['aria-pressed'],'true');
  assert.deepEqual(f.myView.data.taskRows.rows.map(row=>row.taskId),rowsBefore);
  assert.equal(f.myView.data.taskRows.manageMode,true);
  const {renderSidebarReact}=await import('../helpers/sidebar-react-fixture.mjs');
  const html=await renderSidebarReact({myView:f.myView});
  assert.match(html,/aria-label="管理「另一个已安装任务」"/,
    'same React list exposes focused management action');
  f.myView.data.taskRows.onManage('demo.second');
  assert.equal(f.field('task-installed-list').value,'demo.second');
  assert.equal(f.field('task-tools').open,true);
  await f.click('task-uninstall');
  assert.equal(f.field('task-uninstall-confirm').hidden,false);
  assert.equal(f.catalogState.installed.length,2,'opening review never uninstalls');
  await f.click('task-uninstall-cancel');
  assert.equal(f.field('task-uninstall-confirm').hidden,true);
  assert.equal(f.catalogState.installed.length,2,'cancel preserves installation');
  await f.click('task-manage-toggle');
  assert.equal(f.field('task-manage-toggle').attributes['aria-pressed'],'false');
  assert.equal(f.field('task-tools').open,false);
});

test('R23.37 formal Developer Task candidate hashes intent templates and visible readback into a new package',async t=>{
  const f=make();t.after(()=>f.ui.dispose());
  const source='async function main(params) { return {keyword: params.keyword}; }';
  const fields=f.developerView.fields;
  fields['script-id'].value='saved-demo-search';
  fields['script-revision'].value='4';
  fields['script-source'].value=source;
  fields['task-dev-id'].value='demo.intent-search';
  fields['task-dev-version'].value='1.0.1';
  fields['task-dev-title'].value='演示搜索和结果核对';
  fields['task-dev-description'].value='按指定关键词搜索并独立核对网页结果';
  fields['task-dev-schema'].value=JSON.stringify({
    type:'object',properties:{keyword:{type:'string',title:'搜索关键词',minLength:1,maxLength:80}},
    required:['keyword'],additionalProperties:false
  });
  fields['task-dev-intent-templates'].value='在当前演示搜索页搜索 {keyword}，并核对结果';
  fields['task-dev-intent-result-texts'].value='结果：{keyword}\n提交次数：1';
  let savedReadCount=0,importCount=0,packageFromAuthoring=null;
  f.client.controller.getControllerScript=async({scriptId,revision})=>{
    assert.equal(scriptId,'saved-demo-search');assert.equal(revision,4);savedReadCount++;
    return {sourceUtf8:source,revision};
  };
  const original=f.client.request.bind(f.client);
  f.client.request=async(method,payload)=>{
    if(method==='importTaskPackage'){
      importCount++;
      packageFromAuthoring=await verifyTaskPackage(payload.package);
      f.catalogState.catalog.push({
        taskId:packageFromAuthoring.manifest.taskId,
        version:packageFromAuthoring.manifest.version,
        manifest:packageFromAuthoring.manifest,
        manifestHash:packageFromAuthoring.manifestHash,
        stage:'candidate',installed:false
      });
      return {taskId:packageFromAuthoring.manifest.taskId,
        version:packageFromAuthoring.manifest.version};
    }
    return original(method,payload);
  };
  assert.equal(typeof f.developerView.actions['task-create-candidate'],'function');
  await f.developerView.actions['task-create-candidate']({isTrusted:true});
  assert.equal(savedReadCount,1);
  assert.equal(importCount,1);
  assert.deepEqual(packageFromAuthoring.manifest.intent,{
    templates:['在当前演示搜索页搜索 {keyword}，并核对结果'],
    resultTexts:['结果：{keyword}','提交次数：1']
  });
  assert.equal(packageFromAuthoring.manifest.program.revision,4);
  assert.equal(packageFromAuthoring.sourceUtf8,source);
  assert.equal(f.catalogState.catalog.at(-1).stage,'candidate',
    'authoring/import does not bypass Verify -> Available -> Install');
  assert.equal(f.starts.length,0);
  assert.equal(f.catalogState.installed.length,1,
    'the existing installed v1 fixture must remain unchanged');
  assert.equal(f.catalogOpens.length,1,'the original catalog review opens, not a new publisher');

  // Changing the declared parameter name may not produce an importable Task.
  fields['task-dev-version'].value='1.0.2';
  fields['task-dev-intent-templates'].value='在当前演示搜索页搜索 {undeclared}，并核对结果';
  await f.developerView.actions['task-create-candidate']({isTrusted:true});
  assert.equal(importCount,1);
  assert.match(f.field('task-status').text,/E_SCHEMA/);

  // Readback claims without a matching, hash-bound intent are forbidden.
  fields['task-dev-intent-templates'].value='';
  await f.developerView.actions['task-create-candidate']({isTrusted:true});
  assert.equal(importCount,1);
  assert.match(f.field('task-status').text,/E_SCHEMA/);
});

for(const stage of ['verified','available'])test(`runtime recovery exposes reverify but blocks stale ${stage} candidate publication, install and Run`,async t=>{
  const f=make();t.after(()=>f.ui.dispose());
  Object.assign(f.catalogState.catalog[0],{stage,runtimeCurrent:false});
  await f.ui.refresh();await tick();await tick();
  f.ui.showCatalogPage();f.action('taskCatalogSelect','demo.form@1.0.0');
  await tick();await tick();
  assert.equal(f.field('task-verify').disabled,false);
  assert.equal(f.field('task-publish').disabled,true);
  assert.equal(f.field('task-install').disabled,true);
  assert.equal(f.field('task-run').disabled,true);
  assert.match(f.myView.data.catalogRows.rows[0].state,/待重新验证/);
  const calls=[],request=f.client.request.bind(f.client);
  f.client.request=async(method,input)=>{calls.push(method);return request(method,input);};
  await f.click('task-publish');await f.click('task-install');await f.click('task-run');
  assert.deepEqual(calls,[]);
  assert.equal(f.starts.length,0);
  f.action('taskCatalogFilterClick','available');
  assert.equal(f.myView.data.catalogRows.rows.length,0);
  f.action('taskCatalogFilterClick','candidate');
  assert.equal(f.myView.data.catalogRows.rows.length,1);
});

test('runtime recovery requires fresh proof and explicit same-version reinstall before Run',async t=>{
  const f=make();t.after(()=>f.ui.dispose());
  const row=f.catalogState.catalog[0],previous={...f.catalogState.installed[0]};
  row.runtimeCurrent=false;f.catalogState.installed[0].runtimeCurrent=false;
  const calls=[],request=f.client.request.bind(f.client);
  f.client.request=async(method,input)=>{
    calls.push([method,input]);
    if(method==='verifyTaskCandidate'){
      assert.equal(input.runId,'fresh-runtime-run');
      Object.assign(row,{stage:'verified',runtimeCurrent:true});
      return {...row};
    }
    if(method==='makeTaskAvailable'){row.stage='available';return {...row};}
    if(method==='installTask'){
      const result=await request(method,input);
      // A successful explicit reinstall returns a new current installation;
      // the base harness otherwise deliberately reuses its original record.
      Object.assign(f.catalogState.installed[0],{runtimeCurrent:true,generation:previous.generation+1,
        installationId:'44444444-4444-4444-8444-444444444444'});
      return {...result,...f.catalogState.installed[0]};
    }
    return request(method,input);
  };
  await f.ui.refresh();await tick();await tick();
  f.ui.showCatalogPage();f.action('taskCatalogSelect','demo.form@1.0.0');
  await tick();await tick();
  f.field('task-verify-run').value='fresh-runtime-run';
  await f.click('task-verify');
  assert.equal(f.field('task-publish').disabled,false);
  assert.equal(f.field('task-install').disabled,true);
  assert.equal(f.field('task-run').disabled,true);
  await f.click('task-publish');
  assert.equal(f.field('task-install').disabled,false);
  assert.equal(f.field('task-install').text,'确认更新运行时安装');
  assert.equal(f.field('task-run').disabled,true,'fresh candidate proof does not repair the old installation');
  assert.equal(calls.some(([method])=>method==='installTask'),false);
  assert.equal(f.starts.length,0);
  await f.click('task-install');
  assert.deepEqual(calls.find(([method])=>method==='installTask')[1],{
    taskId:row.taskId,version:row.version,manifestHash:row.manifestHash,
    expectedInstalledVersion:previous.version,expectedGeneration:previous.generation,
    expectedInstallationId:previous.installationId});
  assert.equal(f.field('task-run').disabled,false);
  assert.equal(f.starts.length,0,'reverification and reinstall never replay a Task');
});


test('tasks.open recovery focuses disabled installations without enabling, installing or running',async t=>{
  const f=make();t.after(()=>f.ui.dispose());await f.ui.refresh();
  f.catalogState.installed[0].enabled=false;
  let authorized=0;
  assert.equal(await f.ui.openTaskReview('demo.form',{assertAuthorized:()=>{authorized++;}}),true);
  assert.equal(authorized,1);
  assert.equal(f.doc.documentElement.dataset.opendeskTab,'tasks');
  assert.equal(f.field('task-installed-list').value,'demo.form');
  assert.equal(f.field('task-run').disabled,true);
  assert.equal(f.catalogState.installed[0].enabled,false);
  assert.deepEqual(f.catalogOpens,[]);assert.deepEqual(f.starts,[]);assert.deepEqual(f.permissions,[]);
});

test('tasks.open recovery uses only the original full-page directory and validates task identity',async t=>{
  const f=make({installedInitially:false});t.after(()=>f.ui.dispose());await f.ui.refresh();
  assert.equal(await f.ui.openTaskReview('demo.form'),true);
  assert.equal(f.catalogOpens[0].url,'chrome-extension://extension/sidepanel.html?taskReviewId=demo.form');
  assert.deepEqual(f.catalogState.installed,[]);assert.deepEqual(f.starts,[]);assert.deepEqual(f.permissions,[]);
  for(const id of ['https://evil.example','../sidepanel.html','demo.form&toolId=evil','<img src=x>',null])
    await assert.rejects(f.ui.openTaskReview(id),error=>error.code==='E_SCHEMA');
  assert.equal(f.catalogOpens.length,1);
  await assert.rejects(f.ui.openTaskReview('demo.form',{assertAuthorized:()=>{throw Error('revoked');}}),/revoked/);
  assert.equal(f.catalogOpens.length,1,'revocation during refresh must prevent navigation');
});

test('full-page recovery selects latest reviewable fixed candidate and presents builtin release without runId',async t=>{
  const f=make({installedInitially:false});t.after(()=>f.ui.dispose());await f.ui.refresh();
  const base=f.catalogState.catalog[0];
  f.catalogState.catalog=[base,...[
    {version:'2.0.0',stage:'available'},
    {version:'10.0.0',stage:'available',verification:{kind:'builtin-release'},verifiedAt:1},
    {taskId:'demo.other',version:'99.0.0',stage:'available'},
    {version:'20.0.0',stage:'candidate'},
    {version:'30.0.0',stage:'available',runtimeCurrent:false}
  ].map(extra=>({...base,...extra}))];
  f.doc.location={href:'chrome-extension://extension/sidepanel.html?taskReviewId=demo.form'};
  f.ui.showCatalogPage();await tick();await tick();
  assert.equal(f.myView.data.catalogRows.selectedKey,'demo.form@10.0.0');
  assert.equal(f.doc.documentElement.dataset.opendeskTab,'catalog');
  assert.match(f.myView.data.catalogDetail.facts.find(fact=>fact.name==='来源').value,/内置发行/);
  assert.match(f.myView.data.catalogDetail.note,/无需填写本机运行 ID/);
  assert.equal(f.field('task-verify-run').value,'');
  assert.equal(f.field('task-verify').disabled,true);
  assert.equal(f.field('catalog-verification').hidden,true);
  assert.equal(f.field('task-install').disabled,false,'available builtin can use the original install review without runId');
  assert.equal(f.catalogOpens.length,0);assert.deepEqual(f.catalogState.installed,[]);
  await f.ui.openTaskReview('demo.missing');
  assert.equal(f.myView.data.catalogRows.selectedKey,'');
  assert.match(f.field('task-catalog-status').text,/E_TASK_NOT_AVAILABLE.*导入.*初始化/);
  f.action('taskCatalogSelect','demo.form@1.0.0');
  assert.equal(f.myView.data.catalogRows.selectedKey,'demo.form@1.0.0','original directory remains usable');
  assert.deepEqual(f.starts,[]);assert.deepEqual(f.permissions,[]);
});

test('full-page recovery treats hostile URL hints as invalid and preserves a choice made while loading',async t=>{
  const f=make({installedInitially:false});t.after(()=>f.ui.dispose());await f.ui.refresh();
  f.doc.location={href:'chrome-extension://extension/sidepanel.html?taskReviewId=%3Cimg%20src=x%3E'};
  f.ui.showCatalogPage();await tick();await tick();
  assert.equal(f.myView.data.catalogRows.selectedKey,'');
  assert.match(f.field('task-catalog-status').text,/任务标识无效/);
  f.doc.location.href='chrome-extension://extension/sidepanel.html?taskReviewId=demo.missing';
  f.ui.showCatalogPage();
  f.action('taskCatalogSelect','demo.form@1.0.0');
  await tick();await tick();
  assert.equal(f.myView.data.catalogRows.selectedKey,'demo.form@1.0.0');
  assert.deepEqual(f.catalogOpens,[]);assert.deepEqual(f.starts,[]);
});


test('directory refresh exposes initialization failure details and never equates ready with installed',async t=>{
  const f=make({installedInitially:false});t.after(()=>f.ui.dispose());await f.ui.refresh();
  const original=f.client.request;
  let initialization={status:'failed',code:'E_TASK_INITIALIZATION',causeCode:'E_STORAGE',
    message:'内置目录写入失败 <img src=x>',taskId:'demo.form'};
  f.client.request=async(method,args)=>{
    const response=await original(method,args);
    return method==='listTaskCatalog'?{...response,initialization}:response;
  };
  await f.ui.refresh(undefined,{skipUnchanged:true});
  assert.match(f.field('task-catalog-status').text,/E_TASK_INITIALIZATION.*E_STORAGE.*demo.form.*内置目录写入失败/);
  f.doc.location={href:'chrome-extension://extension/sidepanel.html?taskReviewId=demo.missing'};
  f.ui.showCatalogPage();await tick();await tick();
  assert.match(f.field('task-catalog-status').text,/E_TASK_NOT_AVAILABLE/);
  assert.match(f.field('task-catalog-status').text,/E_TASK_INITIALIZATION.*E_STORAGE.*demo.form/);
  assert.deepEqual(f.catalogState.installed,[]);
  initialization={status:'ready',tasks:[{taskId:'demo.form',status:'installed'}]};
  await f.ui.refresh(undefined,{skipUnchanged:true});
  assert.doesNotMatch(f.field('task-catalog-status').text,/E_TASK_INITIALIZATION|全部.*安装/);
  assert.deepEqual(f.myView.data.installedRows?.rows??[],[]);
  assert.deepEqual(f.catalogState.installed,[]);
});


test('recovery keeps pending candidates reviewable and builtin installation uses the existing permission and CAS path',async t=>{
  const f=make({installedInitially:false});t.after(()=>f.ui.dispose());await f.ui.refresh();
  f.ui.showCatalogPage();await tick();await tick();
  f.catalogState.catalog[0].stage='candidate';
  await f.ui.openTaskReview('demo.form');await tick();
  assert.equal(f.myView.data.catalogRows.selectedKey,'demo.form@1.0.0');
  assert.equal(f.field('task-install').disabled,true);
  assert.equal(f.field('catalog-verification').hidden,false);
  Object.assign(f.catalogState.catalog[0],{stage:'available',verification:{kind:'builtin-release'}});
  await f.ui.openTaskReview('demo.form');await tick();
  const request=f.client.request,installs=[];
  f.client.request=async(method,args)=>{
    if(method==='verifyTaskCandidate'||method==='makeTaskAvailable')assert.fail('builtin release needs no runId verification');
    if(method==='installTask')installs.push(structuredClone(args));
    return request(method,args);
  };
  await f.click('task-install',false);
  assert.equal(installs.length,0,'navigation never bypasses the trusted install gesture');
  await f.click('task-install');
  assert.deepEqual(installs,[{taskId:'demo.form',version:'1.0.0',manifestHash:'b'.repeat(64),
    expectedInstalledVersion:null,expectedGeneration:null,expectedInstallationId:null}]);
  assert.equal(f.catalogState.installed.length,1);
  assert.deepEqual(f.starts,[]);
});

async function sharedSheetFixture(t,{loseSaveReply=false}={}){
  const f=make();t.after(()=>f.ui.dispose());await f.ui.refresh();await tick();
  const request=f.client.request,calls=[];let preparation=null;
  f.client.request=async(method,args)=>{
    calls.push({method,args:structuredClone(args)});
    if(method==='prepareTaskRun'){
      preparation={...structuredClone(args),state:'prepared',deadlineAt:Date.now()+30000};
      if(loseSaveReply)throw {code:'E_OUTCOME_UNKNOWN',message:'save reply lost'};
      return {preparation};
    }
    if(method==='inspectTaskRun')return {preparation};
    if(method==='cancelTaskRun'){preparation={...preparation,state:'cancelled'};return {preparation};}
    return request(method,args);
  };
  const resolved=await request('resolveInstalledTask',{taskId:'demo.form'});
  const task=Object.fromEntries(['taskId','version','manifestHash','contentHash','installationId','generation'].map(key=>[key,resolved[key]]));
  let checks=0;
  assert.equal(await f.ui.openTaskRunSheet({task,binding:{appId:'webflow'},assertAuthorized:async()=>{checks++;}}),true);
  return {...f,task,calls,get preparation(){return preparation;},get checks(){return checks;}};
}

test('shared sheet opens without Run, freezes actual Schema params, confirms once through original Host',async t=>{
  const f=await sharedSheetFixture(t);
  assert.equal(f.myView.data.taskRunSheet.source,'tool');assert.equal(f.starts.length,0);
  f.field('task-param-name').value='Ada';
  f.myView.actions.taskSheetPrepareClick({isTrusted:true},f.task);
  f.myView.actions.taskSheetPrepareClick({isTrusted:true},f.task);
  await tick();await tick();
  assert.equal(f.calls.filter(x=>x.method==='prepareTaskRun').length,1);
  assert.equal(f.starts.length,0);assert.equal(f.myView.data.taskRunSheet.phase,'prepared');
  f.myView.actions.taskSheetConfirmClick({isTrusted:true},f.task);
  f.myView.actions.taskSheetConfirmClick({isTrusted:true},f.task);
  await tick();await tick();
  assert.equal(f.starts.length,1);
  assert.deepEqual(f.starts[0].params,{name:'Ada'});
  assert.equal(f.starts[0].taskPreparationId,f.preparation.preparationId);
  assert.equal(f.starts[0].requestId,f.preparation.preparationId);
  assert.deepEqual(f.starts[0].taskDelegation,{appId:'webflow'});
  assert.ok(f.checks>=3);f.host.complete({ok:true});await tick();
});

test('shared sheet lost save acknowledgement retains same identity and only queries or cancels',async t=>{
  const f=await sharedSheetFixture(t,{loseSaveReply:true});
  f.myView.actions.taskSheetPrepareClick({isTrusted:true},f.task);await tick();await tick();
  const id=f.myView.data.taskRunSheet.preparationId;
  assert.equal(f.myView.data.taskRunSheet.phase,'unknown');
  f.myView.actions.taskSheetPrepareClick({isTrusted:true},f.task);
  f.myView.actions.taskSheetConfirmClick({isTrusted:true},f.task);
  assert.equal(f.starts.length,0);assert.equal(f.calls.filter(x=>x.method==='prepareTaskRun').length,1);
  f.myView.actions.taskSheetQueryClick({isTrusted:true});await tick();await tick();
  assert.equal(f.myView.data.taskRunSheet.preparationId,id);
  assert.equal(f.myView.data.taskRunSheet.phase,'prepared');assert.equal(f.starts.length,0);
  f.myView.actions.taskSheetCancelClick({isTrusted:true});await tick();await tick();
  assert.equal(f.myView.data.taskRunSheet.phase,'cancelled');
});

test('shared sheet rejects stale document and synthetic prepare without submitting',async t=>{
  const f=await sharedSheetFixture(t);
  f.myView.actions.taskSheetPrepareClick({isTrusted:false},f.task);await tick();assert.equal(f.preparation,null);
  f.myView.actions.taskSheetPrepareClick({isTrusted:true},f.task);await tick();await tick();
  f.page.capture=()=>({...f.page.snapshot,documentId:'replacement'});
  f.myView.actions.taskSheetConfirmClick({isTrusted:true},f.task);await tick();await tick();
  assert.equal(f.starts.length,0);assert.match(f.field('task-status').text,/网页|文档|变化/);
});

for(const destination of ['closed','new task']){
  test(`My parameter discovery arriving after ${destination} preserves the current UI and draft`,async t=>{
    const f=make({secondTask:true});t.after(()=>f.ui.dispose());await tick();await tick();
    const request=f.client.request;let release;
    f.client.request=(method,args)=>method==='inspectTaskRun'
      ?new Promise(resolve=>{release=resolve;}):request(method,args);
    f.myView.actions.taskParametersOpen('demo.form',{isTrusted:true});
    const original=f.myView.data.taskRunSheet,releaseOriginal=release;
    const preparation={preparationId:'late-original',task:original.identity,params:{name:'Old server value'},state:'prepared'};
    f.action('taskSheetClose');
    if(destination==='new task'){
      f.myView.actions.taskParametersOpen('demo.second',{isTrusted:true});
      f.field('task-param-name').value='新草稿';f.action('taskParamsFormInput');
    }
    releaseOriginal({preparation});await tick();await tick();
    if(destination==='closed')assert.equal(f.myView.data.taskRunSheet,null);
    else{
      assert.equal(f.myView.data.taskRunSheet.identity.taskId,'demo.second');
      assert.equal(f.field('task-param-name').value,'新草稿');
    }
    assert.equal(f.starts.length,0);
  });
}

test('same preparation query arriving after sheet close cannot reopen it',async t=>{
  const f=await sharedSheetFixture(t);
  f.myView.actions.taskSheetPrepareClick({isTrusted:true},f.task);await tick();await tick();
  const request=f.client.request;let release;
  f.client.request=(method,args)=>method==='inspectTaskRun'
    ?new Promise(resolve=>{release=resolve;}):request(method,args);
  f.action('taskSheetQueryClick');f.action('taskSheetClose');
  release({preparation:f.preparation});await tick();await tick();
  assert.equal(f.myView.data.taskRunSheet,null);assert.equal(f.starts.length,0);
  f.myView.actions.taskParametersOpen('demo.form',{isTrusted:true});
  assert.equal(f.myView.data.taskRunSheet.preparationId,f.preparation.preparationId,'safe shared occupancy is retained');
});

test('configuration resolution requests metadata while execution keeps its original resolution',async t=>{
  const f=await sharedSheetFixture(t);
  assert.deepEqual(f.calls.find(call=>call.method==='resolveInstalledTask').args,{taskId:'demo.form',purpose:'configure'});
  f.action('taskRunClick');await tick();await tick();
  const resolutions=f.calls.filter(call=>call.method==='resolveInstalledTask');
  assert.deepEqual(resolutions.at(-1).args,{taskId:'demo.form'});
  assert.equal(f.starts.length,1);f.host.complete(true);await tick();
});

test('Panel and PC instances retain separate drafts and PC waits for its own stable Tab scope',async t=>{
  const values={},reads=[];
  const draftStorage={get:async key=>{reads.push(key);return {[key]:structuredClone(values[key])};},
    set:async next=>Object.assign(values,structuredClone(next))};
  const panel=make({draftStorage});t.after(()=>panel.ui.dispose());await tick();await tick();
  panel.field('task-param-name').value='Panel 草稿';panel.action('taskParamsFormInput');await tick();
  let resolveTab;
  const pc=make({draftStorage,appTab:()=>new Promise(resolve=>{resolveTab=resolve;})});t.after(()=>pc.ui.dispose());
  await pc.ui.refresh();await tick();
  pc.field('task-param-name').value='PC 草稿';pc.action('taskParamsFormInput');await tick();
  assert.deepEqual(Object.keys(values),['opendesk.sidebar.task-params.v1:7'],'no write before scope resolves');
  resolveTab({id:41,windowId:7});await tick();await tick();
  panel.field('task-param-name').value='Panel 最新';panel.action('taskParamsFormInput');await tick();
  const panelAgain=make({draftStorage}),pcAgain=make({draftStorage,appTab:{id:41,windowId:7}});
  t.after(()=>panelAgain.ui.dispose());t.after(()=>pcAgain.ui.dispose());await tick();await tick();
  assert.equal(panelAgain.field('task-param-name').value,'Panel 最新');
  assert.equal(pcAgain.field('task-param-name').value,'PC 草稿');
  const otherPC=make({draftStorage,appTab:{id:42,windowId:11}});t.after(()=>otherPC.ui.dispose());await tick();await tick();
  assert.equal(otherPC.field('task-param-name').value,'Alice');
  assert.equal(reads.at(-1),'opendesk.sidebar.task-params.v1:11:tab:42','scope uses its own tab/window, not target tab 9/window 7');
  otherPC.field('task-param-name').value='另一 PC';otherPC.action('taskParamsFormInput');await tick();
  assert.equal(values['opendesk.sidebar.task-params.v1:7:tab:41'][0][1].name.value,'PC 草稿');
  assert.equal(pc.starts.length+panel.starts.length+otherPC.starts.length,0);
});

test('preparation query cannot display another request identity',async t=>{
  const f=await sharedSheetFixture(t);
  f.myView.actions.taskSheetPrepareClick({isTrusted:true},f.task);await tick();await tick();
  const id=f.preparation.preparationId,request=f.client.request;
  f.client.request=(method,args)=>method==='inspectTaskRun'
    ?Promise.resolve({preparation:{...f.preparation,preparationId:'different-request',params:{name:'Wrong request'}}})
    :request(method,args);
  f.action('taskSheetQueryClick');await tick();await tick();
  assert.equal(f.myView.data.taskRunSheet.preparationId,id);
  assert.equal(f.field('task-param-name').value,'Alice');assert.equal(f.starts.length,0);
});

test('late My discovery error cannot change a newly opened sheet status',async t=>{
  const f=make({secondTask:true});t.after(()=>f.ui.dispose());await tick();await tick();
  const request=f.client.request;let rejectOriginal;
  f.client.request=(method,args)=>method==='inspectTaskRun'
    ?new Promise((resolve,reject)=>{rejectOriginal=reject;}):request(method,args);
  f.myView.actions.taskParametersOpen('demo.form',{isTrusted:true});
  const reject=rejectOriginal;
  f.action('taskSheetClose');
  f.myView.actions.taskParametersOpen('demo.second',{isTrusted:true});
  const status=f.myView.data.taskRunSheet.status;
  reject(new Error('late discovery failure'));await tick();await tick();
  assert.equal(f.myView.data.taskRunSheet.identity.taskId,'demo.second');
  assert.equal(f.myView.data.taskRunSheet.status,status);
});

for(const settled of [false,true])test(`Authority settlement is explicit (${settled}) and original records survive uninstall`,async t=>{
  const f=await sharedSheetFixture(t);
  f.myView.actions.taskSheetPrepareClick({isTrusted:true},f.task);await tick();await tick();
  const preparation=structuredClone(f.preparation),request=f.client.request;
  f.action('taskSheetClose');
  f.catalogState.installed=[];f.catalogState.catalog=[];
  f.client.request=(method,args)=>method==='inspectTaskRun'
    ?Promise.resolve({preparation,snapshot:{run:{state:'completed',retirementState:'released',runId:'original',resultId:'result'},
      slotAvailable:true,results:[{runId:'original',resultId:'result'}]},settled})
    :method==='resolveInstalledTask'?assert.fail('recovery must not resolve an uninstalled task'):request(method,args);
  assert.equal(await f.ui.openTaskRunSheet({task:f.task,preparationId:preparation.preparationId,binding:{appId:'webflow'}}),true);
  const sheet=f.myView.data.taskRunSheet;
  assert.equal(sheet.preparationId,preparation.preparationId);assert.equal(sheet.title,f.task.taskId);
  assert.deepEqual(sheet.originalParams,preparation.params);assert.equal(sheet.recoveryOnly,true);
  assert.equal(sheet.phase,settled?'settled':'prepared');
  if(settled)assert.match(sheet.status,/关闭.*新配置/);
  f.myView.actions.taskSheetConfirmClick({isTrusted:true},f.task);assert.equal(f.starts.length,0);
  f.action('taskSheetQueryClick');await tick();await tick();
  assert.equal(f.myView.data.taskRunSheet.preparationId,preparation.preparationId);
  assert.equal(f.calls.filter(call=>call.method==='prepareTaskRun').length,1);
});

test('explicit original preparation lookup fails closed on a missing or different record',async t=>{
  const f=await sharedSheetFixture(t),request=f.client.request;f.action('taskSheetClose');
  const lookups=[];
  f.client.request=(method,args)=>method==='inspectTaskRun'
    ?(lookups.push(args),Promise.resolve({preparation:null,settled:false})):request(method,args);
  await assert.rejects(f.ui.openTaskRunSheet({task:f.task,preparationId:'missing'}),{code:'E_REVISION'});
  assert.deepEqual(lookups,[{preparationId:'missing'}]);assert.equal(f.myView.data.taskRunSheet,null);
  f.client.request=(method,args)=>method==='inspectTaskRun'?Promise.resolve({preparation:{preparationId:'other',task:f.task}}):request(method,args);
  await assert.rejects(f.ui.openTaskRunSheet({task:f.task,preparationId:'missing'}),{code:'E_REVISION'});
  assert.equal(f.myView.data.taskRunSheet,null);assert.equal(f.starts.length,0);
});

for(const operation of ['prepare','cancel'])for(const outcome of ['resolve','reject']){
  test(`late ${operation} ${outcome} cannot replace or unlock a newer sheet`,async t=>{
    const f=await sharedSheetFixture(t),request=f.client.request;
    if(operation==='cancel'){f.myView.actions.taskSheetPrepareClick({isTrusted:true},f.task);await tick();await tick();}
    let release,reject;
    f.client.request=(method,args)=>method===(operation==='prepare'?'prepareTaskRun':'cancelTaskRun')
      ?new Promise((resolve,fail)=>{release=resolve;reject=fail;}):request(method,args);
    if(operation==='prepare')f.myView.actions.taskSheetPrepareClick({isTrusted:true},f.task);else f.action('taskSheetCancelClick');await tick();
    f.action('taskSheetClose');
    f.myView.actions.taskParametersOpen('demo.form',{isTrusted:true});await tick();await tick();
    const newer={...f.myView.data.taskRunSheet,status:'新实例状态',busy:true};
    f.myView.project('taskRunSheet',newer);
    if(outcome==='resolve')release({});else reject(new Error('late failure'));
    await tick();await tick();
    assert.deepEqual(f.myView.data.taskRunSheet,newer);assert.equal(f.starts.length,0);
    f.action('taskSheetClose');await f.ui.openTaskRunSheet({task:f.task});
    assert.ok(f.myView.data.taskRunSheet,'late response must not retain a stale global busy lock');
  });
}

for(const settled of [undefined,false,true])test(`settlement ${settled} does not depend on visible results or global slot`,async t=>{
  const f=await sharedSheetFixture(t);
  f.myView.actions.taskSheetPrepareClick({isTrusted:true},f.task);await tick();await tick();
  const preparation={...f.preparation,state:'submitted'},request=f.client.request;
  f.client.request=(method,args)=>method==='inspectTaskRun'?Promise.resolve({preparation,settled,
    snapshot:{run:{runId:'original',resultId:'hidden',state:'completed',retirementState:'released'},results:[],slotAvailable:false}}):request(method,args);
  f.action('taskSheetQueryClick');await tick();await tick();
  assert.equal(f.myView.data.taskRunSheet.phase,settled===true?'settled':'submitted');
  assert.equal(f.myView.data.taskRunSheet.resultText,'');
  if(settled)assert.match(f.myView.data.taskRunSheet.status,/结果当前不可见/);
  f.action('taskSheetClose');
  f.myView.actions.taskParametersOpen('demo.form',{isTrusted:true});
  assert.equal(f.myView.data.taskRunSheet.source,settled===true?'my':'tool','settled records must not occupy a fresh configuration');
  assert.equal(f.starts.length,0);
});

test('uninstalled recovery cancels only the original preparation identity',async t=>{
  const f=await sharedSheetFixture(t);
  f.myView.actions.taskSheetPrepareClick({isTrusted:true},f.task);await tick();await tick();
  const id=f.preparation.preparationId;f.action('taskSheetClose');
  f.catalogState.installed=[];f.catalogState.catalog=[];
  await f.ui.openTaskRunSheet({task:f.task,preparationId:id});
  f.action('taskSheetCancelClick');await tick();await tick();
  assert.equal(f.myView.data.taskRunSheet.preparationId,id);
  assert.equal(f.myView.data.taskRunSheet.phase,'cancelled');
  assert.deepEqual(f.calls.filter(call=>call.method==='cancelTaskRun').map(call=>call.args),[{preparationId:id}]);
  assert.equal(f.starts.length,0);
});

for(const stage of ['start failure','start receipt','final lookup receipt','final lookup failure']){
  for(const destination of ['closed','reopened'])test(`run ${stage} after sheet ${destination} cannot write a later sheet epoch`,async t=>{
    const f=await sharedSheetFixture(t);
    f.myView.actions.taskSheetPrepareClick({isTrusted:true},f.task);await tick();await tick();
    const preparation=structuredClone(f.preparation),request=f.client.request;
    const start=f.host.start.bind(f.host);
    let release,reject,lookups=0;
    const pending=new Promise((resolve,fail)=>{release=resolve;reject=fail;});
    if(stage.startsWith('start'))f.host.start=async args=>{
      await pending;return start(args);
    };
    else f.client.request=(method,args)=>{
      if(method==='inspectTaskRun'&&++lookups===2)return pending;
      return request(method,args);
    };
    f.myView.actions.taskSheetConfirmClick({isTrusted:true},f.task);await tick();await tick();
    if(!stage.startsWith('start')){
      assert.equal(f.starts.length,1);f.host.complete(true);await tick();await tick();
      assert.equal(lookups,2,'the final original-request lookup must actually be pending');
    }
    f.action('taskSheetClose');
    let newer=null;
    if(destination==='reopened'){
      f.myView.actions.taskParametersOpen('demo.form',{isTrusted:true});
      assert.equal(f.myView.data.taskRunSheet.preparationId,preparation.preparationId,
        'reopening the same preparation must still create a separate sheet epoch');
      newer={...f.myView.data.taskRunSheet,status:'新实例状态',busy:true};
      f.myView.project('taskRunSheet',newer);
    }
    if(stage.endsWith('failure'))reject({code:'E_OUTCOME_UNKNOWN',message:'late original run failure'});
    else release(stage.startsWith('start')?undefined:{preparation:{...preparation,state:'submitted'},settled:false});
    await tick();await tick();
    assert.deepEqual(f.myView.data.taskRunSheet,newer,'late run handlers must preserve the current sheet and busy state');
    if(stage==='start receipt'){
      assert.equal(f.starts.length,1);f.host.complete(true);await tick();await tick();
      assert.deepEqual(f.myView.data.taskRunSheet,newer,'completion must not overwrite the reopened preparation');
    }
    assert.equal(f.starts.length,stage==='start failure'?0:1,'no stale callback may replay execution');
  });
}
