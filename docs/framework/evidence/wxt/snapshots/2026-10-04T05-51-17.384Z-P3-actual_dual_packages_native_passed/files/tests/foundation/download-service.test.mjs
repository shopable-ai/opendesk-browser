import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { createDownloadService, createHostBlobRegistry, hashArtifactBytes } from '../../src/platform/downloads/index.js';
import { validate } from '../../src/platform/protocol.js';
import { createStorageMethods } from '../../src/platform/storage/repository.js';

if (!globalThis.crypto) globalThis.crypto = webcrypto;
const extensionId = 'abcdefghijklmnopabcdefghijklmnop';
const auth = { registrationId: 'reg-A', hostInstanceId: 'host-A', hostDocumentId: 'doc-A', browserSessionIncarnation: 'session-A' };
const sender = { url: `chrome-extension://${extensionId}/tool.html`, documentId: 'doc-A' };
const baseTime = Date.parse('2026-10-01T18:00:00Z');
const bytes = text => new TextEncoder().encode(text);
const clone = value => structuredClone(value);

// Injected storage models serialized atomic commits and rollback. It does not
// claim to test IndexedDB transaction scheduling or actual Chrome downloads.
function memoryStorage() {
  let data = new Map(['templates', 'runs', 'commandJournal', 'pageSnapshots', 'records', 'batches', 'exportJobs', 'artifacts', 'downloadReceipts', 'entitlements'].map(name => [name, new Map()]));
  let tail = Promise.resolve();
  const storage = {
    afterCommit: null,
    transaction(stores, mode, callback) {
      const run = tail.then(async () => {
        const working = clone(data);
        const checked = store => { assert.ok(stores.includes(store)); return working.get(store); };
        const tx = {
          get: async (store, key) => clone(checked(store).get(key)),
          put: async (store, value, key) => { assert.equal(mode, 'readwrite'); assert.notEqual(key, undefined); checked(store).set(key, clone(value)); },
          delete: async (store, key) => { assert.equal(mode, 'readwrite'); checked(store).delete(key); },
          all: async store => clone([...checked(store).values()]),
        };
        const value = await callback(tx);
        if (mode === 'readwrite') {
          data = working;
          if (storage.afterCommit) storage.afterCommit(value);
        }
        return value;
      });
      tail = run.catch(() => {});
      return run;
    },
  };
  return storage;
}

function event() {
  const listeners = new Set();
  return { addListener: fn => listeners.add(fn), removeListener: fn => listeners.delete(fn),
    emit(value) { for (const fn of listeners) fn(value); }, get size() { return listeners.size; } };
}

