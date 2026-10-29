import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createContextMenuHost} from '../../src/platform/chrome/context-menus.js';
import {createBrowserSdk} from '../../src/framework/sdk/browser.js';
import {sidebarToolRequestTimeout} from '../../src/sidebar-tools/bridge.js';
import {BROWSER_MENU_GRANTS_STORE, BROWSER_OPERATIONS} from '../../src/framework/sdk/browser-contract.js';
import {operationSchemas, validateDirectBrowserValue} from '../../src/framework/sdk/browser-schemas.js';
import {validateSidebarToolPackage, sidebarToolPackageHash, SIDEBAR_TOOL_STORE} from '../../src/ui/sidebar-tools/package.js';
import {SIDEBAR_TOOL_ENABLE_STORE, TOOL_REVOCATION_EPOCHS_STORE} from '../../src/ui/sidebar-tools/lifecycle.js';

// Real SDK/Registry/Host/refs/collector integration with mocked Chrome primitives.
// This is Node evidence, not proof of execution in an installed Chrome extension.
const uid = '01234567-89ab-4def-8123-456789abcdef';
const otherUid = '11111111-1111-4111-8111-111111111111';
const origin = 'https://example.test';
const operation = 'browser.page.readEnvironment';
const consentOperation = 'browser.page.environmentConsent';
const capability = 'browser.page.environment.read';
const sender = {id: 'environment-host-test', frameId: 0, documentId: 'side-panel-document',
  documentLifecycle: 'active',
  url: 'chrome-extension://environment-host-test/sidepanel.html?hostInstanceId=' + uid};
const codeIs = code => error => error?.code === code;
const refArgs = page => ({tabRef: page.tabRef, documentRef: page.documentRef});
const field = value => ({status: 'available', value, reasonCode: null});
const expectedFields = {
  userAgent: field('page-agent'), languages: field(['zh-CN', 'en']), timeZone: field('Asia/Shanghai'),
  viewport: field({width: 900, height: 700}), screen: field({width: 1920, height: 1080}),
  devicePixelRatio: field(2)
};

for (const toolId of ['environment-probe', 'browser-fingerprint'])
  test(`environment read reserves 100000ms for trusted review and collection for ${toolId}`, () => {
    assert.equal(sidebarToolRequestTimeout(operation, toolId), 100000);
  });

for (const name of ['browser.page.getContext', 'browser.page.getSelection',
  'browser.capabilities.getStatus', 'storage.get'])
  test(`${name} retains the ordinary 8000ms bridge timeout`, () => {
    assert.equal(sidebarToolRequestTimeout(name, 'environment-probe'), 8000);
  });

test('existing user-gesture browser operation retains its 120000ms approval timeout', () => {
  assert.equal(sidebarToolRequestTimeout('browser.tabs.create', 'environment-probe'), 120000);
});

