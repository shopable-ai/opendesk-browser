import {renderSidebarFixture} from '../helpers/sidebar-react-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {createSidebarTools} from '../../src/ui/sidebar-tools.js';
import {createSidebarToolsView} from '../../src/ui/sidebar-tools-view.js';
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
async function fixture(t,{receiveDraft,requestPage,installed=[],permissionGranted=true,grantPermission=async()=>false}={}){
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
  const api={permissions:{contains:async()=>permissionGranted,request:grantPermission},runtime:{getURL:path=>'chrome-extension://test/'+path},storage:{
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
  return {doc,get,event,select,host,store,writes,received,requests,
    drop:files=>view.dispatch('sidebar-tool-file','drop',{dataTransfer:{files}})};
}
async function installPackage(){
  const sourceUtf8='async function main(){document.title="Installed Page";}';
  const pkg={format:'opendesk.page-install.v1',programId:'opendesk.ai-scroll-navigation',title:'AI Scroll',version:'1.0.0',revision:1,
    entryFormat:'async-main',sourceUtf8,sourceHash:await digestUtf8(sourceUtf8),
    pageRules:{matches:['https://example.com/*'],excludeMatches:[],runAt:'document_idle',allFrames:false,world:'USER_SCRIPT'}};
  return {...pkg,packageHash:await digest(pkg)};
}
function receipt(pkg,overrides={}){return {programId:pkg.programId,revision:pkg.revision,sourceHash:pkg.sourceHash,
  manifestHash:'a'.repeat(64),pageRules:pkg.pageRules,enabled:true,nativeState:'registered',error:null,
  authorization:{installationId:'existing-installation',generation:3,status:'active'},...overrides};}


// Real SidebarTools controller and field view; only Chrome and Authority are doubles.
for(const change of ['error','paths','generation'])test(`AI Scroll rejects inconsistent durable readback: ${change}`,async t=>{
  const pkg=await installPackage(),accepted=receipt(pkg);let sent=0;
  const f=await fixture(t,{requestPage(operation){
    if(operation==='importPageInstallPackage'){sent++;return accepted;}
    if(operation==='listPagePrograms'&&sent){
      const row=structuredClone(accepted);
      if(change==='error')row.error={message:'registration unknown'};
      if(change==='paths')row.pageRules.matches=['https://example.com/other/*'];
      if(change==='generation')row.authorization.generation++;
      return {catalog:[],installed:[row]};
    }
  }});
  f.select(pkg);await settle(()=>!f.get('sidebar-tool-preview').hidden);
  f.event('sidebar-tool-install','click',{trusted:true});
  await settle(()=>f.get('page-install-import-status').attributes['data-state']==='pending-review'||f.get('sidebar-tool-import').hidden);
  assert.equal(f.get('sidebar-tool-import').hidden,false);
  assert.equal(f.get('page-install-import-status').attributes['data-state'],'pending-review');
  assert.doesNotMatch(f.get('sidebar-tool-status').textContent,/已更新网页增强|已安装网页增强/);
  assert.equal(sent,1);assert.equal(f.get('sidebar-tool-install').disabled,true);
});

test('AI Scroll permission denial keeps candidate uninstalled and discloses Chrome origin versus path',async t=>{
  let prompts=0;
  const f=await fixture(t,{permissionGranted:false,grantPermission:async request=>{
    prompts++;assert.deepEqual(request,{origins:['https://example.com/*']});return false;
  }});
  const pkg=await installPackage();pkg.pageRules.matches=['https://example.com/chat/*'];
  delete pkg.packageHash;pkg.packageHash=await digest(pkg);
  f.select(pkg);
  await settle(()=>!f.get('sidebar-tool-preview').hidden);
  assert.equal(prompts,0);
  assert.match(f.get('sidebar-tool-preview-capabilities').textContent,/Chrome.*https:\/\/example.com\/\*.*路径.*https:\/\/example.com\/chat\/\*/);
  f.event('sidebar-tool-install','click',{trusted:true});
  await settle(()=>f.get('page-install-import-status').attributes['data-state']==='permission-denied');
  assert.equal(prompts,1);assert.equal(f.requests.filter(r=>r.operation==='importPageInstallPackage').length,0);
  assert.equal(f.get('sidebar-tool-import').hidden,false);
  assert.doesNotMatch(f.get('sidebar-tool-status').textContent,/已安装网页增强/);
});

for(const mode of ['stale','unknown','disabled'])test(`AI Scroll install handles ${mode} without false active success`,async t=>{
  const pkg=await installPackage();let calls=0;
  const previous=receipt(pkg,{revision:0,enabled:mode!=='disabled'});
  const f=await fixture(t,{installed:[previous],requestPage(operation,payload){
    if(operation==='importPageInstallPackage'){
      calls++;assert.equal(payload.expectedGeneration,3);
      if(mode==='stale')throw Object.assign(new Error('review changed'),{code:'E_REVISION'});
      if(mode==='unknown')return receipt(pkg,{nativeState:'unknown'});
      return receipt(pkg,{enabled:false,nativeState:'disabled',authorization:{...previous.authorization,status:'disabled'}});
    }
  }});
  f.select(pkg);await settle(()=>!f.get('sidebar-tool-preview').hidden);
  f.event('sidebar-tool-install','click',{trusted:true});
  await settle(()=>f.get('sidebar-tool-import').hidden||f.get('page-install-import-status').attributes['data-state']==='pending-review');
  assert.equal(calls,1);
  if(mode==='disabled')assert.match(f.get('sidebar-tool-status').textContent,/原有停用状态已保留/);
  else{
    assert.equal(f.get('sidebar-tool-import').hidden,false);
    assert.equal(f.get('sidebar-tool-install').disabled,true);
    assert.doesNotMatch(f.get('sidebar-tool-status').textContent,/已更新网页增强|已安装网页增强/);
  }
});
