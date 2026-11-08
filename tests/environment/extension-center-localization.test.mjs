import test from 'node:test';
import assert from 'node:assert/strict';
import {createExtensionCenterDOM} from '../helpers/extension-center-react-dom.mjs';

test('public center switches language in place and preserves site draft and literal content',t=>{
  const title='<img src=x onerror=alert(1)>',calls=[];
  const {doc,adapter}=createExtensionCenterDOM(t,{props:{view:'detail',toolbarModel:{language:'en'},detailModel:{
    locale:'en',kind:'page',title,type:'Page enhancement',actions:[],sites:[],
    pageControl:{enabled:true,enabledKnown:true,state:'pending',status:'Pending'},
    siteUpgrade:{onSubmit:value=>calls.push(value)},pageInfo:{}
  }}});
  assert.equal(doc.querySelector('#extension-center-search').placeholder,'Search this list');
  assert.equal(doc.querySelector('.ec-page-control h3').textContent,'Enable this page enhancement');
  const input=doc.querySelector('[name="origin"]');input.value='https://draft.example';input.focus();
  adapter.renderToolbar({language:'ja'});
  assert.equal(doc.querySelector('[name="origin"]'),input);
  assert.equal(input.value,'https://draft.example');assert.equal(doc.activeElement,input);
  assert.equal(doc.querySelector('.ec-page-control h3').textContent,'このページ拡張を有効にする');
  assert.ok(doc.documentElement.textContent.includes(title));assert.equal(doc.querySelector('img'),null);
  assert.deepEqual(calls,[]);
});

for(const [locale,search,heading] of [
  ['zh-CN','搜索当前列表','启用此网页增强'],['en','Search this list','Enable this page enhancement'],
  ['ja','現在の一覧を検索','このページ拡張を有効にする'],['zh-TW','搜尋目前清單','啟用此網頁增強']
])test(`public detail, ARIA and confirmation follow ${locale} without invoking actions`,t=>{
  let actions=0;
  const {doc,adapter}=createExtensionCenterDOM(t,{props:{toolbarModel:{language:locale},view:'detail',detailModel:{
    title:'User title',kind:'page',actions:[],pageControl:{enabled:true,enabledKnown:true,state:'pending',status:'pending'},
    pageInfo:{},confirmation:{text:'User explanation',onCancel:()=>actions++,onConfirm:()=>actions++}
  }}});
  assert.equal(doc.querySelector('#extension-center-search').placeholder,search);
  assert.equal(doc.querySelector('.ec-page-control h3').textContent,heading);
  const dialog=doc.querySelector('[role="dialog"]'),cancel=doc.querySelector('[data-uninstall-cancel]');
  const label=doc.querySelector('.od-uninstall-close').getAttribute('aria-label');
  adapter.renderToolbar({language:locale==='en'?'ja':'en'});
  assert.equal(doc.querySelector('[role="dialog"]'),dialog);
  assert.equal(doc.querySelector('[data-uninstall-cancel]'),cancel);
  assert.equal(doc.activeElement,cancel);
  assert.notEqual(doc.querySelector('.od-uninstall-close').getAttribute('aria-label'),label);
  assert.equal(actions,0);
});

test('toggle glyph follows boolean state rather than translated labels',t=>{
  const {doc,adapter}=createExtensionCenterDOM(t,{props:{toolbarModel:{language:'en'},view:'detail',detailModel:{
    kind:'app',title:'App',enabled:true,actions:[{id:'toggle',label:'Disable'}]
  }}});
  assert.equal(doc.querySelector('[data-ec-detail-action="toggle"] path').getAttribute('d'),'M9 6v12M15 6v12');
  adapter.renderDetail({kind:'app',title:'App',enabled:false,actions:[{id:'toggle',label:'停用'}]});
  assert.equal(doc.querySelector('[data-ec-detail-action="toggle"] path').getAttribute('d'),'m8 5 11 7-11 7V5Z');
});

test('resolved toolbar locale wins over automatic language preference',t=>{
  const {doc}=createExtensionCenterDOM(t,{props:{toolbarModel:{language:'auto',locale:'en'}}});
  assert.equal(doc.querySelector('#extension-center-search').placeholder,'Search this list');
  assert.equal(doc.querySelector('#extension-center-more').getAttribute('aria-label'),'Filter and manage extensions');
});

