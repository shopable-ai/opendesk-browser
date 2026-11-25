import { createHash } from 'node:crypto';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const budgets = { prompt: 600, queue: 1000, mindmap: 1500, toc: 2000, navigation: 2000 };
const features = Object.keys(budgets);
const dynamic = ['mindmap', 'toc', 'navigation'];
const cases = [
  'direct-and-refresh', 'mindmap-toc', 'navigation-toc', 'prompt-draft',
  'queue-once', 'queue-unknown', 'ime', 'wide-and-narrow', 'streaming',
  'spa-return', 'two-tabs', 'disable-and-restore', 'dynamic-failure',
  'userscripts-off', 'site-access-revoked', 'permissions-restored', 'offsite', 'iframe',
];
const weights = { performance: 30, ui: 30, permission: 25, reliability: 15 };
const identityFields = ['browserVersion', 'chromiumVersion', 'extensionId', 'loadPath', 'build', 'mode'];
const ledgerPhases = { allocation: 'worldAllocateLedger', reserve: 'worldReserveLedger' };
const text = value => typeof value === 'string' && value.trim().length > 0;
const time = value => Number.isFinite(value) && value >= 0;
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const viewport = value => Array.isArray(value) && value.length === 2 && value.every(n => Number.isSafeInteger(n) && n > 0);

function readProbe(raw, sample, expected, size) {
  if (!raw || raw.group !== sample.group || raw.timeOrigin !== sample.timeOrigin || raw.navigationType !== 'reload'
      || raw.hidden !== false || raw.stopped !== true || !viewport(raw.viewport) || !viewport(size)
      || !raw.viewport.every((n, i) => n === size[i]) || !(raw.sampler?.nowMs >= 15000)
      || !time(raw.sampler?.startedMs) || !Number.isSafeInteger(raw.sampler?.ticks) || raw.sampler.ticks < 2) {
    return 'missing or incompatible raw foreground refresh capture';
  }
  for (const name of features) {
    const point = raw.points?.[name];
    if (expected.includes(name)) {
      if (point?.maxInstances !== 1 || point.instances !== 1) return name + ': duplicate or missing control in the raw observation window';
      if (['dependencyMs', 'mountMs', 'readyMs', 'usable', 'instances'].some(key => point[key] !== sample.points[name][key])) {
        return name + ': reported timings do not match the captured timings';
      }
    } else if (!point || point.maxInstances !== 0 || point.instances !== 0 || point.mountMs !== null
               || point.readyMs !== null || point.usable !== false) {
      return name + ': unexpected UI in the single-feature refresh';
    }
  }
  return null;
}

function pageExecution(receipt, installation, sample, point) {
  if (!installation || receipt?.source !== 'page_auto' || receipt.state !== 'completed' || receipt.effectConfirmed !== true
      || receipt.programId !== installation.programId || String(receipt.revision) !== installation.revision
      || receipt.sourceHash !== installation.sourceHash || receipt.manifestHash !== installation.manifestHash
      || !Number.isSafeInteger(sample.tabId) || sample.tabId < 0 || receipt.tabId !== sample.tabId
      || receipt.documentId !== sample.document || receipt.result?.tabId !== sample.tabId
      || receipt.result?.documentId !== sample.document || receipt.result?.sourceHash !== receipt.sourceHash) return null;
  const timings = receipt.result.startupTimings ?? {};
  const { schedulerClockOrigin, schedulerQueuedAtMs, schedulerReadyAtMs,
    schedulerLeaseAcquiredAtMs } = timings;
  const { dispatchedAt, finishedAt } = receipt;
  if (![schedulerClockOrigin, schedulerQueuedAtMs, schedulerReadyAtMs, schedulerLeaseAcquiredAtMs,
    dispatchedAt, finishedAt, sample.timeOrigin].every(time)) return null;
  const queued = schedulerClockOrigin + schedulerQueuedAtMs;
  const leaseStart = schedulerClockOrigin + schedulerLeaseAcquiredAtMs;
  const mounted = sample.timeOrigin + point.mountMs;
  // Persistent receipt timestamps are integer wall-clock milliseconds.
  if (queued < sample.timeOrigin || schedulerQueuedAtMs > schedulerReadyAtMs
      || schedulerReadyAtMs > schedulerLeaseAcquiredAtMs || Math.floor(leaseStart) > dispatchedAt
      || dispatchedAt > finishedAt || dispatchedAt > mounted) return null;
  return { leaseStart, dispatchedAt, finishedAt, resultText: receipt.result.resultText, timings, phases: {
    navigationToRequestMs: queued - sample.timeOrigin,
    preparationMs: schedulerReadyAtMs - schedulerQueuedAtMs,
    schedulerWaitMs: schedulerLeaseAcquiredAtMs - schedulerReadyAtMs,
    leaseToDispatchMs: Math.max(0, dispatchedAt - leaseStart),
    dispatchToMountMs: mounted - dispatchedAt,
  } };
}

