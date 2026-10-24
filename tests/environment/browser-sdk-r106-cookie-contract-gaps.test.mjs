import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

// Select product sources only. This new driver never writes into the candidate.
const sourceRoot = resolve(process.env.BROWSER_SDK_CONTRACT_SOURCE_ROOT ||
  fileURLToPath(new URL('../../', import.meta.url)));
const product = path => import(pathToFileURL(resolve(sourceRoot, path)).href);
const [{createContextMenuHost}, {createBrowserSdk},
 {validateSidebarToolPackage, sidebarToolPackageHash, serializeSidebarToolPackage}] = await Promise.all([
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
  url: 'chrome-extension://cookie-contract-ext/sidepanel.html?hostInstanceId=' + instance
};

const grantsKey = 'opendesk.browser.context-menu-grants.v1';
const installedKey = 'opendesk.sidebar-tools.installed.v1';
const provenanceKey = 'opendesk.market.provenance.v1';
const epochsKey = 'opendesk.sidebar-tools.revocation-epochs.v1';
const enabledKey = 'opendesk.sidebar-tools.enabled.v1';
// Read only the existing official package; do not rebuild or promote it.
const official = validateSidebarToolPackage(JSON.parse(await readFile(resolve(sourceRoot,
  'examples/sidebar-tools/cookie-editor/cookie-editor.opendesk-tool.json'), 'utf8')));
const officialBytes = Buffer.from(serializeSidebarToolPackage(official));
const release = {id: 'opendesk/cookie-editor', toolId: official.id, kind: 'sidebar-tool',
  installationPolicy: 'optional', version: official.version, packageTitle: official.title,
  description: official.description, capabilities: official.capabilities,
  packagePath: 'official-tools/cookie-editor/cookie-editor.opendesk-tool.json',
  bytes: officialBytes.length, sha256: createHash('sha256').update(officialBytes).digest('hex')};
const officialOwner = {...identity, toolId: official.id, toolVersion: official.version,
  packageHash: await sidebarToolPackageHash(official)};

function fixture({tool = pkg, owner = identity} = {}) {
  const local = new Map([[installedKey, [tool]]]);
  const session = new Map(), storageListeners = [], cookieListeners = [], native = [];
  const state = {cookiesAllowed: true, siteAllowed: true, allowedOrigins: [origin],
    stores: [{id: '0', tabIds: [10], incognito: false},
      {id: 'foreign-store', tabIds: [99], incognito: false}]};
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
      : state.siteAllowed && origins.length === 1 && state.allowedOrigins.some(site => origins[0] === site + '/*')},
    tabs: {query: async () => [tab]},
    webNavigation: {getFrame: async () => ({url: tab.url, documentId: document.documentId,
      documentLifecycle: 'active'})},
    cookies: {
      onChanged: {addListener: listener => cookieListeners.push(listener)},
      getAllCookieStores: callback => {
        native.push('getAllCookieStores');
        callback(structuredClone(state.stores));
      },
      getPartitionKey: (_details, callback) => {
        native.push('getPartitionKey'); callback({partitionKey: {topLevelSite: new URL(tab.url).origin, hasCrossSiteAncestor: false}});
      },
      getAll: (_details, callback) => {native.push('getAll'); callback([{...cookie}]);},
      set: () => {native.push('set'); throw Error('These contracts must not write Cookies');},
      remove: () => {native.push('remove'); throw Error('These contracts must not remove Cookies');}
    }
  };
  const fetchImpl = async resource => new URL(resource).protocol === 'chrome-extension:'
    ? new Response(JSON.stringify({schema: 'opendesk.official-tools.releases.v1',
      sourceRepository: 'https://github.com/shopable-ai/opendesk-browser', apps: [release]}))
    : new Response('', {status: 404}); // Optional remote release is absent in this offline fixture.
  const rebuild = () => createContextMenuHost({api, logger: {warn() {}}, fetchImpl,
    lockManager: {request: (_key, work) => work()}});
  let host = rebuild();
  const call = (operation, args, approvalRef, as = {}, from = sender) => host.handleTool({
    ...owner, ...as, operation, args, ...(approvalRef ? {approvalRef} : {})
  }, from);
  const confirm = (operation, args) => host.handleHost({
    ...owner, operation: 'browser.intent.confirm',
    targetOperation: operation, targetArgs: args
  }, sender);
  const sdk = createBrowserSdk({request: async (operation, args) => {
    const approvalRef = operation === 'browser.cookies.observe.start'
      ? (await confirm(operation, args)).approvalRef : undefined;
    return call(operation, args, approvalRef);
  }});
  const grant = (capability, enabled = true) => host.handleHost({
    ...owner, operation: 'browser.cookies.userGrant',
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
  const grantAll = (enabled = true, changes = {}, from = sender) => host.handleHost({
    ...owner, operation: 'browser.cookies.userGrant', scope: 'all-http-sites',
    cookieCapability: 'all', enabled, ...(enabled ? {document} : {}), ...changes
  }, from);
  const navigate = target => {
    tab.url = target; document.url = target; document.origin = new URL(target).origin;
    document.documentId += '-next'; cookie.domain = new URL(target).hostname;
  };
  return {sdk, get host() {return host;}, call, confirm, grant, grantAll, denied, emit, state, native,
    local, api, tab, document, navigate, restart: () => {host = rebuild();}};
}

const officialFixture = () => {
  const f = fixture({tool: official, owner: officialOwner});
  f.local.set(provenanceKey, {[official.id]: {marketId: release.id,
    version: release.version, sha256: release.sha256}});
  return f;
};

test('explicit official all-http-sites grant is atomic, covers A/B/C and survives a rebuilt Host', async () => {
  const f = officialFixture();
  const targets = [url, 'https://second.example.net/account', 'http://third.example.org/account'];
  f.state.allowedOrigins = targets.map(target => new URL(target).origin);
  let writes = 0;
  const set = f.api.storage.local.set;
  f.api.storage.local.set = async values => {if (Object.hasOwn(values, grantsKey)) writes++; await set(values);};
  assert.equal((await f.grantAll()).scope, 'all-http-sites');
  const saved = structuredClone(f.local.get(grantsKey));
  const row = saved[official.id], grant = row.cookieAllSites;
  assert.equal(row.version, official.version);
  assert.equal(row.packageHash, officialOwner.packageHash);
  assert.equal(row.installEpoch, null);
  // Ordinary all-site consent must not silently reveal sensitive Cookie values.
  for (const cap of ['read', 'write', 'observe', 'clear']) assert.equal(grant[cap], true);
  assert.equal(grant.values, false);
  assert.equal(grant.valueConsent, false);
  assert.equal(grant.storeId, '0'); assert.match(grant.grantEpoch, /^[0-9a-f-]{36}$/i);
  assert.equal(row.cookieSites, undefined);
  const queries = [];
  const getAll = f.api.cookies.getAll;
  f.api.cookies.getAll = (details, callback) => {queries.push(details); getAll(details, callback);};
  for (const target of targets) {
    f.navigate(target);
    assert.deepEqual(await f.sdk.cookies.getCurrentStore({url: target}), {storeId: '0'});
    assert.deepEqual(await f.sdk.cookies.getPartitionKey({url: target}),
      {partitionKey: {topLevelSite: new URL(target).origin, hasCrossSiteAncestor: false}});
    const rows = await f.sdk.cookies.getAll({url: target});
    assert.equal(rows.length, 1);
    await f.denied(() => f.sdk.cookies.getAll({url: target, includeValues: true}),
      'E_COOKIE_VALUES_REQUIRED');
    const status = await f.sdk.capabilities.getStatus({operation: 'browser.cookies.getCurrentStore', url: target});
    assert.equal(status.authorization.site, 'granted');
    f.restart();
  }
  assert.equal(writes, 1, 'Navigation and worker restarts must not ask for another grant');
  assert.deepEqual(f.local.get(grantsKey), saved);
  assert(queries.length >= 3 && queries.every(query => targets.includes(query.url) && query.storeId === '0'));
  // Only the separate trusted values action can upgrade this grant.
  assert.equal((await f.grantAll(true, {cookieCapability: 'values'})).capability, 'values');
  const withValues = f.local.get(grantsKey)[official.id].cookieAllSites;
  assert.equal(withValues.values, true);
  assert.equal(withValues.valueConsent, true);
  assert.notEqual(withValues.grantEpoch, grant.grantEpoch);
  assert.equal(writes, 2, 'Sensitive values require a separate persisted Host grant');
  f.restart();
  const rowsWithValues = await f.sdk.cookies.getAll({url: f.tab.url, includeValues: true});
  assert.equal(rowsWithValues[0].value, 'NODE_FIXTURE_SECRET');
  assert.throws(() => f.sdk.cookies.getAll({}));
  assert.throws(() => f.sdk.cookies.getAll({url: 'file:///tmp/private'}));
});

test('unconfirmed first-click storage readback never returns a successful consent receipt', async () => {
  const f = officialFixture();
  const get = f.api.storage.local.get;
  f.api.storage.local.get = async keys => {
    const read = await get(keys);
    // ReadSources uses a list of keys, whereas the confirmed write reads its
    // single grant key. A stale independent read must not be acknowledged.
    if (keys === grantsKey && Object.hasOwn(read, grantsKey))
      return {[grantsKey]: {}};
    return read;
  };
  await assert.rejects(f.grantAll(), {code: 'E_OUTCOME_UNKNOWN'});
  const saved = f.local.get(grantsKey)[official.id].cookieAllSites;
  assert.equal(saved.values, true, 'Actual storage may have changed despite unknown acknowledgement');
  assert.equal(saved.valueConsent, true);
});

test('all-http-sites retains real Chrome permissions, regular Store and real document Partition fences', async () => {
  const f = officialFixture(); await f.grantAll();
  f.state.siteAllowed = false;
  await f.denied(() => f.sdk.cookies.getCurrentStore({url}), 'E_SITE_PERMISSION_REVOKED');
  f.state.siteAllowed = true; f.state.cookiesAllowed = false;
  await f.denied(() => f.sdk.cookies.getCurrentStore({url}), 'E_CHROME_PERMISSION_REQUIRED');
  f.state.cookiesAllowed = true;
  await f.denied(() => f.sdk.cookies.getCurrentStore({url, storeId: 'foreign-store'}), 'E_COOKIE_STORE');
  f.state.stores[0].incognito = true;
  await assert.rejects(f.sdk.cookies.getCurrentStore({url}), {code: 'E_COOKIE_STORE'});
  f.state.stores[0].incognito = false;
  await assert.rejects(f.sdk.cookies.getAll({url, partitionKey: {topLevelSite: 'https://foreign.test'}}),
    {code: 'E_COOKIE_PARTITION'});
  await assert.rejects(f.sdk.cookies.getAll({url, partitionKey: {...partitionKey, hasCrossSiteAncestor: true}}),
    {code: 'E_COOKIE_PARTITION'});
  const receipt = await f.sdk.cookies.getPartitionKey({url});
  await f.sdk.cookies.getAll({url, partitionKey: receipt.partitionKey});
  f.tab.incognito = true;
  await assert.rejects(f.sdk.cookies.getPartitionKey({url}), {code: 'E_COOKIE_PARTITION'});
  await assert.rejects(f.grantAll(), {code: 'E_DOCUMENT_CHANGED'});
});

test('all-http-sites revoke rotates epoch, persists and invalidates existing Cookie intent', async () => {
  const f = officialFixture(); await f.grantAll();
  const before = f.local.get(grantsKey)[official.id].cookieAllSites.grantEpoch;
  const args = {url, durationMs: 15000, maxEvents: 2};
  const approval = await f.confirm('browser.cookies.observe.start', args);
  await f.grantAll(false);
  const revoked = f.local.get(grantsKey)[official.id].cookieAllSites;
  assert.notEqual(revoked.grantEpoch, before);
  for (const cap of ['read', 'values', 'write', 'observe', 'clear']) assert.equal(revoked[cap], false);
  f.restart();
  await f.denied(() => f.sdk.cookies.getAll({url}), 'E_SITE_GRANT_REQUIRED');
  await f.grantAll();
  // The pre-restart intent cannot survive a Host restart either.
  await assert.rejects(f.call('browser.cookies.observe.start', args, approval.approvalRef),
    {code: 'E_USER_GESTURE_REQUIRED'});
  const current = await f.confirm('browser.cookies.observe.start', args);
  await f.grantAll(false); await f.grantAll();
  await assert.rejects(f.call('browser.cookies.observe.start', args, current.approvalRef),
    {code: 'E_GRANT_REVOKED'});
});

test('all-site revoke atomically clears legacy Cookie sites for only the revoked tool', async () => {
  const f = officialFixture();
  await f.grant('read'); await f.grant('values'); await f.grant('observe');
  await f.grantAll();
  const saved = f.local.get(grantsKey);
  assert.equal(saved[official.id].cookieSites[origin].read, true);
  saved[official.id].bookmarkFull = true;
  saved[official.id].origins = [origin];
  saved[pkg.id] = {version: pkg.version, packageHash: identity.packageHash, installEpoch: null,
    cookieSites: {[origin]: {read: true, storeId: '0', grantEpoch: 'other-tool-grant'}}};
  const other = structuredClone(saved[pkg.id]);
  const writes = [], set = f.api.storage.local.set;
  f.api.storage.local.set = async values => {
    if (Object.hasOwn(values, grantsKey)) writes.push(structuredClone(values[grantsKey]));
    await set(values);
  };
  await f.grantAll(false);
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0][official.id].cookieSites, {});
  assert.equal(writes[0][official.id].cookieAllSites.read, false);
  assert.equal(writes[0][official.id].bookmarkFull, true);
  assert.deepEqual(writes[0][official.id].origins, [origin]);
  assert.deepEqual(writes[0][pkg.id], other);
  await f.denied(() => f.sdk.cookies.getAll({url, includeValues: true}), 'E_SITE_GRANT_REQUIRED');
  await f.denied(() => f.sdk.cookies.getCurrentStore({url}), 'E_SITE_GRANT_REQUIRED');
  f.restart();
  await f.denied(() => f.sdk.cookies.getCurrentStore({url}), 'E_SITE_GRANT_REQUIRED');
});

