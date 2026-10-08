// Read-only archive verification. This never runs tests or grants native acceptance.
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFile, realpath, lstat, readlink} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const HASH = /^[a-f0-9]{64}$/;
const inside = (root, file) => file.startsWith(root + path.sep);
const productInput = file => /^(src\/|schemas\/|examples\/programs\/|tests\/fixtures\/)/.test(file) ||
  /^(manifest\.json|package(?:-lock)?\.json|wxt\.config\.mjs)$/.test(file) ||
  /^scripts\/(build.*|validate-program-project|verify-package)\.mjs$/.test(file);
const git = (root, ...args) => execFileSync('git', args, {cwd:root, maxBuffer:32 * 1024 * 1024});
const lines = bytes => bytes.toString().split('\0').filter(Boolean);

async function archiveFile(root, name) {
  if (typeof name !== 'string' || path.isAbsolute(name) || name.split(/[\\/]/).some(part => part === '..'))
    throw Error('Unsafe archive path: ' + name);
  const file = await realpath(path.resolve(root, name));
  if (!inside(root, file)) throw Error('Archive path escapes its root: ' + name);
  return readFile(file);
}

// The historical index has no reviewed per-case dependency graph. Use a conservative
// product/build scope, report drift, and leave narrowing to the responsible reviewer.
async function inputChanges(root, sourceHead, candidate, fixtures) {
  const tree = ref => new Map(lines(git(root, 'ls-tree', '-r', '-z', ref)).map(line => {
    const [metadata, file] = line.split('\t');
    return [file, metadata.split(' ')[0]];
  }));
  const testedTree = tree(sourceHead), tested = [...testedTree.keys()];
  const currentTree = candidate === 'working-tree' ? null : tree(candidate);
  const current = candidate === 'working-tree'
    ? lines(git(root, 'ls-files', '-z', '--cached', '--others', '--exclude-standard'))
    : [...currentTree.keys()];
  const fixturePaths = new Set(fixtures.map(row => row.path));
  const paths = [...new Set([...tested, ...current, ...fixturePaths])]
    .filter(file => productInput(file) || fixturePaths.has(file)).sort();
  const changes = [];
  const bytesAt = async (ref, file) => {
    try {
      if (ref !== 'working-tree') return git(root, 'show', `${ref}:${file}`);
      if ((await lstat(path.join(root, file))).isSymbolicLink()) return Buffer.from(await readlink(path.join(root, file)));
      return await archiveFile(await realpath(root), file);
    } catch { return null; }
  };
  for (const file of paths) {
    const recorded = fixtures.find(row => row.path === file)?.sha256;
    const before = recorded || (tested.includes(file) ? sha256(await bytesAt(sourceHead, file)) : null);
    const bytes = current.includes(file) ? await bytesAt(candidate, file) : null;
    const after = bytes === null ? null : sha256(bytes);
    let candidateMode = currentTree?.get(file) || null;
    if (candidate === 'working-tree') {
      try {
        const stat = await lstat(path.join(root, file));
        candidateMode = stat.isSymbolicLink() ? '120000' : stat.isFile() ? (stat.mode & 0o111 ? '100755' : '100644') : 'unsupported';
      } catch { candidateMode = null; }
    }
    const testedMode = testedTree.get(file) || null;
    // A link's target closure is not in the historical manifest. Never assume it.
    const unsupported = [testedMode, candidateMode].some(mode => mode && !['100644','100755'].includes(mode));
    if (before !== after || testedMode !== candidateMode || unsupported) changes.push({path:file,
      kind:fixturePaths.has(file) ? 'fixture' : 'product-or-build', testedSha256:before, candidateSha256:after,
      testedMode, candidateMode, reason:unsupported ? 'Unsupported product file type/target closure'
        : testedMode !== candidateMode ? 'Product file mode/type changed' : 'Product input bytes changed'});
  }
  return changes;
}

function checkCaseLinks(row, raw, packageHash) {
  const snapshot = JSON.parse(raw.get(row.evidence));
  if (snapshot.session?.package?.packageHash !== packageHash)
    throw Error('Observed package identity differs from index');
  if (row.runId) {
    const stores = Object.values(snapshot.native?.stores || {});
    const results = stores.flatMap(store => store.results || []).filter(value =>
      value.tag === 'controller-result' && value.runId === row.runId && value.resultId === row.resultId);
    const runs = stores.flatMap(store => store.runs || []).filter(value => value.runId === row.runId);
    if (results.length !== 1 || runs.length !== 1) throw Error('Exact controller run/result not found');
    const result = results[0], run = runs[0];
    if (!row.resultRevision || !Object.entries(row.resultRevision).every(([key, value]) =>
          isDeepStrictEqual(result.revision?.[key], value)) ||
        result.revision?.sourceHash !== row.resultSourceHash || result.state !== row.state ||
        run.resultId !== row.resultId || !isDeepStrictEqual(run.target, row.target) || run.retirementState !== row.retirementState ||
        run.retirementState !== 'released' ||
        result.outcome?.ok !== (row.expectedError === null) ||
        (row.expectedError === null && result.state !== 'completed') ||
        (result.outcome?.error?.code || null) !== row.expectedError)
      throw Error('Controller revision, target, outcome or retirement differs from index');
  } else if (row.nativeReceipt) {
    const receipt = JSON.parse(raw.get(row.nativeReceipt)).receipt;
    if (receipt?.documentId !== row.receiptDocumentId || receipt?.frameId !== row.receiptFrameId ||
        receipt?.result?.format !== 'opendesk.page-preview-receipt.v1' || receipt?.result?.ok !== true)
      throw Error('Exact Page document/frame receipt differs from index');
  } else if (row.scriptId) {
    const revisions = Object.values(snapshot.native?.stores || {}).flatMap(store => store.scriptRevisions || []);
    const revision = revisions.find(value => value.scriptId === row.scriptId && value.revision === row.revision);
    if (!revision || revision.contentHash !== row.sourceHash || sha256(Buffer.from(revision.sourceUtf8)) !== row.sourceHash)
      throw Error('Saved revision bytes differ from index');
  } else throw Error('Unsupported case identity');
  return snapshot;
}

