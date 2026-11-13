import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {createSidebarTools} from '../../../src/ui/sidebar-tools.js';
import {createSidebarToolsView} from '../../../src/ui/sidebar-tools-view.js';
import {SIDEBAR_TOOL_FORMAT,SIDEBAR_TOOL_STORE,sidebarToolPackageContractHash} from '../../../src/ui/sidebar-tools/package.js';
import {SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE} from '../../../src/ui/sidebar-tools/lifecycle.js';
import {officialToolFixture,officialFixtureFetch} from '../../../tests/helpers/official-tools.mjs';
import {CLIP_SITE_STORE} from '../trusted/policy.js';

// Real Host harness copied from tests/environment/sidebar-tools-host.test.mjs;
// kept project-local without importing (and running) the root test suite.
class Node {
  constructor(tag='div'){this.tag=tag;this.tagName=tag.toUpperCase();this.children=[];this.listeners=new Map();this.hidden=false;
    this.dataset={};this.attributes=new Map();this.className='';
    // Mirror native classList.toggle for trusted host settings in this DOM double.
    this.classList={
      contains:name=>this.className.split(/\s+/).includes(name),
      add:(...names)=>{this.className=[...new Set([...this.className.split(/\s+/).filter(Boolean),...names])].join(' ');},
      remove:(...names)=>{this.className=this.className.split(/\s+/).filter(x=>x&&!names.includes(x)).join(' ');},
      toggle:(name,force)=>{
        const has=this.classList.contains(name),add=force===undefined?!has:Boolean(force);
        if(add)this.classList.add(name);else this.classList.remove(name);
        return add;
      }
    };
    this.contentWindow=tag==='iframe'?{sent:[],postMessage(message){this.sent.push(message);}}:undefined;}
  addEventListener(type,fn){const items=this.listeners.get(type)||[];items.push(fn);this.listeners.set(type,items);}
  removeEventListener(type,fn){this.listeners.set(type,(this.listeners.get(type)||[]).filter(item=>item!==fn));}
  emit(type,event={}){for(const fn of this.listeners.get(type)||[])fn(event);}
  replaceChildren(...items){for(const child of this.children)child.parent=null;this.children=[];this.append(...items);}
  append(...items){for(const item of items){item.parent=this;this.children.push(item);}}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(item=>item!==this);this.parent=null;}
  setAttribute(name,value){
    this.attributes.set(name,value);
    if(name.startsWith('data-'))
      this.dataset[name.slice(5).replace(/-([a-z])/g,(_,ch)=>ch.toUpperCase())]=String(value);
  }
  removeAttribute(name){
    this.attributes.delete(name);
    if(name.startsWith('data-'))
      delete this.dataset[name.slice(5).replace(/-([a-z])/g,(_,ch)=>ch.toUpperCase())];
  }
  focus(){this.focused=true;if(this.ownerDocument)this.ownerDocument.activeElement=this;}
}
const pause=()=>new Promise(resolve=>setImmediate(resolve));
const settle=async check=>{
  for(let i=0;i<200;i++){if(check())return;await new Promise(resolve=>setTimeout(resolve,5));}
  assert.fail('host state did not settle');
};
const sample={format:SIDEBAR_TOOL_FORMAT,id:'quick-notes',version:'1.0.0',title:'网页笔记',
  description:'demo',capabilities:['storage.local','currentPage.read','tasks.open'],
  html:'<main>Hello</main>',css:'main {color:navy}',js:'void 0;'};


function toolRuntimeFixture() {
  const {document:doc}=parseHTML('<html><body><div id="extension-center-list"></div></body></html>');
  const createElement=doc.createElement.bind(doc);
  doc.createElement=tag=>{
    const node=createElement(tag);
    if(tag==='iframe')Object.defineProperty(node,'contentWindow',{value:{sent:[],postMessage(message,_origin,ports){
      this.sent.push(message);
      if(ports?.length){this.ports=ports;ports[0].on('message',message=>this.sent.push(message));}
    }}});
    return node;
  };
  const view=createSidebarToolsView();
  const runtime={frameRoot:doc.createElement('div'),settingsControl:doc.createElement('button')};
  doc.body.append(runtime.frameRoot,runtime.settingsControl);
  view.attachRuntime(runtime);
  const elements={...view.fields,'sidebar-tool-frame':runtime.frameRoot};
  const emit=(field,type,event={})=>view.dispatch(field.key,type,event);
  const selectFile=file=>emit(elements['sidebar-tool-file'],'change',{target:{files:[file]}});
  return {doc,view,runtime,elements,emit,selectFile};
}


