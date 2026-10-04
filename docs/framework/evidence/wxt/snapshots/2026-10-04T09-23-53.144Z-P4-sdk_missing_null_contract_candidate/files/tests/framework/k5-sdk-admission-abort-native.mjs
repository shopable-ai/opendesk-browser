import assert from 'node:assert/strict';
import {readFile, writeFile, mkdir, readdir, realpath} from 'node:fs/promises';
import {appendFileSync} from 'node:fs';
import {createHash, randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {launchChrome} from './k5-sdk-native-launcher.mjs';
import {CP1, discoverAdmissionPoint} from './k5-sdk-admission-abort-native-selector.mjs';
import {NotObserved, inspectPausedAdmission} from './k5-sdk-admission-abort-native-inspect.mjs';
import {encodeValue, decodeValue} from '../../src/platform/page-port/codec.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const hash = value => createHash('sha256').update(value).digest('hex');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const projectError = error => ({code: error.code, message: error.message, stack: error.stack});
async function until(work, description, ms = 12000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) { const value = await work(); if (value) return value; await sleep(30); }
  throw new NotObserved(`Native observation timed out: ${description}`);
}
async function fingerprint(directory) {
  const files = [];
  async function walk(prefix = '') {
    for (const entry of await readdir(path.join(directory, prefix), {withFileTypes: true})) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(relative);
      else if (entry.isFile()) { const bytes = await readFile(path.join(directory, relative)); files.push({path: relative, bytes: bytes.length, sha256: hash(bytes)}); }
      else throw new Error(`Unexpected package entry: ${relative}`);
    }
  }
  await walk(); files.sort((a,b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  return {files, packageHash: hash(JSON.stringify(files))};
}
async function sourceFingerprint() {
  const files = [];
  async function walk(prefix) {
    for (const entry of await readdir(path.join(root, prefix), {withFileTypes: true})) {
      const relative = `${prefix}/${entry.name}`;
      if (entry.isDirectory() && prefix.startsWith('src')) await walk(relative);
      else if (entry.isFile() && (prefix.startsWith('src') || entry.name.startsWith('k5-sdk-admission-abort-native') || entry.name === 'k5-sdk-native-launcher.mjs'))
        files.push({path: relative, sha256: hash(await readFile(path.join(root, relative)))});
    }
  }
  await walk('src'); await walk('tests/framework'); files.sort((a,b) => a.path.localeCompare(b.path)); return files;
}
async function connect(endpoint, log, label) {
  const socket = new WebSocket(endpoint), pending = new Map(), events = []; let sequence = 0;
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  socket.onmessage = ({data}) => {
    const message = JSON.parse(data); log({label, direction: 'received', message});
    if (!message.id) { events.push(message); return; }
    const item = pending.get(message.id); if (!item) return;
    pending.delete(message.id); clearTimeout(item.timer);
    message.error ? item.reject(new Error(JSON.stringify(message.error))) : item.resolve(message.result);
  };
  socket.onclose = () => { for (const item of pending.values()) { clearTimeout(item.timer); item.reject(new Error(`${label} socket closed`)); } pending.clear(); };
  return {events, send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++sequence, message = {id, method, params};
      const timer = setTimeout(() => { pending.delete(id); reject(new NotObserved(`${label} ${method} timeout`)); }, 20000);
      pending.set(id, {resolve, reject, timer}); log({label, direction: 'sent', message}); socket.send(JSON.stringify(message));
    });
  }, close: () => socket.close()};
}
async function evaluate(client, expression) {
  const raw = await client.send('Runtime.evaluate', {expression, awaitPromise: true, returnByValue: true});
  if (raw.exceptionDetails) throw new Error(JSON.stringify(raw.exceptionDetails));
  return raw.result.value;
}
function pageRequest(payload) {
  return new Promise(resolve => {
    const timer = setTimeout(() => { window.removeEventListener('OPEN_DESK_SDK_RESULT', receive); resolve({observationTimeout: true}); }, 65000);
    function receive(event) {
      const message = JSON.parse(event.detail); if (message.requestId !== payload.requestId) return;
      clearTimeout(timer); window.removeEventListener('OPEN_DESK_SDK_RESULT', receive); resolve(message.response);
    }
    window.addEventListener('OPEN_DESK_SDK_RESULT', receive);
    window.dispatchEvent(new CustomEvent('CHROME_BRIDGE_INTERFACE', {detail: JSON.stringify({protocol: 'opendesk.foundation.v1', type: 'SDK_REQUEST', payload})}));
  });
}
function nativeHello() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const helloId = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
  return new Promise(resolve => {
    const timer = setTimeout(() => { window.removeEventListener('OPEN_DESK_SDK_READY', receive); resolve({observationTimeout: true}); }, 12000);
    function receive(event) {
      const message = JSON.parse(event.detail); if (message.helloId !== helloId) return;
      clearTimeout(timer); window.removeEventListener('OPEN_DESK_SDK_READY', receive); resolve(message.response);
    }
    window.addEventListener('OPEN_DESK_SDK_READY', receive);
    window.dispatchEvent(new CustomEvent('OPEN_DESK_SDK_HELLO', {detail: JSON.stringify({protocol: 'opendesk.foundation.v1', type: 'SDK_HELLO', helloId, payload: {sdkVersion: '1.0.0'}})}));
  });
}
function readonlySnapshot() {
  return (async () => {
    const databases = await indexedDB.databases();
    if (!databases.some(db => db.name === 'opendesk-browser')) throw new Error('Observer refuses to create the product database');
    const stores = await new Promise((resolve, reject) => {
      const request = indexedDB.open('opendesk-browser'); request.onerror = () => reject(request.error);
      request.onupgradeneeded = () => { request.transaction.abort(); reject(new Error('Observer refuses database schema creation')); };
      request.onsuccess = () => {
        const db = request.result, names = ['commandJournal','runs','results'], rows = {};
        const tx = db.transaction(names, 'readonly');
        for (const name of names) { rows[name] = []; const cursor = tx.objectStore(name).openCursor();
          cursor.onsuccess = () => { const item = cursor.result; if (item) { rows[name].push({key: item.primaryKey, value: item.value}); item.continue(); } }; }
        tx.oncomplete = () => { db.close(); resolve(rows); }; tx.onabort = () => { db.close(); reject(tx.error); };
      };
    });
    return {databases, stores, permissions: await chrome.permissions.getAll()};
  })();
}
const invocationRows = snap => ({journal: snap.stores.commandJournal.filter(row => ['sdk-operation','sdk-request'].includes(row.value.tag)),
  runs: snap.stores.runs.filter(row => row.value.tag === 'sdk-service'), results: snap.stores.results});
