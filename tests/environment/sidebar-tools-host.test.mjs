import {SIDEBAR_TOOL_ENABLE_STORE} from '../../src/ui/sidebar-tools/lifecycle.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {createSidebarTools} from '../../src/ui/sidebar-tools.js';
import {createCurrentPageTarget} from '../../src/ui/current-page-target.js';
import {initSidebarToolSandbox} from '../../src/sidebar-tools/bridge.js';
import {SIDEBAR_TOOL_FORMAT,SIDEBAR_TOOL_STORE,sidebarToolStorageKey} from '../../src/ui/sidebar-tools/package.js';
import {officialToolFixture,officialFixtureFetch,officialFixtures} from '../helpers/official-tools.mjs';
import {MARKET_PROVENANCE_STORE,MARKET_OPERATIONS_STORE,reconcileMarketOperation,recoverMarketOperation,
  TOOL_CLEANUP_STORE,retryUninstalledToolCleanup,TOOL_REVOCATION_EPOCHS_STORE,recordToolUninstall} from '../../src/ui/sidebar-tools/installation.js';
import {CLIP_SITE_STORE} from '../../src/page-clip/policy.js';
import {CAPTURE_SITE_STORE} from '../../src/knowledge/policy.js';
import {READING_TOC_SITE_STORE,READING_TOC_VISIBILITY_STORE,READING_TOC_PAGE_RULES_STORE,changeReadingTocVisibility} from '../../src/reading-toc/policy.js';

test('R26 stopped details remain manageable and enabling waits for an explicit Open',async t=>{
  const key=sidebarToolStorageKey(sample.id),grants={[sample.id]:['https://example.com']};
  const store=new Map([[SIDEBAR_TOOL_STORE,[sample]],[SIDEBAR_TOOL_ENABLE_STORE,{[sample.id]:false}],
    [key,{note:'keep'}],[READING_TOC_SITE_STORE,grants]]);
  const f=await hostFixture(t,{store,startTool:false});
  const row=f.elements['sidebar-tool-list'].children[0];assert.equal(row.children.length,1);
  row.children[0].emit('click');
  assert.equal(f.elements['sidebar-tool-display'].hidden,false);assert.equal(f.elements['sidebar-tool-frame'].children.length,0);
  assert.equal(f.elements['sidebar-tool-settings-open'].hidden,false);assert.equal(f.elements['sidebar-tool-visibility'].hidden,true);
  f.elements['sidebar-tool-enable'].emit('click');
  await settle(()=>store.get(SIDEBAR_TOOL_ENABLE_STORE)?.[sample.id]===true&&!f.elements['sidebar-tool-enable'].disabled);
  assert.equal(f.elements['sidebar-tool-frame'].children.length,0,'enable cannot execute code');
  assert.deepEqual(store.get(key),{note:'keep'});assert.deepEqual(store.get(READING_TOC_SITE_STORE),grants);
  f.elements['sidebar-tool-launch'].emit('click');await settle(()=>f.elements['sidebar-tool-frame'].children.length===1);
});

test('R26 cross-panel disable destroys old frames and resume does not revive them',async t=>{
  const f=await hostFixture(t),old=f.frame;
  f.store.set(SIDEBAR_TOOL_ENABLE_STORE,{[sample.id]:false});
  f.changeStorage({[SIDEBAR_TOOL_ENABLE_STORE]:{newValue:{[sample.id]:false}}});
  assert.equal(f.elements['sidebar-tool-frame'].children.length,0);assert.equal(f.elements['sidebar-tool-display'].hidden,false);
  assert.equal(f.elements['sidebar-tool-settings-view'].hidden,false);
  f.ask('storage.set',{key:'note',value:'stale'});await pause();
  assert.equal(f.store.has(sidebarToolStorageKey(sample.id)),false);
  f.store.set(SIDEBAR_TOOL_ENABLE_STORE,{[sample.id]:true});
  f.changeStorage({[SIDEBAR_TOOL_ENABLE_STORE]:{newValue:{[sample.id]:true}}});
  assert.equal(f.elements['sidebar-tool-frame'].children.length,0);assert.equal(old.contentWindow.sent.filter(m=>m.kind==='response').length,0);
});

test('R26 remote disable retains a bounded inert draft while destroying the sandbox',async t=>{
  const f=await hostFixture(t);
  const send=(kind,extra={})=>f.win.emit('message',{origin:'null',source:f.frame.contentWindow,
    data:{protocol:f.loaded.protocol,toolId:sample.id,instance:f.loaded.instance,kind,...extra}});
  send('draft',{text:'标题\n尚未保存的正文'});send('dirty');
  f.store.set(SIDEBAR_TOOL_ENABLE_STORE,{[sample.id]:false});
  f.changeStorage({[SIDEBAR_TOOL_ENABLE_STORE]:{newValue:{[sample.id]:false}}});
  assert.equal(f.elements['sidebar-tool-frame'].children.length,0);
  assert.equal(f.elements['sidebar-tool-retired-draft'].hidden,false);
  assert.equal(f.elements['sidebar-tool-retired-draft-text'].value,'标题\n尚未保存的正文');
  f.elements['sidebar-tool-retired-draft-dismiss'].emit('click');
  assert.equal(f.elements['sidebar-tool-retired-draft'].hidden,true);
});

test('R26 eye restores intersecting site/page appearance without mutating grants',async t=>{
  const toc=await officialToolFixture('reading-toc'),url='https://article.example/answer';
  const prefs=changeReadingTocVisibility(changeReadingTocVisibility({},toc.id,url,'site',true),toc.id,url,'page',true);
  const grants={[toc.id]:['https://article.example']},store=new Map([[SIDEBAR_TOOL_STORE,[toc]],
    [READING_TOC_SITE_STORE,grants],[READING_TOC_VISIBILITY_STORE,prefs]]);
  const target={snapshot:{status:'available',url},capture(){return {url,origin:'https://article.example',tabId:5,documentId:'doc'};},async revalidate(){return true;}};
  const f=await hostFixture(t,{target,store,tool:toc}),eye=f.elements['sidebar-tool-visibility'];
  assert.equal(eye.hidden,false);assert.equal(eye.disabled,false);eye.emit('click');
  await settle(()=>!store.get(READING_TOC_VISIBILITY_STORE)?.[toc.id]);
  assert.deepEqual(store.get(READING_TOC_SITE_STORE),grants);assert.equal(store.has(SIDEBAR_TOOL_ENABLE_STORE),false);
  eye.emit('click');await settle(()=>Boolean(store.get(READING_TOC_VISIBILITY_STORE)?.[toc.id]?.hiddenSites.length));
  assert.deepEqual(store.get(READING_TOC_SITE_STORE),grants);
});

test('R26 missing site permission disables eye with a reason while settings remain available',async t=>{
  const toc=await officialToolFixture('reading-toc'),target={snapshot:{status:'available',url:'https://example.com/a'}};
  const f=await hostFixture(t,{tool:toc,target,store:new Map([[SIDEBAR_TOOL_STORE,[toc]]])});
  assert.equal(f.elements['sidebar-tool-visibility'].disabled,true);assert.match(f.elements['sidebar-tool-visibility'].title,/授权/);
  f.elements['sidebar-tool-settings-open'].emit('click');assert.equal(f.elements['sidebar-tool-settings-view'].hidden,false);
});

test('R26 corrupted enable records preserve bytes and refuse execution or changes',async t=>{
  const corrupt={[sample.id]:'false'},store=new Map([[SIDEBAR_TOOL_STORE,[sample]],[SIDEBAR_TOOL_ENABLE_STORE,corrupt]]);
  const f=await hostFixture(t,{store,startTool:false});f.host.openTool(sample.id);
  assert.equal(f.elements['sidebar-tool-frame'].children.length,0);assert.equal(f.elements['sidebar-tool-enable'].disabled,true);
  assert.deepEqual(store.get(SIDEBAR_TOOL_ENABLE_STORE),corrupt);
});

test('Chrome storage object-key normalization does not invalidate a successful conditional write',async t=>{
  const key=sidebarToolStorageKey(sample.id),f=await hostFixture(t);
  const response=async id=>{
    for(let i=0;i<150;i++){
      const row=f.frame.contentWindow.sent.find(v=>v.kind==='response'&&v.requestId===id);
      if(row)return row;await new Promise(resolve=>setTimeout(resolve,10));
    }
    throw Error('Missing response '+id);
  };
  f.ask('storage.get',{key:'notes',withEtag:true},'read');const read=await response('read');
  f.ask('storage.set',{key:'notes',value:[{id:'a',text:'甲',pageTitle:'标题',pageUrl:'',updatedAt:1}],ifMatch:read.result.etag},'save');
  const saved=await response('save');assert.equal(saved.ok,true);
  // Chrome stores object keys in a different order; arrays retain their order.
  f.store.set(key,{notes:[{updatedAt:1,text:'甲',pageUrl:'',pageTitle:'标题',id:'a'}]});
  f.ask('storage.get',{key:'notes',withEtag:true},'normalized');const normalized=await response('normalized');
  assert.equal(normalized.result.etag,saved.result.etag);
  f.ask('storage.set',{key:'notes',value:[{id:'a',text:'乙'}],ifMatch:saved.result.etag},'again');
  assert.equal((await response('again')).ok,true);
  f.ask('storage.set',{key:'notes',value:[{id:'a',text:'旧快照'}],ifMatch:saved.result.etag},'stale');
  assert.equal((await response('stale')).ok,false);
  assert.equal(f.store.get(key).notes[0].text,'乙');
});

test('Final R2 request throttling returns an error and recovers after its time window',async t=>{
  const original=Date.now;let now=original();Date.now=()=>now;t.after(()=>{Date.now=original;});
  const f=await hostFixture(t);
  for(let i=0;i<121;i++){f.ask('storage.get',{key:'notes'},String(i));await pause();}
  const limited=f.frame.contentWindow.sent.find(m=>m.kind==='response'&&m.requestId==='120');
  assert.equal(limited.ok,false);assert.match(limited.error.message,/一分钟/);
  now+=60001;f.ask('storage.get',{key:'notes'},'recovered');await pause();
  assert.equal(f.frame.contentWindow.sent.at(-1).ok,true);
});

class Node {
  constructor(tag='div'){this.tag=tag;this.children=[];this.listeners=new Map();this.hidden=false;
    this.dataset={};this.attributes=new Map();this.contentWindow=tag==='iframe'?{sent:[],postMessage(message){this.sent.push(message);}}:undefined;}
  addEventListener(type,fn){const items=this.listeners.get(type)||[];items.push(fn);this.listeners.set(type,items);}
  removeEventListener(type,fn){this.listeners.set(type,(this.listeners.get(type)||[]).filter(item=>item!==fn));}
  emit(type,event={}){for(const fn of this.listeners.get(type)||[])fn(event);}
  replaceChildren(...items){for(const child of this.children)child.parent=null;this.children=[];this.append(...items);}
  append(...items){for(const item of items){item.parent=this;this.children.push(item);}}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(item=>item!==this);this.parent=null;}
  setAttribute(name,value){this.attributes.set(name,value);}
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

