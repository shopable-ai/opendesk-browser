import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {BUDGETS, canonical, digest} from '../../src/platform/protocol.js';
import {STORE_NAMES, STORE_SCHEMA, V1_STORE_NAMES, storageError} from '../../src/platform/storage/idb.js';
import {commandKey} from '../../src/platform/journal.js';
import {createStorage} from '../../src/platform/storage/index.js';
import {createStorageMethods} from '../../src/platform/storage/repository.js';
import {sdkMethods} from '../../src/platform/host/sdk-methods.js';
import {REGRESSION_TIME, seedStorageFixture, beginRegressionPage, regressionStage, regressionSeal, regressionValues} from '../../src/platform/storage/regression.js';

// Transactional reference model ONLY. It is intentionally not an IndexedDB
// polyfill. Node has no native IDB; native event/upgrade/Chrome claims are not
// supported by these tests. The real IDB runner lives in regression.js.
function repositoryModel() {
  let stores = new Map(STORE_NAMES.map(name => [name, new Map()])), tail = Promise.resolve(), quotaKey = null;
  const clock = {now: () => REGRESSION_TIME + 1000};
  const service = {
    injectQuotaAt(key) { quotaKey = key; },
    transaction(names, mode, work) {
      const execute = async () => {
        const draft = structuredClone(stores); let requestFailure;
        const store = name => { assert.ok(names.includes(name)); return draft.get(name); };
        const tx = {
          async get(name, key) { return structuredClone(store(name).get(key)); },
          async put(name, value, key) { assert.equal(mode, 'readwrite'); assert.notEqual(key, undefined); if (key === quotaKey) { quotaKey = null; requestFailure = new DOMException('injected quota', 'QuotaExceededError'); throw requestFailure; } store(name).set(key, structuredClone(value)); return key; },
          async delete(name, key) { assert.equal(mode, 'readwrite'); store(name).delete(key); },
          async all(name) { return structuredClone([...store(name).values()]); }
        };
        try { const value = await work(tx); if (requestFailure) throw requestFailure; if (mode === 'readwrite') stores = draft; return value; }
        catch (error) { throw storageError(error); }
      };
      const pending = tail.then(execute); tail = pending.catch(() => {}); return pending;
    }
  };
  return Object.assign(service, createStorageMethods(service, {clock}));
}
const expects = (work, code) => assert.rejects(work, error => error.code === code);
const get = (storage, store, key) => storage.transaction([store], 'readonly', tx => tx.get(store, key));
async function newPage(options, pageOptions) {
  const storage = repositoryModel(), fixture = await seedStorageFixture(storage, options), page = await beginRegressionPage(fixture, pageOptions);
  return {storage, fixture, page};
}
async function sealWhole(storage, page) {
  const batch = page.records.length ? await regressionStage(page, 0, 0, page.records.length) : null;
  if (batch) await storage.stagePageBatch(batch);
  const request = await regressionSeal(page, batch ? [batch] : []), ack = await storage.sealPage(request);
  return {request, ack, batch};
}
async function pinRead(storage, runId, pin) {
  pin ||= await storage.openReaderPin({runId});
  return storage.readRecords({runId, readerPinId: pin.readerPinId, sealWatermark: pin.sealWatermark, cursor: null, limit: 500});
}
async function mutateRun(storage, fixture, mutation) {
  return storage.transaction(['runs'], 'readwrite', async tx => { const run = await tx.get('runs', fixture.identity.runId); mutation(run); await tx.put('runs', run, run.runId); });
}

