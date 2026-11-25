import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir, readFile, rm} from 'node:fs/promises';
import {build} from 'esbuild';
import {parseHTML} from 'linkedom';
import * as React from 'react';
import {createDeveloperView} from '../../src/ui/develop-view.js';
import {createDeveloperHostControls} from '../../src/ui/develop-host-controls.js';
import {snapshotSdkApproval} from '../../src/ui/sdk-approval.js';

// Model/React event evidence with simulated Chrome, not a native permission PASS.
const click = {isTrusted:true};
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const defaultServices = ['network', 'storage.session', 'storage.persistent', 'notifications',
  'device.id', 'service.log', 'service.time', 'resources.packaged'].sort();
const selectedServices = f => f.field('sdk-capabilities').rows.filter(row => row.checked).map(row => row.value).sort();
function signal() {
  const listeners = new Set();
  return {addListener:fn => listeners.add(fn), removeListener:fn => listeners.delete(fn),
    fire:value => { for (const fn of listeners) fn(value); }, get size() { return listeners.size; }};
}
function deferred() {
  let resolve;
  const promise = new Promise(yes => { resolve = yes; });
  return {promise, resolve};
}
function currentPageOwner(initial, ready = Promise.resolve()) {
  const listeners = new Set();
  let snapshot = Object.freeze(initial);
  return {
    ready,
    get snapshot() { return snapshot; },
    get windowId() { return snapshot.windowId; },
    subscribe(listener) { listeners.add(listener); listener(snapshot); return () => listeners.delete(listener); },
    publish(next) { snapshot = Object.freeze(next); for (const listener of listeners) listener(snapshot); },
    get subscriptions() { return listeners.size; }
  };
}
const currentPage = (overrides = {}) => ({status:'available', windowId:1, tabId:7, frameId:0,
  documentId:'doc-7', url:'https://a.example/form', origin:'https://a.example', title:'Form', ...overrides});
function fixture({withheld = false, ready = Promise.resolve(), installGate, tabs, frames, currentPageTarget, tabActivated} = {}) {
  const onAdded = signal(), onRemoved = signal(), onCommitted = signal(), tabRemoved = signal();
  const state = {websites:!withheld, allowed:true, denied:false, requests:[], messages:[], rpc:[],
    tabs:(tabs ?? [{id:7, incognito:false, url:'https://a.example/form', title:'Form'}]).map(tab => ({windowId:1, ...tab})),
    frames:frames ?? [{frameId:0, documentId:'doc-7', url:'https://a.example/form', documentLifecycle:'active'}]};
  const api = {
    permissions:{onAdded, onRemoved,
      contains:async ({origins}) => origins?.includes('<all_urls>') ? state.websites : state.allowed,
      request(value) {
        state.requests.push(structuredClone(value));
        if (value.origins.includes('<all_urls>') && !state.denied) state.websites = true;
        return Promise.resolve(!state.denied);
      }},
    windows:{getCurrent:async () => ({id:1})},
    tabs:{query:async (query = {}) => structuredClone(state.tabs.filter(tab =>
      (query.windowId === undefined || tab.windowId === query.windowId) &&
      (!query.currentWindow || tab.windowId === 1) &&
      (query.active === undefined || tab.active === query.active))), get:async id => structuredClone(state.tabs.find(tab => tab.id === id)), onRemoved:tabRemoved, onActivated:tabActivated},
    webNavigation:{getAllFrames:async ({tabId}) => structuredClone(Array.isArray(state.frames) ? state.frames : state.frames[tabId]), onCommitted},
    runtime:{sendMessage:async message => {
      state.messages.push(structuredClone(message));
      return {ok:true, data:{scope:'environment-health-only',
        ...(message.type === 'CREATE_HEALTH_TARGET' ? {target:{tabId:9, documentId:'health-doc'}} : {})}};
    }}
  };
  const client = {ready, request:async (method, payload) => {
    state.rpc.push({method, payload:structuredClone(payload)});
    if (method === 'installSdk') {
      if (installGate) await installGate.promise;
      const scope = snapshotSdkApproval({document:{...payload, url:'https://a.example/form'},
        capabilities:payload.capabilities, targetText:payload.targetOrigins.join('\n')});
      return {installed:true, ...scope, grantIncarnation:'grant-7'};
    }
    if (method === 'inspectSdkGrant') return {...payload, sourceOrigin:'https://a.example', present:true, grantIncarnation:'grant-7'};
    if (method === 'revokeSdkGrant') return {...payload, revoked:true};
    throw Error('Unexpected SDK operation: ' + method);
  }};
  const view = createDeveloperView();
  view.actions['script-run'] = () => {};
  const controller = createDeveloperHostControls({api, client, view, currentPageTarget});
  const field = id => view.fields[id];
  const action = (id, event = click) => view.actions[id](event);
  const input = async (id, value) => { view.patch(id, {value}); await action(id); };
  const choose = async (values = ['storage.session']) => {
    view.patch('sdk-capabilities', {rows:field('sdk-capabilities').rows.map(row => ({...row, checked:values.includes(row.value)}))});
    await action('sdk-capabilities');
  };
  return {state, api, client, view, controller, field, action, input, choose, onAdded, onRemoved, onCommitted, tabRemoved};
}

