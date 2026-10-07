import test from 'node:test';
import assert from 'node:assert/strict';
import {createWindowTransport} from '../../src/framework/sdk/transport.js';
import {createSdkBridge, legacyResult} from '../../src/framework/sdk/bridge.js';
import {installPageSdk} from '../../src/framework/sdk/entry.js';
import {createSleep} from '../../src/framework/sdk/utils.js';
import {installPageRelay} from '../../src/agents/page-relay.js';
import {encodeValue} from '../../src/platform/page-port/codec.js';
import {PROTOCOL, SDK_VERSION, SDK_METHODS, SDK_HELLO_EVENT, SDK_READY_EVENT, SDK_REQUEST_EVENT} from '../../src/framework/sdk/registry.js';

const turn = () => new Promise(resolve => setImmediate(resolve));
const hello = (methods = Object.keys(SDK_METHODS)) => ({sdkVersion: SDK_VERSION, ready: true, methods});
const code = expected => error => error?.code === expected;

class DetailEvent extends Event {
  constructor(type, {detail} = {}) { super(type); this.detail = detail; }
}
class Window extends EventTarget {
  constructor() { super(); this.listeners = new Map(); this.dispatched = []; }
  addEventListener(type, callback, options) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(callback);
    super.addEventListener(type, callback, options);
  }
  removeEventListener(type, callback, options) {
    this.listeners.get(type)?.delete(callback);
    super.removeEventListener(type, callback, options);
  }
  dispatchEvent(event) {
    this.dispatched.push(event);
    return super.dispatchEvent(event);
  }
  listenerCount() { return [...this.listeners.values()].reduce((sum, values) => sum + values.size, 0); }
}
function timers() {
  let next = 0;
  const entries = new Map();
  return {
    entries,
    setTimer(fn, delay) { const id = ++next; entries.set(id, {fn, delay}); return id; },
    clearTimer(id) { entries.delete(id); },
    fire(id = entries.keys().next().value) {
      const entry = entries.get(id);
      assert.ok(entry);
      entries.delete(id);
      entry.fn();
    }
  };
}
function resource(diagnostics, scope) {
  return diagnostics.resources.find(item => item.scope === scope);
}

test('window transport reports three listeners and live timer-backed pending entries', async () => {
  const window = new Window(), clock = timers();
  const transport = createWindowTransport({window, CustomEvent: DetailEvent, setTimer: clock.setTimer, clearTimer: clock.clearTimer});
  assert.deepEqual(transport.diagnostics().counts, {pending: 0, timers: 0, subscriptions: 3, ports: 0, workers: 0, blobs: 0});
  assert.equal(window.listenerCount(), 3);

  const ready = transport.hello();
  const helloMessage = JSON.parse(window.dispatched.find(event => event.type === SDK_HELLO_EVENT).detail);
  assert.deepEqual(transport.diagnostics().counts, {pending: 1, timers: 1, subscriptions: 3, ports: 0, workers: 0, blobs: 0});

  window.dispatchEvent(new DetailEvent(SDK_READY_EVENT, {detail: JSON.stringify({
    protocol: PROTOCOL, helloId: helloMessage.helloId, response: {ok: true, data: hello(['APPLOCAL_GETITEM'])}
  })}));
  assert.deepEqual(await ready, hello(['APPLOCAL_GETITEM']));
  assert.deepEqual(transport.diagnostics().counts, {pending: 0, timers: 0, subscriptions: 3, ports: 0, workers: 0, blobs: 0});

  transport.dispose();
  assert.deepEqual(transport.diagnostics().counts, {pending: 0, timers: 0, subscriptions: 0, ports: 0, workers: 0, blobs: 0});
  assert.equal(window.listenerCount(), 0);
});

