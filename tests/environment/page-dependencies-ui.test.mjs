import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createPageDependencyResolver,inferPageEntryFormat,assertPageSourceReadyToRun} from '../../src/ui/page-dependencies.js';
import {hasUnbuiltESM} from '../../src/ui/esm-source-detector.js';
import {digestUtf8} from '../../src/platform/protocol.js';

const tick=()=>new Promise(resolve=>setImmediate(resolve));
const settle=async()=>{await tick();await tick();};
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
const firstUrl='https://first.example.org/library.js';
const secondUrl='https://second.example.net/helper.js';
const withRequire=(url,body='async function main(){return document.title;}')=>
  '// ==UserScript==\n// @require '+url+'\n// ==/UserScript==\n'+body;
const locked=[{lockId:'dep-lock-'+('a'.repeat(64)),approvedAt:1720000000000}];
function fixture(sourceUtf8,{getLocks=()=>[],waitForInspect,selectedLockId=null}={}) {
  let source=sourceUtf8,updates=0;
  const requests=[];
  const client={ready:Promise.resolve(),async request(method,input){
    requests.push({method,input:structuredClone(input)});
    assert.equal(method,'inspectPageDependencies');
    if(waitForInspect)await waitForInspect(input);
    return {locks:structuredClone(getLocks(input)),selectedLockId};
  }};
  const resolver=createPageDependencyResolver({client,getSource:()=>source,onState:()=>updates++});
  return {resolver,requests,get updates(){return updates;},edit(value){source=value;resolver.refresh();}};
}

test('development UI exposes explicit Classic @require prepare/review without legacy manual injection controls',async()=>{
  const html=await readFile('src/ui/tool.html','utf8');
  assert.match(html,/id="script-source"/);
  assert.match(html,/<summary id="page-preview-mode-title">网页 JavaScript 试运行<\/summary>/);
  for(const id of ['page-dependency-panel','page-dependency-list','page-dependency-prepare',
    'page-dependency-review','page-dependency-approve','page-dependency-lock'])
    assert.match(html,new RegExp('id="'+id+'"'),id+' must be in the existing developer page');
  for(const id of ['page-dependency-url','page-dependency-add','page-preview-jquery','page-preview-entry'])
    assert.doesNotMatch(html,new RegExp('id="'+id+'"'),id+' is an obsolete UI control');
  const editor=await readFile('src/ui/script-editor.js','utf8');
  assert.match(editor,/createPageDependencyInstaller/);
  assert.match(editor,/getProgramId:\(\)=>scriptId\(\)/);
});

test('plain top-level JavaScript and main() JavaScript need no metadata or dependency inspection',async t=>{
  const top=fixture('document.title = "demo";');t.after(()=>top.resolver.dispose());
  await settle();
  assert.deepEqual(top.resolver.capture(),
    {sourceUtf8:'document.title = "demo";',entryFormat:'classic-userscript',lockId:null});
  assert.deepEqual(top.requests,[]);
  const body='async function main(){return document.title;}';
  const main=fixture(body);t.after(()=>main.resolver.dispose());
  await settle();
  assert.deepEqual(main.resolver.capture(),{sourceUtf8:body,entryFormat:'async-main',lockId:null});
  assert.equal(inferPageEntryFormat('function main(){return 1;}'),'async-main');
  assert.equal(inferPageEntryFormat('const main = async()=>42'),'classic-userscript');
  assert.equal(inferPageEntryFormat('// async function main(){return 1;}\ndocument.title="ok";'),'classic-userscript');
  assert.equal(inferPageEntryFormat('const value=42;'),'classic-userscript');
  assert.deepEqual(main.requests,[]);
});

test('legacy @require without a prior lock stays blocked; no download, approval or permission request happens',async t=>{
  const source=withRequire(firstUrl);
  const f=fixture(source);t.after(()=>f.resolver.dispose());
  await settle();
  assert.deepEqual(f.requests.map(row=>row.method),['inspectPageDependencies']);
  assert.deepEqual(f.requests[0].input,{sourceUtf8:source,entryFormat:'async-main'});
  assert.throws(()=>f.resolver.capture(),error=>error.code==='E_DEPENDENCY_UNLOCKED'&&
    /网络 JS|第三方 JS 依赖|手动获取|下载准备/.test(error.message));
});

test('one approved lock is reused across body edits but never across changed dependency declarations',async t=>{
  const source=withRequire(firstUrl);
  const f=fixture(source,{getLocks:input=>input.sourceUtf8.includes(firstUrl)&&
    !input.sourceUtf8.includes(secondUrl)?locked:[]});
  t.after(()=>f.resolver.dispose());await settle();
  assert.equal(f.resolver.capture().lockId,locked[0].lockId);
  const edited=withRequire(firstUrl,'async function main(){return "changed body";}');
  f.edit(edited);await settle();
  assert.equal(f.resolver.capture().lockId,locked[0].lockId);
  assert.equal(f.resolver.capture().sourceUtf8,edited);
  assert.equal(f.requests.length,1,'ordinary body changes do not re-query dependency locks');
  f.edit(withRequire(secondUrl));await settle();
  assert.throws(()=>f.resolver.capture(),error=>error.code==='E_DEPENDENCY_UNLOCKED');
  assert.equal(f.requests.length,2);
});

