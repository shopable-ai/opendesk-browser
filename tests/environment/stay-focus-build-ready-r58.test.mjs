// R5.8 compiled UI and source integrity; does NOT constitute native Chrome proof.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,copyFile,mkdir,mkdtemp,rm,appendFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {createSidebarToolPackage,checkCompiledToolBuildReady} from '../../scripts/build-sidebar-tool.mjs';
import {inspectSidebarToolProject} from '../../scripts/stage-sidebar-tool.mjs';

const root=resolve('examples/sidebar-tools/stay-focus');
const sources=[
  'src/main.js','src/entry.js','src/style.css','src/index.html',
  'tool.config.json','vite.config.mjs','package.json'
];
const outputs=['dist/tool.js','dist/tool.css','dist/build-ready.json'];
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');

test('R5.8 compiles the single React Root with source-bound Build Ready',async()=>{
  const config=JSON.parse(await readFile(join(root,'tool.config.json'),'utf8'));
  assert.deepEqual(config.files,{html:'src/index.html',css:'dist/tool.css',js:'dist/tool.js'});
  assert.equal(config.uiRuntime,'opendesk.react-ui.v1');
  const ready=JSON.parse(await readFile(join(root,'dist/build-ready.json'),'utf8'));
  assert.equal(ready.format,'opendesk.ui-build-ready.v1');
  assert.deepEqual(Object.keys(ready.sources).sort(),[...sources].sort());
  assert.deepEqual(Object.keys(ready.files).sort(),outputs.slice(0,2).sort());
  for(const [path,row] of Object.entries({...ready.sources,...ready.files})){
    const bytes=await readFile(join(root,path));
    assert.deepEqual(row,{bytes:bytes.length,sha256:sha256(bytes)},path);
  }
  assert.equal(ready.buildId,sha256(Buffer.from(JSON.stringify({
    sources:ready.sources,files:ready.files}))));
  assert.equal((await checkCompiledToolBuildReady(root,config)).buildId,ready.buildId);
  assert.equal((await inspectSidebarToolProject(root)).buildId,ready.buildId);
  const pkg=await createSidebarToolPackage(root);
  assert.equal(pkg.version,config.version);
  assert.equal(pkg.js,await readFile(join(root,'dist/tool.js'),'utf8'));
  assert.ok(pkg.js.includes('OpenDeskPageReact'),'React must be host-owned');
  assert.ok(pkg.js.includes('OpenDeskSidebarUI'),'Shared UI must be host-owned');
  assert.doesNotMatch(pkg.js,/ReactDOM\.createRoot|ReactDOMClient\.createRoot/);
});
test('R5.8 forbids stale source, altered compiled JS and downgraded receipt',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'od-stay-focus-r58-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  await Promise.all([mkdir(join(dir,'src')),mkdir(join(dir,'dist'))]);
  for(const file of [...sources,...outputs])await copyFile(join(root,file),join(dir,file));
  await createSidebarToolPackage(dir);
  await appendFile(join(dir,'src/main.js'),'\n// source changed after Vite build\n');
  await assert.rejects(createSidebarToolPackage(dir),/compiled UI source changed/);
  await copyFile(join(root,'src/main.js'),join(dir,'src/main.js'));
  await appendFile(join(dir,'dist/tool.js'),'\nvoid 0;\n');
  await assert.rejects(createSidebarToolPackage(dir),/compiled UI bytes differ/);
  await copyFile(join(root,'dist/tool.js'),join(dir,'dist/tool.js'));
  const ready=JSON.parse(await readFile(join(dir,'dist/build-ready.json'),'utf8'));
  delete ready.sources;
  await writeFile(join(dir,'dist/build-ready.json'),JSON.stringify(ready));
  await assert.rejects(createSidebarToolPackage(dir),/requires a source-bound build receipt/);
});
test('R5.8 checked-in interactive preview exactly matches authored React UI source',()=>{
  execFileSync(process.execPath,['--check',join(root,'preview/build.mjs')]);
  execFileSync(process.execPath,[join(root,'preview/build.mjs'),'--check']);
});
