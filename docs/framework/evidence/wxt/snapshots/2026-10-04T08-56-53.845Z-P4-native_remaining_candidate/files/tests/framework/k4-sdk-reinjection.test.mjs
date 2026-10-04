import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {installPageSdk} from '../../src/framework/sdk/entry.js';
import {legacyResult} from '../../src/framework/sdk/bridge.js';
import {SDK_VERSION, fail} from '../../src/framework/sdk/registry.js';
import {installPageRelay} from '../../src/agents/page-relay.js';

const code = expected => error => error?.code === expected;
const turn = () => new Promise(resolve => setImmediate(resolve));
const entryPath = new URL('../../src/framework/sdk/entry.js', import.meta.url);
async function freshEntry(suffix) {
  let source = await readFile(entryPath, 'utf8');
  source = source.replace(/from '(\.\.?\/[^']+)'/g, (_, p) => `from '${new URL(p, entryPath).href}'`);
  return import('data:text/javascript;base64,' + Buffer.from(source + `\n// ${suffix}`).toString('base64'));
}
const hello = methods => ({sdkVersion: SDK_VERSION, ready: true, methods});
class DetailEvent extends Event { constructor(type, {detail} = {}) { super(type); this.detail = detail; } }
class Window extends EventTarget {
  listeners = new Map();
  addEventListener(type, fn, options) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(fn); super.addEventListener(type, fn, options); }
  removeEventListener(type, fn, options) { this.listeners.get(type)?.delete(fn); super.removeEventListener(type, fn, options); }
  count() { return [...this.listeners.values()].reduce((n, value) => n + value.size, 0); }
}

test('exact review reproducer: two fresh evaluations reuse frozen globals and perform new Hello', async () => {
  const one = await freshEntry('reproducer-first'), two = await freshEntry('reproducer-second');
  let hellos = 0;
  const transport = {hello: async () => { hellos++; return hello([]); }, request: async () => { throw Error('no calls expected'); }};
  const page = {navigator: {userAgent: ''}};
  const sdk = one.installPageSdk({global: page, transport}); await sdk.ready();
  const values = Object.getOwnPropertyDescriptors(page);
  assert.equal(one.installPageSdk({global: page, transport}), sdk); await sdk.ready();
  assert.equal(two.installPageSdk({global: page, transport}), sdk); await sdk.ready();
  assert.equal(hellos, 3); assert.deepEqual(Object.getOwnPropertyDescriptors(page), values);
  assert(Object.isFrozen(sdk)); sdk.dispose();
});

test('fresh native Hello updates expanded/shrunken grant subset and refuses failed regrant', async () => {
  const window = new Window(), page = {window, CustomEvent: DetailEvent}; let methods = ['APPLOCAL_GETITEM'], revoked = false;
  const messages = [];
  const api = {runtime: {sendMessage(message, callback) {
    messages.push(structuredClone(message));
    queueMicrotask(() => callback(message.type === 'SDK_HELLO' ? (revoked ? {ok: false, error: {code: 'E_GRANT_REVOKED'}} : {ok: true, data: hello(methods)}) :
      {ok: false, error: {code: 'E_PERMISSION'}}));
  }}};
  const relay = installPageRelay({window, api, CustomEvent: DetailEvent});
  const sdk = installPageSdk({global: page}); await sdk.ready();
  await assert.rejects(sdk.call('APPSTORAGE_CLEAR'), code('E_CAPABILITY'));
  methods = ['APPSTORAGE_CLEAR']; const fresh = await freshEntry('native-grant-change');
  assert.equal(fresh.installPageSdk({global: page}), sdk); assert.deepEqual((await sdk.ready()).methods, methods);
  await assert.rejects(sdk.AppLocal.getItem('x'), code('E_CAPABILITY'));
  // No local assertion supplies authority: an allowed method still needs broker admission.
  await assert.rejects(sdk.AppStorage.clear(), code('E_PERMISSION'));
  revoked = true; fresh.installPageSdk({global: page});
  await assert.rejects(sdk.ready(), code('E_GRANT_REVOKED'));
  await assert.rejects(sdk.AppStorage.clear(), code('E_GRANT_REVOKED'));
  revoked = false; methods = ['APPLOCAL_GETITEM']; fresh.installPageSdk({global: page});
  assert.deepEqual((await sdk.ready()).methods, methods);
  assert.equal(messages.filter(m => m.type === 'SDK_HELLO').length, 4);
  assert.equal(messages.filter(m => m.type === 'SDK_REQUEST').length, 1);
  sdk.dispose(); relay.removeEventListeners(); assert.equal(window.count(), 0);
});

