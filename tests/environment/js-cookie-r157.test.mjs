// R15.7: actual upstream js-cookie@3.0.8 and sealed opt-in Page compilation.
// Node unit/VM evidence only; same-candidate Chrome remains separate.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createHash,webcrypto} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {installPageCookies} from '../../src/libs/packages/js-cookie.js';
import {BUILTIN_ABI,BUILTIN_RUNTIME_CATALOG,BUILTIN_RESOURCE_PATHS} from '../../src/libs/runtime-contract.js';
import {loadPackagedOptionalPageLibrary} from '../../src/libs/loader.js';
import {pageSelectedPackagedLibrary,compileLockedPageSource} from '../../src/scripting/user-scripts/execution-source.js';
import {fakeBuiltinSource} from './builtin-support.mjs';
const digest=s=>createHash('sha256').update(s).digest('hex');
globalThis.crypto ||= webcrypto;

test('real pinned js-cookie supports get/set/remove/withAttributes without privileged cookies API',()=>{
  const jar=new Map();
  const doc={
    get cookie(){return [...jar.entries()].map(([k,v])=>k+'='+v).join('; ');},
    set cookie(value){
      const [first,...attrs]=value.split(';');
      const i=first.indexOf('='),key=first.slice(0,i),val=first.slice(i+1);
      if(attrs.some(x=>/expires=Thu, 01 Jan 1970|expires=.*1969/i.test(x)))jar.delete(key);
      else jar.set(key,val);
    }
  };
  const scope={document:doc};
  installPageCookies(scope);
  assert.equal(scope.Cookies.get('hello'),undefined);
  scope.Cookies.set('hello','Open Desk');
  assert.equal(scope.Cookies.get('hello'),'Open Desk');
  assert.equal(typeof scope.Cookies.withAttributes,'function');
  assert.equal(typeof scope.Cookies.withConverter,'function');
  scope.Cookies.remove('hello');
  assert.equal(scope.Cookies.get('hello'),undefined);
  assert.equal(Object.getOwnPropertyDescriptor(scope,'Cookies').writable,false);
  assert.throws(()=>installPageCookies(scope),e=>e.code==='E_BUILTIN_COLLISION');
  assert.throws(()=>installPageCookies({}),e=>e.code==='E_BUILTIN_WORLD');
});

test('only explicit Page header may select local js-cookie; second library remains rejected',()=>{
  assert.equal(pageSelectedPackagedLibrary('// @opendesk-lib js-cookie\nasync function main(){}'),'js-cookie');
  assert.equal(pageSelectedPackagedLibrary('async function main(){// @opendesk-lib js-cookie\n}'),null);
  assert.throws(()=>pageSelectedPackagedLibrary(
    '// @opendesk-lib js-cookie\n// @opendesk-lib jquery\nasync function main(){}'),
    e=>e.code==='E_BUILTIN_DECLARATION');
});

test('optional library must match ABI, fixed manifest and exact JS bytes before Page source',async()=>{
  const source='// @opendesk-lib js-cookie\nasync function main(){return typeof Cookies.get;}';
  const code="Object.defineProperty(globalThis,'Cookies',{value:Object.freeze({get(){},set(){}})});";
  const optionalSource={id:'jsCookie',version:'3.0.8',abi:BUILTIN_ABI,code,
    bytes:Buffer.byteLength(code),sha256:digest(code),catalogSha256:fakeBuiltinSource.catalogSha256};
  const good=await compileLockedPageSource({sourceUtf8:source,entryFormat:'async-main',
    builtinSource:fakeBuiltinSource,optionalSource});
  const context=vm.createContext({});
  assert.equal(await vm.runInContext(good.js[0].code,context),'function');
  assert.equal(good.packagedOptionalId,'jsCookie');
  assert.equal(good.packagedOptionalSha256,optionalSource.sha256);
  await assert.rejects(()=>compileLockedPageSource({sourceUtf8:source,entryFormat:'async-main',
    builtinSource:fakeBuiltinSource,optionalSource:{...optionalSource,code:'tampered'}}),
    e=>e.code==='E_DEPENDENCY_HASH');
  await assert.rejects(()=>compileLockedPageSource({sourceUtf8:source,entryFormat:'async-main',
    builtinSource:fakeBuiltinSource}),
    e=>e.code==='E_BUILTIN_VERSION_UNAVAILABLE');
});

test('optional loader validates actual identity and rejects missing/tampered fixed resource',async()=>{
  const row=BUILTIN_RUNTIME_CATALOG.libraries.jsCookie;
  const code="globalThis.Cookies={get(){},set(){}};";
  const resources=BUILTIN_RESOURCE_PATHS.map(path=>{
    const vend=Object.values(BUILTIN_RUNTIME_CATALOG.libraries).find(r=>r.output===path&&r.sha256);
    return {path,bytes:vend?.bytes??(path===row.output?Buffer.byteLength(code):64),
      sha256:vend?.sha256??(path===row.output?digest(code):'a'.repeat(64))};
  });
  const manifest=JSON.stringify({format:'opendesk.builtin-resources.v2',abi:BUILTIN_ABI,
    catalogSha256:digest(JSON.stringify(BUILTIN_RUNTIME_CATALOG)),resources});
  const texts=new Map([[row.output,code],[BUILTIN_RUNTIME_CATALOG.resourceManifest,manifest]]);
  const runtime={id:'opendesk_test',getURL:path=>'chrome-extension://opendesk_test/'+path};
  const fetchImpl=async url=>({
    ok:texts.has(url.replace('chrome-extension://opendesk_test/','')),
    redirected:false,url,
    text:async()=>texts.get(url.replace('chrome-extension://opendesk_test/',''))});
  const loaded=await loadPackagedOptionalPageLibrary('jsCookie',{runtime,fetchImpl});
  assert.equal(loaded.code,code);
  assert.equal(loaded.sha256,digest(code));
  assert.equal(loaded.version,'3.0.8');
  texts.set(row.output,'tampered');
  await assert.rejects(()=>loadPackagedOptionalPageLibrary('jsCookie',{runtime,fetchImpl}),
    e=>e.code==='E_BUILTIN_HASH');
  await assert.rejects(()=>loadPackagedOptionalPageLibrary('unknown',{runtime,fetchImpl}),
    e=>e.code==='E_BUILTIN_DECLARATION');
});

for(const mode of ['production','development']){
  test('built '+mode+' js-cookie WXT IIFE is sealed and installs in USER_SCRIPT only',async()=>{
    const root='dist/'+mode+'/';
    const row=BUILTIN_RUNTIME_CATALOG.libraries.jsCookie;
    const code=await readFile(root+row.output,'utf8');
    const manifest=JSON.parse(await readFile(root+BUILTIN_RUNTIME_CATALOG.resourceManifest,'utf8'));
    const descriptor=manifest.resources.find(x=>x.path===row.output);
    assert.equal(descriptor.bytes,Buffer.byteLength(code));
    assert.equal(descriptor.sha256,digest(code));
    assert.match(code,/^var\s+OpenDeskCookiesBundle\s*=/);
    const ctx=vm.createContext({document:{cookie:''}});
    vm.runInContext(code,ctx,{timeout:3000});
    assert.equal(typeof ctx.Cookies?.get,'function');
    assert.equal(typeof ctx.Cookies?.set,'function');
    assert.equal(Object.getOwnPropertyDescriptor(ctx,'Cookies').configurable,false);
  });
}
