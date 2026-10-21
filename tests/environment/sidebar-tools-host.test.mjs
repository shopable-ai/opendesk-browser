import {SIDEBAR_TOOL_ENABLE_STORE} from '../../src/ui/sidebar-tools/lifecycle.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {createSidebarTools,checkSidebarToolRequestBudget} from '../../src/ui/sidebar-tools.js';
import {requestStayFocusOperation,runTrustedStayFocusOperation} from '../../examples/sidebar-tools/stay-focus/trusted/tool-host.js';
import {createStayFocusPermissionControls} from '../../examples/sidebar-tools/stay-focus/trusted/host-controls.js';
import {FOCUS_ID,FOCUS_CAPABILITY,FOCUS_OPERATIONS} from '../../examples/sidebar-tools/stay-focus/trusted/policy.js';
import {AI_ID,AI_CAPABILITY,AI_OPERATIONS} from '../../examples/sidebar-tools/ai-vip-share/trusted/policy.js';
import {ADBLOCK_ID,ADBLOCK_CAPABILITY,ADBLOCK_OPERATIONS,ADBLOCK_RULE_FIRST,ADBLOCK_STORE,ADBLOCK_DNR_CLEANUP_STORE} from '../../examples/sidebar-tools/adblock/trusted/policy.js';
import {prepareAdblockUninstallCleanup} from '../../examples/sidebar-tools/adblock/trusted/host-controls.js';
import {createCurrentPageTarget} from '../../src/ui/current-page-target.js';
import {initSidebarToolSandbox} from '../../src/sidebar-tools/bridge.js';
import {createBrowserSdk} from '../../src/framework/sdk/browser.js';
import {BROWSER_HOST_PROTOCOL,BROWSER_MENU_GRANTS_STORE} from '../../src/framework/sdk/browser-contract.js';
import {ANALYTICS_PROTOCOL} from '../../src/analytics/contract.js';
import {SIDEBAR_TOOL_FORMAT,SIDEBAR_TOOL_STORE,sidebarToolStorageKey,sidebarToolPackageHash} from '../../src/ui/sidebar-tools/package.js';
import {officialToolFixture,officialFixtureFetch,officialFixtures} from '../helpers/official-tools.mjs';
import {OFFICIAL_READING_TOC_RELEASE} from '../../src/sidebar-tools/official-reading-toc.js';
import {TRUSTED_BOOKMARK_COMPONENT_VERSION} from '../../src/ui/trusted-bookmark-admission.js';
import {MARKET_PROVENANCE_STORE,MARKET_OPERATIONS_STORE,reconcileMarketOperation,recoverMarketOperation,
  TOOL_CLEANUP_STORE,retryUninstalledToolCleanup,getPendingToolCleanups,installReviewedSidebarTool,
  TOOL_REVOCATION_EPOCHS_STORE,recordToolUninstall} from '../../src/ui/sidebar-tools/installation.js';
import {CLIP_SITE_STORE} from '../../examples/sidebar-tools/web-markdown-clipper/trusted/policy.js';
import {installedSiteAllowed,changeInstalledSiteAccess} from '../../src/ui/sidebar-tools/site-grants.js';
import {CAPTURE_SITE_STORE} from '../../src/knowledge/policy.js';
import {READING_TOC_SITE_STORE,READING_TOC_VISIBILITY_STORE,READING_TOC_PAGE_RULES_STORE,READING_TOC_PLACEMENT_PREFIX,changeReadingTocVisibility,changeTocSiteAllowed,tocSiteAllowed} from '../../examples/sidebar-tools/reading-toc/trusted/policy.js';
import {createSidebarToolsView} from '../../src/ui/sidebar-tools-view.js';
import {parseHTML} from 'linkedom';

