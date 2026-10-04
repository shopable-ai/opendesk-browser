import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile, writeFile, mkdir, readdir, realpath} from 'node:fs/promises';
import {appendFileSync} from 'node:fs';
import {createHash, randomUUID} from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {encodeValue} from '../../src/platform/page-port/codec.js';
import {PROTOCOL} from '../../src/platform/protocol.js';
import {SDK_METHODS} from '../../src/framework/sdk/registry.js';
import {launchChrome, LAUNCHER} from './k5-sdk-native-launcher.mjs';

// Load the existing built product verbatim. No generated extension, manifest key,
// grant fixture, substituted runtime/MessageSender, or test-only product route.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
assert.equal(process.cwd(), root, `Run with cwd=${root}`);
const args = process.argv.slice(2), option = (name, fallback) => args.find(arg => arg.startsWith(`--${name}=`))?.split('=').slice(1).join('=') || fallback;
const modes = option('mode', 'all') === 'all' ? ['production', 'development'] : [option('mode')];
const labels = option('chrome', 'all') === 'all' ? ['138', '154'] : [option('chrome')];
assert(modes.every(mode => ['production', 'development'].includes(mode)) && labels.every(label => ['138', '154'].includes(label)));
const output = path.join(root, 'docs/framework/evidence/f2-sdk-native', `native-${new Date().toISOString().replaceAll(':', '-')}-${randomUUID().slice(0, 8)}`);
await mkdir(output, {recursive: true});
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
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
        else if (item.isFile() && (dir === 'src' || item.name.startsWith('k5-sdk-native'))) {
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
const origin = `http://127.0.0.1:${server.address().port}`, reports = [], capabilities = ['network', 'storage.persistent', 'storage.session'];
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
  return {send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++sequence, message = {id, method, params};
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${label} ${method} timed out`)); }, 45000);
      pending.set(id, {resolve, reject, timer});
      const entry = {at: new Date().toISOString(), endpoint: label, direction: 'sent', message};
      traffic.push(entry); appendFileSync(path.join(output, 'raw-cdp-live.jsonl'), JSON.stringify(entry) + '\n');
      socket.send(JSON.stringify(message));
    });
  }, onEvent: listener => listeners.add(listener), close: () => socket.close()};
}
async function evaluate(client, expression) {
  const raw = await client.send('Runtime.evaluate', {expression, returnByValue: true, awaitPromise: true});
  if (raw.exceptionDetails) throw new Error(JSON.stringify(raw.exceptionDetails));
  return raw.result.value;
}
async function until(operation, description, ms = 12000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) { const result = await operation(); if (result) return result; await sleep(30); }
  throw new Error(`Timed out: ${description}`);
}
function rawRequest(payload) {
  return new Promise(resolve => {
    const timer = setTimeout(() => { window.removeEventListener('OPEN_DESK_SDK_RESULT', receive); resolve({ok: false, error: {code: 'TEST_OBSERVATION_TIMEOUT'}}); }, 35000);
    function receive(event) {
      const message = JSON.parse(event.detail);
      if (message.requestId !== payload.requestId) return;
      clearTimeout(timer); window.removeEventListener('OPEN_DESK_SDK_RESULT', receive); resolve(message.response);
    }
    window.addEventListener('OPEN_DESK_SDK_RESULT', receive);
    window.dispatchEvent(new CustomEvent('CHROME_BRIDGE_INTERFACE', {detail: JSON.stringify({protocol: 'opendesk.foundation.v1', type: 'SDK_REQUEST', payload})}));
  });
}
const rawExpression = payload => `(${rawRequest.toString()})(${JSON.stringify(payload)})`;
function sdkCall(method, args) {
  return OpenDeskSDK.call(method, args).then(value => ({ok: true, value, valueKind: typeof value,
    undefinedResult: value === undefined}), error => ({ok: false, error: {code: error?.code, message: error?.message}}));
}
const callExpression = (method, args) => `(${sdkCall.toString()})(${JSON.stringify(method)},${JSON.stringify(args)})`;
const errorProjection = error => ({code: error.code, message: error.message, stack: error.stack});
async function browserRun(mode, label) {
  const directory = path.join(output, `${mode}-${label}`); await mkdir(directory, {recursive: true});
  const extension = await realpath(path.join(root, 'dist', mode)), packageBefore = await fingerprint(extension);
  const manifest = JSON.parse(await readFile(path.join(extension, 'manifest.json'), 'utf8'));
  const binary = path.join(root, `tests/.cache/m5-browsers/${label === '138' ? '138.0.7204.183' : '154.0.8037.92'}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`);
  const report = {mode, label, extension, packageBefore, unchangedProductPackage: true, alteredManifest: false,
    finalProductPassed: false, f3Accepted: false, ledgerCasesClosed: [], cases: [], sessions: [], origin,
    binary, binarySha256: digest(await readFile(binary)), launcher: LAUNCHER,
    OS: {type: os.type(), release: os.release(), arch: os.arch()}, boundary: 'Targeted native independent SDK through current product UI and broker; not full B05/F3/603 acceptance'};
  const traffic = [], seed = `sdk-native-${randomUUID()}`, persistentKey = `${seed}-persistent`, sessionKey = `${seed}-session`;
  const caseRun = async (id, operation) => {
    try {
      const actual = await operation(); report.cases.push({id, status: 'PASS', actual});
      console.log(JSON.stringify({state: 'native-case', mode, label, id, status: 'PASS'})); return actual;
    } catch (error) {
      const status = error.code === 'E_NATIVE_PERMISSION_WAIT' ? 'BLOCKED' : 'FAIL';
      report.cases.push({id, status, error: errorProjection(error)});
      console.log(JSON.stringify({state: 'native-case', mode, label, id, status, error: errorProjection(error)})); return null;
    }
  };
  let current;
  async function startSession(number) {
    const clients = [], session = {number, launchMethod: 'global Python launcher'};
    report.sessions.push(session);
    const owned = await launchChrome({root, binary, extension, headed: args.includes('--headed'), directory, label: String(number)});
    session.launcher = owned.metadata; session.pid = owned.metadata.pid; session.chromeArgs = owned.metadata.args;
    report.profile = owned.metadata.profile;
    let browserClient;
    async function stop() {
      for (const client of clients) client.close();
      browserClient?.close();
      const result = await owned.stop(); Object.assign(session, result);
    }
    current = {stop}; const endpoint = owned.endpoint;
    browserClient = await connect(endpoint, `browser-${number}`, traffic); session.cdpVersion = await browserClient.send('Browser.getVersion');
    assert.equal(session.cdpVersion.product, `Chrome/${label === '138' ? '138.0.7204.183' : '154.0.8037.92'}`);
    report.completeVersion = session.cdpVersion.product;
    console.log(JSON.stringify({state:'native-browser-ready',mode,label,number,pid:session.pid,launcherPid:owned.metadata.launcherPid,endpoint}));
    session.nativeProcesses = (await browserClient.send('SystemInfo.getProcessInfo')).processInfo;
    assert(session.nativeProcesses.some(entry => entry.type === 'browser' && entry.id === session.pid));
    const debuggingURL = `http://127.0.0.1:${new URL(endpoint).port}`;
    async function attach(targetId) {
      const target = await until(async () => (await (await fetch(`${debuggingURL}/json/list`)).json()).find(target => target.id === targetId && target.webSocketDebuggerUrl), 'target endpoint');
      const client = await connect(target.webSocketDebuggerUrl, targetId, traffic); clients.push(client); return client;
    }
    const worker = await until(async () => (await browserClient.send('Target.getTargets')).targetInfos.find(target => target.type === 'service_worker' && target.url.startsWith('chrome-extension://') && target.url.endsWith('/sw.js')), 'actual product service worker');
    const workerClient = await attach(worker.targetId);
    await workerClient.send('Runtime.enable');
    await until(() => evaluate(workerClient, 'typeof chrome!=="undefined" && !!chrome.runtime?.id'), 'native extension worker bindings initialized');
    const identity = await evaluate(workerClient, '({id:chrome.runtime.id,manifest:chrome.runtime.getManifest(),url:chrome.runtime.getURL("sw.js")})');
    assert.equal(identity.manifest.name, manifest.name); assert.equal(identity.manifest.version, manifest.version); assert.equal(identity.url, worker.url);
    session.actualWorker = {targetId: worker.targetId, ...identity};
    const extensionId = identity.id; report.extensionId = extensionId;
    const targetURL = `${origin}/target?seed=${seed}&session=${number}`, decoyURL = `${origin}/decoy?seed=${seed}&session=${number}`;
    const targetId = (await browserClient.send('Target.createTarget', {url: targetURL})).targetId;
    const page = await attach(targetId); await until(() => evaluate(page, 'document.readyState === "complete"'), 'target loaded');
    const decoyId = (await browserClient.send('Target.createTarget', {url: decoyURL})).targetId, decoy = await attach(decoyId);
    const toolId = (await browserClient.send('Target.createTarget', {url: `chrome-extension://${extensionId}/ui/tool.html`})).targetId;
    const tool = await attach(toolId); await until(() => evaluate(tool, '!!document.querySelector("#sdk-install")'), 'current product SDK UI');
    await page.send('Runtime.evaluate', {expression: 'globalThis.__sdkNativeEvents=[]; for(const name of ["OPEN_DESK_SDK_READY","OPEN_DESK_SDK_RESULT"]) window.addEventListener(name,event=>__sdkNativeEvents.push({at:Date.now(),name,message:JSON.parse(event.detail)}));'});
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
    async function install() {
      await click('#sdk-refresh');
      await until(() => evaluate(tool, `!!document.querySelector('#sdk-tab option[value="${tabId}"]')`), 'explicit target listed');
      await evaluate(tool, `document.querySelector('#sdk-tab').value=${JSON.stringify(String(tabId))};document.querySelector('#sdk-tab').dispatchEvent(new Event('change'));`);
      const documentId = await until(() => evaluate(tool, '(()=>{const element=document.querySelector("#sdk-document");return [...element.options].find(option=>option.textContent.startsWith("frame 0 "))?.value;})()'), 'Chrome exact top document ID');
      await evaluate(tool, `document.querySelector('#sdk-document').value=${JSON.stringify(documentId)};document.querySelector('#sdk-document').dispatchEvent(new Event('change')); for(const input of document.querySelectorAll('[name="sdk-capability"]')) input.checked=${JSON.stringify(capabilities)}.includes(input.value); document.querySelector('#sdk-capabilities').dispatchEvent(new Event('change'));`);
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
      assert.equal(result.nativeInstall.documentId, documentId); assert.equal(result.nativeInstall.installed, true);
      session.documentId = documentId; return result;
    }
    async function snapshot() {
      return evaluate(tool, `(async()=>{const databases=await indexedDB.databases();const data=await new Promise((resolve,reject)=>{const request=indexedDB.open('opendesk-browser');request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,names=['commandJournal','runs','results','frameworkKV'],tx=db.transaction(names,'readonly'),rows={};for(const name of names){const cursor=tx.objectStore(name).openCursor();rows[name]=[];cursor.onsuccess=()=>{const item=cursor.result;if(item){rows[name].push({key:item.primaryKey,value:item.value});item.continue();}};}tx.oncomplete=()=>{db.close();resolve(rows);};tx.onabort=()=>reject(tx.error);};});return{databases,data,sessionStorage:await chrome.storage.session.get(null)};})()`);
    }
    async function stopWorker() {
      const version = await until(() => swEvents.flatMap(event => event.params.versions || []).filter(version => version.scriptURL === `chrome-extension://${extensionId}/sw.js` && version.runningStatus === 'running').at(-1), 'exact running product worker version');
      await tool.send('ServiceWorker.stopWorker', {versionId: version.versionId});
      await until(async () => !(await browserClient.send('Target.getTargets')).targetInfos.some(target => target.type === 'service_worker' && target.url === version.scriptURL), 'worker actually stopped');
      return version;
    }
    return {session, tool, page, decoy, browserClient, install, snapshot, stopWorker, stop, targetId, tabId};
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
    await caseRun('NATIVE-HELLO-GRANT-SUBSET-NO-CONTROLLER', async () => {
      const hello = await evaluate(page, 'OpenDeskSDK.ready()');
      assert.equal(hello.ready, true); assert.equal(hello.sdkVersion, '1.0.0');
      assert.deepEqual([...hello.methods].sort(), Object.entries(SDK_METHODS).filter(([, method]) => capabilities.includes(method.capability)).map(([name]) => name).sort());
      assert.equal(await evaluate(decoy, 'typeof OpenDeskSDK'), 'undefined');
      const snap = await first.snapshot(); assert(!snap.data.runs.some(row => row.value.tag !== 'sdk-service'));
      assert(snap.data.commandJournal.some(row => row.value.tag === 'sdk-grant' && row.value.documentId === installed.documentId && row.value.active));
      return {hello, decoyHasSdk: false, journal: snap.data.commandJournal, controllerRuns: []};
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
    const duplicatePayload = {requestId: `duplicate-${randomUUID()}`, method: 'AXIOS_POST', argsWire: encodeValue({url: `${origin}/echo?duplicate=${seed}`, data: {f: false, z: 0}}), deadlineAt: Date.now() + 30000};
    await caseRun('REAL-RELAY-NATIVE-DUPLICATE-AND-CONFLICT', async () => {
      const original = await evaluate(page, rawExpression(duplicatePayload)), duplicate = await evaluate(page, rawExpression(duplicatePayload));
      const conflict = await evaluate(page, rawExpression({...duplicatePayload, argsWire: encodeValue({url: `${origin}/echo?duplicate=${seed}`, data: {f: true}})}));
      assert.equal(original.ok, true); assert.deepEqual(duplicate, original); assert.equal(conflict.error.code, 'E_REQUEST_CONFLICT');
      const hits = serverEvents.filter(hit => hit.url.includes(`duplicate=${seed}`)); assert.equal(hits.length, 1); return {payload: duplicatePayload, original, duplicate, conflict, rawServer: hits};
    });
    await caseRun('NATIVE-100-CONCURRENT-SDK-PROMISES', async () => {
      const value = await evaluate(page, `Promise.all(Array.from({length:100},()=>(${sdkCall.toString()})('APPSTORAGE_GETITEM',{key:${JSON.stringify(persistentKey)}}))).then(values=>({values,diagnostics:OpenDeskSDK.diagnostics()}))`);
      assert.equal(value.values.length, 100); assert(value.values.every(result => result.ok && result.value === 'false')); assert.equal(value.diagnostics.pending, 0); return value;
    });
    await caseRun('SW-RESTART-AFTER-SERVER-EFFECT-UNKNOWN-NO-REPLAY', async () => {
      const token = `unknown-${seed}`, payload = {requestId: `unknown-${randomUUID()}`, method: 'AXIOS_POST', argsWire: encodeValue({url: `${origin}/hold?token=${token}`, data: {effect: true}}), deadlineAt: Date.now() + 30000};
      await evaluate(page, `globalThis.__unknownPromise=${rawExpression(payload)}.then(value=>{globalThis.__unknownResult=value;return value;});true`);
      await until(() => serverEvents.find(hit => hit.url.includes(`token=${token}`)), 'server actually observed POST effect');
      const stopped = await first.stopWorker();
      const res = heldResponses.get(token); if (res && !res.destroyed) { res.writeHead(200, {'content-type': 'application/json'}); res.end('{"effect":true}'); } heldResponses.delete(token);
      // A fresh legitimate page request wakes the new worker and its real recovery.
      const postRestartWake = await evaluate(page, callExpression('APPSTORAGE_GETITEM', {key: persistentKey}));
      assert(postRestartWake.ok);
      const replay = await evaluate(page, rawExpression(payload));
      assert.equal(replay.ok, false); assert.equal(replay.error.code, 'E_EFFECT_UNKNOWN');
      const snap = await first.snapshot(), operation = snap.data.commandJournal.find(row => row.value.requestId === payload.requestId && row.value.tag === 'sdk-operation');
      assert(operation); assert.equal(operation.value.state, 'effect_unknown'); assert.equal(operation.value.submissionCount, 1);
      const hits = serverEvents.filter(hit => hit.url.includes(`token=${token}`)); assert.equal(hits.length, 1);
      return {payload, stopped, postRestartWake, replay, operation, rawServer: hits, original: await evaluate(page, 'globalThis.__unknownResult || null')};
    });
    await caseRun('SESSION-AND-PERSISTENT-SURVIVE-SW-RESTART', async () => {
      const sessionValue = await evaluate(page, callExpression('APPLOCAL_GETITEM', {key: sessionKey})), persistentValue = await evaluate(page, callExpression('APPSTORAGE_GETITEM', {key: persistentKey}));
      assert(sessionValue.ok); assert.equal(sessionValue.value.f, false); assert.equal(sessionValue.value.z, 0); assert.equal(persistentValue.value, 'false'); return {sessionValue, persistentValue};
    });
    await caseRun('NATIVE-PERMISSION-REMOVAL-REVOKES-GRANT', async () => {
      const removed = await evaluate(tool, 'chrome.permissions.remove({origins:["http://127.0.0.1/*"]})'); assert.equal(removed, true);
      const value = await evaluate(page, callExpression('APPSTORAGE_SETITEM', {key: `${seed}-forbidden`, value: 'must-not-commit'}));
      assert.equal(value.ok, false); assert(['E_PERMISSION', 'E_GRANT_REVOKED'].includes(value.error.code));
      const snap = await first.snapshot(); assert(!snap.data.frameworkKV.some(row => row.value.key === `${seed}-forbidden`)); return {removed, value, grants: snap.data.commandJournal.filter(row => row.value.tag === 'sdk-grant')};
    });
    await caseRun('TRUSTED-UI-REGRANT-DOES-NOT-REPLAY-OLD-REQUEST', async () => {
      const install = await first.install(), old = await evaluate(page, rawExpression(duplicatePayload));
      assert.equal(old.ok, false); assert(['E_GRANT_REVOKED', 'E_DEADLINE', 'E_TIMEOUT'].includes(old.error.code));
      assert.equal(serverEvents.filter(hit => hit.url.includes(`duplicate=${seed}`)).length, 1);
      const fresh = await evaluate(page, callExpression('APPSTORAGE_GETITEM', {key: persistentKey})); assert.equal(fresh.value, 'false'); return {install, old, fresh};
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
    await writeFile(path.join(directory, 'native-session-1-snapshot.json'), JSON.stringify(await first.snapshot(), null, 2) + '\n');
    report.cases.push({id:'BROWSER-SESSION-END-PERSISTENT-SURVIVES-APPLOCAL-EXPIRES',status:'NOT_TESTED',
      reason:'Required global launcher creates and deletes a fresh profile per browser lifetime and forbids caller profile reuse; same-profile reopen is unavailable. No copied or personal profile is used.'});
  } catch (error) { report.error = errorProjection(error); }
  finally {
    if (current) await current.stop();
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
const sourceAfter = await fingerprintSource();
await writeFile(path.join(output, 'source-manifest-after.json'), JSON.stringify(sourceAfter, null, 2) + '\n');
const beforeSource = new Map(sourceFiles.map(file => [file.path, file])), afterSource = new Map(sourceAfter.map(file => [file.path, file]));
const sourceDrift = [...new Set([...beforeSource.keys(), ...afterSource.keys()])].filter(file => beforeSource.get(file)?.sha256 !== afterSource.get(file)?.sha256)
  .map(file => ({path: file, before: beforeSource.get(file) ?? null, after: afterSource.get(file) ?? null}));
const summary = {cwd: root, argv: process.argv, output, reports: reports.map(report => ({mode: report.mode, label: report.label, extensionId: report.extensionId, packageHash: report.packageBefore.packageHash, summary: report.summary, error: report.error, packageDrift: report.packageDrift})),
  sourceDrift, classification: sourceDrift.length || reports.some(report => report.packageDrift) ? 'diagnostic-drift' : 'targeted-native-current-package',
  serverClosed: true, finalProductPassed: false, f3Accepted: false, original603Closed: false,
  notClaimed: ['All original603 families', 'four native crash points', '1000 mixed rounds', '10 reconnect rounds', '2 plugin disables', 'independent same-final-package F3 review'],
  boundary: 'Current production/development package targeted native SDK evidence, original raw server/CDP/result/storage observations preserved'};
await writeFile(path.join(output, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary));
if (!reports.length || sourceDrift.length || reports.some(report => report.error || report.summary.FAIL || report.packageDrift || report.sessions.some(session => session.pidAliveAfterExit))) process.exitCode = 1;
else if (reports.some(report => report.cases.some(test => test.status !== 'PASS'))) process.exitCode = 3;
