import test from 'node:test';
import assert from 'node:assert/strict';
import {createExtensionCenter,SIDEBAR_LAST_EXTENSION_DETAIL_KEY as DETAIL_KEY} from '../../src/ui/extension-center.js';
import {SIDEBAR_TOOL_FORMAT,SIDEBAR_TOOL_STORE,sidebarToolPackageHash} from '../../src/ui/sidebar-tools/package.js';
import {MARKET_PROVENANCE_STORE} from '../../src/ui/sidebar-tools/installation.js';
import {SIDEBAR_TOOL_ENABLE_STORE} from '../../src/ui/sidebar-tools/lifecycle.js';
import {createExtensionCenterDOM} from '../helpers/extension-center-react-dom.mjs';
import {detailMemoryPreferenceKey} from '../../src/ui/sidebar-extension-detail-memory.js';

const app={format:SIDEBAR_TOOL_FORMAT,id:'quick-notes',title:'快速笔记',description:'记录内容',version:'1.0.0',
  capabilities:['storage.local'],html:'<main>Notes</main>',css:'',js:'void 0;'};
const appDetailRequest={marketId:'opendesk/'+app.id,id:app.id,version:app.version,sha256:await sidebarToolPackageHash(app)};
const page={programId:'reader',manifestHash:'a'.repeat(64),title:'阅读增强',revision:1,
  enabled:true,nativeState:'registered',pageRules:{matches:['https://example.com/*']},
  authorization:{status:'active',generation:1,installationId:'reader-install'}};
const deferred=()=>Promise.withResolvers();
const testLocks=()=>{
  let tail=Promise.resolve();
  return {request(_name,work){const next=tail.then(work);tail=next.catch(()=>{});return next;}};
};
// Model a pointer press on React Aria's label. A bare virtual click needs the
// browser's checkbox default, which linkedom does not implement. Synthetic
// trust is controller evidence, not a native Chrome gesture.
function toggleMemory(f,{keyboard=false,trusted=true}={}){
  const label=f.doc.querySelector('[data-ec-detail-action="detail-memory"]'),input=label.querySelector('input');
  if(input.disabled)return;
  if(keyboard){
    input.dispatch('keydown',{key:' ',code:'Space',isTrusted:trusted});
    input.dispatch('keyup',{key:' ',code:'Space',isTrusted:trusted});
    // linkedom has no checkbox activation default. Model only that default;
    // the real React input/change and trusted-event guards still handle it.
    input.checked=!input.checked;
    input._valueTracker?.setValue(String(!input.checked));
    input.dispatch('click',{button:0,detail:0,isTrusted:trusted});
    return;
  }
  const pointer={button:0,detail:1,pointerId:1,pointerType:'mouse',width:1,height:1,isTrusted:trusted};
  label.dispatch('pointerdown',pointer);
  label.dispatch('pointerup',pointer);
  label.dispatch('click',pointer);
}
const until=async predicate=>{
  for(let i=0;i<100&&!predicate();i++)await new Promise(resolve=>setTimeout(resolve,5));
  assert.ok(predicate(),'independent list source did not render while the other source was pending');
};