test('trusted tool host installs only by explicit click, scopes messages and removes storage',async()=>{
  const oldWindow=globalThis.window,oldConfirm=globalThis.confirm;
  const win=new Node('window');globalThis.window=win;globalThis.confirm=()=>true;
  const ids=['sidebar-tool-list','sidebar-tool-list-view','sidebar-tool-empty','sidebar-tool-back','sidebar-tool-display','sidebar-tool-frame','sidebar-tool-status',
    'sidebar-tool-file','sidebar-tool-install','sidebar-tool-remove','sidebar-tool-title',
    'sidebar-tool-retired-draft','sidebar-tool-retired-draft-text','sidebar-tool-retired-draft-dismiss','sidebar-tool-enable','sidebar-tool-enable-hint','sidebar-tool-launch','sidebar-tool-visibility',
    'sidebar-tool-open-tab','sidebar-tool-visibility-settings',
    'sidebar-tool-settings-open','sidebar-tool-settings-view','sidebar-tool-settings-scope',
    'sidebar-tool-settings-scope-label','sidebar-tool-settings-target',
    'sidebar-tool-settings-allow','sidebar-tool-settings-deny','sidebar-tool-settings-hint',
    'sidebar-tool-settings-site-visibility','sidebar-tool-settings-page-visibility',
    'sidebar-tool-settings-sites','sidebar-tool-settings-pages',
    'sidebar-tool-import-trigger','sidebar-tool-import','sidebar-tool-import-close','sidebar-tool-preview',
    'sidebar-tool-preview-title','sidebar-tool-preview-version','sidebar-tool-preview-description',
    'sidebar-tool-preview-capabilities','sidebar-tool-preview-file','sidebar-tool-file-error',
    'sidebar-tool-update','sidebar-tool-update-versions','sidebar-tool-update-capabilities','sidebar-tool-update-warning',
    'sidebar-tool-official-catalog','sidebar-tool-my-panel','sidebar-tool-discover-panel',
    'sidebar-tool-discover-toggle','sidebar-tool-search',
    'sidebar-tool-filter-available','sidebar-tool-filter-all'];
  const elements=Object.fromEntries(ids.map(id=>[id,new Node()]));
  const taskSurface=new Node();
  const doc={documentElement:{dataset:{}},getElementById(id){return elements[id];},
    querySelector(selector){assert.equal(selector,'#workbench-tasks .tasks-surface');return taskSurface;},
    createElement(tag){const node=new Node(tag);node.ownerDocument=doc;return node;}};
  for(const node of Object.values(elements))node.ownerDocument=doc;
  const store=new Map();
  const api={runtime:{getURL:path=>'chrome-extension://test/'+path},
    storage:{local:{
      async get(key){return {[key]:store.get(key)};},
      async set(value){for(const [key,row] of Object.entries(value))store.set(key,row);},
      async remove(key){store.delete(key);}
    }}};
  const target={snapshot:{status:'available',url:'https://example.com/a',title:'Example'}};
  let taskOpened='';
  let toolVisible=false;
  const workbench={focusInstalledTask(id){taskOpened=id;return true;},
    setToolActive(value){toolVisible=value;}};
  let host;
  try{
    host=createSidebarTools({api,doc,currentPageTarget:target,taskWorkbench:workbench,
      lockManager:{request:(_name,work)=>Promise.resolve().then(work)}});
    await host.ready;host.setVisible(true);
    assert.equal(store.has(SIDEBAR_TOOL_STORE),false,'loading a tool list must not install anything');
    assert.equal(elements['sidebar-tool-list'].children.length,0,'no tool tabs or empty fake Task tab');
    assert.equal(elements['sidebar-tool-empty'].hidden,false);
    assert.equal(elements['sidebar-tool-preview'].hidden,true,'install preview is initially hidden');
    elements['sidebar-tool-import-trigger'].emit('click');
    assert.equal(elements['sidebar-tool-import'].hidden,false,'import opens at full panel width');
    const file={size:JSON.stringify(sample).length,text:async()=>JSON.stringify(sample)};
    elements['sidebar-tool-file'].files=[file];
    elements['sidebar-tool-file'].emit('change');
    await pause();await pause();
    assert.equal(store.has(SIDEBAR_TOOL_STORE),false,'choosing JSON alone cannot install');
    assert.equal(elements['sidebar-tool-preview'].hidden,false,'review is shown after validation');
    assert.equal(elements['sidebar-tool-preview-title'].textContent,sample.title);
    assert.match(elements['sidebar-tool-preview-capabilities'].textContent,/读取当前网页/);
    assert.equal(elements['sidebar-tool-install'].disabled,false);
    elements['sidebar-tool-install'].emit('click');
    await pause();await pause();
    assert.equal(store.get(SIDEBAR_TOOL_STORE).length,1);
    assert.equal(elements['sidebar-tool-import'].hidden,true,'successful install closes the import form');
    assert.equal(elements['sidebar-tool-display'].hidden,true,'install must not start untrusted code');
    assert.equal(elements['sidebar-tool-list-view'].hidden,false,'install returns to installed tool list');
    assert.equal(elements['sidebar-tool-frame'].children.length,0,'install never mounts a sandbox');
    host.openTool(sample.id);
    assert.equal(elements['sidebar-tool-frame'].children.length,1,'only an explicit Open mounts the sandbox');
    elements['sidebar-tool-back'].emit('click');
    assert.equal(elements['sidebar-tool-frame'].children.length,0,'Back revokes iframe');
    assert.equal(elements['sidebar-tool-list-view'].hidden,false,'Back opens tool list');
    elements['sidebar-tool-import-trigger'].emit('click');
    elements['sidebar-tool-file'].files=[{name:'invalid.json',size:10,text:async()=>'{invalid'}];
    elements['sidebar-tool-file'].emit('change');
    await pause();await pause();
    assert.equal(elements['sidebar-tool-preview'].hidden,true,'invalid input never presents an approval button');
    assert.equal(elements['sidebar-tool-install'].disabled,true,'invalid input cannot install');
    assert.match(elements['sidebar-tool-file-error'].textContent,/不是有效的工具包 JSON/,'invalid JSON error stays beside the file');
    assert.equal(elements['sidebar-tool-file-error'].hidden,false);
    elements['sidebar-tool-import-close'].emit('click');
    assert.equal(elements['sidebar-tool-import'].hidden,true,'Cancel collapses the import form');
    host.openTool(sample.id);
    const frame=elements['sidebar-tool-frame'].children[0];
    assert.equal(frame.tag,'iframe');
    assert.equal(toolVisible,true,'opening custom tools hides unrelated task Run action');
    assert.equal(frame.src,'chrome-extension://test/sidebar-tools/sandbox.html');
    await frame.onload();
    const loaded=frame.contentWindow.sent[0];
    assert.equal(loaded.kind,'load');
    assert.equal(loaded.tool.id,sample.id);
    function ask(source,origin,operation,payload,requestId='1',token=loaded.instance){
      win.emit('message',{source,origin,data:{protocol:'opendesk.sidebar-tool.bridge.v1',
        kind:'request',instance:token,toolId:sample.id,requestId,operation,payload}});
    }
    ask({},'null','storage.set',{key:'note',value:'forged'});
    ask(frame.contentWindow,'https://evil.example','storage.set',{key:'note',value:'forged'});
    ask(frame.contentWindow,'null','storage.set',{key:'note',value:'forged'},'3','wrong-session');
    await pause();
    assert.equal(store.has(sidebarToolStorageKey(sample.id)),false,'reject forged frames/origins/sessions');
    ask(frame.contentWindow,'null','storage.set',{key:'note',value:'hello'},'4');
    await pause();await pause();
    assert.equal(store.get(sidebarToolStorageKey(sample.id)).note,'hello');
    ask(frame.contentWindow,'null','storage.get',{key:'note'},'5');
    await pause();await pause();
    assert.equal(frame.contentWindow.sent.at(-1).result.value,'hello');
    ask(frame.contentWindow,'null','currentPage.info',{},'6');
    await pause();await pause();
    assert.equal(frame.contentWindow.sent.at(-1).result.url,'https://example.com/a');
    ask(frame.contentWindow,'null','tasks.open',{taskId:'installed-task'},'7');
    await pause();await pause();
    assert.equal(taskOpened,'installed-task');
    assert.equal(elements['sidebar-tool-frame'].children.length,0,'opening a native task closes its tool view');
    // A detached frame cannot mutate data even when replaying the previous instance token.
    ask(frame.contentWindow,'null','storage.set',{key:'note',value:'replayed'},'8');
    await pause();
    assert.equal(store.get(sidebarToolStorageKey(sample.id)).note,'hello');
    host.openTool(sample.id);
    elements['sidebar-tool-remove'].emit('click');
    await pause();await pause();
    assert.equal(store.has(sidebarToolStorageKey(sample.id)),false);
    assert.equal(store.get(SIDEBAR_TOOL_STORE).length,0);
  }finally{host?.dispose();globalThis.window=oldWindow;globalThis.confirm=oldConfirm;}
});

const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};

test('Final R2 cancellation preserves a dirty iframe and pending saves block navigation',async t=>{
  const f=await hostFixture(t);
  const state=(dirty,busy)=>f.win.emit('message',{origin:'null',source:f.frame.contentWindow,
    data:{protocol:f.loaded.protocol,toolId:sample.id,instance:f.loaded.instance,kind:'edit-state',dirty,busy}});
  state(true,false);globalThis.confirm=()=>false;
  assert.equal(f.host.setVisible(false),false);
  f.elements['sidebar-tool-back'].emit('click');
  assert.equal(f.elements['sidebar-tool-frame'].children[0],f.frame);
  state(true,true);globalThis.confirm=()=>true;
  assert.equal(f.host.setVisible(false),false);
  assert.equal(f.elements['sidebar-tool-frame'].children[0],f.frame);
  let prevented=false;
  const unloading={preventDefault(){prevented=true;}};
  f.win.emit('beforeunload',unloading);assert.equal(prevented,true);assert.equal(unloading.returnValue,'');
  state(false,false);assert.notEqual(f.host.setVisible(false),false);
  assert.equal(f.elements['sidebar-tool-frame'].children.length,0);
});

test('actual sandbox state object clears host dirty state only after busy work ends',async t=>{
  const f=await hostFixture(t),sandboxWindow=new Node('window'),root=new Node(),status=new Node(),sent=[];
  const parent={postMessage(data){sent.push(data);f.win.emit('message',{
    origin:'null',source:f.frame.contentWindow,data});}};
  runInNewContext(`(${initSidebarToolSandbox.toString()})()`,{
    SIDEBAR_TOOL_PROTOCOL:f.loaded.protocol,window:sandboxWindow,parent,
    document:{getElementById:id=>id==='tool-root'?root:status,head:new Node(),body:new Node(),createElement:tag=>new Node(tag)},
    Blob,URL:{createObjectURL:()=> 'blob:component-contract',revokeObjectURL(){}},
    setTimeout,clearTimeout,requestAnimationFrame:()=>0
  });
  sandboxWindow.emit('message',{source:parent,data:f.loaded});
  const state=sandboxWindow.OpenDeskTool.setState;
  let confirmations=0;globalThis.confirm=()=>{confirmations++;return false;};
  root.emit('input',{isTrusted:true});
  state(false,false); // The former knowledge call sends no valid state object.
  assert.equal(sent.filter(row=>row.kind==='edit-state').length,0);
  assert.equal(f.host.closeTool(),false);assert.equal(confirmations,1);
  state({dirty:false,busy:true});
  assert.equal(f.host.closeTool(),false);assert.equal(confirmations,1,'busy cannot offer a discard override');
  state({dirty:false,busy:false});
  assert.equal(f.host.closeTool(),true);assert.equal(confirmations,1,'saved state must not ask to discard again');
  assert.equal(f.elements['sidebar-tool-frame'].children.length,0);
  assert.equal(sent.at(-1).kind,'edit-state');assert.equal(sent.at(-1).dirty,false);assert.equal(sent.at(-1).busy,false);
});

