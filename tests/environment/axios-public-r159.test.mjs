// R15.9: real Axios Page API, published npm/WXT file hashes, failure gates.
// Node and VM proof only, separate from actual CFT Page HTTP receipts.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createHash,webcrypto} from 'node:crypto';
import {installPageAxios} from '../../src/libs/packages/axios.js';
import {BUILTIN_ABI,BUILTIN_RUNTIME_CATALOG as catalog} from '../../src/libs/runtime-contract.js';
import {pageSelectedPackagedLibrary,compileLockedPageSource} from '../../src/scripting/user-scripts/execution-source.js';
import {fakeBuiltinSource} from './builtin-support.mjs';
globalThis.crypto ||= webcrypto;
const digest=s=>createHash('sha256').update(s).digest('hex');

test('upstream axios 1.20.0 exposes create/request/interceptors without Chrome authority',async()=>{
  const scope={document:{}};
  installPageAxios(scope);
  assert.equal(typeof scope.axios,'function');
  assert.equal(typeof scope.axios.get,'function');
  assert.equal(typeof scope.axios.post,'function');
  assert.equal(typeof scope.axios.create,'function');
  assert.equal(Object.getOwnPropertyDescriptor(scope,'axios').configurable,false);
  const instance=scope.axios.create({baseURL:'https://example.invalid',withCredentials:false});
  let calls=0;
  const interceptor=instance.interceptors.request.use(config=>{calls++;config.headers.set('x-test','yes');return config;});
  const response=await instance.get('/hello',{adapter:async config=>({
    config,data:'ok',status:200,statusText:'OK',headers:{'content-type':'text/plain'}
  })});
  assert.equal(response.data,'ok');
  assert.equal(response.config.headers.get('x-test'),'yes');
  assert.equal(calls,1);
  assert.equal(instance.interceptors.request.eject(interceptor),undefined);
  assert.throws(()=>installPageAxios(scope),e=>e.code==='E_BUILTIN_COLLISION');
  assert.throws(()=>installPageAxios({}),e=>e.code==='E_BUILTIN_WORLD');
  assert.equal(pageSelectedPackagedLibrary('// @opendesk-lib axios\nasync function main(){}'),'axios');
  assert.throws(()=>pageSelectedPackagedLibrary('// @opendesk-lib axios\n// @opendesk-lib react\nasync function main(){}'),
    e=>e.code==='E_BUILTIN_DECLARATION');
});

test('Page Axios requires explicit resource version, ABI and unchanged SHA',async()=>{
  const code='Object.defineProperty(globalThis,"axios",{value:Object.assign(()=>42,{create(){},interceptors:{request:{use(){}}}})});';
  const optionalSource={id:'axios',version:'1.20.0',abi:BUILTIN_ABI,code,
    bytes:Buffer.byteLength(code),sha256:digest(code),catalogSha256:fakeBuiltinSource.catalogSha256};
  const sourceUtf8='// @opendesk-lib axios\nasync function main(){return axios()}';
  const compiled=await compileLockedPageSource({sourceUtf8,entryFormat:'async-main',
    builtinSource:fakeBuiltinSource,optionalSource});
  assert.equal(compiled.packagedOptionalId,'axios');
  assert.equal(await vm.runInNewContext(compiled.js[0].code,{}),42);
  await assert.rejects(()=>compileLockedPageSource({sourceUtf8,entryFormat:'async-main',
    builtinSource:fakeBuiltinSource,optionalSource:{...optionalSource,code:code+'//tampered'}}),
    e=>e.code==='E_DEPENDENCY_HASH');
  await assert.rejects(()=>compileLockedPageSource({sourceUtf8,entryFormat:'async-main',
    builtinSource:fakeBuiltinSource,optionalSource:{...optionalSource,version:'1.13.2'}}),
    e=>e.code==='E_BUILTIN_VERSION_UNAVAILABLE');
  await assert.rejects(()=>compileLockedPageSource({sourceUtf8,entryFormat:'async-main',
    builtinSource:fakeBuiltinSource}),e=>e.code==='E_BUILTIN_VERSION_UNAVAILABLE');
});

for(const mode of ['production','development']){
  test(mode+' authentic Axios WXT IIFE is SHA sealed and not website MAIN',async()=>{
    const root='dist/'+mode+'/',path=catalog.libraries.axios.output;
    const code=await readFile(root+path,'utf8');
    const manifest=JSON.parse(await readFile(root+catalog.resourceManifest,'utf8'));
    const row=manifest.resources.find(r=>r.path===path);
    assert(row);
    assert.equal(row.bytes,Buffer.byteLength(code));assert.equal(row.sha256,digest(code));
    assert.match(code,/^var\s+OpenDeskAxiosBundle\s*=/);
    const page=vm.createContext({document:{},URL,TextEncoder,TextDecoder,
      location:{href:'https://example.invalid/page',origin:'https://example.invalid'},
      navigator:{userAgent:'Mozilla/5.0 Chrome test'},Blob,FormData});
    page.window=page;page.self=page;
    vm.runInContext(code,page,{timeout:4000});
    assert.equal(typeof page.axios?.get,'function');
    assert.equal(typeof page.axios?.create,'function');
    assert.equal(typeof page.axios?.interceptors?.request?.use,'function');
    assert.equal(Object.getOwnPropertyDescriptor(page,'axios').writable,false);
  });
}
