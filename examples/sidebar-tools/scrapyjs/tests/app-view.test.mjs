import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {readFile} from 'node:fs/promises';
const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const html = await read('../src/index.html');
const scripts = await Promise.all(['../adapters/app-sdk.js','../src/app-model.js','../src/main.js'].map(read));
const settle = async () => {for(let i=0;i<20;i++) await Promise.resolve();};
async function view(request) {
  const createNode=()=>({value:'',textContent:'',hidden:false,disabled:false,checked:false,children:[],
    events:{},addEventListener(name,handler){this.events[name]=handler;},
    append(...children){this.children.push(...children);},replaceChildren(...children){this.children=children;}});
  const nodes = new Map([...html.matchAll(/id="([^"]+)"/g)].map(([,id])=>[id,createNode()]));
  nodes.get('field-read').value='text';
  let pagehide, interval, state;
  const root = {querySelector:selector=>nodes.get(selector.slice(1)),addEventListener(){},removeEventListener(){}};
  const context=vm.createContext({TextEncoder,URL,crypto:webcrypto,OpenDeskTool:{root,request,setState:value=>{state=value;}},
    document:{createElement:()=>createNode()},setInterval:fn=>{interval=fn;return 1;},clearInterval:()=>{interval=null;},addEventListener:(name,fn)=>{pagehide=fn;}});
  scripts.forEach(script=>vm.runInContext(script,context)); await settle();
  return {nodes,get state(){return state;},close:()=>pagehide(),get interval(){return interval;}};
}
test('real UI preserves malformed draft during initial storage reply and protects close', async () => {
  let resolve;
  const storage=new Promise(r=>{resolve=r;});
  const v=await view(async op=>op==='storage.get'?storage:{status:'available',url:'http://127.0.0.1:43111/demo-form.html',title:'Demo'});
  const editor=v.nodes.get('config-json'); editor.value='{"unfinished'; editor.events.input();
  resolve({value:null,etag:'a'}); await settle();
  assert.equal(editor.value,'{"unfinished'); assert.equal(v.state.dirty,true); assert.equal(v.nodes.get('start').disabled,true);
  assert.equal(v.nodes.get('use-saved').hidden,false);
  v.nodes.get('use-saved').events.click(); assert.equal(v.nodes.get('start').disabled,false);assert.equal(v.state.dirty,false);
  v.close();assert.equal(v.interval,null);
});
test('UI stop before start receipt addresses same run and displays honest result/download states', async () => {
  let receipt;const calls=[];
  const v=await view(async(op,payload)=>{
    calls.push([op,payload]);
    if(op==='storage.get')return {value:null,etag:'a'};
    if(op==='currentPage.info')return {status:'available',url:'http://127.0.0.1:43111/demo-form.html',title:'<untrusted title>'};
    if(op==='tasks.start')return new Promise(r=>{receipt=()=>r({clientRequestId:payload.clientRequestId,runId:'same',state:'running'});});
    if(op==='tasks.stop')return {clientRequestId:payload.clientRequestId,runId:null,state:'stopping'};
    if(op==='tasks.read')return payload.taskId?{task:{taskId:payload.taskId}}:{clientRequestId:payload.clientRequestId,runId:'same',state:'stopped',retirementState:'pending',value:{data:[{title:'real'}],stats:{},engine:{status:'cancelled'}}};
    if(op==='browser.downloads.text')return {started:true};
  });
  v.nodes.get('start').events.click();await settle();assert.equal(v.nodes.get('stop').disabled,false);
  v.nodes.get('stop').events.click();await settle();assert.ok(calls.find(([op])=>op==='tasks.stop'),'Stop is sent before the start reply');receipt();await settle();
  assert.equal(calls.find(([op])=>op==='tasks.stop')[1].clientRequestId,calls.find(([op])=>op==='tasks.start')[1].clientRequestId);
  assert.equal(v.nodes.get('stop-status').textContent,'已受理');assert.equal(v.nodes.get('retired-status').textContent,'尚未确认');
  assert.match(v.nodes.get('result').textContent,/real/);assert.equal(v.nodes.get('page-title').textContent,'<untrusted title>');
  await v.nodes.get('download-json').events.click();await settle();
  assert.match(v.nodes.get('app-notice').textContent,/已请求下载/);assert.doesNotMatch(v.nodes.get('app-notice').textContent,/落盘/);
  v.close();
});

test('unapplied fields protect Run/save; applying an attribute preserves unrelated fields',async()=>{
  const v=await view(async op=>op==='storage.get'?{value:null,etag:'a'}:{status:'available',url:'http://127.0.0.1:43111/demo-form.html',title:'Demo'});
  v.nodes.get('field-key').value='url';v.nodes.get('field-selector').value='a';
  v.nodes.get('field-read').value='attr';v.nodes.get('field-attr').value='href';
  v.nodes.get('field-key').events.input();
  assert.equal(v.nodes.get('start').disabled,true);assert.equal(v.nodes.get('save-config').disabled,true);assert.equal(v.state.dirty,true);
  v.nodes.get('apply-field').events.click();
  const config=JSON.parse(v.nodes.get('config-json').value);
  assert.equal(config.itemConfig.url,'a::href');assert.equal(config.itemConfig.title,'.::text');
  assert.equal(v.nodes.get('start').disabled,false);assert.equal(v.nodes.get('save-config').disabled,false);
  v.close();
});
test('list settings apply independently without inventing a field',async()=>{
  const v=await view(async op=>op==='storage.get'?{value:null,etag:'a'}:{status:'available',url:'http://127.0.0.1:43111/demo-form.html',title:'Demo'});
  v.nodes.get('list-container').value='.rows';v.nodes.get('list-item').value='article';v.nodes.get('list-item').events.input();
  v.nodes.get('apply-field').events.click();
  const c=JSON.parse(v.nodes.get('config-json').value);
  assert.equal(c.itemConfig._listContainer,'.rows');assert.equal(c.itemConfig._listItem,'article');
  assert.equal(c.itemConfig.title,'.::text');assert.equal(v.nodes.get('start').disabled,false);v.close();
});
test('replacing a pending structured draft refreshes unchanged saved controls',async()=>{
  let resolve;const storage=new Promise(r=>{resolve=r;});
  const v=await view(async op=>op==='storage.get'?storage:{status:'available',url:'http://127.0.0.1:43111/demo-form.html',title:'Demo'});
  v.nodes.get('next-selector').value='a.next';v.nodes.get('next-selector').events.input();
  resolve({value:null,etag:'a'});await settle();
  v.nodes.get('use-saved').events.click();
  assert.equal(v.nodes.get('next-selector').value,'');assert.equal(v.nodes.get('start').disabled,false);
  assert.equal(JSON.parse(v.nodes.get('config-json').value).nextPageSelector,undefined);v.close();
});