test('Final R2 revocation during ETag digest prevents a write that has not started',async t=>{
  const f=await hostFixture(t),gate=deferred(),entered=deferred();
  const original=globalThis.crypto.subtle.digest.bind(globalThis.crypto.subtle);
  const etag=Buffer.from(await original('SHA-256',new TextEncoder().encode('null'))).toString('hex');
  globalThis.crypto.subtle.digest=async(...args)=>{entered.resolve();await gate.promise;return original(...args);};
  t.after(()=>{globalThis.crypto.subtle.digest=original;});
  f.ask('storage.set',{key:'notes',value:[{id:'one',text:'不可迟到落盘'}],ifMatch:etag});
  await entered.promise;f.host.closeTool();gate.resolve();await pause();await pause();
  assert.equal(f.store.has(sidebarToolStorageKey(sample.id)),false);
});
function sharedLocks(){
  const queues=new Map();
  return {request(name,work){const previous=queues.get(name)||Promise.resolve();
    const next=previous.catch(()=>{}).then(work);queues.set(name,next);
    next.finally(()=>{if(queues.get(name)===next)queues.delete(name);}).catch(()=>{});
    return next;}};
}
async function hostFixture(t,{store=new Map([[SIDEBAR_TOOL_STORE,[sample]]]),locks=sharedLocks(),getHook,setHook,startTool=true,tool=sample,snapshotBeforeGet=false,target,awaitReady=true,fetcher=officialFixtureFetch}={}){
  const oldWindow=globalThis.window,oldConfirm=globalThis.confirm;
  const win=new Node('window');globalThis.window=win;globalThis.confirm=()=>true;
  const ids=['sidebar-tool-list','sidebar-tool-list-view','sidebar-tool-empty','sidebar-tool-back','sidebar-tool-display','sidebar-tool-frame','sidebar-tool-status',
    'sidebar-tool-file','sidebar-tool-install','sidebar-tool-remove','sidebar-tool-title',
    'sidebar-tool-retired-draft','sidebar-tool-retired-draft-text','sidebar-tool-retired-draft-dismiss','sidebar-tool-enable','sidebar-tool-enable-hint','sidebar-tool-launch','sidebar-tool-visibility',
    'sidebar-tool-open-tab','sidebar-tool-visibility-settings',
    'sidebar-tool-settings-open','sidebar-tool-settings-view','sidebar-tool-settings-scope',
    'sidebar-tool-settings-scope-label','sidebar-tool-settings-target',
    'sidebar-tool-settings-allow','sidebar-tool-settings-deny','sidebar-tool-settings-hint',
    'sidebar-tool-settings-site-visibility','sidebar-tool-settings-page-visibility',
    'sidebar-tool-settings-sites','sidebar-tool-settings-pages',
    'sidebar-tool-import-trigger','sidebar-tool-import','sidebar-tool-import-close','sidebar-tool-preview',
    'sidebar-tool-preview-title','sidebar-tool-preview-version','sidebar-tool-preview-description',
    'sidebar-tool-preview-capabilities','sidebar-tool-preview-file','sidebar-tool-file-error',
    'sidebar-tool-update','sidebar-tool-update-versions','sidebar-tool-update-capabilities','sidebar-tool-update-warning',
    'sidebar-tool-official-catalog','sidebar-tool-my-panel','sidebar-tool-discover-panel',
    'sidebar-tool-discover-toggle','sidebar-tool-search',
    'sidebar-tool-filter-available','sidebar-tool-filter-all'];
  const elements=Object.fromEntries(ids.map(id=>[id,new Node()]));
  const doc={documentElement:{dataset:{}},getElementById:id=>elements[id],querySelector:()=>new Node(),
    createElement:tag=>{const node=new Node(tag);node.ownerDocument=doc;return node;}};
  for(const node of Object.values(elements))node.ownerDocument=doc;
  let focused=0;
  const changed=new Node();
  const api={runtime:{getURL:p=>'chrome-extension://test/'+p},storage:{session:{async get(){return {};},async remove(){}},onChanged:{
    addListener:fn=>changed.addEventListener('change',fn),removeListener:fn=>changed.removeEventListener('change',fn)
  },local:{
    async get(key){const snapshot=snapshotBeforeGet?structuredClone(store.get(key)):undefined;
      await getHook?.(key);return {[key]:snapshotBeforeGet?snapshot:structuredClone(store.get(key))};},
    async set(value){await setHook?.(value);for(const [key,row] of Object.entries(value))store.set(key,structuredClone(row));},
    async remove(key){store.delete(key);}
  }}};
  const host=createSidebarTools({api,doc,currentPageTarget:target,lockManager:locks,fetcher,taskWorkbench:{focusInstalledTask(){focused++;return true;}}});
  t.after(()=>{host.dispose();globalThis.window=oldWindow;globalThis.confirm=oldConfirm;});
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
  return {host,ask,frame,elements,store,api,win,loaded,change(rows){
    for(const fn of changed.listeners.get('change')||[])fn({[SIDEBAR_TOOL_STORE]:{newValue:rows}},'local');
  },changeStorage(changes){
    for(const fn of changed.listeners.get('change')||[])fn(changes,'local');
  },get focused(){return focused;}};
}
test('queued task navigation loses authority when its tool is closed',async t=>{
  const gate=deferred(),entered=deferred();
  const f=await hostFixture(t,{getHook:async key=>{if(key===sidebarToolStorageKey(sample.id)){entered.resolve();await gate.promise;}}});
  f.ask('storage.set',{key:'note',value:'late'});await entered.promise;
  f.ask('tasks.open',{taskId:'installed-task'},'2');f.host.closeTool();gate.resolve();
  await pause();await pause();assert.equal(f.focused,0);assert.equal(f.store.has(sidebarToolStorageKey(sample.id)),false);
});
test('uninstall waits for a committed write before deleting the namespace',async t=>{
  const gate=deferred(),entered=deferred(),key=sidebarToolStorageKey(sample.id);
  const f=await hostFixture(t,{setHook:async value=>{if(Object.hasOwn(value,key)){entered.resolve();await gate.promise;}}});
  f.ask('storage.set',{key:'note',value:'late'});await entered.promise;
  f.elements['sidebar-tool-remove'].emit('click');await pause();
  assert.equal(f.elements['sidebar-tool-frame'].children.length,0);
  gate.resolve();await pause();await pause();
  assert.deepEqual(f.store.get(SIDEBAR_TOOL_STORE),[]);assert.equal(f.store.has(key),false);
});
test('two Side Panels preserve distinct fields through the same storage lock',async t=>{
  const originalWindow=globalThis.window,originalConfirm=globalThis.confirm;
  const store=new Map([[SIDEBAR_TOOL_STORE,[sample]]]),locks=sharedLocks();
  const a=await hostFixture(t,{store,locks}),b=await hostFixture(t,{store,locks});
  a.ask('storage.set',{key:'alpha',value:1});b.ask('storage.set',{key:'beta',value:2});
  await pause();await pause();assert.deepEqual(store.get(sidebarToolStorageKey(sample.id)),{alpha:1,beta:2});
  t.after(()=>{globalThis.window=originalWindow;globalThis.confirm=originalConfirm;});
});
test('a second iframe load revokes the old document instead of resending its token',async t=>{
  const f=await hostFixture(t);const loaded=f.frame.onload;loaded();
  assert.equal(f.frame.contentWindow.sent.length,1);assert.equal(f.elements['sidebar-tool-frame'].children.length,0);
  f.ask('tasks.open',{taskId:'installed-task'});await pause();assert.equal(f.focused,0);
});
test('cross-window uninstall rejects storage from a still open stale document',async t=>{
  const f=await hostFixture(t);f.store.set(SIDEBAR_TOOL_STORE,[]);
  f.ask('storage.set',{key:'note',value:'stale'});await pause();await pause();
  assert.equal(f.store.has(sidebarToolStorageKey(sample.id)),false);
  assert.equal(f.frame.contentWindow.sent.at(-1).ok,false);
});
test('cross-window revocation also blocks stale page reads and task navigation',async t=>{
  const f=await hostFixture(t);f.store.set(SIDEBAR_TOOL_STORE,[]);
  f.ask('currentPage.info',{},'1');f.ask('tasks.open',{taskId:'installed-task'},'2');
  await pause();await pause();assert.equal(f.focused,0);
  const replies=f.frame.contentWindow.sent.filter(m=>m.kind==='response');
  assert.equal(replies.length,2);assert.ok(replies.every(m=>m.ok===false));
});
test('Chrome storage property ordering does not revoke the same installed package',async t=>{
  const f=await hostFixture(t);
  const sorted=Object.fromEntries(Object.entries(sample).sort(([a],[b])=>a.localeCompare(b)));
  f.store.set(SIDEBAR_TOOL_STORE,[sorted]);
  f.change([sorted]);
  assert.equal(f.elements['sidebar-tool-frame'].children[0],f.frame);
  f.ask('storage.set',{key:'note',value:'中文'});
  await pause();await pause();
  assert.deepEqual(f.store.get(sidebarToolStorageKey(sample.id)),{note:'中文'});
  f.change([{...sorted,js:'void 1;'}]);
  assert.equal(f.elements['sidebar-tool-frame'].children.length,0);
});

test('tools switch as one mini-app, return to list, and revoke hidden frames',async t=>{
  const f=await hostFixture(t);
  const second={...sample,id:'second-tool',title:'第二个工具',version:'2.0.0'};
  f.store.set(SIDEBAR_TOOL_STORE,[sample,second]);
  f.change([sample,second]);
  assert.equal(f.elements['sidebar-tool-frame'].children.length,1);
  f.host.closeTool();
  assert.equal(f.elements['sidebar-tool-list'].children.length,2);
  assert.equal(f.elements['sidebar-tool-list-view'].hidden,false);
  f.elements['sidebar-tool-list'].children[1].children[0].emit('click');
  assert.equal(f.elements['sidebar-tool-list-view'].hidden,true);
  assert.equal(f.elements['sidebar-tool-frame'].children.length,1,'only one sandbox may be active');
  assert.match(f.elements['sidebar-tool-title'].textContent,/第二个工具/);
  f.host.setVisible(false);
  assert.equal(f.elements['sidebar-tool-frame'].children.length,0,'leaving Tools revokes the session');
  f.host.setVisible(true);
  assert.equal(f.elements['sidebar-tool-frame'].children.length,0,'returning to Tools must not restart the mini-app');
  assert.equal(f.elements['sidebar-tool-list-view'].hidden,false);
  f.host.openTool(second.id);
  assert.match(f.elements['sidebar-tool-title'].textContent,/第二个工具/,'explicit Open starts chosen mini-app');
  f.host.closeTool();
  f.host.setVisible(false);f.host.setVisible(true);
  assert.equal(f.elements['sidebar-tool-frame'].children.length,0,'explicit Back remains on the list');
  assert.equal(f.elements['sidebar-tool-list'].children.length,2);
});


test('R14 import refuses oversized packages, ignores stale asynchronous reads and preserves filename',async t=>{
  const f=await hostFixture(t);
  f.host.closeTool();
  f.elements['sidebar-tool-import-trigger'].emit('click');
  const input=f.elements['sidebar-tool-file'];
  input.files=[{name:'too-big.json',size:320001,text:async()=>JSON.stringify(sample)}];
  input.value='C:\\fakepath\\too-big.json';
  input.emit('change');await pause();
  assert.match(f.elements['sidebar-tool-file-error'].textContent,/超过 320 KB/);
  assert.equal(input.value,'C:\\fakepath\\too-big.json','selected filename must remain in native picker');
  assert.equal(f.elements['sidebar-tool-install'].disabled,true);
  const gate=deferred();
  input.files=[{name:'first.json',size:10,text:()=>gate.promise}];
  input.emit('change');
  input.files=[{name:'second.json',size:JSON.stringify(sample).length,text:async()=>JSON.stringify(sample)}];
  input.emit('change');await pause();await pause();
  gate.resolve('{invalid');await pause();await pause();
  assert.equal(f.elements['sidebar-tool-preview'].hidden,false,'old invalid parse cannot replace new approval');
  assert.equal(f.elements['sidebar-tool-file-error'].hidden,true);
  assert.equal(f.elements['sidebar-tool-preview-file'].textContent,'文件：second.json');
});

