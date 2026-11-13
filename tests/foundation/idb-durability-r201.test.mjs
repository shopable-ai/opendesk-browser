import test from 'node:test';
import assert from 'node:assert/strict';
import {STORE_NAMES, transact} from '../../src/platform/storage/idb.js';

// Component boundary double ONLY: observes transaction arguments and rejection,
// with a small request scheduler for keepalive/raw checks. No native IDB,
// browser crash, disk flush or power-loss durability is proven here.
const critical = ['runs', 'results', 'commandJournal', 'frameworkKV'];
function engine(options = {}) {
  const {rejectOptions, rows = []} = options;
  const durability = Object.hasOwn(options, 'durability') ? options.durability : 'strict';
  const calls = [], operations = [], snapshot = structuredClone(rows);
  let aborted = false, completed = false, pending = 0;
  const native = {
    durability,
    abort() { aborted = true; setImmediate(() => native.onabort?.()); },
    objectStore(store) {
      operations.push(['objectStore', store]);
      return {
        get(key) { operations.push(['get', store, key]); return request(undefined); },
        put(value, key) { operations.push(['put', store, value, key]); return request(key); },
        openCursor(range, direction) { return cursorRequest(range, direction); },
        openKeyCursor(range, direction) { return cursorRequest(range, direction, true); },
        ...(options.fastRecords ? {getAllRecords({query, count, direction}) {
          operations.push(['getAllRecords', store, {query, count, direction}]);
          if (options.recordsThrow) throw options.recordsThrow;
          if (options.recordsError) {
            const req = {};
            schedule(req, () => undefined, options.recordsError);
            return req;
          }
          return request(select(query).slice(0, count).map(row => ({
            key: row.key, primaryKey: row.key, value: row.value
          })));
        }} : {})
      };
    }
  };
  function select(range) {
    if (!range) return snapshot;
    return snapshot.filter(row => (range.lowerOpen ? row.key > range.lower : row.key >= range.lower) &&
      (range.upperOpen ? row.key < range.upper : row.key <= range.upper))
      .sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
  }
  function cursorRequest(range, direction = 'next', keysOnly = false) {
    operations.push([keysOnly ? 'openKeyCursor' : 'openCursor', range, direction]);
    const entries = [...select(range)];
    if (direction === 'prev') entries.reverse();
    let index = 0;
    const cursor = {};
    const next = () => {
      const row = entries[index++];
      return row ? {primaryKey: row.key, ...(keysOnly ? {} : {value: row.value}),
        continue() { schedule(cursor, next); },
        advance(count) { index += count - 1; schedule(cursor, next); }} : null;
    };
    schedule(cursor, next);
    return cursor;
  }
  function schedule(req, value, error) {
    pending++;
    setImmediate(() => {
      pending--;
      if (aborted || completed) return;
      if (error) { req.error = error; req.onerror?.(); }
      else { req.result = value(); req.onsuccess?.(); }
      setImmediate(() => {
        if (!pending && !aborted && !completed) { completed = true; native.oncomplete?.(); }
      });
    });
  }
  function request(value) { const req = {}; schedule(req, () => value); return req; }
  return {
    calls, operations,
    get aborted() { return aborted; },
    db: {transaction(...args) {
      calls.push(args);
      if (args.length === 3 && rejectOptions) throw rejectOptions;
      return native;
    }}
  };
}

test('each critical store requests strict writes, including mixed scopes in either order', async () => {
  for (const store of critical) {
    for (const scope of [[store], ['templates', store], [store, 'templates']]) {
      const e = engine();
      const result = await transact(e.db, scope, 'readwrite', tx => tx.put(store, {evidence: true}, 'receipt'));
      assert.equal(result, 'receipt');
      assert.deepEqual(e.calls, [[scope, 'readwrite', {durability: 'strict'}]]);
      assert.equal(e.aborted, false);
    }
  }
});