function sharedLocks(){
  const queues=new Map();
  return {request(name,work){const previous=queues.get(name)||Promise.resolve();
    const next=previous.catch(()=>{}).then(work);queues.set(name,next);
    next.finally(()=>{if(queues.get(name)===next)queues.delete(name);}).catch(()=>{});
    return next;}};
}


async function hostFixture(t,{store=new Map([[SIDEBAR_TOOL_STORE,[sample]]]),locks=sharedLocks(),getHook,setHook,startTool=true,tool=sample,snapshotBeforeGet=false,target,awaitReady=true,fetcher=officialFixtureFetch,trustedBookmarkPilot=null,trustedAIProxyPilot=null,trustedPromptPilot=null,headerActionsEnabled=true,chromePermissions=null,hostReply=null,runHost=null,foundationClient=null,configureApi=null,localeController=null,toolLocaleService=null,taskReview=null,taskNavigationDone=null,taskConfigure=null}={}){
  const oldWindow=globalThis.window,oldConfirm=globalThis.confirm;
  const win=new Node('window');globalThis.window=win;globalThis.confirm=()=>true;
  const {doc,view,runtime,elements,emit,selectFile}=toolRuntimeFixture();
  let focused=0;
  const changed=new Node();
  const api={runtime:{id:'test',getManifest:()=>({version:'0.1.0'}),getURL:p=>'chrome-extension://test/'+p,async sendMessage(message){
    if(hostReply){const response=await hostReply(message,{store});if(response!==undefined)return response;}
    if(message?.kind==='runtime-contract')return {ok:true,data:{extensionId:'test',version:'0.1.0',contractHash:await sidebarToolPackageContractHash()}};
    if(message?.protocol==='opendesk.foundation.v1'&&message.type==='cleanupUninstalledToolSchedules')
      return {ok:true,data:{toolId:message.payload.toolId,schedulesRetired:true,alarmsCleared:true}};
  }},storage:{session:{async get(){return {};},async remove(){}},onChanged:{
    addListener:fn=>changed.addEventListener('change',fn),removeListener:fn=>changed.removeEventListener('change',fn)
  },local:{
    async get(key){const snapshot=snapshotBeforeGet?structuredClone(store.get(key)):undefined;
      await getHook?.(key);
      if(Array.isArray(key))return Object.fromEntries(key.map(name=>[name,structuredClone(store.get(name))]));
      return {[key]:snapshotBeforeGet?snapshot:structuredClone(store.get(key))};},
    async set(value){await setHook?.(value);for(const [key,row] of Object.entries(value))store.set(key,structuredClone(row));},
    async remove(key){store.delete(key);}
  }}};
  if(chromePermissions)api.permissions=chromePermissions;
  configureApi?.(api);
  const host=createSidebarTools({api,doc,view,localeController,toolLocaleService,currentPageTarget:target,runHost,foundationClient,lockManager:locks,fetcher,trustedBookmarkPilot,trustedAIProxyPilot,trustedPromptPilot,headerActionsEnabled,taskWorkbench:{openTaskRunSheet:taskConfigure,async openTaskReview(id,{assertAuthorized}){await taskReview?.(id);await assertAuthorized();focused++;await taskNavigationDone?.();return true;}}});
  t.after(()=>{host.dispose();view.dispose();globalThis.window=oldWindow;globalThis.confirm=oldConfirm;});
  if(awaitReady)await host.ready;else await pause();host.setVisible(true);
  assert.equal(elements['sidebar-tool-frame'].children.length,0,'opening Tools never starts saved packages');
  if(startTool)host.openTool(tool.id);
  const frame=elements['sidebar-tool-frame'].children[0];
  await frame?.onload();
  const loaded=frame?.contentWindow.sent[0];
  const ask=(operation,payload={},id='1')=>{
    assert.ok(frame,'message actions require an explicitly opened tool');
    win.emit('message',{origin:'null',source:frame.contentWindow,
      data:{protocol:loaded.protocol,toolId:tool.id,instance:loaded.instance,kind:'request',requestId:id,operation,payload}});
  };
  return {host,ask,frame,elements,store,api,win,loaded,view,doc,runtime,emit,selectFile,change(rows){
    for(const fn of changed.listeners.get('change')||[])fn({[SIDEBAR_TOOL_STORE]:{newValue:rows}},'local');
  },changeStorage(changes){
    for(const fn of changed.listeners.get('change')||[])fn(changes,'local');
  },get focused(){return focused;}};
}

