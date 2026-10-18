// R7.2 — fixed Classic assets for one standalone v2 tool, not a second Host.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash,webcrypto} from 'node:crypto';
import {createContext,runInContext} from 'node:vm';
import {createSidebarToolPackage} from '../../scripts/build-sidebar-tool.mjs';
import {SIDEBAR_TOOL_FORMAT_V2,SIDEBAR_TOOL_SHARED_UI_RUNTIME,validateSidebarToolPackage,serializeSidebarToolPackage} from '../../src/ui/sidebar-tools/package.js';
import {initSidebarToolSandbox} from '../../src/sidebar-tools/bridge.js';

const META={format:SIDEBAR_TOOL_FORMAT_V2,id:'multi-assets',version:'1.0.0',title:'Multiple SHA Assets',
 description:'Tool fixture with an ordered Classic dependency chain',capabilities:[],
 requires:{browserSdk:'1.0.0'},contributes:{contextMenus:[]},
 files:{html:'view.html',css:'view.css',js:'main.js',dependencies:['lib/one.js','lib/two.js']}};
const sources=['globalThis.One={value:7};','globalThis.Two={value:14};','OpenDeskTool.root.textContent=String(One.value+Two.value);'];
async function packageFixture(){
 const root=await mkdtemp(join(tmpdir(),'od-multiscript-r72-'));
 await mkdir(join(root,'lib'));
 for(const [name,data] of [['tool.config.json',JSON.stringify(META)],['view.html','<div>test</div>'],
   ['view.css','.x{color:green}',],['main.js',sources[2]],['lib/one.js',sources[0]],['lib/two.js',sources[1]]])
   await writeFile(join(root,name),data);
 return {root,tool:await createSidebarToolPackage(root)};
}
test('v2 packer preserves ordered original Classic UTF-8 bytes and two independent SHA-256 identities',async t=>{
 const {root,tool}=await packageFixture();t.after(()=>rm(root,{recursive:true,force:true}));
 assert.equal(tool.scripts.length,2);
 assert.deepEqual(tool.scripts.map(item=>item.name),['lib/one.js','lib/two.js']);
 for(let i=0;i<2;i++){
   assert.equal(tool.scripts[i].code,sources[i]);
   assert.equal(tool.scripts[i].sha256,createHash('sha256').update(Buffer.from(sources[i],'utf8')).digest('hex'));
 }
 assert.equal(tool.js,sources[2]);
 assert.deepEqual(validateSidebarToolPackage(JSON.parse(serializeSidebarToolPackage(tool))),tool);
 assert.throws(()=>validateSidebarToolPackage({...tool,scripts:[...tool.scripts,{...tool.scripts[0]}]}),{code:'E_TOOL_SCRIPTS'});
 assert.throws(()=>validateSidebarToolPackage({...tool,scripts:[{...tool.scripts[0],code:'import a from "http://bad"'}]}),{code:'E_TOOL_SCRIPTS'});
});
function sandboxFixture(tool,{failAt=0,digestDelayMs=0,sharedScripts={}}={}){
 let resolveTerminal;
 const terminal=new Promise(resolve=>{resolveTerminal=resolve;});
 const emitted=[],loads=[],urls=new Map(),pendingLoads=new Set();let counter=0;
 const eventNode=()=>({handlers:new Map(),addEventListener(name,fn){this.handlers.set(name,fn);},
  removeEventListener(name){this.handlers.delete(name);},emit(name,payload){this.handlers.get(name)?.(payload);}});
 const win=eventNode(),root={innerHTML:'',scrollHeight:10,replaceChildren(){},
  getBoundingClientRect:()=>({top:0,bottom:10}),addEventListener(){},querySelectorAll:()=>[]},
 status={hidden:false,textContent:'',dataset:{}},doc={
  // A real sandbox HTML document always has <html>; locale sync now sets its lang.
  documentElement:{lang:'zh-CN'},baseURI:'https://sandbox.invalid/sidebar-tools/sandbox.html',
  getElementById:id=>id==='tool-root'?root:status,
  createElement:()=>({...eventNode(),src:'',textContent:''}),
  head:{append(){}},
  body:{append(node){
    const blob=urls.get(node.src);
    const loading=Promise.resolve().then(async()=>{
      const code=blob?await blob.text():sharedScripts[node.src];
      assert.equal(typeof code,'string','fixture must provide each fixed runtime resource');
      loads.push(code);
      if(loads.length===failAt){node.emit('error');return;}
      // Classic script exceptions dispatch window.error, but still dispatch script.load.
      try{runInContext(code,context);}catch(error){win.emit('error',{message:error.message});}
      await new Promise(resolve=>setImmediate(resolve));
      node.emit('load');
    });
    pendingLoads.add(loading);
    void loading.finally(()=>pendingLoads.delete(loading));
  }}
 };
 const parent={postMessage:row=>{
   emitted.push(row);
   if(row.kind==='status'&&['ready','error'].includes(row.state))resolveTerminal();
 }};
 class URLFake extends URL{
   static createObjectURL(blob){const url='blob:tool-'+(++counter);urls.set(url,blob);return url;}
   static revokeObjectURL(url){urls.delete(url);}
 }
 const context=createContext(Object.assign(win,{
   window:win,document:doc,parent,URL:URLFake,Blob,TextEncoder,
   crypto:digestDelayMs?{subtle:{async digest(...args){
     await new Promise(resolve=>setTimeout(resolve,digestDelayMs));
     return webcrypto.subtle.digest(...args);
   }}}:webcrypto,
   requestAnimationFrame:()=>0,setTimeout,clearTimeout,console,
   SIDEBAR_TOOL_PROTOCOL:'opendesk.sidebar-tool.bridge.v1',SIDEBAR_TOOL_SHARED_UI_RUNTIME,
   createBrowserSdk:()=>({capabilities:{}})
 }));
 runInContext('('+initSidebarToolSandbox.toString()+')()',context);
 win.emit('message',{source:parent,data:{protocol:'opendesk.sidebar-tool.bridge.v1',
    kind:'load',instance:'one',toolId:tool.id,tool}});
 const wait=async()=>{
  await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(new Error('Sandbox did not report a terminal result')),2000);
   terminal.then(()=>{clearTimeout(timer);resolve();});
  });
  // An error is not the end of loading: drain the subsequent load and ready events.
  do{
    await Promise.all([...pendingLoads]);
    await new Promise(resolve=>setImmediate(resolve));
  }while(pendingLoads.size);
 };
 return {emitted,loads,wait,win,root,status,urls,documentElement:doc.documentElement,
  hostLocale:locale=>win.emit('message',{source:parent,data:{
    protocol:'opendesk.sidebar-tool.bridge.v1',kind:'locale-changed',
    instance:'one',toolId:tool.id,locale}})};
}
test('opaque sandbox verifies every SHA, observes onload order and only then loads main JS',async t=>{
 const f=await packageFixture();t.after(()=>rm(f.root,{recursive:true,force:true}));
 const b=sandboxFixture(f.tool);await b.wait();
 assert.deepEqual(b.loads,sources);
 assert.equal(b.emitted.filter(row=>row.kind==='status').at(-1).state,'ready');
});
test('tampered SHA prevents even the first library from being evaluated',async t=>{
 const f=await packageFixture();t.after(()=>rm(f.root,{recursive:true,force:true}));
 const tool={...f.tool,scripts:[{...f.tool.scripts[0],sha256:'0'.repeat(64)},f.tool.scripts[1]]};
 const b=sandboxFixture(tool);await b.wait();
 assert.deepEqual(b.loads,[]);assert.match(b.emitted.at(-1).message,/E_TOOL_SHA/);
});
test('second asset onerror blocks main script, no later dependencies are dispatched',async t=>{
 const f=await packageFixture();t.after(()=>rm(f.root,{recursive:true,force:true}));
 const b=sandboxFixture(f.tool,{failAt:2});await b.wait();
 assert.deepEqual(b.loads,sources.slice(0,2));
 assert.equal(b.emitted.at(-1).state,'error');
 assert.match(b.emitted.at(-1).message,/E_TOOL_SCRIPT_LOAD/);
});
test('ordered loading awaits real SHA completion under asynchronous worker delays',async t=>{
 const f=await packageFixture();t.after(()=>rm(f.root,{recursive:true,force:true}));
 const b=sandboxFixture(f.tool,{digestDelayMs:30});await b.wait();
 assert.deepEqual(b.loads,sources);
 assert.equal(b.emitted.filter(row=>row.kind==='status').at(-1).state,'ready');
});

