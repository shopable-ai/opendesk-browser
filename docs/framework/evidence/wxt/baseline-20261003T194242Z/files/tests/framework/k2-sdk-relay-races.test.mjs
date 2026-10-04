import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {installPageRelay} from '../../src/agents/page-relay.js';
import {encodeValue, decodeValue} from '../../src/platform/page-port/codec.js';
import {legacyResult} from '../../src/framework/sdk/bridge.js';
import {PROTOCOL, SDK_REQUEST_EVENT, SDK_RESULT_EVENT, SDK_HELLO_EVENT, SDK_READY_EVENT} from '../../src/framework/sdk/registry.js';
const turn = () => new Promise(resolve => setImmediate(resolve));
class DetailEvent extends Event { constructor(type, {detail} = {}) { super(type); this.detail = detail; } }
function fixture(options = {}) {
  let now = 1000, sequence = 0; const timers = new Map(), callbacks = [], replies = [];
  const window = new EventTarget();
  const api = {runtime: {sendMessage(message, callback) { callbacks.push({message: JSON.parse(JSON.stringify(message)), callback}); options.handler?.(message, callback); }}};
  const relay = installPageRelay({window, api, CustomEvent: DetailEvent, clock: options.clock ?? {now: () => now},
    setTimer: (fn, delay) => { const id = ++sequence; timers.set(id, {fn, delay}); return id; }, clearTimer: id => timers.delete(id)});
  for (const name of [SDK_RESULT_EVENT, SDK_READY_EVENT]) window.addEventListener(name, e => replies.push({name, ...JSON.parse(e.detail)}));
  const payload = (id = 'same-id', value = 1, deadlineAt = 2000) => ({requestId: id, method: 'APPLOCAL_SETITEM', argsWire: encodeValue({key: 'x', value}), deadlineAt});
  const request = p => relay.messager(new DetailEvent(SDK_REQUEST_EVENT, {detail: JSON.stringify({protocol: PROTOCOL, type: 'SDK_REQUEST', payload: p})}));
  const reply = value => ({ok: true, data: {valueWire: encodeValue(legacyResult(value))}});
  return {relay, window, api, callbacks, replies, timers, payload, request, reply, setTime: value => { now = value; }};
}

// Exact race sequence from SDK-REVIEW-04, now with distinct actual callback results.
test('same-ID changed args/method/original deadline reaches broker and explicitly delivers conflict', async () => {
  const f = fixture(), p = f.payload(); const calls = [f.request(p)];
  calls.push(f.request({...p, argsWire: encodeValue({key: 'x', value: 2})}));
  calls.push(f.request({...p, method: 'APPLOCAL_REMOVEITEM', argsWire: encodeValue({key: 'x'})}));
  calls.push(f.request({...p, deadlineAt: p.deadlineAt + 1}));
  assert.equal(f.callbacks.length, 4); assert.equal(f.relay.diagnostics().pending, 4);
  for (const entry of f.callbacks.slice(1)) entry.callback({ok: false, error: {code: 'E_REQUEST_CONFLICT'}});
  await turn(); assert.equal(f.replies.length, 3); assert(f.replies.every(r => r.response.error.code === 'E_REQUEST_CONFLICT'));
  assert.equal(f.relay.diagnostics().pending, 1);
  f.callbacks[0].callback(f.reply(1)); await Promise.all(calls);
  assert.equal(decodeValue(f.replies.at(-1).response.data.valueWire).data, 1);
  assert.equal(f.timers.size, 0); f.relay.removeEventListeners();
});

test('timeout plus reused ID: old success or rejection cannot finish/delete replacement', async () => {
  for (const old of ['success', 'lastError', 'malformed']) {
    const f = fixture(), first = f.request(f.payload('reused', 1)); const oldTimer = [...f.timers.values()][0];
    oldTimer.fn(); assert.equal(f.replies[0].response.error.code, 'E_TIMEOUT');
    const replacement = f.request(f.payload('reused', 2, 2500));
    if (old === 'lastError') f.api.runtime.lastError = {message: 'old native failure'};
    f.callbacks[0].callback(old === 'malformed' ? {ok: true, data: {}} : f.reply('old-result'));
    delete f.api.runtime.lastError; await first;
    assert.equal(f.relay.diagnostics().pending, 1); assert.equal(f.replies.length, 1);
    oldTimer.fn(); assert.equal(f.relay.diagnostics().pending, 1); assert.equal(f.replies.length, 1);
    f.callbacks[1].callback({ok: false, error: {code: 'E_REQUEST_CONFLICT'}}); await replacement;
    assert.deepEqual(f.replies.map(r => r.response.error.code), ['E_TIMEOUT', 'E_REQUEST_CONFLICT']);
    assert.equal(f.relay.diagnostics().pending, 0); assert.equal(f.timers.size, 0); f.relay.removeEventListeners();
  }
});

