import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {createRunContext, relayContextRequest} from '../../src/framework/context.js';
import {createWorkerPageProxy} from '../../src/scripting/sandbox/page-proxy.js';
import {createRunHost} from '../../src/run-host.js';
import {encodeValue, decodeValue} from '../../src/framework/control/value.js';
import {encodeValue as hostEncode, decodeValue as hostDecode} from '../../src/platform/page-port/codec.js';

const binding = {appId: 'service-test', packageHash: 'a'.repeat(64), codeHash: 'b'.repeat(64),
  generation: 'installation-one', sourceIdentity: {kind: 'local-reviewed'}};
const revision = {scriptId: 'installed-service', revision: 1, sourceHash: binding.codeHash,
  builtinIdentity: {abi: 'test-abi', bundleSha256: 'c'.repeat(64)}};
const identity = {profile: 'app-service', runId: 'service-run', ownerEpoch: 1, target: null, appBinding: binding};
const pageTarget = {tabId: 7, frameId: 0, documentId: 'real-document'};
const serviceRequest = {profile: 'app-service', appId: binding.appId, scheduledFireId: 'scheduled-fire',
  expectedScheduleOwner: {appId: binding.appId, generation: binding.generation}, requestId: 'scheduled-fire', deadlineAt: Date.now() + 30000};
function serviceClaim(overrides = {}) {
  return {profile: 'app-service', runId: identity.runId, ownerEpoch: identity.ownerEpoch, identity: structuredClone(identity),
    revision: structuredClone(revision), target: null, deadlineAt: Date.now() + 30000,
    sourceUtf8: 'async function main() { return await browser.storage.local.getQuota(); }',
    paramsWire: hostEncode({authorityOnly: true}), ...overrides};
}
function contextFixture(extra = {}) {
  const calls = [];
  const context = createRunContext({identity, revision, target: null, dom: null,
    transport: {async request(envelope) { calls.push(envelope); return {requestId: envelope.requestId, value: encodeValue({ok: true})}; }}, ...extra});
  return {context, calls};
}

test('app-service context requires an explicit installed identity, matching code pin and no page target', () => {
  const {context} = contextFixture();
  try {
    assert.equal(context.target, null);
    assert.deepEqual(context.identity.appBinding, binding);
    assert.ok(Object.isFrozen(context.identity.appBinding.sourceIdentity));
    for (const key of ['page', 'ChromePage', 'services', 'axiosx', 'AppStorage', 'AppLocal', 'storage'])
      assert.equal(Object.hasOwn(context, key), false, key);
    for (const extra of [
      {identity: {...identity, profile: undefined}},
      {identity: {...identity, profile: 'unknown'}},
      {identity: {...identity, appBinding: undefined}},
      {identity: {...identity, appBinding: {...binding, generation: ''}}},
      {identity: {...identity, appBinding: {...binding, sourceIdentity: undefined}}},
      {identity: {...identity, appBinding: {...binding, codeHash: 'c'.repeat(64)}}},
      {identity: {...identity, target: pageTarget}}, {target: pageTarget},
      {identity: {...identity, target: undefined}, target: undefined}
    ]) assert.throws(() => contextFixture(extra), {code: 'E_PAGE_CONTEXT_REQUIRED'});
    const inheritedTarget = contextFixture({target: undefined});
    assert.equal(inheritedTarget.context.target, null);
    inheritedTarget.context.dispose();
  } finally { context.dispose(); }
});

