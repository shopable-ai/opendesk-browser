import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=path=>readFile(new URL('../../'+path,import.meta.url),'utf8');
test('trusted React Host has exactly one first-use grant control outside the sandbox',async()=>{
  const [host,view,fields]=await Promise.all([
    source('src/ui/sidebar-tools.js'),source('src/ui/react/tabs/tool-host.tsx'),
    source('src/ui/sidebar-tools-fields.js')]);
  // The component has two guarded placement sites: first-use outside settings
  // and everyday permission management inside the common Settings page.
  // Only one site may mount for a given snapshot (verified by React SSR below).
  assert.equal(view.split('<CookieSettings onRevoke={actions.revoke}/>').length-1,2);
  assert.match(view,/\{cookieFirstUse&&<CookieSettings onRevoke=\{actions.revoke\}\/>\}/);
  assert.match(view,/\{!cookieFirstUse&&<CookieSettings onRevoke=\{actions.revoke\}\/>\}/);
  assert.match(view,/const firstUse=snapshot.fields\['sidebar-tool-cookie-permissions'\].data\?\.mode==='first-use'/);
  assert.match(host,/Cookie 访问授权/);
  assert.match(host,/允许管理.*Cookie，包括/);
  assert.match(host,/\['values','查看 Cookie 值'\]/);
  assert.match(host,/补全 Cookie 管理授权/);
  assert.match(host,/允许管理所有网站 Cookie/);
  assert.match(host,/if\(!event\?\.isTrusted\|\|cookieGrantPending\|\|busy\|\|readOnlyPreview/);
  assert.match(host,/E_GRANT_READBACK/);
  // The obsolete second button is absent for Cookie Editor, but remains
  // conditional for unrelated sandbox Cookie tools using the old contract.
  assert.match(view,/!isCookieEditor&&<ToolField as="button" type="button" id="sidebar-tool-cookie-values-toggle"/);
  assert.match(fields,/sidebar-tool-cookie-values-toggle/);
  assert.match(host,/hidden:tool.id==='cookie-editor'/);
});
test('explicit complete consent includes Values while unreceipted legacy all-site flags remain denied',async()=>{
  const host=await source('src/platform/chrome/context-menus.js');
  assert.match(host,/allSites&&grant.valueConsent!==true/);
  assert.match(host,/if\(siteCapability==='values'\)\{/);
  assert.match(host,/prior\.storeId!==storeId/);
  assert.match(host,/valueConsent:enabled/);
  assert.match(host,/valueConsent:enabled&&tool.capabilities.includes\('browser.cookies.values'\)/);
  assert.match(host,/valueConsent:tool.capabilities.includes\('browser.cookies.values'\)/);
  assert.doesNotMatch(host,/enabled&&cap!=='values'/);
  assert.match(host,/confirmedWrite\(api.storage.local,BROWSER_MENU_GRANTS_STORE/);
});

test('R5.26 stopped Cookie Editor exposes trusted re-enable without duplicate first-use consent',async()=>{
  const [host,view]=await Promise.all([
    source('src/ui/sidebar-tools.js'),source('src/ui/react/tabs/tool-host.tsx')]);
  assert.match(view,/const cookieFirstUse=/);
  assert.match(view,/className="sidebar-tool-management"/);
  const cookie=view.slice(view.indexOf('function CookieSettings('),view.indexOf('function BookmarkSettings('));
  assert.doesNotMatch(cookie,/id="sidebar-tool-enable"/,'Cookie permission card must not own a second app switch');
  assert.equal((view.match(/id="sidebar-tool-enable"/g)||[]).length,1);
  assert.match(view,/role="switch" aria-label="启用工具"/);
  assert.equal((cookie.match(/id="sidebar-tool-cookie-site-toggle"/g)||[]).length,1);
  assert.match(host,/enableReadError\|\|!sidebarToolEnabled\(enableRecords,tool.id\)/);
});

test('R5.37 Cookie consent checks official provenance before offering all-site, supports site fallback and native Chrome repair',async()=>{
  const host=await source('src/ui/sidebar-tools.js');
  assert.match(host,/async function admittedOfficialCookieImport\(tool,expectedEpoch,\{requireEnabled=true\}=\{\}\)/,
    'Cookie execution admission defaults to requiring an enabled installation');
  const display=host.slice(host.indexOf('function prepareCookieAdmission('),
    host.indexOf('function prepareCookieChrome('));
  assert.match(display,/const admitted=Boolean\(release&&await admittedOfficialCookieImport\(tool,epoch,\{requireEnabled:false\}\)\)/,
    'only display admission may recognize retained consent while disabled');
  const calls=[...host.matchAll(/await admittedOfficialCookieImport\(([^\n)]*)\)/g)].map(match=>match[1]);
  assert.equal(calls.filter(args=>args==='tool,epoch,{requireEnabled:false}').length,1,
    'the display-only override has exactly one call site');
  const runtimeCalls=calls.filter(args=>args!=='tool,epoch,{requireEnabled:false}');
  assert.ok(runtimeCalls.length>0,'verify actual execution admission consumers');
  for(const args of runtimeCalls)assert.equal(args,'tool,revocationEpoch',
    'every execution consumer must use the enabled-by-default admission');
  assert.match(host,/const allSites=tool.id==='cookie-editor'&&cookieAdmissionState===true/);
  assert.match(host,/!cookieHasManageGrant\(active,websiteOrigin\(currentPageTarget\?\.snapshot\?\.url\)\)/);
  assert.match(host,/const nativeRequest=revoke\?Promise.resolve\(true\):requestCookieChrome\(event,origin,allSites\)/);
  assert.match(host,/pageConsent.confirm\(event,cookieChromeRequest\(origin,allSites\)\)/);
  assert.match(host,/chromeMissing\?'恢复 Chrome Cookie 网站访问'/);
  assert.match(host,/const cookieRequiredCapabilities=/);
  assert.match(host,/cookieCapability:capability,enabled,origin:current/);
  assert.match(host,/else if\(tool.id==='cookie-editor'\)await changeCookieSite\(\{enabled:true\}\)/);
  assert.match(host,/else for\(const capability of cookieRequiredCapabilities\(tool\)\)/);
  assert.match(host,/kind:'cookie-grants-changed'/);
});

test('R5.38 Cookie Editor keeps infrequent app stop out of its toolbar',async()=>{
  const [view,center,app]=await Promise.all([
    source('src/ui/react/tabs/tool-host.tsx'),
    source('src/ui/extension-center.js'),
    source('examples/sidebar-tools/cookie-editor/app/CookieEditorApp.jsx')
  ]);
  assert.match(view,/className="sidebar-tool-header-actions"/);
  assert.match(view,/id="sidebar-tool-settings-open"/);
  assert.match(view,/id="sidebar-tool-remove"/);
  assert.doesNotMatch(view,/sidebar-tool-header-enable|enableInOverflow|sidebar-tool-more-open/,
    'tool enable remains a low-frequency trusted Settings action, not a header or overflow command');
  const card=view.slice(view.indexOf('function CookieSettings('),view.indexOf('function BookmarkSettings('));
  assert.equal((card.match(/id="sidebar-tool-enable"/g)||[]).length,0,
    'Cookie-specific permission card must not repeat the shared lifecycle switch');
  assert.equal((view.match(/id="sidebar-tool-enable"/g)||[]).length,1);
  const shared=view.slice(view.indexOf('id="sidebar-tool-settings-view"'),
    view.indexOf('function CookieSettings('));
  assert.ok(shared.indexOf('!cookieFirstUse&&<CookieSettings')<
    shared.indexOf('className="sidebar-tool-management"'),
    'permissions appear before the single common application management switch');
  assert.match(center,/add\(row.enabled\?'停用应用':'启用应用'/);
  assert.match(center,/sidebarTools\.toggleEnabled\(row\.id,event\)/);
  assert.doesNotMatch(app,/>停用工具<|>停用应用</);
});
