import {invariant} from '../protocol.js';
import {captureBackup, openConnection, STORE_NAMES, transact} from './idb.js';
import {createStorageMethods} from './repository.js';

export {STORE_NAMES, STORE_SCHEMA, V1_STORE_NAMES, V1_STORE_SCHEMA, decodeRawBackup} from './idb.js';
export {STORAGE_KEYS} from './repository.js';

const connections = new WeakMap();

export async function createStorage({indexedDB = globalThis.indexedDB, name = 'opendesk-browser', version = 2, readOnly = false,
  clock = {now: () => Date.now()}, admission, admitTemplate} = {}) {
  invariant(indexedDB && typeof indexedDB.open === 'function', 'E_SCHEMA', 'IndexedDB unavailable');
  invariant(typeof name === 'string' && name.length > 0 && [1, 2].includes(version) && typeof readOnly === 'boolean', 'E_VERSION', 'Invalid database identity');
  invariant(typeof clock.now === 'function', 'E_SCHEMA', 'clock.now required');
  let registry = connections.get(indexedDB);
  if (!registry) { registry = new Map(); connections.set(indexedDB, registry); }
  const existing = registry.get(name);
  if (existing) {
    invariant(existing.version === version && existing.readOnly === readOnly && existing.admission === admission && existing.admitTemplate === admitTemplate, 'E_VERSION', 'Database already owned with different configuration');
    return existing.promise;
  }
  const owner = {version, readOnly, admission, admitTemplate};
  registry.set(name, owner);
  owner.promise = (async () => {
    const {db, readOnly: effectiveReadOnly, migrationError, migrationBackup} = await openConnection(indexedDB, name, version, {readOnly});
    let closed = false;
    const close = () => { if (!closed) { closed = true; db.close(); if (registry.get(name) === owner) registry.delete(name); } };
    db.onversionchange = close;
    db.onclose = close;
    const service = {
      name, version: db.version, readOnly: effectiveReadOnly, migrationError, migrationBackup,
      close,
      transaction(stores, mode, work) {
        invariant(!closed, 'E_VERSION', 'Storage connection closed');
        invariant(Array.isArray(stores) && stores.length > 0 && new Set(stores).size === stores.length && stores.every(s => db.objectStoreNames.contains(s)), 'E_SCHEMA', 'Invalid transaction stores');
        invariant(mode === 'readonly' || mode === 'readwrite', 'E_SCHEMA', 'Invalid transaction mode');
        invariant(!effectiveReadOnly || mode === 'readonly', 'E_VERSION', 'Recovery database is read-only; preserve backup before migration');
        invariant(typeof work === 'function', 'E_SCHEMA', 'Transaction callback required');
        return transact(db, stores, mode, work);
      },
      async rawBackup() {
        invariant(!closed, 'E_VERSION', 'Storage connection closed');
        return captureBackup(db, {readOnly: effectiveReadOnly});
      }
    };
    return Object.freeze(Object.assign(service, createStorageMethods(service, {clock, admission, admitTemplate})));
  })();
  try { return await owner.promise; } catch (error) { if (registry.get(name) === owner) registry.delete(name); throw error; }
}
