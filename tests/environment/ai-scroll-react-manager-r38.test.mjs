import test from 'node:test';
import assert from 'node:assert/strict';
import {createExtensionCenterDOM} from '../helpers/extension-center-react-dom.mjs';
import {createExtensionCenter} from '../../src/ui/extension-center.js';
import {createUiLocaleController} from '../../src/ui/app-localization.js';
import {SIDEBAR_TOOL_STORE} from '../../src/ui/sidebar-tools/package.js';
import {SIDEBAR_TOOL_ENABLE_STORE} from '../../src/ui/sidebar-tools/lifecycle.js';

const id='opendesk.ai-scroll-navigation';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const sample={
  origin:'https://chatgpt.com',pathScope:'/',mainSelector:'main',
  scrollSelector:'#conversation',messageSelector:'article',
  anchorSelector:'',enabled:true
};
async function fixture(t,options={}){
  const {doc,state,adapter}=createExtensionCenterDOM(t);
  const installed={programId:id,title:'AI 对话滚动导航',revision:8,
    manifestHash:'a'.repeat(64),sourceHash:'b'.repeat(64),enabled:true,
    nativeState:'registered',authorization:{
      status:'active',generation:3,installationId:'installation-r8'},
    pageRules:{matches:['https://chatgpt.com/*','https://chat.deepseek.com/*',
      'https://gemini.google.com/*'],excludeMatches:[],runAt:'document_idle',allFrames:false,world:'USER_SCRIPT'},
    ...structuredClone(options.installed||{})};
  const target={status:'available',windowId:9,tabId:11,frameId:0,documentId:'document-1',
    url:'https://chatgpt.com/c/example',origin:'https://chatgpt.com'};
  const requests=[],reviews=[];
  let saved=structuredClone(options.saved||{value:{version:1,sites:[]},etag:'0'});
  const client={async request(method,payload){
    requests.push({method,payload});
    const override=await options.request?.(method,payload,{saved:()=>saved,
      setSaved:value=>{saved=structuredClone(value);}});
    if(override!==undefined)return override;
    if(method==='listPagePrograms')return {installed:[structuredClone(installed)]};
    if(method==='readScrollSiteConfig')return structuredClone(saved);
    if(method==='pickScrollSiteElement')return {state:'selected',field:payload.field,selector:'article',count:2};
    if(method==='saveScrollSiteRule'){
      const rule=payload.rule;
      saved={value:{...saved.value,sites:rule?[rule]:[]},etag:'after-save'};
      return structuredClone(saved);
    }
    if(method==='saveScrollNavigationSettings'){
      saved={value:{...saved.value,navigation:payload.navigation},etag:'navigation-saved'};
      return structuredClone(saved);
    }
    if(method==='prepareScrollSitePackage')
      return {programId:id,revision:1_000_000_004};
    throw Error('Unexpected request: '+method);
  }};
  const api={permissions:options.permissions,runtime:{getURL:path=>'chrome-extension://fixture/'+path},
    storage:{local:{get:async()=>({[SIDEBAR_TOOL_STORE]:[],
      [SIDEBAR_TOOL_ENABLE_STORE]:{}})},onChanged:{addListener(){},removeListener(){}}}};
  const currentPageTarget={snapshot:target,capture:()=>({...target}),
    refresh:async()=>({...target}),
    revalidate:async()=>({...target}),subscribe:()=>()=>{}};
  const sidebarTools={openPagePackageReview(...args){reviews.push(args);return true;}};
  const ui=createExtensionCenter({api,client,doc,extensionList:adapter,
    sidebarTools,taskWorkbench:{},currentPageTarget,localeController:options.localeController});
  t.after(()=>ui.dispose());
  await ui.refresh();
  const row=state.rowsModel.rows.find(r=>r.key==='page:'+id);
  assert.ok(row);
  const entry=[...doc.querySelectorAll('button[data-extension-key]')]
    .find(button=>button.dataset.extensionKey===row.key&&
      button.dataset.extensionAction==='main');
  assert.ok(entry);entry.dispatch('click');
  assert.ok(state.detailModel?.scrollManager);
  return {doc,state,requests,reviews,saved:()=>saved,installed,entry,ui,target};
}
const buttonWithText=(doc,text)=>[...doc.querySelectorAll('button')].find(button=>button.textContent.trim()===text);
const assertReadOnly=requests=>assert.deepEqual(
  [...new Set(requests.map(request=>request.method))].sort(),
  ['listPagePrograms','readScrollSiteConfig'],
  'viewing and rechecking status must not mutate or replay any operation');

test('AI Scroll ready and off homes keep status diagnostics in management',async t=>{
  for(const installed of [{},{enabled:false,nativeState:'disabled',authorization:{status:'disabled',generation:4,
    installationId:'installation-r8'}}]){
    await t.test(installed.enabled===false?'off':'ready',async t=>{
      const f=await fixture(t,{installed});await tick();
      const home=f.doc.querySelector('.ec-scroll-home'),control=home.querySelector('.ec-page-control');
      assert.ok(control);
      assert.equal(control.querySelector('.ec-page-state'),null);
      assert.doesNotMatch(home.textContent,/并非|Chrome 注册|SHA-256|刷新可信状态|已实际运行/);
      assert.equal(buttonWithText(f.doc,'重新检查'),undefined);
      assert.equal(buttonWithText(f.doc,'查看详情'),undefined);
      assert.equal(f.state.detailModel.pageControl.state,installed.enabled===false?'off':'ready');
      assertReadOnly(f.requests);
    });
  }
});

