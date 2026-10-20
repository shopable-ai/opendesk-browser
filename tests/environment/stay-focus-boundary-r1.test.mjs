import {settingsReactFixture} from '../helpers/trusted-settings-react-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {setInstalledSidebarToolEnabled,recordToolUninstall,retryUninstalledToolCleanup,
  TOOL_CLEANUP_STORE} from '../../src/ui/sidebar-tools/installation.js';
import {SIDEBAR_TOOL_STORE,sidebarToolStorageKey} from '../../src/ui/sidebar-tools/package.js';
import {SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE} from '../../src/ui/sidebar-tools/lifecycle.js';
import {FOCUS_ID,FOCUS_STORE,FOCUS_SESSION,FOCUS_RULE_FIRST,FOCUS_PROTOCOL,focusPackageHash} from '../../examples/sidebar-tools/stay-focus/trusted/policy.js';
import {TIME_REVIEW_KEY} from '../../examples/sidebar-tools/time-review/trusted/model.js';
import {requestStayFocusOperation,runTrustedStayFocusOperation,probeStayFocusService} from '../../examples/sidebar-tools/stay-focus/trusted/tool-host.js';
import {isSidebarToolHostSender} from '../../src/sidebar-tools/sender.js';
import {createStayFocusPermissionControls} from '../../examples/sidebar-tools/stay-focus/trusted/host-controls.js';

const tool={format:'opendesk.sidebar-tool.v1',id:'stay-focus',version:'1.0.0',title:'Stay Focus',
  description:'Boundary regression',capabilities:['focus.control'],html:'<main>Focus</main>',css:'',js:'void 0;'};
