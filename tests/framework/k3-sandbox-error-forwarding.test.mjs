import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {createRunContext} from '../../src/framework/context.js';
import {PageError, encodeValue, decodeValue, VALUE_LIMITS} from '../../src/framework/control/value.js';
import {createControlController} from '../../src/scripting/sandbox/controller.js';

const target = Object.freeze({tabId: 7, frameId: 0, documentId: 'target-document', targetVersion: 1});
const identity = Object.freeze({
 runId: 'sandbox-error-run',
 ownerEpoch: 1,
 runRevision: 1,
 hostInstanceId: 'host-instance',
 hostDocumentId: 'host-document',
 target
});
const revision = Object.freeze({scriptId: 'sandbox-error-script', revision: 1, sourceHash: '1'.repeat(64)});

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

function fakeDocument(harness) {
 const listeners = new Map();
 const win = {
  addEventListener(type, listener) {
   const list = listeners.get(type) || [];
   list.push(listener); listeners.set(type, list);
  },
  removeEventListener(type, listener) {
   listeners.set(type, (listeners.get(type) || []).filter(item => item !== listener));
  },
  dispatchEvent(event) {
   for (const listener of listeners.get(event.type) || []) listener(event);
  }
 };
 const frame = {
  hidden: false,
  isConnected: false,
  contentWindow: {
   postMessage(message, _origin, ports = []) {
    harness.bind(message, ports[0]);
   }
  },
  setAttribute(name, value) {
   this[name] = value;
  },
  remove() {
   this.isConnected = false;
  }
 };
 return {
  location: {href: 'chrome-extension://sandbox-test/page.html'},
  defaultView: win,
  createElement(name) {
   assert.equal(name, 'iframe');
   return frame;
  },
  body: {
   append(node) {
    assert.equal(node, frame);
    frame.isConnected = true;
    queueMicrotask(() => win.dispatchEvent({
     type: 'message',
     source: frame.contentWindow,
     origin: 'null',
     data: {kind: 'sandbox-ready', origin: 'null', extensionAPI: false, parentAccess: false}
    }));
   }
  },
  frame
 };
}

function controllerHarness({owner = identity, onExecute, onReply} = {}) {
 const replies = [];
 const starts = [];
 const retires = [];
 let port;
 const harness = {
  replies,
  starts,
  retires,
  bind(message, transferredPort) {
   assert.equal(message.kind, 'bind-host');
   assert.ok(transferredPort);
   port = transferredPort;
   port.onmessage = ({data}) => {
    if (data.kind === 'start') {
     starts.push(data);
     port.postMessage({kind: 'worker-created', runId: owner.runId, ownerEpoch: owner.ownerEpoch});
     port.postMessage({kind: 'bound', runId: owner.runId, ownerEpoch: owner.ownerEpoch,
      identity: {url: 'blob:null/sandbox-error-worker', origin: 'null', name: `OpenDesk-Control-${owner.runId}`}});
     return;
    }
    if (data.kind === 'execute') {
     onExecute?.(port);
     return;
    }
    if (data.kind === 'reply') {
     replies.push(data);
     if (onReply) { onReply(data); return; }
     port.postMessage({kind: 'error', runId: owner.runId, ownerEpoch: owner.ownerEpoch, error: data.reply.error});
     return;
    }
    if (data.kind === 'retire') {
     retires.push(data);
     port.postMessage({kind: 'retired', runId: owner.runId, ownerEpoch: owner.ownerEpoch, reason: data.reason,
      baseline: {workers: 0, ports: 0, blobURLs: 0}});
    }
   };
   port.start();
   port.postMessage({kind: 'host-bound'});
  },
  lateOperation(id = 2) {
   port.postMessage({kind: 'operation', runId: owner.runId, ownerEpoch: owner.ownerEpoch, id,
    envelope: {
     requestId: `late-${id}`,
     identity: owner,
     revision,
     target,
     operation: {kind: 'packaged', method: 'title', args: encodeValue([])}
    }});
  }
 };
 return harness;
}

