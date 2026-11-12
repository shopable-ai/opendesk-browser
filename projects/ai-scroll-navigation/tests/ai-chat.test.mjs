import test from 'node:test';
import assert from 'node:assert/strict';
import {createExtensionCenterDOM} from '../../../tests/helpers/extension-center-react-dom.mjs';
import {createExtensionCenter} from '../../../src/ui/extension-center.js';
import {createUiLocaleController} from '../../../src/ui/app-localization.js';
import {SIDEBAR_TOOL_STORE} from '../../../src/ui/sidebar-tools/package.js';
import {SIDEBAR_TOOL_ENABLE_STORE} from '../../../src/ui/sidebar-tools/lifecycle.js';

// Real React, shared Dock/Frame, validator and extension-center controller.
// Only transport/provider leases and persisted backend state are simulated.
// Synthetic isTrusted tests controller guards, not native Chrome activation.
const id='opendesk.ai-scroll-navigation';
const navigation={regionTop:true,regionBottom:true,conversationTop:true,conversationBottom:true,floatingTop:true,turnPaging:true};
const site={origin:'https://chatgpt.com',pathScope:'/',mainSelector:'main',
  scrollSelector:'#conversation',messageSelector:'article',anchorSelector:'',enabled:true};
const proposal=(patch={floatingTop:false})=>({type:'navigation',message:'已提议关闭悬浮回顶',patch});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const settle=async()=>{await tick();await tick();};
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const coded=code=>Object.assign(new Error(code),{code});
const autoRequest='自动配置当前网页';
const observed={state:'observed',candidates:[{id:'candidate-1',mainSelector:'main',
  scrollSelector:'main',messageSelector:'article',anchorSelector:'',metrics:{messageCount:2,scrollable:true}}]};
const observeProposal={type:'observe',message:'检查当前页面结构'};
const candidateProposal={type:'site-candidate',candidateId:'candidate-1',message:'使用已观察的候选配置'};