test('R5.9 a disabled Focus cannot request Chrome native permissions',async t=>{
  const f=settingsReactFixture('stayFocus',t);
  let requests=0,operations=0,idle=false,enabled=false;
  const readStatus=async()=>({enabled,authorized:enabled,sites:[],
    permissions:{idle,dnr:true,ready:idle},ruleReceipt:{verified:true}});
  const controls=createStayFocusPermissionControls({
    api:{permissions:{request(){requests++;idle=true;return Promise.resolve(true);}}},
    ui:f.ui,notice:()=>{},readStatus,
    runOperation:async()=>{operations++;enabled=true;return readStatus();}
  });
  t.after(()=>controls.dispose());
  controls.render(tool,false,false);
  assert.equal(f.find('stay-focus-enable-native'),null,
    'disabled state must not present Chrome authorization');
  f.invoke('stay-focus-enable-native',{isTrusted:true});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(requests,0);assert.equal(operations,0);
  controls.render(tool,false,true);
  await new Promise(resolve=>setImmediate(resolve));
  assert.ok(f.find('stay-focus-enable-native'));
  f.invoke('stay-focus-enable-native',{isTrusted:false});
  assert.equal(requests,0);
  f.invoke('stay-focus-enable-native',{isTrusted:true});
  assert.equal(requests,1,'native permission request begins synchronously from trusted click');
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(operations,1);
  assert.equal(f.model.phase,'active');
});
test('R5.7 native React one-click adds only the current verified website',async t=>{
  const f=settingsReactFixture('stayFocus',t),writes=[],notices=[];
  let page={status:'available',url:'https://m.youtube.com/watch?v=abc',
    tabId:7,documentId:'document-a'},subscriber=null;
  const pageTarget={
    get snapshot(){return page;},
    subscribe(fn){subscriber=fn;fn(page);return()=>{subscriber=null;};},
    capture(){return {...page};},
    async revalidate(saved){
      if(page.documentId!==saved.documentId||page.tabId!==saved.tabId||page.url!==saved.url)
        throw Object.assign(new Error('网页已切换'),{code:'E_DOCUMENT_STALE'});
      return page;
    }
  };
  const state={enabled:true,sites:[],catalog:[{host:'youtube.com'}],
    dailyBudget:{minutes:45},authorized:true,
    permissions:{idle:true,dnr:true,ready:true},ruleReceipt:{verified:true}};
  const controls=createStayFocusPermissionControls({api:{},ui:f.ui,pageTarget,
    notice:(message,isError)=>notices.push({message,isError}),
    readStatus:async()=>structuredClone(state),
    runOperation:async(operation,payload,event)=>{
      assert.equal(event.isTrusted,true,'only a genuine fixed Side Panel click may write');
      assert.equal(operation,'focus.site.put');
      writes.push(structuredClone(payload));
      state.sites=state.sites.filter(row=>row.host!==payload.site.host).concat({...payload.site});
      return structuredClone(state);
    }});
  t.after(()=>controls.dispose());
  controls.render(tool,false,true);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.model.currentPageHost,'m.youtube.com');
  assert.equal(f.model.currentAction,'add');
  assert.ok(f.find('stay-focus-current-add'),'fixed React Side Panel owns the visible button');
  await f.invoke('stay-focus-current-add',{isTrusted:false});
  assert.equal(writes.length,0,'synthetic iframe-like calls cannot write');
  await f.invoke('stay-focus-current-add',{isTrusted:true});
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(writes,[{site:{host:'youtube.com',subdomains:true,enabled:true,
    mode:'limit',minutes:45,group:'entertainment'}}]);
  assert.equal(f.model.currentAction,'managed');
  assert.equal(f.find('stay-focus-current-add'),null,'managed site cannot be repeatedly added');
  assert.ok(notices.some(row=>/已管理/.test(row.message)&&!row.isError));
  assert.ok(f.find('stay-focus-current-pause'),'managed site exposes only trusted pause');
  await f.invoke('stay-focus-current-pause',{isTrusted:false});
  assert.equal(writes.length,1,'synthetic pause must not send another write');
  await f.invoke('stay-focus-current-pause',{isTrusted:true});
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(writes[1],{site:{...writes[0].site,enabled:false}},
    'one native React pause preserves all existing limit settings');
  assert.equal(f.model.currentAction,'paused');
  assert.equal(f.find('stay-focus-current-pause'),null);
});
test('R5.7 trusted quick-add refuses navigation races and resumes a paused rule unchanged',async t=>{
  const f=settingsReactFixture('stayFocus',t),writes=[];
  let page={status:'available',url:'https://m.youtube.com/',tabId:1,documentId:'first'};
  let navigateOnValidate=false;
  const pageTarget={
    get snapshot(){return page;},subscribe(fn){fn(page);return()=>{};},
    capture(){return {...page};},
    async revalidate(saved){
      if(navigateOnValidate){
        navigateOnValidate=false;page={status:'available',url:'https://other.test/',tabId:2,documentId:'second'};
      }
      if(page.documentId!==saved.documentId||page.url!==saved.url)
        throw Object.assign(new Error('当前网页已切换'),{code:'E_DOCUMENT_STALE'});
      return page;
    }
  };
  const existing={host:'youtube.com',subdomains:true,enabled:false,
    mode:'always',minutes:9,group:''};
  const state={enabled:true,sites:[existing],catalog:[{host:'youtube.com'}],
    dailyBudget:{minutes:30},authorized:true,
    permissions:{idle:true,dnr:true,ready:true},ruleReceipt:{verified:true}};
  const controls=createStayFocusPermissionControls({api:{},ui:f.ui,pageTarget,
    notice:()=>{},readStatus:async()=>structuredClone(state),
    runOperation:async(op,payload,event)=>{
      writes.push({op,payload:structuredClone(payload),trusted:event.isTrusted});
      state.sites=[payload.site];return structuredClone(state);
    }});
  t.after(()=>controls.dispose());
  controls.render(tool,false,true);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.model.currentAction,'paused');
  assert.equal(f.find('stay-focus-current-add').textContent,'恢复');
  navigateOnValidate=true;
  await f.invoke('stay-focus-current-add',{isTrusted:true});
  assert.equal(writes.length,0,'tab navigation during validation never writes the old host');
  page={status:'available',url:'https://m.youtube.com/',tabId:1,documentId:'third'};
  controls.render(tool,false,false);
  controls.render(tool,false,true);
  await new Promise(resolve=>setImmediate(resolve));
  await f.invoke('stay-focus-current-add',{isTrusted:true});
  assert.deepEqual(writes,[{op:'focus.site.put',payload:{site:{...existing,enabled:true}},trusted:true}],
    'resume preserves pause rule group, mode, budget and subdomain scope');
});
function fixture(){
  const focusState={enabled:true,usage:{pool:42}},otherState={keep:'time-review'};
  const data=new Map([[SIDEBAR_TOOL_STORE,[tool]],[FOCUS_STORE,focusState],[TIME_REVIEW_KEY,otherState],
    [SIDEBAR_TOOL_ENABLE_STORE,{}],[TOOL_REVOCATION_EPOCHS_STORE,{[tool.id]:'epoch-before'}],
    [sidebarToolStorageKey(tool.id),{draft:'private'}]]);
  let rules=[{id:FOCUS_RULE_FIRST},{id:12}],failRules=false,readbackMismatch=false;
  // Native uninstall must remove the Focus session and verify the readback.
  // Chrome session storage is independent of local; peers must survive retry.
  const session=new Map([[FOCUS_SESSION,'focus-old-session'],['peer.session','peer-kept']]);
  const writes=[],lockNames=[];
  const api={permissions:{async contains(){return true;}},storage:{local:{
    async get(keys){return Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(key=>[key,structuredClone(data.get(key))]));},
    async set(rows){for(const [key,value] of Object.entries(rows)){writes.push(key);data.set(key,structuredClone(value));}},
    async remove(key){data.delete(key);}
  },session:{
    async get(key){
      const keys=key===null?[...session.keys()]:Array.isArray(key)?key:[key];
      return Object.fromEntries(keys.filter(name=>session.has(name))
        .map(name=>[name,structuredClone(session.get(name))]));
    },
    async remove(key){
      for(const name of Array.isArray(key)?key:[key])session.delete(name);
    }
  }},declarativeNetRequest:{
    async getDynamicRules(){return structuredClone(rules);},
    async updateDynamicRules({removeRuleIds,addRules}){
      if(failRules)throw new Error('native rule cleanup failed');
      if(!readbackMismatch)rules=rules.filter(row=>!removeRuleIds.includes(row.id)).concat(addRules);
    }
  }};
  const lockManager={async request(name,work){lockNames.push(name);return work();}};
  return {api,lockManager,data,session,writes,lockNames,focusState,otherState,get rules(){return rules;},
    failRules(value){failRules=value;},mismatch(value){readbackMismatch=value;}};
}
test('Focus stop clears only owned DNR, keeps budget and invalidates the old install epoch',async()=>{
  const f=fixture();
  assert.deepEqual(await setInstalledSidebarToolEnabled({...f,tool,enabled:false}),{enabled:false});
  assert.deepEqual(f.rules,[{id:12}]);
  assert.deepEqual(f.data.get(FOCUS_STORE),f.focusState);
  assert.deepEqual(f.data.get(TIME_REVIEW_KEY),f.otherState);
  assert.equal(f.data.get(SIDEBAR_TOOL_ENABLE_STORE)[tool.id],false);
  assert.notEqual(f.data.get(TOOL_REVOCATION_EPOCHS_STORE)[tool.id],'epoch-before');
  assert.deepEqual(f.lockNames,['opendesk.sidebar-tools:tool:stay-focus','opendesk.sidebar-tools:catalog']);
  const stoppedEpoch=f.data.get(TOOL_REVOCATION_EPOCHS_STORE)[tool.id];
  await setInstalledSidebarToolEnabled({...f,tool,enabled:true});
  assert.equal(f.data.get(SIDEBAR_TOOL_ENABLE_STORE)[tool.id],true);
  assert.notEqual(f.data.get(TOOL_REVOCATION_EPOCHS_STORE)[tool.id],stoppedEpoch);
  assert.deepEqual(f.data.get(FOCUS_STORE),f.focusState);
});
test('Focus cleanup failure leaves tool stopped and does not acknowledge an unverified rule removal',async()=>{
  const f=fixture();f.mismatch(true);
  await assert.rejects(setInstalledSidebarToolEnabled({...f,tool,enabled:false}),{code:'E_FOCUS_DNR_MISMATCH'});
  assert.equal(f.data.get(SIDEBAR_TOOL_ENABLE_STORE)[tool.id],false);
  assert.equal(f.data.get(TOOL_REVOCATION_EPOCHS_STORE)[tool.id],'epoch-before');
  assert.deepEqual(f.rules,[{id:FOCUS_RULE_FIRST},{id:12}]);
});
test('Focus uninstall failure remains recoverable, retry clears business data without touching another tool',async()=>{
  const f=fixture();await recordToolUninstall(f.api,tool);f.data.set(SIDEBAR_TOOL_STORE,[]);f.failRules(true);
  await assert.rejects(retryUninstalledToolCleanup({...f,id:tool.id}),{code:'E_TOOL_UNINSTALL_CLEANUP'});
  assert.ok(f.data.get(TOOL_CLEANUP_STORE)[tool.id]);
  assert.deepEqual(f.data.get(FOCUS_STORE),f.focusState);
  assert.deepEqual(f.data.get(TIME_REVIEW_KEY),f.otherState);
  assert.equal(f.session.get(FOCUS_SESSION),'focus-old-session',
    'failed DNR cleanup cannot erase an unverified Focus session');
  f.failRules(false);
  assert.equal((await retryUninstalledToolCleanup({...f,id:tool.id})).state,'cleaned');
  assert.equal(f.data.has(FOCUS_STORE),false);
  assert.equal(f.session.has(FOCUS_SESSION),false,
    'verified uninstall clears the Focus session storage value');
  assert.equal(f.session.get('peer.session'),'peer-kept',
    'Focus uninstall must not remove another app session');
  assert.equal(f.data.has(sidebarToolStorageKey(tool.id)),false);
  assert.deepEqual(f.data.get(TOOL_CLEANUP_STORE),{});
  assert.deepEqual(f.rules,[{id:12}]);
  assert.deepEqual(f.data.get(TIME_REVIEW_KEY),f.otherState);
  assert.equal(typeof f.data.get(TOOL_REVOCATION_EPOCHS_STORE)[tool.id],'string');
});
test('Uninstall recovery cannot remove Focus state or rules if the ID was reinstalled',async()=>{
  const f=fixture();await recordToolUninstall(f.api,tool);
  assert.equal((await retryUninstalledToolCleanup({...f,id:tool.id})).state,'still-installed');
  assert.deepEqual(f.data.get(FOCUS_STORE),f.focusState);
  assert.deepEqual(f.rules,[{id:FOCUS_RULE_FIRST},{id:12}]);
});
test('Stopping another tool never invokes the Focus native adapter',async()=>{
  const f=fixture(),other={...tool,id:'other-tool'};f.data.set(SIDEBAR_TOOL_STORE,[tool,other]);
  f.api.permissions.contains=async()=>{throw new Error('Focus adapter must not query permissions');};
  await setInstalledSidebarToolEnabled({...f,tool:other,enabled:false});
  assert.deepEqual(f.rules,[{id:FOCUS_RULE_FIRST},{id:12}]);
  assert.deepEqual(f.data.get(FOCUS_STORE),f.focusState);
});

