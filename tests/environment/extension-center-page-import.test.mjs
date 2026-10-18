import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';
import {createSidebarTools} from '../../src/ui/sidebar-tools.js';
import {createExtensionCenter} from '../../src/ui/extension-center.js';
import {SIDEBAR_TOOL_FORMAT,SIDEBAR_TOOL_FORMAT_V2,SIDEBAR_TOOL_STORE} from '../../src/ui/sidebar-tools/package.js';
import {PROGRAM_DRAFT_INPUT_LIMIT} from '../../src/ui/program-source.js';
import {createPageBundle} from '../../src/scripting/user-scripts/page-bundle.js';
import {digestUtf8} from '../../src/platform/protocol.js';

const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function settle(check){
  for(let i=0;i<150;i++){
    if(check())return;
    await new Promise(resolve=>setTimeout(resolve,5));
  }
  assert.ok(check(),'import DOM state did not settle');
}
function deferred(){let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};}
const app={format:SIDEBAR_TOOL_FORMAT,id:'local-notes',version:'1.0.0',title:'Local notes',
  description:'Local app',capabilities:['storage.local'],html:'<main>Notes</main>',css:'',js:'void 0;'};
async function pageDraft({v2=false}={}){
  let sourceUtf8='// ==UserScript==\n// @match https://example.com/*\n// ==/UserScript==\ndocument.title="Page draft";';
  let remoteLock;
  if(v2){
    const url='https://library.example.com/v1/index.js',original='export default 7;';
    const pin={sha256:await digestUtf8(original),bytes:Buffer.byteLength(original)};
    remoteLock={format:'opendesk.remote-lock.v2',profile:'page-library-v1',imports:{},modules:{[url]:pin}};
    sourceUtf8=await createPageBundle(sourceUtf8+'\n/*'+'x'.repeat(330000)+'*/',{
      remoteImports:[url],remoteModules:[{url,...pin}],remoteLock});
  }
  const file={path:'src/main.js',sourceUtf8:'document.title="Page draft";'};
  file.sha256=await digestUtf8(file.sourceUtf8);
  return {format:`opendesk.program-draft.v${v2?2:1}`,runtimeKind:'page-userscript',
    project:{id:'local.page',version:'1.0.0',entry:file.path},sourceUtf8,
    build:{mode:'production',sourceHash:await digestUtf8(sourceUtf8),byteLength:Buffer.byteLength(sourceUtf8)},
    authoring:{files:[file],...(v2?{remoteLock}:{})}};
}

async function fixture(t,{receiveDraft}={}){
  const {document:doc,window}=parseHTML(await readFile(new URL('../../src/ui/tool.html',import.meta.url),'utf8'));
  const get=id=>doc.getElementById(id),store=new Map(),writes=[],received=[];
  const oldWindow=globalThis.window,oldFetch=globalThis.fetch;
  const offline=async()=>{throw new Error('Offline DOM fixture');};
  let host,center;
  t.after(()=>{center?.dispose();host?.dispose();globalThis.window=oldWindow;globalThis.fetch=oldFetch;});
  globalThis.window=window;globalThis.fetch=offline;
  window.HTMLElement.prototype.getBoundingClientRect=()=>({left:0,right:360,top:0,bottom:36,width:360,height:36});
  // Linkedom does not implement the writable native select.value property.
  for(const select of doc.querySelectorAll('select')){
    let value=select.querySelector('option')?.value||'';
    Object.defineProperty(select,'value',{get:()=>value,set:next=>{value=String(next);}});
  }
  const changed=new Set(),queues=new Map();
  const lockManager={request(name,work){
    const next=(queues.get(name)||Promise.resolve()).catch(()=>{}).then(work);queues.set(name,next);return next;
  }};
  const api={runtime:{getURL:path=>'chrome-extension://test/'+path},storage:{
    onChanged:{addListener:fn=>changed.add(fn),removeListener:fn=>changed.delete(fn)},
    session:{async get(){return {};},async remove(){}},
    local:{async get(keys){
      return Object.fromEntries((Array.isArray(keys)?keys:typeof keys==='string'?[keys]:[...store.keys()])
        .map(key=>[key,structuredClone(store.get(key))]));
    },async set(values){
      writes.push(structuredClone(values));const changes={};
      for(const [key,value] of Object.entries(values)){
        changes[key]={oldValue:store.get(key),newValue:structuredClone(value)};store.set(key,structuredClone(value));
      }
      for(const listener of changed)listener(changes,'local');
    },async remove(key){store.delete(key);}}
  }};
  get('script-source').value='';get('script-revision').value='';get('script-version').dataset.dirty='false';
  const taskWorkbench={async receiveDraft(draft){
    received.push(draft);
    if(receiveDraft)await receiveDraft(draft);
    get('script-source').value=draft.sourceUtf8;
    doc.documentElement.dataset.opendeskTab='develop';
  }};
  host=createSidebarTools({api,doc,taskWorkbench,lockManager,fetcher:offline});
  await host.ready;host.setVisible(true);
  center=createExtensionCenter({api,doc,sidebarTools:host,taskWorkbench,
    client:{async request(operation){assert.equal(operation,'listPagePrograms');return {programs:[]};}}});
  await center.refresh();await tick();writes.length=0;
  const event=(id,type)=>get(id).dispatchEvent(new window.Event(type,{bubbles:true}));
  event('extension-center-more','click');event('extension-center-import','click');
  assert.equal(get('sidebar-tool-import').hidden,false);
  function select(value,{name='draft.json',size,text}={}){
    const content=typeof value==='string'?value:JSON.stringify(value);
    const file={name,size:size??Buffer.byteLength(content),text:text||(()=>Promise.resolve(content))};
    Object.defineProperty(get('sidebar-tool-file'),'files',{configurable:true,value:[file]});
    event('sidebar-tool-file','change');return file;
  }
  return {doc,get,event,select,host,store,writes,received};
}
function unchanged(f){
  assert.equal(f.received.length,0);assert.equal(f.writes.length,0);
  assert.equal(f.get('sidebar-tool-preview').hidden,true);
  assert.equal(f.get('sidebar-tool-install').disabled,true);
  assert.equal(f.get('sidebar-tool-frame').childElementCount,0);
}

