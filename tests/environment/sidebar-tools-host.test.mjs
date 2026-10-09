import test from 'node:test';
import assert from 'node:assert/strict';
import {createSidebarTools} from '../../src/ui/sidebar-tools.js';
import {SIDEBAR_TOOL_FORMAT,SIDEBAR_TOOL_STORE,sidebarToolStorageKey} from '../../src/ui/sidebar-tools/package.js';

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
}
const pause=()=>new Promise(resolve=>setImmediate(resolve));
const sample={format:SIDEBAR_TOOL_FORMAT,id:'quick-notes',version:'1.0.0',title:'网页笔记',
  description:'demo',capabilities:['storage.local','currentPage.read','tasks.open'],
  html:'<main>Hello</main>',css:'main {color:navy}',js:'void 0;'};

test('trusted tool host installs only by explicit click, scopes messages and removes storage',async()=>{
  const oldWindow=globalThis.window,oldConfirm=globalThis.confirm;
  const win=new Node('window');globalThis.window=win;globalThis.confirm=()=>true;
  const ids=['sidebar-tool-tabs','sidebar-tool-display','sidebar-tool-frame','sidebar-tool-status',
    'sidebar-tool-file','sidebar-tool-install','sidebar-tool-remove','sidebar-tool-title',
    'sidebar-tool-import-trigger','sidebar-tool-import','sidebar-tool-import-close','sidebar-tool-preview',
    'sidebar-tool-preview-title','sidebar-tool-preview-version','sidebar-tool-preview-description',
    'sidebar-tool-preview-capabilities','sidebar-tool-preview-file'];
  const elements=Object.fromEntries(ids.map(id=>[id,new Node()]));
  const taskSurface=new Node();
  const doc={documentElement:{dataset:{}},getElementById(id){return elements[id];},
    querySelector(selector){assert.equal(selector,'#workbench-tasks .tasks-surface');return taskSurface;},
    createElement(tag){return new Node(tag);}};
  const store=new Map();
  const api={runtime:{getURL:path=>'chrome-extension://test/'+path},
    storage:{local:{
      async get(key){return {[key]:store.get(key)};},
      async set(value){for(const [key,row] of Object.entries(value))store.set(key,row);},
      async remove(key){store.delete(key);}
    }}};
  const target={snapshot:{status:'available',url:'https://example.com/a',title:'Example'}};
  let taskOpened='';
  const workbench={focusInstalledTask(id){taskOpened=id;return true;}};
  let host;
  try{
    host=createSidebarTools({api,doc,currentPageTarget:target,taskWorkbench:workbench,
      lockManager:{request:(_name,work)=>Promise.resolve().then(work)}});
    await pause();
    assert.equal(store.has(SIDEBAR_TOOL_STORE),false,'loading a tool list must not install anything');
    assert.equal(elements['sidebar-tool-tabs'].hidden,true,'empty tools must not render a second Task tab');
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
    assert.equal(elements['sidebar-tool-tabs'].hidden,false,'installed tools expose their switcher');
    assert.equal(elements['sidebar-tool-frame'].children.length,0,'install does not execute JS');
    host.openTool(sample.id);
    const frame=elements['sidebar-tool-frame'].children[0];
    assert.equal(frame.tag,'iframe');
    assert.equal(frame.src,'chrome-extension://test/sidebar-tools/sandbox.html');
    frame.onload();
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
function sharedLocks(){
  const queues=new Map();
  return {request(name,work){const previous=queues.get(name)||Promise.resolve();
    const next=previous.catch(()=>{}).then(work);queues.set(name,next);
    next.finally(()=>{if(queues.get(name)===next)queues.delete(name);}).catch(()=>{});
    return next;}};
}
async function hostFixture(t,{store=new Map([[SIDEBAR_TOOL_STORE,[sample]]]),locks=sharedLocks(),getHook,setHook}={}){
  const oldWindow=globalThis.window,oldConfirm=globalThis.confirm;
  const win=new Node('window');globalThis.window=win;globalThis.confirm=()=>true;
  const ids=['sidebar-tool-tabs','sidebar-tool-display','sidebar-tool-frame','sidebar-tool-status',
    'sidebar-tool-file','sidebar-tool-install','sidebar-tool-remove','sidebar-tool-title',
    'sidebar-tool-import-trigger','sidebar-tool-import','sidebar-tool-import-close','sidebar-tool-preview',
    'sidebar-tool-preview-title','sidebar-tool-preview-version','sidebar-tool-preview-description',
    'sidebar-tool-preview-capabilities','sidebar-tool-preview-file'];
  const elements=Object.fromEntries(ids.map(id=>[id,new Node()]));
  const doc={documentElement:{dataset:{}},getElementById:id=>elements[id],querySelector:()=>new Node(),createElement:tag=>new Node(tag)};
  let focused=0;
  const changed=new Node();
  const api={runtime:{getURL:p=>'chrome-extension://test/'+p},storage:{onChanged:{
    addListener:fn=>changed.addEventListener('change',fn),removeListener:fn=>changed.removeEventListener('change',fn)
  },local:{
    async get(key){await getHook?.(key);return {[key]:structuredClone(store.get(key))};},
    async set(value){await setHook?.(value);for(const [key,row] of Object.entries(value))store.set(key,structuredClone(row));},
    async remove(key){store.delete(key);}
  }}};
  const host=createSidebarTools({api,doc,lockManager:locks,taskWorkbench:{focusInstalledTask(){focused++;return true;}}});
  t.after(()=>{host.dispose();globalThis.window=oldWindow;globalThis.confirm=oldConfirm;});
  await pause();host.openTool(sample.id);
  const frame=elements['sidebar-tool-frame'].children[0];frame.onload();
  const loaded=frame.contentWindow.sent[0];
  const ask=(operation,payload={},id='1')=>win.emit('message',{origin:'null',source:frame.contentWindow,
    data:{protocol:loaded.protocol,toolId:sample.id,instance:loaded.instance,kind:'request',requestId:id,operation,payload}});
  return {host,ask,frame,elements,store,change(rows){
    for(const fn of changed.listeners.get('change')||[])fn({[SIDEBAR_TOOL_STORE]:{newValue:rows}},'local');
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
