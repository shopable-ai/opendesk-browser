import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile, rm, symlink, chmod} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {checkProgramEvidence} from '../../scripts/check-program-evidence.mjs';

// Synthetic archive tests exercise refusal/reuse decisions, never native acceptance.
const hash = value => createHash('sha256').update(value).digest('hex');
async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'program-evidence-check-'));
  t.after(() => rm(root, {recursive:true, force:true}));
  const git = (...args) => execFileSync('git', args, {cwd:root, stdio:['ignore','pipe','pipe']}).toString().trim();
  git('init', '-q'); git('config', 'user.name', 'Validator Fixture'); git('config', 'user.email', 'fixture@example.invalid');
  await mkdir(path.join(root, 'src')); await mkdir(path.join(root, 'examples/tasks'), {recursive:true});
  await writeFile(path.join(root, 'src/main.js'), 'export const fixture = true;\n');
  await writeFile(path.join(root, 'examples/tasks/demo-form.html'), '<title>fixture</title>');
  git('add', '.'); git('commit', '-qm', 'Record validator fixture inputs');
  const sourceHead = git('rev-parse', 'HEAD'), sourceUtf8 = 'async function main(){return false;}';
  const revision = {scriptId:'draft:fixture-run', revision:1, sourceHash:hash(sourceUtf8)};
  const target = {documentId:'fixture-document', frameId:0};
  const result = {tag:'controller-result', runId:'fixture-run', resultId:'fixture-result',
    revision:{kind:'draft', ...revision}, state:'completed', outcome:{ok:true}};
  const index = {schemaVersion:1, workstreamId:'validator-only', sourceHead,
    native:{packageHash:hash('fixture-package')},
    cases:[{caseId:'controller', status:'PASS', level:'component-native', evidence:'raw.json',
      runId:result.runId, resultId:result.resultId, resultRevision:revision, resultSourceHash:revision.sourceHash,
      target, state:'completed', retirementState:'released', expectedError:null}],
    rawFiles:[], fixtureInputs:[{path:'examples/tasks/demo-form.html', sha256:hash('<title>fixture</title>')}],
    notTested:['installed/restart/F3/ZIP'], failedPreparation:[{status:'FAIL', reason:'viewport'}]};
  const snapshot = {session:{package:{packageHash:index.native.packageHash}}, native:{stores:{fixture:{results:[result], runs:[{runId:result.runId, resultId:result.resultId, target,
    retirementState:'released'}]}}}};
  const options = {repoRoot:root, archiveRoot:root, indexPath:path.join(root, 'index.json'),
    candidate:sourceHead, packageSha256:index.native.packageHash};
  const save = async () => {
    const bytes = JSON.stringify(snapshot);
    await writeFile(path.join(root, 'raw.json'), bytes);
    index.rawFiles = [{path:'raw.json', bytes:Buffer.byteLength(bytes), sha256:hash(bytes)}];
    await writeFile(options.indexPath, JSON.stringify(index));
    options.indexSha256 = hash(await readFile(options.indexPath));
  };
  await save();
  return {root, git, index, snapshot, options, save};
}

test('matching archive reuses only recorded component scope and retains untested/failed cases', async t => {
  const {options} = await fixture(t), report = await checkProgramEvidence(options);
  assert.equal(report.decision, 'REUSE_RECORDED_COMPONENT_PASS');
  assert.equal(report.archive.filesVerified, 1);
  assert.deepEqual(report.notTested, ['installed/restart/F3/ZIP']);
  assert.equal(report.failedPreparation[0].status, 'FAIL');
  assert.equal(report.cases[0].level, 'component-native');
});

test('documentation and observer changes alone do not invalidate product inputs', async t => {
  const {root, git, options} = await fixture(t);
  await writeFile(path.join(root, 'README.md'), 'Another chat, same product inputs.');
  await mkdir(path.join(root, 'tests/framework'), {recursive:true});
  await writeFile(path.join(root, 'tests/framework/observer.mjs'), 'console.log("observation format");');
  git('add', '.'); git('commit', '-qm', 'Change documentation and observation only');
  const report = await checkProgramEvidence({...options, candidate:'HEAD'});
  assert.equal(report.decision, 'REUSE_RECORDED_COMPONENT_PASS');
});

