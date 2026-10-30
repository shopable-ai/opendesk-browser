import {encodeValue as encodeDelegationValue} from '../../src/platform/page-port/codec.js';
import {SIDEBAR_TOOL_ENABLE_STORE} from '../../src/ui/sidebar-tools/lifecycle.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {runInNewContext} from 'node:vm';
import {createSidebarTools,checkSidebarToolRequestBudget} from '../../src/ui/sidebar-tools.js';
import {requestStayFocusOperation,runTrustedStayFocusOperation} from '../../examples/sidebar-tools/stay-focus/trusted/tool-host.js';
import {createStayFocusPermissionControls} from '../../examples/sidebar-tools/stay-focus/trusted/host-controls.js';
import {FOCUS_ID,FOCUS_CAPABILITY,FOCUS_OPERATIONS} from '../../examples/sidebar-tools/stay-focus/trusted/policy.js';
import {AI_ID,AI_CAPABILITY,AI_OPERATIONS} from '../../examples/sidebar-tools/ai-vip-share/trusted/policy.js';
import {ADBLOCK_ID,ADBLOCK_CAPABILITY,ADBLOCK_OPERATIONS,ADBLOCK_RULE_FIRST,ADBLOCK_STORE,ADBLOCK_DNR_CLEANUP_STORE} from '../../examples/sidebar-tools/adblock/trusted/policy.js';
import {prepareAdblockUninstallCleanup} from '../../examples/sidebar-tools/adblock/trusted/host-controls.js';
import {createCurrentPageTarget} from '../../src/ui/current-page-target.js';
import {initSidebarToolSandbox,sandboxToolMessages} from '../../src/sidebar-tools/bridge.js';
import {createBrowserSdk} from '../../src/framework/sdk/browser.js';
import {BROWSER_HOST_PROTOCOL,BROWSER_MENU_GRANTS_STORE} from '../../src/framework/sdk/browser-contract.js';
import {MANAGED_SITE_BUDGET_PROTOCOL,MANAGED_SITE_RUNTIME_CONTRACT} from '../../src/platform/host/managed-site-runtime-contract.js';
import {ANALYTICS_PROTOCOL} from '../../src/analytics/contract.js';
import {SIDEBAR_TOOL_FORMAT,SIDEBAR_TOOL_STORE,sidebarToolStorageKey,sidebarToolPackageHash} from '../../src/ui/sidebar-tools/package.js';
import {officialToolFixture,officialFixtureFetch,officialFixtures} from '../helpers/official-tools.mjs';
import {OFFICIAL_STAY_FOCUS_RELEASE_URL as OFFICIAL_FOCUS_LATEST_URL} from '../../src/sidebar-tools/official-catalog.js';
import {OFFICIAL_READING_TOC_RELEASE} from '../../src/sidebar-tools/official-reading-toc.js';
import {TRUSTED_BOOKMARK_COMPONENT_VERSION} from '../../src/ui/trusted-bookmark-admission.js';
import {admitsTrustedPrompt,TRUSTED_PROMPT_VERSION} from '../../src/ui/trusted-prompt-admission.js';
import {MARKET_PROVENANCE_STORE,MARKET_OPERATIONS_STORE,reconcileMarketOperation,recoverMarketOperation,
  TOOL_CLEANUP_STORE,retryUninstalledToolCleanup,getPendingToolCleanups,installReviewedSidebarTool,
  TOOL_REVOCATION_EPOCHS_STORE,recordToolUninstall} from '../../src/ui/sidebar-tools/installation.js';
import {CLIP_SITE_STORE} from '../../projects/web-markdown-clipper/trusted/policy.js';
import {installedSiteAllowed,changeInstalledSiteAccess} from '../../src/ui/sidebar-tools/site-grants.js';
import {CAPTURE_SITE_STORE} from '../../src/knowledge/policy.js';
import {READING_TOC_SITE_STORE,READING_TOC_VISIBILITY_STORE,READING_TOC_PAGE_RULES_STORE,READING_TOC_PLACEMENT_PREFIX,changeReadingTocVisibility,changeTocSiteAllowed,tocSiteAllowed} from '../../projects/reading-toc/trusted/policy.js';
import {createSidebarToolsView} from '../../src/ui/sidebar-tools-view.js';
import {parseHTML} from 'linkedom';

// Controller tests use ToolHost's state/actions and real runtime elements.
// Only the iframe message transport is stubbed, never the retired product DOM.
function toolRuntimeFixture() {
  const {document:doc}=parseHTML('<html><body><div id="extension-center-list"></div></body></html>');
  const createElement=doc.createElement.bind(doc);
  doc.createElement=tag=>{
    const node=createElement(tag);
    if(tag==='iframe')Object.defineProperty(node,'contentWindow',{value:{sent:[],postMessage(message){this.sent.push(message);}}});
    return node;
  };
  const view=createSidebarToolsView();
  const runtime={frameRoot:doc.createElement('div'),settingsControl:doc.createElement('button')};
  doc.body.append(runtime.frameRoot,runtime.settingsControl);
  view.attachRuntime(runtime);
  const elements={...view.fields,'sidebar-tool-frame':runtime.frameRoot};
  const emit=(field,type,event={})=>view.dispatch(field.key,type,event);
  const selectFile=file=>emit(elements['sidebar-tool-file'],'change',{target:{files:[file]}});
  return {doc,view,runtime,elements,emit,selectFile};
}

test('R26 stopped details remain manageable and enabling waits for an explicit Open',async t=>{
  const key=sidebarToolStorageKey(sample.id),grants={[sample.id]:['https://example.com']};
  const store=new Map([[SIDEBAR_TOOL_STORE,[sample]],[SIDEBAR_TOOL_ENABLE_STORE,{[sample.id]:false}],
    [key,{note:'keep'}],[READING_TOC_SITE_STORE,grants]]);
  const f=await hostFixture(t,{store,startTool:false});
  f.host.openTool(sample.id);
  assert.equal(f.elements['sidebar-tool-display'].hidden,false);assert.equal(f.elements['sidebar-tool-frame'].children.length,0);
  assert.equal(f.elements['sidebar-tool-settings-open'].hidden,false);assert.equal(f.elements['sidebar-tool-visibility'].hidden,true);
  f.emit(f.elements['sidebar-tool-enable'],'click',{isTrusted:true});
  await settle(()=>store.get(SIDEBAR_TOOL_ENABLE_STORE)?.[sample.id]===true&&!f.elements['sidebar-tool-enable'].disabled);
  assert.equal(f.elements['sidebar-tool-frame'].children.length,0,'enable cannot execute code');
  assert.deepEqual(store.get(key),{note:'keep'});assert.deepEqual(store.get(READING_TOC_SITE_STORE),grants);
  // Opening an installed tool requires a genuine user gesture. Synthetic events
  // must never launch untrusted application code.
  f.emit(f.elements['sidebar-tool-launch'],'click',{isTrusted:false});
  assert.equal(f.elements['sidebar-tool-frame'].children.length,0,'untrusted click cannot execute code');
  f.emit(f.elements['sidebar-tool-launch'],'click',{isTrusted:true});
  await settle(()=>f.elements['sidebar-tool-frame'].children.length===1);
});

test('updating Prompt Shortcuts preserves other app frames, requests and stored data',async t=>{
  const candidate=await officialToolFixture('prompt-shortcuts');
  const previous={...candidate,version:'1.1.19',css:candidate.css+'\n/* old release */'};
  const other={...sample,id:'notes-other',title:'另一个独立应用'};
  const notes={notes:'keep original notes'},otherData={notes:'keep other notes'};
  const store=new Map([[SIDEBAR_TOOL_STORE,[previous,sample,other]],
    [sidebarToolStorageKey(sample.id),notes],[sidebarToolStorageKey(other.id),otherData],
    [TOOL_REVOCATION_EPOCHS_STORE,{[sample.id]:'notes-epoch',[other.id]:'other-epoch'}]]);
  const f=await hostFixture(t,{store});
  const originalFrame=f.frame,token=f.loaded.instance;
  const originalSet=f.api.storage.local.set;
  f.api.storage.local.set=async values=>{
    const changes=Object.fromEntries(Object.entries(values).map(([key,newValue])=>
      [key,{oldValue:structuredClone(store.get(key)),newValue:structuredClone(newValue)}]));
    await originalSet(values);f.changeStorage(changes);
  };
  const result=await installReviewedSidebarTool({api:f.api,lockManager:sharedLocks(),
    candidate,baseline:previous,reviewApproved:true});
  assert.equal(result.state,'installed');
  assert.equal(f.runtime.frameRoot.firstElementChild,originalFrame);
  assert.equal(originalFrame.isConnected,true,'another installation cannot detach the live iframe');
  assert.equal(originalFrame.contentWindow.sent.filter(row=>row.kind==='load').length,1);
  assert.equal(f.loaded.instance,token);
  f.ask('storage.get',{key:'notes'},'after-other-update');
  await settle(()=>originalFrame.contentWindow.sent.some(row=>row.requestId==='after-other-update'));
  const reply=originalFrame.contentWindow.sent.find(row=>row.requestId==='after-other-update');
  assert.equal(reply.ok,true);assert.equal(reply.result.value,notes.notes);
  assert.deepEqual(store.get(sidebarToolStorageKey(sample.id)),notes);
  assert.deepEqual(store.get(sidebarToolStorageKey(other.id)),otherData);
  assert.equal(store.get(TOOL_REVOCATION_EPOCHS_STORE)[sample.id],'notes-epoch');
  assert.equal(store.get(TOOL_REVOCATION_EPOCHS_STORE)[other.id],'other-epoch');
  f.host.closeTool();f.host.openTool(other.id);
  const nextFrame=f.runtime.frameRoot.firstElementChild;await nextFrame.onload();
  assert.equal(nextFrame.isConnected,true,'other installed apps can still open');
  assert.equal(nextFrame.contentWindow.sent[0].tool.id,other.id);
});

test('same-title installed tools keep distinct iframe identities without granting trust',async t=>{
  const lookalike={...sample,id:'same-title-local'};
  const store=new Map([[SIDEBAR_TOOL_STORE,[sample,lookalike]]]);
  const f=await hostFixture(t,{store,startTool:false});
  for(const tool of [sample,lookalike]){
    f.host.openTool(tool.id);
    const frame=f.runtime.frameRoot.children[0];await frame.onload();
    assert.equal(frame.contentWindow.sent[0].tool.id,tool.id);
    f.host.closeTool();
  }
  assert.equal(store.has(MARKET_PROVENANCE_STORE),false,'a title collision cannot create official provenance');
});

test('R1.6 same-ID Clipper package cannot claim shared navigation or hijack back',async t=>{
 const lookalike={...sample,id:'web-markdown-clipper',title:'用户自定义剪藏'};
 const f=await hostFixture(t,{tool:lookalike,store:new Map([[SIDEBAR_TOOL_STORE,[lookalike]]])});
 assert.equal(f.loaded.navigationAllowed,false,'release digest, not tool ID, admits shared header');
 const before=f.frame.contentWindow.sent.length;
 f.win.emit('message',{origin:'null',source:f.frame.contentWindow,
   data:{protocol:f.loaded.protocol,toolId:lookalike.id,instance:f.loaded.instance,
     kind:'navigation-state',page:'reader'}});
 assert.equal(f.elements['sidebar-tool-title'].textContent,lookalike.title,'forged business title is ignored');
 f.emit(f.elements['sidebar-tool-back'],'click');
 assert.equal(f.frame.contentWindow.sent.length,before,'unreviewed tool receives no trusted back action');
 assert.equal(f.runtime.frameRoot.children.length,0,'back returns to the extension list');
});
test('R1.7 exact official Prompt Shortcuts forwards Header New/Back without remounting',async t=>{
  const official=await officialToolFixture('prompt-shortcuts');
  const f=await hostFixture(t,{tool:official,store:new Map([[SIDEBAR_TOOL_STORE,[official]]])});
  assert.equal(f.loaded.navigationAllowed,true,'only verified release receives shared business navigation');
  const send=state=>f.win.emit('message',{origin:'null',source:f.frame.contentWindow,data:{
    protocol:f.loaded.protocol,toolId:official.id,instance:f.loaded.instance,
    kind:'navigation-state',state
  }});
  const verifyAction=(field,action)=>{
    const previous=f.frame.contentWindow.sent.length;
    f.emit(f.elements[field],'click');
    assert.equal(f.frame.contentWindow.sent.length,previous+1,action+' stays inside the active sandbox');
    const message=f.frame.contentWindow.sent.at(-1);
    assert.equal(message.kind,'navigation-action');
    assert.equal(message.action,action);
    assert.equal(message.instance,f.loaded.instance);
    assert.equal(message.toolId,official.id);
    assert.equal(f.runtime.frameRoot.children[0],f.frame,'Header does not recreate the iframe');
  };
  send({page:'index',title:'提示词快捷按钮',canBack:false,primary:'new'});
  assert.equal(f.elements['sidebar-tool-title'].textContent,'提示词快捷按钮');
  assert.equal(f.elements['sidebar-tool-primary-action'].hidden,false);
  assert.equal(f.elements['sidebar-tool-back'].title,'返回扩展列表');
  verifyAction('sidebar-tool-primary-action','primary');
  send({page:'create',title:'新建提示词',canBack:true});
  assert.equal(f.elements['sidebar-tool-title'].textContent,'新建');
  assert.equal(f.elements['sidebar-tool-title'].attributes['aria-label'],official.title+' / 新建提示词');
  assert.equal(f.elements['sidebar-tool-back'].title,'返回上一级');
  assert.equal(f.elements['sidebar-tool-primary-action'].hidden,true);
  verifyAction('sidebar-tool-back','back');
  send({page:'edit',title:'编辑提示词',canBack:true});
  assert.equal(f.elements['sidebar-tool-title'].textContent,'编辑');
  assert.equal(f.elements['sidebar-tool-title'].attributes['aria-label'],official.title+' / 编辑提示词');
  verifyAction('sidebar-tool-back','back');
  f.emit(f.elements['sidebar-tool-settings-open'],'click');
  assert.equal(f.elements['sidebar-tool-title'].textContent,'设置');
  assert.equal(f.elements['sidebar-tool-title'].attributes['aria-label'],official.title+' / 设置');
  assert.equal(f.elements['sidebar-tool-settings-view'].hidden,false);
  f.emit(f.elements['sidebar-tool-back'],'click');
  assert.equal(f.runtime.frameRoot.children[0],f.frame);
  assert.equal(f.elements['sidebar-tool-title'].textContent,'编辑');
});

test('R1.7 same-ID manually altered Prompt Shortcuts cannot claim official Header actions',async t=>{
  const official=await officialToolFixture('prompt-shortcuts');
  const altered={...official,js:official.js+'\nvoid 0;'};
  const f=await hostFixture(t,{tool:altered,store:new Map([[SIDEBAR_TOOL_STORE,[altered]]])});
  assert.equal(f.loaded.navigationAllowed,false,'ID alone never elevates a manually changed install');
  const before=f.frame.contentWindow.sent.length;
  f.win.emit('message',{origin:'null',source:f.frame.contentWindow,data:{
    protocol:f.loaded.protocol,toolId:altered.id,instance:f.loaded.instance,
    kind:'navigation-state',state:{page:'create',title:'伪造标题',canBack:true,primary:'new'}
  }});
  assert.equal(f.elements['sidebar-tool-title'].textContent,altered.title);
  assert.equal(f.elements['sidebar-tool-primary-action'].hidden,true);
  assert.equal(f.frame.contentWindow.sent.length,before);
});

test('R1.6 generic tool settings has a single titled return without remounting',async t=>{
 const f=await hostFixture(t),original=f.frame;
 assert.equal(f.elements['sidebar-tool-back'].title,'返回扩展列表');
 f.emit(f.elements['sidebar-tool-settings-open'],'click');
 assert.equal(f.elements['sidebar-tool-title'].textContent,'设置');
 assert.equal(f.elements['sidebar-tool-title'].attributes['aria-label'],sample.title+' / 设置');
 assert.equal(f.elements['sidebar-tool-back'].title,'返回上一页');
 assert.equal(f.runtime.frameRoot.children[0],original,'settings retains the same tool instance');
 f.emit(f.elements['sidebar-tool-back'],'click');
 assert.equal(f.elements['sidebar-tool-title'].textContent,sample.title);
 assert.equal(f.elements['sidebar-tool-back'].title,'返回扩展列表');
 assert.equal(f.runtime.frameRoot.children[0],original,'returning from settings does not recreate iframe');
});

for(const id of ['web-markdown-clipper','prompt-shortcuts'])test('R2.2 revoked '+id+' retains drafts but loses trusted navigation',async t=>{
  const tool=await officialToolFixture(id),epoch='navigation-install-a';
  const f=await hostFixture(t,{tool,store:new Map([[SIDEBAR_TOOL_STORE,[tool]],
    [TOOL_REVOCATION_EPOCHS_STORE,{[id]:epoch}]])});
  assert.equal(f.loaded.navigationAllowed,true);
  const send=(kind,extra={})=>f.win.emit('message',{origin:'null',source:f.frame.contentWindow,
    data:{protocol:f.loaded.protocol,toolId:id,instance:f.loaded.instance,kind,...extra}});
  const navigate=()=>send('navigation-state',id==='web-markdown-clipper'?{page:'edit'}:
    {state:{page:'edit',title:'编辑提示词',canBack:true,primary:'save',secondary:'more'}});
  navigate();send('draft',{text:'可复制的未保存草稿'});send('edit-state',{dirty:true,busy:false});
  assert.equal(f.elements['sidebar-tool-title'].textContent,'编辑');
  assert.equal(f.elements['sidebar-tool-title'].attributes['aria-label'],tool.title+' / '+
    (id==='web-markdown-clipper'?'编辑摘录':'编辑提示词'));
  assert.equal(f.host.openTool(id),f.loaded.instance,'same package and epoch reuse the sandbox draft');
  assert.equal(f.runtime.frameRoot.children[0],f.frame);
  const epochs={[id]:'navigation-install-b'};
  f.store.set(TOOL_REVOCATION_EPOCHS_STORE,epochs);
  f.changeStorage({[TOOL_REVOCATION_EPOCHS_STORE]:{newValue:epochs}});
  assert.equal(f.frame.isConnected,true,'revocation preserves the page for copying');
  assert.equal(f.elements['sidebar-tool-title'].textContent,tool.title,'old subpage projection clears immediately');
  assert.equal(f.elements['sidebar-tool-primary-action'].hidden,true);
  assert.equal(f.elements['sidebar-tool-secondary-action'].hidden,true);
  navigate();
  assert.equal(f.elements['sidebar-tool-title'].textContent,tool.title,'old epoch cannot reassert navigation');
  const actions=()=>f.frame.contentWindow.sent.filter(row=>row.kind==='navigation-action').length;
  const before=actions();
  for(const field of ['sidebar-tool-primary-action','sidebar-tool-secondary-action'])
    f.emit(f.elements[field],'click');
  assert.equal(actions(),before,'revoked page actions stay blocked even when not saving');
  send('edit-state',{dirty:true,busy:true});
  f.emit(f.elements['sidebar-tool-back'],'click');
  assert.equal(actions(),before,'old epoch receives no trusted Back or page actions');
  assert.equal(f.frame.isConnected,true,'Back preserves a draft while a save is pending');
  send('edit-state',{dirty:true,busy:false});
  if(id==='web-markdown-clipper'){
    f.emit(f.elements['sidebar-tool-back'],'click');
    assert.equal(f.elements['sidebar-tool-action-review'].hidden,false,'Back retains unsaved draft protection');
    f.emit(f.elements['sidebar-tool-action-cancel'],'click');
  }
  f.ask('storage.set',{key:'note',value:'stale'},'revoked-write');
  await settle(()=>f.frame.contentWindow.sent.some(row=>row.requestId==='revoked-write'));
  assert.equal(f.frame.contentWindow.sent.find(row=>row.requestId==='revoked-write').ok,false);
  assert.equal(f.store.has(sidebarToolStorageKey(id)),false,'navigation fix never restores SDK write authority');
  const reopened=f.host.openTool(id);
  if(id==='web-markdown-clipper'){
    assert.equal(f.elements['sidebar-tool-action-review'].hidden,false,'new epoch cannot take the reuse shortcut');
    assert.equal(f.frame.isConnected,true);
    f.emit(f.elements['sidebar-tool-action-cancel'],'click');
  }else{
    assert.notEqual(reopened,f.loaded.instance,'new epoch follows the existing Prompt relaunch behavior');
    assert.equal(f.frame.isConnected,false);
  }
  send('edit-state',{dirty:false,busy:false});
  assert.equal(f.host.closeTool(),true);
  assert.equal(f.frame.isConnected,false);
  navigate();
  assert.equal(f.elements['sidebar-tool-display'].hidden,true,'closed instances cannot restore navigation');
  assert.equal(actions(),before);
});

for(const version of ['0.3.12','99.0.0',null])test('Bookmark compatibility notice survives sandbox ready: '+(version||'missing official source'),async t=>{
  const official=await officialToolFixture('bookmark-manager');
  const tool=version?{...official,version}:official;
  let mounts=0;
  const f=await hostFixture(t,{tool,startTool:false,store:new Map([[SIDEBAR_TOOL_STORE,[tool]]]),
    trustedBookmarkPilot:{enabled:true,componentVersion:TRUSTED_BOOKMARK_COMPONENT_VERSION,
      mount(){mounts++;return ()=>{};}}});
  f.host.openTool(tool.id);
  await settle(()=>f.elements['sidebar-tool-frame'].children.length===1);
  const frame=f.elements['sidebar-tool-frame'].children[0];
  await frame.onload();
  const loaded=frame.contentWindow.sent[0];
  f.win.emit('message',{origin:'null',source:frame.contentWindow,data:{
    protocol:loaded.protocol,toolId:tool.id,instance:loaded.instance,kind:'status',state:'ready'}});
  const status=f.elements['sidebar-tool-status'];
  assert.equal(mounts,0,'rejected packages never execute in the trusted root');
  assert.equal(status.hidden,false,'ready must not erase the explanation of the old UI');
  assert.match(status.textContent,/兼容界面/);
  if(version){
    assert.ok(status.textContent.includes('v'+version));
    assert.match(status.textContent,/Browser.*配套版本/);
  }else assert.match(status.textContent,/官方来源.*安装身份/);
});

test('Bookmark explicit sandbox launch does not invent an admission failure',async t=>{
  const tool=await officialToolFixture('bookmark-manager');
  const f=await hostFixture(t,{tool,startTool:false,store:new Map([[SIDEBAR_TOOL_STORE,[tool]]]),
    trustedBookmarkPilot:{enabled:true,componentVersion:TRUSTED_BOOKMARK_COMPONENT_VERSION,
      mount(){assert.fail('explicit sandbox launch cannot mount the trusted component');}}});
  f.host.openTool(tool.id,{launchGate:Promise.resolve()});
  const frame=f.elements['sidebar-tool-frame'].children[0];
  await frame.onload();
  const loaded=frame.contentWindow.sent[0];
  f.win.emit('message',{origin:'null',source:frame.contentWindow,data:{
    protocol:loaded.protocol,toolId:tool.id,instance:loaded.instance,kind:'status',state:'ready'}});
  assert.equal(f.elements['sidebar-tool-status'].hidden,true);
});

test('R2.2 admitted native Bookmark reuses its current page and keeps settings and epoch boundaries',async t=>{
  const tool=await officialToolFixture('bookmark-manager');
  const release=(await officialFixtures()).catalog.apps.find(row=>row.toolId===tool.id);
  const epoch='native-navigation-a',mounts=[];let disposals=0;
  const f=await hostFixture(t,{tool,startTool:false,store:new Map([
    [SIDEBAR_TOOL_STORE,[tool]],[TOOL_REVOCATION_EPOCHS_STORE,{[tool.id]:epoch}],
    [MARKET_PROVENANCE_STORE,{[tool.id]:{marketId:release.id,version:release.version,sha256:release.sha256}}]
  ]),trustedBookmarkPilot:{enabled:true,componentVersion:TRUSTED_BOOKMARK_COMPONENT_VERSION,
    mount(options){mounts.push(options);return ()=>{disposals++;};}}});
  const token=f.host.openTool(tool.id);
  await settle(()=>mounts.length===1&&f.runtime.frameRoot.dataset.bookmarkTrusted==='true');
  if(!f.elements['sidebar-tool-settings-view'].hidden)f.emit(f.elements['sidebar-tool-back'],'click');
  let backs=0;
  const state={navigation:{page:'edit',title:'编辑书签',canBack:true},back:()=>{backs++;},
    dirty:true,saving:false,draft:'native draft'};
  mounts[0].onStateChange(state);
  assert.equal(f.elements['sidebar-tool-title'].textContent,'编辑');
  assert.equal(f.elements['sidebar-tool-title'].attributes['aria-label'],tool.title+' / 编辑书签');
  assert.equal(f.host.openTool(tool.id),token);
  assert.equal(mounts.length,1);assert.equal(disposals,0);
  assert.equal(f.elements['sidebar-tool-action-review'].hidden,true,'reopening current native app does not leave its draft');
  assert.equal(f.elements['sidebar-tool-title'].textContent,'编辑');
  f.emit(f.elements['sidebar-tool-back'],'click');
  assert.equal(backs,1,'the retained page still owns Back');
  mounts[0].onStateChange({...state,dirty:false});
  f.emit(f.elements['sidebar-tool-settings-open'],'click');
  assert.equal(f.elements['sidebar-tool-title'].textContent,'设置');
  assert.equal(f.elements['sidebar-tool-title'].attributes['aria-label'],tool.title+' / 设置');
  f.emit(f.elements['sidebar-tool-back'],'click');
  assert.equal(f.elements['sidebar-tool-title'].textContent,'编辑');
  assert.equal(mounts.length,1);assert.equal(disposals,0,'settings return preserves the native owner');
  // Opening from settings retains the existing explicit relaunch behavior.
  f.emit(f.elements['sidebar-tool-settings-open'],'click');
  f.host.openTool(tool.id);
  await settle(()=>mounts.length===2&&f.runtime.frameRoot.dataset.bookmarkTrusted==='true');
  assert.equal(disposals,1);
  const epochs={[tool.id]:'native-navigation-b'};
  f.store.set(TOOL_REVOCATION_EPOCHS_STORE,epochs);
  f.changeStorage({[TOOL_REVOCATION_EPOCHS_STORE]:{newValue:epochs}});
  assert.equal(disposals,2,'epoch change retires trusted native UI');
  mounts[0].onStateChange(state);
  assert.equal(f.elements['sidebar-tool-title'].textContent,'设置','stale callback cannot restore a subpage');
  const fresh=f.host.openTool(tool.id);
  await settle(()=>mounts.length===3&&f.runtime.frameRoot.dataset.bookmarkTrusted==='true');
  assert.notEqual(fresh,token);
  assert.equal(mounts[2].installEpoch,epochs[tool.id]);
  assert.equal(f.host.closeTool(),true);assert.equal(disposals,3);
  mounts[2].onStateChange(state);
  assert.equal(f.elements['sidebar-tool-display'].hidden,true,'close retires native navigation callbacks');
});

test('R26 cross-panel disable destroys old frames and resume does not revive them',async t=>{
  const f=await hostFixture(t),old=f.frame;
  f.store.set(SIDEBAR_TOOL_ENABLE_STORE,{[sample.id]:false});
  f.changeStorage({[SIDEBAR_TOOL_ENABLE_STORE]:{newValue:{[sample.id]:false}}});
  assert.equal(f.elements['sidebar-tool-frame'].children.length,0);assert.equal(f.elements['sidebar-tool-display'].hidden,false);
  assert.equal(f.elements['sidebar-tool-settings-view'].hidden,false);
  f.ask('storage.set',{key:'note',value:'stale'});await pause();
  assert.equal(f.store.has(sidebarToolStorageKey(sample.id)),false);
  f.store.set(SIDEBAR_TOOL_ENABLE_STORE,{[sample.id]:true});
  f.changeStorage({[SIDEBAR_TOOL_ENABLE_STORE]:{newValue:{[sample.id]:true}}});
  assert.equal(f.elements['sidebar-tool-frame'].children.length,0);assert.equal(old.contentWindow.sent.filter(m=>m.kind==='response').length,0);
});

test('R26 remote disable retains a bounded inert draft while destroying the sandbox',async t=>{
  const f=await hostFixture(t);
  const send=(kind,extra={})=>f.win.emit('message',{origin:'null',source:f.frame.contentWindow,
    data:{protocol:f.loaded.protocol,toolId:sample.id,instance:f.loaded.instance,kind,...extra}});
  send('draft',{text:'标题\n尚未保存的正文'});send('dirty');
  f.store.set(SIDEBAR_TOOL_ENABLE_STORE,{[sample.id]:false});
  f.changeStorage({[SIDEBAR_TOOL_ENABLE_STORE]:{newValue:{[sample.id]:false}}});
  assert.equal(f.elements['sidebar-tool-frame'].children.length,0);
  assert.equal(f.elements['sidebar-tool-retired-draft'].hidden,false);
  assert.equal(f.elements['sidebar-tool-retired-draft-text'].value,'标题\n尚未保存的正文');
  f.emit(f.elements['sidebar-tool-retired-draft-dismiss'],'click');
  assert.equal(f.elements['sidebar-tool-retired-draft'].hidden,true);
});

test('R-FINAL T2 unreadable enable state retries real storage without writes or launch',async t=>{
  let unreadable=true,reads=0,writes=0;
  const store=new Map([[SIDEBAR_TOOL_STORE,[sample]],[SIDEBAR_TOOL_ENABLE_STORE,{[sample.id]:false}]]);
  const f=await hostFixture(t,{store,startTool:false,getHook:async key=>{
    if(key===SIDEBAR_TOOL_ENABLE_STORE){reads++;if(unreadable)throw Error('enable read unavailable');}
  },setHook:async()=>{writes++;}});
  f.host.openSettings(sample.id);
  const button=f.elements['sidebar-tool-enable'],retry=f.elements['sidebar-tool-enable-retry'];
  assert.equal(button.hidden,true,'unknown must not be presented as ordinary OFF');
  assert.equal(retry.hidden,false);
  assert.match(f.elements['sidebar-tool-enable-hint'].textContent,/状态|读取/);
  const before=reads;
  f.emit(retry,'click',{isTrusted:false});await pause();
  assert.equal(reads,before,'synthetic retry cannot access storage');
  f.emit(retry,'click',{isTrusted:true});
  await settle(()=>reads>before&&!retry.disabled);
  assert.equal(button.hidden,true,'failed retry remains unknown');
  unreadable=false;
  f.emit(retry,'click',{isTrusted:true});
  await settle(()=>!button.hidden&&!button.disabled);
  assert.equal(button.attributes['aria-checked'],'false','readback shows the persisted OFF value');
  assert.equal(retry.hidden,true);
  assert.equal(writes,0,'recovery is read-only');
  assert.equal(f.runtime.frameRoot.children.length,0);
});

for(const persisted of [false,true])test('R-FINAL T2 unknown stop never replays; persisted='+persisted,async t=>{
  const f=await hostFixture(t),local=f.api.storage.local;
  const originalGet=local.get.bind(local),originalSet=local.set.bind(local);
  let uncertain=false,writes=0;
  local.set=async rows=>{
    if(!Object.hasOwn(rows,SIDEBAR_TOOL_ENABLE_STORE))return originalSet(rows);
    writes++;uncertain=true;
    if(persisted)await originalSet(rows);
    throw Error('stop acknowledgement lost');
  };
  local.get=async key=>{
    if(key===SIDEBAR_TOOL_ENABLE_STORE&&uncertain)throw Error('stop readback unavailable');
    return originalGet(key);
  };
  f.emit(f.elements['sidebar-tool-enable'],'click',{isTrusted:true});
  await settle(()=>!f.elements['sidebar-tool-enable-retry'].hidden);
  assert.equal(f.elements['sidebar-tool-enable'].hidden,true);
  assert.equal(f.runtime.frameRoot.children.length,0,'unknown stop retires the live sandbox');
  assert.match(f.elements['sidebar-tool-status'].textContent,/未确认/);
  f.emit(f.elements['sidebar-tool-enable'],'click',{isTrusted:true});
  assert.equal(await f.host.toggleEnabled(sample.id,{isTrusted:true}),false);
  f.ask('storage.set',{key:'late',value:'must not persist'});await pause();
  assert.equal(writes,1,'unknown result cannot automatically replay STOP or invert it');
  assert.equal(f.store.has(sidebarToolStorageKey(sample.id)),false,'retired iframe cannot write');
  uncertain=false;
  f.emit(f.elements['sidebar-tool-enable-retry'],'click',{isTrusted:true});
  await settle(()=>!f.elements['sidebar-tool-enable'].hidden&&!f.elements['sidebar-tool-enable'].disabled);
  assert.equal(f.elements['sidebar-tool-enable'].attributes['aria-checked'],String(!persisted));
  assert.equal(writes,1,'successful reread does not retry the mutation');
  assert.equal(f.runtime.frameRoot.children.length,0,'recovered ON also requires explicit Open');
});

test('R-FINAL T2 lost write acknowledgement succeeds only after matching persisted readback',async t=>{
  const f=await hostFixture(t),local=f.api.storage.local;
  const originalSet=local.set.bind(local),originalGet=local.get.bind(local);
  let writes=0,readbacks=0;
  local.set=async rows=>{
    await originalSet(rows);
    if(Object.hasOwn(rows,SIDEBAR_TOOL_ENABLE_STORE)){writes++;throw Error('ack lost after commit');}
  };
  local.get=async key=>{
    if(key===SIDEBAR_TOOL_ENABLE_STORE&&writes)readbacks++;
    return originalGet(key);
  };
  assert.equal(await f.host.toggleEnabled(sample.id,{isTrusted:true}),true);
  assert.equal(writes,1);
  assert.ok(readbacks>=2,'transaction verification and host refresh both read persistent storage');
  assert.equal(f.store.get(SIDEBAR_TOOL_ENABLE_STORE)[sample.id],false);
  assert.equal(f.elements['sidebar-tool-enable'].attributes['aria-checked'],'false');
  assert.equal(f.elements['sidebar-tool-enable-retry'].hidden,true);
  assert.equal(f.runtime.frameRoot.children.length,0);
});

test('R-FINAL T2 acknowledged but unpersisted stop remains unknown',async t=>{
  const f=await hostFixture(t),originalSet=f.api.storage.local.set.bind(f.api.storage.local);
  let writes=0;
  f.api.storage.local.set=async rows=>{
    if(Object.hasOwn(rows,SIDEBAR_TOOL_ENABLE_STORE)){writes++;return;}
    return originalSet(rows);
  };
  f.emit(f.elements['sidebar-tool-enable'],'click',{isTrusted:true});
  await settle(()=>!f.elements['sidebar-tool-enable-retry'].hidden);
  assert.equal(writes,1);
  assert.equal(f.store.has(SIDEBAR_TOOL_ENABLE_STORE),false,'successful set promise is not durable evidence');
  assert.equal(f.elements['sidebar-tool-enable'].hidden,true);
  assert.equal(f.runtime.frameRoot.children.length,0);
  f.emit(f.elements['sidebar-tool-enable-retry'],'click',{isTrusted:true});
  await settle(()=>!f.elements['sidebar-tool-enable'].hidden&&!f.elements['sidebar-tool-enable'].disabled);
  assert.equal(f.elements['sidebar-tool-enable'].attributes['aria-checked'],'true');
  assert.equal(writes,1,'read-only reconciliation cannot replay the dropped write');
});

