import test from 'node:test';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {createCloudHistoryIndex} from '../../src/cloud-control/history-index.js';

const namespace='tool:trusted',KV='frameworkKV';
const entry=(i,state='waiting')=>({
  tag:'cloud-request-v1',namespace,requestId:'cloud:'+String(i).padStart(6,'0'),
  createdAt:1700000000000+i,state,
  // Sensitive fields must NEVER be copied into index projections.
  credential:'must-not-enter-observer',params:{private:'secret-'+i},
  assignment:{target:{url:'https://secret.example/path'}}
});
function fixture(count=0){
  let data=new Map(),tail=Promise.resolve(),inject=null;
  const metrics={gets:0,all:0,scans:0,keys:0,cursorEmitted:0,writes:0};
  for(let i=0;i<count;i++){const row=entry(i,i%7===0?'finished':'waiting');data.set('cloud:request:'+row.requestId,row);}
  const storage={
    nativeCursorPaging:true,readOnly:false,
    transaction(stores,mode,body){
      const run=tail.then(async()=>{
        assert(stores.includes(KV));
        const next=mode==='readwrite'?structuredClone(data):data;
        let writes=0;
        const tx={
          async get(store,key){assert.equal(store,KV);metrics.gets++;return structuredClone(next.get(key));},
          async put(store,value,key){
            assert.equal(store,KV);assert.equal(mode,'readwrite');
            if(inject&&++writes===inject)throw Object.assign(new Error('QuotaExceededError'),{name:'QuotaExceededError',code:'E_QUOTA'});
            metrics.writes++;next.set(key,structuredClone(value));
          },
          async delete(store,key){assert.equal(store,KV);assert.equal(mode,'readwrite');next.delete(key);},
          async all(store){assert.equal(store,KV);metrics.all++;return [...next.values()].map(structuredClone);},
          async keys(store,{prefix,offset=0,limit=50,direction='next'}){
            assert.equal(store,KV);metrics.keys++;
            const found=[...next.keys()].filter(k=>k.startsWith(prefix)).sort();
            if(direction==='prev')found.reverse();
            const sliced=found.slice(offset,offset+limit);metrics.cursorEmitted+=sliced.length;
            return sliced;
          },
          async scan(store,{prefix,offset=0,limit=50,direction='next'}){
            assert.equal(store,KV);metrics.scans++;
            const found=[...next.keys()].filter(k=>k.startsWith(prefix)).sort();
            if(direction==='prev')found.reverse();
            const sliced=found.slice(offset,offset+limit);metrics.cursorEmitted+=sliced.length;
            return sliced.map(k=>structuredClone(next.get(k)));
          }
        };
        const value=await body(tx);
        if(mode==='readwrite')data=next;
        return value;
      });
      tail=run.catch(()=>{});return run;
    },
    setFault:n=>{inject=n;},metrics,
    dump:()=>[...data.entries()].map(([key,value])=>[key,structuredClone(value)]),
    countPrefix:prefix=>[...data.keys()].filter(k=>k.startsWith(prefix)).length
  };
  return {storage,index:createCloudHistoryIndex({storage,namespace})};
}

test('v2 Cloud history migration preserves old request keys and excludes private fields from projections',async()=>{
  const {storage,index}=fixture(100);
  assert.equal(storage.countPrefix('cloud:request:'),100);
  assert.deepEqual(await index.ensure(),{migrated:true,total:100});
  assert.deepEqual(await index.ensure(),{migrated:false,total:100});
  const result=await storage.transaction([KV],'readonly',tx=>index.page(tx,{limit:20,offset:0}));
  assert.equal(result.total,100);assert.equal(result.matchingTotal,100);
  assert.equal(result.rows.length,20);
  assert.equal(result.rows[0].requestId,'cloud:000099');
  assert.equal(result.rows[19].requestId,'cloud:000080');
  assert.equal(result.states.finished,15);
  assert.equal(result.states.waiting,85);
  assert.equal(storage.countPrefix('cloud:request:'),100);
  const projections=storage.dump().filter(([key])=>key.startsWith('cloud:history:v1:'));
  assert.equal(projections.length,201);
  assert.doesNotMatch(JSON.stringify(projections),/credential|must-not-enter|params|secret.example|private|assignment/);
  assert.equal(storage.metrics.all,0);
});

