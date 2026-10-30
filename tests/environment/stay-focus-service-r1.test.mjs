import test from 'node:test';
import assert from 'node:assert/strict';
import {createStayFocusService,installStayFocusService} from '../../projects/stay-focus/trusted/service.js';
import {stopStayFocusForTool,cleanupUninstalledStayFocus} from '../../projects/stay-focus/trusted/lifecycle.js';
import {FOCUS_PROTOCOL,FOCUS_STORE,FOCUS_PAGE_NOTICE_PROTOCOL,FOCUS_PROBE_OPERATION,FOCUS_SERVICE_VERSION,focusPackageHash} from '../../projects/stay-focus/trusted/policy.js';
import {SIDEBAR_TOOL_STORE} from '../../src/ui/sidebar-tools/package.js';
import {SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE} from '../../src/ui/sidebar-tools/lifecycle.js';

const buildTool=()=>({format:'opendesk.sidebar-tool.v1',id:'stay-focus',version:'1.0.0',
  title:'Stay Focus',description:'Unit-tested independent tool',capabilities:['focus.control'],
  html:'<main>Stay Focus</main>',css:'.root{color:#333}',js:'(() => {})();'});
const mkSite=(host,mode='limit',minutes=1)=>({host,subdomains:true,enabled:true,mode,minutes,group:''});
const at=new Date(2026,9,13,10,0,0).getTime();
function fixture(){
  const tool=buildTool(),docId='document-123';
  const host='chrome-extension://abcdefghijklmnopabcdefghijklmnop/sidepanel.html?hostInstanceId=123e4567-e89b-42d3-a456-426614174000';
  const sender={id:'abcdefghijklmnopabcdefghijklmnop',url:host,frameId:0,documentId:docId,documentLifecycle:'active'};
  const stored=new Map([[SIDEBAR_TOOL_STORE,[tool]],[SIDEBAR_TOOL_ENABLE_STORE,{}],
    [TOOL_REVOCATION_EPOCHS_STORE,{['stay-focus']:'epoch-1'}]]);
  const session=new Map(),alarms=new Map();
  let clock=at,allowed=true,dnrAllowed=true,ruleReads=0,idle='active',focused=true,tabUrl='https://example.com/watch';
  const rules=[],tabUpdates=[],nativeOps=[],pageMessages=[],permissionRemovals=[];
  const chromeStorage=map=>({
    async get(arg){const keys=Array.isArray(arg)?arg:arg===null?[...map.keys()]:[arg];
      return Object.fromEntries(keys.filter(key=>map.has(key)).map(key=>[key,structuredClone(map.get(key))]));},
    async set(values){for(const [key,value] of Object.entries(values))map.set(key,structuredClone(value));},
    async remove(keys){for(const key of Array.isArray(keys)?keys:[keys])map.delete(key);}
  });
  const api={
    runtime:{id:sender.id,getURL:path=>'chrome-extension://'+sender.id+'/'+path,
      getContexts:async()=>[{contextType:'SIDE_PANEL',documentUrl:host,documentId:docId,
        frameId:0,incognito:false}]},
    storage:{local:chromeStorage(stored),session:chromeStorage(session)},
    permissions:{contains:async({permissions,origins})=>
      Boolean(origins?.length)||Boolean(permissions?.length)&&permissions.every(name=>
        name==='declarativeNetRequestWithHostAccess'?dnrAllowed:name==='idle'&&allowed),
      remove:async options=>{permissionRemovals.push(options);return true;}},
    idle:{queryState:async()=>idle},
    windows:{getLastFocused:async()=>({id:1,focused,type:'normal',incognito:false})},
    tabs:{query:async filter=>filter?.active===true?[{id:42,windowId:1,url:tabUrl,incognito:false}]:
      [{id:42,windowId:1,url:tabUrl,incognito:false}],
      get:async id=>({id,windowId:1,active:true,url:tabUrl,incognito:false}),
      sendMessage:async(id,message,options)=>{pageMessages.push({id,message,options});return {displayed:true};},
      update:async(id,options)=>{tabUpdates.push({id,...options});tabUrl=options.url;return {id,url:tabUrl};}},
    alarms:{get:async name=>alarms.get(name),create:async(name,options)=>{alarms.set(name,options);},
      clear:async name=>{alarms.delete(name);return true;}},
    declarativeNetRequest:{getDynamicRules:async()=>{ruleReads++;return structuredClone(rules);},
      updateDynamicRules:async({addRules=[],removeRuleIds=[]})=>{
        nativeOps.push({addRules:structuredClone(addRules),removeRuleIds:[...removeRuleIds]});
        for(const id of removeRuleIds){const index=rules.findIndex(rule=>rule.id===id);if(index>=0)rules.splice(index,1);}
        rules.push(...structuredClone(addRules));
      }}
  };
  const lockManager={request:async(_name,work)=>work()};
  const focus=createStayFocusService({api,lockManager,now:()=>clock});
  const msg=async(operation,payload={})=>({protocol:FOCUS_PROTOCOL,toolId:'stay-focus',operation,payload,
    packageHash:await focusPackageHash(tool),installEpoch:'epoch-1'});
  return {tool,sender,stored,session,alarms,rules,tabUpdates,nativeOps,pageMessages,permissionRemovals,api,focus,msg,
    get clock(){return clock;},setTime:value=>{clock=value;},
    get ruleReads(){return ruleReads;},
    setAllowed:value=>{allowed=value;},setDnrAllowed:value=>{dnrAllowed=value;},setIdle:value=>{idle=value;},
    setFocused:value=>{focused=value;},
    setUrl:value=>{tabUrl=value;},get url(){return tabUrl;}};
}
for(const contextType of ['SIDE_PANEL','TAB']){
  test('live Time Review '+contextType+' may probe Focus but cannot mutate it',async()=>{
    const f=fixture(),url=f.sender.url+'&toolId=time-review';
    const manager={...f.sender,url,...(contextType==='TAB'?{tab:{id:31,incognito:false}}:{})};
    const context=documentId=>({contextType,documentUrl:url,documentId,frameId:0,
      incognito:false,...(contextType==='TAB'?{tabId:31}:{})});
    f.api.runtime.getContexts=async()=>[context(manager.documentId)];
    const probe={protocol:FOCUS_PROTOCOL,toolId:'stay-focus',
      operation:FOCUS_PROBE_OPERATION,payload:{}};
    const before=structuredClone([...f.stored]),calls=f.nativeOps.length;
    assert.equal((await f.focus.probe(probe,manager)).serviceReady,true);
    assert.deepEqual([...f.stored],before,'probe must not install or change data');
    assert.equal(f.nativeOps.length,calls,'probe must not write Chrome DNR');
    await assert.rejects(f.focus.dispatch(await f.msg('focus.status'),manager),
      {code:'E_FOCUS_SENDER'},'peer manager cannot invoke Focus operations');
    await assert.rejects(f.focus.probe(probe,{...manager,url:url+'&extra=1'}),
      {code:'E_FOCUS_SENDER'});
    await assert.rejects(f.focus.probe(probe,{...manager,id:'untrusted-extension'}),
      {code:'E_FOCUS_SENDER'});
    f.api.runtime.getContexts=async()=>[context('retired-document')];
    await assert.rejects(f.focus.probe(probe,manager),{code:'E_FOCUS_SENDER'});
  });
}