test('R-FINAL T2 consecutive clicks serialize stop and durable restore never revives old iframe',async t=>{
  const gate=deferred(),entered=deferred();let writes=0;
  t.after(()=>gate.resolve());
  const key=sidebarToolStorageKey(sample.id),privateData={note:'retain across lifecycle'};
  const store=new Map([[SIDEBAR_TOOL_STORE,[sample]],[key,privateData]]);
  const f=await hostFixture(t,{store,setHook:async rows=>{
    if(Object.hasOwn(rows,SIDEBAR_TOOL_ENABLE_STORE)){writes++;entered.resolve();await gate.promise;}
  }});
  f.emit(f.elements['sidebar-tool-enable'],'click',{isTrusted:true});
  await entered.promise;
  f.emit(f.elements['sidebar-tool-enable'],'click',{isTrusted:true});
  assert.equal(await f.host.toggleEnabled(sample.id,{isTrusted:true}),false);
  assert.equal(writes,1,'pending STOP cannot turn a second click into resume');
  gate.resolve();
  await settle(()=>!f.elements['sidebar-tool-enable'].disabled);
  assert.equal(store.get(SIDEBAR_TOOL_ENABLE_STORE)[sample.id],false);
  assert.equal(f.runtime.frameRoot.children.length,0);
  f.ask('storage.set',{key:'note',value:'late old frame'});await pause();
  assert.deepEqual(store.get(key),privateData);
  f.host.dispose();
  const reopened=await hostFixture(t,{store,startTool:false});
  reopened.host.openTool(sample.id);
  assert.equal(reopened.runtime.frameRoot.children.length,0,'persisted STOP survives host recreation');
  assert.equal(reopened.elements['sidebar-tool-enable'].attributes['aria-checked'],'false');
  assert.equal(await reopened.host.toggleEnabled(sample.id,{isTrusted:true}),true);
  assert.equal(reopened.runtime.frameRoot.children.length,0,'resume cannot remount a retired iframe');
  reopened.emit(reopened.elements['sidebar-tool-launch'],'click',{isTrusted:true});
  await settle(()=>reopened.runtime.frameRoot.children.length===1);
  assert.notEqual(reopened.runtime.frameRoot.children[0],f.frame);
  assert.deepEqual(store.get(key),privateData);
});

test('R-FINAL T2 stale initial enable receipt cannot overwrite a newer stop event',async t=>{
  const gate=deferred(),entered=deferred();let hold=true,writes=0;
  t.after(()=>gate.resolve());
  const f=await hostFixture(t,{startTool:false,awaitReady:false,snapshotBeforeGet:true,
    getHook:async key=>{
      if(key===SIDEBAR_TOOL_ENABLE_STORE&&hold){hold=false;entered.resolve();await gate.promise;}
    },setHook:async()=>{writes++;}});
  await entered.promise;
  f.store.set(SIDEBAR_TOOL_ENABLE_STORE,{[sample.id]:false});
  f.changeStorage({[SIDEBAR_TOOL_ENABLE_STORE]:{newValue:{[sample.id]:false}}});
  assert.equal(await f.host.toggleEnabled(sample.id,{isTrusted:true}),false,
    'a valid storage event cannot bypass the pending initial read guard');
  assert.equal(writes,0,'public toggle must not mutate while initial enable state is loading');
  gate.resolve();await f.host.ready;
  f.host.openTool(sample.id);
  assert.equal(f.elements['sidebar-tool-enable'].attributes['aria-checked'],'false');
  assert.equal(f.runtime.frameRoot.children.length,0,'stale legacy-default ON cannot reopen the sandbox');
});

test('R-FINAL T2 row action failure quarantines the same host state as settings failure',async t=>{
  const f=await hostFixture(t),local=f.api.storage.local,originalGet=local.get.bind(local);
  let uncertain=false,writes=0;
  local.set=async rows=>{
    if(Object.hasOwn(rows,SIDEBAR_TOOL_ENABLE_STORE)){writes++;uncertain=true;throw Error('lost row action acknowledgement');}
  };
  local.get=async key=>{
    if(key===SIDEBAR_TOOL_ENABLE_STORE&&uncertain)throw Error('row action readback unavailable');
    return originalGet(key);
  };
  // The public overflow action may reject or return false, but must retire
  // execution and require reread exactly as the settings click handler does.
  await f.host.toggleEnabled(sample.id,{isTrusted:true}).catch(()=>false);
  assert.equal(f.runtime.frameRoot.children.length,0,'unknown row STOP must retire the live iframe');
  assert.equal(f.elements['sidebar-tool-enable'].hidden,true,'unknown row result must not keep showing ON');
  assert.equal(f.elements['sidebar-tool-enable-retry'].hidden,false);
  assert.equal(await f.host.toggleEnabled(sample.id,{isTrusted:true}),false);
  assert.equal(writes,1,'another entry point cannot replay the unknown row action');
});

test('R26 eye restores intersecting site/page appearance without mutating grants',async t=>{
  const toc=await officialToolFixture('reading-toc'),url='https://article.example/answer';
  const prefs=changeReadingTocVisibility(changeReadingTocVisibility({},toc.id,url,'site',true),toc.id,url,'page',true);
  const grants={[toc.id]:['https://article.example']},store=new Map([[SIDEBAR_TOOL_STORE,[toc]],
    [READING_TOC_SITE_STORE,grants],[READING_TOC_VISIBILITY_STORE,prefs]]);
  const target={snapshot:{status:'available',url},capture(){return {url,origin:'https://article.example',tabId:5,documentId:'doc'};},async revalidate(){return true;}};
  const f=await hostFixture(t,{target,store,tool:toc}),eye=f.elements['sidebar-tool-visibility'];
  assert.equal(eye.hidden,false);assert.equal(eye.disabled,false);f.emit(eye,'click');
  await settle(()=>!store.get(READING_TOC_VISIBILITY_STORE)?.[toc.id]);
  assert.deepEqual(store.get(READING_TOC_SITE_STORE),grants);assert.equal(store.has(SIDEBAR_TOOL_ENABLE_STORE),false);
  f.emit(eye,'click');await settle(()=>Boolean(store.get(READING_TOC_VISIBILITY_STORE)?.[toc.id]?.hiddenSites.length));
  assert.deepEqual(store.get(READING_TOC_SITE_STORE),grants);
});

test('stopped website disables the eye while restore settings remain available',async t=>{
  const toc=await officialToolFixture('reading-toc'),target={snapshot:{status:'available',url:'https://example.com/a'}};
  const f=await hostFixture(t,{tool:toc,target,store:new Map([[SIDEBAR_TOOL_STORE,[toc]],
    [READING_TOC_SITE_STORE,changeTocSiteAllowed({},toc.id,target.snapshot.url,false)]])});
  assert.equal(f.elements['sidebar-tool-visibility'].disabled,true);assert.match(f.elements['sidebar-tool-visibility'].title,/停用/);
  f.emit(f.elements['sidebar-tool-settings-open'],'click');assert.equal(f.elements['sidebar-tool-settings-view'].hidden,false);
});

test('prelaunch host reads older readers without provenance and still blocks stopped sites',async t=>{
  const toc={...await officialToolFixture('reading-toc'),version:'1.0.7'},url='https://new-site.example/article';
  const target={snapshot:{status:'available',url},
    capture:()=>({url,origin:'https://new-site.example',tabId:7,documentId:'doc-default'}),
    async revalidate(){return true;}};
  // Reproduce a legacy/local installation without a release provenance record.
  const f=await hostFixture(t,{tool:toc,target,store:new Map([
    [SIDEBAR_TOOL_STORE,[toc]]
  ])});
  let reads=0;
  f.api.tabs={async sendMessage(tabId,message,options){
    reads++;assert.equal(tabId,7);assert.equal(message.expectedUrl,url);
    assert.deepEqual(options,{frameId:0,documentId:'doc-default'});
    return {ok:true,data:{items:[],sources:[],activeId:''}};
  }};
  f.ask('toc.snapshot');await settle(()=>f.frame.contentWindow.sent.some(row=>row.kind==='response'));
  const firstReply=f.frame.contentWindow.sent.at(-1);
  assert.equal(firstReply.ok,true,JSON.stringify(firstReply.error||firstReply));
  assert.equal(reads,1);
  f.store.set(READING_TOC_SITE_STORE,changeTocSiteAllowed({},toc.id,url,false));
  f.ask('toc.navigate',{id:'h-1',sourceId:'s-1'},'2');await settle(()=>f.frame.contentWindow.sent.some(row=>row.requestId==='2'));
  assert.equal(f.frame.contentWindow.sent.at(-1).ok,false);assert.equal(reads,1);
  assert.match(f.frame.contentWindow.sent.at(-1).error.message,/停用/);
  // Restoring the site resumes reads without reinstalling the tool.
  f.store.delete(READING_TOC_SITE_STORE);
  f.store.delete(MARKET_PROVENANCE_STORE);
  f.ask('toc.snapshot',{},'3');
  await settle(()=>f.frame.contentWindow.sent.some(row=>row.requestId==='3'));
  assert.equal(f.frame.contentWindow.sent.at(-1).ok,true);
  assert.equal(reads,2);
});

test('R26 corrupted enable records preserve bytes and refuse execution or changes',async t=>{
  const corrupt={[sample.id]:'false'},store=new Map([[SIDEBAR_TOOL_STORE,[sample]],[SIDEBAR_TOOL_ENABLE_STORE,corrupt]]);
  const f=await hostFixture(t,{store,startTool:false});f.host.openTool(sample.id);
  assert.equal(f.elements['sidebar-tool-frame'].children.length,0);assert.equal(f.elements['sidebar-tool-enable'].hidden,true);
  assert.equal(f.elements['sidebar-tool-enable-retry'].hidden,false);
  assert.deepEqual(store.get(SIDEBAR_TOOL_ENABLE_STORE),corrupt);
});

test('Chrome storage object-key normalization does not invalidate a successful conditional write',async t=>{
  const key=sidebarToolStorageKey(sample.id),f=await hostFixture(t);
  const response=async id=>{
    for(let i=0;i<150;i++){
      const row=f.frame.contentWindow.sent.find(v=>v.kind==='response'&&v.requestId===id);
      if(row)return row;await new Promise(resolve=>setTimeout(resolve,10));
    }
    throw Error('Missing response '+id);
  };
  f.ask('storage.get',{key:'notes',withEtag:true},'read');const read=await response('read');
  f.ask('storage.set',{key:'notes',value:[{id:'a',text:'甲',pageTitle:'标题',pageUrl:'',updatedAt:1}],ifMatch:read.result.etag},'save');
  const saved=await response('save');assert.equal(saved.ok,true);
  // Chrome stores object keys in a different order; arrays retain their order.
  f.store.set(key,{notes:[{updatedAt:1,text:'甲',pageUrl:'',pageTitle:'标题',id:'a'}]});
  f.ask('storage.get',{key:'notes',withEtag:true},'normalized');const normalized=await response('normalized');
  assert.equal(normalized.result.etag,saved.result.etag);
  f.ask('storage.set',{key:'notes',value:[{id:'a',text:'乙'}],ifMatch:saved.result.etag},'again');
  assert.equal((await response('again')).ok,true);
  f.ask('storage.set',{key:'notes',value:[{id:'a',text:'旧快照'}],ifMatch:saved.result.etag},'stale');
  assert.equal((await response('stale')).ok,false);
  assert.equal(f.store.get(key).notes[0].text,'乙');
});

test('Final R2 request throttling returns an error and recovers after its time window',async t=>{
  const original=Date.now;let now=original();Date.now=()=>now;t.after(()=>{Date.now=original;});
  const f=await hostFixture(t);
  for(let i=0;i<121;i++){f.ask('storage.get',{key:'notes'},String(i));await pause();}
  const limited=f.frame.contentWindow.sent.find(m=>m.kind==='response'&&m.requestId==='120');
  assert.equal(limited.ok,false);assert.match(limited.error.message,/一分钟/);
  now+=60001;f.ask('storage.get',{key:'notes'},'recovered');await pause();
  assert.equal(f.frame.contentWindow.sent.at(-1).ok,true);
});

class Node {
  constructor(tag='div'){this.tag=tag;this.tagName=tag.toUpperCase();this.children=[];this.listeners=new Map();this.hidden=false;
    this.dataset={};this.attributes=new Map();this.className='';
    // Mirror native classList.toggle for trusted host settings in this DOM double.
    this.classList={
      contains:name=>this.className.split(/\s+/).includes(name),
      add:(...names)=>{this.className=[...new Set([...this.className.split(/\s+/).filter(Boolean),...names])].join(' ');},
      remove:(...names)=>{this.className=this.className.split(/\s+/).filter(x=>x&&!names.includes(x)).join(' ');},
      toggle:(name,force)=>{
        const has=this.classList.contains(name),add=force===undefined?!has:Boolean(force);
        if(add)this.classList.add(name);else this.classList.remove(name);
        return add;
      }
    };
    this.contentWindow=tag==='iframe'?{sent:[],postMessage(message){this.sent.push(message);}}:undefined;}
  addEventListener(type,fn){const items=this.listeners.get(type)||[];items.push(fn);this.listeners.set(type,items);}
  removeEventListener(type,fn){this.listeners.set(type,(this.listeners.get(type)||[]).filter(item=>item!==fn));}
  emit(type,event={}){for(const fn of this.listeners.get(type)||[])fn(event);}
  replaceChildren(...items){for(const child of this.children)child.parent=null;this.children=[];this.append(...items);}
  append(...items){for(const item of items){item.parent=this;this.children.push(item);}}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(item=>item!==this);this.parent=null;}
  setAttribute(name,value){
    this.attributes.set(name,value);
    if(name.startsWith('data-'))
      this.dataset[name.slice(5).replace(/-([a-z])/g,(_,ch)=>ch.toUpperCase())]=String(value);
  }
  removeAttribute(name){
    this.attributes.delete(name);
    if(name.startsWith('data-'))
      delete this.dataset[name.slice(5).replace(/-([a-z])/g,(_,ch)=>ch.toUpperCase())];
  }
  focus(){this.focused=true;if(this.ownerDocument)this.ownerDocument.activeElement=this;}
}
const pause=()=>new Promise(resolve=>setImmediate(resolve));
const settle=async check=>{
  for(let i=0;i<200;i++){if(check())return;await new Promise(resolve=>setTimeout(resolve,5));}
  assert.fail('host state did not settle');
};
const sample={format:SIDEBAR_TOOL_FORMAT,id:'quick-notes',version:'1.0.0',title:'网页笔记',
  description:'demo',capabilities:['storage.local','currentPage.read','tasks.open'],
  html:'<main>Hello</main>',css:'main {color:navy}',js:'void 0;'};

test('trusted tool host installs only by explicit click, scopes messages and removes storage',async()=>{
  const oldWindow=globalThis.window,oldConfirm=globalThis.confirm;
  const win=new Node('window');globalThis.window=win;globalThis.confirm=()=>true;
  const {doc,view,elements,emit,selectFile}=toolRuntimeFixture();
  const store=new Map();
  const changed=new Node();
  const api={runtime:{getURL:path=>'chrome-extension://test/'+path,async sendMessage(message){
    if(message?.protocol==='opendesk.foundation.v1'&&message.type==='cleanupUninstalledToolSchedules')
      return {ok:true,data:{toolId:message.payload.toolId,schedulesRetired:true,alarmsCleared:true}};
  }},
    storage:{onChanged:{
      addListener:fn=>changed.addEventListener('change',fn),removeListener:fn=>changed.removeEventListener('change',fn)
    },local:{
      async get(key){return Object.fromEntries((Array.isArray(key)?key:[key]).map(name=>[name,structuredClone(store.get(name))]));},
      async set(value){
        const changes={};
        for(const [key,row] of Object.entries(value)){
          changes[key]={oldValue:structuredClone(store.get(key)),newValue:structuredClone(row)};
          store.set(key,structuredClone(row));
        }
        for(const fn of changed.listeners.get('change')||[])fn(changes,'local');
      },
      async remove(key){
        const oldValue=structuredClone(store.get(key));store.delete(key);
        for(const fn of changed.listeners.get('change')||[])fn({[key]:{oldValue}},'local');
      }
    }}};
  const target={snapshot:{status:'available',url:'https://example.com/a',title:'Example'}};
  let taskOpened='';
  let toolVisible=false;
  const workbench={focusInstalledTask(id){taskOpened=id;return true;},
    setToolActive(value){toolVisible=value;}};
  let host;
  try{
    host=createSidebarTools({api,doc,view,currentPageTarget:target,taskWorkbench:workbench,
      lockManager:{request:(_name,work)=>Promise.resolve().then(work)}});
    await host.ready;host.setVisible(true);
    assert.equal(store.has(SIDEBAR_TOOL_STORE),false,'loading a tool list must not install anything');
    assert.equal(elements['sidebar-tool-preview'].hidden,true,'install preview is initially hidden');
    emit(elements['sidebar-tool-import-trigger'],'click');
    assert.equal(elements['sidebar-tool-import'].hidden,false,'import opens at full panel width');
    const file={size:JSON.stringify(sample).length,text:async()=>JSON.stringify(sample)};
    selectFile(file);
    await settle(()=>!elements['sidebar-tool-preview'].hidden);
    assert.equal(store.has(SIDEBAR_TOOL_STORE),false,'choosing JSON alone cannot install');
    assert.equal(elements['sidebar-tool-preview'].hidden,false,'review is shown after validation');
    assert.equal(elements['sidebar-tool-preview-title'].textContent,sample.title);
    assert.match(elements['sidebar-tool-preview-capabilities'].textContent,/读取当前网页/);
    assert.equal(elements['sidebar-tool-install'].disabled,false);
    emit(elements['sidebar-tool-install'],'click');
    await pause();await pause();
    assert.equal(store.get(SIDEBAR_TOOL_STORE).length,1);
    assert.equal(elements['sidebar-tool-import'].hidden,true,'successful install closes the import form');
    assert.equal(elements['sidebar-tool-display'].hidden,true,'install must not start untrusted code');
    assert.equal(elements['sidebar-tool-frame'].children.length,0,'install never mounts a sandbox');
    host.openTool(sample.id);
    assert.equal(elements['sidebar-tool-frame'].children.length,1,'only an explicit Open mounts the sandbox');
    emit(elements['sidebar-tool-back'],'click');
    assert.equal(elements['sidebar-tool-frame'].children.length,0,'Back revokes iframe');
    emit(elements['sidebar-tool-import-trigger'],'click');
    selectFile({name:'invalid.json',size:10,text:async()=>'{invalid'});
    await pause();await pause();
    assert.equal(elements['sidebar-tool-preview'].hidden,true,'invalid input never presents an approval button');
    assert.equal(elements['sidebar-tool-install'].disabled,true,'invalid input cannot install');
    assert.equal(elements['sidebar-tool-file-error'].textContent,'文件不是有效的扩展安装包 JSON','invalid JSON error stays beside the file');
    assert.equal(elements['sidebar-tool-file-error'].hidden,false);
    emit(elements['sidebar-tool-import-close'],'click');
    assert.equal(elements['sidebar-tool-import'].hidden,true,'Cancel collapses the import form');
    host.openTool(sample.id);
    const frame=elements['sidebar-tool-frame'].children[0];
    assert.equal(frame.localName,'iframe');
    assert.equal(toolVisible,true,'opening custom tools hides unrelated task Run action');
    assert.equal(frame.src,'chrome-extension://test/sidebar-tools/sandbox.html');
    await frame.onload();
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
    emit(elements['sidebar-tool-remove'],'click');
    emit(elements['sidebar-tool-inline-remove-confirm'],'click');
    await pause();await pause();
    assert.equal(store.has(sidebarToolStorageKey(sample.id)),false);
    assert.equal(store.get(SIDEBAR_TOOL_STORE).length,0);
  }finally{host?.dispose();view.dispose();globalThis.window=oldWindow;globalThis.confirm=oldConfirm;}
});

const deferred=()=>{let resolve,reject;const promise=new Promise((r,j)=>{resolve=r;reject=j;});return {promise,resolve,reject};};

test('Final R2 cancellation preserves a dirty iframe and pending saves block navigation',async t=>{
  const f=await hostFixture(t);
  const state=(dirty,busy)=>f.win.emit('message',{origin:'null',source:f.frame.contentWindow,
    data:{protocol:f.loaded.protocol,toolId:sample.id,instance:f.loaded.instance,kind:'edit-state',dirty,busy}});
  state(true,false);globalThis.confirm=()=>{throw Error('modal must not run');};
  assert.equal(f.host.setVisible(false),false);
  assert.equal(f.elements['sidebar-tool-action-review'].hidden,false);
  f.emit(f.elements['sidebar-tool-action-cancel'],'click');
  f.emit(f.elements['sidebar-tool-back'],'click');
  assert.equal(f.elements['sidebar-tool-frame'].children[0],f.frame);
  state(true,true);
  assert.equal(f.host.setVisible(false),false);
  assert.equal(f.elements['sidebar-tool-frame'].children[0],f.frame);
  let prevented=false;
  const unloading={preventDefault(){prevented=true;}};
  f.win.emit('beforeunload',unloading);assert.equal(prevented,false);assert.equal(unloading.returnValue,undefined);
  state(false,false);assert.notEqual(f.host.setVisible(false),false);
  assert.equal(f.elements['sidebar-tool-frame'].children.length,0);
});

test('actual sandbox state object clears host dirty state only after busy work ends',async t=>{
  const f=await hostFixture(t),sandboxWindow=new Node('window'),root=new Node(),status=new Node(),sent=[];
  const parent={postMessage(data){sent.push(data);f.win.emit('message',{
    origin:'null',source:f.frame.contentWindow,data});}};
  runInNewContext(`(${initSidebarToolSandbox.toString()})()`,{
    SIDEBAR_TOOL_PROTOCOL:f.loaded.protocol,createBrowserSdk,sandboxToolMessages,window:sandboxWindow,parent,
    document:{getElementById:id=>id==='tool-root'?root:status,documentElement:new Node('html'),
      head:new Node(),body:new Node(),createElement:tag=>new Node(tag)},
    Blob,URL:{createObjectURL:()=> 'blob:component-contract',revokeObjectURL(){}},
    setTimeout,clearTimeout,requestAnimationFrame:()=>0
  });
  sandboxWindow.emit('message',{source:parent,data:f.loaded});
  assert.equal(sandboxWindow.confirm('unexpected modal'),false);
  assert.equal(sandboxWindow.prompt('unexpected input'),null);
  assert.equal(sandboxWindow.open('https://example.org/'),null);
  assert.equal(sandboxWindow.alert('unexpected alert'),undefined);
  assert.equal(sandboxWindow.print(),undefined);
  assert.ok(sent.some(row=>row.kind==='status'&&/弹窗已被阻止/.test(row.message)));
  assert.equal(typeof sandboxWindow.OpenDeskSDK.browser.capabilities.getStatus,'function');
  const state=sandboxWindow.OpenDeskTool.setState;
  globalThis.confirm=()=>{throw Error('modal must not run');};
  root.emit('input',{isTrusted:true});
  state(false,false); // The former knowledge call sends no valid state object.
  assert.equal(sent.filter(row=>row.kind==='edit-state').length,0);
  assert.equal(f.host.closeTool(),false);
  assert.equal(f.elements['sidebar-tool-action-review'].hidden,false);
  f.emit(f.elements['sidebar-tool-action-cancel'],'click');
  state({dirty:false,busy:true});
  assert.equal(f.host.closeTool(),false,'busy cannot permit navigation');
  state({dirty:false,busy:false});
  assert.equal(f.host.closeTool(),true,'saved state needs no modal');
  assert.equal(f.elements['sidebar-tool-frame'].children.length,0);
  assert.equal(sent.at(-1).kind,'edit-state');assert.equal(sent.at(-1).dirty,false);assert.equal(sent.at(-1).busy,false);
});

test('Final R2 revocation during ETag digest prevents a write that has not started',async t=>{
  const f=await hostFixture(t),gate=deferred(),entered=deferred();
  const original=globalThis.crypto.subtle.digest.bind(globalThis.crypto.subtle);
  const etag=Buffer.from(await original('SHA-256',new TextEncoder().encode('null'))).toString('hex');
  globalThis.crypto.subtle.digest=async(...args)=>{entered.resolve();await gate.promise;return original(...args);};
  t.after(()=>{globalThis.crypto.subtle.digest=original;});
  f.ask('storage.set',{key:'notes',value:[{id:'one',text:'不可迟到落盘'}],ifMatch:etag});
  await entered.promise;f.host.closeTool();gate.resolve();await pause();await pause();
  assert.equal(f.store.has(sidebarToolStorageKey(sample.id)),false);
});
function sharedLocks(){
  const queues=new Map();
  return {request(name,work){const previous=queues.get(name)||Promise.resolve();
    const next=previous.catch(()=>{}).then(work);queues.set(name,next);
    next.finally(()=>{if(queues.get(name)===next)queues.delete(name);}).catch(()=>{});
    return next;}};
}
async function hostFixture(t,{store=new Map([[SIDEBAR_TOOL_STORE,[sample]]]),locks=sharedLocks(),getHook,setHook,startTool=true,tool=sample,snapshotBeforeGet=false,target,awaitReady=true,fetcher=officialFixtureFetch,trustedBookmarkPilot=null,trustedPromptPilot=null,chromePermissions=null,hostReply=null,runHost=null,foundationClient=null}={}){
  const oldWindow=globalThis.window,oldConfirm=globalThis.confirm;
  const win=new Node('window');globalThis.window=win;globalThis.confirm=()=>true;
  const {doc,view,runtime,elements,emit,selectFile}=toolRuntimeFixture();
  let focused=0;
  const changed=new Node();
  const api={runtime:{getURL:p=>'chrome-extension://test/'+p,async sendMessage(message){
    if(hostReply){const response=await hostReply(message,{store});if(response!==undefined)return response;}
    if(message?.protocol==='opendesk.foundation.v1'&&message.type==='cleanupUninstalledToolSchedules')
      return {ok:true,data:{toolId:message.payload.toolId,schedulesRetired:true,alarmsCleared:true}};
  }},storage:{session:{async get(){return {};},async remove(){}},onChanged:{
    addListener:fn=>changed.addEventListener('change',fn),removeListener:fn=>changed.removeEventListener('change',fn)
  },local:{
    async get(key){const snapshot=snapshotBeforeGet?structuredClone(store.get(key)):undefined;
      await getHook?.(key);
      if(Array.isArray(key))return Object.fromEntries(key.map(name=>[name,structuredClone(store.get(name))]));
      return {[key]:snapshotBeforeGet?snapshot:structuredClone(store.get(key))};},
    async set(value){await setHook?.(value);for(const [key,row] of Object.entries(value))store.set(key,structuredClone(row));},
    async remove(key){store.delete(key);}
  }}};
  if(chromePermissions)api.permissions=chromePermissions;
  const host=createSidebarTools({api,doc,view,currentPageTarget:target,runHost,foundationClient,lockManager:locks,fetcher,trustedBookmarkPilot,trustedPromptPilot,taskWorkbench:{focusInstalledTask(){focused++;return true;}}});
  t.after(()=>{host.dispose();view.dispose();globalThis.window=oldWindow;globalThis.confirm=oldConfirm;});
  if(awaitReady)await host.ready;else await pause();host.setVisible(true);
  assert.equal(elements['sidebar-tool-frame'].children.length,0,'opening Tools never starts saved packages');
  if(startTool)host.openTool(tool.id);
  const frame=elements['sidebar-tool-frame'].children[0];
  await frame?.onload();
  const loaded=frame?.contentWindow.sent[0];
  const ask=(operation,payload={},id='1')=>{
    assert.ok(frame,'message actions require an explicitly opened tool');
    win.emit('message',{origin:'null',source:frame.contentWindow,
      data:{protocol:loaded.protocol,toolId:tool.id,instance:loaded.instance,kind:'request',requestId:id,operation,payload}});
  };
  return {host,ask,frame,elements,store,api,win,loaded,view,doc,runtime,emit,selectFile,change(rows){
    for(const fn of changed.listeners.get('change')||[])fn({[SIDEBAR_TOOL_STORE]:{newValue:rows}},'local');
  },changeStorage(changes){
    for(const fn of changed.listeners.get('change')||[])fn(changes,'local');
  },get focused(){return focused;}};
}
test('R1.3 exact official Prompt admits one trusted React Dock and one sandbox iframe without remount',async t=>{
  const tool=await officialToolFixture('prompt-shortcuts');
  const release=(await officialFixtures()).catalog.apps.find(row=>row.toolId===tool.id);
  assert.equal(tool.version,TRUSTED_PROMPT_VERSION,'source candidate must be reviewed before trusted admission');
  assert.equal(release.version,tool.version,'official fixture must describe those same candidate bytes');
  const epoch='prompt-generation-r13',store=new Map([
    [SIDEBAR_TOOL_STORE,[tool]],[SIDEBAR_TOOL_ENABLE_STORE,{[tool.id]:true}],
    [TOOL_REVOCATION_EPOCHS_STORE,{[tool.id]:epoch}],
    [MARKET_PROVENANCE_STORE,{[tool.id]:{marketId:release.id,version:release.version,sha256:release.sha256}}]
  ]);
  const mounts=[];
  const pilot={enabled:true,
    conversation:()=>({request:async()=>{},cancel:async()=>{},source:()=>({provider:'fixture'})}),
    mount({container,onRequest,onReconcile}){
      const frameTarget=new Node('div');container.append(frameTarget);
      mounts.push({frameTarget,onRequest,onReconcile});
      return {frameTarget,dispose(){}};
    }
  };
  const f=await hostFixture(t,{tool,store,startTool:false,trustedPromptPilot:pilot});
  f.host.openTool(tool.id);await settle(()=>mounts.length===1);
  assert.equal(f.runtime.frameRoot.dataset.promptAi,'true');
  const target=mounts[0].frameTarget;
  assert.equal(target.children.length,1);
  const frame=target.children[0];assert.equal(frame.tagName?.toLowerCase(),'iframe');
  await frame.onload();
  assert.equal(frame.contentWindow.sent[0].kind,'load');
  assert.equal(frame.contentWindow.sent[0].tool.id,tool.id);
  assert.equal(typeof frame.contentWindow.sent[0].instance,'string');
  assert.equal(mounts.length,1,'no second React root or iframe instance');
  assert.equal(target.children[0],frame,'iframe is not re-parented after load');
  assert.equal(typeof mounts[0].onRequest,'function');
  assert.equal(typeof mounts[0].onReconcile,'function');
});
for(const reopenAfterEpoch of [false,true])test('R2.2 stale Prompt recovery rejection preserves '+
  (reopenAfterEpoch?'quick-notes draft opened after epoch revocation':'switched quick-notes draft'),async t=>{
  const tool=await officialToolFixture('prompt-shortcuts');
  const release=(await officialFixtures()).catalog.apps.find(row=>row.toolId===tool.id);
  const recoveryKey='opendesk.prompt-ai-recovery.v1';
  const store=new Map([[SIDEBAR_TOOL_STORE,[tool,sample]],
    [TOOL_REVOCATION_EPOCHS_STORE,{[tool.id]:'recovery-a'}],
    [MARKET_PROVENANCE_STORE,{[tool.id]:{marketId:release.id,version:release.version,sha256:release.sha256}}]]);
  let rejectRecovery,reads=0,mounts=0,releases=0;
  const pilot={enabled:true,
    conversation:()=>({request:async()=>{},cancel:async()=>{}}),
    releaseConversation(){releases++;},
    mount({container}){
      mounts++;
      const frameTarget=container.ownerDocument.createElement('div');container.append(frameTarget);
      return {frameTarget,dispose(){frameTarget.remove();}};
    }};
  const f=await hostFixture(t,{tool,store,startTool:false,trustedPromptPilot:pilot,
    getHook:key=>{
      if(key===recoveryKey&&++reads===1)return new Promise((resolve,reject)=>{rejectRecovery=reject;});
    }});
  const oldToken=f.host.openTool(tool.id);
  await settle(()=>typeof rejectRecovery==='function');
  if(reopenAfterEpoch){
    const epochs={[tool.id]:'recovery-b'};store.set(TOOL_REVOCATION_EPOCHS_STORE,epochs);
    f.changeStorage({[TOOL_REVOCATION_EPOCHS_STORE]:{newValue:epochs}});
  }
  const nextTool=sample;
  const token=f.host.openTool(nextTool.id);
  assert.notEqual(token,oldToken);
  const frame=f.runtime.frameRoot.querySelector('iframe');
  assert.ok(frame);await frame.onload();
  const loaded=frame.contentWindow.sent[0];
  assert.equal(loaded.tool.id,nextTool.id);assert.equal(loaded.instance,token);
  // Model the sandbox's live editor memory, independent of persisted storage.
  const {document:page}=parseHTML('<html><body><textarea></textarea></body></html>');
  frame.contentWindow.document=page;
  const editor=page.querySelector('textarea');editor.value='未保存的新实例草稿';
  const send=(kind,extra)=>f.win.emit('message',{origin:'null',source:frame.contentWindow,
    data:{protocol:loaded.protocol,toolId:nextTool.id,instance:token,kind,...extra}});
  send('draft',{text:editor.value});send('edit-state',{dirty:true,busy:false});
  const title=f.elements['sidebar-tool-title'].textContent;
  const settingsHidden=f.elements['sidebar-tool-settings-view'].hidden;
  const releasesBefore=releases;
  rejectRecovery(new Error('old recovery read rejected'));
  // Drain the recovery lock, its async admission callback and both catch paths.
  await pause();await pause();
  assert.equal(frame.isConnected,true,'old error must not destroy the new frame');
  assert.equal(f.runtime.frameRoot.querySelector('iframe'),frame);
  assert.equal(frame.contentWindow.document.querySelector('textarea'),editor);
  assert.equal(editor.value,'未保存的新实例草稿');
  assert.equal(f.host.openTool(nextTool.id),token,'new instance remains reusable');
  assert.equal(f.elements['sidebar-tool-title'].textContent,title);
  assert.equal(f.elements['sidebar-tool-settings-view'].hidden,settingsHidden);
  assert.equal(releases,releasesBefore,'old cleanup cannot release the current Provider');
  assert.equal(store.has(sidebarToolStorageKey(nextTool.id)),false,'draft is still only in memory');
  assert.equal(mounts,0,'failed old admission never mounts a trusted portal');
  assert.equal(f.host.closeTool(),false,'new notes retain their unsaved draft guard');
  assert.equal(f.elements['sidebar-tool-action-review'].hidden,false);
  f.emit(f.elements['sidebar-tool-action-cancel'],'click');
  assert.equal(frame.isConnected,true);
});

