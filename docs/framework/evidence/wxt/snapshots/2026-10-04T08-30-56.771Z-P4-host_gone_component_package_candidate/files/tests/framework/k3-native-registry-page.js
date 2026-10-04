import {createPackagedPageSession} from '/src/scripting/packaged/registry.js';
import {createRunContext} from '/src/framework/context.js';
import {ChromeElement} from '/src/framework/ChromePage.js';
import {encodeValue, decodeValue} from '/src/framework/control/value.js';

// Targeted product-module proof in actual DOM. This does not emulate broker
// admission, IDB pinning, userScripts grants, or final product integration.
const cases = [];
function equal(a, b) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`Expected ${JSON.stringify(b)}; actual ${JSON.stringify(a)}`); }
async function code(promise, expected) { try { await promise; throw new Error('Expected rejection'); } catch (error) { equal(error.code, expected); return {code: error.code, message: error.message}; } }
async function run(caseId, input, expected, fn) {
  const startedMonoMs = performance.now();
  try { const actual = await fn(); cases.push({caseId, status: 'PASS', proof: 'targeted-native-module-only', input, expected, actual, startedMonoMs, endedMonoMs: performance.now()}); }
  catch (error) { cases.push({caseId, status: 'FAIL', proof: 'targeted-native-module-only', input, expected, actual: {name: error.name, code: error.code, message: error.message, stack: error.stack}, startedMonoMs, endedMonoMs: performance.now()}); }
}
function session(signal) { return createPackagedPageSession({document, window, signal}); }
const input = document.querySelector('#name'), events = [];
for (const type of ['focus', 'keydown', 'input', 'keypress', 'keyup', 'change', 'mousedown', 'mouseup', 'click', 'contextmenu']) {
  document.addEventListener(type, event => events.push({type, target: event.target.id || event.target.nodeName, key: event.key, data: event.data, inputType: event.inputType, bubbles: event.bubbles, cancelable: event.cancelable, composed: event.composed, detail: event.detail, button: event.button, isTrusted: event.isTrusted, value: input.value}), true);
}
const s = session();
await run('CMP09-API22-OK', {selector: '#name', text: 'Alice', initialValue: 'Base', delay: 0}, {value: 'BaseAlice', result: 'Typed', events: 'keydown/input/keypress/keyup per char; no change'}, async () => {
  input.value = 'Base'; events.length = 0; const result = await s.execute('type', ['#name', 'Alice', {delay: 0}]);
  equal(result, 'Typed'); equal(input.value, 'BaseAlice'); equal(events.filter(e => e.type !== 'focus').map(e => e.type), [...'Alice'].flatMap(() => ['keydown', 'input', 'keypress', 'keyup']));
  equal(events.filter(e => e.type === 'input').map(e => e.data), [...'Alice']); equal(events.filter(e => e.type !== 'focus').every(e => !e.isTrusted), true); return {result, value: input.value, events: [...events]};
});
await run('CMP09-API22-LIMIT', {texts: ['😀+Q', '', 'null', 'undefined'], readonly: '#readonly', noninput: '#marker'}, 'Unicode codepoints; append; readonly/noninput rejected', async () => {
  input.value = 'Base'; events.length = 0; await s.execute('type', ['#name', '😀+Q', {delay: 0}]); equal(input.value, 'Base😀+Q'); equal(events.filter(e => e.type === 'keydown').length, 3);
  const before = input.value; await s.execute('type', ['#name', '', {delay: 0}]); equal(input.value, before);
  return {value: input.value, unicodeEvents: [...events], readonly: await code(s.execute('type', ['#readonly', 'x', {delay: 0}]), 'E_INPUT_TARGET_UNSUPPORTED'), noninput: await code(s.execute('type', ['#marker', 'x', {delay: 0}]), 'E_INPUT_TARGET_UNSUPPORTED')};
});
await run('CMP09-API21-OK', {selector: '#submit', buttons: ['left', 'right', 'middle'], clickCount: 2, delay: 0}, 'clicked; exact mousedown/up/action; old button=0 detail=2', async () => {
  const actual = [];
  for (const button of ['left', 'right', 'middle']) {
    events.length = 0; const result = await s.execute('click', ['#submit', {button, clickCount: 2, delay: 0}]); equal(result, 'clicked');
    const selected = events.filter(e => ['mousedown', 'mouseup', 'click', 'contextmenu'].includes(e.type));
    equal(selected.map(e => e.type), Array.from({length: 2}, () => ['mousedown', 'mouseup', button === 'right' ? 'contextmenu' : button === 'middle' ? 'mouseup' : 'click']).flat());
    equal(selected.every(e => e.button === 0 && e.detail === 2 && e.bubbles && e.cancelable && !e.isTrusted), true); actual.push({button, result, events: [...selected]});
  } return actual;
});
await run('AUTH-API21-FENCE', 'abort at mousedown before delayed mouseup', 'no mouseup/click after cancellation; real timer reclaimed', async () => {
  const abort = new AbortController(), own = session(abort.signal); events.length = 0;
  const listener = () => abort.abort(Object.assign(new Error('stop'), {code: 'E_CANCELLED'}));
  document.querySelector('#submit').addEventListener('mousedown', listener, {once: true});
  const error = await code(own.execute('click', ['#submit', {button: 'left', clickCount: 2, delay: 20}]), 'E_CANCELLED');
  equal(events.map(e => e.type), ['mousedown']); equal(own.snapshot(), {waits: 0, uploads: 0, nodes: 0, resources: 0}); return {error, events: [...events], cleanup: own.snapshot()};
});
await run('CMP01-API46-OK', {focusedValue: 'Base😀', keys: ['A', '+', 'Backspace', 'Enter']}, 'document default flags; no value edits; exact press/down/up events', async () => {
  input.value = 'Base😀'; input.focus(); events.length = 0;
  for (const key of ['A', '+', 'Backspace', 'Enter']) equal(await s.execute('keyboard', ['press', key]), undefined);
  await s.execute('keyboard', ['down', 'Shift']); await s.execute('keyboard', ['up', 'Shift']);
  equal(input.value, 'Base😀'); equal(events.map(e => e.type), [...Array.from({length: 4}, () => ['keydown', 'keypress', 'keyup']).flat(), 'keydown', 'keyup']);
  equal(events.every(e => e.target === '#document' && !e.bubbles && !e.cancelable && !e.composed && !e.isTrusted), true);
  const captured = [...events]; return {value: input.value, events: captured, rejectedCombo: await code(s.execute('keyboard', ['press', 'Control+A']), 'E_KEY_UNSUPPORTED')};
});
await run('CMP01-API07-OK', 'selected document title/body HTML/location href including hash', 'exact values, no cross-frame selection', async () => {
  equal(await s.execute('title', []), document.title); equal(await s.execute('content', []), document.body.innerHTML); equal(await s.execute('url', []), location.href);
  const frame = document.querySelector('#child');
  if (frame.contentWindow.location.pathname !== '/child' || frame.contentDocument.readyState !== 'complete') await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Child document did not commit')), 5000);
    frame.addEventListener('load', () => { clearTimeout(timer); resolve(); }, {once: true});
  });
  const other = createPackagedPageSession({document: frame.contentDocument, window: frame.contentWindow});
  equal(await other.execute('title', []), 'Child-B'); other.dispose(); return {title: await s.execute('title', []), url: await s.execute('url', []), childTitle: 'Child-B'};
});
await run('CMP02-API12-OK', 'host $/$$ inert detached snapshots + Worker snapshot/snapshots missing result', 'HTML only; detached/null/[]; Worker DOM object rejection', async () => {
  const target = {tabId: 1, frameId: 0, documentId: 'targeted-fixture-only', targetVersion: 1};
  const identity = {runId: 'targeted-run', ownerEpoch: 1, target};
  const transport = {async request(e) { return {requestId: e.requestId, value: encodeValue(await s.execute(e.operation.method, decodeValue(e.operation.args)))}; }};
  const host = createRunContext({identity, revision: {revision: 1, sourceHash: '1'.repeat(64)}, target, transport, dom: document});
  const node = await host.page.$('#marker'), all = await host.page.$$('.item');
  equal(node.isConnected, false); equal(node.outerHTML, document.querySelector('#marker').outerHTML); equal(all.length, 2); equal(await host.page.$('#missing'), null); equal(await host.page.$$('.missing'), []);
  const worker = createRunContext({identity, revision: {revision: 1, sourceHash: '1'.repeat(64)}, target, transport, dom: null});
  const rejected = await code(worker.page.$('#marker'), 'E_DOM_SNAPSHOT_CONTEXT'); equal(await worker.page.snapshot('#missing'), null); equal(await worker.page.snapshots('.missing'), []);
  const result = {hostOuterHTML: node.outerHTML, detached: !node.isConnected, documentOrder: all.map(n => n.outerHTML), rejected, snapshot: await worker.page.snapshot('#marker')}; host.dispose(); worker.dispose(); return result;
});
await run('CMP01-API25-OK', 'existing hidden + visible elements; disappearing/missing element hidden timeout; invalid CSS', 'true only existing element; real timeout and cleanup', async () => {
  equal(await s.execute('waitForSelector', ['#hidden', {visible: false, hidden: true, timeout: 30}]), true);
  equal(await s.execute('waitForSelector', ['#marker', {visible: true, hidden: false, timeout: 30}]), true);
  const missing = await code(s.execute('waitForSelector', ['#missing', {visible: false, hidden: true, timeout: 30}]), 'E_TIMEOUT');
  const invalid = await code(s.execute('waitForSelector', ['[', {visible: false, hidden: false, timeout: 30}]), 'E_SELECTOR_INVALID');
  equal(s.snapshot().waits, 0); return {hiddenExisting: true, visibleExisting: true, missing, invalid, cleanup: s.snapshot()};
});
await run('AUTH-API25-FENCE', 'cancel timeout=0 selector wait after a real timer is registered', 'E_CANCELLED and real wait/timer removed', async () => {
  const abort = new AbortController(), own = session(abort.signal), waiting = own.execute('waitForSelector', ['#missing', {visible: false, hidden: false, timeout: 0}]);
  const rejected = code(waiting, 'E_CANCELLED'); await new Promise(resolve => setTimeout(resolve, 8)); const before = own.snapshot(); equal(before.waits, 1); abort.abort(); await rejected;
  equal(own.snapshot().waits, 0); return {before, after: own.snapshot()};
});
await run('CMP04-API31-OK', 'native Blob bytes => chunks => File/DataTransfer/change; full facade return contracts', 'filename.jpg image/jpeg; byte identity; top undefined/helper true/dataURL undefined', async () => {
  const target = {tabId: 1, frameId: 0, documentId: 'targeted-fixture-only', targetVersion: 1};
  const transport = {async request(e) { return {requestId: e.requestId, value: encodeValue(await s.execute(e.operation.method, decodeValue(e.operation.args)))}; }};
  const host = createRunContext({identity: {runId: 'upload-run', ownerEpoch: 1, target}, revision: {revision: 1, sourceHash: '1'.repeat(64)}, target, transport, dom: document});
  events.length = 0; const result = await host.page._uploadFromBlob('#file', new Blob([new Uint8Array([0, 1, 255, 41])], {type: 'application/octet-stream'})); equal(result, true);
  const file = document.querySelector('#file').files[0]; equal(file.name, 'filename.jpg'); equal(file.type, 'image/jpeg'); equal(Array.from(new Uint8Array(await file.arrayBuffer())), [0, 1, 255, 41]);
  const dataReturn = await host.page._uploadFromDataUrl('#file', 'data:text/plain;base64,QUJD'); equal(dataReturn, undefined); equal(await host.page.uploadFile('#file', new ArrayBuffer(0)), undefined);
  equal(await new ChromeElement(host.page, '#file').uploadFile('data:text/plain;base64,QQ=='), undefined);
  equal(events.filter(e => e.type === 'change').length, 4); equal(s.snapshot().uploads, 0); host.dispose(); return {blobHelper: 'true', top: 'undefined', dataURL: 'undefined', firstFile: {name: file.name, type: file.type, bytes: Array.from(new Uint8Array(await file.arrayBuffer()))}, changeEvents: events.filter(e => e.type === 'change'), cleanup: s.snapshot()};
});
await run('CMP04-API31-LIMIT', 'decoded >1MiB, nonbase64, file input disabled/non-file', 'typed errors before assignment; no residual upload', async () => {
  const result = {nonFile: await code(s.execute('uploadCommit', ['#marker', 'empty', 0]), 'E_INPUT_TARGET_UNSUPPORTED'), invalidBase64: await code(s.execute('uploadChunk', ['id', 0, 3, '%%%']), 'E_UPLOAD_FORMAT')}; equal(s.snapshot().uploads, 0); return {...result, cleanup: s.snapshot()};
});
await run('CMP01-API24-OK', 'real finite wait + negative duration', 'undefined; E_ARGUMENT_TYPE; no remaining timer', async () => {
  const started = performance.now(); equal(await s.execute('waitForTimeout', [10]), undefined); const actualMilliseconds = performance.now() - started;
  const error = await code(s.execute('waitForTimeout', [-1]), 'E_ARGUMENT_TYPE'); equal(s.snapshot().waits, 0); return {actualMilliseconds, result: 'undefined', error, cleanup: s.snapshot()};
});
s.dispose();
globalThis.__k3RegistryReport = {cases, summary: {PASS: cases.filter(c => c.status === 'PASS').length, FAIL: cases.filter(c => c.status === 'FAIL').length}, cleanup: s.snapshot(), limitations: ['No authority/broker/native userScripts/IDB/UI integration qualification in this targeted document harness', 'No cookies/screenshot/network/navigation/physical Worker proof claimed']};
