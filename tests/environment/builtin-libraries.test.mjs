import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,webcrypto} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {registerLodash} from '../../src/libs/packages/lodash.js';
import {registerDayjs} from '../../src/libs/packages/dayjs.js';
import {installBuiltinLibraries} from '../../src/libs/core.js';
import {BUILTIN_ABI,BUILTIN_CATALOG,BUILTIN_RUNTIME_CATALOG,BUILTIN_RESOURCE_PATHS} from '../../src/libs/catalog.js';
import {loadBuiltinPageSource,loadBuiltinWorkerSource} from '../../src/libs/loader.js';
import {compileLockedPageSource} from '../../src/scripting/user-scripts/execution-source.js';
import {fakeBuiltinSource} from './builtin-support.mjs';
globalThis.crypto ||= webcrypto;
const sha=s=>createHash('sha256').update(s).digest('hex');
const fails=(fn,code)=>assert.rejects(fn,error=>error.code===code);
const bootstrap=()=>readFile('src/libs/runtime/bootstrap.js','utf8');
const demo=()=>readFile('src/libs/vendor/my-utils/1.0.0/index.js','utf8');
async function provision(scope){
  vm.runInContext(await bootstrap(),scope);
  registerLodash(scope);registerDayjs(scope);
  vm.runInContext(await demo(),scope);
  return installBuiltinLibraries(scope);
}
test('separate pinned npm packages and raw my-utils install in a Controller-style isolated realm',async()=>{
  const scope=vm.createContext({page:{title:async()=> 'Hello World'},params:{n:4}});
  const libs=await provision(scope);
  assert.equal(libs.abi,BUILTIN_ABI);
  assert.equal(libs.versions.lodash,'4.18.1');
  assert.equal(libs.versions.dayjs,'1.11.23');
  assert.equal(libs.versions.myUtils,'1.0.0');
  assert.deepEqual(Object.keys(libs.lodash).sort(),BUILTIN_CATALOG.libraries.lodash.methods.slice().sort());
  assert.deepEqual(libs.lodash.words('Hello World!'),['Hello','World']);
  assert.equal(libs.lodash.trim('  <h1>Hello</h1> '),'<h1>Hello</h1>');
  assert.equal(libs.lodash.escape('<div class="x">'),'&lt;div class=&quot;x&quot;&gt;');
  assert.deepEqual(libs.lodash.uniq([3,3,7]),[3,7]);
  assert.equal(libs.lodash.get({x:{y:42}},'x.y'),42);
  assert.equal(libs.dayjs('2026-10-10').format('YYYY-MM-DD'),'2026-10-10');
  assert.equal(libs.myUtils.upper('hello'),'HELLO');
  assert.equal(typeof libs.dayjs.extend,'undefined');
  assert.equal(typeof libs.lodash.template,'undefined');
  assert.equal(typeof libs.lodash.set,'undefined');
  assert.equal(typeof libs.lodash.debounce,'undefined');
  const script='async function main(){return {words:_.words(await page.title()),today:dayjs("2026-10-10").format("YYYY-MM-DD"),upper:OpenDeskLibs.myUtils.upper("hello"),n:params.n};}';
  const result=await vm.runInContext('(async()=>{'+script+'\nreturn main();})()',scope);
  assert.deepEqual(JSON.parse(JSON.stringify(result)),{words:['Hello','World'],today:'2026-10-10',upper:'HELLO',n:4});
});
test('bootstrap, source-owned JS and registration are hash pinned, isolated and idempotent',async()=>{
  const start=await bootstrap(),code=await demo();
  assert.equal(sha(start),BUILTIN_CATALOG.bootstrapSha256);
  assert.equal(sha(code),BUILTIN_CATALOG.libraries.myUtils.sha256);
  assert.equal(Buffer.byteLength(code),BUILTIN_CATALOG.libraries.myUtils.bytes);
  const scope=vm.createContext({});
  const libs=await provision(scope);
  for(const key of ['_','dayjs','OpenDeskLibs']){
    const descriptor=Object.getOwnPropertyDescriptor(scope,key);
    assert.equal(descriptor.writable,false);assert.equal(descriptor.configurable,false);
  }
  assert.equal(Object.isFrozen(libs),true);
  assert.equal(Object.isFrozen(libs.myUtils),true);
  assert.equal(scope[Symbol.for('opendesk.libs.register.v1')],undefined);
  // Node VM context proxies do not reflect an outer delete into the inner
  // global; repeated native USER_SCRIPT evaluation has separate Chrome tests.
  assert.strictEqual(installBuiltinLibraries(scope),libs);
  assert.equal(scope[Symbol.for('opendesk.libs.entries.v1')],undefined);
  const foreign=vm.createContext({_:{website:true},dayjs:{website:true}});
  vm.runInContext(start,foreign);
  registerLodash(foreign);registerDayjs(foreign);vm.runInContext(code,foreign);
  assert.throws(()=>installBuiltinLibraries(foreign),e=>e.code==='E_BUILTIN_COLLISION');
  assert.equal(foreign._.website,true);
  assert.equal(foreign.OpenDeskLibs,undefined);
  assert.equal({}.polluted,undefined);
});
test('one Page compilation unit fails before user effects when library readiness or SHA fails',async()=>{
  const source='async function main(){document.runs++;return OpenDeskLibs.myUtils.upper(_.trim(" hello "));}';
  const compiled=await compileLockedPageSource({sourceUtf8:source,entryFormat:'async-main',builtinSource:fakeBuiltinSource});
  assert.equal(compiled.js.length,1);assert.equal(compiled.builtinAbi,BUILTIN_ABI);
  const good=vm.createContext({document:{runs:0}});
  const result=await vm.runInContext(compiled.js[0].code,good);
  assert.equal(result,'HELLO');assert.equal(good.document.runs,1);
  const empty='/* no installed libs */';
  const missing=await compileLockedPageSource({sourceUtf8:source,entryFormat:'async-main',
    builtinSource:{...fakeBuiltinSource,code:empty,sha256:sha(empty)}});
  const broken=vm.createContext({document:{runs:0}});
  assert.throws(()=>vm.runInContext(missing.js[0].code,broken),/E_BUILTIN_NOT_READY/);
  assert.equal(broken.document.runs,0);
  await fails(()=>compileLockedPageSource({sourceUtf8:source,entryFormat:'async-main',
    builtinSource:{...fakeBuiltinSource,code:'tampered'}}),'E_BUILTIN_HASH');
});
test('receipt2 classic let and const stay within the guarded compilation scope',async()=>{
  const source='const dependencyValue=40;let localValue=dependencyValue+1;const fixedValue=localValue+1;document.value=fixedValue;';
  const compiled=await compileLockedPageSource({sourceUtf8:source,entryFormat:'classic-userscript',
    builtinSource:fakeBuiltinSource});
  const context=vm.createContext({document:{}});vm.runInContext(compiled.js[0].code,context);
  assert.equal(context.document.value,42);
  assert.equal(vm.runInContext('typeof localValue',context),'undefined');
  assert.equal(compiled.builtinAbi,BUILTIN_ABI);
});

