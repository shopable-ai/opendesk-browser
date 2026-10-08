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
  const get=id=>nodes.get(id);
  const doc={getElementById:get,createElement:()=>new Element()};
  const programId='task:demo.form:1.0.0',hash='a'.repeat(64),manifestHash='b'.repeat(64);
  const manifest={title:'表单任务',description:'输入表单',author:'OpenDesk',source:'local',siteOrigins:['https://a.example'],
    permissions:['page.automation'],program:{sourceHash:hash},paramsSchema:{type:'object',
      properties:{name:{type:'string',title:'姓名',minLength:1,maxLength:30,default:'Alice'}},required:['name'],additionalProperties:false}};
  const row={taskId:'demo.form',version:'1.0.0',manifest,manifestHash,stage:'available',installed:true,enabled:true};
  const installed={taskId:row.taskId,version:row.version,scriptId:programId,manifestHash,enabled:true};
  const starts=[],permissions=[],stops=[];
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
  const api={permissions:{request:value=>{permissions.push(value);return Promise.resolve(true);}}};
  const ui=createTaskWorkbench({client,host,currentPageTarget:page,api,document:doc});
  return {ui,get,page,host,view,starts,permissions,stops,
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
  await f.click('tab-discover');assert.equal(f.get('workbench-discover').hidden,false);
  assert.equal(f.host.currentRun,'run-task-1','switching pages must never retire RunHost');
  f.host.complete({ok:true});await tick();await tick();
  assert.match(f.get('task-result').textContent,/"ok": true/);
  assert.match(f.get('task-history').children[0].children[0].textContent,/run-task-1/);
});

test('installed task can be explicitly forked into an independent unsaved editor draft',async t=>{
  const f=make();t.after(()=>f.ui.dispose());await tick();await tick();
  await f.click('task-fork-draft');
  assert.equal(f.get('workbench-develop').hidden,false);
  assert.match(f.get('script-id').value,/^draft-demo\.form-/);
  assert.equal(f.get('script-revision').value,'');
  assert.match(f.get('script-source').value,/async function main/);
});