test('trusted sender and exact package hash/epoch are mandatory for all mutations',async()=>{
  const f=fixture(),request=await f.msg('focus.site.put',{site:mkSite('example.com')});
  await assert.rejects(f.focus.dispatch(request,{...f.sender,id:'fake-page'}),e=>e.code==='E_FOCUS_SENDER');
  await assert.rejects(f.focus.dispatch(request,{...f.sender,url:'https://example.com'}),
    e=>e.code==='E_FOCUS_SENDER');
  await assert.rejects(f.focus.dispatch({...request,packageHash:'f'.repeat(64)},f.sender),
    e=>e.code==='E_TOOL_CHANGED');
  await assert.rejects(f.focus.dispatch({...request,installEpoch:'retired'},f.sender),
    e=>e.code==='E_TOOL_CHANGED');
  assert.equal(f.stored.has(FOCUS_STORE),false);
  const saved=await f.focus.dispatch(request,f.sender);
  assert.equal(saved.sites[0].host,'example.com');
  assert.equal(f.rules.length,0,'site editing without enable cannot install DNR rules');
});
test('required DNR and optional idle availability do not enable Stay Focus',async()=>{
  const f=fixture();
  await f.focus.dispatch(await f.msg('focus.site.put',{site:mkSite('example.com','always')}),f.sender);
  const state=await f.focus.tick({boot:true});
  assert.deepEqual(state.permissions,{idle:true,dnr:true,ready:true});
  assert.equal(state.enabled,false);
  assert.equal(state.ruleReceipt.verified,true);
  assert.equal(f.rules.length,0);
  assert.equal(f.alarms.size,0);
  f.setAllowed(false);
  await assert.rejects(f.focus.dispatch(await f.msg('focus.enable'),f.sender),error=>
    error.code==='E_FOCUS_PERMISSION'&&/空闲检测/.test(error.message)&&!/DNR/.test(error.message));
  f.setAllowed(true);f.setDnrAllowed(false);
  await assert.rejects(f.focus.dispatch(await f.msg('focus.enable'),f.sender),error=>
    error.code==='E_FOCUS_PERMISSION'&&/必需.*DNR/.test(error.message));
  assert.equal(f.stored.get(FOCUS_STORE).enabled,false);
  assert.equal(f.rules.length,0);
});
for(const operation of ['focus.disable','focus.clear','tool.disable','tool.uninstall']){
  for(const persistRemoval of [true,false])test(operation+' verifies owned cleanup with shared DNR; persisted='+persistRemoval,async()=>{
    const f=fixture(),foreign={id:741000,priority:1,action:{type:'block'},condition:{urlFilter:'ads.example'}};
    await f.focus.dispatch(await f.msg('focus.site.put',{site:mkSite('example.com','always')}),f.sender);
    await f.focus.dispatch(await f.msg('focus.enable'),f.sender);
    f.rules.push(foreign);
    const beforeReads=f.ruleReads,beforeWrites=f.nativeOps.length;
    if(!persistRemoval)f.api.declarativeNetRequest.updateDynamicRules=async options=>{f.nativeOps.push(options);};
    const removed=[];
    const run=async()=>{
      if(operation==='tool.disable')return stopStayFocusForTool(f.api,'stay-focus');
      if(operation==='tool.uninstall')return cleanupUninstalledStayFocus(f.api,'stay-focus',async(api,key)=>{
        removed.push(key);await api.storage.local.remove(key);
      },async key=>{
        await f.api.storage.session.remove(key);
        assert.equal((await f.api.storage.session.get(key))[key],undefined);
      });
      return f.focus.dispatch(await f.msg(operation,operation==='focus.clear'?{confirm:true}:{}),f.sender);
    };
    if(persistRemoval){
      const result=await run();
      assert.deepEqual(f.rules,[foreign],'AdBlock rules must survive Focus cleanup');
      if(operation.startsWith('focus.')){
        assert.equal(result.enabled,false);
        assert.deepEqual(result.ruleReceipt,{changed:true,ruleIds:[],verified:true});
        await f.focus.tick({boot:true});
        assert.deepEqual(f.rules,[foreign],'required DNR cannot restart stopped Focus');
      }
      assert.deepEqual(removed,operation==='tool.uninstall'?[FOCUS_STORE]:[]);
    }else{
      await assert.rejects(run(),{code:'E_FOCUS_DNR_MISMATCH'});
      assert.equal(f.rules.length,2,'failed deletion remains visible for retry');
      assert.deepEqual(removed,[],'uninstall must preserve policy until rules are confirmed absent');
      assert.equal(f.stored.has(FOCUS_STORE),true);
    }
    assert.ok(f.ruleReads>=beforeReads+2,'cleanup reads native rules before and after deletion');
    assert.deepEqual(f.nativeOps[beforeWrites].removeRuleIds,[730000]);
    assert.deepEqual(f.nativeOps[beforeWrites].addRules,[]);
    assert.deepEqual(f.permissionRemovals,[],'Focus cleanup must never remove shared Chrome permission');
    assert.equal(await f.api.permissions.contains({permissions:['declarativeNetRequestWithHostAccess']}),true);
  });
}
test('R5.9 global stop keeps signed authority, stored policy and shared Chrome permission',async()=>{
  const f=fixture();
  await f.focus.dispatch(await f.msg('focus.site.put',{site:mkSite('example.com','always')}),f.sender);
  const running=await f.focus.dispatch(await f.msg('focus.enable'),f.sender);
  assert.equal(running.enabled,true);
  const signed=f.stored.get(FOCUS_STORE).authorizedHash;
  assert.match(signed,/^[a-f0-9]{64}$/);
  const stopped=await f.focus.dispatch(await f.msg('focus.disable'),f.sender);
  assert.equal(stopped.enabled,false);
  assert.equal(stopped.authorized,true);
  assert.equal(stopped.ruleReceipt.verified,true);
  assert.equal(f.stored.get(FOCUS_STORE).authorizedHash,signed);
  assert.equal(f.stored.get(FOCUS_STORE).sites.length,1);
  assert.equal(f.rules.length,0);
  const reopened=await f.focus.tick({boot:true});
  assert.equal(reopened.enabled,false);
  assert.equal(reopened.authorized,true,'Chrome restart never silently restarts a voluntary stop');
  const resumed=await f.focus.dispatch(await f.msg('focus.enable'),f.sender);
  assert.equal(resumed.enabled,true);
  assert.equal(resumed.ruleReceipt.verified,true);
  f.setAllowed(false);
  const revoked=await f.focus.tick({boot:true});
  assert.equal(revoked.enabled,false);
  assert.equal(revoked.authorized,false,'actual Chrome permission revocation retires tool authority');
  assert.equal(revoked.sites.length,1,'revocation never discards website preferences');
  assert.equal(f.rules.length,0);
  assert.deepEqual(f.permissionRemovals,[],'Focus never revokes shared Chrome permissions');
});
test('quota spends foreground Chrome time; real rule readback and existing tab remediation are recorded',async()=>{
  const f=fixture();
  await f.focus.dispatch(await f.msg('focus.site.put',{site:mkSite('example.com')}),f.sender);
  assert.equal((await f.focus.dispatch(await f.msg('focus.enable'),f.sender)).enabled,true);
  assert.equal(f.rules.length,0,'one-minute limit has not been used yet');
  await f.focus.tick();
  f.setTime(at+30000);await f.focus.tick();
  assert.equal((await f.api.storage.local.get(FOCUS_STORE))[FOCUS_STORE].usage['s:example.com'],30000);
  f.setTime(at+60000);await f.focus.tick();
  assert.equal(f.rules.length,1,'exact quota enforces dynamic Chrome rule at observed threshold');
  assert.equal(f.rules[0].action.redirect.extensionPath,'/stay-focus/blocked-quota.html');
  assert.equal(f.tabUpdates.length,1,'already-open tab is redirected to extension-owned block page');
  assert.match(f.tabUpdates[0].url,/^chrome-extension:\/\/.+\/stay-focus\/blocked-quota\.html$/);
  const response=await f.focus.dispatch(await f.msg('focus.status'),f.sender);
  assert.equal(response.sites[0].remainingMs,0);
  assert.equal(response.ruleReceipt.verified,true);
  assert.equal(f.nativeOps.length,1,'rule reconciliation does not rewrite an unchanged DNR set');
});
test('queued blur/tab events invalidate stale checkpoints even after focus returns',async()=>{
  const f=fixture();
  await f.focus.dispatch(await f.msg('focus.site.put',{site:mkSite('example.com')}),f.sender);
  await f.focus.dispatch(await f.msg('focus.enable'),f.sender);
  await f.focus.tick(); // starts first observed interval
  f.setTime(at+30000);
  // A switch away and back to the same tab can be processed after the
  // original tab is active again. The old interval is no longer trustworthy.
  f.focus.invalidate();
  await f.focus.tick();
  let state=(await f.api.storage.local.get(FOCUS_STORE))[FOCUS_STORE];
  assert.equal(state.usage['s:example.com'],undefined,
    'event invalidation must not bill a stale foreground interval');
  f.setTime(at+60000);
  await f.focus.tick();
  state=(await f.api.storage.local.get(FOCUS_STORE))[FOCUS_STORE];
  assert.equal(state.usage['s:example.com'],30000,
    'the following uninterrupted foreground checkpoint is still billable');
  f.setTime(at+80000);
  f.setIdle('idle');f.focus.invalidate();
  await f.focus.tick();
  state=(await f.api.storage.local.get(FOCUS_STORE))[FOCUS_STORE];
  assert.equal(state.usage['s:example.com'],30000,
    'idle transition cannot charge the previous checkpoint');
  f.setTime(at+90000);
  f.setIdle('active');f.focus.invalidate();
  await f.focus.tick();
  f.setTime(at+110000);
  await f.focus.tick();
  state=(await f.api.storage.local.get(FOCUS_STORE))[FOCUS_STORE];
  assert.equal(state.usage['s:example.com'],50000,
    'billing must resume from a fresh active observation only');
});
test('removal, tool disable, permission revoke and uninstall reconcile only reserved DNR rule IDs',async()=>{
  const f=fixture();
  await f.focus.dispatch(await f.msg('focus.site.put',{site:mkSite('example.com','always')}),f.sender);
  await f.focus.dispatch(await f.msg('focus.enable'),f.sender);
  assert.equal(f.rules.length,1);
  f.setAllowed(false);f.focus.invalidate({revoke:true});const revoked=await f.focus.tick();
  assert.deepEqual(revoked.permissions,{idle:false,dnr:true,ready:false});
  assert.equal(f.rules.length,0,'idle revocation immediately clears owned rules while required DNR remains');
  assert.equal(revoked.ruleReceipt.verified,true);
  assert.equal((await f.api.storage.local.get(FOCUS_STORE))[FOCUS_STORE].enabled,false);
  f.setAllowed(true);await f.focus.tick();
  assert.equal(f.rules.length,0,'rules cleared on native regrant after revoked authority');
  await assert.rejects(f.focus.dispatch(await f.msg('focus.session.start',{minutes:25}),f.sender),
    e=>e.code==='E_FOCUS_NOT_ENABLED');
  await f.focus.dispatch(await f.msg('focus.enable'),f.sender);
  assert.equal(f.rules.length,1);
  f.stored.set(SIDEBAR_TOOL_ENABLE_STORE,{'stay-focus':false});
  f.focus.invalidate({revoke:true});await f.focus.tick({boot:true});
  assert.equal(f.rules.length,0,'disabled installed tool cannot retain its DNR restriction');
  f.stored.set(SIDEBAR_TOOL_STORE,[]);
  await f.focus.tick({boot:true});
  assert.equal(f.rules.length,0,'uninstalled tool stays unblocked');
  const other={id:32,priority:1,action:{type:'block'},condition:{urlFilter:'some-other-tool'}};
  f.rules.push(other);await f.focus.tick({boot:true});
  assert.deepEqual(f.rules,[other],'focus cleanup never deletes foreign extension rules');
});
test('unrelated Chrome site revocation never turns off Stay Focus or Time Review',async()=>{
  const f=fixture();
  await f.focus.dispatch(await f.msg('focus.site.put',{site:mkSite('example.com','always')}),f.sender);
  await f.focus.dispatch(await f.msg('focus.site.put',{site:mkSite('reddit.com','always')}),f.sender);
  await f.focus.dispatch(await f.msg('focus.enable'),f.sender);
  assert.equal(f.rules.length,2,'both authorized domains have Chrome rules');
  await f.focus.tick({removedOrigins:['https://unrelated.test/*']});
  let state=(await f.api.storage.local.get(FOCUS_STORE))[FOCUS_STORE];
  assert.equal(state.enabled,true,'removing unrelated site access cannot revoke all focus');
  assert.equal(state.sites.filter(row=>row.enabled).length,2);
  assert.equal(f.rules.length,2);
  await f.focus.tick({removedOrigins:['https://example.com/*']});
  state=(await f.api.storage.local.get(FOCUS_STORE))[FOCUS_STORE];
  assert.equal(state.enabled,true,'site scoped revocation preserves remaining focus');
  assert.equal(state.sites.find(x=>x.host==='example.com').enabled,false);
  assert.equal(state.sites.find(x=>x.host==='reddit.com').enabled,true);
  assert.equal(f.rules.length,1);
  assert.match(f.rules[0].condition.regexFilter,/reddit/);
  await f.focus.tick();
  state=(await f.api.storage.local.get(FOCUS_STORE))[FOCUS_STORE];
  assert.equal(state.sites.find(x=>x.host==='example.com').enabled,false,
    'Chrome host permission regrant must not silently reenable revoked restrictions');
});

