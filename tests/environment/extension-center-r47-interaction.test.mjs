import {renderSidebarFixture} from '../helpers/sidebar-react-fixture.mjs';
import {createExtensionCenterDOM} from '../helpers/extension-center-react-dom.mjs';
import {parseHTML} from 'linkedom';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createExtensionCenter} from '../../src/ui/extension-center.js';
import {SIDEBAR_TOOL_FORMAT,SIDEBAR_TOOL_STORE} from '../../src/ui/sidebar-tools/package.js';
import {SIDEBAR_TOOL_ENABLE_STORE} from '../../src/ui/sidebar-tools/lifecycle.js';
import {TOOL_CLEANUP_STORE} from '../../src/ui/sidebar-tools/installation.js';

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

function fixture(t,{disabled=false,readError=false,installedRows=[app],cleanupRows=null}={}){
  const {doc,adapter,state}=createExtensionCenterDOM(t);
  const nodes=new Proxy({}, {get:(_,id)=>doc.getElementById(id)});
  const store=new Map([[SIDEBAR_TOOL_STORE,structuredClone(installedRows)],
    [SIDEBAR_TOOL_ENABLE_STORE,{[app.id]:!disabled}]]);
  if(cleanupRows)store.set(TOOL_CLEANUP_STORE,structuredClone(cleanupRows));
  let corrupt=readError,programs=[page()],failPages=false,allowed=true,pageAckOnly=false;
  let pageCandidates=null,pageUninstallMode='success';
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
      }}
    }
  };
  const client={async request(name,args){
    if(name==='listPagePrograms'){
      if(failPages)throw Error('Page authority disconnected');
      return {catalog:pageCandidates??programs,
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
    return {enabled:args.enabled};
  }};
  const sidebarTools={
    openTool(id){invocations.push(['open',id]);return true;},
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
  const ui=createExtensionCenter({api,client,doc,sidebarTools,taskWorkbench,extensionList:adapter});
  t.after(()=>ui.dispose());
  const list=nodes['extension-center-list'];
  const buttons=key=>[...list.querySelectorAll('button[data-extension-key]')].filter(node=>node.dataset.extensionKey===key);
  const button=(key,action)=>buttons(key).find(node=>node.dataset.extensionAction===action);
  const rowMenu=()=>doc.getElementById('extension-center-row-menu');
  const menuItem=text=>rowMenu()?.children.find(node=>node.textContent.includes(text));
  return {doc,nodes,ui,state,store,sidebarTools,invocations,writes,uninstalls,list,button,buttons,rowMenu,menuItem,programs,
    setCorrupt:value=>{corrupt=value;},setFailPages:value=>{failPages=value;},
    setPageCatalog:value=>{pageCandidates=value;},setPageUninstallMode:value=>{pageUninstallMode=value;},
    setPageAckOnly:value=>{pageAckOnly=value;},
    setAllowed:value=>{allowed=value;},emitStorage:()=>{
      for(const cb of changes)cb({[SIDEBAR_TOOL_ENABLE_STORE]:{oldValue:null,newValue:{}}},'local');
    }};
}

function openMenuUninstall(f,key){
  const trigger=f.button(key,'more');
  assert.ok(trigger,'Installed extension needs a management entry');
  trigger.dispatch('click');
  const uninstall=f.menuItem('卸载…');
  assert.ok(uninstall,'Uninstall must live inside the overflow menu');
  uninstall.dispatch('click');
  return trigger;
}

test('R5.11 each row has one main target and only an overflow secondary control',async t=>{
  const f=fixture(t);
  await f.ui.refresh();
  const appButtons=f.buttons('app:quick-notes');
  assert.deepEqual(appButtons.map(n=>n.dataset.extensionAction),['main','more']);
  f.button('app:quick-notes','main').dispatch('click');
  assert.deepEqual(f.invocations.filter(x=>x[0]==='open'),[['open','quick-notes']]);
  const pageButtons=f.buttons('page:reader');
  assert.deepEqual(pageButtons.map(n=>n.dataset.extensionAction),['main','more']);
  assert.equal(f.button('page:reader','primary'),undefined);
  f.button('page:reader','main').dispatch('click');
  assert.equal(f.nodes['extension-center-detail'].hidden,false,'Page row opens detail, not code');
  assert.equal(f.invocations.some(x=>x[0]==='navigate'),false);
  f.nodes['extension-center-back'].dispatch('click');
  assert.equal(f.nodes['extension-center-detail'].hidden,true);
  assert.equal(f.doc.activeElement.dataset.extensionAction,'main','Back restores the origin row');
});

test('R4.7 stopped app has no fake Settings main; overflow enable uses the sole trusted host route',async t=>{
  const f=fixture(t,{disabled:true});await f.ui.refresh();
  assert.deepEqual(f.buttons('app:quick-notes').map(n=>n.dataset.extensionAction),['main','more']);
  const row=f.list.children.find(node=>node.dataset.extensionId==='app:quick-notes');
  assert.match(row.children[0].textContent,/已停用/);
  f.button('app:quick-notes','main').dispatch('click');
  assert.equal(f.nodes['extension-center-detail'].hidden,false,'disabled row only navigates');
  assert.equal(f.invocations.length,0,'row must neither enable nor open settings implicitly');
  f.nodes['extension-center-back'].dispatch('click');
  f.button('app:quick-notes','more').dispatch('click');
  assert.equal(f.rowMenu().hidden,false);
  assert.ok(f.menuItem('启用应用'));
  f.menuItem('启用应用').dispatch('click');
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
  await settle(()=>f.nodes['extension-center-status'].textContent.includes('已从 Page Authority 回执'));
  assert.equal(f.programs.length,0);
  assert.equal(f.button('page:reader','main'),undefined);
  assert.deepEqual(f.writes,[],'uninstall never toggles an unrelated grant');
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
    assert.doesNotMatch(f.nodes['extension-center-status'].textContent,/已从 Page Authority 回执/);
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
  assert.ok(f.menuItem('停用自动运行'));
  f.doc.dispatch('keydown',{key:'End'});
  assert.match(f.doc.activeElement.textContent,/卸载…/,'End moves to the last (destructive) menu item');
  assert.ok(f.menuItem('查看详情'),'the detail item is retained in the menu');
  f.doc.dispatch('keydown',{key:'Home'});
  assert.match(f.doc.activeElement.textContent,/停用自动运行/);
  const esc=f.doc.dispatch('keydown',{key:'Escape'});
  assert.equal(esc.prevented,true);
  assert.equal(f.rowMenu(),null);
  assert.equal(f.doc.activeElement,more);
  more.dispatch('click');
  f.menuItem('停用自动运行').dispatch('click');
  await settle(()=>f.writes.length===1);
  assert.deepEqual(f.writes[0],{programId:'reader',manifestHash:'a'.repeat(64),
    installationId:'original-installation',enabled:false,expectedGeneration:5});
  await settle(()=>f.menuItem('停用自动运行')===undefined);
  assert.equal(f.programs[0].installed.enabled,false);
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
  f.menuItem('查看详情').focus();
  const tab=f.doc.dispatch('keydown',{key:'Tab'});
  assert.equal(tab.prevented,undefined,'Native Tab traversal must remain available');
  assert.equal(f.rowMenu(),null);
  assert.equal(f.doc.activeElement,more,'Focus returns to live trigger before native Tab');
});


test('R5.6 suspended Page offers direct restoration but cannot claim native success before readback',async t=>{
  const f=fixture(t);f.programs[0].installed.authorization.status='suspended';
  f.programs[0].installed.nativeState='blocked';await f.ui.refresh();
  f.button('page:reader','more').dispatch('click');
  const restore=f.menuItem('恢复自动运行');
  assert.ok(restore,'suspended installed Page must offer Restore, not Disable');
  restore.dispatch('click');
  await settle(()=>f.writes.length===1);
  await settle(()=>f.button('page:reader','more')?.disabled===false);
  assert.deepEqual(f.writes[0],{
    programId:'reader',manifestHash:'a'.repeat(64),installationId:'original-installation',enabled:true,expectedGeneration:5
  });
  assert.equal(f.nodes['extension-center-status'].dataset.state,'info',
    'a still-blocked native registration must not be called a successful restore');
  assert.match(f.nodes['extension-center-status'].textContent,/原生注册状态仍待核对/);
});

test('R5.6 suspended Page with missing Chrome permission cannot change the installed generation',async t=>{
  const f=fixture(t);f.programs[0].installed.authorization.status='suspended';
  await f.ui.refresh();f.setAllowed(false);
  f.button('page:reader','more').dispatch('click');
  const restore=f.menuItem('恢复自动运行');assert.ok(restore);
  restore.dispatch('click');
  await settle(()=>f.nodes['extension-center-status'].textContent.includes('E_PERMISSION'));
  assert.equal(f.writes.length,0);
  assert.equal(f.programs[0].installed.authorization.generation,5);
});

test('R4.7 missing Page grant forbids enable; unreadable app status never fabricates primary or toggle',async t=>{
  const f=fixture(t);await f.ui.refresh();
  // First turn Page off through its installed authority.
  f.button('page:reader','more').dispatch('click');f.menuItem('停用自动运行').dispatch('click');
  await settle(()=>f.programs[0].installed.enabled===false);
  await settle(()=>f.button('page:reader','more')?.disabled===false);
  await f.ui.refresh();f.setAllowed(false);
  const pageMore=f.button('page:reader','more');
  assert.ok(pageMore,'Page menu trigger must survive authority refresh');
  pageMore.dispatch('click');
  const enable=f.menuItem('启用自动运行');
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

test('R5.0 uninstall from a second window retires installed details, search and old row actions',async t=>{
  const f=fixture(t);await f.ui.refresh();
  f.button('app:quick-notes','more').dispatch('click');
  f.menuItem('查看详情').dispatch('click');
  assert.equal(f.nodes['extension-center-detail'].hidden,false);
  // Independent storage authority removes the installed package.
  f.store.set(SIDEBAR_TOOL_STORE,[]);
  await f.ui.refresh();
  assert.equal(f.nodes['extension-center-detail'].hidden,true);
  assert.equal(f.button('app:quick-notes','main'),undefined);
  assert.equal(f.doc.activeElement,f.nodes['extension-center-search']);
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

test('R5.1 detail retires on same-ID package replacement or Page revision change',async t=>{
  const f=fixture(t);await f.ui.refresh();
  f.button('app:quick-notes','more').dispatch('click');
  f.menuItem('查看详情').dispatch('click');
  assert.equal(f.nodes['extension-center-detail'].hidden,false);
  // Same tool ID and version are NOT the same approved bytes.
  f.store.set(SIDEBAR_TOOL_STORE,[{...app,html:'<main>Replaced outside this window</main>'}]);
  await f.ui.refresh();
  assert.equal(f.nodes['extension-center-detail'].hidden,true,
    'old settings/detail actions must not silently follow a replaced fixed package');
  assert.match(f.nodes['extension-center-status'].textContent,/固定身份已变化/);
  assert.deepEqual(f.invocations.filter(row=>row[0]==='settings'),[]);

  f.button('page:reader','more').dispatch('click');
  f.menuItem('查看详情').dispatch('click');
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
  const malformed={'cookie-editor':{version:'garbled-version',createdAt:1}};
  const f=fixture(t,{installedRows:[],cleanupRows:malformed});
  await f.ui.refresh();
  assert.equal(f.nodes['extension-center-count'].textContent,'部分安装状态待核对');
  assert.equal(f.nodes['extension-center-status'].dataset.state,'error');
  assert.match(f.nodes['extension-center-status'].textContent,/卸载恢复记录损坏/);
  assert.equal(f.button('app:cookie-editor','main'),undefined);
  f.nodes['extension-center-menu'].querySelector('button[data-ec-scope="available"]').dispatch('click');
  assert.equal(f.nodes['extension-center-cleanups'].hidden,true,
    'malformed journal cannot show a fake successful recovery control');
  assert.equal(f.list.children.length,0,
    'unknown installation authority cannot advertise a runnable or installable candidate');
  assert.deepEqual(f.store.get(TOOL_CLEANUP_STORE),malformed);
});

test('R4.7 context menu closes on outside click/scroll and never stays outside viewport',async t=>{
  const f=fixture(t);await f.ui.refresh();
  const more=f.button('app:quick-notes','more');
  more.dispatch('click');
  assert.ok(Number.parseInt(f.rowMenu().style.left,10)>=8);
  assert.ok(Number.parseInt(f.rowMenu().style.top,10)>=8);
  assert.ok(Number.parseInt(f.rowMenu().style.top,10)<640);
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
  const oldAction=f.menuItem('启用应用');
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


test('R4.7 menu detail Back restores the menu origin independent of pointer focus',async t=>{
  const f=fixture(t);await f.ui.refresh();
  const more=f.button('page:reader','more');
  more.dispatch('click');
  const detail=f.menuItem('查看详情');
  f.doc.activeElement=f.nodes['extension-center-search'];
  detail.dispatch('click');
  assert.equal(f.nodes['extension-center-detail'].hidden,false);
  f.nodes['extension-center-back'].dispatch('click');
  assert.equal(f.doc.activeElement.dataset.extensionKey,'page:reader');
  assert.equal(f.doc.activeElement.dataset.extensionAction,'more');
});


test('R4.8 app detail matches the R4.7 preview: no duplicate Open and visible stopped status',async t=>{
  const enabled=fixture(t);await enabled.ui.refresh();
  enabled.button('app:quick-notes','more').dispatch('click');
  enabled.menuItem('查看详情').dispatch('click');
  assert.equal(enabled.nodes['extension-center-detail'].hidden,false);
  const enabledActions=[...enabled.nodes['extension-center-detail-body'].querySelectorAll('button')]
    .map(button=>button.getAttribute('aria-label')?.replace(/「.*$/,'')||button.textContent);
  assert.deepEqual(enabledActions,['设置与权限'],
    'the verified primary Open belongs on the list, not duplicated inside Details');
  assert.equal(enabled.nodes['extension-center-detail-body'].textContent.includes('已停用'),false);
  assert.match(enabled.nodes['extension-center-detail-body'].textContent,/应用已安装，可按需打开界面/);

  const disabled=fixture(t,{disabled:true});await disabled.ui.refresh();
  disabled.button('app:quick-notes','main').dispatch('click');
  assert.equal(disabled.nodes['extension-center-detail'].hidden,false);
  assert.match(disabled.nodes['extension-center-detail-body'].textContent,/已停用 · 记录内容/,
    'detail introduction preserves the same stopped-state message as the list and preview');
  assert.match(disabled.nodes['extension-center-detail-body'].textContent,/应用已停用；可在设置与权限中恢复/);
  assert.doesNotMatch(disabled.nodes['extension-center-detail-body'].textContent,/可按需打开界面/,
    'a stopped app must not describe itself as available to open');
  assert.deepEqual([...disabled.nodes['extension-center-detail-body'].querySelectorAll('button')]
    .map(button=>button.getAttribute('aria-label')?.replace(/「.*$/,'')||button.textContent),['设置与权限']);
});

test('R4.8 first paint reports loading instead of a misleading empty or install state',async t=>{
  const f=fixture(t);
  assert.match(f.nodes['extension-center-status'].textContent,/正在读取已安装扩展/);
  assert.equal(f.nodes['extension-center-status'].dataset.state,'loading');
  assert.equal(f.nodes['extension-center-empty'].hidden,true);
  assert.equal(f.nodes['extension-center-count'].textContent,'正在读取扩展…');
  await f.ui.refresh();
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

test('R5.14 detail actions use shared accessible IconButton without duplicate Open',async t=>{
  const f=fixture(t);await f.ui.refresh();
  f.button('page:reader','main').dispatch('click');
  const buttons=f.nodes['extension-center-detail-body'].querySelectorAll('button');
  assert.ok(buttons.every(x=>x.className.includes('od-icon-button')),
    'known detail actions use the existing shared IconButton');
  assert.ok(buttons.every(x=>x.getAttribute('aria-label')&&x.getAttribute('title')&&x.querySelector('svg')),
    'icon-only actions keep an accessible name, tooltip and visible glyph');
  assert.ok(buttons.every(x=>!String(x.getAttribute('aria-label')).includes('打开应用')));
  const css=await readFile('src/ui/extension-center.css','utf8');
  assert.doesNotMatch(css,/\.ec-detail-actions button\{[^}]*background:/);
  assert.match(css,/\.ec-detail-actions \.od-button\{font-size:12px;color:var\(--od-accent-ink\)\}/);
});

test('R4.9 rejected app toggle keeps an actionable error after the mandatory registry readback',async t=>{
  const f=fixture(t,{disabled:true});await f.ui.refresh();
  f.sidebarTools.toggleEnabled=()=>Promise.reject(Object.assign(
    new Error('用户取消了未保存草稿的启停操作'),{code:'E_DRAFT_CANCELLED'}));
  f.button('app:quick-notes','more').dispatch('click');
  f.menuItem('启用应用').dispatch('click');
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
  f.menuItem('启用自动运行').dispatch('click');
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
    const next=element.nextElementSibling;
    assert.equal(next?.matches('input[type="file"][hidden]')?next.nextElementSibling:next,host,
      'only the hidden file picker may separate the toolbar from its import host');
    return element.outerHTML;
  };
  const formal=toolbar(html,'extension-center-import-host');
  const demo=toolbar(preview,'preview-import-host');
  // Preserve the reviewed historical reference; the current React preview
  // has its own source-bound generator and check. Product copy may advance.
  // The historical preview predates the shared locale manager and its R6.10
  // move into More. Its locale control is not the current manager contract.
  const controls=source=>[...source.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1])
    .filter(id=>!['extension-center-language','extension-center-language-settings'].includes(id)).sort();
  assert.deepEqual(controls(demo.replaceAll('preview-','extension-center-')),controls(formal));
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
  assert.match(preview,/cookie\.version='2\.0\.6';cookie\.update=true;cookie\.releaseVersion='2\.0\.11'/);
  assert.match(preview,/function simulateUpdate\(row\)/);
  assert.match(preview,/确认模拟原位更新/);
  assert.match(preview,/不会自动运行新版代码/);
});

test('R5.0 Host false leaves a disabled App unchanged and reports unfinished draft confirmation',async t=>{
  const f=fixture(t,{disabled:true});await f.ui.refresh();
  f.sidebarTools.toggleEnabled=()=>false;
  f.button('app:quick-notes','more').dispatch('click');
  f.menuItem('启用应用').dispatch('click');
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
  f.menuItem('启用应用').dispatch('click');
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
  f.menuItem('启用应用').dispatch('click');
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
  const f=fixture(t);f.programs[0].installed.nativeState='blocked';await f.ui.refresh();
  f.button('page:reader','more').dispatch('click');
  f.menuItem('停用自动运行').dispatch('click');
  await settle(()=>f.writes.length===1);
  await settle(()=>f.button('page:reader','more')?.disabled===false);
  assert.equal(f.programs[0].installed.enabled,false);
  assert.equal(f.programs[0].installed.nativeState,'blocked');
  assert.equal(f.nodes['extension-center-status'].dataset.state,'info');
  assert.match(f.nodes['extension-center-status'].textContent,/原生注销或受管清理仍待核对/);
});

test('R5.6 unknown managed UI cleanup cannot be reported as completed after disabling',async t=>{
  const f=fixture(t);f.programs[0].installed.managedCleanup={scope:'managed-ui-only',state:'unknown'};
  await f.ui.refresh();
  f.button('page:reader','more').dispatch('click');
  f.menuItem('停用自动运行').dispatch('click');
  await settle(()=>f.writes.length===1);
  await settle(()=>f.button('page:reader','more')?.disabled===false);
  assert.equal(f.programs[0].installed.nativeState,'disabled');
  assert.equal(f.programs[0].installed.managedCleanup.state,'unknown');
  assert.equal(f.nodes['extension-center-status'].dataset.state,'info');
  assert.match(f.nodes['extension-center-status'].textContent,/原生注销或受管清理仍待核对/);
});

test('R5.0 Page RPC acknowledgement without Authority state change cannot be reported successful',async t=>{
  const f=fixture(t);await f.ui.refresh();f.setPageAckOnly(true);
  f.button('page:reader','more').dispatch('click');
  f.menuItem('停用自动运行').dispatch('click');
  await settle(()=>f.button('page:reader','more')?.disabled===false);
  assert.equal(f.writes.length,1);
  assert.equal(f.programs[0].installed.enabled,true,'the real record was not modified');
  assert.equal(f.nodes['extension-center-status'].dataset.state,'error');
  assert.match(f.nodes['extension-center-status'].textContent,/未由 Page Authority 读回确认/);
});

test('R5.0 Page enabled setting must not masquerade as a verified native registration',async t=>{
  const f=fixture(t);await f.ui.refresh();
  f.programs[0].installed.enabled=false;
  f.programs[0].installed.nativeState='pending';
  await f.ui.refresh();
  f.button('page:reader','more').dispatch('click');
  f.menuItem('启用自动运行').dispatch('click');
  await settle(()=>f.button('page:reader','more')?.disabled===false);
  assert.equal(f.programs[0].installed.enabled,true);
  assert.equal(f.nodes['extension-center-status'].dataset.state,'info');
  assert.match(f.nodes['extension-center-status'].textContent,/原生注册状态仍待核对/);
});

test('R5.0 official catalog stale responses and failures must be rejected by source guards',async()=>{
  const center=await readFile('src/ui/extension-center.js','utf8');
  assert.match(center,/const id=\+\+officialSequence/);
  assert.match(center,/id===officialSequence/);
  assert.match(center,/official=\[\];catalogError=/);
  assert.match(center,/dispose\(\)\{if\(disposed\)return;disposed=true;sequence\+\+;officialSequence\+\+;pageOfficialSequence\+\+;discoveryGeneration\+\+;discoveryChannelGeneration\+\+;\s*listUninstallReview=null;uninstallReview=null;closeRowMenu\(\)/,
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
  await settle(()=>f.state.toolbarModel?.countText!==undefined||f.list.children.length>0);
  // Let the asynchronous bundled-catalog read finish before entering details.
  await tick();await tick();
  f.button('page:'+row.programId,'main').dispatch('click');
  assert.ok(f.state.detailModel.pageControl.officialBlock,'the real catalog candidate is loaded');
  f.doc.querySelector('[data-ec-detail-action="uninstall"]').dispatch('click');
  f.doc.querySelector('.od-uninstall-confirm').dispatch('click');
  await settle(()=>f.uninstalls.length===1&&f.state.statusModel.text.includes('卸载'));
  assert.equal(f.programs.length,0);
  assert.equal(f.state.statusModel.state,'success');
  assert.match(f.state.statusModel.text,/持久安装列表确认卸载/);
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
  f.menuItem('启用应用').dispatch('click');
  await settle(()=>f.state.statusModel.state==='success');
  assert.match(f.state.statusModel.text,/本机安装记录确认应用启用/);
  await f.ui.refresh();
  assert.match(f.state.statusModel.text,/本机安装记录确认应用启用/,'same-view refresh retains current result');
  if(transition==='back')f.nodes['extension-center-back'].dispatch('click');
  else f.button('page:reader','main').dispatch('click');
  assert.doesNotMatch(f.state.statusModel.text,/本机安装记录确认应用启用/,'old action cannot describe another view');
  assert.notEqual(f.state.statusModel.state,'success');
  if(transition==='back')f.button('page:reader','main').dispatch('click');
  assert.equal(f.programs[0].installed.enabled,false);
  assert.equal(f.programs[0].installed.managedCleanup.state,'unknown');
  assert.equal(f.state.detailModel.pageControl.enabled,false);
  assert.match(f.state.detailModel.pageControl.status,/已停用.*清理待核对/);
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
  f.menuItem('启用应用').dispatch('click');
  await settle(()=>f.state.statusModel.state==='success');
  if(failure==='read'){f.setCorrupt(true);await f.ui.refresh();}
  else {release();await tick();await tick();}
  assert.equal(f.state.statusModel.state,'success','action still owns current receipt');
  if(transition==='back')f.nodes['extension-center-back'].dispatch('click');
  else f.button('page:reader','main').dispatch('click');
  assert.equal(f.state.statusModel.state,'error');
  assert.match(f.state.statusModel.text,failure==='read'?/读取失败/:new RegExp('R18 masked '+failure));
});
