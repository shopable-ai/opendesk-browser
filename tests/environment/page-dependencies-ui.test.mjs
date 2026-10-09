import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createPageDependencyResolver,inferPageEntryFormat} from '../../src/ui/page-dependencies.js';

const tick=()=>new Promise(resolve=>setImmediate(resolve));
const settle=async()=>{await tick();await tick();};
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
const firstUrl='https://first.example.org/library.js';
const secondUrl='https://second.example.net/helper.js';
const withRequire=(url,body='async function main(){return document.title;}')=>
  '// ==UserScript==\n// @require '+url+'\n// ==/UserScript==\n'+body;
const locked=[{lockId:'dep-lock-'+('a'.repeat(64)),approvedAt:1720000000000}];
function fixture(sourceUtf8,{getLocks=()=>[],waitForInspect}={}) {
  let source=sourceUtf8,updates=0;
  const requests=[];
  const client={ready:Promise.resolve(),async request(method,input){
    requests.push({method,input:structuredClone(input)});
    assert.equal(method,'inspectPageDependencies');
    if(waitForInspect)await waitForInspect(input);
    return {locks:structuredClone(getLocks(input))};
  }};
  const resolver=createPageDependencyResolver({client,getSource:()=>source,onState:()=>updates++});
  return {resolver,requests,get updates(){return updates;},edit(value){source=value;resolver.refresh();}};
}

test('development UI keeps one editor without @require insertion, lock dropdown or legacy jQuery controls',async()=>{
  const html=await readFile('src/ui/tool.html','utf8');
  assert.match(html,/id="script-source"/);
  assert.match(html,/<summary>网页 JavaScript 试运行<\/summary>/);
  for(const id of ['page-dependency-panel','page-dependency-url','page-dependency-add','page-dependency-lock',
    'page-dependency-prepare','page-dependency-approve','page-dependency-review','page-preview-jquery','page-preview-entry'])
    assert.doesNotMatch(html,new RegExp('id="'+id+'"'),id+' is an obsolete UI control');
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
  assert.equal(inferPageEntryFormat('const main = async()=>42'),'async-main');
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
    /本地项目|打包/.test(error.message));
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
