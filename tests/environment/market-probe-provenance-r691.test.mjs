import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,realpath,rm,symlink} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {describeBundle} from '../../scripts/bundle-provenance.mjs';

// Reviewed delta from 55e33dcef: the fixed install-review TAB may only probe
// service availability. Mutation admission remains covered by the service test.
const source='examples/sidebar-tools/stay-focus/trusted/service.js';
const reviewedBlob='b1dc68d94740b704706766ebf3f99c05cec9ad09';
const describe=(root=process.cwd(),target='sw.js')=>describeBundle({
  chunk:{fileName:target,modules:{[resolve(root,source)]:{originalLength:1,renderedLength:1}}},
  root,lock:{packages:{}}
});

test('R6.9.1 market install probe compiles the reviewed service blob into the fixed worker',async()=>{
  const bytes=await readFile(source);
  assert.equal(createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex'),reviewedBlob);
  assert.equal(describe().modules[0].reviewedFirstPartyBlob,reviewedBlob);
  assert.throws(()=>describe(process.cwd(),'unregistered/custom.js'),/cannot enter/);
});

test('R6.9.1 market probe pin keeps unsigned drift and source symlinks blocked',async t=>{
  const root=await realpath(await mkdtemp(join(tmpdir(),'market-probe-pin-')));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const file=resolve(root,source),bytes=await readFile(source);
  await mkdir(dirname(file),{recursive:true});
  await writeFile(file,bytes);
  assert.equal(describe(root).modules[0].reviewedFirstPartyBlob,reviewedBlob);
  await writeFile(file,Buffer.concat([bytes,Buffer.from('\n// unsigned drift\n')]));
  assert.throws(()=>describe(root),/source changed/);
  await rm(file);await writeFile(file+'.actual',bytes);await symlink(file+'.actual',file);
  assert.throws(()=>describe(root),/must not be a symlink/);
});
