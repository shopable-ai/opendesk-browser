import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createControllerDriver, PACKAGED_PAGE_FILE} from '../../src/framework/control/native-driver.js';
import {createRunContext} from '../../src/framework/context.js';
import {installPackagedPageSession, PAGE_SESSION_MESSAGE} from '../../src/scripting/packaged/page-session.js';
import {encodeValue, decodeValue, PageError, VALUE_LIMITS} from '../../src/framework/control/value.js';
import {createLocatorDOM} from '../../src/scripting/packaged/locator-dom.js';

// Native API fixtures + real packaged registry/generated harness only. These
// tests provide no real Chrome, physical stop, package, or F3 qualification.
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const revision = {scriptId: 'script', revision: 1, sourceHash: 'a'.repeat(64), pinKey: 'pin:run'};
function event() {
  const listeners = new Set();
  return {addListener: fn => listeners.add(fn), removeListener: fn => listeners.delete(fn),
    emit: (...args) => { for (const fn of [...listeners]) fn(...args); }, size: () => listeners.size};
}
function fixture({frameId = 0, beforeEffect} = {}) {
  const target = {mode: 'borrowed', tabId: 17, frameId, documentId: 'doc-A', url: 'https://a.example/dir/page',
    allowedOrigin: 'https://a.example', browserSessionIncarnation: 'browser-A', targetSessionId: 'session-A', targetVersion: 4};
  const identity = {tag: 'controller-run', runId: 'run-A', ownerEpoch: 3, hostInstanceId: 'host-A', hostDocumentId: 'host-doc', target};
  const state = {target: {...target}, active: true, native: [], auth: [], trace: [], hooks: {}, grants: new Set(['https://a.example']),
    available: true, getScripts: 0, userExecutions: [], cookies: [], changes: 0, page: null, navigation: null};
  const win = new EventTarget(); win.location = {href: target.url}; win.Event = Event; win.File = File;
  win.DataTransfer = class { constructor() { this.files = []; this.items = {add: file => this.files.push(file)}; } };
  const input = {tagName: 'INPUT', type: 'file', disabled: false, multiple: false, webkitdirectory: false,
    dispatchEvent: () => { state.changes++; }, files: []};
  const nodes = new Set(), append = node => { nodes.add(node); if (node.src || node.href) queueMicrotask(() => node.onload?.()); };
  const doc = {defaultView: win, title: 'Document A', head: {append}, body: {innerHTML: '<p>A</p>', append},
    createElement: tag => ({tagName: tag.toUpperCase(), remove() { nodes.delete(this); }}),
    querySelector: css => css === '#file' ? input : null, querySelectorAll: () => []};
  const api = {runtime: {id: 'extension-A', getURL: path => `chrome-extension://extension-A/${path}`, onMessage: event()}, tabs: {onActivated: event(), onUpdated: event(), onRemoved: event()},
    windows: {}, scripting: {}, webNavigation: {}, cookies: {}, userScripts: {}};
  for (const key of ['onBeforeNavigate', 'onCommitted', 'onDOMContentLoaded', 'onCompleted', 'onErrorOccurred']) api.webNavigation[key] = event();
  function native(stage, fn) {
    return (...all) => {
      const callback = typeof all.at(-1) === 'function' ? all.pop() : null;
      state.native.push({stage, args: all}); state.trace.push({kind: 'native', stage});
      assert.equal(state.trace.at(-2)?.kind, 'pre', `strict pre immediately before ${stage}`);
      const dispatch = () => fn(...all);
      const value = state.hooks[stage] ? state.hooks[stage](all, dispatch) : dispatch();
      if (!callback) return Promise.resolve(value);
      Promise.resolve(value).then(value => callback(value), cause => {
        api.runtime.lastError = {message: cause.message}; callback(undefined); delete api.runtime.lastError;
      });
    };
  }
  api.webNavigation.getAllFrames = native('webNavigation.getAllFrames', () => [
    {frameId: 9, documentId: 'unrelated-frame', url: 'https://b.example/'},
    ...(frameId > 0 ? [{frameId: 0, documentId: 'top-document', url: 'https://a.example/top', documentLifecycle: 'active'}] : []),
    {frameId, documentId: state.target.documentId, url: state.target.url, documentLifecycle: 'active'}
  ]);
  api.tabs.get = native('tabs.get', id => ({id, windowId: 31, active: state.active, url: state.target.url}));
  api.windows.get = native('windows.get', id => ({id, state: 'normal'}));
  api.tabs.captureVisibleTab = native('tabs.captureVisibleTab', (_window, config) => `data:image/${config.format};base64,YQ==`);
  api.tabs.sendMessage = native('tabs.sendMessage', (id, message, exact) => {
    assert.equal(id, target.tabId); assert.equal(exact.frameId, target.frameId);
    if (exact.documentId !== state.target.documentId) throw new Error('No document with id');
    return new Promise((resolve, reject) => {
      const listeners = api.runtime.onMessage;
      if (!listeners.size()) { reject(new Error('Could not establish connection. Receiving end does not exist.')); return; }
      listeners.emit(message, {id: api.runtime.id, url: `chrome-extension://${api.runtime.id}/sw.js`}, resolve);
    });
  });
  api.scripting.executeScript = native('scripting.executeScript', request => {
    assert.deepEqual(request, {target: {tabId: 17, documentIds: [state.target.documentId]}, world: 'ISOLATED', files: [PACKAGED_PAGE_FILE]});
    state.page = installPackagedPageSession({api, document: doc, window: win});
    return [{frameId: target.frameId, documentId: state.target.documentId, result: undefined}];
  });
  function navigate(url) {
    state.target = {...state.target, documentId: 'doc-next', url, allowedOrigin: new URL(url).origin, targetVersion: 5};
    win.location.href = url;
    const details = {tabId: 17, frameId: 0, documentId: 'doc-next', url};
    api.webNavigation.onCommitted.emit(details);
    if (state.navigation !== 'held') {
      api.webNavigation.onDOMContentLoaded.emit(details); api.webNavigation.onCompleted.emit(details);
    }
    return {id: 17};
  }
  api.tabs.update = native('tabs.update', (id, {url}) => { assert.equal(id, 17); return navigate(url); });
  api.tabs.reload = native('tabs.reload', id => { assert.equal(id, 17); return navigate(state.target.url); });
  api.cookies.getAllCookieStores = native('cookies.getAllCookieStores', () => [{id: 'store-A', tabIds: [17]}, {id: 'store-B', tabIds: [18]}]);
  api.cookies.getAll = native('cookies.getAll', ({url, storeId}) => {
    assert.equal(storeId, 'store-A'); const parsed = new URL(url);
    return state.cookies.filter(row => row.storeId === storeId && row.domain.replace(/^\./, '') === parsed.hostname &&
      (parsed.pathname === row.path || parsed.pathname.startsWith(row.path.endsWith('/') ? row.path : row.path + '/')));
  });
  api.cookies.set = native('cookies.set', value => {
    const row = {name: value.name, value: value.value, path: value.path ?? '/dir', domain: value.domain ?? new URL(value.url).hostname,
      storeId: value.storeId, secure: value.secure ?? false, httpOnly: value.httpOnly ?? false,
      sameSite: value.sameSite ?? 'unspecified', ...(value.expirationDate !== undefined ? {expirationDate: value.expirationDate} : {})};
    state.cookies.push(row); return row;
  });
  api.cookies.remove = native('cookies.remove', ({url, name, storeId}) => {
    const parsed = new URL(url), index = state.cookies.findIndex(row => row.storeId === storeId && row.name === name && row.path === parsed.pathname);
    if (index < 0) return null; state.cookies.splice(index, 1); return {url, name, storeId};
  });
  const realm = vm.createContext({TextEncoder, setTimeout, clearTimeout, performance, document: doc, console});
  api.userScripts.getScripts = async () => {
    state.native.push({stage: 'userScripts.getScripts'}); state.trace.push({kind: 'native', stage: 'userScripts.getScripts'});
    assert.equal(state.trace.at(-2)?.kind, 'pre'); state.getScripts++;
    if (!state.available) throw new Error('User scripts toggle disabled'); return [];
  };
  api.userScripts.execute = async request => {
    state.native.push({stage: 'userScripts.execute', args: [request]}); state.trace.push({kind: 'native', stage: 'userScripts.execute'});
    assert.equal(state.trace.at(-2)?.kind, 'pre'); state.userExecutions.push(request);
    if (state.hooks['userScripts.execute']) return state.hooks['userScripts.execute'](request);
    const value = await vm.runInContext(request.js[0].code, realm);
    return [{frameId: target.frameId, documentId: state.target.documentId, result: JSON.parse(JSON.stringify(value))}];
  };
  async function authorize(envelope, details) {
    state.auth.push({envelope, details}); state.trace.push({kind: details.phase, details});
    if (state.hooks.authorize) await state.hooks.authorize(envelope, details);
    if (details.url && !state.grants.has(new URL(details.url).origin)) throw new PageError('E_PERMISSION');
    if (!state.grants.has(target.allowedOrigin)) throw new PageError('E_PERMISSION');
    if (details.navigationPending) assert.equal(['goto', 'reload'].includes(envelope.operation.method), true);
    else if ((details.handoff?.to ?? envelope.target).documentId !== state.target.documentId) throw new PageError('E_DOCUMENT_REPLACED');
    return true;
  }
  let number = 0;
  const envelope = (method, args = [], kind = 'packaged', extra = {}) => ({requestId: `request-${++number}`, identity, revision, target,
    operation: {kind, method, args: encodeValue(args, {maxBytes: method === 'uploadChunk' ? 131072 : 65536})}, ...extra});
  const driver = createControllerDriver({api, authorize, beforeEffect});
  const result = async (method, args, kind, config) => {
    const reply=await driver.execute(envelope(method,args,kind),config);
    if(reply.error)throw new PageError(reply.error.code,reply.error.message,reply.error.cause);
    return decodeValue(reply.value);
  };
  const dispose = () => state.page?.dispose();
  return {api, state, driver, target, identity, revision, envelope, result, authorize, win, doc, input, nodes, realm, dispose};
}

