import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {verifyPackage, filesAt} from '../../scripts/verify-package.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const hashPattern = /^[a-f0-9]{64}$/;
const isHash = value => typeof value === 'string' && hashPattern.test(value);
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const identity = value => typeof value === 'string' && value.trim() ? value.trim().normalize('NFKC').toLowerCase() : null;
const own = (value, key) => value != null && Object.hasOwn(value, key);
const resourceKeys = ['pending', 'timers', 'subscriptions', 'ports', 'workers', 'blobs'];
export const CRASH_POINTS = Object.freeze(['admission-abort', 'commit-before-dispatch', 'write-before-receipt', 'durable-before-delivery']);
export const SUPPLEMENTAL_CATALOG = 'docs/framework/evidence/continuation-20261003-current/supplemental-sdk-cases.json';
const supplementalHash = '5a5c7fc207cf4ef3fac2861a41203dbd86034fe05f87e24fe1e8b3debd36fa61';

export function reviewInputSnapshot({ledger, spec, supplementalSpec, candidate, records = [], historicalIds = [], requiredCapabilityIds}) {
  return {schemaVersion: 1, originalSpecSha256: sha(JSON.stringify(spec)), supplementalSpecSha256: sha(JSON.stringify(supplementalSpec)),
    requiredCapabilityIds, requiredCaseIds: [...spec.cases.map(row => row.id), ...Object.keys(ledger.additionalCaseResults)], historicalIds,
    capabilityEvidence: requiredCapabilityIds.map(id => ({id, evidence: [...ledger.apiItems, ...ledger.capabilityItems, ...ledger.resourceItems].find(row => row.id === id)?.evidence})),
    candidate: Object.fromEntries(['mode', 'packageDirectory', 'packageHash', 'buildReport', 'packReport', 'packageArchive', 'supplementalCatalog', 'environments',
      'resultReports', 'campaigns', 'historicalClosures', 'productAuthors'].map(key => [key, candidate?.[key] ?? null])), resultsSha256: sha(JSON.stringify(records))};
}

