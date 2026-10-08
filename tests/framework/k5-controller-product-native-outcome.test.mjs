import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeFailureOutcome, durableReadReady} from './k5-controller-product-native-outcome.mjs';

test('same-run stale projection is not a completed trusted Read while its transport remains in flight', () => {
  const runId = 'native-exact-run';
  const view = {state:'results',runId,text:`任务 ${runId}：completed`,result:JSON.stringify({run:{runId},results:[{runId,value:7}]})};
  const lifecycle = (pending,timers) => ({scope:'extension-tool-document',owners:{client:{pending,timers}}});
  assert.equal(durableReadReady(view,runId,lifecycle(1,1)),false);
  assert.equal(durableReadReady(view,runId,lifecycle(0,1)),false);
  assert.equal(durableReadReady(view,runId,lifecycle(1,0)),false);
  assert.equal(durableReadReady(view,runId,lifecycle(0,0)),true);
  for (const invalid of [null,{}, {scope:'extension-tool-document',owners:{client:{}}},lifecycle(-1,0),lifecycle('0',0)])
    assert.equal(durableReadReady(view,runId,invalid),false);
  for (const patch of [{state:'error'},{runId:'different-run'},{text:'已读取持久结果'},{result:'{}'}])
    assert.equal(durableReadReady({...view,...patch},runId,lifecycle(0,0)),false);
});

test('observation timeout and missing numerical oracle remain untested', () => {
  assert.deepEqual(nativeFailureOutcome({code:'E_OBSERVATION_TIMEOUT'}), {status:'NOT_TESTED', attribution:'observation-timeout'});
  assert.deepEqual(nativeFailureOutcome({code:'E_CAMPAIGN_OBSERVATION_MISSING'}), {status:'NOT_TESTED', attribution:'observation-missing'});
});
test('native permission input still pending is blocked', () => {
  assert.deepEqual(nativeFailureOutcome({code:'E_NATIVE_PERMISSION_WAIT'}), {status:'BLOCKED', attribution:'permission-wait'});
});
test('runner transport/launcher failures cannot be attributed to product behavior', () => {
  for (const code of ['E_RUNNER_CDP','E_RUNNER_EVALUATE','E_RUNNER_LAUNCHER'])
    assert.deepEqual(nativeFailureOutcome({code}), {status:'NOT_TESTED', attribution:'runner'});
});
test('actual assertion and product failures still fail; this classifier never emits PASS', () => {
  for (const code of ['ERR_ASSERTION','E_TIMEOUT','E_PERMISSION','E_OWNER_CHANGED',undefined])
    assert.equal(nativeFailureOutcome({code}).status, 'FAIL');
});
