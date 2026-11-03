import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {parseHTML} from 'linkedom';
import * as React from 'react';
import {createRoot} from 'react-dom/client';

const compiled=await build({stdin:{contents:"export {WebflowCurrentTask} from './projects/webflow/trusted/CurrentTask.tsx';",
 resolveDir:fileURLToPath(new URL('../../../',import.meta.url)),loader:'tsx'},bundle:true,
 write:false,packages:'external',format:'esm',jsx:'transform'});
const code=compiled.outputFiles[0].text.replace(/from "([^"]+)"/g,(_,name)=>`from ${JSON.stringify(import.meta.resolve(name))}`);
const {WebflowCurrentTask}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));

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
  assert.deepEqual(JSON.parse(document.querySelector('details pre').textContent),identity);
  assert.ok(receipt.textContent.includes('已核实同一 Run / Result'));
  assert.ok(receipt.textContent.includes('released'));
  assert.ok(receipt.textContent.includes('已确认新增结果消息'));
  assert.ok(!document.body.textContent.includes('OLD_UNRELATED_RESULT'));
 }finally{
  await React.act(async()=>root.unmount());
  for(const [key,descriptor] of previous){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
 }
});
