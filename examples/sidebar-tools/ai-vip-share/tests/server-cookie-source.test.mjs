import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {createServerCookieSource} from '../dev/local-test/server-cookie-source.mjs';
import {createLocalFixture} from '../dev/local-test/local-fixture-server.mjs';
const NOW=Date.UTC(2026,10,6);
const row=(extra={})=>({name:'synthetic_session',value:'synthetic-secret',domain:'chatgpt.com',path:'/',
  hostOnly:true,secure:true,httpOnly:true,sameSite:'lax',session:false,expirationDate:NOW/1000+3600,...extra});
function temp(t){
  const dir=mkdtempSync(join(tmpdir(),'vip-source-test-'));
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
  return join(dir,'synthetic.json');
}
test('bounded regular read-only source rejects malformed, unsafe, oversized, empty, expired and unavailable files',t=>{
  const file=temp(t),source=createServerCookieSource(file,{now:()=>NOW});
  for(const text of ['{','[]',' '.repeat(65537),JSON.stringify([row({domain:'evil.test'})]),
    JSON.stringify([row({expirationDate:NOW/1000})])]){
    writeFileSync(file,text);
    assert.throws(source,{code:'E_COOKIE_SOURCE',message:'Server cookie source unavailable or invalid'});
    assert.equal(readFileSync(file,'utf8'),text);
  }
  assert.throws(createServerCookieSource(join(file,'missing')),{code:'E_COOKIE_SOURCE'});
  assert.throws(createServerCookieSource(join(file,'..')),{code:'E_COOKIE_SOURCE'});
  const rows=[row(),row({name:'expired',expirationDate:NOW/1000-1})];
  writeFileSync(file,JSON.stringify(rows));
  assert.deepEqual(source(),rows,'raw export retains expired rows for consumer preflight');
  assert.throws(()=>createLocalFixture({cookieSource:()=>[],now:()=>NOW}),{code:'E_COOKIE_SOURCE'});
  assert.throws(()=>createLocalFixture({cookieSource:()=>{throw Error(file);}}),
    {message:'Server cookie source unavailable or invalid'});
});
function assertDurableRecovery(response,receipt){
  const {cookieDelivery,...durable}=receipt;
  assert.equal(response.status,200);
  assert.deepEqual(response.data,durable);
  assert.equal(response.data.status,'redeemed');
  assert.equal(Object.hasOwn(response.data,'cookieDelivery'),false);
}
async function start(t,options){
  const fixture=createLocalFixture({sessionTarget:'http://127.0.0.1:7903/session/',now:()=>NOW,...options});
  await new Promise(resolve=>fixture.server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>fixture.server.close(resolve)));
  const api=async(path,body,headers={})=>{
    const response=await fetch(`http://127.0.0.1:${fixture.server.address().port}${path}`,{
      method:body?'POST':'GET',headers:{'x-opendesk-local-test':'1','Content-Type':'application/json',...headers},
      ...(body?{body:JSON.stringify(body)}:{})});
    return {status:response.status,data:await response.json()};
  };
  const redeem=async(code='DEMO-VIP-01')=>{
    const {data:preview}=await api('/api/preview',{code});
    const post={previewId:preview.previewId,accountId:preview.accountId,idempotencyKey:randomUUID()};
    const response=await api('/api/redeem',post);
    assert.equal(response.status,200);
    return {post,receipt:response.data};
  };
  return {fixture,api,redeem};
}
test('schema 2 raw delivery, sanitized retained scope, current assignment, repeats and exact origin guard',async t=>{
  const rows=[row({storeId:'0',partitionKey:{topLevelSite:'https://chatgpt.com',hasCrossSiteAncestor:false}}),
    row({name:'domain_cookie',hostOnly:false,domain:'.chatgpt.com',storeId:'0'}),
    row({name:'expired',expirationDate:NOW/1000-1,storeId:'0'})];
  let allowed=true;
  const origin='chrome-extension://'+'a'.repeat(32);
  const {fixture,api,redeem}=await start(t,{cookieSource:()=>rows,extensionOrigin:origin,
    isSharedAccessAllowed:()=>allowed});
  const accountId='local-fixture-account',requestId=randomUUID();
  const session=redemptionId=>({operation:'sharedSession',accountId,redemptionId,requestId});
  assert.equal((await api('/api/member')).data.sharedAccounts,undefined);
  assert.equal((await api('/api/status',session(randomUUID()))).status,403);
  assert.equal(fixture.sessions.size,0);
  allowed=false;
  const blockedPreview=(await api('/api/preview',{code:'DEMO-VIP-01'})).data;
  assert.equal((await api('/api/redeem',{previewId:blockedPreview.previewId,accountId,idempotencyKey:randomUUID()})).status,403);
  assert.equal(fixture.ledger.size,0);
  allowed=true;
  const first=await redeem();
  assert.equal(first.receipt.cookieDelivery.schemaVersion,2);
  assert.equal(first.receipt.cookieDelivery.targetUrl,'https://chatgpt.com/');
  assert.deepEqual(first.receipt.cookieDelivery.cookies,rows);
  const catalog=(await api('/api/member')).data.sharedAccounts;
  assert.equal(catalog.accounts[0].cookieFormat,'chatgpt-export-v1');
  assert.deepEqual(catalog.accounts[0].cookieScope,[
    {name:rows[0].name,path:'/',storeId:'0',partitionKey:rows[0].partitionKey},
    {name:rows[1].name,path:'/',domain:'.chatgpt.com',storeId:'0'}]);
  assert(!JSON.stringify(catalog).includes('synthetic-secret'));
  const post=session(first.receipt.redemptionId);
  const delivered=await api('/api/status',post);
  assert.equal(delivered.status,200);
  assert.deepEqual(await api('/api/status',post),delivered);
  assert.equal((await api('/api/status',{...post,redemptionId:randomUUID()})).status,409);
  allowed=false;
  assert.equal((await api('/api/status',post)).status,403);
  assertDurableRecovery(await api('/api/redeem',first.post),first.receipt);
  assertDurableRecovery(await api('/api/status',first.post),first.receipt);
  allowed=true;
  await redeem('DEMO-VIP-02');
  assert.equal((await api('/api/status',post)).status,403);
  assertDurableRecovery(await api('/api/status',first.post),first.receipt);
  assertDurableRecovery(await api('/api/redeem',first.post),first.receipt);
  for(const value of [origin,'chrome-extension://'+'b'.repeat(32),'null','https://chatgpt.com']){
    const result=await api('/api/member',undefined,{Origin:value});
    assert.equal(result.status,value===origin?200:403);
  }
  assert.equal((await api('/api/member',undefined,{Origin:origin,'x-opendesk-local-test':''})).status,403);
});
test('source change or outage prevents cached and fresh requests from resurrecting original data',async t=>{
  for(const outage of [false,true]){
    const file=temp(t),original=[row()];
    writeFileSync(file,JSON.stringify(original));
    const {fixture,api,redeem}=await start(t,{cookieSource:createServerCookieSource(file,{now:()=>NOW})});
    const {post,receipt}=await redeem();
    const request={operation:'sharedSession',accountId:post.accountId,redemptionId:receipt.redemptionId,requestId:randomUUID()};
    assert.equal((await api('/api/status',request)).status,200);
    const beforeMember=(await api('/api/member')).data;
    const ledgerBefore=JSON.stringify([...fixture.ledger]);
    if(outage)rmSync(file);else writeFileSync(file,JSON.stringify([row({value:'changed-secret'})]));
    for(const [path,body] of [['/api/status',request],['/api/status',{...request,requestId:randomUUID()}]]){
      const result=await api(path,body);
      assert.equal(result.status,503);
      assert.deepEqual(result.data,{error:'E_COOKIE_SOURCE'});
    }
    for(const path of ['/api/status','/api/redeem'])assertDurableRecovery(await api(path,post),receipt);
    const {sharedAccounts,...durableMember}=beforeMember;
    assert.deepEqual(await api('/api/member'),{status:200,data:durableMember});
    assert.equal(JSON.stringify([...fixture.ledger]),ledgerBefore);
    writeFileSync(file,JSON.stringify(original));
    assert.equal((await api('/api/status',request)).status,503);
    assertDurableRecovery(await api('/api/status',post),receipt);
  }
});
test('expiry revalidated and explicit CLI source failures sanitized before listening',async t=>{
  let now=NOW;
  const {api,redeem}=await start(t,{now:()=>now,cookieSource:()=>[row()]});
  const {post,receipt}=await redeem();
  const request={operation:'sharedSession',accountId:post.accountId,redemptionId:receipt.redemptionId,requestId:randomUUID()};
  const first=await api('/api/status',request);
  now+=120001;
  assert.equal((await api('/api/status',request)).status,409);
  assertDurableRecovery(await api('/api/status',post),receipt);
  const fresh=await api('/api/status',{...request,requestId:randomUUID()});
  assert.equal(fresh.status,200);
  assert.notEqual(fresh.data.cookieDelivery.deliveryId,first.data.cookieDelivery.deliveryId);
  now=NOW+3600001;
  assertDurableRecovery(await api('/api/status',post),receipt);
  const file=temp(t);
  writeFileSync(file,'private malformed contents');
  const result=spawnSync(process.execPath,[new URL('../dev/local-test/local-fixture-server.mjs',import.meta.url).pathname],{
    env:{...process.env,VIP_TEST_COOKIE_FILE:file,VIP_TEST_PORT:'0',VIP_TEST_HOST:'127.0.0.1'},encoding:'utf8',timeout:5000});
  assert.equal(result.status,1);
  assert.equal(result.stdout,'');
  assert.equal(result.stderr,'[local fixture] Configuration unavailable or invalid\n');
});

