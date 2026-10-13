import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {BROWSER_OPERATIONS,BROWSER_HOST_PROTOCOL} from '../../src/framework/sdk/browser-contract.js';
import {TRUSTED_COOKIE_OPERATIONS} from '../../src/platform/chrome/browser-cookie-host.js';
import {createBrowserSdk} from '../../src/framework/sdk/browser.js';

const json=path=>readFile(new URL('../../'+path,import.meta.url),'utf8').then(JSON.parse);
const read=path=>readFile(new URL('../../'+path,import.meta.url),'utf8');

test('R7 35-operation map remains historic and R9 Cookies use explicit scoped methods',async()=>{
  const [r7,r8]=await Promise.all([
    json('docs/api/browser-sdk-native-mapping.json'),
    json('docs/api/browser-sdk-compatibility-map.json')
  ]);
  assert.equal(r7.legacyOperations.count,35);
  assert.equal(r7.legacyOperations.canonicalMapping,'docs/api/browser-sdk-compatibility-map.json');
  assert.equal(r7.legacyOperations.archiveOnly,true);
  assert.equal(r8.archiveOnly,true);
  assert.equal(r8.operations.length,35);
  assert(Object.keys(BROWSER_OPERATIONS).some(op=>!r8.operations.some(row=>row.legacyOperation===op)),
    'R9 active methods must not be bound to the R8 names');
  assert(r8.operations.some(row=>!Object.hasOwn(BROWSER_OPERATIONS,row.legacyOperation)),'Historical map must not dictate current runtime');
  assert.equal(r7.entries.length,10);
  assert(r7.entries.every(row=>TRUSTED_COOKIE_OPERATIONS.includes(
    row.openDeskOperationId==='browser.cookies.getStores'
      ?'browser.cookies.getCurrentStore':row.openDeskOperationId)));
  assert(TRUSTED_COOKIE_OPERATIONS.includes('browser.cookies.getCurrentStore'));
  assert(TRUSTED_COOKIE_OPERATIONS.includes('browser.cookies.observe.read')); // R9 additional lifecycle, frozen R7 map is historical
  assert.equal(BROWSER_HOST_PROTOCOL,'opendesk.browser.v1');
  for(const row of r7.entries){
    assert.equal(row.mappingKind,'HOST_ONLY');
    assert.equal(row.publicSdkMethod,null);
    assert.equal(row.requiredChromePermissions[0],'cookies');
    assert.equal(row.exposure,'NOT_AVAILABLE_TO_SANDBOX_OR_PAGE_SDK');
    assert.equal(row.test.status,'MOCK_OR_SOURCE_ONLY_NATIVE_CHROME_NOT_TESTED');
    assert.match(row.inputSchema,/browser-cookie-host\.js/);
    assert.match(row.existingService,/cookies\.js/);
  }
  assert.equal(createBrowserSdk({context:'page-sdk'}).cookies,undefined);
  const publicCookies=createBrowserSdk({request:async()=>true}).cookies;
  assert.equal(typeof publicCookies.getAll,'function');
  assert.equal(typeof publicCookies.observe.read,'function');
});

test('R7 trusted native workbench is outside installed sandbox bridge; no additional Chrome RPC',async()=>{
  const [ui,workbench,host,sidecar,shell,cookieEntry]=await Promise.all([
    read('src/ui/tool.html'),read('src/ui/trusted-cookie-workbench.js'),
    read('src/platform/chrome/context-menus.js'),read('src/entrypoints/context-menus.js'),
    read('src/ui/tool-shell.js'),read('src/entrypoints/trusted-cookie-ui.js')
  ]);
  assert.match(ui,/<details id="trusted-cookie-panel"/);
  assert.match(ui,/id="trusted-cookie-value"[^>]*type="password"[^>]*data-sensitive="true"/);
  assert.match(workbench,/event\.isTrusted/);
  assert.match(workbench,/currentPageTarget\.revalidate/);
  assert.match(workbench,/browser\.cookies\.approve/);
  assert.match(workbench,/browser\.cookies\.execute/);
  assert.match(host,/checkedSender\(api,sender\)/);
  assert.match(host,/createTrustedCookieHost/);
  assert.match(sidecar,/host\[method\]/);
  assert.match(sidecar,/message\.kind==='host'/);
  // The trusted Cookie workbench lives in a fixed extension-only sidecar
  // so the monolithic tool-shell stays within the hard IIFE size budget.
  // Validate the real installation path without granting the iframe a bridge.
  assert.match(ui,/<script src="trusted-cookie-ui\.js"><\/script>/);
  assert.match(cookieEntry,/createTrustedCookieWorkbench/);
  assert.match(cookieEntry,/Object\.defineProperty\(globalThis,'__opendeskTrustedCookieUI'/);
  assert.match(shell,/__opendeskTrustedCookieUI/);
  assert.doesNotMatch(shell,/import\s*\{createTrustedCookieWorkbench\}/);
  assert(!workbench.includes('chrome.cookies.'));
  // R9 real trusted Cookie UI: explicit start/status/read/stop; event text omits secrets.
  for(const id of ['trusted-cookie-watch-start','trusted-cookie-watch-status-button',
    'trusted-cookie-watch-read','trusted-cookie-watch-stop','trusted-cookie-watch-events'])
    assert(ui.includes('id="'+id+'"'),'missing actual UI control '+id);
  assert(workbench.includes("const op='browser.cookies.observe.'+kind"),'Host-only observation operation is invoked');
  assert(workbench.includes('event.isTrusted&&!busy'),'Every observer control requires a trusted click');
  assert(workbench.includes('watchEventsNode.replaceChildren()'),'Observation events are cleared');
  assert(workbench.includes('String(item.name'),'Cookie event name is formatted without secret values');
  assert(!workbench.includes('item.value'),'redacted Cookie event UI must never render a value');
  assert(!workbench.includes('storage.local.set('));
});
