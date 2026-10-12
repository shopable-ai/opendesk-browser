import {loadFakeBuiltin} from './builtin-support.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,webcrypto} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createDependencyManager,DEPENDENCY_STORAGE_KEYS as keys,DEPENDENCY_LIMITS} from '../../src/scripting/user-scripts/dependency-manager.js';

globalThis.crypto ||= webcrypto;
const ns='tool:fixture';
const firstUrl='https://libraries.example.org/first.js',secondUrl='https://other.example.org/second.js';
const jqueryUrl='https://cdn.jsdelivr.net/npm/jquery@3.7.1/dist/jquery.min.js';
const first='import twice from \"https://other.example.org/second.js\"; export default x=>twice(x)+1;',second='export default x=>2*x;';
const sha=(bytes,algorithm='sha256')=>createHash(algorithm).update(bytes).digest('hex');
const source=(urls=[firstUrl],body='async function main(){return firstLibrary.sum(1,2);}')=>
  '// ==UserScript==\n// @name Dependency fixture\n'+urls.map(url=>'// @require '+url).join('\n')+'\n// ==/UserScript==\n'+body;
const failCode=code=>error=>error.code===code;

// Transactional storage and Fetch component doubles, not native Chrome receipts.
function fixture() {
  const host={tag:'host',active:true,registrationId:'host-1',hostDocumentId:'document-1',hostInstanceId:'instance-1',
    browserSessionIncarnation:'session-1',hostUrl:'chrome-extension://fixture/ui/tool.html'};
  let database=new Map([['frameworkKV',new Map()],['commandJournal',new Map([['host:host-1',structuredClone(host)]])]]),queue=Promise.resolve();
  const f={calls:[],routes:new Map([[firstUrl,{bytes:first}],[secondUrl,{bytes:second}]]),granted:true,authCount:0,
    beforeTransaction:null,afterAuth:null,afterFetch:null,throwOnPut:null,offline:false};
  f.read=(store,key)=>structuredClone(database.get(store).get(key));
  f.rows=()=>[...database.get('frameworkKV').values()].map(v=>structuredClone(v));
  f.change=(store,key,fn)=>database.get(store).set(key,fn(f.read(store,key)));
  f.revoke=()=>f.change('commandJournal','host:host-1',row=>({...row,active:false}));
  const storage={transaction(stores,mode,work){
    const run=queue.then(async()=>{
      f.beforeTransaction?.(mode);
      const draft=structuredClone(database),table=store=>{assert.ok(stores.includes(store));return draft.get(store);};
      const tx={get:async(store,key)=>structuredClone(table(store).get(key)),
        all:async store=>[...table(store).values()].map(v=>structuredClone(v)),
        put:async(store,value,key)=>{assert.equal(mode,'readwrite');if(f.throwOnPut?.(value))throw Object.assign(new Error('quota'),{code:'E_QUOTA'});table(store).set(key,structuredClone(value));},
        delete:async(store,key)=>{assert.equal(mode,'readwrite');table(store).delete(key);}};
      const result=await work(tx);if(mode==='readwrite')database=draft;return result;
    });
    queue=run.catch(()=>{});return run;
  }};
  const api={runtime:{id:'fixture',getURL:path=>'chrome-extension://fixture/'+path},permissions:{contains:async()=>f.granted}};
  const fetchImpl=async(url,options)=>{
    f.calls.push({url,options});if(f.offline)throw new TypeError('offline');
    if(url.startsWith('chrome-extension:'))return {ok:true,text:async()=>readFile('src/libs/vendor/jquery/3.7.1/jquery.min.js','utf8')};
    const row=f.routes.get(url);if(!row)throw new TypeError('unknown fixture URL');
    const response=new Response(row.bytes,{status:row.status || 200,headers:{'content-type':row.type || 'text/javascript',...row.headers}});
    Object.defineProperty(response,'url',{value:row.url || url});Object.defineProperty(response,'redirected',{value:!!row.redirected});
    await f.afterFetch?.();return response;
  };
  const makeManager=namespace=>createDependencyManager({loadBuiltin:loadFakeBuiltin,api,storage,fetchImpl,clock:{now:()=>1720000000000},
    assertHost:async()=>{f.authCount++;const result={...f.read('commandJournal','host:host-1'),namespace};
      if(!result.active)throw Object.assign(new Error('expired'),{code:'E_OWNER'});await f.afterAuth?.(f.authCount);return result;}});
  f.manager=makeManager(ns);f.managerForNamespace=makeManager;f.storage=storage;
  f.prepare=(src=source(),extra={})=>f.manager.prepare({sourceUtf8:src,explicitUserAction:true,...extra},{});
  f.approve=review=>f.manager.approve({reviewId:review.reviewId,explicitUserAction:true,acceptedHashes:review.entries.map(e=>e.sha256)},{});
  f.load=(lock,src=source(),extra={})=>f.manager.loadForExecution({sourceUtf8:src,lockId:lock?.lockId,...extra},{});
  return f;
}

import {COMPONENT_DEPENDENCY_STORAGE_KEYS as componentKeys} from '../../src/scripting/user-scripts/page-component-dependencies.js';

