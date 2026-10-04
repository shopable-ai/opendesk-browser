import assert from 'node:assert/strict';
import {inputIdentity} from '../../scripts/wxt-checkpoint.mjs';
import {api48Source} from './p4-api48-native-source.mjs';
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
const chromeVersions = {'138': '138.0.7204.183', '154': '154.0.8037.92'};
const chromeBinary = label => path.join(root, `tests/.cache/m5-browsers/${chromeVersions[label]}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`);
const args = process.argv.slice(2);
assert(!(args.includes('--native') && args.includes('--contract-check')), 'Contract-check and native execution are separate commands');
const sourceOnly = args.includes('--source-only');
const single = args.includes('--single');
assert(!sourceOnly || args.includes('--contract-check') && !args.includes('--native'), '--source-only is a non-native contract-check for Main rebuild in progress');
const option = (name, fallback) => args.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3) || fallback;
const modes = option('mode', 'all') === 'all' ? ['production', 'development'] : [option('mode')];
const labels = option('chrome', 'all') === 'all' ? ['138', '154'] : [option('chrome')];
assert(modes.every(x => ['production', 'development'].includes(x)));
assert(labels.every(x => ['138', '154'].includes(x)));
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
    ...(await readdir(path.join(root, 'tests/framework'))).filter(x => x.startsWith('k5-controller-product-native') || x.startsWith('k5-sdk-native')).map(x => `tests/framework/${x}`)]) {
    const bytes = await readFile(path.join(root, relative)); files.push({path: relative, bytes: bytes.length, sha256: digest(bytes)});
  }
  files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  return {files, sourceHash: digest(JSON.stringify(files))};
}
const contracts = (single ? [['WXT-P3-RETURN7-REOPEN', 'USC03/CTRL03/EX08/RESOURCE', 'Real UI committed return 7; revision, params, exact document, permission, actual Worker, durable released run, reopened tool same runId value7']] : [
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
  assert(editor.includes("client.request('tombstoneControllerScript',{scriptId:id,expectedRevision})"), 'Deletion UI must use the same client and expected revision');
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
  const socket = new WebSocket(url), pending = new Map(), listeners = new Set(); let sequence = 0;
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
  socket.onclose = () => { for (const waiter of pending.values()) { clearTimeout(waiter.timer); waiter.reject(new Error(`${label} socket closed`)); } pending.clear(); };
  return {send(method, params = {}) { return new Promise((resolve, reject) => {
    const id = ++sequence, message = {id, method, params};
    const timer = setTimeout(() => { pending.delete(id); const error = new Error(`${label} ${method} timeout`); error.code = 'E_RUNNER_CDP'; reject(error); }, 45000);
    pending.set(id, {resolve, reject, timer}); record('sent', message); socket.send(JSON.stringify(message));
  }); }, onEvent: listener => listeners.add(listener), close: () => socket.close()};
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
    if (browserClient) { await browserClient.send('Browser.close').catch(error => errors.push(errorView(error))); browserClient.close(); }
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
  const serverEvents = [], reports = [];
  const server = createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks).toString('utf8'), url = new URL(req.url, 'http://127.0.0.1');
    const entry = {sequence: serverEvents.length + 1, at: Date.now(), monoMs: performance.now(), method: req.method, url: req.url, headers: req.headers, body, bodySha256: digest(body)};
    serverEvents.push(entry); appendFileSync(path.join(output, 'raw-http.jsonl'), JSON.stringify({event: 'request', ...entry}) + '\n');
    for (const event of ['finish', 'close']) res.on(event, () => appendFileSync(path.join(output, 'raw-http.jsonl'), JSON.stringify({event, at: Date.now(), sequence: entry.sequence, statusCode: res.statusCode}) + '\n'));
    res.setHeader('cache-control', 'no-store');
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
    for (const mode of modes) for (const label of labels) reports.push(await browserRun({mode, label, origin, serverEvents}));
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await json('raw-http-final.json', serverEvents); }
  const sourceAfter = await sourceFingerprint(); await json('source-manifest-after.json', sourceAfter);
  const inputAfter = await inputIdentity(); await json('input-bindings-after.json',inputAfter);
  const zipAfter=Object.fromEntries(await Promise.all(['production','development'].map(async mode=>[mode,digest(await readFile(path.join(root,'artifacts',`opendesk-browser-${mode}.zip`)))])));
  await json('zip-bindings-after.json',zipAfter);
  assert.deepEqual(zipAfter,zipHashes,'Actual ZIP bytes must remain frozen during native acceptance');

  const inputDrift = inputAfter.productInputsSha256!==inputBindings.productInputsSha256 || inputAfter.verificationInputsSha256!==inputBindings.verificationInputsSha256;
  const sourceDrift = sourceBefore.sourceHash !== sourceAfter.sourceHash || inputDrift;
  const summary = {stage: 'F2', reports: reports.map(x => ({mode: x.mode, label: x.label, pid: x.pid, launcherPid: x.launcherPid, launcherSha256: x.launcherSha256,
    extensionId: x.extensionId, packageHash: x.packageHash, cases: x.cases, error: x.error, attribution: x.attribution, cleanup: x.cleanup, packageDrift: x.packageDrift, launcherDrift: x.launcherDrift})),
    sourceDrift, finalProductPassed: false, f3Accepted: false, original603Closed: false, frameworkFunctionalMigrationComplete: false,
    classification: sourceDrift || reports.some(x => x.packageDrift || x.launcherDrift) ? 'diagnostic-drift' : 'targeted-native-product-entry',
    notTested: ['Full original603', 'All 48 members', 'Independent SDK B05', 'Four crash barriers', '1000 mixed rounds', '10 reconnect rounds', '2 plugin disable rounds', 'Independent final package review'], serverClosed: true, output};
  await json('summary.json', summary); log({state: 'native-finished', output, sourceDrift});
  if (sourceDrift || reports.some(x => x.error || x.packageDrift || x.launcherDrift || x.cleanup?.pidAlive || x.cleanup?.launcherPidAlive || x.cleanup?.profileRemoved !== true ||
    x.cleanup?.nativeLogPreservedAfterLauncherExit !== true || x.cleanup?.exit?.code !== 0 || x.cases.some(c => c.status !== 'PASS'))) process.exitCode = 1;
}