test('R1.16.1 committed official 1.1.15 mounts trusted AI against the 1.1.16 catalog and revokes on epoch change',async t=>{
  const tool=JSON.parse(execFileSync('git',['show',
    '4a67583db:examples/sidebar-tools/prompt-shortcuts/prompt-shortcuts.opendesk-tool.json'],
    {cwd:new URL('../..',import.meta.url),encoding:'utf8'}));
  const epoch='previous-official-install',store=new Map([
    [SIDEBAR_TOOL_STORE,[tool]],[SIDEBAR_TOOL_ENABLE_STORE,{[tool.id]:true}],
    [TOOL_REVOCATION_EPOCHS_STORE,{[tool.id]:epoch}],
    [MARKET_PROVENANCE_STORE,{[tool.id]:{marketId:'opendesk/prompt-shortcuts',
      version:'1.1.15',sha256:await sidebarToolPackageHash(tool)}}]
  ]);
  const mounts=[],pilot={enabled:true,
    conversation:()=>({request:async()=>{},cancel:async()=>{}}),
    mount({container}){
      const frameTarget=new Node('div');container.append(frameTarget);mounts.push(frameTarget);
      return {frameTarget,dispose(){}};
    }};
  const f=await hostFixture(t,{tool,store,startTool:false,trustedPromptPilot:pilot});
  f.host.openTool(tool.id);await settle(()=>mounts.length===1);
  assert.equal(f.runtime.frameRoot.dataset.promptAi,'true');
  assert.equal(mounts[0].children.length,1,'old package still executes only in its sandbox');
  const provenance=store.get(MARKET_PROVENANCE_STORE);
  f.changeStorage({[MARKET_PROVENANCE_STORE]:{oldValue:provenance,newValue:{...provenance,other:{}}}});
  assert.equal(f.runtime.frameRoot.dataset.promptAi,'true','unrelated provenance changes keep the admitted Dock');
  store.set(TOOL_REVOCATION_EPOCHS_STORE,{[tool.id]:'revoked'});
  f.changeStorage({[TOOL_REVOCATION_EPOCHS_STORE]:{newValue:{[tool.id]:'revoked'}}});
  assert.notEqual(f.runtime.frameRoot.dataset.promptAi,'true','revocation destroys the trusted Dock');
});
test('R1.11 Prompt trusted admission requires exact candidate digest and refuses unpinned legacy version',async()=>{
  const current=await officialToolFixture('prompt-shortcuts');
  const release=(await officialFixtures()).catalog.apps.find(row=>row.toolId===current.id);
  const epoch='prompt-r111-verified-generation';
  const valid={release,installed:[current],enableRecords:{[current.id]:true},
    provenance:{[current.id]:{marketId:release.id,version:release.version,sha256:release.sha256}},
    epochs:{[current.id]:epoch},expectedEpoch:epoch};
  assert.equal(await admitsTrustedPrompt({tool:current,...valid}),true,
    'matching version alone is insufficient: official release digest must also match');
  const legacy={...current,version:'1.1.14'};
  assert.equal(await admitsTrustedPrompt({tool:legacy,...valid,installed:[legacy]}),false,
    'older installed release cannot borrow the current trusted identity');
  assert.equal(await admitsTrustedPrompt({tool:{...current,js:current.js+'\\nvoid 0;'},...valid}),false,
    'a changed same-version body never inherits trusted privileges');
  assert.equal(await admitsTrustedPrompt({tool:current,...valid,epochs:{[current.id]:'revoked'}}),false,
    'a revoked or replaced installation cannot retain the trusted Dock');
});
test('R1.3 same-ID modified Prompt is never admitted to trusted Dock',async t=>{
  const official=await officialToolFixture('prompt-shortcuts');
  const altered={...official,js:official.js+'\\nvoid 0;'};
  const mounts=[];
  const pilot={enabled:true,
    conversation:()=>({request:async()=>{},cancel:async()=>{}}),
    mount(args){mounts.push(args);return {frameTarget:new Node('div'),dispose(){}};}};
  const f=await hostFixture(t,{tool:altered,store:new Map([
    [SIDEBAR_TOOL_STORE,[altered]]]),startTool:false,trustedPromptPilot:pilot});
  f.host.openTool(altered.id);
  await settle(()=>f.runtime.frameRoot.children.length===1&&
    f.runtime.frameRoot.children[0].tagName?.toLowerCase()==='iframe');
  assert.equal(mounts.length,0);
  assert.equal(f.runtime.frameRoot.dataset.promptAi,undefined);
});
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
  f.emit(f.elements['sidebar-tool-remove'],'click');
  f.emit(f.elements['sidebar-tool-inline-remove-confirm'],'click');await pause();
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
  assert.equal(f.elements['sidebar-tool-display'].hidden,true);
  assert.equal(f.elements['sidebar-tool-display'].hidden,true);
  f.host.openTool(second.id);
  assert.equal(f.elements['sidebar-tool-display'].hidden,false);
  assert.equal(f.elements['sidebar-tool-frame'].children.length,1,'only one sandbox may be active');
  assert.match(f.elements['sidebar-tool-title'].textContent,/第二个工具/);
  f.host.setVisible(false);
  assert.equal(f.elements['sidebar-tool-frame'].children.length,0,'leaving Tools revokes the session');
  f.host.setVisible(true);
  assert.equal(f.elements['sidebar-tool-frame'].children.length,0,'returning to Tools must not restart the mini-app');
  assert.equal(f.elements['sidebar-tool-display'].hidden,true);
  f.host.openTool(second.id);
  assert.match(f.elements['sidebar-tool-title'].textContent,/第二个工具/,'explicit Open starts chosen mini-app');
  f.host.closeTool();
  f.host.setVisible(false);f.host.setVisible(true);
  assert.equal(f.elements['sidebar-tool-frame'].children.length,0,'explicit Back remains on the list');
  assert.equal(f.elements['sidebar-tool-display'].hidden,true);
});


test('R14 import refuses oversized packages, ignores stale asynchronous reads and preserves filename',async t=>{
  const f=await hostFixture(t);
  f.host.closeTool();
  f.emit(f.elements['sidebar-tool-import-trigger'],'click');
  const input=f.elements['sidebar-tool-file'];
  input.value='C:\\fakepath\\too-big.json';
  f.selectFile({name:'too-big.json',size:320001,text:async()=>JSON.stringify(sample)});await pause();
  assert.match(f.elements['sidebar-tool-file-error'].textContent,/超过 320 KB/);
  assert.equal(input.value,'C:\\fakepath\\too-big.json','selected filename must remain in native picker');
  assert.equal(f.elements['sidebar-tool-install'].disabled,true);
  const gate=deferred();
  f.selectFile({name:'first.json',size:10,text:()=>gate.promise});
  f.selectFile({name:'second.json',size:JSON.stringify(sample).length,text:async()=>JSON.stringify(sample)});await settle(()=>!f.elements['sidebar-tool-preview'].hidden);
  gate.resolve('{invalid');await pause();await pause();
  assert.equal(f.elements['sidebar-tool-preview'].hidden,false,'old invalid parse cannot replace new approval');
  assert.equal(f.elements['sidebar-tool-file-error'].hidden,true);
  assert.match(f.elements['sidebar-tool-preview-file'].textContent,/^文件：second\.json · 候选包 SHA-256（规范序列化）：[a-f0-9]{64}/);
});

test('R5.3 local review identifies normalized candidate/current hashes and cancel preserves installation',async t=>{
  const f=await hostFixture(t,{startTool:false}),candidate={...sample,version:'1.0.1'};
  const before=structuredClone(f.store.get(SIDEBAR_TOOL_STORE));
  f.emit(f.elements['sidebar-tool-import-trigger'],'click');
  const text=JSON.stringify(candidate,null,4)+'\n';
  f.selectFile({name:'hash-review.json',size:text.length,text:async()=>text});await settle(()=>!f.elements['sidebar-tool-preview'].hidden);
  const label=f.elements['sidebar-tool-preview-file'].textContent;
  assert.ok(label.includes('候选包 SHA-256（规范序列化）：'+await sidebarToolPackageHash(candidate)));
  assert.ok(label.includes('当前包 SHA-256（规范序列化）：'+await sidebarToolPackageHash(sample)));
  assert.match(label,/校验值基于规范序列化，文件空白和键顺序不影响结果/);
  assert.equal(f.elements['sidebar-tool-update-capabilities'].textContent,'',
    'unchanged capabilities do not occupy update details');
  f.emit(f.elements['sidebar-tool-import-close'],'click');
  assert.equal(f.elements['sidebar-tool-preview'].hidden,true);
  assert.deepEqual(f.store.get(SIDEBAR_TOOL_STORE),before);
});

test('local official import updates the reviewed release and preserves app data',async t=>{
  const candidate=await officialToolFixture('bookmark-manager');
  const release=(await officialFixtures()).catalog.apps.find(row=>row.toolId===candidate.id);
  const previous={...candidate,version:'0.3.11',js:'void 0;'};
  const data={note:'keep local data'},dataKey=sidebarToolStorageKey(candidate.id);
  const mounts=[];
  const f=await hostFixture(t,{startTool:false,trustedBookmarkPilot:{enabled:true,
    componentVersion:TRUSTED_BOOKMARK_COMPONENT_VERSION,mount(options){mounts.push(options);return ()=>{};}},store:new Map([
    [SIDEBAR_TOOL_STORE,[previous]],[dataKey,data],
    [TOOL_REVOCATION_EPOCHS_STORE,{[candidate.id]:'old-install'}],
    [MARKET_PROVENANCE_STORE,{[candidate.id]:{marketId:release.id,
      version:previous.version,sha256:await sidebarToolPackageHash(previous)}}]
  ])});
  f.host.openImport();
  const text=JSON.stringify(Object.fromEntries(Object.entries(candidate).reverse()),null,2);
  f.selectFile({name:'bookmark-manager.opendesk-tool.json',size:Buffer.byteLength(text),text:async()=>text});
  await settle(()=>!f.elements['sidebar-tool-preview'].hidden);
  assert.match(f.elements['sidebar-tool-preview-file'].textContent,/已核对内置官方发行/);
  assert.equal(f.store.get(SIDEBAR_TOOL_STORE)[0].version,previous.version,'review cannot install');
  f.emit(f.elements['sidebar-tool-install'],'click');
  await settle(()=>f.elements['sidebar-tool-import'].hidden);
  assert.equal(f.store.get(SIDEBAR_TOOL_STORE)[0].version,candidate.version);
  assert.deepEqual(f.store.get(dataKey),data);
  assert.deepEqual(f.store.get(MARKET_PROVENANCE_STORE)[candidate.id],{
    marketId:release.id,version:release.version,sha256:release.sha256
  });
  assert.notEqual(f.store.get(TOOL_REVOCATION_EPOCHS_STORE)[candidate.id],'old-install');
  assert.equal(f.runtime.frameRoot.children.length,0,'installation cannot run the app');
  assert.equal(mounts.length,0,'review and installation cannot mount React');
  // The storage stub does not emit Chrome's onChanged receipt automatically.
  f.changeStorage({[TOOL_REVOCATION_EPOCHS_STORE]:{newValue:f.store.get(TOOL_REVOCATION_EPOCHS_STORE)}});
  f.host.openTool(candidate.id);
  await settle(()=>mounts.length===1&&f.runtime.frameRoot.dataset.bookmarkTrusted==='true');
  assert.equal(mounts[0].installEpoch,f.store.get(TOOL_REVOCATION_EPOCHS_STORE)[candidate.id]);
  assert.equal(f.runtime.frameRoot.children.length,0,'the exact official import opens React without a sandbox');
  assert.deepEqual(f.store.get(dataKey),data,'opening React preserves existing app data');
});

test('local official import refreshes a catalog published after the sidebar opened',async t=>{
  const candidate=await officialToolFixture('bookmark-manager');
  const {catalog}=await officialFixtures();
  const release=catalog.apps.find(row=>row.toolId===candidate.id);
  const previous={...candidate,version:'0.0.1',js:'void 0;'};
  const oldRelease={...release,version:previous.version,sha256:await sidebarToolPackageHash(previous)};
  const provenance={[candidate.id]:{marketId:release.id,version:previous.version,sha256:oldRelease.sha256}};
  const dataKey=sidebarToolStorageKey(candidate.id),data={note:'keep across catalog refresh'};
  let published=false;
  const f=await hostFixture(t,{startTool:false,store:new Map([
    [SIDEBAR_TOOL_STORE,[previous]],[MARKET_PROVENANCE_STORE,provenance],[dataKey,data]
  ]),fetcher:async(url,options)=>{
    if(!published&&url.endsWith('/official-tools/catalog.json'))
      return new Response(JSON.stringify({...catalog,apps:catalog.apps.map(row=>row.toolId===candidate.id?oldRelease:row)}));
    return officialFixtureFetch(url,options);
  }});
  published=true;
  f.host.openImport();
  const text=JSON.stringify(candidate);
  f.selectFile({name:'bookmark-manager.opendesk-tool.json',size:Buffer.byteLength(text),text:async()=>text});
  await settle(()=>!f.elements['sidebar-tool-preview'].hidden);
  assert.match(f.elements['sidebar-tool-preview-file'].textContent,/已核对内置官方发行/);
  assert.deepEqual(f.store.get(SIDEBAR_TOOL_STORE),[previous],'refresh only prepares a review');
  f.emit(f.elements['sidebar-tool-install'],'click');
  await settle(()=>f.elements['sidebar-tool-import'].hidden);
  assert.equal(f.store.get(SIDEBAR_TOOL_STORE)[0].version,candidate.version);
  assert.deepEqual(f.store.get(MARKET_PROVENANCE_STORE)[candidate.id],{
    marketId:release.id,version:release.version,sha256:release.sha256
  });
  assert.deepEqual(f.store.get(dataKey),data);
  assert.equal(f.runtime.frameRoot.children.length,0,'refresh and installation cannot run the app');
});

test('local official import cannot reuse a cached catalog when its refresh fails',async t=>{
  const candidate=await officialToolFixture('bookmark-manager');
  const release=(await officialFixtures()).catalog.apps.find(row=>row.toolId===candidate.id);
  const previous={...candidate,version:'0.0.1',js:'void 0;'};
  const provenance={[candidate.id]:{marketId:release.id,version:previous.version,
    sha256:await sidebarToolPackageHash(previous)}};
  const dataKey=sidebarToolStorageKey(candidate.id),data={note:'keep on failure'};
  let unavailable=false;
  const f=await hostFixture(t,{startTool:false,store:new Map([
    [SIDEBAR_TOOL_STORE,[previous]],[MARKET_PROVENANCE_STORE,provenance],[dataKey,data]
  ]),fetcher:async(url,options)=>unavailable&&url.endsWith('/official-tools/catalog.json')
    ?new Response('missing',{status:404}):officialFixtureFetch(url,options)});
  unavailable=true;
  f.host.openImport();
  const text=JSON.stringify(candidate);
  f.selectFile({name:'bookmark-manager.opendesk-tool.json',size:Buffer.byteLength(text),text:async()=>text});
  await settle(()=>!f.elements['sidebar-tool-preview'].hidden);
  assert.doesNotMatch(f.elements['sidebar-tool-preview-file'].textContent,/已核对内置官方发行/);
  f.emit(f.elements['sidebar-tool-install'],'click');
  await settle(()=>!f.elements['sidebar-tool-file-error'].hidden);
  assert.match(f.elements['sidebar-tool-file-error'].textContent,/E_PUBLISHER_CONFLICT/);
  assert.deepEqual(f.store.get(SIDEBAR_TOOL_STORE),[previous]);
  assert.deepEqual(f.store.get(MARKET_PROVENANCE_STORE),provenance);
  assert.deepEqual(f.store.get(dataKey),data);
});

test('local official import of identical bytes prevents reinstall and retains the React owner',async t=>{
  const tool=await officialToolFixture('bookmark-manager');
  const release=(await officialFixtures()).catalog.apps.find(row=>row.toolId===tool.id);
  const epoch='identical-local-import',dataKey=sidebarToolStorageKey(tool.id),data={note:'keep'};
  const provenance={[tool.id]:{marketId:release.id,version:release.version,sha256:release.sha256}};
  const grants={[tool.id]:{version:tool.version,installEpoch:epoch,bookmarkFull:true,
    packageHash:await sidebarToolPackageHash(tool)}};
  const mounts=[];
  const f=await hostFixture(t,{startTool:false,trustedBookmarkPilot:{enabled:true,
    componentVersion:TRUSTED_BOOKMARK_COMPONENT_VERSION,mount(options){mounts.push(options);return ()=>{};}},store:new Map([
      [SIDEBAR_TOOL_STORE,[tool]],[dataKey,data],[TOOL_REVOCATION_EPOCHS_STORE,{[tool.id]:epoch}],
      [MARKET_PROVENANCE_STORE,provenance],[BROWSER_MENU_GRANTS_STORE,grants]
    ])});
  f.host.openImport();
  const text=JSON.stringify(tool);
  f.selectFile({name:'bookmark-manager.opendesk-tool.json',size:Buffer.byteLength(text),text:async()=>text});
  await settle(()=>!f.elements['sidebar-tool-preview'].hidden);
  assert.match(f.elements['sidebar-tool-preview-file'].textContent,/已核对内置官方发行/);
  assert.equal(f.elements['sidebar-tool-install'].disabled,true);
  assert.equal(f.elements['sidebar-tool-install'].textContent,'已安装相同工具');
  f.emit(f.elements['sidebar-tool-import-close'],'click');
  assert.deepEqual(f.store.get(SIDEBAR_TOOL_STORE),[tool]);
  assert.deepEqual(f.store.get(MARKET_PROVENANCE_STORE),provenance);
  assert.deepEqual(f.store.get(BROWSER_MENU_GRANTS_STORE),grants);
  assert.deepEqual(f.store.get(dataKey),data);
  assert.equal(f.store.get(TOOL_REVOCATION_EPOCHS_STORE)[tool.id],epoch);
  assert.equal(mounts.length,0);
  f.host.openTool(tool.id);
  await settle(()=>mounts.length===1&&f.runtime.frameRoot.dataset.bookmarkTrusted==='true');
  assert.equal(mounts[0].installEpoch,epoch);
  assert.equal(f.runtime.frameRoot.children.length,0);
});

test('unverified local replacement reports the source conflict and preserves the official install',async t=>{
  const previous=await officialToolFixture('bookmark-manager');
  const release=(await officialFixtures()).catalog.apps.find(row=>row.toolId===previous.id);
  const candidate={...previous,version:'0.3.13',js:previous.js+'\nvoid 0;'};
  const provenance={[previous.id]:{marketId:release.id,version:release.version,sha256:release.sha256}};
  const f=await hostFixture(t,{startTool:false,store:new Map([
    [SIDEBAR_TOOL_STORE,[previous]],[MARKET_PROVENANCE_STORE,provenance]
  ])});
  f.host.openImport();
  const text=JSON.stringify(candidate);
  f.selectFile({name:'bookmark-manager.opendesk-tool.json',size:Buffer.byteLength(text),text:async()=>text});
  await settle(()=>!f.elements['sidebar-tool-preview'].hidden);
  assert.doesNotMatch(f.elements['sidebar-tool-preview-file'].textContent,/已核对内置官方发行/);
  f.emit(f.elements['sidebar-tool-install'],'click');
  await settle(()=>!f.elements['sidebar-tool-file-error'].hidden);
  assert.match(f.elements['sidebar-tool-file-error'].textContent,/E_PUBLISHER_CONFLICT.*官方/);
  assert.deepEqual(f.store.get(SIDEBAR_TOOL_STORE),[previous]);
  assert.deepEqual(f.store.get(MARKET_PROVENANCE_STORE),provenance);
});

test('local official import rechecks packaged bytes before updating',async t=>{
  const candidate=await officialToolFixture('bookmark-manager');
  const previous={...candidate,version:'0.3.11',js:'void 0;'};
  let tamper=false;
  const f=await hostFixture(t,{startTool:false,store:new Map([[SIDEBAR_TOOL_STORE,[previous]]]),
    fetcher:async(url,options)=>tamper&&url.endsWith('/bookmark-manager.opendesk-tool.json')
      ?{ok:true,url,arrayBuffer:async()=>new TextEncoder().encode('{}').buffer}
      :officialFixtureFetch(url,options)});
  f.host.openImport();
  const text=JSON.stringify(candidate);
  f.selectFile({name:'bookmark-manager.opendesk-tool.json',size:Buffer.byteLength(text),text:async()=>text});
  await settle(()=>!f.elements['sidebar-tool-preview'].hidden);
  tamper=true;
  f.emit(f.elements['sidebar-tool-install'],'click');
  await settle(()=>!f.elements['sidebar-tool-file-error'].hidden);
  assert.match(f.elements['sidebar-tool-file-error'].textContent,/E_PACKAGE_INTEGRITY/);
  assert.deepEqual(f.store.get(SIDEBAR_TOOL_STORE),[previous]);
  assert.equal(f.store.has(MARKET_PROVENANCE_STORE),false);
});

test('R5.3 cancelled or superseded hash calculation cannot revive an old review',async t=>{
  const f=await hostFixture(t,{store:new Map(),startTool:false});
  const original=crypto.subtle.digest.bind(crypto.subtle),gate=deferred(),started=deferred();
  t.mock.method(crypto.subtle,'digest',async(algorithm,bytes)=>{
    if(new TextDecoder().decode(bytes).includes('hash-slow')){started.resolve();await gate.promise;}
    return original(algorithm,bytes);
  });
  const select=candidate=>{
    const text=JSON.stringify(candidate);
    f.selectFile({name:candidate.title+'.json',size:text.length,text:async()=>text});
  };
  f.emit(f.elements['sidebar-tool-import-trigger'],'click');
  select({...sample,title:'hash-slow'});await started.promise;
  f.emit(f.elements['sidebar-tool-import-close'],'click');
  f.emit(f.elements['sidebar-tool-import-trigger'],'click');select({...sample,title:'hash-current'});
  await settle(()=>!f.elements['sidebar-tool-preview'].hidden);
  gate.resolve();await pause();await pause();
  assert.equal(f.elements['sidebar-tool-preview-title'].textContent,'hash-current');
  assert.doesNotMatch(f.elements['sidebar-tool-preview-file'].textContent,/当前包 SHA-256/);
  assert.equal(f.store.has(SIDEBAR_TOOL_STORE),false);
});

test('R14 preview compares permissions and downgrade, confirmation protects update and retains data',async t=>{
  const older={...sample,version:'3.0.0',capabilities:['storage.local']};
  const store=new Map([[SIDEBAR_TOOL_STORE,[older]],[sidebarToolStorageKey(sample.id),{memo:'kept'}]]);
  const f=await hostFixture(t,{store});
  f.host.closeTool();
  f.emit(f.elements['sidebar-tool-import-trigger'],'click');
  const file=JSON.stringify({...sample,version:'2.0.0'});
  f.selectFile({name:'update.opendesk-tool.json',size:file.length,text:async()=>file});
  // Hash/preview generation can span more than two turns under concurrent
  // React/Vite builds. Wait for the actual reviewed candidate, not timing.
  await settle(()=>!f.elements['sidebar-tool-update'].hidden);
  assert.equal(f.elements['sidebar-tool-update'].hidden,false);
  assert.match(f.elements['sidebar-tool-update-versions'].textContent,/3\.0\.0.*2\.0\.0/);
  assert.match(f.elements['sidebar-tool-update-capabilities'].textContent,/新增能力：.*读取当前网页/);
  assert.match(f.elements['sidebar-tool-update-warning'].textContent,/版本回退/);
  let prompted=0;globalThis.confirm=()=>{prompted++;return false;};
  f.emit(f.elements['sidebar-tool-install'],'click');await pause();await pause();await pause();
  assert.equal(prompted,0,'reviewed update must not open a JS modal');
  assert.equal(store.get(SIDEBAR_TOOL_STORE)[0].version,'2.0.0');
  assert.deepEqual(store.get(sidebarToolStorageKey(sample.id)),{memo:'kept'});
  assert.equal(f.elements['sidebar-tool-frame'].children.length,0,'update cannot auto execute');
});

test('R26 stopped detail uninstall requires consent without running tool code',async t=>{
  const key=sidebarToolStorageKey(sample.id);
  const store=new Map([[SIDEBAR_TOOL_STORE,[sample]],[SIDEBAR_TOOL_ENABLE_STORE,{[sample.id]:false}],[key,{note:'private'}]]);
  const f=await hostFixture(t,{store,startTool:false});
  f.host.openTool(sample.id);
  const deleteButton=f.elements['sidebar-tool-remove'];
  assert.match(deleteButton.attributes['aria-label'],/卸载.*网页笔记/);
  assert.equal(f.elements['sidebar-tool-frame'].children.length,0);
  let confirmations=0;
  globalThis.confirm=()=>{confirmations++;return false;};
  f.emit(deleteButton,'click');await pause();await pause();
  assert.equal(confirmations,0,'no JS confirm');
  assert.equal(f.elements['sidebar-tool-inline-remove'].hidden,false);
  assert.deepEqual(store.get(key),{note:'private'});
  f.emit(f.elements['sidebar-tool-inline-remove-cancel'],'click');
  assert.equal(f.elements['sidebar-tool-inline-remove'].hidden,true);
  assert.equal(store.get(SIDEBAR_TOOL_STORE).length,1);
  f.emit(deleteButton,'click');
  f.emit(f.elements['sidebar-tool-inline-remove-confirm'],'click');await pause();await pause();await pause();
  assert.equal(store.get(SIDEBAR_TOOL_STORE).length,0,'explicit list uninstall removes the package');
  assert.equal(store.has(key),false,'list uninstall removes its namespaced data');
  assert.equal(f.elements['sidebar-tool-frame'].children.length,0,'deletion cannot execute the tool');
});

test('R14 cross-window tool update invalidates review and clears the stale file selection',async t=>{
  const f=await hostFixture(t,{startTool:false});
  f.emit(f.elements['sidebar-tool-import-trigger'],'click');
  const input=f.elements['sidebar-tool-file'];
  const update={...sample,version:'1.1.0'};
  input.value='C:\\fakepath\\update.opendesk-tool.json';
  f.selectFile({name:'update.opendesk-tool.json',size:JSON.stringify(update).length,text:async()=>JSON.stringify(update)});
  // File hashing and package validation are async. Establish a completed,
  // actionable review before testing that a cross-window update invalidates it.
  // Do not relax the post-change identity, disabled-button or reset checks.
  await settle(()=>!f.elements['sidebar-tool-preview'].hidden&&
    !f.elements['sidebar-tool-install'].disabled);
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
  const f=await hostFixture(t,{store,startTool:false,snapshotBeforeGet:true,awaitReady:false,
    getHook:async key=>{if(key===SIDEBAR_TOOL_STORE){entered.resolve();await gate.promise;}}});
  await entered.promise;
  const next={...sample,id:'new-notes',title:'其他窗口刚安装'};
  store.set(SIDEBAR_TOOL_STORE,[next]);
  f.change([next]);
  f.host.openTool(next.id);
  assert.equal(f.runtime.frameRoot.children.length,1);
  f.host.closeTool();
  gate.resolve();await pause();await pause();
  f.host.openTool(next.id);
  assert.equal(f.runtime.frameRoot.children.length,1,'an older async read must not roll the controller catalog back');
});

test('R4.5 fresh reinstall preserves orphaned private data and requires explicit cleanup',async t=>{
  const key=sidebarToolStorageKey(sample.id);
  const store=new Map([[SIDEBAR_TOOL_STORE,[]],[key,{privateNote:'left by interrupted uninstall'}]]);
  const f=await hostFixture(t,{store,startTool:false});
  f.emit(f.elements['sidebar-tool-import-trigger'],'click');
  const text=JSON.stringify(sample);
  f.selectFile({name:'quick-notes.json',size:text.length,text:async()=>text});
  await settle(()=>!f.elements['sidebar-tool-preview'].hidden&&!f.elements['sidebar-tool-install'].disabled);
  f.emit(f.elements['sidebar-tool-install'],'click');
  await settle(()=>/未关联卸载确认/.test(f.elements['sidebar-tool-file-error'].textContent||''));
  assert.deepEqual(store.get(key),{privateNote:'left by interrupted uninstall'},'a blocked installation must preserve existing notes');
  assert.deepEqual(store.get(SIDEBAR_TOOL_STORE),[],'orphan data requires explicit cleanup before admission');
  assert.equal(f.elements['sidebar-tool-frame'].children.length,0,'install must not start code');
  assert.equal(f.elements['sidebar-tool-file-error'].hidden,false);
});

test('R4.5 delayed initial revocation read preserves a newer epoch without losing the installed list',async t=>{
  const gate=deferred(),entered=deferred(),store=new Map([[SIDEBAR_TOOL_STORE,[sample]]]);
  let delayed=true;
  const f=await hostFixture(t,{store,startTool:false,snapshotBeforeGet:true,awaitReady:false,
    getHook:async key=>{if(key===TOOL_REVOCATION_EPOCHS_STORE&&delayed){delayed=false;entered.resolve();await gate.promise;}}});
  await entered.promise;
  const latest={[sample.id]:'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'};
  store.set(TOOL_REVOCATION_EPOCHS_STORE,latest);
  f.changeStorage({[TOOL_REVOCATION_EPOCHS_STORE]:{newValue:latest}});
  gate.resolve();await f.host.ready;
  assert.equal(f.view.fields['sidebar-tool-status'].attributes['data-state'],'info');
  f.host.openTool(sample.id);
  const frame=f.elements['sidebar-tool-frame'].children[0];await frame.onload();
  const loaded=frame.contentWindow.sent[0];
  f.win.emit('message',{origin:'null',source:frame.contentWindow,data:{protocol:loaded.protocol,
    toolId:sample.id,instance:loaded.instance,kind:'request',requestId:'fresh-epoch',operation:'storage.set',
    payload:{key:'note',value:'valid reopened tool'}}});
  await settle(()=>frame.contentWindow.sent.some(row=>row.requestId==='fresh-epoch'));
  assert.equal(frame.contentWindow.sent.find(row=>row.requestId==='fresh-epoch').ok,true);
  assert.deepEqual(store.get(sidebarToolStorageKey(sample.id)),{note:'valid reopened tool'});
});

test('R4.5 an old iframe cannot read or write an identical reinstall even before epoch notification',async t=>{
  const locks=sharedLocks(),f=await hostFixture(t,{locks}),key=sidebarToolStorageKey(sample.id);
  await locks.request('opendesk.sidebar-tools:tool:'+sample.id,()=>locks.request('opendesk.sidebar-tools:catalog',()=>recordToolUninstall(f.api,sample)));
  // Another window has replaced the registry with identical bytes; this old
  // document has not observed the intermediate removal or epoch notification.
  f.store.set(SIDEBAR_TOOL_STORE,[structuredClone(sample)]);f.store.set(key,{note:'new instance private data'});
  f.ask('storage.get',{key:'note'},'old-read');f.ask('storage.set',{key:'note',value:'stale edit'},'old-write');
  await settle(()=>f.frame.contentWindow.sent.filter(row=>['old-read','old-write'].includes(row.requestId)).length===2);
  const replies=f.frame.contentWindow.sent.filter(row=>['old-read','old-write'].includes(row.requestId));
  assert.ok(replies.every(row=>row.ok===false&&row.error.code==='E_TOOL_CHANGED'));
  assert.deepEqual(f.store.get(key),{note:'new instance private data'});
});

test('uninstalled trusted AdBlock can recover cleanup after required permission becomes available without reinstalling',async t=>{
  const previous=globalThis.__opendeskAdblockTrustedUI;
  globalThis.__opendeskAdblockTrustedUI=Object.freeze({id:ADBLOCK_ID,prepareUninstallCleanup:prepareAdblockUninstallCleanup});
  t.after(()=>{if(previous===undefined)delete globalThis.__opendeskAdblockTrustedUI;
    else globalThis.__opendeskAdblockTrustedUI=previous;});
  const store=new Map([[SIDEBAR_TOOL_STORE,[]],[ADBLOCK_DNR_CLEANUP_STORE,true],
    [ADBLOCK_STORE,{enabled:false}],[TOOL_CLEANUP_STORE,{[ADBLOCK_ID]:{version:'1.1.1',createdAt:1}}]]);
  const f=await hostFixture(t,{store,startTool:false});
  let granted=false,requests=0;
  let rules=[{id:ADBLOCK_RULE_FIRST,priority:1,action:{type:'block'},condition:{urlFilter:'ads.test'}},
    {id:1,priority:28,action:{type:'block'},condition:{urlFilter:'other.test'}}];
  f.api.storage.session={get:async key=>({[key]:{version:1,ready:true}}),set:async()=>{}};
  f.api.permissions={contains:async()=>granted,request:()=>{
    requests++;throw Error('required DNR has no optional grant');
  }};
  f.api.declarativeNetRequest={getDynamicRules:async()=>structuredClone(rules),
    updateDynamicRules:async({removeRuleIds,addRules})=>{
      assert.deepEqual(addRules,[],'recovery never installs filtering');
      rules=rules.filter(rule=>!removeRuleIds.includes(rule.id));
    }};
  await f.host.retryUninstallCleanup(ADBLOCK_ID,{isTrusted:false});assert.equal(requests,0);
  await assert.rejects(f.host.retryUninstallCleanup(ADBLOCK_ID,{isTrusted:true}),{code:'E_ADBLOCK_PERMISSION'});
  assert.ok(store.get(TOOL_CLEANUP_STORE)[ADBLOCK_ID]);assert.equal(store.get(ADBLOCK_DNR_CLEANUP_STORE),true);
  assert.notEqual(f.elements['sidebar-tool-action-review'].hidden,false,'no nonexistent optional permission review');
  granted=true;
  assert.equal((await f.host.retryUninstallCleanup(ADBLOCK_ID,{isTrusted:true})).state,'cleaned');
  assert.deepEqual(rules.map(rule=>rule.id),[1]);assert.equal(requests,0);
  assert.equal(store.has(ADBLOCK_DNR_CLEANUP_STORE),false);assert.equal(store.has(ADBLOCK_STORE),false);
  assert.equal(store.get(TOOL_CLEANUP_STORE)?.[ADBLOCK_ID],undefined);
  assert.deepEqual(store.get(SIDEBAR_TOOL_STORE),[],'cleanup never restores installation authority');
});
test('R4.5 orphaned private data blocks reinstall until the acknowledged uninstall cleanup completes',async t=>{
  const key=sidebarToolStorageKey(sample.id),privateData={privateNote:'left by interrupted uninstall'};
  const store=new Map([[SIDEBAR_TOOL_STORE,[]],[key,privateData],
    [TOOL_CLEANUP_STORE,{[sample.id]:{version:sample.version,createdAt:1}}]]);
  const f=await hostFixture(t,{store,startTool:false});
  async function reviewAndConfirm(){
    f.emit(f.elements['sidebar-tool-import-trigger'],'click');
    const text=JSON.stringify(sample);
    f.selectFile({name:'quick-notes.json',size:text.length,text:async()=>text});
    await settle(()=>!f.elements['sidebar-tool-install'].disabled);
    f.emit(f.elements['sidebar-tool-install'],'click');
  }
  await reviewAndConfirm();
  await settle(()=>/上次卸载仍有未完成/.test(f.elements['sidebar-tool-file-error'].textContent||''));
  assert.deepEqual(store.get(key),privateData,'failed admission preserves the previous owner data');
  assert.deepEqual(store.get(SIDEBAR_TOOL_STORE),[]);
  assert.equal(f.elements['sidebar-tool-frame'].children.length,0,'refused install must not start code');
  assert.equal((await retryUninstalledToolCleanup({api:f.api,lockManager:sharedLocks(),id:sample.id})).state,'cleaned');
  assert.equal(store.has(key),false,'only the acknowledged uninstall cleanup removes old data');
  assert.deepEqual(store.get(SIDEBAR_TOOL_STORE),[],'cleanup itself does not install anything');
  await reviewAndConfirm();
  await settle(()=>store.get(SIDEBAR_TOOL_STORE)?.length===1);
  assert.equal(store.get(SIDEBAR_TOOL_STORE)[0].id,sample.id);
  assert.equal(f.elements['sidebar-tool-frame'].children.length,0,'install must not start code');
  assert.ok(f.view.takeEffects().some(effect=>effect.key==='sidebar-tool-import-trigger'&&effect.method==='focus'));
});

