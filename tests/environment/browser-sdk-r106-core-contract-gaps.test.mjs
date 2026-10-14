import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

// The new driver can exercise the read-only physical candidate without changing
// its source or receipts. All product imports, including transitive imports,
// come from this one root; the driver remains a separate verification input.
const sourceRoot = resolve(process.env.BROWSER_SDK_CONTRACT_SOURCE_ROOT ||
  fileURLToPath(new URL('../../', import.meta.url)));
const product = path => import(pathToFileURL(resolve(sourceRoot, 'src', path)).href);
const {createBrowserSdk} = await product('framework/sdk/browser.js');
const {createContextMenuHost} = await product('platform/chrome/context-menus.js');
const {createSidebarTools} = await product('ui/sidebar-tools.js');
const {validateSidebarToolPackage, sidebarToolPackageHash, SIDEBAR_TOOL_STORE} =
  await product('ui/sidebar-tools/package.js');
const {BROWSER_OPERATIONS, BROWSER_MENU_GRANTS_STORE, BROWSER_MENU_LAUNCH_STORE,
  BROWSER_MENU_SOURCE_PROTOCOL} = await product('framework/sdk/browser-contract.js');
const {TOOL_REVOCATION_EPOCHS_STORE} = await product('ui/sidebar-tools/installation.js');
const {BROWSER_OBSERVATION_STORE} = await product('platform/chrome/browser-network-observe.js');

const EXT = 'r106-core-contract-ext';
const HOST = '01234567-89ab-4def-8123-456789abcdef';
const INSTANCE = 'fedcba98-7654-4abc-8def-123456789abc';
const EPOCH = 'core-contract-epoch';
const ORIGIN = 'https://example.com';
const TARGET_URL = ORIGIN + '/form';
const ACTION = 'capture-selection';
const SELECTED = 'R10.6 选区合同';
const locks = {request: (_name, work) => Promise.resolve().then(work)};
const code = value => error => error?.code === value;
const pause = () => new Promise(resolve => setImmediate(resolve));
async function settle(check) {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (check()) return;
    await pause();
  }
  assert.fail('R10.6 Host fixture did not settle');
}
function tool(id = 'core-contract-tool', capabilities = [
  'browser.contextMenu', 'currentPage.read', 'user.export',
  'browser.tabs', 'browser.network.observe', 'browser.events'
]) {
  return validateSidebarToolPackage({
    format: 'opendesk.sidebar-tool.v2', id, version: '1.0.0',
    title: 'Core contract probe', description: 'R10.6 direct contract fixture',
    capabilities, html: '<main>Contract probe</main>', css: '', js: 'void 0;',
    requires: {browserSdk: '1.0.0'}, contributes: {contextMenus: [{
      actionId: ACTION, title: 'Capture selection', contexts: ['selection'],
      documentUrlPatterns: [ORIGIN + '/*'], handler: 'open-self'
    }]}
  });
}

