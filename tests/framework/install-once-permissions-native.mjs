// Bounded real Chrome acceptance for installed Page authorization reuse.
// Product actions use actual Sidebar / Chrome WebUI controls through CDP Input.
// Evaluation is limited to read-only evidence and an original-function observer;
// no execution RPC, permission grant API, preference write or developerPrivate.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {createHash, randomUUID} from 'node:crypto';
import {spawn, execFileSync} from 'node:child_process';
import {connect, evaluate} from './sidebar-native-session.mjs';
import {verifyPackage, packageFingerprint} from '../../scripts/verify-package.mjs';

const root = process.cwd();
const out = path.resolve(process.env.OPENDESK_R31_EVIDENCE || 'docs/framework/evidence/install-once-r31-native');
const packageDir = path.resolve(process.env.OPENDESK_R31_PACKAGE_DIR || 'dist/development');
const binary = process.env.CHROME_FOR_TESTING_BIN;
const launcherPath = path.join(root, 'tests/framework/cft-isolated-launcher.py');
const launchFile = path.join(out, 'launcher.json');
const sha = value => createHash('sha256').update(value).digest('hex');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const ids = ['r31-auth-A', 'r31-auth-B'];
const installedMatches = ['*://*/*'];
const binding = '__opendeskR31Observe';
const marker = '__opendeskR31PermissionObservation';
const fixture = '<!doctype html><meta charset="utf-8"><title>OpenDesk R3.1 authorization fixture</title>' +
  '<style>body{font:20px system-ui;margin:32px}output{display:block;margin:20px 0;padding:12px;border:1px solid #777}</style>' +
  '<h1>OpenDesk R3.1</h1><p>Public synthetic fixture; no accounts or private data.</p><div id="fixture-ready">ready</div>';
const program = label => `async function main() {\n` +
  `  const id = "r31-page-proof-${label}";\n` +
  `  let node = document.getElementById(id);\n` +
  `  if (!node) { node = document.createElement("output"); node.id = id; node.dataset.count = "0"; document.body.append(node); }\n` +
  `  const count = Number(node.dataset.count) + 1;\n` +
  `  node.dataset.count = String(count); node.textContent = "${label}:" + count;\n` +
  `  return {program: "${label}", count, url: location.href};\n` +
  `}\n`;
const report = {
  schemaVersion: 1, suite: 'R3.1-installed-page-native', status: 'RUNNING', startedAt: new Date().toISOString(),
  tests: [], observations: [], permissionRequests: [], trustedInputs: [], checkpoints: [], documents: [],
  observerErrors: [], workerLifecycle: [], workerContexts: [], generations: [],
  limitations: [
    {case: 'Native Chrome site revocation / consent dialog / explicit restoration', status: 'NOT_TESTED'},
    {case: 'Real Chrome same-scope upgrade and scope-expansion confirmation', status: 'NOT_TESTED'},
    {case: 'Real Chrome adversarial cross-program calls / stale receipts / injected races', status: 'NOT_TESTED'},
    {case: 'Controller and local-project 20-run native loops', status: 'NOT_TESTED'},
    {case: 'Permission calls during browser startup before observer attachment', status: 'NOT_OBSERVED',
      reason: 'The request observer is armed before every measured action and navigation; persisted startup state is independently read.'}
  ]
};
let client, worker, panel, settings, page, launcher, origin, extensionId, generation = 1;
let signalError = null;
const sessions = new Map(), observerById = new Map(), versions = new Map(), workerContexts = new Map();
const launchStatus = {closed: false, code: null, signal: null, error: null};
fs.mkdirSync(out, {recursive: true});
assert.ok(!fs.existsSync(path.join(out, 'acceptance.json')) && !fs.existsSync(launchFile), 'Use a fresh evidence directory');
const save = (name, value) => fs.writeFileSync(path.join(out, name), JSON.stringify(value, null, 2) + '\n');
const record = (kind, detail) => {
  const row = {at: new Date().toISOString(), kind, generation, ...detail};
  fs.appendFileSync(path.join(out, 'events.jsonl'), JSON.stringify(row) + '\n');
  return row;
};
const failed = error => ({name: String(error?.name || 'Error'), message: String(error?.message || error).slice(0, 2500),
  stack: typeof error?.stack === 'string' ? error.stack.slice(0, 4000) : null});
function checkSignal() { if (signalError) throw signalError; }
for (const name of ['SIGINT', 'SIGTERM']) process.on(name, () => { signalError = new Error('Driver received ' + name); });
async function until(fn, label, timeout = 20000) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    checkSignal();
    try { const result = await fn(); if (result) return result; } catch (error) { last = error; }
    await pause(100);
  }
  throw new Error(label + ' timed out' + (last ? ': ' + failed(last).message : ''));
}
function pass(name, evidence) { report.tests.push({name, status: 'PASS', ...evidence}); record('test-pass', {name}); }

