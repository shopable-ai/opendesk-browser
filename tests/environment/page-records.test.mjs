import test from 'node:test';
import assert from 'node:assert/strict';
import {readPageRecords} from '../../src/scripting/user-scripts/page-records.js';

// Transaction API double only; native request/cursor behavior is covered by
// tests/foundation/idb-durability-r201.test.mjs. No browser timing is claimed.
function records(kind, count) {
  return Array.from({length: count}, (_, index) => ({
    key: `page-${kind}:${String(index * 3 + 7).padStart(6, '0')}`,
    value: {tag: `page-${kind}-v1`, id: index, state: 'outcome-unknown'}
  }));
}
function fixture(rows, failAt) {
  const ordered = [...rows].sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
  const calls = [], cause = new Error('scan failed'), tx = {
    async scanEntries(store, options) {
      assert.equal(this, tx, 'every page must use the supplied transaction');
      assert.equal(store, 'frameworkKV');
      assert.deepEqual(Object.keys(options).sort(), ['afterKey', 'limit', 'prefix']);
      const {prefix, afterKey, limit} = options;
      const page = ordered.filter(row => row.key.startsWith(prefix) &&
        (afterKey === undefined || row.key > afterKey)).slice(0, limit);
      calls.push({store, ...options, keys: page.map(row => row.key)});
      if (calls.length === failAt) throw cause;
      return structuredClone(page);
    },
    async all() { assert.fail('a scan cannot fall back to all, including after failure'); }
  };
  return {tx, calls, cause};
}
function assertPages(f, kind, limit, rows) {
  const sizes = [];
  for (let offset = 0; ; offset += limit) {
    sizes.push(Math.min(limit, rows.length - offset));
    if (sizes.at(-1) < limit) break;
  }
  assert.deepEqual(f.calls.map(call => call.keys.length), sizes);
  assert.deepEqual(f.calls.map(call => ({store: call.store, prefix: call.prefix,
    afterKey: call.afterKey, limit: call.limit})), sizes.map((_, index) => ({
    store: 'frameworkKV', prefix: `page-${kind}:`, limit,
    afterKey: index === 0 ? undefined : rows[index * limit - 1].key
  })));
}

for (const count of [0, 4095, 4096, 4097]) {
  test(`execution reads all ${count} rows with 4096-row pages and exact termination`, async () => {
    const rows = records('execution', count), f = fixture([...rows].reverse());
    assert.deepEqual(await readPageRecords(f.tx, 'execution'), rows.map(row => row.value));
    assertPages(f, 'execution', 4096, rows);
  });
}

for (const kind of ['installed', 'cleanup', 'candidate', 'execution-other']) {
  test(`${kind} keeps 256-row pages without a total cap`, async () => {
    const rows = records(kind, 257);
    if (kind === 'installed') rows[255].value.tag = 'page-uninstalled-v1';
    const f = fixture([...rows].reverse());
    assert.deepEqual(await readPageRecords(f.tx, kind), rows.map(row => row.value));
    assertPages(f, kind, 256, rows);
  });
}

test('filtered page tails retain the exact raw key and exclude adjacent prefixes', async () => {
  const rows = records('execution', 4097);
  rows[4].value = null;
  rows[4095].value.tag = 'page-cleanup-v1';
  const neighbors = ['page-execution', 'page-execution-', 'page-execution0:',
    'page-executions:', 'page-installed:'].map(key => ({key, value: {tag: 'page-execution-v1', id: 'foreign'}}));
  const f = fixture([...rows, ...neighbors].reverse());
  const expected = rows.filter((_, index) => index !== 4 && index !== 4095).map(row => row.value);
  assert.deepEqual(await readPageRecords(f.tx, 'execution'), expected);
  assertPages(f, 'execution', 4096, rows);
});

test('a whole filtered-out full page still continues to the next execution receipt', async () => {
  const rows = records('execution', 4097);
  for (const row of rows.slice(0, 4096)) row.value.tag = 'page-candidate-v1';
  const f = fixture(rows);
  assert.deepEqual(await readPageRecords(f.tx, 'execution'), [rows.at(-1).value]);
  assertPages(f, 'execution', 4096, rows);
});

for (const failAt of [1, 2, 3]) {
  test(`scan failure on page ${failAt} rejects without returning partial history or retry`, async () => {
    const f = fixture(records('execution', 8192), failAt);
    let fulfilled = false;
    await assert.rejects(readPageRecords(f.tx, 'execution').then(rows => {
      fulfilled = true;
      return rows;
    }), error => error === f.cause);
    assert.equal(fulfilled, false);
    assert.equal(f.calls.length, failAt);
  });
}

for (const kind of ['execution', 'installed', 'cleanup']) {
  test(`all fallback retains every matching ${kind} tag in original order`, async () => {
    const kept = Array.from({length: 4097}, (_, id) => ({tag: `page-${kind}-v1`, id})).reverse();
    if (kind === 'installed') kept[7].tag = 'page-uninstalled-v1';
    const allRows = [null, {tag: 'wrong'}, ...kept, undefined];
    for (const scanEntries of [undefined, null]) {
      const calls = [], tx = {scanEntries, async all(store) {
        assert.equal(this, tx);
        calls.push(store);
        return allRows;
      }};
      assert.deepEqual(await readPageRecords(tx, kind), kept);
      assert.deepEqual(calls, ['frameworkKV']);
    }
  });
}
