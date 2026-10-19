import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {assertLayoutOnly,compileSharedToolCss} from '../../scripts/preview/shared-tool-design.mjs';

const root='examples/sidebar-tools/cookie-editor/';
test('official shared design compiles candidate CSS without custom component skins',async()=>{
  const css=await readFile(root+'src/react.css','utf8');
  assert.doesNotThrow(()=>assertLayoutOnly(css));
  const compiled=await compileSharedToolCss(css);
  assert.match(compiled,/^\/\* opendesk\.shared-design\.v1 sha256=/);
  assert.match(compiled,/\.od-button\{/);
  assert.match(compiled,/\.od-icon-button\{/);
  assert.match(compiled,/:is\(input,select,textarea\)\.od-field\{/);
  assert.doesNotMatch(css,/max-width:\s*380px|width:\s*min\(100%,380px\)/);
});
test('real React app relies on shared buttons, fields and surfaces',async()=>{
  const paths=['app/CookieEditorApp.jsx','app/components/CookieEditorView.jsx',
    'app/components/CookieInlineEditor.jsx','app/components/CookieImport.jsx',
    'app/components/CookieExport.jsx','app/components/CookiePermissions.jsx',
    'app/components/CookieOfflineWorkspace.jsx'];
  const files=await Promise.all(paths.map(path=>readFile(root+path,'utf8')));
  const [app,view,editor]=files;
  assert.match(app,/className="od-surface"/);
  assert.match(view,/od-icon-button/);
  assert.match(view,/od-button--quiet/);
  assert.match(editor,/od-field/);
  for(const src of files.slice(2))assert.doesNotMatch(src,/<button\b/);
});
