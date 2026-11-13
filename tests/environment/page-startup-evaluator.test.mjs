import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { evaluatePageStartup } from '../../scripts/evaluate-page-startup.mjs';

const enhancements = ['queue', 'navigation', 'prompt-shortcuts'];
function evidence() {
  const value = {
    schemaVersion: 1,
    candidate: { extensionId: 'test-extension', revision: 'b'.repeat(64), swSha256: 'a'.repeat(64) },
    samples: [],
    regressions: { passed: true, command: 'node --test safety.test.mjs' },
  };
  for (const [cohort, count] of [['single', 10], ['three-page', 3]]) {
    for (let i = 0; i < count; i++) {
      for (const enhancement of enhancements) {
        value.samples.push({ cohort, round: cohort === 'single' ? i : 0,
          page: `page-${i}`, documentId: `${cohort}-${i}`, candidateRevision: 'b'.repeat(64),
          enhancement, prerequisiteAtMs: 4000,
          visibleAtMs: 4000 + (enhancement === 'prompt-shortcuts' ? 9000 : cohort === 'single' ? 1000 : 3000),
          visibleCount: 1, usable: true, eligible: true, missing: false });
      }
    }
  }
  return value;
}
function rejects(change, pattern) {
  const value = evidence();
  change(value);
  const result = evaluatePageStartup(value);
  assert.equal(result.pass, false);
  assert.ok(result.failures.length > 0);
  if (pattern) assert.match(result.failures.join('\n'), pattern);
}

