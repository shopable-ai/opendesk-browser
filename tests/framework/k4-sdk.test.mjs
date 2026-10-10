import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeValue, decodeValue, encodeBase64, bytesToBase64} from '../../src/platform/page-port/codec.js';
import {createSdkBridge, legacyResult} from '../../src/framework/sdk/bridge.js';
import {SDK_METHODS, SDK_VERSION, PROTOCOL, normalizeMethod, validateSdkRequest, fail, SDK_HELLO_EVENT, SDK_REQUEST_EVENT, SDK_RESULT_EVENT} from '../../src/framework/sdk/registry.js';
import {createStorageFacades} from '../../src/framework/sdk/storage.js';
import {createHttp} from '../../src/framework/sdk/http.js';
import {createNotifications} from '../../src/framework/sdk/notifications.js';
import {createServers} from '../../src/framework/sdk/servers.js';
import {createSleep, getFingerprint} from '../../src/framework/sdk/utils.js';
import {createDeviceUtils, DeviceType} from '../../src/framework/utils/device.js';
import {formatJSON, wrapAsync} from '../../src/framework/utils/script.js';
import {createNetworkInfo, IP_INFO_URL} from '../../src/framework/utils/network-info.js';
import {EVENT_OPERATE, dispatchFrameworkEvent} from '../../src/framework/events.js';
import {installPageSdk} from '../../src/framework/sdk/entry.js';
import {installPageRelay} from '../../src/agents/page-relay.js';
import {createSdkService} from '../../src/framework/sdk/service.js';

const hello = () => ({ready: true, sdkVersion: SDK_VERSION, methods: Object.keys(SDK_METHODS)});
const turn = () => new Promise(resolve => setImmediate(resolve));
const code = expected => error => error?.code === expected;
function controlledBridge(options = {}) {
  const requests = []; let sequence = 0;
  const bridge = createSdkBridge({transport: {hello: async () => hello(), request: request => { requests.push(request); return {accepted: true}; }},
    makeId: () => `request_${sequence++}`, ...options});
  return {bridge, requests};
}
function windowFixture(handler) {
  class DetailEvent extends Event { constructor(type, {detail} = {}) { super(type); this.detail = detail; } }
  class FakeWindow extends EventTarget {
    listeners = new Set();
    addEventListener(type, callback, options) { this.listeners.add(callback); super.addEventListener(type, callback, options); }
    removeEventListener(type, callback, options) { super.removeEventListener(type, callback, options); this.listeners.delete(callback); }
  }
  const window = new FakeWindow(), messages = [];
  const api = {runtime: {sendMessage(message, callback) {
    const wire = JSON.parse(JSON.stringify(message)); messages.push(wire);
    Promise.resolve().then(() => handler(wire)).then(value => callback(JSON.parse(JSON.stringify(value))), error => callback({ok: false, error: {code: error.code, message: error.message}}));
  }}};
  const relay = installPageRelay({window, api, CustomEvent: DetailEvent});
  const global = {window, CustomEvent: DetailEvent, navigator: {userAgent: 'Fixture UA'}};
  const sdk = installPageSdk({global});
  return {window, global, sdk, relay, messages, DetailEvent};
}

