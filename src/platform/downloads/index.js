const EXPORT_STORE="exportJobs";
import {requireGrant} from '../target/index.js';
import {INCLUDE_DORMANT_TEMPLATE_RUNTIME} from '../template-runtime-contract.js';
import { BUDGETS, canonical, invariant, newId, validate } from '../protocol.js';
import { canReleaseBlob, hashArtifactBytes } from './blob-lifecycle.js';
import { VALUE_PROTOCOL, base64ToBytes, decodeValue } from '../page-port/codec.js';
const COMMAND_JOURNAL="commandJournal",DOWNLOAD_RECEIPTS="downloadReceipts";


export { canReleaseBlob, createHostBlobRegistry, hashArtifactBytes } from './blob-lifecycle.js';

const STORES = ['runs', COMMAND_JOURNAL, EXPORT_STORE, 'artifacts', DOWNLOAD_RECEIPTS];
const GENERIC_STORES = [...STORES, 'results'];
const generic = value => value?.kind === 'controller-artifact';
const artifactMimes = ['application/json', 'text/plain;charset=utf-8', 'application/octet-stream'];
const jobStates = ['preparing', 'ready', 'delivering', 'delivery_complete', 'delivery_partial', 'delivery_unknown', 'delivery_failed', 'abandoned'];
const id = value => invariant(typeof value === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(value), 'E_SCHEMA', 'Invalid artifact id');
const key = (tag, id) => `${tag}:${id}`;
const intentKey = id => key('export-intent', id);
const pinId = id => key('export', id);
const pinKey = id => key('reader', pinId(id));
const terminal = state => ['complete', 'interrupted', 'abandoned', 'conflict'].includes(state);
const frozen = state => ['abandoned', 'conflict'].includes(state);
const iso = ms => new Date(ms).toISOString();
const copy = value => structuredClone(value);

function exact(value, fields) {
  invariant(value && typeof value === 'object' && !Array.isArray(value), 'E_SCHEMA', 'Expected object');
  invariant(Object.keys(value).length === fields.length && fields.every(f => Object.hasOwn(value, f)), 'E_SCHEMA', 'Unexpected request fields');
}

function filename(value) {
  invariant(typeof value === 'string' && value.length > 0 && value.length <= 128 && !/[\\/\u0000-\u001f\u007f]/.test(value) && !['.', '..'].includes(value),
    'E_SCHEMA', 'Filename must be a safe basename');
}

function checkJob(job) {
  if (!generic(job)) return validate('ExportJob', job);
  exact(job, ['kind', 'exportJobId', 'runId', 'resultId', 'namespace', 'principal', 'format', 'artifactIds', 'activeAttemptIds', 'state']);
  for (const field of ['exportJobId', 'runId', 'resultId']) id(job[field]);
  invariant(typeof job.namespace === 'string' && job.namespace && typeof job.principal === 'string' && job.principal &&
    ['typed-json', 'data'].includes(job.format) && jobStates.includes(job.state), 'E_SCHEMA', 'Invalid controller artifact job');
  invariant(Array.isArray(job.artifactIds) && job.artifactIds.length === 1 && Array.isArray(job.activeAttemptIds) && job.activeAttemptIds.length <= 1,
    'E_SCHEMA', 'Generic job requires one artifact and at most one active attempt');
  for (const value of [...job.artifactIds, ...job.activeAttemptIds]) id(value);
  invariant(job.activeAttemptIds.length > 0 || ['preparing', 'abandoned'].includes(job.state), 'E_SCHEMA', 'Missing active artifact attempt');
  return job;
}

function checkArtifact(artifact) {
  if (!generic(artifact)) return validate('Artifact', artifact);
  exact(artifact, ['kind', 'artifactId', 'exportJobId', 'runId', 'resultId', 'namespace', 'principal', 'format', 'mime', 'bytes', 'byteCount',
    'sha256', 'storageEncoding', 'chunkKeys', 'filename']);
  for (const field of ['artifactId', 'exportJobId', 'runId', 'resultId']) id(artifact[field]);
  filename(artifact.filename);
  invariant(typeof artifact.namespace === 'string' && artifact.namespace && typeof artifact.principal === 'string' && artifact.principal &&
    ['typed-json', 'data'].includes(artifact.format) && artifactMimes.includes(artifact.mime) &&
    (artifact.format !== 'typed-json' || artifact.mime === 'application/json'), 'E_SCHEMA', 'Invalid generic artifact type');
  invariant(Number.isSafeInteger(artifact.bytes) && artifact.bytes >= 0 && artifact.bytes <= BUDGETS.maxArtifactBytes && artifact.byteCount === artifact.bytes &&
    /^[a-f0-9]{64}$/.test(artifact.sha256) && artifact.storageEncoding === 'Uint8Array-chunks', 'E_SCHEMA', 'Invalid generic artifact bytes');
  invariant(Array.isArray(artifact.chunkKeys) && artifact.chunkKeys.length >= 1 && artifact.chunkKeys.length <= 64 &&
    new Set(artifact.chunkKeys).size === artifact.chunkKeys.length, 'E_SCHEMA', 'Artifact exceeds chunk budget');
  artifact.chunkKeys.forEach(id);
  return artifact;
}

function aggregate(job, attempts) {
  if (job.state === 'abandoned' || attempts.length === 0) return job;
  if (attempts.some(a => ['interrupted', 'conflict', 'abandoned'].includes(a.state))) job.state = 'delivery_failed';
  else if (attempts.every(a => a.state === 'complete')) job.state = 'delivery_complete';
  else if (attempts.some(a => ['mapping_unknown', 'deadline_unknown'].includes(a.state))) job.state = 'delivery_unknown';
  else if (attempts.every(a => a.state === 'prepared')) job.state = 'ready';
  else job.state = 'delivering';
  checkJob(job);
  return job;
}