test('R5.0 incomplete cleanup record blocks a new tool even when no orphan payload remains',async t=>{
  const pending={[sample.id]:{version:sample.version,createdAt:1}};
  const store=new Map([[SIDEBAR_TOOL_STORE,[]],[TOOL_CLEANUP_STORE,pending]]);
  const f=await hostFixture(t,{store,startTool:false});
  f.emit(f.elements['sidebar-tool-import-trigger'],'click');
  const text=JSON.stringify(sample);
  f.selectFile({name:'quick-notes.json',size:text.length,text:async()=>text});
  await settle(()=>!f.elements['sidebar-tool-install'].disabled);
  f.emit(f.elements['sidebar-tool-install'],'click');
  await settle(()=>/上次卸载仍有未完成/.test(f.elements['sidebar-tool-file-error'].textContent||''));
  assert.deepEqual(store.get(SIDEBAR_TOOL_STORE),[]);
  assert.deepEqual(store.get(TOOL_CLEANUP_STORE),pending,'recovery marker must remain');
  assert.equal(f.elements['sidebar-tool-frame'].children.length,0);
});

test('R5.1 malformed pending cleanup cannot revoke a still-installed tool before failed uninstall',async t=>{
  const epochs={[sample.id]:'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'};
  const malformed={[sample.id]:{version:'unrecoverable'}};
  const store=new Map([[SIDEBAR_TOOL_STORE,[sample]],
    [TOOL_REVOCATION_EPOCHS_STORE,epochs],[TOOL_CLEANUP_STORE,malformed]]);
  const f=await hostFixture(t,{store,startTool:false});
  await assert.rejects(recordToolUninstall(f.api,sample),{code:'E_STORAGE_CORRUPT'});
  assert.deepEqual(store.get(TOOL_REVOCATION_EPOCHS_STORE),epochs,
    'preflight rejection must not revoke the still-installed instance');
  assert.deepEqual(store.get(SIDEBAR_TOOL_STORE),[sample]);
  assert.deepEqual(store.get(TOOL_CLEANUP_STORE),malformed);
});

test('R5.1 uninstall refuses corrupt revocation authority before writing cleanup intent',async t=>{
  const epochs={'other-tool':123},key=sidebarToolStorageKey(sample.id);
  const privateData={memo:'must be preserved'};
  const store=new Map([[SIDEBAR_TOOL_STORE,[sample]],[TOOL_REVOCATION_EPOCHS_STORE,epochs],
    [key,privateData]]);
  const f=await hostFixture(t,{store,startTool:false});
  await assert.rejects(recordToolUninstall(f.api,sample),{code:'E_STORAGE_CORRUPT'});
  assert.deepEqual(store.get(TOOL_REVOCATION_EPOCHS_STORE),epochs,
    'corrupt revocation state must not be spread into another owner record');
  assert.equal(store.has(TOOL_CLEANUP_STORE),false,'a failed intent must not claim registry removal');
  assert.deepEqual(store.get(SIDEBAR_TOOL_STORE),[sample]);
  assert.deepEqual(store.get(key),privateData);
});

test('R5.1 silent TOC placement removal must keep cleanup recovery pending',async t=>{
  const placementKey=READING_TOC_PLACEMENT_PREFIX+'test-page';
  const pending={'reading-toc':{version:'2.0.0',createdAt:1}},saved={position:'left'};
  const store=new Map([[SIDEBAR_TOOL_STORE,[]],[TOOL_CLEANUP_STORE,pending],
    [placementKey,saved],['unrelated-stored-data',{preserve:true}]]);
  const f=await hostFixture(t,{store,startTool:false});
  const get=f.api.storage.local.get.bind(f.api.storage.local);
  const remove=f.api.storage.local.remove.bind(f.api.storage.local);
  f.api.storage.local.get=async key=>key===null?Object.fromEntries(store.entries()):get(key);
  // Chrome may resolve a storage.remove Promise without actually deleting the key.
  f.api.storage.local.remove=async key=>{if(key!==placementKey)await remove(key);};
  await assert.rejects(retryUninstalledToolCleanup({api:f.api,lockManager:sharedLocks(),id:'reading-toc'}),
    {code:'E_TOOL_UNINSTALL_CLEANUP'});
  assert.deepEqual(store.get(TOOL_CLEANUP_STORE),pending,'unverified deletion cannot finalize uninstall');
  assert.deepEqual(store.get(placementKey),saved,'unconfirmed removal remains visible for recovery');
  assert.deepEqual(store.get('unrelated-stored-data'),{preserve:true});
  f.api.storage.local.remove=remove;
  const recovered=await retryUninstalledToolCleanup({api:f.api,lockManager:sharedLocks(),id:'reading-toc'});
  assert.equal(recovered.state,'cleaned');
  assert.equal(store.has(placementKey),false);
  assert.deepEqual(store.get(TOOL_CLEANUP_STORE),{});
  assert.deepEqual(store.get(SIDEBAR_TOOL_STORE),[],'recovery cannot reinstall tools');
});

test('R5.1 corrupted uninstall cleanup cannot be treated as absent or bypassed by reinstall',async t=>{
  const key=sidebarToolStorageKey(sample.id),privateData={memo:'other owner data must survive'};
  const malformed={[sample.id]:{version:'broken',createdAt:1}};
  const store=new Map([[SIDEBAR_TOOL_STORE,[]],[TOOL_CLEANUP_STORE,malformed],[key,privateData]]);
  const f=await hostFixture(t,{store,startTool:false}),locks=sharedLocks();
  await assert.rejects(getPendingToolCleanups(f.api),{code:'E_STORAGE_CORRUPT'});
  await assert.rejects(installReviewedSidebarTool({api:f.api,lockManager:locks,
    candidate:sample,baseline:null,reviewApproved:true}),{code:'E_STORAGE_CORRUPT'},
  'a damaged recovery marker must never let this ID replace the previous owner');
  await assert.rejects(retryUninstalledToolCleanup({api:f.api,lockManager:locks,id:sample.id}),
    {code:'E_STORAGE_CORRUPT'},'recovery must not silently drop malformed journal rows');
  assert.deepEqual(store.get(SIDEBAR_TOOL_STORE),[]);
  assert.deepEqual(store.get(key),privateData);
  assert.deepEqual(store.get(TOOL_CLEANUP_STORE),malformed);
});

test('R5.1 uninstall cleanup preserves malformed unrelated grant data for safe recovery',async t=>{
  const pending={[sample.id]:{version:sample.version,createdAt:1}};
  const unrelated=['invalid grant registry; do not silently replace'];
  const store=new Map([[SIDEBAR_TOOL_STORE,[]],[TOOL_CLEANUP_STORE,pending],
    [READING_TOC_SITE_STORE,unrelated]]);
  const f=await hostFixture(t,{store,startTool:false});
  await assert.rejects(retryUninstalledToolCleanup({api:f.api,lockManager:sharedLocks(),id:sample.id}),
    {code:'E_TOOL_UNINSTALL_CLEANUP'});
  assert.deepEqual(store.get(READING_TOC_SITE_STORE),unrelated,
    'malformed records must remain intact for operator recovery, not be spread into objects');
  assert.deepEqual(store.get(TOOL_CLEANUP_STORE),pending,
    'cleanup cannot be marked completed after skipping a broken unrelated store');
  assert.deepEqual(store.get(SIDEBAR_TOOL_STORE),[]);
});

test('Back requests post-commit list focus and last uninstall requests import fallback',async t=>{
  const f=await hostFixture(t,{startTool:false});
  f.host.openTool(sample.id);
  f.emit(f.elements['sidebar-tool-back'],'click');
  assert.ok(f.view.takeEffects().some(effect=>effect.key==='sidebar-tool-import-trigger'&&
    effect.method==='focus'&&effect.options.extensionToolId===sample.id));
  f.host.openTool(sample.id);
  f.emit(f.elements['sidebar-tool-remove'],'click');
  f.emit(f.elements['sidebar-tool-inline-remove-confirm'],'click');
  await settle(()=>f.store.get(SIDEBAR_TOOL_STORE)?.length===0);
  await pause();
  assert.equal(f.runtime.frameRoot.children.length,0);
  assert.ok(f.view.takeEffects().some(effect=>effect.key==='sidebar-tool-import-trigger'&&effect.method==='focus'));
});

test('stopped tool detail opens a fixed full-page route without running sidebar code',async t=>{
  const f=await hostFixture(t,{startTool:false,store:new Map([[SIDEBAR_TOOL_STORE,[sample]],[SIDEBAR_TOOL_ENABLE_STORE,{[sample.id]:false}]])});
  const opened=[];f.api.tabs={create:async options=>{opened.push(options.url);}};
  f.host.openTool(sample.id);
  assert.equal(f.elements['sidebar-tool-frame'].children.length,0);
  f.emit(f.elements['sidebar-tool-open-tab'],'click');await pause();await pause();
  assert.deepEqual(opened,['chrome-extension://test/sidepanel.html?toolId=quick-notes']);
  assert.equal(f.elements['sidebar-tool-frame'].children.length,0);
});

test('R1.2 verified official Markdown workspace ignores content-resize hints and cleans up layout',async t=>{
  const official=await officialToolFixture('markdown-workbench');
  const f=await hostFixture(t,{tool:official,store:new Map([[SIDEBAR_TOOL_STORE,[official]]])});
  assert.equal(f.runtime.frameRoot.dataset.officialWorkspace,'true',
    'only exact official released bytes may opt in to the shared workspace height');
  assert.equal(f.frame.style.height,'');
  f.win.emit('message',{source:f.frame.contentWindow,origin:'null',data:{
    protocol:f.loaded.protocol,kind:'resize',instance:f.loaded.instance,
    toolId:official.id,height:1400
  }});
  assert.equal(f.frame.style.height,'','an intrinsic content resize cannot override verified flex sizing');
  f.host.closeTool();
  assert.equal(f.runtime.frameRoot.dataset.officialWorkspace,undefined,
    'closing a tool revokes the layout mode along with its frame session');
});

test('R1.2 same-ID user-installed Markdown package cannot claim the official full-height layout',async t=>{
  const official=await officialToolFixture('markdown-workbench');
  const altered={...official,css:official.css+'\n.mdw{outline:0}'};
  const f=await hostFixture(t,{tool:altered,store:new Map([[SIDEBAR_TOOL_STORE,[altered]]])});
  assert.equal(f.runtime.frameRoot.dataset.officialWorkspace,undefined,
    'official ID or name without a matching release hash never grants layout admission');
  f.win.emit('message',{source:f.frame.contentWindow,origin:'null',data:{
    protocol:f.loaded.protocol,kind:'resize',instance:f.loaded.instance,
    toolId:altered.id,height:240
  }});
  assert.equal(f.frame.style.height,'240px',
    'unverified user package retains the ordinary content-height iframe policy');
});

test('R18 resize and status messages accept only the live opaque frame and bounded sizes',async t=>{
  const f=await hostFixture(t);
  const loaded=f.frame.contentWindow.sent[0];
  const send=(source,origin,kind,more={},instance=loaded.instance)=>{
    globalThis.window.emit('message',{source,origin,data:{
      protocol:loaded.protocol,kind,instance,toolId:sample.id,...more}});
  };
  send({},'null','resize',{height:260});
  send(f.frame.contentWindow,'https://evil.example','resize',{height:260});
  send(f.frame.contentWindow,'null','resize',{height:260},'forged');
  send(f.frame.contentWindow,'null','resize',{height:NaN});
  send(f.frame.contentWindow,'null','resize',{height:90000});
  assert.equal(f.frame.style.height,'','forged or unbounded size never applies');
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
  await frame.onload();const loaded=frame.contentWindow.sent[0];
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
  assert.equal(f.host.closeTool(),false,'dirty preview requires nonmodal in-page confirmation');
  assert.equal(f.elements['sidebar-tool-action-review'].hidden,false);
  f.emit(f.elements['sidebar-tool-action-continue'],'click');
  await pause();
  assert.equal(f.elements['sidebar-tool-frame'].children.length,0);
  await ask('storage.set',{key:'note',value:'replay'},'later');
  assert.equal(f.store.has(sidebarToolStorageKey(sample.id)),false);
});

