import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const base='examples/sidebar-tools/cookie-editor';
test('R5 legacy Cookie release remains installed through the ordinary isolated sandbox',async()=>{
  const [cfg,html,js,css,pkg,host]=await Promise.all([
    'tool.config.json','src/index.html','src/main.js','src/style.css',
    'cookie-editor.opendesk-tool.json','../../src/ui/sidebar-tools.js'
  ].map(path=>readFile(path.startsWith('..')?'src/ui/sidebar-tools.js':base+'/'+path,'utf8')));
  const tool=JSON.parse(pkg);
  assert.equal(JSON.parse(cfg).version,'2.0.23');
  assert.equal(tool.version,'2.0.23');
  assert.equal(tool.html,html);assert.equal(tool.js,js);assert.equal(tool.css,css);
  assert.match(host,/createElement\('iframe'\)/);
  assert.match(host,/sidebar-tools\/sandbox\.html/);
});

test('R5.12 removes obsolete privileged Cookie pilot, preserving the independent single root',async()=>{
  const [main,shell,independent,barrel,entry]=await Promise.all([
    'src/ui/react/main.tsx','src/ui/tool-shell.js',
    base+'/app/components/CookieEditorView.jsx',
    base+'/ui/CookieEditorView.jsx',base+'/app/entries/official.jsx'
  ].map(path=>readFile(path,'utf8')));
  assert.equal((main.match(/createRoot\(/g)||[]).length,1);
  assert.match(main,/root\.unmount\(\)/);
  assert.doesNotMatch(main,/CookieTrustedPilot|cookiePilotHost|cookiePilotScopedCSS|mountCookieEditorPilot/);
  assert.doesNotMatch(shell,/cookieReactPilot|admitsTrustedCookieEditor|TRUSTED_COOKIE_EDITOR_VERSION/);
  assert.match(independent,/export function CookieEditorView/);
  assert.match(barrel,/app\/components\/CookieEditorView\.jsx/);
  assert.match(entry,/createRoot\(target\)/);
  assert.match(entry,/root\.unmount\(\)/);
  for(const path of [
    'src/ui/react/tabs/cookie-pilot.tsx','src/ui/react/tabs/cookie-pilot.css',
    'src/ui/react/cookie-editor/CookieEditorView.jsx','src/ui/trusted-cookie-admission.js'
  ])await assert.rejects(readFile(path,'utf8'),{code:'ENOENT'});
});

test('approved Preview and independent product own toolbar, not browser SRC',async()=>{
  const [view,preview,styles]=await Promise.all([
    readFile(base+'/app/components/CookieEditorView.jsx','utf8'),
    readFile(base+'/preview/react/src/App.jsx','utf8'),
    readFile(base+'/preview/react/src/style.css','utf8')
  ]);
  assert.match(view,/<Action name="upload" label="导入 Cookie"/);
  assert.match(view,/<Action name="download" label="导出 Cookie"/);
  assert.match(view,/<Action name="trash" label="安全清理本站 Cookie"/);
  assert.match(view,/onClear\} disabled=\{busy\|\|readonly\|\|clearDisabled/);
  assert.match(preview,/dropzone-symbol"><Icon name="upload"\/>/);
  assert.match(preview,/runExport\('download'\)\}><Icon name="download"\/>下载/);
  assert.match(preview,/type:'clear',keys:clearKeys\(\),count:clearCandidates.length/);
  assert.match(preview,/Host-only Cookie/);
  assert.doesNotMatch(preview,/更多 · 清理与变化观察/);
  assert.match(styles,/\.cookie-app \.toolbar-actions \.cookie-clear-action/);
});