function fixture(t,{apps=Promise.resolve([app]),pages=Promise.resolve({installed:[page]}),
  preferences={},readDetail=()=>preferences[DETAIL_KEY],sidePanel=false,checkSidePanel=()=>sidePanel,tab='tools',
  marketApp=false,uninstallApp,uninstallPage,locks=testLocks(),
  readPreference=key=>preferences[key],writePreference=values=>Object.assign(preferences,values)}={}){
  const previousPointerEvent=globalThis.PointerEvent;
  const previousFocusEvent=globalThis.FocusEvent;
  globalThis.PointerEvent??=globalThis.Event;
  globalThis.FocusEvent??=globalThis.Event;
  t.after(()=>{
    if(previousPointerEvent)globalThis.PointerEvent=previousPointerEvent;else delete globalThis.PointerEvent;
    if(previousFocusEvent)globalThis.FocusEvent=previousFocusEvent;else delete globalThis.FocusEvent;
  });
  const f=createExtensionCenterDOM(t),opened=[],connections=new Set(),calls=[],notices=[],settings=[],changes=new Set();
  f.doc.documentElement.dataset.opendeskTab=tab;
  const api={runtime:{getURL:path=>'chrome-extension://fixture/'+path},storage:{
    local:{async get(keys){
      if(keys===DETAIL_KEY||Array.isArray(keys)&&keys.includes(DETAIL_KEY))
        return {[DETAIL_KEY]:await readDetail(),...(Array.isArray(keys)?Object.fromEntries(keys.filter(k=>k!==DETAIL_KEY).map(k=>[k,preferences[k]])):null)};
      if(typeof keys==='string')return {[keys]:await readPreference(keys)};
      if(Array.isArray(keys)&&!keys.includes(SIDEBAR_TOOL_STORE))return Object.fromEntries(keys.map(k=>[k,preferences[k]]));
      if(!Array.isArray(keys)||!keys.includes(SIDEBAR_TOOL_STORE))return {};
      return {[SIDEBAR_TOOL_STORE]:structuredClone(await (typeof apps==='function'?apps():apps)),[SIDEBAR_TOOL_ENABLE_STORE]:{},
        ...(marketApp?{[MARKET_PROVENANCE_STORE]:{[app.id]:appDetailRequest}}:{})};
    },async set(values){await writePreference(values);},async remove(key){delete preferences[key];}},
    onChanged:{addListener:fn=>changes.add(fn),removeListener:fn=>changes.delete(fn)}
  }};
  const client={request(name,payload){
    if(name==='uninstallPageProgram')return uninstallPage(payload);
    assert.equal(name,'listPagePrograms');calls.push(name);return typeof pages==='function'?pages():pages;
  },
    subscribeConnection(fn){connections.add(fn);return()=>connections.delete(fn);}};
  const ui=createExtensionCenter({api,client,doc:f.doc,extensionList:f.adapter,isSidePanel:checkSidePanel,lockManager:locks,
    notify:(message,options)=>notices.push({message,options}),
    sidebarTools:{openTool(id){opened.push(id);return true;},openSettings:id=>settings.push(id),uninstallFromList:uninstallApp},
    taskWorkbench:{navigate(){return true;}}});
  t.after(()=>ui.dispose());
  return {...f,ui,opened,calls,notices,settings,preferences,emitStorage:event=>{for(const fn of changes)fn(event,'local');},
    connect:(connected=true)=>{for(const fn of connections)fn({connected});},
    row:key=>f.doc.querySelector(`[data-extension-key="${key}"][data-extension-action="main"]`)};
}

test('an installed detail chosen during native identity verification is remembered only on a verified panel',async t=>{
  for(const native of [true,false]){
    await t.test(native?'native Side Panel':'full tab',async t=>{
      let panel;
      const f=fixture(t,{checkSidePanel:()=>panel});
      await until(()=>f.row('page:reader'));
      f.row('page:reader').dispatch('click');
      assert.equal(f.state.detailModel.title,page.title);
      assert.deepEqual(f.preferences,{},'pending identity does not authorize a write');
      panel=native;
      if(native)f.ui.onSidePanelVerified?.();
      await new Promise(resolve=>setImmediate(resolve));
      assert.deepEqual(f.preferences,native?{[DETAIL_KEY]:'page:reader'}:{});
      assert.deepEqual(f.opened,[]);
    });
  }
});

test('an explicit verified App detail persists only its key; a new panel restores it, and Back forgets it',async t=>{
  const preferences={};
  await t.test('accept the verified installed App detail request',async t=>{
    const f=fixture(t,{preferences,sidePanel:true,marketApp:true});
    assert.equal(await f.ui.openInstalledAppDetail(appDetailRequest),true);
    await until(()=>preferences[DETAIL_KEY]);
    assert.deepEqual(preferences,{[DETAIL_KEY]:'app:quick-notes'});
  });
  await t.test('reopen and go back',async t=>{
    const pages=deferred(),f=fixture(t,{preferences,sidePanel:true,pages:pages.promise});
    await f.ui.restoreLastDetail();
    await until(()=>f.state.view==='detail');
    assert.equal(f.state.detailModel.title,app.title);
    assert.equal(f.state.detailModel.confirmation,null);
    assert.deepEqual(f.opened,[],'restoring details must not launch the sidebar app');
    f.doc.getElementById('extension-center-back').dispatch('click');
    await until(()=>preferences[DETAIL_KEY]===null);
    assert.equal(f.state.view,'list');
    pages.resolve({installed:[page]});
  });
  await t.test('reopen after explicitly returning to the list',async t=>{
    const f=fixture(t,{preferences,sidePanel:true});
    await f.ui.restoreLastDetail();
    await until(()=>f.row('app:quick-notes'));
    assert.equal(f.doc.getElementById('extension-center-detail').hidden,true);
  });
});

test('a remembered Page detail waits for a verified installed row and does not need a second read',async t=>{
  const pages=deferred(),f=fixture(t,{preferences:{[DETAIL_KEY]:'page:reader'},sidePanel:true,pages:pages.promise});
  await f.ui.restoreLastDetail();
  await until(()=>f.row('app:quick-notes'));
  assert.equal(f.doc.getElementById('extension-center-detail').hidden,true);
  pages.resolve({installed:[page]});
  await until(()=>f.state.view==='detail');
  assert.equal(f.state.detailModel.title,page.title);
  assert.equal(f.calls.length,1);
});

