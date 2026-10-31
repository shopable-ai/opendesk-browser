import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, writeFile, rm} from 'node:fs/promises';
import {join, dirname, resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {load} from 'cheerio';
import {createPreviewKit, checkPreview, createComponentReference} from '../../scripts/sidebar-preview-kit.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const kit = await createPreviewKit({title:'我的工具'});
const change = fn => { const $ = load(kit.html); fn($); return $.html(); };

test('self-contained preview uses the exact current canonical CSS and passes contract', async () => {
  const $ = load(kit.html);
  const originalTokens=await readFile(join(root,'src/ui/design-tokens.css'),'utf8');
  assert.ok($('#od-preview-production-css').text().includes(originalTokens+'\n'),
    'canonical token source is embedded unchanged');
  assert.match($('#od-preview-production-css').text(), /:root\{color-scheme:light;/,
    'preview restores the original light palette even for dark-mode operating systems');
  assert.ok($('#od-preview-production-css').text().includes(
    await readFile(join(root,'src/ui/design-system.css'),'utf8')+'\n'+
    await readFile(join(root,'src/ui/react/components/ui/sidebar-shared.css'),'utf8')));
  assert.equal((await checkPreview(kit.html)).ok, true);
  assert.equal(kit.manifest.nativeChrome, 'NOT_TESTED');
  assert.equal(kit.manifest.realAI, 'NOT_TESTED');
  assert.ok(Object.keys(kit.manifest.inputs).includes('scripts/preview/sidebar-shell-behavior.js'));
  assert.match($('#od-preview-production-css').text(), /\.od-shared-switch\[data-selected\]/);
});

test('shared Switch source is a hashed canonical input and cannot drift silently', async () => {
  const temp = await mkdtemp(join(tmpdir(),'od-preview-switch-'));
  try {
    for (const path of Object.keys(kit.manifest.inputs)) {
      await mkdir(dirname(join(temp,path)),{recursive:true});
      await writeFile(join(temp,path),await readFile(join(root,path)));
    }
    const path = join(temp,'src/ui/react/components/ui/sidebar-shared.css');
    await writeFile(path,(await readFile(path,'utf8'))+'\n/* changed canonical Switch */');
    const result = await checkPreview(kit.html,{repoRoot:temp});
    assert.equal(result.ok,false);
    assert.ok(result.errors.some(error=>error.includes('过期')));
    assert.ok(result.errors.some(error=>error.includes('od-preview-production-css')));
  } finally { await rm(temp,{recursive:true,force:true}); }
});

test('reading design frame adds layout only, without replacing canonical components', () => {
  const $ = load(kit.html);
  const frame = $('#od-preview-frame').text();
  const readingRules = frame.slice(frame.indexOf('/* Reading design only:'),frame.indexOf('#od-preview-app[data-preview-theme='));
  assert.match(readingRules,/\.preview-reading-overlay\{position:absolute/);
  assert.match(readingRules,/\.preview-reading-article\{height:680px;overflow:auto/);
  assert.doesNotMatch(readingRules,/(?:^|[;{])\s*(?:color|background|border|font|box-shadow|transition)[\w-]*\s*:/);
  assert.doesNotMatch(readingRules,/(?:^|})\s*\.(?:od-|preview-(?!reading-))/);
});

test('titles are escaped once, including placeholder-looking input', async () => {
  const title = '<style>\"& {{TOKENS}}';
  const result = await createPreviewKit({title}); const $ = load(result.html);
  assert.equal(JSON.parse($('#opendesk-preview-shell-data').text()).title, title);
  assert.equal($('style').length, 3);
  assert.equal((await checkPreview(result.html)).ok, true);
  await assert.rejects(createPreviewKit({title:' '}));
});

test('legitimate content and local behavior changes preserve the locked frame', async () => {
  const html = change($ => { $('#app-status').text('修改后的工具状态'); $('#od-preview-behavior').append('\n document.querySelector("#app-status").textContent = "本地模拟";'); });
  assert.equal((await checkPreview(html)).ok, true);
});

test('component recipe output compiles the real shared sources and keeps diagnostics outside the app', async () => {
  const reference=await createComponentReference(kit),$=load(reference.html);
  for(const path of ['button.tsx','card.tsx','switch.tsx'])assert.ok(Object.keys(reference.inputs).some(name=>name.endsWith('/'+path)));
  assert.ok(Object.keys(reference.inputs).some(name=>name.includes('react-aria-components')));
  assert.equal($('#od-preview-app #od-preview-recipe-controls').length,0);
  assert.equal($('#od-preview-controls #od-preview-recipe-controls').length,1);
  assert.match(reference.guide,/import \{Button, IconButton, Card, CardContent, Switch\} from '@opendesk\/ui'/);
  assert.match(reference.guide,/没有共享 Field\/Select\/Dialog/);
  assert.equal(reference.evidence,'SOURCE_COMPONENT_PREVIEW');
});

test('conflicting button variants, broken descriptions and moved reference links fail', async () => {
  for(const mutate of [
    $=>$('#create-item').addClass('od-button--secondary od-button--danger'),
    $=>$('#item-title').attr('aria-describedby','missing-error'),
    $=>$('#od-preview-app').append($('#od-component-reference-link')),
    $=>$('#od-component-reference-link').attr('href','https://example.invalid')
  ])assert.equal((await checkPreview(change(mutate))).ok,false);
});

test('modified style snapshots, frame, source identity and CSP fail', async t => {
  const variants = [
    $ => $('#od-preview-production-css').append('.od-button{color:red}'),
    $ => $('#od-preview-frame').text('body{margin:0}'),
    $ => $('aside').remove(),
    $ => $('meta[name="od-preview-source"]').attr('content','old'),
    $ => $('meta[http-equiv]').remove()
  ];
  for (const [i, variant] of variants.entries()) await t.test(String(i), async () => assert.equal((await checkPreview(change(variant))).ok, false));
});

test('stale canonical inputs are rejected instead of treating an old kit as current', async () => {
  const temp = await mkdtemp(join(tmpdir(),'od-preview-inputs-'));
  try {
    for (const path of Object.keys(kit.manifest.inputs)) {
      await mkdir(dirname(join(temp,path)),{recursive:true});
      await writeFile(join(temp,path),await readFile(join(root,path)));
    }
    await writeFile(join(temp,'src/ui/design-tokens.css'),'/* changed canonical tokens */');
    const result = await checkPreview(kit.html,{repoRoot:temp});
    assert.equal(result.ok,false); assert.ok(result.errors.some(e => e.includes('过期')));
  } finally { await rm(temp,{recursive:true,force:true}); }
});

test('alternate CSS, resources, events and execution entry points fail', async t => {
  const inserts = [
    '<style>.od-button{border-radius:99px}</style>',
    '<div style="color:red">override</div>',
    '<script>alert(1)</script>',
    '<img src="https://example.invalid/test.png">',
    '<button class="od-button" type="button" onclick="alert(1)">测试</button>',
    '<iframe srcdoc="test"></iframe>',
    '<div id="app-status"></div>'
  ];
  for (const [i, insert] of inserts.entries()) await t.test(String(i), async () => {
    assert.equal((await checkPreview(change($ => $('#od-preview-app').append(insert)))).ok,false);
  });
});

test('button, field, heading and status regressions fail', async t => {
  const variants = [
    $ => $('#create-item').attr('class','custom-button'),
    $ => $('#create-item').removeAttr('type'),
    $ => $('#create-item').text(''),
    $ => $('#item-title').removeAttr('class'),
    $ => $('label[for="item-title"]').remove(),
    $ => $('#od-preview-app').append('<h1>重复标题</h1>'),
    $ => $('#app-status,#item-error').remove()
  ];
  for (const [i, variant] of variants.entries()) await t.test(String(i), async () => assert.equal((await checkPreview(change(variant))).ok,false));
});

test('script syntax and obvious real capability/network/persistence use fail', async t => {
  for (const js of ['const =;', 'fetch("https://example.invalid")', 'chrome.tabs.query({})', 'OpenDeskTool.request("storage.get")', 'localStorage.setItem("a","b")', 'import("https://example.invalid/x.js")']) {
    await t.test(js, async () => assert.equal((await checkPreview(change($ => $('#od-preview-behavior').text(js)))).ok,false));
  }
});

test('CLI creates a complete bundle, checks it, and refuses to overwrite output', async () => {
  const temp = await mkdtemp(join(tmpdir(),'od-preview-cli-')), out = join(temp,'bundle');
  const run = args => spawnSync(process.execPath,['scripts/sidebar-preview-kit.mjs',...args],{cwd:root,encoding:'utf8'});
  try {
    assert.equal(run(['create','--out',out,'--title','测试工具']).status,0);
    for (const file of ['preview.html','components.html','component-recipes.md','chatgpt-prompt.txt','manifest.json']) assert.ok((await readFile(join(out,file),'utf8')).length);
    assert.equal(run(['check',join(out,'preview.html')]).status,0);
    assert.notEqual(run(['create','--out',out]).status,0);
    assert.notEqual(run(['create','--out',join(root,'dist','preview-test')]).status,0);
  } finally { await rm(temp,{recursive:true,force:true}); }
});


test('designs reuse the canonical shell and keep simulation controls outside the application',async()=>{
  const $=load(kit.html);
  assert.equal($('.preview-device #preview-state').length,0);
  assert.equal($('#od-preview-app #reset-items').length,0);
  assert.equal($('#od-preview-app h1').length,0);
  assert.equal($('#tab-tools').length,1);
  assert.equal($('#sidebar-tool-remove').length,1);
  assert.equal($('#od-design-theme option').length,2);
  assert.equal((await checkPreview(change($=>$('#od-preview-behavior').text('void 0')))).ok,false,
    'model edits cannot remove shared navigation/uninstall behavior');
});