test('schema uses exactly frozen ten stores, explicit-key paths and sparse tagged indexes', async () => {
  const contract = JSON.parse(await readFile(new URL('../../docs/contracts/contract.json', import.meta.url)));
  assert.deepEqual(V1_STORE_NAMES, contract.db.stores);
  assert.deepEqual(STORE_NAMES, [...V1_STORE_NAMES, 'scriptHeads', 'scriptRevisions', 'results', 'frameworkKV']);
  assert.deepEqual(STORE_SCHEMA.commandJournal.commandId, [['identity.runId', 'commandId'], true]);
  assert.deepEqual(STORE_SCHEMA.templates.templateRevision, [['template.templateId', 'template.revision'], true]);
  assert.deepEqual(STORE_SCHEMA.pageSnapshots.runPageSequence, [['runId', 'pageSequence'], true]);
  assert.deepEqual(STORE_SCHEMA.downloadReceipts.downloadId, ['attempt.downloadId', true]);
  assert.deepEqual(STORE_SCHEMA.artifacts.artifactId, ['artifact.artifactId', true]);
});

test('no native IDB in Node is reported as unavailable; storage entry exports factory', async () => {
  await expects(() => createStorage({indexedDB: undefined}), 'E_SCHEMA');
});

test('immutable template save CAS, exact duplicate, hash lookup and name-only CAS', async () => {
  const storage = repositoryModel(), {template} = await seedStorageFixture(storage, {id: 'template-cas'});
  const original = await storage.getTemplateRevision({templateId: template.templateId, revision: 1});
  const metadata = await storage.renameTemplate({templateId: template.templateId, expectedNameRevision: 1, name: 'Renamed'});
  assert.equal(metadata.nameRevision, 2);
  assert.deepEqual(await storage.getTemplateByHash(template.contentHash), original);
  await expects(() => storage.renameTemplate({templateId: template.templateId, expectedNameRevision: 1, name: 'Stale'}), 'E_REVISION');
  const {contentHash, ...body} = template, nextBody = {...body, revision: 2, parentRevision: 1}, next = {...nextBody, contentHash: await digest(nextBody)};
  const request = {expectedParentRevision: 1, expectedNameRevision: 2, name: 'Renamed', template: next};
  const saved = await storage.saveTemplate(request);
  assert.deepEqual(await storage.saveTemplate(request), saved);
  await expects(() => storage.saveTemplate({...request, expectedNameRevision: 1}), 'E_PARENT_CONFLICT');
  assert.equal((await storage.listTemplates({cursor: null, limit: 1})).templates[0].head.revision, 2);
  assert.deepEqual(await storage.getTemplateRevision({templateId: template.templateId, revision: 1}), original);
  await expects(() => storage.getTemplateByHash('f'.repeat(64)), 'E_SCHEMA');
  await expects(() => storage.getTemplateRevision({templateId: template.templateId, revision: 99}), 'E_SCHEMA');
});

test('template admission hook uses same transaction and cannot overwrite immutable revision', async () => {
  const storage = repositoryModel(); await seedStorageFixture(storage);
  storage.configureAdmission({admitTemplate: async ({tx}) => { assert.ok(tx.get); return {maxSavedTemplates: 1}; }});
  const {template} = await seedStorageFixture(repositoryModel());
  const request = {expectedParentRevision: null, expectedNameRevision: null, name: 'Second', template};
  await expects(() => storage.saveTemplate(request), 'E_ENTITLEMENT');
  let admissionCalls = 0;
  storage.configureAdmission({admitTemplate: async ({templateId, tx}) => { admissionCalls++; assert.equal(templateId, template.templateId); assert.equal((await tx.all('templates')).filter(row => row.template).length, 1); return {maxSavedTemplates: 50}; }});
  await storage.saveTemplate(request); assert.equal(admissionCalls, 1);
  const corrupt = {...template, contentHash: 'a'.repeat(64)};
  await expects(() => storage.saveTemplate({...request, template: corrupt}), 'E_HASH');
});

