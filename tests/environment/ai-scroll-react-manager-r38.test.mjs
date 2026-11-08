import test from 'node:test';
import assert from 'node:assert/strict';
import {createExtensionCenterDOM} from '../helpers/extension-center-react-dom.mjs';
import {createExtensionCenter} from '../../src/ui/extension-center.js';
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
      'https://gemini.google.com/*'],excludeMatches:[],runAt:'document_idle',allFrames:false,world:'USER_SCRIPT'}};
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
  const api={runtime:{getURL:path=>'chrome-extension://fixture/'+path},
    storage:{local:{get:async()=>({[SIDEBAR_TOOL_STORE]:[],
      [SIDEBAR_TOOL_ENABLE_STORE]:{}})},onChanged:{addListener(){},removeListener(){}}}};
  const currentPageTarget={snapshot:target,capture:()=>({...target}),
    refresh:async()=>({...target}),
    revalidate:async()=>({...target}),subscribe:()=>()=>{}};
  const sidebarTools={openPagePackageReview(...args){reviews.push(args);return true;}};
  const ui=createExtensionCenter({api,client,doc,extensionList:adapter,
    sidebarTools,taskWorkbench:{},currentPageTarget});
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
  assert.equal(f.doc.querySelector('#scroll-path').value,'/c',
    'current conversation ID must not be used as the default scope');
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
    conversationBottom:true,floatingTop:false};
  await assert.rejects(()=>manager.onSaveNavigation(navigation,'existing',{isTrusted:false}),{code:'E_GESTURE'});
  const result=await manager.onSaveNavigation(navigation,'existing',{isTrusted:true});
  assert.deepEqual(result.value.sites,[sample]);
  assert.deepEqual(result.value.navigation,navigation);
  const write=f.requests.find(r=>r.method==='saveScrollNavigationSettings');
  assert.equal(write.payload.etag,'existing');
  assert.equal(write.payload.target,undefined,'global preferences do not claim a page document');
  f.doc.querySelector('button[aria-label="导航设置"]').dispatch('click');await tick();
  assert.equal(f.doc.querySelectorAll('[role="switch"]').length,5);
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
  const draft={...sample,origin:'https://my-ai.example',pathScope:'/talk'};
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
  const draft={...sample,origin:'https://my-ai.example',pathScope:'/talk'};
  f.doc.querySelector('button[aria-label="添加自定义网站"]').dispatch('click');await tick();
  for(const [key,value] of Object.entries(draft)){
    const input=f.doc.querySelector('#scroll-'+(key==='pathScope'?'path':key));
    if(input){input.value=value;input.dispatch('input');}
  }
  await manager.onReviewSite(draft,{isTrusted:true});
  f.installed.pageRules.matches.push(draft.origin+'/talk*');
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
  assert.equal(confirms,0,'dirty navigation uses the inline confirmation');
  assert.ok(f.doc.querySelector('[data-keep-editing]'));
  assert.equal(f.doc.querySelector('#scroll-mainSelector').value,'main');
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
test('R4 UI returns focus to the opener and protects dirty drafts before discarding',async t=>{
  const f=await fixture(t);await tick();
  const all=f.doc.querySelector('#scroll-builtins');all.focus();all.dispatch('click');await tick();
  assert.equal(f.doc.querySelector('#scroll-page-title').textContent,'内置网站');
  f.doc.querySelector('#extension-center-back').dispatch('click');await tick();
  assert.equal(f.doc.activeElement.id,'scroll-builtins');
  const add=f.doc.querySelector('#scroll-add-home');add.focus();add.dispatch('click');await tick();
  const input=f.doc.querySelector('#scroll-mainSelector');input.value='main';input.dispatch('input');
  f.doc.querySelector('#extension-center-back').dispatch('click');await tick();
  assert.equal(f.doc.querySelector('#scroll-mainSelector').value,'main');
  assert.ok(f.doc.querySelector('[data-keep-editing]'));
  f.doc.querySelector('[data-keep-editing]').dispatch('click');await tick();
  assert.equal(f.doc.activeElement.id,'scroll-origin');
  f.doc.querySelector('#extension-center-back').dispatch('click');await tick();
  [...f.doc.querySelectorAll('button')].find(b=>b.textContent==='放弃更改').dispatch('click');await tick();
  assert.equal(f.doc.querySelector('.ec-scroll-site-manager').dataset.view,'home');
  assert.equal(f.doc.activeElement.id,'scroll-add-home');
  assert.equal(f.requests.some(r=>r.method==='saveScrollSiteRule'),false);
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
test('R4 UI pending discard confirmation fences form submission without losing the valid draft',async t=>{
  const f=await fixture(t,{saved:{value:{version:1,sites:[sample]},etag:'existing'}});await tick();
  f.doc.querySelector('#scroll-edit-0').dispatch('click');await tick();
  const input=f.doc.querySelector('#scroll-anchorSelector');input.value='.actions';input.dispatch('input');
  f.doc.querySelector('#extension-center-back').dispatch('click');await tick();
  assert.ok(f.doc.querySelector('[data-keep-editing]'));
  f.doc.querySelector('#scroll-site-form').dispatch('submit');await tick();
  assert.equal(f.requests.some(r=>r.method==='saveScrollSiteRule'),false);
  assert.equal(f.doc.querySelector('#scroll-anchorSelector').value,'.actions');
});