test('SDK defaults select only the eight available services without requesting authority', async () => {
  const f = fixture();
  try {
    await f.controller.ready;
    assert.deepEqual(selectedServices(f), defaultServices);
    const rows = f.field('sdk-capabilities').rows;
    assert.equal(rows.find(row => row.value === 'network.info').disabled, true);
    assert.equal(rows.find(row => row.value === 'network.info').checked, false);
    for (const [value, label] of [['network', /HTTP 网络请求/], ['service.log', /日志/],
      ['service.time', /时间/], ['resources.packaged', /内置资源/]]) {
      assert.match(rows.find(row => row.value === value).label, label);
    }
    await f.input('sdk-tab', '7');
    assert.deepEqual(f.state.requests, []);
    assert.deepEqual(f.state.rpc, []);
  } finally { f.controller.dispose(); }
});

test('Cookie input starts checked without requesting permission', async () => {
  const f = fixture();
  try {
    await f.controller.ready;
    assert.equal(f.field('script-allow-cookies').checked, true);
    assert.deepEqual(f.state.requests, []);
    assert.deepEqual(f.state.rpc, []);
  } finally { f.controller.dispose(); }
});

for (const services of [['network'], []]) {
  test(`refreshing the same document preserves ${services.length ? 'partial' : 'empty'} service and target drafts`, async () => {
    const f = fixture();
    try {
      await f.controller.ready;
      await f.input('sdk-tab', '7');
      await f.choose(services);
      const target = services.length ? 'https://b.example' : '';
      await f.input('sdk-target-origins', target);
      await f.action('sdk-refresh');
      assert.equal(f.field('sdk-tab').value, '7');
      assert.equal(f.field('sdk-document').value, 'doc-7');
      assert.deepEqual(selectedServices(f), services);
      assert.equal(f.field('sdk-target-origins').value, target);
      assert.deepEqual(f.state.requests, []);
      assert.deepEqual(f.state.rpc, []);
    } finally { f.controller.dispose(); }
  });
}

test('explicit inputs entered before document selection survive the first binding', async () => {
  const f = fixture();
  try {
    await f.controller.ready;
    assert.equal(f.field('sdk-document').value, '');
    await f.choose([]);
    await f.input('sdk-target-origins', 'https://b.example');
    await f.input('sdk-tab', '7');
    assert.deepEqual(selectedServices(f), []);
    assert.equal(f.field('sdk-target-origins').value, 'https://b.example');
    assert.deepEqual(f.state.requests, []);
    assert.deepEqual(f.state.rpc, []);
  } finally { f.controller.dispose(); }
});

for (const identity of ['tab', 'frame', 'document']) {
  test(`SDK drafts are isolated by exact ${identity} identity and restored on return`, async () => {
    const original = {frameId:0, documentId:'doc-7', url:'https://a.example/form', documentLifecycle:'active'};
    const other = {...original, ...(identity === 'frame' ? {frameId:2} : {}),
      ...(identity === 'document' ? {documentId:'doc-other'} : {})};
    const f = fixture({tabs:[{id:7, incognito:false, url:original.url}, {id:8, incognito:false, url:original.url}],
      frames:{7:[original], 8:[other]}});
    try {
      await f.controller.ready;
      await f.input('sdk-tab', '7');
      await f.choose(['network']);
      await f.input('sdk-target-origins', 'https://b.example');
      if (identity === 'tab') await f.input('sdk-tab', '8');
      else {
        f.state.frames[7] = [other];
        await f.input('sdk-tab', '7');
        await f.input('sdk-document', other.documentId);
      }
      assert.deepEqual(selectedServices(f), defaultServices);
      assert.equal(f.field('sdk-target-origins').value, '');
      await f.choose([]);
      await f.input('sdk-target-origins', '');
      f.state.frames[7] = [original];
      await f.input('sdk-tab', '7');
      assert.deepEqual(selectedServices(f), ['network']);
      assert.equal(f.field('sdk-target-origins').value, 'https://b.example');
      if (identity === 'tab') await f.input('sdk-tab', '8');
      else {
        f.state.frames[7] = [other];
        await f.input('sdk-tab', '7');
        await f.input('sdk-document', other.documentId);
      }
      assert.deepEqual(selectedServices(f), [], 'returning restores an explicitly empty draft');
      assert.equal(f.field('sdk-target-origins').value, '');
      assert.deepEqual(f.state.requests, []);
      assert.deepEqual(f.state.rpc, []);
    } finally { f.controller.dispose(); }
  });
}