export function createDownloadService({ storage, api, clock = Date.now, assertHost }) {
  invariant(storage?.transaction && api?.downloads && typeof assertHost === 'function', 'E_SCHEMA', 'Download service requires storage, Chrome API and host authentication');
  const extensionId = api.runtime?.id;
  invariant(typeof extensionId === 'string' && extensionId.length > 0, 'E_TARGET', 'Extension identity is required');
  const pending = new Set();
  const failures = [];
  let detach = null;
  const now = () => {
    const ms = Number(typeof clock === 'function' ? clock() : clock.now());
    invariant(Number.isSafeInteger(ms) && ms >= 0, 'E_SCHEMA', 'Invalid clock');
    return ms;
  };
  const transaction = (mode, callback) => storage.transaction(STORES, mode, callback);
  const genericTransaction = (mode, callback) => storage.transaction(GENERIC_STORES, mode, callback);
  const track = promise => {
    pending.add(promise);
    promise.catch(error => failures.push(error)).finally(() => pending.delete(promise));
  };
  const chromeCall = (name, argument) => new Promise((resolve, reject) => {
    const callback = value => {
      const error = api.runtime?.lastError;
      if (error) reject(new Error(error.message)); else resolve(value);
    };
    try {
      const result = api.downloads[name](argument, callback);
      if (result?.then) result.then(resolve, reject);
    } catch (error) { reject(error); }
  });

  async function liveRun(tx, runId) {
    const run = await tx.get('runs', runId);
    invariant(run && !run.tombstoned && !(await tx.get(COMMAND_JOURNAL, key('tombstone', runId))), 'E_TOMBSTONE', 'Run is deleted or unavailable');
    return run;
  }

  async function downloadRows(tx) {
    const rows = await tx.all(DOWNLOAD_RECEIPTS);
    invariant(rows.every(row => ['attempt', 'receipt', 'candidate'].includes(row?.tag)), 'E_SCHEMA', 'Unknown download record tag');
    return rows;
  }

  function hostMatches(auth, record) {
    invariant(auth && ['registrationId', 'hostInstanceId', 'hostDocumentId', 'browserSessionIncarnation']
      .every(field => typeof record[field] === 'string' && auth[field] === record[field]), 'E_OWNER', 'Host registration does not own this export');
  }

  async function authenticate(sender, record) {
    const auth = await assertHost(sender, record.registrationId);
    hostMatches(auth, record);
    return auth;
  }

  async function currentGenericHost(tx, auth, sender) {
    const host = await tx.get(COMMAND_JOURNAL, key('host', auth.registrationId));
    invariant(host?.tag === 'host' && host.active === true && host.revoked === false &&
      host.hostDocumentId === sender?.documentId && host.hostUrl === sender?.url && host.hostTabId === (sender?.tab?.id ?? null),
    'E_OWNER', 'Registered host document changed before artifact transaction');
    hostMatches(auth, host);
    invariant(typeof host.namespace === 'string' && host.namespace && typeof host.principal === 'string' && host.principal &&
      host.namespace === auth.namespace && host.principal === auth.principal, 'E_OWNER', 'Unique authority must issue a stable namespace and principal');
    return host;
  }

  async function controllerResult(tx, request, host) {
    const run = await liveRun(tx, request.runId);
    invariant(run.tag === 'controller-run' && run.runId === request.runId && run.resultId === request.resultId &&
      run.namespace === host.namespace && run.principal === host.principal,
    'E_OWNER', 'Controller result belongs to another namespace or principal');
    const result = await tx.get('results', request.resultId);
    invariant(result?.tag === 'controller-result' && result.resultId === run.resultId && result.runId === run.runId &&
      result.namespace === host.namespace && result.principal === host.principal && JSON.stringify(result.revision) === JSON.stringify(run.revision),
    'E_OWNER', 'Durable controller result binding differs');
    invariant(!run.resultDeliveryRevoked, 'E_PERMISSION', 'Result delivery permission was revoked');
    invariant(run.state === 'completed' && result.state === 'completed' && result.outcome?.ok === true && Object.hasOwn(result.outcome, 'valueWire'),
      'E_OWNER', 'Only a durable successful controller result can produce an artifact');
    return {run, result};
  }

  async function currentIntentHost(tx, auth, intent, sender) {
    hostMatches(auth, intent);
    if (generic(intent)) {
      const host = await currentGenericHost(tx, auth, sender);
      invariant(host.namespace === intent.namespace && host.principal === intent.principal, 'E_OWNER', 'Artifact namespace has been fenced');
    }
  }

  // Artifact preparation reads the immutable result from the shared store. The
  // privileged worker persists bytes only; the owning host creates the Blob.
  async function prepareArtifact(request, sender) {
    exact(request, request?.format === 'data' ? ['requestId', 'runId', 'resultId', 'filename', 'format', 'data'] :
      ['requestId', 'runId', 'resultId', 'filename', 'format']);
    for (const field of ['requestId', 'runId', 'resultId']) id(request[field]);
    filename(request.filename);
    invariant(['typed-json', 'data'].includes(request.format), 'E_SCHEMA', 'Unknown artifact format');
    request = copy(request);
    const auth = await assertHost(sender);
    const snapshot = await genericTransaction('readonly', async tx => {
      const host = await currentGenericHost(tx, auth, sender);
      return controllerResult(tx, request, host);
    });
    await requireGrant(api,snapshot.run.target.allowedOrigin);
    decodeValue(snapshot.result.outcome.valueWire);
    const sourceJson = JSON.stringify(snapshot.result);
    let chunks, mime;
    if (request.format === 'data') {
      exact(request.data, ['mime', 'blocks']);
      invariant(artifactMimes.includes(request.data.mime) && Array.isArray(request.data.blocks) && request.data.blocks.length > 0 && request.data.blocks.length <= 64,
        'E_SCHEMA', 'Explicit artifact data requires an approved MIME and 1..64 blocks');
      chunks = request.data.blocks.map(block => base64ToBytes(block));
      mime = request.data.mime;
    } else {
      const bytes = new TextEncoder().encode(JSON.stringify({protocol: VALUE_PROTOCOL, runId: request.runId, resultId: request.resultId,
        valueWire: snapshot.result.outcome.valueWire}) + '\n');
      invariant(bytes.byteLength <= BUDGETS.maxArtifactBytes, 'E_LIMIT', 'Artifact exceeds 8 MiB');
      chunks = [];
      for (let offset = 0; offset < bytes.byteLength; offset += BUDGETS.maxRawFrameBytes) chunks.push(bytes.slice(offset, offset + BUDGETS.maxRawFrameBytes));
      mime = 'application/json';
    }
    const size = chunks.reduce((sum, bytes) => sum + bytes.byteLength, 0);
    invariant(size <= BUDGETS.maxArtifactBytes && chunks.length <= 64, 'E_LIMIT', 'Artifact exceeds 8 MiB/64 blocks');
    const requestCanonical = canonical(request);
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const exportJobId = newId(), artifactId = newId(), preparedAt = iso(now()), sha256 = await hashArtifactBytes(bytes);
    const resultSha256 = await hashArtifactBytes(new TextEncoder().encode(sourceJson));
    const artifact = checkArtifact({kind: 'controller-artifact', artifactId, exportJobId, runId: request.runId, resultId: request.resultId,
      namespace: auth.namespace, principal: auth.principal, format: request.format, mime, bytes: size, byteCount: size, sha256,
      storageEncoding: 'Uint8Array-chunks', chunkKeys: chunks.map((_, index) => key('chunk', `${artifactId}:${index}`)), filename: request.filename});
    const job = checkJob({kind: 'controller-artifact', exportJobId, runId: request.runId, resultId: request.resultId, namespace: auth.namespace,
      principal: auth.principal, format: request.format, artifactIds: [artifactId], activeAttemptIds: [], state: 'preparing'});
    const requestKey = key('export-request', canonical(['artifact', auth.registrationId, request.requestId]));
    return genericTransaction('readwrite', async tx => {
      const host = await currentGenericHost(tx, auth, sender), current = await controllerResult(tx, request, host);
      invariant(JSON.stringify(current.result) === sourceJson, 'E_REQUEST_CONFLICT', 'Controller result changed before artifact commit');
      const previous = await tx.get(COMMAND_JOURNAL, requestKey);
      if (previous) {
        invariant(previous.requestCanonical === requestCanonical, 'E_REQUEST_CONFLICT', 'Artifact request ID has different content');
        const intent = await tx.get(COMMAND_JOURNAL, intentKey(previous.exportJobId));
        await currentIntentHost(tx, auth, intent, sender);
        const row = await tx.get('artifacts', previous.artifactId);
        invariant(row?.tag === 'artifact', 'E_SCHEMA', 'Prepared artifact is missing');
        checkArtifact(row.artifact);
        return {exportJobId: intent.exportJobId, artifactId: row.artifact.artifactId, artifact: copy(row.artifact), job: copy(await tx.get(EXPORT_STORE, intent.exportJobId))};
      }
      const runs = await tx.all('runs'), artifacts = await tx.all('artifacts'), journal = await tx.all(COMMAND_JOURNAL);
      const stored = artifacts.filter(row => row.tag === 'artifact').reduce((sum, row) => sum + (row.artifact.byteCount ?? row.artifact.bytes), 0);
      const profile = stored + runs.reduce((sum, row) => sum + (row.storedBytes ?? 0), 0) +
        journal.filter(row => row.tag === 'migration-backup').reduce((sum, row) => sum + row.utf8Bytes, 0);
      invariant(profile + size <= BUDGETS.profileStoredBytes &&
        artifacts.filter(row => row.tag === 'artifact' && row.artifact.runId === request.runId).reduce((sum, row) => sum + row.artifact.bytes, 0) + size <= BUDGETS.maxStoredBytes,
      'E_QUOTA', 'Artifact exceeds shared storage budget');
      const intent = {tag: 'export-intent', kind: 'controller-artifact', exportJobId, runId: request.runId, resultId: request.resultId,
        resultSha256, namespace: host.namespace, principal: host.principal, registrationId: host.registrationId, hostInstanceId: host.hostInstanceId,
        hostDocumentId: host.hostDocumentId, browserSessionIncarnation: host.browserSessionIncarnation,
        ownerEpochAtCreation: current.run.ownerEpoch, preparedAt, frozen: false, readerPinId: pinId(exportJobId)};
      await tx.put(COMMAND_JOURNAL, intent, intentKey(exportJobId));
      await tx.put(COMMAND_JOURNAL, {tag: 'reader-pin', readerPinId: pinId(exportJobId), runId: request.runId, resultId: request.resultId,
        exportJobId, released: false, createdAt: Date.parse(preparedAt)}, pinKey(exportJobId));
      await tx.put('artifacts', {tag: 'artifact', artifact}, artifactId);
      for (const [index, chunk] of chunks.entries()) await tx.put('artifacts', {tag: 'artifact-chunk', parentArtifactId: artifactId,
        exportJobId, runId: request.runId, bytes: chunk}, artifact.chunkKeys[index]);
      await tx.put(EXPORT_STORE, job, exportJobId);
      await tx.put(COMMAND_JOURNAL, {tag: 'export-request', requestCanonical, exportJobId, artifactId}, requestKey);
      return {exportJobId, artifactId, artifact: copy(artifact), job: copy(job)};
    });
  }

  async function prepareAttempt(request, sender) {
    exact(request, ['requestId', 'artifactId', 'blobUrl']); id(request.requestId); id(request.artifactId);
    invariant(typeof request.blobUrl === 'string' && request.blobUrl.startsWith(`blob:chrome-extension://${extensionId}/`) &&
      request.blobUrl.length > `blob:chrome-extension://${extensionId}/`.length && !/[\u0000-\u0020\u007f]/.test(request.blobUrl),
    'E_SCHEMA', 'RunHost must provide a fresh same-extension Blob URL');
    request = copy(request);
    const read = await readArtifact({artifactId: request.artifactId}, sender);
    invariant(generic(read.artifact), 'E_SCHEMA', 'Generic attempt requires a generic artifact');
    const intent = await transaction('readonly', tx => tx.get(COMMAND_JOURNAL, intentKey(read.artifact.exportJobId)));
    const auth = await authenticate(sender, intent), requestCanonical = canonical(request);
    const requestKey = key('export-request', canonical(['attempt', auth.registrationId, request.requestId])), at = now();
    return genericTransaction('readwrite', async tx => {
      const storedIntent = await tx.get(COMMAND_JOURNAL, intentKey(intent.exportJobId));
      await currentIntentHost(tx, auth, storedIntent, sender);
      const binding = await controllerResult(tx, storedIntent, auth);
      invariant(await hashArtifactBytes(new TextEncoder().encode(JSON.stringify(binding.result))) === storedIntent.resultSha256,
        'E_HASH', 'Controller result changed after artifact preparation');
      const descriptor = await tx.get('artifacts', request.artifactId);
      invariant(descriptor?.tag === 'artifact' && JSON.stringify(descriptor.artifact) === JSON.stringify(read.artifact), 'E_HASH', 'Artifact changed before attempt commit');
      // Recheck bytes within the attempt transaction; a corruption between read
      // and commit cannot acquire native dispatch authority.
      let offset = 0;
      for (const chunkKey of read.artifact.chunkKeys) {
        const chunk = await tx.get('artifacts', chunkKey);
        invariant(chunk?.tag === 'artifact-chunk' && chunk.parentArtifactId === request.artifactId && chunk.exportJobId === intent.exportJobId &&
          chunk.bytes instanceof Uint8Array && chunk.bytes.length <= BUDGETS.maxRawFrameBytes && offset + chunk.bytes.length <= read.bytes.length &&
          chunk.bytes.every((byte, index) => byte === read.bytes[offset + index]), 'E_HASH', 'Artifact bytes changed before attempt commit');
        offset += chunk.bytes.length;
      }
      invariant(offset === read.bytes.length, 'E_HASH', 'Artifact byte count changed');
      const previous = await tx.get(COMMAND_JOURNAL, requestKey);
      if (previous) {
        invariant(previous.requestCanonical === requestCanonical, 'E_REQUEST_CONFLICT', 'Attempt request ID has different content');
        const row = await tx.get(DOWNLOAD_RECEIPTS, key('attempt', previous.attemptId));
        invariant(row?.tag === 'attempt' && row.attempt.artifactId === request.artifactId, 'E_SCHEMA', 'Prepared attempt is missing');
        return copy(row.attempt);
      }
      invariant(!storedIntent.frozen && at >= Date.parse(storedIntent.preparedAt), 'E_OWNER', 'Artifact is abandoned or its clock is fenced');
      const job = checkJob(await tx.get(EXPORT_STORE, intent.exportJobId));
      invariant(job.state !== 'abandoned' && job.artifactIds[0] === request.artifactId, 'E_OWNER', 'Artifact job is unavailable');
      const rows = await downloadRows(tx);
      invariant(!rows.some(row => row.tag === 'attempt' && row.attempt.blobUrl === request.blobUrl), 'E_SCHEMA', 'Each attempt requires a fresh Blob URL');
      for (const attemptId of job.activeAttemptIds) {
        const row = await tx.get(DOWNLOAD_RECEIPTS, key('attempt', attemptId));
        invariant(row?.tag === 'attempt' && canReleaseBlob(row.attempt, at), 'E_OWNER', 'Previous download still needs its artifact');
      }
      const attempt = {attemptId: newId(), exportJobId: intent.exportJobId, runId: intent.runId, artifactId: request.artifactId,
        artifactHash: read.artifact.sha256, artifactBytes: read.artifact.bytes, rowCount: 0,
        hostInstanceId: auth.hostInstanceId, hostDocumentId: auth.hostDocumentId, ownerEpochAtCreation: storedIntent.ownerEpochAtCreation,
        blobUrl: request.blobUrl, filename: read.artifact.filename, preparedAt: iso(at), dispatchAt: null, mappingDeadline: null, downloadDeadline: null,
        state: 'prepared', downloadId: null, resourceReleasedAt: null, timedOutAt: null, candidateDownloadIds: [], mappedAt: null, submissionCount: 0};
      validate('DownloadAttempt', attempt);
      job.activeAttemptIds = [attempt.attemptId]; job.state = 'ready';
      await tx.put(EXPORT_STORE, checkJob(job), job.exportJobId);
      await tx.put(DOWNLOAD_RECEIPTS, {tag: 'attempt', attempt, callbackDownloadId: null, lastObservedAt: null, attemptId: attempt.attemptId,
        exportJobId: attempt.exportJobId, runId: attempt.runId, artifactId: attempt.artifactId, state: attempt.state, fullBlobUrl: attempt.blobUrl,
        mappingSearchCount: 0, nextMappingSearchAt: null}, key('attempt', attempt.attemptId));
      const pin = await tx.get(COMMAND_JOURNAL, pinKey(job.exportJobId));
      invariant(pin?.tag === 'reader-pin', 'E_SCHEMA', 'Artifact reader pin is missing');
      await tx.put(COMMAND_JOURNAL, {...pin, released: false, releasedAt: null}, pinKey(job.exportJobId));
      await tx.put(COMMAND_JOURNAL, {tag: 'export-request', requestCanonical, exportJobId: job.exportJobId, artifactId: request.artifactId,
        attemptId: attempt.attemptId}, requestKey);
      return copy(attempt);
    });
  }

  async function projection(tx, row) {
    return { attempt: copy(row.attempt), receipt: copy((await tx.get(DOWNLOAD_RECEIPTS, key('receipt', row.attempt.attemptId)))?.receipt ?? null),
      job: copy(await tx.get(EXPORT_STORE, row.attempt.exportJobId) ?? null) };
  }

  async function saveAttempt(tx, row, observedAt) {
    validate('DownloadAttempt', row.attempt);
    Object.assign(row, { attemptId: row.attempt.attemptId, exportJobId: row.attempt.exportJobId, runId: row.attempt.runId,
      artifactId: row.attempt.artifactId, state: row.attempt.state, fullBlobUrl: row.attempt.blobUrl });
    if (row.attempt.downloadId === null) delete row.boundDownloadId;
    else row.boundDownloadId = row.attempt.downloadId;
    await tx.put(DOWNLOAD_RECEIPTS, row, key('attempt', row.attempt.attemptId));
    const job = await tx.get(EXPORT_STORE, row.attempt.exportJobId);
    if (!job) return;
    const attempts = [];
    for (const id of job.activeAttemptIds) {
      const record = await tx.get(DOWNLOAD_RECEIPTS, key('attempt', id));
      invariant(record?.tag === 'attempt', 'E_SCHEMA', 'Missing active download attempt');
      attempts.push(record.attempt);
    }
    await tx.put(EXPORT_STORE, aggregate(job, attempts), job.exportJobId);
    if (attempts.every(a => canReleaseBlob(a, Date.parse(observedAt)))) {
      const pin = await tx.get(COMMAND_JOURNAL, pinKey(job.exportJobId));
      if (pin && !pin.released) await tx.put(COMMAND_JOURNAL, { ...pin, released: true, releasedAt: Date.parse(observedAt) }, pinKey(job.exportJobId));
    }
  }

  async function prepareExport(request, sender) {
    validate('ExportRequest', request);
    const snapshot = await transaction('readonly', tx => liveRun(tx, request.runId));
    invariant(snapshot.tag !== 'controller-run', 'E_SCHEMA', 'Controller results require prepareArtifact');
    const auth = await authenticate(sender, snapshot);
    const requestCanonical = canonical(request);
    const exportJobId = newId();
    const preparedAt = iso(now());
    return transaction('readwrite', async tx => {
      const run = await liveRun(tx, request.runId);
      hostMatches(auth, run);
      const requestKey = key('export-request', request.requestId);
      const previous = await tx.get(COMMAND_JOURNAL, requestKey);
      if (previous) {
        invariant(previous.requestCanonical === requestCanonical, 'E_REVISION', 'Export request ID already has different content');
        const intent = await tx.get(COMMAND_JOURNAL, intentKey(previous.exportJobId));
        hostMatches(auth, intent);
        return copy(intent);
      }
      invariant(!run.resultDeliveryRevoked, 'E_PERMISSION', 'Result delivery permission was revoked');
    invariant(run.state === 'completed' || request.partialConfirmed === true, 'E_SEMANTIC', 'Partial export must be confirmed');
      const intent = { tag: 'export-intent', exportJobId, runId: run.runId, templateHash: run.templateHash,
        sealWatermark: run.commitSeq, committedCount: run.committedCount, format: request.format, csvMode: request.csvMode,
        partial: run.state !== 'completed', registrationId: auth.registrationId, hostInstanceId: auth.hostInstanceId,
        hostDocumentId: auth.hostDocumentId, browserSessionIncarnation: auth.browserSessionIncarnation,
        ownerEpochAtCreation: run.ownerEpoch, preparedAt, frozen: false, readerPinId: pinId(exportJobId) };
      await tx.put(COMMAND_JOURNAL, intent, intentKey(exportJobId));
      await tx.put(COMMAND_JOURNAL, { tag: 'reader-pin', readerPinId: pinId(exportJobId), runId: run.runId,
        sealWatermark: run.commitSeq, committedCount: run.committedCount, committedPages: run.committedPages,
        exportJobId, released: false, createdAt: Date.parse(preparedAt) }, pinKey(exportJobId));
      await tx.put(COMMAND_JOURNAL, { tag: 'export-request', requestCanonical, exportJobId }, requestKey);
      return copy(intent);
    });
  }

  async function buildVolumes(intent, volumes) {
    invariant(Array.isArray(volumes) && volumes.length > 0 && volumes.length <= BUDGETS.maxRecords + 1, 'E_SCHEMA', 'Nonempty bounded volumes required');
    const result = [];
    const urls = new Set();
    for (const [volumeIndex, volume] of volumes.entries()) {
      exact(volume, ['bytes', 'filename', 'blobUrl', 'rowCount']);
      invariant(volume.bytes instanceof Uint8Array && volume.bytes.byteLength <= BUDGETS.maxArtifactBytes, 'E_SCHEMA', 'Invalid artifact bytes');
      invariant(typeof volume.filename === 'string' && volume.filename.length > 0 && !/[\\/\u0000-\u001f]/.test(volume.filename) && !['.', '..'].includes(volume.filename), 'E_SCHEMA', 'Invalid download filename');
      invariant(typeof volume.blobUrl === 'string' && volume.blobUrl.startsWith(`blob:chrome-extension://${extensionId}/`) && !urls.has(volume.blobUrl), 'E_TARGET', 'A unique fresh extension Blob URL is required');
      urls.add(volume.blobUrl);
      const bytes = volume.bytes.slice();
      const artifactId = newId();
      const artifact = { artifactId, exportJobId: intent.exportJobId, volumeIndex, format: intent.format,
        mime: intent.format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json', bytes: bytes.byteLength,
        rowCount: volume.rowCount, sha256: await hashArtifactBytes(bytes), storageEncoding: 'Uint8Array-chunks',
        chunkKeys: [key('chunk', artifactId)], filename: volume.filename, templateHash: intent.templateHash, sealWatermark: intent.sealWatermark };
      const attempt = { attemptId: newId(), exportJobId: intent.exportJobId, runId: intent.runId, artifactId,
        artifactHash: artifact.sha256, artifactBytes: artifact.bytes, rowCount: artifact.rowCount, hostInstanceId: intent.hostInstanceId,
        hostDocumentId: intent.hostDocumentId, ownerEpochAtCreation: intent.ownerEpochAtCreation, blobUrl: volume.blobUrl,
        filename: artifact.filename, preparedAt: iso(now()), dispatchAt: null, mappingDeadline: null, downloadDeadline: null,
        state: 'prepared', downloadId: null, resourceReleasedAt: null, timedOutAt: null, candidateDownloadIds: [], mappedAt: null, submissionCount: 0 };
      validate('Artifact', artifact);
      validate('DownloadAttempt', attempt);
      result.push({ artifact, attempt, bytes });
    }
    invariant(result.reduce((sum, v) => sum + v.artifact.rowCount, 0) === intent.committedCount, 'E_SEMANTIC', 'Artifact row counts differ from pinned export');
    return result;
  }

  async function storeVolumes(tx, intent, built) {
    const existing = await tx.get(EXPORT_STORE, intent.exportJobId);
    if (existing) {
      const attempts = [], artifacts = [];
      for (const id of existing.artifactIds) artifacts.push((await tx.get('artifacts', id)).artifact);
      for (const id of existing.activeAttemptIds) attempts.push((await tx.get(DOWNLOAD_RECEIPTS, key('attempt', id))).attempt);
      invariant(artifacts.length === built.length && artifacts.every((a, i) => a.sha256 === built[i].artifact.sha256 && a.rowCount === built[i].artifact.rowCount && a.filename === built[i].artifact.filename && attempts[i].blobUrl === built[i].attempt.blobUrl), 'E_REVISION', 'Prepared export cannot be changed');
      return { job: copy(existing), artifacts: copy(artifacts), attempts: copy(attempts) };
    }
    invariant(!intent.frozen, 'E_OWNER', 'Export submission authority is frozen');
    const rows = await downloadRows(tx);
    invariant(built.every(v => !rows.some(r => r.tag === 'attempt' && r.attempt.blobUrl === v.attempt.blobUrl)), 'E_DOWNLOAD_MAPPING', 'Blob URLs cannot be reused');
    const job = { exportJobId: intent.exportJobId, runId: intent.runId, templateHash: intent.templateHash,
      sealWatermark: intent.sealWatermark, committedCount: intent.committedCount, format: intent.format, csvMode: intent.csvMode,
      partial: intent.partial, artifactIds: built.map(v => v.artifact.artifactId), activeAttemptIds: built.map(v => v.attempt.attemptId), state: 'ready' };
    validate('ExportJob', job);
    for (const { artifact, attempt, bytes } of built) {
      await tx.put('artifacts', { tag: 'artifact', artifactId: artifact.artifactId, exportJobId: artifact.exportJobId, artifact }, artifact.artifactId);
      await tx.put('artifacts', { tag: 'artifact-chunk', artifactId: artifact.chunkKeys[0], parentArtifactId: artifact.artifactId,
        exportJobId: artifact.exportJobId, bytes }, artifact.chunkKeys[0]);
      await tx.put(DOWNLOAD_RECEIPTS, { tag: 'attempt', attempt, callbackDownloadId: null, lastObservedAt: null,
        attemptId: attempt.attemptId, exportJobId: attempt.exportJobId, runId: attempt.runId, artifactId: attempt.artifactId,
        state: attempt.state, fullBlobUrl: attempt.blobUrl, mappingSearchCount: 0, nextMappingSearchAt: null }, key('attempt', attempt.attemptId));
    }
    await tx.put(EXPORT_STORE, job, job.exportJobId);
    return { job: copy(job), artifacts: built.map(v => copy(v.artifact)), attempts: built.map(v => copy(v.attempt)) };
  }

  async function prepareAttempts(request, sender) {
    exact(request, ['exportJobId', 'volumes']);
    const intent = await transaction('readonly', tx => tx.get(COMMAND_JOURNAL, intentKey(request.exportJobId)));
    invariant(intent?.tag === 'export-intent', 'E_SCHEMA', 'Export intent is missing');
    invariant(!generic(intent), 'E_SCHEMA', 'Controller artifacts require prepareAttempt');
    const auth = await authenticate(sender, intent);
    const built = await buildVolumes(intent, request.volumes);
    return transaction('readwrite', async tx => {
      const stored = await tx.get(COMMAND_JOURNAL, intentKey(intent.exportJobId));
      hostMatches(auth, stored);
      await liveRun(tx, intent.runId);
      return storeVolumes(tx, stored, built);
    });
  }

  async function readArtifact(request, sender) {
    exact(request, ['artifactId']);
    const { artifactId } = request;
    const descriptor = await transaction('readonly', tx => tx.get('artifacts', artifactId));
    invariant(descriptor?.tag === 'artifact', 'E_SCHEMA', 'Artifact is missing');
    checkArtifact(descriptor.artifact);
    const intent = await transaction('readonly', tx => tx.get(COMMAND_JOURNAL, intentKey(descriptor.artifact.exportJobId)));
    const auth = await authenticate(sender, intent);
    const readTransaction = generic(descriptor.artifact) ? genericTransaction : transaction;
    let resultBytes, expectedResultHash, resultOrigin;
    const bytes = await readTransaction('readonly', async tx => {
      await liveRun(tx, intent.runId);
      const currentIntent = await tx.get(COMMAND_JOURNAL, intentKey(intent.exportJobId));
      await currentIntentHost(tx, auth, currentIntent, sender);
      const current = await tx.get('artifacts', artifactId);
      invariant(current?.tag === 'artifact' && JSON.stringify(current.artifact) === JSON.stringify(descriptor.artifact), 'E_HASH', 'Artifact descriptor changed');
      if (generic(descriptor.artifact)) {
        invariant(generic(currentIntent) && descriptor.artifact.runId === currentIntent.runId && descriptor.artifact.resultId === currentIntent.resultId &&
          descriptor.artifact.namespace === currentIntent.namespace && descriptor.artifact.principal === currentIntent.principal,
        'E_OWNER', 'Artifact provenance differs from its export intent');
        const binding = await controllerResult(tx, currentIntent, auth);
        resultOrigin = binding.run.target.allowedOrigin;
        resultBytes = new TextEncoder().encode(JSON.stringify(binding.result)); expectedResultHash = currentIntent.resultSha256;
      }
      const output = new Uint8Array(descriptor.artifact.bytes);
      let offset = 0;
      for (const chunkKey of descriptor.artifact.chunkKeys) {
        const chunk = await tx.get('artifacts', chunkKey);
        invariant(chunk?.tag === 'artifact-chunk' && chunk.parentArtifactId === artifactId && chunk.exportJobId === intent.exportJobId &&
          chunk.bytes instanceof Uint8Array && offset + chunk.bytes.length <= output.length &&
          (!generic(descriptor.artifact) || chunk.bytes.length <= BUDGETS.maxRawFrameBytes), 'E_SCHEMA', 'Artifact chunk missing or oversized');
        output.set(chunk.bytes, offset); offset += chunk.bytes.length;
      }
      invariant(offset === output.length, 'E_SCHEMA', 'Artifact byte count mismatch');
      return output;
    });
    invariant(await hashArtifactBytes(bytes) === descriptor.artifact.sha256, 'E_HASH', 'Artifact bytes changed');
    if (resultBytes) {
      invariant(await hashArtifactBytes(resultBytes) === expectedResultHash, 'E_HASH', 'Controller result changed after artifact preparation');
      await requireGrant(api,resultOrigin);
      await genericTransaction('readonly',async tx=>controllerResult(tx,intent,await currentGenericHost(tx,auth,sender)));
    }
    return { artifact: descriptor.artifact, bytes };
  }

  async function dispatchDownload(request, sender) {
    exact(request, ['attemptId']);
    const snapshot = await transaction('readonly', tx => tx.get(DOWNLOAD_RECEIPTS, key('attempt', request.attemptId)));
    invariant(snapshot?.tag === 'attempt', 'E_SCHEMA', 'Download attempt is missing');
    const intent = await transaction('readonly', tx => tx.get(COMMAND_JOURNAL, intentKey(snapshot.attempt.exportJobId)));
    const auth = await authenticate(sender, intent);
    if (generic(intent)) {
      const binding=await genericTransaction('readonly',tx=>controllerResult(tx,intent,auth));
      await requireGrant(api,binding.run.target.allowedOrigin);
    }
    const at = now();
    const dispatched = await transaction('readwrite', async tx => {
      const row = await tx.get(DOWNLOAD_RECEIPTS, key('attempt', request.attemptId));
      const storedIntent = await tx.get(COMMAND_JOURNAL, intentKey(row.attempt.exportJobId));
      await currentIntentHost(tx, auth, storedIntent, sender);
      const run=await liveRun(tx, row.attempt.runId);
      if (generic(storedIntent)) invariant(!run.resultDeliveryRevoked,'E_PERMISSION');
      if (row.attempt.submissionCount === 1) return null;
      invariant(!storedIntent.frozen && row.attempt.state === 'prepared', 'E_OWNER', 'Attempt cannot be submitted');
      invariant(at >= Date.parse(row.attempt.preparedAt), 'E_SEMANTIC', 'Clock moved backwards');
      Object.assign(row.attempt, { state: 'dispatched', submissionCount: 1, dispatchAt: iso(at),
        mappingDeadline: iso(at + BUDGETS.mappingWindowMs), downloadDeadline: iso(at + BUDGETS.downloadDeadlineMs) });
      await saveAttempt(tx, row, iso(at));
      return copy(row.attempt);
    });
    // Only the invocation that committed prepared -> dispatched has call authority.
    if (dispatched) track(submit(dispatched));
    return { accepted: true, state: 'dispatched' };
  }

  async function submit(attempt) {
    let downloadId;
    try { downloadId = await chromeCall('download', { url: attempt.blobUrl, filename: attempt.filename, conflictAction: 'uniquify', saveAs: false }); }
    catch { return; } // A rejected/lost callback does not prove that Chrome made no file.
    if (!Number.isSafeInteger(downloadId) || downloadId < 0) return;
    await transaction('readwrite', async tx => {
      const row = await tx.get(DOWNLOAD_RECEIPTS, key('attempt', attempt.attemptId));
      if (!row) return;
      if (row.callbackDownloadId !== null && row.callbackDownloadId !== downloadId) row.attempt.state = frozen(row.attempt.state) ? row.attempt.state : 'conflict';
      row.callbackDownloadId = downloadId;
      await saveAttempt(tx, row, iso(now()));
    });
    await reconcileDownload({ attemptId: attempt.attemptId });
  }

  function match(item, attempt) {
    const started = Date.parse(item?.startTime);
    return Number.isSafeInteger(item?.id) && item.id >= 0 && item.url === attempt.blobUrl && item.byExtensionId === extensionId &&
      Number.isFinite(started) && started >= Date.parse(attempt.dispatchAt) - 2000 && started <= Date.parse(attempt.mappingDeadline);
  }

  function candidate(item) {
    return { tag: 'candidate', downloadId: item.id, fullBlobUrl: item.url, byExtensionId: item.byExtensionId,
      startTime: item.startTime, state: item.state, interruptReason: typeof item.error === 'string' ? item.error : null };
  }

  async function reconcileDownload(request, options = {}) {
    const { evidence = 'search', force = false } = options;
    exact(request, ['attemptId']);
    const at = now();
    const snapshot = await transaction('readonly', tx => tx.get(DOWNLOAD_RECEIPTS, key('attempt', request.attemptId)));
    invariant(snapshot?.tag === 'attempt', 'E_SCHEMA', 'Download attempt is missing');
    const a = snapshot.attempt;
    // The broker passes the actual sender as the second argument. Internal
    // Chrome callbacks/recovery pass evidence options, and must still reconcile
    // durable native receipts after an owning host disappears.
    const sender = typeof options.documentId === 'string' ? options : null;
    let publicAuth, publicIntent;
    if (sender) {
      const intent = await transaction('readonly', tx => tx.get(COMMAND_JOURNAL, intentKey(a.exportJobId)));
      if (generic(intent)) { publicIntent = intent; publicAuth = await authenticate(sender, intent); }
    }
    const fence = async tx => {
      if (publicAuth) await currentIntentHost(tx, publicAuth, await tx.get(COMMAND_JOURNAL, intentKey(publicIntent.exportJobId)), sender);
    };
    if (publicAuth) await transaction('readonly', fence);
    if (a.submissionCount === 0 || (terminal(a.state) && !frozen(a.state))) return transaction('readonly', async tx => {
      await fence(tx); return projection(tx, snapshot);
    });
    const knownId = snapshot.callbackDownloadId ?? a.downloadId;
    const deadlineDue = at >= Date.parse(a.downloadDeadline) && a.state !== 'deadline_unknown';
    const mappingDue = at >= Date.parse(a.mappingDeadline) && a.state === 'dispatched';
    const throttled = knownId === null && !force && !deadlineDue && !mappingDue && at < (snapshot.nextMappingSearchAt ?? 0);
    let items = [], searched = false;
    if (!throttled) {
      try {
        items = await chromeCall('search', knownId === null
          ? { url: a.blobUrl, startedAfter: iso(Date.parse(a.dispatchAt) - 2001), startedBefore: iso(Date.parse(a.mappingDeadline) + 1), limit: 0 }
          : { id: knownId });
        searched = Array.isArray(items);
        if (!searched) items = [];
      } catch { /* A failed search is unknown evidence. */ }
    }
    return transaction('readwrite', async tx => {
      await fence(tx);
      const row = await tx.get(DOWNLOAD_RECEIPTS, key('attempt', request.attemptId));
      if (!row) return { attempt: null, receipt: null, job: null };
      const attempt = row.attempt;
      if (terminal(attempt.state) && !frozen(attempt.state)) return projection(tx, row);
      const run = await tx.get('runs', attempt.runId);
      const deleted = !run || run.tombstoned || Boolean(await tx.get(COMMAND_JOURNAL, key('tombstone', attempt.runId)));
      if (deleted && !terminal(attempt.state)) attempt.state = 'abandoned';
      const backwards = at < Date.parse(attempt.dispatchAt) || (row.lastObservedAt !== null && at < Date.parse(row.lastObservedAt));
      const matches = new Map();
      const candidates = await downloadRows(tx);
      for (const c of candidates) {
        if (c.tag === 'candidate' && match({ id: c.downloadId, url: c.fullBlobUrl, byExtensionId: c.byExtensionId, startTime: c.startTime }, attempt))
          matches.set(c.downloadId, { id: c.downloadId });
      }
      const verified = new Map();
      if (!backwards) for (const item of items) {
        if (match(item, attempt)) {
          matches.set(item.id, item); verified.set(item.id, item);
          await tx.put(DOWNLOAD_RECEIPTS, candidate(item), key('candidate', item.id));
        }
      }
      attempt.candidateDownloadIds = [...matches.keys()].sort((x, y) => x - y);
      const authoritativeId = row.callbackDownloadId ?? attempt.downloadId;
      const conflicting = matches.size > 1 || candidates.some(c => c.tag === 'attempt' && c.attempt.attemptId !== attempt.attemptId &&
        c.attempt.downloadId !== null && matches.has(c.attempt.downloadId)) ||
        (authoritativeId !== null && [...matches.keys()].some(id => id !== authoritativeId)) ||
        (row.callbackDownloadId !== null && attempt.downloadId !== null && row.callbackDownloadId !== attempt.downloadId) ||
        items.some(item => item?.id === authoritativeId && !match(item, attempt));
      if (conflicting && !frozen(attempt.state)) attempt.state = 'conflict';
      let item = null;
      if (!backwards && !conflicting && matches.size === 1) {
        const id = [...matches.keys()][0];
        item = verified.get(id) ?? null; // onCreated alone never establishes a receipt.
        if (item && !frozen(attempt.state) && !deleted) {
          attempt.downloadId = id;
          attempt.mappedAt ??= iso(at);
        }
      }
      if (item && ['in_progress', 'complete', 'interrupted'].includes(item.state)) {
        const receipt = { attemptId: attempt.attemptId, downloadId: item.id, observedState: item.state, observedAt: iso(at), evidence,
          byExtensionId: extensionId, late: Boolean(attempt.timedOutAt || attempt.state === 'mapping_unknown' || at >= Date.parse(attempt.downloadDeadline)),
          browserDownloadComplete: item.state === 'complete', diskHashVerified: false,
          interruptReason: item.state === 'interrupted' && typeof item.error === 'string' ? item.error : null };
        validate('Receipt', receipt);
        const prior = await tx.get(DOWNLOAD_RECEIPTS, key('receipt', attempt.attemptId));
        if (!prior || prior.receipt.observedState === 'in_progress') await tx.put(DOWNLOAD_RECEIPTS, { tag: 'receipt', receipt }, key('receipt', attempt.attemptId));
        if (!frozen(attempt.state) && !deleted) attempt.state = item.state;
      }
      if (!terminal(attempt.state)) {
        if (at >= Date.parse(attempt.downloadDeadline)) {
          attempt.state = 'deadline_unknown'; attempt.timedOutAt ??= iso(at);
        } else if (attempt.downloadId === null && at >= Date.parse(attempt.mappingDeadline)) {
          attempt.state = 'mapping_unknown'; attempt.timedOutAt ??= iso(at);
        }
      }
      if (!backwards) row.lastObservedAt = iso(at);
      if (!throttled) {
        row.mappingSearchCount++;
        row.nextMappingSearchAt = at + (at >= Date.parse(attempt.mappingDeadline) ? 60000 : 1000);
      }
      await saveAttempt(tx, row, iso(at));
      return projection(tx, row);
    });
  }

  async function handleCreated(item) {
    if (!Number.isSafeInteger(item?.id) || item.id < 0 || item.byExtensionId !== extensionId || typeof item.url !== 'string' || !Number.isFinite(Date.parse(item.startTime))) return;
    const ids = await transaction('readwrite', async tx => {
      const rows = await downloadRows(tx);
      const attempts = rows.filter(r => r.tag === 'attempt' && r.attempt.submissionCount === 1 && match(item, r.attempt));
      if (attempts.length) await tx.put(DOWNLOAD_RECEIPTS, candidate(item), key('candidate', item.id));
      return attempts.map(r => r.attempt.attemptId);
    });
    for (const attemptId of ids) await reconcileDownload({ attemptId }, { force: true });
  }

  async function handleChanged(delta) {
    if (!Number.isSafeInteger(delta?.id) || delta.id < 0) return;
    const ids = await transaction('readonly', async tx => (await downloadRows(tx)).filter(r => r.tag === 'attempt' &&
      (r.attempt.downloadId === delta.id || r.callbackDownloadId === delta.id || r.attempt.candidateDownloadIds.includes(delta.id))).map(r => r.attempt.attemptId));
    for (const attemptId of ids) await reconcileDownload({ attemptId }, { evidence: 'onChanged+search', force: true });
  }

  function attach() {
    if (detach) return detach;
    const created = item => { track(handleCreated(item)); };
    const changed = delta => { track(handleChanged(delta)); };
    api.downloads.onCreated.addListener(created);
    api.downloads.onChanged.addListener(changed);
    detach = () => { api.downloads.onCreated.removeListener(created); api.downloads.onChanged.removeListener(changed); detach = null; };
    return detach;
  }

  async function reconcilePending() {
    const at = now();
    const ids = await transaction('readonly', async tx => (await downloadRows(tx)).filter(r => r.tag === 'attempt' && r.attempt.submissionCount === 1 &&
      (!['complete', 'interrupted', 'abandoned', 'conflict', 'deadline_unknown'].includes(r.attempt.state) ||
        (r.attempt.state === 'conflict' && at >= Date.parse(r.attempt.downloadDeadline) &&
          Date.parse(r.lastObservedAt ?? r.attempt.dispatchAt) < Date.parse(r.attempt.downloadDeadline)))).map(r => r.attempt.attemptId));
    const results = [];
    for (const attemptId of ids) results.push(await reconcileDownload({ attemptId }));
    await reconcileHostResources();
    return results;
  }

  async function reconcileHostResources() {
    if(typeof api.runtime.getContexts!=='function') return;
    const intents=await transaction('readonly',async tx=>(await tx.all(COMMAND_JOURNAL)).filter(row=>generic(row) && row.tag==='export-intent'));
    for(const intent of intents) {
      let contexts;
      try {contexts=await api.runtime.getContexts({documentIds:[intent.hostDocumentId]});} catch {continue;}
      if(contexts.length) continue;
      await transaction('readwrite',async tx=>{
        const current=await tx.get(COMMAND_JOURNAL,intentKey(intent.exportJobId));
        if(!current || current.hostDocumentId!==intent.hostDocumentId) return;
        const job=await tx.get(EXPORT_STORE,intent.exportJobId);
        if(!job) return;
        const rows=(await downloadRows(tx)).filter(row=>row.tag==='attempt' && row.attempt.exportJobId===job.exportJobId);
        const at=iso(now());
        if(rows.every(row=>row.attempt.submissionCount===0)) await abandonJob(tx,job,at,true);
        for(const prior of rows) {
          const row=await tx.get(DOWNLOAD_RECEIPTS,key('attempt',prior.attempt.attemptId));
          if(canReleaseBlob(row.attempt,now())) {row.attempt.resourceReleasedAt ??= at;await saveAttempt(tx,row,at);}
        }
        await tx.put(COMMAND_JOURNAL,{...await tx.get(COMMAND_JOURNAL,intentKey(job.exportJobId)),hostDocumentGoneAt:at},intentKey(job.exportJobId));
      });
    }
  }

  // Call only after registry.release(attempt) returned true (or authenticated
  // RunHost observed that its document already revoked the URL). This is an
  // acknowledgment from the owning packaged host, not SW create/revoke work.
  async function recordResourceRelease(request, sender) {
    exact(request, ['attemptId']);
    const snapshot = await transaction('readonly', tx => tx.get(DOWNLOAD_RECEIPTS, key('attempt', request.attemptId)));
    invariant(snapshot?.tag === 'attempt', 'E_SCHEMA', 'Download attempt is missing');
    const intent = await transaction('readonly', tx => tx.get(COMMAND_JOURNAL, intentKey(snapshot.attempt.exportJobId)));
    const auth = await authenticate(sender, intent);
    const at = now();
    return transaction('readwrite', async tx => {
      const row = await tx.get(DOWNLOAD_RECEIPTS, key('attempt', request.attemptId));
      await currentIntentHost(tx, auth, await tx.get(COMMAND_JOURNAL, intentKey(row.attempt.exportJobId)), sender);
      invariant(at >= Date.parse(row.lastObservedAt ?? row.attempt.preparedAt), 'E_SEMANTIC', 'Clock moved backwards');
      invariant(canReleaseBlob(row.attempt, at), 'E_OWNER', 'Blob is still needed by an active download');
      row.attempt.resourceReleasedAt ??= iso(at);
      await saveAttempt(tx, row, iso(at));
      return copy(row.attempt);
    });
  }

  async function retryExport(request, sender, { blobUrls } = {}) {
    validate('RetryExportRequest', request);
    const old = await transaction('readonly', async tx => ({ job: await tx.get(EXPORT_STORE, request.exportJobId), intent: await tx.get(COMMAND_JOURNAL, intentKey(request.exportJobId)) }));
    invariant(old.job && old.intent, 'E_SCHEMA', 'Original export is missing');
    invariant(!generic(old.job), 'E_SCHEMA', 'Controller artifacts retry through prepareAttempt with a fresh Blob URL');
    const auth = await authenticate(sender, old.intent);
    const requestCanonical = canonical(request);
    const requestKey = key('export-request', request.requestId);
    const prior = await transaction('readonly', tx => tx.get(COMMAND_JOURNAL, requestKey));
    if (prior) {
      invariant(prior.requestCanonical === requestCanonical, 'E_REVISION', 'Retry request ID conflict');
      return transaction('readonly', async tx => {
        await liveRun(tx, old.job.runId);
        const job = await tx.get(EXPORT_STORE, prior.exportJobId);
        return { newExportJobId: job.exportJobId, attemptIds: [...job.activeAttemptIds] };
      });
    }
    invariant(Array.isArray(blobUrls) && blobUrls.length === old.job.artifactIds.length, 'E_SCHEMA', 'RunHost must supply one fresh Blob URL per retry volume');
    const newExportJobId = newId();
      const newIntent = { ...old.intent, exportJobId: newExportJobId, frozen: false, preparedAt: iso(now()), readerPinId: pinId(newExportJobId) };
    const volumes = [];
    for (const [i, artifactId] of old.job.artifactIds.entries()) {
      const { artifact, bytes } = await readArtifact({ artifactId }, sender);
      volumes.push({ bytes, rowCount: artifact.rowCount, filename: artifact.filename, blobUrl: blobUrls[i] });
    }
    const built = await buildVolumes(newIntent, volumes);
    return transaction('readwrite', async tx => {
      await liveRun(tx, old.job.runId);
      const storedIntent = await tx.get(COMMAND_JOURNAL, intentKey(old.job.exportJobId));
      hostMatches(auth, storedIntent);
      const duplicate = await tx.get(COMMAND_JOURNAL, requestKey);
      if (duplicate) {
        invariant(duplicate.requestCanonical === requestCanonical, 'E_REVISION', 'Retry request ID conflict');
        const job = await tx.get(EXPORT_STORE, duplicate.exportJobId);
        return { newExportJobId: job.exportJobId, attemptIds: [...job.activeAttemptIds] };
      }
      invariant((await tx.get(EXPORT_STORE, old.job.exportJobId)).state !== 'abandoned', 'E_OWNER', 'Abandoned export cannot be retried');
      const result = await storeVolumes(tx, newIntent, built);
      await tx.put(COMMAND_JOURNAL, { ...storedIntent, frozen: true }, intentKey(old.job.exportJobId));
      await tx.put(COMMAND_JOURNAL, newIntent, intentKey(newExportJobId));
      const oldPin = await tx.get(COMMAND_JOURNAL, pinKey(old.job.exportJobId));
      await tx.put(COMMAND_JOURNAL, { tag: 'reader-pin', readerPinId: pinId(newExportJobId), runId: newIntent.runId,
        sealWatermark: newIntent.sealWatermark, committedCount: newIntent.committedCount, committedPages: oldPin?.committedPages ?? 0,
        exportJobId: newExportJobId, released: false, createdAt: Date.parse(newIntent.preparedAt) }, pinKey(newExportJobId));
      await tx.put(COMMAND_JOURNAL, { tag: 'export-request', requestCanonical, exportJobId: newExportJobId }, requestKey);
      return { newExportJobId, attemptIds: result.job.activeAttemptIds };
    });
  }

  async function abandonJob(tx, job, at, wholeJob) {
    if (wholeJob) job.state = 'abandoned';
    await tx.put(EXPORT_STORE, job, job.exportJobId);
    const intent = await tx.get(COMMAND_JOURNAL, intentKey(job.exportJobId));
    if (intent) await tx.put(COMMAND_JOURNAL, { ...intent, frozen: true }, intentKey(job.exportJobId));
    // A generic retry retains earlier attempts in this job for late receipts.
    // Explicit abandonment also fences that history for shared run deletion.
    const attemptIds = generic(job) ? (await downloadRows(tx)).filter(row => row.tag === 'attempt' && row.attempt.exportJobId === job.exportJobId)
      .map(row => row.attempt.attemptId) : job.activeAttemptIds;
    for (const id of attemptIds) {
      const row = await tx.get(DOWNLOAD_RECEIPTS, key('attempt', id));
      if (!row || terminal(row.attempt.state)) continue;
      row.attempt.state = 'abandoned';
      await saveAttempt(tx, row, at);
    }
    const pin = await tx.get(COMMAND_JOURNAL, pinKey(job.exportJobId));
    if (pin) await tx.put(COMMAND_JOURNAL, { ...pin, released: true, releasedAt: Date.parse(at) }, pinKey(job.exportJobId));
  }

  async function retirePreparedArtifact(request, sender) {
    exact(request, ['artifactId']); id(request.artifactId);
    const descriptor=await transaction('readonly',tx=>tx.get('artifacts',request.artifactId));
    invariant(descriptor?.tag==='artifact' && generic(descriptor.artifact),'E_SCHEMA');
    const intent=await transaction('readonly',tx=>tx.get(COMMAND_JOURNAL,intentKey(descriptor.artifact.exportJobId)));
    const auth=await authenticate(sender,intent);
    return genericTransaction('readwrite',async tx=>{
      await currentIntentHost(tx,auth,await tx.get(COMMAND_JOURNAL,intentKey(intent.exportJobId)),sender);
      const job=await tx.get(EXPORT_STORE,intent.exportJobId);
      const attempts=(await downloadRows(tx)).filter(row=>row.tag==='attempt' && row.attempt.exportJobId===job.exportJobId);
      invariant(attempts.every(row=>row.attempt.submissionCount===0),'E_EFFECT_UNKNOWN','Submitted attempts require native reconciliation');
      await abandonJob(tx,job,iso(now()),true);
      return {attemptIds:attempts.map(row=>row.attempt.attemptId)};
    });
  }

  async function abandonExport(request, sender) {
    exact(request, ['exportJobId', 'explicitUserAction']);
    const { exportJobId, explicitUserAction } = request;
    invariant(explicitUserAction === true, 'E_OWNER', 'Explicit abandon action required');
    const intent = await transaction('readonly', tx => tx.get(COMMAND_JOURNAL, intentKey(exportJobId)));
    invariant(intent, 'E_SCHEMA', 'Export intent is missing');
    const auth = await authenticate(sender, intent);
    const at = iso(now());
    return transaction('readwrite', async tx => {
      await currentIntentHost(tx, auth, await tx.get(COMMAND_JOURNAL, intentKey(exportJobId)), sender);
      await liveRun(tx, intent.runId);
      const job = await tx.get(EXPORT_STORE, exportJobId);
      invariant(job, 'E_SCHEMA', 'Export job is missing');
      await abandonJob(tx, job, at, true);
      return copy(await tx.get(EXPORT_STORE, exportJobId));
    });
  }

  // Internal foundation deletion hook. Caller fences/retireTarget first. This
  // never creates/deletes runs or releases @slot.
  async function abandonRun(request) {
    exact(request, ['runId']);
    const { runId } = request;
    const at = iso(now());
    return transaction('readwrite', async tx => {
      const run = await tx.get('runs', runId);
      const slot = await tx.get('runs', '@slot');
      invariant(run?.tombstoned || await tx.get(COMMAND_JOURNAL, key('tombstone', runId)) ||
        (run?.retirementState === 'released' && ['completed', 'limit_reached', 'stopped', 'failed', 'interrupted', 'abandoned_unknown'].includes(run.state) && slot?.currentRunId !== runId), 'E_OWNER', 'Deletion fence is required');
      for (const job of await tx.all(EXPORT_STORE)) if (job.runId === runId) await abandonJob(tx, job, at, true);
      for (const record of await tx.all(COMMAND_JOURNAL)) if (record.tag === 'export-intent' && record.runId === runId) {
        await tx.put(COMMAND_JOURNAL, { ...record, frozen: true }, intentKey(record.exportJobId));
        const pin = await tx.get(COMMAND_JOURNAL, pinKey(record.exportJobId));
        if (pin) await tx.put(COMMAND_JOURNAL, { ...pin, released: true, releasedAt: Date.parse(at) }, pinKey(record.exportJobId));
      }
      return { runId, abandoned: true };
    });
  }

  async function drain() {
    while (pending.size) await Promise.allSettled([...pending]);
    if (failures.length) throw failures.shift();
  }

  // These exports are owned exclusively by the optional legacy Template
  // consumer (not installed in the packaged SW). Keep the full source API for
  // existing components; exclude unreachable consumers from that fixed bundle.
  return Object.freeze({ prepareArtifact, prepareAttempt, retirePreparedArtifact,
    ...(INCLUDE_DORMANT_TEMPLATE_RUNTIME ? {prepareExport, prepareAttempts} : {}),
    readArtifact, dispatchDownload, reconcileDownload,
    reconcilePending, reconcileHostResources, recordResourceRelease,
    ...(INCLUDE_DORMANT_TEMPLATE_RUNTIME ? {retryExport, abandonExport, abandonRun} : {}),
    handleCreated, handleChanged, attach, drain });
}
