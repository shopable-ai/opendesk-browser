import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,webcrypto} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createDependencyManager,DEPENDENCY_STORAGE_KEYS as keys,DEPENDENCY_LIMITS} from '../../src/scripting/user-scripts/dependency-manager.js';

globalThis.crypto ||= webcrypto;
const ns='tool:fixture';
const firstUrl='https://libraries.example.org/first.js',secondUrl='https://other.example.org/second.js';
const jqueryUrl='https://cdn.jsdelivr.net/npm/jquery@3.7.1/dist/jquery.min.js';
const first='globalThis.firstLibrary={sum:(a,b)=>a+b};',second='globalThis.secondLibrary={twice:x=>2*x};';
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
    if(url.startsWith('chrome-extension:'))return {ok:true,text:async()=>readFile('src/vendor/jquery-3.7.1.min.js','utf8')};
    const row=f.routes.get(url);if(!row)throw new TypeError('unknown fixture URL');
    const response=new Response(row.bytes,{status:row.status || 200,headers:{'content-type':row.type || 'text/javascript',...row.headers}});
    Object.defineProperty(response,'url',{value:row.url || url});Object.defineProperty(response,'redirected',{value:!!row.redirected});
    await f.afterFetch?.();return response;
  };
  const makeManager=namespace=>createDependencyManager({api,storage,fetchImpl,clock:{now:()=>1720000000000},
    assertHost:async()=>{f.authCount++;const result={...f.read('commandJournal','host:host-1'),namespace};
      if(!result.active)throw Object.assign(new Error('expired'),{code:'E_OWNER'});await f.afterAuth?.(f.authCount);return result;}});
  f.manager=makeManager(ns);f.managerForNamespace=makeManager;f.storage=storage;
  f.prepare=(src=source(),extra={})=>f.manager.prepare({sourceUtf8:src,explicitUserAction:true,...extra},{});
  f.approve=review=>f.manager.approve({reviewId:review.reviewId,explicitUserAction:true,acceptedHashes:review.entries.map(e=>e.sha256)},{});
  f.load=(lock,src=source(),extra={})=>f.manager.loadForExecution({sourceUtf8:src,lockId:lock?.lockId,...extra},{});
  return f;
}

test('inspection only parses and lists download permissions; explicit actions and post-download hash review are separate',async()=>{
  const f=fixture();f.granted=false;
  const inspected=await f.manager.inspect({sourceUtf8:source()},{});
  assert.deepEqual(inspected.permissionOrigins,['https://libraries.example.org/*']);
  assert.equal(inspected.requires[0].status,'needs-review');assert.equal(f.calls.length,0);assert.equal(f.rows().length,0);
  await assert.rejects(f.manager.prepare({sourceUtf8:source()},{}),failCode('E_DEPENDENCY_REVIEW'));
  await assert.rejects(f.prepare(),failCode('E_DEPENDENCY_PERMISSION'));assert.equal(f.calls.length,0);
  f.granted=true;const review=await f.prepare();
  assert.equal(review.status,'pending-review');assert.equal(review.entries[0].sha256,sha(first));
  await assert.rejects(f.load(),failCode('E_DEPENDENCY_UNLOCKED'));
  await assert.rejects(f.manager.approve({reviewId:review.reviewId,explicitUserAction:true,acceptedHashes:['0'.repeat(64)]},{}),failCode('E_DEPENDENCY_REVIEW'));
  assert.equal(f.rows().filter(r=>r.tag==='userscript-lock-v1').length,0);
  const lock=await f.approve(review);assert.equal(lock.approvalStatus,'approved');assert.equal((await f.load(lock)).entries[0].code,first);
  assert.deepEqual(await f.approve(review),lock,'repeat approval of the same exact review is idempotent');
});

test('packaged jQuery and a second ordinary library use ordered generic assets; source provenance is explicit',async()=>{
  const f=fixture(),src=source([jqueryUrl,secondUrl]);
  const review=await f.prepare(src),lock=await f.approve(review),loaded=await f.load(lock,src);
  assert.deepEqual(loaded.entries.map(e=>e.sourceKind),['packaged','https']);
  assert.equal(loaded.entries[0].acquisition,'extension-package');
  assert.equal(loaded.entries[0].resolvedUrl,'chrome-extension://fixture/vendor/jquery-3.7.1.min.js');
  assert.equal(loaded.entries[0].license.name,'MIT');assert.equal(loaded.entries[1].license.status,'unknown');
  assert.equal(loaded.entries[0].sha256,sha(await readFile('src/vendor/jquery-3.7.1.min.js')));
  assert.equal(loaded.entries[1].code,second);assert.equal(loaded.world,'USER_SCRIPT');
  assert.equal(f.calls.filter(c=>c.url===jqueryUrl).length,0,'a packaged alias is not reported as a CDN download');
  assert.equal(globalThis.secondLibrary,undefined,'the dependency manager never evaluates library code in its own global');
});