async function setup({ rows = 2, runState = 'completed' } = {}) {
  let ms = baseTime;
  let nextUrl = 1;
  const revoked = [];
  const items = new Map();
  const calls = [], searches = [];
  let downloadHook = async options => {
    const id = calls.length;
    items.set(id, { id, url: options.url, byExtensionId: extensionId, startTime: new Date(ms).toISOString(), state: 'in_progress' });
    return id;
  };
  let searchHook = null;
  const api = { runtime: { id: extensionId }, downloads: {
    onCreated: event(), onChanged: event(),
    async download(options) { calls.push(clone(options)); return downloadHook(options); },
    async search(query) {
      searches.push(clone(query));
      if (searchHook) return searchHook(query);
      return clone([...items.values()].filter(item => query.id !== undefined ? item.id === query.id : item.url === query.url));
    },
  } };
  const storage = memoryStorage();
  await storage.transaction(['runs'], 'readwrite', tx => tx.put('runs', {
    ...auth, runId: 'run-A', ownerEpoch: 1, runRevision: 1, state: runState,
    templateHash: 'a'.repeat(64), commitSeq: 2, committedCount: rows, committedPages: 1, tombstoned: false,
  }, 'run-A'));
  const authenticate = async (actual, registrationId) => {
    assert.equal(actual, sender);
    assert.equal(registrationId, auth.registrationId);
    return clone(auth);
  };
  const makeService = () => createDownloadService({ storage, api, clock: () => ms, assertHost: authenticate });
  const service = makeService();
  const registry = createHostBlobRegistry({ clock: () => ms, url: {
    createObjectURL: () => `blob:chrome-extension://${extensionId}/fresh-${nextUrl++}`,
    revokeObjectURL: url => revoked.push(url),
  } });
  const environment = { storage, api, items, calls, searches, registry, revoked, service, makeService,
    setTime(value) { ms = value; }, advance(value) { ms += value; },
    download(hook) { downloadHook = hook; }, search(hook) { searchHook = hook; },
    async prepare(volumes = [{ text: '[1,2]', rowCount: rows }], requestId = 'request-A', partialConfirmed = false) {
      const intent = await service.prepareExport({ runId: 'run-A', format: 'json', csvMode: 'spreadsheet-safe', partialConfirmed, requestId }, sender);
      const prepared = await service.prepareAttempts({ exportJobId: intent.exportJobId, volumes: volumes.map((v, index) => ({
        bytes: bytes(v.text), filename: `rows-${index}.json`, rowCount: v.rowCount,
        blobUrl: registry.create(bytes(v.text), 'application/json'),
      })) }, sender);
      return { intent, ...prepared };
    },
    async dispatch(attempt, target = service) {
      const ack = await target.dispatchDownload({ attemptId: attempt.attemptId }, sender);
      await target.drain(); return ack;
    },
    async reconcile(attempt, target = service) { return target.reconcileDownload({ attemptId: attempt.attemptId }); },
    async get(store, key) { return storage.transaction([store], 'readonly', tx => tx.get(store, key)); },
    async tombstone() {
      await storage.transaction(['runs'], 'readwrite', async tx => { const run = await tx.get('runs', 'run-A'); run.tombstoned = true; await tx.put('runs', run, 'run-A'); });
      await service.abandonRun({ runId: 'run-A' });
    },
  };
  return environment;
}

test('prepare pins a watermark and persists byte hash; external descriptors satisfy frozen schema', async () => {
  const e = await setup();
  const p = await e.prepare();
  for (const value of p.artifacts) validate('Artifact', value);
  for (const value of p.attempts) validate('DownloadAttempt', value);
  validate('ExportJob', p.job);
  assert.equal(p.artifacts[0].sha256, await hashArtifactBytes(bytes('[1,2]')));
  assert.equal(p.intent.sealWatermark, 2);
  assert.equal((await e.get('commandJournal', `reader:${p.intent.readerPinId}`)).released, false);
  assert.equal((await e.service.readArtifact({ artifactId: p.artifacts[0].artifactId }, sender)).bytes.toString(), bytes('[1,2]').toString());
  assert.equal(e.calls.length, 0);
});

test('partial export requires confirmation; request IDs bind immutable intent', async () => {
  const e = await setup({ runState: 'interrupted' });
  await assert.rejects(e.prepare(), /Partial/);
  const p = await e.prepare(undefined, 'partial', true);
  const again = await e.service.prepareExport({ runId: 'run-A', format: 'json', csvMode: 'spreadsheet-safe', partialConfirmed: true, requestId: 'partial' }, sender);
  assert.equal(again.exportJobId, p.job.exportJobId);
  await assert.rejects(e.service.prepareExport({ runId: 'run-A', format: 'csv', csvMode: 'spreadsheet-safe', partialConfirmed: true, requestId: 'partial' }, sender), /different content/);
});

test('host registration mismatch and tombstones reject creation/dispatch', async () => {
  const e = await setup(); const p = await e.prepare();
  const wrong = createDownloadService({ storage: e.storage, api: e.api, clock: () => baseTime, assertHost: async () => ({ ...auth, hostDocumentId: 'other' }) });
  await assert.rejects(wrong.dispatchDownload({ attemptId: p.attempts[0].attemptId }, sender), /registration/);
  await e.tombstone();
  await assert.rejects(e.dispatch(p.attempts[0]), /deleted/);
  assert.equal(e.calls.length, 0);
});

test('double dispatch and reconstructed service invoke Chrome at most once', async () => {
  const e = await setup(); const p = await e.prepare(); const a = p.attempts[0];
  const ack = await Promise.all([e.service.dispatchDownload({ attemptId: a.attemptId }, sender), e.service.dispatchDownload({ attemptId: a.attemptId }, sender)]);
  await e.service.drain();
  assert.deepEqual(ack[0], { accepted: true, state: 'dispatched' });
  await e.dispatch(a, e.makeService());
  assert.equal(e.calls.length, 1);
  assert.equal((await e.reconcile(a)).attempt.submissionCount, 1);
});

