import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createBackgroundServices} from '../../src/platform/chrome/background-services.js';
import {createSdkService} from '../../src/framework/sdk/service.js';
import {installPageSdk} from '../../src/framework/sdk/entry.js';
import {ADMITTED_METHODS, SDK_METHODS, SDK_VERSION, normalizeMethod} from '../../src/framework/sdk/registry.js';
import {SDK_RESOURCE_PATHS, SDK_RESOURCE_ALIASES} from '../../src/framework/sdk/resource-contract.js';
import {legacyResult} from '../../src/framework/sdk/bridge.js';

const root = `chrome-extension://${'a'.repeat(32)}/`;
const code = value => error => error.code === value;
function fixture({time = 0, corrupt = false} = {}) {
  const effects = [], calls = [], logs = [], phases = [];
  const contents = SDK_RESOURCE_PATHS.map(path => Buffer.from(`// ${path}\nconst text = '中文';`));
  const manifest = {schemaVersion:1, resources:SDK_RESOURCE_PATHS.map((path, index) => ({path, bytes:contents[index].length,
    sha256:createHash('sha256').update(contents[index]).digest('hex')}))};
  const context = {authorize:async request => { phases.push(request); }, assertDispatch() { phases.push('fence'); },
    recordEffect:async value => { effects.push(value); }};
  const background = createBackgroundServices({api:{runtime:{getURL:path => root + (path === '/' ? '' : path)}},
    clock:{now:() => time}, logger:{info:(...args) => logs.push(args)}, fetchImpl:async url => {
      calls.push(url); assert.ok(url.startsWith(root));
      const path = url.slice(root.length);
      if (path === 'framework/sdk-resources.json') return new Response(JSON.stringify(manifest));
      const bytes = contents[SDK_RESOURCE_PATHS.indexOf(path)];
      return new Response(corrupt ? Buffer.from('bad hash') : bytes);
    }});
  return {service:createSdkService({background}), background, context, effects, calls, logs, phases, manifest, contents};
}

test('four services extend the original eighteen; malicious/oversized arguments cannot reach a sink', async () => {
  assert.equal(Object.keys(SDK_METHODS).length, 18); assert.equal(Object.keys(ADMITTED_METHODS).length, 22);
  for (const method of ['getTime', 'bexUrl']) assert.throws(() => normalizeMethod(method, {root:'fake'}), code('E_SCHEMA'));
  for (const args of [{message:'x', data:{}}, {message:'x', token:'secret'}]) assert.throws(() => normalizeMethod('log', args), code('E_SCHEMA'));
  assert.throws(() => normalizeMethod('log', {message:'中'.repeat(1366)}), code('E_LIMIT'));
  assert.throws(() => normalizeMethod('log', {message:'x', data:Array(101).fill(0)}), code('E_LIMIT'));
  const f = fixture(); await assert.rejects(f.service.execute('log', {message:'x', extra:true}, f.context), code('E_SCHEMA'));
  assert.equal(f.logs.length, 0); assert.equal(f.effects.length, 0);
});

test('trusted zero clock, runtime root and log own-undefined survive effect receipt before delivery', async () => {
  const f = fixture();
  assert.equal((await f.service.execute('getTime', {}, f.context)).data, 0);
  assert.deepEqual((await f.service.execute('bexUrl', {}, f.context)).data, {url:root});
  const result = await f.service.execute('log', {message:'secret中文', data:[false, 0]}, f.context);
  assert.equal(Object.hasOwn(result, 'data'), true); assert.equal(result.data, undefined);
  assert.deepEqual(f.logs, [['opendesk.sdk.log', {messageBytes:12, dataItems:2}]]);
  assert.deepEqual(f.effects, [0, {url:root}, undefined]);
  assert.ok(!JSON.stringify(f.logs).includes('secret')); assert.equal(f.calls.length, 0);
  assert.deepEqual(f.phases.slice(-4), [{capability:'service.log', phase:'pre'}, 'fence', {capability:'service.log', phase:'post'}, 'fence']);
  const invalid = fixture({time:NaN}); await assert.rejects(invalid.service.execute('getTime', {}, invalid.context), code('E_RESOURCE_UNAVAILABLE'));
});

