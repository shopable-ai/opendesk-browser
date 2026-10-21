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
import {FOCUS_RULE_FIRST} from '../../examples/sidebar-tools/stay-focus/trusted/policy.js';
import {ADBLOCK_ID,ADBLOCK_STORE,ADBLOCK_PROTOCOL,ADBLOCK_PAGE_PROTOCOL,ADBLOCK_CAPABILITY,
  ADBLOCK_RULE_FIRST,ADBLOCK_RULE_LAST,ADBLOCK_DNR_CLEANUP_STORE,adblockHost} from '../../examples/sidebar-tools/adblock/trusted/policy.js';
import {wantedAdblockRules,clearAdblockRules,reconcileAdblockRules}
  from '../../examples/sidebar-tools/adblock/trusted/rules.js';
import {createAdblockService,installAdblockService} from '../../examples/sidebar-tools/adblock/trusted/service.js';
import {stopAdblockForTool} from '../../examples/sidebar-tools/adblock/trusted/lifecycle.js';
import {createAdblockPermissionControls} from '../../examples/sidebar-tools/adblock/trusted/host-controls.js';
import {requestAdblockOperation,runTrustedAdblockOperation}
  from '../../examples/sidebar-tools/adblock/trusted/tool-host.js';

const PROJECT=resolve('examples/sidebar-tools/adblock');
const senderId='abcdefghijklmnopabcdefghijklmnop';
const hostUrl='chrome-extension://'+senderId+
  '/sidepanel.html?hostInstanceId=123e4567-e89b-42d3-a456-426614174000';
const sender={id:senderId,url:hostUrl,documentId:'live-doc',frameId:0,
  documentLifecycle:'active'};
const focusRule={id:FOCUS_RULE_FIRST,priority:28,action:{
  type:'redirect',redirect:{extensionPath:'/stay-focus/blocked-quota.html'}},
  condition:{urlFilter:'||blocked.example^',resourceTypes:['main_frame']}};
