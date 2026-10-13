import {loadFakeBuiltin} from './builtin-support.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,webcrypto} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createDependencyManager,DEPENDENCY_STORAGE_KEYS as keys,DEPENDENCY_LIMITS} from '../../src/scripting/user-scripts/dependency-manager.js';
import {createControllerClassicSavedSource,verifiedControllerClassicAuthorSource} from '../../src/ui/controller-esm-source.js';

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
  assert.equal(loaded.entries[0].resolvedUrl,'chrome-extension://fixture/libs/vendor/jquery/3.7.1/jquery.min.js');
  assert.equal(loaded.entries[0].license.name,'MIT');assert.equal(loaded.entries[1].license.status,'unknown');
  assert.equal(loaded.entries[0].sha256,sha(await readFile('src/libs/vendor/jquery/3.7.1/jquery.min.js')));
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


// R7: shared SHA bytes are not shared runtime permissions or owner locks.
test('approved HTTPS bytes can be explicitly reused across programs without network or inherited approval',async()=>{
  const f=fixture(),src=source(),review=await f.prepare(src),firstLock=await f.approve(review);
  const other=f.managerForNamespace('tool:other');
  const inspected=await other.inspect({sourceUtf8:src},{});
  assert.equal(inspected.requires[0].status,'needs-review');
  assert.deepEqual(inspected.requires[0].cacheChoices,[]);
  assert.equal(inspected.requires[0].sharedCacheChoices.length,1);
  assert.equal(inspected.requires[0].sharedCacheChoices[0].sha256,sha(first));
  assert.equal(inspected.requires[0].sharedCacheChoices[0].sourceKind,'https');
  await assert.rejects(other.loadForExecution({sourceUtf8:src,lockId:firstLock.lockId},{}),failCode('E_DEPENDENCY_LOCK'));
  f.offline=true;f.granted=false;
  await assert.rejects(other.prepare({sourceUtf8:src,explicitUserAction:true,
    selections:[{order:0,assetSha256:sha(first)}]},{}),failCode('E_DEPENDENCY_REVIEW'));
  const pending=await other.prepare({sourceUtf8:src,explicitUserAction:true,
    selections:[{order:0,sharedAssetSha256:sha(first)}]},{});
  assert.equal(pending.entries[0].acquisition,'shared-content-cache');
  assert.equal(pending.entries[0].sourceKind,'https');
  assert.equal(f.calls.length,1,'second program must not fetch on explicit shared-content reuse');
  await assert.rejects(other.loadForExecution({sourceUtf8:src},{}),failCode('E_DEPENDENCY_UNLOCKED'));
  const secondLock=await other.approve({reviewId:pending.reviewId,explicitUserAction:true,
    acceptedHashes:[sha(first)]},{});
  assert.notEqual(secondLock.lockId,firstLock.lockId,'different owner always receives its own approval lock');
  assert.equal((await other.loadForExecution({sourceUtf8:src,lockId:secondLock.lockId},{})).entries[0].code,first);
  assert.equal(f.rows().filter(row=>row.tag==='userscript-asset-v1').length,1);
  assert.equal(f.calls.length,1);
});

test('unapproved/local bytes never enter shared HTTPS provenance; corrupted index and bytes block reuse',async()=>{
  const pending=fixture();await pending.prepare();
  const otherPending=pending.managerForNamespace('tool:other');
  assert.deepEqual((await otherPending.inspect({sourceUtf8:source()},{})).requires[0].sharedCacheChoices,[]);
  const local=fixture();local.offline=true;local.granted=false;
  await local.approve(await local.prepare(source(),{selections:[{order:0,
    localFile:{name:'local.js',bytesBase64:Buffer.from(first).toString('base64')}}]}));
  const other=local.managerForNamespace('tool:other');
  assert.deepEqual((await other.inspect({sourceUtf8:source()},{})).requires[0].sharedCacheChoices,[]);
  await assert.rejects(other.prepare({sourceUtf8:source(),explicitUserAction:true,
    selections:[{order:0,sharedAssetSha256:sha(first)}]},{}),failCode('E_DEPENDENCY_REVIEW'));
  const tamper=fixture();await tamper.approve(await tamper.prepare());
  tamper.change('frameworkKV',keys.sharedSource(firstUrl),row=>({...row,
    choices:row.choices.map(choice=>({...choice,resolvedUrl:secondUrl}))}));
  await assert.rejects(tamper.managerForNamespace('tool:other').inspect({sourceUtf8:source()},{}),
    failCode('E_DEPENDENCY_SHARED_SOURCE'));
  const broken=fixture();await broken.approve(await broken.prepare());
  broken.change('frameworkKV',keys.asset(sha(first)),row=>{new Uint8Array(row.bytes)[0]^=1;return row;});
  await assert.rejects(broken.managerForNamespace('tool:other').inspect({sourceUtf8:source()},{}),
    failCode('E_DEPENDENCY_HASH'));
});

