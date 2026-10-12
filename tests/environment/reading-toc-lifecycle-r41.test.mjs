import test from 'node:test';
import assert from 'node:assert/strict';
import {initReadingToc} from '../../src/reading-toc/page.js';
import {READING_TOC_SITE_STORE,READING_TOC_PROTOCOL,READING_TOC_PAGE_RULES_STORE,READING_TOC_VISIBILITY_STORE,
  changeTocPageAllowed,changeTocSiteAllowed,changeReadingTocVisibility} from '../../src/reading-toc/policy.js';
import {SIDEBAR_TOOL_STORE} from '../../src/ui/sidebar-tools/package.js';
import {SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE} from '../../src/ui/sidebar-tools/lifecycle.js';

const tick=()=>new Promise(resolve=>setImmediate(resolve));
const tool={format:'opendesk.sidebar-tool.v1',id:'test-toc',version:'1.0.0',
  title:'目录测试',description:'Trusted controller test',capabilities:['page.toc'],
  html:'<main>目录</main>',css:'',js:'void 0;'};

test('built-in default access starts without grants and site/page stops release observers',async()=>{
  const f=pageFixture(),id='reading-toc',prior=globalThis.MutationObserver;
  f.state.set(SIDEBAR_TOOL_STORE,[{...tool,id}]);f.state.delete(READING_TOC_SITE_STORE);
  // Isolate the content-service lifecycle from the separately tested view DOM.
  f.state.set(READING_TOC_VISIBILITY_STORE,changeReadingTocVisibility({},id,f.win.location.href,'site',true));
  globalThis.MutationObserver=f.Observer;
  const controller=initReadingToc({api:f.api,doc:f.doc,win:f.win});
  const request=()=>f.send({toolId:id});
  const change=(key,value)=>{f.state.set(key,value);f.changes.send({[key]:{newValue:value}},'local');};
  try{
    await tick();await tick();assert.equal(f.Observer.active,1);
    assert.equal((await request()).ok,true,'no positive origin grant is needed for the reader');
    change(READING_TOC_SITE_STORE,changeTocSiteAllowed({},id,f.win.location.href,false));
    assert.equal(f.Observer.active,0);await tick();await tick();assert.equal((await request()).ok,false);
    change(READING_TOC_SITE_STORE,{});await tick();await tick();assert.equal(f.Observer.active,1);
    change(READING_TOC_PAGE_RULES_STORE,changeTocPageAllowed({},id,f.win.location.href,false));
    assert.equal(f.Observer.active,0);await tick();await tick();assert.equal((await request()).ok,false);
    change(READING_TOC_PAGE_RULES_STORE,{});await tick();await tick();assert.equal((await request()).ok,true);
    change(SIDEBAR_TOOL_ENABLE_STORE,{[id]:false});
    assert.equal(f.Observer.active,0);await tick();await tick();assert.equal((await request()).ok,false);
    change(SIDEBAR_TOOL_ENABLE_STORE,{[id]:true});await tick();await tick();
    change(SIDEBAR_TOOL_STORE,[]);assert.equal(f.Observer.active,0);await tick();await tick();
    assert.equal((await request()).ok,false,'default access never survives uninstall');
  }finally{controller.dispose();globalThis.MutationObserver=prior;}
});

test('R26 stop releases TOC observers immediately and BFCache cannot restore disabled authority',async()=>{
  const f=pageFixture(),prior=globalThis.MutationObserver;globalThis.MutationObserver=f.Observer;
  const controller=initReadingToc({api:f.api,doc:f.doc,win:f.win});
  try{
    await tick();await tick();assert.equal(f.Observer.active,1);
    const stopped={[tool.id]:false};f.state.set(SIDEBAR_TOOL_ENABLE_STORE,stopped);
    f.changes.send({[SIDEBAR_TOOL_ENABLE_STORE]:{newValue:stopped}},'local');
    assert.equal(f.Observer.active,0);await tick();await tick();
    assert.equal((await f.send({})).ok,false);
    f.dispatch('pagehide',{persisted:true});f.dispatch('pageshow',{persisted:true});await tick();await tick();
    assert.equal(f.Observer.active,0);assert.equal((await f.send({})).ok,false);
    f.state.set(SIDEBAR_TOOL_ENABLE_STORE,{[tool.id]:true});
    f.state.set(TOOL_REVOCATION_EPOCHS_STORE,{[tool.id]:'resumed-generation'});
    f.changes.send({[SIDEBAR_TOOL_ENABLE_STORE]:{oldValue:stopped,newValue:{[tool.id]:true}}},'local');await tick();await tick();
    assert.equal(f.Observer.active,1);assert.equal((await f.send({})).ok,false,'old request cannot inherit resumed generation');
    assert.equal((await f.send({installEpoch:'resumed-generation'})).ok,true);
  }finally{controller.dispose();globalThis.MutationObserver=prior;}
});