for(const v2 of [false,true])test(`extension center imports verified Page v${v2?2:1} through the developer handoff`,async t=>{
  const draft=await pageDraft({v2}),f=await fixture(t);
  if(v2)assert.ok(Buffer.byteLength(JSON.stringify(draft))>320000,'Page uses its own input budget');
  f.select(draft);await settle(()=>f.received.length===1&&f.get('sidebar-tool-import').hidden);
  assert.deepEqual(f.received[0],draft);assert.ok(Object.isFrozen(f.received[0]));
  assert.equal(f.doc.documentElement.dataset.opendeskTab,'develop');
  assert.equal(f.get('script-source').value,draft.sourceUtf8);
  assert.equal(f.get('sidebar-tool-preview').hidden,true);assert.equal(f.writes.length,0);
  assert.equal(f.get('sidebar-tool-frame').childElementCount,0);
});

for(const format of [SIDEBAR_TOOL_FORMAT,SIDEBAR_TOOL_FORMAT_V2])test(`${format} retains review and explicit installation without execution`,async t=>{
  const f=await fixture(t),candidate={...app,format,...(format===SIDEBAR_TOOL_FORMAT_V2?
    {requires:{browserSdk:'1.0.0'},contributes:{contextMenus:[]}}:{})};f.select(candidate);
  await settle(()=>!f.get('sidebar-tool-preview').hidden);
  assert.match(f.get('sidebar-tool-preview-capabilities').textContent,/保存此工具的数据/);
  assert.equal(f.get('sidebar-tool-install').disabled,false);
  assert.equal(f.received.length,0);assert.equal(f.writes.length,0);
  assert.equal(f.get('sidebar-tool-frame').childElementCount,0);
  f.event('sidebar-tool-install','click');
  await settle(()=>f.store.get(SIDEBAR_TOOL_STORE)?.length===1&&f.get('sidebar-tool-import').hidden);
  assert.equal(f.store.get(SIDEBAR_TOOL_STORE)[0].id,app.id);
  assert.equal(f.get('sidebar-tool-frame').childElementCount,0);assert.equal(f.received.length,0);
});

test('malformed JSON, wrong kinds, hashes and budgets never reach either importer',async t=>{
  const draft=await pageDraft();
  const cases=[
    ['bad JSON','{invalid',{},/有效的工具包 JSON/],
    ['unknown format',{...draft,format:'unknown'}, {},/工具/],
    ['unknown runtime',{...draft,runtimeKind:'main-world'}, {},/未知程序运行环境/],
    ['Controller',{...draft,runtimeKind:'controller'}, {},/「我的」.*「开发」/],
    ['bad build hash',{...draft,build:{...draft.build,sourceHash:'0'.repeat(64)}}, {},/SHA-256/],
    ['bad source hash',{...draft,authoring:{files:[{...draft.authoring.files[0],sha256:'0'.repeat(64)}]}}, {},/SHA-256/],
    ['unknown field',{...draft,extra:true}, {},/字段/],
    ['oversize app',app,{size:320001},/320 KB/],
    ['oversize Page',draft,{size:PROGRAM_DRAFT_INPUT_LIMIT+1,text:()=>{assert.fail('oversize file must not be read');}},/大小上限/],
    ['oversize UTF-8 app',{...app,html:'中'.repeat(110000)}, {},/320 KB/],
    ['unsupported app capability',{...app,capabilities:['privileged.unknown']}, {},/能力/],
  ];
  for(const [name,value,options,error] of cases)await t.test(name,async t=>{
    const f=await fixture(t);f.select(value,options);
    await settle(()=>!f.get('sidebar-tool-file-error').hidden);
    assert.match(f.get('sidebar-tool-file-error').textContent,error);unchanged(f);
  });
});