const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
async function regionFixture(t,options={}){
  const tool=await officialToolFixture('web-markdown-clipper');
  const store=new Map([[SIDEBAR_TOOL_STORE,[tool]],
    [TOOL_REVOCATION_EPOCHS_STORE,{[tool.id]:'region-epoch'}]]);
  const callbacks=new Set(),calls=[],gate=deferred();
  t.after(()=>gate.resolve({ok:false,error:'test cleanup'}));
  const target={snapshot:{status:'available',windowId:1,tabId:7,frameId:0,
    documentId:'document-a',url:'https://article.example/a',origin:'https://article.example'},
    capture(){return {...this.snapshot};},
    async revalidate(captured){
      if(captured.documentId!==this.snapshot.documentId||captured.tabId!==this.snapshot.tabId||captured.url!==this.snapshot.url)
        throw Object.assign(Error('document changed'),{code:'E_DOCUMENT_STALE'});
      for(const fn of callbacks)fn();
      return this.snapshot;
    },
    subscribe(fn){callbacks.add(fn);return()=>callbacks.delete(fn);},
    move(){this.snapshot={...this.snapshot,tabId:8,documentId:'document-b',url:'https://article.example/b'};
      for(const fn of callbacks)fn();}};
  const f=await hostFixture(t,{tool,store,target,...options,configureApi(api){
    api.tabs={sendMessage(tabId,message,address){
      if(message.operation==='clip.ready')return Promise.resolve({ok:true,data:{ready:true}});
      calls.push({tabId,message,address});
      return message.operation==='clip.region'?gate.promise:Promise.resolve({ok:true,data:{cancelled:true}});
    }};
  }});
  const response=id=>f.frame.contentWindow.sent.find(row=>row.kind==='response'&&row.requestId===id);
  const request=async(operation,pickId,id)=>{f.ask(operation,{pickId},id);await settle(()=>response(id));return response(id);};
  return {...f,tool,target,calls,gate,response,request};
}
const validData=(markdown='selected text')=>({markdown,source:'https://article.example/a',title:'Article',
  site:'article.example',capturedAt:'2026-11-14T00:00:00.000Z',mode:'clip.region',loadedOnly:true,streaming:false});

test('region cancel reaches Page while pick is pending outside the tool lock',async t=>{
  const f=await regionFixture(t);
  f.ask('clip.region',{pickId:'pending_pick'},'pick');
  await settle(()=>f.calls.length===1);
  assert.equal(f.response('pick'),undefined);
  const cancel=await f.request('clip.region.cancel','pending_pick','cancel');
  assert.equal(cancel.ok,true);assert.equal(cancel.result.cancelled,true);
  assert.equal(f.calls[1].message.operation,'clip.region.cancel');
  assert.equal(f.calls[1].message.pickId,f.calls[0].message.pickId);
  // Storage remains responsive even while the original Page promise waits.
  f.ask('storage.get',{key:'notes'},'storage');await settle(()=>f.response('storage'));
  assert.equal(f.response('storage').ok,true);
  f.gate.resolve({ok:true,data:validData()});await settle(()=>f.response('pick'));
  assert.equal(f.response('pick').ok,false,'late success cannot revive a cancelled pick');
  assert.equal(f.calls.length,2,'cleanup is never replayed');
});