test('stopping a read-only preview removes its frame and ignores the retired instance',async t=>{
  const f=await hostFixture(t,{startTool:false});
  f.host.openReadOnlyPreview(sample);
  const frame=f.elements['sidebar-tool-frame'].children[0];
  await frame.onload();const loaded=frame.contentWindow.sent[0];
  assert.equal(f.host.stopReadOnlyPreview(),true);
  assert.equal(f.host.isPreviewActive(),false);
  assert.equal(f.elements['sidebar-tool-frame'].children.length,0);
  const replies=frame.contentWindow.sent.length;
  globalThis.window.emit('message',{source:frame.contentWindow,origin:'null',
    data:{protocol:loaded.protocol,toolId:sample.id,instance:loaded.instance,
      kind:'request',requestId:'retired-preview',operation:'storage.get',payload:{key:'note'}}});
  await pause();await pause();
  assert.equal(frame.contentWindow.sent.length,replies,'retired preview receives no response');
  assert.equal(f.host.stopReadOnlyPreview(),false,'Stop is idempotent');
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

test('R4.5 identical page revalidation preserves actual clipper results, while same-URL navigation invalidates them',async t=>{
  const tool=await officialToolFixture('web-markdown-clipper');
  const tab={id:7,windowId:1,active:true,status:'complete',title:'页面测试',url:'https://article.example/read'};
  let documentId='document-a';
  const target=createCurrentPageTarget({api:{windows:{getCurrent:async()=>({id:1})},
    tabs:{query:async()=>[{...tab}]},webNavigation:{getAllFrames:async()=>[{frameId:0,documentId,url:tab.url}]}}});
  t.after(()=>target.dispose());await target.ready;
  // A reinstated tool has a non-null durable epoch. The host must forward
  // that exact epoch into the real clipper content message, not silently send
  // an undefined value that the page correctly rejects as revoked.
  const clipInstallEpoch='f462e128-21c3-4b8d-9f2a-51bdc82378ac';
  const store=new Map([[SIDEBAR_TOOL_STORE,[tool]],
    [TOOL_REVOCATION_EPOCHS_STORE,{[tool.id]:clipInstallEpoch}]]);
  const f=await hostFixture(t,{tool,store,target});
  let gate=null,reads=0;
  f.api.tabs={sendMessage:async(tabId,message,options)=>{
    assert.equal(tabId,7);assert.equal(message.operation,'clip.article');
    assert.equal(message.installEpoch,clipInstallEpoch,'reinstalled clipper sends the live revocation epoch');
    assert.deepEqual(options,{frameId:0,documentId});reads++;
    if(gate)await gate.promise;
    return {ok:true,data:{markdown:'# 页面测试\n正文',source:tab.url,title:tab.title,site:'article.example'}};
  }};
  const root=new Node(),nodes=new Map(),pending=new Map();let requestId=0;
  root.querySelector=selector=>{if(!nodes.has(selector))nodes.set(selector,new Node());return nodes.get(selector);};
  root.querySelectorAll=()=>[];root.querySelector('#clip-meta').value='footer';
  f.frame.contentWindow.postMessage=message=>{
    f.frame.contentWindow.sent.push(message);
    if(message.kind==='page-changed')root.emit('opendesk-page-changed');
    const waiter=pending.get(message.requestId);
    if(message.kind==='response'&&waiter){pending.delete(message.requestId);message.ok?waiter.resolve(message.result):waiter.reject(Error(message.error.message));}
  };
  runInNewContext(tool.js,{URL,OpenDeskTool:{root,request(operation,payload){
    const id=String(++requestId);return new Promise((resolve,reject)=>{
      pending.set(id,{resolve,reject});f.ask(operation,payload,id);
    });
  }},document:{createDocumentFragment:()=>new Node(),createElement:tag=>new Node(tag)}});
  const fetchButton=root.querySelector('#clip-fetch'),source=root.querySelector('#clip-source');
  fetchButton.emit('click');await settle(()=>reads===1&&fetchButton.disabled===false);
  assert.match(source.value,/# 页面测试\n正文/,'the real tool must retain a reply checked twice against the same document');
  assert.equal(f.frame.contentWindow.sent.filter(row=>row.kind==='page-changed').length,0);
  const captured=target.capture();documentId='document-b';
  await assert.rejects(target.revalidate(captured),{code:'E_DOCUMENT_STALE'});
  assert.equal(source.value,'','authoritative revalidation detects a same-URL reload even before a navigation event');
  assert.equal(f.frame.contentWindow.sent.filter(row=>row.kind==='page-changed').length,1);
  gate=deferred();fetchButton.emit('click');await settle(()=>reads===2);
  documentId='document-c';const refreshed=target.refresh();
  assert.equal(source.value,'','resolving invalidates a pending clip before the new document is available');
  await refreshed;gate.resolve();await settle(()=>f.frame.contentWindow.sent.filter(row=>row.kind==='response').length===2);
  assert.equal(source.value,'','same URL with a new document ID must reject the old reply');
  assert.equal(f.frame.contentWindow.sent.filter(row=>row.kind==='page-changed').length,3);
  assert.equal(f.frame.contentWindow.sent.filter(row=>row.kind==='response').at(-1).ok,false);
});

test('TOC detail actions remain available after repeated page observations',async t=>{
  const toc=await officialToolFixture('reading-toc');let notify;
  const target={snapshot:{status:'available',url:'https://article.example/a',title:'A'},
    subscribe(fn){notify=fn;fn(this.snapshot);return()=>{};}};
  const f=await hostFixture(t,{target,store:new Map([[SIDEBAR_TOOL_STORE,[toc]]]),startTool:false});await pause();
  notify(target.snapshot);f.host.setVisible(true);
  target.snapshot={...target.snapshot,title:'Updated title',url:'https://article.example/other'};notify(target.snapshot);
  f.host.openTool(toc.id);
  assert.equal(f.elements['sidebar-tool-frame'].children.length,1);
  assert.equal(f.elements['sidebar-tool-settings-open'].hidden,false,'gear belongs to active detail toolbar');
  f.emit(f.elements['sidebar-tool-settings-open'],'click');
  assert.equal(f.elements['sidebar-tool-settings-view'].hidden,false);
  target.snapshot={status:'unavailable'};notify(target.snapshot);
  assert.equal(f.elements['sidebar-tool-settings-allow'].disabled,true);
  assert.equal(f.elements['sidebar-tool-settings-deny'].disabled,true);
});

test('R4.7 settings live next to retained TOC iframe; appearance remains separate from runtime permissions',async t=>{
  const toc=await officialToolFixture('reading-toc');
  const url='https://article.example/long-answer?q=private';
  const store=new Map([[SIDEBAR_TOOL_STORE,[toc]],
    [READING_TOC_SITE_STORE,{'reading-toc':['https://article.example']}]]); 
  const target={snapshot:{status:'available',url,title:'Long answer'},
    capture(){return {url,origin:'https://article.example',tabId:5,documentId:'doc'};},
    async revalidate(){return true;}};
  const f=await hostFixture(t,{target,store,tool:toc});
  const gear=f.elements['sidebar-tool-settings-open'],back=f.elements['sidebar-tool-back'];
  assert.equal(gear.hidden,false);
  const iframe=f.elements['sidebar-tool-frame'].children[0];
  f.emit(gear,'click');
  assert.equal(f.elements['sidebar-tool-settings-view'].hidden,false);
  assert.equal(f.elements['sidebar-tool-frame'].hidden,true);
  assert.equal(f.elements['sidebar-tool-frame'].children[0],iframe,'the sandbox is retained, not reloaded');
  assert.equal(f.elements['sidebar-tool-title'].textContent,'设置');
  assert.equal(f.elements['sidebar-tool-title'].attributes['aria-label'],toc.title+' / 设置');
  const pagePrefs=changeReadingTocVisibility({},toc.id,url,'page',true);
  f.changeStorage({[READING_TOC_VISIBILITY_STORE]:{newValue:pagePrefs}});
  assert.equal(f.elements['sidebar-tool-settings-page-visibility'].textContent,'恢复显示');
  assert.deepEqual(store.get(READING_TOC_SITE_STORE),{'reading-toc':['https://article.example']});
  f.emit(back,'click');
  assert.equal(f.elements['sidebar-tool-frame'].hidden,false);
  assert.equal(f.elements['sidebar-tool-frame'].children[0],iframe);
  assert.equal(f.elements['sidebar-tool-settings-view'].hidden,true);
  f.emit(back,'click');
  assert.equal(f.elements['sidebar-tool-frame'].children.length,0,'leaving the tool really tears down the sandbox');
});

test('R26 page appearance is independent of site authorization and global availability',async t=>{
  const toc=await officialToolFixture('reading-toc'),url='https://article.example/long-answer?private=1';
  const store=new Map([[SIDEBAR_TOOL_STORE,[toc]],
    [READING_TOC_SITE_STORE,{'reading-toc':['https://article.example']}]]);
  const target={snapshot:{status:'available',url},capture(){return {url,origin:'https://article.example',tabId:5,documentId:'doc'};},async revalidate(){return true;}};
  const f=await hostFixture(t,{target,store,tool:toc});
  f.emit(f.elements['sidebar-tool-settings-open'],'click');
  f.emit(f.elements['sidebar-tool-settings-page-visibility'],'click');
  await settle(()=>Boolean(store.get(READING_TOC_VISIBILITY_STORE)?.[toc.id]?.hiddenPages?.length));
  assert.deepEqual(store.get(READING_TOC_SITE_STORE),{[toc.id]:['https://article.example']});
  assert.equal(store.has(READING_TOC_PAGE_RULES_STORE),false);
  f.emit(f.elements['sidebar-tool-settings-page-visibility'],'click');
  await settle(()=>!store.get(READING_TOC_VISIBILITY_STORE)?.[toc.id]);
});

test('default reader settings can restore a stopped website without revisiting it',async t=>{
  const toc={...sample,id:'reading-toc',capabilities:['page.toc']};
  const store=new Map([[SIDEBAR_TOOL_STORE,[toc]],
    [READING_TOC_SITE_STORE,changeTocSiteAllowed({},toc.id,'https://old.example',false)]]);
  const target={snapshot:{status:'available',url:'https://article.example/latest'}};
  const f=await hostFixture(t,{store,startTool:true,tool:toc,target});
  f.emit(f.elements['sidebar-tool-settings-open'],'click');
  const sites=f.elements['sidebar-tool-settings-sites'];
  const oldSite=sites.rows.find(row=>row.id==='https://old.example');
  assert.ok(oldSite,'stopped websites can be managed from the independent view');
  assert.equal(f.elements['sidebar-tool-settings-sites-title'].textContent,'已停用的网站');
  assert.equal(oldSite.label,'恢复');
  f.view.activateRow(sites.key,oldSite.id);
  await settle(()=>!store.get(READING_TOC_SITE_STORE)?.[toc.id]);
  assert.deepEqual(store.get(READING_TOC_SITE_STORE),{});
  assert.deepEqual(store.get(SIDEBAR_TOOL_STORE),[toc],'revoke does not replace the tool package');
});


for(const [toolId,key,url,origin] of [
  ['reading-toc',READING_TOC_SITE_STORE,'http://127.0.0.1:43111/demo-form.html','http://127.0.0.1:43111'],
  ['web-markdown-clipper',CLIP_SITE_STORE,'https://article.example/story','https://article.example'],
  ['knowledge-inbox',CAPTURE_SITE_STORE,'https://chatgpt.com/c/fixture','https://chatgpt.com']
])test('site permission settings apply one click without a second dialog: '+toolId,async t=>{
  const tool=await officialToolFixture(toolId),store=new Map([[SIDEBAR_TOOL_STORE,[tool]]]);
  store.set(key,toolId==='reading-toc'?changeTocSiteAllowed({},toolId,url,false):changeInstalledSiteAccess({},toolId,url,false));
  const siteAllowed=()=>toolId==='reading-toc'?tocSiteAllowed(store.get(key),toolId,url):
    installedSiteAllowed(store.get(key),toolId,url);
  const allowedRecord={};
  let invalidated=false,validated=0,dialogCount=0;
  const target={snapshot:{status:'available',url},
    capture(){return {url,origin,windowId:1,tabId:7,frameId:0,documentId:'doc-a'};},
    async revalidate(){validated++;
      if(invalidated)throw Object.assign(new Error('当前网页已变化'),{code:'E_DOCUMENT_STALE'});}
  };
  const f=await hostFixture(t,{store,tool,target});
  f.emit(f.elements['sidebar-tool-settings-open'],'click');
  const allow=f.elements['sidebar-tool-settings-allow'];
  const deny=f.elements['sidebar-tool-settings-deny'];
  assert.equal(allow.disabled,false);
  assert.equal(allow.attributes['aria-pressed'],'false');
  assert.match(f.elements['sidebar-tool-settings-hint'].textContent,toolId==='reading-toc'?/安装后默认适用于普通 HTTP\(S\) 网页.*无需逐站授权/:/当前网站已停用/);
  globalThis.confirm=()=>{dialogCount++;return false;};
  f.emit(allow,'click');
  f.emit(allow,'click'); // repeated clicks before the first commit must not flip consent
  await settle(()=>siteAllowed()&&!allow.disabled);
  assert.deepEqual(store.get(key),allowedRecord,'the exact-origin stop/grant is restored');
  assert.equal(allow.attributes['aria-pressed'],'true');
  assert.equal(f.elements['sidebar-tool-settings-view'].hidden,false);
  assert.equal(dialogCount,0,'site grant is a direct action, not window.confirm');
  if(toolId==='reading-toc'){
    const eye=f.elements['sidebar-tool-visibility'];
    assert.equal(eye.disabled,false);
    f.emit(eye,'click');f.emit(eye,'click');
    await settle(()=>Boolean(store.get(READING_TOC_VISIBILITY_STORE)?.[toolId]?.hiddenSites?.includes(origin))&&!eye.disabled);
    assert.deepEqual(store.get(key),allowedRecord,'hide is independent of website grant');
    f.emit(eye,'click');
    await settle(()=>!store.get(READING_TOC_VISIBILITY_STORE)?.[toolId]&&!eye.disabled);
    assert.equal(dialogCount,0,'show/hide must never prompt');
  }
  f.emit(deny,'click');
  await settle(()=>!siteAllowed()&&!deny.disabled);
  assert.equal(deny.attributes['aria-pressed'],'true');
  assert.equal(dialogCount,0,'site revocation needs no dialog');
  invalidated=true;
  f.emit(allow,'click');
  await settle(()=>/E_DOCUMENT_STALE/.test(f.elements['sidebar-tool-status'].textContent||''));
  assert.equal(siteAllowed(),false,'stale document must not gain a permission');
  assert.equal(dialogCount,0);
  assert.ok(validated>=3,'native target binding is checked before persistent write');
});

test('R4.3 existing 1.0.0 TOC exposes update, reviews patch, preserves site grants',async t=>{
  const bundled=await officialToolFixture('reading-toc');
  const old={...bundled,version:'1.0.0',js:'void 0;'};
  const granted={'reading-toc':['https://article.example']};
  const f=await hostFixture(t,{store:new Map([
    [SIDEBAR_TOOL_STORE,[old]],[READING_TOC_SITE_STORE,granted]
  ]),startTool:false,target:{snapshot:{status:'available',url:'https://article.example/demo'}}});
  assert.equal(f.host.openOfficialReview(bundled.id),true);
  await settle(()=>!f.elements['sidebar-tool-preview'].hidden);
  assert.equal(f.elements['sidebar-tool-preview'].hidden,false,'update requires explicit review');
  assert.equal(f.elements['sidebar-tool-preview-version'].textContent,'v'+bundled.version);
  assert.equal(f.elements['sidebar-tool-install'].textContent,'确认更新');
  assert.equal(f.store.get(SIDEBAR_TOOL_STORE)[0].version,'1.0.0',
    'preview must not upgrade until consent');
  f.emit(f.elements['sidebar-tool-install'],'click');
  await settle(()=>f.store.get(SIDEBAR_TOOL_STORE)[0].version===bundled.version);
  assert.equal(f.store.get(SIDEBAR_TOOL_STORE)[0].version,bundled.version);
  assert.deepEqual(f.store.get(READING_TOC_SITE_STORE),granted);
});

test('knowledge editor protects user navigation, clears after save, and never vetoes uninstall',async t=>{
  const knowledge=await officialToolFixture('knowledge-inbox');
  const store=new Map([[SIDEBAR_TOOL_STORE,[knowledge,sample]]]);
  const f=await hostFixture(t,{store,startTool:false});
  f.host.openTool(knowledge.id);
  const frame=f.elements['sidebar-tool-frame'].children[0];await frame.onload();
  const loaded=frame.contentWindow.sent[0];let requestId=0;
  const dirty=async value=>{
    globalThis.window.emit('message',{origin:'null',source:frame.contentWindow,
      data:{protocol:loaded.protocol,toolId:knowledge.id,instance:loaded.instance,kind:'request',requestId:String(++requestId),operation:'knowledge.editorState',payload:{dirty:value}}});
    await pause();
  };
  for(let i=0;i<105;i++)globalThis.window.emit('message',{origin:'null',source:frame.contentWindow,
    data:{protocol:loaded.protocol,toolId:knowledge.id,instance:loaded.instance,kind:'request',requestId:'quota-'+i,operation:'knowledge.list',payload:{}}});
  await dirty(true);assert.equal(f.host.isDirty(),true);
  globalThis.confirm=()=>false;
  assert.equal(f.host.closeTool(),false);assert.equal(f.host.setVisible(false),false);
  f.host.openTool(sample.id);
  assert.equal(f.elements['sidebar-tool-frame'].children[0],frame);
  await dirty(false);assert.equal(f.host.isDirty(),false);
  assert.equal(f.host.closeTool(),true);
  f.host.openTool(knowledge.id);
  const pending={'opendesk.knowledge.workspace.v1:123':{private:true},unrelated:{keep:true}};
  f.api.storage.session={get:async()=>pending,remove:async keys=>{
    for(const key of typeof keys==='string'?[keys]:keys)delete pending[key];
  }};
  globalThis.confirm=()=>true;
  f.emit(f.elements['sidebar-tool-remove'],'click');
  f.emit(f.elements['sidebar-tool-inline-remove-confirm'],'click');
  await settle(()=>!Object.hasOwn(pending,'opendesk.knowledge.workspace.v1:123')&&
    !store.get(SIDEBAR_TOOL_STORE).some(row=>row.id===knowledge.id));
  assert.deepEqual(pending,{unrelated:{keep:true}});
  assert.equal(f.elements['sidebar-tool-frame'].children.length,0);
  assert.equal(store.get(SIDEBAR_TOOL_STORE).some(row=>row.id===knowledge.id),false);
});

test('R4.8 manual reviewed installation remains available for every offline official package',async t=>{
  // The shipping extension includes the fixed audited Focus sidecar. A fixture
  // without it is intentionally an older browser and must refuse Focus.
  const previous=globalThis.__opendeskStayFocusTrustedUI;
  globalThis.__opendeskStayFocusTrustedUI=Object.freeze({
    id:FOCUS_ID,capability:FOCUS_CAPABILITY,operations:FOCUS_OPERATIONS,
    request:requestStayFocusOperation,runTrustedOperation:runTrustedStayFocusOperation,
    probe:async()=>({serviceReady:true}),
    createPermissionControls:createStayFocusPermissionControls
  });
  t.after(()=>{if(previous===undefined)delete globalThis.__opendeskStayFocusTrustedUI;
    else globalThis.__opendeskStayFocusTrustedUI=previous;});
  // The reviewed AI tool has a fixed first-party host. This generic installer
  // fixture supplies a matching extension-owned sidecar; the actual PAC and
  // authorization protocol have independent R1 tests.
  const previousAi=globalThis.__opendeskAiAccessTrustedUI;
  globalThis.__opendeskAiAccessTrustedUI=Object.freeze({
    id:AI_ID,capability:AI_CAPABILITY,operations:AI_OPERATIONS,
    request:async()=>({}),runTrustedOperation:async()=>({}),
    probe:async()=>({ready:true}),createPermissionControls:()=>({render(){},dispose(){}})
  });
  t.after(()=>{if(previousAi===undefined)delete globalThis.__opendeskAiAccessTrustedUI;
    else globalThis.__opendeskAiAccessTrustedUI=previousAi;});
  // This fixture tests reviewed official install and uninstall, not actual DNR
  // authorization. An old browser with no fixed AdBlock sidecar must fail closed.
  const previousAdblock=globalThis.__opendeskAdblockTrustedUI;
  globalThis.__opendeskAdblockTrustedUI=Object.freeze({
    id:ADBLOCK_ID,capability:ADBLOCK_CAPABILITY,operations:ADBLOCK_OPERATIONS,
    request:async()=>({}),runTrustedOperation:async()=>({}),
    probe:async()=>({serviceReady:true}),createPermissionControls:()=>({render(){},dispose(){}})
  });
  t.after(()=>{if(previousAdblock===undefined)delete globalThis.__opendeskAdblockTrustedUI;
    else globalThis.__opendeskAdblockTrustedUI=previousAdblock;});
  const requested=[],store=new Map();
  const f=await hostFixture(t,{store,startTool:false,fetcher:async(url,options)=>{
    requested.push(String(url));return officialFixtureFetch(url,options);
  },hostReply:async message=>{
    // This component double represents the shipping declarative-policy Worker.
    // Missing/unsupported Worker admission remains covered by installer tests.
    if(message.protocol===MANAGED_SITE_BUDGET_PROTOCOL&&message.operation==='probe')
      return {ok:true,data:{managedSiteRuntime:{contract:MANAGED_SITE_RUNTIME_CONTRACT,
        privilegedJs:false,policyKinds:['site-budget.v2','site-budget.v3']}}};
  }});
  // Model empty native resources for verified uninstall; no real permissions or
  // Chrome rules/proxy are touched by this component fixture.
  f.api.permissions={contains:async({permissions})=>permissions.every(name=>name==='proxy')};
  f.api.proxy={settings:{async get(){return {levelOfControl:'controllable_by_this_extension'};},
    async clear(){assert.fail('an empty proxy must never be cleared');}}};
  const alarms=new Map();
  f.api.alarms={async create(name,value){alarms.set(name,value);},
    async clear(name){return alarms.delete(name);},async get(name){return alarms.get(name);}};
  const session=new Map();
  f.api.storage.session={
    async get(key){return {[key]:structuredClone(session.get(key))};},
    async set(rows){for(const [key,value] of Object.entries(rows))session.set(key,structuredClone(value));},
    async remove(key){session.delete(key);}
  };
  const {catalog}=await officialFixtures();
  assert.deepEqual(requested,[f.api.runtime.getURL('official-tools/catalog.json'),OFFICIAL_FOCUS_LATEST_URL],
    'first run loads only the local catalog and fixed Focus metadata, never tool packages');
  assert.equal(store.has(SIDEBAR_TOOL_STORE),false);
  for(const key of [READING_TOC_SITE_STORE,CLIP_SITE_STORE,CAPTURE_SITE_STORE])assert.equal(store.has(key),false);
  for(const release of catalog.apps){
    const before=structuredClone(store.get(SIDEBAR_TOOL_STORE));
    assert.equal(f.host.openOfficialReview(release.toolId),true);
    await settle(()=>!f.elements['sidebar-tool-preview'].hidden);
    assert.equal(f.elements['sidebar-tool-preview-version'].textContent,'v'+release.version);
    assert.deepEqual(store.get(SIDEBAR_TOOL_STORE),before,'review cannot install');
    assert.equal(f.elements['sidebar-tool-frame'].children.length,0);
    f.emit(f.elements['sidebar-tool-import-close'],'click');
    assert.deepEqual(store.get(SIDEBAR_TOOL_STORE),before,'cancel preserves previous registry');
    assert.equal(f.host.openOfficialReview(release.toolId),true);
    await settle(()=>!f.elements['sidebar-tool-preview'].hidden);
    f.emit(f.elements['sidebar-tool-install'],'click');
    f.emit(f.elements['sidebar-tool-install'],'click');
    await settle(()=>f.elements['sidebar-tool-import'].hidden);
    assert.equal(store.get(SIDEBAR_TOOL_STORE).filter(row=>row.id===release.toolId).length,1);
    assert.equal(store.get(MARKET_PROVENANCE_STORE)[release.toolId].sha256,release.sha256);
    assert.equal(f.elements['sidebar-tool-frame'].children.length,0,'confirmed install cannot run code');
    // Exercise every package without bypassing the real installed-tool limit.
    f.host.openTool(release.toolId);
    f.emit(f.elements['sidebar-tool-remove'],'click');
    f.emit(f.elements['sidebar-tool-inline-remove-confirm'],'click');
    await settle(()=>!store.get(SIDEBAR_TOOL_STORE).some(row=>row.id===release.toolId));
    try{await settle(()=>!store.get(TOOL_CLEANUP_STORE)?.[release.toolId]);}
    catch{assert.fail(release.toolId+': '+f.elements['sidebar-tool-status'].textContent);}
  }
  assert.deepEqual(store.get(SIDEBAR_TOOL_STORE),[]);
  f.host.dispose();
  const reopened=await hostFixture(t,{store,startTool:false});
  assert.deepEqual(store.get(SIDEBAR_TOOL_STORE),[],'reopening cannot reinstall bundled resources');
  assert.equal(reopened.elements['sidebar-tool-frame'].children.length,0);
  for(const key of [READING_TOC_SITE_STORE,CLIP_SITE_STORE,CAPTURE_SITE_STORE])assert.equal(store.has(key),false);
});

test('import state actions preserve the installed registry and never start a sandbox',async t=>{
  const f=await hostFixture(t,{startTool:false}),before=structuredClone(f.store.get(SIDEBAR_TOOL_STORE));
  assert.equal(f.host.openImport(),true);
  assert.equal(f.elements['sidebar-tool-import'].hidden,false);
  assert.equal(f.elements['sidebar-tool-import-trigger'].attributes['aria-expanded'],'true');
  f.emit(f.elements['sidebar-tool-import-close'],'click');
  assert.equal(f.elements['sidebar-tool-import'].hidden,true);
  assert.equal(f.elements['sidebar-tool-import-trigger'].attributes['aria-expanded'],'false');
  assert.equal(f.runtime.frameRoot.children.length,0);
  assert.deepEqual(f.store.get(SIDEBAR_TOOL_STORE),before);
});

test('read-only development preview survives opening and cancelling extension import',async t=>{
  const f=await hostFixture(t,{startTool:false}),before=structuredClone(f.store.get(SIDEBAR_TOOL_STORE));
  f.host.openReadOnlyPreview(sample);
  const frame=f.runtime.frameRoot.firstElementChild;
  await frame.onload();
  const loaded=frame.contentWindow.sent.length;
  assert.equal(f.host.openImport(),true);
  assert.equal(f.elements['sidebar-tool-import'].hidden,false);
  assert.equal(f.runtime.frameRoot.firstElementChild,frame);
  f.emit(f.elements['sidebar-tool-import-close'],'click');
  assert.equal(f.elements['sidebar-tool-import'].hidden,true);
  assert.equal(f.runtime.frameRoot.firstElementChild,frame);
  assert.equal(frame.contentWindow.sent.length,loaded,'import cannot reload the live preview');
  assert.equal(f.host.isPreviewActive(),true);
  assert.deepEqual(f.store.get(SIDEBAR_TOOL_STORE),before);
});

test('extension import still refuses to replace an active installed application',async t=>{
  const f=await hostFixture(t),frame=f.runtime.frameRoot.firstElementChild;
  assert.equal(f.host.openImport(),false);
  assert.equal(f.elements['sidebar-tool-import'].hidden,true);
  assert.equal(f.runtime.frameRoot.firstElementChild,frame);
});

test('R4.5 two official review windows share the original installation lock and reject stale approvals',async t=>{
  const originalWindow=globalThis.window,originalConfirm=globalThis.confirm;
  const store=new Map(),locks=sharedLocks(),release=(await officialFixtures()).catalog.apps[0];
  const a=await hostFixture(t,{store,locks,startTool:false}),b=await hostFixture(t,{store,locks,startTool:false});
  t.after(()=>{globalThis.window=originalWindow;globalThis.confirm=originalConfirm;});
  for(const f of [a,b]){
    f.host.openOfficialReview(release.toolId);
    await settle(()=>!f.elements['sidebar-tool-preview'].hidden);
  }
  a.emit(a.elements['sidebar-tool-install'],'click');b.emit(b.elements['sidebar-tool-install'],'click');
  await settle(()=>a.elements['sidebar-tool-import'].hidden||b.elements['sidebar-tool-import'].hidden);
  await settle(()=>[a,b].some(f=>/发生变化/.test(f.elements['sidebar-tool-file-error'].textContent||'')));
  assert.equal(store.get(SIDEBAR_TOOL_STORE).length,1);
  assert.equal(store.get(MARKET_PROVENANCE_STORE)[release.toolId].version,release.version);
});

test('R4.5 missing official resources and a cancelled in-flight preview never install or overwrite local review',async t=>{
  const gate=deferred(),requested=deferred();let broken=false;
  const f=await hostFixture(t,{store:new Map(),startTool:false,fetcher:async(url)=>{
    if(new URL(url).pathname.endsWith('/reading-toc.opendesk-tool.json')){
      requested.resolve();await gate.promise;
      if(broken)return new Response('missing',{status:404});
    }
    return officialFixtureFetch(url);
  }});
  const official=()=>f.host.openOfficialReview('reading-toc');
  official();await requested.promise;
  f.emit(f.elements['sidebar-tool-import-close'],'click');gate.resolve();await pause();await pause();
  assert.equal(f.elements['sidebar-tool-preview'].hidden,true);
  assert.equal(f.store.has(SIDEBAR_TOOL_STORE),false);
  broken=true;official();
  await settle(()=>f.elements['sidebar-tool-file-error'].hidden===false);
  assert.match(f.elements['sidebar-tool-file-error'].textContent,/E_PACKAGE_MISSING/);
  assert.equal(f.elements['sidebar-tool-install'].disabled,true);
  assert.equal(f.store.has(SIDEBAR_TOOL_STORE),false);
  assert.equal(f.elements['sidebar-tool-frame'].children.length,0);
});

for(const failReadback of [false,true])test('R4.5 lost registry acknowledgement revokes approval without replay; readback failure='+failReadback,async t=>{
  const f=await hostFixture(t,{store:new Map(),startTool:false});
  const release=(await officialFixtures()).catalog.apps[0];
  f.host.openOfficialReview(release.toolId);
  await settle(()=>!f.elements['sidebar-tool-preview'].hidden);
  const set=f.api.storage.local.set,get=f.api.storage.local.get;let registryWrites=0,unreadable=false;
  f.api.storage.local.set=async value=>{
    await set(value);
    if(Object.hasOwn(value,SIDEBAR_TOOL_STORE)&&++registryWrites===1){unreadable=failReadback;throw Error('ack lost after persistent write');}
  };
  f.api.storage.local.get=key=>{
    if(key===SIDEBAR_TOOL_STORE&&unreadable){unreadable=false;return Promise.reject(Error('registry readback unavailable'));}
    return get(key);
  };
  f.emit(f.elements['sidebar-tool-install'],'click');
  await settle(()=>/本次批准已撤销/.test(f.elements['sidebar-tool-file-error'].textContent||''));
  await settle(()=>f.store.get(SIDEBAR_TOOL_STORE)?.length===1);
  assert.equal(f.store.get(SIDEBAR_TOOL_STORE).length,1);
  assert.equal(f.elements['sidebar-tool-preview'].hidden,true);assert.equal(f.elements['sidebar-tool-install'].disabled,true);
  assert.equal(f.elements['sidebar-tool-frame'].children.length,0);
  const [operationId,operation]=Object.entries(f.store.get(MARKET_OPERATIONS_STORE))[0];
  assert.equal(operation.state,'outcome-unknown');
  f.emit(f.elements['sidebar-tool-install'],'click');f.emit(f.elements['sidebar-tool-install'],'click');
  await pause();await pause();assert.equal(registryWrites,1);
  assert.equal((await reconcileMarketOperation(f.api,operationId,f.store.get(SIDEBAR_TOOL_STORE)[0])).state,'needs-finalization');
  assert.equal(f.store.get(MARKET_OPERATIONS_STORE)[operationId].state,'outcome-unknown');
  assert.equal(f.store.get(MARKET_PROVENANCE_STORE)?.[release.toolId],undefined);
  assert.equal(registryWrites,1);
  assert.equal((await recoverMarketOperation({api:f.api,lockManager:sharedLocks(),operationId})).state,'succeeded');
  assert.equal(registryWrites,1,'explicit recovery never replays the registry write');


  for(const key of [READING_TOC_SITE_STORE,CLIP_SITE_STORE,CAPTURE_SITE_STORE])assert.equal(f.store.has(key),false);
});

test('R4.5 failure to refresh after a confirmed commit cannot reuse the consumed approval',async t=>{
  const f=await hostFixture(t,{store:new Map(),startTool:false}),release=(await officialFixtures()).catalog.apps[0];
  f.host.openOfficialReview(release.toolId);await settle(()=>!f.elements['sidebar-tool-preview'].hidden);
  const get=f.api.storage.local.get;let failed=false;
  f.api.storage.local.get=async key=>{
    if(key===SIDEBAR_TOOL_STORE&&!failed&&Object.values(f.store.get(MARKET_OPERATIONS_STORE)||{}).some(row=>row.state==='succeeded')){
      failed=true;throw Error('post-commit list read failed');
    }
    return get(key);
  };
  f.emit(f.elements['sidebar-tool-install'],'click');
  await settle(()=>/post-commit list read failed/.test(f.elements['sidebar-tool-file-error'].textContent||''));
  assert.equal(f.store.get(SIDEBAR_TOOL_STORE).length,1);
  assert.equal(f.elements['sidebar-tool-install'].disabled,true);assert.equal(f.elements['sidebar-tool-preview'].hidden,true);
});

test('R4.5 an official package removed after review is rejected before any installation write',async t=>{
  let removed=false;
  const f=await hostFixture(t,{store:new Map(),startTool:false,fetcher:async url=>
    removed&&new URL(url).pathname.endsWith('.opendesk-tool.json')?new Response('',{status:404}):officialFixtureFetch(url)});
  f.host.openOfficialReview((await officialFixtures()).catalog.apps[0].toolId);
  await settle(()=>!f.elements['sidebar-tool-preview'].hidden);removed=true;
  f.emit(f.elements['sidebar-tool-install'],'click');
  await settle(()=>/E_PACKAGE_MISSING/.test(f.elements['sidebar-tool-file-error'].textContent||''));
  assert.equal(f.store.has(SIDEBAR_TOOL_STORE),false);assert.equal(f.store.has(MARKET_OPERATIONS_STORE),false);
});

test('quota failure is returned with a stable bridge code and preserves the current tool draft',async t=>{
  const key=sidebarToolStorageKey(sample.id),previous={notes:'do not overwrite'};
  const store=new Map([[SIDEBAR_TOOL_STORE,[sample]],[key,previous]]);
  const f=await hostFixture(t,{store,setHook:async rows=>{
    if(Object.hasOwn(rows,key))throw Error('QUOTA_BYTES quota exceeded');
  }});
  f.ask('storage.set',{key:'notes',value:'unsaved edit'},'quota-failure');
  await settle(()=>f.frame.contentWindow.sent.some(row=>row.kind==='response'&&row.requestId==='quota-failure'));
  const reply=f.frame.contentWindow.sent.find(row=>row.requestId==='quota-failure');
  assert.equal(reply.ok,false);assert.equal(reply.error.code,'E_HOST_STORAGE_QUOTA');
  assert.deepEqual(store.get(key),previous);
  assert.equal(f.elements['sidebar-tool-frame'].children.length,1,
    'the failed save must not close a live editor and discard its unsaved input');
});

test('reinstalling identical bytes never restores an old iframe right to write',async t=>{
  const f=await hostFixture(t);
  await recordToolUninstall(f.api,sample);
  const epoch=f.store.get(TOOL_REVOCATION_EPOCHS_STORE)?.[sample.id];
  assert.match(epoch,/^[a-f0-9-]{36}$/);
  f.store.set(SIDEBAR_TOOL_STORE,[]);
  f.store.set(SIDEBAR_TOOL_STORE,[sample]); // exact same bytes, missed onChanged
  f.ask('storage.set',{key:'notes',value:'stale old window'},'stale-reinstall');
  await settle(()=>f.frame.contentWindow.sent.some(row=>row.kind==='response'&&row.requestId==='stale-reinstall'));
  const response=f.frame.contentWindow.sent.find(row=>row.requestId==='stale-reinstall');
  assert.equal(response.ok,false);assert.equal(response.error.code,'E_TOOL_CHANGED');
  assert.equal(f.store.has(sidebarToolStorageKey(sample.id)),false);
  assert.equal(f.elements['sidebar-tool-frame'].children.length,1,
    'rejected stale save leaves the old iframe and unsaved edits available for copying');
});

test('corrupt installed registry stays protected in Side Panel and never masquerades as empty',async t=>{
  const damaged=[sample,{...sample,id:'invalid id'}];
  const store=new Map([[SIDEBAR_TOOL_STORE,damaged]]);
  const f=await hostFixture(t,{store,startTool:false});
  assert.equal(f.elements['sidebar-tool-status'].attributes['data-state'],'error');
  f.host.openTool(sample.id);
  assert.equal(f.runtime.frameRoot.children.length,0);
  assert.match(f.elements['sidebar-tool-status'].textContent,/安装记录读取失败/);
  assert.deepEqual(store.get(SIDEBAR_TOOL_STORE),damaged);
});

test('uninstall refuses a newly corrupted registry rather than dropping unrelated rows',async t=>{
  const f=await hostFixture(t,{startTool:false}),damaged=[sample,{...sample,id:'invalid id'}];
  f.store.set(SIDEBAR_TOOL_STORE,damaged); // another context writes unexpected bytes
  f.host.openTool(sample.id);
  const remove=f.elements['sidebar-tool-remove'];
  assert(remove);
  f.emit(remove,'click');f.emit(f.elements['sidebar-tool-inline-remove-confirm'],'click');
  await settle(()=>/E_STORAGE_CORRUPT/.test(f.elements['sidebar-tool-status'].textContent||''));
  assert.deepEqual(f.store.get(SIDEBAR_TOOL_STORE),damaged);
  assert.equal(f.store.has(sidebarToolStorageKey(sample.id)),false);
});

test('default TOC availability needs no grant; stopping and restoring use one click',async t=>{
  const toc={...sample,id:'reading-toc',capabilities:['page.toc']};
  const url='https://article.example/guide';
  const target={snapshot:{status:'available',url,title:'Guide'},
    capture:()=>({url,origin:'https://article.example',tabId:7,documentId:'doc-toc'}),
    async revalidate(){return true;}};
  const f=await hostFixture(t,{store:new Map([[SIDEBAR_TOOL_STORE,[toc]]]),target,startTool:false});
  let prompts=0;
  globalThis.confirm=()=>{prompts++;return false;};
  f.host.openTool(toc.id);
  f.emit(f.elements['sidebar-tool-settings-open'],'click');
  assert.equal(f.elements['sidebar-tool-settings-allow'].attributes['aria-pressed'],'true');
  assert.equal(f.elements['sidebar-tool-visibility'].disabled,false);
  f.emit(f.elements['sidebar-tool-settings-allow'],'click');
  await pause();assert.equal(f.store.has(READING_TOC_SITE_STORE),false);
  assert.equal(prompts,0,'site grant is the users explicit selection; no second modal');
  f.emit(f.elements['sidebar-tool-settings-allow'],'click');await pause();
  assert.equal(f.store.has(READING_TOC_SITE_STORE),false,
    'selecting the already-active state is idempotent');
  f.emit(f.elements['sidebar-tool-settings-deny'],'click');
  await settle(()=>f.store.get(READING_TOC_SITE_STORE)?.[toc.id]?.blockedOrigins?.includes('https://article.example'));
  assert.equal(prompts,0,'revoking site grant also needs no extra modal');
  assert.equal(tocSiteAllowed(f.store.get(READING_TOC_SITE_STORE),toc.id,url),false);
  f.emit(f.elements['sidebar-tool-settings-allow'],'click');
  await settle(()=>!f.store.get(READING_TOC_SITE_STORE)?.[toc.id]);
  assert.deepEqual(f.store.get(READING_TOC_SITE_STORE),{});
});

test('R4.9 clipper and knowledge are available by default with one-click stop and restore',async t=>{
  const scenarios=[
    {id:'web-markdown-clipper',capabilities:['page.clip'],url:'https://article.example/post',
      origin:'https://article.example',storeKey:CLIP_SITE_STORE},
    {id:'knowledge-inbox',capabilities:['knowledge.store','page.capture'],url:'https://chatgpt.com/c/test',
      origin:'https://chatgpt.com',storeKey:CAPTURE_SITE_STORE}
  ];
  const tools=scenarios.map(scenario=>({...sample,id:scenario.id,capabilities:scenario.capabilities}));
  let current=scenarios[0];
  const target={snapshot:{status:'available',url:current.url,title:'Current page'},
    capture:()=>({url:current.url,origin:current.origin,tabId:7,documentId:'doc-site'}),
    async revalidate(){return true;}};
  const f=await hostFixture(t,{store:new Map([[SIDEBAR_TOOL_STORE,tools],['opendesk.sidebar-tools.enabled.v1',Object.fromEntries(tools.map(tool=>[tool.id,false]))]]),target,startTool:false});
  let prompts=0;
  globalThis.confirm=()=>{prompts++;return false;};
  for(const scenario of scenarios){
    current=scenario;
    target.snapshot={status:'available',url:current.url,title:'Current page'};
    f.host.setVisible(true);
    f.host.openTool(scenario.id);
    if(f.elements['sidebar-tool-settings-view'].hidden)f.emit(f.elements['sidebar-tool-settings-open'],'click');
    assert.equal(installedSiteAllowed(f.store.get(scenario.storeKey),scenario.id,scenario.url),true);
    assert.equal(f.store.has(scenario.storeKey),false,'first use needs no extra site permission write');
    assert.equal(prompts,0,scenario.id+' does not issue a second confirmation');
    assert.equal(f.elements['sidebar-tool-frame'].children.length,0,
      'authorizing a website never runs its tool sandbox');
    f.emit(f.elements['sidebar-tool-settings-deny'],'click');
    await settle(()=>!installedSiteAllowed(f.store.get(scenario.storeKey),scenario.id,scenario.url))
      .catch(error=>{throw new Error(scenario.id+': '+f.elements['sidebar-tool-status'].textContent,{cause:error});});
    assert.equal(prompts,0,'grant revocation also uses just the site control');
    await settle(()=>!f.elements['sidebar-tool-settings-allow'].disabled);
    f.emit(f.elements['sidebar-tool-settings-allow'],'click');
    await settle(()=>installedSiteAllowed(f.store.get(scenario.storeKey),scenario.id,scenario.url));
    f.host.closeTool();
  }
});

test('R4.9 availability controls use the ordinary compact button geometry',async()=>{
  const css=await readFile('src/ui/tool-shell.css','utf8');
  const layout=css.match(/\.sidebar-toc-settings-binary\{([^}]+)\}/)?.[1];
  const buttons=css.match(/\.sidebar-toc-settings-binary button\{([^}]+)\}/)?.[1];
  assert.ok(layout&&buttons,'TOC settings have explicit host-owned styling');
  assert.match(layout,/display:flex/);
  assert.doesNotMatch(layout,/grid-template-columns/);
  assert.match(buttons,/min-height:34px/);
  assert.match(buttons,/width:auto/);
  assert.match(buttons,/font-size:12px/);
  assert.doesNotMatch(buttons,/min-height:45px/);
});

test('R5.1 three official tool site grants require no extra JavaScript modal',async t=>{
  const scenarios=[
    {id:'reading-toc',url:'https://docs.example/item',origin:'https://docs.example',capabilities:['page.toc'],store:READING_TOC_SITE_STORE},
    {id:'web-markdown-clipper',url:'https://docs.example/item',origin:'https://docs.example',capabilities:['page.clip'],store:CLIP_SITE_STORE},
    {id:'knowledge-inbox',url:'https://chatgpt.com/c/test',origin:'https://chatgpt.com',capabilities:['knowledge.store','page.capture'],store:CAPTURE_SITE_STORE}
  ];
  const packages=scenarios.map(row=>({...sample,id:row.id,capabilities:row.capabilities}));
  const target={snapshot:{status:'available',url:scenarios[0].url},
    capture(){return {url:this.snapshot.url,origin:new URL(this.snapshot.url).origin,tabId:5,documentId:'doc'};},
    async revalidate(){return true;}};
  const f=await hostFixture(t,{store:new Map([[SIDEBAR_TOOL_STORE,packages],
    ...scenarios.map(row=>[row.store,row.id==='reading-toc'?changeTocSiteAllowed({},row.id,row.url,false):
      changeInstalledSiteAccess({},row.id,row.url,false)])]),target,startTool:false});
  let prompts=0;globalThis.confirm=()=>{prompts++;return false;};
  for(const row of scenarios){
    target.snapshot={status:'available',url:row.url};
    f.host.openTool(row.id);
    f.emit(f.elements['sidebar-tool-settings-open'],'click');
    f.emit(f.elements['sidebar-tool-settings-allow'],'click');
    const allowed=()=>row.id==='reading-toc'?tocSiteAllowed(f.store.get(row.store),row.id,row.url):
      installedSiteAllowed(f.store.get(row.store),row.id,row.url);
    await settle(()=>allowed());
    assert.equal(prompts,0,row.id+' does not invoke confirm');
    f.emit(f.elements['sidebar-tool-settings-deny'],'click');
    await settle(()=>!allowed());
    assert.equal(prompts,0,row.id+' revokes without confirm');
    f.host.closeTool();
  }
});
test('R5.1 inline removal has cancellation, identity pinning, and no accidental double-delete',async t=>{
  const key=sidebarToolStorageKey(sample.id),privateData={note:'retain'};
  const f=await hostFixture(t,{startTool:false,store:new Map([[SIDEBAR_TOOL_STORE,[sample]],[key,privateData]])});
  f.host.openTool(sample.id);
  f.emit(f.elements['sidebar-tool-remove'],'click');await pause();
  assert.equal(f.elements['sidebar-tool-inline-remove'].hidden,false);
  f.emit(f.elements['sidebar-tool-inline-remove-cancel'],'click');
  assert.equal(f.elements['sidebar-tool-inline-remove'].hidden,true);
  assert.deepEqual(f.store.get(key),privateData);
  f.emit(f.elements['sidebar-tool-remove'],'click');
  f.emit(f.elements['sidebar-tool-remove'],'click');
  await pause();assert.deepEqual(f.store.get(key),privateData);
  const updated={...sample,version:'1.1.0'};
  f.store.set(SIDEBAR_TOOL_STORE,[updated]);f.change([updated]);
  assert.equal(f.elements['sidebar-tool-inline-remove'].hidden,true);
  f.emit(f.elements['sidebar-tool-inline-remove-confirm'],'click');await pause();
  assert.deepEqual(f.store.get(SIDEBAR_TOOL_STORE),[updated]);
});
test('R5.1 host does not use JavaScript confirm or browser unload dialogs',async()=>{
  const source=await readFile('src/ui/sidebar-tools.js','utf8');
  assert.doesNotMatch(source,/globalThis\.confirm\s*\(|window\.confirm\s*\(/);
  assert.doesNotMatch(source,/listen\((?:window|globalThis\.window),['"]beforeunload/);
  assert.match(source,/sidebar-tool-inline-remove-confirm/);
});

test('R50 inline dirty navigation has no native modal and requires explicit continuation',async t=>{
  const f=await hostFixture(t),frame=f.frame,loaded=f.loaded;
  globalThis.confirm=()=>{throw Error('native confirm must never run');};
  f.win.emit('message',{origin:'null',source:frame.contentWindow,data:{
    protocol:loaded.protocol,toolId:sample.id,instance:loaded.instance,kind:'edit-state',dirty:true,busy:false}});
  assert.equal(f.host.closeTool(),false);
  assert.equal(f.elements['sidebar-tool-action-review'].hidden,false);
  f.emit(f.elements['sidebar-tool-action-cancel'],'click');
  assert.equal(f.elements['sidebar-tool-frame'].children[0],frame);
  assert.equal(f.host.closeTool(),false);
  f.emit(f.elements['sidebar-tool-action-continue'],'click');
  await pause();
  assert.equal(f.elements['sidebar-tool-frame'].children.length,0);
});

test('native menu launch gate prevents sandbox code until trusted ticket binding ACK',async t=>{
  const f=await hostFixture(t,{startTool:false}),binding=deferred();
  const token=f.host.openTool(sample.id,{launchGate:binding.promise});
  assert.equal(typeof token,'string');
  const frame=f.elements['sidebar-tool-frame'].children[0];
  const load=frame.onload();
  await pause();await pause();
  assert.equal(frame.contentWindow.sent.length,0,'no sandbox source may execute before host binding receipt');
  binding.resolve();
  await load;
  assert.equal(frame.contentWindow.sent.length,1);
  assert.equal(frame.contentWindow.sent[0].kind,'load');
  assert.equal(frame.contentWindow.sent[0].instance,token);
});
test('denied native menu ticket binding discards iframe without running untrusted JS',async t=>{
  const f=await hostFixture(t,{startTool:false}),binding=deferred();
  f.host.openTool(sample.id,{launchGate:binding.promise});
  const frame=f.elements['sidebar-tool-frame'].children[0],load=frame.onload();
  binding.reject(Object.assign(new Error('E_LAUNCH_EXPIRED'),{code:'E_LAUNCH_EXPIRED'}));
  await load;
  assert.equal(frame.contentWindow.sent.length,0,'binding rejection must never post the tool package');
  assert.equal(f.elements['sidebar-tool-frame'].children.length,0);
  assert.match(f.elements['sidebar-tool-status'].textContent,/右键启动未确认/);
});

test('a stopped v2 tool cannot request Chrome contextMenus even if click is spoofed',async t=>{
  const row=JSON.parse(await readFile(new URL('../../examples/sidebar-tools/browser-sdk-r13/selection-notes.opendesk-tool.json',import.meta.url),'utf8'));
  const store=new Map([[SIDEBAR_TOOL_STORE,[row]],
    ['opendesk.sidebar-tools.enabled.v1',{[row.id]:false}]]);
  const target={snapshot:{status:'available',url:'https://example.com/post',title:'Example'}};
  const f=await hostFixture(t,{store,tool:row,startTool:false,target});
  f.host.openTool(row.id);
  const button=f.elements['sidebar-tool-context-menu'];
  assert.equal(button.hidden,false,'v2 contribution remains discoverable in the detail page');
  assert.equal(button.disabled,true,'disabled tools may not ask Chrome for optional permission');
  f.view.actions[button.key].click({isTrusted:true});
  await pause();await pause();
  assert.match(f.elements['sidebar-tool-status'].textContent,/E_TOOL_DISABLED/,
    'the trusted click handler independently denies disabled tools');
});
test('installed menu UI uses Host default status and stop/restore reuses existing Chrome permission',async t=>{
  const tool=await officialToolFixture('web-markdown-clipper');
  const oldLocation=globalThis.location;
  globalThis.location={href:'chrome-extension://test/sidepanel.html?hostInstanceId=12345678-1234-4234-8234-123456789abc'};
  t.after(()=>{globalThis.location=oldLocation;});
  const target={snapshot:{status:'available',url:'https://example.com/article'},
    capture:()=>({url:'https://example.com/article',tabId:7,documentId:'document-a'}),
    async revalidate(){return true;}};
  const f=await hostFixture(t,{store:new Map([[SIDEBAR_TOOL_STORE,[tool]]]),tool,target,startTool:false});
  let enabled=true,permissionRequests=0;
  const toggles=[];
  f.api.permissions={request(){permissionRequests++;return Promise.resolve(true);}};
  f.api.runtime.sendMessage=async message=>{
    if(message.operation==='browser.contextMenu.getStatus')return {ok:true,data:{siteEnabled:enabled,browserPermission:true}};
    if(message.operation==='browser.contextMenu.userToggle'){
      toggles.push(message);enabled=message.enabled;
      return {ok:true,data:{enabled}};
    }
    return {ok:true};
  };
  f.host.openTool(tool.id);
  const button=f.elements['sidebar-tool-context-menu'];
  await settle(()=>button.attributes['data-enabled']==='true'&&!button.disabled);
  assert.match(button.title,/停用/);
  assert.equal(f.store.has(BROWSER_MENU_GRANTS_STORE),false,'the UI recognizes the default without another grant');
  f.view.actions[button.key].click({isTrusted:true});
  await settle(()=>toggles.length===1&&button.attributes['data-enabled']==='false'&&!button.disabled);
  assert.equal(toggles[0].enabled,false,'first click stops the already available menu');
  assert.equal(toggles[0].toolVersion,tool.version);
  assert.equal(toggles[0].installEpoch,null);
  f.view.actions[button.key].click({isTrusted:true});
  await settle(()=>toggles.length===2&&button.attributes['data-enabled']==='true'&&!button.disabled);
  assert.equal(toggles[1].enabled,true);
  assert.equal(permissionRequests,0,'already permitted Chrome menus require no repeated request');
});


test('Prompt Shortcuts reads real native menu status, not a missing legacy grant',async t=>{
  const tool=await officialToolFixture('prompt-shortcuts');
  const oldLocation=globalThis.location;
  globalThis.location={href:'chrome-extension://test/sidepanel.html?hostInstanceId=12345678-1234-4234-8234-123456789abc'};
  t.after(()=>{globalThis.location=oldLocation;});
  const target={snapshot:{status:'available',url:'https://chatgpt.com/c/ready'},
    capture:()=>({url:'https://chatgpt.com/c/ready',tabId:7,documentId:'doc-prompt'}),
    async revalidate(){return true;}};
  const f=await hostFixture(t,{store:new Map([[SIDEBAR_TOOL_STORE,[tool]]]),tool,target,startTool:false});
  const gate=deferred();
  t.after(()=>gate.resolve());
  let enabled=true,permissionRequests=0,statusReads=0;
  const toggles=[];
  f.api.permissions={request(){permissionRequests++;return Promise.resolve(true);}};
  f.api.runtime.sendMessage=async message=>{
    if(message.operation==='browser.contextMenu.getStatus'){
      if(++statusReads===1)await gate.promise;
      return {ok:true,data:{siteEnabled:enabled,browserPermission:true}};
    }
    if(message.operation==='browser.contextMenu.userToggle'){
      toggles.push(message);enabled=message.enabled;
      return {ok:true,data:{enabled}};
    }
    return {ok:true};
  };
  f.host.openTool(tool.id);
  f.emit(f.elements['sidebar-tool-settings-open'],'click',{isTrusted:true});
  const button=f.elements['sidebar-tool-prompt-native-action'];
  assert.equal(button.disabled,true,'unknown native state must not invite an ineffective first click');
  f.view.actions[button.key].click({isTrusted:true});
  await pause();
  assert.equal(toggles.length,0,'loading cannot toggle an unknown permission state');
  gate.resolve();
  // The React presentation view exposes attributes as a plain object, not a DOM Map.
  await settle(()=>!button.disabled&&button.attributes['aria-checked']==='true');
  assert.equal(button.attributes['role'],'switch');
  assert.equal(button.attributes['aria-label'],'选中文字快速添加');
  assert.equal(f.store.has(BROWSER_MENU_GRANTS_STORE),false,
    'a reviewed default is active without a second OpenDesk grant record');
  assert.equal(permissionRequests,0,'reading an existing Chrome permission never requests it again');
  f.view.actions[button.key].click({isTrusted:true});
  await settle(()=>toggles.length===1&&!button.disabled&&button.attributes['aria-checked']==='false');
  assert.equal(toggles[0].enabled,false,'the first real click closes the already active menu');
  assert.equal(button.attributes['aria-checked'],'false');
  assert.equal(permissionRequests,0,'stopping a menu requires no Chrome permission prompt');
});

test('native menu cannot defer an unbound launch behind the current tool dirty review',async t=>{
  const f=await hostFixture(t),frame=f.frame,loaded=f.loaded;
  f.win.emit('message',{origin:'null',source:frame.contentWindow,data:{
    protocol:loaded.protocol,toolId:sample.id,instance:loaded.instance,kind:'edit-state',dirty:true,busy:false}});
  assert.equal(f.host.openTool(sample.id,{launchGate:Promise.resolve()}),undefined);
  assert.equal(f.elements['sidebar-tool-frame'].children[0],frame,'dirty editor remains intact');
  assert.match(f.elements['sidebar-tool-status'].textContent,/重新从右键菜单启动/);
  assert.equal(f.elements['sidebar-tool-action-review'].hidden,true,'no deferred mount without ticket binding');
});

test('R4.7 row overflow shares the real guarded sidebar lifecycle and rejects spoofed clicks',async t=>{
  const store=new Map([[SIDEBAR_TOOL_STORE,[sample]]]);
  const f=await hostFixture(t,{store,startTool:false});
  assert.equal(typeof f.host.toggleEnabled,'function');
  assert.equal(await f.host.toggleEnabled(sample.id,{isTrusted:false}),false);
  assert.equal(store.get(SIDEBAR_TOOL_ENABLE_STORE),undefined,'untrusted event must not write');
  assert.equal(await f.host.toggleEnabled(sample.id,{isTrusted:true}),true);
  assert.equal(store.get(SIDEBAR_TOOL_ENABLE_STORE)[sample.id],false);
  assert.equal(f.elements['sidebar-tool-frame'].children.length,0,'disabling never creates sandbox');
  assert.equal(await f.host.toggleEnabled(sample.id,{isTrusted:true}),true);
  assert.equal(store.get(SIDEBAR_TOOL_ENABLE_STORE)[sample.id],true);
  assert.equal(f.elements['sidebar-tool-frame'].children.length,0,'enabling never auto-launches');
});

test('R56 dirty tool enable/disable uses a cancellable inline review and cannot lose data',async t=>{
  const key=sidebarToolStorageKey(sample.id),privateData={notes:'keep after stop'},
    store=new Map([[SIDEBAR_TOOL_STORE,[sample]],[key,privateData]]);
  const f=await hostFixture(t,{store}),frame=f.frame;
  let dialogs=0;
  globalThis.confirm=()=>{dialogs++;throw Error('native confirm must not be invoked');};
  const editorState=(dirty,busy)=>f.win.emit('message',{origin:'null',source:frame.contentWindow,
    data:{protocol:f.loaded.protocol,toolId:sample.id,instance:f.loaded.instance,
      kind:'edit-state',dirty,busy}});
  editorState(true,false);
  f.emit(f.elements['sidebar-tool-settings-open'],'click');
  f.emit(f.elements['sidebar-tool-enable'],'click',{isTrusted:true});
  await settle(()=>f.elements['sidebar-tool-action-review'].hidden===false);
  assert.equal(f.elements['sidebar-tool-action-review'].hidden,false,'dirty stop must open inline review');
  assert.notEqual(store.get(SIDEBAR_TOOL_ENABLE_STORE)?.[sample.id],false,'opening review does not stop');
  f.emit(f.elements['sidebar-tool-action-cancel'],'click');
  assert.equal(f.elements['sidebar-tool-frame'].children[0],frame,'Cancel must preserve live unsaved editor');
  assert.notEqual(store.get(SIDEBAR_TOOL_ENABLE_STORE)?.[sample.id],false);

  f.emit(f.elements['sidebar-tool-enable'],'click',{isTrusted:true});
  await settle(()=>f.elements['sidebar-tool-action-review'].hidden===false);
  editorState(true,true);
  f.emit(f.elements['sidebar-tool-action-continue'],'click');
  await pause();await pause();
  assert.notEqual(store.get(SIDEBAR_TOOL_ENABLE_STORE)?.[sample.id],false,
    'a save starting during review prevents a stale stop');
  assert.equal(f.elements['sidebar-tool-frame'].children[0],frame);

  editorState(true,false);
  f.emit(f.elements['sidebar-tool-enable'],'click',{isTrusted:true});
  await settle(()=>f.elements['sidebar-tool-action-review'].hidden===false);
  f.emit(f.elements['sidebar-tool-action-continue'],'click');
  await settle(()=>store.get(SIDEBAR_TOOL_ENABLE_STORE)?.[sample.id]===false);
  assert.equal(f.elements['sidebar-tool-frame'].children.length,0,'confirmed stop retires the sandbox');
  assert.deepEqual(store.get(key),privateData,'stop never deletes tool data');
  assert.equal(dialogs,0,'all choices remain non-modal');

  f.emit(f.elements['sidebar-tool-enable'],'click',{isTrusted:true});
  await settle(()=>store.get(SIDEBAR_TOOL_ENABLE_STORE)?.[sample.id]===true);
  assert.equal(f.elements['sidebar-tool-frame'].children.length,0,'re-enable never auto-launches code');
  assert.deepEqual(store.get(key),privateData);
});

test('native Time Review forwards day, classification, settings and CSV payloads without read feedback',async t=>{
  const tool=await officialToolFixture('time-review');
  const release=(await officialFixtures()).catalog.apps.find(row=>row.toolId==='time-review');
  const old=globalThis.__opendeskTrustedTimeReviewUI;let request,signals=0;
  globalThis.__opendeskTrustedTimeReviewUI={version:tool.version,mount(options){request=options.request;return ()=>{};}};
  t.after(()=>{if(old===undefined)delete globalThis.__opendeskTrustedTimeReviewUI;else globalThis.__opendeskTrustedTimeReviewUI=old;});
  const f=await hostFixture(t,{tool,startTool:false,store:new Map([[SIDEBAR_TOOL_STORE,[tool]],
    [MARKET_PROVENANCE_STORE,{'time-review':{marketId:release.id,version:tool.version,sha256:release.sha256}}]])});
  f.elements['sidebar-tool-frame'].querySelector=()=>({dispatchEvent(){signals++;}});
  const calls=[];f.api.runtime.sendMessage=async message=>{calls.push(message);return {ok:true,data:{accepted:true}};};
  f.host.openTool(tool.id);await settle(()=>typeof request==='function');
  for(const [operation,payload] of [
    ['time.day',{date:'2026-10-14'}],['time.export',{format:'csv'}],
    ['time.settings',{idleSeconds:60,retentionDays:90,excludedHosts:[]}],
    ['time.classify',{host:'example.com',category:2}]
  ]){await request(operation,payload);assert.deepEqual(calls.at(-1).payload,payload,operation);}
  assert.equal(signals,2,'only mutations notify the native UI; reads/export cannot trigger a refresh loop');
  await request('time.status');assert.equal(signals,2);
  await assert.rejects(request('time.start',{}, {isTrusted:false}),{code:'E_TIME_TRUSTED_CLICK'});
  const before=calls.length;
  await assert.rejects(request('time.siteGrant',{mode:'all',allow:true},{isTrusted:true}),{code:'E_TIME_TRUSTED_CLICK'});
  assert.equal(calls.length,before,'native markup cannot replace the separate consent controls');
});
test('sandbox Browser RPC honors Registry argument-byte budget and settles oversized requests',async t=>{
  // Fictional data only. The old Side Panel checked JSON.stringify(entire
  // postMessage).length > 12000 and silently dropped this valid 11,900-byte
  // Cookie batch, leaving the iframe waiting for a timeout.
  const tool=await officialToolFixture('cookie-editor');
  const oldLocation=globalThis.location;
  globalThis.location={href:'chrome-extension://test/sidepanel.html?hostInstanceId=01234567-89ab-4def-8123-456789abcdef'};
  t.after(()=>{globalThis.location=oldLocation;});
  const f=await hostFixture(t,{tool,store:new Map([[SIDEBAR_TOOL_STORE,[tool]]])});
  const near={url:'https://example.org/',cookies:Array.from({length:12},(_,index)=>({
    name:'test'+index,value:'x'.repeat(960)
  }))};
  const envelope={protocol:f.loaded.protocol,kind:'request',
    instance:f.loaded.instance,toolId:tool.id,requestId:'near-limit',
    operation:'browser.cookies.setMany',payload:near};
  assert.equal(new TextEncoder().encode(JSON.stringify(near)).byteLength,11900);
  assert.ok(JSON.stringify(envelope).length>12000);
  assert.deepEqual(checkSidebarToolRequestBudget(envelope),{ok:true});
  f.ask('browser.cookies.setMany',near,'near-limit');
  await settle(()=>f.frame.contentWindow.sent.some(row=>row.requestId==='near-limit'));
  const reached=f.frame.contentWindow.sent.find(row=>row.requestId==='near-limit');
  assert.equal(reached.ok,false);
  assert.equal(reached.error.code,'E_SITE_GRANT_REQUIRED',
    'the admitted request reaches normal site-authorization refusal; no Cookie is written');

  const oversized={...near,cookies:near.cookies.map(row=>({...row,value:row.value+'x'.repeat(30)}))};
  assert.deepEqual(checkSidebarToolRequestBudget({...envelope,payload:oversized}),{ok:false,code:'E_LIMIT'});
  f.ask('browser.cookies.setMany',oversized,'too-large');
  await settle(()=>f.frame.contentWindow.sent.some(row=>row.requestId==='too-large'));
  const denied=f.frame.contentWindow.sent.find(row=>row.requestId==='too-large');
  assert.equal(denied.ok,false);
  assert.equal(denied.error.code,'E_LIMIT','oversized input must receive an explicit response, not time out');
  assert.equal(denied.result,undefined);
  assert.deepEqual(checkSidebarToolRequestBudget({...envelope,untrusted:'z'.repeat(800)}),{ok:false,code:'E_LIMIT'},
    'extra untrusted envelope fields do not expand the RPC budget');
  const unicode={...near,cookies:near.cookies.map((row,i)=>i===0?{...row,value:'中文'.repeat(960)}:row)};
  assert.deepEqual(checkSidebarToolRequestBudget({...envelope,payload:unicode}),{ok:false,code:'E_LIMIT'},
    'UTF-8 byte budget must reject large multibyte payloads');
});

test('R5.30.3 official export reuses one real click and still requires exact Host approval',async t=>{
  const tool=await officialToolFixture('cookie-editor');
  const release=(await officialFixtures()).catalog.apps.find(row=>row.toolId===tool.id);
  const origin='https://example.org';
  const target={snapshot:{status:'available',url:origin+'/'}};
  let pauseAdmission=false;const entered=deferred(),resume=deferred();
  // Current installation consent must be complete before its iframe is shown.
  // This test exports fixture text and never reads sensitive Cookie values.
  const f=await hostFixture(t,{tool,target,getHook:async key=>{
    if(pauseAdmission&&Array.isArray(key)&&key.includes(MARKET_PROVENANCE_STORE)){
      pauseAdmission=false;entered.resolve();await resume.promise;
    }
  },store:new Map([
    [SIDEBAR_TOOL_STORE,[tool]],
    [BROWSER_MENU_GRANTS_STORE,{[tool.id]:{version:tool.version,installEpoch:null,
      packageHash:await sidebarToolPackageHash(tool),cookieAllSites:{storeId:'0',read:true,write:true,
        observe:true,clear:true,values:true,valueConsent:true,grantEpoch:'grant-1'}}}],
    [MARKET_PROVENANCE_STORE,{[tool.id]:{marketId:release.id,version:release.version,sha256:release.sha256}}]
  ])});
  await settle(()=>!f.elements['sidebar-tool-frame'].hidden);
  const old=Object.getOwnPropertyDescriptor(globalThis,'navigator'),oldLocation=globalThis.location;
  const copied=[],downloads=[],calls=[];let active=false,authorized=true,revokeBeforeDelivery=false;
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{
    userActivation:{get isActive(){return active;}},clipboard:{writeText:async text=>copied.push(text)}}});
  globalThis.location={href:'chrome-extension://test/sidepanel.html?hostInstanceId=01234567-89ab-4def-8123-456789abcdef'};
  t.after(()=>{if(old)Object.defineProperty(globalThis,'navigator',old);else delete globalThis.navigator;globalThis.location=oldLocation;});
  f.api.downloads={download:async args=>{downloads.push(args);return 91;}};
  f.api.runtime.sendMessage=async message=>{
    calls.push(message);
    if(message.kind==='tool'&&revokeBeforeDelivery){
      const grants=f.store.get(BROWSER_MENU_GRANTS_STORE);
      grants[tool.id].cookieAllSites={read:false,grantEpoch:'revoked'};
    }
    return message.operation==='browser.intent.confirm'?{ok:true,data:{approvalRef:'exact-intent'}}:
      {ok:true,data:{authorized}};
  };
  const ask=async(operation,payload,id)=>{
    f.ask(operation,payload,id);
    await settle(()=>f.frame.contentWindow.sent.some(row=>row.requestId===id));
    return f.frame.contentWindow.sent.find(row=>row.requestId===id);
  };
  assert.equal((await ask('cookieEditor.export.begin',{url:origin+'/',method:'copy'},'no-gesture')).error.code,'E_USER_GESTURE_REQUIRED');
  active=true;pauseAdmission=true;
  const oldClick=ask('cookieEditor.export.begin',{url:origin+'/',method:'copy'},'begin-regranted');
  await entered.promise;
  const changed=structuredClone(f.store.get(BROWSER_MENU_GRANTS_STORE));
  changed[tool.id].cookieAllSites.grantEpoch='grant-after-regrant';
  f.store.set(BROWSER_MENU_GRANTS_STORE,changed);
  f.changeStorage({[BROWSER_MENU_GRANTS_STORE]:{newValue:changed}});
  resume.resolve();
  assert.equal((await oldClick).error.code,'E_DOCUMENT_CHANGED','old click cannot acquire a newly granted epoch');
  for(const method of ['copy','download']){
    active=true;
    assert.equal((await ask('cookieEditor.export.begin',{url:origin+'/',method},'begin-'+method)).result.authorized,true);
    active=false;
    const operation=method==='copy'?'browser.clipboard.writeText':'browser.downloads.text';
    const payload=method==='copy'?{text:'fixture'}:{text:'fixture',filename:'cookies.json'};
    assert.equal((await ask(operation,payload,method)).ok,true);
    assert.equal(f.elements['sidebar-tool-action-review'].hidden,true,'no additional confirmation');
    assert.deepEqual(calls.at(-2).targetArgs,payload,'Host approves exact delivery bytes');
    assert.equal(calls.at(-1).approvalRef,'exact-intent');
  }
  assert.equal(copied.length,1);assert.equal(downloads.length,1);
  active=true;await ask('cookieEditor.export.begin',{url:origin+'/',method:'copy'},'begin-denied');
  authorized=false;active=false;
  assert.equal((await ask('browser.clipboard.writeText',{text:'blocked'},'host-denied')).error.code,'E_OWNER');
  assert.equal(copied.length,1,'unconfirmed Host result must not copy');
  active=true;await ask('cookieEditor.export.begin',{url:origin+'/',method:'copy'},'begin-revoked');
  authorized=true;revokeBeforeDelivery=true;active=false;
  assert.equal((await ask('browser.clipboard.writeText',{text:'revoked'},'revoked-before-sink')).error.code,'E_TOOL_CHANGED');
  assert.equal(copied.length,1,'fresh storage check stops revocation even before its UI event');
  f.store.get(BROWSER_MENU_GRANTS_STORE)[tool.id].cookieAllSites={read:true,grantEpoch:'grant-2'};
  revokeBeforeDelivery=false;
  f.store.delete(MARKET_PROVENANCE_STORE);active=true;
  assert.equal((await ask('cookieEditor.export.begin',{url:origin+'/',method:'copy'},'changed-provenance')).ok,false);
});

test('R10 canonical exports need real Side Panel click plus one-use Host authorization',async t=>{
  const tool={...sample,capabilities:[...sample.capabilities,'user.export']};
  const f=await hostFixture(t,{tool,store:new Map([[SIDEBAR_TOOL_STORE,[tool]]])});
  const old=Object.getOwnPropertyDescriptor(globalThis,'navigator'),oldLocation=globalThis.location;
  const copied=[],downloads=[],hostCalls=[];
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{clipboard:{writeText:async text=>copied.push(text)}}});
  globalThis.location={href:'chrome-extension://test/sidepanel.html?hostInstanceId=01234567-89ab-4def-8123-456789abcdef'};
  t.after(()=>{if(old)Object.defineProperty(globalThis,'navigator',old);else delete globalThis.navigator;
    globalThis.location=oldLocation;});
  f.api.downloads={download:async args=>{downloads.push(args);return 91;}};
  f.api.runtime.sendMessage=async message=>{
    hostCalls.push(message);
    if(message.operation==='browser.intent.confirm')
      return {ok:true,data:{approvalRef:'single-use-host-approval'}};
    if(message.kind==='tool'&&message.approvalRef==='single-use-host-approval')
      return {ok:true,data:{authorized:true}};
    throw new Error('Unexpected Host request');
  };
  const ask=async(operation,payload,id,click=true)=>{
    f.ask(operation,payload,id);
    await settle(()=>!f.elements['sidebar-tool-action-review'].hidden||
      f.frame.contentWindow.sent.some(row=>row.requestId===id));
    if(!f.elements['sidebar-tool-action-review'].hidden){
      assert.equal(copied.length+downloads.length,0+effects,'sandbox request must not have an effect before click');
      f.emit(f.elements['sidebar-tool-action-continue'],'click',{isTrusted:click});
    }
    await settle(()=>f.frame.contentWindow.sent.some(row=>row.requestId===id));
    return f.frame.contentWindow.sent.find(row=>row.requestId===id);
  };
  let effects=0;
  const text='x'.repeat(20000);
  assert.equal((await ask('browser.clipboard.writeText',{text},'browser-copy')).result.copied,true);
  effects++;assert.deepEqual(copied,[text]);
  assert.deepEqual((await ask('browser.downloads.text',{text:'notes',filename:'notes.md'},'browser-download')).result,{started:true});
  effects++;assert.equal(downloads.length,1);
  assert.deepEqual((await ask('browser.downloads.text',{text:'{}',filename:'notes.json'},'json-download')).result,{started:true});
  effects++;assert.equal(downloads.length,2);
  assert.equal(downloads.at(-1).url.startsWith('data:application/json;'),true);
  const invalid=await ask('browser.downloads.text',{text:'notes',filename:'../escape.txt'},'invalid-download');
  assert.equal(invalid.ok,false);assert.equal(downloads.length,2);
  const approvalsBefore=hostCalls.filter(row=>row.operation==='browser.intent.confirm').length;
  const untrusted=await ask('browser.clipboard.writeText',{text:'blocked'},'untrusted-click',false);
  assert.equal(untrusted.ok,false);assert.equal(untrusted.error.code,'E_CANCELLED');
  assert.equal(copied.length,1);assert.equal(f.elements['sidebar-tool-action-review'].hidden,true);
  assert.equal(hostCalls.filter(row=>row.operation==='browser.intent.confirm').length,approvalsBefore,
    'an untrusted click cannot mint a Host approval');
  assert.equal((await ask('browser.clipboard.writeText',{text:'recovered'},'after-untrusted')).result.copied,true);
  effects++;assert.deepEqual(copied,[text,'recovered'],'rejection settles the action and permits a new trusted request');
  // Retired operations use the ordinary 12,000-character message bound. Keep
  // these probes bounded so they reach dispatch and test the explicit rejection.
  const oldCopy=await ask('clipboard.writeText',{text:'retired'},'retired-copy');
  const oldDownload=await ask('file.download',{text:'retired',filename:'notes.md'},'retired-download');
  assert.equal(oldCopy.ok,false);assert.equal(oldDownload.ok,false);
  assert.equal(copied.length,2);assert.equal(downloads.length,2);
  assert.equal(hostCalls.filter(row=>row.operation==='browser.intent.confirm').length,4);
  const missing={...tool,capabilities:sample.capabilities};
  f.store.set(SIDEBAR_TOOL_STORE,[missing]);
  const stale=await ask('browser.clipboard.writeText',{text:'stale'},'stale-copy');
  assert.equal(stale.ok,false);assert.equal(copied.length,2);
});
const bookmarkExpected={id:'saved-bookmark',parentId:'1',index:0,title:'Saved',
  url:'https://example.com/saved',unmodifiable:null,folderType:null};
const bookmarkSaveRequests=[
  ['create',{title:'Saved',url:bookmarkExpected.url,parentId:'1',
    sourcePage:{url:bookmarkExpected.url,tabRef:'bookmark-source-tab',documentRef:'bookmark-source-document'}}],
  ['update',{id:bookmarkExpected.id,changes:{title:'Renamed'},expected:bookmarkExpected}],
  ['move',{id:bookmarkExpected.id,destination:{parentId:'2',index:1},expected:bookmarkExpected}]
];
async function bookmarkConsentFixture(t,{trusted=true,hostError=null}={}){
  const tool=await officialToolFixture('bookmark-manager');
  const release=(await officialFixtures()).catalog.apps.find(row=>row.toolId===tool.id);
  const epoch='bookmark-install-generation',hostInstanceId='01234567-89ab-4def-8123-456789abcdef';
  const store=new Map([
    [SIDEBAR_TOOL_STORE,[tool]],[SIDEBAR_TOOL_ENABLE_STORE,{[tool.id]:true}],
    [TOOL_REVOCATION_EPOCHS_STORE,{[tool.id]:epoch}],
    [MARKET_PROVENANCE_STORE,{[tool.id]:{marketId:release.id,version:release.version,sha256:release.sha256}}]
  ]);
  const oldLocation=globalThis.location;
  globalThis.location={href:'chrome-extension://test/sidepanel.html?hostInstanceId='+hostInstanceId};
  t.after(()=>{globalThis.location=oldLocation;});
  const mounts=[],calls=[],writes=[];
  const f=await hostFixture(t,{tool,store,startTool:!trusted,
    trustedBookmarkPilot:trusted?{enabled:true,componentVersion:TRUSTED_BOOKMARK_COMPONENT_VERSION,
      mount({sdk}){mounts.push(sdk);return ()=>{};}}:null});
  f.api.runtime.sendMessage=async message=>{
    if(message.protocol===ANALYTICS_PROTOCOL){
      assert.deepEqual(message,{protocol:ANALYTICS_PROTOCOL,kind:'event.host_report',
        event:'tool.opened',toolId:tool.id,channel:'sidepanel'});
      return {ok:true,data:{}};
    }
    calls.push(structuredClone(message));
    if(message.kind==='host'&&message.operation==='browser.intent.confirm')
      return {ok:true,data:{approvalRef:'bookmark-approval-'+calls.length}};
    assert.equal(message.kind,'tool');
    if(hostError)return {ok:false,error:{code:hostError,message:'Bookmark permission revoked'}};
    writes.push(structuredClone(message));
    return {ok:true,data:message.operation.startsWith('browser.bookmarks.remove')
      ?{removed:true}:{...bookmarkExpected,id:message.args.id||bookmarkExpected.id}};
  };
  if(trusted){
    f.host.openTool(tool.id);await settle(()=>mounts.length===1);
    assert.equal(f.elements['sidebar-tool-frame'].dataset.bookmarkTrusted,'true');
    assert.equal(f.elements['sidebar-tool-frame'].children.length,0,'the SDK comes from admitted trusted UI');
  }
  return {...f,tool,epoch,hostInstanceId,mounts,calls,writes,
    sdk:mounts[0],packageHash:await sidebarToolPackageHash(tool)};
}
function assertBookmarkIntent(f,index,name,args){
  const [approval,request]=f.calls.slice(index*2,index*2+2);
  const identity={toolId:f.tool.id,toolVersion:f.tool.version,installEpoch:f.epoch,
    packageHash:f.packageHash,toolInstance:request?.toolInstance,hostInstanceId:f.hostInstanceId};
  assert.ok(identity.toolInstance,'each intent binds the mounted tool instance');
  assert.deepEqual(approval,{protocol:BROWSER_HOST_PROTOCOL,kind:'host',
    operation:'browser.intent.confirm',...identity,targetOperation:'browser.bookmarks.'+name,targetArgs:args});
  assert.deepEqual(request,{protocol:BROWSER_HOST_PROTOCOL,kind:'tool',
    operation:'browser.bookmarks.'+name,...identity,args,approvalRef:'bookmark-approval-'+(index*2+1)});
}

test('R3.4 admitted Bookmark Save omits the second button but mints an exact Host intent for every write',async t=>{
  const f=await bookmarkConsentFixture(t);
  const requests=[...bookmarkSaveRequests,bookmarkSaveRequests[0]];
  for(const [index,[name,args]] of requests.entries()){
    const pending=f.sdk.bookmarks[name](args);
    await settle(()=>f.calls.length>index*2||!f.elements['sidebar-tool-action-review'].hidden);
    assert.equal(f.elements['sidebar-tool-action-review'].hidden,true,name+' must not ask to confirm Save again');
    await pending;
    assert.equal(f.calls.length,(index+1)*2,'each write has exactly one confirmation and one dispatch');
    assertBookmarkIntent(f,index,name,args);
  }
  assert.equal(f.writes.length,4);
  assert.equal(new Set(f.writes.map(row=>row.approvalRef)).size,4,'even an identical repeated write needs a fresh ticket');
});

test('R3.4 sandbox Bookmark writes still need a trusted review click even with official package identity',async t=>{
  const f=await bookmarkConsentFixture(t,{trusted:false});
  for(const [index,[name,args]] of bookmarkSaveRequests.entries()){
    for(const trustedClick of [false,true]){
      const id=name+'-'+trustedClick,before=f.calls.length;
      f.ask('browser.bookmarks.'+name,args,id);
      await settle(()=>!f.elements['sidebar-tool-action-review'].hidden||
        f.frame.contentWindow.sent.some(row=>row.requestId===id));
      assert.equal(f.elements['sidebar-tool-action-review'].hidden,false,'sandbox requests require review');
      assert.equal(f.calls.length,before,'no approval or write before the real host click');
      f.emit(f.elements['sidebar-tool-action-continue'],'click',{isTrusted:trustedClick});
      await settle(()=>f.frame.contentWindow.sent.some(row=>row.requestId===id));
      const response=f.frame.contentWindow.sent.find(row=>row.requestId===id);
      assert.equal(response.ok,trustedClick);
      if(trustedClick)assertBookmarkIntent(f,index,name,args);
      else{
        assert.equal(response.error.code,'E_CANCELLED');
        assert.equal(f.calls.length,before,'synthetic review clicks cannot mint tickets');
      }
    }
  }
  assert.equal(f.writes.length,3);
});

test('R3.4 admitted Bookmark deletion still waits for its separate Host review',async t=>{
  const f=await bookmarkConsentFixture(t);
  const requests=[['remove',{id:bookmarkExpected.id,expected:bookmarkExpected}],
    ['removeTree',{id:'saved-folder',ticket:'bookmark-delete-tree-ticket'}]];
  for(const [index,[name,args]] of requests.entries()){
    const pending=f.sdk.bookmarks[name](args);
    await settle(()=>!f.elements['sidebar-tool-action-review'].hidden||f.calls.length>index*2);
    assert.equal(f.elements['sidebar-tool-action-review'].hidden,false,name+' must retain destructive review');
    assert.equal(f.calls.length,index*2,'deletion has no intent or dispatch before review');
    f.emit(f.elements['sidebar-tool-action-continue'],'click',{isTrusted:true});
    assert.deepEqual(await pending,{removed:true});
    assertBookmarkIntent(f,index,name,args);
  }
  assert.equal(f.writes.length,2);
});

test('R3.4 stale Bookmark SDK instances cannot use the current trusted mount to save',async t=>{
  const f=await bookmarkConsentFixture(t),oldSDK=f.sdk;
  f.host.closeTool();f.host.openTool(f.tool.id);
  await settle(()=>f.mounts.length===2);
  const [name,args]=bookmarkSaveRequests[0];
  await assert.rejects(oldSDK.bookmarks[name](args),{code:'E_TOOL_CHANGED'});
  assert.equal(f.calls.length,0,'a closed generation cannot mint an intent after reopening');
  await f.mounts[1].bookmarks[name](args);
  assertBookmarkIntent(f,0,name,args);
  assert.equal(f.writes.length,1);
});

test('R3.4 Bookmark saves recheck install generation, enablement and provenance before requesting approval',async t=>{
  const changes={
    epoch:f=>f.store.set(TOOL_REVOCATION_EPOCHS_STORE,{[f.tool.id]:'new-install-generation'}),
    disabled:f=>f.store.set(SIDEBAR_TOOL_ENABLE_STORE,{[f.tool.id]:false}),
    provenance:f=>f.store.delete(MARKET_PROVENANCE_STORE),
    uninstall:f=>f.store.set(SIDEBAR_TOOL_STORE,[])
  };
  for(const [reason,change] of Object.entries(changes))await t.test(reason,async t=>{
    const f=await bookmarkConsentFixture(t);change(f);
    for(const [name,args] of bookmarkSaveRequests)
      await assert.rejects(f.sdk.bookmarks[name](args),{code:'E_TOOL_CHANGED'});
    assert.equal(f.calls.length,0,'invalid admission cannot mint a ticket or dispatch a write');
    assert.equal(f.elements['sidebar-tool-action-review'].hidden,true);
  });
});

test('R3.4 trusted Bookmark Save propagates Host grant revocation without retrying',async t=>{
  const f=await bookmarkConsentFixture(t,{hostError:'E_GRANT_REVOKED'});
  const [name,args]=bookmarkSaveRequests[0];
  await assert.rejects(f.sdk.bookmarks[name](args),{code:'E_GRANT_REVOKED'});
  assert.equal(f.calls.length,2,'the denied write is dispatched once and never replayed');
  assertBookmarkIntent(f,0,name,args);
  assert.equal(f.writes.length,0);
});

test('R1.3 frontend status and list reflect callable export services and include mounted package identity',async t=>{
  const tool={...sample,capabilities:[...sample.capabilities,'user.export']};
  const f=await hostFixture(t,{tool,store:new Map([[SIDEBAR_TOOL_STORE,[tool]]])});
  const oldNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator'),oldLocation=globalThis.location;
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{}});
  globalThis.location={href:'chrome-extension://test/sidepanel.html?hostInstanceId=01234567-89ab-4def-8123-456789abcdef'};
  t.after(()=>{if(oldNavigator)Object.defineProperty(globalThis,'navigator',oldNavigator);else delete globalThis.navigator;globalThis.location=oldLocation;});
  f.api.downloads={download:async()=>91};
  const calls=[];
  f.api.runtime.sendMessage=async message=>{
    calls.push(message);assert.match(message.packageHash,/^[a-f0-9]{64}$/);
    if(message.operation==='browser.capabilities.list')return {ok:true,data:[
      {operation:'browser.clipboard.writeText',implementation:'IMPLEMENTED',status:{exposure:'allowed',callableNow:false,reasonCode:'E_FRONTEND_CONTEXT_REQUIRED'}},
      {operation:'browser.downloads.text',implementation:'IMPLEMENTED',status:{exposure:'allowed',callableNow:false,reasonCode:'E_FRONTEND_CONTEXT_REQUIRED'}}]};
    return {ok:true,data:{operation:message.args.operation,implementation:'implemented',authorization:{tool:'granted'},
      callableNow:false,reasonCode:'E_FRONTEND_CONTEXT_REQUIRED'}};
  };
  const ask=async(operation,payload,id)=>{
    f.ask(operation,payload,id);await settle(()=>f.frame.contentWindow.sent.some(row=>row.requestId===id));
    const response=f.frame.contentWindow.sent.find(row=>row.requestId===id);assert.equal(response.ok,true);return response.result;
  };
  assert.equal((await ask('browser.capabilities.getStatus',{operation:'browser.clipboard.writeText'},'no-clipboard')).callableNow,false);
  assert.equal((await ask('browser.capabilities.getStatus',{operation:'browser.downloads.text'},'downloads')).callableNow,true);
  globalThis.navigator.clipboard={writeText:async()=>{}};
  assert.equal((await ask('browser.capabilities.getStatus',{operation:'browser.clipboard.writeText'},'clipboard')).callableNow,true);
  assert((await ask('browser.capabilities.list',{},'list')).every(row=>row.status.callableNow));
  assert.equal(new Set(calls.map(row=>row.packageHash)).size,1);
  // The native API function existing in the Side Panel does not prove Chrome
  // permission or installed-tool authority. Never overrule a Host denial.
  f.api.runtime.sendMessage=async message=>({ok:true,data:{
    operation:message.args.operation,implementation:'implemented',
    authorization:{tool:'granted',browser:'missing'},callableNow:false,
    reasonCode:'E_CHROME_PERMISSION_REQUIRED'
  }});
  assert.equal((await ask('browser.capabilities.getStatus',
    {operation:'browser.downloads.text'},'download-permission-denied')).callableNow,false);
});