for(const cancel of ['sidebar-tool-import-close','picker-cancel','empty-change','dispose'])test(`pending Page read is discarded after ${cancel}`,async t=>{
  const draft=await pageDraft(),gate=deferred(),f=await fixture(t);
  f.select(draft,{text:()=>gate.promise});
  if(cancel==='dispose')f.host.dispose();
  else if(cancel==='empty-change'){
    Object.defineProperty(f.get('sidebar-tool-file'),'files',{configurable:true,value:[]});
    f.event('sidebar-tool-file','change');
  }else f.event(cancel==='picker-cancel'?'sidebar-tool-file':cancel,cancel==='picker-cancel'?'cancel':'click');
  gate.resolve(JSON.stringify(draft));await tick();await tick();unchanged(f);
});

test('a newer App selection survives older Page success or malformed JSON receipts',async t=>{
  const draft=await pageDraft(),f=await fixture(t),first=deferred(),second=deferred();
  f.select(draft,{text:()=>first.promise});f.select('{invalid',{text:()=>second.promise});
  f.select(app,{name:'app.json'});await settle(()=>!f.get('sidebar-tool-preview').hidden);
  first.resolve(JSON.stringify(draft));second.resolve('{invalid');await tick();await tick();
  assert.equal(f.received.length,0);assert.equal(f.writes.length,0);
  assert.equal(f.get('sidebar-tool-file-error').hidden,true);
  assert.match(f.get('sidebar-tool-preview-file').textContent,/app\.json/);
});

test('cancellation during asynchronous Page hash validation prevents the handoff',async t=>{
  const draft=await pageDraft(),f=await fixture(t),read=deferred();
  f.select(draft,{text:()=>read.promise});read.resolve(JSON.stringify(draft));
  await Promise.resolve(); // file.text has resumed and validation awaits its digest.
  f.event('sidebar-tool-import-close','click');await tick();await tick();unchanged(f);
});

test('unsaved developer content reuses the action review and imports only on confirmation',async t=>{
  const draft=await pageDraft(),f=await fixture(t),source=f.get('script-source');
  source.value='document.title="Unsaved";';
  f.select(draft);await settle(()=>!f.get('sidebar-tool-action-review').hidden);
  unchanged(f);assert.equal(source.value,'document.title="Unsaved";');
  f.event('sidebar-tool-action-cancel','click');assert.equal(source.value,'document.title="Unsaved";');
  f.select(draft);await settle(()=>!f.get('sidebar-tool-action-review').hidden);
  f.event('sidebar-tool-action-continue','click');await settle(()=>f.received.length===1);
  assert.equal(source.value,draft.sourceUtf8);assert.equal(f.writes.length,0);
});

test('saved but edited revisions are protected and changed review snapshots cannot overwrite them',async t=>{
  const draft=await pageDraft(),f=await fixture(t),source=f.get('script-source');
  source.value='unsaved revision';f.get('script-revision').value='2';f.get('script-version').dataset.dirty='true';
  f.select(draft);await settle(()=>!f.get('sidebar-tool-action-review').hidden);
  source.value='newer edit';f.event('sidebar-tool-action-continue','click');
  await settle(()=>!f.get('sidebar-tool-file-error').hidden);
  assert.match(f.get('sidebar-tool-file-error').textContent,/草稿已变化/);
  assert.equal(source.value,'newer edit');unchanged(f);
});

test('closing import or selecting an App invalidates a pending developer overwrite review',async t=>{
  const draft=await pageDraft(),f=await fixture(t);f.get('script-source').value='unsaved';
  f.select(draft);await settle(()=>!f.get('sidebar-tool-action-review').hidden);
  f.event('sidebar-tool-import-close','click');f.event('sidebar-tool-action-continue','click');unchanged(f);
  f.host.openImport();f.select(draft);await settle(()=>!f.get('sidebar-tool-action-review').hidden);
  f.select(app);await settle(()=>!f.get('sidebar-tool-preview').hidden);
  f.event('sidebar-tool-action-continue','click');assert.equal(f.received.length,0);assert.equal(f.writes.length,0);
});

test('developer handoff failure preserves the import UI and reports the existing editor error',async t=>{
  const f=await fixture(t,{receiveDraft(){throw new Error('请先停止当前受管组件');}});
  f.select(await pageDraft());await settle(()=>!f.get('sidebar-tool-file-error').hidden);
  assert.match(f.get('sidebar-tool-file-error').textContent,/请先停止/);
  assert.equal(f.get('sidebar-tool-import').hidden,false);assert.equal(f.get('sidebar-tool-file').disabled,false);
  assert.equal(f.writes.length,0);assert.equal(f.get('script-source').value,'');
});

test('the existing developer handoff completes once while further file changes are locked',async t=>{
  const gate=deferred(),draft=await pageDraft(),f=await fixture(t,{receiveDraft:()=>gate.promise});
  f.select(draft);await settle(()=>f.received.length===1);
  assert.equal(f.get('sidebar-tool-file').disabled,true);
  assert.equal(f.get('sidebar-tool-import-close').disabled,true);
  f.select(app);assert.equal(f.get('sidebar-tool-preview').hidden,true);
  gate.resolve();await settle(()=>f.get('sidebar-tool-import').hidden);
  assert.equal(f.get('script-source').value,draft.sourceUtf8);
  assert.equal(f.get('sidebar-tool-file').disabled,false);assert.equal(f.writes.length,0);
});