test('AI Scroll uncertain home opens technical details and rechecks without writes or lost focus',async t=>{
  const f=await fixture(t,{installed:{managedCleanup:{state:'unknown'}}});await tick();
  const control=f.doc.querySelector('.ec-page-control');
  assert.equal(control.querySelector('.ec-page-state').dataset.state,'pending');
  assert.match(control.textContent,/运行状态待确认/);
  assert.doesNotMatch(control.textContent,/异常|受阻|并非|SHA-256|刷新可信状态/);
  assert.equal(f.state.detailModel.pageControl.canRestore,false);
  const details=buttonWithText(f.doc,'查看详情');assert.ok(details);
  assert.equal(details.id,'scroll-status-details');
  assert.ok(details.id,'details opener needs an identity for focus restoration');
  const opener=details.id;details.focus();details.dispatch('click');await tick();
  assert.equal(f.doc.querySelector('.ec-scroll-site-manager').dataset.view,'management');
  assert.equal(f.doc.querySelector('#extension-center-back').getAttribute('aria-label'),'返回应用首页');
  assert.match(f.doc.querySelector('.ec-scroll-content').textContent,/受管界面清理：unknown/);
  assert.match(f.doc.querySelector('.ec-scroll-content').textContent,/安装身份：installation-r8/);
  assert.match(f.doc.querySelector('.ec-scroll-content').textContent,/Chrome 注册：registered/);
  const readCount=()=>f.requests.filter(request=>request.method==='listPagePrograms').length;
  const before=readCount(),recheck=buttonWithText(f.doc,'重新检查');assert.ok(recheck);
  assert.equal(recheck.id,'scroll-refresh-state');
  recheck.dispatch('click',{isTrusted:false});await tick();
  assert.equal(readCount(),before,'untrusted recheck cannot invoke the trusted refresh callback');
  recheck.dispatch('click');await tick();await tick();
  assert.equal(readCount(),before+1);
  assert.equal(f.doc.querySelector('.ec-scroll-site-manager').dataset.view,'management');
  assert.match(f.doc.querySelector('.ec-scroll-content').textContent,/受管界面清理：unknown/);
  assert.equal(f.state.detailModel.pageControl.state,'pending','a fresh unknown readback must not advertise ready');
  assert.equal(f.installed.enabled,true);
  assertReadOnly(f.requests);
  f.doc.querySelector('#extension-center-back').dispatch('click');await tick();
  assert.equal(f.doc.querySelector('.ec-scroll-site-manager').dataset.view,'home');
  assert.equal(f.doc.activeElement.id,opener);
});

