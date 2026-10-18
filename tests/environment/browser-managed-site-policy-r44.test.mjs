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