function evidenceOfConcurrentService(executions, sample, target, fixture) {
  const window = executions?.[target];
  if (!window || !fixture || !time(sample.timeOrigin)) return false;
  let delay;
  try { delay = JSON.parse(window.resultText)?.coexistenceDelay; }
  catch { return false; }
  if (delay?.token !== fixture.token || delay.timeOrigin !== sample.timeOrigin
      || !time(delay.startedMs) || !time(delay.endedMs) || delay.endedMs - delay.startedMs < fixture.delayMs
      || delay.endedMs > sample.points[target].mountMs) return false;
  const start = delay.timeOrigin + delay.startedMs;
  const end = delay.timeOrigin + delay.endedMs;
  if (window.leaseStart > start || window.dispatchedAt > start || window.finishedAt < Math.floor(end)) return false;
  // A sibling must make observable progress while the slow call is waiting.
  // A visible UI left by an earlier execution, or two pending calls, is insufficient.
  return dynamic.some(name => {
    if (name === target) return false;
    const sibling = executions[name];
    return sibling && [sibling.dispatchedAt, sibling.finishedAt].some(at => at > start && at < end);
  });
}

function observedParentOverlap(executions) {
  const intervals = Object.values(executions).filter(Boolean);
  // The stored completion timestamp precedes scheduler release. These
  // intervals can prove a violation, but they can undercount actual leases.
  return Math.max(0, ...intervals.map(({ leaseStart }) => intervals.filter(other =>
    other.leaseStart <= leaseStart && leaseStart < other.finishedAt).length));
}

function statistics(values) {
  const n = values.length;
  if (!n) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return { count: n, medianMs: (sorted[(n - 1) >> 1] + sorted[n >> 1]) / 2,
    p95Ms: sorted[Math.ceil(n * 0.95) - 1], maxMs: sorted.at(-1) };
}

function ledgerStatistics(rows, name) {
  return Object.fromEntries(Object.entries(ledgerPhases).map(([key, prefix]) => {
    const field = suffix => rows.map(row => row[name].timings?.[prefix + suffix]);
    const counts = statistics(field('DocumentQueries').filter(n => Number.isSafeInteger(n) && n >= 0));
    const elapsed = statistics(field('DocumentsMs').filter(time));
    return [key, { documentsQueried: counts && { count: counts.count, median: counts.medianMs,
      p95: counts.p95Ms, max: counts.maxMs }, elapsed }];
  }));
}

