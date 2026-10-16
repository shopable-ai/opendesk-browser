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
import {createAdblockService,installAdblockService} from '../../examples/sidebar-tools/adblock/trusted/service.js';
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
        documentId:'live-doc',frameId:0,incognito:false}]},
    storage:{local:storage,session:sessionFailure==='missing'?undefined:sessionStorage,
      onChanged:storageChanged},
    permissions:{async contains(){return permission;},onRemoved:permissionRemoved,onAdded:permissionAdded},
    tabs:{async query(){return [{id:1,url:current,active:true,incognito:false}];}},
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
  await assert.rejects(f.service.dispatch(f.message('adblock.enable'),sender),{
    code:'E_ADBLOCK_RESTART_REQUIRED'});
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
  if(actual)assert.deepEqual(actual,expected,'formal package must match deterministic builder bytes');
  await assert.rejects(access('src/sidebar-tools/adblock.opendesk-tool.json'),{code:'ENOENT'});
});
test('build-ready official project, current version, one declared restricted capability',async()=>{
  const pkg=await createSidebarToolPackage(PROJECT);
  assert.equal(pkg.version,'1.1.0');
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
        documentId:'live-doc',frameId:0,incognito:false}]:[];
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
  assert.equal(requests,1,'native Chrome permission request must begin synchronously');
  await new Promise(done=>setImmediate(done));
  assert.ok(changes.includes('adblock.enable'));
  assert.equal(global.attributes['aria-checked'],'true');
  assert.equal(site.attributes['aria-checked'],'true');
});
