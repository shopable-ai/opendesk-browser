import test from 'node:test';
import assert from 'node:assert/strict';
import {observeManagedForeground,settleManagedSiteBudget,reconcileManagedDynamicRules}
  from '../../src/platform/chrome/browser-managed-site-policy.js';

test('foreground observation bills only an approved, active, focused normal tab',async()=>{
  let idle='active',focused=true,allowed=true;
  const api={idle:{queryState:async seconds=>{assert.equal(seconds,60);return idle;}},
    windows:{getLastFocused:async()=>({id:4,focused,type:'normal',incognito:false})},
    tabs:{query:async()=>[{id:8,windowId:4,url:'https://work.example/path?secret=red',incognito:false}]},
    permissions:{contains:async ({origins})=>{assert.deepEqual(origins,['https://work.example/*']);return allowed;}}};
  const args={ready:true,hostFromUrl:url=>new URL(url).hostname,
    siteForHost:host=>host==='work.example'?{host,enabled:true}:null};
  assert.deepEqual(await observeManagedForeground(api,args),
    {host:'work.example',site:{host:'work.example',enabled:true},tabId:8,windowId:4});
  allowed=false;
  assert.equal(await observeManagedForeground(api,args),null);
  allowed=true;focused=false;
  assert.equal(await observeManagedForeground(api,args),null);
  focused=true;idle='locked';
  assert.equal(await observeManagedForeground(api,args),null);
  assert.equal(await observeManagedForeground(api,{...args,ready:false}),null);
});

test('shared site-budget settlement is conservative on boot, idle, day and clock rollback',()=>{
  const at=Date.parse('2026-10-19T10:00:00Z'),site={host:'work.example',group:'shared'};
  const current={site,host:site.host,tabId:8,windowId:4};
  const settings={dayFor:ms=>new Date(ms).toISOString().slice(0,10),
    poolFor:s=>'g:'+s.group,matchSite:(_state,host)=>host===site.host?site:null,
    blockedAt:()=>false,maxGapMs:45000};
  const state={enabled:true,day:'2026-10-19',clockHighWater:0,checkpoint:null,usage:{}};
  const charge=(time,extra={})=>settleManagedSiteBudget(state,
    {at:time,session:'browser-1',current,...extra},settings);
  charge(at);charge(at+30000);
  assert.equal(state.usage['g:shared'],30000);
  charge(at+60000,{boot:true});
  assert.equal(state.usage['g:shared'],30000,'Worker gap is never billed');
  charge(at+120000);
  assert.equal(state.usage['g:shared'],30000,'sleep longer than max gap is discarded');
  charge(at+110000);
  assert.equal(state.usage['g:shared'],30000,'clock rollback is discarded');
  const nextDay=Date.parse('2026-10-20T00:00:00Z');
  charge(nextDay);
  assert.equal(state.day,'2026-10-20');
  assert.deepEqual(state.usage,{});
});

test('managed DNR only modifies owned rules and requires native readback',async()=>{
  const competing={id:950001,priority:1,action:{type:'block'},condition:{resourceTypes:['main_frame']}};
  const owned={id:730000,priority:24,action:{type:'block'},condition:{resourceTypes:['main_frame']}};
  let rules=[competing],writes=0,dropWrite=false;
  const api={declarativeNetRequest:{
    getDynamicRules:async()=>structuredClone(rules),
    updateDynamicRules:async({removeRuleIds,addRules})=>{
      writes++;
      if(!dropWrite)rules=[...rules.filter(x=>!removeRuleIds.includes(x.id)),...structuredClone(addRules)];
    }}};
  const call=wanted=>reconcileManagedDynamicRules(api,{wanted,
    ownsRule:id=>Number.isInteger(id)&&id>=730000&&id<=730199,
    signature:row=>JSON.stringify(row)});
  assert.deepEqual(await call([owned]),{changed:true,ruleIds:[730000],verified:true});
  assert.equal((await call([owned])).changed,false);
  assert.equal(writes,1);
  assert.deepEqual(rules.find(r=>r.id===competing.id),competing);
  await assert.rejects(call([competing]),{code:'E_MANAGED_DNR_SCOPE'});
  await assert.rejects(call([owned,owned]),{code:'E_MANAGED_DNR_SCOPE'});
  dropWrite=true;
  await assert.rejects(call([]),{code:'E_MANAGED_DNR_MISMATCH'});
  assert.deepEqual(rules.find(r=>r.id===competing.id),competing);
  dropWrite=false;
  assert.deepEqual(await call([]),{changed:true,ruleIds:[],verified:true});
  assert.deepEqual(rules,[competing]);
});

