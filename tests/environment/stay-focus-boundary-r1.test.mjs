import test from 'node:test';
import assert from 'node:assert/strict';
import {setInstalledSidebarToolEnabled,recordToolUninstall,retryUninstalledToolCleanup,
  TOOL_CLEANUP_STORE} from '../../src/ui/sidebar-tools/installation.js';
import {SIDEBAR_TOOL_STORE,sidebarToolStorageKey} from '../../src/ui/sidebar-tools/package.js';
import {SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE} from '../../src/ui/sidebar-tools/lifecycle.js';
import {FOCUS_ID,FOCUS_STORE,FOCUS_RULE_FIRST,FOCUS_PROTOCOL,focusPackageHash} from '../../src/stay-focus/policy.js';
import {TIME_REVIEW_KEY} from '../../src/time-review/model.js';
import {requestStayFocusOperation,runTrustedStayFocusOperation,probeStayFocusService} from '../../src/stay-focus/tool-host.js';
import {isSidebarToolHostSender} from '../../src/sidebar-tools/sender.js';
import {createStayFocusPermissionControls} from '../../src/stay-focus/host-controls.js';

const tool={format:'opendesk.sidebar-tool.v1',id:'stay-focus',version:'1.0.0',title:'Stay Focus',
  description:'Boundary regression',capabilities:['focus.control'],html:'<main>Focus</main>',css:'',js:'void 0;'};
test('R3.1 a disabled Focus cannot request Chrome native permissions',async()=>{
  class Node{
    constructor(){this.children=[];this.listeners={};this.hidden=false;this.disabled=false;}
    addEventListener(type,listener){this.listeners[type]=listener;}
    append(...children){this.children.push(...children);}
    scrollIntoView(){}
    focus(){}
  }
  const container=new Node(),doc={createElement:()=>new Node()};
  let requests=0,operations=0;
  const controls=createStayFocusPermissionControls({api:{permissions:{request(){
    requests++;return Promise.resolve(true);
  }}},doc,container,notice:()=>{},runOperation:async()=>{operations++;}});
  controls.render(tool,false,false);
  const grant=container.children[0].children.find(node=>node.id==='stay-focus-enable-native');
  assert.ok(grant);
  assert.equal(grant.disabled,true,'stop state must gate Chrome permission requests');
  grant.listeners.click({isTrusted:true});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(requests,0);assert.equal(operations,0);
  controls.render(tool,false,true);
  assert.equal(grant.disabled,false);
  grant.listeners.click({isTrusted:false});
  assert.equal(requests,0);
  grant.listeners.click({isTrusted:true});
  assert.equal(requests,1,'native permission request begins synchronously from trusted click');
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(operations,1);
});

function fixture(){
  const focusState={enabled:true,usage:{pool:42}},otherState={keep:'time-review'};
  const data=new Map([[SIDEBAR_TOOL_STORE,[tool]],[FOCUS_STORE,focusState],[TIME_REVIEW_KEY,otherState],
    [SIDEBAR_TOOL_ENABLE_STORE,{}],[TOOL_REVOCATION_EPOCHS_STORE,{[tool.id]:'epoch-before'}],
    [sidebarToolStorageKey(tool.id),{draft:'private'}]]);
  let rules=[{id:FOCUS_RULE_FIRST},{id:12}],failRules=false,readbackMismatch=false;
  const writes=[],lockNames=[];
  const api={permissions:{async contains(){return true;}},storage:{local:{
    async get(keys){return Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(key=>[key,structuredClone(data.get(key))]));},
    async set(rows){for(const [key,value] of Object.entries(rows)){writes.push(key);data.set(key,structuredClone(value));}},
    async remove(key){data.delete(key);}
  }},declarativeNetRequest:{
    async getDynamicRules(){return structuredClone(rules);},
    async updateDynamicRules({removeRuleIds,addRules}){
      if(failRules)throw new Error('native rule cleanup failed');
      if(!readbackMismatch)rules=rules.filter(row=>!removeRuleIds.includes(row.id)).concat(addRules);
    }
  }};
  const lockManager={async request(name,work){lockNames.push(name);return work();}};
  return {api,lockManager,data,writes,lockNames,focusState,otherState,get rules(){return rules;},
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
  f.failRules(false);
  assert.equal((await retryUninstalledToolCleanup({...f,id:tool.id})).state,'cleaned');
  assert.equal(f.data.has(FOCUS_STORE),false);
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
test('Focus status is read-only RPC with the installed digest and epoch',async()=>{
  const f=hostFixture();
  assert.deepEqual(await requestStayFocusOperation({...f,operation:'focus.status',payload:{}}),{confirmed:true});
  assert.deepEqual(f.calls,[{protocol:FOCUS_PROTOCOL,toolId:tool.id,operation:'focus.status',payload:{},
    packageHash:await focusPackageHash(tool),installEpoch:'epoch-before'}]);
});
test('Focus mutation awaits the trusted host review and rejects a sandbox synthetic approval',async()=>{
  const f=hostFixture(),payload={site:{host:'example.com',minutes:30}},reviews=[];
  f.requestBrowserClick=async review=>{
    reviews.push(review);assert.equal(f.calls.length,0);
    assert.match(review.message,/example\.com/);
    await assert.rejects(async()=>review.run({isTrusted:false}),{code:'E_FOCUS_TRUSTED_CLICK'});
    return review.run({isTrusted:true});
  };
  await requestStayFocusOperation({...f,operation:'focus.site.put',payload});
  assert.equal(reviews.length,1);assert.equal(f.calls.length,1);
  assert.deepEqual(f.calls[0].payload,payload);
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
test('Focus approval rechecks epoch and live iframe before the native effect',async()=>{
  for(const change of ['epoch','session','package']){
    const f=hostFixture();let current=true;
    f.assertCurrent=()=>{if(!current)throw Object.assign(new Error('retired frame'),{code:'E_TOOL_CHANGED'});};
    f.requestBrowserClick=async review=>{
      if(change==='epoch')f.data.set(TOOL_REVOCATION_EPOCHS_STORE,{[tool.id]:'epoch-after'});
      if(change==='session')current=false;
      if(change==='package')f.data.set(SIDEBAR_TOOL_STORE,[{...tool,version:'1.0.1'}]);
      return review.run({isTrusted:true});
    };
    await assert.rejects(requestStayFocusOperation({...f,operation:'focus.session.stop',payload:{}}),{code:'E_TOOL_CHANGED'});
    assert.equal(f.calls.length,0);
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
  const url=api.runtime.getURL('ui/tool.html')+'?hostInstanceId=123e4567-e89b-42d3-a456-426614174000';
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