function hostFixture(){
  const f=fixture(),calls=[];
  f.api.runtime={async sendMessage(message){calls.push(message);return {ok:true,data:{confirmed:true}};}};
  return {...f,calls,tool,revocationEpoch:'epoch-before',assertCurrent(){},
    openSettings(){throw new Error('Unexpected settings request');},
    requestBrowserClick(){throw new Error('Unexpected approval request');}};
}
test('pending Focus permission cannot adopt a replacement installation epoch',async t=>{
  const f=hostFixture(),ui=settingsReactFixture('stayFocus',t);
  let approve,finish;
  const completed=new Promise(resolve=>{finish=resolve;});
  f.api.permissions={request:()=>new Promise(resolve=>{approve=resolve;})};
  const controls=createStayFocusPermissionControls({api:f.api,ui:ui.ui,notice:()=>finish(),
    readStatus:async()=>({enabled:false,authorized:false,sites:[],
      permissions:{idle:false,dnr:true,ready:false},ruleReceipt:{verified:true}}),
    runOperation:(operation,payload,event)=>runTrustedStayFocusOperation({...f,operation,payload,event})});
  t.after(()=>controls.dispose());
  controls.render(tool,false,true);
  await new Promise(resolve=>setImmediate(resolve));
  ui.invoke('stay-focus-enable-native',{isTrusted:true});
  assert.equal(typeof approve,'function');
  f.data.set(TOOL_REVOCATION_EPOCHS_STORE,{[tool.id]:'epoch-after-revocation'});
  approve(true);
  await completed;
  assert.equal(f.calls.length,0,'old permission callback must not send using the new epoch');
});
test('Focus status is read-only RPC with the installed digest and epoch',async()=>{
  const f=hostFixture();
  assert.deepEqual(await requestStayFocusOperation({...f,operation:'focus.status',payload:{}}),{confirmed:true});
  assert.deepEqual(f.calls,[{protocol:FOCUS_PROTOCOL,toolId:tool.id,operation:'focus.status',payload:{},
    packageHash:await focusPackageHash(tool),installEpoch:'epoch-before'}]);
});
test('R5.8.1 installed Focus performs one ordinary write without a repeated confirmation',async()=>{
  const f=hostFixture(),payload={site:{host:'example.com',minutes:30}};
  await requestStayFocusOperation({...f,operation:'focus.site.put',payload});
  assert.equal(f.calls.length,1,'one click must send exactly one Host mutation');
  assert.deepEqual(f.calls[0].payload,payload);
  f.data.set(SIDEBAR_TOOL_ENABLE_STORE,{[tool.id]:false});
  await assert.rejects(requestStayFocusOperation({...f,operation:'focus.site.put',payload}),
    {code:'E_TOOL_DISABLED'});
  assert.equal(f.calls.length,1,'disabled tool must never issue a second write');
});
test('R5.8.1 all authorized everyday controls write directly to the same Host',async()=>{
  const f=hostFixture(),ops=[
    ['focus.site.put',{site:{host:'example.com',minutes:30}}],
    ['focus.site.remove',{host:'example.com'}],
    ['focus.group.put',{id:'entertainment',minutes:45}],
    ['focus.group.remove',{id:'other'}],
    ['focus.schedule.set',{schedule:{enabled:true,days:[1,2,3],startMinute:540,endMinute:1020}}],
    ['focus.whitelist.set',{hosts:['docs.google.com']}],
    ['focus.session.start',{minutes:25}],
    ['focus.session.stop',{}]
  ];
  for(const [operation,payload] of ops)
    await requestStayFocusOperation({...f,operation,payload});
  assert.deepEqual(f.calls.map(row=>row.operation),ops.map(row=>row[0]));
  assert.equal(f.calls.length,ops.length,'no duplicate Host requests or approval dialogs');
});
test('Sandbox enable, disable and clear open settings but cannot send a native operation',async()=>{
  for(const operation of ['focus.enable','focus.disable','focus.clear']){
    const f=hostFixture();let opened=0;f.openSettings=()=>opened++;
    await assert.rejects(requestStayFocusOperation({...f,operation,payload:{}}),{code:'E_FOCUS_TRUSTED_CLICK'});
    assert.equal(opened,1);assert.equal(f.calls.length,0);
    await assert.rejects(runTrustedStayFocusOperation({...f,operation,payload:{},event:{isTrusted:false}}),
      {code:'E_FOCUS_TRUSTED_CLICK'});
  }
});
test('R5.8.1 direct Focus mutations reject retired sessions, packages and epochs',async()=>{
  for(const change of ['epoch','session','package']){
    const f=hostFixture();
    if(change==='epoch')f.data.set(TOOL_REVOCATION_EPOCHS_STORE,{[tool.id]:'epoch-after'});
    if(change==='session')f.assertCurrent=()=>{throw Object.assign(new Error('retired frame'),{code:'E_TOOL_CHANGED'});};
    if(change==='package')f.data.set(SIDEBAR_TOOL_STORE,[{...tool,version:'1.0.1'}]);
    await assert.rejects(requestStayFocusOperation({...f,operation:'focus.session.stop',payload:{}}),
      {code:'E_TOOL_CHANGED'});
    assert.equal(f.calls.length,0,'stale sandbox cannot reach the native service');
  }
});
test('Trusted Focus control refuses stopped or replaced packages and preserves unknown outcomes',async()=>{
  const f=hostFixture(),args={...f,operation:'focus.enable',payload:{},event:{isTrusted:true}};
  f.data.set(SIDEBAR_TOOL_ENABLE_STORE,{[tool.id]:false});
  await assert.rejects(runTrustedStayFocusOperation(args));assert.equal(f.calls.length,0);
  f.data.set(SIDEBAR_TOOL_ENABLE_STORE,{});f.data.set(SIDEBAR_TOOL_STORE,[{...tool,js:'changed();'}]);
  await assert.rejects(runTrustedStayFocusOperation(args),{code:'E_TOOL_CHANGED'});assert.equal(f.calls.length,0);
  f.data.set(SIDEBAR_TOOL_STORE,[tool]);let checks=0;
  await assert.rejects(runTrustedStayFocusOperation({...args,assertCurrent(){if(++checks===3)throw new Error('closed');}}),
    {code:'E_OUTCOME_UNKNOWN'});
  assert.equal(f.calls.length,1,'an unknown effect must never be silently replayed');
});
test('Focus RPC failure keeps the backend error and does not cross another tool identity',async()=>{
  const f=hostFixture();f.api.runtime.sendMessage=async()=>({ok:false,error:{code:'E_FOCUS_DNR_MISMATCH',message:'readback failed'}});
  await assert.rejects(requestStayFocusOperation({...f,operation:'focus.status',payload:{}}),{code:'E_FOCUS_DNR_MISMATCH'});
  await assert.rejects(requestStayFocusOperation({...f,tool:{...tool,id:'time-review'},operation:'focus.status',payload:{}}),
    {code:'E_TOOL_CHANGED'});
});
test('Shared sender URL gate binds optional toolId and rejects extra query or cross-extension origins',()=>{
  const api={runtime:{id:'extension',getURL:p=>'chrome-extension://extension/'+p}};
  const url=api.runtime.getURL('sidepanel.html')+'?hostInstanceId=123e4567-e89b-42d3-a456-426614174000';
  const sender=url=>({id:'extension',url});
  assert.equal(isSidebarToolHostSender(api,sender(url)),true);
  for(const id of ['stay-focus','time-review','reading-toc','cookie-editor']){
    assert.equal(isSidebarToolHostSender(api,sender(url+'&toolId='+id),id),true);
    assert.equal(isSidebarToolHostSender(api,sender(url+'&toolId='+id),'different-tool'),false);
    assert.equal(isSidebarToolHostSender(api,sender(url+'&toolId='+id+'&extra=1'),id),false);
  }
  assert.equal(isSidebarToolHostSender(api,sender(url.replace('//extension/','//other/'))),false);
  assert.equal(isSidebarToolHostSender(api,sender(url+'#spoof')),false);
});

