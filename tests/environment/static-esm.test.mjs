import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {parseStaticESMSource,assertStaticESMLeaf,staticESMUrl,STATIC_ESM_LIMITS} from '../../src/scripting/user-scripts/static-esm.js';

const url='https://libraries.example.org/leaf.mjs';
const source=(body='async function main(){return value;}')=>`import {value} from '${url}';\n${body}`;
const rejects=(fn,code)=>assert.throws(fn,error=>error.code===code);

test('ordinary draft static imports preserve declarations and expose the zero-parameter async main AST',()=>{
  for(const body of ['async function main(){return value;}', 'export default async function main(){return value;}']) {
    const parsed=parseStaticESMSource(source(body));
    assert.equal(parsed.entry.id.name,'main');assert.equal(parsed.entry.async,true);assert.deepEqual(parsed.entry.params,[]);
    assert.deepEqual(parsed.requires,[{order:0,raw:url,originalUrl:url,url,integrity:[]}]);
  }
  const parsed=parseStaticESMSource(`import '${url}'; import * as leaf from '${url}'; async function main(){await leaf.value;}`);
  assert.equal(parsed.requires.length,2);assert.deepEqual(parsed.requires.map(row=>row.order),[0,1]);
  assert.equal(parseStaticESMSource('export default async function main(){}').requires.length,0);
});

test('only literal public HTTPS import URLs are admitted and credential queries are never reflected in errors',()=>{
  for(const value of ['d3','./leaf.js','/leaf.js','http://example.org/x.js','https://user:pw@example.org/x.js',
    'https://example.org:443/x.js','https://example.org:444/x.js','https://example.org/x.js#x',
    'https://example.org/x.js?api-key=secret','https://example.org/x.js?X-Amz-Signature=secret',
    'https://example.org/x.js?access_token=secret','https://127.0.0.1/x.js','https://[::1]/x.js',
    'https://0x7f000001/x.js','https://192.168.1.1/x.js','https://localhost/x.js',
    'https://home.arpa/x.js','https://host.internal/x.js','https://host.test/x.js','https://host.invalid/x.js',
    'https://host.local/x.js','https://example.org./x.js','https://example.org/',
    'https://example.org/\nx.js','https://example.org\\@private.local/x.js']) {
    rejects(()=>staticESMUrl(value),'E_DEPENDENCY_URL');
    rejects(()=>parseStaticESMSource(`import ${JSON.stringify(value)}; async function main(){}`),'E_DEPENDENCY_URL');
  }
  assert.equal(staticESMUrl(url+'?target=es2022'),url+'?target=es2022');
  assert.throws(()=>staticESMUrl(url+'?token=TOP_SECRET'),error=>!error.message.includes('TOP_SECRET'));
});

test('ESM roots reject invalid entries, dynamic imports, import.meta, top-level await and @require',()=>{
  for(const body of ['function main(){}','async function main(x){}','async function* main(){}',
    'const main=async()=>{};','export default async function other(){}','export default async function(){}',
    'export async function main(){}','async function main(){}; export default main;',
    'async function other(){}','export const x=1; async function main(){}']) rejects(()=>parseStaticESMSource(source(body)),'E_ESM_ENTRY');
  for(const tail of ['await 1;','for await(const x of []){}', 'class A extends (await Promise.resolve(Object)) {}',
    'class A { [await 1](){} }']) rejects(()=>parseStaticESMSource(source()+'\n'+tail),'E_ESM_TLA');
  for(const body of ['async function main(){return import("./x.js");}',
    'async function main(){return `${import("./x.js")}`;}',
    'class X { value=import("./x.js"); } async function main(){}']) rejects(()=>parseStaticESMSource(source(body)),'E_ESM_DYNAMIC');
  rejects(()=>parseStaticESMSource(source('async function main(){return import.meta.url;}')),'E_ESM_META');
  rejects(()=>parseStaticESMSource('// @require '+url+'\n'+source()),'E_ESM_REQUIRE');
  rejects(()=>parseStaticESMSource('/*\n * @require '+url+'\n */\n'+source()),'E_ESM_REQUIRE');
  rejects(()=>parseStaticESMSource('import ???'),'E_ESM_SYNTAX');
});

test('leaf modules need actual exports and have no module graph or runtime code generation',()=>{
  for(const text of ['export default function max(){}', 'export const value=1;',
    'const x=1; export {x as value};',
    'export async function value(){return await Promise.resolve(1);}']) assert.ok(assertStaticESMLeaf(text).exports.length);
  for(const text of ['(function(root,factory){root.Mustache=factory();})(this,function(){return {};});',
    'export {};','const message="export const value=1";', '// export const value=1\nconst value=1;']) rejects(()=>assertStaticESMLeaf(text),'E_ESM_EXPORT');
  for(const text of [`import '${url}';export const value=1;`, 'import x from "./x.js";export {x};',
    'export {value} from "./x.js";', 'export * from "./x.js";']) rejects(()=>assertStaticESMLeaf(text),'E_ESM_GRAPH');
  rejects(()=>assertStaticESMLeaf('export const value=import("./x.js");'),'E_ESM_DYNAMIC');
  rejects(()=>assertStaticESMLeaf('export const value=import.meta.url;'),'E_ESM_META');
  rejects(()=>assertStaticESMLeaf('export const {x:value}={x:1};'),'E_ESM_EXPORT');
  rejects(()=>assertStaticESMLeaf('export const value=await Promise.resolve(1);'),'E_ESM_TLA');
  rejects(()=>assertStaticESMLeaf('for await(const x of []){};export const value=1;'),'E_ESM_TLA');
  for(const text of ['export const value=eval("1");','export const value=(0,eval)("1");',
    'export const value=new Function("return 1");', 'export const value=Function;',
    'export const value=globalThis["Fun"+"ction"]("return 1");',
    'export const value=globalThis[`eval`]("1");', 'export const value=(()=>{}).constructor("return 1");',
    'export const value=require("./x.js");']) rejects(()=>assertStaticESMLeaf(text),'E_ESM_EVAL');
  assertStaticESMLeaf('const text="eval Function import.meta"; const re=/import\\(/; export {text};');
});

test('real pinned D3 array max leaf is accepted with its original export and cache hash',async()=>{
  const directory=new URL('../../examples/programs/page-ui-toc-react-direct/',import.meta.url);
  const lock=JSON.parse(await readFile(new URL('opendesk.remote-lock.json',directory),'utf8'));
  const entry=lock.modules['https://raw.githubusercontent.com/d3/d3-array/v3.2.4/src/max.js'];
  const bytes=await readFile(new URL(`.opendesk/remote-cache/${entry.sha256}.mjs`,directory));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),entry.sha256);
  assert.deepEqual(assertStaticESMLeaf(bytes.toString('utf8')).exports,['default']);
});

test('compiler-compatible limits count unique modules while retaining repeated declaration identity',()=>{
  const imports=Array.from({length:STATIC_ESM_LIMITS.modules},(_,i)=>`import 'https://example.org/${i}.mjs';`);
  assert.equal(parseStaticESMSource(imports.join('\n')+'async function main(){}').requires.length,16);
  rejects(()=>parseStaticESMSource(imports.join('\n')+`import '${url}'; async function main(){}`),'E_DEPENDENCY_LIMIT');
  assert.equal(parseStaticESMSource(imports[0].repeat(64)+'async function main(){}').requires.length,64);
  rejects(()=>parseStaticESMSource(imports[0].repeat(65)+'async function main(){}'),'E_DEPENDENCY_LIMIT');
});