export function evaluateCoexistence(evidence, readArtifact = () => { throw new Error('No raw artifact reader'); }) {
  const failures = [];
  const references = new Set();
  function reference(value, label) {
    if (text(value)) references.add(value);
    else failures.push(label + ": missing evidence artifact");
  }
  const { candidate = {}, measurement = {}, slowTarget, trace, ui, expert } = evidence ?? {};
  const sameCandidate = entry => hash(candidate?.fingerprint) && entry?.candidate === candidate.fingerprint;
  if (evidence?.schemaVersion !== 1 || !hash(candidate?.fingerprint)
      || !identityFields.every(key => text(candidate?.[key]))
      || !/^[a-p]{32}$/.test(candidate?.extensionId ?? '') || !isAbsolute(candidate?.loadPath ?? '')) {
    failures.push('Missing schemaVersion 1 or verified browser/build identity');
  }
  for (const name of features) {
    const installation = candidate?.installations?.[name];
    if (!['version', 'revision', 'entry'].every(key => text(installation?.[key]))) failures.push(name + ": missing verified installation identity");
    if (dynamic.includes(name) && (!text(installation?.programId) || !hash(installation?.sourceHash) || !hash(installation?.manifestHash))) {
      failures.push(name + ': missing installed Page receipt identity');
    }
  }
  reference(candidate?.artifact, 'candidate');
  try {
    const bytes = readArtifact(candidate?.artifact);
    const observed = JSON.parse(bytes);
    if (sha256(bytes) !== candidate.fingerprint
        || identityFields.some(key => observed?.[key] !== candidate[key])
        || !isDeepStrictEqual(observed?.installations, candidate.installations)) throw new Error();
  } catch {
    failures.push('Candidate fingerprint or declared identity does not match the captured browser and installation record');
  }
  reference(measurement?.artifact, 'measurement conditions and raw capture');
  if (!dynamic.includes(slowTarget)) failures.push('slowTarget must be a dynamic feature');
  const slowFixture = evidence?.slowFixture;
  reference(slowFixture?.artifact, 'slow fixture');
  reference(slowFixture?.packageArtifact, 'slow fixture package');
  let fixture;
  try {
    const stored = JSON.parse(readArtifact(slowFixture?.artifact));
    const bytes = readArtifact(slowFixture?.packageArtifact);
    const pkg = JSON.parse(bytes);
    const installed = candidate?.installations?.[slowTarget];
    if (!sameCandidate(slowFixture) || stored.testOnly !== true || !/^[a-f0-9]{32}$/.test(stored.token ?? '')
        || stored.delayMs !== 2000 || !hash(stored.packageSha256) || sha256(bytes) !== stored.packageSha256
        || installed?.packageSha256 !== stored.packageSha256 || pkg.programId !== installed.programId
        || pkg.version !== installed.version || pkg.version !== stored.version
        || String(pkg.revision) !== installed.revision || pkg.revision !== stored.revision
        || pkg.sourceHash !== installed.sourceHash || pkg.sourceHash !== stored.sourceSha256) throw new Error();
    fixture = stored;
  } catch {
    failures.push('Slow fixture package and metadata do not match the installed candidate');
  }

  const groups = ['all', 'slow', ...features.map(name => 'single:' + name)];
  const expected = group => group.startsWith('single:') ? [group.slice(7)] : features;
  const runs = new Map(groups.map(group => [group, []]));
  const notReady = Object.fromEntries(groups.map(group => [group, 0]));
  const documents = new Set();
  let lastOrigin = 0, tabId;
  const samples = measurement?.samples;
  for (const [i, sample] of (Array.isArray(samples) ? samples : []).entries()) {
    const label = 'sample ' + (i + 1);
    const group = sample?.group;
    const document = sample?.document;
    if (!runs.has(group) || !text(document) || documents.has(document) || !sameCandidate(sample)) {
      failures.push(label + ': unknown group, duplicate/missing document, or wrong candidate');
      continue;
    }
    documents.add(document);
    if (!Number.isSafeInteger(sample.tabId) || sample.tabId < 0 || (tabId !== undefined && sample.tabId !== tabId)
        || !time(sample.timeOrigin) || sample.timeOrigin <= lastOrigin) {
      failures.push(label + ': refresh samples must be in capture order on the same tab');
      continue;
    }
    tabId = sample.tabId;
    lastOrigin = sample.timeOrigin;
    const names = expected(group);
    const points = sample.points ?? {};
    if (Object.keys(points).length !== names.length || names.some(name => {
      const point = points[name];
      return !time(point?.dependencyMs) || !time(point?.mountMs) || !time(point?.readyMs)
        || point.readyMs > 15000 || point.readyMs < Math.max(point.dependencyMs, point.mountMs)
        || point.usable !== true || point.instances !== 1;
    })) {
      notReady[group]++;
      failures.push(label + ': expected UI missing, not operable, duplicated, or invalid timing');
      continue;
    }
    reference(sample.captureArtifact, label + ' raw refresh probe');
    let capture;
    try {
      capture = JSON.parse(readArtifact(sample.captureArtifact));
    } catch { /* Missing or unreadable raw evidence. */ }
    const captureFailure = readProbe(capture, sample, names, measurement.viewport);
    if (captureFailure) {
      notReady[group]++;
      failures.push(label + ': ' + captureFailure);
      continue;
    }
    const pageNames = names.filter(name => dynamic.includes(name));
    const executions = {};
    if (pageNames.length) {
      reference(sample.receiptArtifact, label + ' Page executions');
      let raw;
      try {
        raw = JSON.parse(readArtifact(sample.receiptArtifact));
      } catch { /* Missing or unreadable raw evidence. */ }
      for (const name of pageNames) {
        executions[name] = pageExecution(raw?.executions?.[name], candidate.installations?.[name], sample, points[name]);
        if (!executions[name]) failures.push(label + ': ' + name + ' has no matching automatic Page execution and startup timing');
      }
    }
    const slowVerified = group !== 'slow' || evidenceOfConcurrentService(executions, sample, slowTarget, fixture);
    if (!slowVerified) {
      failures.push(label + ': no verified 2 s delay inside the active lease with other-slot service');
    }
    const overlap = observedParentOverlap(executions);
    if (overlap > 2) failures.push(label + ': more than two dynamic parent invocations overlapped');
    if (!slowVerified || overlap > 2 || pageNames.some(name => !executions[name])) continue;
    runs.get(group).push(Object.fromEntries(names.map(name => [name, {
      ...points[name], phases: executions[name]?.phases, timings: executions[name]?.timings,
    }])));
  }
  const sampledSpan = new Map();
  if (Array.isArray(samples)) for (const [index, sample] of samples.entries()) {
    if (!runs.has(sample?.group)) continue;
    const span = sampledSpan.get(sample.group);
    if (span) span.last = index;
    else sampledSpan.set(sample.group, { first: index, last: index });
  }
  const baseline = sampledSpan.get('all');
  for (const [group, span] of sampledSpan) {
    if (group !== 'all' && (!baseline || span.first >= baseline.last || span.last <= baseline.first)) {
      failures.push(group + ': samples must be interleaved with the all-feature control');
    }
  }

  const metrics = { groups: {}, notReady, firstReady: null, allReady: null, firstFiveMaxMs: null, interference: {}, expertScore: null };
  for (const [group, rows] of runs) {
    if (rows.length < 20) failures.push(group + ': requires at least 20 valid documents');
    metrics.groups[group] = Object.fromEntries(expected(group).map(name => [name, {
      fromRefresh: statistics(rows.map(row => row[name].readyMs)),
      afterDependency: statistics(rows.map(row => row[name].readyMs - row[name].dependencyMs)),
      dependency: statistics(rows.map(row => row[name].dependencyMs)),
      mount: statistics(rows.map(row => row[name].mountMs)),
      afterMount: statistics(rows.map(row => row[name].readyMs - row[name].mountMs)),
      ...(rows[0]?.[name].phases ? {
        pageStartup: Object.fromEntries(Object.keys(rows[0][name].phases)
          .map(key => [key, statistics(rows.map(row => row[name].phases[key]))])),
        pageLedger: ledgerStatistics(rows, name),
      } : {}),
    }]));
  }
  const all = runs.get('all');
  const ready = all.map(row => Math.max(...features.map(name => row[name].readyMs)));
  metrics.firstReady = statistics(all.map(row => Math.min(...features.map(name => row[name].readyMs))));
  metrics.allReady = statistics(ready);
  metrics.firstFiveMaxMs = ready.length >= 5 ? Math.max(...ready.slice(0, 5)) : null;
  if (metrics.firstReady?.medianMs > 2000) failures.push('all: first-ready median exceeds 2000 ms');
  if (metrics.allReady?.medianMs > 5500 || metrics.allReady?.p95Ms > 6500 || metrics.firstFiveMaxMs > 6500) {
    failures.push('all: all-ready median, P95 or first-five maximum exceeds budget');
  }
  for (const name of features) {
    const full = metrics.groups.all[name].afterDependency;
    const single = metrics.groups['single:' + name][name].afterDependency;
    const slow = metrics.groups.slow[name].afterDependency;
    const withAllMs = full && single ? full.p95Ms - single.p95Ms : null;
    const withSlowMs = full && slow && slowTarget !== name ? slow.p95Ms - full.p95Ms : null;
    metrics.interference[name] = { withAllMs, withSlowMs };
    if (full?.medianMs > budgets[name]) failures.push(name + ': after-dependency median exceeds budget');
    if (withAllMs > 300 || withSlowMs > 300) failures.push(name + ': P95 interference exceeds 300 ms');
  }

  if (!sameCandidate(trace) || trace?.reviewed !== true || trace?.attributedTasksAtLeast50Ms !== 0) {
    failures.push('Trace missing or shows attributable initialization tasks of at least 50 ms');
  }
  reference(trace?.artifact, 'trace attribution');
  for (const id of cases) {
    const row = ui?.[id];
    if (!sameCandidate(row) || row?.status !== 'pass') failures.push(id + ': UI or permission case not passed on candidate');
    reference(row?.artifact, id);
  }

  if (!sameCandidate(expert) || !text(expert?.reviewer) || !text(expert?.implementer)
      || expert.reviewer.trim().toLowerCase() === expert.implementer.trim().toLowerCase()
      || expert?.p0 !== 0 || expert?.p1 !== 0) failures.push('Missing independent candidate review or unresolved P0/P1');
  reference(expert?.artifact, 'signed expert review');
  let weighted = 0;
  let allScoresValid = true;
  for (const [dimension, weight] of Object.entries(weights)) {
    const score = expert?.scores?.[dimension];
    if (!Number.isInteger(score) || score < 95 || score > 100) {
      failures.push(dimension + ': expert score must be an integer between 95 and 100');
      allScoresValid = false;
    } else weighted += score * weight;
  }
  if (allScoresValid) {
    metrics.expertScore = weighted / 100;
    if (weighted <= 9500) failures.push('Weighted expert score must be strictly above 95');
  }
  return { pass: failures.length === 0, failures, metrics, references: [...references] };
}