test('A to B transition cancels only the original tab and document',async t=>{
  const f=await regionFixture(t);
  f.ask('clip.region',{pickId:'navigation_pick'},'pick');await settle(()=>f.calls.length===1);
  f.target.move();await settle(()=>f.calls.length===2);
  const cleanup=f.calls[1];
  assert.equal(cleanup.tabId,7);assert.equal(cleanup.address.documentId,'document-a');
  assert.equal(cleanup.message.expectedUrl,'https://article.example/a');
  await f.request('clip.region.cancel','navigation_pick','cancel-after-switch');
  assert.equal(f.calls.length,2,'an unregistered cancellation never targets B');
  f.gate.resolve({ok:true,data:validData()});await settle(()=>f.response('pick'));
  assert.equal(f.response('pick').ok,false);
});

test('unknown cancel is no-op and prevents a later start with the same ID',async t=>{
  const f=await regionFixture(t);
  assert.equal((await f.request('clip.region.cancel','cancel_first','cancel')).ok,true);
  assert.equal((await f.request('clip.region','cancel_first','pick')).ok,false);
  assert.equal(f.calls.length,0);
});

test('cancel during locked preparation prevents Page picker creation',async t=>{
  const locks=sharedLocks(),f=await regionFixture(t,{locks}),hold=deferred(),entered=deferred();
  t.after(()=>hold.resolve());
  const locked=locks.request('opendesk.sidebar-tools:tool:'+f.tool.id,async()=>{entered.resolve();await hold.promise;});
  await entered.promise;
  f.ask('clip.region',{pickId:'preparing_pick'},'pick');await pause();await pause();
  await f.request('clip.region.cancel','preparing_pick','cancel');
  hold.resolve();await locked;await settle(()=>f.response('pick'));
  assert.equal(f.response('pick').ok,false);assert.equal(f.calls.length,0);
});

test('closing an instance cleans its picker and cannot cancel the next instance with a reused ID',async t=>{
  const f=await regionFixture(t);
  f.ask('clip.region',{pickId:'reused_pick'},'old');await settle(()=>f.calls.length===1);
  const oldSource=f.frame.contentWindow,oldLoad=f.loaded;
  f.host.closeTool();await settle(()=>f.calls.length===2);
  f.host.openTool(f.tool.id);
  const next=f.elements['sidebar-tool-frame'].children[0];await next.onload();
  const load=next.contentWindow.sent.find(row=>row.kind==='load');
  f.win.emit('message',{origin:'null',source:next.contentWindow,data:{protocol:load.protocol,toolId:f.tool.id,
    instance:load.instance,kind:'request',requestId:'new',operation:'clip.region',payload:{pickId:'reused_pick'}}});
  await settle(()=>f.calls.length===3);
  assert.notEqual(f.calls[0].message.pickId,f.calls[2].message.pickId);
  f.win.emit('message',{origin:'null',source:oldSource,data:{protocol:oldLoad.protocol,toolId:f.tool.id,
    instance:oldLoad.instance,kind:'request',requestId:'stale-cancel',operation:'clip.region.cancel',payload:{pickId:'reused_pick'}}});
  await pause();assert.equal(f.calls.length,3);
  f.gate.resolve({ok:true,data:validData()});
  await settle(()=>next.contentWindow.sent.some(row=>row.requestId==='new'));
  assert.equal(next.contentWindow.sent.find(row=>row.requestId==='new').ok,true);
  assert.equal(oldSource.sent.some(row=>row.requestId==='old'),false,'closed source receives no late output');
});

for(const change of ['epoch','enabled','grant','package'])test(`region rejects late result after ${change} changes`,async t=>{
  const f=await regionFixture(t);
  f.ask('clip.region',{pickId:'revoked_pick'},'pick');await settle(()=>f.calls.length===1);
  if(change==='epoch')f.store.set(TOOL_REVOCATION_EPOCHS_STORE,{[f.tool.id]:'new-epoch'});
  if(change==='enabled')f.store.set(SIDEBAR_TOOL_ENABLE_STORE,{[f.tool.id]:false});
  if(change==='grant')f.store.set(CLIP_SITE_STORE,{[f.tool.id]:{mode:'all-except',blockedOrigins:['https://article.example']}});
  if(change==='package')f.store.set(SIDEBAR_TOOL_STORE,[]);
  f.gate.resolve({ok:true,data:validData()});await settle(()=>f.response('pick'));
  assert.equal(f.response('pick').ok,false);
});