test('changed source, dependency, manifest and fixture are reported without rewriting old PASS', async t => {
  const {root, options} = await fixture(t);
  await writeFile(path.join(root, 'src/main.js'), 'export const fixture = false;');
  await writeFile(path.join(root, 'package-lock.json'), '{"new":"dependency"}');
  await writeFile(path.join(root, 'manifest.json'), '{"new":"permissions"}');
  await writeFile(path.join(root, 'examples/tasks/demo-form.html'), '<title>new fixture</title>');
  const report = await checkProgramEvidence({...options, candidate:'working-tree'});
  assert.equal(report.decision, 'AFFECTED_INPUTS');
  assert.deepEqual(report.changedInputs.map(row => row.path),
    ['examples/tasks/demo-form.html', 'manifest.json', 'package-lock.json', 'src/main.js']);
  assert.equal(report.cases[0].recordedStatus, 'PASS');
});

test('unknown or different package identity cannot authorize reuse', async t => {
  const {options} = await fixture(t);
  for (const packageSha256 of [undefined, hash('other')]) {
    assert.equal((await checkProgramEvidence({...options, packageSha256})).decision, 'PACKAGE_IDENTITY_UNCONFIRMED');
  }
});

test('trusted index hash rejects edited index', async t => {
  const {options} = await fixture(t);
  await writeFile(options.indexPath, '{}');
  await assert.rejects(checkProgramEvidence(options), /index SHA-256 mismatch/);
});

test('missing, changed and duplicate raw evidence prevents reuse', async t => {
  const {root, index, options, save} = await fixture(t);
  await rm(path.join(root, 'raw.json'));
  assert.equal((await checkProgramEvidence(options)).decision, 'ARCHIVE_INVALID');
  await save(); await writeFile(path.join(root, 'raw.json'), '{}');
  assert.equal((await checkProgramEvidence(options)).decision, 'ARCHIVE_INVALID');
  await save(); index.rawFiles.push(index.rawFiles[0]);
  await writeFile(options.indexPath, JSON.stringify(index)); options.indexSha256 = hash(await readFile(options.indexPath));
  assert.equal((await checkProgramEvidence(options)).decision, 'ARCHIVE_INVALID');
});

test('archive paths reject traversal and symlink escape', async t => {
  const {root, index, options} = await fixture(t);
  for (const file of ['../outside', '/absolute']) {
    index.rawFiles[0].path = file;
    await writeFile(options.indexPath, JSON.stringify(index)); options.indexSha256 = hash(await readFile(options.indexPath));
    assert.equal((await checkProgramEvidence(options)).decision, 'ARCHIVE_INVALID');
  }
  await symlink(process.execPath, path.join(root, 'escape'));
  index.rawFiles[0].path = 'escape';
  await writeFile(options.indexPath, JSON.stringify(index)); options.indexSha256 = hash(await readFile(options.indexPath));
  assert.equal((await checkProgramEvidence(options)).decision, 'ARCHIVE_INVALID');
});

test('service results, wrong revision/document and incomplete retirement cannot replace controller result', async t => {
  const {snapshot, options, save} = await fixture(t);
  const result = snapshot.native.stores.fixture.results[0], run = snapshot.native.stores.fixture.runs[0];
  for (const mutate of [() => {result.tag = 'controller-service-result';},
    () => {result.tag = 'controller-result'; result.revision.sourceHash = hash('different');},
    () => {result.revision.sourceHash = hash('async function main(){return false;}'); run.target = {documentId:'other', frameId:0};},
    () => {run.target = {documentId:'fixture-document', frameId:0}; run.retirementState = 'pending';}]) {
    mutate(); await save(); assert.equal((await checkProgramEvidence(options)).decision, 'ARCHIVE_INVALID');
  }
});

test('the observed package must match the indexed package', async t => {
  const {snapshot, options, save} = await fixture(t);
  snapshot.session.package.packageHash = hash('wrong package'); await save();
  assert.equal((await checkProgramEvidence(options)).decision, 'ARCHIVE_INVALID');
});

