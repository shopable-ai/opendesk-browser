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
async function fixture(t){
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
  let saved={value:{version:1,sites:[]},etag:'0'};
  const client={async request(method,payload){
    requests.push({method,payload});
    if(method==='listPagePrograms')return {installed:[structuredClone(installed)]};
    if(method==='readScrollSiteConfig')return structuredClone(saved);
    if(method==='pickScrollSiteElement')return {state:'selected',field:payload.field,selector:'article',count:2};
    if(method==='saveScrollSiteRule'){
      const rule=payload.rule;
      saved={value:{version:1,sites:rule?[rule]:[]},etag:'after-save'};
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
  return {doc,state,requests,reviews,saved:()=>saved,installed,entry};
}
test('R3.8 actual React detail exposes only four CSS fields and one save action',async t=>{
  const f=await fixture(t);
  await tick();
  assert.equal(f.doc.querySelectorAll('.ec-scroll-builtins li').length,3);
  assert.equal(f.doc.querySelectorAll('.ec-scroll-selector').length,0);
  const add=[...f.doc.querySelectorAll('.ec-scroll-title button')].find(b=>b.textContent.includes('添加网站'));
  assert.ok(add);add.dispatch('click');
  assert.equal(f.doc.querySelectorAll('.ec-scroll-selector').length,4);
  assert.equal(f.doc.querySelectorAll('.ec-scroll-selector button').length,4);
  assert.equal(f.doc.querySelectorAll('.ec-scroll-save').length,1);
  assert.equal(f.doc.querySelectorAll('[name="buttonPosition"]').length,0);
  assert.equal(f.doc.querySelectorAll('.ec-site-upgrade').length,0,
    'permission-only legacy form must not replace the editor');
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
  assert.equal(f.requests.filter(r=>r.method==='readScrollSiteConfig').length,1);
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