test('stale epoch is rejected before sending any region request',async t=>{
  const f=await regionFixture(t);
  f.store.set(TOOL_REVOCATION_EPOCHS_STORE,{[f.tool.id]:'new-epoch'});
  assert.equal((await f.request('clip.region','old_epoch','pick')).ok,false);
  assert.equal(f.calls.length,0);
});

for(const [label,markdown] of [['backslashes','\\'.repeat(140000)],['worst JSON escaping','\u0001'.repeat(160000)],['UTF8 boundary','中'.repeat(53333)+'x']])
test(`region accepts bounded Markdown with ${label}`,async t=>{
  const f=await regionFixture(t),data=validData(markdown);
  f.ask('clip.region',{pickId:'bounded_pick'},'pick');await settle(()=>f.calls.length===1);
  f.gate.resolve({ok:true,data});await settle(()=>f.response('pick'));
  assert.equal(f.response('pick').ok,true);assert.deepEqual(f.response('pick').result,data);
  assert.equal(f.calls.length,1,'successful picks need no cleanup message');
});

for(const [label,patch] of [
  ['ASCII overflow',{markdown:'a'.repeat(160001)}],['UTF8 overflow',{markdown:'中'.repeat(53334)}],
  ['missing source',{source:undefined}],['oversized source',{source:'s'.repeat(8193)}],
  ['oversized title',{title:'t'.repeat(2001)}],['malformed metadata',{streaming:'yes'}],
  ['unknown unbounded field',{extra:'x'.repeat(200000)}],['wrong mode',{mode:'clip.article'}]
])test(`region rejects ${label}`,async t=>{
  const f=await regionFixture(t);
  f.ask('clip.region',{pickId:'invalid_pick'},'pick');await settle(()=>f.calls.length===1);
  f.gate.resolve({ok:true,data:{...validData(),...patch}});await settle(()=>f.response('pick'));
  assert.equal(f.response('pick').ok,false);
});


test('unknown Page transport result cleans once without replaying start or cleanup',async t=>{
  const f=await regionFixture(t);
  let starts=0,cancels=0;
  f.api.tabs.sendMessage=async(_tab,message)=>{
    if(message.operation==='clip.region'){starts++;throw Error('unknown start result');}
    cancels++;throw Error('unknown cleanup result');
  };
  assert.equal((await f.request('clip.region','unknown_pick','pick')).ok,false);
  await f.request('clip.region.cancel','unknown_pick','cancel');
  f.host.closeTool();await pause();
  assert.equal(starts,1);assert.equal(cancels,1);
});

test('policy events clean pending pick immediately even when a revoked draft frame is retained',async t=>{
  const f=await regionFixture(t);
  f.ask('clip.region',{pickId:'event_pick'},'pick');await settle(()=>f.calls.length===1);
  const epochs={[f.tool.id]:'new-epoch'};f.store.set(TOOL_REVOCATION_EPOCHS_STORE,epochs);
  f.changeStorage({[TOOL_REVOCATION_EPOCHS_STORE]:{newValue:epochs}});
  await settle(()=>f.calls.length===2);
  assert.equal(f.calls[1].message.installEpoch,'region-epoch');
  assert.equal(f.calls[1].address.documentId,'document-a');
  f.gate.resolve({ok:true,data:validData()});await settle(()=>f.response('pick'));
  assert.equal(f.response('pick').ok,false);
});

test('cancellation during the final delivery checks still invalidates a resolved Page result',async t=>{
  const f=await regionFixture(t);
  f.ask('clip.region',{pickId:'delivery_pick'},'pick');await settle(()=>f.calls.length===1);
  const original=f.api.storage.local.get;
  let enabledReads=0,waiting=false;
  const hold=deferred();t.after(()=>hold.resolve());
  f.api.storage.local.get=async key=>{
    // First enabled read is response admission, second is generic reply delivery.
    if(key===SIDEBAR_TOOL_ENABLE_STORE&&++enabledReads===2){waiting=true;await hold.promise;}
    return original(key);
  };
  f.gate.resolve({ok:true,data:validData()});await settle(()=>waiting);
  await f.request('clip.region.cancel','delivery_pick','cancel');
  hold.resolve();await settle(()=>f.response('pick'));
  assert.equal(f.response('pick').ok,false);
});

