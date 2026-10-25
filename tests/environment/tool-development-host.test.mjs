import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {parseHTML} from 'linkedom';
import {createSidebarTools} from '../../src/ui/sidebar-tools.js';
import {createSidebarToolsView} from '../../src/ui/sidebar-tools-view.js';
import {createToolDevelopmentControls} from '../../src/ui/sidebar-tools/development-controls.js';
import {executeDevelopmentStorage} from '../../src/ui/sidebar-tools/development-storage.js';
import {SIDEBAR_TOOL_PROTOCOL,SIDEBAR_TOOL_STORE,sidebarToolStorageKey} from '../../src/ui/sidebar-tools/package.js';

const tick=()=>new Promise(resolve=>setImmediate(resolve));
const settle=async()=>{for(let i=0;i<15;i++)await tick();};
const gate=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
const preview={previewId:'00000000-0000-4000-8000-000000000001',sourceId:'source-'+ 'a'.repeat(24),sha256:'a'.repeat(64),
  tool:{id:'notes-test',title:'测试笔记',capabilities:['storage.local']}};

test('trusted controls approve the displayed SHA with a new mount; forged clicks, editing and invalidated snapshots cannot approve',()=>{
  const view=createSidebarToolsView(),mounts=[],sessions=[];let editing=false;
  const controls=createToolDevelopmentControls({view,api:{},tools:{isPreviewEditing:()=>editing,
    openReadOnlyPreview:(...args)=>mounts.push(args)},createSession:options=>{
      const session={approved:false,revoke(){session.approved=false;},options};sessions.push(session);return session;
    }});
  controls.snapshot(preview);
  const click=isTrusted=>view.dispatch('sidebar-tool-development-approve','click',{isTrusted});
  click(false);assert.equal(sessions.length,0);
  editing=true;click(true);assert.equal(sessions.length,0);
  editing=false;click(true);assert.equal(sessions.length,1);assert.equal(mounts.length,1);
  assert.equal(mounts[0][1].developmentSession,sessions[0]);
  assert.equal(sessions[0].options.session.sha256,preview.sha256);
  click(true);assert.equal(sessions.length,1,'approval cannot duplicate while mounting');
  sessions[0].approved=true;sessions[0].options.onState(true,'approved');
  controls.invalidate();click(true);assert.equal(sessions.length,1);
  assert.equal(sessions[0].approved,false);
  controls.snapshot({...preview,sha256:'b'.repeat(64)});click(true);
  assert.equal(sessions[1].options.session.sha256,'b'.repeat(64));
  controls.dispose();view.dispose();
});

test('invalidating an approval before iframe load releases the next explicit approval',()=>{
  const view=createSidebarToolsView(),sessions=[];
  const controls=createToolDevelopmentControls({view,api:{},tools:{isPreviewEditing:()=>false,
    openReadOnlyPreview:()=>true},createSession:options=>{
      const session={approved:false,revoked:false,revoke(){session.revoked=true;options.onState(false,'stopped');}};
      sessions.push(session);return session;
    }});
  controls.snapshot(preview);
  const click=()=>view.dispatch('sidebar-tool-development-approve','click',{isTrusted:true});
  click();assert.equal(sessions.length,1);
  controls.invalidate();assert.equal(sessions[0].revoked,true);
  controls.snapshot({...preview,sha256:'b'.repeat(64)});click();
  assert.equal(sessions.length,2,'next snapshot does not retain the previous starting flag');
  controls.dispose();view.dispose();
});

async function hostFixture(t){
  const tool=JSON.parse(await readFile(new URL('../../examples/sidebar-tools/prompt-shortcuts/prompt-shortcuts.opendesk-tool.json',import.meta.url),'utf8'));
  const {window,document}=parseHTML('<html><body></body></html>');
  const previous=globalThis.window;globalThis.window=window;t.after(()=>{globalThis.window=previous;});
  const view=createSidebarToolsView(),frames=[],sessionValues={},localValues={
    [SIDEBAR_TOOL_STORE]:[tool],[sidebarToolStorageKey(tool.id)]:{library:{formal:'must stay unchanged'}}};
  const localBefore=JSON.stringify(localValues),readKeys=[];let writes=0;
  const api={runtime:{getURL:path=>'chrome-extension://test/'+path},permissions:{contains:async()=>false},
    storage:{onChanged:{addListener(){},removeListener(){}},local:{
      async get(keys){readKeys.push(keys);return Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(key=>[key,localValues[key]]));},
      async set(){assert.fail('preview cannot write local');}
    },session:{async get(key){return {[key]:structuredClone(sessionValues[key])};},
      async set(values){writes++;Object.assign(sessionValues,structuredClone(values));}}}};
  const doc={documentElement:document.documentElement,getElementById:id=>document.getElementById(id),
    createElement(tag){assert.equal(tag,'iframe');const frame=document.createElement(tag),messages=[];
      const source={postMessage(message){messages.push(message);frame.reply?.(message);}};
      Object.defineProperty(frame,'contentWindow',{value:source});frame.messages=messages;frames.push(frame);return frame;}};
  const tools=createSidebarTools({api,doc,view,fetcher:async()=>new Response('',{status:404}),
    currentPageTarget:{snapshot:{status:'unavailable'},subscribe:()=>()=>{}},taskWorkbench:{setToolActive(){}}});
  tools.setVisible(true);
  const nodes={frameRoot:document.createElement('div'),settingsControl:document.createElement('button')};
  document.body.append(nodes.frameRoot);const detach=view.attachRuntime(nodes);await tools.ready;
  t.after(()=>{tools.dispose();detach();view.dispose();});
  const send=(frame,data,source=frame.contentWindow)=>{
    const event=new window.Event('message');Object.assign(event,{origin:'null',source,data});window.dispatchEvent(event);
  };
  let lockTail=Promise.resolve();const lockManager={request(_name,work){const next=lockTail.then(work);lockTail=next.catch(()=>{});return next;}};
  function developmentSession(barrier=Promise.resolve()){
    let token=null;return {async start(value){await barrier;token=value;},revoke(){token=null;},
      request(operation,payload,value){assert.equal(value,token);return executeDevelopmentStorage({api,
        sourceId:preview.sourceId,toolId:tool.id,lockManager,operation,payload:JSON.parse(JSON.stringify(payload)),
        authorize:async()=>{assert.equal(value,token);},assertCommit:()=>assert.equal(value,token)});}};
  }
  return {api,tool,tools,view,frames,send,developmentSession,sessionValues,readKeys,
    assertLocal(){assert.equal(JSON.stringify(localValues),localBefore);},get writes(){return writes;}};
}

