import {renderSidebarFixture} from '../helpers/sidebar-react-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';
import {createSidebarTools} from '../../src/ui/sidebar-tools.js';
import {createSidebarToolsView} from '../../src/ui/sidebar-tools-view.js';
import {SIDEBAR_TOOL_FORMAT,SIDEBAR_TOOL_FORMAT_V2,SIDEBAR_TOOL_STORE} from '../../src/ui/sidebar-tools/package.js';
import {PROGRAM_DRAFT_INPUT_LIMIT} from '../../src/ui/program-source.js';
import {createPageBundle} from '../../src/scripting/user-scripts/page-bundle.js';
import {digest,digestUtf8} from '../../src/platform/protocol.js';

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

async function fixture(t,{receiveDraft,requestPage,installed=[]}={}){
  const {document:doc,window}=parseHTML(await renderSidebarFixture());
  const view=createSidebarToolsView();
  view.attachRuntime({frameRoot:doc.getElementById('sidebar-tool-frame'),settingsControl:doc.getElementById('sidebar-tool-settings-open')});
  const get=id=>view.fields[id]||doc.getElementById(id),store=new Map(),writes=[],received=[],requests=[];
  const oldWindow=globalThis.window,oldFetch=globalThis.fetch;
  const offline=async()=>{throw new Error('Offline DOM fixture');};
  let host;
  t.after(()=>{host?.dispose();view.dispose();globalThis.window=oldWindow;globalThis.fetch=oldFetch;});
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
  const api={permissions:{contains:async()=>true,request:async()=>{assert.fail('existing permissions must not prompt');}},runtime:{getURL:path=>'chrome-extension://test/'+path},storage:{
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
  let installedPages=structuredClone(installed);
  const client={async request(operation,payload){
    requests.push({operation,payload});
    if(requestPage){
      const result=await requestPage(operation,payload);
      if(result!==undefined){
        // Fake Authority only: model the persistent list separately from its
        // mutation receipt so the controller must perform a real second read.
        if(operation==='importPageInstallPackage'&&result?.programId&&result?.manifestHash)
          installedPages=[...installedPages.filter(row=>row.programId!==result.programId),structuredClone(result)];
        return result;
      }
    }
    if(operation==='listPagePrograms')return {catalog:[],installed:structuredClone(installedPages)};
    assert.fail('unexpected '+operation);
  }};
  host=createSidebarTools({api,doc,view,taskWorkbench,foundationClient:client,lockManager,fetcher:offline});
  await host.ready;host.setVisible(true);
  // ExtensionCenter delegates import to this public Host action; its React
  // toolbar rendering is covered separately by extension-center-react-page.
  await tick();writes.length=0;
  const event=(id,type,{trusted=false}={})=>{const e=new window.Event(type,{bubbles:true});
    Object.defineProperty(e,'isTrusted',{value:trusted});
    return view.fields[id]?view.dispatch(id,type,e):get(id).dispatchEvent(e);};
  assert.equal(host.openImport(),true);
  assert.equal(get('sidebar-tool-import').hidden,false);
  function select(value,{name='draft.json',size,text}={}){
    const content=typeof value==='string'?value:JSON.stringify(value);
    const file={name,size:size??Buffer.byteLength(content),text:text||(()=>Promise.resolve(content))};
    view.dispatch('sidebar-tool-file','change',{target:{files:[file]}});return file;
  }
  return {doc,get,event,select,host,store,writes,received,requests};
}
function unchanged(f){
  assert.equal(f.received.length,0);assert.equal(f.writes.length,0);
  assert.equal(f.get('sidebar-tool-preview').hidden,true);
  assert.equal(f.get('sidebar-tool-install').disabled,true);
  assert.equal(f.get('sidebar-tool-frame').childElementCount,0);
}

for(const v2 of [false,true])test(`extension center distinguishes developer Page v${v2?2:1} from an installation package`,async t=>{
  const draft=await pageDraft({v2}),f=await fixture(t);
  f.doc.documentElement.dataset.opendeskTab='tools';
  f.select(draft);await settle(()=>!f.get('sidebar-tool-file-error').hidden);
  assert.match(f.get('sidebar-tool-file-error').textContent,/开发草稿.*不是网页增强安装包/);
  assert.equal(f.doc.documentElement.dataset.opendeskTab,'tools');unchanged(f);
});

async function installPackage(){
  const sourceUtf8='async function main(){document.title="Installed Page";}';
  const pkg={format:'opendesk.page-install.v1',programId:'local.page',title:'本地网页增强',version:'1.0.0',revision:1,
    entryFormat:'async-main',sourceUtf8,sourceHash:await digestUtf8(sourceUtf8),
    pageRules:{matches:['https://example.com/*'],excludeMatches:[],runAt:'document_idle',allFrames:false,world:'USER_SCRIPT'}};
  return {...pkg,packageHash:await digest(pkg)};
}
function receipt(pkg,overrides={}){return {programId:pkg.programId,revision:pkg.revision,sourceHash:pkg.sourceHash,
  manifestHash:'a'.repeat(64),pageRules:pkg.pageRules,enabled:true,nativeState:'registered',error:null,
  authorization:{installationId:'existing-installation',generation:3,status:'active'},...overrides};}

test('Page install reviews permissions and calls the existing Authority only after a trusted confirmation',async t=>{
  const pkg=await installPackage();let calls=0;
  const f=await fixture(t,{requestPage(operation,payload){if(operation==='importPageInstallPackage'){
    calls++;assert.deepEqual(payload,{package:pkg,expectedInstalledManifestHash:null,expectedGeneration:null});
    return receipt(pkg);
  }}});
  f.doc.documentElement.dataset.opendeskTab='tools';f.select(pkg,{name:'local.opendesk-page.json'});
  await settle(()=>!f.get('sidebar-tool-preview').hidden);
  assert.equal(calls,0);unchangedAuthoring(f);
  assert.match(f.get('sidebar-tool-preview-capabilities').textContent,/读取和修改.*https:\/\/example.com\/\*/);
  f.event('sidebar-tool-install','click',{trusted:true});
  await settle(()=>f.get('sidebar-tool-import').hidden);
  assert.equal(calls,1);
  assert.equal(f.doc.documentElement.dataset.opendeskTab,'tools');unchangedAuthoring(f);
  assert.match(f.get('sidebar-tool-status').textContent,/已安装网页增强.*打开或刷新/);
  assert.equal(f.get('page-install-import-status').hidden,true);
  assert.equal(f.get('sidebar-tool-install').disabled,true);
  assert.equal(f.requests.filter(r=>r.operation==='listPagePrograms').length,2,
    'Review and post-install readback each query the original Authority');
});
function unchangedAuthoring(f){assert.equal(f.received.length,0);assert.equal(f.writes.length,0);
  assert.equal(f.get('script-source').value,'');assert.equal(f.get('sidebar-tool-frame').childElementCount,0);}

test('same identity review carries the existing installation CAS and keeps the original receipt',async t=>{
  const pkg=await installPackage(),original=receipt(pkg);
  const f=await fixture(t,{installed:[original],requestPage(operation,payload){if(operation==='importPageInstallPackage'){
    assert.equal(payload.expectedInstalledManifestHash,original.manifestHash);
    assert.equal(payload.expectedGeneration,3);return original;
  }}});
  f.select(pkg);await settle(()=>!f.get('sidebar-tool-preview').hidden);
  assert.match(f.get('sidebar-tool-preview-description').textContent,/已经安装/);
  f.event('sidebar-tool-install','click',{trusted:true});
  await settle(()=>f.get('sidebar-tool-import').hidden);
  assert.match(f.get('sidebar-tool-status').textContent,/已更新网页增强/);
  assert.equal(f.get('page-install-import-receipt').hidden,true);
});

test('valid Page receipt without a durable installed-list readback does not close or retry',async t=>{
  const pkg=await installPackage();let calls=0;
  const f=await fixture(t,{requestPage(operation){
    if(operation==='importPageInstallPackage'){calls++;return receipt(pkg);}
    if(operation==='listPagePrograms')return {catalog:[],installed:[]};
  }});
  f.select(pkg);await settle(()=>!f.get('sidebar-tool-preview').hidden);
  f.event('sidebar-tool-install','click',{trusted:true});
  await settle(()=>f.get('page-install-import-status').attributes['data-state']==='pending-review');
  assert.equal(f.get('sidebar-tool-import').hidden,false,'uncertain result keeps review visible');
  assert.match(f.get('page-install-import-status').textContent,/E_PAGE_INSTALL_READBACK/);
  assert.equal(f.get('sidebar-tool-install').disabled,true);
  assert.equal(calls,1,'missing readback must not replay the installer');
});

for(const recover of [true,false])test(`lost Page install response is queried once without replay (recovered=${recover})`,async t=>{
  const pkg=await installPackage();let sent=0;
  const f=await fixture(t,{requestPage(operation){
    if(operation==='importPageInstallPackage'){sent++;throw new Error('response lost');}
    if(sent&&operation==='listPagePrograms')return {catalog:[],installed:recover?[receipt(pkg)]:[]};
  }});
  f.select(pkg);await settle(()=>!f.get('sidebar-tool-preview').hidden);
  f.event('sidebar-tool-install','click',{trusted:true});
  await settle(()=>f.get('page-install-import-status').attributes['data-state']==='pending-review');
  if(recover)assert.match(f.get('page-install-import-status').textContent,/已查询到原安装/);
  assert.equal(sent,1);assert.equal(f.get('sidebar-tool-install').disabled,true);unchangedAuthoring(f);
});

for(const alreadyInstalled of [false,true])test(`untrusted click cannot install or claim success (alreadyInstalled=${alreadyInstalled})`,async t=>{
  const pkg=await installPackage(),f=await fixture(t,{installed:alreadyInstalled?[receipt(pkg)]:[]});f.select(pkg);
  await settle(()=>!f.get('sidebar-tool-preview').hidden);
  const readsBeforeClick=f.requests.filter(r=>r.operation==='listPagePrograms').length;
  f.event('sidebar-tool-install','click');
  await settle(()=>f.get('page-install-import-status').attributes['data-state']==='pending-review');
  assert.equal(f.requests.filter(r=>r.operation==='importPageInstallPackage').length,0);
  assert.equal(f.requests.filter(r=>r.operation==='listPagePrograms').length,readsBeforeClick);
  assert.equal(f.get('page-install-import-receipt').hidden,true);
});

test('disabled Page update confirms fixed installation without claiming automatic execution',async t=>{
  const pkg=await installPackage(),disabled=receipt(pkg,{enabled:false,nativeState:'disabled',
    authorization:{installationId:'existing-installation',generation:4,status:'disabled'}});
  const f=await fixture(t,{installed:[disabled],requestPage(operation){if(operation==='importPageInstallPackage')return disabled;}});
  f.select(pkg);await settle(()=>!f.get('sidebar-tool-preview').hidden);
  f.event('sidebar-tool-install','click',{trusted:true});
  await settle(()=>f.get('sidebar-tool-import').hidden);
  assert.match(f.get('sidebar-tool-status').textContent,/已更新网页增强.*停用状态已保留/);
  assert.equal(f.get('page-install-import-receipt').hidden,true);
  assert.equal(f.get('sidebar-tool-install').disabled,true);
  unchangedAuthoring(f);
});

test('disabled Page receipt with unconfirmed native state remains pending, not installed',async t=>{
  const pkg=await installPackage(),unconfirmed=receipt(pkg,{enabled:false,nativeState:'blocked',
    authorization:{installationId:'existing-installation',generation:4,status:'disabled'}});
  const f=await fixture(t,{installed:[unconfirmed],requestPage(operation){if(operation==='importPageInstallPackage')return unconfirmed;}});
  f.select(pkg);await settle(()=>!f.get('sidebar-tool-preview').hidden);
  f.event('sidebar-tool-install','click',{trusted:true});
  await settle(()=>f.get('page-install-import-status').attributes['data-state']==='pending-review');
  assert.equal(f.get('page-install-import-receipt').hidden,true);
  assert.match(f.get('page-install-import-status').textContent,/未自动重试安装/);
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
    ['bad JSON','{invalid',{},/有效的扩展安装包 JSON/],
    ['unknown format',{...draft,format:'unknown'}, {},/工具/],
    ['unknown runtime',{...draft,runtimeKind:'main-world'}, {},/开发草稿/],
    ['Controller',{...draft,runtimeKind:'controller'}, {},/开发草稿/],
    ['bad build hash',{...draft,build:{...draft.build,sourceHash:'0'.repeat(64)}}, {},/开发草稿/],
    ['bad source hash',{...draft,authoring:{files:[{...draft.authoring.files[0],sha256:'0'.repeat(64)}]}}, {},/开发草稿/],
    ['unknown field',{...draft,extra:true}, {},/开发草稿/],
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


test('broken installation package never reaches review or either importer',async t=>{
  const pkg=await installPackage(),f=await fixture(t);f.select({...pkg,sourceHash:'0'.repeat(64)});
  await settle(()=>!f.get('sidebar-tool-file-error').hidden);unchanged(f);
});
