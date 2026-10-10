import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {describeBundle,collectBundleEvidence,assertLibraryModuleBoundary,recordBuildFailure} from '../../scripts/bundle-provenance.mjs';
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
test('independent npm implementations stay in their own outputs and raw libraries are never bundled',()=>{
  for(const [path,owner] of [['src/libs/packages/lodash.js','libs/packages/lodash.js'],
    ['node_modules/lodash-es/get.js','libs/packages/lodash.js'],['node_modules/dayjs/dayjs.min.js','libs/packages/dayjs.js']]){
    assert.doesNotThrow(()=>assertLibraryModuleBoundary(owner,path));
    for(const target of ['sw.js','libs/runtime/page-core.js','scripting/sandbox/worker-runtime.js','ui/tool-shell.js'])
      assert.throws(()=>assertLibraryModuleBoundary(target,path),/implementation unexpectedly bundled/);
  }
  for(const path of ['src/libs/core.js','src/libs/catalog.js','src/libs/vendor/my-utils/1.0.0/index.js'])
    assert.throws(()=>assertLibraryModuleBoundary('sw.js',path),/implementation unexpectedly bundled/);
  assert.doesNotThrow(()=>assertLibraryModuleBoundary('sw.js','src/libs/runtime-contract.js'));
  assert.doesNotThrow(()=>assertLibraryModuleBoundary('scripting/sandbox/worker-runtime.js','src/libs/core.js'));
});
test('a failed oversized build preserves the offending graph separately from the last success',async t=>{
  const evidence=await mkdtemp(join(tmpdir(),'opendesk-failed-build-'));
  const directory=await mkdtemp(join(tmpdir(),'opendesk-failed-modules-'));
  t.after(()=>Promise.all([rm(evidence,{recursive:true,force:true}),rm(directory,{recursive:true,force:true})]));
  const prior='{"status":"passed","prior":"preserved"}\n';
  await writeFile(join(evidence,'build-production.json'),prior);
  await writeFile(join(directory,'sw.js.json'),JSON.stringify(describeBundle({chunk,root,lock})));
  const error=Object.assign(Error('over budget'),{target:'sw.js',bytes:328942,budgetBytes:327680});
  const wrapped=new Error('Failed to build sw',{cause:error});
  const path=await recordBuildFailure({directory,evidence,mode:'production',attemptId:'test-attempt',error:wrapped,sourceInputs:[{path:'src/sw.js',sha256:'b'.repeat(64)}]});
  const failed=JSON.parse(await readFile(path,'utf8'));
  assert.equal(failed.status,'failed');assert.equal(failed.packageVerified,false);
  assert.equal(failed.error.excessBytes,1262);assert.equal(failed.bundleModules[0].target,'sw.js');
  assert.equal(failed.error.message,'Failed to build sw');assert.equal(failed.error.causes[0].message,'over budget');
  assert.equal(failed.sourceInputs[0].path,'src/sw.js');
  assert.equal(await readFile(join(evidence,'build-production.json'),'utf8'),prior);
  assert.deepEqual(JSON.parse(await readFile(join(evidence,'build-production-latest.json'),'utf8')),
    {status:'failed',mode:'production',attemptId:'test-attempt',diagnostic:path});
});
test('partial diagnostic JSON and circular causes cannot leave a stale success marker',async t=>{
  const evidence=await mkdtemp(join(tmpdir(),'opendesk-partial-failure-'));
  const directory=await mkdtemp(join(tmpdir(),'opendesk-partial-modules-'));
  t.after(()=>Promise.all([rm(evidence,{recursive:true,force:true}),rm(directory,{recursive:true,force:true})]));
  await writeFile(join(evidence,'build-production-latest.json'),'{"status":"passed"}');
  await writeFile(join(directory,'sw.js.json'),'{"target":');
  const error=new Error('write interrupted');error.cause=error;
  const path=await recordBuildFailure({directory,evidence,mode:'production',error});
  const failed=JSON.parse(await readFile(path,'utf8'));
  assert.equal(failed.error.message,'write interrupted');assert.deepEqual(failed.bundleModules,[]);
  assert.equal(failed.diagnosticErrors[0].path,'sw.js.json');
  assert.equal(JSON.parse(await readFile(join(evidence,'build-production-latest.json'),'utf8')).status,'failed');
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