async function fixture({caps = ['currentPage.read', capability]} = {}) {
  const pkg = validateSidebarToolPackage({format: 'opendesk.sidebar-tool.v2', id: 'environment-probe',
    version: '1.0.0', title: 'Environment probe', description: 'Page environment Host integration fixture',
    capabilities: caps, html: '<main>probe</main>', css: '', js: 'void 0;',
    requires: {browserSdk: '1.0.0'}, contributes: {contextMenus: []}});
  const identity = {toolId: pkg.id, toolVersion: pkg.version, packageHash: await sidebarToolPackageHash(pkg),
    installEpoch: 'epoch-1', hostInstanceId: uid, toolInstance: uid};
  const local = new Map([[SIDEBAR_TOOL_STORE, [pkg]], [TOOL_REVOCATION_EPOCHS_STORE, {[pkg.id]: 'epoch-1'}]]);
  const storage = map => ({
    get: async keys => Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(key => [key, structuredClone(map.get(key))])),
    set: async values => {for (const [key, value] of Object.entries(values)) map.set(key, structuredClone(value));}
  });
  const state = {tab: {id: 42, windowId: 7, active: true, incognito: false, status: 'complete',
    url: origin + '/page', title: 'Chrome title'}, documentId: 'page-document-1',
    siteAllowed: true, scriptingAllowed: true, afterExecute: null};
  const injections = [];
  const api = {
    runtime: {id: sender.id, getURL: path => 'chrome-extension://' + sender.id + '/' + path,
      getContexts: async () => [{contextType: 'SIDE_PANEL', documentId: sender.documentId,
        documentUrl: sender.url, frameId: 0, incognito: false}]},
    storage: {local: storage(local), session: storage(new Map()), onChanged: {addListener() {}}},
    permissions: {contains: async ({permissions, origins}) => permissions
      ? permissions.every(permission => permission !== 'scripting' || state.scriptingAllowed)
      : state.siteAllowed && origins?.length === 1 &&
        // Chrome match patterns omit ports; environmentSites still binds the exact origin.
        origins[0] === `${new URL(state.tab.url).protocol}//${new URL(state.tab.url).hostname}/*`},
    tabs: {query: async ({active, windowId}) => active && windowId === state.tab.windowId ? [{...state.tab}] : []},
    webNavigation: {getFrame: async ({tabId, frameId}) => tabId === state.tab.id && frameId === 0
      ? {documentId: state.documentId, url: state.tab.url, documentLifecycle: 'active'} : null},
    scripting: {executeScript: async options => {
      injections.push(options);
      // Run the actual injected function in a page-like realm, without Node globals.
      const result = vm.runInNewContext(`
        const navigator = {userAgent: 'page-agent', languages: ['zh-CN', 'en']};
        const window = {innerWidth: 900, innerHeight: 700,
          screen: {width: 1920, height: 1080}, devicePixelRatio: 2};
        const Intl = {DateTimeFormat: () => ({resolvedOptions: () => ({timeZone: 'Asia/Shanghai'})})};
        (${options.func.toString()})();
      `, {TextEncoder});
      const rows = [{frameId: 0, documentId: state.documentId, result: JSON.parse(JSON.stringify(result))}];
      await state.afterExecute?.();
      return rows;
    }}
  };
  const makeHost = () => createContextMenuHost({api, logger: {warn() {}}, lockManager: {request: (_key, work) => work()}});
  let host = makeHost();
  const call = (name, args = {}, extra = {}, from = sender) => host.handleTool({...identity, operation: name, args, ...extra}, from);
  const trusted = (name, extra = {}, from = sender) => host.handleHost({...identity, operation: name, ...extra}, from);
  const document = () => ({tabId: state.tab.id, windowId: state.tab.windowId, documentId: state.documentId,
    url: state.tab.url, origin: new URL(state.tab.url).origin, title: state.tab.title});
  const issue = async () => refArgs(await trusted('browser.page.getContext', {document: document()}));
  const consent = (enabled, site = new URL(state.tab.url).origin) => trusted(consentOperation,
    {origin: site, ...(enabled === undefined ? {} : {enabled}), document: document()});
  const approve = async () => {await consent(true); return issue();};
  return {pkg, identity, local, state, injections, api, call, trusted, issue, consent, approve,
    sdk: createBrowserSdk({request: call}), restart: () => {host = makeHost();},
    revoke: () => host.revokeBrowserOperations()};
}

test('approved exact-origin SDK read uses Host-issued refs and the fixed MAIN collector', async () => {
  const f = await fixture(), refs = await f.approve();
  const result = await f.sdk.page.readEnvironment(refs);
  assert.deepEqual(result, {...refs, capturedAt: result.capturedAt,
    source: {kind: 'target-page-js', world: 'MAIN', frameId: 0}, fields: expectedFields});
  assert(Number.isFinite(Date.parse(result.capturedAt)));
  assert.equal(f.injections.length, 1);
  const injection = f.injections[0];
  assert.deepEqual(Object.keys(injection).sort(), ['func', 'target', 'world']);
  assert.deepEqual(injection.target, {tabId: 42, documentIds: ['page-document-1']});
  assert.equal(injection.world, 'MAIN');
  assert.equal(typeof injection.func, 'function');
  validateDirectBrowserValue(result, operationSchemas(operation).output);
});

test('trusted consent query and approval persist exact origin with package and install identity', async () => {
  const f = await fixture();
  assert.deepEqual(await f.consent(), {enabled: false});
  assert.deepEqual(await f.consent(true), {enabled: true});
  assert.deepEqual(await f.consent(), {enabled: true});
  const grant = f.local.get(BROWSER_MENU_GRANTS_STORE)[f.pkg.id];
  assert.deepEqual(grant, {version: f.pkg.version, packageHash: f.identity.packageHash,
    installEpoch: f.identity.installEpoch, origins: [], activeActions: [], environmentSites: {[origin]: true}});
  assert.equal(f.injections.length, 0);
});

test('unapproved site rejects an otherwise valid current-page reference without injection', async () => {
  const f = await fixture(), refs = await f.issue();
  await assert.rejects(f.sdk.page.readEnvironment(refs), codeIs('E_SITE_GRANT_REQUIRED'));
  assert.equal(f.injections.length, 0);
});