test('R1.3 final sandbox delivery rejects selection that expires during frontend authority recheck',async t=>{
  const tool=JSON.parse(await readFile(new URL('../../examples/sidebar-tools/browser-sdk-r13/selection-notes.opendesk-tool.json',import.meta.url),'utf8'));
  const originalNow=Date.now,oldLocation=globalThis.location;let now=originalNow(),returned=false;
  Date.now=()=>now;globalThis.location={href:'chrome-extension://test/sidepanel.html?hostInstanceId=01234567-89ab-4def-8123-456789abcdef'};
  t.after(()=>{Date.now=originalNow;globalThis.location=oldLocation;});
  const f=await hostFixture(t,{tool,store:new Map([[SIDEBAR_TOOL_STORE,[tool]]]),getHook:async key=>{
    if(returned&&key===TOOL_REVOCATION_EPOCHS_STORE)now+=11;
  }});
  f.api.runtime.sendMessage=async()=>{returned=true;return {ok:true,data:{selection:'private',expiresAt:now+10}};};
  f.ask('browser.launch.consume',{},'expired-delivery');
  await settle(()=>f.frame.contentWindow.sent.some(row=>row.requestId==='expired-delivery'));
  const response=f.frame.contentWindow.sent.find(row=>row.requestId==='expired-delivery');
  assert.equal(response.ok,false);assert.equal(response.error.code,'E_LAUNCH_EXPIRED');
  assert.equal(response.result,undefined);
});

test('Focus sandbox and trusted settings use the fixed product adapter through the existing host',async t=>{
  const previous=globalThis.__opendeskStayFocusTrustedUI;let runControl;
  globalThis.__opendeskStayFocusTrustedUI={id:FOCUS_ID,capability:FOCUS_CAPABILITY,operations:FOCUS_OPERATIONS,
    request:requestStayFocusOperation,runTrustedOperation:runTrustedStayFocusOperation,
    probe:async()=>({serviceReady:true}),
    createPermissionControls({runOperation}){runControl=runOperation;return {render(){},dispose(){}};}};
  t.after(()=>{if(previous===undefined)delete globalThis.__opendeskStayFocusTrustedUI;
    else globalThis.__opendeskStayFocusTrustedUI=previous;});
  const tool={...sample,id:FOCUS_ID,capabilities:[FOCUS_CAPABILITY]},store=new Map([[SIDEBAR_TOOL_STORE,[tool]]]);
  const f=await hostFixture(t,{tool,store}),calls=[];
  f.api.runtime.sendMessage=async message=>{calls.push(message);return {ok:true,data:{state:'confirmed'}};};
  f.ask('focus.status',{},'focus-status');
  await settle(()=>f.frame.contentWindow.sent.some(row=>row.requestId==='focus-status'));
  assert.equal(f.frame.contentWindow.sent.find(row=>row.requestId==='focus-status').ok,true);
  assert.equal(calls[0].operation,'focus.status');
  f.ask('focus.disable',{},'sandbox-disable');
  await settle(()=>f.frame.contentWindow.sent.some(row=>row.requestId==='sandbox-disable'));
  assert.equal(f.frame.contentWindow.sent.find(row=>row.requestId==='sandbox-disable').error.code,'E_FOCUS_TRUSTED_CLICK');
  assert.equal(calls.length,1);
  await assert.rejects(runControl('focus.disable',{}, {isTrusted:false}),{code:'E_FOCUS_TRUSTED_CLICK'});
  assert.deepEqual(await runControl('focus.disable',{}, {isTrusted:true}),{state:'confirmed'});
  assert.equal(calls.length,2);assert.equal(calls[1].operation,'focus.disable');
  const sent=deferred(),reply=deferred();
  f.api.runtime.sendMessage=async message=>{calls.push(message);sent.resolve();return reply.promise;};
  const pending=runControl('focus.disable',{}, {isTrusted:true});await sent.promise;
  f.host.closeTool();reply.resolve({ok:true,data:{state:'confirmed'}});
  await assert.rejects(pending,{code:'E_OUTCOME_UNKNOWN'});
  assert.equal(calls.length,3,'retiring the host after send must not replay a native effect');
});

