import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

// Select product sources only. This new driver never writes into the candidate.
const sourceRoot = resolve(process.env.BROWSER_SDK_CONTRACT_SOURCE_ROOT ||
  fileURLToPath(new URL('../../', import.meta.url)));
const product = path => import(pathToFileURL(resolve(sourceRoot, path)).href);
const [{createContextMenuHost}, {createBrowserSdk},
  {validateSidebarToolPackage, sidebarToolPackageHash}] = await Promise.all([
  product('src/platform/chrome/context-menus.js'),
  product('src/framework/sdk/browser.js'),
  product('src/ui/sidebar-tools/package.js')
]);

const instance = '01234567-89ab-4def-8123-456789abcdef';
const foreignInstance = '11234567-89ab-4def-8123-456789abcdef';
const origin = 'https://shop.example.test';
const url = origin + '/account';
const partitionKey = {topLevelSite: origin, hasCrossSiteAncestor: false};
const pkg = validateSidebarToolPackage({
  format: 'opendesk.sidebar-tool.v2', id: 'cookie-contract-probe', version: '1.0.0',
  title: 'Cookie contract probe', description: 'Scoped installed Cookie contracts',
  capabilities: ['browser.cookies.read', 'browser.cookies.observe'],
  html: '<main>Cookie contracts</main>', css: '', js: 'void 0;',
  requires: {browserSdk: '1.0.0'}, contributes: {contextMenus: []}
});
const identity = {
  toolId: pkg.id, toolVersion: pkg.version, toolInstance: instance,
  hostInstanceId: instance, installEpoch: null,
  packageHash: await sidebarToolPackageHash(pkg)
};
const sender = {
  id: 'cookie-contract-ext', frameId: 0, documentId: 'host-document',
  documentLifecycle: 'active',
  url: 'chrome-extension://cookie-contract-ext/ui/tool.html?hostInstanceId=' + instance
};

function fixture() {
  const local = new Map([['opendesk.sidebar-tools.installed.v1', [pkg]]]);
  const session = new Map(), storageListeners = [], cookieListeners = [], native = [];
  const state = {cookiesAllowed: true, siteAllowed: true};
  const tab = {id: 10, windowId: 3, url, active: true, incognito: false, status: 'complete'};
  const document = {tabId: 10, windowId: 3, documentId: 'website-document', url, origin};
  const cookie = {
    name: 'sid', value: 'NODE_FIXTURE_SECRET', domain: 'shop.example.test', path: '/',
    storeId: '0', hostOnly: true, secure: true, httpOnly: true, session: true
  };
  const storage = (map, area) => ({
    get: async keys => Object.fromEntries((Array.isArray(keys) ? keys : [keys])
      .map(key => [key, structuredClone(map.get(key))])),
    set: async values => {
      const changes = {};
      for (const [key, value] of Object.entries(values)) {
        changes[key] = {oldValue: map.get(key), newValue: structuredClone(value)};
        map.set(key, structuredClone(value));
      }
      for (const listener of storageListeners) listener(changes, area);
    }
  });
  // Chrome callbacks are component fixtures; SDK, Dispatcher, Authority and
  // executeInstalled use real product code, not a request-result stub.
  const api = {
    runtime: {
      id: sender.id, lastError: null,
      getURL: path => 'chrome-extension://' + sender.id + '/' + path
    },
    storage: {
      local: storage(local, 'local'), session: storage(session, 'session'),
      onChanged: {addListener: listener => storageListeners.push(listener)}
    },
    permissions: {contains: async ({permissions, origins}) => permissions
      ? state.cookiesAllowed && permissions.every(permission => permission === 'cookies')
      : state.siteAllowed && origins.length === 1 && origins[0] === origin + '/*'},
    tabs: {query: async () => [tab]},
    webNavigation: {getFrame: async () => ({url, documentId: document.documentId,
      documentLifecycle: 'active'})},
    cookies: {
      onChanged: {addListener: listener => cookieListeners.push(listener)},
      getAllCookieStores: callback => {
        native.push('getAllCookieStores');
        callback([{id: '0', tabIds: [10], incognito: false},
          {id: 'foreign-store', tabIds: [99], incognito: false}]);
      },
      getPartitionKey: (_details, callback) => {
        native.push('getPartitionKey'); callback({partitionKey: {...partitionKey}});
      },
      getAll: (_details, callback) => {native.push('getAll'); callback([{...cookie}]);},
      set: () => {native.push('set'); throw Error('These contracts must not write Cookies');},
      remove: () => {native.push('remove'); throw Error('These contracts must not remove Cookies');}
    }
  };
  const host = createContextMenuHost({api, logger: {warn() {}},
    lockManager: {request: (_key, work) => work()}});
  const call = (operation, args, approvalRef, as = {}, from = sender) => host.handleTool({
    ...identity, ...as, operation, args, ...(approvalRef ? {approvalRef} : {})
  }, from);
  const confirm = (operation, args) => host.handleHost({
    ...identity, operation: 'browser.intent.confirm',
    targetOperation: operation, targetArgs: args
  }, sender);
  const sdk = createBrowserSdk({request: async (operation, args) => {
    const approvalRef = operation === 'browser.cookies.observe.start'
      ? (await confirm(operation, args)).approvalRef : undefined;
    return call(operation, args, approvalRef);
  }});
  const grant = (capability, enabled = true) => host.handleHost({
    ...identity, operation: 'browser.cookies.userGrant',
    cookieCapability: capability, enabled, origin, ...(enabled ? {document} : {})
  }, sender);
  const denied = async (request, code) => {
    const before = [...native], cookieBefore = structuredClone(cookie);
    await assert.rejects(request, {code});
    assert.deepEqual(native, before, 'Denied operation must not call native Cookies');
    assert.deepEqual(cookie, cookieBefore, 'Denied operation must not change Cookie data');
  };
  const emit = () => {
    for (const listener of cookieListeners)
      listener({cookie: {...cookie}, removed: false, cause: 'explicit'});
  };
  return {sdk, host, call, confirm, grant, denied, emit, state, native};
}