test('service browser uses canonical Browser SDK names and one encoded payload without caller ownership', async () => {
  const {context, calls} = contextFixture();
  try {
    const browser = context.browser;
    assert.deepEqual(Object.keys(browser).sort(), ['apiVersion', 'capabilities', 'storage']);
    assert.deepEqual(Object.keys(browser.storage.local).sort(), ['get', 'getQuota', 'set']);
    assert.deepEqual(Object.keys(browser.capabilities).sort(), ['getStatus', 'list']);
    assert.ok(Object.isFrozen(browser.storage.local));
    const inputs = [
      ['browser.storage.local.get', {keys: ['counter']}, () => browser.storage.local.get({keys: ['counter']})],
      ['browser.storage.local.set', {items: {counter: 1}}, () => browser.storage.local.set({items: {counter: 1}})],
      ['browser.storage.local.getQuota', {}, () => browser.storage.local.getQuota()],
      ['browser.capabilities.list', {}, () => browser.capabilities.list()],
      ['browser.capabilities.getStatus', {operation: 'browser.storage.local.get'},
        () => browser.capabilities.getStatus({operation: 'browser.storage.local.get'})]
    ];
    for (const [method, payload, invoke] of inputs) {
      assert.deepEqual(await invoke(), {ok: true});
      const envelope = calls.at(-1);
      assert.deepEqual(envelope.identity, identity);
      assert.deepEqual(envelope.revision, revision);
      assert.equal(envelope.target, null);
      assert.deepEqual(envelope.operation, {kind: 'browser-sdk', method, args: encodeValue([payload])});
      assert.deepEqual(Object.keys(envelope).sort(), ['identity', 'operation', 'requestId', 'revision', 'target']);
    }
    for (const payload of [{owner: 'another-app'}, {namespace: 'global'}, {appId: 'another-app'}])
      assert.throws(() => browser.storage.local.get(payload), {code: 'E_SCHEMA'});
    assert.equal(calls.length, 5);
  } finally { context.dispose(); }
});

test('service relay fences every binding field, profile, owner, revision and target before dispatch', async () => {
  const {context, calls} = contextFixture();
  try {
    await context.browser.storage.local.getQuota();
    const valid = calls[0];
    const changedIdentities = [
      {...identity, runId: 'another-run'}, {...identity, ownerEpoch: 2}, {...identity, profile: 'controller'},
      ...Object.entries({appId: 'another-app', packageHash: 'c'.repeat(64), codeHash: 'c'.repeat(64),
        generation: 'installation-two', sourceIdentity: {kind: 'market', marketId: 'other'}})
        .map(([key, value]) => ({...identity, appBinding: {...binding, [key]: value}}))
    ];
    for (const owner of changedIdentities)
      await assert.rejects(relayContextRequest(context, {...valid, identity: owner}), {code: 'E_OWNER_CHANGED'});
    await assert.rejects(relayContextRequest(context, {...valid, revision: {...revision, revision: 2}}), {code: 'E_OWNER_CHANGED'});
    await assert.rejects(relayContextRequest(context, {...valid, target: pageTarget}), {code: 'E_DOCUMENT_REPLACED'});
    await assert.rejects(relayContextRequest(context, {...valid, target: undefined}), {code: 'E_DOCUMENT_REPLACED'});
    assert.equal(calls.length, 1);
    await relayContextRequest(context, valid);
    assert.equal(calls.length, 2);
  } finally { context.dispose(); }
});

test('service relay rejects Page, Controller services, unrestricted Browser operations and caller namespaces', async () => {
  const {context, calls} = contextFixture();
  try {
    await context.browser.storage.local.getQuota();
    const valid = calls[0];
    for (const operation of [
      {kind: 'packaged', method: 'title'}, {kind: 'browser', method: 'goto'},
      {kind: 'service', method: 'CHROME_LOCAL_GET'}, {kind: 'browser-sdk', method: 'browser.tabs.create'},
      {kind: 'browser-sdk', method: 'browser.storage.local.clear'}, {kind: 'browser-sdk', method: 'browser.storage.local.remove'},
      {kind: 'browser-sdk', method: 'browser.scheduler.create'}
    ]) await assert.rejects(relayContextRequest(context, {...valid, operation: {...operation, args: encodeValue([{}])}}), {code: 'E_CAPABILITY'});
    for (const payload of [{owner: 'another-app'}, {namespace: 'global'}])
      await assert.rejects(relayContextRequest(context, {...valid, operation: {
        kind: 'browser-sdk', method: 'browser.storage.local.get', args: encodeValue([payload])}}), {code: 'E_SCHEMA'});
    await assert.rejects(relayContextRequest(context, {...valid, operation: {
      ...valid.operation, args: encodeValue([{}, {}])}}), {code: 'E_ARGUMENT_TYPE'});
    assert.equal(calls.length, 1);
  } finally { context.dispose(); }
});

