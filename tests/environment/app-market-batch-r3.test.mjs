import test from 'node:test';
import assert from 'node:assert/strict';
import {MARKET_BATCH_STORE,readMarketBatch,createMarketBatch,marketBatchUnresolved,
  reconcileQueuedAfterInterruption,withMarketBatchLock} from '../../src/marketplace/batch.js';
import {officialMarketApps,OFFICIAL_COLLECTIONS} from '../../src/marketplace/catalog.js';
import {officialFixtures} from '../helpers/official-tools.mjs';
const releases=officialMarketApps((await officialFixtures()).catalog);

const official={id:'my-selection',revision:1,members:releases.slice(0,3).map(app=>({id:app.id,version:app.version}))};
const rows=official.members.map(member=>({
  app:releases.find(app=>app.id===member.id),status:'ready',reason:'审阅版本和能力'
}));
let seq=0;
const next=()=>{seq+=1;return 'aaaaaaaa-bbbb-4ccc-8ddd-'+String(seq).padStart(12,'0');};
const create=()=>createMarketBatch(official,rows,{releases,idFactory:next,now:()=>1791714000000});

test('batch record uses one immutable revision, bounded official members and real transaction identifiers',()=>{
  const batch=create();
  assert.equal(MARKET_BATCH_STORE,'opendesk.market.batch.v1');
  assert.equal(batch.collectionId,'my-selection');assert.equal(batch.revision,1);
  assert.equal(batch.items.length,3);assert.equal(new Set(batch.items.map(x=>x.operationId)).size,3);
  assert.deepEqual(batch.items.map(x=>x.status),['queued','queued','queued']);
  assert.deepEqual(readMarketBatch(batch),batch);
});
test('already installed, denied permissions, missing release are represented without launching',()=>{
  const mixed=rows.map((row,index)=>({...row,status:['skip','blocked','ready'][index],
    reason:['相同版本已安装','用户拒绝权限','等待安装确认'][index]}));
  const batch=createMarketBatch(official,mixed,{releases,idFactory:next,now:()=>1});
  assert.deepEqual(batch.items.map(x=>x.status),['skip','blocked','queued']);
  assert.equal(marketBatchUnresolved(batch),true);
  assert.equal(marketBatchUnresolved({...batch,items:batch.items.map(x=>({...x,status:'cancelled'}))}),false);
});
test('recovery never replays queued members and preserves committed and unknown results',()=>{
  const batch=create();
  batch.items[0].status='succeeded';
  batch.items[1].status='committing';
  const recovered=reconcileQueuedAfterInterruption(batch);
  assert.deepEqual(recovered.items.map(row=>row.status),['succeeded','committing','interrupted']);
  assert.match(recovered.items[2].reason,/尚未派发/);
  assert.equal(marketBatchUnresolved(recovered),true,'in-flight item must first be reconciled');
  assert.equal(batch.items[2].status,'queued','recovery must not mutate the old durable snapshot');
  recovered.items[1].status='outcome-unknown';
  assert.equal(marketBatchUnresolved(recovered),true,'lost acknowledgement is not failure');
  recovered.items[1].status='succeeded';
  assert.equal(marketBatchUnresolved(recovered),false);
});
test('malformed or contaminated durable records fail closed rather than being overwritten',()=>{
  const batch=create();
  for(const bad of [
    {...batch,token:'secret'}, {...batch,siteGrants:['https://a.example']},
    {...batch,items:[...batch.items,batch.items[0]]},
    {...batch,items:[{...batch.items[0],js:'alert(1)'},...batch.items.slice(1)]},
    {...batch,items:[{...batch.items[0],status:'install-whatever'},...batch.items.slice(1)]},
    {...batch,items:[{...batch.items[0],id:'unknown/evil'},...batch.items.slice(1)]},
    {...batch,items:[{...batch.items[0],operationId:'not-a-uuid'},...batch.items.slice(1)]},
    {...batch,updatedAt:-5},
    {...batch,collectionId:'arbitrary'},
    {...batch,revision:1.5}
  ])assert.throws(()=>readMarketBatch(bad),e=>e.code==='E_BATCH_SCHEMA');
  assert.equal(readMarketBatch(undefined),null);
});
test('stale review order and unapproved members cannot create a batch',()=>{
  assert.throws(()=>createMarketBatch(official,[...rows].reverse(),{releases,idFactory:next}),
    e=>e.code==='E_BATCH_PLAN');
  assert.throws(()=>createMarketBatch(official,rows.map(r=>({...r,status:'installed'})),{releases,idFactory:next}),
    e=>e.code==='E_BATCH_PLAN');
  assert.throws(()=>createMarketBatch({...official,revision:0},rows,{releases,idFactory:next}),
    e=>e.code==='E_BATCH_PLAN');
});
test('non-blocking Web Lock refuses overlapping browser market windows',async()=>{
  let entered=false;
  const occupied={request:async(name,opts,fn)=>{
    assert.equal(name,'opendesk.market:batch');assert.equal(opts.ifAvailable,true);return fn(null);
  }};
  await assert.rejects(withMarketBatchLock(occupied,async()=>{entered=true;}),
    e=>e.code==='E_BATCH_ACTIVE');
  assert.equal(entered,false);
  const free={request:async(_name,opts,fn)=>fn({name:'opendesk.market:batch'})};
  assert.equal(await withMarketBatchLock(free,async()=>42),42);
  await assert.rejects(withMarketBatchLock(null,async()=>42),e=>e.code==='E_BATCH_LOCK');
});

test('fixed unavailable members retain their historical version and never enter the queue',()=>{
  const collection=OFFICIAL_COLLECTIONS.find(row=>row.id==='reading-kit'&&row.revision===1);
  const plan=collection.members.map(member=>{
    const current=releases.find(app=>app.id===member.id);
    return {app:{...current,version:member.version},status:current?.version===member.version?'ready':'blocked',reason:'固定版本预检'};
  });
  const batch=createMarketBatch(collection,plan,{releases,idFactory:next});
  assert.deepEqual(batch.items.map(row=>row.status),collection.members.map(member=>
    releases.some(release=>release.id===member.id&&release.version===member.version)?'queued':'blocked'));
  assert.equal(batch.items[2].version,'1.1.1','historical collection member version stays pinned');
  assert(batch.items.some(row=>row.status==='blocked'),'missing historical release remains blocked');
  assert.throws(()=>createMarketBatch(collection,plan.map(row=>({...row,status:'ready'})),{releases,idFactory:next}),e=>e.code==='E_BATCH_PLAN');
  const historical={...batch,items:[{...batch.items[0],id:'opendesk/removed-official-tool',status:'committing'}]};
  assert.equal(readMarketBatch(historical).items[0].id,'opendesk/removed-official-tool');
  assert.equal(reconcileQueuedAfterInterruption(historical).items[0].status,'committing');
  assert.throws(()=>createMarketBatch(official,rows,{idFactory:next}),e=>e.code==='E_BATCH_PLAN');
});