for (const port of [43111, 43112]) {
  test(`local demo on ${port} preserves ${port === 43111 ? 'a cleared target' : 'all cleared inputs'} after its initial preset`, async () => {
    const url = `http://127.0.0.1:${port}/demo-form.html`;
    const f = fixture({tabs:[{id:7, incognito:false, active:true, url}],
      frames:[{frameId:0, documentId:'demo-doc', url, documentLifecycle:'active'}]});
    try {
      await f.controller.ready;
      assert.deepEqual(selectedServices(f), defaultServices);
      assert.equal(f.field('sdk-target-origins').value, 'https://httpbingo.org');
      if (port === 43112) await f.choose([]);
      await f.input('sdk-target-origins', '');
      await f.action('sdk-refresh');
      assert.equal(f.field('sdk-document').value, 'demo-doc');
      assert.deepEqual(selectedServices(f), port === 43111 ? defaultServices : []);
      assert.equal(f.field('sdk-target-origins').value, '');
      assert.equal(f.field('sdk-install').disabled, port === 43112);
      assert.deepEqual(f.state.requests, []);
      assert.deepEqual(f.state.rpc, []);
    } finally { f.controller.dispose(); }
  });
}

test('navigation to a new document does not inherit the previous target origin', async () => {
  const f = fixture();
  try {
    await f.controller.ready;
    await f.input('sdk-tab', '7');
    await f.input('sdk-target-origins', 'https://b.example');
    await f.choose(['network']);
    f.state.frames = [{frameId:0, documentId:'new-doc', url:'https://a.example/next', documentLifecycle:'active'}];
    f.onCommitted.fire({tabId:7, frameId:0, documentId:'new-doc'});
    assert.equal(f.field('sdk-install').disabled, true);
    await f.input('sdk-tab', '7');
    assert.equal(f.field('sdk-document').value, 'new-doc');
    assert.deepEqual(selectedServices(f), defaultServices);
    assert.equal(f.field('sdk-target-origins').value, '');
    assert.deepEqual(f.state.requests, []);
    assert.deepEqual(f.state.rpc, []);
  } finally { f.controller.dispose(); }
});

test('host controls start without DOM, expose site recovery, and clean only their own actions/listeners', async () => {
  const f = fixture({withheld:true});
  try {
    assert.equal(f.field('site-access-grant').disabled, true);
    await f.controller.ready;
    assert.equal(f.field('site-access-status').data.websites, false);
    assert.equal(f.field('site-access-grant').disabled, false);
    assert.equal(f.field('scraping-panel'),undefined,'retired diagnostic stub has no model or owner');
    assert.equal(f.field('sdk-capabilities').rows.find(row => row.value === 'network.info').disabled, true);
    assert.equal(f.state.requests.length, 0);
    assert.equal(f.state.rpc.length, 0);
    const grant = f.action('site-access-restore');
    assert.deepEqual(f.state.requests, [{origins:['<all_urls>']}], 'request stays synchronous with the trusted action');
    await grant;
    assert.equal(f.field('site-access-status').data.websites, true);
    assert.equal(f.field('site-access-grant').disabled, true);
    f.state.websites = false; f.onRemoved.fire({origins:['<all_urls>']}); await tick();
    assert.equal(f.field('site-access-status').data.websites, false);
    assert.equal(f.state.requests.length, 1, 'revocation must not auto-grant');
    const staleAction = f.view.actions['site-access-restore'];
    f.controller.dispose(); f.controller.dispose();
    staleAction(click);
    assert.equal(f.state.requests.length, 1);
    assert.deepEqual([f.onAdded.size, f.onRemoved.size, f.onCommitted.size, f.tabRemoved.size], [0, 0, 0, 0]);
    assert.deepEqual(f.controller.resourceSnapshot(), {subscriptions:0, actions:0});
    assert.deepEqual(Object.keys(f.view.actions), ['script-run']);
  } finally { f.controller.dispose(); }
});

test('Chrome user scripts are independent of site access and rechecked on return from settings', async () => {
  const activated = signal();
  const f = fixture({tabActivated:activated, currentPageTarget:currentPageOwner(currentPage())});
  const id = 'a'.repeat(32), opened = [];
  const status = () => f.field('browser-user-scripts-status').data.state;
  let available = false;
  f.api.runtime.id = id;
  f.api.runtime.getManifest = () => ({name:'GrayDove'});
  f.api.tabs.create = async ({url}) => { opened.push(url); return {id:11, windowId:1}; };
  const native = {getScripts:async () => [], execute:() => assert.fail('diagnostics must never execute scripts')};
  Object.defineProperty(f.api, 'userScripts', {get:() => available ? native : undefined});
  try {
    await f.controller.ready;
    assert.equal(f.field('site-access-status').data.websites, true);
    await f.action('browser-user-scripts-panel-active', true);
    await tick();
    assert.equal(status(), 'unavailable');
    assert.equal(f.field('browser-user-scripts-reopen-hint').hidden, false);
    await f.action('browser-user-scripts-settings', {isTrusted:false});
    assert.deepEqual(opened, []);
    await f.action('browser-user-scripts-settings');
    assert.deepEqual(opened, ['chrome://extensions/?id='+id]);

    available = true;
    activated.fire({tabId:14,windowId:2});
    activated.fire({tabId:11,windowId:1});
    await tick();
    assert.equal(status(), 'unavailable', 'other windows and activation of settings itself do not imply a return');
    activated.fire({tabId:7,windowId:1});
    await tick();
    assert.equal(status(), 'available');
    assert.equal(f.field('browser-user-scripts-reopen-hint').hidden, true);

    available = false;
    f.tabRemoved.fire(11);
    await tick();
    assert.equal(status(), 'unavailable');

    // The user can also open and close Chrome settings on their own.
    available = true;
    activated.fire({tabId:7,windowId:2});
    await tick();
    assert.equal(status(), 'unavailable');
    activated.fire({tabId:7,windowId:1});
    await tick();
    assert.equal(status(), 'available');
    await f.action('browser-user-scripts-panel-active', false);
    available = false;
    activated.fire({tabId:7,windowId:1});
    await tick();
    assert.equal(status(), 'available', 'hidden diagnostics do not probe on tab activation');

    f.api.tabs.create = async () => { throw Error('settings unavailable'); };
    await f.action('browser-user-scripts-settings');
    assert.equal(f.field('browser-user-scripts-settings-error').hidden, false);
    assert.match(f.field('browser-user-scripts-settings-error').textContent, /「GrayDove」/);
    assert.deepEqual([f.state.requests, f.state.messages, f.state.rpc], [[], [], []]);
  } finally { f.controller.dispose(); }
  assert.equal(activated.size, 0);
});