test('a queued restore rechecks refreshed installation evidence before opening or forgetting',async t=>{
  for(const outcome of ['installed','removed','failed'])await t.test(outcome,async t=>{
    const locks=testLocks(),hold=deferred(),blocker=locks.request(DETAIL_KEY,()=>hold.promise);
    const preferences={[DETAIL_KEY]:'page:reader'};
    let pageRead=Promise.resolve({installed:[page]});
    const f=fixture(t,{sidePanel:true,locks,preferences,pages:()=>pageRead});
    await until(()=>f.row('page:reader'));await f.ui.restoreLastDetail();
    const late=deferred();pageRead=late.promise;const refresh=f.ui.refresh();
    hold.resolve();await blocker;await locks.request(DETAIL_KEY,()=>{});
    assert.equal(f.state.view??'list','list','pending evidence cannot open the cached row');
    assert.equal(preferences[DETAIL_KEY],'page:reader');
    if(outcome==='failed')late.reject(Error('Page unavailable'));
    else late.resolve({installed:outcome==='installed'?[page]:[]});
    await refresh;await locks.request(DETAIL_KEY,()=>{});
    if(outcome==='removed'){
      await until(()=>preferences[DETAIL_KEY]===null);
      assert.equal(f.state.view??'list','list');
      assert.equal(f.notices.filter(n=>n.message.includes('已无法恢复')).length,1);
    }else if(outcome==='installed')await until(()=>f.state.view==='detail');
    else{
      assert.equal(f.state.view??'list','list');assert.equal(preferences[DETAIL_KEY],'page:reader');
      pageRead=Promise.resolve({installed:[page]});await f.ui.refresh();
      await until(()=>f.state.view==='detail');
    }
  });
  await t.test('removed before acquiring the lock',async t=>{
    const locks=testLocks(),hold=deferred(),blocker=locks.request(DETAIL_KEY,()=>hold.promise);
    const preferences={[DETAIL_KEY]:'page:reader'};let installed=[page];
    const f=fixture(t,{sidePanel:true,locks,preferences,pages:async()=>({installed})});
    await until(()=>f.row('page:reader'));await f.ui.restoreLastDetail();
    installed=[];await f.ui.refresh();hold.resolve();await blocker;
    await until(()=>preferences[DETAIL_KEY]===null);
    assert.equal(f.state.view??'list','list');
    assert.equal(f.notices.filter(n=>n.message.includes('已无法恢复')).length,1);
  });
});

test('viewing a second installed detail replaces the first one without opening either extension',async t=>{
  const preferences={},otherPage={...page,programId:'other-reader',title:'另一项网页增强',manifestHash:'b'.repeat(64),
    authorization:{...page.authorization,installationId:'other-reader-install'}};
  const pages=Promise.resolve({installed:[page,otherPage]});
  await t.test('view the first Page, then return to the list and view the second Page',async t=>{
    const f=fixture(t,{preferences,pages,sidePanel:true});
    await until(()=>f.row('page:reader')&&f.row('page:other-reader'));
    f.row('page:reader').dispatch('click');
    await until(()=>preferences[DETAIL_KEY]==='page:reader');
    f.doc.getElementById('extension-center-back').dispatch('click');
    f.row('page:other-reader').dispatch('click');
    assert.equal(f.state.detailModel.title,otherPage.title);
    await until(()=>preferences[DETAIL_KEY]==='page:other-reader');
    assert.deepEqual(preferences,{[DETAIL_KEY]:'page:other-reader'});
    assert.deepEqual(f.opened,[]);
  });
  await t.test('reopen on the second Page detail home',async t=>{
    const f=fixture(t,{preferences,pages,sidePanel:true});
    await f.ui.restoreLastDetail();
    await until(()=>f.state.view==='detail');
    assert.equal(f.state.detailModel.title,otherPage.title);
    assert.equal(f.state.detailModel.confirmation,null);
    assert.deepEqual(f.opened,[]);
  });
});