test('a closed read-only readiness port initializes the exact document without replaying business requests', async t => {
  const f = fixture(); t.after(f.dispose); let probes = 0, executions = 0;
  f.state.hooks['tabs.sendMessage'] = (args, dispatch) => {
    if (args[1].action === 'ping' && ++probes === 1) throw new Error('The message port closed before a response was received.');
    if (args[1].action === 'execute') executions++;
    return dispatch();
  };
  assert.equal(await f.result('title'), 'Document A');
  assert.equal(probes, 2); assert.equal(executions, 1);
  assert.equal(f.state.native.filter(row => row.stage === 'scripting.executeScript').length, 1);
  f.state.hooks['tabs.sendMessage'] = (args, dispatch) => {
    if (args[1].action === 'execute') { executions++; throw new Error('The message port closed before a response was received.'); }
    return dispatch();
  };
  await assert.rejects(f.result('title'), {code: 'E_CHROME'});
  assert.equal(executions, 2, 'failed business delivery is never retried');
});

test('existing ChromePage evaluate changes only its exact document through USER_SCRIPT after active-tab changes',async t=>{
  const f=fixture();t.after(f.dispose);f.doc.body.dataset={};const decoy={body:{dataset:{}}};
  const context=createRunContext({identity:f.identity,revision:f.revision,target:f.target,
    transport:{request:envelope=>f.driver.execute(envelope)}});t.after(()=>context.dispose());
  f.state.active=false;
  assert.equal(await context.page.evaluate(()=>{document.body.dataset.opendesk='enabled';return document.body.dataset.opendesk;}),'enabled');
  assert.equal(f.doc.body.dataset.opendesk,'enabled');assert.equal(decoy.body.dataset.opendesk,undefined);
  assert.equal(f.state.userExecutions.at(-1).world,'USER_SCRIPT');
  assert.deepEqual(f.state.userExecutions.at(-1).target,{tabId:f.target.tabId,documentIds:[f.target.documentId]});
});