test('legacy single-site consent does not upgrade and ordinary tools cannot inherit official all-site rights', async () => {
  const f = officialFixture(); await f.grant('read');
  f.state.allowedOrigins.push('https://second.example.net');
  await f.sdk.cookies.getCurrentStore({url});
  await f.denied(() => f.sdk.cookies.getCurrentStore({url: 'https://second.example.net/'}), 'E_SITE_GRANT_REQUIRED');
  assert.equal(f.local.get(grantsKey)[official.id].cookieAllSites, undefined);
  await assert.rejects(f.grantAll(true, {scope: undefined}), {code: 'E_SCHEMA'});
  await assert.rejects(f.grantAll(true, {cookieCapability: 'read'}), {code: 'E_SCHEMA'});
  const ordinary = fixture();
  await assert.rejects(ordinary.grantAll(), {code: 'E_OWNER'});
  await assert.rejects(ordinary.grant('all'), {code: 'E_TOOL_CAPABILITY_REQUIRED'});
  await ordinary.grant('read');
  assert.equal(ordinary.local.get(grantsKey)[pkg.id].cookieSites[origin].read, true);
  await f.grantAll();
  ordinary.local.set(grantsKey, {[pkg.id]: {...f.local.get(grantsKey)[official.id],
    version: pkg.version, packageHash: identity.packageHash, cookieSites: {}}});
  await ordinary.denied(() => ordinary.sdk.cookies.getCurrentStore({url}), 'E_SITE_GRANT_REQUIRED');
  await ordinary.denied(() => ordinary.sdk.cookies.getAll({url, includeValues: true}), 'E_SITE_GRANT_REQUIRED');
});

