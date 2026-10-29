import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createPageEnvironmentReader} from '../../src/platform/chrome/browser-page-environment.js';

// Node driver/collector tests only; these do not establish real Chrome MAIN-world behavior.
const refs = {tabRef: 'opaque-tab-ref-0001', documentRef: 'opaque-document-ref-0001'};
const context = {toolId: 'tool-a', installEpoch: 'install-1', packageHash: 'a'.repeat(64)};
const target = {tabId: 42, windowId: 7, documentId: 'native-document-a', url: 'https://example.test/page'};
const values = {
  userAgent: 'page-overridden-agent', languages: ['zh-CN', 'en'], timeZone: 'Asia/Shanghai',
  viewport: {width: 900, height: 700}, screen: {width: 1920, height: 1080}, devicePixelRatio: 2
};
const fields = () => Object.fromEntries(Object.entries(values).map(([name, value]) =>
  [name, {status: 'available', value: structuredClone(value), reasonCode: null}]));
const row = (result = fields()) => ({frameId: 0, documentId: target.documentId, result});
const codeIs = code => error => error?.code === code;
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return {promise, resolve};
}
function fixture(overrides = {}) {
  const calls = {execute: [], resolve: [], authorize: []};
  const reader = createPageEnvironmentReader({
    api: {scripting: {executeScript: async options => {
      calls.execute.push(options);
      return overrides.execute ? overrides.execute(options) : [row()];
    }}},
    resolveTarget: async (input, owner) => {
      calls.resolve.push({input, owner});
      return overrides.resolve ? overrides.resolve(calls.resolve.length, input, owner) : {...target};
    },
    authorize: async input => {
      calls.authorize.push(input);
      return overrides.authorize ? overrides.authorize(calls.authorize.length, input) : true;
    },
    clock: overrides.clock ?? {now: () => 1700000000000},
    timeoutMs: overrides.timeoutMs ?? 3000
  });
  return {calls, read: (args = refs) => reader.readEnvironment(args, context)};
}
async function collector() {
  const f = fixture();
  await f.read();
  return f.calls.execute[0].func;
}
function collect(func, setup = '') {
  const result = vm.runInNewContext(`
    const navigator = {userAgent: 'page-overridden-agent', languages: ['zh-CN', 'en']};
    const window = {innerWidth: 900, innerHeight: 700,
      screen: {width: 1920, height: 1080}, devicePixelRatio: 2};
    const Intl = {DateTimeFormat: () => ({resolvedOptions: () => ({timeZone: 'Asia/Shanghai'})})};
    ${setup}
    (${func.toString()})();
  `, {TextEncoder});
  return JSON.parse(JSON.stringify(result));
}

test('executes only the fixed collector in MAIN for the exact resolved document', async () => {
  const f = fixture();
  await f.read();
  assert.equal(f.calls.execute.length, 1);
  const options = f.calls.execute[0];
  assert.deepEqual(Object.keys(options).sort(), ['func', 'target', 'world']);
  assert.deepEqual(options.target, {tabId: target.tabId, documentIds: [target.documentId]});
  assert.equal(options.world, 'MAIN');
  assert.equal(typeof options.func, 'function');
  assert.deepEqual(collect(options.func), fields());
});

test('returns only opaque refs, capture time, MAIN frame source and the six fields', async () => {
  assert.deepEqual(await fixture().read(), {
    ...refs, capturedAt: '2023-11-14T22:13:20.000Z',
    source: {kind: 'target-page-js', world: 'MAIN', frameId: 0}, fields: fields()
  });
});

test('passes frozen opaque refs and the caller identity to every trusted resolution', async () => {
  const f = fixture();
  await f.read();
  assert.equal(f.calls.resolve.length, 4);
  for (const call of f.calls.resolve) {
    assert.deepEqual(call.input, refs);
    assert(Object.isFrozen(call.input));
    assert.equal(call.owner, context);
  }
  assert.deepEqual(f.calls.authorize, Array.from({length: 2}, () =>
    ({origin: 'https://example.test', context})));
});

for (const [name, setup] of [
  ['userAgent', "Object.defineProperty(navigator, 'userAgent', {get() {throw Error('blocked')}});"],
  ['languages', "Object.defineProperty(navigator, 'languages', {get() {throw Error('blocked')}});"],
  ['timeZone', "Intl.DateTimeFormat = () => {throw Error('blocked')};"],
  ['viewport', "Object.defineProperty(window, 'innerWidth', {get() {throw Error('blocked')}});"],
  ['screen', "Object.defineProperty(window, 'screen', {get() {throw Error('blocked')}});"],
  ['devicePixelRatio', "Object.defineProperty(window, 'devicePixelRatio', {get() {throw Error('blocked')}});"]
]) test(`marks ${name} unavailable when its page getter throws`, async () => {
  const got = collect(await collector(), setup);
  assert.deepEqual(got, {...fields(), [name]: {
    status: 'unavailable', value: null, reasonCode: 'E_FIELD_UNAVAILABLE'
  }});
  const f = fixture({execute: () => [row(got)]});
  assert.deepEqual((await f.read()).fields, got);
});

for (const [name, setup] of [
  ['userAgent', "navigator.userAgent = '界'.repeat(342);"],
  ['languages', "navigator.languages = Array(17).fill('en');"],
  ['timeZone', "Intl.DateTimeFormat = () => ({resolvedOptions: () => ({timeZone: null})});"],
  ['viewport', 'window.innerWidth = -1;'],
  ['screen', 'window.screen.height = Infinity;'],
  ['devicePixelRatio', 'window.devicePixelRatio = 0;']
]) test(`marks malformed page ${name} unknown without losing other fields`, async () => {
  const got = collect(await collector(), setup);
  assert.deepEqual(got, {...fields(), [name]: {
    status: 'unknown', value: null, reasonCode: 'E_VALUE_INVALID'
  }});
});