test('actual controller localizes rows, count, details and pending uninstall without changing Authority',async t=>{
  const {createExtensionCenter}=await import('../../src/ui/extension-center.js');
  const {SIDEBAR_TOOL_STORE}=await import('../../src/ui/sidebar-tools/package.js');
  const {SIDEBAR_TOOL_ENABLE_STORE}=await import('../../src/ui/sidebar-tools/lifecycle.js');
  const {doc,adapter}=createExtensionCenterDOM(t);
  let locale='en',notify,writes=0;
  const page={programId:'reader',title:'User page',revision:1,manifestHash:'a'.repeat(64),sourceHash:'b'.repeat(64),enabled:true,
    nativeState:'registered',authorization:{status:'active',generation:1,installationId:'install-1'},pageRules:{matches:['https://user.example/*']}};
  const api={runtime:{getURL:path=>'chrome-extension://fixture/'+path},storage:{
    local:{get:async()=>({[SIDEBAR_TOOL_STORE]:[],[SIDEBAR_TOOL_ENABLE_STORE]:{}})},
    onChanged:{addListener(){},removeListener(){}}
  }};
  const ui=createExtensionCenter({api,doc,extensionList:adapter,sidebarTools:{},taskWorkbench:{},
    client:{request:async method=>{if(method!=='listPagePrograms')writes++;assert.equal(method,'listPagePrograms');return {installed:[structuredClone(page)]};}},
    localeController:{getLocale:()=>locale,getPreference:()=> 'auto',subscribe:fn=>{notify=fn;return ()=>{};}}
  });t.after(()=>ui.dispose());
  await ui.refresh();
  assert.equal(doc.querySelector('#extension-center-count').textContent,'1 extensions');
  assert.equal(doc.querySelector('.ec-type').textContent,'App · page enhancement');
  doc.querySelector('[data-extension-action="more"]').dispatch('click');
  doc.querySelector('[data-ec-context-action="detail"]').dispatch('click');
  assert.equal(doc.querySelector('.ec-page-control h3').textContent,'Enable this page enhancement');
  assert.equal(doc.querySelector('.ec-page-control [role="status"]').textContent,'Auto-run requirements are ready');
  assert.ok(doc.querySelector('#extension-center-detail-body').textContent.includes('Installed locally · Enabled'));
  doc.querySelector('[data-ec-detail-action="uninstall"]').dispatch('click');
  const dialog=doc.querySelector('[role="dialog"]'),cancel=dialog.querySelector('[data-uninstall-cancel]');
  assert.ok(dialog.textContent.includes('does not automatically delete'));
  locale='ja';notify();
  assert.equal(doc.querySelector('[role="dialog"]'),dialog);assert.equal(doc.activeElement,cancel);
  assert.ok(dialog.textContent.includes('自動削除しません'));
  assert.equal(doc.querySelector('.ec-page-control h3').textContent,'このページ拡張を有効にする');
  assert.equal(writes,0);
  cancel.dispatch('click');
  ui.reportPanelNavigation();
  assert.equal(doc.querySelector('#extension-center-status').textContent,'マーケットへの移動は保留されました。');
  locale='en';notify();
  assert.equal(doc.querySelector('#extension-center-status').textContent,'Market navigation was deferred.');
  assert.equal(doc.querySelector('#extension-center-status').dataset.state,'error');
  ui.reportPanelNavigation('User error <literal>');
  locale='en';notify();
  assert.equal(doc.querySelector('#extension-center-status').textContent,'User error <literal>');
});

test('installed read failures change their own language without reading again or translating raw errors',async t=>{
  const {createExtensionCenter}=await import('../../src/ui/extension-center.js');
  const {createUiLocaleController}=await import('../../src/ui/app-localization.js');
  const {extensionCenterText}=await import('../../src/ui/extension-center-localization.js');
  const locale=createUiLocaleController(null,{languages:['en'],eventTarget:null,storage:()=>null});
  t.after(()=>locale.dispose());await locale.ready;
  const f=createExtensionCenterDOM(t);let reads=0;
  const api={runtime:{getURL:path=>'chrome-extension://fixture/'+path},storage:{local:{get:async()=>{reads++;throw Error('STORAGE_OFFLINE <raw>');}},
    onChanged:{addListener(){},removeListener(){}}}};
  const client={async request(){reads++;return {installed:[]};}};
  const center=createExtensionCenter({api,client,doc:f.doc,extensionList:f.adapter,localeController:locale,sidebarTools:{},taskWorkbench:{}});
  t.after(()=>center.dispose());
  await new Promise(resolve=>setImmediate(resolve));await center.refresh();
  const before=reads;
  for(const language of ['en','ja','zh-TW','zh-CN']){
    locale.setLocalePreference(language,{persist:false});
    assert.ok(f.state.statusModel.text.startsWith(extensionCenterText(language,'readFailed')));
    assert.ok(f.state.statusModel.text.includes(extensionCenterText(language,'appsError')));
    assert.ok(f.state.statusModel.text.includes('STORAGE_OFFLINE <raw>'));
    assert.equal(f.doc.querySelector('raw'),null);
  }
  assert.equal(reads,before);
});

