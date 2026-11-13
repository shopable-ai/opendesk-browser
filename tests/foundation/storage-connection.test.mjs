import test from 'node:test';
import assert from 'node:assert/strict';
import {createStorage} from '../../src/platform/storage/index.js';
import {STORE_SCHEMA, storageError} from '../../src/platform/storage/idb.js';

// Connection/transaction boundary double. Native IndexedDB is checked separately;
// this exercises forced close, concurrent reopen and failed-work replay fences.
function engine() {
  const names = Object.keys(STORE_SCHEMA);
  const list = values => Object.assign([...values], {contains: name => values.includes(name)});
  let rows = Object.fromEntries(names.map(name => [name, new Map()]));
  const connections = [], opens = [];
  let missing = false, version = 2, badSchema = false, duringValidation;
  const factory = {open(name, requestedVersion) {
    opens.push({name, requestedVersion});
    const request = {};
    setImmediate(() => {
      if (missing) {
        request.transaction = {abort() {
          request.error = new DOMException('Missing database', 'AbortError');
          setImmediate(() => request.onerror?.());
        }};
        request.result = {version: 1};
        request.onupgradeneeded?.({oldVersion: 0});
        return;
      }
      const db = {
        name, version, closed: false, silentClose: false, objectStoreNames: list(names),
        close() { this.closed = true; },
        forceClose() { this.close(); this.onclose?.(); },
        transaction(scope, mode, options) {
          if (this.closed || this.silentClose) throw new DOMException('Connection closed', 'InvalidStateError');
          if (duringValidation) {
            const observe = duringValidation; duringValidation = null;
            setImmediate(() => observe(db));
          }
          const draft = structuredClone(rows);
          let pending = 0, ended = false;
          const native = {
            durability: options?.durability ?? 'default',
            abort() { if (!ended) { ended = true; setImmediate(() => native.onabort?.()); } },
            objectStore(store) {
              assert.ok(scope.includes(store));
              return {
                keyPath: null, autoIncrement: false,
                indexNames: list(badSchema ? [] : Object.keys(STORE_SCHEMA[store])),
                index(name) {
                  const [keyPath, unique] = STORE_SCHEMA[store][name];
                  return {keyPath, unique, multiEntry: false};
                },
                get: key => read(() => draft[store].get(key)),
                put(value, key) { return read(() => { draft[store].set(key, structuredClone(value)); return key; }); },
                openCursor() {
                  const entries = [...draft[store]], request = {};
                  let index = 0;
                  const next = () => {
                    const row = entries[index++];
                    return row ? {primaryKey: row[0], value: row[1], continue() { schedule(request, next); }} : null;
                  };
                  schedule(request, next); return request;
                }
              };
            }
          };
          function complete() {
            if (!pending && !ended) {
              ended = true;
              if (mode === 'readwrite') rows = draft;
              native.oncomplete?.();
            }
          }
          function schedule(request, value) {
            pending++;
            setImmediate(() => {
              pending--;
              if (ended) return;
              request.result = value(); request.onsuccess?.();
              setImmediate(complete);
            });
          }
          function read(value) { const request = {}; schedule(request, value); return request; }
          setImmediate(complete);
          return native;
        }
      };
      connections.push(db); request.result = db; request.onsuccess?.();
    });
    return request;
  }};
  return {factory, connections, opens,
    get current() { return connections.at(-1); },
    remove() { missing = true; },
    upgrade() { version++; },
    duringValidation(observe) { duringValidation = observe; },
    breakSchema() { badSchema = true; }
  };
}
const open = e => createStorage({indexedDB: e.factory, name: 'installation-connection'});
const read = storage => storage.transaction(['frameworkKV'], 'readonly', tx => tx.get('frameworkKV', 'install'));

test('forced close reopens once for concurrent calls, preserving installed data and service owner', async () => {
  const e = engine(), storage = await open(e);
  await storage.transaction(['frameworkKV'], 'readwrite', tx => tx.put('frameworkKV', {generation: 7}, 'install'));
  e.current.forceClose();
  assert.equal(await open(e), storage);
  assert.deepEqual(await Promise.all([read(storage), read(storage)]), [{generation: 7}, {generation: 7}]);
  assert.equal(e.opens.length, 3); // Initial probe/open, then one existing-only reopen.
  assert.equal(e.opens.at(-1).requestedVersion, undefined);
  assert.equal(storage.readOnly, false);
  storage.close();
});

test('an aborted installation is rejected once; only a later explicit call can write', async () => {
  const e = engine(), storage = await open(e);
  let executions = 0;
  const cause = new DOMException('Interrupted write', 'AbortError');
  await assert.rejects(storage.transaction(['frameworkKV'], 'readwrite', async tx => {
    executions++;
    await tx.put('frameworkKV', {generation: 8}, 'install');
    e.current.forceClose();
    throw cause;
  }), error => error.cause === cause);
  assert.equal(executions, 1);
  assert.equal(await read(storage), undefined);
  await storage.transaction(['frameworkKV'], 'readwrite', async tx => {
    executions++;
    await tx.put('frameworkKV', {generation: 9}, 'install');
  });
  assert.equal(executions, 2);
  assert.deepEqual(await read(storage), {generation: 9});
  storage.close();
});