test('a failed Page read preserves the preference until an authoritative absence clears it and notifies once',async t=>{
  const pages=deferred(),preferences={[DETAIL_KEY]:'page:removed'};
  let pageRead=pages.promise;
  const f=fixture(t,{preferences,sidePanel:true,pages:()=>pageRead});
  await f.ui.restoreLastDetail();
  await until(()=>f.row('app:quick-notes'));
  assert.equal(preferences[DETAIL_KEY],'page:removed');
  assert.deepEqual(f.notices,[]);
  pages.reject(Error('Page authority unavailable'));
  await until(()=>f.state.statusModel.text.includes('Page authority unavailable'));
  assert.equal(preferences[DETAIL_KEY],'page:removed');
  assert.deepEqual(f.notices,[]);
  pageRead=Promise.resolve({installed:[page]});
  await f.ui.refresh();
  await until(()=>f.notices.length===1);
  assert.equal(preferences[DETAIL_KEY],null);
  assert.equal(f.state.view??'list','list');
  assert.match(f.notices[0].message,/已无法恢复/);
  assert.equal(f.notices[0].options.type,'info');
  await f.ui.refresh();await f.ui.restoreLastDetail();
  assert.equal(f.notices.length,1);
});

test('malformed preference is forgotten; reopening with no preference is silent',async t=>{
  const preferences={[DETAIL_KEY]:'not-a-detail-id'};
  await t.test('with a malformed ID',async t=>{
    const f=fixture(t,{preferences,sidePanel:true});
    await f.ui.restoreLastDetail();
    await until(()=>f.notices.length===1);
    assert.equal(preferences[DETAIL_KEY],null);
    assert.equal(f.doc.getElementById('extension-center-detail').hidden,true);
  });
  await t.test('with no ID',async t=>{
    const f=fixture(t,{preferences,sidePanel:true});
    await f.ui.restoreLastDetail();
    assert.equal(f.doc.getElementById('extension-center-detail').hidden,true);
    assert.deepEqual(f.notices,[]);
  });
});

test('self storage notifications before invalidation completes preserve the single unavailable notice',async t=>{
  for(const saved of ['page:removed','not-a-detail-id'])await t.test(saved,async t=>{
    const preferences={[DETAIL_KEY]:saved};let f;
    f=fixture(t,{sidePanel:true,preferences,writePreference:async values=>{
      const changes=Object.fromEntries(Object.entries(values).map(([key,newValue])=>
        [key,{oldValue:preferences[key],newValue}]));
      Object.assign(preferences,values);f.emitStorage(changes);
    }});
    await f.ui.restoreLastDetail();
    await until(()=>f.notices.some(row=>row.message.includes('已无法恢复')));
    assert.equal(preferences[DETAIL_KEY],null);assert.equal(f.state.view??'list','list');
    await f.ui.refresh();await f.ui.restoreLastDetail();
    assert.equal(f.notices.filter(row=>row.message.includes('已无法恢复')).length,1);
  });
});

test('a stale invalid-ID read cannot erase a later saved detail',async t=>{
  const preferences={[DETAIL_KEY]:'app:removed'},saved=deferred();
  let reads=0;
  const f=fixture(t,{preferences,sidePanel:true,readDetail:()=>++reads===1?saved.promise:preferences[DETAIL_KEY]});
  const pending=f.ui.restoreLastDetail();
  await until(()=>f.row('app:quick-notes'));
  preferences[DETAIL_KEY]='page:reader';
  saved.resolve('app:removed');await pending;
  await until(()=>reads===2);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(preferences[DETAIL_KEY],'page:reader');
  assert.deepEqual(f.notices,[]);
});

test('opening App settings explicitly exits and forgets its detail',async t=>{
  const f=fixture(t,{preferences:{[DETAIL_KEY]:'app:quick-notes'},sidePanel:true});
  await f.ui.restoreLastDetail();
  await until(()=>f.state.view==='detail');
  f.doc.querySelector('[data-ec-detail-action="settings"]').dispatch('click');
  await until(()=>f.preferences[DETAIL_KEY]===null);
  assert.equal(f.state.view,'list');
  assert.deepEqual(f.settings,[app.id]);
});

test('confirmed uninstalls forget only the corresponding saved detail',async t=>{
  for(const kind of ['app','page']){
    const target=kind==='app'?'app:quick-notes':'page:reader';
    for(const saved of ['app:quick-notes','page:reader'])await t.test(kind+' with '+saved,async t=>{
      let apps=[app],pages=[page],attempts=0;
      const preferenceKey=detailMemoryPreferenceKey(target),otherKey=detailMemoryPreferenceKey(
        target.startsWith('app:')?'page:quick-notes':'app:reader');
      const f=fixture(t,{sidePanel:true,preferences:{[DETAIL_KEY]:saved,[preferenceKey]:false,[otherKey]:false},apps:()=>apps,pages:async()=>({installed:pages}),
        uninstallApp:async()=>{attempts++;apps=[];return true;},
        uninstallPage:async identity=>{attempts++;pages=[];return {...identity,uninstalled:true,nativeState:'unregistered'};}});
      await until(()=>f.row('app:quick-notes')&&f.row('page:reader'));
      f.state.rowsModel.onMore(target,f.row(target));
      f.state.rowMenuModel.items.find(item=>item.id==='uninstall').onClick({isTrusted:true});
      f.doc.querySelector('.od-uninstall-confirm').dispatch('click');
      await until(()=>attempts===1&&!f.state.rowsModel.pendingKey);
      if(saved===target)await until(()=>f.preferences[DETAIL_KEY]===null);
      else assert.equal(f.preferences[DETAIL_KEY],saved);
      await until(()=>!(preferenceKey in f.preferences));
      assert.equal(f.preferences[otherKey],false,'another type with the same ID retains its preference');
      assert.equal(f.row(target),null);
    });
  }
});

