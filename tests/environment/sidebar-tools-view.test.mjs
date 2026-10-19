import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {transform} from 'esbuild';
import {parseHTML} from 'linkedom';
import * as React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createSidebarToolsView, patchToolField, setToolFieldAttribute, requestToolFieldEffect} from '../../src/ui/sidebar-tools-view.js';
import {createSidebarTools} from '../../src/ui/sidebar-tools.js';
import {SIDEBAR_TOOL_STORE} from '../../src/ui/sidebar-tools/package.js';

const compiled = await transform(await readFile(new URL('../../src/ui/react/tabs/tool-host.tsx', import.meta.url), 'utf8'),
  {loader: 'tsx', format: 'esm', jsx: 'transform'});
const moduleSource = compiled.code.replace('"react"', JSON.stringify(import.meta.resolve('react')));
const {ToolHost} = await import('data:text/javascript;base64,' + Buffer.from(moduleSource).toString('base64'));
const nextTick = () => new Promise(resolve => setImmediate(resolve));

test('view patches real state, batches subscriptions, preserves snapshots and releases event/row bindings', async () => {
  const view = createSidebarToolsView(), before = view.getSnapshot();
  assert.equal(view.fields['sidebar-tool-title'].nodeType, undefined);
  assert.equal(view.fields['sidebar-tool-title'].addEventListener, undefined);
  assert.equal(view.fields['sidebar-tool-title'].querySelector, undefined);
  let notifications = 0;
  const unsubscribe = view.subscribe(() => notifications++);
  const field = view.fields['sidebar-tool-title'];
  patchToolField(view, field, {textContent: '用户工具', data: {tool: 'alpha'}});
  setToolFieldAttribute(view, field, 'aria-label', '当前工具');
  setToolFieldAttribute(view, field, 'data-state', 'ready');
  setToolFieldAttribute(view, field, 'aria-label', null);
  view.patchLabels({languageLabel: 'Language'});
  assert.equal(field.textContent, '用户工具');
  assert.deepEqual(field.data, {tool: 'alpha'});
  assert.equal(view.getSnapshot().fields[field.key].attributes['data-state'], 'ready');
  assert.equal(before.fields[field.key].textContent, '');
  assert.equal(before.fields[field.key].attributes['data-state'], undefined);
  assert.notEqual(before, view.getSnapshot());
  assert.equal(view.getSnapshot().labels.languageLabel, 'Language');
  await nextTick(); assert.equal(notifications, 1);
  let received;
  const nativeEvent = {isTrusted: true};
  const unbind = view.bind('sidebar-tool-install', 'click', event => {received = event;});
  view.patch('sidebar-tool-install', {disabled: false});
  view.dispatch('sidebar-tool-install', 'click', nativeEvent);
  assert.equal(received, nativeEvent, 'the exact event reaches the controller synchronously');
  unbind(); received = null;
  view.dispatch('sidebar-tool-install', 'click', nativeEvent); assert.equal(received, null);
  const calls = [], rows = [{id: 'https://one.test', text: 'one', label: '撤销', disabled: false}];
  view.setRows('sidebar-tool-cookie-other-sites', rows, '无授权', (...args) => calls.push(args));
  rows[0].text = 'mutated';
  assert.equal(view.fields['sidebar-tool-cookie-other-sites'].rows[0].text, 'one');
  view.activateRow('sidebar-tool-cookie-other-sites', 'https://one.test', nativeEvent);
  assert.deepEqual(calls, [['https://one.test', nativeEvent]]);
  view.setRows('sidebar-tool-cookie-other-sites', [{...rows[0], disabled: true}], '', () => calls.push('blocked'));
  view.activateRow('sidebar-tool-cookie-other-sites', 'https://one.test', nativeEvent);
  assert.equal(calls.length, 1);
  requestToolFieldEffect(view, field, 'focus', {preventScroll: true});
  requestToolFieldEffect(view, field, 'scrollIntoView', {block: 'nearest'});
  assert.deepEqual(view.takeEffects().map(effect => effect.method), ['focus', 'scrollIntoView']);
  assert.throws(() => view.requestEffect(field.key, 'click'), /E_TOOL_VIEW_EFFECT/);
  assert.throws(() => view.patch('unknown', {}), /E_SIDEBAR_TOOL_FIELD/);
  unsubscribe(); view.dispose();
  assert.deepEqual(view.resourceSnapshot(), {subscriptions: 0, bindings: 0, runtime: false, controllers: 0, effects: 0});
});