async function withFetchStub(fn) {
 const original = globalThis.fetch;
 globalThis.fetch = async () => ({ok: true, text: async () => '/* worker source unused by harness */'});
 try {
  return await fn();
 } finally {
  globalThis.fetch = original;
 }
}

test('sandbox operation relay preserves plain original PageError cause and cleans up', async () => {
 const requests = [];
 const harness = controllerHarness({
  onExecute(port) {
   port.postMessage({kind: 'operation', runId: identity.runId, ownerEpoch: identity.ownerEpoch, id: 1,
    envelope: {
     requestId: 'exactbinding',
     identity,
     revision,
     target,
     operation: {kind: 'packaged', method: 'title', args: encodeValue([])}
    }});
  }
 });
 const doc = fakeDocument(harness);
 const context = createRunContext({
  identity,
  revision,
  target,
  dom: doc,
  transport: {
   async request(envelope) {
    requests.push(envelope);
    throw new PageError('E_PAGE_EXECUTION', 'validated page callback failed', {name: 'TypeError', message: 'boom'});
   }
  }
 });

 await withFetchStub(async () => {
  const controller = createControlController({
   context,
   sandboxURL: 'chrome-extension://sandbox-test/src/scripting/sandbox/sandbox.html',
   workerURL: 'chrome-extension://sandbox-test/src/scripting/sandbox/worker.js',
   document: doc
  });
  await controller.ready;
  const actual = await controller.execute('return page.title();', {});
  await controller.retired;

  assert.equal(actual.status, 'error');
  assert.equal(actual.error.code, 'E_PAGE_EXECUTION');
  assert.equal(actual.error.name, 'PageError');
  assert.equal(actual.error.message, 'validated page callback failed');
  assert.deepEqual(actual.error.cause, {name: 'TypeError', message: 'boom'});
  assert.equal(requests.length, 1);
  assert.equal(requests[0].requestId, 'exactbinding');
  assert.equal(harness.replies.length, 1);
  assert.equal(harness.replies[0].reply.requestId, 'exactbinding');
  assert.deepEqual(harness.replies[0].reply.error.cause, {name: 'TypeError', message: 'boom'});
  assert.equal(controller.resourceSnapshot().pending, 0);
  assert.equal(controller.snapshot().pending, 0);
  assert.equal(controller.snapshot().ownedFrames, 0);

  harness.lateOperation();
  await pause(10);
  assert.equal(harness.replies.length, 1);
 });
});

test('cancelled sandbox controller does not answer late fenced operations', async () => {
 const cancelIdentity = {...identity, runId: 'sandbox-cancel-run'};
 const harness = controllerHarness({owner: cancelIdentity});
 const doc = fakeDocument(harness);
 const context = createRunContext({
  identity: cancelIdentity,
  revision,
  target,
  dom: doc,
  transport: {
   async request() {
    throw new Error('late operation must not reach transport');
   }
  }
 });

 await withFetchStub(async () => {
  const controller = createControlController({
   context,
   sandboxURL: 'chrome-extension://sandbox-test/src/scripting/sandbox/sandbox.html',
   workerURL: 'chrome-extension://sandbox-test/src/scripting/sandbox/worker.js',
   document: doc
  });
  await controller.ready;
  controller.stop();
  await controller.retired;
  harness.lateOperation();
  await pause(10);
  assert.equal(harness.replies.length, 0);
  assert.equal(controller.snapshot().pending, 0);
  assert.equal(controller.snapshot().ownedFrames, 0);
 });
});

