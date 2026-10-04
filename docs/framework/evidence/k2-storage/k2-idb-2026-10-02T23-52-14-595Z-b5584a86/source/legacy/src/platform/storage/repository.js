import {BUDGETS, CONTRACT_VERSION, FoundationError, canonical, digest, invariant, newId, sameIdentity, validate} from '../protocol.js';
import {STORE_NAMES, storageError} from './idb.js';

export const STORAGE_KEYS = Object.freeze({
  slot: '@slot', host: id => `host:${id}`, templateHead: id => `head:${id}`,
  templateRevision: (id, revision) => `${id}:${revision}`,
  begin: (runId, requestId) => `begin:${runId}:${requestId}`,
  reader: id => `reader:${id}`, tombstone: id => `tombstone:${id}`, retention: id => `retention:${id}`,
  migration: id => `migration:${id}`
});
const terminal = new Set(['completed', 'limit_reached', 'stopped', 'failed', 'interrupted', 'abandoned_unknown']);
const encoder = new TextEncoder();
const clone = value => structuredClone(value);
const bytes = value => encoder.encode(canonical(value)).byteLength;
const record = value => ({rowIndex: value.rowIndex, recordKey: value.recordKey, raw: value.raw, values: value.values});
const pick = (value, keys) => Object.fromEntries(keys.map(key => [key, value[key]]));
const commandKeys = ['commandId', 'identity', 'kind', 'payload', 'digest', 'state', 'preparedAt', 'dispatchAt', 'resultDigest'];
const headKey = STORAGE_KEYS.templateHead;
const revisionKey = STORAGE_KEYS.templateRevision;
const checkId = id => invariant(typeof id === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(id), 'E_SCHEMA', 'Invalid id');
const equal = (a, b) => canonical(a) === canonical(b);

function pageUrl(value, origin) {
  let url;
  try { url = new URL(value); } catch { throw new FoundationError('E_TARGET', 'Invalid authenticated page URL'); }
  invariant(['https:', 'http:'].includes(url.protocol) && !url.username && !url.password && url.origin === origin,
    'E_TARGET', 'Page outside target origin');
  url.hash = '';
  invariant(url.href === value, 'E_TARGET', 'Page URL must be normalized without fragment');
  return url.href;
}

async function checkedTemplate(row) {
  invariant(row?.template && row?.metadata, 'E_SCHEMA', 'Template revision missing');
  const template = row.template;
  validate('TemplateRevision', template);
  validate('TemplateMetadata', row.metadata);
  invariant(template.templateId === row.metadata.templateId && template.revision === row.metadata.headRevision,
    'E_SCHEMA', 'Template metadata mismatch');
  const {contentHash, ...body} = template;
  invariant(await digest(body) === contentHash, 'E_HASH', 'Template hash mismatch');
  return template;
}

function templateSemantics(template) {
  invariant(template.parentRevision === (template.revision === 1 ? null : template.revision - 1), 'E_PARENT_CONFLICT', 'Revision ancestry must be contiguous');
  const ids = template.fields.map(field => field.id);
  invariant(new Set(ids).size === ids.length && template.columns.length === ids.length && new Set(template.columns).size === ids.length && template.columns.every(id => ids.includes(id)), 'E_SEMANTIC', 'Columns must be the exact field permutation');
  invariant(!ids.some(id => ['__proto__', 'prototype', 'constructor'].includes(id)), 'E_SCHEMA', 'Unsafe field id');
  let origin, start;
  try { origin = new URL(template.allowedOrigin); start = new URL(template.startUrl); }
  catch { throw new FoundationError('E_SEMANTIC', 'Template URL invalid'); }
  invariant(['https:', 'http:'].includes(origin.protocol) && origin.origin === template.allowedOrigin && start.origin === origin.origin && !start.username && !start.password && start.href === template.startUrl, 'E_SEMANTIC', 'Template URLs must be canonical and same-origin');
  const capabilities = new Set(['dom.top.v1', `pagination.${template.pagination.mode}.v1`]);
  for (const field of template.fields) {
    capabilities.add(`read.${field.read}.v1`);
    if (field.transforms.length) capabilities.add('transform.safe.v1');
    invariant((field.read === 'attribute' && typeof field.attribute === 'string' && field.attribute.length > 0) || (field.read === 'text' && field.attribute === null), 'E_SEMANTIC', 'Invalid attribute read configuration');
  }
  const infrastructure = new Set(['page.stage-seal.v1', 'download.receipt.v1', 'transform.safe.v1']);
  invariant([...capabilities].every(c => template.requiredCapabilities.includes(c)) && template.requiredCapabilities.every(c => capabilities.has(c) || infrastructure.has(c)), 'E_CAPABILITY', 'Template capabilities do not cover its operations');
}

