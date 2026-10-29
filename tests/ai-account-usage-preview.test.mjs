import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script, runInNewContext} from 'node:vm';

const html=readFileSync(new URL('../examples/sidebar-tools/cookie-editor/preview/ai-account-usage.html',import.meta.url),'utf8');
const code=html.match(/<script>([\s\S]*?)<\/script>/)[1];
new Script(code); // Parse the entire shipped behavior, including event handlers.
// Exercise the actual fixture/calculation code; this is NODE evidence, not browser DOM evidence.
function fixture(scenario='mixed'){
  const fields={scenario:{value:scenario},search:{value:''},accountSort:{value:'name'}};
  const scope={document:{getElementById:id=>fields[id]}};
  const end=code.indexOf('document.querySelectorAll("[data-filter]").forEach(b=>b.addEventListener');
  runInNewContext(code.slice(0,end)+'globalThis.preview={accounts,history,insight,timeline,selected,visibleAccounts,plan,historicalRow,setFilter:v=>activeFilter=v};})();',scope);
  return {...scope.preview,fields};
}
const primary='codex:primary:18000',secondary='codex:secondary:604800';

test('backup Pro 5/10 cycles match an independent sum, excluding the distant null sample',()=>{
  const p=fixture(),five=p.insight('acct_04',primary,5),ten=p.insight('acct_04',primary,10);
  const expectedFive=[99,74,80,90,100],expectedTen=[84,91,97,83,...expectedFive];
  assert.equal(five.averageNearResetRemainingPercent,expectedFive.reduce((a,b)=>a+b,0)/5);
  assert.equal(five.highUnusedCycles,4);
  assert.equal(ten.averageNearResetRemainingPercent,Math.round(expectedTen.reduce((a,b)=>a+b,0)/9*100)/100);
  assert.equal(ten.cyclesNearReset,9);
  assert.equal(ten.highUnusedCycles,8);
  assert.equal(ten.cyclesWithoutReliableEstimate,1);
  assert.equal(p.insight('acct_04',secondary,5).averageNearResetRemainingPercent,78.25);
});

test('missing estimates and unverified events cannot imply zero unused quota',()=>{
  const p=fixture(),i=p.insight('acct_07',primary,5);
  assert.equal(i.cyclesObserved,5);
  assert.equal(i.cyclesNearReset,0);
  assert.equal(i.averageNearResetRemainingPercent,null);
  assert.equal(i.cyclesWithoutReliableEstimate,5);
  assert.equal(i.unverified,2);
});

test('timeline covers every counted cycle plus interleaved unverified evidence',()=>{
  const p=fixture(),rows=p.timeline('acct_07',primary,5);
  assert.equal(rows.filter(r=>r.type==='CROSSED_PREDICTED_RESET').length,5);
  assert.equal(rows.length,7);
  assert.ok(rows.some(r=>r.type==='CROSSED_BUT_UNVERIFIED'));
  assert.ok(rows.some(r=>r.type==='FORECAST_MOVED_UNCONFIRMED'));
});

test('failure, sampling shortage and unknown plan are separate scenarios',()=>{
  assert.equal(fixture('failed').selected()[0].lastAttempt.status,'UNAVAILABLE');
  assert.equal(fixture('insufficient').selected()[0].lastAttempt.status,'OK');
  const unknown=fixture('unknown').selected()[0];
  assert.equal(unknown.providerPlan.family,'UNKNOWN');
  assert.equal(unknown.lastAttempt.status,'OK');
  assert.equal(unknown.subscription.membershipExpiresAt,null);
  assert.ok(unknown.windows.length);
});

test('administrator tier and multiplier remain separate from server evidence',()=>{
  const p=fixture(),byId=id=>p.accounts.find(a=>a.alias===id);
  assert.equal(p.plan(byId('acct_01')).tier,'Pro 200');
  assert.equal(p.plan(byId('acct_01')).rate,null);
  assert.equal(p.plan(byId('acct_04')).tier,'Pro 100');
  assert.equal(p.plan(byId('acct_04')).rate,'20x');
  assert.equal(p.plan(byId('acct_06')).tier,'Pro 500');
  assert.equal(p.plan(byId('acct_06')).adminRate,'10x');
  assert.equal(p.plan(byId('acct_06')).rate,null);
});

test('query exceptions exclude never-queried accounts; stale history labels its source',()=>{
  const p=fixture();p.setFilter('failed');
  assert.deepEqual(Array.from(p.visibleAccounts(),a=>a.alias).sort(),['acct_03','acct_06']);
  const a=p.accounts.find(a=>a.alias==='acct_06');
  assert.match(p.historicalRow(a,p.insight(a.alias,primary,5)),/历史分析，非实时余额/);
});
