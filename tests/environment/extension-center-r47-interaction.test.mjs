import {renderSidebarFixture} from '../helpers/sidebar-react-fixture.mjs';
import {createExtensionCenterDOM} from '../helpers/extension-center-react-dom.mjs';
import {parseHTML} from 'linkedom';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {reviewedQueue} from '../fixtures/ai-send-queue-reviewed.mjs';
import {createExtensionCenter} from '../../src/ui/extension-center.js';
import {extensionCenterText} from '../../src/ui/extension-center-localization.js';
import {OFFICIAL_STORE_WEBSITE} from '../../src/marketplace/store-website.js';
import {extensionCenterPinStorageKey,prioritizePinnedExtensionEntries} from '../../src/ui/extension-center-model.js';
import {SIDEBAR_TOOL_FORMAT,SIDEBAR_TOOL_STORE,sidebarToolPackageHash} from '../../src/ui/sidebar-tools/package.js';
import {SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE} from '../../src/ui/sidebar-tools/lifecycle.js';
import {TOOL_CLEANUP_STORE} from '../../src/ui/sidebar-tools/installation.js';
import {digest,digestUtf8} from '../../src/platform/protocol.js';

const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function settle(predicate){
  // Installed-package digest computation is asynchronous; do not use 80
  // event-loop ticks as an accidental deadline for a real readback.
  for(let i=0;i<150;i++){
    if(predicate())return;
    await new Promise(resolve=>setTimeout(resolve,10));
  }
  assert.ok(predicate(),'R4.7 DOM state failed to settle');
}

// Actual controller + React page in a DOM emulator; service responses and
// synthetic trusted event values do not establish native Chrome evidence.
const app={format:SIDEBAR_TOOL_FORMAT,id:'quick-notes',title:'快速笔记',description:'记录内容',version:'1.0.0',
  capabilities:['storage.local'],html:'<main>Notes</main>',css:'',js:'void 0;'};
const page=()=>({programId:'reader',manifestHash:'a'.repeat(64),installed:{
  programId:'reader',title:'阅读增强',revision:1,manifestHash:'a'.repeat(64),
  enabled:true,nativeState:'registered',sourceHash:'b'.repeat(64),
  authorization:{status:'active',generation:5,installationId:'original-installation'},
  pageRules:{matches:['https://example.com/*'],excludeMatches:[]}
}});

function fixture(t,{disabled=false,readError=false,installedRows=[app],cleanupRows=null,notify=null,debug=false}={}){
  const {doc,adapter,state}=createExtensionCenterDOM(t,{debug});
  // linkedom omits textarea.defaultValue reflection. React initializes a
  // controlled textarea through this browser property; mirror its text-only
  // behavior for the read-only manual URL, without claiming native selection.
  const textarea=doc.defaultView.HTMLTextAreaElement.prototype;
  if(!('defaultValue' in textarea)){
    Object.defineProperty(textarea,'defaultValue',{configurable:true,
      get(){return this.textContent;},set(value){this.textContent=String(value);}});
    t.after(()=>{delete textarea.defaultValue;});
  }
  const nodes=new Proxy({}, {get:(_,id)=>doc.getElementById(id)});
  const store=new Map([[SIDEBAR_TOOL_STORE,structuredClone(installedRows)],
    [SIDEBAR_TOOL_ENABLE_STORE,{[app.id]:!disabled}]]);
  if(cleanupRows)store.set(TOOL_CLEANUP_STORE,structuredClone(cleanupRows));
  let corrupt=readError,programs=[page()],failPages=false,allowed=true,pageAckOnly=false;
  let pageCandidates=null,pageUninstallMode='success',pageCleanupPending=[];
  const writes=[],uninstalls=[],invocations=[],changes=new Set();
  const api={
    runtime:{getURL:path=>'chrome-extension://fixture/'+path},
    permissions:{async contains(){return allowed;},async request(){throw Error('no implicit Chrome grant');}},
    tabs:{async create(opts){invocations.push(['market',opts]);}},
    storage:{
      onChanged:{addListener:cb=>changes.add(cb),removeListener:cb=>changes.delete(cb)},
      local:{async get(keys){
        if(corrupt)throw Error('storage unavailable');
        return Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(k=>[k,structuredClone(store.get(k))]));
      },async set(values){
        if(corrupt)throw Error('storage unavailable');
        const changed={};
        for(const [key,value] of Object.entries(values)){
          const oldValue=store.has(key)?structuredClone(store.get(key)):undefined;
          store.set(key,structuredClone(value));
          changed[key]={oldValue,newValue:structuredClone(value)};
        }
        for(const cb of changes)cb(changed,'local');
      }}
    }
  };
  const client={async request(name,args){
    if(name==='listPagePrograms'){
      if(failPages)throw Error('Page authority disconnected');
      return {catalog:pageCandidates??programs,
        cleanupPending:pageCleanupPending,
        installed:programs.map(row=>({...row.installed,programId:row.programId}))};
    }
    if(name==='uninstallPageProgram'){
      uninstalls.push(structuredClone(args));
      const index=programs.findIndex(row=>row.programId===args.programId);
      const program=programs[index];
      if(!program||program.installed.manifestHash!==args.manifestHash||
        program.installed.authorization.installationId!==args.installationId||
        program.installed.authorization.generation!==args.expectedGeneration)
        throw Object.assign(Error('stale Page receipt'),{code:'E_REVISION'});
      const receipt={programId:args.programId,manifestHash:args.manifestHash,
        installationId:args.installationId,uninstalled:true,nativeState:'unregistered',
        livePagesNeedRefresh:true};
      if(pageUninstallMode==='ack-only')return receipt;
      if(pageUninstallMode==='native-fail'||pageUninstallMode==='cleanup-unknown'){
        program.installed.enabled=false;
        program.installed.authorization.generation++;
        program.installed.authorization.status='disabled';
        program.installed.nativeState=pageUninstallMode==='native-fail'?'blocked':'disabled';
        if(pageUninstallMode==='cleanup-unknown')
          program.installed.managedCleanup={scope:'managed-ui-only',state:'unknown'};
        throw Object.assign(Error(pageUninstallMode),{code:pageUninstallMode==='native-fail'?
          'E_PAGE_UNINSTALL_PENDING':'E_PAGE_CLEANUP_PENDING'});
      }
      programs.splice(index,1);
      if(pageUninstallMode==='cleanup-pending'){
        const managedCleanup={scope:'managed-ui-only',state:'unknown',records:1,pendingRecords:1,
          pendingDocuments:[{tabId:42,documentId:'old-reader-page',tabTitle:'阅读草稿',state:'active'}]};
        pageCleanupPending=[{programId:args.programId,title:program.installed.title,
          revision:program.installed.revision,managedCleanup}];
        return {...receipt,cleanupPending:true,managedCleanup};
      }
      if(pageUninstallMode==='outcome-unknown')throw Object.assign(
        Error('Host reply lost'),{code:'E_EFFECT_UNKNOWN'});
      return receipt;
    }
    assert.equal(name,'setInstalledPageEnabled');
    writes.push(structuredClone(args));
    const program=programs.find(row=>row.programId===args.programId);
    assert.equal(args.manifestHash,program.manifestHash);
    assert.equal(args.installationId,program.installed.authorization.installationId);
    assert.equal(args.expectedGeneration,program.installed.authorization.generation);
    if(!pageAckOnly){
      program.installed.enabled=args.enabled;
      program.installed.authorization.generation++;
      program.installed.authorization.status=args.enabled?'active':'disabled';
      // Model the Authority's real native readback without inventing a
      // successful registration for a pre-existing blocked/pending state.
      if(['registered','disabled'].includes(program.installed.nativeState))
        program.installed.nativeState=args.enabled?'registered':'disabled';
    }
    return structuredClone(program.installed);
  }};
  const sidebarTools={
    openTool(id,options){invocations.push(['open',id,options]);return true;},
    openSettings(id){invocations.push(['settings',id]);return true;},
    async toggleEnabled(id,event){
      assert.equal(event.isTrusted,true);invocations.push(['toggle',id]);
      store.set(SIDEBAR_TOOL_ENABLE_STORE,{[id]:!store.get(SIDEBAR_TOOL_ENABLE_STORE)[id]});
      return true;
    },
    openOfficialReview(id){invocations.push(['review',id]);return false;},
    async retryUninstallCleanup(id,event){
      assert.equal(event.isTrusted,true);invocations.push(['cleanup',id]);
      store.set(TOOL_CLEANUP_STORE,{});return {state:'cleaned',toolId:id};
    },
    openImport(){invocations.push(['import']);return true;}
  };
  const taskWorkbench={navigate(tab){invocations.push(['navigate',tab]);return true;}};
  const ui=createExtensionCenter({api,client,doc,sidebarTools,taskWorkbench,extensionList:adapter,notify});
  t.after(()=>ui.dispose());
  const list=nodes['extension-center-list'];
  const buttons=key=>[...list.querySelectorAll('button[data-extension-key]')].filter(node=>node.dataset.extensionKey===key);
  const button=(key,action)=>buttons(key).find(node=>node.dataset.extensionAction===action);
  const rowMenu=()=>doc.getElementById('extension-center-row-menu');
  const menuItem=text=>rowMenu()?.children.find(node=>node.textContent.includes(text));
  return {doc,nodes,ui,state,store,api,client,sidebarTools,invocations,writes,uninstalls,list,button,buttons,rowMenu,menuItem,programs,
    setCorrupt:value=>{corrupt=value;},setFailPages:value=>{failPages=value;},
    setPageCatalog:value=>{pageCandidates=value;},setPageUninstallMode:value=>{pageUninstallMode=value;},
    setPageCleanupPending:value=>{pageCleanupPending=value;},
    setPageAckOnly:value=>{pageAckOnly=value;},
    setAllowed:value=>{allowed=value;},emitStorage:payload=>{
      const changed=payload??{[SIDEBAR_TOOL_ENABLE_STORE]:{oldValue:null,newValue:{}}};
      for(const cb of changes)cb(changed,'local');
    }};
}

function openMenuUninstall(f,key){
  const trigger=f.button(key,'more');
  assert.ok(trigger,'Installed extension needs a management entry');
  trigger.dispatch('click');
  const uninstall=f.menuItem('卸载');
  assert.ok(uninstall,'Uninstall must live inside the overflow menu');
  uninstall.dispatch('click');
  return trigger;
}

function assertQuietWebFeatureList(f){
  const listView=f.nodes['extension-center-list-view'];
  assert.equal(Boolean(f.doc.querySelector('.ec-list-setup')),false,'no setup banner above or inside the list');
  assert.equal(f.nodes['extension-center-web-features-status'],null,'no affected count or names');
  assert.equal(f.nodes['extension-center-web-features-pending'],null,'no alternate setup action');
  assert.equal(listView.querySelector('.ec-companion'),null,'no web status inserted between extension rows');
  assert.equal(listView.querySelector('[data-extension-action="companion-check"]'),null);
  assert.equal(listView.querySelector('.ec-web-features-settings'),null);
  const entry=f.nodes['extension-center-web-features'];
  assert.ok(entry,'help remains discoverable in More');
  assert.equal(entry.closest('#extension-center-menu')?.id,'extension-center-menu');
}

function assertWebFeatureSettings(f){
  const view=f.nodes['extension-center-web-features-view'];
  const button=view.querySelector('.ec-web-features-settings');
  assert.ok(button,'settings remains available even when Chrome access is already enabled');
  assert.equal(button.disabled,false);
  assert.equal(button.closest('details,[hidden],[inert]'),null,'settings is directly accessible');
  const setup=view.querySelector('.ec-web-features-setup');
  assert.equal(setup.querySelector('details'),null,'Chrome settings has no extra manual disclosure');
  const state=setup.querySelector('[role="status"]');
  assert.equal(state.closest('button,[role="switch"],[tabindex]'),null,'Chrome access is a read-only indicator');
  return {button,setup,state};
}