for(const operation of ['clip.article','clip.selection','clip.link'])
test(`${operation} retains its existing storage lock and response behavior`,async t=>{
  const f=await regionFixture(t),gate=deferred();let entered=false;
  t.after(()=>gate.resolve());
  f.api.tabs.sendMessage=async(tabId,message,address)=>{
    assert.equal(message.operation,operation);
    assert.equal(message.pickId,undefined);
    assert.equal(tabId,7);assert.equal(address.documentId,'document-a');
    entered=true;await gate.promise;
    return {ok:true,data:{markdown:'legacy content',source:'https://article.example/a'}};
  };
  f.ask(operation,{},'legacy');await settle(()=>entered);
  f.ask('storage.get',{key:'notes'},'storage');
  for(let i=0;i<5;i++)await pause();
  assert.equal(f.response('storage'),undefined,'legacy clipping still owns the tool lock');
  gate.resolve();await settle(()=>f.response('legacy')&&f.response('storage'));
  assert.equal(f.response('legacy').ok,true);assert.equal(f.response('storage').ok,true);
});

for(const pickId of ['short','invalid.id',null])
test(`region rejects malformed pick ID ${pickId}`,async t=>{
  const f=await regionFixture(t);
  assert.equal((await f.request('clip.region',pickId,'pick')).ok,false);
  assert.equal(f.calls.length,0);
});

test('a page transition during initial authorization cannot retarget an undelivered pick to B',async t=>{
  const f=await regionFixture(t),hold=deferred(),original=f.api.storage.local.get;
  let entered=false;
  t.after(()=>hold.resolve());
  f.api.storage.local.get=async key=>{
    if(!entered&&key===SIDEBAR_TOOL_ENABLE_STORE){entered=true;await hold.promise;}
    return original(key);
  };
  f.ask('clip.region',{pickId:'initial_pick'},'pick');await settle(()=>entered);
  await f.request('clip.region.cancel','initial_pick','cancel');
  f.target.move();hold.resolve();await settle(()=>f.response('pick'));
  assert.equal(f.response('pick').ok,false);
  assert.equal(f.calls.length,0,'neither a delayed start nor unknown cancel may address B');
});

test('more than 128 successful sequential picks do not exhaust session admission',async t=>{
  const f=await regionFixture(t),now=Date.now;
  let clock=now();Date.now=()=>clock;t.after(()=>{Date.now=now;});
  const wireIds=new Set();
  f.api.tabs.sendMessage=async(_tab,message)=>{
    assert.equal(message.operation,'clip.region','completed picks must not need cancellation');
    assert.equal(wireIds.has(message.pickId),false);wireIds.add(message.pickId);
    return {ok:true,data:validData()};
  };
  for(let index=0;index<140;index++){
    // Respect the independent 120 requests/minute Host budget without sleeping.
    clock+=1000;
    const reply=await f.request('clip.region',`sequential_${index}`,`pick-${index}`);
    assert.equal(reply.ok,true,`sequential pick ${index+1}: ${reply.error?.message}`);
  }
  assert.equal(wireIds.size,140);
});

