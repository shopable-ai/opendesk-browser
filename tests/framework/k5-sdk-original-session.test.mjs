import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {encodeValue} from '../../src/platform/page-port/codec.js';
import {discoverWorkerStartupPoint} from './b05-native-recovery-gate.mjs';
import {
  SDK007_ORIGINAL_SESSION_PLAN,
  SDK009_ORIGINAL_SESSION_PLAN,
  SDK019_ORIGINAL_SESSION_PLAN,
  assertNativeSdkResponseShape,
  assertSdk007OriginalSessionOracle,
  assertSdk009OriginalSessionOracle,
  assertSdk019OriginalSessionOracle,
  discoverNativeChromeCall,
  discoverSessionNativeChromeCalls
} from './k5-sdk-original-session.mjs';

const sha = source => createHash('sha256').update(source).digest('hex');
const payload = (requestId = 'session-id') => ({
  requestId,
  method: 'APPLOCAL_SETITEM',
  argsWire: encodeValue({key:'typed', value:{present:undefined, zero:0, no:false, list:[undefined, null]}}),
  deadlineAt: 123456
});
const operation = (extra = {}) => ({
  tag: 'sdk-operation',
  method: 'APPLOCAL_SETITEM',
  requestId: 'session-id',
  runId: 'run-original',
  opId: 'op-original',
  resultId: 'result-original',
  requestDigest: 'digest-original',
  grantIncarnation: 'grant-original',
  deadlineAt: 123456,
  submissionCount: 1,
  ...extra
});
const durableResult = {
  tag: 'sdk-result',
  state: 'durable',
  resultId: 'result-original',
  runId: 'run-original',
  opId: 'op-original',
  requestDigest: 'digest-original',
  grantIncarnation: 'grant-original'
};
const okUndefined = {ok:true, data:{valueWire:encodeValue({PageBrigeCode:0, message:'', data:undefined})}};
const unknown = {ok:false, error:{code:'E_EFFECT_UNKNOWN', message:'unknown',
  invocation:{requestId:'session-id', runId:'run-original', opId:'op-original', grantIncarnation:'grant-original'}}};

test('original session plans bind exact source lines and do not claim formal pass', () => {
  assert.deepEqual([
    SDK007_ORIGINAL_SESSION_PLAN.source,
    SDK009_ORIGINAL_SESSION_PLAN.source,
    SDK019_ORIGINAL_SESSION_PLAN.source
  ], [
    'tests/framework/k2-sdk-broker.test.mjs:194',
    'tests/framework/k2-sdk-broker.test.mjs:205',
    'tests/framework/k2-sdk-broker.test.mjs:219'
  ]);
  assert([SDK007_ORIGINAL_SESSION_PLAN, SDK009_ORIGINAL_SESSION_PLAN, SDK019_ORIGINAL_SESSION_PLAN]
    .every(plan => plan.method === 'APPLOCAL_SETITEM' && plan.status === 'pure-oracle-only'));
});