test('real packaged errors have an exact correlated final receipt and permit the next call', async t => {
  for (const frameId of [0, 7]) {
    const f = fixture({frameId}); t.after(f.dispose); const receipts = [];
    const envelope = f.envelope('click', ['#absent']);
    const reply = await f.driver.execute(envelope, {recordReceipt: row => receipts.push(row)});
    assert.equal(reply.requestId, envelope.requestId); assert.equal(reply.error.code, 'E_SELECTOR_NOT_FOUND');
    const raw = receipts.find(row => row.stage === 'tabs.sendMessage' && row.receipt?.requestId === envelope.requestId);
    assert.equal(raw.receipt.runId, f.identity.runId); assert.equal(raw.receipt.ownerEpoch, f.identity.ownerEpoch);
    assert.deepEqual(receipts.find(row => row.stage === 'packaged.finalFailure'), {requestId: envelope.requestId,
      stage: 'packaged.finalFailure', receipt: {frameId, documentId: f.target.documentId,
        runId: f.identity.runId, ownerEpoch: f.identity.ownerEpoch, error: reply.error}});
    assert.deepEqual(receipts.find(row => row.stage === 'result').receipt, reply);
    assert.equal(await f.result('title'), 'Document A');
    assert.equal(f.state.page.snapshot().waits, 0);
  }
});
test('CMP09-API21-ERR: real missing and invalid selectors retain their distinct final errors', async t => {
  const f=fixture();t.after(f.dispose);const receipts=[];
  f.doc.querySelector=css=>{if(css==='[')throw new SyntaxError('invalid selector');return null;};
  const context=createRunContext({identity:f.identity,revision:f.revision,target:f.target,
    transport:{request:envelope=>f.driver.execute(envelope,{recordReceipt:row=>receipts.push(row)})}});
  t.after(()=>context.dispose());
  for(const [css,code] of [['#absent','E_SELECTOR_NOT_FOUND'],['[','E_SELECTOR_INVALID']]) {
    await assert.rejects(context.page.click(css),{code});
    const final=receipts.filter(row=>row.stage==='packaged.finalFailure').at(-1);
    assert.equal(final.receipt.documentId,f.target.documentId);assert.equal(final.receipt.error.code,code);
    assert.deepEqual(receipts.find(row=>row.stage==='result'&&row.requestId===final.requestId).receipt.error,final.receipt.error);
  }
  const count=f.state.native.length;
  for(const opts of [{delay:-1},{clickCount:0}])assert.throws(()=>context.page.click('#submit',opts),{code:'E_OPTION_UNSUPPORTED'});
  assert.equal(f.state.native.length,count,'Invalid options must not dispatch or observe a native API');
  assert.equal(await context.page.title(),'Document A');assert.equal(context.resourceSnapshot().pending,0);assert.equal(f.state.changes,0);
});
test('derived packaged upload failure does not certify the enclosing browser effect', async t => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response('abc'); t.after(() => { globalThis.fetch = original; });
  const f = fixture(); t.after(f.dispose); const receipts = [];
  await assert.rejects(f.driver.execute(f.envelope('uploadFromUrl', ['#absent', 'https://a.example/bytes'], 'browser'),
    {recordReceipt: row => receipts.push(row)}), {code: 'E_SELECTOR_NOT_FOUND'});
  assert(receipts.some(row => row.stage === 'tabs.sendMessage' && row.receipt?.error?.code === 'E_SELECTOR_NOT_FOUND'));
  assert(!receipts.some(row => ['packaged.finalFailure', 'result'].includes(row.stage)));
  assert.equal(f.state.changes, 0); assert.equal(f.state.page.snapshot().uploads, 0);
});
test('dispatch allowlists reject malformed kind/method before any authority or native call', async () => {
  const f = fixture();
  for (const [kind, method] of [['template', 'title'], ['__proto__', 'title'], ['packaged', 'goto'], ['browser', 'evaluate'], ['user-script', 'title']]) {
    await assert.rejects(f.driver.execute(f.envelope(method, [], kind)), {code: 'E_OPERATION_UNSUPPORTED'});
  }
  await assert.rejects(f.driver.execute(f.envelope('title', [], 'packaged', {identity: {...f.identity, tag: 'template-run'}})), {code: 'E_OWNER_CHANGED'});
  assert.equal(f.state.native.length, 0); assert.equal(f.state.auth.length, 0);
});
test('packaged exact document injection, correlation and undefined use real registry; no reinjection/global mutation', async t => {
  const f = fixture(); t.after(f.dispose);
  assert.equal(await f.result('title'), 'Document A'); assert.equal(await f.result('content'), '<p>A</p>');
  assert.equal(await f.result('url'), f.target.url); assert.equal(await f.result('waitForTimeout', [0]), undefined);
  assert.equal(await f.result('snapshot', ['#missing']), null); assert.deepEqual(await f.result('snapshots', ['.missing']), []);
  assert.equal(f.state.native.filter(row => row.stage === 'scripting.executeScript').length, 1);
  assert.equal(f.win.__openDeskPageSession, undefined);
  for (const row of f.state.native.filter(row => row.stage === 'tabs.sendMessage')) assert.deepEqual(row.args[2], {documentId: 'doc-A', frameId: 0});
});
test('page session accepts trusted extension sender only, rejects spoof/changed replay and settles each execution once', async t => {
  const f = fixture(); t.after(f.dispose); await f.result('title');
  const envelope = f.envelope('waitForTimeout', [2]); const message = {type: PAGE_SESSION_MESSAGE, action: 'execute', envelope};
  let replies = 0;
  for (const sender of [{id: 'other'}, {id: f.api.runtime.id, tab: {id: 17}, url: f.target.url}, {id: f.api.runtime.id, url: f.target.url}]) {
    f.api.runtime.onMessage.emit(message, sender, () => { replies++; });
  }
  await pause(4); assert.equal(replies, 0);
  const send = message => new Promise(resolve => f.api.runtime.onMessage.emit(message, {id: f.api.runtime.id}, resolve));
  const [first, duplicate] = await Promise.all([send(message), send(message)]);
  assert.deepEqual(first, duplicate); assert.equal(decodeValue(first.value), undefined);
  const changed = await send({...message, envelope: {...envelope, operation: {...envelope.operation, args: encodeValue([100])}}});
  assert.equal(changed.error.code, 'E_OPERATION_REPLAY'); assert.equal(f.state.page.snapshot().waits, 0);
});
test('each dispatch is preceded by authority; revocation during suspension produces zero subsequent dispatches', async t => {
  const f = fixture(); t.after(f.dispose); let reads = 0;
  f.state.hooks.authorize = (_envelope, details) => { if (details.phase === 'pre' && ++reads === 4) throw new PageError('E_PERMISSION'); };
  await assert.rejects(f.result('title'), {code: 'E_PERMISSION'});
  assert.equal(f.state.native.some(row => row.stage === 'scripting.executeScript'), false);
});
test('real current getScripts at dispatch and accept; false/undefined/business values strictly encoded with generator worlds', async t => {
  const f = fixture(); t.after(f.dispose);
  for (const [source, expected] of [['()=>false', false], ['()=>undefined', undefined], ['()=>0', 0], ['()=>({PageBrigeCode:1,message:"business"})', {PageBrigeCode: 1, message: 'business'}]]) {
    assert.deepEqual(await f.result('evaluate', [{mode: 'function', source}, []], 'user-script'), expected);
  }
  assert.equal(f.state.getScripts, 8); assert.equal(f.state.userExecutions.every(row => row.world === 'USER_SCRIPT'), true);
  assert.equal(await f.result('evaluateExpression', ['false'], 'user-script'), false);
  assert.equal(f.state.userExecutions.at(-1).world, 'MAIN');
  for (const row of f.state.userExecutions) assert.deepEqual(row.target, {tabId: 17, documentIds: ['doc-A']});
});
test('switch observed unavailable is sticky across driver instances and results are retained before failing post permission', async () => {
  const f = fixture(), receipts = [];
  f.state.hooks['userScripts.execute'] = () => { f.state.available = false; return [{frameId: 0, documentId: 'doc-A', result: {ok: true, value: encodeValue(false)}}]; };
  await assert.rejects(f.driver.execute(f.envelope('evaluateExpression', ['false'], 'user-script'), {recordReceipt: value => receipts.push(value)}), {code: 'E_USER_SCRIPTS_UNAVAILABLE'});
  assert.equal(receipts.find(row => row.stage === 'userScripts.execute').receipt[0].result.value.t, 'boolean');
  f.state.available = true; const another = createControllerDriver({api: f.api, authorize: f.authorize});
  await assert.rejects(another.execute(f.envelope('evaluateExpression', ['false'], 'user-script')), {code: 'E_USER_SCRIPTS_UNAVAILABLE'});
  assert.equal(f.state.userExecutions.length, 1);
});
test('user-script receipt must attest exact document/frame; malformed and user errors propagate', async () => {
  for (const receipt of [[], [{frameId: 1, documentId: 'doc-A', result: {ok: true, value: encodeValue(1)}}],
    [{frameId: 0, documentId: 'other', result: {ok: true, value: encodeValue(1)}}]]) {
    const f = fixture(); f.state.hooks['userScripts.execute'] = () => receipt;
    await assert.rejects(f.result('evaluateExpression', ['1'], 'user-script'), {code: 'E_TARGET'});
  }
  const f = fixture(); await assert.rejects(f.result('evaluate', [{mode: 'function', source: '()=>{throw new Error("business error")}'}, []], 'user-script'), /business error/);
});
test('navigation uses admitted pending phase, waits independently of old agent and preserves complete handoff binding', async () => {
  for (const [method, config] of [['goto', {timeout: 1000, waitUntil: 'complete'}], ['reload', {timeout: 1000, waitUntil: 'domcontentloaded'}]]) {
    const f = fixture(); const args = method === 'goto' ? ['https://a.example/next?q=%22', config] : [config];
    const reply = await f.driver.execute(f.envelope(method, args, 'browser'));
    assert.equal(decodeValue(reply.value), undefined); assert.deepEqual(reply.handoff.from, f.target);
    assert.deepEqual(reply.handoff.to, {...f.target, documentId: 'doc-next', url: f.state.target.url, allowedOrigin: 'https://a.example', targetVersion: 5});
    assert.equal(f.state.native.some(row => row.stage === 'tabs.sendMessage'), false);
    assert.equal(f.state.auth.some(row => row.details.navigationPending === true), true);
    for (const name of ['onBeforeNavigate', 'onCommitted', 'onDOMContentLoaded', 'onCompleted', 'onErrorOccurred']) assert.equal(f.api.webNavigation[name].size(), 0);
  }
});
test('navigation ignores another tab and wrong readiness document; timeout cleans every subscription', async () => {
  const f = fixture(); f.state.navigation = 'held';
  const pending = f.driver.execute(f.envelope('goto', ['https://a.example/next', {timeout: 80, waitUntil: 'complete'}], 'browser'));
  const rejected = assert.rejects(pending, {code: 'E_TIMEOUT'});
  await pause(10); f.api.webNavigation.onCompleted.emit({tabId: 18, frameId: 0, documentId: 'doc-next', url: f.state.target.url});
  f.api.webNavigation.onCompleted.emit({tabId: 17, frameId: 0, documentId: 'wrong-doc', url: f.state.target.url});
  await rejected;
  assert.equal(f.api.webNavigation.onCompleted.size(), 0); assert.equal(f.api.webNavigation.onCommitted.size(), 0);
});
test('navigation rejects unsupported options before dispatch and unauthorized redirect without handing off', async () => {
  const f = fixture();
  await assert.rejects(f.driver.execute(f.envelope('goto', ['https://a.example/', {timeout: 10, waitUntil: 'networkidle0'}], 'browser')), {code: 'E_OPTION_UNSUPPORTED'});
  assert.equal(f.state.native.length, 0);
  f.state.hooks['tabs.update'] = () => {
    f.state.target = {...f.target, documentId: 'doc-b', url: 'https://b.example/', allowedOrigin: 'https://b.example'};
    f.api.webNavigation.onCommitted.emit({tabId: 17, frameId: 0, documentId: 'doc-b', url: f.state.target.url}); return {id: 17};
  };
  await assert.rejects(f.driver.execute(f.envelope('goto', ['https://a.example/', {timeout: 100, waitUntil: 'complete'}], 'browser')), {code: 'E_PERMISSION'});
});
test('screenshot rejects fullPage/invisible exact tab and detects active-tab ABA during capture', async () => {
  const f = fixture();
  await assert.rejects(f.result('screenshot', [{format: 'png', fullPage: true}], 'browser'), {code: 'E_FULL_PAGE_UNSUPPORTED'});
  assert.equal(f.state.native.length, 0); f.state.active = false;
  await assert.rejects(f.result('screenshot', [{format: 'png'}], 'browser'), {code: 'E_CAPTURE_TARGET_UNAVAILABLE'});
  assert.equal(f.state.native.some(row => row.stage === 'tabs.captureVisibleTab'), false);
  f.state.active = true;
  f.state.hooks['tabs.captureVisibleTab'] = (_args, dispatch) => {
    f.api.tabs.onActivated.emit({windowId: 31, tabId: 18}); f.api.tabs.onActivated.emit({windowId: 31, tabId: 17}); return dispatch();
  };
  await assert.rejects(f.result('screenshot', [{format: 'png'}], 'browser'), {code: 'E_CAPTURE_TARGET_CHANGED'});
  assert.equal(f.api.tabs.onActivated.size(), 0); assert.equal(f.api.tabs.onUpdated.size(), 0);
});
test('screenshot exact window success and raw receipt survive post-revocation', async () => {
  const f = fixture(); assert.equal(await f.result('screenshot', [{format: 'jpeg'}], 'browser'), 'data:image/jpeg;base64,YQ==');
  const receipts = []; f.state.hooks['tabs.captureVisibleTab'] = (_args, dispatch) => { const value = dispatch(); f.state.grants.clear(); return value; };
  await assert.rejects(f.driver.execute(f.envelope('screenshot', [{format: 'png'}], 'browser'), {recordReceipt: value => receipts.push(value)}), {code: 'E_PERMISSION'});
  assert.equal(receipts.find(row => row.stage === 'tabs.captureVisibleTab').receipt, 'data:image/png;base64,YQ==');
});
test('cookie service uses observed store, correct projection/dedup, expires=0 and exact name/path deletion', async () => {
  const f = fixture();
  await f.result('setCookie', [{name: 'sid', value: 'a=b', httpOnly: true, path: '/', sameSite: 'Lax', expires: 0},
    {name: 'sid', value: 'path', path: '/dir', url: f.target.url}], 'browser');
  const rows = await f.result('cookies', [[f.target.url, f.target.url]], 'browser');
  assert.equal(rows.length, 2); assert.equal(rows[0].value, 'a=b'); assert.equal(rows[0].expires, 0); assert.equal(rows[0].httpOnly, true); assert.equal(rows[0].sameSite, 'lax');
  const deleting = Object.freeze({name: 'sid', path: '/'});
  assert.equal(await f.result('deleteCookie', [deleting], 'browser'), undefined);
  assert.deepEqual(f.state.cookies.map(row => row.path), ['/dir']); assert.deepEqual(deleting, {name: 'sid', path: '/'});
  assert.equal(await f.result('deleteCookie', ['absent'], 'browser'), undefined);
});
test('cookie batch preflight denies unauthorized URL and malformed/domain/partition input with no cookie write/read', async () => {
  for (const [method, args, code] of [['cookies', [[fURL(), 'https://b.example/']], 'E_PERMISSION_DENIED'],
    ['setCookie', [{name: 'good', value: 'x'}, 'invalid'], 'E_COOKIE_FORMAT'],
    ['setCookie', [{name: 'sid', value: 'x', domain: '.example'}], 'E_PERMISSION_DENIED'],
    ['setCookie', ['sid=x; HttpOnly'], 'E_COOKIE_FORMAT'], ['setCookie', [{name: 'sid', value: 'x', partitionKey: {}}], 'E_COOKIE_PARTITION_UNSUPPORTED']]) {
    const f = fixture(); await assert.rejects(f.result(method, args, 'browser'), {code});
    assert.equal(f.state.native.some(row => row.stage.startsWith('cookies.')), false);
  }
  function fURL() { return 'https://a.example/'; }
});
test('cookie remove native lastError is typed; ambiguous domain or partition observations never remove', async () => {
  const row = {name: 'sid', value: 'x', path: '/', domain: 'a.example', storeId: 'store-A'};
  const f = fixture(); f.state.cookies.push(row); f.state.hooks['cookies.remove'] = () => { throw new Error('native remove failed'); };
  await assert.rejects(f.result('deleteCookie', ['sid'], 'browser'), {code: 'E_COOKIE_OPERATION'});
  for (const rows of [[row, {...row, domain: '.a.example'}], [{...row, partitionKey: {topLevelSite: 'https://a.example'}}]]) {
    const f = fixture(); f.state.cookies.push(...rows);
    await assert.rejects(f.result('deleteCookie', ['sid'], 'browser'), {code: rows.length === 2 ? 'E_COOKIE_SCOPE' : 'E_COOKIE_PARTITION_UNSUPPORTED'});
    assert.equal(f.state.native.some(row => row.stage === 'cookies.remove'), false);
  }
});
test('upload URL omits credentials, manually authorizes redirect and commits real chunks/file bytes', async t => {
  const original = globalThis.fetch, requests = [];
  globalThis.fetch = async (url, config) => { requests.push({url, config}); return requests.length === 1 ?
    new Response(null, {status: 302, headers: {location: '/bytes'}}) : new Response('abc'); };
  t.after(() => { globalThis.fetch = original; });
  const f = fixture(); t.after(f.dispose);
  assert.equal(await f.result('uploadFromUrl', ['#file', 'https://a.example/start'], 'browser'), true);
  assert.equal(requests.length, 2); assert.equal(requests[1].url, 'https://a.example/bytes');
  assert.equal(requests.every(row => row.config.redirect === 'manual' && row.config.credentials === 'omit'), true);
  assert.equal(f.input.files[0].name, 'filename.jpg'); assert.equal(f.input.files[0].type, 'image/jpeg');
  assert.equal(await f.input.files[0].text(), 'abc'); assert.equal(f.state.changes, 1); assert.equal(f.state.page.snapshot().uploads, 0);
});
test('upload denies cross-origin/downgrade/too many redirects/oversize/HTTP errors before DOM commit', async t => {
  const original = globalThis.fetch; t.after(() => { globalThis.fetch = original; });
  for (const [response, code, count] of [[() => new Response(null, {status: 302, headers: {location: 'https://b.example/'}}), 'E_PERMISSION', 1],
    [() => new Response(null, {status: 302, headers: {location: 'http://a.example/'}}), 'E_UPLOAD_URL_UNSUPPORTED', 1],
    [() => new Response(null, {status: 302, headers: {location: '/loop'}}), 'E_LIMIT', 6],
    [() => new Response(new Uint8Array(VALUE_LIMITS.uploadBytes + 1)), 'E_LIMIT', 1],
    [() => new Response('no', {status: 404}), 'E_HTTP', 1]]) {
    let called = 0; globalThis.fetch = async () => { called++; return response(); };
    const f = fixture(); await assert.rejects(f.result('uploadFromUrl', ['#file', 'https://a.example/start'], 'browser'), {code});
    assert.equal(called, count); assert.equal(f.state.changes, 0); assert.equal(f.state.native.some(row => row.stage === 'scripting.executeScript'), false);
  }
});
test('stop cancels real packaged waits/staging, late reply cannot deliver; fresh driver cleans original identity epoch', async t => {
  const f = fixture(); t.after(f.dispose); await f.result('uploadChunk', ['upload', 0, 3, 'YWJj']);
  const controller = new AbortController(); let settled = 0;
  const pending = f.driver.execute(f.envelope('waitForTimeout', [10000]), {signal: controller.signal}).then(() => { settled++; }, cause => { settled++; throw cause; });
  const rejected = assert.rejects(pending, {code: 'E_CANCELLED'}); await pause(10); controller.abort(new PageError('E_CANCELLED')); await rejected;
  assert.equal(f.state.page.snapshot().waits, 0); assert.equal(f.state.page.snapshot().uploads, 0); assert.equal(settled, 1);
  const fresh = fixture(); t.after(fresh.dispose); await fresh.result('uploadChunk', ['upload', 0, 3, 'YWJj']);
  const cleanup = createControllerDriver({api: fresh.api, authorize: async (_envelope, details) => { fresh.state.trace.push({kind: details.phase}); }});
  await cleanup.cancel({tag: 'controller-run', runId: fresh.identity.runId, ownerEpoch: 4, identity: fresh.identity, revision, target: fresh.target});
  assert.equal(fresh.state.page.snapshot().sessions, 0);
  const cancel = fresh.state.native.findLast(row => row.stage === 'tabs.sendMessage').args[1]; assert.equal(cancel.run.ownerEpoch, 3);
});
test('result receipt survives forced stop; new-instance retirement removes borrowed registry resources without closing tab', async t => {
  const f = fixture(); t.after(f.dispose);
  await f.result('addStyleTag', [{content: '#marker {color: red}'}]);
  await f.result('uploadChunk', ['upload', 0, 3, 'YWJj']); assert.equal(f.nodes.size, 1);
  const controller = new AbortController(), retained = new Map();
  await assert.rejects(f.driver.execute(f.envelope('title'), {signal: controller.signal, recordReceipt(receipt) {
    retained.set(receipt.stage, structuredClone(receipt));
    if (receipt.stage === 'result') controller.abort(new PageError('E_CANCELLED'));
  }}), {code: 'E_CANCELLED'});
  assert.equal(decodeValue(retained.get('result').receipt.value), 'Document A');
  const driver = createControllerDriver({api: f.api, authorize: async (_envelope, details) => { f.state.trace.push({kind: details.phase}); }});
  await driver.cancel({tag: 'controller-run', runId: f.identity.runId, ownerEpoch: 4, identity: f.identity, revision, target: f.target});
  assert.equal(f.nodes.size, 0); assert.equal(f.state.page.snapshot().sessions, 0); assert.equal(f.state.page.snapshot().uploads, 0);
  assert.equal(f.state.target.documentId, 'doc-A'); assert.equal(f.state.native.some(row => row.stage === 'tabs.remove'), false);
  assert.equal(decodeValue(retained.get('result').receipt.value), 'Document A');
});
test('fixed packaged resources allow only current SDK entry; unlisted extension or remote code never creates nodes', async t => {
  const f = fixture(); t.after(f.dispose);
  assert.equal(await f.result('addScriptTag', [{url: f.api.runtime.getURL('framework/sdk-main.js')}]), undefined);
  for (const url of [f.api.runtime.getURL('arbitrary.js'), 'https://a.example/code.js']) {
    await assert.rejects(f.result('addScriptTag', [{url}]), {code: 'E_RESOURCE_URL_UNSUPPORTED'});
  }
  assert.equal(f.nodes.size, 1);
});
test('user wait cancellation uses only framework harness; deadline and pending authority failure fence late callbacks', async () => {
  const f = fixture(), controller = new AbortController();
  const pending = f.driver.execute(f.envelope('waitForFunction', ['()=>false', {polling: 1, timeout: 0}, []], 'user-script'), {signal: controller.signal});
  const rejected = assert.rejects(pending, {code: 'E_CANCELLED'}); await pause(10); controller.abort(new PageError('E_CANCELLED')); await rejected;
  assert.equal(vm.runInContext("globalThis[Symbol.for('opendesk.userScripts.waits.v1')].size", f.realm), 0);
  assert.equal(f.state.userExecutions.length, 2); assert.match(f.state.userExecutions[1].js[0].code, /owner\.cancel/);
  const expired = fixture(); await assert.rejects(expired.driver.execute(expired.envelope('title'), {deadlineAt: Date.now() - 1}), {code: 'E_TIMEOUT'});
  assert.equal(expired.state.native.length, 0);
  const revoked = fixture(); revoked.state.hooks['userScripts.execute'] = () => new Promise(() => {});
  const waiting = revoked.result('evaluateExpression', ['1'], 'user-script'); const denied = assert.rejects(waiting, {code: 'E_PERMISSION'});
  await pause(10); revoked.state.grants.clear(); await denied;
});
test('pagehide disposes listener, real wait and upload state; unknown operations create no session', async t => {
  const f = fixture(); t.after(f.dispose); await f.result('title');
  const send = envelope => new Promise(resolve => f.api.runtime.onMessage.emit({type: PAGE_SESSION_MESSAGE, action: 'execute', envelope}, {id: f.api.runtime.id}, resolve));
  const unknown = await send(f.envelope('evaluate', [], 'packaged')); assert.equal(unknown.error.code, 'E_OPERATION_UNSUPPORTED');
  await f.result('uploadChunk', ['upload', 0, 3, 'YWJj']);
  const pending = send(f.envelope('waitForTimeout', [10000])); await pause(5); f.win.dispatchEvent(new Event('pagehide'));
  assert.equal((await pending).error.code, 'E_DOCUMENT_REPLACED');
  assert.deepEqual(f.state.page.snapshot(), {disposed: true, sessions: 0, waits: 0, uploads: 0}); assert.equal(f.api.runtime.onMessage.size(), 0);
});
test('borrowed child frame keeps exact frame/document for registry, evaluation and fresh-instance cancellation', async t => {
  const f = fixture({frameId: 7}); t.after(f.dispose); f.doc.title = 'Child document';
  assert.equal(await f.result('title'), 'Child document');
  assert.equal(await f.result('evaluate', [{mode: 'function', source: '()=>document.title'}, []], 'user-script'), 'Child document');
  assert.equal(await f.result('evaluateExpression', ['false'], 'user-script'), false);
  for (const request of f.state.userExecutions) assert.deepEqual(request.target, {tabId: 17, documentIds: ['doc-A']});
  for (const row of f.state.native.filter(row => row.stage === 'tabs.sendMessage')) assert.deepEqual(row.args[2], {documentId: 'doc-A', frameId: 7});
  await f.result('uploadChunk', ['upload', 0, 3, 'YWJj']);
  const cleanup = createControllerDriver({api: f.api, authorize: async (_envelope, details) => { f.state.trace.push({kind: details.phase}); }});
  await cleanup.cancel({tag: 'controller-run', runId: f.identity.runId, ownerEpoch: 4, identity: f.identity, revision, target: f.target});
  assert.equal(f.state.page.snapshot().sessions, 0);
  assert.deepEqual(f.state.native.findLast(row => row.stage === 'tabs.sendMessage').args[2], {documentId: 'doc-A', frameId: 7});
});
test('borrowed child navigation/capture reject explicitly with zero native effects; wrong-frame result and replaced child are fenced', async t => {
  const f = fixture({frameId: 7}); t.after(f.dispose);
  for (const [method, args] of [['goto', ['https://a.example/next', {timeout: 100, waitUntil: 'complete'}]],
    ['reload', [{timeout: 100, waitUntil: 'complete'}]], ['screenshot', [{format: 'png'}]]]) {
    await assert.rejects(f.result(method, args, 'browser'), {code: 'E_TOP_FRAME_REQUIRED'});
  }
  assert.equal(f.state.native.length, 0);
  f.state.hooks['userScripts.execute'] = () => [{frameId: 0, documentId: 'doc-A', result: {ok: true, value: encodeValue('top')}}];
  await assert.rejects(f.result('evaluateExpression', ['1'], 'user-script'), {code: 'E_TARGET'});
  const g = fixture({frameId: 7}); t.after(g.dispose); g.state.target.documentId = 'child-replaced';
  await assert.rejects(g.result('title'), {code: 'E_DOCUMENT_REPLACED'});
  assert.equal(g.state.native.some(row => row.stage === 'scripting.executeScript' || row.stage === 'tabs.sendMessage'), false);
});