async function endpointFor(metadata) {
  return until(async () => {
    assert.ok(!launchStatus.closed, 'Launcher remains alive');
    const lines = fs.readFileSync(path.join(metadata.profile, 'DevToolsActivePort'), 'utf8').trim().split('\n');
    const port = Number(lines[0]);
    assert.ok(Number.isInteger(port) && port > 0 && port < 65536, 'OS-assigned CDP port');
    assert.match(lines[1], /^\/devtools\/browser\/[A-Za-z0-9-]+$/);
    const response = await fetch('http://127.0.0.1:' + port + '/json/version', {signal: AbortSignal.timeout(3000)});
    const actual = await response.json();
    const endpoint = 'ws://127.0.0.1:' + port + lines[1];
    assert.equal(actual.webSocketDebuggerUrl, endpoint, 'Live endpoint matches the owned profile port file');
    assert.notEqual(port, Number(new URL(origin).port), 'HTTP and CDP use separate OS-assigned ports');
    return endpoint;
  }, 'owned loopback CDP endpoint');
}
function validateMetadata(metadata, previous) {
  assert.ok(Number.isSafeInteger(metadata.pid) && metadata.pid > 0);
  assert.equal(metadata.launcherPid, launcher.pid);
  assert.equal(metadata.executable, fs.realpathSync(binary));
  assert.equal(metadata.generation, generation);
  assert.equal(metadata.args.filter(arg => arg.startsWith('--remote-debugging-port')).join(), '--remote-debugging-port=0');
  for (const flag of ['--remote-debugging-address=127.0.0.1', '--use-mock-keychain', '--password-store=basic',
    '--user-data-dir=' + metadata.profile, '--load-extension=' + packageDir, '--disable-extensions-except=' + packageDir])
    assert.ok(metadata.args.includes(flag), 'Launcher retains ' + flag.split('=')[0]);
  assert.ok(!metadata.args.some(arg => arg === '--no-sandbox' || arg.startsWith('--headless')), 'Real headed Chrome retains sandbox');
  const info = fs.lstatSync(metadata.profile);
  assert.ok(info.isDirectory() && !info.isSymbolicLink());
  assert.equal(info.mode & 0o777, 0o700);
  assert.equal(info.dev, metadata.profileDevice);
  assert.equal(info.ino, metadata.profileInode);
  if (previous) {
    assert.equal(metadata.profile, previous.profile);
    assert.equal(metadata.profileDevice, previous.profileDevice);
    assert.equal(metadata.profileInode, previous.profileInode);
    assert.deepEqual(metadata.args, previous.args);
    assert.notEqual(metadata.pid, previous.pid);
    assert.deepEqual(metadata.restartObserved, {previousPid: previous.pid, previousReturncode: 0, sameProfile: true, sameArguments: true});
  }
  report.generations.push(metadata);
}
async function connectGeneration(metadata) {
  const connectionGeneration = generation;
  const endpoint = await endpointFor(metadata);
  client = await connect(endpoint, {onEvent(message) {
    // Passive native CDP evidence; never re-execute after an unknown effect.
    // Only the dedicated CFT fixture is observed, and strings are bounded.
    if(['Runtime.exceptionThrown','Runtime.consoleAPICalled'].includes(message.method)) {
      const observedTarget=[...sessions.values()].find(v=>v.generation===connectionGeneration &&
        v.sessionId===message.sessionId);
      const details=message.params?.exceptionDetails;
      const consoleError=message.method==='Runtime.consoleAPICalled'&&
        ['error','warning'].includes(message.params?.type);
      if(observedTarget&&(details||consoleError)){
        const exceptions=report.nativeScriptErrors??=([]);
        if(exceptions.length<30){
          const entry={generation:connectionGeneration,targetType:observedTarget.type,
            targetId:observedTarget.targetId,kind:message.method,
            text:String(details?.text||message.params?.type||'').slice(0,512),
            description:String(details?.exception?.description||'').slice(0,2048),
            url:String(details?.url||'').slice(0,256),
            line:details?.lineNumber??null,column:details?.columnNumber??null,
            consoleArgs:(message.params?.args||[]).slice(0,3).map(v=>
              String(v?.value??v?.description??'').slice(0,384))};
          exceptions.push(record('native-script-error',entry));
        }
      }
    }
    if (['Runtime.executionContextCreated', 'Runtime.executionContextDestroyed', 'Runtime.executionContextsCleared'].includes(message.method)) {
      const target = [...sessions.values()].find(value => value.generation === connectionGeneration &&
        value.sessionId === message.sessionId && value.type === 'service_worker');
      if (target) {
        const key = connectionGeneration + ':' + message.sessionId;
        if (!workerContexts.has(key)) workerContexts.set(key, new Map());
        const contexts = workerContexts.get(key);
        const common = {targetId: target.targetId, sessionId: message.sessionId, connectionGeneration};
        if (message.method === 'Runtime.executionContextCreated') {
          const {id, uniqueId, origin} = message.params.context;
          const context = {id, uniqueId, origin};
          contexts.set(id, context);
          report.workerContexts.push(record('worker-context-created', {...common, context}));
        } else if (message.method === 'Runtime.executionContextDestroyed') {
          contexts.delete(message.params.executionContextId);
          report.workerContexts.push(record('worker-context-destroyed', {...common,
            id: message.params.executionContextId, uniqueId: message.params.executionContextUniqueId}));
        } else {
          contexts.clear();
          report.workerContexts.push(record('worker-contexts-cleared', common));
        }
      }
    }
    if (message.method === 'ServiceWorker.workerVersionUpdated') {
      for (const value of message.params.versions) {
        if (!extensionId || value.scriptURL === 'chrome-extension://' + extensionId + '/sw.js') {
          versions.set(value.versionId, value);
          report.workerLifecycle.push(record('worker-version', {versionId: value.versionId, targetId: value.targetId,
            runningStatus: value.runningStatus, status: value.status, connectionGeneration}));
        }
      }
    }
    if (message.method !== 'Runtime.bindingCalled' || message.params.name !== binding) return;
    let value;
    try { value = JSON.parse(message.params.payload); } catch { report.observerErrors.push('Invalid observation payload'); return; }
    const observation = observerById.get(value.observationId);
    if (!observation || observation.sessionId !== message.sessionId || observation.generation !== connectionGeneration) {
      report.observerErrors.push('Unexpected observer identity / session'); return;
    }
    const common = {observationId: observation.observationId, targetId: observation.targetId, targetType: observation.targetType,
      sessionId: message.sessionId, connectionGeneration, browserTime: value.at};
    if (value.kind === 'permission-request') {
      report.permissionRequests.push(record('permissions.request', {...common, index: value.index}));
    } else if (value.kind === 'input') {
      report.trustedInputs.push(record('native-input', {...common, eventType: value.eventType, id: value.id, isTrusted: value.isTrusted}));
    } else if (value.kind !== 'armed') report.observerErrors.push('Unknown observation kind');
  }});
  await client.send('Target.setDiscoverTargets', {discover: true});
  const version = await client.send('Browser.getVersion');
  assert.match(version.product, /Chrome\/155\.0\.8059\.39$/);
  record('browser-connected', {pid: metadata.pid, product: version.product, protocolVersion: version.protocolVersion});
  report.generations.at(-1).version = version;
}
async function targets() { return (await client.send('Target.getTargets')).targetInfos; }
async function sessionFor(target) {
  const key = generation + ':' + target.targetId;
  if (sessions.has(key)) return sessions.get(key);
  const attached = await client.send('Target.attachToTarget', {targetId: target.targetId, flatten: true});
  const result = {...target, sessionId: attached.sessionId, generation, retired: false};
  sessions.set(key, result);
  await client.send('Runtime.enable', {}, result.sessionId);
  return result;
}
async function newPage(url) {
  const created = await client.send('Target.createTarget', {url});
  const target = await until(async () => (await targets()).find(t => t.targetId === created.targetId), 'new native page target');
  const result = await sessionFor(target);
  await client.send('Page.enable', {}, result.sessionId);
  return result;
}
async function findWorker() {
  const target = await until(async () => (await targets()).find(t => t.type === 'service_worker' &&
    (extensionId ? t.url === 'chrome-extension://' + extensionId + '/sw.js' : /^chrome-extension:\/\/[^/]+\/sw\.js$/.test(t.url))), 'extension worker');
  extensionId ||= new URL(target.url).host;
  worker = await sessionFor(target);
  await arm(worker);
  return worker;
}
async function observedWorkerContext(target, observationId) {
  return until(async () => {
    const contexts = workerContexts.get(generation + ':' + target.sessionId);
    for (const context of contexts?.values() || []) {
      if (typeof context.uniqueId !== 'string' || !context.uniqueId) continue;
      try {
        // Bind the observer to a native context identity; target / session IDs
        // can survive a real Service Worker stop and restart.
        const result = await client.send('Runtime.evaluate', {
          expression: `globalThis.${marker}?.id===${JSON.stringify(observationId)}`,
          uniqueContextId: context.uniqueId, returnByValue: true
        }, target.sessionId);
        if (!result.exceptionDetails && result.result?.value === true) return {...context};
      } catch { /* A retired context is not proof; await the new native event. */ }
    }
    return null;
  }, 'native Worker execution context for current observer');
}
async function arm(target) {
  const previous = await evaluate(client, `(()=>{const o=globalThis.${marker};return o?{id:o.id,count:o.count}:null})()`, target.sessionId);
  if (previous) {
    assert.ok(observerById.has(previous.id), 'No untracked prior observer');
    return;
  }
  // A Side Panel may navigate within the same CDP target / session. Retain its
  // old raw binding events and retire that document before arming the new one.
  for (const observation of report.observations) if (observation.generation === generation &&
    observation.sessionId === target.sessionId && !observation.retiredAt) {
    observation.retiredAt = new Date().toISOString();
    observation.retiredReason = 'document-replaced';
  }
  // CDP can expose a Worker target before Chrome installs extension APIs into
  // its execution context. Wait for the real API; never synthesize a permission grant.
  const permissionsProbe = 'typeof globalThis.chrome?.permissions?.request === "function"';
  const available = target.type === 'service_worker'
    ? await until(() => evaluate(client, permissionsProbe, target.sessionId),
      'real Chrome Worker permissions API readiness', 10000)
    : await evaluate(client, permissionsProbe, target.sessionId);
  if (!available) {
    assert.notEqual(target.type, 'service_worker', 'Worker must expose the real permissions API');
    return;
  }
  const observationId = randomUUID();
  const observation = {observationId, generation, targetId: target.targetId, targetType: target.type,
    sessionId: target.sessionId, startedAt: new Date().toISOString(), retiredAt: null, lastCount: 0};
  observerById.set(observationId, observation);
  report.observations.push(observation);
  await client.send('Runtime.addBinding', {name: binding}, target.sessionId);
  const armed = await evaluate(client, `(()=>{
    const original=chrome.permissions.request;
    const o={id:${JSON.stringify(observationId)},count:0,dropped:0,wrapper:null};
    const emit=value=>{try{globalThis.${binding}(JSON.stringify({observationId:o.id,at:Date.now(),...value}));}catch{o.dropped++;}};
    // Do not inspect arguments, await the result, wrap callbacks or replace
    // errors. Reflect.apply returns exactly the original API's result.
    o.wrapper=function(...args){o.count++;emit({kind:'permission-request',index:o.count});return Reflect.apply(original,this,args);};
    chrome.permissions.request=o.wrapper;
    globalThis.${marker}=o;
    if(typeof document!=='undefined')for(const eventType of ['input','change','click'])document.addEventListener(eventType,event=>{
      const id=event.target?.id;
      if(typeof id==='string'&&/^(script-|page-|tab-develop$)/.test(id))emit({kind:'input',eventType,id,isTrusted:event.isTrusted});
    },true);
    emit({kind:'armed'});
    return {id:o.id,installed:chrome.permissions.request===o.wrapper};
  })()`, target.sessionId);
  assert.equal(armed.id, observationId);
  assert.equal(armed.installed, true, 'Original-function request observer is active');
  record('observer-armed', {observationId, targetId: target.targetId, targetType: target.type});
}
async function syncObservers() {
  const live = await targets(), present = new Set(live.map(t => t.targetId));
  for (const observation of report.observations) if (observation.generation === generation && !observation.retiredAt && !present.has(observation.targetId))
    observation.retiredAt = new Date().toISOString();
  for (const target of live.filter(t => t.url.startsWith('chrome-extension://' + extensionId + '/') &&
    ['service_worker', 'page', 'other', 'background_page', 'iframe'].includes(t.type))) await arm(await sessionFor(target));
}
async function checkpoint(label) {
  await syncObservers();
  for (const observation of report.observations.filter(o => o.generation === generation && !o.retiredAt)) {
    const actual = await evaluate(client, `(()=>{const o=globalThis.${marker};return o?{id:o.id,count:o.count,dropped:o.dropped,
      intact:chrome.permissions.request===o.wrapper}:null})()`, observation.sessionId);
    assert.ok(actual && actual.id === observation.observationId, 'Observer context identity remains stable');
    assert.equal(actual.intact, true, 'Observer still delegates to the captured original function');
    assert.equal(actual.dropped, 0, 'No observation events were lost');
    assert.equal(actual.count, report.permissionRequests.filter(row => row.observationId === observation.observationId).length,
      'Immediate raw bindings and local call count agree');
    observation.lastCount = actual.count;
  }
  assert.deepEqual(report.observerErrors, []);
  assert.equal(report.permissionRequests.length, 0, 'No measured path may call permissions.request');
  const row = {label, at: new Date().toISOString(), generation, callsAcrossAllContexts: report.permissionRequests.length,
    observations: report.observations.map(o => ({observationId: o.observationId, generation: o.generation, targetType: o.targetType,
      count: o.lastCount, retiredAt: o.retiredAt}))};
  report.checkpoints.push(row);
  save('permission-observations.json', {observations: report.observations, requests: report.permissionRequests,
    checkpoints: report.checkpoints, errors: report.observerErrors});
  record('checkpoint', {label, callsAcrossAllContexts: row.callsAcrossAllContexts});
}
async function click(target, expression) {
  const handle = await client.send('Runtime.evaluate', {expression, returnByValue: false}, target.sessionId);
  assert.ok(handle.result?.objectId, 'Actual native control exists');
  try {
    await client.send('DOM.scrollIntoViewIfNeeded', {objectId: handle.result.objectId}, target.sessionId);
    // A Side Panel context can exist before its first visible layout. Wait
    // read-only for a usable control before sending exactly one native click.
    const box = await until(async () => {
      const current = await evaluate(client, `(()=>{const n=(${expression});if(!n||n.disabled)return null;
        const r=n.getBoundingClientRect(),s=getComputedStyle(n);
        return {x:r.x+r.width/2,y:r.y+r.height/2,width:r.width,height:r.height,visibility:s.visibility};})()`, target.sessionId);
      const ready = current && current.width > 0 && current.height > 0 && current.x > 0 && current.y > 0 && current.visibility === 'visible';
      save('native-control-latest.json', {expression, targetId: target.targetId, box: current, ready: Boolean(ready)});
      record('native-control-observed', {expression, targetId: target.targetId, box: current, ready: Boolean(ready)});
      return ready ? current : null;
    }, 'visible enabled native control: ' + expression);
    assert.ok(box && box.width > 0 && box.height > 0 && box.x > 0 && box.y > 0, 'Visible enabled native control');
    for (const type of ['mousePressed', 'mouseReleased']) await client.send('Input.dispatchMouseEvent',
      {type, x: box.x, y: box.y, button: 'left', clickCount: 1}, target.sessionId);
  } finally { await client.send('Runtime.releaseObject', {objectId: handle.result.objectId}, target.sessionId); }
}
const node = selector => 'document.querySelector(' + JSON.stringify(selector) + ')';
async function clickId(target, id) { await click(target, node('#' + id)); }
async function openDetails(id) {
  if (!await evaluate(client, node('#' + id) + '.open', panel.sessionId)) await click(panel, node('#' + id + ' > summary'));
  assert.equal(await evaluate(client, node('#' + id) + '.open', panel.sessionId), true);
}
async function fill(id, value) {
  await clickId(panel, id);
  for (const type of ['rawKeyDown', 'keyUp']) await client.send('Input.dispatchKeyEvent',
    {type, key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 4, ...(type === 'rawKeyDown' ? {commands: ['selectAll']} : {})}, panel.sessionId);
  await client.send('Input.insertText', {text: value}, panel.sessionId);
  // Hash-only assertion avoids putting source bytes into failure logs.
  assert.equal(sha(await evaluate(client, node('#' + id) + '.value', panel.sessionId)), sha(value), 'Native input received expected fixture bytes: ' + id);
}
async function buttonReady(id) {
  return until(() => evaluate(client, 'Boolean(' + node('#' + id) + '&&!'+node('#' + id)+'.disabled)', panel.sessionId), id + ' enabled');
}
async function screenshot(target, name) {
  const value = await client.send('Page.captureScreenshot', {format: 'png'}, target.sessionId);
  fs.writeFileSync(path.join(out, name), Buffer.from(value.data, 'base64'));
}
async function state() {
  return evaluate(client, `(async()=>{
    const programIds=${JSON.stringify(ids)},rows=[];
    for(const info of await indexedDB.databases()){
      if(!info.name)continue;
      const db=await new Promise((resolve,reject)=>{const request=indexedDB.open(info.name);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
      try{if(db.objectStoreNames.contains('frameworkKV'))rows.push(...await new Promise((resolve,reject)=>{
        const request=db.transaction('frameworkKV','readonly').objectStore('frameworkKV').getAll();request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error); }));}finally{db.close();}
    }
    const project=(row,keys)=>Object.fromEntries(keys.filter(key=>row[key]!==undefined).map(key=>[key,row[key]]));
    const installs=rows.filter(row=>row.tag==='page-installed-v1'&&programIds.includes(row.programId)).map(row=>({
      ...project(row,['programId','revision','manifestHash','sourceHash','pageRules','enabled','nativeId','nativeState','authorization']),
      errorCode:row.error?.code??null})).sort((a,b)=>a.programId.localeCompare(b.programId));
    const executions=rows.filter(row=>row.tag==='page-execution-v1'&&programIds.includes(row.programId)).map(row=>({
      ...project(row,['receiptId','programId','revision','manifestHash','sourceHash','installationId','grantGeneration','executionKey',
        'browserSessionIncarnation','tabId','documentId','state','createdAt','finishedAt']),errorCode:row.error?.code??null}))
      .sort((a,b)=>a.programId.localeCompare(b.programId)||String(a.documentId).localeCompare(String(b.documentId))||String(a.receiptId).localeCompare(String(b.receiptId)));
    const verifications=rows.filter(row=>row.tag==='page-verification-v1'&&programIds.includes(row.programId)).map(row=>({
      ...project(row,['programId','revision','manifestHash','sourceHash','status','receiptHash']),
      receipt:project(row.receipt??{},['state','world','sourceHash','documentId'])})).sort((a,b)=>a.programId.localeCompare(b.programId));
    const nativeScripts=(await chrome.userScripts.getScripts()).map(row=>project(row,['id','matches','excludeMatches','world','worldId','allFrames','runAt']))
      .sort((a,b)=>a.id.localeCompare(b.id));
    return {installs,executions,verifications,nativeScripts,permissions:await chrome.permissions.getAll(),
      browserSessionIncarnation:(await chrome.storage.session.get('browserSessionIncarnation')).browserSessionIncarnation};
  })()`, worker.sessionId);
}
function grants(snapshot) {
  return snapshot.installs.map(row => ({programId: row.programId, revision: row.revision, manifestHash: row.manifestHash,
    sourceHash: row.sourceHash, pageRules: row.pageRules, enabled: row.enabled, authorization: row.authorization}));
}
function assertInstalled(snapshot, {bDisabled = false} = {}) {
  assert.equal(typeof snapshot.browserSessionIncarnation, 'string', 'Read the real Broker browser session identity');
  assert.ok(snapshot.browserSessionIncarnation.length > 0, 'Browser session identity is nonempty');
  assert.equal(snapshot.installs.length, 2);
  for (const [index, label] of ['A', 'B'].entries()) {
    const row = snapshot.installs[index];
    assert.equal(row.programId, ids[index]); assert.equal(row.revision, 1); assert.equal(row.sourceHash, sha(program(label)));
    assert.deepEqual(row.pageRules, {matches: ['*://*/*'], excludeMatches: [], runAt: 'document_idle', allFrames: false, world: 'USER_SCRIPT'});
    assert.equal(row.authorization.tag, 'page-install-authorization-v1');
    assert.ok(row.authorization.installationId && Number.isSafeInteger(row.authorization.generation));
    assert.equal(row.enabled, !(bDisabled && label === 'B'), 'Persisted enablement is unchanged: ' + row.programId);
    assert.equal(row.authorization.status, bDisabled && label === 'B' ? 'disabled' : 'active');
    if (row.enabled) assert.equal(row.nativeState, 'registered');
    assert.equal(snapshot.nativeScripts.some(script => script.id === row.nativeId), row.enabled,
      'Actual Chrome registration matches persisted enablement: ' + row.programId);
  }
  assert.notEqual(snapshot.installs[0].authorization.installationId, snapshot.installs[1].authorization.installationId);
  assert.notEqual(snapshot.installs[0].nativeId, snapshot.installs[1].nativeId);
}
async function install(label) {
  const programId = 'r31-auth-' + label;
  await openDetails('script-library-tools');
  await fill('script-id', programId); await fill('script-revision', '1'); await fill('script-source', program(label));
  await openDetails('page-preview-tools');
  await buttonReady('page-preview-run'); await clickId(panel, 'page-preview-run');
  // Observe the actual UI state from the same trusted Side Panel target:
  // a native error must not be mislabeled as a 20-second timer failure.
  // Read only the fixed fixture status/result elements; do not record user source.
  let observedPreviewStatus;
  const previewOutcome=await until(async()=>{
    const raw=await evaluate(client,
      '(()=>{const n=document.querySelector("#page-preview-status");return {'+
      'state:n?.dataset.state||null,message:String(n?.textContent||"").slice(0,512),'+
      'result:String(document.querySelector("#page-preview-result")?.textContent||"").slice(0,512)}})()',
      panel.sessionId);
    observedPreviewStatus=raw;
    return ['completed','error'].includes(raw?.state)?raw:null;
  },'plain JS actual Page preview').catch(error=>{
    record('page-preview-stalled',{...observedPreviewStatus});
    throw new Error(error.message+': '+JSON.stringify(observedPreviewStatus));
  });
  const observedEditorSource=await evaluate(client,node('#script-source')+'.value',panel.sessionId);
  const documentEffectCount=await evaluate(client,
    'document.getElementById('+JSON.stringify('r31-page-proof-'+label)+')?.dataset.count||null',page.sessionId);
  record('page-preview-terminal',{...previewOutcome,
    sourceMatches:observedEditorSource===program(label),
    sourceSha256:sha(observedEditorSource),expectedSourceSha256:sha(program(label)),
    documentEffectCount});
  assert.equal(previewOutcome.state,'completed',
    'Actual USER_SCRIPT preview was rejected: '+JSON.stringify(previewOutcome));
  await buttonReady('page-candidate-save'); await clickId(panel, 'page-candidate-save');
  await until(() => evaluate(client, node('#page-program-list') + '.value===' + JSON.stringify(programId + ':1'), panel.sessionId), 'saved exact Page candidate selected');
  await buttonReady('page-program-verify'); await clickId(panel, 'page-program-verify');
  await buttonReady('page-program-install');
  const displayedScope = await evaluate(client, node('#page-program-detail') + '.textContent', panel.sessionId);
  assert.ok(displayedScope.includes('匹配：' + installedMatches.join('、')), 'Install UI discloses the actual all-HTTP(S) scope');
  assert.ok(displayedScope.includes('不继承扩展、其他程序或独立网页 SDK 的权限'), 'Install UI discloses the program capability boundary');
  const before = await evaluate(client, node('#r31-page-proof-' + label) + '?.dataset.count', page.sessionId);
  assert.equal(before, '2', 'Preview and explicit frozen-version Verify each execute exactly once');
  await clickId(panel, 'page-program-install');
  const installed = await until(async () => {
    const snapshot = await state(), row = snapshot.installs.find(item => item.programId === programId);
    return row?.nativeState === 'registered' ? snapshot : null;
  }, 'actual USER_SCRIPT registration from native Install click');
  await buttonReady('page-program-toggle');
  assert.equal(await evaluate(client, node('#r31-page-proof-' + label) + '?.dataset.count', page.sessionId), before, 'Install does not replay current document');
  const verification = installed.verifications.find(row => row.programId === programId);
  assert.equal(verification.receipt.world, 'USER_SCRIPT'); assert.equal(verification.receipt.state, 'preview-evaluated');
  assert.equal(verification.sourceHash, sha(program(label)));
  await checkpoint('installed-' + label);
  record('installed-fixture', {programId, revision: 1, sourceHash: sha(program(label)), verificationReceiptHash: verification.receiptHash,
    displayedMatchesBeforeTrustedInstall: installedMatches, capabilityBoundaryDisplayed: true});
}
async function runDocument(number, baselineGrants) {
  await checkpoint('before-document-' + number);
  const url = origin + '/demo-form.html?run=' + number;
  const previous = new Set(report.documents.map(row => row.documentId));
  await client.send('Page.navigate', {url}, page.sessionId);
  const snapshot = await until(async () => {
    const dom = await evaluate(client, `({url:location.href,a:document.querySelector('#r31-page-proof-A')?.dataset.count,
      b:document.querySelector('#r31-page-proof-B')?.dataset.count,ready:document.readyState})`, page.sessionId);
    if (dom.url !== url || dom.ready !== 'complete' || dom.a !== '1') return null;
    assert.equal(dom.b, undefined, 'Disabled B must not execute in a fresh document');
    const current = await state();
    if (current.executions.length !== number || !current.executions.every(row => row.state === 'completed')) return null;
    assert.ok(current.executions.every(row => row.programId === ids[0]), 'A cannot resurrect B authorization');
    return current;
  }, 'installed auto-run #' + number, 30000);
  assertInstalled(snapshot, {bDisabled: true}); assert.deepEqual(grants(snapshot), baselineGrants);
  const fresh = snapshot.executions.filter(row => !previous.has(row.documentId));
  assert.equal(fresh.length, 1, 'One durable receipt for exactly one new document');
  const receipt = fresh[0], installed = snapshot.installs[0];
  assert.equal(receipt.installationId, installed.authorization.installationId);
  assert.equal(receipt.grantGeneration, installed.authorization.generation);
  assert.equal(receipt.sourceHash, installed.sourceHash); assert.equal(receipt.manifestHash, installed.manifestHash);
  const actualFrame = await evaluate(client, 'chrome.webNavigation.getFrame({documentId:' + JSON.stringify(receipt.documentId) + '})', worker.sessionId);
  assert.ok(actualFrame); assert.equal(actualFrame.url, url);
  report.documents.push({number, generation, ...receipt, url, actualFrame: {documentId: actualFrame.documentId,
    documentLifecycle: actualFrame.documentLifecycle, frameType: actualFrame.frameType, url: actualFrame.url}});
  await checkpoint('after-document-' + number);
  save('document-' + String(number).padStart(2, '0') + '.json', {number, generation, snapshot, receipt: report.documents.at(-1)});
  record('document-completed', {number, receiptId: receipt.receiptId, documentId: receipt.documentId, programId: receipt.programId,
    installationId: receipt.installationId, browserSessionIncarnation: receipt.browserSessionIncarnation, permissionsRequestCalls: report.permissionRequests.length});
  return snapshot;
}