test('AI Scroll suspended home keeps explicit restore and fences recheck while it is busy',async t=>{
  let finish;
  const pending=new Promise(resolve=>{finish=resolve;});t.after(()=>finish());
  const f=await fixture(t,{installed:{authorization:{status:'suspended',generation:3,installationId:'installation-r8'}},
    permissions:{contains:async()=>true},async request(method,payload){
      if(method==='setInstalledPageEnabled'){
        await pending;return {enabled:payload.enabled};
      }
    }});await tick();
  const restore=buttonWithText(f.doc,'恢复自动运行');assert.ok(restore);
  assert.equal(f.state.detailModel.pageControl.state,'restricted');
  restore.dispatch('click',{isTrusted:false});await tick();
  assert.equal(f.requests.some(request=>request.method==='setInstalledPageEnabled'),false);
  const details=buttonWithText(f.doc,'查看详情');assert.ok(details);
  details.dispatch('click');await tick();
  buttonWithText(f.doc,'恢复自动运行').dispatch('click');await tick();
  const write=f.requests.find(request=>request.method==='setInstalledPageEnabled');assert.ok(write);
  assert.equal(write.payload.enabled,true);
  assert.equal(write.payload.expectedGeneration,3);
  assert.equal(write.payload.installationId,'installation-r8');
  const recheck=buttonWithText(f.doc,'重新检查');assert.ok(recheck);
  assert.equal(recheck.disabled,true);
  const before=f.requests.length;recheck.dispatch('click');await tick();
  assert.equal(f.requests.length,before);
  finish();await tick();await tick();
});
test('AI Scroll home restore uses the original trusted enabled intent and installation identity',async t=>{
  const f=await fixture(t,{installed:{nativeState:'blocked'},permissions:{contains:async()=>true},
    request(method,payload){
      if(method==='setInstalledPageEnabled'){
        f.installed.nativeState='registered';
        return {enabled:payload.enabled};
      }
    }});await tick();
  assert.equal(f.requests.some(request=>request.method==='setInstalledPageEnabled'),false);
  buttonWithText(f.doc,'恢复自动运行').dispatch('click');await tick();await tick();
  const writes=f.requests.filter(request=>request.method==='setInstalledPageEnabled');
  assert.equal(writes.length,1);
  assert.deepEqual(writes[0].payload,{programId:id,manifestHash:f.installed.manifestHash,
    enabled:true,installationId:'installation-r8',expectedGeneration:3});
  assert.equal(f.doc.querySelector('.ec-scroll-site-manager').dataset.view,'home');
  assert.equal(f.state.detailModel.pageControl.state,'ready');
  assert.equal(f.doc.querySelector('.ec-page-state'),null);
});
test('R4.0 formal React home, all built-ins and compact four-field editor',async t=>{
  const f=await fixture(t);
  await tick();
  assert.equal(f.entry.getAttribute('aria-label'),'打开「AI 对话滚动导航」');
  assert.equal(f.state.rowsModel.rows.find(r=>r.key==='page:'+id).kind,'page');
  assert.equal(f.doc.querySelectorAll('.ec-page-diagnostics').length,0);
  assert.equal(f.doc.querySelectorAll('.ec-scroll-builtins li').length,2,
    'the homepage shows only ChatGPT and DeepSeek');
  assert.equal(f.doc.querySelectorAll('.ec-scroll-selector').length,0);
  const all=f.doc.querySelector('button[aria-label="查看全部内置网站"]');
  assert.ok(all);all.dispatch('click');await tick();
  assert.equal(f.doc.querySelectorAll('.ec-scroll-builtins li').length,3);
  assert.equal(f.doc.querySelectorAll('#extension-center-back').length,1);
  f.doc.querySelector('#extension-center-back').dispatch('click');await tick();
  const add=f.doc.querySelector('button[aria-label="添加自定义网站"]');
  assert.ok(add);add.dispatch('click');await tick();
  assert.equal(f.doc.querySelectorAll('.ec-scroll-selector').length,4);
  assert.equal(f.doc.querySelectorAll('.ec-scroll-selector button').length,4);
  assert.equal(f.doc.querySelectorAll('.ec-scroll-css-field .ec-scroll-required').length,2,
    'only the two required CSS fields show red stars');
  assert.equal(f.doc.querySelectorAll('.ec-scroll-save').length,1);
  assert.equal(f.doc.querySelector('.ec-scroll-save').disabled,true);
  assert.equal(f.doc.querySelector('#scroll-origin').value,'https://chatgpt.com');
  assert.equal(f.doc.querySelector('#scroll-path').value,'',
    'a new site keeps the optional path empty instead of inferring the current path');
  assert.equal(f.doc.querySelectorAll('[name="buttonPosition"]').length,0);
  assert.equal(f.doc.querySelectorAll('.ec-site-upgrade').length,0);
  assert.equal(f.doc.querySelectorAll('button[aria-label="当前页"]').length,0);
});
test('R4.0 passes a new origin to the original installer without saving selectors',async t=>{
  const f=await fixture(t),manager=f.state.detailModel.scrollManager;
  const details=await manager.onCurrentPageDetails();
  assert.deepEqual(details,{origin:'https://chatgpt.com',
    url:'https://chatgpt.com/c/example'});
  const result=await manager.onReviewSite({
    origin:'https://new-ai.example',pathScope:'/talk'},{isTrusted:true});
  assert.equal(result,true);
  assert.equal(f.reviews.length,1);
  assert.equal(f.requests.filter(x=>x.method==='saveScrollSiteRule').length,0);
});
test('R3.8 React delegates real selection to installed Host with pinned active document',async t=>{
  const f=await fixture(t),manager=f.state.detailModel.scrollManager;
  const result=await manager.onPick('messages','https://chatgpt.com','main',{isTrusted:true});
  assert.equal(result.selector,'article');
  const call=f.requests.find(r=>r.method==='pickScrollSiteElement');
  assert.ok(call);
  assert.equal(call.payload.programId,id);
  assert.equal(call.payload.installationId,'installation-r8');
  assert.equal(call.payload.expectedGeneration,3);
  assert.deepEqual(call.payload.target,{tabId:11,frameId:0,documentId:'document-1',
    expectedUrl:'https://chatgpt.com/c/example',expectedWindowId:9});
});
test('R3.8 trusted save needs write and readback; UI cannot claim navigation success',async t=>{
  const f=await fixture(t),manager=f.state.detailModel.scrollManager;
  const receipt=await manager.onSave(sample,'0',null,{isTrusted:true});
  assert.equal(receipt.etag,'after-save');
  assert.deepEqual(receipt.value.sites,[sample]);
  assert.equal(f.requests.filter(r=>r.method==='saveScrollSiteRule').length,1);
  const writeAt=f.requests.findIndex(r=>r.method==='saveScrollSiteRule');
  assert.ok(f.requests.slice(writeAt+1).some(r=>r.method==='readScrollSiteConfig'),
    'a fresh Host readback must follow the successful write');
  assert.equal(f.reviews.length,0);
});
test('R3.8 new Origin enters existing installer review and does not write a site rule',async t=>{
  const f=await fixture(t),manager=f.state.detailModel.scrollManager;
  const custom={...sample,origin:'https://my-ai.example',pathScope:'/chat'};
  const result=await manager.onSave(custom,'0',null,{isTrusted:true});
  assert.equal(result.review,true);
  assert.equal(f.requests.filter(r=>r.method==='saveScrollSiteRule').length,0);
  assert.equal(f.requests.filter(r=>r.method==='prepareScrollSitePackage').length,1);
  assert.equal(f.reviews.length,1);
  assert.deepEqual(f.saved().value.sites,[]);
});
test('R3.8 new site may request permission before any CSS is known',async t=>{
  const f=await fixture(t),manager=f.state.detailModel.scrollManager;
  const withoutSelectors={...sample,origin:'https://new-ai.example',pathScope:'/talk',
    mainSelector:'',scrollSelector:'',messageSelector:'',anchorSelector:''};
  assert.equal(manager.isApproved(withoutSelectors.origin,withoutSelectors.pathScope),false);
  const review=await manager.onSave(withoutSelectors,'0',null,{isTrusted:true});
  assert.equal(review.review,true,'first grant is not mislabeled as a saved rule');
  assert.equal(f.reviews.length,1);
  assert.equal(f.requests.filter(r=>r.method==='saveScrollSiteRule').length,0);
});
test('R3.8 guards false gestures and stale installation identities before mutation',async t=>{
  const f=await fixture(t),manager=f.state.detailModel.scrollManager;
  await assert.rejects(()=>manager.onSave(sample,'0',null,{isTrusted:false}),e=>e.code==='E_GESTURE');
  assert.equal(f.requests.filter(r=>r.method==='saveScrollSiteRule').length,0);
});

test('R4.0 unknown write receipts fence retries until an explicit fresh read',async t=>{
  let lost=true;
  const f=await fixture(t,{request(method,payload,storage){
    if(method==='saveScrollSiteRule'&&lost){
      lost=false;
      storage.setSaved({value:{version:1,sites:[payload.rule]},etag:'committed-with-lost-reply'});
      throw Object.assign(new Error('reply lost after commit'),{code:'E_TRANSPORT'});
    }
  }});
  const manager=f.state.detailModel.scrollManager;
  await assert.rejects(()=>manager.onSave(sample,'0',null,{isTrusted:true}),{code:'E_CONFIG_UNKNOWN'});
  await assert.rejects(()=>manager.onSave(sample,'0',null,{isTrusted:true}),{code:'E_CONFIG_UNKNOWN'});
  assert.equal(f.requests.filter(r=>r.method==='saveScrollSiteRule').length,1);
  const confirmed=await manager.onRead();
  assert.equal(confirmed.etag,'committed-with-lost-reply');
  assert.deepEqual(confirmed.value.sites,[sample]);
});

