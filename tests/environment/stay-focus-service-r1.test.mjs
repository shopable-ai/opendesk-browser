import test from 'node:test';
import assert from 'node:assert/strict';
import {createStayFocusService} from '../../src/stay-focus/service.js';
import {FOCUS_PROTOCOL,FOCUS_STORE,focusPackageHash} from '../../src/stay-focus/policy.js';
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
  const rules=[],tabUpdates=[],nativeOps=[];
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
  return {tool,sender,stored,session,alarms,rules,tabUpdates,nativeOps,api,focus,msg,
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
