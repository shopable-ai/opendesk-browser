import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {BUILTIN_CATALOG} from '../../src/runtime/builtin-libraries/catalog.js';
import {createBuiltinResourceManifest,verifyBuiltinResourceManifest} from '../../scripts/verify-package.mjs';

test('Controller Worker is a hashed binary resource, not an oversized npm license',async()=>{
  const root=await mkdtemp(join(tmpdir(),'opendesk-builtin-manifest-r16-'));
  const write=async(path,bytes)=>{const p=join(root,path);await mkdir(dirname(p),{recursive:true});await writeFile(p,bytes);};
  const manifest=BUILTIN_CATALOG.resourceManifest;
  try{
    await write(BUILTIN_CATALOG.pageCore,'/* genuine packaged Page core fixture */');
    await write(BUILTIN_CATALOG.controllerCore,'A'.repeat(12000));
    await write(BUILTIN_CATALOG.libraries.lodash.licensePath,'L'.repeat(110));
    await write(BUILTIN_CATALOG.libraries.dayjs.licensePath,'D'.repeat(110));
    const initial=await createBuiltinResourceManifest(root);
    assert.equal(initial.resources[1].path,BUILTIN_CATALOG.controllerCore);
    assert(initial.resources[1].bytes>8192,'runtime resource has no license-size limit');
    await write(manifest,JSON.stringify(initial));
    assert.deepEqual(await verifyBuiltinResourceManifest(root),initial);
    await write(BUILTIN_CATALOG.controllerCore,'B'.repeat(12000));
    await assert.rejects(verifyBuiltinResourceManifest(root),/Built-in library checksum/);
    await write(BUILTIN_CATALOG.libraries.dayjs.licensePath,'D'.repeat(9000));
    await write(manifest,JSON.stringify(await createBuiltinResourceManifest(root)));
    await assert.rejects(verifyBuiltinResourceManifest(root),/Built-in npm license notice missing or oversized/);
  }finally{await rm(root,{recursive:true,force:true});}
});