test('ACK-gap after durable dispatch does not replay and becomes mapping_unknown', async () => {
  const e = await setup(); const a = (await e.prepare()).attempts[0];
  e.storage.afterCommit = result => { if (result?.state === 'dispatched') throw new Error('process lost after commit'); };
  await assert.rejects(e.dispatch(a), /process lost/);
  e.storage.afterCommit = null;
  assert.equal(e.calls.length, 0);
  const recovered = e.makeService();
  await e.dispatch(a, recovered);
  e.advance(60001);
  const result = await e.reconcile(a, recovered);
  assert.equal(result.attempt.state, 'mapping_unknown');
  assert.equal(result.attempt.submissionCount, 1);
  assert.equal(result.receipt, null);
  assert.equal(result.attempt.resourceReleasedAt, null);
  assert.equal(e.calls.length, 0);
});

test('short dispatch ACK does not wait for callback and cannot be resubmitted', async () => {
  const e = await setup(); const a = (await e.prepare()).attempts[0];
  let callback; e.download(() => new Promise(resolve => { callback = resolve; }));
  assert.deepEqual(await e.service.dispatchDownload({ attemptId: a.attemptId }, sender), { accepted: true, state: 'dispatched' });
  await e.service.dispatchDownload({ attemptId: a.attemptId }, sender);
  assert.equal(e.calls.length, 1);
  callback(undefined); await e.service.drain();
});

test('onCreated/search deduplicates an ID and started is not delivery complete', async () => {
  const e = await setup(); const a = (await e.prepare()).attempts[0];
  e.download(() => undefined); const detach = e.service.attach();
  await e.dispatch(a);
  const item = { id: 7, url: a.blobUrl, byExtensionId: extensionId, startTime: new Date(baseTime).toISOString(), state: 'in_progress' };
  e.items.set(7, item); e.api.downloads.onCreated.emit(item); e.api.downloads.onCreated.emit(item);
  await e.service.drain();
  const result = await e.reconcile(a);
  assert.equal(result.attempt.downloadId, 7);
  assert.deepEqual(result.attempt.candidateDownloadIds, [7]);
  assert.equal(result.job.state, 'delivering');
  assert.equal(result.receipt.browserDownloadComplete, false);
  assert.equal(result.receipt.diskHashVerified, false);
  detach(); assert.equal(e.api.downloads.onCreated.size, 0);
});

test('multiple full-identity candidates conflict and never redownload', async () => {
  const e = await setup(); const a = (await e.prepare()).attempts[0];
  e.download(() => undefined); await e.dispatch(a);
  for (const id of [7, 8]) e.items.set(id, { id, url: a.blobUrl, byExtensionId: extensionId, startTime: new Date(baseTime).toISOString(), state: 'complete' });
  e.advance(1001);
  const result = await e.reconcile(a);
  assert.equal(result.attempt.state, 'conflict');
  assert.equal(result.attempt.downloadId, null);
  assert.equal(result.job.state, 'delivery_failed');
  assert.equal(result.receipt, null);
  await e.dispatch(a); assert.equal(e.calls.length, 1);
});

test('known callback ID is authoritative; another candidate conflicts rather than replacing it', async () => {
  const e = await setup(); const a = (await e.prepare()).attempts[0];
  e.download(() => 7); await e.dispatch(a);
  const detach = e.service.attach();
  const other = { id: 8, url: a.blobUrl, byExtensionId: extensionId, startTime: new Date(baseTime).toISOString(), state: 'complete' };
  e.items.set(8, other); e.api.downloads.onCreated.emit(other); await e.service.drain();
  assert.equal((await e.reconcile(a)).attempt.state, 'conflict');
  assert.ok(e.searches.some(q => q.id === 7));
  assert.equal((await e.reconcile(a)).receipt, null);
  detach();
});

