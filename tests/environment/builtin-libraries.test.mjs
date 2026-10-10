import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,webcrypto} from 'node:crypto';
import vm from 'node:vm';
import {installBuiltinLibraries} from '../../src/runtime/builtin-libraries/core.js';
import {BUILTIN_ABI,BUILTIN_CATALOG} from '../../src/runtime/builtin-libraries/catalog.js';
import {loadBuiltinPageSource} from '../../src/runtime/builtin-libraries/loader.js';
import {compileLockedPageSource} from '../../src/scripting/user-scripts/execution-source.js';
import {fakeBuiltinSource} from './builtin-support.mjs';
globalThis.crypto ||= webcrypto;
const sha=s=>createHash('sha256').update(s).digest('hex');
const fails=(fn,code)=>assert.rejects(fn,error=>error.code===code);

test('pinned Lodash whitelist, basic Day.js and ordinary Controller signatures work without imports',async()=>{
  const scope={};
  const libs=installBuiltinLibraries(scope);
  assert.strictEqual(libs,scope.OpenDeskLibs);
  assert.strictEqual(scope._,libs.lodash);
  assert.strictEqual(scope.dayjs,libs.dayjs);
  assert.equal(libs.abi,BUILTIN_ABI);
  assert.equal(libs.versions.lodash,'4.18.1');
  assert.equal(libs.versions.dayjs,'1.11.23');
  assert.deepEqual(Object.keys(libs.lodash).sort(),BUILTIN_CATALOG.libraries.lodash.methods.slice().sort());
  assert.deepEqual(libs.lodash.words('Hello World!'),['Hello','World']);
  assert.equal(libs.lodash.trim('  <h1>Hello</h1> '),'<h1>Hello</h1>');
  assert.equal(libs.lodash.escape('<div class="x">'), '&lt;div class=&quot;x&quot;&gt;');
  assert.deepEqual(libs.lodash.uniq([3,3,7]),[3,7]);
  assert.equal(libs.lodash.get({x:{y:42}},'x.y'),42);
  assert.equal(libs.dayjs('2026-10-10').format('YYYY-MM-DD'),'2026-10-10');
  assert.equal(typeof libs.dayjs.extend,'undefined');
  assert.equal(typeof libs.lodash.template,'undefined');
  assert.equal(typeof libs.lodash.set,'undefined');
  assert.equal(typeof libs.lodash.debounce,'undefined');
  const source='async function main(){return {title:await page.title(),words:_.words(await page.title()),today:dayjs("2026-10-10").format("YYYY-MM-DD"),n:params.n};}';
  // The original AsyncBody signature is intentionally unchanged; in browser
  // it runs in the same opaque Worker whose globalThis got installed.
  const realm=vm.createContext({page:{title:async()=> 'Hello World'},params:{n:4}});
  installBuiltinLibraries(realm);
  const value=await vm.runInContext('(async()=>{'+source+'\nreturn main();})()',realm);
  assert.deepEqual(JSON.parse(JSON.stringify(value)),{title:'Hello World',words:['Hello','World'],today:'2026-10-10',n:4});
});
test('isolated realm read-only globals are idempotent; preexisting globals fail closed',()=>{
  const isolated={};const libs=installBuiltinLibraries(isolated);
  assert.strictEqual(installBuiltinLibraries(isolated),libs);
  for(const name of ['_','dayjs','OpenDeskLibs']){
    const row=Object.getOwnPropertyDescriptor(isolated,name);
    assert.equal(row.writable,false);
    assert.equal(row.configurable,false);
    assert.equal(row.enumerable,false);
  }
  assert.equal(Object.isFrozen(libs),true);
  assert.equal(Object.isFrozen(libs.lodash),true);
  assert.equal(Object.isFrozen(libs.dayjs),true);
  const webGlobal={_:{website:true},dayjs:{website:true}};
  assert.throws(()=>installBuiltinLibraries(webGlobal),error=>error.code==='E_BUILTIN_COLLISION');
  assert.equal(webGlobal._.website,true);
  assert.equal(webGlobal.OpenDeskLibs,undefined);
  assert.throws(()=>installBuiltinLibraries({OpenDeskLibs:{abi:BUILTIN_ABI}}),error=>error.code==='E_BUILTIN_COLLISION');
  const data={safe:true};const input=JSON.parse('{"__proto__":{"polluted":true}}');
  assert.equal(typeof libs.lodash.pick,'undefined');
  assert.equal({}.polluted,undefined,'malicious input did not pollute the global Object prototype');
  assert.deepEqual(data,{safe:true});
});
test('page compiler adds builtin first, fails before user/dependency side effects on readiness error',async()=>{
  const source='async function main(){document.runs++;return _.trim(" ok ");}';
  const compiled=await compileLockedPageSource({sourceUtf8:source,entryFormat:'async-main',builtinSource:fakeBuiltinSource});
  assert.equal(compiled.js.length,1);
  assert.equal(compiled.builtinAbi,BUILTIN_ABI);
  const context=vm.createContext({document:{runs:0}});
  const receipt=await vm.runInContext(compiled.js[0].code,context);
  assert.equal(receipt,'ok');
  assert.equal(context.document.runs,1);
  const broken=await compileLockedPageSource({sourceUtf8:source,entryFormat:'async-main',
    builtinSource:{...fakeBuiltinSource,code:'/* fake but missing initialization */',
      sha256:sha('/* fake but missing initialization */')}});
  const failed=vm.createContext({document:{runs:0}});
  assert.throws(()=>vm.runInContext(broken.js[0].code,failed),/E_BUILTIN_NOT_READY/);
  assert.equal(failed.document.runs,0);
  await fails(()=>compileLockedPageSource({sourceUtf8:source,entryFormat:'async-main',
    builtinSource:{...fakeBuiltinSource,code:'tampered'}}),'E_BUILTIN_HASH');
  await fails(()=>compileLockedPageSource({sourceUtf8:source,entryFormat:'async-main',
    builtinSource:{...fakeBuiltinSource,abi:'old'}}),'E_BUILTIN_HASH');
});
test('package-only loader enforces catalog ABI, fixed source hash, and no network fallback',async()=>{
  const catalogHash=sha(JSON.stringify(BUILTIN_CATALOG)),code='/* trusted packaged fixture */';
  const resources=[BUILTIN_CATALOG.pageCore,BUILTIN_CATALOG.libraries.lodash.licensePath,BUILTIN_CATALOG.libraries.dayjs.licensePath]
    .map((path,i)=>({path,bytes:i===0?Buffer.byteLength(code):100,sha256:i===0?sha(code):'b'.repeat(64)}));
  const manifest={format:'opendesk.builtin-resources.v1',abi:BUILTIN_ABI,catalogSha256:catalogHash,resources};
  const runtime={getURL:path=>'chrome-extension://abc/'+path};
  const cases=new Map([[BUILTIN_CATALOG.pageCore,code],[BUILTIN_CATALOG.resourceManifest,JSON.stringify(manifest)]]);
  let calls=0;
  const fetchImpl=async url=>{calls++;const path=url.replace('chrome-extension://abc/','');
    return cases.has(path)?{ok:true,text:async()=>cases.get(path),url}: {ok:false};};
  const valid=await loadBuiltinPageSource({runtime,fetchImpl});
  assert.equal(valid.abi,BUILTIN_ABI);
  assert.equal(valid.sha256,sha(code));assert.equal(valid.catalogSha256,catalogHash);
  assert.equal(calls,2,'manifest and fixed core only; no dynamic download');
  cases.set(BUILTIN_CATALOG.pageCore,'tampered');
  await fails(()=>loadBuiltinPageSource({runtime,fetchImpl}),'E_BUILTIN_HASH');
  cases.delete(BUILTIN_CATALOG.pageCore);
  await fails(()=>loadBuiltinPageSource({runtime,fetchImpl}),'E_BUILTIN_RESOURCE');
  cases.set(BUILTIN_CATALOG.pageCore,code);
  cases.set(BUILTIN_CATALOG.resourceManifest,JSON.stringify({...manifest,abi:'old'}));
  await fails(()=>loadBuiltinPageSource({runtime,fetchImpl}),'E_BUILTIN_VERSION_UNAVAILABLE');
  await fails(()=>loadBuiltinPageSource({runtime:{getURL:path=>'https://evil.test/'+path},fetchImpl}),'E_BUILTIN_RESOURCE');
});