test('R26 persisted generation cancels in-flight navigation even without a storage notification',async()=>{
  const f=pageFixture(),prior=globalThis.MutationObserver;globalThis.MutationObserver=f.Observer;
  const controller=initReadingToc({api:f.api,doc:f.doc,win:f.win});
  try{
    await tick();await tick();const item=(await f.send({})).data.items[0],frames=[];let scrolls=0;
    f.win.requestAnimationFrame=fn=>{frames.push(fn);return frames.length;};
    f.win.scrollTo=({top})=>{scrolls++;f.root.scrollTop=top;};
    const jump=f.send({operation:'toc.navigate',id:item.id,sourceId:item.sourceId});await tick();
    f.state.set(TOOL_REVOCATION_EPOCHS_STORE,{[tool.id]:'resumed-generation'});
    for(let i=0;i<2;i++)for(const fn of frames.splice(0))fn(performance.now());
    assert.equal((await jump).ok,false);assert.equal(scrolls,1,'revoked jump never performs a corrective scroll');
  }finally{controller.dispose();globalThis.MutationObserver=prior;}
});

test('R4.7 excluding the current page disconnects the DOM observer and refuses further TOC reads',async()=>{
  const f=pageFixture(),prior=globalThis.MutationObserver;
  globalThis.MutationObserver=f.Observer;
  const controller=initReadingToc({api:f.api,doc:f.doc,win:f.win});
  try{
    await tick();await tick();
    assert.equal(f.Observer.active,1);
    const denied=changeTocPageAllowed({},tool.id,f.win.location.href,false);
    f.state.set(READING_TOC_PAGE_RULES_STORE,denied);
    f.changes.send({[READING_TOC_PAGE_RULES_STORE]:{newValue:denied}},'local');
    await tick();await tick();
    assert.equal(f.Observer.active,0,'denied page has no observer');
    assert.equal((await f.send({operation:'toc.snapshot'})).ok,false,'denied page cannot read stale headings');
    f.state.set(READING_TOC_PAGE_RULES_STORE,{});
    f.changes.send({[READING_TOC_PAGE_RULES_STORE]:{newValue:{}}},'local');
    await tick();await tick();
    assert.equal(f.Observer.active,1,'restoring a page reactivates a single observer');
    assert.equal((await f.send({operation:'toc.snapshot'})).ok,true);
  }finally{controller.dispose();globalThis.MutationObserver=prior;}
});

test('revoking one tool cancels its in-flight jump while another tool remains authorized',async()=>{
  const f=pageFixture(),old=globalThis.MutationObserver;
  globalThis.MutationObserver=f.Observer;let controller;
  try{
    f.state.set(SIDEBAR_TOOL_STORE,[tool,{...tool,id:'other-toc'}]);
    f.state.set(READING_TOC_SITE_STORE,{'test-toc':['https://example.com'],'other-toc':['https://example.com']});
    controller=initReadingToc({api:f.api,doc:f.doc,win:f.win});await tick();await tick();
    const item=(await f.send({})).data.items[0],frames=[];let scrolls=0;
    f.win.requestAnimationFrame=fn=>{frames.push(fn);return frames.length;};
    f.win.scrollTo=({top})=>{scrolls++;f.root.scrollTop=top;};
    const jump=f.send({operation:'toc.navigate',id:item.id,sourceId:item.sourceId});await tick();
    const sites={'other-toc':['https://example.com']};f.state.set(READING_TOC_SITE_STORE,sites);
    f.changes.send({[READING_TOC_SITE_STORE]:{newValue:sites}},'local');
    for(let i=0;i<2;i++)for(const fn of frames.splice(0))fn(performance.now());
    const result=await jump;assert.equal(result.ok,false);assert.equal(scrolls,1,'no correction after revocation');
    await tick();assert.equal((await f.send({toolId:'other-toc'})).ok,true);
  }finally{controller?.dispose();globalThis.MutationObserver=old;}
});

test('R26 stopping an unrelated notes tool preserves the TOC observer and pending jump',async()=>{
  const f=pageFixture(),old=globalThis.MutationObserver;globalThis.MutationObserver=f.Observer;let controller;
  try{
    controller=initReadingToc({api:f.api,doc:f.doc,win:f.win});await tick();await tick();
    const item=(await f.send({})).data.items[0],frames=[];
    f.win.requestAnimationFrame=fn=>{frames.push(fn);return frames.length;};
    const jump=f.send({operation:'toc.navigate',id:item.id,sourceId:item.sourceId});await tick();
    const next={'quick-notes':false};f.state.set(SIDEBAR_TOOL_ENABLE_STORE,next);
    f.changes.send({[SIDEBAR_TOOL_ENABLE_STORE]:{newValue:next}},'local');
    assert.equal(f.Observer.active,1);
    for(let i=0;i<24;i++){for(const fn of frames.splice(0))fn(performance.now());await tick();}
    assert.equal((await jump).ok,true);
  }finally{controller?.dispose();globalThis.MutationObserver=old;}
});

