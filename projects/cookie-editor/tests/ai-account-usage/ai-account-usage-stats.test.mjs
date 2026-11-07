import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyState, registerAccount, recordProbeResult, listAccounts, accountHistory}
  from '../../ai-account-usage/domain.mjs';
import {evaluateHistory, projectAccountView, summarizeVisibleAccounts}
  from '../../ai-account-usage/web/usage-insights.mjs';

// Real verified observations: an older weekly bucket followed by a busy short
// bucket. A global tail of 500 events must not hide the weekly bucket's evidence.
function crowdedHistory() {
  const alias = 'stats_account';
  let state = registerAccount(emptyState(), {alias, displayName:'Synthetic statistics'});
  const start = Date.parse('2026-01-01T00:00:00Z');
  const iso = ms => new Date(ms).toISOString();
  function probe(at, reset, usedPercent, durationSeconds, key) {
    state = recordProbeResult(state, alias, {status:'OK', mode:'COOKIE_ONLY', checkedAt:iso(at),
      sessionUserVerified:true, workspaceVerified:true, workspaceEvidence:'QUOTA_ACCOUNT_ID',
      windows:[{key, durationSeconds, usedPercent, remainingPercent:100-usedPercent, resetsAt:iso(reset)}]});
  }
  const week = 604800000;
  // Last seven: four reliable, three >=80%, three unknown (not zero).
  for (const [i, remaining] of [20,20,20,80,null,90,null,85,null,55].entries()) {
    const reset = start + (i+1)*week;
    probe(reset - (remaining === null ? 10800000 : 60000), reset, 100-(remaining ?? 90), 604800, 'secondary');
    probe(reset+1000, reset+week, 0, 604800, 'secondary');
  }
  const hour = 18000000, base = start+11*week;
  for (let i=1; i<=501; i++) {
    const reset = base+i*hour;
    probe(reset-60000, reset, 80, 18000, 'primary');
    probe(reset+1000, reset+hour, 0, 18000, 'primary');
  }
  return {state, alias, account:listAccounts(state)[0], weekly:'codex:secondary:604800', short:'codex:primary:18000'};
}

test('500-event history reads keep overview, totals and single-window details consistent', () => {
  const {state, alias, account, weekly, short} = crowdedHistory();
  const mixed = accountHistory(state, alias, {limit:500});
  const detail = accountHistory(state, alias, {limit:500, windowKey:weekly});
  const view = projectAccountView(account, {status:'ready', data:mixed}, 'long');
  assert.equal(view.state, 'attention', 'busy short-window events must not erase weekly evidence');
  assert.equal(view.summary.fixedCount, 7);
  assert.equal(view.summary.reliableCount, 4);
  assert.equal(view.summary.highCount, 3);
  assert.equal(view.summary.average, 77.5, 'unknown cycles do not enter the mean as zero');
  for (const count of [7,10,20]) {
    const summary = evaluateHistory(detail.rollovers, weekly, count);
    assert.equal(summary.decision, 'attention');
    for (const key of ['fixedCount','reliableCount','highCount','average'])
      assert.equal(view.summary[key], summary[key], key);
    assert.equal(summary.displayed.length, Math.min(count,10));
  }
  const totals = summarizeVisibleAccounts([account], {[alias]:{status:'ready', data:mixed}}, 'long');
  assert.equal(totals.attention, 1);
  assert.equal(totals.insufficient, 0);
  assert.equal(evaluateHistory(mixed.rollovers,short).decision, 'observe', 'independent buckets never merge');
  assert.equal(detail.rollovers.length, 10);
  assert.equal(detail.rollovers.every(row=>row.windowKey===weekly), true);
  for (const key of [weekly,short]) {
    for (const field of ['observations','rollovers']) {
      const expected = accountHistory(state,alias,{limit:500,windowKey:key})[field];
      assert.deepEqual(mixed[field].filter(row=>row.windowKey===key), expected);
      assert.ok(expected.length<=500);
    }
  }
  assert.throws(()=>accountHistory(state,alias,{limit:501}), /E_LIMIT/);
});

