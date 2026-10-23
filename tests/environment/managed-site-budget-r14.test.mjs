import test from 'node:test';
import assert from 'node:assert/strict';
import {createManagedSiteBudgetService,stopManagedSiteBudgetForTool,
  MANAGED_SITE_BUDGET_STORE,MANAGED_SITE_BUDGET_ALARM,MANAGED_SITE_BUDGET_RULE_FIRST}
  from '../../src/platform/chrome/browser-managed-site-budget.js';
import {SIDEBAR_TOOL_STORE,SIDEBAR_TOOL_FORMAT_V2,sidebarToolPackageHash,
  validateSidebarToolPackage} from '../../src/ui/sidebar-tools/package.js';
import {SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE}
  from '../../src/ui/sidebar-tools/lifecycle.js';
import {MARKET_PROVENANCE_STORE} from '../../src/sidebar-tools/official-reading-toc.js';
import {MANAGED_SITE_REVIEWED_SCOPE_STORE}
  from '../../src/framework/host/managed-site-reviewed-scopes.js';
import {MANAGED_SITE_BUDGET_PROTOCOL} from '../../src/platform/host/managed-site-runtime-contract.js';
import {normalizeBrowserOperation} from '../../src/framework/sdk/browser-contract.js';
import {installReviewedSidebarTool,recoverMarketOperation} from '../../src/ui/sidebar-tools/installation.js';

const id='budget-fixture',start=Date.parse('2026-10-21T09:00:00Z');
const schedule={enabled:false,days:[1,2,3,4,5],startMinute:540,endMinute:1020};
const settings={enabled:true,dailyMinutes:1,sites:['example.com'],schedule};
const template={kind:'site-budget.v2',dailyMinutes:5,defaultSites:[],schedule,
  suggestions:[{host:'example.com',name:'Example',category:'工作',suggestLimit:true,quick:false}]};
const tool=(version='1.0.0',policy=template)=>({format:SIDEBAR_TOOL_FORMAT_V2,id,
  version,title:'Budget Fixture',description:'Independent app budget test',
  capabilities:['browser.siteBudget'],html:'<main>Budget UI</main>',css:'',js:'void 0;',
  requires:{browserSdk:'1.0.0'},contributes:{contextMenus:[]},backgroundPolicy:policy});
