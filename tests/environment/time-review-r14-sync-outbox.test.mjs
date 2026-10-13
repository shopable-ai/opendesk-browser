import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
import {
  REVIEW_SYNC_PROTOCOL,MAX_REVIEW_SYNC_RECORDS,beginReviewSync,stageReviewSync,reviewSyncStatus,
  pendingReviewSync,acknowledgeReviewSync,failReviewSyncAttempt,stopReviewSync,
  validateReviewSync,dailyReviewUpsertPayload
} from '../../src/time-review/sync-outbox.js';

const NOW=new Date('2026-10-13T12:00:00').getTime();
const SCOPE='a'.repeat(64),SEED='11111111-2222-4333-8444-555555555555';
const state=()=>({days:{'2026-10-12':{'past.example':30000},'2026-10-13':{'example.com':10000}},categories:{}});
const prepare=s=>beginReviewSync(s,{at:NOW,scope:SCOPE,seed:SEED});

test('default v1 records remain local; no outbox appears without separate consent',async()=>{
  const s=state();assert.deepEqual(reviewSyncStatus(s),{mode:'off',pending:0,overflow:false,networkEnabled:false});
  assert.deepEqual(await stageReviewSync(s),{staged:0,blocked:false});
  assert.equal(s.sync,undefined);
});

test('explicit preparation fences the entire existing day, never backfills older days',async()=>{
  const s=state();prepare(s);s.days['2026-10-13']['example.com']=20000;
  s.days['2026-10-13']['new.example']=3000;
  await stageReviewSync(s);const pending=pendingReviewSync(s,NOW);
  assert.equal(pending.length,2);
  assert.equal(pending.find(x=>x.host==='example.com').ms,10000);
  assert.equal(pending.find(x=>x.host==='new.example').ms,3000);
  assert.ok(!pending.some(x=>x.host==='past.example'));
  assert.equal(s.sync.mode,'prepared-local-only');assert.equal(reviewSyncStatus(s).networkEnabled,false);
});

test('repeated check, JSON persist and worker restart never increase amount or revision',async()=>{
  const s=state();prepare(s);s.days['2026-10-13']['example.com']=20000;
  await stageReviewSync(s);const first=pendingReviewSync(s,NOW);
  const reload=JSON.parse(JSON.stringify(s));validateReviewSync(reload.sync);
  assert.deepEqual(await stageReviewSync(reload),{staged:0,blocked:false});
  assert.deepEqual(pendingReviewSync(reload,NOW),first);
});

test('stable ID, revision upsert, lost ACK and stale ACK preserve new pending revision',async()=>{
  const s=state();prepare(s);s.days['2026-10-13']['example.com']=20000;
  await stageReviewSync(s);const first=pendingReviewSync(s,NOW)[0];
  assert.equal(first.revision,1);
  assert.deepEqual(Object.keys(dailyReviewUpsertPayload(first)).sort(),
    ['category','date','host','id','ms','protocol','revision','scope'].sort());
  s.days['2026-10-13']['example.com']=25000;s.categories['example.com']=2;
  await stageReviewSync(s);const second=pendingReviewSync(s,NOW)[0];
  assert.equal(second.id,first.id);assert.equal(second.revision,2);assert.equal(second.ms,15000);
  assert.equal(acknowledgeReviewSync(s,{protocol:REVIEW_SYNC_PROTOCOL,scope:SCOPE,id:first.id,revision:1,accepted:true}),false);
  assert.equal(pendingReviewSync(s,NOW).length,1);
  assert.equal(acknowledgeReviewSync(s,{protocol:REVIEW_SYNC_PROTOCOL,scope:SCOPE,id:second.id,revision:2,accepted:true}),true);
  assert.equal(pendingReviewSync(s,NOW).length,0);
  assert.equal(acknowledgeReviewSync(s,{protocol:REVIEW_SYNC_PROTOCOL,scope:SCOPE,id:second.id,revision:2,accepted:true}),true);
});