for (const [label, args] of [
  ['script', {...refs, code: 'return navigator.userAgent'}],
  ['function', {...refs, func: () => 'foreign'}],
  ['world', {...refs, world: 'ISOLATED'}],
  ['native target', {...refs, tabId: 42}],
  ['missing document ref', {tabRef: refs.tabRef}],
  ['invalid opaque ref', {...refs, documentRef: 'doc'}]
]) test(`rejects ${label} arguments before resolving or injecting`, async () => {
  const f = fixture();
  await assert.rejects(f.read(args), codeIs('E_SCHEMA'));
  assert.deepEqual(f.calls, {execute: [], resolve: [], authorize: []});
});

for (const [label, makeRows] of [
  ['missing result', () => []],
  ['multiple results', () => [row(), row()]],
  ['native fingerprint shape', () => [row(values)]],
  ['foreign field', () => [row({...fields(), hardwareConcurrency: 8})]],
  ['extra native metadata', () => [{...row(), tabId: 99}]],
  ['invalid field status', () => [row({...fields(), userAgent: {status: 'ok', value: 'x', reasonCode: null}})]],
  ['malformed dimension', () => [row({...fields(), viewport: {status: 'available', value: {width: -1, height: 1}, reasonCode: null}})]],
  ['accessor field', () => {
    const result = fields();
    Object.defineProperty(result, 'userAgent', {get() {throw Error('must not be read');}});
    return [row(result)];
  }]
]) test(`rejects ${label} from executeScript`, async () => {
  await assert.rejects(fixture({execute: makeRows}).read(), codeIs('E_ENVIRONMENT_UNAVAILABLE'));
});

for (const [label, patch] of [['foreign frame', {frameId: 1}], ['foreign document', {documentId: 'other-document'}]])
  test(`rejects ${label} in the native injection receipt`, async () => {
    await assert.rejects(fixture({execute: () => [{...row(), ...patch}]}).read(), codeIs('E_DOCUMENT_STALE'));
  });

test('maps native injection failure to environment unavailable without retry', async () => {
  const f = fixture({execute: () => {throw Error('Chrome rejected injection');}});
  await assert.rejects(f.read(), codeIs('E_ENVIRONMENT_UNAVAILABLE'));
  assert.equal(f.calls.execute.length, 1);
});

for (const stage of [2, 3, 4]) {
  for (const [key, value] of Object.entries({tabId: 43, windowId: 8, documentId: 'navigated-document', url: 'https://example.test/next'}))
    test(`rejects changed ${key} at target recheck ${stage}`, async () => {
      const f = fixture({resolve: count => ({...target, ...(count >= stage ? {[key]: value} : {})})});
      await assert.rejects(f.read(), codeIs('E_DOCUMENT_STALE'));
      assert.equal(f.calls.execute.length, stage === 2 ? 0 : 1);
    });
}

for (const stage of [1, 2]) test(`rejects revoked permission at authorization check ${stage}`, async () => {
  const f = fixture({authorize: count => count !== stage});
  await assert.rejects(f.read(), codeIs('E_PERMISSION'));
  assert.equal(f.calls.execute.length, stage === 1 ? 0 : 1);
});

for (const reason of ['E_TOOL_UNINSTALLED', 'E_INSTALL_IDENTITY_CHANGED'])
  test(`discards pending collection when the resolver reports ${reason}`, async () => {
    const started = deferred(), finish = deferred();
    let invalid = false;
    const f = fixture({
      execute: () => {started.resolve(); return finish.promise;},
      resolve: () => {
        if (invalid) throw Object.assign(Error(reason), {code: reason});
        return {...target};
      }
    });
    const pending = f.read();
    await started.promise;
    invalid = true;
    finish.resolve([row()]);
    await assert.rejects(pending, codeIs(reason));
    assert.equal(f.calls.authorize.length, 1);
  });

test('copies validated fields before asynchronous authorization can mutate native results', async () => {
  const result = fields();
  const f = fixture({execute: () => [row(result)], authorize: count => {
    if (count === 2) result.userAgent.value = 'mutated-after-validation';
    return true;
  }});
  assert.deepEqual((await f.read()).fields, fields());
});

test('discards a late native result after timeout without further resolution or authorization', async t => {
  t.mock.timers.enable({apis: ['setTimeout']});
  const started = deferred(), finish = deferred();
  const f = fixture({timeoutMs: 25, execute: () => {started.resolve(); return finish.promise;}});
  const pending = f.read();
  const rejected = assert.rejects(pending, codeIs('E_TIMEOUT'));
  await started.promise;
  t.mock.timers.tick(25);
  await rejected;
  finish.resolve([row()]);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.calls.execute.length, 1);
  assert.equal(f.calls.resolve.length, 2);
  assert.equal(f.calls.authorize.length, 1);
});

test('rejects elapsed trusted-clock deadline even before the timeout callback runs', async () => {
  let now = 0;
  const f = fixture({clock: {now: () => now}, timeoutMs: 25,
    execute: () => {now = 25; return [row()];}});
  await assert.rejects(f.read(), codeIs('E_TIMEOUT'));
  assert.equal(f.calls.resolve.length, 2);
});