async function browserRun({mode, label, origin, serverEvents}) {
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
    OS: {type: os.type(), release: os.release(), arch: os.arch()}, extension, manifest, cases: contracts.map(x => ({...x})), environment: {origin}};
  const clients = [], nativeEvents = [], traceEvents = [], seed = randomUUID();
  let browserClient, tool, toolId, target, decoy, frameTarget, traceComplete = 0;
  const nativeLauncher = startGlobalLauncher({binary, extension, absolute}); report.launcherPid = nativeLauncher.launcherPid;
  async function caseRun(id, operation) {
    const row = report.cases.find(c => c.id === id); assert(row); const begin = performance.now();
    row.productInputsSha256=report.productInputsSha256; row.verificationInputsSha256=report.verificationInputsSha256; row.packageSha256=report.packageHash; row.browserVersion=version; row.startedAt = Date.now(); row.input = {}; row.evidence = {cdp: '../raw-cdp.jsonl', http: '../raw-http.jsonl'};
    try { nativeLauncher.keepAlive(); row.actual = await operation(row); nativeLauncher.keepAlive(); await nativeLauncher.captureLog(); row.status = 'PASS'; }
    catch (error) { row.status = error.code === 'E_NATIVE_PERMISSION_WAIT' ? 'BLOCKED' : 'FAIL'; row.error = errorView(error);
      row.attribution = error.code === 'E_NATIVE_PERMISSION_WAIT' ? 'permission-wait' : error.code?.startsWith('E_RUNNER') ? 'runner' : 'product-or-native-contract';
      if (tool) row.ui = await ui(tool).catch(() => null);
    }
    row.elapsedMs = performance.now() - begin; await json(`${directory}/case-${id}.json`, row); log({state: 'case', mode, label, id, status: row.status, attribution: row.attribution});
    if (row.status === 'BLOCKED') throw Object.assign(new Error('Native permission still pending; remaining cases not executed'), {code: 'E_NATIVE_PERMISSION_WAIT', actual: row.error});
    if (row.status === 'FAIL' && (single || row.attribution === 'runner' || row.error?.code === 'E_OBSERVATION_TIMEOUT' || row.ui?.text?.includes('E_EFFECT_UNKNOWN'))) throw Object.assign(new Error('Runner prerequisite failed; remaining cases not executed'), {code: row.error.code, actual: row.error});
    return row.status === 'PASS' ? row.actual : null;
  }
  async function targets() { return (await browserClient.send('Target.getTargets')).targetInfos; }
  async function attach(id) {
    const tab = await until(async () => (await (await fetch(`${report.debuggingURL}/json/list`)).json()).find(t => t.id === id && t.webSocketDebuggerUrl), 'actual target websocket');
    const client = await connect(tab.webSocketDebuggerUrl, `${mode}-${label}-${id}`); clients.push(client); client.onEvent(event => nativeEvents.push(event));
    return client;
  }
  async function openTool() {
    toolId = (await browserClient.send('Target.createTarget', {url: `chrome-extension://${report.extensionId}/ui/tool.html`})).targetId;
    tool = await attach(toolId); await tool.send('Page.enable');
    await until(() => evaluate(tool, 'document.querySelector("#script-status")?.dataset.state === "ready"'), 'real product host ready');
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
    await browserClient.send('Target.activateTarget', {targetId: id});
    const point = await evaluate(client, `(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('missing selector');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2,disabled:e.disabled};})()`);
    if (point.disabled) { const error = new Error(`Disabled product action ${selector}`); error.code = 'E_PRODUCT_UI_DISABLED'; throw error; }
    await client.send('Input.dispatchMouseEvent', {type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1});
    await client.send('Input.dispatchMouseEvent', {type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1});
  }
  async function fill(client, id, selector, value) {
    await click(client, id, selector);
    await client.send('Input.dispatchKeyEvent', {type: 'keyDown', key: 'a', code: 'KeyA', modifiers: 4, windowsVirtualKeyCode: 65, commands: ['selectAll']});
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
    if (args.includes('--native-ui-assist')) {
      const request = {state:'native-selection-assist',mode,label,pid:report.pid,launcherPid:report.launcherPid,
        endpoint:report.endpoint,targetId:id,selector,desired,optionIndex:index,before,
        instruction:'Use the bound live native Chrome window to commit this exact option; no DOM assignment or synthetic events'};
      await json(`${directory}/pending-native-selection.json`,request); log(request);
      const after = await until(async()=>{const observed=await inspect();return observed.value===desired && observed;},
        `native UI exact option ${selector}`,Number(option('permission-timeout','120000')));
      appendFileSync(path.join(absolute,'ui-selection.jsonl'),JSON.stringify({at:Date.now(),monoMs:performance.now(),
        targetId:id,selector,desired,before,after,input:'native UI assist; exact DOM readback; external CUA action transcript required'})+'\n');
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
  async function snapshot(client = tool) {
    return evaluate(client, `(async()=>{const databases=await indexedDB.databases();if(!databases.some(d=>d.name==='opendesk-browser'))throw Error('product DB does not exist');
      const rows=await new Promise((resolve,reject)=>{const request=indexedDB.open('opendesk-browser');request.onerror=()=>reject(request.error);request.onsuccess=()=>{
      const db=request.result,names=[...db.objectStoreNames],tx=db.transaction(names,'readonly'),data={};for(const name of names){data[name]=[];const cursor=tx.objectStore(name).openCursor();cursor.onsuccess=()=>{const row=cursor.result;if(row){data[name].push({key:row.primaryKey,value:row.value});row.continue();}};}tx.oncomplete=()=>{db.close();resolve(data);};tx.onabort=()=>reject(tx.error);};});return{databases,rows};})()`);
  }
  async function commit(source, params, client = tool, id = toolId, scriptId = `native-${randomUUID()}`) {
    await fill(client, id, '#script-id', scriptId); await fill(client, id, '#script-source', source); await fill(client, id, '#script-params', JSON.stringify(params));
    const expectedHash=digest(Buffer.from(source,'utf8'));
    const previous=await snapshot(client), previousRevision=Math.max(0,...previous.rows.scriptRevisions.filter(x=>x.value.scriptId===scriptId).map(x=>x.value.revision));
    await click(client, id, '#script-save');
    const committed=await until(async()=>{
      const snap=await snapshot(client),revision=Number(await evaluate(client,'document.querySelector("#script-revision").value'));
      const row=snap.rows.scriptRevisions.find(x=>x.value.scriptId===scriptId && x.value.revision===revision && revision>previousRevision && x.value.contentHash===expectedHash)?.value;
      const view=await ui(client);
      return row && view.version.includes(expectedHash) && {snap,row,revision,view};
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
  async function durable(runId, client = tool) {
    return until(async () => { const snap = await snapshot(client), result = snap.rows.results.find(x => x.value.runId === runId)?.value;
      const run = snap.rows.runs.find(x => x.value.runId === runId)?.value;
      return result && run?.retirementState === 'released' && {run, result, snapshot: snap};
    }, `durable terminal and retirement ${runId}`, 40000);
  }
  async function readUI(runId, client = tool, id = toolId) {
    await fill(client, id, '#script-run-id', runId); await click(client, id, '#script-read');
    return until(async () => { const view = await ui(client); if (view.state === 'error') throw new Error(view.text); return view.state === 'results' && view.result.includes(runId) && view; }, 'actual durable read UI');
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
    if(!single && !scriptAvailability.available) {
      await openTool();
      await caseRun('NATIVE-USERSCRIPTS-UNAVAILABLE-RETIRES',async row=>{
        const actual=await run("return await page.$eval('#marker',el=>el.textContent);",{},true);
        assert.equal(actual.result.state,'failed');assert.equal(actual.result.outcome.error.code,'E_USER_SCRIPTS_UNAVAILABLE');
        assert.equal(actual.run.retirementState,'released');
        const pin=actual.snapshot.rows.commandJournal.find(x=>x.value.tag==='script-revision-pin' && x.value.runId===actual.run.runId)?.value;
        assert.equal(pin?.released,true);
        assert.equal(actual.snapshot.rows.runs.find(x=>x.value.tag==='slot')?.value.currentRunId,null);
        assert.equal(await evaluate(tool,`chrome.tabs.get(${actual.run.target.tabId}).then(()=>false,()=>true)`),true);
        return actual;
      });

      assert(args.includes('--headed') && args.includes('--native-ui-assist'),'API48 requires the real extension Allow User Scripts setting');
      const settingsId=(await browserClient.send('Target.createTarget',{url:`chrome://extensions/?id=${report.extensionId}`})).targetId;
      await browserClient.send('Target.activateTarget',{targetId:settingsId});
      const request={state:'native-user-scripts-assist',mode,label,pid:report.pid,launcherPid:report.launcherPid,endpoint:report.endpoint,extensionId:report.extensionId,settingsId,initialWorkerId:sw.targetId,scriptAvailability,
        instruction:'Enable Allow User Scripts for this exact test extension, then use its native Reload control so extension contexts refresh. No flags, manifest edits or private APIs.'};
      await json(`${directory}/pending-native-user-scripts.json`,request);log(request);
      const available=await until(async()=>{
        const worker=(await targets()).find(t=>t.type==='service_worker' && t.url===sw.url && t.targetId!==sw.targetId);
        if(!worker){await sleep(500);return false;}
        const observer=await attach(worker.targetId);let availability;
        try{availability=await evaluate(observer,'(async()=>{try{if(!chrome.userScripts?.getScripts)return{available:false};await chrome.userScripts.getScripts();return{available:true,id:chrome.runtime.id};}catch(e){return{available:false,reason:e.message}}})()');}finally{observer.close();}
        if(!availability.available){await sleep(500);return false;}assert.equal(availability.id,report.extensionId);return{workerId:worker.targetId,availability};
      },'native Allow User Scripts and refreshed extension worker',Number(option('permission-timeout','120000')));
      report.userScriptsPrerequisite={...request,...available,observedAt:Date.now()};await json(`${directory}/native-user-scripts-observed.json`,report.userScriptsPrerequisite);
      await browserClient.send('Target.closeTarget',{targetId:settingsId});
      await browserClient.send('Target.closeTarget',{targetId:toolId});
    } else { report.userScriptsPrerequisite=scriptAvailability; if(!single) report.cases.find(x=>x.id==='NATIVE-USERSCRIPTS-UNAVAILABLE-RETIRES').reason='Native capability already enabled; disabled-state branch not observed'; }

    await openTool(); target = await newPage(`${origin}/form?seed=${seed}&role=borrowed`); decoy = await newPage(`${origin}/form?seed=${seed}&role=decoy`);
    frameTarget = await newPage(`${origin}/frames?seed=${seed}&role=top`);
    await json(`${directory}/environment.json`, report); log({state: 'native-browser-ready', mode, label, pid: report.pid, launcherPid: report.launcherPid, endpoint: report.endpoint, extensionId: report.extensionId});
    if (single) {
      await caseRun('WXT-P3-RETURN7-REOPEN', async row => {
        row.input = {source:'return 7;',params:{caseId:'WXT-P3-RETURN7-REOPEN',marker:7},expected:7};
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
        await json(`${directory}/fixed-world-mechanisms.json`,{sdkHello,isolated,main,controllerAlreadyRetired:true,packageHash:report.packageHash});
        await json(`${directory}/final-durable-snapshot.json`,after);
        return {...actual,reopened,after,workerTargets,workerDestroyed,sdkHello,isolated,main,browserRestartTested:false};
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
        const first = await durable(runId); assert.deepEqual(decodeValue(first.result.outcome.valueWire), {source: 'r1', params: r1.params}); assert.equal(first.run.revision.sourceHash, r1.sourceHash);
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
    for (const rejected of [false, true]) await caseRun(rejected ? 'REJECTION' : 'THROW', async row => {
      const source = rejected ? "await Promise.reject(new RangeError('native-rejection'));" : "throw new TypeError('native-throw');";
      row.input = {source}; const actual = await run(source); assert.equal(actual.result.state, 'failed'); assert.equal(actual.result.outcome.ok, false);
      assert(actual.result.outcome.error.message.includes(rejected ? 'native-rejection' : 'native-throw'));
      assert.equal(actual.snapshot.rows.results.filter(x => x.value.runId === actual.run.runId).length, 1); return actual;
    });
    await caseRun('MULTI-HOST-SLOT-COMPETITION', async row => {
      await commit("await page.waitForTimeout(5000); return 'winner';", {}); await chooseBorrowed(target); const winnerId = await start();
      const firstTool = tool, firstId = toolId; const rival = await openTool();
      try {
        const before = await snapshot(); await commit("await page.click('#submit'); return 'loser';", {}, rival.client, rival.targetId); await chooseBorrowed(decoy, false, rival.client, rival.targetId);
        let denial; try { await start(rival.client, rival.targetId); } catch (error) { denial = errorView(error); }
        assert.equal(denial?.code, 'E_OWNER'); const after = await snapshot();
        assert.equal(after.rows.runs.filter(x => x.value.tag === 'controller-run').length, before.rows.runs.filter(x => x.value.tag === 'controller-run').length);
        row.input = {winnerId, rivalHostTarget: rival.targetId}; tool = firstTool; toolId = firstId;
        const winner = await durable(winnerId); assert.equal(decodeValue(winner.result.outcome.valueWire), 'winner'); return {denial, before, after, winner};
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
      else assert.equal(await evaluate(tool, `chrome.permissions.remove({origins:[${JSON.stringify(origin+'/*')}]})`), true);
      const actual = await durable(runId);
      assert.equal(actual.result.outcome.ok, false);
      assert.equal(actual.result.outcome.error.code, trigger === 'navigation' ? 'E_DOCUMENT_REPLACED' : 'E_PERMISSION');
      assert.equal(actual.snapshot.rows.commandJournal.filter(x => x.value.runId === runId && x.value.tag === 'controller-operation').length, 1);
      assert((await targets()).some(x => x.targetId === page.id), 'Borrowed native target survives retirement');
      row.input = {source, selected, trigger}; return {before, actual};
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
        const marker = await until(() => serverEvents.find(x => x.method === 'POST' && x.url.includes(`role=loop-${trigger}`) && x.body.includes('workerName')), 'actual Worker identity through native type and HTTP input event');
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
    await caseRun('REOPEN-PERSISTENT-RESULT', async () => {
      const original = typedCases.get('own-undefined'); assert(original); const before = await snapshot();
      await browserClient.send('Target.closeTarget', {targetId: toolId}); tool = null; await openTool();
      const view = await readUI(original.run.runId), after = await snapshot();
      assert.deepEqual(after.rows.results.find(x => x.value.runId === original.run.runId).value.outcome, original.result.outcome);
      assert.equal(after.rows.runs.filter(x => x.value.tag === 'controller-run').length, before.rows.runs.filter(x => x.value.tag === 'controller-run').length);
      assert(view.result.includes('undefined')); return {before, after, view};
    });
    await caseRun('CLEANUP-NO-SCRAPING-RECORDS', async () => {
      const actual = await snapshot(), nativeTargets = await targets(), iframeCount = await evaluate(tool, 'document.querySelectorAll("iframe[sandbox]").length');
      assert.equal(iframeCount, 0); assert(!nativeTargets.some(x => x.type === 'worker' && x.url.startsWith('blob:')));
      assert.equal(actual.rows.runs.find(x => x.key === '@slot')?.value.currentRunId, null);
      assert(actual.rows.runs.every(x => ['controller-run', 'slot'].includes(x.value.tag)));
      for (const store of ['templates', 'templateRevisions', 'rows', 'seals']) assert(!actual.rows[store]?.length);
      await json(`${directory}/final-durable-snapshot.json`, actual); return {actual, nativeTargets, iframeCount};
    });
  } catch (error) { report.error = errorView(error); report.attribution = error.code?.startsWith('E_RUNNER') ? 'runner' : error.code === 'E_NATIVE_PERMISSION_WAIT' ? 'permission-wait' : 'product-or-native-contract'; }
  finally {
    if (tool) await tool.send('Page.captureScreenshot', {format: 'png'}).then(async ({data}) => writeFile(path.join(absolute, 'final-ui.png'), Buffer.from(data, 'base64'))).catch(() => {});
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