test('R4.0 a mismatched receipt/readback never announces a successful save',async t=>{
  let mismatch=false;
  const f=await fixture(t,{request(method){
    if(method==='saveScrollSiteRule')mismatch=true;
    if(method==='readScrollSiteConfig'&&mismatch)
      return {value:{version:1,sites:[]},etag:'stale-read'};
  }});
  await assert.rejects(()=>f.state.detailModel.scrollManager.onSave(sample,'0',null,{isTrusted:true}),
    {code:'E_CONFIG_UNKNOWN'});
});

test('R4.0 navigation settings persist through the existing CAS config and preserve sites',async t=>{
  const f=await fixture(t,{saved:{value:{version:1,sites:[sample]},etag:'existing'}});
  await tick();
  const manager=f.state.detailModel.scrollManager;
  const navigation={regionTop:false,regionBottom:true,conversationTop:false,
    conversationBottom:true,floatingTop:false,turnPaging:true};
  await assert.rejects(()=>manager.onSaveNavigation(navigation,'existing',{isTrusted:false}),{code:'E_GESTURE'});
  const result=await manager.onSaveNavigation(navigation,'existing',{isTrusted:true});
  assert.deepEqual(result.value.sites,[sample]);
  assert.deepEqual(result.value.navigation,navigation);
  const write=f.requests.find(r=>r.method==='saveScrollNavigationSettings');
  assert.equal(write.payload.etag,'existing');
  assert.equal(write.payload.target,undefined,'global preferences do not claim a page document');
  f.doc.querySelector('button[aria-label="导航设置"]').dispatch('click');await tick();
  assert.equal(f.doc.querySelectorAll('[role="switch"]').length,6);
  assert.equal(f.doc.querySelectorAll('[role="switch"]:disabled').length,0);
  [...f.doc.querySelectorAll('button')].find(b=>b.textContent==='权限与技术信息').dispatch('click');await tick();
  assert.equal(f.doc.querySelector('.ec-scroll-site-manager').dataset.view,'management');
  assert.ok(f.doc.querySelector('[data-ec-detail-action="uninstall"]'));
  f.doc.querySelector('#extension-center-back').dispatch('click');await tick();
  assert.equal(f.doc.querySelector('.ec-scroll-site-manager').dataset.view,'settings');
  f.doc.querySelector('#extension-center-back').dispatch('click');await tick();
  assert.equal(f.doc.querySelector('.ec-scroll-site-manager').dataset.view,'home');
});

test('R4.0 cancelling the original Installer returns the unsaved draft without granting access',async t=>{
  const f=await fixture(t);
  await tick();
  const manager=f.state.detailModel.scrollManager;
  const draft={...sample,origin:'https://my-ai.example'};
  f.doc.querySelector('button[aria-label="添加自定义网站"]').dispatch('click');await tick();
  for(const [key,value] of Object.entries(draft)){
    const input=f.doc.querySelector('#scroll-'+(key==='pathScope'?'path':key));
    if(input){input.value=value;input.dispatch('input');}
  }
  await manager.onReviewSite(draft,{isTrusted:true});
  assert.equal(f.reviews.length,1);
  await f.reviews[0][2]();await tick();
  assert.equal(f.doc.querySelector('.ec-scroll-site-manager').dataset.view,'editor');
  assert.equal(f.doc.querySelector('#scroll-origin').value,draft.origin);
  assert.equal(f.doc.querySelector('#scroll-mainSelector').value,'main');
  assert.equal(f.doc.querySelector('.ec-scroll-save').disabled,true,'permission is still missing');
  assert.equal(f.requests.filter(r=>r.method==='saveScrollSiteRule').length,0);
});

test('R4.0 approved Installer return retains a dirty draft and waits for Save',async t=>{
  const f=await fixture(t);
  await tick();
  const manager=f.state.detailModel.scrollManager;
  const draft={...sample,origin:'https://my-ai.example'};
  f.doc.querySelector('button[aria-label="添加自定义网站"]').dispatch('click');await tick();
  for(const [key,value] of Object.entries(draft)){
    const input=f.doc.querySelector('#scroll-'+(key==='pathScope'?'path':key));
    if(input){input.value=value;input.dispatch('input');}
  }
  await manager.onReviewSite(draft,{isTrusted:true});
  f.installed.pageRules.matches.push(draft.origin+'/*');
  f.installed.authorization.generation++;
  f.installed.manifestHash='c'.repeat(64);
  await f.reviews[0][2]();await tick();
  assert.equal(f.doc.querySelector('#scroll-origin').value,draft.origin);
  assert.equal(f.doc.querySelector('.ec-scroll-save').disabled,false,'reviewed draft is not a clean saved baseline');
  assert.equal(f.requests.filter(r=>r.method==='saveScrollSiteRule').length,0);
});

test('R4.0 failed first read is unknown state rather than an empty list or selected flags',async t=>{
  let unavailable=true;
  const f=await fixture(t,{request(method){
    if(method==='readScrollSiteConfig'&&unavailable)throw new Error('storage unavailable');
  }});
  await tick();
  const manager=f.doc.querySelector('.ec-scroll-site-manager');
  assert.match(manager.textContent,/网站规则尚未读取/);
  assert.doesNotMatch(manager.textContent,/尚无自定义网站/);
  f.doc.querySelector('button[aria-label="导航设置"]').dispatch('click');await tick();
  assert.equal(f.doc.querySelectorAll('[role="switch"]').length,0);
  unavailable=false;
  [...f.doc.querySelectorAll('button')].find(b=>b.textContent==='重新读取核对').dispatch('click');await tick();
  assert.equal(f.doc.querySelectorAll('[role="switch"]').length,5);
});

