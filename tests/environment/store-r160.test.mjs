// R16.0 genuine store@2.0.12, prefix-fenced persistence and Page-only opt-in.
// Node/VM build validation is separate from native Chrome receipts.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createHash,webcrypto} from 'node:crypto';
import {installPageStore} from '../../src/libs/packages/store.js';
import {BUILTIN_ABI,BUILTIN_RUNTIME_CATALOG as catalog} from '../../src/libs/runtime-contract.js';
import {pageSelectedPackagedLibrary,compileLockedPageSource} from '../../src/scripting/user-scripts/execution-source.js';
import {fakeBuiltinSource} from './builtin-support.mjs';

globalThis.crypto ||= webcrypto;
const digest=source=>createHash('sha256').update(source).digest('hex');
function siteStorage(){
  const data=new Map();
  let clearCount=0;
  return {
    data,
    get length(){return data.size},
    get clearCount(){return clearCount},
    getItem:key=>data.get(key)??null,
    setItem:(key,value)=>{data.set(String(key),String(value))},
    removeItem:key=>{data.delete(String(key))},
    key:index=>[...data.keys()][index]??null,
    clear(){clearCount++;data.clear()}
  };
}
function page(storage,owner='a'.repeat(64)){
  const scope={document:{},localStorage:storage,location:{origin:'https://page.example'}};
  Object.defineProperty(scope,'__opendeskStoreOwnerV1',{value:owner,configurable:true,writable:false});
  return scope;
}
test('real upstream store engine is synchronously persistent without memory fallback',()=>{
  const local=siteStorage();local.setItem('website-key','website-value');
  const p=page(local);installPageStore(p);
  assert.equal(p.store.version,'2.0.12');assert.equal(p.store.enabled,true);
  assert.equal(p.store.get('count',0),0);
  assert.equal(p.store.set('count',3),3);
  assert.equal(p.store.get('count'),3);
  assert.deepEqual([...local.data.keys()].filter(x=>x!=='website-key').length,1);
  const p2=page(local);installPageStore(p2);
  assert.equal(p2.store.get('count'),3,'new Page world must observe persisted value');
  assert.equal(Object.hasOwn(p,'__opendeskStoreOwnerV1'),false);
  assert.equal(Object.getOwnPropertyDescriptor(p,'store').writable,false);
  assert.throws(()=>installPageStore(p),e=>e.code==='E_BUILTIN_COLLISION');
});

test('clearAll and each affect only the current tool, never website or other tool',()=>{
  const local=siteStorage();local.setItem('website-key','untouched');
  const first=page(local,'a'.repeat(64)),second=page(local,'b'.repeat(64));
  installPageStore(first);installPageStore(second);
  first.store.set('shared','alpha');second.store.set('shared','beta');
  first.store.set('foo',{n:3});
  const observed=[];
  first.store.each((value,key)=>observed.push({key,value}));
  assert.deepEqual(observed.sort((a,b)=>a.key.localeCompare(b.key)),
    [{key:'foo',value:{n:3}},{key:'shared',value:'alpha'}]);
  first.store.clearAll();
  assert.equal(first.store.get('shared'),undefined);
  assert.equal(second.store.get('shared'),'beta');
  assert.equal(local.getItem('website-key'),'untouched');
  assert.equal(local.clearCount,0,'underlying site Storage.clear must never run');
  assert.throws(()=>first.store.set('__proto__',1),e=>e.code==='E_CONFIG_UNSUPPORTED');
  assert.throws(()=>first.store.set('too-large','x'.repeat(129*1024)),e=>e.code==='E_LIMIT');
});

test('a missing native persistence backend refuses to fall back to memory',()=>{
  assert.throws(()=>installPageStore(page(null)),e=>e.code==='E_STORAGE_UNAVAILABLE');
  assert.throws(()=>installPageStore({document:{},location:{origin:'https://example.test'}}),e=>e.code==='E_BUILTIN_VERSION_UNAVAILABLE');
  assert.throws(()=>installPageStore({document:{},location:{origin:'about:blank'}}),e=>e.code==='E_BUILTIN_WORLD');
  assert.equal(pageSelectedPackagedLibrary('// @opendesk-lib store\nasync function main(){}'),'store');
  assert.throws(()=>pageSelectedPackagedLibrary('// @opendesk-lib store\n// @opendesk-lib axios\nasync function main(){}'),
    e=>e.code==='E_BUILTIN_DECLARATION');
});

test('trusted compiler hashes the stable store owner and rejects tampering',async()=>{
  const code="Object.defineProperty(globalThis,'store',{value:Object.freeze({get:()=>42,set:()=>43})});";
  const optionalSource={id:'store',version:'2.0.12',abi:BUILTIN_ABI,code,bytes:Buffer.byteLength(code),
    sha256:digest(code),catalogSha256:fakeBuiltinSource.catalogSha256};
  const sourceUtf8='// @opendesk-lib store\nasync function main(){return store.get("counter")}';
  const make=storeOwnerId=>compileLockedPageSource({
    sourceUtf8,entryFormat:'async-main',builtinSource:fakeBuiltinSource,optionalSource,storeOwnerId
  });
  const [first,other]=await Promise.all([make('extension:programA'),make('extension:programB')]);
  assert.equal(first.sourceHash,other.sourceHash);
  assert.notEqual(first.js[0].code,other.js[0].code,'installed tool namespaces must differ');
  assert.doesNotMatch(first.js[0].code,/extension:programA/,'program identity is hashed');
  assert.equal(await vm.runInNewContext(first.js[0].code,{}),42);
  assert.equal(first.packagedOptionalId,'store');
  await assert.rejects(()=>make(''),e=>e.code==='E_BUILTIN_DECLARATION');
  await assert.rejects(()=>compileLockedPageSource({sourceUtf8,entryFormat:'async-main',builtinSource:fakeBuiltinSource,
    optionalSource:{...optionalSource,code:code+'//tampered'}}),e=>e.code==='E_DEPENDENCY_HASH');
});

for(const mode of ['production','development']){
  test(mode+' pinned store IIFE runs genuine upstream persistence with no MAIN script',async()=>{
    const root='dist/'+mode+'/',path=catalog.libraries.store.output;
    const code=await readFile(root+path,'utf8');
    const manifest=JSON.parse(await readFile(root+catalog.resourceManifest,'utf8'));
    const row=manifest.resources.find(x=>x.path===path);
    assert.equal(row.bytes,Buffer.byteLength(code));
    assert.equal(row.sha256,digest(code));
    assert.match(code,/^var\s+OpenDeskStoreBundle\s*=/);
    const local=siteStorage(),world=page(local);
    world.window=world;world.self=world;
    const context=vm.createContext(world);
    vm.runInContext(code,context,{timeout:4000});
    assert.equal(typeof context.store?.get,'function');
    context.store.set('test',55);
    const second=page(local);second.window=second;second.self=second;
    vm.runInContext(code,vm.createContext(second),{timeout:4000});
    assert.equal(second.store.get('test'),55);
    assert.equal(Object.getOwnPropertyDescriptor(context,'store').configurable,false);
  });
}