async function fixture(t,options={}){
  const {doc,state,adapter}=createExtensionCenterDOM(t);
  const installed={programId:id,title:'AI 对话滚动导航',version:'0.4.15',revision:8,
    manifestHash:'a'.repeat(64),sourceHash:'b'.repeat(64),enabled:true,nativeState:'registered',
    authorization:{status:'active',generation:3,installationId:'installation-r8'},
    pageRules:{matches:['https://chatgpt.com/*'],excludeMatches:[],runAt:'document_idle',allFrames:false,world:'USER_SCRIPT'}};
  let present=true,saved={value:{version:1,sites:[{...site}],navigation:{...navigation}},etag:'initial'};
  const requests=[],rounds=[],continuations=[],leases=[],providers=new Set(),grants=new Set();
  let disposed=0,cancelled=0,sequence=0;
  const client={async request(method,payload){
    requests.push({method,payload:structuredClone(payload)});
    if(method==='listPagePrograms')return {installed:present?[structuredClone(installed)]:[]};
    if(method==='readScrollSiteConfig')return structuredClone(options.readback?.(saved,requests)||saved);
    if(method==='observeScrollSitePage')return options.observe?options.observe(payload):structuredClone(observed);
    if(method==='saveScrollNavigationSettings'){
      if(payload.etag!==saved.etag)throw coded('E_CONFIG_CONFLICT');
      saved={value:{...saved.value,navigation:structuredClone(payload.navigation)},etag:'saved-'+(++sequence)};
      return structuredClone(saved);
    }
    if(method==='saveScrollSiteRule'){
      if(payload.etag!==saved.etag)throw coded('E_CONFIG_CONFLICT');
      const sites=saved.value.sites.filter(rule=>rule.origin+'\n'+rule.pathScope!==payload.editKey);
      if(payload.rule)sites.push(structuredClone(payload.rule));
      saved={value:{...saved.value,sites},etag:'saved-'+(++sequence)};
      return structuredClone(saved);
    }
    if(method==='uninstallPageProgram'){
      present=false;
      return {uninstalled:true,nativeState:'unregistered',manifestHash:installed.manifestHash,
        installationId:installed.authorization.installationId,managedCleanup:{state:'retired'}};
    }
    throw Error('Unexpected backend request: '+method);
  }};
  const subscribe=set=>listener=>{set.add(listener);return ()=>set.delete(listener);};
  const createScrollConversation=()=>({
    request(args){const pending=deferred();rounds.push({...pending,args});return pending.promise;},
    cancel(){cancelled++;return options.cancel?options.cancel():Promise.resolve({terminalStatus:'cancelled'});},
    subscribeProviderChanges:subscribe(providers),subscribeAuthorizationChanges:subscribe(grants),
    dispose(){disposed++;}
  });
  const api={runtime:{getURL:path=>'chrome-extension://fixture/'+path},
    storage:{local:{get:async()=>({[SIDEBAR_TOOL_STORE]:[],[SIDEBAR_TOOL_ENABLE_STORE]:{}})},
      onChanged:{addListener(){},removeListener(){}}}};
  const target={status:'available',windowId:9,tabId:11,frameId:0,documentId:'document-1',
    url:'https://chatgpt.com/c/example',origin:'https://chatgpt.com'};
  const currentPageTarget={capture:()=>({...target}),refresh:async()=>({...target}),
    async revalidate(captured){
      if(['tabId','windowId','documentId','url','origin'].some(key=>captured[key]!==target[key]))
        throw coded('E_DOCUMENT_STALE');
      return {...target};
    },subscribe:()=>()=>{}};
  const ui=createExtensionCenter({api,client,doc,extensionList:adapter,sidebarTools:{},
    taskWorkbench:{},currentPageTarget,createScrollConversation,localeController:options.localeController});
  t.after(()=>ui.dispose());
  await ui.refresh();
  const entry=[...doc.querySelectorAll('button[data-extension-key]')].find(button=>
    button.dataset.extensionKey==='page:'+id&&button.dataset.extensionAction==='main');
  assert.ok(entry,'installed product has a real entry');entry.dispatch('click');await settle();
  const f={doc,state,ui,requests,rounds,continuations,leases,providers,grants,target,
    saved:()=>structuredClone(saved),disposed:()=>disposed,cancelled:()=>cancelled,
    writes:()=>requests.filter(row=>row.method.startsWith('save')),
    resolve(index,value=proposal(),{continuation=false}={}){
      const lease={checks:0,releases:0,async assertWrite(){this.checks++;},release(){this.releases++;}};
      const continueWith=continuation?(context,args)=>{
        const pending=deferred();continuations.push({...pending,context,args,lease});return pending.promise;
      }:undefined;
      leases.push(lease);rounds[index].resolve({proposal:value,authorization:lease,continueWith});return lease;
    }};
  assert.ok(doc.getElementById('scroll-ai-toggle'));
  return f;
}
const element=(f,selector)=>{const node=f.doc.querySelector(selector);assert.ok(node,selector);return node;};
const input=(f,selector,value)=>{const node=element(f,selector);node.value=value;node.dispatch('input');return node;};
const click=async(f,selector,extra)=>{element(f,selector).dispatch('click',extra);await settle();};
const openChat=f=>click(f,'#scroll-ai-toggle');
async function send(f,request='关闭悬浮回顶',extra){
  input(f,'#scroll-ai-input',request);
  await click(f,'#scroll-ai-panel .od-conversation-action--primary',extra);
}
const log=f=>element(f,'#scroll-ai-panel [role="log"]').textContent;
const feedback=f=>element(f,'.ec-scroll-ai-feedback').textContent;