test('browser.cookies.getCurrentStore: installed SDK returns exact Store and denies permission, Origin and identity', async () => {
  const f = fixture(), operation = 'browser.cookies.getCurrentStore';
  await f.denied(() => f.sdk.cookies.getCurrentStore({url}), 'E_SITE_GRANT_REQUIRED');
  await f.grant('read');
  const before = [...f.native];
  assert.deepEqual(await f.sdk.cookies.getCurrentStore({url}), {storeId: '0'});
  assert.deepEqual(f.native, before, 'Store receipt must not enumerate native Cookie values');
  await f.denied(() => f.sdk.cookies.getCurrentStore({url, storeId: 'foreign-store'}), 'E_COOKIE_STORE');
  await f.denied(() => f.sdk.cookies.getCurrentStore({url: 'https://foreign.test/account'}), 'E_SITE_PERMISSION_REVOKED');
  await f.denied(() => f.call(operation, {url}, undefined, {installEpoch: 'stale-epoch'}), 'E_TOOL_CHANGED');
  await f.denied(() => f.call(operation, {url}, undefined, {}, {...sender, url: 'https://foreign.test/'}), 'E_OWNER');
  f.state.cookiesAllowed = false;
  await f.denied(() => f.sdk.cookies.getCurrentStore({url}), 'E_CHROME_PERMISSION_REQUIRED');
});

test('browser.cookies.getPartitionKey: installed SDK returns exact Partition and denies permission, Origin and identity', async () => {
  const f = fixture(), operation = 'browser.cookies.getPartitionKey';
  await f.denied(() => f.sdk.cookies.getPartitionKey({url}), 'E_SITE_GRANT_REQUIRED');
  await f.grant('read');
  const before = [...f.native];
  assert.deepEqual(await f.sdk.cookies.getPartitionKey({url}), {partitionKey});
  assert.deepEqual(f.native, before, 'Partition receipt must not read native Cookie values');
  await f.denied(() => f.sdk.cookies.getPartitionKey({url,
    partitionKey: {topLevelSite: 'https://foreign.test', hasCrossSiteAncestor: false}}), 'E_COOKIE_PARTITION');
  await f.denied(() => f.sdk.cookies.getPartitionKey({url: 'https://foreign.test/account'}), 'E_SITE_PERMISSION_REVOKED');
  await f.denied(() => f.call(operation, {url}, undefined, {packageHash: '0'.repeat(64)}), 'E_TOOL_CHANGED');
  await f.denied(() => f.call(operation, {url}, undefined, {}, {...sender, url: 'https://foreign.test/'}), 'E_OWNER');
  f.state.cookiesAllowed = false;
  await f.denied(() => f.sdk.cookies.getPartitionKey({url}), 'E_CHROME_PERMISSION_REQUIRED');
});