test('Stop during a pending HTTP operation suppresses the late error reply and releases resources', {timeout: 3000}, async () => {
  let resolveResponse, markStarted, transportSignal, requests = 0;
  const response = new Promise(resolve => { resolveResponse = resolve; });
  const started = new Promise(resolve => { markStarted = resolve; });
  const harness = controllerHarness({onExecute(port) {
    port.postMessage({kind: 'operation', runId: identity.runId, ownerEpoch: identity.ownerEpoch, id: 1,
      envelope: {requestId: 'pending-http', identity, revision, target,
        operation: {kind: 'service', method: 'AXIOS_GET', args: encodeValue([{url: 'https://a.example/error'}])}}});
  }});
  const doc = fakeDocument(harness);
  const context = createRunContext({identity, revision, target, dom: doc, transport: {
    request(_envelope, {signal}) { requests++; transportSignal = signal; markStarted(); return response; }
  }});
  await withFetchStub(async () => {
    const controller = createControlController({context, document: doc,
      sandboxURL: 'chrome-extension://sandbox-test/sandbox.html', workerURL: 'chrome-extension://sandbox-test/worker.js'});
    try {
      await controller.ready;
      const result = controller.execute('return axiosx.get("https://a.example/error");', {});
      await started;
      assert.equal(controller.resourceSnapshot().pending, 1);
      controller.stop();
      assert.equal(transportSignal.aborted, true);
      assert.equal((await result).status, 'stopped');
      resolveResponse({requestId: 'pending-http', error: {code: 'E_HTTP', message: 'HTTP 500', cause: httpCause(500)}});
      await controller.retired;
      await controller.resourceReleased;
      await pause(10);
      assert.equal(requests, 1);assert.equal(harness.replies.length, 0);assert.equal(harness.retires.length, 1);
      assert.equal(controller.resourceSnapshot().pending, 0);assert.equal(controller.snapshot().ownedFrames, 0);
    } finally { controller.stop(); }
  });
});

async function forwardError(error, {asReply = false} = {}) {
 const harness = controllerHarness({onExecute(port) {
  port.postMessage({kind: 'operation', runId: identity.runId, ownerEpoch: identity.ownerEpoch, id: 1,
   envelope: {requestId: 'http-cause', identity, revision, target,
    operation: {kind: 'service', method: 'AXIOS_GET', args: encodeValue([{url: 'https://a.example/error'}])}}});
 }});
 const doc = fakeDocument(harness);
 const context = createRunContext({identity, revision, target, dom: doc, transport: {
  async request(envelope) {
   if (asReply) return {requestId: envelope.requestId, error};
   throw error;
  }
 }});
 return withFetchStub(async () => {
  const controller = createControlController({context, document: doc,
   sandboxURL: 'chrome-extension://sandbox-test/sandbox.html', workerURL: 'chrome-extension://sandbox-test/worker.js'});
  await controller.ready;
  const result = await controller.execute('return axiosx.get("https://a.example/error");', {});
  await controller.retired;
  assert.equal(harness.replies.length, 1);
  assert.equal(controller.resourceSnapshot().pending, 0);
  assert.equal(controller.snapshot().ownedFrames, 0);
  return result.error;
 });
}

const httpCause = status => ({status, response: {status, statusText: 'Rejected',
 data: {accepted: false, items: [0, null, '']}, headers: {'x-receipt': 'observed'},
 config: {url: 'https://a.example/error', method: 'get'}}});

test('sandbox forwards only bounded E_HTTP status/response cause through the official codec', async () => {
 for (const status of [404, 429, 500]) {
  const cause = httpCause(status);
  const error = await forwardError({code: 'E_HTTP', message: `HTTP ${status}`, cause: {...cause, extra: 'private'}}, {asReply: true});
  assert.equal(error.code, 'E_HTTP');
  assert.deepEqual(error.cause, decodeValue(encodeValue(cause)));
  assert.equal(error.status, undefined); assert.equal(error.response, undefined);
 }
 const other = await forwardError(new PageError('E_NETWORK', 'transport', httpCause(500)));
 assert.equal(other.cause, undefined);
});

