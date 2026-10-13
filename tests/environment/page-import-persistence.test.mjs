import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createHash,webcrypto} from 'node:crypto';
import {createDependencyManager} from '../../src/scripting/user-scripts/dependency-manager.js';
import {DEPENDENCY_STORAGE_KEYS} from '../../src/scripting/user-scripts/dependency-manager.js';
import {compileStaticESM} from '../../src/ui/static-esm-linker.mjs';
import {PAGE_BROWSER_COMPILER,STATIC_ESM_COMPILER_PROFILE} from '../../src/libs/page-frameworks/contract.js';
import {loadFakeBuiltin} from './builtin-support.mjs';
import {storageError} from '../../src/platform/storage/idb.js';

globalThis.crypto ||= webcrypto;

const encoder=new TextEncoder();
const authorUrl='https://static.example.org/page/value.js';
const moduleCode='export default function value(){return 41;}';
const authorSource=`import value from '${authorUrl}';\nexport default async function main(){return value()+1;}`;
const metadataAuthorSource=['// ==UserScript==','// @match https://author.example/*',
  '// @exclude-match https://author.example/private/*','// @run-at document-start',
  '// @noframes','// ==/UserScript==',authorSource].join('\n');
const programId='page-import-persistence';
const pageRules=Object.freeze({matches:['https://example.com/*'],excludeMatches:[],
  runAt:'document_idle',allFrames:false,world:'USER_SCRIPT'});
const sender=Object.freeze({key:'a',documentId:'doc-a'});
const sha=value=>createHash('sha256').update(value).digest('hex');
const fails=(fn,code)=>assert.rejects(fn,error=>error?.code===code,'Expected '+code);
const canonical=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?
  Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
const digest=value=>sha(canonical(value));

const compilerBytes=await readFile(PAGE_BROWSER_COMPILER.source);
assert.equal(sha(compilerBytes),PAGE_BROWSER_COMPILER.sha256);
const babelContext=vm.createContext({TextEncoder,TextDecoder});
vm.runInContext(compilerBytes.toString('utf8'),babelContext,{timeout:5000});
const babel=babelContext.Babel;
assert.equal(babel.version,PAGE_BROWSER_COMPILER.version);

function responseFor(code){
  const bytes=encoder.encode(code);
  return {ok:true,status:200,redirected:false,type:'basic',url:authorUrl,
    headers:{get:name=>name.toLowerCase()==='content-type'?'text/javascript; charset=utf-8':
      name.toLowerCase()==='content-length'?String(bytes.byteLength):null},
    body:new ReadableStream({start(controller){controller.enqueue(bytes);controller.close();}})};
}

function fixture({mutateBeforeSave,mutateBeforeCandidatePut}={}){
  const host={tag:'host',registrationId:'host-a',hostDocumentId:'doc-a',hostInstanceId:'instance-a',
    browserSessionIncarnation:'session',hostUrl:'chrome-extension://test/ui/tool.html',
    namespace:'tool:persistence',active:true,revoked:false};
  let data=new Map([['frameworkKV',new Map()],['commandJournal',new Map([['host:host-a',host]])]]);
  let queue=Promise.resolve(),loadCount=0,candidatePutCount=0;
  const state={permission:true,fetches:0};
  const removedListeners=new Set();
  const permissionEvent={addListener:fn=>removedListeners.add(fn),removeListener:fn=>removedListeners.delete(fn)};
  const removePermission=()=>{
    state.permission=false;
    for(const listener of removedListeners)listener({origins:[`https://${new URL(authorUrl).hostname}/*`]});
  };
  const restorePermission=()=>{state.permission=true;};
  const storage={transaction(stores,mode,work){
    const next=queue.then(async()=>{
      const snapshot=structuredClone(data);
      const table=name=>{assert.ok(stores.includes(name));return snapshot.get(name);};
      const tx={get:async(name,key)=>structuredClone(table(name).get(key)),
        all:async name=>[...table(name).values()].map(value=>structuredClone(value)),
        put:async(name,value,key)=>{
          assert.equal(mode,'readwrite');
          if(value?.tag==='page-candidate-v1'&&candidatePutCount++===0&&mutateBeforeCandidatePut)mutateBeforeCandidatePut();
          table(name).set(key,structuredClone(value));
        },
        delete:async(name,key)=>{assert.equal(mode,'readwrite');table(name).delete(key);}};
      const result=await work(tx);
      if(mode==='readwrite')data=snapshot;
      return result;
    }).catch(error=>{throw storageError(error);});
    queue=next.catch(()=>{});
    return next;
  }};
  const rows=()=>data.get('frameworkKV');
  const mutate=fn=>fn(rows());
  const transact=(mode,work)=>storage.transaction(['frameworkKV','commandJournal'],mode,work);
  const manager=createDependencyManager({storage,clock:{now:()=>1760300000000},
    api:{runtime:{id:'test',getURL:path=>'chrome-extension://test/'+path},
      permissions:{contains:async()=>state.permission,onRemoved:permissionEvent}},
    assertHost:async value=>{
      assert.equal(value?.documentId,'doc-a');
      const current=data.get('commandJournal').get('host:host-a');
      if(!current?.active||current.revoked)throw Object.assign(new Error('owner revoked'),{code:'E_OWNER'});
      return structuredClone(current);
    },
    fetchImpl:async url=>{
      state.fetches++;
      assert.equal(url,authorUrl);
      return responseFor(moduleCode);
    },
    loadBuiltin:async args=>{
      loadCount++;
      if(loadCount===1&&mutateBeforeSave)mutateBeforeSave(rows());
      return loadFakeBuiltin(args);
    }});
  return {manager,state,rows,mutate,transact,removePermission,restorePermission};
}

