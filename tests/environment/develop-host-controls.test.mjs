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
function fixture({withheld = false, ready = Promise.resolve(), installGate} = {}) {
  const onAdded = signal(), onRemoved = signal(), onCommitted = signal(), tabRemoved = signal();
  const state = {websites:!withheld, allowed:true, denied:false, requests:[], messages:[], rpc:[],
    tabs:[{id:7, incognito:false, url:'https://a.example/form', title:'Form'}],
    frames:[{frameId:0, documentId:'doc-7', url:'https://a.example/form', documentLifecycle:'active'}]};
  const api = {
    permissions:{onAdded, onRemoved,
      contains:async ({origins}) => origins?.includes('<all_urls>') ? state.websites : state.allowed,
      request(value) {
        state.requests.push(structuredClone(value));
        if (value.origins.includes('<all_urls>') && !state.denied) state.websites = true;
        return Promise.resolve(!state.denied);
      }},
    tabs:{query:async () => structuredClone(state.tabs), get:async id => ({id, incognito:false}), onRemoved:tabRemoved},
    webNavigation:{getAllFrames:async () => structuredClone(state.frames), onCommitted},
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
  const controller = createDeveloperHostControls({api, client, view});
  const field = id => view.fields[id];
  const action = (id, event = click) => view.actions[id](event);
  const input = async (id, value) => { view.patch(id, {value}); await action(id); };
  const choose = async (values = ['storage.session']) => {
    view.patch('sdk-capabilities', {rows:field('sdk-capabilities').rows.map(row => ({...row, checked:values.includes(row.value)}))});
    await action('sdk-capabilities');
  };
  return {state, api, client, view, controller, field, action, input, choose, onAdded, onRemoved, onCommitted, tabRemoved};
}

test('host controls start without DOM, expose site recovery, and clean only their own actions/listeners', async () => {
  const f = fixture({withheld:true});
  try {
    assert.equal(f.field('site-access-grant').disabled, true);
    await f.controller.ready;
    assert.equal(f.field('site-access-status').data.websites, false);
    assert.equal(f.field('site-access-grant').disabled, false);
    assert.equal(f.field('scraping-panel').data.moduleStatus, 'MODULE_NOT_INSTALLED');
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
    const toggle = new window.Event('click', {bubbles:true});
    await React.act(async () => { network.checked = true; network.dispatchEvent(toggle); });
    assert.equal(capabilityEvent, toggle);
    assert.equal(f.field('sdk-capabilities').rows.find(row => row.value === 'network').checked, true);
    const input = document.getElementById('sdk-target-origins'), event = new window.Event('input', {bubbles:true});
    await React.act(async () => { input.value = 'https://b.example'; input.dispatchEvent(event); });
    assert.equal(received, event);
    assert.equal(f.field('sdk-target-origins').value, 'https://b.example');
    assert.equal(f.state.requests.length, 0);
    const shell = await readFile('src/ui/tool-shell.js', 'utf8');
    assert.doesNotMatch(shell, /document\.querySelector\('#(?:site-access-|sdk-|health-result|scraping-panel)/);
    assert.match(shell, /createDeveloperHostControls\(\{api:chrome, client:foundationClient, view:developerView\}\)/);
  } finally {
    if (root) await React.act(async () => root.unmount());
    f?.controller.dispose();
    globalThis.window = previous.window; globalThis.document = previous.document; globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act;
    await rm(artifacts, {recursive:true, force:true});
  }
});
