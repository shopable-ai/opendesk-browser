import test from 'node:test';
import assert from 'node:assert/strict';
import {createStayFocusService} from '../../src/stay-focus/service.js';
import {FOCUS_PROTOCOL,FOCUS_STORE,FOCUS_PAGE_NOTICE_PROTOCOL,FOCUS_PROBE_OPERATION,FOCUS_SERVICE_VERSION,focusPackageHash} from '../../src/stay-focus/policy.js';
import {SIDEBAR_TOOL_STORE} from '../../src/ui/sidebar-tools/package.js';
import {SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE} from '../../src/ui/sidebar-tools/lifecycle.js';

const buildTool=()=>({format:'opendesk.sidebar-tool.v1',id:'stay-focus',version:'1.0.0',
  title:'Stay Focus',description:'Unit-tested independent tool',capabilities:['focus.control'],
  html:'<main>Stay Focus</main>',css:'.root{color:#333}',js:'(() => {})();'});
const mkSite=(host,mode='limit',minutes=1)=>({host,subdomains:true,enabled:true,mode,minutes,group:''});
const at=new Date(2026,9,13,10,0,0).getTime();
function fixture(){
  const tool=buildTool(),docId='document-123';
  const host='chrome-extension://abcdefghijklmnopabcdefghijklmnop/ui/tool.html?hostInstanceId=123e4567-e89b-42d3-a456-426614174000';
  const sender={id:'abcdefghijklmnopabcdefghijklmnop',url:host,frameId:0,documentId:docId,documentLifecycle:'active'};
  const stored=new Map([[SIDEBAR_TOOL_STORE,[tool]],[SIDEBAR_TOOL_ENABLE_STORE,{}],
    [TOOL_REVOCATION_EPOCHS_STORE,{['stay-focus']:'epoch-1'}]]);
  const session=new Map(),alarms=new Map();
  let clock=at,allowed=true,idle='active',focused=true,tabUrl='https://example.com/watch';
  const rules=[],tabUpdates=[],nativeOps=[],pageMessages=[];
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
      Boolean(origins?.length)||Boolean(permissions?.length)&&allowed},
    idle:{queryState:async()=>idle},
    windows:{getLastFocused:async()=>({id:1,focused,type:'normal',incognito:false})},
    tabs:{query:async filter=>filter?.active===true?[{id:42,windowId:1,url:tabUrl,incognito:false}]:
      [{id:42,windowId:1,url:tabUrl,incognito:false}],
      get:async id=>({id,windowId:1,active:true,url:tabUrl,incognito:false}),
      sendMessage:async(id,message,options)=>{pageMessages.push({id,message,options});return {displayed:true};},
      update:async(id,options)=>{tabUpdates.push({id,...options});tabUrl=options.url;return {id,url:tabUrl};}},
    alarms:{get:async name=>alarms.get(name),create:async(name,options)=>{alarms.set(name,options);},
      clear:async name=>{alarms.delete(name);return true;}},
    declarativeNetRequest:{getDynamicRules:async()=>structuredClone(rules),
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
  return {tool,sender,stored,session,alarms,rules,tabUpdates,nativeOps,pageMessages,api,focus,msg,
    get clock(){return clock;},setTime:value=>{clock=value;},
    setAllowed:value=>{allowed=value;},setIdle:value=>{idle=value;},
    setFocused:value=>{focused=value;},
    setUrl:value=>{tabUrl=value;},get url(){return tabUrl;}};
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
  f.setAllowed(false);f.focus.invalidate({revoke:true});await f.focus.tick();
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

test('R1.4 first true enable seeds shared entertainment, existing explicit policy is preserved',async()=>{
  const fresh=fixture();
  const preview=await fresh.focus.dispatch(await fresh.msg('focus.status'),fresh.sender);
  assert.equal(preview.dailyBudget.minutes,30);
  assert.equal(preview.sites.length,0,'install and status never grant or silently enable');
  assert.equal(fresh.stored.has(FOCUS_STORE),false);
  const enabled=await fresh.focus.dispatch(await fresh.msg('focus.enable'),fresh.sender);
  assert.equal(enabled.enabled,true);
  assert.equal(enabled.dailyBudget.managedCount,11);
  assert.ok(enabled.sites.some(site=>site.host==='youtube.com'&&site.group==='entertainment'));
  assert.ok(enabled.sites.some(site=>site.host==='tiktok.com'&&site.group==='entertainment'));
  assert.equal(enabled.sites.find(site=>site.host==='github.com'),undefined);
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
  assert.deepEqual(result.permissions,{idle:false,dnr:false,ready:false});
  assert.equal(f.rules.length,0);
  assert.equal(f.stored.has(FOCUS_STORE),false,'read-only probe may not create policy');
  assert.equal(f.alarms.size,0,'read-only probe must not arm an alarm');
  await assert.rejects(f.focus.probe(message,{...f.sender,id:'spoofed'}),{code:'E_FOCUS_SENDER'});
  await assert.rejects(f.focus.probe({...message,payload:{mutation:true}},f.sender),{code:'E_FOCUS_REQUEST'});
  await assert.rejects(f.focus.dispatch(message,f.sender),{code:'E_FOCUS_REQUEST'});
  f.setAllowed(true);f.api.idle=undefined;
  await assert.rejects(f.focus.probe(message,f.sender),{code:'E_FOCUS_RUNTIME_UNAVAILABLE'});
});

test('R3.2 Marketplace has read-only live worker admission, never Focus mutation authority',async()=>{
  const f=fixture(),market=f.api.runtime.getURL('ui/marketplace.html')+
    '?intent=123e4567-e89b-42d3-a456-426614174000#/apps/opendesk/stay-focus';
  const sender={id:f.sender.id,url:market,frameId:0,documentId:'market-document-1',
    documentLifecycle:'active',tab:{id:91,incognito:false}};
  const message={protocol:FOCUS_PROTOCOL,toolId:'stay-focus',operation:FOCUS_PROBE_OPERATION,payload:{}};
  f.api.runtime.getContexts=async query=>{
    assert.deepEqual(query,{contextTypes:['TAB'],documentUrls:[market],tabIds:[91]});
    return [{contextType:'TAB',documentUrl:market,documentId:'market-document-1',
      frameId:0,tabId:91,incognito:false}];
  };
  const response=await f.focus.probe(message,sender);
  assert.equal(response.serviceReady,true);
  await assert.rejects(f.focus.dispatch(await f.msg('focus.status'),sender),{code:'E_FOCUS_SENDER'});
  for(const bad of [
    {...sender,url:f.api.runtime.getURL('ui/other.html')},
    {...sender,url:'https://untrusted.example/ui/marketplace.html'},
    {...sender,id:'another-extension'},
    {...sender,frameId:1},
    {...sender,documentId:'retired-document'},
    {...sender,tab:{id:91,incognito:true}}
  ])await assert.rejects(f.focus.probe(message,bad),{code:'E_FOCUS_SENDER'});
  assert.equal(f.rules.length,0);
  assert.equal(f.alarms.size,0);
  assert.equal(f.stored.has(FOCUS_STORE),false);
});
