import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {prepareBrowserPageComponent,inspectBrowserPageComponent} from '../../src/libs/page-frameworks/page-component-browser-linker.js';
import {transformVueSFC} from '../../src/libs/page-frameworks/vue-sfc-transform.js';
import {PAGE_BROWSER_COMPILER,PAGE_BROWSER_PRIVATE_FILES} from '../../src/libs/page-frameworks/contract.js';
// Exercise the exact offline asset shipped to the browser compiler. The
// maintainer-only npm package is not an installed root test dependency.
const compilerBytes=await readFile(PAGE_BROWSER_COMPILER.source);
assert.equal(compilerBytes.length,PAGE_BROWSER_COMPILER.bytes);
assert.equal(createHash('sha256').update(compilerBytes).digest('hex'),PAGE_BROWSER_COMPILER.sha256);
const compilerContext=vm.createContext({TextEncoder,TextDecoder});
vm.runInContext(compilerBytes.toString('utf8'),compilerContext,{filename:PAGE_BROWSER_COMPILER.source,timeout:5000});
const Babel=compilerContext.Babel;
assert.equal(Babel.version,PAGE_BROWSER_COMPILER.version);
const rules={matches:['http://127.0.0.1:43111/*'],excludeMatches:[],
  runAt:'document_idle',allFrames:false,world:'USER_SCRIPT'};
const fakeUI='var __opendeskPageUIR243={createPageUI:function(){return {content:{},onDispose(){},addStyle(){},getMountDiagnostics(){return {}}}}};';
for(const [framework,path] of [
  ['react','examples/programs/page-ui-react/src/App.jsx'],
  ['vue','examples/programs/page-ui-vue/src/App.vue']
]){
  test('R24.3 pure browser preparation of '+framework+' is source data, never module execution',async()=>{
    const raw=await readFile(path,'utf8');
    globalThis.__moduleEvaluated=false;
    const result=await prepareBrowserPageComponent({componentSource:raw,
      framework,projectId:'sample.browser-'+framework,pageRules:rules,
      babel:Babel,transformSFC:transformVueSFC,uiHelperSource:fakeUI});
    assert.equal(globalThis.__moduleEvaluated,false);
    assert.equal(result.entry,'src/App.'+(framework==='react'?'jsx':'vue'));
    assert.ok(result.sourceUtf8.length<100000);
    assert.match(result.sourceUtf8,new RegExp('// @opendesk-lib '+framework));
    assert.match(result.sourceUtf8,/async function main\(\)/);
    assert.match(result.sourceUtf8,/createPageUI/);
    assert.match(result.sourceUtf8,/\.unmount\(\)/);
    assert.ok(result.sourceMap.app);
    if(framework==='vue')assert.match(result.sourceUtf8,/data-v-/);
    new vm.Script(result.sourceUtf8);
  });
}
test('R24.3 browser transform refuses wrong runtime, missing export, eval and unlocked imports',async()=>{
  const cases=[
    {framework:'react',source:"import {ref} from 'vue';export default function App(){}"},
    {framework:'react',source:"export default function App(){return import('./evil.js')}"},
    {framework:'react',source:"import {useImaginaryHook} from 'react';export default function App(){}"},
    {framework:'react',source:"export default function App(){eval('1')}"},
    {framework:'vue',source:'<script setup>import x from "https://bad.example/x.js"</script><template><b>x</b></template>'}
  ];
  for(const row of cases)await assert.rejects(
    prepareBrowserPageComponent({componentSource:row.source,
      framework:row.framework,projectId:'sample.browser',pageRules:rules,
      babel:Babel,transformSFC:transformVueSFC,uiHelperSource:fakeUI}),
    error=>row.framework==='vue'?error.code==='E_REMOTE_UNLOCKED':/^E_PAGE_/.test(error.code||''));
});

const sha=value=>createHash('sha256').update(value).digest('hex');
const inputFor=(source,remoteModules=[])=>({componentSource:source,framework:'react',projectId:'sample.browser-remote',
  pageRules:rules,babel:Babel,transformSFC:transformVueSFC,uiHelperSource:fakeUI,remoteModules,
  remoteLock:{format:'opendesk.remote-lock.v1',modules:Object.fromEntries(remoteModules.map(({url,sha256,bytes})=>[url,{sha256,bytes}]))}});
const moduleRow=(url,code)=>({url,code,sha256:sha(code),bytes:Buffer.byteLength(code)});
const root='https://modules.example.org/v1/index.js',child='https://modules.example.org/v1/math.js';

test('browser ESM inspector discovers literal transitive URLs without evaluating any module',async()=>{
  const raw=`import calculate from '${root}';export default function App(){return calculate(4)}`;
  const code="import {twice} from './math.js';globalThis.__esmCompilerExecuted=true;export default value=>twice(value)+1;";
  const first=await inspectBrowserPageComponent(inputFor(raw));
  assert.deepEqual(first.remoteRoots,[root]);assert.deepEqual(first.missingUrls,[root]);assert.equal(first.complete,false);
  const second=await inspectBrowserPageComponent(inputFor(raw,[moduleRow(root,code)]));
  assert.deepEqual(second.missingUrls,[child]);assert.equal(second.complete,false);
  assert.equal(globalThis.__esmCompilerExecuted,undefined);
  const rows=[moduleRow(root,code),moduleRow(child,'export const twice=value=>value*2;')];
  const completed=await inspectBrowserPageComponent(inputFor(raw,rows));
  assert.equal(completed.complete,true);assert.equal(completed.sourceHash,sha(raw));
  const built=await prepareBrowserPageComponent(inputFor(raw,rows));
  assert.equal(globalThis.__esmCompilerExecuted,undefined,'preparing only transforms text');
  const context=vm.createContext({});
  vm.runInContext(built.sourceUtf8+'\nglobalThis.__component=__odComponentR243.default;',context);
  assert.equal(context.__component(),9,'explicit Node model execution uses the imported remote function');
  assert.equal(context.__esmCompilerExecuted,true);
  assert.deepEqual(built.remoteLock,completed.remoteLock);
});