// Only Chrome primitives are modeled. SDK routing, package admission, sender,
// approvals, grants, launch consumption and observation ownership are real.
async function fixture() {
  const pkg = tool(), foreign = tool('foreign-contract-tool');
  const local = new Map([[SIDEBAR_TOOL_STORE, [pkg, foreign]],
    [TOOL_REVOCATION_EPOCHS_STORE, {[pkg.id]: EPOCH, [foreign.id]: EPOCH}]]);
  const session = new Map(), menus = new Map(), tabs = new Map();
  const changed = [], removed = [], updated = [];
  const requests = {start: [], complete: [], error: []};
  const calls = {downloads: [], opened: [], permissions: [], frames: []};
  const permissions = new Set(['contextMenus', 'downloads', 'webRequest', 'webNavigation', 'tabs']);
  let siteAllowed = true;
  const document = {tabId: 21, windowId: 7, documentId: 'target-document',
    url: TARGET_URL, origin: ORIGIN};
  tabs.set(document.tabId, {id: document.tabId, windowId: document.windowId, url: TARGET_URL});
  const store = map => ({
    get: async keys => Object.fromEntries((keys === null ? [...map.keys()] :
      Array.isArray(keys) ? keys : [keys]).map(key => [key, structuredClone(map.get(key))])),
    set: async values => {
      for (const [key, value] of Object.entries(values)) map.set(key, structuredClone(value));
    },
    remove: async keys => {for (const key of Array.isArray(keys) ? keys : [keys]) map.delete(key);}
  });
  const sender = {id: EXT, frameId: 0, documentId: 'side-panel-document',
    documentLifecycle: 'active', url: `chrome-extension://${EXT}/ui/tool.html?hostInstanceId=${HOST}`};
  const api = {
    runtime: {id: EXT, lastError: null, getURL: path => `chrome-extension://${EXT}/${path}`,
      getContexts: async () => [{contextType: 'SIDE_PANEL', documentUrl: sender.url,
        documentId: sender.documentId, frameId: 0, incognito: false}]},
    storage: {local: store(local), session: store(session), onChanged: {
      addListener: fn => changed.push(fn),
      removeListener: fn => {const index = changed.indexOf(fn); if (index >= 0) changed.splice(index, 1);}
    }},
    permissions: {contains: async request => {
      calls.permissions.push(structuredClone(request));
      return request.origins ? siteAllowed && request.origins.every(origin => origin === ORIGIN + '/*') :
        (request.permissions || []).every(permission => permissions.has(permission));
    }},
    contextMenus: {
      onClicked: {addListener() {}},
      create(item, callback) {menus.set(item.id, structuredClone(item)); callback();},
      update(id, item, callback) {menus.set(id, {...menus.get(id), ...structuredClone(item)}); callback();},
      remove(id, callback) {menus.delete(id); callback();}
    },
    sidePanel: {open: async input => {calls.opened.push(structuredClone(input));}},
    tabs: {
      onRemoved: {addListener: fn => removed.push(fn)},
      onUpdated: {addListener: fn => updated.push(fn)},
      create: async ({url}) => {
        const row = {id: 100 + tabs.size, windowId: 7, url}; tabs.set(row.id, row); return {...row};
      },
      remove: async id => {tabs.delete(id); for (const fn of removed) fn(id);},
      get: async id => {assert.ok(tabs.has(id)); return {...tabs.get(id)};},
      query: async () => [...tabs.values()].map(row => ({...row}))
    },
    webNavigation: {getFrame: async input => {
      calls.frames.push(structuredClone(input));
      const tab = tabs.get(input.tabId);
      return tab ? {url: tab.url, documentId: input.tabId === document.tabId ?
        document.documentId : 'owned-document-' + input.tabId, documentLifecycle: 'active'} : null;
    }},
    webRequest: {
      onBeforeRequest: {addListener: fn => requests.start.push(fn)},
      onCompleted: {addListener: fn => requests.complete.push(fn)},
      onErrorOccurred: {addListener: fn => requests.error.push(fn)}
    },
    downloads: {download: async input => {calls.downloads.push(structuredClone(input)); return 777;}}
  };
  const host = createContextMenuHost({api, lockManager: locks, logger: {warn() {}}});
  const identityFor = async pkg => ({toolId: pkg.id, toolVersion: pkg.version,
    packageHash: await sidebarToolPackageHash(pkg), installEpoch: EPOCH,
    hostInstanceId: HOST, toolInstance: INSTANCE});
  const identity = await identityFor(pkg), foreignIdentity = await identityFor(foreign);
  const call = (operation, args = {}, extra = {}, caller = sender) =>
    host.handleTool({...identity, operation, args, ...extra}, caller);
  const sdkFor = (extra = {}) => createBrowserSdk({request: (operation, args) => call(operation, args, extra)});
  const confirm = (operation, args) => host.handleHost({...identity,
    operation: 'browser.intent.confirm', targetOperation: operation, targetArgs: args}, sender);
  const approved = async (operation, args) => call(operation, args,
    {approvalRef: (await confirm(operation, args)).approvalRef});
  const grant = () => host.handleHost({operation: 'browser.contextMenu.userToggle',
    toolId: pkg.id, origin: ORIGIN, enabled: true, document, hostInstanceId: HOST}, sender);
  const launch = async () => {
    await grant();
    assert.equal(host.noteSourceContext({protocol: BROWSER_MENU_SOURCE_PROTOCOL, kind: 'contextmenu'},
      {id: EXT, tab: {id: document.tabId, incognito: false}, frameId: 0,
        documentId: document.documentId, documentLifecycle: 'active', url: TARGET_URL}), true);
    host.onClicked({menuItemId: `opendesk.tool.${pkg.id}.${ACTION}`,
      pageUrl: TARGET_URL, frameId: 0, selectionText: SELECTED}, tabs.get(document.tabId));
    await host.synchronize();
    const ticket = session.get(BROWSER_MENU_LAUNCH_STORE)?.[pkg.id];
    assert.ok(ticket, 'real menu Host must have persisted a launch');
    assert.deepEqual(await host.handleHost({operation: 'browser.launch.bind', toolId: pkg.id,
      launchId: ticket.ticketId, hostInstanceId: HOST, toolInstance: INSTANCE}, sender),
    {bound: true, ticketId: ticket.ticketId});
    return ticket;
  };
  const sdk = sdkFor();
  return {api, host, pkg, local, session, menus, calls, permissions, document, identity,
    foreignIdentity, sender, sdk, sdkFor, call, confirm, approved, grant, launch,
    setSite: value => {siteAllowed = value;},
    uninstall: () => local.set(SIDEBAR_TOOL_STORE, [foreign])};
}

