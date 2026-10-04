import {invariant} from '../protocol.js';
import {openConnection, STORE_NAMES, transact} from './idb.js';
import {createStorageMethods} from './repository.js';

export {STORE_NAMES, STORE_SCHEMA} from './idb.js';
export {STORAGE_KEYS} from './repository.js';

const connections = new WeakMap();

export async function createStorage({indexedDB = globalThis.indexedDB, name = 'opendesk-browser', version = 1,
  clock = {now: () => Date.now()}, admission, admitTemplate} = {}) {
  invariant(indexedDB && typeof indexedDB.open === 'function', 'E_SCHEMA', 'IndexedDB unavailable');
  invariant(typeof name === 'string' && name.length > 0 && Number.isSafeInteger(version) && version > 0, 'E_VERSION', 'Invalid database identity');
  invariant(typeof clock.now === 'function', 'E_SCHEMA', 'clock.now required');
  let registry = connections.get(indexedDB);
  if (!registry) { registry = new Map(); connections.set(indexedDB, registry); }
  const existing = registry.get(name);
  if (existing) {
    invariant(existing.version === version && existing.admission === admission && existing.admitTemplate === admitTemplate, 'E_VERSION', 'Database already owned with different configuration');
    return existing.promise;
  }
  const owner = {version, admission, admitTemplate};
  registry.set(name, owner);
  owner.promise = (async () => {
    const {db, readOnly, migrationError} = await openConnection(indexedDB, name, version);
    let closed = false;
    const close = () => { if (!closed) { closed = true; db.close(); if (registry.get(name) === owner) registry.delete(name); } };
    db.onversionchange = close;
    db.onclose = close;
    const service = {
      name, version: db.version, readOnly, migrationError,
      close,
      transaction(stores, mode, work) {
        invariant(!closed, 'E_VERSION', 'Storage connection closed');
        invariant(Array.isArray(stores) && stores.length > 0 && new Set(stores).size === stores.length && stores.every(s => db.objectStoreNames.contains(s)), 'E_SCHEMA', 'Invalid transaction stores');
        invariant(mode === 'readonly' || mode === 'readwrite', 'E_SCHEMA', 'Invalid transaction mode');
        invariant(!readOnly || mode === 'readonly', 'E_VERSION', 'Recovery database is read-only; preserve backup before migration');
        invariant(typeof work === 'function', 'E_SCHEMA', 'Transaction callback required');
        return transact(db, stores, mode, work);
      },
      async rawBackup() {
        invariant(!closed, 'E_VERSION', 'Storage connection closed');
        const stores = Array.from(db.objectStoreNames);
        return {name, version: db.version, readOnly, stores: stores.length ? await transact(db, stores, 'readonly', null, {raw: true}) : []};
      }
    };
    return Object.freeze(Object.assign(service, createStorageMethods(service, {clock, admission, admitTemplate})));
  })();
  try { return await owner.promise; } catch (error) { if (registry.get(name) === owner) registry.delete(name); throw error; }
}