for(const outcome of ['confirmed','receipt-lost','readback-unavailable'])test(
  'checking an App companion separates the ready state from the action receipt: '+outcome,async t=>{
  const sourceUtf8='void 0;';
  const pageModule={format:'opendesk.page-install.v1',programId:'app.'+app.id,title:app.title,version:app.version,
    revision:1,entryFormat:'classic-userscript',sourceUtf8,sourceHash:await digestUtf8(sourceUtf8),
    pageRules:{matches:['https://example.com/*'],excludeMatches:[],runAt:'document_idle',allFrames:false,world:'USER_SCRIPT'}};
  const tool={...app,format:'opendesk.sidebar-tool.v2',capabilities:['page.module'],requires:{browserSdk:'1.0.0'},
    contributes:{contextMenus:[]},pageModule:{...pageModule,packageHash:await digest(pageModule)}};
  const key='app:'+tool.id;
  const notices=[];
  const f=fixture(t,{installedRows:[tool],notify:(...args)=>notices.push(args)});
  f.api.runtime.id='a'.repeat(32);
  const owner={toolId:tool.id,installEpoch:'companion-fixture',packageHash:await sidebarToolPackageHash(tool)};
  f.store.set(TOOL_REVOCATION_EPOCHS_STORE,{[tool.id]:owner.installEpoch});
  const companion={programId:tool.pageModule.programId,revision:tool.pageModule.revision,
    sourceHash:tool.pageModule.sourceHash,appOwner:owner,ready:false,nativeState:'waiting-user-scripts'};
  const request=f.client.request.bind(f.client);
  let checks=0,canRegister=outcome!=='confirmed';
  f.client.request=async(name,args)=>{
    if(name==='checkAppPage'){
      checks++;
      assert.deepEqual(args,owner);
      if(!canRegister)return {status:'verified',appOwner:owner,nativeState:'waiting-user-scripts'};
      companion.ready=true;companion.nativeState='registered';
      if(outcome==='receipt-lost')throw Error('check receipt lost');
      if(outcome==='readback-unavailable')f.setFailPages(true);
      return {status:'verified',appOwner:owner,nativeState:'registered'};
    }
    const result=await request(name,args);
    if(name==='listPagePrograms')result.installed.push(structuredClone(companion));
    return result;
  };
  await f.ui.refresh();
  const entry=f.nodes['extension-center-web-features'];
  const selector='[data-web-feature-key="'+key+'"]';
  const webRow=()=>f.nodes['extension-center-web-features-view']?.querySelector(selector);
  const readState=()=>f.state.toolbarModel.webFeatures.rows.find(item=>item.key===key);
  assertQuietWebFeatureList(f);
  f.nodes['extension-center-more'].dispatch('click');entry.dispatch('click');
  assert.equal(f.doc.activeElement.id,'extension-center-web-features-title');
  assert.equal(f.nodes['extension-center-list-view'].hidden,true);
  f.doc.dispatch('keydown',{key:'Escape'});
  assert.equal(f.doc.activeElement,f.nodes['extension-center-more']);
  assert.equal(f.nodes['extension-center-list-view'].hidden,false);
  f.nodes['extension-center-more'].dispatch('click');entry.dispatch('click');
  if(outcome==='confirmed'){
    const view=f.nodes['extension-center-web-features-view'];
    assert.equal(f.state.toolbarModel.webFeatures.chromeAccess,false);
    const off=assertWebFeatureSettings(f);
    assert.equal(off.state.textContent,'已关闭');
    assert.equal(view.querySelector('.ec-web-features-path'),null,'direct navigation needs no manual address');
    webRow().querySelector('[data-extension-action="companion-check"]').dispatch('click');
    await settle(()=>readState()?.checking===false&&Boolean(readState()?.result));
    assert.match(readState().result,/开启「允许用户脚本」后再检查/);
    f.api.userScripts={execute(){throw Error('access read must not execute scripts');},
      getScripts(){throw Error('permission read failed');}};
    await f.ui.refresh();
    assert.equal(f.state.toolbarModel.webFeatures.chromeAccess,null);
    assert.equal(assertWebFeatureSettings(f).state.textContent,'未确认');
    assert.equal(readState().result,null,'an unknown read does not repeat the old off instruction');
    assert.match(f.nodes['web-features-setting-note'].textContent,/请在 Chrome 设置中核对/);
    f.api.userScripts.getScripts=async()=>[];
    canRegister=true;
    await f.ui.refresh();
    assert.equal(f.state.toolbarModel.webFeatures.chromeAccess,true);
    const {button,setup,state}=assertWebFeatureSettings(f);
    assert.equal(button,off.button,'Chrome state changes keep the same settings button');
    assert.equal(setup,off.setup,'Chrome state changes keep the same setup section');
    assert.equal(state.textContent,'已开启');
    button.dispatch('click',{isTrusted:false});await tick();
    assert.equal(f.invocations.length,0,'synthetic settings clicks remain rejected after access is enabled');
    button.dispatch('click');await settle(()=>f.invocations.length===1);
    assert.deepEqual(f.invocations[0],['market',{url:'chrome://extensions/?id='+f.api.runtime.id}]);
    assert.equal(readState().result,null,'verified access invalidates the old off feedback');
    assert.equal(webRow().querySelector('.ec-companion-feedback'),null);
    assert.equal(webRow().querySelector('.ec-companion-status').textContent,'网页功能待检查');
    assertQuietWebFeatureList(f);
    assert.equal(checks,1,'reading the Chrome switch must not start registration');
  }
  const check=webRow().querySelector('[data-extension-action="companion-check"]');
  assert.ok(check,'a companion that needs setup offers a direct check');
  assert.equal(notices.length,0);
  check.focus();check.dispatch('click');
  // A ready row disappears before the check's receipt/finally settles.
  // Wait for the whole chain before a manual refresh can compete with its readback.
  await settle(()=>f.state.toolbarModel.webFeatures.busy===false);
  assert.equal(checks,outcome==='confirmed'?2:1);
  if(outcome==='readback-unavailable'){
    assert.equal(readState().state,'unverified');
    assert.equal(notices.length,0,'a receipt cannot bypass the readback');
    f.setFailPages(false);
  }
  await f.ui.refresh();
  assert.equal(f.state.toolbarModel.webFeatures.completed,outcome==='confirmed','only the same check receipt and readback establish completion');
  assert.equal(readState(),undefined,'ready installations are removed from the recovery model');
  assert.equal(webRow(),null,'successful readback removes the recovery row instead of adding a ready inventory');
  assertWebFeatureSettings(f);
  assert.ok(f.nodes['web-features-setup-title'],'the setting and its instructions remain available');
  assert.equal(f.doc.activeElement.id,'extension-center-web-features-title','removed recovery action returns focus to help');
  f.nodes['extension-center-web-features-back'].dispatch('click');
  assert.equal(f.doc.activeElement,f.nodes['extension-center-more']);
  assert.equal(f.list.querySelector('.ec-companion'),null);
  if(outcome==='confirmed'){
    assert.equal(notices.length,1,'readback and browsing details must not replay the check');
    assert.match(notices[0][0],/Chrome 已注册.+的网页脚本/);
    assert.equal(notices[0][1].position,'bottom-center');
    assert.match(notices[0][1].caption,/先保存.*再刷新该网页/);
  }else assert.equal(notices.length,0,'no success without both the check receipt and its readback');
});

test('web feature help stays in More without blocked apps and distinguishes the fixed queue from page execution',async t=>{
  const queue=structuredClone(reviewedQueue);
  const prompt=JSON.parse(await readFile('projects/prompt-shortcuts/prompt-shortcuts.opendesk-tool.json','utf8'));
  const f=fixture(t,{installedRows:[prompt,queue]});
  f.api.runtime.id='a'.repeat(32);
  const owner={toolId:queue.id,installEpoch:'fixed-review',packageHash:await sidebarToolPackageHash(queue)};
  f.store.set(TOOL_REVOCATION_EPOCHS_STORE,{[queue.id]:owner.installEpoch});
  const request=f.client.request.bind(f.client);
  f.client.request=async(name,args)=>{
    const result=await request(name,args);
    if(name==='listPagePrograms')result.installed.push({appOwner:owner,programId:queue.pageModule.programId,
      revision:queue.pageModule.revision,sourceHash:queue.pageModule.sourceHash,runtimeKind:'fixed-content',
      nativeState:'fixed',ready:true});
    return result;
  };
  await f.ui.refresh();
  assert.equal(f.doc.querySelector('.ec-list-setup'),null);
  assert.equal(f.doc.querySelector('.ec-list-header'),null);
  assert.equal(f.state.toolbarModel.webFeatures.rows.length,0,'fixed readiness is not page execution readiness');
  assertQuietWebFeatureList(f);
  f.nodes['extension-center-more'].dispatch('click');
  f.nodes['extension-center-web-features'].dispatch('click');
  const view=f.nodes['extension-center-web-features-view'];
  assert.match(view.textContent,/没有待检查的应用/);
  assert.equal(view.querySelector('.ec-web-features-path'),null);
  assert.equal(view.textContent.includes(prompt.title),false,'help does not list independent applications');
  assert.equal(view.textContent.includes(queue.title),false,'fixed runtime does not become a help inventory');
  assertWebFeatureSettings(f);
  assert.equal(view.querySelector('.ec-companion'),null,'no false ready or blocked row for the fixed queue');
  assert.ok(f.nodes['web-features-setup-title'],'the setting is discoverable even without affected apps');
  const settingNote=f.nodes['web-features-setting-note'];
  assert.match(settingNote.textContent,/手动开启/);
  const steps=view.querySelector('ol.ec-web-features-steps');
  assert.equal(steps.children.length,3);
  assert.match(steps.children[1].textContent,/打开对应扩展的详情.*切回原标签页或侧栏/);
  assert.match(steps.children[2].textContent,/先保存.*再刷新/);
  assert.ok([...view.querySelectorAll('summary')].some(summary=>summary.textContent.includes('网站访问权限')));
  f.api.userScripts={getScripts:async()=>[],execute(){throw Error('access read must not execute scripts');}};
  const window=f.doc.defaultView;
  window.dispatchEvent(new window.Event('focus'));
  await settle(()=>f.state.toolbarModel.webFeatures.chromeAccess===true);
  assert.match(settingNote.textContent,/已开启.*下一步/,'returning after enabling the switch updates the next step');
  const model=f.state.toolbarModel.webFeatures;
  model.onSettings({isTrusted:false});await tick();
  assert.equal(f.invocations.length,0,'synthetic clicks cannot navigate to Chrome settings');
  model.onSettings({isTrusted:true});await settle(()=>f.invocations.length===1);
  assert.deepEqual(f.invocations[0],['market',{url:'chrome://extensions/?id='+f.api.runtime.id}]);
  f.doc.dispatch('keydown',{key:'Escape'});
  assert.equal(f.doc.activeElement.id,'extension-center-more');
  await f.ui.refresh();
  assertQuietWebFeatureList(f);
  f.nodes['extension-center-more'].dispatch('click');f.nodes['extension-center-web-features'].dispatch('click');
  assert.equal(f.doc.activeElement.id,'extension-center-web-features-title','help can be found again after readback');
});

test('web feature help keeps mixed installed lists identical across affected and unaffected runtime states',async t=>{
  const queue=structuredClone(reviewedQueue);
  const f=fixture(t,{installedRows:[app,queue]});
  const owner={toolId:queue.id,installEpoch:'list-review',packageHash:await sidebarToolPackageHash(queue)};
  f.store.set(TOOL_REVOCATION_EPOCHS_STORE,{[queue.id]:owner.installEpoch});
  let runtime={runtimeKind:'fixed-content',nativeState:'fixed',ready:true};
  const request=f.client.request.bind(f.client);
  f.client.request=async(name,args)=>{
    const result=await request(name,args);
    if(name==='listPagePrograms')result.installed.push({appOwner:owner,
      programId:queue.pageModule.programId,revision:queue.pageModule.revision,
      sourceHash:queue.pageModule.sourceHash,...runtime});
    return result;
  };
  await f.ui.refresh();
  const ordinaryList=f.list.innerHTML;
  for(const state of [
    {runtimeKind:'user-script',nativeState:'waiting-user-scripts',ready:false},
    {runtimeKind:'user-script',nativeState:'activation-unconfirmed',ready:false},
    {runtimeKind:'user-script',nativeState:'blocked',ready:false,error:{code:'E_PAGE_INSTALLATION'}},
    {runtimeKind:'user-script',nativeState:'blocked',ready:false,error:{code:'E_PERMISSION'}},
    {runtimeKind:'user-script',nativeState:'blocked',ready:false,authorization:{status:'suspended'},error:{code:'E_USER_SCRIPTS_UNAVAILABLE'}},
    {runtimeKind:'user-script',nativeState:'unverified',ready:false},
    {runtimeKind:'user-script',nativeState:'registered',ready:true},
    {runtimeKind:'fixed-content',nativeState:'fixed',ready:true}
  ]){
    runtime=state;await f.ui.refresh();
    assertQuietWebFeatureList(f);
    assert.equal(f.list.innerHTML,ordinaryList,state.nativeState+' must not alter list content or controls');
    f.nodes['extension-center-more'].dispatch('click');f.nodes['extension-center-web-features'].dispatch('click');
    const row=f.nodes['extension-center-web-features-view'].querySelector('[data-web-feature-key="app:'+queue.id+'"]');
    assert.equal(Boolean(row),!state.ready,'only unresolved installs appear as recovery items');
    assertWebFeatureSettings(f);
    f.doc.dispatch('keydown',{key:'Escape'});
    assert.equal(f.doc.activeElement,f.nodes['extension-center-more']);
  }
  runtime={runtimeKind:'user-script',nativeState:'disabled',ready:false};
  f.store.set(SIDEBAR_TOOL_ENABLE_STORE,{[queue.id]:false});await f.ui.refresh();
  assertQuietWebFeatureList(f);
  f.nodes['extension-center-more'].dispatch('click');f.nodes['extension-center-web-features'].dispatch('click');
  assert.equal(f.nodes['extension-center-web-features-view'].querySelector('[data-web-feature-key]'),null,
    'disabled installs do not become a help inventory');
  assert.equal(f.invocations.length,0,'browsing help neither changes permissions nor runs an application');
});

test('web feature help reveals a copyable settings address only after navigation fails',async t=>{
  const f=fixture(t);f.api.runtime.id='a'.repeat(32);
  f.api.tabs.create=async()=>{throw Error('settings blocked');};
  await f.ui.refresh();
  f.nodes['extension-center-more'].dispatch('click');f.nodes['extension-center-web-features'].dispatch('click');
  const {button}=assertWebFeatureSettings(f);
  const view=f.nodes['extension-center-web-features-view'];
  assert.equal(view.querySelector('.ec-web-features-path'),null);
  button.dispatch('click');
  await settle(()=>f.state.toolbarModel.webFeatures.settingsFailed===true);
  await settle(()=>view.querySelector('.ec-web-features-path'));
  const path=view.querySelector('.ec-web-features-path');
  assert.equal(path.tagName,'TEXTAREA','manual URL can be selected for copying');
  assert.ok(path.getAttributeNames().some(name=>name.toLowerCase()==='readonly'));
  assert.equal(path.value,'chrome://extensions/?id='+f.api.runtime.id);
  assert.equal(path.closest('[hidden],[inert]'),null);
  assert.ok(view.querySelector('[role="alert"]')?.textContent.trim(),'opening failure stays visible alongside the manual path');
  assert.match(view.textContent,/允许运行用户脚本/);
  assertWebFeatureSettings(f);
  f.api.tabs.create=async opts=>{f.invocations.push(['market',opts]);};
  view.querySelector('.ec-web-features-settings').dispatch('click');
  await settle(()=>f.state.toolbarModel.webFeatures.settingsFailed===false);
  assert.deepEqual(f.invocations,[['market',{url:'chrome://extensions/?id='+f.api.runtime.id}]]);
  assert.equal(view.querySelector('[role="alert"]'),null);
  assert.equal(view.querySelector('.ec-web-features-path'),null);
  f.nodes['extension-center-web-features-back'].dispatch('click');
  assert.equal(f.doc.activeElement.id,'extension-center-more');
});

for(const state of ['activation-unconfirmed','blocked'])test('web feature help does not turn '+state+' into ready or an instruction to enable Chrome',async t=>{
  const queue=structuredClone(reviewedQueue);
  const other={...structuredClone(queue),id:'other-web-app',title:'另一个网页应用'};
  other.pageModule.programId='app.other-web-app';
  const {packageHash:previousHash,...pagePackage}=other.pageModule;
  other.pageModule.packageHash=await digest(pagePackage);
  const f=fixture(t,{installedRows:[queue,other]});
  const owners=await Promise.all([queue,other].map(async tool=>({toolId:tool.id,installEpoch:tool.id+'-review',packageHash:await sidebarToolPackageHash(tool)})));
  f.store.set(TOOL_REVOCATION_EPOCHS_STORE,Object.fromEntries(owners.map(owner=>[owner.toolId,owner.installEpoch])));
  const request=f.client.request.bind(f.client);
  f.client.request=async(name,args)=>{
    const result=await request(name,args);
    if(name==='listPagePrograms')for(const [index,tool] of [queue,other].entries())result.installed.push({appOwner:owners[index],programId:tool.pageModule.programId,
      revision:tool.pageModule.revision,sourceHash:tool.pageModule.sourceHash,runtimeKind:'user-script',
      nativeState:state,ready:false,...(state==='blocked'?{error:{code:'E_PAGE_INSTALLATION'}}:{})});
    return result;
  };
  await f.ui.refresh();
  assert.equal(f.state.toolbarModel.webFeatures.rows[0].state,state==='blocked'?'error':'unknown');
  assertQuietWebFeatureList(f);
  f.nodes['extension-center-more'].dispatch('click');f.nodes['extension-center-web-features'].dispatch('click');
  const rows=[...f.nodes['extension-center-web-features-view'].querySelectorAll('[data-web-feature-key]')];
  assert.equal(rows.length,2,'unresolved installations remain recoverable from help');
  for(const row of rows){
    assert.equal(row.dataset.companionState,state==='blocked'?'error':'unknown');
    assert.doesNotMatch(row.querySelector('.ec-companion-status').textContent,/待开启|就绪/);
  }
  assert.equal(f.invocations.length,0,'reading recovery state does not replay an unknown registration');
});