test('confirmed App uninstall cleans its preference despite an unrelated Page read failure',async t=>{
  let apps=[app],pageFails=false,attempts=0;
  const key='app:'+app.id,preference=detailMemoryPreferenceKey(key);
  const preferences={[DETAIL_KEY]:key,[preference]:false};
  const f=fixture(t,{sidePanel:true,preferences,apps:()=>apps,
    pages:async()=>{if(pageFails)throw Error('Page unavailable');return {installed:[page]};},
    uninstallApp:async()=>{attempts++;apps=[];pageFails=true;return true;}});
  await until(()=>f.row(key)&&f.row('page:reader'));
  f.state.rowsModel.onMore(key,f.row(key));
  f.state.rowMenuModel.items.find(item=>item.id==='uninstall').onClick({isTrusted:true});
  f.doc.querySelector('.od-uninstall-confirm').dispatch('click');
  await until(()=>attempts===1&&!f.state.rowsModel.pendingKey&&!(preference in preferences));
  assert.equal(preferences[DETAIL_KEY],null);assert.equal(f.row(key),null);
});

test('the full tab and other sidebar tabs do not read or apply the detail preference',async t=>{
  for(const options of [{sidePanel:false},{sidePanel:true,tab:'workflow'}]){
    await t.test(JSON.stringify(options),async t=>{
      let reads=0;
      const f=fixture(t,{...options,readDetail:()=>{reads++;return 'app:quick-notes';}});
      await f.ui.restoreLastDetail();
      await until(()=>f.row('app:quick-notes'));
      assert.equal(reads,0);
      assert.equal(f.doc.getElementById('extension-center-detail').hidden,true);
      if(!options.sidePanel){
        await until(()=>f.row('page:reader'));
        f.row('page:reader').dispatch('click');
        assert.equal(f.state.detailModel.title,page.title);
        await new Promise(resolve=>setImmediate(resolve));
        assert.deepEqual(f.preferences,{});
      }
    });
  }
});

test('an explicit verified App detail request wins over a pending preference read',async t=>{
  const saved=deferred(),preferences={[DETAIL_KEY]:'page:reader'};
  const f=fixture(t,{preferences,sidePanel:true,marketApp:true,readDetail:()=>saved.promise});
  const restore=f.ui.restoreLastDetail();
  await until(()=>f.row('app:quick-notes')&&f.row('page:reader'));
  assert.equal(await f.ui.openInstalledAppDetail(appDetailRequest),true);
  saved.resolve('page:reader');await restore;
  assert.equal(f.state.detailModel.title,app.title);
  assert.equal(preferences[DETAIL_KEY],'app:quick-notes');
});

test('selecting an installed Page wins over a pending preference read',async t=>{
  const saved=deferred(),preferences={[DETAIL_KEY]:'app:quick-notes'};
  const f=fixture(t,{preferences,sidePanel:true,readDetail:()=>saved.promise});
  const restore=f.ui.restoreLastDetail();
  await until(()=>f.row('page:reader'));
  f.row('page:reader').dispatch('click');
  saved.resolve('app:quick-notes');await restore;
  await until(()=>preferences[DETAIL_KEY]==='page:reader');
  assert.equal(f.state.detailModel.title,page.title);
  assert.deepEqual(f.opened,[]);
});

