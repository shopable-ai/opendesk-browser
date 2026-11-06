import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareServerCookieBatches,serverCookieScope} from '../src/server-cookie-batches.js';
const now=Date.now();
const row={name:'synthetic',value:'test',domain:'chatgpt.com',hostOnly:true,path:'/',secure:true,
  httpOnly:true,sameSite:'lax',session:true};
const delivery={schemaVersion:2,deliveryId:'test-delivery',targetUrl:'https://chatgpt.com/',expiresAt:now+120000,cookies:[row]};
const options={now,expectedScope:serverCookieScope([{name:row.name,path:'/'}]),assertActive(){},
  cookies:{getCurrentStore:async()=>({storeId:'resolved-store'})}};
test('omitted export Store is resolved into the exact submitted payload',async()=>{
  const plan=await prepareServerCookieBatches(delivery,options);
  assert.equal(plan.batches[0].cookies[0].storeId,'resolved-store');
  assert.equal(plan.storeId,'resolved-store');
  assert.equal(row.storeId,undefined);
});
test('delivery scope, lifetime, malformed partition and context changes fail closed',async()=>{
  await assert.rejects(prepareServerCookieBatches({...delivery,expiresAt:now+120001},options));
  await assert.rejects(prepareServerCookieBatches(delivery,{...options,expectedScope:'[]'}));
  await assert.rejects(prepareServerCookieBatches({...delivery,cookies:[{...row,partitionKey:{topLevelSite:'https://evil.test'}}]},options));
  let calls=0;
  await assert.rejects(prepareServerCookieBatches(delivery,{...options,
    assertActive(){if(++calls>1)throw Error('changed');}}),/changed/);
});
