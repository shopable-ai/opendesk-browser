import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {access} from 'node:fs/promises';
import {readOfficialSources} from '../../scripts/build-official-tools.mjs';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createSidebarToolPackage,encodeSidebarToolPackage} from '../../scripts/build-sidebar-tool.mjs';
import {sidebarToolPackageHash,SIDEBAR_TOOL_STORE} from '../../src/ui/sidebar-tools/package.js';
import {SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE} from '../../src/ui/sidebar-tools/lifecycle.js';
import {setInstalledSidebarToolEnabled,recordToolUninstall,retryUninstalledToolCleanup,
  TOOL_CLEANUP_STORE} from '../../src/ui/sidebar-tools/installation.js';
import {FOCUS_RULE_FIRST} from '../../src/stay-focus/policy.js';
import {ADBLOCK_ID,ADBLOCK_STORE,ADBLOCK_PROTOCOL,ADBLOCK_CAPABILITY,
  ADBLOCK_RULE_FIRST,adblockHost} from '../../examples/sidebar-tools/adblock/trusted/policy.js';
import {wantedAdblockRules,clearAdblockRules,reconcileAdblockRules}
  from '../../examples/sidebar-tools/adblock/trusted/rules.js';
import {createAdblockService} from '../../examples/sidebar-tools/adblock/trusted/service.js';
import {createAdblockPermissionControls} from '../../examples/sidebar-tools/adblock/trusted/host-controls.js';
import {requestAdblockOperation,runTrustedAdblockOperation}
  from '../../examples/sidebar-tools/adblock/trusted/tool-host.js';

const PROJECT=resolve('examples/sidebar-tools/adblock');
const senderId='abcdefghijklmnopabcdefghijklmnop';
const hostUrl='chrome-extension://'+senderId+
  '/ui/tool.html?hostInstanceId=123e4567-e89b-42d3-a456-426614174000';
const sender={id:senderId,url:hostUrl,documentId:'live-doc',frameId:0,
  documentLifecycle:'active'};
const focusRule={id:FOCUS_RULE_FIRST,priority:28,action:{
  type:'redirect',redirect:{extensionPath:'/stay-focus/blocked-quota.html'}},
  condition:{urlFilter:'||blocked.example^',resourceTypes:['main_frame']}};
