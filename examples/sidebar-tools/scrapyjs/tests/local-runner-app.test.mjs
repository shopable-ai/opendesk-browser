import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import * as React from 'react';
import {createExtensionCenterDOM} from '../../../../tests/helpers/extension-center-react-dom.mjs';
import {App} from './react-fixture.mjs';

const context=vm.createContext({URL,TextEncoder,crypto:globalThis.crypto});
for(const path of ['../src/app-model.js','../adapters/app-sdk.js'])
  vm.runInContext(await readFile(new URL(path,import.meta.url),'utf8'),context);
const settle=()=>new Promise(resolve=>setImmediate(resolve));
const base={url:'http://127.0.0.1:43233/page-1.html',itemConfig:{_listContainer:'#books',_listItem:':scope > li',id:'.::data-id',title:'h2::text',price:'.price::text'},nextPageSelector:'a.next',maxPages:50,dedupeKey:'id'};
const records=[['A','浏览器工具','19.50'],['B','本地任务','25.00'],['C','声明式采集','30.00'],['D','持久结果','0.00'],['E','精确分页','42.25'],['F','停止与恢复','']].map(([id,title,price])=>({id,title,price}));

async function fixture(t,{pendingAi=false}={}){
  const saved={...base,maxPages:10};
  const rows=new Map([['capture-config',{value:{schemaVersion:1,selectedId:'saved',records:[{id:'saved',name:'已有采集配置',config:saved}]},etag:'0'}],['local-runner-state',{value:null,etag:'0'}],['ai-pending-request',{value:pendingAi?{schemaVersion:1,requestId:'unknown-ai'}:null,etag:'0'}]]);
  const calls=[];let run;
  const previous=Object.fromEntries(['OpenDeskTool','ScrapyAppModel','ScrapyAppSdk','requestAnimationFrame'].map(key=>[key,globalThis[key]]));
  const tool={setState(){},request:async(operation,payload)=>{
    calls.push({operation,payload:structuredClone(payload)});
    if(operation==='storage.get')return structuredClone(rows.get(payload.key));
    if(operation==='storage.set'){
      const row=rows.get(payload.key);assert.equal(payload.ifMatch,row.etag,'preserve CAS');rows.set(payload.key,{value:structuredClone(payload.value),etag:String(Number(row.etag)+1)});return {saved:true};
    }
    if(operation==='currentPage.info')return {status:'available',title:'公开 Fixture',url:base.url};
    if(operation==='ai.info')throw Error('No Provider configured');
    if(operation==='localTasks.export')return {started:true,downloadId:42};
    if(operation==='localTasks.request'){
      if(payload.path.includes('/records?'))return {records:structuredClone(records),total:6,offset:0};
      if(payload.method==='POST'&&payload.path==='/v1/runs'){
        const {requestId,mode,config,previewRunId}=payload.body;
        run={requestId,runId:mode==='preview'?'preview-1':'full-1',mode,config:structuredClone(config),configHash:'fixture-hash',...(previewRunId?{previewRunId}:{}),status:mode==='preview'?'completed':'running',pagesVisited:3,recordsCount:6,fields:['id','title','price'],completeness:{id:{total:6,nonEmpty:6,ratio:1},title:{total:6,nonEmpty:6,ratio:1},price:{total:6,nonEmpty:5,ratio:5/6}},errors:[],workerExited:mode==='preview',previewPassed:mode==='preview'};
      }else if(payload.path.endsWith('/stop'))run={...run,status:'stopped',workerExited:true};
      return structuredClone(run);
    }
    throw Error('Unexpected operation '+operation);
  }};
  Object.assign(globalThis,{OpenDeskTool:tool,ScrapyAppModel:context.ScrapyAppModel,ScrapyAppSdk:context.ScrapyAppSdk,requestAnimationFrame:fn=>setTimeout(fn,0)});
  t.after(()=>Object.assign(globalThis,previous));
  const ui=createExtensionCenterDOM(t,{component:({show})=>{
    tool.root=globalThis.document.getElementById('opendesk-react-app');return show?React.createElement(App):null;
  },props:{show:true}});
  ui.window.getSelection=()=>({anchorNode:null,anchorOffset:0,focusNode:null,focusOffset:0});
  await settle();await settle();
  return {ui,calls,rows,get:id=>ui.doc.getElementById(id),edit(id,text){const node=ui.doc.getElementById(id);node.value=text;node.dispatch('input');},posts:()=>calls.filter(row=>row.operation==='localTasks.request'&&row.payload.method==='POST'&&row.payload.path==='/v1/runs')};
}

