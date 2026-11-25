import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { evaluateCoexistence } from '../../scripts/evaluate-chatgpt-extension-coexistence.mjs';

const syntheticArtifacts = new WeakMap();
const evaluate = bundle => evaluateCoexistence(bundle, path => JSON.stringify(syntheticArtifacts.get(bundle).get(path)));

function syntheticBundle() {
  const features = ['prompt', 'queue', 'mindmap', 'toc', 'navigation'];
  const installations = Object.fromEntries(features.map(name => [name, { version: '1', revision: '1', entry: 'test',
    programId: 'test.' + name, sourceHash: 'c'.repeat(64), manifestHash: 'd'.repeat(64),
  }]));
  const token = 'a'.repeat(32);
  const pkg = { ...installations.navigation, revision: 1 };
  const packageSha256 = createHash('sha256').update(JSON.stringify(pkg)).digest('hex');
  installations.navigation.packageSha256 = packageSha256;
  const fixture = { testOnly: true, token, delayMs: 2000, packageSha256, revision: 1, version: '1',
    sourceSha256: installations.navigation.sourceHash };
  const identity = { browserVersion: 'test', chromiumVersion: 'test', extensionId: 'b'.repeat(32),
    loadPath: '/fixtures/dist/development', build: 'test', mode: 'test', installations };
  const fingerprint = createHash('sha256').update(JSON.stringify(identity)).digest('hex');
  const record = { candidate: fingerprint, artifact: 'synthetic.txt' };
  const artifacts = new Map([['fixture.json', fixture], ['navigation.json', pkg], ['identity.json', structuredClone(identity)]]);
  const ui = Object.fromEntries([
    'direct-and-refresh', 'mindmap-toc', 'navigation-toc', 'prompt-draft', 'queue-once',
    'queue-unknown', 'ime', 'wide-and-narrow', 'streaming', 'spa-return', 'two-tabs',
    'disable-and-restore', 'dynamic-failure', 'userscripts-off', 'site-access-revoked',
    'permissions-restored', 'offsite', 'iframe',
  ].map(id => [id, { ...record, status: 'pass' }]));
  const samples = [];
  const viewport = [1342, 742];
  for (let i = 0; i < 20; i++) {
    for (const group of ['all', 'slow', ...features.map(name => 'single:' + name)]) {
      const names = group.startsWith('single:') ? [group.slice(7)] : features;
      const points = Object.fromEntries(names.map(name => [name, {
        dependencyMs: name === 'prompt' ? 1000 : 4000,
        mountMs: name === 'prompt' ? 1200 : group === 'slow' && name === 'navigation' ? 6950 : 4980,
        readyMs: name === 'prompt' ? 1250 : group === 'slow' && name === 'navigation' ? 7000 : 5000,
        usable: true,
        instances: 1,
        maxInstances: 1,
      }]));
      const document = group + '-' + i;
      const sample = { group, document, candidate: fingerprint, points, tabId: 1,
        timeOrigin: 1795535200000 + samples.length * 20000, captureArtifact: document + '-probe.json' };
      artifacts.set(sample.captureArtifact, { group, timeOrigin: sample.timeOrigin, viewport, navigationType: 'reload',
        hidden: false, stopped: true, sampler: { nowMs: 15001, startedMs: 1, ticks: 280 },
        points: Object.fromEntries(features.map(name => [name, points[name] ?? {
          maxInstances: 0, instances: 0, mountMs: null, readyMs: null, usable: false,
        }])),
      });
      samples.push(sample);
      const dynamic = names.filter(name => ['mindmap', 'toc', 'navigation'].includes(name));
      if (!dynamic.length) continue;
      sample.receiptArtifact = sample.document + '.json';
      const receipt = (name, acquired, dispatched, finished, resultText = '{}') => {
        const { programId, sourceHash, manifestHash } = installations[name];
        return { programId, sourceHash, manifestHash, revision: 1, source: 'page_auto', state: 'completed', effectConfirmed: true,
          tabId: sample.tabId, documentId: sample.document, dispatchedAt: sample.timeOrigin + dispatched,
          finishedAt: sample.timeOrigin + finished, result: { tabId: sample.tabId, documentId: sample.document, sourceHash,
            startupTimings: { schedulerClockOrigin: sample.timeOrigin - 2000, schedulerQueuedAtMs: 3400,
              schedulerReadyAtMs: 5000, schedulerLeaseAcquiredAtMs: 2000 + acquired }, resultText,
          },
        };
      };
      const executions = Object.fromEntries(dynamic.map(name => [name, name === 'mindmap'
        ? receipt(name, 4600, 4650, 4800)
        : receipt(name, group === 'slow' || name === 'navigation' ? 4860 : 4600, 4950, 5050)]));
      if (group === 'slow') executions.navigation = receipt('navigation', 4600, 4800, 7100,
        JSON.stringify({ coexistenceDelay: { token, timeOrigin: sample.timeOrigin, startedMs: 4900, endedMs: 6900 } }));
      artifacts.set(sample.receiptArtifact, { executions });
    }
  }
  const bundle = {
    schemaVersion: 1,
    candidate: { ...identity, fingerprint, artifact: 'identity.json' },
    measurement: { artifact: record.artifact, viewport, samples },
    slowTarget: 'navigation',
    slowFixture: { ...record, artifact: 'fixture.json', packageArtifact: 'navigation.json' },
    trace: { ...record, reviewed: true, attributedTasksAtLeast50Ms: 0 },
    ui,
    expert: { ...record, reviewer: 'Reviewer', implementer: 'Author', p0: 0, p1: 0,
      scores: { performance: 96, ui: 95, permission: 95, reliability: 95 } },
  };
  syntheticArtifacts.set(bundle, artifacts);
  return bundle;
}