function fixture(installed=[tool()]){
  const local=new Map([[SIDEBAR_TOOL_STORE,installed],
    [TOOL_REVOCATION_EPOCHS_STORE,{[id]:'epoch-a'}]]);
  const session=new Map(),alarms=new Map(),rules=[],held=new Set(),writes=[];
  const lockManager={async request(key,cb){
    assert.equal(held.has(key),false,'nested owner lock: '+key);
    held.add(key);try{return await cb();}finally{held.delete(key);}
  }};
  let time=start,url='https://example.com/watch',permissions=true,dropNative=false,dropAlarm=false;
  const clone=value=>structuredClone(value);
  const area=map=>({
    async get(keys){
      const names=keys===null?[...map.keys()]:Array.isArray(keys)?keys:[keys];
      return Object.fromEntries(names.filter(key=>map.has(key)).map(key=>[key,clone(map.get(key))]));
    },
    async set(values){for(const [key,value] of Object.entries(values)){
      map.set(key,clone(value));writes.push(key);
    }},
    async remove(keys){for(const key of Array.isArray(keys)?keys:[keys])map.delete(key);}
  });
  const sender={id:'abcdefghijklmnopabcdefghijklmnop',
    url:'chrome-extension://abcdefghijklmnopabcdefghijklmnop/sidepanel.html?hostInstanceId=123e4567-e89b-42d3-a456-426614174000',
    documentId:'budget-doc',documentLifecycle:'active',frameId:0};
  const api={runtime:{id:sender.id,
      getURL:p=>'chrome-extension://'+sender.id+'/'+p,
      getContexts:async()=>[{documentUrl:sender.url,documentId:sender.documentId,
        frameId:0,incognito:false}]},
    storage:{local:area(local),session:area(session)},
    permissions:{contains:async()=>permissions},
    idle:{queryState:async()=> 'active'},
    windows:{getLastFocused:async()=>({id:2,focused:true,type:'normal',incognito:false})},
    tabs:{query:async()=>[{id:5,windowId:2,url,incognito:false}]},
    alarms:{get:async name=>alarms.get(name),
      create:async(name,value)=>{if(!dropAlarm)alarms.set(name,value);},
      clear:async name=>{alarms.delete(name);}},
    declarativeNetRequest:{
      getDynamicRules:async()=>clone(rules),
      updateDynamicRules:async({removeRuleIds=[],addRules=[]})=>{
        if(dropNative)return;
        for(const rid of removeRuleIds){
          const i=rules.findIndex(row=>row.id===rid);
          if(i>=0)rules.splice(i,1);
        }
        rules.push(...clone(addRules));
      }
    }};
  const service=createManagedSiteBudgetService({api,lockManager,now:()=>time});
  api.runtime.sendMessage=async message=>{
    try{return {ok:true,data:await service.dispatch(message,sender)};}
    catch(error){return {ok:false,error:{code:error.code,message:error.message}};}
  };
  const msg=async(operation,args={},row=local.get(SIDEBAR_TOOL_STORE)[0],epoch=(local.get(TOOL_REVOCATION_EPOCHS_STORE)||{})[id]??null)=>({
    protocol:MANAGED_SITE_BUDGET_PROTOCOL,toolId:id,operation,args,
    packageHash:await sidebarToolPackageHash(row),installEpoch:epoch
  });
  return {api,service,sender,local,session,alarms,rules,writes,lockManager,msg,
    tick:ms=>{time+=ms;},setUrl:v=>{url=v;},allow:v=>{permissions=v;},
    fault:v=>{dropNative=v;},faultAlarm:v=>{dropAlarm=v;}};
}
test('compatibility probe admits the original live Side Panel installer before installation',async()=>{
  const f=fixture([]);
  const result=await f.service.dispatch({protocol:MANAGED_SITE_BUDGET_PROTOCOL,
    toolId:id,operation:'probe'},f.sender);
  assert.deepEqual(result.managedSiteRuntime.policyKinds,['site-budget.v2','site-budget.v3']);
  assert.equal(result.managedSiteRuntime.privilegedJs,false);
  assert.equal(f.local.has(MANAGED_SITE_BUDGET_STORE),false,'read-only admission must not create owner resources');
});
test('compatibility probe resolves Chrome Side Panel omitted fields only from a unique live native context',async()=>{
  const f=fixture([]),message={protocol:MANAGED_SITE_BUDGET_PROTOCOL,toolId:id,operation:'probe'};
  const sender={id:f.sender.id,url:f.sender.url,origin:'chrome-extension://'+f.sender.id};
  const context={contextType:'SIDE_PANEL',documentUrl:f.sender.url,documentId:f.sender.documentId,
    frameId:0,incognito:false};
  f.api.runtime.getContexts=async()=>[context];
  assert.equal((await f.service.dispatch(message,sender)).managedSiteRuntime.privilegedJs,false);
  for(const contexts of [[],[context,context],[{...context,frameId:1}],
    [{...context,incognito:true}],[{...context,documentUrl:f.sender.url+'#foreign'}]]){
    f.api.runtime.getContexts=async()=>contexts;
    await assert.rejects(f.service.dispatch(message,sender),{code:'E_TOOL_SENDER'});
  }
});
test('compatibility probe rejects foreign, framed, inactive and stale Side Panel documents',async()=>{
  const f=fixture([]),message={protocol:MANAGED_SITE_BUDGET_PROTOCOL,toolId:id,operation:'probe'};
  for(const patch of [{id:'foreign-extension'},{frameId:1},{documentLifecycle:'cached'},
    {documentId:'retired-document'},{url:f.sender.url.replace('hostInstanceId=','untrusted=')},
    {tab:{id:1,incognito:true}}]){
    await assert.rejects(f.service.dispatch(message,{...f.sender,...patch}),{code:'E_TOOL_SENDER'});
  }
  f.api.runtime.getContexts=async()=>[];
  await assert.rejects(f.service.dispatch(message,f.sender),{code:'E_TOOL_SENDER'});
});
test('missing native sender fields cannot transfer policy authority to a replacement document',async()=>{
  const f=fixture(),sender={id:f.sender.id,url:f.sender.url};let liveDocument=f.sender.documentId;
  f.api.runtime.getContexts=async()=>[{contextType:'SIDE_PANEL',documentUrl:sender.url,
    documentId:liveDocument,frameId:0,incognito:false}];
  const read=f.api.storage.local.get;
  f.api.storage.local.get=async keys=>{const result=await read(keys);liveDocument='replacement-doc';return result;};
  await assert.rejects(f.service.dispatch(await f.msg('setPolicy',{...settings,expectedRev:0}),sender),
    {code:'E_TOOL_SENDER'});
  assert.equal(f.local.has(MANAGED_SITE_BUDGET_STORE),false,'replacement must be rejected before mutation');
});
test('replacement after a native policy effect reports unknown instead of acknowledging another document',async()=>{
  const f=fixture(),sender={id:f.sender.id,url:f.sender.url};let liveDocument=f.sender.documentId;
  f.api.runtime.getContexts=async()=>[{contextType:'SIDE_PANEL',documentUrl:sender.url,
    documentId:liveDocument,frameId:0,incognito:false}];
  const save=f.api.storage.local.set;
  f.api.storage.local.set=async values=>{await save(values);
    if(values[MANAGED_SITE_BUDGET_STORE]?.[id]?.settings.enabled)liveDocument='replacement-doc';};
  await assert.rejects(f.service.dispatch(await f.msg('setPolicy',{...settings,expectedRev:0}),sender),
    {code:'E_OUTCOME_UNKNOWN'});
  assert.equal(f.local.get(MANAGED_SITE_BUDGET_STORE)[id].settings.enabled,true,
    'an observed effect must not be silently replayed or declared absent');
});
test('bounded policy cannot accept unknown code, sites or missing CAS revision',()=>{
  assert.equal(validateSidebarToolPackage(tool()).backgroundPolicy.kind,'site-budget.v2');
  assert.equal(normalizeBrowserOperation('browser.siteBudget.setPolicy',
    {...settings,expectedRev:0}).expectedRev,0);
  assert.throws(()=>normalizeBrowserOperation('browser.siteBudget.setPolicy',settings),{code:'E_SCHEMA'});
  for(const invalid of [
    {...tool(),backgroundPolicy:{...template,kind:'site-budget.v99'}},
    {...tool(),capabilities:['focus.control','browser.siteBudget']},
    {...tool(),backgroundPolicy:{...template,defaultSites:['evil.example']}},
    {...tool(),backgroundPolicy:{...template,suggestions:[{...template.suggestions[0],host:'*.example.com'}]}}
  ])assert.throws(()=>validateSidebarToolPackage(invalid),{code:'E_TOOL_POLICY'});
});
test('existing installer installs ordinary tool then upgrades its package without changing UI default',async()=>{
  const f=fixture([]);
  const first=await installReviewedSidebarTool({api:f.api,lockManager:f.lockManager,
    candidate:tool(),baseline:null,reviewApproved:true});
  assert.equal(first.state,'installed');
  await f.service.dispatch(await f.msg('setPolicy',{...settings,expectedRev:0}),f.sender);
  const newer=tool('1.0.1',{...template,dailyMinutes:9});
  const upgraded=await installReviewedSidebarTool({api:f.api,lockManager:f.lockManager,
    candidate:newer,baseline:tool(),reviewApproved:true,approveUpdate:async()=>true});
  assert.equal(upgraded.state,'installed');
  const receipt=await f.service.dispatch(await f.msg('getStatus',{},newer),f.sender);
  assert.equal(receipt.settings.dailyMinutes,1);
  assert.equal(f.local.get(SIDEBAR_TOOL_STORE)[0].version,'1.0.1');
});
test('foreground count reaches budget and native DNR keeps peer rules intact',async()=>{
  const f=fixture();
  const initial=await f.service.dispatch(await f.msg('setPolicy',
    {...settings,expectedRev:0}),f.sender);
  assert.equal(initial.status,'applied');
  assert.equal(initial.usedMs,0);
  assert.equal(f.rules.length,0);
  assert.equal(f.alarms.get(MANAGED_SITE_BUDGET_ALARM).periodInMinutes,0.5);
  f.tick(30000);await f.service.run();
  assert.equal(f.local.get(MANAGED_SITE_BUDGET_STORE)[id].usage.daily,30000);
  f.tick(30000);await f.service.run();
  assert.equal(f.local.get(MANAGED_SITE_BUDGET_STORE)[id].usage.daily,60000);
  assert.equal(f.rules[0].id,MANAGED_SITE_BUDGET_RULE_FIRST);
  assert.equal(f.rules[0].priority,10,'AdBlock allow=2 < budget block < Focus redirect>=20');
  f.rules.push({id:741001,priority:2,action:{type:'allowAllRequests'},
    condition:{resourceTypes:['main_frame']}});
  f.tick(30000);await f.service.run();
  assert.equal(f.rules.some(row=>row.id===741001),true);
  const status=await f.service.dispatch(await f.msg('getStatus'),f.sender);
  assert.equal(status.usedMs,60000,'do not charge after limit reached');
});
test('cold worker boot discards time gap; upgraded hash and stale epoch are fenced',async()=>{
  const f=fixture(),old=tool(),newer=tool('1.0.1',{...template,dailyMinutes:9});
  await f.service.dispatch(await f.msg('setPolicy',{...settings,expectedRev:0}),f.sender);
  f.tick(30000);await f.service.run();
  f.local.set(SIDEBAR_TOOL_STORE,[newer]);
  await assert.rejects(f.service.dispatch(await f.msg('getStatus',{},old),f.sender),
    {code:'E_TOOL_CHANGED'});
  await assert.rejects(f.service.dispatch(await f.msg('getStatus',{},newer,'old'),f.sender),
    {code:'E_TOOL_CHANGED'});
  f.tick(120000);
  const cold=createManagedSiteBudgetService({api:f.api,lockManager:f.lockManager,
    now:()=>start+150000});
  await cold.run({boot:true});
  assert.equal(f.local.get(MANAGED_SITE_BUDGET_STORE)[id].usage.daily,30000);
  const status=await f.service.dispatch(await f.msg('getStatus',{},newer),f.sender);
  assert.equal(status.settings.dailyMinutes,1,'preserve user policy after app template upgrade');
});
test('installer tool lock and epoch rotation stop old restriction without deadlock or auto-resume',async()=>{
  const f=fixture();
  await f.service.dispatch(await f.msg('setPolicy',{...settings,expectedRev:0}),f.sender);
  f.local.set(SIDEBAR_TOOL_ENABLE_STORE,{[id]:false});
  f.local.set(TOOL_REVOCATION_EPOCHS_STORE,{[id]:'epoch-b'});
  await f.lockManager.request('opendesk.sidebar-tools:tool:'+id,
    ()=>stopManagedSiteBudgetForTool(f.api,id,{lockManager:f.lockManager}));
  assert.equal(f.local.get(MANAGED_SITE_BUDGET_STORE)[id].settings.enabled,false);
  f.local.set(SIDEBAR_TOOL_ENABLE_STORE,{[id]:true});
  await f.service.run({boot:true});
  assert.equal(f.rules.length,0);
  assert.equal(f.alarms.has(MANAGED_SITE_BUDGET_ALARM),false);
});
test('cross-source ID replacement cleans prior owner and alarm; no inherited settings',async()=>{
  const f=fixture();
  await f.service.dispatch(await f.msg('setPolicy',{...settings,expectedRev:0}),f.sender);
  f.local.set(MARKET_PROVENANCE_STORE,{[id]:{marketId:'opendesk/'+id,
    sha256:await sidebarToolPackageHash(tool()),version:'1.0.0'}});
  await f.service.run({boot:true});
  assert.equal(f.local.get(MANAGED_SITE_BUDGET_STORE)?.[id],undefined);
  assert.equal(f.rules.length,0);
  assert.equal(f.alarms.has(MANAGED_SITE_BUDGET_ALARM),false);
});
test('Chrome DNR mismatch remains unknown; corrupt resource ledger forbids writes',async()=>{
  const f=fixture();
  await f.service.dispatch(await f.msg('setPolicy',{...settings,expectedRev:0}),f.sender);
  f.tick(60000);f.fault(true);
  await assert.rejects(f.service.run(),{code:'E_SITE_BUDGET_RECONCILE'});
  assert.equal(f.local.get(MANAGED_SITE_BUDGET_STORE)[id].status,'unknown');
  f.fault(false);await f.service.run({boot:true});
  assert.equal(f.rules.some(row=>row.id===MANAGED_SITE_BUDGET_RULE_FIRST),true);
  f.local.set(MANAGED_SITE_BUDGET_STORE,{[id]:{slot:-1}});
  const before=f.writes.length;
  await assert.rejects(f.service.run(),{code:'E_STORAGE_CORRUPT'});
  assert.equal(f.writes.length,before);
});
test('native uninstall cleanup retires only own DNR slot',async()=>{
  const f=fixture();
  await f.service.dispatch(await f.msg('setPolicy',{...settings,expectedRev:0}),f.sender);
  f.tick(60000);await f.service.run();
  f.rules.push({id:730051,priority:24,
    action:{type:'redirect',redirect:{extensionPath:'/stay-focus/blocked-quota.html'}},
    condition:{resourceTypes:['main_frame']}});
  f.local.set(SIDEBAR_TOOL_STORE,[]);
  await f.lockManager.request('opendesk.sidebar-tools:tool:'+id,
    ()=>stopManagedSiteBudgetForTool(f.api,id,{cleanup:true,lockManager:f.lockManager}));
  assert.equal(f.local.get(MANAGED_SITE_BUDGET_STORE)[id],undefined);
  assert.deepEqual(f.rules.map(row=>row.id),[730051]);
});

