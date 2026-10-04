import {FoundationError, invariant} from '../protocol.js';

// Sparse indexes deliberately do not index tagged metadata rows.
export const STORE_SCHEMA = Object.freeze({
  templates: {templateRevision: [['template.templateId', 'template.revision'], true], contentHash: ['template.contentHash', false]},
  runs: {runId: ['runId', true], slotKey: ['slotKey', true], retirementId: ['retirementId', false], state: ['state', false]},
  commandJournal: {commandId: ['commandId', true], runId: ['identity.runId', false], runOwnerState: [['identity.runId', 'identity.ownerEpoch', 'state'], false]},
  pageSnapshots: {snapshotId: ['snapshotId', true], runSealSeq: [['runId', 'sealSeq'], false], runPageSequence: [['runId', 'pageSequence'], true], readCommandId: ['readCommandId', false]},
  records: {snapshotRow: [['snapshotId', 'rowIndex'], true], runId: ['runId', false]},
  batches: {batchId: ['batchId', true], snapshotBatch: [['snapshotId', 'batchIndex'], true]},
  exportJobs: {exportJobId: ['exportJobId', true], runId: ['runId', false]},
  artifacts: {artifactId: ['artifact.artifactId', true], exportJobId: ['artifact.exportJobId', false]},
  // Only a bound attempt has attempt.downloadId. Receipts/candidates may share
  // downloadId without making the unique attempt binding index conflict.
  downloadReceipts: {downloadId: ['attempt.downloadId', true], fullBlobUrl: ['fullBlobUrl', false]},
  entitlements: {subject: ['subject', true]}
});
export const STORE_NAMES = Object.freeze(Object.keys(STORE_SCHEMA));

export function storageError(error) {
  if (error instanceof FoundationError) return error;
  const failure = new FoundationError(error?.name === 'QuotaExceededError' ? 'E_QUOTA' : 'E_SCHEMA',
    error?.name === 'QuotaExceededError' ? 'Storage quota exceeded' : 'IndexedDB operation failed');
  failure.cause = error;
  return failure;
}

function installSchema(db, upgrade) {
  invariant(db.version === 1, 'E_VERSION', 'No reviewed migration exists for this database version');
  for (const [name, indexes] of Object.entries(STORE_SCHEMA)) {
    const store = db.objectStoreNames.contains(name) ? upgrade.objectStore(name) : db.createObjectStore(name);
    invariant(store.keyPath === null && !store.autoIncrement, 'E_VERSION', 'Storage requires explicit keys');
    for (const [indexName, [keyPath, unique]] of Object.entries(indexes)) {
      if (store.indexNames.contains(indexName)) {
        const index = store.index(indexName);
        invariant(JSON.stringify(index.keyPath) === JSON.stringify(keyPath) && index.unique === unique && !index.multiEntry,
          'E_VERSION', 'Incompatible storage index');
      } else store.createIndex(indexName, keyPath, {unique});
    }
  }
}

function openRequest(factory, name, version, install) {
  return new Promise((resolve, reject) => {
    let request, failure, settled = false, previousVersion = 0;
    try { request = version === undefined ? factory.open(name) : factory.open(name, version); }
    catch (error) { reject(error); return; }
    request.onupgradeneeded = event => {
      previousVersion = event.oldVersion;
      try {
        invariant(install, 'E_VERSION', 'Cannot create a recovery database');
        installSchema(request.result, request.transaction);
      } catch (error) { failure = error; request.transaction.abort(); }
    };
    request.onblocked = () => {
      settled = true;
      const error = new FoundationError('E_VERSION', 'Storage upgrade blocked by another connection');
      error.blocked = true;
      reject(error);
    };
    request.onerror = () => {
      if (settled) return;
      settled = true;
      const error = failure || request.error || new FoundationError('E_VERSION', 'Storage upgrade failed');
      error.previousVersion = previousVersion;
      reject(error);
    };
    request.onsuccess = () => {
      if (settled) { request.result.close(); return; }
      settled = true;
      resolve(request.result);
    };
  });
}