test('sandbox drops invalid, oversized, deep and accessor HTTP causes without invoking getters', async () => {
 let getterReads = 0;
 const accessor = {status: 500};
 Object.defineProperty(accessor, 'response', {enumerable: true, get() { getterReads++; return {}; }});
 const nested = httpCause(500);
 Object.defineProperty(nested.response.data, 'secret', {enumerable: true, get() { getterReads++; return 'secret'; }});
 const cyclic = httpCause(500); cyclic.response.data.self = cyclic;
 const arrayResponse = []; arrayResponse.status = 500;
 let deep = 'leaf'; for (let i = 0; i <= VALUE_LIMITS.depth; i++) deep = {child: deep};
 const invalid = [accessor, nested, cyclic, {status: 500}, {status: 500, response: arrayResponse},
  {status: 500, response: {status: 404}},
  {status: '500', response: {status: 500}}, {status: 500.5, response: {status: 500.5}},
  {status: 600, response: {status: 600}}, {status: 0, response: {status: 0}},
  {status: 500, response: {status: 500, data: 'x'.repeat(VALUE_LIMITS.bytes)}},
  {status: 500, response: {status: 500, data: deep}},
  {status: 500, response: {status: 500, data: () => 'private'}}];
 for (const cause of invalid) {
  const error = await forwardError(new PageError('E_HTTP', 'HTTP 500', cause));
  assert.equal(error.code, 'E_HTTP'); assert.equal(error.cause, undefined);
 }
 const error = new PageError('E_HTTP', 'HTTP 500');
 Object.defineProperty(error, 'cause', {get() { getterReads++; return httpCause(500); }});
 assert.equal((await forwardError(error)).cause, undefined);
 assert.equal(getterReads, 0);
});

test('actual Node Worker catch receives sandbox HTTP cause without MAIN top-level fields', {timeout: 5000}, async () => {
 let thread, peer;
 const harness = controllerHarness({
  onReply(data) { peer.postMessage(data); },
  onExecute(port) {
   const channel = new MessageChannel(); peer = channel.port2;
   peer.onmessage = ({data}) => port.postMessage(data);
   peer.start();
   thread = new Worker(`
    const {parentPort, workerData} = require('node:worker_threads');
    import(workerData.proxyURL).then(async ({createWorkerPageProxy}) => {
     const proxy = createWorkerPageProxy(workerData);
     try {
      await proxy.services.axiosx.get('https://a.example/error');
      parentPort.postMessage({unexpected: 'resolved'});
     } catch (error) {
      parentPort.postMessage({code: error.code, cause: error.cause,
       hasTopStatus: Object.hasOwn(error, 'status'), hasTopResponse: Object.hasOwn(error, 'response')});
     } finally { proxy.dispose(); }
    }).catch(error => { throw error; });
   `, {eval: true, workerData: {port: channel.port1, identity, revision, target,
    proxyURL: new URL('../../src/scripting/sandbox/page-proxy.js', import.meta.url).href}, transferList: [channel.port1]});
   thread.on('message', value => port.postMessage({kind: 'result', runId: identity.runId,
    ownerEpoch: identity.ownerEpoch, value: encodeValue(value)}));
   thread.on('error', error => port.postMessage({kind: 'error', runId: identity.runId,
    ownerEpoch: identity.ownerEpoch, error: {code: 'E_TEST_WORKER', message: error.message}}));
  }
 });
 const doc = fakeDocument(harness), cause = httpCause(500);
 const context = createRunContext({identity, revision, target, dom: doc, transport: {
  async request(envelope) {
   assert.equal(envelope.operation.method, 'AXIOS_GET');
   return {requestId: envelope.requestId, error: {code: 'E_HTTP', message: 'HTTP 500', cause}};
  }
 }});
 try {
  await withFetchStub(async () => {
   const controller = createControlController({context, document: doc,
    sandboxURL: 'chrome-extension://sandbox-test/sandbox.html', workerURL: 'chrome-extension://sandbox-test/worker.js'});
   await controller.ready;
   const result = await controller.execute('/* physical Worker runs the axiosx catch */', {});
   await controller.retired;
   assert.equal(result.status, 'succeeded');
   assert.deepEqual(decodeValue(result.value), {code: 'E_HTTP', cause, hasTopStatus: false, hasTopResponse: false});
   assert.equal(harness.replies.length, 1);
   assert.equal(controller.resourceSnapshot().pending, 0);
  });
 } finally { await thread?.terminate(); peer?.close(); context.dispose(); }
});