test('unverified Chrome Alarm effect marks policy unknown, never silently applied',async()=>{
  const f=fixture();
  f.faultAlarm(true);
  await assert.rejects(f.service.dispatch(await f.msg('setPolicy',
    {...settings,expectedRev:0}),f.sender),{code:'E_MANAGED_ALARM_UNVERIFIED'});
  assert.equal(f.local.get(MANAGED_SITE_BUDGET_STORE)[id].status,'unknown');
  f.faultAlarm(false);
  await f.service.run({boot:true});
  assert.equal(f.local.get(MANAGED_SITE_BUDGET_STORE)[id].status,'applied');
  assert.equal(f.alarms.get(MANAGED_SITE_BUDGET_ALARM).periodInMinutes,0.5);
});

test('activity invalidation fences every installed owner independently',async()=>{
  const peer={...tool(),id:'budget-peer'};
  const f=fixture([tool(),peer]);
  await f.service.dispatch(await f.msg('setPolicy',
    {...settings,expectedRev:0}),f.sender);
  await f.service.dispatch({...await f.msg('setPolicy',
    {...settings,expectedRev:0},peer,null),toolId:peer.id},f.sender);
  f.tick(30000);
  f.service.invalidate();
  await f.service.run();
  const interrupted=f.local.get(MANAGED_SITE_BUDGET_STORE);
  assert.equal(interrupted[id].usage.daily||0,0);
  assert.equal(interrupted[peer.id].usage.daily||0,0,
    'second owner must not reuse first owner event acknowledgement');
  f.tick(30000);
  await f.service.run();
  const resumed=f.local.get(MANAGED_SITE_BUDGET_STORE);
  assert.equal(resumed[id].usage.daily,30000);
  assert.equal(resumed[peer.id].usage.daily,30000);
});