const server = http.createServer((request, response) => {
  response.writeHead(200, {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store'}); response.end(fixture);
});
try {
  assert.equal(process.platform, 'darwin', 'This owned headed CFT driver targets the existing macOS CI lane');
  assert.ok(binary && fs.existsSync(binary), 'CHROME_FOR_TESTING_BIN is required');
  const binaryVersion = execFileSync(binary, ['--version'], {encoding: 'utf8', timeout: 10000}).trim();
  assert.match(binaryVersion, /155\.0\.8059\.39$/);
  report.sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim();
  report.package = await verifyPackage(packageDir);
  report.inputs = Object.fromEntries(['tests/framework/install-once-permissions-native.mjs', 'tests/framework/cft-isolated-launcher.py',
    'tests/framework/k5-sdk-native-restart.py', 'tests/framework/sidebar-native-session.mjs'].map(file => [file, sha(fs.readFileSync(path.join(root, file)))]));
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  origin = 'http://127.0.0.1:' + server.address().port;
  report.fixture = {origin, sha256: sha(fixture), programHashes: {A: sha(program('A')), B: sha(program('B'))}};
  launcher = spawn('/usr/bin/python3', [launcherPath, '--executable', binary, '--report', launchFile, '--same-profile-restart',
    '--remote-debugging-port=0', '--no-first-run', '--no-default-browser-check', '--disable-sync', '--disable-background-networking',
    '--disable-extensions-except=' + packageDir, '--load-extension=' + packageDir, 'about:blank'], {stdio: ['pipe', 'pipe', 'pipe']});
  launcher.stdout.on('data', bytes => fs.appendFileSync(path.join(out, 'launcher-stdout.jsonl'), bytes));
  launcher.stderr.on('data', bytes => fs.appendFileSync(path.join(out, 'launcher-stderr.log'), bytes));
  launcher.stdin.on('error', error => { launchStatus.error = failed(error); });
  launcher.on('error', error => { launchStatus.error = failed(error); launchStatus.closed = true; });
  launcher.on('close', (code, signal) => Object.assign(launchStatus, {closed: true, code, signal}));
  const first = await until(() => { assert.ok(!launchStatus.closed); return JSON.parse(fs.readFileSync(launchFile, 'utf8')); }, 'launcher generation 1');
  validateMetadata(first); await connectGeneration(first); await findWorker();
  settings = await newPage('chrome://extensions/?id=' + extensionId);
  await client.send('Target.activateTarget', {targetId: settings.targetId});
  const detail = 'document.querySelector("extensions-manager")?.shadowRoot?.querySelector("extensions-detail-view")';
  const toggle = '(' + detail + ')?.shadowRoot?.querySelector("#allow-user-scripts")?.shadowRoot?.querySelector("cr-toggle#crToggle")';
  await until(() => evaluate(client, '(' + detail + ')?.data?.id===' + JSON.stringify(extensionId) + '&&(' + toggle + ')!=null', settings.sessionId), 'real Chrome User Scripts control');
  assert.equal(await evaluate(client, '(' + detail + ').shadowRoot.querySelector("#name").textContent.trim()', settings.sessionId), 'OpenDesk Browser');
  if (!await evaluate(client, '(' + toggle + ').checked', settings.sessionId)) await click(settings, toggle);
  await until(() => evaluate(client, '(' + toggle + ').checked===true', settings.sessionId), 'trusted Chrome User Scripts opt-in');
  await screenshot(settings, 'user-scripts-opt-in.png');
  await findWorker();
  await until(() => evaluate(client, 'chrome.userScripts.getScripts().then(()=>true)', worker.sessionId), 'real USER_SCRIPT API availability');
  assert.equal(await evaluate(client, 'chrome.permissions.contains({origins:["*://*/*"]})', worker.sessionId), true,
    'Extension installation already supplies this site permission');
  await checkpoint('user-scripts-enabled');
  page = await newPage(origin + '/demo-form.html?setup=1');
  await until(() => evaluate(client, 'document.readyState==="complete"&&Boolean(document.querySelector("#fixture-ready"))', page.sessionId), 'fixture document ready');
  const actionTab = await until(async () => (await client.send('Target.getTargets', {filter: [{type: 'tab', exclude: false}, {exclude: true}]})).targetInfos
    .find(target => target.type === 'tab' && target.url === origin + '/demo-form.html?setup=1'), 'real browser action tab');
  await client.send('Target.activateTarget', {targetId: actionTab.targetId});
  await client.send('Extensions.triggerAction', {id: extensionId, targetId: actionTab.targetId});
  const context = await until(async () => (await evaluate(client, 'chrome.runtime.getContexts({contextTypes:["SIDE_PANEL"]})', worker.sessionId))
    .find(row => row.documentUrl.includes('/ui/tool.html?')), 'actual Side Panel context');
  const panelTarget = await until(async () => (await targets()).find(target => target.url === context.documentUrl), 'Side Panel CDP target');
  panel = await sessionFor(panelTarget); await arm(panel);
  report.sidePanel = {contextType: context.contextType, documentId: context.documentId, targetId: panelTarget.targetId};
  await clickId(panel, 'tab-develop');
  await until(() => evaluate(client, node('#script-current-page-status') + '.dataset.state==="available"', panel.sessionId), 'Sidebar current-page authority');
  await checkpoint('before-install');
  await install('A'); await install('B');
  const both = await state(); assertInstalled(both);
  assert.equal(await evaluate(client, node('#page-program-list') + '.value', panel.sessionId), ids[1] + ':1');
  await clickId(panel, 'page-program-toggle');
  // The durable deny fence intentionally precedes asynchronous Chrome
  // unregister. Observe the completed operation, not its intermediate row.
  const disabled = await until(async () => {
    const current = await state(), row = current.installs.find(item => item.programId === ids[1]);
    const ready = row?.enabled === false && row.authorization?.status === 'disabled' &&
      row.nativeState === 'disabled' && !row.errorCode && !current.nativeScripts.some(script => script.id === row.nativeId);
    save('disable-b-latest.json', current);
    record('disable-registration-observed', {programId: ids[1], enabled: row?.enabled, status: row?.authorization?.status,
      nativeState: row?.nativeState, nativePresent: current.nativeScripts.some(script => script.id === row?.nativeId), ready});
    return ready ? current : null;
  }, 'trusted disable B and confirmed Chrome unregister');
  await buttonReady('page-program-toggle');
  assertInstalled(disabled, {bDisabled: true});
  assert.equal(disabled.executions.length, 0, 'Preview / Verify / Install never create installed auto-run receipts');
  const baselineGrants = grants(disabled); save('installation-baseline.json', disabled);
  pass('real-plain-JS-save-verify-install-and-independent-program-identities', {programs: baselineGrants.map(row => ({programId: row.programId,
    installationId: row.authorization.installationId, status: row.authorization.status})), sourceUnmodified: true,
    generatedPattern: '*://*/*', patternNote: 'The default Chrome site pattern covers all HTTP(S) domains; this native fixture uses one assigned origin.'});
  let snapshot;
  for (let number = 1; number <= 20; number++) snapshot = await runDocument(number, baselineGrants);
  await screenshot(page, 'twentieth-auto-run.png');
  pass('20-installed-auto-runs-zero-permissions-request', {runs: 20, actualDocuments: new Set(report.documents.map(row => row.documentId)).size,
    requests: report.permissionRequests.length, disabledProgramExecutions: snapshot.executions.filter(row => row.programId === ids[1]).length});

  const beforeWorker = snapshot;
  await client.send('ServiceWorker.enable', {}, settings.sessionId);
  const original = await until(() => [...versions.values()].find(version => version.scriptURL === 'chrome-extension://' + extensionId + '/sw.js' &&
    version.targetId === worker.targetId && version.runningStatus === 'running'), 'actual running Worker version');
  const originalTarget = worker.targetId;
  const originalObserver = await evaluate(client, `globalThis.${marker}.id`, worker.sessionId);
  const originalContext = await observedWorkerContext(worker, originalObserver);
  await checkpoint('before-worker-stop');
  const lifecycleStart = report.workerLifecycle.length;
  await client.send('ServiceWorker.stopWorker', {versionId: original.versionId}, settings.sessionId);
  const stopped = await until(() => report.workerLifecycle.slice(lifecycleStart).find(row => row.versionId === original.versionId &&
    row.runningStatus === 'stopped' && row.connectionGeneration === generation), 'exact native Worker stopped version');
  await until(async () => !(await targets()).some(target => target.targetId === originalTarget), 'actual old Worker target retired');
  const targetAbsent = record('worker-target-absent', {targetId: originalTarget, versionId: original.versionId, connectionGeneration: generation});
  await client.send('ServiceWorker.startWorker', {scopeURL: 'chrome-extension://' + extensionId + '/'}, settings.sessionId);
  await findWorker();
  await client.send('Runtime.enable', {}, worker.sessionId);
  const running = await until(() => report.workerLifecycle.slice(report.workerLifecycle.indexOf(stopped) + 1).findLast(row =>
    row.versionId === original.versionId && row.targetId === worker.targetId && row.runningStatus === 'running' &&
    row.connectionGeneration === generation), 'restarted native Worker running version');
  const resumedObserver = await evaluate(client, `globalThis.${marker}.id`, worker.sessionId);
  const resumedContext = await observedWorkerContext(worker, resumedObserver);
  assert.notEqual(resumedContext.uniqueId, originalContext.uniqueId, 'Native Worker execution context really changed');
  assert.notEqual(resumedObserver, originalObserver, 'The new Worker global has a new request observer');
  const afterWorker = await until(async () => { const current = await state(); return current.installs[0]?.nativeState === 'registered' ? current : null; }, 'Worker reconciles persistent authorization');
  assertInstalled(afterWorker, {bDisabled: true}); assert.deepEqual(grants(afterWorker), baselineGrants);
  assert.deepEqual(afterWorker.executions, beforeWorker.executions, 'Worker restart does not replay old receipts');
  assert.equal(afterWorker.browserSessionIncarnation, beforeWorker.browserSessionIncarnation, 'Worker restart remains in the same browser session');
  snapshot = await runDocument(21, baselineGrants);
  pass('real-worker-restart-restores-installations-without-replay', {oldTargetId: originalTarget, newTargetId: worker.targetId,
    originalVersionId: original.versionId, stopped, targetAbsent: true, targetAbsentAt: targetAbsent.at, running,
    originalContext, resumedContext, originalObserver, resumedObserver,
    persistedReceipts: beforeWorker.executions.length, newDocumentId: report.documents.at(-1).documentId});

  // Remove the matched document through real navigation before browser close;
  // startup cannot legitimately create an extra fresh matching document here.
  await client.send('Page.navigate', {url: 'about:blank'}, page.sessionId);
  await until(() => evaluate(client, 'location.href==="about:blank"', page.sessionId), 'matched page left before full shutdown');
  const beforeBrowser = await state();
  await checkpoint('before-browser-close');
  await client.send('Browser.close', {}, undefined, {timeoutMs: 5000}).catch(() => {});
  client.close(); client = null;
  for (const observation of report.observations) if (!observation.retiredAt) observation.retiredAt = new Date().toISOString();
  launcher.stdin.write(JSON.stringify({action: 'restart'}) + '\n');
  generation = 2; versions.clear();
  const second = await until(() => { assert.ok(!launchStatus.closed); const value = JSON.parse(fs.readFileSync(launchFile, 'utf8')); return value.generation === 2 ? value : null; }, 'same-profile generation 2', 40000);
  validateMetadata(second, first); await connectGeneration(second);
  settings = await newPage('chrome://extensions/?id=' + extensionId);
  await client.send('ServiceWorker.enable', {}, settings.sessionId);
  await client.send('ServiceWorker.startWorker', {scopeURL: 'chrome-extension://' + extensionId + '/'}, settings.sessionId);
  await findWorker();
  let browserRecoveryObservations = 0;
  const afterBrowser = await until(async () => {
    const current = await state();
    // The DB's last registered state predates this process. Startup recovery
    // must also finish the real Chrome registration before it is ready.
    const ready = typeof current.browserSessionIncarnation === 'string' && current.browserSessionIncarnation.length > 0 &&
      current.installs.length === 2 && current.installs.every((row, index) => row.programId === ids[index] &&
        row.nativeState === (index === 0 ? 'registered' : 'disabled') &&
        current.nativeScripts.some(script => script.id === row.nativeId) === (index === 0));
    save('browser-recovery-latest.json', current);
    record('browser-recovery-observed', {attempt: ++browserRecoveryObservations, ready,
      browserSessionIncarnation: current.browserSessionIncarnation,
      installs: current.installs.map(row => ({programId: row.programId, enabled: row.enabled, nativeId: row.nativeId,
        nativeState: row.nativeState, authorizationStatus: row.authorization?.status, errorCode: row.errorCode})),
      nativeScriptIds: current.nativeScripts.map(script => script.id)});
    return ready ? current : null;
  }, 'same-profile persisted authorization and actual native registration after Chrome restart');
  save('after-browser-restart.json', afterBrowser);
  assertInstalled(afterBrowser, {bDisabled: true}); assert.deepEqual(grants(afterBrowser), baselineGrants);
  assert.deepEqual(afterBrowser.executions, beforeBrowser.executions, 'Full browser restart does not replay old document receipts');
  assert.notEqual(afterBrowser.browserSessionIncarnation, beforeBrowser.browserSessionIncarnation, 'Browser session identity really changed');
  page = await newPage('about:blank');
  snapshot = await runDocument(22, baselineGrants);
  assert.equal(report.documents.at(-1).browserSessionIncarnation, afterBrowser.browserSessionIncarnation);
  await screenshot(page, 'browser-restarted-auto-run.png');
  pass('real-complete-browser-restart-same-profile-persistent-grant-reuse', {oldPid: first.pid, newPid: second.pid,
    profileDevice: second.profileDevice, profileInode: second.profileInode, persistedReceipts: beforeBrowser.executions.length,
    originalSession: beforeBrowser.browserSessionIncarnation, newSession: afterBrowser.browserSessionIncarnation,
    nextDocumentId: report.documents.at(-1).documentId, requestsAcrossBothGenerations: report.permissionRequests.length});
  await checkpoint('final');
  for (const required of ['script-id', 'script-revision', 'script-source', 'page-preview-run', 'page-candidate-save', 'page-program-verify', 'page-program-install', 'page-program-toggle'])
    assert.ok(report.trustedInputs.some(input => input.id === required && input.isTrusted), 'Native trusted UI evidence: ' + required);
  assert.ok(report.trustedInputs.every(input => input.isTrusted), 'No untrusted synthetic product input events');
  assert.equal(report.observations.filter(row => row.targetType === 'service_worker').length >= 3, true, 'Three actual Worker lifetimes observed cumulatively');
  assert.equal((await packageFingerprint(packageDir)).packageHash, report.package.packageHash, 'Candidate package unchanged during acceptance');
  report.status = 'PASS';
} catch (error) {
  report.status = 'FAIL'; report.error = failed(error); record('failure', report.error);
} finally {
  // Never delete a profile from the driver. The launcher provides the original
  // inode / Popen ownership proof and an explicit cleanup receipt.
  if (client) { await client.send('Browser.close', {}, undefined, {timeoutMs: 5000}).catch(() => {}); client.close(); client = null; }
  if (launcher) {
    launcher.stdin.end();
    try {
      const deadline = Date.now() + 35000;
      while (!launchStatus.closed && Date.now() < deadline) await pause(100);
      if (!launchStatus.closed) {
        launcher.kill('SIGTERM');
        const fallback = Date.now() + 25000;
        while (!launchStatus.closed && Date.now() < fallback) await pause(100);
      }
      assert.ok(launchStatus.closed, 'Owned launcher must finish cleanup');
      report.cleanup = JSON.parse(fs.readFileSync(path.join(out, 'launcher.cleanup.json'), 'utf8'));
      assert.equal(launchStatus.code, 0, 'Launcher exit status');
      assert.equal(report.cleanup.launcherPid, launcher.pid);
      assert.equal(report.cleanup.status, 'PASS');
      assert.equal(report.cleanup.profileStatus, 'removed');
      assert.deepEqual(report.cleanup.residual, []); assert.deepEqual(report.cleanup.errors, []);
      assert.ok(report.cleanup.children.every(child => child.state === 'exited'));
      assert.ok(!fs.existsSync(report.cleanup.profile), 'Original owned profile was removed');
      if (report.status === 'PASS') assert.equal(report.cleanup.children.length, 2, 'Both real browser generations have exit evidence');
    } catch (error) { report.cleanupError = failed(error); report.status = 'FAIL'; }
  }
  for (const observation of report.observations) if (!observation.retiredAt) observation.retiredAt = new Date().toISOString();
  if (server.listening) await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
  report.launcherExit = launchStatus;
  report.finishedAt = new Date().toISOString();
  save('permission-observations.json', {observations: report.observations, requests: report.permissionRequests,
    checkpoints: report.checkpoints, errors: report.observerErrors});
  save('acceptance.json', report);
  console.log(JSON.stringify({status: report.status, report: path.join(out, 'acceptance.json'), tests: report.tests,
    measuredPermissionRequests: report.permissionRequests.length, documents: report.documents.length, error: report.error, cleanupError: report.cleanupError}));
  process.exitCode = report.status === 'PASS' ? 0 : 1;
}