test('synthetic session targets allow only exact legacy and explicit-connect URLs',async t=>{
  for(const sessionTarget of ['http://localhost:7903/session/','http://[::1]:7903/session/',
    'https://127.0.0.1:7903/session/','http://127.0.0.1:7904/session/',
    'http://127.0.0.1:7903/session','http://127.0.0.1:7903/session/?x=1',
    'http://127.0.0.1:7903/session/#x','http://user@127.0.0.1:7903/session/',null])
    assert.throws(()=>createLocalFixture({sessionTarget}),/exact supported loopback/);
  for(const options of [{},{sessionTarget:'http://127.0.0.1:7898/session/'}]){
    const {api,redeem}=await start(t,options);
    const {post,receipt}=await redeem();
    const expected=options.sessionTarget??'http://127.0.0.1:7903/session/';
    assert.equal(receipt.cookieDelivery.schemaVersion,1);
    assert.equal(receipt.cookieDelivery.targetUrl,expected);
    assert.equal((await api('/api/member')).data.sharedAccounts.accounts[0].targetUrl,expected);
    const request={operation:'sharedSession',accountId:post.accountId,redemptionId:receipt.redemptionId,requestId:randomUUID()};
    const delivered=await api('/api/status',request);
    assert.equal(delivered.data.cookieDelivery.targetUrl,expected);
    assert.deepEqual(await api('/api/status',request),delivered);
  }
});