test('SSR contains import, execution display and trusted reviews, with one owner and escaped source', () => {
  const view = createSidebarToolsView();
  view.patch('sidebar-tool-import', {hidden: false});
  view.patch('sidebar-tool-preview-title', {textContent: '<script>untrusted()</script>'});
  view.patch('sidebar-tool-retired-draft-text', {value: '<img src=x onerror=untrusted()>'});
  view.patchLabels({languageLabel: 'Language', overlayHeading: 'Overlay appearance'});
  const html = renderToStaticMarkup(React.createElement(ToolHost, {view}));
  const {document} = parseHTML(html);
  const ids = [...document.querySelectorAll('[id]')].map(node => node.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ['sidebar-tool-import', 'sidebar-tool-preview', 'sidebar-tool-install', 'page-install-import-receipt',
    'sidebar-tool-action-review', 'sidebar-tool-update', 'sidebar-tool-settings-view', 'sidebar-tool-frame',
    'sidebar-tool-adblock-native', 'sidebar-tool-ai-proxy-native', 'sidebar-tool-inline-remove',
    'sidebar-tool-visibility-settings', 'sidebar-tool-retired-draft', 'time-review-permission-settings']) {
    assert.ok(document.getElementById(id), id);
  }
  assert.equal(document.getElementById('sidebar-tool-import').hidden, false);
  assert.equal(document.getElementById('sidebar-tool-display').hidden, true);
  assert.equal(document.getElementById('extension-center'), null);
  assert.equal(document.getElementById('sidebar-tool-list'), null);
  assert.equal(document.getElementById('sidebar-tool-official-catalog'), null);
  assert.equal(document.querySelector('iframe,script,img'), null);
  assert.match(html, /&lt;script&gt;untrusted\(\)&lt;\/script&gt;/);
  assert.match(html, /Language/); assert.match(html, /Overlay appearance/);
  assert.deepEqual(view.resourceSnapshot(), {subscriptions: 0, bindings: 0, runtime: false, controllers: 0, effects: 0});
  view.dispose();
});