test('all-site consent rejects forged Sender, identity, provenance and same-ID altered packages', async () => {
  const f = officialFixture();
  await assert.rejects(f.grantAll(true, {}, {...sender, url: 'https://foreign.test/'}), {code: 'E_OWNER'});
  await assert.rejects(f.grantAll(true, {packageHash: '0'.repeat(64)}), {code: 'E_TOOL_CHANGED'});
  await assert.rejects(f.grantAll(true, {installEpoch: 'foreign'}), {code: 'E_TOOL_CHANGED'});
  f.local.delete(provenanceKey);
  await assert.rejects(f.grantAll(), {code: 'E_OWNER'});
  f.local.set(provenanceKey, {[official.id]: {marketId: release.id, version: release.version, sha256: '0'.repeat(64)}});
  await assert.rejects(f.grantAll(), {code: 'E_OWNER'});
  const altered = validateSidebarToolPackage({...official, js: official.js + '\nvoid 1;'});
  const bad = fixture({tool: altered, owner: {...officialOwner, packageHash: await sidebarToolPackageHash(altered)}});
  bad.local.set(provenanceKey, {[official.id]: {marketId: release.id, version: release.version, sha256: release.sha256}});
  await assert.rejects(bad.grantAll(), {code: 'E_OWNER'});
  assert.equal(bad.local.get(grantsKey), undefined);
});