test('event arriving during native reconciliation cannot be acknowledged by old sample',async()=>{
  const f=fixture();
  await f.service.dispatch(await f.msg('setPolicy',
    {...settings,expectedRev:0}),f.sender);
  f.tick(30000);
  const original=f.api.declarativeNetRequest.getDynamicRules;
  let interrupted=false;
  f.api.declarativeNetRequest.getDynamicRules=async()=>{
    if(!interrupted){interrupted=true;f.service.invalidate();}
    return original();
  };
  await f.service.run();
  assert.equal(interrupted,true);
  assert.equal(f.local.get(MANAGED_SITE_BUDGET_STORE)[id].usage.daily,30000);
  f.tick(30000);
  await f.service.run();
  assert.equal(f.local.get(MANAGED_SITE_BUDGET_STORE)[id].usage.daily,30000,
    'an intervening event must discard unobserved elapsed time');
});

test('legacy stateful Focus capability cannot be dropped by a v3 package without verified transfer',async()=>{
  const previous={...tool('1.0.0'),capabilities:['focus.control']};
  const f=fixture([previous]);
  const newPackage={...tool('1.0.1',{
    kind:'site-budget.v3',suggestions:template.suggestions
  }),capabilities:['browser.siteBudget']};
  await assert.rejects(installReviewedSidebarTool({api:f.api,lockManager:f.lockManager,
    candidate:newPackage,baseline:previous,reviewApproved:true,approveUpdate:async()=>true}),
    {code:'E_MIGRATION_REQUIRED'});
  assert.deepEqual(f.local.get(SIDEBAR_TOOL_STORE),[previous],
    'installer must not mutate a legacy app when state transfer is unavailable');
  assert.equal(f.local.has(MANAGED_SITE_BUDGET_STORE),false,
    'driver must not create an empty ledger mistaken for migrated usage');
});