test('service pending calls retain the shared stop and deadline fences', async () => {
  let release;
  const {context} = contextFixture({transport: {request(envelope) {
    return new Promise(resolve => { release = () => resolve({requestId: envelope.requestId, value: encodeValue('late')}); });
  }}});
  const pending = context.browser.storage.local.getQuota();
  context.dispose('E_HOST_CLOSED');
  await assert.rejects(pending, {code: 'E_HOST_CLOSED'});
  release();
  await assert.rejects(context.browser.storage.local.getQuota(), {code: 'E_HOST_CLOSED'});
  assert.deepEqual(context.resourceSnapshot(), {pending: 0, timers: 0, subscriptions: 0});
  const expired = contextFixture({deadline: performance.now() - 1});
  try { await assert.rejects(expired.context.browser.storage.local.getQuota(), {code: 'E_TIMEOUT'}); }
  finally { expired.context.dispose(); }
});

test('Worker page proxy projects only the service browser into ctx and releases its original port', async () => {
  const channel = new MessageChannel();
  const proxy = createWorkerPageProxy({port: channel.port1, identity, revision, target: null});
  try {
    assert.deepEqual(Object.keys(proxy.scriptContext).sort(), ['browser', 'revision']);
    assert.equal(proxy.scriptContext.browser, proxy.browser);
    assert.equal(Object.hasOwn(proxy, 'page'), false);
    assert.equal(Object.hasOwn(proxy, 'services'), false);
    channel.port2.onmessage = ({data}) => channel.port2.postMessage({kind: 'reply', runId: identity.runId,
      ownerEpoch: identity.ownerEpoch, id: data.id, reply: {requestId: data.envelope.requestId, value: encodeValue({quota: 100})}});
    assert.deepEqual(await proxy.browser.storage.local.getQuota(), {quota: 100});
    proxy.dispose('E_CANCELLED');
    await assert.rejects(proxy.browser.storage.local.getQuota(), {code: 'E_CANCELLED'});
    assert.equal(proxy.snapshot().pending, 0);
  } finally { proxy.dispose(); channel.port2.close(); }
});

// Real Node Worker + transferred MessagePort component evidence. The Chrome
// opaque Blob Worker preflight is owned by the leader and is not rerun here.
async function executeWorker(body, {owner = identity, target = owner.target, bindProfile = 'controller', executeProfile = 'controller'} = {}) {
  const calls = [], channel = new MessageChannel();
  const thread = new Worker(`
    const {parentPort,workerData}=require('node:worker_threads'),listeners=new Map();
    Object.assign(globalThis,{location:{href:'blob:null/component-only'},name:'component-only',origin:'null',
      addEventListener(type,fn){listeners.set(type,fn);},
      removeEventListener(type,fn){if(listeners.get(type)===fn)listeners.delete(type);},
      postMessage(data){parentPort.postMessage(data);}});
    parentPort.on('message',event=>listeners.get('message')?.({data:event.data,ports:[event.port]}));
    import(workerData.supportURL).then(({primeNodeWorkerBuiltinLibraries})=>{
      primeNodeWorkerBuiltinLibraries();return import(workerData.runtimeURL);
    }).then(({installControlWorker})=>installControlWorker(globalThis));
  `, {eval: true, workerData: {
    runtimeURL: new URL('../../src/scripting/sandbox/worker-runtime.js', import.meta.url).href,
    supportURL: new URL('./controller-worker-support.mjs', import.meta.url).href
  }});
  let timer;
  try {
    const packet = await new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error('Worker component timed out')), 5000);
      thread.on('error', reject);
      thread.on('message', data => {
        if (data.kind === 'worker-ready') thread.postMessage({data: {
          kind: 'bind', identity: owner, revision, target, profile: bindProfile}, port: channel.port1}, [channel.port1]);
      });
      channel.port2.onmessage = ({data}) => {
        if (data.kind === 'bound') {
          const execute = {kind: 'execute', runId: owner.runId, ownerEpoch: owner.ownerEpoch, body,
            params: {controllerOnly: true}, profile: executeProfile};
          channel.port2.postMessage(execute);
          channel.port2.postMessage(execute);
        }
        if (data.kind === 'operation') {
          calls.push(data.envelope);
          channel.port2.postMessage({kind: 'reply', runId: owner.runId, ownerEpoch: owner.ownerEpoch, id: data.id,
            reply: {requestId: data.envelope.requestId, value: encodeValue({quota: 100})}});
        }
        if (data.kind === 'result' || data.kind === 'error') resolve(data);
      };
    });
    return {packet, calls, value: packet.kind === 'result' ? decodeValue(packet.value) : undefined};
  } finally { clearTimeout(timer); channel.port1.close(); channel.port2.close(); await thread.terminate(); }
}

