// All synthetic values in this test are test-only. No recorded user, model or Chrome run is implied.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateR5Benchmark} from '../../scripts/global-first-r5-benchmark.mjs';
const plan=JSON.parse(readFileSync(new URL('../../docs/framework/workstreams/evidence/global-first-r5-20261013/benchmark-contract.json',import.meta.url),'utf8'));
const cohort=['opendesk','gemini-in-chrome'];
const sample=(id,run,duration)=>({
 trialId:id+'-'+String(run).padStart(8,'0'),
 scenarioId:'R5-T05',comparatorId:id,runNumber:run,
 outcome:'PASS',channel:'SYNTHETIC_UNIT_TEST_NOT_PRODUCT',version:'unit-test-only',
 observedAt:'2026-10-13T00:00:00Z',evidenceUrls:['https://example.invalid/synthetic-only'],
 durationMs:duration,modelCalls:null,costMicrosUsd:null
});

test('empty or incomplete R5 evidence never creates a market ranking or invented zeros',()=>{
  assert.equal(plan.actualChromeTests.length,0);
  assert.equal(plan.actualCompetitorTrials.length,0);
  const zero=evaluateR5Benchmark(plan,[],{scenarioId:'R5-T05',comparatorIds:cohort});
  assert.equal(zero.status,'NOT_TESTED');
  assert.equal(zero.scopedTimeRanking,'NOT_RANKED');
  assert.ok(zero.rows.every(x=>x.modelCallCount===null&&x.totalCostUsd===null));
  const one=evaluateR5Benchmark(plan,[sample('opendesk',1,90)],{
    scenarioId:'R5-T05',comparatorIds:cohort});
  assert.equal(one.status,'INCOMPLETE');
  assert.equal(one.scopedTimeRanking,'NOT_RANKED');
});

test('only a fully observed pre-registered cohort yields a scoped comparative timing',()=>{
  const trials=[sample('opendesk',1,110),sample('opendesk',2,90),
    sample('gemini-in-chrome',1,200),sample('gemini-in-chrome',2,220)];
  const r=evaluateR5Benchmark(plan,trials,{scenarioId:'R5-T05',comparatorIds:cohort});
  assert.equal(r.status,'SCOPED_TRIALS_COMPLETE');
  assert.deepEqual(r.scopedTimeRanking.map(x=>x.comparatorId),cohort);
  assert.equal(r.rows.find(x=>x.id==='opendesk').medianSuccessDurationMs,100);
  assert.equal(r.costComparison,'NOT_RANKED');
  assert.equal(r.globalOrRegionalFirstClaim,'NOT_APPROVED');
  assert.match(r.caution,/never WORLD_FIRST/);
});

test('duplicates, missing evidence, unverified zero model calls and absent comparable versions fail closed',()=>{
  const t=sample('opendesk',1,100);
  assert.throws(()=>evaluateR5Benchmark(plan,[t,t],{scenarioId:'R5-T05',comparatorIds:cohort}),/duplicate/);
  assert.throws(()=>evaluateR5Benchmark(plan,[{...t,evidenceUrls:[]}],{
    scenarioId:'R5-T05',comparatorIds:cohort}),/evidence pointers/);
  assert.throws(()=>evaluateR5Benchmark(plan,[{...t,modelCalls:0}],{
    scenarioId:'R5-T05',comparatorIds:cohort}),/direct-trace/);
  assert.throws(()=>evaluateR5Benchmark(plan,[{...t,version:''}],{
    scenarioId:'R5-T05',comparatorIds:cohort}),/version\/channel/);
  assert.throws(()=>evaluateR5Benchmark(plan,[{...t,costMicrosUsd:15000}],{
    scenarioId:'R5-T05',comparatorIds:cohort}),/cost number needs/);
});

test('fake Node receipt cannot satisfy OpenDesk real-Chrome repeated-run objective',()=>{
  const trial={...sample('opendesk',1,150),
    scenarioId:'R5-T02',sourceHash:'a'.repeat(64),manifestHash:'b'.repeat(64),
    runId:'mock-run-1234',resultId:'mock-result-1234',retirementState:'released',
    nativeEvidenceLevel:'NODE_COMPONENT_ONLY'};
  assert.throws(()=>evaluateR5Benchmark(plan,[trial],{scenarioId:'R5-T02',comparatorIds:cohort}),
    /Node\/mocks cannot count/);
});