async function fixture(){
  const tool=await createSidebarToolPackage(PROJECT),hash=await sidebarToolPackageHash(tool);
  assert.equal(tool.capabilities.includes(ADBLOCK_CAPABILITY),true);
  const bytes=encodeSidebarToolPackage(tool),stored=new Map([
    [SIDEBAR_TOOL_STORE,[tool]],[SIDEBAR_TOOL_ENABLE_STORE,{}],
    [TOOL_REVOCATION_EPOCHS_STORE,{[ADBLOCK_ID]:'epoch-1'}]]);
  let current='https://news.example.com/story',permission=true,dropUpdates=false,
    unknownWrite=false,corruptNative=false;
  let rules=[structuredClone(focusRule)];
  const locks=[],changes=[],actions=[];
  const storage={async get(keys){
    const list=Array.isArray(keys)?keys:keys===null?[...stored.keys()]:[keys];
    return Object.fromEntries(list.filter(key=>stored.has(key))
      .map(key=>[key,structuredClone(stored.get(key))]));
  },async set(values){
    for(const [key,value] of Object.entries(values)){
      stored.set(key,structuredClone(value));changes.push(key);
    }
    if(unknownWrite){unknownWrite=false;throw Error('lost acknowledgement');}
  },async remove(key){stored.delete(key);}};
  let nativeDelay=0;
  const api={
    runtime:{id:senderId,getURL:path=>'chrome-extension://'+senderId+'/'+path,
      getContexts:async()=>[{contextType:'SIDE_PANEL',documentUrl:hostUrl,
        documentId:'live-doc',frameId:0,incognito:false}]},
    storage:{local:storage},
    permissions:{async contains(){return permission;}},
    tabs:{async query(){return [{id:1,url:current,active:true,incognito:false}];}},
    declarativeNetRequest:{
      async getDynamicRules(){
        if(corruptNative)throw Error('DNR read failed');
        return structuredClone(rules);
      },
      async updateDynamicRules({removeRuleIds=[],addRules=[]}){
        actions.push({removeRuleIds:[...removeRuleIds],addRules:structuredClone(addRules)});
        if(nativeDelay)await new Promise(ok=>setTimeout(ok,nativeDelay));
        if(!dropUpdates){
          rules=rules.filter(rule=>!removeRuleIds.includes(rule.id)).concat(structuredClone(addRules));
        }
      }
    }
  };
  const tail=new Map();
  const lockManager={request(name,fn){
    locks.push(name);
    const previous=tail.get(name)||Promise.resolve();
    const promise=previous.then(fn,fn);
    tail.set(name,promise.catch(()=>{}));
    return promise;
  }};
  const fetcher=async uri=>({ok:true,url:uri,
    async arrayBuffer(){return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length);}});
  const service=createAdblockService({api,lockManager,fetcher});
  const message=(operation,payload={})=>({protocol:ADBLOCK_PROTOCOL,toolId:ADBLOCK_ID,
    operation,payload,packageHash:hash,installEpoch:'epoch-1'});
  return {tool,hash,api,stored,service,lockManager,changes,locks,actions,message,
    get rules(){return rules;},
    get permission(){return permission;},
    setPermission:value=>{permission=value;service.invalidate(!value);},
    setCurrent:value=>{current=value;},
    corruptNative:value=>{corruptNative=value;},
    dropUpdates:value=>{dropUpdates=value;},
    setDelay:value=>{nativeDelay=value;},
    setUnknownWrite:value=>{unknownWrite=value;}};
}
test('official AdBlock optional catalog entry and no generated source package copies',async()=>{
  const sources=await readOfficialSources();
  const row=sources.tools.find(row=>row.id==='adblock');
  assert.deepEqual(row,{id:'adblock',project:'examples/sidebar-tools/adblock',
    kind:'sidebar-tool',installationPolicy:'optional'});
  for(const path of ['examples/sidebar-tools/adblock/adblock.opendesk-tool.json',
    'src/sidebar-tools/adblock.opendesk-tool.json']){
    await assert.rejects(access(path),{code:'ENOENT'},
      'AdBlock generated installation packages belong exclusively to build outputs');
  }
});
test('build-ready official project, current version, one declared restricted capability',async()=>{
  const pkg=await createSidebarToolPackage(PROJECT);
  assert.equal(pkg.version,'1.0.0');
  assert.deepEqual(pkg.capabilities,[ADBLOCK_CAPABILITY]);
  assert.ok(pkg.js.includes("adblock.site.restore"));
});
test('67-domain offline snapshot compiles to one third-party-only DNR block',()=>{
  const rules=wantedAdblockRules({enabled:true,exceptions:[]});
  assert.equal(rules.length,1);
  assert.equal(rules[0].id,ADBLOCK_RULE_FIRST);
  assert.equal(rules[0].priority,1);
  assert.equal(rules[0].action.type,'block');
  assert.ok(rules[0].condition.requestDomains.length>=60);
  assert.equal(rules[0].condition.domainType,'thirdParty');
  assert.ok(!rules[0].condition.resourceTypes.includes('main_frame'));
});
test('independent offline rule provenance SHA-256 and version match the bytes',async()=>{
  const bytes=await readFile(resolve(PROJECT,'rules/domains.js'));
  const meta=JSON.parse(await readFile(resolve(PROJECT,'rules/manifest.json'),'utf8'));
  assert.equal(meta.rules.totalUnique,67);
  assert.equal(meta.version,'2026-10-15.1');
  assert.equal(createHash('sha256').update(bytes).digest('hex'),meta.sha256);
  assert.equal(meta.origin.includes('first-party'),true);
});
test('hostname normalization refuses path/host confusion and exact example.com.evil.test spoof',()=>{
  assert.equal(adblockHost('https://BÜCHER.example./path',{asUrl:true}),'xn--bcher-kva.example');
  assert.equal(adblockHost('https://example.com.evil.test',{asUrl:true}),'example.com.evil.test');
  assert.equal(adblockHost('example.com.evil.test'),'example.com.evil.test');
  for(const value of ['https://example.com','example.com/path','evil.com@example.com','a..com','a_.com'])
    assert.equal(adblockHost(value),null,value);
  assert.equal(adblockHost('chrome://settings/',{asUrl:true}),null);
  const rule=wantedAdblockRules({enabled:true,exceptions:['example.com']})[1];
  const pattern=new RegExp(rule.condition.regexFilter);
  assert.equal(pattern.test('https://example.com/news'),true);
  assert.equal(pattern.test('https://example.com.evil.test/news'),false);
  assert.equal(pattern.test('https://news.example.com'),false,'exact hostname, not child domain');
  assert.equal(rule.action.type,'allowAllRequests');
  assert.deepEqual(rule.condition.resourceTypes,['main_frame','sub_frame']);
  assert.equal(rule.priority,2);
  assert.ok(rule.priority<focusRule.priority);
});
test('uninstalled tool never activates and startup removes only stale AdBlock rules',async()=>{
  const f=await fixture();
  await f.api.declarativeNetRequest.updateDynamicRules({
    addRules:wantedAdblockRules({enabled:true,exceptions:[]}),removeRuleIds:[]});
  f.stored.set(SIDEBAR_TOOL_STORE,[]);
  const result=await f.service.tick();
  assert.equal(result.enabled,false);
  assert.equal(result.installed,false);
  assert.deepEqual(f.rules.map(x=>x.id),[FOCUS_RULE_FIRST]);
});
test('forged sender, same-ID package digest and obsolete epoch are denied',async()=>{
  const f=await fixture(),msg=await f.message('adblock.enable');
  await assert.rejects(f.service.dispatch(msg,{...sender,id:'forged'}),{code:'E_ADBLOCK_SENDER'});
  await assert.rejects(f.service.dispatch(msg,{...sender,documentId:'old-doc'}),{code:'E_ADBLOCK_SENDER'});
  await assert.rejects(f.service.dispatch({...msg,packageHash:'f'.repeat(64)},sender),{code:'E_TOOL_CHANGED'});
  await assert.rejects(f.service.dispatch({...msg,installEpoch:'old'},sender),{code:'E_TOOL_CHANGED'});
  assert.deepEqual(f.rules.map(x=>x.id),[FOCUS_RULE_FIRST]);
});
test('Chrome DNR enable/readback, pause, resume and owned-only cleanup',async()=>{
  const f=await fixture();
  const first=await f.service.dispatch(await f.message('adblock.enable'),sender);
  assert.equal(first.rules.verified,true);assert.equal(first.enabled,true);
  assert.deepEqual(f.rules.map(x=>x.id),[FOCUS_RULE_FIRST,ADBLOCK_RULE_FIRST]);
  const paused=await f.service.dispatch(await f.message('adblock.disable'),sender);
  assert.equal(paused.rules.verified,true);assert.equal(paused.enabled,false);
  assert.deepEqual(f.rules.map(x=>x.id),[FOCUS_RULE_FIRST]);
  assert.equal(f.stored.get(ADBLOCK_STORE).enabled,false);
  const resumed=await f.service.dispatch(await f.message('adblock.enable'),sender);
  assert.equal(resumed.enabled,true);
  assert.equal((await f.service.tick()).enabled,true);
});
test('site exceptions preserve other sites and site frames without elevating Stay Focus',async()=>{
  const f=await fixture();await f.service.dispatch(await f.message('adblock.enable'),sender);
  const disabled=await f.service.dispatch(await f.message('adblock.site.set',{
    host:'news.example.com',filtering:false}),sender);
  assert.equal(disabled.exceptions[0],'news.example.com');
  assert.equal(disabled.rules.verified,true);
  assert.equal(disabled.refreshRequired,true);
  const allow=f.rules.find(x=>x.action.type==='allowAllRequests');
  assert.ok(allow);assert.equal(allow.priority,2);
  assert.equal(f.rules.some(x=>x.id===FOCUS_RULE_FIRST),true);
  f.setCurrent('https://news.example.com.evil.test/');
  await assert.rejects(f.service.dispatch(await f.message('adblock.site.set',{
    host:'news.example.com',filtering:true}),sender),{code:'E_ADBLOCK_SITE_CHANGED'});
  const restored=await f.service.dispatch(await f.message('adblock.site.restore',{
    host:'news.example.com'}),sender);
  assert.deepEqual(restored.exceptions,[]);
  assert.deepEqual(f.rules.map(x=>x.id),[FOCUS_RULE_FIRST,ADBLOCK_RULE_FIRST]);
});
test('other low-priority dynamic redirect forces fail-closed AdBlock exceptions',async()=>{
  const f=await fixture();await f.service.dispatch(await f.message('adblock.enable'),sender);
  f.rules.push({...focusRule,id:733333,priority:1});
  await assert.rejects(f.service.dispatch(await f.message('adblock.site.set',{
    host:'news.example.com',filtering:false}),sender),{code:'E_ADBLOCK_PRIORITY_CONFLICT'});
  assert.deepEqual(f.rules.map(x=>x.id),[FOCUS_RULE_FIRST,733333]);
});
test('DNR readback uncertainty cannot be reported as successful filtering',async()=>{
  const f=await fixture();f.dropUpdates(true);
  await assert.rejects(f.service.dispatch(await f.message('adblock.enable'),sender),{code:'E_OUTCOME_UNKNOWN'});
  assert.deepEqual(f.rules.map(x=>x.id),[FOCUS_RULE_FIRST]);
  f.dropUpdates(false);f.corruptNative(true);
  await assert.rejects(f.service.tick(),{code:'E_OUTCOME_UNKNOWN'});
});
test('permission revocation disables durable intent, re-grant alone never resumes',async()=>{
  const f=await fixture();await f.service.dispatch(await f.message('adblock.enable'),sender);
  f.setPermission(false);
  const revoked=await f.service.tick();
  assert.equal(revoked.enabled,false);assert.equal(f.stored.get(ADBLOCK_STORE).enabled,false);
  f.setPermission(true);
  assert.equal((await f.service.tick()).enabled,false);
  assert.equal((await f.service.dispatch(await f.message('adblock.enable'),sender)).enabled,true);
});
test('rapid concurrent toggles serialize through existing tool Web Lock',async()=>{
  const f=await fixture();f.setDelay(10);
  const first=f.service.dispatch(await f.message('adblock.enable'),sender);
  const second=f.service.dispatch(await f.message('adblock.disable'),sender);
  await first;await second;
  assert.equal(f.stored.get(ADBLOCK_STORE).enabled,false);
  assert.deepEqual(f.rules.map(x=>x.id),[FOCUS_RULE_FIRST]);
  assert.ok(f.locks.every(name=>name==='opendesk.sidebar-tools:tool:adblock'));
});
test('installer stop prevents reactivation, uninstall journal retains failed cleanup for retry',async()=>{
  const f=await fixture();await f.service.dispatch(await f.message('adblock.enable'),sender);
  assert.deepEqual(await setInstalledSidebarToolEnabled({
    api:f.api,lockManager:f.lockManager,tool:f.tool,enabled:false}),{enabled:false});
  assert.deepEqual(f.rules.map(x=>x.id),[FOCUS_RULE_FIRST]);
  await assert.rejects(f.service.dispatch(await f.message('adblock.enable'),sender),{code:'E_TOOL_CHANGED'});
  await recordToolUninstall(f.api,f.tool);
  f.stored.set(SIDEBAR_TOOL_STORE,[]);
  await retryUninstalledToolCleanup({api:f.api,lockManager:f.lockManager,id:ADBLOCK_ID});
  assert.equal(f.stored.has(ADBLOCK_STORE),false);
  assert.equal(f.stored.get(TOOL_CLEANUP_STORE)?.[ADBLOCK_ID],undefined);
});
test('sandbox cannot authorize enable or arbitrary exception mutation',async()=>{
  const f=await fixture();
  const input={api:f.api,tool:f.tool,operation:'adblock.enable',revocationEpoch:'epoch-1',
    assertCurrent:()=>{},openSettings:()=>{},requestBrowserClick:()=>{throw Error('should not click');}};
  await assert.rejects(requestAdblockOperation(input),{code:'E_ADBLOCK_TRUSTED_CLICK'});
  await assert.rejects(runTrustedAdblockOperation({...input,operation:'adblock.site.set',
    payload:{host:'news.example.com',filtering:false},event:{isTrusted:false}}),
  {code:'E_ADBLOCK_TRUSTED_CLICK'});
});
test('trusted native click gates optional Chrome permission prompt; disabled tool never prompts',async()=>{
  class Node{
    constructor(){this.children=[];this.listeners={};this.hidden=false;this.disabled=false;
      this.attributes={};this.textContent='';}
    append(...nodes){this.children.push(...nodes);}
    addEventListener(name,fn){this.listeners[name]=fn;}
    setAttribute(name,value){this.attributes[name]=value;}
  }
  const container=new Node(),doc={createElement:()=>new Node()};
  let requests=0;const changes=[];
  const tool=await createSidebarToolPackage(PROJECT);
  const runOperation=async(operation)=>{
    changes.push(operation);
    return {enabled:operation==='adblock.enable',exceptions:[],currentHost:'news.example.com',
      permissions:{dnr:operation==='adblock.enable'},rules:{verified:operation==='adblock.enable'}};
  };
  const controls=createAdblockPermissionControls({api:{permissions:{request(){
    requests++;return Promise.resolve(true);
  }}},doc,container,notice:()=>{},runOperation});
  controls.render(tool,false,false);
  const global=container.children[0].children[0].children[1];
  assert.equal(container.hidden,false);
  assert.equal(global.disabled,true);
  global.listeners.click({isTrusted:true});assert.equal(requests,0);
  controls.render(tool,false,true);
  await new Promise(done=>setImmediate(done));
  global.listeners.click({isTrusted:false});assert.equal(requests,0);
  global.listeners.click({isTrusted:true});
  assert.equal(requests,1,'native Chrome permission request must begin synchronously');
  await new Promise(done=>setImmediate(done));
  assert.ok(changes.includes('adblock.enable'));
});