test('trusted nested site pause retires its rule and cannot break a parent exclusion',async()=>{
  const f=fixture();
  const parent=mkSite('example.com','always'),child=mkSite('docs.example.com','always');
  await f.focus.dispatch(await f.msg('focus.site.put',{site:parent}),f.sender);
  await f.focus.dispatch(await f.msg('focus.site.put',{site:child}),f.sender);
  await f.focus.dispatch(await f.msg('focus.enable'),f.sender);
  assert.equal(f.rules.length,2,'parent and more specific child have separate active rules');
  assert.equal(f.rules.find(x=>x.condition.regexFilter.includes('example\\.com')&&
    !x.condition.regexFilter.includes('docs'))?.condition.excludedRequestDomains?.[0],
    'docs.example.com');
  await f.focus.dispatch(await f.msg('focus.site.put',{site:{...child,enabled:false}}),f.sender);
  assert.equal(f.rules.length,1,'paused child must remove its own DNR rule');
  assert.deepEqual(f.rules[0].condition.excludedRequestDomains,['docs.example.com'],
    'parent must not leak a restriction back onto a paused child');
  await assert.rejects(
    f.focus.dispatch(await f.msg('focus.site.put',{site:{...child,enabled:true,subdomains:false}}),f.sender),
    error=>error.code==='E_FOCUS_SCOPE_OVERLAP');
  const saved=(await f.api.storage.local.get(FOCUS_STORE))[FOCUS_STORE];
  assert.equal(saved.sites.find(s=>s.host==='docs.example.com').enabled,false,
    'failed overlapping edit must not change committed policy');
  assert.equal(f.rules.length,1);
});

