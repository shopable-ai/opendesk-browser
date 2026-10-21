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
import {MANAGED_SITE_BUDGET_PROTOCOL} from '../../src/platform/host/managed-site-runtime-contract.js';
import {normalizeBrowserOperation} from '../../src/framework/sdk/browser-contract.js';
import {installReviewedSidebarTool} from '../../src/ui/sidebar-tools/installation.js';

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
  const msg=async(operation,args={},row=local.get(SIDEBAR_TOOL_STORE)[0],epoch='epoch-a')=>({
    protocol:MANAGED_SITE_BUDGET_PROTOCOL,toolId:id,operation,args,
    packageHash:await sidebarToolPackageHash(row),installEpoch:epoch
  });
  return {api,service,sender,local,session,alarms,rules,writes,lockManager,msg,
    tick:ms=>{time+=ms;},setUrl:v=>{url=v;},allow:v=>{permissions=v;},
    fault:v=>{dropNative=v;},faultAlarm:v=>{dropAlarm=v;}};
}
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
