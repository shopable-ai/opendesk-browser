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
    attributes:{},setAttribute(name,value){this.attributes[name]=value;},
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
test('JSON URL edits synchronize the actual Start target and preserve current-page identity checks',async()=>{
  const url='https://book.douban.com/tag/test',calls=[];
  const v=await view(async(op,payload)=>{
    calls.push([op,payload]);
    if(op==='storage.get')return {value:null,etag:'a'};
    if(op==='currentPage.info')return {status:'available',url,title:'Books'};
    if(op==='tasks.read')return {task:{id:'scrapyjs.capture'}};
    if(op==='tasks.start')return {clientRequestId:payload.clientRequestId,runId:'books-run',state:'running'};
    throw Error('Unexpected '+op);
  });
  const editor=v.nodes.get('config-json');editor.value=JSON.stringify({url,itemConfig:{title:'h2::text'}});editor.events.input();
  assert.equal(v.nodes.get('target-url').value,url);
  v.nodes.get('start').events.click();await settle();
  const started=calls.find(([op])=>op==='tasks.start');assert(started,'Valid JSON URL must reach the original Task admission');
  assert.equal(started[1].params.url,url);assert.equal(v.nodes.get('config-error').textContent,'');
  v.close();
});
test('real UI preserves malformed draft during initial storage reply and protects close', async () => {
  let resolve;
  const storage=new Promise(r=>{resolve=r;});
  const v=await view(async op=>op==='storage.get'?storage:{status:'available',url:'http://127.0.0.1:43111/demo-form.html',title:'Demo'});
  const editor=v.nodes.get('config-json'); editor.value='{"unfinished'; editor.events.input();
  resolve({value:null,etag:'a'}); await settle();
  assert.equal(editor.value,'{"unfinished'); assert.equal(v.state.dirty,true); assert.equal(v.nodes.get('start').disabled,true);
  assert.equal(v.nodes.get('use-saved').hidden,false);
  v.nodes.get('use-saved').events.click(); v.nodes.get('profile-confirm-accept').events.click();await settle();
  assert.equal(v.nodes.get('start').disabled,false);assert.equal(v.state.dirty,false);
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
  v.nodes.get('profile-confirm-accept').events.click();await settle();
  assert.equal(v.nodes.get('next-selector').value,'');assert.equal(v.nodes.get('start').disabled,false);
  assert.equal(JSON.parse(v.nodes.get('config-json').value).nextPageSelector,undefined);v.close();
});

async function namedView(){
  let row={value:{url:'http://127.0.0.1:43111/demo-form.html',itemConfig:{_listContainer:'#sample-list',_listItem:'li',a:'.::text'}},etag:'0'};
  const writes=[];
  const v=await view(async(op,payload)=>{
    if(op==='storage.get')return JSON.parse(JSON.stringify(row));
    if(op==='storage.set'){
      assert.equal(payload.ifMatch,row.etag);writes.push(payload);
      row={value:JSON.parse(JSON.stringify(payload.value)),etag:String(Number(row.etag)+1)};return {saved:true};
    }
    return {status:'available',url:'http://127.0.0.1:43111/demo-form.html',title:'Demo'};
  });
  return {...v, get state(){return v.state;},writes,get saved(){return row.value;}};
}
const press=async(v,id)=>{v.nodes.get(id).events.click();await settle();};
const nameSubmit=async(v,name)=>{v.nodes.get('profile-name').value=name;await v.nodes.get('profile-name-submit').events.click();await settle();};
test('named UI creates independent copies, rejects duplicate names and restores the selected JSON and controls',async()=>{
  const v=await namedView();await press(v,'copy-profile');await nameSubmit(v,'B');
  assert(v.nodes.get('profile-naming').hidden);assert.equal(v.saved.records.length,2);
  const b={url:'http://127.0.0.1:43111/demo-form.html',itemConfig:{_listContainer:'#sample-list',_listItem:'li',b:'.::text'},nextPageSelector:'a.next',maxPages:3};
  v.nodes.get('config-json').value=JSON.stringify(b);v.nodes.get('config-json').events.input();await press(v,'save-config');
  const first=v.nodes.get('profile-list').children.find(n=>n.textContent==='默认配置');first.events.click();await settle();
  assert.equal(v.nodes.get('next-selector').value,'');assert.equal(JSON.parse(v.nodes.get('config-json').value).itemConfig.a,'.::text');
  v.nodes.get('profile-list').children.find(n=>n.textContent==='B').events.click();await settle();
  assert.deepEqual(JSON.parse(v.nodes.get('config-json').value),b);assert.equal(v.nodes.get('next-selector').value,'a.next');
  await press(v,'rename-profile');await nameSubmit(v,'默认配置');assert.match(v.nodes.get('profile-name-error').textContent,/同名/);
  assert.equal(v.nodes.get('profile-naming').hidden,false);await nameSubmit(v,'B renamed');
  assert.equal(v.saved.records[0].name,'默认配置');assert.equal(v.saved.records[1].name,'B renamed');
  assert.equal(v.saved.records[0].config.itemConfig.a,'.::text');v.close();
});
test('invalid JSON and every unapplied editor survive cancelled switch/new/delete; accepting new resets all editors',async()=>{
  const v=await namedView();await press(v,'copy-profile');await nameSubmit(v,'B');
  const json=v.nodes.get('config-json');json.value='{"unfinished';json.events.input();
  for(const action of [()=>v.nodes.get('profile-list').children[0].events.click(),()=>v.nodes.get('new-profile').events.click(),()=>v.nodes.get('delete-profile').events.click()]){
    const selected=v.saved.selectedId;action();await settle();assert.equal(v.nodes.get('profile-confirm').hidden,false);
    await press(v,'profile-confirm-cancel');assert.equal(json.value,'{"unfinished');assert.equal(v.saved.selectedId,selected);
  }
  await press(v,'new-profile');await press(v,'profile-confirm-accept');
  await press(v,'save-config');await nameSubmit(v,'C');
  for(const [id,value] of [['field-selector','a.pending'],['next-selector','a.next'],['detail-fields','{"unfinished']]){
    v.nodes.get(id).value=value;v.nodes.get(id).events.input();
    const original=json.value;await press(v,'delete-profile');await press(v,'profile-confirm-cancel');
    assert.equal(v.nodes.get(id).value,value);assert.equal(json.value,original);assert.equal(v.nodes.get('save-config').disabled,true);
  }
  await press(v,'new-profile');await press(v,'profile-confirm-accept');
  assert.equal(v.nodes.get('field-selector').value,'');assert.equal(v.nodes.get('next-selector').value,'');
  assert.equal(v.nodes.get('detail-fields').value,'{}');assert.equal(v.nodes.get('start').disabled,false);v.close();
});
