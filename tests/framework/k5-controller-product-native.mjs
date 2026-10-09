import assert from 'node:assert/strict';
import {inputIdentity} from '../../scripts/wxt-checkpoint.mjs';
import {api48Source} from './p4-api48-native-source.mjs';
import {nativeFailureOutcome, durableReadReady} from './k5-controller-product-native-outcome.mjs';
import {COOKIE_FAULT_IDS,installCookieFaultObserver,validateCookieFaultJournal} from './k5-controller-cookie-fault.mjs';
import {SCRIPT_CONTENT_ID,scriptContentPlan,validateScriptContentJournal} from './k5-controller-script-content.mjs';
import {captureStyleNode,readStyleNode} from './k5-controller-style-observer.mjs';
import {SCRIPT_SDK_ID,runScriptSdkOriginal} from './k5-controller-product-native-script-sdk.mjs';
import {armScriptResourceFailure} from './k5-controller-resource-fault.mjs';
import {SCRIPT_FENCE_ID} from './k5-controller-script-fence.mjs';
import {runScriptFenceOriginal} from './k5-controller-script-fence-native.mjs';
import {fixedReadFixtureHTML, originalReadFixtureFamily, originalReadPlan, originalReadPermission, loadOriginalApi48Catalog, ORIGINAL_READ_IDS, validateOriginalReadOracle,captureOriginalReadOutcome,captureOriginalCaseFailure,originalAdmittedRun} from './k5-controller-product-native-original-cases.mjs';
import {selectControllerSidebar, validateControllerSidebarAck} from './k5-controller-sidebar-entry.mjs';
import {runControllerCampaigns, CONTROLLER_CAMPAIGNS, RESOURCE_KEYS, requireResourceCounts} from './k5-controller-native-campaigns.mjs';
import {createServer} from 'node:http';
import {spawn, execFileSync} from 'node:child_process';
import {readFile, writeFile, mkdir, readdir, realpath, stat, open} from 'node:fs/promises';
import {appendFileSync} from 'node:fs';
import {createHash, randomUUID} from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {decodeValue, encodeValue, VALUE_PROTOCOL} from '../../src/platform/page-port/codec.js';
import {decodeValue as decodeControlValue, encodeValue as encodeControlValue} from '../../src/framework/control/value.js';

// Actual dist and product UI only. The SDK runner's raw WebSocket CDP pattern is
// deliberately reused without importing it (its module launches browsers).
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
assert.equal(process.cwd(), root, `Every invocation must use cwd=${root}`);
const launcherPath = '/Users/shopme/.codex/browser-testing/launch.py';
const launcherPython = '/usr/bin/python3';
const qualifiedLauncherSha256 = 'e9dfee561b6280eef106bd514f0835d0d5f9251919881c1d3cd15394430d8b74';
const launcherImplementationPath = '/Users/shopme/.codex/skills/chrome-testing-keychain/scripts/launch.py';
const qualifiedLauncherImplementationSha256 = '1b92b98e7442fdeae88dae0277604aedccfe487cfb8b80d9adf479c725398a36';
const previousRunnerSha256 = 'dd33ded5d8dc90efbb17342a0d03f59cb4acf7fb0894419b67e4605679d11d77';
const chromeVersions = {'138': '138.0.7204.183', '155': '155.0.8059.39'};
const chromeBinary = label => path.join(root, `tests/.cache/m5-browsers/${chromeVersions[label]}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`);
const args = process.argv.slice(2);
assert(!(args.includes('--native') && args.includes('--contract-check')), 'Contract-check and native execution are separate commands');
const sourceOnly = args.includes('--source-only');
const single = args.includes('--single');
const resourceCheck = args.includes('--resource-check');
assert(!resourceCheck || single, '--resource-check is a bounded single-run product observation, not a shortened campaign');
const campaignsRequested = args.includes('--campaigns');
const cookieFaultRequested=args.includes('--cookie-native-faults');
const scriptContentRequested=args.includes('--script-content-native');
assert(!scriptContentRequested||!cookieFaultRequested&&!single&&!resourceCheck&&!campaignsRequested&&!args.some(arg=>arg.startsWith('--original-api48')),'Script content observations use their own supplemental native lane');
assert(!cookieFaultRequested||!single&&!campaignsRequested&&!args.some(arg=>arg.startsWith('--original-api48')),
  'Cookie fault observations are a separate targeted native lane');
assert(args.filter(arg => arg.startsWith('--campaigns')).every(arg => arg === '--campaigns'), '--campaigns always runs the original 1000/10/2 counts');
assert(!campaignsRequested || !single, '--campaigns uses the frozen 27-case runner; --single is a separate diagnostic');
assert(!sourceOnly || args.includes('--contract-check') && !args.includes('--native'), '--source-only is a non-native contract-check for Main rebuild in progress');
const option = (name, fallback) => args.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3) || fallback;
const originalCaseOption = option('original-api48', null);
const originalRequested = originalCaseOption !== null;
const originalArgs = args.filter(arg => arg.startsWith('--original-api48'));
assert(originalArgs.length <= 1 && originalArgs.every(arg => arg.startsWith('--original-api48=') && arg.length > '--original-api48='.length), '--original-api48 requires one explicit original case ID list');
assert(!originalRequested || !single && !resourceCheck && !campaignsRequested && !args.some(arg => arg.startsWith('--cases')), 'Original cases use their own complete input/oracle lane');
const originalCatalog = originalRequested ? await loadOriginalApi48Catalog(root) : null;
const originalCaseIds = originalRequested ? originalCaseOption.split(',').map(id => id.trim()) : [];
assert(!originalRequested || originalCaseIds.length > 0 && new Set(originalCaseIds).size === originalCaseIds.length, 'Original case selection must be nonempty and unique');
for (const id of originalCaseIds) assert(ORIGINAL_READ_IDS.includes(id)||id===SCRIPT_SDK_ID||id===SCRIPT_FENCE_ID, `Original case lacks a complete native driver: ${id}`);
if(originalCaseIds.includes(SCRIPT_FENCE_ID))assert.equal(originalCaseIds.length,1,'Script fencing owns its complete before/after native lifecycle matrix');
const originalNeedsUserScripts = originalRequested && (originalCaseIds.includes(SCRIPT_SDK_ID)||originalCaseIds.includes(SCRIPT_FENCE_ID)||originalReadPermission(originalCaseIds));
if(originalCaseIds.includes(SCRIPT_SDK_ID)&&originalCaseIds.length>1)assert.equal(originalReadPermission(originalCaseIds.filter(id=>id!==SCRIPT_SDK_ID)),true,'SDK original cannot mix enabled and disabled native profiles');
const originalDefinitions = originalCaseIds.map(id => {
  const definition = originalCatalog.cases.find(row => row.id === id); assert(definition, `Missing immutable original contract: ${id}`); return definition;
});
const nativeSelection = option('native-selection', 'assist');
assert(['assist', 'cdp'].includes(nativeSelection), '--native-selection must be assist or cdp');
const modes = option('mode', 'all') === 'all' ? ['production', 'development'] : [option('mode')];
const labels = option('chrome', 'all') === 'all' ? ['138', '155'] : [option('chrome')];
const caseOption = option('cases', 'all');
assert(modes.every(x => ['production', 'development'].includes(x)));
assert(labels.every(x => ['138', '155'].includes(x)));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const errorView = error => ({code: error.code, name: error.name, message: error.message, stack: error.stack, actual: error.actual});
const evidenceRoot = path.join(root, 'docs/framework/evidence/f2-controller-product-native');
const output = path.join(evidenceRoot, `${args.includes('--native') ? 'native' : 'ready'}-${new Date().toISOString().replaceAll(':', '-')}-${randomUUID().slice(0, 8)}`);
await mkdir(output, {recursive: true});
function log(entry) {
  const row = {at: new Date().toISOString(), monoMs: performance.now(), runnerPid: process.pid, cwd: root, ...entry};
  const text = JSON.stringify(row); appendFileSync(path.join(output, 'stdout.jsonl'), text + '\n'); console.log(text);
}
async function json(file, value) { await writeFile(path.join(output, file), JSON.stringify(value, null, 2) + '\n'); }
async function fingerprint(directory) {
  const files = [];
  async function walk(prefix = '') {
    for (const entry of await readdir(path.join(directory, prefix), {withFileTypes: true})) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(relative);
      else if (entry.isFile()) { const bytes = await readFile(path.join(directory, relative)); files.push({path: relative, bytes: bytes.length, sha256: digest(bytes)}); }
      else throw new Error(`Unexpected input entry ${relative}`);
    }
  }
  await walk(); files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  return {files, packageHash: digest(JSON.stringify(files)), algorithm: 'SHA256 UTF-8 JSON.stringify(path-sorted {path,bytes,sha256} array)'};
}
async function sourceFingerprint() {
  const files = (await fingerprint(path.join(root, 'src'))).files.map(row => ({...row, path: `src/${row.path}`}));
  for (const relative of ['manifest.json', 'wxt.config.mjs', 'package.json', 'package-lock.json',
    ...(await readdir(path.join(root, 'scripts'))).filter(x => /\.(mjs|cjs|js)$/.test(x)).map(x => `scripts/${x}`),
    ...(await readdir(path.join(root, 'tests/framework'))).filter(x => x.startsWith('k5-controller-product-native') || x === 'k5-controller-native-campaigns.mjs' || x.startsWith('k5-sdk-native')).map(x => `tests/framework/${x}`)]) {
    const bytes = await readFile(path.join(root, relative)); files.push({path: relative, bytes: bytes.length, sha256: digest(bytes)});
  }
  files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  return {files, sourceHash: digest(JSON.stringify(files))};
}
let contracts = (single ? [['WXT-P3-RETURN7-REOPEN', 'USC03/CTRL03/EX08/RESOURCE', 'Real UI committed return 7; revision, params, exact document, permission, actual Worker, durable released run, reopened tool same runId value7']] : [
  ['NATIVE-USERSCRIPTS-UNAVAILABLE-RETIRES', 'P4/RESOURCE', 'Real disabled native capability yields typed failed result, released owned target, pin and slot before positive user-script tests'],
  ['OWNED-GOTO-TYPE-CLICK-WAIT-READ-RETURN', 'A01/NAV01/CMP09', 'Real owned page navigates; BaseAlice, Typed/clicked; HTTP effect and durable typed return agree'],
  ['P4-API48-WORKER-SEMANTICS', 'API48/P4', 'All 48 members exercise supported calls or typed capability denial in the actual bound Worker; this does not close original host-context or final matrix variants'],
  ['R1-PINNED-R2-SAVED-HEAD-DELETED', 'USC01/USC02/USC03', 'Running r1 remains pinned while UI saves r2 and tombstones head; r1 source/params/result stay unchanged until retirement; new start from another real host holding r2 is rejected E_TOMBSTONE'],
  ['BORROWED-EXACT-DOC-ACTIVE-DECOY', 'A01/A02/AUTH01', 'Explicit borrowed document changes; activated decoy and other documents do not; borrowed target survives'],
  ['BORROWED-CHILD-FRAME-EXACT-DOC', 'A02/AUTH01', 'Actual child document selected from native frame inventory; only child changes; top/decoy survive'],
  ...['false', 'zero', 'undefined', 'own-undefined', 'true', 'business'].map(kind => [`DURABLE-${kind.toUpperCase()}`, 'USC03/CMP03/CMP10', 'Typed durable value and UI read preserve kind/presence; business fields remain data']),
  ...['false', 'zero', 'undefined', 'own-undefined'].map(kind => [`DOWNLOAD-${kind.toUpperCase()}`, 'DLGEN01/DLGEN02', 'Product download UI; native complete receipt, actual disk bytes/hash, durable valueWire, original Blob revoked']),
  ['THROW', 'USC03/EX02', 'Actual Worker throw persists failed typed error exactly once'],
  ['REJECTION', 'USC03/EX02', 'Actual rejected Promise persists failed typed error exactly once'],
  ['MULTI-HOST-SLOT-COMPETITION', 'CTRL03/AUTH01', 'Two real product hosts contend; loser gets E_OWNER; no loser run/effect; winner retains slot'],
  ['STOP-PENDING-FENCE', 'CTRL01/LEAK01', 'Real UI stop during native page wait; durable cancel; no late page operation; borrowed target survives'],
  ...['navigation','revocation'].map(trigger => [`NATIVE-${trigger.toUpperCase()}-PENDING-FENCE`, 'NAV01/AUTH01', 'Actual native document or permission loss cancels the pending operation; no late effect, released slot and borrowed target survives']),
  ...['stop', 'deadline', 'host-close'].map(trigger => [`WORKER-INFINITE-${trigger.toUpperCase()}`, 'CTRL03/EX03/LEAK01', 'Actual loop CPU growth and native trace run/name/Blob/target/PID/thread correlation; physical cessation and exact target destroyed/absent <=3000ms; durable fence and retirement']),
  ['REOPEN-PERSISTENT-RESULT', 'USC03/CTRL03', 'Closing/reopening actual tool reads original durable outcome without executing old source'],
  ['CLEANUP-NO-SCRAPING-RECORDS', 'A01/LEAK01', 'Controller targets/frames retired, slot released; no template/row/seal/business run prerequisite']
]).map(([id, families, expected]) => ({id, families, expected, phase: 'F2', layer: 'actual product entry native Chrome', status: 'NOT_TESTED'}));
if (!single) assert.deepEqual(contracts.map(row => row.id), [
  'NATIVE-USERSCRIPTS-UNAVAILABLE-RETIRES',
  'OWNED-GOTO-TYPE-CLICK-WAIT-READ-RETURN',
  'P4-API48-WORKER-SEMANTICS',
  'R1-PINNED-R2-SAVED-HEAD-DELETED',
  'BORROWED-EXACT-DOC-ACTIVE-DECOY',
  'BORROWED-CHILD-FRAME-EXACT-DOC',
  'DURABLE-FALSE',
  'DURABLE-ZERO',
  'DURABLE-UNDEFINED',
  'DURABLE-OWN-UNDEFINED',
  'DURABLE-TRUE',
  'DURABLE-BUSINESS',
  'DOWNLOAD-FALSE',
  'DOWNLOAD-ZERO',
  'DOWNLOAD-UNDEFINED',
  'DOWNLOAD-OWN-UNDEFINED',
  'THROW',
  'REJECTION',
  'MULTI-HOST-SLOT-COMPETITION',
  'STOP-PENDING-FENCE',
  'NATIVE-NAVIGATION-PENDING-FENCE',
  'NATIVE-REVOCATION-PENDING-FENCE',
  'WORKER-INFINITE-STOP',
  'WORKER-INFINITE-DEADLINE',
  'WORKER-INFINITE-HOST-CLOSE',
  'REOPEN-PERSISTENT-RESULT',
  'CLEANUP-NO-SCRAPING-RECORDS'
], 'Frozen full native contract ids changed');
if (!single) contracts.push({id:'INCREMENTAL-WORKER-SERVICES',families:'T4/storage/network',expected:'Actual fixed Worker uses run-authorized HTTP and isolated typed storage; one server effect; no SDK admission',phase:'incremental',layer:'actual product entry native Chrome',status:'NOT_TESTED'});
if (originalRequested) contracts = originalDefinitions.map(definition => ({id:definition.id, families:definition.capabilityIds.join('/'), expected:definition.expected,
  contractSha256:digest(JSON.stringify(definition)), definition, phase:'F2/F3 original input', layer:'actual product entry native Chrome', status:'NOT_TESTED'}));
if(cookieFaultRequested)contracts=COOKIE_FAULT_IDS.map(id=>({id,families:'CMP04-API19/20-ERR;AUTH/unknown-effect',
  expected:'Real native set/remove lastError, exact product dispatch, conservative effect_unknown fence and released Worker',
  phase:'targeted native fault',layer:'actual product entry native Chrome',status:'NOT_TESTED'}));
if(scriptContentRequested)contracts=[{id:SCRIPT_CONTENT_ID,families:'RESOURCE01-API16/target-authority',expected:'Real saved controller modifies only the selected document through addScriptTag content; MAIN, USER_SCRIPT and Worker boundaries remain distinct',phase:'targeted page script semantics',layer:'actual product entry native Chrome',status:'NOT_TESTED'}];
const allCaseIds = new Set(contracts.map(row => row.id));
const selectedCaseIds = caseOption === 'all' ? new Set(allCaseIds) : new Set(caseOption.split(',').map(x => x.trim()).filter(Boolean));
assert(selectedCaseIds.size > 0, '--cases must name at least one case or use all');
for (const id of selectedCaseIds) assert(allCaseIds.has(id), `Unknown --cases id: ${id}`);
const explicitlySelectedIds = [...selectedCaseIds];
for (const id of explicitlySelectedIds) {
  if (id.startsWith('DOWNLOAD-')) selectedCaseIds.add(id.replace('DOWNLOAD-','DURABLE-'));
  if (id === 'REOPEN-PERSISTENT-RESULT') selectedCaseIds.add('DURABLE-OWN-UNDEFINED');
}

for (const row of contracts) {
  row.selected = selectedCaseIds.has(row.id);
  if (!row.selected) row.reason = 'Not selected by --cases';
}
const caseSelection = {option: originalCaseOption || caseOption, original:originalRequested, originalCatalog:originalCatalog?.binding,
  ...(originalRequested ? {originalCoverage:{denominator:603,api48Denominator:192,connectedDriverCases:[...ORIGINAL_READ_IDS],selectedCases:[...originalCaseIds],userScripts:originalNeedsUserScripts}} : {}),
  explicit: explicitlySelectedIds, prerequisites: [...selectedCaseIds].filter(id=>!explicitlySelectedIds.includes(id)), selected: [...selectedCaseIds], allSelected: selectedCaseIds.size === allCaseIds.size};