test('native chromeCall selector binds real callback, runtime.lastError, and source call ranges', async () => {
  const tabsSource = await readFile(new URL('../../src/platform/chrome/tabs.js', import.meta.url), 'utf8');
  const selected = discoverNativeChromeCall(tabsSource, {sourceName:'src/platform/chrome/tabs.js'});
  assert.equal(selected.functionName, 'chromeCall');
  assert.equal(tabsSource.slice(...selected.nativeCall.range), selected.nativeCall.text);
  assert.match(selected.nativeCall.text, /owner\[method\]\(\.\.\.args, value =>/);
  assert.equal(tabsSource.slice(...selected.callbackEntry.range), selected.callbackEntry.text);
  assert.match(selected.callbackEntry.text, /try/);
  assert.equal(selected.callbackEntry.valueExpression, 'value');
  assert.equal(Object.hasOwn(selected.callbackEntry, 'closureExpressions'), false);
  assert.match(selected.lastErrorRead.expression, /runtime\?\.lastError|runtime\.lastError/);
  assert.deepEqual(selected.frameIdentity, {
    apiExpression: 'api',
    objectExpression: 'owner',
    methodExpression: 'method',
    argsExpression: 'args',
    callbackValueExpression: 'value'
  });

  const production = await readFile(new URL('../../dist/production/sw.js', import.meta.url), 'utf8');
  const compiled = discoverNativeChromeCall(production, {sourceName:'dist/production/sw.js'});
  assert.equal(production.slice(...compiled.nativeCall.range), compiled.nativeCall.text);
  assert.equal(production.slice(...compiled.callbackEntry.range), compiled.callbackEntry.text);
  assert.equal(compiled.nativeCall.breakpointType, 'call');
  assert.equal(compiled.callbackEntry.breakpointType, 'statement');
  assert(compiled.functionName, 'Compiled chromeCall function name is required for integration');
});

test('session selector binds actual APPLOCAL chrome.storage.session get/set/remove calls', async () => {
  const sessionSource = await readFile(new URL('../../src/platform/storage/session.js', import.meta.url), 'utf8');
  const sourceCalls = discoverSessionNativeChromeCalls(sessionSource, {
    sourceName:'src/platform/storage/session.js',
    chromeCall:'chromeCall'
  });
  assert.equal(sourceCalls.calls.set.text, "chromeCall(api, area, 'set', {[key]:wire})");
  assert.deepEqual(sourceCalls.setBinding, {keyExpression:'key', valueExpression:'wire'});
  assert.equal(sourceCalls.calls.set.nativeMethod, 'set');
  assert.match(sourceCalls.calls.get.text, /'get', key/);
  assert.match(sourceCalls.calls.remove.text, /'remove', key/);

  const production = await readFile(new URL('../../dist/production/sw.js', import.meta.url), 'utf8');
  const chromeCall = discoverNativeChromeCall(production, {sourceName:'dist/production/sw.js'});
  const compiled = discoverSessionNativeChromeCalls(production, {
    sourceName:'dist/production/sw.js',
    chromeCall: chromeCall.functionName
  });
  assert.equal(production.slice(...compiled.calls.set.range), compiled.calls.set.text);
  assert.equal(compiled.calls.set.breakpointType, 'call');
  assert.equal(compiled.calls.set.nativeMethod, 'set');
  assert.equal(compiled.actualSetCallbackBinding.expectedAsyncStackTraceDescription, 'storage.session.set');
  assert.deepEqual(compiled.actualSetCallbackBinding.callerSite.range, compiled.calls.set.range);
  assert.match(compiled.actualSetCallbackBinding.traceContract, /Match the real chrome\.storage\.session\.set invocation\/key/);
  assert(compiled.setBinding.keyExpression);
  assert(compiled.setBinding.valueExpression);
});

test('root startup gate remains the existing effect-free b05 worker gate', async () => {
  const production = await readFile(new URL('../../dist/production/sw.js', import.meta.url), 'utf8');
  const point = discoverWorkerStartupPoint(production);
  assert.match(point.text, /^const \w+="opendesk.environment.v1";$/);
  assert.equal(point.location.lineNumber, 0);
  assert(!point.effectFreePrefix.includes('chrome.'), 'Startup gate prefix must be effect-free');
  assert.match(sha(production), /^[a-f0-9]{64}$/);
});

test('SDK007 oracle requires APPLOCAL callback receipt, own undefined wire, durable retry, and one native set', () => {
  const op = operation({state:'durable', nativeReceiptWire:encodeValue({method:'APPLOCAL_SETITEM', value:undefined})});
  const facts = {
    caseId: 'F2-K2-SDK-007',
    payload: payload(),
    setResponse: okUndefined,
    retryResponse: okUndefined,
    persistedValueWire: encodeValue({present:undefined, zero:0, no:false, list:[undefined, null]}),
    nativeCalls: [{method:'set', area:'storage.session'}],
    frameworkKvWrites: [],
    rows: {commandJournal:[op], results:[durableResult], runs:[{tag:'sdk-service', state:'completed'}]},
    afterRetryOperation: {...op}
  };
  assertSdk007OriginalSessionOracle(facts);
  assert.throws(() => assertSdk007OriginalSessionOracle({...facts, nativeCalls:[...facts.nativeCalls, {method:'set', area:'storage.session'}]}),
    /one actual chrome\.storage\.session\.set/);
  assert.throws(() => assertSdk007OriginalSessionOracle({...facts, persistedValueWire:encodeValue({zero:0, no:false, list:[undefined, null]})}),
    /own undefined/);
  assert.throws(() => assertSdk007OriginalSessionOracle({...facts, rows:{...facts.rows, commandJournal:[{...op, nativeReceiptWire:undefined}]}}),
    /native callback receipt/);
});

test('SDK009 oracle rejects AXIOS substitution and requires unknown replay without second native set', () => {
  const before = operation({state:'dispatched', nativeReceiptWire:undefined});
  const after = operation({state:'effect_unknown', deliveryState:'denied'});
  const facts = {
    caseId: 'F2-K2-SDK-009',
    payload: payload(),
    nativeCalls: [{method:'set', area:'storage.session'}],
    dispatchObserved: {method:'set', area:'storage.session', keyMatched:true, outstandingTargetSetCount:1, callerSiteRange:[10, 20]},
    callbackEnteredBeforeReceipt: {entered:true, asyncStackTraceDescription:'storage.session.set', callbackEntryRange:[30, 40], callerSiteRange:[10, 20]},
    actualEffectReadback: {method:'get', area:'storage.session', valueWire:encodeValue({present:undefined, zero:0, no:false, list:[undefined, null]})},
    postRecoveryNativeCalls: [],
    beforeOperation: before,
    afterOperation: after,
    beforeResults: [],
    afterRun: {tag:'sdk-service', state:'paused_unknown'},
    retryResponse: unknown
  };
  assertSdk009OriginalSessionOracle(facts);
  assert.throws(() => assertSdk009OriginalSessionOracle({...facts, payload:{...facts.payload, method:'AXIOS_POST'}}), /APPLOCAL storage/);
  assert.throws(() => assertSdk009OriginalSessionOracle({...facts, nativeCalls:[...facts.nativeCalls, {method:'set', area:'storage.session'}]}),
    /second native session set/);
  assert.throws(() => assertSdk009OriginalSessionOracle({...facts, dispatchObserved:{...facts.dispatchObserved, outstandingTargetSetCount:2}}),
    /one outstanding target set/);
  assert.throws(() => assertSdk009OriginalSessionOracle({...facts, callbackEnteredBeforeReceipt:{...facts.callbackEnteredBeforeReceipt, asyncStackTraceDescription:'other'}}),
    /storage\.session\.set async stack/);
  assert.throws(() => assertSdk009OriginalSessionOracle({...facts, actualEffectReadback:{method:'get', valueWire:encodeValue({present:'lost'})}}),
    /readback must match/);
  assert.throws(() => assertSdk009OriginalSessionOracle({...facts, postRecoveryNativeCalls:[{method:'set', area:'storage.session'}]}),
    /additional native set/);
  assert.throws(() => assertSdk009OriginalSessionOracle({...facts, beforeOperation:{...before, nativeReceiptWire:encodeValue({method:'APPLOCAL_SETITEM'})}}),
    /must not have a native callback receipt/);
});

test('SDK019 oracle requires exact public invocation and paused original run', () => {
  const before = operation({state:'dispatched', nativeReceiptWire:undefined});
  const after = operation({state:'effect_unknown', deliveryState:'denied'});
  const facts = {
    caseId: 'F2-K2-SDK-019',
    payload: payload(),
    nativeCalls: [{method:'set', area:'storage.session'}],
    dispatchObserved: {method:'set', area:'storage.session', keyMatched:true, outstandingTargetSetCount:1, callerSiteRange:[10, 20]},
    callbackEnteredBeforeReceipt: {entered:true, asyncStackTraceDescription:'storage.session.set', callbackEntryRange:[30, 40], callerSiteRange:[10, 20]},
    actualEffectReadback: {method:'get', area:'storage.session', valueWire:encodeValue({present:undefined, zero:0, no:false, list:[undefined, null]})},
    postRecoveryNativeCalls: [],
    beforeOperation: before,
    afterOperation: after,
    beforeResults: [],
    afterRun: {tag:'sdk-service', state:'paused_unknown'},
    retryResponse: unknown
  };
  assertSdk019OriginalSessionOracle(facts);
  assertNativeSdkResponseShape(okUndefined, facts.payload, after);
  assert.throws(() => assertSdk019OriginalSessionOracle({...facts,
    retryResponse:{ok:false, error:{...unknown.error, invocation:{...unknown.error.invocation, requestId:'replacement'}}}}),
  /exact original request\/run\/op\/grant/);
  assert.throws(() => assertSdk019OriginalSessionOracle({...facts,
    retryResponse:{ok:false, error:{...unknown.error, invocation:{...unknown.error.invocation, opKey:'private'}}}}),
  /exact original request\/run\/op\/grant/);
  assert.throws(() => assertSdk019OriginalSessionOracle({...facts, afterRun:{tag:'sdk-service', state:'running'}}),
    /paused_unknown/);
});