test('AI button and Dock close preserve website draft, Chat draft and DOM focus targets',async t=>{
  const f=await fixture(t);
  assert.equal(element(f,'#scroll-ai-panel').hidden,true);
  await click(f,'#scroll-edit-0');
  const css=input(f,'#scroll-anchorSelector','[data-user="draft"]');css.focus();
  assert.equal(f.doc.activeElement,css);
  await openChat(f);
  const chat=element(f,'#scroll-ai-input');
  assert.equal(f.doc.activeElement,chat);
  input(f,'#scroll-ai-input','尚未发送的 Chat 草稿');
  await click(f,'#scroll-ai-panel .od-conversation-close');
  assert.equal(element(f,'#scroll-ai-panel').hidden,true);
  assert.equal(f.doc.activeElement,element(f,'#scroll-ai-toggle'));
  assert.equal(element(f,'#scroll-anchorSelector'),css);assert.equal(css.value,'[data-user="draft"]');
  css.focus();assert.equal(f.doc.activeElement,css,'original website editor stays operable');
  await openChat(f);
  assert.equal(element(f,'#scroll-ai-input'),chat);assert.equal(chat.value,'尚未发送的 Chat 草稿');
  assert.equal(f.doc.activeElement,chat);
  await openChat(f);await openChat(f);
  assert.equal(chat.value,'尚未发送的 Chat 草稿');assert.equal(css.value,'[data-user="draft"]');
  assert.equal(f.rounds.length,0);assert.deepEqual(f.writes(),[]);
});

test('explicit floatingTop off saves through original controller, etag and readback, then displays receipt',async t=>{
  const f=await fixture(t);await openChat(f);await send(f);
  assert.equal(f.rounds.length,1);assert.equal(f.rounds[0].args.event.isTrusted,true);
  assert.equal(f.rounds[0].args.context.documentObserved,false);
  const lease=f.resolve(0);await settle();
  assert.equal(f.writes().length,1);
  const write=f.writes()[0];assert.equal(write.method,'saveScrollNavigationSettings');
  assert.deepEqual(write.payload,{programId:id,manifestHash:'a'.repeat(64),installationId:'installation-r8',
    expectedGeneration:3,etag:'initial',navigation:{...navigation,floatingTop:false}});
  assert.equal(f.saved().value.navigation.floatingTop,false);
  const at=f.requests.indexOf(write);
  for(let attempt=0;attempt<8&&!f.requests.slice(at+1).some(row=>row.method==='readScrollSiteConfig');attempt++)
    await tick();
  assert.ok(f.requests.slice(at+1).some(row=>row.method==='readScrollSiteConfig'),
    'committed change must be followed by an explicit trusted readback');
  assert.match(log(f),/saved-1/);assert.match(log(f),/悬浮回顶/);
  assert.equal(element(f,'#scroll-ai-input').value,'');
  assert.ok(lease.checks>=1);assert.equal(lease.releases,1);
  await click(f,'#scroll-settings');
  const flag=[...f.doc.querySelectorAll('[role="switch"]')].find(node=>node.getAttribute('aria-label')==='滚动后悬浮回顶');
  assert.ok(flag);assert.equal(flag.checked,false);
});

test('pure chat displays the response without business writes or write authorization',async t=>{
  const f=await fixture(t);await openChat(f);await send(f,'悬浮回顶是什么？');
  const lease=f.resolve(0,{type:'message',message:'这是滚动后返回顶部的按钮。'});await settle();
  assert.match(log(f),/这是滚动后返回顶部的按钮/);assert.deepEqual(f.writes(),[]);
  assert.equal(lease.checks,0);assert.equal(lease.releases,1);
});

test('proposal carrying an unrequested field is rejected without writes',async t=>{
  const f=await fixture(t);await openChat(f);await send(f);
  const lease=f.resolve(0,proposal({floatingTop:false,regionTop:false}));await settle();
  assert.match(log(f),/E_SCROLL_AI_PROPOSAL/);assert.deepEqual(f.writes(),[]);
  assert.equal(lease.checks,0);assert.equal(lease.releases,1);
});

test('manually changing website draft during inference rejects the old proposal',async t=>{
  const f=await fixture(t);await click(f,'#scroll-edit-0');await openChat(f);await send(f);
  input(f,'#scroll-anchorSelector','.manual-edit');
  f.resolve(0);await settle();
  assert.match(log(f),/E_CONFIG_CONFLICT/);assert.deepEqual(f.writes(),[]);
  assert.equal(element(f,'#scroll-anchorSelector').value,'.manual-edit');
  assert.equal(f.saved().value.navigation.floatingTop,true);
});

