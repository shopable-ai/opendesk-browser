import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createTaskWorkbench} from '../../src/ui/task-workbench.js';
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
  fire(name,data={}){for(const fn of this.listeners.get(name)||[])fn(data);}
  setAttribute(name,value){this.attributes[name]=String(value);}
  append(...items){this.children.push(...items);}
  replaceChildren(...items){this.children=items;this.value=items[0]?.value??'';this.textContent='';}
  dispatchEvent(event){this.fire(event.type,event);return true;}
}
globalThis.Option=class extends Element{constructor(text,value){super();this.textContent=text;this.value=value;}};
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const html=await readFile('src/ui/tool.html','utf8');
const make=({installedInitially=true,secondTask=false,sharedStore=null}={})=>{
  const nodes=new Map([...html.matchAll(/id="([^"]+)"/g)].map(([,id])=>[id,new Element()]));
  const get=id=>nodes.get(id)||nodes.get('task-params-form')?.children.find(child=>child.id===id);
  const doc={getElementById:get,createElement:()=>{const node=new Element();node.ownerDocument=doc;return node;},documentElement:{dataset:{}},activeElement:null};
  for(const node of nodes.values())node.ownerDocument=doc;
  const programId='task:demo.form:1.0.0',hash='a'.repeat(64),manifestHash='b'.repeat(64);
  const manifest={title:'表单任务',description:'输入表单',author:'OpenDesk',source:'local',siteOrigins:['https://a.example'],
    permissions:['page.automation'],program:{sourceHash:hash},paramsSchema:{type:'object',
      properties:{name:{type:'string',title:'姓名',minLength:1,maxLength:30,default:'Alice'}},required:['name'],additionalProperties:false}};
  const row={taskId:'demo.form',version:'1.0.0',manifest,manifestHash,stage:'available',installed:installedInitially,enabled:true};
  const installed={taskId:row.taskId,version:row.version,scriptId:programId,manifestHash,enabled:true};
  const other=secondTask?{...row,taskId:'demo.second',
    manifest:{...manifest,title:'另一个已安装任务',description:'演示切换时保留各自输入'}}:null;
  const otherInstalled=secondTask?{...installed,taskId:'demo.second',scriptId:'task:demo.second:1.0.0'}:null;
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
        revision:1,contentHash:hash,manifestHash,manifest};
      if(method==='getTaskCandidate')return {package:{sourceUtf8:'async function main(){return true;}'}};
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
  const api={permissions:{request:value=>{permissions.push(value);return Promise.resolve(true);}},
    runtime:{getURL:path=>'chrome-extension://extension/'+path,sendMessage:async message=>{draftMessages.push(message);return {ok:true};}},
    tabs:{create:async request=>{catalogOpens.push(request);return {id:99};}}};
  const ui=createTaskWorkbench({client,host,currentPageTarget:page,api,document:doc,importDraft:source=>importedDrafts.push(source)});
  return {ui,get,doc,page,host,view,starts,permissions,stops,catalogOpens,draftMessages,importedDrafts,api,catalogState,
    click:async(id,trusted=true)=>{get(id).fire('click',{isTrusted:trusted});await tick();await tick();}};
};

test('entering Sidebar task views reads external installations without executing and preserves unchanged form inputs',async t=>{
  const f=make();t.after(()=>f.ui.dispose());
  const installed=f.catalogState.installed.pop();
  await tick();await tick();
  assert.equal(f.get('task-installed-cards').children.length,2);
  assert.equal(f.get('task-installed-cards').children[1],f.get('task-selected-workspace'));
  assert.equal(f.get('task-selected-workspace').hidden,true);
  assert.match(f.get('task-installed-cards').children[0].textContent,/发现.*导入/);
  assert.equal(f.get('task-installed-detail').textContent,'','empty task scope stays compact under R5');
  assert.equal(f.get('task-run').disabled,true);
  f.catalogState.installed.push(installed);
  await f.click('tab-my-tasks');
  assert.equal(f.get('task-run').disabled,false);
  const input=f.get('task-param-name');
  input.value='Preserved native input';
  await f.click('tab-discover');
  assert.equal(f.get('local-discover-cards').children.length,1);
  await f.click('tab-my-tasks');
  assert.equal(f.get('task-param-name'),input,'unchanged catalog must not replace the editable form');
  assert.equal(input.value,'Preserved native input');
  assert.equal(f.starts.length,0);assert.equal(f.permissions.length,0);
  f.catalogState.installed=[];
  await f.click('tab-discover');
  assert.equal(f.get('local-discover-cards').children.length,1);
  assert.match(f.get('local-discover-cards').children[0].textContent,/还没有任务/);
});

