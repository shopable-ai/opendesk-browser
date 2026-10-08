import test from 'node:test';
import assert from 'node:assert/strict';
import {createRunContext} from '../../src/framework/context.js';
import {PageError, encodeValue} from '../../src/framework/control/value.js';
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

function controllerHarness({owner = identity, onExecute} = {}) {
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
