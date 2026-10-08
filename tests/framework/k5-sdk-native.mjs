import assert from 'node:assert/strict';
import {inputIdentity} from '../../scripts/wxt-checkpoint.mjs';
import {createServer} from 'node:http';
import {readFile, writeFile, mkdir, readdir, realpath} from 'node:fs/promises';
import {appendFileSync} from 'node:fs';
import {createHash, randomUUID} from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {encodeValue, decodeValue} from '../../src/platform/page-port/codec.js';
import {PROTOCOL} from '../../src/platform/protocol.js';
import {SDK_METHODS, ADMITTED_METHODS, SDK_VERSION} from '../../src/framework/sdk/registry.js';
import {SDK_RESOURCE_PATHS, SDK_RESOURCE_ALIASES, SDK_RESOURCE_MANIFEST} from '../../src/framework/sdk/resource-contract.js';
import {observeLegacyStorage, observeLegacyHttp, observeLegacyService, observeLegacyResource, discoverLegacyCompletion} from './k5-sdk-legacy-consumers.mjs';
import {launchChrome, LAUNCHER} from './k5-sdk-native-launcher.mjs';
import {observePage, sdkInvocationExpression, observedSdkInvocation, bindPublicSdkPayload} from './b05-product-acceptance-20261003.mjs';
import {validateNativeSelectionReceipt} from './k5-sdk-native-selection-receipt.mjs';
import {runOriginalStorageCases} from './k5-sdk-original-storage-native.mjs';
import {runOriginalSessionCases} from './k5-sdk-original-session-native.mjs';
import {observeNativeToolResources, observeNativeSdkResources, runNativeSdkResourceCase, requireIdleSdkResources, validateNativeSdkDisposal, waitForNativeToolConnection} from './k5-sdk-native-resource-observation.mjs';

// Load the existing built product verbatim. No generated extension, manifest key,
// grant fixture, substituted runtime/MessageSender, or test-only product route.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
assert.equal(process.cwd(), root, `Run with cwd=${root}`);
const args = process.argv.slice(2), option = (name, fallback) => args.find(arg => arg.startsWith(`--${name}=`))?.split('=').slice(1).join('=') || fallback;
const contractCheck=args.includes('--contract-check'),nativeRequested=args.includes('--native');
const originalSdkIds=option('original-sdk','').split(',').filter(Boolean);
const originalStorageRequested=originalSdkIds.length>0;
assert(new Set(originalSdkIds).size===originalSdkIds.length&&originalSdkIds.every(id=>['F2-K2-SDK-004','F2-K2-SDK-005','F2-K2-SDK-007','F2-K2-SDK-009','F2-K2-SDK-019'].includes(id)), 'Unsupported original SDK storage case');
assert(contractCheck!==nativeRequested,'Choose exactly one explicit --contract-check or --native SDK lane');
const rebuildReceiptPath=option('rebuild-receipt',null);
assert(rebuildReceiptPath,'Current frozen candidate --rebuild-receipt is required before SDK execution');
const modes = option('mode', 'all') === 'all' ? ['production', 'development'] : [option('mode')];
const labels = option('chrome', 'all') === 'all' ? ['138', '155'] : [option('chrome')];
assert(modes.every(mode => ['production', 'development'].includes(mode)) && labels.every(label => ['138', '155'].includes(label)));
const output = path.join(root, 'docs/framework/evidence/f2-sdk-native', `native-${new Date().toISOString().replaceAll(':', '-')}-${randomUUID().slice(0, 8)}`);
await mkdir(output, {recursive: true});
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const inputBindings = await inputIdentity();
const zipHashes = Object.fromEntries(await Promise.all(['production','development'].map(async mode=>
  [mode,digest(await readFile(path.join(root,'artifacts',`opendesk-browser-${mode}.zip`)))])));
const rebuildReceipt=JSON.parse(await readFile(rebuildReceiptPath));
const candidateIdentity=JSON.parse(await readFile(rebuildReceipt.candidateIdentity));
const frozenSource=JSON.parse(await readFile(path.join(path.dirname(rebuildReceipt.candidateIdentity),'source-manifest.json')));
for(const key of ['productInputsSha256','verificationInputsSha256']){
  assert.equal(inputBindings[key],rebuildReceipt[key],`SDK ${key} changed after candidate freeze`);
  assert.equal(inputBindings[key],candidateIdentity[key]);
}
assert.equal(rebuildReceipt.sourceHash,candidateIdentity.sourceHash);assert.equal(frozenSource.sourceHash,candidateIdentity.sourceHash);
assert.equal(digest(JSON.stringify(frozenSource.files)),candidateIdentity.sourceHash);
for(const row of frozenSource.files){const bytes=await readFile(path.join(root,row.path));assert.equal(bytes.length,row.bytes);assert.equal(digest(bytes),row.sha256,`SDK source drift: ${row.path}`);}
const sdkRunnerSha256=digest(await readFile(fileURLToPath(import.meta.url)));
assert.equal(rebuildReceipt.sdkRunnerSha256,sdkRunnerSha256,'Actual SDK runner must match its frozen receipt');
const launcherSha256=digest(await readFile(LAUNCHER));
assert.equal(rebuildReceipt.launcherSha256,launcherSha256,'Actual controlled launcher must match its frozen receipt');
for(const mode of ['production','development']){
  assert.equal((await fingerprint(path.join(root,'dist',mode))).packageHash,rebuildReceipt.packages[mode]);
  assert.equal(rebuildReceipt.packages[mode],candidateIdentity.packageHashes[mode]);
  assert.equal(zipHashes[mode],rebuildReceipt.zipHashes[mode]);assert.equal(zipHashes[mode],candidateIdentity.zipHashes[mode]);
}
const candidateBinding={candidate:candidateIdentity.candidate,candidateIdentity:rebuildReceipt.candidateIdentity,sourceHash:candidateIdentity.sourceHash,
  productInputsSha256:inputBindings.productInputsSha256,verificationInputsSha256:inputBindings.verificationInputsSha256,
  packages:rebuildReceipt.packages,zipHashes,sdkRunnerSha256,launcherSha256,receipt:rebuildReceiptPath};
await writeFile(path.join(output,'candidate-binding.json'),JSON.stringify(candidateBinding,null,2)+'\n');
if(contractCheck){console.log(JSON.stringify({state:'sdk-contract-ready',output,...candidateBinding,nativeLaunched:false,formalAccepted:false}));process.exit(0);}
async function fingerprint(directory) {
  const files = [];
  async function walk(prefix = '') {
    for (const item of await readdir(path.join(directory, prefix), {withFileTypes: true})) {
      const relative = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.isDirectory()) await walk(relative);
      else if (item.isFile()) { const bytes = await readFile(path.join(directory, relative)); files.push({path: relative, bytes: bytes.length, sha256: digest(bytes)}); }
      else throw new Error(`Unexpected package entry: ${relative}`);
    }
  }
  await walk(); files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  return {files, packageHash: digest(JSON.stringify(files)), algorithm: 'SHA256 UTF-8 JSON.stringify(path-sorted {path,bytes,sha256} array)'};
}
async function fingerprintSource() {
  const sourceFiles = [];
  for (const dir of ['src', 'tests/framework']) {
    async function walk(prefix) {
      for (const item of await readdir(path.join(root, prefix), {withFileTypes: true})) {
        const relative = `${prefix}/${item.name}`;
        if (item.isDirectory() && dir === 'src') await walk(relative);
        else if (item.isFile() && (dir === 'src' || item.name.startsWith('k5-sdk-native') || item.name === 'k5-sdk-legacy-consumers.mjs')) {
          const bytes = await readFile(path.join(root, relative)); sourceFiles.push({path: relative, bytes: bytes.length, sha256: digest(bytes)});
        }
      }
    }
    await walk(dir);
  }
  for (const relative of ['manifest.json', 'webpack.config.cjs', 'scripts/build.mjs', 'scripts/verify-package.mjs']) {
    const bytes = await readFile(path.join(root, relative)); sourceFiles.push({path: relative, bytes: bytes.length, sha256: digest(bytes)});
  }
  sourceFiles.sort((a, b) => a.path.localeCompare(b.path));
  return sourceFiles;
}
const bothPackageHashes=Object.fromEntries(await Promise.all(['production','development'].map(async mode=>[mode,(await fingerprint(path.join(root,'dist',mode))).packageHash])));
const sourceFiles = await fingerprintSource();
await writeFile(path.join(output, 'source-manifest.json'), JSON.stringify(sourceFiles, null, 2) + '\n');
const serverEvents = [], heldResponses = new Map();
const server = createServer(async (req, res) => {
  const chunks = []; for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks).toString('utf8'), url = new URL(req.url, 'http://127.0.0.1');
  const entry = {sequence: serverEvents.length + 1, at: new Date().toISOString(), monoMs: performance.now(), method: req.method,
    url: req.url, headers: req.headers, body, bodySha256: digest(body)};
  serverEvents.push(entry);
  appendFileSync(path.join(output, 'raw-server-live.jsonl'), JSON.stringify({event: 'request', ...entry}) + '\n');
  res.on('finish', () => { entry.finishedAt = new Date().toISOString(); entry.statusCode = res.statusCode;
    appendFileSync(path.join(output, 'raw-server-live.jsonl'), JSON.stringify({event: 'finish', ...entry}) + '\n'); });
  res.on('close', () => { entry.closedAt = new Date().toISOString();
    appendFileSync(path.join(output, 'raw-server-live.jsonl'), JSON.stringify({event: 'close', ...entry}) + '\n'); });
  if (url.pathname === '/hold') { heldResponses.set(url.searchParams.get('token'), res); return; }
  if (url.pathname === '/target' || url.pathname === '/decoy') {
    res.writeHead(200, {'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store'});
    res.end(`<!doctype html><html><head><title>SDK ${url.pathname.slice(1)}</title></head><body><h1>Native product SDK target</h1><p>${url.search}</p></body></html>`);
  } else if (url.pathname === '/redirect') { res.writeHead(302, {location: '/echo?redirect-effect=true'}); res.end(); }
  else if (url.pathname === '/error') { res.writeHead(503, {'content-type': 'application/json'}); res.end('{"business":"unavailable"}'); }
  else { res.writeHead(200, {'content-type': 'application/json', 'cache-control': 'no-store'});
    res.end(JSON.stringify({method: req.method, path: url.pathname, query: [...url.searchParams], body, falseValue: false, zero: 0,
      business: {PageBrigeCode: 9, ok: false, error: 'business-data', message: 'keep-as-data'}})); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`, reports = [];
const initialCapabilities = originalStorageRequested ? [...(originalSdkIds.some(id=>id.endsWith('004')||id.endsWith('005'))?['storage.persistent']:[]),...(originalSdkIds.some(id=>['F2-K2-SDK-007','F2-K2-SDK-009','F2-K2-SDK-019'].includes(id))?['storage.session']:[])] : ['network', 'storage.persistent', 'storage.session', 'service.log', 'service.time', 'resources.packaged'];
const capabilities = [...initialCapabilities];
async function connect(url, label, traffic) {
  const socket = new WebSocket(url), pending = new Map(), listeners = new Set(); let sequence = 0;
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  socket.onmessage = ({data}) => {
    const message = JSON.parse(data), entry = {at: new Date().toISOString(), endpoint: label, direction: 'received', message};
    traffic.push(entry); appendFileSync(path.join(output, 'raw-cdp-live.jsonl'), JSON.stringify(entry) + '\n');
    if (!message.id) { for (const listener of listeners) listener(message); return; }
    const waiter = pending.get(message.id); if (!waiter) return;
    pending.delete(message.id); clearTimeout(waiter.timer);
    message.error ? waiter.reject(new Error(JSON.stringify(message.error))) : waiter.resolve(message.result);
  };
  socket.onclose = () => { for (const waiter of pending.values()) { clearTimeout(waiter.timer); waiter.reject(new Error(`${label} CDP closed`)); } pending.clear(); };
  return {send(method, params = {}, sessionId) {
    return new Promise((resolve, reject) => {
      const id = ++sequence, message = {id, method, params,...(sessionId?{sessionId}:{})};
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${label} ${method} timed out`)); }, 45000);
      pending.set(id, {resolve, reject, timer});
      const entry = {at: new Date().toISOString(), endpoint: label, direction: 'sent', message};
      traffic.push(entry); appendFileSync(path.join(output, 'raw-cdp-live.jsonl'), JSON.stringify(entry) + '\n');
      socket.send(JSON.stringify(message));
    });
  }, onEvent: listener => { listeners.add(listener); return () => listeners.delete(listener); }, close: () => socket.close()};
}
async function evaluate(client, expression, contextId) {
  const raw = await client.send('Runtime.evaluate', {expression, returnByValue: true, awaitPromise: true,...(contextId?{contextId}:{})});
  if (raw.exceptionDetails) throw new Error(JSON.stringify(raw.exceptionDetails));
  return raw.result.value;
}
async function until(operation, description, ms = 12000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) { const result = await operation(); if (result) return result; await sleep(30); }
  throw notObserved(`Native observation timed out: ${description}`,{description,ms});
}
function sdkCall(method, args) {
  return OpenDeskSDK.call(method, args).then(value => ({ok: true, value, valueKind: typeof value,
    undefinedResult: value === undefined}), error => ({ok: false, error: {code: error?.code, message: error?.message}}));
}
const callExpression = (method, args) => `(${sdkCall.toString()})(${JSON.stringify(method)},${JSON.stringify(args)})`;
const errorProjection = error => ({code: error.code, message: error.message, stack: error.stack, actual:error.actual,
  observation: error.observation,resourceObservation:error.resourceObservation});