test('an old cancelled ID cannot cancel a fresh picker after replay retention rolls over',async t=>{
  const f=await regionFixture(t),now=Date.now;
  let clock=now();Date.now=()=>clock;t.after(()=>{Date.now=now;});
  f.ask('clip.region',{pickId:'old_cancelled'},'old');await settle(()=>f.calls.length===1);
  await f.request('clip.region.cancel','old_cancelled','cancel-old');
  const oldWire=f.calls[0].message.pickId;
  f.gate.resolve({ok:true,data:validData()});await settle(()=>f.response('old'));
  const calls=[];
  f.api.tabs.sendMessage=async(_tab,message)=>{
    calls.push(message);return {ok:true,data:validData()};
  };
  for(let index=0;index<140;index++){
    clock+=1000;
    assert.equal((await f.request('clip.region',`rollover_${index}`,`roll-${index}`)).ok,true);
  }
  const pending=deferred();t.after(()=>pending.resolve({ok:false,error:'test cleanup'}));
  f.api.tabs.sendMessage=async(_tab,message)=>{
    calls.push(message);return pending.promise;
  };
  f.ask('clip.region',{pickId:'fresh_picker'},'fresh');await settle(()=>calls.length===141);
  assert.notEqual(calls.at(-1).pickId,oldWire);
  const stale=await f.request('clip.region.cancel','old_cancelled','stale-cancel');
  assert.equal(stale.ok,true);assert.equal(stale.result.cancelled,false);
  assert.equal(calls.length,141,'stale cancellation must not send cleanup to the fresh Page session');
  assert.equal(f.response('fresh'),undefined);
  pending.resolve({ok:true,data:validData()});await settle(()=>f.response('fresh'));
  assert.equal(f.response('fresh').ok,true);
});

test('a cancelled start blocked in initial auth stays cancelled after replay rotation and a fresh picker',async t=>{
  const f=await regionFixture(t),hold=deferred(),original=f.api.storage.local.get,now=Date.now;
  let clock=now(),entered=false;Date.now=()=>clock;
  t.after(()=>{hold.resolve();Date.now=now;});
  f.api.storage.local.get=async key=>{
    if(!entered&&key===SIDEBAR_TOOL_ENABLE_STORE){entered=true;await hold.promise;}
    return original(key);
  };
  f.ask('clip.region',{pickId:'delayed_old'},'old');await settle(()=>entered);
  await f.request('clip.region.cancel','delayed_old','cancel-old');
  for(let index=0;index<128;index++){
    clock+=1000;
    assert.equal((await f.request('clip.region.cancel',`rotation_${index}`,`rotate-${index}`)).ok,true);
  }
  f.ask('clip.region',{pickId:'fresh_after_rotation'},'fresh');await settle(()=>f.calls.length===1);
  const freshWire=f.calls[0].message.pickId;
  assert.equal(f.calls[0].message.operation,'clip.region');
  hold.resolve();
  // A revived old start would remain pending in Page rather than responding.
  await settle(()=>f.response('old')||f.calls.length>1);
  assert.equal(f.calls.length,1,'resuming the cancelled old start must neither start Page nor cancel the fresh picker');
  assert.equal(f.response('old').ok,false);
  assert.equal(f.response('fresh'),undefined);
  f.gate.resolve({ok:true,data:validData()});await settle(()=>f.response('fresh'));
  assert.equal(f.response('fresh').ok,true);
  assert.equal(f.calls[0].message.pickId,freshWire);
});

test('a start waiting behind a storage mutation is registered and cancelled before dispatch',async t=>{
  const f=await regionFixture(t),hold=deferred(),original=f.api.storage.local.get,now=Date.now;
  let clock=now(),entered=false;Date.now=()=>clock;
  t.after(()=>{hold.resolve();Date.now=now;});
  f.api.storage.local.get=async key=>{
    if(!entered&&key===SIDEBAR_TOOL_ENABLE_STORE){entered=true;await hold.promise;}
    return original(key);
  };
  f.ask('storage.set',{key:'draft',value:'queued'},'storage');await settle(()=>entered);
  f.ask('clip.region',{pickId:'queued_old'},'old');
  f.ask('clip.region.cancel',{pickId:'queued_old'},'cancel-old');
  for(let index=0;index<128;index++){
    clock+=1000;
    f.ask('clip.region.cancel',{pickId:`queued_rotation_${index}`},`rotate-${index}`);
  }
  f.ask('clip.region',{pickId:'queued_fresh'},'fresh');
  assert.equal(f.calls.length,0);
  hold.resolve();await settle(()=>f.response('old')&&f.calls.length>0);
  assert.equal(f.response('old').ok,false);
  assert.equal(f.calls.length,1,'only the fresh start may reach Page after the queue resumes');
  assert.equal(f.calls[0].message.operation,'clip.region');
  f.gate.resolve({ok:true,data:validData()});await settle(()=>f.response('fresh'));
  assert.equal(f.response('fresh').ok,true);
});
