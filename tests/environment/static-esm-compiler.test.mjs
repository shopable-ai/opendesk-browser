import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {compileStaticESM} from '../../src/ui/static-esm-linker.mjs';
import {assertStaticESMLeaf} from '../../src/scripting/user-scripts/static-esm.js';
import {createStaticESMPreparer} from '../../src/ui/static-esm-preparer.js';
import {PAGE_BROWSER_COMPILER,PAGE_BROWSER_PRIVATE_FILES} from '../../src/libs/page-frameworks/contract.js';
const hash=value=>createHash('sha256').update(value).digest('hex');
const bytes=await readFile(PAGE_BROWSER_COMPILER.source);
assert.equal(hash(bytes),PAGE_BROWSER_COMPILER.sha256);
const context=vm.createContext({TextEncoder,TextDecoder});
vm.runInContext(bytes.toString('utf8'),context,{timeout:5000});
const babel=context.Babel;
const url='https://cdn.jsdelivr.net/npm/d3-array@3.2.4/src/max.js';
const lockId='dep-lock-'+'a'.repeat(64),manifestDigest='b'.repeat(64);
const code='export default function max(values){globalThis.moduleRuns++;return Math.max(...values);}';
const entries=[{url,code,sha256:hash(code),order:0}];
const sourceUtf8=`import max from '${url}';\nasync function main(){return {value:max([2,9,5]),title:document.title};}`;
async function execute(source,globals={}){
  const sandbox=vm.createContext({moduleRuns:0,...globals});
  const value=await new vm.Script('(async()=>{'+source+';return await main();})()').runInContext(sandbox);
  return {value:JSON.parse(JSON.stringify(value)),sandbox};
}
test('both ESM main declarations keep an unbound strict this',async()=>{
  for(const prefix of ['', 'export default ']) {
    const built=compileStaticESM({sourceUtf8:prefix+'async function main(){return this===undefined;}',entries:[],sourceFormat:'esm-page',babel});
    assert.equal((await execute(built.sourceUtf8)).value,true);
  }
});
test('manager and compiler reject reflective or computed constructor aliases before execution',()=>{
  for(const module of [
    'const {["constructor"]:F}=(()=>{});export const value=F("return 7")();',
    'const {"constructor":F}=(()=>{});export const value=F("return 7")();',
    'const {constructor:F}=(()=>{});export const value=F("return 7")();',
    'const {"getPrototypeOf":F}=Object;export const value=F(()=>{});',
    'const key="Fun"+"ction";export const value=globalThis[key]("return 7")();',
    'export const value=Reflect.get(()=>{},"constructor")("return 7")();',
    'export const value=Object.getPrototypeOf(()=>{})["constructor"]("return 7")();',
  ]) {
    assert.throws(()=>assertStaticESMLeaf(module),error=>error.code==='E_ESM_EVAL');
    assert.throws(()=>compileStaticESM({sourceUtf8:`import {value} from '${url}';async function main(){return value;}`,entries:[{url,code:module}],sourceFormat:'esm-page',babel}),error=>error.code==='E_STATIC_ESM_DYNAMIC');
  }
});
test('legal new.target works inside leaf functions; reserved CommonJS marker is rejected before approval',async()=>{
  const module='export function value(){return new.target;}';assertStaticESMLeaf(module);
  const built=compileStaticESM({sourceUtf8:`import {value} from '${url}';async function main(){return value()===undefined;}`,entries:[{url,code:module}],sourceFormat:'esm-page',babel});
  assert.equal((await execute(built.sourceUtf8)).value,true);
  assert.throws(()=>assertStaticESMLeaf('export const __esModule=7;'),error=>error.code==='E_ESM_EXPORT');
});
test('same pinned Babel compiles leaf imports as data; Page execution and modules happen separately',async()=>{
  const built=compileStaticESM({sourceUtf8,entries,sourceFormat:'esm-page',babel});
  assert.equal(context.moduleRuns,undefined);
  assert.equal(built.entryFormat,'async-main');
  const {value,sandbox}=await execute(built.sourceUtf8,{document:{title:'Demo'}});
  assert.deepEqual(value,{value:9,title:'Demo'});assert.equal(sandbox.moduleRuns,1);
  assert.equal(sandbox.max,undefined,'module bindings stay private');
});
test('Controller compiled entry preserves controlled lexical page/params and zero arguments',async()=>{
  const root=`import max from '${url}';export default async function main(){return {value:max(params.values),title:await page.title(),words:_.words('OpenDesk Browser')};}`;
  const built=compileStaticESM({sourceUtf8:root,entries,sourceFormat:'esm-controller',babel});
  const {value}=await execute(built.sourceUtf8,{page:{title:async()=> 'Controller'},params:{values:[4,8]},_:{words:s=>s.split(' ')}});
  assert.deepEqual(value,{value:8,title:'Controller',words:['OpenDesk','Browser']});
});
test('ESM entry with no imports needs no dependency lock; missing imported module still fails',async()=>{
  const preparer=createStaticESMPreparer({api,WorkerClass:CompilerWorker});
  const root='export default async function main(){return params.value;}';
  const built=await preparer.prepare({sourceUtf8:root,entries:[],sourceFormat:'esm-controller',lockId:null,manifestDigest});
  assert.equal((await execute(built.sourceUtf8,{params:{value:42}})).value,42);
  assert.throws(()=>compileStaticESM({sourceUtf8,entries:[],sourceFormat:'esm-page',babel}),{code:'E_STATIC_ESM_INPUT'});
  preparer.dispose();
});
test('leaf namespace has read-only bindings while live exports still update',async()=>{
  const moduleCode='export let value=1;export function increment(){value++;}';
  const root=`import * as lib from '${url}';async function main(){lib.increment();let refused=false;try{lib.value=7;}catch{refused=true;}return {value:lib.value,refused};}`;
  const built=compileStaticESM({sourceUtf8:root,entries:[{url,code:moduleCode}],sourceFormat:'esm-page',babel});
  assert.deepEqual((await execute(built.sourceUtf8)).value,{value:2,refused:true});
});
test('rejects UMD, graph imports, missing exports, dynamic import, TLA and incompatible entry',()=>{
  const cases=[
    {entries:[{url,code:'globalThis.Mustache={render(){}};'}]},
    {entries:[{url,code:'import x from "./x.js";export default x;'}]},
    {entries:[{url,code:'export const other=1;'}]},
    {entries:[{url,code:'export default await Promise.resolve(1);'}]},
    {entries:[{url,code:'export default function(){return import("./x.js")}'}]},
    {sourceUtf8:`import max from '${url}';export default async function main({page}){}`},
    {sourceUtf8:`import max from '${url}';await Promise.resolve();async function main(){}`},
    {sourceUtf8:'import x from "http://example.com/x.js";async function main(){}'},
    {sourceUtf8:'import x from "some-package";async function main(){}'}
  ];
  for(const row of cases)assert.throws(()=>compileStaticESM({sourceUtf8,entries,sourceFormat:'esm-page',babel,...row}),error=>/^E_STATIC_ESM_/.test(error.code));
});
test('every new raw compiler resource is fixed by the package contract',async()=>{
  for(const row of PAGE_BROWSER_PRIVATE_FILES.filter(row=>row.id.startsWith('static-esm'))){
    const original=await readFile(row.source);assert.equal(original.length,row.bytes);assert.equal(hash(original),row.sha256);
  }
});
const api={runtime:{getURL:path=>'chrome-extension://abcdefghijklmnopabcdefghijklmnop/'+path}};
class CompilerWorker{
  static latest;
  constructor(url,{type}){assert.match(url,/\/ui\/static-esm-compiler-worker.js$/);assert.equal(type,'classic');CompilerWorker.latest=this;}
  terminate(){this.terminated=true;}
  postMessage(message){this.message=message;queueMicrotask(()=>this.onmessage({data:{requestId:message.requestId,ok:true,
    result:compileStaticESM({...message.input,babel})}}));}
}
test('preparer verifies all approved bytes before offline worker compilation and binds both hashes',async()=>{
  const preparer=createStaticESMPreparer({api,WorkerClass:CompilerWorker});
  const built=await preparer.prepare({sourceUtf8,entries,sourceFormat:'esm-page',lockId,manifestDigest});
  assert.equal(built.authorSourceHash,hash(sourceUtf8));assert.equal(built.sourceHash,hash(built.sourceUtf8));
  assert.equal(CompilerWorker.latest.terminated,true);
  await assert.rejects(preparer.prepare({sourceUtf8,entries:[{...entries[0],code:'tampered'}],sourceFormat:'esm-page',lockId,manifestDigest}),{code:'E_DEPENDENCY_HASH'});
  preparer.dispose();await assert.rejects(preparer.prepare({}),{code:'E_STATIC_ESM_CLOSED'});
});
test('cancelled worker output cannot revive a stale preparation',async()=>{
  class Delayed extends CompilerWorker{postMessage(message){this.message=message;}}
  const preparer=createStaticESMPreparer({api,WorkerClass:Delayed});
  const pending=preparer.prepare({sourceUtf8,entries,sourceFormat:'esm-controller',lockId,manifestDigest});
  await new Promise(resolve=>setImmediate(resolve));const worker=CompilerWorker.latest;
  preparer.cancel();await assert.rejects(pending,{code:'E_STATIC_ESM_STALE'});assert.equal(worker.terminated,true);
  preparer.dispose();
});