const notObserved = (message, observation) => Object.assign(new Error(message), {code: 'E_NATIVE_OBSERVATION_UNAVAILABLE', observation});
// Native evaluation inputs must keep own undefined keys for schema rejection.
const pageValueExpression = value => value === undefined ? 'undefined' : Array.isArray(value)
  ? `[${value.map(pageValueExpression).join(',')}]` : value !== null && typeof value === 'object'
    ? `({${Object.entries(value).map(([key, item]) => `[${JSON.stringify(key)}]:${pageValueExpression(item)}`).join(',')}})` : JSON.stringify(value);
const observerExpression = (observer, ...values) => `(${observer.toString()})(${values.map(pageValueExpression).join(',')})`;
async function browserRun(mode, label) {
  capabilities.splice(0, capabilities.length, ...initialCapabilities);
  const directory = path.join(output, `${mode}-${label}`); await mkdir(directory, {recursive: true});
  const extension = await realpath(path.join(root, 'dist', mode)), packageBefore = await fingerprint(extension);
  const manifest = JSON.parse(await readFile(path.join(extension, 'manifest.json'), 'utf8'));
  const resourceManifest = JSON.parse(await readFile(path.join(extension, SDK_RESOURCE_MANIFEST), 'utf8'));
  assert.equal(resourceManifest.schemaVersion, 1);
  assert.deepEqual(resourceManifest.resources.map(row => row.path), SDK_RESOURCE_PATHS);
  for (const row of resourceManifest.resources) {
    const bytes = await readFile(path.join(extension, row.path));
    assert.equal(row.bytes, bytes.length); assert.equal(row.sha256, digest(bytes));
  }
  const binary = path.join(root, `tests/.cache/m5-browsers/${label === '138' ? '138.0.7204.183' : '155.0.8059.39'}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`);
  const report = {mode, label, extension, packageBefore, productInputsSha256:inputBindings.productInputsSha256,
    verificationInputsSha256:inputBindings.verificationInputsSha256,packageHashes:bothPackageHashes,zipHashes,zipSha256:zipHashes[mode],unchangedProductPackage: true, alteredManifest: false,
    finalProductPassed: false, f3Accepted: false, ledgerCasesClosed: [], cases: [], sessions: [], origin,
    binary, binarySha256: digest(await readFile(binary)), launcher: LAUNCHER,candidateBinding,
    OS: {type: os.type(), release: os.release(), arch: os.arch()}, boundary: 'Targeted native independent SDK through current product UI and broker; not full B05/F3/603 acceptance', originalSdkSelection:originalSdkIds, original19Complete:false};
  const traffic = [], seed = `sdk-native-${randomUUID()}`, persistentKey = `${seed}-persistent`, sessionKey = `${seed}-session`;
  let current, owned;
  async function evidenceForCase(id, record) {
    const stem = id.replace(/[^a-zA-Z0-9_-]/g, '_'), rawPath = path.join(directory, `${stem}-result.json`);
    const environment = {mode, label, completeVersion: report.completeVersion, packageSha256: packageBefore.packageHash,
      productInputsSha256: inputBindings.productInputsSha256, verificationInputsSha256: inputBindings.verificationInputsSha256, zipSha256: zipHashes[mode],
      targetId: current?.targetId, tabId: current?.tabId, documentId: current?.session?.documentId};
    const raw = Buffer.from(JSON.stringify({...record, environment}, null, 2) + '\n'); await writeFile(rawPath, raw);
    const evidence = [{path: path.relative(root, rawPath), bytes: raw.length, sha256: digest(raw), kind: 'native-function-result'}];
    const rawCdp = Buffer.from(JSON.stringify({id, environment, traffic: traffic.slice(record.trafficStart, record.trafficEnd)}, null, 2) + '\n');
    const rawCdpPath = path.join(directory, `${stem}-raw-cdp.json`); await writeFile(rawCdpPath, rawCdp);
    evidence.push({path: path.relative(root, rawCdpPath), bytes: rawCdp.length, sha256: digest(rawCdp), kind: 'native-function-raw-cdp'});
    if (current?.page) {
      // Capture the actual selected document. Function values remain in the
      // hashed result and raw CDP files; this screenshot is document evidence.
      await current.browserClient.send('Target.activateTarget', {targetId: current.targetId});
      const capture = await current.page.send('Page.captureScreenshot', {format: 'png', captureBeyondViewport: false});
      const image = Buffer.from(capture.data, 'base64'), imagePath = path.join(directory, `${stem}-function-result.png`);
      await writeFile(imagePath, image);
      evidence.push({path: path.relative(root, imagePath), bytes: image.length, sha256: digest(image), kind: 'native-document-state-screenshot', targetId: current.targetId, tabId: current.tabId, documentId: current.session.documentId});
    }
    return evidence;
  }
  let prerequisiteFailure;
  const caseRun = async (id, operation) => {
    const trafficStart = traffic.length; let actual;
    if(prerequisiteFailure){const record={id,status:'NOT_TESTED',reason:'Earlier native prerequisite failed; dependent input was not executed',prerequisiteFailure,trafficStart,trafficEnd:traffic.length};report.cases.push(record);console.log(JSON.stringify({state:'native-case',mode,label,...record}));return null;}
    try {
      let settlement = 0;
      const settle = async () => {
        const ready = await evaluate(current.page, 'OpenDeskSDK.ready()');
        if (ready?.ready !== true) return ready;
        const phase = ++settlement === 1 ? 'before' : 'after';
        const connection = await waitForNativeToolConnection({observe: () => current.resourceSnapshot(),
          onObservation: sample => appendFileSync(path.join(directory, 'tool-connection-resource-observations.jsonl'),
            JSON.stringify({id, phase, ...sample}) + '\n')});
        return {...ready, toolConnection: {hostTargetId: connection.owners.tool.hostTargetId,
          selected: connection.selected, observedAt: connection.observedAt,
          client: connection.owners.tool.lifecycle.owners.client}};
      };
      const observed=await runNativeSdkResourceCase({id,operation,observe:()=>current.resourceSnapshot(),settle});
      actual=observed.actual;const record = {id, status: 'PASS', actual, resourceObservations:observed.resources, trafficStart, trafficEnd: traffic.length};
      record.evidence = await evidenceForCase(id, record); report.cases.push(record);
      console.log(JSON.stringify({state: 'native-case', mode, label, id, status: 'PASS'})); return actual;
    } catch (error) {
      const status = error.code === 'E_NATIVE_PERMISSION_WAIT' ? 'BLOCKED' : ['E_NATIVE_OBSERVATION_UNAVAILABLE','E_NATIVE_NOT_OBSERVED','E_CAMPAIGN_OBSERVATION_MISSING'].includes(error.code) ? 'NOT_TESTED' : 'FAIL';
      prerequisiteFailure={id,status,error:errorProjection(error)};
      if(Object.hasOwn(error,'observedFunctionResult'))actual=error.observedFunctionResult;
      const record = {id, status, actual, resourceObservations:error.resourceObservations, error: errorProjection(error), trafficStart, trafficEnd: traffic.length};
      try { record.evidence = await evidenceForCase(id, record); } catch (captureError) { record.evidenceError = errorProjection(captureError); }
      report.cases.push(record);
      console.log(JSON.stringify({state: 'native-case', mode, label, id, status, error: errorProjection(error)})); return null;
    }
  };
  async function startSession(number, restarted) {
    const clients = [], session = {number, launchMethod: 'global Python launcher'};
    report.sessions.push(session);
    if (!owned) owned = await launchChrome({root, binary, extension, headed: args.includes('--headed'), directory, label: String(number), sameProfileRestart: true});
    session.launcher = owned.metadata; session.pid = owned.metadata.pid; session.chromeArgs = owned.metadata.args;
    report.profile = owned.metadata.profile;
    let browserClient;
    async function stop() {
      for (const client of clients) client.close();
      browserClient?.close();
      const result = await owned.stop();
      if (result) for (const item of report.sessions) Object.assign(item, {profileRemoved: result.profileRemoved,
        pidAliveAfterExit: result.pidAliveAfterExit, cleanup: result});
    }
    current = {stop}; const endpoint = restarted?.endpoint ?? owned.endpoint;
    browserClient = await connect(endpoint, `browser-${number}`, traffic); session.cdpVersion = await browserClient.send('Browser.getVersion');
    assert.equal(session.cdpVersion.product, `Chrome/${label === '138' ? '138.0.7204.183' : '155.0.8059.39'}`);
    report.completeVersion = session.cdpVersion.product;
    console.log(JSON.stringify({state:'native-browser-ready',mode,label,number,pid:session.pid,launcherPid:owned.metadata.launcherPid,endpoint}));
    session.nativeProcesses = (await browserClient.send('SystemInfo.getProcessInfo')).processInfo;
    assert(session.nativeProcesses.some(entry => entry.type === 'browser' && entry.id === session.pid));
    const debuggingURL = `http://127.0.0.1:${new URL(endpoint).port}`;
    async function attach(targetId) {
      const target = await until(async () => (await (await fetch(`${debuggingURL}/json/list`)).json()).find(target => target.id === targetId && target.webSocketDebuggerUrl), 'target endpoint');
      const client = await connect(target.webSocketDebuggerUrl, targetId, traffic); clients.push(client); return client;
    }
    let worker = await until(async () => (await browserClient.send('Target.getTargets')).targetInfos.find(target => target.type === 'service_worker' && target.url.startsWith('chrome-extension://') && target.url.endsWith('/sw.js')), 'actual product service worker');
    let workerClient = await attach(worker.targetId);
    const workerContextStart=traffic.length;
    await workerClient.send('Runtime.enable');
    await until(() => evaluate(workerClient, 'typeof chrome!=="undefined" && !!chrome.runtime?.id'), 'native extension worker bindings initialized');
    const identity = await evaluate(workerClient, '({id:chrome.runtime.id,manifest:chrome.runtime.getManifest(),url:chrome.runtime.getURL("sw.js")})');
    assert.equal(identity.manifest.name, manifest.name); assert.equal(identity.manifest.version, manifest.version); assert.equal(identity.url, worker.url);
    let workerContexts=traffic.slice(workerContextStart).filter(r=>r.endpoint===worker.targetId&&r.message?.method==='Runtime.executionContextCreated').map(r=>r.message.params.context);
    assert(workerContexts.length&&workerContexts.every(c=>c.uniqueId));
    session.actualWorker = {targetId: worker.targetId, ...identity,executionContexts:workerContexts};
    session.workerIncarnations=[session.actualWorker];
    const extensionId = identity.id; report.extensionId = extensionId;
    const targetURL = `${origin}/target?seed=${seed}&session=${number}`, decoyURL = `${origin}/decoy?seed=${seed}&session=${number}`;
    const targetId = (await browserClient.send('Target.createTarget', {url: targetURL})).targetId;
    const page = await attach(targetId), contexts=new Map();
    page.onEvent(event=>{if(event.method==='Runtime.executionContextCreated')contexts.set(event.params.context.id,event.params.context);
      if(event.method==='Runtime.executionContextDestroyed')contexts.delete(event.params.executionContextId);
      if(event.method==='Runtime.executionContextsCleared')contexts.clear();});
    await page.send('Runtime.enable');await until(() => evaluate(page, 'document.readyState === "complete"'), 'target loaded');
    const decoyId = (await browserClient.send('Target.createTarget', {url: decoyURL})).targetId, decoy = await attach(decoyId);
    const toolId = (await browserClient.send('Target.createTarget', {url: `chrome-extension://${extensionId}/ui/tool.html`})).targetId;
    const tool = await attach(toolId); await until(() => evaluate(tool, '!!document.querySelector("#sdk-install")'), 'current product SDK UI');
    await page.send('Runtime.evaluate', {expression: 'globalThis.__sdkNativeEvents=[]; for(const name of ["OPEN_DESK_SDK_READY","OPEN_DESK_SDK_RESULT"]) window.addEventListener(name,event=>__sdkNativeEvents.push({at:Date.now(),name,message:JSON.parse(event.detail)}));'});
    await evaluate(page,`(${observePage.toString()})()`);
    const tabId = await evaluate(tool, `chrome.tabs.query({}).then(tabs=>tabs.find(tab=>tab.url===${JSON.stringify(targetURL)})?.id)`);
    assert(Number.isInteger(tabId)); session.target = {targetId, tabId, targetURL, decoyId, decoyURL, toolId};
    const swEvents = []; tool.onEvent(event => { if (event.method?.startsWith('ServiceWorker.')) swEvents.push(event); }); await tool.send('ServiceWorker.enable');
    async function click(selector) {
      await browserClient.send('Target.activateTarget', {targetId: toolId});
      const point = await evaluate(tool, `(()=>{const element=document.querySelector(${JSON.stringify(selector)}); element.scrollIntoView();const r=element.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2,disabled:element.disabled};})()`);
      assert(!point.disabled, `Button ${selector} is disabled`);
      await tool.send('Input.dispatchMouseEvent', {type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1});
      await tool.send('Input.dispatchMouseEvent', {type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1});
    }
    let nativeContext;
    async function install() {
      await click('#sdk-refresh');
      await until(() => evaluate(tool, `!!document.querySelector('#sdk-tab option[value="${tabId}"]')`), 'explicit target listed');
      async function selectNative(selector,desired) {
        const inspect=()=>evaluate(tool,`(()=>{const e=document.querySelector(${JSON.stringify(selector)});return {value:e.value,selectedIndex:e.selectedIndex,options:[...e.options].map(o=>({value:o.value,text:o.text,disabled:o.disabled}))};})()`);
        const before=await inspect(),index=before.options.findIndex(option=>option.value===String(desired)&&!option.disabled);
        assert(index>=0,`Native SDK option absent: ${selector}=${desired}`);if(before.value===String(desired)) return before;
        assert(args.includes('--native-ui-assist'),'Real macOS selection requires --native-ui-assist');
        await browserClient.send('Target.activateTarget',{targetId:toolId});
        const uiLabel=await evaluate(tool,`(()=>{const el=document.querySelector(${JSON.stringify(selector)});return document.querySelector('label[for="'+el.id+'"]')?.textContent.trim();})()`);
        assert.equal(typeof uiLabel,'string');assert(uiLabel);
        const request={state:'native-selection-assist',mode,label,number,pid:session.pid,launcherPid:owned.metadata.launcherPid,
          endpoint,toolId,targetId:toolId,selector,desired:String(desired),optionIndex:index,before,uiLabel,requestId:randomUUID(),createdAt:Date.now(),
          instruction:'Complete the exact option via actual bound CUA menu action, then write acknowledgement and AX witness after readback; no DOM assignment or synthetic events'};
        request.ackPath=path.join(directory,`native-selection-ui-ack-${request.requestId}.json`);
        await writeFile(path.join(directory,'pending-native-selection.json'),JSON.stringify(request,null,2)+'\n');
        console.log(JSON.stringify(request));
        const receipt=await until(async()=>{
          const after=await inspect();if(after.value!==String(desired))return null;
          try{const ack=JSON.parse(await readFile(request.ackPath,'utf8')),witness={...JSON.parse(await readFile(ack.witnessPath,'utf8')),path:ack.witnessPath};
            const observation={requestId:request.requestId,targetId:toolId,selector,desired:String(desired),at:Date.now(),after};
            const validation=validateNativeSelectionReceipt({request,ack,witness,observation,finalDom:await inspect()});return {after,ack,observation,validation};
          }catch(error){if(error.code==='ENOENT'||error instanceof SyntaxError)return null;
            if(error.code==='E_NATIVE_NOT_OBSERVED')throw error;
            throw notObserved('Native selection receipt could not be read',{requestId:request.requestId,ackPath:request.ackPath,error:errorProjection(error)});}
        },'native exact SDK selection and genuine completion receipt',Number(option('permission-timeout','120000')));
        traffic.push({at:new Date().toISOString(),kind:'native-ui-selection',...request,...receipt});
        await writeFile(path.join(directory,'pending-native-selection.json'),JSON.stringify({...request,state:'selection-observed',...receipt},null,2)+'\n');return receipt.after;
      }
      await selectNative('#sdk-tab',tabId);
      const documentId = await until(() => evaluate(tool, '(()=>{const element=document.querySelector("#sdk-document");return [...element.options].find(option=>option.textContent.startsWith("frame 0 "))?.value;})()'), 'Chrome exact top document ID');
      await selectNative('#sdk-document',documentId);
      const choices=await evaluate(tool,'[...document.querySelectorAll("[name=sdk-capability]")].map(e=>({value:e.value,checked:e.checked}))');
      for(const choice of choices) if(choice.checked!==capabilities.includes(choice.value))
        await click('[name="sdk-capability"][value="'+choice.value+'"]');
      const before = await evaluate(tool, 'chrome.permissions.getAll()');
      await click('#sdk-install');
      let previousState, lastObservation = 0;
      let result;
      try { result = await until(async () => {
        const value = await evaluate(tool, '({state:document.querySelector("#sdk-status").dataset.state,text:document.querySelector("#sdk-status").textContent,raw:document.querySelector("#sdk-result").textContent})');
        if (value.state !== previousState || Date.now() - lastObservation >= 30000) {
          previousState = value.state; lastObservation = Date.now();
          const observation = {at: new Date().toISOString(), mode, label, number, pid: session.pid, binary, endpoint,
            toolId, tabId, frameId: 0, documentId, beforePermissions: before,
            currentPermissions: await evaluate(tool, 'chrome.permissions.getAll()'), ui: value};
          await writeFile(path.join(directory, 'native-install-state.json'), JSON.stringify(observation, null, 2) + '\n');
          console.log(JSON.stringify({state: 'native-install-observation', ...observation}));
        }
        return ['installed', 'error'].includes(value.state) && value;
      }, 'real permissions and install result', Number(option('permission-timeout', args.includes('--headed') ? '120000' : '20000'))); }
      catch (error) {
        const contains = await evaluate(tool, 'chrome.permissions.contains({origins:["http://127.0.0.1/*"]})');
        if (!contains && previousState === 'installing') error.code = 'E_NATIVE_PERMISSION_WAIT';
        throw error;
      }
      result.beforePermissions = before; result.afterPermissions = await evaluate(tool, 'chrome.permissions.getAll()'); result.documentId = documentId; result.tabId = tabId;
      await writeFile(path.join(directory, `install-${number}-${Date.now()}.json`), JSON.stringify(result, null, 2) + '\n');
      assert.equal(result.state, 'installed', result.text); result.nativeInstall = JSON.parse(result.raw);
      nativeContext=await until(async()=>{
        for(const context of contexts.values())if(context.auxData?.isDefault===false){
          try{if(await evaluate(page,`!!globalThis.__openDeskSdkRelayV1&&chrome.runtime.id===${JSON.stringify(extensionId)}`,context.id))return context;}catch{}
        }
        return null;
      },'existing installed native relay context');
      result.nativeRelayContext={id:nativeContext.id,uniqueId:nativeContext.uniqueId,auxData:nativeContext.auxData};
      assert.equal(result.nativeInstall.documentId, documentId); assert.equal(result.nativeInstall.installed, true);
      session.documentId = documentId; return result;
    }
    async function snapshot() {
      return evaluate(tool, `(async()=>{const databases=await indexedDB.databases();const data=await new Promise((resolve,reject)=>{const request=indexedDB.open('opendesk-browser');request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,names=['commandJournal','runs','results','frameworkKV'],tx=db.transaction(names,'readonly'),rows={};for(const name of names){const cursor=tx.objectStore(name).openCursor();rows[name]=[];cursor.onsuccess=()=>{const item=cursor.result;if(item){rows[name].push({key:item.primaryKey,value:item.value});item.continue();}};}tx.oncomplete=()=>{db.close();resolve(rows);};tx.onabort=()=>reject(tx.error);};});return{databases,data,sessionStorage:await chrome.storage.session.get(null)};})()`);
    }
    async function refreshWorker() {
      worker=await until(async()=>(await browserClient.send('Target.getTargets')).targetInfos.find(t=>t.type==='service_worker'&&t.url===identity.url),'current actual native worker');
      workerClient=await attach(worker.targetId);const since=traffic.length;
      await workerClient.send('Runtime.enable');
      const actual=await evaluate(workerClient,'({id:chrome.runtime.id,url:chrome.runtime.getURL("sw.js")})');assert.equal(actual.id,extensionId);assert.equal(actual.url,identity.url);
      workerContexts=traffic.slice(since).filter(r=>r.endpoint===worker.targetId&&r.message?.method==='Runtime.executionContextCreated').map(r=>r.message.params.context);
      assert(workerContexts.length&&workerContexts.every(c=>c.uniqueId));
      session.workerIncarnations.push({targetId:worker.targetId,...actual,executionContexts:workerContexts,observedAt:Date.now()});
      return {target:worker,client:workerClient,executionContexts:workerContexts};
    }
    async function stopWorker({recovery,evidence}={}) {
      const old={...worker},start=swEvents.length;
      const version=await until(()=>swEvents.flatMap(e=>e.params.versions||[]).filter(v=>v.scriptURL===identity.url&&v.targetId===old.targetId&&v.runningStatus==='running').at(-1),'exact running worker version');
      const stop={version,targetId:old.targetId,requestedAt:new Date().toISOString()};if(evidence)evidence.workerStop=stop;
      if(recovery)recovery.expectReplacement();
      await tool.send('ServiceWorker.stopWorker',{versionId:version.versionId});
      await until(async()=>!(await browserClient.send('Target.getTargets')).targetInfos.some(t=>t.targetId===old.targetId),'original worker actually stopped');
      stop.targetAbsent=true;stop.versionStopped=await until(()=>swEvents.slice(start).flatMap(e=>e.params.versions||[]).find(v=>v.versionId===version.versionId&&v.scriptURL===identity.url&&v.runningStatus==='stopped'),'exact native stopped worker version');
      stop.physicalTerminationObserved=true;
      if(!recovery)return version;
      workerClient.close();await recovery.afterPhysicalStop(stop);
      const waking=evaluate(page,`chrome.runtime.sendMessage(${JSON.stringify({protocol:PROTOCOL,type:'SDK_HELLO',payload:{sdkVersion:SDK_VERSION}})})`,nativeContext.id);
      const [wake,replacement]=await Promise.all([waking,recovery.wait()]);assert.equal(wake.ok,true);stop.wake=wake;
      const actual=await evaluate(replacement.client,'({id:chrome.runtime.id,url:chrome.runtime.getURL("sw.js")})');assert.equal(actual.id,extensionId);assert.equal(actual.url,identity.url);
      worker=replacement.target;workerClient={send:replacement.client.send,onEvent:replacement.client.on,close:replacement.client.close};workerContexts=replacement.contexts;
      recovery.assertCoverage();stop.freshNativeContext=evidence.recoveryStartup.executionContext;stop.replacementTargetId=worker.targetId;
      session.workerIncarnations.push({targetId:worker.targetId,...actual,executionContexts:workerContexts,observedAt:Date.now()});
      return stop;
    }
    async function restartBrowser() {
      // Browser.close is whole-browser shutdown. Its response may be lost when
      // CDP closes; the helper requires the native child exit code 0 regardless.
      const closing = browserClient.send('Browser.close').catch(error => ({message: error.message}));
      for (const client of clients) client.close();
      const next = await owned.restart();
      await closing; browserClient.close();
      session.browserEnded = next.metadata.restartObserved;
      session.pidAliveAfterRestart = false;
      session.profileRetainedForRestart = true;
      return next;
    }
    const native = payload => {assert(nativeContext&&contexts.has(nativeContext.id),'Actual installed relay context is no longer live');
      return evaluate(page,`chrome.runtime.sendMessage(${JSON.stringify({protocol:PROTOCOL,type:'SDK_REQUEST',payload})})`,nativeContext.id);};
    async function startNativeBurst(payload,count) {
      assert.equal(count,99);assert(nativeContext&&contexts.has(nativeContext.id));
      const response=await page.send('Runtime.evaluate',{contextId:nativeContext.id,
        expression:`Promise.all(Array.from({length:${count}},()=>chrome.runtime.sendMessage(${JSON.stringify({protocol:PROTOCOL,type:'SDK_REQUEST',payload})})))`,
        awaitPromise:false,returnByValue:false});
      if(response.exceptionDetails)throw notObserved('Actual relay burst failed',response.exceptionDetails);
      assert.equal(response.result.subtype,'promise');assert(response.result.objectId);
      return {objectId:response.result.objectId,issuedAt:Date.now(),count,requestId:payload.requestId};
    }
    const releaseNativeBurst=remote=>page.send('Runtime.releaseObject',{objectId:remote.objectId});
    async function awaitNativeBurst(remote) {
      try {
        const response=await page.send('Runtime.awaitPromise',{promiseObjectId:remote.objectId,returnByValue:true});
        if(response.exceptionDetails)throw notObserved('Actual relay burst rejected',response.exceptionDetails);
        assert.equal(response.result.value.length,remote.count);
        return {replies:response.result.value,issuedAt:remote.issuedAt,count:remote.count,requestId:remote.requestId};
      } finally {await releaseNativeBurst(remote);}
    }
    async function startPublic(method,args,{allowPreEmissionRejection=false}={}){
      const since=await evaluate(page,'__b05.events.length'),slot=`sdk-native-${randomUUID()}`;
      await evaluate(page,sdkInvocationExpression(method,args,slot));
      const observed=await until(async()=>{
        const observation=await evaluate(page,`({events:__b05.events,settlement:__b05.settlements[${JSON.stringify(slot)}]})`);
        const payload=observedSdkInvocation(observation.events,{since,method});
        if(payload)return {payload};
        if(observation.settlement?.response){
          if(!allowPreEmissionRejection||observation.settlement.response.ok)throw notObserved('Public SDK completed without its actual request emission',{method,slot,observation});
          assert.equal(observation.settlement.settlements,1);return {publicRejection:observation.settlement};
        }
      },'actual public SDK request or pre-emission schema rejection');
      const invocation={method,args,slot,since,...observed};
      if(observed.payload){const planned={method,argsWire:encodeValue(args)};invocation.binding=bindPublicSdkPayload(planned,observed.payload);}
      return invocation;
    }
    async function publicCompletion(invocation){
      const settlement=await until(()=>evaluate(page,`(()=>{const x=__b05.settlements[${JSON.stringify(invocation.slot)}];return x?.response&&x;})()`),'original public SDK Promise completion',35000);
      assert.equal(settlement.settlements,1);if(invocation.payload)assert.equal(settlement.requestId,invocation.payload.requestId);
      const nativeResponse=invocation.payload?await evaluate(page,`__b05.requests[${JSON.stringify(invocation.payload.requestId)}]?.nativeResponse??null`):null;
      return {...invocation,publicResponse:settlement.response,settlement,nativeResponse,requestEmitted:!!invocation.payload};
    }
    const publicCall=async(method,args,options)=>publicCompletion(await startPublic(method,args,options));
    async function resourceSnapshot() {
      const tree=await page.send('Page.getFrameTree'),mainFrameId=tree.frameTree.frame.id;
      const mains=[...contexts.values()].filter(context=>context.auxData?.isDefault===true&&context.auxData.frameId===mainFrameId);
      if(mains.length!==1||!nativeContext||contexts.get(nativeContext.id)!==nativeContext||nativeContext.auxData?.frameId!==mainFrameId)
        throw notObserved('Exact installed MAIN/relay contexts unavailable for resource observation',{mainFrameId,mains,nativeContext,contexts:[...contexts.values()]});
      const readRealm=async(context,expression)=>{
        if(contexts.get(context.id)!==context)throw notObserved('Native resource context retired before observation',{context});
        const diagnostics=await evaluate(page,expression,context.id);
        if(contexts.get(context.id)!==context)throw notObserved('Native resource context retired during observation',{context});
        return diagnostics&&{...diagnostics,nativeContext:{id:context.id,uniqueId:context.uniqueId,auxData:context.auxData}};
      };
      const readSelected=async()=>{
        const frames=await evaluate(tool,`chrome.webNavigation.getAllFrames({tabId:${tabId}})`),frame=frames.find(frame=>frame.frameId===0);
        if(!frame||frame.errorOccurred||(frame.documentLifecycle&&frame.documentLifecycle!=='active'))throw notObserved('Native SDK document unavailable during resource observation',{tabId,frames});
        return {tabId,frameId:frame.frameId,documentId:frame.documentId};
      };
      return observeNativeSdkResources({expectedSelected:{tabId,frameId:0,documentId:session.documentId},readSelected,
        observeTool:()=>observeNativeToolResources({evaluateTool:expression=>evaluate(tool,expression),hostTargetId:toolId,
          nativeTargets:async()=>(await browserClient.send('Target.getTargets')).targetInfos}),
        evaluateMain:()=>readRealm(mains[0],'globalThis.OpenDeskSDK?.diagnostics?.()'),
        evaluateRelay:()=>readRealm(nativeContext,'globalThis.__openDeskSdkRelayV1?.diagnostics?.()')});
    }
    current = {session, tool, page, decoy, browserClient, get workerClient(){return workerClient;}, get workerTargetId(){return worker.targetId;}, get workerDescriptor(){return {...worker,executionContexts:workerContexts};}, observerClients:clients, refreshWorker, install, snapshot, stopWorker, restartBrowser, stop, targetId, tabId,native,startPublic,publicCompletion,publicCall,startNativeBurst,awaitNativeBurst,releaseNativeBurst,resourceSnapshot};
    return current;
  }
  try {
    const first = await startSession(1), {tool, page, decoy} = first;
    const entry = await caseRun('UI-EXPLICIT-TARGET-NO-DEFAULT', async () => {
      const value = await evaluate(tool, '({tab:document.querySelector("#sdk-tab").value,document:document.querySelector("#sdk-document").value,disabled:document.querySelector("#sdk-install").disabled,capabilities:[...document.querySelectorAll("[name=sdk-capability]:checked")].map(input=>input.value)})');
      assert.equal(value.tab, ''); assert.equal(value.document, ''); assert.equal(value.disabled, true); assert.deepEqual(value.capabilities, []);
      assert.equal(await evaluate(page, 'typeof OpenDeskSDK'), 'undefined'); return value;
    });
    assert(entry, 'Explicit product UI prerequisite failed');
    const installed = await caseRun('UI-TRUSTED-GESTURE-EXACT-DOCUMENT-INSTALL', first.install); assert(installed, 'Native product installation prerequisite failed');
    const nativeHello = await caseRun('NATIVE-HELLO-GRANT-SUBSET-NO-CONTROLLER', async () => {
      const hello = await evaluate(page, 'OpenDeskSDK.ready()');
      assert.equal(hello.ready, true); assert.equal(hello.sdkVersion, '1.0.0');
      assert.equal(Object.keys(ADMITTED_METHODS).length, 23);
      assert.deepEqual([...hello.methods].sort(), Object.entries(ADMITTED_METHODS).filter(([, method]) => capabilities.includes(method.capability)).map(([name]) => name).sort());
      assert.equal(await evaluate(decoy, 'typeof OpenDeskSDK'), 'undefined');
      const snap = await first.snapshot(); assert(!snap.data.runs.some(row => row.value.tag !== 'sdk-service'));
      assert(snap.data.commandJournal.some(row => row.value.tag === 'sdk-grant' && row.value.documentId === installed.documentId && row.value.active));
      return {hello, decoyHasSdk: false, journal: snap.data.commandJournal, controllerRuns: []};
    });
    assert(nativeHello, 'Real sender/grant Hello prerequisite failed; dependent SDK cases cannot run');
    await caseRun('SDK-ACTUAL-SIX-COUNT-IDLE-BASELINE',async()=>requireIdleSdkResources(await first.resourceSnapshot()));
    if(originalStorageRequested)await runOriginalStorageCases({first,caseRun,ids:originalSdkIds.filter(id=>id.endsWith('004')||id.endsWith('005')),seed,traffic,extensionId:report.extensionId,extension,until});
    if(originalStorageRequested)await runOriginalSessionCases({first,caseRun,ids:originalSdkIds.filter(id=>['007','009','019'].some(suffix=>id.endsWith(suffix))),seed,traffic,extensionId:report.extensionId,extension,until});
    // Original storage lane runs only its exact cases and required real SDK setup/disposal.
    if (!originalStorageRequested) {
    await caseRun('LEGACY-APPSTORAGE-APPLOCAL-REAL-COMPLETION-PROMISES', async () => {
      const callbacks = [], observerErrors = [], inflight = new Set(); let breakpointId;
      await page.send('Debugger.enable');
      try {
      const script = await until(() => traffic.filter(row => row.endpoint === first.targetId && row.message?.method === 'Debugger.scriptParsed')
        .map(row => row.message.params).find(row => row.url === `chrome-extension://${report.extensionId}/framework/sdk-main.js`), 'real MAIN SDK script');
      const {scriptSource} = await page.send('Debugger.getScriptSource', {scriptId: script.scriptId});
      assert.equal(digest(scriptSource), resourceManifest.resources.find(row => row.path === 'framework/sdk-main.js').sha256);
      const point = discoverLegacyCompletion(scriptSource);
      const possible = await page.send('Debugger.getPossibleBreakpoints', {start: {scriptId: script.scriptId, ...point.location}, end: {scriptId: script.scriptId, ...point.endLocation}});
      const exact = possible.locations.filter(location => location.lineNumber === point.location.lineNumber && location.columnNumber === point.location.columnNumber && location.type === 'call');
      if (exact.length !== 1) throw notObserved('Exact real completion settlement call breakpoint unavailable', {point, possible});
      const detach = page.onEvent(event => {
        if (event.method !== 'Debugger.paused' || !event.params.hitBreakpoints?.includes(breakpointId)) return;
        const task = (async () => {
          try {
            const frame = event.params.callFrames[0];
            assert.equal(frame.location.scriptId, script.scriptId); assert.equal(frame.location.lineNumber, point.location.lineNumber); assert.equal(frame.location.columnNumber, point.location.columnNumber);
            const inspected = await page.send('Debugger.evaluateOnCallFrame', {callFrameId: frame.callFrameId, returnByValue: true,
              expression: `(()=>{const result=${point.resultExpression};const body=typeof result==='string'?JSON.parse(result):result;return{requestId:${point.requestExpression},code:body.PageBrigeCode,ownData:Object.hasOwn(body,'data'),undefinedData:body.data===undefined,valueKind:typeof body.data,data:body.data};})()`});
            assert(!inspected.exceptionDetails, JSON.stringify(inspected.exceptionDetails));
            callbacks.push({at: Date.now(), location: frame.location, ...inspected.result.value});
          } catch (error) { observerErrors.push(errorProjection(error)); }
          finally { await page.send('Debugger.resume'); }
        })();
        inflight.add(task); task.finally(() => inflight.delete(task)).catch(error => observerErrors.push(errorProjection(error)));
      });
      try {
        const set = await page.send('Debugger.setBreakpoint', {location: {scriptId: script.scriptId, ...point.location}}); breakpointId = set.breakpointId;
        if (set.actualLocation.lineNumber !== point.location.lineNumber || set.actualLocation.columnNumber !== point.location.columnNumber)
          throw notObserved('Chrome moved the completion breakpoint away from the exact call', {point, actualLocation: set.actualLocation});
        const actual = await evaluate(page, observerExpression(observeLegacyStorage, `${seed}-legacy`));
        await Promise.all([...inflight]); assert.deepEqual(observerErrors, []);
        assert.equal(actual.completionExport, 'function'); assert.equal(actual.pendingBefore, 0); assert.equal(actual.pendingAfter, 0); assert.equal(actual.diagnostics.pending, 0);
        for (const name of ['persistentIsPromise', 'sessionIsPromise', 'persistentSetUndefined', 'sessionSetUndefined', 'sessionOwnUndefined', 'sessionAfterRemoveUndefined']) assert.equal(actual[name], true);
        assert.equal(actual.persistent, 'false'); assert.equal(actual.sessionFalse, false); assert.equal(actual.sessionZero, 0); assert.equal(actual.sessionFalseValue, false); assert.equal(actual.sessionZeroValue, 0); assert.equal(actual.persistentAfterRemove, null);
        assert.equal(callbacks.length, 12); assert(callbacks.every(row => row.code === 0 && row.ownData));
        assert(callbacks.some(row => row.undefinedData)); assert(callbacks.some(row => row.data === 'false')); assert(callbacks.some(row => row.data === false)); assert(callbacks.some(row => row.data === 0));
        const nativeEvents = await evaluate(page, '__sdkNativeEvents.filter(row=>row.name==="OPEN_DESK_SDK_RESULT")');
        for (const callback of callbacks) assert(nativeEvents.some(row => row.message.requestId === callback.requestId && row.message.response?.ok === true), 'Each real completion must correlate with the native relay final response');
        const snapshot = await first.snapshot(), operations = snapshot.data.commandJournal.filter(row => callbacks.some(callback => callback.requestId === row.value.requestId) && row.value.tag === 'sdk-operation');
        assert.equal(operations.length, 12); assert(operations.every(row => row.value.state === 'durable'));
        const receipts = operations.map(operation => snapshot.data.results.find(row => row.value.resultId === operation.value.resultId && row.value.opId === operation.value.opId && row.value.requestDigest === operation.value.requestDigest));
        assert(receipts.every(row => row?.value.state === 'durable' && row.value.valueWire));
        for (const receipt of receipts) {
          const callback = callbacks.find(row => row.requestId === receipt.value.requestId);
          assert.equal(callback.valueKind, typeof decodeValue(receipt.value.valueWire));
          assert.equal(callback.undefinedData, decodeValue(receipt.value.valueWire) === undefined);
        }
        return {expected: {callbacks: 12, pending: 0, persistent: 'false', sessionFalse: false, sessionZero: 0}, actual, callbacks, point, scriptSha256: digest(scriptSource), nativeEvents, operations, receipts};
      } finally {
        try { if (breakpointId) await page.send('Debugger.removeBreakpoint', {breakpointId}); } finally { detach(); }
      }
      } finally { await page.send('Debugger.disable'); }
    });
    await caseRun('LEGACY-AXIOSX-ORIGINAL-HTTP-PARAMETERS-RESULTS-ERRORS', async () => {
      const results = [];
      for (const verb of ['get', 'post', 'put', 'delete']) {
        const config = {params: {legacy: seed, verb, f: false, z: 0}, headers: {'x-native-legacy': seed}, withCredentials: false};
        const result = await evaluate(page, observerExpression(observeLegacyHttp, verb, `${origin}/echo`, config));
        assert(result.ok && result.isPromise, JSON.stringify(result)); assert.equal(result.value.status, 200); assert.equal(result.value.data.method, verb.toUpperCase());
        assert.equal(result.value.data.business.PageBrigeCode, 9); assert.equal(result.value.data.falseValue, false); assert.equal(result.value.data.zero, 0);
        assert.deepEqual(result.value.config.params, config.params); assert.equal(result.value.config.headers['x-native-legacy'], seed); assert.equal(result.value.config.method, verb);
        const hit = serverEvents.find(hit => hit.method === verb.toUpperCase() && hit.url.includes(`legacy=${seed}`) && hit.url.includes(`verb=${verb}`));
        assert(hit); assert.equal(hit.headers['x-native-legacy'], seed);
        const query = new URL(hit.url, origin).searchParams; assert.equal(query.get('f'), 'false'); assert.equal(query.get('z'), '0');
        if (['post', 'put'].includes(verb)) assert.deepEqual(JSON.parse(hit.body), {f: false, z: 0});
        results.push({verb, config, result, rawServer: hit});
      }
      const invalid = await evaluate(page, observerExpression(observeLegacyHttp, 'get', `${origin}/echo?invalid-legacy=${seed}`, {invented: true}));
      const failure = await evaluate(page, observerExpression(observeLegacyHttp, 'get', `${origin}/error?legacy=${seed}`, {}));
      assert.equal(invalid.ok, false); assert.equal(invalid.error.code, 'E_CONFIG_UNSUPPORTED'); assert.equal(failure.ok, false); assert.equal(failure.error.code, 'E_HTTP');
      assert.equal(failure.error.status, 503); assert.equal(failure.error.response.status, 503); assert.equal(failure.error.response.data.business, 'unavailable');
      assert(!serverEvents.some(hit => hit.url.includes(`invalid-legacy=${seed}`)));
      return {expected: {verbs: ['GET', 'POST', 'PUT', 'DELETE'], invalid: 'E_CONFIG_UNSUPPORTED', httpError: 'E_HTTP'}, results, invalid, failure};
    });
    await caseRun('LEGACY-FOUR-SERVICES-BRIDGE-DATA-AND-DIRECT-PROMISES', async () => {
      const before = Date.now(), observations = [];
      for (const direct of [false, true]) {
        const log = await evaluate(page, observerExpression(observeLegacyService, 'log', {message: '迁移验收', data: [0, false]}, direct));
        const time = await evaluate(page, observerExpression(observeLegacyService, 'getTime', {}, direct));
        const bexUrl = await evaluate(page, observerExpression(observeLegacyService, 'bexUrl', {}, direct));
        assert(log.ok && log.isPromise && log.undefinedValue); assert.equal(log.valueKind, 'undefined');
        assert(time.ok && time.isPromise); assert.equal(time.valueKind, 'number'); assert(Number.isFinite(time.value)); assert(time.value >= before && time.value <= Date.now());
        assert(bexUrl.ok && bexUrl.isPromise); assert.deepEqual(bexUrl.value, {url: `chrome-extension://${report.extensionId}/`});
        if (!direct) for (const result of [log, time, bexUrl]) assert.equal(result.ownData, true);
        const resource = await evaluate(page, observerExpression(observeLegacyService, 'requestResource', {url: SDK_RESOURCE_PATHS[0]}, direct));
        assert(resource.ok && resource.isPromise); assert.equal(resource.value.success, true);
        assert.equal(Buffer.byteLength(resource.value.data), resourceManifest.resources[0].bytes); assert.equal(digest(resource.value.data), resourceManifest.resources[0].sha256);
        if (!direct) assert.equal(resource.ownData, true);
        observations.push({direct, log, time, bexUrl, resource});
      }
      const helperRoot = await evaluate(page, 'OpenDeskSDK.resources.getBexUrlByBridge()'); assert.equal(helperRoot, `chrome-extension://${report.extensionId}/`);
      return {expected: {ownUndefined: true, finiteClock: true, runtimeRoot: `chrome-extension://${report.extensionId}/`, resourceManifest}, observations, helperRoot,
        zeroClockCoverage: {status: 'NOT_TESTED', reason: 'Production trusted Date clock did not return 0; exact zero must be checked with the existing trusted-clock component case, without mutating this native clock'}};
    });
    await caseRun('LEGACY-TWO-FIXED-RESOURCES-SEVEN-ALIASES-BYTES-SHA', async () => {
      const observations = [];
      await evaluate(page, 'globalThis.__nativeResourceExports={sdk:OpenDeskSDK,service,bridge:service.bridge,storage:AppStorage,local:AppLocal,http:axiosx};true');
      for (const url of [...SDK_RESOURCE_PATHS, ...Object.keys(SDK_RESOURCE_ALIASES)]) {
        const expectedPath = SDK_RESOURCE_ALIASES[url] ?? url, expected = resourceManifest.resources.find(row => row.path === expectedPath);
        const bridge = await evaluate(page, observerExpression(observeLegacyResource, url, false));
        const consumer = await evaluate(page, observerExpression(observeLegacyResource, `chrome-extension://${report.extensionId}/${url}`, true));
        for (const observed of [bridge, consumer]) {
          assert.equal(observed.value.success, true); assert.equal(typeof observed.value.data, 'string'); assert.equal(observed.bytes, expected.bytes); assert.equal(observed.sha256, expected.sha256);
        }
        assert.equal(bridge.ownData, true); assert.equal(bridge.value.data, consumer.value.data);
        observations.push({url, expected, bridge, consumer});
      }
      const unchangedInstallation = await evaluate(page, '(()=>{const old=__nativeResourceExports;const unchanged=old.sdk===OpenDeskSDK&&old.service===service&&old.bridge===service.bridge&&old.storage===AppStorage&&old.local===AppLocal&&old.http===axiosx;delete globalThis.__nativeResourceExports;return unchanged;})()');
      assert.equal(unchangedInstallation, true); assert.equal(observations.length, 9);
      return {expected: resourceManifest, aliases: SDK_RESOURCE_ALIASES, observations, unchangedInstallation};
    });
    await caseRun('LEGACY-SERVICE-SCHEMA-BOUNDS-REMOTE-NO-EXTERNAL-FETCH', async () => {
      const attempts = [
        ['log', {message: 'x', discarded: true}, 'E_SCHEMA',false], ['log', {message: 'x', data: 'wrong'}, 'E_SCHEMA',false],
        ['log', {message: 'x'.repeat(4097)}, 'E_LIMIT',false], ['log', {message: 'x', data: Array(101).fill(0)}, 'E_LIMIT',false],
        ['getTime', {discarded: true}, 'E_SCHEMA',false], ['bexUrl', {discarded: true}, 'E_SCHEMA',false],
        ['getTime', {discarded: undefined}, 'E_SCHEMA',false],
        ['requestResource', {url: SDK_RESOURCE_PATHS[0], discarded: true}, 'E_SCHEMA',false],
        ['requestResource', {url: `${origin}/forbidden-resource?seed=${seed}`}, 'E_SCHEMA',true],
        ['requestResource', {url: 'framework/../sdk-main.js'}, 'E_SCHEMA',true], ['requestResource', {url: 'framework/%2e%2e/sdk-main.js'}, 'E_SCHEMA',true],
        ['requestResource', {url: '/framework/sdk-main.js'}, 'E_SCHEMA',true], ['requestResource', {url: 'framework/sdk-main.js?x=1'}, 'E_SCHEMA',true],
        ['requestResource', {url: 'x'.repeat(1025)}, 'E_SCHEMA',false], ['requestResource', {url: 'assets/js/unregistered.js'}, 'E_RESOURCE_UNAVAILABLE',true]
      ];
      await first.workerClient.send('Network.enable'); const start = traffic.length, requests = [], results = [];
      const detach = first.workerClient.onEvent(event => { if (event.method === 'Network.requestWillBeSent') requests.push(event.params.request); });
      try {
        for (const [method, args, expectedCode] of attempts) for (const direct of [false, true]) {
          const actual = await evaluate(page, observerExpression(observeLegacyService, method, args, direct));
          assert.equal(actual.ok, false); assert.equal(actual.error.code, expectedCode); results.push({method, args, argsWire: encodeValue(args), direct, expectedCode, actual});
        }
        const anchors=new Map(),validArgs={log:{message:'actual schema anchor',data:[]},getTime:{},bexUrl:{},requestResource:{url:SDK_RESOURCE_PATHS[0]}};
        for (const [method, args, expectedCode,expectedEmission] of attempts) {
          const publicInvocation=await first.publicCall(method,args,{allowPreEmissionRejection:true});
          assert.equal(publicInvocation.publicResponse.ok,false);assert.equal(publicInvocation.publicResponse.error.code,expectedCode);
          assert.equal(publicInvocation.requestEmitted,expectedEmission,'Actual public rejection boundary differs from this schema vector');
          results.push({method,args,boundary:expectedEmission?'actual-background-driver-rejection':'actual-public-SDK-pre-emission-rejection',expectedCode,expectedEmission,publicInvocation});
          // Preserve the separate broker schema assertion with a real installed
          // relay sender. Negative input derives from an actually SDK-admitted
          // identity; no request event or request ID is manufactured.
          let anchor=publicInvocation;
          if(!anchor.payload){
            if(!anchors.has(method)){const value=await first.publicCall(method,validArgs[method]);assert.equal(value.publicResponse.ok,true);assert.equal(value.nativeResponse?.ok,true);anchors.set(method,value);}
            anchor=anchors.get(method);
          }
          const payload={...anchor.payload,argsWire:encodeValue(args)},actual=await first.native(payload);
          assert.equal(actual.ok,false);assert.equal(actual.error.code,expectedCode);
          results.push({method,args,boundary:'real-installed-relay-native-sender-broker-schema',sourceSdkPayload:anchor.payload,payload,expectedCode,actual});
        }
        // Flush the real worker event channel without making a network call.
        await first.workerClient.send('Runtime.evaluate', {expression: 'true', returnByValue: true});
        assert(!requests.some(row => /^https?:/.test(row.url)), 'Invalid resource calls must produce zero external worker fetches');
        assert(!serverEvents.some(hit => hit.url.includes('forbidden-resource')));
        return {expected: {externalFetches: 0}, results, workerNetworkRequests: requests, trafficStart: start, serverEvents: serverEvents.filter(hit => hit.url.includes('forbidden-resource'))};
      } finally { detach(); await first.workerClient.send('Network.disable'); }
    });
    await caseRun('LEGACY-LOG-REAL-DUPLICATE-CONFLICT-ONE-EFFECT', async () => {
      const logs = [], detach = first.workerClient.onEvent(event => {
        if (event.method === 'Runtime.consoleAPICalled' && event.params.args?.[0]?.value === 'opendesk.sdk.log') logs.push(event.params);
      });
      try {
        const publicInvocation=await first.publicCall('log',{message:'迁移去重',data:[0,false]}),payload=publicInvocation.payload,original=publicInvocation.nativeResponse;
        assert.equal(publicInvocation.publicResponse.ok,true);assert.equal(publicInvocation.publicResponse.undefinedResult,true);
        if(!original)throw notObserved('Actual original native log response was not observed',publicInvocation);
        const duplicate=await first.native(payload),conflict=await first.native({...payload,argsWire:encodeValue({message:'changed',data:[0,false]})});
        assert.equal(original.ok, true); assert.deepEqual(duplicate, original); assert.equal(conflict.error.code, 'E_REQUEST_CONFLICT');
        const value = decodeValue(original.data.valueWire); assert.equal(value.PageBrigeCode, 0); assert(Object.hasOwn(value, 'data')); assert.equal(value.data, undefined);
        await first.workerClient.send('Runtime.evaluate', {expression: 'true', returnByValue: true}); assert.equal(logs.length, 1);
        const snap = await first.snapshot(), operations = snap.data.commandJournal.filter(row => row.value.tag === 'sdk-operation' && row.value.requestId === payload.requestId);
        assert.equal(operations.length, 1); assert.equal(operations[0].value.state, 'durable'); assert.equal(operations[0].value.submissionCount, 1);
        const receipt = snap.data.results.find(row => row.value.resultId === operations[0].value.resultId && row.value.opId === operations[0].value.opId && row.value.requestDigest === operations[0].value.requestDigest);
        assert(receipt?.value.state === 'durable'); assert.equal(decodeValue(receipt.value.valueWire), undefined);
        return {expected: {logEffects: 1, durableOperations: 1, conflict: 'E_REQUEST_CONFLICT'}, payload,publicInvocation, original, duplicate, conflict, logs, operations, receipt};
      } finally { detach(); }
    });
    await caseRun('PERSISTENT-STRING-CONVERSION-AND-UNDEFINED-SETTLEMENT', async () => {
      const set = await evaluate(page, callExpression('APPSTORAGE_SETITEM', {key: persistentKey, value: false}));
      const get = await evaluate(page, callExpression('APPSTORAGE_GETITEM', {key: persistentKey}));
      assert(set.ok && set.undefinedResult); assert(get.ok); assert.equal(get.value, 'false'); return {set, get};
    });
    await caseRun('TYPED-JSON-HOP-FALSE-ZERO-OWN-NESTED-UNDEFINED', async () => {
      const value = await evaluate(page, `(async()=>{await OpenDeskSDK.call('CHROME_LOCAL_SET',{values:{'${seed}-typed':{f:false,z:0,u:undefined,nested:{u:undefined},array:[undefined,false,0]}}});const value=await OpenDeskSDK.call('CHROME_LOCAL_GET',{key:'${seed}-typed'});return {falsePreserved:value.f===false,zeroPreserved:value.z===0,ownUndefined:Object.hasOwn(value,'u')&&value.u===undefined,nestedUndefined:Object.hasOwn(value.nested,'u')&&value.nested.u===undefined,arrayOwnUndefined:Object.hasOwn(value.array,0)&&value.array[0]===undefined,rawEvents:__sdkNativeEvents.slice(-2)};})()`);
      for (const key of ['falsePreserved', 'zeroPreserved', 'ownUndefined', 'nestedUndefined', 'arrayOwnUndefined']) assert.equal(value[key], true); return value;
    });
    await caseRun('NATIVE-SESSION-TYPED-VALUES', async () => {
      const value = await evaluate(page, `(async()=>{const set=await OpenDeskSDK.call('APPLOCAL_SETITEM',{key:${JSON.stringify(sessionKey)},value:{u:undefined,f:false,z:0}});const value=await OpenDeskSDK.call('APPLOCAL_GETITEM',{key:${JSON.stringify(sessionKey)}});return {setUndefined:set===undefined,ownUndefined:Object.hasOwn(value,'u')&&value.u===undefined,f:value.f,z:value.z,rawEvents:__sdkNativeEvents.slice(-2)};})()`);
      assert(value.setUndefined && value.ownUndefined); assert.equal(value.f, false); assert.equal(value.z, 0); return value;
    });
    await caseRun('HTTP-GET-POST-PUT-DELETE-BUSINESS-DATA', async () => {
      const results = [];
      for (const verb of ['GET', 'POST', 'PUT', 'DELETE']) {
        const value = await evaluate(page, callExpression(`AXIOS_${verb}`, {url: `${origin}/echo`, ...(['POST', 'PUT'].includes(verb) ? {data: {falseValue: false, zero: 0}} : {}), config: {params: {seed, verb}, withCredentials: false}}));
        assert(value.ok, JSON.stringify(value)); assert.equal(value.value.status, 200); assert.equal(value.value.data.method, verb);
        assert.equal(value.value.data.falseValue, false); assert.equal(value.value.data.zero, 0); assert.equal(value.value.data.business.PageBrigeCode, 9);
        const hit = serverEvents.find(hit => hit.method === verb && hit.url.includes(`seed=${seed}`) && hit.url.includes(`verb=${verb}`)); assert(hit); results.push({verb, value, rawServer: hit});
      }
      return results;
    });
    await caseRun('CONFIG-REDIRECT-HTTP-ERROR-AND-UNGRANTED-METHOD', async () => {
      const badConfig = await evaluate(page, callExpression('AXIOS_GET', {url: `${origin}/echo`, config: {invented: true}}));
      const redirect = await evaluate(page, callExpression('AXIOS_GET', {url: `${origin}/redirect?seed=${seed}`}));
      const error = await evaluate(page, callExpression('AXIOS_GET', {url: `${origin}/error?seed=${seed}`}));
      const ungranted = await evaluate(page, callExpression('DEVICE_GET_APP_ID', {}));
      assert.equal(badConfig.error.code, 'E_CONFIG_UNSUPPORTED'); assert.equal(redirect.ok, false); assert.equal(error.ok, false); assert.equal(ungranted.error.code, 'E_CAPABILITY');
      assert(!serverEvents.some(hit => hit.url.includes('redirect-effect=true'))); return {badConfig, redirect, error, ungranted};
    });
    await caseRun('REAL-RELAY-NATIVE-DUPLICATE-AND-CONFLICT', async () => {
      const publicInvocation=await first.publicCall('AXIOS_POST',{url:`${origin}/echo?duplicate=${seed}`,data:{f:false,z:0}}),duplicatePayload=publicInvocation.payload,original=publicInvocation.nativeResponse;
      assert.equal(publicInvocation.publicResponse.ok,true);assert.equal(publicInvocation.publicResponse.value.status,200);
      if(!original)throw notObserved('Actual original native POST response was not observed',publicInvocation);
      const duplicate=await first.native(duplicatePayload),conflict=await first.native({...duplicatePayload,argsWire:encodeValue({url:`${origin}/echo?duplicate=${seed}`,data:{f:true}})});
      assert.equal(original.ok, true); assert.deepEqual(duplicate, original); assert.equal(conflict.error.code, 'E_REQUEST_CONFLICT');
      const hits = serverEvents.filter(hit => hit.url.includes(`duplicate=${seed}`)); assert.equal(hits.length, 1); return {payload: duplicatePayload,publicInvocation, original, duplicate, conflict, rawServer: hits};
    });
    await caseRun('NATIVE-100-CONCURRENT-SDK-PROMISES', async () => {
      const value = await evaluate(page, `Promise.all(Array.from({length:100},()=>(${sdkCall.toString()})('APPSTORAGE_GETITEM',{key:${JSON.stringify(persistentKey)}}))).then(values=>({values,diagnostics:OpenDeskSDK.diagnostics()}))`);
      assert.equal(value.values.length, 100); assert(value.values.every(result => result.ok && result.value === 'false')); assert.equal(value.diagnostics.pending, 0); return value;
    });
    await caseRun('SW-RESTART-AFTER-SERVER-EFFECT-UNKNOWN-NO-REPLAY', async () => {
      const token=`unknown-${seed}`,publicInvocation=await first.startPublic('AXIOS_POST',{url:`${origin}/hold?token=${token}`,data:{effect:true}}),payload=publicInvocation.payload;
      await until(() => serverEvents.find(hit => hit.url.includes(`token=${token}`)), 'server actually observed POST effect');
      const stopped = await first.stopWorker();
      const res = heldResponses.get(token); if (res && !res.destroyed) { res.writeHead(200, {'content-type': 'application/json'}); res.end('{"effect":true}'); } heldResponses.delete(token);
      // A fresh legitimate page request wakes the new worker and its real recovery.
      const postRestartWake = await evaluate(page, callExpression('APPSTORAGE_GETITEM', {key: persistentKey}));
      assert(postRestartWake.ok);
      const replay = await first.native(payload);
      assert.equal(replay.ok, false); assert.equal(replay.error.code, 'E_EFFECT_UNKNOWN');
      const snap = await first.snapshot(), operation = snap.data.commandJournal.find(row => row.value.requestId === payload.requestId && row.value.tag === 'sdk-operation');
      assert(operation); assert.equal(operation.value.state, 'effect_unknown'); assert.equal(operation.value.submissionCount, 1);
      const hits = serverEvents.filter(hit => hit.url.includes(`token=${token}`)); assert.equal(hits.length, 1);
      const original=await first.publicCompletion(publicInvocation);
      assert.equal(original.publicResponse.ok,false);assert.equal(original.publicResponse.error.code,'E_EFFECT_UNKNOWN');
      return {payload,publicInvocation, stopped, postRestartWake, replay, operation, rawServer: hits, original};
    });
    await caseRun('SESSION-AND-PERSISTENT-SURVIVE-SW-RESTART', async () => {
      const sessionValue = await evaluate(page, callExpression('APPLOCAL_GETITEM', {key: sessionKey})), persistentValue = await evaluate(page, callExpression('APPSTORAGE_GETITEM', {key: persistentKey}));
      assert(sessionValue.ok); assert.equal(sessionValue.value.f, false); assert.equal(sessionValue.value.z, 0); assert.equal(persistentValue.value, 'false');
      const legacy = await evaluate(page, `(async()=>{const session=await AppLocal.getItem(${JSON.stringify(sessionKey)});return{persistent:await AppStorage.getItem(${JSON.stringify(persistentKey)}),f:session.f,z:session.z,ownUndefined:Object.hasOwn(session,'u')&&session.u===undefined};})()`);
      assert.equal(legacy.persistent, 'false'); assert.equal(legacy.f, false); assert.equal(legacy.z, 0); assert.equal(legacy.ownUndefined, true);
      return {sessionValue, persistentValue, legacy};
    });
    let revocationPayload, revocationOriginal, revocationOperation;
    await caseRun('NATIVE-PERMISSION-REMOVAL-REVOKES-GRANT', async () => {
      // Create the old identity immediately before removal. The earlier
      // duplicate test's 30s request is already stale after restart diagnostics.
      revocationOriginal=await first.publicCall('AXIOS_POST',{url:`${origin}/echo?revocation=${seed}`,data:{f:false,z:0}});
      revocationPayload=revocationOriginal.payload;assert.equal(revocationOriginal.publicResponse.ok,true);assert.equal(revocationOriginal.nativeResponse?.ok,true);
      const admissionSnapshot = await first.snapshot();
      revocationOperation = admissionSnapshot.data.commandJournal.find(row => row.value.tag === 'sdk-operation' && row.value.requestId === revocationPayload.requestId)?.value;
      assert(revocationOperation); assert.equal(revocationOperation.state, 'durable'); assert.equal(revocationOperation.submissionCount, 1);
      assert.equal(serverEvents.filter(hit => hit.url.includes(`revocation=${seed}`)).length, 1);
      const removed = await evaluate(tool, 'chrome.permissions.remove({origins:["http://127.0.0.1/*"]})'); assert.equal(removed, true);
      const value = await evaluate(page, callExpression('APPSTORAGE_SETITEM', {key: `${seed}-forbidden`, value: 'must-not-commit'}));
      assert.equal(value.ok, false); assert(['E_PERMISSION', 'E_GRANT_REVOKED'].includes(value.error.code));
      const snap = await first.snapshot(); assert(!snap.data.frameworkKV.some(row => row.value.key === `${seed}-forbidden`)); return {removed, value, revocationPayload, revocationOriginal, revocationOperation, grants: snap.data.commandJournal.filter(row => row.value.tag === 'sdk-grant')};
    });
    await caseRun('TRUSTED-UI-REGRANT-DOES-NOT-REPLAY-OLD-REQUEST', async () => {
      const install = await first.install(), replayStartedAt = Date.now();
      const window = {requestId: revocationPayload?.requestId, requestDeadlineAt: revocationPayload?.deadlineAt,
        admittedDeadlineAt: revocationOperation?.deadlineAt, replayStartedAt, install};
      if (!revocationPayload || !revocationOperation || replayStartedAt >= Math.min(revocationPayload.deadlineAt, revocationOperation.deadlineAt))
        throw notObserved('Regrant missed the original request/admitted deadline window; revocation was not observed with a live old request', window);
      const old = await first.native(revocationPayload);
      window.replayObservedAt = Date.now(); window.old = old;
      if (window.replayObservedAt >= Math.min(revocationPayload.deadlineAt, revocationOperation.deadlineAt))
        throw notObserved('Old request expired during the observation; deadline rejection cannot prove grant revocation', window);
      assert.equal(old.ok, false); assert.equal(old.error.code, 'E_GRANT_REVOKED');
      assert.equal(serverEvents.filter(hit => hit.url.includes(`duplicate=${seed}`)).length, 1);
      assert.equal(serverEvents.filter(hit => hit.url.includes(`revocation=${seed}`)).length, 1);
      const fresh = await evaluate(page, callExpression('APPSTORAGE_GETITEM', {key: persistentKey})); assert.equal(fresh.value, 'false'); return {install, old, fresh, revocationPayload, revocationOriginal, revocationOperation, window};
    });
    await caseRun('NATIVE-NAVIGATION-INVALIDATES-OLD-DOCUMENT', async () => {
      const previous = first.session.documentId;
      await page.send('Page.navigate', {url: `${origin}/target?seed=${seed}&navigated=true`});
      await until(() => evaluate(page, 'document.readyState === "complete" && location.search.includes("navigated=true")'), 'actual navigation');
      assert.equal(await evaluate(page, 'typeof OpenDeskSDK'), 'undefined');
      const staleUI = await evaluate(tool, '({state:document.querySelector("#sdk-status").dataset.state,disabled:document.querySelector("#sdk-install").disabled})'); assert.equal(staleUI.disabled, true);
      const snap = await first.snapshot(), oldGrants = snap.data.commandJournal.filter(row => row.value.tag === 'sdk-grant' && row.value.documentId === previous); assert(oldGrants.length && oldGrants.every(row => !row.value.active));
      const install = await first.install(); assert.notEqual(install.documentId, previous); assert.equal((await evaluate(page, 'OpenDeskSDK.ready()')).ready, true);
      return {previous, staleUI, oldGrants, install};
    });
    await caseRun('SDK-18-METHODS-SHARED-SERVICE-SEMANTICS', async () => {
      capabilities.splice(0,capabilities.length,...[...new Set(Object.values(SDK_METHODS).map(row=>row.capability))].filter(capability=>capability!=='network.info'));
      const install=await first.install(), hello=await evaluate(page,'OpenDeskSDK.ready()');
      assert.deepEqual([...hello.methods].sort(),Object.entries(SDK_METHODS).filter(([,row])=>capabilities.includes(row.capability)).map(([name])=>name).sort());
      const results=[];
      async function invoke(method,args={}) {
        const result=await evaluate(page,callExpression(method,args)); results.push({method,args,result}); return result;
      }
      const key=seed+'-remove';
      assert((await invoke('APPSTORAGE_SETITEM',{key,value:0})).undefinedResult);
      assert.equal((await invoke('APPSTORAGE_GETITEM',{key})).value,'0');
      assert((await invoke('APPSTORAGE_REMOVEITEM',{key})).undefinedResult);
      assert.equal((await invoke('APPSTORAGE_GETITEM',{key})).value,null);
      assert((await invoke('APPLOCAL_SETITEM',{key,value:false})).undefinedResult);
      assert.equal((await invoke('APPLOCAL_GETITEM',{key})).value,false);
      assert((await invoke('APPLOCAL_REMOVEITEM',{key})).undefinedResult);
      assert((await invoke('APPLOCAL_GETITEM',{key})).undefinedResult);
      assert((await invoke('CHROME_LOCAL_SET',{values:{[key]:0}})).undefinedResult);
      assert.equal((await invoke('CHROME_LOCAL_GET',{key})).value,0);
      assert((await invoke('CHROME_LOCAL_REMOVE',{keys:[key]})).undefinedResult);
      assert((await invoke('CHROME_LOCAL_GET',{key})).undefinedResult);
      await invoke('APPSTORAGE_SETITEM',{key,value:'clear-me'});
      assert((await invoke('APPSTORAGE_CLEAR')).undefinedResult);
      assert.equal((await invoke('APPSTORAGE_GETITEM',{key})).value,null);
      await invoke('APPSTORAGE_SETITEM',{key,value:0});
      await invoke('CHROME_LOCAL_SET',{values:{[key]:false}});
      assert.equal((await invoke('APPSTORAGE_GETITEM',{key})).value,'0');
      assert.equal((await invoke('CHROME_LOCAL_GET',{key})).value,false);
      await invoke('APPSTORAGE_CLEAR');
      assert.equal((await invoke('CHROME_LOCAL_GET',{key})).value,false);
      await invoke('APPSTORAGE_SETITEM',{key,value:'survives'});
      assert((await invoke('CHROME_LOCAL_CLEAR')).undefinedResult);
      assert.equal((await invoke('APPSTORAGE_GETITEM',{key})).value,'survives');
      assert((await invoke('CHROME_LOCAL_GET',{key})).undefinedResult);
      for(const verb of ['GET','POST','PUT','DELETE']) {
        const result=await invoke('AXIOS_'+verb,{url:origin+'/echo?all18='+seed,
          ...(['POST','PUT'].includes(verb)?{data:{f:false,z:0}}:{})});
        assert(result.ok); assert.equal(result.value.data.method,verb);
      }
      const server=await invoke('SERVER_CHECK',{server:origin+'/echo?check='+seed});
      assert(server.ok && server.value.available===true && server.value.latency>=0);
      const device=await invoke('DEVICE_GET_APP_ID'), again=await invoke('DEVICE_GET_APP_ID');
      assert(device.ok && typeof device.value==='string' && device.value.length>0); assert.equal(device.value,again.value);
      const network=await invoke('NETWORK_INFO_GET'); assert.equal(network.ok,false); assert.equal(network.error.code,'E_CAPABILITY');
      const notify=await invoke('CREATE_NOTIFY',{title:'OpenDesk native SDK verification',content:seed});
      assert(notify.ok && notify.undefinedResult);
      const snapshot=await first.snapshot();
      const notification=snapshot.data.commandJournal.find(row=>row.value.tag==='sdk-operation' && row.value.method==='CREATE_NOTIFY' && row.value.nativeReceiptWire && decodeValue(row.value.nativeReceiptWire)?.notificationId);
      assert(notification,'Native notification receipt must be durable');
      assert.deepEqual([...new Set(results.map(row=>row.method))].sort(),Object.keys(SDK_METHODS).sort());
      return {install,hello,results,notification};
    });
    await writeFile(path.join(directory, 'native-session-1-snapshot.json'), JSON.stringify(await first.snapshot(), null, 2) + '\n');
    await caseRun('BROWSER-SESSION-END-PERSISTENT-SURVIVES-APPLOCAL-EXPIRES', async () => {
      // Refresh both sentinels in the *current* grant after navigation/regrant,
      // so an expired old namespace cannot make session disappearance pass.
      const before = await evaluate(page, `(async()=>{
        await OpenDeskSDK.call('APPSTORAGE_SETITEM',{key:${JSON.stringify(persistentKey)},value:false});
        await OpenDeskSDK.call('APPLOCAL_SETITEM',{key:${JSON.stringify(sessionKey)},value:{f:false,z:0}});
        return {persistent:await (${sdkCall.toString()})('APPSTORAGE_GETITEM',{key:${JSON.stringify(persistentKey)}}),
          session:await (${sdkCall.toString()})('APPLOCAL_GETITEM',{key:${JSON.stringify(sessionKey)}}),hello:await OpenDeskSDK.ready()};})()`);
      assert(before.persistent.ok && before.session.ok); assert.equal(before.persistent.value, 'false');
      assert.equal(before.session.value.f, false); assert.equal(before.session.value.z, 0);
      const legacyPersistentKey = `${persistentKey}-legacy-lifetime`, legacySessionKey = `${sessionKey}-legacy-lifetime`;
      const legacyBefore = await evaluate(page, `(async()=>{const persistentSet=await AppStorage.setItem(${JSON.stringify(legacyPersistentKey)},0);const sessionSet=await AppLocal.setItem(${JSON.stringify(legacySessionKey)},{f:false,z:0,u:undefined});const session=await AppLocal.getItem(${JSON.stringify(legacySessionKey)});return{persistentSetUndefined:persistentSet===undefined,sessionSetUndefined:sessionSet===undefined,persistent:await AppStorage.getItem(${JSON.stringify(legacyPersistentKey)}),f:session.f,z:session.z,ownUndefined:Object.hasOwn(session,'u')&&session.u===undefined};})()`);
      assert(legacyBefore.persistentSetUndefined && legacyBefore.sessionSetUndefined && legacyBefore.ownUndefined); assert.equal(legacyBefore.persistent, '0'); assert.equal(legacyBefore.f, false); assert.equal(legacyBefore.z, 0);
      const snapshotBefore = await first.snapshot();
      assert(Object.keys(snapshotBefore.sessionStorage).some(key => key.startsWith('framework-session:')));
      assert.equal(typeof snapshotBefore.sessionStorage.browserSessionIncarnation, 'string');
      await writeFile(path.join(directory, 'browser-session-before.json'), JSON.stringify({before, legacyBefore, snapshotBefore}, null, 2) + '\n');
      const next = await first.restartBrowser(), second = await startSession(2, next);
      assert.equal(second.session.launcher.profile, first.session.launcher.profile);
      assert.notEqual(second.session.pid, first.session.pid);
      assert.equal(second.session.actualWorker.id, first.session.actualWorker.id);
      // Observe native storage.session before creating any new grant. A new
      // incarnation alone must not hide leaked old session namespace entries.
      const snapshotAfterRestart = await second.snapshot();
      assert(!Object.keys(snapshotAfterRestart.sessionStorage).some(key => key.startsWith('framework-session:')),
        'Native browser session storage must lose old AppLocal entries');
      assert.equal(typeof snapshotAfterRestart.sessionStorage.browserSessionIncarnation, 'string');
      assert.notEqual(snapshotAfterRestart.sessionStorage.browserSessionIncarnation, snapshotBefore.sessionStorage.browserSessionIncarnation);
      assert.equal(await evaluate(second.page, 'typeof OpenDeskSDK'), 'undefined');
      const install = await second.install(), hello = await evaluate(second.page, 'OpenDeskSDK.ready()');
      assert.equal(hello.ready, true);
      const persistent = await evaluate(second.page, callExpression('APPSTORAGE_GETITEM', {key: persistentKey}));
      const session = await evaluate(second.page, callExpression('APPLOCAL_GETITEM', {key: sessionKey}));
      const legacyAfter = await evaluate(second.page, `(async()=>{const session=await AppLocal.getItem(${JSON.stringify(legacySessionKey)});return{persistent:await AppStorage.getItem(${JSON.stringify(legacyPersistentKey)}),sessionUndefined:session===undefined,sessionKind:typeof session};})()`);
      assert.equal(legacyAfter.persistent, '0'); assert.equal(legacyAfter.sessionUndefined, true); assert.equal(legacyAfter.sessionKind, 'undefined');
      assert(persistent.ok); assert.equal(persistent.value, 'false');
      assert(session.ok && session.undefinedResult); assert.equal(session.valueKind, 'undefined');
      const snapshotAfter = await second.snapshot();
      const actual = {before, legacyBefore, snapshotBefore, restart: next.metadata, snapshotAfterRestart, install, hello, persistent, session, legacyAfter, snapshotAfter};
      await writeFile(path.join(directory, 'browser-session-after.json'), JSON.stringify(actual, null, 2) + '\n');
      return actual;
    });
    }
    await caseRun('SDK-EXPLICIT-DISPOSE-RELEASES-MAIN-RESOURCES',async()=>{
      await evaluate(current.page,'OpenDeskSDK.ready()');
      const before=requireIdleSdkResources(await current.resourceSnapshot());
      await evaluate(current.page,'OpenDeskSDK.dispose();true');
      const after=await current.resourceSnapshot();validateNativeSdkDisposal(before,after);
      return {before,after,checked:true};
    });
  } catch (error) { report.error = errorProjection(error); }
  finally {
    if (current) { try { await current.stop(); } catch(error) { report.cleanupError=errorProjection(error); report.error ||= report.cleanupError; } }
    report.profileRemoved = report.sessions.every(session => session.profileRemoved === true);
    report.packageAfter = await fingerprint(extension); report.packageDrift = report.packageBefore.packageHash !== report.packageAfter.packageHash;
    report.summary = {PASS: report.cases.filter(test => test.status === 'PASS').length, FAIL: report.cases.filter(test => test.status === 'FAIL').length,
      BLOCKED: report.cases.filter(test => test.status === 'BLOCKED').length, NOT_TESTED: report.cases.filter(test => test.status === 'NOT_TESTED').length};
    await writeFile(path.join(directory, 'raw-cdp.json'), JSON.stringify(traffic, null, 2) + '\n');
    await writeFile(path.join(directory, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  }
  return report;
}
try {
  for (const mode of modes) for (const label of labels) {
    console.log(JSON.stringify({state: 'starting', mode, label, cwd: root, output}));
    const report = await browserRun(mode, label); reports.push(report);
    console.log(JSON.stringify({mode, label, summary: report.summary, error: report.error, packageDrift: report.packageDrift, output}));
  }
} finally {
  for (const res of heldResponses.values()) res.destroy(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  await writeFile(path.join(output, 'raw-server.json'), JSON.stringify(serverEvents, null, 2) + '\n');
}
const finalInputs=await inputIdentity();
const finalPackages=Object.fromEntries(await Promise.all(['production','development'].map(async mode=>[mode,(await fingerprint(path.join(root,'dist',mode))).packageHash])));
const finalZips=Object.fromEntries(await Promise.all(['production','development'].map(async mode=>[mode,digest(await readFile(path.join(root,'artifacts',`opendesk-browser-${mode}.zip`)))])));
const candidateDrift=inputBindings.productInputsSha256!==finalInputs.productInputsSha256||inputBindings.verificationInputsSha256!==finalInputs.verificationInputsSha256||JSON.stringify(bothPackageHashes)!==JSON.stringify(finalPackages)||JSON.stringify(zipHashes)!==JSON.stringify(finalZips);
const sourceAfter = await fingerprintSource();
await writeFile(path.join(output, 'source-manifest-after.json'), JSON.stringify(sourceAfter, null, 2) + '\n');
const beforeSource = new Map(sourceFiles.map(file => [file.path, file])), afterSource = new Map(sourceAfter.map(file => [file.path, file]));
const sourceDrift = [...new Set([...beforeSource.keys(), ...afterSource.keys()])].filter(file => beforeSource.get(file)?.sha256 !== afterSource.get(file)?.sha256)
  .map(file => ({path: file, before: beforeSource.get(file) ?? null, after: afterSource.get(file) ?? null}));
const summary = {cwd: root, argv: process.argv, output, reports: reports.map(report => ({mode: report.mode, label: report.label, extensionId: report.extensionId, packageHash: report.packageBefore.packageHash, summary: report.summary, error: report.error, packageDrift: report.packageDrift})),
  candidateDrift,inputBefore:{productInputsSha256:inputBindings.productInputsSha256,verificationInputsSha256:inputBindings.verificationInputsSha256,packageHashes:bothPackageHashes,zipHashes},inputAfter:{productInputsSha256:finalInputs.productInputsSha256,verificationInputsSha256:finalInputs.verificationInputsSha256,packageHashes:finalPackages,zipHashes:finalZips},sourceDrift, classification: sourceDrift.length || reports.some(report => report.packageDrift) ? 'diagnostic-drift' : 'targeted-native-current-package',
  serverClosed: true, finalProductPassed: false, f3Accepted: false, original603Closed: false,
  notClaimed: ['All original603 families', 'four native crash points', '1000 mixed rounds', '10 reconnect rounds', '2 plugin disables', 'independent same-final-package F3 review'],
  boundary: 'Current production/development package targeted native SDK evidence, original raw server/CDP/result/storage observations preserved'};
await writeFile(path.join(output, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary));
if (!reports.length || candidateDrift || sourceDrift.length || reports.some(report => report.error || report.summary.FAIL || report.packageDrift || report.sessions.some(session => session.pidAliveAfterExit))) process.exitCode = 1;
else if (reports.some(report => report.cases.some(test => test.status !== 'PASS'))) process.exitCode = 3;
