import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm,realpath,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {describeBundle} from '../../scripts/bundle-provenance.mjs';
import {build} from 'esbuild';

const packages=['baidu','google'].map(name=>`examples/tasks/${name}.search.top3.v1.opendesk-task.json`);
const describe=(target,path,root=process.cwd())=>describeBundle({root,chunk:{fileName:target,
  modules:{[resolve(root,path)]:{renderedLength:1,originalLength:1}}}});

test('only the two frozen Task JSON packages enter the SW as installer data',()=>{
  for(const path of packages){
    assert.match(describe('sw.js',path).modules[0].reviewedFirstPartyBlob,/^[a-f0-9]{40}$/);
    for(const target of ['cloud-control/cloud-host.js','ui/tool-shell.js','agents/page-relay.js','scripting/sandbox/worker-runtime.js'])
      assert.throws(()=>describe(target,path),/cannot enter a privileged fixed bundle/);
  }
  for(const path of ['examples/tasks/baidu-search-top3.js','examples/tasks/google-search-top3.js',
    'examples/tasks/unreviewed.opendesk-task.json'])
    assert.throws(()=>describe('sw.js',path),/cannot enter a privileged fixed bundle/);
});

test('fixed cloud host can check Task run authorization without importing installer packages',async()=>{
  const bundle=await build({entryPoints:['src/entrypoints/cloud-host.js'],bundle:true,write:false,
    format:'iife',platform:'browser',metafile:true,logLevel:'silent'});
  const inputs=Object.keys(bundle.metafile.inputs);
  assert.ok(inputs.some(path=>path.endsWith('src/cloud-control/service.js')));
  assert.deepEqual(inputs.filter(path=>packages.includes(path)),[]);
});

test('Task package admission rejects changed bytes and symlink substitution',async t=>{
  const root=await realpath(await mkdtemp(resolve(tmpdir(),'task-data-provenance-')));
  t.after(()=>rm(root,{recursive:true,force:true}));
  await mkdir(resolve(root,'examples/tasks'),{recursive:true});
  for(const path of packages){
    const file=resolve(root,path),bytes=await readFile(path);
    await writeFile(file,bytes);
    assert.doesNotThrow(()=>describe('sw.js',path,root));
    await writeFile(file,Buffer.concat([bytes,Buffer.from('\n')]));
    assert.throws(()=>describe('sw.js',path,root),/review and re-pin/);
    await rm(file);await symlink(resolve(path),file);
    assert.throws(()=>describe('sw.js',path,root),/must not be a symlink/);
  }
});