test('the same Run request state mutation and metadata counter commit or roll back atomically',async()=>{
  const {storage,index}=fixture(1);
  await index.ensure();
  const original=storage.dump();
  const old=entry(0,'permitted');
  await assert.rejects(storage.transaction([KV],'readwrite',async tx=>{
    await index.put(tx,old);
    throw Object.assign(new Error('abort transaction'),{code:'E_QUOTA'});
  }),{code:'E_QUOTA'});
  assert.deepEqual(storage.dump(),original);
  await storage.transaction([KV],'readwrite',tx=>index.put(tx,old));
  const updated=await storage.transaction([KV],'readonly',tx=>index.page(tx,{limit:20,state:'permitted'}));
  assert.equal(updated.matchingTotal,1);
  assert.equal(updated.states.waiting,0);
  assert.equal(updated.states.permitted,1);
  assert.equal(updated.rows[0].state,'permitted');
  await storage.transaction([KV],'readwrite',tx=>index.put(tx,entry(1,'finished')));
  const page=await storage.transaction([KV],'readonly',tx=>index.page(tx,{limit:20}));
  assert.equal(page.total,2);assert.equal(page.states.finished,1);
  await assert.rejects(storage.transaction([KV],'readwrite',tx=>index.put(tx,{...entry(1),createdAt:3})),{code:'E_VERSION'});
});

test('quota/injected migration failure does not publish partial projections or change original history',async()=>{
  const {storage,index}=fixture(100);
  const before=storage.dump();storage.setFault(12);
  await assert.rejects(index.ensure(),{code:'E_QUOTA'});
  storage.setFault(null);
  assert.deepEqual(storage.dump(),before);
  assert.equal(storage.countPrefix('cloud:history:v1:'),0);
  assert.deepEqual(await index.ensure(),{migrated:true,total:100});
  const page=await storage.transaction([KV],'readonly',tx=>index.page(tx,{limit:50,state:'finished'}));
  assert.equal(page.matchingTotal,15);
});

test('legacy unindexed observer can only read and cannot initialize an index',async()=>{
  const {storage,index}=fixture(10);
  const before=storage.dump();
  const result=await storage.transaction([KV],'readonly',tx=>index.page(tx,{limit:20}));
  assert.equal(result,null);
  assert.deepEqual(storage.dump(),before);
});

for(const count of [100,1000,10000]){
  test('bounded Cloud key-range projection '+count+' rows uses at most page-size cursor values',async()=>{
    const {storage,index}=fixture(count);
    const start=performance.now();
    await index.ensure();
    const migrationMs=performance.now()-start;
    const before={...storage.metrics};
    const queryStart=performance.now();
    const page=await storage.transaction([KV],'readonly',tx=>index.page(tx,{
      limit:20,offset:Math.min(30,Math.floor(count*0.2)),state:'waiting'}));
    const durationMs=performance.now()-queryStart;
    assert.equal(page.total,count);
    assert.equal(page.rows.length,20);
    assert.equal(storage.metrics.all-before.all,0);
    assert.equal(storage.metrics.keys-before.keys,0);
    assert.equal(storage.metrics.scans-before.scans,1);
    assert.equal(storage.metrics.cursorEmitted-before.cursorEmitted,20);
    assert(storage.metrics.gets-before.gets<=22);
    // These are deterministic API-count checks, NOT real Chrome IDB timings.
    const responseBytes=Buffer.byteLength(JSON.stringify({rows:page.rows.map(r=>({state:r.state,createdAt:r.createdAt})),
      total:page.total,matchingTotal:page.matchingTotal}));
    assert(responseBytes<3000);
    assert(Number.isFinite(durationMs)&&Number.isFinite(migrationMs));
  });
}

const legacyMetaKey='cloud:history:v1:meta:'+encodeURIComponent(namespace);
async function seedLegacyIndex(storage,rows){
  const states=Object.fromEntries(['waiting','prepared','permitted','finished','cancelled',
    'cancellation-pending','OUTCOME_UNKNOWN','other'].map(state=>[state,0]));
  await storage.transaction([KV],'readwrite',async tx=>{
    for(const row of rows){
      const projection={tag:'cloud-history-entry-v1',namespace,requestId:row.requestId,
        createdAt:row.createdAt,state:row.state};
      const suffix=String(row.createdAt).padStart(16,'0')+':'+row.requestId;
      await tx.put(KV,projection,'cloud:history:v1:time:'+encodeURIComponent(namespace)+':'+suffix);
      await tx.put(KV,projection,'cloud:history:v1:state:'+encodeURIComponent(namespace)+':'+row.state+':'+suffix);
      states[row.state]++;
    }
    await tx.put(KV,{tag:'cloud-history-meta-v1',namespace,total:rows.length,states},legacyMetaKey);
  });
}
const originalRequests=storage=>storage.dump().filter(([key])=>key.startsWith('cloud:request:'));
const scopedEntry=(pair,state='waiting')=>({...entry(42,state),requestId:'cloud:shared-assignment',
  storageKey:'cloud:request:'+pair.repeat(64),
  identity:{pairing:{providerId:'provider',executorId:'executor',pairingId:pair,pairingGeneration:1},
    jobId:'job-'+pair,claimId:'claim-'+pair,assignmentId:'shared-assignment',attemptEpoch:1}});