test('untrusted send and original controller save gesture cannot write',async t=>{
  const f=await fixture(t);await openChat(f);await send(f,'关闭悬浮回顶',{isTrusted:false});
  assert.equal(f.rounds.length,0);assert.deepEqual(f.writes(),[]);
  await assert.rejects(f.state.detailModel.scrollManager.onSaveNavigation(
    {...navigation,floatingTop:false},'initial',{isTrusted:false}),{code:'E_GESTURE'});
  assert.deepEqual(f.writes(),[]);
});

test('Stop cancels the original signal and ignores a late successful proposal',async t=>{
  const f=await fixture(t);await openChat(f);await send(f);
  await click(f,'#scroll-ai-panel .od-conversation-action--stop',{isTrusted:false});
  assert.equal(f.cancelled(),0);assert.equal(f.rounds[0].args.signal.aborted,false);
  await click(f,'#scroll-ai-panel .od-conversation-action--stop');
  assert.equal(f.cancelled(),1);assert.equal(f.rounds[0].args.signal.aborted,true);
  const lease=f.resolve(0);await settle();
  assert.deepEqual(f.writes(),[]);assert.equal(lease.checks,0);assert.equal(lease.releases,1);
  assert.match(feedback(f),/停止/);assert.doesNotMatch(log(f),/saved-1/);
});

test('unknown inference remains locked after hide and reopen',async t=>{
  const f=await fixture(t);await openChat(f);await send(f);
  f.rounds[0].reject(coded('E_AI_UNKNOWN'));await settle();
  assert.match(feedback(f),/未知|不确定|未确认/);
  await click(f,'#scroll-ai-panel .od-conversation-close');await openChat(f);
  assert.equal(element(f,'#scroll-ai-panel .od-conversation-action--primary').disabled,true);
  await send(f);assert.equal(f.rounds.length,1);assert.deepEqual(f.writes(),[]);
});

test('unknown cancellation plus late reply stays locked after reopening',async t=>{
  const f=await fixture(t,{cancel:()=>Promise.reject(coded('E_AI_OUTCOME_UNKNOWN'))});
  await openChat(f);await send(f);await click(f,'#scroll-ai-panel .od-conversation-action--stop');
  f.resolve(0);await settle();
  await click(f,'#scroll-ai-panel .od-conversation-close');await openChat(f);
  assert.equal(element(f,'#scroll-ai-panel .od-conversation-action--primary').disabled,true);
  assert.deepEqual(f.writes(),[]);assert.equal(f.rounds.length,1);
});

for(const kind of ['provider','authorization'])test(`${kind} change invalidates late inference without writes`,async t=>{
  const f=await fixture(t);await openChat(f);await send(f);
  const listeners=kind==='provider'?f.providers:f.grants;
  assert.equal(listeners.size,1);for(const notify of listeners)notify();
  assert.equal(f.rounds[0].args.signal.aborted,true);
  const lease=f.resolve(0);await settle();
  assert.deepEqual(f.writes(),[]);assert.equal(lease.checks,0);assert.equal(lease.releases,1);
});

test('mismatched backend readback never reports a verified save or replays it on reopen',async t=>{
  const f=await fixture(t,{readback:saved=>saved.etag==='initial'?saved:{...saved,etag:'different-readback'}});
  await openChat(f);await send(f);f.resolve(0);await settle();
  assert.equal(f.writes().length,1);assert.doesNotMatch(log(f),/saved-1/);
  assert.match(feedback(f),/未知|不确定|未确认/);
  await click(f,'#scroll-ai-panel .od-conversation-close');await openChat(f);
  assert.equal(element(f,'#scroll-ai-panel .od-conversation-action--primary').disabled,true);
  assert.equal(f.writes().length,1);
});