test('Chrome user scripts do not show a stale or affirmative result after a failed probe', async () => {
  const f = fixture();
  const stale = deferred();
  try {
    f.api.userScripts = {getScripts:() => stale.promise, execute:() => assert.fail('unexpected execution')};
    const oldRead = f.action('browser-user-scripts-refresh');
    f.api.userScripts = {...f.api.userScripts, getScripts:async () => { throw Error('unexpected browser failure'); }};
    await f.action('browser-user-scripts-refresh');
    assert.equal(f.field('browser-user-scripts-status').data.state, 'unknown');
    stale.resolve([]);
    await oldRead;
    assert.equal(f.field('browser-user-scripts-status').data.state, 'unknown');
  } finally { f.controller.dispose(); }
});

test('health actions read model URL, retain the exact bound target, and never request extra permission', async () => {
  const f = fixture();
  try {
    await f.controller.ready;
    f.view.patch('target-url', {value:'https://a.example/health'});
    await f.action('create-target');
    assert.deepEqual(f.state.messages[0], {protocol:'opendesk.environment.v1', type:'CREATE_HEALTH_TARGET', url:'https://a.example/health'});
    assert.equal(f.field('check-target').disabled, false);
    await f.action('check-target');
    assert.deepEqual(f.state.messages[1].target, {tabId:9, documentId:'health-doc'});
    assert.match(f.field('status').textContent, /仅环境通信/);
    await f.action('check-source');
    assert.equal(f.state.messages[2].type, 'CHECK_SOURCE');
    f.state.allowed = false;
    await f.action('create-target');
    assert.match(f.field('status').textContent, /E_PERMISSION/);
    assert.equal(f.field('status').data.error, 'true');
    assert.equal(f.state.messages.length, 3);
    assert.equal(f.state.requests.length, 0);
  } finally { f.controller.dispose(); }
});

test('SDK native click reaches existing Authority with exact scope; inspect and revoke remain separate', async () => {
  const ready = deferred(), f = fixture({ready:ready.promise});
  try {
    await f.controller.ready;
    await f.input('sdk-tab', '7'); await f.choose(['network']);
    await f.input('sdk-target-origins', 'https://b.example');
    assert.equal(f.field('sdk-install').disabled, false);
    await f.action('sdk-install', {isTrusted:false});
    assert.equal(f.state.requests.length, 0);
    const install = f.action('sdk-install');
    assert.deepEqual(f.state.requests, [{origins:['https://a.example/*', 'https://b.example/*']}]);
    assert.equal(f.state.rpc.length, 0, 'Authority readiness is awaited after the native permission request');
    await f.action('sdk-install');
    ready.resolve(); await install;
    assert.deepEqual(f.state.rpc, [{method:'installSdk', payload:{tabId:7, frameId:0, documentId:'doc-7',
      capabilities:['network'], targetOrigins:['https://b.example']}}]);
    assert.equal(f.field('sdk-status').data.state, 'installed');
    await f.action('sdk-inspect');
    assert.equal(f.state.rpc.at(-1).method, 'inspectSdkGrant');
    await f.action('sdk-revoke');
    assert.deepEqual(f.state.rpc.at(-1), {method:'revokeSdkGrant', payload:{tabId:7, frameId:0, documentId:'doc-7', grantIncarnation:'grant-7'}});
    assert.equal(f.field('sdk-revoke').disabled, true);
    assert.equal(f.state.requests.length, 1);
  } finally { ready.resolve(); f.controller.dispose(); }
});