const input={componentSource:`import fn from '${firstUrl}';export default function App(){return fn(20)}`,
  framework:'react',roots:[firstUrl]};
const pin=({url,sha256,bytes})=>({url,sha256,bytes});
const graph=[{url:firstUrl,children:[secondUrl]},{url:secondUrl,children:[]}];
const approve=(f,review,overrides={})=>f.manager.approveComponentDependencies({...input,
  reviewId:review.reviewId,reviewDigest:review.reviewDigest,acceptedModules:review.entries.map(pin),graph,
  explicitUserAction:true,...overrides},{});
async function acquired(f){
  const first=await f.manager.prepareComponentDependencies({...input,approvedUrls:[firstUrl],explicitUserAction:true},{});
  const review=await f.manager.prepareComponentDependencies({...input,reviewId:first.reviewId,
    reviewDigest:first.reviewDigest,approvedUrls:[secondUrl],explicitUserAction:true},{});
  return review;
}
const load=(f,lock,overrides={})=>f.manager.loadComponentDependencies({...input,lockId:lock.lockId,...overrides},{});

test('browser ESM inspection and Run reads never acquire code; explicit source confirmation is separate from hash approval',async()=>{
  const f=fixture();
  const report=await f.manager.inspectComponentDependencies(input,{});
  assert.equal(report.sourceHash,sha(input.componentSource));assert.deepEqual(report.locks,[]);
  await assert.rejects(f.manager.prepareComponentDependencies({...input,approvedUrls:[firstUrl]},{}),{code:'E_REMOTE_REVIEW'});
  await assert.rejects(load(f,{lockId:'not-approved'}),{code:'E_REMOTE_LOCK'});
  await assert.rejects(f.manager.prepareComponentDependencies({...input,approvedUrls:[secondUrl],explicitUserAction:true},{}),{code:'E_REMOTE_REVIEW'});
  assert.equal(f.calls.length,0);assert.equal(f.rows().length,0);
  const review=await acquired(f);
  assert.deepEqual(f.calls.map(row=>row.url),[firstUrl,secondUrl]);
  assert.equal(review.sourceHash,sha(input.componentSource));
  assert.deepEqual(review.modules.map(row=>row.code),[first,second]);
  assert.equal(f.rows().filter(row=>row.tag==='component-esm-lock-v1').length,0);
  await assert.rejects(approve(f,review,{explicitUserAction:false}),{code:'E_REMOTE_REVIEW'});
  await assert.rejects(approve(f,review,{acceptedModules:review.entries.map(row=>({...pin(row),sha256:'0'.repeat(64)}))}),{code:'E_REMOTE_REVIEW'});
  const lock=await approve(f,review);
  assert.equal(lock.remoteLock.format,'opendesk.remote-lock.v1');
  assert.equal(lock.remoteLock.modules[firstUrl].sha256,sha(first));
  assert.deepEqual(await approve(f,review),lock,'an exact reviewed version is idempotent');
  assert.equal(f.rows().filter(row=>row.tag==='userscript-lock-v1').length,0,'ESM approval is not a classic @require grant');
});

test('approved ESM graphs survive a new manager offline; changed roots, owner and missing or tampered bytes fail without fallback',async()=>{
  const f=fixture(),lock=await approve(f,await acquired(f)),calls=f.calls.length;
  f.manager=f.managerForNamespace(ns);f.offline=true;f.granted=false;
  const changed={componentSource:input.componentSource+'\n// new data'};
  assert.deepEqual((await load(f,lock,changed)).modules.map(row=>row.code),[first,second]);
  await assert.rejects(load(f,lock,{roots:[secondUrl]}),{code:'E_REMOTE_LOCK_STALE'});
  await assert.rejects(load(f,lock,{framework:'vue'}),{code:'E_REMOTE_LOCK_STALE'});
  await assert.rejects(f.managerForNamespace('tool:other').loadComponentDependencies({...input,lockId:lock.lockId},{}),{code:'E_REMOTE_LOCK'});
  f.change('frameworkKV',keys.asset(sha(first)),row=>({...row,bytes:new TextEncoder().encode(first.replace('+1','+2'))}));
  await assert.rejects(load(f,lock),error=>['E_DEPENDENCY_HASH','E_DEPENDENCY_ASSET'].includes(error.code));
  assert.equal(f.calls.length,calls,'cache failure must not invoke the HTTPS adapter');
  const missing=fixture(),missingLock=await approve(missing,await acquired(missing)),missingCalls=missing.calls.length;
  missing.change('frameworkKV',keys.asset(sha(first)),()=>undefined);
  await assert.rejects(load(missing,missingLock),error=>['E_DEPENDENCY_HASH','E_DEPENDENCY_ASSET'].includes(error.code));
  assert.equal(missing.calls.length,missingCalls);
});

