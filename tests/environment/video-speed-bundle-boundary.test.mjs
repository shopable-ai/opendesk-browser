import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {readFile,mkdtemp,mkdir,writeFile,rm,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {describeBundle} from '../../scripts/bundle-provenance.mjs';

const root=resolve(new URL('../..',import.meta.url).pathname);
const owned=['policy.js','host.js','admission.js']
  .map(name=>'projects/video-speed-controller/trusted/'+name);
function snapshot(folder,fileName='ui/sidebar-tool-host.js',inputs=owned){
  const modules=Object.fromEntries(inputs.map(path=>
    [resolve(folder,path),{renderedLength:300,originalLength:300}]));
  return describeBundle({root:folder,chunk:{fileName,modules},lock:{packages:{}}});
}

test('reviewed video modules compile only into their exact existing fixed entries',()=>{
  const result=snapshot(root);
  assert.equal(result.modules.length,3);
  assert.deepEqual(result.modules.map(row=>row.path).sort(),owned.slice().sort());
  for(const row of result.modules)
    assert.match(row.reviewedFirstPartyBlob,/^[0-9a-f]{40}$/);
  assert.equal(snapshot(root,'sw.js').modules.length,3);
  const page=['policy.js','page.js'].map(name=>'projects/video-speed-controller/trusted/'+name);
  assert.equal(snapshot(root,'agents/page-relay.js',page).modules.length,2);
  const service=['service.js'].map(name=>'projects/video-speed-controller/trusted/'+name);
  assert.equal(snapshot(root,'sw.js',service).modules.length,1);
  assert.throws(()=>snapshot(root,'ui/sidebar-tool-host.js',service),/Historical\/user\/vendor code/);
  assert.throws(()=>snapshot(root,'sw.js',page),/Historical\/user\/vendor code/);
  assert.throws(()=>snapshot(root,'agents/page-relay.js'),/Historical\/user\/vendor code/);
  assert.throws(()=>snapshot(root,'ui/tool-shell.js'),/Historical\/user\/vendor code/);
});

test('a changed video trusted source fails closed instead of silently entering a privileged bundle',async t=>{
  // macOS exposes tmpdir() through /var -> /private/var. Canonicalize the
  // fixture root so the production symlink guard tests source changes here.
  const dir=await realpath(await mkdtemp(join(tmpdir(),'opendesk-video-source-proof-')));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  for(const path of owned){
    const to=join(dir,path);await mkdir(dirname(to),{recursive:true});
    await writeFile(to,await readFile(join(root,path)));
  }
  assert.equal(snapshot(dir).modules.length,3);
  await writeFile(join(dir,owned[1]),(await readFile(join(dir,owned[1]),'utf8'))+'\n// changed');
  assert.throws(()=>snapshot(dir),/Trusted Video Speed source changed/);
});