test('uninstall through the real confirmation removes Chat and subscriptions and fences late replies',async t=>{
  const f=await fixture(t);await openChat(f);await send(f);
  await click(f,'[data-ec-detail-action="uninstall"]');
  await click(f,'.od-uninstall-confirm');
  assert.equal(f.requests.filter(row=>row.method==='uninstallPageProgram').length,1);
  const lifecycle={chatMounted:Boolean(f.doc.getElementById('scroll-ai-panel')),
    providers:f.providers.size,grants:f.grants.size,disposed:f.disposed(),
    aborted:f.rounds[0].args.signal.aborted};
  const lease=f.resolve(0);await settle();
  assert.deepEqual(f.writes(),[],'uninstalled identity cannot write even with a late proposal');
  assert.equal(lease.releases,1);
  assert.deepEqual(lifecycle,{chatMounted:false,providers:0,grants:0,disposed:1,aborted:true},
    'uninstall must release the mounted conversation and its inference/subscriptions');
});


test('AI site save applies only its patch and preserves unrelated unsaved CSS draft',async t=>{
  const f=await fixture(t);await click(f,'#scroll-edit-0');
  input(f,'#scroll-anchorSelector','.unsaved-anchor');
  await openChat(f);await send(f,'messageSelector="section.reply"');
  f.resolve(0,{type:'site',message:'只修改消息节点',patch:{messageSelector:'section.reply'}});await settle();
  assert.equal(f.writes().length,1);assert.equal(f.writes()[0].method,'saveScrollSiteRule');
  assert.equal(f.writes()[0].payload.etag,'initial');
  assert.deepEqual(f.saved().value.sites,[{...site,messageSelector:'section.reply'}]);
  assert.equal(element(f,'#scroll-messageSelector').value,'section.reply');
  assert.equal(element(f,'#scroll-anchorSelector').value,'.unsaved-anchor');
  assert.equal(element(f,'.ec-scroll-save').disabled,false,'unrequested CSS remains an unsaved edit');
  assert.match(log(f),/saved-1/);
});

for(const [locale,labels] of [
  ['zh-CN',['发送','AI 设置','收起对话','调整对话与原扩展的高度','对话及已核实操作结果']],
  ['en',['Send','AI settings','Collapse conversation','Resize conversation and extension','Conversation and verified results']],
  ['ja',['送信','AI 設定','対話を折りたたむ','対話と拡張機能の高さを調整','対話と確認済みの結果']],
  ['zh-TW',['傳送','AI 設定','收起對話','調整對話與原擴充功能的高度','對話及已核實的操作結果']]
])test(`Chat presentation uses ${locale} labels without changing business state`,async t=>{
  const localeController=createUiLocaleController(null,{languages:[locale],storage:()=>null});
  await localeController.ready;localeController.setLocalePreference(locale,{persist:false});
  t.after(()=>localeController.dispose());
  const f=await fixture(t,{localeController});await openChat(f);
  for(const [selector,label] of [
    ['.od-conversation-action--primary',labels[0]],['.od-conversation-settings',labels[1]],
    ['.od-conversation-close',labels[2]],['[role="separator"]',labels[3]],['[role="log"]',labels[4]]
  ])assert.equal(element(f,'#scroll-ai-panel '+selector).getAttribute('aria-label'),label);
  assert.equal(element(f,'#scroll-ai-panel .od-conversation-action--primary').getAttribute('title'),labels[0]);
  assert.deepEqual(f.writes(),[]);assert.equal(f.rounds.length,0);
});

