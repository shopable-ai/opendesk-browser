// Explicit test entry only. Never imported/executed by product startup.
// The run/host/agent rows below are test fixtures, not actual Chrome authority.
import {BUDGETS, CONTRACT_VERSION, canonical, digest, invariant, newId, validate} from '../protocol.js';
import {createStorage} from './index.js';
import {commandKey} from '../journal.js';

export const REGRESSION_TIME = Date.parse('2026-10-01T12:00:00.000Z');
const copy = value => structuredClone(value);
const byteLength = value => new TextEncoder().encode(canonical(value)).byteLength;
export const regressionValues = index => ({title: index === 0 ? '完整长文'.repeat(60) : `row-${index}`, count: index, enabled: false, optional: null, blank: ''});

export async function seedStorageFixture(storage, {id = newId(), limits = {}, tier = 'pro', allowEmpty = false, pagination = 'next-button'} = {}) {
  const fields = [
    {id: 'title', label: 'Title', selector: '.title', read: 'text', attribute: null, type: 'string', required: true, transforms: []},
    {id: 'count', label: 'Count', selector: '.count', read: 'text', attribute: null, type: 'number', required: true, transforms: ['trim']},
    {id: 'enabled', label: 'Enabled', selector: '.enabled', read: 'text', attribute: null, type: 'boolean', required: true, transforms: ['trim']},
    {id: 'optional', label: 'Optional', selector: '.optional', read: 'text', attribute: null, type: 'string', required: false, transforms: []},
    {id: 'blank', label: 'Blank', selector: '.blank', read: 'text', attribute: null, type: 'string', required: true, transforms: []}
  ];
  const body = {formatVersion: CONTRACT_VERSION, templateId: `template-${id}`, revision: 1, parentRevision: null,
    selectorDialect: 'css', requiredCapabilities: ['dom.top.v1', 'read.text.v1', 'transform.safe.v1', `pagination.${pagination}.v1`, 'page.stage-seal.v1', 'download.receipt.v1'],
    allowedOrigin: 'https://storage-fixture.example', startUrl: 'https://storage-fixture.example/list',
    list: {containerSelector: '.rows', rowSelector: ':scope > .row', emptyMarkerSelector: null, allowEmpty}, fields,
    pagination: pagination === 'none' ? {mode: 'none'} : {mode: 'next-button', selector: '.next', endMarkerSelector: '.end', userConfirmed: true, postcondition: {kind: 'page-signature-change', timeoutMs: 2000}},
    columns: fields.map(field => field.id), limits: {maxPages: 50, maxRecords: 10000, maxDurationMs: 600000, maxStoredBytes: 20971520}, detail: null};
  const template = {...body, contentHash: await digest(body)};
  await storage.saveTemplate({expectedParentRevision: null, expectedNameRevision: null, name: `Fixture ${id}`, template}, {admitTemplate: async () => ({maxSavedTemplates: 50})});
  const identity = {runId: `run-${id}`, hostInstanceId: `host-${id}`, hostDocumentId: `host-doc-${id}`, ownerEpoch: 1, runRevision: 1,
    templateHash: template.contentHash, target: {targetSessionId: `target-${id}`, tabId: 20, frameId: 0, documentId: `doc-${id}`, allowedOrigin: template.allowedOrigin, targetVersion: 1, browserSessionIncarnation: `session-${id}`, creationId: `creation-${id}`}};
  const run = {runId: identity.runId, hostInstanceId: identity.hostInstanceId, hostDocumentId: identity.hostDocumentId, ownerEpoch: 1, runRevision: 1, eventSeq: 0, commitSeq: 0,
    templateHash: template.contentHash, state: 'preparing', cancelSeq: 0, committedCount: 0, committedPages: 0, storedBytes: 0, checkpoint: null, target: identity.target,
    entitlementSnapshot: {policyVersion: CONTRACT_VERSION, tier, approvedAt: new Date(REGRESSION_TIME).toISOString(), claimHash: tier === 'pro' ? 'a'.repeat(64) : null, offlineAgeMs: 0,
      effectiveLimits: {...template.limits, ...limits}, maxSavedTemplates: tier === 'pro' ? 50 : 1, approvedCapabilities: template.requiredCapabilities, runExpiryRevokes: false},
    retirementState: 'not-started', terminalReason: null, tombstoned: false,
    identity, registrationId: `registration-${id}`, browserSessionIncarnation: identity.target.browserSessionIncarnation, startUrl: template.startUrl, events: []};
  validate('Run', Object.fromEntries(Object.keys((await import('../schema.js')).default.$defs.Run.properties).map(key => [key, run[key]])));
  await storage.transaction(['runs', 'commandJournal'], 'readwrite', async tx => {
    await tx.put('runs', run, run.runId);
    await tx.put('runs', {slotKey: 'profile', currentRunId: run.runId}, '@slot');
    await tx.put('commandJournal', {tag: 'host', registrationId: run.registrationId, hostInstanceId: run.hostInstanceId, hostDocumentId: run.hostDocumentId, active: true, browserSessionIncarnation: run.browserSessionIncarnation}, `host:${run.registrationId}`);
  });
  return {identity, template, run, storage};
}

