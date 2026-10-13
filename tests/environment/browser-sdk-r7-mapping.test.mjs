import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {BROWSER_OPERATIONS,BROWSER_HOST_PROTOCOL} from '../../src/framework/sdk/browser-contract.js';
import {TRUSTED_COOKIE_OPERATIONS} from '../../src/platform/chrome/browser-cookie-host.js';
import {createBrowserSdk} from '../../src/framework/sdk/browser.js';

const json=path=>readFile(new URL('../../'+path,import.meta.url),'utf8').then(JSON.parse);
const read=path=>readFile(new URL('../../'+path,import.meta.url),'utf8');

test('R7 35-operation map remains historic and Cookie host exposes no sandbox methods',async()=>{
  const [r7,r8]=await Promise.all([
    json('docs/api/browser-sdk-native-mapping.json'),
    json('docs/api/browser-sdk-compatibility-map.json')
  ]);
  assert.equal(r7.legacyOperations.count,35);
  assert.equal(r7.legacyOperations.canonicalMapping,'docs/api/browser-sdk-compatibility-map.json');
  assert.equal(r7.legacyOperations.archiveOnly,true);
  assert.equal(r8.archiveOnly,true);
  assert(Object.keys(BROWSER_OPERATIONS).every(op=>r8.operations.some(row=>row.legacyOperation===op)));
  assert(r8.operations.some(row=>!Object.hasOwn(BROWSER_OPERATIONS,row.legacyOperation)),'Historical map must not dictate current runtime');
  assert.equal(r7.entries.length,10);
  assert(r7.entries.every(row=>TRUSTED_COOKIE_OPERATIONS.includes(row.openDeskOperationId)));
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
  assert.equal(createBrowserSdk({request:async()=>true}).cookies,undefined);
});

test('R7 trusted native workbench is outside installed sandbox bridge; no additional Chrome RPC',async()=>{
  const [ui,workbench,host,sidecar,shell]=await Promise.all([
    read('src/ui/tool.html'),read('src/ui/trusted-cookie-workbench.js'),
    read('src/platform/chrome/context-menus.js'),read('src/entrypoints/context-menus.js'),
    read('src/ui/tool-shell.js')
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
  assert.match(shell,/createTrustedCookieWorkbench/);
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