test('DNR write failures reject mutations instead of reporting a false active block',async()=>{
  const f=fixture();
  await f.focus.dispatch(await f.msg('focus.site.put',{site:mkSite('example.com','always')}),f.sender);
  f.api.declarativeNetRequest.updateDynamicRules=async()=>{throw Error('native write failed');};
  await assert.rejects(f.focus.dispatch(await f.msg('focus.enable'),f.sender),/native write failed/);
  assert.equal(f.rules.length,0);
});
test('corrupt policy fails safe without erasing records or foreign DNR restrictions',async()=>{
  const f=fixture();
  await f.focus.dispatch(await f.msg('focus.site.put',{site:mkSite('example.com','always')}),f.sender);
  await f.focus.dispatch(await f.msg('focus.enable'),f.sender);
  assert.equal(f.rules.length,1);
  const damaged={version:1,invalid:'do-not-overwrite'};
  f.stored.set(FOCUS_STORE,damaged);
  const foreign={id:25,priority:1,action:{type:'block'},condition:{urlFilter:'foreign'}};
  f.rules.push(foreign);
  await assert.rejects(f.focus.tick(),e=>e.code==='E_FOCUS_DATA');
  assert.deepEqual(f.stored.get(FOCUS_STORE),damaged,'corrupt local data must not be overwritten');
  assert.deepEqual(f.rules,[foreign],'corrupt focus policy cannot leave any owned DNR rule installed');
});
test('Time Review presence or independent storage does not change Stay Focus authorization',async()=>{
  const f=fixture();
  f.stored.set('opendesk.time-review.v1',{days:{'2026-10-13':{'example.com':300000}}});
  await f.focus.dispatch(await f.msg('focus.site.put',{site:mkSite('example.com','always')}),f.sender);
  await f.focus.dispatch(await f.msg('focus.enable'),f.sender);
  assert.equal(f.rules.length,1);
  assert.deepEqual(f.stored.get('opendesk.time-review.v1'),{days:{'2026-10-13':{'example.com':300000}}});
});

