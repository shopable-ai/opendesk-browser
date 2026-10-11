// R15.6: the single source owner for built-in library code is src/libs/.
// This scans live source/build scripts, rather than historical docs or fixtures.
import test from 'node:test';
import assert from 'node:assert/strict';
import {access,readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {builtinIdentity,assertBuiltinIdentity} from '../../src/libs/identity.js';
import {BUILTIN_ABI} from '../../src/libs/runtime-contract.js';

async function liveFiles(root){
  const found=[];
  async function walk(dir){
    for(const entry of await readdir(dir,{withFileTypes:true})){
      const path=join(dir,entry.name);
      if(entry.isSymbolicLink())throw Error('Unexpected live-source symlink: '+path);
      if(entry.isDirectory())await walk(path);
      else if(entry.isFile()&&/\.(?:[cm]?js|ts|tsx|json|html)$/.test(entry.name))found.push(path);
    }
  }
  await walk(root);
  return found;
}

test('R15.6 has no legacy src/runtime tree or live import of its old built-in library entrypoints',async()=>{
  await assert.rejects(access('src/runtime'),error=>error?.code==='ENOENT');
  const matches=[];
  for(const root of ['src','scripts']){
    for(const path of await liveFiles(root)){
      const source=await readFile(path,'utf8');
      if(/(?:src\/)?runtime\/builtin-libraries\//.test(source))matches.push(path);
    }
  }
  assert.deepEqual(matches,[],'Live library consumers must import from src/libs directly');
  for(const path of ['src/libs/catalog.js','src/libs/core.js','src/libs/loader.js',
    'src/libs/identity.js','src/libs/runtime-contract.js'])await access(path);
});

test('R15.6 relocated identity gate preserves immutable ABI and exact resource hashes',()=>{
  const trusted={builtinAbi:BUILTIN_ABI,builtinCatalogSha256:'a'.repeat(64),builtinBundleSha256:'b'.repeat(64)};
  const identity=builtinIdentity(trusted);
  assert.deepEqual(identity,{abi:BUILTIN_ABI,catalogSha256:trusted.builtinCatalogSha256,
    bundleSha256:trusted.builtinBundleSha256});
  assert.doesNotThrow(()=>assertBuiltinIdentity(identity,{...identity}));
  for(const invalid of [
    {...identity,abi:'obsolete'}, {...identity,catalogSha256:'c'.repeat(64)},
    {...identity,bundleSha256:'c'.repeat(64)}, {...identity,bundleSha256:'invalid'},
    {catalogSha256:identity.catalogSha256,bundleSha256:identity.bundleSha256}
  ]){
    assert.throws(()=>assertBuiltinIdentity(identity,invalid),
      error=>error?.code==='E_BUILTIN_VERSION_UNAVAILABLE');
  }
  assert.throws(()=>assertBuiltinIdentity({...identity,catalogSha256:undefined},identity),
    error=>error?.code==='E_BUILTIN_VERSION_UNAVAILABLE');
});