test('browser.cookies.observe.start: installed SDK starts a bounded session and denies missing intent, permission, Origin and identity', async () => {
  const f = fixture(), operation = 'browser.cookies.observe.start';
  const args = {url, durationMs: 15000, maxEvents: 2};
  await f.grant('observe');
  await f.denied(() => f.call(operation, args), 'E_USER_GESTURE_REQUIRED');
  const before = Date.now(), started = await f.sdk.cookies.observe.start(args), after = Date.now();
  assert.match(started.sessionRef, /^[0-9a-f-]{36}$/i);
  assert.deepEqual(started, {sessionRef: started.sessionRef, expiresAt: started.expiresAt, status: 'running'});
  assert(Number.isSafeInteger(started.expiresAt));
  assert(started.expiresAt >= before + 15000 && started.expiresAt <= after + 15000);
  f.emit(); f.emit(); f.emit();
  assert.deepEqual(await f.sdk.cookies.observe.getStatus({url, sessionRef: started.sessionRef}), {
    sessionRef: started.sessionRef, status: 'running', bufferedCount: 2,
    droppedCount: 1, expiresAt: started.expiresAt
  });
  const read = await f.sdk.cookies.observe.read({url, sessionRef: started.sessionRef});
  assert.equal(read.events.length, 2);
  assert(!JSON.stringify(read).includes('NODE_FIXTURE_SECRET'));
  let approval = (await f.confirm(operation, args)).approvalRef;
  await f.denied(() => f.call(operation, args, approval, {toolInstance: foreignInstance}), 'E_USER_GESTURE_REQUIRED');
  approval = (await f.confirm(operation, args)).approvalRef;
  await f.denied(() => f.call(operation, args, approval, {packageHash: '0'.repeat(64)}), 'E_TOOL_CHANGED');
  approval = (await f.confirm(operation, args)).approvalRef;
  f.state.siteAllowed = false;
  await f.denied(() => f.call(operation, args, approval), 'E_SITE_PERMISSION_REVOKED');
  f.state.siteAllowed = true;
  approval = (await f.confirm(operation, args)).approvalRef;
  f.state.cookiesAllowed = false;
  await f.denied(() => f.call(operation, args, approval), 'E_CHROME_PERMISSION_REQUIRED');
  f.state.cookiesAllowed = true;
  assert.equal((await f.sdk.cookies.observe.getStatus({url, sessionRef: started.sessionRef})).bufferedCount, 2,
    'Denied starts must preserve the existing owner session');
  approval = (await f.confirm(operation, args)).approvalRef;
  await f.grant('observe', false);
  await f.denied(() => f.call(operation, args, approval), 'E_SITE_GRANT_REQUIRED');
});

test('browser.cookies.observe.stop: installed SDK stops only the exact session and denies permission, Origin and foreign Owner without retiring it', async () => {
  const f = fixture(), operation = 'browser.cookies.observe.stop';
  await f.grant('observe');
  const started = await f.sdk.cookies.observe.start({url, durationMs: 15000, maxEvents: 2});
  const args = {url, sessionRef: started.sessionRef};
  f.emit();
  const before = await f.sdk.cookies.observe.getStatus(args);
  await f.denied(() => f.call(operation, args, undefined, {toolInstance: foreignInstance}), 'E_SESSION_EXPIRED');
  await f.denied(() => f.sdk.cookies.observe.stop({...args, url: origin + '/another-document'}), 'E_SESSION_EXPIRED');
  await f.denied(() => f.sdk.cookies.observe.stop({...args, url: 'https://foreign.test/account'}), 'E_SITE_PERMISSION_REVOKED');
  await f.denied(() => f.call(operation, args, undefined, {installEpoch: 'stale-epoch'}), 'E_TOOL_CHANGED');
  await f.denied(() => f.call(operation, args, undefined, {}, {...sender, url: 'https://foreign.test/'}), 'E_OWNER');
  f.state.cookiesAllowed = false;
  await f.denied(() => f.sdk.cookies.observe.stop(args), 'E_CHROME_PERMISSION_REQUIRED');
  f.state.cookiesAllowed = true;
  assert.deepEqual(await f.sdk.cookies.observe.getStatus(args), before,
    'Denied stops must not retire or consume the owner session');
  const nativeBeforeStop = [...f.native];
  assert.deepEqual(await f.sdk.cookies.observe.stop(args), {stopped: true});
  assert.deepEqual(f.native, nativeBeforeStop, 'Stop retires observation, never mutates Cookies');
  await f.denied(() => f.sdk.cookies.observe.stop(args), 'E_SESSION_EXPIRED');
  f.emit();
  await f.denied(() => f.sdk.cookies.observe.getStatus(args), 'E_SESSION_EXPIRED');
});