test('R4.0 cross-site removal and disabling do not request new execution permission',async t=>{
  const old={...sample,origin:'https://previous-ai.example',pathScope:'/chat'};
  const f=await fixture(t,{saved:{value:{version:1,sites:[old]},etag:'old'}});
  const manager=f.state.detailModel.scrollManager,key=old.origin+'\n'+old.pathScope;
  await manager.onSave({...old,enabled:false},'old',key,{isTrusted:true});
  assert.equal(f.reviews.length,0);
  assert.equal(f.saved().value.sites[0].enabled,false);
  await manager.onSave(null,f.saved().etag,key,{isTrusted:true});
  assert.equal(f.saved().value.sites.length,0);
  assert.equal(f.reviews.length,0);
});

test('R4.0 a known restore-scope rejection is not mislabeled as an unknown write',async t=>{
  const f=await fixture(t,{request(method){
    if(method==='saveScrollSiteRule')throw Object.assign(new Error('review required'),{code:'E_SCROLL_RESTORE_SCOPE'});
  }});
  const manager=f.state.detailModel.scrollManager;
  await assert.rejects(()=>manager.onSave(sample,'0',sample.origin+'\n/',{isTrusted:true}),
    {code:'E_SCROLL_RESTORE_SCOPE'});
  assert.equal(f.saved().etag,'0');
});

test('R4.0 read-only reconciliation adopts a committed draft without replaying the write',async t=>{
  const f=await fixture(t,{request(method,payload,storage){
    if(method==='saveScrollSiteRule'){
      storage.setSaved({value:{version:1,sites:[payload.rule]},etag:'lost-receipt'});
      throw Object.assign(new Error('reply lost'),{code:'E_TRANSPORT'});
    }
  }});
  await tick();
  // Exercise the real editor using an authorized custom origin (not a built-in).
  const origin='https://custom-ai.example';
  f.installed.pageRules.matches.push(origin+'/*');await f.ui.refresh();
  f.entry.dispatch('click');await tick();
  f.doc.querySelector('button[aria-label="添加自定义网站"]').dispatch('click');await tick();
  for(const [key,value] of Object.entries({...sample,origin})){
    const input=f.doc.querySelector('#scroll-'+(key==='pathScope'?'path':key));
    if(input){input.value=value;input.dispatch('input');}
  }
  assert.equal(f.doc.querySelector('.ec-scroll-save').disabled,false);
  f.doc.getElementById(f.doc.querySelector('.ec-scroll-save').getAttribute('form')).dispatch('submit');await tick();await tick();
  assert.match(f.doc.querySelector('.ec-scroll-site-manager').textContent,/E_CONFIG_UNKNOWN/);
  [...f.doc.querySelectorAll('button')].find(b=>b.textContent==='重新读取核对').dispatch('click');await tick();
  assert.match(f.doc.querySelector('.ec-scroll-site-manager').textContent,/核对到相同规则/);
  assert.doesNotMatch(f.doc.querySelector('.ec-scroll-site-manager').textContent,/已存在相同/);
  assert.equal(f.doc.querySelector('.ec-scroll-save').disabled,true,'reconciled draft is clean');
  assert.equal(f.requests.filter(r=>r.method==='saveScrollSiteRule').length,1);
  const input=f.doc.querySelector('#scroll-anchorSelector');input.value='.anchor';input.dispatch('input');
  assert.equal(f.doc.querySelector('.ec-scroll-save').disabled,false,'can continue editing the observed rule');
});

test('R4.0 another product tab keeps Escape away from the hidden editor',async t=>{
  const f=await fixture(t);await tick();
  f.doc.querySelector('button[aria-label="添加自定义网站"]').dispatch('click');await tick();
  const input=f.doc.querySelector('#scroll-mainSelector');input.value='main';input.dispatch('input');
  let confirms=0;window.confirm=()=>{confirms++;return false;};
  f.doc.documentElement.dataset.opendeskTab='develop';
  assert.equal(f.doc.dispatch('keydown',{key:'Escape'}).defaultPrevented,false);
  assert.equal(confirms,0);
  f.doc.documentElement.dataset.opendeskTab='tools';
  assert.equal(f.doc.dispatch('keydown',{key:'Escape'}).defaultPrevented,true);
  assert.equal(confirms,0,'returning from edits does not add another confirmation');
  assert.equal(f.doc.querySelector('[data-keep-editing]'),null);
  assert.equal(f.doc.querySelector('.ec-scroll-site-manager').dataset.view,'home');
});

