import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const html = await read('../src/index.html');
const scripts = await Promise.all(['../adapters/app-sdk.js','../src/app-model.js','../src/main.js'].map(read));
const settle = async () => {for(let i=0;i<20;i++) await Promise.resolve();};
async function view(request) {
  const nodes = new Map([...html.matchAll(/id="([^"]+)"/g)].map(([,id])=>[id,{value:'',textContent:'',hidden:false,disabled:false,
    events:{}, addEventListener(name,handler){this.events[name]=handler;}}]));
  let pagehide, interval, state;
  const root = {querySelector:selector=>nodes.get(selector.slice(1)),addEventListener(){},removeEventListener(){}};
  const context=vm.createContext({TextEncoder,URL,OpenDeskTool:{root,request,setState:value=>{state=value;}},
    setInterval:fn=>{interval=fn;return 1;},clearInterval:()=>{interval=null;},addEventListener:(name,fn)=>{pagehide=fn;}});
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
    if(op==='tasks.start')return new Promise(r=>{receipt=r;});
    if(op==='tasks.stop')return {runId:'same',accepted:true,retired:false};
    if(op==='tasks.read')return {runId:'same',status:'stopped',engineStatus:'cancelled',retired:false,result:{data:[{title:'real'}],stats:{},engine:{status:'cancelled'}}};
    if(op==='file.download')return {downloadId:1};
  });
  v.nodes.get('start').events.click();await settle();assert.equal(v.nodes.get('stop').disabled,false);
  v.nodes.get('stop').events.click();receipt({runId:'same',status:'running'});await settle();
  assert.equal(calls.find(([op])=>op==='tasks.stop')[1].runId,'same');
  assert.equal(v.nodes.get('stop-status').textContent,'已受理');assert.equal(v.nodes.get('retired-status').textContent,'尚未确认');
  assert.match(v.nodes.get('result').textContent,/real/);assert.equal(v.nodes.get('page-title').textContent,'<untrusted title>');
  await v.nodes.get('download-json').events.click();await settle();
  assert.match(v.nodes.get('app-notice').textContent,/已请求下载/);assert.doesNotMatch(v.nodes.get('app-notice').textContent,/落盘/);
  v.close();
});