// Controller tests use ToolHost's state/actions and real runtime elements.
// Only the iframe message transport is stubbed, never the retired product DOM.
function toolRuntimeFixture() {
  const {document:doc}=parseHTML('<html><body><div id="extension-center-list"></div></body></html>');
  const createElement=doc.createElement.bind(doc);
  doc.createElement=tag=>{
    const node=createElement(tag);
    if(tag==='iframe')Object.defineProperty(node,'contentWindow',{value:{sent:[],postMessage(message){this.sent.push(message);}}});
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

test('R26 stopped details remain manageable and enabling waits for an explicit Open',async t=>{
  const key=sidebarToolStorageKey(sample.id),grants={[sample.id]:['https://example.com']};
  const store=new Map([[SIDEBAR_TOOL_STORE,[sample]],[SIDEBAR_TOOL_ENABLE_STORE,{[sample.id]:false}],
    [key,{note:'keep'}],[READING_TOC_SITE_STORE,grants]]);
  const f=await hostFixture(t,{store,startTool:false});
  f.host.openTool(sample.id);
  assert.equal(f.elements['sidebar-tool-display'].hidden,false);assert.equal(f.elements['sidebar-tool-frame'].children.length,0);
  assert.equal(f.elements['sidebar-tool-settings-open'].hidden,false);assert.equal(f.elements['sidebar-tool-visibility'].hidden,true);
  f.emit(f.elements['sidebar-tool-enable'],'click',{isTrusted:true});
  await settle(()=>store.get(SIDEBAR_TOOL_ENABLE_STORE)?.[sample.id]===true&&!f.elements['sidebar-tool-enable'].disabled);
  assert.equal(f.elements['sidebar-tool-frame'].children.length,0,'enable cannot execute code');
  assert.deepEqual(store.get(key),{note:'keep'});assert.deepEqual(store.get(READING_TOC_SITE_STORE),grants);
  f.emit(f.elements['sidebar-tool-launch'],'click');await settle(()=>f.elements['sidebar-tool-frame'].children.length===1);
});

test('same-title installed tools keep distinct iframe identities without granting trust',async t=>{
  const lookalike={...sample,id:'same-title-local'};
  const store=new Map([[SIDEBAR_TOOL_STORE,[sample,lookalike]]]);
  const f=await hostFixture(t,{store,startTool:false});
  for(const tool of [sample,lookalike]){
    f.host.openTool(tool.id);
    const frame=f.runtime.frameRoot.children[0];await frame.onload();
    assert.equal(frame.contentWindow.sent[0].tool.id,tool.id);
    f.host.closeTool();
  }
  assert.equal(store.has(MARKET_PROVENANCE_STORE),false,'a title collision cannot create official provenance');
});

test('R1.6 same-ID Clipper package cannot claim shared navigation or hijack back',async t=>{
 const lookalike={...sample,id:'web-markdown-clipper',title:'用户自定义剪藏'};
 const f=await hostFixture(t,{tool:lookalike,store:new Map([[SIDEBAR_TOOL_STORE,[lookalike]]])});
 assert.equal(f.loaded.navigationAllowed,false,'release digest, not tool ID, admits shared header');
 const before=f.frame.contentWindow.sent.length;
 f.win.emit('message',{origin:'null',source:f.frame.contentWindow,
   data:{protocol:f.loaded.protocol,toolId:lookalike.id,instance:f.loaded.instance,
     kind:'navigation-state',page:'reader'}});
 assert.equal(f.elements['sidebar-tool-title'].textContent,lookalike.title,'forged business title is ignored');
 f.emit(f.elements['sidebar-tool-back'],'click');
 assert.equal(f.frame.contentWindow.sent.length,before,'unreviewed tool receives no trusted back action');
 assert.equal(f.runtime.frameRoot.children.length,0,'back returns to the extension list');
});
test('R1.6 generic tool settings has a single titled return without remounting',async t=>{
 const f=await hostFixture(t),original=f.frame;
 assert.equal(f.elements['sidebar-tool-back'].title,'返回扩展列表');
 f.emit(f.elements['sidebar-tool-settings-open'],'click');
 assert.equal(f.elements['sidebar-tool-title'].textContent,'工具设置');
 assert.equal(f.elements['sidebar-tool-back'].title,'返回上一页');
 assert.equal(f.runtime.frameRoot.children[0],original,'settings retains the same tool instance');
 f.emit(f.elements['sidebar-tool-back'],'click');
 assert.equal(f.elements['sidebar-tool-title'].textContent,sample.title);
 assert.equal(f.elements['sidebar-tool-back'].title,'返回扩展列表');
 assert.equal(f.runtime.frameRoot.children[0],original,'returning from settings does not recreate iframe');
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
  f.emit(f.elements['sidebar-tool-retired-draft-dismiss'],'click');
  assert.equal(f.elements['sidebar-tool-retired-draft'].hidden,true);
});

test('R26 eye restores intersecting site/page appearance without mutating grants',async t=>{
  const toc=await officialToolFixture('reading-toc'),url='https://article.example/answer';
  const prefs=changeReadingTocVisibility(changeReadingTocVisibility({},toc.id,url,'site',true),toc.id,url,'page',true);
  const grants={[toc.id]:['https://article.example']},store=new Map([[SIDEBAR_TOOL_STORE,[toc]],
    [READING_TOC_SITE_STORE,grants],[READING_TOC_VISIBILITY_STORE,prefs]]);
  const target={snapshot:{status:'available',url},capture(){return {url,origin:'https://article.example',tabId:5,documentId:'doc'};},async revalidate(){return true;}};
  const f=await hostFixture(t,{target,store,tool:toc}),eye=f.elements['sidebar-tool-visibility'];
  assert.equal(eye.hidden,false);assert.equal(eye.disabled,false);f.emit(eye,'click');
  await settle(()=>!store.get(READING_TOC_VISIBILITY_STORE)?.[toc.id]);
  assert.deepEqual(store.get(READING_TOC_SITE_STORE),grants);assert.equal(store.has(SIDEBAR_TOOL_ENABLE_STORE),false);
  f.emit(eye,'click');await settle(()=>Boolean(store.get(READING_TOC_VISIBILITY_STORE)?.[toc.id]?.hiddenSites.length));
  assert.deepEqual(store.get(READING_TOC_SITE_STORE),grants);
});

test('stopped website disables the eye while restore settings remain available',async t=>{
  const toc=await officialToolFixture('reading-toc'),target={snapshot:{status:'available',url:'https://example.com/a'}};
  const f=await hostFixture(t,{tool:toc,target,store:new Map([[SIDEBAR_TOOL_STORE,[toc]],
    [READING_TOC_SITE_STORE,changeTocSiteAllowed({},toc.id,target.snapshot.url,false)]])});
  assert.equal(f.elements['sidebar-tool-visibility'].disabled,true);assert.match(f.elements['sidebar-tool-visibility'].title,/停用/);
  f.emit(f.elements['sidebar-tool-settings-open'],'click');assert.equal(f.elements['sidebar-tool-settings-view'].hidden,false);
});

test('built-in host reads default sites and blocks stopped sites before sending page messages',async t=>{
  const toc=await officialToolFixture('reading-toc'),url='https://new-site.example/article';
  const target={snapshot:{status:'available',url},
    capture:()=>({url,origin:'https://new-site.example',tabId:7,documentId:'doc-default'}),
    async revalidate(){return true;}};
  // A default all-sites grant exists only for the byte-pinned official installation.
  // The previous test fixture omitted provenance and correctly failed closed.
  const pin=OFFICIAL_READING_TOC_RELEASE;
  assert.equal(toc.version,pin.version);
  const f=await hostFixture(t,{tool:toc,target,store:new Map([
    [SIDEBAR_TOOL_STORE,[toc]],
    [MARKET_PROVENANCE_STORE,{[toc.id]:{marketId:pin.marketId,version:pin.version,sha256:pin.sha256}}]
  ])});
  let reads=0;
  f.api.tabs={async sendMessage(tabId,message,options){
    reads++;assert.equal(tabId,7);assert.equal(message.expectedUrl,url);
    assert.deepEqual(options,{frameId:0,documentId:'doc-default'});
    return {ok:true,data:{items:[],sources:[],activeId:''}};
  }};
  f.ask('toc.snapshot');await settle(()=>f.frame.contentWindow.sent.some(row=>row.kind==='response'));
  const firstReply=f.frame.contentWindow.sent.at(-1);
  assert.equal(firstReply.ok,true,JSON.stringify(firstReply.error||firstReply));
  assert.equal(reads,1);
  f.store.set(READING_TOC_SITE_STORE,changeTocSiteAllowed({},toc.id,url,false));
  f.ask('toc.navigate',{id:'h-1',sourceId:'s-1'},'2');await settle(()=>f.frame.contentWindow.sent.some(row=>row.requestId==='2'));
  assert.equal(f.frame.contentWindow.sent.at(-1).ok,false);assert.equal(reads,1);
  assert.match(f.frame.contentWindow.sent.at(-1).error.message,/停用/);
  // Site restored, but lost/forged official provenance must still fail closed.
  f.store.delete(READING_TOC_SITE_STORE);
  f.store.delete(MARKET_PROVENANCE_STORE);
  f.ask('toc.snapshot',{},'3');
  await settle(()=>f.frame.contentWindow.sent.some(row=>row.requestId==='3'));
  assert.equal(f.frame.contentWindow.sent.at(-1).ok,false);
  assert.match(f.frame.contentWindow.sent.at(-1).error.message,/身份/);
  assert.equal(reads,1,'no page read after official provenance is removed');
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

test('trusted tool host installs only by explicit click, scopes messages and removes storage',async()=>{
  const oldWindow=globalThis.window,oldConfirm=globalThis.confirm;
  const win=new Node('window');globalThis.window=win;globalThis.confirm=()=>true;
  const {doc,view,elements,emit,selectFile}=toolRuntimeFixture();
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
    host=createSidebarTools({api,doc,view,currentPageTarget:target,taskWorkbench:workbench,
      lockManager:{request:(_name,work)=>Promise.resolve().then(work)}});
    await host.ready;host.setVisible(true);
    assert.equal(store.has(SIDEBAR_TOOL_STORE),false,'loading a tool list must not install anything');
    assert.equal(elements['sidebar-tool-preview'].hidden,true,'install preview is initially hidden');
    emit(elements['sidebar-tool-import-trigger'],'click');
    assert.equal(elements['sidebar-tool-import'].hidden,false,'import opens at full panel width');
    const file={size:JSON.stringify(sample).length,text:async()=>JSON.stringify(sample)};
    selectFile(file);
    await settle(()=>!elements['sidebar-tool-preview'].hidden);
    assert.equal(store.has(SIDEBAR_TOOL_STORE),false,'choosing JSON alone cannot install');
    assert.equal(elements['sidebar-tool-preview'].hidden,false,'review is shown after validation');
    assert.equal(elements['sidebar-tool-preview-title'].textContent,sample.title);
    assert.match(elements['sidebar-tool-preview-capabilities'].textContent,/读取当前网页/);
    assert.equal(elements['sidebar-tool-install'].disabled,false);
    emit(elements['sidebar-tool-install'],'click');
    await pause();await pause();
    assert.equal(store.get(SIDEBAR_TOOL_STORE).length,1);
    assert.equal(elements['sidebar-tool-import'].hidden,true,'successful install closes the import form');
    assert.equal(elements['sidebar-tool-display'].hidden,true,'install must not start untrusted code');
    assert.equal(elements['sidebar-tool-frame'].children.length,0,'install never mounts a sandbox');
    host.openTool(sample.id);
    assert.equal(elements['sidebar-tool-frame'].children.length,1,'only an explicit Open mounts the sandbox');
    emit(elements['sidebar-tool-back'],'click');
    assert.equal(elements['sidebar-tool-frame'].children.length,0,'Back revokes iframe');
    emit(elements['sidebar-tool-import-trigger'],'click');
    selectFile({name:'invalid.json',size:10,text:async()=>'{invalid'});
    await pause();await pause();
    assert.equal(elements['sidebar-tool-preview'].hidden,true,'invalid input never presents an approval button');
    assert.equal(elements['sidebar-tool-install'].disabled,true,'invalid input cannot install');
    assert.equal(elements['sidebar-tool-file-error'].textContent,'文件不是有效的扩展安装包 JSON','invalid JSON error stays beside the file');
    assert.equal(elements['sidebar-tool-file-error'].hidden,false);
    emit(elements['sidebar-tool-import-close'],'click');
    assert.equal(elements['sidebar-tool-import'].hidden,true,'Cancel collapses the import form');
    host.openTool(sample.id);
    const frame=elements['sidebar-tool-frame'].children[0];
    assert.equal(frame.localName,'iframe');
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
    emit(elements['sidebar-tool-remove'],'click');
    emit(elements['sidebar-tool-inline-remove-confirm'],'click');
    await pause();await pause();
    assert.equal(store.has(sidebarToolStorageKey(sample.id)),false);
    assert.equal(store.get(SIDEBAR_TOOL_STORE).length,0);
  }finally{host?.dispose();view.dispose();globalThis.window=oldWindow;globalThis.confirm=oldConfirm;}
});

const deferred=()=>{let resolve,reject;const promise=new Promise((r,j)=>{resolve=r;reject=j;});return {promise,resolve,reject};};

test('Final R2 cancellation preserves a dirty iframe and pending saves block navigation',async t=>{
  const f=await hostFixture(t);
  const state=(dirty,busy)=>f.win.emit('message',{origin:'null',source:f.frame.contentWindow,
    data:{protocol:f.loaded.protocol,toolId:sample.id,instance:f.loaded.instance,kind:'edit-state',dirty,busy}});
  state(true,false);globalThis.confirm=()=>{throw Error('modal must not run');};
  assert.equal(f.host.setVisible(false),false);
  assert.equal(f.elements['sidebar-tool-action-review'].hidden,false);
  f.emit(f.elements['sidebar-tool-action-cancel'],'click');
  f.emit(f.elements['sidebar-tool-back'],'click');
  assert.equal(f.elements['sidebar-tool-frame'].children[0],f.frame);
  state(true,true);
  assert.equal(f.host.setVisible(false),false);
  assert.equal(f.elements['sidebar-tool-frame'].children[0],f.frame);
  let prevented=false;
  const unloading={preventDefault(){prevented=true;}};
  f.win.emit('beforeunload',unloading);assert.equal(prevented,false);assert.equal(unloading.returnValue,undefined);
  state(false,false);assert.notEqual(f.host.setVisible(false),false);
  assert.equal(f.elements['sidebar-tool-frame'].children.length,0);
});

test('actual sandbox state object clears host dirty state only after busy work ends',async t=>{
  const f=await hostFixture(t),sandboxWindow=new Node('window'),root=new Node(),status=new Node(),sent=[];
  const parent={postMessage(data){sent.push(data);f.win.emit('message',{
    origin:'null',source:f.frame.contentWindow,data});}};
  runInNewContext(`(${initSidebarToolSandbox.toString()})()`,{
    SIDEBAR_TOOL_PROTOCOL:f.loaded.protocol,createBrowserSdk,window:sandboxWindow,parent,
    document:{getElementById:id=>id==='tool-root'?root:status,documentElement:new Node('html'),
      head:new Node(),body:new Node(),createElement:tag=>new Node(tag)},
    Blob,URL:{createObjectURL:()=> 'blob:component-contract',revokeObjectURL(){}},
    setTimeout,clearTimeout,requestAnimationFrame:()=>0
  });
  sandboxWindow.emit('message',{source:parent,data:f.loaded});
  assert.equal(sandboxWindow.confirm('unexpected modal'),false);
  assert.equal(sandboxWindow.prompt('unexpected input'),null);
  assert.equal(sandboxWindow.open('https://example.org/'),null);
  assert.equal(sandboxWindow.alert('unexpected alert'),undefined);
  assert.equal(sandboxWindow.print(),undefined);
  assert.ok(sent.some(row=>row.kind==='status'&&/弹窗已被阻止/.test(row.message)));
  assert.equal(typeof sandboxWindow.OpenDeskSDK.browser.capabilities.getStatus,'function');
  const state=sandboxWindow.OpenDeskTool.setState;
  globalThis.confirm=()=>{throw Error('modal must not run');};
  root.emit('input',{isTrusted:true});
  state(false,false); // The former knowledge call sends no valid state object.
  assert.equal(sent.filter(row=>row.kind==='edit-state').length,0);
  assert.equal(f.host.closeTool(),false);
  assert.equal(f.elements['sidebar-tool-action-review'].hidden,false);
  f.emit(f.elements['sidebar-tool-action-cancel'],'click');
  state({dirty:false,busy:true});
  assert.equal(f.host.closeTool(),false,'busy cannot permit navigation');
  state({dirty:false,busy:false});
  assert.equal(f.host.closeTool(),true,'saved state needs no modal');
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
async function hostFixture(t,{store=new Map([[SIDEBAR_TOOL_STORE,[sample]]]),locks=sharedLocks(),getHook,setHook,startTool=true,tool=sample,snapshotBeforeGet=false,target,awaitReady=true,fetcher=officialFixtureFetch,trustedBookmarkPilot=null}={}){
  const oldWindow=globalThis.window,oldConfirm=globalThis.confirm;
  const win=new Node('window');globalThis.window=win;globalThis.confirm=()=>true;
  const {doc,view,runtime,elements,emit,selectFile}=toolRuntimeFixture();
  let focused=0;
  const changed=new Node();
  const api={runtime:{getURL:p=>'chrome-extension://test/'+p},storage:{session:{async get(){return {};},async remove(){}},onChanged:{
    addListener:fn=>changed.addEventListener('change',fn),removeListener:fn=>changed.removeEventListener('change',fn)
  },local:{
    async get(key){const snapshot=snapshotBeforeGet?structuredClone(store.get(key)):undefined;
      await getHook?.(key);
      if(Array.isArray(key))return Object.fromEntries(key.map(name=>[name,structuredClone(store.get(name))]));
      return {[key]:snapshotBeforeGet?snapshot:structuredClone(store.get(key))};},
    async set(value){await setHook?.(value);for(const [key,row] of Object.entries(value))store.set(key,structuredClone(row));},
    async remove(key){store.delete(key);}
  }}};
  const host=createSidebarTools({api,doc,view,currentPageTarget:target,lockManager:locks,fetcher,trustedBookmarkPilot,taskWorkbench:{focusInstalledTask(){focused++;return true;}}});
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
  f.emit(f.elements['sidebar-tool-remove'],'click');
  f.emit(f.elements['sidebar-tool-inline-remove-confirm'],'click');await pause();
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
  assert.equal(f.elements['sidebar-tool-display'].hidden,true);
  assert.equal(f.elements['sidebar-tool-display'].hidden,true);
  f.host.openTool(second.id);
  assert.equal(f.elements['sidebar-tool-display'].hidden,false);
  assert.equal(f.elements['sidebar-tool-frame'].children.length,1,'only one sandbox may be active');
  assert.match(f.elements['sidebar-tool-title'].textContent,/第二个工具/);
  f.host.setVisible(false);
  assert.equal(f.elements['sidebar-tool-frame'].children.length,0,'leaving Tools revokes the session');
  f.host.setVisible(true);
  assert.equal(f.elements['sidebar-tool-frame'].children.length,0,'returning to Tools must not restart the mini-app');
  assert.equal(f.elements['sidebar-tool-display'].hidden,true);
  f.host.openTool(second.id);
  assert.match(f.elements['sidebar-tool-title'].textContent,/第二个工具/,'explicit Open starts chosen mini-app');
  f.host.closeTool();
  f.host.setVisible(false);f.host.setVisible(true);
  assert.equal(f.elements['sidebar-tool-frame'].children.length,0,'explicit Back remains on the list');
  assert.equal(f.elements['sidebar-tool-display'].hidden,true);
});


test('R14 import refuses oversized packages, ignores stale asynchronous reads and preserves filename',async t=>{
  const f=await hostFixture(t);
  f.host.closeTool();
  f.emit(f.elements['sidebar-tool-import-trigger'],'click');
  const input=f.elements['sidebar-tool-file'];
  input.value='C:\\fakepath\\too-big.json';
  f.selectFile({name:'too-big.json',size:320001,text:async()=>JSON.stringify(sample)});await pause();
  assert.match(f.elements['sidebar-tool-file-error'].textContent,/超过 320 KB/);
  assert.equal(input.value,'C:\\fakepath\\too-big.json','selected filename must remain in native picker');
  assert.equal(f.elements['sidebar-tool-install'].disabled,true);
  const gate=deferred();
  f.selectFile({name:'first.json',size:10,text:()=>gate.promise});
  f.selectFile({name:'second.json',size:JSON.stringify(sample).length,text:async()=>JSON.stringify(sample)});await settle(()=>!f.elements['sidebar-tool-preview'].hidden);
  gate.resolve('{invalid');await pause();await pause();
  assert.equal(f.elements['sidebar-tool-preview'].hidden,false,'old invalid parse cannot replace new approval');
  assert.equal(f.elements['sidebar-tool-file-error'].hidden,true);
  assert.match(f.elements['sidebar-tool-preview-file'].textContent,/^文件：second\.json · 候选包 SHA-256（规范序列化）：[a-f0-9]{64}/);
});

test('R5.3 local review identifies normalized candidate/current hashes and cancel preserves installation',async t=>{
  const f=await hostFixture(t,{startTool:false}),candidate={...sample,version:'1.0.1'};
  const before=structuredClone(f.store.get(SIDEBAR_TOOL_STORE));
  f.emit(f.elements['sidebar-tool-import-trigger'],'click');
  const text=JSON.stringify(candidate,null,4)+'\n';
  f.selectFile({name:'hash-review.json',size:text.length,text:async()=>text});await settle(()=>!f.elements['sidebar-tool-preview'].hidden);
  const label=f.elements['sidebar-tool-preview-file'].textContent;
  assert.ok(label.includes('候选包 SHA-256（规范序列化）：'+await sidebarToolPackageHash(candidate)));
  assert.ok(label.includes('当前包 SHA-256（规范序列化）：'+await sidebarToolPackageHash(sample)));
  assert.match(label,/包 Hash 已规范化，文件空白或键顺序不影响此值/);
  f.emit(f.elements['sidebar-tool-import-close'],'click');
  assert.equal(f.elements['sidebar-tool-preview'].hidden,true);
  assert.deepEqual(f.store.get(SIDEBAR_TOOL_STORE),before);
});

test('R5.3 cancelled or superseded hash calculation cannot revive an old review',async t=>{
  const f=await hostFixture(t,{store:new Map(),startTool:false});
  const original=crypto.subtle.digest.bind(crypto.subtle),gate=deferred(),started=deferred();
  t.mock.method(crypto.subtle,'digest',async(algorithm,bytes)=>{
    if(new TextDecoder().decode(bytes).includes('hash-slow')){started.resolve();await gate.promise;}
    return original(algorithm,bytes);
  });
  const select=candidate=>{
    const text=JSON.stringify(candidate);
    f.selectFile({name:candidate.title+'.json',size:text.length,text:async()=>text});
  };
  f.emit(f.elements['sidebar-tool-import-trigger'],'click');
  select({...sample,title:'hash-slow'});await started.promise;
  f.emit(f.elements['sidebar-tool-import-close'],'click');
  f.emit(f.elements['sidebar-tool-import-trigger'],'click');select({...sample,title:'hash-current'});
  await settle(()=>!f.elements['sidebar-tool-preview'].hidden);
  gate.resolve();await pause();await pause();
  assert.equal(f.elements['sidebar-tool-preview-title'].textContent,'hash-current');
  assert.doesNotMatch(f.elements['sidebar-tool-preview-file'].textContent,/当前包 SHA-256/);
  assert.equal(f.store.has(SIDEBAR_TOOL_STORE),false);
});

test('R14 preview compares permissions and downgrade, confirmation protects update and retains data',async t=>{
  const older={...sample,version:'3.0.0',capabilities:['storage.local']};
  const store=new Map([[SIDEBAR_TOOL_STORE,[older]],[sidebarToolStorageKey(sample.id),{memo:'kept'}]]);
  const f=await hostFixture(t,{store});
  f.host.closeTool();
  f.emit(f.elements['sidebar-tool-import-trigger'],'click');
  const file=JSON.stringify({...sample,version:'2.0.0'});
  f.selectFile({name:'update.opendesk-tool.json',size:file.length,text:async()=>file});
  // Hash/preview generation can span more than two turns under concurrent
  // React/Vite builds. Wait for the actual reviewed candidate, not timing.
  await settle(()=>!f.elements['sidebar-tool-update'].hidden);
  assert.equal(f.elements['sidebar-tool-update'].hidden,false);
  assert.match(f.elements['sidebar-tool-update-versions'].textContent,/3\.0\.0.*2\.0\.0/);
  assert.match(f.elements['sidebar-tool-update-capabilities'].textContent,/新增能力：.*读取当前网页/);
  assert.match(f.elements['sidebar-tool-update-warning'].textContent,/版本回退/);
  let prompted=0;globalThis.confirm=()=>{prompted++;return false;};
  f.emit(f.elements['sidebar-tool-install'],'click');await pause();await pause();await pause();
  assert.equal(prompted,0,'reviewed update must not open a JS modal');
  assert.equal(store.get(SIDEBAR_TOOL_STORE)[0].version,'2.0.0');
  assert.deepEqual(store.get(sidebarToolStorageKey(sample.id)),{memo:'kept'});
  assert.equal(f.elements['sidebar-tool-frame'].children.length,0,'update cannot auto execute');
});

test('R26 stopped detail uninstall requires consent without running tool code',async t=>{
  const key=sidebarToolStorageKey(sample.id);
  const store=new Map([[SIDEBAR_TOOL_STORE,[sample]],[SIDEBAR_TOOL_ENABLE_STORE,{[sample.id]:false}],[key,{note:'private'}]]);
  const f=await hostFixture(t,{store,startTool:false});
  f.host.openTool(sample.id);
  const deleteButton=f.elements['sidebar-tool-remove'];
  assert.match(deleteButton.attributes['aria-label'],/卸载.*网页笔记/);
  assert.equal(f.elements['sidebar-tool-frame'].children.length,0);
  let confirmations=0;
  globalThis.confirm=()=>{confirmations++;return false;};
  f.emit(deleteButton,'click');await pause();await pause();
  assert.equal(confirmations,0,'no JS confirm');
  assert.equal(f.elements['sidebar-tool-inline-remove'].hidden,false);
  assert.deepEqual(store.get(key),{note:'private'});
  f.emit(f.elements['sidebar-tool-inline-remove-cancel'],'click');
  assert.equal(f.elements['sidebar-tool-inline-remove'].hidden,true);
  assert.equal(store.get(SIDEBAR_TOOL_STORE).length,1);
  f.emit(deleteButton,'click');
  f.emit(f.elements['sidebar-tool-inline-remove-confirm'],'click');await pause();await pause();await pause();
  assert.equal(store.get(SIDEBAR_TOOL_STORE).length,0,'explicit list uninstall removes the package');
  assert.equal(store.has(key),false,'list uninstall removes its namespaced data');
  assert.equal(f.elements['sidebar-tool-frame'].children.length,0,'deletion cannot execute the tool');
});

test('R14 cross-window tool update invalidates review and clears the stale file selection',async t=>{
  const f=await hostFixture(t,{startTool:false});
  f.emit(f.elements['sidebar-tool-import-trigger'],'click');
  const input=f.elements['sidebar-tool-file'];
  const update={...sample,version:'1.1.0'};
  input.value='C:\\fakepath\\update.opendesk-tool.json';
  f.selectFile({name:'update.opendesk-tool.json',size:JSON.stringify(update).length,text:async()=>JSON.stringify(update)});
  // File hashing and package validation are async. Establish a completed,
  // actionable review before testing that a cross-window update invalidates it.
  // Do not relax the post-change identity, disabled-button or reset checks.
  await settle(()=>!f.elements['sidebar-tool-preview'].hidden&&
    !f.elements['sidebar-tool-install'].disabled);
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
  f.host.openTool(next.id);
  assert.equal(f.runtime.frameRoot.children.length,1);
  f.host.closeTool();
  gate.resolve();await pause();await pause();
  f.host.openTool(next.id);
  assert.equal(f.runtime.frameRoot.children.length,1,'an older async read must not roll the controller catalog back');
});

test('R4.5 fresh reinstall preserves orphaned private data and requires explicit cleanup',async t=>{
  const key=sidebarToolStorageKey(sample.id);
  const store=new Map([[SIDEBAR_TOOL_STORE,[]],[key,{privateNote:'left by interrupted uninstall'}]]);
  const f=await hostFixture(t,{store,startTool:false});
  f.emit(f.elements['sidebar-tool-import-trigger'],'click');
  const text=JSON.stringify(sample);
  f.selectFile({name:'quick-notes.json',size:text.length,text:async()=>text});
  await settle(()=>!f.elements['sidebar-tool-preview'].hidden&&!f.elements['sidebar-tool-install'].disabled);
  f.emit(f.elements['sidebar-tool-install'],'click');
  await settle(()=>/未关联卸载确认/.test(f.elements['sidebar-tool-status'].textContent||''));
  assert.deepEqual(store.get(key),{privateNote:'left by interrupted uninstall'},'a blocked installation must preserve existing notes');
  assert.deepEqual(store.get(SIDEBAR_TOOL_STORE),[],'orphan data requires explicit cleanup before admission');
  assert.equal(f.elements['sidebar-tool-frame'].children.length,0,'install must not start code');
  assert.equal(f.elements['sidebar-tool-status'].attributes['data-state'],'error');
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
  assert.equal(f.view.fields['sidebar-tool-status'].attributes['data-state'],'info');
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

test('uninstalled trusted AdBlock can recover cleanup after required permission becomes available without reinstalling',async t=>{
  const previous=globalThis.__opendeskAdblockTrustedUI;
  globalThis.__opendeskAdblockTrustedUI=Object.freeze({id:ADBLOCK_ID,prepareUninstallCleanup:prepareAdblockUninstallCleanup});
  t.after(()=>{if(previous===undefined)delete globalThis.__opendeskAdblockTrustedUI;
    else globalThis.__opendeskAdblockTrustedUI=previous;});
  const store=new Map([[SIDEBAR_TOOL_STORE,[]],[ADBLOCK_DNR_CLEANUP_STORE,true],
    [ADBLOCK_STORE,{enabled:false}],[TOOL_CLEANUP_STORE,{[ADBLOCK_ID]:{version:'1.1.1',createdAt:1}}]]);
  const f=await hostFixture(t,{store,startTool:false});
  let granted=false,requests=0;
  let rules=[{id:ADBLOCK_RULE_FIRST,priority:1,action:{type:'block'},condition:{urlFilter:'ads.test'}},
    {id:1,priority:28,action:{type:'block'},condition:{urlFilter:'other.test'}}];
  f.api.storage.session={get:async key=>({[key]:{version:1,ready:true}}),set:async()=>{}};
  f.api.permissions={contains:async()=>granted,request:()=>{
    requests++;throw Error('required DNR has no optional grant');
  }};
  f.api.declarativeNetRequest={getDynamicRules:async()=>structuredClone(rules),
    updateDynamicRules:async({removeRuleIds,addRules})=>{
      assert.deepEqual(addRules,[],'recovery never installs filtering');
      rules=rules.filter(rule=>!removeRuleIds.includes(rule.id));
    }};
  await f.host.retryUninstallCleanup(ADBLOCK_ID,{isTrusted:false});assert.equal(requests,0);
  await assert.rejects(f.host.retryUninstallCleanup(ADBLOCK_ID,{isTrusted:true}),{code:'E_ADBLOCK_PERMISSION'});
  assert.ok(store.get(TOOL_CLEANUP_STORE)[ADBLOCK_ID]);assert.equal(store.get(ADBLOCK_DNR_CLEANUP_STORE),true);
  assert.notEqual(f.elements['sidebar-tool-action-review'].hidden,false,'no nonexistent optional permission review');
  granted=true;
  assert.equal((await f.host.retryUninstallCleanup(ADBLOCK_ID,{isTrusted:true})).state,'cleaned');
  assert.deepEqual(rules.map(rule=>rule.id),[1]);assert.equal(requests,0);
  assert.equal(store.has(ADBLOCK_DNR_CLEANUP_STORE),false);assert.equal(store.has(ADBLOCK_STORE),false);
  assert.equal(store.get(TOOL_CLEANUP_STORE)?.[ADBLOCK_ID],undefined);
  assert.deepEqual(store.get(SIDEBAR_TOOL_STORE),[],'cleanup never restores installation authority');
});
test('R4.5 orphaned private data blocks reinstall until the acknowledged uninstall cleanup completes',async t=>{
  const key=sidebarToolStorageKey(sample.id),privateData={privateNote:'left by interrupted uninstall'};
  const store=new Map([[SIDEBAR_TOOL_STORE,[]],[key,privateData],
    [TOOL_CLEANUP_STORE,{[sample.id]:{version:sample.version,createdAt:1}}]]);
  const f=await hostFixture(t,{store,startTool:false});
  async function reviewAndConfirm(){
    f.emit(f.elements['sidebar-tool-import-trigger'],'click');
    const text=JSON.stringify(sample);
    f.selectFile({name:'quick-notes.json',size:text.length,text:async()=>text});
    await settle(()=>!f.elements['sidebar-tool-install'].disabled);
    f.emit(f.elements['sidebar-tool-install'],'click');
  }
  await reviewAndConfirm();
  await settle(()=>/上次卸载仍有未完成/.test(f.elements['sidebar-tool-status'].textContent||''));
  assert.deepEqual(store.get(key),privateData,'failed admission preserves the previous owner data');
  assert.deepEqual(store.get(SIDEBAR_TOOL_STORE),[]);
  assert.equal(f.elements['sidebar-tool-frame'].children.length,0,'refused install must not start code');
  assert.equal((await retryUninstalledToolCleanup({api:f.api,lockManager:sharedLocks(),id:sample.id})).state,'cleaned');
  assert.equal(store.has(key),false,'only the acknowledged uninstall cleanup removes old data');
  assert.deepEqual(store.get(SIDEBAR_TOOL_STORE),[],'cleanup itself does not install anything');
  await reviewAndConfirm();
  await settle(()=>store.get(SIDEBAR_TOOL_STORE)?.length===1);
  assert.equal(store.get(SIDEBAR_TOOL_STORE)[0].id,sample.id);
  assert.equal(f.elements['sidebar-tool-frame'].children.length,0,'install must not start code');
  assert.ok(f.view.takeEffects().some(effect=>effect.key==='sidebar-tool-import-trigger'&&effect.method==='focus'));
});

test('R5.0 incomplete cleanup record blocks a new tool even when no orphan payload remains',async t=>{
  const pending={[sample.id]:{version:sample.version,createdAt:1}};
  const store=new Map([[SIDEBAR_TOOL_STORE,[]],[TOOL_CLEANUP_STORE,pending]]);
  const f=await hostFixture(t,{store,startTool:false});
  f.emit(f.elements['sidebar-tool-import-trigger'],'click');
  const text=JSON.stringify(sample);
  f.selectFile({name:'quick-notes.json',size:text.length,text:async()=>text});
  await settle(()=>!f.elements['sidebar-tool-install'].disabled);
  f.emit(f.elements['sidebar-tool-install'],'click');
  await settle(()=>/上次卸载仍有未完成/.test(f.elements['sidebar-tool-status'].textContent||''));
  assert.deepEqual(store.get(SIDEBAR_TOOL_STORE),[]);
  assert.deepEqual(store.get(TOOL_CLEANUP_STORE),pending,'recovery marker must remain');
  assert.equal(f.elements['sidebar-tool-frame'].children.length,0);
});

test('R5.1 malformed pending cleanup cannot revoke a still-installed tool before failed uninstall',async t=>{
  const epochs={[sample.id]:'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'};
  const malformed={[sample.id]:{version:'unrecoverable'}};
  const store=new Map([[SIDEBAR_TOOL_STORE,[sample]],
    [TOOL_REVOCATION_EPOCHS_STORE,epochs],[TOOL_CLEANUP_STORE,malformed]]);
  const f=await hostFixture(t,{store,startTool:false});
  await assert.rejects(recordToolUninstall(f.api,sample),{code:'E_STORAGE_CORRUPT'});
  assert.deepEqual(store.get(TOOL_REVOCATION_EPOCHS_STORE),epochs,
    'preflight rejection must not revoke the still-installed instance');
  assert.deepEqual(store.get(SIDEBAR_TOOL_STORE),[sample]);
  assert.deepEqual(store.get(TOOL_CLEANUP_STORE),malformed);
});

test('R5.1 uninstall refuses corrupt revocation authority before writing cleanup intent',async t=>{
  const epochs={'other-tool':123},key=sidebarToolStorageKey(sample.id);
  const privateData={memo:'must be preserved'};
  const store=new Map([[SIDEBAR_TOOL_STORE,[sample]],[TOOL_REVOCATION_EPOCHS_STORE,epochs],
    [key,privateData]]);
  const f=await hostFixture(t,{store,startTool:false});
  await assert.rejects(recordToolUninstall(f.api,sample),{code:'E_STORAGE_CORRUPT'});
  assert.deepEqual(store.get(TOOL_REVOCATION_EPOCHS_STORE),epochs,
    'corrupt revocation state must not be spread into another owner record');
  assert.equal(store.has(TOOL_CLEANUP_STORE),false,'a failed intent must not claim registry removal');
  assert.deepEqual(store.get(SIDEBAR_TOOL_STORE),[sample]);
  assert.deepEqual(store.get(key),privateData);
});

test('R5.1 silent TOC placement removal must keep cleanup recovery pending',async t=>{
  const placementKey=READING_TOC_PLACEMENT_PREFIX+'test-page';
  const pending={'reading-toc':{version:'2.0.0',createdAt:1}},saved={position:'left'};
  const store=new Map([[SIDEBAR_TOOL_STORE,[]],[TOOL_CLEANUP_STORE,pending],
    [placementKey,saved],['unrelated-stored-data',{preserve:true}]]);
  const f=await hostFixture(t,{store,startTool:false});
  const get=f.api.storage.local.get.bind(f.api.storage.local);
  const remove=f.api.storage.local.remove.bind(f.api.storage.local);
  f.api.storage.local.get=async key=>key===null?Object.fromEntries(store.entries()):get(key);
  // Chrome may resolve a storage.remove Promise without actually deleting the key.
  f.api.storage.local.remove=async key=>{if(key!==placementKey)await remove(key);};
  await assert.rejects(retryUninstalledToolCleanup({api:f.api,lockManager:sharedLocks(),id:'reading-toc'}),
    {code:'E_TOOL_UNINSTALL_CLEANUP'});
  assert.deepEqual(store.get(TOOL_CLEANUP_STORE),pending,'unverified deletion cannot finalize uninstall');
  assert.deepEqual(store.get(placementKey),saved,'unconfirmed removal remains visible for recovery');
  assert.deepEqual(store.get('unrelated-stored-data'),{preserve:true});
  f.api.storage.local.remove=remove;
  const recovered=await retryUninstalledToolCleanup({api:f.api,lockManager:sharedLocks(),id:'reading-toc'});
  assert.equal(recovered.state,'cleaned');
  assert.equal(store.has(placementKey),false);
  assert.deepEqual(store.get(TOOL_CLEANUP_STORE),{});
  assert.deepEqual(store.get(SIDEBAR_TOOL_STORE),[],'recovery cannot reinstall tools');
});

test('R5.1 corrupted uninstall cleanup cannot be treated as absent or bypassed by reinstall',async t=>{
  const key=sidebarToolStorageKey(sample.id),privateData={memo:'other owner data must survive'};
  const malformed={[sample.id]:{version:'broken',createdAt:1}};
  const store=new Map([[SIDEBAR_TOOL_STORE,[]],[TOOL_CLEANUP_STORE,malformed],[key,privateData]]);
  const f=await hostFixture(t,{store,startTool:false}),locks=sharedLocks();
  await assert.rejects(getPendingToolCleanups(f.api),{code:'E_STORAGE_CORRUPT'});
  await assert.rejects(installReviewedSidebarTool({api:f.api,lockManager:locks,
    candidate:sample,baseline:null,reviewApproved:true}),{code:'E_STORAGE_CORRUPT'},
  'a damaged recovery marker must never let this ID replace the previous owner');
  await assert.rejects(retryUninstalledToolCleanup({api:f.api,lockManager:locks,id:sample.id}),
    {code:'E_STORAGE_CORRUPT'},'recovery must not silently drop malformed journal rows');
  assert.deepEqual(store.get(SIDEBAR_TOOL_STORE),[]);
  assert.deepEqual(store.get(key),privateData);
  assert.deepEqual(store.get(TOOL_CLEANUP_STORE),malformed);
});

test('R5.1 uninstall cleanup preserves malformed unrelated grant data for safe recovery',async t=>{
  const pending={[sample.id]:{version:sample.version,createdAt:1}};
  const unrelated=['invalid grant registry; do not silently replace'];
  const store=new Map([[SIDEBAR_TOOL_STORE,[]],[TOOL_CLEANUP_STORE,pending],
    [READING_TOC_SITE_STORE,unrelated]]);
  const f=await hostFixture(t,{store,startTool:false});
  await assert.rejects(retryUninstalledToolCleanup({api:f.api,lockManager:sharedLocks(),id:sample.id}),
    {code:'E_TOOL_UNINSTALL_CLEANUP'});
  assert.deepEqual(store.get(READING_TOC_SITE_STORE),unrelated,
    'malformed records must remain intact for operator recovery, not be spread into objects');
  assert.deepEqual(store.get(TOOL_CLEANUP_STORE),pending,
    'cleanup cannot be marked completed after skipping a broken unrelated store');
  assert.deepEqual(store.get(SIDEBAR_TOOL_STORE),[]);
});

test('Back requests post-commit list focus and last uninstall requests import fallback',async t=>{
  const f=await hostFixture(t,{startTool:false});
  f.host.openTool(sample.id);
  f.emit(f.elements['sidebar-tool-back'],'click');
  assert.ok(f.view.takeEffects().some(effect=>effect.key==='sidebar-tool-import-trigger'&&
    effect.method==='focus'&&effect.options.extensionToolId===sample.id));
  f.host.openTool(sample.id);
  f.emit(f.elements['sidebar-tool-remove'],'click');
  f.emit(f.elements['sidebar-tool-inline-remove-confirm'],'click');
  await settle(()=>f.store.get(SIDEBAR_TOOL_STORE)?.length===0);
  await pause();
  assert.equal(f.runtime.frameRoot.children.length,0);
  assert.ok(f.view.takeEffects().some(effect=>effect.key==='sidebar-tool-import-trigger'&&effect.method==='focus'));
});

test('stopped tool detail opens a fixed full-page route without running sidebar code',async t=>{
  const f=await hostFixture(t,{startTool:false,store:new Map([[SIDEBAR_TOOL_STORE,[sample]],[SIDEBAR_TOOL_ENABLE_STORE,{[sample.id]:false}]])});
  const opened=[];f.api.tabs={create:async options=>{opened.push(options.url);}};
  f.host.openTool(sample.id);
  assert.equal(f.elements['sidebar-tool-frame'].children.length,0);
  f.emit(f.elements['sidebar-tool-open-tab'],'click');await pause();await pause();
  assert.deepEqual(opened,['chrome-extension://test/sidepanel.html?toolId=quick-notes']);
  assert.equal(f.elements['sidebar-tool-frame'].children.length,0);
});

test('R18 resize and status messages accept only the live opaque frame and bounded sizes',async t=>{
  const f=await hostFixture(t);
  const loaded=f.frame.contentWindow.sent[0];
  const send=(source,origin,kind,more={},instance=loaded.instance)=>{
    globalThis.window.emit('message',{source,origin,data:{
      protocol:loaded.protocol,kind,instance,toolId:sample.id,...more}});
  };
  send({},'null','resize',{height:260});
  send(f.frame.contentWindow,'https://evil.example','resize',{height:260});
  send(f.frame.contentWindow,'null','resize',{height:260},'forged');
  send(f.frame.contentWindow,'null','resize',{height:NaN});
  send(f.frame.contentWindow,'null','resize',{height:90000});
  assert.equal(f.frame.style.height,'','forged or unbounded size never applies');
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
  assert.equal(f.host.closeTool(),false,'dirty preview requires nonmodal in-page confirmation');
  assert.equal(f.elements['sidebar-tool-action-review'].hidden,false);
  f.emit(f.elements['sidebar-tool-action-continue'],'click');
  await pause();
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
  const store=new Map([[SIDEBAR_TOOL_STORE,[tool]],
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
  await refreshed;gate.resolve();await settle(()=>f.frame.contentWindow.sent.filter(row=>row.kind==='response').length===2);
  assert.equal(source.value,'','same URL with a new document ID must reject the old reply');
  assert.equal(f.frame.contentWindow.sent.filter(row=>row.kind==='page-changed').length,3);
  assert.equal(f.frame.contentWindow.sent.filter(row=>row.kind==='response').at(-1).ok,false);
});

test('TOC detail actions remain available after repeated page observations',async t=>{
  const toc=await officialToolFixture('reading-toc');let notify;
  const target={snapshot:{status:'available',url:'https://article.example/a',title:'A'},
    subscribe(fn){notify=fn;fn(this.snapshot);return()=>{};}};
  const f=await hostFixture(t,{target,store:new Map([[SIDEBAR_TOOL_STORE,[toc]]]),startTool:false});await pause();
  notify(target.snapshot);f.host.setVisible(true);
  target.snapshot={...target.snapshot,title:'Updated title',url:'https://article.example/other'};notify(target.snapshot);
  f.host.openTool(toc.id);
  assert.equal(f.elements['sidebar-tool-frame'].children.length,1);
  assert.equal(f.elements['sidebar-tool-settings-open'].hidden,false,'gear belongs to active detail toolbar');
  f.emit(f.elements['sidebar-tool-settings-open'],'click');
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
  f.emit(gear,'click');
  assert.equal(f.elements['sidebar-tool-settings-view'].hidden,false);
  assert.equal(f.elements['sidebar-tool-frame'].hidden,true);
  assert.equal(f.elements['sidebar-tool-frame'].children[0],iframe,'the sandbox is retained, not reloaded');
  assert.equal(f.elements['sidebar-tool-title'].textContent,toc.title);
  const pagePrefs=changeReadingTocVisibility({},toc.id,url,'page',true);
  f.changeStorage({[READING_TOC_VISIBILITY_STORE]:{newValue:pagePrefs}});
  assert.equal(f.elements['sidebar-tool-settings-page-visibility'].textContent,'恢复显示');
  assert.deepEqual(store.get(READING_TOC_SITE_STORE),{'reading-toc':['https://article.example']});
  f.emit(back,'click');
  assert.equal(f.elements['sidebar-tool-frame'].hidden,false);
  assert.equal(f.elements['sidebar-tool-frame'].children[0],iframe);
  assert.equal(f.elements['sidebar-tool-settings-view'].hidden,true);
  f.emit(back,'click');
  assert.equal(f.elements['sidebar-tool-frame'].children.length,0,'leaving the tool really tears down the sandbox');
});

test('R26 page appearance is independent of site authorization and global availability',async t=>{
  const toc=await officialToolFixture('reading-toc'),url='https://article.example/long-answer?private=1';
  const store=new Map([[SIDEBAR_TOOL_STORE,[toc]],
    [READING_TOC_SITE_STORE,{'reading-toc':['https://article.example']}]]);
  const target={snapshot:{status:'available',url},capture(){return {url,origin:'https://article.example',tabId:5,documentId:'doc'};},async revalidate(){return true;}};
  const f=await hostFixture(t,{target,store,tool:toc});
  f.emit(f.elements['sidebar-tool-settings-open'],'click');
  f.emit(f.elements['sidebar-tool-settings-page-visibility'],'click');
  await settle(()=>Boolean(store.get(READING_TOC_VISIBILITY_STORE)?.[toc.id]?.hiddenPages?.length));
  assert.deepEqual(store.get(READING_TOC_SITE_STORE),{[toc.id]:['https://article.example']});
  assert.equal(store.has(READING_TOC_PAGE_RULES_STORE),false);
  f.emit(f.elements['sidebar-tool-settings-page-visibility'],'click');
  await settle(()=>!store.get(READING_TOC_VISIBILITY_STORE)?.[toc.id]);
});

test('default reader settings can restore a stopped website without revisiting it',async t=>{
  const toc={...sample,id:'reading-toc',capabilities:['page.toc']};
  const store=new Map([[SIDEBAR_TOOL_STORE,[toc]],
    [READING_TOC_SITE_STORE,changeTocSiteAllowed({},toc.id,'https://old.example',false)]]);
  const target={snapshot:{status:'available',url:'https://article.example/latest'}};
  const f=await hostFixture(t,{store,startTool:true,tool:toc,target});
  f.emit(f.elements['sidebar-tool-settings-open'],'click');
  const sites=f.elements['sidebar-tool-settings-sites'];
  const oldSite=sites.rows.find(row=>row.id==='https://old.example');
  assert.ok(oldSite,'stopped websites can be managed from the independent view');
  assert.equal(f.elements['sidebar-tool-settings-sites-title'].textContent,'已停用的网站');
  assert.equal(oldSite.label,'恢复');
  f.view.activateRow(sites.key,oldSite.id);
  await settle(()=>!store.get(READING_TOC_SITE_STORE)?.[toc.id]);
  assert.deepEqual(store.get(READING_TOC_SITE_STORE),{});
  assert.deepEqual(store.get(SIDEBAR_TOOL_STORE),[toc],'revoke does not replace the tool package');
});


for(const [toolId,key,url,origin] of [
  ['reading-toc',READING_TOC_SITE_STORE,'http://127.0.0.1:43111/demo-form.html','http://127.0.0.1:43111'],
  ['web-markdown-clipper',CLIP_SITE_STORE,'https://article.example/story','https://article.example'],
  ['knowledge-inbox',CAPTURE_SITE_STORE,'https://chatgpt.com/c/fixture','https://chatgpt.com']
])test('site permission settings apply one click without a second dialog: '+toolId,async t=>{
  const tool=await officialToolFixture(toolId),store=new Map([[SIDEBAR_TOOL_STORE,[tool]]]);
  store.set(key,toolId==='reading-toc'?changeTocSiteAllowed({},toolId,url,false):changeInstalledSiteAccess({},toolId,url,false));
  const siteAllowed=()=>toolId==='reading-toc'?tocSiteAllowed(store.get(key),toolId,url):
    installedSiteAllowed(store.get(key),toolId,url);
  const allowedRecord={};
  let invalidated=false,validated=0,dialogCount=0;
  const target={snapshot:{status:'available',url},
    capture(){return {url,origin,windowId:1,tabId:7,frameId:0,documentId:'doc-a'};},
    async revalidate(){validated++;
      if(invalidated)throw Object.assign(new Error('当前网页已变化'),{code:'E_DOCUMENT_STALE'});}
  };
  const f=await hostFixture(t,{store,tool,target});
  f.emit(f.elements['sidebar-tool-settings-open'],'click');
  const allow=f.elements['sidebar-tool-settings-allow'];
  const deny=f.elements['sidebar-tool-settings-deny'];
  assert.equal(allow.disabled,false);
  assert.equal(allow.attributes['aria-pressed'],'false');
  assert.match(f.elements['sidebar-tool-settings-hint'].textContent,toolId==='reading-toc'?/安装后默认适用于普通 HTTP\(S\) 网页.*无需逐站授权/:/当前网站已停用/);
  globalThis.confirm=()=>{dialogCount++;return false;};
  f.emit(allow,'click');
  f.emit(allow,'click'); // repeated clicks before the first commit must not flip consent
  await settle(()=>siteAllowed()&&!allow.disabled);
  assert.deepEqual(store.get(key),allowedRecord,'the exact-origin stop/grant is restored');
  assert.equal(allow.attributes['aria-pressed'],'true');
  assert.equal(f.elements['sidebar-tool-settings-view'].hidden,false);
  assert.equal(dialogCount,0,'site grant is a direct action, not window.confirm');
  if(toolId==='reading-toc'){
    const eye=f.elements['sidebar-tool-visibility'];
    assert.equal(eye.disabled,false);
    f.emit(eye,'click');f.emit(eye,'click');
    await settle(()=>Boolean(store.get(READING_TOC_VISIBILITY_STORE)?.[toolId]?.hiddenSites?.includes(origin))&&!eye.disabled);
    assert.deepEqual(store.get(key),allowedRecord,'hide is independent of website grant');
    f.emit(eye,'click');
    await settle(()=>!store.get(READING_TOC_VISIBILITY_STORE)?.[toolId]&&!eye.disabled);
    assert.equal(dialogCount,0,'show/hide must never prompt');
  }
  f.emit(deny,'click');
  await settle(()=>!siteAllowed()&&!deny.disabled);
  assert.equal(deny.attributes['aria-pressed'],'true');
  assert.equal(dialogCount,0,'site revocation needs no dialog');
  invalidated=true;
  f.emit(allow,'click');
  await settle(()=>/E_DOCUMENT_STALE/.test(f.elements['sidebar-tool-status'].textContent||''));
  assert.equal(siteAllowed(),false,'stale document must not gain a permission');
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
  assert.equal(f.host.openOfficialReview(bundled.id),true);
  await settle(()=>!f.elements['sidebar-tool-preview'].hidden);
  assert.equal(f.elements['sidebar-tool-preview'].hidden,false,'update requires explicit review');
  assert.equal(f.elements['sidebar-tool-preview-version'].textContent,'v'+bundled.version);
  assert.equal(f.elements['sidebar-tool-install'].textContent,'确认更新');
  assert.equal(f.store.get(SIDEBAR_TOOL_STORE)[0].version,'1.0.0',
    'preview must not upgrade until consent');
  f.emit(f.elements['sidebar-tool-install'],'click');
  await settle(()=>f.store.get(SIDEBAR_TOOL_STORE)[0].version===bundled.version);
  assert.equal(f.store.get(SIDEBAR_TOOL_STORE)[0].version,bundled.version);
  assert.deepEqual(f.store.get(READING_TOC_SITE_STORE),granted);
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
  f.api.storage.session={get:async()=>pending,remove:async keys=>{
    for(const key of typeof keys==='string'?[keys]:keys)delete pending[key];
  }};
  globalThis.confirm=()=>true;
  f.emit(f.elements['sidebar-tool-remove'],'click');
  f.emit(f.elements['sidebar-tool-inline-remove-confirm'],'click');
  await settle(()=>!Object.hasOwn(pending,'opendesk.knowledge.workspace.v1:123')&&
    !store.get(SIDEBAR_TOOL_STORE).some(row=>row.id===knowledge.id));
  assert.deepEqual(pending,{unrelated:{keep:true}});
  assert.equal(f.elements['sidebar-tool-frame'].children.length,0);
  assert.equal(store.get(SIDEBAR_TOOL_STORE).some(row=>row.id===knowledge.id),false);
});

test('R4.8 manual reviewed installation remains available for every offline official package',async t=>{
  // The shipping extension includes the fixed audited Focus sidecar. A fixture
  // without it is intentionally an older browser and must refuse Focus.
  const previous=globalThis.__opendeskStayFocusTrustedUI;
  globalThis.__opendeskStayFocusTrustedUI=Object.freeze({
    id:FOCUS_ID,capability:FOCUS_CAPABILITY,operations:FOCUS_OPERATIONS,
    request:requestStayFocusOperation,runTrustedOperation:runTrustedStayFocusOperation,
    probe:async()=>({serviceReady:true}),
    createPermissionControls:createStayFocusPermissionControls
  });
  t.after(()=>{if(previous===undefined)delete globalThis.__opendeskStayFocusTrustedUI;
    else globalThis.__opendeskStayFocusTrustedUI=previous;});
  // The reviewed AI tool has a fixed first-party host. This generic installer
  // fixture supplies a matching extension-owned sidecar; the actual PAC and
  // authorization protocol have independent R1 tests.
  const previousAi=globalThis.__opendeskAiAccessTrustedUI;
  globalThis.__opendeskAiAccessTrustedUI=Object.freeze({
    id:AI_ID,capability:AI_CAPABILITY,operations:AI_OPERATIONS,
    request:async()=>({}),runTrustedOperation:async()=>({}),
    probe:async()=>({ready:true}),createPermissionControls:()=>({render(){},dispose(){}})
  });
  t.after(()=>{if(previousAi===undefined)delete globalThis.__opendeskAiAccessTrustedUI;
    else globalThis.__opendeskAiAccessTrustedUI=previousAi;});
  // This fixture tests reviewed official install and uninstall, not actual DNR
  // authorization. An old browser with no fixed AdBlock sidecar must fail closed.
  const previousAdblock=globalThis.__opendeskAdblockTrustedUI;
  globalThis.__opendeskAdblockTrustedUI=Object.freeze({
    id:ADBLOCK_ID,capability:ADBLOCK_CAPABILITY,operations:ADBLOCK_OPERATIONS,
    request:async()=>({}),runTrustedOperation:async()=>({}),
    probe:async()=>({serviceReady:true}),createPermissionControls:()=>({render(){},dispose(){}})
  });
  t.after(()=>{if(previousAdblock===undefined)delete globalThis.__opendeskAdblockTrustedUI;
    else globalThis.__opendeskAdblockTrustedUI=previousAdblock;});
  const requested=[],store=new Map();
  const f=await hostFixture(t,{store,startTool:false,fetcher:async(url,options)=>{
    requested.push(new URL(url).pathname);return officialFixtureFetch(url,options);
  }});
  f.api.permissions={contains:async()=>false}; // No native proxy rights in this installer fixture.
  const {catalog}=await officialFixtures();
  assert.deepEqual(requested,['/official-tools/catalog.json'],'first run loads metadata only');
  assert.equal(store.has(SIDEBAR_TOOL_STORE),false);
  for(const key of [READING_TOC_SITE_STORE,CLIP_SITE_STORE,CAPTURE_SITE_STORE])assert.equal(store.has(key),false);
  for(const release of catalog.apps){
    const before=structuredClone(store.get(SIDEBAR_TOOL_STORE));
    assert.equal(f.host.openOfficialReview(release.toolId),true);
    await settle(()=>!f.elements['sidebar-tool-preview'].hidden);
    assert.equal(f.elements['sidebar-tool-preview-version'].textContent,'v'+release.version);
    assert.deepEqual(store.get(SIDEBAR_TOOL_STORE),before,'review cannot install');
    assert.equal(f.elements['sidebar-tool-frame'].children.length,0);
    f.emit(f.elements['sidebar-tool-import-close'],'click');
    assert.deepEqual(store.get(SIDEBAR_TOOL_STORE),before,'cancel preserves previous registry');
    assert.equal(f.host.openOfficialReview(release.toolId),true);
    await settle(()=>!f.elements['sidebar-tool-preview'].hidden);
    f.emit(f.elements['sidebar-tool-install'],'click');
    f.emit(f.elements['sidebar-tool-install'],'click');
    await settle(()=>f.elements['sidebar-tool-import'].hidden);
    assert.equal(store.get(SIDEBAR_TOOL_STORE).filter(row=>row.id===release.toolId).length,1);
    assert.equal(store.get(MARKET_PROVENANCE_STORE)[release.toolId].sha256,release.sha256);
    assert.equal(f.elements['sidebar-tool-frame'].children.length,0,'confirmed install cannot run code');
  }
  assert.equal(store.get(SIDEBAR_TOOL_STORE).length,catalog.apps.length);
  for(const release of catalog.apps){
    f.host.openTool(release.toolId);
    f.emit(f.elements['sidebar-tool-remove'],'click');
    f.emit(f.elements['sidebar-tool-inline-remove-confirm'],'click');
    await settle(()=>!store.get(SIDEBAR_TOOL_STORE).some(row=>row.id===release.toolId));
  }
  assert.deepEqual(store.get(SIDEBAR_TOOL_STORE),[]);
  f.host.dispose();
  const reopened=await hostFixture(t,{store,startTool:false});
  assert.deepEqual(store.get(SIDEBAR_TOOL_STORE),[],'reopening cannot reinstall bundled resources');
  assert.equal(reopened.elements['sidebar-tool-frame'].children.length,0);
  for(const key of [READING_TOC_SITE_STORE,CLIP_SITE_STORE,CAPTURE_SITE_STORE])assert.equal(store.has(key),false);
});

test('import state actions preserve the installed registry and never start a sandbox',async t=>{
  const f=await hostFixture(t,{startTool:false}),before=structuredClone(f.store.get(SIDEBAR_TOOL_STORE));
  assert.equal(f.host.openImport(),true);
  assert.equal(f.elements['sidebar-tool-import'].hidden,false);
  assert.equal(f.elements['sidebar-tool-import-trigger'].attributes['aria-expanded'],'true');
  f.emit(f.elements['sidebar-tool-import-close'],'click');
  assert.equal(f.elements['sidebar-tool-import'].hidden,true);
  assert.equal(f.elements['sidebar-tool-import-trigger'].attributes['aria-expanded'],'false');
  assert.equal(f.runtime.frameRoot.children.length,0);
  assert.deepEqual(f.store.get(SIDEBAR_TOOL_STORE),before);
});

test('R4.5 two official review windows share the original installation lock and reject stale approvals',async t=>{
  const originalWindow=globalThis.window,originalConfirm=globalThis.confirm;
  const store=new Map(),locks=sharedLocks(),release=(await officialFixtures()).catalog.apps[0];
  const a=await hostFixture(t,{store,locks,startTool:false}),b=await hostFixture(t,{store,locks,startTool:false});
  t.after(()=>{globalThis.window=originalWindow;globalThis.confirm=originalConfirm;});
  for(const f of [a,b]){
    f.host.openOfficialReview(release.toolId);
    await settle(()=>!f.elements['sidebar-tool-preview'].hidden);
  }
  a.emit(a.elements['sidebar-tool-install'],'click');b.emit(b.elements['sidebar-tool-install'],'click');
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
  const official=()=>f.host.openOfficialReview('reading-toc');
  official();await requested.promise;
  f.emit(f.elements['sidebar-tool-import-close'],'click');gate.resolve();await pause();await pause();
  assert.equal(f.elements['sidebar-tool-preview'].hidden,true);
  assert.equal(f.store.has(SIDEBAR_TOOL_STORE),false);
  broken=true;official();
  await settle(()=>f.elements['sidebar-tool-file-error'].hidden===false);
  assert.match(f.elements['sidebar-tool-file-error'].textContent,/E_PACKAGE_MISSING/);
  assert.equal(f.elements['sidebar-tool-install'].disabled,true);
  assert.equal(f.store.has(SIDEBAR_TOOL_STORE),false);
  assert.equal(f.elements['sidebar-tool-frame'].children.length,0);
});

for(const failReadback of [false,true])test('R4.5 lost registry acknowledgement revokes approval without replay; readback failure='+failReadback,async t=>{
  const f=await hostFixture(t,{store:new Map(),startTool:false});
  const release=(await officialFixtures()).catalog.apps[0];
  f.host.openOfficialReview(release.toolId);
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
  f.emit(f.elements['sidebar-tool-install'],'click');
  await settle(()=>/本次批准已撤销/.test(f.elements['sidebar-tool-file-error'].textContent||''));
  await settle(()=>f.store.get(SIDEBAR_TOOL_STORE)?.length===1);
  assert.equal(f.store.get(SIDEBAR_TOOL_STORE).length,1);
  assert.equal(f.elements['sidebar-tool-preview'].hidden,true);assert.equal(f.elements['sidebar-tool-install'].disabled,true);
  assert.equal(f.elements['sidebar-tool-frame'].children.length,0);
  const [operationId,operation]=Object.entries(f.store.get(MARKET_OPERATIONS_STORE))[0];
  assert.equal(operation.state,'outcome-unknown');
  f.emit(f.elements['sidebar-tool-install'],'click');f.emit(f.elements['sidebar-tool-install'],'click');
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
  f.host.openOfficialReview(release.toolId);await settle(()=>!f.elements['sidebar-tool-preview'].hidden);
  const get=f.api.storage.local.get;let failed=false;
  f.api.storage.local.get=async key=>{
    if(key===SIDEBAR_TOOL_STORE&&!failed&&Object.values(f.store.get(MARKET_OPERATIONS_STORE)||{}).some(row=>row.state==='succeeded')){
      failed=true;throw Error('post-commit list read failed');
    }
    return get(key);
  };
  f.emit(f.elements['sidebar-tool-install'],'click');
  await settle(()=>/post-commit list read failed/.test(f.elements['sidebar-tool-status'].textContent||''));
  assert.equal(f.store.get(SIDEBAR_TOOL_STORE).length,1);
  assert.equal(f.elements['sidebar-tool-install'].disabled,true);assert.equal(f.elements['sidebar-tool-preview'].hidden,true);
});

test('R4.5 an official package removed after review is rejected before any installation write',async t=>{
  let removed=false;
  const f=await hostFixture(t,{store:new Map(),startTool:false,fetcher:async url=>
    removed&&new URL(url).pathname.endsWith('.opendesk-tool.json')?new Response('',{status:404}):officialFixtureFetch(url)});
  f.host.openOfficialReview((await officialFixtures()).catalog.apps[0].toolId);
  await settle(()=>!f.elements['sidebar-tool-preview'].hidden);removed=true;
  f.emit(f.elements['sidebar-tool-install'],'click');
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
  assert.equal(f.elements['sidebar-tool-status'].attributes['data-state'],'error');
  f.host.openTool(sample.id);
  assert.equal(f.runtime.frameRoot.children.length,0);
  assert.match(f.elements['sidebar-tool-status'].textContent,/安装记录读取失败/);
  assert.deepEqual(store.get(SIDEBAR_TOOL_STORE),damaged);
});

test('uninstall refuses a newly corrupted registry rather than dropping unrelated rows',async t=>{
  const f=await hostFixture(t,{startTool:false}),damaged=[sample,{...sample,id:'invalid id'}];
  f.store.set(SIDEBAR_TOOL_STORE,damaged); // another context writes unexpected bytes
  f.host.openTool(sample.id);
  const remove=f.elements['sidebar-tool-remove'];
  assert(remove);
  f.emit(remove,'click');f.emit(f.elements['sidebar-tool-inline-remove-confirm'],'click');
  await settle(()=>/E_STORAGE_CORRUPT/.test(f.elements['sidebar-tool-status'].textContent||''));
  assert.deepEqual(f.store.get(SIDEBAR_TOOL_STORE),damaged);
  assert.equal(f.store.has(sidebarToolStorageKey(sample.id)),false);
});

test('default TOC availability needs no grant; stopping and restoring use one click',async t=>{
  const toc={...sample,id:'reading-toc',capabilities:['page.toc']};
  const url='https://article.example/guide';
  const target={snapshot:{status:'available',url,title:'Guide'},
    capture:()=>({url,origin:'https://article.example',tabId:7,documentId:'doc-toc'}),
    async revalidate(){return true;}};
  const f=await hostFixture(t,{store:new Map([[SIDEBAR_TOOL_STORE,[toc]]]),target,startTool:false});
  let prompts=0;
  globalThis.confirm=()=>{prompts++;return false;};
  f.host.openTool(toc.id);
  f.emit(f.elements['sidebar-tool-settings-open'],'click');
  assert.equal(f.elements['sidebar-tool-settings-allow'].attributes['aria-pressed'],'true');
  assert.equal(f.elements['sidebar-tool-visibility'].disabled,false);
  f.emit(f.elements['sidebar-tool-settings-allow'],'click');
  await pause();assert.equal(f.store.has(READING_TOC_SITE_STORE),false);
  assert.equal(prompts,0,'site grant is the users explicit selection; no second modal');
  f.emit(f.elements['sidebar-tool-settings-allow'],'click');await pause();
  assert.equal(f.store.has(READING_TOC_SITE_STORE),false,
    'selecting the already-active state is idempotent');
  f.emit(f.elements['sidebar-tool-settings-deny'],'click');
  await settle(()=>f.store.get(READING_TOC_SITE_STORE)?.[toc.id]?.blockedOrigins?.includes('https://article.example'));
  assert.equal(prompts,0,'revoking site grant also needs no extra modal');
  assert.equal(tocSiteAllowed(f.store.get(READING_TOC_SITE_STORE),toc.id,url),false);
  f.emit(f.elements['sidebar-tool-settings-allow'],'click');
  await settle(()=>!f.store.get(READING_TOC_SITE_STORE)?.[toc.id]);
  assert.deepEqual(f.store.get(READING_TOC_SITE_STORE),{});
});

test('R4.9 clipper and knowledge are available by default with one-click stop and restore',async t=>{
  const scenarios=[
    {id:'web-markdown-clipper',capabilities:['page.clip'],url:'https://article.example/post',
      origin:'https://article.example',storeKey:CLIP_SITE_STORE},
    {id:'knowledge-inbox',capabilities:['knowledge.store','page.capture'],url:'https://chatgpt.com/c/test',
      origin:'https://chatgpt.com',storeKey:CAPTURE_SITE_STORE}
  ];
  const tools=scenarios.map(scenario=>({...sample,id:scenario.id,capabilities:scenario.capabilities}));
  let current=scenarios[0];
  const target={snapshot:{status:'available',url:current.url,title:'Current page'},
    capture:()=>({url:current.url,origin:current.origin,tabId:7,documentId:'doc-site'}),
    async revalidate(){return true;}};
  const f=await hostFixture(t,{store:new Map([[SIDEBAR_TOOL_STORE,tools],['opendesk.sidebar-tools.enabled.v1',Object.fromEntries(tools.map(tool=>[tool.id,false]))]]),target,startTool:false});
  let prompts=0;
  globalThis.confirm=()=>{prompts++;return false;};
  for(const scenario of scenarios){
    current=scenario;
    target.snapshot={status:'available',url:current.url,title:'Current page'};
    f.host.setVisible(true);
    f.host.openTool(scenario.id);
    if(f.elements['sidebar-tool-settings-view'].hidden)f.emit(f.elements['sidebar-tool-settings-open'],'click');
    assert.equal(installedSiteAllowed(f.store.get(scenario.storeKey),scenario.id,scenario.url),true);
    assert.equal(f.store.has(scenario.storeKey),false,'first use needs no extra site permission write');
    assert.equal(prompts,0,scenario.id+' does not issue a second confirmation');
    assert.equal(f.elements['sidebar-tool-frame'].children.length,0,
      'authorizing a website never runs its tool sandbox');
    f.emit(f.elements['sidebar-tool-settings-deny'],'click');
    await settle(()=>!installedSiteAllowed(f.store.get(scenario.storeKey),scenario.id,scenario.url))
      .catch(error=>{throw new Error(scenario.id+': '+f.elements['sidebar-tool-status'].textContent,{cause:error});});
    assert.equal(prompts,0,'grant revocation also uses just the site control');
    await settle(()=>!f.elements['sidebar-tool-settings-allow'].disabled);
    f.emit(f.elements['sidebar-tool-settings-allow'],'click');
    await settle(()=>installedSiteAllowed(f.store.get(scenario.storeKey),scenario.id,scenario.url));
    f.host.closeTool();
  }
});

test('R4.9 availability controls use the ordinary compact button geometry',async()=>{
  const css=await readFile('src/ui/tool-shell.css','utf8');
  const layout=css.match(/\.sidebar-toc-settings-binary\{([^}]+)\}/)?.[1];
  const buttons=css.match(/\.sidebar-toc-settings-binary button\{([^}]+)\}/)?.[1];
  assert.ok(layout&&buttons,'TOC settings have explicit host-owned styling');
  assert.match(layout,/display:flex/);
  assert.doesNotMatch(layout,/grid-template-columns/);
  assert.match(buttons,/min-height:34px/);
  assert.match(buttons,/width:auto/);
  assert.match(buttons,/font-size:12px/);
  assert.doesNotMatch(buttons,/min-height:45px/);
});

test('R5.1 three official tool site grants require no extra JavaScript modal',async t=>{
  const scenarios=[
    {id:'reading-toc',url:'https://docs.example/item',origin:'https://docs.example',capabilities:['page.toc'],store:READING_TOC_SITE_STORE},
    {id:'web-markdown-clipper',url:'https://docs.example/item',origin:'https://docs.example',capabilities:['page.clip'],store:CLIP_SITE_STORE},
    {id:'knowledge-inbox',url:'https://chatgpt.com/c/test',origin:'https://chatgpt.com',capabilities:['knowledge.store','page.capture'],store:CAPTURE_SITE_STORE}
  ];
  const packages=scenarios.map(row=>({...sample,id:row.id,capabilities:row.capabilities}));
  const target={snapshot:{status:'available',url:scenarios[0].url},
    capture(){return {url:this.snapshot.url,origin:new URL(this.snapshot.url).origin,tabId:5,documentId:'doc'};},
    async revalidate(){return true;}};
  const f=await hostFixture(t,{store:new Map([[SIDEBAR_TOOL_STORE,packages],
    ...scenarios.map(row=>[row.store,row.id==='reading-toc'?changeTocSiteAllowed({},row.id,row.url,false):
      changeInstalledSiteAccess({},row.id,row.url,false)])]),target,startTool:false});
  let prompts=0;globalThis.confirm=()=>{prompts++;return false;};
  for(const row of scenarios){
    target.snapshot={status:'available',url:row.url};
    f.host.openTool(row.id);
    f.emit(f.elements['sidebar-tool-settings-open'],'click');
    f.emit(f.elements['sidebar-tool-settings-allow'],'click');
    const allowed=()=>row.id==='reading-toc'?tocSiteAllowed(f.store.get(row.store),row.id,row.url):
      installedSiteAllowed(f.store.get(row.store),row.id,row.url);
    await settle(()=>allowed());
    assert.equal(prompts,0,row.id+' does not invoke confirm');
    f.emit(f.elements['sidebar-tool-settings-deny'],'click');
    await settle(()=>!allowed());
    assert.equal(prompts,0,row.id+' revokes without confirm');
    f.host.closeTool();
  }
});
test('R5.1 inline removal has cancellation, identity pinning, and no accidental double-delete',async t=>{
  const key=sidebarToolStorageKey(sample.id),privateData={note:'retain'};
  const f=await hostFixture(t,{startTool:false,store:new Map([[SIDEBAR_TOOL_STORE,[sample]],[key,privateData]])});
  f.host.openTool(sample.id);
  f.emit(f.elements['sidebar-tool-remove'],'click');await pause();
  assert.equal(f.elements['sidebar-tool-inline-remove'].hidden,false);
  f.emit(f.elements['sidebar-tool-inline-remove-cancel'],'click');
  assert.equal(f.elements['sidebar-tool-inline-remove'].hidden,true);
  assert.deepEqual(f.store.get(key),privateData);
  f.emit(f.elements['sidebar-tool-remove'],'click');
  f.emit(f.elements['sidebar-tool-remove'],'click');
  await pause();assert.deepEqual(f.store.get(key),privateData);
  const updated={...sample,version:'1.1.0'};
  f.store.set(SIDEBAR_TOOL_STORE,[updated]);f.change([updated]);
  assert.equal(f.elements['sidebar-tool-inline-remove'].hidden,true);
  f.emit(f.elements['sidebar-tool-inline-remove-confirm'],'click');await pause();
  assert.deepEqual(f.store.get(SIDEBAR_TOOL_STORE),[updated]);
});
test('R5.1 host does not use JavaScript confirm or browser unload dialogs',async()=>{
  const source=await readFile('src/ui/sidebar-tools.js','utf8');
  assert.doesNotMatch(source,/globalThis\.confirm\s*\(|window\.confirm\s*\(/);
  assert.doesNotMatch(source,/listen\((?:window|globalThis\.window),['"]beforeunload/);
  assert.match(source,/sidebar-tool-inline-remove-confirm/);
});

test('R50 inline dirty navigation has no native modal and requires explicit continuation',async t=>{
  const f=await hostFixture(t),frame=f.frame,loaded=f.loaded;
  globalThis.confirm=()=>{throw Error('native confirm must never run');};
  f.win.emit('message',{origin:'null',source:frame.contentWindow,data:{
    protocol:loaded.protocol,toolId:sample.id,instance:loaded.instance,kind:'edit-state',dirty:true,busy:false}});
  assert.equal(f.host.closeTool(),false);
  assert.equal(f.elements['sidebar-tool-action-review'].hidden,false);
  f.emit(f.elements['sidebar-tool-action-cancel'],'click');
  assert.equal(f.elements['sidebar-tool-frame'].children[0],frame);
  assert.equal(f.host.closeTool(),false);
  f.emit(f.elements['sidebar-tool-action-continue'],'click');
  await pause();
  assert.equal(f.elements['sidebar-tool-frame'].children.length,0);
});

test('native menu launch gate prevents sandbox code until trusted ticket binding ACK',async t=>{
  const f=await hostFixture(t,{startTool:false}),binding=deferred();
  const token=f.host.openTool(sample.id,{launchGate:binding.promise});
  assert.equal(typeof token,'string');
  const frame=f.elements['sidebar-tool-frame'].children[0];
  const load=frame.onload();
  await pause();await pause();
  assert.equal(frame.contentWindow.sent.length,0,'no sandbox source may execute before host binding receipt');
  binding.resolve();
  await load;
  assert.equal(frame.contentWindow.sent.length,1);
  assert.equal(frame.contentWindow.sent[0].kind,'load');
  assert.equal(frame.contentWindow.sent[0].instance,token);
});
test('denied native menu ticket binding discards iframe without running untrusted JS',async t=>{
  const f=await hostFixture(t,{startTool:false}),binding=deferred();
  f.host.openTool(sample.id,{launchGate:binding.promise});
  const frame=f.elements['sidebar-tool-frame'].children[0],load=frame.onload();
  binding.reject(Object.assign(new Error('E_LAUNCH_EXPIRED'),{code:'E_LAUNCH_EXPIRED'}));
  await load;
  assert.equal(frame.contentWindow.sent.length,0,'binding rejection must never post the tool package');
  assert.equal(f.elements['sidebar-tool-frame'].children.length,0);
  assert.match(f.elements['sidebar-tool-status'].textContent,/右键启动未确认/);
});

test('a stopped v2 tool cannot request Chrome contextMenus even if click is spoofed',async t=>{
  const row=JSON.parse(await readFile(new URL('../../examples/sidebar-tools/browser-sdk-r13/selection-notes.opendesk-tool.json',import.meta.url),'utf8'));
  const store=new Map([[SIDEBAR_TOOL_STORE,[row]],
    ['opendesk.sidebar-tools.enabled.v1',{[row.id]:false}]]);
  const target={snapshot:{status:'available',url:'https://example.com/post',title:'Example'}};
  const f=await hostFixture(t,{store,tool:row,startTool:false,target});
  f.host.openTool(row.id);
  const button=f.elements['sidebar-tool-context-menu'];
  assert.equal(button.hidden,false,'v2 contribution remains discoverable in the detail page');
  assert.equal(button.disabled,true,'disabled tools may not ask Chrome for optional permission');
  f.view.actions[button.key].click({isTrusted:true});
  await pause();await pause();
  assert.match(f.elements['sidebar-tool-status'].textContent,/E_TOOL_DISABLED/,
    'the trusted click handler independently denies disabled tools');
});
test('installed menu UI uses Host default status and stop/restore reuses existing Chrome permission',async t=>{
  const tool=await officialToolFixture('web-markdown-clipper');
  const oldLocation=globalThis.location;
  globalThis.location={href:'chrome-extension://test/sidepanel.html?hostInstanceId=12345678-1234-4234-8234-123456789abc'};
  t.after(()=>{globalThis.location=oldLocation;});
  const target={snapshot:{status:'available',url:'https://example.com/article'},
    capture:()=>({url:'https://example.com/article',tabId:7,documentId:'document-a'}),
    async revalidate(){return true;}};
  const f=await hostFixture(t,{store:new Map([[SIDEBAR_TOOL_STORE,[tool]]]),tool,target,startTool:false});
  let enabled=true,permissionRequests=0;
  const toggles=[];
  f.api.permissions={request(){permissionRequests++;return Promise.resolve(true);}};
  f.api.runtime.sendMessage=async message=>{
    if(message.operation==='browser.contextMenu.getStatus')return {ok:true,data:{siteEnabled:enabled,browserPermission:true}};
    if(message.operation==='browser.contextMenu.userToggle'){
      toggles.push(message);enabled=message.enabled;
      return {ok:true,data:{enabled}};
    }
    return {ok:true};
  };
  f.host.openTool(tool.id);
  const button=f.elements['sidebar-tool-context-menu'];
  await settle(()=>button.attributes['data-enabled']==='true'&&!button.disabled);
  assert.match(button.title,/停用/);
  assert.equal(f.store.has(BROWSER_MENU_GRANTS_STORE),false,'the UI recognizes the default without another grant');
  f.view.actions[button.key].click({isTrusted:true});
  await settle(()=>toggles.length===1&&button.attributes['data-enabled']==='false'&&!button.disabled);
  assert.equal(toggles[0].enabled,false,'first click stops the already available menu');
  assert.equal(toggles[0].toolVersion,tool.version);
  assert.equal(toggles[0].installEpoch,null);
  f.view.actions[button.key].click({isTrusted:true});
  await settle(()=>toggles.length===2&&button.attributes['data-enabled']==='true'&&!button.disabled);
  assert.equal(toggles[1].enabled,true);
  assert.equal(permissionRequests,0,'already permitted Chrome menus require no repeated request');
});


test('native menu cannot defer an unbound launch behind the current tool dirty review',async t=>{
  const f=await hostFixture(t),frame=f.frame,loaded=f.loaded;
  f.win.emit('message',{origin:'null',source:frame.contentWindow,data:{
    protocol:loaded.protocol,toolId:sample.id,instance:loaded.instance,kind:'edit-state',dirty:true,busy:false}});
  assert.equal(f.host.openTool(sample.id,{launchGate:Promise.resolve()}),undefined);
  assert.equal(f.elements['sidebar-tool-frame'].children[0],frame,'dirty editor remains intact');
  assert.match(f.elements['sidebar-tool-status'].textContent,/重新从右键菜单启动/);
  assert.equal(f.elements['sidebar-tool-action-review'].hidden,true,'no deferred mount without ticket binding');
});

test('R4.7 row overflow shares the real guarded sidebar lifecycle and rejects spoofed clicks',async t=>{
  const store=new Map([[SIDEBAR_TOOL_STORE,[sample]]]);
  const f=await hostFixture(t,{store,startTool:false});
  assert.equal(typeof f.host.toggleEnabled,'function');
  assert.equal(await f.host.toggleEnabled(sample.id,{isTrusted:false}),false);
  assert.equal(store.get(SIDEBAR_TOOL_ENABLE_STORE),undefined,'untrusted event must not write');
  assert.equal(await f.host.toggleEnabled(sample.id,{isTrusted:true}),true);
  assert.equal(store.get(SIDEBAR_TOOL_ENABLE_STORE)[sample.id],false);
  assert.equal(f.elements['sidebar-tool-frame'].children.length,0,'disabling never creates sandbox');
  assert.equal(await f.host.toggleEnabled(sample.id,{isTrusted:true}),true);
  assert.equal(store.get(SIDEBAR_TOOL_ENABLE_STORE)[sample.id],true);
  assert.equal(f.elements['sidebar-tool-frame'].children.length,0,'enabling never auto-launches');
});

test('R56 dirty tool enable/disable uses a cancellable inline review and cannot lose data',async t=>{
  const key=sidebarToolStorageKey(sample.id),privateData={notes:'keep after stop'},
    store=new Map([[SIDEBAR_TOOL_STORE,[sample]],[key,privateData]]);
  const f=await hostFixture(t,{store}),frame=f.frame;
  let dialogs=0;
  globalThis.confirm=()=>{dialogs++;throw Error('native confirm must not be invoked');};
  const editorState=(dirty,busy)=>f.win.emit('message',{origin:'null',source:frame.contentWindow,
    data:{protocol:f.loaded.protocol,toolId:sample.id,instance:f.loaded.instance,
      kind:'edit-state',dirty,busy}});
  editorState(true,false);
  f.emit(f.elements['sidebar-tool-settings-open'],'click');
  f.emit(f.elements['sidebar-tool-enable'],'click',{isTrusted:true});
  await settle(()=>f.elements['sidebar-tool-action-review'].hidden===false);
  assert.equal(f.elements['sidebar-tool-action-review'].hidden,false,'dirty stop must open inline review');
  assert.notEqual(store.get(SIDEBAR_TOOL_ENABLE_STORE)?.[sample.id],false,'opening review does not stop');
  f.emit(f.elements['sidebar-tool-action-cancel'],'click');
  assert.equal(f.elements['sidebar-tool-frame'].children[0],frame,'Cancel must preserve live unsaved editor');
  assert.notEqual(store.get(SIDEBAR_TOOL_ENABLE_STORE)?.[sample.id],false);

  f.emit(f.elements['sidebar-tool-enable'],'click',{isTrusted:true});
  await settle(()=>f.elements['sidebar-tool-action-review'].hidden===false);
  editorState(true,true);
  f.emit(f.elements['sidebar-tool-action-continue'],'click');
  await pause();await pause();
  assert.notEqual(store.get(SIDEBAR_TOOL_ENABLE_STORE)?.[sample.id],false,
    'a save starting during review prevents a stale stop');
  assert.equal(f.elements['sidebar-tool-frame'].children[0],frame);

  editorState(true,false);
  f.emit(f.elements['sidebar-tool-enable'],'click',{isTrusted:true});
  await settle(()=>f.elements['sidebar-tool-action-review'].hidden===false);
  f.emit(f.elements['sidebar-tool-action-continue'],'click');
  await settle(()=>store.get(SIDEBAR_TOOL_ENABLE_STORE)?.[sample.id]===false);
  assert.equal(f.elements['sidebar-tool-frame'].children.length,0,'confirmed stop retires the sandbox');
  assert.deepEqual(store.get(key),privateData,'stop never deletes tool data');
  assert.equal(dialogs,0,'all choices remain non-modal');

  f.emit(f.elements['sidebar-tool-enable'],'click',{isTrusted:true});
  await settle(()=>store.get(SIDEBAR_TOOL_ENABLE_STORE)?.[sample.id]===true);
  assert.equal(f.elements['sidebar-tool-frame'].children.length,0,'re-enable never auto-launches code');
  assert.deepEqual(store.get(key),privateData);
});

test('native Time Review forwards day, classification, settings and CSV payloads without read feedback',async t=>{
  const tool=await officialToolFixture('time-review');
  const release=(await officialFixtures()).catalog.apps.find(row=>row.toolId==='time-review');
  const old=globalThis.__opendeskTrustedTimeReviewUI;let request,signals=0;
  globalThis.__opendeskTrustedTimeReviewUI={version:tool.version,mount(options){request=options.request;return ()=>{};}};
  t.after(()=>{if(old===undefined)delete globalThis.__opendeskTrustedTimeReviewUI;else globalThis.__opendeskTrustedTimeReviewUI=old;});
  const f=await hostFixture(t,{tool,startTool:false,store:new Map([[SIDEBAR_TOOL_STORE,[tool]],
    [MARKET_PROVENANCE_STORE,{'time-review':{marketId:release.id,version:tool.version,sha256:release.sha256}}]])});
  f.elements['sidebar-tool-frame'].querySelector=()=>({dispatchEvent(){signals++;}});
  const calls=[];f.api.runtime.sendMessage=async message=>{calls.push(message);return {ok:true,data:{accepted:true}};};
  f.host.openTool(tool.id);await settle(()=>typeof request==='function');
  for(const [operation,payload] of [
    ['time.day',{date:'2026-10-14'}],['time.export',{format:'csv'}],
    ['time.settings',{idleSeconds:60,retentionDays:90,excludedHosts:[]}],
    ['time.classify',{host:'example.com',category:2}]
  ]){await request(operation,payload);assert.deepEqual(calls.at(-1).payload,payload,operation);}
  assert.equal(signals,2,'only mutations notify the native UI; reads/export cannot trigger a refresh loop');
  await request('time.status');assert.equal(signals,2);
  await assert.rejects(request('time.start',{}, {isTrusted:false}),{code:'E_TIME_TRUSTED_CLICK'});
  const before=calls.length;
  await assert.rejects(request('time.siteGrant',{mode:'all',allow:true},{isTrusted:true}),{code:'E_TIME_TRUSTED_CLICK'});
  assert.equal(calls.length,before,'native markup cannot replace the separate consent controls');
});
test('sandbox Browser RPC honors Registry argument-byte budget and settles oversized requests',async t=>{
  // Fictional data only. The old Side Panel checked JSON.stringify(entire
  // postMessage).length > 12000 and silently dropped this valid 11,900-byte
  // Cookie batch, leaving the iframe waiting for a timeout.
  const tool=await officialToolFixture('cookie-editor');
  const oldLocation=globalThis.location;
  globalThis.location={href:'chrome-extension://test/sidepanel.html?hostInstanceId=01234567-89ab-4def-8123-456789abcdef'};
  t.after(()=>{globalThis.location=oldLocation;});
  const f=await hostFixture(t,{tool,store:new Map([[SIDEBAR_TOOL_STORE,[tool]]])});
  const near={url:'https://example.org/',cookies:Array.from({length:12},(_,index)=>({
    name:'test'+index,value:'x'.repeat(960)
  }))};
  const envelope={protocol:f.loaded.protocol,kind:'request',
    instance:f.loaded.instance,toolId:tool.id,requestId:'near-limit',
    operation:'browser.cookies.setMany',payload:near};
  assert.equal(new TextEncoder().encode(JSON.stringify(near)).byteLength,11900);
  assert.ok(JSON.stringify(envelope).length>12000);
  assert.deepEqual(checkSidebarToolRequestBudget(envelope),{ok:true});
  f.ask('browser.cookies.setMany',near,'near-limit');
  await settle(()=>f.frame.contentWindow.sent.some(row=>row.requestId==='near-limit'));
  const reached=f.frame.contentWindow.sent.find(row=>row.requestId==='near-limit');
  assert.equal(reached.ok,false);
  assert.equal(reached.error.code,'E_SITE_GRANT_REQUIRED',
    'the admitted request reaches normal site-authorization refusal; no Cookie is written');

  const oversized={...near,cookies:near.cookies.map(row=>({...row,value:row.value+'x'.repeat(30)}))};
  assert.deepEqual(checkSidebarToolRequestBudget({...envelope,payload:oversized}),{ok:false,code:'E_LIMIT'});
  f.ask('browser.cookies.setMany',oversized,'too-large');
  await settle(()=>f.frame.contentWindow.sent.some(row=>row.requestId==='too-large'));
  const denied=f.frame.contentWindow.sent.find(row=>row.requestId==='too-large');
  assert.equal(denied.ok,false);
  assert.equal(denied.error.code,'E_LIMIT','oversized input must receive an explicit response, not time out');
  assert.equal(denied.result,undefined);
  assert.deepEqual(checkSidebarToolRequestBudget({...envelope,untrusted:'z'.repeat(800)}),{ok:false,code:'E_LIMIT'},
    'extra untrusted envelope fields do not expand the RPC budget');
  const unicode={...near,cookies:near.cookies.map((row,i)=>i===0?{...row,value:'中文'.repeat(960)}:row)};
  assert.deepEqual(checkSidebarToolRequestBudget({...envelope,payload:unicode}),{ok:false,code:'E_LIMIT'},
    'UTF-8 byte budget must reject large multibyte payloads');
});

test('R5.30.3 official export reuses one real click and still requires exact Host approval',async t=>{
  const tool=await officialToolFixture('cookie-editor');
  const release=(await officialFixtures()).catalog.apps.find(row=>row.toolId===tool.id);
  const origin='https://example.org';
  const target={snapshot:{status:'available',url:origin+'/'}};
  let pauseAdmission=false;const entered=deferred(),resume=deferred();
  const f=await hostFixture(t,{tool,target,getHook:async key=>{
    if(pauseAdmission&&Array.isArray(key)&&key.includes(MARKET_PROVENANCE_STORE)){
      pauseAdmission=false;entered.resolve();await resume.promise;
    }
  },store:new Map([
    [SIDEBAR_TOOL_STORE,[tool]],
    [BROWSER_MENU_GRANTS_STORE,{[tool.id]:{version:tool.version,installEpoch:null,
      packageHash:await sidebarToolPackageHash(tool),cookieAllSites:{read:true,grantEpoch:'grant-1'}}}],
    [MARKET_PROVENANCE_STORE,{[tool.id]:{marketId:release.id,version:release.version,sha256:release.sha256}}]
  ])});
  const old=Object.getOwnPropertyDescriptor(globalThis,'navigator'),oldLocation=globalThis.location;
  const copied=[],downloads=[],calls=[];let active=false,authorized=true,revokeBeforeDelivery=false;
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{
    userActivation:{get isActive(){return active;}},clipboard:{writeText:async text=>copied.push(text)}}});
  globalThis.location={href:'chrome-extension://test/sidepanel.html?hostInstanceId=01234567-89ab-4def-8123-456789abcdef'};
  t.after(()=>{if(old)Object.defineProperty(globalThis,'navigator',old);else delete globalThis.navigator;globalThis.location=oldLocation;});
  f.api.downloads={download:async args=>{downloads.push(args);return 91;}};
  f.api.runtime.sendMessage=async message=>{
    calls.push(message);
    if(message.kind==='tool'&&revokeBeforeDelivery){
      const grants=f.store.get(BROWSER_MENU_GRANTS_STORE);
      grants[tool.id].cookieAllSites={read:false,grantEpoch:'revoked'};
    }
    return message.operation==='browser.intent.confirm'?{ok:true,data:{approvalRef:'exact-intent'}}:
      {ok:true,data:{authorized}};
  };
  const ask=async(operation,payload,id)=>{
    f.ask(operation,payload,id);
    await settle(()=>f.frame.contentWindow.sent.some(row=>row.requestId===id));
    return f.frame.contentWindow.sent.find(row=>row.requestId===id);
  };
  assert.equal((await ask('cookieEditor.export.begin',{url:origin+'/',method:'copy'},'no-gesture')).error.code,'E_USER_GESTURE_REQUIRED');
  active=true;pauseAdmission=true;
  const oldClick=ask('cookieEditor.export.begin',{url:origin+'/',method:'copy'},'begin-regranted');
  await entered.promise;
  const changed=structuredClone(f.store.get(BROWSER_MENU_GRANTS_STORE));
  changed[tool.id].cookieAllSites.grantEpoch='grant-after-regrant';
  f.store.set(BROWSER_MENU_GRANTS_STORE,changed);
  f.changeStorage({[BROWSER_MENU_GRANTS_STORE]:{newValue:changed}});
  resume.resolve();
  assert.equal((await oldClick).error.code,'E_DOCUMENT_CHANGED','old click cannot acquire a newly granted epoch');
  for(const method of ['copy','download']){
    active=true;
    assert.equal((await ask('cookieEditor.export.begin',{url:origin+'/',method},'begin-'+method)).result.authorized,true);
    active=false;
    const operation=method==='copy'?'browser.clipboard.writeText':'browser.downloads.text';
    const payload=method==='copy'?{text:'fixture'}:{text:'fixture',filename:'cookies.json'};
    assert.equal((await ask(operation,payload,method)).ok,true);
    assert.equal(f.elements['sidebar-tool-action-review'].hidden,true,'no additional confirmation');
    assert.deepEqual(calls.at(-2).targetArgs,payload,'Host approves exact delivery bytes');
    assert.equal(calls.at(-1).approvalRef,'exact-intent');
  }
  assert.equal(copied.length,1);assert.equal(downloads.length,1);
  active=true;await ask('cookieEditor.export.begin',{url:origin+'/',method:'copy'},'begin-denied');
  authorized=false;active=false;
  assert.equal((await ask('browser.clipboard.writeText',{text:'blocked'},'host-denied')).error.code,'E_OWNER');
  assert.equal(copied.length,1,'unconfirmed Host result must not copy');
  active=true;await ask('cookieEditor.export.begin',{url:origin+'/',method:'copy'},'begin-revoked');
  authorized=true;revokeBeforeDelivery=true;active=false;
  assert.equal((await ask('browser.clipboard.writeText',{text:'revoked'},'revoked-before-sink')).error.code,'E_TOOL_CHANGED');
  assert.equal(copied.length,1,'fresh storage check stops revocation even before its UI event');
  f.store.get(BROWSER_MENU_GRANTS_STORE)[tool.id].cookieAllSites={read:true,grantEpoch:'grant-2'};
  revokeBeforeDelivery=false;
  f.store.delete(MARKET_PROVENANCE_STORE);active=true;
  assert.equal((await ask('cookieEditor.export.begin',{url:origin+'/',method:'copy'},'changed-provenance')).ok,false);
});

test('R10 canonical exports need real Side Panel click plus one-use Host authorization',async t=>{
  const tool={...sample,capabilities:[...sample.capabilities,'user.export']};
  const f=await hostFixture(t,{tool,store:new Map([[SIDEBAR_TOOL_STORE,[tool]]])});
  const old=Object.getOwnPropertyDescriptor(globalThis,'navigator'),oldLocation=globalThis.location;
  const copied=[],downloads=[],hostCalls=[];
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{clipboard:{writeText:async text=>copied.push(text)}}});
  globalThis.location={href:'chrome-extension://test/sidepanel.html?hostInstanceId=01234567-89ab-4def-8123-456789abcdef'};
  t.after(()=>{if(old)Object.defineProperty(globalThis,'navigator',old);else delete globalThis.navigator;
    globalThis.location=oldLocation;});
  f.api.downloads={download:async args=>{downloads.push(args);return 91;}};
  f.api.runtime.sendMessage=async message=>{
    hostCalls.push(message);
    if(message.operation==='browser.intent.confirm')
      return {ok:true,data:{approvalRef:'single-use-host-approval'}};
    if(message.kind==='tool'&&message.approvalRef==='single-use-host-approval')
      return {ok:true,data:{authorized:true}};
    throw new Error('Unexpected Host request');
  };
  const ask=async(operation,payload,id,click=true)=>{
    f.ask(operation,payload,id);
    await settle(()=>!f.elements['sidebar-tool-action-review'].hidden||
      f.frame.contentWindow.sent.some(row=>row.requestId===id));
    if(!f.elements['sidebar-tool-action-review'].hidden){
      assert.equal(copied.length+downloads.length,0+effects,'sandbox request must not have an effect before click');
      f.emit(f.elements['sidebar-tool-action-continue'],'click',{isTrusted:click});
    }
    await settle(()=>f.frame.contentWindow.sent.some(row=>row.requestId===id));
    return f.frame.contentWindow.sent.find(row=>row.requestId===id);
  };
  let effects=0;
  const text='x'.repeat(20000);
  assert.equal((await ask('browser.clipboard.writeText',{text},'browser-copy')).result.copied,true);
  effects++;assert.deepEqual(copied,[text]);
  assert.deepEqual((await ask('browser.downloads.text',{text:'notes',filename:'notes.md'},'browser-download')).result,{started:true});
  effects++;assert.equal(downloads.length,1);
  assert.deepEqual((await ask('browser.downloads.text',{text:'{}',filename:'notes.json'},'json-download')).result,{started:true});
  effects++;assert.equal(downloads.length,2);
  assert.equal(downloads.at(-1).url.startsWith('data:application/json;'),true);
  const invalid=await ask('browser.downloads.text',{text:'notes',filename:'../escape.txt'},'invalid-download');
  assert.equal(invalid.ok,false);assert.equal(downloads.length,2);
  const approvalsBefore=hostCalls.filter(row=>row.operation==='browser.intent.confirm').length;
  const untrusted=await ask('browser.clipboard.writeText',{text:'blocked'},'untrusted-click',false);
  assert.equal(untrusted.ok,false);assert.equal(untrusted.error.code,'E_CANCELLED');
  assert.equal(copied.length,1);assert.equal(f.elements['sidebar-tool-action-review'].hidden,true);
  assert.equal(hostCalls.filter(row=>row.operation==='browser.intent.confirm').length,approvalsBefore,
    'an untrusted click cannot mint a Host approval');
  assert.equal((await ask('browser.clipboard.writeText',{text:'recovered'},'after-untrusted')).result.copied,true);
  effects++;assert.deepEqual(copied,[text,'recovered'],'rejection settles the action and permits a new trusted request');
  // Retired operations use the ordinary 12,000-character message bound. Keep
  // these probes bounded so they reach dispatch and test the explicit rejection.
  const oldCopy=await ask('clipboard.writeText',{text:'retired'},'retired-copy');
  const oldDownload=await ask('file.download',{text:'retired',filename:'notes.md'},'retired-download');
  assert.equal(oldCopy.ok,false);assert.equal(oldDownload.ok,false);
  assert.equal(copied.length,2);assert.equal(downloads.length,2);
  assert.equal(hostCalls.filter(row=>row.operation==='browser.intent.confirm').length,4);
  const missing={...tool,capabilities:sample.capabilities};
  f.store.set(SIDEBAR_TOOL_STORE,[missing]);
  const stale=await ask('browser.clipboard.writeText',{text:'stale'},'stale-copy');
  assert.equal(stale.ok,false);assert.equal(copied.length,2);
});
const bookmarkExpected={id:'saved-bookmark',parentId:'1',index:0,title:'Saved',
  url:'https://example.com/saved',unmodifiable:null,folderType:null};
const bookmarkSaveRequests=[
  ['create',{title:'Saved',url:bookmarkExpected.url,parentId:'1',
    sourcePage:{url:bookmarkExpected.url,tabRef:'bookmark-source-tab',documentRef:'bookmark-source-document'}}],
  ['update',{id:bookmarkExpected.id,changes:{title:'Renamed'},expected:bookmarkExpected}],
  ['move',{id:bookmarkExpected.id,destination:{parentId:'2',index:1},expected:bookmarkExpected}]
];
async function bookmarkConsentFixture(t,{trusted=true,hostError=null}={}){
  const tool=await officialToolFixture('bookmark-manager');
  const release=(await officialFixtures()).catalog.apps.find(row=>row.toolId===tool.id);
  const epoch='bookmark-install-generation',hostInstanceId='01234567-89ab-4def-8123-456789abcdef';
  const store=new Map([
    [SIDEBAR_TOOL_STORE,[tool]],[SIDEBAR_TOOL_ENABLE_STORE,{[tool.id]:true}],
    [TOOL_REVOCATION_EPOCHS_STORE,{[tool.id]:epoch}],
    [MARKET_PROVENANCE_STORE,{[tool.id]:{marketId:release.id,version:release.version,sha256:release.sha256}}]
  ]);
  const oldLocation=globalThis.location;
  globalThis.location={href:'chrome-extension://test/sidepanel.html?hostInstanceId='+hostInstanceId};
  t.after(()=>{globalThis.location=oldLocation;});
  const mounts=[],calls=[],writes=[];
  const f=await hostFixture(t,{tool,store,startTool:!trusted,
    trustedBookmarkPilot:trusted?{enabled:true,componentVersion:TRUSTED_BOOKMARK_COMPONENT_VERSION,
      mount({sdk}){mounts.push(sdk);return ()=>{};}}:null});
  f.api.runtime.sendMessage=async message=>{
    if(message.protocol===ANALYTICS_PROTOCOL){
      assert.deepEqual(message,{protocol:ANALYTICS_PROTOCOL,kind:'event.host_report',
        event:'tool.opened',toolId:tool.id,channel:'sidepanel'});
      return {ok:true,data:{}};
    }
    calls.push(structuredClone(message));
    if(message.kind==='host'&&message.operation==='browser.intent.confirm')
      return {ok:true,data:{approvalRef:'bookmark-approval-'+calls.length}};
    assert.equal(message.kind,'tool');
    if(hostError)return {ok:false,error:{code:hostError,message:'Bookmark permission revoked'}};
    writes.push(structuredClone(message));
    return {ok:true,data:message.operation.startsWith('browser.bookmarks.remove')
      ?{removed:true}:{...bookmarkExpected,id:message.args.id||bookmarkExpected.id}};
  };
  if(trusted){
    f.host.openTool(tool.id);await settle(()=>mounts.length===1);
    assert.equal(f.elements['sidebar-tool-frame'].dataset.bookmarkTrusted,'true');
    assert.equal(f.elements['sidebar-tool-frame'].children.length,0,'the SDK comes from admitted trusted UI');
  }
  return {...f,tool,epoch,hostInstanceId,mounts,calls,writes,
    sdk:mounts[0],packageHash:await sidebarToolPackageHash(tool)};
}
function assertBookmarkIntent(f,index,name,args){
  const [approval,request]=f.calls.slice(index*2,index*2+2);
  const identity={toolId:f.tool.id,toolVersion:f.tool.version,installEpoch:f.epoch,
    packageHash:f.packageHash,toolInstance:request?.toolInstance,hostInstanceId:f.hostInstanceId};
  assert.ok(identity.toolInstance,'each intent binds the mounted tool instance');
  assert.deepEqual(approval,{protocol:BROWSER_HOST_PROTOCOL,kind:'host',
    operation:'browser.intent.confirm',...identity,targetOperation:'browser.bookmarks.'+name,targetArgs:args});
  assert.deepEqual(request,{protocol:BROWSER_HOST_PROTOCOL,kind:'tool',
    operation:'browser.bookmarks.'+name,...identity,args,approvalRef:'bookmark-approval-'+(index*2+1)});
}

test('R3.4 admitted Bookmark Save omits the second button but mints an exact Host intent for every write',async t=>{
  const f=await bookmarkConsentFixture(t);
  const requests=[...bookmarkSaveRequests,bookmarkSaveRequests[0]];
  for(const [index,[name,args]] of requests.entries()){
    const pending=f.sdk.bookmarks[name](args);
    await settle(()=>f.calls.length>index*2||!f.elements['sidebar-tool-action-review'].hidden);
    assert.equal(f.elements['sidebar-tool-action-review'].hidden,true,name+' must not ask to confirm Save again');
    await pending;
    assert.equal(f.calls.length,(index+1)*2,'each write has exactly one confirmation and one dispatch');
    assertBookmarkIntent(f,index,name,args);
  }
  assert.equal(f.writes.length,4);
  assert.equal(new Set(f.writes.map(row=>row.approvalRef)).size,4,'even an identical repeated write needs a fresh ticket');
});

test('R3.4 sandbox Bookmark writes still need a trusted review click even with official package identity',async t=>{
  const f=await bookmarkConsentFixture(t,{trusted:false});
  for(const [index,[name,args]] of bookmarkSaveRequests.entries()){
    for(const trustedClick of [false,true]){
      const id=name+'-'+trustedClick,before=f.calls.length;
      f.ask('browser.bookmarks.'+name,args,id);
      await settle(()=>!f.elements['sidebar-tool-action-review'].hidden||
        f.frame.contentWindow.sent.some(row=>row.requestId===id));
      assert.equal(f.elements['sidebar-tool-action-review'].hidden,false,'sandbox requests require review');
      assert.equal(f.calls.length,before,'no approval or write before the real host click');
      f.emit(f.elements['sidebar-tool-action-continue'],'click',{isTrusted:trustedClick});
      await settle(()=>f.frame.contentWindow.sent.some(row=>row.requestId===id));
      const response=f.frame.contentWindow.sent.find(row=>row.requestId===id);
      assert.equal(response.ok,trustedClick);
      if(trustedClick)assertBookmarkIntent(f,index,name,args);
      else{
        assert.equal(response.error.code,'E_CANCELLED');
        assert.equal(f.calls.length,before,'synthetic review clicks cannot mint tickets');
      }
    }
  }
  assert.equal(f.writes.length,3);
});

test('R3.4 admitted Bookmark deletion still waits for its separate Host review',async t=>{
  const f=await bookmarkConsentFixture(t);
  const requests=[['remove',{id:bookmarkExpected.id,expected:bookmarkExpected}],
    ['removeTree',{id:'saved-folder',ticket:'bookmark-delete-tree-ticket'}]];
  for(const [index,[name,args]] of requests.entries()){
    const pending=f.sdk.bookmarks[name](args);
    await settle(()=>!f.elements['sidebar-tool-action-review'].hidden||f.calls.length>index*2);
    assert.equal(f.elements['sidebar-tool-action-review'].hidden,false,name+' must retain destructive review');
    assert.equal(f.calls.length,index*2,'deletion has no intent or dispatch before review');
    f.emit(f.elements['sidebar-tool-action-continue'],'click',{isTrusted:true});
    assert.deepEqual(await pending,{removed:true});
    assertBookmarkIntent(f,index,name,args);
  }
  assert.equal(f.writes.length,2);
});

test('R3.4 stale Bookmark SDK instances cannot use the current trusted mount to save',async t=>{
  const f=await bookmarkConsentFixture(t),oldSDK=f.sdk;
  f.host.closeTool();f.host.openTool(f.tool.id);
  await settle(()=>f.mounts.length===2);
  const [name,args]=bookmarkSaveRequests[0];
  await assert.rejects(oldSDK.bookmarks[name](args),{code:'E_TOOL_CHANGED'});
  assert.equal(f.calls.length,0,'a closed generation cannot mint an intent after reopening');
  await f.mounts[1].bookmarks[name](args);
  assertBookmarkIntent(f,0,name,args);
  assert.equal(f.writes.length,1);
});

test('R3.4 Bookmark saves recheck install generation, enablement and provenance before requesting approval',async t=>{
  const changes={
    epoch:f=>f.store.set(TOOL_REVOCATION_EPOCHS_STORE,{[f.tool.id]:'new-install-generation'}),
    disabled:f=>f.store.set(SIDEBAR_TOOL_ENABLE_STORE,{[f.tool.id]:false}),
    provenance:f=>f.store.delete(MARKET_PROVENANCE_STORE),
    uninstall:f=>f.store.set(SIDEBAR_TOOL_STORE,[])
  };
  for(const [reason,change] of Object.entries(changes))await t.test(reason,async t=>{
    const f=await bookmarkConsentFixture(t);change(f);
    for(const [name,args] of bookmarkSaveRequests)
      await assert.rejects(f.sdk.bookmarks[name](args),{code:'E_TOOL_CHANGED'});
    assert.equal(f.calls.length,0,'invalid admission cannot mint a ticket or dispatch a write');
    assert.equal(f.elements['sidebar-tool-action-review'].hidden,true);
  });
});

test('R3.4 trusted Bookmark Save propagates Host grant revocation without retrying',async t=>{
  const f=await bookmarkConsentFixture(t,{hostError:'E_GRANT_REVOKED'});
  const [name,args]=bookmarkSaveRequests[0];
  await assert.rejects(f.sdk.bookmarks[name](args),{code:'E_GRANT_REVOKED'});
  assert.equal(f.calls.length,2,'the denied write is dispatched once and never replayed');
  assertBookmarkIntent(f,0,name,args);
  assert.equal(f.writes.length,0);
});

test('R1.3 frontend status and list reflect callable export services and include mounted package identity',async t=>{
  const tool={...sample,capabilities:[...sample.capabilities,'user.export']};
  const f=await hostFixture(t,{tool,store:new Map([[SIDEBAR_TOOL_STORE,[tool]]])});
  const oldNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator'),oldLocation=globalThis.location;
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{}});
  globalThis.location={href:'chrome-extension://test/sidepanel.html?hostInstanceId=01234567-89ab-4def-8123-456789abcdef'};
  t.after(()=>{if(oldNavigator)Object.defineProperty(globalThis,'navigator',oldNavigator);else delete globalThis.navigator;globalThis.location=oldLocation;});
  f.api.downloads={download:async()=>91};
  const calls=[];
  f.api.runtime.sendMessage=async message=>{
    calls.push(message);assert.match(message.packageHash,/^[a-f0-9]{64}$/);
    if(message.operation==='browser.capabilities.list')return {ok:true,data:[
      {operation:'browser.clipboard.writeText',implementation:'IMPLEMENTED',status:{exposure:'allowed',callableNow:false,reasonCode:'E_FRONTEND_CONTEXT_REQUIRED'}},
      {operation:'browser.downloads.text',implementation:'IMPLEMENTED',status:{exposure:'allowed',callableNow:false,reasonCode:'E_FRONTEND_CONTEXT_REQUIRED'}}]};
    return {ok:true,data:{operation:message.args.operation,implementation:'implemented',authorization:{tool:'granted'},
      callableNow:false,reasonCode:'E_FRONTEND_CONTEXT_REQUIRED'}};
  };
  const ask=async(operation,payload,id)=>{
    f.ask(operation,payload,id);await settle(()=>f.frame.contentWindow.sent.some(row=>row.requestId===id));
    const response=f.frame.contentWindow.sent.find(row=>row.requestId===id);assert.equal(response.ok,true);return response.result;
  };
  assert.equal((await ask('browser.capabilities.getStatus',{operation:'browser.clipboard.writeText'},'no-clipboard')).callableNow,false);
  assert.equal((await ask('browser.capabilities.getStatus',{operation:'browser.downloads.text'},'downloads')).callableNow,true);
  globalThis.navigator.clipboard={writeText:async()=>{}};
  assert.equal((await ask('browser.capabilities.getStatus',{operation:'browser.clipboard.writeText'},'clipboard')).callableNow,true);
  assert((await ask('browser.capabilities.list',{},'list')).every(row=>row.status.callableNow));
  assert.equal(new Set(calls.map(row=>row.packageHash)).size,1);
  // The native API function existing in the Side Panel does not prove Chrome
  // permission or installed-tool authority. Never overrule a Host denial.
  f.api.runtime.sendMessage=async message=>({ok:true,data:{
    operation:message.args.operation,implementation:'implemented',
    authorization:{tool:'granted',browser:'missing'},callableNow:false,
    reasonCode:'E_CHROME_PERMISSION_REQUIRED'
  }});
  assert.equal((await ask('browser.capabilities.getStatus',
    {operation:'browser.downloads.text'},'download-permission-denied')).callableNow,false);
});

test('R1.3 final sandbox delivery rejects selection that expires during frontend authority recheck',async t=>{
  const tool=JSON.parse(await readFile(new URL('../../examples/sidebar-tools/browser-sdk-r13/selection-notes.opendesk-tool.json',import.meta.url),'utf8'));
  const originalNow=Date.now,oldLocation=globalThis.location;let now=originalNow(),returned=false;
  Date.now=()=>now;globalThis.location={href:'chrome-extension://test/sidepanel.html?hostInstanceId=01234567-89ab-4def-8123-456789abcdef'};
  t.after(()=>{Date.now=originalNow;globalThis.location=oldLocation;});
  const f=await hostFixture(t,{tool,store:new Map([[SIDEBAR_TOOL_STORE,[tool]]]),getHook:async key=>{
    if(returned&&key===TOOL_REVOCATION_EPOCHS_STORE)now+=11;
  }});
  f.api.runtime.sendMessage=async()=>{returned=true;return {ok:true,data:{selection:'private',expiresAt:now+10}};};
  f.ask('browser.launch.consume',{},'expired-delivery');
  await settle(()=>f.frame.contentWindow.sent.some(row=>row.requestId==='expired-delivery'));
  const response=f.frame.contentWindow.sent.find(row=>row.requestId==='expired-delivery');
  assert.equal(response.ok,false);assert.equal(response.error.code,'E_LAUNCH_EXPIRED');
  assert.equal(response.result,undefined);
});

test('Focus sandbox and trusted settings use the fixed product adapter through the existing host',async t=>{
  const previous=globalThis.__opendeskStayFocusTrustedUI;let runControl;
  globalThis.__opendeskStayFocusTrustedUI={id:FOCUS_ID,capability:FOCUS_CAPABILITY,operations:FOCUS_OPERATIONS,
    request:requestStayFocusOperation,runTrustedOperation:runTrustedStayFocusOperation,
    probe:async()=>({serviceReady:true}),
    createPermissionControls({runOperation}){runControl=runOperation;return {render(){},dispose(){}};}};
  t.after(()=>{if(previous===undefined)delete globalThis.__opendeskStayFocusTrustedUI;
    else globalThis.__opendeskStayFocusTrustedUI=previous;});
  const tool={...sample,id:FOCUS_ID,capabilities:[FOCUS_CAPABILITY]},store=new Map([[SIDEBAR_TOOL_STORE,[tool]]]);
  const f=await hostFixture(t,{tool,store}),calls=[];
  f.api.runtime.sendMessage=async message=>{calls.push(message);return {ok:true,data:{state:'confirmed'}};};
  f.ask('focus.status',{},'focus-status');
  await settle(()=>f.frame.contentWindow.sent.some(row=>row.requestId==='focus-status'));
  assert.equal(f.frame.contentWindow.sent.find(row=>row.requestId==='focus-status').ok,true);
  assert.equal(calls[0].operation,'focus.status');
  f.ask('focus.disable',{},'sandbox-disable');
  await settle(()=>f.frame.contentWindow.sent.some(row=>row.requestId==='sandbox-disable'));
  assert.equal(f.frame.contentWindow.sent.find(row=>row.requestId==='sandbox-disable').error.code,'E_FOCUS_TRUSTED_CLICK');
  assert.equal(calls.length,1);
  await assert.rejects(runControl('focus.disable',{}, {isTrusted:false}),{code:'E_FOCUS_TRUSTED_CLICK'});
  assert.deepEqual(await runControl('focus.disable',{}, {isTrusted:true}),{state:'confirmed'});
  assert.equal(calls.length,2);assert.equal(calls[1].operation,'focus.disable');
  const sent=deferred(),reply=deferred();
  f.api.runtime.sendMessage=async message=>{calls.push(message);sent.resolve();return reply.promise;};
  const pending=runControl('focus.disable',{}, {isTrusted:true});await sent.promise;
  f.host.closeTool();reply.resolve({ok:true,data:{state:'confirmed'}});
  await assert.rejects(pending,{code:'E_OUTCOME_UNKNOWN'});
  assert.equal(calls.length,3,'retiring the host after send must not replay a native effect');
});

test('R3.1 Focus cannot open when the installed browser lacks its trusted runtime',async t=>{
  const previous=globalThis.__opendeskStayFocusTrustedUI;delete globalThis.__opendeskStayFocusTrustedUI;
  t.after(()=>{if(previous!==undefined)globalThis.__opendeskStayFocusTrustedUI=previous;});
  const tool={...sample,id:FOCUS_ID,capabilities:[FOCUS_CAPABILITY]},store=new Map([[SIDEBAR_TOOL_STORE,[tool]]]);
  const f=await hostFixture(t,{tool,store});
  assert.equal(f.frame,undefined,'unsupported Focus cannot launch even a sandbox');
  assert.equal(f.elements['sidebar-tool-frame'].children.length,0);
  assert.match(f.elements['sidebar-tool-status'].textContent,/缺少 Stay Focus.*请升级扩展/);
  assert.deepEqual(store.get(SIDEBAR_TOOL_STORE),[tool],'failed runtime gate preserves user install bytes');
});

test('R3.1 Focus first-use native controls share a screen with its live sandbox',async t=>{
  const previous=globalThis.__opendeskStayFocusTrustedUI;
  globalThis.__opendeskStayFocusTrustedUI={id:FOCUS_ID,capability:FOCUS_CAPABILITY,
    operations:FOCUS_OPERATIONS,request:requestStayFocusOperation,
    runTrustedOperation:runTrustedStayFocusOperation,
    probe:async()=>({serviceReady:true}),
    createPermissionControls(){return {render(){},dispose(){}};}};
  t.after(()=>{if(previous===undefined)delete globalThis.__opendeskStayFocusTrustedUI;
    else globalThis.__opendeskStayFocusTrustedUI=previous;});
  const tool={...sample,id:FOCUS_ID,capabilities:[FOCUS_CAPABILITY]},store=new Map([[SIDEBAR_TOOL_STORE,[tool]]]);
  const f=await hostFixture(t,{tool,store});
  assert.equal(f.elements['sidebar-tool-settings-view'].hidden,false);
  assert.equal(f.elements['sidebar-tool-frame'].hidden,false,'opening native setup must not hide Focus statistics');
  assert.equal(f.elements['sidebar-tool-display'].attributes['data-trusted-tool-inline'],'true');
  assert.equal(f.elements['sidebar-tool-frame'].children.length,1);
});

test('Focus settings capture their instance epoch and reject epoch-only rotation before/after send',async t=>{
  for(const phase of ['before-send','after-send'])await t.test(phase,async t=>{
    const previous=globalThis.__opendeskStayFocusTrustedUI;
    let runControl,captured;
    const entered=deferred(),release=deferred();
    globalThis.__opendeskStayFocusTrustedUI={id:FOCUS_ID,capability:FOCUS_CAPABILITY,operations:FOCUS_OPERATIONS,
      request:requestStayFocusOperation,probe:async()=>({serviceReady:true}),
      async runTrustedOperation(options){
        captured=options;options.assertCurrent('initial');entered.resolve();
        await release.promise;options.assertCurrent(phase);return {state:'confirmed'};
      },
      createPermissionControls({runOperation}){runControl=runOperation;return {render(){},dispose(){}};}};
    t.after(()=>{release.resolve();if(previous===undefined)delete globalThis.__opendeskStayFocusTrustedUI;
      else globalThis.__opendeskStayFocusTrustedUI=previous;});
    const tool={...sample,id:FOCUS_ID,capabilities:[FOCUS_CAPABILITY]};
    const store=new Map([[SIDEBAR_TOOL_STORE,[tool]],[TOOL_REVOCATION_EPOCHS_STORE,{[tool.id]:'epoch-a'}]]);
    const f=await hostFixture(t,{tool,store});
    const pending=runControl('focus.disable',{}, {isTrusted:true});await entered.promise;
    assert.equal(captured.revocationEpoch,'epoch-a','the helper receives the admitted instance epoch');
    store.set(TOOL_REVOCATION_EPOCHS_STORE,{[tool.id]:'epoch-b'});
    f.changeStorage({[TOOL_REVOCATION_EPOCHS_STORE]:{newValue:{[tool.id]:'epoch-b'}}});
    const rejected=assert.rejects(pending,{code:'E_TOOL_CHANGED'});release.resolve();await rejected;
    assert.deepEqual(store.get(SIDEBAR_TOOL_STORE),[tool],'only the epoch changed; package bytes are identical');
    assert.equal(captured.revocationEpoch,'epoch-a','a retired instance cannot adopt the fresh epoch');
    await assert.rejects(runControl('focus.disable',{}, {isTrusted:true}),{code:'E_TOOL_CHANGED'},
      'a callback retained after revocation also fails its initial check');
    f.host.dispose();
    await assert.rejects(runControl('focus.disable',{}, {isTrusted:true}),{code:'E_TOOL_CHANGED'},
      'a disposed controller cannot authorize callbacks retained by detached controls');
  });
});

test('Focus response keeps its acknowledged result when only an unrelated UI busy flag changes',async t=>{
  const previous=globalThis.__opendeskStayFocusTrustedUI;let runControl;
  globalThis.__opendeskStayFocusTrustedUI={id:FOCUS_ID,capability:FOCUS_CAPABILITY,operations:FOCUS_OPERATIONS,
    request:requestStayFocusOperation,runTrustedOperation:runTrustedStayFocusOperation,
    probe:async()=>({serviceReady:true}),
    createPermissionControls({runOperation}){runControl=runOperation;return {render(){},dispose(){}};}};
  t.after(()=>{if(previous===undefined)delete globalThis.__opendeskStayFocusTrustedUI;
    else globalThis.__opendeskStayFocusTrustedUI=previous;});
  const tool={...sample,id:FOCUS_ID,capabilities:[FOCUS_CAPABILITY]},store=new Map([[SIDEBAR_TOOL_STORE,[tool]]]);
  const release=deferred(),baseLocks=sharedLocks();let hold=false;
  const locks={request(name,work){return hold?release.promise.then(()=>baseLocks.request(name,work)):baseLocks.request(name,work);}};
  const f=await hostFixture(t,{tool,store,locks}),sent=deferred(),reply=deferred();
  f.api.permissions={async contains(){return false;}};
  f.api.runtime.sendMessage=async()=>{sent.resolve();return reply.promise;};
  const pending=runControl('focus.disable',{}, {isTrusted:true});await sent.promise;
  // Hold the existing enable/disable transaction before it changes authority.
  hold=true;f.emit(f.elements['sidebar-tool-enable'],'click',{isTrusted:true});
  await settle(()=>f.elements['sidebar-tool-enable'].disabled);
  reply.resolve({ok:true,data:{state:'confirmed'}});
  assert.deepEqual(await pending,{state:'confirmed'});
  release.resolve();
  await settle(()=>!f.elements['sidebar-tool-enable'].disabled);
});

test('R3.2 a sidecar alone cannot install Focus when its worker probe fails',async t=>{
  const previous=globalThis.__opendeskStayFocusTrustedUI;let probes=0;
  globalThis.__opendeskStayFocusTrustedUI={id:FOCUS_ID,capability:FOCUS_CAPABILITY,
    operations:FOCUS_OPERATIONS,request:requestStayFocusOperation,
    runTrustedOperation:runTrustedStayFocusOperation,
    probe:async()=>{probes++;throw Object.assign(new Error('Stay Focus 后台无响应'),
      {code:'E_TOOL_RUNTIME_UNAVAILABLE'});},
    createPermissionControls:createStayFocusPermissionControls};
  t.after(()=>{if(previous===undefined)delete globalThis.__opendeskStayFocusTrustedUI;
    else globalThis.__opendeskStayFocusTrustedUI=previous;});
  const tool={...sample,id:FOCUS_ID,capabilities:[FOCUS_CAPABILITY]};
  const f=await hostFixture(t,{store:new Map(),startTool:false});
  f.emit(f.elements['sidebar-tool-import-trigger'],'click');
  const serialized=JSON.stringify(tool);
  f.selectFile({size:serialized.length,text:async()=>serialized});
  await settle(()=>!f.elements['sidebar-tool-preview'].hidden);
  f.emit(f.elements['sidebar-tool-install'],'click');
  await settle(()=>probes===1);
  await settle(()=>f.elements['sidebar-tool-install'].disabled===false);
  assert.equal(f.store.has(SIDEBAR_TOOL_STORE),false,'failed worker preflight must not install');
  assert.match(f.elements['sidebar-tool-status'].textContent,/后台无响应/);
});