test('all-site consumption rechecks enabled state, install epoch, package and capability boundaries', async () => {
  const f = officialFixture(); await f.grantAll();
  f.local.set(enabledKey, {[official.id]: false});
  await f.denied(() => f.sdk.cookies.getCurrentStore({url}), 'E_TOOL_DISABLED');
  f.local.delete(enabledKey);
  f.local.set(epochsKey, {[official.id]: 'new-install'});
  await f.denied(() => f.sdk.cookies.getCurrentStore({url}), 'E_TOOL_CHANGED');
  await f.denied(() => f.call('browser.cookies.getCurrentStore', {url}, undefined,
    {installEpoch: 'new-install'}), 'E_SITE_GRANT_REQUIRED');
  f.local.delete(epochsKey);
  const altered = validateSidebarToolPackage({...official, js: official.js + '\nvoid 2;'});
  const alteredHash = await sidebarToolPackageHash(altered);
  f.local.set(installedKey, [altered]);
  await f.denied(() => f.sdk.cookies.getCurrentStore({url}), 'E_TOOL_CHANGED');
  await f.denied(() => f.call('browser.cookies.getCurrentStore', {url}, undefined,
    {packageHash: alteredHash}), 'E_SITE_GRANT_REQUIRED');
  const narrow = validateSidebarToolPackage({...official,
    capabilities: official.capabilities.filter(cap => cap !== 'browser.cookies.values')});
  const narrowHash = await sidebarToolPackageHash(narrow);
  f.local.set(installedKey, [narrow]);
  await f.denied(() => f.call('browser.cookies.getAll', {url, includeValues: true}, undefined,
    {packageHash: narrowHash}), 'E_SITE_GRANT_REQUIRED');
});