test('native Controller transparently reads large HTML with exact document authority',async t=>{
  const f=fixture();t.after(f.dispose);
  const context=createRunContext({identity:f.identity,revision:f.revision,target:f.target,
    transport:{request:envelope=>f.driver.execute(envelope)}});
  t.after(()=>context.dispose());
  const html='<div>中😀</div>'.repeat(6000);
  f.doc.body.innerHTML=html;
  assert.equal(await context.page.content(),html);
  const messages=f.state.native.filter(row=>row.stage==='tabs.sendMessage'&&row.args[1].action==='execute');
  assert(messages.some(row=>row.args[1].envelope.operation.method==='contentRead'));
  assert(messages.some(row=>row.args[1].envelope.operation.method==='contentClose'));
  for(const op of messages){
    assert.deepEqual(op.args[2],{documentId:f.target.documentId,frameId:f.target.frameId});
    assert.equal(op.args[1].envelope.identity.runId,f.identity.runId);
  }
});
test('native HTML stream honors site access revoked between automatic chunks',async t=>{
  const f=fixture();t.after(f.dispose);
  const context=createRunContext({identity:f.identity,revision:f.revision,target:f.target,
    transport:{request:envelope=>f.driver.execute(envelope)}});
  t.after(()=>context.dispose());
  f.doc.body.innerHTML='x'.repeat(90000);
  f.state.hooks.authorize=(envelope,details)=>{
    if(envelope.operation.method==='contentRead'&&details.phase==='pre') f.state.grants.clear();
  };
  await assert.rejects(context.page.content(),{code:'E_PERMISSION'});
  assert.equal(f.state.native.filter(row=>row.stage==='tabs.sendMessage' &&
    row.args[1].envelope?.operation?.method==='contentRead').length,0);
});