test('old Page cleanup is absent from ordinary list and details; More offers generic help',async t=>{
  const f=fixture(t);
  const managedCleanup={state:'unknown',records:135,pendingRecords:1,
    error:{code:'E_OLD_PAGE_CLEANUP',message:'Historical cleanup failure'},
    pendingDocuments:[{tabId:42,documentId:'old-document',tabTitle:'未保存草稿的旧页面',state:'active'}]};
  f.programs[0].installed.managedCleanup=managedCleanup;
  f.setPageCleanupPending([{programId:'removed',title:'已移除的测试扩展',revision:0,managedCleanup}]);
  await f.ui.refresh();
  const passive=/已移除的测试扩展|未保存草稿的旧页面|old-document|E_OLD_PAGE_CLEANUP|Historical cleanup failure|受管界面清理|清理待核对|网页恢复记录|标签页 #42|历史记录数/;
  assert.doesNotMatch(f.nodes['extension-center-list-view'].textContent,passive);
  assert.equal(f.nodes['debug-page-cleanup'],null);
  assert.equal(f.nodes['extension-center-page-recoveries'],null);
  f.button('page:reader','main').dispatch('click');
  const detail=f.nodes['extension-center-detail-body'];
  const diagnostics=detail.querySelector('details.ec-page-diagnostics');
  assert.ok(diagnostics?.querySelector('summary'),'ordinary Page has a technical disclosure');
  assert.equal(diagnostics.hasAttribute('open'),false);
  // Linkedom does not perform the native summary toggle.
  diagnostics.setAttribute('open','');
  assert.match(diagnostics.textContent,/Chrome 注册/);
  assert.doesNotMatch(detail.textContent,passive);
  f.nodes['extension-center-back'].dispatch('click');
  f.nodes['extension-center-more'].dispatch('click');
  f.nodes['extension-center-web-features'].dispatch('click');
  const webFeatures=f.nodes['extension-center-web-features-view'];
  assert.ok(webFeatures);
  const help=[...webFeatures.querySelectorAll('summary')].find(row=>row.textContent==='网页仍显示旧功能？');
  assert.ok(help,'generic help belongs in the Web Features page');
  assert.equal(help.parentElement.hasAttribute('open'),false);
  assert.match(help.parentElement.textContent,/保存草稿.*刷新网页/);
  assert.doesNotMatch(help.parentElement.textContent,passive);
  assert.deepEqual(f.invocations,[]);
});

test('debug recheck is read-only, deduplicates documents and preserves the last valid snapshot',async t=>{
  const f=fixture(t,{debug:true});
  const documents=[{tabId:42,documentId:'old-document',tabTitle:'未保存草稿的旧页面',state:'active'},
    {tabId:43,documentId:'untitled-document',state:'unobservable'}];
  const managedCleanup={state:'unknown',records:135,pendingRecords:2,pendingDocuments:documents};
  f.programs[0].installed.managedCleanup=managedCleanup;
  f.setPageCleanupPending([{programId:'reader',revision:0,managedCleanup},
    {programId:'removed',title:'已移除的测试扩展',revision:4,managedCleanup:{state:'unknown'}}]);
  await f.ui.refresh();
  const debug=f.nodes['debug-page-cleanup'];
  assert.ok(debug);
  assert.equal(debug.hasAttribute('open'),false);
  debug.setAttribute('open','');
  const status=()=>debug.querySelector('[role="status"]').textContent;
  const recheck=debug.querySelector('button');
  assert.equal(recheck.textContent,'重新核对');
  assert.equal(f.state.pageCleanup.known,true);
  const reader=f.state.pageCleanup.groups.find(({id})=>id==='reader');
  assert.equal(reader.title,'阅读增强');
  assert.deepEqual(reader.cleanup.records.map(({revision})=>revision),[1,0]);
  const group=[...debug.querySelectorAll('section')].find(node=>node.querySelector('h3').textContent==='阅读增强');
  const rows=[...group.querySelectorAll('ul[aria-label="可能受影响的网页"] li')];
  assert.deepEqual(rows.map(row=>row.querySelector('span').textContent),['未保存草稿的旧页面','页面 2']);
  for(const [index,{tabId,documentId}] of documents.entries())
    assert.ok(rows[index].textContent.includes('标签页 #'+tabId+' · '+documentId));
  assert.match(debug.textContent,/已移除的测试扩展.*暂未定位到具体网页/);

  const calls=[];
  let reply,release,appReads=0;
  f.client.request=(name,args)=>{
    calls.push([name,args]);
    if(name!=='listPagePrograms')assert.fail('unexpected debug request: '+name);
    if(reply instanceof Error)return Promise.reject(reply);
    return new Promise(resolve=>{release=()=>resolve(reply);});
  };
  const storageRead=f.api.storage.local.get;
  f.api.storage.local.get=(...args)=>{appReads++;return storageRead(...args);};
  t.after(()=>release?.());
  const snapshot=f.state.pageCleanup.groups;
  const recheckWith=async (value,{known})=>{
    const before=calls.length;
    reply=value;release=null;
    recheck.dispatch('click');
    if(!(value instanceof Error)){
      await settle(()=>Boolean(release));
      assert.equal(f.state.pageCleanup.checking,true);
      assert.equal(recheck.getAttribute('aria-disabled'),'true');
      assert.deepEqual(f.state.pageCleanup.groups,snapshot);
      recheck.dispatch('click');
      release();
    }
    await settle(()=>!f.state.pageCleanup.checking);
    assert.equal(f.state.pageCleanup.known,known);
    assert.deepEqual(calls.slice(before),[['listPagePrograms',{}]]);
  };
  const listed={installed:[f.programs[0].installed]};
  for(const invalid of [undefined,[{programId:'reader',managedCleanup:{state:'unknown',pendingDocuments:[null]}}],
    [{programId:'reader',managedCleanup:{state:'retired',pendingRecords:1}}]]){
    await recheckWith({...listed,cleanupPending:invalid},{known:false});
    assert.deepEqual(f.state.pageCleanup.groups,snapshot);
    assert.match(status(),/上次|未能|待重新核对/);
  }
  await recheckWith(new Error('Page authority disconnected'),{known:false});
  assert.match(debug.textContent,/未保存草稿的旧页面/);
  assert.ok(f.button('page:reader','main'),'a failed diagnostic read does not withdraw the product list');
  await recheckWith({installed:[{...listed.installed[0],managedCleanup:{state:'retired'}}],cleanupPending:[]},{known:true});
  assert.deepEqual(f.state.pageCleanup.groups,[]);
  assert.match(status(),/没有|暂无|无待/);
  assert.doesNotMatch(debug.textContent,/未保存草稿的旧页面|已移除的测试扩展/);
  assert.equal(debug.hasAttribute('open'),true);
  assert.equal(appReads,0,'debug recheck does not refresh App storage');
  assert.deepEqual([f.writes,f.uninstalls,f.invocations],[[],[],[]]);
});

for(const withCurrentCleanup of [false,true])test(
  'debug groups companion cleanup outside App details '+(withCurrentCleanup?'with its current receipt':'without a current cleanup receipt'),async t=>{
  // Reuse the archived, source-bound dual-installation fixture. The real
  // controller computes its package digest and decides companion ownership.
  const {tool}=await import('../../projects/ai-send-queue/tests/fixtures/legacy-installation.mjs');
  const {SEND_QUEUE_PIN}=await import('../../src/platform/host/send-queue-admission.js');
  const f=fixture(t,{installedRows:[tool],debug:true});
  const current={programId:SEND_QUEUE_PIN.pageProgramId,revision:SEND_QUEUE_PIN.pageRevision,
    sourceHash:SEND_QUEUE_PIN.pageSourceHash,manifestHash:'a'.repeat(64),
    enabled:true,nativeState:'registered',
    authorization:{installationId:'queue-install',generation:4,status:'active'},
    pageRules:{matches:['https://chatgpt.com/*'],excludeMatches:[],world:'USER_SCRIPT',
      runAt:'document_idle',allFrames:false}};
  const oldDocument={tabId:654321,documentId:'queue-historical-document',tabTitle:'队列旧页面',state:'cached'};
  const currentDocument={tabId:765432,documentId:'queue-current-document',tabTitle:'队列当前页面',state:'active'};
  const managedCleanup={state:'unknown',records:135,pendingRecords:1,pendingDocuments:[oldDocument]};
  if(withCurrentCleanup)current.managedCleanup={...managedCleanup,pendingDocuments:[currentDocument]};
  f.programs.splice(0,f.programs.length,{programId:current.programId,
    manifestHash:current.manifestHash,installed:current});
  f.setPageCleanupPending([
    {programId:current.programId,revision:current.revision-1,managedCleanup},
    {programId:'unrelated-program',revision:999,managedCleanup:{...managedCleanup,
      pendingDocuments:[{tabId:999999,documentId:'foreign-document',tabTitle:'不相关页面'}]}}
  ]);
  await f.ui.refresh();
  const key='app:'+tool.id;
  f.button(key,'more').dispatch('click');
  assert.equal(f.rowMenu().querySelector('[data-ec-context-action="detail"]'),null);
  f.menuItem('管理发送队列').dispatch('click');
  assert.equal(f.state.detailModel.key,key);
  assert.ok(f.state.detailModel.actions.some(row=>row.id==='queue-toggle'),
    'the actual package digest and Page identity must earn joint product management');
  const detail=f.nodes['extension-center-detail-body'];
  assert.doesNotMatch(detail.textContent,/队列旧页面|队列当前页面|不相关页面|清理待核对/);
  const expected=withCurrentCleanup?[currentDocument,oldDocument]:[oldDocument];
  const groups=f.state.pageCleanup.groups;
  assert.deepEqual(groups.map(({id})=>id),[current.programId,'unrelated-program']);
  const {cleanup}=groups[0];
  assert.deepEqual(cleanup.documents.map(({tabId,documentId})=>({tabId,documentId})),
    expected.map(({tabId,documentId})=>({tabId,documentId})));
  assert.deepEqual(cleanup.records.map(row=>row.revision),
    withCurrentCleanup?[current.revision,current.revision-1]:[current.revision-1]);
});

test('extension toolbar shop keeps Host feedback intact when opening a configured site',async t=>{
  const notices=[];
  const f=fixture(t,{notify:(message,options)=>notices.push({message,options})});
  await f.ui.refresh();
  const original=f.state.statusModel?.text;
  f.state.toolbarModel.onMarket();
  await tick();
  if(OFFICIAL_STORE_WEBSITE.status==='ready'){
    assert.deepEqual(notices,[]);
    assert.deepEqual(f.invocations.filter(row=>row[0]==='market'),
      [['market',{url:OFFICIAL_STORE_WEBSITE.url,active:true}]]);
  }else{
    assert.deepEqual(notices,[{
      message:'官方扩展商店尚未上线。',
      options:{type:'info',position:'bottom-center'}
    }]);
    assert.deepEqual(f.invocations.filter(row=>row[0]==='market'),[]);
  }
  assert.equal(f.state.statusModel?.text,original,'existing installation feedback remains intact');
});

test('extension toolbar shop icon never opens the bundled marketplace as a public catalog',async t=>{
  const f=fixture(t);await f.ui.refresh();
  assert.equal(f.state.toolbarModel.storeWebsiteStatus,OFFICIAL_STORE_WEBSITE.status);
  const label=f.doc.getElementById('extension-center-market').getAttribute('aria-label');
  if(OFFICIAL_STORE_WEBSITE.status==='ready')
    assert.match(label,/官方扩展商店/);
  else assert.match(label,/尚未上线/);
  f.state.toolbarModel.onMarket();
  await tick();
  const marketTabs=f.invocations.filter(row=>row[0]==='market');
  if(OFFICIAL_STORE_WEBSITE.status==='ready')
    assert.deepEqual(marketTabs,[['market',{url:OFFICIAL_STORE_WEBSITE.url,active:true}]]);
  else assert.deepEqual(marketTabs,[]);
  assert.ok(marketTabs.every(row=>!row[1].url.includes('ui/marketplace.html')));
});

test('Enabled app main opens the matching package; Page main opens its detail',async t=>{
  const f=fixture(t);
  const expectedEpoch='app-install-generation';
  f.store.set(TOOL_REVOCATION_EPOCHS_STORE,{[app.id]:expectedEpoch});
  await f.ui.refresh();
  assert.equal(f.list.querySelector('[data-extension-id="app:quick-notes"] .ec-type')?.textContent,'应用',
    'ordinary app type must not append a redundant side-panel label');
  assert.equal(f.list.querySelector('[data-extension-id="page:reader"] .ec-type')?.textContent,'应用 · 网页增强',
    'page program type remains distinct');
  const appKey='app:quick-notes',pageKey='page:reader';
  assert.deepEqual(f.buttons(appKey).map(n=>n.dataset.extensionAction),['main','more']);
  assert.deepEqual(f.buttons(pageKey).map(n=>n.dataset.extensionAction),['main','more']);
  const appMain=f.button(appKey,'main'),appMore=f.button(appKey,'more');
  appMore.dispatch('click');
  assert.equal(f.rowMenu().querySelector('[data-ec-context-action="detail"]'),null);
  assert.equal(f.menuItem('查看'),undefined);
  f.doc.dispatch('keydown',{key:'Escape'});
  assert.equal(f.doc.activeElement,appMore);
  appMain.dispatch('click',{isTrusted:false});
  assert.deepEqual(f.invocations,[]);
  appMain.dispatch('click');
  assert.deepEqual(f.invocations,[['open',app.id,{expectedPackage:app,expectedEpoch}]]);
  assert.equal(f.nodes['extension-center-detail'].hidden,true);

  f.button(pageKey,'main').dispatch('click');
  assert.equal(f.nodes['extension-center-detail'].hidden,false);
  assert.equal(f.state.detailModel.key,pageKey);
  assert.equal(f.state.detailModel.title,'阅读增强');
  assert.deepEqual(f.invocations,[['open',app.id,{expectedPackage:app,expectedEpoch}]],'Page navigation does not launch anything');
  assert.deepEqual(f.writes,[],'Page navigation does not mutate authorization');
});

