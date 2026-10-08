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
    'sidebar-tool-file','sidebar-tool-install','sidebar-tool-remove','sidebar-tool-title'];
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
    host=createSidebarTools({api,doc,currentPageTarget:target,taskWorkbench:workbench});
    await pause();
    assert.equal(store.has(SIDEBAR_TOOL_STORE),false,'loading a tool list must not install anything');
    const file={size:JSON.stringify(sample).length,text:async()=>JSON.stringify(sample)};
    elements['sidebar-tool-file'].files=[file];
    elements['sidebar-tool-file'].emit('change');
    await pause();await pause();
    assert.equal(store.has(SIDEBAR_TOOL_STORE),false,'choosing JSON alone cannot install');
    elements['sidebar-tool-install'].emit('click');
    await pause();await pause();
    assert.equal(store.get(SIDEBAR_TOOL_STORE).length,1);
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
