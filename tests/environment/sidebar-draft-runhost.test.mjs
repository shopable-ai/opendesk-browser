import test from 'node:test';
import assert from 'node:assert/strict';
import {createRunHost} from '../../src/run-host.js';
import {decodeValue} from '../../src/platform/page-port/codec.js';

function stubHost() {
  const requests = [];
  const client = {
    ready: Promise.resolve(),
    subscribeConnection: () => () => {},
    controller: {
      async startControllerRun(request) {
        requests.push(structuredClone(request));
        // A duplicate reply lets us check the admission transport without
        // creating a fake Worker, native effect, or durable result.
        return {runId: crypto.randomUUID(), duplicate: true};
      },
    },
  };
  const document = {defaultView: {addEventListener() {}, removeEventListener() {}}};
  const host = createRunHost({client, document, templateModuleFactory: null});
  return {host, requests};
}

test('RunHost freezes a draft source variant and parameters before awaiting the host connection', async () => {
  const {host, requests} = stubHost();
  const source = {kind: 'draft', sourceUtf8: 'return {value:params.value};'};
  const params = {value: 5}, target = {mode: 'borrowed', tabId: 5, frameId: 0, documentId: 'test-document'};
  const running = host.start({source, params, target, deadlineAt: Date.now() + 30000});
  source.sourceUtf8 = 'return {value:999};';
  params.value = 999;
  target.tabId = 999;
  target.documentId = 'modified-after-click';
  await assert.rejects(running, error => error.code === 'E_EFFECT_UNKNOWN');
  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0].source, {kind: 'draft', sourceUtf8: 'return {value:params.value};'});
  assert.equal(decodeValue(requests[0].paramsWire).value, 5);
  assert.deepEqual(requests[0].target, {mode: 'borrowed', tabId: 5, frameId: 0, documentId: 'test-document'});
  assert.equal(requests[0].scriptId, undefined);
  assert.equal(requests[0].revision, undefined);
  assert.equal(requests[0].contentHash, undefined);
  host.dispose();
});

test('saved script API retains explicit scriptId/revision/contentHash admission', async () => {
  const {host, requests} = stubHost();
  const hash = 'a'.repeat(64);
  const target = {mode: 'borrowed', tabId: 5, frameId: 0, documentId: 'exact'};
  const running = host.start({scriptId: 'saved-r1', revision: 1, contentHash: hash, params: {}, target});
  target.tabId = 99;
  target.documentId = 'changed';
  await assert.rejects(running, error => error.code === 'E_EFFECT_UNKNOWN');
  assert.deepEqual(requests[0].target, {mode: 'borrowed', tabId: 5, frameId: 0, documentId: 'exact'});
  assert.deepEqual(Object.fromEntries(['scriptId', 'revision', 'contentHash'].map(key => [key, requests[0][key]])),
    {scriptId: 'saved-r1', revision: 1, contentHash: hash});
  assert.equal(requests[0].source, undefined);
  host.dispose();
});