test('R26 disable during initial policy read invalidates its stale completion',async()=>{
  const f=pageFixture(),old=globalThis.MutationObserver;globalThis.MutationObserver=f.Observer;let controller,release;
  try{
    const get=f.api.storage.local.get;let first=true;
    f.api.storage.local.get=async keys=>{
      const snapshot=await get(keys);
      if(first){first=false;await new Promise(resolve=>{release=resolve;});}
      return snapshot;
    };
    controller=initReadingToc({api:f.api,doc:f.doc,win:f.win});await tick();
    const next={'test-toc':false};f.state.set(SIDEBAR_TOOL_ENABLE_STORE,next);
    f.changes.send({[SIDEBAR_TOOL_ENABLE_STORE]:{newValue:next}},'local');await tick();release();await tick();await tick();
    assert.equal(f.Observer.active,0);assert.equal((await f.send({})).ok,false);
  }finally{release?.();controller?.dispose();globalThis.MutationObserver=old;}
});

test('BFCache suspension releases observers and pageshow rechecks authorization',async()=>{
  const f=pageFixture(),old=globalThis.MutationObserver;globalThis.MutationObserver=f.Observer;
  const controller=initReadingToc({api:f.api,doc:f.doc,win:f.win});
  try{
    await tick();await tick();assert.equal(f.Observer.active,1);
    f.dispatch('pagehide',{persisted:true});assert.equal(f.Observer.active,0);
    assert.equal((await f.send({})).ok,false);
    f.dispatch('pageshow',{persisted:true});await tick();await tick();
    assert.equal((await f.send({})).ok,true);assert.equal(f.Observer.active,1);
    f.dispatch('pagehide',{persisted:false});assert.equal(f.messages.handlers.size,0);
    assert.equal(f.changes.handlers.size,0);assert.equal(f.Observer.active,0);
  }finally{controller.dispose();globalThis.MutationObserver=old;}
});

test('stacked fixed bars extend the readable top beyond the first obstruction',async()=>{
  const f=pageFixture(),old=globalThis.MutationObserver;globalThis.MutationObserver=f.Observer;let controller;
  const bars=[{top:0,bottom:140,height:140},{top:140,bottom:200,height:60}].map(rect=>({parentElement:null,closest:()=>null,getBoundingClientRect:()=>rect}));
  try{
    f.win.innerWidth=900;f.win.getComputedStyle=n=>({display:'block',overflowY:'visible',position:bars.includes(n)?'fixed':'static'});
    f.heading.getBoundingClientRect=()=>({top:350-f.root.scrollTop,bottom:380-f.root.scrollTop,left:24,width:600});
    f.heading.contains=n=>n===f.heading;
    f.doc.elementsFromPoint=(x,y)=>bars.filter(b=>y>=b.getBoundingClientRect().top&&y<b.getBoundingClientRect().bottom);
    f.doc.elementFromPoint=(x,y)=>y<200?bars[1]:f.heading;
    controller=initReadingToc({api:f.api,doc:f.doc,win:f.win});await tick();await tick();
    const item=(await f.send({})).data.items[0];
    assert.equal((await f.send({operation:'toc.navigate',id:item.id,sourceId:item.sourceId})).ok,true);
    assert(f.heading.getBoundingClientRect().top>=200);
  }finally{controller?.dispose();globalThis.MutationObserver=old;}
});

test('a heading covered on the right cannot produce a successful navigation receipt',async()=>{
  const f=pageFixture(),old=globalThis.MutationObserver;globalThis.MutationObserver=f.Observer;let controller;
  try{
    f.win.innerWidth=900;f.heading.getBoundingClientRect=()=>({top:350-f.root.scrollTop,bottom:380-f.root.scrollTop,left:24,width:600});
    f.heading.contains=n=>n===f.heading;f.doc.elementFromPoint=(x,y)=>x<100?f.heading:{};
    controller=initReadingToc({api:f.api,doc:f.doc,win:f.win});await tick();await tick();
    const item=(await f.send({})).data.items[0];
    assert.equal((await f.send({operation:'toc.navigate',id:item.id,sourceId:item.sourceId})).ok,false);
  }finally{controller?.dispose();globalThis.MutationObserver=old;}
});

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
  const send=(message,sender={id:'self-extension',url:api.runtime.getURL('ui/tool.html')+'?hostInstanceId=123e4567-e89b-42d3-a456-426614174000'})=>
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
    dispatch:(type,event)=>{for(const fn of listeners.get(type)||[])fn(event);},
    get disconnects(){return disconnects;},get frames(){return frames;}};
}

