import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=path=>readFile(new URL('../../'+path,import.meta.url),'utf8');
test('trusted React Host has exactly one first-use grant control outside the sandbox',async()=>{
  const [host,view,fields]=await Promise.all([
    source('src/ui/sidebar-tools.js'),source('src/ui/react/tabs/tool-host.tsx'),
    source('src/ui/sidebar-tools-fields.js')]);
  assert.equal(view.split('<CookieSettings onRevoke={actions.revoke}/>').length-1,1);
  assert.match(view,/<CookieSettings onRevoke=\{actions.revoke\}\/><div id="sidebar-tool-frame"/);
  assert.match(view,/const firstUse=snapshot.fields\['sidebar-tool-cookie-permissions'\].data\?\.mode==='first-use'/);
  assert.match(host,/Cookie 访问授权/);
  assert.match(host,/允许管理普通 HTTP\/HTTPS 网站的 Cookie；敏感值单独授权。/);
  assert.match(host,/允许管理所有网站 Cookie/);
  assert.match(host,/if\(!event\?\.isTrusted\|\|cookieGrantPending\|\|busy\)return/);
  assert.match(host,/E_GRANT_READBACK/);
  assert.match(fields,/sidebar-tool-cookie-values-toggle/);
});
test('cookie Values are not a side effect of ordinary global consent or legacy values flag',async()=>{
  const host=await source('src/platform/chrome/context-menus.js');
  assert.match(host,/allSites&&grant.valueConsent!==true/);
  assert.match(host,/if\(siteCapability==='values'\)\{/);
  assert.match(host,/prior\.storeId!==storeId/);
  assert.match(host,/valueConsent:enabled/);
  assert.match(host,/valueConsent:false/);
  assert.match(host,/enabled&&cap!=='values'&&tool.capabilities.includes/);
  assert.match(host,/confirmedWrite\(api.storage.local,BROWSER_MENU_GRANTS_STORE/);
});