test('multiple approved versions are not chosen silently',async t=>{
  const f=fixture(withRequire(firstUrl),{getLocks:()=>[...locked,{...locked[0],lockId:'dep-lock-'+('b'.repeat(64))}]});
  t.after(()=>f.resolver.dispose());await settle();
  assert.throws(()=>f.resolver.capture(),error=>error.code==='E_DEPENDENCY_LOCK_AMBIGUOUS');
});

test('unsupported grants are still rejected even when dependency bytes were previously approved',async t=>{
  const source=withRequire(firstUrl).replace('// ==/UserScript==','// @grant GM_xmlhttpRequest\n// ==/UserScript==');
  const f=fixture(source,{getLocks:()=>locked});t.after(()=>f.resolver.dispose());await settle();
  assert.throws(()=>f.resolver.capture(),error=>error.code==='E_GRANT_UNSUPPORTED');
});

test('late inspection and disposal cannot apply stale dependency locks to newer source',async t=>{
  const gate=deferred();
  const f=fixture(withRequire(firstUrl),{getLocks:()=>locked,
    waitForInspect:input=>input.sourceUtf8.includes(firstUrl)?gate.promise:undefined});
  t.after(()=>f.resolver.dispose());
  await settle();assert.equal(f.resolver.busy,true);
  assert.throws(()=>f.resolver.capture(),error=>error.code==='E_DEPENDENCY_PENDING');
  f.edit('document.title="new source"');
  assert.equal(f.resolver.busy,false);
  assert.deepEqual(f.resolver.capture(),
    {sourceUtf8:'document.title="new source"',entryFormat:'classic-userscript',lockId:null});
  const before=f.updates;gate.resolve();await settle();
  assert.equal(f.updates,before);
  assert.equal(f.resolver.capture().lockId,null);
  f.resolver.dispose();
});

test('same-line ESM and module import expressions are blocked at real Sidebar capture admission',async t=>{
  const template='const meta = '+String.fromCharCode(96)+'origin '+String.fromCharCode(36,123)+'import.meta.url'+String.fromCharCode(125,96)+';';
  const cases=[
    'const ref=import.meta.url; export {ref};',
    "import{value}from './value.js'",
    "import './setup.js'",
    'export const value = 42',
    'export function run() {}',
    "export {default} from './task.js'",
    template,
    "import('./unreviewed.js')",
    "const obj={import(value=import('./unreviewed.js')){return value;}};",
    "import('./unreviewed.js')\n{}",
    "{import(value)\n{}}",
    "if(ready){import(value)\n{}}",
    'const x={import(arg={...import("https://unapproved.example/module.mjs")}){return arg;}}; x.import();'
  ];
  for(const source of cases){
    const f=fixture(source);t.after(()=>f.resolver.dispose());
    assert.equal(hasUnbuiltESM(source),true,source);
    assert.throws(()=>f.resolver.capture(),error=>error?.code==='E_ESM_BUILD_REQUIRED',source);
    assert.deepEqual(f.requests,[],'raw ESM never enters dependency, permission or run admission');
  }
});

test('classic source ignores comments, regex, strings and template text',()=>{
  const raw='const text = '+String.fromCharCode(96)+'export const value=42'+String.fromCharCode(96)+';';
  const candidates=[
    'document.title = "ready";',
    "// export const value=42\nconst value='import{a}from ./a.js';",
    '/* import "./foo.js"; */ const value=42;',
    'const re=/import\\.meta|export const/;',
    'if (ready) /export {value}/.test(input);',
    'const obj={export:42,import:17}; obj.export++;',
    'const obj={import(value){return value;}}; obj.import(42);',
    'if(ready){} /export const/.test(input);',
    'const x={import(arg=/[)]/.test("x")){return arg;}}; x.import();',
    'const x={import(arg=false&&/[)]/.test("x")){return arg;}}; x.import();',
    'const x={import(arg=false||/[)]/.test("x")){return arg;}}; x.import();',
    'const x={import(arg=()=>/[)]/.test("x")){return arg;}}; x.import();',
    raw,
    '// ==UserScript==\n// @name Local\n// ==/UserScript==\nfunction main(){return document.title;}'
  ];
  for(const source of candidates){
    assert.equal(hasUnbuiltESM(source),false,source);
    assert.doesNotThrow(()=>assertPageSourceReadyToRun(source),source);
  }
});