test('wrong URL/extension/time and missing fields never bind by filename', async () => {
  const e = await setup(); const a = (await e.prepare()).attempts[0];
  e.download(() => undefined); await e.dispatch(a);
  const item = { id: 7, url: a.blobUrl, byExtensionId: extensionId, startTime: new Date(baseTime).toISOString(), state: 'complete', filename: a.filename };
  const variants = [{ ...item, url: `${a.blobUrl}-wrong` }, { ...item, byExtensionId: 'other' },
    { ...item, startTime: new Date(baseTime - 2001).toISOString() }, { ...item, startTime: new Date(baseTime + 60001).toISOString() }, { ...item, startTime: undefined }];
  e.search(() => variants); e.advance(60001);
  const result = await e.reconcile(a);
  assert.equal(result.attempt.state, 'mapping_unknown'); assert.equal(result.receipt, null);
});

test('clock rollback cannot bind unique-looking mapping evidence', async () => {
  const e = await setup(); const a = (await e.prepare()).attempts[0];
  e.download(() => undefined); await e.dispatch(a);
  e.items.set(7, { id: 7, url: a.blobUrl, byExtensionId: extensionId, startTime: new Date(baseTime).toISOString(), state: 'complete' });
  e.setTime(baseTime - 1000);
  assert.equal((await e.reconcile(a)).attempt.downloadId, null);
});

test('onChanged complete must be confirmed by ID search; interrupted keeps Chrome reason', async () => {
  const e = await setup(); const a = (await e.prepare()).attempts[0]; await e.dispatch(a);
  const detach = e.service.attach();
  e.api.downloads.onChanged.emit({ id: 1, state: { current: 'complete' } }); await e.service.drain();
  assert.equal((await e.reconcile(a)).attempt.state, 'in_progress');
  e.items.get(1).state = 'interrupted'; e.items.get(1).error = 'USER_CANCELED';
  e.api.downloads.onChanged.emit({ id: 1, state: { current: 'interrupted' } }); await e.service.drain();
  const result = await e.reconcile(a);
  assert.equal(result.attempt.state, 'interrupted');
  assert.equal(result.receipt.interruptReason, 'USER_CANCELED');
  assert.equal(result.receipt.evidence, 'onChanged+search');
  detach();
});

test('10-minute timeout is unknown; late complete resolves only its original job', async () => {
  const e = await setup(); const p = await e.prepare(); const a = p.attempts[0]; await e.dispatch(a);
  e.advance(600000);
  const timed = await e.reconcile(a);
  assert.equal(timed.attempt.state, 'deadline_unknown');
  assert.equal(timed.receipt.observedState, 'in_progress');
  assert.ok(timed.attempt.timedOutAt); assert.equal(timed.attempt.resourceReleasedAt, null);
  assert.equal(e.registry.release(timed.attempt), true);
  timed.attempt = await e.service.recordResourceRelease({ attemptId: a.attemptId }, sender);
  assert.ok(timed.attempt.resourceReleasedAt);
  const retry = await e.service.retryExport({ exportJobId: p.job.exportJobId, explicitUserAction: true, requestId: 'retry' }, sender,
    { blobUrls: [e.registry.create(bytes('[1,2]'), 'application/json')] });
  const b = (await e.get('downloadReceipts', `attempt:${retry.attemptIds[0]}`)).attempt;
  await e.dispatch(b); e.items.get(1).state = 'complete';
  const resolved = await e.reconcile(a);
  assert.equal(resolved.job.state, 'delivery_complete'); assert.equal(resolved.receipt.late, true);
  assert.equal(resolved.receipt.diskHashVerified, false);
  assert.equal(resolved.attempt.timedOutAt, timed.attempt.timedOutAt);
  assert.equal(resolved.attempt.resourceReleasedAt, timed.attempt.resourceReleasedAt);
  assert.equal((await e.reconcile(b)).job.state, 'delivering');
  assert.notEqual(b.blobUrl, a.blobUrl); assert.notEqual(b.exportJobId, a.exportJobId);
});

test('retry freezes old prepared submission; duplicate retry returns same new job', async () => {
  const e = await setup(); const p = await e.prepare();
  const request = { exportJobId: p.job.exportJobId, explicitUserAction: true, requestId: 'retry' };
  await assert.rejects(e.service.retryExport(request, sender, { blobUrls: [p.attempts[0].blobUrl] }), /reused/);
  const retry = await e.service.retryExport(request, sender, { blobUrls: [e.registry.create(bytes('[1,2]'), 'application/json')] });
  await assert.rejects(e.dispatch(p.attempts[0]), error => error.code === 'E_OWNER');
  assert.deepEqual(await e.service.retryExport(request, sender), retry);
  assert.equal(e.calls.length, 0);
});

