import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const entry=new URL('../../src/ui/market-install-sheet.js',import.meta.url);
const source=(await readFile(entry,'utf8'))
  .replace("import {createMarketInstallReview} from '../marketplace/install.js';",
    'const createMarketInstallReview=(...args)=>globalThis.__marketSheetTest.create(...args);')
  .replace("import {requestPendingMarketReviews,claimMarketReview} from '../marketplace/panel.js';",
    'const requestPendingMarketReviews=(...args)=>globalThis.__marketSheetTest.list(...args);const claimMarketReview=(...args)=>globalThis.__marketSheetTest.claim(...args);')
  .replace(/from '([^']+)'/g,(_match,path)=>'from '+JSON.stringify(new URL(path,entry).href));
const {createMarketInstallSheet}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const gate=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};};
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function harness(t){
  const h={models:[],patches:[],pending:[],auto:false,other:false,fail:false,state:{pending:[],review:null,error:''}};
  h.list=async()=>{if(h.fail)throw Error('连接中断');return h.pending;};
  h.claim=async()=>({});
  h.create=options=>{const model={options,disposed:false,ready:h.nextReady||Promise.resolve(),
    getSnapshot:()=>({title:options.reviewId,busy:false}),act(){},
    dismiss(){options.onClose();},dispose(){model.disposed=true;}};
    h.nextReady=null;h.models.push(model);return model;};
  globalThis.__marketSheetTest=h;
  const api={storage:{onChanged:{addListener(listener){h.listener=listener;},removeListener(){h.listener=null;}}}};
  const view={setMarketInstall:patch=>{h.patches.push(patch);Object.assign(h.state,patch);},connectMarketInstall:actions=>h.actions=actions};
  h.guard=()=>{};
  h.sheet=createMarketInstallSheet({api,view,canAutoOpen:()=>h.auto,hasOtherReview:()=>h.other,
    assertCanInstall:id=>h.guard(id)});
  t.after(()=>{h.sheet.dispose();delete globalThis.__marketSheetTest;});
  return h;
}

test('a delayed claim cannot replace a local import opened during handoff',async t=>{
  const h=harness(t);await flush();const claim=gate();h.claim=()=>claim.promise;
  const opening=h.actions.open('first');h.other=true;claim.resolve({});await opening;
  assert.equal(h.models.length,0);assert.equal(h.state.review,null);
  h.other=false;h.claim=async()=>({});await h.actions.open('first');assert.equal(h.models.length,1);
});

test('automatic handoff rechecks dirty conditions after claim before mounting',async t=>{
  const h=harness(t);await flush();const claim=gate();h.claim=()=>claim.promise;
  h.pending=[{reviewId:'first'}];h.auto=true;
  const refreshing=h.sheet.refresh();await flush();h.auto=false;claim.resolve({});await refreshing;
  assert.equal(h.models.length,0);assert.equal(h.state.pending.length,1);
});

test('automatic review claims directly without flashing a pending entry button',async t=>{
  const h=harness(t);await flush();const claim=gate();h.claim=()=>claim.promise;
  h.pending=[{reviewId:'first'}];h.auto=true;
  const refreshing=h.sheet.refresh();await flush();
  assert.equal(h.state.pending.length,0);assert.equal(h.state.review,null);
  assert.ok(!h.patches.some(patch=>patch.pending?.length));
  claim.resolve({});await refreshing;
  assert.equal(h.state.review.title,'first');assert.equal(h.models.length,1);
});

test('a failed automatic claim retains the error and a retryable pending request',async t=>{
  const h=harness(t);await flush();h.claim=async()=>{throw Error('身份尚未核对');};
  h.pending=[{reviewId:'first'}];h.auto=true;await h.sheet.refresh();
  assert.equal(h.state.review,null);assert.equal(h.state.pending.length,1);
  assert.match(h.state.error,/身份尚未核对/);
});

test('closing an automatic sheet during slow loading leaves other requests reachable',async t=>{
  const h=harness(t);await flush();const ready=gate();h.nextReady=ready.promise;
  h.pending=[{reviewId:'first'},{reviewId:'second'}];h.auto=true;
  await h.sheet.refresh();
  assert.equal(h.state.review.title,'first');
  h.auto=false;h.actions.dismiss();await flush();
  assert.equal(h.state.review,null);
  assert.deepEqual(h.state.pending.map(row=>row.reviewId),['first','second']);
  await h.actions.open('second');assert.equal(h.state.review.title,'second');
  ready.resolve();await flush();assert.equal(h.state.review.title,'second');
});

test('dismissing a slow load permits another review and isolates old callbacks',async t=>{
  const h=harness(t);await flush();const ready=gate();h.nextReady=ready.promise;
  const first=h.actions.open('first');await flush();const old=h.models[0];
  assert.equal(h.state.review.title,'first');h.actions.dismiss();assert.equal(old.disposed,true);
  await h.actions.open('second');assert.equal(h.state.review.title,'second');
  old.options.onChange({title:'stale'});old.options.onClose();ready.resolve();await first;
  assert.equal(h.state.review.title,'second');assert.equal(h.models[1].disposed,false);
});

test('first list failure exposes an explicit retry and recovers without storage changes',async t=>{
  const h=harness(t);await flush();h.fail=true;await h.actions.refresh();
  assert.match(h.state.error,/连接中断/);assert.equal(h.state.pending.length,0);
  h.fail=false;h.pending=[{reviewId:'first'}];await h.actions.refresh();
  assert.equal(h.state.error,'');assert.equal(h.state.pending.length,1);
});

test('the existing Host installation guard is passed to each review',async t=>{
  const h=harness(t);await flush();await h.actions.open('first');
  let checked;h.guard=id=>{checked=id;throw Error('未保存');};
  assert.throws(()=>h.models[0].options.assertCanInstall('example'),/未保存/);assert.equal(checked,'example');
});
