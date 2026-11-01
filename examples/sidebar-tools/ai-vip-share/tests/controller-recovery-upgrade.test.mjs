import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {runtime,ORIGIN,PREFERENCE,RECOVERY} from './helpers/controller-fixture.mjs';

for(const packageVersion of ['1.4.8','1.4.9','1.4.10','1.4.11','1.4.12','1.4.13'])test(`an unresolved ${packageVersion} redemption survives upgrade and can only query its original transaction`,async()=>{
  const record={schemaVersion:2,serviceOrigin:ORIGIN,toolId:'ai-vip-share',packageVersion,
    accountId:'local-fixture-account',idempotencyKey:randomUUID(),createdAt:Date.now()};
  const store=new Map([[PREFERENCE,{schemaVersion:1,enabled:true}],[RECOVERY,record]]);
  const e=await runtime({store});
  assert.equal(e.get('recovery-check').disabled,false,'the old transaction remains queryable');
  assert.equal(e.get('redeem-form').hidden,true);
  assert.deepEqual(store.get(RECOVERY),record);
  assert.equal(e.calls.filter(row=>row.method==='POST').length,0);
  await e.click('recovery-check');
  const posts=e.calls.filter(row=>row.method==='POST');
  assert.equal(posts.length,1);
  assert.equal(posts[0].url,ORIGIN+'/api/status');
  assert.equal(posts[0].data.idempotencyKey,record.idempotencyKey);
  assert.equal(posts[0].data.accountId,record.accountId);
  assert.deepEqual(store.get(RECOVERY),record,'a missing server conclusion cannot clear the old lock');
  assert.equal(e.fixture.ledger.size,0);
  assert.equal(e.cookieCalls.length,0);
  assert.equal(e.proxyCalls.length,0);
});
