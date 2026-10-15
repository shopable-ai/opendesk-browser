import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import vm from 'node:vm';
import {createSidebarToolPackage} from '../../scripts/build-sidebar-tool.mjs';
import {generatePreview,PREVIEW_SCENARIOS} from '../../scripts/preview/build-preview.mjs';
import {assertLayoutOnly,compileSharedToolCss,officialDesignSources,SHARED_DESIGN_MARKER} from '../../scripts/preview/shared-tool-design.mjs';
import {PREVIEW_INPUTS,previewSourceHashes,assertPreviewLock} from '../../scripts/preview/check-preview-contract.mjs';

const read=path=>readFile(new URL('../../'+path,import.meta.url),'utf8');
const project=resolve('examples/sidebar-tools/quick-notes');
test('real package and offline preview have one compiled visual source and DOM implementation',async()=>{
  const tool=await createSidebarToolPackage(project);
  assert.match(tool.css,/^\/\* opendesk\.shared-design\.v1 sha256=/);
  assert.match(tool.html,/class="od-icon-button/);
  assert.match(tool.html,/class="od-field"/);
  assert.match(tool.js,/className='od-button od-button--secondary note-chip'/);
  const preview=await generatePreview({width:320,theme:'dark',scenario:'success'});
  assert.ok(preview.frameHtml.includes('data:text/css;base64,'+Buffer.from(tool.css).toString('base64')));
  assert.ok(preview.frameHtml.includes('data:text/javascript;base64,'+Buffer.from(tool.js).toString('base64')));
  assert.equal(preview.manifest.mock,true);
  assert.equal(preview.manifest.installed,false);
  assert.equal(preview.manifest.viewport.width,320);
  assert.match(preview.html,/sandbox="allow-scripts"/);
  assert.doesNotMatch(preview.html,/sandbox="allow-scripts allow-same-origin"/);
  assert.match(preview.frameHtml,/connect-src 'none'/);
  assert.match(preview.html,/模拟预览 · 非真实安装/);
});
test('public token/component CSS is consumed verbatim and follows canonical edits',async()=>{
  const layout=await read('examples/sidebar-tools/quick-notes/src/style.css');
  const {tokens,publicRules}=await officialDesignSources();
  const built=await compileSharedToolCss(layout);
  assert.ok(built.includes(tokens));
  assert.ok(built.includes(publicRules));
  assert.ok(built.includes('.od-icon-button{'));
  assert.ok(built.includes('.od-field{')||built.includes(').od-field{'));
  assert.equal(assertLayoutOnly(layout).includes('.notes-app{'),true);
});
test('private button skins, duplicated tokens and remote CSS fail the build',async()=>{
  const bad=[
    '.icon-button{background:#fab123}',
    '.custom-button{background:var(--od-brand)}',
    ':root{--od-brand:red}',
    '.od-icon-button{color:red}',
    'button{border-radius:24px}',
    '@import url(https://evil.invalid/x.css)'
  ];
  for(const rule of bad)
    await assert.rejects(compileSharedToolCss(SHARED_DESIGN_MARKER+'\n'+rule),
      /E_PREVIEW_DESIGN/,rule);
});
test('freshness lock rejects a changed formal token without falsely passing',async()=>{
  const lock=JSON.parse(await read('contracts/ui-preview/quick-notes.lock.json'));
  const hashes=await previewSourceHashes();
  assert.equal(assertPreviewLock(lock,hashes),true);
  const altered={...hashes,'src/ui/design-tokens.css':'0'.repeat(40)};
  assert.throws(()=>assertPreviewLock(lock,altered),/stale preview input src\/ui\/design-tokens\.css/);
  assert.deepEqual(Object.keys(hashes),PREVIEW_INPUTS);
});
test('fixed inputs produce byte-identical preview across builds and scenarios are isolated',async()=>{
  const p=await generatePreview(),q=await generatePreview();
  assert.equal(p.html,q.html);
  for(const scenario of PREVIEW_SCENARIOS){
    const result=await generatePreview({scenario});
    assert.equal(result.manifest.scenario,scenario);
    assert.match(result.frameHtml,/<div id="tool-root">/);
  }
  await assert.rejects(generatePreview({surface:'injected-page'}),/no verified production preview adapter/);
  await assert.rejects(generatePreview({tool:'unknown'}),/mock SDK adapter/);
});
test('mock bridge stores only in memory, refuses live task actions and preserves hostile text',async()=>{
  const code=await read('scripts/preview/quick-notes-mock.js');
  const launch=scenario=>{
    const env={document:{getElementById:id=>id==='tool-root'?{}:null},
      __opendeskPreviewScenario:scenario};
    env.globalThis=env;
    vm.runInNewContext(code,env,{timeout:1000});
    return env.OpenDeskTool;
  };
  const api=launch('success'),snapshot=await api.request('storage.get',{key:'notes',withEtag:true});
  assert.equal(snapshot.value[0].id,'preview-note');
  assert.match(snapshot.etag,/^[0-9]{64}$/);
  await assert.rejects(api.request('tasks.open',{taskId:'real-task'}),/不支持打开或执行真实任务/);
  const saved=await api.request('storage.set',{key:'notes',value:[],ifMatch:snapshot.etag});
  assert.equal(saved.simulated,true);
  assert.equal((await api.request('storage.get',{key:'notes'})).value.length,0);
  const hostile=await launch('untrusted').request('storage.get',{key:'notes'});
  assert.match(hostile.value[0].text,/<img src=x onerror=alert\(1\)>/);
  await assert.rejects(launch('permission-denied').request('storage.get',{key:'notes'}),/权限/);
  await assert.rejects(launch('error').request('storage.get',{key:'notes'}),/存储故障/);
});