function offscreenLocatorFixture(options) {
  const f = fixture(options), effects = {scrolls:[], focuses:[], events:[]};
  class Input extends EventTarget {
    constructor() {
      super(); this.nodeType = 1; this.tagName = 'INPUT'; this.type = 'text';
      this.isConnected = true; this.value = ''; this.top = 1200; this.disabled = false;
      for (const type of ['input','change']) this.addEventListener(type, () => effects.events.push(type));
    }
    getAttribute() { return null; }
    hasAttribute() { return false; }
    closest() { return null; }
    matches(selector) { return selector === ':disabled' && this.disabled; }
    contains(el) { return el === this; }
    getBoundingClientRect() { return {left:10,top:this.top,width:120,height:24,right:130,bottom:this.top+24}; }
    scrollIntoView(options) { effects.scrolls.push({element:this,options}); this.top = 20; }
    focus() { effects.focuses.push(this); }
  }
  const element = new Input();
  f.win.Element = Input; f.win.innerWidth = 800; f.win.innerHeight = 600;
  f.win.getComputedStyle = el => ({display:'block',visibility:'visible',pointerEvents:el.pointerEvents || 'auto'});
  f.win.requestAnimationFrame = callback => queueMicrotask(callback);
  f.doc.querySelectorAll = selector => selector === '#name' && element.isConnected ? [element] : [];
  f.doc.elementFromPoint = () => element;
  f.state.active = false;
  return {...f,element,effects};
}
const nameLocator = {kind:'css',value:'#name'}, nameFill = {action:'fill',value:'Cloud task',timeout:1000};