const defaultEvidence = 'artifacts/chatgpt-extension-coexistence/evidence.json';
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const input = resolve(process.argv[2] ?? defaultEvidence);
  try {
    const root = realpathSync(dirname(input));
    const artifactPath = reference => {
      if (!text(reference) || isAbsolute(reference)) throw new Error('Expected a relative artifact path');
      const path = resolve(root, reference);
      if (!path.startsWith(root + sep)) throw new Error('Artifact outside evidence bundle');
      const actual = realpathSync(path);
      if (!actual.startsWith(root + sep)) throw new Error('Artifact outside evidence bundle');
      const info = statSync(actual);
      if (info.size === 0 || !info.isFile()) throw new Error('Expected a nonempty evidence file');
      return actual;
    };
    const result = evaluateCoexistence(JSON.parse(readFileSync(input, 'utf8')), reference => readFileSync(artifactPath(reference)));
    for (const reference of result.references) {
      try {
        artifactPath(reference);
      } catch {
        result.failures.push('Missing or invalid artifact: ' + reference);
        result.pass = false;
      }
    }
    console.log(JSON.stringify(result, null, 2));
    if (!result.pass) process.exitCode = 1;
  } catch (error) {
    console.error((error.code === 'ENOENT' ? 'NOT_TESTED: no evidence bundle at ' + input : 'Invalid evidence: ' + error.message));
    process.exitCode = 2;
  }
}