test('R4.7 stopped app main opens Settings; overflow enable uses the sole trusted host route',async t=>{
  const f=fixture(t,{disabled:true});await f.ui.refresh();
  assert.deepEqual(f.buttons('app:quick-notes').map(n=>n.dataset.extensionAction),['main','more']);
  const row=f.list.children.find(node=>node.dataset.extensionId==='app:quick-notes');
  assert.match(row.children[0].textContent,/已停用/);
  f.button('app:quick-notes','main').dispatch('click');
  assert.equal(f.nodes['extension-center-detail'].hidden,true);
  assert.deepEqual(f.invocations,[['settings',app.id]]);
  assert.equal(f.store.get(SIDEBAR_TOOL_ENABLE_STORE)[app.id],false,'opening Settings does not enable the app');
  f.button('app:quick-notes','more').dispatch('click');
  assert.equal(f.rowMenu().hidden,false);
  assert.ok(f.menuItem('启用'));
  assert.equal(f.rowMenu().dataset.align,'center','the whole short Chinese app menu shares a centered axis');
  f.menuItem('启用').dispatch('click');
  await settle(()=>f.store.get(SIDEBAR_TOOL_ENABLE_STORE)[app.id]===true);
  await settle(()=>f.button('app:quick-notes','more')?.disabled===false);
  assert.deepEqual(f.invocations.filter(x=>x[0]==='toggle'),[['toggle','quick-notes']]);
  assert.equal(f.invocations.some(x=>x[0]==='open'),false,'enabling must never execute');
});

test('R5.5 installed Page survives loss or replacement of development candidates',async t=>{
  const f=fixture(t);f.setPageCatalog([]);
  await f.ui.refresh();
  assert.ok(f.button('page:reader','main'),'Installed Page is independent of Candidate');
  f.button('page:reader','main').dispatch('click');
  assert.equal(f.nodes['extension-center-detail'].hidden,false);
  assert.match(f.nodes['extension-center-detail-body'].textContent,/来源未记录/);
  assert.match(f.nodes['extension-center-detail-body'].textContent,/Chrome 注册/);
  f.setPageCatalog([{programId:'reader',manifestHash:'replaced',revision:99}]);
  await f.ui.refresh();
  assert.equal(f.nodes['extension-center-detail'].hidden,false);
});

test('R5.5 Page uninstall confirmation cancels without writes then deletes only after verified readback',async t=>{
  const f=fixture(t);await f.ui.refresh();
  f.button('page:reader','main').dispatch('click');
  const action=id=>id==='confirm-uninstall'?f.doc.querySelector('.od-uninstall-confirm'):
    id==='cancel-uninstall'?f.doc.querySelector('[data-uninstall-cancel]'):
    f.nodes['extension-center-detail-body'].querySelector('[data-ec-detail-action="'+id+'"]');
  assert.ok(action('uninstall'),'uninstall is in Extensions detail');
  action('uninstall').dispatch('click');
  assert.equal(f.uninstalls.length,0);
  assert.ok(action('confirm-uninstall'));
  action('cancel-uninstall').dispatch('click');
  assert.equal(f.uninstalls.length,0,'cancel never calls Page authority');
  assert.equal(f.programs.length,1);
  action('uninstall').dispatch('click');
  action('confirm-uninstall').dispatch('click');
  await settle(()=>f.uninstalls.length===1);
  assert.deepEqual(f.uninstalls[0],{programId:'reader',manifestHash:'a'.repeat(64),
    installationId:'original-installation',expectedGeneration:5});
  await settle(()=>f.nodes['extension-center-status'].textContent.includes('已卸载。'));
  assert.equal(f.programs.length,0);
  assert.equal(f.button('page:reader','main'),undefined);
  assert.deepEqual(f.writes,[],'uninstall never toggles an unrelated grant');
});

test('Page uninstall notifies once after readback without leaving a success region in the list',async t=>{
  const sources=JSON.parse(await readFile('official-pages/sources.json','utf8'));
  const catalogs=[JSON.stringify({schema:'opendesk.official-tools.releases.v1',
    sourceRepository:sources.sourceRepository,apps:[{id:'opendesk/'+app.id,toolId:app.id,
      kind:'sidebar-tool',installationPolicy:'optional',version:app.version,
      packageTitle:app.title,description:app.description,capabilities:app.capabilities,
      packagePath:'official-tools/'+app.id+'/'+app.id+'.opendesk-tool.json',
      bytes:100,sha256:'c'.repeat(64)}]}),JSON.stringify({
    schema:'opendesk.official-pages.releases.v1',sourceRepository:sources.sourceRepository,
    apps:sources.programs.map(({project,packageFile,publication,...row})=>
      ({...row,kind:'page-program',status:'blocked'}))})];
  t.mock.method(globalThis,'fetch',async url=>String(url).startsWith('https:')?
    new Response('offline',{status:404}):new Response(catalogs[String(url).includes('official-pages')?1:0]));
  const notices=[];
  const f=fixture(t,{notify:(message,options)=>notices.push({message,options})});
  await f.ui.refresh();await settle(()=>f.state.statusModel.text==='');
  openMenuUninstall(f,'page:reader');
  f.doc.querySelector('[data-uninstall-cancel]').dispatch('click');
  assert.deepEqual(notices,[],'cancellation cannot report success');
  openMenuUninstall(f,'page:reader');
  f.doc.querySelector('.od-uninstall-confirm').dispatch('click');
  await settle(()=>f.uninstalls.length===1&&!f.state.uninstallModel);
  assert.equal(f.programs.length,0);
  assert.equal(notices.length,1);
  assert.match(notices[0].message,/已卸载。/);
  assert.deepEqual(notices[0].options,{type:'success',position:'bottom-center',
    timeout:5000,pauseOnInteraction:false});
  assert.notEqual(f.state.statusModel.state,'success');
  assert.doesNotMatch(f.nodes['extension-center-status'].textContent,/已卸载。/);
  assert.equal(f.nodes['extension-center-status'].hidden,true,'a clean receipt needs no separate status region');
  await f.ui.refresh();
  assert.equal(notices.length,1,'passive refresh must not repeat the receipt');
});

test('unavailable notification retains a visible receipt before the list',async t=>{
  const f=fixture(t,{notify:()=>{throw Error('notification unavailable');}});
  await f.ui.refresh();
  openMenuUninstall(f,'page:reader');f.doc.querySelector('.od-uninstall-confirm').dispatch('click');
  await settle(()=>f.uninstalls.length===1&&!f.state.uninstallModel);
  assert.equal(f.state.statusModel.state,'success');
  assert.equal(f.nodes['extension-center-status'].hidden,false);
  assert.equal(f.nodes['extension-center-status'].parentElement.firstElementChild,
    f.nodes['extension-center-status']);
});

for(const mode of ['ack-only','outcome-unknown'])
test('Page uninstall '+mode+' keeps its unresolved record and never emits success',async t=>{
  const notices=[];
  const f=fixture(t,{notify:(message,options)=>notices.push({message,options})});
  await f.ui.refresh();f.setPageUninstallMode(mode);
  openMenuUninstall(f,'page:reader');
  f.doc.querySelector('.od-uninstall-confirm').dispatch('click');
  await settle(()=>f.uninstalls.length===1&&!f.state.uninstallModel);
  assert.deepEqual(notices,[]);
  assert.equal(f.nodes['extension-center-status'].hidden,false);
  assert.match(f.nodes['extension-center-status'].textContent,/未得到完整确认|E_EFFECT_UNKNOWN/);
  assert.equal(f.nodes['extension-center-status'].parentElement.firstElementChild,
    f.nodes['extension-center-status'],'persistent recovery information precedes the long list');
  assert.equal(f.uninstalls.length,1,'an uncertain result cannot replay removal');
});

test('Page success notification retains an unrelated installation read error',async t=>{
  const notices=[];
  const f=fixture(t,{notify:(message,options)=>notices.push({message,options})});
  await f.ui.refresh();f.setCorrupt(true);await f.ui.refresh();
  const error={...f.state.statusModel};
  f.button('page:reader','main').dispatch('click');
  await settle(()=>Boolean(f.state.detailModel?.pageControl));
  f.state.detailModel.pageControl.onToggle(false,{isTrusted:true});
  await settle(()=>f.writes.length===1&&!f.state.detailModel.busy);
  assert.equal(notices.length,1);assert.equal(notices[0].options.type,'success');
  assert.deepEqual(f.state.statusModel,error,'success and closing its Toast cannot clear the persistent cause');
  assert.equal(f.nodes['extension-center-status'].hidden,false);
});

test('app receipts reuse Host notifications without duplicating them or leaving inline success',async t=>{
  const notices=[];
  const notify=(message,options)=>notices.push({message,options});
  const f=fixture(t,{notify});await f.ui.refresh();
  const toggle=f.sidebarTools.toggleEnabled;
  f.sidebarTools.toggleEnabled=async(...args)=>{
    const result=await toggle(...args);notify('Host toggle',{type:'success'});return result;
  };
  f.button('app:quick-notes','more').dispatch('click');f.menuItem('停用').dispatch('click');
  await settle(()=>f.store.get(SIDEBAR_TOOL_ENABLE_STORE)[app.id]===false&&!f.state.rowsModel.pendingKey);
  assert.deepEqual(notices.map(row=>row.message),['Host toggle']);
  assert.notEqual(f.state.statusModel.state,'success');
  assert.doesNotMatch(f.nodes['extension-center-status'].textContent,/本机安装记录确认应用停用/);
  f.sidebarTools.uninstallFromList=async()=>{
    f.store.set(SIDEBAR_TOOL_STORE,[]);notify('Host uninstall',{type:'success'});return true;
  };
  openMenuUninstall(f,'app:quick-notes');f.doc.querySelector('.od-uninstall-confirm').dispatch('click');
  await settle(()=>!f.state.uninstallModel);
  assert.deepEqual(notices.map(row=>row.message),['Host toggle','Host uninstall']);
  assert.notEqual(f.state.statusModel.state,'success');
  assert.doesNotMatch(f.nodes['extension-center-status'].textContent,/数据与授权清理已完成/);
});

test('R5.11 overflow uninstall distinguishes same-name apps and restores focus after cancellation',async t=>{
  const f=fixture(t,{installedRows:[app,{...app,id:'notes-two',version:'2.0.0'}]});await f.ui.refresh();
  const trigger=f.button('app:notes-two','more');
  const cancelPaths=[()=>f.doc.querySelector('[data-uninstall-cancel]').dispatch('click'),
    ()=>f.doc.querySelector('[aria-label="关闭卸载确认"]').dispatch('click'),
    ()=>f.doc.dispatch('keydown',{key:'Escape'}),
    ()=>f.doc.querySelector('.od-uninstall-backdrop').dispatch('click')];
  for(const cancel of cancelPaths){
    trigger.focus();openMenuUninstall(f,'app:notes-two');
    const panel=f.doc.querySelector('[role="dialog"]');
    assert.match(panel.textContent,/ID：notes-two/);
    assert.match(panel.textContent,/版本：v2\.0\.0/,
      'the pinned package version identifies the uninstall target');
    assert.match(f.doc.getElementById(panel.getAttribute('aria-describedby')).textContent,/本地数据与网站授权.*不可撤销/);
    cancel();
    assert.equal(f.doc.querySelector('[role="dialog"]'),null);
    assert.equal(f.doc.activeElement,trigger);
    assert.equal(f.store.get(SIDEBAR_TOOL_STORE).length,2,'cancellation never changes persistent installation records');
  }
});

test('R5.4.1 pending list uninstall dispatches once and a failed Host action permits a newly reviewed retry',async t=>{
  const f=fixture(t);await f.ui.refresh();
  let rejectOperation,calls=0,originalEvent;
  f.sidebarTools.uninstallFromList=(id,baseline,event)=>{
    calls++;originalEvent=event;
    assert.equal(id,app.id);assert.deepEqual(baseline,app);
    return new Promise((resolve,reject)=>{rejectOperation=reject;});
  };
  openMenuUninstall(f,'app:quick-notes');
  const confirm=f.doc.querySelector('.od-uninstall-confirm');
  const event=confirm.dispatch('click');confirm.dispatch('click');
  assert.equal(originalEvent,event,'confirmation keeps the originating native event');
  assert.equal(calls,1);assert.equal(confirm.disabled,true);
  assert.equal(f.doc.querySelector('[data-uninstall-cancel]').disabled,true);
  assert.equal(f.doc.activeElement,f.doc.querySelector('[role="dialog"]'));
  f.doc.dispatch('keydown',{key:'Escape'});
  f.doc.querySelector('.od-uninstall-backdrop').dispatch('click');
  assert.ok(f.doc.querySelector('[role="dialog"]'),'pending removal cannot be dismissed and reissued');
  rejectOperation(Object.assign(Error('fixture uninstall failed'),{code:'E_FIXTURE_UNINSTALL'}));
  await settle(()=>f.doc.querySelector('[role="dialog"]')===null);
  assert.equal(calls,1,'failure never causes an automatic retry');
  assert.equal(f.store.get(SIDEBAR_TOOL_STORE).length,1);
  assert.match(f.nodes['extension-center-status'].textContent,/E_FIXTURE_UNINSTALL.*不会自动重试/);
  assert.equal(f.nodes['extension-center-status'].dataset.state,'error');
  const retry=f.button('app:quick-notes','more');assert.equal(retry.disabled,false);
  openMenuUninstall(f,'app:quick-notes');assert.ok(f.doc.querySelector('[role="dialog"]'));
  assert.equal(calls,1,'opening a fresh review still requires a new confirmation');
  f.doc.querySelector('[data-uninstall-cancel]').dispatch('click');
});

test('R5.5 stale Page generation invalidates an old uninstall confirmation before a write',async t=>{
  const f=fixture(t);await f.ui.refresh();
  f.button('page:reader','main').dispatch('click');
  const action=id=>id==='confirm-uninstall'?f.doc.querySelector('.od-uninstall-confirm'):
    id==='cancel-uninstall'?f.doc.querySelector('[data-uninstall-cancel]'):
    f.nodes['extension-center-detail-body'].querySelector('[data-ec-detail-action="'+id+'"]');
  action('uninstall').dispatch('click');
  f.programs[0].installed.authorization.generation++;
  await f.ui.refresh();
  assert.equal(action('confirm-uninstall'),null,'stale confirmation is no longer rendered');
  assert.equal(f.uninstalls.length,0);
  assert.match(f.nodes['extension-center-status'].textContent,/卸载确认已失效/);
});

