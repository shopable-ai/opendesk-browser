import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {captureOriginalCaseFailure} from './k5-controller-product-native-original-cases.mjs';

const source = await readFile(new URL('./k5-controller-product-native.mjs', import.meta.url), 'utf8');
const connectSource = source.slice(source.indexOf('async function connect('), source.indexOf('async function evaluate('));
async function bounded(promise) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error('CDP rejection did not complete promptly'), {code: 'E_TEST_CDP_TIMEOUT'})), 100);
  })]); } finally { clearTimeout(timer); }
}
async function fixture() {
  let socket;
  const timers = new Set(), records = [];
  class Socket {
    constructor() { socket = this; this.readyState = 1; this.sent = []; queueMicrotask(() => this.onopen()); }
    send(message) { if (this.sendError) throw this.sendError; this.sent.push(JSON.parse(message)); }
    close() { this.readyState = 3; this.onclose(); }
  }
  const connect = vm.runInNewContext(`${connectSource}\nconnect`, {
    WebSocket: Socket, Map, Set, Promise, Error, performance,
    output: '/unit-only', path: {join: (...parts) => parts.join('/')},
    appendFileSync: (_path, line) => records.push(JSON.parse(line)),
    setTimeout: callback => { const timer = {callback}; timers.add(timer); return timer; },
    clearTimeout: timer => timers.delete(timer),
  });
  const client = await connect('ws://unit-only', 'controlled');
  return {client, socket, timers, records};
}

test('closed client rejects later requests without writing or allocating a timeout', async () => {
  const f = await fixture(); f.socket.close();
  await assert.rejects(bounded(f.client.send('Target.getTargets')), {code: 'E_RUNNER_CDP_CLOSED'});
  assert.equal(f.socket.sent.length, 0); assert.equal(f.timers.size, 0); assert.equal(f.records.length, 0);
});

test('readyState prevents sends before a queued close event is delivered', async () => {
  const f = await fixture(); f.socket.readyState = 2;
  await assert.rejects(bounded(f.client.send('Runtime.evaluate')), {code: 'E_RUNNER_CDP_CLOSED'});
  assert.equal(f.socket.sent.length, 0); assert.equal(f.timers.size, 0);
});

test('close rejects an existing request and failure evidence cleanup has no further sends or timers', async () => {
  const f = await fixture(), request = f.client.send('Runtime.evaluate');
  f.socket.close();
  await assert.rejects(bounded(request), {code: 'E_RUNNER_CDP_CLOSED'});
  const read = () => bounded(f.client.send('Runtime.evaluate'));
  const captured = await captureOriginalCaseFailure(new Error('browser exited'), {
    before: {snapshot: read}, cleanup: {stop: read}, after: {snapshot: read},
  });
  assert.equal(captured.before.readErrors.snapshot.code, 'E_RUNNER_CDP_CLOSED');
  assert.equal(captured.cleanup.errors.stop.code, 'E_RUNNER_CDP_CLOSED');
  assert.equal(captured.after.readErrors.snapshot.code, 'E_RUNNER_CDP_CLOSED');
  assert.equal(f.socket.sent.length, 1); assert.equal(f.timers.size, 0);
});

test('synchronous send failure removes its pending waiter and timer', async () => {
  const f = await fixture(); f.socket.sendError = new Error('transport failed');
  await assert.rejects(f.client.send('Runtime.evaluate'), /transport failed/);
  assert.equal(f.timers.size, 0);
  f.socket.close(); assert.equal(f.timers.size, 0);
});
