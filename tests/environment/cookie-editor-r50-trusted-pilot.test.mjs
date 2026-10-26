import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const base='examples/sidebar-tools/cookie-editor';
test('R5.25 official Cookie release uses one source-bound React sandbox and exact current version',async()=>{
  const [cfg,html,pkg,host]=await Promise.all([
    'tool.config.json','src/root.html','cookie-editor.opendesk-tool.json',
    '../../src/ui/sidebar-tools.js'
  ].map(path=>readFile(path.startsWith('..')?'src/ui/sidebar-tools.js':base+'/'+path,'utf8')));
  const config=JSON.parse(cfg),tool=JSON.parse(pkg);
  assert.equal(tool.version,config.version);
  assert.equal(tool.id,'cookie-editor');
  assert.equal(tool.uiRuntime,'opendesk.react-ui.v1');
  assert.equal(tool.html,html);
  assert.match(tool.js,/OpenDeskPageReact/);
  assert.match(tool.js,/OpenDeskSidebarUI/);
  assert.match(host,/createElement\('iframe'\)/);
  assert.match(host,/sidebar-tools\/sandbox\.html/);
});

test('R5.12 removes obsolete privileged Cookie pilot, preserving the independent single root',async()=>{
  const [main,shell,independent,entry,app,preview]=await Promise.all([
    'src/ui/react/main.tsx','src/ui/tool-shell.js',
    base+'/app/components/CookieEditorView.jsx',
    base+'/app/entries/official.jsx',base+'/app/CookieEditorApp.jsx',
    base+'/preview/react/src/App.jsx'
  ].map(path=>readFile(path,'utf8')));
  assert.equal((main.match(/createRoot\(/g)||[]).length,1);
  assert.match(main,/root\.unmount\(\)/);
  assert.doesNotMatch(main,/CookieTrustedPilot|cookiePilotHost|cookiePilotScopedCSS|mountCookieEditorPilot/);
  assert.doesNotMatch(shell,/cookieReactPilot|admitsTrustedCookieEditor|TRUSTED_COOKIE_EDITOR_VERSION/);
  assert.match(independent,/export function CookieEditorView/);
  assert.match(app,/import \{CookieEditorView,CookieIconButton,CookieSiteBar\} from '\.\/components\/CookieEditorView\.jsx'/);
  assert.match(independent,/export function CookieSiteBar\b/);
  assert.match(app,/createCookieController/);
  assert.match(preview,/import CookieEditorApp from '\.\.\/\.\.\/\.\.\/app\/CookieEditorApp\.jsx'/);
  assert.match(preview,/<CookieEditorApp\b/);
  assert.doesNotMatch(independent,/chrome\.cookies|OpenDeskSDK|secret_preview_never_real|sess_demo_only_C18/);
  assert.match(entry,/createRoot\(target\)/);
  assert.match(entry,/root\.unmount\(\)/);
  for(const path of [
    base+'/ui/CookieEditorView.jsx',
    'src/ui/react/tabs/cookie-pilot.tsx','src/ui/react/tabs/cookie-pilot.css',
    'src/ui/react/cookie-editor/CookieEditorView.jsx','src/ui/trusted-cookie-admission.js'
  ])await assert.rejects(readFile(path,'utf8'),{code:'ENOENT'});
});

test('approved Preview shares the App toolbar and Controller clear preflight without browser SRC ownership',async()=>{
  const [view,preview,app,controller,adapter,dialog,importer,exporter]=await Promise.all([
    'app/components/CookieEditorView.jsx','preview/react/src/App.jsx',
    'app/CookieEditorApp.jsx','app/controller/cookie-controller.js',
    'app/adapters/browser-sdk.js','app/components/CookieClearDialog.jsx',
    'app/components/CookieImport.jsx','app/components/CookieExport.jsx'
  ].map(path=>readFile(base+'/'+path,'utf8')));
  assert.match(view,/<Action name="upload" label="导入 Cookie"/);
  assert.match(view,/<Action name="download" label="导出 Cookie"/);
  assert.match(view,/<Action name="trash" label="安全清理本站 Cookie"/);
  assert.match(view,/onClick=\{onClear\} disabled=\{busy\|\|readonly\|\|clearDisabled\|\|typeof onClear!=='function'\}/);
  assert.match(preview,/<CookieEditorApp\b/);
  assert.doesNotMatch(preview,/ui\/CookieEditorView|<CookieImportDropzone|<CookieExportActions|clearKeys|clearCandidates/);
  assert.match(importer,/<CookieImportDropzone /);
  assert.match(exporter,/<CookieExportActions /);
  assert.match(app,/controller\.previewClear\(\)/);
  assert.match(app,/controller\.executeClear\(\)/);
  assert.match(app,/controller\.discardClear\(\)/);
  assert.match(app,/if\(dirty\)/);
  assert.match(app,/<CookieClearDialog/);
  assert.match(app,/hostname:result\.hostname,count:result\.count/);
  assert.match(controller,/adapter\.clearPreview\(guard\.at\)/);
  assert.match(controller,/previewRef:p\.previewRef,count:p\.matched/);
  assert.match(controller,/adapter\.clearExecute\(guard\.at,plan\.previewRef,plan\.count\)/);
  assert.match(adapter,/browser\(\)\.cookies\.clearSite/);
  assert.match(adapter,/preview:true,maxCookies:50/);
  assert.match(adapter,/previewRef,expectedCount,maxCookies:50/);
  assert.match(dialog,/\.showModal\(\)/);
  for(const source of [view,dialog])assert.doesNotMatch(source,/chrome\.cookies|OpenDeskSDK|secret_preview_never_real|sess_demo_only_C18/);
  assert.doesNotMatch(preview,/更多 · (?:清理与变化观察|观察与清理)/);
});
