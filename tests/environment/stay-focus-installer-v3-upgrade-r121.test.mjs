import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {installReviewedSidebarTool,recoverMarketOperation,MARKET_OPERATIONS_STORE}
  from '../../src/ui/sidebar-tools/installation.js';
import {SIDEBAR_TOOL_STORE,sidebarToolPackageHash}
  from '../../src/ui/sidebar-tools/package.js';
import {MARKET_PROVENANCE_STORE} from '../../src/sidebar-tools/official-reading-toc.js';
import {TOOL_REVOCATION_EPOCHS_STORE}
  from '../../src/ui/sidebar-tools/lifecycle.js';
import {MANAGED_SITE_BUDGET_STORE,MANAGED_SITE_BUDGET_ALARM}
  from '../../src/platform/chrome/browser-managed-site-budget.js';
import {MANAGED_SITE_REVIEWED_SCOPE_STORE} from '../../src/framework/host/managed-site-reviewed-scopes.js';
import {FOCUS_STORE,FOCUS_ALARM,FOCUS_RULE_FIRST,focusPackageHash}
  from '../../examples/sidebar-tools/stay-focus/trusted/policy.js';
import {emptyFocus}
  from '../../examples/sidebar-tools/stay-focus/trusted/model.js';

const legacy=JSON.parse(await readFile(new URL(
  '../../examples/sidebar-tools/stay-focus/stay-focus.opendesk-tool.json',import.meta.url)));
const modern={...legacy,format:'opendesk.sidebar-tool.v2',version:'3.0.0',
  capabilities:['browser.siteBudget','currentPage.read'],
  requires:{browserSdk:'1.0.0'},contributes:{contextMenus:[]},
  backgroundPolicy:{kind:'site-budget.v3',suggestions:legacy.backgroundPolicy.suggestions}};
const epoch='legacy-install-epoch',opId='a3b45678-e89b-42d3-a456-426614174000';
const owner='stay-focus',source='opendesk/stay-focus';
const peerRule={id:200,priority:1,action:{type:'block'},
  condition:{requestDomains:['peer.example.org'],resourceTypes:['main_frame']}};
const oldRule={...peerRule,id:FOCUS_RULE_FIRST,
  condition:{requestDomains:['youtube.com'],resourceTypes:['main_frame']}};