for (const nextOrigin of ['http://example.test', 'https://example.test:8443', 'https://sub.example.test', 'https://foreign.test'])
  test(`approval does not extend to ${nextOrigin}`, async () => {
    const f = await fixture();
    await f.approve();
    f.state.tab.url = nextOrigin + '/page';
    f.state.documentId = 'new-site-document';
    const refs = await f.issue();
    assert.deepEqual(await f.consent(), {enabled: false});
    await assert.rejects(f.sdk.page.readEnvironment(refs), codeIs('E_SITE_GRANT_REQUIRED'));
    assert.equal(f.injections.length, 0);
  });

test('missing environment capability denies the SDK read without injection', async () => {
  const f = await fixture({caps: ['currentPage.read']}), refs = await f.issue();
  await assert.rejects(f.sdk.page.readEnvironment(refs), codeIs('E_TOOL_CAPABILITY_REQUIRED'));
  assert.equal(f.injections.length, 0);
});

test('missing environment capability cannot obtain trusted site consent', async () => {
  const f = await fixture({caps: ['currentPage.read']});
  await assert.rejects(f.consent(true), codeIs('E_TOOL_CAPABILITY_REQUIRED'));
  assert.equal(f.local.has(BROWSER_MENU_GRANTS_STORE), false);
});

for (const [key, value] of [['version', '9.0.0'], ['packageHash', 'b'.repeat(64)], ['installEpoch', 'old-epoch']])
  test(`stored approval with stale ${key} does not authorize collection`, async () => {
    const f = await fixture(), refs = await f.approve();
    const grants = f.local.get(BROWSER_MENU_GRANTS_STORE);
    grants[f.pkg.id][key] = value;
    assert.deepEqual(await f.consent(), {enabled: false});
    await assert.rejects(f.sdk.page.readEnvironment(refs), codeIs('E_SITE_GRANT_REQUIRED'));
    assert.equal(f.injections.length, 0);
  });

for (const [label, change] of [
  ['same-URL document replacement', f => {f.state.documentId = 'replacement-document';}],
  ['active tab replacement', f => {f.state.tab.id = 43;}],
  ['navigation URL', f => {f.state.tab.url = origin + '/next';}],
  ['inactive tab', f => {f.state.tab.active = false;}]
]) test(`old refs reject ${label} before injection`, async () => {
  const f = await fixture(), refs = await f.approve();
  change(f);
  await assert.rejects(f.sdk.page.readEnvironment(refs), codeIs('E_DOCUMENT_STALE'));
  assert.equal(f.injections.length, 0);
});

for (const [label, change, code] of [
  ['epoch revocation', f => f.local.set(TOOL_REVOCATION_EPOCHS_STORE, {[f.pkg.id]: 'epoch-2'}), 'E_TOOL_CHANGED'],
  ['disable', f => f.local.set(SIDEBAR_TOOL_ENABLE_STORE, {[f.pkg.id]: false}), 'E_TOOL_DISABLED'],
  ['uninstall', f => f.local.set(SIDEBAR_TOOL_STORE, []), 'E_TOOL_CHANGED'],
  ['Chrome site permission loss', f => {f.state.siteAllowed = false;}, 'E_SITE_PERMISSION_REVOKED'],
  ['Chrome scripting permission loss', f => {f.state.scriptingAllowed = false;}, 'E_CHROME_PERMISSION_REQUIRED']
]) {
  test(`${label} rejects an existing SDK reference before injection`, async () => {
    const f = await fixture(), refs = await f.approve();
    change(f);
    await assert.rejects(f.sdk.page.readEnvironment(refs), codeIs(code));
    assert.equal(f.injections.length, 0);
  });
  test(`${label} while collection is pending discards the collected result`, async () => {
    const f = await fixture(), refs = await f.approve();
    f.state.afterExecute = () => change(f);
    await assert.rejects(f.sdk.page.readEnvironment(refs), codeIs(code));
    assert.equal(f.injections.length, 1);
  });
}

test('trusted consent revocation invalidates old refs and blocks newly issued refs', async () => {
  const f = await fixture(), old = await f.approve();
  assert.deepEqual(await f.consent(false), {enabled: false});
  assert.deepEqual(await f.consent(), {enabled: false});
  assert.deepEqual(f.local.get(BROWSER_MENU_GRANTS_STORE)[f.pkg.id].environmentSites, {});
  await assert.rejects(f.sdk.page.readEnvironment(old), codeIs('E_DOCUMENT_STALE'));
  const fresh = await f.issue();
  await assert.rejects(f.sdk.page.readEnvironment(fresh), codeIs('E_SITE_GRANT_REQUIRED'));
  assert.equal(f.injections.length, 0);
});

test('Host authority revocation invalidates issued refs', async () => {
  const f = await fixture(), refs = await f.approve();
  f.revoke();
  await assert.rejects(f.sdk.page.readEnvironment(refs), codeIs('E_DOCUMENT_STALE'));
  assert.equal(f.injections.length, 0);
});

