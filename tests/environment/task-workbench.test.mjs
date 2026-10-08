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
const make=()=>{
  const nodes=new Map([...html.matchAll(/id="([^"]+)"/g)].map(([,id])=>[id,new Element()]));
  const get=id=>nodes.get(id)||nodes.get('task-params-form')?.children.find(child=>child.id===id);
  const doc={getElementById:get,createElement:()=>new Element(),documentElement:{dataset:{}}};
  const programId='task:demo.form:1.0.0',hash='a'.repeat(64),manifestHash='b'.repeat(64);
  const manifest={title:'表单任务',description:'输入表单',author:'OpenDesk',source:'local',siteOrigins:['https://a.example'],
    permissions:['page.automation'],program:{sourceHash:hash},paramsSchema:{type:'object',
      properties:{name:{type:'string',title:'姓名',minLength:1,maxLength:30,default:'Alice'}},required:['name'],additionalProperties:false}};
  const row={taskId:'demo.form',version:'1.0.0',manifest,manifestHash,stage:'available',installed:true,enabled:true};
  const installed={taskId:row.taskId,version:row.version,scriptId:programId,manifestHash,enabled:true};
  const starts=[],permissions=[],stops=[],catalogOpens=[];
  let target={status:'available',url:'https://a.example/',tabId:9,windowId:7,documentId:'doc-9'};
  const page={
    get snapshot(){return target;},subscribe:fn=>{fn(target);return()=>{};},
    capture:()=>target,revalidate:async()=>true};
  const view={runs:[],results:[],slotAvailable:true,downloads:[],resultDeliveryDenied:[]};
  const client={ready:Promise.resolve(),subscribeConnection:()=>()=>{},
    controller:{snapshotControllerRun:async()=>structuredClone(view)},
    async request(method,payload) {
      if(method==='listTaskCatalog')return {catalog:[structuredClone(row)],installed:[structuredClone(installed)]};
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
    runtime:{getURL:path=>'chrome-extension://extension/'+path},
    tabs:{create:async request=>{catalogOpens.push(request);return {id:99};}}};
  const ui=createTaskWorkbench({client,host,currentPageTarget:page,api,document:doc});
  return {ui,get,page,host,view,starts,permissions,stops,catalogOpens,
    click:async(id,trusted=true)=>{get(id).fire('click',{isTrusted:trusted});await tick();await tick();}};
};

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
  assert.match(f.get('task-history').children[0].children[0].textContent,/run-task-1/);
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
  assert.equal(cards.children.length,1,'one installed task should have one visible card');
  assert.equal(cards.children[0].attributes['aria-pressed'],'true');
  assert.match(cards.children[0].children[1].children[0].textContent,/表单任务/);
  assert.match(f.get('task-installed-detail').textContent,/输入表单/);
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
  assert.match(f.get('local-discover-cards').children[0].textContent,/没有找到/);
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