const f1Files = [
  ['docs/framework/reviews/migration-execution-v5/round-6/candidate/candidate-manifest.json', 'da4432720e75bbda7112f93d90829f1bfefd8790a1d7cecec09473bd1c6bc7d1'],
  ['docs/framework/reviews/m5-f1/final-candidate-v1/candidate-manifest.json', 'a9ce67f85964f2512212430d56b488b5b0e2c11f6afdff2ea562428c3e77da66'],
  ['docs/framework/reviews/m5-f1/architect/final-union-review.json', 'c886a6d89b65832ff0019cb214750808a2ddf256296b82f29e38f0c48ca74ea6'],
  ['docs/framework/reviews/m5-f1/code-reviewer/final-union-review.json', '7b2f9a86fc730a47804d9b197a4223a2225e8911fddbfe6b7f540a1ca813305f']
];
async function contractCheck() {
  const launcherBytes = await readFile(launcherPath);
  assert.equal(digest(await readFile(launcherImplementationPath)), qualifiedLauncherImplementationSha256, 'Current delegated fresh-profile launcher changed');
  assert.equal(digest(launcherBytes), qualifiedLauncherSha256, 'Global launcher changed since its complete lifecycle qualification; reread before adapting');
  const launcher = {implementationPath:launcherImplementationPath,implementationSha256:qualifiedLauncherImplementationSha256,python: launcherPython, path: launcherPath, sha256: digest(launcherBytes), bytes: launcherBytes.length,
    profileOwner: 'global launcher: fresh mkdtemp codex-cft-*; no runner profile writes',
    lifecycle: 'launcher stays running; owned Chrome Browser.close or launcher SIGTERM; launcher finally removes profile',
    nativeArgumentsProof: 'actual main PID/PPID and ps command plus Browser.getBrowserCommandLine; mock keychain/password-store/profile/loopback verified',
    logPreservation: 'read-only chrome.log file descriptor held across launcher unlink; bytes copied to evidence',
    resolveOnly: []};
  for (const label of labels) {
    const resolveArgs = [launcherPath, '--resolve-only', '--executable', chromeBinary(label)];
    const resolver = spawn(launcherPython, resolveArgs, {cwd: root, stdio: ['ignore', 'pipe', 'pipe']});
    let stdout = '', stderr = '', spawnError;
    resolver.stdout.on('data', bytes => { stdout += bytes; }); resolver.stderr.on('data', bytes => { stderr += bytes; });
    resolver.on('error', error => { spawnError = errorView(error); });
    const exit = await new Promise(resolve => resolver.once('close', (code, signal) => resolve({code, signal})));
    const record = {at: new Date().toISOString(), cwd: root, pid: resolver.pid, executable: launcherPython, args: resolveArgs, stdout, stderr, exit,
      spawnError, requestedVersion: chromeVersions[label], nativeExecuted: false};
    await json(`launcher-resolve-${label}.json`, record);
    assert.equal(exit.code, 0, `Global launcher resolve-only failed: ${stderr}`);
    record.resolvedExecutable = JSON.parse(stdout).executable;
    assert.equal(record.resolvedExecutable, await realpath(chromeBinary(label)), 'Exact requested binary must survive launcher resolution');
    launcher.resolveOnly.push(record);
  }
  assert.equal(digest(await readFile(path.join(evidenceRoot, 'launcher-adaptation-dd33/previous-runner-dd33.mjs'))), previousRunnerSha256, 'Preserved dd33 source drift');
  const predecessor = JSON.parse(await readFile(path.join(evidenceRoot, 'launcher-adaptation-dd33/preservation.json'), 'utf8'));
  for (const previousReady of [predecessor.previousReadyPath, path.join(evidenceRoot, 'launcher-adaptation-dd33/previous-ready-dd33.json')])
    assert.equal(digest(await readFile(previousReady)), predecessor.previousReadySha256, 'Original dd33 raw ready record must remain unchanged');
  const f1 = [];
  for (const [relative, expected] of f1Files) {
    const bytes = await readFile(path.join(root, relative)); assert.equal(digest(bytes), expected, `Frozen qualification drift: ${relative}`);
    const parsed = JSON.parse(bytes);
    if (relative.includes('final-union-review')) {
      assert.equal(parsed.authorOfCandidate, false); assert.equal(parsed.independent, true);
      assert.equal(parsed.verdict, 'APPROVE'); assert.equal(parsed.allF1ContractsPassed, true);
      assert.equal(parsed.candidateManifestSha256, f1Files[1][1]);
      assert.equal(parsed.coverage12.length, 12); assert(parsed.coverage12.every(x => x.verdict === 'PASS'));
    }
    f1.push({path: relative, bytes: bytes.length, sha256: digest(bytes)});
  }
  const editor = await readFile(path.join(root, 'src/ui/script-editor.js'), 'utf8');
  const html = await readFile(path.join(root, 'src/ui/tool.html'), 'utf8');
  for (const id of ['script-id', 'script-revision', 'script-source', 'script-params', 'script-save', 'script-load', 'script-delete', 'script-run',
    'script-stop', 'script-read', 'script-target-mode', 'script-owned-url', 'script-tab', 'script-document', 'script-download-result', 'script-download'])
    assert(html.includes(`id="${id}"`), `Required product UI missing: ${id}`);
  assert(editor.includes('row.outcome.valueWire'), 'UI must decode actual row.outcome.valueWire');
  assert(editor.includes('event.isTrusted') && editor.includes('permissions.request'), 'Product must request permission from trusted run click');
  assert(editor.includes("format:'typed-json'"), 'Download UI must request typed durable result artifact');
  assert(editor.includes('await host.controller.tombstoneControllerScript({scriptId:id,expectedRevision})'), 'Deletion UI must use the bound Host controller and expected revision');
  for (const value of [false, 0, undefined, {f: false, z: 0, u: undefined}, true, {PageBrigeCode: 9, ok: false, error: 'business', message: 'data'}]) {
    assert.deepEqual(decodeValue(JSON.parse(JSON.stringify(encodeValue(value)))), value);
    const controlWire = JSON.parse(JSON.stringify(encodeControlValue(value)));
    assert.deepEqual(decodeControlValue(controlWire), value);
    assert.deepEqual(decodeValue(JSON.parse(JSON.stringify(encodeValue(decodeControlValue(controlWire))))), value, 'Frozen private control codec to durable foundation wire');
  }
  const frozenSourceSlices = ['src/platform/page-port/codec.js', 'src/framework/control/value.js', 'src/framework/ChromePage.js',
    'src/platform/host/controller-methods.js', 'src/platform/storage/repository.js', 'src/platform/downloads/index.js',
    'src/platform/downloads/blob-lifecycle.js', 'src/run-host.js', 'src/ui/script-editor.js', 'src/ui/tool.html',
    'src/scripting/packaged/page-session.js', 'src/scripting/packaged/registry.js', 'src/scripting/sandbox/controller.js',
    'src/scripting/sandbox/worker-runtime.js', 'src/scripting/sandbox/page-proxy.js', 'src/scripting/sandbox/sandbox.js', 'wxt.config.mjs']
    .map(relative => { const row = sourceBefore.files.find(file => file.path === relative); assert(row, `Frozen source slice absent: ${relative}`); return row; });
  const controllerSource = await readFile(path.join(root, 'src/platform/host/controller-methods.js'), 'utf8');
  const startSource = controllerSource.slice(controllerSource.indexOf('async function startControllerRun('), controllerSource.indexOf('async function admittedOperation('));
  const durableAdmission = startSource.indexOf("await transaction.put('runs', run, runId)"), scriptPin = startSource.indexOf('await storage.pinScriptRevision(');
  const atomicPin = startSource.includes('request, transaction)') && startSource.includes("[...stores, 'scriptHeads', 'scriptRevisions']");
  const sourceObservations = durableAdmission >= 0 && scriptPin > durableAdmission && !atomicPin ? [{caseId: 'R1-PINNED-R2-SAVED-HEAD-DELETED', status: 'NOT_TESTED',
    attribution: 'frozen-product-source-contract-risk', source: 'src/platform/host/controller-methods.js',
    observed: 'Durable preparing run admission precedes script pin; pin E_TOMBSTONE is settled/retired while the run row is retained',
    expected: 'Original case requires E_TOMBSTONE and no new controller-run row; expectation is preserved',
    nativeVerificationRequired: true}] : [];
  assert.equal(new Set(contracts.map(x => x.id)).size, contracts.length);
  return {f1, launcher, previousRunnerSha256, frozenSourceSlices, sourceObservations, checked: ['Global launcher identity/lifecycle and exact binaries via resolve-only (no Chrome process)',
    'Preserved dd33 original runner', 'Frozen same-candidate independent F1 qualifications', 'Actual UI selectors/outcome/typed artifact contract',
    'Frozen control-to-foundation codec JSON-hop kind/presence assertions'], nativeExecuted: false};
}
const sourceBefore = await sourceFingerprint(); await json('source-manifest-before.json', sourceBefore);
const inputBindings = await inputIdentity();
const zipHashes=Object.fromEntries(await Promise.all(['production','development'].map(async mode=>[mode,digest(await readFile(path.join(root,'artifacts',`opendesk-browser-${mode}.zip`)))])));
await json('zip-bindings-before.json',zipHashes);
const runnerSha256 = digest(await readFile(fileURLToPath(import.meta.url)));
const packageBefore = {};
if (!sourceOnly) for (const mode of modes) { packageBefore[mode] = await fingerprint(await realpath(path.join(root, 'dist', mode))); await json(`${mode}-package-before.json`, packageBefore[mode]); }
let preflight;
try { preflight = await contractCheck(); }
catch (error) { await json('contract-failure.json', {status: 'FAIL', attribution: 'product-contract-or-qualification', error: errorView(error)}); log({state: 'contract-failed', error: errorView(error), output}); throw error; }
await json('contract-check.json', preflight); await json('cases.json', contracts);
if (!args.includes('--native')) {
  const after = await sourceFingerprint(); await json('source-manifest-after.json', after);
  const launcherAfterSha256 = digest(await readFile(launcherPath));
  assert.equal(launcherAfterSha256, preflight.launcher.sha256, 'Global launcher drift during contract check');
  const packageDrift = {};
  if (!sourceOnly) for (const mode of modes) { const afterPackage = await fingerprint(await realpath(path.join(root, 'dist', mode))); await json(`${mode}-package-after.json`, afterPackage); packageDrift[mode] = afterPackage.packageHash !== packageBefore[mode].packageHash; }
  const ready = {productInputsSha256:inputBindings.productInputsSha256,verificationInputsSha256:inputBindings.verificationInputsSha256,state: sourceOnly ? 'source-ready' : 'ready', runnerSha256, previousRunnerSha256, launcherSha256: launcherAfterSha256, sourceHash: sourceBefore.sourceHash, sourceDrift: sourceBefore.sourceHash !== after.sourceHash,
    sourceOnly, packageSnapshotState: sourceOnly ? 'NOT_TESTED_SOURCE_ONLY' : 'recorded-before-after',
    packages: sourceOnly ? null : Object.fromEntries(modes.map(mode => [mode, packageBefore[mode].packageHash])), packageDrift: sourceOnly ? null : packageDrift, cases: contracts.length,
    contractCheck: preflight, nativeExecuted: false, stage: 'F2', f3Accepted: false, original603Closed: false,
    blocked: ['Main stable rebuild receipt and exclusive execution window required before native launch'],
    receiptContract: {readyForControllerNative: true, runnerSha256, launcherSha256: launcherAfterSha256, sourceHash: 'fresh sourceHash from runner --contract-check AFTER rebuild',
      packages: {production: 'fresh packageHash', development: 'fresh packageHash'}, executionWindow: {lane: 'controller-product-native', sdkRunnerIdle: true}},
    command: `node tests/framework/k5-controller-product-native.mjs --native --headed --mode=all --chrome=all --rebuild-receipt=${evidenceRoot}/main-rebuild-receipt.json`, output};
  await json('ready.json', ready); log(ready); process.exitCode = ready.sourceDrift || Object.values(packageDrift).some(Boolean) ? 1 : 0;
} else {
  await nativeMain();
}