test('100 same-ID same-digest real relay dispatches all reach product broker admission: serial oracle, not native B05', async () => {
  // Reuse existing product fixture without modifying its owner lane or introducing another implementation.
  const fixtureURL = new URL('./k2-sdk-broker.test.mjs', import.meta.url);
  let source = await readFile(fixtureURL, 'utf8'); source = source.slice(0, source.indexOf('const code = expected'));
  source = source.replace(/from '(\.\.[^']+)'/g, (_, p) => `from '${new URL(p, fixtureURL).href}'`);
  const {fixture: productFixture} = await import('data:text/javascript;base64,' + Buffer.from(source + '\nexport {fixture};').toString('base64'));
  const product = await productFixture(); await product.grant(); let admissions = 0;
  const f = fixture({clock: product.clock, handler: (m, cb) => {
    admissions++; product.broker.request(m.payload, product.sender).then(data => cb({ok: true, data}), error => cb({ok: false, error: {code: error.code, message: error.message}}));
  }});
  const p = product.payload('APPSTORAGE_SETITEM', {key: 'same-id-relay', value: false}, 'relay100');
  await Promise.all(Array.from({length: 100}, () => f.request(p)));
  assert.equal(f.callbacks.length, 100); assert.equal(admissions, 100); assert.equal(f.replies.length, 100);
  assert(f.replies.every(r => r.response.ok && Object.hasOwn(decodeValue(r.response.data.valueWire), 'data')));
  assert.equal(product.storage.writes.filter(w => w.store === 'frameworkKV').length, 1);
  assert.equal((await product.rows('results')).length, 1);
  assert.equal((await product.rows('commandJournal')).filter(r => r.tag === 'sdk-operation').length, 1);
  assert.equal((await product.rows('runs')).filter(r => r.tag === 'sdk-service').length, 1);
  assert.equal(product.broker.diagnostics().pending, 0); assert.equal(f.relay.diagnostics().pending, 0); assert.equal(f.timers.size, 0);
  for (const change of [{argsWire: encodeValue({key: 'same-id-relay', value: true})}, {deadlineAt: p.deadlineAt + 1}, {method: 'APPSTORAGE_GETITEM', argsWire: encodeValue({key: 'same-id-relay'})}]) {
    await f.request({...p, ...change}); assert.equal(f.replies.at(-1).response.error.code, 'E_REQUEST_CONFLICT');
  }
  assert.equal(product.storage.writes.filter(w => w.store === 'frameworkKV').length, 1);
  f.relay.removeEventListeners(); product.broker.dispose();
});

test('deadline, canonical codec and legitimate request ID hello remain exact at native boundary', async () => {
  const f = fixture(); const p = f.payload('hello', {zero: 0, no: false, own: undefined});
  const result = f.request(p);
  assert.equal(f.callbacks[0].message.payload.deadlineAt, p.deadlineAt); assert.equal([...f.timers.values()][0].delay, 1000);
  assert.deepEqual(Object.keys(f.callbacks[0].message.payload).sort(), ['argsWire', 'deadlineAt', 'method', 'requestId']);
  assert.deepEqual(decodeValue(f.callbacks[0].message.payload.argsWire).value, {zero: 0, no: false, own: undefined});
  f.callbacks[0].callback(f.reply(undefined)); await result;
  assert.equal(f.replies[0].name, SDK_RESULT_EVENT); assert.equal(f.replies[0].requestId, 'hello');
  f.relay.removeEventListeners();
});

test('bad page fields/ACK errors never consume another entry; dispose clears timers and late callbacks', async () => {
  const f = fixture(), p = f.payload(); const pending = f.request(p);
  for (const field of ['namespace', 'sender', 'ownGrant', 'host']) {
    await f.request({...p, [field]: {}}); assert.equal(f.replies.at(-1).response.error.code, 'E_SCHEMA');
    assert.equal(f.relay.diagnostics().pending, 1);
  }
  f.window.dispatchEvent(new Event('pagehide'));
  assert.equal(f.relay.diagnostics().pending, 0); assert.equal(f.relay.diagnostics().subscriptions, 0); assert.equal(f.timers.size, 0);
  const n = f.replies.length; f.callbacks[0].callback(f.reply('late')); await pending; assert.equal(f.replies.length, n);
  await f.request(p); assert.equal(f.callbacks.length, 1);
});