for(const entry of ['list','detail'])test('Page '+entry+' uninstall notifies once without putting cleanup in the list',async t=>{
  const notices=[];
  const f=fixture(t,{notify:(message,options)=>notices.push({message,options})});
  const programId=entry==='list'?'opendesk.chatgpt-jump-top':'reader';
  const key='page:'+programId;
  const search=f.nodes['extension-center-search'];
  f.programs[0].programId=f.programs[0].installed.programId=programId;
  f.setPageUninstallMode('cleanup-pending');await f.ui.refresh();
  if(entry==='list'){
    search.value='回顶';search.dispatch('input');
    f.button(key,'more').dispatch('click');
    f.menuItem('卸载').dispatch('click');
  }else{
    f.button(key,'main').dispatch('click');
    f.doc.querySelector('[data-ec-detail-action="uninstall"]').dispatch('click');
  }
  f.doc.querySelector('.od-uninstall-confirm').dispatch('click');
  await settle(()=>f.uninstalls.length===1&&notices.length===1&&!f.doc.querySelector('[role="dialog"]'));
  assert.deepEqual(notices[0].options,{type:'info',position:'bottom-center'});
  assert.match(notices[0].message,/已卸载.*如果网页仍显示旧功能.*保存.*刷新/);
  assert.doesNotMatch(f.nodes['extension-center-status'].textContent,/旧网页清理待核对|卸载确认已失效/);
  assert.equal(f.nodes['extension-center-page-recoveries'],null);
  assert.doesNotMatch(f.nodes['extension-center-list-view'].textContent,/阅读草稿|旧网页清理待核对/);
  assert.equal(f.programs.length,0);
  assert.equal(f.button(key,'main'),undefined);
  assert.deepEqual(f.uninstalls,[{programId,manifestHash:'a'.repeat(64),
    installationId:'original-installation',expectedGeneration:5}]);
  await f.ui.refresh();
  assert.equal(f.button(key,'main'),undefined,'a retained cleanup is not an installed extension');
  assert.equal(notices.length,1,'passive refresh never replays the receipt');
  assert.equal(f.nodes['extension-center-page-recoveries'],null);
  assert.equal(f.uninstalls.length,1,'readback never retries cleanup or uninstall');
  if(entry==='list')assert.equal(search.value,'回顶','uninstall preserves the original alias search');
  else assert.ok(f.button('app:quick-notes','main'),'unrelated installation remains');
});

test('Page uninstall confirms a valid removal independently of malformed cleanup history',async t=>{
  const notices=[];
  const f=fixture(t,{notify:(message,options)=>notices.push({message,options})});
  await f.ui.refresh();
  f.setPageCleanupPending([{programId:'reader',managedCleanup:{state:'incomplete'}}]);
  openMenuUninstall(f,'page:reader');
  f.doc.querySelector('.od-uninstall-confirm').dispatch('click');
  await settle(()=>notices.length===1&&!f.state.uninstallModel);
  assert.equal(f.button('page:reader','main'),undefined,'verified installation readback still removes the row');
  assert.equal(notices[0].options.type,'success');
  assert.match(notices[0].message,/已卸载/);
  assert.doesNotMatch(f.state.statusModel.text,/卸载结果未得到完整确认/);
  assert.equal(f.uninstalls.length,1);
});

test('Page uninstall uses current cleanup readback and excludes embedded pages from recovery',async t=>{
  const notices=[];
  const f=fixture(t,{notify:(message,options)=>notices.push({message,options})});
  f.setPageUninstallMode('cleanup-pending');await f.ui.refresh();
  const request=f.client.request.bind(f.client);
  f.client.request=async(name,args)=>{
    const result=await request(name,args);
    if(name==='uninstallPageProgram'){
      assert.equal(result.cleanupPending,true);
      f.setPageCleanupPending([{programId:'app.embedded',title:'附属网页',managedCleanup:result.managedCleanup}]);
    }
    return result;
  };
  openMenuUninstall(f,'page:reader');
  f.doc.querySelector('.od-uninstall-confirm').dispatch('click');
  await settle(()=>notices.length===1&&!f.doc.querySelector('[role="dialog"]'));
  assert.equal(notices[0].options.type,'success');
  assert.doesNotMatch(notices[0].message,/如果网页仍显示旧功能.*保存/);
  assert.equal(f.nodes['extension-center-page-recoveries'],null);
  assert.equal(f.uninstalls.length,1);
});

test('Page uninstall readback survives passive installation refresh without replaying removal',async t=>{
  const notices=[];
  const f=fixture(t,{notify:(message,options)=>notices.push({message,options})});
  f.setPageUninstallMode('cleanup-pending');await f.ui.refresh();
  const request=f.client.request.bind(f.client);
  let release,reads=0;
  f.client.request=(name,args)=>{
    if(name==='listPagePrograms'&&++reads===1)
      return new Promise(resolve=>{release=()=>request(name,args).then(resolve);});
    return request(name,args);
  };
  openMenuUninstall(f,'page:reader');
  f.doc.querySelector('.od-uninstall-confirm').dispatch('click');
  await settle(()=>Boolean(release));
  f.doc.dispatch('opendesk:page-installation-changed');
  f.emitStorage();
  await tick();
  release();
  await settle(()=>!f.doc.querySelector('[role="dialog"]'));
  assert.equal(notices.length,1);
  assert.match(notices[0].message,/已卸载.*如果网页仍显示旧功能.*保存.*刷新/);
  assert.equal(f.nodes['extension-center-page-recoveries'],null);
  assert.equal(f.button('page:reader','main'),undefined);
  assert.equal(f.uninstalls.length,1,'notifications never replay the mutation');
  await settle(()=>reads===2);
  assert.ok(f.button('app:quick-notes','main'),'deferred refresh retains other installations');
});

for(const mode of ['native-fail','cleanup-unknown','ack-only','outcome-unknown'])
  test('R5.5 Page uninstall '+mode+' never fabricates success or automatically retries',async t=>{
    const f=fixture(t);f.setPageUninstallMode(mode);await f.ui.refresh();
    f.button('page:reader','main').dispatch('click');
    const action=id=>id==='confirm-uninstall'?f.doc.querySelector('.od-uninstall-confirm'):
      id==='cancel-uninstall'?f.doc.querySelector('[data-uninstall-cancel]'):
      f.nodes['extension-center-detail-body'].querySelector('[data-ec-detail-action="'+id+'"]');
    action('uninstall').dispatch('click');action('confirm-uninstall').dispatch('click');
    await settle(()=>f.uninstalls.length===1);
    await settle(()=>f.nodes['extension-center-status'].dataset.state==='error'&&
      !f.nodes['extension-center-status'].textContent.includes('卸载确认已失效'));
    assert.equal(f.uninstalls.length,1,'no implicit retry of an unknown native operation');
    assert.doesNotMatch(f.nodes['extension-center-status'].textContent,/已卸载/);
    if(mode==='cleanup-unknown'){
      assert.equal(f.programs[0].installed.managedCleanup.state,'unknown');
      assert.ok(f.button('page:reader','main'),'unknown cleanup retains recovery path');
    }else if(mode==='native-fail')assert.ok(f.button('page:reader','main'));
    else if(mode==='ack-only')assert.equal(f.programs.length,1);
    else assert.equal(f.programs.length,0);
  });

test('R4.7 installed Page menu is keyboard usable, invokes original generation-bound authority and returns focus',async t=>{
  const f=fixture(t);await f.ui.refresh();
  const more=f.button('page:reader','more');more.dispatch('click');
  assert.equal(more.getAttribute('aria-expanded'),'true');
  assert.equal(f.rowMenu().hidden,false);
  const menuLabels=[...f.rowMenu().children].map(node=>node.textContent);
  assert.deepEqual(menuLabels,['停用','导入网页增强包…','开发','置顶','卸载']);
  f.doc.dispatch('keydown',{key:'End'});
  assert.match(f.doc.activeElement.textContent,/卸载/,'End moves to the last (destructive) menu item');
  assert.equal(f.menuItem('查看'),undefined,'Page main is the detail entry');
  f.doc.dispatch('keydown',{key:'Home'});
  assert.equal(f.doc.activeElement.textContent,'停用');
  const esc=f.doc.dispatch('keydown',{key:'Escape'});
  assert.equal(esc.prevented,true);
  assert.equal(f.rowMenu(),null);
  assert.equal(f.doc.activeElement,more);
  more.dispatch('click');
  f.menuItem('导入网页增强包…').dispatch('click');
  assert.deepEqual(f.invocations,[['import']]);
  assert.equal(f.writes.length,0,'opening import does not change the installed Page');
  more.dispatch('click');
  f.menuItem('停用').dispatch('click');
  await settle(()=>f.writes.length===1);
  assert.deepEqual(f.writes[0],{programId:'reader',manifestHash:'a'.repeat(64),
    installationId:'original-installation',enabled:false,expectedGeneration:5});
  await settle(()=>f.button('page:reader','more')?.disabled===false);
  assert.equal(f.programs[0].installed.enabled,false);
  f.button('page:reader','more').dispatch('click');
  assert.equal(f.rowMenu().firstElementChild.textContent,'启用');
});

// DOM-double regression only; the Chromium fixture separately proves trusted clicks.
test('R33.3.4 extension menu arrows stay scoped and Tab restores focus',async t=>{
  const f=fixture(t);await f.ui.refresh();
  const more=f.button('page:reader','more');more.dispatch('click');
  const search=f.nodes['extension-center-search'];search.focus();
  const unrelated=f.doc.dispatch('keydown',{key:'ArrowDown'});
  assert.equal(unrelated.prevented,undefined,'Open menu must not hijack search keyboard input');
  assert.equal(f.doc.activeElement,search);
  assert.equal(f.rowMenu().hidden,false);
  f.menuItem('导入网页增强包…').focus();
  const tab=f.doc.dispatch('keydown',{key:'Tab'});
  assert.equal(tab.prevented,undefined,'Native Tab traversal must remain available');
  assert.equal(f.rowMenu(),null);
  assert.equal(f.doc.activeElement,more,'Focus returns to live trigger before native Tab');
});


test('R5.6 suspended Page offers direct restoration but cannot claim native success before readback',async t=>{
  const notices=[];
  const f=fixture(t,{notify:(message,options)=>notices.push({message,options})});
  f.programs[0].installed.authorization.status='suspended';
  f.programs[0].installed.nativeState='blocked';await f.ui.refresh();
  f.button('page:reader','more').dispatch('click');
  const restore=f.menuItem('恢复');
  assert.ok(restore,'suspended installed Page must offer Restore, not Disable');
  restore.dispatch('click');
  await settle(()=>f.writes.length===1);
  await settle(()=>f.button('page:reader','more')?.disabled===false);
  assert.deepEqual(f.writes[0],{
    programId:'reader',manifestHash:'a'.repeat(64),installationId:'original-installation',enabled:true,expectedGeneration:5
  });
  assert.equal(notices.length,1);
  assert.equal(notices[0].options.type,'info',
    'a still-blocked native registration must not be called a successful restore');
  assert.match(notices[0].message,/原生注册状态仍待核对/);
  assert.doesNotMatch(f.nodes['extension-center-status'].textContent,/原生注册状态仍待核对/);
});

test('R5.6 suspended Page with missing Chrome permission cannot change the installed generation',async t=>{
  const f=fixture(t);f.programs[0].installed.authorization.status='suspended';
  await f.ui.refresh();f.setAllowed(false);
  f.button('page:reader','more').dispatch('click');
  const restore=f.menuItem('恢复');assert.ok(restore);
  restore.dispatch('click');
  await settle(()=>f.nodes['extension-center-status'].textContent.includes('E_PERMISSION'));
  assert.equal(f.writes.length,0);
  assert.equal(f.programs[0].installed.authorization.generation,5);
});

test('R4.7 missing Page grant forbids enable; unreadable app status never fabricates primary or toggle',async t=>{
  const f=fixture(t);await f.ui.refresh();
  // First turn Page off through its installed authority.
  f.button('page:reader','more').dispatch('click');f.menuItem('停用').dispatch('click');
  await settle(()=>f.programs[0].installed.enabled===false);
  await settle(()=>f.button('page:reader','more')?.disabled===false);
  await f.ui.refresh();f.setAllowed(false);
  const pageMore=f.button('page:reader','more');
  assert.ok(pageMore,'Page menu trigger must survive authority refresh');
  pageMore.dispatch('click');
  const enable=f.menuItem('启用');
  assert.ok(enable,'Page re-enable menu missing: '+JSON.stringify({
    disabled:pageMore.disabled,expanded:pageMore.getAttribute('aria-expanded'),
    menuHidden:f.rowMenu().hidden,menuLabels:f.rowMenu().children.map(x=>x.textContent),
    pageEnabled:f.programs[0].installed.enabled,
    rowText:f.list.children.find(x=>x.dataset.extensionId==='page:reader')?.textContent
  }));
  enable.dispatch('click');
  await settle(()=>f.nodes['extension-center-status'].textContent.includes('E_PERMISSION'));
  assert.equal(f.writes.length,1,'missing Chrome grant prevents second authority mutation');
  await settle(()=>f.button('page:reader','more')?.disabled===false);
  f.setCorrupt(true);await f.ui.refresh();
  assert.equal(f.button('app:quick-notes','primary'),undefined);
  assert.equal(f.button('app:quick-notes','more'),undefined);
  assert.equal(f.button('app:quick-notes','main'),undefined,
    'an unverified cached registry is not an installed-app fact');
  assert.equal(f.nodes['extension-center-status'].dataset.state,'error',
    'an existing permission failure remains visible while registry authority is unavailable');
  assert.match(f.nodes['extension-center-empty-text'].textContent,/安装状态读取失败/);
  assert.equal(f.invocations.some(x=>x[0]==='toggle'),false);
});

test('R5.0 app uninstall from a second window retires the installed row and its old launch action',async t=>{
  const f=fixture(t);await f.ui.refresh();
  const staleOpen=f.state.rowsModel.rows.find(row=>row.key==='app:quick-notes').onSelect;
  // Independent storage authority removes the installed package.
  f.store.set(SIDEBAR_TOOL_STORE,[]);
  await f.ui.refresh();
  assert.equal(f.button('app:quick-notes','main'),undefined);
  staleOpen({isTrusted:true});
  assert.deepEqual(f.invocations,[],'a removed app cannot launch from an old row callback');
  f.nodes['extension-center-search'].value='quick-notes';
  f.nodes['extension-center-search'].dispatch('input');
  assert.equal(f.list.children.length,0,'search must not resurrect a catalog candidate');
  await f.ui.refresh();
  assert.equal(f.list.children.length,0,'refresh cannot resurrect an uninstalled app');
  const restart=fixture(t,{installedRows:[]});
  await restart.ui.refresh();
  assert.equal(restart.button('app:quick-notes','main'),undefined,
    'a new controller session must honor persistent removal');
});

