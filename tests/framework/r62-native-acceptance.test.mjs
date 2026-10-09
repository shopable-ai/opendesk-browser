import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {validateCompletedRun, cli, selectCurrentWorker, validateSearchCounts, parseSearchCount} from './r62-native-acceptance.mjs';

// Evidence-validator fixtures only; these never qualify as native receipts.
function fixture() {
  const target = {windowId: 1, tabId: 2, frameId: 0, documentId: 'doc-a',
    url: 'http://127.0.0.1:43111/demo-form.html', origin: 'http://127.0.0.1:43111'};
  const revision = {scriptId: 'fixture', revision: 1, sourceHash: 'fixture-hash'};
  const run = {tag: 'controller-run', namespace: 'fixture', runId: 'run-a', resultId: 'result-a',
    state: 'completed', workerRetired: true, retirementState: 'released', revision,
    target: {...target, allowedOrigin: target.origin}};
  const result = {tag: 'controller-result', namespace: 'fixture', runId: 'run-a', resultId: 'result-a',
    state: 'completed', revision: {...revision}, outcome: {ok: true}};
  return {snapshot: {run, results: [result]}, expected: {runId: 'run-a', sourceHash: 'fixture-hash', target, namespace: 'fixture'}};
}

test('public run projection may omit namespace while the result matches the bound owner', () => {
  const f = fixture();
  delete f.snapshot.run.namespace;
  assert.equal(validateCompletedRun(f.snapshot, f.expected).resultId, 'result-a');
  f.snapshot.results[0].namespace = 'another-owner';
  assert.throws(() => validateCompletedRun(f.snapshot, f.expected));
});

test('result validation requires an independently bound namespace', () => {
  const f = fixture();
  delete f.expected.namespace;
  assert.throws(() => validateCompletedRun(f.snapshot, f.expected));
});

test('acceptance validator correlates result identity and its own exact revision', () => {
  const f = fixture();
  assert.equal(validateCompletedRun(f.snapshot, f.expected).resultId, 'result-a');
  f.snapshot.results[0].revision.sourceHash = 'another-source';
  assert.throws(() => validateCompletedRun(f.snapshot, f.expected));
});

test('acceptance validator refuses duplicate results and unreleased workers', () => {
  const f = fixture();
  f.snapshot.results.push(structuredClone(f.snapshot.results[0]));
  assert.throws(() => validateCompletedRun(f.snapshot, f.expected));
  f.snapshot.results.pop();
  f.snapshot.run.retirementState = 'pending';
  assert.throws(() => validateCompletedRun(f.snapshot, f.expected));
});

test('acceptance validator refuses changed document, owner namespace and saved revision', () => {
  for (const mutate of [
    f => {f.snapshot.run.target.documentId = 'doc-b';},
    f => {f.snapshot.results[0].namespace = 'another-owner';},
    f => {f.expected.saved = {scriptId: 'fixture', revision: 2};}
  ]) {
    const f = fixture(); mutate(f);
    assert.throws(() => validateCompletedRun(f.snapshot, f.expected));
  }
});

test('an ambiguous side-effect response is retained and never retried', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'r62-cli-validator-'));
  const request = {requestId: 'fixture-unknown', source: {kind: 'draft', sourceUtf8: 'fixture'}};
  let calls = 0;
  try {
    await assert.rejects(cli('/fixture', directory, 'unknown', 'run.start', request, async () => {
      calls++;
      throw Object.assign(new Error('fixture disconnect'), {stdout: '{"error":{"outcome":"OUTCOME_UNKNOWN"}}', stderr: 'fixture error'});
    }), /no replay/);
    assert.equal(calls, 1);
    assert.deepEqual(JSON.parse(await readFile(path.join(directory, 'unknown-request.json'))), request);
    assert.equal(await readFile(path.join(directory, 'unknown-stdout.json'), 'utf8'), '{"error":{"outcome":"OUTCOME_UNKNOWN"}}');
  } finally {await rm(directory, {recursive: true});}
});

test('readonly discovery records a woken worker while rejecting other extensions and ambiguous workers', () => {
  const session = {extensionId: 'fixture', serviceWorker: {targetId: 'suspended', url: 'chrome-extension://fixture/sw.js'}};
  const current = {type: 'service_worker', targetId: 'woken', url: session.serviceWorker.url};
  assert.equal(selectCurrentWorker([current], session), current);
  assert.throws(() => selectCurrentWorker([{...current, url: 'chrome-extension://other/sw.js'}], session));
  assert.throws(() => selectCurrentWorker([current, {...current, targetId: 'ambiguous'}], session));
});

test('each modern execution must add exactly one search and observations must be integer counts', () => {
  assert.deepEqual(validateSearchCounts(4, 5, 6), {before: 4, afterDraft: 5, afterSaved: 6});
  for (const counts of [[4, 6, 7], [4, 5, 7], [4, 4, 5], [4, 5, NaN]])
    assert.throws(() => validateSearchCounts(...counts));
});

test('read-only counter parser matches the actual demo text and rejects partial or unsafe observations', async () => {
  const demo = await readFile(new URL('../../examples/tasks/demo-form.html', import.meta.url), 'utf8');
  const initial = demo.match(/<p id="search-count"[^>]*>([^<]*)<\/p>/)?.[1];
  assert.equal(parseSearchCount(initial), 0);
  assert.equal(parseSearchCount('提交次数：12'), 12);
  for (const text of ['12', '提交次数：', '提交次数：-1', '提交次数：01', '提交次数：1次', '提交次数：1\n', '提交次数：9007199254740992']) {
    assert.throws(() => parseSearchCount(text));
  }
});