test('benchmark plan and GF record never equate tests or market exploration with published first',()=>{
  assert.equal(plan.currentStatus,'ALL_TRIALS_NOT_TESTED');
  assert.equal(plan.comparativeWinner,'NOT_SCORED');
  assert.ok(plan.comparatorWorkflows.length>=8);
  assert.ok(plan.objectives.length>=5);
  assert.deepEqual(plan.marketingRanksApproved,[]);
});

test('a fast failing bot cannot win a median-success-only speed comparison',()=>{
  const trials=[
    {...sample('opendesk',1,15),outcome:'FAIL'},
    sample('opendesk',2,10),
    sample('gemini-in-chrome',1,100),
    sample('gemini-in-chrome',2,120)
  ];
  const result=evaluateR5Benchmark(plan,trials,{scenarioId:'R5-T05',comparatorIds:cohort});
  assert.equal(result.status,'SCOPED_TRIALS_COMPLETE','observations may be complete even when failures occur');
  assert.equal(result.rows.find(x=>x.id==='opendesk').successRate,0.5);
  assert.equal(result.rows.find(x=>x.id==='gemini-in-chrome').successRate,1);
  assert.equal(result.scopedTimeRanking,'NOT_RANKED');
  assert.equal(result.failureGate,'RANKING_WITHHELD_FOR_FAILURE_OR_MISSING_EVIDENCE');
  assert.equal(result.nativeEvidenceCertified,'NOT_CERTIFIED_BY_JSON_CALCULATOR');
});

test('synthetic fixed-installation evidence rejects a changed version or duplicate RunId within 20 repetitions',()=>{
  const mockChrome=(n,generation=1)=>({
    ...sample('opendesk',n,100),
    scenarioId:'R5-T02',
    packageHash:'a'.repeat(64),
    sourceHash:'b'.repeat(64),
    manifestHash:'c'.repeat(64),
    installationId:'installed-fixture-identity',
    generation,
    runId:'synthetic-run-'+n,
    resultId:'synthetic-result-'+n,
    retirementState:'released',
    nativeEvidenceLevel:'REAL_CHROME_RECEIPT' // assertion examines declarations, does NOT authenticate this label
  });
  const a=mockChrome(1),b=mockChrome(2);
  assert.throws(()=>evaluateR5Benchmark(plan,[a,{...b,generation:2}],{
    scenarioId:'R5-T02',comparatorIds:cohort}),/mix source, package, manifest or installation generation/);
  assert.throws(()=>evaluateR5Benchmark(plan,[a,{...b,runId:a.runId}],{
    scenarioId:'R5-T02',comparatorIds:cohort}),/different trusted RunId and ResultId/);
  const incomplete=evaluateR5Benchmark(plan,[a,b],{scenarioId:'R5-T02',comparatorIds:cohort});
  assert.equal(incomplete.scopedTimeRanking,'NOT_RANKED');
  assert.equal(incomplete.status,'INCOMPLETE');
  assert.equal(incomplete.nativeEvidenceCertified,'NOT_CERTIFIED_BY_JSON_CALCULATOR');
});


test('real Chrome repeated runs cannot reuse a RunId/ResultId or stitch two source versions',()=>{
  const mk=(n,overrides={})=>({
    ...sample('opendesk',n,120+n),scenarioId:'R5-T02',
    sourceHash:'a'.repeat(64),manifestHash:'b'.repeat(64),
    runId:'real-unique-run-'+n,resultId:'real-unique-result-'+n,
    retirementState:'released',nativeEvidenceLevel:'REAL_CHROME_RECEIPT',
    ...overrides
  });
  const options={scenarioId:'R5-T02',comparatorIds:cohort};
  assert.throws(()=>evaluateR5Benchmark(plan,[
    mk(1),mk(2,{runId:'real-unique-run-1'})
  ],options),/reused RunId/);
  assert.throws(()=>evaluateR5Benchmark(plan,[
    mk(1),mk(2,{resultId:'real-unique-result-1'})
  ],options),/reused ResultId/);
  assert.throws(()=>evaluateR5Benchmark(plan,[
    mk(1),mk(2,{manifestHash:'c'.repeat(64)})
  ],options),/mixed fixed-version/);
  const validIncomplete=evaluateR5Benchmark(plan,[mk(1),mk(2)],options);
  assert.equal(validIncomplete.scopedTimeRanking,'NOT_RANKED');
  assert.equal(validIncomplete.status,'INCOMPLETE');
});