test('equal requestId and timestamp across pairings retain distinct original keys and independent state indexes',async()=>{
  const {storage,index}=fixture(),a=scopedEntry('a'),b=scopedEntry('b','permitted');
  const legacy={...entry(42,'finished'),requestId:a.requestId};
  await storage.transaction([KV],'readwrite',async tx=>{
    await index.put(tx,a);await index.put(tx,b);await index.put(tx,legacy);
  });
  const originals=originalRequests(storage);
  assert.equal(originals.length,3);
  assert.deepEqual(await index.ensure(),{migrated:true,total:3});
  assert.deepEqual(originalRequests(storage),originals);
  const page=await storage.transaction([KV],'readonly',tx=>index.page(tx,{limit:20}));
  assert.equal(page.total,3);
  assert.deepEqual(new Set(page.rows.map(row=>row.storageKey||'cloud:request:'+row.requestId)),
    new Set([a.storageKey,b.storageKey,'cloud:request:'+legacy.requestId]));
  assert.equal(page.states.waiting,1);assert.equal(page.states.permitted,1);assert.equal(page.states.finished,1);
  await storage.transaction([KV],'readwrite',tx=>index.put(tx,{...a,state:'finished'}));
  const finished=await storage.transaction([KV],'readonly',tx=>index.page(tx,{limit:20,state:'finished'}));
  assert.equal(finished.total,3);assert.equal(finished.matchingTotal,2);assert.equal(finished.states.waiting,0);
  assert.deepEqual(storage.dump().find(([key])=>key===b.storageKey)[1],b);
  assert.deepEqual(storage.dump().find(([key])=>key==='cloud:request:'+legacy.requestId)[1],legacy);
  assert.equal(originalRequests(storage).length,3);
});

test('preexisting legacy index falls back read-only and upgrades atomically around scoped request mutations',async()=>{
  const {storage,index}=fixture(2),legacyRows=[entry(0,'finished'),entry(1)];
  await seedLegacyIndex(storage,legacyRows);
  const oldMeta=storage.dump().find(([key])=>key===legacyMetaKey)[1];
  const modern={...scopedEntry('a'),requestId:legacyRows[0].requestId,createdAt:legacyRows[0].createdAt};
  await storage.transaction([KV],'readwrite',tx=>index.put(tx,modern));
  assert.deepEqual(storage.dump().find(([key])=>key===legacyMetaKey)[1],oldMeta);
  const before=storage.dump(),originals=originalRequests(storage);
  assert.equal(await storage.transaction([KV],'readonly',tx=>index.page(tx,{limit:20})),null);
  assert.deepEqual(storage.dump(),before,'Observer must not upgrade an old index');
  assert.deepEqual(await index.ensure(),{migrated:true,total:3});
  assert.deepEqual(originalRequests(storage),originals);
  assert.equal(storage.countPrefix('cloud:history:v1:'),7,'replace private projections without duplicating old entries');
  assert.equal(storage.dump().find(([key])=>key===legacyMetaKey)[1].keyVersion,2);
  const page=await storage.transaction([KV],'readonly',tx=>index.page(tx,{limit:20}));
  assert.equal(page.total,3);assert.equal(page.states.finished,1);assert.equal(page.states.waiting,2);
  assert.deepEqual(await index.ensure(),{migrated:false,total:3});
  await storage.transaction([KV],'readwrite',tx=>index.put(tx,{...legacyRows[1],state:'permitted'}));
  const permitted=await storage.transaction([KV],'readonly',tx=>index.page(tx,{limit:20,state:'permitted'}));
  assert.equal(permitted.matchingTotal,1);assert.equal(permitted.rows[0].storageKey,undefined);
  assert.equal(originalRequests(storage).length,3);
});