async function approveLeafLock(f,{sourceUtf8=authorSource}={}){
  const review=await f.manager.prepare({sourceUtf8,entryFormat:'async-main',
    sourceFormat:'esm-page',explicitUserAction:true},sender);
  assert.equal(review.sourceFormat,'esm-page');
  assert.equal(review.world,'USER_SCRIPT');
  assert.equal(review.entries.length,1);
  assert.equal(review.entries[0].url,authorUrl);
  const viewed=await f.manager.readReview({reviewId:review.reviewId,order:0},sender);
  assert.equal(viewed.code,moduleCode);
  const lock=await f.manager.approve({reviewId:review.reviewId,explicitUserAction:true,
    acceptedHashes:[sha(moduleCode)]},sender);
  assert.equal(lock.approvalStatus,'approved');
  assert.equal(lock.sourceFormat,'esm-page');
  assert.match(lock.lockId,/^dep-lock-[a-f0-9]{64}$/);
  return lock;
}

async function compileApproved(f,lock,{sourceUtf8=authorSource}={}){
  const resolution=await f.manager.loadForCompilation({sourceUtf8,entryFormat:'async-main',
    sourceFormat:'esm-page',lockId:lock.lockId},sender);
  assert.equal(resolution.lockId,lock.lockId);
  assert.equal(resolution.entries.length,1);
  assert.equal(resolution.entries[0].code,moduleCode);
  return compileStaticESM({sourceUtf8,entries:resolution.entries,sourceFormat:'esm-page',babel});
}

async function importCandidate(f,{revision=1,lock,built,sourceUtf8=authorSource,explicitPageRules=pageRules}={}){
  lock ||= await approveLeafLock(f,{sourceUtf8});
  built ||= await compileApproved(f,lock,{sourceUtf8});
  const request={programId,revision,sourceUtf8:built.sourceUtf8,
    entryFormat:'async-main',lockId:null,authorSourceUtf8:sourceUtf8,
    authorLockId:lock.lockId,compilerVersion:built.compilerVersion};
  if(explicitPageRules!==null)request.pageRules=explicitPageRules;
  const saved=await f.manager.importPageCandidate(request,sender);
  assert.equal(saved.stage,'Candidate');
  return {lock,built,saved};
}

function findRow(rows,predicate){
  const row=[...rows.values()].find(predicate);
  assert.ok(row,'expected persisted row');
  return row;
}
const assetRow=rows=>findRow(rows,row=>row?.tag==='userscript-asset-v1');
const lockRow=rows=>findRow(rows,row=>row?.tag==='userscript-lock-v1');
const candidateRow=rows=>findRow(rows,row=>row?.tag==='page-candidate-v1');