test('beginPage permits preparing run, reserves exact command key and idempotently reACKs', async () => {
  const storage = repositoryModel(), fixture = await seedStorageFixture(storage);
  const request = {identity: fixture.identity, requestId: 'begin-request', readCommandId: 'read-command', pageSequence: 1, expectedPageIdentity: fixture.template.startUrl, expectedCheckpointSnapshotId: null};
  const snapshot = await storage.beginPage(request);
  assert.deepEqual(await storage.beginPage(request), snapshot);
  const reserved = await get(storage, 'commandJournal', commandKey(fixture.identity.runId, 'read-command'));
  assert.equal(reserved.tag, 'read-reservation'); assert.equal(reserved.snapshotId, snapshot.snapshotId); assert.deepEqual(reserved.identity, fixture.identity);
  await expects(() => storage.beginPage({...request, expectedPageIdentity: `${request.expectedPageIdentity}?other`}), 'E_BATCH_CONFLICT');
  await expects(() => storage.beginPage({...request, requestId: 'another', readCommandId: 'another-read'}), 'E_SEAL_INCOMPLETE');
});

test('stage rejects undispatched reservation and atomically aborts open snapshot', async () => {
  const {storage, page} = await newPage();
  await storage.transaction(['commandJournal'], 'readwrite', async tx => { const key = commandKey(page.command.identity.runId, page.command.commandId); const command = await tx.get('commandJournal', key); command.state = 'prepared'; command.dispatchAt = null; command.resultDigest = null; await tx.put('commandJournal', command, key); });
  await expects(async () => storage.stagePageBatch(await regressionStage(page, 0, 0, 3)), 'E_SEAL_INCOMPLETE');
  assert.equal((await get(storage, 'pageSnapshots', page.snapshot.snapshotId)).state, 'aborted');
});

test('three batches: first two durable ACKs, third exact-byte failure hides whole page', async () => {
  const {storage, fixture, page} = await newPage({}, {values: Array.from({length: 6}, (_, i) => regressionValues(i))});
  const a = await regressionStage(page, 0, 0, 2), b = await regressionStage(page, 1, 2, 4), c = await regressionStage(page, 2, 4, 6);
  await storage.stagePageBatch(a); await storage.stagePageBatch(b);
  assert.equal((await pinRead(storage, fixture.identity.runId)).committedCount, 0);
  await expects(() => storage.stagePageBatch({...c, utf8Bytes: c.utf8Bytes + 1}), 'E_HASH');
  const run = await get(storage, 'runs', fixture.identity.runId);
  assert.equal(run.storedBytes, a.utf8Bytes + b.utf8Bytes); assert.equal(run.committedCount, 0); assert.equal(run.checkpoint, null);
  assert.equal((await get(storage, 'pageSnapshots', page.snapshot.snapshotId)).state, 'aborted');
  assert.deepEqual((await pinRead(storage, fixture.identity.runId)).records, []);
});

test('exact staged duplicate does not add bytes; conflicting valid digest aborts page', async () => {
  const {storage, fixture, page} = await newPage(), a = await regressionStage(page, 0, 0, 3);
  await storage.stagePageBatch(a); assert.equal((await storage.stagePageBatch(a)).duplicate, true);
  assert.equal((await get(storage, 'runs', fixture.identity.runId)).storedBytes, a.utf8Bytes);
  const changed = structuredClone(a); changed.records[0].values.title = 'different'; const envelope = {snapshotId: a.snapshotId, batchIndex: 0, records: changed.records};
  changed.digest = await digest(envelope); changed.utf8Bytes = new TextEncoder().encode(canonical(envelope)).length;
  await expects(() => storage.stagePageBatch(changed), 'E_BATCH_CONFLICT');
  assert.equal((await get(storage, 'pageSnapshots', a.snapshotId)).state, 'aborted');
});

test('host/epoch/target mismatch is rejected without aborting rightful open page', async () => {
  const {storage, page} = await newPage(), batch = await regressionStage(page, 0, 0, 3);
  await expects(() => storage.stagePageBatch({...batch, identity: {...batch.identity, ownerEpoch: 2}}), 'E_OWNER');
  await expects(() => storage.stagePageBatch({...batch, identity: {...batch.identity, target: {...batch.identity.target, documentId: 'other-doc'}}}), 'E_TARGET');
  assert.equal((await get(storage, 'pageSnapshots', batch.snapshotId)).state, 'open');
});