export async function checkProgramEvidence({indexPath, indexSha256, archiveRoot, repoRoot = process.cwd(),
  candidate = 'working-tree', packageSha256} = {}) {
  if (!HASH.test(indexSha256 || '')) throw Error('A trusted --index-sha256 is required');
  const indexBytes = await readFile(indexPath);
  if (sha256(indexBytes) !== indexSha256) throw Error('Evidence index SHA-256 mismatch');
  const index = JSON.parse(indexBytes);
  if (index.schemaVersion !== 1 || !/^[a-f0-9]{40}$/.test(index.sourceHead || '') ||
      !HASH.test(index.native?.packageHash || '') || !Array.isArray(index.rawFiles) || !index.rawFiles.length ||
      !Array.isArray(index.cases) || !index.cases.length || !Array.isArray(index.fixtureInputs) ||
      !index.fixtureInputs.length || index.fixtureInputs.some(row => !row.path || !HASH.test(row.sha256 || '')))
    throw Error('Incomplete Program evidence index');
  const root = await realpath(archiveRoot), raw = new Map(), issues = [];
  for (const row of index.rawFiles) {
    try {
      if (raw.has(row.path) || !HASH.test(row.sha256 || '') || !Number.isSafeInteger(row.bytes) || row.bytes < 0)
        throw Error('Duplicate or invalid raw-file identity');
      const bytes = await archiveFile(root, row.path);
      if (bytes.length !== row.bytes || sha256(bytes) !== row.sha256) throw Error('Raw bytes/SHA-256 mismatch');
      raw.set(row.path, bytes);
    } catch (error) { issues.push({path:row.path, reason:error.message}); }
  }
  const ids = new Set(), snapshots = new Map();
  for (const row of index.cases) {
    try {
      if (!row.caseId || ids.has(row.caseId) || row.status !== 'PASS' || !row.level?.startsWith('component-native') ||
          !raw.has(row.evidence) || row.nativeReceipt && !raw.has(row.nativeReceipt))
        throw Error('Duplicate, unsupported or unbound case');
      ids.add(row.caseId);
      snapshots.set(row.caseId, checkCaseLinks(row, raw, index.native.packageHash));
    } catch (error) { issues.push({caseId:row.caseId, reason:error.message}); }
  }
  const resolvedCandidate = candidate === 'working-tree' ? candidate
    : git(repoRoot, 'rev-parse', '--verify', `${candidate}^{commit}`).toString().trim();
  const changedInputs = await inputChanges(repoRoot, index.sourceHead, resolvedCandidate, index.fixtureInputs);
  const packageMatches = packageSha256 === index.native.packageHash;
  const decision = issues.length ? 'ARCHIVE_INVALID' : changedInputs.length ? 'AFFECTED_INPUTS'
    : !packageMatches ? 'PACKAGE_IDENTITY_UNCONFIRMED' : 'REUSE_RECORDED_COMPONENT_PASS';
  return {schemaVersion:1, workstreamId:index.workstreamId, indexSha256,
    archive:{root, status:issues.length ? 'INVALID' : 'INTEGRITY_VERIFIED',
      filesVerified:raw.size, filesIndexed:index.rawFiles.length, issues},
    testedIdentity:{sourceHead:index.sourceHead, native:index.native},
    requestedIdentity:{candidate:resolvedCandidate, packageSha256:packageSha256 || null},
    decision, changedInputs, impactScope:'conservative product/build and indexed fixtures; no automatic retest',
    cases:index.cases.map(row => {
      const snapshot = snapshots.get(row.caseId);
      return {caseId:row.caseId, recordedStatus:row.status, level:row.level,
        evidence:row.evidence, scope:row.scope || null, decision,
        recordedIdentity:row.runId ? {runId:row.runId, resultId:row.resultId, revision:row.resultRevision,
          target:row.target, retirementState:row.retirementState} : row.nativeReceipt
          ? {receipt:row.nativeReceipt, documentId:row.receiptDocumentId, frameId:row.receiptFrameId}
          : {scriptId:row.scriptId, revision:row.revision, sourceHash:row.sourceHash},
        recordedConditions:{permissions:snapshot?.native?.permissions || null,
          userScriptsAvailable:snapshot?.native?.userScriptsAvailable ?? null}};
    }),
    notTested:index.notTested, failedPreparation:index.failedPreparation,
    acceptance:'Historical component evidence only. No new native, installation, F3 or ZIP acceptance.',
    environment:'Recorded Chrome/origin/permissions/document lifecycle only; no current browser is inspected.'};
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const names = {'--index':'indexPath','--index-sha256':'indexSha256','--archive-root':'archiveRoot',
      '--repo-root':'repoRoot','--candidate':'candidate','--package-sha256':'packageSha256'};
    const options = {};
    for (let i = 2; i < process.argv.length; i += 2) {
      const key = names[process.argv[i]], value = process.argv[i + 1];
      if (!key || !value || value.startsWith('--') || Object.hasOwn(options, key)) throw Error('Invalid evidence checker arguments');
      options[key] = value;
    }
    const report = await checkProgramEvidence(options);
    console.log(JSON.stringify(report, null, 2));
    if (report.archive.status !== 'INTEGRITY_VERIFIED') process.exitCode = 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