export async function beginRegressionPage(fixture, {values = [regressionValues(0), regressionValues(1), regressionValues(2)], pageIdentity = fixture.template.startUrl, emptyEvidence = null, withEnd = true} = {}) {
  const {storage, template, identity} = fixture;
  const run = await storage.transaction(['runs'], 'readonly', tx => tx.get('runs', identity.runId));
  const request = {identity: copy(identity), requestId: newId(), readCommandId: newId(), pageSequence: run.committedPages + 1, expectedPageIdentity: pageIdentity, expectedCheckpointSnapshotId: run.checkpoint?.lastSnapshotId ?? null};
  const snapshot = await storage.beginPage(request);
  const records = values.map((values, rowIndex) => ({rowIndex, recordKey: `${snapshot.snapshotId}:${rowIndex}`, raw: Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value === null ? null : String(value)])), values}));
  const planContent = {contractVersion: CONTRACT_VERSION, compilerVersion: CONTRACT_VERSION, templateHash: template.contentHash, capabilities: template.requiredCapabilities,
    ...Object.fromEntries(['list', 'fields', 'pagination', 'columns', 'limits'].map(key => [key, template[key]]))};
  const plan = {...planContent, planHash: await digest(planContent)};
  const commandContent = {commandId: request.readCommandId, identity: copy(identity), kind: 'read-page', payload: {plan, snapshotId: snapshot.snapshotId, pageSequence: snapshot.pageSequence, expectedPageIdentity: pageIdentity}};
  const rawRows = records.map(record => record.raw), rawFrames = [];
  // One authenticated frame per two rows; storage may stage at another boundary.
  for (let rowStart = 0; rowStart < rawRows.length; rowStart += 2) {
    const envelope = {snapshotId: snapshot.snapshotId, frameIndex: rawFrames.length, rowStart, rawRows: rawRows.slice(rowStart, rowStart + 2)};
    rawFrames.push({type: 'page-data', identity: copy(identity), commandId: request.readCommandId, ...envelope, digest: await digest(envelope)});
  }
  const pageEnd = {type: 'page-end', identity: copy(identity), commandId: request.readCommandId, snapshotId: snapshot.snapshotId,
    frameCount: rawFrames.length, rowCount: records.length, pageIdentity, documentBaseURI: pageIdentity, emptyEvidence, rawSignature: await digest({pageIdentity, rawRows})};
  const command = {...commandContent, digest: await digest(commandContent), state: withEnd ? 'confirmed' : 'dispatched', preparedAt: new Date(REGRESSION_TIME).toISOString(), dispatchAt: new Date(REGRESSION_TIME).toISOString(),
    resultDigest: withEnd ? await digest(pageEnd) : null, snapshotId: snapshot.snapshotId, rawFrames, ...(withEnd ? {pageEnd} : {})};
  validate('PageReadEnd', pageEnd);
  await storage.transaction(['runs', 'commandJournal'], 'readwrite', async tx => {
    const run = await tx.get('runs', identity.runId); run.state = 'running'; await tx.put('runs', run, run.runId);
    await tx.put('commandJournal', command, commandKey(command.identity.runId, command.commandId));
  });
  return {snapshot, records, request, command, pageEnd, fixture};
}