test('admission cannot bypass transaction reread of cancellation', async () => {
  const {storage, fixture, page} = await newPage(), batch = await regressionStage(page, 0, 0, 3);
  storage.configureAdmission({admission: async ({operation, tx}) => {
    if (operation === 'stagePageBatch') { const run = await tx.get('runs', fixture.identity.runId); run.cancelSeq = 1; run.state = 'stopping'; run.runRevision++; await tx.put('runs', run, run.runId); }
    return true;
  }});
  await expects(() => storage.stagePageBatch(batch), 'E_CANCELLED');
  assert.equal((await get(storage, 'pageSnapshots', batch.snapshotId)).state, 'aborted');
});

test('stage may acknowledge authenticated raw frames before end; seal requires complete end', async () => {
  const {storage, page} = await newPage({}, {withEnd: false}), batch = await regressionStage(page, 0, 0, 3);
  await storage.stagePageBatch(batch);
  const request = await regressionSeal(page, [batch]);
  await expects(() => storage.sealPage(request), 'E_SEAL_INCOMPLETE');
  assert.equal((await get(storage, 'pageSnapshots', page.snapshot.snapshotId)).state, 'aborted');
});

test('seal recomputes all six rows; prefix-only signature fails', async () => {
  const {storage, page} = await newPage({}, {values: Array.from({length: 6}, (_, i) => regressionValues(i))}), batch = await regressionStage(page, 0, 0, 6);
  await storage.stagePageBatch(batch); const request = await regressionSeal(page, [batch]);
  request.pageSignature = await digest({pageIdentity: page.snapshot.pageIdentity, records: page.records.slice(0, 5).map(({raw, values}) => ({raw, values}))});
  await expects(() => storage.sealPage(request), 'E_HASH');
});

test('batch gap, record key/field mismatch, and raw-end evidence mismatch reject', async () => {
  for (const mutation of ['gap', 'field', 'raw']) {
    const {storage, page} = await newPage(), batch = await regressionStage(page, 0, 0, 3);
    if (mutation === 'gap') { batch.records[0].rowIndex = 1; batch.records[0].recordKey = `${batch.snapshotId}:1`; }
    if (mutation === 'field') { batch.records[0].raw.unapproved = 'x'; batch.records[0].values.unapproved = 'x'; }
    if (mutation === 'raw') batch.records[0].raw.title = 'forged raw';
    const envelope = {snapshotId: batch.snapshotId, batchIndex: 0, records: batch.records}; batch.digest = await digest(envelope); batch.utf8Bytes = new TextEncoder().encode(canonical(envelope)).length;
    await expects(() => storage.stagePageBatch(batch), mutation === 'field' ? 'E_SCHEMA' : 'E_SEAL_INCOMPLETE');
  }
});

test('stop wins before seal; seal wins before stop and preserves historic original ACK', async () => {
  const {storage, fixture, page} = await newPage(), {request, ack} = await sealWhole(storage, page);
  const s2 = await beginRegressionPage(fixture, {values: [regressionValues(9)]}); await sealWhole(storage, s2);
  await mutateRun(storage, fixture, run => { run.state = 'stopping'; run.cancelSeq++; run.runRevision++; run.identity.runRevision = run.runRevision; });
  const before = await get(storage, 'runs', fixture.identity.runId), duplicate = await storage.sealPage(request);
  assert.deepEqual(duplicate, {...ack, duplicate: true}); assert.deepEqual(await get(storage, 'runs', fixture.identity.runId), before);
  await expects(() => storage.sealPage({...request, byteCount: request.byteCount + 1}), 'E_BATCH_CONFLICT');
  await mutateRun(storage, fixture, run => { run.ownerEpoch++; });
  await expects(() => storage.sealPage(request), 'E_OWNER');
  const first = await newPage(), batch = await regressionStage(first.page, 0, 0, 3); await first.storage.stagePageBatch(batch); const seal = await regressionSeal(first.page, [batch]);
  await mutateRun(first.storage, first.fixture, run => { run.state = 'stopping'; run.cancelSeq++; run.runRevision++; run.identity.runRevision = run.runRevision; });
  await expects(() => first.storage.sealPage(seal), 'E_CANCELLED'); assert.equal((await get(first.storage, 'pageSnapshots', first.page.snapshot.snapshotId)).state, 'aborted');
});