test('multiple reviewed versions remain separately selectable without upgrading old revisions',async()=>{
  const f=fixture(),old=await f.approve(await f.prepare());
  f.routes.set(firstUrl,{bytes:first+'\n// immutable second version'});
  const latest=await f.approve(await f.prepare());
  const other=f.managerForNamespace('tool:other'),inspected=await other.inspect({sourceUtf8:source()},{});
  assert.deepEqual(inspected.requires[0].sharedCacheChoices.map(x=>x.sha256),
    [sha(first+'\n// immutable second version'),sha(first)]);
  assert.notEqual(old.lockId,latest.lockId);
  assert.equal((await f.load(old)).entries[0].code,first);
  assert.equal((await f.load(latest)).entries[0].code,first+'\n// immutable second version');
});


test('R7.1 two Sidebar program IDs have independent grants but reuse approved SHA bytes offline',async()=>{
  const f=fixture(),src=source();
  const aReview=await f.manager.prepare({sourceUtf8:src,programId:'alpha',explicitUserAction:true},{});
  const aLock=await f.manager.approve({reviewId:aReview.reviewId,programId:'alpha',
    explicitUserAction:true,acceptedHashes:aReview.entries.map(row=>row.sha256)},{});
  const bInspect=await f.manager.inspect({sourceUtf8:src,programId:'beta'},{});
  assert.equal(bInspect.locks.length,0);
  assert.equal(bInspect.requires[0].sharedCacheChoices[0].sha256,sha(first));
  await assert.rejects(f.manager.loadForExecution({sourceUtf8:src,programId:'beta',lockId:aLock.lockId},{}),
    failCode('E_DEPENDENCY_LOCK'));
  f.granted=false;f.offline=true;const downloads=f.calls.length;
  const bReview=await f.manager.prepare({sourceUtf8:src,programId:'beta',explicitUserAction:true,
    selections:[{order:0,sharedAssetSha256:sha(first)}]},{});
  await assert.rejects(f.manager.loadForExecution({sourceUtf8:src,programId:'beta'},{}),
    failCode('E_DEPENDENCY_UNLOCKED'));
  const bLock=await f.manager.approve({reviewId:bReview.reviewId,programId:'beta',
    explicitUserAction:true,acceptedHashes:bReview.entries.map(row=>row.sha256)},{});
  assert.notEqual(bLock.lockId,aLock.lockId);
  assert.equal((await f.manager.loadForExecution({sourceUtf8:src,programId:'beta',lockId:bLock.lockId},{}))
    .entries[0].code,first);
  assert.equal((await f.manager.loadForExecution({sourceUtf8:src,programId:'alpha',lockId:aLock.lockId},{}))
    .entries[0].code,first);
  assert.equal(f.calls.length,downloads,'no second HTTPS fetch for approved bytes');
  assert.equal(f.rows().filter(r=>r.tag==='userscript-asset-v1').length,1);
  await assert.rejects(f.manager.loadForExecution({sourceUtf8:src,programId:'alpha',lockId:bLock.lockId},{}),
    failCode('E_DEPENDENCY_LOCK'));
  f.change('frameworkKV',keys.asset(sha(first)),asset=>{
    new Uint8Array(asset.bytes)[0]^=1;return asset;
  });
  await assert.rejects(f.manager.loadForExecution({sourceUtf8:src,programId:'alpha',lockId:aLock.lockId},{}),
    failCode('E_DEPENDENCY_HASH'));
});


