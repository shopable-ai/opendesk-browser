import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {build} from 'esbuild';
import {createSidebarToolsView} from '../../src/ui/sidebar-tools-view.js';

const entry=new URL('../../src/ui/tool-shell.js',import.meta.url).pathname;
const source=await readFile(entry,'utf8');
const imports=new Map([...source.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g)].map(([,names,path])=>[path,names.split(',').map(x=>x.trim())]));
const bundled=await build({entryPoints:[entry],bundle:true,write:false,format:'iife',globalName:'ToolShell',platform:'browser',plugins:[{name:'lifecycle-dependencies',setup(b){
  b.onResolve({filter:/.*/},args=>imports.has(args.path)?{path:args.path,namespace:'lifecycle-dependencies'}:null);
  b.onLoad({filter:/.*/,namespace:'lifecycle-dependencies'},args=>({contents:imports.get(args.path).map(name=>`export const ${name}=globalThis.dependencies[${JSON.stringify(name)}];`).join('\n'),loader:'js'}));
}}]});
const deferred=()=>{let resolve;return {promise:new Promise(ok=>{resolve=ok;}),resolve:value=>resolve(value)};};
const tick=()=>new Promise(ok=>setImmediate(ok));
const eventBus=()=>{const listeners=new Set();return {listeners,addListener:f=>listeners.add(f),removeListener:f=>listeners.delete(f)};};
function fixture({surface='panel',pendingMenu=false,lateAck=false}={}){
  const tab=deferred(),context=deferred(),ready=deferred(),preview=deferred(),menu=deferred(),ack=deferred(),calls=[];
  const disposable=()=>({dispose(){},resourceSnapshot:()=>({subscriptions:0})});
  const toolView=createSidebarToolsView();
  const actions={},view={actions,field:()=>({}),setText(){},action:f=>f,dispose(){}};
  const tools={...disposable(),ready:ready.promise,setVisible:()=>true,isDirty:()=>false,
    openTool:(_id,options)=>{calls.push('openTool');options?.launchGate?.then(()=>calls.push('gate-open'),()=>calls.push('gate-reject'));return 'tool-instance';},
    openReadOnlyPreview:()=>calls.push('preview')};
  const task={...disposable(),navigate:()=>true,connectToolsView(){},showCatalogPage:()=>calls.push('catalog')};
  const dependencies={};
  for(const names of imports.values())for(const name of names)dependencies[name]=()=>disposable();
  Object.assign(dependencies,{
    createCurrentPageTarget:()=>({...disposable(),snapshot:{windowId:1}}),
    createDeveloperView:()=>view,createMyWorkbenchView:()=>view,createSidebarToolsView:()=>toolView,
    createScriptEditor:()=>({...disposable(),host:{},connectLocalProjects(){}}),
    createSidebarTabMemory:()=>({...disposable(),record(){},restore:async()=>calls.push('restore')}),
    mountSidebarApp:()=>({...disposable(),renderNavigation(){},connectWorkflowPage(){}}),
    createSidebarTools:()=>tools,isActualSidePanelContext:()=>context.promise,
    requestedToolId:()=>surface==='tool'?'quick-notes':null,
    requestedPreviewId:()=>surface==='preview'?'preview-r37':null,
    validatePreviewSession:row=>{if(!row)throw new Error('expired preview');return row;},previewStorageKey:()=> 'preview-key',
    BROWSER_MENU_LAUNCH_STORE:'menu-key'
  });
  const api={tabs:{getCurrent:()=>tab.promise},windows:{getCurrent:async()=>({id:1})},
    runtime:{onMessage:eventBus(),sendMessage:async()=>{calls.push('send');return lateAck?ack.promise:{ok:true};}},
    storage:{local:{},onChanged:eventBus(),session:{get:async key=>{
      calls.push('session-read');return key==='preview-key'?preview.promise:pendingMenu?menu.promise:{};
    },remove:async()=>calls.push('preview-remove')}}};
  const window=new EventTarget();
  const sandbox={dependencies,window,chrome:api,URL,console,crypto:globalThis.crypto,
    location:{href:`chrome-extension://r37/sidepanel.html?hostInstanceId=00000000-0000-4000-8000-000000000001${surface==='preview'?'&previewId=preview-r37':''}`},
    document:{documentElement:{dataset:{}}},__opendeskTrustedHistoryUI:{
      create:()=>{calls.push('history');return disposable();},
      createTaskWorkbench:()=>task,createScheduledTaskWorkbench:()=>({...disposable(),shown:false}),
      createScheduledTaskHost:()=>{calls.push('schedule');return disposable();},
      createCloudHosting:()=>{calls.push('cloud');return disposable();}
    }};
  vm.createContext(sandbox);vm.runInContext(bundled.outputFiles[0].text,sandbox);
  sandbox.ToolShell.initToolShell();
  return {tab,context,ready,preview,menu,ack,calls,api,toolView,close:()=>window.dispatchEvent(new Event('pagehide'))};
}
for(const late of ['tab','context'])test(`closed shell ignores late ${late} classification`,async()=>{
  const f=fixture({late});
  if(late==='context'){f.tab.resolve(undefined);await tick();}
  const before=[...f.calls];
  f.close();f.tab.resolve(undefined);f.context.resolve(true);f.ready.resolve();await tick();
  assert.deepEqual(f.calls,before,'closed documents cannot start hosts, restore navigation or consume menu tickets');
  assert.equal(f.api.runtime.onMessage.listeners.size,0);
  assert.equal(f.api.storage.onChanged.listeners.size,0);
});
test('closed tool document never opens a preview after storage resolves',async()=>{
  const f=fixture({surface:'preview'});f.tab.resolve({id:2});f.context.resolve(false);await tick();
  f.close();f.preview.resolve({'preview-key':{tool:{id:'quick-notes'}}});f.ready.resolve();await tick();
  assert.equal(f.calls.includes('preview'),false);assert.equal(f.calls.includes('preview-remove'),false);
});
test('closed standalone tool ignores late runtime readiness',async()=>{
  const f=fixture({surface:'tool'});f.tab.resolve({id:2});f.context.resolve(false);await tick();
  f.close();f.ready.resolve();await tick();assert.equal(f.calls.includes('openTool'),false);
});
test('late menu storage cannot reopen a closed host',async()=>{
  const f=fixture({pendingMenu:true});f.tab.resolve(undefined);await tick();f.close();
  f.menu.resolve({'menu-key':{pending:{state:'pending',windowId:1,expiresAt:Date.now()+1000,ticketId:'ticket',toolId:'quick-notes'}}});
  f.context.resolve(true);f.ready.resolve();await tick();
  assert.equal(f.calls.includes('openTool'),false);assert.equal(f.calls.includes('send'),false);
});
test('expired preview is projected through the React view',async()=>{
  const f=fixture({surface:'preview'});f.tab.resolve({id:2});f.context.resolve(false);f.preview.resolve({});await tick();
  const notice=f.toolView.getSnapshot().fields['sidebar-tool-status'];
  assert.match(notice.textContent,/expired preview/);assert.equal(notice.hidden,false);
  assert.equal(notice.data.state,'error');f.close();
});
test('preview readiness is fenced after its storage read',async()=>{
  const f=fixture({surface:'preview'});f.tab.resolve({id:2});f.context.resolve(false);
  f.preview.resolve({'preview-key':{tool:{id:'quick-notes'}}});await tick();f.close();f.ready.resolve();await tick();
  assert.equal(f.calls.includes('preview'),false);assert.equal(f.calls.includes('preview-remove'),false);
});
test('a live preview opens and consumes its one-shot record',async()=>{
  const f=fixture({surface:'preview'});f.tab.resolve({id:2});f.context.resolve(false);
  f.preview.resolve({'preview-key':{tool:{id:'quick-notes'}}});f.ready.resolve();await tick();
  assert.equal(f.calls.filter(x=>x==='preview').length,1);assert.equal(f.calls.filter(x=>x==='preview-remove').length,1);f.close();
});
const menuRecord=()=>({'menu-key':{pending:{state:'pending',windowId:1,expiresAt:Date.now()+1000,ticketId:'ticket',toolId:'quick-notes'}}});
test('menu readiness cannot open a tool after close',async()=>{
  const f=fixture({pendingMenu:true});f.tab.resolve(undefined);f.menu.resolve(menuRecord());await tick();
  f.close();f.ready.resolve();f.context.resolve(true);await tick();
  assert.equal(f.calls.includes('openTool'),false);assert.equal(f.calls.includes('send'),false);
});
test('late launch acknowledgement rejects the old sandbox gate',async()=>{
  const f=fixture({pendingMenu:true,lateAck:true});f.tab.resolve(undefined);f.menu.resolve(menuRecord());f.ready.resolve();await tick();
  assert.equal(f.calls.filter(x=>x==='send').length,1);f.close();f.ack.resolve({ok:true});f.context.resolve(true);await tick();
  assert.equal(f.calls.includes('gate-open'),false);assert.equal(f.calls.includes('gate-reject'),true);
});
test('live menu binding opens exactly one gate',async()=>{
  const f=fixture({pendingMenu:true});f.tab.resolve(undefined);f.menu.resolve(menuRecord());f.ready.resolve();await tick();
  assert.equal(f.calls.filter(x=>x==='send').length,1);assert.equal(f.calls.filter(x=>x==='gate-open').length,1);f.close();f.context.resolve(true);await tick();
});