test('R14 preview compares permissions and downgrade, confirmation protects update and retains data',async t=>{
  const older={...sample,version:'3.0.0',capabilities:['storage.local']};
  const store=new Map([[SIDEBAR_TOOL_STORE,[older]],[sidebarToolStorageKey(sample.id),{memo:'kept'}]]);
  const f=await hostFixture(t,{store});
  f.host.closeTool();
  f.elements['sidebar-tool-import-trigger'].emit('click');
  const file=JSON.stringify({...sample,version:'2.0.0'});
  f.elements['sidebar-tool-file'].files=[{name:'update.opendesk-tool.json',size:file.length,text:async()=>file}];
  f.elements['sidebar-tool-file'].emit('change');await pause();await pause();
  assert.equal(f.elements['sidebar-tool-update'].hidden,false);
  assert.match(f.elements['sidebar-tool-update-versions'].textContent,/3\.0\.0.*2\.0\.0/);
  assert.match(f.elements['sidebar-tool-update-capabilities'].textContent,/新增能力：.*读取当前网页/);
  assert.match(f.elements['sidebar-tool-update-warning'].textContent,/版本回退/);
  let prompted=0;globalThis.confirm=()=>{prompted++;return false;};
  f.elements['sidebar-tool-install'].emit('click');await pause();await pause();await pause();
  assert.equal(prompted,1);assert.equal(store.get(SIDEBAR_TOOL_STORE)[0].version,'3.0.0');
  globalThis.confirm=()=>true;
  f.elements['sidebar-tool-install'].emit('click');await pause();await pause();await pause();
  assert.equal(store.get(SIDEBAR_TOOL_STORE)[0].version,'2.0.0');
  assert.deepEqual(store.get(sidebarToolStorageKey(sample.id)),{memo:'kept'});
  assert.equal(f.elements['sidebar-tool-frame'].children.length,0,'update cannot auto execute');
});

test('R26 stopped detail uninstall requires consent without running tool code',async t=>{
  const key=sidebarToolStorageKey(sample.id);
  const store=new Map([[SIDEBAR_TOOL_STORE,[sample]],[SIDEBAR_TOOL_ENABLE_STORE,{[sample.id]:false}],[key,{note:'private'}]]);
  const f=await hostFixture(t,{store,startTool:false});
  assert.equal(f.elements['sidebar-tool-list'].children.length,1);
  const item=f.elements['sidebar-tool-list'].children[0];
  assert.equal(item.className,'sidebar-tool-row');
  assert.equal(item.children[0].tag,'button');
  assert.equal(item.children.length,1,'list only enters a tool');
  f.host.openTool(sample.id);
  const deleteButton=f.elements['sidebar-tool-remove'];
  assert.match(deleteButton.attributes.get('aria-label'),/卸载.*网页笔记/);
  assert.equal(f.elements['sidebar-tool-frame'].children.length,0);
  let confirmations=0;
  globalThis.confirm=()=>{confirmations++;return false;};
  deleteButton.emit('click');await pause();await pause();
  assert.equal(confirmations,1);
  assert.equal(store.get(SIDEBAR_TOOL_STORE).length,1,'canceled action must not uninstall');
  assert.deepEqual(store.get(key),{note:'private'},'canceled action must not delete data');
  globalThis.confirm=()=>true;
  deleteButton.emit('click');await pause();await pause();await pause();
  assert.equal(store.get(SIDEBAR_TOOL_STORE).length,0,'explicit list uninstall removes the package');
  assert.equal(store.has(key),false,'list uninstall removes its namespaced data');
  assert.equal(f.elements['sidebar-tool-frame'].children.length,0,'deletion cannot execute the tool');
});

test('R14 cross-window tool update invalidates review and clears the stale file selection',async t=>{
  const f=await hostFixture(t,{startTool:false});
  f.elements['sidebar-tool-import-trigger'].emit('click');
  const input=f.elements['sidebar-tool-file'];
  const update={...sample,version:'1.1.0'};
  input.value='C:\\fakepath\\update.opendesk-tool.json';
  input.files=[{name:'update.opendesk-tool.json',size:JSON.stringify(update).length,text:async()=>JSON.stringify(update)}];
  input.emit('change');await pause();await pause();
  assert.equal(f.elements['sidebar-tool-install'].disabled,false);
  const concurrent={...sample,version:'1.0.1'};
  f.store.set(SIDEBAR_TOOL_STORE,[concurrent]);
  f.change([concurrent]);
  assert.equal(f.elements['sidebar-tool-install'].disabled,true,'old review cannot authorize a new state');
  assert.equal(f.elements['sidebar-tool-preview'].hidden,true);
  assert.equal(input.value,'','old selection must be cleared to allow a same-name reselect');
  assert.match(f.elements['sidebar-tool-file-error'].textContent,/重新选择文件/);
});


test('R14.1 delayed initial catalog read never overwrites a newer storage notification',async t=>{
  const gate=deferred(),entered=deferred();
  const store=new Map([[SIDEBAR_TOOL_STORE,[sample]]]);
  const f=await hostFixture(t,{store,startTool:false,snapshotBeforeGet:true,awaitReady:false,
    getHook:async key=>{if(key===SIDEBAR_TOOL_STORE){entered.resolve();await gate.promise;}}});
  await entered.promise;
  const next={...sample,id:'new-notes',title:'其他窗口刚安装'};
  store.set(SIDEBAR_TOOL_STORE,[next]);
  f.change([next]);
  assert.equal(f.elements['sidebar-tool-list'].children[0].dataset.sidebarToolId,next.id);
  gate.resolve();await pause();await pause();
  assert.equal(f.elements['sidebar-tool-list'].children[0].dataset.sidebarToolId,next.id,
    'an older async read must not roll the visible catalog back');
});

test('R4.5 fresh reinstall preserves orphaned private data and requires explicit cleanup',async t=>{
  const key=sidebarToolStorageKey(sample.id);
  const store=new Map([[SIDEBAR_TOOL_STORE,[]],[key,{privateNote:'left by interrupted uninstall'}]]);
  const f=await hostFixture(t,{store,startTool:false});
  f.elements['sidebar-tool-import-trigger'].emit('click');
  const text=JSON.stringify(sample);
  f.elements['sidebar-tool-file'].files=[{name:'quick-notes.json',size:text.length,text:async()=>text}];
  f.elements['sidebar-tool-file'].emit('change');
  await settle(()=>!f.elements['sidebar-tool-preview'].hidden&&!f.elements['sidebar-tool-install'].disabled);
  f.elements['sidebar-tool-install'].emit('click');
  await settle(()=>/未关联卸载确认/.test(f.elements['sidebar-tool-status'].textContent||''));
  assert.deepEqual(store.get(key),{privateNote:'left by interrupted uninstall'},'a blocked installation must preserve existing notes');
  assert.deepEqual(store.get(SIDEBAR_TOOL_STORE),[],'orphan data requires explicit cleanup before admission');
  assert.equal(f.elements['sidebar-tool-frame'].children.length,0,'install must not start code');
  assert.equal(f.elements['sidebar-tool-status'].dataset.state,'error');
});

test('R4.5 delayed initial revocation read preserves a newer epoch without losing the installed list',async t=>{
  const gate=deferred(),entered=deferred(),store=new Map([[SIDEBAR_TOOL_STORE,[sample]]]);
  let delayed=true;
  const f=await hostFixture(t,{store,startTool:false,snapshotBeforeGet:true,awaitReady:false,
    getHook:async key=>{if(key===TOOL_REVOCATION_EPOCHS_STORE&&delayed){delayed=false;entered.resolve();await gate.promise;}}});
  await entered.promise;
  const latest={[sample.id]:'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'};
  store.set(TOOL_REVOCATION_EPOCHS_STORE,latest);
  f.changeStorage({[TOOL_REVOCATION_EPOCHS_STORE]:{newValue:latest}});
  gate.resolve();await f.host.ready;
  assert.equal(f.elements['sidebar-tool-list'].children.length,1,'an epoch-only notification must not discard the initial installed list');
  f.host.openTool(sample.id);
  const frame=f.elements['sidebar-tool-frame'].children[0];await frame.onload();
  const loaded=frame.contentWindow.sent[0];
  f.win.emit('message',{origin:'null',source:frame.contentWindow,data:{protocol:loaded.protocol,
    toolId:sample.id,instance:loaded.instance,kind:'request',requestId:'fresh-epoch',operation:'storage.set',
    payload:{key:'note',value:'valid reopened tool'}}});
  await settle(()=>frame.contentWindow.sent.some(row=>row.requestId==='fresh-epoch'));
  assert.equal(frame.contentWindow.sent.find(row=>row.requestId==='fresh-epoch').ok,true);
  assert.deepEqual(store.get(sidebarToolStorageKey(sample.id)),{note:'valid reopened tool'});
});

test('R4.5 an old iframe cannot read or write an identical reinstall even before epoch notification',async t=>{
  const locks=sharedLocks(),f=await hostFixture(t,{locks}),key=sidebarToolStorageKey(sample.id);
  await locks.request('opendesk.sidebar-tools:tool:'+sample.id,()=>locks.request('opendesk.sidebar-tools:catalog',()=>recordToolUninstall(f.api,sample)));
  // Another window has replaced the registry with identical bytes; this old
  // document has not observed the intermediate removal or epoch notification.
  f.store.set(SIDEBAR_TOOL_STORE,[structuredClone(sample)]);f.store.set(key,{note:'new instance private data'});
  f.ask('storage.get',{key:'note'},'old-read');f.ask('storage.set',{key:'note',value:'stale edit'},'old-write');
  await settle(()=>f.frame.contentWindow.sent.filter(row=>['old-read','old-write'].includes(row.requestId)).length===2);
  const replies=f.frame.contentWindow.sent.filter(row=>['old-read','old-write'].includes(row.requestId));
  assert.ok(replies.every(row=>row.ok===false&&row.error.code==='E_TOOL_CHANGED'));
  assert.deepEqual(f.store.get(key),{note:'new instance private data'});
});

test('R4.5 orphaned private data blocks reinstall until the acknowledged uninstall cleanup completes',async t=>{
  const key=sidebarToolStorageKey(sample.id),privateData={privateNote:'left by interrupted uninstall'};
  const store=new Map([[SIDEBAR_TOOL_STORE,[]],[key,privateData],
    [TOOL_CLEANUP_STORE,{[sample.id]:{version:sample.version,createdAt:1}}]]);
  const f=await hostFixture(t,{store,startTool:false});
  async function reviewAndConfirm(){
    f.elements['sidebar-tool-import-trigger'].emit('click');
    const text=JSON.stringify(sample);
    f.elements['sidebar-tool-file'].files=[{name:'quick-notes.json',size:text.length,text:async()=>text}];
    f.elements['sidebar-tool-file'].emit('change');
    await settle(()=>!f.elements['sidebar-tool-install'].disabled);
    f.elements['sidebar-tool-install'].emit('click');
  }
  await reviewAndConfirm();
  await settle(()=>/上次卸载的本地数据/.test(f.elements['sidebar-tool-status'].textContent||''));
  assert.deepEqual(store.get(key),privateData,'failed admission preserves the previous owner data');
  assert.deepEqual(store.get(SIDEBAR_TOOL_STORE),[]);
  assert.equal(f.elements['sidebar-tool-frame'].children.length,0,'refused install must not start code');
  assert.equal((await retryUninstalledToolCleanup({api:f.api,lockManager:sharedLocks(),id:sample.id})).state,'cleaned');
  assert.equal(store.has(key),false,'only the acknowledged uninstall cleanup removes old data');
  assert.deepEqual(store.get(SIDEBAR_TOOL_STORE),[],'cleanup itself does not install anything');
  await reviewAndConfirm();
  await settle(()=>store.get(SIDEBAR_TOOL_STORE)?.length===1&&f.elements['sidebar-tool-list'].children.length===1);
  assert.equal(store.get(SIDEBAR_TOOL_STORE)[0].id,sample.id);
  assert.equal(f.elements['sidebar-tool-frame'].children.length,0,'install must not start code');
  assert.equal(f.elements['sidebar-tool-list'].children[0].children[0].focused,true,
    'focus returns to installed tool after successful import');
});

