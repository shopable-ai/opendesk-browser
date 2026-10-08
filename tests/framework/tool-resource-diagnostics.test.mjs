import test from 'node:test';
import assert from 'node:assert/strict';
import {snapshotToolResources} from '../../src/ui/resource-diagnostics.js';
import {createRunContext} from '../../src/framework/context.js';

const idle = () => ({client: {pending: 0, timers: 0, subscriptions: 3, ports: 1},
  blobs: {blobs: 0}, controllers: [], contexts: [], host: {subscriptions: 0},
  editor: {pending: 0, timers: 0, subscriptions: 5}});

test('tool snapshot composes the shared client once and reports each live owner', () => {
  const owners = idle();
  owners.editor.pending = 2; owners.editor.timers = 1; owners.blobs.blobs = 1;
  owners.contexts.push({pending: 1, timers: 1, subscriptions: 1});
  const before = structuredClone(owners);
  const result = snapshotToolResources(owners, {subscriptions: 4});
  assert.deepEqual(result.counts, {pending: 3, timers: 2, subscriptions: 13, ports: 1, workers: 0, blobs: 1});
  assert.equal(result.scope, 'extension-tool-document');
  assert.deepEqual(owners, before, 'reading never modifies the owner state');
  assert.deepEqual(result.owners, {...owners, shell: {subscriptions: 4}});
});

test('missing owner counters and live child realms cannot become a complete baseline', () => {
  const missing = idle(); delete missing.client.timers;
  assert.equal(snapshotToolResources(missing, {subscriptions: 0}).counts, null);
  const active = idle(); active.controllers.push({pending: 0, timers: 0, subscriptions: 0, ports: 1, workers: 1, blobs: 0});
  const result = snapshotToolResources(active, {subscriptions: 0});
  assert.equal(result.counts, null);
  assert.match(result.observationMissing, /child realm/);
});

test('current context counts pending cancellation, deadline timer and the actual upstream listener', async () => {
  const upstream = new AbortController();
  const context = createRunContext({identity: {runId: 'resources', ownerEpoch: 1},
    revision: {revision: 1, sourceHash: 'a'.repeat(64)}, target: {tabId: 1, frameId: 0, documentId: 'doc'},
    transport: {request: () => new Promise(() => {})}, signal: upstream.signal,
    deadline: performance.now() + 30000, dom: null});
  try {
    assert.deepEqual(context.resourceSnapshot(), {pending: 0, timers: 1, subscriptions: 1});
    const request = context.page.title();
    const rejected = assert.rejects(request, {code: 'E_CANCELLED'});
    assert.equal(context.resourceSnapshot().pending, 1);
    upstream.abort(); await rejected;
    assert.deepEqual(context.resourceSnapshot(), {pending: 0, timers: 0, subscriptions: 0});
  } finally { context.dispose(); }
});