test('navigation after SDK dispatch retains the original receipt as history and never replays installation', async () => {
  const installGate = deferred(), f = fixture({installGate});
  try {
    await f.controller.ready; await f.input('sdk-tab', '7'); await f.choose();
    const install = f.action('sdk-install'); await tick();
    assert.equal(f.state.rpc.length, 1);
    f.onCommitted.fire({tabId:7, frameId:0, documentId:'new-doc'});
    installGate.resolve(); await install;
    assert.equal(f.field('sdk-status').data.state, 'stale');
    const history = JSON.parse(f.field('sdk-result').textContent);
    assert.equal(history.lastConfirmedReceipt.documentId, 'doc-7');
    assert.equal(f.field('sdk-revoke').disabled, true);
    assert.equal(f.field('sdk-install').disabled, true);
    assert.equal(f.state.rpc.length, 1);
    await f.input('sdk-tab', '7'); await f.action('sdk-inspect');
    assert.equal(f.field('sdk-revoke').disabled, false);
    f.onRemoved.fire({origins:['https://a.example/*']});
    assert.equal(f.field('sdk-revoke').disabled, true);
    f.tabRemoved.fire(7);
    assert.equal(f.field('sdk-document').value, '');
    assert.equal(f.field('sdk-tab').value, '');
  } finally { installGate.resolve(); f.controller.dispose(); }
});

test('late tab/frame results cannot repopulate a new selection or a disposed host', async () => {
  const f = fixture(), frames = deferred();
  try {
    await f.controller.ready;
    f.api.webNavigation.getAllFrames = () => frames.promise;
    const pending = f.input('sdk-tab', '7');
    await f.input('sdk-tab', '');
    frames.resolve(f.state.frames); await pending;
    assert.equal(f.field('sdk-document').disabled, true);
    const tabs = deferred(); f.api.tabs.query = () => tabs.promise;
    const refresh = f.action('sdk-refresh');
    f.controller.dispose(); const before = f.view.getSnapshot();
    tabs.resolve(f.state.tabs); await refresh;
    assert.equal(f.view.getSnapshot(), before);
  } finally { frames.resolve([]); f.controller.dispose(); }
});

test('SDK follows the current page main document without choosing another window demo or granting authority', async () => {
  const owner = currentPageOwner(currentPage());
  const f = fixture({currentPageTarget:owner, tabs:[
    {id:90, windowId:2, active:true, url:'http://127.0.0.1:43111/demo-form.html'},
    {id:7, windowId:1, active:true, title:'Form', url:'https://a.example/form'}]});
  try {
    await f.controller.ready;
    assert.equal(f.field('sdk-tab').value, '7');
    assert.equal(f.field('sdk-document').value, 'doc-7');
    assert.equal(f.field('sdk-page-title').textContent, 'Form');
    assert.equal(f.field('sdk-page-url').textContent, 'https://a.example/form');
    assert.equal(f.field('sdk-tab').options.some(row => row.value === '90'), false);
    assert.equal(f.field('sdk-install').disabled, false);
    assert.deepEqual(f.state.requests, []);
    assert.deepEqual(f.state.rpc, []);
  } finally { f.controller.dispose(); }
});

for (const status of ['unavailable', 'resolving']) {
  test(`SDK does not fall back to a demo when the current page is ${status}`, async () => {
    const owner = currentPageOwner({status, windowId:1, reason:'E_UNSUPPORTED_SCHEME'});
    const url = 'http://127.0.0.1:43111/demo-form.html';
    const f = fixture({currentPageTarget:owner, tabs:[{id:7, active:true, url}],
      frames:[{frameId:0, documentId:'demo-doc', url, documentLifecycle:'active'}]});
    try {
      await f.controller.ready;
      await f.action('sdk-refresh');
      assert.equal(f.field('sdk-document').value, '');
      assert.equal(f.field('sdk-install').disabled, true);
      await f.action('sdk-install');
      assert.deepEqual(f.state.requests, []);
      assert.deepEqual(f.state.rpc, []);
    } finally { f.controller.dispose(); }
  });
}

function followingFixture() {
  const owner = currentPageOwner(currentPage());
  const other = currentPage({tabId:8, documentId:'doc-8', url:'https://b.example/page', origin:'https://b.example', title:'Other'});
  const f = fixture({currentPageTarget:owner, tabs:[
    {id:7, active:true, title:'Form', url:'https://a.example/form'},
    {id:8, active:false, title:other.title, url:other.url}], frames:{
      7:[{frameId:0, documentId:'doc-7', url:'https://a.example/form', documentLifecycle:'active'}],
      8:[{frameId:0, documentId:'doc-8', url:other.url, documentLifecycle:'active'}]}});
  return {...f, owner, other};
}

test('explicit tab selection stays pinned through current page changes and read-only refresh', async () => {
  const f = followingFixture();
  try {
    await f.controller.ready;
    await f.input('sdk-tab', '8');
    f.owner.publish({status:'resolving', windowId:1});
    f.owner.publish(currentPage({title:'Updated current page'}));
    await tick();
    await f.action('sdk-refresh');
    assert.equal(f.field('sdk-tab').value, '8');
    assert.equal(f.field('sdk-document').value, 'doc-8');
    assert.deepEqual(f.state.requests, []);
    assert.deepEqual(f.state.rpc, []);
  } finally { f.controller.dispose(); }
});

