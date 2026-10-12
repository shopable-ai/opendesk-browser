import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeHeadingLevels} from './heading-stats.js';

test('heading level chart counts H1-H6 without modifying source items', () => {
  const items = [1, 2, 2, 3, 6, 2].map(level => ({level}));
  const before = structuredClone(items);
  const stats = summarizeHeadingLevels(items);
  assert.equal(stats.total, 6);
  assert.equal(stats.peak, 3);
  assert.deepEqual(stats.levels.map(row => row.count), [1, 3, 1, 0, 0, 1]);
  assert.deepEqual(stats.levels.map(row => row.percent), [33, 100, 33, 0, 0, 33]);
  assert.deepEqual(items, before);
});

test('empty chart and invalid headings have a valid accessible scale', () => {
  const stats = summarizeHeadingLevels([{level:0}, {level:7}, {level:'2'}]);
  assert.equal(stats.total, 0);
  assert.equal(stats.peak, 1);
  assert.ok(stats.levels.every(row => row.count === 0 && row.percent === 0));
  assert.equal(summarizeHeadingLevels([]).total, 0);
});

test('pinned D3 max adapter produces the same model as the offline fallback', () => {
  const items = [{level:1}, {level:1}, {level:5}];
  const calls = [];
  const viaRemote = summarizeHeadingLevels(items, values => {
    calls.push(values.slice());
    return Math.max(...values);
  });
  assert.deepEqual(calls, [[2, 0, 0, 0, 1, 0]]);
  assert.deepEqual(viaRemote, summarizeHeadingLevels(items));
});