test('bridge counts pending timers and registered legacy callbacks until settlement or disposal', async () => {
  const clock = timers();
  const bridge = createSdkBridge({setTimer: clock.setTimer, clearTimer: clock.clearTimer, makeId: () => 'bridge-pending',
    transport: {hello: async () => hello(['APPLOCAL_GETITEM']), request: async () => ({accepted: true})}});
  const pending = bridge.call('APPLOCAL_GETITEM', {key: 'x'});
  await turn();
  assert.equal(bridge.diagnostics().pending, 1);
  assert.deepEqual(bridge.diagnostics().counts, {pending: 1, timers: 1, subscriptions: 1, ports: 0, workers: 0, blobs: 0});

  bridge.ChromeBridgeOperationCompleted('bridge-pending', legacyResult(false));
  assert.equal(await pending, false);
  assert.deepEqual(bridge.diagnostics().counts, {pending: 0, timers: 0, subscriptions: 0, ports: 0, workers: 0, blobs: 0});

  const cancelled = bridge.call('APPLOCAL_GETITEM', {key: 'y'});
  await turn();
  const rejected = assert.rejects(cancelled, code('E_CANCELLED'));
  bridge.dispose();
  await rejected;
  assert.deepEqual(bridge.diagnostics().counts, {pending: 0, timers: 0, subscriptions: 0, ports: 0, workers: 0, blobs: 0});
});

test('SDK diagnostics aggregate each bridge and each transport once across reinjection', async () => {
  let hellos = 0;
  const transport = {
    async hello() { hellos++; return hello(['APPLOCAL_GETITEM']); },
    async request() { return {accepted: true}; },
    resourceDiagnostics() {
      return {scope: 'test.transport', counts: {pending: 0, timers: 0, subscriptions: 0, ports: 1, workers: 0, blobs: 0}, observationMissing: null};
    }
  };
  const page = {};
  const sdk = installPageSdk({global: page, transport});
  const pending = sdk.AppLocal.getItem('x');
  pending.catch(() => {});
  try {
  await turn();
  installPageSdk({global: page, transport});
  await sdk.ready();

  const diagnostics = sdk.diagnostics();
  assert.equal(diagnostics.pending, 1);
  assert.equal(diagnostics.resources.filter(item => item.scope === 'bridge').length, 2);
  assert.equal(diagnostics.resources.filter(item => item.scope === 'test.transport').length, 1);
  assert.deepEqual(diagnostics.counts, {pending: 1, timers: 1, subscriptions: 2, ports: 1, workers: 0, blobs: 0});
  assert.equal(hellos, 2);

  page.ChromeBridgeOperationCompleted([...page.ChromeBridgeEvents.keys()][0], legacyResult(0));
  assert.equal(await pending, 0);
  assert.deepEqual(sdk.diagnostics().counts, {pending: 0, timers: 0, subscriptions: 0, ports: 1, workers: 0, blobs: 0});
  } finally { sdk.dispose(); }
});

test('SDK diagnostics mark arbitrary transports as missing observation instead of fabricating zeroes', async () => {
  const transport = {hello: async () => hello(['APPLOCAL_GETITEM']), request: async () => ({accepted: true})};
  const sdk = installPageSdk({global: {}, transport});
  const pending = sdk.AppLocal.getItem('x');
  await turn();

  const diagnostics = sdk.diagnostics();
  assert.equal(resource(diagnostics, 'transport').counts, null);
  assert.equal(resource(diagnostics, 'transport').observationMissing, 'resource counters unavailable');
  assert.deepEqual(diagnostics.observationMissing, [{scope: 'transport', reason: 'resource counters unavailable'}]);
  assert.equal(diagnostics.counts, null);

  sdk.dispose();
  await assert.rejects(pending, code('E_CANCELLED'));
  assert.equal(sdk.diagnostics().counts, null);
});

test('SDK sleep reports live timer and cancellation subscription without changing result behavior', async () => {
  const clock = timers();
  const sleep = createSleep({setTimer: clock.setTimer, clearTimer: clock.clearTimer});
  const controller = new AbortController();
  const pending = sleep(1000, {signal: controller.signal});
  assert.deepEqual(sleep.diagnostics().counts, {pending: 1, timers: 1, subscriptions: 1, ports: 0, workers: 0, blobs: 0});
  const rejected = assert.rejects(pending, code('E_CANCELLED'));
  controller.abort();
  await rejected;
  assert.deepEqual(sleep.diagnostics().counts, {pending: 0, timers: 0, subscriptions: 0, ports: 0, workers: 0, blobs: 0});

  const resolved = sleep(1);
  assert.deepEqual(sleep.diagnostics().counts, {pending: 1, timers: 1, subscriptions: 0, ports: 0, workers: 0, blobs: 0});
  clock.fire();
  assert.equal(await resolved, undefined);
  assert.deepEqual(sleep.diagnostics().counts, {pending: 0, timers: 0, subscriptions: 0, ports: 0, workers: 0, blobs: 0});
});