test('use current page resumes following after explicit tab selection', async () => {
  const f = followingFixture();
  try {
    await f.controller.ready;
    assert.equal(f.field('sdk-use-current').hidden, true);
    await f.input('sdk-tab', '8');
    assert.equal(f.field('sdk-use-current').hidden, false);
    await f.action('sdk-use-current');
    assert.equal(f.field('sdk-use-current').hidden, true);
    assert.equal(f.field('sdk-tab').value, '7');
    assert.equal(f.field('sdk-document').value, 'doc-7');
    f.owner.publish(f.other); await tick();
    assert.equal(f.field('sdk-tab').value, '8');
    assert.equal(f.field('sdk-document').value, 'doc-8');
    assert.deepEqual(f.state.requests, []);
    assert.deepEqual(f.state.rpc, []);
  } finally { f.controller.dispose(); }
});

test('explicit subframe selection stays pinned when the current page changes', async () => {
  const f = followingFixture();
  f.state.frames[7].push({frameId:2, documentId:'child-doc', url:'https://a.example/child', documentLifecycle:'active'});
  try {
    await f.controller.ready;
    await f.input('sdk-document', 'child-doc');
    assert.equal(f.field('sdk-use-current').hidden, false);
    f.owner.publish(f.other); await tick();
    await f.action('sdk-refresh');
    assert.equal(f.field('sdk-tab').value, '7');
    assert.equal(f.field('sdk-document').value, 'child-doc');
    assert.deepEqual(f.state.requests, []);
    assert.deepEqual(f.state.rpc, []);
  } finally { f.controller.dispose(); }
});

test('initial tab discovery waits for the current page owner to become ready', async () => {
  const gate = deferred();
  const owner = currentPageOwner({status:'resolving', windowId:1}, gate.promise);
  const f = fixture({currentPageTarget:owner});
  let queries = 0;
  const query = f.api.tabs.query;
  f.api.tabs.query = args => { queries++; return query(args); };
  try {
    await tick();
    assert.equal(queries, 0);
    assert.equal(f.field('sdk-install').disabled, true);
    owner.publish(currentPage());
    assert.equal(queries, 0);
    gate.resolve(); await f.controller.ready;
    assert.ok(queries > 0);
    assert.equal(f.field('sdk-document').value, 'doc-7');
    assert.deepEqual(f.state.requests, []);
    assert.deepEqual(f.state.rpc, []);
  } finally { gate.resolve(); f.controller.dispose(); }
});

test('missing current window never queries global tabs or selects a demo', async () => {
  const owner = currentPageOwner({status:'unavailable', windowId:null, reason:'E_WINDOW_UNAVAILABLE'});
  const f = fixture({currentPageTarget:owner, tabs:[{id:90, windowId:2, active:true,
    url:'http://127.0.0.1:43111/demo-form.html'}]});
  let queries = 0;
  f.api.tabs.query = async () => { queries++; return structuredClone(f.state.tabs); };
  try {
    await f.controller.ready;
    await f.action('sdk-refresh');
    assert.equal(queries, 0);
    assert.equal(f.field('sdk-document').value, '');
    assert.equal(f.field('sdk-install').disabled, true);
    await f.action('sdk-install');
    assert.deepEqual(f.state.requests, []);
    assert.deepEqual(f.state.rpc, []);
  } finally { f.controller.dispose(); }
});

for (const mismatch of ['documentId', 'url']) {
  test(`current page binding rejects a root frame with a mismatched ${mismatch}`, async () => {
    const owner = currentPageOwner(currentPage());
    const f = fixture({currentPageTarget:owner, frames:[{frameId:0, documentId:'doc-7',
      url:'https://a.example/form', documentLifecycle:'active',
      [mismatch]:mismatch === 'documentId' ? 'old-doc' : 'https://a.example/old'}]});
    try {
      await f.controller.ready;
      assert.equal(f.field('sdk-document').value, '');
      assert.equal(f.field('sdk-status').data.state, 'stale');
      assert.equal(f.field('sdk-install').disabled, true);
      await f.action('sdk-install');
      assert.deepEqual(f.state.requests, []);
      assert.deepEqual(f.state.rpc, []);
    } finally { f.controller.dispose(); }
  });
}

test('following a different tab isolates drafts and restores the exact original document draft on return', async () => {
  const f = followingFixture();
  try {
    await f.controller.ready;
    await f.choose(['network']);
    await f.input('sdk-target-origins', 'https://extra.example');
    f.owner.publish(f.other); await tick();
    assert.equal(f.field('sdk-document').value, 'doc-8');
    assert.deepEqual(selectedServices(f), defaultServices);
    assert.equal(f.field('sdk-target-origins').value, '');
    await f.choose([]);
    f.owner.publish(currentPage()); await tick();
    assert.equal(f.field('sdk-document').value, 'doc-7');
    assert.deepEqual(selectedServices(f), ['network']);
    assert.equal(f.field('sdk-target-origins').value, 'https://extra.example');
    assert.deepEqual(f.state.requests, []);
    assert.deepEqual(f.state.rpc, []);
  } finally { f.controller.dispose(); }
});

for (const status of ['resolving', 'unavailable']) {
  test(`current page becoming ${status} immediately clears the old document and blocks approval`, async () => {
    const f = followingFixture();
    try {
      await f.controller.ready;
      assert.equal(f.field('sdk-document').value, 'doc-7');
      f.owner.publish({status, windowId:1, tabId:7, reason:'E_DOCUMENT_UNRESOLVED'});
      assert.equal(f.field('sdk-document').value, '');
      assert.equal(f.field('sdk-install').disabled, true);
      assert.equal(f.field('sdk-inspect').disabled, true);
      await f.action('sdk-install');
      assert.deepEqual(f.state.requests, []);
      assert.deepEqual(f.state.rpc, []);
    } finally { f.controller.dispose(); }
  });
}

