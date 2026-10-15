import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {createSidebarToolPackage} from '../../scripts/build-sidebar-tool.mjs';
import {generatePreview,buildPreview,previewReviewContext}
  from '../../scripts/preview/build-preview.mjs';
import {readingTocOverlayPreview} from '../../scripts/preview/reading-toc-overlay-source.mjs';
import {
  renderReadingTocTrustedLocales,verifyReadingTocTrustedLocales
} from '../../scripts/generate-reading-toc-locales.mjs';

test('R1.2 trusted locale resource is an exact, audited generated snapshot',async()=>{
  const result=await verifyReadingTocTrustedLocales();
  assert.equal(result.state,'MATCHED');
  const input=await readFile('examples/sidebar-tools/reading-toc/locales.json','utf8');
  const output=await readFile('src/reading-toc/locales.generated.js','utf8');
  assert.equal(output,renderReadingTocTrustedLocales(input));
  assert.match(output,/do not edit/);
  assert(!output.includes('import '));
  assert.throws(()=>renderReadingTocTrustedLocales(input.replace(
    '刷新阅读目录','重新刷新阅读目录')),/E_TOOL_LOCALE_STALE_OR_UNSAFE/,
    'editing source invalidates reviewed translations before trusted generation');
});

test('R1.2 same validated Side Panel JS/CSS executes in source-derived offline shell',async()=>{
  const pkg=await createSidebarToolPackage('examples/sidebar-tools/reading-toc');
  const preview=await generatePreview({tool:'reading-toc',surface:'side-panel',width:360,
    scenario:'success',theme:'light'});
  assert.equal(preview.manifest.tool,'reading-toc');
  assert.equal(preview.manifest.toolVersion,'1.0.6');
  assert.equal(preview.manifest.surface,'side-panel');
  assert.deepEqual(preview.manifest.operations,['toc.snapshot','toc.navigate']);
  assert.equal(preview.manifest.mock,true);
  assert.equal(preview.manifest.installed,false);
  assert.equal(preview.manifest.permissionsGranted,false);
  assert(preview.frameHtml.includes(Buffer.from(pkg.js).toString('base64')));
  assert(preview.frameHtml.includes(Buffer.from(pkg.css).toString('base64')));
  assert(preview.frameHtml.includes('connect-src \'none\''));
  assert(preview.html.includes('id="od-toc-surface"'));
  assert(preview.html.includes('id="od-toc-language"'));
  assert(preview.html.includes('id="od-toc-scenario"'));
  assert.match(preview.html,/srcdoc|FRAME_BASE64|atob\(/);
  assert.match(preview.html,/网页标题不翻译/);
  assert.match(preview.html,/sandbox="allow-scripts"/);
  assert(!preview.html.includes('allow-same-origin'));
  assert.equal(previewReviewContext(preview).simulation.network,false);
});

test('R1.2 source-backed webpage overlay uses actual trusted view+placement and zero privileges',async()=>{
  const original=await Promise.all([
    readFile('src/reading-toc/view.js','utf8'),
    readFile('src/reading-toc/placement.js','utf8'),
    readFile('src/ui/app-localization.js','utf8'),
    readFile('examples/sidebar-tools/reading-toc/locales.json','utf8')
  ]);
  const overlay=await readingTocOverlayPreview({scenario:'success'});
  const expected=createHash('sha256').update(JSON.stringify(original)).digest('hex');
  assert.equal(overlay.sourceSha256,expected);
  assert.equal(overlay.realView,true);
  assert.equal(overlay.mockData,true);
  assert.match(overlay.html,/script type="module" src="data:text\/javascript;base64,/);
  assert.match(overlay.html,/connect-src 'none'/);
  assert.match(overlay.html,/OpenDesk Browser 阅读指南/);
  assert(!/https?:\/\//.test(overlay.html));
  const inPage=await generatePreview({tool:'reading-toc',surface:'page-overlay',
    theme:'light',scenario:'empty',width:360});
  assert.equal(inPage.manifest.surface,'page-overlay');
  assert.equal(inPage.manifest.trustedOverlaySourceSha256,expected);
  assert(inPage.html.includes('value="page-overlay" selected'));
  assert(inPage.html.includes('value="empty" selected'));
});

test('R1.2 scenario and language controls are simulation only; do not widen unsupported preview adapters',async()=>{
  for(const scenario of ['success','empty','error','loading','permission-denied']){
    const preview=await generatePreview({tool:'reading-toc',scenario,theme:'light'});
    assert.equal(preview.manifest.scenario,scenario);
    assert.match(preview.html,/od-toc-feedback/);
    assert.match(preview.html,/opendesk-toc-preview-locale/);
    assert.match(preview.html,/opendesk-toc-preview-scenario/);
  }
  await assert.rejects(generatePreview({tool:'reading-toc',theme:'dark'}),/light only/);
  await assert.rejects(generatePreview({tool:'reading-toc',surface:'injected-page'}),/no verified production preview adapter/);
  await assert.rejects(generatePreview({tool:'quick-notes',surface:'page-overlay'}),/no verified production preview adapter/);
});

test('R1.2 preview and review sidecar write reproducibly outside source tree',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'od-toc-l10n-'));
  try{
    const out=join(dir,'toc-r12.html');
    const built=await buildPreview({tool:'reading-toc',surface:'side-panel',
      scenario:'success',theme:'light',out});
    const html=await readFile(out,'utf8');
    const context=JSON.parse(await readFile(built.context,'utf8'));
    assert.match(html,/阅读目录离线交互模拟/);
    assert.equal(context.toolId,'reading-toc');
    assert.equal(context.simulation.realUninstall,false);
    assert.equal(context.simulation.mock,true);
    assert.equal(context.source.uiSha256,built.uiSha256);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('R1.3 both generated TOC preview entrypoints contain executable inline JS',async()=>{
  // A valid-looking HTML fixture can silently lose every locale/scenario control
  // when the browser rejects a preview-only script. Parse what was actually emitted.
  for(const surface of ['side-panel','page-overlay']){
    const preview=await generatePreview({tool:'reading-toc',surface,theme:'light',scenario:'success',width:360});
    const scripts=[...preview.html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match=>match[1]);
    assert(scripts.length>=2,'Preview must include the real shell and interactive controls');
    for(const script of scripts)assert.doesNotThrow(()=>new vm.Script(script),
      'Generated '+surface+' preview contains invalid browser JavaScript');
    assert.match(preview.html,/const post=\(kind,value\)=>/);
  }
});