test('R3.2 frontend refuses absent, mismatched, untrusted, or unreachable backend',async()=>{
  const good={protocol:FOCUS_PROTOCOL,serviceVersion:1,serviceReady:true,
    permissions:{idle:false,dnr:false,ready:false}};
  const sent=[];
  const api={runtime:{async sendMessage(message){sent.push(message);return {ok:true,data:good};}}};
  assert.deepEqual(await probeStayFocusService({api}),good);
  assert.deepEqual(sent,[{protocol:FOCUS_PROTOCOL,toolId:FOCUS_ID,operation:'focus.probe',payload:{}}]);
  for(const response of [undefined,{ok:true,data:{...good,serviceVersion:99}},
    {ok:true,data:{...good,serviceReady:false}},
    {ok:false,error:{code:'E_FOCUS_SENDER'}}]){
    api.runtime.sendMessage=async()=>response;
    await assert.rejects(probeStayFocusService({api}),{code:'E_TOOL_RUNTIME_UNAVAILABLE'});
  }
  api.runtime.sendMessage=async()=>{throw new Error('No receiving end');};
  await assert.rejects(probeStayFocusService({api}),{code:'E_TOOL_RUNTIME_UNAVAILABLE'});
  await assert.rejects(probeStayFocusService({api:{runtime:{}}}),{code:'E_TOOL_RUNTIME_UNAVAILABLE'});
});