test('R4 UI footer stays outside the sole content scroller and targets the real form',async t=>{
  const f=await fixture(t);await tick();
  f.doc.querySelector('#scroll-add-home').dispatch('click');await tick();
  const bar=f.doc.querySelector('.ec-scroll-actionbar'),content=f.doc.querySelector('.ec-scroll-content');
  assert.equal(content.contains(bar),false);
  assert.equal(bar.parentElement,content.parentElement);
  assert.equal(f.doc.querySelectorAll('.ec-scroll-content').length,1);
  assert.equal(f.doc.querySelectorAll('.ec-scroll-save').length,1);
  assert.equal(f.doc.querySelector('.ec-scroll-save').getAttribute('form'),'scroll-site-form');
});
test('R4 UI returns directly from unsaved edits and restores focus without writing',async t=>{
  const f=await fixture(t);await tick();
  const all=f.doc.querySelector('#scroll-builtins');all.focus();all.dispatch('click');await tick();
  assert.equal(f.doc.querySelector('#scroll-page-title').textContent,'内置网站');
  f.doc.querySelector('#extension-center-back').dispatch('click');await tick();
  assert.equal(f.doc.activeElement.id,'scroll-builtins');
  const add=f.doc.querySelector('#scroll-add-home');add.focus();add.dispatch('click');await tick();
  const input=f.doc.querySelector('#scroll-mainSelector');input.value='main';input.dispatch('input');
  f.doc.querySelector('#extension-center-back').dispatch('click');await tick();
  assert.equal(f.doc.querySelector('.ec-scroll-site-manager').dataset.view,'home');
  assert.equal(f.doc.activeElement.id,'scroll-add-home');
  assert.equal(f.doc.querySelector('#scroll-site-form'),null);
  assert.equal(f.doc.querySelector('[role="dialog"]'),null);
  assert.equal(f.requests.some(r=>r.method==='saveScrollSiteRule'),false);
  f.doc.querySelector('#scroll-add-home').dispatch('click');await tick();
  assert.equal(f.doc.querySelector('#scroll-mainSelector').value,'');
  f.doc.querySelector('#scroll-mainSelector').value='main';
  f.doc.querySelector('#scroll-mainSelector').dispatch('input');
  f.doc.defaultView.confirm=()=>{throw Error('Returning must not prompt about unsaved website edits');};
  f.state.onBack();await tick();
  assert.equal(f.state.view,'list');
  assert.equal(f.requests.some(r=>r.method==='saveScrollSiteRule'),false);
});
test('R4 toolbar navigation restores focus after the parent toolbar remounts',async t=>{
  const f=await fixture(t);await tick();
  const settings=f.doc.querySelector('#scroll-settings');settings.focus();settings.dispatch('click');await tick();
  assert.equal(f.doc.querySelector('#scroll-page-title').textContent,'导航设置');
  const management=f.doc.querySelector('#scroll-management');management.focus();management.dispatch('click');await tick();
  f.doc.querySelector('#extension-center-back').dispatch('click');await tick();
  assert.equal(f.doc.activeElement.id,'scroll-management');
  f.doc.querySelector('#extension-center-back').dispatch('click');await tick();
  assert.equal(f.doc.activeElement.id,'scroll-settings');
  const sites=f.doc.querySelector('#scroll-sites');sites.focus();sites.dispatch('click');await tick();
  const add=f.doc.querySelector('#scroll-add-sites');add.focus();add.dispatch('click');await tick();
  f.doc.querySelector('#extension-center-back').dispatch('click');await tick();
  assert.equal(f.doc.activeElement.id,'scroll-add-sites');
});
test('R4 installed header omits update and import actions across all six views',async t=>{
  const f=await fixture(t);await tick();
  const check=()=>{
    assert.equal(f.doc.querySelectorAll('[data-ec-detail-action="uninstall"]').length,1);
    assert.ok(f.doc.querySelector('.ec-detail-head .od-page-actions [data-ec-detail-action="uninstall"]'));
    assert.equal(f.doc.querySelectorAll('.ec-detail-head [data-ec-detail-action="update"]').length,0);
    assert.equal(f.doc.querySelectorAll('.ec-scroll-content .ec-detail-actions').length,0);
    assert.equal(f.doc.querySelectorAll('#extension-center-back').length,1);
  };
  check();
  for(const opener of ['scroll-builtins','scroll-sites','scroll-add-home','scroll-settings']){
    f.doc.getElementById(opener).dispatch('click');await tick();check();
    if(opener==='scroll-settings'){
      f.doc.querySelector('#scroll-management').dispatch('click');await tick();check();
      f.doc.querySelector('#extension-center-back').dispatch('click');await tick();
    }
    f.doc.querySelector('#extension-center-back').dispatch('click');await tick();
  }
  const uninstall=f.doc.querySelector('[data-ec-detail-action="uninstall"]');
  uninstall.dispatch('click',{isTrusted:false});await tick();
  assert.equal(f.doc.querySelector('[role="dialog"]'),null);
  uninstall.focus();uninstall.dispatch('click');await tick();
  assert.match(f.doc.querySelector('[role="dialog"]').textContent,/卸载「AI 对话滚动导航」/);
  assert.equal(f.requests.some(r=>r.method==='uninstallPageProgram'),false);
  f.doc.querySelector('[data-uninstall-cancel]').dispatch('click');await tick();
  assert.equal(f.doc.querySelector('[role="dialog"]'),null);
  assert.equal(f.doc.activeElement.dataset.ecDetailAction,'uninstall');
  assert.equal(f.requests.some(r=>r.method==='uninstallPageProgram'),false);
});
test('R4 header management actions fence dirty drafts and pending rule writes',async t=>{
  let finish;
  const pending=new Promise(resolve=>{finish=resolve;});
  const f=await fixture(t,{saved:{value:{version:1,sites:[sample]},etag:'existing'},
    async request(method){if(method==='saveScrollSiteRule')await pending;}});await tick();
  f.doc.querySelector('#scroll-edit-0').dispatch('click');await tick();
  const input=f.doc.querySelector('#scroll-anchorSelector');input.value='.actions';input.dispatch('input');await tick();
  const blocked=()=>{
    for(const action of f.doc.querySelectorAll('.ec-detail-head [data-ec-detail-action]')){
      assert.equal(action.disabled,true);action.dispatch('click');
    }
    assert.equal(f.doc.querySelector('[role="dialog"]'),null);
    assert.equal(f.requests.some(r=>r.method==='uninstallPageProgram'),false);
  };
  blocked();
  f.doc.querySelector('#scroll-site-form').dispatch('submit');await tick();blocked();
  finish();await tick();await tick();
  assert.equal(f.doc.querySelector('[data-ec-detail-action="uninstall"]').disabled,false);
  assert.equal(f.saved().value.sites[0].anchorSelector,'.actions');
});
test('R4 UI list deletion requires confirmation and a trusted persisted receipt',async t=>{
  const f=await fixture(t,{saved:{value:{version:1,sites:[sample]},etag:'existing'}});await tick();
  f.doc.querySelector('#scroll-sites').dispatch('click');await tick();
  f.doc.querySelector('#scroll-more-0').dispatch('click');await tick();
  [...f.doc.querySelectorAll('button')].find(b=>b.textContent==='删除规则…').dispatch('click');await tick();
  assert.equal(f.requests.some(r=>r.method==='saveScrollSiteRule'),false);
  [...f.doc.querySelectorAll('button')].find(b=>b.textContent==='取消删除').dispatch('click');await tick();
  assert.equal(f.doc.querySelectorAll('.ec-scroll-saved li').length,1);
  [...f.doc.querySelectorAll('button')].find(b=>b.textContent==='删除规则…').dispatch('click');await tick();
  [...f.doc.querySelectorAll('button')].find(b=>b.textContent==='确认删除').dispatch('click');await tick();await tick();
  const write=f.requests.find(r=>r.method==='saveScrollSiteRule');
  assert.equal(write.payload.rule,null);assert.equal(write.payload.editKey,sample.origin+'\n'+sample.pathScope);
  assert.equal(f.doc.querySelectorAll('.ec-scroll-saved li').length,0);
  assert.match(f.doc.querySelector('.ec-scroll-site-manager').textContent,/已删除规则，并从可信存储确认/);
});
test('R4 UI read failure does not render an empty custom list',async t=>{
  const f=await fixture(t,{request(method){if(method==='readScrollSiteConfig')throw Error('read offline');}});await tick();
  assert.doesNotMatch(f.doc.querySelector('.ec-scroll-site-manager').textContent,/尚未添加自定义网站/);
  assert.match(f.doc.querySelector('.ec-scroll-site-manager').textContent,/读取失败/);
  assert.equal(f.doc.querySelector('#scroll-add-home').disabled,true);
  f.doc.querySelector('#scroll-sites').dispatch('click');await tick();
  assert.equal(f.doc.querySelector('#scroll-add-sites').disabled,true);
});
test('R4 UI adding a website keeps the path empty and saves all paths unless a prefix is entered',async t=>{
  const f=await fixture(t);await tick();
  f.target.origin='https://my-ai.example';
  f.target.url=f.target.origin+'/chat/conversation-123';
  f.installed.pageRules.matches.push(f.target.origin+'/*');
  await f.ui.refresh();await tick();
  f.doc.querySelector('#scroll-add-home').dispatch('click');await tick();
  assert.equal(f.doc.querySelector('#scroll-origin').value,f.target.origin);
  assert.equal(f.doc.querySelector('#scroll-path').value,'');
  for(const [key,value] of Object.entries({mainSelector:'main',scrollSelector:'#conversation'})){
    const input=f.doc.querySelector('#scroll-'+key);input.value=value;input.dispatch('input');
  }
  f.doc.querySelector('#scroll-site-form').dispatch('submit');await tick();await tick();
  const writes=f.requests.filter(r=>r.method==='saveScrollSiteRule');
  assert.equal(writes.length,1);
  assert.equal(writes[0].payload.rule.origin,f.target.origin);
  assert.equal(writes[0].payload.rule.pathScope,'/');
  assert.equal(f.saved().value.sites[0].pathScope,'/');
  assert.equal(f.doc.querySelector('.ec-scroll-site-manager').dataset.view,'home');
  f.doc.querySelector('#scroll-edit-0').dispatch('click');await tick();
  const path=f.doc.querySelector('#scroll-path');path.value='/chat';path.dispatch('input');
  f.doc.querySelector('#scroll-site-form').dispatch('submit');await tick();await tick();
  assert.equal(f.saved().value.sites[0].pathScope,'/chat');
});
test('R4 UI preserves saved paths and clearing a narrow scope requires review for the whole website',async t=>{
  const old={...sample,origin:'https://my-ai.example',pathScope:'/chat'};
  const f=await fixture(t,{saved:{value:{version:1,sites:[old]},etag:'existing'}});await tick();
  f.installed.pageRules.matches.push(old.origin+'/chat*');
  await f.ui.refresh();await tick();
  f.doc.querySelector('#scroll-edit-0').dispatch('click');await tick();
  const path=f.doc.querySelector('#scroll-path');
  assert.equal(path.value,'/chat');
  const clear=f.doc.querySelector('button[aria-label="清空适用路径"]');
  clear.focus();clear.dispatch('click');await tick();
  assert.equal(path.value,'');
  assert.equal(f.doc.activeElement,path);
  assert.equal(f.doc.querySelector('button[aria-label="清空适用路径"]'),null);
  assert.equal(f.doc.querySelector('.ec-scroll-save').disabled,true);
  f.doc.querySelector('#scroll-site-form').dispatch('submit');await tick();
  assert.equal(f.requests.some(r=>r.method==='saveScrollSiteRule'),false);
  assert.equal(f.saved().value.sites[0].pathScope,'/chat');
  buttonWithText(f.doc,'审阅网站权限').dispatch('click');await tick();
  const review=f.requests.find(r=>r.method==='prepareScrollSitePackage');
  assert.equal(review.payload.origin,old.origin);
  assert.equal(review.payload.pathScope,'/');
  assert.equal(f.reviews.length,1);
});