test('following navigation binds the new document without inheriting the previous approval draft', async () => {
  const f = followingFixture();
  try {
    await f.controller.ready;
    await f.choose(['network']);
    await f.input('sdk-target-origins', 'https://extra.example');
    f.owner.publish({status:'resolving', windowId:1});
    const next = currentPage({documentId:'next-doc', url:'https://a.example/next'});
    f.state.frames[7] = [{frameId:0, documentId:next.documentId, url:next.url, documentLifecycle:'active'}];
    f.state.tabs[0].url = next.url;
    f.owner.publish(next); await tick();
    assert.equal(f.field('sdk-document').value, 'next-doc');
    assert.deepEqual(selectedServices(f), defaultServices);
    assert.equal(f.field('sdk-target-origins').value, '');
    assert.deepEqual(f.state.requests, []);
    assert.deepEqual(f.state.rpc, []);
  } finally { f.controller.dispose(); }
});

test('same-document title and URL updates preserve manually cleared services and target draft', async () => {
  const f = followingFixture();
  try {
    await f.controller.ready;
    await f.choose([]);
    await f.input('sdk-target-origins', 'https://extra.example');
    const updated = currentPage({title:'Renamed form', url:'https://a.example/renamed/details'});
    f.state.tabs[0] = {...f.state.tabs[0], title:updated.title, url:updated.url};
    f.state.frames[7][0].url = updated.url;
    let reads = 0;
    const query = f.api.tabs.query, frames = f.api.webNavigation.getAllFrames;
    f.api.tabs.query = args => { reads++; return query(args); };
    f.api.webNavigation.getAllFrames = args => { reads++; return frames(args); };
    f.owner.publish(updated); await tick();
    assert.equal(reads, 0, 'same-document metadata does not rediscover tabs or frames');
    await f.action('sdk-refresh');
    assert.equal(f.field('sdk-document').value, 'doc-7');
    assert.equal(f.field('sdk-page-title').textContent, updated.title);
    assert.equal(f.field('sdk-page-url').textContent, updated.url);
    assert.deepEqual(selectedServices(f), []);
    assert.equal(f.field('sdk-target-origins').value, 'https://extra.example');
    assert.equal(f.field('sdk-install').disabled, true);
    assert.deepEqual(f.state.requests, []);
    assert.deepEqual(f.state.rpc, []);
  } finally { f.controller.dispose(); }
});

test('late frame results cannot restore the old document after current page starts resolving', async () => {
  const f = followingFixture(), frames = deferred();
  try {
    await f.controller.ready;
    f.api.webNavigation.getAllFrames = () => frames.promise;
    const refresh = f.action('sdk-refresh');
    f.owner.publish({status:'resolving', windowId:1});
    frames.resolve(f.state.frames[7]); await refresh; await tick();
    assert.equal(f.field('sdk-document').value, '');
    assert.equal(f.field('sdk-install').disabled, true);
    await f.action('sdk-install');
    assert.deepEqual(f.state.requests, []);
    assert.deepEqual(f.state.rpc, []);
  } finally { frames.resolve([]); f.controller.dispose(); }
});

test('disposing host controls unsubscribes from the shared current page owner', async () => {
  const f = followingFixture();
  try {
    await f.controller.ready;
    assert.equal(f.owner.subscriptions, 1);
    assert.equal(f.controller.resourceSnapshot().subscriptions, 6);
    f.controller.dispose(); f.controller.dispose();
    assert.equal(f.owner.subscriptions, 0);
    assert.deepEqual(f.controller.resourceSnapshot(), {subscriptions:0, actions:0});
    const before = f.view.getSnapshot();
    f.owner.publish(f.other); await tick();
    assert.equal(f.view.getSnapshot(), before);
  } finally { f.controller.dispose(); }
});

