import assert from 'node:assert/strict';
import {inputIdentity} from '../../scripts/wxt-checkpoint.mjs';
import {createServer} from 'node:http';
import {spawn, execFile} from 'node:child_process';
import {readFile, writeFile, readdir, realpath, mkdtemp, mkdir, stat} from 'node:fs/promises';
import {appendFileSync} from 'node:fs';
import {createHash, randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {encodeValue, decodeValue} from '../../src/platform/page-port/codec.js';
import {PROTOCOL, SDK_VERSION, SDK_METHODS} from '../../src/framework/sdk/registry.js';
import {discoverAdmissionPoint} from './k5-sdk-admission-abort-native-selector.mjs';
import {inspectPausedAdmission} from './k5-sdk-admission-abort-native-inspect.mjs';
import {discoverStorageObservations, inspectNativeKvSubmission, readFrame, assertPublicUnknown} from './b05-native-observers.mjs';

// Preparation lane: importing this file never launches Chrome. --run is explicit.
// k5-sdk-native.mjs is a top-level executable, not an importable helper library.
// Its native UI/CDP/read-only IDB pattern is reused here without executing it.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PYTHON = '/usr/bin/python3';
const LAUNCHER = '/Users/shopme/.codex/browser-testing/launch.py';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const capabilities = ['network', 'storage.persistent', 'storage.session'];
const CP1 = 'B05.SDK.crash.before-admission-commit';
const CP2 = 'B05.SDK.crash.after-admission-before-dispatch';
const CP3 = 'B05.SDK.crash.after-effect-before-receipt';
const CP4 = 'B05.SDK.crash.after-durable-before-delivery';
const CASES = [
  {id:'B05.SDK.no-controller', readiness:'native-runnable'},
  {id:'B05.SDK.promise-values', readiness:'native-runnable'},
  {id:'B05.SDK.100-concurrent', readiness:'native-runnable', ingress:'100 actual sendMessage calls in the installed relay world'},
  {id:'B05.SDK.conflict', readiness:'native-runnable'},
  {id:CP1, readiness:'native-debugger-conditional', observation:'Original transaction closure and pending native IDBRequest; termination plus atomic rollback, not a fabricated abort callback'},
  {id:CP2, readiness:'native-debugger-conditional'},
  {id:CP3, readiness:'native-runnable'},
  {id:CP4, readiness:'native-debugger-conditional'},
  {id:'B05.SDK.regrant-origin-restart', readiness:'native-runnable', contractCase:'F2-K2-SDK-017', variant:'origin'},
  {id:'F2-K2-SDK-017', readiness:'not-tested', reason:'Origin/regrant/restart slice is runnable; all navigation/origin/notifications variants are not natively observable here'},
  {id:'F2-K2-SDK-018', readiness:'native-debugger-conditional', observation:'Post-IDB-commit authorization cut plus actual frameworkKV IDBRequest submissions'},
  {id:'F2-K2-SDK-019', readiness:'native-debugger-conditional'},
  {id:'B05.SDK.unknown-public-reference', readiness:'native-runnable', interfaceRequest:'B05-IR-UNKNOWN-REFERENCE', observation:'Original public SDK Promise and native recovery error, both bound to the real requestId'},
  {id:'B05.SDK.delivery-failure', readiness:'native-runnable'},
  {id:'B05.SDK.revocation-no-replay', readiness:'native-runnable'},
  {id:'B05.SDK.navigation-no-replay', readiness:'native-runnable'},
  {id:'B05.SDK.navigation-old-sender-replay', readiness:'not-tested', reason:'A destroyed native document cannot emit an authentic old-document MessageSender'},
  {id:'B05.SDK.navigation-original-promise', readiness:'not-tested', reason:'The destroyed JS context cannot report its original Promise settlement'}
];
const expectedMeasurements = (httpWrites,outcome) => ({controllerRuns:0,swTerminated:true,originalIdentityPreserved:true,httpWrites,outcome,replayed:false});
const EXPECTATIONS = {
  'B05.SDK.no-controller':{hello:{ready:true,sdkVersion:SDK_VERSION}},
  'B05.SDK.promise-values':{set:{ok:true,undefinedResult:true},get:{value:'false'},typed:{f:false,z:0,ownUndefined:true}},
  'B05.SDK.100-concurrent':{measurements:{requests:100,controllerRuns:0,admissions:1,serviceRuns:1,operations:1,httpWrites:1}},
  'B05.SDK.conflict':{durableConflictCodes:['E_REQUEST_CONFLICT','E_REQUEST_CONFLICT','E_REQUEST_CONFLICT']},
  [CP2]:{measurements:expectedMeasurements(1,'settled')},
  [CP1]:{measurements:{zeroEffectsBeforeRetry:true,atomicRollback:true,firstAdmissionAfterAbort:true,httpWrites:1}},
  [CP3]:{measurements:expectedMeasurements(1,'E_EFFECT_UNKNOWN')},
  [CP4]:{measurements:expectedMeasurements(1,'settled')},
  'F2-K2-SDK-019':{measurements:expectedMeasurements(0,'E_EFFECT_UNKNOWN')},
  'F2-K2-SDK-018':{measurements:{nativeKvSubmissions:1,replayed:false,originalIdentityPreserved:true}},
  'B05.SDK.unknown-public-reference':{original:{ok:false,error:{code:'E_EFFECT_UNKNOWN',invocation:'original request/run/op/grant reference'}},replay:{ok:false,error:{code:'E_EFFECT_UNKNOWN'}}},
  'B05.SDK.regrant-origin-restart':{variant:'origin',hello:{ok:true,data:{ready:true}},old:{ok:false,error:{code:'E_GRANT_REVOKED'}}},
  'B05.SDK.delivery-failure':{original:{settlements:1,response:{ok:false,error:{code:'E_CANCELLED'}}},afterRows:{operation:{state:'durable',deliveryState:'response_ready'}}},
  'B05.SDK.revocation-no-replay':{removed:true,denied:{ok:false},old:{ok:false,error:{code:'E_GRANT_REVOKED'}}},
  'B05.SDK.navigation-no-replay':{newHello:{ready:true}}
};
const evidenceSchema = {
  schemaVersion:2, scope:'bounded B05 preparation; author is not final reviewer',
  report:['packageBefore/After.{files,packageHash}', 'contractInputs.{path,sha256,bytes}', 'binary.{path,sha256,version}',
    'profile', 'extensionId', 'sessions', 'cases', 'cleanup', 'summary', 'interfaceRequests'],
  case:['id', 'status: PASS|FAIL|BLOCKED|NOT_TESTED', 'startedAt', 'endedAt', 'evidence', 'observations per real environment',
    'sourceHashes: absolute existing path -> actual SHA256', 'contractSha256: exact frozen manifest spec row, when original', 'reason?', 'error?'],
  evidence:['payload.{requestId,method,argsWire,deadlineAt}', 'nativeContext', 'sdkObservations', 'snapshots: paths with explicit IDB keys',
    'operation.{opKey,requestDigest,runId,opId,resultId,grantIncarnation,state,submissionCount,deliveryState}',
    'http: raw server request sequence references', 'nativeSender: optional real paused-frame value; never reconstructed',
    'barrier.{sourceHash,range,requestedLocation,actualLocation,paused,observedState}',
    'workerStop.{version,targetId,targetDestroyed,replacementTargetId}', 'replay: native response', 'effectCountBefore/After',
    'launcher.{path,sha256,pid,metadata,actualProcess,freshProfile}', 'measurements: actual per-case elapsed/raw sequence window plus measured semantic counters',
    'cleanup: NOT_TESTED for unobservable product baselines; actual session teardown separately scoped'],
  streams:['raw-cdp.jsonl: endpoint/direction/time/sequence/full message', 'raw-server.jsonl: request/finish/close/full body/hash'],
  invariants:['No sender in payload', 'No second driver/authority/database', 'No package/source mutation',
    'response_ready is not delivered', 'Debugger proximity is not a crash-point proof', 'NOT_TESTED does not close B05',
    'Do not use a declared campaign count or duplicate one physical round', 'Do not invent unobservable cleanup counters',
    'No mutable current spec fallback', 'Only global Python launcher owns fresh profile; verify actual main argv before product tests']
};
export {CASES, evidenceSchema};

// Read one frozen contract snapshot, then use it throughout the run. No current
// test-spec fallback: a missing/mismatched manifest/spec/source blocks execution.
export async function loadContractBindings(projectRoot = root) {
  const inputs = new Map();
  async function input(file) {
    const absolute = path.resolve(projectRoot,file), bytes = await readFile(absolute);
    const ref = {path:absolute,bytes:bytes.length,sha256:sha256(bytes)};
    if(inputs.has(absolute))assert.equal(inputs.get(absolute).sha256,ref.sha256,'Input changed during preparation');
    inputs.set(absolute,ref);return {ref,bytes};
  }
  const gates = JSON.parse((await input('docs/framework/execution-gates.json')).bytes);
  const plan = gates.currentPlan;
  assert(plan?.approved===true&&plan.round===6,'This lane binds the approved frozen round6 contract');
  const manifestInput = await input(plan.manifest);
  assert.equal(manifestInput.ref.path,path.join(projectRoot,'docs/framework/reviews/migration-execution-v5/round-6/candidate/candidate-manifest.json'));
  assert.equal(manifestInput.ref.sha256,plan.manifestSha256,'Approved manifest integrity failure');
  const manifest = JSON.parse(manifestInput.bytes);
  const specRefs = manifest.files.filter(file=>file.path.endsWith('/test-spec-v5.json'));
  assert.equal(specRefs.length,1,'Exactly one approved frozen specification is required');
  const specInput = await input(specRefs[0].path);
  assert.equal(specInput.ref.path,path.join(projectRoot,'docs/framework/reviews/migration-execution-v5/round-6/candidate/test-spec-v5.json'));
  assert.equal(specInput.ref.sha256,specRefs[0].sha256,'Approved frozen specification integrity failure');
  const spec = JSON.parse(specInput.bytes);
  assert.equal(spec.cases.length,603,'Keep the original603 contract denominator');
  assert.equal(new Set(spec.cases.map(c=>c.id)).size,spec.cases.length,'Frozen contract IDs must be unique');
  const b05Contracts = spec.cases.filter(c=>c.id.startsWith('B05')||c.families?.includes('B05'));
  for(const contract of b05Contracts)if(contract.source?.path) {
    const observed=await input(contract.source.path);
    assert.equal(observed.ref.sha256,contract.source.sha256,`Frozen source binding changed: ${contract.id}`);
  }
  const inputPaths=['docs/framework/prompts/goal-migration-v5.txt','docs/framework/continue-in-new-chat.md',
    'docs/framework/evidence/k4/router-contract.json','tests/framework/k5-sdk-native.mjs',
    'tests/framework/b05-product-acceptance-20261003.mjs','src/agents/page-relay.js','src/framework/sdk/registry.js',
    'src/platform/page-port/codec.js','src/platform/host/sdk-broker.js','src/platform/host/sdk-methods.js',
    'src/platform/chrome/network.js','src/platform/storage/repository.js','src/platform/storage/idb.js',
    'src/framework/sdk/transport.js','src/framework/sdk/entry.js',
    'tests/framework/b05-native-observers.mjs','tests/framework/k5-sdk-admission-abort-native-selector.mjs',
    'tests/framework/k5-sdk-admission-abort-native-inspect.mjs',LAUNCHER];
  for(const file of inputPaths)await input(file);
  const ledgerInput=await input('docs/framework/source-compatibility-ledger.json');
  const ledger=JSON.parse(ledgerInput.bytes);
  const additionalSdkContracts=Object.entries(ledger.additionalCaseResults??{}).filter(([id])=>id.startsWith('F2-K2-SDK-')).map(([id,row])=>({
    id,title:row.title,status:row.status,componentPass:row.componentPass,nativePass:row.pass??null,
    productPackageSha256:row.productPackageSha256??null,rowSha256:sha256(JSON.stringify(row))}));
  for(const id of ['F2-K2-SDK-017','F2-K2-SDK-018','F2-K2-SDK-019'])assert(additionalSdkContracts.some(x=>x.id===id),`Current additional contract missing: ${id}`);
  const contracts=Object.fromEntries(b05Contracts.map(contract=>[contract.id,{
    contractSha256:sha256(JSON.stringify(contract)),...(contract.source?{source:contract.source}:{}),specReference:specInput.ref}]));
  return {round:plan.round,manifestReference:manifestInput.ref,specReference:specInput.ref,ledgerReference:ledgerInput.ref,
    originalCaseCount:spec.cases.length,contracts,additionalSdkContracts,inputs:[...inputs.values()],
    sourceHashes:Object.fromEntries([...inputs.values()].map(ref=>[ref.path,ref.sha256]))};
}

const pidAlive = pid => {
  if(!Number.isInteger(pid)||pid<=0)return null;
  try {process.kill(pid,0);return true;}catch(error){if(error.code==='ESRCH')return false;throw error;}
};
async function processArguments(pid) {
  return new Promise((resolve,reject)=>execFile('/bin/ps',['-ww','-p',String(pid),'-o','pid=,ppid=,command='],
    {encoding:'utf8'},(error,stdout,stderr)=>error?reject(error):resolve({at:new Date().toISOString(),pid,stdout,stderr})));
}

// Check a fresh ps observation immediately before any fallback signal. An old
// PID being alive is insufficient: it may now belong to another process.
export function isOwnedChromeProcess(observation, {pid, launcherPid, executable, profile}) {
  const fields = observation?.stdout?.trim().match(/^(\d+)\s+(\d+)\s+([\s\S]+)$/);
  if (!fields || Number(fields[1]) !== pid || Number(fields[2]) !== launcherPid ||
      !fields[3].startsWith(`${executable} `)) return false;
  const args = fields[3].slice(executable.length).trim().split(/\s+/);
  return args.includes('--use-mock-keychain') && args.includes(`--user-data-dir=${profile}`);
}

// These are options for launch.py, not a direct Chrome invocation. The global
// launcher supplies its defaults, --use-mock-keychain and its own mkdtemp profile.
export function launcherArguments(binary, reportPath, browserArgs) {
  assert(path.isAbsolute(binary)&&path.isAbsolute(reportPath));
  assert(browserArgs.every(arg=>!['--user-data-dir','--remote-debugging-address','--password-store','--use-mock-keychain'].includes(arg.split('=')[0])),
    'Keep global launcher profile/keychain/address/default settings');
  return [LAUNCHER,'--executable',binary,'--report',reportPath,'--',...browserArgs];
}

export async function fingerprint(directory) {
  const files = [];
  async function walk(prefix = '') {
    for (const entry of await readdir(path.join(directory, prefix), {withFileTypes:true})) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(relative);
      else {
        assert(entry.isFile(), `Unexpected package entry: ${relative}`);
        const bytes = await readFile(path.join(directory, relative));
        files.push({path:relative, bytes:bytes.length, sha256:sha256(bytes)});
      }
    }
  }
  await walk(); files.sort((a,b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  return {files, packageHash:sha256(JSON.stringify(files)), algorithm:'SHA256 JSON.stringify(path-sorted {path,bytes,sha256} array); same as k5-sdk-native'};
}

// Parse the unchanged WXT package using the installed Acorn dependency.
// Never synthesize a script, patch a function, or use a guessed source offset.
export function discoverBarriers(source) {
  const {parse} = createRequire(import.meta.url)('acorn');
  const ast = parse(source, {ecmaVersion:'latest', sourceType:'module', locations:true}), entries = [];
  function visit(node, ancestors = []) {
    if (!node || typeof node.type !== 'string') return;
    entries.push({node, ancestors});
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(child => visit(child, [...ancestors,node]));
      else if (value && typeof value === 'object' && typeof value.type === 'string') visit(value, [...ancestors,node]);
    }
  }
  visit(ast);
  const isFunction = node => ['FunctionExpression','FunctionDeclaration','ArrowFunctionExpression'].includes(node.type);
  const anchors = entries.filter(({node}) => node.type === 'Literal' && node.value === 'SDK short service concurrency limit');
  const admission=discoverAdmissionPoint(source),storage=discoverStorageObservations(source);
  const result = {sourceHash:sha256(source), points:{}, admission, unavailable:storage.unavailable};
  if(admission.ready)result.points[CP1]={...admission.point,senderExpression:null};
  if(storage.points.storageDurable)result.points['F2-K2-SDK-018']=storage.points.storageDurable;
  if(storage.points.nativeKvSubmission)result.points['B05.native-kv-submission']=storage.points.nativeKvSubmission;
  if (anchors.length !== 1) return {...result, unavailable:{...result.unavailable,sdk:'SDK request function anchor is absent or ambiguous'}};
  const fn = [...anchors[0].ancestors].reverse().find(isFunction);
  const inside = entries.filter(({ancestors}) => ancestors.includes(fn));
  const race = inside.filter(({node}) => node.type === 'CallExpression' && node.callee.type === 'MemberExpression' &&
    node.callee.object.name === 'Promise' && node.callee.property.name === 'race');
  function point(node) {
    return {range:[node.start,node.end], location:{lineNumber:node.loc.start.line-1,columnNumber:node.loc.start.column},
      endLocation:{lineNumber:node.loc.end.line-1,columnNumber:node.loc.end.column}, text:source.slice(node.start,node.end),
      senderExpression:fn.params[1]?.type==='Identifier'?fn.params[1].name:null,
      payloadExpression:fn.params[0]?.type==='Identifier'?fn.params[0].name:null};
  }
  if (race.length === 1) {
    const call = race[0].node.arguments[0]?.elements?.[0];
    if (call?.type === 'CallExpression') result.points[CP2] = point(call);
  }
  const delivery = inside.filter(({node}) => node.type === 'TryStatement' && node.block.body[0]?.type === 'ExpressionStatement' &&
    node.block.body[0].expression.type === 'AwaitExpression' && node.block.body[0].expression.argument.callee?.property?.name === 'authorize' &&
    source.slice(node.start,node.end).includes('settleSdkDelivery'));
  if (delivery.length === 1) result.points[CP4] = point(delivery[0].node.block.body[0].expression.argument);
  const networkAnchors=entries.filter(({node})=>node.type==='Literal'&&node.value==='HTTP response is not observable');
  if(networkAnchors.length===1) {
    const networkFn=[...networkAnchors[0].ancestors].reverse().find(isFunction);
    const nativeFetch=entries.filter(({node,ancestors})=>ancestors.includes(networkFn)&&node.type==='CallExpression'&&node.arguments[1]?.type==='ObjectExpression'&&
      node.arguments[1].properties.some(p=>p.key?.name==='credentials'&&p.value?.value==='omit')&&
      node.arguments[1].properties.some(p=>p.key?.name==='redirect'&&p.value?.value==='manual'));
    if(nativeFetch.length===1)result.points['F2-K2-SDK-019']={...point(nativeFetch[0].node),senderExpression:null,payloadExpression:null,
      contextExpression:networkFn.params[1]?.name??networkFn.params[1]?.left?.name??null};
  }
  return result;
}

class NotObserved extends Error { constructor(message) { super(message); this.code = 'E_NATIVE_NOT_OBSERVED'; } }
const projectError = error => ({code:error.code, message:error.message, stack:error.stack});
async function until(operation, description, ms = 12000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) { const value = await operation(); if (value) return value; await sleep(40); }
  throw new Error(`Timed out: ${description}`);
}
async function connect(url, label, log) {
  const socket = new WebSocket(url), pending = new Map(), listeners = new Set(); let next = 0, closed = false;
  await new Promise((resolve,reject) => { socket.onopen=resolve; socket.onerror=reject; });
  socket.onmessage = ({data}) => {
    const message = JSON.parse(data); log({endpoint:label,direction:'received',message});
    if (!message.id) { for (const listener of listeners) listener(message); return; }
    const entry = pending.get(message.id); if (!entry) return;
    pending.delete(message.id); clearTimeout(entry.timer);
    message.error ? entry.reject(new Error(JSON.stringify(message.error))) : entry.resolve(message.result);
  };
  socket.onclose = () => {
    closed = true;
    for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(new Error(`${label}: CDP closed`)); }
    pending.clear();
  };
  return {send(method,params = {}) {
    if (closed) return Promise.reject(new Error(`${label}: CDP closed`));
    return new Promise((resolve,reject) => {
      const id = ++next, message = {id,method,params};
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${label}: ${method} timed out`)); }, 20000);
      pending.set(id,{resolve,reject,timer}); log({endpoint:label,direction:'sent',message}); socket.send(JSON.stringify(message));
    });
  }, on(listener) { listeners.add(listener); return () => listeners.delete(listener); }, close() { closed=true;socket.onmessage=null;socket.close(); }};
}
async function evaluate(client, expression, contextId) {
  const result = await client.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,...(contextId ? {contextId} : {})});
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}

function rawPageRequest(payload) {
  return new Promise(resolve => {
    const timeout = setTimeout(() => { window.removeEventListener('OPEN_DESK_SDK_RESULT',receive); resolve({observationTimeout:true}); },35000);
    function receive(event) {
      const message = JSON.parse(event.detail); if (message.requestId !== payload.requestId) return;
      clearTimeout(timeout); window.removeEventListener('OPEN_DESK_SDK_RESULT',receive); resolve(message.response);
    }
    window.addEventListener('OPEN_DESK_SDK_RESULT',receive);
    window.dispatchEvent(new CustomEvent('CHROME_BRIDGE_INTERFACE',{detail:JSON.stringify({protocol:'opendesk.foundation.v1',type:'SDK_REQUEST',payload})}));
  });
}
const rawExpression = payload => `(${rawPageRequest.toString()})(${JSON.stringify(payload)})`;
function observePage() {
  globalThis.__b05 = {events:[],settlements:{},requests:{}};
  for (const name of ['OPEN_DESK_SDK_READY','OPEN_DESK_SDK_RESULT','CHROME_BRIDGE_INTERFACE']) {
    window.addEventListener(name,event => __b05.events.push({at:Date.now(),name,message:JSON.parse(event.detail)}));
  }
}
function sdkCall(method,args) {
  return OpenDeskSDK.call(method,args).then(value => ({ok:true,value,undefinedResult:value===undefined}),
    error => ({ok:false,publicErrorKeys:Object.keys(error),error:{code:error.code,message:error.message,
      ...Object.fromEntries(['stage','status','response','invocation'].filter(key=>Object.hasOwn(error,key)).map(key=>[key,error[key]]))}}));
}
const sdkExpression = (method,args) => `(${sdkCall.toString()})(${JSON.stringify(method)},${JSON.stringify(args)})`;
function snapshotInTool() {
  return (async () => {
    const databases = await indexedDB.databases();
    if (!databases.some(db => db.name === 'opendesk-browser')) throw new Error('Product database is absent; observer must not create it');
    const data = await new Promise((resolve,reject) => {
      const open = indexedDB.open('opendesk-browser');
      open.onerror=() => reject(open.error); open.onupgradeneeded=() => { open.transaction.abort(); reject(new Error('Observer refuses schema creation')); };
      open.onsuccess=() => {
        const db=open.result, names=['commandJournal','runs','results','frameworkKV'], rows={};
        const tx=db.transaction(names,'readonly');
        for (const name of names) {
          rows[name]=[]; const request=tx.objectStore(name).openCursor();
          request.onsuccess=() => { const cursor=request.result; if (cursor) { rows[name].push({key:cursor.primaryKey,value:cursor.value}); cursor.continue(); } };
        }
        tx.oncomplete=() => { db.close(); resolve({version:db.version,stores:rows}); };
        tx.onabort=() => { db.close(); reject(tx.error); };
      };
    });
    return {databases,data,permissions:await chrome.permissions.getAll(),sessionStorage:await chrome.storage.session.get(null)};
  })();
}
const ops = snapshot => snapshot.data.stores.commandJournal.map(row=>row.value).filter(row=>row.tag==='sdk-operation');
function operation(snapshot,payload) {
  const found=ops(snapshot).filter(row=>row.requestId===payload.requestId); assert.equal(found.length,1,'Exactly one SDK operation'); return found[0];
}
function boundRows(snapshot,op) {
  const stores=snapshot.data.stores;
  return {operation:op, runs:stores.runs.filter(row=>row.value.runId===op.runId), results:stores.results.filter(row=>row.value.resultId===op.resultId)};
}
function requireDurable(snapshot,payload) {
  const op=operation(snapshot,payload), rows=boundRows(snapshot,op);
  assert.equal(op.state,'durable'); assert.equal(rows.runs.length,1); assert.equal(rows.results.length,1);
  assert.equal(rows.runs[0].value.tag,'sdk-service'); assert.equal(rows.results[0].value.opId,op.opId);
  assert(!Object.hasOwn(op,'deliveredAt'),'Response-ready is not evidence of page delivery'); return rows;
}

async function runNative(options, packageBefore, barriers) {
  const output = await mkdtemp(path.join(os.tmpdir(),'opendesk-b05-'));
  const binding=options.binding;
  const inputsBefore=await inputIdentity();
  const candidateBefore={productInputsSha256:inputsBefore.productInputsSha256,verificationInputsSha256:inputsBefore.verificationInputsSha256,
    packageHashes:Object.fromEntries(await Promise.all(['production','development'].map(async mode=>[mode,(await fingerprint(path.join(root,'dist',mode))).packageHash]))),
    zipHashes:Object.fromEntries(await Promise.all(['production','development'].map(async mode=>[mode,sha256(await readFile(path.join(root,'artifacts',`opendesk-browser-${mode}.zip`)))])))};
  const report = {schemaVersion:2,at:new Date().toISOString(),scope:'bounded native B05; not final acceptance',output,
    packageBefore,candidateBefore,cases:[],sessions:[],interfaceRequests:CASES.filter(c=>c.interfaceRequest),
    approvedContract:{round:binding.round,originalCaseCount:binding.originalCaseCount,manifestReference:binding.manifestReference,specReference:binding.specReference},
    contractInputs:binding.inputs,additionalSdkContracts:binding.additionalSdkContracts,
    campaigns:{mixed:[],reconnect:[],pluginDisabled:[]},
    selection:{requested:options.requestedCases??null,withPrerequisites:options.selectedCases??null,requiredDenominator:CASES.length,
      rule:'Unselected cases remain NOT_TESTED and exit 3; a selected slice never closes B05'},
    finalProductPassed:false,f3Accepted:false,original603Closed:false,b05Closed:false};
  const write = (name,value) => writeFile(path.join(output,name),JSON.stringify(value,null,2)+'\n');
  let cdpSequence=0;
  const log = entry => appendFileSync(path.join(output,'raw-cdp.jsonl'),JSON.stringify({sequence:++cdpSequence,at:new Date().toISOString(),monoMs:performance.now(),...entry})+'\n');
  const http=[], held=new Map();
  const server=createServer(async (req,res) => {
    try {
      const chunks=[]; for await (const chunk of req) chunks.push(chunk);
      const body=Buffer.concat(chunks).toString('utf8'), url=new URL(req.url,'http://127.0.0.1');
      const hit={sequence:http.length+1,at:new Date().toISOString(),monoMs:performance.now(),method:req.method,url:req.url,
        headers:req.headers,body,bodySha256:sha256(body)}; http.push(hit);
      const record = event => appendFileSync(path.join(output,'raw-server.jsonl'),JSON.stringify({event,...hit})+'\n'); record('request');
      res.on('finish',()=>{hit.finishedAt=new Date().toISOString();hit.statusCode=res.statusCode;record('finish');});
      res.on('close',()=>{hit.closedAt=new Date().toISOString();record('close');});
      if (url.pathname==='/hold') { held.set(url.searchParams.get('token'),res); return; }
      if (['/target','/decoy'].includes(url.pathname)) {
        res.writeHead(200,{'content-type':'text/html','cache-control':'no-store'});res.end('<!doctype html><title>Native B05</title><h1>Native SDK target</h1>');return;
      }
      res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});
      res.end(JSON.stringify({method:req.method,body,falseValue:false,zero:0,business:{PageBrigeCode:9,ok:false,error:'business',message:'data'}}));
    } catch (error) { res.destroy(error); }
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;
  report.origin=origin;
  const release = token => {
    const res=held.get(token); if (!res) throw new Error(`No held native HTTP response: ${token}`);
    if (!res.destroyed) {res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({token,effect:true}));} held.delete(token);
  };
  const hits = token => http.filter(hit=>new URL(hit.url,origin).searchParams.get('token')===token && hit.method==='POST');
  async function caseRun(label,id,operation) {
    if(options.selectedCases&&!options.selectedCases.includes(id)) {
      const record={id,label,status:'NOT_TESTED',reason:'Not selected in this bounded native slice; required denominator retained',evidence:{}};
      report.cases.push(record);return record;
    }
    const startMono=performance.now(),startCdpSequence=cdpSequence,startHttpRecordCount=http.length;
    const record={id,label,startedAt:new Date().toISOString(),status:'NOT_TESTED',evidence:{}}; report.cases.push(record);
    try { await operation(record.evidence); record.status='PASS'; }
    catch (error) { record.status=error.code==='E_NATIVE_NOT_OBSERVED'?'NOT_TESTED':error.code==='E_NATIVE_PERMISSION_WAIT'?'BLOCKED':'FAIL';record.error=projectError(error);record.reason=error.message; }
    record.measurements={elapsedMs:performance.now()-startMono,rawCdpSequenceStart:startCdpSequence,rawCdpSequenceEnd:cdpSequence,
      httpRecordCountStart:startHttpRecordCount,httpRecordCountEnd:http.length,...record.evidence.measurements};
    record.endedAt=new Date().toISOString(); await write('report.json',report);
    console.log(JSON.stringify({id,label,status:record.status,output})); return record;
  }
  try {
    for (const label of options.labels) {
      const directory=path.join(output,label); await mkdir(directory,{recursive:true});
      const binary=await realpath(options.binary || path.join(root,`tests/.cache/m5-browsers/${label==='138'?'138.0.7204.183':'154.0.8037.92'}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`));
      const session={label,binary:{path:binary,sha256:sha256(await readFile(binary))},extension:options.extension,
        launcher:{path:LAUNCHER,sha256:binding.sourceHashes[LAUNCHER],python:PYTHON,startedAt:new Date().toISOString()}};report.sessions.push(session);
      const browserArgs=['--remote-debugging-port=0',`--load-extension=${options.extension}`,`--disable-extensions-except=${options.extension}`,
        ...(options.headed?[]:['--headless=new']),'about:blank'];
      const argv=launcherArguments(binary,path.join(directory,'launcher-report.json'),browserArgs);session.launcher.argv=argv;
      const child=spawn(PYTHON,argv,{cwd:root,stdio:['ignore','pipe','pipe']});session.launcher.pid=child.pid;
      let stdout='',stderr='',spawnError;child.stdout.on('data',x=>{stdout+=x;});child.stderr.on('data',x=>{stderr+=x;});
      child.on('error',error=>{spawnError=error;});
      const exited=new Promise(resolve=>child.once('close',(code,signal)=>resolve({code,signal})));
      const clients=[];let browser,tool,page,nativeContext,workerClient;const browserEvents=[],swEvents=[];
      try {
        const metadata=await until(()=>{
          if(spawnError)throw spawnError;
          const line=stdout.split('\n').find(line=>line.trim().startsWith('{')&&line.trim().endsWith('}'));
          return line?JSON.parse(line):null;
        },'global launcher metadata');
        session.launcher.metadata=metadata;session.pid=metadata.pid;session.profile=metadata.profile;session.argv=metadata.args;
        assert(Number.isInteger(session.pid)&&session.pid>0&&session.pid!==child.pid,'Track Chrome main PID separately from Python launcher');
        assert.equal(metadata.executable,binary);assert.equal(metadata.log,path.join(session.profile,'chrome.log'));
        const profilePath=await realpath(session.profile),tempRoot=await realpath(os.tmpdir());
        assert.equal(path.dirname(profilePath),tempRoot,'Launcher profile must be a fresh OS temporary directory');
        assert(path.basename(profilePath).startsWith('codex-cft-'),'Use the global launcher-owned mkdtemp profile');
        assert(!report.sessions.some(other=>other!==session&&other.profile===session.profile),'Never reuse another session profile');
        const profileStat=await stat(session.profile);
        assert(profileStat.isDirectory()&&profileStat.birthtimeMs>=Date.parse(session.launcher.startedAt)-5000,'Fresh profile creation must be observed');
        session.launcher.freshProfile={path:profilePath,birthtimeMs:profileStat.birthtimeMs,launchStartedAt:session.launcher.startedAt};
        const requiredFlags=['--use-mock-keychain','--password-store=basic','--no-first-run','--no-default-browser-check',
          '--disable-background-networking','--remote-debugging-address=127.0.0.1',`--user-data-dir=${session.profile}`];
        for(const flag of requiredFlags)assert(metadata.args.includes(flag),`Global launcher must retain ${flag}`);
        assert.equal(metadata.args.filter(arg=>arg.startsWith('--user-data-dir=')).length,1);
        const actualProcess=await processArguments(session.pid),line=actualProcess.stdout.trim();
        const fields=line.match(/^(\d+)\s+(\d+)\s+([\s\S]+)$/);assert(fields,'Actual Chrome main process argv must be readable');
        assert.equal(Number(fields[1]),session.pid);assert.equal(Number(fields[2]),child.pid,'Main process must belong to the owned launcher');
        assert(fields[3].startsWith(binary),'Actual main process must use the pinned CFT binary');
        for(const flag of [...requiredFlags,...browserArgs])assert(fields[3].includes(flag),`Actual main argv missing ${flag}`);
        session.launcher.actualProcess=actualProcess;await write(`${label}/launch-process.json`,session.launcher);
        const endpoint=await until(async()=>{
          if(pidAlive(session.pid)!==true)throw new Error('Chrome main exited before CDP was ready');
          try {return(await readFile(metadata.log,'utf8')).match(/DevTools listening on (ws:\/\/\S+)/)?.[1];}
          catch(error){if(error.code==='ENOENT')return null;throw error;}
        },'global launcher-owned Chrome log/CDP endpoint');
        session.endpoint=endpoint;browser=await connect(endpoint,`${label}:browser`,log);session.version=await browser.send('Browser.getVersion');session.binary.version=session.version.product;
        if (!options.binary) assert(session.version.product.includes(`${label}.`),`Unexpected Chrome version ${session.version.product}`);
        session.nativeProcesses=(await browser.send('SystemInfo.getProcessInfo')).processInfo;
        assert(session.nativeProcesses.some(p=>p.type==='browser'&&p.id===session.pid),'CDP browser PID must match the native main process');
        browser.on(event=>browserEvents.push(event));await browser.send('Target.setDiscoverTargets',{discover:true});
        const debuggingURL=`http://127.0.0.1:${new URL(endpoint).port}`;
        async function attach(id) {
          const target=await until(async()=>(await(await fetch(`${debuggingURL}/json/list`)).json()).find(x=>x.id===id&&x.webSocketDebuggerUrl),'target endpoint');
          const client=await connect(target.webSocketDebuggerUrl,`${label}:${id}`,log);clients.push(client);return client;
        }
        const manifest=JSON.parse(await readFile(path.join(options.extension,'manifest.json'),'utf8'));
        async function worker() {
          const candidates=(await browser.send('Target.getTargets')).targetInfos.filter(x=>x.type==='service_worker'&&x.url.startsWith('chrome-extension://')&&x.url.endsWith('/sw.js'));
          for (const target of candidates) {
            const client=await attach(target.targetId);await client.send('Runtime.enable');
            await until(()=>evaluate(client,'typeof chrome!=="undefined"&&!!chrome.runtime?.id'),'actual worker Chrome bindings');
            const identity=await evaluate(client,'({id:chrome.runtime.id,manifest:chrome.runtime.getManifest()})');
            if (identity.manifest.name!==manifest.name||identity.manifest.version!==manifest.version) continue;
            if (session.extensionId&&identity.id!==session.extensionId) continue;
            session.extensionId=identity.id;session.worker={...target,identity};workerClient=client;return {target,client};
          }
          return null;
        }
        await until(worker,'actual product worker');
        const targetURL=`${origin}/target?seed=${label}-${randomUUID()}`;
        const targetId=(await browser.send('Target.createTarget',{url:targetURL})).targetId;page=await attach(targetId);
        const contexts=[],pageEvents=[];page.on(event=>{pageEvents.push(event);if(event.method==='Runtime.executionContextCreated')contexts.push(event.params.context);});
        await page.send('Runtime.enable');await page.send('Page.enable');await until(()=>evaluate(page,'document.readyState==="complete"'),'target ready');
        await evaluate(page,`(${observePage.toString()})()`);
        const decoyId=(await browser.send('Target.createTarget',{url:`${origin}/decoy`})).targetId, decoy=await attach(decoyId);
        const toolId=(await browser.send('Target.createTarget',{url:`chrome-extension://${session.extensionId}/ui/tool.html`})).targetId;tool=await attach(toolId);
        await until(()=>evaluate(tool,'!!document.querySelector("#sdk-install")'),'product SDK UI');
        tool.on(event=>{if(event.method.startsWith('ServiceWorker.'))swEvents.push(event);});await tool.send('ServiceWorker.enable');
        const tabId=await evaluate(tool,`chrome.tabs.query({}).then(tabs=>tabs.find(tab=>tab.url===${JSON.stringify(targetURL)})?.id)`);assert(Number.isInteger(tabId));
        session.target={targetId,tabId,frameId:0,toolId,decoyId,targetURL};
        async function click(selector) {
          await browser.send('Target.activateTarget',{targetId:toolId});
          const point=await evaluate(tool,`(()=>{const el=document.querySelector(${JSON.stringify(selector)});el.scrollIntoView();const r=el.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2,disabled:el.disabled};})()`);
          assert(!point.disabled,`${selector} disabled`);
          await tool.send('Input.dispatchMouseEvent',{type:'mousePressed',x:point.x,y:point.y,button:'left',clickCount:1});
          await tool.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x,y:point.y,button:'left',clickCount:1});
        }
        async function selectNative(selector,value) {
          const desired=String(value),inspect=()=>evaluate(tool,`(()=>{const el=document.querySelector(${JSON.stringify(selector)});
            return {value:el.value,selectedIndex:el.selectedIndex,options:[...el.options].map(option=>({value:option.value,text:option.text,disabled:option.disabled}))};})()`);
          const before=await inspect(),index=before.options.findIndex(option=>option.value===desired&&!option.disabled);
          assert(index>=0,`Native SDK option absent: ${selector}=${desired}`);
          if(before.value===desired)return {selector,desired,before,after:before,input:'Existing selection from this session; no UI mutation'};
          assert(options.nativeUiAssist,'Use --native-ui-assist for actual macOS select menus');
          await browser.send('Target.activateTarget',{targetId:toolId});
          const request={state:'native-selection-assist',label,pid:session.pid,launcherPid:child.pid,endpoint,
            toolId,targetId:toolId,selector,desired,optionIndex:index,before,
            instruction:'Leader CUA must commit this exact option in the bound native Chrome window; no DOM assignment or synthetic UI events'};
          await write(`${label}/pending-native-selection.json`,request);console.log(JSON.stringify({...request,output,path:path.join(directory,'pending-native-selection.json')}));
          const after=await until(async()=>{const view=await inspect();return view.value===desired&&view;},`native exact SDK selection ${selector}`,options.permissionTimeout);
          const receipt={...request,state:'selection-observed',after,input:'Native UI assist; readback verified; leader CUA action transcript required'};
          (session.uiSelections??=[]).push(receipt);log({endpoint:`${label}:native-ui-assist`,direction:'observed',message:receipt});
          await write(`${label}/pending-native-selection.json`,receipt);return receipt;
        }
        async function install() {
          await click('#sdk-refresh');await until(()=>evaluate(tool,`!!document.querySelector('#sdk-tab option[value="${tabId}"]')`),'explicit tab listed');
          const tabSelection=await selectNative('#sdk-tab',tabId);
          const documentId=await until(()=>evaluate(tool,'[...document.querySelector("#sdk-document").options].find(x=>x.textContent.startsWith("frame 0 "))?.value'),'native document ID');
          const documentSelection=await selectNative('#sdk-document',documentId);
          const choices=await evaluate(tool,'[...document.querySelectorAll("[name=sdk-capability]")].map(el=>({value:el.value,checked:el.checked}))');
          for(const choice of choices)if(choice.checked!==capabilities.includes(choice.value))await click(`[name="sdk-capability"][value="${choice.value}"]`);
          const actualCapabilities=await evaluate(tool,'[...document.querySelectorAll("[name=sdk-capability]:checked")].map(el=>el.value)');
          assert.deepEqual(actualCapabilities.sort(),[...capabilities].sort(),'Capabilities must be selected by native CDP clicks');
          const beforePermissions=await evaluate(tool,'chrome.permissions.getAll()');await click('#sdk-install');
          let ui;
          try { ui=await until(()=>evaluate(tool,'(()=>{const el=document.querySelector("#sdk-status");return ["installed","error"].includes(el.dataset.state)&&{state:el.dataset.state,text:el.textContent,raw:document.querySelector("#sdk-result").textContent};})()'),'native permission and installation',options.permissionTimeout); }
          catch(error) { if(!await evaluate(tool,'chrome.permissions.contains({origins:["http://127.0.0.1/*"]})'))error.code='E_NATIVE_PERMISSION_WAIT';throw error; }
          assert.equal(ui.state,'installed',ui.text);const result=JSON.parse(ui.raw);assert.equal(result.documentId,documentId);assert.equal(result.installed,true);
          session.target.documentId=documentId;
          nativeContext=await until(async()=>{
            for (const context of contexts.filter(x=>x.auxData?.isDefault===false)) {
              try { if(await evaluate(page,`!!globalThis.__openDeskSdkRelayV1 && chrome.runtime.id===${JSON.stringify(session.extensionId)}`,context.id))return context; } catch {}
            }
            return null;
          },'existing installed relay context (no newly created world)');
          return {ui,result,tabSelection,documentSelection,actualCapabilities,beforePermissions,afterPermissions:await evaluate(tool,'chrome.permissions.getAll()'),nativeContext};
        }
        let snapshotSequence=0;
        async function snapshot(tag,evidence) {
          const value=await evaluate(tool,`(${snapshotInTool.toString()})()`), relative=`${label}/snapshot-${++snapshotSequence}-${tag}.json`;
          await write(relative,value);(evidence.snapshots??=[]).push(relative);return value;
        }
        const native = payload => evaluate(page,`chrome.runtime.sendMessage(${JSON.stringify({protocol:PROTOCOL,type:'SDK_REQUEST',payload})})`,nativeContext.id);
        const payload = (method,args) => ({requestId:`b05-${randomUUID()}`,method,argsWire:encodeValue(args),deadlineAt:Date.now()+30000});
        const post = token => payload('AXIOS_POST',{url:`${origin}/hold?token=${token}`,data:{effect:token,f:false,z:0}});
        async function start(payload) {
          assert.deepEqual(Object.keys(payload).sort(),['argsWire','deadlineAt','method','requestId']);
          await evaluate(page,`__b05.requests[${JSON.stringify(payload.requestId)}]={settlements:0};${rawExpression(payload)}.then(value=>{const entry=__b05.requests[${JSON.stringify(payload.requestId)}];entry.settlements++;entry.response=value;});true`);
        }
        const observations=()=>evaluate(page,'__b05');
        async function startSdk(method,args,slot) {
          const count=(await observations()).events.length;
          await evaluate(page,`__b05.settlements[${JSON.stringify(slot)}]={settlements:0};${sdkExpression(method,args)}.then(response=>{
            const entry=__b05.settlements[${JSON.stringify(slot)}];entry.settlements++;entry.response=response;});true`);
          return until(async()=>{const event=(await observations()).events.slice(count).find(x=>x.name==='CHROME_BRIDGE_INTERFACE'&&x.message.payload?.method===method);
            return event?.message.payload;},'actual SDK invocation request');
        }
        async function resources() {
          const result={at:new Date().toISOString(),documentId:session.target.documentId,
            main:await evaluate(page,'OpenDeskSDK.diagnostics()'),relay:await evaluate(page,'__openDeskSdkRelayV1.diagnostics()',nativeContext.id),
            unobserved:['host.pending','timers','ports','workers','blobs','main.subscriptions']};
          assert(Number.isInteger(result.main.pending)&&Number.isInteger(result.relay.pending)&&Number.isInteger(result.relay.subscriptions));
          return result;
        }
        async function stopWorker(evidence) {
          const old=session.worker;
          const version=await until(()=>swEvents.flatMap(x=>x.params.versions||[]).filter(x=>x.scriptURL===old.url&&x.targetId===old.targetId&&x.runningStatus==='running').at(-1),'exact running SW version/target');
          const swEventStart=swEvents.length;
          const stop={version,targetId:old.targetId,requestedAt:new Date().toISOString()};evidence.workerStop=stop;
          await tool.send('ServiceWorker.stopWorker',{versionId:version.versionId});
          await until(async()=>!(await browser.send('Target.getTargets')).targetInfos.some(x=>x.targetId===old.targetId),'original SW target disappearance');
          stop.targetDestroyed=browserEvents.find(x=>x.method==='Target.targetDestroyed'&&x.params.targetId===old.targetId)??null;
          stop.versionStopped=await until(()=>swEvents.slice(swEventStart).flatMap(x=>x.params.versions||[]).find(x=>x.versionId===version.versionId&&x.scriptURL===old.url&&x.runningStatus==='stopped'),'exact native SW version stopped');
          stop.targetAbsent=true;stop.physicalTerminationObserved=true;
          workerClient.close();
          // A native Hello wakes recovery without allocating another SDK op.
          const wake=await evaluate(page,`chrome.runtime.sendMessage(${JSON.stringify({protocol:PROTOCOL,type:'SDK_HELLO',payload:{sdkVersion:SDK_VERSION}})})`,nativeContext.id);
          assert.equal(wake.ok,true,JSON.stringify(wake));stop.wake=wake;
          await until(worker,'replacement native SW');assert.notEqual(session.worker.targetId,old.targetId);stop.replacementTargetId=session.worker.targetId;
        }
        async function arm(pointId,evidence) {
          const point=barriers.points?.[pointId];if(!point)throw new NotObserved(`No unambiguous unchanged production source location for ${pointId}`);
          const client=workerClient,scripts=[],pauses=[];const off=client.on(event=>{if(event.method==='Debugger.scriptParsed')scripts.push(event.params);if(event.method==='Debugger.paused')pauses.push(event.params);});
          let breakpoint;
          try {
            await client.send('Debugger.enable');
            const script=await until(()=>scripts.find(x=>x.url===session.worker.url),'loaded production SW script');
            const actual=(await client.send('Debugger.getScriptSource',{scriptId:script.scriptId})).scriptSource;
            if(sha256(actual)!==barriers.sourceHash)throw new NotObserved('Debugger script differs from fingerprinted production sw.js');
            const available=(await client.send('Debugger.getPossibleBreakpoints',{start:{scriptId:script.scriptId,...point.location},end:{scriptId:script.scriptId,...point.endLocation},restrictToFunction:true})).locations;
            const location=available.find(x=>x.lineNumber===point.location.lineNumber&&x.columnNumber===point.location.columnNumber);
            if(!location)throw new NotObserved('CDP cannot break exactly before this call; nearest offset is not accepted');
            const result=await client.send('Debugger.setBreakpoint',{location});breakpoint=result.breakpointId;
            if(result.actualLocation.scriptId!==location.scriptId||result.actualLocation.lineNumber!==location.lineNumber||result.actualLocation.columnNumber!==location.columnNumber)
              throw new NotObserved('Debugger relocated the requested exact source breakpoint');
            evidence.barrier={sourceHash:barriers.sourceHash,...point,requestedLocation:location,actualLocation:result.actualLocation};
            return {client,scriptId:script.scriptId,async wait() {
              let paused;try {paused=await until(()=>pauses.find(x=>x.hitBreakpoints?.includes(breakpoint)),'exact native debugger barrier',6000);}catch{throw new NotObserved('Exact production debugger barrier did not fire');}
              const loc=paused.callFrames[0].location;
              if(loc.scriptId!==location.scriptId||loc.lineNumber!==location.lineNumber||loc.columnNumber!==location.columnNumber)throw new NotObserved('Paused at a different source location');
              evidence.barrier.paused=paused;
              if(point.payloadExpression) {
                evidence.pausedPayload=await readFrame(client,paused.callFrames[0],point.payloadExpression);
                assert.deepEqual(evidence.pausedPayload,evidence.payload,'Breakpoint must belong to the actual original invocation');
              }
              if(point.contextExpression) {
                evidence.pausedContext=await readFrame(client,paused.callFrames[0],`({requestId:${point.contextExpression}.requestId,
                  opId:${point.contextExpression}.opId,runId:${point.contextExpression}.runId,resultId:${point.contextExpression}.resultId,
                  requestDigest:${point.contextExpression}.requestDigest,grantIncarnation:${point.contextExpression}.grantIncarnation})`);
                assert.equal(evidence.pausedContext.requestId,evidence.payload.requestId);
              }
              if(point.senderExpression) {
                const observed=await client.send('Debugger.evaluateOnCallFrame',{callFrameId:paused.callFrames[0].callFrameId,expression:point.senderExpression,returnByValue:true,throwOnSideEffect:true,silent:true});
                if(observed.exceptionDetails)throw new NotObserved('Actual MessageSender is not observable in this paused frame');
                evidence.nativeSender=observed.result.value;
                assert.equal(evidence.nativeSender.id,session.extensionId);assert.equal(evidence.nativeSender.tab.id,tabId);
                assert.equal(evidence.nativeSender.frameId,0);assert.equal(evidence.nativeSender.documentId,session.target.documentId);
                assert.equal(evidence.nativeSender.documentLifecycle,'active');
              }
              return paused;
            }, async close() {off();try{await client.send('Debugger.removeBreakpoint',{breakpointId:breakpoint});await client.send('Debugger.resume');}catch{}try{await client.send('Debugger.disable');}catch{}}};
          } catch(error) {off();try{await client.send('Debugger.disable');}catch{}throw error;}
        }
        async function traceKv(client,scriptId,evidence) {
          const point=barriers.points?.['B05.native-kv-submission'];if(!point)throw new NotObserved('No exact native KV submission observation point');
          const locations=(await client.send('Debugger.getPossibleBreakpoints',{start:{scriptId,...point.location},end:{scriptId,...point.endLocation},restrictToFunction:true})).locations;
          const location=locations.find(x=>x.lineNumber===point.location.lineNumber&&x.columnNumber===point.location.columnNumber);
          if(!location)throw new NotObserved('Native KV post-submission location is not exactly breakable');
          const installed=await client.send('Debugger.setBreakpoint',{location});
          if(installed.actualLocation.lineNumber!==location.lineNumber||installed.actualLocation.columnNumber!==location.columnNumber)throw new NotObserved('Native KV tracer breakpoint relocated');
          const trace=evidence.nativeKvTrace??={sourceHash:barriers.sourceHash,point,submissions:[],errors:[],attachments:[]};
          trace.attachments.push({scriptId,location,actualLocation:installed.actualLocation});
          let handling=Promise.resolve();
          const off=client.on(event=>{if(event.method!=='Debugger.paused'||!event.params.hitBreakpoints?.includes(installed.breakpointId))return;
            handling=handling.then(async()=>{
              try {const observed=await inspectNativeKvSubmission(client,event.params,point);if(observed)trace.submissions.push({at:new Date().toISOString(),paused:event.params,...observed});}
              catch(error){trace.errors.push(projectError(error));}
              finally {try{await client.send('Debugger.resume');}catch{}}
            });
          });
          return {async close(){off();await handling;try{await client.send('Debugger.removeBreakpoint',{breakpointId:installed.breakpointId});}catch{}}};
        }
        const prerequisite=await caseRun(label,'B05.SDK.no-controller',async evidence=>{
          evidence.before=await evaluate(tool,'({tab:document.querySelector("#sdk-tab").value,document:document.querySelector("#sdk-document").value,disabled:document.querySelector("#sdk-install").disabled,capabilities:[...document.querySelectorAll("[name=sdk-capability]:checked")].map(x=>x.value)})');
          assert.equal(evidence.before.tab,'');assert.equal(evidence.before.document,'');assert.equal(evidence.before.disabled,true);assert.deepEqual(evidence.before.capabilities,[]);
          assert.equal(await evaluate(page,'typeof OpenDeskSDK'),'undefined');evidence.install=await install();
          evidence.hello=await evaluate(page,'OpenDeskSDK.ready()');assert.equal(evidence.hello.ready,true);assert.equal(evidence.hello.sdkVersion,SDK_VERSION);
          assert.deepEqual([...evidence.hello.methods].sort(),Object.entries(SDK_METHODS).filter(([,x])=>capabilities.includes(x.capability)).map(([x])=>x).sort());
          assert.equal(await evaluate(decoy,'typeof OpenDeskSDK'),'undefined');
          const snap=await snapshot('hello',evidence);assert(!snap.data.stores.runs.some(row=>row.value.tag!=='sdk-service'));
          const grants=snap.data.stores.commandJournal.filter(row=>row.value.tag==='sdk-grant'&&row.value.documentId===session.target.documentId&&row.value.active);assert.equal(grants.length,1);evidence.grants=grants;evidence.sdkObservations=await observations();
        });
        if(prerequisite.status!=='PASS')throw new NotObserved('Native product authorization prerequisite did not pass');
        const valueKey=`b05-value-${randomUUID()}`;
        await caseRun(label,'B05.SDK.promise-values',async evidence=>{
          evidence.set=await evaluate(page,sdkExpression('APPSTORAGE_SETITEM',{key:valueKey,value:false}));assert(evidence.set.ok&&evidence.set.undefinedResult);
          evidence.get=await evaluate(page,sdkExpression('APPSTORAGE_GETITEM',{key:valueKey}));assert.equal(evidence.get.value,'false');
          evidence.typed=await evaluate(page,`(async()=>{await OpenDeskSDK.call('CHROME_LOCAL_SET',{values:{${JSON.stringify(valueKey)}:{f:false,z:0,u:undefined}}});const value=await OpenDeskSDK.call('CHROME_LOCAL_GET',{key:${JSON.stringify(valueKey)}});return{f:value.f,z:value.z,ownUndefined:Object.hasOwn(value,'u')&&value.u===undefined};})()`);
          assert.deepEqual(evidence.typed,{f:false,z:0,ownUndefined:true});
          evidence.http=await evaluate(page,sdkExpression('AXIOS_POST',{url:`${origin}/echo`,data:{f:false,z:0}}));assert(evidence.http.ok);assert.equal(evidence.http.value.data.business.PageBrigeCode,9);assert.equal(evidence.http.value.data.zero,0);assert.equal(evidence.http.value.data.falseValue,false);
          evidence.sdkObservations=await observations();await snapshot('values',evidence);
        });
        let duplicatePayload,duplicateToken,duplicateDigest,pendingConflicts,revokedRequest;
        await caseRun(label,'B05.SDK.100-concurrent',async evidence=>{
          duplicateToken=`duplicate-${randomUUID()}`;duplicatePayload=post(duplicateToken);evidence.payload=duplicatePayload;evidence.nativeContext=nativeContext;
          // This is the existing relay's Chrome world, not 100 subscribers to a
          // single coalesced page event. Chrome creates every MessageSender.
          await evaluate(page,`globalThis.__b05Native100={submitted:0,settlements:0,responses:[]};globalThis.__b05Native100Promise=Promise.all(Array.from({length:100},()=>{__b05Native100.submitted++;return chrome.runtime.sendMessage(${JSON.stringify({protocol:PROTOCOL,type:'SDK_REQUEST',payload:duplicatePayload})}).then(response=>{__b05Native100.settlements++;__b05Native100.responses.push(response);return response;});}));true`,nativeContext.id);
          await until(()=>hits(duplicateToken).length===1,'one real server write');
          const pending=await snapshot('100-pending',evidence);const op=operation(pending,duplicatePayload);duplicateDigest=op.requestDigest;
          assert.equal(op.state,'dispatched');assert.equal(op.submissionCount,1);assert.equal(boundRows(pending,op).runs.length,1);assert.equal(boundRows(pending,op).results.length,0);
          pendingConflicts=[];
          for(const changed of [{...duplicatePayload,method:'AXIOS_PUT'},{...duplicatePayload,argsWire:encodeValue({url:`${origin}/hold?token=${duplicateToken}`,data:{different:true}})},{...duplicatePayload,deadlineAt:duplicatePayload.deadlineAt+1}]) {
            const response=await native(changed);assert.equal(response.ok,false);assert.equal(response.error.code,'E_REQUEST_CONFLICT');pendingConflicts.push({payload:changed,response});
          }
          evidence.pendingConflicts=pendingConflicts;assert.equal(hits(duplicateToken).length,1);
          release(duplicateToken);evidence.native100=await evaluate(page,'__b05Native100Promise.then(()=>__b05Native100)',nativeContext.id);
          assert.equal(evidence.native100.submitted,100);assert.equal(evidence.native100.settlements,100);assert.equal(evidence.native100.responses.length,100);
          assert(evidence.native100.responses.every(x=>x.ok===true&&Object.hasOwn(x.data??{},'valueWire')));
          for(const response of evidence.native100.responses)assert.deepEqual(response,evidence.native100.responses[0]);
          const snap=await snapshot('100-durable',evidence);evidence.rows=requireDurable(snap,duplicatePayload);assert.equal(evidence.rows.operation.requestDigest,duplicateDigest);
          evidence.measurements={requests:evidence.native100.submitted,controllerRuns:snap.data.stores.runs.filter(row=>row.value.tag==='controller-run').length,
            admissions:snap.data.stores.commandJournal.filter(row=>row.value.tag==='sdk-request'&&row.value.opKey===evidence.rows.operation.opKey).length,
            serviceRuns:evidence.rows.runs.length,operations:ops(snap).filter(row=>row.requestId===duplicatePayload.requestId).length,httpWrites:hits(duplicateToken).length};
          assert.equal(evidence.measurements.admissions,1);assert.equal(evidence.measurements.controllerRuns,0);
          evidence.pageReturn=await evaluate(page,rawExpression(duplicatePayload));assert.deepEqual(evidence.pageReturn,evidence.native100.responses[0]);
          evidence.effectCount=hits(duplicateToken).length;assert.equal(evidence.effectCount,1);evidence.http=hits(duplicateToken);evidence.sdkObservations=await observations();
        });
        await caseRun(label,'B05.SDK.conflict',async evidence=>{
          if(!duplicatePayload||!duplicateDigest||!report.cases.some(row=>row.label===label&&row.id==='B05.SDK.100-concurrent'&&row.status==='PASS'))throw new NotObserved('Successful native duplicate admission is required');
          evidence.payload=duplicatePayload;evidence.pendingConflicts=pendingConflicts;evidence.conflicts=[];
          for(const changed of [{...duplicatePayload,method:'AXIOS_PUT'},{...duplicatePayload,argsWire:encodeValue({url:`${origin}/hold?token=${duplicateToken}`,data:{different:true}})},{...duplicatePayload,deadlineAt:duplicatePayload.deadlineAt+1}]) {
            const response=await native(changed);assert.equal(response.ok,false);assert.equal(response.error.code,'E_REQUEST_CONFLICT');evidence.conflicts.push({payload:changed,response});
          }
          const snap=await snapshot('conflict',evidence);evidence.rows=requireDurable(snap,duplicatePayload);assert.equal(evidence.rows.operation.requestDigest,duplicateDigest);assert.equal(hits(duplicateToken).length,1);evidence.http=hits(duplicateToken);
          evidence.durableConflictCodes=evidence.conflicts.map(x=>x.response.error.code);
        });
        for(const c of CASES.filter(x=>x.readiness==='not-tested'))report.cases.push({id:c.id,label,status:'NOT_TESTED',reason:c.reason,...(c.interfaceRequest?{interfaceRequest:c.interfaceRequest}:{}),evidence:{}});
        await caseRun(label,CP1,async evidence=>{
          const token=`admission-abort-${randomUUID()}`,request=post(token);evidence.payload=request;
          const baseline=await snapshot('admission-baseline',evidence),
            grant=baseline.data.stores.commandJournal.map(row=>row.value).find(row=>row.tag==='sdk-grant'&&row.active&&row.documentId===session.target.documentId);
          if(!grant||!barriers.admission?.ready)throw new NotObserved('Original active grant / unchanged native admission selector unavailable');
          assert(!ops(baseline).some(op=>op.requestId===request.requestId));evidence.grant=grant;
          let barrier;
          try {
            barrier=await arm(CP1,evidence);await start(request);const paused=await barrier.wait();
            const inspection=await inspectPausedAdmission({client:barrier.client,paused,selector:barriers.admission,
              payload:request,args:decodeValue(request.argsWire),expected:{extensionId:session.extensionId,tabId,documentId:session.target.documentId,grant}});
            evidence.transaction=inspection.evidence;evidence.nativeSender=inspection.evidence.observed.sender;
            const aborted=inspection.evidence.observed.operation;
            assert.equal(hits(token).length,0);evidence.effectCountBefore=hits(token).length;
            // Do not issue another IDB transaction while this exclusive admission
            // is paused: it would block and alter the window we intend to observe.
            evidence.preStopPendingRequest=await inspection.pendingFact();await stopWorker(evidence);
            const recovered=await snapshot('admission-rollback',evidence),stores=recovered.data.stores;
            assert(!stores.commandJournal.some(row=>row.key===aborted.opKey||row.key===inspection.evidence.observed.lockKey||row.value.requestId===request.requestId));
            assert(!stores.runs.some(row=>row.key===aborted.runId));assert(!stores.results.some(row=>row.key===aborted.resultId));
            const restored=stores.commandJournal.map(row=>row.value).find(row=>row.tag==='sdk-grant'&&row.active&&row.documentId===grant.documentId);
            assert.deepEqual(restored,grant);assert.equal(hits(token).length,0);
            evidence.abortObservation={nativePersistentAtomicRollbackObserved:true,originalWorkerDestroyed:true,
              directAbortEvent:{status:'NOT_TESTED',reason:'Destroyed worker cannot report its native abort callback'},
              basis:'Exact pending native transaction before SW termination; invocation lock/op/run/result absent after native recovery'};
            evidence.original=await until(async()=>{const entry=(await observations()).requests[request.requestId];return entry?.response&&entry;},'original aborted page response');
            assert.equal(evidence.original.response.ok,false);assert.equal(evidence.original.settlements,1);
            const retry=native(request);await until(()=>hits(token).length===1,'first actual admission after native rollback');release(token);
            evidence.replay=await retry;assert.equal(evidence.replay.ok,true);
            const after=await snapshot('admission-first-retry',evidence);evidence.afterRows=requireDurable(after,request);
            const committed=evidence.afterRows.operation;
            for(const key of ['opId','runId','resultId'])assert.notEqual(committed[key],aborted[key],'Aborted identities must not be patched into a new admission');
            assert.equal(committed.grantIncarnation,grant.grantIncarnation);assert.equal(committed.requestDigest,aborted.requestDigest);
            assert.equal(committed.submissionCount,1);assert.equal(hits(token).length,1);evidence.http=hits(token);
            evidence.measurements={zeroEffectsBeforeRetry:evidence.effectCountBefore===0,atomicRollback:evidence.abortObservation.nativePersistentAtomicRollbackObserved,
              firstAdmissionAfterAbort:committed.opId!==aborted.opId,httpWrites:hits(token).length};
          } finally {if(barrier)await barrier.close();if(held.has(token))release(token);}
        });
        await caseRun(label,'F2-K2-SDK-018',async evidence=>{
          const key=`storage-cut-${randomUUID()}`,request=payload('APPSTORAGE_SETITEM',{key,value:false});evidence.payload=request;
          let barrier,tracer,recoveryBarrier,recoveryTracer;
          try {
            barrier=await arm('F2-K2-SDK-018',evidence);tracer=await traceKv(barrier.client,barrier.scriptId,evidence);
            await start(request);const paused=await barrier.wait(),point=barriers.points['F2-K2-SDK-018'];
            evidence.pausedStorage=await readFrame(barrier.client,paused.callFrames[0],
              `({result:${point.resultExpression},context:{requestId:${point.contextExpression}.requestId,
                opId:${point.contextExpression}.opId,runId:${point.contextExpression}.runId,resultId:${point.contextExpression}.resultId,
                requestDigest:${point.contextExpression}.requestDigest,grantIncarnation:${point.contextExpression}.grantIncarnation}})`);
            const before=await snapshot('storage-durable-before-broker',evidence);evidence.beforeRows=requireDurable(before,request);
            const op=evidence.beforeRows.operation,run=evidence.beforeRows.runs[0].value;
            if(run.state!=='preparing'||op.deliveryState!==undefined||op.nativeReceiptWire!==undefined)throw new NotObserved('Storage durable/pre-broker-receipt window missed');
            assert.equal(op.storageRequestDigest,evidence.pausedStorage.result.storageRequestDigest);
            assert.deepEqual(evidence.pausedStorage.result,evidence.beforeRows.results[0].value);
            assert.equal(evidence.pausedStorage.context.requestId,request.requestId);assert.equal(evidence.pausedStorage.result.resultId,op.resultId);
            const kv=before.data.stores.frameworkKV.filter(row=>row.value.namespace===op.namespace&&row.value.key===key);assert.equal(kv.length,1);
            assert.equal(decodeValue(kv[0].value.valueWire),'false');evidence.kvBefore=kv;
            const writes=()=>evidence.nativeKvTrace.submissions.filter(row=>row.value.namespace===op.namespace&&row.value.key===key);
            if(evidence.nativeKvTrace.errors.length)throw new NotObserved('Native KV submission trace incomplete');assert.equal(writes().length,1);
            evidence.barrier.observedState={state:op.state,runState:run.state,resultId:op.resultId,nativeKvSubmissions:writes().length,brokerReceiptPresent:false};
            await stopWorker(evidence);await tracer.close();tracer=null;await barrier.close();barrier=null;
            // Reattach the same native request observer to the replacement SW.
            // A replaying storage driver must stop at the cut again, never escape
            // observation simply because the original debugger target vanished.
            const replacementEvidence={};recoveryBarrier=await arm('F2-K2-SDK-018',replacementEvidence);
            recoveryTracer=await traceKv(recoveryBarrier.client,recoveryBarrier.scriptId,evidence);
            const recovered=await snapshot('storage-recovered',evidence),recoveredOp=operation(recovered,request);
            assert.equal(boundRows(recovered,recoveredOp).runs[0].value.state,'completed');
            evidence.replay=await native(request);assert.equal(evidence.replay.ok,true);
            const after=await snapshot('storage-retry',evidence);evidence.afterRows=requireDurable(after,request);
            const afterOp=evidence.afterRows.operation;
            for(const field of ['opId','runId','resultId','requestDigest','grantIncarnation'])assert.equal(afterOp[field],op[field]);
            assert.deepEqual(evidence.afterRows.results,evidence.beforeRows.results,'Storage receipt must be the original atomic committed result');
            assert.deepEqual(after.data.stores.frameworkKV.filter(row=>row.value.namespace===op.namespace&&row.value.key===key),kv);
            if(evidence.nativeKvTrace.errors.length)throw new NotObserved('Native KV recovery trace incomplete');assert.equal(writes().length,1);
            evidence.measurements={nativeKvSubmissions:writes().length,replayed:writes().length>1,originalIdentityPreserved:afterOp.opId===op.opId};
          } finally {if(recoveryTracer)await recoveryTracer.close();if(recoveryBarrier)await recoveryBarrier.close();if(tracer)await tracer.close();if(barrier)await barrier.close();}
        });
        let unknownPublic;
        for (const pointId of [CP2,CP3,CP4,'F2-K2-SDK-019']) await caseRun(label,pointId,async evidence=>{
          const token=`crash-${randomUUID()}`;let request=post(token),barrier;
          const dispatchedCut=pointId==='F2-K2-SDK-019';
          try {
            if(pointId!==CP3)barrier=await arm(pointId,evidence);
            if(pointId===CP3)request=await startSdk('AXIOS_POST',decodeValue(request.argsWire),'unknown');else await start(request);
            evidence.payload=request;
            if(pointId===CP2||dispatchedCut)await barrier.wait();
            else {await until(()=>hits(token).length===1,'server observed actual POST');if(pointId===CP4){release(token);await barrier.wait();}}
            const before=await snapshot('crash-before',evidence),op=operation(before,request);evidence.beforeRows=boundRows(before,op);evidence.effectCountBefore=hits(token).length;
            if(evidence.pausedContext)for(const field of ['opId','runId','resultId','requestDigest','grantIncarnation'])assert.equal(evidence.pausedContext[field],op[field]);
            const wanted=pointId===CP2?'admitted':pointId===CP3||dispatchedCut?'dispatched':'durable';
            if(op.state!==wanted||hits(token).length!==(pointId===CP2||dispatchedCut?0:1))throw new NotObserved(`Required crash window not observed: state=${op.state}, writes=${hits(token).length}`);
            if(pointId===CP3&&(op.nativeReceiptWire||evidence.beforeRows.results.length))throw new NotObserved('Receipt already exists; after-effect/before-receipt window was missed');
            if(pointId===CP4){requireDurable(before,request);if(op.deliveryState==='response_ready')throw new NotObserved('Response was already ready before the barrier');}
            if(evidence.barrier)evidence.barrier.observedState={state:op.state,submissionCount:op.submissionCount,results:evidence.beforeRows.results.length,httpWrites:hits(token).length};
            await stopWorker(evidence);if(held.has(token))release(token);
            const recovered=await snapshot('crash-recovered',evidence),recoveredOp=operation(recovered,request);
            assert.equal(recoveredOp.opId,op.opId);assert.equal(recoveredOp.runId,op.runId);assert.equal(recoveredOp.requestDigest,op.requestDigest);
            if(pointId===CP2) {
              // Original admission is resumed once, before any native dispatch.
              const retry=native(request);await until(()=>hits(token).length===1,'recovered original admission dispatch');release(token);evidence.replay=await retry;assert.equal(evidence.replay.ok,true);
            } else {evidence.replay=await native(request);assert.equal(evidence.replay.ok,pointId===CP4);if(pointId===CP3||dispatchedCut){assert.equal(recoveredOp.state,'effect_unknown');assertPublicUnknown(evidence.replay,request,recoveredOp);assert.equal(boundRows(recovered,recoveredOp).runs[0].value.state,'paused_unknown');}}
            const after=await snapshot('crash-after',evidence),afterOp=operation(after,request);assert.equal(afterOp.opId,op.opId);assert.equal(afterOp.runId,op.runId);assert.equal(afterOp.requestDigest,op.requestDigest);
            assert.equal(afterOp.submissionCount,1);evidence.afterRows=boundRows(after,afterOp);evidence.effectCountAfter=hits(token).length;assert.equal(evidence.effectCountAfter,dispatchedCut?0:1);evidence.http=hits(token);evidence.sdkObservations=await observations();
            evidence.measurements={controllerRuns:after.data.stores.runs.filter(row=>row.value.tag==='controller-run').length,
              swTerminated:evidence.workerStop.physicalTerminationObserved===true,originalIdentityPreserved:afterOp.opId===op.opId&&afterOp.runId===op.runId&&afterOp.requestDigest===op.requestDigest,
              httpWrites:hits(token).length,outcome:evidence.replay.ok?'settled':evidence.replay.error.code,replayed:hits(token).length>(dispatchedCut?0:1)};
            if(pointId!==CP3&&!dispatchedCut) {
              const durable=requireDurable(after,request);
              assert.deepEqual(decodeValue(evidence.replay.data.valueWire).data,decodeValue(durable.results[0].value.valueWire));
              if(pointId===CP4)assert.deepEqual(evidence.beforeRows.results,durable.results,'Durable receipt must remain the original stored result');
            }
            if(pointId===CP3) {
              evidence.originalSdk=await until(async()=>{const entry=(await observations()).settlements.unknown;return entry?.response&&entry;},'original SDK Promise settles');
              unknownPublic={payload:request,original:evidence.originalSdk,replay:evidence.replay,operation:afterOp,http:hits(token),pageReplay:await evaluate(page,rawExpression(request))};
            }
          } finally {if(barrier)await barrier.close();if(held.has(token))release(token);}
        });
        await caseRun(label,'B05.SDK.unknown-public-reference',async evidence=>{
          if(!unknownPublic)throw new NotObserved('Real public SDK invocation at the unknown crash point was not observed');
          Object.assign(evidence,unknownPublic);assert.equal(evidence.original.settlements,1);
          assertPublicUnknown(evidence.replay,evidence.payload,evidence.operation);
          assertPublicUnknown(evidence.pageReplay,evidence.payload,evidence.operation);
          if(!evidence.original.response.error?.invocation)throw new NotObserved('Original SDK Promise lost the worker callback before a broker reference could arrive; native/page replay references observed, original public error reference unavailable');
          assertPublicUnknown(evidence.original.response,evidence.payload,evidence.operation);
          assert(evidence.original.response.publicErrorKeys.every(key=>['code','stage','status','response','invocation'].includes(key)),'Original SDK Error exposes non-public fields');
          assert.equal(evidence.http.length,1);await snapshot('unknown-public-reference',evidence);
        });
        await caseRun(label,'B05.SDK.revocation-no-replay',async evidence=>{
          const token=`revoke-${randomUUID()}`;evidence.resources={status:'NOT_TESTED',before:await resources(),reason:'Host/timer/port/worker/blob counters are not exposed'};
          let request,barrier;
          try {
            barrier=await arm(CP2,evidence);request=await startSdk('AXIOS_POST',decodeValue(post(token).argsWire),'revocation');evidence.payload=request;
            await barrier.wait();evidence.resources.admitted=await resources();
          } finally {if(barrier)await barrier.close();}
          revokedRequest=request;evidence.payload=request;await until(()=>hits(token).length===1,'pre-revocation native write');
          const before=operation(await snapshot('revoke-before',evidence),request);
          evidence.removed=await evaluate(tool,'chrome.permissions.remove({origins:["http://127.0.0.1/*"]})');assert.equal(evidence.removed,true);release(token);
          evidence.denied=await native(request);assert.equal(evidence.denied.ok,false);assert(['E_PERMISSION','E_GRANT_REVOKED'].includes(evidence.denied.error.code));
          evidence.resources.after=await until(async()=>{const value=await resources();return value.main.pending===0&&value.relay.pending===0&&value;},'revocation retires visible pending SDK and relay requests');
          assert.equal(evidence.resources.after.relay.subscriptions,evidence.resources.before.relay.subscriptions);
          evidence.originalSdk=(await observations()).settlements.revocation;assert.equal(evidence.originalSdk.settlements,1);assert.equal(evidence.originalSdk.response.ok,false);
          evidence.regrant=await install();evidence.old=await native(request);assert.equal(evidence.old.ok,false);assert.equal(evidence.old.error.code,'E_GRANT_REVOKED');
          const after=operation(await snapshot('revoke-after',evidence),request);assert.equal(after.opId,before.opId);assert.equal(after.grantIncarnation,before.grantIncarnation);assert.equal(hits(token).length,1);evidence.http=hits(token);evidence.sdkObservations=await observations();
        });
        await caseRun(label,'B05.SDK.regrant-origin-restart',async evidence=>{
          if(!revokedRequest)throw new NotObserved('Real permission removal and explicit regrant are required');
          evidence.contractCase='F2-K2-SDK-017';evidence.variant='origin';evidence.oldPayload=revokedRequest;
          const before=await snapshot('regrant-restart-before',evidence);
          const grant=before.data.stores.commandJournal.map(row=>row.value).find(row=>row.tag==='sdk-grant'&&row.active&&row.documentId===session.target.documentId);
          if(!grant||grant.permissionEpoch<=0)throw new NotObserved('Committed post-removal grant epoch is not observable');evidence.grant=grant;
          const key=`regrant-${randomUUID()}`,set=payload('APPLOCAL_SETITEM',{key,value:0});evidence.sessionSet=await native(set);assert.equal(evidence.sessionSet.ok,true);
          await stopWorker(evidence);
          evidence.hello=await evaluate(page,`chrome.runtime.sendMessage(${JSON.stringify({protocol:PROTOCOL,type:'SDK_HELLO',payload:{sdkVersion:SDK_VERSION}})})`,nativeContext.id);
          assert.equal(evidence.hello.ok,true);assert.equal(evidence.hello.data.ready,true);
          evidence.old=await native(revokedRequest);assert.equal(evidence.old.ok,false);assert.equal(evidence.old.error.code,'E_GRANT_REVOKED');
          evidence.fresh=await native(payload('APPLOCAL_GETITEM',{key}));assert.equal(evidence.fresh.ok,true);assert.equal(decodeValue(evidence.fresh.data.valueWire).data,0);
          const after=await snapshot('regrant-restart-after',evidence),restored=after.data.stores.commandJournal.map(row=>row.value).find(row=>row.tag==='sdk-grant'&&row.active&&row.documentId===grant.documentId);
          assert.equal(restored.grantIncarnation,grant.grantIncarnation);assert.equal(restored.permissionEpoch,grant.permissionEpoch);
          assert.equal(operation(after,revokedRequest).grantIncarnation,operation(before,revokedRequest).grantIncarnation);evidence.restoredGrant=restored;
          evidence.notTestedVariants=['navigation old-sender negative control','notification permission removal/regrant'];
        });
        await caseRun(label,'B05.SDK.navigation-no-replay',async evidence=>{
          const token=`navigate-${randomUUID()}`;evidence.resources={status:'NOT_TESTED',before:await resources(),reason:'Destroyed-document and host resources cannot be fully observed'};
          let request,barrier;
          try {barrier=await arm(CP2,evidence);request=await startSdk('AXIOS_POST',decodeValue(post(token).argsWire),'navigation');evidence.payload=request;await barrier.wait();}
          finally {if(barrier)await barrier.close();}
          evidence.payload=request;await until(()=>hits(token).length===1,'old document native write');
          const before=operation(await snapshot('navigation-before',evidence),request),previous=session.target.documentId;evidence.before=before;evidence.previousDocumentId=previous;
          evidence.resources.pendingBeforeNavigation=await resources();assert(evidence.resources.pendingBeforeNavigation.main.pending>=1);assert(evidence.resources.pendingBeforeNavigation.relay.pending>=1);
          evidence.originalSdkBeforeDestruction=(await observations()).settlements.navigation;assert.equal(evidence.originalSdkBeforeDestruction.settlements,0);
          const oldContexts=contexts.filter(x=>x.auxData?.isDefault||x.id===nativeContext.id),pageEventStart=pageEvents.length;
          evidence.contextsBeforeNavigation=oldContexts;
          await page.send('Page.navigate',{url:`${origin}/target?navigated=${token}`});await until(()=>evaluate(page,'document.readyState==="complete"&&location.search.includes("navigated=")'),'actual native navigation');
          evidence.navigationEvents=pageEvents.slice(pageEventStart).filter(x=>['Page.frameNavigated','Runtime.executionContextDestroyed','Runtime.executionContextsCleared','Runtime.executionContextCreated'].includes(x.method));
          if(!evidence.navigationEvents.some(x=>x.method==='Runtime.executionContextsCleared'||x.method==='Runtime.executionContextDestroyed'&&oldContexts.some(context=>context.id===x.params.executionContextId)))throw new NotObserved('Native old-document context destruction was not observed');
          assert.equal(await evaluate(page,'typeof OpenDeskSDK'),'undefined');release(token);
          const snap=await snapshot('navigation-fence',evidence),oldGrants=snap.data.stores.commandJournal.filter(row=>row.value.tag==='sdk-grant'&&row.value.documentId===previous);
          assert(oldGrants.length&&oldGrants.every(row=>!row.value.active));evidence.oldGrants=oldGrants;
          await evaluate(page,`(${observePage.toString()})()`);evidence.newInstall=await install();assert.notEqual(session.target.documentId,previous);
          // Native old sender cannot be reconstructed after document destruction.
          // Do not submit its ID in the new document: that would be a new key.
          evidence.oldSenderReplay={status:'NOT_TESTED',reason:'Destroyed native document cannot emit an authentic old-document MessageSender'};
          evidence.newHello=await evaluate(page,'OpenDeskSDK.ready()');assert.equal(evidence.newHello.ready,true);
          const after=operation(await snapshot('navigation-after',evidence),request);assert.equal(after.documentId,previous);assert.equal(after.opId,before.opId);assert.equal(hits(token).length,1);evidence.http=hits(token);
          evidence.resources.newDocument=await resources();assert.equal(evidence.resources.newDocument.main.pending,0);assert.equal(evidence.resources.newDocument.relay.pending,0);
          assert.equal(evidence.resources.newDocument.relay.subscriptions,evidence.resources.before.relay.subscriptions);
          evidence.originalPromiseAfterDestruction={status:'NOT_TESTED',reason:'Original document JS context was destroyed; no forged rejection is counted'};
        });
        await caseRun(label,'B05.SDK.delivery-failure',async evidence=>{
          const token=`delivery-${randomUUID()}`;
          await evaluate(page,`globalThis.__b05Delivery={settlements:0};(${sdkCall.toString()})('AXIOS_POST',{url:${JSON.stringify(`${origin}/hold?token=${token}`)},data:{effect:true}}).then(response=>{__b05Delivery.settlements++;__b05Delivery.response=response;});true`);
          await until(()=>hits(token).length===1,'pending fixed SDK write');
          const event=(await observations()).events.filter(x=>x.name==='CHROME_BRIDGE_INTERFACE'&&x.message.payload.method==='AXIOS_POST').at(-1);evidence.payload=event.message.payload;
          await evaluate(page,'OpenDeskSDK.dispose();true');evidence.original=await until(()=>evaluate(page,'__b05Delivery.response&&__b05Delivery'),'original SDK cancellation');
          assert.equal(evidence.original.settlements,1);assert.equal(evidence.original.response.ok,false);assert.equal(evidence.original.response.error.code,'E_CANCELLED');release(token);
          let snap;await until(async()=>{snap=await snapshot('delivery-wait',evidence);return ops(snap).find(x=>x.requestId===evidence.payload.requestId)?.state==='durable';},'effect remains durable after SDK disposal');
          evidence.rows=requireDurable(snap,evidence.payload);evidence.replay=await native(evidence.payload);assert.equal(evidence.replay.ok,true);
          const after=await snapshot('delivery-after',evidence);evidence.afterRows=requireDurable(after,evidence.payload);assert.equal(evidence.afterRows.operation.deliveryState,'response_ready');
          assert.equal(evidence.afterRows.operation.opId,evidence.rows.operation.opId);assert.deepEqual(evidence.afterRows.results,evidence.rows.results);
          assert.equal(hits(token).length,1);evidence.http=hits(token);evidence.sdkObservations=await observations();
          assert.equal((await evaluate(page,'__b05Delivery')).settlements,1);
        });
      } catch(error) {
        session.error=projectError(error);
        for(const c of CASES)if(!report.cases.some(x=>x.label===label&&x.id===c.id))report.cases.push({id:c.id,label,status:'NOT_TESTED',reason:`Prerequisite/session unavailable: ${error.message}`,evidence:{}});
      } finally {
        for(const client of clients)client.close();
        if(session.launcher.metadata?.log)try {
          await writeFile(path.join(directory,'chrome-log-before-exit.txt'),await readFile(session.launcher.metadata.log));
        } catch(error){session.logCaptureError=projectError(error);}
        if(browser)browser.close();
        // The still-owned launcher handles its Chrome process and profile.
        if(child.exitCode===null&&child.signalCode===null)child.kill('SIGTERM');
        let exit=await Promise.race([exited,sleep(12000).then(()=>null)]);
        if(!exit&&pidAlive(child.pid)===true){child.kill('SIGTERM');exit=await Promise.race([exited,sleep(12000).then(()=>null)]);}
        // Never SIGKILL Python: its finally block owns temporary profile deletion.
        // A stubborn, verified, owned Chrome main may be killed so Python can reap it.
        if(!exit&&session.launcher.actualProcess&&pidAlive(session.pid)===true) {
          try {
            const current=await processArguments(session.pid);session.launcher.fallbackProcessObservation=current;
            if(isOwnedChromeProcess(current,{pid:session.pid,launcherPid:child.pid,executable:binary,profile:session.profile})) {
              process.kill(session.pid,'SIGKILL');exit=await Promise.race([exited,sleep(12000).then(()=>null)]);
            } else session.cleanupError={code:'E_OWNERSHIP_CHANGED',message:'Fallback refused: Chrome PID/parent/executable/profile no longer matches'};
          } catch(error) {if(error.code!=='ESRCH')session.cleanupError=projectError(error);}
        }
        session.exit=exit;session.pidAliveAfterExit=pidAlive(session.pid);session.launcherAliveAfterExit=pidAlive(child.pid);
        if(!exit)session.cleanupError={code:'E_LAUNCHER_CLEANUP_INCOMPLETE',message:'Launcher did not exit; no profile-cleanup claim'};
        if(session.profile) {
          try {await stat(session.profile);session.profileRemoved=false;}
          catch(error){if(error.code==='ENOENT')session.profileRemoved=true;else throw error;}
        }else session.profileRemoved=null;
        await writeFile(path.join(directory,'launcher-stdout.txt'),stdout);await writeFile(path.join(directory,'launcher-stderr.txt'),stderr);
        await write(`${label}/session-cleanup.json`,{pid:session.pid??null,launcherPid:child.pid??null,exit:session.exit,
          pidAliveAfterExit:session.pidAliveAfterExit,launcherAliveAfterExit:session.launcherAliveAfterExit,
          profile:session.profile??null,profileRemoved:session.profileRemoved,cleanupError:session.cleanupError??null});
      }
    }
  } catch(error) {report.error=projectError(error);}
  finally {
    for(const response of held.values())response.destroy();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
    report.packageAfter=await fingerprint(options.extension);report.packageDrift=report.packageAfter.packageHash!==packageBefore.packageHash;
    const inputsAfter=await inputIdentity();
    report.candidateAfter={productInputsSha256:inputsAfter.productInputsSha256,verificationInputsSha256:inputsAfter.verificationInputsSha256,
      packageHashes:Object.fromEntries(await Promise.all(['production','development'].map(async mode=>[mode,(await fingerprint(path.join(root,'dist',mode))).packageHash]))),
      zipHashes:Object.fromEntries(await Promise.all(['production','development'].map(async mode=>[mode,sha256(await readFile(path.join(root,'artifacts',`opendesk-browser-${mode}.zip`)))])))};
    report.candidateDrift=JSON.stringify(candidateBefore)!==JSON.stringify(report.candidateAfter);
    report.sourceDrift=[];
    for(const input of report.contractInputs??[]) {
      try {const bytes=await readFile(input.path),afterHash=sha256(bytes);if(afterHash!==input.sha256)report.sourceDrift.push({path:input.path,before:input.sha256,after:afterHash});}
      catch(error) {report.sourceDrift.push({path:input.path,error:projectError(error)});}
    }
    for(const label of options.labels)for(const c of CASES)if(!report.cases.some(x=>x.label===label&&x.id===c.id))report.cases.push({id:c.id,label,status:'NOT_TESTED',reason:'Session did not reach this required case',evidence:{}});
    report.summary=Object.fromEntries(['PASS','FAIL','BLOCKED','NOT_TESTED'].map(status=>[status,report.cases.filter(x=>x.status===status).length]));
    report.environments=[];
    for(const session of report.sessions) {
      if(!session.version||!session.extensionId)continue;
      const relative=`${session.label}/version.json`;await write(relative,{version:session.version,binary:session.binary,nativeProcesses:session.nativeProcesses});
      const bytes=await readFile(path.join(output,relative));
      report.environments.push({id:session.label==='138'?'minimum':'stable',role:session.label==='138'?'minimum':'stable',
        chromeVersion:session.version.product.split('/').at(-1),os:{type:os.type(),release:os.release(),arch:os.arch()},
        profile:session.profile,extensionId:session.extensionId,binarySha256:session.binary.sha256,binary:{path:session.binary.path,sha256:session.binary.sha256},
        versionEvidence:{path:path.join(output,relative),sha256:sha256(bytes)}});
    }
    // Separate observations for each actual environment. Missing environments
    // stay missing. This is not a strictcandidate manifest or a campaign claim.
    const records=new Map();
    for(const record of report.cases) {
      let group=records.get(record.id);if(!group){group={id:record.id,layer:'native-product',productPackageSha256:packageBefore.packageHash,packageDrift:report.packageDrift,sourceDrift:Boolean(report.sourceDrift.length),executionStatuses:[],observations:[]};records.set(record.id,group);}
      group.executionStatuses.push({label:record.label,status:record.status,...(record.reason?{reason:record.reason}:{}),
        ...(record.interfaceRequest?{interfaceRequest:record.interfaceRequest}:{})});
      const env=report.environments.find(x=>x.id===(record.label==='138'?'minimum':'stable'));
      if(!env||!record.startedAt)continue;
      const relative=`${record.label}/case-${record.id.replaceAll(/[^a-zA-Z0-9_-]/g,'_')}.json`;await write(relative,record);
      const bytes=await readFile(path.join(output,relative));
      group.observations.push({environmentId:env.id,pass:record.status==='PASS',status:record.status,startedAt:record.startedAt,endedAt:record.endedAt,
        preconditions:{realChrome:true,isolatedProfile:env.profile,packageHash:packageBefore.packageHash},input:record.evidence.payload??record.evidence.oldPayload??null,
        expected:EXPECTATIONS[record.id]??{requiredCase:record.id},actual:record.evidence,
        evidence:[{path:path.join(output,relative),sha256:sha256(bytes)}],...(record.measurements?{measurements:record.measurements}:{}),
        cleanup:{status:'NOT_TESTED',before:record.evidence.resources?.before??null,after:record.evidence.resources?.after??record.evidence.resources?.newDocument??null,
          ...(record.evidence.resources?{productObservations:record.evidence.resources}:{}),
          unobserved:record.evidence.resources?.before?.unobserved??['pending','timers','subscriptions','ports','workers','blobs'],
          sessionTeardown:(()=>{const session=report.sessions.find(x=>x.label===record.label);return{
            pid:session.pid??null,launcherPid:session.launcher.pid??null,pidAliveAfterExit:session.pidAliveAfterExit,
            launcherAliveAfterExit:session.launcherAliveAfterExit,profileRemoved:session.profileRemoved};})(),
          scope:'Session teardown observations are not a per-case product resource baseline'}});
    }
    for(const group of records.values())group.pass=options.labels.every(label=>group.observations.some(x=>x.environmentId===(label==='138'?'minimum':'stable')&&x.pass));
    const rawRefs=[];
    for(const relative of ['raw-cdp.jsonl','raw-server.jsonl']) {
      try {const bytes=await readFile(path.join(output,relative));rawRefs.push({path:path.join(output,relative),sha256:sha256(bytes)});}catch{}
    }
    for(const group of records.values()) {
      const contract=binding.contracts[group.id];
      if(contract){group.contractSha256=contract.contractSha256;group.contractBinding={kind:'frozen-original',...contract};}
      else {
        const additional=binding.additionalSdkContracts.find(row=>row.id===group.id);
        group.contractBinding=additional?{kind:'current-additional',rowSha256:additional.rowSha256,ledgerReference:binding.ledgerReference}:
          {kind:'bounded-slice',reason:'This ID is not an original frozen case; it does not close a parent contract'};
      }
      group.sourceHashes={...binding.sourceHashes};
      for(const observation of group.observations) {
        observation.evidence.push(...rawRefs);
        const label=observation.environmentId==='minimum'?'138':'154';
        for(const relative of [`${label}/launcher-report.json`,`${label}/launch-process.json`,`${label}/session-cleanup.json`]) {
          const bytes=await readFile(path.join(output,relative));observation.evidence.push({path:path.join(output,relative),sha256:sha256(bytes)});
        }
        for(const relative of observation.actual.snapshots??[]) {
          const bytes=await readFile(path.join(output,relative));observation.evidence.push({path:path.join(output,relative),sha256:sha256(bytes)});
        }
      }
    }
    report.resultRecords=[...records.values()];
    report.cleanup={serverClosed:true,pidsTerminated:report.sessions.every(x=>x.pidAliveAfterExit===false&&x.launcherAliveAfterExit===false),
      profilesRemoved:report.sessions.every(x=>x.profileRemoved===true),productResourceBaseline:{status:'NOT_TESTED',
        unobserved:['pending','timers','subscriptions','ports','workers','blobs']}};
    report.notClaimed=['full B05 closure','destroyed-worker native abort callback','all original603 cases','1000 mixed rounds','10 reconnect rounds','2 plugin disables','independent final review','browser session storage lifetime'];
    await write('schema.json',evidenceSchema);await write('barrier-plan.json',barriers);await write('raw-server.json',http);await write('results.json',{results:report.resultRecords});await write('report.json',report);
  }
  console.log(JSON.stringify({output,summary:report.summary,packageDrift:report.packageDrift,b05Closed:false}));
  if(report.error||report.candidateDrift||report.packageDrift||report.sourceDrift.length||report.sessions.some(x=>x.error||x.cleanupError)||!report.cleanup.pidsTerminated||!report.cleanup.profilesRemoved||report.summary.FAIL||report.summary.BLOCKED)process.exitCode=1;
  else if(report.summary.NOT_TESTED)process.exitCode=3;
  return report;
}

