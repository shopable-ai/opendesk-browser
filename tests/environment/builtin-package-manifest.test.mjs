import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {BUILTIN_CATALOG,BUILTIN_RESOURCE_PATHS} from '../../src/libs/catalog.js';
import {createBuiltinResourceManifest,verifyBuiltinResourceManifest} from '../../scripts/verify-package.mjs';

test('each fixed standalone JS and license is in a sealed resource manifest',async()=>{
  const root=await mkdtemp(join(tmpdir(),'opendesk-r154-resources-'));
  const write=async(path,bytes)=>{const p=join(root,path);await mkdir(dirname(p),{recursive:true});await writeFile(p,bytes);};
  try{
    for(const path of BUILTIN_RESOURCE_PATHS){
      const vend=Object.values(BUILTIN_CATALOG.libraries).find(row=>row.output===path&&row.origin==='vendor');
      const data=path===BUILTIN_CATALOG.bootstrap
        ?await readFile('src/libs/runtime/bootstrap.js') :vend?await readFile(vend.source)
        :path.startsWith('licenses/')?'L'.repeat(110):'A'.repeat(12000);
      await write(path,data);
    }
    const initial=await createBuiltinResourceManifest(root);
    assert.equal(initial.format,'opendesk.builtin-resources.v2');
    assert.deepEqual(initial.resources.map(row=>row.path),BUILTIN_RESOURCE_PATHS);
    assert(initial.resources.find(row=>row.path===BUILTIN_CATALOG.controllerCore).bytes>8192);
    await write(BUILTIN_CATALOG.resourceManifest,JSON.stringify(initial));
    assert.deepEqual(await verifyBuiltinResourceManifest(root),initial);
    await write(BUILTIN_CATALOG.libraries.myUtils.output,'tampered');
    await assert.rejects(verifyBuiltinResourceManifest(root),/checksum/);
    await write(BUILTIN_CATALOG.libraries.myUtils.output,await readFile(BUILTIN_CATALOG.libraries.myUtils.source));
    await write(BUILTIN_CATALOG.resourceManifest,JSON.stringify(await createBuiltinResourceManifest(root)));
    await write(BUILTIN_CATALOG.libraries.dayjs.licensePath,'D'.repeat(9000));
    await write(BUILTIN_CATALOG.resourceManifest,JSON.stringify(await createBuiltinResourceManifest(root)));
    await assert.rejects(verifyBuiltinResourceManifest(root),/license notice missing or oversized/);
  }finally{await rm(root,{recursive:true,force:true});}
});
