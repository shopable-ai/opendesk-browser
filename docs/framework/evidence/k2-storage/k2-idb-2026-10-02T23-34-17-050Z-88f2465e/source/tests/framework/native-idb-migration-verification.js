import {makeMigrationInputs} from './native-idb-migration-fixture.js';
import {createStorage, V1_STORE_NAMES, STORE_NAMES, STORE_SCHEMA, decodeRawBackup} from '/src/platform/storage/index.js';
import {commandKey} from '/src/platform/journal.js';
import {seedStorageFixture} from '/src/platform/storage/regression.js';

export async function runMigrationVerification({freshOnly = false} = {}) {
  const name = 'opendesk-browser', cases = [], events = [], connections = [], backups = {};
  const errorShape = e => ({name: e?.name, code: e?.code ?? null, message: e?.message, cause: e?.cause?.name});
  const originals = {open: IDBFactory.prototype.open, close: IDBDatabase.prototype.close};
  let fault = null, service, blocker;
  const push = (type, fields = {}) => events.push({type, at: performance.now(), ...fields});
  IDBFactory.prototype.open = function(...args) {
    const request = Reflect.apply(originals.open, this, args), id = events.length;
    push('open', {id, name: args[0], requestedVersion: args[1] ?? null});
    request.addEventListener('upgradeneeded', e => {
      const tx = request.transaction;
      push('upgradeneeded', {id, oldVersion: e.oldVersion, newVersion: e.newVersion, isTrusted: e.isTrusted});
      tx.addEventListener('abort', e => push('upgrade-abort', {id, isTrusted: e.isTrusted}));
      tx.addEventListener('complete', e => push('upgrade-complete', {id, isTrusted: e.isTrusted}));
      if (fault === 'native-upgrade-abort' && e.oldVersion === 1 && e.newVersion === 2) {
        request.result.createObjectStore('@k2-abort-marker');
        push('fault-injection', {id, action: 'native createObjectStore then actual versionchange transaction.abort', temporaryStores: Array.from(request.result.objectStoreNames)});
        tx.abort();
      }
    });
    request.addEventListener('blocked', e => push('blocked', {id, isTrusted: e.isTrusted}));
    request.addEventListener('error', e => push('open-error', {id, error: errorShape(request.error), isTrusted: e.isTrusted}));
    request.addEventListener('success', e => {
      connections.push({db: request.result, id, closed: false});
      push('open-success', {id, version: request.result.version, stores: Array.from(request.result.objectStoreNames), isTrusted: e.isTrusted});
    });
    return request;
  };
  IDBDatabase.prototype.close = function(...args) {
    const result = Reflect.apply(originals.close, this, args), c = connections.find(c => c.db === this);
    if (c) c.closed = true;
    push('close', {id: c?.id ?? null, version: this.version});
    return result;
  };
  const key = value => {
    if (value instanceof Date) return {type: 'date', epochMs: value.getTime(), iso: value.toISOString()};
    if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
      const bytes = value instanceof ArrayBuffer ? new Uint8Array(value) : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
      return {type: 'binary', nativeConstructor: value.constructor.name, bytes: Array.from(bytes)};
    }
    if (Array.isArray(value)) return {type: 'array', value: value.map(key)};
    return {type: typeof value, value};
  };
  const sorted = value => Array.isArray(value) ? value.map(sorted) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(k => [k, sorted(value[k])])) : value;
  const equal = (a, b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
  const view = backup => ({name: backup.name, version: backup.version,
    stores: backup.stores.map(store => ({name: store.name, records: store.records.map(row => ({primaryKey: key(row.key), value: row.value}))}))});
  const check = (id, expected, actual, pass) => {cases.push({id, expected, actual, pass: Boolean(pass)}); if (!pass) throw new Error(id);};
  const waitFor = async predicate => {const end = performance.now() + 3000; while (!predicate()) {if (performance.now() > end) throw new Error('native event wait exceeded 3s'); await new Promise(r => setTimeout(r, 10));}};
  const openNative = () => new Promise((yes, no) => {const r = indexedDB.open(name); r.onsuccess = () => yes(r.result); r.onerror = () => no(r.error);});
  const schemaOf = async () => {
    const db = await openNative(), tx = db.transaction(Array.from(db.objectStoreNames), 'readonly');
    const schema = Array.from(db.objectStoreNames, name => {
      const store = tx.objectStore(name); return {name, keyPath: store.keyPath, autoIncrement: store.autoIncrement,
        indexes: Array.from(store.indexNames, name => {const index = store.index(name); return {name, keyPath: index.keyPath, unique: index.unique, multiEntry: index.multiEntry};})};
    });
    await new Promise((yes, no) => {tx.oncomplete = yes; tx.onabort = () => no(tx.error);}); db.close(); return schema;
  };
  const readonlyDenial = async storage => {
    let entered = false, error;
    try {await storage.transaction(['records'], 'readwrite', tx => {entered = true; return tx.put('records', {bad: true}, '@forbidden');});} catch (e) {error = errorShape(e);}
    return {entered, error, refused: !entered && error?.code === 'E_VERSION'};
  };
  let result;
  try {
    check('K2-NATIVE-FRESH-IDENTITY', 'Fresh isolated HTTP origin with actual native factory and no databases',
      {origin: location.origin, databases: await indexedDB.databases(), open: Function.prototype.toString.call(originals.open)},
      indexedDB instanceof IDBFactory && (await indexedDB.databases()).length === 0);
    if (freshOnly) {
      service = await createStorage({indexedDB});
      const schema = await schemaOf();
      check('K2-NATIVE-FRESH-V2', 'Default same-name service creates v2 with fourteen explicit-key stores', {name: service.name, version: service.version, schema},
        service.name === name && service.version === 2 && !service.readOnly && schema.length === 14 && schema.every(s => s.keyPath === null && !s.autoIncrement));
      backups.fresh = await service.rawBackup();
      check('K2-NATIVE-FRESH-V2-BACKUP', 'Current v2 diagnostic backup is reversible and hashed', {hash: backups.fresh.encoding.sha256},
        equal(view(backups.fresh), view(decodeRawBackup(backups.fresh.encoding.utf8))));
      result = {cases, backups: Object.fromEntries(Object.entries(backups).map(([k, b]) => [k, {...view(b), encoding: b.encoding}])), schema, freshOnly};
    } else {
      const inputs = makeMigrationInputs(V1_STORE_NAMES);
      service = await createStorage({indexedDB, version: 1});
      await service.transaction(V1_STORE_NAMES, 'readwrite', async tx => {for (const row of inputs) await tx.put(row.store, row.value, row.key);});
      backups.before = await service.rawBackup();
      const beforeSchema = await schemaOf();
      const comparisons = inputs.map(input => {
        const row = backups.before.stores.find(s => s.name === input.store).records.find(r => indexedDB.cmp(r.key, input.key) === 0);
        return {store: input.store, inputId: input.inputId, inputKey: key(input.key), nativePrimaryKey: row && key(row.key), originalValue: input.value, actualValue: row?.value,
          nativeKeyEqual: Boolean(row), valueEqual: Boolean(row) && equal(row.value, input.value)};
      });
      check('K2-NATIVE-V1-TYPED-BACKUP', 'Original 80 unusual keys/JSON values and a verified reversible UTF8 hash', {comparisons, hash: backups.before.encoding.sha256},
        comparisons.every(row => row.nativeKeyEqual && row.valueEqual) && equal(view(backups.before), view(decodeRawBackup(backups.before.encoding.utf8))));
      service.close(); fault = 'native-upgrade-abort';
      const abortStart = events.length;
      service = await createStorage({indexedDB, version: 2}); fault = null;
      backups.afterAbort = await service.rawBackup();
      const denial = await readonlyDenial(service), abortSchema = await schemaOf();
      check('K2-NATIVE-UPGRADE-ABORT-READONLY', 'Real upgrade abort rolls back temporary store, version, indexes and all original data; recovery refuses writes',
        {version: service.version, readOnly: service.readOnly, migrationError: service.migrationError, denial, schema: abortSchema, events: events.slice(abortStart)},
        service.version === 1 && service.readOnly && denial.refused && equal(abortSchema, beforeSchema) &&
        backups.afterAbort.encoding.sha256 === backups.before.encoding.sha256 && service.migrationBackup.encoding.sha256 === backups.before.encoding.sha256 &&
        events.slice(abortStart).some(e => e.type === 'upgrade-abort' && e.isTrusted));
      service.close();
      blocker = await openNative(); blocker.onversionchange = e => push('blocker-kept-open', {oldVersion: e.oldVersion, newVersion: e.newVersion, isTrusted: e.isTrusted});
      const blockedStart = events.length; let blockedError;
      try {service = await createStorage({indexedDB, version: 2});} catch (e) {blockedError = {error: errorShape(e), blocked: e.blocked, backupHash: e.migrationBackup?.encoding.sha256};}
      check('K2-NATIVE-BLOCKED-SETTLED', 'Blocked promise rejects with complete backup; no writable/recovery service published', blockedError,
        blockedError?.blocked && blockedError.backupHash === backups.before.encoding.sha256);
      blocker.close();
      await waitFor(() => events.slice(blockedStart).some(e => e.type === 'upgrade-abort'));
      service = await createStorage({indexedDB, version: 1, readOnly: true});
      backups.afterLateBlocked = await service.rawBackup();
      check('K2-NATIVE-NO-LATE-UPGRADE', 'Releasing blocker causes already-settled request to abort before schema installation; v1 keys/data/version intact',
        {version: service.version, schema: await schemaOf(), events: events.slice(blockedStart)},
        service.version === 1 && backups.afterLateBlocked.encoding.sha256 === backups.before.encoding.sha256 && equal(await schemaOf(), beforeSchema));
      service.close();
      service = await createStorage({indexedDB});
      backups.afterSuccess = await service.rawBackup(); const schema = await schemaOf();
      const oldData = {...backups.afterSuccess, version: 1, stores: backups.afterSuccess.stores.filter(s => V1_STORE_NAMES.includes(s.name))};
      const journalIndex = schema.find(s => s.name === 'commandJournal').indexes.find(i => i.name === 'commandId');
      check('K2-NATIVE-SAME-DATABASE-V2', 'Same name v1→v2 retains every old store/key/value; adds four stores; compound unique sparse command index',
        {version: service.version, schema, databaseList: await indexedDB.databases(), migrationBackupHash: service.migrationBackup?.encoding.sha256},
        service.version === 2 && !service.readOnly && schema.length === 14 && schema.every(s => s.keyPath === null && !s.autoIncrement) &&
        equal(view(oldData), view(backups.before)) && equal(journalIndex.keyPath, ['identity.runId', 'commandId']) && journalIndex.unique && !journalIndex.multiEntry &&
        service.migrationBackup.encoding.sha256 === backups.before.encoding.sha256 && (await indexedDB.databases()).length === 1);
      await service.transaction(['commandJournal'], 'readwrite', async tx => {
        for (const runId of ['native-a', 'native-b']) await tx.put('commandJournal', {commandId: 'shared', identity: {runId}, kind: 'read-page'}, commandKey(runId, 'shared'));
        await tx.put('commandJournal', {tag: 'host', registrationId: 'shared', commandId: 'shared'}, 'host:shared');
      });
      const beforeDuplicate = await service.rawBackup(); let duplicate;
      try {await service.transaction(['commandJournal'], 'readwrite', tx => tx.put('commandJournal', {commandId: 'shared', identity: {runId: 'native-a'}, tag: 'read-reservation'}, '@duplicate'));} catch (e) {duplicate = errorShape(e);}
      check('K2-NATIVE-COMPOUND-UNIQUE-SPARSE', 'Same commandId across runs and metadata coexist; same-run collision aborts atomically', {duplicate},
        duplicate?.cause === 'ConstraintError' && (await service.rawBackup()).encoding.sha256 === beforeDuplicate.encoding.sha256);
      const fixtures = [];
      for (const id of ['canonical-one', 'canonical-two']) fixtures.push(await seedStorageFixture(service, {id}));
      const commandId = 'host:registration-canonical-one';
      await service.transaction(['commandJournal'], 'readwrite', tx => tx.put('commandJournal', {tag: 'legacy-raw', opaque: 'do not authorize'}, 'legacy-bare-command'));
      const reservations = [];
      for (const f of fixtures) reservations.push(await service.beginPage({identity: f.identity, requestId: 'canonical-request', readCommandId: commandId,
        pageSequence: 1, expectedPageIdentity: f.template.startUrl, expectedCheckpointSnapshotId: null}));
      const actualRows = await service.transaction(['commandJournal'], 'readonly', async tx => ({host: await tx.get('commandJournal', commandId),
        commands: await Promise.all(fixtures.map(f => tx.get('commandJournal', commandKey(f.identity.runId, commandId)))), legacy: await tx.get('commandJournal', 'legacy-bare-command')}));
      check('K2-NATIVE-REPOSITORY-CANONICAL-KEY', 'Actual repository beginPage uses sole shared per-run key; two reservations cannot overwrite host metadata; no bare fallback',
        {commandId, reservations, actualRows}, actualRows.host.tag === 'host' && actualRows.commands.every(r => r.tag === 'read-reservation') && actualRows.legacy.opaque === 'do not authorize');
      service.close();
      const legacyModule = await import('/legacy/src/platform/storage/index.js');
      const old = await legacyModule.createStorage({indexedDB, name, version: 1});
      const legacyDenial = await readonlyDenial(old);
      check('K2-NATIVE-OLD-JS-READONLY', 'Actual frozen v1 implementation opens v2 read-only; cannot rewrite new schema',
        {version: old.version, readOnly: old.readOnly, migrationError: old.migrationError, denial: legacyDenial}, old.version === 2 && old.readOnly && legacyDenial.refused);
      old.close();
      service = await createStorage({indexedDB, readOnly: true}); backups.currentReadonly = await service.rawBackup();
      const currentDenial = await readonlyDenial(service);
      check('K2-NATIVE-CURRENT-SCHEMA-READONLY', 'Current v2 explicit readonly diagnostic exports all stores and rejects writes',
        {version: service.version, denial: currentDenial}, service.version === 2 && service.readOnly && currentDenial.refused && backups.currentReadonly.stores.length === 14);
      result = {cases, comparisons, beforeSchema, schema, backups: Object.fromEntries(Object.entries(backups).map(([k, b]) => [k, {...view(b), encoding: b.encoding}])), freshOnly};
    }
  } catch (e) {result = {cases, failure: errorShape(e), freshOnly};}
  finally {
    service?.close(); blocker?.close(); for (const c of connections) if (!c.closed) c.db.close();
    IDBFactory.prototype.open = originals.open; IDBDatabase.prototype.close = originals.close;
  }
  return {...result, origin: location.origin, databaseName: name, events,
    cleanup: {unclosedConnections: connections.filter(c => !c.closed).length, nativeObserversRestored: true},
    scope: 'Actual storage product modules exercised over native IDB on HTTP origin; seeded host/run rows are fixtures, not SDK sender or extension authority proof',
    notTested: ['extension startup/SDK sender admission', 'quota', 'SW restart', 'revision/KV/result repository methods pending trusted context/codec', 'all original 17/R3–R8 closure']};
}