for(const inner of [false,true])test('R4.1 verifies visible titles below '+(inner?'inner sticky':'window fixed')+' headers',async()=>{
  const f=pageFixture(),old=globalThis.MutationObserver;
  globalThis.MutationObserver=f.Observer;
  let controller;
  const header={parentElement:null,closest:()=>null,getBoundingClientRect:()=>({
    top:inner?62:0,bottom:inner?172:140,height:inner?110:140
  })};
  f.win.innerWidth=900;
  f.win.getComputedStyle=node=>({display:'block',position:node===header?(inner?'sticky':'fixed'):'static',
    overflowY:inner&&node===f.root?'auto':'visible'});
  if(inner){
    f.doc.documentElement={};f.doc.scrollingElement=f.doc.documentElement;
    f.root.getBoundingClientRect=()=>({top:60,bottom:760});
    f.root.scrollTo=({top})=>{f.root.scrollTop=top;};
    f.root.parentElement=f.doc.body;f.heading.parentElement=f.root;
  }
  f.heading.getBoundingClientRect=()=>({top:(inner?410:350)-f.root.scrollTop,
    bottom:(inner?440:380)-f.root.scrollTop,left:24,width:600});
  f.heading.contains=node=>node===f.heading;
  f.doc.elementsFromPoint=()=>[header];
  f.doc.elementFromPoint=(x,y)=>y<header.getBoundingClientRect().bottom?header:f.heading;
  try{
    controller=initReadingToc({api:f.api,doc:f.doc,win:f.win});await tick();await tick();
    const snapshot=await f.send({}),item=snapshot.data.items[0];
    const result=await f.send({operation:'toc.navigate',id:item.id,sourceId:item.sourceId});
    assert.equal(result.ok,true,JSON.stringify(result));
    assert(f.heading.getBoundingClientRect().top>=header.getBoundingClientRect().bottom,
      'The actual title must be below the measured occluder');
    controller.dispose();assert.equal(f.Observer.active,0);
  }finally{controller?.dispose();globalThis.MutationObserver=old;}
});

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
    assert.equal(data.ok,true,JSON.stringify(data));
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


test('R4.1 refuses to report a successful jump when the heading never enters the readable viewport',async()=>{
  const f=pageFixture(),old=globalThis.MutationObserver;
  globalThis.MutationObserver=f.Observer;
  // A scroll-blocking site can acknowledge scrollTo without moving its target.
  f.heading.getBoundingClientRect=()=>({top:1800,bottom:1834});
  let controller;
  try{
    controller=initReadingToc({api:f.api,doc:f.doc,win:f.win});
    await tick();await tick();
    const snapshot=await f.send({});
    assert.equal(snapshot.ok,true);
    const item=snapshot.data.items[0];
    const result=await f.send({operation:'toc.navigate',id:item.id,sourceId:item.sourceId});
    assert.equal(result.ok,false,'attempting scroll corrections does not prove a readable destination');
    assert.match(result.error,/未确认目标章节/);
  }finally{controller?.dispose();globalThis.MutationObserver=old;}
});


test('R4.1 rejects a background navigation and bounds a suspended animation frame',async()=>{
  const fixture=pageFixture(),prior=globalThis.MutationObserver;
  globalThis.MutationObserver=fixture.Observer;
  let controller;
  try {
    controller=initReadingToc({api:fixture.api,doc:fixture.doc,win:fixture.win});
    await tick();await tick();
    const response=await fixture.send({});
    assert.equal(response.ok,true);
    const item=response.data.items[0];
    fixture.doc.visibilityState='hidden';
    const hidden=await fixture.send({operation:'toc.navigate',id:item.id,sourceId:item.sourceId});
    assert.equal(hidden.ok,false);
    assert.match(hidden.error,/切回目标网页/);
    assert.equal(fixture.root.scrollTop,0,'background navigation cannot mutate the scroll position');
    fixture.doc.visibilityState='visible';
    fixture.win.requestAnimationFrame=()=>0; // Chrome can suspend animation callbacks.
    const started=Date.now();
    const suspended=await fixture.send({operation:'toc.navigate',id:item.id,sourceId:item.sourceId});
    assert.equal(suspended.ok,false,'scrollTo without a confirmed paint is not success');
    assert.match(suspended.error,/滚动帧未完成/);
    assert(Date.now()-started<2400,'the Chrome response channel must settle with a bounded timeout');
  }finally {
    controller?.dispose();
    globalThis.MutationObserver=prior;
  }
});