test('existing Host waits for development admission before dispatching any tool code and drops old iframe initialization',async t=>{
  const f=await hostFixture(t),barrier=gate();
  f.tools.openReadOnlyPreview(f.tool,{developmentSession:f.developmentSession(barrier.promise)});
  const old=f.frames.at(-1),loading=old.onload();
  assert.equal(old.messages.some(row=>row.kind==='load'),false);
  f.tools.openReadOnlyPreview(f.tool);const current=f.frames.at(-1);await current.onload();
  barrier.resolve();await loading;
  assert.equal(old.messages.some(row=>row.kind==='load'),false,'retired iframe cannot execute late');
  assert.equal(current.messages.filter(row=>row.kind==='load').length,1);
  f.assertLocal();
});

test('actual Prompt source saves 你好 through the existing preview Host and session CAS; reopening keeps data and formal data stays unchanged',async t=>{
  const f=await hostFixture(t),toolRoot=new URL('../../examples/sidebar-tools/prompt-shortcuts/',import.meta.url);
  const [html,model,main]=await Promise.all(['src/index.html','trusted/model.js','src/main.js'].map(path=>readFile(new URL(path,toolRoot),'utf8')));
  async function open(){
    f.tools.openReadOnlyPreview(f.tool,{developmentSession:f.developmentSession()});
    const frame=f.frames.at(-1);await frame.onload();
    const loaded=frame.messages.find(row=>row.kind==='load');assert.ok(loaded);
    const {document,window}=parseHTML('<html><body>'+html+'</body></html>'),root=document.body;
    root.querySelector('#ps-enabled').checked=true;
    const awaiting=new Map();let sequence=0;
    frame.reply=message=>{if(message.kind!=='response')return;const row=awaiting.get(message.requestId);if(!row)return;
      awaiting.delete(message.requestId);message.ok?row.resolve(message.result):row.reject(Object.assign(new Error(message.error.message),message.error));};
    const request=(operation,payload)=>new Promise((resolve,reject)=>{
      const requestId=String(++sequence);awaiting.set(requestId,{resolve,reject});
      f.send(frame,{protocol:SIDEBAR_TOOL_PROTOCOL,kind:'request',instance:loaded.instance,toolId:f.tool.id,requestId,operation,payload});
    });
    const context={Intl,TextEncoder,URL,crypto:globalThis.crypto,CustomEvent:window.CustomEvent,
      setTimeout:()=>0,clearTimeout(){},OpenDeskTool:{root,request,setState:state=>f.send(frame,{
        protocol:SIDEBAR_TOOL_PROTOCOL,kind:'edit-state',instance:loaded.instance,toolId:f.tool.id,...state})}};
    runInNewContext(model,context,{filename:'trusted/model.js'});runInNewContext(main,context,{filename:'src/main.js'});
    await settle();assert.equal(awaiting.size,0);assert.equal(root.querySelector('#ps-new').disabled,false);
    return {root,window,frame,loaded,request};
  }
  const first=await open();
  first.root.querySelector('#ps-new').click();first.root.querySelector('#ps-body').value='你好';
  first.root.querySelector('#ps-form').dispatchEvent(new first.window.Event('input'));
  first.root.querySelector('#ps-save').click();await settle();
  assert.equal(f.writes,1);assert.match(first.root.querySelector('#ps-list').textContent,/你好/);
  assert.equal(first.root.querySelector('#ps-index').hidden,false);
  const second=await open();assert.notEqual(second.loaded.instance,first.loaded.instance);
  assert.match(second.root.querySelector('#ps-list').textContent,/你好/);assert.equal(f.writes,1);
  await assert.rejects(second.request('tasks.open',{taskId:'test'}),/开发预览/);
  assert.equal(f.readKeys.flat().includes(sidebarToolStorageKey(f.tool.id)),false,'same-ID formal data is not read');
  f.assertLocal();
});