test('uses a strict weighted score, and requires completed independent review', () => {
  const bundle = syntheticBundle();
  assert.equal(evaluate(bundle).pass, true);
  assert.equal(evaluate(bundle).metrics.expertScore, 95.3);
  bundle.expert.scores.performance = 95;
  assert.match(evaluate(bundle).failures.join('\n'), /strictly above 95/);
  bundle.expert.scores.performance = 100;
  bundle.expert.scores.permission = 94;
  bundle.expert.reviewer = ' author ';
  assert.match(evaluate(bundle).failures.join('\n'), /independent candidate review/);
  assert.match(evaluate(bundle).failures.join('\n'), /permission: expert score/);
});

test('ties the evaluation to the captured build, load path and five installations', () => {
  const bundle = syntheticBundle();
  const check = () => evaluate(bundle).failures.join('\n');
  bundle.candidate.installations.prompt.revision = 'different';
  assert.match(check(), /Candidate fingerprint or declared identity does not match/);
  bundle.candidate.installations.prompt.revision = '1';
  bundle.candidate.loadPath += '-other';
  assert.match(check(), /Candidate fingerprint or declared identity does not match/);
  bundle.candidate.loadPath = '/fixtures/dist/development';
  assert.equal(evaluate(bundle).pass, true);
  const captured = syntheticArtifacts.get(bundle).get(bundle.candidate.artifact);
  captured.observation = 'identity record changed after fingerprinting';
  assert.match(check(), /Candidate fingerprint or declared identity does not match/);
});

test('allows one slower sample in nearest-rank P95 and rejects collateral delay beyond budget', () => {
  const bundle = syntheticBundle();
  const slow = bundle.measurement.samples.filter(row => row.group === 'slow');
  slow[0].points.toc.readyMs += 301;
  slow[1].points.toc.readyMs += 300;
  assert.equal(evaluate(bundle).pass, true);
  slow[1].points.toc.readyMs++;
  assert.match(evaluate(bundle).failures.join('\n'), /toc: P95 interference/);
});

test('a tail failure early in the run or a missing UI fails even if other measurements are fast', () => {
  const bundle = syntheticBundle();
  const all = bundle.measurement.samples.filter(row => row.group === 'all');
  all[4].points.navigation.readyMs = 6501;
  assert.equal(evaluate(bundle).metrics.allReady.p95Ms, 5000);
  assert.match(evaluate(bundle).failures.join('\n'), /first-five maximum/);
  all[4].points.navigation.usable = false;
  assert.equal(evaluate(bundle).metrics.notReady.all, 1);
  assert.match(evaluate(bundle).failures.join('\n'), /requires at least 20 valid documents/);
});

test('does not release a candidate with unverified permissions or missing trace attribution', () => {
  const bundle = syntheticBundle();
  bundle.ui['site-access-revoked'].candidate = 'a'.repeat(64);
  bundle.ui['userscripts-off'].status = 'not-tested';
  bundle.trace.reviewed = false;
  const result = evaluate(bundle);
  assert.equal(result.pass, false);
  for (const reason of [/userscripts-off/, /site-access-revoked/, /Trace missing/]) {
    assert.match(result.failures.join('\n'), reason);
  }
});