test('only two fixed bytes/SHA resources and seven aliases are readable; hostile paths issue zero fetch', async () => {
  const f = fixture();
  for (const path of [...SDK_RESOURCE_PATHS, ...Object.keys(SDK_RESOURCE_ALIASES)]) {
    const result = await f.service.execute('requestResource', {url:root + path}, f.context);
    const actualPath = SDK_RESOURCE_ALIASES[path] ?? path;
    assert.deepEqual(result.data, {success:true, data:f.contents[SDK_RESOURCE_PATHS.indexOf(actualPath)].toString('utf8')});
  }
  const count = f.calls.length;
  for (const url of ['https://remote.example/a.js', '../sw.js', '%2e%2e/sw.js', `${root}framework/sdk-main.js?x`, `${root}framework/sdk-main.js#x`,
    `chrome-extension://${'b'.repeat(32)}/framework/sdk-main.js`, 'assets/js/axios.js', 'sw.js']) {
    await assert.rejects(f.service.execute('requestResource', {url}, f.context), error => ['E_SCHEMA','E_RESOURCE_UNAVAILABLE'].includes(error.code));
  }
  assert.equal(f.calls.length, count);
  const bad = fixture({corrupt:true}); await assert.rejects(bad.service.execute('requestResource', {url:SDK_RESOURCE_PATHS[0]}, bad.context), code('E_RESOURCE_UNAVAILABLE'));
  assert.equal(bad.effects.length, 0);
});

test('old bridge consumers keep exactly their data layer and original Promise; reinjection refreshes the same facade', async () => {
  const f = fixture(), page = {navigator:{userAgent:''}}; let hellos = 0;
  const transport = {hello:async () => { hellos++; return {ready:true, sdkVersion:SDK_VERSION, methods:Object.keys(ADMITTED_METHODS)}; },
    request:async request => ({requestId:request.requestId, result:await f.service.execute(request.method, request.args, f.context)})};
  const sdk = installPageSdk({global:page, transport});
  try {
    const bridge = page.service.bridge;
    assert.deepEqual(await bridge.send('bexUrl'), {data:{url:root}});
    const response = await bridge.send('requestResource', {url:'assets/js/core/brige.js'});
    assert.deepEqual(response, {data:{success:true, data:f.contents[0].toString('utf8')}});
    assert.deepEqual(await sdk.resources.requestResourceByBridge('assets/js/Env.js'), response.data);
    assert.equal(await sdk.resources.getBexUrlByBridge(), root);
    assert.equal(await page.service.getTime(), 0);
    const result = await bridge.send('log', {message:'x'}); assert.ok(Object.hasOwn(result, 'data')); assert.equal(result.data, undefined);
    await assert.rejects(page.service.bexUrl({location:root}), code('E_SCHEMA'));
    await assert.rejects(bridge.send('APPSTORAGE_CLEAR'), code('E_SERVICE_UNSUPPORTED'));
    assert.equal(installPageSdk({global:page, transport}), sdk); await sdk.ready(); assert.equal(hellos, 2);
    assert.equal(page.service.bridge, bridge); assert.equal(sdk.diagnostics().pending, 0);
  } finally { sdk.dispose(); }
});

test('the old frozen service ABI is rejected instead of being silently reused', async () => {
  const page = {navigator:{userAgent:''}};
  const transport = {hello:async () => ({ready:true, sdkVersion:SDK_VERSION, methods:[]}), request:async () => legacyResult(undefined)};
  const sdk = installPageSdk({global:page, transport}); await sdk.ready();
  const slot = page[Symbol.for('opendesk.sdk.lifecycle.v1')];
  const oldPage = {};
  for (const [name, value] of Object.entries(slot.exports)) Object.defineProperty(oldPage, name, {value});
  Object.defineProperty(oldPage, Symbol.for('opendesk.sdk.lifecycle.v1'), {value:Object.freeze({exports:slot.exports, refresh:slot.refresh})});
  assert.throws(() => installPageSdk({global:oldPage, transport}), code('E_SDK_GLOBAL_CONFLICT'));
  sdk.dispose();
});
