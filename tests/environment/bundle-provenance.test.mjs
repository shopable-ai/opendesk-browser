import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {describeBundle,collectBundleEvidence} from '../../scripts/bundle-provenance.mjs';
const root='/repo';
const chunk={fileName:'sw.js',modules:{
  '/repo/src/sw.js':{renderedLength:10,originalLength:20},
  '/repo/node_modules/@wxt-dev/browser/src/index.mjs':{renderedLength:5,originalLength:50},
  '/repo/src/unused.js':{renderedLength:0,originalLength:100}
}};
const lock={packages:{'node_modules/@wxt-dev/browser':{version:'1.0.0',resolved:'https://registry.example/pkg.tgz',integrity:'sha512-test'}}};
test('actual Rollup modules retain separate npm identity and zero-rendered evidence',()=>{
  const row=describeBundle({chunk,root,lock});
  assert.equal(row.target,'sw.js');assert.equal(row.modules.length,3);
  assert.equal(row.modules[0].npm.name,'@wxt-dev/browser');
  assert.equal(row.modules.find(row=>row.path==='src/unused.js').renderedLength,0);
  assert.match(row.note,/not final bytes/);
});
test('privileged entries reject historical, user project and standalone vendor modules',()=>{
  for(const path of ['examples/programs/sample/main.js','docs/contracts/source-snapshots/lib.js','src/vendor/jquery.js'])
    assert.throws(()=>describeBundle({chunk:{fileName:'sw.js',modules:{['/repo/'+path]:{}}},root,lock}),/cannot enter/);
  assert.throws(()=>describeBundle({chunk,root,lock:{packages:{}}}),/missing lock/);
});
test('receipt collection requires every fixed output and binds final verified hashes',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'r9-provenance-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  await assert.rejects(collectBundleEvidence(directory,['sw.js'],[]),/Incomplete/);
  await writeFile(join(directory,'sw.js.json'),JSON.stringify(describeBundle({chunk,root,lock})));
  const rows=await collectBundleEvidence(directory,['sw.js'],[{path:'sw.js',bytes:42,sha256:'a'.repeat(64)}]);
  assert.equal(rows[0].bytes,42);assert.equal(rows[0].sha256,'a'.repeat(64));
  await assert.rejects(collectBundleEvidence(directory,['sw.js'],[]),/does not match/);
});