test('run revision and authenticated host registration cannot be bypassed', async () => {
  const {storage, fixture, page} = await newPage(), batch = await regressionStage(page, 0, 0, 3);
  await mutateRun(storage, fixture, run => { run.runRevision++; run.identity.runRevision = run.runRevision; });
  await expects(() => storage.stagePageBatch(batch), 'E_REVISION');
  const second = await newPage(), otherBatch = await regressionStage(second.page, 0, 0, 3);
  await second.storage.transaction(['commandJournal'], 'readwrite', async tx => { const key = `host:${second.fixture.run.registrationId}`, host = await tx.get('commandJournal', key); host.active = false; await tx.put('commandJournal', host, key); });
  await expects(() => second.storage.stagePageBatch(otherBatch), 'E_OWNER');
  assert.equal((await get(second.storage, 'pageSnapshots', otherBatch.snapshotId)).state, 'open');
});

test('reader pins freeze watermark/count, paginate long typed values, and reject other cursors', async () => {
  const {storage, fixture, page} = await newPage(); await sealWhole(storage, page);
  const pin = await storage.openReaderPin({runId: fixture.identity.runId, readerPinId: 'reader-original'});
  const s2 = await beginRegressionPage(fixture, {values: [regressionValues(8)]}); await sealWhole(storage, s2);
  assert.deepEqual(await storage.openReaderPin({runId: fixture.identity.runId, readerPinId: pin.readerPinId}), pin);
  const request = {runId: pin.runId, readerPinId: pin.readerPinId, sealWatermark: pin.sealWatermark, cursor: null, limit: 1};
  const first = await storage.readRecords(request), second = await storage.readRecords({...request, cursor: first.nextCursor});
  assert.equal(first.committedCount, 3); assert.deepEqual(first.records[0].values, regressionValues(0)); assert.equal(second.records[0].rowIndex, 1);
  const other = await storage.openReaderPin({runId: pin.runId, readerPinId: 'reader-other'});
  await expects(() => storage.readRecords({...request, readerPinId: other.readerPinId, sealWatermark: other.sealWatermark, cursor: first.nextCursor}), 'E_SCHEMA');
  await storage.releaseReaderPin({runId: pin.runId, readerPinId: pin.readerPinId});
  await expects(() => storage.readRecords(request), 'E_REVISION');
});

test('zero-batch empty page requires authenticated allowed-empty proof', async () => {
  const allowed = await newPage({allowEmpty: true}, {values: [], emptyEvidence: 'allowEmpty'});
  const result = await sealWhole(allowed.storage, allowed.page); assert.equal(result.ack.committedCount, 0); assert.equal(result.ack.committedPages, 1);
  const wrong = await newPage({}, {values: [], emptyEvidence: 'missing selector'});
  await expects(async () => wrong.storage.sealPage(await regressionSeal(wrong.page, [])), 'E_SEAL_INCOMPLETE');
});

test('repeated full page signature without end is rejected and left invisible', async () => {
  const {storage, fixture, page} = await newPage(); await sealWhole(storage, page);
  const duplicate = await beginRegressionPage(fixture), batch = await regressionStage(duplicate, 0, 0, 3); await storage.stagePageBatch(batch);
  const seal = await regressionSeal(duplicate, [batch]); await expects(() => storage.sealPage(seal), 'E_EFFECT_UNKNOWN');
  assert.equal((await get(storage, 'runs', fixture.identity.runId)).committedCount, 3);
});

