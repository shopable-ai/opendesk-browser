import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {encodeValue, decodeValue} from '../../../../src/platform/page-port/codec.js';
import {legacyResult} from '../../../../src/framework/sdk/bridge.js';
import {PROTOCOL, SDK_REQUEST_EVENT, SDK_RESULT_EVENT} from '../../../../src/framework/sdk/registry.js';
const root = process.cwd(), baseline = process.argv.includes('--baseline');
const directory = path.join(root, 'docs/framework/evidence/f2-sdk-relay-continuation');
async function load(relative, suffix = '') {
  const sourcePath = pathToFileURL(path.join(root, relative));
  let source = await readFile(baseline ? path.join(directory, 'before', relative) : sourcePath, 'utf8');
  source = source.replace(/from '(\.\.?\/[^']+)'/g, (_, p) => `from '${new URL(p, sourcePath).href}'`);
  return import('data:text/javascript;base64,' + Buffer.from(source + `\n// ${suffix}`).toString('base64'));
}
const observations = [];
const transport = {hello: async () => ({sdkVersion: '1.0.0', ready: true, methods: []}), request: async () => { throw Error('no calls expected'); }};
const one = await load('src/framework/sdk/entry.js', 'first entry evaluation'), two = await load('src/framework/sdk/entry.js', 'second entry evaluation');
const page = {navigator: {userAgent: ''}}, sdk = one.installPageSdk({global: page, transport});
const sameModuleIdempotent = one.installPageSdk({global: page, transport}) === sdk;
try { observations.push({case: 'fresh-MAIN', sameModuleIdempotent, reused: two.installPageSdk({global: page, transport}) === sdk}); }
catch (error) { observations.push({case: 'fresh-MAIN', sameModuleIdempotent, code: error.code}); }
sdk.dispose();
const {installPageRelay} = await load('src/agents/page-relay.js');
class DetailEvent extends Event { constructor(type, {detail}) { super(type); this.detail = detail; } }
function fixture() {
  const window = new EventTarget(), callbacks = [], replies = [], timers = new Map(); let n = 0;
  const relay = installPageRelay({window, CustomEvent: DetailEvent, clock: {now: () => 1000},
    api: {runtime: {sendMessage: (message, callback) => callbacks.push({message, callback})}},
    setTimer: fn => { const id = ++n; timers.set(id, fn); return id; }, clearTimer: id => timers.delete(id)});
  window.addEventListener(SDK_RESULT_EVENT, event => replies.push(JSON.parse(event.detail)));
  const send = (requestId, value) => relay.messager(new DetailEvent(SDK_REQUEST_EVENT, {detail: JSON.stringify({protocol: PROTOCOL, type: 'SDK_REQUEST',
    payload: {requestId, method: 'APPLOCAL_SETITEM', argsWire: encodeValue({key: 'x', value}), deadlineAt: 2000}})}));
  const ok = value => ({ok: true, data: {valueWire: encodeValue(legacyResult(value))}});
  return {relay, callbacks, replies, timers, send, ok};
}
const f = fixture(), first = f.send('same-id', 1), changed = f.send('same-id', 2);
if (f.callbacks[1]) f.callbacks[1].callback({ok: false, error: {code: 'E_REQUEST_CONFLICT'}});
f.callbacks[0].callback(f.ok(1)); await Promise.all([first, changed]);
observations.push({case: 'same-ID-changed-digest', nativeDispatches: f.callbacks.length, conflictReplies: f.replies.filter(r => r.response?.error?.code === 'E_REQUEST_CONFLICT').length});
f.relay.removeEventListeners();
const late = fixture(), oldCall = late.send('reused', 1); [...late.timers.values()][0]();
const newCall = late.send('reused', 2); late.callbacks[0].callback(late.ok('old-result')); await oldCall;
const pendingAfterOld = late.relay.diagnostics().pending;
late.callbacks[1].callback({ok: false, error: {code: 'E_REQUEST_CONFLICT'}}); await newCall;
observations.push({case: 'timeout-reused-ID-old-callback-first', pendingAfterOld, replies: late.replies.map(r => r.response.ok ? decodeValue(r.response.data.valueWire).data : r.response.error.code)});
late.relay.removeEventListeners(); console.log(JSON.stringify({baseline, observations}, null, 2));
assert.equal(observations[0].reused, true);
assert.equal(observations[1].nativeDispatches, 2); assert.equal(observations[1].conflictReplies, 1);
assert.equal(observations[2].pendingAfterOld, 1); assert.deepEqual(observations[2].replies, ['E_TIMEOUT', 'E_REQUEST_CONFLICT']);
