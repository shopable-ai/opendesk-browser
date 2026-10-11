import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {OFFICIAL_APPS} from '../../src/marketplace/catalog.js';

// Static contract tests complement, but never replace, the real CFT iframe test.
const path='examples/sidebar-tools/knowledge-inbox/';
const [html,css,js,config,generated,builtin]=await Promise.all([
  readFile(path+'src/index.html','utf8'),
  readFile(path+'src/style.css','utf8'),
  readFile(path+'src/main.js','utf8'),
  readFile(path+'tool.config.json','utf8'),
  readFile(path+'knowledge-inbox.opendesk-tool.json','utf8'),
  readFile('src/sidebar-tools/knowledge-inbox.opendesk-tool.json','utf8')
]);
test('R24 ships the same readable package as the official built-in tool',()=>{
  const meta=JSON.parse(config),pkg=JSON.parse(generated);
  assert.equal(meta.version,'1.1.0');
  assert.equal(pkg.version,meta.version);
  assert.equal(pkg.html,html);assert.equal(pkg.css,css);assert.equal(pkg.js,js);
  assert.equal(generated,builtin);
  assert.deepEqual(pkg.capabilities,['page.capture','knowledge.store','user.export']);
  const listing=OFFICIAL_APPS.find(app=>app.toolId===pkg.id);
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
  assert.match(html,/<button id="ki-save"[^>]*disabled>/);
  assert.match(html,/role="alertdialog"/);
  assert.match(html,/role="status"/);
  assert.doesNotMatch(html,/on(?:click|input|change)\s*=|<script\b|<iframe\b/i);
});
test('R24 Markdown presentation is DOM-only, URL restricted, without auto image requests',()=>{
  assert.match(js,/doc\.createTextNode/);
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
  assert.match(js,/OpenDeskTool\.setState\?\.\(dirty,busy\)/,'R24 must clear the sandbox host dirty/saving channel');
  assert.match(js,/ifRevision:selected\.revision/);
  assert.match(js,/setDirty\(false\)/);
  assert.match(js,/restoring&&text===selected\.markdown\?null/,'Restore must not discard later edits');
  assert.match(js,/document|doc\.activeElement/);
  assert.match(js,/generation\+\+/);
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