test('lost acknowledgement recovers the committed receipt without an unavailable session',async t=>{
  const file=temp(t);
  writeFileSync(file,JSON.stringify([row()]));
  const {fixture,api}=await start(t,{cookieSource:createServerCookieSource(file,{now:()=>NOW})});
  const preview=(await api('/api/preview',{code:'DEMO-VIP-01'})).data;
  const post={previewId:preview.previewId,accountId:preview.accountId,idempotencyKey:randomUUID()};
  assert.equal((await api('/api/redeem',post,{'x-fixture-drop-ack':'1'})).status,504);
  const receipt=structuredClone(fixture.ledger.get(post.idempotencyKey).receipt);
  const ledgerBefore=JSON.stringify([...fixture.ledger]);
  rmSync(file);
  for(const path of ['/api/status','/api/redeem'])assertDurableRecovery(await api(path,post),receipt);
  const member=await api('/api/member');
  assert.equal(member.status,200);
  assert.equal(member.data.account.id,post.accountId);
  assert.deepEqual(member.data.entitlements,receipt.grantedEntitlements);
  assert.equal(member.data.redemptions[0].redemptionId,receipt.redemptionId);
  assert.equal(Object.hasOwn(member.data,'sharedAccounts'),false);
  assert.equal(JSON.stringify([...fixture.ledger]),ledgerBefore);
  assert.equal(fixture.ledger.size,1);
  assert.equal((await api('/api/preview',{code:'DEMO-VIP-01'})).status,409);
  assert.equal((await api('/api/status',{operation:'sharedSession',accountId:post.accountId,
    redemptionId:receipt.redemptionId,requestId:randomUUID()})).status,503);
});
