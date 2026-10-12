// R16.3: real upstream FingerprintJS version/ABI and privacy-preserving opt-in.
// Node/VM evidence is not a native Chrome or network-monitoring receipt.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createHash,webcrypto} from 'node:crypto';
import actual from '@fingerprintjs/fingerprintjs';
import {installPageFingerprintJS} from '../../src/libs/packages/fingerprintjs.js';
import {BUILTIN_ABI,BUILTIN_RUNTIME_CATALOG as catalog} from '../../src/libs/runtime-contract.js';
import {pageSelectedPackagedLibrary,compileLockedPageSource} from '../../src/scripting/user-scripts/execution-source.js';
import {fakeBuiltinSource} from './builtin-support.mjs';
globalThis.crypto ||= webcrypto;
const digest=s=>createHash('sha256').update(s).digest('hex');

test('genuine upstream v5.3.0 API is present but opt-in installation collects nothing',async()=>{
  assert.equal(typeof actual.load,'function');
  assert.equal(typeof actual.hashComponents,'function');
  assert.equal(typeof actual.componentsToDebugString,'function');
  const calls=[];
  const spy=Object.freeze({
    load:async options=>{calls.push(options);return Object.freeze({get:async()=>({visitorId:'not-collected'})})},
    hashComponents:()=> 'reviewed-hash',
    componentsToDebugString:()=> 'reviewed-debug'
  });
  const scope={document:{}};
  installPageFingerprintJS(scope,spy);
  assert.deepEqual(calls,[],'module import or install must not call upstream load');
  assert.equal(scope.FingerprintJS.hashComponents({}),'reviewed-hash');
  assert.equal(Object.isFrozen(scope.FingerprintJS),true);
  assert.equal(Object.getOwnPropertyDescriptor(scope,'FingerprintJS').writable,false);
  assert.throws(()=>scope.FingerprintJS.load({monitoring:true}),
    e=>e.code==='E_MONITORING_DISABLED');
  assert.throws(()=>scope.FingerprintJS.load({debug:true}),
    e=>e.code==='E_CONFIG_UNSUPPORTED');
  assert.throws(()=>scope.FingerprintJS.load({delayFallback:-1}),
    e=>e.code==='E_CONFIG_UNSUPPORTED');
  assert.deepEqual(calls,[],'invalid options cannot initialize upstream');
  const agent=await scope.FingerprintJS.load({delayFallback:120});
  assert.equal(typeof agent.get,'function');
  assert.deepEqual(calls,[{monitoring:false,debug:false,delayFallback:120}]);
  await scope.FingerprintJS.load();
  assert.deepEqual(calls.at(-1),{monitoring:false,debug:false});
  assert.throws(()=>installPageFingerprintJS(scope,spy),e=>e.code==='E_BUILTIN_COLLISION');
  assert.throws(()=>installPageFingerprintJS({},spy),e=>e.code==='E_BUILTIN_WORLD');
});

test('a sole declared USER_SCRIPT package locks FingerprintJS ABI/bytes/SHA',async()=>{
  const sourceUtf8='// @opendesk-lib fingerprintjs\nasync function main(){return FingerprintJS.hashComponents({})}';
  assert.equal(pageSelectedPackagedLibrary(sourceUtf8),'fingerprintjs');
  assert.equal(pageSelectedPackagedLibrary('async function main(){// @opendesk-lib fingerprintjs\n}'),null);
  assert.throws(()=>pageSelectedPackagedLibrary(
    '// @opendesk-lib fingerprintjs\n// @opendesk-lib axios\nasync function main(){}'),
    e=>e.code==='E_BUILTIN_DECLARATION');
  const code='Object.defineProperty(globalThis,"FingerprintJS",{value:Object.freeze({load:()=>{},hashComponents:()=>42})});';
  const optionalSource={id:'fingerprintjs',version:'5.3.0',abi:BUILTIN_ABI,code,
    bytes:Buffer.byteLength(code),sha256:digest(code),catalogSha256:fakeBuiltinSource.catalogSha256};
  const compiled=await compileLockedPageSource({
    sourceUtf8,entryFormat:'async-main',builtinSource:fakeBuiltinSource,optionalSource});
  assert.equal(compiled.packagedOptionalId,'fingerprintjs');
  assert.equal(await vm.runInNewContext(compiled.js[0].code,{}),42);
  await assert.rejects(()=>compileLockedPageSource({
    sourceUtf8,entryFormat:'async-main',builtinSource:fakeBuiltinSource,
    optionalSource:{...optionalSource,code:code+'//tampered'}}),
    e=>e.code==='E_DEPENDENCY_HASH');
  await assert.rejects(()=>compileLockedPageSource({
    sourceUtf8,entryFormat:'async-main',builtinSource:fakeBuiltinSource,
    optionalSource:{...optionalSource,abi:'opendesk-builtins.v9'}}),
    e=>e.code==='E_BUILTIN_VERSION_UNAVAILABLE');
});

for(const mode of ['production','development']){
  test(mode+' FingerprintJS IIFE is standalone, manifest hashed and has no eager collection',async()=>{
    const root='dist/'+mode+'/',path=catalog.libraries.fingerprintjs.output;
    const code=await readFile(root+path,'utf8');
    const manifest=JSON.parse(await readFile(root+catalog.resourceManifest,'utf8'));
    const row=manifest.resources.find(x=>x.path===path);
    assert(row);
    assert.equal(row.bytes,Buffer.byteLength(code));
    assert.equal(row.sha256,digest(code));
    assert.match(code,/^var\s+OpenDeskFingerprintJSBundle\s*=/);
    let requests=0;
    const scope=vm.createContext({
      document:{},URL,TextEncoder,TextDecoder,
      navigator:{userAgent:'Mozilla/5.0 (Chrome VM fixture)'},
      XMLHttpRequest:class XMLHttpRequest {constructor(){requests++}},
      setTimeout,clearTimeout
    });
    scope.window=scope;scope.self=scope;
    vm.runInContext(code,scope,{timeout:5000});
    assert.equal(typeof scope.FingerprintJS?.load,'function');
    assert.equal(typeof scope.FingerprintJS?.hashComponents,'function');
    assert.equal(requests,0,'import/installation may not initiate upstream telemetry');
    assert.throws(()=>scope.FingerprintJS.load({monitoring:true}),
      e=>e.code==='E_MONITORING_DISABLED');
    assert.equal(requests,0);
    assert.equal(Object.getOwnPropertyDescriptor(scope,'FingerprintJS').configurable,false);
  });
}