test('v3 suspended app grant cannot install DNR; reviewed epoch rebind resumes unchanged desired policy',async()=>{
  const v3=tool('1.1.0',{kind:'site-budget.v3',suggestions:[]});
  const f=fixture([v3]);
  f.setUrl('https://unrelated.test/');
  const packageHash=await sidebarToolPackageHash(v3);
  const date=new Date(start),pad=x=>String(x).padStart(2,'0');
  const day=[date.getFullYear(),pad(date.getMonth()+1),pad(date.getDate())].join('-');
  const desiredPolicy={kind:'site-budget.v3',enabled:true,whitelist:[],
    sites:[{host:'example.com',subdomains:true,enabled:true,pool:'s:example.com',
      conditions:[{type:'constant-deny'}]}]};
  f.local.set(MANAGED_SITE_BUDGET_STORE,{[id]:{
    slot:0,epoch:'epoch-a',source:null,packageHash,
    kind:'site-budget.v3',policy:desiredPolicy,modelRef:null,sealedModel:null,
    desiredPolicyRev:2,appliedPolicyRev:2,status:'applied',
    day,clockHighWater:0,usage:{},checkpoint:null,
    notices:{day,pools:{}}
  }});
  await f.service.run({boot:true});
  const suspended=f.local.get(MANAGED_SITE_BUDGET_STORE)[id];
  assert.equal(suspended.policy.enabled,true,'review gap is not the user STOP intent');
  assert.equal(suspended.status,'inactive','never report native effects without app-site grant');
  assert.equal((await f.service.dispatch(await f.msg('getStatus'),f.sender)).siteReviewActive,false);
  assert.equal(suspended.desiredPolicyRev,2,'native reconcile must not advance app policy revision');
  assert.deepEqual(f.rules,[],'Chrome extension-wide origins cannot substitute for app review');
  const review=epoch=>f.local.set(MANAGED_SITE_REVIEWED_SCOPE_STORE,{
    [id]:{installEpoch:epoch,packageHash,
      sites:[{host:'example.com',subdomains:true}]}
  });
  review('epoch-a');
  await f.service.run({boot:true});
  assert.equal(f.rules.length,1);
  assert.equal(f.rules[0].action.redirect.extensionPath,
    '/managed-site/blocked-always.html');
  assert.equal(f.local.get(MANAGED_SITE_BUDGET_STORE)[id].status,'applied');
  assert.equal((await f.service.dispatch(await f.msg('getStatus'),f.sender)).siteReviewActive,true);
  f.local.set(TOOL_REVOCATION_EPOCHS_STORE,{[id]:'epoch-b'});
  await f.service.run({boot:true});
  assert.equal(f.local.get(MANAGED_SITE_BUDGET_STORE)[id].policy.enabled,true);
  assert.equal(f.local.get(MANAGED_SITE_BUDGET_STORE)[id].desiredPolicyRev,2);
  assert.deepEqual(f.rules,[],'previous generation review never leaks native DNR');
  assert.equal((await f.service.dispatch(await f.msg('getStatus'),f.sender)).siteReviewActive,false);
  review('epoch-b');
  await f.service.run({boot:true});
  assert.equal(f.rules.length,1,'trusted reviewed generation may rebind safely');
  assert.equal(f.local.get(MANAGED_SITE_BUDGET_STORE)[id].desiredPolicyRev,2);
});