// Exercise the installed worker's real storage listener, with the same serialized
// tool lock as Chrome. Draining that queue observes reconciliation without sleeps.
async function installedFocusFixture(t){
  const f=fixture(),listeners=new Set();
  let pending=Promise.resolve();
  f.api.storage.onChanged={addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn)};
  const installed=installStayFocusService({api:f.api,now:()=>f.clock,lockManager:{request(_name,work){
    const result=pending.then(work);pending=result.catch(()=>{});return result;
  }}});
  t.after(()=>{installed.dispose();assert.equal(listeners.size,0,'dispose removes the storage listener');});
  f.focus=installed.service;
  f.storageChange=async(changes,{persist=true}={})=>{
    if(persist)for(const [key,change] of Object.entries(changes)){
      if(change.newValue===undefined)f.stored.delete(key);
      else f.stored.set(key,structuredClone(change.newValue));
    }
    for(const listener of listeners)listener(changes,'local');
    await pending;
  };
  await pending; // initial worker reconciliation
  await f.focus.dispatch(await f.msg('focus.site.put',{site:mkSite('example.com','always')}),f.sender);
  await f.focus.dispatch(await f.msg('focus.enable'),f.sender);
  await f.focus.dispatch(await f.msg('focus.session.start',{minutes:25}),f.sender);
  assert.equal(f.rules.length,1);
  assert.match(f.rules[0].action.redirect.extensionPath,/blocked-session\.html$/);
  assert.equal(f.stored.get(FOCUS_STORE).focusUntil,at+25*60000);
  assert.equal(f.alarms.size,1);
  return f;
}
const timeTool=()=>({...buildTool(),id:'time-review',title:'Time Review',capabilities:['time.review']});
for(const change of ['install','disable','enable','epoch'])test('worker storage isolation: unrelated Time Review '+change+' keeps Focus protection',async t=>{
  const f=await installedFocusFixture(t),before=structuredClone(f.stored.get(FOCUS_STORE));
  const rules=structuredClone(f.rules),opCount=f.nativeOps.length;
  let changes;
  if(change==='install')changes={
    [SIDEBAR_TOOL_STORE]:{oldValue:[f.tool],newValue:[structuredClone(f.tool),timeTool()]},
    [SIDEBAR_TOOL_ENABLE_STORE]:{oldValue:{},newValue:{'time-review':true}},
    [TOOL_REVOCATION_EPOCHS_STORE]:{oldValue:{'stay-focus':'epoch-1'},newValue:{'stay-focus':'epoch-1','time-review':'time-1'}}
  };
  else if(change==='epoch')changes={[TOOL_REVOCATION_EPOCHS_STORE]:{
    oldValue:{'stay-focus':'epoch-1','time-review':'time-1'},newValue:{'stay-focus':'epoch-1','time-review':'time-2'}}};
  else changes={[SIDEBAR_TOOL_ENABLE_STORE]:{oldValue:{'time-review':change==='disable'},
    newValue:{'time-review':change==='enable'}}};
  await f.storageChange(changes);
  const saved=f.stored.get(FOCUS_STORE);
  assert.equal(saved.enabled,true,'another app lifecycle cannot revoke Focus');
  assert.equal(saved.authorizedHash,before.authorizedHash);
  assert.equal(saved.authorizedEpoch,before.authorizedEpoch);
  assert.equal(saved.focusUntil,before.focusUntil,'the active 25 minute block is preserved');
  assert.deepEqual(f.rules,rules);
  assert.equal(f.nativeOps.length,opCount,'unrelated changes never remove/reinstall live DNR rules');
  assert.equal(f.alarms.size,1);
  assert.deepEqual(f.permissionRemovals,[]);
});
for(const change of ['uninstall','identity','epoch','disable'])test('worker storage isolation: Focus '+change+' immediately retires only its own rules',async t=>{
  const f=await installedFocusFixture(t),foreign={id:25,priority:1,action:{type:'block'},condition:{urlFilter:'other-tool'}};
  f.rules.push(foreign);
  const changes=change==='uninstall'?{[SIDEBAR_TOOL_STORE]:{oldValue:[f.tool],newValue:[timeTool()]}}:
    change==='identity'?{[SIDEBAR_TOOL_STORE]:{oldValue:[f.tool],newValue:[{...f.tool,version:'1.0.1'}]}}:
    change==='epoch'?{[TOOL_REVOCATION_EPOCHS_STORE]:{oldValue:{'stay-focus':'epoch-1'},newValue:{'stay-focus':'epoch-2'}}}:
    {[SIDEBAR_TOOL_ENABLE_STORE]:{oldValue:{},newValue:{'stay-focus':false}}};
  await f.storageChange(changes);
  assert.deepEqual(f.rules,[foreign]);
  assert.equal(f.alarms.size,0);
  if(change!=='uninstall')assert.equal(f.stored.get(FOCUS_STORE).enabled,false);
  await assert.rejects(f.focus.dispatch(await f.msg('focus.status'),f.sender),error=>error.code==='E_TOOL_CHANGED');
  assert.deepEqual(f.permissionRemovals,[],'tool retirement does not revoke shared Chrome permissions');
});
for(const change of ['restored identity','restored epoch','restored disable','missing envelope','null envelope',
  'invalid registry','duplicate Focus','invalid package','invalid enable map','invalid epoch map']){
  test('worker storage isolation: '+change+' remains a conservative revocation fence',async t=>{
    const f=await installedFocusFixture(t);
    const changes=change==='restored identity'?{[SIDEBAR_TOOL_STORE]:{oldValue:[f.tool],newValue:[{...f.tool,js:'changed();'}]}}:
      change==='restored epoch'?{[TOOL_REVOCATION_EPOCHS_STORE]:{oldValue:{'stay-focus':'epoch-1'},newValue:{'stay-focus':'retired'}}}:
      change==='restored disable'?{[SIDEBAR_TOOL_ENABLE_STORE]:{oldValue:{},newValue:{'stay-focus':false}}}:
      change==='missing envelope'?{[SIDEBAR_TOOL_ENABLE_STORE]:{}}:
      change==='null envelope'?{[SIDEBAR_TOOL_STORE]:null}:
      change==='invalid registry'?{[SIDEBAR_TOOL_STORE]:{oldValue:[f.tool],newValue:{'stay-focus':f.tool}}}:
      change==='duplicate Focus'?{[SIDEBAR_TOOL_STORE]:{oldValue:[f.tool],newValue:[f.tool,f.tool]}}:
      change==='invalid package'?{[SIDEBAR_TOOL_STORE]:{oldValue:[f.tool],newValue:[f.tool,{id:'time-review'}]}}:
      change==='invalid enable map'?{[SIDEBAR_TOOL_ENABLE_STORE]:{oldValue:{},newValue:{'time-review':'yes'}}}:
      {[TOOL_REVOCATION_EPOCHS_STORE]:{oldValue:{'stay-focus':'epoch-1'},newValue:{'stay-focus':'epoch-1','time-review':17}}};
    // Even if storage already looks valid again by the time its queued event is
    // processed, an own-authority transition or unknown event must stay fenced.
    await f.storageChange(changes,{persist:false});
    assert.equal(f.stored.get(FOCUS_STORE).enabled,false);
    assert.equal(f.stored.get(FOCUS_STORE).authorizedHash,null);
    assert.equal(f.stored.get(FOCUS_STORE).authorizedEpoch,null);
    assert.equal(f.rules.length,0);
    assert.equal(f.alarms.size,0);
    await f.focus.tick({boot:true});
    assert.equal(f.rules.length,0,'a later healthy observation cannot silently restore protection');
    assert.equal(f.stored.get(FOCUS_STORE).enabled,false);
    assert.deepEqual(f.permissionRemovals,[]);
  });
}

