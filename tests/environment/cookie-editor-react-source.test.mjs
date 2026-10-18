import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const root=resolve('examples/sidebar-tools/cookie-editor');
const get=name=>readFile(resolve(root,name),'utf8');
test('Cookie React candidate has isolated root and single public SDK pathway',async()=>{
  const [entry,app,adapter,controller]=await Promise.all([
    get('app/entries/official.jsx'),get('app/CookieEditorApp.jsx'),
    get('app/adapters/browser-sdk.js'),get('app/controller/cookie-controller.js')]);
  assert.match(entry,/createRoot\(target\)/);
  assert.match(entry,/root\.unmount\(\)/);
  assert.match(entry,/pagehide/);
  assert.match(app,/createCookieController/);
  assert.match(app,/createCookieSdkAdapter/);
  assert.match(app,/OpenDeskSDK\?\.browser/);
  assert.match(app,/opendesk-cookie-grants-changed/);
  assert.match(app,/opendesk-page-changed/);
  assert.match(controller,/retireObservation/);
  assert.match(adapter,/capabilities\.getStatus/);
  assert.doesNotMatch(app,/chrome\.cookies|document\.cookie|localStorage|sessionStorage/);
});
test('Value remains outside global React state and fixture source',async()=>{
  const [editor,importer,offline,app,preview]=await Promise.all([
    get('app/components/CookieInlineEditor.jsx'),
    get('app/components/CookieImport.jsx'),
    get('app/components/CookieOfflineWorkspace.jsx'),
    get('app/CookieEditorApp.jsx'),
    get('app/components/CookieEditorView.jsx')]);
  assert.match(editor,/valueRef=React\.useRef/);
  assert.match(editor,/revealedRef=React\.useRef/);
  assert.match(importer,/sourceRef=React\.useRef/);
  assert.match(offline,/cookies=React\.useRef/);
  for(const source of [app,preview,editor,importer,offline])
    assert.doesNotMatch(source,/DEMO|fixture-session|secret_preview_never_real|sess_demo_only_C18/);
});
test('golden Preview and installed editor share form JSX while secrets stay in ephemeral DOM',async()=>{
  const [preview,view,barrel,editor,official]=await Promise.all([
    get('preview/react/src/App.jsx'),get('app/components/CookieEditorView.jsx'),
    get('ui/CookieEditorView.jsx'),get('app/components/CookieInlineEditor.jsx'),
    get('app/CookieEditorApp.jsx')
  ]);
  assert.match(view,/export function CookieFormField/);
  assert.match(barrel,/CookieFormField/);
  assert.match(preview,/CookieFormField as Field/);
  assert.match(editor,/<CookieFormField label="名称">/);
  assert.match(editor,/<CookieFormField label="值">/);
  assert.match(editor,/revealGeneration\.current\+\+/);
  assert.match(editor,/originalValueRef\.current=null/);
  assert.match(editor,/clearValue/);
  assert.match(editor,/discardConfirm/);
  assert.doesNotMatch(editor,/setState\([^)]*value/);
  assert.match(official,/onCancel=\{\(\)=>\{setSelected\(null\);setDirty\(false\);\}\}/);
});

test('Preview IO presentation is shared without moving native Cookie operations into React',async()=>{
  const [preview,view,importer,exporter,adapter]=await Promise.all([
    get('preview/react/src/App.jsx'),get('app/components/CookieEditorView.jsx'),
    get('app/components/CookieImport.jsx'),get('app/components/CookieExport.jsx'),
    get('app/adapters/browser-sdk.js')
  ]);
  for(const tag of ['CookieImportDropzone','CookieExportFormatRow','CookieExportActions']){
    assert.ok(view.includes('export function '+tag),tag+' JSX must have one owner');
    assert.ok(preview.includes('<'+tag),tag+' must appear in Preview');
  }
  assert.match(importer,/<CookieImportDropzone /);
  assert.match(exporter,/<CookieExportFormatRow /);
  assert.match(exporter,/<CookieExportActions /);
  assert.match(importer,/controller\.previewImport/);
  assert.match(importer,/controller\.executeImport/);
  assert.match(exporter,/controller\.exportTo/);
  assert.match(adapter,/browser\(\)\.downloads\.text/);
  assert.doesNotMatch(view,/chrome\.cookies|OpenDeskSDK|secret_preview_never_real|sess_demo_only_C18/);
});

test('formal native package unchanged until candidate passes all gates',async()=>{
  const [config,official,vite]=await Promise.all([
    get('tool.config.json').then(JSON.parse),
    get('cookie-editor.opendesk-tool.json').then(JSON.parse),
    get('vite.config.mjs')]);
  assert.equal(config.version,'2.0.23');
  assert.equal(config.files.js,'src/main.js');
  assert.equal(official.version,'2.0.23');
  assert.match(vite,/'@opendesk\/ui':'OpenDeskSidebarUI'/);
  assert.match(vite,/react:'OpenDeskPageReact'/);
});