test('React layout supplies real runtime refs, preserves opaque children, dispatches native events and cleans up', async t => {
  const {window, document} = parseHTML('<html><body><div id="mount"></div></body></html>');
  const previous = {window: globalThis.window, document: globalThis.document, act: globalThis.IS_REACT_ACT_ENVIRONMENT};
  globalThis.window = window; globalThis.document = document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  t.after(() => {globalThis.window = previous.window; globalThis.document = previous.document; globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act;});
  const {createRoot} = await import('react-dom/client');
  const root = createRoot(document.getElementById('mount')), view = createSidebarToolsView();
  let initialized = 0, disposed = 0;
  const calls = [];
  const methods = ['openTool', 'openSettings', 'toggleEnabled', 'retryUninstallCleanup', 'openOfficialReview',
    'openImport', 'openReadOnlyPreview', 'openInTab', 'closeTool'];
  const facade = view.connect(() => {
    initialized++;
    for (const node of Object.values(view.runtime)) assert.equal(node.ownerDocument, document);
    assert.equal(view.runtime.settingsControl, document.getElementById('sidebar-tool-settings-open'));
    assert.equal(view.runtime.settingsControl.tagName, 'BUTTON');
    const frame = document.createElement('iframe'); frame.dataset.instance = 'original-installation';
    view.runtime.frameRoot.append(frame);
    const trusted = document.createElement('button'); trusted.id = 'trusted-business-owner';
    view.runtime.trustedSettings.append(trusted);
    const release = view.bind('sidebar-tool-install', 'click', event => calls.push(['install', event]));
    return {ready: Promise.resolve(), setVisible: value => calls.push(['visible', value]),
      ...Object.fromEntries(methods.map(name => [name, (...args) => {calls.push([name, ...args]); return name;}])),
      isDirty: () => true, isPreviewActive: () => false, isPreviewDirty: () => true,
      dispose() {disposed++; assert.equal(frame.isConnected, true); release(); frame.remove(); trusted.remove();}}
  });
  facade.setVisible(true);
  assert.equal(facade.isDirty(), false);
  assert.throws(() => facade.openTool('early'), /E_SIDEBAR_TOOL_RUNTIME_NOT_READY/);
  await React.act(async () => {root.render(React.createElement(ToolHost, {view}));});
  await facade.ready;
  assert.equal(initialized, 1); assert.deepEqual(calls, [['visible', true]]);
  assert.equal(view.resourceSnapshot().subscriptions, 1);
  assert.equal(facade.isDirty(), true); assert.equal(facade.isPreviewActive(), false);
  for (const name of methods) assert.equal(facade[name]('alpha'), name);
  const frame = view.runtime.frameRoot.firstChild, trusted = document.getElementById('trusted-business-owner');
  const focused = [], scrolls = [];
  document.getElementById('sidebar-tool-back').focus = options => focused.push(options);
  document.getElementById('sidebar-tool-back').scrollIntoView = options => scrolls.push(options);
  const rows = [];
  const unbindLanguage = view.bind('sidebar-tool-toc-language-select', 'change', event => rows.push([view.fields['sidebar-tool-toc-language-select'].value, event]));
  await React.act(async () => {
    view.patch('sidebar-tool-display', {hidden: false});
    view.patch('sidebar-tool-install', {disabled: false});
    view.patch('sidebar-tool-title', {textContent: '保留运行实例'});
    view.patchLabels({languageLabel: 'Language'});
    view.setRows('sidebar-tool-settings-sites', [{id: 'https://one.test', text: 'https://one.test', label: '撤销'}], '', (...args) => rows.push(args));
    view.requestEffect('sidebar-tool-back', 'focus', {preventScroll: true});
    view.requestEffect('sidebar-tool-back', 'scrollIntoView', {block: 'nearest'});
  });
  assert.equal(view.runtime.frameRoot.firstChild, frame);
  assert.equal(document.getElementById('trusted-business-owner'), trusted);
  assert.equal(document.getElementById('sidebar-tool-title').textContent, '保留运行实例');
  assert.deepEqual(focused, [{preventScroll: true}]); assert.deepEqual(scrolls, [{block: 'nearest'}]);
  const installEvent = new window.Event('click', {bubbles: true});
  document.getElementById('sidebar-tool-install').dispatchEvent(installEvent);
  assert.deepEqual(calls.at(-1), ['install', installEvent]);
  const rowEvent = new window.Event('click', {bubbles: true});
  document.querySelector('#sidebar-tool-settings-sites button').dispatchEvent(rowEvent);
  assert.deepEqual(rows, [['https://one.test', rowEvent]]);
  const language = document.getElementById('sidebar-tool-toc-language-select');
  Object.defineProperty(language, 'value', {configurable: true, writable: true, value: 'en'});
  const languageEvent = new window.Event('change', {bubbles: true});
  await React.act(async () => language.dispatchEvent(languageEvent));
  assert.deepEqual(rows.at(-1), ['en', languageEvent]);
  const file = {name: 'alpha.opendesk-tool.json'}, selections = [], cancellations = [];
  const input = document.getElementById('sidebar-tool-file');
  Object.defineProperty(input, 'files', {configurable: true, value: [file]});
  const unbindFile = view.bind('sidebar-tool-file', 'change', event => selections.push(event));
  const unbindCancel = view.bind('sidebar-tool-file', 'cancel', event => cancellations.push(event));
  input.value = 'alpha.opendesk-tool.json';
  const fileEvent = new window.Event('change', {bubbles: true});
  await React.act(async () => input.dispatchEvent(fileEvent));
  assert.deepEqual(selections, [fileEvent]);
  assert.equal(view.fields['sidebar-tool-file'].files[0], file);
  const cancelEvent = new window.Event('cancel'); input.dispatchEvent(cancelEvent);
  assert.deepEqual(cancellations, [cancelEvent]);
  await React.act(async () => view.patch('sidebar-tool-file', {value: ''}));
  assert.equal(input.value, '');
  assert.deepEqual(view.fields['sidebar-tool-file'].files, []);
  unbindFile(); unbindCancel();
  unbindLanguage();
  await React.act(async () => root.unmount());
  assert.equal(disposed, 1);
  assert.deepEqual(view.resourceSnapshot(), {subscriptions: 0, bindings: 0, runtime: false, controllers: 0, effects: 0});
  assert.ok(Object.values(view.runtime).every(node => node === null));
  facade.dispose(); view.dispose(); assert.equal(disposed, 1);
});

