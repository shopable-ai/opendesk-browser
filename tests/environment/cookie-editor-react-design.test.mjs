import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {SHARED_DESIGN_MARKER,assertLayoutOnly,compileSharedToolCss} from '../../scripts/preview/shared-tool-design.mjs';

const root='examples/sidebar-tools/cookie-editor/';

test('installed CSS owns the approved icon and row geometry without preview overrides',async()=>{
  const css=await readFile(root+'src/react.css','utf8');
  const preview=await readFile(root+'preview/react/src/style.css','utf8');
  assert.match(css,/\.cookie-editor-react svg\{width:17px;height:17px;flex:none\}/);
  const approved=await readFile(root+'preview/cookie-editor.html','utf8');
  assert.match(approved,/\.cookie-trigger\{[^}]*min-height:50px;[^}]*padding:9px 13px/);
  assert.match(css,/\.row-trigger\{[^}]*min-height:50px;[^}]*padding:9px 13px/);
  assert.match(css,/\.row-text small\{[^}]*white-space:nowrap;[^}]*text-overflow:ellipsis/);
  assert.doesNotMatch(preview,/\.cookie-app (?:svg|\.row-trigger|\.row-text)/);
});
test('official shared design compiles candidate CSS without global component skins',async()=>{
  const css=await readFile(root+'src/react.css','utf8');
  assert.doesNotThrow(()=>assertLayoutOnly(css));
  const compiled=await compileSharedToolCss(css);
  assert.match(compiled,/^\/\* opendesk\.shared-design\.v1 sha256=/);
  assert.match(compiled,/\.od-button\{/);
  assert.match(compiled,/\.od-icon-button\{/);
  assert.match(compiled,/:is\(input,select,textarea\)\.od-field\{/);
  assert.doesNotMatch(css,/max-width:\s*380px|width:\s*min\(100%,380px\)/);
});
test('compiled Cookie development CSS passes the shared design gate',async()=>{
  const releaseCss=await readFile(root+'dist/tool.css','utf8');
  assert.ok(releaseCss.trimStart().startsWith(SHARED_DESIGN_MARKER));
  assert.doesNotThrow(()=>assertLayoutOnly(releaseCss));
  const compiled=await compileSharedToolCss(releaseCss);
  assert.match(compiled,/^\/\* opendesk\.shared-design\.v1 sha256=/);
  assert.match(compiled,/\.cookie-clear-dialog::backdrop\{/);
});
test('real React app relies on shared buttons, fields and surfaces',async()=>{
  const paths=['app/CookieEditorApp.jsx','app/components/CookieEditorView.jsx',
    'app/components/CookieInlineEditor.jsx','app/components/CookieImport.jsx',
    'app/components/CookieExport.jsx','app/components/CookiePermissions.jsx',
    'app/components/CookieOfflineWorkspace.jsx'];
  const files=await Promise.all(paths.map(path=>readFile(root+path,'utf8')));
  const [app,view,editor]=files;
  assert.match(app,/className="(?:[^"\s]+\s+)*od-surface(?:\s+[^"\s]+)*"/);
  assert.match(view,/od-icon-button/);
  assert.match(view,/cookie-button--choice/);
  assert.match(editor,/od-field/);
  for(const src of files.slice(2))assert.doesNotMatch(src,/<button\b/);
});

test('inline import stays before Cookie rows inside the mounted list scroll area',async()=>{
  const [css,app,importer,view,host]=await Promise.all([
    readFile(root+'src/react.css','utf8'),
    readFile(root+'app/CookieEditorApp.jsx','utf8'),
    readFile(root+'app/components/CookieImport.jsx','utf8'),
    readFile(root+'app/components/CookieEditorView.jsx','utf8'),
    readFile('src/ui/sidebar-tools.js','utf8')
  ]);
  assert.match(css,/height:100dvh/);
  assert.match(css,/\.cookie-import-workspace/);
  assert.match(css,/\.cookie-editor-react\{[^}]*background:var\(--od-paper\)/);
  assert.match(css,/\.cookie-import-workspace\{\s*position:relative/);
  assert.doesNotMatch(css,/cookie-import-dismiss-layer|cookie-sheet-enter/);
  assert.match(css,/\.cookie-react-view>\.cookie-list/);
  assert.match(css,/\.cookie-offline/);
  assert.doesNotMatch(app,/panel===null&&<CookieEditorView/);
  assert.match(app,/importOpen=\{panel==='import'\}/);
  assert.match(importer,/<section ref={workspaceRef}/);
  assert.match(app,/importContent=\{panel==='import'\?<CookieImport/);
  assert.match(view,/beforeRows=\{importContent\} newEditor=\{newEditor\}/);
  assert.match(view,/className="cookie-list" aria-label="Cookie 列表">\s*\{beforeRows\}\s*\{newEditor\}/);
  assert.ok(view.indexOf('<CookieToolbar count=')<view.indexOf('<CookieRows site='));
  assert.match(importer,/role="region" aria-labelledby=\{headingId\}/);
  assert.doesNotMatch(importer,/aria-modal|role="dialog"|cookie-import-dismiss-layer|event\.key[!=]+\s*['"]Tab['"]|document\.activeElement/);
  assert.doesNotMatch(view,/inert=\{importOpen\}|haspopup="dialog" expanded=\{importOpen\}/);
  assert.match(importer,/if\(event\.key!=='Escape'\)return;\s*event\.preventDefault\(\);event\.stopPropagation\(\);close\(\)/);
  assert.match(view,/cookie-import-file-picker od-button od-button--secondary cookie-button--compact/);
  assert.doesNotMatch(view,/className="dropzone-symbol"|className="dropzone-copy"/);
  assert.doesNotMatch(importer,/<dialog\b|showModal\(/);
  assert.match(host,/const fitCookieFrame=/);
  assert.match(host,/if\(active\?\.id==='cookie-editor'\)\{fitCookieFrame\(\);return;\}/);
});

test('R3.2 approved HTML maps to the installed six-tab layout and redacted Cookie row metadata',async()=>{
  const [html,app,view,accounts,css]=await Promise.all([
    readFile(root+'preview/cookie-editor.html','utf8'),
    readFile(root+'app/CookieEditorApp.jsx','utf8'),
    readFile(root+'app/components/CookieEditorView.jsx','utf8'),
    readFile(root+'app/components/CookieAccounts.jsx','utf8'),
    readFile(root+'src/react.css','utf8')]);
  for(const id of ['tabCookies','tabAccounts','tabEnterprise','tabMarket','tabCustom','tabCircle'])
    assert.match(html,new RegExp('id="'+id+'"'));
  for(const key of ['cookie','accounts','enterprise','market','custom','circle'])
    assert.match(app,new RegExp("'"+key+"'"));
  assert.match(app,/className="cookie-product-pane"/);
  assert.match(css,/\.cookie-editor-react>\.cookie-product-pane\{/);
  assert.match(css,/\.cookie-editor-react \.cookie-editor-workspace\{/);
  assert.match(view,/cookieRowExpiryLabel\(row\)/);
  for(const flag of ['HttpOnly','Secure','Partitioned'])
    assert.match(view,new RegExp('<abbr title="'+flag+'"'));
  assert.ok(accounts.indexOf('className="cookie-account-current"')<
    accounts.indexOf('<CookieMembershipRecommendations origin={origin}/>'),
    'optional membership must not precede the trusted current-account strip');
  assert.match(accounts,/cookie-account-security-note/);
});