const requireEmpty = snap => { const rows = invocationRows(snap); assert.equal(rows.journal.length, 0); assert.equal(rows.runs.length, 0); assert.equal(rows.results.length, 0); return rows; };
const grantFrom = (snap, documentId) => {
  const rows = snap.stores.commandJournal.filter(row => row.value.tag === 'sdk-grant' && row.value.documentId === documentId);
  assert.equal(rows.length, 1); assert.equal(rows[0].value.active, true); return rows[0].value;
};

async function runNative({extension, label, expectedHash, executionSlot, permissionTimeout}, packageBefore, selector, output) {
  const directory = path.join(output, `production-${label}`); await mkdir(directory, {recursive: true});
  const report = {id: CP1, status: 'NOT_TESTED', label, executionSlot, packageBefore, selector,
    unchangedProductPackage: true, productHooksAdded: false, databaseWritesByRunner: false,
    finalProductPassed: false, f3Accepted: false, b05Closed: false, original603Closed: false, evidence: {}};
  const sourcesBefore = await sourceFingerprint();
  const packagedManifest = JSON.parse(await readFile(path.join(extension, 'manifest.json'), 'utf8'));
  await writeFile(path.join(directory, 'source-before.json'), JSON.stringify(sourcesBefore, null, 2) + '\n');
  const write = (name, value) => writeFile(path.join(directory, name), JSON.stringify(value, null, 2) + '\n');
  const log = entry => appendFileSync(path.join(directory, 'raw-cdp.jsonl'), JSON.stringify({at: new Date().toISOString(), ...entry}) + '\n');
  const http = [];
  const server = createServer(async (req,res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks).toString('utf8');
    const hit = {at: new Date().toISOString(), method: req.method, url: req.url, headers: req.headers, body, bodySha256: hash(body)};
    http.push(hit); appendFileSync(path.join(directory, 'raw-server.jsonl'), JSON.stringify(hit) + '\n');
    res.writeHead(200, {'content-type': req.url.startsWith('/target') ? 'text/html' : 'application/json', 'cache-control': 'no-store'});
    res.end(req.url.startsWith('/target') ? '<!doctype html><title>CP1 actual SDK target</title><h1>Native admission abort</h1>' : JSON.stringify({method: req.method, body: hit.body, falseValue: false, zero: 0}));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`, token = randomUUID(), clients = [];
  const hits = () => http.filter(item => item.method === 'POST' && item.url === `/effect?token=${token}`);
  let owned;
  try {
    assert.equal((await fingerprint(extension)).packageHash, expectedHash, 'Pinned production package changed before launch');
    const binary = path.join(root, `tests/.cache/m5-browsers/${label === '138' ? '138.0.7204.183' : '154.0.8037.92'}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`);
    owned = await launchChrome({root, binary, extension, headed: true, directory, label}); report.evidence.launcher = owned.metadata;
    const browser = await connect(owned.endpoint, log, 'browser'); clients.push(browser);
    await browser.send('Target.setDiscoverTargets', {discover: true});
    report.evidence.browserVersion = await browser.send('Browser.getVersion');
    assert.equal(report.evidence.browserVersion.product, `Chrome/${label === '138' ? '138.0.7204.183' : '154.0.8037.92'}`);
    report.evidence.nativeProcesses = (await browser.send('SystemInfo.getProcessInfo')).processInfo;
    assert(report.evidence.nativeProcesses.some(item => item.type === 'browser' && item.id === owned.metadata.pid));
    const debuggingURL = `http://127.0.0.1:${new URL(owned.endpoint).port}`;
    async function attach(id) {
      const target = await until(async () => (await (await fetch(`${debuggingURL}/json/list`)).json()).find(item => item.id === id && item.webSocketDebuggerUrl), 'actual target endpoint');
      const client = await connect(target.webSocketDebuggerUrl, log, id); clients.push(client); return client;
    }
    const worker = await until(async () => (await browser.send('Target.getTargets')).targetInfos.find(item => item.type === 'service_worker' && item.url.startsWith('chrome-extension://') && item.url.endsWith('/sw.js')), 'actual same-package SW');
    const workerClient = await attach(worker.targetId); await workerClient.send('Runtime.enable');
    await until(() => evaluate(workerClient, 'typeof chrome!=="undefined"&&!!chrome.runtime?.id'), 'actual SW bindings');
    const identity = await evaluate(workerClient, '({id:chrome.runtime.id,manifest:chrome.runtime.getManifest(),url:chrome.runtime.getURL("sw.js")})');
    const extensionId = identity.id;
    assert.equal(identity.manifest.name, packagedManifest.name); assert.equal(identity.manifest.version, packagedManifest.version);
    assert.equal(identity.url, worker.url); report.evidence.nativeExtensionIdentity = identity;
    assert.equal(worker.url, `chrome-extension://${extensionId}/sw.js`);
    report.evidence.originalWorker = worker;
    const targetURL = `${origin}/target?token=${token}`, pageId = (await browser.send('Target.createTarget', {url: targetURL})).targetId;
    const page = await attach(pageId); await until(() => evaluate(page, 'document.readyState==="complete"'), 'native target loaded');
    const toolId = (await browser.send('Target.createTarget', {url: `chrome-extension://${extensionId}/ui/tool.html`})).targetId;
    const tool = await attach(toolId); await until(() => evaluate(tool, '!!document.querySelector("#sdk-install")'), 'actual tool SDK entry');
    await tool.send('ServiceWorker.enable');
    async function click(selector) {
      await browser.send('Target.activateTarget', {targetId: toolId});
      const point = await evaluate(tool, `(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView();const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2,disabled:e.disabled};})()`);
      assert(!point.disabled);
      for (const type of ['mousePressed','mouseReleased']) await tool.send('Input.dispatchMouseEvent', {type, x: point.x, y: point.y, button: 'left', clickCount: 1});
    }
    const tabId = await evaluate(tool, `chrome.tabs.query({}).then(tabs=>tabs.find(t=>t.url===${JSON.stringify(targetURL)})?.id)`); assert(Number.isInteger(tabId));
    await click('#sdk-refresh'); await until(() => evaluate(tool, `!!document.querySelector('#sdk-tab option[value="${tabId}"]')`), 'explicit target option');
    await evaluate(tool, `document.querySelector('#sdk-tab').value=${JSON.stringify(String(tabId))};document.querySelector('#sdk-tab').dispatchEvent(new Event('change'));`);
    const documentId = await until(() => evaluate(tool, '[...document.querySelector("#sdk-document").options].find(o=>o.textContent.startsWith("frame 0 "))?.value'), 'actual documentId');
    await evaluate(tool, `document.querySelector('#sdk-document').value=${JSON.stringify(documentId)};document.querySelector('#sdk-document').dispatchEvent(new Event('change'));for(const e of document.querySelectorAll('[name=sdk-capability]'))e.checked=e.value==='network';document.querySelector('#sdk-capabilities').dispatchEvent(new Event('change'));`);
    report.evidence.target = {pageId, toolId, targetURL, tabId, frameId: 0, documentId, extensionId};
    report.evidence.permissionsBefore = await evaluate(tool, 'chrome.permissions.getAll()');
    await click('#sdk-install'); let install;
    try { install = await until(async () => {
      const state = await evaluate(tool, '({state:document.querySelector("#sdk-status").dataset.state,text:document.querySelector("#sdk-status").textContent,raw:document.querySelector("#sdk-result").textContent})');
      return ['installed','error'].includes(state.state) && state;
    }, 'real permission and SDK installation', permissionTimeout); }
    catch (error) { if (!(await evaluate(tool, 'chrome.permissions.contains({origins:["http://127.0.0.1/*"]})'))) error.code = 'E_NATIVE_PERMISSION_WAIT'; throw error; }
    report.evidence.install = install; report.evidence.permissionsAfter = await evaluate(tool, 'chrome.permissions.getAll()');
    await write('install.json', report.evidence); assert.equal(install.state, 'installed', install.text);
    const hello = await evaluate(page, 'OpenDeskSDK.ready()'); assert.equal(hello.ready, true); report.evidence.hello = hello;
    const snapshot = () => evaluate(tool, `(${readonlySnapshot.toString()})()`);
    const baseline = await snapshot(); await write('baseline.json', baseline); requireEmpty(baseline);
    const grant = grantFrom(baseline, documentId); report.evidence.originalGrant = grant;
    // All IDB observations from now until targetDestroyed are on the paused
    // native frame/objects. Never start a competing tool IDB transaction here.
    await workerClient.send('Debugger.enable');
    const script = await until(() => workerClient.events.find(event => event.method === 'Debugger.scriptParsed' && event.params.url === worker.url)?.params, 'exact production script');
    const loaded = (await workerClient.send('Debugger.getScriptSource', {scriptId: script.scriptId})).scriptSource;
    if (hash(loaded) !== selector.sourceSha256) throw new NotObserved('Loaded SW source differs from the parsed unchanged production package');
    const possible = (await workerClient.send('Debugger.getPossibleBreakpoints', {start: {scriptId: script.scriptId, ...selector.point.location},
      end: {scriptId: script.scriptId, ...selector.point.endLocation}, restrictToFunction: true})).locations;
    const exact = possible.filter(item => item.lineNumber === selector.point.location.lineNumber && item.columnNumber === selector.point.location.columnNumber);
    report.evidence.possibleBreakpoints = possible;
    if (exact.length !== 1) throw new NotObserved('Exact AST runs-put codepoint is not a unique native breakable location; no neighbour fallback');
    const breakpoint = await workerClient.send('Debugger.setBreakpoint', {location: exact[0]});
    if (breakpoint.actualLocation.lineNumber !== exact[0].lineNumber || breakpoint.actualLocation.columnNumber !== exact[0].columnNumber)
      throw new NotObserved('CDP relocated the required breakpoint');
    const args = {url: `${origin}/effect?token=${token}`, data: {falseValue: false, zero: 0}};
    const payload = {requestId: `cp1-${randomUUID()}`, method: 'AXIOS_POST', argsWire: encodeValue(args), deadlineAt: Date.now() + 60000};
    report.evidence.payload = payload;
    await evaluate(page, `globalThis.__cp1={};(${pageRequest.toString()})(${JSON.stringify(payload)}).then(value=>{__cp1.first=value;});true`);
    const paused = await until(() => workerClient.events.find(event => event.method === 'Debugger.paused' && event.params.hitBreakpoints?.includes(breakpoint.breakpointId))?.params, 'exact native CP1 pause', 6000);
    const location = paused.callFrames[0].location;
    if (location.scriptId !== script.scriptId || location.lineNumber !== exact[0].lineNumber || location.columnNumber !== exact[0].columnNumber)
      throw new NotObserved('Paused frame is not the exact pre-runs-put codepoint');
    report.evidence.barrier = {breakpoint, paused, exactLocation: exact[0]};
    const inspection = await inspectPausedAdmission({client: workerClient, paused, selector, payload, args, expected: {extensionId, tabId, documentId, grant}});
    report.evidence.transaction = inspection.evidence;
    assert.equal(hits().length, 0, 'Effect occurred before admission commit');
    const version = await until(() => tool.events.flatMap(event => event.params?.versions ?? []).find(item => item.scriptURL === worker.url && item.targetId === worker.targetId && item.runningStatus === 'running'), 'exact old SW version/target association');
    await write('paused-native-transaction.json', report.evidence);
    const stop = {at: new Date().toISOString(), version, originalTargetId: worker.targetId}; report.evidence.workerStop = stop;
    report.evidence.preStopPendingRequest = await inspection.pendingFact();
    await tool.send('ServiceWorker.stopWorker', {versionId: version.versionId});
    stop.targetDestroyed = await until(() => browser.events.find(event => event.method === 'Target.targetDestroyed' && event.params.targetId === worker.targetId), 'actual old targetDestroyed');
    assert(!(await browser.send('Target.getTargets')).targetInfos.some(item => item.targetId === worker.targetId));
    // Native Hello through the unchanged relay wakes recovery without invoking
    // any SDK operation or issuing a replacement grant/host identity.
    stop.nativeHello = await evaluate(page, `(${nativeHello.toString()})()`); assert.equal(stop.nativeHello.ok, true);
    stop.replacement = await until(async () => (await browser.send('Target.getTargets')).targetInfos.find(item => item.type === 'service_worker' && item.url === worker.url && item.targetId !== worker.targetId), 'new actual product SW');
    const recovered = await snapshot(); await write('recovered-no-admission.json', recovered);
    report.evidence.rollbackRows = requireEmpty(recovered);
    const recoveredGrant = grantFrom(recovered, documentId); assert.deepEqual(recoveredGrant, grant);
    assert.equal(hits().length, 0); report.evidence.httpBeforeRetry = hits();
    const old = inspection.evidence.observed.operation;
    assert(!recovered.stores.commandJournal.some(row => row.key === old.opKey || row.key === inspection.evidence.observed.lockKey));
    assert(!recovered.stores.runs.some(row => row.key === old.runId)); assert(!recovered.stores.results.some(row => row.key === old.resultId));
    report.evidence.abortObservation = {pendingNativeReadwriteTransaction: true, oldContextDestroyed: true,
      nativePersistentAtomicRollbackObserved: true, nativeAbortEvent: 'Not observable after its JS worker context is destroyed; no fabricated abort callback',
      basis: 'Exact native transaction identity and pending request before termination; all invocation journal/run/result stores empty after native recovery'};
    await until(() => evaluate(page, '!!globalThis.__cp1.first'), 'original relay callback settles after termination', 6000);
    report.evidence.originalPageReturn = await evaluate(page, '__cp1.first');
    assert.equal(report.evidence.originalPageReturn.ok, false, 'A killed pre-commit attempt must not return a successful effect');
    const response = await evaluate(page, `(${pageRequest.toString()})(${JSON.stringify(payload)})`); report.evidence.firstAdmissionReturn = response;
    assert.equal(response.ok, true); assert(Object.hasOwn(response.data ?? {}, 'valueWire'));
    const nativeResult = decodeValue(response.data.valueWire); assert.equal(nativeResult.PageBrigeCode, 0);
    assert.equal(nativeResult.data.data.falseValue, false); assert.equal(nativeResult.data.data.zero, 0);
    const after = await snapshot(); await write('first-admission-after-abort.json', after);
    const rows = invocationRows(after); assert.equal(rows.journal.filter(row => row.value.tag === 'sdk-operation').length, 1);
    assert.equal(rows.journal.filter(row => row.value.tag === 'sdk-request').length, 1); assert.equal(rows.runs.length, 1); assert.equal(rows.results.length, 1);
    const op = rows.journal.find(row => row.value.tag === 'sdk-operation').value;
    assert.equal(op.requestId, payload.requestId); assert.equal(op.documentId, documentId); assert.equal(op.grantIncarnation, grant.grantIncarnation);
    assert.equal(op.state, 'durable'); assert.equal(op.submissionCount, 1); assert.equal(op.requestDigest, old.requestDigest);
    for (const key of ['opId','runId','resultId']) assert.notEqual(op[key], old[key], 'Aborted identity must not be patched into a new admission');
    assert.equal(rows.runs[0].value.runId, op.runId); assert.equal(rows.results[0].value.opId, op.opId);
    assert.deepEqual(grantFrom(after, documentId), grant); assert.equal(hits().length, 1);
    assert.deepEqual(JSON.parse(hits()[0].body), args.data);
    report.evidence.afterRows = rows; report.evidence.httpAfterRetry = hits(); report.evidence.nativeResult = nativeResult;
    report.status = 'PASS';
  } catch (error) {
    report.status = error.code === 'E_NATIVE_NOT_OBSERVED' ? 'NOT_TESTED' : error.code === 'E_NATIVE_PERMISSION_WAIT' ? 'BLOCKED' : 'FAIL';
    report.reason = error.message; report.error = projectError(error);
  } finally {
    if (owned) try { report.evidence.launcherExit = await owned.stop(); } catch (error) { report.status = 'FAIL'; report.cleanupError = projectError(error); }
    for (const client of clients) client.close();
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    await write('raw-server.json', http); report.packageAfter = await fingerprint(extension);
    report.packageDrift = report.packageAfter.packageHash !== packageBefore.packageHash;
    const sourcesAfter = await sourceFingerprint(); await write('source-after.json', sourcesAfter);
    report.sourceDrift = JSON.stringify(sourcesAfter) !== JSON.stringify(sourcesBefore);
    report.classification = report.packageDrift || report.sourceDrift ? 'diagnostic-drift' : 'bounded-native-CP1';
    if (report.status === 'PASS' && (report.packageDrift || report.sourceDrift)) { report.status = 'NOT_TESTED'; report.reason = 'Source/package changed during native execution; preserved as diagnostics'; }
    await write('report.json', report);
  }
  return report;
}