// Exercise the writer and reader together, without storage, clocks or upstream IO.
function sameWindowHistory({cycles=7, diagnostics=501, unknownLast=false, crossed=false}={}) {
  const alias = 'same_window';
  const windowKey = 'codex:secondary:604800';
  let state = registerAccount(emptyState(), {alias, displayName:'Same window statistics'});
  const week = 604800000, start = Date.parse('2026-01-01T00:00:00Z');
  const iso = ms => new Date(ms).toISOString();
  function probe(at, reset, usedPercent) {
    state = recordProbeResult(state, alias, {status:'OK', mode:'COOKIE_ONLY', checkedAt:iso(at),
      sessionUserVerified:true, workspaceVerified:true, workspaceEvidence:'QUOTA_ACCOUNT_ID',
      windows:[{key:'secondary', durationSeconds:604800, usedPercent,
        remainingPercent:100-usedPercent, resetsAt:iso(reset)}]});
  }
  for (let i=1; i<=cycles; i++) {
    const reset = start+i*week;
    probe(reset-(unknownLast && i===cycles ? 10800000 : 60000), reset, 10);
    probe(reset+1000, reset+week, 0);
  }
  let reset = start+(cycles+1)*week;
  let at = start+cycles*week+1000;
  for (let i=0; i<diagnostics; i++) {
    at = crossed ? reset+1000 : at+1000;
    reset += week;
    // Stable nonzero counters can cross a boundary, but do not prove a reset.
    probe(at, reset, 10);
  }
  return {state, alias, windowKey, account:listAccounts(state)[0]};
}

test('same-window diagnostic floods cannot erase seven recognized cycles on history reads', () => {
  for (const crossed of [false,true]) {
    const {state, alias, windowKey, account} = sameWindowHistory({crossed});
    assert.equal(state.rollovers.length,508);
    assert.equal(evaluateHistory(state.rollovers,windowKey).decision,'attention');
    const fullBefore = structuredClone(state);
    for (const options of [{limit:500},{limit:500,windowKey},{}]) {
      const history = accountHistory(state,alias,options);
      const summary = evaluateHistory(history.rollovers,windowKey);
      assert.equal(summary.decision,'attention', 'diagnostics cannot consume the recognized-cycle budget');
      assert.equal(summary.fixedCount,7);
      assert.equal(summary.reliableCount,7);
      assert.equal(summary.average,90);
      assert.equal(projectAccountView(account,{status:'ready',data:history},'long').state,'attention');
      assert.equal(summarizeVisibleAccounts([account],{[alias]:{status:'ready',data:history}},'long').attention,1);
      assert.equal(history.rollovers.length,7+(options.limit??100));
    }
    assert.deepEqual(state,fullBefore,'reads must not mutate domain state');
  }
});

test('history budgets preserve the latest 20 recognized cycles including unknown estimates', () => {
  const {state,alias,windowKey} = sameWindowHistory({cycles:25,unknownLast:true});
  const history = accountHistory(state,alias,{limit:20,windowKey});
  const summary = evaluateHistory(history.rollovers,windowKey,20);
  assert.equal(summary.displayed.length,20);
  assert.deepEqual(summary.displayed,state.rollovers.filter(row=>row.type==='CROSSED_PREDICTED_RESET').slice(-20));
  assert.equal(summary.fixedCount,7);
  assert.equal(summary.reliableCount,6,'unknown recognized cycles still occupy a position in the fixed seven');
  assert.equal(summary.average,90,'unknown must not become zero');
  assert.equal(summary.displayed.at(-1).nearResetUnusedEstimatePercent,null);
  assert.equal(history.rollovers.length,40,'20 recognized cycles plus 20 diagnostic events');
  assert.equal(history.observations.length,20);
  assert.deepEqual(history.rollovers,[...state.rollovers.filter(row=>row.type==='CROSSED_PREDICTED_RESET').slice(-20),
    ...state.rollovers.filter(row=>row.type!=='CROSSED_PREDICTED_RESET').slice(-20)]);
  const small = accountHistory(state,alias,{limit:1,windowKey});
  assert.equal(small.observations.length,1);
  assert.equal(small.rollovers.length,2,'explicit small limits apply separately to both classes');
  assert.equal(evaluateHistory(small.rollovers,windowKey).average,null);
});

test('maximum history reads bound both rollover classes and preserve chronological order', () => {
  const {state,alias,windowKey} = sameWindowHistory({cycles:501,diagnostics:501});
  const history = accountHistory(state,alias,{limit:500,windowKey});
  assert.equal(history.observations.length,500);
  assert.equal(history.rollovers.length,1000);
  assert.equal(history.rollovers.filter(row=>row.type==='CROSSED_PREDICTED_RESET').length,500);
  assert.equal(history.rollovers.filter(row=>row.type!=='CROSSED_PREDICTED_RESET').length,500);
  assert.deepEqual(history.rollovers,[...state.rollovers.slice(1,501),...state.rollovers.slice(-500)]);
  assert.equal(evaluateHistory(history.rollovers,windowKey,20).displayed.length,20);
  assert.equal(evaluateHistory(history.rollovers,windowKey).decision,'attention');
  assert.throws(()=>accountHistory(state,alias,{limit:501}),/E_LIMIT/);
  assert.throws(()=>accountHistory(state,alias,{limit:0}),/E_LIMIT/);
});