async function failureLocaleFixture(t,{apps=[],pages=[]}={}){
  const {createExtensionCenter}=await import('../../src/ui/extension-center.js');
  const {SIDEBAR_TOOL_STORE}=await import('../../src/ui/sidebar-tools/package.js');
  const {SIDEBAR_TOOL_ENABLE_STORE}=await import('../../src/ui/sidebar-tools/lifecycle.js');
  const f=createExtensionCenterDOM(t),calls=[];
  let locale='zh-CN',notify,reads=0;
  const raw='RAW_HOST_FAILURE 中文 <literal>';
  const fail=()=>{throw Object.assign(Error(raw),{code:'E_EFFECT_UNKNOWN'});};
  const center=createExtensionCenter({doc:f.doc,extensionList:f.adapter,taskWorkbench:{},
    sidebarTools:{uninstallFromList:async()=>{calls.push('uninstallApp');fail();}},
    api:{runtime:{getURL:path=>'chrome-extension://fixture/'+path},storage:{
      local:{get:async()=>{reads++;return {[SIDEBAR_TOOL_STORE]:structuredClone(apps),[SIDEBAR_TOOL_ENABLE_STORE]:{}};}},
      onChanged:{addListener(){},removeListener(){}}
    }},client:{request:async method=>{
      if(method==='uninstallPageProgram'){calls.push(method);fail();}
      assert.equal(method,'listPagePrograms');reads++;return {installed:structuredClone(pages)};
    }},localeController:{getLocale:()=>locale,subscribe:fn=>{notify=fn;return ()=>{};}}
  });t.after(()=>center.dispose());
  await center.refresh();
  return {...f,calls,raw,readCount:()=>reads,changeLocale(value){locale=value;notify();}};
}
const localizationPage=(overrides={})=>({programId:'reader',title:'User page',revision:1,
  manifestHash:'a'.repeat(64),sourceHash:'b'.repeat(64),enabled:true,nativeState:'registered',
  authorization:{status:'active',generation:1,installationId:'install-1'},
  pageRules:{matches:['https://user.example/*']},...overrides});
const localizationApp={format:'opendesk.sidebar-tool.v1',id:'user-notes',title:'User notes',
  description:'用户原始描述 <literal>',version:'1.0.0',capabilities:[],html:'<main>Notes</main>',css:'',js:'void 0;'};

for(const kind of ['app','page'])test(`${kind} unknown uninstall failure re-localizes without replaying or translating raw errors`,async t=>{
  const {extensionCenterText}=await import('../../src/ui/extension-center-localization.js');
  const f=await failureLocaleFixture(t,kind==='app'?{apps:[localizationApp]}:{pages:[localizationPage()]});
  f.doc.querySelector('[data-extension-action="more"]').dispatch('click');
  f.doc.querySelector('[data-ec-context-action="uninstall"]').dispatch('click');
  f.doc.querySelector('.od-uninstall-confirm').dispatch('click');
  for(let i=0;i<100&&(!f.state.statusModel?.text?.includes(f.raw)||f.state.uninstallModel);i++)
    await new Promise(resolve=>setTimeout(resolve,5));
  assert.ok(f.state.statusModel.text.includes(f.raw));assert.equal(f.state.uninstallModel,null);
  const reads=f.readCount(),key=kind==='app'?'noAutoRetry':'verifyBeforeRetry';
  for(const locale of ['en','ja','zh-TW','zh-CN']){
    f.changeLocale(locale);
    assert.equal(f.state.statusModel.text,'E_EFFECT_UNKNOWN：'+f.raw+extensionCenterText(locale,key));
    assert.equal(f.state.statusModel.state,'error');assert.equal(f.doc.querySelector('literal'),null);
  }
  assert.equal(f.calls.length,1,'unknown outcome is never retried');
  assert.equal(f.readCount(),reads,'locale changes do not reread installations');
});

test('installed Scroll default list description localizes while custom copy remains literal',async t=>{
  const {scrollNavigationText}=await import('../../projects/ai-scroll-navigation/trusted/host-localization.js');
  const f=await failureLocaleFixture(t,{apps:[localizationApp],pages:[localizationPage({
    programId:'opendesk.ai-scroll-navigation',title:'用户自定义标题 <literal>'
  })]});
  const reads=f.readCount();
  for(const locale of ['en','ja','zh-TW']){
    f.changeLocale(locale);
    const scroll=f.doc.querySelector('[data-extension-id="page:opendesk.ai-scroll-navigation"]');
    assert.equal(scroll.querySelector('.ec-description').textContent,scrollNavigationText(locale,'listDescription'));
    assert.equal(scroll.querySelector('.ec-name-text').textContent,'用户自定义标题 <literal>');
    assert.equal(f.doc.querySelector('[data-extension-id="app:user-notes"] .ec-description').textContent,localizationApp.description);
    assert.equal(f.doc.querySelector('literal'),null);
  }
  assert.equal(f.readCount(),reads);assert.deepEqual(f.calls,[]);
});