test('attributes startup phases to the current automatic execution in a normal refresh', () => {
  const bundle = syntheticBundle();
  const sample = bundle.measurement.samples.find(row => row.group === 'all');
  const toc = syntheticArtifacts.get(bundle).get(sample.receiptArtifact).executions.toc;
  Object.assign(toc.result.startupTimings, {
    worldAllocateLedgerDocumentQueries: 1036, worldAllocateLedgerDocumentsMs: 349.6,
    worldReserveLedgerDocumentQueries: 0, worldReserveLedgerDocumentsMs: 1.5,
  });
  const { groups } = evaluate(bundle).metrics;
  assert.equal(groups.all.toc.dependency.medianMs, 4000);
  assert.equal(groups.all.toc.pageStartup.preparationMs.medianMs, 1600);
  assert.equal(groups.all.toc.pageStartup.schedulerWaitMs.medianMs, 1600);
  assert.equal(groups.all.toc.pageStartup.dispatchToMountMs.medianMs, 30);
  assert.equal(groups.all.toc.afterMount.medianMs, 20);
  assert.deepEqual(groups.all.toc.pageLedger.allocation.documentsQueried, { count: 1, median: 1036, p95: 1036, max: 1036 });
  assert.equal(groups.all.toc.pageLedger.allocation.elapsed.medianMs, 349.6);
  assert.equal(groups.all.toc.pageLedger.reserve.documentsQueried.median, 0);
  assert.equal(groups.all.navigation.pageLedger.allocation.documentsQueried, null, 'missing telemetry is not zero work');
  assert.equal(groups.all.queue.pageStartup, undefined, 'fixed entry does not require Page Authority');
  toc.documentId = 'another-document';
  assert.match(evaluate(bundle).failures.join('\n'), /toc has no matching automatic Page execution/);
  toc.documentId = sample.document;
  sample.points.toc.mountMs = 4930;
  assert.match(evaluate(bundle).failures.join('\n'), /toc has no matching automatic Page execution/);
});

test('slow rows need a timed delay and actual sibling progress on the same document', () => {
  const changes = [
    (runs, sample) => { runs.navigation.finishedAt = sample.timeOrigin + 6800; },
    (runs, sample) => { runs.toc.dispatchedAt = sample.timeOrigin + 7000; runs.toc.finishedAt = sample.timeOrigin + 7100; },
    runs => { runs.toc.documentId = 'old-document'; },
    runs => { runs.toc.result.tabId = 2; },
    runs => { runs.toc.manifestHash = 'a'.repeat(64); },
    runs => { runs.toc.source = 'manual'; },
    runs => { runs.navigation.result.resultText = runs.navigation.result.resultText.replace('6900', '6899'); },
    (runs, sample) => { sample.points.navigation.mountMs = 6899; },
  ];
  for (const change of changes) {
    const bundle = syntheticBundle();
    const sample = bundle.measurement.samples.find(row => row.group === 'slow');
    change(syntheticArtifacts.get(bundle).get(sample.receiptArtifact).executions, sample);
    Object.assign(sample, { injectedDelayMs: 2000, otherDynamicSlotServed: true });
    const result = evaluate(bundle);
    assert.equal(result.pass, false);
    assert.match(result.failures.join('\n'), /no verified 2 s delay/);
    assert.match(result.failures.join('\n'), /slow: requires at least 20 valid documents/);
  }
});

test('slow receipts cannot be used with a different installed package', () => {
  const bundle = syntheticBundle();
  syntheticArtifacts.get(bundle).get('navigation.json').title = 'Different package';
  assert.match(evaluate(bundle).failures.join('\n'), /package and metadata do not match/);
});

test('rejects three overlapping dynamic parents even when the slow wait and UI timings pass', () => {
  const bundle = syntheticBundle();
  const sample = bundle.measurement.samples.find(row => row.group === 'slow');
  const { executions } = syntheticArtifacts.get(bundle).get(sample.receiptArtifact);
  executions.toc.result.startupTimings.schedulerLeaseAcquiredAtMs = 6700; // 4700 ms after navigation.
  const result = evaluate(bundle);
  assert.match(result.failures.join('\n'), /more than two dynamic parent invocations overlapped/);
  assert.doesNotMatch(result.failures.join('\n'), /no verified 2 s delay/);
});

test('requires the full foreground window, matching original observations and no unwanted controls', () => {
  const bundle = syntheticBundle();
  const records = syntheticArtifacts.get(bundle);
  const sample = bundle.measurement.samples.find(row => row.group === 'single:prompt');
  const raw = records.get(sample.captureArtifact);
  raw.sampler.nowMs = 2500;
  assert.match(evaluate(bundle).failures.join('\n'), /raw foreground refresh capture/);
  raw.sampler.nowMs = 15001;
  raw.points.navigation.maxInstances = 1;
  assert.match(evaluate(bundle).failures.join('\n'), /navigation: unexpected UI/);
  raw.points.navigation.maxInstances = 0;
  raw.points.prompt = { ...raw.points.prompt, maxInstances: 2 };
  assert.match(evaluate(bundle).failures.join('\n'), /prompt: duplicate or missing control/);
  raw.points.prompt = { ...raw.points.prompt, maxInstances: 1, readyMs: 1200 };
  assert.match(evaluate(bundle).failures.join('\n'), /prompt: reported timings do not match/);
});

test('rejects reordering observations and collecting an entire comparison after its control', () => {
  const bundle = syntheticBundle();
  const samples = bundle.measurement.samples;
  [samples[0], samples[1]] = [samples[1], samples[0]];
  assert.match(evaluate(bundle).failures.join('\n'), /must be in capture order/);
  bundle.measurement.samples = [...samples.filter(s => s.group !== 'slow'), ...samples.filter(s => s.group === 'slow')];
  assert.match(evaluate(bundle).failures.join('\n'), /slow: samples must be interleaved/);
});