test('installed tasks default page, render schema form and freeze the exact saved version/params/target',async t=>{
  const f=make();t.after(()=>f.ui.dispose());await tick();await tick();
  assert.equal(f.get('workbench-tasks').hidden,false);
  assert.equal(f.get('workbench-develop').hidden,true);
  assert.equal(f.get('task-run').disabled,false);
  const input=f.get('task-params-form').children.find(node=>node.dataset?.taskParam==='name');
  assert(input);input.value='Bob';
  await f.click('task-run',false);assert.equal(f.starts.length,0,'untrusted clicks cannot start');
  await f.click('task-run');
  assert.equal(f.permissions.length,1);assert.equal(f.starts.length,1);
  assert.deepEqual(f.starts[0].source,{kind:'saved',scriptId:'task:demo.form:1.0.0',revision:1,
    contentHash:'a'.repeat(64)});
  assert.deepEqual(f.starts[0].params,{name:'Bob'});
  assert.deepEqual(f.starts[0].target,{mode:'borrowed',tabId:9,frameId:0,documentId:'doc-9',
    expectedUrl:'https://a.example/',expectedWindowId:7});
  await f.click('tab-discover');
  assert.equal(f.get('workbench-local-discover').hidden,false,'Sidebar Discover must show installed local tasks');
  assert.equal(f.get('workbench-discover').hidden,true,'full catalog must not occupy the Side Panel');
  assert.equal(f.catalogOpens.length,0,'Sidebar Discover must not open a marketplace tab');
  assert.equal(f.get('local-discover-cards').children.length,1,'matching installed task is discoverable');
  assert.equal(f.get('task-dock').hidden,false,'task-owned Stop remains accessible in Discover');
  assert.equal(f.get('develop-dock').hidden,true,'Discover must not expose a second runner');
  await f.click('tab-develop');
  assert.equal(f.get('workbench-develop').hidden,false);
  assert.equal(f.get('task-dock').hidden,false,'task-owned Stop remains accessible in Developer');
  assert.equal(f.get('develop-dock').hidden,true,'an unrelated draft cannot take over the task dock');
  assert.equal(f.host.currentRun,'run-task-1','switching Sidebar views must never retire RunHost');
  f.host.complete({ok:true});await tick();await tick();
  assert.match(f.get('task-result').textContent,/"ok": true/);
  const latest=f.get('task-history').children[0].children[0];
  assert.match(latest.children[0].textContent,/成功/);
  assert.doesNotMatch(latest.children[0].textContent,/run-task-1/,'ordinary history line hides internal IDs');
  assert.match(latest.children[2].children[1].textContent,/run-task-1/,'advanced record retains exact identity');
  await f.click('tab-discover');
  assert.equal(f.get('task-dock').hidden,true,'idle Discover should not show a Run dock');
});

test('installed task can be explicitly forked into an independent unsaved editor draft',async t=>{
  const f=make();t.after(()=>f.ui.dispose());await tick();await tick();
  await f.click('task-fork-draft');
  assert.equal(f.get('workbench-develop').hidden,false);
  assert.match(f.get('script-id').value,/^draft-demo\.form-/);
  assert.equal(f.get('script-revision').value,'');
  assert.match(f.get('script-source').value,/async function main/);
});

/* task-owned-stop-and-document-race-r3: focused UI regressions; this is not native Chrome evidence. */
test('task Stop cannot cancel another view\u0027s in-flight draft; parameter form never navigates',async t=>{
  const f=make();t.after(()=>f.ui.dispose());await tick();await tick();
  let prevented=false;
  f.get('task-params-form').fire('submit',{preventDefault(){prevented=true;}});
  assert.equal(prevented,true,'native form submit must be cancelled');
  await f.host.start({source:{kind:'draft',sourceUtf8:'return 1;'}});
  await f.ui.refresh();
  assert.equal(f.get('task-stop').disabled,true,'another view owns the active run');
  await f.click('task-stop');
  assert.equal(f.stops.length,0,'must not forward stop for an unrelated run');
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
  await f.click('task-run');
  await tick();await tick();
  assert.equal(checks,2,'must fence before and after async resolve');
  assert.equal(f.starts.length,0,'no Controller admission for a stale document');
  assert.match(f.get('task-status').textContent,/E_DOCUMENT_STALE/);
});