test('reinjection preserves old pending legacy callback and stable ChromeBridgeEvents', async () => {
  const page = {}; let hellos = 0;
  const transport = {hello: async () => { hellos++; return hello(['APPLOCAL_GETITEM']); }, request: async () => ({accepted: true})};
  const sdk = installPageSdk({global: page, transport}), legacyMap = page.ChromeBridgeEvents;
  const result = sdk.AppLocal.getItem('x'); await turn(); const id = [...legacyMap.keys()][0];
  const two = await freshEntry('inflight-legacy'); two.installPageSdk({global: page, transport}); await sdk.ready();
  assert.equal(page.ChromeBridgeEvents, legacyMap); assert.equal(sdk.diagnostics().pending, 1);
  assert.equal(page.ChromeBridgeOperationCompleted(id, legacyResult(false)), ''); assert.equal(await result, false);
  assert.equal(legacyMap.size, 0); assert.equal(sdk.diagnostics().pending, 0); assert.equal(hellos, 2); sdk.dispose();
});

test('overlapping reinjections serialize fixed Hello so late old callback cannot supply fresh grant', async () => {
  const window = new Window(), page = {window, CustomEvent: DetailEvent}, callbacks = [];
  const relay = installPageRelay({window, CustomEvent: DetailEvent, api: {runtime: {sendMessage: (m, cb) => callbacks.push({m, cb})}}});
  const sdk = installPageSdk({global: page}); const firstReady = sdk.ready(); await turn();
  const second = await freshEntry('overlap'); second.installPageSdk({global: page}); const secondReady = sdk.ready();
  let secondSettled = false; secondReady.then(() => { secondSettled = true; }); await turn();
  assert.equal(callbacks.length, 1);
  callbacks[0].cb({ok: true, data: hello(['APPLOCAL_GETITEM'])}); await firstReady; await turn();
  assert.equal(callbacks.length, 2); assert.equal(secondSettled, false);
  callbacks[1].cb({ok: true, data: hello(['APPSTORAGE_CLEAR'])}); assert.deepEqual((await secondReady).methods, ['APPSTORAGE_CLEAR']);
  sdk.dispose(); relay.removeEventListeners(); assert.equal(window.count(), 0);
});

test('hostile immutable public fake brand, slot, aliases and accessor conflicts fail closed', async () => {
  const fake = Object.freeze({sdkVersion: SDK_VERSION, ready: async () => hello(['APPSTORAGE_CLEAR']), disposed: false});
  for (const page of [{OpenDeskSDK: fake}, {sleep: () => 'page'}, Object.create({service: {}})]) {
    const before = Object.getOwnPropertyDescriptors(page);
    assert.throws(() => installPageSdk({global: page}), code('E_SDK_GLOBAL_CONFLICT'));
    assert.deepEqual(Object.getOwnPropertyDescriptors(page), before);
  }
  for (const value of [null, {}, Object.freeze({exports: Object.freeze({OpenDeskSDK: fake}), refresh() { return fake; }})]) {
    const page = {}; Object.defineProperty(page, Symbol.for('opendesk.sdk.lifecycle.v1'), {value});
    assert.throws(() => installPageSdk({global: page}), code('E_SDK_GLOBAL_CONFLICT')); assert.equal(page.OpenDeskSDK, undefined);
  }
  let reads = 0; const page = {}; Object.defineProperty(page, 'OpenDeskSDK', {get() { reads++; return fake; }});
  assert.throws(() => installPageSdk({global: page}), code('E_SDK_GLOBAL_CONFLICT')); assert.equal(reads, 0);
});

test('dispose and pagehide are terminal: fresh evaluation cannot resurrect immutable installation', async () => {
  const two = await freshEntry('disposed');
  for (const hide of [false, true]) {
    const window = new Window(), page = {window, CustomEvent: DetailEvent};
    const sdk = installPageSdk({global: page, transport: {hello: async () => hello([]), request: async () => { throw fail('E_PERMISSION'); }}});
    await sdk.ready(); hide ? window.dispatchEvent(new Event('pagehide')) : sdk.dispose();
    await assert.rejects(sdk.ready(), code('E_CANCELLED')); await assert.rejects(sdk.AppLocal.getItem('x'), code('E_CANCELLED'));
    assert.throws(() => two.installPageSdk({global: page, transport: {hello: async () => hello([]), request() {}}}), code('E_CANCELLED'));
    assert.equal(page.OpenDeskSDK, sdk); assert.equal(sdk.diagnostics().pending, 0);
  }
});

test('borrowed lifecycle and forged function toString cannot impersonate ownership of a different global', async () => {
  const transport = {hello: async () => hello([]), request: async () => ({accepted: true})};
  const original = {}, sdk = installPageSdk({global: original, transport}); await sdk.ready();
  const key = Symbol.for('opendesk.sdk.lifecycle.v1'), record = original[key];
  const copied = {}; Object.defineProperties(copied, Object.getOwnPropertyDescriptors(original));
  assert.throws(() => installPageSdk({global: copied, transport}), code('E_SDK_GLOBAL_CONFLICT'));
  const fakeRefresh = () => sdk; fakeRefresh.toString = () => record.refresh.toString();
  const fake = {}; Object.defineProperties(fake, Object.getOwnPropertyDescriptors(record.exports));
  Object.defineProperty(fake, key, {value: Object.freeze({exports: record.exports, refresh: fakeRefresh})});
  assert.throws(() => installPageSdk({global: fake, transport}), code('E_SDK_GLOBAL_CONFLICT'));
  sdk.dispose();
});
