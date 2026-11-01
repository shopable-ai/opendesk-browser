import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import * as React from 'react';
import {createExtensionCenterDOM} from '../../../../tests/helpers/extension-center-react-dom.mjs';
import {App} from './react-fixture.mjs';

const context=vm.createContext({URL,TextEncoder,crypto:globalThis.crypto});
for(const path of ['../src/app-model.js','../adapters/app-sdk.js'])
  vm.runInContext(await readFile(new URL(path,import.meta.url),'utf8'),context);
export const settle=()=>new Promise(resolve=>setImmediate(resolve));
export const base={url:'http://127.0.0.1:43233/page-1.html',itemConfig:{_listContainer:'#books',_listItem:':scope > li',id:'.::data-id',title:'h2::text',price:'.price::text'},nextPageSelector:'a.next',maxPages:50,dedupeKey:'id'};
export const records=[['A','浏览器工具','19.50'],['B','本地任务','25.00'],['C','声明式采集','30.00'],['D','持久结果','0.00'],['E','精确分页','42.25'],['F','停止与恢复','']].map(([id,title,price])=>({id,title,price}));

export async function fixture(t,{pendingAi=false,generate=null,clearGate=null}={}){
  const saved={...base,maxPages:10};
  const rows=new Map([['capture-config',{value:{schemaVersion:1,selectedId:'saved',records:[{id:'saved',name:'已有采集配置',config:saved}]},etag:'0'}],['local-runner-state',{value:null,etag:'0'}],['ai-pending-request',{value:pendingAi?{schemaVersion:1,requestId:'unknown-ai'}:null,etag:'0'}]]);
  const calls=[];let run;
  const previous=Object.fromEntries(['OpenDeskTool','ScrapyAppModel','ScrapyAppSdk','requestAnimationFrame'].map(key=>[key,globalThis[key]]));
  const tool={setState(){},request:async(operation,payload)=>{
    calls.push({operation,payload:structuredClone(payload)});
    if(operation==='storage.get')return structuredClone(rows.get(payload.key));
    if(operation==='storage.set'){
      const row=rows.get(payload.key);assert.equal(payload.ifMatch,row.etag,'preserve CAS');rows.set(payload.key,{value:structuredClone(payload.value),etag:String(Number(row.etag)+1)});if(payload.key==='ai-pending-request'&&payload.value===null&&clearGate)return clearGate.promise;return {saved:true};
    }
    if(operation==='currentPage.info')return {status:'available',title:'公开 Fixture',url:base.url};
    if(operation==='ai.info'){if(generate)return {provider:'fixture',generation:1,model:'test'};throw Error('No Provider configured');}
    if(operation==='ai.generate')return generate(payload);
    if(operation==='ai.cancel')return {requestId:payload.requestId,state:'unknown'};
    if(operation==='localTasks.export')return {started:true,downloadId:42};
    if(operation==='localTasks.request'){
      if(payload.path.includes('/records?'))return {records:run.recordsCount?structuredClone(records):[],total:run.recordsCount,offset:0};
      if(payload.method==='POST'&&payload.path==='/v1/runs'){
        const {requestId,mode,config,previewRunId}=payload.body;
        run={requestId,runId:mode==='preview'?'preview-1':'full-1',mode,config:structuredClone(config),configHash:'fixture-hash',...(previewRunId?{previewRunId}:{}),status:mode==='preview'?'completed':'running',pagesVisited:3,recordsCount:6,fields:['id','title','price'],completeness:{id:{total:6,nonEmpty:6,ratio:1},title:{total:6,nonEmpty:6,ratio:1},price:{total:6,nonEmpty:5,ratio:5/6}},errors:[],workerExited:mode==='preview',previewPassed:mode==='preview'};
        if(config.url==='https://book.douban.com/top250'){run={...run,status:'failed',pagesVisited:0,recordsCount:0,previewPassed:false,completeness:Object.fromEntries(run.fields.map(f=>[f,{total:0,nonEmpty:0,ratio:0}])),errors:[{code:'ROBOTS_UNAVAILABLE',message:'robots.txt did not permit crawling'}]};}
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