test('task cards retain readable selection and do not surface raw IDs as the main UI',async t=>{
  const f=make();t.after(()=>f.ui.dispose());await tick();await tick();
  const cards=f.get('task-installed-cards');
  assert.equal(cards.children.length,1,'one installed task should have one visible group');
  const group=cards.children[0], button=group.children[0];
  assert.equal(button.attributes['aria-pressed'],'true');
  assert.equal(button.attributes['aria-expanded'],'true');
  assert.equal(button.attributes['aria-controls'],'task-selected-workspace');
  assert.equal(group.children[1],f.get('task-selected-workspace'),'parameters and history remain under selected card');
  assert.match(button.children[1].children[0].textContent,/表单任务/);
  assert.match(button.children[1].children[1].textContent,/输入表单/,'card already communicates its purpose');
  assert.match(f.get('task-installed-detail').textContent,/适用网站/,'secondary details show scope and permissions');
  assert.doesNotMatch(f.get('task-installed-detail').textContent,/输入表单/,'R5 avoids repeating the task purpose');
  assert.doesNotMatch(f.get('task-installed-detail').textContent,/[a-f0-9]{64}/,'raw hashes belong in diagnostics');
  assert.equal(f.get('workbench-discover').hidden,true);
});

test('Sidebar Discover searches installed tasks only and selects a task without running or opening the catalog',async t=>{
  const f=make();t.after(()=>f.ui.dispose());await tick();await tick();
  await f.click('tab-discover');
  assert.equal(f.get('workbench-local-discover').hidden,false);
  assert.equal(f.get('workbench-discover').hidden,true);
  assert.equal(f.get('local-discover-count').textContent.includes('1 个'),true);
  assert.equal(f.get('local-discover-cards').children.length,1);
  assert.equal(f.catalogOpens.length,0);
  f.get('local-discover-search').value='不存在的任务';
  f.get('local-discover-search').fire('input');
  assert.match(f.get('local-discover-count').textContent,/0 个/);
  assert.equal(f.get('local-discover-cards').children.length,1,'empty search renders an explanation');
  assert.match(f.get('local-discover-cards').children[0].textContent,/没有匹配/);
  f.get('local-discover-search').value='表单';
  f.get('local-discover-search').fire('input');
  assert.equal(f.get('local-discover-cards').children.length,1);
  assert.equal(f.get('local-discover-cards').children[0].dataset.taskId,'demo.form');
  f.get('local-discover-cards').children[0].fire('click');
  assert.equal(f.get('workbench-tasks').hidden,false,'selection returns to My Tasks');
  assert.equal(f.get('task-installed-list').value,'demo.form');
  assert.equal(f.starts.length,0,'discover selection must not start a run');
  assert.equal(f.permissions.length,0,'discover selection must not request new page permissions');
  assert.equal(f.catalogOpens.length,0);
  await f.click('open-catalog');
  assert.equal(f.catalogOpens.length,1,'explicit full catalog opens an extension tab');
  assert.equal(f.catalogOpens[0].url,'chrome-extension://extension/ui/tool.html');
});

test('Discover filter controls are real view filters and cannot start another run',async t=>{
  const f=make();t.after(()=>f.ui.dispose());await tick();await tick();
  await f.click('tab-discover');
  await f.click('local-filter-disabled');
  assert.equal(f.get('local-filter-disabled').attributes['aria-pressed'],'true');
  assert.match(f.get('local-discover-count').textContent,/0 个/,'enabled task must not show as disabled');
  await f.click('local-filter-all');
  assert.equal(f.get('local-filter-all').attributes['aria-pressed'],'true');
  assert.equal(f.get('local-discover-cards').children.length,1);
  assert.equal(f.starts.length,0);
  assert.equal(f.permissions.length,0);
});