async function main() {
  const argv=process.argv.slice(2), flag=name=>argv.includes(`--${name}`);
  const option=(name,fallback)=>argv.find(x=>x.startsWith(`--${name}=`))?.slice(name.length+3)??fallback;
  const allowed=new Set(['help','schema','inspect-package','run','chrome','binary','extension','expected-package-hash','headed','permission-timeout','native-ui-assist','cases']);
  for(const arg of argv)assert(allowed.has(arg.slice(2).split('=')[0]),`Unknown argument: ${arg}`);
  if(flag('help')){console.log('No browser is launched by --help. Use --schema or --inspect-package; native execution requires --run --expected-package-hash=SHA256.');return;}
  if(flag('schema')){console.log(JSON.stringify({evidenceSchema,cases:CASES},null,2));return;}
  if(!flag('run')&&!flag('inspect-package')) {
    console.log('B05 preparation runner. No browser/build by default.\n'+
      '  --inspect-package [--extension=/absolute/existing/production]  read-only hash/AST inspection\n'+
      '  --schema  print native evidence schema and required cases\n'+
      '  --run --expected-package-hash=SHA256 --headed --native-ui-assist [--chrome=138|154|all]\n'+
      '        [--cases=comma-separated-exact-IDs (prerequisites included; other cases NOT_TESTED)]\n'+
      '        [--binary=/absolute/chrome (one label only)] [--permission-timeout=120000]\n'+
      'Evidence/profile: a fresh OS temp directory. Exit 0=bounded selected assertions; 1=failure; 3=NOT_TESTED.\n'+
      'CP1/storage exact native observations are conditional; missing facts stay NOT_TESTED. This runner never closes B05/F3/603.');return;
  }
  const extension=await realpath(option('extension',path.join(root,'dist/production')));
  assert.equal(extension,await realpath(path.join(root,'dist/production')),'This lane loads the already built production directory verbatim');
  const packageBefore=await fingerprint(extension),source=await readFile(path.join(extension,'sw.js'),'utf8'),barriers=discoverBarriers(source);
  const binding=await loadContractBindings();
  if(flag('inspect-package')) {console.log(JSON.stringify({extension,packageHash:packageBefore.packageHash,barriers,cases:CASES,
    approvedContract:{round:binding.round,manifestReference:binding.manifestReference,specReference:binding.specReference,
      originalCaseCount:binding.originalCaseCount,contracts:binding.contracts},sourceHashes:binding.sourceHashes,
    additionalSdkContracts:binding.additionalSdkContracts,launcher:{python:PYTHON,path:LAUNCHER,sha256:binding.sourceHashes[LAUNCHER],
      nativeValidation:'NOT_TESTED by this lane; leader owns no-extension launcher smoke'}},null,2));return;}
  assert.equal(process.cwd(),root,`Run with cwd=${root}`);
  assert(flag('headed')&&flag('native-ui-assist'),'Native SDK installation requires --headed --native-ui-assist and genuine CUA select/permission input');
  const expected=option('expected-package-hash');assert(/^[a-f0-9]{64}$/.test(expected??''),'Pin the already built production package hash before --run');
  assert.equal(packageBefore.packageHash,expected,'Package changed since approved inspection');
  assert.equal(typeof WebSocket,'function','Use the existing Node runtime with global WebSocket (Node 22+); do not install dependencies');
  const label=option('chrome','all'),labels=label==='all'?['138','154']:[label];assert(labels.every(x=>['138','154'].includes(x)));
  const binary=option('binary');assert(!binary||labels.length===1,'Custom binary requires one explicit Chrome label');
  const permissionTimeout=Number(option('permission-timeout',flag('headed')?'120000':'20000'));assert(Number.isSafeInteger(permissionTimeout)&&permissionTimeout>0&&permissionTimeout<=300000);
  const requestedCases=option('cases')?.split(',');
  const selectedCases=requestedCases?selectCaseSlice(requestedCases):null;
  await runNative({extension,labels,binary,headed:flag('headed'),nativeUiAssist:flag('native-ui-assist'),permissionTimeout,
    binding,requestedCases,selectedCases},packageBefore,barriers);
}

export function selectCaseSlice(requested) {
  assert(requested.length>0&&requested.every(id=>CASES.some(row=>row.id===id)),'Slice uses exact required case IDs');
  const selected=new Set(['B05.SDK.no-controller',...requested]);
  const prerequisites={'B05.SDK.conflict':['B05.SDK.100-concurrent'],
    'B05.SDK.regrant-origin-restart':['B05.SDK.revocation-no-replay'],'B05.SDK.unknown-public-reference':[CP3]};
  for(const id of selected)for(const dependency of prerequisites[id]??[])selected.add(dependency);
  return CASES.map(row=>row.id).filter(id=>selected.has(id));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