test('manual/saved config trial, explicit full, reopen, Stop and exports use one runner without opening Chat or querying AI',async t=>{
  const f=await fixture(t),{get,ui}=f;
  assert.equal(get('open-local-runner')?.disabled,false,'manual collection must have an independent entry');
  assert.equal(f.calls.some(call=>call.operation.startsWith('ai.')),false,'closed Chat must not query a Provider');
  get('open-local-runner').dispatch('click');await settle();
  assert.deepEqual(JSON.parse(get('runner-config').value||get('runner-config').defaultValue),{...base,maxPages:10},'reuse selected saved configuration');
  f.edit('runner-config',JSON.stringify(base));
  assert.equal(get('runner-prepare-full').disabled,true);
  get('runner-start-preview').dispatch('click');await settle();await settle();
  assert.equal(f.posts().length,1);assert.equal(f.posts()[0].payload.body.previewPages,3);assert.deepEqual(f.posts()[0].payload.body.config,base);
  assert.equal(get('runner-prepare-full').disabled,false);assert.match(ui.doc.body.textContent,/83.33%/);
  ui.paint();await settle();
  assert.deepEqual([...ui.doc.querySelectorAll('.runner-records pre')].map(node=>JSON.parse(node.textContent)),records);
  get('runner-prepare-full').dispatch('click');assert.equal(get('runner-start-full').disabled,true);
  get('runner-confirm-result').checked=true;get('runner-confirm-result').dispatch('click');get('runner-start-full').dispatch('click');await settle();await settle();
  const full=f.posts()[1].payload.body;
  assert.equal(full.mode,'full');assert.equal(full.previewRunId,'preview-1');assert.equal(full.configHash,'fixture-hash');assert.deepEqual(full.config,base);
  ui.state.show=false;ui.paint();ui.state.show=true;ui.paint();await settle();await settle();
  get('open-local-runner').dispatch('click');await settle();
  assert.match(get('runner-heading').parentNode.parentNode.textContent,/full-1/);assert.equal(f.posts().length,2,'reopen must only GET the existing run');
  get('runner-stop').dispatch('click');await settle();await settle();
  assert.match(ui.doc.body.textContent,/已停止/);assert.match(ui.doc.body.textContent,/worker 已确认退出/);
  for(const format of ['jsonl','csv']){get('runner-export-'+format).dispatch('click');await settle();}
  assert.deepEqual(f.calls.filter(row=>row.operation==='localTasks.export').map(row=>row.payload),[{runId:'full-1',format:'jsonl'},{runId:'full-1',format:'csv'}]);
  assert.equal(f.calls.some(row=>row.operation.startsWith('ai.')||row.operation.startsWith('tasks.')),false);
});

test('editing and reverting manual config invalidates preview certification and never starts full',async t=>{
  const f=await fixture(t),{get}=f;
  assert.ok(get('open-local-runner'),'independent local entry exists');get('open-local-runner').dispatch('click');await settle();
  f.edit('runner-config',JSON.stringify(base));get('runner-start-preview').dispatch('click');await settle();await settle();
  get('runner-prepare-full').dispatch('click');get('runner-confirm-result').checked=true;get('runner-confirm-result').dispatch('click');
  f.edit('runner-config',JSON.stringify({...base,dedupeKey:'title'}));f.edit('runner-config',JSON.stringify(base));
  assert.equal(get('runner-prepare-full').disabled,true);assert.equal(get('runner-start-full').disabled,true);
  get('runner-start-full').dispatch('click');await settle();assert.equal(f.posts().length,1);
  f.edit('runner-config','{');get('runner-start-preview').dispatch('click');await settle();assert.equal(f.posts().length,1);
});

test('unknown AI remains fenced while independent manual trial and full stay available',async t=>{
  const f=await fixture(t,{pendingAi:true}),{get}=f;
  get('open-ai').dispatch('click');await settle();await settle();
  assert.match(get('ai-request-status').textContent,/unknown/);assert.equal(get('ai-generate').disabled,true);
  const ids=[...f.ui.doc.querySelectorAll('[id]')].map(node=>node.id);
  assert.equal(new Set(ids).size,ids.length,'Chat and collection controls keep distinct DOM identities');
  get('close-ai').dispatch('click');await settle();
  get('close-local-runner').dispatch('click');await settle();
  assert.equal(get('config-json').disabled,false,'unknown inference must not lock unrelated configuration edits');
  get('open-local-runner').dispatch('click');await settle();
  assert.ok(get('runner-start-preview'),'manual controls stay reachable with unknown AI');
  get('runner-start-preview').dispatch('click');await settle();await settle();
  assert.equal(get('runner-prepare-full').disabled,false);get('runner-prepare-full').dispatch('click');get('runner-confirm-result').checked=true;get('runner-confirm-result').dispatch('click');get('runner-start-full').dispatch('click');await settle();await settle();
  assert.equal(f.posts().length,2);assert.equal(f.posts()[1].payload.body.mode,'full');
  assert.equal(f.calls.filter(row=>row.operation==='ai.generate'||row.operation==='ai.cancel').length,0);
  assert.equal(f.rows.get('ai-pending-request').value.requestId,'unknown-ai','manual collection must not clear the AI fence');
});