test('R5.1 same-ID package replacement rejects stale launch; a Page revision change retires detail',async t=>{
  const f=fixture(t);await f.ui.refresh();
  const staleOpen=f.state.rowsModel.rows.find(row=>row.key==='app:quick-notes').onSelect;
  // Same tool ID and version are NOT the same approved bytes.
  const replacement={...app,html:'<main>Replaced outside this window</main>'};
  f.store.set(SIDEBAR_TOOL_STORE,[replacement]);
  await f.ui.refresh();
  staleOpen({isTrusted:true});
  assert.deepEqual(f.invocations,[],'an old launch action must not follow replaced bytes');
  f.button('app:quick-notes','main').dispatch('click');
  assert.deepEqual(f.invocations,[['open',app.id,{expectedPackage:replacement,expectedEpoch:null}]]);

  f.button('page:reader','main').dispatch('click');
  assert.equal(f.nodes['extension-center-detail'].hidden,false);
  f.programs[0]={...f.programs[0],manifestHash:'c'.repeat(64),
    installed:{...f.programs[0].installed,manifestHash:'c'.repeat(64),
      revision:2,sourceHash:'d'.repeat(64)}};
  await f.ui.refresh();
  assert.equal(f.nodes['extension-center-detail'].hidden,true,
    'an old Page detail cannot silently adopt a newly installed revision');
  assert.match(f.nodes['extension-center-status'].textContent,/固定身份已变化/);
});

test('R5.0 catalog-offline cleanup remains recoverable only from discovery',async t=>{
  const f=fixture(t,{installedRows:[],cleanupRows:{'cookie-editor':{version:'2.0.11',createdAt:1}}});
  await f.ui.refresh();
  assert.equal(f.nodes['extension-center-cleanups'].hidden,true,
    'cleanup journal never counts as an installed app');
  assert.equal(f.button('app:cookie-editor','main'),undefined);
  f.nodes['extension-center-menu'].querySelector('button[data-ec-scope="available"]').dispatch('click');
  const recovery=f.nodes['extension-center-cleanups'];
  assert.equal(recovery.hidden,false,'recovery remains reachable without a Catalog release');
  assert.match(recovery.textContent,/cookie-editor/);
  // The recovery-only row has to obey the same discovery search and kind filter.
  f.nodes['extension-center-search'].value='unrelated';
  f.nodes['extension-center-search'].dispatch('input');
  assert.equal(recovery.hidden,true,'unrelated search cannot expose an orphan cleanup');
  f.nodes['extension-center-search'].value='Cookie Editor';
  f.nodes['extension-center-search'].dispatch('input');
  assert.equal(recovery.hidden,false,'same-ID cleanup stays searchable by readable tool name');
  f.nodes['extension-center-menu'].querySelector('button[data-ec-kind="page"]').dispatch('click');
  assert.equal(recovery.hidden,true,'Page-only filter cannot display App cleanup');
  f.nodes['extension-center-menu'].querySelector('button[data-ec-kind="app"]').dispatch('click');
  assert.equal(recovery.hidden,false,'App filter restores matching cleanup action');
  recovery.querySelector('button').dispatch('click');
  await settle(()=>recovery.hidden===true&&f.nodes['extension-center-status'].dataset.state==='success');
  assert.deepEqual(f.invocations.filter(x=>x[0]==='cleanup'),[['cleanup','cookie-editor']]);
  assert.equal(f.nodes['extension-center-status'].dataset.state,'success');
  assert.deepEqual(f.store.get(TOOL_CLEANUP_STORE),{});
  assert.equal(f.button('app:cookie-editor','main'),undefined,'cleanup cannot reinstall code');
});

test('R5.1 corrupt cleanup journal withdraws installed authority instead of hiding its unsafe entry',async t=>{
  // Keep unrelated catalog reads from replacing the journal error in the shared status region.
  const sources=JSON.parse(await readFile(new URL('../../official-pages/sources.json',import.meta.url),'utf8'));
  const {sourceRepository}=sources;
  const catalogs={
    'chrome-extension://fixture/official-tools/catalog.json':{
      schema:'opendesk.official-tools.releases.v1',sourceRepository,apps:[{
        id:'opendesk/cookie-editor',toolId:'cookie-editor',kind:'sidebar-tool',
        installationPolicy:'optional',version:'2.0.11',packageTitle:'Cookie Editor',
        description:'Edit cookies',capabilities:app.capabilities,
        packagePath:'official-tools/cookie-editor/cookie-editor.opendesk-tool.json',
        bytes:100,sha256:'c'.repeat(64)
      }]
    },
    'chrome-extension://fixture/official-pages/catalog.json':{
      schema:'opendesk.official-pages.releases.v1',sourceRepository,
      apps:sources.programs.map(({project,packageFile,publication,...row})=>
        ({...row,kind:'page-program',status:'blocked',blockedReason:row.blockedReason??'Fixture only'}))
    }
  };
  t.mock.method(globalThis,'fetch',async url=>Object.hasOwn(catalogs,String(url))?
    new Response(JSON.stringify(catalogs[String(url)])):new Response('offline',{status:404}));
  const malformed={'cookie-editor':{version:'garbled-version',createdAt:1}};
  const f=fixture(t,{installedRows:[],cleanupRows:malformed});
  await f.ui.refresh();
  await tick(); // Let the fixture catalogs finish before checking status and discovery.
  assert.equal(f.nodes['extension-center-count'].textContent,'部分安装状态待核对');
  assert.equal(f.nodes['extension-center-status'].dataset.state,'error');
  assert.match(f.nodes['extension-center-status'].textContent,/卸载恢复记录损坏/);
  assert.equal(f.button('app:cookie-editor','main'),undefined);
  f.nodes['extension-center-menu'].querySelector('button[data-ec-scope="available"]').dispatch('click');
  f.nodes['extension-center-menu'].querySelector('button[data-ec-kind="app"]').dispatch('click');
  assert.equal(f.nodes['extension-center-cleanups'].hidden,true,
    'malformed journal cannot show a fake successful recovery control');
  assert.equal(f.list.children.length,0,
    'unknown installation authority cannot advertise a runnable or installable candidate');
  assert.deepEqual(f.store.get(TOOL_CLEANUP_STORE),malformed);
});

test('menu alignment follows the complete displayed group and language without executing actions',t=>{
  const {doc,adapter}=createExtensionCenterDOM(t);
  const trigger=doc.createElement('button');doc.body.append(trigger);
  let activated=0;
  for(const [locale,labels,expected] of [
    ['zh-CN',['停用','设置','查看','卸载'],'center'],
    ['zh-TW',['啟用','設定','更新','查看','卸載'],'center'],
    ['zh-CN',['查看'],'center'],
    ['zh-CN',['设置','查看详情','卸载'],'start'],
    ['zh-CN',['停用','AI','查看'],'start'],
    ['en',['Open','Save','View'],'start'],
    ['ja',['管理','設定','更新'],'start'],
    ['zh-CN',['查看','卸载…'],'start'],
    ['zh-CN',['查看',''],'start'],
    ['zh-CN',[],null],
    ['zh-CN',['查看','设置'],'center']
  ]){
    adapter.renderToolbar({locale});
    adapter.renderRowMenu(labels.map((label,index)=>({id:String(index),label,onClick:()=>activated++})),
      {trigger,title:'菜单',onClose:()=>{}});
    const menu=doc.getElementById('extension-center-row-menu');
    assert.equal(menu?.dataset.align??null,expected,`${locale}: ${labels.join(' / ')}`);
    if(menu)assert.deepEqual([...menu.querySelectorAll('button')].map(node=>node.textContent),labels,
      'alignment must not shorten labels or change action order');
  }
  assert.equal(activated,0,'presentation changes must never activate an action');
});

test('R4.7 context menu closes on outside click/scroll and never stays outside viewport',async t=>{
  const f=fixture(t);await f.ui.refresh();
  const more=f.button('app:quick-notes','more');
  more.dispatch('click');
  assert.ok(Number.parseInt(f.rowMenu().style.left,10)>=8);
  assert.ok(Number.parseInt(f.rowMenu().style.top,10)>=8);
  assert.ok(Number.parseInt(f.rowMenu().style.top,10)<640);
  const active=f.doc.activeElement,view=f.doc.defaultView;
  view.innerWidth=220;
  view.dispatchEvent(new view.Event('resize'));
  assert.equal(Number.parseInt(f.rowMenu().style.left,10),20,'resize repositions the existing menu inside the viewport');
  assert.equal(f.doc.activeElement,active,'repositioning must not take focus');
  f.doc.dispatch('click',{target:f.nodes['extension-center-search']});
  assert.equal(f.rowMenu(),null);
  more.dispatch('click');assert.equal(f.rowMenu().hidden,false);
  f.doc.dispatch('scroll');
  assert.equal(f.rowMenu(),null);
  assert.equal(more.getAttribute('aria-expanded'),'false');
});


test('R4.7 async app toggle is single-flight and exposes processing without a second action',async t=>{
  const f=fixture(t,{disabled:true});await f.ui.refresh();
  let release,requested=0;
  const gate=new Promise(resolve=>{release=resolve;});
  f.sidebarTools.toggleEnabled=(_id,event)=>{
    assert.equal(event.isTrusted,true);requested++;return gate;
  };
  f.button('app:quick-notes','more').dispatch('click');
  const oldAction=f.menuItem('启用');
  oldAction.dispatch('click');
  assert.equal(requested,1);
  const row=f.list.children.find(node=>node.dataset.extensionId==='app:quick-notes');
  assert.match(row.textContent,/处理中/);
  assert.equal(row.getAttribute('aria-busy'),'true');
  assert.equal(f.button('app:quick-notes','main').disabled,true);
  assert.equal(f.button('app:quick-notes','more').disabled,true);
  assert.equal(f.button('page:reader','main').disabled,true,
    'unrelated row must not appear clickable when the host blocks all actions');
  assert.equal(f.button('page:reader','more').disabled,true);
  assert.equal(f.list.getAttribute('aria-busy'),'true');
  oldAction.dispatch('click');
  assert.equal(requested,1,'stale menu click cannot start concurrent action');
  f.store.set(SIDEBAR_TOOL_ENABLE_STORE,{[app.id]:true});
  release(true);
  await settle(()=>f.button('app:quick-notes','more')?.disabled===false);
  assert.equal(f.button('app:quick-notes','more').disabled,false);
  assert.equal(f.button('page:reader','more').disabled,false);
  assert.equal(f.list.getAttribute('aria-busy'),'false');
  assert.equal(f.list.children.find(node=>node.dataset.extensionId==='app:quick-notes')
    .textContent.includes('处理中'),false);
});


test('R4.7 Page detail Back restores the main control independent of pointer focus',async t=>{
  const f=fixture(t);await f.ui.refresh();
  f.doc.activeElement=f.nodes['extension-center-search'];
  f.button('page:reader','main').dispatch('click');
  assert.equal(f.nodes['extension-center-detail'].hidden,false);
  f.nodes['extension-center-back'].dispatch('click');
  assert.equal(f.doc.activeElement.dataset.extensionKey,'page:reader');
  assert.equal(f.doc.activeElement.dataset.extensionAction,'main');
});


test('R4.8 unknown app installation remains readable without authorizing stale launch or Settings',async t=>{
  const f=fixture(t);await f.ui.refresh();
  const staleOpen=f.state.rowsModel.rows.find(row=>row.key==='app:quick-notes').onSelect;
  f.setCorrupt(true);
  await f.ui.refresh();
  assert.equal(f.button('app:quick-notes','main'),undefined);
  assert.equal(f.state.statusModel.state,'error');
  assert.match(f.state.statusModel.text,/读取失败.*storage unavailable/);
  staleOpen({isTrusted:true});
  assert.deepEqual(f.invocations,[]);
});

test('R4.8 first paint reports loading instead of a misleading empty or install state',async t=>{
  const f=fixture(t);
  const search=f.nodes['extension-center-search'];
  assert.equal(f.nodes['extension-center-status'].hidden,true,'routine startup does not use the persistent status');
  assert.match(f.doc.querySelector('.ec-list-loading').textContent,/正在读取已安装扩展/);
  assert.equal(f.nodes['extension-center-list'].getAttribute('aria-busy'),'true');
  assert.equal(f.nodes['extension-center-empty'].hidden,true);
  assert.equal(f.nodes['extension-center-count'].textContent,'正在读取扩展…');
  await f.ui.refresh();
  assert.equal(f.doc.querySelector('.ec-list-loading'),null);
  assert.equal(f.nodes['extension-center-search'],search,'readback keeps the same search input');
  assert.equal(f.nodes['extension-center-count'].textContent.endsWith('个扩展'),true);
});

test('R4.8 background refresh restores row-menu keyboard focus',async t=>{
  const f=fixture(t);await f.ui.refresh();
  const more=f.button('app:quick-notes','more');more.dispatch('click');
  assert.equal(f.rowMenu().hidden,false);
  assert.equal(f.doc.activeElement.tagName,'BUTTON');
  await f.ui.refresh();
  assert.equal(f.rowMenu(),null);
  assert.equal(f.doc.activeElement.dataset.extensionKey,'app:quick-notes');
  assert.equal(f.doc.activeElement.dataset.extensionAction,'more');
});

test('R4.8 removed Page during detail falls back to search, not hidden Back',async t=>{
  const f=fixture(t);await f.ui.refresh();
  f.button('page:reader','main').dispatch('click');
  assert.equal(f.nodes['extension-center-detail'].hidden,false);
  f.programs.splice(0);
  await f.ui.refresh();
  assert.equal(f.nodes['extension-center-detail'].hidden,true);
  assert.equal(f.doc.activeElement,f.nodes['extension-center-search']);
});

test('R5.14 Page detail keeps an accessible uninstall action without a duplicate Open',async t=>{
  const f=fixture(t);await f.ui.refresh();
  f.button('page:reader','main').dispatch('click');
  await settle(()=>Boolean(f.state.detailModel?.pageControl));
  const detail=f.nodes['extension-center-detail-body'];
  const uninstall=detail.querySelector('button[data-ec-detail-action="uninstall"]');
  assert.ok(uninstall?.className.includes('od-icon-button'),'uninstall uses the existing shared IconButton');
  assert.ok(uninstall.getAttribute('aria-label')&&uninstall.getAttribute('title')&&uninstall.querySelector('svg'));
  assert.ok([...detail.querySelectorAll('button')].every(button=>
    !String(button.getAttribute('aria-label')).includes('打开应用')));
  const css=await readFile('src/ui/extension-center.css','utf8');
  assert.doesNotMatch(css,/\.ec-detail-actions button\{[^}]*background:/);
  assert.match(css,/\.ec-detail-actions \.od-button\{font-size:12px;color:var\(--od-accent-ink\)\}/);
});

