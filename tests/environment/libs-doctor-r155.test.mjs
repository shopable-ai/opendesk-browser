import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectLibraries,inspectLibraryOutputInventory,verifyShippedSwBudget} from '../../scripts/libs-doctor.mjs';
import {BUILTIN_CATALOG,BUILTIN_RESOURCE_PATHS} from '../../src/libs/catalog.js';
import {PAGE_FRAMEWORK_RUNTIMES} from '../../src/libs/page-frameworks/contract.js';
import {mkdtemp,mkdir,writeFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import {BUILD_POLICY} from '../../scripts/build-contract.mjs';

test('R15.5 doctor differentiates source, package and actual Chrome acceptance',async()=>{
  const report=await inspectLibraries();
  assert.equal(report.format,'opendesk.libs-doctor.v1');
  assert.equal(report.libraries.length,Object.keys(BUILTIN_CATALOG.libraries).length);
  assert.deepEqual(report.libraries.map(row=>row.id).sort(),
    Object.keys(BUILTIN_CATALOG.libraries).sort());
  const jq=report.libraries.find(row=>row.id==='jquery');
  assert.equal(jq.loading,'opt-in');
  assert.deepEqual(jq.worlds,['USER_SCRIPT']);
  const lodash=report.libraries.find(row=>row.id==='lodash');
  assert.equal(lodash.apiCoverage,'8-method subset');
  assert.equal(report.policy.expectedSwHardBytes,1024*1024);
  assert.equal(report.policy.configuredSwHardBytes,BUILD_POLICY.serviceWorkerProductionBytes);
  assert.equal(report.policy.status,'PASS');
  assert.equal(report.runtime,'RUNTIME_UNVERIFIED');
  assert.equal(report.native,'NATIVE_UNVERIFIED');
  assert.deepEqual(report.legacy.jquery.references,[],
    'A src/vendor jQuery consumer must be migrated before the duplicate file is removed');
  for(const mode of ['production','development'])
    assert(['PACKAGE_PASS','PACKAGE_FAIL','PACKAGE_UNVERIFIED'].includes(report.packages[mode].status));
});


async function withLibraryFiles(run){
  const dir=await mkdtemp(join(tmpdir(),'opendesk-r155-output-'));
  const expected=[...BUILTIN_RESOURCE_PATHS.filter(path=>path.startsWith('libs/')),
    ...Object.values(PAGE_FRAMEWORK_RUNTIMES).map(row=>row.output),
    BUILTIN_CATALOG.resourceManifest].sort();
  const write=async(path)=>{const filename=join(dir,path);await mkdir(dirname(filename),{recursive:true});await writeFile(filename,'fixture');};
  try{for(const path of expected)await write(path);await run({dir,expected,write});}
  finally{await rm(dir,{recursive:true,force:true});}
}
test('R15.5 doctor rejects unregistered output and missing library files, without needing a build',async()=>{
  await withLibraryFiles(async({dir,expected,write})=>{
    assert.deepEqual(await inspectLibraryOutputInventory(dir,'production'),expected);
    await write('libs/unknown.js');
    await assert.rejects(inspectLibraryOutputInventory(dir,'production'),/Unregistered\/missing library output/);
    await rm(join(dir,'libs/unknown.js'));
    await rm(join(dir,BUILTIN_CATALOG.libraries.dayjs.output));
    await assert.rejects(inspectLibraryOutputInventory(dir,'production'),/missing=.*dayjs\.js/);
  });
});
test('R15.5 doctor accepts only approved development maps and rejects symlink resources',async()=>{
  await withLibraryFiles(async({dir,expected,write})=>{
    const maps=[BUILTIN_CATALOG.pageCore,
      ...Object.values(BUILTIN_CATALOG.libraries).filter(row=>row.origin==='npm')
        .map(row=>row.output)].map(path=>path+'.map');
    for(const map of maps)await write(map);
    assert.deepEqual(await inspectLibraryOutputInventory(dir,'development'),
      [...expected,...maps].sort());
    await assert.rejects(inspectLibraryOutputInventory(dir,'production'),/Unregistered\/missing library output/);
    await rm(join(dir,maps[0]));
    await assert.rejects(inspectLibraryOutputInventory(dir,'development'),/missing=.*\.map/);
    const bad='libs/vendor/foreign.js';
    await symlink(join(dir,BUILTIN_CATALOG.libraries.myUtils.output),join(dir,bad));
    await assert.rejects(inspectLibraryOutputInventory(dir,'development'),/symlink forbidden/);
  });
});
test('R15.5 diagnostic PACKAGE_PASS cannot accept an oversized shipped SW',()=>{
  // Read the one current build policy; historical 320 KiB is no longer the
  // enforced release gate. Exact limit must pass; +1 byte must fail closed.
  const limit=BUILD_POLICY.serviceWorkerProductionBytes;
  assert.equal(verifyShippedSwBudget('production',limit).budgetBytes,limit);
  assert.throws(()=>verifyShippedSwBudget('production',limit+1),/exceeds production byte budget/);
  assert.equal(verifyShippedSwBudget('development',BUILD_POLICY.developmentBytes).budgetBytes,
    BUILD_POLICY.developmentBytes);
  assert.throws(()=>verifyShippedSwBudget('development',BUILD_POLICY.developmentBytes+1),/exceeds development byte budget/);
  assert.throws(()=>verifyShippedSwBudget('unknown',1),/Invalid Service Worker/);
});
