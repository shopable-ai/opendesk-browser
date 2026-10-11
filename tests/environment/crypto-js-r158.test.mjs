// R15.8: real crypto-js npm dependency, Page opt-in identity, WXT IIFE outputs.
// Node/VM evidence is NOT a native Chrome receipt.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createHash,webcrypto} from 'node:crypto';
import {installPageCryptoJS} from '../../src/libs/packages/crypto-js.js';
import {BUILTIN_ABI,BUILTIN_RUNTIME_CATALOG as catalog} from '../../src/libs/runtime-contract.js';
import {compileLockedPageSource,pageSelectedPackagedLibrary} from '../../src/scripting/user-scripts/execution-source.js';
import {fakeBuiltinSource} from './builtin-support.mjs';
globalThis.crypto ||= webcrypto;
const digest=s=>createHash('sha256').update(s).digest('hex');
const SHA_ABC='ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';

test('real crypto-js exposes reviewed Page compatibility API and refuses collisions',()=>{
  const scope={document:{}};
  installPageCryptoJS(scope);
  assert.equal(scope.CryptoJS.SHA256('abc').toString(scope.CryptoJS.enc.Hex),SHA_ABC);
  assert.equal(typeof scope.CryptoJS.HmacSHA256,'function');
  assert.equal(scope.CryptoJS.MD5,undefined);
  assert.equal(typeof scope.CryptoJS.AES.encrypt,'function');
  assert.equal(Object.getOwnPropertyDescriptor(scope,'CryptoJS').writable,false);
  assert.equal(Object.getOwnPropertyDescriptor(scope,'CryptoJS').configurable,false);
  assert.throws(()=>installPageCryptoJS(scope),error=>error.code==='E_BUILTIN_COLLISION');
  assert.throws(()=>installPageCryptoJS({}),error=>error.code==='E_BUILTIN_WORLD');
  assert.equal(pageSelectedPackagedLibrary('// @opendesk-lib crypto-js\nasync function main(){}'),'crypto-js');
  assert.throws(()=>pageSelectedPackagedLibrary(
    '// @opendesk-lib crypto-js\n// @opendesk-lib js-cookie\nasync function main(){}'),
    error=>error.code==='E_BUILTIN_DECLARATION');
});

test('compiled optional library requires matching identity, SHA, and old-run revalidation',async()=>{
  const code="Object.defineProperty(globalThis,'CryptoJS',{value:Object.freeze({SHA256:()=>42,HmacSHA256:()=>43})});";
  const optionalSource={id:'cryptoJs',version:'4.2.0',abi:BUILTIN_ABI,code,
    bytes:Buffer.byteLength(code),sha256:digest(code),catalogSha256:fakeBuiltinSource.catalogSha256};
  const sourceUtf8='// @opendesk-lib crypto-js\nasync function main(){return CryptoJS.SHA256("abc");}';
  const compiled=await compileLockedPageSource({sourceUtf8,entryFormat:'async-main',
    builtinSource:fakeBuiltinSource,optionalSource});
  assert.equal(compiled.packagedOptionalId,'cryptoJs');
  assert.equal(compiled.packagedOptionalSha256,optionalSource.sha256);
  assert.equal(await vm.runInNewContext(compiled.js[0].code,{}),42);
  await assert.rejects(()=>compileLockedPageSource({sourceUtf8,entryFormat:'async-main',
    builtinSource:fakeBuiltinSource,optionalSource:{...optionalSource,code:code+'\n;tampered;'}}),
    error=>error.code==='E_DEPENDENCY_HASH');
  await assert.rejects(()=>compileLockedPageSource({sourceUtf8,entryFormat:'async-main',
    builtinSource:fakeBuiltinSource}),error=>error.code==='E_BUILTIN_VERSION_UNAVAILABLE');
  await assert.rejects(()=>compileLockedPageSource({sourceUtf8,entryFormat:'async-main',
    builtinSource:fakeBuiltinSource,optionalSource:{...optionalSource,abi:'opendesk-builtins.v4'}}),
    error=>error.code==='E_BUILTIN_VERSION_UNAVAILABLE');
});

for(const mode of ['production','development']){
  test(mode+' WXT output is pinned, world-scoped, and executes real upstream SHA256',async()=>{
    const root='dist/'+mode+'/',path=catalog.libraries.cryptoJs.output;
    const code=await readFile(root+path,'utf8');
    const manifest=JSON.parse(await readFile(root+catalog.resourceManifest,'utf8'));
    const record=manifest.resources.find(x=>x.path===path);
    assert.equal(record.bytes,Buffer.byteLength(code));
    assert.equal(record.sha256,digest(code));
    assert.match(code,/^var\s+OpenDeskCryptoJSBundle\s*=/);
    const scope=vm.createContext({document:{}});
    vm.runInContext(code,scope,{timeout:3000});
    assert.equal(vm.runInContext('CryptoJS.SHA256("abc").toString(CryptoJS.enc.Hex)',scope),SHA_ABC);
    assert.equal(vm.runInContext('typeof CryptoJS.MD5',scope),'undefined');
    assert.equal(Object.getOwnPropertyDescriptor(scope,'CryptoJS').configurable,false);
  });
}