test('R5.9 first enable prepares budget but never enrolls recommended websites',async()=>{
  const fresh=fixture();
  const preview=await fresh.focus.dispatch(await fresh.msg('focus.status'),fresh.sender);
  assert.equal(preview.dailyBudget.minutes,30);
  assert.equal(preview.sites.length,0,'install and status never grant or silently enable');
  assert.equal(fresh.stored.has(FOCUS_STORE),false);
  const enabled=await fresh.focus.dispatch(await fresh.msg('focus.enable'),fresh.sender);
  assert.equal(enabled.enabled,true);
  assert.equal(enabled.dailyBudget.managedCount,0);
  assert.deepEqual(enabled.sites,[],'recommended sites never become restrictions on permission grant');
  assert.ok(enabled.catalog.some(site=>site.host==='youtube.com'),'recommendations stay available');
  assert.equal(enabled.ruleReceipt.verified,true);
  const stored=(await fresh.api.storage.local.get(FOCUS_STORE))[FOCUS_STORE];
  assert.equal(stored.groups.entertainment,30);
  const second=await fresh.focus.dispatch(await fresh.msg('focus.enable'),fresh.sender);
  assert.equal(second.sites.length,enabled.sites.length,'repeat approval never reseeds');
  const legacy=fixture();
  await legacy.focus.dispatch(await legacy.msg('focus.site.put',{site:mkSite('example.com')}),legacy.sender);
  await legacy.focus.dispatch(await legacy.msg('focus.enable'),legacy.sender);
  const old=(await legacy.api.storage.local.get(FOCUS_STORE))[FOCUS_STORE];
  assert.equal(old.sites.length,1,'existing explicit single-site policy is not widened');
  assert.equal(old.sites[0].group,'');
  assert.equal(old.groups.entertainment,undefined);
});

