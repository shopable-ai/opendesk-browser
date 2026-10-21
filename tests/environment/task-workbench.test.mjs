import {renderSidebarFixture} from '../helpers/sidebar-react-fixture.mjs';
import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {programDraft} from '../fixtures/program-draft.mjs';
import {createTaskWorkbench} from '../../src/ui/task-workbench.js';
import {createDeveloperView} from '../../src/ui/develop-view.js';
import {createTaskReviewHandoff} from '../../src/ui/workflow/task-review-handoff.js';
import {encodeValue} from '../../src/platform/page-port/codec.js';


// DOM/controller fakes verify UI wiring only; never label these Chrome native.
class Element {
  constructor(){this.value='';this.textContent='';this.dataset={};this.hidden=false;this.checked=false;
    this.disabled=false;this.children=[];this.listeners=new Map();this.attributes={};}
  addEventListener(name,fn){const group=this.listeners.get(name)||new Set();group.add(fn);this.listeners.set(name,group);}
  contains(node){return this===node || this.children.some(child=>child?.contains?.(node));}
  focus(){if(this.ownerDocument)this.ownerDocument.activeElement=this;}
  querySelectorAll(selector){
    const found=[];
    const walk=node=>{for(const child of node.children){
      if(selector==='.task-card' && child.className==='task-card')found.push(child);
      walk(child);
    }};
    walk(this);return found;
  }
  removeEventListener(name,fn){this.listeners.get(name)?.delete(fn);}
  fire(name,data={}){return Promise.all([...this.listeners.get(name)||[]].map(fn=>fn(data)));}
  setAttribute(name,value){this.attributes[name]=String(value);}
  append(...items){this.children.push(...items);}
  replaceChildren(...items){this.children=items;this.value=items[0]?.value??'';this.textContent='';}
  dispatchEvent(event){this.fire(event.type,event);return true;}
}
globalThis.Option=class extends Element{constructor(text,value){super();this.textContent=text;this.value=value;}};
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const html=await renderSidebarFixture();
// Diagnostic only: the Node test worker must exit after all per-test disposals.
// Keep the original assertions; report actual live resource kinds before any
// runner timeout, rather than force-closing the process or hiding a leak.
after(()=>{
  console.error('TASK_WORKBENCH_EXIT_RESOURCES='+JSON.stringify({
    activeResources:process.getActiveResourcesInfo?.()??[],
    activeHandles:process._getActiveHandles?.().map(handle=>handle.constructor?.name)??[]
  }));
});
const make=({installedInitially=true,secondTask=false,sharedStore=null,draftStorage}={})=>{
  const nodes=new Map([...html.matchAll(/id="([^"]+)"/g)].map(([,id])=>[id,new Element()]));
  const get=id=>nodes.get(id)||nodes.get('task-params-form')?.children.find(child=>child.id===id);
  const doc={getElementById:get,querySelector:()=>null,createElement:()=>{const node=new Element();node.ownerDocument=doc;return node;},documentElement:{dataset:{}},activeElement:null};
  for(const node of nodes.values())node.ownerDocument=doc;
  // This lightweight DOM fake does not parse initial attributes. Reflect the
  // real HTML collapsed state before dispatching search-toggle clicks.
  get('task-search-panel').hidden=/<div id="task-search-panel"[^>]*\shidden\b/.test(html);
  get('task-search-toggle').hidden=/<button id="task-search-toggle"[^>]*\shidden\b/.test(html);
  const programId='task:demo.form:1.0.0',hash='a'.repeat(64),manifestHash='b'.repeat(64);
  const manifest={title:'表单任务',description:'输入表单',author:'OpenDesk',source:'local',siteOrigins:['https://a.example'],
    permissions:['page.automation'],program:{sourceHash:hash},paramsSchema:{type:'object',
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
    tabs:{create:async request=>{catalogOpens.push(request);return {id:99};}}};
  // Mirror the real React Side Panel: Task Workbench receives the shared
  // Developer view rather than a legacy DOM-only candidate control.
  const developerView=createDeveloperView();
  const workbench=createTaskWorkbench({client,host,currentPageTarget:page,api,document:doc,developerView,
    importDraft:source=>importedDrafts.push(source)});
  const ui={...workbench,dispose(){workbench.dispose();developerView.dispose();}};
  // Business tests invoke exactly the actions wired to the production React
  // MyTasksPage/Dock. The old Element.fire() registry is NOT a React click.
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
  assert.match(html,/<button[^>]*class="task-card"[^>]*data-task-id="demo.form"[^>]*aria-pressed="true"[^>]*aria-expanded="true"[^>]*aria-controls="task-selected-workspace"/);
  assert.match(html,/task-card-copy[^>]*><strong>表单任务<\/strong><small>输入表单<\/small>/);
  assert.equal((html.match(/id="task-selected-workspace"/g)||[]).length,1,
    'React owns exactly one shared task workspace, not a duplicated form');
});

test('My searches a single installed task list on demand without executing or requesting permissions',async t=>{
  const f=make({secondTask:true});t.after(()=>f.ui.dispose());await tick();await tick();
  assert.deepEqual(f.myView.data.taskRows.rows.map(row=>row.taskId),['demo.form','demo.second']);
  assert.equal(f.field('task-search-panel').hidden,true,'My search is collapsed by default');
  await f.click('task-search-toggle');
  assert.equal(f.field('task-search-panel').hidden,false);
  assert.equal(f.field('task-search-toggle').attributes['aria-expanded'],'true');
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
  await f.click('task-search-toggle');
  assert.equal(f.field('task-search-panel').hidden,true);
  assert.equal(f.field('task-search-toggle').attributes['aria-expanded'],'false');
  assert.equal(f.field('local-discover-search').value,'');
  assert.equal(f.myView.data.taskRows.rows.length,2);
  await f.click('task-open-catalog');
  assert.equal(f.field('task-add-menu').hidden,false,'Add first opens inline actions');
  assert.equal(f.catalogOpens.length,0);
  await f.click('task-add-catalog');
  assert.equal(f.catalogOpens.length,1,'only explicit catalog choice opens full tab');
  assert.equal(f.catalogOpens[0].url,'chrome-extension://extension/sidepanel.html');
});

test('R5.1 Escape closes inline My search, clears filters and restores keyboard focus without Run',async t=>{
  const f=make({secondTask:true});t.after(()=>f.ui.dispose());await tick();await tick();
  await f.click('task-search-toggle');
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
  assert.equal(f.field('task-search-toggle').attributes['aria-expanded'],'false');
  assert.equal(f.field('local-discover-search').value,'');
  assert.equal(f.field('local-filter-all').attributes['aria-pressed'],'true');
  assert.equal(f.myView.data.taskRows.rows.length,2);
  // The Node fixture observes the focus instruction only; browser focus and
  // keyboard dispatch require actual React/Chrome, never a fake Element.fire.
  assert.equal(f.doc.activeElement,f.get('task-search-toggle'),
    'production action delegates the focus request to the search button');
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
  await f.click('task-search-toggle');
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
  assert.equal(f.myView.data.runDock.taskHidden,false,'My shows the legitimate Task Run dock');
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
  assert.equal(f.get('tab-my-tasks').tabIndex,0);
  assert.equal(f.get('tab-tools').tabIndex,-1);
  let prevented=false;
  f.get('tab-my-tasks').fire('keydown',{key:'ArrowRight',preventDefault(){prevented=true;}});
  assert.equal(prevented,true);
  assert.equal(f.get('workbench-tools').hidden,false);
  assert.equal(f.get('tab-tools').tabIndex,0);
  assert.equal(f.doc.activeElement,f.get('tab-tools'));
  f.get('tab-tools').fire('keydown',{key:'End',preventDefault(){}});
  assert.equal(f.get('workbench-cloud').hidden,false,'End selects Cloud, the last production tab');
  assert.equal(f.get('tab-cloud').attributes['aria-selected'],'true');
  assert.equal(f.get('tab-cloud').tabIndex,0);
  f.get('tab-cloud').fire('keydown',{key:'ArrowLeft',preventDefault(){}});
  assert.equal(f.get('workbench-cloud').hidden,true);
  assert.equal(f.get('workbench-develop').hidden,false);
  assert.equal(f.get('tab-develop').tabIndex,0);
  f.get('tab-develop').fire('keydown',{key:'ArrowLeft',preventDefault(){}});
  assert.equal(f.get('workbench-workflow').hidden,false);
  f.get('tab-workflow').fire('keydown',{key:'ArrowLeft',preventDefault(){}});
  assert.equal(f.get('workbench-tools').hidden,false);
  assert.equal(f.get('tab-tools').tabIndex,0);
  f.get('tab-tools').fire('keydown',{key:'Home',preventDefault(){}});
  assert.equal(f.get('workbench-tasks').hidden,false);
  assert.equal(f.get('tab-my-tasks').tabIndex,0);
});
test('R4 task selection and My search handoff retain focus restore focus',async t=>{
  const f=make({secondTask:true});t.after(()=>f.ui.dispose());await tick();await tick();
  const before=f.get('task-installed-cards').children[0].children[0];
  before.focus();await f.ui.refresh();
  const next=f.get('task-installed-cards').children[0].children[0];
  assert.notEqual(before,next);assert.equal(f.doc.activeElement,next);
  const second=f.get('task-installed-cards').children[1].children[0];
  second.focus();second.fire('click');
  assert.equal(f.get('task-installed-list').value,'demo.second');
  assert.equal(f.doc.activeElement,f.get('task-installed-cards').children[1].children[0]);
  await f.click('tab-my-tasks');
  await f.click('task-search-toggle');
  f.get('local-discover-search').value='表单';
  f.get('local-discover-search').fire('input');
  const first=f.get('task-installed-cards').children[0].children[0];
  first.focus();first.fire('click');
  assert.equal(f.doc.activeElement,f.get('task-installed-cards').children[0].children[0]);
  assert.equal(f.starts.length,0);
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
  assert.equal(f.get('workbench-develop').hidden,false);assert.equal(f.starts.length,0);
  assert.equal(f.permissions.length,0);
});

test('R6.1 task-owned Stop is the sole cross-view action and names the launching task',async t=>{
  const f=make({secondTask:true});t.after(()=>f.ui.dispose());await tick();await tick();
  await f.click('task-run');
  assert.equal(f.get('workspace-dock').dataset.stopOnly,'false','the owning task view retains its controls');
  f.get('task-installed-cards').children[1].children[0].fire('click');
  assert.equal(f.get('workspace-dock').dataset.stopOnly,'true','a different selected task cannot own Run actions');
  assert.equal(f.get('task-run').disabled,true);
  assert.match(f.get('task-stop').attributes['aria-label'],/表单任务/,'Stop names the real launch owner, not selected B');
  await f.click('tab-tools');
  assert.equal(f.get('task-dock').hidden,false);
  assert.equal(f.get('develop-dock').hidden,true);
  assert.equal(f.get('workspace-dock').dataset.stopOnly,'true');
  await f.click('tab-develop');
  assert.equal(f.get('task-dock').hidden,false);
  assert.equal(f.get('workspace-dock').dataset.stopOnly,'true');
  await f.click('tab-cloud');
  assert.equal(f.get('workbench-cloud').hidden,false);
  assert.equal(f.get('task-dock').hidden,false);
  assert.equal(f.get('workspace-dock').dataset.stopOnly,'true');
  assert.equal(f.starts.length,1,'Cloud navigation never restarts the owning Task');
  f.host.complete({ok:true});await tick();await tick();await tick();
  assert.equal(f.get('workspace-dock').dataset.stopOnly,'false','stop-only mode retires with the owning run');
  await f.click('tab-tools');
  assert.equal(f.get('workspace-dock').hidden,true,'idle Extensions remain free of borrowed Run actions');
});

test('R4 draft-owned run exposes only its Stop while viewing My or Extensions',async t=>{
  const f=make();t.after(()=>f.ui.dispose());await tick();await tick();
  await f.host.start({source:{kind:'draft',sourceUtf8:'return 1;'}});
  f.ui.navigate('tasks');
  assert.equal(f.get('task-dock').hidden,true);
  assert.equal(f.get('develop-dock').hidden,false);
  assert.equal(f.get('workspace-dock').dataset.stopOnly,'true');
  f.ui.navigate('tools');
  assert.equal(f.get('workspace-dock').dataset.stopOnly,'true');
  f.ui.navigate('develop');
  assert.equal(f.get('workspace-dock').dataset.stopOnly,'false','owner view retains saved-version actions');
  f.host.complete({ok:true});
  f.ui.navigate('tools');
  assert.equal(f.get('workspace-dock').hidden,true);
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
  f.get('task-package-file').value='program.opendesk-draft.json';
  f.get('task-package-file').files=[{name:'program.opendesk-draft.json',size:Buffer.byteLength(text),text:async()=>text}];
  await f.get('task-package-file').fire('change');
  assert.deepEqual(f.draftMessages,[{protocol:'opendesk.sidebar.draft-import.v1',draft}]);
  assert.equal(f.get('workbench-develop').hidden,true);
  assert.equal(f.starts.length,0);assert.equal(f.permissions.length,0);
  assert.match(f.get('task-catalog-status').textContent,/未保存草稿/);
  assert.equal(f.get('task-package-file').value,'');
});

test('catalog rejects a changed project snapshot before handoff and permits reselecting the file',async t=>{
  const f=make();t.after(()=>f.ui.dispose());await tick();await tick();f.ui.showCatalogPage();
  const draft=await programDraft();draft.authoring.files[0].sourceUtf8+='\n// altered';
  const text=JSON.stringify(draft);
  f.get('task-package-file').value='program.opendesk-draft.json';
  f.get('task-package-file').files=[{name:'program.opendesk-draft.json',size:Buffer.byteLength(text),text:async()=>text}];
  await f.get('task-package-file').fire('change');
  assert.equal(f.draftMessages.length,0);assert.equal(f.starts.length,0);assert.equal(f.permissions.length,0);
  assert.match(f.get('task-catalog-status').textContent,/E_PROGRAM_HASH/);
  assert.equal(f.get('task-package-file').value,'');
});


test('R8 R2 task history masks sensitive values and exposes only durable technical identifiers',async t=>{
  const f=make();t.after(()=>f.ui.dispose());await tick();await tick();
  await f.click('task-run');
  f.host.complete({ok:true,apiKey:'must-not-display',description:'Bearer another-secret'});
  await tick();await tick();await tick();
  const history=f.get('task-history').children[0].children[0];
  assert.match(f.get('task-result').textContent,/"ok": true/);
  assert.doesNotMatch(f.get('task-result').textContent,/must-not-display|another-secret/);
  const technical=history.children.find(node=>String(node.className||'').split(' ').includes('task-history-tech'));
  assert.ok(technical,'technical details remain available after optional privacy reveal');
  assert.match(technical.children[1].textContent,/runId：run-task-1/);
  assert.match(technical.children[1].textContent,/resultId：result-task-1/);
  assert.doesNotMatch(technical.children[1].textContent,/sourceHash：/,
    'do not invent a sourceHash missing from the durable test fixture');
  const reveal=history.children.find(node=>node.className==='task-result-reveal');
  assert.ok(reveal,'explicit reveal action appears for redacted values');
  assert.doesNotMatch(history.children[1].textContent,/must-not-display/);
  await reveal.fire('click');
  assert.match(history.children[1].textContent,/must-not-display/);
  await reveal.fire('click');
  assert.doesNotMatch(history.children[1].textContent,/must-not-display/);
  assert.equal(f.get('task-result-reveal').hidden,false);
  await f.get('task-result-reveal').fire('click');
  assert.match(f.get('task-result').textContent,/must-not-display/);
  await f.get('task-result-reveal').fire('click');
  assert.doesNotMatch(f.get('task-result').textContent,/must-not-display/);
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
  const history=f.get('task-history').children[0].children[0];
  assert.match(f.get('task-result').textContent,/E_TIMEOUT/);
  assert.match(f.get('task-result').textContent,/不要直接重复执行/);
  assert.doesNotMatch(f.get('task-result').textContent,/should-hide/);
  assert.match(history.children[2].children[1].textContent,/sourceHash：f{64}/);
  assert.match(history.children[2].children[1].textContent,/documentId：doc-real/);
});

test('R8 R2 an unresolved persisted run warns before an unsafe repeat',async t=>{
  const f=make();t.after(()=>f.ui.dispose());await tick();await tick();
  f.view.runs.push({runId:'run-unknown',state:'paused_unknown',
    revision:{scriptId:'task:demo.form:1.0.0'}});
  await f.ui.refresh();await tick();
  assert.match(f.get('task-result').textContent,/状态待确认/);
  assert.match(f.get('task-result').textContent,/不要直接重复执行/);
  const history=f.get('task-history').children[0].children[0];
  assert.match(history.children[1].textContent,/不要直接重复执行/);
});


test('R32 an in-flight task keeps its original Stop owner across Tools and Cloud navigation',async t=>{
  const f=make({secondTask:true});t.after(()=>f.ui.dispose());await tick();await tick();
  await f.click('task-run');
  f.get('task-installed-cards').children[1].children[0].fire('click');
  await f.click('tab-tools');
  assert.equal(f.get('workbench-tools').hidden,false);
  assert.equal(f.get('task-dock').hidden,false,'the original task Stop stays available in Tools');
  assert.equal(f.get('develop-dock').hidden,true);
  assert.equal(f.get('workspace-dock').dataset.stopOnly,'true','no unrelated Run is exposed');
  assert.match(f.get('task-stop').attributes['aria-label'],/表单任务/);
  assert.equal(f.host.currentRun,'run-task-1','navigation never stops the RunHost');
  await f.click('tab-cloud');
  assert.equal(f.get('workbench-cloud').hidden,false);
  assert.equal(f.get('task-dock').hidden,false,'Cloud retains the original task Stop');
  assert.equal(f.get('develop-dock').hidden,true);
  assert.equal(f.get('workspace-dock').dataset.stopOnly,'true');
  assert.equal(f.host.currentRun,'run-task-1','Cloud cannot replace the run owner');
  await f.click('task-stop');
  assert.deepEqual(f.stops.at(-1),{runId:'run-task-1',controller:true});
  assert.equal(f.host.currentRun,null);
  assert.equal(f.get('workspace-dock').hidden,true,'stop-only dock retires after original run stops');
});

test('R14.1 pending task RunHost admission cannot borrow the Developer Stop dock',async t=>{
  const f=make();t.after(()=>f.ui.dispose());await tick();await tick();
  let admit;const pending=new Promise(resolve=>{admit=resolve;});
  const start=f.host.start.bind(f.host);
  f.host.start=async request=>{const claim=await start(request);await pending;return claim;};
  await f.click('task-run');
  for(let i=0;i<10&&!f.starts.length;i++)await tick();
  assert.equal(f.starts.length,1,'the original task request reached RunHost');
  assert.equal(f.host.currentRun,'run-task-1','RunHost already has a run before the claim returns');
  await f.click('tab-tools');
  assert.equal(f.get('task-dock').hidden,true,'task Stop requires its actual claimed runId');
  assert.equal(f.get('develop-dock').hidden,true,'unfinished task start is never a Developer draft');
  assert.equal(f.get('workspace-dock').hidden,true,'there is no unrelated Stop action');
  admit();await tick();await tick();await tick();
  assert.equal(f.get('task-dock').hidden,false,'the owning Stop appears on successful admission');
  assert.equal(f.get('develop-dock').hidden,true);
  assert.equal(f.get('workspace-dock').dataset.stopOnly,'true');
  f.host.complete({ok:true});await tick();await tick();
  assert.equal(f.get('workspace-dock').hidden,true,'the cross-view Stop retires at completion');
});

test('Final R2 tool navigation refusal leaves the selected pane and tab intact',async t=>{
  const f=make();t.after(()=>f.ui.dispose());await f.ui.refresh();await tick();
  let allow=false;
  f.ui.connectToolsView(visible=>visible||allow);
  await f.click('tab-tools');
  await f.click('tab-develop');
  assert.equal(f.get('workbench-tools').hidden,false);
  assert.equal(f.get('workbench-develop').hidden,true);
  assert.equal(f.get('tab-tools').attributes['aria-selected'],'true');
  allow=true;await f.click('tab-develop');
  assert.equal(f.get('workbench-tools').hidden,true);
  assert.equal(f.get('workbench-develop').hidden,false);
});

test('tool editor navigation veto retains visible panel, selected tab and keyboard focus',async t=>{
  const f=make();t.after(()=>f.ui.dispose());await tick();
  f.ui.navigate('tools');f.get('tab-tools').focus();
  let dirty=true;f.ui.connectToolsView(next=>next||!dirty);
  assert.equal(f.ui.navigate('tasks'),false);
  assert.equal(f.doc.documentElement.dataset.opendeskTab,'tools');
  assert.equal(f.get('workbench-tools').hidden,false);
  await f.click('tab-cloud');
  assert.equal(f.get('workbench-cloud').hidden,true,'dirty tool veto also applies to Cloud');
  assert.equal(f.doc.documentElement.dataset.opendeskTab,'tools');
  await f.get('tab-tools').fire('keydown',{key:'Home',preventDefault(){}});
  assert.equal(f.doc.activeElement,f.get('tab-tools'));
  assert.equal(f.get('tab-tools').attributes['aria-selected'],'true');
  dirty=false;f.ui.navigate('tasks');
  assert.equal(f.get('workbench-tools').hidden,true);
  assert.equal(f.doc.documentElement.dataset.opendeskTab,'tasks');
});

test('Scheduled Tasks hides idle manual Run dock and never borrows scheduled Run as Developer Stop',async t=>{
  const f=make();t.after(()=>f.ui.dispose());await tick();await tick();
  assert.equal(f.get('task-dock').hidden,false,'ordinary My remains unchanged');
  f.ui.setScheduledSurfaceActive(true);
  assert.equal(f.get('task-dock').hidden,true,'scheduled form must not display unrelated manual Run');
  assert.equal(f.get('workspace-dock').hidden,true,'no empty fixed action bar on scheduled plans');
  const admitted=await f.host.start({source:{kind:'saved'}});
  f.ui.setScheduledRunOwner(admitted.runId);
  f.ui.navigate('develop');
  assert.equal(f.get('develop-dock').hidden,true,'scheduled run is not a developer draft');
  assert.equal(f.get('workflow-dock').hidden,true,'scheduled run is not a workflow');
  assert.equal(f.get('workspace-dock').hidden,true,'only scheduled owner Stop may control its Run');
  f.host.complete(true);await f.host.completion;
  f.ui.setScheduledRunOwner(null);f.ui.setScheduledSurfaceActive(false);
  f.ui.navigate('tasks');
  assert.equal(f.get('task-dock').hidden,false,'ordinary My Run dock is restored');
});

test('Workflow Task one-shot review handoff preselects exact candidate and runId but never verifies or installs',async t=>{
  const {createTaskReviewHandoff,taskReviewHandoffKey}=await import('../../src/ui/workflow/task-review-handoff.js');
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
  const f=make({installedInitially:false,draftStorage:storage});
  t.after(()=>f.ui.dispose());
  f.catalogState.catalog[0].stage='candidate';
  f.api.windows={getCurrent:async()=>({id:7})};
  f.ui.showCatalogPage();
  for(let i=0;i<5;i++)await tick();
  assert.equal(f.get('task-catalog-list').value,'demo.form@1.0.0');
  assert.equal(f.get('task-verify-run').value,'run-previous-native-123');
  assert.match(f.get('task-catalog-status').textContent,/仍需亲自核对/);
  assert.equal(f.get('task-verify').disabled,false);
  assert.equal(f.get('task-install').disabled,true);
  assert.equal(f.catalogState.catalog[0].stage,'candidate');
  assert.equal(f.catalogState.installed.length,0);
  assert.equal(f.starts.length,0);
  assert.equal(saved.has(key),false,'handoff must be single-use');
});

test('Workflow Task review handoff rejects stale/wrong-hash hints without altering Task authority',async t=>{
  const {createTaskReviewHandoff,taskReviewHandoffKey}=await import('../../src/ui/workflow/task-review-handoff.js');
  const key=taskReviewHandoffKey(7),store=new Map();
  const storage={async get(key){return {[key]:store.get(key)};},
    async set(value){for(const [k,v] of Object.entries(value))store.set(k,v);},
    async remove(key){store.delete(key);}};
  store.set(key,createTaskReviewHandoff({windowId:7,taskId:'demo.form',version:'1.0.0',
    sourceHash:'c'.repeat(64),manifestHash:'b'.repeat(64),
    siteOrigin:'https://a.example',runId:'run-other-version',issuedAt:Date.now()}));
  const f=make({installedInitially:false,draftStorage:storage});
  t.after(()=>f.ui.dispose());
  f.catalogState.catalog[0].stage='candidate';
  f.api.windows={getCurrent:async()=>({id:7})};
  f.ui.showCatalogPage();
  for(let i=0;i<5;i++)await tick();
  assert.equal(f.get('task-catalog-list').value,'');
  assert.equal(f.get('task-verify-run').value,'');
  assert.equal(f.get('task-install').disabled,true);
  assert.equal(f.catalogState.catalog[0].stage,'candidate');
  assert.equal(f.catalogState.installed.length,0);
  assert.equal(store.has(key),false);
});


// R6 exercises the existing DOM/Authority doubles, never a Chrome native assertion.
test('R6 Workflow handoff overrides an old directory default and clears a mismatched verification RunId',async t=>{
  const {taskReviewHandoffKey}=await import('../../src/ui/workflow/task-review-handoff.js');
  const key=taskReviewHandoffKey(7),hint=createTaskReviewHandoff({windowId:7,taskId:'demo.form',
    version:'1.0.0',sourceHash:'a'.repeat(64),manifestHash:'b'.repeat(64),
    siteOrigin:'https://a.example',runId:null});
  const storage={async get(k){return {[k]:k===key?hint:undefined};},async remove(){},async set(){}};
  const f=make({installedInitially:false,secondTask:true,draftStorage:storage});
  t.after(()=>f.ui.dispose());await tick();await tick();
  f.api.windows={getCurrent:async()=>({id:7})};
  f.catalogState.catalog[0].stage='candidate';
  f.get('task-catalog-list').value='demo.second@1.0.0'; // Prior selection, no new user choice.
  f.get('task-verify-run').value='run-from-another-version';
  f.ui.showCatalogPage();for(let n=0;n<5;n++)await tick();
  assert.equal(f.get('task-catalog-list').value,'demo.form@1.0.0');
  assert.equal(f.get('task-verify-run').value,'');
  assert.equal(f.get('task-verify').disabled,false);
  assert.equal(f.get('task-install').disabled,true);
  assert.equal(f.starts.length,0);
});

test('R6 user selection during asynchronous handoff read is never overridden',async t=>{
  const {taskReviewHandoffKey}=await import('../../src/ui/workflow/task-review-handoff.js');
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
  f.get('task-catalog-list').value='demo.second@1.0.0';
  f.get('task-catalog-list').fire('change');
  release({[key]:hint});for(let n=0;n<4;n++)await tick();
  assert.equal(f.get('task-catalog-list').value,'demo.second@1.0.0');
  assert.equal(f.get('task-verify-run').value,'');
  assert.equal(f.starts.length,0);
});

test('R6 Task reader reveals read-only exact frozen source and typed parameters without execution',async t=>{
  const f=make({installedInitially:false});t.after(()=>f.ui.dispose());await tick();await tick();
  f.ui.showCatalogPage();await tick();
  f.get('task-catalog-list').value='demo.form@1.0.0';
  f.get('task-catalog-list').fire('change');
  const reader=f.get('task-catalog-detail');
  const details=reader.children.find(node=>String(node.className||'').split(' ').includes('catalog-source-review'));
  assert.ok(details);
  assert.match(reader.children.find(node=>node.className==='catalog-reader-note').textContent,
    /运行参数.*姓名.*必填/);
  details.open=true;await details.fire('toggle');await tick();await tick();
  assert.equal(details.children[1].textContent,'async function main(){return true;}');
  assert.equal(f.starts.length,0);assert.equal(f.permissions.length,0);
  assert.equal(f.catalogState.installed.length,0);
  // Reject an inconsistent Task Service identity even when its payload includes code.
  const original=f.client.request.bind(f.client);
  f.client.request=async(method,payload)=>method==='getTaskCandidate'
    ? {manifestHash:'c'.repeat(64),package:{sourceUtf8:'async function main(){return "forged";}'}}
    : original(method,payload);
  f.get('task-catalog-list').fire('change');
  const guarded=f.get('task-catalog-detail').children.find(node=>String(node.className||'').split(' ').includes('catalog-source-review'));
  guarded.open=true;await guarded.fire('toggle');await tick();await tick();
  assert.match(guarded.children[1].textContent,/E_REVIEW_IDENTITY|固定源码身份已变化/);
  assert.doesNotMatch(guarded.children[1].textContent,/forged/);
  assert.equal(f.starts.length,0);
});

test('R24 one installed management list opens focused actions and cancel protects installation',async t=>{
  const f=make({secondTask:true});t.after(()=>f.ui.dispose());
  await tick();await tick();
  const countBefore=f.get('task-installed-cards').children.length;
  await f.click('task-manage-toggle');
  assert.equal(f.get('task-manage-toggle').attributes['aria-pressed'],'true');
  assert.equal(f.get('task-installed-cards').children.length,countBefore,
    'management reuses the installed list, not a second catalog');
  const second=f.get('task-installed-cards').children[1];
  assert.ok(second.children[1],'per-task manage action must be visible');
  second.children[1].fire('click');
  assert.equal(f.get('task-installed-list').value,'demo.second');
  assert.equal(f.get('task-tools').open,true);
  await f.click('task-uninstall');
  assert.equal(f.get('task-uninstall-confirm').hidden,false,
    'uninstall first requires explicit review');
  assert.equal(f.catalogState.installed.length,2,'open review cannot uninstall');
  await f.click('task-uninstall-cancel');
  assert.equal(f.get('task-uninstall-confirm').hidden,true);
  assert.equal(f.catalogState.installed.length,2,'cancel never changes installed records');
  await f.click('task-manage-toggle');
  assert.equal(f.get('task-manage-toggle').attributes['aria-pressed'],'false');
  assert.equal(f.get('task-tools').open,false);
});