test('runtime detachment rejects pending readiness, never replays actions, and is safe after explicit controller disposal', async () => {
  const {document} = parseHTML('<html><body></body></html>'), view = createSidebarToolsView();
  assert.throws(() => view.attachRuntime({}), /E_SIDEBAR_TOOL_RUNTIME/);
  let disposeCount = 0, finish;
  const facade = view.connect(() => ({ready: new Promise(resolve => {finish = resolve;}),
    setVisible() {}, dispose() {disposeCount++;}}));
  const nodes = Object.fromEntries(Object.keys(view.runtime).map(key => [key, document.createElement(key === 'settingsControl' ? 'button' : 'div')]));
  const detach = view.attachRuntime(nodes);
  facade.dispose(); detach(); detach(); finish();
  await assert.rejects(facade.ready, /E_SIDEBAR_TOOL_VIEW_DISPOSED/);
  assert.equal(disposeCount, 1);
  assert.throws(() => facade.openTool('alpha'), /E_SIDEBAR_TOOL_VIEW_DISPOSED/);
  view.dispose();
});

test('real sidebar controller initializes with React DOM runtime, reaches ready and releases Cookie click bindings', {timeout: 10000}, async t => {
  const {window, document} = parseHTML('<html><body><div id="mount"></div></body></html>');
  const previous = {window: globalThis.window, document: globalThis.document, act: globalThis.IS_REACT_ACT_ENVIRONMENT};
  globalThis.window = window; globalThis.document = document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  t.after(() => {globalThis.window = previous.window; globalThis.document = previous.document; globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act;});
  const {createRoot} = await import('react-dom/client');
  const root = createRoot(document.getElementById('mount')), view = createSidebarToolsView();
  let mounted = true;
  t.after(async () => {
    if (mounted) await React.act(async () => root.unmount());
    view.dispose();
  });

  // Use the checked-in package as inert installed metadata; no sandbox, build or browser service runs.
  const bytes = await readFile(new URL('../../examples/sidebar-tools/cookie-editor/cookie-editor.opendesk-tool.json', import.meta.url));
  const tool = JSON.parse(bytes), store = new Map([[SIDEBAR_TOOL_STORE, [tool]]]);
  const catalog = {schema: 'opendesk.official-tools.releases.v1',
    sourceRepository: 'https://github.com/shopable-ai/opendesk-browser', apps: [{
      id: 'opendesk/' + tool.id, toolId: tool.id, kind: 'sidebar-tool', installationPolicy: 'optional',
      version: tool.version, packageTitle: tool.title, description: tool.description, capabilities: tool.capabilities,
      packagePath: `official-tools/${tool.id}/${tool.id}.opendesk-tool.json`,
      bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex')
    }]};
  const storageListeners = new Set(), pageListeners = new Set(), localeListeners = new Set();
  const reads = [], fetched = [], toolActivity = [];
  const api = {runtime: {
    getURL: path => 'chrome-extension://test/' + path,
    sendMessage() {assert.fail('an untrusted Cookie click cannot request authority');}
  }, storage: {local: {
    async get(keys) {
      reads.push(keys);
      return Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(key => [key, structuredClone(store.get(key))]));
    },
    async set() {assert.fail('initialization and untrusted clicks cannot write storage');},
    async remove() {assert.fail('initialization and untrusted clicks cannot remove storage');}
  }, onChanged: {
    addListener: listener => storageListeners.add(listener),
    removeListener: listener => {assert.ok(storageListeners.delete(listener));}
  }}};
  const facade = createSidebarTools({view, doc: document, api,
    lockManager: {request: (_name, work) => Promise.resolve().then(work)},
    fetcher: async url => {
      fetched.push(url);
      assert.equal(url, api.runtime.getURL('official-tools/catalog.json'));
      return new Response(JSON.stringify(catalog));
    },
    currentPageTarget: {snapshot: {status: 'available', url: 'https://example.com/a', origin: 'https://example.com', title: 'Example'},
      subscribe(listener) {pageListeners.add(listener); return () => {assert.ok(pageListeners.delete(listener));};}},
    localeController: {getLocale: () => 'zh-CN',
      subscribe(listener) {localeListeners.add(listener); return () => {assert.ok(localeListeners.delete(listener));};}},
    taskWorkbench: {setToolActive: value => toolActivity.push(value)}
  });
  facade.setVisible(true);
  assert.equal(view.resourceSnapshot().controllers, 0, 'initialization waits for real React refs');
  assert.equal(reads.length, 0);
  for (const field of Object.values(view.fields)) {
    assert.equal(Object.getPrototypeOf(field), Object.prototype);
    for (const name of ['nodeType', 'ownerDocument', 'addEventListener', 'querySelector']) assert.equal(field[name], undefined, field.key + '.' + name);
  }

  await React.act(async () => {
    root.render(React.createElement(ToolHost, {view}));
    await nextTick();
  });
  await React.act(async () => {await facade.ready;});
  assert.equal(view.resourceSnapshot().controllers, 1);
  assert.equal(view.resourceSnapshot().subscriptions, 1);
  for (const node of Object.values(view.runtime)) {
    assert.equal(node.nodeType, 1);
    assert.equal(node.ownerDocument, document);
    assert.equal(node.isConnected, true);
  }
  assert.equal(view.runtime.settingsControl, document.getElementById('sidebar-tool-settings-open'));
  assert.equal(storageListeners.size, 1);
  assert.equal(pageListeners.size, 1);
  assert.equal(localeListeners.size, 1);
  assert.ok(reads.flat().includes(SIDEBAR_TOOL_STORE));
  assert.deepEqual(fetched, [api.runtime.getURL('official-tools/catalog.json')], 'catalog loads without the retired list DOM');
  assert.equal(view.fields['sidebar-tool-status'].textContent, '', 'ready cannot hide a caught initialization failure');
  assert.equal(document.getElementById('sidebar-tool-list'), null);

  await React.act(async () => {assert.equal(facade.openSettings(tool.id), true);});
  assert.equal(view.fields['sidebar-tool-cookie-permissions'].hidden, false);
  const key = 'sidebar-tool-cookie-site-toggle', button = document.getElementById(key);
  assert.equal(button.disabled, false);
  assert.equal(view.actions[key]?.click.size, 1, 'the real controller registers its Cookie handler through view.bind');
  const clicks = [], releaseObserver = view.bind(key, 'click', event => clicks.push(event));
  const click = new window.Event('click', {bubbles: true});
  await React.act(async () => button.dispatchEvent(click));
  assert.deepEqual(clicks, [click], 'React forwards the real DOM event to the bound controller action');
  assert.equal(store.size, 1);
  assert.equal(view.runtime.frameRoot.children.length, 0, 'opening settings cannot start the sandbox');

  await React.act(async () => facade.dispose());
  assert.equal(storageListeners.size, 0);
  assert.equal(pageListeners.size, 0);
  assert.equal(localeListeners.size, 0);
  assert.equal(view.actions[key], undefined);
  assert.equal(view.resourceSnapshot().bindings, 0);
  assert.equal(view.resourceSnapshot().controllers, 0);
  button.dispatchEvent(new window.Event('click', {bubbles: true}));
  assert.deepEqual(clicks, [click], 'disposed bindings cannot receive subsequent DOM clicks');
  releaseObserver(); facade.dispose();
  await React.act(async () => root.unmount()); mounted = false;
  assert.deepEqual(view.resourceSnapshot(), {subscriptions: 0, bindings: 0, runtime: false, controllers: 0, effects: 0});
  assert.ok(Object.values(view.runtime).every(node => node === null));
  assert.ok(toolActivity.includes(true), 'the original task workbench receives tool visibility');
});