test('same-source v3 package upgrade journals and rebinds reviewed sites without new grant',async()=>{
  const policy={kind:'site-budget.v3',enabled:true,whitelist:[],
    sites:[{host:'example.com',subdomains:true,enabled:true,
      pool:'s:example.com',conditions:[{type:'counter-limit',limitMs:60000}]}]};
  const before=tool('1.1.0',{kind:'site-budget.v3',suggestions:[]});
  const candidate=tool('1.1.1',{kind:'site-budget.v3',suggestions:[]});
  const f=fixture([before]),marketId='opendesk/'+id;
  const fromHash=await sidebarToolPackageHash(before);
  const toHash=await sidebarToolPackageHash(candidate);
  const date=new Date(start),pad=n=>String(n).padStart(2,'0');
  const day=[date.getFullYear(),pad(date.getMonth()+1),pad(date.getDate())].join('-');
  f.local.set(MARKET_PROVENANCE_STORE,{[id]:{marketId,sha256:fromHash,version:before.version}});
  f.local.set(MANAGED_SITE_REVIEWED_SCOPE_STORE,{[id]:{installEpoch:'epoch-a',
    packageHash:fromHash,sites:[{host:'example.com',subdomains:true}]}});
  f.local.set(MANAGED_SITE_BUDGET_STORE,{[id]:{
    slot:0,epoch:'epoch-a',source:marketId,packageHash:fromHash,
    kind:'site-budget.v3',policy,modelRef:null,sealedModel:null,
    desiredPolicyRev:3,appliedPolicyRev:3,status:'applied',day,
    clockHighWater:start,usage:{'s:example.com':30000},
    checkpoint:null,notices:{day,pools:{}}
  }});
  const operationId='123e4567-e89b-42d3-a456-426614174999';
  const installed=await installReviewedSidebarTool({api:f.api,lockManager:f.lockManager,
    candidate,baseline:before,reviewApproved:true,approveUpdate:async()=>true,
    market:{marketId,sha256:toHash,operationId}});
  assert.equal(installed.state,'installed');
  const nextEpoch=f.local.get(TOOL_REVOCATION_EPOCHS_STORE)[id];
  assert.notEqual(nextEpoch,'epoch-a');
  const scopes=f.local.get(MANAGED_SITE_REVIEWED_SCOPE_STORE);
  assert.deepEqual(scopes[id],{installEpoch:nextEpoch,packageHash:toHash,
    sites:[{host:'example.com',subdomains:true}]});
  assert.deepEqual(f.local.get(MANAGED_SITE_BUDGET_STORE)[id].usage,
    {'s:example.com':30000},'no ledger reset or double counting at installer boundary');
  await f.service.run({boot:true});
  const after=f.local.get(MANAGED_SITE_BUDGET_STORE)[id];
  assert.equal(after.policy.enabled,true);
  assert.equal(after.desiredPolicyRev,3,'native reconcile never changes app policy revision');
  assert.equal(after.usage['s:example.com'],30000,'usage carried across epoch');
});

