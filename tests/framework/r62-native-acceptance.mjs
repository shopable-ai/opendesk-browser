// Real acceptance driver. This never installs a Task or manufactures a receipt.
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile, writeFile, mkdir, lstat, realpath} from 'node:fs/promises';
import {createHash, randomUUID} from 'node:crypto';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import os from 'node:os';
import {HOST_NAME} from '../../native-agent/wire.mjs';
import {manifestFor, PRIVATE_DIR} from '../../native-agent/install.mjs';
import {verifyTaskPackage} from '../../src/platform/tasks/contract.js';
import {decodeValue} from '../../src/platform/page-port/codec.js';
import {packageFingerprint} from '../../scripts/verify-package.mjs';
import {launchChrome} from './k5-sdk-native-launcher.mjs';
import {connect} from './sidebar-native-session.mjs';

const execute = promisify(execFile);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const demoUrl = 'http://127.0.0.1:43111/demo-form.html';
const terminal = new Set(['completed', 'stopped', 'failed', 'timed-out']);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

export function validateCompletedRun(snapshot, {runId, sourceHash, target, saved}) {
  const run = snapshot?.run;
  assert.equal(run?.tag, 'controller-run');
  assert.equal(run.runId, runId);
  assert.equal(run.state, 'completed');
  assert.equal(run.workerRetired, true);
  assert.equal(run.retirementState, 'released');
  assert.equal(run.revision?.sourceHash, sourceHash);
  for (const key of ['windowId', 'tabId', 'frameId', 'documentId', 'url'])
    assert.equal(run.target?.[key], target[key], `run target ${key}`);
  assert.equal(run.target.allowedOrigin, target.origin);
  if (saved) {
    assert.equal(run.revision.scriptId, saved.scriptId);
    assert.equal(run.revision.revision, saved.revision);
  }
  const results = snapshot.results?.filter(row => row.runId === runId);
  assert.equal(results?.length, 1, 'Exactly one durable result is required');
  const result = results[0];
  assert.equal(result.tag, 'controller-result');
  assert.equal(result.resultId, run.resultId);
  assert.equal(result.namespace, run.namespace);
  assert.equal(result.state, 'completed');
  assert.equal(result.outcome?.ok, true);
  assert.deepEqual(result.revision, run.revision, 'Result must carry its own exact revision');
  return {runId, resultId: result.resultId, revision: result.revision};
}

export function parseSearchCount(text) {
  const match = /^提交次数：(0|[1-9][0-9]*)$/.exec(text);
  assert(match && match[0] === text, 'The demo must return its complete search-count text');
  const count = Number(match[1]);
  assert(Number.isSafeInteger(count), 'Search count must be a safe integer');
  return count;
}

export function validateSearchCounts(before, afterDraft, afterSaved) {
  for (const count of [before, afterDraft, afterSaved]) assert(Number.isSafeInteger(count) && count >= 0);
  assert.equal(afterDraft, before + 1, 'Draft search must happen exactly once');
  assert.equal(afterSaved, afterDraft + 1, 'Saved search must happen exactly once');
  return {before, afterDraft, afterSaved};
}

async function saveJson(directory, name, value) {
  await writeFile(path.join(directory, name + '.json'), JSON.stringify(value, null, 2) + '\n', {flag: 'wx'});
}

export async function cli(root, directory, label, command, request, executeCommand = execute) {
  const requestFile = path.join(directory, label + '-request.json');
  await writeFile(requestFile, JSON.stringify(request, null, 2) + '\n', {flag: 'wx'});
  let output;
  try {
    output = await executeCommand(process.execPath, [path.join(root, 'native-agent/cli.mjs'), command, '--file', requestFile],
      {cwd: root, timeout: 25000, maxBuffer: 8 * 1024 * 1024});
  } catch (error) {
    await writeFile(path.join(directory, label + '-stdout.json'), error.stdout || '', {flag: 'wx'});
    await writeFile(path.join(directory, label + '-stderr.txt'), error.stderr || '', {flag: 'wx'});
    throw new Error(`${command} failed; retain raw evidence and inspect known request ID; no replay`, {cause: error});
  }
  await writeFile(path.join(directory, label + '-response.json'), output.stdout, {flag: 'wx'});
  await writeFile(path.join(directory, label + '-stderr.txt'), output.stderr, {flag: 'wx'});
  const response = JSON.parse(output.stdout);
  assert(!response.error, `${command} returned an error; no replay`);
  return response.result;
}