test('static Page import candidate survives reopen with author source, leaf lock and fixed compiler identity',async()=>{
  const f=fixture();
  const {lock,built,saved}=await importCandidate(f);
  assert.equal(f.state.fetches,1,'only the explicit approve preparation downloads the leaf once');
  assert.match(saved.candidateId,/^page-[a-f0-9]{64}$/);
  assert.equal(candidateRow(f.rows()).candidateId,saved.candidateId);

  const reopened=fixture();
  reopened.mutate(rows=>{rows.clear();for(const [key,value] of f.rows())rows.set(key,structuredClone(value));});
  reopened.state.fetches=0;
  const view=await reopened.manager.getPageCandidate({programId,revision:1},sender);
  assert.equal(view.sourceUtf8,built.sourceUtf8);
  assert.equal(view.authorSourceUtf8,authorSource);
  assert.equal(view.manifest.compilation.dependencyLockId,lock.lockId);
  assert.equal(view.manifest.compilation.compilerVersion,PAGE_BROWSER_COMPILER.version);
  assert.equal(view.manifest.compilation.compilerSha256,PAGE_BROWSER_COMPILER.sha256);
  assert.deepEqual(view.manifest.compilation.compilerProfile,STATIC_ESM_COMPILER_PROFILE);
  const restored=await reopened.manager.readStoredPageCandidate('tool:persistence',programId,1);
  assert.equal(restored.candidate.manifest.compilation.authorSourceHash,sha(authorSource));
  assert.equal(restored.resolution.lockId,null);
  assert.equal(reopened.state.fetches,0,'restore reads approved cache only and never fetches');
});

test('offline restore rejects missing cache, bad bytes, revoked lock and source permission loss without fetching',async()=>{
  for(const [name,change,code] of [
    ['missing cache',rows=>rows.delete(DEPENDENCY_STORAGE_KEYS.asset(sha(moduleCode))),'E_DEPENDENCY_ASSET'],
    ['bad bytes',rows=>{const row=assetRow(rows);row.bytes=encoder.encode(moduleCode.replace('41','42')).buffer;},'E_DEPENDENCY_HASH'],
    ['lock revoked',rows=>{lockRow(rows).approvalStatus='revoked';},'E_DEPENDENCY_LOCK'],
    ['permission revoked',(_rows,f)=>{f.state.permission=false;},'E_DEPENDENCY_PERMISSION']
  ]){
    const f=fixture();
    await importCandidate(f);
    f.state.fetches=0;
    f.mutate(rows=>change(rows,f));
    await fails(()=>f.manager.readStoredPageCandidate('tool:persistence',programId,1),code);
    assert.equal(f.state.fetches,0,name+' must not fall back to network');
  }
});

test('candidate row detects author, compiled source and manifest hash drift',async()=>{
  for(const [name,change,code] of [
    ['author source',row=>{row.authorSourceUtf8=authorSource+'\n//changed';},'E_SOURCE_HASH'],
    ['compiled source',row=>{row.sourceUtf8+='\n//changed';},'E_HASH'],
    ['manifest source hash',row=>{row.manifest.sourceHash='0'.repeat(64);},'E_HASH'],
    ['manifest hash',row=>{row.manifestHash='f'.repeat(64);},'E_HASH'],
    ['compiler profile',row=>{row.manifest.compilation.compilerProfile[0].sha256='0'.repeat(64);
      row.manifestHash=digest(row.manifest);},'E_STATIC_ESM_IDENTITY']
  ]){
    const f=fixture();
    await importCandidate(f);
    f.mutate(rows=>change(candidateRow(rows)));
    await fails(()=>f.manager.getPageCandidate({programId,revision:1},sender),code);
    assert.equal(f.state.fetches,1,name+' check stays offline after initial approval');
  }
});

test('author metadata decides persisted Page rules for imported ESM candidates',async()=>{
  const f=fixture();
  await importCandidate(f,{sourceUtf8:metadataAuthorSource,explicitPageRules:null});
  const view=await f.manager.getPageCandidate({programId,revision:1},sender);
  assert.deepEqual(view.manifest.pageRules,{matches:['https://author.example/*'],
    excludeMatches:['https://author.example/private/*'],runAt:'document_start',
    allFrames:false,world:'USER_SCRIPT'});
  await fails(()=>importCandidate(f,{revision:2,sourceUtf8:metadataAuthorSource,
    explicitPageRules:pageRules}),'E_PAGE_METADATA_RULES');
});