test('opening the separate full-size catalog preserves its import and management view',async t=>{
  const f=make();t.after(()=>f.ui.dispose());await tick();await tick();
  f.ui.showCatalogPage();
  assert.equal(f.get('workbench-discover').hidden,false);
  assert.equal(f.get('workbench-tasks').hidden,true);
  assert.equal(f.get('task-dock').hidden,true);
  assert.equal(f.get('develop-dock').hidden,true);
  assert.equal(f.get('task-catalog-cards').children.length,1);
  f.get('task-search').value='no matches';
  f.get('task-search').fire('input');
  assert.equal(f.get('task-catalog-cards').children.length,1,'empty result is an explicit empty state');
  assert.match(f.get('task-catalog-count').textContent,/0 个/);
  assert.equal(f.catalogOpens.length,0,'already-open full catalog must not create another browser tab');
});

test('full-size catalog keeps its own reader after real install and re-reads the single Task Catalog state',async t=>{
  const f=make({installedInitially:false});t.after(()=>f.ui.dispose());await tick();await tick();
  f.ui.showCatalogPage();
  f.get('task-catalog-list').value='demo.form@1.0.0';
  f.get('task-catalog-list').fire('change');
  assert.equal(f.get('task-install').disabled,false);
  await f.click('task-install');
  assert.equal(f.get('workbench-discover').hidden,false,'full catalog remains visible');
  assert.equal(f.get('task-dock').hidden,true,'catalog cannot show an unrelated run dock');
  assert.match(f.get('task-install-feedback').textContent,/已安装/);
  assert.equal(f.get('task-installed-cards').children.length,1,'installed list now comes from real service mock');
  assert.equal(f.get('task-run').disabled,false,'installed task is eligible on its own website');
});

test('idle Discover has no fixed footer and inline import still opens the authenticated catalog',async t=>{
  const f=make();t.after(()=>f.ui.dispose());await tick();await tick();
  await f.click('tab-discover');
  assert.equal(f.get('workspace-dock').hidden,true,'idle local search leaves all height for results');
  await f.click('tab-my-tasks');
  assert.equal(f.get('workspace-dock').hidden,false,'task Run is visible in My Tasks');
  await f.click('tab-discover');
  await f.click('local-discover-open-catalog');
  assert.equal(f.catalogOpens.length,1,'inline import opens existing full-page catalog');
  assert.equal(f.starts.length,0);
  assert.equal(f.permissions.length,0);
});

test('R5 result/history stay out of sight until a task has runs',async t=>{
  const f=make();t.after(()=>f.ui.dispose());await tick();await tick();
  assert.equal(f.get('task-result-panel').hidden,true);
  assert.equal(f.get('task-history-panel').hidden,true);
  await f.click('tab-discover');
  assert.equal(f.get('task-result-panel').hidden,true);
  await f.click('tab-my-tasks');
  assert.equal(f.get('task-history-panel').hidden,true);
});

test('card view retains original action identities, history and parameter form across tab changes',async t=>{
  const f=make();t.after(()=>f.ui.dispose());await tick();await tick();
  for(const id of ['task-result','task-history','task-params-form','task-toggle','task-uninstall','task-refresh'])
    assert(f.get(id),'existing action node exists: '+id);
  const form=f.get('task-params-form'),field=form.children.find(node=>node.dataset.taskParam==='name');
  field.value='unchanged';
  await f.click('tab-discover');await f.click('tab-develop');await f.click('tab-my-tasks');
  assert.equal(form.children.find(node=>node.dataset.taskParam==='name').value,'unchanged');
  assert.equal(f.get('task-installed-cards').children[0].children[1],f.get('task-selected-workspace'));
});

test('switching between two installed tasks preserves each independent unsaved parameter input',async t=>{
  const f=make({secondTask:true});t.after(()=>f.ui.dispose());await tick();await tick();
  const form=f.get('task-params-form');
  const field=()=>form.children.find(node=>node.dataset.taskParam==='name');
  field().value='First';
  f.get('task-installed-cards').children[1].children[0].fire('click');
  assert.equal(f.get('task-installed-list').value,'demo.second');
  field().value='Second';
  f.get('task-installed-cards').children[0].children[0].fire('click');
  assert.equal(f.get('task-installed-list').value,'demo.form');
  assert.equal(field().value,'First');
  f.get('task-installed-cards').children[1].children[0].fire('click');
  assert.equal(field().value,'Second');
  assert.equal(f.starts.length,0,'card selection never executes code');
  assert.equal(f.permissions.length,0,'card selection never requests permission');
});