test('approved locks run offline after a new manager instance and draft edits; source/mode changes require a new lock',async()=>{
  const f=fixture(),lock=await f.approve(await f.prepare()),calls=f.calls.length;
  f.manager=f.managerForNamespace(ns);f.offline=true;f.granted=false;
  const src=source([firstUrl],'async function main(){return firstLibrary.sum(40,2);}');
  assert.equal((await f.load(lock,src)).entries[0].code,first);assert.equal(f.calls.length,calls);
  await assert.rejects(f.load(lock,source([secondUrl])),failCode('E_DEPENDENCY_LOCK_STALE'));
  await assert.rejects(f.load(lock,src,{entryFormat:'classic-userscript'}),failCode('E_DEPENDENCY_LOCK_STALE'));
  const noDependencies=await f.manager.loadForExecution({sourceUtf8:'async function main(){return 1;}'},{});
  assert.deepEqual(noDependencies.entries,[]);assert.equal(f.calls.length,calls);
});

test('duplicate declarations preserve execution order, shared bytes do not share another namespace approval',async()=>{
  const f=fixture();f.routes.set(secondUrl,{bytes:first});
  const src=source([firstUrl,secondUrl,firstUrl]),review=await f.prepare(src),lock=await f.approve(review);
  assert.deepEqual(review.entries.map(e=>e.order),[0,1,2]);assert.equal(f.calls.length,2);
  assert.equal(f.rows().filter(r=>r.tag==='userscript-asset-v1').length,1);
  assert.deepEqual((await f.load(lock,src)).entries.map(e=>e.code),[first,first,first]);
  const other=f.managerForNamespace('tool:other');
  await assert.rejects(other.loadForExecution({sourceUtf8:src,lockId:lock.lockId},{}),failCode('E_DEPENDENCY_LOCK'));
  await assert.rejects(other.prepare({sourceUtf8:source(),explicitUserAction:true,selections:[{order:0,assetSha256:sha(first)}]},{}),failCode('E_DEPENDENCY_REVIEW'));
  assert.equal((await other.inspect({sourceUtf8:source()},{})).requires[0].cacheChoices.length,0);
});

test('a local file adapter preserves declared URL and original file bytes without claiming a network download',async()=>{
  const f=fixture();f.offline=true;f.granted=false;
  const raw=Buffer.from('\ufeff'+first),review=await f.prepare(source(),{selections:[{order:0,localFile:{name:'first.js',bytesBase64:raw.toString('base64'),license:'MIT'}}]});
  const lock=await f.approve(review),loaded=await f.load(lock);
  assert.equal(loaded.entries[0].sourceKind,'local-file');assert.equal(loaded.entries[0].url,firstUrl);
  assert.equal(loaded.entries[0].resolvedUrl,'local:first.js');assert.equal(loaded.entries[0].sha256,sha(raw));
  assert.equal(loaded.entries[0].code.charCodeAt(0),0xfeff,'UTF-8 BOM survives decoding for faithful byte identity');
  assert.equal(loaded.entries[0].license.status,'declared');assert.equal(f.calls.length,0);
  const reused=await f.prepare(source(),{selections:[{order:0,assetSha256:sha(raw)}]});
  assert.equal(reused.entries[0].acquisition,'approved-cache');assert.equal(reused.entries[0].sourceKind,'local-file');
  assert.equal(f.calls.length,0);
});

test('same URL updates produce new immutable locks; selecting approved old bytes stays offline and deterministic',async()=>{
  const f=fixture(),old=await f.approve(await f.prepare());
  f.routes.set(firstUrl,{bytes:first+'\n// version two'});
  const current=await f.approve(await f.prepare());assert.notEqual(old.lockId,current.lockId);
  assert.equal((await f.load(old)).entries[0].code,first);
  assert.equal((await f.load(current)).entries[0].code,first+'\n// version two');
  f.offline=true;const calls=f.calls.length;
  const selected=await f.prepare(source(),{selections:[{order:0,assetSha256:sha(first)}]});
  assert.equal(selected.entries[0].sha256,sha(first));assert.equal(f.calls.length,calls);
  const inspection=await f.manager.inspect({sourceUtf8:source()},{});
  assert.equal(inspection.requires[0].cacheChoices.length,2);assert.equal(inspection.locks[0].lockId,current.lockId);
});

test('SRI validates original bytes with SHA-256/384/512 and does not silently approve a mismatch',async()=>{
  for(const algorithm of ['sha256','sha384','sha512']){
    const f=fixture(),base64=createHash(algorithm).update(first).digest('base64');
    const src=source([firstUrl+'#'+algorithm+'='+base64]),review=await f.prepare(src);
    assert.deepEqual(review.entries[0].integrityResult.verified,[algorithm]);
    assert.equal((await f.load(await f.approve(review),src)).entries[0].code,first);
  }
  const f=fixture();await assert.rejects(f.prepare(source([firstUrl+'#sha256='+'a'.repeat(64)])),failCode('E_DEPENDENCY_INTEGRITY'));
  assert.equal(f.rows().length,0);
  const mixed=await f.prepare(source([firstUrl+'#md5='+sha(first,'md5')+',sha256='+sha(first)]));
  assert.deepEqual(mixed.entries[0].integrityResult.ignoredWeak,['md5']);
  await assert.rejects(f.prepare(source([firstUrl+'#md5='+sha(first,'md5')])),failCode('E_DEPENDENCY_INTEGRITY_UNSUPPORTED'));
});