test('R1.4 page threshold is sent from settled Host time, retired on disable and uninstall',async()=>{
  const f=fixture();
  f.setUrl('https://youtube.com/watch');
  // R5.9 no longer enrolls suggested websites during activation. The threshold
  // belongs to an explicitly selected, shared-budget website.
  await f.focus.dispatch(await f.msg('focus.site.put',{
    site:{...mkSite('youtube.com','limit',2),group:'entertainment'}}),f.sender);
  await f.focus.dispatch(await f.msg('focus.enable'),f.sender);
  await f.focus.dispatch(await f.msg('focus.group.put',{id:'entertainment',minutes:2}),f.sender);
  await f.focus.tick();
  f.setTime(at+30000);await f.focus.tick();
  assert.equal(f.pageMessages.filter(x=>x.message.kind==='threshold').length,0,
    'one and a half minutes remaining must not trigger a one-minute alert');
  f.setTime(at+60000);await f.focus.tick();
  const notices=f.pageMessages.filter(x=>x.message.kind==='threshold');
  assert.equal(notices.length,1);
  assert.equal(notices[0].id,42);
  assert.equal(notices[0].message.protocol,FOCUS_PAGE_NOTICE_PROTOCOL);
  assert.equal(notices[0].message.minutes,1);
  assert.deepEqual(notices[0].options,{frameId:0});
  let saved=(await f.api.storage.local.get(FOCUS_STORE))[FOCUS_STORE];
  assert.deepEqual(saved.notices.thresholds,[1],'dedupe must be in durable storage before delivery');
  await f.focus.tick({boot:true});
  assert.equal(f.pageMessages.filter(x=>x.message.kind==='threshold').length,1,
    'worker wake cannot redispatch the same threshold');
  await f.focus.dispatch(await f.msg('focus.disable'),f.sender);
  assert.ok(f.pageMessages.some(x=>x.message.kind==='clear'),
    'trusted disable removes the in-page card');
  f.pageMessages.length=0;
  f.stored.set(SIDEBAR_TOOL_STORE,[]);
  f.focus.invalidate({revoke:true});
  await f.focus.tick({boot:true});
  assert.ok(f.pageMessages.some(x=>x.message.kind==='clear'),
    'full uninstall boot must retire a lingering in-page card');
  const clears=f.pageMessages.filter(x=>x.message.kind==='clear').length;
  await f.focus.tick();
  assert.equal(f.pageMessages.filter(x=>x.message.kind==='clear').length,clears,
    'after uninstall, normal tab events must not spam every site with another clear');
  assert.equal(f.rules.length,0,'uninstall also retires Stay Focus DNR only');
});

test('R3.2 worker probe checks live sender and runtime without installing or granting native access',async()=>{
  const f=fixture();
  f.stored.delete(SIDEBAR_TOOL_STORE);f.setAllowed(false);
  const message={protocol:FOCUS_PROTOCOL,toolId:'stay-focus',operation:FOCUS_PROBE_OPERATION,payload:{}};
  const result=await f.focus.probe(message,f.sender);
  assert.equal(result.protocol,FOCUS_PROTOCOL);
  assert.equal(result.serviceVersion,FOCUS_SERVICE_VERSION);
  assert.equal(result.serviceReady,true);
  assert.deepEqual(result.managedSiteRuntime,{
    contract:'opendesk.managed-site-runtime.v1',
    policyKinds:['site-budget.v1','site-budget.v2'],privilegedJs:false
  });
  assert.deepEqual(result.permissions,{idle:false,dnr:true,ready:false});
  assert.equal(f.rules.length,0);
  assert.equal(f.stored.has(FOCUS_STORE),false,'read-only probe may not create policy');
  assert.equal(f.alarms.size,0,'read-only probe must not arm an alarm');
  await assert.rejects(f.focus.probe(message,{...f.sender,id:'spoofed'}),{code:'E_FOCUS_SENDER'});
  await assert.rejects(f.focus.probe({...message,payload:{mutation:true}},f.sender),{code:'E_FOCUS_REQUEST'});
  await assert.rejects(f.focus.dispatch(message,f.sender),{code:'E_FOCUS_REQUEST'});
  f.setAllowed(true);f.api.idle=undefined;
  await assert.rejects(f.focus.probe(message,f.sender),{code:'E_FOCUS_RUNTIME_UNAVAILABLE'});
});