test('R6 accessible roving tabs support Arrow and Home/End',async t=>{
  const f=make();t.after(()=>f.ui.dispose());await tick();await tick();
  assert.equal(f.get('tab-my-tasks').tabIndex,0);
  assert.equal(f.get('tab-discover').tabIndex,-1);
  let prevented=false;
  f.get('tab-my-tasks').fire('keydown',{key:'ArrowRight',preventDefault(){prevented=true;}});
  assert.equal(prevented,true);
  assert.equal(f.get('workbench-local-discover').hidden,false);
  assert.equal(f.get('tab-discover').tabIndex,0);
  assert.equal(f.doc.activeElement,f.get('tab-discover'));
  f.get('tab-discover').fire('keydown',{key:'End',preventDefault(){}});
  assert.equal(f.get('workbench-develop').hidden,false);
  assert.equal(f.get('tab-develop').attributes['aria-selected'],'true');
  f.get('tab-develop').fire('keydown',{key:'Home',preventDefault(){}});
  assert.equal(f.get('workbench-tasks').hidden,false);
  assert.equal(f.get('tab-my-tasks').tabIndex,0);
});

test('R6 task card refresh, keyboard selection and Discover handoff restore focus',async t=>{
  const f=make({secondTask:true});t.after(()=>f.ui.dispose());await tick();await tick();
  const before=f.get('task-installed-cards').children[0].children[0];
  before.focus();await f.ui.refresh();
  const next=f.get('task-installed-cards').children[0].children[0];
  assert.notEqual(before,next);assert.equal(f.doc.activeElement,next);
  const second=f.get('task-installed-cards').children[1].children[0];
  second.focus();second.fire('click');
  assert.equal(f.get('task-installed-list').value,'demo.second');
  assert.equal(f.doc.activeElement,f.get('task-installed-cards').children[1].children[0]);
  await f.click('tab-discover');
  const discovered=f.get('local-discover-cards').children[0];
  discovered.focus();discovered.fire('click');
  assert.equal(f.doc.activeElement,f.get('task-installed-cards').children[0].children[0]);
  assert.equal(f.starts.length,0);
});

test('R6 late run start/result cannot become the newly selected task status',async t=>{
  const f=make({secondTask:true});t.after(()=>f.ui.dispose());await tick();await tick();
  let release;
  f.api.permissions.request=()=>new Promise(resolve=>{release=resolve;});
  f.get('task-run').fire('click',{isTrusted:true});
  f.get('task-installed-cards').children[1].children[0].fire('click');
  assert.equal(f.get('task-installed-list').value,'demo.second');
  assert.match(f.get('task-status').textContent,/表单任务.*正在准备/);
  release(true);await tick();await tick();await tick();
  assert.equal(f.starts.length,1);
  assert.match(f.get('task-status').textContent,/表单任务.*正在运行/);
  assert.equal(f.get('task-stop').disabled,false,'owner Stop survives selection change');
  f.host.complete({ok:true});await tick();await tick();await tick();
  assert.equal(f.get('task-result-panel').hidden,true,'B must not show A result');
  assert.doesNotMatch(f.get('task-status').textContent,/表单任务|本次任务/);
  f.get('task-installed-cards').children[0].children[0].fire('click');
  await tick();await tick();
  assert.match(f.get('task-result').textContent,/"ok": true/);
  assert.match(f.get('task-status').textContent,/成功/);
});

test('R6 previous-version notices and results do not leak after installed upgrade',async t=>{
  const f=make();t.after(()=>f.ui.dispose());await tick();await tick();
  await f.click('task-run');
  f.host.complete({ok:true});await tick();await tick();await tick();
  assert.match(f.get('task-status').textContent,/成功/);
  f.catalogState.catalog[0].version='2.0.0';
  f.catalogState.installed[0].version='2.0.0';
  f.catalogState.installed[0].scriptId='task:demo.form:2.0.0';
  await f.ui.refresh();await tick();
  assert.equal(f.get('task-status').textContent,'','new installed version has no inherited run notice');
  assert.equal(f.get('task-history-panel').hidden,true,'new version has no old-version history');
});

