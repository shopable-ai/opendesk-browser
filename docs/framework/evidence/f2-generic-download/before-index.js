import { BUDGETS, canonical, invariant, newId, validate } from '../protocol.js';
import { canReleaseBlob, hashArtifactBytes } from './blob-lifecycle.js';

export { canReleaseBlob, createHostBlobRegistry, hashArtifactBytes } from './blob-lifecycle.js';

const STORES = ['runs', 'commandJournal', 'exportJobs', 'artifacts', 'downloadReceipts'];
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

function aggregate(job, attempts) {
  if (job.state === 'abandoned' || attempts.length === 0) return job;
  if (attempts.some(a => ['interrupted', 'conflict', 'abandoned'].includes(a.state))) job.state = 'delivery_failed';
  else if (attempts.every(a => a.state === 'complete')) job.state = 'delivery_complete';
  else if (attempts.some(a => ['mapping_unknown', 'deadline_unknown'].includes(a.state))) job.state = 'delivery_unknown';
  else if (attempts.every(a => a.state === 'prepared')) job.state = 'ready';
  else job.state = 'delivering';
  validate('ExportJob', job);
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
    invariant(run && !run.tombstoned && !(await tx.get('commandJournal', key('tombstone', runId))), 'E_TOMBSTONE', 'Run is deleted or unavailable');
    return run;
  }

  async function downloadRows(tx) {
    const rows = await tx.all('downloadReceipts');
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

  async function projection(tx, row) {
    return { attempt: copy(row.attempt), receipt: copy((await tx.get('downloadReceipts', key('receipt', row.attempt.attemptId)))?.receipt ?? null),
      job: copy(await tx.get('exportJobs', row.attempt.exportJobId) ?? null) };
  }

  async function saveAttempt(tx, row, observedAt) {
    validate('DownloadAttempt', row.attempt);
    Object.assign(row, { attemptId: row.attempt.attemptId, exportJobId: row.attempt.exportJobId, runId: row.attempt.runId,
      artifactId: row.attempt.artifactId, state: row.attempt.state, fullBlobUrl: row.attempt.blobUrl });
    if (row.attempt.downloadId === null) delete row.boundDownloadId;
    else row.boundDownloadId = row.attempt.downloadId;
    await tx.put('downloadReceipts', row, key('attempt', row.attempt.attemptId));
    const job = await tx.get('exportJobs', row.attempt.exportJobId);
    if (!job) return;
    const attempts = [];
    for (const id of job.activeAttemptIds) {
      const record = await tx.get('downloadReceipts', key('attempt', id));
      invariant(record?.tag === 'attempt', 'E_SCHEMA', 'Missing active download attempt');
      attempts.push(record.attempt);
    }
    await tx.put('exportJobs', aggregate(job, attempts), job.exportJobId);
    if (attempts.every(a => canReleaseBlob(a, Date.parse(observedAt)))) {
      const pin = await tx.get('commandJournal', pinKey(job.exportJobId));
      if (pin && !pin.released) await tx.put('commandJournal', { ...pin, released: true, releasedAt: Date.parse(observedAt) }, pinKey(job.exportJobId));
    }
  }

  async function prepareExport(request, sender) {
    validate('ExportRequest', request);
    const snapshot = await transaction('readonly', tx => liveRun(tx, request.runId));
    const auth = await authenticate(sender, snapshot);
    const requestCanonical = canonical(request);
    const exportJobId = newId();
    const preparedAt = iso(now());
    return transaction('readwrite', async tx => {
      const run = await liveRun(tx, request.runId);
      hostMatches(auth, run);
      const requestKey = key('export-request', request.requestId);
      const previous = await tx.get('commandJournal', requestKey);
      if (previous) {
        invariant(previous.requestCanonical === requestCanonical, 'E_REVISION', 'Export request ID already has different content');
        const intent = await tx.get('commandJournal', intentKey(previous.exportJobId));
        hostMatches(auth, intent);
        return copy(intent);
      }
      invariant(run.state === 'completed' || request.partialConfirmed === true, 'E_SEMANTIC', 'Partial export must be confirmed');
      const intent = { tag: 'export-intent', exportJobId, runId: run.runId, templateHash: run.templateHash,
        sealWatermark: run.commitSeq, committedCount: run.committedCount, format: request.format, csvMode: request.csvMode,
        partial: run.state !== 'completed', registrationId: auth.registrationId, hostInstanceId: auth.hostInstanceId,
        hostDocumentId: auth.hostDocumentId, browserSessionIncarnation: auth.browserSessionIncarnation,
        ownerEpochAtCreation: run.ownerEpoch, preparedAt, frozen: false, readerPinId: pinId(exportJobId) };
      await tx.put('commandJournal', intent, intentKey(exportJobId));
      await tx.put('commandJournal', { tag: 'reader-pin', readerPinId: pinId(exportJobId), runId: run.runId,
        sealWatermark: run.commitSeq, committedCount: run.committedCount, committedPages: run.committedPages,
        exportJobId, released: false, createdAt: Date.parse(preparedAt) }, pinKey(exportJobId));
      await tx.put('commandJournal', { tag: 'export-request', requestCanonical, exportJobId }, requestKey);
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
    const existing = await tx.get('exportJobs', intent.exportJobId);
    if (existing) {
      const attempts = [], artifacts = [];
      for (const id of existing.artifactIds) artifacts.push((await tx.get('artifacts', id)).artifact);
      for (const id of existing.activeAttemptIds) attempts.push((await tx.get('downloadReceipts', key('attempt', id))).attempt);
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
      await tx.put('downloadReceipts', { tag: 'attempt', attempt, callbackDownloadId: null, lastObservedAt: null,
        attemptId: attempt.attemptId, exportJobId: attempt.exportJobId, runId: attempt.runId, artifactId: attempt.artifactId,
        state: attempt.state, fullBlobUrl: attempt.blobUrl, mappingSearchCount: 0, nextMappingSearchAt: null }, key('attempt', attempt.attemptId));
    }
    await tx.put('exportJobs', job, job.exportJobId);
    return { job: copy(job), artifacts: built.map(v => copy(v.artifact)), attempts: built.map(v => copy(v.attempt)) };
  }

  async function prepareAttempts(request, sender) {
    exact(request, ['exportJobId', 'volumes']);
    const intent = await transaction('readonly', tx => tx.get('commandJournal', intentKey(request.exportJobId)));
    invariant(intent?.tag === 'export-intent', 'E_SCHEMA', 'Export intent is missing');
    const auth = await authenticate(sender, intent);
    const built = await buildVolumes(intent, request.volumes);
    return transaction('readwrite', async tx => {
      const stored = await tx.get('commandJournal', intentKey(intent.exportJobId));
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
    const intent = await transaction('readonly', tx => tx.get('commandJournal', intentKey(descriptor.artifact.exportJobId)));
    const auth = await authenticate(sender, intent);
    const bytes = await transaction('readonly', async tx => {
      await liveRun(tx, intent.runId);
      hostMatches(auth, await tx.get('commandJournal', intentKey(intent.exportJobId)));
      const output = new Uint8Array(descriptor.artifact.bytes);
      let offset = 0;
      for (const chunkKey of descriptor.artifact.chunkKeys) {
        const chunk = await tx.get('artifacts', chunkKey);
        invariant(chunk?.tag === 'artifact-chunk' && chunk.parentArtifactId === artifactId, 'E_SCHEMA', 'Artifact chunk missing');
        output.set(chunk.bytes, offset); offset += chunk.bytes.length;
      }
      invariant(offset === output.length, 'E_SCHEMA', 'Artifact byte count mismatch');
      return output;
    });
    invariant(await hashArtifactBytes(bytes) === descriptor.artifact.sha256, 'E_HASH', 'Artifact bytes changed');
    return { artifact: descriptor.artifact, bytes };
  }

  async function dispatchDownload(request, sender) {
    exact(request, ['attemptId']);
    const snapshot = await transaction('readonly', tx => tx.get('downloadReceipts', key('attempt', request.attemptId)));
    invariant(snapshot?.tag === 'attempt', 'E_SCHEMA', 'Download attempt is missing');
    const intent = await transaction('readonly', tx => tx.get('commandJournal', intentKey(snapshot.attempt.exportJobId)));
    const auth = await authenticate(sender, intent);
    const at = now();
    const dispatched = await transaction('readwrite', async tx => {
      const row = await tx.get('downloadReceipts', key('attempt', request.attemptId));
      const storedIntent = await tx.get('commandJournal', intentKey(row.attempt.exportJobId));
      hostMatches(auth, storedIntent);
      await liveRun(tx, row.attempt.runId);
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
      const row = await tx.get('downloadReceipts', key('attempt', attempt.attemptId));
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

  async function reconcileDownload(request, { evidence = 'search', force = false } = {}) {
    exact(request, ['attemptId']);
    const at = now();
    const snapshot = await transaction('readonly', tx => tx.get('downloadReceipts', key('attempt', request.attemptId)));
    invariant(snapshot?.tag === 'attempt', 'E_SCHEMA', 'Download attempt is missing');
    const a = snapshot.attempt;
    if (a.submissionCount === 0 || (terminal(a.state) && !frozen(a.state))) return transaction('readonly', tx => projection(tx, snapshot));
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
      const row = await tx.get('downloadReceipts', key('attempt', request.attemptId));
      if (!row) return { attempt: null, receipt: null, job: null };
      const attempt = row.attempt;
      if (terminal(attempt.state) && !frozen(attempt.state)) return projection(tx, row);
      const run = await tx.get('runs', attempt.runId);
      const deleted = !run || run.tombstoned || Boolean(await tx.get('commandJournal', key('tombstone', attempt.runId)));
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
          await tx.put('downloadReceipts', candidate(item), key('candidate', item.id));
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
        const prior = await tx.get('downloadReceipts', key('receipt', attempt.attemptId));
        if (!prior || prior.receipt.observedState === 'in_progress') await tx.put('downloadReceipts', { tag: 'receipt', receipt }, key('receipt', attempt.attemptId));
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
      if (attempts.length) await tx.put('downloadReceipts', candidate(item), key('candidate', item.id));
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
    return results;
  }

  // Call only after registry.release(attempt) returned true (or authenticated
  // RunHost observed that its document already revoked the URL). This is an
  // acknowledgment from the owning packaged host, not SW create/revoke work.
  async function recordResourceRelease(request, sender) {
    exact(request, ['attemptId']);
    const snapshot = await transaction('readonly', tx => tx.get('downloadReceipts', key('attempt', request.attemptId)));
    invariant(snapshot?.tag === 'attempt', 'E_SCHEMA', 'Download attempt is missing');
    const intent = await transaction('readonly', tx => tx.get('commandJournal', intentKey(snapshot.attempt.exportJobId)));
    const auth = await authenticate(sender, intent);
    const at = now();
    return transaction('readwrite', async tx => {
      const row = await tx.get('downloadReceipts', key('attempt', request.attemptId));
      hostMatches(auth, await tx.get('commandJournal', intentKey(row.attempt.exportJobId)));
      invariant(at >= Date.parse(row.lastObservedAt ?? row.attempt.preparedAt), 'E_SEMANTIC', 'Clock moved backwards');
      invariant(canReleaseBlob(row.attempt, at), 'E_OWNER', 'Blob is still needed by an active download');
      row.attempt.resourceReleasedAt ??= iso(at);
      await saveAttempt(tx, row, iso(at));
      return copy(row.attempt);
    });
  }

  async function retryExport(request, sender, { blobUrls } = {}) {
    validate('RetryExportRequest', request);
    const old = await transaction('readonly', async tx => ({ job: await tx.get('exportJobs', request.exportJobId), intent: await tx.get('commandJournal', intentKey(request.exportJobId)) }));
    invariant(old.job && old.intent, 'E_SCHEMA', 'Original export is missing');
    const auth = await authenticate(sender, old.intent);
    const requestCanonical = canonical(request);
    const requestKey = key('export-request', request.requestId);
    const prior = await transaction('readonly', tx => tx.get('commandJournal', requestKey));
    if (prior) {
      invariant(prior.requestCanonical === requestCanonical, 'E_REVISION', 'Retry request ID conflict');
      return transaction('readonly', async tx => {
        await liveRun(tx, old.job.runId);
        const job = await tx.get('exportJobs', prior.exportJobId);
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
      const storedIntent = await tx.get('commandJournal', intentKey(old.job.exportJobId));
      hostMatches(auth, storedIntent);
      const duplicate = await tx.get('commandJournal', requestKey);
      if (duplicate) {
        invariant(duplicate.requestCanonical === requestCanonical, 'E_REVISION', 'Retry request ID conflict');
        const job = await tx.get('exportJobs', duplicate.exportJobId);
        return { newExportJobId: job.exportJobId, attemptIds: [...job.activeAttemptIds] };
      }
      invariant((await tx.get('exportJobs', old.job.exportJobId)).state !== 'abandoned', 'E_OWNER', 'Abandoned export cannot be retried');
      const result = await storeVolumes(tx, newIntent, built);
      await tx.put('commandJournal', { ...storedIntent, frozen: true }, intentKey(old.job.exportJobId));
      await tx.put('commandJournal', newIntent, intentKey(newExportJobId));
      const oldPin = await tx.get('commandJournal', pinKey(old.job.exportJobId));
      await tx.put('commandJournal', { tag: 'reader-pin', readerPinId: pinId(newExportJobId), runId: newIntent.runId,
        sealWatermark: newIntent.sealWatermark, committedCount: newIntent.committedCount, committedPages: oldPin?.committedPages ?? 0,
        exportJobId: newExportJobId, released: false, createdAt: Date.parse(newIntent.preparedAt) }, pinKey(newExportJobId));
      await tx.put('commandJournal', { tag: 'export-request', requestCanonical, exportJobId: newExportJobId }, requestKey);
      return { newExportJobId, attemptIds: result.job.activeAttemptIds };
    });
  }

  async function abandonJob(tx, job, at, wholeJob) {
    if (wholeJob) job.state = 'abandoned';
    await tx.put('exportJobs', job, job.exportJobId);
    const intent = await tx.get('commandJournal', intentKey(job.exportJobId));
    if (intent) await tx.put('commandJournal', { ...intent, frozen: true }, intentKey(job.exportJobId));
    for (const id of job.activeAttemptIds) {
      const row = await tx.get('downloadReceipts', key('attempt', id));
      if (!row || terminal(row.attempt.state)) continue;
      row.attempt.state = 'abandoned';
      await saveAttempt(tx, row, at);
    }
    const pin = await tx.get('commandJournal', pinKey(job.exportJobId));
    if (pin) await tx.put('commandJournal', { ...pin, released: true, releasedAt: Date.parse(at) }, pinKey(job.exportJobId));
  }

  async function abandonExport(request, sender) {
    exact(request, ['exportJobId', 'explicitUserAction']);
    const { exportJobId, explicitUserAction } = request;
    invariant(explicitUserAction === true, 'E_OWNER', 'Explicit abandon action required');
    const intent = await transaction('readonly', tx => tx.get('commandJournal', intentKey(exportJobId)));
    invariant(intent, 'E_SCHEMA', 'Export intent is missing');
    const auth = await authenticate(sender, intent);
    const at = iso(now());
    return transaction('readwrite', async tx => {
      hostMatches(auth, await tx.get('commandJournal', intentKey(exportJobId)));
      await liveRun(tx, intent.runId);
      const job = await tx.get('exportJobs', exportJobId);
      invariant(job, 'E_SCHEMA', 'Export job is missing');
      await abandonJob(tx, job, at, true);
      return copy(await tx.get('exportJobs', exportJobId));
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
      invariant(run?.tombstoned || await tx.get('commandJournal', key('tombstone', runId)) ||
        (run?.retirementState === 'released' && ['completed', 'limit_reached', 'stopped', 'failed', 'interrupted', 'abandoned_unknown'].includes(run.state) && slot?.currentRunId !== runId), 'E_OWNER', 'Deletion fence is required');
      for (const job of await tx.all('exportJobs')) if (job.runId === runId) await abandonJob(tx, job, at, true);
      for (const record of await tx.all('commandJournal')) if (record.tag === 'export-intent' && record.runId === runId) {
        await tx.put('commandJournal', { ...record, frozen: true }, intentKey(record.exportJobId));
        const pin = await tx.get('commandJournal', pinKey(record.exportJobId));
        if (pin) await tx.put('commandJournal', { ...pin, released: true, releasedAt: Date.parse(at) }, pinKey(record.exportJobId));
      }
      return { runId, abandoned: true };
    });
  }

  async function drain() {
    while (pending.size) await Promise.allSettled([...pending]);
    if (failures.length) throw failures.shift();
  }

  return Object.freeze({ prepareExport, prepareAttempts, readArtifact, dispatchDownload, reconcileDownload,
    reconcilePending, recordResourceRelease, retryExport, abandonExport, abandonRun, handleCreated, handleChanged, attach, drain });
}
