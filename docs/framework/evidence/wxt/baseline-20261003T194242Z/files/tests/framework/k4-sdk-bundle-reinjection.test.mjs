import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {installPageRelay} from '../../src/agents/page-relay.js';
import {SDK_VERSION, SDK_METHODS} from '../../src/framework/sdk/registry.js';
import {encodeValue} from '../../src/platform/page-port/codec.js';
import {legacyResult} from '../../src/framework/sdk/bridge.js';
const root = path.resolve(import.meta.dirname, '../..');
const require = createRequire(import.meta.url), webpack = require('webpack'), config = require('../../webpack.config.cjs');
const output = path.join(root, 'docs/framework/evidence/f2-sdk-relay-continuation/bundled-fixtures');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
class DetailEvent extends Event { constructor(type, {detail} = {}) { super(type); this.detail = detail; } }
for (const mode of ['production', 'development']) test(`${mode} actual fixed MAIN bundle reevaluates intact own globals and refreshes Hello`, async () => {
  const directory = path.join(output, mode); await mkdir(directory, {recursive: true});
  const compiler = webpack({...config(mode), context: root, entry: {'framework/sdk-main': './src/framework/sdk/entry.js'},
    output: {...config(mode).output, path: directory}});
  try { await new Promise((resolve, reject) => compiler.run((error, stats) => error || stats.hasErrors() ? reject(error ?? new Error(stats.toString({all: false, errors: true}))) : resolve())); }
  finally { await new Promise((resolve, reject) => compiler.close(error => error ? reject(error) : resolve())); }
  const source = await readFile(path.join(directory, 'framework/sdk-main.js'), 'utf8');
  const window = new EventTarget(), messages = []; let methods = ['APPLOCAL_GETITEM'], revoked = false;
  const api = {runtime: {sendMessage(m, cb) { messages.push(structuredClone(m)); queueMicrotask(() => cb(m.type === 'SDK_HELLO' ?
    (revoked ? {ok: false, error: {code: 'E_GRANT_REVOKED'}} : {ok: true, data: {sdkVersion: SDK_VERSION, ready: true, methods}}) :
    {ok: true, data: {valueWire: encodeValue(legacyResult(false))}})); }}};
  const relay = installPageRelay({window, api, CustomEvent: DetailEvent});
  const context = vm.createContext({window, document: {}, CustomEvent: DetailEvent, navigator: {userAgent: ''},
    TextEncoder, TextDecoder, URL, crypto, setTimeout, clearTimeout, btoa, atob});
  try {
    vm.runInContext(source, context, {filename: 'framework/sdk-main.js'}); const sdk = context.OpenDeskSDK; await sdk.ready();
    assert.equal(await sdk.AppLocal.getItem('x'), false);
    const oldReady = sdk.ready(), oldStorage = context.AppStorage, oldCallback = context.ChromeBridgeOperationCompleted;
    methods = ['APPSTORAGE_CLEAR']; vm.runInContext(source, context, {filename: 'framework/sdk-main.js'});
    assert.equal(context.OpenDeskSDK, sdk); assert.equal(context.AppStorage, oldStorage); assert.equal(context.ChromeBridgeOperationCompleted, oldCallback);
    assert.notEqual(sdk.ready(), oldReady); assert.deepEqual(Array.from((await sdk.ready()).methods), methods);
    await assert.rejects(sdk.AppLocal.getItem('x'), e => e.code === 'E_CAPABILITY');
    revoked = true; vm.runInContext(source, context, {filename: 'framework/sdk-main.js'});
    await assert.rejects(sdk.ready(), e => e.code === 'E_GRANT_REVOKED');
    revoked = false; methods = ['APPLOCAL_GETITEM']; vm.runInContext(source, context, {filename: 'framework/sdk-main.js'});
    assert.equal((await sdk.ready()).ready, true); assert.equal(await sdk.AppLocal.getItem('x'), false);
    assert.equal(messages.filter(m => m.type === 'SDK_HELLO').length, 4);
    assert.equal(sdk.diagnostics().pending, 0); sdk.dispose();
    assert.throws(() => vm.runInContext(source, context), e => e.code === 'E_CANCELLED');
    const fake = vm.createContext({window, document: {}, TextEncoder, TextDecoder, URL, crypto, setTimeout, clearTimeout, btoa, atob, OpenDeskSDK: Object.freeze({sdkVersion: SDK_VERSION, ready: async () => ({ready: true, methods: Object.keys(SDK_METHODS)})})});
    assert.throws(() => vm.runInContext(source, fake), e => e.code === 'E_SDK_GLOBAL_CONFLICT');
    await writeFile(path.join(directory, 'report.json'), JSON.stringify({mode, compiledEntry: 'framework/sdk-main.js', sha256: hash(source),
      repeatedFixedBundleEvaluation: true, helloCount: 4, globalsPreserved: true, grantRefreshTested: true,
      boundary: 'Exact webpack MAIN entry evaluated in VM; Chrome runtime callback oracle, not actual Chrome file injection or native admission',
      F3: false, original603: false}, null, 2) + '\n');
  } finally { context.OpenDeskSDK?.dispose(); relay.removeEventListeners(); }
});