test('inactive offscreen Locator scrolls once, persists the ack, then freshly prepares and fills', async t => {
  const f = offscreenLocatorFixture(); t.after(f.dispose);
  const stages = [], receipts = [];
  f.state.hooks['tabs.sendMessage'] = async (args, dispatch) => {
    const method = args[1].envelope?.operation.method;
    const reply = await dispatch();
    if (method === 'locatorPrepare') {
      const prepared = decodeValue(reply.value);
      assert.equal(prepared.ready, true);
      assert.equal(prepared.scrollOnly === true, stages.length === 0);
      assert.equal(f.element.value, ''); assert.deepEqual(f.effects.events, []);
      assert.equal(f.effects.focuses.length, 0);
      if (stages.length === 0) assert.equal(f.effects.scrolls.length, 0, 'prepare must stay read-only');
      else assert.ok(receipts.some(row => row.stage === 'locator.scrollCommitted'));
    }
    if (method?.startsWith('locator')) stages.push(method);
    return reply;
  };
  const reply = await f.driver.execute(f.envelope('locatorAction', [nameLocator,nameFill]), {
    recordReceipt: row => {
      if (row.stage === 'locator.scrollCommitted') {
        assert.equal(f.element.value, ''); assert.equal(f.effects.scrolls.length, 1);
        assert.equal(row.receipt.documentId, f.target.documentId);
      }
      receipts.push(row);
    }
  });
  assert.equal(decodeValue(reply.value), undefined);
  assert.deepEqual(stages, ['locatorPrepare','locatorCommit','locatorPrepare','locatorCommit']);
  assert.equal(f.element.value, nameFill.value);
  assert.deepEqual(f.effects.scrolls, [{element:f.element,options:{behavior:'instant',block:'center',inline:'center'}}]);
  assert.deepEqual(f.effects.focuses, [f.element]); assert.deepEqual(f.effects.events, ['input','change']);
  assert.equal(receipts.filter(row => row.stage === 'locator.commitIntent').length, 2);
  assert.equal(receipts.filter(row => row.stage === 'locator.scrollCommitted').length, 1);
  assert.equal(receipts.some(row => row.stage === 'locator.commitNoEffect'), false);
});

test('a confirmed scroll that stays offscreen is bounded to one effect and one ack', async t => {
  const f = offscreenLocatorFixture(); t.after(f.dispose);
  const receipts = [];
  f.win.Element.prototype.scrollIntoView = function(options) { f.effects.scrolls.push({element:this,options}); };
  const reply = await f.driver.execute(f.envelope('locatorAction', [nameLocator,{...nameFill,timeout:100}]), {
    recordReceipt: row => receipts.push(row)
  });
  assert.equal(reply.error.code, 'E_TIMEOUT');
  assert.equal(f.effects.scrolls.length, 1); assert.equal(f.element.value, '');
  assert.deepEqual(f.effects.focuses, []); assert.deepEqual(f.effects.events, []);
  assert.equal(receipts.filter(row => row.stage === 'locator.commitIntent').length, 1);
  assert.equal(receipts.filter(row => row.stage === 'locator.scrollCommitted').length, 1);
  assert.equal(receipts.some(row => row.stage === 'locator.commitNoEffect'), false);
  assert.ok(receipts.some(row => row.stage === 'packaged.finalFailure'));
});

