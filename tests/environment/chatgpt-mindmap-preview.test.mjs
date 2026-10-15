import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PREVIEW_CSP,verifyFixedXmindAssets,startXmindPreview}
  from '../../examples/programs/chatgpt-mindmap/preview/serve.mjs';

const root=new URL('../../examples/programs/chatgpt-mindmap/',import.meta.url);
test('preview uses product answer registry and real SDK, never a replacement renderer',async()=>{
  const html=await readFile(new URL('preview/index.html',root),'utf8');
  const app=await readFile(new URL('preview/app.js',root),'utf8');
  const registry=await readFile(new URL('src/answer-registry.js',root),'utf8');
  const launcher=await readFile(new URL('preview/serve.mjs',root),'utf8');
  const css=await readFile(new URL('assets/ui.css',root),'utf8');
  assert.match(app,/import \{createAnswerRegistry\} from '\/src\/answer-registry\.js'/);
  assert.match(app,/import \{requireXmindRuntime\} from '\/src\/xmind-adapter\.js'/);
  assert.match(registry,/from '\.\/view\.js'/);
  assert.match(html,/__fixed_xmind\/snowbrush-2c2b5d62b5\.js/);
  assert.match(html,/data-message-author-role="assistant"/);
  assert.match(html,/id="preview-large"/);
  assert.match(app,/cContent.replaceChildren/);
  assert.match(app,/first\.click\(\)/);
  assert.match(launcher,/autostart/);
  assert.match(launcher,/--no-open/);
  assert.match(css,/Noto Sans CJK SC/);
  assert.doesNotMatch(html,/<canvas|data:image\/svg|https:\/\/cdn\./);
  assert.match(PREVIEW_CSP,/script-src 'self'/);
  assert.doesNotMatch(PREVIEW_CSP,/unsafe-eval/);
});
test('resource admission fails closed before opening any local server',async()=>{
  await assert.rejects(verifyFixedXmindAssets(),/E_XMIND_ASSETS_REQUIRED/);
  const prep=await readFile(new URL('preview/prepare-assets.mjs',root),'utf8');
  const serve=await readFile(new URL('preview/serve.mjs',root),'utf8');
  assert.match(prep,/PREVIEW_XMIND_RUNTIME_DIR/);
  assert.match(prep,/npm.*pack|\['pack','jszip@3\.10\.1'/);
  assert.match(serve,/prepareXmindPreviewAssets\(\{verify:verifyFixedXmindAssets\}\)/);
  const directory=await mkdtemp(join(tmpdir(),'odmm-preview-'));
  try{
    await writeFile(join(directory,'jszip.min.js'),'tampered');
    await assert.rejects(verifyFixedXmindAssets(directory));
    await assert.rejects(startXmindPreview({assetsDirectory:directory}));
  }finally{await rm(directory,{recursive:true,force:true});}
});
test('four pinned vendor files are accounted for but NOT distributed',async()=>{
  const manifest=JSON.parse(await readFile(new URL('tests/xmind-provenance.json',root),'utf8'));
  assert.deepEqual(manifest.assets.map(row=>row.name),[
    'jszip.min.js','polyfill-45b9836beb.min.js',
    'xmind-sdk.bundle.js','snowbrush-2c2b5d62b5.js']);
  assert.equal(manifest.assets.reduce((sum,row)=>sum+row.bytes,0),4042573);
  assert.match(manifest.distribution,/BLOCKED/);
});
