// Cheerio 1.2.0 slim: Page-only genuine parsing and artifact integrity.
// Node VM is component/package evidence, not a native Chrome receipt.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createHash,webcrypto} from 'node:crypto';
import {installPageCheerio} from '../../src/libs/packages/cheerio.js';
import {BUILTIN_ABI,BUILTIN_RUNTIME_CATALOG as catalog} from '../../src/libs/runtime-contract.js';
import {pageSelectedPackagedLibrary,compileLockedPageSource} from '../../src/scripting/user-scripts/execution-source.js';
import {fakeBuiltinSource} from './builtin-support.mjs';
globalThis.crypto ||= webcrypto;
const digest=source=>createHash('sha256').update(source).digest('hex');

test('real Cheerio slim parses HTML and supports selectors without network API',()=>{
  const scope={document:{}};
  installPageCheerio(scope);
  const $=scope.cheerio.load('<main><h1>OpenDesk</h1><ul><li class="item">one</li><li class="item">two</li></ul></main>');
  assert.equal($('h1').text(),'OpenDesk');
  assert.deepEqual($('.item').map((_i,node)=>$(node).text()).get(),['one','two']);
  assert.equal(typeof scope.cheerio.fromURL,'undefined');
  assert.equal(typeof scope.cheerio.loadBuffer,'undefined');
  assert.equal(Object.getOwnPropertyDescriptor(scope,'cheerio').writable,false);
  assert.equal(Object.isFrozen(scope.cheerio),true);
  assert.throws(()=>scope.cheerio.load('x'.repeat(512*1024+1)),e=>e.code==='E_LIMIT');
  assert.throws(()=>scope.cheerio.load({html:'<b>x</b>'}),e=>e.code==='E_CONFIG_UNSUPPORTED');
  assert.throws(()=>installPageCheerio(scope),e=>e.code==='E_BUILTIN_COLLISION');
  assert.throws(()=>installPageCheerio({}),e=>e.code==='E_BUILTIN_WORLD');
});

test('Cheerio explicit USER_SCRIPT declaration and SHA/ABI are fail closed',async()=>{
  const sourceUtf8='// @opendesk-lib cheerio\nasync function main(){return cheerio.load("<h1>X</h1>")("h1").text()}';
  assert.equal(pageSelectedPackagedLibrary(sourceUtf8),'cheerio');
  assert.equal(pageSelectedPackagedLibrary('async function main(){// @opendesk-lib cheerio\n}'),null);
  assert.throws(()=>pageSelectedPackagedLibrary('// @opendesk-lib cheerio\n// @opendesk-lib vue\nasync function main(){}'),
    e=>e.code==='E_BUILTIN_DECLARATION');
  const code='Object.defineProperty(globalThis,"cheerio",{value:Object.freeze({load:()=>()=>({text:()=>42})})});';
  const optionalSource={id:'cheerio',version:'1.2.0',abi:BUILTIN_ABI,code,bytes:Buffer.byteLength(code),
    sha256:digest(code),catalogSha256:fakeBuiltinSource.catalogSha256};
  const compiled=await compileLockedPageSource({sourceUtf8,entryFormat:'async-main',
    builtinSource:fakeBuiltinSource,optionalSource});
  assert.equal(compiled.packagedOptionalId,'cheerio');
  assert.equal(await vm.runInNewContext(compiled.js[0].code,{}),42);
  await assert.rejects(()=>compileLockedPageSource({sourceUtf8,entryFormat:'async-main',
    builtinSource:fakeBuiltinSource,optionalSource:{...optionalSource,code:code+'//tampered'}}),
    e=>e.code==='E_DEPENDENCY_HASH');
  await assert.rejects(()=>compileLockedPageSource({sourceUtf8,entryFormat:'async-main',
    builtinSource:fakeBuiltinSource,optionalSource:{...optionalSource,abi:'opendesk-builtins.v8'}}),
    e=>e.code==='E_BUILTIN_VERSION_UNAVAILABLE');
});

for(const mode of ['production','development']){
  test(mode+' WXT Cheerio slim is fully local and hash-verified',async()=>{
    const root='dist/'+mode+'/',path=catalog.libraries.cheerio.output;
    const code=await readFile(root+path,'utf8');
    const manifest=JSON.parse(await readFile(root+catalog.resourceManifest,'utf8'));
    const info=manifest.resources.find(x=>x.path===path);
    assert(info);assert.equal(info.bytes,Buffer.byteLength(code));
    assert.equal(info.sha256,digest(code));
    assert.match(code,/^var\s+OpenDeskCheerioBundle\s*=/);
    const context=vm.createContext({document:{},TextEncoder,TextDecoder,URL});
    context.window=context;context.self=context;
    vm.runInContext(code,context,{timeout:3500});
    assert.equal(vm.runInContext('cheerio.load("<div class=box>hello</div>")(".box").text()',context),'hello');
    assert.equal(vm.runInContext('typeof cheerio.fromURL',context),'undefined');
    assert.equal(Object.getOwnPropertyDescriptor(context,'cheerio').configurable,false);
  });
}