test('R7.1 frozen Page candidate preserves program-scoped lock through storage and installed reader',async()=>{
  const f=fixture(),src=source(),review=await f.manager.prepare({sourceUtf8:src,programId:'alpha',
    explicitUserAction:true},{}),lock=await f.manager.approve({reviewId:review.reviewId,
    programId:'alpha',explicitUserAction:true,acceptedHashes:review.entries.map(row=>row.sha256)},{});
  const candidate=await f.manager.importPageCandidate({programId:'alpha',revision:1,
    sourceUtf8:src,entryFormat:'async-main',lockId:lock.lockId,dependencyScope:'program',
    pageRules:{matches:['https://example.org/*'],excludeMatches:[],runAt:'document_idle',
      allFrames:false,world:'USER_SCRIPT'}},{});
  assert.equal(candidate.stage,'Candidate');
  const saved=await f.manager.getPageCandidate({programId:'alpha',revision:1},{});
  assert.equal(saved.manifest.dependencyScope,'program');
  const frozen=await f.manager.readStoredPageCandidate(ns,'alpha',1);
  assert.equal(frozen.resolution.lockId,lock.lockId);
  assert.equal(frozen.resolution.entries[0].code,first);
  await assert.rejects(f.manager.importPageCandidate({programId:'beta',revision:1,
    sourceUtf8:src,entryFormat:'async-main',lockId:lock.lockId,dependencyScope:'program',
    pageRules:{matches:['https://example.org/*'],excludeMatches:[],runAt:'document_idle',
      allFrames:false,world:'USER_SCRIPT'}},{}),failCode('E_DEPENDENCY_LOCK'));
});