// This checks evidence completeness/integrity. Independent reviewers still judge
// the raw observations against the approved semantics; JSON labels prove no effect.
export function validateAcceptance({ledger, spec, supplementalSpec = {cases: []}, candidate, records = [], historicalIds = [], requiredCapabilityIds = ledger.denominatorHistory[0].requiredCapabilityIds}) {
  const issues = [], add = (code, subject) => issues.push({code, subject});
  const originals = spec.cases.filter(row => row.required).map(row => row.id);
  const additional = Object.keys(ledger.additionalCaseResults || {});
  const required = [...originals, ...additional];
  if (new Set(required).size !== required.length) add('OVERLAPPING_CASE_DENOMINATOR', 'required');
  const contracts = [...spec.cases, ...supplementalSpec.cases];
  if (new Set(contracts.map(row => row.id)).size !== contracts.length) add('DUPLICATE_CONTRACT', 'contracts');
  if (new Set(originals).size !== originals.length) add('DUPLICATE_CONTRACT', 'spec.cases');
  if (JSON.stringify(Object.keys(ledger.caseResults).sort()) !== JSON.stringify([...originals].sort())) add('DENOMINATOR_CHANGED', 'caseResults');
  const byId = new Map();
  for (const record of records) {
    if (!record || typeof record.id !== 'string' || byId.has(record.id)) add('DUPLICATE_OR_INVALID_RESULT', record?.id || 'result');
    else byId.set(record.id, record);
  }
  if (!candidate || candidate.mode !== 'production' || !isHash(candidate.packageHash)) add('NO_FINAL_PRODUCTION_PACKAGE', 'candidate');
  const validRefs = refs => Array.isArray(refs) && refs.length > 0 && refs.every(ref => isObject(ref) &&
    typeof ref.path === 'string' && ref.path.trim().length > 0 && isHash(ref.sha256));
  const declaredEnvironments = candidate?.environments || [];
  if (!Array.isArray(declaredEnvironments) || declaredEnvironments.some(env => !isObject(env))) add('INVALID_ENVIRONMENTS', 'environments');
  const environments = Array.isArray(declaredEnvironments) ? declaredEnvironments.filter(isObject) : [];
  if (environments.length < 2 || new Set(environments.map(e => e.id)).size !== environments.length ||
      !environments.some(e => e.role === 'minimum' && /^138\./.test(e.chromeVersion || '')) ||
      !environments.some(e => e.role === 'stable' && validRefs([e.versionEvidence]))) add('VERSION_MATRIX_MISSING', 'environments');
  for (const environment of environments) {
    if (!identity(environment.id) || typeof environment.chromeVersion !== 'string' || !/^\d+\.\d+\.\d+\.\d+$/.test(environment.chromeVersion) || !isHash(environment.binarySha256) ||
        !environment.os || !environment.profile || !environment.extensionId || !environment.binary?.path ||
        environment.binary.sha256 !== environment.binarySha256) add('ENVIRONMENT_INCOMPLETE', environment.id);
  }
  const validCleanup = cleanup => cleanup && resourceKeys.every(key =>
    Number.isInteger(cleanup.before?.[key]) && cleanup.before[key] >= 0 && cleanup.after?.[key] === cleanup.before[key]);
  function observed(record, subject, allEnvironments = true) {
    if (!record || record.layer !== 'native-product' || record.pass !== true ||
        record.productPackageSha256 !== candidate?.packageHash || record.packageDrift !== false || record.sourceDrift !== false) {
      add('NATIVE_RESULT_MISSING_OR_STALE', subject); return false;
    }
    const observations = record.observations;
    if (!Array.isArray(observations) || !observations.length || observations.some(o => !isObject(o)) || new Set(observations.map(o => o.environmentId)).size !== observations.length ||
        (allEnvironments && environments.some(env => !observations.some(o => o.environmentId === env.id)))) {
      add('OBSERVATION_MATRIX_MISSING', subject); return false;
    }
    let valid = true;
    for (const observation of observations) {
      if (!environments.some(env => env.id === observation.environmentId) || observation.pass !== true || !observation.preconditions ||
          !own(observation, 'input') || !own(observation, 'actual') || !own(observation, 'expected') || !validRefs(observation.evidence) ||
          !validCleanup(observation.cleanup)) {add('OBSERVATION_INCOMPLETE', subject); valid = false;}
    }
    return valid;
  }
  let accepted = 0;
  for (const id of required) {
    const record = byId.get(id), row = ledger.caseResults[id] || ledger.additionalCaseResults[id];
    let valid = observed(record, id);
    const contract = contracts.find(c => c.id === id);
    if (!contract || record?.contractSha256 !== sha(JSON.stringify(contract))) {add('CASE_CONTRACT_MISMATCH', id); valid = false;}
    if (!record?.sourceHashes || !Object.keys(record.sourceHashes).length ||
        Object.values(record.sourceHashes).some(value => !isHash(value)) ||
        (contract?.source?.sha256 && (!Object.values(record.sourceHashes).includes(contract.source.sha256) ||
          (contract.source.path && record.sourceHashes[contract.source.path] !== contract.source.sha256)))) {
      add('SOURCE_BINDING_MISSING', id); valid = false;
    }
    if (row?.status !== 'independently-accepted' || row.pass !== true || row.productPackageSha256 !== candidate?.packageHash) add('LEDGER_NOT_ACCEPTED', id);
    else if (valid) accepted++;
  }
  const items = [...ledger.apiItems, ...ledger.capabilityItems, ...ledger.resourceItems];
  const currentCapabilityIds = ledger.denominatorHistory.findLast(row => Array.isArray(row.requiredCapabilityIds))?.requiredCapabilityIds || [];
  if (JSON.stringify([...currentCapabilityIds].sort()) !== JSON.stringify([...requiredCapabilityIds].sort())) add('CAPABILITY_DENOMINATOR_CHANGED', 'requiredCapabilityIds');
  for (const id of requiredCapabilityIds) {
    const item = items.find(row => row.id === id);
    if (!item || item.status !== 'independently-accepted' || item.runtimePass !== true ||
        item.productPackageSha256 !== candidate?.packageHash || !validRefs(item.evidence)) add('CAPABILITY_NOT_ACCEPTED', id);
  }
  // A campaign consists of distinct raw result references, not a claimed count.
  const campaignIds = new Set();
  const occurrenceIds = new Set(), occurrenceLocations = new Set();
  function campaign(name, minimum, kinds) {
    const ids = candidate?.campaigns?.[name] || [];
    if (!Array.isArray(ids) || ids.length < minimum || new Set(ids).size !== ids.length) {add('CAMPAIGN_INCOMPLETE', name); return [];}
    const results = ids.map(id => byId.get(id));
    for (let i = 0; i < results.length; i++) {
      if (required.includes(ids[i]) || campaignIds.has(ids[i])) add('CAMPAIGN_RESULT_REUSED', `${name}:${ids[i]}`);
      campaignIds.add(ids[i]);
      observed(results[i], `${name}:${ids[i]}`);
      for (const o of Array.isArray(results[i]?.observations) ? results[i].observations : []) {
        const occurrence = o?.occurrence;
        if (!isObject(occurrence) || !identity(occurrence.roundId) || !identity(occurrence.sessionId) || occurrence.resultId !== ids[i] ||
            !validRefs([occurrence.evidence]) || typeof occurrence.pointer !== 'string' || !occurrence.pointer.startsWith('/') ||
            !Number.isFinite(occurrence.startMs) || occurrence.startMs < 0 || !Number.isFinite(occurrence.endMs) || occurrence.endMs < occurrence.startMs) {
          add('CAMPAIGN_OCCURRENCE_MISSING', `${name}:${ids[i]}`); continue;
        }
        const key = JSON.stringify([o.environmentId, occurrence.sessionId, occurrence.roundId]);
        const location = JSON.stringify([o.environmentId, occurrence.evidence.sha256, occurrence.pointer]);
        if (occurrenceIds.has(key) || occurrenceLocations.has(location)) add('CAMPAIGN_OCCURRENCE_REUSED', `${name}:${ids[i]}`);
        occurrenceIds.add(key); occurrenceLocations.add(location);
      }
    }
    for (const kind of kinds || []) if (!results.some(row => row?.kind === kind)) add('CAMPAIGN_KIND_MISSING', `${name}:${kind}`);
    return results;
  }
  campaign('mixed', 1000, ['success', 'error', 'timeout', 'cancel', 'navigation']);
  campaign('reconnect', 10, ['host', 'sw']);
  campaign('pluginDisabled', 2, ['plugin-disabled']);
  const concurrent = campaign('sdkConcurrency', 1, ['sdk-concurrency']);
  const inEveryEnvironment = (results, predicate) => results.length > 0 && environments.length > 0 &&
    results.every(row => Array.isArray(row?.observations) && row.observations.every(o => isObject(o) && predicate(o))) &&
    environments.every(env => results.some(row => row?.observations?.some(o => o?.environmentId === env.id && predicate(o))));
  if (!inEveryEnvironment(concurrent, observation => {const m = observation.measurements; return m?.requests === 100 && m.controllerRuns === 0 &&
    m.admissions === 1 && m.serviceRuns === 1 && m.operations === 1 && m.httpWrites === 1;})) add('SDK_100_NOT_PROVEN', 'sdkConcurrency');
  const crashes = campaign('sdkCrashes', 4, CRASH_POINTS);
  for (const point of CRASH_POINTS) {
    if (!inEveryEnvironment(crashes.filter(row => row?.kind === point), observation => {const m = observation.measurements; return m?.controllerRuns === 0 &&
      m.swTerminated === true && m.originalIdentityPreserved === true && m.httpWrites === (point === 'admission-abort' ? 0 : 1) &&
      (point !== 'write-before-receipt' || (m.outcome === 'E_EFFECT_UNKNOWN' && m.replayed === false));})) add('SDK_CRASH_NOT_PROVEN', point);
  }
  const downloads = campaign('downloads', 1, ['download-complete']);
  if (!inEveryEnvironment(downloads, observation => {const d = observation.download, a = d?.artifact; return d?.state === 'complete' && isHash(d.sha256) &&
    validRefs(d.evidence) && validRefs([d.diskFile]) && d.diskFile.sha256 === d.sha256 && identity(d.artifactId) && identity(d.runId) &&
    Number.isSafeInteger(d.bytes) && d.bytes >= 0 && isObject(a) && a.artifactId === d.artifactId && a.runId === d.runId && a.bytes === d.bytes &&
    a.sha256 === d.sha256 && validRefs([a.record]) && validRefs([a.payloadFile]) && a.payloadFile.sha256 === d.sha256;})) add('DISK_DOWNLOAD_NOT_PROVEN', 'downloads');
  const terminations = campaign('workerTermination', 1, ['worker-termination']);
  if (!inEveryEnvironment(terminations, observation => {const m = observation.measurements; return Number.isFinite(m?.terminatedMs) && m.terminatedMs >= 0 &&
    m.terminatedMs <= 3000 && identity(m.workerIdentity) && m.targetDestroyed === true && m.cpuGrowingBefore === true && m.cpuStaticAfter === true &&
    m.survivingHostResponsive === true && m.borrowedPageClosed === false;})) add('WORKER_TERMINATION_NOT_PROVEN', 'workerTermination');
  for (const id of historicalIds) {
    const closure = candidate?.historicalClosures?.[id];
    if (!Array.isArray(closure) || !closure.length || closure.some(caseId => !required.includes(caseId) || !byId.has(caseId))) add('HISTORICAL_REGRESSION_OPEN', id);
  }
  const authors = Array.isArray(candidate?.productAuthors) ? candidate.productAuthors.map(identity) : [];
  if (!authors.length || authors.some(value => !value) || new Set(authors).size !== authors.length) add('AUTHOR_PROVENANCE_MISSING', 'productAuthors');
  const reviews = Array.isArray(candidate?.reviews) ? candidate.reviews : [];
  if (reviews.length !== 2 || reviews.some(row => !isObject(row)) || new Set(reviews.map(row => row?.role)).size !== 2) add('REVIEW_CARDINALITY_INVALID', 'reviews');
  const snapshot = reviewInputSnapshot({ledger, spec, supplementalSpec, candidate, records, historicalIds, requiredCapabilityIds});
  const reviewInputsSha256 = sha(JSON.stringify(snapshot));
  for (const role of ['architect', 'critic']) {
    const review = reviews.find(row => row?.role === role);
    if (!review || review.independent !== true || !identity(review.reviewerId) || authors.includes(identity(review.reviewerId)) || review.verdict !== 'APPROVE' ||
        review.productPackageSha256 !== candidate?.packageHash || !Array.isArray(review.blockers) || review.blockers.length || !validRefs([review.report]) ||
        !Number.isFinite(Date.parse(review.startedAt)) || !Number.isFinite(Date.parse(review.completedAt)) ||
        Date.parse(review.startedAt) > Date.parse(review.completedAt)) add('INDEPENDENT_REVIEW_MISSING', role);
    if (review && (review.reviewInputsSha256 !== reviewInputsSha256 || JSON.stringify(review.reviewedInputs) !== JSON.stringify(snapshot))) add('REVIEW_INPUT_SNAPSHOT_MISMATCH', role);
  }
  const arch = reviews.find(row => row?.role === 'architect'), critic = reviews.find(row => row?.role === 'critic');
  if (arch && critic && (identity(arch.reviewerId) === identity(critic.reviewerId) || Date.parse(critic.startedAt) < Date.parse(arch.completedAt) ||
      !Number.isFinite(Date.parse(critic.startedAt)))) add('REVIEW_SEQUENCE_OR_IDENTITY', 'reviews');
  if (critic && (!validRefs([arch?.report]) || critic.architectReportSha256 !== arch.report.sha256)) add('CRITIC_ARCHITECT_BINDING_MISSING', 'critic');
  return {accepted: issues.length === 0, reviewInputsSha256, reviewedInputs: snapshot, counts: {original: originals.length, additional: additional.length,
    validCaseRecords: accepted, accepted: issues.length ? 0 : required.length}, issues};
}