test('multi-volume aggregate waits for every volume and releases pin only when all are releasable', async () => {
  const e = await setup(); const p = await e.prepare([{ text: '[1]', rowCount: 1 }, { text: '[2]', rowCount: 1 }]);
  for (const a of p.attempts) await e.dispatch(a);
  e.items.get(1).state = 'complete';
  assert.equal((await e.reconcile(p.attempts[0])).job.state, 'delivering');
  assert.equal((await e.get('commandJournal', `reader:${p.intent.readerPinId}`)).released, false);
  e.items.get(2).state = 'complete';
  assert.equal((await e.reconcile(p.attempts[1])).job.state, 'delivery_complete');
  assert.equal((await e.get('commandJournal', `reader:${p.intent.readerPinId}`)).released, true);
});

test('single abandoned volume causes delivery_failed; late evidence cannot revive it', async () => {
  const e = await setup(); const p = await e.prepare([{ text: '[1]', rowCount: 1 }, { text: '[2]', rowCount: 1 }]);
  for (const a of p.attempts) await e.dispatch(a);
  await e.storage.transaction(['downloadReceipts'], 'readwrite', async tx => {
    const key = `attempt:${p.attempts[0].attemptId}`, row = await tx.get('downloadReceipts', key);
    row.attempt.state = 'abandoned'; await tx.put('downloadReceipts', row, key);
  });
  e.items.get(1).state = 'complete';
  const result = await e.reconcile(p.attempts[0]);
  assert.equal(result.attempt.state, 'abandoned'); assert.equal(result.receipt.observedState, 'complete');
  assert.equal(result.job.state, 'delivery_failed');
});

test('explicit job abandon and run tombstone retain late audit without resurrecting projection', async () => {
  for (const deleted of [false, true]) {
    const e = await setup(); const p = await e.prepare(); const a = p.attempts[0]; await e.dispatch(a);
    if (deleted) await e.tombstone(); else await e.service.abandonExport({ exportJobId: p.job.exportJobId, explicitUserAction: true }, sender);
    e.items.get(1).state = 'complete';
    const result = await e.reconcile(a);
    assert.equal(result.attempt.state, 'abandoned'); assert.equal(result.job.state, 'abandoned');
    assert.equal(result.receipt.browserDownloadComplete, true); assert.equal(result.receipt.diskHashVerified, false);
    if (deleted) assert.equal((await e.get('runs', 'run-A')).tombstoned, true);
  }
});

test('lost callback can recover via unique full URL; finite mapping search throttles repeated observations', async () => {
  const e = await setup(); const a = (await e.prepare()).attempts[0];
  e.download(() => { throw new Error('callback lost'); }); await e.dispatch(a);
  await e.reconcile(a); const count = e.searches.length;
  await e.reconcile(a); await e.reconcile(a); assert.equal(e.searches.length, count);
  e.advance(60001); assert.equal((await e.reconcile(a)).attempt.state, 'mapping_unknown');
  e.items.set(7, { id: 7, url: a.blobUrl, byExtensionId: extensionId, startTime: new Date(baseTime + 1).toISOString(), state: 'complete' });
  e.advance(60001);
  const result = await e.reconcile(a);
  assert.equal(result.job.state, 'delivery_complete'); assert.equal(result.receipt.late, true);
  assert.equal(e.calls.length, 1);
});

test('URL revoke waits for complete/interrupted/abandon or deadline and respects local reader pins', async () => {
  const e = await setup(); const a = (await e.prepare()).attempts[0]; await e.dispatch(a);
  const current = (await e.reconcile(a)).attempt;
  assert.equal(e.registry.release(current), false);
  e.advance(60001); assert.equal(e.registry.release({ ...current, state: 'mapping_unknown' }), false);
  const unpin = e.registry.pin(a.blobUrl);
  e.items.get(1).state = 'complete'; const complete = (await e.reconcile(a)).attempt;
  assert.equal(complete.resourceReleasedAt, null);
  assert.equal(e.registry.release(complete), false);
  unpin(); assert.equal(e.registry.release(complete), true); assert.deepEqual(e.revoked, [a.blobUrl]);
  assert.ok((await e.service.recordResourceRelease({ attemptId: a.attemptId }, sender)).resourceReleasedAt);
  assert.equal(e.registry.release(complete), false);
});