for(const [locale,guidance] of [
  ['zh-CN','检查 Codex CLI 兼容性和受限会话设置'],
  ['en','check Codex CLI compatibility and restricted-session settings'],
  ['ja','Codex CLI の互換性と制限付きセッションの設定を確認'],
  ['zh-TW','檢查 Codex CLI 相容性和受限工作階段設定']
])test(`CODEX_UNSUPPORTED displays safe ${locale} guidance and retains drafts without writes`,async t=>{
  const localeController=createUiLocaleController(null,{languages:[locale],storage:()=>null});
  await localeController.ready;localeController.setLocalePreference(locale,{persist:false});
  t.after(()=>localeController.dispose());
  const f=await fixture(t,{localeController});await click(f,'#scroll-edit-0');
  input(f,'#scroll-anchorSelector','.unsaved-anchor');
  const before=f.saved();await openChat(f);await send(f);
  assert.equal(f.rounds.length,1);
  f.rounds[0].reject(Object.assign(new Error('PRIVATE_TRANSPORT model=SECRET_MODEL token=SECRET_TOKEN'),
    {code:'CODEX_UNSUPPORTED',reason:'PRIVATE_REASON',stderr:'PRIVATE_STDERR'}));await settle();
  assert.match(log(f),/CODEX_UNSUPPORTED/);assert.ok(log(f).includes(guidance));
  assert.doesNotMatch(log(f),/E_AI_RESPONSE|PRIVATE_|SECRET_/);
  assert.equal(element(f,'#scroll-ai-input').value,'关闭悬浮回顶');
  assert.equal(element(f,'#scroll-anchorSelector').value,'.unsaved-anchor');
  assert.deepEqual(f.saved(),before);assert.deepEqual(f.writes(),[]);
  await click(f,'#scroll-ai-panel .od-conversation-close');await openChat(f);
  assert.equal(element(f,'#scroll-ai-input').value,'关闭悬浮回顶');
  assert.equal(f.rounds.length,1,'no automatic retry');
});

for(const code of ['CODEX_PRIVATE_SECRET','CODEX_UNSUPPORTED SECRET_TOKEN','E_PRIVATE_<script>SECRET_TOKEN</script>'])
  test(`unsafe arbitrary error code ${JSON.stringify(code)} uses a sanitized fallback`,async t=>{
    const f=await fixture(t);await click(f,'#scroll-edit-0');
    input(f,'#scroll-anchorSelector','.unsaved-anchor');const before=f.saved();
    await openChat(f);await send(f);
    f.rounds[0].reject(Object.assign(new Error('PRIVATE_TRANSPORT SECRET_MODEL SECRET_TOKEN'),{code}));await settle();
    assert.match(log(f),/E_AI_RESPONSE/);assert.doesNotMatch(log(f),/PRIVATE_|SECRET_|<script>/);
    assert.equal(element(f,'#scroll-ai-input').value,'关闭悬浮回顶');
    assert.equal(element(f,'#scroll-anchorSelector').value,'.unsaved-anchor');
    assert.deepEqual(f.saved(),before);assert.deepEqual(f.writes(),[]);
    assert.equal(f.rounds.length,1);
  });

for(const [code,guidance] of [
  ['CODEX_MISSING','请在本机安装 Codex 并登录'],
  ['CODEX_LOGIN_REQUIRED','请在本机运行 codex login'],
  ['CODEX_INITIALIZING','本机 Codex 正在初始化']
])test(`${code} keeps its stable identifier and fixed capability guidance`,async t=>{
  const f=await fixture(t);await openChat(f);await send(f);const before=f.saved();
  f.rounds[0].reject(Object.assign(new Error('PRIVATE_TRANSPORT SECRET_TOKEN'),{code}));await settle();
  assert.ok(log(f).includes(code));assert.ok(log(f).includes(guidance));
  assert.doesNotMatch(log(f),/E_AI_RESPONSE|PRIVATE_|SECRET_/);
  assert.equal(element(f,'#scroll-ai-input').value,'关闭悬浮回顶');
  assert.deepEqual(f.saved(),before);assert.deepEqual(f.writes(),[]);assert.equal(f.rounds.length,1);
});


