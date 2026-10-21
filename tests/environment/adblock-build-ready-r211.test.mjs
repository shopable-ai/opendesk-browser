// R2.11 compiled AdBlock evidence. Node receipt tests are not Chrome DNR proof.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,copyFile,mkdir,mkdtemp,rm,appendFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createSidebarToolPackage,checkCompiledToolBuildReady} from '../../scripts/build-sidebar-tool.mjs';
import {inspectSidebarToolProject} from '../../scripts/stage-sidebar-tool.mjs';

const PROJECT=resolve('examples/sidebar-tools/adblock');
const sha256=value=>createHash('sha256').update(value).digest('hex');
const read=path=>readFile(join(PROJECT,path));
const inputs=[
  'src/App.jsx','src/main.jsx','src/model.js','src/layout.css','src/index.html',
  'vite.config.mjs','package.json','tool.config.json',
  'trusted/cosmetic-policy.js','trusted/policy.js',
  'dist/tool.js','dist/tool.css','dist/build-ready.json'
];
async function cloneCandidate(t){
  const root=await mkdtemp(join(tmpdir(),'od-adblock-r211-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  await Promise.all([mkdir(join(root,'src')),mkdir(join(root,'dist')),
    mkdir(join(root,'trusted'))]);
  for(const path of inputs)await copyFile(join(PROJECT,path),join(root,path));
  return root;
}
test('one ignored dist bundle has deterministic React source and compiled-byte identities',async()=>{
  const config=JSON.parse(await read('tool.config.json'));
  const ready=JSON.parse(await read('dist/build-ready.json'));
  assert.deepEqual(config.files,{html:'src/index.html',css:'dist/tool.css',js:'dist/tool.js'});
  assert.equal(ready.format,'opendesk.ui-build-ready.v1');
  assert.deepEqual(Object.keys(ready.files).sort(),['dist/tool.css','dist/tool.js']);
  assert.deepEqual(Object.keys(ready.sources).sort(),inputs.filter(x=>
    !x.startsWith('dist/')).sort());
  for(const [path,expected] of Object.entries({...ready.sources,...ready.files})){
    const bytes=await read(path);
    assert.deepEqual(expected,{bytes:bytes.length,sha256:sha256(bytes)},path);
  }
  assert.equal(ready.buildId,sha256(Buffer.from(JSON.stringify({
    sources:ready.sources,files:ready.files}))));
  assert.equal((await checkCompiledToolBuildReady(PROJECT,config)).buildId,ready.buildId);
  assert.equal((await inspectSidebarToolProject(PROJECT)).buildId,ready.buildId);
  const pkg=await createSidebarToolPackage(PROJECT);
  assert.equal(pkg.version,'1.2.2');
  assert.equal(pkg.js,(await read('dist/tool.js')).toString('utf8'));
});
test('standalone and staging refuse stale JSX even when previous JS bytes still match',async t=>{
  const root=await cloneCandidate(t);
  await createSidebarToolPackage(root);
  await appendFile(join(root,'src/App.jsx'),'\n// regression: do not pack stale JSX\n');
  await assert.rejects(createSidebarToolPackage(root),/compiled UI source changed/);
  await assert.rejects(inspectSidebarToolProject(root),/compiled UI source changed/);
});
test('standalone packer rejects altered compiled JS and a downgraded build receipt',async t=>{
  const root=await cloneCandidate(t);
  await appendFile(join(root,'dist/tool.js'),'\nvoid 0;\n');
  await assert.rejects(createSidebarToolPackage(root),/compiled UI bytes differ/);
  await copyFile(join(PROJECT,'dist/tool.js'),join(root,'dist/tool.js'));
  const data=JSON.parse(await readFile(join(root,'dist/build-ready.json'),'utf8'));
  delete data.sources;
  await writeFile(join(root,'dist/build-ready.json'),JSON.stringify(data));
  await assert.rejects(createSidebarToolPackage(root),/requires a source-bound build receipt/);
});
test('editable historical React/HTM and old in-src compiler outputs are retired',async()=>{
  const {access}=await import('node:fs/promises');
  for(const obsolete of ['src/main.js','src/style.css','preview/app.js',
    'preview/index-react.html','preview/style.css','preview/acceptance.mjs'])
    await assert.rejects(access(join(PROJECT,obsolete)),{code:'ENOENT'},obsolete);
  assert.match((await read('preview/index.html')).toString('utf8'),/非真实广告拦截/);
});

test('development watcher republishes compiled AdBlock on JSX-only changes',async()=>{
  const source=await readFile(resolve('scripts/wxt-development.mjs'),'utf8');
  assert.match(source,/const adblockSourceChanged=changes\.some/);
  assert.match(source,/if\(adblockSourceChanged\)await buildAdblockReact/);
  assert.match(source,/!catalogDirty&&!adblockSourceChanged&&[^;{}]*!changes\.some/);
  assert.match(source,/adblock\/dist/);
});
