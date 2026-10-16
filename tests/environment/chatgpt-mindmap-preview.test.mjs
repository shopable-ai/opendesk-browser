import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PREVIEW_CSP,PREVIEW_ASSETS_DIR,verifyFixedXmindAssets,startXmindPreview}
  from '../../examples/programs/chatgpt-mindmap/preview/serve.mjs';

const root=new URL('../../examples/programs/chatgpt-mindmap/',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('tests/xmind-provenance.json',root),'utf8'));

test('preview HTML loads four real sibling JS and imports shared product modules',async()=>{
  const html=await readFile(new URL('preview/index.html',root),'utf8');
  const app=await readFile(new URL('preview/app.js',root),'utf8');
  const registry=await readFile(new URL('src/answer-registry.js',root),'utf8');
  const launcher=await readFile(new URL('preview/serve.mjs',root),'utf8');
  const css=await readFile(new URL('assets/ui.css',root),'utf8');
  assert.match(app,/import \{createAnswerRegistry\} from '\/src\/answer-registry\.js'/);
  assert.match(app,/import \{requireXmindRuntime\} from '\/src\/xmind-adapter\.js'/);
  assert.match(registry,/from '\.\/view\.js'/);
  assert.match(html,/data-message-author-role="assistant"/);
  assert.match(html,/id="preview-large"/);
  assert.match(app,/cContent.replaceChildren/);
  assert.match(app,/first\.click\(\)/);
  assert.match(launcher,/autostart/);
  assert.match(launcher,/--no-open/);
  assert.match(css,/Noto Sans CJK SC/);
  assert.doesNotMatch(launcher,/prepareXmindPreviewAssets|\.runtime/);
  assert.doesNotMatch(html,/<canvas|data:image\/svg|https:\/\/cdn\./);
  assert.match(PREVIEW_CSP,/script-src 'self'/);
  assert.doesNotMatch(PREVIEW_CSP,/unsafe-eval/);
  let last=-1;
  for(const row of manifest.assets){
    const offset=html.indexOf('src="./'+row.name+'"');
    assert.ok(offset>last,'Expected original sibling JS and fixed loading order: '+row.name);
    last=offset;
  }
});
test('four exact Git-tracked originals are directly in preview/, not .runtime',async()=>{
  assert.match(PREVIEW_ASSETS_DIR,/chatgpt-mindmap\/preview$/);
  assert.deepEqual(manifest.assets.map(row=>row.name),[
    'jszip.min.js','polyfill-45b9836beb.min.js',
    'xmind-sdk.bundle.js','snowbrush-2c2b5d62b5.js']);
  assert.equal(manifest.assets.reduce((sum,row)=>sum+row.bytes,0),4042573);
  assert.match(manifest.distribution,/PRODUCTION_BLOCKED/);
  const resources=await verifyFixedXmindAssets();
  assert.equal(resources.size,4);
  for(const row of manifest.assets){
    const bytes=await readFile(new URL('preview/'+row.name,root));
    assert.equal(bytes.length,row.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'),row.sha256);
    assert.deepEqual(resources.get('/'+row.name),bytes);
  }
});
test('tampered or missing preview assets fail closed before a server is opened',async()=>{
  await assert.rejects(verifyFixedXmindAssets(''),/E_XMIND_ASSETS_REQUIRED/);
  const dir=await mkdtemp(join(tmpdir(),'odmm-preview-'));
  try{
    await writeFile(join(dir,'jszip.min.js'),'tampered');
    await assert.rejects(verifyFixedXmindAssets(dir));
    await assert.rejects(startXmindPreview({assetsDirectory:dir}));
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('localhost serves the exact four checked-in bytes without generating copies',async()=>{
  const session=await startXmindPreview();
  try{
    const page=await fetch(session.url);
    assert.equal(page.status,200);
    assert.match(await page.text(),/src="\.\/snowbrush-2c2b5d62b5\.js"/);
    for(const row of manifest.assets){
      const response=await fetch(new URL(row.name,session.url));
      assert.equal(response.status,200);
      const bytes=Buffer.from(await response.arrayBuffer());
      assert.equal(bytes.length,row.bytes);
      assert.equal(createHash('sha256').update(bytes).digest('hex'),row.sha256);
    }
  }finally{await session.close();}
});

test('ChatGPT simulated product UI and design MD are source-bound, not a second renderer',async()=>{
  const [html,css,shell,design]=await Promise.all([
    readFile(new URL('preview/chatgpt.html',root),'utf8'),
    readFile(new URL('preview/chatgpt.css',root),'utf8'),
    readFile(new URL('preview/chatgpt.js',root),'utf8'),
    readFile(new URL('preview/design.md',root),'utf8')
  ]);
  assert.match(html,/<title>ChatGPT · 思维导图交互预览/);
  assert.match(html,/id="preview-conversation"/);
  assert.match(html,/id="developer-lab"/);
  assert.match(html,/src="\/preview\/app\.js"/);
  assert.match(html,/src="\/preview\/chatgpt\.js"/);
  assert.equal((html.match(/data-message-author-role="assistant"/g)||[]).length,3);
  assert.equal((html.match(/data-testid="copy-turn-action-button"/g)||[]).length,3);
  assert.doesNotMatch(html,/>思维导图<\/button>/,'The program, not the mock HTML, must inject buttons');
  assert.match(css,/\.actions-row\{display:flex/);
  assert.match(css,/\.preview-conversation\.is-narrow\{max-width:320px/);
  assert.match(shell,/data-theme/);
  assert.match(shell,/replaceChildren\(mockIcon\(icon\)\)/,
    'Native-looking action icons belong only to the simulated shell');
  assert.match(shell,/document\.getElementById\('preview-conversation'\)\?\.addEventListener\('click'/,
    'Delegated mock actions survive DOM replacement without changing product controls');
  assert.doesNotMatch(shell,/createWorkbookEditor|createXmindRenderer|createAnswerRegistry/);
  assert.match(design,/PENDING_USER_CONFIRMATION/);
  assert.match(design,/src\/answer-registry\.js/);
  assert.match(design,/GLOBAL_STYLE_ISOLATION/);
  assert.match(design,/NOT_TESTED/);
  let last=-1;
  for(const row of manifest.assets){
    const offset=html.indexOf('src="./'+row.name+'"');
    assert.ok(offset>last,'ChatGPT mock must load original 4 JS in fixed order: '+row.name);
    last=offset;
  }
});

test('verified loopback serves the ChatGPT simulation with same CSP and denies arbitrary files',async()=>{
  const session=await startXmindPreview();
  try{
    for(const route of ['/chatgpt.html','/preview/chatgpt.css','/preview/chatgpt.js']){
      const response=await fetch(new URL(route,session.url));
      assert.equal(response.status,200,route);
      assert.match(response.headers.get('content-security-policy'),/script-src 'self'/);
      assert.doesNotMatch(response.headers.get('content-security-policy'),/unsafe-eval/);
      assert.ok((await response.text()).length>0);
    }
    assert.equal((await fetch(new URL('/preview/design.md',session.url))).status,404);
    assert.equal((await fetch(new URL('/preview/.runtime/engine.js',session.url))).status,404);
  }finally{await session.close();}
});

test('R3.3 production code alone owns theme, workbook skin and answer identity',async()=>{
  const [registry,view,adapter]=await Promise.all([
    readFile(new URL('src/answer-registry.js',root),'utf8'),
    readFile(new URL('src/view.js',root),'utf8'),
    readFile(new URL('src/xmind-adapter.js',root),'utf8')
  ]);
  assert.match(registry,/for\(const controller of controllers\)controller\.syncTheme\(\)/,
    'Open viewers must switch themes without the delayed answer rescan');
  assert.match(registry,/view\.setTheme\(theme==='true'\)/);
  assert.match(view,/renderer\.setTheme\(next\)/);
  assert.match(view,/host\.dataset\.skinReady=next/);
  assert.match(adapter,/await render\(folded,\{preserve:true,mode:target\}\)/,
    'Workbook skin is reloaded through the original SDK, preserving viewport');
  assert.doesNotMatch(registry,/createWorkbookEditor|document\.createElement\('canvas'\)/,
    'No parallel renderer may be created by the answer registry');
});


test('R3.5 icon toolbar is product-owned, mobile-capable and nonduplicating',async()=>{
  const [registry,view,css,adapter,probe]=await Promise.all([
    readFile(new URL('src/answer-registry.js',root),'utf8'),
    readFile(new URL('src/view.js',root),'utf8'),
    readFile(new URL('assets/ui.css',root),'utf8'),
    readFile(new URL('src/xmind-adapter.js',root),'utf8'),
    readFile(new URL('../../../tests/framework/chatgpt-mindmap-chatgpt-probe.mjs',root),'utf8')
  ]);
  assert.match(view,/const ICONS=\{/);
  assert.match(view,/createElementNS\('http:\/\/www\.w3\.org\/2000\/svg'/);
  assert.match(view,/aria-haspopup','menu'/);
  assert.match(view,/aria-expanded/);
  // Fullscreen may be requested while the renderer is being retired; optional chaining is intentional.
  assert.match(view,/await renderer\?\.reflow\(\)/);
  assert.match(registry,/buttonRef\.host\.hidden=!!view/);
  assert.match(registry,/view\?\.focusFullscreen\(\)/);
  assert.match(css,/@container \(max-width:390px\)/);
  assert.match(css,/\.odmm-menu \.odmm-menu-action\{display:flex;width:100%;min-width:100%/,
    'Menu text needs the full item hit target rather than overflowing the 44px icon');
  assert.match(css,/\.odmm-canvas::after\{content:'左右拖动查看分支'/,
    'A narrow canvas should disclose horizontal navigation without a secondary renderer');
  assert.match(css,/\.odmm-shell\{container-type:inline-size/,
    'The toolbar itself cannot query its own container size');
  assert.doesNotMatch(css,/\.odmm-toolbar\{container-type:inline-size/);
  assert.match(css,/:host\(\[hidden\]\)/);
  assert.match(adapter,/manualViewport/);
  assert.match(adapter,/canvas\.dataset\.fitWidth/);
  assert.match(probe,/screenshot-evidence\.json/);
  assert.match(probe,/SCREENSHOT_NOT_VERIFIED/);
  assert.doesNotMatch(view,/https:\/\/|unpkg|cdn\.|<canvas/);
});
