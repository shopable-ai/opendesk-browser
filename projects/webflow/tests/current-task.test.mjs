import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {parseHTML} from 'linkedom';
import * as React from 'react';
import {createRoot} from 'react-dom/client';
import {renderToStaticMarkup} from 'react-dom/server';

const compiled=await build({stdin:{contents:"export {WebflowCurrentTask,projectTrustedTaskNotice} from './projects/webflow/trusted/CurrentTask.tsx';",
 resolveDir:fileURLToPath(new URL('../../../',import.meta.url)),loader:'tsx'},bundle:true,
 write:false,packages:'external',format:'esm',jsx:'transform'});
const code=compiled.outputFiles[0].text.replace(/from "([^"]+)"/g,(_,name)=>`from ${JSON.stringify(import.meta.resolve(name))}`);
const {WebflowCurrentTask,projectTrustedTaskNotice}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));

test('current task shows result bytes only from the Host receipt, never an unowned page preview',async()=>{
 const {window,document}=parseHTML('<html><body><div id="root"></div></body></html>');
 const keys=['window','document','HTMLElement','Element','IS_REACT_ACT_ENVIRONMENT'];
 const previous=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 Object.assign(globalThis,{window,document,HTMLElement:window.HTMLElement,Element:window.Element,IS_REACT_ACT_ENVIRONMENT:true});
 const root=createRoot(document.getElementById('root'));
 const stale='OLD_RESULT_2026-11-02T16:17:03.804Z';
 let value={source:{documentId:'new-document'},session:{url:'https://chatgpt.com/c/new-conversation',
  requestId:null,status:'尚未触发新请求',resultPreview:stale,fields:{},tasks:[],actions:{}},receipt:null};
 const controller={readBridgeState:async()=>value};
 try{
  await React.act(async()=>{root.render(React.createElement(WebflowCurrentTask,{controller}));});
  assert.ok(document.body.textContent.includes('尚未触发新请求'));
  assert.ok(!document.body.textContent.includes(stale));
 }finally{
  await React.act(async()=>root.unmount());
  for(const [key,descriptor] of previous){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
 }
});

test('current task displays one returned row without padding results or replacing its run identity',async()=>{
 const {window,document}=parseHTML('<html><body><div id="root"></div></body></html>');
 const keys=['window','document','HTMLElement','Element','IS_REACT_ACT_ENVIRONMENT'];
 const previous=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 Object.assign(globalThis,{window,document,HTMLElement:window.HTMLElement,Element:window.Element,IS_REACT_ACT_ENVIRONMENT:true});
 const root=createRoot(document.getElementById('root'));
 const returned={status:'success',count:1,results:[{title:'One observed page',url:'https://example.com/only-result'}]};
 const identity={candidateId:'one-candidate',requestId:'one-request',runId:'one-run',resultId:'one-result'};
 const controller={readBridgeState:async()=>({source:{documentId:'one-document'},
  session:{...identity,url:'https://chatgpt.com/c/one-conversation',status:'已完成',
   resultPreview:'OLD_UNRELATED_RESULT',fields:{},tasks:[],actions:{}},
  receipt:{...identity,execution:'completed',persistence:'verified',release:'released',delivery:'confirmed',value:returned}})};
 try{
  await React.act(async()=>{root.render(React.createElement(WebflowCurrentTask,{controller}));});
  const receipt=document.querySelector('[aria-label="同次运行回执"]');
  assert.ok(receipt);
  assert.deepEqual(JSON.parse(receipt.querySelector('pre').textContent),returned);
  const identityDetails=[...document.querySelectorAll('details')].find(node=>node.querySelector('summary')?.textContent==='本次身份');
  assert.deepEqual(JSON.parse(identityDetails.querySelector('pre').textContent),identity);
  assert.ok(receipt.textContent.includes('已核实同一 Run / Result'));
  assert.ok(receipt.textContent.includes('已释放'));
  assert.ok(receipt.textContent.includes('已确认新增结果消息'));
  assert.ok(!document.body.textContent.includes('OLD_UNRELATED_RESULT'));
 }finally{
  await React.act(async()=>root.unmount());
  for(const [key,descriptor] of previous){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
 }
});

test('a historical unknown stays separate from the current page and exposes no retry action',async()=>{
 const {window,document}=parseHTML('<html><body><div id="root"></div></body></html>');
 const keys=['window','document','HTMLElement','Element','IS_REACT_ACT_ENVIRONMENT'];
 const previous=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 Object.assign(globalThis,{window,document,HTMLElement:window.HTMLElement,Element:window.Element,IS_REACT_ACT_ENVIRONMENT:true});
 const root=createRoot(document.getElementById('root'));
 const controller={readBridgeState:async()=>({source:{documentId:'new-document'},session:null,receipt:null,
  history:[{requestId:'unknown-request',scope:{taskId:'baidu.search.top3'},createdAt:1,
   receipt:{execution:'unknown',delivery:'unknown',runId:'original-run'}}]})};
 try{
  await React.act(async()=>{root.render(React.createElement(WebflowCurrentTask,{controller}));});
  assert.equal(document.querySelector('[aria-label="同次运行回执"]'),null);
  assert.ok(document.body.textContent.includes('original-run'));
  assert.ok(document.body.textContent.includes('回传未知，禁止补发'));
  assert.ok(document.body.textContent.includes('刷新只查询，不会重跑或补发'));
  assert.deepEqual([...document.querySelectorAll('button')].map(node=>node.textContent),['刷新状态']);
 }finally{
  await React.act(async()=>root.unmount());
  for(const [key,descriptor] of previous){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
 }
});

test('an unstarted pending review displays no unknown execution or allocated resources',()=>{
 const receipt={execution:'not-started',release:'not-started',delivery:'not-sent',persistence:'not-confirmed'};
 const bridge={view:{source:{documentId:'current'},session:{requestId:'pending',status:'待批准',
  fields:{},tasks:[],actions:{}},receipt,history:[{requestId:'pending',pendingAuto:true,status:'prepared',
   scope:{taskId:'google.search.top3'},createdAt:1,receipt}]},error:'',revision:0,read:async()=>{}};
 const {document}=parseHTML(renderToStaticMarkup(React.createElement(WebflowCurrentTask,{controller:{},bridge})));
  const history=document.querySelector('[data-webflow-original-records]');
  assert.ok(history.textContent.includes('未批准 · 尚未执行'));
  const current=document.querySelector('[aria-label="同次运行回执"]');
  assert.ok(current.textContent.includes('尚未执行'));
  assert.ok(current.textContent.includes('未创建执行资源'));
  assert.ok(!current.textContent.includes('未知'));
  assert.ok([...document.querySelectorAll('[data-webflow-action]')].every(button=>button.disabled));
});

test('a supplied bridge owns task reads and unknown original records stay independent of listener readiness',async()=>{
 const {window,document}=parseHTML('<html><body><div id="root"></div></body></html>');
 const keys=['window','document','HTMLElement','Element','IS_REACT_ACT_ENVIRONMENT'];
 const previous=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 Object.assign(globalThis,{window,document,HTMLElement:window.HTMLElement,Element:window.Element,IS_REACT_ACT_ENVIRONMENT:true});
 const root=createRoot(document.getElementById('root'));let reads=0,queries=0;
 const controller={readBridgeState:async()=>{reads++;throw Error('duplicate owner');}};
 const bridge={view:{source:{documentId:'current'},session:null,listener:{state:'ready'},work:{state:'unknown'},
  history:[{requestId:'original',scope:{taskId:'search'},createdAt:1,receipt:{execution:'unknown',delivery:'unknown'}}]},
  error:'',revision:0,read:async()=>{queries++;},execute:async()=>null};
 try{
  await React.act(async()=>root.render(React.createElement(WebflowCurrentTask,{controller,bridge})));
  assert.equal(reads,0);
  assert.ok(document.querySelector('[data-webflow-original-records]').textContent.includes('original'));
  await React.act(async()=>document.querySelector('button').dispatchEvent(new window.Event('click',{bubbles:true})));
  assert.equal(queries,1);assert.equal(reads,0);
  bridge.view=null;bridge.error='读取失败';bridge.revision++;
  await React.act(async()=>root.render(React.createElement(WebflowCurrentTask,{controller,bridge})));
  assert.equal(document.querySelector('[data-webflow-original-records]'),null);
  assert.equal(document.querySelector('[role="alert"]').textContent,'读取失败');
 }finally{
  await React.act(async()=>root.unmount());
  for(const [key,descriptor] of previous){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
 }
});

test('an authoritative empty history query is visible but an unread or failed query never reports zero records',async()=>{
 const {window,document}=parseHTML('<html><body><div id="root"></div></body></html>');
 const keys=['window','document','HTMLElement','Element','IS_REACT_ACT_ENVIRONMENT'];
 const previous=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 Object.assign(globalThis,{window,document,HTMLElement:window.HTMLElement,Element:window.Element,IS_REACT_ACT_ENVIRONMENT:true});
 const root=createRoot(document.getElementById('root')),url='https://chatgpt.com/c/original';
 const bridge={view:{source:{url},history:[],historyRead:{url,checkedAt:1},session:null},error:'',revision:0,read:async()=>{}};
 try{
  await React.act(async()=>root.render(React.createElement(WebflowCurrentTask,{controller:{},bridge})));
  const query=document.querySelector('[data-webflow-history-query]');assert.ok(query);
  assert.ok(query.textContent.includes('0 条'));assert.ok(query.textContent.includes(url));
  assert.ok(query.textContent.includes('不代表旧任务未执行'));
  bridge.view={history:[],session:null};
  await React.act(async()=>root.render(React.createElement(WebflowCurrentTask,{controller:{},bridge})));
  assert.equal(document.querySelector('[data-webflow-history-query]'),null);
  bridge.error='读取失败';bridge.view=null;
  await React.act(async()=>root.render(React.createElement(WebflowCurrentTask,{controller:{},bridge})));
  assert.equal(document.querySelector('[data-webflow-history-query]'),null);
 }finally{
  await React.act(async()=>root.unmount());
  for(const [key,descriptor] of previous){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
 }
});

function currentTaskMarkup(session,receipt){
 const bridge={view:{source:{documentId:'current'},session:{requestId:'request',status:'待批准 · 未创建执行资源',
  runId:null,resultId:null,fields:{},tasks:[],actions:{},...session},receipt},error:'',revision:0,read:async()=>{}};
 return parseHTML(renderToStaticMarkup(React.createElement(WebflowCurrentTask,{controller:{},bridge}))).document;
}
function receiptFields(document){
 const receipt=document.querySelector('[aria-label="同次运行回执"]');
 return Object.fromEntries([...receipt.querySelectorAll('dt')].map(dt=>[dt.textContent,dt.nextElementSibling.textContent]));
}

test('a paused UNKNOWN run overrides the stale page status and exposes reserved identity without claiming a Result',()=>{
 const requestId='9be410ea-9ec5-4916-baa0-c7a695dc7480',runId='daa466e4-d9ac-43da-ac63-13f862a5fbe0',
  resultId='8d799fda-38ef-4e2f-966f-1b32507ff9d7';
 const document=currentTaskMarkup({requestId,pendingAuto:{scope:{targetUrl:'https://www.google.com/',args:{}}}},
  {requestId,runId,resultId,execution:'paused_unknown',persistence:'not-confirmed',release:'not-started',delivery:'unknown'});
 const fields=receiptFields(document);
 assert.match(document.querySelector('[data-webflow-current-status]').textContent,/暂停.*UNKNOWN/);
 assert.match(fields['执行资源'],/已创建 Run/);
 assert.match(fields['脚本执行'],/暂停.*UNKNOWN/);
 assert.match(fields['持久结果'],/尚未核实/);
 assert.match(fields['结果 ID'],/预留/);
 assert.match(fields['资源释放'],/未知/);
 assert.match(fields['原聊天交付'],/未知/);
 assert.equal(document.querySelector('[aria-label="任务范围审核"]'),null);
 const identity=[...document.querySelectorAll('details')].find(node=>node.querySelector('summary')?.textContent==='本次身份');
 const ids=JSON.parse(identity.querySelector('pre').textContent);
 assert.equal(ids.runId,runId);assert.equal(ids.resultId,resultId);
 assert.ok(!document.body.textContent.includes('未创建执行资源'));
});

test('allocated resources, persistence, delivery and retirement remain independent',()=>{
 for(const [execution,persistence,release,delivery] of [
  ['running','not-confirmed','not-confirmed','not-sent'],
  ['unknown','not-available','unknown','unknown'],
  ['completed','verified','not-confirmed','submitted'],
  ['failed','verified','released','not-sent'],
  ['completed','verified','released','confirmed']]){
  const document=currentTaskMarkup({}, {requestId:'request',runId:'host-run',resultId:'reserved-result',
   execution,persistence,release,delivery});
  const fields=receiptFields(document);
  assert.match(fields['执行资源'],/已创建 Run/);
  assert.equal(fields['持久结果'].includes('已核实'),persistence==='verified');
  assert.equal(fields['结果 ID'].includes('预留'),persistence!=='verified');
  assert.equal(fields['资源释放']==='已释放',release==='released');
  assert.equal(fields['原聊天交付']==='已确认新增结果消息',delivery==='confirmed');
 }
});

test('unknown without a Run is not proof that resources were never created',()=>{
 const document=currentTaskMarkup({}, {execution:'unknown',release:'unknown',delivery:'unknown',persistence:'not-confirmed'});
 assert.match(receiptFields(document)['执行资源'],/未知/);
 assert.ok(!document.body.textContent.includes('未创建执行资源'));
});

test('a different request receipt cannot supply current identity or result bytes',()=>{
 const document=currentTaskMarkup({}, {requestId:'another-request',runId:'OTHER_RUN',resultId:'OTHER_RESULT',
  execution:'completed',persistence:'verified',release:'released',delivery:'confirmed',value:'OTHER_BYTES'});
 assert.equal(document.querySelector('[aria-label="同次运行回执"]'),null);
 assert.ok(!document.body.textContent.includes('OTHER_'));
});

test('the stopped original Run shows a durable stop Result, release and the concrete focus error without search success',()=>{
 const requestId='9be410ea-9ec5-4916-baa0-c7a695dc7480',runId='daa466e4-d9ac-43da-ac63-13f862a5fbe0',
  resultId='8d799fda-38ef-4e2f-966f-1b32507ff9d7';
 const message='执行窗口聚焦读回超时，状态未确认；UNKNOWN 不会自动重试。';
 const document=currentTaskMarkup({requestId}, {requestId,runId,resultId,execution:'stopped',
  persistence:'verified',release:'released',delivery:'not-sent',error:{code:'E_WINDOW_FOCUS_UNCONFIRMED',message}});
 const fields=receiptFields(document);
 assert.equal(fields['脚本执行'],'已停止');
 assert.equal(document.querySelector('[data-webflow-current-status]').textContent,'已停止');
 assert.equal(fields['持久结果'],'已核实同一 Run / Result');
 assert.equal(fields['资源释放'],'已释放');
 assert.equal(fields['原聊天交付'],'尚未发送');
 assert.ok(!fields['结果 ID'].includes('预留'));
 assert.equal(document.querySelector('[aria-label="同次运行回执"] [role="alert"]').textContent,
  `E_WINDOW_FOCUS_UNCONFIRMED：${message}`);
 assert.ok(!document.body.textContent.includes('已完成'));
 assert.equal(document.querySelector('[aria-label="同次运行回执"] details'),null);
});

test('an authoritative unstarted receipt never borrows stale page Run or Result identities',()=>{
 const document=currentTaskMarkup({runId:'STALE_RUN',resultId:'STALE_RESULT'},
  {requestId:'request',runId:null,resultId:null,execution:'not-started',release:'not-started',
   persistence:'not-confirmed',delivery:'not-sent'});
 assert.equal(receiptFields(document)['执行资源'],'未创建执行资源');
 assert.ok(!document.body.textContent.includes('STALE_'));
});


test('trusted automatic notices require same original receipt and distinguish execution from delivery',()=>{
 const view={source:{tabId:4,documentId:'doc-4',url:'https://chatgpt.com/c/current'},
   session:{requestId:'req-4'},receipt:{requestId:'req-4',runId:'run-4',execution:'running',
    persistence:'pending',delivery:'not-sent',release:'running'}};
 assert.equal(projectTrustedTaskNotice({...view,receipt:{...view.receipt,requestId:'different'}}),null);
 assert.equal(projectTrustedTaskNotice({...view,receipt:{...view.receipt,execution:'not-started',runId:null}}),null);
 assert.equal(projectTrustedTaskNotice(view).phase,'running');
 const incomplete={...view,receipt:{...view.receipt,execution:'completed',
   resultId:'result-4',persistence:'pending',release:'running'}};
 assert.equal(projectTrustedTaskNotice(incomplete).phase,'unverified');
 assert.equal(projectTrustedTaskNotice({...incomplete,receipt:{...incomplete.receipt,
   persistence:'verified',release:'released'}}).phase,'completed');
 const delivered=projectTrustedTaskNotice({...incomplete,receipt:{...incomplete.receipt,
   persistence:'verified',release:'released',delivery:'confirmed'}});
 assert.equal(delivered.phase,'delivered');
 assert.match(delivered.options.message,/回传已确认/);
 const failed=projectTrustedTaskNotice({...view,receipt:{...view.receipt,execution:'failed',
   error:{code:'<script>',message:'page supplied'}}});
 assert.equal(failed.phase,'failed');
 assert.doesNotMatch(JSON.stringify(failed),/script|page supplied/);
 assert.equal(projectTrustedTaskNotice({...view,receipt:{...view.receipt,execution:'paused_unknown'}}).phase,'unknown');
});

test('trusted panel reuses a single owner-bound Toast, dedupes polls, and never revives a dismissed notice',async()=>{
 const {window,document}=parseHTML('<html><body><div id="root"></div></body></html>');
 const keys=['window','document','HTMLElement','Element','IS_REACT_ACT_ENVIRONMENT'];
 const previous=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 Object.assign(globalThis,{window,document,HTMLElement:window.HTMLElement,Element:window.Element,IS_REACT_ACT_ENVIRONMENT:true});
 const rows=new Map(),calls=[];let seq=0;
 const noticeView={
  addToolToast(message,options,owner){const id=++seq;rows.set(id,{message,options,owner});
   calls.push('open');return id;},
  updateToolToast(id,message,options,owner){if(rows.get(id)?.owner!==owner)return false;
   rows.set(id,{message,options,owner});calls.push('update');return true;},
  hasToast(id,owner){return rows.get(id)?.owner===owner;},
  dismissToast(id){rows.delete(id);calls.push('dismiss');},
  clearToastsByOwner(owner){for(const [id,row] of rows)if(row.owner===owner)rows.delete(id);
   calls.push('clear');}
 };
 const source={tabId:7,documentId:'doc-7',url:'https://chatgpt.com/c/seven'};
 const session={requestId:'req-7',url:source.url,fields:{},tasks:[],actions:{}};
 const build=(execution,rest={})=>({source,session,receipt:{requestId:session.requestId,
   runId:'run-7',resultId:'result-7',execution,persistence:'pending',release:'running',
   delivery:'not-sent',...rest}});
 const bridge=view=>({view,error:'',revision:0,read:async()=>{},execute:async()=>{}});
 const root=createRoot(document.getElementById('root'));
 const render=async view=>React.act(async()=>root.render(React.createElement(WebflowCurrentTask,
   {controller:{},bridge:bridge(view),noticeView})));
 try{
  await render(null);
  const running=build('running');
  await render(running);assert.deepEqual(calls,['open']);
  await render({...running});assert.deepEqual(calls,['open'],'polling cannot create or update duplicate notices');
  await render(build('completed'));assert.equal(calls.at(-1),'update');
  assert.match([...rows.values()][0].message,/待核验/);
  await render(build('completed',{persistence:'verified',release:'released'}));
  assert.match([...rows.values()][0].message,/不等于业务成功/);
  await render(build('completed',{persistence:'verified',release:'released',delivery:'confirmed'}));
  assert.match([...rows.values()][0].message,/回传已确认/);
  rows.clear();
  await render(build('paused_unknown'));
  assert.equal(calls.filter(x=>x==='open').length,1,'dismissal must not recreate a notice');
  assert.equal(rows.size,0);
 }finally{
  await React.act(async()=>root.unmount());
  for(const [key,descriptor] of previous){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
 }
 assert.ok(calls.includes('clear'),'unmount clears its own transient Host notices');
});