test('preserved Cookie grants follow installation lifecycle while disabled and stale-epoch callers remain denied', async () => {
  const f = officialFixture(); await f.grantAll();
  const epoch = 'installation-preserved-grant-epoch';
  // The existing installer preserves valid same-package grants across STOP /
  // resume by rebinding their installEpoch, rather than erasing user consent.
  f.local.get(grantsKey)[official.id].installEpoch = epoch;
  f.local.set(epochsKey, {[official.id]: epoch});
  f.local.set(enabledKey, {[official.id]: false});
  await f.denied(() => f.call('browser.cookies.getCurrentStore', {url}, undefined,
    {installEpoch: epoch}), 'E_TOOL_DISABLED');
  f.local.set(enabledKey, {[official.id]: true});
  await f.denied(() => f.sdk.cookies.getCurrentStore({url}), 'E_TOOL_CHANGED');
  assert.deepEqual(await f.call('browser.cookies.getCurrentStore', {url}, undefined,
    {installEpoch: epoch}), {storeId: '0'});
});

test('all-site consumption requires separate read/values/write bits and current official provenance', async () => {
  const f = officialFixture(); await f.grantAll();
  const grant = f.local.get(grantsKey)[official.id].cookieAllSites;
  grant.values = false;
  await f.denied(() => f.sdk.cookies.getAll({url, includeValues: true}), 'E_COOKIE_VALUES_REQUIRED');
  grant.values = true; grant.read = false;
  await f.denied(() => f.sdk.cookies.getAll({url}), 'E_SITE_GRANT_REQUIRED');
  grant.read = true; grant.write = false;
  await f.denied(() => f.confirm('browser.cookies.set', {url, name: 'blocked', value: 'SECRET'}),
    'E_SITE_GRANT_REQUIRED');
  grant.write = true;
  f.local.delete(provenanceKey);
  await f.denied(() => f.sdk.cookies.getAll({url}), 'E_SITE_GRANT_REQUIRED');
});

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