test('sandbox host locale updates the real document contract without bypassing signed asset order',async t=>{
 const f=await packageFixture();t.after(()=>rm(f.root,{recursive:true,force:true}));
 const b=sandboxFixture(f.tool);await b.wait();
 assert.equal(b.documentElement.lang,'zh-CN');
 b.hostLocale('en-US');
 assert.equal(b.documentElement.lang,'en-US');
 b.hostLocale('<script>');
 assert.equal(b.documentElement.lang,'zh-CN','untrusted locale must not become document markup');
 assert.deepEqual(b.loads,sources,'locale changes must never rerun approved assets');
 assert.equal(b.emitted.filter(row=>row.kind==='status').at(-1).state,'ready');
});

const plainTool={id:'startup-fixture',html:'<p>HTML tool</p>',css:'',js:''};
const fixedScript=code=>({name:'startup.js',code,
 sha256:createHash('sha256').update(code,'utf8').digest('hex')});
const sharedReact='globalThis.OpenDeskPageReact={version:"19.2.0",createRoot(){},jsx(){}};';
const sharedUI='globalThis.OpenDeskSidebarUI={Card(){},Switch(){}};';
const sharedScripts={
 'https://sandbox.invalid/libs/page-frameworks/react-19.2.0.js':sharedReact,
 'https://sandbox.invalid/sidebar-shared-ui.js':sharedUI
};