export async function checkAcceptance({projectRoot = root, candidatePath} = {}) {
  const loadedInputs = new Map();
  const read = async file => {
    const path = resolve(projectRoot, file), bytes = await readFile(path);
    loadedInputs.set(path, sha(bytes)); return JSON.parse(bytes);
  };
  const ledger = await read('docs/framework/source-compatibility-ledger.json');
  const gates = await read('docs/framework/execution-gates.json');
  if (sha(await readFile(resolve(projectRoot, gates.currentPlan.manifest))) !== gates.currentPlan.manifestSha256)
    throw new Error('Approved plan manifest integrity failure');
  const frozen = await read(gates.currentPlan.manifest);
  const specRef = frozen.files.find(file => file.path.endsWith('/test-spec-v5.json'));
  if (!specRef || sha(await readFile(specRef.path)) !== specRef.sha256) throw new Error('Approved case specification integrity failure');
  const spec = JSON.parse(await readFile(specRef.path, 'utf8'));
  const ledgerRef = frozen.files.find(file => file.path.endsWith('/source-compatibility-ledger.json'));
  if (!ledgerRef || sha(await readFile(ledgerRef.path)) !== ledgerRef.sha256) throw new Error('Approved capability denominator integrity failure');
  const approvedLedger = JSON.parse(await readFile(ledgerRef.path, 'utf8'));
  const requiredCapabilityIds = approvedLedger.denominatorHistory.findLast(row => Array.isArray(row.requiredCapabilityIds))?.requiredCapabilityIds;
  if (requiredCapabilityIds?.length !== 191 || new Set(requiredCapabilityIds).size !== 191) throw new Error('Approved191 capability baseline is missing');
  const explicitSdk = Array.from({length:19}, (_, i) => `F2-K2-SDK-${String(i + 1).padStart(3, '0')}`);
  if (spec.cases.length !== 603 || spec.cases.some(row => row.required !== true) || explicitSdk.some(id => !own(ledger.additionalCaseResults, id))) throw new Error('Original603/current explicit SDK baseline is missing');
  const historical = await read('docs/framework/historical-failure-mapping.json');
  const historicalIds = [...historical.R1_R8, ...historical.historical17].map(row => row.id);
  if (historicalIds.length !== 25 || new Set(historicalIds).size !== 25) throw new Error('Historical17/R1-R8 baseline is missing');
  const supplementalBytes = await readFile(resolve(projectRoot, SUPPLEMENTAL_CATALOG));
  if (sha(supplementalBytes) !== supplementalHash) throw new Error('Supplemental native contract catalog integrity failure');
  const supplementalSpec = JSON.parse(supplementalBytes);
  if (!candidatePath) return {...validateAcceptance({ledger, spec, supplementalSpec, historicalIds, requiredCapabilityIds}), mode: 'readiness',
    note: 'Read-only evidence readiness; no tests run, no gate or ledger changed.'};
  const candidate = await read(candidatePath), records = [], integrityIssues = [];
  const add = (code, subject) => integrityIssues.push({code, subject});
  const checked = new Map();
  async function reference(ref) {
    if (!isObject(ref) || typeof ref.path !== 'string' || !ref.path.trim() || !isHash(ref.sha256)) {add('INVALID_REFERENCE', ref?.path); return;}
    const key = JSON.stringify(ref);
    if (checked.has(key)) return checked.get(key);
    try {
      const bytes = await readFile(resolve(projectRoot, ref.path));
      if (sha(bytes) !== ref.sha256 || (own(ref, 'bytes') && ref.bytes !== bytes.length)) {add('EVIDENCE_HASH_MISMATCH', ref.path); return;}
      checked.set(key, bytes); return bytes;
    } catch {add('EVIDENCE_FILE_MISSING', ref.path);}
  }
  for (const ref of candidate.resultReports || []) {
    const bytes = await reference(ref);
    if (bytes) try {
      const report = JSON.parse(bytes);
      if (!Array.isArray(report.results)) add('RESULT_REPORT_INVALID', ref.path);
      else records.push(...report.results);
    } catch {add('RESULT_REPORT_INVALID', ref.path);}
  }
  // Traverse every declared raw evidence reference, including disk files and
  // browser binaries. Never execute content from a report.
  async function references(value) {
    if (!value || typeof value !== 'object') return;
    if (own(value, 'path') && own(value, 'sha256')) await reference(value);
    for (const child of Object.values(value)) if (child && typeof child === 'object') await references(child);
  }
  await references(candidate);
  if (resolve(projectRoot, candidate.supplementalCatalog?.path || '') !== resolve(projectRoot, SUPPLEMENTAL_CATALOG) ||
      candidate.supplementalCatalog?.sha256 !== supplementalHash) add('SUPPLEMENTAL_CATALOG_BINDING_MISSING', 'supplementalCatalog');
  await reference({path: SUPPLEMENTAL_CATALOG, sha256: supplementalHash});
  for (const record of records) for (const observation of Array.isArray(record?.observations) ? record.observations : []) {
    // Business input/expected/actual are data, even if they contain path/sha256.
    await references(observation?.evidence); await references(observation?.download); await references(observation?.occurrence);
    const occurrence = observation?.occurrence;
    if (isObject(occurrence) && typeof occurrence.pointer === 'string' && occurrence.pointer.startsWith('/')) {
      const bytes = await reference(occurrence.evidence);
      if (bytes) try {
        let raw = JSON.parse(bytes);
        for (const token of occurrence.pointer.slice(1).split('/')) raw = raw?.[token.replaceAll('~1', '/').replaceAll('~0', '~')];
        if (!isObject(raw) || ['resultId','roundId','sessionId','startMs','endMs'].some(key => raw[key] !== occurrence[key])) add('OCCURRENCE_RAW_BINDING_MISMATCH', record.id);
      } catch {add('OCCURRENCE_RAW_BINDING_MISMATCH', record.id);}
    }
    const d = observation?.download, a = d?.artifact;
    if (isObject(a)) {
      const recordBytes = await reference(a.record), payload = await reference(a.payloadFile), disk = await reference(d.diskFile);
      if (recordBytes && payload && disk) try {
        const row = JSON.parse(recordBytes), nativeArtifact = row.artifact || row;
        if (['artifactId','runId','sha256','bytes'].some(key => nativeArtifact[key] !== a[key]) ||
            payload.length !== a.bytes || disk.length !== d.bytes || sha(payload) !== d.sha256 || sha(disk) !== d.sha256) add('ARTIFACT_DISK_BINDING_MISMATCH', record.id);
      } catch {add('ARTIFACT_RECORD_INVALID', record.id);}
    }
  }
  for (const record of records) for (const [path, sha256] of Object.entries(record?.sourceHashes || {})) await reference({path, sha256});
  for (const id of requiredCapabilityIds) {
    const item = [...ledger.apiItems, ...ledger.capabilityItems, ...ledger.resourceItems].find(row => row.id === id);
    for (const ref of item?.evidence || []) if (ref && typeof ref === 'object') await reference(ref);
  }
  const buildBytes = await reference(candidate.buildReport);
  if (buildBytes) {
    try {
      const build = JSON.parse(buildBytes);
      if (build.mode !== 'production' || build.status !== 'passed' || build.report?.packageHash !== candidate.packageHash ||
          !Array.isArray(build.sourceInputs) || !build.sourceInputs.length || !Array.isArray(build.sourceDriftDuringBuild) || build.sourceDriftDuringBuild.length) add('BUILD_NOT_FROZEN', 'buildReport');
      else {
        const paths = [...(await filesAt(resolve(projectRoot, 'src'))).map(path => `src/${path}`), 'manifest.json', 'webpack.config.cjs',
          'scripts/build.mjs', 'scripts/verify-package.mjs', 'package.json', 'package-lock.json', 'docs/contracts/licenses/todo-user-vue-MIT.txt'].sort();
        if (JSON.stringify(paths) !== JSON.stringify(build.sourceInputs.map(input => input.path).sort())) add('BUILD_SOURCE_CLOSURE_CHANGED', 'sourceInputs');
        for (const input of build.sourceInputs) await reference(input);
      }
    } catch {add('BUILD_REPORT_INVALID', 'buildReport');}
  } else add('BUILD_REPORT_MISSING', 'buildReport');
  let packageReport;
  try {
    if (candidate.mode !== 'production' || resolve(projectRoot, candidate.packageDirectory || '') !== resolve(projectRoot, 'dist/production')) add('PACKAGE_MODE_MISMATCH', 'packageDirectory');
    else {
      packageReport = await verifyPackage(resolve(projectRoot, candidate.packageDirectory));
      if (packageReport.packageHash !== candidate.packageHash) add('PACKAGE_HASH_MISMATCH', 'packageDirectory');
    }
  } catch (error) {add('PACKAGE_INVALID', error.message);}
  const archive = await reference(candidate.packageArchive), packBytes = await reference(candidate.packReport);
  if (!archive || !packBytes) add('PACK_RECEIPT_OR_ARCHIVE_MISSING', 'packageArchive');
  else try {
    const receipt = JSON.parse(packBytes);
    if (receipt.status !== 'passed' || receipt.mode !== 'production' || receipt.packageHash !== candidate.packageHash ||
        receipt.zipSha256 !== sha(archive) || receipt.bytes !== archive.length) add('PACK_RECEIPT_MISMATCH', 'packReport');
    // Read ZIP contents without extracting them, using the same standard-library
    // dependency as scripts/pack.mjs. The archive must contain exactly this package.
    const python = 'import sys,json,zipfile,hashlib\nwith zipfile.ZipFile(sys.argv[1]) as z:\n print(json.dumps(sorted([{\"path\":i.filename,\"bytes\":i.file_size,\"sha256\":hashlib.sha256(z.read(i)).hexdigest()} for i in z.infolist()],key=lambda x:x[\"path\"])))';
    const {stdout} = await promisify(execFile)('python3', ['-c', python, resolve(projectRoot, candidate.packageArchive.path)], {maxBuffer: 4 * 1024 * 1024});
    if (!packageReport || JSON.stringify(JSON.parse(stdout)) !== JSON.stringify(packageReport.files)) add('ARCHIVE_PACKAGE_MISMATCH', 'packageArchive');
  } catch (error) {add('ARCHIVE_INVALID', error.message);}
  for (const review of Array.isArray(candidate.reviews) ? candidate.reviews : []) {
    const bytes = await reference(review?.report);
    if (bytes) try {
      const report = JSON.parse(bytes);
      await references(report);
      for (const key of ['role', 'reviewerId', 'independent', 'verdict', 'productPackageSha256', 'blockers', 'startedAt', 'completedAt',
        'reviewInputsSha256', 'reviewedInputs', 'architectReportSha256'])
        if (JSON.stringify(report[key]) !== JSON.stringify(review[key])) add('REVIEW_REPORT_MISMATCH', `${review.role}:${key}`);
    } catch {add('REVIEW_REPORT_INVALID', review.role);}
  }
  const result = validateAcceptance({ledger, spec, supplementalSpec, candidate, records, historicalIds, requiredCapabilityIds});
  for (const [path, hash] of loadedInputs) {
    try {if (sha(await readFile(path)) !== hash) add('ACCEPTANCE_INPUT_CHANGED_DURING_CHECK', path);}
    catch {add('ACCEPTANCE_INPUT_CHANGED_DURING_CHECK', path);}
  }
  // Ensure hashing itself did not span a concurrent rewrite. This deliberately
  // rereads only candidate evidence and the declared current build closure.
  for (const [key] of checked) {
    const ref = JSON.parse(key);
    try {if (sha(await readFile(resolve(projectRoot, ref.path))) !== ref.sha256) add('EVIDENCE_CHANGED_DURING_CHECK', ref.path);}
    catch {add('EVIDENCE_CHANGED_DURING_CHECK', ref.path);}
  }
  if (packageReport) try {
    if ((await verifyPackage(resolve(projectRoot, candidate.packageDirectory))).packageHash !== packageReport.packageHash) add('PACKAGE_CHANGED_DURING_CHECK', 'packageDirectory');
  } catch (error) {add('PACKAGE_CHANGED_DURING_CHECK', error.message);}
  result.issues.push(...integrityIssues); result.accepted = result.issues.length === 0;
  if (!result.accepted) result.counts.accepted = 0;
  result.mode = 'final-evidence-check'; result.evidenceFilesVerified = checked.size;
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const candidatePath = process.argv.find(arg => arg.startsWith('--candidate='))?.slice('--candidate='.length);
  try {
    const report = await checkAcceptance({candidatePath});
    const full = process.argv.includes('--full');
    console.log(JSON.stringify({...report, reviewedInputs: full ? report.reviewedInputs : undefined, issueCount: report.issues.length,
      issues: full ? report.issues : report.issues.slice(0, 30)}, null, 2));
    process.exitCode = candidatePath && !report.accepted ? 1 : 0;
  } catch (error) {console.error(JSON.stringify({accepted: false, error: error.message})); process.exitCode = 1;}
}
