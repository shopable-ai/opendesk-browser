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
  assert.match(importer,/onImportText\?\.\(text,\{overwrite\}\)/);
  assert.match(official,/controller\.previewImport/);
  assert.match(official,/controller\.executeImport/);
  assert.match(exporter,/controller\.exportTo/);
  assert.match(adapter,/browser\(\)\.downloads\.text/);
  assert.doesNotMatch(view,/chrome\.cookies|OpenDeskSDK|secret_preview_never_real|sess_demo_only_C18/);
});

test('R5.25 file selection never starts a Cookie write or trusted import intent',async()=>{
  const importer=await get('app/components/CookieImport.jsx');
  assert.match(importer,/onChange=\{event=>\{stageFile\(event\.currentTarget\.files\?\.\[0\]\);\}\}/);
  assert.match(importer,/const stageFile=file=>\{/);
  assert.match(importer,/stagedFile\.current=file;setStagedName\(/);
  assert.match(importer,/const reading=React\.useRef\(false\)/);
  assert.match(importer,/reading\.current=true;setBusy\(true\)/);
  assert.match(importer,/if\(reading\.current\|\|running\.current\|\|disabled\|\|uncertain\)return/);
  const confirmation=importer.slice(importer.indexOf('const confirmImport=()=>{'),
    importer.indexOf('// File selection and drag/drop only stage'));
  assert.match(confirmation,/if\(reading\.current\|\|running\.current\|\|disabled\|\|uncertain\|\|!previewRef\.current\?\.ready\)return/);
  assert.ok(confirmation.indexOf('beginIntent();')>=0);
  assert.ok(confirmation.indexOf('beginIntent();')<confirmation.indexOf('text=await file.text();'));
  const selection=importer.slice(importer.indexOf('const stageFile=file=>{'),
    importer.indexOf('const cancelFromKeys='));
  assert.doesNotMatch(selection,/beginIntent\(|importText\(|importFile\(/);
  assert.doesNotMatch(importer,/onChange=\{event=>\{void importFile\(/);
  assert.doesNotMatch(importer,/onPick=\{[^\n]*beginIntent\(/);
});

test('R5.36 React UI defaults overwrite, supports opt-out and preserves Controller safe defaults',async()=>{
  const [importer,app]=await Promise.all([
    get('app/components/CookieImport.jsx'),get('app/CookieEditorApp.jsx')]);
  assert.match(importer,/\[overwrite,setOverwrite\]=React\.useState\(true\)/);
  assert.match(importer,/type="checkbox" checked=\{overwrite\}/);
  assert.match(importer,/const next=event\.currentTarget\.checked;setOverwrite\(next\)/);
  assert.match(importer,/onPendingChange\?\.\(Boolean\(stagedFile\.current\)/);
   assert.match(importer,/onPendingChange\?\.\(Boolean\(event\.currentTarget\.value\.trim\(\)\)\)/);
   assert.doesNotMatch(importer,/默认不覆盖|\|\|overwrite/);
   assert.match(importer,/if\(stagedFile\.current\|\|sourceRef\.current\?\.value\.trim\(\)\)/);
  assert.match(importer,/onImportText\?\.\(text,\{overwrite\}\)/);
  assert.match(app,/const importFromText=async \(text,\{overwrite=false\}=\{\}\)=>/);
  assert.match(app,/controller\.previewImport\(text,'auto',overwrite,\{allSites:true\}\)/);
  assert.match(app,/controller\.executeImport\(text,'auto',overwrite,\{allSites:true\}\)/);
  assert.doesNotMatch(app,/controller\.(?:previewImport|executeImport)\(text,'auto',true,\{allSites:true\}\)/);
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
  assert.match(view,/<summary>其他属性 \/ 存储信息<\/summary>/);
  assert.match(view,/editor-identity-fields/);
  assert.doesNotMatch(view,/设备本地时间；|Domain Cookie/);
  assert.match(editor,/<CookieAdvancedFields draft=\{draft\}/);
  assert.doesNotMatch(view,/chrome\.cookies|OpenDeskSDK|localStorage/);
});

test('React development import package agrees with its promoted source config',async()=>{
  const [config,official,vite]=await Promise.all([
    get('tool.config.json').then(JSON.parse),
    get('cookie-editor.opendesk-tool.json').then(JSON.parse),
    get('vite.config.mjs')]);
  assert.equal(config.id,'cookie-editor');
  assert.match(config.version,/^\d+\.\d+\.\d+$/);
  assert.equal(config.uiRuntime,'opendesk.react-ui.v1');
  assert.deepEqual(config.files,{html:'src/root.html',css:'dist/tool.css',js:'dist/tool.js'});
  for(const field of ['format','id','version','capabilities','requires','contributes'])
    assert.deepEqual(official[field],config[field],
      'Promoted Cookie React package differs from release config: '+field);
  assert.match(official.js,/OpenDeskPageReact/);
  assert.match(official.js,/OpenDeskSidebarUI/);
  assert.match(official.js,/E_COOKIE_REACT_SANDBOX_NOT_READY/);
  assert.match(official.html,/id="cookie-react-root"/);
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

test('R5.31 export stays in an anchored React popover, not the old workspace',async()=>{
 const [component,css,view,app]=await Promise.all([
  get('app/components/CookieExport.jsx'),get('src/react.css'),
  get('app/components/CookieEditorView.jsx'),get('app/CookieEditorApp.jsx')]);
 assert.match(component,/role="dialog"/);
 assert.match(component,/aria-modal="false"/);
 assert.doesNotMatch(component,/<dialog\b|showModal\(/);
 assert.match(component,/<CookieExportFormatRow /);
 assert.match(component,/<CookieExportActions /);
 assert.match(view,/className="cookie-export-popover"/);
 assert.match(app,/exportContent=\{cookieReady&&exportOpen\?<CookieExport/);
 assert.match(css,/\.cookie-export-popover\{/);
 assert.doesNotMatch(css,/\.cookie-export-workspace\{/);
});

test('R5.26 React project version matches the official Cookie release identity',async()=>{
  const [config,project,installed]=await Promise.all([
    get('tool.config.json').then(JSON.parse),
    get('package.json').then(JSON.parse),
    get('cookie-editor.opendesk-tool.json').then(JSON.parse)
  ]);
  assert.equal(config.id,'cookie-editor');
  assert.equal(project.version,config.version);
  assert.equal(installed.version,config.version);
  assert.equal(installed.id,config.id);
  assert.equal(installed.uiRuntime,'opendesk.react-ui.v1');
});


test('R5.38 clearing Host-only cookies uses first React dialog confirmation, not second Host review',async()=>{
  const [app,controller,adapter,host,gate]=await Promise.all([
    get('app/CookieEditorApp.jsx'),get('app/controller/cookie-controller.js'),
    get('app/adapters/browser-sdk.js'),sourceHost(),getHostGate()
  ]);
  assert.match(app,/onConfirm=\{\(\)=>endConfirm\(true\)\}/);
  assert.match(app,/controller\.executeClear\(\)/);
  assert.match(controller,/const allowed=await adapter\.beginClearIntent\(/);
  assert.match(controller,/await adapter\.clearExecute\(/);
  assert.match(adapter,/request\('cookieEditor\.clear\.begin'/);
  assert.match(adapter,/request\('cookieEditor\.clear\.finish'/);
  assert.match(host,/operation==='cookieEditor\.clear\.begin'/);
  assert.match(host,/cookieClearGate\.consume\(/);
  assert.match(host,/!importBatchOwner&&!writeIntentOwner&&!clearIntentOwner/);
  assert.match(gate,/verifiedUserActivation!==true/);
  assert.match(gate,/maxCookies!==50/);
  assert.match(gate,/documentKey\(document\)!==original\.documentKey/);
});
const sourceHost=()=>readFile(new URL('../../src/ui/sidebar-tools.js',import.meta.url),'utf8');
const getHostGate=()=>readFile(new URL('../../src/ui/sidebar-tools/cookie-clear-intent.js',import.meta.url),'utf8');

test('account actions retain current trusted receipts without password management',async()=>{
 const [app,accounts,mock]=await Promise.all([
  get('app/CookieEditorApp.jsx'),get('app/components/CookieAccounts.jsx'),
  get('preview/react/src/mock-sdk.js')
 ]);
 assert.match(app,/live\.epoch===requestedEpoch/);
 assert.match(app,/if\(!sameAccountContext\(\)\)return/);
 assert.match(app,/if\(!sameCopyContext\(\)\)return/);
 assert.doesNotMatch(app,/onUnlock|onLock|passphrase/);
 assert.doesNotMatch(accounts,/本机加密仓库|cookie-account-vault|onUnlock|onLock|type="password"/);
 assert.doesNotMatch(mock,/action==='(?:unlock|lock)'|passphrase/);
});

test('The account product layout has no preview-only teaching banner',async()=>{
 const [component,baseline]=await Promise.all([
  get('app/components/CookieAccounts.jsx'),get('preview/cookie-editor.html')
 ]);
 assert.doesNotMatch(component,/这是源自正式 React 组件的虚构数据演示/);
 assert.doesNotMatch(baseline,/这是源自正式 React 组件的虚构数据演示/);
 assert.match(component,/<CookieAccountShare/);
});
