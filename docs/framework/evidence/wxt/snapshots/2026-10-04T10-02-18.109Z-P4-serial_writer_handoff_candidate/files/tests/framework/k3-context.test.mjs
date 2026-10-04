import test from 'node:test';
import assert from 'node:assert/strict';
import {createRunContext, relayContextRequest} from '../../src/framework/context.js';
import {ChromePage, ChromeElement, Keyboard} from '../../src/framework/ChromePage.js';
import {encodeValue, decodeValue} from '../../src/framework/control/value.js';
import {createWorkerPageProxy} from '../../src/scripting/sandbox/page-proxy.js';

const target = {tabId: 17, frameId: 4, documentId: 'document-A', targetVersion: 1, targetSessionId: 'target-A', allowedOrigin: 'https://a.example'};
const revision = {scriptId: 'script', revision: 1, sourceHash: '1'.repeat(64), paramsHash: '2'.repeat(64)};
const identity = {runId: 'run-A', ownerEpoch: 1, runRevision: 1, hostInstanceId: 'host-A', hostDocumentId: 'host-doc-A', target};
function fixture(handler = () => undefined, extra = {}) {
  const calls = [];
  const transport = {async request(envelope, config) { calls.push(envelope); const response = await handler(envelope, config); return {requestId: envelope.requestId, value: encodeValue(response)}; }};
  return {calls, context: createRunContext({identity, revision, target, transport, dom: null, ...extra})};
}
test('CMP11-API01/02/03/04: bound constructors, immutable pins and independent owners', async () => {
  assert.throws(() => new ChromePage(), {code: 'E_PAGE_CONTEXT_REQUIRED'});
  const a = fixture(e => e.target.documentId), b = fixture(e => e.target.documentId, {identity: {...identity, runId: 'run-B'}, target: {...target, tabId: 21, documentId: 'document-B'}});
  assert.equal(a.context.page.keyboard, a.context.page.keyboard); assert.equal(a.context.page.keyboard.page, a.context.page);
  assert.equal(a.context.page.environment, 'CHROME'); assert.equal(a.context.page.debug, true);
  assert.equal(new a.context.ChromePage({}).debug, undefined); assert.equal(new a.context.ChromePage({debug: false}).debug, false);
  assert.equal(await a.context.page.title(), 'document-A'); assert.equal(await b.context.page.title(), 'document-B');
  assert.throws(() => { a.context.revision.revision = 2; }, TypeError);
  assert.throws(() => { a.context.identity.runId = 'forged'; }, TypeError);
  assert.throws(() => new a.context.ChromePage({hidden: true}), {code: 'E_OPTION_UNSUPPORTED'});
  a.context.dispose(); b.context.dispose();
});
test('CMP10-API05/06 and CMP01-API36: raw callbacks and raw execute never dispatch', () => {
  const {context, calls} = fixture();
  assert.throws(() => context.page.handleMessage({action: 'operationCompleted'}, {}, () => {}), {code: 'E_CALLBACK_UNAUTHORIZED'});
  assert.throws(() => context.page.operationCompleted('live', '{"PageBrigeCode":0}'), {code: 'E_CALLBACK_UNAUTHORIZED'});
  assert.throws(() => context.page._execute('alert(1)', 'live'), {code: 'E_INTERNAL_API_ONLY'});
  assert.equal(calls.length, 0); context.dispose();
});
test('CMP10-API35: typed values and statement ignored args before registration', async () => {
  const {context, calls} = fixture(e => decodeValue(e.operation.args));
  for (const value of [false, 0, '', null, undefined, -0, {PageBrigeCode: 1, message: 'domain'}]) assert.deepEqual(decodeValue(JSON.parse(JSON.stringify(encodeValue(value)))), value);
  for (const value of [NaN, Infinity, 1n, () => {}, new Date()]) await assert.rejects(context.page.evaluate(x => x, value), {code: 'E_VALUE_SERIALIZATION'});
  const cycle = {}; cycle.self = cycle; await assert.rejects(context.page.evaluate(x => x, cycle), {code: 'E_VALUE_SERIALIZATION'});
  assert.throws(() => context.page.evaluate(Math.abs), {code: 'E_FUNCTION_SOURCE_UNSUPPORTED'});
  await context.page.evaluate('document.title="s"', 1n);
  assert.equal(calls.length, 1); assert.deepEqual(decodeValue(calls[0].operation.args), [{mode: 'legacy-statement', source: 'document.title="s"'}, []]);
  await context.page.evaluate(x => x, undefined); assert.equal(decodeValue(calls[1].operation.args)[1][0], undefined);
  context.dispose();
});
test('CMP03-API34 and CORE-EVALUATE-EXPRESSION: explicit modes and no extra parameters', async () => {
  const {context, calls} = fixture();
  assert.throws(() => context.page.eval('1+2'), {code: 'E_LEGACY_AMBIGUOUS_EXECUTION'});
  assert.throws(() => context.page.eval('1+2', {mode: 'guess'}), {code: 'E_OPTION_UNSUPPORTED'});
  assert.throws(() => context.page.evaluateExpression('false', 0), {code: 'E_ARGUMENT_TYPE'});
  assert.throws(() => context.page.evaluateExpression(' '), {code: 'E_ARGUMENT_TYPE'});
  assert.equal(calls.length, 0);
  await context.page.eval('1===1', {mode: 'expression'}); await context.page.evaluateExpression('Promise.resolve(3)');
  assert.equal(calls.every(e => e.operation.kind === 'user-script'), true); context.dispose();
});
test('CMP02-API12/13-LIMIT: Worker DOM snapshots reject; serialized alternatives preserve null/[]', async () => {
  const {context, calls} = fixture(e => e.operation.method === 'snapshot' ? null : []);
  await assert.rejects(context.page.$('#missing'), {code: 'E_DOM_SNAPSHOT_CONTEXT'});
  await assert.rejects(context.page.$$('.missing'), {code: 'E_DOM_SNAPSHOT_CONTEXT'}); assert.equal(calls.length, 0);
  assert.equal(await context.page.snapshot('#missing'), null); assert.deepEqual(await context.page.snapshots('.missing'), []); context.dispose();
});
test('NAV01 + ChromeElement: only attested navigation advances root; old element/keyboard sequence stay bound', async () => {
  const calls = [], to = {...target, documentId: 'document-next', targetVersion: 2};
  const transport = {async request(e) { calls.push(e); return {requestId: e.requestId, value: encodeValue(undefined), ...(e.operation.method === 'goto' ? {handoff: {from: e.target, to}} : {})}; }};
  const context = createRunContext({identity, revision, target, transport, dom: null});
  const element = new ChromeElement(context.page, '#name');
  assert.equal(element.page, context.page); assert.equal(element.selector, '#name'); assert.equal(new Keyboard(context.page).page, context.page);
  await context.page.goto('https://a.example/next', {timeout: 0, waitUntil: 'domcontentloaded'});
  assert.equal(context.target.documentId, 'document-next');
  await assert.rejects(element.click(), {code: 'E_DOCUMENT_REPLACED'});
  await assert.rejects(element.type('x'), {code: 'E_DOCUMENT_REPLACED'});
  assert.throws(() => element.uploadFile(new ArrayBuffer(0)), {code: 'E_DOCUMENT_REPLACED'});
  await context.page.title(); assert.equal(calls.at(-1).identity.target.documentId, 'document-next'); context.dispose();
});
test('CTRL owner fencing: stop/deadline/host-close settle pending once; stale request never rebinds new ctx', async () => {
  for (const code of ['E_CANCELLED', 'E_TIMEOUT', 'E_HOST_CLOSED']) {
    let resume; const {context, calls} = fixture(() => new Promise(resolve => { resume = resolve; }));
    const pending = context.page.title(); await Promise.resolve(); context.dispose(code); await assert.rejects(pending, {code});
    const fresh = fixture(() => 'fresh', {identity: {...identity, runId: 'run-next'}, target: {...target, tabId: 23}});
    resume('late'); await Promise.resolve(); assert.equal(await fresh.context.page.title(), 'fresh');
    assert.equal(calls[0].identity.runId, 'run-A'); assert.equal(calls[0].target.tabId, 17);
    await assert.rejects(context.page.title(), {code}); assert.equal(context.snapshot().pending, 0); fresh.context.dispose();
  }
  const expired = fixture(undefined, {deadline: performance.now() - 1}); await assert.rejects(expired.context.page.title(), {code: 'E_TIMEOUT'});
  assert.equal(expired.calls.length, 0);
});
test('Private Worker port: global fake peer, wrong owner, wrong correlation and reply replay cannot settle', async () => {
  const channel = new MessageChannel(); const proxy = createWorkerPageProxy({port: channel.port1, identity, revision, target});
  let operation; channel.port2.onmessage = ({data}) => { operation = data; }; channel.port2.start();
  let settled = 0; const request = proxy.page.title().then(v => { settled++; return v; });
  while (!operation) await new Promise(resolve => setTimeout(resolve, 1));
  for (const data of [
    {...operation, kind: 'reply', runId: 'forged', reply: {requestId: operation.envelope.requestId, value: encodeValue('fake')}},
    {...operation, kind: 'reply', ownerEpoch: 2, reply: {requestId: operation.envelope.requestId, value: encodeValue('fake')}},
    {...operation, kind: 'reply', reply: {requestId: 'wrong', value: encodeValue('fake')}}
  ]) channel.port2.postMessage(data);
  await new Promise(resolve => setTimeout(resolve, 5)); assert.equal(settled, 0);
  const reply = {kind: 'reply', runId: identity.runId, ownerEpoch: 1, id: operation.id, reply: {requestId: operation.envelope.requestId, value: encodeValue('real')}};
  channel.port2.postMessage(reply); assert.equal(await request, 'real'); channel.port2.postMessage(reply); await new Promise(resolve => setTimeout(resolve, 5)); assert.equal(settled, 1);
  proxy.dispose(); channel.port2.close(); assert.equal(proxy.snapshot().pending, 0);
});
test('Host relay rejects cross-owner/old revision/old target before the shared transport', async () => {
  const {context, calls} = fixture(); const good = {requestId: 'op', identity, revision, target, operation: {kind: 'packaged', method: 'title', args: encodeValue([])}};
  for (const e of [{...good, identity: {...identity, hostInstanceId: 'other'}}, {...good, revision: {...revision, revision: 2}}, {...good, target: {...target, documentId: 'old'}}]) await assert.rejects(relayContextRequest(context, e));
  assert.equal(calls.length, 0); await relayContextRequest(context, good); assert.equal(calls.length, 1); context.dispose();
});