test('scroll tokens reject replacement elements without scrolling or filling either element', async t => {
  const f = offscreenLocatorFixture(); t.after(f.dispose);
  const dom = createLocatorDOM({document:f.doc,window:f.win});
  const prepared = await dom.prepare(nameLocator,nameFill);
  assert.equal(prepared.scrollOnly, true);
  const replacement = new f.win.Element();
  f.doc.querySelectorAll = () => [replacement]; // Original is still connected: identity, not selector equality.
  assert.deepEqual(dom.commit(nameLocator,nameFill,prepared.token), {committed:false,reason:'E_ELEMENT_DETACHED'});
  assert.deepEqual(f.effects, {scrolls:[],focuses:[],events:[]});
  assert.equal(f.element.value, ''); assert.equal(replacement.value, '');
});

test('scroll prepare and commit preserve disabled, detached and obscured guards', async t => {
  for (const mode of ['disabled','detached','obscured']) await t.test(mode, async t => {
    const f = offscreenLocatorFixture(); t.after(f.dispose);
    const dom = createLocatorDOM({document:f.doc,window:f.win});
    const prepared = await dom.prepare(nameLocator,nameFill);
    if (mode === 'disabled') f.element.disabled = true;
    if (mode === 'detached') f.element.isConnected = false;
    if (mode === 'obscured') { f.element.top = 20; f.doc.elementFromPoint = () => ({}); }
    const reason = {disabled:'E_ELEMENT_DISABLED',detached:'E_ELEMENT_DETACHED',obscured:'E_ELEMENT_OBSCURED'}[mode];
    assert.deepEqual(dom.commit(nameLocator,nameFill,prepared.token), {committed:false,reason});
    if (mode === 'disabled') assert.deepEqual(await dom.prepare(nameLocator,nameFill), {ready:false,reason});
    if (mode === 'obscured') {
      f.element.top = 1200; f.element.pointerEvents = 'none';
      assert.deepEqual(await dom.prepare(nameLocator,nameFill), {ready:false,reason});
    }
    assert.deepEqual(f.effects, {scrolls:[],focuses:[],events:[]}); assert.equal(f.element.value, '');
  });
});

test('unknown scroll replies and unpersisted scroll acks never retry or report no effect', async t => {
  for (const mode of ['lost reply','missing confirmation','ack write failure']) await t.test(mode, async t => {
    const f = offscreenLocatorFixture(); t.after(f.dispose);
    const receipts = []; let prepares = 0, commits = 0;
    f.state.hooks['tabs.sendMessage'] = async (args, dispatch) => {
      const method = args[1].envelope?.operation.method;
      if (method === 'locatorPrepare') prepares++;
      const reply = await dispatch();
      if (method !== 'locatorCommit') return reply;
      commits++;
      if (mode === 'lost reply') return undefined;
      if (mode === 'missing confirmation') return {...reply,value:encodeValue({committed:true})};
      return reply;
    };
    await assert.rejects(f.driver.execute(f.envelope('locatorAction', [nameLocator,nameFill]), {
      recordReceipt: row => {
        if (mode === 'ack write failure' && row.stage === 'locator.scrollCommitted') throw new PageError('E_TIMEOUT');
        receipts.push(row);
      }
    }), {code:mode === 'ack write failure' ? 'E_TIMEOUT' : 'E_RESULT_FORMAT'});
    assert.equal(prepares, 1); assert.equal(commits, 1); assert.equal(f.effects.scrolls.length, 1);
    assert.equal(f.element.value, ''); assert.deepEqual(f.effects.focuses, []); assert.deepEqual(f.effects.events, []);
    assert.ok(receipts.some(row => row.stage === 'locator.commitIntent'));
    assert.equal(receipts.some(row => ['locator.scrollCommitted','locator.commitNoEffect','packaged.finalFailure','result'].includes(row.stage)), false);
  });
});

test('lost fill callback after durable scroll ack keeps the final commit unknown without retry', async t => {
  const f = offscreenLocatorFixture(); t.after(f.dispose);
  const receipts = []; let prepares = 0, commits = 0;
  f.state.hooks['tabs.sendMessage'] = async (args, dispatch) => {
    const method = args[1].envelope?.operation.method;
    if (method === 'locatorPrepare') prepares++;
    const reply = await dispatch();
    if (method === 'locatorCommit' && ++commits === 2) {
      assert.ok(receipts.some(row => row.stage === 'locator.scrollCommitted'));
      assert.equal(decodeValue(reply.value).committed, true);
      return new Promise(() => {}); // Fill ran, but its native callback never arrives.
    }
    return reply;
  };
  const envelope = f.envelope('locatorAction', [nameLocator,{...nameFill,timeout:100}]);
  await assert.rejects(f.driver.execute(envelope, {
    recordReceipt: row => receipts.push(row)
  }), {code:'E_TIMEOUT'});
  assert.equal(prepares, 2); assert.equal(commits, 2);
  assert.equal(f.effects.scrolls.length, 1); assert.equal(f.element.value, nameFill.value);
  assert.deepEqual(f.effects.focuses, [f.element]); assert.deepEqual(f.effects.events, ['input','change']);
  const durableCommits = receipts.filter(row => ['locator.commitIntent','locator.scrollCommitted'].includes(row.stage));
  assert.deepEqual(durableCommits.map(row => row.stage), [
    'locator.commitIntent','locator.scrollCommitted','locator.commitIntent'
  ]);
  assert.ok(durableCommits.every(row => row.requestId === envelope.requestId && row.receipt.documentId === f.target.documentId));
  assert.equal(receipts.at(-1), durableCommits.at(-1), 'last fill intent must remain unresolved');
  assert.equal(receipts.some(row => ['locator.commitNoEffect','packaged.finalFailure','result'].includes(row.stage)), false);
});

test('Locator timeout:0 disables local expiry while respecting the Controller run deadline', async t => {
  const f = fixture();
  t.after(f.dispose);
  // The missing element is already hidden. With timeout:0 this read must
  // perform a real page probe; an immediate timeout is a protocol mismatch.
  assert.equal(await f.result('locatorWait', [
    {kind:'css',value:'#not-there'}, {action:'waitFor',state:'hidden',timeout:0}
  ]), undefined);

  // Explicit no Locator timeout must never cancel the outer Controller fence.
  await assert.rejects(f.driver.execute(f.envelope('locatorWait', [
    {kind:'css',value:'#not-there'}, {action:'waitFor',state:'visible',timeout:0}
  ]), {deadlineAt:Date.now()+80}), {code:'E_TIMEOUT'});
});


test('beforeEffect fences scroll and fill separately at their final native submission windows', async t => {
  const effects = [];
  const f = offscreenLocatorFixture({beforeEffect: async (envelope, details) => {
    assert.equal(envelope.operation.method, 'locatorAction');
    assert.equal(details.kind, 'packaged'); assert.equal(details.method, 'locatorCommit');
    assert.equal(details.documentId, f.target.documentId);
    assert.equal(details.tabId, f.target.tabId); assert.equal(details.frameId, f.target.frameId);
    assert.equal(details.action, 'fill'); assert.equal(typeof details.commitToken, 'string');
    assert.equal(f.state.native.filter(row => row.args?.[1]?.envelope?.operation.method === 'locatorCommit').length, effects.length);
    assert.equal(f.effects.scrolls.length, effects.length); assert.equal(f.element.value, '');
    effects.push({envelope, details});
    return {proof: 'accepted'};
  }}); t.after(f.dispose);
  const envelope = f.envelope('locatorAction', [nameLocator, nameFill]);
  await f.driver.execute(envelope);
  assert.deepEqual(effects.map(row => row.details.scrollOnly), [true, false]);
  assert.equal(new Set(effects.map(row => row.details.effectId)).size, 2);
  assert.ok(effects.every(row => row.details.effectId.startsWith(envelope.requestId + ':')));
  assert.equal(f.element.value, nameFill.value);
});