test('readonly and noncritical writes retain the original two-argument transaction call', async () => {
  for (const scope of [critical, ...STORE_NAMES.map(store => [store])]) {
    const e = engine({durability: 'default'});
    await transact(e.db, scope, 'readonly', () => 'read');
    assert.deepEqual(e.calls, [[scope, 'readonly']]);
  }
  const scope = STORE_NAMES.filter(store => !critical.includes(store));
  const e = engine({durability: 'default'});
  await transact(e.db, scope, 'readwrite', () => 'ordinary write');
  assert.deepEqual(e.calls, [[scope, 'readwrite']]);
});

test('engine refusal rejects once without retry, work or raw cursor access', async () => {
  for (const name of ['NotSupportedError', 'TypeError', 'QuotaExceededError']) {
    for (const raw of [false, true]) {
      const cause = new DOMException('Options rejected by engine', name);
      const e = engine({rejectOptions: cause});
      let worked = false;
      await assert.rejects(transact(e.db, ['frameworkKV'], 'readwrite', () => { worked = true; }, {raw}),
        error => error.cause === cause && error.code === (name === 'QuotaExceededError' ? 'E_QUOTA' : 'E_SCHEMA'));
      assert.equal(worked, false);
      assert.deepEqual(e.calls, [[['frameworkKV'], 'readwrite', {durability: 'strict'}]]);
      assert.deepEqual(e.operations, []);
    }
  }
});

test('ignored or downgraded strict policy aborts before work or raw cursor access', async () => {
  for (const durability of [undefined, 'default', 'relaxed', null]) {
    for (const raw of [false, true]) {
      const e = engine({durability});
      let worked = false;
      await assert.rejects(transact(e.db, ['runs'], 'readwrite', () => { worked = true; }, {raw}),
        {code: 'E_VERSION'});
      assert.equal(worked, false);
      assert.equal(e.aborted, true);
      assert.equal(e.calls.length, 1);
      assert.deepEqual(e.operations, []);
    }
  }
});

test('strict transaction keeps pumping while asynchronous work waits, then returns its result', async () => {
  const e = engine();
  await transact(e.db, ['results'], 'readwrite', async tx => {
    await new Promise(resolve => setImmediate(() => setImmediate(resolve)));
    return tx.put('results', {value: 42}, 'result');
  }).then(value => assert.equal(value, 'result'));
  assert.ok(e.operations.filter(op => op[0] === 'get' && op[2] === '@storage-keepalive').length > 1);
  assert.equal(e.aborted, false);
});

test('raw readonly backup retains keys and values without invoking work or the keepalive pump', async () => {
  const rows = [{key: ['legacy', 7], value: {unknown: true}}, {key: 12, value: 'old row'}];
  const e = engine({durability: 'default', rows});
  const scope = ['runs', 'frameworkKV'];
  const result = await transact(e.db, scope, 'readonly', () => assert.fail('raw must not invoke work'), {raw: true});
  assert.deepEqual(result, scope.map(name => ({name, records: rows})));
  assert.deepEqual(e.calls, [[scope, 'readonly']]);
  assert.equal(e.operations.some(op => op[0] === 'get'), false);
});

// Native API boundary doubles: record paging is tested independently of product
// callers. Native browser performance and disk durability are not claimed.
function keyRanges(t) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'IDBKeyRange');
  Object.defineProperty(globalThis, 'IDBKeyRange', {configurable: true, value: {
    bound(lower, upper, lowerOpen = false, upperOpen = false) {
      return {lower, upper, lowerOpen, upperOpen};
    }
  }});
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'IDBKeyRange', previous);
    else delete globalThis.IDBKeyRange;
  });
}
const pageRows = () => ['other:z', 'page:03', 'page:01', 'page:04', 'page:02', 'pages:01']
  .map(key => ({key, value: {id: key, nested: {saved: true}}}));