async function ownedSession(sessionFile) {
  assert(sessionFile, '--session is required');
  const session = JSON.parse(await readFile(sessionFile, 'utf8'));
  const browser = session.browser, profile = await realpath(browser.profile), info = await lstat(browser.profile);
  assert(info.isDirectory() && !info.isSymbolicLink());
  assert.equal(info.mode & 0o777, 0o700);
  assert.equal(path.dirname(profile), await realpath(os.tmpdir()));
  assert(path.basename(profile).startsWith('codex-cft-'));
  const {stdout} = await execute('/bin/ps', ['-p', String(browser.pid), '-o', 'pid=,ppid=,command=']);
  const match = stdout.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/);
  assert(match && Number(match[1]) === browser.pid && Number(match[2]) === browser.launcherPid);
  assert(match[3].includes(browser.executable) && match[3].includes('--user-data-dir=' + browser.profile));
  assert(match[3].includes('--use-mock-keychain'));
  return session;
}

async function bindNativeHost(directory, sessionFile) {
  const session = await ownedSession(sessionFile), source = manifestFor('cft');
  const bytes = await readFile(source), manifest = JSON.parse(bytes);
  assert.equal(manifest.name, HOST_NAME);
  assert.equal(manifest.path, path.join(PRIVATE_DIR, 'native-host'));
  assert.deepEqual(manifest.allowed_origins, ['chrome-extension://' + session.extensionId + '/']);
  const hostDirectory = path.join(session.browser.profile, 'NativeMessagingHosts');
  await mkdir(hostDirectory, {recursive: true, mode: 0o700});
  assert(!(await lstat(hostDirectory)).isSymbolicLink());
  const destination = path.join(hostDirectory, HOST_NAME + '.json');
  try {assert.deepEqual(await readFile(destination), bytes, 'Never replace another host manifest');}
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await writeFile(destination, bytes, {flag: 'wx', mode: 0o600});
  }
  await saveJson(directory, 'native-profile-binding', {ownedPid: session.browser.pid,
    extensionId: session.extensionId, source, destination, manifestSha256: sha(bytes),
    note: 'Profile setup only; not an authenticated native connection receipt'});
}

async function inspect(directory, sessionFile) {
  const session = await ownedSession(sessionFile), client = await connect(session.endpoint);
  try {
    const targets = (await client.send('Target.getTargets')).targetInfos;
    const worker = selectCurrentWorker(targets, session);
    const {sessionId} = await client.send('Target.attachToTarget', {targetId: worker.targetId, flatten: true});
    // Existing DB only. Readonly transactions and aborted upgrades cannot fabricate product state.
    const expression = `new Promise((resolve,reject)=>{
      const request=indexedDB.open('opendesk-browser');
      request.onupgradeneeded=()=>{request.transaction.abort();reject(Error('Existing database required'));};
      request.onerror=()=>reject(request.error);
      request.onsuccess=async()=>{const db=request.result;
        try {const names=['frameworkKV','runs','results','commandJournal','scriptHeads','scriptRevisions'];
          const data={};for(const name of names){if(!db.objectStoreNames.contains(name))throw Error('Missing store '+name);
            data[name]=await new Promise((accept,fail)=>{const tx=db.transaction([name],'readonly');
              const get=tx.objectStore(name).getAll();let rows;get.onsuccess=()=>{rows=get.result;};
              tx.oncomplete=()=>accept(rows);tx.onerror=()=>fail(tx.error);tx.onabort=()=>fail(tx.error);});}
          resolve(data);
        }catch(error){reject(error);}finally{db.close();}};})`;
    const response = await client.send('Runtime.evaluate', {expression, awaitPromise: true, returnByValue: true}, sessionId);
    assert(!response.exceptionDetails, 'Readonly observation failed');
    await saveJson(directory, 'database-snapshot', {observedAt: new Date().toISOString(),
      extensionId: session.extensionId, worker, browser: await client.send('Browser.getVersion'),
      recordedWorkerTargetId: session.serviceWorker.targetId,
      workerTargetChanged: worker.targetId !== session.serviceWorker.targetId,
      data: response.result.value, level: 'raw observation; verification must correlate real run and ACK identities'});
  } finally {client.close();}
}

