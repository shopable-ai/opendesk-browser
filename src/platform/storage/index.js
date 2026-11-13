import {invariant} from '../protocol.js';
import {captureBackup, openConnection, reopenConnection, STORE_NAMES, transact} from './idb.js';
import {createStorageMethods} from './repository.js';

export {STORE_NAMES, STORE_SCHEMA, V1_STORE_NAMES, V1_STORE_SCHEMA, decodeRawBackup} from './idb.js';
export {STORAGE_KEYS} from './repository.js';

const connections = new WeakMap();

export async function createStorage({indexedDB = globalThis.indexedDB, name = 'opendesk-browser', version = 2, readOnly = false,
  clock = {now: () => Date.now()}, admission, admitTemplate, sessionTyped} = {}) {
  invariant(indexedDB && typeof indexedDB.open === 'function', 'E_SCHEMA', 'IndexedDB unavailable');
  invariant(typeof name === 'string' && name.length > 0 && [1, 2].includes(version) && typeof readOnly === 'boolean', 'E_VERSION', 'Invalid database identity');
  invariant(typeof clock.now === 'function', 'E_SCHEMA', 'clock.now required');
  let registry = connections.get(indexedDB);
  if (!registry) { registry = new Map(); connections.set(indexedDB, registry); }
  const existing = registry.get(name);
  if (existing) {
    invariant(existing.version === version && existing.readOnly === readOnly && existing.admission === admission && existing.admitTemplate === admitTemplate && existing.sessionTyped === sessionTyped, 'E_VERSION', 'Database already owned with different configuration');
    return existing.promise;
  }
  const owner = {version, readOnly, admission, admitTemplate, sessionTyped};
  registry.set(name, owner);
  owner.promise = (async () => {
    const opened = await openConnection(indexedDB, name, version, {readOnly});
    const {readOnly: effectiveReadOnly, migrationError, migrationBackup} = opened;
    const databaseVersion = opened.db.version;
    let db = opened.db, closed = false, reconnecting;
    const close = () => { if (!closed) { closed = true; db?.close(); db = null; if (registry.get(name) === owner) registry.delete(name); } };
    const watch = connection => {
      // An intentional close/schema change retires this service permanently.
      connection.onversionchange = () => { if (db === connection) close(); };
      // Chrome can forcibly close a connection after a storage error. Keep the
      // service/Authority owner, but open a fresh connection for the next call.
      connection.onclose = () => { if (db === connection) db = null; };
    };
    watch(db);
    const connected = () => {
      invariant(!closed, 'E_VERSION', 'Storage connection closed');
      if (db) return Promise.resolve(db);
      if (!reconnecting) reconnecting = reopenConnection(indexedDB, name, databaseVersion, {onVersionChange: close}).then(connection => {
        if (closed) { connection.close(); invariant(false, 'E_VERSION', 'Storage connection closed'); }
        db = connection; watch(connection); return connection;
      }).finally(() => { reconnecting = null; });
      return reconnecting;
    };
    const service = {
      name, version: databaseVersion, readOnly: effectiveReadOnly, migrationError, migrationBackup,
      // Version 2 keeps its existing stores; cursor access is an additive
      // transaction API, not a new Run/Result database or schema migration.
      nativeCursorPaging: databaseVersion === 2,
      close,
      transaction(stores, mode, work) {
        invariant(!closed, 'E_VERSION', 'Storage connection closed');
        invariant(Array.isArray(stores) && stores.length > 0 && new Set(stores).size === stores.length, 'E_SCHEMA', 'Invalid transaction stores');
        invariant(mode === 'readonly' || mode === 'readwrite', 'E_SCHEMA', 'Invalid transaction mode');
        invariant(!effectiveReadOnly || mode === 'readonly', 'E_VERSION', 'Recovery database is read-only; preserve backup before migration');
        invariant(typeof work === 'function', 'E_SCHEMA', 'Transaction callback required');
        return connected().then(connection => {
          invariant(!closed, 'E_VERSION', 'Storage connection closed');
          invariant(stores.every(s => connection.objectStoreNames.contains(s)), 'E_SCHEMA', 'Invalid transaction stores');
          return transact(connection, stores, mode, work).catch(error => {
            if (error.storageConnectionClosed && db === connection) { connection.close(); db = null; }
            // Never replay a failed transaction, especially an installation.
            throw error;
          });
        });
      },
      async rawBackup() {
        const connection = await connected();
        invariant(!closed, 'E_VERSION', 'Storage connection closed');
        return captureBackup(connection, {readOnly: effectiveReadOnly});
      }
    };
    return Object.freeze(Object.assign(service, createStorageMethods(service, {clock, admission, admitTemplate, sessionTyped})));
  })();
  try { return await owner.promise; } catch (error) { if (registry.get(name) === owner) registry.delete(name); throw error; }
}
