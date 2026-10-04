import {makeMigrationInputs} from './native-idb-migration-fixture.js';
import {createStorage, V1_STORE_NAMES, STORE_NAMES, STORE_SCHEMA, decodeRawBackup} from '/src/platform/storage/index.js';
import {commandKey} from '/src/platform/journal.js';
import {seedStorageFixture} from '/src/platform/storage/regression.js';
import {digestUtf8, FoundationError} from '/src/platform/protocol.js';
import {decodeValue} from '/src/platform/page-port/codec.js';

export async function runMigrationVerification({freshOnly = false} = {}) {
  const name = 'opendesk-browser', cases = [], events = [], connections = [], backups = {};
  const errorShape = e => ({name: e?.name, code: e?.code ?? null, message: e?.message, cause: e?.cause?.name});
  const originals = {open: IDBFactory.prototype.open, close: IDBDatabase.prototype.close, digest: SubtleCrypto.prototype.digest};
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
  SubtleCrypto.prototype.digest = async function(...args) {
    const hash = await Reflect.apply(originals.digest, this, args);
    if (fault === 'backup-race') {
      fault = null;
      // The real readonly snapshot has finished. Commit a native competing
      // write while its hash is awaiting completion, close, then allow upgrade.
      // Backup bytes and all product checks remain unchanged.
      const tx = blocker.transaction(['records'], 'readwrite');
      tx.objectStore('records').put({tag: 'k2-competing-write', value: false}, '@k2-backup-race');
      await new Promise((yes, no) => {tx.oncomplete = yes; tx.onabort = () => no(tx.error);});
      push('competing-write-committed'); blocker.close();
    }
    return hash;
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
      blocker = await openNative(); fault = 'backup-race';
      service = await createStorage({indexedDB}); fault = null;
      backups.afterRace = await service.rawBackup();
      const raceValue = await service.transaction(['records'], 'readonly', tx => tx.get('records', '@k2-backup-race'));
      check('K2-NATIVE-BACKUP-RACE-FENCE', 'A real competing commit after backup aborts upgrade; competing value and old v1 records are retained read-only',
        {version: service.version, readOnly: service.readOnly, migrationError: service.migrationError, raceValue,
          backupHash: service.migrationBackup?.encoding.sha256, afterHash: backups.afterRace.encoding.sha256},
        service.version === 1 && service.readOnly && service.migrationError.cause.message === 'Database changed after migration backup' &&
        service.migrationBackup.encoding.sha256 === backups.before.encoding.sha256 && raceValue.value === false && events.some(e => e.type === 'competing-write-committed'));
      service.close();
      service = await createStorage({indexedDB});
      backups.afterSuccess = await service.rawBackup(); const schema = await schemaOf();
      const oldData = {...backups.afterSuccess, version: 1, stores: backups.afterSuccess.stores.filter(s => V1_STORE_NAMES.includes(s.name))};
      const journalIndex = schema.find(s => s.name === 'commandJournal').indexes.find(i => i.name === 'commandId');
      check('K2-NATIVE-SAME-DATABASE-V2', 'Same name v1→v2 retains every old store/key/value; adds four stores; compound unique sparse command index',
        {version: service.version, schema, databaseList: await indexedDB.databases(), migrationBackupHash: service.migrationBackup?.encoding.sha256},
        service.version === 2 && !service.readOnly && schema.length === 14 && schema.every(s => s.keyPath === null && !s.autoIncrement) &&
        equal(view(oldData), view(backups.afterRace)) && equal(journalIndex.keyPath, ['identity.runId', 'commandId']) && journalIndex.unique && !journalIndex.multiEntry &&
        service.migrationBackup.encoding.sha256 === backups.afterRace.encoding.sha256 && (await indexedDB.databases()).length === 1);
      await service.transaction(['commandJournal'], 'readwrite', async tx => {
        for (const runId of ['native-a', 'native-b']) await tx.put('commandJournal', {commandId: 'shared', identity: {runId}, kind: 'read-page'}, commandKey(runId, 'shared'));
        await tx.put('commandJournal', {tag: 'host', registrationId: 'shared', commandId: 'shared'}, 'host:shared');
      });
      const beforeDuplicate = await service.rawBackup(); let duplicate;
      try {await service.transaction(['commandJournal'], 'readwrite', tx => tx.put('commandJournal', {commandId: 'shared', identity: {runId: 'native-a'}, tag: 'read-reservation'}, '@duplicate'));} catch (e) {duplicate = errorShape(e);}
      check('K2-NATIVE-COMPOUND-UNIQUE-SPARSE', 'Same commandId across runs and metadata coexist; same-run collision aborts atomically', {duplicate},
        duplicate?.cause === 'ConstraintError' && (await service.rawBackup()).encoding.sha256 === beforeDuplicate.encoding.sha256);
      const fixtures = [];
      for (const id of ['canonical-one', 'canonical-two']) {
        const fixture = await seedStorageFixture(service, {id});
        // The shared seed uses a fixed historical approval timestamp. This new
        // native fixture needs a current approval; keep the real duration guard.
        await service.transaction(['runs'], 'readwrite', async tx => {
          const run = await tx.get('runs', fixture.identity.runId);
          run.entitlementSnapshot.approvedAt = new Date(Date.now() - 1000).toISOString();
          await tx.put('runs', run, run.runId);
        });
        fixtures.push(fixture);
      }
      const commandId = 'host:registration-canonical-one';
      await service.transaction(['commandJournal'], 'readwrite', tx => tx.put('commandJournal', {tag: 'legacy-raw', opaque: 'do not authorize'}, 'legacy-bare-command'));
      const reservations = [];
      for (const f of fixtures) reservations.push(await service.beginPage({identity: f.identity, requestId: 'canonical-request', readCommandId: commandId,
        pageSequence: 1, expectedPageIdentity: f.template.startUrl, expectedCheckpointSnapshotId: null}));
      const actualRows = await service.transaction(['commandJournal'], 'readonly', async tx => ({host: await tx.get('commandJournal', commandId),
        commands: await Promise.all(fixtures.map(f => tx.get('commandJournal', commandKey(f.identity.runId, commandId)))), legacy: await tx.get('commandJournal', 'legacy-bare-command')}));
      check('K2-NATIVE-REPOSITORY-CANONICAL-KEY', 'Actual repository beginPage uses sole shared per-run key; two reservations cannot overwrite host metadata; no bare fallback',
        {commandId, reservations, actualRows}, actualRows.host.tag === 'host' && actualRows.commands.every(r => r.tag === 'read-reservation') && actualRows.legacy.opaque === 'do not authorize');
      // Fixture-owned closures test native transaction primitives only. They
      // are not real SDK sender admission or production authority qualification.
      let contextSequence = 0;
      const contextFor = async (namespace = 'sdk-a', options = {}) => {
        const id = `native-sdk-${++contextSequence}`;
        const context = {namespace, principal: 'fixture-principal', grantIncarnation: 'fixture-grant-1',
          runId: id, opId: id, requestId: id, opKey: `sdk-operation:${id}`, resultId: `sdk-result:${id}`,
          browserSessionIncarnation: 'fixture-session-1', deadlineAt: Date.now() + 60000};
        const grantKey = `fixture-grant:${namespace}`;
        await service.transaction(['commandJournal'], 'readwrite', async tx => {
          await tx.put('commandJournal', {tag: 'fixture-grant', namespace, active: true, incarnation: context.grantIncarnation}, grantKey);
          await tx.put('commandJournal', {...context, tag: 'sdk-operation', state: 'admitted'}, context.opKey);
        });
        let outerChecks = 0, txChecks = 0;
        context.authorize = async () => {
          outerChecks++;
          if (options.rejectDelivery && outerChecks === 2) throw new FoundationError('E_OWNER', 'fixture delivery revoked');
          const grant = await service.transaction(['commandJournal'], 'readonly', tx => tx.get('commandJournal', grantKey));
          if (!grant?.active || grant.incarnation !== context.grantIncarnation) throw new FoundationError('E_OWNER', 'fixture grant revoked');
        };
        context.authorizeInTransaction = async tx => {
          txChecks++;
          const grant = await tx.get('commandJournal', grantKey), op = await tx.get('commandJournal', context.opKey);
          if (!grant?.active || grant.incarnation !== context.grantIncarnation || !op || op.state === 'cancelled' ||
            (options.rejectFinal && txChecks === 2)) throw new FoundationError('E_OWNER', 'fixture final authorization revoked');
        };
        return context;
      };
      const invoke = async (method, args, namespace) => service.executeSdk(method, args, await contextFor(namespace));
      const noContextBefore = (await service.rawBackup()).encoding.sha256; let noContext;
      try {await service.executeSdk('APPSTORAGE_SETITEM', {key: 'payload-only', value: 'bad', namespace: 'sdk-a'}, {namespace: 'sdk-a'});} catch (e) {noContext = errorShape(e);}
      check('K2-NATIVE-SDK-CONTEXT-REQUIRED', 'Missing trusted callbacks fail closed without any database effects', {noContext},
        noContext.code === 'E_OWNER' && (await service.rawBackup()).encoding.sha256 === noContextBefore);
      const appMissing = await invoke('APPSTORAGE_GETITEM', {key: 'missing'});
      const setContext = await contextFor();
      const appSet = await service.executeSdk('APPSTORAGE_SETITEM', {key: 'app-string', value: 0}, setContext);
      const appGet = await invoke('APPSTORAGE_GETITEM', {key: 'app-string'});
      const firstBackup = (await service.rawBackup()).encoding.sha256;
      const duplicateValue = await service.executeSdk('APPSTORAGE_SETITEM', {key: 'app-string', value: 0}, setContext);
      let digestConflict;
      try {await service.executeSdk('APPSTORAGE_SETITEM', {key: 'app-string', value: 1}, setContext);} catch (e) {digestConflict = errorShape(e);}
      const setFacts = await service.transaction(['commandJournal', 'results'], 'readonly', async tx =>
        ({op: await tx.get('commandJournal', setContext.opKey), result: await tx.get('results', setContext.resultId)}));
      check('K2-NATIVE-SDK-ATOMIC-DURABLE-DUPLICATE', 'String conversion, missing null, undefined receipt, immutable duplicate and digest conflict share one durable native commit',
        {appMissing, appGet, appSetWire: setFacts.result.valueWire, duplicateWire: setFacts.result.valueWire, digestConflict, op: setFacts.op, result: setFacts.result},
        appMissing === null && appGet === '0' && appSet === undefined && duplicateValue === undefined &&
        setFacts.op.state === 'durable' && setFacts.result.valueWire.type === 'undefined' && digestConflict.code === 'E_REQUEST_CONFLICT' &&
        (await service.rawBackup()).encoding.sha256 === firstBackup);
      const typedValues = {zero: 0, bool: false, nil: null, empty: '', undef: undefined, object: {a: [1, null, false]}};
      await invoke('CHROME_LOCAL_SET', {values: typedValues});
      await invoke('CHROME_LOCAL_SET', {values: {secret: 'other namespace'}}, 'sdk-b');
      const typedResults = {};
      for (const k of Object.keys(typedValues)) typedResults[k] = await invoke('CHROME_LOCAL_GET', {key: k});
      const typedMissing = await invoke('CHROME_LOCAL_GET', {key: 'absent'});
      const allValues = await invoke('CHROME_LOCAL_GET', {key: null});
      const typedWire = await service.transaction(['frameworkKV'], 'readonly', tx => tx.all('frameworkKV'));
      check('K2-NATIVE-SDK-TYPED-NAMESPACE', 'Native KV retains false/zero/null/undefined/objects; get(null) returns only own namespace values array',
        {typedWire, allValuesWire: allValues.map(v => ({type: v === undefined ? 'undefined' : typeof v, value: v})), typedMissing: typedMissing === undefined},
        Object.is(typedResults.zero, 0) && typedResults.bool === false && typedResults.nil === null && typedResults.undef === undefined &&
        equal(typedResults.object, typedValues.object) && typedMissing === undefined && allValues.length === 7 && !allValues.includes('other namespace'));
      const deniedContext = await contextFor('sdk-a', {rejectFinal: true});
      const beforeDenied = (await service.rawBackup()).encoding.sha256; let denied;
      try {await service.executeSdk('CHROME_LOCAL_SET', {values: {mustRollback: true}}, deniedContext);} catch (e) {denied = errorShape(e);}
      check('K2-NATIVE-SDK-FINAL-AUTH-ROLLBACK', 'Final in-transaction callback rejection aborts actual already-issued KV writes, result and op CAS', {denied},
        denied.code === 'E_OWNER' && (await service.rawBackup()).encoding.sha256 === beforeDenied);
      const deliveryContext = await contextFor('sdk-a', {rejectDelivery: true}); let deliveryDenied;
      try {await service.executeSdk('CHROME_LOCAL_SET', {values: {committedBeforeDelivery: false}}, deliveryContext);} catch (e) {deliveryDenied = errorShape(e);}
      const deliveryFacts = await service.transaction(['commandJournal', 'results', 'frameworkKV'], 'readonly', async tx =>
        ({op: await tx.get('commandJournal', deliveryContext.opKey), result: await tx.get('results', deliveryContext.resultId), rows: await tx.all('frameworkKV')}));
      check('K2-NATIVE-SDK-POSTCOMMIT-DELIVERY-FENCE', 'Postcommit native/doc callback denial rejects delivery and preserves durable effect/result facts',
        {deliveryDenied, op: deliveryFacts.op, result: deliveryFacts.result, delivered: false},
        deliveryDenied.code === 'E_OWNER' && deliveryFacts.op.state === 'durable' && deliveryFacts.result.valueWire.type === 'undefined' &&
        deliveryFacts.rows.some(r => r.key === 'committedBeforeDelivery' && decodeValue(r.valueWire) === false));
      const revoked = await contextFor();
      await service.transaction(['commandJournal'], 'readwrite', async tx => {
        const grant = await tx.get('commandJournal', 'fixture-grant:sdk-a'); grant.active = false;
        await tx.put('commandJournal', grant, 'fixture-grant:sdk-a');
      });
      const beforeRevoked = (await service.rawBackup()).encoding.sha256; let revokedError;
      try {await service.executeSdk('CHROME_LOCAL_GET', {key: 'zero'}, revoked);} catch (e) {revokedError = errorShape(e);}
      check('K2-NATIVE-SDK-PERSISTED-GRANT-REVOKE', 'Actual fixture grant row revocation rejects old operation without effect or receipt', {revokedError},
        revokedError.code === 'E_OWNER' && (await service.rawBackup()).encoding.sha256 === beforeRevoked);
      const devices = await Promise.all(Array.from({length: 20}, () => contextFor()));
      const ids = await Promise.all(devices.map(context => service.getAppId(context)));
      const beforeClearId = ids[0];
      await invoke('CHROME_LOCAL_REMOVE', {keys: ['zero', 'nil']});
      const afterRemove = await invoke('CHROME_LOCAL_GET', {key: 'zero'});
      await invoke('APPSTORAGE_CLEAR', {});
      const afterClear = await invoke('CHROME_LOCAL_GET', {key: null});
      const preservedOther = await invoke('CHROME_LOCAL_GET', {key: 'secret'}, 'sdk-b');
      const afterClearId = await service.getAppId(await contextFor());
      check('K2-NATIVE-SDK-DEVICE-CAS-CLEAR', 'Concurrent deviceID CAS has one namespace value; user remove/clear preserves device metadata and other namespace',
        {ids, beforeClearId, afterClearId, ownValues: afterClear, preservedOther, deviceRows: (await service.transaction(['frameworkKV'], 'readonly', tx => tx.all('frameworkKV'))).filter(r => r.tag === 'device-id')},
        new Set(ids).size === 1 && beforeClearId === afterClearId && afterRemove === undefined && afterClear.length === 0 && preservedOther === 'other namespace');
      const parallelContexts = await Promise.all(Array.from({length: 100}, () => contextFor('sdk-concurrent')));
      await Promise.all(parallelContexts.map((context, i) => service.executeSdk('CHROME_LOCAL_SET', {values: {[`concurrent-${i}`]: i}}, context)));
      const concurrentFacts = await service.transaction(['frameworkKV', 'results'], 'readonly', async tx =>
        ({rows: (await tx.all('frameworkKV')).filter(r => r.namespace === 'sdk-concurrent'), results: (await tx.all('results')).filter(r => r.namespace === 'sdk-concurrent')}));
      check('K2-NATIVE-SDK-100-NATIVE-TRANSACTIONS', '100 fixture-authorized operations serialize through native overlapping readwrite scopes; one effect/result per op',
        {effects: concurrentFacts.rows.length, durableResults: concurrentFacts.results.length}, concurrentFacts.rows.length === 100 && concurrentFacts.results.length === 100);
      const resultContext = await contextFor();
      const requestDigest = await digestUtf8('fixture outcome input');
      const committedOutcome = await service.commitResult(resultContext, {requestDigest, outcome: {ok: true, value: {success: false, data: null}}});
      const originalOutcome = await service.getResult(resultContext);
      const errorContext = await contextFor();
      const errorOutcome = await service.commitResult(errorContext, {requestDigest, outcome: {ok: false, error: {name: 'Error', code: 'E_FIXTURE', message: 'fixture'}}});
      check('K2-NATIVE-RESULT-CODEC', 'Result codec distinguishes business success:false value from execution error and retains data:null',
        {committedOutcome, originalOutcome, errorOutcome}, equal(committedOutcome, originalOutcome) && committedOutcome.ok &&
        committedOutcome.value.success === false && committedOutcome.value.data === null && !errorOutcome.ok && errorOutcome.error.code === 'E_FIXTURE');
      const revisionContext = await contextFor('revision-native');
      const revisions = await Promise.allSettled([
        service.commitScriptRevision(revisionContext, {scriptId: 'script-a', expectedRevision: 0, sourceUtf8: 'return "α";\n'}),
        service.commitScriptRevision(revisionContext, {scriptId: 'script-a', expectedRevision: 0, sourceUtf8: 'return "β";\n'})]);
      const r1 = revisions.find(r => r.status === 'fulfilled').value;
      const pin = await service.pinScriptRevision(revisionContext, {scriptId: 'script-a', revision: 1, contentHash: r1.contentHash});
      const r2 = await service.commitScriptRevision(revisionContext, {scriptId: 'script-a', expectedRevision: 1, sourceUtf8: 'return 2;'});
      await service.tombstoneScript(revisionContext, {scriptId: 'script-a', expectedRevision: 2}); let pinnedGc;
      try {await service.garbageCollectScript(revisionContext, {scriptId: 'script-a'});} catch (e) {pinnedGc = errorShape(e);}
      const revisionFacts = await service.transaction(['scriptHeads', 'scriptRevisions'], 'readonly', async tx =>
        ({heads: await tx.all('scriptHeads'), revisions: await tx.all('scriptRevisions')}));
      await service.releaseScriptRevisionPin(revisionContext, {scriptId: 'script-a', revision: 1});
      await service.transaction(['commandJournal'], 'readwrite', async tx => {
        const op = await tx.get('commandJournal', revisionContext.opKey); op.state = 'effect_unknown'; await tx.put('commandJournal', op, revisionContext.opKey);
      }); let unknownGc;
      try {await service.garbageCollectScript(revisionContext, {scriptId: 'script-a'});} catch (e) {unknownGc = errorShape(e);}
      await service.transaction(['commandJournal'], 'readwrite', async tx => {
        const op = await tx.get('commandJournal', revisionContext.opKey); op.state = 'durable'; op.deliveryState = 'delivered'; await tx.put('commandJournal', op, revisionContext.opKey);
      });
      const gc = await service.garbageCollectScript(revisionContext, {scriptId: 'script-a'});
      check('K2-NATIVE-REVISION-CAS-PIN-TOMBSTONE-GC', 'Head CAS loser leaves no orphan; exact UTF8 hash and r1 pin survive r2/tombstone; pin/unknown block GC until release and delivered durable fact',
        {cas: revisions.map(r => ({status: r.status, error: r.reason && errorShape(r.reason)})), r1, r2, pin, pinnedGc, unknownGc, revisionFacts, gc},
        revisions.filter(r => r.status === 'fulfilled').length === 1 && revisions.find(r => r.status === 'rejected').reason.code === 'E_REVISION' &&
        r1.contentHash === await digestUtf8(r1.sourceUtf8) && pin.revision.sourceUtf8 === r1.sourceUtf8 && revisionFacts.revisions.length === 2 &&
        revisionFacts.heads[0].tombstoned && pinnedGc.code === 'E_OWNER' && unknownGc.code === 'E_OWNER' && gc.removed === 2);
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
      const stale = service;
      const versionchangeError = await new Promise((yes, no) => {
        const request = indexedDB.open(name, 3);
        request.onupgradeneeded = () => request.transaction.abort();
        request.onerror = () => yes(errorShape(request.error));
        request.onsuccess = () => {request.result.close(); no(new Error('Diagnostic version3 should abort'));};
      });
      let staleError;
      try {await stale.rawBackup();} catch (e) {staleError = errorShape(e);}
      service = await createStorage({indexedDB, readOnly: true}); backups.afterVersionchange = await service.rawBackup();
      check('K2-NATIVE-VERSIONCHANGE-CLOSE', 'Native versionchange closes old owned service; aborted diagnostic v3 preserves v2 and new owner registry can reopen',
        {versionchangeError, staleError, version: service.version}, versionchangeError.name === 'AbortError' && staleError?.message === 'Storage connection closed' &&
        service.version === 2 && backups.afterVersionchange.encoding.sha256 === backups.currentReadonly.encoding.sha256);
      result = {cases, comparisons, beforeSchema, schema, backups: Object.fromEntries(Object.entries(backups).map(([k, b]) => [k, {...view(b), encoding: b.encoding}])), freshOnly};
    }
  } catch (e) {result = {cases, failure: errorShape(e), freshOnly};}
  finally {
    service?.close(); blocker?.close(); for (const c of connections) if (!c.closed) c.db.close();
    IDBFactory.prototype.open = originals.open; IDBDatabase.prototype.close = originals.close; SubtleCrypto.prototype.digest = originals.digest;
  }
  return {...result, origin: location.origin, databaseName: name, events,
    cleanup: {unclosedConnections: connections.filter(c => !c.closed).length, nativeObserversRestored: true},
    scope: 'Actual storage product modules exercised over native IDB on HTTP origin; seeded host/run rows are fixtures, not SDK sender or extension authority proof',
    notTested: ['extension startup/SDK sender admission', 'quota', 'SW restart', 'revision/KV/result repository methods pending trusted context/codec', 'all original 17/R3–R8 closure']};
}