test('deadline URL release preserves metadata and completion evidence after host resources disappear', async () => {
  const e = await setup(); const a = (await e.prepare()).attempts[0]; await e.dispatch(a);
  e.advance(600000); const deadline = (await e.reconcile(a)).attempt;
  assert.equal(e.registry.release(deadline), true);
  await e.service.recordResourceRelease({ attemptId: a.attemptId }, sender);
  assert.equal((await e.get('downloadReceipts', `attempt:${a.attemptId}`)).attempt.blobUrl, a.blobUrl);
  e.items.get(1).state = 'complete'; const complete = await e.reconcile(a);
  assert.equal(complete.job.state, 'delivery_complete');
  assert.equal((await e.reconcile(a)).attempt.state, 'complete');
});

test('attach is idempotent; restart pending reconciliation never dispatches', async () => {
  const e = await setup(); const p = await e.prepare(); const a = p.attempts[0]; await e.dispatch(a);
  assert.equal(e.service.attach(), e.service.attach());
  assert.equal(e.api.downloads.onChanged.size, 1);
  e.items.get(1).state = 'complete';
  const recovered = e.makeService(); const results = await recovered.reconcilePending();
  assert.equal(results[0].job.state, 'delivery_complete'); assert.equal(e.calls.length, 1);
});

test('top-level broker handlers work without attach and confirm changed state through search', async () => {
  const e = await setup(); const a = (await e.prepare()).attempts[0];
  e.download(() => undefined); await e.dispatch(a);
  const item = { id: 0, url: a.blobUrl, byExtensionId: extensionId, startTime: new Date(baseTime).toISOString(), state: 'in_progress' };
  e.items.set(0, item);
  await e.service.handleCreated(item);
  assert.equal(e.api.downloads.onCreated.size, 0);
  assert.equal((await e.reconcile(a)).attempt.downloadId, 0);
  item.state = 'complete'; await e.service.handleChanged({ id: 0, state: { current: 'complete' } });
  const result = await e.reconcile(a);
  assert.equal(result.job.state, 'delivery_complete'); assert.equal(result.receipt.evidence, 'onChanged+search');
  assert.equal((await e.get('downloadReceipts', `attempt:${a.attemptId}`)).boundDownloadId, 0);
});

test('callback-only Chrome API persists authoritative ID and handles runtime.lastError as unknown', async () => {
  for (const errored of [false, true]) {
    const e = await setup(); const a = (await e.prepare()).attempts[0];
    e.api.downloads.download = (options, callback) => {
      e.calls.push(options);
      if (errored) { e.api.runtime.lastError = { message: 'Download uncertain' }; callback(undefined); delete e.api.runtime.lastError; }
      else { e.items.set(9, { id: 9, url: a.blobUrl, byExtensionId: extensionId, startTime: new Date(baseTime).toISOString(), state: 'in_progress' }); callback(9); }
    };
    e.api.downloads.search = (query, callback) => callback(clone([...e.items.values()].filter(item => item.id === query.id)));
    await e.dispatch(a);
    assert.equal((await e.reconcile(a)).attempt.downloadId, errored ? null : 9);
    assert.equal(e.calls.length, 1);
  }
});

