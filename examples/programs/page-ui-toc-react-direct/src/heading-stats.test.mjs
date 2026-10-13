import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {summarizeHeadingLevels} from './heading-stats.js';

const sourceURL = 'https://raw.githubusercontent.com/d3/d3-array/v3.2.4/src/max.js';
const expectedHash = '691945a453633d9e204846af8ea4e299821b924f82b15eaf7906aba642979b1d';
const cacheURL = new URL('../.opendesk/remote-cache/' + expectedHash + '.mjs', import.meta.url);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

// Node model/source-contract tests only; not Chrome or a live CDN HTTP test.
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

test('model calls the supplied max implementation with the actual counts', () => {
  const items = [{level:1}, {level:1}, {level:5}];
  const calls = [];
  const viaAdapter = summarizeHeadingLevels(items, values => {
    calls.push(values.slice());
    return Math.max(...values);
  });
  assert.deepEqual(calls, [[2, 0, 0, 0, 1, 0]]);
  assert.deepEqual(viaAdapter, summarizeHeadingLevels(items));
});

test('the default React entry directly declares and actually consumes its HTTPS import', async () => {
  const source = await readFile(new URL('./main.js', import.meta.url), 'utf8');
  assert.ok(source.includes("import max from '" + sourceURL + "';"));
  assert.match(source, /summarizeHeadingLevels\(items, max\)/);
  assert.doesNotMatch(source, /from ['"]\.\/heading-stats-cdn\.js['"]/);
  const statements = source.split('\n').filter(line => !line.trimStart().startsWith('//')).join('\n');
  assert.doesNotMatch(statements, /createElement\(['"]script['"]\)|\bimport\s*\(|\/\/\s*@require\s+https:/);
});

test('checked-in remote lock refers to byte-identical upstream source, not a mock', async () => {
  const lock = JSON.parse(await readFile(new URL('../opendesk.remote-lock.json', import.meta.url), 'utf8'));
  assert.equal(lock.format, 'opendesk.remote-lock.v2');
  assert.equal(Object.keys(lock.modules).length, 235);
  assert.ok(Object.hasOwn(lock.modules, sourceURL));
  const bytes = await readFile(cacheURL);
  assert.deepEqual(lock.modules[sourceURL], {sha256:expectedHash, bytes:502});
  assert.equal(bytes.length, 502);
  assert.equal(sha(bytes), expectedHash);
  assert.equal(createHash('sha1').update(Buffer.concat([
    Buffer.from('blob ' + bytes.length + '\0'), bytes
  ])).digest('hex'), 'ce287368eb4402d359f18ec1c6c81dde0c774cc5');
  const license = await readFile(new URL('../licenses/d3-array-ISC.txt', import.meta.url), 'utf8');
  assert.match(license, /Copyright 2010-2023 Mike Bostock/);
  assert.match(license, /Permission to use, copy, modify/);
});

test('real reviewed D3 code computes the statistics model offline', async () => {
  assert.equal(sha(await readFile(cacheURL)), expectedHash, 'verify before evaluating vendor code');
  const {default:max} = await import(cacheURL.href);
  assert.equal(max([null, undefined, NaN, 4, 2]), 4);
  assert.equal(max([]), undefined);
  assert.equal(max([{n:1}, {n:3}], row => row.n), 3);
  const items = [1, 2, 2, 3, 6, 2].map(level => ({level}));
  assert.deepEqual(summarizeHeadingLevels(items, max), summarizeHeadingLevels(items));
  assert.equal(summarizeHeadingLevels([], max).peak, 1);
});

test('the compatibility adapter uses the same URL while the project keeps its original framework contract', async () => {
  const wrapper = await readFile(new URL('./heading-stats-cdn.js', import.meta.url), 'utf8');
  assert.ok(wrapper.includes("import max from '" + sourceURL + "';"));
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.opendesk.format, 'opendesk.project.v1');
  assert.equal(pkg.opendesk.entryMode, 'component');
  assert.equal(pkg.opendesk.framework, 'react');
  assert.equal(pkg.opendesk.pageRules.world, 'USER_SCRIPT');
  assert.deepEqual(pkg.opendesk.pageRules.matches, [
    'http://127.0.0.1:43111/*',
    'http://192.168.30.8:8000/*'
  ]);
  assert.deepEqual(pkg.opendesk.pageRules.excludeMatches, [
    'http://127.0.0.1:43111/private/*',
    'http://192.168.30.8:8000/private/*'
  ]);
  assert.equal(pkg.dependencies, undefined, 'a locked HTTPS import needs no duplicate npm declaration');
});