test('server ACK must match exact scope, id, revision and positive accepted flag',async()=>{
  const s=state();prepare(s);s.days['2026-10-13']['example.com']=20000;await stageReviewSync(s);
  const first=pendingReviewSync(s,NOW)[0];
  for(const fake of [{...first,accepted:true,scope:'b'.repeat(64)},
    {...first,accepted:true,revision:100},{...first,accepted:false},
    {...first,accepted:true,id:'f'.repeat(64)}]){
    assert.throws(()=>acknowledgeReviewSync(s,fake),{code:'E_SYNC_ACK'});
  }
  assert.equal(reviewSyncStatus(s).pending,1);
});

test('network error, response loss and exponential retry remain durable and bounded',async()=>{
  const s=state();prepare(s);s.days['2026-10-13']['example.com']=20000;await stageReviewSync(s);
  const row=pendingReviewSync(s,NOW)[0];
  assert.equal(failReviewSyncAttempt(s,row.id,row.revision,NOW),true);
  assert.equal(pendingReviewSync(s,NOW).length,0);
  assert.equal(pendingReviewSync(s,NOW+30000).length,1);
  assert.equal(failReviewSyncAttempt(s,row.id,row.revision,NOW+30000),true);
  assert.equal(pendingReviewSync(s,NOW+89999).length,0);
  assert.equal(pendingReviewSync(s,NOW+90000).length,1);
  for(let i=0;i<12;i++)failReviewSyncAttempt(s,row.id,row.revision,NOW+100000+i*3600000);
  assert.equal(pendingReviewSync(s,NOW+86400000).length,0);
  assert.equal(reviewSyncStatus(s).pending,1); // never delete on give-up
  s.days['2026-10-13']['example.com']=22000;
  await stageReviewSync(s);
  assert.equal(pendingReviewSync(s,NOW+86400000).length,1); // new revision explicitly resets retry block
});

test('account switch and unsent disconnect cannot silently move records to another identity',async()=>{
  const s=state();prepare(s);s.days['2026-10-13']['example.com']=20000;await stageReviewSync(s);
  assert.throws(()=>prepare(s),{code:'E_SYNC_ALREADY_PREPARED'});
  assert.throws(()=>stopReviewSync(s),{code:'E_SYNC_UNSENT'});
  assert.deepEqual(stopReviewSync(s,{confirmDiscard:true}),{discardedPending:1,remoteDataDeleted:false});
  beginReviewSync(s,{at:NOW,scope:'b'.repeat(64),seed:'22222222-3333-4444-8555-666666666666'});
  await stageReviewSync(s);assert.equal(reviewSyncStatus(s).pending,0);
});

test('reject private URL, titles, invalid hosts, incorrect category or corrupt queued state',async()=>{
  const s=state();prepare(s);
  s.days['2026-10-13']['example.com']=20000;await stageReviewSync(s);
  const row=pendingReviewSync(s,NOW)[0];
  for(const dirty of [{...row,host:'https://example.com/private?q=password'},
    {...row,host:'example.com:443'}, {...row,category:9},
    {...row,ms:86400001},{...row,revision:0}])
    assert.throws(()=>dailyReviewUpsertPayload(dirty),{code:'E_SYNC_DATA'});
  const corrupt=structuredClone(s.sync);
  corrupt.records[row.id].ackedRevision=10;
  assert.throws(()=>validateReviewSync(corrupt),{code:'E_SYNC_DATA'});
});