test('R14.1 list renders and Back/uninstall preserve useful keyboard focus',async t=>{
  const f=await hostFixture(t,{startTool:false});
  const first=f.elements['sidebar-tool-list'].children[0].children[0];
  first.focus();
  const second={...sample,id:'second-tool',title:'Second'};
  f.store.set(SIDEBAR_TOOL_STORE,[sample,second]);
  f.change([sample,second]);
  assert.equal(f.elements['sidebar-tool-list'].children[0].children[0].focused,true,
    'cross-window list render must restore focused Open button');
  f.host.openTool(sample.id);
  f.elements['sidebar-tool-back'].emit('click');
  assert.equal(f.elements['sidebar-tool-list'].children[0].children[0].focused,true,
    'Back should return to the tool that was opened');
  f.host.openTool(f.elements['sidebar-tool-list'].children[0].dataset.sidebarToolId);
  f.elements['sidebar-tool-remove'].emit('click');
  await pause();await pause();await pause();
  assert.equal(f.elements['sidebar-tool-list'].children[0].dataset.sidebarToolId,second.id);
  assert.equal(f.elements['sidebar-tool-list'].children[0].children[0].focused,true,
    'list uninstall should move focus to the next installed tool');
  f.host.openTool(f.elements['sidebar-tool-list'].children[0].dataset.sidebarToolId);
  f.elements['sidebar-tool-remove'].emit('click');
  await pause();await pause();await pause();
  assert.equal(f.elements['sidebar-tool-list'].children.length,0);
  assert.equal(f.elements['sidebar-tool-import-trigger'].focused,true,
    'last-tool uninstall should return focus to Import');
});

test('stopped tool detail opens a fixed full-page route without running sidebar code',async t=>{
  const f=await hostFixture(t,{startTool:false,store:new Map([[SIDEBAR_TOOL_STORE,[sample]],[SIDEBAR_TOOL_ENABLE_STORE,{[sample.id]:false}]])});
  const opened=[];f.api.tabs={create:async options=>{opened.push(options.url);}};
  f.host.openTool(sample.id);
  assert.equal(f.elements['sidebar-tool-frame'].children.length,0);
  f.elements['sidebar-tool-open-tab'].emit('click');await pause();await pause();
  assert.deepEqual(opened,['chrome-extension://test/ui/tool.html?toolId=quick-notes']);
  assert.equal(f.elements['sidebar-tool-frame'].children.length,0);
});

test('R18 resize and status messages accept only the live opaque frame and bounded sizes',async t=>{
  const f=await hostFixture(t);
  const loaded=f.frame.contentWindow.sent[0];
  f.frame.style={};
  const send=(source,origin,kind,more={},instance=loaded.instance)=>{
    globalThis.window.emit('message',{source,origin,data:{
      protocol:loaded.protocol,kind,instance,toolId:sample.id,...more}});
  };
  send({},'null','resize',{height:260});
  send(f.frame.contentWindow,'https://evil.example','resize',{height:260});
  send(f.frame.contentWindow,'null','resize',{height:260},'forged');
  send(f.frame.contentWindow,'null','resize',{height:NaN});
  send(f.frame.contentWindow,'null','resize',{height:90000});
  assert.equal(f.frame.style.height,undefined,'forged or unbounded size never applies');
  send(f.frame.contentWindow,'null','resize',{height:240});
  assert.equal(f.frame.style.height,'240px');
  send(f.frame.contentWindow,'null','resize',{height:2500});
  assert.equal(f.frame.style.height,'1600px','size hints may not exceed the safety cap');
  send(f.frame.contentWindow,'null','status',{state:'ready',message:'工具已就绪'});
  assert.equal(f.elements['sidebar-tool-status'].hidden,true,'no duplicate ready banner');
  send(f.frame.contentWindow,'null','status',{state:'error',message:'测试异常'});
  assert.equal(f.elements['sidebar-tool-status'].hidden,false,'error stays visible');
  assert.match(f.elements['sidebar-tool-status'].textContent,/测试异常/);
  f.host.closeTool();
  send(f.frame.contentWindow,'null','resize',{height:600});
  assert.equal(f.frame.style.height,'1600px','retired frame has no authority');
});

test('uninstalled read-only preview cannot write, run Task or invoke page operations',async t=>{
  const f=await hostFixture(t,{startTool:false});
  f.host.openReadOnlyPreview(sample);
  const frame=f.elements['sidebar-tool-frame'].children[0];
  assert.ok(frame,'preview displays the same opaque sandbox');
  await frame.onload();const loaded=frame.contentWindow.sent[0];
  assert.equal(f.elements['sidebar-tool-remove'].disabled,true);
  assert.equal(f.host.isPreviewDirty(),false);
  globalThis.window.emit('message',{source:frame.contentWindow,origin:'null',
    data:{protocol:loaded.protocol,toolId:sample.id,instance:loaded.instance,kind:'dirty'}});
  assert.equal(f.host.isPreviewDirty(),true,'a user input defers automatic remount');
  const ask=async(operation,payload,id)=>{
    globalThis.window.emit('message',{source:frame.contentWindow,origin:'null',
      data:{protocol:loaded.protocol,toolId:sample.id,instance:loaded.instance,
        kind:'request',requestId:id,operation,payload}});
    await pause();await pause();
    return frame.contentWindow.sent.find(row=>row.kind==='response'&&row.requestId===id);
  };
  const read=await ask('storage.get',{key:'note'},'1');
  assert.equal(read.ok,true);assert.equal(read.result.value,null);
  for(const [op,payload] of [['storage.set',{key:'note',value:'danger'}],
    ['tasks.open',{taskId:'installed-task'}],['currentPage.info',{}]]){
    const result=await ask(op,payload,op);
    if(op==='currentPage.info'){assert.equal(result.ok,true);assert.equal(result.result.status,'unavailable');}
    else assert.equal(result.ok,false);
  }
  assert.equal(f.store.has(sidebarToolStorageKey(sample.id)),false);
  f.host.closeTool();
  assert.equal(f.elements['sidebar-tool-frame'].children.length,0);
  await ask('storage.set',{key:'note',value:'replay'},'later');
  assert.equal(f.store.has(sidebarToolStorageKey(sample.id)),false);
});

test('R18.1 conditional writes atomically reject a stale full-array replacement',async t=>{
  const f=await hostFixture(t);
  const response=async id=>{
    // WebCrypto digest runs asynchronously and may outlive several setImmediate turns.
    for(let i=0;i<150;i++){
      const row=f.frame.contentWindow.sent.find(v=>v.kind==='response'&&v.requestId===id);
      if(row)return row;
      await new Promise(resolve=>setTimeout(resolve,10));
    }
    throw new Error('宿主存储回复超时：'+id);
  };
  f.ask('storage.get',{key:'notes',withEtag:true},'91');
  const first=await response('91');
  assert.equal(first.ok,true,JSON.stringify(first.error));
  const token=first.result.etag;
  assert.match(token,/^[a-f0-9]{64}$/);
  f.ask('storage.set',{key:'notes',value:[{id:'a',text:'甲'}],ifMatch:token},'92');
  const saved=await response('92');
  assert.equal(saved.ok,true,JSON.stringify(saved.error));
  assert.notEqual(saved.result.etag,token);
  f.ask('storage.set',{key:'notes',value:[{id:'a',text:'乙'}],ifMatch:token},'93');
  const rejected=await response('93');
  assert.equal(rejected.ok,false);
  assert.match(rejected.error.message,/其他窗口/);
  assert.equal(f.store.get(sidebarToolStorageKey(sample.id)).notes[0].text,'甲');
});

test('R18.1 page metadata notification only targets a live tool iframe',async t=>{
  const callbacks=[];
  const target={snapshot:{status:'available',url:'https://example.com',title:'Example'},
    subscribe(fn){callbacks.push(fn);return()=>{};}};
  const f=await hostFixture(t,{target});
  const count=f.frame.contentWindow.sent.length;
  target.snapshot={status:'unavailable'};callbacks[0]();
  assert.equal(f.frame.contentWindow.sent.length,count+1);
  assert.equal(f.frame.contentWindow.sent.at(-1).kind,'page-changed');
  f.host.closeTool();callbacks[0]();
  assert.equal(f.frame.contentWindow.sent.length,count+1);
});

