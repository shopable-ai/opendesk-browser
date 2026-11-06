import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {runtime,ORIGIN,PREFERENCE,RECOVERY,fixtureRequest} from './helpers/controller-fixture.mjs';

for(const packageVersion of ['1.4.8','1.4.9','1.4.10','1.4.11','1.4.12','1.4.13','1.4.14','1.4.15','1.4.16','1.4.17','1.4.18','1.4.19','1.4.20','1.4.21','1.4.22','1.4.23','1.4.24','1.4.25','1.4.26'])test(`an unresolved ${packageVersion} redemption survives upgrade and can only query its original transaction`,async()=>{
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

for(const packageVersion of ['1.4.22','1.4.23'])for(const status of ['pending','unknown'])
  test(`upgrade preserves ${packageVersion} ${status} redemption and only queries its original key`,async()=>{
    const record={schemaVersion:2,serviceOrigin:ORIGIN,toolId:'ai-vip-share',packageVersion,
      accountId:'local-fixture-account',idempotencyKey:randomUUID(),createdAt:Date.now()};
    const store=new Map([[PREFERENCE,{schemaVersion:1,enabled:true}],[RECOVERY,record]]);
    const e=await runtime({store,network:async(args,fixture)=>{
      if(args.url===ORIGIN+'/api/status')return {status:200,data:{status,
        accountId:record.accountId,idempotencyKey:record.idempotencyKey}};
      return fixtureRequest(fixture,{...args,headers:args.config.headers});
    }});
    assert.equal(e.get('recovery-check').disabled,false,'the old transaction remains queryable after upgrade');
    assert.equal(e.get('redeem-form').hidden,true);
    assert.deepEqual(store.get(RECOVERY),record);
    assert.equal(e.calls.filter(row=>row.method==='POST').length,0,'opening cannot replay redemption');
    await e.click('recovery-check');
    assert.equal(e.calls.filter(row=>row.method==='POST'&&row.url===ORIGIN+'/api/status').length,1,
      'the original transaction must remain queryable, rather than only retrying a rejected journal read');
    await e.preview();
    await e.click('redeem-confirm');
    const posts=e.calls.filter(row=>row.method==='POST');
    assert.equal(posts.length,1,'pending/unknown cannot submit another redemption');
    assert.equal(posts[0].url,ORIGIN+'/api/status');
    assert.deepEqual(posts[0].data,{accountId:record.accountId,idempotencyKey:record.idempotencyKey});
    assert.deepEqual(store.get(RECOVERY),record,'pending/unknown cannot clear the journal');
    assert.equal(e.storageCalls.filter(row=>row.operation==='storage.set'&&row.key===RECOVERY).length,0);
    assert.equal(e.get('redeem-form').hidden,true);
    assert.equal(e.fixture.ledger.size,0);
    assert.equal(e.cookieCalls.length,0);
    assert.equal(e.proxyCalls.length,0);
  });
