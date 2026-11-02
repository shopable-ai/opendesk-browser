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
