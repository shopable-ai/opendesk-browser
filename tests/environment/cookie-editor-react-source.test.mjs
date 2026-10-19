import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const root=resolve('examples/sidebar-tools/cookie-editor');
const get=name=>readFile(resolve(root,name),'utf8');
function assertSharedApp(preview){
  assert.match(preview,/import CookieEditorApp from ['"]\.\.\/\.\.\/\.\.\/app\/CookieEditorApp\.jsx/);
  assert.match(preview,/<CookieEditorApp\b/);
  assert.doesNotMatch(preview,/ui\/CookieEditorView|createCookieController|createCookieSdkAdapter|function (?:Editor|ImportPanel|ExportPanel)|controller\.(?:save|remove|previewImport|exportTo)/);
}
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
  assert.match(controller,/async function syncMetadata/);
  assert.match(app,/controller\.syncMetadata/);
  assert.match(app,/document\.visibilityState/);
  assert.doesNotMatch(app,/cookie-observe-fold|变化观察/);
  assert.doesNotMatch(adapter,/observeStart|observeRead|observeStop/);
  assert.doesNotMatch(controller,/observeStart|observeRead|observeStop|async function observe\(/);
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
  assert.match(editor,/originalValueRef=React\.useRef/);
  assert.match(importer,/sourceRef=React\.useRef/);
  assert.match(offline,/cookies=React\.useRef/);
  for(const source of [app,preview,editor,importer,offline])
    assert.doesNotMatch(source,/DEMO|fixture-session|secret_preview_never_real|sess_demo_only_C18/);
});
test('Preview mounts the installed App while shared editor secrets stay in ephemeral DOM',async()=>{
  const [preview,view,editor,official]=await Promise.all([
    get('preview/react/src/App.jsx'),get('app/components/CookieEditorView.jsx'),
    get('app/components/CookieInlineEditor.jsx'),
    get('app/CookieEditorApp.jsx')
  ]);
  assert.match(view,/export function CookieFormField/);
  assertSharedApp(preview);
  assert.match(official,/import CookieInlineEditor from '\.\/components\/CookieInlineEditor\.jsx'/);
  assert.match(editor,/<CookieFormField label="名称">/);
  assert.match(editor,/<CookieValueField inputRef=\{valueRef\}/);
  assert.match(editor,/readGeneration\.current\+\+/);
  assert.match(editor,/originalValueRef\.current=null/);
  assert.match(editor,/clearValue/);
  assert.match(editor,/discardConfirm/);
  assert.doesNotMatch(editor,/setState\([^)]*value/);
  assert.match(official,/onCancel=\{\(\)=>\{setSelected\(null\);setDirty\(false\);\}\}/);
});

test('Preview IO presentation is shared without moving native Cookie operations into React',async()=>{
  const [preview,view,importer,exporter,adapter,official]=await Promise.all([
    get('preview/react/src/App.jsx'),get('app/components/CookieEditorView.jsx'),
    get('app/components/CookieImport.jsx'),get('app/components/CookieExport.jsx'),
    get('app/adapters/browser-sdk.js'),get('app/CookieEditorApp.jsx')
  ]);
  for(const tag of ['CookieImportDropzone','CookieExportFormatRow','CookieExportActions']){
    assert.ok(view.includes('export function '+tag),tag+' JSX must have one owner');
  }
  assertSharedApp(preview);
  assert.match(official,/import CookieImport from '\.\/components\/CookieImport\.jsx'/);
  assert.match(official,/import CookieExport from '\.\/components\/CookieExport\.jsx'/);
  assert.match(importer,/<CookieImportDropzone /);
  assert.match(exporter,/<CookieExportFormatRow /);
  assert.match(exporter,/<CookieExportActions /);
  assert.match(importer,/controller\.previewImport/);
  assert.match(importer,/controller\.executeImport/);
  assert.match(exporter,/controller\.exportTo/);
  assert.match(adapter,/browser\(\)\.downloads\.text/);
  assert.doesNotMatch(view,/chrome\.cookies|OpenDeskSDK|secret_preview_never_real|sess_demo_only_C18/);
});

test('advanced Cookie identities use shared-App JSX and remain read-only for existing records',async()=>{
  const [view,preview,editor]=await Promise.all([
    get('app/components/CookieEditorView.jsx'),
    get('preview/react/src/App.jsx'),
    get('app/components/CookieInlineEditor.jsx')
  ]);
  assert.match(view,/export function CookieAdvancedFields/);
  assert.match(view,/readOnly=\{existing\}/);
  assert.match(view,/Store ID/);
  assert.match(view,/PartitionKey/);
  assert.match(view,/<summary>属性<\/summary>/);
  assert.match(view,/editor-identity-fields/);
  assert.doesNotMatch(view,/设备本地时间；|Domain Cookie/);
  assert.match(editor,/<CookieAdvancedFields draft=\{draft\}/);
  assert.doesNotMatch(view,/chrome\.cookies|OpenDeskSDK|localStorage/);
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

test('R5.16 Cookie fields never impersonate a username/password form',async()=>{
  const [preview,editor,view]=await Promise.all([
    get('preview/react/src/App.jsx'),get('app/components/CookieInlineEditor.jsx'),
    get('app/components/CookieEditorView.jsx')]);
  assert.match(view,/export function CookieValueField/);
  assertSharedApp(preview);
  assert.match(editor,/<CookieValueField/);
  assert.match(view,/id="opendesk-cookie-attribute-data"/);
  assert.match(view,/name="opendesk-cookie-attribute-data"/);
  assert.match(view,/type="text" autoComplete="off"/);
  assert.match(editor,/className="cookie-inline-editor inline-editor/);
  assert.match(editor,/role="group"/);
  assert.doesNotMatch(editor,/<form\b/,'formal editor must not submit a login-like HTML form');
  assert.match(editor,/type="button" onClick=\{submit\}/);
  for(const source of [preview,editor,view]){
    assert.doesNotMatch(source,/type=["']password["']/);
    assert.doesNotMatch(source,/cookie-value-toggle|<CookieIcon name=\{showValue/);
  }
  assert.match(editor,/inputRevision\.current\+\+/);
  assert.match(editor,/valueEditedRef\.current/);
  assert.match(editor,/originalValueRef\.current=null/);
  assert.match(editor,/valueEdited:!edited\|\|valueEdited/);
});

test('R5.15 clear Dialog is shared and is a real native modal',async()=>{
  const [dialog,official,preview,controller,adapter]=await Promise.all([
    get('app/components/CookieClearDialog.jsx'),
    get('app/CookieEditorApp.jsx'),get('preview/react/src/App.jsx'),
    get('app/controller/cookie-controller.js'),
    get('app/adapters/browser-sdk.js')]);
  assert.match(dialog,/<dialog /);
  assert.match(dialog,/\.showModal\(\)/);
  assert.match(dialog,/\.focus\(\)/);
  assert.match(dialog,/onCancel=/);
  assertSharedApp(preview);
  assert.match(official,/<CookieClearDialog/);
  assert.doesNotMatch(preview,/className="clear-confirm"/);
  assert.doesNotMatch(official,/className="cookie-confirm/);
  assert.match(official,/controller\.previewClear\(\)/);
  assert.match(official,/controller\.executeClear\(\)/);
  assert.match(official,/if\(dirty\)/);
  assert.match(controller,/previewRef/);
  assert.match(adapter,/maxCookies:50/);
});
