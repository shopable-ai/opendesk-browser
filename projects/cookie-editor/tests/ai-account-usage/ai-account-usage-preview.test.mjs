import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script, runInNewContext} from 'node:vm';

const html=readFileSync(new URL('../../preview/ai-account-usage.html',import.meta.url),'utf8');
const code=html.match(/<script>([\s\S]*?)<\/script>/)[1];
new Script(code); // Parse the entire shipped behavior, including event handlers.
// Exercise the actual fixture/calculation code; this is NODE evidence, not browser DOM evidence.
function fixture(scenario='mixed'){
  const fields={scenario:{value:scenario},search:{value:''},sort:{value:'name'}};
  const node=id=>fields[id]??=({innerHTML:'',textContent:'',querySelectorAll:()=>[]});
  const scope={window:{},document:{getElementById:node}};
  // The former listener spelling and retired helper names made all six tests
  // fail in the VM before any behavior ran. Export today's actual functions;
  // leave rendering logic intact and stub only external DOM/chart surfaces.
  const end=code.indexOf('// All controls below operate only on simulated data and local UI state.');
  assert.ok(end>0,'fixture must stop before UI event registration');
  runInNewContext(code.slice(0,end)+'globalThis.preview={accounts,history,stats,verified,selectedAccounts,visibleAccounts,statusMeta,accountCard,renderDetail,state};})();',scope);
  const p=scope.preview;
  return {...p,fields,detail(alias,key=primary,count=5){
    Object.assign(p.state,{detailAlias:alias,detailKey:key,detailCycles:count,detailCycle:null});
    p.renderDetail();
    return node('detailBody').innerHTML;
  }};
}
const primary='codex:primary:18000',secondary='codex:secondary:604800';

test('backup Pro 5/10 cycles match an independent sum, excluding the distant null sample',()=>{
  const p=fixture(),five=p.stats('acct_04',primary,5),ten=p.stats('acct_04',primary,10);
  const expectedFive=[99,74,80,90,100],expectedTen=[84,91,97,83,...expectedFive];
  assert.equal(five.averageNearResetRemainingPercent,expectedFive.reduce((a,b)=>a+b,0)/5);
  assert.equal(five.highUnusedCycles,4);
  assert.equal(ten.averageNearResetRemainingPercent,Math.round(expectedTen.reduce((a,b)=>a+b,0)/9*100)/100);
  assert.equal(ten.cyclesNearReset,9);
  assert.equal(ten.highUnusedCycles,8);
  assert.equal(ten.cyclesWithoutReliableEstimate,1);
  assert.equal(p.stats('acct_04',secondary,5).averageNearResetRemainingPercent,78.25);
});

test('missing estimates and unverified events cannot imply zero unused quota',()=>{
  const p=fixture(),i=p.stats('acct_07',primary,5);
  assert.equal(i.cyclesObserved,5);
  assert.equal(i.cyclesNearReset,0);
  assert.equal(i.averageNearResetRemainingPercent,null);
  assert.equal(i.cyclesWithoutReliableEstimate,5);
  assert.equal(p.history['acct_07/'+primary].rollovers.filter(r=>r.type!=='CROSSED_PREDICTED_RESET').length,2);
});

test('detail covers every counted cycle plus interleaved unverified evidence',()=>{
  const p=fixture(),rows=p.verified('acct_07',primary,5),detail=p.detail('acct_07');
  assert.equal(rows.length,5);
  assert.equal((detail.match(/data-choose-date=/g)||[]).length,5);
  assert.match(detail,/未证实事件 · 2 次/);
  assert.match(detail,/CROSSED_BUT_UNVERIFIED/);
  assert.match(detail,/FORECAST_MOVED_UNCONFIRMED/);
});

test('failure, sampling shortage and unknown plan are separate scenarios',()=>{
  assert.equal(fixture('failed').selectedAccounts()[0].lastAttempt.status,'UNAVAILABLE');
  assert.equal(fixture('unverified').selectedAccounts()[0].lastAttempt.status,'OK');
  const unknown=fixture().accounts.find(a=>a.alias==='acct_08');
  assert.equal(unknown.providerPlan.family,'UNKNOWN');
  assert.equal(unknown.lastAttempt.status,'OK');
  assert.equal(unknown.subscription.membershipExpiresAt,null);
  assert.ok(unknown.windows.length);
});

test('administrator tier and multiplier remain separate from server evidence',()=>{
  const p=fixture();
  const field=(markup,label)=>{
    const value=markup.match(new RegExp('<label>'+label+'</label><strong>([^<]*)</strong>'));
    assert.ok(value,'rendered field '+label);
    return value[1];
  };
  const primaryAccount=p.detail('acct_01'),backup=p.detail('acct_04'),stale=p.detail('acct_06');
  assert.equal(field(primaryAccount,'管理员记录档位'),'Pro 200');
  assert.equal(field(primaryAccount,'服务端倍率'),'未知');
  assert.equal(field(backup,'管理员记录档位'),'Pro 100');
  assert.equal(field(backup,'服务端倍率'),'20x');
  assert.equal(field(stale,'管理员记录档位'),'Pro 500');
  assert.equal(field(stale,'管理员倍率'),'10x');
  assert.equal(field(stale,'服务端倍率'),'未知');
});

test('query exceptions exclude never-queried accounts; stale history labels its source',()=>{
  const p=fixture();p.state.filter='failed';
  assert.deepEqual(Array.from(p.visibleAccounts(),a=>a.alias).sort(),['acct_03','acct_06']);
  const a=p.accounts.find(a=>a.alias==='acct_06');
  assert.match(p.accountCard(a,0),/上次成功历史，非实时/);
  assert.equal(p.statusMeta(a,p.stats(a.alias,primary,7)).label,'查询异常 · 有历史');
});