test('R3.1 Focus cannot open when the installed browser lacks its trusted runtime',async t=>{
  const previous=globalThis.__opendeskStayFocusTrustedUI;delete globalThis.__opendeskStayFocusTrustedUI;
  t.after(()=>{if(previous!==undefined)globalThis.__opendeskStayFocusTrustedUI=previous;});
  const tool={...sample,id:FOCUS_ID,capabilities:[FOCUS_CAPABILITY]},store=new Map([[SIDEBAR_TOOL_STORE,[tool]]]);
  const f=await hostFixture(t,{tool,store});
  assert.equal(f.frame,undefined,'unsupported Focus cannot launch even a sandbox');
  assert.equal(f.elements['sidebar-tool-frame'].children.length,0);
  assert.match(f.elements['sidebar-tool-status'].textContent,/缺少 Stay Focus.*请升级扩展/);
  assert.deepEqual(store.get(SIDEBAR_TOOL_STORE),[tool],'failed runtime gate preserves user install bytes');
});

test('R3.1 Focus first-use native controls share a screen with its live sandbox',async t=>{
  const previous=globalThis.__opendeskStayFocusTrustedUI;
  globalThis.__opendeskStayFocusTrustedUI={id:FOCUS_ID,capability:FOCUS_CAPABILITY,
    operations:FOCUS_OPERATIONS,request:requestStayFocusOperation,
    runTrustedOperation:runTrustedStayFocusOperation,
    probe:async()=>({serviceReady:true}),
    createPermissionControls(){return {render(){},dispose(){}};}};
  t.after(()=>{if(previous===undefined)delete globalThis.__opendeskStayFocusTrustedUI;
    else globalThis.__opendeskStayFocusTrustedUI=previous;});
  const tool={...sample,id:FOCUS_ID,capabilities:[FOCUS_CAPABILITY]},store=new Map([[SIDEBAR_TOOL_STORE,[tool]]]);
  const f=await hostFixture(t,{tool,store});
  assert.equal(f.elements['sidebar-tool-settings-view'].hidden,false);
  assert.equal(f.elements['sidebar-tool-frame'].hidden,false,'opening native setup must not hide Focus statistics');
  assert.equal(f.elements['sidebar-tool-display'].attributes['data-trusted-tool-inline'],'true');
  assert.equal(f.elements['sidebar-tool-frame'].children.length,1);
});

test('Focus settings capture their instance epoch and reject epoch-only rotation before/after send',async t=>{
  for(const phase of ['before-send','after-send'])await t.test(phase,async t=>{
    const previous=globalThis.__opendeskStayFocusTrustedUI;
    let runControl,captured;
    const entered=deferred(),release=deferred();
    globalThis.__opendeskStayFocusTrustedUI={id:FOCUS_ID,capability:FOCUS_CAPABILITY,operations:FOCUS_OPERATIONS,
      request:requestStayFocusOperation,probe:async()=>({serviceReady:true}),
      async runTrustedOperation(options){
        captured=options;options.assertCurrent('initial');entered.resolve();
        await release.promise;options.assertCurrent(phase);return {state:'confirmed'};
      },
      createPermissionControls({runOperation}){runControl=runOperation;return {render(){},dispose(){}};}};
    t.after(()=>{release.resolve();if(previous===undefined)delete globalThis.__opendeskStayFocusTrustedUI;
      else globalThis.__opendeskStayFocusTrustedUI=previous;});
    const tool={...sample,id:FOCUS_ID,capabilities:[FOCUS_CAPABILITY]};
    const store=new Map([[SIDEBAR_TOOL_STORE,[tool]],[TOOL_REVOCATION_EPOCHS_STORE,{[tool.id]:'epoch-a'}]]);
    const f=await hostFixture(t,{tool,store});
    const pending=runControl('focus.disable',{}, {isTrusted:true});await entered.promise;
    assert.equal(captured.revocationEpoch,'epoch-a','the helper receives the admitted instance epoch');
    store.set(TOOL_REVOCATION_EPOCHS_STORE,{[tool.id]:'epoch-b'});
    f.changeStorage({[TOOL_REVOCATION_EPOCHS_STORE]:{newValue:{[tool.id]:'epoch-b'}}});
    const rejected=assert.rejects(pending,{code:'E_TOOL_CHANGED'});release.resolve();await rejected;
    assert.deepEqual(store.get(SIDEBAR_TOOL_STORE),[tool],'only the epoch changed; package bytes are identical');
    assert.equal(captured.revocationEpoch,'epoch-a','a retired instance cannot adopt the fresh epoch');
    await assert.rejects(runControl('focus.disable',{}, {isTrusted:true}),{code:'E_TOOL_CHANGED'},
      'a callback retained after revocation also fails its initial check');
    f.host.dispose();
    await assert.rejects(runControl('focus.disable',{}, {isTrusted:true}),{code:'E_TOOL_CHANGED'},
      'a disposed controller cannot authorize callbacks retained by detached controls');
  });
});

test('Focus response keeps its acknowledged result when only an unrelated UI busy flag changes',async t=>{
  const previous=globalThis.__opendeskStayFocusTrustedUI;let runControl;
  globalThis.__opendeskStayFocusTrustedUI={id:FOCUS_ID,capability:FOCUS_CAPABILITY,operations:FOCUS_OPERATIONS,
    request:requestStayFocusOperation,runTrustedOperation:runTrustedStayFocusOperation,
    probe:async()=>({serviceReady:true}),
    createPermissionControls({runOperation}){runControl=runOperation;return {render(){},dispose(){}};}};
  t.after(()=>{if(previous===undefined)delete globalThis.__opendeskStayFocusTrustedUI;
    else globalThis.__opendeskStayFocusTrustedUI=previous;});
  const tool={...sample,id:FOCUS_ID,capabilities:[FOCUS_CAPABILITY]},store=new Map([[SIDEBAR_TOOL_STORE,[tool]]]);
  const release=deferred(),baseLocks=sharedLocks();let hold=false;
  const locks={request(name,work){return hold?release.promise.then(()=>baseLocks.request(name,work)):baseLocks.request(name,work);}};
  const f=await hostFixture(t,{tool,store,locks}),sent=deferred(),reply=deferred();
  f.api.permissions={async contains(){return false;}};
  f.api.runtime.sendMessage=async()=>{sent.resolve();return reply.promise;};
  const pending=runControl('focus.disable',{}, {isTrusted:true});await sent.promise;
  // Hold the existing enable/disable transaction before it changes authority.
  hold=true;f.emit(f.elements['sidebar-tool-enable'],'click',{isTrusted:true});
  await settle(()=>f.elements['sidebar-tool-enable'].disabled);
  reply.resolve({ok:true,data:{state:'confirmed'}});
  assert.deepEqual(await pending,{state:'confirmed'});
  release.resolve();
  await settle(()=>!f.elements['sidebar-tool-enable'].disabled);
});

test('R3.2 a sidecar alone cannot install Focus when its worker probe fails',async t=>{
  const previous=globalThis.__opendeskStayFocusTrustedUI;let probes=0;
  globalThis.__opendeskStayFocusTrustedUI={id:FOCUS_ID,capability:FOCUS_CAPABILITY,
    operations:FOCUS_OPERATIONS,request:requestStayFocusOperation,
    runTrustedOperation:runTrustedStayFocusOperation,
    probe:async()=>{probes++;throw Object.assign(new Error('Stay Focus 后台无响应'),
      {code:'E_TOOL_RUNTIME_UNAVAILABLE'});},
    createPermissionControls:createStayFocusPermissionControls};
  t.after(()=>{if(previous===undefined)delete globalThis.__opendeskStayFocusTrustedUI;
    else globalThis.__opendeskStayFocusTrustedUI=previous;});
  const tool={...sample,id:FOCUS_ID,capabilities:[FOCUS_CAPABILITY]};
  const f=await hostFixture(t,{store:new Map(),startTool:false});
  f.emit(f.elements['sidebar-tool-import-trigger'],'click');
  const serialized=JSON.stringify(tool);
  f.selectFile({size:serialized.length,text:async()=>serialized});
  await settle(()=>!f.elements['sidebar-tool-preview'].hidden);
  f.emit(f.elements['sidebar-tool-install'],'click');
  await settle(()=>probes===1);
  await settle(()=>f.elements['sidebar-tool-install'].disabled===false);
  assert.equal(f.store.has(SIDEBAR_TOOL_STORE),false,'failed worker preflight must not install');
  assert.match(f.elements['sidebar-tool-file-error'].textContent,/后台无响应/);
});

async function verifiedCookieStore(tool,baseGrant,other=[]){
  const release=(await officialFixtures()).catalog.apps.find(row=>row.toolId===tool.id);
  assert.ok(release,'source-derived official release required');
  return new Map([
    [SIDEBAR_TOOL_STORE,[tool]],
    [MARKET_PROVENANCE_STORE,{[tool.id]:{marketId:release.id,
      version:release.version,sha256:release.sha256}}],
    [BROWSER_MENU_GRANTS_STORE,{[tool.id]:{version:tool.version,installEpoch:null,
      packageHash:await sidebarToolPackageHash(tool),cookieAllSites:baseGrant}}],
    ...other
  ]);
}


function cookieChromeFixture({grant=true}={}){
  let allowed=false;const requests=[];
  const changes={addListener(){},removeListener(){}};
  return {requests,permissions:{
    onAdded:changes,onRemoved:changes,
    async contains({permissions,origins}){
      return permissions?.length?permissions.every(name=>name==='cookies'):Boolean(origins?.length&&allowed);
    },
    request(request){
      requests.push(structuredClone(request));
      if(grant)allowed=true;
      return Promise.resolve(grant);
    }
  }};
}
function cookieTestTarget(origin='https://cookie-r537.example'){
  const url=origin+'/account';
  return {snapshot:{status:'available',url},capture:()=>({
    tabId:7,windowId:1,documentId:'cookie-r537-document',url,origin
  }),async revalidate(captured){
    assert.equal(captured.documentId,'cookie-r537-document');
    assert.equal(captured.url,url);
    return true;
  }};
}
function cookieHostReceipt(tool,store,calls){
  return async request=>{
    if(request.operation!=='browser.cookies.userGrant')return;
    calls.push(request);
    const saved=structuredClone(store.get(BROWSER_MENU_GRANTS_STORE)||{});
    const old=saved[tool.id]||{version:tool.version,packageHash:await sidebarToolPackageHash(tool),
      installEpoch:null,cookieSites:{}};
    if(request.scope==='all-http-sites'){
      const grant={storeId:'0',grantEpoch:'r537-'+calls.length,
        valueConsent:request.enabled&&tool.capabilities.includes('browser.cookies.values'),
        ...Object.fromEntries(['read','values','write','observe','clear'].map(cap=>
          [cap,request.enabled&&tool.capabilities.includes('browser.cookies.'+cap)]))};
      saved[tool.id]={...old,cookieAllSites:grant};
    }else{
      const site=request.origin,oldSite=old.cookieSites?.[site]||{};
      const next=request.cookieCapability==='all'
        ?{...oldSite,valueConsent:request.enabled&&tool.capabilities.includes('browser.cookies.values'),
          ...Object.fromEntries(['read','values','write','observe','clear'].map(cap=>
            [cap,request.enabled&&tool.capabilities.includes('browser.cookies.'+cap)]))}
        :{...oldSite,[request.cookieCapability]:request.enabled,
          ...(request.cookieCapability==='values'?{valueConsent:request.enabled}:{})};
      saved[tool.id]={...old,cookieSites:{...old.cookieSites,[site]:{
        ...next,storeId:'0',partitionKey:{topLevelSite:request.document?.origin||site},
        grantEpoch:'r537-'+calls.length}}};
    }
    store.set(BROWSER_MENU_GRANTS_STORE,saved);
    return {ok:true,data:{enabled:request.enabled}};
  };
}
for(const scenario of ['official-ungranted','site-ungranted','separate-values','official-partial','official-granted'])
test('R-FINAL T2 Cookie direct settings consent disclosure '+scenario,async t=>{
  const official=await officialToolFixture('cookie-editor'),target=cookieTestTarget();
  const extraValues=scenario==='separate-values';
  const allSites=scenario.startsWith('official-');
  const tool=extraValues?{...official,id:'cookie-consent-test',capabilities:[
    'browser.cookies.read','browser.cookies.write','browser.cookies.values'
  ]}:allSites?official:{...official,js:official.js+'\nvoid 0;'};
  const complete={storeId:'0',grantEpoch:'r-final-consent',read:true,values:true,
    valueConsent:true,write:true,observe:true,clear:true};
  const grant=scenario==='official-granted'?complete:scenario==='official-partial'?
    {...complete,values:false,valueConsent:false,write:false,observe:false,clear:false}:null;
  const store=allSites?await verifiedCookieStore(tool,grant):new Map([[SIDEBAR_TOOL_STORE,[tool]]]);
  const before=structuredClone([...store]);let requests=0,writes=0;
  const f=await hostFixture(t,{tool,store,target,startTool:false,
    chromePermissions:{async contains(){return true;},async request(){requests++;return true;}},
    setHook:async()=>{writes++;}});
  assert.equal(f.host.openSettings(tool.id),true);
  const fields=f.elements,help=fields['sidebar-tool-cookie-help'],button=fields['sidebar-tool-cookie-site-toggle'];
  await settle(()=>!button.disabled);
  assert.equal(fields['sidebar-tool-cookie-permissions'].hidden,false);
  assert.equal(fields['sidebar-tool-settings-view'].hidden,false);
  assert.equal(f.runtime.frameRoot.children.length,0,'direct management must not execute the package');
  if(scenario==='official-granted'){
    assert.equal(help.hidden,true,'complete grant keeps settings compact');
    assert.equal(button.textContent,'撤销授权');
    assert.match(fields['sidebar-tool-cookie-target'].textContent,/已授权/);
  }else{
    assert.equal(help.hidden,false,'ungranted or partial consent must remain visible in direct settings');
    assert.ok(help.textContent.includes(allSites?'所有普通 HTTP/HTTPS 网站':target.capture().origin),
      'explain the actual all-site or exact-site scope before consent');
    assert.ok(help.textContent.includes('读取 Cookie 元数据'));
    assert.ok(help.textContent.includes('新建、编辑及删除'));
    if(!extraValues){
      for(const label of ['查看 Cookie 值','短时观察变化','清理当前主机'])
        assert.ok(help.textContent.includes(label),'disclose requested capability: '+label);
    }else{
      assert.match(help.textContent,/敏感值.*单独授权/,'values are a separate decision for a generic Cookie tool');
      assert.equal(fields['sidebar-tool-cookie-values-toggle'].hidden,true,
        'values cannot be granted before the base website decision');
    }
    if(!allSites)assert.equal(help.textContent.includes('允许管理所有普通 HTTP/HTTPS 网站'),false,
      'unverified or generic packages cannot advertise all-site consent');
    if(scenario==='official-partial'){
      assert.match(help.textContent,/不完整|补全/);
      assert.match(button.textContent,/补全/,'partial metadata cannot be mistaken for complete consent');
    }
  }
  assert.equal(requests,0,'opening settings cannot request Chrome access');
  assert.equal(writes,0,'consent disclosure must not mint any grant');
  assert.deepEqual([...store],before);
});

function cookieTestLocation(t){
  const old=globalThis.location;
  globalThis.location={href:'chrome-extension://test/sidepanel.html?hostInstanceId='+
    '5b69971e-94b0-4e5d-8fad-c5bdbb997380'};
  t.after(()=>{if(old===undefined)delete globalThis.location;else globalThis.location=old;});
}


test('R5.38 one clear preview dialog mints one exact native Host approval without a second review',async t=>{
  cookieTestLocation(t);
  const tool=await officialToolFixture('cookie-editor'),target=cookieTestTarget();
  const grant={storeId:'0',grantEpoch:'r538-clear-grant',read:true,write:true,
    observe:true,clear:true,values:true,valueConsent:true};
  const store=await verifiedCookieStore(tool,grant);
  const f=await hostFixture(t,{tool,store,target,chromePermissions:{contains:async()=>true}});
  await settle(()=>!f.elements['sidebar-tool-frame'].hidden);
  const old=Object.getOwnPropertyDescriptor(globalThis,'navigator');
  let trusted=false;
  Object.defineProperty(globalThis,'navigator',{configurable:true,
    value:{userActivation:{get isActive(){return trusted;}}}});
  t.after(()=>{if(old)Object.defineProperty(globalThis,'navigator',old);
    else delete globalThis.navigator;});
  const approvals=[],native=[];
  f.api.runtime.sendMessage=async message=>{
    if(message.operation==='browser.intent.confirm'){
      approvals.push(message);
      return {ok:true,data:{approvalRef:'one-use-clear-approval'}};
    }
    if(message.operation==='browser.cookies.clearSite'&&message.kind==='tool'){
      native.push(message);
      return {ok:true,data:{preview:false,scope:'EXACT_HOST_HOST_ONLY',
        matched:2,removed:2,remaining:0}};
    }
    return {ok:false,error:{code:'E_SCHEMA',message:'Unexpected Host operation'}};
  };
  const exact={url:target.snapshot.url,previewRef:'12345678-1234-1234-1234-123456789abc',
    expectedCount:2,maxCookies:50};
  const receipt=async id=>{
    await settle(()=>f.frame.contentWindow.sent.some(row=>row.kind==='response'&&row.requestId===id));
    return f.frame.contentWindow.sent.find(row=>row.kind==='response'&&row.requestId===id);
  };
  f.ask('cookieEditor.clear.begin',{url:exact.url,previewRef:exact.previewRef,expectedCount:2},'no-gesture');
  assert.equal((await receipt('no-gesture')).error.code,'E_USER_GESTURE_REQUIRED');
  assert.equal(approvals.length,0);
  trusted=true;
  f.ask('cookieEditor.clear.begin',{url:exact.url,previewRef:exact.previewRef,expectedCount:2},'first-click');
  trusted=false;
  const begin=await receipt('first-click');
  assert.equal(begin.ok,true,JSON.stringify(begin.error));
  assert.equal(begin.result.authorized,true);
  assert.equal(f.elements['sidebar-tool-action-review'].hidden,true);
  f.ask('browser.cookies.clearSite',exact,'execute');
  const executed=await receipt('execute');
  assert.equal(executed.ok,true,JSON.stringify(executed.error));
  assert.equal(native.length,1);
  assert.equal(approvals.length,1);
  assert.deepEqual(approvals[0].targetArgs,exact);
  assert.equal(native[0].approvalRef,'one-use-clear-approval');
  assert.equal(f.elements['sidebar-tool-action-review'].hidden,true,
    'no second Host review after first confirmed React clear dialog');
  f.ask('browser.cookies.clearSite',exact,'replay');
  assert.equal((await receipt('replay')).error.code,'E_USER_GESTURE_REQUIRED');
  assert.equal(native.length,1,'one first click cannot remove twice');
  assert.equal(approvals.length,1);
});

test('R5.38 forged clear size or revoked site grant never falls through to a duplicate review',async t=>{
  cookieTestLocation(t);
  const tool=await officialToolFixture('cookie-editor'),target=cookieTestTarget();
  const grant={storeId:'0',grantEpoch:'r538-grant',read:true,write:true,
    observe:true,clear:true,values:true,valueConsent:true};
  const store=await verifiedCookieStore(tool,grant);
  const f=await hostFixture(t,{tool,store,target,chromePermissions:{contains:async()=>true}});
  // R2.8 renders the unprivileged UI before asynchronous admission finishes.
  // The clear intent requires the completed package/grant decision, not visibility.
  await settle(()=>f.elements['sidebar-tool-cookie-site-toggle'].textContent==='撤销授权'&&
    !f.elements['sidebar-tool-cookie-site-toggle'].disabled);
  const old=Object.getOwnPropertyDescriptor(globalThis,'navigator');
  Object.defineProperty(globalThis,'navigator',{configurable:true,
    value:{userActivation:{isActive:true}}});
  t.after(()=>{if(old)Object.defineProperty(globalThis,'navigator',old);
    else delete globalThis.navigator;});
  const messages=[];f.api.runtime.sendMessage=async message=>{
    messages.push(message);return {ok:true,data:{approvalRef:'never'}};
  };
  const url=target.snapshot.url,previewRef='12345678-1234-1234-1234-123456789abc';
  const reply=async id=>{
    await settle(()=>f.frame.contentWindow.sent.some(row=>row.kind==='response'&&row.requestId===id));
    return f.frame.contentWindow.sent.find(row=>row.kind==='response'&&row.requestId===id);
  };
  f.ask('cookieEditor.clear.begin',{url,previewRef,expectedCount:2},'prepared');
  const prepared=await reply('prepared');
  assert.equal(prepared.ok,true,JSON.stringify(prepared.error));
  f.ask('browser.cookies.clearSite',{url,previewRef,expectedCount:1,maxCookies:50},'changed-count');
  assert.equal((await reply('changed-count')).error.code,'E_DOCUMENT_CHANGED');
  assert.equal(messages.length,0);
  assert.equal(f.elements['sidebar-tool-action-review'].hidden,true);
  f.ask('cookieEditor.clear.begin',{url,previewRef,expectedCount:2},'prepared-again');
  assert.equal((await reply('prepared-again')).ok,true);
  const saved=structuredClone(store.get(BROWSER_MENU_GRANTS_STORE));
  saved[tool.id].cookieAllSites.grantEpoch='r538-revoked';
  store.set(BROWSER_MENU_GRANTS_STORE,saved);
  f.changeStorage({[BROWSER_MENU_GRANTS_STORE]:{newValue:saved}});
  f.ask('browser.cookies.clearSite',{url,previewRef,expectedCount:2,maxCookies:50},'revoked');
  assert.equal((await reply('revoked')).error.code,'E_USER_GESTURE_REQUIRED');
  assert.equal(messages.length,0,'no native Host execution or confirmation was dispatched');
  assert.equal(f.elements['sidebar-tool-action-review'].hidden,true);
});

test('R5.37 development Cookie package grants declared capabilities for current site, never all sites',async t=>{
  cookieTestLocation(t);
  const official=await officialToolFixture('cookie-editor');
  const tool={...official,js:official.js+'\nvoid 0;'},target=cookieTestTarget(),origin=target.capture().origin;
  const store=new Map([[SIDEBAR_TOOL_STORE,[tool]]]);
  const chrome=cookieChromeFixture(),hostCalls=[];
  const f=await hostFixture(t,{tool,store,target,chromePermissions:chrome.permissions,
    hostReply:cookieHostReceipt(tool,store,hostCalls)});
  await settle(()=>f.elements['sidebar-tool-cookie-site-toggle'].textContent==='允许管理本站 Cookie'&&
    !f.elements['sidebar-tool-cookie-site-toggle'].disabled);
  assert.equal(f.elements['sidebar-tool-frame'].hidden,false,
    'R2.8 keeps the unprivileged editor visible before site consent');
  await assertCookieWorkspaceUnauthorized(f,f.frame,f.loaded,target.snapshot.url);
  f.emit(f.elements['sidebar-tool-cookie-site-toggle'],'click',{isTrusted:true});
  await settle(()=>store.get(BROWSER_MENU_GRANTS_STORE)?.[tool.id]?.cookieSites?.[origin]?.clear===true);
  await settle(()=>f.elements['sidebar-tool-frame'].hidden===false);
  assert.equal(chrome.requests.length,1,'missing Chrome website permission is requested in the click');
  assert.deepEqual(chrome.requests[0],{origins:['https://cookie-r537.example/*']});
  assert.equal(hostCalls.length,1,'Cookie Editor complete consent is one exact-site decision');
  assert.equal(hostCalls[0].scope,undefined,'unverified bytes cannot acquire all-site consent');
  assert.equal(hostCalls[0].cookieCapability,'all');
  const saved=store.get(BROWSER_MENU_GRANTS_STORE)[tool.id];
  assert.equal(saved.cookieAllSites,undefined);
  assert.equal(saved.cookieSites[origin].valueConsent,true);
  assert.equal(saved.cookieSites[origin].partitionKey.topLevelSite,origin);
  for(const cap of ['read','values','write','observe','clear'])
    assert.equal(saved.cookieSites[origin][cap],true,'explicit complete consent includes '+cap);
  assert.equal(f.host.openSettings(tool.id),true);
  assert.equal(f.elements['sidebar-tool-cookie-values-toggle'].hidden,true,
    'Cookie Editor has one complete consent rather than a duplicate values action');
});

test('R5.37 verified official Cookie Editor requests missing Chrome all-site access and resumes UI',async t=>{
  cookieTestLocation(t);
  const tool=await officialToolFixture('cookie-editor');
  const store=await verifiedCookieStore(tool,null);
  const target=cookieTestTarget(),chrome=cookieChromeFixture(),hostCalls=[];
  const f=await hostFixture(t,{tool,store,target,chromePermissions:chrome.permissions,
    hostReply:cookieHostReceipt(tool,store,hostCalls)});
  await settle(()=>f.elements['sidebar-tool-cookie-site-toggle'].textContent==='允许管理所有网站 Cookie'&&
    !f.elements['sidebar-tool-cookie-site-toggle'].disabled);
  f.emit(f.elements['sidebar-tool-cookie-site-toggle'],'click',{isTrusted:true});
  await settle(()=>store.get(BROWSER_MENU_GRANTS_STORE)?.[tool.id]?.cookieAllSites?.read===true);
  await settle(()=>!f.elements['sidebar-tool-frame'].hidden);
  assert.equal(chrome.requests.length,1);
  assert.deepEqual(chrome.requests[0],{origins:['http://*/*','https://*/*']});
  assert.equal(hostCalls.length,1);
  assert.equal(hostCalls[0].scope,'all-http-sites');
  const grant=store.get(BROWSER_MENU_GRANTS_STORE)[tool.id].cookieAllSites;
  assert.equal(grant.values,true,'declared values are included in explicit complete consent');
  assert.equal(grant.valueConsent,true,'values require the persisted consent receipt');
});

async function assertCookieWorkspaceUnauthorized(f,frame,loaded,url){
  const messages=[],send=f.api.runtime.sendMessage;
  f.api.runtime.sendMessage=async message=>{messages.push(message);return send(message);};
  try{
    f.win.emit('message',{origin:'null',source:frame.contentWindow,data:{
      protocol:loaded.protocol,toolId:loaded.tool.id,instance:loaded.instance,
      kind:'request',requestId:'ungranted-write',operation:'browser.cookies.setMany',
      payload:{url,cookies:[{name:'unauthorized',value:'must-not-write'}]}}});
    await settle(()=>frame.contentWindow.sent.some(row=>row.requestId==='ungranted-write'));
    const reply=frame.contentWindow.sent.find(row=>row.requestId==='ungranted-write');
    assert.equal(reply.ok,false);
    assert.equal(reply.error.code,'E_SITE_GRANT_REQUIRED');
    assert.equal(messages.length,0,'the unprivileged UI cannot dispatch a Cookie operation to Host');
  }finally{f.api.runtime.sendMessage=send;}
}

async function assertCookieFrameReplaced(f,tool,draft){
  const frame=f.runtime.frameRoot.children[0];
  assert.equal(f.runtime.frameRoot.children.length,1,'revocation retains one nonprivileged UI');
  assert.notEqual(frame,f.frame,'the authorized iframe is destroyed rather than reused');
  assert.equal(f.frame.parentNode,null);
  assert.equal(f.frame.onload,null,'retired iframe cannot load again');
  await frame.onload();
  const loaded=frame.contentWindow.sent.find(row=>row.kind==='load');
  assert.ok(loaded);
  assert.notEqual(loaded.instance,f.loaded.instance,'the old token is retired');
  const oldMessages=f.frame.contentWindow.sent.length;
  // Neither the old source nor a replayed old token on the new source has authority.
  for(const source of [f.frame.contentWindow,frame.contentWindow]){
    for(const data of [{kind:'draft',text:'stale-sensitive-state'},
      {kind:'request',requestId:'stale-write',operation:'storage.set',
        payload:{key:'stale-sensitive-state',value:'must-not-restore'}}])
      f.win.emit('message',{origin:'null',source,data:{
        protocol:f.loaded.protocol,toolId:tool.id,instance:f.loaded.instance,...data}});
  }
  await pause();
  assert.equal(f.frame.contentWindow.sent.length,oldMessages,'old iframe receives no reply');
  assert.equal(frame.contentWindow.sent.some(row=>row.requestId==='stale-write'),false);
  assert.equal(f.store.has(sidebarToolStorageKey(tool.id)),false,'stale token cannot restore sensitive storage');
  assert.equal(f.elements['sidebar-tool-retired-draft-text'].value,draft,'stale draft cannot replace inert recovery');
  assert.equal(JSON.stringify(frame.contentWindow.sent).includes(draft),false,'new sandbox never receives old draft');
  assert.equal(JSON.stringify(frame.contentWindow.sent).includes('stale-sensitive-state'),false);
  return {frame,loaded};
}

test('R5.37 denied Chrome permission retains first-use and never creates a false Host grant',async t=>{
  cookieTestLocation(t);
  const tool=await officialToolFixture('cookie-editor');
  const store=await verifiedCookieStore(tool,null),chrome=cookieChromeFixture({grant:false});
  const calls=[],target=cookieTestTarget();
  const f=await hostFixture(t,{tool,store,target,chromePermissions:chrome.permissions,
    hostReply:cookieHostReceipt(tool,store,calls)});
  await settle(()=>f.elements['sidebar-tool-cookie-site-toggle'].textContent==='允许管理所有网站 Cookie'&&
    !f.elements['sidebar-tool-cookie-site-toggle'].disabled);
  f.emit(f.elements['sidebar-tool-cookie-site-toggle'],'click',{isTrusted:true});
  await settle(()=>chrome.requests.length===1&&
    !f.elements['sidebar-tool-cookie-site-toggle'].disabled);
  assert.equal(calls.length,0,'denied Chrome permission must never reach trusted Host');
  assert.equal(store.get(BROWSER_MENU_GRANTS_STORE)?.[tool.id]?.cookieAllSites,null);
  assert.equal(f.elements['sidebar-tool-frame'].hidden,false,'R2.8 denial retains the nonprivileged UI');
  assert.equal(f.runtime.frameRoot.children[0],f.frame,'denial does not replace the unprivileged instance');
  await assertCookieWorkspaceUnauthorized(f,f.frame,f.loaded,target.snapshot.url);
});

test('R5.25 Cookie Editor settings keeps one live sandbox through ten returns and unsaved edits',async t=>{
  const tool=await officialToolFixture('cookie-editor');
  const baseGrant={storeId:'0',grantEpoch:'r525-fixture',read:true,values:true,valueConsent:true,
    write:true,observe:true,clear:true};
  const store=await verifiedCookieStore(tool,baseGrant);
  const target=cookieTestTarget();
  const f=await hostFixture(t,{tool,store,target,
    chromePermissions:{contains:async()=>true}}),original=f.frame;
  assert.ok(original,'installed Cookie Editor mounts its official iframe');
  await settle(()=>f.elements['sidebar-tool-cookie-site-toggle'].textContent==='撤销授权'&&
    !f.elements['sidebar-tool-cookie-site-toggle'].disabled);
  const settings=f.elements['sidebar-tool-cookie-permissions'];
  assert.equal(settings.hidden,true,'Cookie settings before first explicit open');
  for(let i=0;i<10;i++){
    assert.equal(f.host.openSettings(tool.id),true,'settings opens without destroying the editor');
    assert.equal(f.runtime.frameRoot.children[0],original,'openSettings must not destroy the active frame');
    assert.equal(f.elements['sidebar-tool-frame'].hidden,true,'settings hides the live workspace');
    assert.equal(f.elements['sidebar-tool-settings-view'].hidden,false,'Cookie Editor uses the shared management settings');
    assert.equal(settings.hidden,false,'dedicated Cookie permissions remain visible');
    assert.equal(f.elements['sidebar-tool-back'].title,'返回上一页');
    f.emit(f.elements['sidebar-tool-back'],'click');
    assert.equal(f.runtime.frameRoot.children[0],original,'return keeps the original form and draft');
    assert.equal(f.elements['sidebar-tool-frame'].hidden,false,'return must restore the real workspace');
    assert.equal(settings.hidden,true);
  }
  f.emit(f.elements['sidebar-tool-back'],'click');
  assert.equal(f.elements['sidebar-tool-display'].hidden,true,'second back returns to extension list');
  assert.equal(f.runtime.frameRoot.children.length,0,'closing the editor retires the iframe');
});

test('R5.25 Extension Center direct settings returns to an available Cookie Editor workspace',async t=>{
  const tool=await officialToolFixture('cookie-editor');
  const store=await verifiedCookieStore(tool,
    {storeId:'0',grantEpoch:'r525-fixture',read:true,values:true,valueConsent:true,
      write:true,observe:true,clear:true});
  const f=await hostFixture(t,{tool,store,startTool:false});
  assert.equal(f.runtime.frameRoot.children.length,0);
  assert.equal(f.host.openSettings(tool.id),true);
  assert.equal(f.runtime.frameRoot.children.length,0,'management must not silently execute a tool');
  assert.equal(f.elements['sidebar-tool-cookie-permissions'].hidden,false);
  assert.equal(f.elements['sidebar-tool-settings-view'].hidden,false);
  f.emit(f.elements['sidebar-tool-back'],'click');
  assert.equal(f.elements['sidebar-tool-display'].hidden,false);
  assert.equal(f.runtime.frameRoot.children.length,1,'back from settings mounts the real editor');
  const frame=f.runtime.frameRoot.children[0];
  await settle(()=>!f.elements['sidebar-tool-frame'].hidden);
  await frame.onload();
  assert.ok(frame.contentWindow.sent.some(row=>row.kind==='load'&&row.tool?.id===tool.id));
  f.emit(f.elements['sidebar-tool-back'],'click');
  assert.equal(f.elements['sidebar-tool-display'].hidden,true);
  assert.equal(f.runtime.frameRoot.children.length,0);
});

