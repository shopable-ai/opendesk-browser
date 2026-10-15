import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createSidebarToolPackage} from '../../scripts/build-sidebar-tool.mjs';
import {validateSidebarToolPackage,serializeSidebarToolPackage} from '../../src/ui/sidebar-tools/package.js';
import {
  canonicalUiLocale,resolveUiLocale,compileToolLocaleCatalog,uiMessage,
  createUiLocaleController,UI_LOCALE_STORE
} from '../../src/ui/app-localization.js';

const root='examples/sidebar-tools/reading-toc/';
const getCatalog=async()=>JSON.parse(await readFile(root+'locales.json','utf8'));

test('R1.2 language resolution prefers exact, falls back to base then source',()=>{
  assert.equal(canonicalUiLocale('EN-us'),'en-US');
  assert.equal(canonicalUiLocale('ja_JP'),null);
  assert.equal(resolveUiLocale('en-US',['zh-CN','en']),'en');
  assert.equal(resolveUiLocale('en-GB',['zh-CN','en']),'en');
  assert.equal(resolveUiLocale('en-GB',['zh-CN','en-US','en-GB']),'en-GB');
  assert.equal(resolveUiLocale('en-AU',['zh-CN','en-GB','en-US']),'zh-CN',
    'ambiguous regional dialects must not be selected arbitrarily');
  assert.equal(resolveUiLocale('fr-FR',['zh-CN','en']),'zh-CN');
  assert.equal(resolveUiLocale(undefined,['zh-CN','en']),'zh-CN');
});

test('R1.2 reviewed source and EN resource compile safely with placeholder fallback',async()=>{
  const catalog=compileToolLocaleCatalog(await getCatalog());
  assert.equal(uiMessage(catalog,'en-US','refreshLabel'),'Refresh table of contents');
  assert.equal(uiMessage(catalog,'zh-CN','refreshLabel'),'刷新阅读目录');
  assert.equal(uiMessage(catalog,'en-GB','moreAria',{count:3}),
    '3 sections are hidden. View full contents');
  const partial=structuredClone(catalog);
  delete partial.messages.en.refreshLabel;
  assert.equal(uiMessage(partial,'en','refreshLabel'),'刷新阅读目录');
  assert.equal(uiMessage(partial,'de','refreshLabel'),'刷新阅读目录');
  const source=await getCatalog();
  const outdated=structuredClone(source);
  outdated.messages['zh-CN'].refreshLabel='重新刷新目录';
  assert.throws(()=>compileToolLocaleCatalog(outdated),/E_TOOL_LOCALE_STALE_OR_UNSAFE/);
  const unsafe=structuredClone(source);
  unsafe.messages.en.refreshLabel.text='<img onerror=alert(1)>';
  assert.throws(()=>compileToolLocaleCatalog(unsafe),/E_TOOL_LOCALE_STALE_OR_UNSAFE/);
  const tokens=structuredClone(source);
  tokens.messages.en.moreAria.text='See {items} more';
  assert.throws(()=>compileToolLocaleCatalog(tokens),/E_TOOL_LOCALE_STALE_OR_UNSAFE/);
});

test('R1.2 existing v1 package stays strict, with all reviewed words embedded offline',async()=>{
  const pkg=await createSidebarToolPackage(root);
  assert.equal(pkg.version,'1.0.6');
  assert.equal(pkg.id,'reading-toc');
  assert.equal(pkg.format,'opendesk.sidebar-tool.v1');
  assert.deepEqual(pkg.capabilities,['page.toc']);
  assert.equal(Object.hasOwn(pkg,'locales'),false);
  assert.equal(Object.hasOwn(pkg,'scripts'),false);
  assert.equal(validateSidebarToolPackage(pkg).version,pkg.version);
  assert(!pkg.js.includes('__OPENDESK_TOOL_MESSAGES__'));
  assert(pkg.js.includes('Refresh table of contents'));
  assert(pkg.js.includes('正在读取当前网页目录'));
  assert(pkg.js.includes('onLocaleChange'));
  assert.equal(await readFile(root+'reading-toc.opendesk-tool.json','utf8'),
    serializeSidebarToolPackage(pkg),
    'source-directory manual install file must be byte-identical to the official packer');
  assert(!/fetch\s*\(|https?:\/\//.test(pkg.js),'tool translation needs no remote translation service');
});

test('R1.2 application choice is stored only by trusted host; read/write errors keep source',async()=>{
  const callbacks=new Set();
  const saved={};
  const api={storage:{
    local:{async get(key){return {[key]:saved[key]};},async set(values){
      Object.assign(saved,values);
      for(const fn of callbacks)fn(Object.fromEntries(Object.entries(values).map(
        ([key,newValue])=>[key,{newValue}])), 'local');
    }},
    onChanged:{addListener(fn){callbacks.add(fn);},removeListener(fn){callbacks.delete(fn);}}
  }};
  const controller=createUiLocaleController(api);
  await controller.ready;
  assert.equal(controller.getLocale(),'zh-CN');
  const seen=[];const unsubscribe=controller.subscribe(value=>seen.push(value));
  await controller.setLocale('en');
  assert.equal(saved[UI_LOCALE_STORE],'en');
  assert.equal(controller.getLocale(),'en');
  assert.deepEqual(seen,['en']);
  await assert.rejects(controller.setLocale('en<script>'),/E_UI_LOCALE_INVALID/);
  unsubscribe();controller.dispose();
  const missing=createUiLocaleController({storage:{local:{async get(){throw Error('no disk');}}}});
  await missing.ready;assert.equal(missing.getLocale(),'zh-CN');missing.dispose();
});

test('R1.2 source wiring covers both trusted webpage overlay and sandbox without a new SDK',async()=>{
  const [overlay,page,bridge,host,pkgBuilder,official] = await Promise.all([
    readFile('src/reading-toc/view.js','utf8'),
    readFile('src/reading-toc/page.js','utf8'),
    readFile('src/sidebar-tools/bridge.js','utf8'),
    readFile('src/ui/sidebar-tools.js','utf8'),
    readFile('scripts/build-sidebar-tool.mjs','utf8'),
    readFile('scripts/build-official-tools.mjs','utf8')
  ]);
  assert.match(overlay,/setLocale\(next\)/);
  assert.match(overlay,/readingTocCatalog/);
  assert.match(page,/UI_LOCALE_STORE/);
  assert.match(page,/view\?\.setLocale\(uiLocale\)/);
  assert.match(bridge,/kind==='locale-changed'/);
  assert.match(bridge,/onLocaleChange/);
  assert.match(host,/kind:'locale-changed'/);
  assert.match(pkgBuilder,/compileToolLocaleCatalog/);
  assert.match(official,/config\.locales\?\[config\.locales\]/);
});