async function until(operation, description, ms = 15000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) { const result = await operation(); if (result) return result; await sleep(40); }
  const error = new Error(`Observation timed out: ${description}`); error.code = 'E_OBSERVATION_TIMEOUT'; throw error;
}
async function connect(url, label) {
  const socket = new WebSocket(url), pending = new Map(), listeners = new Set(); let sequence = 0, closed = false;
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  function record(direction, message) { appendFileSync(path.join(output, 'raw-cdp.jsonl'), JSON.stringify({at: new Date().toISOString(), monoMs: performance.now(), endpoint: label, direction, message}) + '\n'); }
  socket.onmessage = ({data}) => {
    const message = JSON.parse(data); record('received', message);
    if (!message.id) { for (const listener of listeners) listener({...message, observedMonoMs: performance.now(), observedAt: Date.now()}); return; }
    const waiter = pending.get(message.id); if (!waiter) return;
    pending.delete(message.id); clearTimeout(waiter.timer);
    if (message.error) { const error = new Error(JSON.stringify(message.error)); error.code = 'E_RUNNER_CDP'; waiter.reject(error); }
    else waiter.resolve(message.result);
  };
  const closedError = () => Object.assign(new Error(`${label} socket closed`), {code: 'E_RUNNER_CDP_CLOSED'});
  function rejectPending() { closed = true; for (const waiter of pending.values()) { clearTimeout(waiter.timer); waiter.reject(closedError()); } pending.clear(); }
  socket.onclose = rejectPending;
  return {send(method, params = {}) { return new Promise((resolve, reject) => {
    if (closed || socket.readyState !== 1) { reject(closedError()); return; }
    const id = ++sequence, message = {id, method, params};
    const timer = setTimeout(() => { pending.delete(id); const error = new Error(`${label} ${method} timeout`); error.code = 'E_RUNNER_CDP'; reject(error); }, 45000);
    pending.set(id, {resolve, reject, timer});
    try { record('sent', message); socket.send(JSON.stringify(message)); }
    catch (error) { pending.delete(id); clearTimeout(timer); reject(error); }
  }); }, get isOpen() { return !closed && socket.readyState === 1; }, onEvent: listener => listeners.add(listener), close: () => { rejectPending(); socket.close(); }};
}
async function evaluate(client, expression) {
  const raw = await client.send('Runtime.evaluate', {expression, returnByValue: true, awaitPromise: true});
  if (raw.exceptionDetails) { const error = new Error(JSON.stringify(raw.exceptionDetails)); error.code = 'E_RUNNER_EVALUATE'; throw error; }
  return raw.result.value;
}
function pidAlive(pid) { if (!Number.isInteger(pid) || pid <= 0) return false; try { process.kill(pid, 0); return true; } catch (error) { if (error.code === 'ESRCH') return false; throw error; } }
function launcherFailure(message, actual) { return Object.assign(new Error(message), {code: 'E_RUNNER_LAUNCHER', actual}); }
function startGlobalLauncher({binary, extension, absolute}) {
  const chromeArgs = ['--enable-automation', '--remote-debugging-port=0', `--load-extension=${extension}`, `--disable-extensions-except=${extension}`,
    ...(args.includes('--headed') ? [] : ['--headless=new']), 'about:blank'];
  const launcherArgs = [launcherPath, '--executable', binary, '--report', path.join(absolute, 'launcher-metadata.json'), ...chromeArgs];
  assert(!launcherArgs.includes('--'), 'Pass Chromium flags directly; no argparse separator');
  const startedAt = Date.now();
  const launcher = spawn(launcherPython, launcherArgs, {cwd: root, stdio: ['ignore', 'pipe', 'pipe']});
  const command = {at: startedAt, cwd: root, pid: launcher.pid, executable: launcherPython, args: launcherArgs, chromeArgs, launcherSha256: preflight.launcher.sha256};
  appendFileSync(path.join(absolute, 'launcher-command.json'), JSON.stringify(command, null, 2) + '\n');
  let stdout = '', stderr = '', launchError, exit, metadata, nativeLog, logPosition = 0, logText = '', capturePending = Promise.resolve();
  launcher.stdout.on('data', bytes => { stdout += bytes; appendFileSync(path.join(absolute, 'launcher-stdout.txt'), bytes); });
  launcher.stderr.on('data', bytes => { stderr += bytes; appendFileSync(path.join(absolute, 'launcher-stderr.txt'), bytes); });
  launcher.on('error', error => { launchError = errorView(error); });
  const exited = new Promise(resolve => launcher.once('close', (code, signal) => {
    exit = {at: Date.now(), code, signal, error: launchError};
    appendFileSync(path.join(absolute, 'launcher-exit.json'), JSON.stringify(exit, null, 2) + '\n'); resolve(exit);
  }));
  function keepAlive() {
    if (launchError || exit || !pidAlive(launcher.pid) || metadata && !pidAlive(metadata.pid))
      throw launcherFailure('Global launcher and owned Chrome must stay alive during native observations', {command, metadata, exit, launchError});
  }
  // Retain the read-only FD, not the launcher profile. On macOS, this also lets
  // us harvest the final Chrome stdout/stderr after launch.py unlinks chrome.log.
  function captureLog() {
    const read = async () => {
      if (!metadata) return;
      if (!nativeLog) nativeLog = await open(metadata.log, 'r');
      const buffer = Buffer.alloc(65536);
      for (;;) {
        const {bytesRead} = await nativeLog.read(buffer, 0, buffer.length, logPosition);
        if (!bytesRead) break;
        const bytes = buffer.subarray(0, bytesRead); logPosition += bytesRead;
        logText += bytes.toString('utf8'); appendFileSync(path.join(absolute, 'chrome-native.log'), bytes);
      }
    };
    const next = capturePending.then(read); capturePending = next.catch(() => {}); return next;
  }
  async function ready() {
    try { return await readReady(); }
    catch (error) { if (error.code?.startsWith('E_RUNNER')) throw error; throw launcherFailure('Global launcher readiness or actual main args failed', errorView(error)); }
  }
  async function readReady() {
    let profileStat;
    await until(async () => {
      keepAlive();
      const line = stdout.split('\n').find(value => value.trim().startsWith('{') && value.trim().endsWith('}'));
      if (!line) return false;
      metadata = JSON.parse(line);
      assert.equal(metadata.executable, binary, 'Launcher must select exact Chrome');
      assert(Number.isInteger(metadata.pid) && metadata.pid > 0 && metadata.pid !== launcher.pid, 'Actual native main PID is distinct from launcher PID');
      assert(path.basename(metadata.profile).startsWith('codex-cft-'), 'Only launcher-created fresh profile');
      assert.equal(metadata.log, path.join(metadata.profile, 'chrome.log'));
      assert.deepEqual(metadata.args, [binary, '--use-mock-keychain', '--password-store=basic', '--no-first-run', '--no-default-browser-check',
        '--disable-background-networking', '--remote-debugging-address=127.0.0.1', `--user-data-dir=${metadata.profile}`, ...chromeArgs]);
      profileStat = await stat(metadata.profile);
      assert.equal(profileStat.mode & 0o777, 0o700, 'Launcher profile must be private');
      assert(profileStat.birthtimeMs >= startedAt - 1000, 'Launcher profile must be fresh for this native process');
      await captureLog(); return true;
    }, 'global launcher metadata and fresh profile');
    const psArgs = ['-p', String(metadata.pid), '-ww', '-o', 'pid=,ppid=,command='];
    const ps = execFileSync('/bin/ps', psArgs, {cwd: root, encoding: 'utf8'});
    await writeFile(path.join(absolute, 'chrome-main-ps.txt'), ps);
    const match = ps.trim().match(/^(\d+)\s+(\d+)\s+([\s\S]+)$/);
    assert(match, 'Actual Chrome main process must be present');
    assert.equal(Number(match[1]), metadata.pid); assert.equal(Number(match[2]), launcher.pid, 'Global launcher must remain the native main process parent');
    for (const value of metadata.args) assert(match[3].includes(value), `Actual native ps args missing ${value}`);
    const endpoint = await until(async () => { keepAlive(); await captureLog(); return logText.match(/DevTools listening on (ws:\/\/\S+)/)?.[1]; }, 'launcher-owned native browser endpoint');
    const launch = {command, metadata, profileStat: {birthtimeMs: profileStat.birthtimeMs, mode: profileStat.mode & 0o777}, actualMainProcess: {psExecutable: '/bin/ps', psArgs, stdout: ps, pid: metadata.pid, ppid: launcher.pid}, endpoint};
    await writeFile(path.join(absolute, 'launcher-lifecycle-ready.json'), JSON.stringify(launch, null, 2) + '\n');
    return launch;
  }
  async function finish(browserClient) {
    const errors = [], state = (event, value = {}) => appendFileSync(path.join(absolute, 'launcher-lifecycle.jsonl'), JSON.stringify({event, at: Date.now(), monoMs: performance.now(), launcherPid: launcher.pid, chromePid: metadata?.pid, ...value}) + '\n');
    state('teardown-begin');
    await captureLog().catch(error => errors.push(errorView(error)));
    // Browser.close intentionally closes only our owned Chrome. Inspection
    // clients use socket.close(); the Python parent stays alive to run finally.
    if (browserClient) { if (browserClient.isOpen) await browserClient.send('Browser.close').catch(error => errors.push(errorView(error))); browserClient.close(); }
    else if (pidAlive(launcher.pid)) { state('launcher-sigterm'); launcher.kill('SIGTERM'); }
    let result = await Promise.race([exited, sleep(5000).then(() => null)]);
    if (!result && pidAlive(launcher.pid)) { state('launcher-sigterm-after-close-timeout'); launcher.kill('SIGTERM'); result = await Promise.race([exited, sleep(5000).then(() => null)]); }
    if (!result && metadata && pidAlive(metadata.pid)) {
      state('owned-native-main-sigkill-after-termination-timeout');
      try { process.kill(metadata.pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') errors.push(errorView(error)); }
      result = await Promise.race([exited, sleep(11000).then(() => null)]);
    }
    let finalLogCopied = false;
    await captureLog().then(() => { finalLogCopied = Boolean(nativeLog); }, error => errors.push(errorView(error)));
    await nativeLog?.close().catch(error => errors.push(errorView(error)));
    const profileRemoved = metadata ? await stat(metadata.profile).then(() => false, error => { if (error.code === 'ENOENT') return true; errors.push(errorView(error)); return false; }) : null;
    const cleanup = {exit: result, pidAlive: pidAlive(metadata?.pid), launcherPidAlive: pidAlive(launcher.pid), launcherPid: launcher.pid, chromePid: metadata?.pid,
      profile: metadata?.profile, profileOwner: 'global launcher', profileRemoved, profileRetainedForRawEvidence: false,
      nativeLogBytes: logPosition, nativeLogSha256: digest(await readFile(path.join(absolute, 'chrome-native.log')).catch(() => Buffer.alloc(0))),
      nativeLogPreservedAfterLauncherExit: Boolean(result && finalLogCopied && logPosition > 0),
      launcherStdoutBytes: Buffer.byteLength(stdout), launcherStderrBytes: Buffer.byteLength(stderr), errors};
    state('teardown-finished', cleanup); return cleanup;
  }
  return {ready, finish, keepAlive, captureLog, launcherPid: launcher.pid, chromeArgs};
}
async function nativeMain() {
  // This is a scheduling/build receipt, not a new approval gate. Old dist must
  // never be launched while main is editing/rebuilding or SDK owns permission UI.
  const receiptPath = option('rebuild-receipt');
  assert(receiptPath, '--native requires Main stable rebuild/exclusive-window notification');
  const receipt = JSON.parse(await readFile(path.resolve(root, receiptPath), 'utf8'));
  assert.equal(receipt.productInputsSha256,inputBindings.productInputsSha256); assert.equal(receipt.verificationInputsSha256,inputBindings.verificationInputsSha256);
  assert.equal(receipt.readyForControllerNative, true); assert.equal(receipt.runnerSha256, runnerSha256);
  assert.equal(receipt.launcherSha256, preflight.launcher.sha256, 'Rebuild receipt must bind the qualified global launcher');
  assert.equal(digest(await readFile(launcherPath)), preflight.launcher.sha256, 'Global launcher changed before launch');
  assert.equal(receipt.sourceHash, sourceBefore.sourceHash, 'Main rebuild source changed');
  assert.equal(receipt.executionWindow?.lane, 'controller-product-native'); assert.equal(receipt.executionWindow?.sdkRunnerIdle, true);
  for (const mode of modes) { assert.equal(receipt.packages?.[mode], packageBefore[mode].packageHash); assert(!packageBefore[mode].packageHash.startsWith('4fc301'), 'Forbidden old dist'); }
  await json('main-rebuild-receipt.json', receipt);
  const serverEvents = [], reports = [], originalBarriers = new Map();
  const server = createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks).toString('utf8'), url = new URL(req.url, 'http://127.0.0.1');
    const entry = {sequence: serverEvents.length + 1, at: Date.now(), monoMs: performance.now(), method: req.method, url: req.url, headers: req.headers, body, bodySha256: digest(body)};
    serverEvents.push(entry); appendFileSync(path.join(output, 'raw-http.jsonl'), JSON.stringify({event: 'request', ...entry}) + '\n');
    for (const event of ['finish', 'close']) res.on(event, () => appendFileSync(path.join(output, 'raw-http.jsonl'), JSON.stringify({event, at: Date.now(), sequence: entry.sequence, statusCode: res.statusCode}) + '\n'));
    res.setHeader('cache-control', 'no-store');
    if (url.pathname === '/original-api48-barrier') {
      const barrier = originalBarriers.get(url.searchParams.get('token'));
      if (!barrier || req.method !== 'GET' || barrier.request) { res.statusCode = 409; res.end('Unknown or duplicate original read barrier'); return; }
      barrier.request = entry; barrier.response = res;
      return; // The real Worker HTTP Promise remains pending until B is observed.
    }
    if (url.pathname === '/original-api48' || url.pathname === '/path/original-api48') {
      const role = url.searchParams.get('role');
      if (!['A','B'].includes(role)) { res.statusCode = 400; res.end('Invalid original fixture'); return; }
      const family = url.searchParams.get('family') || 'fixed';
      if (!['fixed','selector','click-error','input-actions','type-error','cookie','cookie-set','cookie-delete'].includes(family)) { res.statusCode=400; res.end('Invalid original fixture family'); return; }
      if ((url.pathname === '/path/original-api48') !== (family.startsWith('cookie')&&role==='A')) { res.statusCode=400; res.end('Invalid original fixture path'); return; }
      if(url.searchParams.get('resourceFault')==='script-network'){
        if(role!=='A'||family!=='selector'){res.statusCode=400;res.end('Invalid script resource fault');return;}
        appendFileSync(path.join(output,'raw-http.jsonl'),JSON.stringify({event:'script-resource-network-fault-target',at:Date.now(),url:req.url,resourceBytesUnchanged:true})+'\n');
      }
      if (family==='cookie'&&role==='A')res.setHeader('set-cookie',['sid=a=b; Path=/; HttpOnly; SameSite=Lax','sid=path; Path=/path; HttpOnly; SameSite=Lax']);
      if (['cookie-set','cookie-delete'].includes(family))res.setHeader('set-cookie',role==='B'?['sid=B; Path=/; HttpOnly; SameSite=Lax']:
        [family==='cookie-set'?'sid=before; Path=/; HttpOnly; SameSite=Strict':'sid=a=b; Path=/; HttpOnly; SameSite=Lax','sid=path; Path=/path; HttpOnly; SameSite=Lax']);
      res.setHeader('content-type', 'text/html; charset=utf-8'); res.end(fixedReadFixtureHTML(role,family)); return;
    }
    if (url.pathname === '/observe') { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({observed: true})); return; }
    if (url.pathname === '/abc') { res.setHeader('content-type', 'text/plain'); res.end('abc'); return; }
    res.setHeader('content-type', 'text/html; charset=utf-8');
    const seed = url.searchParams.get('seed') || '', role = url.searchParams.get('role') || 'target';
    res.end(`<!doctype html><meta charset="utf-8"><title>Controller ${role}</title><input id="name" value="Base"><button id="submit">Submit</button><div id="result"></div><div id="marker">A</div><span class="item">one</span><span class="item">two</span><input id="file" type="file"><script>
      const seed=${JSON.stringify(seed)},role=${JSON.stringify(role)};
      const observe=data=>fetch('/observe?seed='+encodeURIComponent(seed)+'&role='+encodeURIComponent(role),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)});
      document.querySelector('#name').addEventListener('input',e=>observe({kind:'input',value:e.target.value}));
      document.querySelector('#submit').addEventListener('click',async()=>{const value=document.querySelector('#name').value;await observe({kind:'click',value});setTimeout(()=>{document.querySelector('#result').textContent='Hello '+value;document.querySelector('#result').dataset.done='true';observe({kind:'result',value});},120);});
      </script>${url.pathname === '/frames' ? `<iframe id="child" src="/form?seed=${encodeURIComponent(seed)}&role=child"></iframe>` : ''}`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  log({state: 'native-server-ready', runnerPid: process.pid, origin, output});
  try {
    nativeEnvironments: for (const mode of modes) for (const label of labels) {
      const report = await browserRun({mode, label, origin, serverEvents, originalBarriers}); reports.push(report);
      if (campaignsRequested && (report.error || report.campaigns?.status !== 'PASS')) break nativeEnvironments;
    }
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await json('raw-http-final.json', serverEvents); }
  const sourceAfter = await sourceFingerprint(); await json('source-manifest-after.json', sourceAfter);
  const inputAfter = await inputIdentity(); await json('input-bindings-after.json',inputAfter);
  const zipAfter=Object.fromEntries(await Promise.all(['production','development'].map(async mode=>[mode,digest(await readFile(path.join(root,'artifacts',`opendesk-browser-${mode}.zip`)))])));
  await json('zip-bindings-after.json',zipAfter);
  assert.deepEqual(zipAfter,zipHashes,'Actual ZIP bytes must remain frozen during native acceptance');

  const inputDrift = inputAfter.productInputsSha256!==inputBindings.productInputsSha256 || inputAfter.verificationInputsSha256!==inputBindings.verificationInputsSha256;
  const sourceDrift = sourceBefore.sourceHash !== sourceAfter.sourceHash || inputDrift;
  const summary = {stage: 'F2', reports: reports.map(x => ({mode: x.mode, label: x.label, pid: x.pid, launcherPid: x.launcherPid, launcherSha256: x.launcherSha256,
    extensionId: x.extensionId, packageHash: x.packageHash, cases: x.cases,
    campaigns: x.campaigns && {status:x.campaigns.status, requested:x.campaigns.requested, campaigns:x.campaigns.campaigns, stoppedAt:x.campaigns.stoppedAt},
    error: x.error, attribution: x.attribution, cleanup: x.cleanup, packageDrift: x.packageDrift, launcherDrift: x.launcherDrift})),
    sourceDrift, finalProductPassed: false, f3Accepted: false, original603Closed: false, frameworkFunctionalMigrationComplete: false,
    classification: sourceDrift || reports.some(x => x.packageDrift || x.launcherDrift) ? 'diagnostic-drift' : 'targeted-native-product-entry',
    caseSelection, campaignsRequested, campaignRequirements: CONTROLLER_CAMPAIGNS,
    notTested: ['Full original603', 'All 48 members', 'Independent SDK B05', 'Four crash barriers',
      ...(!campaignsRequested || reports.some(x => x.campaigns?.status !== 'PASS') ? ['1000 mixed rounds', '10 reconnect rounds', '2 plugin disable rounds'] : []),
      'Independent final package review'], serverClosed: true, output};
  // Merge observations only by actual occurrence id across the two real
  // environments. Development is kept separate from final production evidence.
  for (const mode of modes) {
    const byId = new Map();
    for (const report of reports.filter(row => row.mode === mode)) for (const record of report.campaigns?.records || []) {
      const actual = {...record, packageDrift: report.packageDrift, sourceDrift,
        pass: record.pass && !report.packageDrift && !sourceDrift};
      const previous = byId.get(actual.id);
      if (previous) {
        assert.equal(previous.productPackageSha256, actual.productPackageSha256);
        previous.observations.push(...actual.observations); previous.pass &&= actual.pass;
      } else byId.set(actual.id, {...actual, observations: [...actual.observations]});
    }
    await json(`campaigns-${mode}-results.json`, {mode, records: [...byId.values()],
      campaigns: reports.find(row => row.mode === mode)?.campaigns?.campaigns || {},
      allEnvironmentsObserved: reports.filter(row => row.mode === mode).length === labels.length,
      packageHash: packageBefore[mode].packageHash, sourceDrift, finalAcceptance: false});
  }
  await json('summary.json', summary); log({state: 'native-finished', output, sourceDrift});
  const selectedOrPrereqNotPassed = reports.some(x => x.cases.some(c => (c.selected || c.prerequisite) && c.status !== 'PASS'));
  if (sourceDrift || reports.some(x => x.error || x.packageDrift || x.launcherDrift || x.cleanup?.pidAlive || x.cleanup?.launcherPidAlive || x.cleanup?.profileRemoved !== true ||
    x.cleanup?.nativeLogPreservedAfterLauncherExit !== true || x.cleanup?.exit?.code !== 0 || campaignsRequested && x.campaigns?.status !== 'PASS') || selectedOrPrereqNotPassed) process.exitCode = 1;
}

async function browserRun({mode, label, origin, serverEvents, originalBarriers}) {
  const directory = `${mode}-${label}`, absolute = path.join(output, directory);
  await mkdir(path.join(absolute, 'downloads'), {recursive: true});
  const version = chromeVersions[label];
  const binary = await realpath(chromeBinary(label));
  const extension = await realpath(path.join(root, 'dist', mode));
  assert.equal(digest(await readFile(launcherPath)), preflight.launcher.sha256, 'Global launcher must remain qualified before each native process');
  assert.equal((await fingerprint(extension)).packageHash, packageBefore[mode].packageHash, 'Stable original package changed before native process');
  assert.equal((await sourceFingerprint()).sourceHash, sourceBefore.sourceHash, 'Stable source changed before native process');
  const manifest = JSON.parse(await readFile(path.join(extension, 'manifest.json'), 'utf8'));
  const report = {mode, label, binary, binarySha256: digest(await readFile(binary)), requestedVersion: version, launcherSha256: preflight.launcher.sha256,
    productInputsSha256:inputBindings.productInputsSha256, verificationInputsSha256:inputBindings.verificationInputsSha256, packageHash: packageBefore[mode].packageHash, sourceHash: sourceBefore.sourceHash, runnerSha256, stage: 'F2', f3Accepted: false, original603Closed: false,
    OS: {type: os.type(), release: os.release(), arch: os.arch()}, extension, manifest, cases: contracts.map(x => ({...x})), caseSelection, environment: {origin}};
  const clients = [], nativeEvents = [], traceEvents = [], seed = randomUUID();
  let browserClient, tool, toolId, target, decoy, frameTarget, traceComplete = 0;
  const nativeLauncher = startGlobalLauncher({binary, extension, absolute}); report.launcherPid = nativeLauncher.launcherPid;
  async function caseRun(id, operation, {prerequisite = false} = {}) {
    const row = report.cases.find(c => c.id === id); assert(row); const begin = performance.now();
    if (!row.selected && !prerequisite) {
      row.skippedAt = Date.now(); row.elapsedMs = performance.now() - begin;
      await json(`${directory}/case-${id}.json`, row); log({state: 'case', mode, label, id, status: row.status, selected: false});
      return null;
    }
    row.productInputsSha256=report.productInputsSha256; row.verificationInputsSha256=report.verificationInputsSha256; row.packageSha256=report.packageHash; row.browserVersion=version; row.startedAt = Date.now(); row.input = {}; row.evidence = {cdp: '../raw-cdp.jsonl', http: '../raw-http.jsonl'};
    if (prerequisite) row.prerequisite = true;
    try { nativeLauncher.keepAlive(); row.actual = await operation(row); nativeLauncher.keepAlive(); await nativeLauncher.captureLog(); row.status = 'PASS'; }
    catch (error) { Object.assign(row, nativeFailureOutcome(error)); row.error = errorView(error);
      if (tool) row.ui = await ui(tool).catch(() => null);
    }
    row.elapsedMs = performance.now() - begin; await json(`${directory}/case-${id}.json`, row); log({state: 'case', mode, label, id, status: row.status, attribution: row.attribution});
    if(row.retainedOriginalTargets)throw Object.assign(new Error('Original run retirement unresolved; remaining original cases not executed'),{code:'E_RUNNER_ORIGINAL_RETIREMENT_UNRESOLVED',actual:{caseId:id,originalError:row.error,retainedTargets:row.retainedOriginalTargets}});
    if (row.status === 'BLOCKED') throw Object.assign(new Error('Native permission still pending; remaining cases not executed'), {code: 'E_NATIVE_PERMISSION_WAIT', actual: row.error});
    if (row.status === 'NOT_TESTED') throw Object.assign(new Error('Required native observation unavailable; remaining cases not executed'), {code:row.error.code, actual:row.error});
    if (row.status === 'FAIL' && (single || originalRequested || row.ui?.text?.includes('E_EFFECT_UNKNOWN'))) throw Object.assign(new Error('Selected native case failed; remaining dependent cases not executed'), {code: row.error.code, actual: row.error});
    return row.status === 'PASS' ? row.actual : null;
  }
  async function targets() { return (await browserClient.send('Target.getTargets')).targetInfos; }
  async function attach(id) {
    const tab = await until(async () => (await (await fetch(`${report.debuggingURL}/json/list`)).json()).find(t => t.id === id && t.webSocketDebuggerUrl), 'actual target websocket');
    const client = await connect(tab.webSocketDebuggerUrl, `${mode}-${label}-${id}`); clients.push(client); client.onEvent(event => nativeEvents.push(event));
    return client;
  }
  async function openTool() {
    assert(args.includes('--headed') && args.includes('--native-ui-assist'),
      'Controller product UI requires the real Sidebar; catalog tabs and headless views are not the developer entry');
    const request = {state:'native-sidebar-assist', requestId:randomUUID(), mode, label,
      pid:report.pid, launcherPid:report.launcherPid, profile:report.profile,
      endpoint:report.endpoint, extensionId:report.extensionId,
      instruction:'Use trusted native UI to open this owned extension Sidebar. Do not create a catalog tab, mutate DOM, dispatch synthetic events, or invoke sidePanel.open through evaluation.'};
    request.ackPath = path.join(absolute, `native-sidebar-ui-ack-${request.requestId}.json`);
    await json(`${directory}/pending-native-sidebar.json`, request);log(request);
    const entry = await until(async () => {
      const worker = (await targets()).find(target => target.type === 'service_worker' && target.url === report.actualSW.url);
      if (!worker) return false;
      const observer = await attach(worker.targetId);
      let contexts;
      try {contexts = await evaluate(observer, "chrome.runtime.getContexts({contextTypes:['SIDE_PANEL']})");}
      finally {observer.close();}
      const observed = selectControllerSidebar({contexts, targets:await targets(), extensionId:report.extensionId});
      if (!observed) return false;
      await json(`${directory}/native-sidebar-context.json`, observed);
      let ack;
      try {ack = JSON.parse(await readFile(request.ackPath, 'utf8'));}
      catch (error) {if (error.code === 'ENOENT') return false; throw error;}
      return validateControllerSidebarAck(ack, request, observed);
    }, 'owned native Sidebar and trusted UI acknowledgement', Number(option('permission-timeout', '300000')));
    toolId = entry.target.targetId;
    tool = await attach(toolId); await tool.send('Page.enable');
    report.sidebarEntry = {request, ...entry, observedAt:Date.now()};
    await until(() => evaluate(tool, 'document.querySelector("#script-status")?.dataset.state === "results" && document.querySelector("#script-history")?.textContent.includes("runs") && document.documentElement.dataset.opendeskSurface !== "catalog"'), 'real Sidebar host authorized persistent history projection');
    await click(tool, toolId, '#tab-develop');
    await until(() => evaluate(tool, 'document.documentElement.dataset.opendeskTab === "develop" && !document.querySelector("#workbench-develop").hidden && !document.querySelector("#develop-dock").hidden'), 'trusted developer tab visible');
    for (const selector of ['#script-library-tools', '.developer-params', '#script-advanced', '#developer-results-panel']) {
      if (await evaluate(tool, `document.querySelector(${JSON.stringify(selector)})?.open === false`))
        await click(tool, toolId, `${selector} > summary`);
    }
    await json(`${directory}/native-sidebar-observed.json`, report.sidebarEntry);
    return {client: tool, targetId: toolId};
  }
  async function newPage(url) {
    const id = (await browserClient.send('Target.createTarget', {url})).targetId, client = await attach(id);
    await until(() => evaluate(client, 'document.readyState === "complete"'), 'real local HTTP page complete');
    return {id, client, url};
  }
  async function ui(client) { return evaluate(client, `({state:document.querySelector('#script-status').dataset.state,text:document.querySelector('#script-status').textContent,
    result:document.querySelector('#script-result').textContent,version:document.querySelector('#script-version').textContent,runId:document.querySelector('#script-run-id').value,
    download:document.querySelector('#script-download-status').textContent,runDisabled:document.querySelector('#script-run').disabled,stopDisabled:document.querySelector('#script-stop').disabled})`); }
  async function click(client, id, selector) {
    if (args.includes('--native-ui-assist') && nativeSelection === 'assist') {
      const request = {state:'native-click-assist', mode, label, pid:report.pid,
        targetId:id, documentId:id === toolId ? report.sidebarEntry.context.documentId : null,
        selector, requestId:randomUUID(), instruction:'Click this actual visible product control with trusted native input; observe the current window first. Do not mutate DOM or dispatch synthetic events.'};
      request.ackPath = path.join(absolute, `native-click-ui-ack-${request.requestId}.json`);
      await json(`${directory}/pending-native-click.json`, request); log(request);
      await until(async () => {
        let ack;
        try {ack=JSON.parse(await readFile(request.ackPath,'utf8'));}
        catch (error) {if(error.code==='ENOENT')return false;throw error;}
        return ack.requestId===request.requestId && ack.pid===request.pid &&
          ack.targetId===id && ack.documentId===request.documentId && ack.selector===selector &&
          ack.nativeClickComplete===true && ack.noDomAssignment===true && ack.noSyntheticEvent===true;
      }, `trusted native product click ${selector}`, Number(option('permission-timeout','120000')));
      return;
    }
    await browserClient.send('Target.activateTarget', {targetId: id});
    const point = await evaluate(client, `(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('missing selector');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2,disabled:e.disabled};})()`);
    if (point.disabled) { const error = new Error(`Disabled product action ${selector}`); error.code = 'E_PRODUCT_UI_DISABLED'; throw error; }
    await client.send('Input.dispatchMouseEvent', {type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1});
    await client.send('Input.dispatchMouseEvent', {type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1});
  }
  async function fill(client, id, selector, value) {
    if (args.includes('--native-ui-assist') && nativeSelection === 'assist') {
      const request = {state:'native-input-assist', mode, label, pid:report.pid,
        targetId:id, documentId:id === toolId ? report.sidebarEntry.context.documentId : null,
        selector, desired:String(value), requestId:randomUUID(),
        instruction:'Use trusted native input to focus, select all and enter this exact field value; no DOM assignment or synthetic events.'};
      request.ackPath=path.join(absolute, `native-input-ui-ack-${request.requestId}.json`);
      await json(`${directory}/pending-native-input.json`,request);log(request);
      const after=await until(async()=>{
        const observed=await evaluate(client, `(()=>{const e=document.querySelector(${JSON.stringify(selector)});return{focused:document.activeElement===e,value:e.value};})()`);
        if(!observed.focused || observed.value!==request.desired)return false;
        let ack;
        try {ack=JSON.parse(await readFile(request.ackPath,'utf8'));}
        catch(error){if(error.code==='ENOENT')return false;throw error;}
        return ack.requestId===request.requestId && ack.pid===request.pid && ack.targetId===id &&
          ack.documentId===request.documentId && ack.selector===selector && ack.desired===request.desired &&
          ack.nativeInputComplete===true && ack.noDomAssignment===true && ack.noSyntheticEvent===true && observed;
      }, `trusted native product input ${selector}`, Number(option('permission-timeout','120000')));
      appendFileSync(path.join(absolute,'ui-input.jsonl'),JSON.stringify({at:Date.now(),targetId:id,selector,expected:request.desired,actual:after.value,ackPath:request.ackPath,input:'trusted native UI assist and exact focused field readback'})+'\n');
      return;
    }
    await click(client, id, selector);
    await client.send('Input.dispatchKeyEvent', {type: 'rawKeyDown', key: 'a', code: 'KeyA', modifiers: 4, windowsVirtualKeyCode: 65, commands: ['selectAll']});
    await client.send('Input.dispatchKeyEvent', {type: 'keyUp', key: 'a', code: 'KeyA', modifiers: 4, windowsVirtualKeyCode: 65});
    const selected = await evaluate(client, `(()=>{const e=document.querySelector(${JSON.stringify(selector)});return{focused:document.activeElement===e,value:e.value,start:e.selectionStart,end:e.selectionEnd};})()`);
    if (!selected.focused || selected.start !== null && (selected.start !== 0 || selected.end !== selected.value.length))
      throw Object.assign(new Error(`Native selectAll did not select actual UI input ${selector}`), {code: 'E_RUNNER_UI_INPUT', actual: selected});
    await client.send('Input.insertText', {text: String(value)});
    const actual = await evaluate(client, `document.querySelector(${JSON.stringify(selector)}).value`);
    appendFileSync(path.join(absolute, 'ui-input.jsonl'), JSON.stringify({at: Date.now(), monoMs: performance.now(), targetId: id, selector, selected, expected: String(value), actual}) + '\n');
    if (actual !== String(value)) throw Object.assign(new Error(`Actual native UI input differs ${selector}`), {code: 'E_RUNNER_UI_INPUT', actual: {expected: String(value), actual, selected}});
  }
  async function select(client, selector, value, id = toolId) {
    const desired = String(value), inspect = () => evaluate(client, `(()=>{const e=document.querySelector(${JSON.stringify(selector)});return{selectedIndex:e.selectedIndex,value:e.value,focused:document.activeElement===e,options:[...e.options].map(o=>({value:o.value,text:o.text,disabled:o.disabled}))};})()`);
    const before = await inspect(), index = before.options.findIndex(option => option.value === desired);
    assert(index >= 0 && !before.options[index].disabled, 'Actual UI must contain the exact enabled option');
    if (before.value === desired) return before;
    if (args.includes('--native-ui-assist') && nativeSelection === 'assist') {
      const request = {state:'native-selection-assist',mode,label,pid:report.pid,launcherPid:report.launcherPid,
        endpoint:report.endpoint,targetId:id,selector,desired,optionIndex:index,before,requestId:randomUUID(),
        instruction:'Commit this exact option in the bound native Chrome window, then acknowledge completion only after the CUA action and readback finish; no DOM assignment or synthetic events'};
      request.ackPath=path.join(absolute,`native-selection-ui-ack-${request.requestId}.json`);
      await json(`${directory}/pending-native-selection.json`,request); log(request);
      const after = await until(async()=>{
        const observed=await inspect(); if(observed.value!==desired)return false;
        try {const ack=JSON.parse(await readFile(request.ackPath,'utf8'));
          return ack.requestId===request.requestId && ack.pid===report.pid && ack.targetId===id &&
            ack.selector===selector && ack.desired===desired && ack.nativeInputComplete===true &&
            ack.noDomAssignment===true && ack.noSyntheticEvent===true && observed;
        } catch {return false;}
      },
        `native UI exact option ${selector}`,Number(option('permission-timeout','120000')));
      appendFileSync(path.join(absolute,'ui-selection.jsonl'),JSON.stringify({at:Date.now(),monoMs:performance.now(),
        targetId:id,selector,desired,before,after,ackPath:request.ackPath,input:'native UI assist; exact DOM readback and serial CUA completion acknowledgement'})+'\n');
      await json(`${directory}/pending-native-selection.json`,{...request,state:'selection-observed',after});
      return after;
    }
    await click(client, id, selector);
    const key = async (name, code) => {
      for (const type of ['keyDown', 'keyUp']) await client.send('Input.dispatchKeyEvent', {type, key: name, code: name, windowsVirtualKeyCode: code, modifiers: 0});
    };
    // Close the native popup, leaving the real select focused. Arrow keys cause
    // native selection/change events; no DOM value assignment/event substitute.
    await key('Escape', 27); const focused = await inspect();
    if (!focused.focused) throw Object.assign(new Error(`Native select lost focus: ${selector}`), {code: 'E_RUNNER_UI_SELECTION', actual: {before, focused, desired}});
    const delta = index - focused.selectedIndex;
    for (let step = 0; step < Math.abs(delta); step++) await key(delta < 0 ? 'ArrowUp' : 'ArrowDown', delta < 0 ? 38 : 40);
    await key('Enter', 13);
    const after = await inspect();
    appendFileSync(path.join(absolute, 'ui-selection.jsonl'), JSON.stringify({at: Date.now(), monoMs: performance.now(), targetId: id, selector, desired, before, focused, after,
      input: 'trusted CDP mousePressed/mouseReleased and keyDown/keyUp'}) + '\n');
    if (after.value !== desired) throw Object.assign(new Error(`Native selection differs: ${selector}`), {code: 'E_RUNNER_UI_SELECTION', actual: {desired, before, after}});
  }
  async function snapshot(client = tool, filter = null) {
    return evaluate(client, `(async()=>{const filter=${JSON.stringify(filter)},databases=await indexedDB.databases();if(!databases.some(d=>d.name==='opendesk-browser'))throw Error('product DB does not exist');
      const rows=await new Promise((resolve,reject)=>{const request=indexedDB.open('opendesk-browser');request.onerror=()=>reject(request.error);request.onsuccess=()=>{
      const db=request.result,names=filter?.runId?['runs','results','commandJournal']:filter?.scriptId?['scriptRevisions']:[...db.objectStoreNames],tx=db.transaction(names,'readonly'),data={};for(const name of names){data[name]=[];const cursor=tx.objectStore(name).openCursor();cursor.onsuccess=()=>{const row=cursor.result;if(row){
      const match=!filter || filter.runId && (row.value.runId===filter.runId || name==='runs' && row.primaryKey==='@slot') || filter.scriptId && row.value.scriptId===filter.scriptId;
      if(match)data[name].push({key:row.primaryKey,value:row.value});row.continue();}};}tx.oncomplete=()=>{db.close();resolve(data);};tx.onabort=()=>reject(tx.error);};});return{databases,rows,...(filter?{filter}: {})};})()`);
  }
  async function commit(source, params, client = tool, id = toolId, scriptId = `native-${randomUUID()}`, snapshotFilter = null) {
    await fill(client, id, '#script-id', scriptId); await fill(client, id, '#script-source', source); await fill(client, id, '#script-params', JSON.stringify(params));
    const expectedHash=digest(Buffer.from(source,'utf8'));
    const previous=await snapshot(client, snapshotFilter), previousRevision=Math.max(0,...previous.rows.scriptRevisions.filter(x=>x.value.scriptId===scriptId).map(x=>x.value.revision));
    const expectedForm={scriptId,source,params:JSON.stringify(params)};
    const verifyForm=async stage=>{
      const observed=await evaluate(client,`({scriptId:document.querySelector('#script-id').value,source:document.querySelector('#script-source').value,params:document.querySelector('#script-params').value})`);
      appendFileSync(path.join(absolute,'ui-save-input.jsonl'),JSON.stringify({at:Date.now(),targetId:id,stage,expected:expectedForm,observed})+'\n');
      if(JSON.stringify(observed)!==JSON.stringify(expectedForm))throw Object.assign(new Error(`Native save form changed: ${stage}`),{code:'E_RUNNER_UI_INPUT',actual:{stage,expected:expectedForm,observed}});
    };
    await verifyForm('before-trusted-save');
    await click(client, id, '#script-save');
    await verifyForm('after-trusted-save');
    const committed=await until(async()=>{
      const snap=await snapshot(client, snapshotFilter),revision=Number(await evaluate(client,'document.querySelector("#script-revision").value'));
      const row=snap.rows.scriptRevisions.find(x=>x.value.scriptId===scriptId && x.value.revision===revision && revision>previousRevision && x.value.contentHash===expectedHash)?.value;
      const view=await ui(client);
      const savedUI=await evaluate(client, `(()=>{const e=document.querySelector('#script-list');return{value:e.value,text:e.selectedOptions[0]?.textContent};})()`);
      return row && savedUI.value===scriptId && savedUI.text===`${scriptId} · r${revision} · ${expectedHash}` && {snap,row,revision,view,savedUI};
    },'actual immutable revision and UI hash after trusted save');
    const {snap,row,revision}=committed;
    assert(row, 'Actual immutable revision exists'); assert.equal(row.sourceUtf8, source); assert.equal(row.contentHash, digest(Buffer.from(source, 'utf8')));
    await json(`${directory}/revision-${scriptId}-r${revision}.json`, row); return {scriptId, revision, sourceHash: row.contentHash, source, params};
  }
  async function chooseOwned(url, client = tool, id = toolId) { await select(client, '#script-target-mode', 'owned', id); await fill(client, id, '#script-owned-url', url); }
  async function chooseBorrowed(page, child = false, client = tool, id = toolId) {
    await select(client, '#script-target-mode', 'borrowed', id); await click(client, id, '#script-refresh');
    const tabId = await evaluate(client, `chrome.tabs.query({}).then(t=>t.find(x=>x.url===${JSON.stringify(page.url)})?.id)`); assert(Number.isInteger(tabId));
    await until(() => evaluate(client, `!!document.querySelector('#script-tab option[value="${tabId}"]')`), 'explicit tab option');
    await select(client, '#script-tab', tabId, id);
    const native = await evaluate(client, `chrome.webNavigation.getAllFrames({tabId:${tabId}})`);
    const chosen = native.find(x => child ? x.parentFrameId === 0 && x.frameId !== 0 : x.frameId === 0); assert(chosen?.documentId);
    await until(() => evaluate(client, `!!document.querySelector('#script-document option[value="${chosen.documentId}"]')`), 'exact document option');
    await select(client, '#script-document', chosen.documentId, id);
    return {tabId, frameId: chosen.frameId, documentId: chosen.documentId, url: chosen.url};
  }
  async function start(client = tool, id = toolId) {
    const previous = (await ui(client)).runId, permissionsBefore = await evaluate(client, 'chrome.permissions.getAll()');
    await click(client, id, '#script-run'); let latest, lastLogged = 0;
    try {
      return await until(async () => {
        latest = await ui(client);
        if (Date.now() - lastLogged > 3000) { lastLogged = Date.now(); const permissions = await evaluate(client, 'chrome.permissions.getAll()'); await json(`${directory}/native-permission-state.json`, {pid: report.pid, launcherPid: report.launcherPid, endpoint: report.endpoint, toolId: id, permissionsBefore, permissions, ui: latest}); log({state: 'permission-or-admission', mode, label, pid: report.pid, launcherPid: report.launcherPid, toolId: id, ui: latest}); }
        if (latest.state === 'error') { const error = new Error(latest.text); error.code = latest.text.match(/E_[A-Z_]+/)?.[0]; throw error; }
        return latest.runId && latest.runId !== previous && latest.runId;
      }, 'actual permission and product admission', Number(option('permission-timeout', '120000')));
    } catch (error) {
      if (latest?.state === 'authorizing') { error.code = 'E_NATIVE_PERMISSION_WAIT'; error.actual = {latest, permissionsBefore, permissionsAfter: await evaluate(client, 'chrome.permissions.getAll()')}; }
      throw error;
    }
  }
  async function durable(runId, client = tool, filtered = false) {
    return until(async () => { const snap = await snapshot(client, filtered ? {runId} : null), run = snap.rows.runs.find(x => x.value.runId === runId)?.value;
      const result = snap.rows.results.find(x => x.value.tag === 'controller-result' && x.value.runId === runId && x.value.resultId === run?.resultId)?.value;
      return result && run?.retirementState === 'released' && {run, result, snapshot: snap};
    }, `durable terminal and retirement ${runId}`, 40000);
  }
  async function readUI(runId, client = tool, id = toolId) {
    await fill(client, id, '#script-run-id', runId); const before = await ui(client); await click(client, id, '#script-read');
    return until(async () => {
      const view = await ui(client);
      // A trusted Read starts an async request; its preceding Start error is
      // still visible until that request renders its own projection.
      if (view.state === 'error' && (before.state !== 'error' || view.text !== before.text || view.result !== before.result)) throw new Error(view.text);
      // A same-run projection can already be visible before this trusted Read
      // settles. Observe its real client transport before accepting the view.
      const lifecycle = await evaluate(client, 'globalThis.OpenDeskResourceDiagnostics?.snapshot() ?? null');
      appendFileSync(path.join(absolute,'durable-read-observations.jsonl'),JSON.stringify({at:Date.now(),targetId:id,runId,view,lifecycle})+'\n');
      return durableReadReady(view,runId,lifecycle) && view;
    }, 'actual durable read UI');
  }
  async function run(source, params = {}, owned = false) {
    const revision = await commit(source, params);
    const selected = owned ? await chooseOwned(`${origin}/form?seed=${seed}&role=owned`) : await chooseBorrowed(target);
    const runId = await start(), terminal = await durable(runId); const view = await readUI(runId);
    assert.equal(terminal.result.revision.sourceHash, revision.sourceHash);
    return {...terminal, revision, selected, view};
  }
  const chain = `await page.goto(params.url); const typed=await page.type('#name',params.name); const clicked=await page.click('#submit'); await page.waitForSelector('#result[data-done="true"]'); return {typed,clicked,read:await page.snapshot('#result'),title:await page.title(),url:await page.url(),revision:params.revision,f:false,z:0,u:undefined};`;
  const typedCases = new Map();
  async function toolResources() {
    const lifecycle = await evaluate(tool, `(async()=>{const d=globalThis.OpenDeskResourceDiagnostics;
      return d && typeof d.snapshot==='function' ? await d.snapshot() : null;})()`);
    const nativeTargets = await targets(), workers = nativeTargets.filter(row => row.type === 'worker');
    const observation = {scope:lifecycle?.scope, counts:lifecycle?.counts, lifecycle, nativeTargets,
      hostTargetId:toolId, observedAt:Date.now(), readPath:'actual tool globalThis.OpenDeskResourceDiagnostics.snapshot()',
      observationMissing:lifecycle?.observationMissing || (lifecycle ? null : 'Product six-count lifecycle read is not connected')};
    const counts = requireResourceCounts(observation);
    assert.equal(lifecycle.scope, 'extension-tool-document');
    assert.equal(counts.workers, workers.length, 'Tool boundary must agree with the actual native Worker inventory');
    return observation;
  }
  async function scriptContentNative() {
    await caseRun(SCRIPT_CONTENT_ID,async row=>{
      const plan=scriptContentPlan(randomUUID());let runId=null,revision=null,retired=false;
      const observe=async page=>evaluate(page.client,`(()=>{const selector=${JSON.stringify(plan.params.selector)};
        return {nodeHTML:document.querySelector(selector)?.outerHTML??null,nodeCount:document.querySelectorAll(selector).length,
          marker:globalThis.__opendeskContentProof,documentURL:location.href};})()`);
      try {
        const beforeA=await observe(target),beforeB=await observe(decoy),resourcesBefore=await toolResources();
        revision=await commit(plan.source,plan.params);
        const selected=await chooseBorrowed(target);
        row.input={...plan,expectedWire:encodeValue(plan.expected),revision,selected,beforeA,beforeB};await json(`${directory}/${SCRIPT_CONTENT_ID}-input.json`,row.input);
        runId=await start();const actual=await durable(runId,tool,true);retired=actual.run.retirementState==='released';
        await json(`${directory}/${SCRIPT_CONTENT_ID}-terminal.json`,actual);
        assert.equal(actual.result.state,'completed');assert.equal(actual.result.outcome.ok,true);
        const value=decodeValue(actual.result.outcome.valueWire),afterA=await observe(target),afterB=await observe(decoy),resourcesAfter=await toolResources();
        const operations=actual.snapshot.rows.commandJournal.filter(r=>r.value.tag==='controller-operation'&&r.value.runId===runId).map(r=>r.value);
        await json(`${directory}/${SCRIPT_CONTENT_ID}-final-observations.json`,{afterA,afterB,resourcesBefore,resourcesAfter});
        const oracle=validateScriptContentJournal({...actual,operations,selected,revision,value,expected:plan.expected,
          resourcesBefore,resourcesAfter,beforeA,afterA,beforeB,afterB});
        return {...actual,revision,selected,value,operations,oracle,beforeA,afterA,beforeB,afterB,resourcesBefore,resourcesAfter,formalAccepted:false};
      } finally {
        if(runId&&!retired)try {
          const observed=await snapshot(tool,{runId}),known=observed.rows.runs.find(r=>r.value.runId===runId)?.value;
          await json(`${directory}/${SCRIPT_CONTENT_ID}-failure-before-cleanup.json`,observed);
          assert.equal(known?.revision.sourceHash,revision.sourceHash);
          if(!known.workerRetired&&await evaluate(tool,'!document.querySelector("#script-stop").disabled'))await click(tool,toolId,'#script-stop');
          const actual=await durable(runId,tool,true);await json(`${directory}/${SCRIPT_CONTENT_ID}-failure-after-cleanup.json`,actual);
        } catch(error){await json(`${directory}/${SCRIPT_CONTENT_ID}-cleanup-unresolved.json`,errorView(error));}
      }
    });
  }
  async function originalReads() {
    async function userScriptsObservation() {
      const worker = (await targets()).find(t => t.type === 'service_worker' && t.url === report.actualSW.url);
      assert(worker, 'Actual extension worker is missing');
      const observer = await attach(worker.targetId);
      try { return await evaluate(observer, '(async()=>{try{if(!chrome.userScripts?.getScripts)return{available:false,reason:"undefined API"};await chrome.userScripts.getScripts();return{available:true};}catch(e){return{available:false,reason:e.message}}})()'); }
      finally { observer.close(); }
    }
    async function pageObservation(page) {
      const tab = await evaluate(tool, `chrome.tabs.query({}).then(t=>t.find(x=>x.url===${JSON.stringify(page.url)}))`);
      assert(tab && Number.isInteger(tab.id));
      const frames = await evaluate(tool, `chrome.webNavigation.getAllFrames({tabId:${tab.id}})`), main = frames.find(frame => frame.frameId === 0);
      assert(main?.documentId);
      const view = await evaluate(page.client, `(()=>{const marker=document.querySelector('#screenshot-marker'),style=marker&&getComputedStyle(marker),rect=marker?.getBoundingClientRect();
        return {url:location.href,title:document.title,bodyHTML:document.body.innerHTML,documentCookie:document.cookie,inputValue:document.querySelector('#text')?.value??null,
          readonlyValue:document.querySelector('#readonly')?.value??null,
          styles:{color:document.querySelector('#marker')?getComputedStyle(document.querySelector('#marker')).color:null,head:Array.from(document.head.querySelectorAll('style')).map(node=>node.textContent)},
          screenshotMarker:marker?{color:style.backgroundColor,visible:style.visibility==='visible'&&style.display!=='none'&&style.opacity!=='0'&&rect.width>0&&rect.height>0}:null,
          inputEvents:typeof window.OpenDeskInputEventObservations?.read==='function'?window.OpenDeskInputEventObservations.read():null};})()`);
      return {...view, tabId:tab.id, frameId:main.frameId, documentId:main.documentId, nativeTargetId:page.id};
    }
    async function cookieFaults() {
      for(const id of COOKIE_FAULT_IDS)await caseRun(id,async row=>{
        const method=id===COOKIE_FAULT_IDS[0]?'set':'remove',family=method==='set'?'cookie-set':'cookie-delete';
        const aURL=`${origin}/path/original-api48?seed=${seed}&role=A&family=${family}`;
        const bURL=`${origin.replace('127.0.0.1','localhost')}/original-api48?seed=${seed}&role=B&family=${family}`;
        const aPage=await newPage(aURL),bPage=await newPage(bURL),token=randomUUID(),barrier={token};
        originalBarriers.set(token,barrier);
        const source=`await axiosx.get(params.nativeBarrierURL);const errors=[];try{await ${method==='set'?"page.setCookie({name:'__Secure-opendesk-native-failure',value:'blocked',secure:false,httpOnly:true,path:'/'})":"page.deleteCookie({name:'sid',path:'/'})"};errors.push('NATIVE_FALSE_SUCCESS');}catch(e){errors.push(e.code);}try{await page.setCookie({name:'opendesk-must-not-follow',value:'blocked'});errors.push('FOLLOWING_FALSE_SUCCESS');}catch(e){errors.push(e.code);}return errors;`;
        const params={nativeBarrierURL:`${origin}/original-api48-barrier?token=${token}`};
        let observer,observerClient,runId,actual,baseline,revision,selected,retired=false;
        try {
          revision=await commit(source,params);selected=await chooseBorrowed(aPage);
          if(!await evaluate(tool,'document.querySelector("#script-allow-cookies").checked'))await click(tool,toolId,'#script-allow-cookies');
          const beforeB=await pageObservation(bPage),resourcesBefore=await toolResources();
          runId=await start();
          await until(()=>barrier.request&&barrier.response&&!barrier.response.destroyed,'cookie fault held real HTTP admission barrier');
          baseline=await cookieObservation(selected,beforeB,bPage,true);
          assert.equal(baseline.permissions.bOriginGranted,false);
          const worker=(await targets()).find(t=>t.type==='service_worker'&&t.url===report.actualSW.url);assert(worker);
          observerClient=await attach(worker.targetId);
          observer=await installCookieFaultObserver({client:observerClient,method,until,source:await readFile(path.join(extension,'sw.js'),'utf8'),
            record:evidence=>json(`${directory}/${id}-native-observer.json`,evidence),
            ...(method==='remove'?{onSubmission:async submission=>{
              assert.equal(submission.details.name,'sid');assert.equal(submission.details.storeId,baseline.a.cookies[0].storeId);
              const pattern=`${new URL(origin).protocol}//${new URL(origin).hostname}/*`;
              const before=await evaluate(tool,`chrome.permissions.contains({origins:[${JSON.stringify(pattern)}]})`);assert.equal(before,true);
              const removed=await evaluate(tool,`chrome.permissions.remove({origins:[${JSON.stringify(pattern)}]})`);assert.equal(removed,true);
              const after=await evaluate(tool,`chrome.permissions.contains({origins:[${JSON.stringify(pattern)}]})`);assert.equal(after,false);
              return {kind:'real native host-permission revocation after authorized precheck before cookie.remove',pattern,before,removed,after,at:Date.now()};
            }}:{})});
          row.input={source,params,revision,selected,baseline,method,contractCaseId:method==='set'?'CMP04-API19-ERR':'CMP04-API20-ERR'};
          await json(`${directory}/${id}-input.json`,row.input);
          barrier.response.setHeader('content-type','application/json');barrier.response.end(JSON.stringify({released:true}));
          const native=await observer.complete();
          await observer.close();observer=null;observerClient.close();observerClient=null;
          const fenced=await until(async()=>{const observed=await snapshot(tool,{runId});
            const run=observed.rows.runs.find(r=>r.value.runId===runId)?.value;
            const operation=observed.rows.commandJournal.find(r=>r.value.runId===runId&&r.value.envelope?.operation.method===(method==='set'?'setCookie':'deleteCookie'))?.value;
            return operation?.state==='effect_unknown'&&operation.deliveryState==='fenced'&&{run,operation,snapshot:observed};
          },'real Cookie failure conservative effect fence');
          await json(`${directory}/${id}-fenced-before-stop.json`,fenced);
          if(!fenced.run.workerRetired) {
            assert.equal(await evaluate(tool,'document.querySelector("#script-run-id").value'),runId);
            assert.equal(await evaluate(tool,'document.querySelector("#script-stop").disabled'),false);
            await click(tool,toolId,'#script-stop');
          }
          actual=await durable(runId,tool,true);retired=actual.run.retirementState==='released';
          const operations=actual.snapshot.rows.commandJournal.filter(r=>r.value.tag==='controller-operation'&&r.value.runId===runId).map(r=>r.value);
          const oracle=validateCookieFaultJournal({...actual,operations,observer:native,method});
          if(method==='set')assert.equal(operations.find(o=>o.envelope?.operation.method==='setCookie').failure.code,'E_COOKIE_OPERATION');
          assert.equal(actual.result.revision.sourceHash,revision.sourceHash);
          const afterA=(await aPage.client.send('Network.getCookies',{urls:[aURL]})).cookies;
          const afterB=(await bPage.client.send('Network.getCookies',{urls:[bURL]})).cookies;
          function cookieValues(rows){return rows.map(c=>({name:c.name,value:c.value,domain:c.domain,path:c.path,httpOnly:c.httpOnly,secure:c.secure})).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));}
          assert.deepEqual(cookieValues(afterA),cookieValues(baseline.a.cookies),'Native failure must not change A cookies');
          assert.deepEqual(cookieValues(afterB),cookieValues(baseline.b.cookies),'Native failure must not change ungranted B cookies');
          const resourcesAfter=await toolResources();assert.deepEqual(resourcesAfter.counts,resourcesBefore.counts);
          return {...actual,revision,selected,oracle,native,afterA,afterB,resourcesBefore,resourcesAfter,formalAccepted:false};
        } finally {
          if(observer)await observer.close();if(observerClient)observerClient.close();
          if(barrier.response&&!barrier.response.writableEnded){barrier.response.statusCode=503;barrier.response.end('Cookie fault observation ended');}
          originalBarriers.delete(token);
          if(runId&&!retired) {
            const beforeCleanup=await snapshot(tool,{runId});
            await json(`${directory}/${id}-failure-before-cleanup.json`,beforeCleanup);
            const known=beforeCleanup.rows.runs.find(r=>r.value.runId===runId)?.value;
            assert.equal(known?.revision.sourceHash,revision.sourceHash,'Cleanup may only stop this exact admitted source');
            try {
              if(!known.workerRetired&&await evaluate(tool,'!document.querySelector("#script-stop").disabled'))await click(tool,toolId,'#script-stop');
              const terminal=await durable(runId,tool,true);retired=terminal.run.retirementState==='released';
              await json(`${directory}/${id}-failure-after-cleanup.json`,terminal);
            } catch(error) {await json(`${directory}/${id}-cleanup-unresolved.json`,errorView(error));}
          }
          await json(`${directory}/${id}-final-snapshot.json`,await snapshot(tool,runId?{runId}:null)).catch(()=>{});
          if(!runId||retired) {
            for(const page of [aPage,bPage])if((await targets()).some(t=>t.targetId===page.id))await browserClient.send('Target.closeTarget',{targetId:page.id});
          } else row.retainedOriginalTargets=[aPage.id,bPage.id];
        }
      });
    }
    async function cookieObservation(selected,beforeB,bPage,isolatedB=false) {
      const bURL=new URL(bPage.url),bOriginPattern=`${bURL.protocol}//${bURL.hostname}/*`;
      const observation=await evaluate(tool,`(async()=>{const cookies=await chrome.permissions.contains({permissions:['cookies']});
        const bOriginGranted=${isolatedB}?await chrome.permissions.contains({origins:[${JSON.stringify(bOriginPattern)}]}):null;
        const permissions={cookies,...(${isolatedB}?{bOriginPattern:${JSON.stringify(bOriginPattern)},bOriginGranted}:{})};
        if(!cookies)throw Object.assign(new Error('Actual cookie permission is missing after trusted Start'),{code:'E_RUNNER_ORIGINAL_COOKIE_PRECONDITION',actual:permissions});
        const stores=await chrome.cookies.getAllCookieStores();
        const matched=stores.filter(store=>store.tabIds.includes(${selected.tabId}));if(matched.length!==1)throw new Error('Actual cookie store is ambiguous');
        const read=async(tabId)=>{const frames=await chrome.webNavigation.getAllFrames({tabId}),frame=frames.find(frame=>frame.frameId===0);
          if(!frame)throw new Error('Actual cookie document is missing');return {tabId,frame,cookies:await chrome.cookies.getAll({url:frame.url,storeId:matched[0].id})};};
        const b=${isolatedB}?{tabId:${beforeB.tabId},frame:(await chrome.webNavigation.getAllFrames({tabId:${beforeB.tabId}})).find(f=>f.frameId===0)}:await read(${beforeB.tabId});
        return {permissions,stores,a:await read(${selected.tabId}),b};})()`);
      if(isolatedB) {observation.b.cookieSource='CDP.Network.getCookies';observation.b.cookies=(await bPage.client.send('Network.getCookies',{urls:[bPage.url]})).cookies;}
      return observation;
    }
    if(cookieFaultRequested) {await cookieFaults();return;}
    for (const definition of originalDefinitions) await caseRun(definition.id, async row => {
      if(definition.id===SCRIPT_FENCE_ID)return runScriptFenceOriginal(definition,row,{variantSelection:option('script-fence-variants',null),origin,seed,newPage,toolResources,getTool:()=>({client:tool,targetId:toolId}),openTool,browserClient,originalBarriers,chooseBorrowed,click,evaluate,until,snapshot,commit,json,directory,start,durable,readUI,targets,pageObservation,errorView,catalog:originalCatalog.binding});
      if(definition.id===SCRIPT_SDK_ID)return runScriptSdkOriginal(definition,row,{origin,seed,newPage,tool,toolId,browserClient,originalBarriers,chooseBorrowed,click,evaluate,until,select,option,pageObservation,sdkResources,snapshot,commit,json,directory,start,durable,readUI,targets,errorView,catalog:originalCatalog.binding});
      const token = randomUUID(), barrier = {token};
      const fixtureFamily=originalReadFixtureFamily(definition);
      const family = fixtureFamily==='fixed' ? '' : `&family=${fixtureFamily}`;
      const cookieFixture=fixtureFamily.startsWith('cookie'),cookieAction=['cookie-set','cookie-delete'].includes(fixtureFamily),resourceError=definition.id==='RESOURCE01-API16-ERR';
      const bOrigin=cookieAction?origin.replace('127.0.0.1','localhost'):origin;
      const aURL = `${origin}${cookieFixture?'/path':''}/original-api48?seed=${seed}&role=A${family}${resourceError?'&resourceFault=script-network':''}${cookieFixture?'':'#A-fragment'}`, bURL = `${bOrigin}/original-api48?seed=${seed}&role=B${family}${cookieFixture?'':'#B-fragment'}`,
        nextURL = `${origin}/original-api48?seed=${seed}&role=next${family}#next-fragment`;
      const plan = originalReadPlan(definition, {aURL, bURL, nextURL, barrierURL:`${origin}/original-api48-barrier?token=${token}`,styleBarrierURL:`${origin}/original-api48-barrier?token=${token}-style`,...(resourceError?{sdkURL:await evaluate(tool,"chrome.runtime.getURL('framework/sdk-main.js')"),sdkRoot:await evaluate(tool,"chrome.runtime.getURL('')")}: {})});
      const aPage = await newPage(aURL), bPage = await newPage(bURL);
      const resourceNetwork=[];
      if(resourceError){aPage.client.onEvent(event=>{if(event.method.startsWith('Network.'))resourceNetwork.push(event);});await aPage.client.send('Network.enable');}
      const resourceFailure=resourceError?await armScriptResourceFailure(aPage.client,plan.params.sdkURL):null;
      originalBarriers.set(token, barrier);
      if(plan.styleAction){barrier.style={token:`${token}-style`};originalBarriers.set(barrier.style.token,barrier.style);}
      row.input = {source:plan.source, params:plan.params, original:definition.input, expected:definition.expected,
        contractSha256:plan.contractSha256, sourceHashes:{[definition.source.path]:definition.source.sha256}, catalog:originalCatalog.binding};
      const needsCookies=plan.cookieRead||!!plan.cookieAction;
      let runId,revision,selected,aBefore,bBefore,before,originalFailure,startAttempted=false,targetsCloseAllowed=true;
      try {
        revision = await commit(plan.source, plan.params);selected = await chooseBorrowed(aPage);
        if(needsCookies&&!await evaluate(tool,'document.querySelector("#script-allow-cookies").checked'))await click(tool,toolId,'#script-allow-cookies');
        aBefore = await pageObservation(aPage);bBefore = await pageObservation(bPage);
        assert.equal(selected.documentId, aBefore.documentId);
        before = {resources:await toolResources(), userScripts:await userScriptsObservation()};
        if (before.userScripts.available !== plan.userScripts) throw Object.assign(new Error('Original function execution permission precondition differs'), {code:'E_RUNNER_ORIGINAL_PRECONDITION',actual:before.userScripts,expected:plan.userScripts});
        await json(`${directory}/original-${definition.id}-input.json`, {plan, revision, selected, aBefore, bBefore, before});
        startAttempted=true;runId = await start();
        await until(() => barrier.request && !barrier.response.destroyed, 'actual original Worker HTTP request before fixed read');
        barrier.pendingOperation = await until(async () => (await snapshot(tool,{runId})).rows.commandJournal.find(row =>
          row.value.tag === 'controller-operation' && row.value.runId === runId && row.value.state === 'dispatched' &&
          row.value.envelope?.operation.kind === 'service' && row.value.envelope.operation.method === 'AXIOS_GET' &&
          decodeControlValue(row.value.envelope.operation.args)[0].url === plan.params.nativeBarrierURL)?.value,
        'exact admitted Worker HTTP operation held before fixed read');
        barrier.pendingArgs = decodeControlValue(barrier.pendingOperation.envelope.operation.args);
        if(needsCookies) {
          before.cookieObservation=await cookieObservation(selected,bBefore,bPage,!!plan.cookieAction);
          before.cookieAdmission={runId,pendingRequestId:barrier.pendingOperation.envelope.requestId,observedAt:Date.now()};
          await json(`${directory}/original-${definition.id}-cookie-baseline.json`,{before,barrier:{request:barrier.request,pendingOperation:barrier.pendingOperation},selected});
          if(plan.cookieAction)assert.equal(before.cookieObservation.permissions.bOriginGranted,false,'Actual B host must be ungranted before barrier release');
        }
        await browserClient.send('Target.activateTarget', {targetId:bPage.id});
        const active = await until(async () => {
          const activeTab = await evaluate(tool, 'chrome.tabs.query({active:true,currentWindow:true}).then(t=>t[0])');
          const focusedB = await evaluate(bPage.client, 'document.hasFocus()');
          return activeTab?.id === bBefore.tabId && activeTab.url === bURL && focusedB && {activeTab,focusedB};
        }, 'actual B active and focused before original fixed read');
        barrier.release = {at:Date.now(),monoMs:performance.now(),...active};
        await json(`${directory}/original-${definition.id}-barrier.json`, {request:barrier.request,pendingOperation:barrier.pendingOperation,pendingArgs:barrier.pendingArgs,release:barrier.release,runId});
        appendFileSync(path.join(output,'raw-http.jsonl'),JSON.stringify({event:'original-read-release',caseId:definition.id,request:barrier.request,release:barrier.release,runId})+'\n');
        barrier.response.setHeader('content-type','application/json'); barrier.response.end(JSON.stringify({released:true}));
        if(plan.styleAction) {
          const style=barrier.style;
          await until(()=>style.request&&!style.response.destroyed,'actual original Worker held after style application');
          style.pendingOperation=await until(async()=>(await snapshot(tool,{runId})).rows.commandJournal.find(row=>
            row.value.tag==='controller-operation'&&row.value.runId===runId&&row.value.state==='dispatched'&&
            row.value.envelope?.operation.kind==='service'&&row.value.envelope.operation.method==='AXIOS_GET'&&
            decodeControlValue(row.value.envelope.operation.args)[0].url===plan.params.nativeStyleBarrierURL)?.value,'exact admitted Worker style barrier');
          style.held=await captureStyleNode(aPage.client,selected);style.heldAt=Date.now();
          await json(`${directory}/original-${definition.id}-style-held.json`,{runId,revision,selected,request:style.request,pendingOperation:style.pendingOperation,held:style.held,heldAt:style.heldAt});
          style.release={at:Date.now()};style.response.setHeader('content-type','application/json');style.response.end(JSON.stringify({released:true}));
        }
        const actual = await durable(runId);
        await json(`${directory}/original-${definition.id}-durable.json`,actual);
        const captured=await captureOriginalReadOutcome(actual,{a:()=>pageObservation(aPage),bAfter:()=>pageObservation(bPage),
          resources:()=>toolResources(),userScripts:()=>userScriptsObservation(),
          activeTab:()=>evaluate(tool,'chrome.tabs.query({active:true,currentWindow:true}).then(t=>t[0])'),focusedB:()=>evaluate(bPage.client,'document.hasFocus()'),
          ...(plan.styleAction?{styleAfter:async()=>{const held=barrier.style.held;return {backendNodeId:held.backendNodeId,objectId:held.objectId,view:await readStyleNode(aPage.client,held)};}}:{}),
          ...(plan.resourceError?{scriptResource:async()=>({...await evaluate(aPage.client,`({ready:typeof OpenDeskSDK!=="undefined",nodes:[...document.scripts].filter(s=>s.src===${JSON.stringify(plan.params.sdkURL)}).length})`),network:resourceNetwork,fault:resourceFailure.snapshot()})}:{}),
          ...(needsCookies?{cookieObservation:()=>cookieObservation(selected,bBefore,bPage,!!plan.cookieAction)}:{})});
        const {a,bAfter,resources,userScripts,activeTab,focusedB}=captured.reads,after={resources,userScripts,activeTab,focusedB,
          ...(needsCookies?{cookieObservation:captured.reads.cookieObservation}:{})};
        const observation = {value:captured.value,params:captured.params,readErrors:captured.readErrors,decodeErrors:captured.decodeErrors,before,after,selected,run:actual.run,result:actual.result,
          barrier:{request:barrier.request,pendingOperation:barrier.pendingOperation,pendingArgs:barrier.pendingArgs,release:barrier.release},aBefore,a,bBefore,bAfter,
          fixedReadOperations:actual.snapshot.rows.commandJournal.filter(row => row.value.tag === 'controller-operation' && row.value.runId === runId && row.value.envelope?.operation.method === plan.method).map(row=>row.value),
          pageOperations:actual.snapshot.rows.commandJournal.filter(row => row.value.tag === 'controller-operation' && row.value.runId === runId && row.value.envelope?.operation.kind !== 'service' && row.value.envelope?.operation.method !== 'waitForTimeout').map(row=>row.value),
          preambleOperations:actual.snapshot.rows.commandJournal.filter(row => row.value.tag === 'controller-operation' && row.value.runId === runId && row.value.envelope?.operation.method === 'waitForTimeout').map(row=>row.value),
          currentRunOperations:actual.snapshot.rows.commandJournal.filter(row => row.value.tag === 'controller-operation' && row.value.runId === runId).map(row=>row.value),
          cleanup:{before:before.resources.counts,after:after.resources?.counts??null}};
        if(plan.styleAction) {
          const style=barrier.style;
          observation.style={held:style.held,heldAt:style.heldAt,after:captured.reads.styleAfter,afterAt:Date.now(),
            barrier:{request:style.request,pendingOperation:style.pendingOperation,release:style.release},objectReleased:false};
          await aPage.client.send('Runtime.releaseObject',{objectId:style.held.objectId});style.objectReleased=true;observation.style.objectReleased=true;
        }
        // Save all actual inputs/results before validation, including failures.
        if(plan.resourceError)observation.scriptResource=captured.reads.scriptResource;
        await json(`${directory}/original-${definition.id}-observation.json`,observation);
        if(captured.readError)throw captured.readError;
        if(captured.decodeError)throw captured.decodeError;
        assert.deepEqual(captured.params,plan.params);
        if(!plan.inputAction)assert.deepEqual(a,aBefore,'Selected A document changed during fixed read');
        const oracle = validateOriginalReadOracle(plan,observation), view = await readUI(runId);
        return {...actual,revision,selected,view,observation,oracle,formalAccepted:false};
      } catch(error) {
        originalFailure=error;
        targetsCloseAllowed=!startAttempted;
        const readers=()=>tool.isOpen&&browserClient.isOpen?({snapshot:()=>snapshot(tool,runId?{runId}:null),ui:()=>ui(tool),a:()=>pageObservation(aPage),b:()=>pageObservation(bPage),resources:()=>toolResources(),
          ...(needsCookies&&selected&&bBefore?{cookies:()=>cookieObservation(selected,bBefore,bPage,!!plan.cookieAction)}:{})}):({channel:()=>{throw Object.assign(new Error('Failure inspection skipped: controlled CDP disconnected'),{code:'E_RUNNER_CDP_CLOSED'});}});
        const failure=await captureOriginalCaseFailure(error,{before:readers(),recordBefore:captured=>json(`${directory}/original-${definition.id}-failure-before-cleanup.json`,
          {plan,revision,selected,runId,before,aBefore,bBefore,barrier:{request:barrier.request,pendingOperation:barrier.pendingOperation,release:barrier.release},...captured}),
          cleanup:{identify:captured=>{const admitted=originalAdmittedRun(captured.before.reads.snapshot,plan,runId);if(admitted)runId=admitted.runId;return {knownRunId:runId??null,matchedRun:admitted};},
            release:()=>{const released=[];for(const pending of [barrier,barrier.style])if(pending?.response&&!pending.response.writableEnded){pending.response.statusCode=503;pending.response.end('Original observation failed before barrier release');released.push({token:pending.token??token,statusCode:503});}return {released};},
            stop:async captured=>{if(!captured.cleanup.results.identify?.matchedRun)return {attempted:false,reason:'No uniquely matched admitted run'};
              if(!tool.isOpen||!browserClient.isOpen)return {attempted:false,reason:'Controlled CDP disconnected; retirement remains unverified'};
              const snap=await snapshot(tool,{runId}),run=originalAdmittedRun(snap,plan,runId);
              if(run?.retirementState==='released')return {attempted:false,reason:'Run already released'};
              const view=await ui(tool);if(view.runId!==runId||view.stopDisabled)return {attempted:false,reason:'Exact admitted run Stop is unavailable',ui:view};
              await click(tool,toolId,'#script-stop');return {attempted:true,runId};},
            retirement:async captured=>{if(!captured.cleanup.results.identify?.matchedRun)return {observed:false,reason:'No uniquely matched admitted run'};
              if(!tool.isOpen||!browserClient.isOpen)return {observed:false,reason:'Controlled CDP disconnected; retirement remains unverified'};
              return {observed:true,...await durable(runId,tool,true)};}},after:readers()});
        targetsCloseAllowed=!startAttempted||failure.cleanup.results.retirement?.observed===true&&failure.cleanup.results.retirement.run.retirementState==='released';
        row.evidence.originalFailure=`original-${definition.id}-failure.json`;row.evidence.originalFailureBeforeCleanup=`original-${definition.id}-failure-before-cleanup.json`;
        await json(`${directory}/original-${definition.id}-failure.json`,{caseId:definition.id,runId,formalAccepted:false,targetsCloseAllowed,...failure}).catch(writeError=>{row.failureWriteError=errorView(writeError);});
        throw error;
      } finally {
        if(barrier.style) {
          const style=barrier.style;
          if(style.response&&!style.response.writableEnded){style.response.statusCode=503;style.response.end('Original style observation ended before release');}
          originalBarriers.delete(style.token);
          if(style.held&&!style.objectReleased)await aPage.client.send('Runtime.releaseObject',{objectId:style.held.objectId}).catch(error=>{row.styleObserverCleanupError=errorView(error);});
        }
        if (barrier.response && !barrier.response.writableEnded) { barrier.response.statusCode=503; barrier.response.end('Original case ended before barrier release'); }
        originalBarriers.delete(token);
        if(resourceFailure)await resourceFailure.dispose();
        if(!targetsCloseAllowed){row.retainedOriginalTargets=[aPage.id,bPage.id];log({state:'original-targets-retained-unresolved-retirement',caseId:definition.id,runId,targets:row.retainedOriginalTargets});}
        else {
          const closed=await Promise.allSettled([aPage,bPage].map(async page=>{if(browserClient.isOpen&&(await targets()).some(t=>t.targetId===page.id))await browserClient.send('Target.closeTarget',{targetId:page.id});}));
        const cleanupErrors=closed.flatMap((result,index)=>result.status==='rejected'?[{targetId:[aPage,bPage][index].id,error:errorView(result.reason)}]:[]);
        if(cleanupErrors.length){row.targetCleanupErrors=cleanupErrors;await json(`${directory}/original-${definition.id}-target-cleanup-errors.json`,cleanupErrors).catch(writeError=>{row.cleanupWriteError=errorView(writeError);});if(!originalFailure)throw closed.find(result=>result.status==='rejected').reason;}
        }
      }
    });
  }
  async function sdkResources(page, selected, includeHost = true) {
    const main = await evaluate(page.client, 'OpenDeskSDK.diagnostics()');
    // Read the existing relay in its exact admitted document. This inspection
    // cannot register a relay, install an SDK, change a grant or settle a request.
    const isolated = await evaluate(tool, `chrome.scripting.executeScript({target:{tabId:${selected.tabId},documentIds:[${JSON.stringify(selected.documentId)}]},
      world:'ISOLATED',func:()=>({relay:globalThis.__openDeskSdkRelayV1?.diagnostics(),sdk:!!globalThis.OpenDeskSDK,origin:location.origin})})`);
    assert.equal(isolated.length, 1); assert.equal(isolated[0].documentId, selected.documentId);
    assert.equal(isolated[0].frameId, selected.frameId); assert.equal(isolated[0].result.sdk, false);
    const relay = isolated[0].result.relay;
    assert.equal(main.scope, 'OpenDeskSDK'); assert.equal(relay?.scope, 'relay.window');
    const mainCounts = requireResourceCounts(main), relayCounts = requireResourceCounts(relay);
    if(!includeHost) {
      const counts=Object.fromEntries(RESOURCE_KEYS.map(key=>[key,mainCounts[key]+relayCounts[key]]));
      return {scope:'selected-sdk-document',counts,owners:{main,isolated},selected,observedAt:Date.now()};
    }
    const host = await toolResources(), counts = requireResourceCounts(host);
    for (const key of RESOURCE_KEYS) counts[key] += mainCounts[key] + relayCounts[key];
    return {scope:'tool-and-selected-sdk-document', counts, owners:{tool:host, main, isolated}, selected,
      nativeTargets:host.nativeTargets, observedAt:Date.now()};
  }
  async function controllerCampaigns() {
    const sessionId = randomUUID(), campaignDirectory = `${directory}/campaigns`;
    await mkdir(path.join(output, campaignDirectory), {recursive: true});
    const page = await newPage(`${origin}/form?seed=${seed}&role=campaign`);
    const sdkPage = await newPage(`${origin}/form?seed=${seed}&role=campaign-sdk`);
    const scriptId = `native-campaign-${sessionId}`;
    const executedRuns = new Set(), executedResults = new Set(), physicalWorkers = new Set();
    async function resources() { return sdkResources(sdkPage, sdkBootstrap.selected); }
    async function executeRound(kind, roundId, checkpoint) {
      const source = kind === 'success' ? 'return {marker:params.roundId,title:await page.title()};' :
        kind === 'error' ? 'await page.title(); throw new Error(params.roundId);' :
        kind === 'timeout' ? 'await page.title(); while(true){}' :
        "await page.waitForSelector('#campaign-never-'+params.roundId); await page.click('#submit'); return params.roundId;";
      const params = {roundId}, revision = await commit(source, params, tool, toolId, scriptId, {scriptId});
      const selected = await chooseBorrowed(page), eventStart = nativeEvents.length, httpStart = serverEvents.length;
      const beforeTargets = await targets(); assert(!beforeTargets.some(row => row.type === 'worker'));
      const input = {source, params, revision, selected, nativeHostTargetId: toolId};
      await checkpoint({input, beforeTargets});
      const runId = await start(); await checkpoint({input, runId, beforeTargets});
      let trigger;
      if (['cancel', 'navigation', 'host-close'].includes(kind)) {
        const pending = await until(async () => (await snapshot(tool, {runId})).rows.commandJournal.find(row =>
          row.value.runId === runId && row.value.tag === 'controller-operation' && row.value.state === 'dispatched'),
        'campaign actual dispatched wait before native fence');
        trigger = {at: Date.now(), monoMs: performance.now(), pending};
        if (kind === 'cancel') await click(tool, toolId, '#script-stop');
        else if (kind === 'navigation') {
          page.url = `${origin}/form?seed=${seed}&role=campaign&round=${roundId}`;
          trigger.navigation = await page.client.send('Page.navigate', {url: page.url});
          await until(() => evaluate(page.client, 'document.readyState === "complete"'), 'campaign replaced real document');
        } else {
          trigger.closedHostTargetId = toolId;
          trigger.close = await browserClient.send('Target.closeTarget', {targetId: toolId}); tool = null;
          await until(async () => !(await targets()).some(row => row.targetId === trigger.closedHostTargetId), 'campaign old host actually absent');
          await openTool(); trigger.reopenedHostTargetId = toolId;
          assert.notEqual(trigger.closedHostTargetId, toolId);
        }
        await checkpoint({input, runId, beforeTargets, trigger});
      }
      const terminal = await durable(runId, tool, true), view = await readUI(runId);
      assert(!executedRuns.has(runId), 'Every campaign execution has its own actual runId');
      assert(!executedResults.has(terminal.result.resultId), 'Every campaign execution has its own actual resultId');
      executedRuns.add(runId); executedResults.add(terminal.result.resultId);
      assert.equal(terminal.run.runId, runId); assert.equal(terminal.result.runId, runId);
      assert.equal(terminal.result.revision.sourceHash, revision.sourceHash);
      assert.equal(terminal.run.revision.sourceHash, revision.sourceHash);
      assert.equal(terminal.run.target.tabId, selected.tabId);
      assert.equal(terminal.run.target.frameId, selected.frameId);
      assert.equal(terminal.run.target.documentId, selected.documentId);
      assert.deepEqual(decodeValue(terminal.run.paramsWire), params);
      assert.equal(terminal.snapshot.rows.results.filter(row => row.value.runId === runId).length, 1);
      assert.equal(terminal.run.retirementState, 'released');
      assert.equal(terminal.snapshot.rows.runs.find(row => row.key === '@slot')?.value.currentRunId, null);
      if (kind === 'success') {
        assert.equal(terminal.result.state, 'completed'); assert.equal(terminal.result.outcome.ok, true);
        const value = decodeValue(terminal.result.outcome.valueWire); assert.equal(value.marker, roundId);
        assert.equal(value.title, await evaluate(page.client, 'document.title'));
      } else {
        assert.equal(terminal.result.outcome.ok, false);
        if (kind === 'error') { assert.equal(terminal.result.state, 'failed'); assert(terminal.result.outcome.error.message.includes(roundId)); }
        else assert.equal(terminal.result.outcome.error.code, {timeout: 'E_TIMEOUT', cancel: 'E_CANCELLED',
          navigation: 'E_DOCUMENT_REPLACED', 'host-close': 'E_HOST_CLOSED'}[kind]);
      }
      const workerCreated = await until(() => {
        const rows = nativeEvents.slice(eventStart).filter(event => event.method === 'Target.targetCreated' && event.params.targetInfo.type === 'worker');
        assert(rows.length <= 1, 'One actual campaign run cannot borrow another Worker'); return rows.length === 1 && rows[0];
      }, 'campaign actual Worker creation');
      const workerId = workerCreated.params.targetInfo.targetId;
      assert(!physicalWorkers.has(workerId), 'Physical Worker evidence cannot be borrowed from another execution');
      physicalWorkers.add(workerId);
      const workerDestroyed = await until(() => nativeEvents.slice(eventStart).find(event =>
        event.method === 'Target.targetDestroyed' && event.params.targetId === workerId), 'campaign native physical Worker destruction');
      const afterTargets = await targets(); assert(!afterTargets.some(row => row.targetId === workerId));
      assert(afterTargets.some(row => row.targetId === page.id), 'Campaign borrowed native page must survive retirement');
      if (['cancel', 'navigation', 'host-close'].includes(kind)) assert.equal(terminal.snapshot.rows.commandJournal.filter(row =>
        row.value.runId === runId && row.value.tag === 'controller-operation').length, 1, 'No late click admitted after fence');
      const http = serverEvents.slice(httpStart);
      assert(!http.some(row => row.method === 'POST' && row.url.includes('role=campaign') &&
        (() => { try { return JSON.parse(row.body).kind === 'click'; } catch { return false; } })()), 'No native late click effect after campaign fence');
      if (kind === 'timeout') assert(terminal.run.deadlineAt <= Date.now(), 'Use the saved native product deadline without shortening it');
      const actual = {input, runId, run: terminal.run, result: terminal.result,
        journal: terminal.snapshot.rows.commandJournal.filter(row => row.value.runId === runId),
        trigger, view, workerCreated, workerDestroyed, beforeTargets, afterTargets, http};
      await checkpoint(actual); return actual;
    }
    async function reconnect(kind, roundId, checkpoint) {
      if (kind === 'host') {
        const closed = await executeRound('host-close', `${roundId}-closed`, checkpoint);
        const recovered = await executeRound('success', `${roundId}-recovered`, checkpoint);
        assert.notEqual(closed.runId, recovered.runId);
        return {closed, recovered, profile: report.profile, pid: report.pid};
      }
      const original = await executeRound('success', `${roundId}-before-sw`, checkpoint);
      const oldHostId = toolId, workerURL = `chrome-extension://${report.extensionId}/sw.js`;
      const events = []; const serviceWorkerClient = tool;
      serviceWorkerClient.onEvent(event => events.push(event)); await serviceWorkerClient.send('ServiceWorker.enable');
      const oldTarget = (await targets()).find(row => row.type === 'service_worker' && row.url === workerURL); assert(oldTarget);
      const version = await until(() => events.flatMap(event => event.params?.versions || []).find(row =>
        row.scriptURL === workerURL && row.runningStatus === 'running' && row.targetId === oldTarget.targetId), 'campaign exact native SW version');
      const eventStart = nativeEvents.length;
      await checkpoint({original, stopInput: {version, oldTarget, oldHostId}});
      await serviceWorkerClient.send('ServiceWorker.stopWorker', {versionId: version.versionId});
      const destroyed = await until(() => nativeEvents.slice(eventStart).find(event => event.method === 'Target.targetDestroyed' &&
        event.params.targetId === oldTarget.targetId), 'campaign real SW destroyed event');
      const stoppedTargets = await targets(); assert(!stoppedTargets.some(row => row.targetId === oldTarget.targetId));
      assert(stoppedTargets.some(row => row.targetId === oldHostId), 'Stopping SW must not close the long-lived host');
      // The real extension document registers a fresh host and wakes the SW.
      // No runner message uses a fabricated sender or synthetic registration.
      await openTool(); const newHostId = toolId;
      const recoveredWorker = await until(async () => (await targets()).find(row => row.type === 'service_worker' &&
        row.url === workerURL && row.targetId !== oldTarget.targetId), 'campaign actual new SW target');
      const recoveredVersions = events.flatMap(event => event.params?.versions || []).filter(row => row.scriptURL === workerURL);
      await serviceWorkerClient.send('ServiceWorker.disable');
      await browserClient.send('Target.closeTarget', {targetId: oldHostId});
      await readUI(original.runId);
      const persisted = await snapshot(); assert.deepEqual(persisted.rows.results.find(row => row.value.runId === original.runId)?.value.outcome, original.result.outcome);
      const recovered = await executeRound('success', `${roundId}-after-sw`, checkpoint);
      assert.notEqual(original.runId, recovered.runId);
      return {original, version, oldTarget, oldHostId, newHostId, destroyed, stoppedTargets,
        recoveredWorker, recoveredVersions, recovered, profile: report.profile, pid: report.pid};
    }
    async function installCampaignSDK() {
      const selected = await chooseBorrowed(sdkPage);
      await click(tool, toolId, '#sdk-refresh');
      await until(() => evaluate(tool, `!!document.querySelector('#sdk-tab option[value="${selected.tabId}"]')`), 'campaign SDK exact tab');
      await select(tool, '#sdk-tab', selected.tabId);
      await until(() => evaluate(tool, `!!document.querySelector('#sdk-document option[value="${selected.documentId}"]')`), 'campaign SDK exact document');
      await select(tool, '#sdk-document', selected.documentId);
      const capability = '#sdk-capabilities input[value="storage.session"]';
      if (!await evaluate(tool, `document.querySelector(${JSON.stringify(capability)}).checked`)) await click(tool, toolId, capability);
      await click(tool, toolId, '#sdk-install');
      await until(() => evaluate(tool, 'document.querySelector("#sdk-status").dataset.state === "installed"'), 'campaign real trusted SDK install');
      const hello = await evaluate(sdkPage.client, 'OpenDeskSDK.ready()'); assert.equal(hello.ready, true);
      return {selected, hello};
    }
    async function pluginDisabled(roundId, checkpoint) {
      const disabled = await evaluate(tool, `({moduleStatus:document.querySelector('#scraping-panel')?.dataset.moduleStatus,
        text:document.querySelector('#scraping-panel')?.textContent})`);
      assert.equal(disabled.moduleStatus, 'MODULE_NOT_INSTALLED', 'Actual tool template module must be unregistered');
      const before = await snapshot();
      const {selected} = await installCampaignSDK();
      // SDK call occurs before ordinary JS starts: no live controller is used.
      assert(before.rows.runs.filter(row => row.value.tag === 'controller-run').every(row =>
        ['completed','failed','stopped','interrupted'].includes(row.value.state) && row.value.retirementState === 'released'),
      'Standalone SDK requires all controllers already retired');
      const sdk = await evaluate(sdkPage.client, `(async()=>{const hello=await OpenDeskSDK.ready(),key=${JSON.stringify(`campaign-${roundId}`)};
        const promise=OpenDeskSDK.AppLocal.setItem(key,{marker:${JSON.stringify(roundId)}}),isPromise=promise instanceof Promise;
        const set=await promise,value=await OpenDeskSDK.AppLocal.getItem(key);await OpenDeskSDK.AppLocal.removeItem(key);
        return{hello,isPromise,setKind:typeof set,value,diagnostics:OpenDeskSDK.diagnostics()};})()`);
      assert.equal(sdk.hello.ready, true); assert.equal(sdk.isPromise, true); assert.equal(sdk.value.marker, roundId); assert.equal(sdk.diagnostics.pending, 0);
      await checkpoint({disabled, selected, sdk});
      const ordinaryJS = await executeRound('success', roundId, checkpoint), after = await snapshot();
      for (const store of ['templates','templateRevisions','rows','seals']) {
        assert(!before.rows[store]?.length); assert(!after.rows[store]?.length);
      }
      const beforeKeys = new Set(before.rows.commandJournal.map(row => JSON.stringify(row.key)));
      const sdkJournal = after.rows.commandJournal.filter(row => row.value.tag === 'sdk-operation' &&
        !beforeKeys.has(JSON.stringify(row.key)) && row.value.tabId === selected.tabId && row.value.documentId === selected.documentId &&
        ['APPLOCAL_SETITEM','APPLOCAL_GETITEM','APPLOCAL_REMOVEITEM'].includes(row.value.method));
      assert.equal(sdkJournal.length, 3, 'Standalone old AppLocal facade must reach three actual broker operations');
      assert(sdkJournal.every(row => row.value.state === 'durable'));
      const sdkDurable = sdkJournal.map(({value: operation}) => {
        const run = after.rows.runs.find(row => row.value.runId === operation.runId)?.value;
        const result = after.rows.results.find(row => row.value.resultId === operation.resultId)?.value;
        assert.equal(run?.state, 'completed'); assert.equal(run?.resultId, operation.resultId);
        assert.equal(result?.runId, operation.runId); assert.equal(result?.opId, operation.opId);
        if (operation.method === 'APPLOCAL_GETITEM') assert.deepEqual(decodeValue(result.valueWire), sdk.value,
          'The old facade Promise must equal the original durable SDK receipt value');
        return {operation, run, result};
      });
      return {disabled, selected, sdk, sdkJournal, sdkDurable, ordinaryJS};
    }
    // Long-lived SDK relay/grant belongs to the initial numerical baseline.
    // The two disabled rounds reinject that same document and must not add
    // another listener/port or leave an old Promise behind.
    const sdkBootstrap = await installCampaignSDK();
    return runControllerCampaigns({sessionId, environmentId: `${mode}-chrome-${label}`,
      bindings: {packageHash: report.packageHash, sourceHash: report.sourceHash, productInputsSha256: report.productInputsSha256,
        verificationInputsSha256: report.verificationInputsSha256, runnerSha256},
      preconditions: {pid: report.pid, launcherPid: report.launcherPid, profile: report.profile,
        extensionId: report.extensionId, browserVersion: version, binarySha256: report.binarySha256,
        originalProductDeadlineMs: 30000, preciseBorrowedTargets: [page.id, sdkPage.id], sdkBootstrap},
      observeResources: resources, keepAlive: () => nativeLauncher.keepAlive(), log,
      execute: ({kind, roundId, checkpoint}) => ['host','sw'].includes(kind) ? reconnect(kind, roundId, checkpoint) :
        kind === 'plugin-disabled' ? pluginDisabled(roundId, checkpoint) : executeRound(kind, roundId, checkpoint),
      async saveRound(round) {
        const relative = `${campaignDirectory}/${round.id}.json`, bytes = JSON.stringify({round}, null, 2) + '\n';
        await writeFile(path.join(output, relative), bytes);
        return {path: path.relative(root, path.join(output, relative)), sha256: digest(bytes)};
      },
      saveManifest: manifest => json(`${campaignDirectory}/manifest.json`, {...manifest,
        records: manifest.records.map(row => ({id:row.id, kind:row.kind, pass:row.pass,
          occurrence:row.observations[0].occurrence, evidence:row.observations[0].evidence}))})});
  }
  try {
    report.launcher = await nativeLauncher.ready(); report.endpoint = report.launcher.endpoint;
    report.pid = report.launcher.metadata.pid; report.profile = report.launcher.metadata.profile; report.browserArgs = report.launcher.metadata.args;
    report.debuggingURL = `http://127.0.0.1:${new URL(report.endpoint).port}`;
    browserClient = await connect(report.endpoint, `${mode}-${label}-browser`);
    browserClient.onEvent(event => { nativeEvents.push(event); if (event.method === 'Tracing.dataCollected') traceEvents.push(...event.params.value); if (event.method === 'Tracing.tracingComplete') traceComplete++; });
    report.cdpVersion = await browserClient.send('Browser.getVersion'); assert.equal(report.cdpVersion.product.split('/').at(-1), version);
    report.completeVersion = report.cdpVersion.product;
    report.systemInfo = await browserClient.send('SystemInfo.getInfo');
    report.processInfo = await browserClient.send('SystemInfo.getProcessInfo');
    report.actualBrowserCommandLine = await browserClient.send('Browser.getBrowserCommandLine');
    const actualArgs = report.actualBrowserCommandLine.arguments;
    assert.equal(actualArgs[0], binary, 'Actual native argv must use exact executable');
    for (const argument of report.browserArgs) assert(actualArgs.includes(argument), `Actual Chrome argv missing ${argument}`);
    for (const prefix of ['--use-mock-keychain', '--password-store', '--remote-debugging-address', '--remote-debugging-port', '--user-data-dir', '--load-extension', '--disable-extensions-except'])
      assert.equal(actualArgs.filter(argument => argument.split('=')[0] === prefix).length, 1, `Native ${prefix} must be unique`);
    assert.equal(actualArgs.includes('--headless=new'), !args.includes('--headed'));
    await json(`${directory}/chrome-main-actual-argv.json`, {pid: report.pid, launcherPid: report.launcherPid, requestedVersion: version, version: report.cdpVersion,
      actual: report.actualBrowserCommandLine, ps: report.launcher.actualMainProcess, launcherMetadata: report.launcher.metadata});
    nativeLauncher.keepAlive();
    await browserClient.send('Target.setDiscoverTargets', {discover: true});
    await browserClient.send('Browser.setDownloadBehavior', {behavior: 'allow', downloadPath: path.join(absolute, 'downloads'), eventsEnabled: true});
    const sw = await until(async () => (await targets()).find(t => t.type === 'service_worker' && t.url.startsWith('chrome-extension://') && t.url.endsWith('/sw.js')), 'actual product SW');
    const swClient = await attach(sw.targetId); await swClient.send('Runtime.enable');
    const identity = await until(() => evaluate(swClient, 'globalThis.chrome?.runtime?.id && ({id:chrome.runtime.id,manifest:chrome.runtime.getManifest(),url:chrome.runtime.getURL("sw.js")})'), 'actual SW runtime.id');
    assert.deepEqual(identity.manifest, manifest); assert.equal(identity.url, sw.url); report.extensionId = identity.id; report.actualSW = {targetId: sw.targetId, ...identity};
    const scriptAvailability=await evaluate(swClient,'(async()=>{try{if(!chrome.userScripts?.getScripts)return{available:false,reason:"undefined API"};await chrome.userScripts.getScripts();return{available:true};}catch(e){return{available:false,reason:e.message}}})()');
    swClient.close(); // inspection disconnect only; never Browser.close here.
    if(!single && !cookieFaultRequested && (!originalRequested || originalNeedsUserScripts) && !scriptAvailability.available) {
      await openTool();
      if (!originalRequested&&!scriptContentRequested) await caseRun('NATIVE-USERSCRIPTS-UNAVAILABLE-RETIRES',async row=>{
        const actual=await run("return await page.$eval('#marker',el=>el.textContent);",{},true);
        assert.equal(actual.result.state,'failed');assert.equal(actual.result.outcome.error.code,'E_USER_SCRIPTS_UNAVAILABLE');
        assert.equal(actual.run.retirementState,'released');
        const pin=actual.snapshot.rows.commandJournal.find(x=>x.value.tag==='script-revision-pin' && x.value.runId===actual.run.runId)?.value;
        assert.equal(pin?.released,true);
        assert.equal(actual.snapshot.rows.runs.find(x=>x.value.tag==='slot')?.value.currentRunId,null);
        assert.equal(await evaluate(tool,`chrome.tabs.get(${actual.run.target.tabId}).then(()=>false,()=>true)`),true);
        return actual;
      }, {prerequisite: !selectedCaseIds.has('NATIVE-USERSCRIPTS-UNAVAILABLE-RETIRES')});

      assert(args.includes('--headed') && args.includes('--native-ui-assist'),'API48 requires the real extension Allow User Scripts setting');
      const settingsId=(await browserClient.send('Target.createTarget',{url:`chrome://extensions/?id=${report.extensionId}`})).targetId;
      await browserClient.send('Target.activateTarget',{targetId:settingsId});
      const request={state:'native-user-scripts-assist',mode,label,pid:report.pid,launcherPid:report.launcherPid,endpoint:report.endpoint,extensionId:report.extensionId,settingsId,initialWorkerId:sw.targetId,scriptAvailability,originalCaseIds,
        instruction:'Enable Developer mode for the owned test profile and Allow User Scripts for this exact test extension, then use its native Reload control so extension contexts refresh. No flags, manifest edits or private APIs.'};
      request.ackPath=path.join(absolute,'native-user-scripts-ui-ack.json');
      await json(`${directory}/pending-native-user-scripts.json`,request);log(request);
      await until(async()=>{try{const ack=JSON.parse(await readFile(request.ackPath,'utf8'));return ack.pid===report.pid && ack.settingsId===settingsId && ack.nativeToggleObserved===true && ack.nativeReloadClicked===true;}catch{return false;}},'native UI toggle and reload acknowledgement',Number(option('permission-timeout','300000')));
      // Extension service workers are lazy after native Reload. A fresh real tool
      // registers its host and wakes the new worker before observing its API.
      if((await targets()).some(t=>t.targetId===toolId))await browserClient.send('Target.closeTarget',{targetId:toolId});tool=null;
      await openTool();
      const available=await until(async()=>{
        const worker=(await targets()).find(t=>t.type==='service_worker' && t.url===sw.url && t.targetId!==sw.targetId);
        if(!worker){await sleep(500);return false;}
        const observer=await attach(worker.targetId);let availability;
        try{availability=await evaluate(observer,'(async()=>{try{if(!chrome.userScripts?.getScripts)return{available:false};await chrome.userScripts.getScripts();return{available:true,id:chrome.runtime.id};}catch(e){return{available:false,reason:e.message}}})()');}finally{observer.close();}
        if(!availability.available){await sleep(500);return false;}assert.equal(availability.id,report.extensionId);return{workerId:worker.targetId,availability};
      },'native Allow User Scripts and refreshed extension worker',Number(option('permission-timeout','120000')));
      report.userScriptsPrerequisite={...request,...available,observedAt:Date.now()};await json(`${directory}/native-user-scripts-observed.json`,report.userScriptsPrerequisite);
      await browserClient.send('Target.closeTarget',{targetId:settingsId});
      if((await targets()).some(t=>t.targetId===toolId))await browserClient.send('Target.closeTarget',{targetId:toolId});tool=null;
    } else { report.userScriptsPrerequisite=scriptAvailability; if(!single && !originalRequested && !cookieFaultRequested&&!scriptContentRequested) report.cases.find(x=>x.id==='NATIVE-USERSCRIPTS-UNAVAILABLE-RETIRES').reason='Native capability already enabled; disabled-state branch not observed'; }

    await openTool(); target = await newPage(`${origin}/form?seed=${seed}&role=borrowed`); decoy = await newPage(`${origin}/form?seed=${seed}&role=decoy`);
    frameTarget = await newPage(`${origin}/frames?seed=${seed}&role=top`);
    await json(`${directory}/environment.json`, report); log({state: 'native-browser-ready', mode, label, pid: report.pid, launcherPid: report.launcherPid, endpoint: report.endpoint, extensionId: report.extensionId});
    if (originalRequested) { await originalReads(); return report; }
    if(cookieFaultRequested) {await originalReads();return report;}
    if(scriptContentRequested) {await scriptContentNative();return report;}
    if (single) {
      await caseRun('WXT-P3-RETURN7-REOPEN', async row => {
        row.input = {source:'return 7;',params:{caseId:'WXT-P3-RETURN7-REOPEN',marker:7},expected:7};
        const resourceBefore = resourceCheck ? await toolResources() : null;
        const workerEventStart = nativeEvents.length;
        assert(!(await targets()).some(x=>x.type==='worker'),'Single-case browser must have no preexisting Worker');
        const actual = await run(row.input.source,row.input.params);
        assert.equal(actual.result.state,'completed'); assert.equal(actual.run.state,'completed');
        assert.equal(decodeValue(actual.result.outcome.valueWire),7);
        assert.equal(actual.run.revision.sourceHash,actual.revision.sourceHash);
        assert.deepEqual(decodeValue(actual.run.paramsWire),row.input.params);
        assert.equal(actual.run.retirementState,'released');
        assert(actual.view.result.includes('"value": 7'));
        const runId = actual.run.runId, before = actual.snapshot;
        await until(()=>nativeEvents.slice(workerEventStart).some(e=>e.method==='Target.targetCreated' && e.params.targetInfo.type==='worker'),'actual native Worker creation');
        const workerTargets = nativeEvents.slice(workerEventStart).filter(e=>e.method==='Target.targetCreated' && e.params.targetInfo.type==='worker');
        assert.equal(workerTargets.length,1,'Exactly one native Worker belongs to the single real run');
        const workerDestroyed = nativeEvents.slice(workerEventStart).find(e=>e.method==='Target.targetDestroyed' && e.params.targetId===workerTargets[0].params.targetInfo.targetId);
        assert(workerDestroyed,'Actual native Worker must be destroyed after durable retirement');
        const resourceAfter = resourceCheck ? await toolResources() : null;
        if (resourceCheck) assert.deepEqual(resourceAfter.counts, resourceBefore.counts, 'Successful controller must restore the actual tool baseline');
        await browserClient.send('Target.closeTarget',{targetId:toolId}); tool = null;
        await openTool(); const reopened = await readUI(runId), after = await snapshot();
        const persisted = after.rows.results.find(x=>x.value.runId===runId).value;
        assert.equal(decodeValue(persisted.outcome.valueWire),7); assert(reopened.result.includes('"value": 7'));
        assert.equal(after.rows.runs.filter(x=>x.value.tag==='controller-run').length,before.rows.runs.filter(x=>x.value.tag==='controller-run').length);
        assert.equal(after.rows.runs.find(x=>x.key==='@slot')?.value.currentRunId,null);
        assert.equal(await evaluate(tool,'document.querySelectorAll("iframe[sandbox]").length'),0);
        assert(!(await targets()).some(x=>x.type==='worker' && x.url.startsWith('blob:')));
        // Independent fixed-file mechanism proof through the existing trusted SDK UI.
        await click(tool,toolId,'#sdk-refresh');
        await until(()=>evaluate(tool,`!!document.querySelector('#sdk-tab option[value="${actual.selected.tabId}"]')`),'SDK exact tab option');
        await select(tool,'#sdk-tab',actual.selected.tabId);
        await until(()=>evaluate(tool,`!!document.querySelector('#sdk-document option[value="${actual.selected.documentId}"]')`),'SDK exact document option');
        await select(tool,'#sdk-document',actual.selected.documentId);
        await click(tool,toolId,'#sdk-capabilities input[value="storage.session"]');
        await click(tool,toolId,'#sdk-install');
        await until(()=>evaluate(tool,'document.querySelector("#sdk-status").dataset.state === "installed"'),'SDK trusted install');
        const sdkHello=await evaluate(target.client,'OpenDeskSDK.ready()');
        assert.equal(sdkHello.ready,true);
        const isolated=await evaluate(tool,`chrome.scripting.executeScript({target:{tabId:${actual.selected.tabId},documentIds:[${JSON.stringify(actual.selected.documentId)}]},world:'ISOLATED',func:()=>({relay:!!globalThis.__openDeskSdkRelayV1,sdk:!!globalThis.OpenDeskSDK,origin:location.origin})})`);
        const main=await evaluate(target.client,'({sdk:!!globalThis.OpenDeskSDK,relay:!!globalThis.__openDeskSdkRelayV1,origin:location.origin})');
        assert.equal(isolated[0].documentId,actual.selected.documentId); assert.equal(isolated[0].result.relay,true); assert.equal(isolated[0].result.sdk,false);
        assert.equal(main.sdk,true); assert.equal(main.relay,false);
        let resourceObservations;
        if (resourceCheck) {
          const sdkBefore = await sdkResources(target, actual.selected), marker = randomUUID();
          const sdkCall = await evaluate(target.client, `(async()=>{const key=${JSON.stringify(`resource-${randomUUID()}`)},value={marker:${JSON.stringify(marker)}};
            const request=OpenDeskSDK.AppLocal.setItem(key,value),isPromise=request instanceof Promise;
            await request;const read=await OpenDeskSDK.AppLocal.getItem(key);await OpenDeskSDK.AppLocal.removeItem(key);
            return {isPromise,read};})()`);
          assert.equal(sdkCall.isPromise,true); assert.equal(sdkCall.read.marker,marker);
          const sdkAfterCall = await sdkResources(target, actual.selected);
          assert.deepEqual(sdkAfterCall.counts,sdkBefore.counts,'Original SDK Promises must restore the actual MAIN/relay/tool baseline');
          await until(()=>evaluate(tool,'!document.querySelector("#sdk-install").disabled'),'SDK reinstall ready');
          await click(tool,toolId,'#sdk-install');
          await until(()=>evaluate(tool,'document.querySelector("#sdk-status").dataset.state === "installed"'),'second actual SDK installation');
          const reinstalledHello = await evaluate(target.client,'OpenDeskSDK.ready()'); assert.equal(reinstalledHello.ready,true);
          const sdkAfterReinstall = await sdkResources(target, actual.selected);
          assert.deepEqual(sdkAfterReinstall.counts,sdkBefore.counts,'Actual fixed-file reinjection cannot retain old transport listeners or callbacks');
          resourceObservations = {resourceBefore,resourceAfter,sdkBefore,sdkCall,sdkAfterCall,reinstalledHello,sdkAfterReinstall,
            scope:'bounded observation prerequisite; original 1000/10/2 campaigns not run'};
          await json(`${directory}/resource-observations.json`,resourceObservations);
        }
        await json(`${directory}/fixed-world-mechanisms.json`,{sdkHello,isolated,main,controllerAlreadyRetired:true,packageHash:report.packageHash});
        await json(`${directory}/final-durable-snapshot.json`,after);
        return {...actual,reopened,after,workerTargets,workerDestroyed,sdkHello,isolated,main,resourceObservations,browserRestartTested:false};
      });
      return report;
    }
    await caseRun('OWNED-GOTO-TYPE-CLICK-WAIT-READ-RETURN', async row => {
      const params = {url: `${origin}/form?seed=${seed}&role=goto`, name: 'Alice', revision: 'r1'}; row.input = {source: chain, params};
      const actual = await run(chain, params, true), value = decodeValue(actual.result.outcome.valueWire);
      assert.equal(actual.result.state, 'completed'); assert.equal(value.typed, 'Typed'); assert.equal(value.clicked, 'clicked'); assert(value.read.outerHTML.includes('Hello BaseAlice')); assert.equal(value.url, params.url);
      const hits = serverEvents.filter(e => e.url.includes(`seed=${seed}`) && e.url.includes('role=goto') && e.method === 'POST');
      assert(hits.some(e => JSON.parse(e.body).kind === 'click' && JSON.parse(e.body).value === 'BaseAlice'));
      assert(!actual.snapshot.rows.templateRevisions?.length); return {...actual, valueWire: actual.result.outcome.valueWire, rawHTTP: hits};
    });
    await caseRun('INCREMENTAL-WORKER-SERVICES',async row=>{
      const marker=randomUUID(), source=`await AppStorage.setItem(params.key,0); await storage.set({[params.key]:false}); const before=[await AppStorage.getItem(params.key),await storage.get(params.key)]; await AppStorage.clear(); const after=[await AppStorage.getItem(params.key),await storage.get(params.key)]; const response=await axiosx.post(params.url,{marker:params.key}); return {before,after,status:response.status,data:response.data};`;
      row.input={source,params:{key:marker,url:`${origin}/observe?worker=${marker}`}};
      const actual=await run(source,row.input.params),value=decodeValue(actual.result.outcome.valueWire);
      assert.equal(actual.result.state,'completed');assert.deepEqual(value.before,['0',false]);assert.deepEqual(value.after,[null,false]);
      assert.equal(value.status,200);assert.equal(value.data.observed,true);
      const effects=serverEvents.filter(event=>event.url.includes(`worker=${marker}`)&&event.method==='POST');assert.equal(effects.length,1);
      assert(!actual.snapshot.rows.runs.some(row=>row.value.tag==='sdk-service'));
      return {...actual,value,effects};
    });
    await caseRun('R1-PINNED-R2-SAVED-HEAD-DELETED', async row => {
      const r1source = "await page.waitForTimeout(15000); return {source:'r1',params};", r2source = "return {source:'r2',params};";
      const r1 = await commit(r1source, {version: 'r1', f: false, z: 0}); await chooseBorrowed(target);
      const ownerTool = tool, ownerId = toolId, rival = await openTool();
      try {
        // Prepare both real hosts' native selections before the unchanged 30s
        // admission deadline starts. UI assistance is not part of run timing.
        await chooseBorrowed(target, false, rival.client, rival.targetId); tool=ownerTool;toolId=ownerId;
        const runId=await start();
        await until(async () => (await snapshot()).rows.commandJournal.some(x => x.value.runId === runId && x.value.tag === 'controller-operation' && x.value.state === 'dispatched'), 'r1 actual pending page operation');
        const r2 = await commit(r2source, {version: 'r2'}, tool, toolId, r1.scriptId); row.input = {r1, r2, runId}; assert.equal(r2.revision, r1.revision + 1);
        await fill(rival.client, rival.targetId, '#script-id', r1.scriptId); await fill(rival.client, rival.targetId, '#script-revision', r2.revision);
        await fill(rival.client, rival.targetId, '#script-params', JSON.stringify(r2.params)); await click(rival.client, rival.targetId, '#script-load');
        await until(() => evaluate(rival.client, 'document.querySelector("#script-status").dataset.state === "loaded"'), 'real second host loaded r2 before deletion');
        tool = ownerTool; toolId = ownerId;
        await click(tool, toolId, '#script-delete');
        await until(() => evaluate(tool, 'document.querySelector("#script-status").dataset.state === "deleted"'), 'head tombstoned through actual UI');
        const during = await snapshot(), head = during.rows.scriptHeads.find(x => x.value.scriptId === r1.scriptId)?.value;
        const pinned = during.rows.scriptRevisions.find(x => x.value.scriptId === r1.scriptId && x.value.revision === r1.revision)?.value;
        const pin = during.rows.commandJournal.find(x => x.value.tag === 'script-revision-pin' && x.value.runId === runId)?.value;
        assert.equal(head?.tombstoned, true); assert.equal(head.revision, r2.revision); assert.equal(pinned?.sourceUtf8, r1source); assert.equal(pinned.contentHash, r1.sourceHash);
        assert.equal(pin?.released, false); assert.equal(during.rows.runs.find(x => x.value.runId === runId).value.state, 'running');
        assert.equal((await ui(tool)).runDisabled, true);
        const first = await durable(runId); assert.deepEqual(decodeValue(first.result.outcome.valueWire), {source: 'r1', params: r1.params});
        assert.equal(first.result.revision.scriptId, r1.scriptId); assert.equal(first.result.revision.revision, r1.revision);
        assert.equal(first.result.revision.sourceHash, r1.sourceHash); assert.equal(first.run.revision.sourceHash, r1.sourceHash);
        assert.equal(first.snapshot.rows.commandJournal.find(x => x.value.tag === 'script-revision-pin' && x.value.runId === runId)?.value.released, true);
        let denial; try { await start(rival.client, rival.targetId); } catch (error) { denial = errorView(error); }
        assert.equal(denial?.code, 'E_TOMBSTONE'); const after = await snapshot();
        assert.equal(after.rows.runs.filter(x => x.value.tag === 'controller-run').length, first.snapshot.rows.runs.filter(x => x.value.tag === 'controller-run').length);
        await readUI(runId); return {r1, r2, during, first, denial, after};
      } finally { await browserClient.send('Target.closeTarget', {targetId: rival.targetId}); tool = ownerTool; toolId = ownerId; }
    });
    for (const child of [false, true]) await caseRun(child ? 'BORROWED-CHILD-FRAME-EXACT-DOC' : 'BORROWED-EXACT-DOC-ACTIVE-DECOY', async row => {
      const page = child ? frameTarget : target, name = child ? 'Child' : 'Borrow';
      const source = "await page.waitForTimeout(500); await page.type('#name',params.name); await page.click('#submit'); await page.waitForSelector('#result[data-done=\"true\"]'); return await page.snapshot('#result');";
      await commit(source, {name}); const selection = await chooseBorrowed(page, child); row.input = {source, name, selection};
      const beforeDecoy = await evaluate(decoy.client, 'document.querySelector("#name").value');
      const beforeTop = child && await evaluate(frameTarget.client, 'document.querySelector("#name").value');
      const runId = await start(); await browserClient.send('Target.activateTarget', {targetId: decoy.id});
      const actual = await durable(runId); assert.equal(actual.result.state, 'completed'); assert(decodeValue(actual.result.outcome.valueWire).outerHTML.includes(`Hello Base${name}`));
      const dispatches = actual.snapshot.rows.commandJournal.filter(x => x.value.tag === 'controller-operation' && x.value.runId === runId);
      assert(dispatches.length > 0); for (const item of dispatches) { assert.equal(item.value.envelope.target.documentId, selection.documentId); assert.equal(item.value.envelope.target.frameId, selection.frameId); }
      assert.equal(await evaluate(decoy.client, 'document.querySelector("#name").value'), beforeDecoy);
      if (child) assert.equal(await evaluate(frameTarget.client, 'document.querySelector("#name").value'), beforeTop);
      assert((await targets()).some(t => t.targetId === page.id)); return {selection, actual, beforeDecoy, beforeTop};
    });
    await caseRun('P4-API48-WORKER-SEMANTICS', async row => {
      const url = `${origin}/form?seed=${seed}&role=api48`;
      await commit(api48Source,{url,fileURL:`${origin}/abc`}); await chooseOwned(url);
      if (!await evaluate(tool,'document.querySelector("#script-allow-cookies").checked')) await click(tool,toolId,'#script-allow-cookies');
      const runId = await start(); const actual = await durable(runId);
      await click(tool,toolId,'#script-allow-cookies');
      assert.equal(actual.result.state,'completed');
      const value = decodeValue(actual.result.outcome.valueWire);
      const symbols = JSON.parse(await readFile(path.join(root,'docs/framework/source-compatibility-ledger.json'))).apiItems.map(x=>x.symbol).sort();
      assert.equal(value.checks.length,48); assert.deepEqual(value.checks.map(x=>x.member).sort(),symbols);
      row.input = {source:api48Source,url,executionMode:value.executionMode,originalMatrixClosed:false};
      row.actual = value; assert.deepEqual(value.checks.filter(x=>!x.ok),[]);
      return actual;
    });
    const definitions = [
      ['false', 'return false;', false], ['zero', 'return 0;', 0], ['undefined', 'return undefined;', undefined],
      ['own-undefined', 'return {f:false,z:0,u:undefined};', {f: false, z: 0, u: undefined}], ['true', 'return true;', true],
      ['business', 'return {PageBrigeCode:9,ok:false,error:"business",message:"data"};', {PageBrigeCode: 9, ok: false, error: 'business', message: 'data'}]
    ];
    for (const [kind, source, expected] of definitions) {
      const actual = await caseRun(`DURABLE-${kind.toUpperCase()}`, async row => {
        row.input = {source, expectedWire: encodeValue(expected)}; const result = await run(source);
        assert.equal(result.result.state, 'completed'); assert.equal(result.result.outcome.ok, true); assert.deepEqual(decodeValue(result.result.outcome.valueWire), expected);
        assert.deepEqual(result.result.outcome.valueWire, encodeValue(expected)); assert(result.view.result.includes(kind.includes('undefined') ? 'undefined' : kind === 'zero' ? '0' : kind === 'business' ? 'PageBrigeCode' : kind));
        return result;
      });
      if (actual) typedCases.set(kind, actual);
      if (['false', 'zero', 'undefined', 'own-undefined'].includes(kind)) await caseRun(`DOWNLOAD-${kind.toUpperCase()}`, async row => {
        assert(actual, 'Required durable typed case failed; download blocked by product prerequisite');
        await readUI(actual.run.runId); await select(tool, '#script-download-result', actual.result.resultId);
        row.input = {runId: actual.run.runId, resultId: actual.result.resultId, valueWire: actual.result.outcome.valueWire};
        await click(tool, toolId, '#script-download');
        const completed = await until(async () => { const snap = await snapshot(), artifact = snap.rows.artifacts.find(x => x.value.tag === 'artifact' && x.value.artifact.resultId === actual.result.resultId)?.value.artifact;
          const attempt = snap.rows.downloadReceipts.find(x => x.value.tag === 'attempt' && x.value.attempt.artifactId === artifact?.artifactId)?.value.attempt;
          const receipt = attempt && snap.rows.downloadReceipts.find(x => x.value.tag === 'receipt' && x.value.receipt.attemptId === attempt.attemptId)?.value.receipt;
          if (!artifact || !attempt || !receipt?.browserDownloadComplete || !attempt.resourceReleasedAt) return false;
          return {artifact, attempt, receipt, snapshot: snap};
        }, 'native download complete AND Blob release durable receipt', 40000);
        const native = await evaluate(tool, `chrome.downloads.search({id:${completed.receipt.downloadId}})`); assert.equal(native.length, 1); assert.equal(native[0].state, 'complete');
        assert.equal(native[0].byExtensionId, report.extensionId); assert.equal(native[0].url, completed.attempt.blobUrl);
        const bytes = await readFile(native[0].filename), data = JSON.parse(bytes);
        assert.equal(bytes.length, completed.artifact.bytes); assert.equal(digest(bytes), completed.artifact.sha256);
        assert.equal(data.protocol, VALUE_PROTOCOL); assert.equal(data.runId, actual.run.runId); assert.equal(data.resultId, actual.result.resultId);
        assert.deepEqual(data.valueWire, actual.result.outcome.valueWire); assert.deepEqual(decodeValue(data.valueWire), expected);
        const blobProbe = await evaluate(tool, `fetch(${JSON.stringify(completed.attempt.blobUrl)}).then(r=>({resolved:true,status:r.status}),e=>({resolved:false,name:e.name,message:e.message}))`);
        assert.equal(blobProbe.resolved, false, 'Original host Blob URL must really be revoked');
        const raw = {...completed, native, disk: {path: native[0].filename, inRequestedDownloadDirectory: path.resolve(native[0].filename).startsWith(path.join(absolute, 'downloads') + path.sep),
          bytes: bytes.length, sha256: digest(bytes), stat: await stat(native[0].filename), content: bytes.toString('utf8')}, blobProbe};
        await json(`${directory}/download-${kind}-native-receipt.json`, raw); return raw;
      });
    }
    // The later native permission removal permanently fences prior results.
    // Prove authorized reopen before that separate denial scenario runs.
    await caseRun('REOPEN-PERSISTENT-RESULT', async () => {
      const original = typedCases.get('own-undefined'); assert(original); const before = await snapshot();
      const originalRun = before.rows.runs.find(x => x.value.tag === 'controller-run' && x.value.runId === original.run.runId)?.value;
      assert(originalRun && !originalRun.resultDeliveryRevoked, 'Positive reopen requires an unfenced original result');
      await browserClient.send('Target.closeTarget', {targetId: toolId}); tool = null; await openTool();
      const view = await readUI(original.run.runId), after = await snapshot();
      assert.deepEqual(after.rows.results.find(x => x.value.tag === 'controller-result' && x.value.runId === original.run.runId && x.value.resultId === original.run.resultId).value.outcome, original.result.outcome);
      assert.equal(after.rows.runs.filter(x => x.value.tag === 'controller-run').length, before.rows.runs.filter(x => x.value.tag === 'controller-run').length);
      assert(view.result.includes('undefined')); return {before, after, view};
    });
    for (const rejected of [false, true]) await caseRun(rejected ? 'REJECTION' : 'THROW', async row => {
      const source = rejected ? "await Promise.reject(new RangeError('native-rejection'));" : "throw new TypeError('native-throw');";
      row.input = {source}; const actual = await run(source); assert.equal(actual.result.state, 'failed'); assert.equal(actual.result.outcome.ok, false);
      assert(actual.result.outcome.error.message.includes(rejected ? 'native-rejection' : 'native-throw'));
      assert.equal(actual.snapshot.rows.results.filter(x => x.value.runId === actual.run.runId).length, 1); return actual;
    });
    await caseRun('MULTI-HOST-SLOT-COMPETITION', async row => {
      const firstTool = tool, firstId = toolId; const rival = await openTool();
      try {
        const winnerRevision = await commit("await page.waitForTimeout(5000); return 'winner';", {}, firstTool, firstId);
        const winnerSelection = await chooseBorrowed(target, false, firstTool, firstId);
        const rivalRevision = await commit("await page.click('#submit'); return 'loser';", {}, rival.client, rival.targetId);
        const rivalSelection = await chooseBorrowed(decoy, false, rival.client, rival.targetId);
        tool = firstTool; toolId = firstId;
        const winnerId = await start();
        const before = await until(async () => {
          const snap = await snapshot();
          return snap.rows.commandJournal.some(x => x.value.runId === winnerId && x.value.tag === 'controller-operation' && x.value.state === 'dispatched') && snap;
        }, 'winner actual pending operation before rival admission');
        assert.equal(before.rows.runs.find(x => x.value.runId === winnerId)?.value.state, 'running');
        tool = rival.client; toolId = rival.targetId;
        let denial, admittedRivalRunId, competitionError;
        try { admittedRivalRunId = await start(rival.client, rival.targetId); } catch (error) { denial = errorView(error); }
        admittedRivalRunId ||= (await ui(rival.client)).runId;
        try {
          assert.equal(denial?.code, 'E_OWNER');
        } catch (error) { competitionError = error; }
        tool = firstTool; toolId = firstId; const after = await snapshot();
        try {
          assert.equal(after.rows.runs.filter(x => x.value.tag === 'controller-run').length, before.rows.runs.filter(x => x.value.tag === 'controller-run').length,
            admittedRivalRunId && admittedRivalRunId !== winnerId ? `Rival admission unexpectedly created run ${admittedRivalRunId}` : undefined);
        } catch (error) { competitionError ||= error; }
        row.input = {winnerId, rivalHostTarget: rival.targetId, winnerRevision, winnerSelection, rivalRevision, rivalSelection, pendingState: before.rows.runs.find(x => x.value.runId === winnerId)?.value.state};
        const winner = await durable(winnerId); assert.equal(decodeValue(winner.result.outcome.valueWire), 'winner');
        if (competitionError) throw competitionError;
        return {denial, before, after, winner};
      } finally { await browserClient.send('Target.closeTarget', {targetId: rival.targetId}); tool = firstTool; toolId = firstId; }
    });
    await caseRun('STOP-PENDING-FENCE', async row => {
      const source = "await page.waitForSelector('#never-arrives'); await page.click('#submit'); return 'late';";
      await commit(source, {}); await chooseBorrowed(target); const runId = await start();
      const pending = await until(async () => { const snap = await snapshot(); return snap.rows.commandJournal.some(x => x.value.runId === runId && x.value.tag === 'controller-operation' && x.value.state === 'dispatched') && snap; }, 'actual pending page wait');
      row.input = {source, runId}; await click(tool, toolId, '#script-stop'); const actual = await durable(runId);
      assert.equal(actual.result.state, 'stopped'); assert.equal(actual.result.outcome.error.code, 'E_CANCELLED');
      assert.equal(actual.snapshot.rows.commandJournal.filter(x => x.value.runId === runId && x.value.tag === 'controller-operation').length, 1);
      assert((await targets()).some(x => x.targetId === target.id)); return {pending, actual};
    });
    for (const trigger of ['navigation', 'revocation']) await caseRun(`NATIVE-${trigger.toUpperCase()}-PENDING-FENCE`, async row => {
      const page = await newPage(`${origin}/form?seed=${seed}&role=fence-${trigger}`);
      const source = "await page.waitForSelector('#never-arrives'); await page.click('#submit'); return 'late';";
      await commit(source, {}); const selected = await chooseBorrowed(page); const runId = await start();
      await until(async () => (await snapshot()).rows.commandJournal.some(x => x.value.runId === runId &&
        x.value.tag === 'controller-operation' && x.value.state === 'dispatched'), 'native pending operation before fence');
      const before = await snapshot();
      if (trigger === 'navigation') await page.client.send('Page.navigate', {url:`${origin}/form?seed=${seed}&role=replaced`});
      else {
        const originPattern=`${new URL(origin).protocol}//${new URL(origin).hostname}/*`;
        const beforePermissions=await evaluate(tool,'chrome.permissions.getAll()');
        assert(beforePermissions.origins.includes(originPattern),'Exact granted native origin must exist before revocation');
        const removed=await evaluate(tool,`chrome.permissions.remove({origins:[${JSON.stringify(originPattern)}]})`);
        const afterPermissions=await evaluate(tool,'chrome.permissions.getAll()');
        assert.equal(removed,true);assert(!afterPermissions.origins.includes(originPattern));
        assert.equal(await evaluate(tool,`chrome.permissions.contains({origins:[${JSON.stringify(originPattern)}]})`),false);
        row.nativePermissionRemoval={originPattern,before:beforePermissions,removed,after:afterPermissions};
      }
      const actual = await durable(runId);
      assert.equal(actual.result.outcome.ok, false);
      assert.equal(actual.result.outcome.error.code, trigger === 'navigation' ? 'E_DOCUMENT_REPLACED' : 'E_PERMISSION');
      assert.equal(actual.snapshot.rows.commandJournal.filter(x => x.value.runId === runId && x.value.tag === 'controller-operation').length, 1);
      assert((await targets()).some(x => x.targetId === page.id), 'Borrowed native target survives retirement');
      let revokedResultDelivery;
      if (trigger === 'revocation') {
        const original = typedCases.get('own-undefined');
        const revokedRunId = original?.run.runId || runId;
        const view = await readUI(revokedRunId);
        const durableOriginal = await durable(revokedRunId);
        assert.equal(durableOriginal.run.resultDeliveryRevoked, true, 'Native revocation must durably fence result delivery');
        assert(view.result.includes('"results": []'), 'Revoked durable values must not be delivered');
        assert(view.result.split('"resultDeliveryDenied": ')[1]?.includes(JSON.stringify(revokedRunId)), 'Actual UI must identify the denied result');
        if (original) assert.deepEqual(durableOriginal.result.outcome, original.result.outcome, 'Revocation must preserve the original durable result');
        revokedResultDelivery = {runId:revokedRunId, view, durableOriginal};
      }
      row.input = {source, selected, trigger}; return {before, actual, revokedResultDelivery};
    });
    for (const trigger of ['stop', 'deadline', 'host-close']) await caseRun(`WORKER-INFINITE-${trigger.toUpperCase()}`, async row => {
      // Real page input/HTTP observation exposes the actual Worker identity. This
      // is user source running in the product Worker, not a runner callback mock.
      const source = "await page.type('#name',JSON.stringify({workerName:self.name,workerURL:location.href})); await page.title(); while(true){}";
      const loopPage = await newPage(`${origin}/form?seed=${seed}&role=loop-${trigger}`);
      await commit(source, {}); const selection = await chooseBorrowed(loopPage);
      const before = await targets(); assert(!before.some(x => x.type === 'worker'), 'Another control Worker invalidates attribution');
      const traceStart = traceEvents.length, completeBefore = traceComplete;
      await browserClient.send('Tracing.start', {categories: '-*,__metadata,devtools.timeline,disabled-by-default-devtools.timeline,disabled-by-default-devtools.timeline.frame', transferMode: 'ReportEvents'});
      let tracing = true;
      try {
        const runId = await start(), nativeWorker = await until(async () => {
          const fresh = (await targets()).filter(x => x.type === 'worker' && !before.some(y => x.targetId === y.targetId));
          assert(fresh.length <= 1, 'Ambiguous native Worker inventory'); return fresh[0];
        }, 'actual unique run Worker');
        assert.equal(nativeWorker.attached, false, 'Infinite Worker must remain debugger-free');
        const marker = await until(() => serverEvents.find(x => {
          if(x.method!=='POST'||!x.url.includes(`role=loop-${trigger}`))return false;
          try{const identity=JSON.parse(JSON.parse(x.body).value.slice(4));return identity.workerName===`OpenDesk-Control-${runId}`&&identity.workerURL.startsWith('blob:null/');}catch{return false;}
        }), 'complete actual Worker identity through native type and HTTP input event');
        const workerIdentity = JSON.parse(JSON.parse(marker.body).value.slice(4));
        assert.equal(workerIdentity.workerName, `OpenDesk-Control-${runId}`); assert(workerIdentity.workerURL.startsWith('blob:null/'));
        await until(async () => (await snapshot()).rows.commandJournal.some(x => x.value.runId === runId && x.value.tag === 'controller-operation' && x.value.envelope.operation.method === 'title' && x.value.state === 'durable'), 'page.title marker durable before loop');
        const frameTree = await tool.send('Page.getFrameTree');
        const cpuBefore = await browserClient.send('SystemInfo.getProcessInfo'); await sleep(350); const cpuLoop = await browserClient.send('SystemInfo.getProcessInfo');
        const initial = (await snapshot()).rows.runs.find(x => x.value.runId === runId).value;
        row.input = {source, trigger, runId, nativeWorker, initial, selection, workerIdentity, marker, frameTree}; let triggerLower, triggerUpper;
        if (trigger === 'deadline') {
          // UI's actual 30s deadline is used; no runner-injected timer/fence.
          const wallToMono = performance.now() - Date.now(); triggerLower = initial.deadlineAt + wallToMono; triggerUpper = triggerLower;
          await until(() => Date.now() >= initial.deadlineAt - 500, 'real UI admission deadline approaches', 35000);
        } else {
          triggerLower = performance.now();
          if (trigger === 'stop') await click(tool, toolId, '#script-stop');
          else { await browserClient.send('Target.closeTarget', {targetId: toolId}); tool = null; }
          triggerUpper = performance.now();
        }
        const observations = []; let absence;
        while (performance.now() - triggerLower < 3300) {
          const nativeTargets = await targets(), sample = {at: Date.now(), monoMs: performance.now(), targets: nativeTargets, cpu: await browserClient.send('SystemInfo.getProcessInfo')}; observations.push(sample);
          const current = nativeTargets.find(x => x.targetId === nativeWorker.targetId); assert(!current?.attached, 'Worker inspector must not attach');
          if (!current) { absence = sample; break; } await sleep(50);
        }
        const post = [];
        for (let i = 0; i < 3; i++) { post.push({monoMs: performance.now(), cpu: await browserClient.send('SystemInfo.getProcessInfo')}); if (i !== 2) await sleep(120); }
        await browserClient.send('Tracing.end'); tracing = false; await until(() => traceComplete > completeBefore, 'native worker trace completion');
        const trace = traceEvents.slice(traceStart), association = trace.find(x => x.name === 'TracingSessionIdForWorker' && String(x.args?.data?.workerId).toUpperCase() === nativeWorker.targetId.toUpperCase());
        await json(`${directory}/worker-${trigger}-trace.json`, trace);
        const destroyed = nativeEvents.find(e => e.method === 'Target.targetDestroyed' && e.params.targetId === nativeWorker.targetId);
        const pid = association?.pid, data = association?.args?.data;
        const cpuFor = cpu => cpu.processInfo.find(x => x.id === pid && x.type === 'renderer')?.cpuTime;
        const growth = cpuFor(cpuLoop) - cpuFor(cpuBefore), postCPU = post.map(x => cpuFor(x.cpu));
        const absentPid = postCPU.every(x => x === undefined), pidExited = absentPid && (() => { try { process.kill(pid, 0); return false; } catch (error) { return error.code === 'ESRCH'; } })();
        const quiet = pidExited || postCPU.every(Number.isFinite) && postCPU.slice(1).every((x, i) => x - postCPU[i] >= 0 && x - postCPU[i] < 0.03);
        const creatorAttached = nativeEvents.find(e => e.method === 'Page.frameAttached' && e.params.frameId === data?.frame && e.params.parentFrameId === frameTree.frameTree.frame.id);
        const creatorCall = trace.find(e => e.name === 'FunctionCall' && e.pid === pid && e.args?.data?.frame === data?.frame && e.args?.data?.url === `chrome-extension://${report.extensionId}/scripting/sandbox/sandbox.js`);
        const physical = {nativeWorker, workerIdentity, marker, association, creatorAttached, creatorCall, growth, cpuBefore, cpuLoop, observations, post, postCPU, quiet, pidExited, destroyed, absence,
          triggerLower, triggerUpper, destroyedMs: destroyed?.observedMonoMs - triggerLower, absenceMs: absence?.monoMs - triggerLower, cessationMs: post.at(-1).monoMs - triggerLower};
        await json(`${directory}/worker-${trigger}-physical.json`, physical);
        // Store physical observations before assertions so no failure can erase raw proof.
        row.physical = physical;
        assert(association && data.url === workerIdentity.workerURL && Number.isInteger(pid) && Number.isInteger(data.workerThreadId) && creatorAttached && creatorCall, 'No causal native run/Blob/host/Worker/PID/thread identity');
        assert(growth > 0.1 && quiet, 'Real loop CPU growth and subsequent cessation required');
        for (const ms of [physical.destroyedMs, physical.absenceMs, physical.cessationMs]) assert(Number.isFinite(ms) && ms >= 0 && ms <= 3000, 'Physical termination exceeds actual trigger + 3000ms');
        if (!tool) await openTool(); assert.equal(await evaluate(tool, '1+1'), 2);
        const actual = await durable(runId); assert.equal(actual.result.outcome.ok, false);
        assert.equal(actual.result.outcome.error.code, trigger === 'deadline' ? 'E_TIMEOUT' : trigger === 'host-close' ? 'E_HOST_CLOSED' : 'E_CANCELLED');
        assert.equal(actual.snapshot.rows.commandJournal.filter(x => x.value.runId === runId && x.value.tag === 'controller-operation').length, 2);
        assert((await targets()).some(x => x.targetId === loopPage.id), 'Borrowed page survives stop/timeout/host-close'); return {physical, actual};
      } finally { if (tracing) { await browserClient.send('Tracing.end').catch(() => {}); } if (!tool) await openTool(); }
    });
    await caseRun('CLEANUP-NO-SCRAPING-RECORDS', async () => {
      const actual = await snapshot(), nativeTargets = await targets(), iframeCount = await evaluate(tool, 'document.querySelectorAll("iframe[sandbox]").length');
      assert.equal(iframeCount, 0); assert(!nativeTargets.some(x => x.type === 'worker' && x.url.startsWith('blob:')));
      assert.equal(actual.rows.runs.find(x => x.key === '@slot')?.value.currentRunId, null);
      assert(actual.rows.runs.every(x => ['controller-run', 'slot'].includes(x.value.tag)));
      for (const store of ['templates', 'templateRevisions', 'rows', 'seals']) assert(!actual.rows[store]?.length);
      await json(`${directory}/final-durable-snapshot.json`, actual); return {actual, nativeTargets, iframeCount};
    });
    if (campaignsRequested) {
      assert(report.cases.every(row => !row.selected && !row.prerequisite || row.status === 'PASS'),
        'Selected original-case prerequisite failure stops dependent campaigns');
      report.campaigns = await controllerCampaigns();
    }
  } catch (error) { report.error = errorView(error); report.attribution = error.code?.startsWith('E_RUNNER') ? 'runner' : error.code === 'E_NATIVE_PERMISSION_WAIT' ? 'permission-wait' : 'product-or-native-contract'; }
  finally {
    if (tool?.isOpen) await tool.send('Page.captureScreenshot', {format: 'png'}).then(async ({data}) => writeFile(path.join(absolute, 'final-ui.png'), Buffer.from(data, 'base64'))).catch(() => {});
    await json(`${directory}/native-events.json`, nativeEvents);
    for (const client of clients) client.close();
    report.cleanup = await nativeLauncher.finish(browserClient);
    report.launcherAfterSha256 = digest(await readFile(launcherPath));
    report.launcherDrift = report.launcherAfterSha256 !== report.launcherSha256;
    const after = await fingerprint(extension); report.packageDrift = report.packageHash !== after.packageHash; await json(`${directory}/package-after.json`, after);
    report.summary = Object.fromEntries(['PASS', 'FAIL', 'BLOCKED', 'NOT_TESTED'].map(status => [status, report.cases.filter(c => c.status === status).length]));
    await json(`${directory}/report.json`, report); log({state: 'browser-finished', mode, label, summary: report.summary, error: report.error, cleanup: report.cleanup});
  }
  return report;
}