test('whole-page run limits, two pending ACKs, profile budget and injected disk quota', async () => {
  const over = await newPage({limits: {maxRecords: 2}}), overBatch = await regressionStage(over.page, 0, 0, 3);
  await expects(() => over.storage.stagePageBatch(overBatch), 'E_LIMIT'); assert.equal((await get(over.storage, 'runs', over.fixture.identity.runId)).storedBytes, 0);
  const pressured = await newPage(), stages = await Promise.all([regressionStage(pressured.page, 0, 0, 1), regressionStage(pressured.page, 1, 1, 2), regressionStage(pressured.page, 2, 2, 3)]);
  const outcomes = await Promise.allSettled(stages.map(batch => pressured.storage.stagePageBatch(batch)));
  assert.equal(outcomes[0].status, 'fulfilled'); assert.equal(outcomes[1].status, 'fulfilled'); assert.equal(outcomes[2].reason.code, 'E_LIMIT'); assert.equal((await get(pressured.storage, 'pageSnapshots', pressured.page.snapshot.snapshotId)).state, 'aborted');
  const profile = await newPage(), profileBatch = await regressionStage(profile.page, 0, 0, 3);
  await profile.storage.transaction(['runs'], 'readwrite', async tx => { for (let i = 0; i < 10; i++) await tx.put('runs', {...profile.fixture.run, runId: `retained-${i}`, state: 'completed', storedBytes: BUDGETS.maxStoredBytes}, `retained-${i}`); });
  await expects(() => profile.storage.stagePageBatch(profileBatch), 'E_QUOTA');
  const disk = await newPage(), diskBatch = await regressionStage(disk.page, 0, 0, 3); disk.storage.injectQuotaAt(diskBatch.records[1].recordKey);
  await expects(() => disk.storage.stagePageBatch(diskBatch), 'E_QUOTA'); assert.equal(await get(disk.storage, 'records', diskBatch.records[0].recordKey), undefined); assert.equal((await get(disk.storage, 'pageSnapshots', disk.page.snapshot.snapshotId)).state, 'aborted');
});

test('delete refuses active owner/read pin/open job/unknown attempt and tombstones retired data', async () => {
  const {storage, fixture, page} = await newPage(); await sealWhole(storage, page);
  const request = {runId: fixture.identity.runId, explicitUserAction: true}; await expects(() => storage.deleteRun(request), 'E_OWNER');
  await mutateRun(storage, fixture, run => { run.state = 'completed'; run.retirementState = 'released'; run.ownerEpoch++; });
  await storage.transaction(['runs'], 'readwrite', tx => tx.put('runs', {slotKey: 'profile', currentRunId: 'new-run'}, '@slot'));
  const pin = await storage.openReaderPin({runId: request.runId}); await expects(() => storage.deleteRun(request), 'E_OWNER');
  await storage.releaseReaderPin({runId: request.runId, readerPinId: pin.readerPinId});
  await storage.transaction(['exportJobs'], 'readwrite', tx => tx.put('exportJobs', {exportJobId: 'open-job', runId: request.runId, state: 'delivering'}, 'open-job'));
  await expects(() => storage.deleteRun(request), 'E_OWNER'); await storage.transaction(['exportJobs'], 'readwrite', tx => tx.delete('exportJobs', 'open-job'));
  await storage.transaction(['downloadReceipts'], 'readwrite', tx => tx.put('downloadReceipts', {tag: 'attempt', attempt: {attemptId: 'unresolved', runId: request.runId, state: 'mapping_unknown'}}, 'attempt:unresolved'));
  await expects(() => storage.deleteRun(request), 'E_OWNER');
  await storage.transaction(['downloadReceipts'], 'readwrite', async tx => { const row = await tx.get('downloadReceipts', 'attempt:unresolved'); row.attempt.state = 'abandoned'; await tx.put('downloadReceipts', row, 'attempt:unresolved'); });
  const deleted = await storage.deleteRun(request); assert.deepEqual(await storage.deleteRun(request), deleted);
  assert.equal((await get(storage, 'runs', request.runId)).tombstoned, true); assert.equal((await get(storage, 'runs', '@slot')).currentRunId, 'new-run');
  await expects(() => storage.openReaderPin({runId: request.runId}), 'E_TOMBSTONE'); assert.equal(await get(storage, 'records', page.records[0].recordKey), undefined);
  assert.ok(await get(storage, 'downloadReceipts', 'attempt:unresolved'));
});