test('DevelopDiagnostics renders an accessible icon refresh button and collapsed page selection', async () => {
  const artifacts = new URL('../../artifacts/develop-host-controls-diagnostics-tests/', import.meta.url);
  await mkdir(artifacts, {recursive:true});
  let root, f;
  const previous = {window:globalThis.window, document:globalThis.document, act:globalThis.IS_REACT_ACT_ENVIRONMENT};
  try {
    // Bundle both exports together so the real diagnostics uses this provider's context.
    await build({stdin:{contents:"export {DevelopProvider} from './src/ui/react/tabs/develop-controls.tsx';\nexport {DevelopDiagnostics} from './src/ui/react/tabs/develop-diagnostics.tsx';",
      resolveDir:process.cwd(), loader:'js'}, bundle:true, packages:'external', platform:'node', format:'esm',
      outfile:new URL('diagnostics.mjs', artifacts).pathname, logLevel:'silent'});
    const {DevelopProvider, DevelopDiagnostics} = await import(new URL('diagnostics.mjs', artifacts));
    const {document, window} = parseHTML('<html><body><div id="mount"></div></body></html>');
    globalThis.window = window; globalThis.document = document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const {createRoot} = await import('react-dom/client');
    f = followingFixture(); await f.controller.ready;
    root = createRoot(document.getElementById('mount'));
    await React.act(async () => root.render(React.createElement(DevelopProvider, {view:f.view},
      React.createElement(DevelopDiagnostics))));
    const refresh = document.getElementById('sdk-refresh');
    assert.equal(refresh.tagName, 'BUTTON');
    assert.equal(refresh.getAttribute('aria-label'), '刷新网页与文档');
    assert.equal(refresh.getAttribute('title'), '刷新网页与文档');
    assert.equal(refresh.classList.contains('od-icon-button'), true);
    assert.ok(refresh.querySelector('svg'));
    assert.equal(refresh.textContent.trim(), '');
    const tab = document.getElementById('sdk-tab'), selection = tab.closest('details');
    assert.ok(selection);
    assert.match(selection.querySelector('summary').textContent, /更换网页或子框架/);
    assert.equal(selection.hasAttribute('open'), false);
    assert.equal(document.getElementById('sdk-document').closest('details'), selection);
    for (const id of ['sdk-page-title', 'sdk-page-url']) {
      const page = document.getElementById(id);
      assert.ok(page);
      assert.equal(selection.contains(page), false, 'current page remains outside the collapsed selector');
    }
  } finally {
    if (root) await React.act(async () => root.unmount());
    f?.controller.dispose();
    globalThis.window = previous.window; globalThis.document = previous.document; globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act;
    await rm(artifacts, {recursive:true, force:true});
  }
});

test('React renders SDK rows and forwards native events while the controller reads model inputs', async () => {
  const artifacts = new URL('../../artifacts/develop-host-controls-tests/', import.meta.url);
  await mkdir(artifacts, {recursive:true});
  let root, f;
  const previous = {window:globalThis.window, document:globalThis.document, act:globalThis.IS_REACT_ACT_ENVIRONMENT};
  try {
    await build({entryPoints:['src/ui/react/tabs/develop-controls.tsx'], bundle:true, packages:'external',
      platform:'node', format:'esm', outfile:new URL('controls.mjs', artifacts).pathname, logLevel:'silent'});
    const {DevelopProvider, DevelopField} = await import(new URL('controls.mjs', artifacts));
    const {document, window} = parseHTML('<html><body><div id="mount"></div></body></html>');
    globalThis.window = window; globalThis.document = document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const {createRoot} = await import('react-dom/client');
    f = fixture(); await f.controller.ready;
    let received;
    const original = f.view.actions['sdk-target-origins'];
    f.view.actions['sdk-target-origins'] = event => { received = event; return original(event); };
    let capabilityEvent;
    const originalCapabilities = f.view.actions['sdk-capabilities'];
    f.view.actions['sdk-capabilities'] = event => { capabilityEvent = event; return originalCapabilities(event); };
    root = createRoot(document.getElementById('mount'));
    await React.act(async () => root.render(React.createElement(DevelopProvider, {view:f.view},
      React.createElement(React.Fragment, null,
        React.createElement(DevelopField, {as:'fieldset', id:'sdk-capabilities'}, React.createElement('legend', null, 'Services')),
        React.createElement(DevelopField, {as:'textarea', id:'sdk-target-origins'}),
        React.createElement(DevelopField, {as:'button', id:'site-access-grant'})))));
    assert.equal(document.querySelectorAll('[name="sdk-capability"]').length, f.field('sdk-capabilities').rows.length);
    assert.equal(document.querySelector('[value="network.info"]').disabled, true);
    const network = document.querySelector('[name="sdk-capability"][value="network"]');
    assert.equal(network.checked, true);
    const toggle = new window.Event('click', {bubbles:true});
    await React.act(async () => { network.checked = false; network.dispatchEvent(toggle); });
    assert.equal(capabilityEvent, toggle);
    assert.equal(f.field('sdk-capabilities').rows.find(row => row.value === 'network').checked, false);
    assert.equal(network.checked, false);
    const input = document.getElementById('sdk-target-origins'), event = new window.Event('input', {bubbles:true});
    await React.act(async () => { input.value = 'https://b.example'; input.dispatchEvent(event); });
    assert.equal(received, event);
    assert.equal(f.field('sdk-target-origins').value, 'https://b.example');
    assert.equal(f.state.requests.length, 0);
    const shell = await readFile('src/ui/tool-shell.js', 'utf8');
    assert.doesNotMatch(shell, /document\.querySelector\('#(?:site-access-|sdk-|health-result|scraping-panel)/);
    assert.match(shell, /createDeveloperHostControls\(\{api:chrome, client:foundationClient, view:developerView(?:,\s*currentPageTarget(?::\s*currentPageTarget)?)?\s*\}\)/);
  } finally {
    if (root) await React.act(async () => root.unmount());
    f?.controller.dispose();
    globalThis.window = previous.window; globalThis.document = previous.document; globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act;
    await rm(artifacts, {recursive:true, force:true});
  }
});
