// Diagnostic observer over the actual production storage modules and native IDB.
// The observers forward native calls unchanged; they do not implement storage.
export function makeMigrationInputs(storeNames) {
  const jsonValues = [null, false, 0, '', '中文\\\"\n', [null, false, 0, ''], {nested: {empty: [], count: 0}}, {array: [{ok: true}, null]}];
  const keys = [
    ['string', 'k2:string:\u0000中文'], ['number-negative', -17.25], ['number-zero', 0],
    ['date', new Date('2026-01-02T03:04:05.123Z')],
    ['binary-arraybuffer', new Uint8Array([0, 1, 127, 128, 255]).buffer],
    ['binary-window', new Uint8Array(new Uint8Array([99, 5, 0, 254, 8, 77]).buffer, 1, 4)],
    ['array', ['k2:array', 17.5]],
    ['compound', ['k2:compound', 7, new Date('2025-12-31T23:59:59.999Z'), new Uint8Array([0, 129, 255]).buffer, ['nested', -3]]]
  ];
  return storeNames.flatMap(store => keys.map(([inputId, key], index) => ({store, inputId, key,
    value: {tag: 'k2-native-idb-input', store, inputId, json: jsonValues[index]}})));
}

export async function runPreparation() {
  const {createStorage, STORE_NAMES, STORE_SCHEMA} = await import('/src/platform/storage/index.js');
  const databaseName = 'opendesk-browser';
  const errorShape = error => ({name: error?.name, code: error?.code ?? null, message: String(error?.message || error)});
  const nativeEvents = [], cases = [], connections = [];
  const originalOpen = IDBFactory.prototype.open;
  const originalClose = IDBDatabase.prototype.close;
  const originalTransaction = IDBDatabase.prototype.transaction;
  const nativeIdentity = {
    factory: Object.prototype.toString.call(indexedDB),
    nativeFactoryInstance: indexedDB instanceof IDBFactory,
    open: Function.prototype.toString.call(originalOpen),
    transaction: Function.prototype.toString.call(originalTransaction),
    cursor: Function.prototype.toString.call(IDBObjectStore.prototype.openCursor),
    observer: 'native open/close/transaction event observers only; no factory replacement, synthetic event, mock or alternate storage implementation'
  };
  const log = (type, fields = {}) => nativeEvents.push({type, at: performance.now(), ...fields});
  IDBFactory.prototype.open = function(...args) {
    const request = Reflect.apply(originalOpen, this, args);
    const id = nativeEvents.length;
    log('open', {id, name: args[0], requestedVersion: args[1] ?? null});
    request.addEventListener('upgradeneeded', event => {
      log('upgradeneeded', {id, oldVersion: event.oldVersion, newVersion: event.newVersion,
        temporaryDatabaseVersion: request.result.version, transactionMode: request.transaction.mode, isTrusted: event.isTrusted});
      request.transaction.addEventListener('abort', event => log('upgrade-abort', {id, isTrusted: event.isTrusted, error: request.transaction?.error && errorShape(request.transaction.error)}));
      request.transaction.addEventListener('complete', event => log('upgrade-complete', {id, isTrusted: event.isTrusted}));
    });
    request.addEventListener('error', event => log('open-error', {id, isTrusted: event.isTrusted, error: errorShape(request.error)}));
    request.addEventListener('blocked', event => log('open-blocked', {id, oldVersion: event.oldVersion, newVersion: event.newVersion, isTrusted: event.isTrusted}));
    request.addEventListener('success', event => {
      connections.push({db: request.result, id, closed: false});
      log('open-success', {id, version: request.result.version, stores: Array.from(request.result.objectStoreNames), isTrusted: event.isTrusted});
    });
    return request;
  };
  IDBDatabase.prototype.close = function(...args) {
    const connection = connections.find(item => item.db === this);
    const result = Reflect.apply(originalClose, this, args);
    if (connection) connection.closed = true;
    log('close', {id: connection?.id ?? null, version: this.version});
    return result;
  };
  IDBDatabase.prototype.transaction = function(...args) {
    const tx = Reflect.apply(originalTransaction, this, args);
    log('transaction', {mode: tx.mode, stores: Array.from(tx.objectStoreNames)});
    tx.addEventListener('complete', event => log('transaction-complete', {mode: tx.mode, isTrusted: event.isTrusted}));
    tx.addEventListener('abort', event => log('transaction-abort', {mode: tx.mode, isTrusted: event.isTrusted, error: tx.error && errorShape(tx.error)}));
    return tx;
  };
  const describeKey = key => {
    if (typeof key === 'string' || typeof key === 'number') return {type: typeof key, value: key};
    if (key instanceof Date) return {type: 'date', constructor: key.constructor.name, epochMs: key.getTime(), iso: key.toISOString()};
    if (key instanceof ArrayBuffer || ArrayBuffer.isView(key)) {
      const bytes = key instanceof ArrayBuffer ? new Uint8Array(key) : new Uint8Array(key.buffer, key.byteOffset, key.byteLength);
      return {type: 'binary', constructor: key.constructor.name, byteLength: bytes.length, bytes: Array.from(bytes), hex: Array.from(bytes, n => n.toString(16).padStart(2, '0')).join('')};
    }
    if (Array.isArray(key)) return {type: 'array', values: key.map(describeKey)};
    throw new Error('Unexpected native key type');
  };
  const normalizedKey = key => {
    const result = describeKey(key);
    if (result.type === 'binary') result.constructor = 'ArrayBuffer';
    if (result.type === 'array') result.values = key.map(normalizedKey);
    return result;
  };
  const typedBackup = backup => ({...backup, stores: backup.stores.map(store => ({name: store.name,
    records: store.records.map(row => ({primaryKey: describeKey(row.key), value: row.value}))}))});
  const dataView = backup => ({name: backup.name, version: backup.version, stores: backup.stores});
  const hash = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)))), b => b.toString(16).padStart(2, '0')).join('');
  const check = (id, expected, actual, pass) => {
    cases.push({id, expected, actual, pass: Boolean(pass)});
    if (!pass) throw new Error(`Preparation assertion failed: ${id}`);
  };
  const jsonValues = [null, false, 0, '', '中文\\\"\n', [null, false, 0, ''], {nested: {empty: [], count: 0}}, {array: [{ok: true}, null]}];
  const keyInputs = [
    {id: 'string', key: 'k2:string:\u0000中文'},
    {id: 'number-negative', key: -17.25},
    {id: 'number-zero', key: 0},
    {id: 'date', key: new Date('2026-01-02T03:04:05.123Z')},
    {id: 'binary-arraybuffer', key: new Uint8Array([0, 1, 127, 128, 255]).buffer},
    {id: 'binary-window', key: new Uint8Array(new Uint8Array([99, 5, 0, 254, 8, 77]).buffer, 1, 4)},
    {id: 'array', key: ['k2:array', 17.5]},
    {id: 'compound', key: ['k2:compound', 7, new Date('2025-12-31T23:59:59.999Z'), new Uint8Array([0, 129, 255]).buffer, ['nested', -3]]}
  ];
  const inputs = STORE_NAMES.flatMap(store => keyInputs.map((item, index) => ({store, inputId: item.id,
    key: item.key, value: {tag: 'k2-native-idb-input', store, inputId: item.id, json: jsonValues[index]}})));
  let v1, recovery, nativeInspection, outcome;
  const databasesBefore = await indexedDB.databases();
  try {
    check('K2-IDB-PREP-FRESH-ORIGIN', 'No database in this new isolated profile/origin', databasesBefore, databasesBefore.length === 0);
    v1 = await createStorage({indexedDB, name: databaseName, version: 1});
    await v1.transaction(STORE_NAMES, 'readwrite', async tx => {
      for (const input of inputs) await tx.put(input.store, input.value, input.key);
    });
    // Read schema using a native readonly inspection connection, not a second service.
    nativeInspection = await new Promise((resolve, reject) => {
      const request = indexedDB.open(databaseName);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = nativeInspection.transaction(STORE_NAMES, 'readonly');
    const schema = Array.from(nativeInspection.objectStoreNames, name => {
      const store = tx.objectStore(name);
      return {name, keyPath: store.keyPath, autoIncrement: store.autoIncrement,
        indexes: Array.from(store.indexNames, id => {const index = store.index(id); return {name: id, keyPath: index.keyPath, unique: index.unique, multiEntry: index.multiEntry};})};
    });
    await new Promise((resolve, reject) => {tx.oncomplete = resolve; tx.onabort = () => reject(tx.error);});
    nativeInspection.close();
    const schemaMatches = schema.length === 10 && schema.every(store => store.keyPath === null && store.autoIncrement === false &&
      store.indexes.length === Object.keys(STORE_SCHEMA[store.name]).length && store.indexes.every(index =>
        JSON.stringify(index.keyPath) === JSON.stringify(STORE_SCHEMA[store.name][index.name][0]) && index.unique === STORE_SCHEMA[store.name][index.name][1] && index.multiEntry === false));
    check('K2-IDB-PREP-V1-SCHEMA', 'Actual v1 existing ten explicit-key stores and current indexes', schema, v1.version === 1 && !v1.readOnly && schemaMatches);
    const beforeRaw = await v1.rawBackup();
    const before = typedBackup(beforeRaw);
    const comparisons = inputs.map(input => {
      const rows = beforeRaw.stores.find(store => store.name === input.store).records;
      const matches = rows.filter(row => indexedDB.cmp(row.key, input.key) === 0);
      const row = matches[0];
      return {store: input.store, inputId: input.inputId, inputKey: describeKey(input.key), expectedNativePrimaryKey: normalizedKey(input.key),
        actualNativePrimaryKey: row && describeKey(row.key), originalValue: input.value, actualValue: row?.value,
        nativeCmpEqual: matches.length === 1, typeBytesValueEqual: Boolean(row) && JSON.stringify(normalizedKey(input.key)) === JSON.stringify(describeKey(row.key)),
        jsonValueEqual: Boolean(row) && JSON.stringify(input.value) === JSON.stringify(row.value)};
    });
    check('K2-IDB-PREP-RAW-BACKUP-KEYS', '80 native cursor primaryKeys retain native type/bytes/value and JSON values across all ten stores',
      {records: comparisons.length, comparisons}, comparisons.length === 80 && before.stores.every(store => store.records.length === 8) && comparisons.every(row => row.nativeCmpEqual && row.typeBytesValueEqual && row.jsonValueEqual));
    const beforeHash = await hash(dataView(before));
    const schemaHash = await hash(schema);
    v1.close();
    const upgradeEventsStart = nativeEvents.length;
    recovery = await createStorage({indexedDB, name: databaseName, version: 2});
    const upgradeEvents = nativeEvents.slice(upgradeEventsStart);
    const upgraded = upgradeEvents.find(event => event.type === 'upgradeneeded' && event.oldVersion === 1 && event.newVersion === 2);
    check('K2-IDB-PREP-UNSUPPORTED-V2-ABORT', 'Actual 1→2 onupgradeneeded aborts; existing implementation returns v1 readOnly recovery, not v2 success',
      {version: recovery.version, readOnly: recovery.readOnly, migrationError: recovery.migrationError, nativeEvents: upgradeEvents},
      Boolean(upgraded?.isTrusted) && upgradeEvents.some(event => event.type === 'upgrade-abort' && event.id === upgraded.id && event.isTrusted) &&
      upgradeEvents.some(event => event.type === 'open-error' && event.id === upgraded.id && event.error.name === 'AbortError') &&
      recovery.version === 1 && recovery.readOnly && recovery.migrationError?.code === 'E_VERSION');
    const afterRaw = await recovery.rawBackup();
    const after = typedBackup(afterRaw);
    const afterHash = await hash(dataView(after));
    const databasesAfterFailure = await indexedDB.databases();
    check('K2-IDB-PREP-FAILURE-PRESERVES-DATA', 'Same name/version/store/key/value snapshot after native upgrade abort',
      {beforeHash, afterHash, databaseList: databasesAfterFailure, beforeReadOnly: before.readOnly, afterReadOnly: after.readOnly},
      beforeHash === afterHash && databasesAfterFailure.length === 1 && databasesAfterFailure[0].name === databaseName && databasesAfterFailure[0].version === 1);
    let callbackCalled = false, writeError;
    const transactionCountBefore = nativeEvents.filter(event => event.type === 'transaction').length;
    try {await recovery.transaction(['records'], 'readwrite', async tx => {callbackCalled = true; await tx.put('records', {sentinel: true}, 'k2-forbidden-write');});}
    catch (error) {writeError = errorShape(error);}
    const transactionCountAfter = nativeEvents.filter(event => event.type === 'transaction').length;
    const readonlyValue = await recovery.transaction(['records'], 'readonly', tx => tx.get('records', keyInputs[0].key));
    const finalBackup = typedBackup(await recovery.rawBackup());
    const finalHash = await hash(dataView(finalBackup));
    check('K2-IDB-PREP-READONLY-RECOVERY', 'Service readonly reads work; readwrite rejected before native tx/callback; snapshot unchanged',
      {writeError, callbackCalled, transactionCountBefore, transactionCountAfter, readonlyValue, finalHash},
      writeError?.code === 'E_VERSION' && !callbackCalled && transactionCountBefore === transactionCountAfter &&
      JSON.stringify(readonlyValue) === JSON.stringify(inputs.find(row => row.store === 'records' && row.inputId === 'string').value) && finalHash === beforeHash);
    recovery.close();
    nativeInspection = await new Promise((resolve, reject) => {const request = indexedDB.open(databaseName); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);});
    const finalTx = nativeInspection.transaction(STORE_NAMES, 'readonly');
    const schemaAfter = Array.from(nativeInspection.objectStoreNames, name => {
      const store = finalTx.objectStore(name);
      return {name, keyPath: store.keyPath, autoIncrement: store.autoIncrement,
        indexes: Array.from(store.indexNames, id => {const index = store.index(id); return {name: id, keyPath: index.keyPath, unique: index.unique, multiEntry: index.multiEntry};})};
    });
    await new Promise((resolve, reject) => {finalTx.oncomplete = resolve; finalTx.onabort = () => reject(finalTx.error);});
    check('K2-IDB-PREP-REOPEN-V1-SCHEMA', 'Native reopening after failed upgrade retains v1 stores and indexes',
      {version: nativeInspection.version, schemaAfter, schemaHash, schemaAfterHash: await hash(schemaAfter)}, nativeInspection.version === 1 && JSON.stringify(schemaAfter) === JSON.stringify(schema));
    nativeInspection.close();
    outcome = {origin: location.origin, url: location.href, secureContext: isSecureContext, databaseName, nativeIdentity,
      storageMethods: Object.keys(v1).filter(key => typeof v1[key] === 'function'), inputEvidence: comparisons,
      backups: {before, afterFailure: after, final: finalBackup}, snapshotHashes: {beforeHash, afterHash, finalHash}, schema, schemaAfter,
      databasesBefore, databasesAfterFailure, cases, productV2Supported: false,
      notTested: ['successful v2 migration', 'extension storage startup or SDK sender context', 'transaction-owned sender/grant admission', 'repository CAS and production business methods', 'quota/fault exhaustion', 'blocked upgrade/later unblock', 'SW stop/restart', 'F1/F2/F3 qualification or closure']};
  } catch (error) {
    outcome = {origin: location.origin, databaseName, nativeIdentity, cases, initializationOrAssertionFailure: errorShape(error)};
  } finally {
    v1?.close(); recovery?.close();
    for (const item of connections) if (!item.closed) item.db.close();
    outcome.nativeEvents = nativeEvents;
    outcome.cleanup = {openedSuccessfulConnections: connections.length, unclosedConnections: connections.filter(item => !item.closed).length,
      databaseDeletedBeforeVerification: false, nativeObserversRestored: true};
    IDBFactory.prototype.open = originalOpen;
    IDBDatabase.prototype.close = originalClose;
    IDBDatabase.prototype.transaction = originalTransaction;
  }
  return outcome;
}