test('retention defaults seven days, preserves active runs and raw migration duplicates', async () => {
  const {storage, fixture} = await newPage(); await expects(() => storage.setRetention({runId: fixture.identity.runId, terminalAt: REGRESSION_TIME}), 'E_OWNER');
  await mutateRun(storage, fixture, run => { run.state = 'failed'; });
  const policy = await storage.setRetention({runId: fixture.identity.runId, terminalAt: REGRESSION_TIME});
  assert.equal(policy.retainUntil - policy.terminalAt, 7 * 86400000); assert.deepEqual(await storage.cleanupRetention(), {deletedRunIds: [], protectedRunIds: []});
  const rawUtf8Backup = '{"duplicate":1,"duplicate":2,"malformed":';
  const backup = await storage.preserveMigrationBackup({backupId: 'legacy', rawUtf8Backup});
  assert.equal(backup.rawUtf8Backup, rawUtf8Backup); assert.equal(backup.executable, false);
  assert.deepEqual(await storage.preserveMigrationBackup({backupId: 'legacy', rawUtf8Backup}), backup);
  await expects(() => storage.preserveMigrationBackup({backupId: 'legacy', rawUtf8Backup: 'changed'}), 'E_BATCH_CONFLICT');
});

// Actual shared authority/context interoperability, with explicitly unit-only
// sender/native API fixtures and the serial repository model above.
test('shared authority-issued SDK context interoperates with atomic storage raw receipt and device CAS', async () => {
  const storage = repositoryModel(), clock = {now: () => REGRESSION_TIME + 1000};
  const api = {runtime: {id: 'fixture-extension'}, permissions: {contains: async () => true},
    webNavigation: {getAllFrames: async () => [{frameId: 0, documentId: 'fixture-document', url: 'https://fixture.test/page'}]}};
  const sdk = sdkMethods({storage, api, session: 'fixture-session', clock,
    assertHost: async () => ({registrationId: 'fixture-host'}), currentHost: async () => null});
  await sdk.grantSdk({tabId: 1, frameId: 0, documentId: 'fixture-document',
    capabilities: ['storage.persistent', 'device.id']}, {});
  const sender = {id: api.runtime.id, tab: {id: 1, incognito: false}, frameId: 0,
    documentId: 'fixture-document', documentLifecycle: 'active', url: 'https://fixture.test/page'};
  const admit = (method, args, requestId) => sdk.admitSdk({method, args, requestId, deadlineAt: clock.now() + 10000}, sender);
  const {context} = await admit('APPSTORAGE_SETITEM', {key: 'shared', value: '0'}, 'sdk-write');
  assert.equal(await storage.executeSdk('APPSTORAGE_SETITEM', {key: 'shared', value: '0'}, context), undefined);
  const receipt = await context.recordEffect(undefined);
  assert.equal(receipt.valueWire.type, 'undefined');
  assert.equal(receipt.runId, context.runId);
  assert.equal(receipt.opId, context.opId);
  assert.equal(receipt.resultId, context.resultId);
  assert.equal(receipt.requestDigest, context.requestDigest);
  const duplicate = await admit('APPSTORAGE_SETITEM', {key: 'shared', value: '0'}, 'sdk-write');
  assert.equal(duplicate.context.opId, context.opId);
  assert.equal(await storage.executeSdk('APPSTORAGE_SETITEM', {key: 'shared', value: '0'}, duplicate.context), undefined);
  await expects(() => storage.executeSdk('CHROME_LOCAL_SET', {values: {shared: 1}}, context), 'E_REQUEST_CONFLICT');
  const firstDevice = await admit('DEVICE_GET_APP_ID', {}, 'device-first');
  const secondDevice = await admit('DEVICE_GET_APP_ID', {}, 'device-second');
  const id = await storage.getAppId(firstDevice.context);
  assert.equal(await storage.getAppId(secondDevice.context), id);
  assert.equal((await firstDevice.context.recordEffect(id)).valueWire.value, id);
  const clear = await admit('APPSTORAGE_CLEAR', {}, 'namespace-clear');
  assert.equal(await storage.executeSdk('APPSTORAGE_CLEAR', {}, clear.context), undefined);
  const thirdDevice = await admit('DEVICE_GET_APP_ID', {}, 'device-third');
  assert.equal(await storage.getAppId(thirdDevice.context), id);
  const read = await admit('APPSTORAGE_GETITEM', {key: 'shared'}, 'sdk-read');
  assert.equal(await storage.executeSdk('APPSTORAGE_GETITEM', {key: 'shared'}, read.context), null);
  await sdk.revokeSdkGrants({tabId: 1, documentId: 'fixture-document', reason: 'navigation'});
  await expects(() => storage.executeSdk('APPSTORAGE_GETITEM', {key: 'shared'}, read.context), 'E_DOCUMENT_STALE');
});