test('R4.9 rejected app toggle keeps an actionable error after the mandatory registry readback',async t=>{
  const f=fixture(t,{disabled:true});await f.ui.refresh();
  f.sidebarTools.toggleEnabled=()=>Promise.reject(Object.assign(
    new Error('用户取消了未保存草稿的启停操作'),{code:'E_DRAFT_CANCELLED'}));
  f.button('app:quick-notes','more').dispatch('click');
  f.menuItem('启用').dispatch('click');
  await settle(()=>f.button('app:quick-notes','more')?.disabled===false);
  assert.match(f.nodes['extension-center-status'].textContent,/E_DRAFT_CANCELLED/);
  assert.equal(f.nodes['extension-center-status'].dataset.state,'error');
  assert.equal(f.button('app:quick-notes','primary'),undefined,'cancelled enable must never launch');
  assert.deepEqual(f.store.get(SIDEBAR_TOOL_ENABLE_STORE),{[app.id]:false});
  await f.ui.refresh();
  assert.match(f.nodes['extension-center-status'].textContent,/E_DRAFT_CANCELLED/,
    'a successful background read must not erase the failed user action');
});

test('R4.9 rejected Page grant remains visible after unrelated refresh',async t=>{
  const f=fixture(t);await f.ui.refresh();
  f.programs[0].installed.enabled=false;
  await f.ui.refresh();f.setAllowed(false);
  f.button('page:reader','more').dispatch('click');
  f.menuItem('启用').dispatch('click');
  await settle(()=>f.nodes['extension-center-status'].textContent.includes('E_PERMISSION'));
  assert.equal(f.writes.length,0,'missing grant must not reach Page Authority mutation');
  await f.ui.refresh();
  assert.match(f.nodes['extension-center-status'].textContent,/E_PERMISSION/,
    'a refreshed list must not hide a real permission rejection');
  assert.equal(f.programs[0].installed.enabled,false);
});

test('R4.8 historical reference preserves the production toolbar action contract and shell styles',async()=>{
  const [html,preview]=await Promise.all([
    renderSidebarFixture(),
    readFile('prototypes/sidebar/extension-center-r47-frequency-first-preview.html','utf8')
  ]);
  const toolbar=(source,hostId)=>{
    const doc=parseHTML(source).document;
    const element=doc.querySelector('.ec-toolbar'),host=doc.getElementById(hostId);
    assert.ok(element&&host,'toolbar and import host must exist');
    let next=element.nextElementSibling;
    if(hostId==='extension-center-import-host'){
      const listView=doc.getElementById('extension-center-list-view');
      assert.equal(host.parentElement,listView,'the import host belongs to the list view');
      assert.equal(element.parentElement,listView.parentElement.parentElement,
        'the trusted React view owns both the toolbar and the results');
      // The original React Root owns the shared history/settings slot;
      // the historical preview predates it. No independent update trigger.
      next=listView.querySelector('aside.od-update-slot.no-trigger[aria-label="更新记录与提醒设置"]');
      assert.ok(next,
        'production retains the shared update slot before the import host');
      assert.equal(doc.querySelectorAll('#extension-center .od-update-slot').length,1);
      assert.ok(!next.querySelector('.od-update-trigger'),'no independent update trigger');
      assert.ok(!next.querySelector('#od-update-panel'),'history is closed on first paint');
      next=next.nextElementSibling;
    }else assert.equal(element.parentElement,host.parentElement,'the historical layout remains intact');
    if(next?.matches('input[type="file"][hidden]'))next=next.nextElementSibling;
    assert.ok(next===host,
      'only the shared production update slot and hidden file picker may precede the import host');
    return element.innerHTML;
  };
  const formal=toolbar(html,'extension-center-import-host');
  const demo=toolbar(preview,'preview-import-host');
  // Preserve the reviewed historical reference; the current React preview
  // has its own source-bound generator and check. Product copy may advance.
  // The historical preview predates the shared locale manager and its R6.10
  // move into More. Its locale control is not the current manager contract.
  const currentDoc=parseHTML(html).document;
  const list=currentDoc.getElementById('extension-center-list');
  const entry=currentDoc.getElementById('extension-center-web-features');
  assert.equal(currentDoc.getElementById('extension-center-list-heading')?.textContent,'扩展列表');
  assert.ok(currentDoc.getElementById('extension-center-menu').contains(entry),'help belongs to the existing More menu');
  assert.equal(currentDoc.querySelector('.ec-list-setup'),null,'no affected apps means a quiet list');
  assert.equal(entry.textContent,'网页功能帮助');
  const controls=source=>[...source.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1])
    .filter(id=>!['extension-center-language','extension-center-language-settings','extension-center-web-features'].includes(id)).sort();
  // The same More-menu history/settings action has a different historical ID.
  assert.deepEqual(controls(demo.replaceAll('preview-','extension-center-')
    .replaceAll('extension-center-update-records','extension-center-update-history')),controls(formal));
  for(const attribute of ['data-ec-kind','data-ec-scope','aria-controls']){
    const values=source=>[...source.matchAll(new RegExp(attribute+'="([^"]+)"','g'))]
      .map(match=>match[1].replaceAll('preview-','extension-center-')).sort();
    assert.deepEqual(values(demo),values(formal),attribute+' contract must stay aligned');
  }
  assert.match(preview,/href="\.\.\/\.\.\/src\/ui\/tool-shell\.css"/);
  assert.match(preview,/<nav class="workbench-nav" role="tablist"/);
  assert.match(preview,/id="workbench-tools" class="od-page"/);
  assert.match(preview,/SIMULATED_PREVIEW \/ NOT_NATIVE_CHROME/);
  assert.match(preview,/globalMenu\.hidden/);
  assert.doesNotMatch(preview,/class="tabs"/);
  assert.doesNotMatch(preview,/scenario==='busy'&&row\.id!=='notes'/,
    'busy preview must keep unrelated rows visible just like the product');
  assert.match(preview,/main\.disabled=blocked/);
  assert.match(preview,/primaryButton\.disabled=blocked/);
  assert.match(preview,/more\.disabled=blocked/);
  assert.doesNotMatch(preview,/scenario='normal';kind='all';scope='smart'/,
    'refresh must preserve user filters and current scenario');
});

test('R5.1 historical Cookie Editor reference labels its snapshot version and isolated update demo',async()=>{
  const preview=await readFile('prototypes/sidebar/extension-center-r47-frequency-first-preview.html','utf8');
  const version=preview.match(/默认场景的 Cookie Editor 为 v(\d+\.\d+\.\d+)/)?.[1];
  assert.ok(version,'historical reference must identify its own snapshot release');
  const cookie=preview.match(/\{id:'cookie-editor',[\s\S]*?description:'独立 Cookie 管理工具'\}/)?.[0];
  assert.ok(cookie,'preview must define a concrete Cookie Editor example');
  assert.ok(cookie.includes("version:'"+version+"'"),
    'historical preview must match its documented snapshot version');
  assert.ok(preview.includes('默认场景的 Cookie Editor 为 v'+version+'。'),
    'visible default scenario description must also match current release');
  assert.ok(preview.includes('历史候选 v2.0.11'),
    'historical upgrade demonstration must not be presented as the current release');
  assert.match(preview,/data-scenario="update"/);
  assert.match(preview,/cookie\.version='2\.0\.6';cookie\.update=true;cookie\.updateVerified=true;cookie\.releaseVersion='2\.0\.11'/);
  assert.match(preview,/function simulateUpdate\(row\)/);
  assert.match(preview,/确认模拟原位更新/);
  assert.match(preview,/不会自动运行新版代码/);
});

test('R5.0 Host false leaves a disabled App unchanged and reports unfinished draft confirmation',async t=>{
  const f=fixture(t,{disabled:true});await f.ui.refresh();
  f.sidebarTools.toggleEnabled=()=>false;
  f.button('app:quick-notes','more').dispatch('click');
  f.menuItem('启用').dispatch('click');
  await settle(()=>f.button('app:quick-notes','more')?.disabled===false);
  assert.equal(f.nodes['extension-center-status'].dataset.state,'error');
  assert.match(f.nodes['extension-center-status'].textContent,/启停尚未完成/);
  assert.deepEqual(f.store.get(SIDEBAR_TOOL_ENABLE_STORE),{[app.id]:false});
  assert.equal(f.button('app:quick-notes','primary'),undefined);
  await f.ui.refresh();
  assert.match(f.nodes['extension-center-status'].textContent,/启停尚未完成/,
    'a background read must not swallow the unfinished operation');
});

test('R5.0 failed background storage read does not replace the original Host action error',async t=>{
  const f=fixture(t,{disabled:true});await f.ui.refresh();
  f.sidebarTools.toggleEnabled=()=>false;
  f.button('app:quick-notes','more').dispatch('click');
  f.menuItem('启用').dispatch('click');
  await settle(()=>f.button('app:quick-notes','more')?.disabled===false);
  const actionError=f.nodes['extension-center-status'].textContent;
  assert.match(actionError,/启停尚未完成/);
  f.setCorrupt(true);await f.ui.refresh();
  assert.equal(f.nodes['extension-center-status'].textContent,actionError);
  assert.equal(f.nodes['extension-center-status'].dataset.state,'error');
  assert.equal(f.button('app:quick-notes','primary'),undefined,
    'an unreadable registry cannot regain a fabricated launch button');
});

test('R5.0 a true Host return without matching persisted enable state is not a success',async t=>{
  const f=fixture(t,{disabled:true});await f.ui.refresh();
  f.sidebarTools.toggleEnabled=()=>true;
  f.button('app:quick-notes','more').dispatch('click');
  f.menuItem('启用').dispatch('click');
  await settle(()=>f.button('app:quick-notes','more')?.disabled===false);
  assert.equal(f.nodes['extension-center-status'].dataset.state,'error');
  assert.match(f.nodes['extension-center-status'].textContent,/未从可信安装记录确认/);
  assert.equal(f.button('app:quick-notes','primary'),undefined);
});

test('R5.0 an unconfirmed launch is visible and does not claim that the tool opened',async t=>{
  const f=fixture(t);await f.ui.refresh();
  f.sidebarTools.openTool=()=>undefined;
  f.button('app:quick-notes','main').dispatch('click');
  assert.equal(f.nodes['extension-center-status'].dataset.state,'error');
  assert.match(f.nodes['extension-center-status'].textContent,/应用尚未打开/);
  assert.equal(f.button('app:quick-notes','primary'),undefined,
    'the list must not duplicate the full-row Open action');
});


test('R5.6 disabled setting with unconfirmed native unregister remains a pending result',async t=>{
  const notices=[];
  const f=fixture(t,{notify:(message,options)=>notices.push({message,options})});
  f.programs[0].installed.nativeState='blocked';await f.ui.refresh();
  f.button('page:reader','main').dispatch('click');
  await settle(()=>Boolean(f.state.detailModel?.pageControl));
  f.state.detailModel.pageControl.onToggle(false,{isTrusted:true});
  await settle(()=>f.writes.length===1);
  await settle(()=>f.state.detailModel.busy===false);
  assert.equal(f.programs[0].installed.enabled,false);
  assert.equal(f.programs[0].installed.nativeState,'blocked');
  assert.equal(notices.length,1);
  assert.match(notices[0].message,/Chrome (?:原生)?注销.*待核对/);
  assert.doesNotMatch(notices[0].message,/受管清理|网页清理/);
  assert.deepEqual(notices[0].options,{type:'info',position:'bottom-center'});
  assert.doesNotMatch(f.nodes['extension-center-status'].textContent,/原生注销或受管清理仍待核对/);
  assert.equal(f.state.detailModel.pageControl.state,'pending');
  assert.equal(f.state.detailModel.pageControl.enabled,false);
  assert.equal(f.state.detailModel.pageControl.status,'停用设置已保存 · Chrome 原生注销待核对');
  await f.ui.refresh();
  assert.equal(f.state.detailModel.pageControl.state,'pending');
  assert.equal(notices.length,1,'passive refresh must not repeat the receipt');
  assert.equal(f.writes.length,1,'passive refresh must not retry the write');
});

test('R5.6 old Page cleanup does not change the confirmed native disable status',async t=>{
  const f=fixture(t,{notify:()=>{throw Error('notification unavailable');}});
  f.programs[0].installed.managedCleanup={scope:'managed-ui-only',state:'unknown'};
  await f.ui.refresh();
  f.button('page:reader','more').dispatch('click');
  f.menuItem('停用').dispatch('click');
  await settle(()=>f.writes.length===1);
  await settle(()=>f.button('page:reader','more')?.disabled===false);
  assert.equal(f.programs[0].installed.nativeState,'disabled');
  assert.doesNotMatch(f.nodes['extension-center-status'].textContent,/原生注销或受管清理仍待核对/);
  f.button('page:reader','main').dispatch('click');
  await settle(()=>Boolean(f.state.detailModel?.pageControl));
  assert.equal(f.programs[0].installed.managedCleanup.state,'unknown');
  assert.doesNotMatch(f.nodes['extension-center-detail-body'].textContent,/清理待核对/);
  assert.equal(f.state.detailModel.pageControl.state,'off','native unregistration is independent of old-page cleanup');
});

test('R5.0 Page RPC acknowledgement without Authority state change cannot be reported successful',async t=>{
  const f=fixture(t);await f.ui.refresh();f.setPageAckOnly(true);
  f.button('page:reader','more').dispatch('click');
  f.menuItem('停用').dispatch('click');
  await settle(()=>f.button('page:reader','more')?.disabled===false);
  assert.equal(f.writes.length,1);
  assert.equal(f.programs[0].installed.enabled,true,'the real record was not modified');
  assert.equal(f.nodes['extension-center-status'].dataset.state,'error');
  assert.match(f.nodes['extension-center-status'].textContent,/未由 Page Authority 读回确认/);
});

test('R5.0 Page enabled setting must not masquerade as a verified native registration',async t=>{
  const notices=[];
  const f=fixture(t,{notify:(message,options)=>notices.push({message,options})});await f.ui.refresh();
  f.programs[0].installed.enabled=false;
  f.programs[0].installed.nativeState='pending';
  await f.ui.refresh();
  f.button('page:reader','more').dispatch('click');
  f.menuItem('启用').dispatch('click');
  await settle(()=>f.button('page:reader','more')?.disabled===false);
  assert.equal(f.programs[0].installed.enabled,true);
  assert.equal(notices.length,1);
  assert.equal(notices[0].options.type,'info');
  assert.match(notices[0].message,/原生注册状态仍待核对/);
  assert.doesNotMatch(f.nodes['extension-center-status'].textContent,/原生注册状态仍待核对/);
});