test('the detail switch opts out in place; reopening stays on the list and enabling waits for the next entry',async t=>{
  const preferences={};
  await t.test('default-on control and opt-out',async t=>{
    const f=fixture(t,{preferences,sidePanel:true});
    await until(()=>f.row('page:reader'));
    f.row('page:reader').dispatch('click');
    await until(()=>f.state.detailModel.detailMemory.known&&preferences[DETAIL_KEY]==='page:reader');
    const control=f.doc.querySelector('[data-ec-detail-action="detail-memory"]');
    assert.equal(control.querySelector('input').checked,true);
    assert.equal(control.querySelector('input').getAttribute('aria-labelledby'),'extension-detail-memory-label');
    toggleMemory(f);
    await until(()=>preferences[detailMemoryPreferenceKey('page:reader')]===false);
    assert.equal(preferences[DETAIL_KEY],null);
    assert.equal(f.state.view,'detail');
    assert.equal(f.state.detailModel.title,page.title);
    assert.deepEqual(f.opened,[]);
    assert.equal(f.doc.querySelector('[data-ec-detail-action="detail-memory"] input').checked,false);
  });
  await t.test('reopen, visit opted-out detail, enable, then enter again',async t=>{
    const f=fixture(t,{preferences,sidePanel:true});
    await f.ui.restoreLastDetail();await until(()=>f.row('page:reader'));
    assert.equal(f.state.view??'list','list');
    f.row('page:reader').dispatch('click');
    await until(()=>f.state.detailModel.detailMemory.known);
    assert.equal(preferences[DETAIL_KEY],null);
    toggleMemory(f);
    await until(()=>preferences[detailMemoryPreferenceKey('page:reader')]===true);
    assert.equal(preferences[DETAIL_KEY],null);
    f.doc.getElementById('extension-center-back').dispatch('click');
    f.row('page:reader').dispatch('click');
    await until(()=>preferences[DETAIL_KEY]==='page:reader');
  });
});

test('App detail exposes the same local preference without making its settings page restorable',async t=>{
  const f=fixture(t,{sidePanel:true,marketApp:true});
  await f.ui.openInstalledAppDetail(appDetailRequest);
  await until(()=>f.state.detailModel.detailMemory.known);
  const control=f.doc.querySelector('[data-ec-detail-action="detail-memory"]');
  assert.ok(control,'App details with a Settings action must still expose the preference');
  toggleMemory(f);
  await until(()=>f.preferences[detailMemoryPreferenceKey('app:quick-notes')]===false);
  assert.equal(f.preferences[DETAIL_KEY],null);
  f.doc.querySelector('[data-ec-detail-action="settings"]').dispatch('click');
  assert.deepEqual(f.settings,[app.id]);assert.equal(f.state.view,'list');
});

test('AI Scroll Navigation exposes memory in its existing settings and restores only the home view',async t=>{
  const scroll={...page,programId:'opendesk.ai-scroll-navigation',title:'AI 对话滚动导航'};
  const preferences={},pages=Promise.resolve({installed:[scroll]});
  await t.test('change the preference from existing settings',async t=>{
    const f=fixture(t,{sidePanel:true,preferences,pages});
    await until(()=>f.row('page:'+scroll.programId));f.row('page:'+scroll.programId).dispatch('click');
    await until(()=>f.state.detailModel.detailMemory.known&&!f.doc.getElementById('scroll-settings')?.disabled);
    assert.equal(f.doc.querySelector('[data-ec-detail-action="detail-memory"]'),null);
    f.doc.getElementById('scroll-settings').dispatch('click');
    assert.ok(f.doc.querySelector('[data-ec-detail-action="detail-memory"]'));
    toggleMemory(f);await until(()=>f.state.detailModel.detailMemory.enabled===false&&!f.state.detailModel.detailMemory.saving);
    toggleMemory(f);await until(()=>f.state.detailModel.detailMemory.enabled===true&&!f.state.detailModel.detailMemory.saving);
    f.doc.getElementById('extension-center-back').dispatch('click');
    f.doc.getElementById('extension-center-back').dispatch('click');
    assert.equal(f.state.view,'list');
    f.row('page:'+scroll.programId).dispatch('click');
    await until(()=>preferences[DETAIL_KEY]==='page:'+scroll.programId);
    f.doc.getElementById('scroll-settings').dispatch('click');
  });
  await t.test('new document starts at the detail home',async t=>{
    const f=fixture(t,{sidePanel:true,preferences,pages});
    await f.ui.restoreLastDetail();await until(()=>f.state.view==='detail');
    assert.equal(f.state.detailModel.title,scroll.title);
    assert.equal(f.doc.querySelector('[data-ec-detail-action="detail-memory"]'),null);
    assert.ok(f.doc.getElementById('scroll-settings'));
    assert.deepEqual(f.opened,[]);
  });
});