import {subscribeManagedSiteActivity} from '../../src/platform/chrome/managed-site-lifecycle.js';
test('shared MV3 managed-site activity hooks resume and invalidate without another Worker',()=>{
  const event=()=>{const handlers=new Set();return {addListener:f=>handlers.add(f),
    removeListener:f=>handlers.delete(f),emit:(...args)=>[...handlers].forEach(f=>f(...args)),
    get count(){return handlers.size;}};};
  const api={alarms:{onAlarm:event()},tabs:{onActivated:event(),onUpdated:event(),onRemoved:event()},
    windows:{onFocusChanged:event()},idle:{onStateChanged:event()},
    permissions:{onRemoved:event(),onAdded:event()},runtime:{onStartup:event()},
    storage:{onChanged:event()}};
  let invalidated=0;const runs=[],removed=[],stored=[];
  const dispose=subscribeManagedSiteActivity(api,{alarmName:'managed.a',
    invalidate:()=>{invalidated++;},run:args=>runs.push(args??null),
    onPermissionRemoved:change=>removed.push(change),
    onStorageChanged:(changes,area)=>stored.push({changes,area})});
  assert.deepEqual(runs,[{boot:true}]);
  api.alarms.onAlarm.emit({name:'other'});
  assert.equal(runs.length,1,'other app alarm cannot wake this service');
  api.tabs.onUpdated.emit(2,{status:'loading'});
  assert.equal(invalidated,0);
  api.tabs.onActivated.emit({tabId:2});
  api.tabs.onUpdated.emit(2,{url:'https://example.com/'});
  api.windows.onFocusChanged.emit(1);
  api.idle.onStateChanged.emit('idle');
  api.permissions.onAdded.emit({});
  assert.equal(invalidated,5);
  api.alarms.onAlarm.emit({name:'managed.a'});
  assert.equal(runs.length,7);
  api.permissions.onRemoved.emit({permissions:['idle']});
  api.storage.onChanged.emit({key:{newValue:1}},'local');
  assert.deepEqual(removed,[{permissions:['idle']}]);
  assert.deepEqual(stored,[{changes:{key:{newValue:1}},area:'local'}]);
  api.runtime.onStartup.emit();
  assert.deepEqual(runs.at(-1),{boot:true});
  dispose();
  assert.equal(api.tabs.onActivated.count,0);
  const before=runs.length;
  api.tabs.onActivated.emit({tabId:3});
  assert.equal(runs.length,before,'disposed service cannot resurrect');
});

// The public Chrome execution path is shared; an app may only supply a
// precompiled owned-rule adapter. No tool package JavaScript runs here.
import {reconcileManagedSiteExecution,redirectManagedBlockedTabs}
  from '../../src/platform/chrome/browser-managed-site-policy.js';
test('managed-site execution coordinates verified DNR, alarm and tab remediation without touching other owners',async()=>{
  const foreign={id:950001,priority:1,action:{type:'block'},condition:{resourceTypes:['main_frame']}};
  const owned={id:730001,priority:1,action:{type:'block'},condition:{resourceTypes:['main_frame']}};
  let native=[foreign],writes=0,remediations=0;
  const alarms=new Map();
  const api={declarativeNetRequest:{
    getDynamicRules:async()=>structuredClone(native),
    updateDynamicRules:async({removeRuleIds,addRules})=>{
      writes++;native=[...native.filter(x=>!removeRuleIds.includes(x.id)),...structuredClone(addRules)];
    }},alarms:{
    get:async name=>alarms.get(name),
    create:async(name,options)=>{alarms.set(name,options);},
    clear:async name=>alarms.delete(name)
  }};
  const reconcileRules=wanted=>reconcileManagedDynamicRules(api,{wanted,
    ownsRule:id=>Number.isInteger(id)&&id>=730000&&id<=730199,
    signature:row=>JSON.stringify(row)});
  const run=(wanted,active)=>reconcileManagedSiteExecution(api,{
    alarmName:'managed.focus',active,dnrAvailable:true,wanted,reconcileRules,
    onRuleChange:async()=>{remediations++;return {moved:1,failed:0};}
  });
  const started=await run([owned],true);
  assert.equal(started.ruleReceipt.verified,true);
  assert.deepEqual(started.tabs,{moved:1,failed:0});
  assert.equal(remediations,1);
  assert.deepEqual(alarms.get('managed.focus'),{periodInMinutes:0.5});
  await run([owned],true);
  assert.equal(writes,1,'same managed rules are not reinstalled');
  assert.equal(remediations,1,'no repeat navigation on an unchanged DNR set');
  await run([],false);
  assert.equal(alarms.has('managed.focus'),false);
  assert.deepEqual(native,[foreign],'foreign DNR rules survive independent app shutdown');
  assert.equal(remediations,1,'clearing a policy never moves tabs');

  let alarmStarted=false;
  await assert.rejects(reconcileManagedSiteExecution({alarms:{
    get:async()=>null,create:async()=>{alarmStarted=true;},clear:async()=>{}
  }},{alarmName:'managed.focus',active:true,dnrAvailable:true,wanted:[owned],
    reconcileRules:async()=>{throw Object.assign(new Error('readback mismatch'),
      {code:'E_FOCUS_DNR_MISMATCH'});}}),{code:'E_FOCUS_DNR_MISMATCH'});
  assert.equal(alarmStarted,false,'failed native readback cannot start new enforcement');
});

