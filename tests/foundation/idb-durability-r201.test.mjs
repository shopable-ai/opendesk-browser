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
  const calls = [], operations = [];
  let aborted = false, completed = false, pending = 0;
  const native = {
    durability,
    abort() { aborted = true; setImmediate(() => native.onabort?.()); },
    objectStore(store) {
      operations.push(['objectStore', store]);
      return {
        get(key) { operations.push(['get', store, key]); return request(undefined); },
        put(value, key) { operations.push(['put', store, value, key]); return request(key); },
        openCursor() {
          operations.push(['openCursor', store]);
          let index = 0;
          const next = () => {
            const row = rows[index++];
            return row ? {primaryKey: row.key, value: row.value, continue() { schedule(cursor, next); }} : null;
          };
          const cursor = {};
          schedule(cursor, next);
          return cursor;
        }
      };
    }
  };
  function schedule(req, value) {
    pending++;
    setImmediate(() => {
      pending--;
      if (aborted || completed) return;
      req.result = value();
      req.onsuccess?.();
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
