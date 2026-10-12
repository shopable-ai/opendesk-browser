// Compare real verified packages, not README numbers or WXT input sources.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {verifyPackage} from '../../scripts/verify-package.mjs';
import {PAGE_BROWSER_PRIVATE_FILES,PAGE_BROWSER_COMPILER,PAGE_FRAMEWORK_RUNTIMES} from '../../src/libs/page-frameworks/contract.js';

const baseline='dist/production', developer='dist/production-developer';
const [standard,full]=await Promise.all([
  verifyPackage(baseline,{mode:'production'}),
  verifyPackage(developer,{mode:'production'})
]);
assert.equal(standard.edition,'standard');
assert.equal(full.edition,'developer');
assert.notEqual(standard.packageHash,full.packageHash);
assert.equal(standard.manifestVersion,3);
assert.equal(full.manifestVersion,3);
const std=new Map(standard.files.map(row=>[row.path,row]));
const dev=new Map(full.files.map(row=>[row.path,row]));
const compilerPaths=PAGE_BROWSER_PRIVATE_FILES.map(row=>row.output);
const extras=[...dev.keys()].filter(key=>!std.has(key)).sort();
assert.deepEqual(extras,[...compilerPaths,PAGE_BROWSER_COMPILER.licensePath].sort(),
  'Developer may only add reviewed compiler files and its license');
for(const entry of PAGE_BROWSER_PRIVATE_FILES){
  assert(!std.has(entry.output),'Standard unexpectedly bundles '+entry.output);
  assert.equal(dev.get(entry.output)?.bytes,entry.bytes);
  assert.equal(dev.get(entry.output)?.sha256,entry.sha256);
}
assert(!std.has(PAGE_BROWSER_COMPILER.licensePath),'Standard bundles an unused compiler license');
for(const runtime of Object.values(PAGE_FRAMEWORK_RUNTIMES)){
  assert.equal(std.get(runtime.output)?.sha256,runtime.sha256,
    'Standard must retain the frozen React/Vue runtime for Direct programs');
  assert.equal(dev.get(runtime.output)?.sha256,runtime.sha256);
}
const expectedCompilerBytes=PAGE_BROWSER_PRIVATE_FILES.reduce((n,row)=>n+row.bytes,0);
assert.equal(expectedCompilerBytes,4249817);
const stdPackageBytes=standard.files.reduce((n,row)=>n+row.bytes,0);
const devPackageBytes=full.files.reduce((n,row)=>n+row.bytes,0);
const record={
  status:'PASS_R245_DUAL_PACKAGES',
  baseline:{path:baseline,hash:standard.packageHash,bytes:stdPackageBytes},
  developer:{path:developer,hash:full.packageHash,bytes:devPackageBytes},
  browserCompilerFiles:compilerPaths,
  verifiedRawBrowserCompilerBytes:expectedCompilerBytes,
  rawPackageDeltaBytes:devPackageBytes-stdPackageBytes,
  reactVueRuntimesRemainInStandard:true,
  notes:'Uncompressed directory byte comparison; not ZIP savings or RAM usage'
};
const output=process.env.OPENDESK_EDITION_TEST_OUTPUT||'.runtime/tests/browser-editions-r245/acceptance.json';
await fs.mkdir(path.dirname(output),{recursive:true});
await fs.writeFile(output,JSON.stringify(record,null,2)+'\n');
console.log('R245_EDITION_PACKAGES='+JSON.stringify(record));