test('beforeEffect rejection prevents each Locator commit, including fill after an accepted scroll', async t => {
  for (const deniedWindow of [1, 2]) await t.test(`window ${deniedWindow}`, async t => {
    let calls = 0;
    const f = offscreenLocatorFixture({beforeEffect: async () => {
      if (++calls === deniedWindow) throw new PageError('E_REMOTE_REJECTED');
    }}); t.after(f.dispose);
    await assert.rejects(f.result('locatorAction', [nameLocator, nameFill]), {code: 'E_REMOTE_REJECTED'});
    assert.equal(calls, deniedWindow);
    assert.equal(f.state.native.filter(row => row.args?.[1]?.envelope?.operation.method === 'locatorCommit').length, deniedWindow - 1);
    assert.equal(f.effects.scrolls.length, deniedWindow - 1);
    assert.equal(f.element.value, ''); assert.deepEqual(f.effects.focuses, []);
  });
});

test('explicit Locator no-effect retry obtains a fresh effectId and can be rejected independently', async t => {
  const effects = [];
  const f = offscreenLocatorFixture({beforeEffect: async (_envelope, details) => {
    effects.push(details);
    if (effects.length === 2) throw new PageError('E_REMOTE_REJECTED');
  }}); t.after(f.dispose);
  let commits = 0;
  f.state.hooks['tabs.sendMessage'] = (args, dispatch) => {
    const envelope = args[1].envelope;
    if (envelope?.operation.method === 'locatorCommit') {
      commits++;
      return {requestId: envelope.requestId, runId: f.identity.runId, ownerEpoch: f.identity.ownerEpoch,
        value: encodeValue({committed: false, reason: 'E_ELEMENT_DETACHED'})};
    }
    return dispatch();
  };
  const receipts = [];
  await assert.rejects(f.driver.execute(f.envelope('locatorAction', [nameLocator, nameFill]), {
    recordReceipt: row => receipts.push(row)
  }), {code: 'E_REMOTE_REJECTED'});
  assert.equal(commits, 1); assert.equal(effects.length, 2);
  assert.notEqual(effects[0].effectId, effects[1].effectId);
  assert.ok(receipts.some(row => row.stage === 'locator.commitNoEffect'));
  assert.deepEqual(f.effects, {scrolls: [], focuses: [], events: []});
});

test('read-only Locator/query/wait polling never calls beforeEffect', async t => {
  let effects = 0, prepares = 0;
  const f = fixture({beforeEffect: async () => { effects++; throw new Error('read must not fence'); }}); t.after(f.dispose);
  f.state.hooks['tabs.sendMessage'] = (args, dispatch) => {
    if (args[1].envelope?.operation.method === 'locatorPrepare') prepares++;
    return dispatch();
  };
  assert.equal(await f.result('title'), 'Document A');
  assert.equal(await f.result('locatorRead', [nameLocator, {action: 'count'}]), 0);
  assert.equal(await f.result('locatorWait', [nameLocator, {action: 'waitFor', state: 'hidden', timeout: 100}]), undefined);
  const reply = await f.driver.execute(f.envelope('locatorAction', [nameLocator, {...nameFill, timeout: 100}]));
  assert.equal(reply.error.code, 'E_TIMEOUT'); assert.ok(prepares >= 2);
  assert.equal(effects, 0);
});

test('Cancel while beforeEffect is pending prevents late callback success from submitting a commit', async t => {
  let entered, release;
  const started = new Promise(resolve => { entered = resolve; });
  const held = new Promise(resolve => { release = resolve; });
  const f = offscreenLocatorFixture({beforeEffect: async () => { entered(); await held; }}); t.after(f.dispose);
  const signal = new AbortController();
  const pending = f.driver.execute(f.envelope('locatorAction', [nameLocator, nameFill]), {signal: signal.signal});
  const rejected = assert.rejects(pending, {code: 'E_CANCELLED'});
  await started; signal.abort(new PageError('E_CANCELLED')); await rejected;
  release(); await pause(0);
  assert.equal(f.state.native.filter(row => row.args?.[1]?.envelope?.operation.method === 'locatorCommit').length, 0);
  assert.deepEqual(f.effects, {scrolls: [], focuses: [], events: []});
});

test('navigation, packaged writes, USER_SCRIPT and individual cookie writes are fenced before dispatch', async t => {
  const cases = [
    ['goto', ['https://a.example/next', {timeout: 1000, waitUntil: 'complete'}], 'browser', 'tabs.update'],
    ['reload', [{timeout: 1000, waitUntil: 'complete'}], 'browser', 'tabs.reload'],
    ...['click','type','keyboard','uploadChunk','uploadCommit','addScriptTag','addStyleTag'].map(method =>
      [method, [], 'packaged', 'tabs.sendMessage']),
    ['evaluateExpression', ['document.body.innerHTML = "changed"'], 'user-script', 'userScripts.execute'],
    ['waitForFunction', ['() => true', {timeout: 100, polling: 1}, []], 'user-script', 'userScripts.execute'],
    ['setCookie', [{name: 'a', value: '1'}], 'browser', 'cookies.set'],
    ['deleteCookie', [{name: 'a', path: '/dir'}], 'browser', 'cookies.remove']
  ];
  for (const [method, args, kind, stage] of cases) await t.test(method, async t => {
    const effects = [];
    const f = fixture({beforeEffect: async (envelope, details) => {
      assert.equal(envelope.operation.method, method); assert.equal(details.kind, kind);
      assert.equal(details.method, method); assert.equal(details.documentId, 'doc-A');
      effects.push(details); throw new PageError('E_REMOTE_REJECTED');
    }}); t.after(f.dispose);
    f.state.cookies.push({name: 'a', value: '1', path: '/dir', domain: 'a.example', storeId: 'store-A'});
    await assert.rejects(f.result(method, args, kind), {code: 'E_REMOTE_REJECTED'});
    assert.equal(effects.length, 1);
    assert.equal(f.state.native.filter(row => row.stage === stage &&
      (stage !== 'tabs.sendMessage' || row.args[1].action === 'execute')).length, 0);
  });
});

test('a cookie batch obtains a separate fence for every actual set and remove', async t => {
  for (const method of ['setCookie', 'deleteCookie']) await t.test(method, async t => {
    const effects = [];
    const f = fixture({beforeEffect: async (_envelope, details) => {
      effects.push(details);
      if (effects.length === 2) throw new PageError('E_REMOTE_REJECTED');
    }}); t.after(f.dispose);
    const rows = [{name: 'a', value: '1', path: '/dir'}, {name: 'b', value: '2', path: '/dir'},
      {name: 'c', value: '3', path: '/dir'}];
    if (method === 'deleteCookie') f.state.cookies = rows.map(row => ({...row, domain: 'a.example', storeId: 'store-A'}));
    await assert.rejects(f.result(method, method === 'setCookie' ? rows : rows.map(row => ({name: row.name, path: row.path})), 'browser'), {code: 'E_REMOTE_REJECTED'});
    assert.equal(effects.length, 2); assert.notEqual(effects[0].effectId, effects[1].effectId);
    assert.equal(f.state.native.filter(row => row.stage === (method === 'setCookie' ? 'cookies.set' : 'cookies.remove')).length, 1);
  });
});
