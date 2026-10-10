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
  focus(){this.focused=true;if(this.ownerDocument)this.ownerDocument.activeElement=this;}
}
const pause=()=>new Promise(resolve=>setImmediate(resolve));
const sample={format:SIDEBAR_TOOL_FORMAT,id:'quick-notes',version:'1.0.0',title:'网页笔记',
  description:'demo',capabilities:['storage.local','currentPage.read','tasks.open'],
  html:'<main>Hello</main>',css:'main {color:navy}',js:'void 0;'};

test('trusted tool host installs only by explicit click, scopes messages and removes storage',async()=>{
  const oldWindow=globalThis.window,oldConfirm=globalThis.confirm;
  const win=new Node('window');globalThis.window=win;globalThis.confirm=()=>true;
  const ids=['sidebar-tool-list','sidebar-tool-list-view','sidebar-tool-empty','sidebar-tool-back','sidebar-tool-display','sidebar-tool-frame','sidebar-tool-status',
    'sidebar-tool-file','sidebar-tool-install','sidebar-tool-remove','sidebar-tool-title',
    'sidebar-tool-import-trigger','sidebar-tool-import','sidebar-tool-import-close','sidebar-tool-preview',
    'sidebar-tool-preview-title','sidebar-tool-preview-version','sidebar-tool-preview-description',
    'sidebar-tool-preview-capabilities','sidebar-tool-preview-file','sidebar-tool-file-error',
    'sidebar-tool-update','sidebar-tool-update-versions','sidebar-tool-update-capabilities','sidebar-tool-update-warning'];
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
    await pause();host.setVisible(true);
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
async function hostFixture(t,{store=new Map([[SIDEBAR_TOOL_STORE,[sample]]]),locks=sharedLocks(),getHook,setHook,startTool=true,snapshotBeforeGet=false,target}={}){
  const oldWindow=globalThis.window,oldConfirm=globalThis.confirm;
  const win=new Node('window');globalThis.window=win;globalThis.confirm=()=>true;
  const ids=['sidebar-tool-list','sidebar-tool-list-view','sidebar-tool-empty','sidebar-tool-back','sidebar-tool-display','sidebar-tool-frame','sidebar-tool-status',
    'sidebar-tool-file','sidebar-tool-install','sidebar-tool-remove','sidebar-tool-title',
    'sidebar-tool-import-trigger','sidebar-tool-import','sidebar-tool-import-close','sidebar-tool-preview',
    'sidebar-tool-preview-title','sidebar-tool-preview-version','sidebar-tool-preview-description',
    'sidebar-tool-preview-capabilities','sidebar-tool-preview-file','sidebar-tool-file-error',
    'sidebar-tool-update','sidebar-tool-update-versions','sidebar-tool-update-capabilities','sidebar-tool-update-warning'];
  const elements=Object.fromEntries(ids.map(id=>[id,new Node()]));
  const doc={documentElement:{dataset:{}},getElementById:id=>elements[id],querySelector:()=>new Node(),
    createElement:tag=>{const node=new Node(tag);node.ownerDocument=doc;return node;}};
  for(const node of Object.values(elements))node.ownerDocument=doc;
  let focused=0;
  const changed=new Node();
  const api={runtime:{getURL:p=>'chrome-extension://test/'+p},storage:{onChanged:{
    addListener:fn=>changed.addEventListener('change',fn),removeListener:fn=>changed.removeEventListener('change',fn)
  },local:{
    async get(key){const snapshot=snapshotBeforeGet?structuredClone(store.get(key)):undefined;
      await getHook?.(key);return {[key]:snapshotBeforeGet?snapshot:structuredClone(store.get(key))};},
    async set(value){await setHook?.(value);for(const [key,row] of Object.entries(value))store.set(key,structuredClone(row));},
    async remove(key){store.delete(key);}
  }}};
  const host=createSidebarTools({api,doc,currentPageTarget:target,lockManager:locks,taskWorkbench:{focusInstalledTask(){focused++;return true;}}});
  t.after(()=>{host.dispose();globalThis.window=oldWindow;globalThis.confirm=oldConfirm;});
  await pause();host.setVisible(true);
  assert.equal(elements['sidebar-tool-frame'].children.length,0,'opening Tools never starts saved packages');
  if(startTool)host.openTool(sample.id);
  const frame=elements['sidebar-tool-frame'].children[0];
  frame?.onload();
  const loaded=frame?.contentWindow.sent[0];
  const ask=(operation,payload={},id='1')=>{
    assert.ok(frame,'message actions require an explicitly opened tool');
    win.emit('message',{origin:'null',source:frame.contentWindow,
      data:{protocol:loaded.protocol,toolId:sample.id,instance:loaded.instance,kind:'request',requestId:id,operation,payload}});
  };
  return {host,ask,frame,elements,store,api,change(rows){
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

test('R14 list uninstall requires consent but never mounts or runs untrusted tool code',async t=>{
  const key=sidebarToolStorageKey(sample.id);
  const store=new Map([[SIDEBAR_TOOL_STORE,[sample]],[key,{note:'private'}]]);
  const f=await hostFixture(t,{store,startTool:false});
  assert.equal(f.elements['sidebar-tool-list'].children.length,1);
  const item=f.elements['sidebar-tool-list'].children[0];
  assert.equal(item.className,'sidebar-tool-row');
  assert.equal(item.children[0].tag,'button');
  const deleteButton=item.children[1];
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
  const f=await hostFixture(t,{store,startTool:false,snapshotBeforeGet:true,
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

test('R14.1 fresh reinstall deletes orphaned private data without running the tool',async t=>{
  const key=sidebarToolStorageKey(sample.id);
  const store=new Map([[SIDEBAR_TOOL_STORE,[]],[key,{privateNote:'left by interrupted uninstall'}]]);
  const f=await hostFixture(t,{store,startTool:false});
  f.elements['sidebar-tool-import-trigger'].emit('click');
  const text=JSON.stringify(sample);
  f.elements['sidebar-tool-file'].files=[{name:'quick-notes.json',size:text.length,text:async()=>text}];
  f.elements['sidebar-tool-file'].emit('change');await pause();await pause();
  f.elements['sidebar-tool-install'].emit('click');await pause();await pause();await pause();
  assert.equal(store.has(key),false,'a new installation must never inherit deleted user data');
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
  f.elements['sidebar-tool-list'].children[0].children[1].emit('click');
  await pause();await pause();await pause();
  assert.equal(f.elements['sidebar-tool-list'].children[0].dataset.sidebarToolId,second.id);
  assert.equal(f.elements['sidebar-tool-list'].children[0].children[0].focused,true,
    'list uninstall should move focus to the next installed tool');
  f.elements['sidebar-tool-list'].children[0].children[1].emit('click');
  await pause();await pause();await pause();
  assert.equal(f.elements['sidebar-tool-list'].children.length,0);
  assert.equal(f.elements['sidebar-tool-import-trigger'].focused,true,
    'last-tool uninstall should return focus to Import');
});

test('installed tool opens a fixed full-page route without starting sidebar code',async t=>{
  const f=await hostFixture(t,{startTool:false});
  const opened=[];f.api.tabs={create:async options=>{opened.push(options.url);}};
  const row=f.elements['sidebar-tool-list'].children[0];
  assert.equal(row.children[2].attributes.get('aria-label'),'在新标签页打开「网页笔记」');
  assert.equal(f.elements['sidebar-tool-frame'].children.length,0);
  row.children[2].emit('click');
  await pause();await pause();
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
  frame.onload();const loaded=frame.contentWindow.sent[0];
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