test('R4.5 identical page revalidation preserves actual clipper results, while same-URL navigation invalidates them',async t=>{
  const tool=await officialToolFixture('web-markdown-clipper');
  const tab={id:7,windowId:1,active:true,status:'complete',title:'页面测试',url:'https://article.example/read'};
  let documentId='document-a';
  const target=createCurrentPageTarget({api:{windows:{getCurrent:async()=>({id:1})},
    tabs:{query:async()=>[{...tab}]},webNavigation:{getAllFrames:async()=>[{frameId:0,documentId,url:tab.url}]}}});
  t.after(()=>target.dispose());await target.ready;
  // A reinstated tool has a non-null durable epoch. The host must forward
  // that exact epoch into the real clipper content message, not silently send
  // an undefined value that the page correctly rejects as revoked.
  const clipInstallEpoch='f462e128-21c3-4b8d-9f2a-51bdc82378ac';
  const store=new Map([[SIDEBAR_TOOL_STORE,[tool]],[CLIP_SITE_STORE,{[tool.id]:['https://article.example']}],
    [TOOL_REVOCATION_EPOCHS_STORE,{[tool.id]:clipInstallEpoch}]]);
  const f=await hostFixture(t,{tool,store,target});
  let gate=null,reads=0;
  f.api.tabs={sendMessage:async(tabId,message,options)=>{
    assert.equal(tabId,7);assert.equal(message.operation,'clip.article');
    assert.equal(message.installEpoch,clipInstallEpoch,'reinstalled clipper sends the live revocation epoch');
    assert.deepEqual(options,{frameId:0,documentId});reads++;
    if(gate)await gate.promise;
    return {ok:true,data:{markdown:'# 页面测试\n正文',source:tab.url,title:tab.title,site:'article.example'}};
  }};
  const root=new Node(),nodes=new Map(),pending=new Map();let requestId=0;
  root.querySelector=selector=>{if(!nodes.has(selector))nodes.set(selector,new Node());return nodes.get(selector);};
  root.querySelectorAll=()=>[];root.querySelector('#clip-meta').value='footer';
  f.frame.contentWindow.postMessage=message=>{
    f.frame.contentWindow.sent.push(message);
    if(message.kind==='page-changed')root.emit('opendesk-page-changed');
    const waiter=pending.get(message.requestId);
    if(message.kind==='response'&&waiter){pending.delete(message.requestId);message.ok?waiter.resolve(message.result):waiter.reject(Error(message.error.message));}
  };
  runInNewContext(tool.js,{OpenDeskTool:{root,request(operation,payload){
    const id=String(++requestId);return new Promise((resolve,reject)=>{
      pending.set(id,{resolve,reject});f.ask(operation,payload,id);
    });
  }},document:{createDocumentFragment:()=>new Node(),createElement:tag=>new Node(tag)}});
  const fetchButton=root.querySelector('#clip-fetch'),source=root.querySelector('#clip-source');
  fetchButton.emit('click');await settle(()=>reads===1&&fetchButton.disabled===false);
  assert.match(source.value,/# 页面测试\n正文/,'the real tool must retain a reply checked twice against the same document');
  assert.equal(f.frame.contentWindow.sent.filter(row=>row.kind==='page-changed').length,0);
  const captured=target.capture();documentId='document-b';
  await assert.rejects(target.revalidate(captured),{code:'E_DOCUMENT_STALE'});
  assert.equal(source.value,'','authoritative revalidation detects a same-URL reload even before a navigation event');
  assert.equal(f.frame.contentWindow.sent.filter(row=>row.kind==='page-changed').length,1);
  gate=deferred();fetchButton.emit('click');await settle(()=>reads===2);
  documentId='document-c';const refreshed=target.refresh();
  assert.equal(source.value,'','resolving invalidates a pending clip before the new document is available');
  await refreshed;gate.resolve();await settle(()=>fetchButton.disabled===false);
  assert.equal(source.value,'','same URL with a new document ID must reject the old reply');
  assert.equal(f.frame.contentWindow.sent.filter(row=>row.kind==='page-changed').length,3);
  assert.equal(f.frame.contentWindow.sent.filter(row=>row.kind==='response').at(-1).ok,false);
});

test('R4.5 unrelated page notifications preserve the official install button through a pointer gesture',async t=>{
  let notify;const target={snapshot:{status:'available',url:'https://article.example/a',title:'A'},
    subscribe(fn){notify=fn;fn(this.snapshot);return()=>{};}};
  const f=await hostFixture(t,{target,store:new Map(),startTool:false});await pause();
  const root=f.elements['sidebar-tool-official-catalog'],button=root.children[0].children.at(-1);
  target.snapshot={status:'resolving'};notify(target.snapshot);
  target.snapshot={status:'available',url:'https://article.example/b',title:'B'};notify(target.snapshot);
  assert.equal(root.children[0].children.at(-1),button,'page observation must not replace an unchanged install control');
  button.emit('click');await settle(()=>!f.elements['sidebar-tool-preview'].hidden);
  assert.equal(f.store.has(SIDEBAR_TOOL_STORE),false,'a retained control still only opens review');
});

test('R4.7 official TOC list stays compact while repeated page observations preserve its Open action',async t=>{
  const toc=await officialToolFixture('reading-toc');let notify;
  const target={snapshot:{status:'available',url:'https://article.example/a',title:'A'},
    subscribe(fn){notify=fn;fn(this.snapshot);return()=>{};}};
  const f=await hostFixture(t,{target,store:new Map([[SIDEBAR_TOOL_STORE,[toc]]]),startTool:false});await pause();
  const list=f.elements['sidebar-tool-list'],first=list.children[0],open=first.children[0];
  assert.equal(first.children.some(node=>node.dataset?.sidebarToolAction==='site'),false,
    'official TOC no longer adds an authorization button to the installed row');
  assert.equal(first.children.some(node=>node.dataset?.sidebarToolAction==='sites'),false,
    'the row no longer expands a settings panel');
  notify(target.snapshot);f.host.setVisible(true);
  target.snapshot={...target.snapshot,title:'Updated title',url:'https://article.example/other'};notify(target.snapshot);
  assert.equal(list.children[0],first,'unchanged tool stays stable on same-origin page observations');
  open.emit('click');
  assert.equal(f.elements['sidebar-tool-frame'].children.length,1);
  assert.equal(f.elements['sidebar-tool-settings-open'].hidden,false,'gear belongs to active detail toolbar');
  f.elements['sidebar-tool-settings-open'].emit('click');
  assert.equal(f.elements['sidebar-tool-settings-view'].hidden,false);
  target.snapshot={status:'unavailable'};notify(target.snapshot);
  assert.equal(f.elements['sidebar-tool-settings-allow'].disabled,true);
  assert.equal(f.elements['sidebar-tool-settings-deny'].disabled,true);
});

test('R4.7 settings live next to retained TOC iframe; appearance remains separate from runtime permissions',async t=>{
  const toc=await officialToolFixture('reading-toc');
  const url='https://article.example/long-answer?q=private';
  const store=new Map([[SIDEBAR_TOOL_STORE,[toc]],
    [READING_TOC_SITE_STORE,{'reading-toc':['https://article.example']}]]); 
  const target={snapshot:{status:'available',url,title:'Long answer'},
    capture(){return {url,origin:'https://article.example',tabId:5,documentId:'doc'};},
    async revalidate(){return true;}};
  const f=await hostFixture(t,{target,store,tool:toc});
  const gear=f.elements['sidebar-tool-settings-open'],back=f.elements['sidebar-tool-back'];
  assert.equal(gear.hidden,false);
  const iframe=f.elements['sidebar-tool-frame'].children[0];
  gear.emit('click');
  assert.equal(f.elements['sidebar-tool-settings-view'].hidden,false);
  assert.equal(f.elements['sidebar-tool-frame'].hidden,true);
  assert.equal(f.elements['sidebar-tool-frame'].children[0],iframe,'the sandbox is retained, not reloaded');
  assert.equal(f.elements['sidebar-tool-title'].textContent,toc.title);
  const pagePrefs=changeReadingTocVisibility({},toc.id,url,'page',true);
  f.changeStorage({[READING_TOC_VISIBILITY_STORE]:{newValue:pagePrefs}});
  assert.equal(f.elements['sidebar-tool-settings-page-visibility'].textContent,'恢复显示');
  assert.deepEqual(store.get(READING_TOC_SITE_STORE),{'reading-toc':['https://article.example']});
  back.emit('click');
  assert.equal(f.elements['sidebar-tool-frame'].hidden,false);
  assert.equal(f.elements['sidebar-tool-frame'].children[0],iframe);
  assert.equal(f.elements['sidebar-tool-settings-view'].hidden,true);
  back.emit('click');
  assert.equal(f.elements['sidebar-tool-frame'].children.length,0,'leaving the tool really tears down the sandbox');
});

test('R26 page appearance is independent of site authorization and global availability',async t=>{
  const toc=await officialToolFixture('reading-toc'),url='https://article.example/long-answer?private=1';
  const store=new Map([[SIDEBAR_TOOL_STORE,[toc]],
    [READING_TOC_SITE_STORE,{'reading-toc':['https://article.example']}]]);
  const target={snapshot:{status:'available',url},capture(){return {url,origin:'https://article.example',tabId:5,documentId:'doc'};},async revalidate(){return true;}};
  const f=await hostFixture(t,{target,store,tool:toc});
  f.elements['sidebar-tool-settings-open'].emit('click');
  f.elements['sidebar-tool-settings-page-visibility'].emit('click');
  await settle(()=>Boolean(store.get(READING_TOC_VISIBILITY_STORE)?.[toc.id]?.hiddenPages?.length));
  assert.deepEqual(store.get(READING_TOC_SITE_STORE),{[toc.id]:['https://article.example']});
  assert.equal(store.has(READING_TOC_PAGE_RULES_STORE),false);
  f.elements['sidebar-tool-settings-page-visibility'].emit('click');
  await settle(()=>!store.get(READING_TOC_VISIBILITY_STORE)?.[toc.id]);
});

test('R4.7 the independent settings page can revoke a previously granted website',async t=>{
  const toc={...sample,id:'reading-toc',capabilities:['page.toc']};
  const store=new Map([[SIDEBAR_TOOL_STORE,[toc]],
    [READING_TOC_SITE_STORE,{'reading-toc':['https://article.example','https://old.example']}]]); 
  const target={snapshot:{status:'available',url:'https://article.example/latest'}};
  const f=await hostFixture(t,{store,startTool:true,tool:toc,target});
  assert.equal(f.elements['sidebar-tool-list'].children.length,1);
  f.elements['sidebar-tool-settings-open'].emit('click');
  const sites=f.elements['sidebar-tool-settings-sites'];
  const oldSite=sites.children.find(row=>row.children[0]?.textContent==='https://old.example');
  assert.ok(oldSite,'previously approved websites can be managed from the independent view');
  oldSite.children[1].emit('click');
  await settle(()=>!store.get(READING_TOC_SITE_STORE)?.[toc.id]?.includes('https://old.example'));
  assert.deepEqual(store.get(READING_TOC_SITE_STORE),{'reading-toc':['https://article.example']});
  assert.deepEqual(store.get(SIDEBAR_TOOL_STORE),[toc],'revoke does not replace the tool package');
});


for(const [toolId,key,url,origin] of [
  ['reading-toc',READING_TOC_SITE_STORE,'http://127.0.0.1:43111/demo-form.html','http://127.0.0.1:43111'],
  ['web-markdown-clipper',CLIP_SITE_STORE,'https://article.example/story','https://article.example'],
  ['knowledge-inbox',CAPTURE_SITE_STORE,'https://chatgpt.com/c/fixture','https://chatgpt.com']
])test('site permission settings apply one click without a second dialog: '+toolId,async t=>{
  const tool=await officialToolFixture(toolId),store=new Map([[SIDEBAR_TOOL_STORE,[tool]]]);
  let invalidated=false,validated=0,dialogCount=0;
  const target={snapshot:{status:'available',url},
    capture(){return {url,origin,windowId:1,tabId:7,frameId:0,documentId:'doc-a'};},
    async revalidate(){validated++;
      if(invalidated)throw Object.assign(new Error('当前网页已变化'),{code:'E_DOCUMENT_STALE'});}
  };
  const f=await hostFixture(t,{store,tool,target});
  f.elements['sidebar-tool-settings-open'].emit('click');
  const allow=f.elements['sidebar-tool-settings-allow'];
  const deny=f.elements['sidebar-tool-settings-deny'];
  assert.equal(allow.disabled,false);
  assert.equal(allow.attributes.get('aria-pressed'),'false');
  assert.match(f.elements['sidebar-tool-settings-hint'].textContent,/点击授权后直接生效/);
  globalThis.confirm=()=>{dialogCount++;return false;};
  allow.focus();
  allow.emit('click');
  allow.emit('click'); // repeated clicks before the first commit must not flip consent
  await settle(()=>store.get(key)?.[toolId]?.includes(origin)===true&&!allow.disabled);
  assert.deepEqual(store.get(key),{[toolId]:[origin]},'only the chosen exact Origin is granted');
  assert.equal(allow.attributes.get('aria-pressed'),'true');
  assert.equal(f.elements['sidebar-tool-settings-view'].hidden,false);
  assert.equal(dialogCount,0,'site grant is a direct action, not window.confirm');
  if(toolId==='reading-toc'){
    const eye=f.elements['sidebar-tool-visibility'];
    assert.equal(eye.disabled,false);
    eye.emit('click');eye.emit('click');
    await settle(()=>Boolean(store.get(READING_TOC_VISIBILITY_STORE)?.[toolId]?.hiddenSites?.includes(origin))&&!eye.disabled);
    assert.deepEqual(store.get(key),{[toolId]:[origin]},'hide is independent of website grant');
    eye.emit('click');
    await settle(()=>!store.get(READING_TOC_VISIBILITY_STORE)?.[toolId]&&!eye.disabled);
    assert.equal(dialogCount,0,'show/hide must never prompt');
  }
  deny.emit('click');
  await settle(()=>!store.get(key)?.[toolId]&&!deny.disabled);
  assert.equal(deny.attributes.get('aria-pressed'),'true');
  assert.equal(dialogCount,0,'site revocation needs no dialog');
  invalidated=true;
  allow.emit('click');
  await settle(()=>/E_DOCUMENT_STALE/.test(f.elements['sidebar-tool-status'].textContent||''));
  assert.equal(store.get(key)?.[toolId],undefined,'stale document must not gain a permission');
  assert.equal(dialogCount,0);
  assert.ok(validated>=3,'native target binding is checked before persistent write');
});

test('R4.3 existing 1.0.0 TOC exposes update, reviews patch, preserves site grants',async t=>{
  const bundled=await officialToolFixture('reading-toc');
  const old={...bundled,version:'1.0.0',js:'void 0;'};
  const granted={'reading-toc':['https://article.example']};
  const f=await hostFixture(t,{store:new Map([
    [SIDEBAR_TOOL_STORE,[old]],[READING_TOC_SITE_STORE,granted]
  ]),startTool:false,target:{snapshot:{status:'available',url:'https://article.example/demo'}}});
  const list=f.elements['sidebar-tool-list'];
  assert.ok(list.children[0].children[0].children[1].children[0].children.some(node=>node.textContent==='可更新'),
    'update appears beside the installed tool, not as a top recommendation');
  assert.equal(f.elements['sidebar-tool-official-catalog'].children.some(row=>row.dataset.officialToolId==='reading-toc'),false,
    'default discover does not repeat installed versions');
  f.elements['sidebar-tool-filter-all'].emit('click');
  const officialRow=()=>f.elements['sidebar-tool-official-catalog'].children.find(row=>row.dataset.officialToolId==='reading-toc');
  const button=officialRow().children.at(-1);
  assert.equal(officialRow().dataset.installationState,'update','existing old installation exposes update');
  assert.equal(button.textContent,'更新');
  button.emit('click');
  await settle(()=>!f.elements['sidebar-tool-preview'].hidden);
  assert.equal(f.elements['sidebar-tool-preview'].hidden,false,'update requires explicit review');
  assert.equal(f.elements['sidebar-tool-preview-version'].textContent,'v'+bundled.version);
  assert.equal(f.elements['sidebar-tool-install'].textContent,'确认更新');
  assert.equal(f.store.get(SIDEBAR_TOOL_STORE)[0].version,'1.0.0',
    'preview must not upgrade until consent');
  f.elements['sidebar-tool-install'].emit('click');
  await settle(()=>f.store.get(SIDEBAR_TOOL_STORE)[0].version===bundled.version);
  await settle(()=>officialRow().children.at(-1).textContent==='打开');
  assert.equal(f.store.get(SIDEBAR_TOOL_STORE)[0].version,bundled.version);
  assert.deepEqual(f.store.get(READING_TOC_SITE_STORE),granted);
  assert.equal(officialRow().dataset.installationState,'installed');
  assert.equal(officialRow().children.at(-1).textContent,'打开');
});

test('knowledge editor protects user navigation, clears after save, and never vetoes uninstall',async t=>{
  const knowledge=await officialToolFixture('knowledge-inbox');
  const store=new Map([[SIDEBAR_TOOL_STORE,[knowledge,sample]]]);
  const f=await hostFixture(t,{store,startTool:false});
  f.host.openTool(knowledge.id);
  const frame=f.elements['sidebar-tool-frame'].children[0];await frame.onload();
  const loaded=frame.contentWindow.sent[0];let requestId=0;
  const dirty=async value=>{
    globalThis.window.emit('message',{origin:'null',source:frame.contentWindow,
      data:{protocol:loaded.protocol,toolId:knowledge.id,instance:loaded.instance,kind:'request',requestId:String(++requestId),operation:'knowledge.editorState',payload:{dirty:value}}});
    await pause();
  };
  for(let i=0;i<105;i++)globalThis.window.emit('message',{origin:'null',source:frame.contentWindow,
    data:{protocol:loaded.protocol,toolId:knowledge.id,instance:loaded.instance,kind:'request',requestId:'quota-'+i,operation:'knowledge.list',payload:{}}});
  await dirty(true);assert.equal(f.host.isDirty(),true);
  globalThis.confirm=()=>false;
  assert.equal(f.host.closeTool(),false);assert.equal(f.host.setVisible(false),false);
  f.host.openTool(sample.id);
  assert.equal(f.elements['sidebar-tool-frame'].children[0],frame);
  await dirty(false);assert.equal(f.host.isDirty(),false);
  assert.equal(f.host.closeTool(),true);
  f.host.openTool(knowledge.id);
  const pending={'opendesk.knowledge.workspace.v1:123':{private:true},unrelated:{keep:true}};
  f.api.storage.session={get:async()=>pending,remove:async keys=>{for(const key of keys)delete pending[key];}};
  globalThis.confirm=()=>true;
  f.elements['sidebar-tool-remove'].emit('click');await pause();await pause();
  assert.deepEqual(pending,{unrelated:{keep:true}});
  assert.equal(f.elements['sidebar-tool-frame'].children.length,0);
  assert.equal(store.get(SIDEBAR_TOOL_STORE).some(row=>row.id===knowledge.id),false);
});

test('R4.8 manual reviewed installation remains available for every offline official package',async t=>{
  const requested=[],store=new Map();
  const f=await hostFixture(t,{store,startTool:false,fetcher:async(url,options)=>{
    requested.push(new URL(url).pathname);return officialFixtureFetch(url,options);
  }});
  const {catalog}=await officialFixtures();
  assert.equal(f.elements['sidebar-tool-official-catalog'].children.length,catalog.apps.length);
  assert.deepEqual(requested,['/official-tools/catalog.json'],'first run loads metadata only');
  assert.equal(store.has(SIDEBAR_TOOL_STORE),false);
  for(const key of [READING_TOC_SITE_STORE,CLIP_SITE_STORE,CAPTURE_SITE_STORE])assert.equal(store.has(key),false);
  const official=id=>f.elements['sidebar-tool-official-catalog'].children.find(row=>row.dataset.officialToolId===id);
  for(const release of catalog.apps){
    f.elements['sidebar-tool-discover-toggle'].emit('click');
    const before=structuredClone(store.get(SIDEBAR_TOOL_STORE));
    official(release.toolId).children.at(-1).emit('click');
    await settle(()=>!f.elements['sidebar-tool-preview'].hidden);
    assert.equal(f.elements['sidebar-tool-preview-version'].textContent,'v'+release.version);
    assert.deepEqual(store.get(SIDEBAR_TOOL_STORE),before,'review cannot install');
    assert.equal(f.elements['sidebar-tool-frame'].children.length,0);
    f.elements['sidebar-tool-import-close'].emit('click');
    assert.deepEqual(store.get(SIDEBAR_TOOL_STORE),before,'cancel preserves previous registry');
    official(release.toolId).children.at(-1).emit('click');
    await settle(()=>!f.elements['sidebar-tool-preview'].hidden);
    f.elements['sidebar-tool-install'].emit('click');
    f.elements['sidebar-tool-install'].emit('click');
    await settle(()=>f.elements['sidebar-tool-import'].hidden);
    assert.equal(store.get(SIDEBAR_TOOL_STORE).filter(row=>row.id===release.toolId).length,1);
    assert.equal(store.get(MARKET_PROVENANCE_STORE)[release.toolId].sha256,release.sha256);
    assert.equal(official(release.toolId),undefined,'default discovery removes the installed release');
    assert.equal(f.elements['sidebar-tool-my-panel'].hidden,false,'installation keeps the installed list visible');
    assert.equal(f.elements['sidebar-tool-discover-panel'].hidden,true,'installation closes discovery');
    assert.equal(f.elements['sidebar-tool-frame'].children.length,0,'confirmed install cannot run code');
  }
  assert.equal(store.get(SIDEBAR_TOOL_STORE).length,catalog.apps.length);
  for(const release of catalog.apps){
    f.host.openTool(release.toolId);
    f.elements['sidebar-tool-remove'].emit('click');
    await settle(()=>!store.get(SIDEBAR_TOOL_STORE).some(row=>row.id===release.toolId));
    await settle(()=>official(release.toolId).children.at(-1).disabled===false);
    assert.equal(official(release.toolId).dataset.installationState,'available');
  }
  assert.deepEqual(store.get(SIDEBAR_TOOL_STORE),[]);
  f.host.dispose();
  const reopened=await hostFixture(t,{store,startTool:false});
  assert.equal(reopened.elements['sidebar-tool-list'].children.length,0,'reopening cannot reinstall bundled resources');
  assert.equal(reopened.elements['sidebar-tool-frame'].children.length,0);
  for(const key of [READING_TOC_SITE_STORE,CLIP_SITE_STORE,CAPTURE_SITE_STORE])assert.equal(store.has(key),false);
});

test('R4.9 Tools disclosure keeps installed tools visible and never runs code or changes registry',async t=>{
  const f=await hostFixture(t,{startTool:false});
  const add=f.elements['sidebar-tool-discover-toggle'],importButton=f.elements['sidebar-tool-import-trigger'];
  const before=structuredClone(f.store.get(SIDEBAR_TOOL_STORE));
  assert.equal(f.elements['sidebar-tool-my-panel'].hidden,false);
  assert.equal(f.elements['sidebar-tool-discover-panel'].hidden,true);
  assert.equal(add.attributes.get('aria-expanded'),'false');
  add.emit('click');
  assert.equal(add.attributes.get('aria-expanded'),'true');
  assert.equal(f.elements['sidebar-tool-discover-panel'].hidden,false);
  assert.equal(f.elements['sidebar-tool-my-panel'].hidden,false);
  assert.equal(f.elements['sidebar-tool-search'].focused,true,'the search receives keyboard focus');
  assert.equal(f.elements['sidebar-tool-frame'].children.length,0,'disclosure must not start a sandbox');
  assert.deepEqual(f.store.get(SIDEBAR_TOOL_STORE),before,'disclosure does not install anything');
  importButton.emit('click');
  assert.equal(f.elements['sidebar-tool-discover-panel'].hidden,true);
  assert.equal(add.attributes.get('aria-expanded'),'false');
  assert.equal(f.elements['sidebar-tool-import'].hidden,false);
  add.emit('click');
  assert.equal(f.elements['sidebar-tool-import'].hidden,true);
  assert.equal(importButton.attributes.get('aria-expanded'),'false');
  assert.equal(f.elements['sidebar-tool-discover-panel'].hidden,false);
  add.emit('click');
  assert.equal(f.elements['sidebar-tool-discover-panel'].hidden,true);
  assert.equal(f.elements['sidebar-tool-my-panel'].hidden,false);
  assert.equal(f.elements['sidebar-tool-frame'].children.length,0);
});

test('R4.8 discovery search and filter never mutate the actual installed registry',async t=>{
  const tool=await officialToolFixture('quick-notes');
  const store=new Map([[SIDEBAR_TOOL_STORE,[tool]]]);
  const f=await hostFixture(t,{store,startTool:false});
  const root=f.elements['sidebar-tool-official-catalog'];
  assert.equal(f.elements['sidebar-tool-my-panel'].hidden,false);
  assert.equal(f.elements['sidebar-tool-discover-panel'].hidden,true);
  assert.equal(root.children.some(row=>row.dataset.officialToolId===tool.id),false);
  f.elements['sidebar-tool-discover-toggle'].emit('click');
  assert.equal(f.elements['sidebar-tool-my-panel'].hidden,false,'discovery keeps installed rows available');
  assert.equal(f.elements['sidebar-tool-discover-panel'].hidden,false);
  assert.equal(f.elements['sidebar-tool-discover-toggle'].attributes.get('aria-expanded'),'true');
  f.elements['sidebar-tool-filter-all'].emit('click');
  assert.ok(root.children.some(row=>row.dataset.officialToolId===tool.id),'all includes installed state');
  const installedRow=root.children.find(row=>row.dataset.officialToolId===tool.id);
  assert.notEqual(installedRow.children.at(-1).textContent,'安装','all never reinstalls identical package');
  f.elements['sidebar-tool-search'].value='markdown';
  f.elements['sidebar-tool-search'].emit('input');
  assert.deepEqual(root.children.filter(row=>row.dataset.officialToolId).map(row=>row.dataset.officialToolId),
    ['web-markdown-clipper','markdown-workbench','knowledge-inbox']);
  assert.deepEqual(store.get(SIDEBAR_TOOL_STORE),[tool]);
});

test('R4.5 two official review windows share the original installation lock and reject stale approvals',async t=>{
  const originalWindow=globalThis.window,originalConfirm=globalThis.confirm;
  const store=new Map(),locks=sharedLocks(),release=(await officialFixtures()).catalog.apps[0];
  const a=await hostFixture(t,{store,locks,startTool:false}),b=await hostFixture(t,{store,locks,startTool:false});
  t.after(()=>{globalThis.window=originalWindow;globalThis.confirm=originalConfirm;});
  for(const f of [a,b]){
    f.elements['sidebar-tool-discover-toggle'].emit('click');
    f.elements['sidebar-tool-official-catalog'].children.find(row=>row.dataset.officialToolId===release.toolId)
      .children.at(-1).emit('click');
    await settle(()=>!f.elements['sidebar-tool-preview'].hidden);
  }
  a.elements['sidebar-tool-install'].emit('click');b.elements['sidebar-tool-install'].emit('click');
  await settle(()=>a.elements['sidebar-tool-import'].hidden||b.elements['sidebar-tool-import'].hidden);
  await settle(()=>[a,b].some(f=>/发生变化/.test(f.elements['sidebar-tool-file-error'].textContent||'')));
  assert.equal(store.get(SIDEBAR_TOOL_STORE).length,1);
  assert.equal(store.get(MARKET_PROVENANCE_STORE)[release.toolId].version,release.version);
});

test('R4.5 missing official resources and a cancelled in-flight preview never install or overwrite local review',async t=>{
  const gate=deferred(),requested=deferred();let broken=false;
  const f=await hostFixture(t,{store:new Map(),startTool:false,fetcher:async(url)=>{
    if(new URL(url).pathname.endsWith('/reading-toc.opendesk-tool.json')){
      requested.resolve();await gate.promise;
      if(broken)return new Response('missing',{status:404});
    }
    return officialFixtureFetch(url);
  }});
  const official=()=>f.elements['sidebar-tool-official-catalog'].children.find(row=>row.dataset.officialToolId==='reading-toc').children.at(-1);
  official().emit('click');await requested.promise;
  f.elements['sidebar-tool-import-close'].emit('click');gate.resolve();await pause();await pause();
  assert.equal(f.elements['sidebar-tool-preview'].hidden,true);
  assert.equal(f.store.has(SIDEBAR_TOOL_STORE),false);
  broken=true;official().emit('click');
  await settle(()=>f.elements['sidebar-tool-file-error'].hidden===false);
  assert.match(f.elements['sidebar-tool-file-error'].textContent,/E_PACKAGE_MISSING/);
  assert.equal(f.elements['sidebar-tool-install'].disabled,true);
  assert.equal(f.store.has(SIDEBAR_TOOL_STORE),false);
  assert.equal(f.elements['sidebar-tool-frame'].children.length,0);
});

for(const failReadback of [false,true])test('R4.5 lost registry acknowledgement revokes approval without replay; readback failure='+failReadback,async t=>{
  const f=await hostFixture(t,{store:new Map(),startTool:false});
  const release=(await officialFixtures()).catalog.apps[0];
  f.elements['sidebar-tool-official-catalog'].children.find(row=>row.dataset.officialToolId===release.toolId)
    .children.at(-1).emit('click');
  await settle(()=>!f.elements['sidebar-tool-preview'].hidden);
  const set=f.api.storage.local.set,get=f.api.storage.local.get;let registryWrites=0,unreadable=false;
  f.api.storage.local.set=async value=>{
    await set(value);
    if(Object.hasOwn(value,SIDEBAR_TOOL_STORE)&&++registryWrites===1){unreadable=failReadback;throw Error('ack lost after persistent write');}
  };
  f.api.storage.local.get=key=>{
    if(key===SIDEBAR_TOOL_STORE&&unreadable){unreadable=false;return Promise.reject(Error('registry readback unavailable'));}
    return get(key);
  };
  f.elements['sidebar-tool-install'].emit('click');
  await settle(()=>/本次批准已撤销/.test(f.elements['sidebar-tool-file-error'].textContent||''));
  await settle(()=>f.elements['sidebar-tool-list'].children.length===1);
  assert.equal(f.store.get(SIDEBAR_TOOL_STORE).length,1);
  assert.equal(f.elements['sidebar-tool-preview'].hidden,true);assert.equal(f.elements['sidebar-tool-install'].disabled,true);
  assert.equal(f.elements['sidebar-tool-frame'].children.length,0);
  const [operationId,operation]=Object.entries(f.store.get(MARKET_OPERATIONS_STORE))[0];
  assert.equal(operation.state,'outcome-unknown');
  f.elements['sidebar-tool-install'].emit('click');f.elements['sidebar-tool-install'].emit('click');
  await pause();await pause();assert.equal(registryWrites,1);
  assert.equal((await reconcileMarketOperation(f.api,operationId,f.store.get(SIDEBAR_TOOL_STORE)[0])).state,'needs-finalization');
  assert.equal(f.store.get(MARKET_OPERATIONS_STORE)[operationId].state,'outcome-unknown');
  assert.equal(f.store.get(MARKET_PROVENANCE_STORE)?.[release.toolId],undefined);
  assert.equal(registryWrites,1);
  assert.equal((await recoverMarketOperation({api:f.api,lockManager:sharedLocks(),operationId})).state,'succeeded');
  assert.equal(registryWrites,1,'explicit recovery never replays the registry write');


  for(const key of [READING_TOC_SITE_STORE,CLIP_SITE_STORE,CAPTURE_SITE_STORE])assert.equal(f.store.has(key),false);
});

test('R4.5 failure to refresh after a confirmed commit cannot reuse the consumed approval',async t=>{
  const f=await hostFixture(t,{store:new Map(),startTool:false}),release=(await officialFixtures()).catalog.apps[0];
  f.elements['sidebar-tool-official-catalog'].children.find(row=>row.dataset.officialToolId===release.toolId)
    .children.at(-1).emit('click');await settle(()=>!f.elements['sidebar-tool-preview'].hidden);
  const get=f.api.storage.local.get;let failed=false;
  f.api.storage.local.get=async key=>{
    if(key===SIDEBAR_TOOL_STORE&&!failed&&Object.values(f.store.get(MARKET_OPERATIONS_STORE)||{}).some(row=>row.state==='succeeded')){
      failed=true;throw Error('post-commit list read failed');
    }
    return get(key);
  };
  f.elements['sidebar-tool-install'].emit('click');
  await settle(()=>/post-commit list read failed/.test(f.elements['sidebar-tool-status'].textContent||''));
  assert.equal(f.store.get(SIDEBAR_TOOL_STORE).length,1);
  assert.equal(f.elements['sidebar-tool-install'].disabled,true);assert.equal(f.elements['sidebar-tool-preview'].hidden,true);
});

test('R4.5 an official package removed after review is rejected before any installation write',async t=>{
  let removed=false;
  const f=await hostFixture(t,{store:new Map(),startTool:false,fetcher:async url=>
    removed&&new URL(url).pathname.endsWith('.opendesk-tool.json')?new Response('',{status:404}):officialFixtureFetch(url)});
  f.elements['sidebar-tool-official-catalog'].children[0].children.at(-1).emit('click');
  await settle(()=>!f.elements['sidebar-tool-preview'].hidden);removed=true;
  f.elements['sidebar-tool-install'].emit('click');
  await settle(()=>/E_PACKAGE_MISSING/.test(f.elements['sidebar-tool-status'].textContent||''));
  assert.equal(f.store.has(SIDEBAR_TOOL_STORE),false);assert.equal(f.store.has(MARKET_OPERATIONS_STORE),false);
});

test('quota failure is returned with a stable bridge code and preserves the current tool draft',async t=>{
  const key=sidebarToolStorageKey(sample.id),previous={notes:'do not overwrite'};
  const store=new Map([[SIDEBAR_TOOL_STORE,[sample]],[key,previous]]);
  const f=await hostFixture(t,{store,setHook:async rows=>{
    if(Object.hasOwn(rows,key))throw Error('QUOTA_BYTES quota exceeded');
  }});
  f.ask('storage.set',{key:'notes',value:'unsaved edit'},'quota-failure');
  await settle(()=>f.frame.contentWindow.sent.some(row=>row.kind==='response'&&row.requestId==='quota-failure'));
  const reply=f.frame.contentWindow.sent.find(row=>row.requestId==='quota-failure');
  assert.equal(reply.ok,false);assert.equal(reply.error.code,'E_HOST_STORAGE_QUOTA');
  assert.deepEqual(store.get(key),previous);
  assert.equal(f.elements['sidebar-tool-frame'].children.length,1,
    'the failed save must not close a live editor and discard its unsaved input');
});

test('reinstalling identical bytes never restores an old iframe right to write',async t=>{
  const f=await hostFixture(t);
  await recordToolUninstall(f.api,sample);
  const epoch=f.store.get(TOOL_REVOCATION_EPOCHS_STORE)?.[sample.id];
  assert.match(epoch,/^[a-f0-9-]{36}$/);
  f.store.set(SIDEBAR_TOOL_STORE,[]);
  f.store.set(SIDEBAR_TOOL_STORE,[sample]); // exact same bytes, missed onChanged
  f.ask('storage.set',{key:'notes',value:'stale old window'},'stale-reinstall');
  await settle(()=>f.frame.contentWindow.sent.some(row=>row.kind==='response'&&row.requestId==='stale-reinstall'));
  const response=f.frame.contentWindow.sent.find(row=>row.requestId==='stale-reinstall');
  assert.equal(response.ok,false);assert.equal(response.error.code,'E_TOOL_CHANGED');
  assert.equal(f.store.has(sidebarToolStorageKey(sample.id)),false);
  assert.equal(f.elements['sidebar-tool-frame'].children.length,1,
    'rejected stale save leaves the old iframe and unsaved edits available for copying');
});

test('corrupt installed registry stays protected in Side Panel and never masquerades as empty',async t=>{
  const damaged=[sample,{...sample,id:'invalid id'}];
  const store=new Map([[SIDEBAR_TOOL_STORE,damaged]]);
  const f=await hostFixture(t,{store,startTool:false});
  assert.equal(f.elements['sidebar-tool-empty'].hidden,true);
  assert.equal(f.elements['sidebar-tool-list'].children.length,0);
  assert.match(f.elements['sidebar-tool-status'].textContent,/工具列表读取失败/);
  assert.deepEqual(store.get(SIDEBAR_TOOL_STORE),damaged);
});

test('uninstall refuses a newly corrupted registry rather than dropping unrelated rows',async t=>{
  const f=await hostFixture(t,{startTool:false}),damaged=[sample,{...sample,id:'invalid id'}];
  f.store.set(SIDEBAR_TOOL_STORE,damaged); // another context writes unexpected bytes
  const row=f.elements['sidebar-tool-list'].children[0];
  f.host.openTool(sample.id);
  const remove=f.elements['sidebar-tool-remove'];
  assert(remove);
  remove.emit('click');
  await settle(()=>/E_STORAGE_CORRUPT/.test(f.elements['sidebar-tool-status'].textContent||''));
  assert.deepEqual(f.store.get(SIDEBAR_TOOL_STORE),damaged);
  assert.equal(f.store.has(sidebarToolStorageKey(sample.id)),false);
});
