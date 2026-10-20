import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Regression checks for the normal installation route. These are static
// contract tests; they never claim to replace a native Chrome CRUD run.
const read=path=>readFile(path,'utf8');

test('R3.3 normal open tries the single compiled React root without developer parameters',async()=>{
 const [shell,react,controller]=await Promise.all([
  'src/ui/tool-shell.js','src/ui/react/main.tsx','src/ui/sidebar-tools.js'].map(read));
 assert.match(shell,/trustedBookmarkPilot:\{\s*componentVersion:TRUSTED_BOOKMARK_COMPONENT_VERSION,\s*enabled:true,/);
 assert.doesNotMatch(shell,/bookmarkReactPilot/);
 assert.match(react,/mountBookmarkPilot\(\{container,sdk,onStateChange\}/);
 assert.equal((react.match(/createRoot\(/g)||[]).length,1);
 assert.match(controller,/admittedNativeBookmark\(tool,frameRevocationEpoch\)\.then\(admitted=>/);
 assert.match(controller,/if\(!admitted\)\{\s*mountTool\(tool,\{forceSandbox:true\}\)/);
 assert.match(controller,/frame=doc\.createElement\('iframe'\)/);
});

test('R3.3 default route keeps official package identity and original Host dispatcher',async()=>{
 const [controller,admission]=await Promise.all([
  'src/ui/sidebar-tools.js','src/ui/trusted-bookmark-admission.js'].map(read));
 assert.match(admission,/matchesOfficialRelease\(release,tool\)/);
 assert.match(admission,/sameSidebarToolPackage\(row,tool\)/);
 assert.match(admission,/source\.sha256!==release\.sha256/);
 assert.match(admission,/expectedEpoch!==actualEpoch/);
 assert.match(admission,/requireToolEnableRecords\(enableRecords\)/);
 assert.match(controller,/return dispatch\(operation,payload,tool,trustedBookmarkSource,token,epoch\)/);
 assert.match(controller,/source===trustedBookmarkSource&&active\.id===TRUSTED_BOOKMARK_ID/);
 assert.match(controller,/onBookmarkChromeGrantRemoved/);
});

test('R3.3 first Full Bookmarks approval visibly leads into a fresh observer',async()=>{
 const controller=await read('src/ui/sidebar-tools.js');
 assert.match(controller,/isFullBookmarkTool\(tool\)&&!bookmarkGranted/);
 assert.match(controller,/browser\.bookmarks\.fullConsent/);
 assert.match(controller,/if\(!hadConsent&&nativeUI\?\.kind==='bookmark'&&!toolDirty&&!toolSaving&&[\s\S]*?mountTool\(tool\)/);
 const app=await read('examples/sidebar-tools/bookmark-manager/src/react/App.jsx');
 assert.ok(app.indexOf('service.watchStart()')<app.indexOf('load({initial:true})'),
  'observer must subscribe before the initial native snapshot');
});