test('R5.0 official catalog stale responses and failures must be rejected by source guards',async()=>{
  const center=await readFile('src/ui/extension-center.js','utf8');
  assert.match(center,/const id=\+\+officialSequence/);
  assert.match(center,/id===officialSequence/);
  assert.match(center,/official=\[\];catalogError=/);
  assert.match(center,/dispose\(\)\{if\(disposed\)return;disposed=true;[^{}]*?sequence\+\+;officialSequence\+\+;pageOfficialSequence\+\+;discoveryGeneration\+\+;discoveryChannelGeneration\+\+;\s*listUninstallReview=null;uninstallReview=null;closeRowMenu\(\)/,
    'dispose invalidates each asynchronous catalog/discovery sequence and pending reviews before closing the menu');
});


test('R5.7 menu opens trusted import Host, never the global picker or language manager',async t=>{
  const f=fixture(t);await f.ui.refresh();
  const more=f.nodes['extension-center-more'],picker=f.nodes['extension-center-file'];
  let pickerClicks=0;
  picker.click=()=>{pickerClicks++;};
  assert.equal(f.doc.getElementById('extension-center-language-settings').closest('#extension-center-menu'),
    f.nodes['extension-center-menu']);
  more.dispatch('click');
  const importAction=f.nodes['extension-center-import'];
  assert.equal(importAction.textContent,'导入扩展…');
  importAction.dispatch('click');
  assert.deepEqual(f.invocations.filter(row=>row[0]==='import'),[['import']]);
  assert.equal(pickerClicks,0,'menu action must not open the obsolete hidden file picker');
  assert.equal(f.nodes['extension-center-menu'].hidden,true);
  assert.equal(f.doc.activeElement,more,'visible menu trigger is the modal focus return target');
  f.sidebarTools.openImport=()=>false;
  more.dispatch('click');f.nodes['extension-center-import'].dispatch('click');
  assert.match(f.nodes['extension-center-status'].textContent,/无法打开导入扩展弹窗/);
  assert.equal(f.nodes['extension-center-status'].dataset.state,'error');
  assert.equal(pickerClicks,0);
  f.sidebarTools.openImport=()=>{throw Error('Host unavailable');};
  more.dispatch('click');f.nodes['extension-center-import'].dispatch('click');
  assert.match(f.nodes['extension-center-status'].textContent,/Host unavailable/);
  assert.equal(pickerClicks,0);
});

test('R1.5 Page readback remains authoritative when unrelated Sidebar storage fails',async t=>{
  const f=fixture(t);await f.ui.refresh();
  f.button('page:reader','main').dispatch('click');
  await settle(()=>Boolean(f.state.detailModel?.pageControl));
  f.setCorrupt(true);
  // Controller regression: linkedom cannot perform a native React Aria press.
  // Pointer/Space Switch behavior has its own real Chromium coverage.
  f.state.detailModel.pageControl.onToggle(false,{isTrusted:true});
  await settle(()=>f.writes.length===1&&!f.state.detailModel.busy);
  assert.equal(f.programs[0].installed.enabled,false);
  assert.equal(f.state.statusModel.state,'success');
  assert.match(f.state.statusModel.text,/Page Authority 确认/);
});

test('R1.5 successful Page uninstall is confirmed while its official candidate remains',async t=>{
  const sources=JSON.parse(await readFile('official-pages/sources.json','utf8'));
  const apps=sources.programs.map(({project,packageFile,publication,...row})=>
    ({...row,kind:'page-program',status:'blocked'}));
  t.mock.method(globalThis,'fetch',async url=>{
    if(String(url).endsWith('official-pages/catalog.json'))return new Response(JSON.stringify({
      schema:'opendesk.official-pages.releases.v1',sourceRepository:sources.sourceRepository,apps}));
    throw Error('unrelated catalog unavailable');
  });
  const f=fixture(t),row=f.programs[0];
  row.programId=row.installed.programId='opendesk.ai-scroll-navigation';
  await f.ui.refresh();
  f.button('page:'+row.programId,'main').dispatch('click');
  // A focus-triggered Page read can clear the control briefly. Wait for the
  // actual installed control and catalog result, rather than a fixed tick count.
  await settle(()=>f.state.detailModel?.pageControl?.officialBlock);
  f.doc.getElementById('scroll-settings').dispatch('click');
  f.doc.querySelector('#scroll-management').dispatch('click');
  await settle(()=>{const action=f.doc.querySelector('[data-ec-detail-action="uninstall"]');return action&&!action.disabled;});
  f.doc.querySelector('[data-ec-detail-action="uninstall"]').dispatch('click');
  f.doc.querySelector('.od-uninstall-confirm').dispatch('click');
  await settle(()=>f.uninstalls.length===1&&f.state.statusModel.text.includes('卸载'));
  assert.equal(f.programs.length,0);
  assert.equal(f.state.statusModel.state,'success');
  assert.match(f.state.statusModel.text,/已卸载。/);
});

for(const transition of ['detail','back'])test('R1.8 action feedback clears on '+transition+' without changing Page authority',async t=>{
  const f=fixture(t,{disabled:true});await f.ui.refresh();
  f.programs[0].installed.enabled=false;
  f.programs[0].installed.nativeState='blocked';
  f.programs[0].installed.authorization.status='disabled';
  f.programs[0].installed.managedCleanup={scope:'managed-ui-only',state:'unknown'};
  const second=structuredClone(page());second.programId='mindmap';
  second.installed.programId='mindmap';second.installed.title='思维导图';
  f.programs.push(second);await f.ui.refresh();
  if(transition==='back')f.button('page:reader','main').dispatch('click');
  f.button('app:quick-notes','more').dispatch('click');
  f.menuItem('启用').dispatch('click');
  await settle(()=>f.state.statusModel.state==='success');
  assert.match(f.state.statusModel.text,/本机安装记录确认应用启用/);
  await f.ui.refresh();
  assert.match(f.state.statusModel.text,/本机安装记录确认应用启用/,'same-view refresh retains current result');
  if(transition==='back')f.nodes['extension-center-back'].dispatch('click');
  else f.button('page:reader','main').dispatch('click');
  assert.doesNotMatch(f.state.statusModel.text,/本机安装记录确认应用启用/,'old action cannot describe another view');
  assert.notEqual(f.state.statusModel.state,'success');
  if(transition==='back')f.button('page:reader','main').dispatch('click');
  await settle(()=>Boolean(f.state.detailModel?.pageControl));
  assert.equal(f.programs[0].installed.enabled,false);
  assert.equal(f.programs[0].installed.managedCleanup.state,'unknown');
  assert.equal(f.state.detailModel.pageControl.enabled,false);
  assert.equal(f.state.detailModel.pageControl.status,'停用设置已保存 · Chrome 原生注销待核对');
  f.nodes['extension-center-back'].dispatch('click');
  f.button('page:mindmap','main').dispatch('click');
  assert.doesNotMatch(f.state.statusModel.text,/本机安装记录确认应用启用/);
  assert.equal(f.writes.length,0,'navigation never changes Page permissions or enablement');
});

test('R1.8 detail and back retain read failures',async t=>{
  const f=fixture(t);await f.ui.refresh();
  f.setCorrupt(true);await f.ui.refresh();
  const before={...f.state.statusModel};
  assert.equal(before.state,'error');assert.match(before.text,/读取失败/);
  f.button('page:reader','main').dispatch('click');
  assert.deepEqual(f.state.statusModel,before);
  f.nodes['extension-center-back'].dispatch('click');
  assert.deepEqual(f.state.statusModel,before);
});

test('R1.8 detail and back retain catalog failures',async t=>{
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async()=>{throw Error('R18 catalog unavailable');};
  t.after(()=>{globalThis.fetch=originalFetch;});
  const f=fixture(t);await f.ui.refresh();
  await settle(()=>f.state.statusModel.state==='error'&&f.state.statusModel.text.includes('目录'));
  const before={...f.state.statusModel};
  f.button('page:reader','main').dispatch('click');
  assert.deepEqual(f.state.statusModel,before);
  f.nodes['extension-center-back'].dispatch('click');
  assert.deepEqual(f.state.statusModel,before);
});

for(const failure of ['read','catalog','pageCatalog'])for(const transition of ['detail','back'])
test('R1.8 navigation restores '+failure+' failure masked by action on '+transition,async t=>{
  const originalFetch=globalThis.fetch;
  let release;
  const gate=new Promise(resolve=>{release=resolve;});
  if(failure!=='read'){
    globalThis.fetch=async url=>{
      const target=String(url).includes(failure==='catalog'?'official-tools/catalog.json':'official-pages/catalog.json');
      if(target){await gate;throw Error('R18 masked '+failure);}
      return originalFetch(url);
    };
    t.after(()=>{release();globalThis.fetch=originalFetch;});
  }
  const f=fixture(t,{disabled:true});await f.ui.refresh();
  if(transition==='back')f.button('page:reader','main').dispatch('click');
  f.button('app:quick-notes','more').dispatch('click');
  f.menuItem('启用').dispatch('click');
  await settle(()=>f.state.statusModel.state==='success');
  if(failure==='read'){f.setCorrupt(true);await f.ui.refresh();}
  else {release();await tick();await tick();}
  assert.equal(f.state.statusModel.state,'success','action still owns current receipt');
  if(transition==='back')f.nodes['extension-center-back'].dispatch('click');
  else f.button('page:reader','main').dispatch('click');
  assert.equal(f.state.statusModel.state,'error');
  assert.match(f.state.statusModel.text,failure==='read'?/读取失败/:new RegExp('R18 masked '+failure));
});


test('pinned extension projection promotes installed rows only and preserves the original order within each group',()=>{
  const rows=[
    {key:'app:alpha',installed:true},
    {key:'app:webflow',installed:true},
    {key:'app:candidate',installed:false},
    {key:'app:unknown',installed:true,stateKnown:false}
  ];
  const ordered=prioritizePinnedExtensionEntries(rows,new Set(['app:webflow','app:candidate','app:unknown']));
  assert.deepEqual(ordered.map(row=>[row.key,row.pinned]),[
    ['app:webflow',true],['app:alpha',false],['app:candidate',false],['app:unknown',false]
  ]);
  assert.equal(rows[0].pinned,undefined,'projection must not mutate the registry rows');
});

test('pin controls have explicit labels in all supported Extension Center locales',()=>{
  const expected={
    'zh-CN':['置顶','取消置顶','已置顶'],
    en:['Pin to top','Remove from top','Pinned'],
    ja:['上部に固定','固定を解除','固定済み'],
    'zh-TW':['置頂','取消置頂','已置頂']
  };
  for(const [locale,labels] of Object.entries(expected)){
    assert.equal(extensionCenterText(locale,'pinAction'),labels[0]);
    assert.equal(extensionCenterText(locale,'unpinAction'),labels[1]);
    assert.equal(extensionCenterText(locale,'pinned'),labels[2]);
  }
});

test('installed extension pin/unpin persists, reorders the list, and does not invoke lifecycle operations',async t=>{
  const alpha={...app,id:'alpha',title:'Alpha'};
  const webflow={...app,id:'webflow',title:'WebFlow'};
  const f=fixture(t,{installedRows:[alpha,webflow]});
  await f.ui.refresh();
  const order=()=>[...f.list.querySelectorAll('li[data-extension-id]')].map(node=>node.dataset.extensionId).filter(key=>key.startsWith('app:'));
  assert.deepEqual(order(),['app:alpha','app:webflow']);
  const installedBefore=structuredClone(f.store.get(SIDEBAR_TOOL_STORE));
  const pinKey=extensionCenterPinStorageKey('app:webflow');
  f.button('app:webflow','more').dispatch('click');
  const pin=f.menuItem('置顶');
  assert.ok(pin,'installed extension overflow menu exposes Pin to top');
  pin.dispatch('click');
  await settle(()=>f.store.get(pinKey)===true&&order()[0]==='app:webflow'&&
    Boolean(f.list.querySelector('li[data-extension-id="app:webflow"] .ec-pin-indicator')));
  const indicator=f.list.querySelector('li[data-extension-id="app:webflow"] .ec-pin-indicator');
  assert.equal(indicator.getAttribute('aria-label'),'已置顶');
  assert.equal(f.list.querySelector('li[data-extension-id="app:webflow"]').getAttribute('data-pinned'),'true');
  f.button('app:webflow','more').dispatch('click');
  const unpin=f.menuItem('取消置顶');
  assert.ok(unpin,'the same menu changes to Remove from top');
  unpin.dispatch('click');
  await settle(()=>f.store.get(pinKey)===false&&order()[0]==='app:alpha'&&
    !f.list.querySelector('li[data-extension-id="app:webflow"] .ec-pin-indicator'));
  assert.deepEqual(f.store.get(SIDEBAR_TOOL_STORE),installedBefore,'pinning never rewrites installed package records');
  assert.equal(f.invocations.length,0,'pinning never opens, enables, disables or launches an extension');
  assert.equal(f.writes.length,0,'pinning never calls the Page Authority');
  assert.equal(f.uninstalls.length,0,'pinning never invokes uninstall');
});

test('stored pins are restored on refresh and external local changes synchronize the current list',async t=>{
  const alpha={...app,id:'alpha',title:'Alpha'};
  const webflow={...app,id:'webflow',title:'WebFlow'};
  const f=fixture(t,{installedRows:[alpha,webflow]});
  const order=()=>[...f.list.querySelectorAll('li[data-extension-id]')].map(node=>node.dataset.extensionId).filter(key=>key.startsWith('app:'));
  const pinKey=extensionCenterPinStorageKey('app:webflow');
  f.store.set(pinKey,true);
  await f.ui.refresh();
  assert.equal(order()[0],'app:webflow','persisted state is restored before the list refresh completes');
  assert.ok(f.list.querySelector('li[data-extension-id="app:webflow"] .ec-pin-indicator'));
  f.store.set(pinKey,false);
  f.emitStorage({[pinKey]:{oldValue:true,newValue:false}});
  await settle(()=>order()[0]==='app:alpha'&&
    !f.list.querySelector('li[data-extension-id="app:webflow"] .ec-pin-indicator'));
  assert.equal(f.store.get(SIDEBAR_TOOL_STORE).length,2);
  assert.equal(f.invocations.length,0);
});

test('failed pin persistence never reports a successful pin',async t=>{
  const webflow={...app,id:'webflow',title:'WebFlow'};
  const f=fixture(t,{installedRows:[webflow]});
  await f.ui.refresh();
  const pinKey=extensionCenterPinStorageKey('app:webflow');
  f.button('app:webflow','more').dispatch('click');
  const pin=f.menuItem('置顶');
  assert.ok(pin);
  f.setCorrupt(true);
  pin.dispatch('click');
  await settle(()=>f.state.statusModel.state==='error'&&f.state.statusModel.text.includes('无法保存扩展置顶状态'));
  assert.equal(f.store.get(pinKey),undefined);
  assert.notEqual(f.state.statusModel.state,'success');
});