test('a reopened resolver uses the explicit persisted selection among approved versions',async t=>{
  const second={lockId:'dep-lock-'+('b'.repeat(64))};
  const f=fixture(withRequire(firstUrl),{getLocks:()=>[...locked,second],selectedLockId:second.lockId});
  t.after(()=>f.resolver.dispose());await settle();
  assert.equal(f.resolver.capture().lockId,second.lockId);
});

test('reopened Page import pins its saved lock instead of a newer global approval',async t=>{
  let source='import value from "https://example.org/value.mjs"; export default async function main(){return value;}';
  const manifestDigest='d'.repeat(64),oldId='dep-lock-'+('a'.repeat(64)),newId='dep-lock-'+('b'.repeat(64));
  let rows=[oldId,newId],cacheAvailable=true;
  const resolver=createPageDependencyResolver({getSource:()=>source,client:{ready:Promise.resolve(),async request(method,input){
    if(method==='loadPageESMForCompilation'){
      if(!cacheAvailable)throw Object.assign(new Error('saved lock cache missing'),{code:'E_DEPENDENCY_LOCK_STALE'});
      return {sourceFormat:'esm-page',world:'USER_SCRIPT',manifestDigest,lockId:input.lockId,entries:[]};
    }
    return {sourceFormat:'esm-page',world:'USER_SCRIPT',manifestDigest,requires:[{url:'https://example.org/value.mjs'}],
      selectedLockId:newId,locks:rows.map(lockId=>({lockId,sourceFormat:'esm-page',world:'USER_SCRIPT'}))};
  }}});
  t.after(()=>resolver.dispose());await settle();
  assert.equal(resolver.capture({sourceFormat:'esm-page'}).lockId,newId);
  const authorSourceHash=await digestUtf8(source);
  await resolver.restore({sourceFormat:'esm-page',authorSourceHash,dependencyLockId:oldId,dependencyManifestDigest:manifestDigest});
  assert.equal(resolver.capture({sourceFormat:'esm-page'}).lockId,oldId);
  rows=[newId];await resolver.refresh({force:true});
  assert.equal(resolver.capture({sourceFormat:'esm-page'}).lockId,oldId,'lock older than the bounded list is checked directly');
  cacheAvailable=false;await resolver.refresh({force:true});
  assert.throws(()=>resolver.capture({sourceFormat:'esm-page'}),{code:'E_DEPENDENCY_INSPECT'});
  source+='\n// explicit edit';await resolver.refresh();
  assert.equal(resolver.capture({sourceFormat:'esm-page'}).lockId,newId);
});

test('reopened Page import refuses a changed manifest even with its lock still listed',async t=>{
  const source='export default async function main(){return 1;}';
  const resolver=createPageDependencyResolver({getSource:()=>source,client:{ready:Promise.resolve(),async request(){
    return {sourceFormat:'esm-page',world:'USER_SCRIPT',manifestDigest:'a'.repeat(64),requires:[],locks:[]};
  }}});
  t.after(()=>resolver.dispose());await settle();
  await assert.rejects(resolver.restore({sourceFormat:'esm-page',authorSourceHash:'c'.repeat(64),dependencyLockId:null,
    dependencyManifestDigest:'a'.repeat(64)}),{code:'E_SOURCE_HASH'});
  await resolver.restore({sourceFormat:'esm-page',authorSourceHash:await digestUtf8(source),dependencyLockId:null,dependencyManifestDigest:'b'.repeat(64)});
  assert.throws(()=>resolver.capture({sourceFormat:'esm-page'}),error=>error.code==='E_DEPENDENCY_INSPECT'&&/不符/.test(error.message));
});

test('program IDs partition inspected locks, preventing cross-program capture',async t=>{
  const source=withRequire(firstUrl),seen=[];
  let programId='alpha',lockId='dep-lock-'+('c'.repeat(64));
  const client={ready:Promise.resolve(),async request(method,payload){
    assert.equal(method,'inspectPageDependencies');
    seen.push(payload.programId);
    return {manifestDigest:'f'.repeat(64),requires:[{order:0,url:firstUrl,status:'needs-review',cacheChoices:[],sharedCacheChoices:[]}],
      locks:payload.programId==='alpha'?[{lockId}]:[]};
  }};
  const resolver=createPageDependencyResolver({client,getSource:()=>source,getProgramId:()=>programId});
  t.after(()=>resolver.dispose());await settle();
  assert.equal(resolver.capture().lockId,lockId);
  assert.equal(resolver.capture().programId,'alpha');
  programId='beta';resolver.refresh();await settle();
  assert.throws(()=>resolver.capture(),error=>error.code==='E_DEPENDENCY_UNLOCKED');
  assert.deepEqual(seen,['alpha','beta']);
  resolver.approved('dep-lock-'+('d'.repeat(64)));await settle();
  assert.throws(()=>resolver.capture(),error=>error.code==='E_DEPENDENCY_UNLOCKED');
});
