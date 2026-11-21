import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {transform} from 'esbuild';
import {JSDOM} from 'jsdom';
import * as React from 'react';
import {createRoot} from 'react-dom/client';

const transformed=await transform(await readFile(new URL('../../src/ui/react/components/update-notice.tsx',import.meta.url),'utf8'),
  {loader:'tsx',format:'esm',jsx:'transform'});
const code=transformed.code.replaceAll('"react"',JSON.stringify(import.meta.resolve('react')));
const {useUpdateNoticeController,UpdateNoticeSlot}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const base={records:[],newCount:1,unreadCount:1,actionableCount:1,badgeCount:1,
  browserPendingCount:0,globalMode:'toast+inbox',toolModes:{},openRequestedAt:0,verified:true,problem:null};

async function fixture(t,sendMessage){
  const dom=new JSDOM('<div id="root"></div>');let controller;
  for(const [key,value] of Object.entries({window:dom.window,document:dom.window.document,
    IS_REACT_ACT_ENVIRONMENT:true,chrome:{runtime:{sendMessage},storage:{onChanged:{addListener(){},removeListener(){}}}}})){
    const previous=Object.getOwnPropertyDescriptor(globalThis,key);
    Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
    t.after(()=>previous?Object.defineProperty(globalThis,key,previous):delete globalThis[key]);
  }
  function View(){
    controller=useUpdateNoticeController();
    return React.createElement(UpdateNoticeSlot,{controller:{...controller,opened:true},showTrigger:false});
  }
  const root=createRoot(document.getElementById('root'));
  await React.act(async()=>root.render(React.createElement(View)));
  return {dom,controller:()=>controller,async close(){
    await React.act(async()=>root.unmount());dom.window.close();
  }};
}

test('failed fresh check removes the previous verified count and never renders an all-current result',async t=>{
  const calls=[];let fail=false;
  const f=await fixture(t,async message=>{
    calls.push(message);
    if(fail)return {ok:false,error:{code:'E_UPDATE_UNAVAILABLE',message:'发行服务未就绪'}};
    return {ok:true,data:structuredClone(base)};
  });
  try{
    assert.equal(f.controller().state.verified,true);
    fail=true;await React.act(async()=>f.controller().refresh({fresh:true}));
    assert.equal(calls.at(-1).fresh,true);
    assert.equal(f.controller().state.verified,false);
    assert.equal(f.controller().state.badgeCount,0);
    assert.match(f.dom.window.document.body.textContent,/尚未完成更新检查/);
    assert.doesNotMatch(f.dom.window.document.body.textContent,/全部最新/);
  }finally{await f.close();}
});

test('a manual check queued during a passive UI request still sends fresh to the Worker',async t=>{
  const calls=[];let release;
  const first=new Promise(resolve=>{release=resolve;});
  const f=await fixture(t,async message=>{
    calls.push(message);if(calls.length===1)await first;
    return {ok:true,data:structuredClone(base)};
  });
  try{
    assert.equal(calls.length,1);assert.equal(calls[0].fresh,undefined);
    await React.act(async()=>{const pending=f.controller().refresh({fresh:true});release();await pending;});
    assert.equal(calls.length,2);assert.equal(calls[1].fresh,true);
    assert.equal(f.controller().state.verified,true);
  }finally{await f.close();}
});

test('an open update view loses actionable status when the verified signature expires',async t=>{
  const f=await fixture(t,async()=>({ok:true,data:{...base,expiresAt:new Date(Date.now()+80).toISOString()}}));
  try{
    assert.equal(f.controller().state.verified,true);
    await React.act(async()=>new Promise(resolve=>setTimeout(resolve,110)));
    assert.equal(f.controller().state.verified,false);
    assert.equal(f.controller().state.badgeCount,0);
    assert.equal(f.controller().state.problem,'E_UPDATE_INDEX_EXPIRED');
  }finally{await f.close();}
});

test('unconfigured sources are explicit and signed changelog text is escaped',async t=>{
  const row={key:'test',kind:'sidebar-tool',id:'example-tool',title:'Example',status:'available',
    version:'1.0.1',fromVersion:'1.0.0',ignoredAt:null,viewedAt:null,newCapabilities:[],
    source:'opendesk/example-tool',sha256:'a'.repeat(64),changelog:'<script>unexpected()</script>',
    updateSource:{sourceId:'opendesk-official',kind:'sidebar-tool',channel:'stable',origin:'https://market.example'}};
  const f=await fixture(t,async()=>({ok:true,data:{...base,verified:false,badgeCount:0,
    problem:'E_UPDATE_NOT_CONFIGURED',records:[row]}}));
  try{
    assert.match(f.dom.window.document.body.textContent,/在线更新来源尚未配置/);
    assert.match(f.dom.window.document.body.textContent,/<script>unexpected\(\)<\/script>/);
    assert.equal(f.dom.window.document.querySelector('script'),null);
    const review=[...f.dom.window.document.querySelectorAll('button')].find(node=>node.textContent==='审阅并更新');
    assert.equal(review.disabled,true);
  }finally{await f.close();}
});
