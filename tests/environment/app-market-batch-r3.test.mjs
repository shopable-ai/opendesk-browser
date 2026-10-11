import test from 'node:test';
import assert from 'node:assert/strict';
import {MARKET_BATCH_STORE,readMarketBatch,createMarketBatch,marketBatchUnresolved,
  reconcileQueuedAfterInterruption,withMarketBatchLock} from '../../src/marketplace/batch.js';
import {OFFICIAL_APPS,OFFICIAL_COLLECTIONS} from '../../src/marketplace/catalog.js';

const official=OFFICIAL_COLLECTIONS[0],rows=official.members.map(member=>({
  app:OFFICIAL_APPS.find(app=>app.id===member.id),status:'ready',reason:'审阅版本和能力'
}));
let seq=0;
const next=()=>{seq+=1;return 'aaaaaaaa-bbbb-4ccc-8ddd-'+String(seq).padStart(12,'0');};
const create=()=>createMarketBatch(official,rows,{idFactory:next,now:()=>1791714000000});

test('batch record uses one immutable revision, bounded official members and real transaction identifiers',()=>{
  const batch=create();
  assert.equal(MARKET_BATCH_STORE,'opendesk.market.batch.v1');
  assert.equal(batch.collectionId,'reading-kit');assert.equal(batch.revision,1);
  assert.equal(batch.items.length,3);assert.equal(new Set(batch.items.map(x=>x.operationId)).size,3);
  assert.deepEqual(batch.items.map(x=>x.status),['queued','queued','queued']);
  assert.deepEqual(readMarketBatch(batch),batch);
});
test('already installed, denied permissions, missing release are represented without launching',()=>{
  const mixed=rows.map((row,index)=>({...row,status:['skip','blocked','ready'][index],
    reason:['相同版本已安装','用户拒绝权限','等待安装确认'][index]}));
  const batch=createMarketBatch(official,mixed,{idFactory:next,now:()=>1});
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
  assert.throws(()=>createMarketBatch(official,[...rows].reverse(),{idFactory:next}),
    e=>e.code==='E_BATCH_PLAN');
  assert.throws(()=>createMarketBatch(official,rows.map(r=>({...r,status:'installed'})),{idFactory:next}),
    e=>e.code==='E_BATCH_PLAN');
  assert.throws(()=>createMarketBatch({...official,revision:0},rows,{idFactory:next}),
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