test('the switch keeps its input keyboard path and rejects untrusted pointer changes',async t=>{
  const f=fixture(t,{sidePanel:true});
  await until(()=>f.row('page:reader'));f.row('page:reader').dispatch('click');
  await until(()=>f.state.detailModel.detailMemory.known&&f.preferences[DETAIL_KEY]==='page:reader');
  toggleMemory(f,{trusted:false});await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.preferences[detailMemoryPreferenceKey('page:reader')],undefined);
  toggleMemory(f,{keyboard:true});
  await until(()=>f.preferences[detailMemoryPreferenceKey('page:reader')]===false);
  assert.equal(f.preferences[DETAIL_KEY],null);assert.equal(f.state.view,'detail');
});

test('a failed preference read is unknown; recheck reads without replaying the earlier navigation',async t=>{
  let failed=true;
  const preferences={},f=fixture(t,{preferences,sidePanel:true,readPreference:async key=>{
    if(failed)throw Error('unavailable');return preferences[key];
  }});
  await until(()=>f.row('page:reader'));f.row('page:reader').dispatch('click');
  await until(()=>f.state.detailModel.detailMemory.error);
  assert.equal(f.state.detailModel.detailMemory.known,false);
  assert.equal(f.doc.querySelector('[data-ec-detail-action="detail-memory"] input').disabled,true);
  assert.equal(preferences[DETAIL_KEY],undefined,'failed reads do not imply default-on');
  assert.ok(f.doc.querySelector('[role="alert"]'));
  failed=false;
  f.doc.querySelector('section[aria-labelledby="extension-detail-memory-label"] button').dispatch('click');
  await until(()=>f.state.detailModel.detailMemory.known);
  assert.equal(preferences[DETAIL_KEY],undefined);
});

test('a preference save failure keeps the old control value, reports unknown, and leaves navigation usable',async t=>{
  let fail=false;
  const preferences={},f=fixture(t,{preferences,sidePanel:true,writePreference:async values=>{
    if(fail)throw Error('write unavailable');Object.assign(preferences,values);
  }});
  await until(()=>f.row('page:reader'));f.row('page:reader').dispatch('click');
  await until(()=>f.state.detailModel.detailMemory.known&&preferences[DETAIL_KEY]==='page:reader');
  fail=true;
  toggleMemory(f);
  await until(()=>f.state.detailModel.detailMemory.error);
  assert.equal(f.state.detailModel.detailMemory.enabled,true);
  assert.equal(f.state.detailModel.detailMemory.known,false);
  assert.equal(f.notices.some(row=>row.message.includes('已关闭')),false);
  assert.equal(f.state.view,'detail');
  fail=false;f.doc.getElementById('extension-center-back').dispatch('click');
  await until(()=>preferences[DETAIL_KEY]===null);assert.equal(f.state.view,'list');
});

test('an old preference read cannot overwrite a change from another sidebar document',async t=>{
  const read=deferred(),preferences={},key=detailMemoryPreferenceKey('page:reader');let reads=0;
  const f=fixture(t,{preferences,sidePanel:true,readPreference:async k=>{
    if(k===key&&++reads===1)return read.promise;
    return preferences[k];
  }});
  await until(()=>f.row('page:reader'));f.row('page:reader').dispatch('click');
  await until(()=>reads===2);
  preferences[key]=false;f.emitStorage({[key]:{newValue:false}});
  await until(()=>f.state.detailModel.detailMemory.known&&f.state.detailModel.detailMemory.enabled===false);
  read.resolve(true);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.state.detailModel.detailMemory.enabled,false);
});

test('a preference notification during save triggers read-only reconciliation before displaying a stale result',async t=>{
  const locks=testLocks(),delivered=deferred(),release=deferred(),key=detailMemoryPreferenceKey('page:reader');
  let hold=false;
  const wrapped={request(name,work){
    return locks.request(name,work).then(async result=>{
      if(hold){hold=false;delivered.resolve();await release.promise;}
      return result;
    });
  }};
  const f=fixture(t,{sidePanel:true,locks:wrapped});
  await until(()=>f.row('page:reader'));f.row('page:reader').dispatch('click');
  await until(()=>f.state.detailModel.detailMemory.known&&f.preferences[DETAIL_KEY]==='page:reader');
  hold=true;toggleMemory(f);await delivered.promise;
  f.preferences[key]=true;f.emitStorage({[key]:{oldValue:false,newValue:true}});
  release.resolve();
  await until(()=>!f.state.detailModel.detailMemory.loading&&!f.state.detailModel.detailMemory.saving);
  assert.equal(f.state.detailModel.detailMemory.enabled,true);
  assert.equal(f.state.detailModel.detailMemory.known,true);
  assert.equal(f.notices.some(row=>row.message.includes('已关闭')),false);
});

