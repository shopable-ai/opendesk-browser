import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {initSandbox} from '../../src/scripting/sandbox/sandbox.js';

function sandbox() {
 const listeners = new Map(), messages = [], workers = [], channels = [], revoked = [];
 const parent = {postMessage() {}};
 const host = {postMessage(value) { messages.push(value); }, start() {}};
 class Worker {
  constructor(url) { this.url = url; this.terminated = false; workers.push(this); }
  terminate() { this.terminated = true; }
 }
 class MessageChannel {
  constructor() {
   const port = () => ({closed: false, start() {}, postMessage() {}, close() { this.closed = true; }});
   this.port1 = port(); this.port2 = port(); channels.push(this);
  }
 }
 vm.runInNewContext(`(${initSandbox.toString()})()`, {
  Worker, MessageChannel, Blob, structuredClone, performance, Date, setTimeout, clearTimeout,
  URL: {createObjectURL: () => 'blob:null/owned-worker', revokeObjectURL: value => revoked.push(value)},
  window: {addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name)},
  location: {host: 'extension-test'}, self: {origin: 'null'}, parent
 });
 listeners.get('message')({source: parent, origin: 'chrome-extension://extension-test',
  data: {kind: 'bind-host'}, ports: [host]});
 const send = data => host.onmessage({data});
 return {send, messages, workers, channels, revoked};
}

const identity = {runId: 'original-run', ownerEpoch: 7};
const start = {kind: 'start', identity, workerSource: '/* original admitted source */'};
const retire = {kind: 'retire', ...identity, reason: 'stopped'};

test('bound sandbox acknowledges Stop before Worker creation and rejects a late start', async () => {
 const realm = sandbox();
 await realm.send(retire);
 const receipt = realm.messages.find(row => row.kind === 'retired');
 assert.ok(receipt, 'The original bound sandbox must confirm its empty worker state');
 assert.equal(receipt.runId, identity.runId);
 assert.equal(receipt.ownerEpoch, identity.ownerEpoch);
 assert.equal(receipt.workerNeverCreated, true);
 assert.deepEqual({...receipt.baseline}, {workers: 0, ports: 0, blobURLs: 0, probeWorkers: 0});
 await realm.send(start);
 await realm.send(retire);
 assert.equal(realm.workers.length, 0, 'Retirement must fence queued starts');
 assert.equal(realm.messages.filter(row => row.kind === 'retired').length, 1);
});

test('Stop still requires the active run and epoch and retires owned resources once', async () => {
 const realm = sandbox();
 await realm.send(start);
 await realm.send({...retire, runId: 'other-run'});
 await realm.send({...retire, ownerEpoch: identity.ownerEpoch + 1});
 assert.equal(realm.workers[0].terminated, false);
 assert.equal(realm.messages.some(row => row.kind === 'retired'), false);
 await realm.send(retire);
 assert.equal(realm.workers[0].terminated, true);
 assert.equal(realm.channels[0].port1.closed, true);
 assert.equal(realm.channels[0].port2.closed, true);
 assert.deepEqual(realm.revoked, ['blob:null/owned-worker']);
 await realm.send(start);
 await realm.send(retire);
 assert.equal(realm.workers.length, 1);
 assert.equal(realm.messages.filter(row => row.kind === 'retired').length, 1);
 assert.equal(realm.messages.find(row => row.kind === 'retired').workerNeverCreated, undefined);
});
