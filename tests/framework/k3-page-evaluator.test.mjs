import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {buildPageEvaluation, buildCancelPageWaits, readPageEvaluationResult} from '../../src/scripting/user-scripts/page-evaluator.js';
const config = {operationId: 'operation', runId: 'run'};
function realm() { return vm.createContext({TextEncoder, setTimeout, clearTimeout, performance, console, document: {title: 'A'}}); }
async function execute(method, args, context = realm()) {
  const descriptor = buildPageEvaluation(method, args, config);
  return readPageEvaluationResult(JSON.parse(JSON.stringify(await vm.runInContext(descriptor.code, context))));
}

test('CMP03-API14-ERR: absent single-element evaluation uses the original selector error', async () => {
  const context = realm(); context.document.querySelector = () => null;
  await assert.rejects(execute('$eval', ['#absent', '()=>{throw new Error("callback must not execute")}', []], context),
    {code:'E_SELECTOR_NOT_FOUND', message:'E_SELECTOR_NOT_FOUND'});
});

test('CMP03-API14/15: selector callbacks preserve original failures, ordered values and empty falsy results', async () => {
  const context = realm();
  context.document.querySelector = () => ({textContent:'A'});
  context.document.querySelectorAll = css => css === '.item' ? [{textContent:'one'},{textContent:'two'}] : [];
  assert.equal(await execute('$eval', ['#marker', 'async(el,s)=>Promise.resolve(el.textContent+s)', ['!']], context), 'A!');
  assert.deepEqual(await execute('$$eval', ['.item', 'async els=>els.map(e=>e.textContent)', []], context), ['one','two']);
  assert.equal(await execute('$$eval', ['.absent', 'els=>els.length', []], context), 0);
  for (const fn of ['()=>{throw new Error("boom");}', '()=>Promise.reject(new Error("boom"))'])
    await assert.rejects(execute('$eval', ['#marker', fn, []], context), error => {
      assert.equal(error.code, 'E_PAGE_EXECUTION'); assert.deepEqual(error.cause, {name:'Error',message:'boom'}); return true;
    });
});
test('CMP10-API35: generated function harness awaits and preserves falsy/undefined/business values', async () => {
  for (const [source, expected] of [['()=>false', false], ['()=>0', 0], ['()=>""', ''], ['()=>null', null], ['()=>undefined', undefined], ['async()=>({PageBrigeCode:1,message:"domain"})', {PageBrigeCode: 1, message: 'domain'}]]) {
    const result = await execute('evaluate', [{mode: 'function', source}, []]);
    assert.deepEqual(result, expected);
  }
  assert.equal(await execute('evaluate', [{mode: 'function', source: '(x)=>x'}, [undefined]]), undefined);
  assert.deepEqual(await execute('evaluate', [{mode: 'function', source: 'async()=>({PageBrigeCode:1,message:"domain"})'}, []]), {PageBrigeCode: 1, message: 'domain'});
  const context = realm(); assert.equal(await execute('evaluate', [{mode: 'legacy-statement', source: 'document.title="s";setTimeout(()=>document.title="later",100);'}, []], context), true);
  assert.equal(context.document.title, 's');
});
test('CMP10-API35-ERR/LIMIT: generated user failures are typed; no lexical closure/native result fallback', async () => {
  await assert.rejects(execute('evaluate', [{mode: 'function', source: '()=>secret'}, []]), {code: 'E_PAGE_EXECUTION'});
  await assert.rejects(execute('evaluate', [{mode: 'function', source: '()=>{throw new Error("boom")}'}, []]), /boom/);
  await assert.rejects(execute('evaluate', [{mode: 'function', source: '()=>Promise.reject(new Error("rejected"))'}, []]), /rejected/);
  for (const source of ['()=>NaN', '()=>Infinity', '()=>1n', '()=>()=>1', '()=>{const a={};a.self=a;return a;}']) await assert.rejects(execute('evaluate', [{mode: 'function', source}, []]), {code: 'E_VALUE_SERIALIZATION'});
});
test('CMP03-API34 and CORE-EVALUATE-EXPRESSION: correct worlds, async statement, exact values and syntax error', async () => {
  assert.equal(buildPageEvaluation('evaluate', [{mode: 'function', source: '()=>1'}, []], config).world, 'USER_SCRIPT');
  assert.equal(buildPageEvaluation('eval', ['1===1', {mode: 'expression'}], config).world, 'MAIN');
  assert.equal(await execute('eval', ['1===1', {mode: 'expression'}]), true);
  assert.equal(await execute('eval', ['await Promise.resolve();document.title="new";return 99;', {mode: 'statement'}]), undefined);
  for (const [expression, expected] of [['false', false], ['0', 0], ['null', null], ['undefined', undefined], ['Promise.resolve(3)', 3]]) assert.equal(await execute('evaluateExpression', [expression]), expected);
  assert.throws(() => buildPageEvaluation('evaluateExpression', ['1', 'extra'], config), {code: 'E_ARGUMENT_TYPE'});
  await assert.rejects(execute('evaluateExpression', ['not valid syntax']));
});
test('CMP03-API26: pending predicates time out and canceled waits clear the real timer/map', async () => {
  const context = realm();
  assert.equal(await execute('waitForFunction', ['async()=>false || true', {timeout: 50, polling: 1}, []], context), true);
  await assert.rejects(execute('waitForFunction', ['()=>new Promise(()=>{})', {timeout: 15, polling: 1}, []], context), {code: 'E_TIMEOUT'});
  const waiting = execute('waitForFunction', ['()=>false', {timeout: 0, polling: 1}, []], context);
  const rejected = assert.rejects(waiting, {code: 'E_CANCELLED'});
  await new Promise(resolve => setTimeout(resolve, 4)); vm.runInContext(buildCancelPageWaits('run'), context); await rejected;
  assert.equal(vm.runInContext("globalThis[Symbol.for('opendesk.userScripts.waits.v1')].size", context), 0);
});