test('remote reviews bind source identity and require a complete reachable graph before an atomic lock is created',async()=>{
  const f=fixture(),review=await acquired(f);
  await assert.rejects(approve(f,review,{componentSource:input.componentSource+'\n// late edit'}),{code:'E_REMOTE_REVIEW'});
  await assert.rejects(approve(f,review,{graph:[{url:firstUrl,children:[secondUrl]}]}),{code:'E_REMOTE_GRAPH'});
  await assert.rejects(approve(f,review,{graph:[{url:firstUrl,children:[]},{url:secondUrl,children:[]}]}),{code:'E_REMOTE_GRAPH'});
  await assert.rejects(approve(f,review,{graph:[{url:firstUrl,children:['https://third.example.org/missing.js']},{url:secondUrl,children:[]}]}),{code:'E_REMOTE_GRAPH'});
  assert.equal(f.rows().filter(row=>row.tag==='component-esm-lock-v1').length,0);
  f.throwOnPut=row=>row.tag==='component-esm-lock-v1';
  await assert.rejects(approve(f,review),{code:'E_QUOTA'});
  assert.equal(f.rows().filter(row=>row.tag==='component-esm-lock-v1').length,0);
  assert.equal(f.read('frameworkKV',componentKeys.review(ns,review.reviewId)).status,'pending');
});

test('ESM acquisition inherits HTTPS permission, redirect, MIME, size and owner revalidation gates',async()=>{
  for(const [change,code] of [
    [f=>{f.granted=false;},'E_DEPENDENCY_PERMISSION'],
    [f=>{f.routes.set(firstUrl,{bytes:first,redirected:true});},'E_DEPENDENCY_REDIRECT'],
    [f=>{f.routes.set(firstUrl,{bytes:first,type:'text/html'});},'E_DEPENDENCY_CONTENT_TYPE'],
    [f=>{f.routes.set(firstUrl,{bytes:'a'.repeat(128*1024+1)});},'E_REMOTE_LIMIT'],
    [f=>{f.afterFetch=()=>f.revoke();},'E_OWNER']
  ]){
    const f=fixture();change(f);
    await assert.rejects(f.manager.prepareComponentDependencies({...input,approvedUrls:[firstUrl],explicitUserAction:true},{}),{code});
    assert.equal(f.rows().filter(row=>row.tag==='component-esm-lock-v1').length,0);
  }
});

test('reading a fixed lock validates semantic fields independently of object key insertion order',async()=>{
  const f=fixture(),lock=await approve(f,await acquired(f));
  const reverse=value=>Array.isArray(value)?value.map(reverse):value&&typeof value==='object'&&!(value instanceof Uint8Array)?
    Object.fromEntries(Object.entries(value).reverse().map(([k,v])=>[k,reverse(v)])):value;
  f.change('frameworkKV',componentKeys.lock(ns,lock.lockId),reverse);
  assert.equal((await load(f,lock)).modules.length,2);
});

test('R4 Controller programs share verified bytes but never another program source/world approval',async()=>{
  const f=fixture();
  const a={componentSource:`import twice from '${firstUrl}';export default async function main(){return twice(2)}`,
    framework:'controller',programId:'csv.first',roots:[firstUrl]};
  const b={...a,programId:'csv.second'};
  const selected=rows=>rows.entries.map(pin);
  const acquire=async spec=>{
    const first=await f.manager.prepareComponentDependencies({...spec,approvedUrls:[firstUrl],explicitUserAction:true},{});
    return f.manager.prepareComponentDependencies({...spec,reviewId:first.reviewId,reviewDigest:first.reviewDigest,
      approvedUrls:[secondUrl],explicitUserAction:true},{});
  };
  const approveFor=async(spec,review)=>f.manager.approveComponentDependencies({...spec,reviewId:review.reviewId,
    reviewDigest:review.reviewDigest,acceptedModules:selected(review),graph,explicitUserAction:true},{});
  const firstApproval=await approveFor(a,await acquire(a));
  assert.deepEqual(f.calls.map(row=>row.url),[firstUrl,secondUrl]);
  const inspectSecond=await f.manager.inspectComponentDependencies(b,{});
  assert.deepEqual(inspectSecond.locks,[]);
  assert.deepEqual(inspectSecond.cachedUrls,[firstUrl]);
  await assert.rejects(f.manager.loadComponentDependencies({...b,lockId:firstApproval.lockId},{}),
    {code:'E_REMOTE_LOCK_STALE'});
  f.offline=true;f.granted=false;
  const secondApproval=await approveFor(b,await acquire(b));
  assert.notEqual(firstApproval.lockId,secondApproval.lockId);
  assert.equal(f.calls.length,2,'the second Controller script must reuse both pinned assets without any download');
  const loaded=await f.manager.loadComponentDependencies({...b,lockId:secondApproval.lockId},{});
  assert.deepEqual(loaded.modules.map(x=>x.code),[first,second]);
  assert.deepEqual((await f.manager.inspectComponentDependencies({...b,componentSource:b.componentSource+' // revision changed'},{})).locks,[]);
  await assert.rejects(f.manager.loadComponentDependencies({...b,componentSource:b.componentSource+' // revision changed',
    lockId:secondApproval.lockId},{}),{code:'E_REMOTE_LOCK_STALE'});
  await assert.rejects(f.managerForNamespace('tool:other').loadComponentDependencies({...b,lockId:secondApproval.lockId},{}),
    {code:'E_REMOTE_LOCK'});
});