// A live v1 worker may predate site-budget.v2. A successful probe alone must
// never permit a package update whose rules the compiled worker cannot run.
test('R4.5 package admission requires the live worker to advertise policy support',async()=>{
  const modern={...tool,version:'1.0.4',backgroundPolicy:{kind:'site-budget.v2'}};
  const supported={protocol:FOCUS_PROTOCOL,serviceVersion:1,serviceReady:true,
    permissions:{idle:false,dnr:true,ready:false},
    managedSiteRuntime:{contract:'opendesk.managed-site-runtime.v1',
      policyKinds:['site-budget.v1','site-budget.v2'],privilegedJs:false}};
  let response={ok:true,data:supported};
  const api={runtime:{sendMessage:async()=>response}};
  assert.deepEqual(await probeStayFocusService({api,tool:modern}),supported);
  for(const invalid of [
    {...supported,managedSiteRuntime:undefined},
    {...supported,managedSiteRuntime:{...supported.managedSiteRuntime,policyKinds:['site-budget.v1']}},
    {...supported,managedSiteRuntime:{...supported.managedSiteRuntime,privilegedJs:true}},
    {...supported,managedSiteRuntime:{...supported.managedSiteRuntime,contract:'unknown'}}
  ]){
    response={ok:true,data:invalid};
    await assert.rejects(probeStayFocusService({api,tool:modern}),
      {code:'E_TOOL_RUNTIME_POLICY_UNSUPPORTED'});
  }
  // A legacy package without a background policy remains compatible with
  // legacy workers. The new admission does not revoke unrelated UI-only tools.
  response={ok:true,data:{...supported,managedSiteRuntime:undefined}};
  assert.equal((await probeStayFocusService({api,tool})).serviceReady,true);
});