test('R-FINAL T2 disabled official Cookie direct settings retains all-site consent without actions',async t=>{
  const tool=await officialToolFixture('cookie-editor'),target=cookieTestTarget();
  const grant={storeId:'0',grantEpoch:'disabled-official-consent',read:true,values:true,
    valueConsent:true,write:true,observe:true,clear:true};
  const store=await verifiedCookieStore(tool,grant,[[SIDEBAR_TOOL_ENABLE_STORE,{[tool.id]:false}]]);
  const before=structuredClone([...store]),operations=[];let writes=0,permissionRequests=0;
  const f=await hostFixture(t,{tool,store,target,startTool:false,
    setHook:async()=>{writes++;},
    chromePermissions:{async contains(){return true;},async request(){permissionRequests++;return true;}},
    hostReply:async message=>{operations.push(message);}});
  assert.equal(f.host.openSettings(tool.id),true);
  const fields=f.elements,button=fields['sidebar-tool-cookie-site-toggle'];
  await settle(()=>button.textContent==='撤销授权');
  assert.equal(fields['sidebar-tool-cookie-permissions'].hidden,false);
  assert.equal(fields['sidebar-tool-settings-view'].hidden,false);
  assert.match(fields['sidebar-tool-cookie-target'].textContent,/已授权/,
    'preserved all-site consent remains recognized when official app is disabled');
  assert.equal(button.attributes['data-enabled'],'true');
  assert.equal(button.disabled,true,'recognizing consent cannot allow grant or revoke while stopped');
  assert.equal(fields['sidebar-tool-cookie-values-toggle'].hidden,true,'no duplicate consent action');
  assert.equal(fields['sidebar-tool-cookie-help'].hidden,true,'no false unverified or ungranted warning');
  assert.equal(fields['sidebar-tool-enable'].attributes['aria-checked'],'false');
  assert.equal(f.runtime.frameRoot.children.length,0);
  assert.equal(permissionRequests,0);
  assert.equal(operations.length,0,'direct settings must not send grant, revoke or Cookie operations');
  assert.equal(writes,0);
  assert.deepEqual([...store],before,'all-site receipt must be preserved byte-for-byte');
});

test('R5.26 disabled Cookie Editor direct settings can re-enable without auto-mount or data loss',async t=>{
  const tool=await officialToolFixture('cookie-editor');
  const baseGrant={storeId:'0',grantEpoch:'r526-fixture',read:true,values:true,valueConsent:true,
    write:true,observe:true,clear:true};
  const key=sidebarToolStorageKey(tool.id),userData={draft:'retain-on-enable'};
  const store=await verifiedCookieStore(tool,baseGrant,[
    [SIDEBAR_TOOL_ENABLE_STORE,{[tool.id]:false}],[key,userData]
  ]);
  const f=await hostFixture(t,{tool,store,startTool:false});
  assert.equal(f.host.openSettings(tool.id),true);
  assert.equal(f.runtime.frameRoot.children.length,0,'settings cannot silently start a stopped sandbox');
  assert.equal(f.elements['sidebar-tool-cookie-permissions'].hidden,false);
  assert.equal(f.elements['sidebar-tool-settings-view'].hidden,false);
  assert.equal(f.elements['sidebar-tool-enable'].disabled,false);
  assert.equal(f.elements['sidebar-tool-enable'].attributes['aria-checked'],'false');
  assert.equal(f.elements['sidebar-tool-enable'].attributes.role,'switch');
  assert.equal(f.elements['sidebar-tool-cookie-site-toggle'].disabled,true,
    'stopped tools must not request more Cookie privileges');
  f.emit(f.elements['sidebar-tool-enable'],'click',{isTrusted:true});
  await settle(()=>store.get(SIDEBAR_TOOL_ENABLE_STORE)?.[tool.id]===true&&!f.elements['sidebar-tool-enable'].disabled);
  assert.equal(f.runtime.frameRoot.children.length,0,'enablement must not auto-execute the app');
  assert.deepEqual(store.get(key),userData,'existing persisted data must survive re-enable');
  const newEpoch=store.get(TOOL_REVOCATION_EPOCHS_STORE)?.[tool.id];
  assert.ok(typeof newEpoch==='string'&&newEpoch.length>0,'resume revokes the previous instance');
  assert.equal(store.get(BROWSER_MENU_GRANTS_STORE)?.[tool.id]?.installEpoch,newEpoch,
    'only a package-verified Cookie grant may follow the new instance');
  // Real Chrome emits storage.onChanged after the installer carries the grant.
  // This storage Map fixture does not emit events on set() automatically.
  f.changeStorage({[BROWSER_MENU_GRANTS_STORE]:{newValue:store.get(BROWSER_MENU_GRANTS_STORE)}});
  f.emit(f.elements['sidebar-tool-back'],'click');
  assert.equal(f.runtime.frameRoot.children.length,1,'return mounts the existing React application');
  await settle(()=>!f.elements['sidebar-tool-frame'].hidden);
});

test('R5.25 Cookie grant revocation destroys the prior iframe instead of exposing stale metadata',async t=>{
  cookieTestLocation(t);
  const tool=await officialToolFixture('cookie-editor');
  const saved={version:tool.version,installEpoch:null,
    cookieAllSites:{storeId:'0',grantEpoch:'r525-fixture',read:true,values:true,valueConsent:true,
      write:true,observe:true,clear:true}};
  const store=await verifiedCookieStore(tool,saved.cookieAllSites);
  const target=cookieTestTarget();
  const f=await hostFixture(t,{tool,store,target,chromePermissions:{contains:async()=>true}}),frame=f.frame;
  await settle(()=>f.elements['sidebar-tool-cookie-site-toggle'].textContent==='撤销授权'&&
    !f.elements['sidebar-tool-cookie-site-toggle'].disabled);
  const draft='账号名称\n保留失败草稿';
  for(const data of [{kind:'draft',text:draft},{kind:'edit-state',dirty:true,busy:false}])
    f.win.emit('message',{origin:'null',source:frame.contentWindow,data:{
      protocol:f.loaded.protocol,toolId:tool.id,instance:f.loaded.instance,...data}});
  const revoked={...store.get(BROWSER_MENU_GRANTS_STORE)[tool.id],cookieAllSites:null};
  f.store.set(BROWSER_MENU_GRANTS_STORE,{[tool.id]:revoked});
  f.changeStorage({[BROWSER_MENU_GRANTS_STORE]:{newValue:{[tool.id]:revoked}}});
  assert.equal(f.elements['sidebar-tool-frame'].hidden,false,'R2.8 revocation retains a fresh nonprivileged UI');
  assert.equal(f.elements['sidebar-tool-cookie-permissions'].hidden,false);
  const next=await assertCookieFrameReplaced(f,tool,draft);
  await assertCookieWorkspaceUnauthorized(f,next.frame,next.loaded,target.snapshot.url);
  assert.equal(f.elements['sidebar-tool-retired-draft'].hidden,false);
  assert.equal(f.elements['sidebar-tool-retired-draft-text'].value,draft,
    'external revocation retains the existing bounded inert text recovery');
  assert.equal(JSON.stringify([...store]).includes('保留失败草稿'),false,
    'recovery stays in Host memory rather than ordinary storage');
});

test('R2.6 Cookie settings revoke retains the inert account draft after its storage event',async t=>{
  cookieTestLocation(t);
  const tool=await officialToolFixture('cookie-editor'),target=cookieTestTarget();
  const grant={storeId:'0',grantEpoch:'r26-draft',read:true,values:true,valueConsent:true,
    write:true,observe:true,clear:true};
  const store=await verifiedCookieStore(tool,grant),calls=[];
  const f=await hostFixture(t,{tool,store,target,chromePermissions:{contains:async()=>true},
    hostReply:cookieHostReceipt(tool,store,calls)});
  await settle(()=>!f.elements['sidebar-tool-frame'].hidden);
  const frame=f.frame,draft='账号名称\n保留撤权草稿';
  for(const data of [{kind:'draft',text:draft},{kind:'edit-state',dirty:true,busy:false}])
    f.win.emit('message',{origin:'null',source:frame.contentWindow,data:{
      protocol:f.loaded.protocol,toolId:tool.id,instance:f.loaded.instance,...data}});
  assert.equal(f.host.openSettings(tool.id),true);
  await settle(()=>!f.elements['sidebar-tool-cookie-site-toggle'].disabled);
  f.emit(f.elements['sidebar-tool-cookie-site-toggle'],'click',{isTrusted:true});
  await settle(()=>calls.length===1&&f.runtime.frameRoot.children[0]!==frame&&
    !f.elements['sidebar-tool-cookie-site-toggle'].disabled);
  assert.equal(calls[0].enabled,false);
  assert.equal(store.get(BROWSER_MENU_GRANTS_STORE)[tool.id].cookieAllSites.read,false);
  assert.equal(frame.onload,null);
  assert.equal(f.elements['sidebar-tool-retired-draft-text'].value,draft);
  const next=await assertCookieFrameReplaced(f,tool,draft);
  await assertCookieWorkspaceUnauthorized(f,next.frame,next.loaded,target.snapshot.url);
  f.changeStorage({[BROWSER_MENU_GRANTS_STORE]:{newValue:store.get(BROWSER_MENU_GRANTS_STORE)}});
  assert.equal(f.runtime.frameRoot.children.length,1);
  assert.equal(f.runtime.frameRoot.children[0],next.frame,'storage receipt keeps the fresh nonprivileged instance');
  assert.equal(f.elements['sidebar-tool-frame'].hidden,false);
  assert.equal(f.elements['sidebar-tool-retired-draft'].hidden,false);
  assert.equal(f.elements['sidebar-tool-retired-draft-text'].value,draft,
    'the subsequent storage receipt cannot overwrite the preserved text');
  assert.equal(JSON.stringify([...store]).includes('保留撤权草稿'),false);
});


for(const corrupt of ['broken',[],null,{'notes-local':false}]){
  test('R1.8 corrupt epochs initial read blocks opening: '+JSON.stringify(corrupt),async t=>{
    const store=new Map([[SIDEBAR_TOOL_STORE,[sample]],[TOOL_REVOCATION_EPOCHS_STORE,corrupt]]);
    const f=await hostFixture(t,{store,startTool:false});
    f.host.openTool(sample.id);
    assert.equal(f.runtime.frameRoot.children.length,0);
    assert.deepEqual(store.get(TOOL_REVOCATION_EPOCHS_STORE),corrupt);
  });
  test('R1.8 corrupt epochs change retires default-null instance and preserves draft: '+JSON.stringify(corrupt),async t=>{
    const f=await hostFixture(t);
    for(const data of [{kind:'draft',text:'保留未保存草稿'},{kind:'edit-state',dirty:true,busy:false}])
      f.win.emit('message',{origin:'null',source:f.frame.contentWindow,data:{
        protocol:f.loaded.protocol,toolId:sample.id,instance:f.loaded.instance,...data}});
    f.store.set(TOOL_REVOCATION_EPOCHS_STORE,corrupt);
    f.changeStorage({[TOOL_REVOCATION_EPOCHS_STORE]:{newValue:corrupt}});
    assert.equal(f.frame.isConnected,false);
    assert.equal(f.elements['sidebar-tool-retired-draft-text'].value,'保留未保存草稿');
    f.host.openTool(sample.id);
    assert.equal(f.runtime.frameRoot.children.length,0);
    assert.deepEqual(f.store.get(TOOL_REVOCATION_EPOCHS_STORE),corrupt);
  });
  test('R1.8 corrupt epochs SDK readback cannot write: '+JSON.stringify(corrupt),async t=>{
    const f=await hostFixture(t);
    f.store.set(TOOL_REVOCATION_EPOCHS_STORE,corrupt);
    f.ask('storage.set',{key:'note',value:'must not write'});
    await pause();await pause();
    assert.equal(f.store.has(sidebarToolStorageKey(sample.id)),false);
    assert.equal(f.frame.isConnected,false);
  });
  test('R1.8 corrupt epochs final load read cannot dispatch: '+JSON.stringify(corrupt),async t=>{
    const f=await hostFixture(t,{startTool:false});
    f.host.openTool(sample.id);const frame=f.runtime.frameRoot.firstElementChild;
    f.store.set(TOOL_REVOCATION_EPOCHS_STORE,corrupt);
    await frame.onload();
    assert.equal(frame.contentWindow.sent.some(row=>row.kind==='load'),false);
    assert.equal(frame.isConnected,false);
  });
}

test('R1.8 corrupt installed event during catalog await retires load before dispatch',async t=>{
  const tool=await officialToolFixture('prompt-shortcuts');
  const f=await hostFixture(t,{tool,startTool:false,store:new Map([[SIDEBAR_TOOL_STORE,[tool]]])});
  const gate=deferred(),entered=deferred(),digest=crypto.subtle.digest.bind(crypto.subtle);
  t.mock.method(crypto.subtle,'digest',async(...args)=>{
    entered.resolve();await gate.promise;return digest(...args);
  });
  f.host.openTool(tool.id);const frame=f.runtime.frameRoot.firstElementChild;
  const loading=frame.onload();await entered.promise;
  const damaged=[tool,{...sample,id:'invalid id'}];
  f.store.set(SIDEBAR_TOOL_STORE,damaged);f.change(damaged);
  const retired=!frame.isConnected;
  gate.resolve();await loading;
  assert.equal(retired,true,'corrupt notification retires immediately');
  assert.equal(frame.contentWindow.sent.some(row=>row.kind==='load'),false);
  assert.deepEqual(f.store.get(SIDEBAR_TOOL_STORE),damaged);
});

test('R1.8 corrupt authority and installed notifications leave read-only preview intact',async t=>{
  const f=await hostFixture(t,{startTool:false});
  f.host.openReadOnlyPreview(sample);
  const frame=f.runtime.frameRoot.firstElementChild;await frame.onload();
  for(const key of [TOOL_REVOCATION_EPOCHS_STORE,SIDEBAR_TOOL_STORE]){
    f.store.set(key,'broken');f.changeStorage({[key]:{newValue:'broken'}});
    assert.equal(frame.isConnected,true);
  }
  assert.equal(frame.contentWindow.sent.filter(row=>row.kind==='load').length,1);
});

test('R1.8 corrupt installed notification retires executable frame but retains draft text',async t=>{
  const f=await hostFixture(t);
  f.win.emit('message',{origin:'null',source:f.frame.contentWindow,data:{
    protocol:f.loaded.protocol,toolId:sample.id,instance:f.loaded.instance,
    kind:'draft',text:'安装状态未知时仍可复制的草稿'}});
  const damaged=[sample,{...sample,id:'invalid id'}];
  f.store.set(SIDEBAR_TOOL_STORE,damaged);f.change(damaged);
  assert.equal(f.frame.isConnected,false);
  assert.equal(f.elements['sidebar-tool-retired-draft-text'].value,'安装状态未知时仍可复制的草稿');
  f.host.openTool(sample.id);assert.equal(f.runtime.frameRoot.children.length,0);
  assert.deepEqual(f.store.get(SIDEBAR_TOOL_STORE),damaged);
});

test('R1.8 extension-center toggles retain current Host success receipts',async t=>{
  const f=await hostFixture(t,{startTool:false});
  for(const enabled of [false,true]){
    assert.equal(await f.host.toggleEnabled(sample.id,{isTrusted:true}),true);
    assert.equal(f.store.get(SIDEBAR_TOOL_ENABLE_STORE)[sample.id],enabled);
    assert.match(f.elements['sidebar-tool-status'].textContent,enabled?/应用已恢复使用/:/已停用/);
    assert.equal(f.elements['sidebar-tool-status'].hidden,false);
  }
});

test('R1.8 Host own enable button retains stop and restore feedback',async t=>{
  const f=await hostFixture(t);
  const event={isTrusted:true,target:{id:'sidebar-tool-enable'}};
  assert.equal(await f.host.toggleEnabled(sample.id,event),true);
  assert.match(f.elements['sidebar-tool-status'].textContent,/已停用/);
  assert.equal(await f.host.toggleEnabled(sample.id,event),true);
  assert.match(f.elements['sidebar-tool-status'].textContent,/应用已恢复使用/);
});

for(const destination of ['detail','list','settings'])test('R1.8 previous install notice clears on '+destination+' navigation while errors remain',async t=>{
  const other={...sample,id:'other-app',title:'另一个应用'};
  const f=await hostFixture(t,{startTool:false,store:new Map([[SIDEBAR_TOOL_STORE,[sample,other]]])});
  const navigate=()=>{
    if(destination==='settings')return f.host.openSettings(other.id);
    const button=f.doc.createElement('button');
    if(destination==='detail')button.dataset.extensionAction='main';
    else button.id='extension-center-back';
    const child=f.doc.createElement('span');button.append(child);f.doc.body.append(button);
    child.dispatchEvent(new f.doc.defaultView.Event('click',{bubbles:true}));button.remove();
  };
  for(const text of ['已安装网页增强「本地程序」v1.0.0；打开或刷新目标网页即可使用。','已卸载「本地程序」，本地数据已清理。']){
    f.view.patch('sidebar-tool-status',{textContent:text,hidden:false,attributes:{'data-state':'info'}});
    await f.host.ready;
    assert.equal(f.elements['sidebar-tool-status'].textContent,text,'fresh receipts survive reads until navigation');
    navigate();
    assert.equal(f.elements['sidebar-tool-status'].textContent,'');
    assert.equal(f.elements['sidebar-tool-status'].hidden,true);
  }
  f.view.patch('sidebar-tool-status',{textContent:'安装记录读取失败，请核对原始数据',hidden:false,attributes:{'data-state':'error'}});
  navigate();
  assert.match(f.elements['sidebar-tool-status'].textContent,/安装记录读取失败/);
  assert.equal(f.elements['sidebar-tool-status'].hidden,false);
});

const delegatedPin={taskId:'fixed-capture',version:'1.0.0',manifestHash:'a'.repeat(64),contentHash:'b'.repeat(64)};
const delegatedInstall={...delegatedPin,installationId:'12345678-1234-4123-8123-123456789abc',generation:1};
async function delegationHostFixture(t,{startGate=null}={}){
  const tool={...sample,format:'opendesk.sidebar-tool.v2',id:'delegation-demo',capabilities:['tasks.run'],
    requires:{browserSdk:'1.0.0'},contributes:{contextMenus:[]},delegatedTasks:[delegatedPin]};
  const store=new Map([[SIDEBAR_TOOL_STORE,[tool]],[TOOL_REVOCATION_EPOCHS_STORE,{[tool.id]:'app-epoch'}]]);
  const calls=[],stops=[],cancels=[];
  const target={capture:()=>({tabId:2,frameId:0,documentId:'real-document',url:'https://example.com/',windowId:1}),revalidate:async()=>{}};
  const runHost={start:async request=>{calls.push(request);if(startGate)await startGate.promise;return {runId:'original-run',resultId:'original-result'};},
    cancelStart:id=>cancels.push(id),stop:async request=>{stops.push(request);return {};},
    controller:{snapshotControllerRun:async()=>({run:{runId:'original-run',resultId:'original-result',state:'completed',retirementState:'released'},
      results:[{runId:'original-run',resultId:'original-result',outcome:{ok:true,valueWire:encodeDelegationValue({data:[1,2,3]})}}]})}};
  const previous=Object.getOwnPropertyDescriptor(globalThis.navigator,'userActivation');
  Object.defineProperty(globalThis.navigator,'userActivation',{configurable:true,value:{isActive:true}});
  t.after(()=>{if(previous)Object.defineProperty(globalThis.navigator,'userActivation',previous);else delete globalThis.navigator.userActivation;});
  const f=await hostFixture(t,{tool,store,target,runHost,foundationClient:{request:async operation=>{
    assert.equal(operation,'resolveInstalledTask');return {...delegatedInstall,scriptId:'task:fixed-capture:1.0.0',revision:1,manifest:{deadlineMs:30000}};
  }}});
  const rpc=async(operation,payload,id)=>{f.ask(operation,payload,id);await settle(()=>f.frame.contentWindow.sent.some(row=>row.requestId===id));
    return f.frame.contentWindow.sent.find(row=>row.requestId===id);};
  return {...f,tool,calls,stops,cancels,rpc};
}
test('fixed Task public iframe dispatch start/read/stop keeps the same App mounted and decodes its result',async t=>{
  const f=await delegationHostFixture(t),frame=f.frame;
  const metadata=await f.rpc('tasks.read',{taskId:delegatedPin.taskId},'describe');
  assert.equal(metadata.ok,true);assert.deepEqual(metadata.result,{task:delegatedInstall});
  const started=await f.rpc('tasks.start',{task:metadata.result.task,clientRequestId:'original-client',params:{}},'start');
  assert.equal(started.ok,true);assert.equal(started.result.runId,'original-run');assert.equal(f.calls.length,1);
  const read=await f.rpc('tasks.read',{clientRequestId:'original-client'},'read');
  assert.equal(read.ok,true);assert.deepEqual(read.result.value,{data:[1,2,3]});assert.equal(read.result.retirementState,'released');
  const stopped=await f.rpc('tasks.stop',{clientRequestId:'original-client'},'stop');
  assert.equal(stopped.ok,true);assert.equal(stopped.result.value,null);assert.equal(stopped.result.result,null);
  assert.equal(f.elements['sidebar-tool-frame'].children[0],frame);assert.equal(f.focused,0);
  assert.ok(f.stops.every(row=>row.runId==='original-run'));
  f.host.closeTool();await pause();assert.equal(f.elements['sidebar-tool-frame'].children.length,0);
  assert.ok(f.stops.length>=2,'closing the original iframe retires its own delegation');
});
test('fixed Task public dispatch refuses non-user start and runId spoofing',async t=>{
  const f=await delegationHostFixture(t);globalThis.navigator.userActivation.isActive=false;
  const reply=await f.rpc('tasks.start',{task:delegatedInstall,clientRequestId:'no-gesture',params:{}},'start');
  assert.equal(reply.ok,false);assert.equal(reply.error.code,'E_USER_GESTURE_REQUIRED');assert.equal(f.calls.length,0);
  const spoof=await f.rpc('tasks.stop',{runId:'foreign-run'},'spoof');assert.equal(spoof.ok,false);assert.equal(f.stops.length,0);
});
test('fixed Task public dispatch can cancel before its start reply without replacing iframe',async t=>{
  const gate=deferred(),f=await delegationHostFixture(t,{startGate:gate});
  f.ask('tasks.start',{task:delegatedInstall,clientRequestId:'pending-client',params:{}},'start');
  await settle(()=>f.calls.length===1);
  const stop=await f.rpc('tasks.stop',{clientRequestId:'pending-client'},'stop');assert.equal(stop.ok,true);
  assert.equal(stop.result.state,'stopping');assert.equal(f.cancels.length,1);gate.resolve();
  await settle(()=>f.frame.contentWindow.sent.some(row=>row.requestId==='start'));
  assert.equal(f.frame.contentWindow.sent.find(row=>row.requestId==='start').ok,false);
  assert.equal(f.elements['sidebar-tool-frame'].children[0],f.frame);
  assert.ok(f.stops.some(row=>row.runId==='original-run'));
});
test('fixed Task public dispatch refuses cached results after App generation changes',async t=>{
  const f=await delegationHostFixture(t);
  await f.rpc('tasks.start',{task:delegatedInstall,clientRequestId:'original-client',params:{}},'start');
  const first=await f.rpc('tasks.read',{clientRequestId:'original-client'},'first');assert.equal(first.ok,true);
  f.store.set(TOOL_REVOCATION_EPOCHS_STORE,{[f.tool.id]:'new-app-epoch'});
  const stale=await f.rpc('tasks.read',{clientRequestId:'original-client'},'stale');assert.equal(stale.ok,false);
  assert.equal(stale.result,undefined);
});
test('fixed Task local installation review shows approved ID, version and both hashes',async t=>{
  const f=await delegationHostFixture(t);f.host.closeTool();
  f.emit(f.elements['sidebar-tool-import-trigger'],'click');
  const next={...f.tool,version:'1.0.1'},text=JSON.stringify(next);
  f.selectFile({name:'delegation.json',size:Buffer.byteLength(text),text:async()=>text});
  await settle(()=>f.elements['sidebar-tool-preview'].hidden===false);
  const review=f.elements['sidebar-tool-preview-description'].textContent;
  for(const value of [delegatedPin.taskId,delegatedPin.version,delegatedPin.manifestHash,delegatedPin.contentHash])assert.ok(review.includes(value));
});

// Joint queue review: exercise the real Host actions and Tool installer. Only
// Chrome permissions and the Page Authority transport are component doubles.
async function queueReviewFixture(t,{mode='success',existingTool=false}={}){
  const tool=await officialToolFixture('ai-send-queue');
  const release=(await officialFixtures()).catalog.apps.find(row=>row.toolId===tool.id);
  const pkg=JSON.parse(await readFile(new URL('../../examples/sidebar-tools/ai-send-queue/ai-send-queue.opendesk-page.json',import.meta.url),'utf8'));
  const calls=[],store=new Map([[SIDEBAR_TOOL_STORE,existingTool?[tool]:[]]]);
  let pages=[],granted=false,toolWritten=false,inClick=false,toolAttempted=false;
  const pendingRead=deferred(),readEntered=deferred();
  const receipt={programId:pkg.programId,version:pkg.version,revision:pkg.revision,sourceHash:pkg.sourceHash,
    manifestHash:'a'.repeat(64),pageRules:pkg.pageRules,enabled:true,nativeState:'registered',
    authorization:{installationId:'queue-component-install',generation:1,status:'active'}};
  if(mode==='page-cleanup-unknown')receipt.managedCleanup={state:'unknown',scope:'managed-ui-only'};
  if(mode==='page-blocked'){
    receipt.nativeState='blocked';receipt.error={code:'E_NATIVE',message:'原生注册失败'};
  }
  const f=await hostFixture(t,{store,startTool:false,
    chromePermissions:{contains:async()=>granted,request(request){
      assert.equal(inClick,true,'permission request must start synchronously inside the trusted click');
      assert.deepEqual(request,{origins:['https://chatgpt.com/*']});calls.push('permission');
      granted=mode!=='permission-denied';return Promise.resolve(granted);
    }},
    getHook(key){if(key===SIDEBAR_TOOL_STORE&&toolWritten){
      calls.push('tool-readback');
      if(mode==='tool-unknown')throw new Error('tool readback unavailable');
    }
      if(key===CAPTURE_SITE_STORE&&toolWritten&&mode==='tool-refresh')throw new Error('capture list unavailable');
    },
    setHook(values){if(values[SIDEBAR_TOOL_STORE]){
      calls.push('tool-write');
      toolAttempted=true;
      if(mode==='tool-failure'||mode==='tool-failure-pending')throw new Error('disk full');
      toolWritten=true;
    }},
    foundationClient:{async request(operation,args){
      if(operation==='listPagePrograms'){
        calls.push('page-readback');
        if(mode==='review-pending'||(mode==='tool-failure-pending'&&toolAttempted)){
          readEntered.resolve();await pendingRead.promise;
        }
        if(mode==='final-page-race'&&toolWritten)return {catalog:[],installed:[{...receipt,authorization:{...receipt.authorization,generation:2}}]};
        if(mode==='final-page-cleanup-unknown'&&toolWritten)
          return {catalog:[],installed:[{...receipt,managedCleanup:{state:'unknown',scope:'managed-ui-only'}}]};
        return {catalog:[],installed:structuredClone(pages)};
      }
      assert.equal(operation,'importPageInstallPackage');calls.push('page-import');
      assert.deepEqual(args,{package:pkg,expectedInstalledManifestHash:null,expectedGeneration:null});
      if(mode==='page-unknown')throw Object.assign(new Error('Page result unknown'),{code:'E_EFFECT_UNKNOWN'});
      if(mode!=='page-missing')pages=[receipt];
      if(mode==='tool-race')store.set(SIDEBAR_TOOL_STORE,[{...tool,version:'9.0.0'}]);
      return structuredClone(receipt);
    }}});
  const review=async(value=pkg,selectedRelease=release)=>{
    assert.equal(f.host.openSendQueueProductReview(value,selectedRelease),true);
    await settle(()=>f.elements['sidebar-tool-install'].textContent==='确认联合安装 / 更新'||
      Boolean(f.elements['sidebar-tool-file-error'].textContent));
  };
  const click=(event={isTrusted:true})=>{
    inClick=true;
    try{f.emit(f.elements['sidebar-tool-install'],'click',event);}finally{inClick=false;}
  };
  return {...f,tool,pkg,release,calls,review,click,pendingRead,readEntered,status:f.elements['page-install-import-status']};
}

test('queue joint review: Page review must finish before either installer can run',async t=>{
  const f=await queueReviewFixture(t,{mode:'review-pending'});
  f.host.openSendQueueProductReview(f.pkg,f.release);
  await f.readEntered.promise;
  assert.equal(f.elements['sidebar-tool-install'].disabled,true);
  f.click();await pause();
  assert.equal(f.calls.includes('tool-write'),false);
  assert.equal(f.calls.includes('page-import'),false);
  f.pendingRead.resolve();
  await settle(()=>f.elements['sidebar-tool-install'].textContent==='确认联合安装 / 更新');
  assert.equal(f.elements['sidebar-tool-install'].disabled,false);
});

test('queue joint review: failed Tool write keeps approval consumed throughout asynchronous readback',async t=>{
  const f=await queueReviewFixture(t,{mode:'tool-failure-pending'});await f.review();f.click();
  await f.readEntered.promise;
  assert.equal(f.elements['sidebar-tool-install'].disabled,true);
  f.click();await pause();await pause();
  assert.equal(f.calls.filter(c=>c==='page-import').length,1);
  assert.equal(f.calls.filter(c=>c==='tool-write').length,1);
  f.pendingRead.resolve();
  await settle(()=>f.status.attributes['data-state']==='pending-review');
  assert.equal(f.elements['sidebar-tool-install'].disabled,true);
});

test('queue joint review: one synchronous confirmation installs Page then Tool and reads both back',async t=>{
  const f=await queueReviewFixture(t);await f.review();
  assert.equal(f.calls.includes('page-import'),false);
  f.click();f.click();
  await settle(()=>f.elements['sidebar-tool-import'].hidden||f.status.attributes['data-state']==='pending-review');
  assert.match(f.elements['sidebar-tool-status'].textContent,/联合安装记录已读回/);
  assert.equal(f.host.hasInstallReview(),false);
  assert.deepEqual(f.store.get(SIDEBAR_TOOL_STORE),[f.tool]);
  assert.equal(f.calls.filter(c=>c==='permission').length,1);
  assert.equal(f.calls.filter(c=>c==='page-import').length,1);
  assert.equal(f.calls.filter(c=>c==='tool-write').length,1);
  const permission=f.calls.indexOf('permission'),page=f.calls.indexOf('page-import'),tool=f.calls.indexOf('tool-write');
  assert.ok(permission<page&&page<tool);
  assert.ok(f.calls.slice(page+1,tool).includes('page-readback'));
  assert.ok(f.calls.slice(tool+1).includes('tool-readback'));
  assert.equal(f.calls.at(-1),'page-readback');
});

test('queue joint review: identical installed Tool is read without rewriting it',async t=>{
  const f=await queueReviewFixture(t,{existingTool:true});await f.review();f.click();
  await settle(()=>!f.host.hasInstallReview());
  assert.match(f.elements['sidebar-tool-status'].textContent,/联合安装记录已读回/);
  assert.deepEqual(f.store.get(SIDEBAR_TOOL_STORE),[f.tool]);
  assert.equal(f.calls.includes('tool-write'),false);
  assert.equal(f.calls.filter(c=>c==='page-import').length,1);
});

for(const mode of ['page-unknown','page-missing','page-cleanup-unknown','page-blocked',
  'tool-failure','tool-unknown','tool-refresh','tool-race','final-page-race','final-page-cleanup-unknown'])
  test('queue joint review: '+mode+' preserves partial state and cannot replay approval',async t=>{
    const f=await queueReviewFixture(t,{mode});await f.review();f.click();
    await settle(()=>f.status.attributes['data-state']==='pending-review');
    assert.match(f.status.textContent,/联合安装部分完成或结果未知/);
    assert.equal(f.status.hidden,false);
    assert.equal(f.elements['sidebar-tool-install'].disabled,true);
    const codes={'page-unknown':'E_EFFECT_UNKNOWN','page-missing':'E_PAGE_INSTALL_READBACK',
      'page-cleanup-unknown':'E_PAGE_INSTALL_PENDING','page-blocked':'E_PAGE_INSTALL_PENDING',
      'tool-failure':'E_HOST_STORAGE_QUOTA','tool-unknown':'E_OUTCOME_UNKNOWN',
      'tool-refresh':'E_PAGE_INSTALL','tool-race':'E_TOOL_CHANGED','final-page-race':'E_QUEUE_PARTIAL',
      'final-page-cleanup-unknown':'E_PAGE_INSTALL_PENDING'};
    assert.ok(f.status.textContent.includes(codes[mode]),f.status.textContent);
    assert.doesNotMatch(f.elements['sidebar-tool-status'].textContent,/联合安装记录已读回/);
    if(mode.startsWith('page-'))assert.equal(f.calls.includes('tool-write'),false);
    const imports=f.calls.filter(c=>c==='page-import').length,writes=f.calls.filter(c=>c==='tool-write').length;
    f.click();await pause();await pause();
    assert.equal(f.calls.filter(c=>c==='page-import').length,imports);
    assert.equal(f.calls.filter(c=>c==='tool-write').length,writes);
  });

test('queue joint review: denied permission and synthetic click cannot reach either installer',async t=>{
  const f=await queueReviewFixture(t,{mode:'permission-denied'});await f.review();
  f.click({isTrusted:false});await settle(()=>f.status.attributes['data-state']==='pending-review');
  assert.deepEqual(f.calls.filter(c=>c!=='page-readback'),[]);
  await f.review();f.click();await settle(()=>f.status.attributes['data-state']==='permission-denied');
  assert.deepEqual(f.calls.filter(c=>c!=='page-readback'),['permission']);
  assert.deepEqual(f.store.get(SIDEBAR_TOOL_STORE),[]);
});

test('queue joint review: parallel Tool change before confirmation invalidates the reviewed baseline',async t=>{
  const f=await queueReviewFixture(t);await f.review();
  f.store.set(SIDEBAR_TOOL_STORE,[{...f.tool,version:'9.0.0'}]);f.click();
  await settle(()=>f.status.attributes['data-state']==='pending-review');
  assert.match(f.status.textContent,/E_TOOL_CHANGED/);
  assert.equal(f.calls.includes('page-import'),false);assert.equal(f.calls.includes('tool-write'),false);
  assert.equal(f.store.get(SIDEBAR_TOOL_STORE)[0].version,'9.0.0');
});

test('queue joint review: fixed Page and Tool hashes reject mismatched candidates',async t=>{
  const f=await queueReviewFixture(t);
  await f.review({...f.pkg,packageHash:'0'.repeat(64)});
  assert.equal(f.elements['sidebar-tool-install'].disabled,true);
  assert.ok(f.elements['sidebar-tool-file-error'].textContent);
  await f.review(f.pkg,{...f.release,sha256:'0'.repeat(64)});
  assert.equal(f.elements['sidebar-tool-install'].disabled,true);
  assert.ok(f.elements['sidebar-tool-file-error'].textContent);
  assert.equal(f.calls.includes('page-import'),false);assert.equal(f.calls.includes('tool-write'),false);
});

test('queue joint review: closing the review invalidates its previous confirmation',async t=>{
  const f=await queueReviewFixture(t);await f.review();
  f.emit(f.elements['sidebar-tool-import-close'],'click',{isTrusted:true});
  assert.equal(f.host.hasInstallReview(),false);
  f.click();await pause();await pause();
  assert.equal(f.calls.includes('permission'),false);
  assert.equal(f.calls.includes('page-import'),false);assert.equal(f.calls.includes('tool-write'),false);
  f.host.dispose();
  assert.throws(()=>f.host.openSendQueueProductReview(f.pkg,f.release),/E_SIDEBAR_TOOL_VIEW_DISPOSED/);
});