export async function openConnection(factory, name, version) {
  try { return {db: await openRequest(factory, name, version, true), readOnly: false, migrationError: null}; }
  catch (error) {
    // An aborted versionchange rolls back stores, indexes, data and version.
    // Never delete/recreate on failure. Recover at the *existing* version.
    if (!error.blocked && (error.previousVersion > 0 || error.name === 'VersionError')) {
      const db = await openRequest(factory, name, undefined, false);
      return {db, readOnly: true, migrationError: {code: 'E_VERSION', message: 'Upgrade failed; previous database preserved read-only'}};
    }
    throw error instanceof FoundationError ? error : new FoundationError('E_VERSION', 'Storage could not be opened');
  }
}

// Work may await SHA-256. Merely keeping one request pending is insufficient:
// a transaction can be inactive in the task that resolves that digest. Queue
// every operation and issue it inside the keepalive request's success event.
export function transact(db, stores, mode, work, {raw = false} = {}) {
  return new Promise((resolve, reject) => {
    let native, result, failure, workDone = false, ended = false;
    const queue = [];
    try { native = db.transaction(stores, mode); } catch (error) { reject(storageError(error)); return; }
    const enqueue = action => new Promise((yes, no) => {
      if (ended || workDone) { no(new FoundationError('E_SCHEMA', 'Transaction already finished')); return; }
      queue.push({action, yes, no});
    });
    const object = store => {
      invariant(stores.includes(store), 'E_SCHEMA', 'Store outside transaction scope');
      return native.objectStore(store);
    };
    const keyRequired = key => invariant(key !== undefined && key !== null, 'E_SCHEMA', 'Explicit key required');
    const api = Object.freeze({
      get: (store, key) => enqueue(() => { keyRequired(key); return object(store).get(key); }),
      put: (store, value, key) => enqueue(() => { keyRequired(key); return object(store).put(value, key); }),
      delete: (store, key) => enqueue(() => { keyRequired(key); return object(store).delete(key); }),
      all: store => enqueue(() => object(store).getAll())
    });
    const abort = error => {
      failure ||= error;
      try { native.abort(); } catch { /* oncomplete/onabort settles the result */ }
    };
    const finish = error => {
      ended = true;
      for (const item of queue.splice(0)) item.no(error || new FoundationError('E_SCHEMA', 'Transaction finished'));
      if (error) reject(error); else resolve(result);
    };
    native.onabort = () => finish(storageError(failure || native.error));
    native.onerror = () => { failure ||= native.error; };
    native.oncomplete = () => finish(workDone ? failure : new FoundationError('E_SCHEMA', 'Transaction completed before work'));
    const pump = () => {
      if (ended) return;
      for (const item of queue.splice(0)) {
        try {
          const request = item.action();
          request.onsuccess = () => item.yes(request.result);
          request.onerror = () => { const error = request.error; item.no(storageError(error)); abort(error); };
        } catch (error) { item.no(storageError(error)); abort(error); return; }
      }
      if (!workDone) {
        try {
          const request = native.objectStore(stores[0]).get('@storage-keepalive');
          request.onsuccess = pump;
          request.onerror = () => abort(request.error);
        } catch (error) { abort(error); }
      }
    };
    if (raw) {
      // Consistent backup retains original explicit keys, including unknown
      // pre-migration records, without exposing extra transaction API methods.
      Promise.all(stores.map(store => new Promise((yes, no) => {
        const rows = [], request = native.objectStore(store).openCursor();
        request.onerror = () => no(request.error);
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) { yes({name: store, records: rows}); return; }
          rows.push({key: cursor.primaryKey, value: cursor.value});
          cursor.continue();
        };
      }))).then(value => { result = value; workDone = true; }, abort);
    } else {
      pump();
      Promise.resolve().then(() => work(api)).then(value => { result = value; workDone = true; }, abort);
    }
  });
}
