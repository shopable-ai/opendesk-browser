// R7.2 — the trusted Run intent automatically fixes SHA bytes per program.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createPageDependencyResolver} from '../../src/ui/page-dependencies.js';

const URL='https://cdn.jsdelivr.net/npm/marked@15.0.12/lib/marked.umd.js';
const CODE='// ==UserScript==\n// @require '+URL+'\n// ==/UserScript==\nasync function main(){return marked.parse("**OpenDesk**")}\n';
const HASH='a'.repeat(64), DIGEST='b'.repeat(64);
function fixture({sharedHashes=[HASH],onPrepare}={}){
  let program='alpha',source=CODE,downloads=0,approvals=0,preparations=0;
  const locks=new Map(),calls=[];
  const client={ready:Promise.resolve(),async request(method,payload){
    calls.push({method,payload:structuredClone(payload)});
    if(method==='inspectPageDependencies')return {
      manifestDigest:DIGEST,locks:locks.has(payload.programId)?[{lockId:locks.get(payload.programId)}]:[],
      requires:[{order:0,url:new URL(source.match(/@require\s+(\S+)/)?.[1]||URL).href,
        sourceKind:'https',integrity:[],downloadError:null,
        cacheChoices:locks.has(payload.programId)?[{sha256:HASH}]:[],
        sharedCacheChoices:downloads>0&&!locks.has(payload.programId)?
          sharedHashes.map(sha256=>({sha256})):[]}]
    };
    if(method==='preparePageDependencies'){
      preparations++;
      assert.equal(payload.explicitUserAction,true);
      if(!payload.selections.some(x=>x.sharedAssetSha256||x.assetSha256))downloads++;
      await onPrepare?.();
      return {reviewId:'dep-review-11111111-1111-1111-1111-111111111111',
        manifestDigest:DIGEST,status:'pending-review',
        entries:[{order:0,url:URL,sha256:HASH}]};
    }
    if(method==='approvePageDependencies'){
      approvals++;
      assert.equal(payload.explicitUserAction,true);
      assert.deepEqual(payload.acceptedHashes,[HASH]);
      const lockId='dep-lock-'+(payload.programId==='alpha'?'c':'d').repeat(64);
      locks.set(payload.programId,lockId);
      return {lockId,manifestDigest:DIGEST,approvalStatus:'approved'};
    }
    throw Error('Unexpected broker method '+method);
  }};
  const resolver=createPageDependencyResolver({client,getSource:()=>source,getProgramId:()=>program});
  return {resolver,calls,locks,setProgram:x=>{program=x;resolver.refresh();},
    setSource:x=>{source=x;resolver.refresh();},
    get downloads(){return downloads},get approvals(){return approvals},get preparations(){return preparations}};
}
test('Program A/B each click Run once: original SHA asset shared, lock ownership independent',async t=>{
  const f=fixture();t.after(()=>f.resolver.dispose());
  const a=await f.resolver.resolveForRun(f.resolver.captureForRun());
  assert.equal(a.lockId,f.locks.get('alpha'));
  assert.equal(f.downloads,1);assert.equal(f.approvals,1);
  f.setProgram('beta');
  const b=await f.resolver.resolveForRun(f.resolver.captureForRun());
  assert.equal(b.lockId,f.locks.get('beta'));assert.notEqual(a.lockId,b.lockId);
  assert.equal(f.downloads,1);assert.equal(f.approvals,2);
  const selected=f.calls.filter(x=>x.method==='preparePageDependencies').at(-1);
  assert.deepEqual(selected.payload.selections,[{order:0,sharedAssetSha256:HASH}]);
  await f.resolver.resolveForRun(f.resolver.captureForRun());
  assert.equal(f.preparations,2,'repeat Run must use the locked hash without fetching');
});
test('multiple SHAs for the exact URL require a pin; never pick a random cached version',async t=>{
  const f=fixture({sharedHashes:[HASH,'e'.repeat(64)]});t.after(()=>f.resolver.dispose());
  await f.resolver.resolveForRun(f.resolver.captureForRun());f.setProgram('beta');
  await assert.rejects(f.resolver.resolveForRun(f.resolver.captureForRun()),{code:'E_DEPENDENCY_LOCK_AMBIGUOUS'});
  assert.equal(f.downloads,1);assert.equal(f.approvals,1);
});
test('a source change during download cannot approve or execute the old snapshot',async t=>{
  let f;
  f=fixture({onPrepare:()=>f.setSource(CODE+'\n// edited after fetch')});
  t.after(()=>f.resolver.dispose());
  await assert.rejects(f.resolver.resolveForRun(f.resolver.captureForRun()),{code:'E_DEPENDENCY_STALE'});
  assert.equal(f.approvals,0);
});
test('moving latest CDN URL is rejected before obtaining a byte asset',async t=>{
  const f=fixture();t.after(()=>f.resolver.dispose());
  f.setSource(CODE.replaceAll(URL,'https://cdn.jsdelivr.net/npm/marked@latest/lib/marked.umd.js'));
  await assert.rejects(f.resolver.resolveForRun(f.resolver.captureForRun()),{code:'E_DEPENDENCY_VERSION'});
  assert.equal(f.downloads,0);assert.equal(f.approvals,0);
});