test('downloader rejects redirects, HTML/JSON, malformed UTF-8, private IPs and excess streaming bytes',async()=>{
  for(const [row,code] of [
    [{bytes:first,url:secondUrl,redirected:true},'E_DEPENDENCY_REDIRECT'],
    [{bytes:'<html>error</html>',type:'text/html'},'E_DEPENDENCY_CONTENT_TYPE'],
    [{bytes:'<!doctype html>error',type:'text/plain'},'E_DEPENDENCY_CONTENT_TYPE'],
    [{bytes:'{"error":"bad"}',type:'application/json'},'E_DEPENDENCY_CONTENT_TYPE'],
    [{bytes:new Uint8Array([0xc3,0x28])},'E_DEPENDENCY_ENCODING'],
    [{bytes:first,type:'text/javascript;charset=utf-16'},'E_DEPENDENCY_ENCODING'],
    [{bytes:new Uint8Array(DEPENDENCY_LIMITS.assetBytes+1)},'E_DEPENDENCY_LIMIT']
  ]){
    const f=fixture();f.routes.set(firstUrl,row);await assert.rejects(f.prepare(),failCode(code));assert.equal(f.rows().length,0);
  }
  for(const url of ['https://127.0.0.1/lib.js','https://[::1]/lib.js','https://192.168.1.1/lib.js','https://machine.local/lib.js']){
    const f=fixture();await assert.rejects(f.prepare(source([url])),failCode('E_DEPENDENCY_URL'));assert.equal(f.calls.length,0);
  }
  const f=fixture();f.routes.set(firstUrl,{bytes:first,type:'text/plain;charset=utf-8'});await f.prepare();
  assert.equal(f.calls[0].options.redirect,'error');assert.equal(f.calls[0].options.credentials,'omit');
  assert.equal(f.calls[0].options.referrerPolicy,'no-referrer');assert.equal(f.calls[0].options.cache,'no-store');
  assert.ok(f.calls[0].options.signal instanceof AbortSignal);
});

test('permission revocation and stale host during network/hash work never commit an approvable review or lock',async()=>{
  const permission=fixture();permission.afterFetch=()=>{permission.granted=false;};
  await assert.rejects(permission.prepare(),failCode('E_DEPENDENCY_PERMISSION'));assert.equal(permission.rows().length,0);
  const download=fixture();download.afterFetch=()=>download.revoke();
  await assert.rejects(download.prepare(),failCode('E_OWNER'));assert.equal(download.rows().length,0);
  const approval=fixture(),review=await approval.prepare();
  approval.afterAuth=count=>{if(count===4)approval.revoke();};
  await assert.rejects(approval.approve(review),failCode('E_OWNER'));
  assert.equal(approval.rows().filter(r=>r.tag==='userscript-lock-v1').length,0);
  const commit=fixture();commit.beforeTransaction=mode=>{if(mode==='readwrite')commit.revoke();};
  await assert.rejects(commit.prepare(),failCode('E_OWNER'));assert.equal(commit.rows().length,0);
});

test('asset, review provenance and lock tampering fail closed; quota failure atomically rolls back prepared assets',async()=>{
  const f=fixture(),review=await f.prepare(),lock=await f.approve(review);
  f.change('frameworkKV',keys.asset(sha(first)),row=>{new Uint8Array(row.bytes)[0]^=1;return row;});
  await assert.rejects(f.load(lock),failCode('E_DEPENDENCY_HASH'));
  const r=fixture(),pending=await r.prepare();
  r.change('frameworkKV',keys.review(ns,pending.reviewId),row=>({...row,entries:row.entries.map(e=>({...e,resolvedUrl:secondUrl}))}));
  await assert.rejects(r.approve(pending),failCode('E_DEPENDENCY_REVIEW'));
  const l=fixture(),original=await l.approve(await l.prepare());
  l.change('frameworkKV',keys.lock(ns,original.lockId),row=>({...row,entries:row.entries.map(e=>({...e,world:'MAIN'}))}));
  await assert.rejects(l.load(original),failCode('E_DEPENDENCY_LOCK'));
  const pointer=fixture(),oldReview=await pointer.prepare();await pointer.approve(oldReview);
  pointer.routes.set(firstUrl,{bytes:first+'\n// substituted but independently approved content'});
  const different=await pointer.approve(await pointer.prepare());
  pointer.change('frameworkKV',keys.review(ns,oldReview.reviewId),row=>({...row,lockId:different.lockId}));
  await assert.rejects(pointer.approve(oldReview),failCode('E_DEPENDENCY_REVIEW'),
    'an idempotent retry must not follow a corrupted pointer to a different valid lock');
  const q=fixture();q.throwOnPut=row=>row.tag==='userscript-review-v1';
  await assert.rejects(q.prepare(),failCode('E_QUOTA'));assert.equal(q.rows().length,0);
});