test('shared managed-site execution repairs stale persisted Chrome Alarm cadence',async()=>{
  const alarms=new Map([['managed.focus',{periodInMinutes:30}],
    ['other-app.alarm',{periodInMinutes:1}]]);
  let created=0;
  const api={alarms:{
    get:async name=>alarms.get(name),
    create:async(name,options)=>{created++;alarms.set(name,options);},
    clear:async name=>{alarms.delete(name);}
  }};
  const run=active=>reconcileManagedSiteExecution(api,{
    alarmName:'managed.focus',active,dnrAvailable:true,wanted:[],
    reconcileRules:async()=>({changed:false,ruleIds:[],verified:true})
  });
  await run(true);
  assert.equal(created,1,'a stale 30-minute alarm must not silently disable budget settlement');
  assert.deepEqual(alarms.get('managed.focus'),{periodInMinutes:0.5});
  await run(true);
  assert.equal(created,1,'correct alarm survives periodic Worker reconciliation');
  await run(false);
  assert.equal(alarms.has('managed.focus'),false);
  assert.deepEqual(alarms.get('other-app.alarm'),{periodInMinutes:1},
    'stopping one app never clears another app alarm');
});

test('shared managed-site execution refuses unverified native alarm effects',async()=>{
  const alarms=new Map();
  let dropCreate=true,dropClear=false,remediation=0;
  const api={alarms:{
    get:async name=>alarms.get(name),
    create:async(name,options)=>{if(!dropCreate)alarms.set(name,options);},
    clear:async name=>{if(!dropClear)alarms.delete(name);}
  }};
  const run=active=>reconcileManagedSiteExecution(api,{
    alarmName:'managed.focus',active,dnrAvailable:true,wanted:[],
    reconcileRules:async()=>({changed:false,ruleIds:[],verified:true}),
    onRuleChange:async()=>{remediation++;return {moved:1,failed:0};}
  });
  await assert.rejects(run(true),{code:'E_MANAGED_ALARM_UNVERIFIED'});
  assert.equal(remediation,0,'unverified heartbeat cannot be reported as success');
  dropCreate=false;
  await run(true);
  dropClear=true;
  await assert.rejects(run(false),{code:'E_MANAGED_ALARM_UNVERIFIED'});
  assert.ok(alarms.has('managed.focus'),'failure is observable and safe to retry');
  dropClear=false;
  await run(false);
  assert.equal(alarms.has('managed.focus'),false);
  await assert.rejects(reconcileManagedSiteExecution(api,{
    alarmName:'managed.focus',active:false,dnrAvailable:true,
    wanted:[{id:730000}],reconcileRules:async()=>{throw Error('must not reconcile');}
  }),TypeError,'stopped apps must not publish stale blocking rules');
});

test('shared blocked-tab remediation permits only extension-owned fixed pages',async()=>{
  const base='chrome-extension://abcdefghijklmnopabcdefghijklmnop/';
  const moved=[];
  const api={runtime:{getURL:path=>base+path},tabs:{
    query:async()=>[
      {id:1,url:'https://blocked.example/other'},
      {id:2,url:'https://other.example/'},
      {id:3,url:'https://blocked.example/private',incognito:true}
    ],
    update:async(id,options)=>moved.push({id,url:options.url})
  }};
  const target=base+'stay-focus/blocked-quota.html';
  const result=await redirectManagedBlockedTabs(api,{redirectUrlForTab:tab=>
    tab.url.includes('blocked.example')?target:null});
  assert.deepEqual(result,{moved:1,failed:0});
  assert.deepEqual(moved,[{id:1,url:target}]);
  await assert.rejects(redirectManagedBlockedTabs(api,{redirectUrlForTab:()=>
    'https://external.example/redirect'}),{code:'E_MANAGED_REDIRECT_SCOPE'});
  assert.equal(moved.length,1,'invalid destinations never reach tabs.update');
});