export function createStorageMethods(service, {clock = {now: () => Date.now()}, admission, admitTemplate} = {}) {
  const hooks = {admission, admitTemplate};
  const pending = new Map();
  const gate = async (operation, request, tx, run, historical = false) => {
    const decision = hooks.admission ? await hooks.admission({operation, request: clone(request), tx, run: run && clone(run), historical}) : undefined;
    invariant(decision !== false, 'E_OWNER', 'Storage admission rejected');
    return decision || {};
  };
  const now = () => {
    const value = clock.now();
    invariant(Number.isSafeInteger(value) && value >= 0, 'E_SCHEMA', 'Invalid storage clock');
    return value;
  };
  const untombstoned = async (tx, runId) => {
    const run = await tx.get('runs', runId);
    invariant(run && !run.tombstoned && !await tx.get('commandJournal', STORAGE_KEYS.tombstone(runId)), 'E_TOMBSTONE', 'Run unavailable or deleted');
    return run;
  };
  const auth = async (tx, identity, historical = false, allowPreparing = false) => {
    validate('Identity', identity);
    const run = await untombstoned(tx, identity.runId);
    invariant(run.runId === identity.runId && run.ownerEpoch === identity.ownerEpoch && run.hostInstanceId === identity.hostInstanceId && run.hostDocumentId === identity.hostDocumentId,
      'E_OWNER', 'Run owner fenced');
    invariant(run.templateHash === identity.templateHash && run.identity?.templateHash === identity.templateHash, 'E_HASH', 'Run template mismatch');
    invariant(run.identity && sameIdentity(run.identity, identity, {ignoreRevision: true}) && equal(run.target, identity.target) && run.browserSessionIncarnation === identity.target.browserSessionIncarnation,
      'E_TARGET', 'Run target or document changed');
    const host = await tx.get('commandJournal', STORAGE_KEYS.host(run.registrationId));
    invariant(host?.active === true && host.registrationId === run.registrationId && host.hostInstanceId === identity.hostInstanceId && host.hostDocumentId === identity.hostDocumentId,
      'E_OWNER', 'Original host registration unavailable');
    invariant(host.browserSessionIncarnation === run.browserSessionIncarnation, 'E_OWNER', 'Host session fenced');
    if (!historical) {
      invariant(run.cancelSeq === 0 && !['stopping', 'stopped', 'retiring'].includes(run.state), 'E_CANCELLED', 'Run cancelled');
      invariant(run.runRevision === identity.runRevision, 'E_REVISION', 'Run revision changed');
      invariant(run.state === 'running' || (allowPreparing && run.state === 'preparing'), 'E_OWNER', 'Run is not collecting');
    }
    return run;
  };
  const templateForRun = async (tx, run) => {
    const rows = (await tx.all('templates')).filter(row => row.template?.contentHash === run.templateHash);
    invariant(rows.length === 1, 'E_SCHEMA', 'Stored template hash must match exactly one revision');
    return checkedTemplate(rows[0]);
  };
  const limits = run => ({...run.entitlementSnapshot.effectiveLimits});
  const duration = run => {
    const approved = Date.parse(run.entitlementSnapshot.approvedAt);
    invariant(Number.isFinite(approved) && now() >= approved, 'E_LIMIT', 'Run clock changed');
    invariant(now() - approved < limits(run).maxDurationMs, 'E_LIMIT', 'Run duration limit reached');
  };
  const profileBytes = async tx => {
    const runs = await tx.all('runs'), artifacts = await tx.all('artifacts'), journal = await tx.all('commandJournal');
    return runs.reduce((n, row) => n + (row.runId ? row.storedBytes : 0), 0) +
      artifacts.reduce((n, row) => n + (row.tag === 'artifact' ? row.artifact.byteCount : 0), 0) +
      journal.reduce((n, row) => n + (row.tag === 'migration-backup' ? row.utf8Bytes : 0), 0);
  };
  const abortOpen = async (tx, snapshot, code) => {
    if (snapshot?.state === 'open') {
      snapshot.state = 'aborted'; snapshot.abortReason = code;
      await tx.put('pageSnapshots', snapshot, snapshot.snapshotId);
    }
  };
  const pageStores = ['runs', 'commandJournal', 'pageSnapshots', 'batches', 'records', 'templates', 'artifacts'];
  const pageMutation = async (operation, request, work) => {
    let outcome;
    try {
      outcome = await service.transaction(pageStores, 'readwrite', async tx => {
        let snapshot, trusted = false;
        try {
          await gate(operation, request, tx);
          await auth(tx, request.identity, true);
          snapshot = await tx.get('pageSnapshots', request.snapshotId);
          invariant(snapshot && snapshot.runId === request.identity.runId && sameIdentity(snapshot.sourceIdentity, request.identity, {ignoreRevision: true}), 'E_TARGET', 'Snapshot source binding mismatch');
          trusted = true;
          return {value: await work(tx, snapshot)};
        } catch (error) {
          const failure = storageError(error);
          if (trusted) await abortOpen(tx, snapshot, failure.code);
          return {error: failure};
        }
      });
    } catch (error) {
      const failure = storageError(error);
      if (failure.code === 'E_QUOTA') {
        // The failing IDB transaction rolled back. Persist only the abort in a
        // fresh small transaction; even if disk refuses it, no rows are sealed.
        try {
          await service.transaction(['runs', 'commandJournal', 'pageSnapshots'], 'readwrite', async tx => {
            await gate(operation, request, tx);
            await auth(tx, request.identity, true);
            const snapshot = await tx.get('pageSnapshots', request.snapshotId);
            if (snapshot && sameIdentity(snapshot.sourceIdentity, request.identity, {ignoreRevision: true})) await abortOpen(tx, snapshot, 'E_QUOTA');
          });
        } catch { failure.pageAbortPersisted = false; }
      }
      throw failure;
    }
    if (outcome.error) throw outcome.error;
    return outcome.value;
  };

  const fields = (template, raw, values) => {
    const ids = template.fields.map(field => field.id);
    invariant(Object.keys(raw).length === ids.length && ids.every(id => Object.hasOwn(raw, id)) &&
      (!values || (Object.keys(values).length === ids.length && ids.every(id => Object.hasOwn(values, id)))), 'E_SCHEMA', 'Record field keys must match the stored template');
    for (const field of template.fields) {
      invariant(!field.required || raw[field.id] !== null, 'E_SEMANTIC', 'Required raw field missing');
      if (values) invariant(raw[field.id] === null ? values[field.id] === null : typeof values[field.id] === field.type, 'E_SEMANTIC', 'Typed value differs from template field type');
    }
  };
  const readEvidence = async (tx, snapshot, template, requireEnd) => {
    const command = await tx.get('commandJournal', snapshot.readCommandId);
    invariant(command?.tag !== 'read-reservation' && command?.kind === 'read-page' && ['dispatched', 'confirmed'].includes(command.state), 'E_SEAL_INCOMPLETE', 'Authenticated read has not been dispatched');
    validate('Command', pick(command, commandKeys));
    invariant(command.dispatchAt && command.snapshotId === snapshot.snapshotId && command.payload.snapshotId === snapshot.snapshotId && command.payload.pageSequence === snapshot.pageSequence && command.payload.expectedPageIdentity === snapshot.pageIdentity &&
      sameIdentity(command.identity, snapshot.sourceIdentity), 'E_TARGET', 'Read command bound to a different page');
    const {digest: commandDigest} = command;
    invariant(await digest(pick(command, ['commandId', 'identity', 'kind', 'payload'])) === commandDigest, 'E_HASH', 'Stored read command digest mismatch');
    invariant(command.payload.plan.templateHash === template.contentHash, 'E_HASH', 'Read plan template mismatch');
    const {planHash, ...planContent} = command.payload.plan;
    invariant(command.payload.plan.contractVersion === CONTRACT_VERSION && command.payload.plan.compilerVersion === CONTRACT_VERSION && await digest(planContent) === planHash, 'E_HASH', 'Read plan version or hash mismatch');
    invariant(equal(command.payload.plan.capabilities, template.requiredCapabilities), 'E_CAPABILITY', 'Read plan capability mismatch');
    for (const key of ['list', 'fields', 'pagination', 'columns', 'limits']) invariant(equal(command.payload.plan[key], template[key]), 'E_SEMANTIC', 'Read plan differs from stored template');
    const rawRows = [], frames = command.rawFrames;
    invariant(Array.isArray(frames), 'E_SEAL_INCOMPLETE', 'Authenticated raw frame evidence missing');
    for (let index = 0; index < frames.length; index++) {
      const frame = frames[index];
      validate('PageReadData', frame);
      invariant(frame.frameIndex === index && frame.rowStart === rawRows.length, 'E_SEAL_INCOMPLETE', 'Raw frame gap or overlap');
      invariant(frame.commandId === command.commandId && frame.snapshotId === snapshot.snapshotId && sameIdentity(frame.identity, snapshot.sourceIdentity), 'E_TARGET', 'Raw frame source mismatch');
      const envelope = pick(frame, ['snapshotId', 'frameIndex', 'rowStart', 'rawRows']);
      invariant(bytes(envelope) <= BUDGETS.maxRawFrameBytes && await digest(envelope) === frame.digest, 'E_HASH', 'Raw frame bytes or digest mismatch');
      for (const raw of frame.rawRows) { fields(template, raw); rawRows.push(raw); }
    }
    const end = command.pageEnd;
    if (requireEnd || end) {
      invariant(end, 'E_SEAL_INCOMPLETE', 'Authenticated page end missing');
      validate('PageReadEnd', end);
      invariant(end.commandId === command.commandId && end.snapshotId === snapshot.snapshotId && sameIdentity(end.identity, snapshot.sourceIdentity) && end.pageIdentity === snapshot.pageIdentity, 'E_TARGET', 'Page end source mismatch');
      pageUrl(end.pageIdentity, snapshot.sourceIdentity.target.allowedOrigin);
      invariant(end.rowCount === rawRows.length && end.frameCount === frames.length && await digest({pageIdentity: end.pageIdentity, rawRows}) === end.rawSignature, 'E_SEAL_INCOMPLETE', 'Page end is not the complete raw read');
      if (command.state === 'confirmed') invariant(command.resultDigest === await digest(end), 'E_HASH', 'Confirmed read result differs from end evidence');
    }
    return {rawRows, end};
  };
  const readSnapshotRecords = async (tx, snapshot, batches) => {
    const records = [];
    for (let index = 0; index < batches.length; index++) {
      const batch = batches[index];
      invariant(batch.batchIndex === index && batch.rowStart === records.length && batch.rowCount > 0 && batch.batchId === `${snapshot.snapshotId}:${index}`, 'E_SEAL_INCOMPLETE', 'Stage batch gap or overlap');
      const part = [];
      for (let offset = 0; offset < batch.rowCount; offset++) {
        const rowIndex = batch.rowStart + offset;
        const stored = await tx.get('records', `${snapshot.snapshotId}:${rowIndex}`);
        invariant(stored && stored.snapshotId === snapshot.snapshotId && stored.runId === snapshot.runId && stored.batchId === batch.batchId && stored.rowIndex === rowIndex && stored.recordKey === `${snapshot.snapshotId}:${rowIndex}`, 'E_SEAL_INCOMPLETE', 'Stored row missing or out of order');
        const value = record(stored); validate('Record', value); part.push(value);
      }
      const envelope = {snapshotId: snapshot.snapshotId, batchIndex: index, records: part};
      invariant(bytes(envelope) === batch.utf8Bytes && await digest(envelope) === batch.digest, 'E_HASH', 'Stored batch bytes or digest mismatch');
      records.push(...part);
    }
    return records;
  };

  const methods = {
    configureAdmission(options) {
      invariant(options && Object.keys(options).every(key => ['admission', 'admitTemplate'].includes(key)), 'E_SCHEMA', 'Unknown admission option');
      for (const key of Object.keys(options)) {
        invariant(options[key] === undefined || typeof options[key] === 'function', 'E_SCHEMA', 'Admission hook must be a function');
        hooks[key] = options[key];
      }
    },
    async saveTemplate(input, {admitTemplate: perCallAdmission} = {}) {
      const request = clone(input); validate('SaveTemplateRequest', request); templateSemantics(request.template);
      invariant(request.name.trim().length > 0, 'E_SCHEMA', 'Template name must be nonempty');
      const {contentHash, ...body} = request.template;
      invariant(await digest(body) === contentHash, 'E_HASH', 'Template content hash mismatch');
      return service.transaction(['templates', 'entitlements'], 'readwrite', async tx => {
        const policy = perCallAdmission || hooks.admitTemplate;
        const quota = policy ? await policy({templateId: request.template.templateId, request: clone(request), tx}) : await gate('saveTemplate', request, tx);
        invariant(quota && [1, 50].includes(quota.maxSavedTemplates ?? 1), 'E_ENTITLEMENT', 'Invalid template admission result');
        const template = request.template, key = revisionKey(template.templateId, template.revision);
        const existing = await tx.get('templates', key), head = await tx.get('templates', headKey(template.templateId));
        if (existing) {
          await checkedTemplate(existing);
          invariant(equal(existing.template, template) && existing.metadata.name === request.name, 'E_PARENT_CONFLICT', 'Immutable template revision conflict');
          // Save request CAS evidence is persisted separately from frozen output.
          invariant(existing.saveDigest === await digest(request), 'E_PARENT_CONFLICT', 'Duplicate save differs from original request');
          return {metadata: clone(existing.metadata), head: clone(existing.template)};
        }
        const parent = head?.metadata.headRevision ?? null;
        invariant(request.expectedParentRevision === parent && template.parentRevision === parent && template.revision === (parent === null ? 1 : parent + 1), 'E_PARENT_CONFLICT', 'Template head changed');
        invariant(request.expectedNameRevision === (head?.metadata.nameRevision ?? null), 'E_REVISION', 'Template name revision changed');
        if (!head) {
          const maxSavedTemplates = quota.maxSavedTemplates ?? 1;
          invariant([1, 50].includes(maxSavedTemplates), 'E_ENTITLEMENT', 'Invalid template entitlement');
          invariant((await tx.all('templates')).filter(row => row.metadata && !row.template).length < maxSavedTemplates, 'E_ENTITLEMENT', 'Saved template limit reached');
        }
        const metadata = {templateId: template.templateId, name: request.name, headRevision: template.revision,
          nameRevision: head ? head.metadata.nameRevision + (head.metadata.name === request.name ? 0 : 1) : 1};
        validate('TemplateMetadata', metadata);
        await tx.put('templates', {template, metadata, saveDigest: await digest(request)}, key);
        await tx.put('templates', {metadata}, headKey(template.templateId));
        return {metadata: clone(metadata), head: clone(template)};
      });
    },
    async listTemplates(input) {
      const request = clone(input); validate('ListTemplatesRequest', request);
      return service.transaction(['templates'], 'readonly', async tx => {
        await gate('listTemplates', request, tx);
        const heads = (await tx.all('templates')).filter(row => row.metadata && !row.template).sort((a, b) => a.metadata.templateId < b.metadata.templateId ? -1 : a.metadata.templateId > b.metadata.templateId ? 1 : 0);
        const after = request.cursor === null ? -1 : heads.findIndex(row => row.metadata.templateId === request.cursor);
        invariant(request.cursor === null || after >= 0, 'E_SCHEMA', 'Unknown template cursor');
        const selected = heads.slice(after + 1, after + 1 + request.limit), templates = [];
        for (const row of selected) {
          validate('TemplateMetadata', row.metadata);
          const head = await checkedTemplate(await tx.get('templates', revisionKey(row.metadata.templateId, row.metadata.headRevision)));
          templates.push({metadata: clone(row.metadata), head});
        }
        return {templates, nextCursor: after + 1 + selected.length < heads.length ? selected.at(-1).metadata.templateId : null};
      });
    },
    async getTemplateRevision(input) {
      const request = clone(input); validate('GetTemplateRevisionRequest', request);
      return service.transaction(['templates'], 'readonly', async tx => {
        await gate('getTemplateRevision', request, tx);
        return checkedTemplate(await tx.get('templates', revisionKey(request.templateId, request.revision)));
      });
    },
    async getTemplateByHash(hash) {
      invariant(typeof hash === 'string' && /^[0-9a-f]{64}$/.test(hash), 'E_SCHEMA', 'Invalid template hash');
      return service.transaction(['templates'], 'readonly', async tx => {
        const rows = (await tx.all('templates')).filter(row => row.template?.contentHash === hash);
        invariant(rows.length === 1, 'E_SCHEMA', 'Hash must match exactly one stored revision');
        return checkedTemplate(rows[0]);
      });
    },
    async renameTemplate(input) {
      const request = clone(input); validate('RenameTemplateRequest', request);
      invariant(request.name.trim().length > 0, 'E_SCHEMA', 'Template name must be nonempty');
      return service.transaction(['templates'], 'readwrite', async tx => {
        await gate('renameTemplate', request, tx);
        const row = await tx.get('templates', headKey(request.templateId));
        invariant(row?.metadata, 'E_SCHEMA', 'Template missing');
        invariant(row.metadata.nameRevision === request.expectedNameRevision, 'E_REVISION', 'Template name changed');
        const metadata = {...row.metadata, name: request.name, nameRevision: row.metadata.nameRevision + 1};
        validate('TemplateMetadata', metadata);
        await tx.put('templates', {metadata}, headKey(request.templateId));
        return metadata;
      });
    },
    async beginPage(input) {
      const request = clone(input); validate('BeginPageRequest', request);
      return service.transaction(pageStores, 'readwrite', async tx => {
        await gate('beginPage', request, tx);
        const run = await auth(tx, request.identity, false, true), requestKey = STORAGE_KEYS.begin(run.runId, request.requestId);
        const beginDigest = await digest(request), previous = await tx.get('commandJournal', requestKey);
        if (previous) {
          invariant(previous.beginDigest === beginDigest, 'E_BATCH_CONFLICT', 'beginPage requestId conflict');
          const snapshot = await tx.get('pageSnapshots', previous.snapshotId);
          invariant(snapshot?.state === 'open', 'E_SEAL_INCOMPLETE', 'Reserved snapshot is no longer open');
          return clone(snapshot);
        }
        duration(run);
        invariant(request.pageSequence === run.committedPages + 1 && request.pageSequence <= limits(run).maxPages, 'E_LIMIT', 'Page sequence or budget exhausted');
        invariant(request.expectedCheckpointSnapshotId === (run.checkpoint?.lastSnapshotId ?? null), 'E_REVISION', 'Checkpoint changed');
        pageUrl(request.expectedPageIdentity, run.target.allowedOrigin);
        invariant(!(await tx.all('pageSnapshots')).some(row => row.runId === run.runId && (row.state === 'open' || row.pageSequence === request.pageSequence)), 'E_SEAL_INCOMPLETE', 'Run already reserved this page sequence');
        invariant(!await tx.get('commandJournal', request.readCommandId), 'E_BATCH_CONFLICT', 'readCommandId already reserved');
        const snapshotId = newId();
        const snapshot = {snapshotId, runId: run.runId, ownerEpoch: run.ownerEpoch, pageSequence: request.pageSequence,
          state: 'open', pageIdentity: request.expectedPageIdentity, batchCount: 0, stagedRowCount: 0, stagedBytes: 0,
          sealSeq: null, sealDigest: null, pageSignature: null, abortReason: null, sourceIdentity: request.identity,
          readCommandId: request.readCommandId, expectedCheckpointSnapshotId: request.expectedCheckpointSnapshotId,
          readEnd: null, sealIdentity: null, immutableSealAck: null};
        validate('PageSnapshot', snapshot);
        await tx.put('pageSnapshots', snapshot, snapshotId);
        await tx.put('commandJournal', {tag: 'read-reservation', commandId: request.readCommandId, identity: request.identity,
          runId: run.runId, ownerEpoch: run.ownerEpoch, snapshotId, requestId: request.requestId, beginDigest}, request.readCommandId);
        await tx.put('commandJournal', {tag: 'begin-request', runId: run.runId, requestId: request.requestId, snapshotId, beginDigest}, requestKey);
        return clone(snapshot);
      });
    },
    async stagePageBatch(input) {
      const request = clone(input), runId = request.identity?.runId, count = pending.get(runId) || 0;
      pending.set(runId, count + 1);
      try {
        return await pageMutation('stagePageBatch', request, async (tx, snapshot) => {
          const run = await auth(tx, request.identity);
          invariant(count < BUDGETS.maxPendingACKs, 'E_LIMIT', 'At most two unacknowledged stage batches');
          validate('StageRequest', request);
          invariant(snapshot.state === 'open', 'E_SEAL_INCOMPLETE', 'Page is not open');
          invariant(request.batchId === `${snapshot.snapshotId}:${request.batchIndex}`, 'E_BATCH_CONFLICT', 'Noncanonical batchId');
          const envelope = pick(request, ['snapshotId', 'batchIndex', 'records']), size = bytes(envelope);
          invariant(size <= BUDGETS.maxBatchBytes && size === request.utf8Bytes && request.records.length > 0 && await digest(envelope) === request.digest, 'E_HASH', 'Batch digest or exact UTF-8 bytes mismatch');
          const old = await tx.get('batches', request.batchId);
          if (old) {
            invariant(old.digest === request.digest && old.utf8Bytes === size && old.rowCount === request.records.length, 'E_BATCH_CONFLICT', 'Duplicate batch content differs');
            return {ack: 'durable-staged', snapshotId: snapshot.snapshotId, batchIndex: request.batchIndex, digest: request.digest, duplicate: true};
          }
          duration(run);
          invariant(request.batchIndex === snapshot.batchCount, 'E_SEAL_INCOMPLETE', 'Stage batches must be contiguous');
          const template = await templateForRun(tx, run), evidence = await readEvidence(tx, snapshot, template, false);
          for (let offset = 0; offset < request.records.length; offset++) {
            const value = request.records[offset], rowIndex = snapshot.stagedRowCount + offset;
            invariant(value.rowIndex === rowIndex && value.recordKey === `${snapshot.snapshotId}:${rowIndex}`, 'E_SEAL_INCOMPLETE', 'Rows must be contiguous with exact record keys');
            fields(template, value.raw, value.values);
            invariant(bytes({raw: value.raw, values: value.values}) <= BUDGETS.maxRecordBytes, 'E_LIMIT', 'Record byte budget exceeded');
            invariant(evidence.rawRows[rowIndex] && equal(evidence.rawRows[rowIndex], value.raw), 'E_SEAL_INCOMPLETE', 'Stage raw values do not match authenticated read');
          }
          invariant(run.committedCount + snapshot.stagedRowCount + request.records.length <= limits(run).maxRecords &&
            (run.entitlementSnapshot.tier !== 'free' || snapshot.stagedRowCount + request.records.length <= 100) &&
            run.storedBytes + size <= limits(run).maxStoredBytes, 'E_LIMIT', 'Whole page exceeds run budget');
          invariant(await profileBytes(tx) + size <= BUDGETS.profileStoredBytes, 'E_QUOTA', 'Profile storage budget exceeded');
          for (const value of request.records) await tx.put('records', {...value, runId: run.runId, snapshotId: snapshot.snapshotId, batchId: request.batchId}, value.recordKey);
          await tx.put('batches', {batchId: request.batchId, runId: run.runId, snapshotId: snapshot.snapshotId,
            batchIndex: request.batchIndex, rowStart: snapshot.stagedRowCount, rowCount: request.records.length, digest: request.digest, utf8Bytes: size}, request.batchId);
          snapshot.batchCount++; snapshot.stagedRowCount += request.records.length; snapshot.stagedBytes += size;
          run.storedBytes += size;
          await tx.put('pageSnapshots', snapshot, snapshot.snapshotId); await tx.put('runs', run, run.runId);
          return {ack: 'durable-staged', snapshotId: snapshot.snapshotId, batchIndex: request.batchIndex, digest: request.digest, duplicate: false};
        });
      } finally { const remaining = (pending.get(runId) || 1) - 1; if (remaining) pending.set(runId, remaining); else pending.delete(runId); }
    },
    async sealPage(input) {
      const request = clone(input);
      return pageMutation('sealPage', request, async (tx, snapshot) => {
        validate('SealRequest', request);
        const identity = {...request.identity}; delete identity.runRevision;
        const sealDigest = await digest({...request, identity});
        if (snapshot.state === 'sealed') {
          await auth(tx, request.identity, true);
          invariant(sameIdentity(snapshot.sealIdentity, request.identity, {ignoreRevision: true}) && snapshot.sealDigest === sealDigest && snapshot.immutableSealAck, 'E_BATCH_CONFLICT', 'Historic seal request differs');
          return {...clone(snapshot.immutableSealAck), duplicate: true};
        }
        const run = await auth(tx, request.identity);
        invariant(snapshot.state === 'open', 'E_SEAL_INCOMPLETE', 'Page was aborted');
        duration(run);
        invariant(snapshot.pageSequence === run.committedPages + 1 && snapshot.expectedCheckpointSnapshotId === (run.checkpoint?.lastSnapshotId ?? null), 'E_REVISION', 'Seal checkpoint CAS failed');
        invariant(request.pageIdentity === snapshot.pageIdentity && request.nextCheckpoint.url === snapshot.pageIdentity && request.nextCheckpoint.pageNumber === snapshot.pageSequence && request.nextCheckpoint.lastSnapshotId === snapshot.snapshotId, 'E_TARGET', 'Checkpoint must identify this authenticated sealed page');
        const template = await templateForRun(tx, run), {rawRows, end} = await readEvidence(tx, snapshot, template, true);
        const batches = (await tx.all('batches')).filter(batch => batch.snapshotId === snapshot.snapshotId).sort((a, b) => a.batchIndex - b.batchIndex);
        invariant(request.batchCount === batches.length && snapshot.batchCount === batches.length && request.batchDigests.length === batches.length && request.rowCount === snapshot.stagedRowCount && request.byteCount === snapshot.stagedBytes && end.rowCount === request.rowCount && equal(end.emptyEvidence, request.emptyEvidence), 'E_SEAL_INCOMPLETE', 'Seal count/end evidence mismatch');
        const records = await readSnapshotRecords(tx, snapshot, batches);
        invariant(records.length === request.rowCount && rawRows.length === records.length && batches.reduce((n, batch) => n + batch.utf8Bytes, 0) === request.byteCount && batches.every((batch, i) => batch.digest === request.batchDigests[i]), 'E_SEAL_INCOMPLETE', 'Seal is not the entire contiguous page');
        for (let i = 0; i < records.length; i++) {
          fields(template, records[i].raw, records[i].values);
          invariant(equal(records[i].raw, rawRows[i]), 'E_HASH', 'Sealed raw record differs from agent read');
        }
        if (records.length === 0) invariant(batches.length === 0 && request.byteCount === 0 && end.frameCount === 0 && typeof end.emptyEvidence === 'string' && end.emptyEvidence.trim().length > 0 && (template.list.allowEmpty || template.list.emptyMarkerSelector), 'E_SEAL_INCOMPLETE', 'Empty page needs authenticated allowed-empty/marker evidence');
        invariant(await digest({pageIdentity: snapshot.pageIdentity, records: records.map(row => ({raw: row.raw, values: row.values}))}) === request.pageSignature, 'E_HASH', 'Page signature must cover every raw and typed row');
        const naturalEnd = template.pagination.mode === 'none' || (end.emptyEvidence === `end-marker:${template.pagination.endMarkerSelector}`);
        const prior = (await tx.all('pageSnapshots')).filter(row => row.runId === run.runId && row.state === 'sealed');
        invariant(naturalEnd || !prior.some(row => row.pageSignature === request.pageSignature), 'E_EFFECT_UNKNOWN', 'Repeated full page signature without natural end evidence');
        invariant(run.committedPages + 1 <= limits(run).maxPages && run.committedCount + records.length <= limits(run).maxRecords && run.storedBytes <= limits(run).maxStoredBytes, 'E_LIMIT', 'Seal exceeds budget');
        // Exactly at a limit without end proof is a limit event, not success.
        // Complete page stays available; the coordinator chooses the terminal state.
        run.committedPages++; run.committedCount += records.length; run.commitSeq++; run.eventSeq++;
        run.checkpoint = clone(request.nextCheckpoint);
        const ack = {ack: 'page-sealed', snapshotId: snapshot.snapshotId, committedCount: run.committedCount,
          committedPages: run.committedPages, checkpoint: clone(run.checkpoint), sealSeq: run.commitSeq, duplicate: false};
        validate('SealAck', ack);
        snapshot.state = 'sealed'; snapshot.sealSeq = ack.sealSeq; snapshot.sealDigest = sealDigest;
        snapshot.pageSignature = request.pageSignature; snapshot.readEnd = clone(end); snapshot.sealIdentity = clone(request.identity); snapshot.immutableSealAck = clone(ack);
        await tx.put('pageSnapshots', snapshot, snapshot.snapshotId); await tx.put('runs', run, run.runId);
        return ack;
      });
    },
    async openReaderPin({runId, readerPinId = newId(), sealWatermark = null}) {
      checkId(runId); checkId(readerPinId);
      return service.transaction(['runs', 'commandJournal', 'pageSnapshots'], 'readwrite', async tx => {
        await gate('openReaderPin', {runId, readerPinId, sealWatermark}, tx);
        const run = await untombstoned(tx, runId), key = STORAGE_KEYS.reader(readerPinId), previous = await tx.get('commandJournal', key);
        const watermark = sealWatermark === null ? (previous?.sealWatermark ?? run.commitSeq) : sealWatermark;
        invariant(Number.isSafeInteger(watermark) && watermark >= 0 && watermark <= run.commitSeq, 'E_SCHEMA', 'Invalid reader watermark');
        if (previous) { invariant(previous.runId === runId && previous.sealWatermark === watermark && !previous.released, 'E_REVISION', 'Reader pin conflict'); return clone(previous); }
        const snapshots = (await tx.all('pageSnapshots')).filter(row => row.runId === runId && row.state === 'sealed' && row.sealSeq <= watermark);
        const pin = {tag: 'reader-pin', readerPinId, runId, sealWatermark: watermark, committedCount: snapshots.reduce((n, row) => n + row.stagedRowCount, 0), committedPages: snapshots.length, released: false, createdAt: now()};
        await tx.put('commandJournal', pin, key); return pin;
      });
    },
    async releaseReaderPin({runId, readerPinId}) {
      checkId(runId); checkId(readerPinId);
      return service.transaction(['commandJournal'], 'readwrite', async tx => {
        await gate('releaseReaderPin', {runId, readerPinId}, tx);
        const key = STORAGE_KEYS.reader(readerPinId), pin = await tx.get('commandJournal', key);
        invariant(pin?.tag === 'reader-pin' && pin.runId === runId, 'E_SCHEMA', 'Reader pin missing');
        if (!pin.released) { pin.released = true; pin.releasedAt = now(); await tx.put('commandJournal', pin, key); }
        return {released: true, readerPinId};
      });
    },
    async readRecords(input) {
      const request = clone(input); validate('ReadRecordsRequest', request);
      return service.transaction(['runs', 'commandJournal', 'pageSnapshots', 'records'], 'readonly', async tx => {
        await gate('readRecords', request, tx); await untombstoned(tx, request.runId);
        const pin = await tx.get('commandJournal', STORAGE_KEYS.reader(request.readerPinId));
        invariant(pin?.tag === 'reader-pin' && !pin.released && pin.runId === request.runId && pin.sealWatermark === request.sealWatermark, 'E_REVISION', 'Reader pin or watermark mismatch');
        const snapshots = (await tx.all('pageSnapshots')).filter(row => row.runId === request.runId && row.state === 'sealed' && row.sealSeq <= pin.sealWatermark).sort((a, b) => a.sealSeq - b.sealSeq);
        let offset = 0;
        if (request.cursor !== null) {
          let cursor;
          try { cursor = JSON.parse(request.cursor); } catch { throw new FoundationError('E_SCHEMA', 'Invalid reader cursor'); }
          invariant(equal(Object.keys(cursor).sort(), ['offset', 'readerPinId', 'runId', 'sealWatermark']) && cursor.runId === request.runId && cursor.readerPinId === request.readerPinId && cursor.sealWatermark === pin.sealWatermark && Number.isSafeInteger(cursor.offset) && cursor.offset >= 0 && cursor.offset <= pin.committedCount, 'E_SCHEMA', 'Reader cursor does not belong to this pin');
          offset = cursor.offset;
        }
        const records = []; let position = 0;
        for (const snapshot of snapshots) {
          for (let rowIndex = 0; rowIndex < snapshot.stagedRowCount; rowIndex++, position++) {
            if (position < offset || records.length >= request.limit) continue;
            const stored = await tx.get('records', `${snapshot.snapshotId}:${rowIndex}`);
            invariant(stored && stored.runId === request.runId && stored.snapshotId === snapshot.snapshotId, 'E_SCHEMA', 'Sealed record missing');
            const value = record(stored); validate('Record', value); records.push(value);
          }
        }
        invariant(position === pin.committedCount, 'E_SCHEMA', 'Reader pinned count changed');
        const next = offset + records.length;
        return {records, nextCursor: next < pin.committedCount ? canonical({runId: request.runId, readerPinId: request.readerPinId, sealWatermark: pin.sealWatermark, offset: next}) : null, committedCount: pin.committedCount};
      });
    },
    async deleteRun({runId, explicitUserAction}) {
      checkId(runId); invariant(explicitUserAction === true, 'E_SCHEMA', 'Explicit delete required');
      return service.transaction(STORE_NAMES.filter(name => name !== 'templates' && name !== 'entitlements'), 'readwrite', async tx => {
        await gate('deleteRun', {runId, explicitUserAction}, tx);
        const existing = await tx.get('commandJournal', STORAGE_KEYS.tombstone(runId));
        if (existing) return {deleted: true, tombstoneId: existing.tombstoneId};
        const run = await tx.get('runs', runId);
        invariant(run && terminal.has(run.state) && run.retirementState === 'released', 'E_OWNER', 'Fence and retire target before deleting run');
        const slot = await tx.get('runs', STORAGE_KEYS.slot);
        invariant(slot?.currentRunId !== runId, 'E_OWNER', 'Run still owns slot');
        const journal = await tx.all('commandJournal');
        invariant(!journal.some(row => (row.runId === runId || row.identity?.runId === runId) && ((row.tag === 'reader-pin' && !row.released) || ['prepared', 'dispatched', 'effect_unknown'].includes(row.state))), 'E_OWNER', 'Run has active reader or unresolved journal');
        const jobs = (await tx.all('exportJobs')).filter(row => row.runId === runId);
        invariant(jobs.every(row => ['delivery_complete', 'delivery_failed', 'abandoned'].includes(row.state)), 'E_OWNER', 'Run has an open export');
        const attempts = (await tx.all('downloadReceipts')).filter(row => row.tag === 'attempt' && row.attempt.runId === runId);
        invariant(attempts.every(row => ['complete', 'interrupted', 'conflict', 'abandoned'].includes(row.attempt.state)), 'E_OWNER', 'Abandon unresolved download attempts before delete');
        const tombstoneId = newId(), timestamp = now();
        await tx.put('commandJournal', {tag: 'run-tombstone', runId, tombstoneId, deletedAt: timestamp, retainUntil: timestamp + BUDGETS.retentionDays * 86400000}, STORAGE_KEYS.tombstone(runId));
        for (const store of ['records', 'batches', 'pageSnapshots', 'artifacts']) {
          const rows = await tx.all(store), jobIds = new Set(jobs.map(job => job.exportJobId));
          for (const row of rows) {
            if (store === 'artifacts') {
              if (row.tag === 'artifact' && jobIds.has(row.artifact.exportJobId)) {
                await tx.delete(store, row.artifact.artifactId);
                for (const key of row.artifact.chunkKeys) await tx.delete(store, key);
              }
            } else if (row.runId === runId) await tx.delete(store, store === 'records' ? row.recordKey : store === 'batches' ? row.batchId : row.snapshotId);
          }
        }
        // Keep run/commands/export/attempt receipt history for late audit. A
        // tombstone blocks every reader/writer from resurrecting product data.
        run.tombstoned = true; run.storedBytes = 0;
        await tx.put('runs', run, runId);
        return {deleted: true, tombstoneId};
      });
    },
    async setRetention({runId, terminalAt}) {
      checkId(runId); invariant(Number.isSafeInteger(terminalAt) && terminalAt >= 0 && terminalAt <= now(), 'E_SCHEMA', 'Invalid terminal time');
      return service.transaction(['runs', 'commandJournal'], 'readwrite', async tx => {
        const run = await untombstoned(tx, runId); invariant(terminal.has(run.state), 'E_OWNER', 'Retention only applies to terminal runs');
        const key = STORAGE_KEYS.retention(runId), old = await tx.get('commandJournal', key);
        if (old) { invariant(old.terminalAt === terminalAt, 'E_REVISION', 'Retention time is immutable'); return old; }
        const policy = {tag: 'retention-policy', runId, terminalAt, retainUntil: terminalAt + BUDGETS.retentionDays * 86400000};
        await tx.put('commandJournal', policy, key); return policy;
      });
    },
    async cleanupRetention() {
      const policies = await service.transaction(['commandJournal'], 'readonly', async tx => (await tx.all('commandJournal')).filter(row => row.tag === 'retention-policy' && row.retainUntil <= now()));
      const result = {deletedRunIds: [], protectedRunIds: []};
      for (const policy of policies) {
        try { await methods.deleteRun({runId: policy.runId, explicitUserAction: true}); result.deletedRunIds.push(policy.runId); }
        catch (error) { if (error.code !== 'E_OWNER') throw error; result.protectedRunIds.push(policy.runId); }
      }
      return result;
    },
    async preserveMigrationBackup({backupId, rawUtf8Backup}) {
      checkId(backupId); invariant(typeof rawUtf8Backup === 'string', 'E_SCHEMA', 'Raw migration backup required');
      // Validate encoding, not legacy JSON/executable interpretation. Duplicate
      // keys and malformed legacy templates remain raw until migration review.
      canonical(rawUtf8Backup);
      const utf8Bytes = encoder.encode(rawUtf8Backup).byteLength, rawHash = await digest(rawUtf8Backup);
      return service.transaction(['commandJournal', 'runs', 'artifacts'], 'readwrite', async tx => {
        const key = STORAGE_KEYS.migration(backupId), old = await tx.get('commandJournal', key);
        if (old) { invariant(old.rawUtf8Backup === rawUtf8Backup, 'E_BATCH_CONFLICT', 'Migration backup id conflict'); return old; }
        invariant(await profileBytes(tx) + utf8Bytes <= BUDGETS.profileStoredBytes, 'E_QUOTA', 'Migration backup exceeds profile budget');
        const backup = {tag: 'migration-backup', backupId, rawUtf8Backup, rawHash, utf8Bytes, createdAt: now(), executable: false};
        await tx.put('commandJournal', backup, key); return backup;
      });
    }
  };
  return methods;
}