test('installed service executes main once in the original Worker loop without Controller globals or ctx escape', async () => {
  const actual = await executeWorker(`
    async function main() {
      globalThis.executions=(globalThis.executions||0)+1;
      const quota=await browser.storage.local.getQuota();
      return {quota,executions:globalThis.executions,ctxKeys:Object.keys(ctx).sort(),
        sameBrowser:ctx.browser===browser,globals:[typeof page,typeof ChromePage,typeof params,typeof axiosx,
          typeof AppStorage,typeof AppLocal,typeof storage,typeof document,typeof chrome],
        ctxPage:[typeof ctx.page,typeof ctx.ChromePage,typeof ctx.services],
        unrestricted:[typeof browser.tabs,typeof browser.scheduler,typeof browser.storage.local.clear],
        locked:[Object.isFrozen(ctx),Object.isFrozen(ctx.browser),Reflect.set(globalThis,'ctx',{})]};
    }
  `);
  assert.equal(actual.packet.kind, 'result');
  assert.deepEqual(actual.value, {quota: {quota: 100}, executions: 1, ctxKeys: ['browser', 'revision'], sameBrowser: true,
    globals: Array(9).fill('undefined'), ctxPage: Array(3).fill('undefined'), unrestricted: Array(3).fill('undefined'),
    locked: [true, true, false]});
  assert.equal(actual.calls.length, 1);
  assert.equal(actual.calls[0].operation.kind, 'browser-sdk');
  assert.deepEqual(actual.calls[0].identity, identity);
  assert.equal(actual.calls[0].target, null);
});

test('Worker derives profile solely from bound identity and preserves Controller target and lexical facades', async () => {
  const owner = {runId: 'controller-run', ownerEpoch: 1, target: pageTarget};
  const actual = await executeWorker(`async function main() {
    return {title:await page.title(),params,browser:typeof browser,ctxKeys:Object.keys(ctx).sort(),
      services:[typeof axiosx,typeof AppStorage,typeof AppLocal,typeof storage]};
  }`, {owner, bindProfile: 'app-service', executeProfile: 'app-service'});
  assert.equal(actual.packet.kind, 'result');
  assert.deepEqual(actual.value, {title: {quota: 100}, params: {controllerOnly: true}, browser: 'undefined',
    ctxKeys: ['ChromePage', 'revision', 'target'], services: Array(4).fill('object')});
  assert.deepEqual(actual.calls[0].target, pageTarget);
  assert.equal(actual.calls[0].operation.method, 'title');
  await assert.rejects(executeWorker('return true;', {owner: {...owner, target: null}, target: null,
    bindProfile: 'app-service'}), {code: 'E_PAGE_CONTEXT_REQUIRED'});
});

function hostFixture({claim = serviceClaim(), execute, finish, ready = Promise.resolve()} = {}) {
  const events = [], contexts = [];
  let terminalResolve;
  const terminal = new Promise(resolve => { terminalResolve = resolve; });
  const controls = {
    async startControllerRun(request) { events.push(['start', request]); return claim; },
    async controllerOperation({envelope}) { events.push(['operation', envelope]); return {requestId: envelope.requestId, value: encodeValue({quota: 100})}; },
    async finishControllerRun(request) {
      events.push(['finish', request]);
      if (finish) return finish(request);
      return {run: {state: request.status === 'succeeded' ? 'completed' : 'stopped'}, result: {valueWire: request.valueWire}};
    },
    async snapshotControllerRun() { events.push(['snapshot']); return {run: {state: 'completed'}, results: [{runId: claim.runId, recovered: true}]}; },
    async retireControllerTarget(request) { events.push(['retire', request]); return {state: 'released'}; },
    async stopControllerRun(request) { events.push(['stop', request]); return {state: 'stopping'}; }
  };
  const host = createRunHost({api: {runtime: {getURL: path => `chrome-extension://extension/${path}`}},
    document: undefined, templateModuleFactory: null,
    client: {ready, controller: controls, runCommands: {}, storage: {}, pagePort: {}, exportBridge: {}, entitlement: {}},
    controllerFactory({context}) {
      contexts.push(context);
      return {retired: Promise.resolve({acknowledged: true}),
        async execute(source, params) {
          events.push(['execute', source, params]);
          return execute ? execute(context) : {status: 'succeeded', value: encodeValue(await context.browser.storage.local.getQuota())};
        },
        stop() { events.push(['worker-stop']); terminalResolve({status: 'stopped'}); },
        close() { events.push(['worker-close']); terminalResolve({status: 'host-closed'}); }
      };
    }});
  return {host, events, contexts, terminal};
}

