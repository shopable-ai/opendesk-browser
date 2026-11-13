import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const ENHANCEMENTS = ['queue', 'navigation', 'prompt-shortcuts'];
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.trim().length > 0;
const sha256 = value => typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
const time = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const p95 = values => values.length
  ? [...values].sort((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1] : null;

/** Evaluate collected performance.now() evidence without I/O or mutation.
 * P95 uses nearest rank. Ineligible observations never contribute latency or count.
 * Each document requires three observations and a valid control. Single queue and
 * navigation observations count only when eligible; three-page requires all valid.
 * Every eligible enhancement has a 20000ms hard limit independent of P95.
 */
export function evaluatePageStartup(evidence) {
  const failures = [];
  const fail = message => failures.push(message);
  const latencies = Object.fromEntries(ENHANCEMENTS.map(name => [name, []]));
  const metrics = { single: {}, threePage: { rounds: 0 } };
  const groups = new Map();
  const rounds = new Map();
  const singleDocuments = new Set();
  const seen = new Set();
  const candidate = record(evidence?.candidate) ? evidence.candidate : {};
  if (!record(evidence) || evidence.schemaVersion !== 1) fail('schemaVersion must be 1');
  if (!text(candidate.extensionId) || !sha256(candidate.revision) || !sha256(candidate.swSha256)) {
    fail('candidate requires extensionId and 64-hex revision and swSha256');
  }
  if (!record(evidence?.regressions) || evidence.regressions.passed !== true
      || !text(evidence.regressions.command)) fail('Safety regressions must pass with a recorded command');
  if (!Array.isArray(evidence?.samples)) fail('samples must be an array');
  for (const [index, sample] of (Array.isArray(evidence?.samples) ? evidence.samples : []).entries()) {
    const label = `samples[${index}]`;
    if (!record(sample)) { fail(`${label}: sample must be an object`); continue; }
    const { cohort, round, page, documentId, enhancement } = sample;
    const validRound = text(round) || (Number.isSafeInteger(round) && round >= 0);
    if (!['single', 'three-page'].includes(cohort) || !validRound || !text(page)
        || !text(documentId) || !ENHANCEMENTS.includes(enhancement)) {
      fail(`${label}: invalid cohort, round, page, documentId or enhancement`);
      continue;
    }
    const startFailures = failures.length;
    if (!text(sample.candidateRevision) || sample.candidateRevision !== candidate.revision) {
      fail(`${label}: candidateRevision missing or mismatched`);
    }
    // If collectors include additional candidate identity, it must agree as well.
    for (const field of ['extensionId', 'swSha256']) {
      if (Object.hasOwn(sample, field) && sample[field] !== candidate[field]) fail(`${label}: candidate ${field} mismatched`);
    }
    if (Object.hasOwn(sample, 'bootstrapError') && sample.bootstrapError !== null
        && sample.bootstrapError !== undefined && sample.bootstrapError !== '') fail(`${label}: bootstrap error`);
    if (typeof sample.eligible !== 'boolean' || typeof sample.missing !== 'boolean'
        || typeof sample.usable !== 'boolean' || !Number.isSafeInteger(sample.visibleCount)
        || sample.visibleCount < 0) fail(`${label}: invalid eligibility, missing, usable or visibleCount`);
    if (sample.visibleCount > 1) fail(`${label}: non-unique visibleCount`);
    if (sample.eligible === true) {
      if (sample.missing !== false || sample.visibleCount !== 1 || sample.usable !== true) {
        fail(`${label}: eligible enhancement must be present, unique and usable`);
      }
      if (!time(sample.prerequisiteAtMs) || !time(sample.visibleAtMs)) fail(`${label}: invalid performance.now timestamps`);
    } else if (sample.prerequisiteAtMs !== null || sample.visibleAtMs !== null) {
      fail(`${label}: ineligible timestamps must both be null`);
    }
    const groupKey = JSON.stringify([cohort, round, page, documentId]);
    const duplicateKey = JSON.stringify([cohort, round, documentId, enhancement]);
    if (seen.has(duplicateKey)) fail(`${label}: duplicate document/enhancement in round`);
    seen.add(duplicateKey);
    if (cohort === 'single') {
      const key = JSON.stringify([documentId, enhancement]);
      if (singleDocuments.has(key)) fail(`${label}: duplicate single document/enhancement across rounds`);
      singleDocuments.add(key);
    }
    if (!groups.has(groupKey)) groups.set(groupKey, { cohort, round, page, documentId, observations: new Map() });
    const group = groups.get(groupKey);
    const valid = failures.length === startFailures && sample.eligible === true;
    const latency = valid ? Math.max(0, sample.visibleAtMs - sample.prerequisiteAtMs) : null;
    if (sample.eligible === true && time(sample.prerequisiteAtMs) && time(sample.visibleAtMs)
        && sample.visibleAtMs - sample.prerequisiteAtMs > 20000) {
      fail(`${label}: eligible ${enhancement} latency exceeds 20000ms hard limit`);
    }
    group.observations.set(enhancement, { valid, latency });
    if (cohort === 'single' && valid) latencies[enhancement].push(latency);
    if (cohort === 'three-page') {
      if (!rounds.has(round)) rounds.set(round, new Set());
      rounds.get(round).add(groupKey);
      if (valid && enhancement !== 'prompt-shortcuts' && latency > 3000) {
        fail(`${label}: three-page ${enhancement} latency ${latency}ms exceeds 3000ms`);
      }
    }
  }
  for (const [key, group] of groups) {
    for (const name of ENHANCEMENTS) {
      if (!group.observations.has(name)) fail(`${key}: missing ${name} observation`);
    }
    const requiredValid = group.cohort === 'three-page' ? ENHANCEMENTS : ['prompt-shortcuts'];
    for (const name of requiredValid) {
      if (!group.observations.get(name)?.valid) fail(`${key}: ${name} must be eligible and valid`);
    }
  }
  for (const name of ENHANCEMENTS) {
    metrics.single[name] = { count: latencies[name].length, p95Ms: p95(latencies[name]) };
    if (name !== 'prompt-shortcuts') {
      if (latencies[name].length < 10) fail(`single ${name}: requires >=10 independent eligible documents`);
      if (metrics.single[name].p95Ms > 1000) fail(`single ${name}: P95 ${metrics.single[name].p95Ms}ms exceeds 1000ms`);
    }
  }
  metrics.threePage.rounds = rounds.size;
  if (rounds.size === 0) fail('Missing three-page round');
  for (const [round, keys] of rounds) {
    const documents = [...keys].map(key => groups.get(key));
    const pages = new Set(documents.map(group => group.page));
    const ids = new Set(documents.map(group => group.documentId));
    if (documents.length < 3 || pages.size !== documents.length || ids.size !== documents.length) {
      fail(`three-page round ${round}: requires >=3 distinct pages and documents`);
    }
  }
  return { pass: failures.length === 0, failures, metrics };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 3) throw new Error('Usage: node scripts/evaluate-page-startup.mjs <evidence.json>');
    const result = evaluatePageStartup(JSON.parse(readFileSync(process.argv[2], 'utf8')));
    console.log(`${result.pass ? 'PASS' : 'FAIL'} page startup`);
    console.log(JSON.stringify(result, null, 2));
    if (!result.pass) process.exitCode = 1;
  } catch (error) {
    console.error(`FAIL page startup: ${error.message}`);
    process.exitCode = 1;
  }
}