async function beginObservation(f){
  await openChat(f);await send(f,autoRequest);
  assert.equal(f.rounds.length,1);
  assert.equal(f.rounds[0].args.context.documentObserved,false);
  assert.equal(f.rounds[0].args.context.autoConfigureCurrentSite,true);
  const lease=f.resolve(0,observeProposal,{continuation:true});await settle();
  assert.equal(f.continuations.length,1,'one continuation after authorized observation');
  assert.equal(f.leases.length,1);assert.equal(f.continuations[0].lease,lease);
  assert.equal(f.continuations[0].args.signal,f.rounds[0].args.signal);
  assert.equal(f.continuations[0].context.documentObserved,true);
  assert.equal(lease.releases,0,'lease spans both decisions and verified save');
  return lease;
}

test('automatic current-page configuration observes once and saves the selected candidate through original CAS/readback',async t=>{
  const f=await fixture(t);const lease=await beginObservation(f);
  const observation=f.requests.find(row=>row.method==='observeScrollSitePage');
  assert.ok(observation);assert.deepEqual(f.writes(),[]);
  const context=f.continuations[0].context;
  assert.deepEqual(context.observation,{origin:site.origin,...observed});
  for(const roundContext of [f.rounds[0].args.context,context]){
    const serialized=JSON.stringify(roundContext);
    assert.doesNotMatch(serialized,/document-1|expectedUrl|windowId|tabId|frameId|\/c\/example|body|textContent|innerHTML/);
  }
  f.continuations[0].resolve(candidateProposal);await settle();
  assert.equal(f.writes().length,1);
  const write=f.writes()[0];assert.equal(write.method,'saveScrollSiteRule');
  assert.equal(write.payload.etag,'initial');
  assert.deepEqual(write.payload.target,observation.payload.target,'save reuses exact observed target');
  assert.deepEqual(write.payload.rule,{...site,scrollSelector:'main'});
  assert.deepEqual(f.saved().value.sites,[{...site,scrollSelector:'main'}]);
  assert.equal(f.requests[f.requests.indexOf(write)+1].method,'readScrollSiteConfig');
  assert.match(log(f),/saved-1/);assert.equal(lease.releases,1);assert.ok(lease.checks>=2);
  assert.equal(f.requests.filter(row=>row.method==='observeScrollSitePage').length,1);
});

for(const change of ['Stop','provider','authorization','document','tab'])
  test(`automatic configuration rejects ${change} change before candidate apply without writes`,async t=>{
    const f=await fixture(t);const before=f.saved();const lease=await beginObservation(f);
    if(change==='Stop')await click(f,'#scroll-ai-panel .od-conversation-action--stop');
    else if(change==='provider'||change==='authorization'){
      for(const notify of change==='provider'?f.providers:f.grants)notify();
    }else if(change==='document')f.target.documentId='document-2';
    else {f.target.tabId=12;f.target.url='https://chatgpt.com/c/other';}
    f.continuations[0].resolve(candidateProposal);await settle();
    assert.deepEqual(f.writes(),[]);assert.deepEqual(f.saved(),before);
    assert.equal(lease.releases,1);assert.doesNotMatch(log(f),/saved-1/);
    assert.equal(f.rounds.length,1);assert.equal(f.continuations.length,1);
    if(change==='Stop')assert.equal(f.cancelled(),1);
  });

test('a pure message after observation releases the original lease without a save',async t=>{
  const f=await fixture(t);const lease=await beginObservation(f);
  f.continuations[0].resolve({type:'message',message:'当前页面没有合适的配置。'});await settle();
  assert.match(log(f),/当前页面没有合适的配置/);assert.deepEqual(f.writes(),[]);
  assert.equal(lease.releases,1);
});

test('a second observe is rejected with no second observation or writes',async t=>{
  const f=await fixture(t);const lease=await beginObservation(f);
  f.continuations[0].resolve(observeProposal);await settle();
  assert.match(log(f),/E_SCROLL_AI_PROPOSAL/);assert.deepEqual(f.writes(),[]);
  assert.equal(f.requests.filter(row=>row.method==='observeScrollSitePage').length,1);
  assert.equal(f.continuations.length,1);assert.equal(lease.releases,1);
});

