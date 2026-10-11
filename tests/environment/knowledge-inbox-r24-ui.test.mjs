import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {officialMarketApps} from '../../src/marketplace/catalog.js';
import {officialFixtures} from '../helpers/official-tools.mjs';
import {createSidebarToolPackage,encodeSidebarToolPackage} from '../../scripts/build-sidebar-tool.mjs';
const official=await officialFixtures();
const generated=encodeSidebarToolPackage(await createSidebarToolPackage('examples/sidebar-tools/knowledge-inbox')).toString('utf8');
const builtin=official.resources.get('official-tools/knowledge-inbox/knowledge-inbox.opendesk-tool.json').toString('utf8');

// Static contract tests complement, but never replace, the real CFT iframe test.
const path='examples/sidebar-tools/knowledge-inbox/';
const [html,css,js,config]=await Promise.all([
  readFile(path+'src/index.html','utf8'),
  readFile(path+'src/style.css','utf8'),
  readFile(path+'src/main.js','utf8'),
  readFile(path+'tool.config.json','utf8')
]);
test('R24 ships the same readable package as the official built-in tool',()=>{
  const meta=JSON.parse(config),pkg=JSON.parse(generated);
  assert.equal(pkg.version,meta.version);
  assert.equal(pkg.html,html);assert.equal(pkg.css,css);assert.equal(pkg.js,js);
  assert.equal(generated,builtin);
  assert.deepEqual(pkg.capabilities,['page.capture','knowledge.store','user.export']);
  const listing=officialMarketApps(official.catalog).find(app=>app.toolId===pkg.id);
  assert.ok(listing,'Official marketplace listing must exist');
  assert.equal(listing.version,pkg.version,'Market version must track the package');
  assert.equal(listing.title,pkg.title,'Market title must track the package');
});
test('R24 defaults to reading and separates editing, status, confirmation, export',()=>{
  for(const id of ['ki-list-view','ki-detail','ki-reader','ki-markdown','ki-editor','ki-edit',
    'ki-save','ki-copy','ki-more','ki-confirm','ki-original','ki-copy-fallback',
    'ki-tag-filter','ki-sort','ki-clear','ki-reset','ki-list-loading'])
    assert.match(html,new RegExp('id="'+id+'"'));
  assert.match(html,/<section id="ki-editor"[^>]*hidden>/);
  assert.match(html,/<section id="ki-reader"[^>]*>/);
  assert.match(html,/id="ki-records"[^>]*aria-describedby="ki-keyboard-help"/);
  assert.match(html,/id="ki-keyboard-help"/);
  const menu=html.indexOf('id="ki-manage"'),refresh=html.indexOf('id="ki-refresh"');
  assert.ok(menu>=0&&refresh>menu&&refresh<html.indexOf('</details>',menu),'refresh is grouped under low-frequency management');
  assert.match(html,/<button id="ki-save"[^>]*disabled>/);
  assert.match(html,/role="alertdialog"/);
  assert.match(html,/role="status"/);
  assert.doesNotMatch(html,/on(?:click|input|change)\s*=|<script\b|<iframe\b/i);
});
test('R24 Markdown presentation is DOM-only, URL restricted, without auto image requests',()=>{
  assert.match(js,/doc\.createTextNode/);
  assert.match(js,/firstNonBlankLine&&headingText===selected\?\.title\?\.trim\(\)/,'matching initial title is only hidden from reader');
  assert.match(js,/textContent/);
  assert.match(js,/url\.protocol/);
  assert.match(js,/noopener noreferrer/);
  assert.match(js,/doc\.createElement\('pre'\)/);
  assert.match(js,/doc\.createElement\('table'\)/);
  assert.doesNotMatch(js,/\.\s*innerHTML\s*=/);
  assert.doesNotMatch(js,/doc\.createElement\(['"](?:img|script|iframe)['"]\)/i);
  assert.doesNotMatch(js,/\bfetch\s*\(|\bchrome\.(?:runtime|tabs|storage)/);
});
test('R24 avoids a permanent status banner and provides selection/focus safeguards',()=>{
  assert.match(js,/editorStateQueue/);
  assert.match(js,/OpenDeskTool\.setState\?\.\(\{dirty,busy\}\)/,'R24 must use the sandbox state object contract');
  assert.doesNotMatch(js,/OpenDeskTool\.setState\?\.\(dirty,busy\)/,'Positional booleans cannot clear sandbox state');
  assert.match(js,/ifRevision:selected\.revision/);
  assert.match(js,/setDirty\(false\)/);
  assert.match(js,/restoring&&text===selected\.markdown\?null/,'Restore must not discard later edits');
  assert.match(js,/document|doc\.activeElement/);
  assert.match(js,/generation\+\+/);
  assert.match(js,/querySelectorAll\('button\.ki-record:not\(:disabled\)'\)/,'Arrow/Home/End traverse visible record buttons');
  assert.match(js,/event\.key==='Escape'/,'Keyboard Escape uses dirty-safe navigation');
  assert.match(css,/\.ki \.ki-view-title:focus-visible/,'Programmatic heading focus remains visible to keyboard users');
  assert.match(js,/q\('copy-fallback'\)\.select\(\)/);
  assert.match(js,/q\('status'\)\.hidden/);
});
test('R24 CSS is sandbox-scoped, responsive and usable in light and dark themes',()=>{
  assert.match(css,/@media\(min-width:700px\)/);
  assert.match(css,/@media\(max-width:359px\)/);
  assert.match(css,/@media\(prefers-color-scheme:dark\)/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
  assert.match(css,/\.ki-markdown pre/);
  assert.match(css,/\.ki-filters\{[^}]*overflow-x:auto/);
  assert.match(css,/\.ki-confirm-layer/);
  assert.doesNotMatch(css,/@import\b|url\(\s*['"]?\s*https?:/);
});

test('manual knowledge entry is a first-class list and empty-state action, not a buried settings item',()=>{
  for(const id of ['ki-new','ki-empty-new','ki-create-view','ki-create-title','ki-create-body',
    'ki-create-kind','ki-create-tags','ki-create-note','ki-create-size','ki-create-state',
    'ki-create-save','ki-create-cancel'])
    assert.match(html,new RegExp('id="'+id+'"'));
  assert.match(html,/<section id="ki-create-view"[^>]*hidden>/);
  assert.match(html,/<button id="ki-create-save"[^>]*disabled>/);
  assert.match(html,/不需要打开 ChatGPT，也不需要网站授权/);
  const toolbar=html.slice(html.indexOf('class="ki-toolbar"'),html.indexOf('</div>',html.indexOf('class="ki-toolbar"')));
  assert.match(toolbar,/id="ki-delete"/,'Delete is directly visible on a record detail toolbar');
  assert.doesNotMatch(html.slice(html.indexOf('id="ki-more"'),html.indexOf('</details>',html.indexOf('id="ki-more"'))),/id="ki-delete"/);
  assert.match(js,/request\('knowledge\.create',createPayload\(\)\)/);
  assert.match(js,/q\('create-view'\)\.hidden=true/);
  assert.match(js,/setDirty\(false\);creating=false/);
  assert.match(js,/if\(creating\)\{/);
  assert.match(js,/void cancelCreate\(\)/);
  assert.match(js,/q\('source'\)\.hidden=!record\.source/);
  assert.match(css,/\.ki-head-actions/);
  assert.match(css,/\.ki-create-view/);
});

test('R24.5 detail editing starts with title and body, collapses secondary metadata, and exposes save/cancel',()=>{
  const editor=html.slice(html.indexOf('<section id="ki-editor"'),html.indexOf('id="ki-copy-fallback"'));
  const create=html.slice(html.indexOf('<section id="ki-create-view"'),html.indexOf('<section id="ki-detail"'));
  for(const section of [editor,create]){
    const title=section.indexOf('class="ki-title-input"'),body=section.indexOf('class="ki-content"');
    const extra=section.indexOf('class="ki-extra-details"'),actions=section.indexOf('class="ki-editor-actions"');
    assert.ok(title>=0&&body>title&&extra>body&&actions>extra,'content must precede the optional metadata');
    assert.doesNotMatch(section.slice(0,body),/class="ki-meta-grid"|ki-editor-intro/,'intro and metadata cannot crowd content above Markdown');
    assert.match(section,/<details id="ki-(?:editor|create)-extra" class="ki-extra-details">/,'metadata is collapsed by default');
    assert.doesNotMatch(section,/<details id="ki-(?:editor|create)-extra"[^>]*\bopen\b/);
  }
  for(const id of ['ki-editor-extra-summary','ki-create-extra-summary','ki-edit-cancel',
    'ki-create-discard','ki-view-meta','ki-toolbar','ki-writing-label'])
    assert.match(html,new RegExp('id="'+id+'"'));
  assert.match(html,/<span id="ki-writing-label"[^>]*hidden>/);
  assert.match(js,/function detailLayout\(isEditing\)/);
  assert.match(js,/q\('detail'\)\.dataset\.mode=isEditing\?'edit':'read'/);
  assert.match(js,/for\(const id of \['view-title','view-meta','date','toolbar','original-details'\]\)/);
  assert.match(js,/q\('editor-extra'\)\.open=false/);
  assert.match(js,/q\('create-extra'\)\.open=false/);
  assert.match(js,/q\('edit-cancel'\)\.addEventListener\('click',action\(toggleEdit\)\)/);
  assert.match(js,/q\('create-discard'\)\.addEventListener\('click',cancelCreate\)/);
  assert.match(js,/q\('title'\)\.value=selected\.title/,'reopening editor restores persisted title');
  assert.match(css,/\.ki \.ki-writing-view \.ki-content\{[^}]*min-height:clamp\(340px,54vh,680px\)/);
  assert.match(css,/\.ki \.ki-extra-details>summary/);
  assert.match(css,/@media\(max-width:399px\)/,'narrow screens keep an independent layout');
});