test('Page preview reuse requires its indexed exact-document native receipt', async t => {
  const {root, index, options, save} = await fixture(t);
  index.cases = [{caseId:'page', status:'PASS', level:'component-native-page-preview', evidence:'raw.json',
    nativeReceipt:'receipt.json', receiptDocumentId:'fixture-document', receiptFrameId:0}];
  const receipt = {receipt:{documentId:'fixture-document', frameId:0,
    result:{format:'opendesk.page-preview-receipt.v1', ok:true}}};
  const saveReceipt = async () => {
    await save(); const bytes = JSON.stringify(receipt); await writeFile(path.join(root, 'receipt.json'), bytes);
    index.rawFiles.push({path:'receipt.json', bytes:Buffer.byteLength(bytes), sha256:hash(bytes)});
    await writeFile(options.indexPath, JSON.stringify(index)); options.indexSha256 = hash(await readFile(options.indexPath));
  };
  await saveReceipt(); assert.equal((await checkProgramEvidence(options)).decision, 'REUSE_RECORDED_COMPONENT_PASS');
  receipt.receipt.documentId = 'other'; await saveReceipt();
  assert.equal((await checkProgramEvidence(options)).decision, 'ARCHIVE_INVALID');
  receipt.receipt.documentId = 'fixture-document'; receipt.receipt.result.ok = false; await saveReceipt();
  assert.equal((await checkProgramEvidence(options)).decision, 'ARCHIVE_INVALID');
});

test('saved revision identity must match complete source bytes', async t => {
  const {index, snapshot, options, save} = await fixture(t);
  const sourceUtf8 = 'full compiled program';
  index.cases = [{caseId:'saved', status:'PASS', level:'component-native', evidence:'raw.json',
    scriptId:'saved-fixture', revision:1, sourceHash:hash(sourceUtf8), scope:'save only; reload NOT_TESTED'}];
  const revision = {scriptId:'saved-fixture', revision:1, contentHash:hash(sourceUtf8), sourceUtf8};
  snapshot.native.stores.fixture.scriptRevisions = [revision];
  await save(); assert.equal((await checkProgramEvidence(options)).decision, 'REUSE_RECORDED_COMPONENT_PASS');
  revision.sourceUtf8 = 'entry snippet'; await save();
  assert.equal((await checkProgramEvidence(options)).decision, 'ARCHIVE_INVALID');
});

test('same bytes cannot hide a changed product file mode or symbolic-link target closure', async t => {
  const {root, git, options} = await fixture(t), file = path.join(root, 'src/main.js');
  await chmod(file, 0o755);
  assert.equal((await checkProgramEvidence({...options, candidate:'working-tree'})).decision, 'AFFECTED_INPUTS');
  git('add', 'src/main.js'); git('commit', '-qm', 'Change input mode');
  assert.equal((await checkProgramEvidence({...options, candidate:'HEAD'})).changedInputs[0].candidateMode, '100755');
  await rm(file); await symlink('export const fixture = true;\n', file);
  git('add', 'src/main.js'); git('commit', '-qm', 'Change input type keeping blob bytes');
  for (const candidate of ['HEAD', 'working-tree']) {
    const report = await checkProgramEvidence({...options, candidate});
    assert.equal(report.decision, 'AFFECTED_INPUTS');
    assert.equal(report.changedInputs[0].candidateMode, '120000');
    assert.equal(report.changedInputs[0].testedSha256, report.changedInputs[0].candidateSha256);
  }
});

test('contradictory or missing success outcome is rejected; explicit expected errors retain their scope', async t => {
  const {index, snapshot, options, save} = await fixture(t), result = snapshot.native.stores.fixture.results[0];
  for (const outcome of [{ok:false}, undefined]) {
    result.outcome = outcome; await save();
    assert.equal((await checkProgramEvidence(options)).decision, 'ARCHIVE_INVALID');
  }
  result.outcome = {ok:false, error:{code:'E_TIMEOUT'}}; result.state = 'failed';
  index.cases[0].expectedError = 'E_TIMEOUT'; index.cases[0].state = 'failed'; await save();
  assert.equal((await checkProgramEvidence(options)).decision, 'REUSE_RECORDED_COMPONENT_PASS');
});
