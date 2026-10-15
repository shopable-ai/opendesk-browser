// R7.2 — fixed Classic assets for one standalone v2 tool, not a second Host.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash,webcrypto} from 'node:crypto';
import {runInNewContext} from 'node:vm';
import {createSidebarToolPackage} from '../../scripts/build-sidebar-tool.mjs';
import {SIDEBAR_TOOL_FORMAT_V2,validateSidebarToolPackage,serializeSidebarToolPackage} from '../../src/ui/sidebar-tools/package.js';
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
function sandboxFixture(tool,{failAt=0,digestDelayMs=0}={}){
 let resolveTerminal;
 const terminal=new Promise(resolve=>{resolveTerminal=resolve;});
 const emitted=[],loads=[],urls=new Map();let counter=0;
 const eventNode=()=>({handlers:new Map(),addEventListener(name,fn){this.handlers.set(name,fn);},
  removeEventListener(name){this.handlers.delete(name);},emit(name,payload){this.handlers.get(name)?.(payload);}});
 const win=eventNode(),root={innerHTML:'',scrollHeight:10,replaceChildren(){},
  getBoundingClientRect:()=>({top:0,bottom:10}),addEventListener(){},querySelectorAll:()=>[]},
 status={hidden:false,textContent:'',dataset:{}},doc={
  // A real sandbox HTML document always has <html>; locale sync now sets its lang.
  documentElement:{lang:'zh-CN'},
  getElementById:id=>id==='tool-root'?root:status,
  createElement:()=>({...eventNode(),src:'',textContent:''}),
  head:{append(){}},
  body:{append(node){
    const blob=urls.get(node.src);
    const count=loads.length+1;
    void blob.text().then(code=>{
      loads.push(code);
      setImmediate(()=>node.emit(count===failAt?'error':'load'));
    });
  }}
 };
 const parent={postMessage:row=>{
   emitted.push(row);
   if(row.kind==='status'&&['ready','error'].includes(row.state))resolveTerminal();
 }};
 const URLFake={createObjectURL:blob=>{const url='blob:tool-'+(++counter);urls.set(url,blob);return url;},
   revokeObjectURL:url=>urls.delete(url)};
 runInNewContext('('+initSidebarToolSandbox.toString()+')()',{
   window:win,document:doc,parent,URL:URLFake,Blob,TextEncoder,
   crypto:digestDelayMs?{subtle:{async digest(...args){
     await new Promise(resolve=>setTimeout(resolve,digestDelayMs));
     return webcrypto.subtle.digest(...args);
   }}}:webcrypto,
   requestAnimationFrame:()=>0,setTimeout,clearTimeout,console,
   SIDEBAR_TOOL_PROTOCOL:'opendesk.sidebar-tool.bridge.v1',
   createBrowserSdk:()=>({capabilities:{}})
 });
 win.emit('message',{source:parent,data:{protocol:'opendesk.sidebar-tool.bridge.v1',
    kind:'load',instance:'one',toolId:tool.id,tool}});
 const wait=()=>new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(new Error('Sandbox did not report a terminal result')),2000);
   terminal.then(()=>{clearTimeout(timer);resolve();});
 });
 return {emitted,loads,wait,win,documentElement:doc.documentElement,
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