for (const fastRecords of [true, false]) test('entry pages are bounded, ordered and resume by exact key: fast=' + fastRecords, async t => {
  keyRanges(t);
  const rows = pageRows(), e = engine({rows, fastRecords});
  const result = await transact(e.db, ['frameworkKV'], 'readonly', async tx => {
    const first = await tx.scanEntries('frameworkKV', {prefix: 'page:', limit: 2});
    // A queued read in the same native transaction keeps the original snapshot.
    rows.push({key: 'page:025', value: {inserted: true}});
    const second = await tx.scanEntries('frameworkKV', {prefix: 'page:', limit: 2, afterKey: first.at(-1).key});
    const end = await tx.scanEntries('frameworkKV', {prefix: 'page:', limit: 2, afterKey: second.at(-1).key});
    return {first, second, end};
  });
  assert.deepEqual(result, {
    first: ['page:01', 'page:02'].map(key => ({key, value: {id: key, nested: {saved: true}}})),
    second: ['page:03', 'page:04'].map(key => ({key, value: {id: key, nested: {saved: true}}})), end: []
  });
  const reads = e.operations.filter(op => ['getAllRecords', 'openCursor'].includes(op[0]));
  assert.equal(reads.length, 3);
  assert.ok(reads.every(op => op[0] === (fastRecords ? 'getAllRecords' : 'openCursor')));
  if (fastRecords) assert.deepEqual(reads.map(op => op[2]), [
    {query: {lower: 'page:', upper: 'page:\uffff', lowerOpen: false, upperOpen: false}, count: 2, direction: 'next'},
    {query: {lower: 'page:02', upper: 'page:\uffff', lowerOpen: true, upperOpen: false}, count: 2, direction: 'next'},
    {query: {lower: 'page:04', upper: 'page:\uffff', lowerOpen: true, upperOpen: false}, count: 2, direction: 'next'}
  ]);
  assert.equal(e.aborted, false);
});
test('reverse, offset, value-only and key-only scans retain cursor behavior with fast API present', async t => {
  keyRanges(t);
  const e = engine({rows: pageRows(), fastRecords: true});
  await transact(e.db, ['frameworkKV'], 'readonly', async tx => {
    assert.deepEqual((await tx.scanEntries('frameworkKV', {prefix: 'page:', direction: 'prev', limit: 2}))
      .map(row => row.key), ['page:04', 'page:03']);
    assert.deepEqual((await tx.scanEntries('frameworkKV', {prefix: 'page:', offset: 1, limit: 2}))
      .map(row => row.key), ['page:02', 'page:03']);
    assert.deepEqual(await tx.keys('frameworkKV', {prefix: 'page:', limit: 2}), ['page:01', 'page:02']);
    assert.deepEqual(await tx.scan('frameworkKV', {prefix: 'page:', limit: 1}),
      [{id: 'page:01', nested: {saved: true}}]);
  });
  assert.equal(e.operations.some(op => op[0] === 'getAllRecords'), false);
});
for (const errorMode of ['recordsThrow', 'recordsError']) test('record fast-path failure aborts rather than retrying a cursor: ' + errorMode, async t => {
  keyRanges(t);
  const cause = new DOMException('Record read failed', 'UnknownError');
  const e = engine({rows: pageRows(), fastRecords: true, [errorMode]: cause});
  let continued = false;
  await assert.rejects(transact(e.db, ['frameworkKV'], 'readwrite', async tx => {
    await tx.put('frameworkKV', {pending: true}, 'page:pending');
    await tx.scanEntries('frameworkKV', {prefix: 'page:', limit: 2});
    continued = true;
  }), error => error.code === 'E_SCHEMA' && error.cause === cause);
  assert.equal(e.aborted, true);
  assert.equal(continued, false);
  assert.equal(e.operations.filter(op => op[0] === 'getAllRecords').length, 1);
  assert.equal(e.operations.some(op => op[0] === 'openCursor'), false);
});
test('entry scan validation rejects invalid limits and resume keys before any scan', async t => {
  keyRanges(t);
  for (const options of [{limit: 0}, {limit: 1000002}, {afterKey: 'other:01'},
    {afterKey: 'page:\uffff'}, {afterKey: 'page:01', offset: 1}, {afterKey: 'page:01', direction: 'prev'}]) {
    const e = engine({rows: pageRows(), fastRecords: true});
    await assert.rejects(transact(e.db, ['frameworkKV'], 'readonly', tx =>
      tx.scanEntries('frameworkKV', {prefix: 'page:', ...options})), {code: 'E_SCHEMA'});
    assert.equal(e.aborted, true);
    assert.equal(e.operations.some(op => ['openCursor', 'getAllRecords'].includes(op[0])), false);
  }
});