test('RunHost service start forwards only the schedule contract and shares execute, operations, completion and retirement', async () => {
  const f = hostFixture();
  try {
    const claim = await f.host.start(serviceRequest);
    const result = await f.host.completion;
    assert.deepEqual(f.events[0], ['start', serviceRequest]);
    assert.equal(claim.target, null);
    assert.equal(f.contexts[0].identity.profile, 'app-service');
    assert.deepEqual(f.events.find(([kind]) => kind === 'execute').slice(1), [claim.sourceUtf8, {authorityOnly: true}]);
    assert.deepEqual(f.events.map(([kind]) => kind), ['start', 'execute', 'operation', 'finish', 'retire']);
    assert.equal(result.state, 'completed');
    assert.deepEqual(hostDecode(result.result.valueWire), {quota: 100});
    assert.equal(f.host.currentRun, null);
    assert.equal(f.host.executionPending, false);
    assert.deepEqual(f.host.resourceSnapshot().contexts, []);
  } finally { await f.host.dispose(); }
});

test('RunHost rejects any service caller source, params, target or grant fields before Authority admission', async () => {
  const f = hostFixture();
  try {
    for (const key of ['source', 'sourceUtf8', 'params', 'paramsWire', 'target', 'scriptId', 'revision', 'networkOrigins', 'owner', 'namespace'])
      await assert.rejects(f.host.start({...serviceRequest, [key]: undefined}), {code: 'E_ARGUMENT_TYPE'});
    assert.deepEqual(f.events, []);
    assert.equal(f.host.executionPending, false);
  } finally { await f.host.dispose(); }
});

test('RunHost snapshots schedule ownership before ready and never upgrades a mismatched claim', async () => {
  let readyResolve;
  const ready = new Promise(resolve => { readyResolve = resolve; });
  const f = hostFixture({ready});
  try {
    const request = structuredClone(serviceRequest);
    const pending = f.host.start(request);
    request.expectedScheduleOwner.generation = 'caller-mutated';
    readyResolve();
    await pending; await f.host.completion;
    assert.deepEqual(f.events[0][1], serviceRequest);
  } finally { await f.host.dispose(); }
  for (const claim of [
    serviceClaim({profile: undefined}), serviceClaim({target: pageTarget}),
    serviceClaim({identity: {...identity, profile: 'controller'}}),
    serviceClaim({identity: {...identity, appBinding: {...binding, appId: 'another-app'}}})
  ]) {
    const invalid = hostFixture({claim});
    try {
      await assert.rejects(invalid.host.start(serviceRequest), {code: 'E_OWNER'});
      assert.equal(invalid.contexts.length, 0);
      assert.deepEqual(invalid.events.map(([kind]) => kind), ['start', 'finish', 'retire']);
    } finally { await invalid.host.dispose(); }
  }
});

test('service stop uses the same Worker cancellation and durable settlement path', async () => {
  let f;
  f = hostFixture({execute: () => f.terminal});
  try {
    await f.host.start(serviceRequest);
    await f.host.stop({runId: identity.runId, reason: 'E_CANCELLED', requestId: 'stop-service'});
    assert.equal((await f.host.completion).state, 'stopped');
    assert.equal(f.contexts[0].signal.aborted, true);
    assert.deepEqual(f.events.map(([kind]) => kind), ['start', 'execute', 'worker-stop', 'stop', 'finish', 'retire']);
    assert.equal(f.host.executionPending, false);
  } finally { await f.host.dispose(); }
});

test('service finish response loss reuses durable recovery without executing installed source again', async () => {
  const f = hostFixture({finish() { throw Object.assign(new Error('lost response'), {code: 'E_TRANSPORT'}); }});
  try {
    await f.host.start(serviceRequest);
    const result = await f.host.completion;
    assert.equal(result.state, 'completed');
    assert.equal(result.result.recovered, true);
    assert.deepEqual(f.events.map(([kind]) => kind), ['start', 'execute', 'operation', 'finish', 'snapshot', 'retire']);
    assert.equal(f.host.executionPending, false);
  } finally { await f.host.dispose(); }
});