test('writer retains seven reliable cycles through 3010 same-window diagnostics within the 3000 cap', () => {
  const {state,alias,windowKey,account} = sameWindowHistory({diagnostics:3010});
  assert.equal(state.rollovers.length,3000);
  const recognized = state.rollovers.filter(row=>row.type==='CROSSED_PREDICTED_RESET');
  assert.equal(recognized.length,7,'diagnostic retention must not evict recognized cycles');
  assert.equal(state.rollovers.filter(row=>row.type!=='CROSSED_PREDICTED_RESET').length,2993);
  const start = Date.parse('2026-01-01T00:00:00Z'), week = 604800000;
  assert.equal(state.rollovers[7].detectedAt,new Date(start+7*week+19000).toISOString(),
    'only the latest 2993 of 3010 diagnostics survive');
  assert.equal(state.rollovers.at(-1).detectedAt,new Date(start+7*week+3011000).toISOString());
  for (const count of [7,10,20]) {
    const history = accountHistory(state,alias,{limit:500,windowKey});
    const summary = evaluateHistory(history.rollovers,windowKey,count);
    assert.equal(history.rollovers.length,507);
    assert.equal(summary.decision,'attention');
    assert.equal(summary.reliableCount,7);
    assert.equal(summary.average,90);
    assert.equal(projectAccountView(account,{status:'ready',data:history},'long').state,'attention');
  }
  assert.ok(state.rollovers.every((row,i,rows)=>i===0 || rows[i-1].detectedAt<row.detectedAt),
    'retention preserves original event order');
});

test('global diagnostic retention preserves independent accounts and windows without merging statistics', () => {
  let {state,alias,windowKey} = sameWindowHistory({diagnostics:0});
  state = registerAccount(state,{alias:'other_account',displayName:'Other account'});
  const start = Date.parse('2026-01-01T00:00:00Z'), week = 604800000, short = 18000000;
  function probe(owner,at,reset,usedPercent) {
    state = recordProbeResult(state,owner,{status:'OK',mode:'COOKIE_ONLY',checkedAt:new Date(at).toISOString(),
      sessionUserVerified:true,workspaceVerified:true,workspaceEvidence:'QUOTA_ACCOUNT_ID',
      windows:[{key:'primary',durationSeconds:18000,usedPercent,remainingPercent:100-usedPercent,
        resetsAt:new Date(reset).toISOString()}]});
  }
  for (const [owner,base,remaining] of [[alias,start+20*week,10],['other_account',start+30*week,80]]) {
    for (let i=1;i<=7;i++) {
      const reset = base+i*short;
      probe(owner,reset-60000,reset,100-remaining);
      probe(owner,reset+1000,reset+short,0);
    }
  }
  const recognizedBefore = structuredClone(state.rollovers);
  const base = start+30*week+7*short;
  for (let i=1;i<=3010;i++) probe('other_account',base+1000+i*1000,base+short+i*short,10);
  assert.equal(state.rollovers.length,3000);
  assert.deepEqual(state.rollovers.filter(row=>row.type==='CROSSED_PREDICTED_RESET'),recognizedBefore);
  for (const [owner,key,average,decision] of [[alias,windowKey,90,'attention'],
    [alias,'codex:primary:18000',10,'observe'],['other_account','codex:primary:18000',80,'attention']]) {
    const history = accountHistory(state,owner,{limit:500,windowKey:key});
    assert.ok(history.rollovers.every(row=>row.accountAlias===owner && row.windowKey===key));
    const summary = evaluateHistory(history.rollovers,key);
    assert.equal(summary.fixedCount,7);
    assert.equal(summary.average,average);
    assert.equal(summary.decision,decision);
  }
  assert.equal(accountHistory(state,'other_account',{windowKey}).rollovers.length,0);
});

test('more than 3000 recognized cycles retain only the latest cycles and no diagnostics', () => {
  const {state,alias,windowKey} = sameWindowHistory({cycles:3001,diagnostics:1,unknownLast:true});
  assert.equal(state.rollovers.length,3000);
  assert.ok(state.rollovers.every(row=>row.type==='CROSSED_PREDICTED_RESET'));
  const start = Date.parse('2026-01-01T00:00:00Z'), week = 604800000;
  assert.equal(state.rollovers[0].priorResetsAt,new Date(start+2*week).toISOString());
  assert.equal(state.rollovers.at(-1).priorResetsAt,new Date(start+3001*week).toISOString());
  assert.equal(state.rollovers.at(-1).nearResetUnusedEstimatePercent,null,
    'recognized cycles with unknown estimates receive the same retention priority');
  const history = accountHistory(state,alias,{limit:500,windowKey});
  assert.equal(history.rollovers.length,500);
  assert.equal(evaluateHistory(history.rollovers,windowKey,20).displayed.length,20);
  assert.equal(evaluateHistory(history.rollovers,windowKey).decision,'attention');
});
