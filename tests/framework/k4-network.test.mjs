import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createNetworkService} from '../../src/platform/chrome/network.js';
import {createNotificationService} from '../../src/platform/chrome/notifications.js';
import {createSdkService} from '../../src/framework/sdk/service.js';
import {SDK_LIMITS, fail} from '../../src/framework/sdk/registry.js';

const received = [], closed = [];
let base, server;
before(async () => {
  server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://fixture.test');
    const chunks = []; for await (const chunk of request) chunks.push(chunk);
    received.push({method: request.method, url: request.url, body: Buffer.concat(chunks).toString(), headers: request.headers});
    if (url.pathname === '/hang') { request.on('close', () => closed.push('hang')); return; }
    if (url.pathname === '/stream') { response.writeHead(200); response.write('partial'); response.on('close', () => closed.push('stream')); return; }
    if (url.pathname === '/large') return response.end('x'.repeat(1024));
    if (url.pathname === '/redirect') { response.writeHead(302, {location: `${base}/should-not-follow`}); return response.end('redirect'); }
    if (url.pathname === '/invalid-utf8') return response.end(Buffer.from([255]));
    if (url.pathname === '/invalid-json') return response.end('{');
    if (url.pathname === '/error') { response.writeHead(418, {'content-type': 'application/json'}); return response.end('{"data":false,"PageBrigeCode":1002}'); }
    response.writeHead(200, {'content-type': 'application/json', 'set-cookie': 'secret=1'});
    response.end(url.pathname === '/false' ? 'false' : url.pathname === '/zero' ? '0' : url.pathname === '/null' ? 'null' : JSON.stringify({method: request.method, body: Buffer.concat(chunks).toString(), params: url.searchParams.getAll('n[]')}));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
const code = expected => error => error?.code === expected;
const service = options => createNetworkService({authorize: async () => {}, ...options});

test('CMP13 real loopback four HTTP methods, body and serializable projection', async () => {
  const phases = [], context = {namespace: 'broker-context'};
  const network = service({authorize: async (request, ctx) => { assert.equal(ctx, context); phases.push(request); }});
  for (const [method, data] of [['GET', undefined], ['POST', false], ['PUT', 0], ['DELETE', undefined]]) {
    const response = await network.request({method, url: `${base}/echo`, data, config: {params: {n: [0, false]}, headers: {'x-fixture': 'yes'}}}, context);
    assert.equal(response.status, 200); assert.equal(response.data.method, method); assert.deepEqual(response.data.params, ['0', 'false']);
    assert.equal(Object.hasOwn(response.headers, 'set-cookie'), false); assert.equal(Object.hasOwn(response, 'request'), false);
    if (data !== undefined) assert.equal(response.data.body, String(data));
    assert.doesNotThrow(() => JSON.stringify(response));
  }
  assert.deepEqual(phases.map(request => request.phase), ['pre', 'post', 'pre', 'post', 'pre', 'post', 'pre', 'post']);
  assert.equal(phases[0].capability, 'network'); assert.ok(phases[0].url.includes('n%5B%5D=0'));
});
for (const [path, value] of [['false', false], ['zero', 0], ['null', null]]) {
  test(`CMP13 real response ${path} retained`, async () => assert.deepEqual((await service().request({method: 'GET', url: `${base}/${path}`})).data, value));
}
test('HTTP vs network vs bad JSON/UTF8 typed errors and restricted error response', async () => {
  await assert.rejects(service().request({method: 'GET', url: `${base}/error`}), error => error.code === 'E_HTTP' && error.status === 418 && error.response.data.data === false);
  await assert.rejects(service({fetchImpl: async () => { throw new TypeError('fixture network failure'); }}).request({method: 'GET', url: base}), code('E_NETWORK'));
  await assert.rejects(service().request({method: 'GET', url: `${base}/invalid-json`, config: {responseType: 'json'}}), error => error.code === 'E_VALUE_SERIALIZATION' && error.stage === 'json');
  await assert.rejects(service().request({method: 'GET', url: `${base}/invalid-utf8`}), error => error.code === 'E_VALUE_SERIALIZATION' && error.stage === 'utf8');
});
test('denied URL and config have zero real HTTP; native grant rechecked post response', async () => {
  let n = received.length;
  await assert.rejects(createNetworkService().request({method: 'GET', url: base}), code('E_PERMISSION'));
  await assert.rejects(service({authorize: async () => { throw fail('E_PERMISSION'); }}).request({method: 'GET', url: base}), code('E_PERMISSION'));
  for (const config of [{unknown: true}, {headers: {authorization: 'secret'}}, {withCredentials: true}, {params: {object: {deep: true}}}])
    await assert.rejects(service().request({method: 'GET', url: base, config}), code('E_CONFIG_UNSUPPORTED'));
  assert.equal(received.length, n);
  await assert.rejects(service({authorize: async request => { if (request.phase === 'post') throw fail('E_PERMISSION', 'revoked after response'); }}).request({method: 'GET', url: `${base}/false`}), code('E_PERMISSION'));
});
test('private native receipt hook persists HTTP fact before post revocation, not normalized checkServer result', async () => {
  const receipts = [], phases = [];
  const network = service({authorize: async request => { phases.push(request.phase); if (request.phase === 'post') throw fail('E_PERMISSION'); }});
  await assert.rejects(network.request({method: 'GET', url: `${base}/false`}, {recordNativeReceipt: async projection => { receipts.push(projection); phases.push('native-receipt'); }}), code('E_PERMISSION'));
  assert.deepEqual(phases, ['pre', 'native-receipt', 'post']); assert.equal(receipts[0].data, false); assert.equal(receipts[0].status, 200);
  const serverReceipts = [];
  const result = await service().checkServer({server: `${base}/false`}, {recordNativeReceipt: async projection => serverReceipts.push(projection)});
  assert.equal(result.available, true); assert.equal(serverReceipts.length, 1); assert.equal(Object.hasOwn(serverReceipts[0], 'available'), false);
});
test('manual redirect never follows unauthorized destination', async () => {
  const before = received.length;
  await assert.rejects(service().request({method: 'GET', url: `${base}/redirect`}), error => error.code === 'E_HTTP' && error.status === 302);
  assert.equal(received.length - before, 1); assert.equal(received.some(item => item.url === '/should-not-follow'), false);
});
test('actual abort during stalled body/HTTP, size budget and caller cancellation', async () => {
  for (const path of ['hang', 'stream']) await assert.rejects(service().request({method: 'GET', url: `${base}/${path}`, config: {timeout: 20}}), code('E_TIMEOUT'));
  await assert.rejects(service({maxResponseBytes: 32}).request({method: 'GET', url: `${base}/large`}), code('E_LIMIT'));
  const controller = new AbortController(); const pending = service().request({method: 'GET', url: `${base}/stream`}, {signal: controller.signal});
  const rejected = assert.rejects(pending, code('E_CANCELLED')); setTimeout(() => controller.abort(), 10); await rejected;
  await new Promise(resolve => setTimeout(resolve, 20)); assert.ok(closed.includes('stream'));
});
test('backend 15s budget independent from client timeout and earlier native deadline', async () => {
  const timers = [], cleared = [];
  const network = service({setTimer: (fn, ms) => { timers.push(ms); return ms; }, clearTimer: id => cleared.push(id)});
  await network.request({method: 'GET', url: `${base}/false`, config: {timeout: 60000}});
  assert.deepEqual(timers, [15000]); assert.deepEqual(cleared, [15000]); assert.equal(SDK_LIMITS.pending, 100);
  const clock = {now: () => 1000}; const earlier = service({clock, setTimer: (fn, ms) => { timers.push(ms); return ms; }, clearTimer: () => {}});
  await earlier.request({method: 'GET', url: `${base}/false`}, {deadlineAt: 1200}); assert.equal(timers.at(-1), 200);
  await assert.rejects(earlier.request({method: 'GET', url: base}, {deadlineAt: 999}), code('E_TIMEOUT'));
});
test('stalled pre/post native permission validation still obeys driver deadline without replay', async () => {
  for (const stalledPhase of ['pre', 'post']) {
    const before = received.length;
    await assert.rejects(service({authorize: request => request.phase === stalledPhase ? new Promise(() => {}) : Promise.resolve()})
      .request({method: 'POST', url: `${base}/echo`, data: 0, config: {timeout: 20}}), code('E_TIMEOUT'));
    assert.equal(received.length - before, stalledPhase === 'pre' ? 0 : 1);
  }
});
test('server checks real observable success/failure and never reports opaque available', async () => {
  assert.equal((await service().checkServer({server: `${base}/false`})).available, true);
  const timeout = await service().checkServer({server: `${base}/hang`, timeout: 20}); assert.equal(timeout.latency, null); assert.equal(timeout.available, false); assert.equal(timeout.errorCode, 'E_TIMEOUT');
  const opaque = await service({fetchImpl: async () => ({type: 'opaque'})}).checkServer({server: base}); assert.equal(opaque.available, false); assert.equal(opaque.latency, null);
  await assert.rejects(service({authorize: async () => { throw fail('E_PERMISSION'); }}).checkServer({server: base}), code('E_PERMISSION'));
});
test('external IP info disabled default and never calls original external endpoint in tests', async () => {
  let fetched = false;
  await assert.rejects(service({fetchImpl: async () => { fetched = true; }}).getIpInfo({ip: '1.2.3.4'}), code('E_CAPABILITY'));
  assert.equal(fetched, false);
});
test('notification true callback wait, lastError refusal and pre/post authorization', async () => {
  const runtime = {}, phases = []; let createCallback, created = 0;
  const driver = createNotificationService({api: {runtime, notifications: {create(id, options, callback) { created++; createCallback = callback; assert.equal(options.message, 'body'); }}},
    iconUrl: 'icons/icon.svg', authorize: async request => { phases.push(request.phase); }});
  let done = false; const promise = driver.create({title: 'title', content: 'body'}, {}).then(value => { done = true; return value; });
  await new Promise(resolve => setImmediate(resolve)); assert.equal(done, false); createCallback('native-id'); assert.equal(await promise, undefined);
  assert.equal(created, 1); assert.deepEqual(phases, ['pre', 'post']);
  const failure = driver.create({title: 'title', content: 'body'}, {}); await new Promise(resolve => setImmediate(resolve));
  runtime.lastError = {message: 'Chrome refused'}; createCallback(); await assert.rejects(failure, code('E_NOTIFICATION')); delete runtime.lastError;
});
test('service HTTP result preserves business object inside response.data rather than outer authority', async () => {
  const dispatcher = createSdkService({network: service()});
  const result = await dispatcher.execute('AXIOS_GET', {url: `${base}/false`}, {});
  assert.equal(result.ok, true); assert.equal(result.value.data, false); assert.equal(result.value.status, 200);
});