export function selectCurrentWorker(targets, session) {
  // A suspended MV3 worker has a new CDP target when it wakes. This is only
  // readonly discovery; run/host identities must still be verified separately.
  const workers = targets.filter(t => t.type === 'service_worker' &&
    t.url === session.serviceWorker.url && new URL(t.url).hostname === session.extensionId);
  assert.equal(workers.length, 1, 'Exactly one live worker of the recorded extension is required');
  return workers[0];
}

async function inputs(root, directory, {requireDemo = false} = {}) {
  const source = await readFile(path.join(root, 'examples/tasks/modern-search-draft.js'), 'utf8');
  const pkg = JSON.parse(await readFile(path.join(root, 'examples/tasks/modern-search.v1.opendesk-task.json'), 'utf8'));
  await verifyTaskPackage(pkg);
  assert.equal(pkg.manifest.taskId, 'sample.modern-search');
  assert.equal(pkg.manifest.version, '1.0.0');
  assert.equal(pkg.sourceUtf8, source);
  assert.equal(pkg.manifest.program.sourceHash, sha(source));
  const candidateDemo = await readFile(path.join(root, 'examples/tasks/demo-form.html'));
  const record = {sourceHash: sha(source), manifestHash: pkg.manifestHash,
    candidateDemoSha256: sha(candidateDemo), package: await packageFingerprint(path.join(root, 'dist/production'))};
  if (requireDemo) {
    const response = await fetch(demoUrl);
    assert(response.ok, 'Exact demo must be served');
    record.servedDemoSha256 = sha(Buffer.from(await response.arrayBuffer()));
    assert.equal(record.servedDemoSha256, record.candidateDemoSha256, 'External demo bytes cannot qualify this candidate');
  }
  await saveJson(directory, 'inputs', record);
  return {source, pkg, record};
}

async function modern(root, directory) {
  const {source, record} = await inputs(root, directory, {requireDemo: true});
  const current = await cli(root, directory, 'target', 'target.current', {});
  assert(current.registrationId);
  assert.equal(current.target?.url, demoUrl);
  const base = {registrationId: current.registrationId, target: current.target};
  async function run(label, sourceRef) {
    const sourceHash = sourceRef.kind === 'draft' ? sha(sourceRef.sourceUtf8) : sourceRef.contentHash;
    const started = await cli(root, directory, label + '-start', 'run.start', {
      ...base, requestId: 'r62-' + randomUUID(), source: sourceRef,
      params: {keyword: 'OpenDesk'}, deadlineMs: 30000});
    assert(started.runId, 'Only an acknowledged run may be polled');
    for (let attempt = 0; attempt < 50; attempt++) {
      const observed = await cli(root, directory, `${label}-get-${attempt}`, 'run.get', {
        registrationId: base.registrationId, runId: started.runId});
      if (terminal.has(observed.run?.state) && observed.run?.retirementState === 'released') {
        const identity = validateCompletedRun(observed, {runId: started.runId, sourceHash,
          target: base.target, ...(sourceRef.kind === 'saved' ? {saved: sourceRef} : {})});
        return {...identity, value: decodeValue(observed.results[0].outcome.valueWire)};
      }
      await delay(250);
    }
    throw new Error('Acknowledged run did not settle; inspect raw evidence without replay');
  }
  const countSource = 'async function main() {return {countText:await page.locator("#search-count").textContent()};}\n';
  await writeFile(path.join(directory, 'readonly-count-source.js'), countSource, {flag: 'wx'});
  const observeCount = async label => {
    const observed = await run(label, {kind: 'draft', sourceUtf8: countSource});
    return {...observed, value: {...observed.value, count: parseSearchCount(observed.value.countText)}};
  };
  const before = await observeCount('count-before');
  const draft = await run('modern-draft', {kind: 'draft', sourceUtf8: source});
  const afterDraft = await observeCount('count-after-draft');
  assert(Number.isSafeInteger(before.value.count) && before.value.count >= 0);
  assert.equal(afterDraft.value.count, before.value.count + 1, 'Stop before saving if the draft search count is wrong');
  const saved = await cli(root, directory, 'save', 'script.save', {
    registrationId: base.registrationId, requestId: 'r62-' + randomUUID(),
    scriptId: 'r62-modern-' + randomUUID(), expectedRevision: 0, sourceUtf8: source});
  assert.equal(saved.contentHash, record.sourceHash);
  assert.equal(saved.revision, 1);
  const persisted = await run('modern-saved', {kind: 'saved', scriptId: saved.scriptId,
    revision: saved.revision, contentHash: saved.contentHash});
  const afterSaved = await observeCount('count-after-saved');
  const counts = validateSearchCounts(before.value.count, afterDraft.value.count, afterSaved.value.count);
  await saveJson(directory, 'modern-runs', {draft, saved: persisted,
    counts, countObservations: {before, afterDraft, afterSaved},
    status: 'DURABLE_RUNS_AND_SINGLE_SEARCH_COUNTS_ONLY',
    remaining: ['real commandJournal ACK correlation', 'Task lifecycle and standalone restart']});
}

