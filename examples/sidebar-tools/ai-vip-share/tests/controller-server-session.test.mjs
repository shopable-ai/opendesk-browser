import test from 'node:test';
import assert from 'node:assert/strict';
import {runtime,deferred,PREFERENCE,RECOVERY,ORIGIN,EXTENSION_ORIGIN} from './helpers/controller-fixture.mjs';
import {createLocalFixture} from '../dev/local-test/local-fixture-server.mjs';
import {randomUUID} from 'node:crypto';

const partitionKey={topLevelSite:'https://chatgpt.com',hasCrossSiteAncestor:false};
const cookie=extra=>({name:'synthetic_session',value:'synthetic-server-secret',domain:'chatgpt.com',path:'/',
  hostOnly:true,secure:true,httpOnly:true,sameSite:'lax',session:true,storeId:'0',...extra});
const rows=()=>[cookie(),cookie({name:'partitioned',partitionKey}),
  cookie({name:'expired',session:false,expirationDate:1})];
async function activated(options={}){
  const fixture=createLocalFixture({extensionOrigin:EXTENSION_ORIGIN,cookieSource:rows});
  const e=await runtime({fixture,...options});
  await e.click('local-connect');await e.preview();await e.click('redeem-confirm');await e.flush();
  return e;
}
const settle=async e=>{for(let n=0;n<30&&e.get('site-select').disabled;n++)await e.flush();};
test('activation receives server JSON without file selection and every partition needs a separate confirmation',async()=>{
  const e=await activated();
  assert.equal(e.fixture.ledger.size,1);
  assert.match(e.get('site-status').textContent,/共 3 项.*保留 2 项.*跳过 1 项.*1 \/ 2/);
  assert.equal(e.get('cookie-file'),undefined);assert.equal(e.cookieCalls.length,0);
  await e.click('cookie-install');await settle(e);
  assert.equal(e.cookieCalls.length,1);assert.equal(e.tabCalls.length,0);
  assert.match(e.get('site-status').textContent,/2 \/ 2/);
  await e.click('cookie-install');await settle(e);
  assert.equal(e.cookieCalls.length,2);
  assert.deepEqual(e.cookieCalls.flatMap(batch=>batch.cookies.map(row=>row.name)),['synthetic_session','partitioned']);
  assert.deepEqual(e.tabCalls,[{url:'https://chatgpt.com/'}]);
  assert.match(e.get('site-status').textContent,/各批 Cookie 已写入并核验/);
  assert(!JSON.stringify([...e.store]).includes('synthetic-server-secret'));
  const before=JSON.stringify([...e.store]);
  const reopened=await runtime({store:e.store,fixture:e.fixture});
  assert.equal(reopened.cookieCalls.length,0);assert.equal(reopened.tabCalls.length,0);
  assert.equal(JSON.stringify([...e.store]),before);
});
test('missing website grant leaves server activation intact and never writes',async()=>{
  const e=await activated({cookieContext:async()=>{throw Object.assign(Error('synthetic'),{code:'E_SITE_GRANT_REQUIRED'});}});
  assert.equal(e.fixture.ledger.size,1);assert.equal(e.cookieCalls.length,0);
  assert.equal(e.get('cookie-install').hidden,true);
  assert.match(e.get('site-status').textContent,/允许 ChatGPT 网站 Cookie/);
});
test('cancelled trusted confirmation can be retried explicitly; unknown stops the remaining batches and survives reopen',async()=>{
  let cancel=true;
  const e=await activated({cookieSetMany:async()=>{throw Object.assign(Error('synthetic'),
    {code:cancel?'E_COOKIE_NOT_SUBMITTED':'E_CANCELLED'});}});
  await e.click('cookie-install');await settle(e);
  assert.equal(e.get('cookie-install').disabled,false);
  assert.equal(e.cookieCalls.length,1);
  cancel=false;await e.click('cookie-install');await settle(e);
  assert.equal(e.cookieCalls.length,2);assert.equal(e.tabCalls.length,0);
  const journal=JSON.stringify(e.store.get('aiVipCookieDeliveryR137'));
  const reopened=await runtime({store:e.store,fixture:e.fixture});
  await reopened.click('site-receive');
  assert.equal(reopened.cookieCalls.length,0);
  assert.equal(JSON.stringify(e.store.get('aiVipCookieDeliveryR137')),journal);
});
test('revoked assignment and changed Store stop a prepared server batch before dispatch',async()=>{
  for(const changed of ['assignment','store']){
    let allowed=true,storeId='0';
    const fixture=createLocalFixture({extensionOrigin:EXTENSION_ORIGIN,cookieSource:rows,isSharedAccessAllowed:()=>allowed});
    const e=await activated({fixture,cookieContext:async kind=>kind==='store'?{storeId}:{partitionKey}});
    if(changed==='assignment')allowed=false;else storeId='1';
    await e.click('cookie-install');await settle(e);
    assert.equal(e.cookieCalls.length,0);assert.equal(e.tabCalls.length,0);
    assert.equal(e.get('cookie-install').hidden,true);
  }
});
test('late first-batch success cannot open ChatGPT or submit an expired remainder',async()=>{
  let now=Date.now();class Clock extends Date{static now(){return now;}}
  let elapsed=0;const gate=deferred();
  const e=await activated({dateClock:Clock,performanceClock:{now:()=>elapsed},cookieSetMany:async args=>{
    await gate.promise;return {saved:args.cookies.length,verified:args.cookies.length,
      results:args.cookies.map((_,index)=>({index,saved:true,verified:true}))};}});
  await e.click('cookie-install');assert.equal(e.cookieCalls.length,1);
  elapsed=120001;now+=120001;gate.resolve();await settle(e);
  assert.equal(e.cookieCalls.length,1);assert.equal(e.tabCalls.length,0);
  assert.match(e.get('site-status').textContent,/已到期.*剩余 1 项未提交/);
});
test('legacy development preference and unresolved transaction remain on their original server',async()=>{
  const record={schemaVersion:2,serviceOrigin:ORIGIN,toolId:'ai-vip-share',packageVersion:'1.4.20',
    accountId:'local-fixture-account',idempotencyKey:randomUUID(),createdAt:Date.now()};
  const e=await runtime({store:new Map([[PREFERENCE,{schemaVersion:1,enabled:true}],[RECOVERY,record]])});
  await e.click('recovery-check');
  assert(e.calls.every(row=>new URL(row.url).origin===ORIGIN));
  assert.deepEqual(e.store.get(RECOVERY),record);
  assert.equal(e.get('local-connect').disabled,true);
});
test('a successful legacy 7898 Cookie receipt is attributed when explicitly connecting to 7903',async()=>{
  const legacy={schemaVersion:1,deliveryId:'old',attemptId:'old-attempt',accountId:'local-fixture-account',
    serviceOrigin:ORIGIN,targetUrl:ORIGIN+'/session/',state:'success',count:1,
    results:[{index:0,saved:true,verified:true}],seen:[]};
  const store=new Map([['aiVipCookieDeliveryR137',legacy]]);
  const e=await activated({store});
  await e.click('cookie-install');await settle(e);
  assert.equal(e.cookieCalls.length,1);
  const journal=store.get('aiVipCookieDeliveryR137');
  assert.deepEqual(journal.legacy.record,legacy);
  assert.equal(journal.legacy.attribution.sourceId,'commercial-membership');
});