for(const reviewPath of ['ui/marketplace.html','ui/market-install.html'])test('R3.2 Marketplace has read-only live worker admission, never Focus mutation authority: '+reviewPath,async()=>{
  const f=fixture(),market=f.api.runtime.getURL(reviewPath)+
    '?intent=123e4567-e89b-42d3-a456-426614174000#/apps/opendesk/stay-focus';
  const sender={id:f.sender.id,url:market,frameId:0,documentId:'market-document-1',
    documentLifecycle:'active',tab:{id:91,incognito:false}};
  const message={protocol:FOCUS_PROTOCOL,toolId:'stay-focus',operation:FOCUS_PROBE_OPERATION,payload:{}};
  const live={contextType:'TAB',documentUrl:market,documentId:'market-document-1',
    frameId:0,tabId:91,incognito:false};
  let contexts=[live];
  const getContexts=async query=>contexts.filter(row=>
    (!query.contextTypes||query.contextTypes.includes(row.contextType))&&
    (!query.documentUrls||query.documentUrls.includes(row.documentUrl))&&
    (!query.documentIds||query.documentIds.includes(row.documentId))&&
    (!query.tabIds||query.tabIds.includes(row.tabId))).map(row=>structuredClone(row));
  f.api.runtime.getContexts=getContexts;
  const response=await f.focus.probe(message,sender);
  assert.equal(response.serviceReady,true);
  // Chrome retains the Sender's earlier fragment after same-document routing.
  live.documentUrl=market.replace('#/apps/opendesk/stay-focus','#/apps/opendesk/prompt-shortcuts');
  assert.equal((await f.focus.probe(message,sender)).serviceReady,true);
  await assert.rejects(f.focus.dispatch(await f.msg('focus.status'),sender),{code:'E_FOCUS_SENDER'});
  for(const bad of [
    {...sender,url:f.api.runtime.getURL('ui/other.html')},
    {...sender,url:'https://untrusted.example/ui/marketplace.html'},
    {...sender,url:market.replace(f.sender.id,'another-extension')},
    {...sender,id:'another-extension'},
    {...sender,frameId:1},
    {...sender,documentId:'retired-document'},
    {...sender,documentLifecycle:'prerender'},
    {...sender,tab:undefined},
    {...sender,tab:{id:91,incognito:true}}
  ])await assert.rejects(f.focus.probe(message,bad),{code:'E_FOCUS_SENDER'});
  for(const change of [
    {documentUrl:live.documentUrl.replace(reviewPath,'ui/other.html')},
    {documentUrl:live.documentUrl.replace(f.sender.id,'another-extension')},
    {documentUrl:live.documentUrl.replace('?intent=','?other=')},
    {documentId:'retired-document'},{tabId:92},{frameId:1},{incognito:true},
    {contextType:'SIDE_PANEL'}
  ]){
    contexts=[{...live,...change}];
    await assert.rejects(f.focus.probe(message,sender),{code:'E_FOCUS_SENDER'});
  }
  contexts=[live,{...live}];
  await assert.rejects(f.focus.probe(message,sender),{code:'E_FOCUS_SENDER'});
  contexts=[live];
  let checks=0;
  f.api.runtime.getContexts=async query=>{
    const rows=await getContexts(query);
    if(++checks===1)contexts=[];
    return rows;
  };
  await assert.rejects(f.focus.probe(message,sender),{code:'E_FOCUS_SENDER'});
  assert.equal(checks,2,'probe must revalidate the live document before returning');
  assert.equal(f.rules.length,0);
  assert.equal(f.alarms.size,0);
  assert.equal(f.stored.has(FOCUS_STORE),false);
});

test('R5.9 first-use budget is editable without silently adding websites',async()=>{
  const f=fixture();
  const prepared=await f.focus.dispatch(await f.msg('focus.group.put',
    {id:'entertainment',minutes:45}),f.sender);
  assert.equal(prepared.enabled,false);
  assert.equal(prepared.dailyBudget.minutes,45);
  assert.deepEqual(prepared.sites,[],'budget preparation must not enroll a site');
  assert.equal(f.rules.length,0,'preparing a budget must never claim Chrome rules are active');
  const reopened=await f.focus.tick({boot:true});
  assert.equal(reopened.dailyBudget.minutes,45);
  const enabled=await f.focus.dispatch(await f.msg('focus.enable',{}),f.sender);
  assert.equal(enabled.enabled,true);
  assert.equal(enabled.dailyBudget.minutes,45,'authorization must preserve preselected minutes');
  assert.deepEqual(enabled.sites,[]);
  await f.focus.dispatch(await f.msg('focus.site.put',{site:{
    host:'youtube.com',subdomains:true,enabled:true,mode:'limit',minutes:45,group:'entertainment'}}),f.sender);
  await f.focus.dispatch(await f.msg('focus.site.remove',{host:'youtube.com'}),f.sender);
  const revised=await f.focus.dispatch(await f.msg('focus.group.put',
    {id:'entertainment',minutes:60}),f.sender);
  assert.equal(revised.sites.some(site=>site.host==='youtube.com'),false,
    'an existing custom policy must not be silently re-enrolled');
});