const clone=value=>structuredClone(value);
function oldState({enabled=true,authorized=true}={}){
  const state=emptyFocus(Date.now());
  state.sites=[
    {host:'youtube.com',subdomains:true,enabled:true,mode:'limit',minutes:30,group:'entertainment'},
    {host:'reddit.com',subdomains:false,enabled:true,mode:'limit',minutes:15,group:''}
  ];
  state.groups.entertainment=30;
  state.whitelist=['docs.example.org'];
  state.schedule={enabled:false,days:[1,2,3,4,5],startMinute:1320,endMinute:360};
  state.usage={'g:entertainment':720000,'s:reddit.com':90000};
  state.enabled=enabled;
  state.clockHighWater=Date.now();
  state.notices={day:state.day,revision:7,budgetMs:1800000,thresholds:[]};
  state.checkpoint={at:Date.now(),day:state.day,offset:new Date().getTimezoneOffset(),
    session:'old-focus-session',host:'youtube.com',tabId:5,windowId:2,pool:'g:entertainment'};
  if(authorized){
    state.authorizedEpoch=epoch;
  }
  return state;
}
async function fixture({enabled=true,authorized=true,corruptEpoch=false,grantOrigins=true,
  nativeDnr=true}={}){
  assert.equal(legacy.version,'1.0.10','fixture must use the pinned historical package');
  const legacyHash=await focusPackageHash(legacy);
  const old=oldState({enabled,authorized});
  if(authorized)old.authorizedHash=legacyHash;
  if(corruptEpoch)old.authorizedEpoch='unrelated-epoch';
  const provenance={marketId:source,version:legacy.version,
    sha256:await sidebarToolPackageHash(legacy)};
  const local=new Map([
    [SIDEBAR_TOOL_STORE,[clone(legacy)]],
    [TOOL_REVOCATION_EPOCHS_STORE,{[owner]:epoch}],
    [MARKET_PROVENANCE_STORE,{[owner]:provenance}],
    [FOCUS_STORE,clone(old)]
  ]);
  const session=new Map(),alarms=new Map([[FOCUS_ALARM,{periodInMinutes:0.5}],
    ['another-app.alarm',{periodInMinutes:2}]]),rules=[clone(peerRule),clone(oldRule)];
  let throwAfterRegistryCommit=false,dropNativeWrite=false;
  const writes=[],held=new Set();
  const area=map=>({
    async get(keys){
      const names=keys===undefined||keys===null?[...map.keys()]:
        Array.isArray(keys)?keys:[keys];
      return Object.fromEntries(names.filter(key=>map.has(key)).map(key=>[key,clone(map.get(key))]));
    },
    async set(patch){
      for(const [key,value] of Object.entries(patch)){map.set(key,clone(value));writes.push(key);}
      if(throwAfterRegistryCommit&&Object.hasOwn(patch,SIDEBAR_TOOL_STORE)){
        throwAfterRegistryCommit=false;
        throw new Error('Simulated acknowledged-lost registry commit');
      }
    },
    async remove(keys){for(const key of Array.isArray(keys)?keys:[keys])map.delete(key);}
  });
  const lockManager={async request(name,fn){
    assert.equal(held.has(name),false,'recursive lock would deadlock: '+name);
    held.add(name);try{return await fn();}finally{held.delete(name);}
  }};
  const api={
    storage:{local:area(local),session:area(session)},
    permissions:{contains:async request=>{
      if(request?.origins?.length)return grantOrigins;
      if(request?.permissions?.includes('declarativeNetRequestWithHostAccess'))return nativeDnr;
      return true;
    }},
    idle:{queryState:async()=> 'active'},
    windows:{getLastFocused:async()=>({id:2,focused:true,type:'normal',incognito:false})},
    tabs:{query:async()=>[{id:5,windowId:2,url:'https://youtube.com/watch',
      incognito:false,active:true}],
      update:async(id,request)=>({id,...request}),get:async id=>({id,active:true,windowId:2,url:'https://youtube.com/watch'})},
    alarms:{get:async id=>clone(alarms.get(id)),create:async(id,rec)=>{alarms.set(id,clone(rec));},
      clear:async id=>alarms.delete(id)},
    runtime:{getURL:path=>'chrome-extension://abcdefghijklmnopabcdefghijklmnop/'+path,
      sendMessage:async message=>{
        assert.equal(message.operation,'probe','Installer may only probe the precompiled Worker');
        return {ok:true,data:{managedSiteRuntime:{contract:'opendesk.managed-site-runtime.v1',
          policyKinds:['site-budget.v2','site-budget.v3'],privilegedJs:false}}};
      }},
    declarativeNetRequest:{
      getDynamicRules:async()=>clone(rules),
      updateDynamicRules:async({removeRuleIds=[],addRules=[]})=>{
        if(dropNativeWrite)return;
        for(const id of removeRuleIds){
          const pos=rules.findIndex(row=>row.id===id);if(pos>=0)rules.splice(pos,1);
        }
        rules.push(...clone(addRules));
      }
    }
  };
  const market={marketId:source,sha256:await sidebarToolPackageHash(modern),operationId:opId};
  const args={api,lockManager,baseline:clone(legacy),candidate:clone(modern),
    reviewApproved:true,market,approveUpdate:async()=>true};
  return {api,local,session,alarms,rules,writes,old,market,args,lockManager,
    loseRegistryAck(){throwAfterRegistryCommit=true;},
    dropNative(value){dropNativeWrite=value;},legacyHash};
}
const driverRow=f=>f.local.get(MANAGED_SITE_BUDGET_STORE)?.[owner];
async function assertConserved(f,{enabled=true}={}){
  const actual=driverRow(f);
  assert.equal(actual?.kind,'site-budget.v3');
  assert.equal(actual.policy.enabled,enabled);
  assert.deepEqual(actual.usage,f.old.usage,'every original counter pool is conserved, not just sum');
  if(actual.checkpoint){
    assert.notEqual(actual.checkpoint.session,f.old.checkpoint?.session,
      'Driver must never replay an old Focus session checkpoint');
    assert.ok(actual.checkpoint.at>=f.old.checkpoint.at,
      'a live Driver observation starts a fresh checkpoint after migration');
  }
  assert.ok(actual.clockHighWater>=f.old.clockHighWater);
  assert.deepEqual(actual.sealedModel.usage,{},'product model has no second billing ledger');
  assert.deepEqual(f.local.get(FOCUS_STORE),f.old,'source is immutable historical evidence');
  assert.equal(f.rules.some(rule=>rule.id===FOCUS_RULE_FIRST),false);
  assert.ok(f.rules.some(rule=>rule.id===peerRule.id),'peer DNR survives migration');
  assert.equal(f.alarms.has(FOCUS_ALARM),false,'private heartbeat retired');
  assert.ok(f.alarms.has('another-app.alarm'),'peer alarm survives migration');
  if(enabled)assert.ok(f.alarms.has(MANAGED_SITE_BUDGET_ALARM),'Driver owns active heartbeat');
  else assert.equal(f.alarms.has(MANAGED_SITE_BUDGET_ALARM),false,'STOP stays stopped');
}
test('real Installer: verified v1.0.10 12-minute shared pool + independent pool -> v3 Native Driver',async()=>{
  const f=await fixture();
  const result=await installReviewedSidebarTool(f.args);
  assert.equal(result.state,'installed');
  assert.equal(result.migrationReceipt?.state,'native-verified');
  assert.ok(result.migrationReceipt?.modelRef);
  await assertConserved(f);
  assert.equal(driverRow(f).notices.day,f.old.day);
  assert.equal(driverRow(f).sealedModel.sites.length,2);
  assert.deepEqual(driverRow(f).sealedModel.whitelist,['docs.example.org']);
  const grants=f.local.get(MANAGED_SITE_REVIEWED_SCOPE_STORE)?.[owner];
  assert.equal(grants.installEpoch,f.local.get(TOOL_REVOCATION_EPOCHS_STORE)[owner]);
  assert.equal(grants.packageHash,await sidebarToolPackageHash(modern));
  assert.deepEqual(grants.sites,[{host:'youtube.com',subdomains:true},
    {host:'reddit.com',subdomains:false}]);
  const recovered=await recoverMarketOperation({api:f.api,lockManager:f.lockManager,operationId:opId});
  assert.equal(recovered.state,'succeeded');
  await assertConserved(f);
});
test('legacy STOP remains STOP after exact source/epoch handoff, no inherited active rules',async()=>{
  const f=await fixture({enabled:false,authorized:false});
  const result=await installReviewedSidebarTool(f.args);
  assert.equal(result.state,'installed');
  await assertConserved(f,{enabled:false});
  assert.equal(f.local.get(MANAGED_SITE_REVIEWED_SCOPE_STORE)?.[owner],undefined);
});
test('legacy invalid epoch or revoked website grant cannot silently restore native rights',async()=>{
  for(const patch of [{corruptEpoch:true},{grantOrigins:false}]){
    const f=await fixture(patch);
    await assert.rejects(installReviewedSidebarTool(f.args),{code:'E_MIGRATION_GRANT'});
    assert.equal(f.local.get(SIDEBAR_TOOL_STORE)[0].version,'1.0.10');
    assert.deepEqual(f.local.get(FOCUS_STORE),f.old);
    assert.equal(driverRow(f),undefined);
    assert.ok(f.rules.some(rule=>rule.id===FOCUS_RULE_FIRST));
  }
});
test('no DNR permission fails preflight for STOP too, without orphaning old native owner',async()=>{
  const f=await fixture({enabled:false,nativeDnr:false});
  await assert.rejects(installReviewedSidebarTool(f.args),{code:'E_MIGRATION_NATIVE_UNAVAILABLE'});
  assert.equal(f.local.get(SIDEBAR_TOOL_STORE)[0].version,'1.0.10');
  assert.equal(driverRow(f),undefined);
});
test('old 10/5 minute reminders stay deduplicated in the exact shared pool',async()=>{
  const f=await fixture();
  for(const state of [f.old,f.local.get(FOCUS_STORE)]){
    state.usage['g:entertainment']=25*60000;
    state.notices.thresholds=[10,5];
  }
  const result=await installReviewedSidebarTool(f.args);
  assert.equal(result.state,'installed');
  await assertConserved(f);
  assert.deepEqual(driverRow(f).notices.pools['g:entertainment'],
    {limitMs:1800000,thresholds:[10,5]});
  assert.deepEqual(driverRow(f).notices.pools['s:reddit.com'],undefined,
    'legacy reminders must not be cloned to other independent pools');
});
test('lost registry acknowledgement recovers exact historical snapshot without replay or peer cleanup',async()=>{
  const f=await fixture();
  f.loseRegistryAck();
  await assert.rejects(installReviewedSidebarTool(f.args),{code:'E_OUTCOME_UNKNOWN'});
  assert.equal(f.local.get(SIDEBAR_TOOL_STORE)[0].version,'3.0.0');
  assert.equal(f.local.get(MARKET_OPERATIONS_STORE)[opId].state,'outcome-unknown');
  assert.equal(driverRow(f),undefined,'Driver ledger staged only on recovery');
  const first=await recoverMarketOperation({api:f.api,lockManager:f.lockManager,operationId:opId});
  assert.equal(first.state,'succeeded');
  await assertConserved(f);
  const snapshotWrites=f.writes.filter(key=>key.startsWith('opendesk.market.legacy-focus.v1:'));
  assert.equal(snapshotWrites.length,1,'no migration snapshot replay on recovery');
  const second=await recoverMarketOperation({api:f.api,lockManager:f.lockManager,operationId:opId});
  assert.equal(second.state,'succeeded');
  await assertConserved(f);
});
test('uncertain native DNR cleanup retains operation journal for same-snapshot recovery',async()=>{
  const f=await fixture();
  f.dropNative(true);
  await assert.rejects(installReviewedSidebarTool(f.args),{code:'E_OUTCOME_UNKNOWN'});
  assert.equal(f.local.get(MARKET_OPERATIONS_STORE)[opId].state,'outcome-unknown');
  assert.equal(f.local.get(SIDEBAR_TOOL_STORE)[0].version,'3.0.0');
  assert.deepEqual(driverRow(f).usage,f.old.usage);
  f.dropNative(false);
  const result=await recoverMarketOperation({api:f.api,lockManager:f.lockManager,operationId:opId});
  assert.equal(result.state,'succeeded');
  await assertConserved(f);
});