export async function regressionStage(page, batchIndex, start, end) {
  const envelope = {snapshotId: page.snapshot.snapshotId, batchIndex, records: page.records.slice(start, end)};
  return {identity: copy(page.fixture.identity), batchId: `${envelope.snapshotId}:${batchIndex}`, ...envelope, digest: await digest(envelope), utf8Bytes: byteLength(envelope)};
}

export async function regressionSeal(page, batches) {
  return {identity: copy(page.fixture.identity), snapshotId: page.snapshot.snapshotId, batchCount: batches.length, rowCount: page.records.length,
    byteCount: batches.reduce((n, batch) => n + batch.utf8Bytes, 0), batchDigests: batches.map(batch => batch.digest),
    pageSignature: await digest({pageIdentity: page.snapshot.pageIdentity, records: page.records.map(({raw, values}) => ({raw, values}))}), pageIdentity: page.snapshot.pageIdentity,
    nextCheckpoint: {pageNumber: page.snapshot.pageSequence, url: page.snapshot.pageIdentity, lastSnapshotId: page.snapshot.snapshotId}, emptyEvidence: page.pageEnd.emptyEvidence};
}

export async function runStorageRegression({indexedDB = globalThis.indexedDB, name = `opendesk-storage-regression-${newId()}`} = {}) {
  invariant(name.startsWith('opendesk-storage-regression-'), 'E_SCHEMA', 'Regression requires an isolated test database');
  const assertions = [], clock = {now: () => REGRESSION_TIME + 1000};
  const storage = await createStorage({indexedDB, name, clock});
  const check = (condition, label) => { invariant(condition, 'E_SCHEMA', `Regression: ${label}`); assertions.push(label); };
  const rejects = async (operation, code, label) => {
    try { await operation(); } catch (error) { check(error.code === code, label); return; }
    throw new Error(`Regression did not reject: ${label}`);
  };
  try {
    check(await createStorage({indexedDB, name, clock}) === storage, 'same database returns sole service/connection');
    await rejects(() => storage.transaction(['entitlements'], 'readwrite', async tx => {
      await tx.put('entitlements', {subject: 'rollback-marker'}, 'rollback-marker'); await digest({async: 'task-gap'}); throw new Error('rollback');
    }), 'E_SCHEMA', 'callback failure aborts full transaction');
    check(await storage.transaction(['entitlements'], 'readonly', tx => tx.get('entitlements', 'rollback-marker')) === undefined, 'aborted write absent');
    await storage.transaction(['entitlements'], 'readwrite', async tx => { await digest({crypto: 'asynchronous'}); await tx.put('entitlements', {subject: 'async-marker'}, 'async-marker'); });
    check(!!await storage.transaction(['entitlements'], 'readonly', tx => tx.get('entitlements', 'async-marker')), 'write after actual WebCrypto await stays active and commits');
    const fixture = await seedStorageFixture(storage), page = await beginRegressionPage(fixture, {values: Array.from({length: 6}, (_, i) => regressionValues(i))});
    const stages = await Promise.all([regressionStage(page, 0, 0, 2), regressionStage(page, 1, 2, 4), regressionStage(page, 2, 4, 6)]);
    await storage.stagePageBatch(stages[0]); await storage.stagePageBatch(stages[1]);
    const bad = {...stages[2], utf8Bytes: stages[2].utf8Bytes + 1};
    await rejects(() => storage.stagePageBatch(bad), 'E_HASH', 'third batch failure aborts page');
    const pin = await storage.openReaderPin({runId: fixture.identity.runId});
    const invisible = await storage.readRecords({runId: pin.runId, readerPinId: pin.readerPinId, sealWatermark: pin.sealWatermark, cursor: null, limit: 500});
    check(invisible.records.length === 0 && invisible.committedCount === 0, 'first two durable stages stay invisible after failed third');
    const success = await seedStorageFixture(storage), s1 = await beginRegressionPage(success), batch = await regressionStage(s1, 0, 0, 3);
    await storage.stagePageBatch(batch);
    check((await storage.stagePageBatch(batch)).duplicate, 'exact staged duplicate acknowledged once');
    const seal = await regressionSeal(s1, [batch]), ack = await storage.sealPage(seal);
    const oldPin = await storage.openReaderPin({runId: success.identity.runId});
    const s2 = await beginRegressionPage(success, {values: [regressionValues(7)]}), b2 = await regressionStage(s2, 0, 0, 1);
    await storage.stagePageBatch(b2); await storage.sealPage(await regressionSeal(s2, [b2]));
    const read = await storage.readRecords({runId: oldPin.runId, readerPinId: oldPin.readerPinId, sealWatermark: oldPin.sealWatermark, cursor: null, limit: 500});
    check(read.records.length === 3 && read.records[0].values.count === 0 && read.records[0].values.enabled === false && read.records[0].values.optional === null && read.records[0].values.blank === '' && read.records[0].values.title.length > 150, 'pinned watermark/raw/typed values and full long text preserved');
    await storage.transaction(['runs'], 'readwrite', async tx => { const run = await tx.get('runs', success.identity.runId); run.state = 'stopping'; run.cancelSeq++; run.runRevision++; run.identity.runRevision = run.runRevision; await tx.put('runs', run, run.runId); });
    const historic = await storage.sealPage(seal);
    check(historic.duplicate && historic.committedCount === ack.committedCount && historic.committedPages === 1 && historic.checkpoint.lastSnapshotId === ack.snapshotId, 'S1 historic seal ACK stays immutable after S2 and stop');
    const stopFirst = await seedStorageFixture(storage), pending = await beginRegressionPage(stopFirst), first = await regressionStage(pending, 0, 0, 3);
    await storage.stagePageBatch(first);
    await storage.transaction(['runs'], 'readwrite', async tx => { const run = await tx.get('runs', stopFirst.identity.runId); run.state = 'stopping'; run.cancelSeq = 1; run.runRevision++; run.identity.runRevision = run.runRevision; await tx.put('runs', run, run.runId); });
    const stopSeal = await regressionSeal(pending, [first]);
    await rejects(() => storage.sealPage(stopSeal), 'E_CANCELLED', 'stop committed first rejects new seal');
    const raw = '{"duplicate":1,"duplicate":2,"legacy":"not executable"}';
    const backup = await storage.preserveMigrationBackup({backupId: newId(), rawUtf8Backup: raw});
    check(backup.rawUtf8Backup === raw && backup.executable === false, 'raw legacy backup preserved before parse');
    const exportBackup = await storage.rawBackup();
    check(exportBackup.stores.length === 10 && exportBackup.stores.some(store => store.records.some(row => row.key === 'async-marker')), 'raw consistent backup preserves explicit keys');
    storage.close();
    const recovery = await createStorage({indexedDB, name, version: 2, clock});
    try {
      check(recovery.readOnly && recovery.version === 1 && recovery.migrationError.code === 'E_VERSION', 'unreviewed real versionchange abort recovers old database read-only');
      check(!!await recovery.transaction(['entitlements'], 'readonly', tx => tx.get('entitlements', 'async-marker')), 'failed upgrade retains old data');
      await rejects(() => recovery.transaction(['entitlements'], 'readwrite', tx => tx.put('entitlements', {subject: 'forbidden'}, 'forbidden')), 'E_VERSION', 'recovery connection refuses writes');
    } finally { recovery.close(); }
    return {status: 'passed', realIndexedDB: true, actualChromeJourney: false, name, assertions,
      caveat: 'Native IDB only. Hosts/targets/read frames are seeded test evidence; real sender authentication, Chrome restart/quota and product journeys require separate Chrome validation.'};
  } finally { storage.close(); }
}
