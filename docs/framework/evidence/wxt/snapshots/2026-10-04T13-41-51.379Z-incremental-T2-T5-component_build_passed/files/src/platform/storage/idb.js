import {FoundationError, invariant} from '../protocol.js';

// Sparse indexes deliberately do not index tagged metadata rows.
export const V1_STORE_SCHEMA = Object.freeze({
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
export const V1_STORE_NAMES = Object.freeze(Object.keys(V1_STORE_SCHEMA));
export const STORE_SCHEMA = Object.freeze({...V1_STORE_SCHEMA,
  commandJournal: {...V1_STORE_SCHEMA.commandJournal, commandId: [['identity.runId', 'commandId'], true]},
  scriptHeads: {}, scriptRevisions: {}, results: {}, frameworkKV: {}});
export const STORE_NAMES = Object.freeze(Object.keys(STORE_SCHEMA));

export function storageError(error) {
  if (error instanceof FoundationError) return error;
  const failure = new FoundationError(error?.name === 'QuotaExceededError' ? 'E_QUOTA' : 'E_SCHEMA',
    error?.name === 'QuotaExceededError' ? 'Storage quota exceeded' : 'IndexedDB operation failed');
  failure.cause = error;
  return failure;
}

function installSchema(db, upgrade, oldVersion) {
  invariant(db.version === 1 || db.version === 2, 'E_VERSION', 'No reviewed migration exists for this database version');
  const schema = db.version === 1 ? V1_STORE_SCHEMA : STORE_SCHEMA;
  if (oldVersion === 1 && db.version === 2) {
    const journal = upgrade.objectStore('commandJournal');
    invariant(journal.indexNames.contains('commandId'), 'E_VERSION', 'Missing legacy command index');
    const index = journal.index('commandId');
    invariant(index.keyPath === 'commandId' && index.unique && !index.multiEntry, 'E_VERSION', 'Incompatible legacy command index');
    journal.deleteIndex('commandId');
  }
  for (const [name, indexes] of Object.entries(schema)) {
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

async function validateOpenedSchema(db) {
  const schema = db.version === 1 ? V1_STORE_SCHEMA : STORE_SCHEMA;
  const tx = db.transaction(Object.keys(schema), 'readonly');
  const finished = new Promise((resolve, reject) => {tx.oncomplete = resolve; tx.onabort = () => reject(tx.error);});
  let failure;
  try {
    for (const [name, indexes] of Object.entries(schema)) {
      const store = tx.objectStore(name);
      invariant(store.keyPath === null && !store.autoIncrement, 'E_VERSION', 'Storage requires explicit keys');
      for (const [name, [keyPath, unique]] of Object.entries(indexes)) {
        invariant(store.indexNames.contains(name), 'E_VERSION', 'Storage index missing');
        const index = store.index(name);
        invariant(JSON.stringify(index.keyPath) === JSON.stringify(keyPath) && index.unique === unique && !index.multiEntry,
          'E_VERSION', 'Incompatible storage index');
      }
    }
  } catch (error) {failure = error;}
  await finished;
  if (failure) throw failure;
}

// A reversible representation for native keys and the stored JSON contract.
// Unsupported structured-clone values fail closed before migration, never drop.
function encode(value, key = false, seen = new Set()) {
  if (value === null) { invariant(!key, 'E_VERSION', 'Invalid backup key'); return {type: 'null'}; }
  if (value === undefined) { invariant(!key, 'E_VERSION', 'Invalid backup key'); return {type: 'undefined'}; }
  if (typeof value === 'string' || typeof value === 'boolean') {
    invariant(!key || typeof value === 'string', 'E_VERSION', 'Invalid backup key');
    return {type: typeof value, value};
  }
  if (typeof value === 'number') {
    invariant(!key || !Number.isNaN(value), 'E_VERSION', 'Invalid backup key');
    return {type: 'number', value: Object.is(value, -0) ? '-0' : String(value)};
  }
  if (value instanceof Date) {
    invariant(Number.isFinite(value.getTime()), 'E_VERSION', 'Invalid backup date');
    return {type: 'date', value: value.getTime()};
  }
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
    const bytes = value instanceof ArrayBuffer ? new Uint8Array(value) : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    invariant(key || value instanceof ArrayBuffer, 'E_VERSION', 'Unsupported backup value view');
    return {type: 'binary', value: Array.from(bytes)};
  }
  invariant(typeof value === 'object' && !seen.has(value), 'E_VERSION', 'Unsupported or cyclic backup value');
  seen.add(value);
  let result;
  if (Array.isArray(value)) {
    invariant(Object.keys(value).length === value.length && Array.from({length: value.length}, (_, i) => Object.hasOwn(value, i)).every(Boolean),
      'E_VERSION', 'Unsupported sparse backup array');
    result = {type: 'array', value: value.map(item => encode(item, key, seen))};
  } else {
    invariant(!key && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null), 'E_VERSION', 'Unsupported backup value');
    result = {type: 'object', value: Object.keys(value).sort().map(name => [name, encode(value[name], false, seen)])};
  }
  seen.delete(value);
  return result;
}

function decode(node) {
  switch (node.type) {
    case 'null': return null;
    case 'undefined': return undefined;
    case 'number': return Number(node.value);
    case 'string': case 'boolean': return node.value;
    case 'date': return new Date(node.value);
    case 'binary': return new Uint8Array(node.value).buffer;
    case 'array': return node.value.map(decode);
    case 'object': return Object.fromEntries(node.value.map(([key, value]) => [key, decode(value)]));
    default: throw new FoundationError('E_VERSION', 'Invalid backup encoding');
  }
}

function serializeBackup(backup) {
  return JSON.stringify({format: 'opendesk.raw-backup.v1', name: backup.name, version: backup.version,
    stores: backup.stores.map(store => ({name: store.name, records: store.records.map(row => ({key: encode(row.key, true), value: encode(row.value)}))}))});
}

export function decodeRawBackup(utf8) {
  const value = JSON.parse(utf8);
  invariant(value.format === 'opendesk.raw-backup.v1', 'E_VERSION', 'Unsupported backup format');
  return {name: value.name, version: value.version, stores: value.stores.map(store => ({name: store.name,
    records: store.records.map(row => ({key: decode(row.key), value: decode(row.value)}))}))};
}

export async function captureBackup(db, {readOnly = false} = {}) {
  const names = Array.from(db.objectStoreNames);
  const backup = {name: db.name, version: db.version, readOnly,
    stores: names.length ? await transact(db, names, 'readonly', null, {raw: true}) : []};
  const utf8 = serializeBackup(backup), bytes = new TextEncoder().encode(utf8);
  const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
  invariant(serializeBackup(decodeRawBackup(utf8)) === utf8, 'E_VERSION', 'Backup roundtrip failed');
  return {...backup, encoding: {format: 'opendesk.raw-backup.v1', utf8, byteLength: bytes.length, sha256}};
}

// Run the last check inside the exclusive upgrade transaction, before any schema
// mutation. No digest await is issued inside a native versionchange transaction.
function checkUpgradeBackup(db, transaction, previousVersion, backup, install, abort) {
  const names = Array.from(db.objectStoreNames), stores = [], pending = {count: names.length};
  const finish = () => {
    try {
      invariant(backup && backup.version === previousVersion && backup.name === db.name, 'E_VERSION', 'Missing migration backup');
      invariant(serializeBackup({name: db.name, version: previousVersion, stores}) === backup.encoding.utf8,
        'E_VERSION', 'Database changed after migration backup');
      install();
    } catch (error) {abort(error);}
  };
  if (!names.length) {finish(); return;}
  for (const name of names) {
    const records = [], request = transaction.objectStore(name).openCursor();
    stores.push({name, records});
    request.onerror = () => abort(request.error);
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {records.push({key: cursor.primaryKey, value: cursor.value}); cursor.continue();}
      else if (--pending.count === 0) finish();
    };
  }
}

function openRequest(factory, name, version, install, backup) {
  return new Promise((resolve, reject) => {
    let request, failure, settled = false, previousVersion = 0;
    try { request = version === undefined ? factory.open(name) : factory.open(name, version); }
    catch (error) { reject(error); return; }
    request.onupgradeneeded = event => {
      previousVersion = event.oldVersion;
      // A blocked request cannot be cancelled by IDBFactory. It may wake later;
      // reject/settle is permanent and this guard prevents a late installation.
      if (settled) { try { request.transaction.abort(); } catch {} return; }
      const abort = error => { failure ||= error; try { request.transaction.abort(); } catch {} };
      try {
        invariant(install, 'E_VERSION', 'Cannot create a recovery database');
        const apply = () => installSchema(request.result, request.transaction, previousVersion);
        if (previousVersion === 1 && request.result.version === 2) checkUpgradeBackup(request.result, request.transaction, previousVersion, backup, apply, abort);
        else apply();
      } catch (error) { abort(error); }
    };
    request.onblocked = () => {
      settled = true;
      const error = new FoundationError('E_VERSION', 'Storage upgrade blocked by another connection');
      error.blocked = true;
      error.migrationBackup = backup;
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

export async function openConnection(factory, name, version, {readOnly = false} = {}) {
  let migrationBackup, existing;
  try {
    if (readOnly) return {db: await openRequest(factory, name, undefined, false), readOnly: true, migrationError: null, migrationBackup: null};
    if (version === 2) {
      try {existing = await openRequest(factory, name, undefined, false);}
      catch (error) {if (error.previousVersion !== 0) throw error;}
      if (existing?.version === 1) {
        try {migrationBackup = await captureBackup(existing, {readOnly: true});}
        catch (error) {existing.close(); error.previousVersion = 1; throw error;}
        existing.close();
      } else if (existing) existing.close();
    }
    const db = await openRequest(factory, name, version, true, migrationBackup);
    try {await validateOpenedSchema(db);}
    catch (error) {error.previousVersion = db.version; db.close(); throw error;}
    return {db, readOnly: false, migrationError: null, migrationBackup: migrationBackup || null};
  }
  catch (error) {
    // An aborted versionchange rolls back stores, indexes, data and version.
    // Never delete/recreate on failure. Recover at the *existing* version.
    if (!error.blocked && (error.previousVersion > 0 || error.name === 'VersionError')) {
      const db = await openRequest(factory, name, undefined, false);
      return {db, readOnly: true, migrationError: {code: 'E_VERSION', message: 'Upgrade failed; previous database preserved read-only',
        cause: {name: error.name, code: error.code || null, message: error.message}}, migrationBackup: migrationBackup || null};
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