test('two extension documents share only a refresh hint and re-read authoritative installed state',async t=>{
  const store={};
  const sidebar=make({installedInitially:false,sharedStore:store});
  const catalog=make({installedInitially:false,sharedStore:store});
  t.after(()=>{sidebar.ui.dispose();catalog.ui.dispose();});
  await tick();await tick();
  assert.match(sidebar.get('task-installed-cards').children[0].textContent,/还没有任务/);
  catalog.ui.showCatalogPage();
  catalog.get('task-catalog-list').value='demo.form@1.0.0';
  catalog.get('task-catalog-list').fire('change');
  await catalog.click('task-install');
  await tick();await tick();await tick();
  assert.equal(sidebar.get('task-installed-cards').children[0].children[0].dataset.taskId,'demo.form',
    'Sidebar discovers the same installed version via a fresh Catalog request');
  assert.equal(sidebar.get('task-run').disabled,false);
  assert.equal(sidebar.starts.length,0,'catalog notification never runs a task');
  assert.equal(sidebar.permissions.length,0,'catalog notification never requests permission');
});

test('catalog installation stays in the complete directory and directs running back to Sidebar',async t=>{
  const f=make();t.after(()=>f.ui.dispose());await tick();await tick();f.ui.showCatalogPage();
  f.get('task-catalog-list').value='demo.form@1.0.0';
  await f.click('task-install');
  assert.equal(f.get('workbench-discover').hidden,false);
  assert.equal(f.get('workbench-tasks').hidden,true);
  assert.match(f.get('task-catalog-status').textContent,/已安装.*Sidebar「我的任务」/);
  assert.equal(f.starts.length,0);assert.equal(f.permissions.length,0);
});

test('catalog JS import hands source to Sidebar and never enters a view with a hidden runner',async t=>{
  const f=make();t.after(()=>f.ui.dispose());await tick();await tick();f.ui.showCatalogPage();
  const source='async function main() { return "file draft"; }';
  f.get('task-package-file').value='draft.js';
  f.get('task-package-file').files=[{name:'draft.js',size:source.length,text:async()=>source}];
  f.get('task-package-file').fire('change');await tick();await tick();
  assert.deepEqual(f.draftMessages,[{protocol:'opendesk.sidebar.draft-import.v1',sourceUtf8:source}]);
  assert.equal(f.get('workbench-discover').hidden,false);
  assert.equal(f.get('workbench-develop').hidden,true);
  assert.equal(f.starts.length,0);assert.equal(f.permissions.length,0);
  assert.match(f.get('task-catalog-status').textContent,/未保存草稿/);
  assert.equal(f.get('task-package-file').value,'','the same file can be imported again');
});

test('missing Sidebar refuses import with an actionable message, without losing the directory',async t=>{
  const f=make();t.after(()=>f.ui.dispose());await tick();await tick();f.ui.showCatalogPage();
  f.api.runtime.sendMessage=async()=>{throw Error('Receiving end does not exist');};
  f.get('task-package-file').value='draft.js';
  f.get('task-package-file').files=[{name:'draft.js',size:1,text:async()=>'x'}];
  f.get('task-package-file').fire('change');await tick();await tick();
  assert.match(f.get('task-catalog-status').textContent,/同一窗口打开 Sidebar/);
  assert.equal(f.get('workbench-discover').hidden,false);assert.equal(f.starts.length,0);
  assert.equal(f.get('task-package-file').value,'','retrying after opening Sidebar must fire change again');
});

test('catalog draft transport errors retain their cause instead of claiming Sidebar is missing',async t=>{
  const f=make();t.after(()=>f.ui.dispose());await tick();await tick();f.ui.showCatalogPage();
  f.api.runtime.sendMessage=async()=>{throw Error('Extension context invalidated');};
  f.get('task-package-file').value='draft.js';
  f.get('task-package-file').files=[{name:'draft.js',size:1,text:async()=>'x'}];
  f.get('task-package-file').fire('change');await tick();await tick();
  assert.match(f.get('task-catalog-status').textContent,/E_DRAFT_TRANSPORT：Extension context invalidated/);
  assert.equal(f.get('task-package-file').value,'');assert.equal(f.starts.length,0);
});

test('receiving a source-only import selects Sidebar Developer without creating a run',async t=>{
  const f=make();t.after(()=>f.ui.dispose());await tick();await tick();
  f.ui.receiveDraft('async function main() {}');
  assert.deepEqual(f.importedDrafts,['async function main() {}']);
  assert.equal(f.get('workbench-develop').hidden,false);assert.equal(f.starts.length,0);
  assert.equal(f.permissions.length,0);
});