test('SDK counters fail closed for a transport that advertises incomplete numeric counters', () => {
  const sdk = installPageSdk({global: {}, transport: {hello: async () => hello(), request: async () => ({accepted: true}),
    resourceDiagnostics: () => ({scope: 'partial', counts: {pending: 0}, observationMissing: null})}});
  try {
    assert.equal(sdk.diagnostics().counts, null);
    assert.deepEqual(sdk.diagnostics().observationMissing, [{scope: 'partial', reason: 'resource counters unavailable'}]);
  } finally { sdk.dispose(); }
});

test('separate sleep calls sharing one signal keep both subscriptions and disposal cancels both', async () => {
  const clock = timers(), sleep = createSleep({setTimer: clock.setTimer, clearTimer: clock.clearTimer});
  const owner = new AbortController(), first = sleep(1000, {signal: owner.signal}), second = sleep(1000, {signal: owner.signal});
  const firstRejected = assert.rejects(first, code('E_CANCELLED')), secondRejected = assert.rejects(second, code('E_CANCELLED'));
  assert.deepEqual(sleep.diagnostics().counts, {pending: 2, timers: 2, subscriptions: 2, ports: 0, workers: 0, blobs: 0});
  sleep.dispose(); await Promise.all([firstRejected, secondRejected]);
  assert.deepEqual(sleep.diagnostics().counts, {pending: 0, timers: 0, subscriptions: 0, ports: 0, workers: 0, blobs: 0});
  assert.equal(clock.entries.size, 0);
  await assert.rejects(sleep(1), code('E_CANCELLED'));
});

test('SDK disposal cancels owned sleep and releases its legacy callback registry', async () => {
  const page = {}, sdk = installPageSdk({global: page, transport: {hello: async () => hello(), request: async () => ({accepted: true}),
    resourceDiagnostics: () => ({scope: 'test.transport', counts: {pending: 0, timers: 0, subscriptions: 0, ports: 0, workers: 0, blobs: 0}, observationMissing: null})}});
  page.ChromeBridgeEvents.set('held', () => {});
  const sleeper = sdk.sleep(30000), rejected = assert.rejects(sleeper, code('E_CANCELLED'));
  assert.equal(resource(sdk.diagnostics(), 'sdk.callbacks').counts.subscriptions, 1);
  assert.equal(sdk.diagnostics().counts.timers, 1);
  sdk.dispose(); await rejected;
  assert.deepEqual(sdk.diagnostics().counts, {pending: 0, timers: 0, subscriptions: 0, ports: 0, workers: 0, blobs: 0});
});

test('relay diagnostics report actual pending timers and listeners without native port claims', async () => {
  const window = new Window(), clock = timers(), callbacks = [];
  const api = {runtime: {sendMessage(message, callback) { callbacks.push({message, callback}); }}};
  const relay = installPageRelay({window, api, CustomEvent: DetailEvent, setTimer: clock.setTimer, clearTimer: clock.clearTimer,
    clock: {now: () => 1000}});
  const request = {protocol: PROTOCOL, type: 'SDK_REQUEST', payload: {
    requestId: 'relay-pending', method: 'APPLOCAL_GETITEM', argsWire: encodeValue({key: 'x'}), deadlineAt: 2000
  }};

  window.dispatchEvent(new DetailEvent(SDK_REQUEST_EVENT, {detail: JSON.stringify(request)}));
  assert.equal(callbacks.length, 1);
  assert.equal(relay.diagnostics().pending, 1);
  assert.equal(relay.diagnostics().subscriptions, 5);
  assert.deepEqual(relay.diagnostics().counts, {pending: 1, timers: 1, subscriptions: 5, ports: 0, workers: 0, blobs: 0});

  callbacks[0].callback({ok: true, data: {valueWire: encodeValue(legacyResult(false))}});
  await turn();
  assert.deepEqual(relay.diagnostics().counts, {pending: 0, timers: 0, subscriptions: 5, ports: 0, workers: 0, blobs: 0});

  relay.removeEventListeners();
  assert.deepEqual(relay.diagnostics().counts, {pending: 0, timers: 0, subscriptions: 0, ports: 0, workers: 0, blobs: 0});
});