test('installed apps render and open without waiting for Page authority',async t=>{
  const pages=deferred(),f=fixture(t,{pages:pages.promise});
  await until(()=>f.row('app:quick-notes'));
  assert.equal(f.state.feedbackModel.showEmpty,false);
  assert.equal(f.row('page:reader'),null,'pending Page state is not guessed');
  f.row('app:quick-notes').dispatch('click');
  assert.deepEqual(f.opened,['quick-notes']);
  pages.resolve({installed:[page]});
  await until(()=>f.row('page:reader'));
  assert.ok(f.row('app:quick-notes'));
});

test('installed Pages render without waiting for app storage and retain source failures',async t=>{
  const apps=deferred(),f=fixture(t,{apps:apps.promise});
  await until(()=>f.row('page:reader'));
  assert.equal(f.state.feedbackModel.showEmpty,false);
  assert.equal(f.row('app:quick-notes'),null);
  apps.reject(Error('app storage unavailable'));
  await until(()=>f.state.statusModel.text.includes('app storage unavailable'));
  assert.ok(f.row('page:reader'));
  assert.match(f.state.statusModel.text,/app storage unavailable/);
});

test('initial Host connection reuses the pending Page read; reconnect refreshes current facts',async t=>{
  const pages=deferred(),f=fixture(t,{pages:pages.promise});
  f.connect();
  assert.equal(f.calls.length,1,'initial request already waits for this Host connection');
  pages.resolve({installed:[page]});
  await until(()=>f.row('page:reader')&&f.row('app:quick-notes'));
  f.connect();
  assert.equal(f.calls.length,2,'a later connection must revalidate installation state');
});

test('a real reconnect refreshes Page facts while the independent app source is still pending',async t=>{
  const apps=deferred(),reads=[Promise.resolve({installed:[page]}),Promise.resolve({installed:[]})];
  const f=fixture(t,{apps:apps.promise,pages:()=>reads.shift()});
  f.connect();
  await until(()=>f.row('page:reader'));
  f.connect(false);f.connect();
  assert.equal(f.calls.length,2);
  await until(()=>!f.row('page:reader'));
  apps.resolve([app]);
  await until(()=>f.row('app:quick-notes'));
});

test('the first successful connection retries a failed Page read even while apps are pending',async t=>{
  const apps=deferred(),reads=[Promise.reject(Error('Host registration failed')),Promise.resolve({installed:[page]})];
  const f=fixture(t,{apps:apps.promise,pages:()=>reads.shift()});
  // The rejected transport settles before the next event-loop turn; catalog
  // fetch diagnostics may independently own the visible status in this fixture.
  await new Promise(resolve=>setImmediate(resolve));
  f.connect();
  assert.equal(f.calls.length,2);
  await until(()=>f.row('page:reader'));
  apps.resolve([app]);
  await until(()=>f.row('app:quick-notes'));
});

test('progressive rendering does not turn a pending or failed full readback into success',async t=>{
  const pages=deferred(),f=fixture(t,{pages:pages.promise});
  let complete=false;
  const readback=f.ui.refresh().then(result=>{complete=true;return result;});
  await until(()=>f.row('app:quick-notes'));
  assert.equal(complete,false,'an early app row is not a completed Page readback');
  pages.reject(Error('Page authority unavailable'));
  assert.equal(await readback,false);
  assert.ok(f.row('app:quick-notes'));
  assert.equal(f.row('page:reader'),null);
  assert.match(f.state.statusModel.text,/Page authority unavailable/);
});

test('empty state waits for both sources, and disposal ignores late Page results',async t=>{
  const pages=deferred(),f=fixture(t,{apps:Promise.resolve([]),pages:pages.promise});
  await new Promise(resolve=>setTimeout(resolve,15));
  assert.equal(f.state.feedbackModel.showEmpty,false);
  f.ui.dispose();pages.resolve({installed:[page]});
  await new Promise(resolve=>setTimeout(resolve,15));
  assert.equal(f.row('page:reader'),null);
});

test('late success or failure from a superseded refresh cannot replace current installed facts',async t=>{
  const oldApps=deferred(),oldPages=deferred();
  const appReads=[oldApps.promise,Promise.resolve([])],pageReads=[oldPages.promise,Promise.resolve({installed:[]})];
  const f=fixture(t,{apps:()=>appReads.shift(),pages:()=>pageReads.shift()});
  assert.equal(await f.ui.refresh(),true);
  assert.equal(f.state.feedbackModel.showEmpty,true);
  oldApps.reject(Error('stale failure'));oldPages.resolve({installed:[page]});
  await new Promise(resolve=>setTimeout(resolve,15));
  assert.equal(f.row('page:reader'),null);
  assert.equal(f.row('app:quick-notes'),null);
  assert.doesNotMatch(f.state.statusModel.text,/stale failure/);
});
