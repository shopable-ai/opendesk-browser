import test from 'node:test';
import assert from 'node:assert/strict';
import {initReadingToc} from '../../src/reading-toc/page.js';
import {READING_TOC_SITE_STORE,READING_TOC_PROTOCOL} from '../../src/reading-toc/policy.js';
import {SIDEBAR_TOOL_STORE} from '../../src/ui/sidebar-tools/package.js';

const tick=()=>new Promise(resolve=>setImmediate(resolve));
const tool={format:'opendesk.sidebar-tool.v1',id:'test-toc',version:'1.0.0',
  title:'目录测试',description:'Trusted controller test',capabilities:['page.toc'],
  html:'<main>目录</main>',css:'',js:'void 0;'};

function emitter(){
  const handlers=new Set();
  return {handlers,addListener:f=>handlers.add(f),removeListener:f=>handlers.delete(f),
    send:(...args)=>{for(const f of [...handlers])f(...args);}};
}
function pageFixture(){
  const location={href:'https://example.com/article'};
  const root={tagName:'HTML',scrollTop:0,clientHeight:700,scrollHeight:2200,addEventListener(){},
    removeEventListener(){},getBoundingClientRect(){return {top:0};}};
  const heading={tagName:'H1',textContent:'第一节',id:'original-heading',
    isConnected:true,parentElement:null,getClientRects(){return [1]},
    closest(){return null;},getBoundingClientRect(){return {top:350-root.scrollTop,bottom:380-root.scrollTop}}};
  const body={tagName:'BODY',parentElement:root};
  heading.parentElement=body;
  const listeners=new Map();
  const add=(type,fn)=>{if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn);};
  const remove=(type,fn)=>listeners.get(type)?.delete(fn);
  let frames=0,disconnects=0;
  const win={top:null,location,innerHeight:700,
    getComputedStyle(){return {display:'block',visibility:'visible',overflowY:'visible'};},
    addEventListener:add,removeEventListener:remove,
    requestAnimationFrame(callback){return setTimeout(()=>{frames++;callback(performance.now());},1);},
    cancelAnimationFrame:clearTimeout,
    setTimeout,clearTimeout,
    scrollTo({top}){root.scrollTop=top;}};
  win.top=win;
  const doc={body,scrollingElement:root,defaultView:win,
    querySelector(){return null;},
    querySelectorAll(){return [heading];},
    addEventListener:add,removeEventListener:remove};
  const messages=emitter(),changes=emitter();
  const state=new Map([[SIDEBAR_TOOL_STORE,[tool]],
    [READING_TOC_SITE_STORE,{'test-toc':['https://example.com']}]]);
  const api={
    runtime:{id:'self-extension',getURL:p=>'chrome-extension://self-extension/'+p,
      onMessage:messages},
    storage:{local:{async get(keys){
      const array=Array.isArray(keys)?keys:[keys];
      return Object.fromEntries(array.map(key=>[key,state.get(key)]));
    }},onChanged:changes}
  };
  class Observer {
    constructor(callback){this.callback=callback;}
    observe(){Observer.active++;}
    disconnect(){disconnects++;Observer.active--;}
  }
  Observer.active=0;
  const send=(message,sender={id:'self-extension',url:api.runtime.getURL('ui/tool.html')})=>
    new Promise(resolve=>{
      let delivered=false;
      for(const handler of messages.handlers){
        const result=handler({protocol:READING_TOC_PROTOCOL,toolId:tool.id,
          operation:'toc.snapshot',expectedUrl:location.href,...message},sender,value=>{delivered=true;resolve(value);});
        if(result===true)break;
      }
      if(!messages.handlers.size&&!delivered)resolve(null);
    });
  return {api,doc,win,heading,root,messages,changes,state,send,Observer,
    get disconnects(){return disconnects;},get frames(){return frames;}};
}

test('R4.1 trusted content service verifies sender, site and source, then revokes on site disable',async()=>{
  const f=pageFixture(),old=globalThis.MutationObserver;
  globalThis.MutationObserver=f.Observer;
  let controller;
  try {
    controller=initReadingToc({api:f.api,doc:f.doc,win:f.win});
    await tick();await tick();
    assert.equal(f.Observer.active,1,'granted site starts one trusted observer without a Sidebar iframe');
    const forged=await f.send({}, {id:'evil-extension',url:'chrome-extension://evil/ui/tool.html'});
    assert.equal(forged.ok,false);
    const wrongUrl=await f.send({expectedUrl:'https://example.com/old'});
    assert.equal(wrongUrl.ok,false);
    const data=await f.send({});
    assert.equal(data.ok,true);
    assert.equal(data.data.items.length,1);
    assert.equal(data.data.items[0].label,'第一节');
    assert.equal(data.data.url,f.win.location.href);
    assert.equal(f.heading.id,'original-heading','never rewrite a website heading id');
    assert.equal(f.Observer.active,1,'closing Sidebar cannot stop a granted page service');
    const wrongSource=await f.send({operation:'toc.navigate',id:data.data.items[0].id,sourceId:'s-999'});
    assert.equal(wrongSource.ok,false,'source mismatch fails instead of navigating a same-name heading');
    const jump=await f.send({operation:'toc.navigate',id:data.data.items[0].id,sourceId:data.data.items[0].sourceId});
    assert.equal(jump.ok,true,'same source and element must navigate');
    assert.equal(jump.data.sourceId,data.data.items[0].sourceId);
    assert(f.root.scrollTop>=250,'real scroll service moved the document scroll root');
    const revisionBefore=data.data.revision;
    f.win.location.href='https://example.com/new-route';
    await controller.refreshPolicy();
    const spa=await f.send({});
    assert.equal(spa.ok,true,'same-origin SPA changes preserve an authorized controller');
    assert.equal(spa.data.url,'https://example.com/new-route');
    assert(spa.data.revision>revisionBefore,'SPA re-indexes rather than serving stale prior content');
    assert.equal(f.Observer.active,1,'SPA reuses the same content observer');
    f.state.set(READING_TOC_SITE_STORE,{});
    f.changes.send({[READING_TOC_SITE_STORE]:{newValue:{}}},'local');
    await tick();await tick();
    assert.equal(f.Observer.active,0,'grant revocation disconnects content observer');
    assert.equal(f.disconnects,1);
    const after=await f.send({});
    assert.equal(after.ok,false,'revoked site can no longer retrieve index');
    assert.equal(f.heading.id,'original-heading');
  }finally{controller?.dispose();globalThis.MutationObserver=old;}
});
test('R4.1 never starts indexing an unapproved website; unload detaches listeners',async()=>{
  const f=pageFixture(),old=globalThis.MutationObserver;
  globalThis.MutationObserver=f.Observer;
  f.state.set(READING_TOC_SITE_STORE,{'test-toc':['https://different.example']});
  const controller=initReadingToc({api:f.api,doc:f.doc,win:f.win});
  try {
    await tick();await tick();
    assert.equal(f.Observer.active,0);
    const response=await f.send({});
    assert.equal(response.ok,false);
    assert.equal(f.messages.handlers.size,1);
    controller.dispose();
    assert.equal(f.messages.handlers.size,0);
    assert.equal(f.changes.handlers.size,0);
  }finally{controller?.dispose();globalThis.MutationObserver=old;}
});
