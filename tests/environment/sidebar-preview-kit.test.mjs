import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, writeFile, rm} from 'node:fs/promises';
import {join, dirname, resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {load} from 'cheerio';
import {createPreviewKit, checkPreview} from '../../scripts/sidebar-preview-kit.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const kit = await createPreviewKit({title:'我的工具'});
const change = fn => { const $ = load(kit.html); fn($); return $.html(); };

test('self-contained preview uses the exact current canonical CSS and passes contract', async () => {
  const $ = load(kit.html);
  assert.equal($('#od-preview-tokens').text(), await readFile(join(root,'src/ui/design-tokens.css'),'utf8'));
  assert.equal($('#od-preview-components').text(), await readFile(join(root,'src/ui/design-system.css'),'utf8'));
  assert.equal((await checkPreview(kit.html)).ok, true);
  assert.equal(kit.manifest.nativeChrome, 'NOT_TESTED');
  assert.equal(kit.manifest.realAI, 'NOT_TESTED');
  assert.equal(Object.keys(kit.manifest.inputs).length, 4);
});

test('titles are escaped once, including placeholder-looking input', async () => {
  const title = '<style>\"& {{TOKENS}}';
  const result = await createPreviewKit({title}); const $ = load(result.html);
  assert.equal($('h1').text(), title);
  assert.equal($('style').length, 3);
  assert.equal((await checkPreview(result.html)).ok, true);
  await assert.rejects(createPreviewKit({title:' '}));
});

test('legitimate content and local behavior changes preserve the locked frame', async () => {
  const html = change($ => { $('h1').text('修改后的工具'); $('#od-preview-behavior').text('document.querySelector("h1").textContent = "本地模拟";'); });
  assert.equal((await checkPreview(html)).ok, true);
});

test('modified style snapshots, frame, source identity and CSP fail', async t => {
  const variants = [
    $ => $('#od-preview-components').append('.od-button{color:red}'),
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
    for (const file of ['preview.html','chatgpt-prompt.txt','manifest.json']) assert.ok((await readFile(join(out,file),'utf8')).length);
    assert.equal(run(['check',join(out,'preview.html')]).status,0);
    assert.notEqual(run(['create','--out',out]).status,0);
    assert.notEqual(run(['create','--out',join(root,'dist','preview-test')]).status,0);
  } finally { await rm(temp,{recursive:true,force:true}); }
});
