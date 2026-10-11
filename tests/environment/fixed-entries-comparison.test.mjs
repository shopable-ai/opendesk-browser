import test from 'node:test';
import assert from 'node:assert/strict';
import {compareFixedEntries} from '../../scripts/compare-fixed-entries.mjs';

const report = entries => ({
  kind: 'physical-verified-fixed-entry-budget', mode: 'production',
  fixedEntryCount: entries.length,
  totalFixedJsBytes: entries.reduce((sum, row) => sum + row.bytes, 0),
  entries: entries.map(row => ({budgetBytes: 1000, remainingBytes: 1000 - row.bytes, ...row}))
});
const entry = (path, bytes, sha256 = String(bytes).padStart(64, '0')) => ({path, bytes, sha256});

test('comparison charges all added bytes and retains removed entries when build contracts differ', () => {
  const before = report([entry('sw.js', 100), entry('retired.js', 40)]);
  const after = report([entry('sw.js', 80), entry('knowledge/knowledge-host.js', 75)]);
  const result = compareFixedEntries(before, after);
  assert.deepEqual(result.addedEntries, ['knowledge/knowledge-host.js']);
  assert.deepEqual(result.removedEntries, ['retired.js']);
  assert.equal(result.totalFixedJsSaved, -15, 'a shared-entry saving must not hide new feature bytes');
  assert.equal(result.rows.reduce((sum, row) => sum + row.saved, 0), -15);
  const added = result.rows.find(row => row.change === 'added');
  assert.equal(added.before, 0); assert.equal(added.after, 75); assert.equal(added.beforeBudget, null);
  const removed = result.rows.find(row => row.change === 'removed');
  assert.equal(removed.before, 40); assert.equal(removed.after, 0); assert.equal(removed.remaining, null);
});

test('equal byte counts do not disguise a changed file and each build keeps its own budget', () => {
  const before = report([entry('sw.js', 100, 'a'.repeat(64))]);
  const after = report([entry('sw.js', 100, 'b'.repeat(64))]);
  after.entries[0].budgetBytes = 800; after.entries[0].remainingBytes = 700;
  const result = compareFixedEntries(before, after);
  assert.equal(result.rows[0].change, 'modified');
  assert.equal(result.rows[0].saved, 0);
  assert.equal(result.rows[0].beforeBudget, 1000);
  assert.equal(result.rows[0].afterBudget, 800);
  assert.equal(result.rows[0].remaining, 700);
});

test('missing, duplicated, over-budget or undercounted evidence cannot produce a comparison', () => {
  const good = report([entry('sw.js', 100)]);
  assert.throws(() => compareFixedEntries({...good, mode: 'development'}, good), /verified production/);
  assert.throws(() => compareFixedEntries(report([entry('sw.js', 100), entry('sw.js', 100)]), good), /duplicate/);
  const overBudget = report([entry('sw.js', 1001)]);
  assert.throws(() => compareFixedEntries(good, overBudget), /over-budget/);
  assert.throws(() => compareFixedEntries({...good, totalFixedJsBytes: 99}, good), /total/);
  assert.throws(() => compareFixedEntries({...good, fixedEntryCount: 2}, good), /verified production/);
});