test('conflict retains its Blob through deadline; pending audits stop after the deadline bound', async () => {
  const e = await setup(); const a = (await e.prepare()).attempts[0];
  e.download(() => undefined); await e.dispatch(a);
  for (const id of [7, 8]) e.items.set(id, { id, url: a.blobUrl, byExtensionId: extensionId, startTime: new Date(baseTime).toISOString(), state: 'in_progress' });
  e.advance(1001); const conflict = (await e.reconcile(a)).attempt;
  assert.equal(conflict.state, 'conflict'); assert.equal(conflict.resourceReleasedAt, null);
  assert.equal(e.registry.release(conflict), false);
  e.advance(600000); assert.equal(e.registry.release(conflict), true);
  await e.service.reconcilePending();
  const countConflict = e.searches.length;
  await e.service.reconcilePending(); assert.equal(e.searches.length, countConflict);
  const conflictJob = await e.get('exportJobs', conflict.exportJobId);
  assert.equal((await e.get('commandJournal', `reader:export:${conflictJob.exportJobId}`)).released, true);

  const unknown = await setup(); const b = (await unknown.prepare()).attempts[0];
  unknown.download(() => undefined); await unknown.dispatch(b); unknown.advance(600000);
  await unknown.service.reconcilePending(); const count = unknown.searches.length;
  assert.equal((await unknown.get('downloadReceipts', `attempt:${b.attemptId}`)).attempt.state, 'deadline_unknown');
  await unknown.service.reconcilePending(); assert.equal(unknown.searches.length, count);
});

test('deletion hook requires retirement proof and releases compatible storage reader pins before tombstone', async () => {
  const e = await setup(); const p = await e.prepare();
  await assert.rejects(e.service.abandonRun({ runId: 'run-A' }), /fence/);
  await e.storage.transaction(['runs'], 'readwrite', async tx => {
    const run = await tx.get('runs', 'run-A'); run.retirementState = 'released'; await tx.put('runs', run, 'run-A');
  });
  await e.service.abandonRun({ runId: 'run-A' });
  assert.equal((await e.get('commandJournal', `reader:${p.intent.readerPinId}`)).released, true);
  const row = await e.get('downloadReceipts', `attempt:${p.attempts[0].attemptId}`);
  assert.equal(row.runId, 'run-A'); assert.equal(row.state, 'abandoned');
  const artifact = await e.get('artifacts', p.artifacts[0].artifactId);
  const chunk = await e.get('artifacts', p.artifacts[0].chunkKeys[0]);
  assert.equal(artifact.artifactId, p.artifacts[0].artifactId);
  assert.equal(chunk.artifactId, p.artifacts[0].chunkKeys[0]);
  assert.equal(chunk.exportJobId, p.job.exportJobId);
});

test('shared repository reads through export pin and deletes descriptor/chunk rows only after fence and abandonment', async () => {
  const e = await setup();
  const repository = createStorageMethods(e.storage, { clock: { now: () => baseTime } });
  await e.storage.transaction(['pageSnapshots', 'records', 'runs'], 'readwrite', async tx => {
    await tx.put('pageSnapshots', { snapshotId: 'snap-A', runId: 'run-A', state: 'sealed', sealSeq: 2, stagedRowCount: 2 }, 'snap-A');
    for (const rowIndex of [0, 1]) await tx.put('records', { runId: 'run-A', snapshotId: 'snap-A', rowIndex,
      recordKey: `snap-A:${rowIndex}`, raw: { value: `${rowIndex}` }, values: { value: rowIndex } }, `snap-A:${rowIndex}`);
    const run = await tx.get('runs', 'run-A'); run.retirementState = 'released'; await tx.put('runs', run, 'run-A');
  });
  const p = await e.prepare(); const a = p.attempts[0]; await e.dispatch(a);
  const records = await repository.readRecords({ runId: 'run-A', readerPinId: p.intent.readerPinId, sealWatermark: 2, cursor: null, limit: 100 });
  assert.equal(records.committedCount, 2); assert.equal(records.records[0].values.value, 0);
  await assert.rejects(repository.deleteRun({ runId: 'run-A', explicitUserAction: true }), /reader|export/);
  await e.service.abandonRun({ runId: 'run-A' });
  const deleted = await repository.deleteRun({ runId: 'run-A', explicitUserAction: true });
  assert.equal(deleted.deleted, true);
  assert.equal(await e.get('artifacts', p.artifacts[0].artifactId), undefined);
  assert.equal(await e.get('artifacts', p.artifacts[0].chunkKeys[0]), undefined);
  e.items.get(1).state = 'complete'; const audit = await e.reconcile(a);
  assert.equal(audit.job.state, 'abandoned'); assert.equal(audit.attempt.state, 'abandoned');
  assert.equal(audit.receipt.browserDownloadComplete, true);
});