test('normal HTML-only and JavaScript tools report ready after actual execution',async()=>{
 for(const js of ['', 'OpenDeskTool.root.textContent="JS ran";']){
  const b=sandboxFixture({...plainTool,js});await b.wait();
  assert.equal(b.root.innerHTML,plainTool.html);
  if(js)assert.equal(b.root.textContent,'JS ran');
  assert.deepEqual(b.emitted.filter(row=>row.kind==='status').map(row=>row.state),['ready']);
  assert.equal(b.status.hidden,true);
  assert.equal(b.urls.size,0,'successful main Blob is revoked');
 }
});

for(const kind of ['error','unhandledrejection']){
 // Model the browser's unhandledrejection dispatch after the Promise rejects;
 // Node's own unhandled-rejection policy must not terminate the test process.
 const failure=kind==='error'?'throw new Error("startup failed");':
  'Promise.reject(new Error("startup failed")).catch(reason=>window.emit("unhandledrejection",{reason}));';
 for(const stage of ['main','fixed','shared']){
  test(`${stage} window ${kind} followed by script load cannot report ready`,async()=>{
   const tool={...plainTool,js:stage==='main'?failure:'OpenDeskTool.root.textContent="main ran";'};
   if(stage==='fixed')tool.scripts=[fixedScript(failure)];
   if(stage==='shared')tool.uiRuntime=SIDEBAR_TOOL_SHARED_UI_RUNTIME;
   const b=sandboxFixture(tool,{sharedScripts:{...sharedScripts,
    'https://sandbox.invalid/libs/page-frameworks/react-19.2.0.js':sharedReact+(stage==='shared'?failure:'')
   }});
   await b.wait();
   const statuses=b.emitted.filter(row=>row.kind==='status');
   assert.ok(statuses.some(row=>row.state==='error'&&row.message.includes('startup failed')));
   assert.equal(statuses.some(row=>row.state==='ready'),false,'script load must not erase the startup failure');
   assert.equal(b.status.dataset.state,'error');
   assert.equal(b.status.hidden,false);
   assert.equal(b.urls.size,0,'all completed Blob loads are revoked even after a runtime error');
  });
 }
}

test('shared React uiRuntime loads before fixed libraries and main, then reports ready',async()=>{
 const fixed='globalThis.FixedReady=typeof OpenDeskSidebarUI.Card==="function";';
 const js='OpenDeskTool.root.textContent=String(FixedReady&&OpenDeskPageReact.version==="19.2.0");';
 const b=sandboxFixture({...plainTool,uiRuntime:SIDEBAR_TOOL_SHARED_UI_RUNTIME,
  scripts:[fixedScript(fixed)],js},{sharedScripts});
 await b.wait();
 assert.deepEqual(b.loads,[sharedReact,sharedUI,fixed,js]);
 assert.equal(b.root.textContent,'true');
 assert.deepEqual(b.emitted.filter(row=>row.kind==='status').map(row=>row.state),['ready']);
 assert.equal(b.urls.size,0);
});

test('incompatible shared React uiRuntime blocks main and reports error',async()=>{
 const b=sandboxFixture({...plainTool,uiRuntime:SIDEBAR_TOOL_SHARED_UI_RUNTIME},{sharedScripts:{
  ...sharedScripts,'https://sandbox.invalid/sidebar-shared-ui.js':'globalThis.OpenDeskSidebarUI={};'
 }});
 await b.wait();
 assert.equal(b.loads.length,2);
 assert.match(b.emitted.at(-1).message,/E_TOOL_SHARED_UI_INCOMPATIBLE/);
});

test('pagehide during main execution prevents late ready and revokes the Blob',async()=>{
 const b=sandboxFixture({...plainTool,js:'window.emit("pagehide");window.emit("error",{message:"late error"});'});
 await new Promise(resolve=>setTimeout(resolve,30));
 assert.equal(b.loads.length,1);
 assert.equal(b.emitted.some(row=>row.state==='ready'),false);
 assert.equal(b.urls.size,0);
});
