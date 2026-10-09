import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import vm from 'node:vm';
import {buildProgramProject} from '../../scripts/build-program-project.mjs';
import {validateProgramProject} from '../../scripts/validate-program-project.mjs';
import {remoteURL,REMOTE_CACHE_DIR,REMOTE_LOCK_FILE} from '../../scripts/remote-esm-modules.mjs';
import {compileLockedPageSource} from '../../src/scripting/user-scripts/execution-source.js';

const parent='https://cdn.example.org/library@1.2.3/index.mjs';
const child='https://cdn.example.org/library@1.2.3/math.mjs';
const sources=new Map([
  [parent,'export {twice} from "./math.mjs";'],
  [child,'export function twice(n){return n*2;}']
]);
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const expectCode=code=>error=>error.code===code;
async function fixture(t,source=parent) {
  const root=await mkdtemp(join(tmpdir(),'opendesk-remote-esm-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  await mkdir(join(root,'src'));
  const pkg=JSON.parse(await readFile('examples/programs/page-heading/package.json','utf8'));
  pkg.name='@opendesk-examples/remote-pinned-fixture';
  pkg.opendesk.id='test.remote-pinned';
  await writeFile(join(root,'package.json'),JSON.stringify(pkg));
  await writeFile(join(root,'src/main.js'),
    'import {twice} from '+JSON.stringify(source)+';\nexport default async function main(){return twice(21);}');
  return root;
}
function fakeFetch(map=sources) {
  const calls=[];
  const fetchImpl=async(url,options)=>{
    calls.push({url,options});
    assert.equal(options.redirect,'manual');
    assert.equal(options.credentials,'omit');
    if(!map.has(url))throw Error('Unexpected URL: '+url);
    return new Response(map.get(url),{status:200,headers:{'content-type':'text/javascript'}});
  };
  return {calls,fetchImpl};
}

test('HTTPS-only ESM imports are recognized without adding a Sidebar dependency form',async t=>{
  const root=await fixture(t);
  const info=await validateProgramProject(root);
  assert.deepEqual(info.remoteImports,[parent]);
  for(const url of [
    'http://cdn.example.org/script.js','https://localhost/secret.js',
    'https://127.0.0.1/internal.js','https://cdn.example.org:8443/x.js',
    'https://user:pass@cdn.example.org/x.js','https://cdn.example.org/x.js#inline',
    'https://cdn.example.org/'
  ])assert.throws(()=>remoteURL(url),expectCode('E_REMOTE_URL'),url);
});

test('default build never downloads unpinned HTTPS modules and produces no executable draft',async t=>{
  const root=await fixture(t),client=fakeFetch();
  await assert.rejects(buildProgramProject(root,{outputDirectory:join(root,'out'),fetchImpl:client.fetchImpl}),
    expectCode('E_REMOTE_UNLOCKED'));
  assert.equal(client.calls.length,0);
  await assert.rejects(readFile(join(root,REMOTE_LOCK_FILE)),{code:'ENOENT'});
});

test('explicit first pin fetches a bounded transitive ESM graph and every later build works offline',async t=>{
  const root=await fixture(t),client=fakeFetch();
  const out=join(root,'out');
  const built=await buildProgramProject(root,{outputDirectory:out,lockRemote:true,fetchImpl:client.fetchImpl});
  assert.equal(built.status,'BUILT_UNVERIFIED');
  assert.equal(built.installable,false);
  assert.deepEqual(client.calls.map(x=>x.url),[parent,child]);
  assert.equal(built.remoteModules.length,2);
  const lock=JSON.parse(await readFile(join(root,REMOTE_LOCK_FILE),'utf8'));
  assert.equal(lock.format,'opendesk.remote-lock.v1');
  assert.deepEqual(Object.keys(lock.modules).sort(),[parent,child].sort());
  assert.equal((await readdir(join(root,REMOTE_CACHE_DIR))).length,2);
  const runtime=await readFile(join(out,'program.js'),'utf8');
  assert.doesNotMatch(runtime,/https:\/\/cdn\.example\.org/,'shipped JS must not import remote code at runtime');
  const compiled=await compileLockedPageSource({sourceUtf8:runtime,entryFormat:'async-main',entries:[]});
  const result=await vm.runInNewContext(compiled.js[0].code,{document:{}});
  assert.equal(result,42,'the compiled async-main entry returns the bundled module result');
  const forbiddenFetch=()=>{throw Error('An ordinary or offline repeat build must not request the CDN');};
  const again=await buildProgramProject(root,{outputDirectory:out,fetchImpl:forbiddenFetch});
  assert.equal(again.sourceHash,built.sourceHash);
  assert.deepEqual(again.remoteModules,built.remoteModules);
  assert.deepEqual((await readdir(out)).sort(),
    ['artifact.json','program.js','program.opendesk-draft.json']);
});

test('cache mutation or deletion fails closed, never replacing bytes from the CDN',async t=>{
  const root=await fixture(t),client=fakeFetch();
  await buildProgramProject(root,{outputDirectory:join(root,'out'),lockRemote:true,fetchImpl:client.fetchImpl});
  const lock=JSON.parse(await readFile(join(root,REMOTE_LOCK_FILE),'utf8'));
  const filename=join(root,REMOTE_CACHE_DIR,lock.modules[parent].sha256+'.mjs');
  await writeFile(filename,'export const compromised=true;');
  await assert.rejects(buildProgramProject(root,{fetchImpl:()=>{throw Error('Must not fetch');}}),
    expectCode('E_REMOTE_HASH'));
});

test('a failed remote graph or HTML response never writes an approved lockfile',async t=>{
  const root=await fixture(t);
  const partial=fakeFetch(new Map([[parent,'import {twice} from "./math.mjs"; export {twice};']]));
  await assert.rejects(buildProgramProject(root,{lockRemote:true,fetchImpl:partial.fetchImpl}),
    expectCode('E_REMOTE_FETCH'));
  await assert.rejects(readFile(join(root,REMOTE_LOCK_FILE)),{code:'ENOENT'});
  const html=async()=>new Response('<html>bad</html>',{status:200,headers:{'content-type':'text/html'}});
  await assert.rejects(buildProgramProject(root,{lockRemote:true,fetchImpl:html}),
    expectCode('E_REMOTE_MIME'));
  await assert.rejects(readFile(join(root,REMOTE_LOCK_FILE)),{code:'ENOENT'});
});

test('redirects, dynamic imports, bare child imports and oversized JS are blocked before bundling',async t=>{
  const root=await fixture(t);
  for(const [fetchImpl,code] of [
    [async()=>new Response('',{status:302,headers:{location:'https://cdn.example.org/other.js'}}),'E_REMOTE_FETCH'],
    [async()=>new Response('export default import("./later.js")',{status:200,headers:{'content-type':'text/javascript'}}),'E_REMOTE_DYNAMIC'],
    [async()=>new Response('import x from "some-npm-package"; export default x;',{
      status:200,headers:{'content-type':'text/javascript'}}),'E_REMOTE_IMPORT'],
    [async()=>new Response('a'.repeat(128*1024+1),{
      status:200,headers:{'content-type':'text/javascript'}}),'E_REMOTE_LIMIT']
  ]) {
    await assert.rejects(buildProgramProject(root,{lockRemote:true,fetchImpl}),
      expectCode(code),code);
    await assert.rejects(readFile(join(root,REMOTE_LOCK_FILE)),{code:'ENOENT'});
    await tick();
  }
});

test('default, named and namespace imports share one pinned URL identity across export * and queries',async t=>{
  const entry='https://cdn.example.org/math/v2/index.mjs?channel=stable';
  const adder='https://cdn.example.org/math/v2/add.mjs?channel=stable';
  const names='https://cdn.example.org/math/v2/names.mjs';
  const modules=new Map([
    [entry,'export {default,add} from "./add.mjs?channel=stable"; export * from "./names.mjs";'],
    [adder,'export function add(a,b){return a+b;} export default add;'],
    [names,'export const meaning=42;']
  ]);
  const root=await fixture(t,entry);
  await writeFile(join(root,'src/main.js'),
    'import add, {add as named, meaning} from '+JSON.stringify(entry)+';\n'+
    'import * as ns from '+JSON.stringify(entry)+';\n'+
    'export default async function main(){return add(20,22)===named(20,22)&&ns.meaning===meaning?42:0;}');
  const client=fakeFetch(modules),out=join(root,'out');
  const first=await buildProgramProject(root,{outputDirectory:out,lockRemote:true,fetchImpl:client.fetchImpl});
  assert.equal(first.remoteModules.length,3);
  assert.equal(client.calls.length,3,'a repeated URL import must download only once');
  assert.ok(first.remoteModules.some(module=>module.url===adder));
  const runtime=await readFile(join(out,'program.js'),'utf8');
  assert.doesNotMatch(runtime,/import\\s*\\(\\s*['"]https?:\\/\\//);
  const compiled=await compileLockedPageSource({sourceUtf8:runtime,entryFormat:'async-main',entries:[]});
  assert.equal(await vm.runInNewContext(compiled.js[0].code,{document:{}}),42);
  const repeated=await buildProgramProject(root,{outputDirectory:out,fetchImpl:()=>{
    throw Error('Pinned URL must not be fetched during offline rebuild');
  }});
  assert.equal(repeated.sourceHash,first.sourceHash);
});