test('cache or lock drift before the candidate save transaction prevents persistence',async()=>{
  for(const [name,mutateBeforeSave,code] of [
    ['cache bytes change',rows=>{const row=assetRow(rows);row.bytes=encoder.encode(moduleCode.replace('41','43')).buffer;},'E_DEPENDENCY_HASH'],
    ['lock approval change',rows=>{lockRow(rows).approvalStatus='revoked';},'E_DEPENDENCY_LOCK']
  ]){
    const f=fixture({mutateBeforeSave});
    const lock=await approveLeafLock(f),built=await compileApproved(f,lock);
    await fails(()=>f.manager.importPageCandidate({programId,revision:1,sourceUtf8:built.sourceUtf8,
      entryFormat:'async-main',lockId:null,pageRules,authorSourceUtf8:authorSource,
      authorLockId:lock.lockId,compilerVersion:built.compilerVersion},sender),code);
    assert.equal([...f.rows().values()].some(row=>row?.tag==='page-candidate-v1'),false,name+' cannot save a candidate');
  }
});

test('permission removal and regrant before the final save transaction rejects without storing candidate',async()=>{
  let f;
  f=fixture({mutateBeforeSave:()=>{
    f.removePermission();
    f.restorePermission();
  }});
  const lock=await approveLeafLock(f),built=await compileApproved(f,lock);
  await fails(()=>f.manager.importPageCandidate({programId,revision:1,sourceUtf8:built.sourceUtf8,
    entryFormat:'async-main',lockId:null,pageRules,authorSourceUtf8:authorSource,
    authorLockId:lock.lockId,compilerVersion:built.compilerVersion},sender),'E_DEPENDENCY_PERMISSION');
  assert.equal(f.state.permission,true,'the simulated site grant is restored, but the epoch fence still trips');
  assert.equal([...f.rows().values()].some(row=>row?.tag==='page-candidate-v1'),false);
});

test('permission removal and regrant during candidate put rolls back the save transaction',async()=>{
  let f;
  f=fixture({mutateBeforeCandidatePut:()=>{
    f.removePermission();
    f.restorePermission();
  }});
  const lock=await approveLeafLock(f),built=await compileApproved(f,lock);
  await fails(()=>f.manager.importPageCandidate({programId,revision:1,sourceUtf8:built.sourceUtf8,
    entryFormat:'async-main',lockId:null,pageRules,authorSourceUtf8:authorSource,
    authorLockId:lock.lockId,compilerVersion:built.compilerVersion},sender),'E_DEPENDENCY_PERMISSION');
  assert.equal(f.state.permission,true,'contains() is true again, so rejection proves the onRemoved epoch fence');
  assert.equal([...f.rows().values()].some(row=>row?.tag==='page-candidate-v1'),false,
    'the readwrite transaction must not commit the candidate after the post-put fence rejects');
});

test('installed dispatch internal transaction rechecks author lock and cache before final use',async()=>{
  for(const [name,change,code] of [
    ['cache bytes change',(tx,rows)=>tx.put('frameworkKV',
      {...assetRow(rows),bytes:encoder.encode(moduleCode.replace('41','44')).buffer},
      DEPENDENCY_STORAGE_KEYS.asset(sha(moduleCode))),'E_DEPENDENCY_HASH'],
    ['lock approval change',(tx,rows)=>tx.put('frameworkKV',{...lockRow(rows),approvalStatus:'revoked'},
      DEPENDENCY_STORAGE_KEYS.lock('tool:persistence',lockRow(rows).lockId)),'E_DEPENDENCY_LOCK']
  ]){
    const f=fixture();
    await importCandidate(f);
    await fails(()=>f.transact('readwrite',async tx=>{
      const rows=new Map([...f.rows()].map(([key,value])=>[key,structuredClone(value)]));
      await change(tx,rows);
      return f.manager.readStoredPageCandidate('tool:persistence',programId,1,tx);
    }),code);
    assert.equal([...f.rows().values()].some(row=>row?.tag==='page-candidate-v1'),true,name+' leaves stored candidate intact');
  }
});