for (const value of [false, 0, undefined, null, '', -0, [], {data: 0, nested: {present: undefined}}]) {
  test(`CMP15 callback preserves ${String(value)}`, async () => {
    const {bridge, requests} = controlledBridge();
    const promise = bridge.call('APPLOCAL_GETITEM', {key: 'value'}); await turn();
    assert.equal(bridge.ChromeBridgeOperationCompleted(requests[0].requestId, legacyResult(value)), '');
    assert.deepEqual(await promise, value); assert.equal(bridge.diagnostics().pending, 0);
    bridge.ChromeBridgeOperationCompleted(requests[0].requestId, legacyResult('late'));
    bridge.dispose();
  });
}
for (const message of ['business denied', {code: 1003, message: 'business'}, null, undefined, false, 0]) {
  test(`CMP15 inner business error ${String(message)} remains original rejection`, async () => {
    const {bridge, requests} = controlledBridge();
    const promise = bridge.call('APPLOCAL_GETITEM', {key: 'value'}); await turn();
    const result = promise.then(() => ({resolved: true}), error => ({error}));
    bridge.ChromeBridgeOperationCompleted(requests[0].requestId, {PageBrigeCode: 1, message, data: 0});
    assert.deepEqual(await result, {error: message}); bridge.dispose();
  });
}
test('CMP15 malformed Base64 / UTF8 / JSON settle once with typed stage and no pending', async () => {
  for (const [body, base64, stage] of [['%%', true, 'base64'], [bytesToBase64(Uint8Array.of(255)), true, 'utf8'], [encodeBase64('{'), true, 'json'], ['{', false, 'json']]) {
    const {bridge, requests} = controlledBridge(); const promise = bridge.call('APPLOCAL_GETITEM', {key: 'x'}); await turn();
    const rejected = assert.rejects(promise, error => error.code === 'E_VALUE_SERIALIZATION' && error.stage === stage);
    bridge.ChromeBridgeOperationCompleted(requests[0].requestId, body, base64); await rejected;
    assert.equal(bridge.diagnostics().pending, 0); bridge.dispose();
  }
});
test('CMP15 unicode legacy Base64 callback and ACK never settle early', async () => {
  const {bridge, requests} = controlledBridge(); let settled = false;
  const pending = bridge.call('APPLOCAL_GETITEM', {key: 'x'}).then(value => { settled = true; return value; }); await turn();
  assert.equal(settled, false);
  bridge.ChromeBridgeOperationCompleted(requests[0].requestId, encodeBase64(JSON.stringify(legacyResult('中文🙂'))), true);
  assert.equal(await pending, '中文🙂'); bridge.dispose();
});
test('CMP15 old ChromeBridgeEvents facade is observable but cannot lose private pending settlement', async () => {
  const {bridge, requests} = controlledBridge(); const result = bridge.call('APPLOCAL_GETITEM', {key: 'x'}); await turn();
  assert.equal(bridge.ChromeBridgeEvents.size, 1); bridge.ChromeBridgeEvents.clear();
  bridge.ChromeBridgeOperationCompleted(requests[0].requestId, legacyResult(0)); assert.equal(await result, 0);
  assert.equal(bridge.ChromeBridgeEvents.size, 0); assert.equal(bridge.diagnostics().pending, 0); bridge.dispose();
});
test('B03 client deadline and document dispose clean original pending once', async () => {
  const timed = controlledBridge({timeoutMs: 10}); await assert.rejects(timed.bridge.call('APPLOCAL_GETITEM', {key: 'x'}), code('E_TIMEOUT'));
  assert.equal(timed.bridge.diagnostics().pending, 0); timed.bridge.dispose();
  const {bridge} = controlledBridge(); const promise = bridge.call('APPLOCAL_GETITEM', {key: 'x'});
  const rejected = assert.rejects(promise, code('E_CANCELLED')); bridge.dispose(); await rejected;
  await assert.rejects(bridge.call('APPLOCAL_GETITEM', {key: 'x'}), code('E_CANCELLED'));
});
test('CMP07 AppStorage String semantics and AppLocal typed presence cross codec', async () => {
  for (const value of [123, false, 0, null, undefined, {a: 1}]) {
    assert.equal(normalizeMethod('APPSTORAGE_SETITEM', {key: 'x', value}).value, String(value));
    const normalized = normalizeMethod('APPLOCAL_SETITEM', {key: 'x', value});
    const clone = decodeValue(JSON.parse(JSON.stringify(encodeValue(normalized))));
    assert.ok(Object.hasOwn(clone, 'value')); assert.deepEqual(clone.value, value);
  }
  assert.deepEqual(normalizeMethod('CHROME_LOCAL_GET', {key: null}), {key: null});
  const calls = []; const facades = createStorageFacades(async (method, args) => { calls.push({method, args}); });
  assert.equal(await facades.AppStorage.clear(), undefined); await facades.storage.get(null);
  assert.deepEqual(calls[1], {method: 'CHROME_LOCAL_GET', args: {key: null}});
});
test('CMP13 four HTTP facades preserve call shape', async () => {
  const calls = []; const axiosx = createHttp(async (method, args) => { calls.push({method, args}); return {data: false}; });
  assert.deepEqual(await axiosx.get('https://example.test', {params: {a: 0}}), {data: false});
  await axiosx.post('https://example.test', 0); await axiosx.put('https://example.test', false); await axiosx.delete('https://example.test');
  assert.deepEqual(calls.map(item => item.method), ['AXIOS_GET', 'AXIOS_POST', 'AXIOS_PUT', 'AXIOS_DELETE']);
  assert.equal(calls[1].args.data, 0); assert.equal(calls[2].args.data, false); assert.equal(Object.hasOwn(calls[3].args, 'data'), false);
});
test('schema/config/business refusal dispatches nothing', async () => {
  const {bridge, requests} = controlledBridge();
  for (const [method, args, expected] of [['CSDN_READ_ARTICLE', {}, 'E_SERVICE_UNSUPPORTED'], ['AXIOS_GET', {url: 'https://example.test', config: {transformResponse: 'x'}}, 'E_CONFIG_UNSUPPORTED'],
    ['APPLOCAL_SETITEM', {key: '__proto__', value: 1}, 'E_SCHEMA'], ['APPLOCAL_SETITEM', {key: 'x', value: () => 1}, 'E_VALUE_SERIALIZATION'],
    ['APPLOCAL_SETITEM', {key: 'x'}, 'E_SCHEMA']]) await assert.rejects(bridge.call(method, args), code(expected));
  assert.equal(requests.length, 0); assert.throws(() => bridge.executeScript('return 1'), code('E_CAPABILITY')); bridge.dispose();
  assert.throws(() => validateSdkRequest({requestId: 'x', method: 'APPLOCAL_GETITEM', args: {key: 'x'}, deadlineAt: Date.now(), namespace: 'forged'}), code('E_SCHEMA'));
});
test('CMP14 notifications preserve desc rules with typed null/body errors', async () => {
  const calls = []; const notify = createNotifications(async (method, args) => { calls.push({method, args}); });
  await notify('title', 'text'); await notify('title', {body: 'body'}); await notify('title', 0);
  assert.deepEqual(calls.map(item => item.args.content), ['text', 'body', '']);
  await assert.rejects(notify('title', null), code('E_SCHEMA')); await assert.rejects(notify('title', {body: 0}), code('E_SCHEMA'));
});
test('CMP14 server results use latency order, input ties and all-failed null', async () => {
  const calls = []; const serverUtils = createServers(async (method, args) => {
    calls.push({method, args}); return {server: args.server, available: !args.server.includes('bad'), latency: args.server.includes('bad') ? null : args.server.includes('fast') ? 2 : 20};
  });
  const result = await serverUtils.checkServers(['slow.test', 'fast.test', 'bad.test']);
  assert.equal(result.fastestResult.server, 'http://fast.test'); assert.equal(result.results[2].latency, null);
  assert.equal(await serverUtils.getFastestServer(['bad.test']), null);
  assert.equal((await serverUtils.checkServers(['fast.test/a', 'fast.test/b'])).fastestResult.server, 'http://fast.test/a');
  assert.equal(calls[0].args.timeout, 5000);
});
test('CMP08 strict compact JSON never runs code; wrapAsync is only source transformation', () => {
  assert.equal(formatJSON(' { "a": 1 } '), '{"a":1}');
  const source = '(globalThis.__k4_pwn = 1, {a:1})'; assert.equal(formatJSON(source), source); assert.equal(globalThis.__k4_pwn, undefined);
  assert.match(wrapAsync('return await page.title();'), /async function/);
});
test('CMP08 DeviceType, UA priority, unsupported native/fingerprint, delegated ID', async () => {
  const calls = []; const device = createDeviceUtils({call: async (...args) => { calls.push(args); return 'Ab01234567890123'; }, navigator: {userAgent: 'Chrome/123 Safari/1 Edg/2', platform: 'X', language: 'zh', onLine: false}, context: {}, random: () => 0});
  assert.deepEqual(DeviceType, {BROWSER: 0, DESKTOP: 1, APP_H5: 2, ANDROID: 3, IOS: 4});
  assert.equal(device.getInfoStr(), 'Chrome Canary 123'); assert.equal(device.getBrowserInfo('Firefox/100'), 'Firefox 100'); assert.equal(device.getBrowserInfo('unknown'), 'unknown');
  assert.equal(device.generateRandomString(0), ''); assert.equal(device.generateRandomString(16), 'A'.repeat(16));
  assert.equal(await device.getAppId(), 'Ab01234567890123'); assert.deepEqual(calls[0], ['DEVICE_GET_APP_ID', {}]);
  assert.deepEqual(await device.getAppIdInfo(), {}); await assert.rejects(getFingerprint(), code('E_RESOURCE_UNAVAILABLE'));
  await assert.rejects(createDeviceUtils({extensionId: 'trusted'}).getAppIdInfo(), code('E_RESOURCE_UNAVAILABLE'));
  assert.throws(() => createDeviceUtils({context: {process: {type: 'renderer'}}}).getInfo(), code('E_CAPABILITY'));
});
test('CMP08 UtilInfo stays idle until explicit call and keeps original URL', async () => {
  const calls = []; const info = createNetworkInfo(async (...args) => { calls.push(args); return false; });
  assert.equal(calls.length, 0); assert.equal(IP_INFO_URL, 'http://whois.pconline.com.cn/ipJson.jsp?json=true');
  assert.equal(await info.getIpInfo(), false); assert.deepEqual(calls[0], ['NETWORK_INFO_GET', {}]);
});
test('events retain old strings and route lifecycle solely to injected RunHost', () => {
  assert.equal(EVENT_OPERATE.DEVICE_USER_INFO, 'OPERATE_DEVICE_USER_INFO');
  assert.throws(() => dispatchFrameworkEvent(EVENT_OPERATE.DEVICE_INFO, {}), code('E_SERVICE_UNSUPPORTED'));
  assert.equal(dispatchFrameworkEvent(EVENT_OPERATE.SCRIPT_RUN, 0, {start: arg => arg}), 0);
  assert.equal(dispatchFrameworkEvent(EVENT_OPERATE.SCRIPT_STOP, false, {stop: arg => arg}), false);
});
test('sleep resolves undefined and abort removes timer', async () => {
  const sleep = createSleep(); assert.equal(await sleep(1), undefined);
  const controller = new AbortController(); const pending = sleep(1000, {signal: controller.signal}); const rejected = assert.rejects(pending, code('E_CANCELLED')); controller.abort(); await rejected;
});
test('SDK install conflicts never overwrite page functions; same installation is idempotent', async () => {
  const original = () => 'page'; const global = {sleep: original};
  const transport = {hello: async () => hello(), request: async request => ({requestId: request.requestId, result: legacyResult(undefined)})};
  const siteSdk = installPageSdk({global,transport});
  assert.equal(global.sleep,original,'pre-existing page aliases must not be overwritten');
  assert.equal(global.axiosx,siteSdk.axiosx);
  await siteSdk.ready();siteSdk.dispose();
  assert.throws(()=>installPageSdk({global:{OpenDeskSDK:{}},transport}),code('E_SDK_GLOBAL_CONFLICT'));
  const fresh = {};
  const sdk = installPageSdk({global: fresh, transport}); assert.equal(installPageSdk({global: fresh, transport}), sdk); await sdk.ready(); sdk.dispose();
});
test('Hello cannot be ready from partial or wrong-version allowlist', async () => {
  for (const value of [{ready: true, sdkVersion: SDK_VERSION}, {...hello(), methods: ['forged']}, {...hello(), ready: false}]) {
    const bridge = createSdkBridge({transport: {hello: async () => value, request: async () => { throw new Error('must not dispatch'); }}});
    await assert.rejects(bridge.call('APPLOCAL_GETITEM', {key: 'x'}), code('E_VERSION')); assert.equal(bridge.diagnostics().pending, 0); bridge.dispose();
  }
});
test('fixed MAIN to ISOLATED fixture preserves typed args/result, no controller or page authority', async () => {
  const fixture = windowFixture(async message => {
    if (message.type === 'SDK_HELLO') return {ok: true, data: hello()};
    assert.deepEqual(Object.keys(message.payload).sort(), ['argsWire', 'deadlineAt', 'method', 'requestId']);
    assert.equal(message.protocol, PROTOCOL); const args = decodeValue(message.payload.argsWire);
    return {ok: true, data: {valueWire: encodeValue(legacyResult(args.value))}};
  });
  await fixture.sdk.ready(); assert.equal(await fixture.sdk.AppLocal.setItem('x', undefined), undefined);
  assert.equal(await fixture.sdk.AppLocal.setItem('x', false), false);
  assert.ok(Object.hasOwn(decodeValue(fixture.messages[1].payload.argsWire), 'value'));
  assert.deepEqual(Object.keys(fixture.messages[0].payload), ['sdkVersion']);
  fixture.window.dispatchEvent(new Event('pagehide')); assert.equal(fixture.sdk.diagnostics().pending, 0); assert.equal(fixture.relay.diagnostics().subscriptions, 0);
});
test('CMP10/B01 business PageBrigeCode/ok/error fields survive real JSON hop inside data', async () => {
  const value = {PageBrigeCode: 1, message: 'domain', ok: false, error: {code: 'business'}, present: undefined, nested: {data: false}};
  const fixture = windowFixture(async message => message.type === 'SDK_HELLO' ? {ok: true, data: hello()} :
    {ok: true, data: {valueWire: encodeValue(legacyResult(value))}});
  const result = await fixture.sdk.AppLocal.getItem('x'); assert.deepEqual(result, value); assert.ok(Object.hasOwn(result, 'present'));
  assert.equal(legacyResult(value).PageBrigeCode, 0); assert.equal(legacyResult(undefined).data, undefined); assert.ok(Object.hasOwn(legacyResult(undefined), 'data'));
  fixture.window.dispatchEvent(new Event('pagehide'));
});
test('Hello grant subset permits its methods and rejects other calls before native request', async () => {
  let calls = 0;
  const bridge = createSdkBridge({transport: {hello: async () => ({...hello(), methods: ['APPLOCAL_GETITEM']}), request: async request => { calls++; return {requestId: request.requestId, result: legacyResult(false)}; }}});
  assert.equal(await bridge.call('APPLOCAL_GETITEM', {key: 'x'}), false);
  await assert.rejects(bridge.call('APPSTORAGE_CLEAR', {}), code('E_CAPABILITY')); assert.equal(calls, 1); bridge.dispose();
});
test('fixture 100 concurrent original promises once settle; not native B05 evidence', async () => {
  const fixture = windowFixture(async message => message.type === 'SDK_HELLO' ? {ok: true, data: hello()} :
    {ok: true, data: {valueWire: encodeValue(legacyResult(decodeValue(message.payload.argsWire).key))}});
  const results = await Promise.all(Array.from({length: 100}, (_, n) => fixture.sdk.AppLocal.getItem(`key${n}`)));
  assert.equal(new Set(results).size, 100); assert.equal(fixture.messages.filter(message => message.type === 'SDK_REQUEST').length, 100);
  assert.equal(fixture.sdk.diagnostics().pending, 0); assert.equal(fixture.relay.diagnostics().pending, 0); fixture.window.dispatchEvent(new Event('pagehide'));
});
test('relay rejects page claims and raw script without native dispatch', async () => {
  const fixture = windowFixture(async () => { throw new Error('No native request expected'); });
  const replies = []; fixture.window.addEventListener(SDK_RESULT_EVENT, event => replies.push(JSON.parse(event.detail)));
  fixture.window.dispatchEvent(new fixture.DetailEvent(SDK_REQUEST_EVENT, {detail: JSON.stringify({protocol: PROTOCOL, type: 'SDK_REQUEST', payload: {requestId: 'forged', method: 'APPLOCAL_GETITEM', argsWire: encodeValue({key: 'x'}), deadlineAt: Date.now() + 1000, namespace: 'other'}})}));
  fixture.window.dispatchEvent(new fixture.DetailEvent('CHROME_PAGE_EXECUTE', {detail: {script: 'while(true){}'}})); await turn();
  assert.equal(fixture.messages.length, 0); assert.deepEqual(replies.map(value => value.response.error.code), ['E_SCHEMA', 'E_CAPABILITY']); fixture.window.dispatchEvent(new Event('pagehide'));
});
test('native typed authority/transport failure is outer error; business remains inner', async () => {
  for (const response of [{ok: false, error: {code: 'E_PERMISSION', message: 'revoked'}}, {ok: true, data: {valueWire: encodeValue({PageBrigeCode: 1001, message: false, data: 'business'})}}]) {
    const fixture = windowFixture(async message => message.type === 'SDK_HELLO' ? {ok: true, data: hello()} : response);
    const result = await fixture.sdk.AppLocal.getItem('x').then(() => 'resolved', error => error);
    if (!response.ok) assert.equal(result.code, 'E_PERMISSION'); else assert.equal(result, false);
    fixture.window.dispatchEvent(new Event('pagehide'));
  }
});
test('service dispatcher delegates storage and atomic device context without namespace from page', async () => {
  const context = {namespace: 'trusted', authorizeInTransaction() {}}; const seen = [];
  const service = createSdkService({storage: {executeSdk: async (...args) => { seen.push(args); return undefined; }}, device: {getAppId: async ctx => { assert.equal(ctx, context); return '16characterid000'; }}});
  assert.deepEqual(await service.execute('APPSTORAGE_SETITEM', {key: 'x', value: false}, context), {ok: true, value: undefined});
  assert.deepEqual(seen[0], ['APPSTORAGE_SETITEM', {key: 'x', value: 'false'}, context]);
  assert.equal((await service.execute('DEVICE_GET_APP_ID', {}, context)).value, '16characterid000');
});