test('AppStorage and Chrome local same-name keys and clear stay in separate logical areas', async () => {
  const storage = repositoryModel(), clock = {now: () => REGRESSION_TIME + 1000};
  const api = {runtime: {id: 'fixture-extension'}, permissions: {contains: async () => true},
    webNavigation: {getAllFrames: async () => [{frameId: 0, documentId: 'fixture-document', url: 'https://fixture.test/page'}]}};
  const sdk = sdkMethods({storage, api, session: 'fixture-session', clock,
    assertHost: async () => ({registrationId: 'fixture-host'}), currentHost: async () => null});
  await sdk.grantSdk({tabId: 1, frameId: 0, documentId: 'fixture-document', capabilities: ['storage.persistent']}, {});
  const sender = {id: api.runtime.id, tab: {id: 1, incognito: false}, frameId: 0,
    documentId: 'fixture-document', documentLifecycle: 'active', url: 'https://fixture.test/page'};
  let serial = 0;
  const call = async (method, args = {}) => {
    const {context} = await sdk.admitSdk({method, args, requestId: `partition-${++serial}`, deadlineAt: clock.now() + 10000}, sender);
    return storage.executeSdk(method, args, context);
  };
  await call('APPSTORAGE_SETITEM', {key: 'shared', value: 0});
  await call('CHROME_LOCAL_SET', {values: {shared: false, other: null}});
  assert.equal(await call('APPSTORAGE_GETITEM', {key: 'shared'}), '0');
  assert.equal(await call('CHROME_LOCAL_GET', {key: 'shared'}), false);
  await call('APPSTORAGE_CLEAR');
  assert.equal(await call('APPSTORAGE_GETITEM', {key: 'shared'}), null);
  assert.equal(await call('CHROME_LOCAL_GET', {key: 'shared'}), false);
  await call('APPSTORAGE_SETITEM', {key: 'shared', value: 'survives'});
  await call('CHROME_LOCAL_CLEAR');
  assert.equal(await call('APPSTORAGE_GETITEM', {key: 'shared'}), 'survives');
  assert.equal(await call('CHROME_LOCAL_GET', {key: 'shared'}), undefined);
  assert.deepEqual(await call('CHROME_LOCAL_GET', {key: null}), []);
});