async function fixture({permission:initialPermission=true,sessionFailure=null}={}){
  const tool=await createSidebarToolPackage(PROJECT),hash=await sidebarToolPackageHash(tool);
  assert.equal(tool.capabilities.includes(ADBLOCK_CAPABILITY),true);
  const bytes=encodeSidebarToolPackage(tool),stored=new Map([
    [SIDEBAR_TOOL_STORE,[tool]],[SIDEBAR_TOOL_ENABLE_STORE,{}],
    [TOOL_REVOCATION_EPOCHS_STORE,{[ADBLOCK_ID]:'epoch-1'}]]);
  let current='https://news.example.com/story',permission=initialPermission,dropUpdates=false,
    unknownWrite=false,corruptNative=false;
  let rules=[structuredClone(focusRule)],sessionRules=[],enabledRulesets=[];
  const event=()=>{
    const listeners=new Set();
    return {addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn),
      emit(...args){for(const fn of listeners)fn(...args);}};
  };
  const storageChanged=event(),permissionRemoved=event(),permissionAdded=event();
  const locks=[],changes=[],actions=[];
  const sessionStored=new Map([['other-runtime',{untouched:true}]]),sessionChanges=[];
  let sessionReads=0;
  const sessionStorage={async get(key){
    sessionReads++;
    if(sessionFailure==='read'||sessionFailure==='readback'&&sessionReads>1)
      throw Error('session read failed');
    return sessionStored.has(key)?{[key]:structuredClone(sessionStored.get(key))}:{};
  },async set(values){
    if(sessionFailure==='write')throw Error('session write failed');
    for(const [key,value] of Object.entries(values)){
      sessionChanges.push(key);
      if(sessionFailure!=='drop-write')sessionStored.set(key,structuredClone(value));
    }
  }};
  const storage={async get(keys){
    const list=Array.isArray(keys)?keys:keys===null?[...stored.keys()]:[keys];
    return Object.fromEntries(list.filter(key=>stored.has(key))
      .map(key=>[key,structuredClone(stored.get(key))]));
  },async set(values){
    const delta={};
    for(const [key,value] of Object.entries(values)){
      delta[key]={oldValue:structuredClone(stored.get(key)),newValue:structuredClone(value)};
      stored.set(key,structuredClone(value));changes.push(key);
    }
    storageChanged.emit(delta,'local');
    if(unknownWrite){unknownWrite=false;throw Error('lost acknowledgement');}
  },async remove(key){stored.delete(key);}};
  let nativeDelay=0;
  const api={
    runtime:{id:senderId,getURL:path=>'chrome-extension://'+senderId+'/'+path,
      getContexts:async()=>[{contextType:'SIDE_PANEL',documentUrl:hostUrl,
        documentId:'live-doc',frameId:0,windowId:10,incognito:false}]},
    storage:{local:storage,session:sessionFailure==='missing'?undefined:sessionStorage,
      onChanged:storageChanged},
    permissions:{async contains(){return permission;},onRemoved:permissionRemoved,onAdded:permissionAdded},
    windows:{async getCurrent(){return {id:10,incognito:false};},
      async get(id){return {id,incognito:false};}},
    tabs:{async query(){return [{id:1,windowId:10,url:current,active:true,incognito:false}];}},
    declarativeNetRequest:{
      async getSessionRules(){return structuredClone(sessionRules);},
      async getEnabledRulesets(){return [...enabledRulesets];},
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
  return {tool,hash,api,stored,service,lockManager,fetcher,changes,locks,actions,message,
    sessionStored,sessionChanges,
    restartService:()=>createAdblockService({api,lockManager,fetcher}),
    get rules(){return rules;},
    sessionRules,enabledRulesets,permissionRemoved,permissionAdded,
    get permission(){return permission;},
    setPermission:value=>{permission=value;service.invalidate(!value);},
    setCurrent:value=>{current=value;},
    corruptNative:value=>{corruptNative=value;},
    dropUpdates:value=>{dropUpdates=value;},
    setDelay:value=>{nativeDelay=value;},
    setUnknownWrite:value=>{unknownWrite=value;}};
}
function pageSender(f){
  const url='https://www.javbus.com/';
  f.setCurrent(url);
  const tab={id:1,windowId:10,url,incognito:false};
  f.api.tabs.get=async()=>({...tab});
  f.api.webNavigation={getFrame:async()=>({url,documentId:'page-doc',documentLifecycle:'active'})};
  return {id:senderId,url,frameId:0,documentId:'page-doc',documentLifecycle:'active',tab};
}

test('lost picker write receipts reconcile read-only across worker restart and duplicate operations',async()=>{
  const f=await fixture(),page=pageSender(f);
  f.api.tabs.sendMessage=async(_,message)=>({ok:true,host:message.host});
  await f.service.dispatch(f.message('adblock.enable'),sender);
  await f.service.dispatch(f.message('adblock.cosmetic.pick'),sender);
  const request=type=>({protocol:ADBLOCK_PAGE_PROTOCOL,type,selector:'#promo'});
  // The transport loses the response after the real owner has committed it.
  await assert.rejects(async()=>{
    await f.service.pagePolicy(request('hide'),page);throw Error('lost hide receipt');
  },/lost hide receipt/);
  const worker=f.restartService();
  const lookup=async present=>{
    const before={changes:f.changes.length,actions:f.actions.length,session:f.sessionChanges.length};
    assert.deepEqual(await worker.pagePolicy(request('lookup'),page),{
      version:1,host:'www.javbus.com',selector:'#promo',present});
    assert.deepEqual({changes:f.changes.length,actions:f.actions.length,session:f.sessionChanges.length},before);
  };
  await lookup(true);
  await assert.rejects(worker.pagePolicy(request('hide'),page),{code:'E_ADBLOCK_COSMETIC_SESSION'});
  await lookup(true);
  await assert.rejects(async()=>{
    await worker.pagePolicy(request('undo'),page);throw Error('lost undo receipt');
  },/lost undo receipt/);
  await lookup(false);
  await assert.rejects(worker.pagePolicy(request('undo'),page),{code:'E_ADBLOCK_COSMETIC_CHANGED'});
  await lookup(false);
  assert.equal(f.changes.filter(key=>key==='opendesk.adblock.cosmetic.v1').length,2);
});

test('picker lookup fails unknown on revoked permissions, corrupt storage or stale document without writes',async()=>{
  for(const scenario of ['permission','cosmetic','installation','document']){
    const f=await fixture(),page=pageSender(f);
    await f.service.dispatch(f.message('adblock.enable'),sender);
    if(scenario==='permission')f.setPermission(false);
    if(scenario==='cosmetic')f.stored.set('opendesk.adblock.cosmetic.v1',{version:9,entries:[]});
    if(scenario==='installation')f.stored.set(SIDEBAR_TOOL_STORE,{broken:true});
    if(scenario==='document')page.documentId='stale-doc';
    const stored=structuredClone([...f.stored]),changes=f.changes.length,actions=f.actions.length;
    await assert.rejects(f.service.pagePolicy({protocol:ADBLOCK_PAGE_PROTOCOL,
      type:'lookup',selector:'#promo'},page));
    assert.deepEqual([...f.stored],stored,scenario+' must preserve storage');
    assert.equal(f.changes.length,changes,scenario+' cannot write');
    assert.equal(f.actions.length,actions,scenario+' cannot reconcile DNR');
  }
});
test('page cosmetics require the existing enabled authority and respect exact-host exceptions',async()=>{
  const f=await fixture(),page=pageSender(f),request={protocol:ADBLOCK_PAGE_PROTOCOL};
  assert.equal((await f.service.pagePolicy(request,page)).enabled,false);
  await f.service.dispatch(await f.message('adblock.enable'),sender);
  const actions=f.actions.length;
  assert.deepEqual(await f.service.pagePolicy(request,page),{version:1,host:'www.javbus.com',enabled:true});
  assert.equal(f.actions.length,actions,'policy reads do not change an already reconciled matcher');
  await f.service.dispatch(await f.message('adblock.site.set',{host:'www.javbus.com',filtering:false}),sender);
  assert.equal((await f.service.pagePolicy(request,page)).enabled,false);
  await f.service.dispatch(await f.message('adblock.site.restore',{host:'www.javbus.com'}),sender);
  assert.equal((await f.service.pagePolicy(request,page)).enabled,true);
  await f.service.dispatch(await f.message('adblock.disable'),sender);
  assert.equal((await f.service.pagePolicy(request,page)).enabled,false);
});
test('page policy refuses untrusted targets, subframes, stale documents and caller-selected CSS',async()=>{
  const f=await fixture(),page=pageSender(f),request={protocol:ADBLOCK_PAGE_PROTOCOL};
  for(const bad of [{...page,id:'forged'},{...page,frameId:1},{...page,documentId:'old'},
    {...page,tab:{...page.tab,incognito:true}},{...page,documentLifecycle:'cached'},
    {...page,url:'https://www.javbus.com.evil.test/'},{...page,url:'chrome-extension://'+senderId+'/sidepanel.html'}])
    await assert.rejects(f.service.pagePolicy(request,bad),{code:'E_ADBLOCK_SENDER'});
  await assert.rejects(f.service.pagePolicy({...request,css:'body{display:none}'},page),{code:'E_ADBLOCK_REQUEST'});
  await assert.rejects(f.service.pagePolicy({...request,operation:'adblock.enable'},page),{code:'E_ADBLOCK_REQUEST'});
  assert.equal(f.actions.length,0);
});
test('page policy never returns active CSS after navigation, origin revocation or package tampering',async()=>{
  const f=await fixture(),page=pageSender(f),request={protocol:ADBLOCK_PAGE_PROTOCOL};
  await f.service.dispatch(await f.message('adblock.enable'),sender);
  let reads=0;
  f.api.webNavigation.getFrame=async()=>({url:page.url,documentId:++reads===1?'page-doc':'new-doc'});
  await assert.rejects(f.service.pagePolicy(request,page),{code:'E_ADBLOCK_SENDER'});
  pageSender(f);
  const original=f.api.permissions.contains;
  f.api.permissions.contains=async value=>value.origins?false:original(value);
  await assert.rejects(f.service.pagePolicy(request,page),{code:'E_ADBLOCK_SENDER'});
  f.api.permissions.contains=original;
  f.stored.set(SIDEBAR_TOOL_STORE,[{...f.tool,js:f.tool.js+'\n// same-id modified package'}]);
  assert.equal((await f.service.pagePolicy(request,page)).enabled,false);
  assert.deepEqual(f.rules.map(rule=>rule.id),[FOCUS_RULE_FIRST]);
});
test('installation probe accepts Chrome hiding ungranted optional DNR but rejects a broken granted runtime',async()=>{
  const f=await fixture({permission:false});
  delete f.api.declarativeNetRequest;
  const before=structuredClone([...f.stored]);
  const probe=f.message('adblock.probe');delete probe.installEpoch;
  const ready=await f.service.probe(probe,sender);
  assert.equal(ready.serviceReady,true);
  assert.equal(ready.permissions.dnr,false);
  assert.deepEqual([...f.stored],before,'probing never installs, grants, or changes intent');
  f.setPermission(true);
  await assert.rejects(f.service.probe(probe,sender),{code:'E_ADBLOCK_RUNTIME'});
});
test('first optional DNR grant requires reload before enabling or writing Chrome rules',async()=>{
  const f=await fixture({permission:false});
  const probe=f.message('adblock.probe');delete probe.installEpoch;
  assert.equal((await f.service.probe(probe,sender)).permissions.dnr,false);
  const before=structuredClone([...f.stored]);
  f.setPermission(true);
  const status=await f.service.dispatch(f.message('adblock.status'),sender);
  assert.equal(status.permissions.dnr,true);assert.equal(status.restartRequired,true);
  assert.equal(status.enabled,false);assert.equal(status.rules.verified,false);
  await assert.rejects(f.service.dispatch(f.message('adblock.enable'),sender),error=>{
    assert.equal(error.code,'E_ADBLOCK_RESTART_REQUIRED');
    assert.match(error.message,/保存.*重新加载 OpenDesk Browser 扩展/);
    return true;
  });
  assert.deepEqual([...f.stored],before,'first grant must not persist enabled intent');
  assert.equal(f.actions.length,0,'never submit to the uninitialized Chrome queue');
  assert.deepEqual(f.sessionStored.get('other-runtime'),{untouched:true});
  assert.equal(f.sessionChanges.length,1);
});
test('SW recreation retains the false DNR session fence; a new browser session can initialize ready',async()=>{
  const f=await fixture({permission:false});await f.service.tick();
  f.setPermission(true);
  const worker=f.restartService();
  const status=await worker.tick();
  assert.equal(status.restartRequired,true);assert.equal(status.enabled,false);
  await assert.rejects(worker.dispatch(f.message('adblock.enable'),sender),{
    code:'E_ADBLOCK_RESTART_REQUIRED'});
  assert.equal(f.actions.length,0);assert.equal(f.sessionChanges.length,1);
  // Chrome clears storage.session on extension reload/browser restart, not SW stop.
  for(const key of f.sessionChanges)f.sessionStored.delete(key);
  const reloaded=f.restartService();
  const fresh=await reloaded.tick();
  assert.equal(fresh.restartRequired,false);assert.equal(fresh.enabled,false);
  assert.equal((await reloaded.dispatch(f.message('adblock.enable'),sender)).enabled,true);
  assert.equal(f.actions.length,1,'only the fresh explicit enable writes DNR');
  assert.deepEqual(f.sessionStored.get('other-runtime'),{untouched:true});
});
test('session initialization failure is unknown, with no local intent or DNR writes',async t=>{
  for(const sessionFailure of ['missing','read','write','readback','drop-write']){
    await t.test(sessionFailure,async()=>{
      const f=await fixture({sessionFailure}),before=structuredClone([...f.stored]);
      await assert.rejects(f.service.tick(),{code:'E_OUTCOME_UNKNOWN'});
      await assert.rejects(f.service.dispatch(f.message('adblock.enable'),sender),{
        code:'E_OUTCOME_UNKNOWN'});
      const probe=f.message('adblock.probe');delete probe.installEpoch;
      await assert.rejects(f.service.probe(probe,sender),{code:'E_OUTCOME_UNKNOWN'});
      assert.deepEqual([...f.stored],before);assert.equal(f.actions.length,0);
      assert.deepEqual(f.sessionStored.get('other-runtime'),{untouched:true});
    });
  }
});
test('unknown Chrome DNR permission read never starts local intent or native rule changes',async t=>{
  for(const failure of ['throws','unknown']){
    await t.test(failure,async()=>{
      const f=await fixture(),before=structuredClone([...f.stored]);
      f.api.permissions.contains=async()=>{
        if(failure==='throws')throw Error('native permission API unavailable');
        return undefined;
      };
      await assert.rejects(f.service.tick(),{code:'E_OUTCOME_UNKNOWN'});
      await assert.rejects(f.service.dispatch(f.message('adblock.enable'),sender),{
        code:'E_OUTCOME_UNKNOWN'});
      assert.deepEqual([...f.stored],before);
      assert.equal(f.actions.length,0);
    });
  }
});
test('malformed DNR session fence remains unknown and is not overwritten on SW recreation',async()=>{
  const f=await fixture();await f.service.tick();
  const key=f.sessionChanges[0];f.sessionStored.set(key,{ready:true});
  const before=structuredClone([...f.sessionStored]),worker=f.restartService();
  await assert.rejects(worker.tick(),{code:'E_OUTCOME_UNKNOWN'});
  assert.deepEqual([...f.sessionStored],before);assert.equal(f.actions.length,0);
});
test('blocked DNR initialization never confirms uninstall or corrupt-authority cleanup',async()=>{
  const f=await fixture({permission:false});await f.service.tick();f.setPermission(true);
  await f.api.declarativeNetRequest.updateDynamicRules({
    addRules:wantedAdblockRules({enabled:true,exceptions:[]})});
  f.stored.set(SIDEBAR_TOOL_STORE,[]);
  const status=await f.service.tick();
  assert.equal(status.installed,false);assert.equal(status.restartRequired,true);
  assert.equal(status.rules.verified,false);
  f.stored.set(SIDEBAR_TOOL_STORE,{broken:true});
  await assert.rejects(f.service.tick(),{code:'E_OUTCOME_UNKNOWN'});
  assert.equal(f.actions.length,1,'guarded cleanup cannot call updateDynamicRules');
  assert.ok(f.rules.some(rule=>rule.id===ADBLOCK_RULE_FIRST));
  assert.deepEqual(f.stored.get(SIDEBAR_TOOL_STORE),{broken:true});
});
test('official optional AdBlock uses one canonical installable project package',async()=>{
  const sources=await readOfficialSources();
  const row=sources.tools.find(row=>row.id==='adblock');
  assert.deepEqual(row,{id:'adblock',project:'examples/sidebar-tools/adblock',
    kind:'sidebar-tool',installationPolicy:'optional'});
  const path='examples/sidebar-tools/adblock/adblock.opendesk-tool.json';
  const expected=encodeSidebarToolPackage(await createSidebarToolPackage(PROJECT));
  // While source/CI is pending the sole formal package must not be forged.
  let actual;
  try{actual=await readFile(path);}catch(error){if(error.code!=='ENOENT')throw error;}
  if(actual){
    const released=JSON.parse(actual);
    const next=JSON.parse(expected);
    if(released.version===next.version)
      assert.deepEqual(actual,expected,'same-version package must match deterministic builder bytes');
    else assert.equal(released.version,'1.2.1',
      'only the previously published 1.2.1 can remain until native release approval');
  }
  await assert.rejects(access('src/sidebar-tools/adblock.opendesk-tool.json'),{code:'ENOENT'});
});
test('build-ready official project, current version, one declared restricted capability',async()=>{
  const pkg=await createSidebarToolPackage(PROJECT);
  assert.equal(pkg.version,'1.2.2');
  assert.deepEqual(pkg.capabilities,[ADBLOCK_CAPABILITY]);
  assert.ok(pkg.js.includes("adblock.site.restore"));
});
test('offline snapshot keeps the domain block third-party-only alongside scoped site rules',()=>{
  const rules=wantedAdblockRules({enabled:true,exceptions:[]});
  assert.equal(rules.length,2);
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
  assert.equal(meta.rules.totalUnique,68);
  assert.equal(meta.version,'2026-10-21.1');
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
  assert.equal(pattern.test('https://example.com./news'),true,'same normalized hostname');
  assert.equal(pattern.test('https://example.com.:8443/news'),true);
  assert.equal(pattern.test('https://example.com..'),false);
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
test('an installed package from an older bundle requires review without changing authority or rules',async()=>{
  const f=await fixture({permission:false});
  const older={...f.tool,version:'1.1.0'};
  f.stored.set(SIDEBAR_TOOL_STORE,[older]);
  const packageHash=await sidebarToolPackageHash(older);
  const before=structuredClone([...f.stored]);
  for(const operation of ['adblock.status','adblock.enable']){
    await assert.rejects(f.service.dispatch({...f.message(operation),packageHash},sender),error=>{
      assert.equal(error.code,'E_ADBLOCK_UPDATE_REQUIRED');
      assert.match(error.message,/版本不匹配/);
      assert.match(error.message,/重启 Chrome 不会更新工具包/);
      return true;
    });
  }
  assert.deepEqual([...f.stored],before,'a rejected old bundle cannot change installed authority or intent');
  assert.equal(f.actions.length,0,'version diagnosis cannot write DNR rules');
  assert.equal(f.permission,false,'version diagnosis cannot grant native permissions');
  await assert.rejects(f.service.dispatch({...f.message('adblock.status'),packageHash,
    installEpoch:'old'},sender),{code:'E_TOOL_CHANGED'});
});

test('forged sender, same-ID package digest and obsolete epoch are denied',async()=>{
  const f=await fixture(),msg=await f.message('adblock.enable');
  await assert.rejects(f.service.dispatch(msg,{...sender,id:'forged'}),{code:'E_ADBLOCK_SENDER'});
  await assert.rejects(f.service.dispatch(msg,{...sender,documentId:'old-doc'}),{code:'E_ADBLOCK_SENDER'});
  await assert.rejects(f.service.dispatch({...msg,packageHash:'f'.repeat(64)},sender),{code:'E_TOOL_CHANGED'});
  await assert.rejects(f.service.dispatch({...msg,installEpoch:'old'},sender),{code:'E_TOOL_CHANGED'});
  assert.deepEqual(f.rules.map(x=>x.id),[FOCUS_RULE_FIRST]);
});
test('current site is bound to the authenticated panel window rather than global focus',async()=>{
  const f=await fixture(),queries=[];
  f.api.tabs.query=async query=>{
    queries.push(query);
    return [{id:1,windowId:10,active:true,incognito:false,
      url:query.windowId===10?'https://www.javbus.com/':'https://www.speedtest.net/'}];
  };
  const data=await f.service.dispatch(f.message('adblock.status'),sender);
  assert.equal(data.currentHost,'www.javbus.com');
  assert.equal(data.currentSite.status,'ready');
  assert.deepEqual(queries,[{active:true,windowId:10}]);
});

test('pending navigation prevents site changes and automatically resolves after commit',async()=>{
  const f=await fixture();
  const tab={id:1,windowId:10,active:true,incognito:false,
    url:'https://www.speedtest.net/',pendingUrl:'https://www.javbus.com/'};
  f.api.tabs.query=async()=>[tab];
  const pending=await f.service.dispatch(f.message('adblock.enable'),sender);
  assert.equal(pending.enabled,true,'global DNR does not depend on a current website');
  assert.equal(pending.currentHost,null);
  assert.equal(pending.currentSite.status,'navigating');
  await assert.rejects(f.service.dispatch(f.message('adblock.site.set',{
    host:'www.speedtest.net',filtering:false}),sender),{code:'E_ADBLOCK_SITE_CHANGED'});
  delete tab.pendingUrl;
  tab.url='https://www.javbus.com/';
  const committed=await f.service.dispatch(f.message('adblock.status'),sender);
  assert.equal(committed.currentHost,'www.javbus.com');
  assert.equal(committed.currentSite.status,'ready');
});

test('current site distinguishes private, unsupported, missing and failed page identity',async()=>{
  const f=await fixture();
  const base={id:1,windowId:10,active:true,incognito:false,url:'https://news.example.com/'};
  for(const [change,status] of [
    [{incognito:true},'incognito'],[{url:'chrome://extensions/'},'unsupported'],
    [{url:'not a URL'},'unsupported'],[{url:undefined},'unavailable'],
    [{windowId:20},'unavailable']]){
    f.api.tabs.query=async()=>[{...base,...change}];
    const data=await f.service.dispatch(f.message('adblock.status'),sender);
    assert.equal(data.currentHost,null);
    assert.equal(data.currentSite.status,status);
  }
  f.api.tabs.query=async()=>{throw Error('query failed');};
  const failed=await f.service.dispatch(f.message('adblock.status'),sender);
  assert.equal(failed.currentHost,null);
  assert.equal(failed.currentSite.reason,'tab-query-failed');
});

test('missing panel window identity never falls back to a different focused window',async()=>{
  const f=await fixture();
  const contexts=f.api.runtime.getContexts;
  f.api.runtime.getContexts=async()=> (await contexts()).map(row=>({...row,windowId:-1}));
  f.api.tabs.query=async()=>{assert.fail('must not query a guessed window');};
  await assert.rejects(f.service.dispatch(f.message('adblock.status'),sender),{
    code:'E_ADBLOCK_SENDER'});
});

test('Chrome panel context without window metadata uses its trusted Host window',async()=>{
  const f=await fixture(),contexts=f.api.runtime.getContexts,queries=[];
  f.api.runtime.getContexts=async()=>
    (await contexts()).map(row=>({...row,windowId:-1,tabId:-1}));
  f.api.windows.getCurrent=async()=>{assert.fail('SW must not resolve the current or focused window');};
  f.api.windows.getLastFocused=async()=>{assert.fail('SW must not use a focused-window fallback');};
  f.api.tabs.query=async query=>{
    queries.push(query);
    return [{id:1,windowId:10,active:true,incognito:false,url:'http://127.0.0.1:43111/demo-form.html'}];
  };
  const send=(operation,payload={})=>f.service.dispatch({
    ...f.message(operation,payload),hostWindowId:10},sender);
  const status=await send('adblock.status');
  assert.equal(status.currentHost,'127.0.0.1');
  assert.equal(status.currentSite.status,'ready');
  assert.equal((await send('adblock.enable')).enabled,true);
  const excepted=await send('adblock.site.set',{host:'127.0.0.1',filtering:false});
  assert.deepEqual(excepted.exceptions,['127.0.0.1']);
  assert.ok(queries.length>0);
  assert.ok(queries.every(query=>query.active===true&&query.windowId===10));
});

test('Host window metadata cannot override a verified context or malformed window',async()=>{
  const cases=[
    {contextType:'SIDE_PANEL',contextWindow:10,hostWindowId:20},
    {contextType:'SIDE_PANEL',contextWindow:-2,hostWindowId:10},
    {contextType:'TAB',contextWindow:-1,hostWindowId:10},
    {contextType:'TAB',contextWindow:10,hostWindowId:10,senderWindow:20},
    {contextType:'SIDE_PANEL',contextWindow:-1,hostWindowId:10,window:{id:20,incognito:false}},
    {contextType:'SIDE_PANEL',contextWindow:-1,hostWindowId:10,window:{id:10,incognito:true}},
    {contextType:'SIDE_PANEL',contextWindow:-1,hostWindowId:10,missing:true}
  ];
  for(const scenario of cases){
    const f=await fixture();
    f.api.runtime.getContexts=async()=>[{contextType:scenario.contextType,documentUrl:hostUrl,
      documentId:'live-doc',frameId:0,tabId:3,windowId:scenario.contextWindow,incognito:false}];
    f.api.windows.get=async id=>{
      if(scenario.missing)throw Error('window closed');
      return scenario.window||{id,incognito:false};
    };
    f.api.tabs.query=async()=>{assert.fail('invalid Host binding must not query a website');};
    const caller=scenario.contextType==='TAB'?{...sender,
      tab:{id:3,windowId:scenario.senderWindow??10,incognito:false}}:sender;
    await assert.rejects(f.service.dispatch({...f.message('adblock.enable'),
      hostWindowId:scenario.hostWindowId},caller),{code:'E_ADBLOCK_SENDER'},JSON.stringify(scenario));
    assert.equal(f.actions.length,0);assert.equal(f.changes.length,0);
  }
});

test('invalid Host window fields and sandbox payload window claims are rejected',async()=>{
  const f=await fixture();
  for(const hostWindowId of [-1,1.5,'10',null,Number.MAX_SAFE_INTEGER+1]){
    await assert.rejects(f.service.dispatch({...f.message('adblock.enable'),hostWindowId},sender),{
      code:'E_ADBLOCK_REQUEST'});
  }
  await assert.rejects(f.service.dispatch({...f.message('adblock.enable',{hostWindowId:10}),
    hostWindowId:10},sender),{code:'E_ADBLOCK_REQUEST'});
  assert.equal(f.actions.length,0);assert.equal(f.changes.length,0);
});

test('negative panel context still rejects stale or forged documents before writes',async()=>{
  for(const changed of [{documentId:'stale-doc'},{documentUrl:hostUrl+'#forged'}]){
    const f=await fixture(),contexts=f.api.runtime.getContexts;
    let reads=0;
    f.api.runtime.getContexts=async()=>
      (await contexts()).map(row=>({...row,windowId:-1,...(++reads>1?changed:{})}));
    await assert.rejects(f.service.dispatch({...f.message('adblock.enable'),hostWindowId:10},sender),{
      code:'E_ADBLOCK_SENDER'});
    assert.equal(f.actions.length,0);assert.equal(f.changes.length,0);
  }
  const f=await fixture();
  await assert.rejects(f.service.dispatch({...f.message('adblock.enable'),hostWindowId:10},
    {...sender,id:'forged'}),{code:'E_ADBLOCK_SENDER'});
});

test('panel window loss is fenced before writes and unknown after native effects',async()=>{
  for(const phase of ['before-write','native-write']){
    const f=await fixture(),contexts=f.api.runtime.getContexts;
    let closed=false,reads=0;
    f.api.runtime.getContexts=async()=>
      (await contexts()).map(row=>({...row,windowId:-1,tabId:-1}));
    f.api.windows.get=async id=>{
      if(closed||phase==='before-write'&&++reads>1)throw Error('window closed');
      return {id,incognito:false};
    };
    const update=f.api.declarativeNetRequest.updateDynamicRules;
    f.api.declarativeNetRequest.updateDynamicRules=async args=>{
      await update(args);closed=true;
    };
    await assert.rejects(f.service.dispatch({...f.message('adblock.enable'),hostWindowId:10},sender),{
      code:phase==='before-write'?'E_ADBLOCK_SENDER':'E_OUTCOME_UNKNOWN'},phase);
    assert.equal(f.actions.length,phase==='before-write'?0:1,'never replay the DNR write');
    if(phase==='before-write')assert.equal(f.changes.length,0);
  }
});

test('a hosted tool tab also resolves the active page only inside its verified window',async()=>{
  const f=await fixture();
  f.api.runtime.getContexts=async()=>[{contextType:'TAB',documentUrl:hostUrl,
    documentId:'live-doc',frameId:0,tabId:3,windowId:10,incognito:false}];
  f.api.tabs.query=async query=>{
    assert.deepEqual(query,{active:true,windowId:10});
    return [{id:1,windowId:10,active:true,incognito:false,url:'https://www.speedtest.net/'}];
  };
  const data=await f.service.dispatch(f.message('adblock.status'),{
    ...sender,tab:{id:3,windowId:10,incognito:false}});
  assert.equal(data.currentHost,'www.speedtest.net');
});

test('a host moved to another window cannot write with its old window binding',async()=>{
  const f=await fixture(),contexts=f.api.runtime.getContexts;
  let reads=0;
  f.api.runtime.getContexts=async()=> (await contexts()).map(row=>({
    ...row,windowId:++reads===1?10:20}));
  await assert.rejects(f.service.dispatch(f.message('adblock.enable'),sender),{
    code:'E_ADBLOCK_SENDER'});
  assert.equal(f.changes.length,0);
  assert.equal(f.actions.length,0);
});

test('Chrome DNR enable/readback, pause, resume and owned-only cleanup',async()=>{
  const f=await fixture();
  const first=await f.service.dispatch(await f.message('adblock.enable'),sender);
  assert.equal(first.rules.verified,true);assert.equal(first.enabled,true);
  assert.deepEqual(f.rules.map(x=>x.id),[FOCUS_RULE_FIRST,ADBLOCK_RULE_FIRST,ADBLOCK_RULE_LAST]);
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
  assert.deepEqual(f.rules.map(x=>x.id),[FOCUS_RULE_FIRST,ADBLOCK_RULE_FIRST,ADBLOCK_RULE_LAST]);
});
test('other low-priority dynamic redirect forces fail-closed AdBlock exceptions',async()=>{
  const f=await fixture();await f.service.dispatch(await f.message('adblock.enable'),sender);
  f.rules.push({...focusRule,id:733333,priority:1});
  await assert.rejects(f.service.dispatch(await f.message('adblock.site.set',{
    host:'news.example.com',filtering:false}),sender),{code:'E_ADBLOCK_PRIORITY_CONFLICT'});
  assert.deepEqual(f.rules.map(x=>x.id),[FOCUS_RULE_FIRST,733333]);
  const paused=f.stored.get(ADBLOCK_STORE);
  assert.equal(paused.enabled,false);
  assert.equal(paused.approvedHash,null);assert.equal(paused.approvedEpoch,null);
  await f.service.tick();
  f.rules.splice(f.rules.findIndex(x=>x.id===733333),1);
  assert.equal((await f.service.tick()).enabled,false,'removing the conflict cannot renew intent');
  assert.deepEqual(f.rules.map(x=>x.id),[FOCUS_RULE_FIRST]);
  assert.equal((await f.service.dispatch(f.message('adblock.enable'),sender)).enabled,true);
});
test('malformed install, enable and epoch authority preserve storage while retiring owned DNR',async t=>{
  for(const [key,value] of [[SIDEBAR_TOOL_STORE,[{id:'adblock'}]],
    [SIDEBAR_TOOL_ENABLE_STORE,{adblock:'yes'}],
    [TOOL_REVOCATION_EPOCHS_STORE,{adblock:17}]]){
    await t.test(key,async()=>{
      for(const operation of ['tick','dispatch']){
        const f=await fixture();await f.service.dispatch(f.message('adblock.enable'),sender);
        f.stored.set(key,value);const before=structuredClone([...f.stored]);
        await assert.rejects(operation==='tick'?f.service.tick():
          f.service.dispatch(f.message('adblock.status'),sender));
        assert.deepEqual([...f.stored],before,'authority corruption must not be rewritten');
        assert.deepEqual(f.rules.map(x=>x.id),[FOCUS_RULE_FIRST]);
      }
    });
  }
});
test('authority cleanup failure is unknown and never rewrites corrupt storage or replays DNR',async()=>{
  const f=await fixture();await f.service.dispatch(f.message('adblock.enable'),sender);
  f.stored.set(SIDEBAR_TOOL_STORE,[{id:'adblock'}]);
  const before=structuredClone([...f.stored]),actions=f.actions.length;
  f.dropUpdates(true);
  await assert.rejects(f.service.tick(),{code:'E_OUTCOME_UNKNOWN'});
  assert.equal(f.actions.length,actions+1);
  assert.deepEqual([...f.stored],before);
  assert.ok(f.rules.some(x=>x.id===ADBLOCK_RULE_FIRST));
});
test('site exceptions reject session collisions, enabled static and unavailable safety readback',async t=>{
  for(const kind of ['session','session-owned-id','static','missing-session','session-read-failure','static-read-failure']){
    await t.test(kind,async()=>{
      const f=await fixture();await f.service.dispatch(f.message('adblock.enable'),sender);
      if(kind.startsWith('session')&&!kind.includes('failure'))
        f.sessionRules.push({...focusRule,id:kind==='session-owned-id'?ADBLOCK_RULE_FIRST:22,priority:2});
      if(kind==='static')f.enabledRulesets.push('uninspected-static');
      if(kind==='missing-session')delete f.api.declarativeNetRequest.getSessionRules;
      if(kind==='session-read-failure')f.api.declarativeNetRequest.getSessionRules=async()=>{throw Error('read failed');};
      if(kind==='static-read-failure')f.api.declarativeNetRequest.getEnabledRulesets=async()=>{throw Error('read failed');};
      const session=structuredClone(f.sessionRules),staticIds=[...f.enabledRulesets];
      await assert.rejects(f.service.dispatch(f.message('adblock.site.set',{
        host:'news.example.com',filtering:false}),sender),{code:'E_ADBLOCK_PRIORITY_CONFLICT'});
      assert.equal(f.stored.get(ADBLOCK_STORE).enabled,false);
      assert.equal(f.stored.get(ADBLOCK_STORE).approvedHash,null);
      assert.equal(f.stored.get(ADBLOCK_STORE).approvedEpoch,null);
      assert.deepEqual(f.rules.map(x=>x.id),[FOCUS_RULE_FIRST]);
      assert.deepEqual(f.sessionRules,session);assert.deepEqual(f.enabledRulesets,staticIds);
      assert.equal((await f.service.tick()).enabled,false);
    });
  }
});
test('high-priority session rules and disabled static rulesets allow safe site exceptions',async()=>{
  const f=await fixture();f.sessionRules.push({...focusRule,id:ADBLOCK_RULE_FIRST,priority:20});
  f.api.runtime.getManifest=()=>({declarative_net_request:{rule_resources:[{id:'off',enabled:false}]}});
  await f.service.dispatch(f.message('adblock.enable'),sender);
  await f.service.dispatch(f.message('adblock.site.set',{host:'news.example.com',filtering:false}),sender);
  assert.ok(f.rules.some(x=>x.action.type==='allowAllRequests'));
  assert.equal(f.sessionRules[0].priority,20);
});
test('Document loss is ordinary before writes and unknown after persistent or native effects',async t=>{
  for(const point of ['before-write','state-write','native-write','final-host-read','revocation-write']){
    await t.test(point,async()=>{
      const f=await fixture();let live=true;
      f.api.runtime.getContexts=async()=>live?[{contextType:'SIDE_PANEL',documentUrl:hostUrl,
        documentId:'live-doc',frameId:0,windowId:10,incognito:false}]:[];
      if(point==='revocation-write'){
        await f.service.dispatch(f.message('adblock.enable'),sender);f.setPermission(false);
      }
      const previousWrites=f.changes.length,previousActions=f.actions.length;
      const set=f.api.storage.local.set,update=f.api.declarativeNetRequest.updateDynamicRules;
      if(point==='before-write'){
        const contains=f.api.permissions.contains;
        f.api.permissions.contains=async()=>{live=false;return contains();};
      }else if(point==='state-write'||point==='revocation-write'){
        f.api.storage.local.set=async value=>{await set(value);live=false;};
      }else if(point==='native-write'){
        f.api.declarativeNetRequest.updateDynamicRules=async value=>{await update(value);live=false;};
      }else{
        const query=f.api.tabs.query;
        f.api.tabs.query=async()=>{live=false;return query();};
      }
      await assert.rejects(f.service.dispatch(f.message(point==='revocation-write'?
        'adblock.status':'adblock.enable'),sender),{
        code:point==='before-write'?'E_ADBLOCK_SENDER':'E_OUTCOME_UNKNOWN'});
      assert.equal(f.changes.length,previousWrites+(point==='before-write'?0:1));
      assert.equal(f.actions.length,previousActions+
        (point==='native-write'||point==='final-host-read'?1:0),'no rollback or replay');
    });
  }
});
test('live storage events complete under the tool lock and origin revocation never auto-resumes',{timeout:3000},async()=>{
  const f=await fixture(),installed=installAdblockService({api:f.api,lockManager:f.lockManager,fetcher:f.fetcher});
  const drain=()=>f.lockManager.request('opendesk.sidebar-tools:tool:adblock',()=>{});
  try{
    await drain();
    f.stored.delete(TOOL_REVOCATION_EPOCHS_STORE);
    const enable=f.message('adblock.enable');enable.installEpoch=null;
    assert.equal((await installed.service.dispatch(enable,sender)).enabled,true);
    await drain();
    assert.ok(f.rules.some(x=>x.id===ADBLOCK_RULE_FIRST));
    const writes=f.changes.length;
    await installed.service.tick();await drain();
    assert.equal(f.changes.length,writes,'self storage events must converge without write loops');
    f.permissionRemoved.emit({origins:['https://news.example.com/*']});
    await drain();
    assert.equal(f.permission,true,'origin removal is not DNR capability removal');
    assert.equal(f.stored.get(ADBLOCK_STORE).enabled,false);
    assert.equal(f.stored.get(ADBLOCK_STORE).approvedHash,null);
    assert.equal(f.stored.get(ADBLOCK_STORE).approvedEpoch,null);
    assert.deepEqual(f.rules.map(x=>x.id),[FOCUS_RULE_FIRST]);
    f.permissionAdded.emit({origins:['https://news.example.com/*']});await drain();
    assert.equal((await installed.service.tick()).enabled,false);
    assert.equal((await installed.service.dispatch(enable,sender)).enabled,true);
    await drain();
    assert.equal((await installed.service.tick()).enabled,true,'self storage events must not undo a fresh re-enable');
  }finally{installed.dispose();}
});
test('priority conflict keeps durable intent disabled when native cleanup cannot be confirmed',async()=>{
  const f=await fixture();await f.service.dispatch(f.message('adblock.enable'),sender);
  f.sessionRules.push({...focusRule,id:1,priority:1});f.dropUpdates(true);
  await assert.rejects(f.service.dispatch(f.message('adblock.site.set',{
    host:'news.example.com',filtering:false}),sender),{code:'E_OUTCOME_UNKNOWN'});
  assert.equal(f.stored.get(ADBLOCK_STORE).enabled,false);
  assert.equal(f.stored.get(ADBLOCK_STORE).approvedHash,null);
  f.dropUpdates(false);await f.service.tick();
  assert.deepEqual(f.rules.map(x=>x.id),[FOCUS_RULE_FIRST]);
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
test('revocation cleanup uncertainty survives both worker and extension session resets',async()=>{
  const f=await fixture();await f.service.dispatch(f.message('adblock.enable'),sender);
  const writes=f.actions.length;
  f.setPermission(false);
  const revoked=await f.service.tick();
  assert.equal(revoked.restartRequired,true);
  assert.equal(revoked.permissions.dnr,false);assert.equal(revoked.rules.verified,false);
  assert.equal(revoked.enabled,false);
  assert.equal(f.stored.get(ADBLOCK_STORE).approvedHash,null);
  assert.equal(f.stored.get(ADBLOCK_STORE).approvedEpoch,null);
  assert.equal((await f.restartService().tick()).restartRequired,true,
    'stopping the worker cannot confirm matcher removal');
  assert.equal(f.actions.length,writes,'revoked DNR API must never be invoked');
  for(const key of f.sessionChanges)f.sessionStored.delete(key);
  const restarted=await f.restartService().tick();
  assert.equal(restarted.restartRequired,true,'session reset cannot prove removal of a revoked matcher');
  assert.equal(restarted.permissions.dnr,false);assert.equal(restarted.enabled,false);
  assert.equal(restarted.rules.verified,false,'no permission means no native rule readback');
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
  assert.equal(f.stored.has(ADBLOCK_DNR_CLEANUP_STORE),false);
  assert.equal(f.stored.get(TOOL_CLEANUP_STORE)?.[ADBLOCK_ID],undefined);
});
test('revoked DNR cannot complete uninstall cleanup or delete the recovery state',async()=>{
  const f=await fixture();await f.service.dispatch(f.message('adblock.enable'),sender);
  f.setPermission(false);
  const actions=f.actions.length,state=structuredClone(f.stored.get(ADBLOCK_STORE));
  await assert.rejects(stopAdblockForTool(f.api,ADBLOCK_ID),{code:'E_OUTCOME_UNKNOWN'});
  assert.equal(f.stored.get(ADBLOCK_DNR_CLEANUP_STORE),true);
  await recordToolUninstall(f.api,f.tool);f.stored.set(SIDEBAR_TOOL_STORE,[]);
  await assert.rejects(retryUninstalledToolCleanup({api:f.api,lockManager:f.lockManager,id:ADBLOCK_ID}),
    {code:'E_TOOL_UNINSTALL_CLEANUP'});
  assert.ok(f.stored.get(TOOL_CLEANUP_STORE)?.[ADBLOCK_ID]);
  assert.deepEqual(f.stored.get(ADBLOCK_STORE),state);
  assert.equal(f.actions.length,actions,'never invoke the revoked native API');
  assert.ok(f.rules.some(rule=>rule.id===ADBLOCK_RULE_FIRST),'the fixture retains the failed native matcher');
  for(const key of f.sessionChanges)f.sessionStored.delete(key);
  await assert.rejects(retryUninstalledToolCleanup({api:f.api,lockManager:f.lockManager,id:ADBLOCK_ID}),
    {code:'E_TOOL_UNINSTALL_CLEANUP'});
  assert.ok(f.stored.get(TOOL_CLEANUP_STORE)?.[ADBLOCK_ID],'extension reload cannot finish native cleanup');
  f.setPermission(true);
  // Simulate a fresh extension load with the capability present, without forging
  // the fence or using this mock as evidence of a real Chrome grant.
  for(const key of f.sessionChanges)f.sessionStored.delete(key);
  await retryUninstalledToolCleanup({api:f.api,lockManager:f.lockManager,id:ADBLOCK_ID});
  assert.deepEqual(f.rules.map(rule=>rule.id),[FOCUS_RULE_FIRST]);
  assert.equal(f.stored.has(ADBLOCK_STORE),false);
  assert.equal(f.stored.has(ADBLOCK_DNR_CLEANUP_STORE),false);
  assert.equal(f.stored.get(TOOL_CLEANUP_STORE)?.[ADBLOCK_ID],undefined);
});
test('installer cannot submit cleanup into the first-grant uninitialized queue',async()=>{
  const f=await fixture({permission:false});await f.service.tick();
  f.setPermission(true);
  await assert.rejects(stopAdblockForTool(f.api,ADBLOCK_ID),{code:'E_OUTCOME_UNKNOWN'});
  assert.equal(f.actions.length,0);
});
test('never-granted AdBlock can uninstall, but uncertain session state cannot erase recovery',async()=>{
  const f=await fixture({permission:false});await f.service.tick();
  await recordToolUninstall(f.api,f.tool);f.stored.set(SIDEBAR_TOOL_STORE,[]);
  await retryUninstalledToolCleanup({api:f.api,lockManager:f.lockManager,id:ADBLOCK_ID});
  assert.equal(f.stored.get(TOOL_CLEANUP_STORE)?.[ADBLOCK_ID],undefined);
  for(const failure of ['missing','read']){
    const bad=await fixture({permission:false,sessionFailure:failure});
    await assert.rejects(stopAdblockForTool(bad.api,ADBLOCK_ID),{code:'E_OUTCOME_UNKNOWN'});
    assert.equal(bad.actions.length,0);
  }
});
test('corrupt or unacknowledged cleanup uncertainty cannot be reported as clean',async()=>{
  const f=await fixture({permission:false});await f.service.tick();
  f.stored.set(ADBLOCK_DNR_CLEANUP_STORE,{pending:false});
  await assert.rejects(stopAdblockForTool(f.api,ADBLOCK_ID),{code:'E_OUTCOME_UNKNOWN'});
  f.stored.delete(ADBLOCK_DNR_CLEANUP_STORE);
  f.setPermission(true);for(const key of f.sessionChanges)f.sessionStored.delete(key);
  await f.service.dispatch(f.message('adblock.enable'),sender);f.setPermission(false);
  const set=f.api.storage.local.set;
  f.api.storage.local.set=async values=>{
    if(Object.hasOwn(values,ADBLOCK_DNR_CLEANUP_STORE))return;
    await set(values);
  };
  await assert.rejects(stopAdblockForTool(f.api,ADBLOCK_ID),{code:'E_OUTCOME_UNKNOWN'});
  assert.ok(f.rules.some(rule=>rule.id===ADBLOCK_RULE_FIRST));
});
test('durable cleanup uncertainty prevents a new worker from resuming the old enabled intent',async()=>{
  const f=await fixture();await f.service.dispatch(f.message('adblock.enable'),sender);
  f.setPermission(false);
  await assert.rejects(stopAdblockForTool(f.api,ADBLOCK_ID),{code:'E_OUTCOME_UNKNOWN'});
  assert.equal(f.stored.get(ADBLOCK_STORE).enabled,true,'simulate interruption before intent reconciliation');
  f.setPermission(true);
  assert.equal((await f.restartService().tick()).enabled,false);
  assert.equal(f.stored.get(ADBLOCK_STORE).enabled,false);
  assert.deepEqual(f.rules.map(rule=>rule.id),[FOCUS_RULE_FIRST]);
  assert.equal(f.stored.get(ADBLOCK_DNR_CLEANUP_STORE),false);
});
test('trusted Host supplies its native window outside the sandbox payload',async()=>{
  const f=await fixture(),contexts=f.api.runtime.getContexts,sent=[];
  f.api.runtime.getContexts=async()=>
    (await contexts()).map(row=>({...row,windowId:-1,tabId:-1}));
  f.api.runtime.sendMessage=async message=>{
    sent.push(message);return {ok:true,data:await f.service.dispatch(message,sender)};
  };
  const result=await requestAdblockOperation({api:f.api,tool:f.tool,
    operation:'adblock.status',revocationEpoch:'epoch-1',assertCurrent:()=>{}});
  assert.equal(result.currentHost,'news.example.com');
  assert.equal(sent.length,1);assert.equal(sent[0].hostWindowId,10);
  assert.deepEqual(sent[0].payload,{});
  await assert.rejects(requestAdblockOperation({api:f.api,tool:f.tool,
    operation:'adblock.status',payload:{hostWindowId:20},revocationEpoch:'epoch-1'}),{
    code:'E_ADBLOCK_REQUEST'});
  assert.equal(sent.length,1,'sandbox window claims must not reach the service');
});

test('trusted Host rejects unavailable or incognito native windows before sending',async()=>{
  for(const window of [{id:-1,incognito:false},{id:10,incognito:true},null]){
    const f=await fixture();
    f.api.windows.getCurrent=async()=>window;
    f.api.runtime.sendMessage=async()=>{assert.fail('invalid Host window must not send');};
    await assert.rejects(requestAdblockOperation({api:f.api,tool:f.tool,
      operation:'adblock.status',revocationEpoch:'epoch-1'}),{code:'E_ADBLOCK_SENDER'});
  }
  const f=await fixture();
  f.api.windows.getCurrent=async()=>{throw Error('window unavailable');};
  f.api.runtime.sendMessage=async()=>{assert.fail('failed native window read must not send');};
  await assert.rejects(requestAdblockOperation({api:f.api,tool:f.tool,
    operation:'adblock.status',revocationEpoch:'epoch-1'}),{code:'E_ADBLOCK_SENDER'});
});

test('Host window drift after an acknowledged write is unknown and never replayed',async()=>{
  const f=await fixture();
  let sends=0;
  f.api.runtime.sendMessage=async message=>{
    sends++;const data=await f.service.dispatch(message,sender);
    f.api.windows.getCurrent=async()=>({id:20,incognito:false});
    return {ok:true,data};
  };
  await assert.rejects(runTrustedAdblockOperation({api:f.api,tool:f.tool,
    operation:'adblock.enable',event:{isTrusted:true},revocationEpoch:'epoch-1'}),{
    code:'E_OUTCOME_UNKNOWN'});
  assert.equal(sends,1);assert.equal(f.actions.length,1);
  assert.equal(f.stored.get(ADBLOCK_STORE).enabled,true);
});

test('React sandbox proposes operations but cannot mutate DNR without host confirmation',async()=>{
  const f=await fixture();
  f.api.runtime.sendMessage=async message=>({ok:true,data:await f.service.dispatch(message,sender)});
  const input={api:f.api,tool:f.tool,operation:'adblock.enable',payload:{},
    revocationEpoch:'epoch-1',assertCurrent:()=>{}};
  let review=null;
  const pending=requestAdblockOperation({...input,requestBrowserClick:async args=>{
    review=args;return args.run({isTrusted:false});
  }});
  await assert.rejects(pending,{code:'E_ADBLOCK_TRUSTED_CLICK'});
  assert.equal(review.toolId,ADBLOCK_ID);
  assert.deepEqual(f.rules.map(rule=>rule.id),[FOCUS_RULE_FIRST],
    'sandbox request must not reach native DNR before a trusted click');
  const result=await requestAdblockOperation({...input,
    requestBrowserClick:args=>args.run({isTrusted:true})});
  assert.equal(result.enabled,true);assert.equal(result.rules.verified,true);
  assert.deepEqual(f.rules.map(rule=>rule.id),[FOCUS_RULE_FIRST,ADBLOCK_RULE_FIRST,ADBLOCK_RULE_LAST]);
  await assert.rejects(runTrustedAdblockOperation({...input,
    operation:'adblock.site.set',payload:{host:'news.example.com',filtering:false},
    event:{isTrusted:false}}),{code:'E_ADBLOCK_TRUSTED_CLICK'});
});
test('trusted AdBlock approval expires when the active website changes',async()=>{
  const f=await fixture();
  f.api.runtime.sendMessage=async message=>({ok:true,data:await f.service.dispatch(message,sender)});
  await f.service.dispatch(f.message('adblock.enable'),sender);
  const before=f.actions.length;
  await assert.rejects(requestAdblockOperation({
    api:f.api,tool:f.tool,operation:'adblock.site.set',
    payload:{host:'news.example.com',filtering:false},
    revocationEpoch:'epoch-1',assertCurrent:()=>{},
    requestBrowserClick:args=>{
      f.setCurrent('https://other.example/article');
      return args.run({isTrusted:true});
    }
  }),{code:'E_ADBLOCK_STATE_CHANGED'});
  assert.deepEqual(f.stored.get(ADBLOCK_STORE).exceptions,[]);
  assert.equal(f.actions.length,before,'stale approval must not mutate DNR');
});
test.skip('R1.1 legacy fixed native view (superseded by installable React UI)',async()=>{
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
      permissions:{dnr:true},rules:{verified:true}};
  };
  const controls=createAdblockPermissionControls({api:{permissions:{request(){
    requests++;return Promise.resolve(true);
  }}},doc,container,notice:()=>{},runOperation});
  controls.render(tool,false,false);
  // Identify the two independent product controls by their accessible contracts,
  // never by a DOM child offset shared with the three-page product layout.
  const walk=node=>[node,...node.children.flatMap(walk)];
  const switches=walk(container).filter(node=>node.attributes.role==='switch');
  assert.equal(switches.length,2,'global and current-site switches must both exist');
  const global=switches.find(node=>node.attributes['aria-label']==='全局广告拦截');
  const site=switches.find(node=>node.attributes['aria-label']==='当前网站不可用');
  assert.ok(global,'global protection switch must have stable accessible identity');
  assert.ok(site,'site switch must remain separate from global protection');
  assert.notEqual(global,site);
  assert.equal(container.hidden,false);
  assert.equal(global.disabled,true);
  global.listeners.click({isTrusted:true});assert.equal(requests,0);
  controls.render(tool,false,true);
  await new Promise(done=>setImmediate(done));
  assert.equal(global.disabled,false,'active global switch is actionable after status read');
  assert.equal(site.disabled,true,'site switch is disabled while global protection is off');
  assert.equal(site.attributes['aria-label'],'网站 news.example.com 的广告过滤');
  global.listeners.click({isTrusted:false});assert.equal(requests,0);
  global.listeners.click({isTrusted:true});
  assert.equal(requests,0,'required DNR must not enter an optional permission request');
  await new Promise(done=>setImmediate(done));
  assert.ok(changes.includes('adblock.enable'));
  assert.equal(global.attributes['aria-checked'],'true');
  assert.equal(site.attributes['aria-checked'],'true');
});

test('confirmation pins the first Host window even when both windows show the same site',async()=>{
  for(const phase of ['confirmation','final-send','before-mutation']){
    const f=await fixture();let windowId=10,mutations=0,statuses=0,windowReads=0;
    f.api.windows.getCurrent=async()=>{
      if(++windowReads===5&&phase==='before-mutation')windowId=20;
      return {id:windowId,incognito:false};
    };
    f.api.runtime.sendMessage=async message=>{
      if(message.operation!=='adblock.status')mutations++;
      const data=await f.service.dispatch(message,sender);
      if(message.operation==='adblock.status'&&++statuses===2&&phase==='final-send')
        windowId=20;
      return {ok:true,data};
    };
    await assert.rejects(requestAdblockOperation({api:f.api,tool:f.tool,
      operation:'adblock.enable',revocationEpoch:'epoch-1',
      requestBrowserClick:args=>{
        if(phase==='confirmation')windowId=20;
        return args.run({isTrusted:true});
      }}),{code:phase==='final-send'?'E_OUTCOME_UNKNOWN':'E_ADBLOCK_SENDER'});
    assert.equal(mutations,0);assert.equal(f.actions.length,0);
  }
});

test('lost or malformed mutation replies are unknown with exactly one send and write',async()=>{
  for(const reply of ['reject',undefined,null,{}, {ok:true}, {ok:'yes',data:{}},
    {ok:false}, {ok:true,data:{}}, {ok:true,data:[]}, {ok:true,data:null}]){
    const f=await fixture();let sends=0;
    f.api.runtime.sendMessage=async message=>{
      sends++;await f.service.dispatch(message,sender);
      if(reply==='reject')throw Error('reply channel closed');
      return reply;
    };
    await assert.rejects(runTrustedAdblockOperation({api:f.api,tool:f.tool,
      operation:'adblock.enable',event:{isTrusted:true},revocationEpoch:'epoch-1'}),{
      code:'E_OUTCOME_UNKNOWN'});
    assert.equal(sends,1);assert.equal(f.actions.length,1);
    assert.equal(f.stored.get(ADBLOCK_STORE).enabled,true);
  }
});

test('an explicit service refusal preserves its error without replay',async()=>{
  const f=await fixture();let sends=0;
  f.api.runtime.sendMessage=async()=>{
    sends++;return {ok:false,error:{code:'E_TOOL_CHANGED',message:'revoked'}};
  };
  await assert.rejects(runTrustedAdblockOperation({api:f.api,tool:f.tool,
    operation:'adblock.enable',event:{isTrusted:true},revocationEpoch:'epoch-1'}),{
    code:'E_TOOL_CHANGED'});
  assert.equal(sends,1);assert.equal(f.actions.length,0);
});

test('site.set rechecks navigation after its initial site read before policy persistence',async()=>{
  for(const target of ['https://other.example/article','chrome://extensions/']){
    const f=await fixture();await f.service.dispatch(f.message('adblock.enable'),sender);
    const beforeActions=f.actions.length,beforeChanges=f.changes.length;
    const query=f.api.tabs.query;let reads=0;
    f.api.tabs.query=async args=>{
      const tabs=await query(args);
      if(++reads===1)f.setCurrent(target);
      return tabs;
    };
    await assert.rejects(f.service.dispatch(f.message('adblock.site.set',{
      host:'news.example.com',filtering:false}),sender),{code:'E_ADBLOCK_SITE_CHANGED'});
    assert.equal(reads,2);assert.equal(f.changes.length,beforeChanges);
    assert.equal(f.actions.length,beforeActions);
    assert.deepEqual(f.stored.get(ADBLOCK_STORE).exceptions,[]);
  }
});

test('user-picked region survives worker restart and site disable; undo removes the durable rule',async()=>{
  const f=await fixture();
  const url='https://news.example.com/story';
  f.setCurrent(url);
  const tab={id:1,windowId:10,url,active:true,incognito:false};
  f.api.tabs.get=async()=>({...tab});
  f.api.webNavigation={getFrame:async()=>({url,documentId:'page-doc',documentLifecycle:'active'})};
  f.api.tabs.sendMessage=async(id,msg,options)=>{
    assert.equal(id,tab.id);assert.deepEqual(options,{frameId:0,documentId:'page-doc'});
    assert.equal(msg.protocol,ADBLOCK_PAGE_PROTOCOL);assert.equal(msg.type,'start-pick');
    assert.equal(msg.host,'news.example.com');
    return {ok:true,host:msg.host};
  };
  const page={id:senderId,url,frameId:0,documentId:'page-doc',
    documentLifecycle:'active',tab};
  const status=()=>f.service.pagePolicy({protocol:ADBLOCK_PAGE_PROTOCOL},page);
  await f.service.dispatch(f.message('adblock.enable'),sender);
  const started=await f.service.dispatch(f.message('adblock.cosmetic.pick'),sender);
  assert.equal(started.pickerActive,true);
  const selected=await f.service.pagePolicy({protocol:ADBLOCK_PAGE_PROTOCOL,
    type:'hide',selector:'#native-promo'},page);
  assert.equal(selected.saved,true);
  assert.deepEqual((await status()).rules,[{selector:'#native-promo'}]);
  // A fresh SW instance reads the exact same Chrome local storage record.
  const reloaded=f.restartService();
  assert.deepEqual((await reloaded.pagePolicy({protocol:ADBLOCK_PAGE_PROTOCOL},page)).rules,
    [{selector:'#native-promo'}]);
  await f.service.dispatch(f.message('adblock.site.set',
    {host:'news.example.com',filtering:false}),sender);
  assert.equal((await status()).enabled,false);
  await f.service.dispatch(f.message('adblock.site.restore',{host:'news.example.com'}),sender);
  assert.deepEqual((await status()).rules,[{selector:'#native-promo'}]);
  // The website's Undo control is a delete operation, not a temporary CSS show.
  const undone=await f.service.pagePolicy({protocol:ADBLOCK_PAGE_PROTOCOL,
    type:'undo',selector:'#native-promo'},page);
  assert.equal(undone.restored,true);
  assert.equal((await status()).rules,undefined);
  await assert.rejects(f.service.pagePolicy({protocol:ADBLOCK_PAGE_PROTOCOL,
    type:'undo',selector:'#native-promo'},page),{code:'E_ADBLOCK_COSMETIC_CHANGED'});
});

test('switching Chrome tabs revokes an uncommitted gesture-bound picker session',async()=>{
  const f=await fixture(),url='https://news.example.com/story';
  f.setCurrent(url);
  const tab={id:1,windowId:10,url,active:true,incognito:false};
  f.api.tabs.get=async()=>({...tab});
  f.api.webNavigation={getFrame:async()=>({url,documentId:'page-doc',documentLifecycle:'active'})};
  const sent=[];
  f.api.tabs.sendMessage=async(id,msg,options)=>{
    sent.push({id,msg,options});
    if(msg.type==='start-pick')return {ok:true,host:msg.host};
    return undefined;
  };
  const page={id:senderId,url,frameId:0,documentId:'page-doc',
    documentLifecycle:'active',tab};
  await f.service.dispatch(f.message('adblock.enable'),sender);
  const started=await f.service.dispatch(f.message('adblock.cosmetic.pick'),sender);
  assert.equal(started.pickerActive,true);
  assert.deepEqual(sent[0].options,{frameId:0,documentId:'page-doc'});
  f.service.cancelPicksOnTabActivated({tabId:2,windowId:10});
  assert.equal(sent.at(-1).msg.type,'cancel-pick');
  assert.deepEqual(sent.at(-1).options,{documentId:'page-doc'});
  await assert.rejects(f.service.pagePolicy({protocol:ADBLOCK_PAGE_PROTOCOL,
    type:'hide',selector:'#native-promo'},page),{code:'E_ADBLOCK_COSMETIC_SESSION'});
  assert.equal(f.stored.has('opendesk.adblock.cosmetic.v1'),false);
});

test('top-level navigations and tab removal revoke old gesture-bound picks',async()=>{
  for(const action of ['navigation','history','tab-removed']){
    const f=await fixture(),url='https://news.example.com/story';
    f.setCurrent(url);
    const tab={id:1,windowId:10,url,active:true,incognito:false};
    f.api.tabs.get=async()=>({...tab});
    f.api.webNavigation={getFrame:async()=>({url,documentId:'page-doc',documentLifecycle:'active'})};
    const sent=[];
    f.api.tabs.sendMessage=async(id,msg,options)=>{
      sent.push({id,msg,options});
      return msg.type==='start-pick'?{ok:true,host:msg.host}:undefined;
    };
    const page={id:senderId,url,frameId:0,documentId:'page-doc',
      documentLifecycle:'active',tab};
    await f.service.dispatch(f.message('adblock.enable'),sender);
    assert.equal((await f.service.dispatch(f.message('adblock.cosmetic.pick'),sender)).pickerActive,true);
    if(action==='tab-removed')f.service.cancelPickOnTabRemoved(1);
    else{
      f.service.cancelPickOnNavigation({tabId:1,frameId:2});
      assert.equal(sent.length,1,'a subframe cannot cancel a top-level selection');
      f.service.cancelPickOnNavigation({tabId:1,frameId:0});
      assert.equal(sent.at(-1).msg.type,'cancel-pick');
    }
    await assert.rejects(f.service.pagePolicy({protocol:ADBLOCK_PAGE_PROTOCOL,
      type:'hide',selector:'#native-promo'},page),{code:'E_ADBLOCK_COSMETIC_SESSION'});
    assert.equal(f.stored.has('opendesk.adblock.cosmetic.v1'),false);
  }
});

test('failed document recheck after picker activation invalidates the picker',async()=>{
  const f=await fixture(),url='https://news.example.com/story';
  f.setCurrent(url);
  const tab={id:1,windowId:10,url,active:true,incognito:false};
  f.api.tabs.get=async()=>({...tab});
  let frames=0;
  f.api.webNavigation={getFrame:async()=>{
    if(++frames>1)throw Error('navigation replaced document');
    return {url,documentId:'page-doc',documentLifecycle:'active'};
  }};
  const sent=[];
  f.api.tabs.sendMessage=async(id,msg)=>{
    sent.push(msg.type);
    return msg.type==='start-pick'?{ok:true,host:msg.host}:undefined;
  };
  await f.service.dispatch(f.message('adblock.enable'),sender);
  await assert.rejects(f.service.dispatch(f.message('adblock.cosmetic.pick'),sender),
    {code:'E_ADBLOCK_COSMETIC_SESSION'});
  assert.deepEqual(sent,['start-pick','cancel-pick']);
});