// A small DOM/message fixture drives the existing Side Panel dispatch. The
// modeled trusted click below is Node evidence only, never native-input proof.
class Node {
  constructor(tag = 'div') {
    this.tag = tag; this.children = []; this.listeners = new Map(); this.dataset = {};
    this.style = {}; this.attributes = new Map(); this.hidden = false;
    if (tag === 'iframe') this.contentWindow = {sent: [], postMessage(message) {this.sent.push(message);}};
  }
  addEventListener(kind, fn) {const rows = this.listeners.get(kind) || []; rows.push(fn); this.listeners.set(kind, rows);}
  removeEventListener(kind, fn) {this.listeners.set(kind, (this.listeners.get(kind) || []).filter(row => row !== fn));}
  emit(kind, event = {}) {for (const fn of this.listeners.get(kind) || []) fn(event);}
  append(...nodes) {for (const node of nodes) {node.parent = this; this.children.push(node);}}
  replaceChildren(...nodes) {for (const node of this.children) node.parent = null; this.children = []; this.append(...nodes);}
  remove() {if (this.parent) this.parent.children = this.parent.children.filter(node => node !== this); this.parent = null;}
  setAttribute(key, value) {this.attributes.set(key, value);}
  focus() {this.ownerDocument.activeElement = this;}
}
async function frontend(t, f, {target = {snapshot: {status: 'available', title: 'Contract form', url: TARGET_URL}}} = {}) {
  const originals = new Map(['window', 'location', 'navigator'].map(key =>
    [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const win = new Node('window'), elements = new Map(), copied = [];
  Object.defineProperty(globalThis, 'window', {configurable: true, value: win});
  Object.defineProperty(globalThis, 'location', {configurable: true, value: {href: f.sender.url}});
  Object.defineProperty(globalThis, 'navigator', {configurable: true,
    value: {clipboard: {writeText: async text => {copied.push(text);}}}});
  const doc = {documentElement: {dataset: {}}, querySelector: () => new Node(),
    getElementById: id => {
      if (!elements.has(id)) {const node = new Node(); node.ownerDocument = doc; elements.set(id, node);}
      return elements.get(id);
    }, createElement: tag => {const node = new Node(tag); node.ownerDocument = doc; return node;}};
  // The real src/ui/tool.html renders the trusted action review with [hidden].
  // Starting this Node surrogate visible races requestActionReview and dispatches
  // a click before any approval is pending. Mirror its actual initial DOM state.
  const actionReview = doc.getElementById('sidebar-tool-action-review');
  actionReview.hidden = true;
  const messages = [];
  f.api.runtime.sendMessage = async envelope => {
    messages.push(structuredClone(envelope));
    try {return {ok: true, data: await f.host[envelope.kind === 'host' ? 'handleHost' : 'handleTool'](envelope, f.sender)};}
    catch (error) {return {ok: false, error: {code: error.code, message: error.message}};}
  };
  const ui = createSidebarTools({api: f.api, doc, currentPageTarget: target, lockManager: locks,
    // Offline catalog unavailable: do not install fixtures or fetch remote code.
    fetcher: async () => new Response('', {status: 404}),
    taskWorkbench: {setToolActive() {}, focusInstalledTask() {return false;}}});
  t.after(() => {
    try {ui.dispose();}
    finally {for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }}
  });
  await ui.ready; ui.setVisible(true); ui.openTool(f.pkg.id);
  const frame = elements.get('sidebar-tool-frame').children[0];
  assert.ok(frame, 'existing Side Panel Host must mount the installed tool');
  await frame.onload();
  const loaded = frame.contentWindow.sent[0];
  assert.ok(loaded, 'existing iframe onload must initialize the session');
  let sequence = 0;
  const request = async (operation, payload) => {
    const requestId = String(++sequence);
    win.emit('message', {origin: 'null', source: frame.contentWindow, data: {
      protocol: loaded.protocol, toolId: f.pkg.id, instance: loaded.instance,
      kind: 'request', requestId, operation, payload
    }});
    await settle(() => frame.contentWindow.sent.some(row => row.requestId === requestId) ||
      elements.get('sidebar-tool-action-review').hidden === false);
    if (!frame.contentWindow.sent.some(row => row.requestId === requestId))
      elements.get('sidebar-tool-action-continue').emit('click', {isTrusted: true});
    await settle(() => frame.contentWindow.sent.some(row => row.requestId === requestId));
    const reply = frame.contentWindow.sent.find(row => row.requestId === requestId);
    if (!reply.ok) throw Object.assign(new Error(reply.error.message), {code: reply.error.code});
    return reply.result;
  };
  return {sdk: createBrowserSdk({request}), target, copied, messages};
}

test('browser.capabilities.list: real Host returns bounded installed-tool status and reflects permission denial', async () => {
  const f = await fixture(); await f.grant();
  const listed = await f.sdk.capabilities.list();
  const menu = listed.find(row => row.operation === 'browser.contextMenu.register');
  assert.deepEqual(menu, {operation: 'browser.contextMenu.register', implementation: 'IMPLEMENTED',
    riskLevel: 'medium', requiredCapabilities: ['browser.contextMenu'],
    requiredChromePermissions: ['contextMenus'],
    status: {callableNow: true, reasonCode: null, exposure: 'allowed'}});
  const clipboard = listed.find(row => row.operation === 'browser.clipboard.writeText');
  assert.equal(clipboard.status.callableNow, false);
  assert.equal(clipboard.status.reasonCode, 'E_FRONTEND_CONTEXT_REQUIRED');
  assert.ok(Buffer.byteLength(JSON.stringify(listed)) <= BROWSER_OPERATIONS['browser.capabilities.list'].maxResponseBytes);
  assert.ok(!listed.some(row => ['browser.history.searchTrusted', 'browser.permissions.requestForTool'].includes(row.operation)));
  f.permissions.delete('contextMenus');
  const denied = (await f.sdk.capabilities.list()).find(row => row.operation === menu.operation);
  assert.deepEqual(denied.status, {callableNow: false, reasonCode: 'E_CHROME_PERMISSION_REQUIRED', exposure: 'allowed'});
  f.uninstall(); await assert.rejects(f.sdk.capabilities.list(), code('E_TOOL_CHANGED'));
});

test('browser.contextMenu.getStatus: exact grant/action receipt; permission revocation disables and uninstalled owner rejects', async () => {
  const f = await fixture(); await f.grant();
  assert.deepEqual(await f.sdk.contextMenu.getStatus(), {operation: 'browser.contextMenu.getStatus',
    enabled: true, approvedOrigins: [ORIGIN], activeActions: [ACTION], browserPermission: true});
  f.permissions.delete('contextMenus');
  assert.deepEqual(await f.sdk.contextMenu.getStatus(), {operation: 'browser.contextMenu.getStatus',
    enabled: false, approvedOrigins: [ORIGIN], activeActions: [ACTION], browserPermission: false});
  f.uninstall(); await assert.rejects(f.sdk.contextMenu.getStatus(), code('E_TOOL_CHANGED'));
});

test('browser.contextMenu.register: persists declared action and native menu; missing site, Chrome permission and undeclared action reject', async () => {
  const f = await fixture();
  await assert.rejects(f.sdk.contextMenu.register({actionIds: [ACTION]}), code('E_SITE_GRANT_REQUIRED'));
  await f.grant(); await f.sdk.contextMenu.unregister();
  assert.deepEqual(await f.sdk.contextMenu.register({actionIds: [ACTION]}), {registered: true, actionIds: [ACTION]});
  assert.deepEqual(f.local.get(BROWSER_MENU_GRANTS_STORE)[f.pkg.id].activeActions, [ACTION]);
  assert.equal(f.menus.get(`opendesk.tool.${f.pkg.id}.${ACTION}`).title, 'Capture selection');
  await assert.rejects(f.sdk.contextMenu.register({actionIds: ['not-declared']}), code('E_TOOL_CAPABILITY_REQUIRED'));
  f.permissions.delete('contextMenus');
  await assert.rejects(f.sdk.contextMenu.register({actionIds: [ACTION]}), code('E_CHROME_PERMISSION_REQUIRED'));
  assert.deepEqual(f.local.get(BROWSER_MENU_GRANTS_STORE)[f.pkg.id].activeActions, [ACTION]);
});

test('browser.contextMenu.unregister: clears actions and pending ticket even without Chrome permission; uninstalled owner rejects', async () => {
  const f = await fixture(); await f.launch(); f.permissions.delete('contextMenus'); f.setSite(false);
  assert.deepEqual(await f.sdk.contextMenu.unregister(), {registered: false, actionIds: []});
  assert.deepEqual(f.local.get(BROWSER_MENU_GRANTS_STORE)[f.pkg.id].activeActions, []);
  assert.equal(Object.hasOwn(f.session.get(BROWSER_MENU_LAUNCH_STORE), f.pkg.id), false);
  f.permissions.add('contextMenus'); f.setSite(true); await f.host.synchronize();
  assert.equal(f.menus.has(`opendesk.tool.${f.pkg.id}.${ACTION}`), false);
  await assert.rejects(f.sdk.launch.consume(), code('E_LAUNCH_EXPIRED'));
  f.uninstall(); await assert.rejects(f.sdk.contextMenu.unregister(), code('E_TOOL_CHANGED'));
});

for (const operation of ['browser.launch.consume', 'browser.page.getSelection']) {
  const invoke = f => operation === 'browser.launch.consume' ? f.sdk.launch.consume() : f.sdk.page.getSelection();
  test(`${operation}: real menu ticket delivers exact selection/source and consumes once without retaining selection`, async () => {
    const f = await fixture(), ticket = await f.launch();
    assert.deepEqual(await invoke(f), {ticketId: ticket.ticketId, toolId: f.pkg.id, actionId: ACTION,
      source: {url: TARGET_URL, origin: ORIGIN, tabRef: ticket.tabRef}, selection: SELECTED,
      linkUrl: null, expiresAt: ticket.expiresAt});
    const saved = f.session.get(BROWSER_MENU_LAUNCH_STORE)[f.pkg.id];
    assert.equal(saved.state, 'consumed'); assert.equal(saved.selection, null);
    assert.ok(Number.isFinite(saved.consumedAt));
    await assert.rejects(invoke(f), code('E_LAUNCH_EXPIRED'));
  });
  test(`${operation}: foreign instance, revoked Origin and stale Document cannot consume ticket`, async () => {
    const f = await fixture(); await f.launch();
    const foreign = f.sdkFor({toolInstance: '11111111-2222-4333-8444-555555555555'});
    await assert.rejects(operation === 'browser.launch.consume' ? foreign.launch.consume() : foreign.page.getSelection(),
      code('E_LAUNCH_EXPIRED'));
    f.setSite(false); await assert.rejects(invoke(f), code('E_SITE_PERMISSION_REVOKED'));
    f.setSite(true); f.document.documentId = 'replacement-document';
    await assert.rejects(invoke(f), code('E_DOCUMENT_CHANGED'));
    assert.equal(f.session.get(BROWSER_MENU_LAUNCH_STORE)[f.pkg.id].state, 'pending');
  });
}

test('browser.page.getContext: existing Side Panel returns bounded current page and explicit unavailable receipt', async t => {
  const f = await fixture(), front = await frontend(t, f);
  assert.deepEqual(await front.sdk.page.getContext(), {status: 'available', title: 'Contract form', url: TARGET_URL});
  const longUrl = TARGET_URL + '?q=' + 'x'.repeat(5000);
  front.target.snapshot = {status: 'available', title: '界'.repeat(600), url: longUrl};
  assert.deepEqual(await front.sdk.page.getContext(), {status: 'available', title: '界'.repeat(512), url: longUrl.slice(0, 4096)});
  front.target.snapshot = {status: 'unavailable', message: '页面已关闭'};
  assert.deepEqual(await front.sdk.page.getContext(), {status: 'unavailable', message: '页面已关闭'});
  assert.equal(front.messages.length, 0, 'current page receipt uses existing frontend service');
});

test('browser.page.getContext: real frontend rejects uninstalled package', async t => {
  const f = await fixture(), front = await frontend(t, f);
  f.uninstall(); await assert.rejects(front.sdk.page.getContext(), {code: 'E_TOOL', message: '工具已更新或卸载'});
});

test('browser.page.getContext: real frontend denies a package without currentPage.read', async t => {
  const f = await fixture();
  f.pkg = tool(f.pkg.id, ['browser.contextMenu']);
  f.local.set(SIDEBAR_TOOL_STORE, [f.pkg]);
  const front = await frontend(t, f);
  await assert.rejects(front.sdk.page.getContext(), code('E_TOOL_CAPABILITY_REQUIRED'));
});

for (const operation of ['browser.clipboard.writeText', 'browser.downloads.text']) {
  const args = operation === 'browser.clipboard.writeText' ? {text: '中文 export'} :
    {text: '# 中文 export', filename: 'contract.md'};
  const invoke = sdk => operation === 'browser.clipboard.writeText' ? sdk.clipboard.writeText(args.text) : sdk.downloads.text(args);
  test(`${operation}: real frontend plus one-use Host intent returns final effect receipt with exact native input`, async t => {
    const f = await fixture(), front = await frontend(t, f);
    assert.deepEqual(await invoke(front.sdk), operation === 'browser.clipboard.writeText' ? {copied: true} : {started: true});
    if (operation === 'browser.clipboard.writeText') {
      assert.deepEqual(front.copied, [args.text]); assert.equal(f.calls.downloads.length, 0);
    } else {
      assert.deepEqual(f.calls.downloads, [{url: 'data:text/markdown;charset=utf-8,' + encodeURIComponent(args.text),
        filename: args.filename, saveAs: true, conflictAction: 'uniquify'}]);
      assert.deepEqual(front.copied, []);
    }
    assert.deepEqual(front.messages.map(row => [row.kind, row.operation]), [
      ['host', 'browser.intent.confirm'], ['tool', operation]
    ]);
    const execution = front.messages[1];
    assert.match(execution.approvalRef, /^[0-9a-f-]{36}$/i);
    await assert.rejects(f.host.handleTool(execution, f.sender), code('E_USER_GESTURE_REQUIRED'));
    assert.equal(front.copied.length + f.calls.downloads.length, 1, 'no automatic replay of effects');
  });
  test(`${operation}: actual Host rejects missing, mismatched and foreign-instance intent; exact approval is single-use`, async () => {
    const f = await fixture();
    await assert.rejects(f.call(operation, args), code('E_USER_GESTURE_REQUIRED'));
    const first = await f.confirm(operation, args);
    await assert.rejects(f.call(operation, {...args, text: 'different'}, {approvalRef: first.approvalRef}), code('E_USER_GESTURE_REQUIRED'));
    await assert.rejects(f.call(operation, args, {approvalRef: first.approvalRef}), code('E_USER_GESTURE_REQUIRED'));
    const second = await f.confirm(operation, args);
    await assert.rejects(f.call(operation, args, {approvalRef: second.approvalRef,
      toolInstance: '11111111-2222-4333-8444-555555555555'}), code('E_USER_GESTURE_REQUIRED'));
    const third = await f.confirm(operation, args);
    assert.deepEqual(await f.call(operation, args, {approvalRef: third.approvalRef}), {authorized: true});
    await assert.rejects(f.call(operation, args, {approvalRef: third.approvalRef}), code('E_USER_GESTURE_REQUIRED'));
    assert.deepEqual(f.calls.downloads, [], 'SW authorization itself cannot perform frontend export');
    const fourth = await f.confirm(operation, args); f.uninstall();
    await assert.rejects(f.call(operation, args, {approvalRef: fourth.approvalRef}), code('E_TOOL_CHANGED'));
  });
}

test('browser.downloads.text: Chrome downloads permission revoked after approval rejects without a native download', async () => {
  const f = await fixture(), args = {text: 'permission probe', filename: 'contract.txt'};
  const intent = await f.confirm('browser.downloads.text', args); f.permissions.delete('downloads');
  await assert.rejects(f.call('browser.downloads.text', args, {approvalRef: intent.approvalRef}), code('E_CHROME_PERMISSION_REQUIRED'));
  assert.deepEqual(f.calls.downloads, []);
});

test('browser.events.close: actual owned observation closes; foreign owner, revoked Origin and closed ref reject', async () => {
  const f = await fixture();
  const tab = await f.approved('browser.tabs.create', {url: TARGET_URL});
  const observation = await f.approved('browser.network.observe.start',
    {tabRef: tab.tabRef, origins: [ORIGIN], durationMs: 10000, maxEvents: 10});
  const args = {sessionRef: observation.observationId};
  assert.match(args.sessionRef, /^[0-9a-f-]{36}$/i);
  assert.equal((await f.sdk.network.observe.getStatus({observationId: args.sessionRef})).state, 'running');
  await assert.rejects(f.sdkFor(f.foreignIdentity).events.close(args), code('E_OWNER'));
  f.setSite(false); await assert.rejects(f.sdk.events.close(args), code('E_SITE_PERMISSION_REVOKED'));
  f.setSite(true);
  assert.deepEqual(await f.sdk.events.close(args), {closed: true});
  assert.deepEqual(f.session.get(BROWSER_OBSERVATION_STORE), {});
  await assert.rejects(f.sdk.events.read(args), code('E_OBSERVATION_UNKNOWN'));
  await assert.rejects(f.sdk.events.close(args), code('E_OBSERVATION_UNKNOWN'));
});