test('exact latency boundaries pass; control has no 1s limit; function is pure', () => {
  const value = evidence();
  const before = structuredClone(value);
  const result = evaluatePageStartup(value);
  assert.equal(result.pass, true, result.failures.join('\n'));
  assert.equal(result.metrics.single.queue.count, 10);
  assert.equal(result.metrics.single.queue.p95Ms, 1000);
  assert.equal(result.metrics.single['prompt-shortcuts'].count, 10);
  assert.equal(result.metrics.threePage.rounds, 1);
  assert.deepEqual(value, before);
});
test('negative differences fail without clamping or mutating observations', () => {
  for (const cohort of ['single', 'three-page']) {
    for (const enhancement of enhancements) {
      const value = evidence();
      const sample = value.samples.find(s => s.cohort === cohort && s.enhancement === enhancement);
      sample.visibleAtMs = sample.prerequisiteAtMs;
      assert.equal(evaluatePageStartup(value).pass, true);
      sample.visibleAtMs--;
      const before = structuredClone(value);
      const result = evaluatePageStartup(value);
      assert.equal(result.pass, false);
      assert.match(result.failures.join('\n'), /visibleAtMs must not precede prerequisiteAtMs/);
      assert.deepEqual(value, before);
      if (cohort === 'single') assert.equal(result.metrics.single[enhancement].count, 9);
    }
  }
});
test('nearest-rank P95 allows one outlier out of 20, but rejects two', () => {
  const value = evidence();
  const extra = value.samples.filter(s => s.cohort === 'single').map(s => ({ ...s,
    round: s.round + 10, page: `${s.page}-extra`, documentId: `${s.documentId}-extra` }));
  value.samples.push(...extra);
  value.samples[0].visibleAtMs = 9000;
  assert.equal(evaluatePageStartup(value).pass, true);
  value.samples[3].visibleAtMs = 9000;
  assert.equal(evaluatePageStartup(value).pass, false);
});
test('homepage plus ten conversations passes without counting ineligible navigation', () => {
  const value = evidence();
  for (const enhancement of enhancements) {
    value.samples.push({ ...value.samples.find(s => s.enhancement === enhancement),
      round: 'homepage', page: 'https://chatgpt.com/', documentId: 'homepage-document',
      ...(enhancement === 'navigation' ? { eligible: false, prerequisiteAtMs: null,
        visibleAtMs: null, missing: true, visibleCount: 0, usable: false } : {}) });
  }
  const result = evaluatePageStartup(value);
  assert.equal(result.pass, true, result.failures.join('\n'));
  assert.deepEqual(result.metrics.single.navigation, { count: 10, p95Ms: 1000 });
  assert.equal(result.metrics.single.queue.count, 11);
  assert.equal(result.metrics.single['prompt-shortcuts'].count, 11);
  value.samples = value.samples.filter(s => s.documentId !== 'single-9');
  const insufficient = evaluatePageStartup(value);
  assert.equal(insufficient.pass, false);
  assert.equal(insufficient.metrics.single.navigation.count, 9);
});
test('21s single outlier fails even with twenty good documents and passing P95', () => {
  for (const enhancement of enhancements) {
    const value = evidence();
    const originals = value.samples.filter(s => s.cohort === 'single');
    value.samples.push(...originals.map(s => ({ ...s, round: s.round + 10,
      page: `${s.page}-extra`, documentId: `${s.documentId}-extra` })));
    for (const name of enhancements) {
      value.samples.push({ ...originals.find(s => s.enhancement === name), round: 20,
        page: 'outlier-page', documentId: 'outlier-document',
        ...(name === enhancement ? { visibleAtMs: 25000 } : {}) });
    }
    const result = evaluatePageStartup(value);
    assert.equal(result.pass, false, enhancement);
    assert.match(result.failures.join('\n'), /20000/);
    assert.equal(result.metrics.single.queue.p95Ms, 1000);
    assert.equal(result.metrics.single.navigation.p95Ms, 1000);
  }
});
test('control allows exactly 20s but fails above 20s in either cohort', () => {
  for (const cohort of ['single', 'three-page']) {
    const value = evidence();
    const sample = value.samples.find(s => s.cohort === cohort && s.enhancement === 'prompt-shortcuts');
    sample.visibleAtMs = sample.prerequisiteAtMs + 20000;
    assert.equal(evaluatePageStartup(value).pass, true);
    sample.visibleAtMs++;
    assert.equal(evaluatePageStartup(value).pass, false);
  }
});
test('candidate revision must be 64 hex even when all samples match it', () => {
  for (const revision of ['rev-1', 'a'.repeat(63), 'g'.repeat(64), 'a'.repeat(65)]) {
    rejects(v => { v.candidate.revision = revision;
      v.samples.forEach(s => { s.candidateRevision = revision; }); }, /revision/);
  }
});
test('slow single and three-page samples fail', () => {
  rejects(v => { v.samples[0].visibleAtMs++; }, /P95/);
  rejects(v => { v.samples.find(s => s.cohort === 'three-page').visibleAtMs++; }, /3000/);
});
test('missing, unusable, non-unique visibility and bootstrap errors fail', () => {
  for (const patch of [{ missing: true }, { usable: false }, { visibleCount: 0 },
    { visibleCount: 2 }, { visibleCount: '1' }, { bootstrapError: 'startup exploded' }]) {
    rejects(v => Object.assign(v.samples[0], patch));
  }
  rejects(v => { v.samples[0].eligible = false; v.samples[0].prerequisiteAtMs = null;
    v.samples[0].visibleAtMs = null; v.samples[0].bootstrapError = 'error'; });
});
test('candidate identity and regression evidence are required', () => {
  for (const field of ['extensionId', 'revision', 'swSha256']) {
    rejects(v => { delete v.candidate[field]; });
  }
  rejects(v => { v.candidate.swSha256 = 'not-a-sha'; });
  rejects(v => { v.samples[0].candidateRevision = 'other'; });
  rejects(v => { delete v.samples[0].candidateRevision; });
  rejects(v => { v.regressions.passed = false; });
  rejects(v => { v.regressions.command = ''; });
});
test('ineligible-only and insufficient independent documents cannot pass', () => {
  rejects(v => v.samples.forEach(s => Object.assign(s, {
    eligible: false, prerequisiteAtMs: null, visibleAtMs: null, missing: true,
    visibleCount: 0, usable: false } )));
  rejects(v => { v.samples = v.samples.filter(s => s.documentId !== 'single-9'); });
  rejects(v => { v.samples.filter(s => s.documentId === 'single-9')
    .forEach(s => { s.documentId = 'single-0'; }); });
});
test('ineligible documents are excluded rather than measured as zero', () => {
  const value = evidence();
  for (const enhancement of enhancements) {
    value.samples.push({ ...value.samples[0], round: 100, documentId: 'no-prerequisite',
      enhancement, ...(enhancement === 'prompt-shortcuts' ? {} : {
        eligible: false, prerequisiteAtMs: null, visibleAtMs: null,
        visibleCount: 0, usable: false, missing: true }) });
  }
  const result = evaluatePageStartup(value);
  assert.equal(result.pass, true, result.failures.join('\n'));
  assert.deepEqual(result.metrics.single.queue, { count: 10, p95Ms: 1000 });
  value.samples = value.samples.filter(s => s.documentId !== 'single-9');
  assert.equal(evaluatePageStartup(value).pass, false);
});
test('missing three-page evidence and optional conflicting identity fail', () => {
  rejects(v => { v.samples = v.samples.filter(s => s.cohort !== 'three-page'); });
  rejects(v => { v.samples[0].extensionId = 'other-extension'; });
  rejects(v => { v.samples[0].swSha256 = 'b'.repeat(64); });
  rejects(v => { v.samples = v.samples.filter(s => !(s.cohort === 'three-page'
    && s.documentId === 'three-page-2' && s.enhancement === 'prompt-shortcuts')); });
});
test('duplicate records, including control and ineligible records, fail', () => {
  rejects(v => v.samples.push({ ...v.samples[0] }));
  rejects(v => v.samples.push({ ...v.samples[2] }));
  rejects(v => { const sample = { ...v.samples[0], round: 100, documentId: 'ineligible',
    eligible: false, prerequisiteAtMs: null, visibleAtMs: null };
    v.samples.push(sample, { ...sample }); });
});
test('invalid times and malformed schema fail without throwing', () => {
  for (const invalid of [null, undefined, NaN, Infinity, -1, '4000']) {
    for (const field of ['prerequisiteAtMs', 'visibleAtMs']) {
      rejects(v => { v.samples[0][field] = invalid; });
    }
  }
  rejects(v => { v.samples[0].eligible = false; });
  for (const value of [null, [], {}, { schemaVersion: 2 }, { ...evidence(), samples: [null] }]) {
    assert.equal(evaluatePageStartup(value).pass, false);
  }
});
test('three-page rounds require three distinct pages/documents and both features per page', () => {
  rejects(v => { v.samples = v.samples.filter(s => s.documentId !== 'three-page-2'); });
  rejects(v => { v.samples = v.samples.filter(s => !(s.documentId === 'three-page-2' && s.enhancement === 'queue')); });
  rejects(v => { v.samples.filter(s => s.documentId === 'three-page-2').forEach(s => { s.page = 'page-1'; }); });
  rejects(v => { v.samples.filter(s => s.documentId === 'three-page-2').forEach(s => { s.documentId = 'three-page-1'; }); });
  rejects(v => { v.samples.find(s => s.cohort === 'three-page').eligible = false; });
  rejects(v => { v.samples.filter(s => s.cohort === 'three-page').forEach((s, i) => { s.round = Math.floor(i / 3); }); });
});
test('control must be present, eligible, usable and timed', () => {
  rejects(v => { v.samples = v.samples.filter(s => s.enhancement !== 'prompt-shortcuts'); });
  rejects(v => { v.samples[2].visibleAtMs = null; });
  rejects(v => Object.assign(v.samples[2], { eligible: false, prerequisiteAtMs: null, visibleAtMs: null }));
  rejects(v => { v.samples.push(...enhancements.map(enhancement => ({
    ...v.samples[0], enhancement, round: 100, documentId: 'fully-ineligible',
    eligible: false, prerequisiteAtMs: null, visibleAtMs: null,
    visibleCount: 0, usable: false, missing: true }))); });
});
test('CLI reports pass/fail and clearly handles missing files and invalid JSON', () => {
  const dir = mkdtempSync(join(tmpdir(), 'page-startup-evaluator-'));
  const script = new URL('../../scripts/evaluate-page-startup.mjs', import.meta.url).pathname;
  const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
  try {
    const file = join(dir, 'evidence.json');
    writeFileSync(file, JSON.stringify(evidence()));
    assert.equal(run(file).status, 0);
    assert.match(run(file).stdout, /PASS/);
    const bad = evidence(); bad.regressions.passed = false;
    writeFileSync(file, JSON.stringify(bad));
    assert.equal(run(file).status, 1);
    assert.match(run(file).stdout, /FAIL/);
    assert.equal(run(join(dir, 'absent.json')).status, 1);
    assert.match(run(join(dir, 'absent.json')).stderr, /ENOENT|not found|不存在/);
    writeFileSync(file, '{');
    assert.equal(run(file).status, 1);
    assert.equal(run().status, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