test('capacity overflow never evicts old pending records, remains visible as BLOCKED',async()=>{
  const s=state();prepare(s);
  const one={id:'',date:'2026-10-13',host:'e.example',ms:1000,category:0,revision:1,ackedRevision:0,failures:0,nextAttemptAt:0};
  for(let i=0;i<MAX_REVIEW_SYNC_RECORDS;i++){
    const id=i.toString(16).padStart(64,'0');s.sync.records[id]={...one,id};
  }
  s.days['2026-10-13']['example.com']=20000;
  assert.deepEqual(await stageReviewSync(s),{staged:0,blocked:true});
  assert.equal(Object.keys(s.sync.records).length,MAX_REVIEW_SYNC_RECORDS);
  assert.equal(reviewSyncStatus(s).overflow,true);
});

const {putReviewSyncRecord,verifiedReviewSyncOrigin}=await import('../../src/time-review/sync-transport.js');
test('outbound adapter requires exact HTTPS allowlist and separate Chrome host grant',async()=>{
  const s=state();prepare(s);s.days['2026-10-13']['example.com']=20000;await stageReviewSync(s);
  const record=pendingReviewSync(s,NOW)[0],origin='https://sync.example';
  assert.throws(()=>verifiedReviewSyncOrigin('http://sync.example',['http://sync.example']),{code:'E_SYNC_ORIGIN'});
  assert.throws(()=>verifiedReviewSyncOrigin('https://sync.example@evil.test',[origin]),{code:'E_SYNC_ORIGIN'});
  assert.throws(()=>verifiedReviewSyncOrigin('https://sync.example/private',[origin]),{code:'E_SYNC_ORIGIN'});
  await assert.rejects(putReviewSyncRecord({record,origin,allowOrigins:[origin],token:'secret'}),{code:'E_SYNC_PERMISSION'});
});

test('PUT sends only schema-limited data; valid server ACK is accepted',async()=>{
  const s=state();prepare(s);s.days['2026-10-13']['example.com']=20000;await stageReviewSync(s);
  const record=pendingReviewSync(s,NOW)[0],origin='https://sync.example';
  const ack=await putReviewSyncRecord({record,origin,allowOrigins:[origin],token:'temporary-token',hostPermissionGranted:true,
    fetchImpl:async(url,options)=>{
      assert.equal(url,origin+'/v1/time-review/daily/'+record.id);
      assert.equal(options.method,'PUT');assert.equal(options.redirect,'error');
      assert.equal(options.credentials,'omit');
      assert.equal(options.headers.Authorization,'Bearer temporary-token');
      assert.deepEqual(JSON.parse(options.body),dailyReviewUpsertPayload(record));
      assert.doesNotMatch(options.body,/token|title|https:\/\/|search|cookie|query/i);
      return {status:200,json:async()=>({...record,accepted:true})};
    }});
  assert.equal(ack.revision,1);
  assert.equal(acknowledgeReviewSync(s,ack),true);
});

test('HTTP success without exact ACK, timeout and remote errors never mark state sent',async()=>{
  const s=state();prepare(s);s.days['2026-10-13']['example.com']=20000;await stageReviewSync(s);
  const record=pendingReviewSync(s,NOW)[0],origin='https://sync.example',opts={record,origin,allowOrigins:[origin],token:'t',hostPermissionGranted:true};
  await assert.rejects(putReviewSyncRecord({...opts,fetchImpl:async()=>({status:204,json:async()=>{throw Error('no body')}})}),{code:'E_SYNC_RETRY'});
  await assert.rejects(putReviewSyncRecord({...opts,fetchImpl:async()=>({status:200,json:async()=>({...record,revision:900,accepted:true})})}),{code:'E_SYNC_RETRY'});
  await assert.rejects(putReviewSyncRecord({...opts,fetchImpl:async()=>{throw Error('offline')}}),{code:'E_SYNC_RETRY'});
  await assert.rejects(putReviewSyncRecord({...opts,fetchImpl:async()=>({status:500})}),{code:'E_SYNC_RETRY'});
  await assert.rejects(putReviewSyncRecord({...opts,fetchImpl:async()=>({status:401})}),{code:'E_SYNC_AUTH'});
  assert.equal(reviewSyncStatus(s).pending,1);
});
