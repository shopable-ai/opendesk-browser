import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createDemoApi} from '../services/ai-account-usage/web/demo-data.mjs';
import {evaluateHistory, reliableEstimate, windowOptions, selectedWindow,
  canShowWorkspaceGuidance, knownCycles, projectAccountView, summarizeVisibleAccounts} from '../services/ai-account-usage/web/usage-insights.mjs';

const api=createDemoApi();
async function sample(alias,windowKey) {
  const accounts=await api.accounts();
  const account=accounts.find(row=>row.alias===alias);
  const history=await api.history(alias,{limit:500});
  const choice=windowKey?{key:windowKey}:selectedWindow(account,history);
  return {account,history,choice,stats:evaluateHistory(history.rollovers,choice?.key)};
}
test('spare Pro: 7 recognized close samples, >=80 at least 3, flagged', async()=>{
  const s=await sample('spare_pro');
  assert.equal(s.stats.fixedCount,7);
  assert.equal(s.stats.reliableCount,7);
  assert.equal(s.stats.highCount,7);
  assert.equal(s.stats.decision,'attention');
  assert.ok(s.stats.average>=80 && s.stats.average<=100);
});
test('decreasing usage: high remainder falls, no permanent underuse alarm', async()=>{
  const s=await sample('falling');
  assert.equal(s.stats.reliableCount,7);
  assert.equal(s.stats.highCount,2);
  assert.equal(s.stats.decision,'observe');
  assert.ok(s.stats.displayed[0].nearResetUnusedEstimatePercent > s.stats.displayed.at(-1).nearResetUnusedEstimatePercent);
});
test('seven recognized events with exactly four reliable and three high', async()=>{
  const s=await sample('partial');
  assert.equal(s.stats.fixedCount,7);assert.equal(s.stats.reliableCount,4);
  assert.equal(s.stats.highCount,3);assert.equal(s.stats.decision,'attention');
  assert.equal(knownCycles(s.history.rollovers,s.choice.key).length,7);
  assert.equal(s.history.rollovers.filter(x=>x.type==='FORECAST_MOVED_UNCONFIRMED').length,1);
});
test('one reliable observation is insufficient even when 97% remains', async()=>{
  const s=await sample('single');
  assert.equal(s.stats.reliableCount,1);assert.equal(s.stats.highCount,1);
  assert.equal(s.stats.decision,'insufficient');
});
test('no historical events and no window never imply 0 percent', async()=>{
  const s=await sample('none');
  assert.equal(s.choice,null);assert.equal(s.stats.average,null);
  assert.equal(s.stats.decision,'insufficient');
  assert.equal(s.stats.displayed.length,0);
});
test('short and long windows are separate, no cross-window averaging', async()=>{
  const s=await sample('spare_pro');
  const windows=windowOptions(s.account,s.history);
  assert.equal(windows.length,2);
  const a=evaluateHistory(s.history.rollovers,windows[0].key);
  const b=evaluateHistory(s.history.rollovers,windows[1].key);
  assert.equal(a.fixedCount,7);assert.equal(b.fixedCount,7);
  assert.notEqual(a.average,b.average);
  assert.notEqual(selectedWindow(s.account,s.history,'short').key,selectedWindow(s.account,s.history,'long').key);
});
test('query failure preserves independent history',async()=>{
  const s=await sample('unavailable');
  assert.equal(s.account.lastAttempt.status,'UNAVAILABLE');
  assert.equal(s.stats.reliableCount,7);
  assert.equal(s.stats.decision,'attention');
});
test('missing email and expiration never inferred; no individual invite',async()=>{
  const s=await sample('unknown');
  assert.equal(s.account.identity,null);
  assert.equal(s.account.subscription.membershipExpiresAt,null);
  assert.equal(canShowWorkspaceGuidance(s.account),false);
  const b=await sample('business');
  assert.equal(canShowWorkspaceGuidance(b.account),true);
});
test('view range 7 / 10 / 20 does not change fixed 7-cycle decision',async()=>{
  const s=await sample('partial');
  for(const n of [7,10,20]){
    const r=evaluateHistory(s.history.rollovers,s.choice.key,n);
    assert.equal(r.displayedCount,n);
    assert.equal(r.highCount,3);
    assert.equal(r.reliableCount,4);
    assert.equal(r.decision,'attention');
  }
});
test('value 0 is reliable, unknown is not 0, crossed but unverified is excluded',()=>{
  const base={windowKey:'x',type:'CROSSED_PREDICTED_RESET',estimateQuality:'NEAR_RESET_OBSERVATION',
    lastPreResetSampleAt:'2026-01-01T00:00:00Z',leadSeconds:10,nearResetUnusedEstimatePercent:0,
    priorResetsAt:'2026-01-01T00:01:00Z'};
  assert.equal(reliableEstimate(base),true);
  assert.equal(reliableEstimate({...base,nearResetUnusedEstimatePercent:null}),false);
  assert.equal(reliableEstimate({...base,nearResetUnusedEstimatePercent:'0'}),false);
  assert.equal(reliableEstimate({...base,type:'CROSSED_BUT_UNVERIFIED'}),false);
  assert.equal(evaluateHistory([base,{...base,type:'FORECAST_MOVED_UNCONFIRMED',nearResetUnusedEstimatePercent:99}],'x').average,0);
});
test('demo remains isolated, never returns a live refresh success',async()=>{
  await assert.rejects(api.refresh('spare_pro'),/演示模式/);
  await assert.rejects(api.history('does_not_exist'),/演示账号不存在/);
});
test('source gates keep direct network quota query explicit only',async()=>{
  const ui=await readFile(new URL('../services/ai-account-usage/web/main.jsx',import.meta.url),'utf8');
  const build=await readFile(new URL('../services/ai-account-usage/web/build.mjs',import.meta.url),'utf8');
  assert.equal((ui.match(/api\.refresh\(/g)||[]).length,1);
  assert.match(build,/__OD_PREVIEW__/);
  assert.match(ui,/role="group"/);
  assert.doesNotMatch(ui,/localStorage|sessionStorage|document\.cookie|Authorization/);
});

test('manager label is stable and separate from failed status and identity provenance',async()=>{
  const accounts=await api.accounts();
  const failed=accounts.find(x=>x.alias==='unavailable');
  assert.equal(failed.displayName,'运营 Pro');
  assert.equal(failed.identity.email,'stale@example.com');
  assert.equal(failed.identity.displayName,null);
  assert.equal(failed.identity.displayNameSource,'UNKNOWN');
  assert.equal(failed.lastAttempt.status,'UNAVAILABLE');
  assert.equal(accounts.filter(x=>x.displayName==='最近查询失败').length,0);
});
test('totals and filters use exactly the same per-account window as displayed rows',async()=>{
  const accounts=await api.accounts();
  const records=Object.fromEntries(await Promise.all(accounts.map(async a=>[
    a.alias,{status:'ready',data:await api.history(a.alias,{limit:500})}
  ])));
  for(const scope of ['all','short','long']){
    const projections=accounts.map(a=>projectAccountView(a,records[a.alias],scope));
    const totals=summarizeVisibleAccounts(accounts,records,scope);
    assert.equal(totals.attention,projections.filter(x=>x.state==='attention').length);
    assert.equal(totals.insufficient,projections.filter(x=>x.state==='insufficient').length);
    assert.equal(totals.notApplicable,projections.filter(x=>x.state==='not-applicable').length);
    assert.equal(totals.loaded,accounts.length);
    const filtered=accounts.filter(a=>projectAccountView(a,records[a.alias],scope).state==='attention');
    assert.equal(summarizeVisibleAccounts(filtered,records,scope).attention,filtered.length);
  }
  const onlyLong=accounts.find(a=>a.alias==='weekly_only');
  const noShort=projectAccountView(onlyLong,records.weekly_only,'short');
  const hasLong=projectAccountView(onlyLong,records.weekly_only,'long');
  assert.equal(noShort.state,'not-applicable');
  assert.equal(noShort.summary,null);
  assert.equal(hasLong.state,'attention');
  assert.notEqual(hasLong.summary.average,null);
});
test('history read failure differs from insufficient evidence and preserves last cache',async()=>{
  const accounts=await api.accounts();
  const account=accounts.find(x=>x.alias==='unavailable');
  const history=await api.history(account.alias,{limit:500});
  assert.equal(projectAccountView(account,{status:'ready',data:history}).state,'attention');
  assert.equal(projectAccountView(account,{status:'error'}).state,'error');
  const totals=summarizeVisibleAccounts([account],{[account.alias]:{status:'error'}},'all');
  assert.equal(totals.errors,1);
  assert.equal(totals.insufficient,0);
  assert.ok(account.windows.length>0);
});
