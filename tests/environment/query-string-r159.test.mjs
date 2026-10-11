// R15.9 genuine npm query-string integration; real WXT bytes are tested below.
// Node VM evidence is not native Chrome proof.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createHash,webcrypto} from 'node:crypto';
import {installPageQueryString} from '../../src/libs/packages/query-string.js';
import {BUILTIN_ABI,BUILTIN_RUNTIME_CATALOG as catalog} from '../../src/libs/runtime-contract.js';
import {pageSelectedPackagedLibrary,compileLockedPageSource} from '../../src/scripting/user-scripts/execution-source.js';
import {fakeBuiltinSource} from './builtin-support.mjs';
globalThis.crypto ||= webcrypto;
const digest=value=>createHash('sha256').update(value).digest('hex');

test('upstream query-string@9.5.1 supports arrays, empty keys and non-URLSearchParams options',()=>{
  const scope={document:{}};
  installPageQueryString(scope);
  assert.deepEqual(scope.queryString.parse('tag=one&tag=two').tag,['one','two']);
  assert.equal(scope.queryString.parse('empty').empty,null);
  assert.equal(scope.queryString.stringify({tag:['one','two']},{arrayFormat:'comma'}),'tag=one,two');
  assert.equal(scope.queryString.parseUrl('https://test.invalid/p?a=1').query.a,'1');
  const descriptor=Object.getOwnPropertyDescriptor(scope,'queryString');
  assert.equal(descriptor.writable,false);assert.equal(descriptor.configurable,false);
  assert.equal(Object.isFrozen(scope.queryString),true);
  assert.throws(()=>installPageQueryString(scope),e=>e.code==='E_BUILTIN_COLLISION');
  assert.throws(()=>installPageQueryString({}),e=>e.code==='E_BUILTIN_WORLD');
});

test('only a single reviewed Page declaration enables query-string',()=>{
  assert.equal(pageSelectedPackagedLibrary('// @opendesk-lib query-string\nasync function main(){}'),'query-string');
  assert.equal(pageSelectedPackagedLibrary('async function main(){// @opendesk-lib query-string\n}'),null);
  assert.throws(()=>pageSelectedPackagedLibrary('// @opendesk-lib query-string\n// @opendesk-lib react\nasync function main(){}'),
    e=>e.code==='E_BUILTIN_DECLARATION');
});

test('locked compilation rejects forged query-string version, resource bytes and absent declaration',async()=>{
  const code='Object.defineProperty(globalThis,"queryString",{value:Object.freeze({parse:()=>42,stringify:()=>43})});';
  const optionalSource={id:'queryString',version:'9.5.1',abi:BUILTIN_ABI,code,bytes:Buffer.byteLength(code),
    sha256:digest(code),catalogSha256:fakeBuiltinSource.catalogSha256};
  const sourceUtf8='// @opendesk-lib query-string\nasync function main(){return queryString.parse("a=1")}';
  const compiled=await compileLockedPageSource({sourceUtf8,entryFormat:'async-main',
    builtinSource:fakeBuiltinSource,optionalSource});
  assert.equal(compiled.packagedOptionalId,'queryString');
  assert.equal(await vm.runInNewContext(compiled.js[0].code,{}),42);
  await assert.rejects(()=>compileLockedPageSource({sourceUtf8,entryFormat:'async-main',
    builtinSource:fakeBuiltinSource,optionalSource:{...optionalSource,code:code+'//mutation'}}),
    e=>e.code==='E_DEPENDENCY_HASH');
  await assert.rejects(()=>compileLockedPageSource({sourceUtf8,entryFormat:'async-main',
    builtinSource:fakeBuiltinSource,optionalSource:{...optionalSource,version:'9.5.0'}}),
    e=>e.code==='E_BUILTIN_VERSION_UNAVAILABLE');
  await assert.rejects(()=>compileLockedPageSource({sourceUtf8,entryFormat:'async-main',
    builtinSource:fakeBuiltinSource}),e=>e.code==='E_BUILTIN_VERSION_UNAVAILABLE');
});

for(const mode of ['production','development']){
  test(mode+' WXT genuine query-string IIFE is pinned and never preclaims website MAIN',async()=>{
    const root='dist/'+mode+'/',path=catalog.libraries.queryString.output;
    const code=await readFile(root+path,'utf8');
    const manifest=JSON.parse(await readFile(root+catalog.resourceManifest,'utf8'));
    const info=manifest.resources.find(row=>row.path===path);
    assert(info);
    assert.equal(info.bytes,Buffer.byteLength(code));
    assert.equal(info.sha256,digest(code));
    assert.match(code,/^var\s+OpenDeskQueryStringBundle\s*=/);
    const scope=vm.createContext({document:{},URL,TextDecoder,TextEncoder});
    vm.runInContext(code,scope,{timeout:3000});
    assert.equal(vm.runInContext('queryString.parse("x=a&x=b").x.join("|")',scope),'a|b');
    assert.equal(vm.runInContext('queryString.stringify({x:["a","b"]},{arrayFormat:"comma"})',scope),'x=a,b');
    assert.equal(Object.getOwnPropertyDescriptor(scope,'queryString').configurable,false);
  });
}
