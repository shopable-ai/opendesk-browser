import {createRunContext} from '../../src/framework/context.js';
import {createControlController} from '../../src/scripting/sandbox/controller.js';
import {encodeValue, decodeValue} from '../../src/framework/control/value.js';

const records = [], allEvents = [];
function require(condition, message) { if (!condition) throw new Error(message); }
function until(predicate, timeout = 5000) {
  return new Promise((resolve, reject) => { const started = performance.now(); const tick = () => { const value = predicate(); if (value) resolve(value); else if (performance.now() - started > timeout) reject(new Error('Condition timed out')); else setTimeout(tick, 5); }; tick(); });
}
async function run(name, body, params, expected, {deadline = null, stop = null, resource = false} = {}) {
  const runId = crypto.randomUUID(), target = {tabId: 1, frameId: 0, documentId: 'component-fixture-no-native-page-authority', targetVersion: 1};
  const identity = {runId, ownerEpoch: 1, target}, revision = {revision: 1, sourceHash: '1'.repeat(64)};
  const operations = [], events = [];
  // Deliberate loopback only for a private-channel client test. It performs no
  // Chrome page API, permission check or effect and is not product authority.
  const transport = {async request(e, {signal}) {
    require(!signal.aborted, 'request after cancellation'); operations.push(e);
    if (e.operation.method !== 'title') throw Object.assign(new Error('Native page authority is not wired in this component proof'), {code: 'E_NOT_INTEGRATED'});
    return {requestId: e.requestId, value: encodeValue('private-loopback-only')};
  }};
  const context = createRunContext({identity, revision, target, transport, deadline: deadline === null ? null : performance.now() + deadline, dom: document});
  const controller = createControlController({context, sandboxURL: chrome.runtime.getURL('src/scripting/sandbox/sandbox.html'), workerURL: chrome.runtime.getURL('worker.js'), document,
    observeResources: resource, onEvent: event => { events.push(event); allEvents.push(event); }});
  try {
    const bound = await controller.ready;
    require(bound.url.startsWith('blob:null/'), 'Worker was not an opaque Blob Worker'); require(bound.origin === 'null', 'Worker origin not null');
    if (resource) { await controller.observeResource(); await until(() => events.find(e => e.kind === 'resource-positive')); }
    const result = controller.execute(body, params);
    if (stop) setTimeout(() => stop === 'close' ? controller.close() : controller.stop(), 15);
    const actual = await result, retired = await controller.retired;
    const value = actual.value ? decodeValue(actual.value) : undefined;
    require(actual.status === expected.status, `status ${actual.status} != ${expected.status}: ${JSON.stringify(actual.error)}`);
    if (Object.hasOwn(expected, 'value')) require(JSON.stringify(value) === JSON.stringify(expected.value), `value ${JSON.stringify(value)} != ${JSON.stringify(expected.value)}`);
    if (expected.error) require(actual.error?.code === expected.error, `error ${actual.error?.code} != ${expected.error}`);
    require(retired.acknowledged && retired.baseline.workers === 0 && retired.baseline.ports === 0 && retired.baseline.blobURLs === 0, 'sandbox did not report resource baseline');
    if (resource) require(retired.resources?.positive?.loaded === true && retired.resources?.negative?.loaded === false && retired.resources?.negative?.error, 'missing positive-before and revoked-after native Blob observation');
    require(controller.snapshot().pending === 0 && controller.snapshot().ownedFrames === 0, 'host resources not zero');
    records.push({name, status: 'PASS', input: {body, params, deadline, stop, resource}, expected, actual: {...actual, decodedValue: value}, bound, operations, events, retired, cleanup: controller.snapshot()});
  } catch (error) {
    controller.close(); await controller.retired;
    records.push({name, status: 'FAIL', input: {body, params, deadline, stop, resource}, expected, actual: {name: error.name, code: error.code, message: error.message, stack: error.stack}, operations, events, cleanup: controller.snapshot()});
  }
}
try {
  await run('async-body-await-return', 'await new Promise(resolve=>setTimeout(resolve,5)); return {value:params.x, context:this.x};', {x: 7}, {status: 'succeeded', value: {value: 7, context: 7}}, {resource: true});
  await run('private-channel-global-patch', 'self.postMessage({kind:"result",value:"fake"});self.postMessage=()=>{throw new Error("patched global")};MessagePort.prototype.postMessage=()=>{throw new Error("patched prototype")};return await page.title();', {}, {status: 'succeeded', value: 'private-loopback-only'});
  await run('business-value', 'return {PageBrigeCode:1,message:"domain"};', {}, {status: 'succeeded', value: {PageBrigeCode: 1, message: 'domain'}});
  await run('throw', 'throw new Error("boom");', {}, {status: 'error', error: 'E_CONTROL_EXECUTION'}, {resource: true});
  await run('syntax-error', 'return {;', {}, {status: 'error', error: 'E_CONTROL_EXECUTION'});
  await run('typed-invalid-result', 'return 1n;', {}, {status: 'error', error: 'E_VALUE_SERIALIZATION'});
  await run('deadline', 'await new Promise(()=>{});', {}, {status: 'timeout'}, {deadline: 1000, resource: true});
  await run('stop', 'await new Promise(()=>{});', {}, {status: 'stopped'}, {stop: 'stop', resource: true});
  await run('host-close', 'await new Promise(()=>{});', {}, {status: 'host-closed'}, {stop: 'close'});
  const network = new URL(location.href).searchParams.get('network');
  const positive = await fetch(network + '?kind=positive').then(r => r.text());
  require(positive === 'positive', 'server positive control failed');
  await run('strict-csp-worker-network', 'try {await fetch(params.url); return {blocked:false};} catch(error) {return {blocked:true};}', {url: network + '?kind=worker'}, {status: 'succeeded', value: {blocked: true}});
  require(allEvents.some(e => e.kind === 'policy' && e.directive === 'connect-src'), 'no real CSP violation event observed');
  await run('new-valid-run-after-termination', 'return {ok:true};', {}, {status: 'succeeded', value: {ok: true}}, {resource: true});
} catch (error) { records.push({name: 'harness', status: 'FAIL', actual: {message: error.message, stack: error.stack}}); }
globalThis.__k3ControlReport = {records, summary: {PASS: records.filter(r => r.status === 'PASS').length, FAIL: records.filter(r => r.status === 'FAIL').length},
  limitations: ['Actual product modules in an isolated component extension; not the final integrated product package', 'Loopback title proves private client transport only, not native DOM authority or Chrome permissions', 'Pending async promise cancellation proves cleanup; no physical while(true) <=3s claim in this component test'], allEvents};