// Exercise the actual locale controller and mounted business component, not source literals.
const testLocale=async(t,initial='en')=>{
  const controller=createUiLocaleController(null,{languages:[initial],storage:()=>null});
  await controller.ready;t.after(()=>controller.dispose());
  controller.setLocalePreference(initial,{persist:false});
  return controller;
};
test('AI Scroll localizes its real home and header with resolved automatic English',async t=>{
  const localeController=await testLocale(t);
  localeController.setLocalePreference('auto',{persist:false});
  const f=await fixture(t,{localeController});await tick();
  assert.equal(f.state.toolbarModel.language,'auto');
  assert.equal(f.doc.querySelector('#scroll-settings').getAttribute('aria-label'),'Navigation settings');
  assert.match(f.doc.querySelector('.ec-scroll-home').textContent,/Built-in websites/);
  assert.match(f.doc.querySelector('[data-ec-detail-action="uninstall"]').getAttribute('aria-label'),/^Uninstall page enhancement…/);
  assert.equal(f.doc.querySelector('[data-ec-detail-action="update"]'),null);
  assertReadOnly(f.requests);
});
test('AI Scroll live locale changes preserve dirty editor, focus and user CSS',async t=>{
  const localeController=await testLocale(t,'zh-CN');
  const f=await fixture(t,{localeController,saved:{value:{version:1,sites:[sample]},etag:'existing'}});await tick();
  f.doc.querySelector('#scroll-edit-0').dispatch('click');await tick();
  const input=f.doc.querySelector('#scroll-anchorSelector');
  input.value='[data-label="中文"]';input.dispatch('input');input.focus();
  const before=f.requests.length;
  localeController.setLocalePreference('en',{persist:false});await tick();
  assert.equal(f.doc.querySelector('#scroll-anchorSelector'),input);
  assert.equal(input.value,'[data-label="中文"]');
  assert.equal(f.doc.activeElement,input);
  assert.equal(f.doc.querySelector('#scroll-mainSelector').getAttribute('placeholder'),'CSS or select on page');
  assert.equal(f.doc.querySelector('#extension-center-back').getAttribute('aria-label'),'Back to app home');
  for(const language of ['ja','zh-TW','en']){
    localeController.setLocalePreference(language,{persist:false});await tick();
    assert.equal(f.doc.querySelector('#scroll-anchorSelector'),input);
    assert.equal(input.value,'[data-label="中文"]');
    assert.equal(f.doc.activeElement,input);
    assert.equal(f.doc.querySelector('.ec-scroll-site-manager').dataset.view,'editor');
  }
  f.doc.querySelector('#extension-center-back').dispatch('click');await tick();
  assert.equal(f.doc.querySelector('.ec-scroll-site-manager').dataset.view,'home');
  assert.equal(f.doc.querySelector('[data-keep-editing]'),null);
  assert.equal(f.requests.length,before);
  assert.equal(f.reviews.length,0);
});