test('observe without continuation is rejected before any page access or writes',async t=>{
  const f=await fixture(t);await openChat(f);await send(f,autoRequest);
  const lease=f.resolve(0,observeProposal);await settle();
  assert.match(log(f),/E_SCROLL_AI_PROPOSAL/);assert.deepEqual(f.writes(),[]);
  assert.equal(f.requests.filter(row=>row.method==='observeScrollSitePage').length,0);
  assert.equal(lease.checks,0);assert.equal(lease.releases,1);
});

test('an unrelated request cannot authorize observation',async t=>{
  const f=await fixture(t);await openChat(f);await send(f,'悬浮回顶是什么？');
  const lease=f.resolve(0,observeProposal,{continuation:true});await settle();
  assert.match(log(f),/E_SCROLL_AI_PROPOSAL/);assert.deepEqual(f.writes(),[]);
  assert.equal(f.requests.filter(row=>row.method==='observeScrollSitePage').length,0);
  assert.equal(f.continuations.length,0);assert.equal(lease.checks,0);assert.equal(lease.releases,1);
});

test('unavailable observation stops automatic configuration without continuation or writes',async t=>{
  const f=await fixture(t,{observe:()=>({state:'unavailable',reason:'NO_STRUCTURE'})});
  await openChat(f);await send(f,autoRequest);
  const lease=f.resolve(0,observeProposal,{continuation:true});await settle();
  assert.match(log(f),/E_CONFIG_DOM/);assert.deepEqual(f.writes(),[]);
  assert.equal(f.continuations.length,0);assert.equal(lease.releases,1);
});


test('Send starts the original provider request synchronously on the trusted event',async t=>{
  const f=await fixture(t);await openChat(f);
  input(f,'#scroll-ai-input',autoRequest);
  element(f,'#scroll-ai-panel .od-conversation-action--primary').dispatch('click');
  assert.equal(f.rounds.length,1,'request occurs before yielding to any asynchronous work');
  assert.equal(f.rounds[0].args.event.isTrusted,true);
  assert.equal(f.requests.filter(row=>row.method==='observeScrollSitePage').length,0);
  f.resolve(0,{type:'message',message:'尚未读取网页。'});await settle();
  assert.deepEqual(f.writes(),[]);
});

for(const change of ['Stop','provider','document'])
  test(`${change} during observation prevents continuation and writes`,async t=>{
    const pending=deferred();const f=await fixture(t,{observe:()=>pending.promise});
    await openChat(f);await send(f,autoRequest);
    const lease=f.resolve(0,observeProposal,{continuation:true});await settle();
    assert.equal(f.requests.filter(row=>row.method==='observeScrollSitePage').length,1);
    if(change==='Stop')await click(f,'#scroll-ai-panel .od-conversation-action--stop');
    else if(change==='provider')for(const notify of f.providers)notify();
    else f.target.documentId='document-2';
    pending.resolve(structuredClone(observed));await settle();
    assert.equal(f.continuations.length,0);assert.deepEqual(f.writes(),[]);
    assert.equal(lease.releases,1);
  });

test('unknown continuation keeps the existing unknown-result fence and releases the original lease',async t=>{
  const f=await fixture(t);const lease=await beginObservation(f);
  f.continuations[0].reject(coded('E_AI_OUTCOME_UNKNOWN'));await settle();
  assert.deepEqual(f.writes(),[]);assert.equal(lease.releases,1);
  await click(f,'#scroll-ai-panel .od-conversation-close');await openChat(f);
  assert.equal(element(f,'#scroll-ai-panel .od-conversation-action--primary').disabled,true);
  assert.equal(f.rounds.length,1);assert.equal(f.continuations.length,1);
});

test('a candidate outside the observed set cannot save a rule',async t=>{
  const f=await fixture(t);const lease=await beginObservation(f);
  f.continuations[0].resolve({...candidateProposal,candidateId:'candidate-2'});await settle();
  assert.match(log(f),/E_SCROLL_AI_PROPOSAL/);assert.deepEqual(f.writes(),[]);
  assert.equal(lease.releases,1);
});