test('browser linker uses the real pinned D3 max bytes and keeps one fixed React runtime',async()=>{
  const project='examples/programs/page-ui-toc-react-direct';
  const lock=JSON.parse(await readFile(project+'/opendesk.remote-lock.json','utf8'));
  const url='https://raw.githubusercontent.com/d3/d3-array/v3.2.4/src/max.js',row=lock.modules[url];
  assert.equal(row.sha256,'691945a453633d9e204846af8ea4e299821b924f82b15eaf7906aba642979b1d');
  const code=await readFile(project+'/.opendesk/remote-cache/'+row.sha256+'.mjs','utf8');
  const source=`import React from 'react';import max from '${url}';export default function App(){return <output>{max([3,9,4])}</output>}`;
  const prepared=await prepareBrowserPageComponent(inputFor(source,[{url,...row,code}]));
  const context=vm.createContext({OpenDeskPageReact:{createElement:(name,props,...children)=>({name,props,children})}});
  vm.runInContext(prepared.sourceUtf8+'\nglobalThis.__component=__odComponentR243.default;',context);
  assert.equal(context.__component().children[0],9);
  assert.equal(prepared.remoteModules.length,1);assert.equal(prepared.remoteModules[0].sha256,row.sha256);
  assert.match(prepared.sourceUtf8,/return globalThis.OpenDeskPageReact/);
  assert.doesNotMatch(prepared.sourceUtf8,/createElement\(['"]script|window\.React|@require|import\(/);
  assert.ok(Buffer.byteLength(prepared.sourceUtf8)<100000);
});

test('browser remote graph rejects missing locks, corruption, URL changes, unavailable exports, UMD and dynamic code before execution',async()=>{
  const source=`import calculate from '${root}';export default function App(){return calculate(4)}`;
  const row=moduleRow(root,'export default value=>value+1;');
  await assert.rejects(prepareBrowserPageComponent({...inputFor(source,[row]),remoteLock:undefined}),{code:'E_REMOTE_UNLOCKED'});
  await assert.rejects(prepareBrowserPageComponent({...inputFor(source,[row]),remoteModules:[{...row,code:row.code+' '}] }),{code:'E_REMOTE_HASH'});
  await assert.rejects(prepareBrowserPageComponent(inputFor(source.replace('/v1/','/v2/'),[row])),{code:'E_REMOTE_GRAPH'});
  await assert.rejects(prepareBrowserPageComponent(inputFor(source,[moduleRow(root,'export const named=4;')])),{code:'E_REMOTE_EXPORT'});
  await assert.rejects(prepareBrowserPageComponent(inputFor(source,[moduleRow(root,'globalThis.fakeChart={};')])),{code:'E_REMOTE_ESM'});
  await assert.rejects(prepareBrowserPageComponent(inputFor(source,[moduleRow(root,'export default value=>import("./runtime.js");')])),{code:'E_PAGE_COMPONENT_DYNAMIC'});
  await assert.rejects(prepareBrowserPageComponent(inputFor(source,[moduleRow(root,'export default await Promise.resolve(1);')])),{code:'E_PAGE_COMPONENT_DYNAMIC'});
  assert.equal(globalThis.fakeChart,undefined);
});

test('a lock with the same semantic entries is accepted after serialized property order changes',async()=>{
  const source=`import fn from '${root}';export default function App(){return fn(4)}`;
  const row=moduleRow(root,'export default value=>value+1;'),input=inputFor(source,[row]);
  input.remoteLock.modules[root]={bytes:row.bytes,sha256:row.sha256};
  assert.equal((await prepareBrowserPageComponent(input)).remoteModules[0].sha256,row.sha256);
});

test('the shipped worker/linker bytes match their immutable registry and the generated linker includes the HTTPS adapter',async()=>{
  for(const id of ['page-compiler-worker','page-component-linker']){
    const row=PAGE_BROWSER_PRIVATE_FILES.find(row=>row.id===id),bytes=await readFile(row.source);
    assert.equal(bytes.length,row.bytes);assert.equal(sha(bytes),row.sha256);
  }
  const linked=await import('../../src/libs/page-frameworks/page-component-linker-r243.mjs');
  assert.equal(typeof linked.inspectBrowserPageComponent,'function');
  const row=moduleRow(root,'export default value=>value+1;');
  const input=inputFor(`import value from '${root}';export default function App(){return value(4)}`,[row]);
  assert.equal((await linked.prepareBrowserPageComponent(input)).sourceUtf8,(await prepareBrowserPageComponent(input)).sourceUtf8);
});
