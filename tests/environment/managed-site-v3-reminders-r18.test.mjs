import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeManagedSiteV3Policy}
  from '../../src/framework/sdk/site-budget-v3-policy.js';
import {nextManagedSiteV3Reminder,normalizeManagedSiteV3Notices}
  from '../../src/framework/sdk/site-budget-v3-reminders.js';
const site={host:'example.com',subdomains:true,enabled:true,pool:'g:shared',
  conditions:[{type:'counter-limit',limitMs:30*60000}]};
const policy=normalizeManagedSiteV3Policy({kind:'site-budget.v3',enabled:true,
  sites:[site],whitelist:[],reminderMinutes:[1,5,10]});
const query=(record,before,after,day='2026-10-23')=>nextManagedSiteV3Reminder({
  policy,site:policy.sites[0],record,day,
  previousUsage:{'g:shared':before*60000},currentUsage:{'g:shared':after*60000}});
test('finite app-selected thresholds remain normalized, code-free and independent of Focus',()=>{
  assert.deepEqual(policy.reminderMinutes,[10,5,1]);
  assert.throws(()=>normalizeManagedSiteV3Policy({...policy,reminderMinutes:[0,5]}),
    {code:'E_SITE_BUDGET_V3_POLICY'});
  assert.throws(()=>normalizeManagedSiteV3Policy({...policy,reminderMinutes:[10,10]}),
    {code:'E_SITE_BUDGET_V3_POLICY'});
});
test('crossing threshold writes durable dedupe before optional delivery',()=>{
  const first=query(undefined,19,21);
  assert.deepEqual(first.reminder,{minutes:10,pool:'g:shared',day:'2026-10-23'});
  assert.deepEqual(first.notices.pools['g:shared'].thresholds,[10]);
  assert.equal(query(first.notices,19,21).reminder,null,'restart cannot duplicate');
  const second=query(first.notices,24,29);
  assert.equal(second.reminder.minutes,1,'crossed 5m and 1m: show most urgent');
  assert.deepEqual(second.notices.pools['g:shared'].thresholds,[10,5,1]);
  assert.equal(query(second.notices,29,30).reminder,null,'exhausted budget does not alert');
  assert.equal(query(second.notices,0,1,'2026-10-24').reminder,null,'day reset');
});
test('a valid ledger cannot silently discard a corrupted notice record',()=>{
  assert.deepEqual(normalizeManagedSiteV3Notices(undefined,'2026-10-23'),{
    day:'2026-10-23',pools:{}});
  for(const bad of [{day:'2026-10-23',pools:{'g:shared':{limitMs:1,thresholds:[]}}},
    {day:'2026-10-23',pools:{'bad':{limitMs:60000,thresholds:[]}}}])
    assert.throws(()=>normalizeManagedSiteV3Notices(bad,'2026-10-23'),
      {code:'E_SITE_BUDGET_V3_NOTICES'});
});
