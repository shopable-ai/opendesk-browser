import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {verifyPackage} from '../../scripts/verify-package.mjs';
import {loadBuiltinPageSource,loadBuiltinWorkerSource} from '../../src/libs/loader.js';

const runtime={id:'fixture',getURL:path=>'chrome-extension://fixture/'+path};
const fail=error=>error?.code==='E_BUILTIN_RESOURCE';

test('R15.5 builtin resource read failures are stable and fail closed in both worlds',async()=>{
  const variants=[
    {runtime:{getURL:()=>{throw new Error('runtime unavailable');}},fetchImpl:async()=>{throw Error('must not fetch');}},
    {runtime,fetchImpl:async()=>{throw Error('offline');}},
    {runtime,fetchImpl:async url=>({ok:false,url})},
    {runtime,fetchImpl:async url=>({ok:true,url,redirected:true})},
    {runtime,fetchImpl:async url=>({ok:true,url:'chrome-extension://foreign/libs/builtin-resources.json',text:async()=>''})},
    {runtime,fetchImpl:async url=>({ok:true,url,text:async()=>{throw Error('truncated');}})},
    {runtime,fetchImpl:async url=>({ok:true,url,text:async()=>null})}
  ];
  for(const loader of [loadBuiltinPageSource,loadBuiltinWorkerSource])
    for(const variant of variants)
      await assert.rejects(loader(variant),fail);
});

test('package verification rejects extra extension manifests before pack',async()=>{
  for(const extra of ['libs/manifest.json','nested/extension/manifest.json','libs/MANIFEST.JSON']){
    const root=await mkdtemp(join(tmpdir(),'graydove-manifest-'));
    try{
      await writeFile(join(root,'manifest.json'),'{}');
      await mkdir(dirname(join(root,extra)),{recursive:true});
      await writeFile(join(root,extra),'{}');
      await assert.rejects(verifyPackage(root,{mode:'production'}),
        error=>error.message.startsWith('Expected exactly one root manifest.json; found: ')&&
          error.message.includes(extra));
    }finally{await rm(root,{recursive:true,force:true});}
  }
});

test('package verification requires the exact root manifest filename',async()=>{
  for(const filename of [null,'Manifest.json']){
    const root=await mkdtemp(join(tmpdir(),'graydove-manifest-'));
    try{
      if(filename)await writeFile(join(root,filename),'{}');
      await assert.rejects(verifyPackage(root,{mode:'production'}),
        /Expected exactly one root manifest.json/);
    }finally{await rm(root,{recursive:true,force:true});}
  }
});