test('AI Scroll all six views localize in place without replaying business work',async t=>{
  const localeController=await testLocale(t,'zh-CN');
  const f=await fixture(t,{localeController,saved:{value:{version:1,sites:[sample]},etag:'existing'}});await tick();
  const reads=f.requests.length;
  for(const [locale,settings,builtins] of [
    ['en','Navigation settings','Built-in websites'],['ja','ナビ設定','組み込みサイト'],
    ['zh-TW','導覽設定','內建網站'],['zh-CN','导航设置','内置网站']
  ]){
    localeController.setLocalePreference(locale,{persist:false});await tick();
    assert.equal(f.doc.querySelector('#scroll-settings').getAttribute('aria-label'),settings);
    assert.ok(f.doc.querySelector('.ec-scroll-home').textContent.includes(builtins));
    for(const [opener,view] of [['scroll-builtins','builtins'],['scroll-sites','sites'],['scroll-settings','settings']]){
      f.doc.getElementById(opener).dispatch('click');await tick();
      assert.equal(f.doc.querySelector('.ec-scroll-site-manager').dataset.view,view);
      if(locale==='en')assert.doesNotMatch(f.doc.querySelector('.ec-scroll-content').textContent,/\p{Script=Han}/u);
      assert.equal(f.doc.querySelector('[data-ec-detail-action="update"]'),null);
      if(view==='settings'){
        f.doc.getElementById('scroll-management').dispatch('click');await tick();
        assert.equal(f.doc.querySelector('.ec-scroll-site-manager').dataset.view,'management');
        if(locale==='en')assert.doesNotMatch(f.doc.querySelector('.ec-scroll-content').textContent,/\p{Script=Han}/u);
        f.doc.getElementById('extension-center-back').dispatch('click');await tick();
      }
      f.doc.getElementById('extension-center-back').dispatch('click');await tick();
    }
    f.doc.getElementById('scroll-edit-0').dispatch('click');await tick();
    assert.equal(f.doc.querySelector('.ec-scroll-site-manager').dataset.view,'editor');
    if(locale==='en')assert.doesNotMatch(f.doc.querySelector('.ec-scroll-content').textContent,/\p{Script=Han}/u);
    f.doc.getElementById('extension-center-back').dispatch('click');await tick();
    assert.equal(f.doc.querySelector('.ec-scroll-site-manager').dataset.view,'home');
  }
  assert.equal(f.requests.length,reads,'locale and view changes cannot re-read or mutate the configuration');
  assert.equal(f.reviews.length,0);
});

test('AI Scroll controller failures keep semantic copy across language changes and never replay a write',async t=>{
  const localeController=await testLocale(t,'en');
  const f=await fixture(t,{localeController,saved:{value:{version:1,sites:[sample]},etag:'existing'},
    request(method){if(method==='saveScrollSiteRule')return {value:{version:1,sites:[]},etag:'mismatch'};}});await tick();
  f.doc.getElementById('scroll-edit-0').dispatch('click');await tick();
  const input=f.doc.getElementById('scroll-anchorSelector');input.value='.actions';input.dispatch('input');
  f.doc.getElementById('scroll-site-form').dispatch('submit');await tick();await tick();
  const text=()=>f.doc.querySelector('.ec-scroll-error').textContent;
  assert.match(text(),/write outcome is unconfirmed/);assert.match(text(),/receipt does not match/);
  const before=f.requests.length;
  localeController.setLocalePreference('ja',{persist:false});await tick();
  assert.match(text(),/書き込み/);assert.doesNotMatch(text(),/receipt does not match/);
  assert.equal(f.doc.getElementById('scroll-anchorSelector'),input);
  assert.equal(input.value,'.actions');
  f.doc.getElementById('scroll-site-form').dispatch('submit');await tick();
  assert.equal(f.requests.length,before);
  assert.equal(f.requests.filter(row=>row.method==='saveScrollSiteRule').length,1);
  assert.equal(f.reviews.length,0);
});
test('AI Scroll preserves a user-supplied title when the UI language changes',async t=>{
  const localeController=await testLocale(t,'en'),title='我的导航 <自定义>';
  const f=await fixture(t,{localeController,installed:{title}});await tick();
  assert.equal(f.state.detailModel.title,title);
  localeController.setLocalePreference('ja',{persist:false});await tick();
  assert.equal(f.state.detailModel.title,title);
  assert.ok(f.doc.querySelector('.ec-detail-head').textContent.includes(title));
  assert.equal(f.doc.querySelector('自定义'),null);
});