test('site grant removed during collection prevents delivery without replay', async () => {
  const f = await fixture(), refs = await f.approve();
  f.state.afterExecute = () => {
    delete f.local.get(BROWSER_MENU_GRANTS_STORE)[f.pkg.id].environmentSites[origin];
  };
  await assert.rejects(f.sdk.page.readEnvironment(refs), codeIs('E_SITE_GRANT_REQUIRED'));
  assert.equal(f.injections.length, 1);
});

test('navigation during collection prevents delivery of the old document fields', async () => {
  const f = await fixture(), refs = await f.approve();
  f.state.afterExecute = () => {f.state.documentId = 'replacement-document';};
  await assert.rejects(f.sdk.page.readEnvironment(refs), codeIs('E_DOCUMENT_STALE'));
  assert.equal(f.injections.length, 1);
});

test('trusted approval cannot bind a foreign origin to the current document', async () => {
  const f = await fixture();
  // Give Chrome host permission too, so it is the document/origin binding that denies consent.
  const contains = f.api.permissions.contains;
  f.api.permissions.contains = args => args.origins ? Promise.resolve(true) : contains(args);
  await assert.rejects(f.consent(true, 'https://foreign.test'), codeIs('E_DOCUMENT_STALE'));
  assert.equal(f.local.has(BROWSER_MENU_GRANTS_STORE), false);
});

test('Host restart drops transient refs while retaining reviewed site consent', async () => {
  const f = await fixture(), refs = await f.approve();
  f.restart();
  await assert.rejects(f.sdk.page.readEnvironment(refs), codeIs('E_DOCUMENT_STALE'));
  assert.equal(f.injections.length, 0);
  assert.deepEqual(await f.consent(), {enabled: true});
  const fresh = await f.issue();
  assert.notEqual(fresh.tabRef, refs.tabRef);
  assert.deepEqual((await f.sdk.page.readEnvironment(fresh)).fields, expectedFields);
});

test('refs cannot cross sandbox tool instances within the same Host', async () => {
  const f = await fixture(), refs = await f.approve();
  await assert.rejects(f.call(operation, refs, {toolInstance: otherUid}), codeIs('E_DOCUMENT_STALE'));
  assert.equal(f.injections.length, 0);
});

test('sandbox RPC cannot grant its own environment consent', async () => {
  const f = await fixture();
  await assert.rejects(f.call(consentOperation, {origin, enabled: true}), codeIs('E_SERVICE_UNSUPPORTED'));
  assert.equal(f.local.has(BROWSER_MENU_GRANTS_STORE), false);
});

test('foreign sender cannot approve an environment site', async () => {
  const f = await fixture();
  await assert.rejects(f.trusted(consentOperation, {origin, enabled: true}, {...sender, id: 'foreign'}), codeIs('E_OWNER'));
  assert.equal(f.local.has(BROWSER_MENU_GRANTS_STORE), false);
});

test('Registry binds environment reads to the declared capability and Chrome permissions', () => {
  assert.deepEqual(BROWSER_OPERATIONS[operation].requiredCapabilities, [capability]);
  assert.deepEqual(BROWSER_OPERATIONS[operation].requiredChromePermissions, ['scripting', 'webNavigation']);
  assert.equal(BROWSER_OPERATIONS[operation].requiresUserGesture, false);
});

for (const [label, patch] of [['extra code', {code: 'return 1'}], ['world override', {world: 'ISOLATED'}],
  ['native tab ID', {tabId: 42}], ['URL override', {url: origin}], ['malformed ref', {documentRef: 'bad'}]])
  test(`SDK and Host reject ${label} through the strict input contract`, async () => {
    const f = await fixture(), refs = await f.approve(), args = {...refs, ...patch};
    assert.throws(() => f.sdk.page.readEnvironment(args), codeIs('E_SCHEMA'));
    await assert.rejects(f.call(operation, args), codeIs('E_SCHEMA'));
    assert.equal(f.injections.length, 0);
  });

for (const [label, mutate] of [
  ['native ID', value => {value.tabId = 42;}],
  ['foreign source', value => {value.source.world = 'ISOLATED';}],
  ['subframe source', value => {value.source.frameId = 1;}],
  ['extra field', value => {value.fields.platform = field('native');}],
  ['missing field', value => {delete value.fields.screen;}],
  ['invalid status', value => {value.fields.userAgent.status = 'ok';}]
]) test(`published output schema rejects ${label}`, async () => {
  const f = await fixture(), refs = await f.approve();
  const result = await f.sdk.page.readEnvironment(refs);
  mutate(result);
  assert.throws(() => validateDirectBrowserValue(result, operationSchemas(operation).output), codeIs('E_SCHEMA'));
});