test('the package loader validates each independent file against manifest and source identity before execution',async()=>{
  const start=await bootstrap(),utility=await demo(),code='/* published generated code */';
  const paths=BUILTIN_RESOURCE_PATHS;
  const sources=new Map([
    [BUILTIN_CATALOG.bootstrap,start],
    [BUILTIN_CATALOG.libraries.myUtils.output,utility],
    [BUILTIN_CATALOG.pageCore,code],[BUILTIN_CATALOG.controllerCore,code],
    [BUILTIN_CATALOG.libraries.lodash.output,code],[BUILTIN_CATALOG.libraries.dayjs.output,code]
  ]);
  const entries=paths.map(path=>{
    const vendor=Object.values(BUILTIN_CATALOG.libraries).find(row=>row.output===path&&row.origin==='vendor');
    const data=sources.get(path)||'L'.repeat(100);
    return {path,bytes:vendor?.bytes||Buffer.byteLength(data),sha256:vendor?.sha256||sha(data)};
  });
  const manifest={format:'opendesk.builtin-resources.v2',abi:BUILTIN_ABI,
    catalogSha256:sha(JSON.stringify(BUILTIN_RUNTIME_CATALOG)),resources:entries};
  const runtime={getURL:path=>'chrome-extension://abc/'+path};
  const values=new Map([...sources,[BUILTIN_CATALOG.resourceManifest,JSON.stringify(manifest)]]);
  let calls=0;
  const fetchImpl=async url=>{calls++;const path=url.replace('chrome-extension://abc/','');
    return values.has(path)?{ok:true,url,text:async()=>values.get(path)}:{ok:false,url};
  };
  const page=await loadBuiltinPageSource({runtime,fetchImpl});
  const worker=await loadBuiltinWorkerSource({runtime,fetchImpl});
  assert.equal(page.resources.length,5);
  assert.equal(worker.resources.length,5);
  assert.ok(page.code.includes(utility)&&worker.code.includes(utility));
  assert.equal(calls,12,'two manifests plus five fixed files per execution world');
  values.set(BUILTIN_CATALOG.libraries.lodash.output,'tampered');
  await fails(()=>loadBuiltinPageSource({runtime,fetchImpl}),'E_BUILTIN_HASH');
  values.delete(BUILTIN_CATALOG.libraries.lodash.output);
  await fails(()=>loadBuiltinPageSource({runtime,fetchImpl}),'E_BUILTIN_RESOURCE');
  values.set(BUILTIN_CATALOG.libraries.lodash.output,code);
  values.set(BUILTIN_CATALOG.resourceManifest,JSON.stringify({...manifest,abi:'old'}));
  await fails(()=>loadBuiltinPageSource({runtime,fetchImpl}),'E_BUILTIN_VERSION_UNAVAILABLE');
  await fails(()=>loadBuiltinPageSource({runtime:{getURL:path=>'https://evil.test/'+path},fetchImpl}),
    'E_BUILTIN_RESOURCE');
});

test('unready builtins return the exact native nonce receipt before dependency or user side effects',async()=>{
  const nonce='00000000-0000-4000-8000-000000000001';
  const missing='void 0;',compiled=await compileLockedPageSource({sourceUtf8:'async function main(){document.runs++;}',entryFormat:'async-main',receiptNonce:nonce,
    builtinSource:{...fakeBuiltinSource,code:missing,sha256:sha(missing)}});
  const context=vm.createContext({document:{runs:0}}),receipt=await vm.runInContext(compiled.js[0].code,context);
  assert.deepEqual(JSON.parse(JSON.stringify(receipt)),{format:'opendesk.page-preview-receipt.v1',nonce,ok:false,error:'E_BUILTIN_NOT_READY'});
  assert.equal(context.document.runs,0);assert.equal(compiled.js.length,1);
});
