import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const appFile='examples/sidebar-tools/bookmark-manager/src/react/App.jsx';
const chromeFile='examples/sidebar-tools/bookmark-manager/preview/r304-chrome.mjs';
const read=file=>readFile(file,'utf8');

test('R3.1 trusted observer subscribes before first full paginated tree snapshot',async()=>{
 const app=await read(appFile);
 const start=app.indexOf("useEffect(()=>{\n  if(mode!=='trusted')return;");
 const end=app.indexOf('},[mode,service,load]);',start);
 assert.ok(start>=0&&end>start,'trusted lifecycle must be a single scoped effect');
 const lifecycle=app.slice(start,end);
 assert.ok(lifecycle.indexOf('service.watchStart()')>=0);
 assert.ok(lifecycle.indexOf('service.watchStart()')<lifecycle.indexOf('load({initial:true})'),
  'subscribe-before-snapshot closes the cross-window update gap');
 assert.match(lifecycle,/session=next;needsSnapshot=true/);
 assert.match(lifecycle,/if\(result\.events\.length\)await load\(\)/);
 assert.match(lifecycle,/needsSnapshot=true;void stop\(old\)/);
 assert.match(lifecycle,/if\(closed\)\{await stop\(next\);return\}/);
 assert.match(lifecycle,/clearTimeout\(timer\);void stop\(session\)/);
});

test('R3.1 event gap fails closed; background resync cannot silently clear unknown write',async()=>{
 const app=await read(appFile);
 assert.match(app,/if\(reconcileUnknown\)\{setUncertain\(false\);dockRef\.current\?\.reconcile\?\.\(\);\}/,
  'Only an explicit successful reconciliation clears the unknown state in both tree and Dock');
 assert.doesNotMatch(app,/if\(!initial\)setUncertain\(false\)/);
 assert.match(app,/if\(result\.events\.length\)await load\(\)/);
 assert.match(app,/E_BOOKMARK_EVENT_GAP'[\s\S]*?setTree\(null\);setPreviewOpen\(false\);setLoading\(true\)/);
 assert.match(app,/onClick=\{\(\)=>void load\(\{reconcileUnknown:true\}\)\}/);
 assert.match(app,/onClick=\{\(\)=>\{setError\(''\);void load\(\{reconcileUnknown:true\}\)\}\}/);
});

test('R3.1 Chromium assertions use the approved responsive details instead of stale R3.0.4 non-modal contract',async()=>{
 const chrome=await read(chromeFile);
 assert.match(chrome,/const widths=\[320,360,400,440,960\];/);
 assert.match(chrome,/for\(const width of widths\)/);
 assert.match(chrome,/width<740\?'true':null,'responsive modal semantics'/);
 assert.match(chrome,/approved floating pane insets/);
 assert.match(chrome,/backdrop closes floating preview/);
 assert.match(chrome,/a\.bm-detail-url/);
 assert.match(chrome,/noopener/);
});

test('R3.1 trusted React CSS uses the existing fixed stylesheet and a single root',async()=>{
 const react=await read('src/ui/react/main.tsx');
 const prepare=await read('scripts/prepare-public.mjs');
 const verify=await read('scripts/verify-package.mjs');
 assert.doesNotMatch(react,/bookmarkScopedCSS|bookmark-manager\/src\/react\/style\.css\?raw/);
 assert.match(prepare,/writeFile\(resolve\(publicRoot,'ui\/tool-shell\.css'\),trustedToolShellStyle\(\)\)/);
 assert.match(verify,/Trusted Bookmark stylesheet differs from reviewed source/);
 assert.match(react,/bookmarkPilotLayoutCSS from '\.\/tabs\/bookmark-pilot\.css\?raw'/);
 assert.match(react,/<style data-opendesk-trusted-react-css/);
 assert.doesNotMatch(react,/^import '\.\/tabs\/(?:cookie|bookmark)-pilot\.css';/m);
 assert.equal((react.match(/createRoot\(/g)||[]).length,1);
});