test('ambiguous v3 grant rebind resumes via the original market journal once only',async()=>{
  const policy={kind:'site-budget.v3',enabled:false,sites:[],whitelist:[]};
  const before=tool('1.2.0',{kind:'site-budget.v3',suggestions:[]});
  const candidate=tool('1.2.1',{kind:'site-budget.v3',suggestions:[]});
  const f=fixture([before]),marketId='opendesk/'+id;
  const fromHash=await sidebarToolPackageHash(before);
  const toHash=await sidebarToolPackageHash(candidate);
  const date=new Date(start),pad=n=>String(n).padStart(2,'0');
  const day=[date.getFullYear(),pad(date.getMonth()+1),pad(date.getDate())].join('-');
  f.local.set(MARKET_PROVENANCE_STORE,{[id]:{marketId,sha256:fromHash,version:before.version}});
  f.local.set(MANAGED_SITE_REVIEWED_SCOPE_STORE,{[id]:{installEpoch:'epoch-a',
    packageHash:fromHash,sites:[{host:'example.com',subdomains:true}]}});
  f.local.set(MANAGED_SITE_BUDGET_STORE,{[id]:{
    slot:0,epoch:'epoch-a',source:marketId,packageHash:fromHash,kind:'site-budget.v3',
    policy,modelRef:null,sealedModel:null,desiredPolicyRev:4,appliedPolicyRev:4,
    status:'inactive',day,clockHighWater:start,usage:{},checkpoint:null,
    notices:{day,pools:{}}
  }});
  let failOnce=true;
  const save=f.api.storage.local.set;
  f.api.storage.local.set=async value=>{
    if(failOnce&&Object.hasOwn(value,MANAGED_SITE_REVIEWED_SCOPE_STORE)){
      failOnce=false;throw new Error('simulated storage interruption');
    }
    return save(value);
  };
  const operationId='123e4567-e89b-42d3-a456-426614174998';
  await assert.rejects(installReviewedSidebarTool({api:f.api,lockManager:f.lockManager,
    candidate,baseline:before,reviewApproved:true,approveUpdate:async()=>true,
    market:{marketId,sha256:toHash,operationId}}),{code:'E_OUTCOME_UNKNOWN'});
  assert.equal(f.local.get(SIDEBAR_TOOL_STORE)[0].version,'1.2.1');
  assert.equal(f.local.get(MANAGED_SITE_REVIEWED_SCOPE_STORE)[id].installEpoch,'epoch-a',
    'failed site grant must remain old, never guessed committed');
  const recovered=await recoverMarketOperation({api:f.api,lockManager:f.lockManager,operationId});
  assert.equal(recovered.state,'succeeded');
  const newEpoch=f.local.get(TOOL_REVOCATION_EPOCHS_STORE)[id];
  assert.equal(f.local.get(MANAGED_SITE_REVIEWED_SCOPE_STORE)[id].installEpoch,newEpoch);
  assert.deepEqual((await recoverMarketOperation({
    api:f.api,lockManager:f.lockManager,operationId})).state,'succeeded');
  await f.service.run({boot:true});
  assert.equal(f.local.get(MANAGED_SITE_BUDGET_STORE)[id].policy.enabled,false,
    'upgrade recovery must preserve explicit STOP');
  assert.deepEqual(f.rules,[],'STOP cannot revive restrictions');
});