async function session(root, directory, binary) {
  assert(binary, '--binary is required');
  await inputs(root, directory);
  const browser = await launchChrome({root, directory, binary, extension: path.join(root, 'dist/production'),
    headed: true, label: 'r62', sameProfileRestart: true});
  const manifest = JSON.parse(await readFile(path.join(root, 'dist/production/manifest.json'), 'utf8'));
  async function identity(label) {
    const client = await connect(browser.endpoint);
    try {
      let targets, workers;
      for (let attempt = 0; attempt < 40; attempt++) {
        targets = (await client.send('Target.getTargets')).targetInfos;
        workers = targets.filter(t => t.type === 'service_worker' && t.url.startsWith('chrome-extension://') &&
          new URL(t.url).pathname === '/' + manifest.background.service_worker);
        if (workers.length) break;
        await delay(250);
      }
      await saveJson(directory, label + '-targets', targets);
      assert.equal(workers.length, 1);
      const extensionId = new URL(workers[0].url).hostname;
      await saveJson(directory, label, {browser: browser.metadata, endpoint: browser.endpoint,
        extensionId, serviceWorker: workers[0], package: await packageFingerprint(path.join(root, 'dist/production'))});
      return {extensionId, endpoint: browser.endpoint, chromePid: browser.metadata.pid};
    } finally {client.close();}
  }
  const reader = createInterface({input: process.stdin});
  let originalError;
  try {
    console.log(JSON.stringify({ready: await identity('session')}));
    for await (const line of reader) {
      if (line === 'restart') {
        await browser.restart();
        console.log(JSON.stringify({restarted: await identity('session-restarted')}));
      } else if (line === 'stop') break;
      else console.log('Use restart or stop');
    }
  } catch (error) {
    originalError = error;
    await saveJson(directory, 'session-failure', {name: error.name, message: error.message, stack: error.stack});
    throw error;
  } finally {
    reader.close();
    process.stdin.pause();
    await browser.copyLog().catch(() => {});
    try {console.log(JSON.stringify({cleanup: await browser.stop()}));}
    catch (error) {
      await saveJson(directory, 'session-cleanup-failure', {name: error.name, message: error.message, stack: error.stack});
      if (!originalError) throw error;
    }
  }
}

export async function main(args) {
  const command = args[0], option = name => args.find(arg => arg.startsWith(name + '='))?.slice(name.length + 1);
  const root = process.cwd(), directory = path.resolve(option('--evidence') || 'artifacts/r62-native');
  await mkdir(directory, {recursive: true});
  if (command === 'session') await session(root, directory, option('--binary'));
  else if (command === 'modern') await modern(root, directory);
  else if (command === 'preflight') await inputs(root, directory, {requireDemo: true});
  else if (command === 'bind-native-host') await bindNativeHost(directory, option('--session'));
  else if (command === 'inspect') await inspect(directory, option('--session'));
  else throw new Error('Use session | modern | preflight | bind-native-host | inspect with a fresh --evidence directory');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => {console.error(error.stack); process.exitCode = 1;});
}