test('R7.3 Controller Classic: program-scoped SHA locks reuse Page assets offline with no second fetch',async()=>{
  const f=fixture(),url='https://libraries.example.org/vendor@1.2.3/classic.js';
  const library='globalThis.fixtureClassic={mix:(a,b)=>a*10+b};';
  f.routes.set(url,{bytes:library});
  const source='// @require '+url+'\nasync function main(){return fixtureClassic.mix(2,1)}';
  const prepare=(programId,allowDownload=true)=>f.manager.prepareControllerClassic({
    programId,sourceUtf8:source,explicitUserAction:true,allowDownload},{});
  assert.equal(globalThis.fixtureClassic,undefined,'existing manager never evaluates user assets');
  await assert.rejects(prepare('a',false),failCode('E_CONTROLLER_CLASSIC_RUN_REQUIRED'));
  const first=await prepare('a');
  assert.match(first.lockId,/^controller-classic-[a-f0-9]{64}$/);
  assert.equal(first.world,'CONTROLLER');
  assert.equal(first.downloadCount,1);
  assert.equal(first.entries[0].sha256,sha(library));
  assert.ok(first.sourceUtf8.indexOf(library)<first.sourceUtf8.indexOf('async function main'));
  assert.equal(f.calls.length,1);
  f.offline=true;f.granted=false;
  const second=await prepare('b');
  assert.notEqual(second.lockId,first.lockId,'other Controller program never receives first program lock');
  assert.equal(second.entries[0].sha256,first.entries[0].sha256);
  assert.equal(second.downloadCount,0,'identical source SHA bytes survive offline on other programs');
  assert.equal(f.calls.length,1);
  const repeat=await prepare('a',false);
  assert.equal(repeat.lockId,first.lockId);
  assert.equal(repeat.downloadCount,0);
  const isolated=await prepare('a');
  assert.equal(isolated.sourceUtf8,first.sourceUtf8,'same frozen Worker bytes');
  assert.equal(f.rows().filter(row=>row.tag==='userscript-asset-v1').length,1);
  // Synthetic ONLY: test the returned classic bytes with Worker-equivalent
  // lexical parameters; real CFT independently proves actual opaque Worker.
  const {runInNewContext}=await import('node:vm');
  const isolatedGlobal=Object.create(null);
  const run=runInNewContext('(async function(page,params){'+second.sourceUtf8+
    '\n; return await main();})',isolatedGlobal);
  assert.equal(await run(null,{}),21);
  assert.equal(globalThis.fixtureClassic,undefined);
});
test('R7.3 Controller Classic: bad SHA, revoked origin and tampered cached bytes fail closed',async()=>{
  const url='https://libraries.example.org/vendor@1.2.3/lib.js';
  const content='globalThis.fixture={twice:x=>2*x};';
  const script=extra=>'// @require '+url+extra+'\nasync function main(){return fixture.twice(2)}';
  const f=fixture();f.routes.set(url,{bytes:content});
  await assert.rejects(f.manager.prepareControllerClassic({
    programId:'classic',sourceUtf8:script(' sha256:'+'f'.repeat(64)),
    explicitUserAction:true,allowDownload:true},{}),failCode('E_DEPENDENCY_INTEGRITY'));
  assert.equal(f.rows().length,0);
  f.granted=false;
  await assert.rejects(f.manager.prepareControllerClassic({
    programId:'classic',sourceUtf8:script(''),
    explicitUserAction:true,allowDownload:true},{}),failCode('E_DEPENDENCY_PERMISSION'));
  assert.equal(f.calls.length,1,'missing permission must stop before fetch');
  f.granted=true;
  const locked=await f.manager.prepareControllerClassic({
    programId:'classic',sourceUtf8:script(''),explicitUserAction:true,allowDownload:true},{});
  f.change('frameworkKV',keys.asset(sha(content)),asset=>{
    new Uint8Array(asset.bytes)[0]^=1;return asset;
  });
  await assert.rejects(f.manager.prepareControllerClassic({
    programId:'classic',sourceUtf8:script(''),explicitUserAction:true,allowDownload:false},{}),
    failCode('E_DEPENDENCY_HASH'));
  assert.equal(locked.entries[0].sha256,sha(content));
});
test('R7.3 Controller Classic rejects moving versions, private hosts, ESM and arbitrary source changes',async()=>{
  const f=fixture(),call=(sourceUtf8)=>f.manager.prepareControllerClassic({
    programId:'classic',sourceUtf8,explicitUserAction:true,allowDownload:true},{});
  for(const url of ['https://cdn.example.org/pkg@latest/lib.js',
    'https://127.0.0.1/npm/lib@1.2.3/foo.js',
    'http://cdnjs.example.org/pkg@1.2.3/x.js']){
    await assert.rejects(call('// @require '+url+'\nasync function main(){}'),
      error=>['E_DEPENDENCY_VERSION','E_DEPENDENCY_URL','E_CONTROLLER_CLASSIC_DIRECTIVE'].includes(error.code));
  }
  await assert.rejects(call('// @require https://cdn.example.org/pkg@1.2.3/a.js\n'+
    "import a from 'something';"),failCode('E_CONTROLLER_CLASSIC_FORMAT'));
  await assert.rejects(call('// @opendesk-classic https://cdn.example.org/pkg@1.2.3/a.js\n'+
    'async function main(){}'),failCode('E_CONTROLLER_CLASSIC_DIRECTIVE'));

  assert.equal(f.calls.length,0);
});


test('R7.3 Controller Classic saved Revision cryptographically binds author, Worker bytes and dependency lock',async()=>{
  const f=fixture(),url='https://libraries.example.org/widget@1.2.3/dist/widget.js';
  const library='globalThis.widget={value:21};';
  const original='// @require '+url+'\nasync function main(){return widget.value;}';
  f.routes.set(url,{bytes:library});
  const prepared=await f.manager.prepareControllerClassic({
    programId:'widget',sourceUtf8:original,explicitUserAction:true,allowDownload:true},{});
  const stored=await createControllerClassicSavedSource({authorSourceUtf8:original,programId:'widget',prepared});
  const recovered=await verifiedControllerClassicAuthorSource(stored);
  assert.equal(recovered.authorSourceUtf8,original);
  assert.equal(recovered.compiledSourceUtf8,prepared.sourceUtf8);
  assert.equal(recovered.dependencyLockId,prepared.lockId);
  assert.equal(recovered.dependencies[0].sha256,sha(library));
  await assert.rejects(verifiedControllerClassicAuthorSource(stored+'// byte corruption'),
    failCode('E_CONTROLLER_CLASSIC_HASH'));
  await assert.rejects(createControllerClassicSavedSource({authorSourceUtf8:original+' ',
    programId:'widget',prepared}),failCode('E_CONTROLLER_CLASSIC_SOURCE'));
});