test('silent native close rejects the current request without work, then reconnects on the next request', async () => {
  const e = engine(), storage = await open(e);
  e.current.silentClose = true;
  let executions = 0;
  await assert.rejects(storage.transaction(['frameworkKV'], 'readwrite', () => { executions++; }),
    error => error.cause?.name === 'InvalidStateError');
  assert.equal(executions, 0);
  assert.equal(e.opens.length, 2);
  assert.equal(await read(storage), undefined);
  assert.equal(e.opens.length, 3);
  storage.close();
});

test('manual close and versionchange retire the service without reopening', async () => {
  for (const retire of [(storage) => storage.close(), (_storage, db) => db.onversionchange()]) {
    const e = engine(), storage = await open(e);
    retire(storage, e.current);
    assert.throws(() => read(storage), {code: 'E_VERSION'});
    assert.equal(e.opens.length, 2);
    assert.equal(e.current.closed, true);
  }
});

test('late close/versionchange from an old connection cannot retire its replacement', async () => {
  const e = engine(), storage = await open(e), old = e.current;
  old.forceClose();
  await read(storage);
  old.onclose(); old.onversionchange();
  await read(storage);
  assert.equal(e.opens.length, 3);
  assert.equal(e.current.closed, false);
  storage.close();
});

test('read-only recovery reconnects without gaining write access', async () => {
  const e = engine(), storage = await createStorage({indexedDB: e.factory, name: 'readonly-install', readOnly: true});
  e.current.forceClose();
  assert.equal(await read(storage), undefined);
  assert.throws(() => storage.transaction(['frameworkKV'], 'readwrite', () => assert.fail('write ran')), {code: 'E_VERSION'});
  assert.equal(storage.readOnly, true);
  storage.close();
});

test('close during reconnect cannot resurrect the retired service', async () => {
  const e = engine(), storage = await open(e);
  e.current.forceClose();
  const pending = read(storage);
  storage.close();
  await assert.rejects(pending, {code: 'E_VERSION'});
  assert.equal(e.current.closed, true);
  assert.throws(() => read(storage), {code: 'E_VERSION'});
});

test('versionchange during reconnect validation permanently retires the service before any write', async () => {
  const e = engine(), storage = await open(e);
  e.current.forceClose();
  e.duringValidation(db => {
    assert.equal(typeof db.onversionchange, 'function');
    db.onversionchange();
  });
  let executions = 0;
  await assert.rejects(storage.transaction(['frameworkKV'], 'readwrite', () => { executions++; }), {code: 'E_VERSION'});
  assert.equal(executions, 0);
  assert.equal(e.current.closed, true);
  assert.throws(() => read(storage), {code: 'E_VERSION'});
  assert.equal(e.opens.length, 3);
});

test('forced close during validation rejects without work, allowing only a later call to reconnect', async () => {
  const e = engine(), storage = await open(e);
  e.current.forceClose();
  e.duringValidation(db => db.forceClose());
  let executions = 0;
  await assert.rejects(storage.transaction(['frameworkKV'], 'readwrite', () => { executions++; }), {code: 'E_VERSION'});
  assert.equal(executions, 0);
  assert.equal(await read(storage), undefined);
  assert.equal(e.opens.length, 4);
  storage.close();
});

test('close before a pending backup starts retires the backup as well', async () => {
  const e = engine(), storage = await open(e);
  const backup = storage.rawBackup();
  storage.close();
  await assert.rejects(backup, {code: 'E_VERSION'});
});

test('reconnect refuses missing, upgraded or incompatible databases before installation work', async () => {
  for (const change of [e => e.remove(), e => e.upgrade(), e => e.breakSchema()]) {
    const e = engine(), storage = await open(e);
    e.current.forceClose(); change(e);
    let executions = 0;
    await assert.rejects(storage.transaction(['frameworkKV'], 'readwrite', () => { executions++; }), {code: 'E_VERSION'});
    assert.equal(executions, 0);
    assert.equal(e.opens.at(-1).requestedVersion, undefined);
    storage.close();
  }
});

test('raw backup can reconnect, while storage errors retain native type and quota classification', async () => {
  const e = engine(), storage = await open(e);
  await storage.transaction(['frameworkKV'], 'readwrite', tx => tx.put('frameworkKV', {generation: 7}, 'install'));
  e.current.forceClose();
  const backup = await storage.rawBackup();
  assert.deepEqual(backup.stores.find(row => row.name === 'frameworkKV').records,
    [{key: 'install', value: {generation: 7}}]);
  const quota = storageError(new DOMException('Disk full', 'QuotaExceededError'));
  assert.equal(quota.code, 'E_QUOTA');
  const closed = storageError(new DOMException('Connection closed', 'InvalidStateError'));
  assert.match(closed.message, /InvalidStateError/);
  storage.close();
});