async function main() {
  assert.equal(process.cwd(), root, `Run with cwd=${root}`);
  const argv = process.argv.slice(2), option = (name, fallback) => argv.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
  const extension = await realpath(option('extension', path.join(root, 'dist/production')));
  const sw = await readFile(path.join(extension, 'sw.js'), 'utf8'), selector = discoverAdmissionPoint(sw), packageBefore = await fingerprint(extension);
  const output = path.join(root, 'docs/framework/evidence/f2-sdk-admission-abort', `${argv.includes('--run') ? 'native' : 'selector'}-${new Date().toISOString().replaceAll(':','-')}-${randomUUID().slice(0,8)}`);
  await mkdir(output, {recursive: true});
  if (!argv.includes('--run')) {
    assert(selector.ready, selector.reason);
    assert.equal(discoverAdmissionPoint(`${sw}\nfixture.put('runs',{tag:'sdk-service'},'ambiguous');`).ready, false);
    assert.equal(discoverAdmissionPoint(sw.replaceAll('sdk-service','cp1-selector-no-service')).ready, false);
    const report = {browserLaunched: false, nativeStatus: 'NOT_TESTED', parseChecks: 'PASS', selector, packageBefore,
      next: '--run requires the stable production package hash and a main-issued execution-slot; SDK four combinations have priority',
      f3Accepted: false, b05Closed: false, original603Closed: false};
    await writeFile(path.join(output, 'selector-check.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({output, browserLaunched: false, parseChecks: 'PASS', selectorReady: selector.ready, location: selector.point.location})); return;
  }
  const expectedHash = option('expected-package-hash'), executionSlot = option('execution-slot');
  assert.equal(extension, await realpath(path.join(root, 'dist/production')), 'Native CP1 must use the current same production package');
  assert(/^[a-f0-9]{64}$/.test(expectedHash ?? ''), 'Pin the main-released stable production package hash');
  assert(executionSlot, 'Only run during an explicitly assigned native execution slot');
  assert.equal(packageBefore.packageHash, expectedHash); assert(argv.includes('--headed'), 'CP1 real permission flow requires headed execution');
  if (!selector.ready) {
    await writeFile(path.join(output, 'report.json'), JSON.stringify({id: CP1, status: 'NOT_TESTED', reason: selector.reason, selector, packageBefore, browserLaunched: false}, null, 2) + '\n');
    process.exitCode = 3; return;
  }
  const label = option('chrome', '138'); assert(['138','154'].includes(label), 'Choose exactly one actual Chrome version per assigned slot');
  const permissionTimeout = Number(option('permission-timeout','120000')); assert(Number.isSafeInteger(permissionTimeout) && permissionTimeout > 0 && permissionTimeout <= 600000);
  const report = await runNative({extension, label, expectedHash, executionSlot, permissionTimeout}, packageBefore, selector, output);
  console.log(JSON.stringify({output, id: CP1, status: report.status, reason: report.reason, packageDrift: report.packageDrift, sourceDrift: report.sourceDrift}));
  process.exitCode = report.status === 'PASS' ? 0 : report.status === 'FAIL' ? 1 : 3;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
