import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {randomUUID} from 'node:crypto';
import {createLocalFixture} from './local-fixture-server.mjs';
const SERVER_NOW=Date.UTC(2026,9,15);
const boundAccount={state:'bound',id:'local-fixture-account',displayNameMasked:'l***@fixture.test'};
let serverNow=SERVER_NOW,memberState={account:boundAccount,entitlements:[]};
const fixture=createLocalFixture({now:()=>serverNow,getMemberState:()=>memberState});
const {server,pac}=fixture;
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const addr=`http://127.0.0.1:${server.address().port}`;
const api=async(path,method='GET',data,headers={})=>{
  const r=await fetch(addr+path,{method,headers:{'X-OpenDesk-Local-Test':'1',...(data?{'Content-Type':'application/json'}:{}),...headers},
    ...(data?{body:JSON.stringify(data)}:{})});return {status:r.status,data:await r.json()};
};
test.beforeEach(()=>{
  serverNow=SERVER_NOW;
  memberState={account:boundAccount,entitlements:[]};
  fixture.previews.clear();fixture.ledger.clear();fixture.leases.clear();
  fixture.setNextVerifyDelay(0);
});
test.after(()=>new Promise(resolve=>server.close(resolve)));
test('health is loopback only, mock mode is explicit',async()=>{
  const r=await fetch(addr+'/health');const data=await r.json();
  assert.equal(data.ok,true);assert.equal(data.proxyPort,7897);
  assert.equal(data.browserReleaseIntegration,false);
});
test('PAC only routes approved AI hosts, not lookalikes',()=>{
  const sandbox={dnsDomainIs:(host,domain)=>host.endsWith(domain)};
  runInNewContext(pac+'\nthis.route=FindProxyForURL;',sandbox);
  for(const host of ['chatgpt.com','api.openai.com','claude.ai','gemini.google.com','www.perplexity.ai'])
    assert.equal(sandbox.route('https://'+host,host),'PROXY 127.0.0.1:7897',host);
  for(const host of ['badchatgpt.com','chatgpt.com.attacker.invalid','example.com'])
    assert.equal(sandbox.route('https://'+host,host),'DIRECT',host);
  assert(!pac.includes('PROXY 127.0.0.1:7897; DIRECT'));
});
test('basic member, preview, redemption and immutable idempotency',async()=>{
  const first=await api('/api/member');assert.equal(first.data.account.id,'local-fixture-account');
  assert.equal(first.data.serverNow,SERVER_NOW);
  const p=await api('/api/preview','POST',{code:'DEMO-VIP-01'});
  assert.equal(p.status,200);assert.equal(p.data.accountId,first.data.account.id);
  assert.equal(p.data.expiresAt,SERVER_NOW+120000);
  assert.deepEqual((await api('/api/member')).data,first.data,'precheck has no member effect');
  const key=randomUUID();
  const post={previewId:p.data.previewId,accountId:first.data.account.id,idempotencyKey:key};
  const redeemed=await api('/api/redeem','POST',post);
  assert.equal(redeemed.data.status,'redeemed');
  const again=await api('/api/redeem','POST',post);
  assert.deepEqual(again.data,redeemed.data);
  assert.equal(fixture.ledger.size,1);
  const reusedPreview=await api('/api/redeem','POST',{...post,idempotencyKey:randomUUID()});
  assert.equal(reusedPreview.status,409,'a consumed preview cannot grant twice with a new key');
  const list=await api('/api/member');assert.equal(list.data.redemptions.length,1);
  const status=await api('/api/status','POST',{accountId:post.accountId,idempotencyKey:key});
  assert.equal(status.data.redemptionId,redeemed.data.redemptionId);
  const wrong=await api('/api/redeem','POST',{...post,previewId:randomUUID()});
  assert.equal(wrong.status,409);
  const missing=await api('/api/status','POST',{accountId:post.accountId,idempotencyKey:randomUUID()});
  assert.equal(missing.data.status,'unknown');
});
test('lost acknowledgement still has one authoritative receipt',async()=>{
  const p=await api('/api/preview','POST',{code:'DEMO-VIP-01'});
  const key=randomUUID(), accountId=p.data.accountId;
  const result=await api('/api/redeem','POST',{previewId:p.data.previewId,accountId,idempotencyKey:key},{'X-Fixture-Drop-Ack':'1'});
  assert.equal(result.status,504);
  serverNow+=180000;
  const lookup=await api('/api/status','POST',{accountId,idempotencyKey:key});
  assert.equal(lookup.data.status,'redeemed');
  assert.equal(lookup.data.idempotencyKey,key);
  assert.equal(lookup.data.redeemedAt,SERVER_NOW);
  assert.equal(fixture.ledger.size,1);
  const member=await api('/api/member');
  assert.equal(member.data.redemptions.length,1);
  assert.equal(member.data.redemptions[0].redemptionId,lookup.data.redemptionId);
});
test('pending and authoritative final rejection never grant member entitlements',async()=>{
  for(const [outcome,expected] of [['pending','pending'],['final-rejected','rejected']]){
    const before=(await api('/api/member')).data;
    const p=await api('/api/preview','POST',{code:'DEMO-VIP-01'});
    const idempotencyKey=randomUUID();
    const row=await api('/api/redeem','POST',{
      previewId:p.data.previewId,accountId:p.data.accountId,idempotencyKey
    },{'X-Fixture-Outcome':outcome});
    assert.equal(row.data.status,expected);
    const status=await api('/api/status','POST',{accountId:p.data.accountId,idempotencyKey});
    assert.deepEqual(status.data,row.data);
    if(expected==='rejected')assert.equal(status.data.final,true);
    const repeated=await api('/api/redeem','POST',{
      previewId:p.data.previewId,accountId:p.data.accountId,idempotencyKey
    });
    assert.deepEqual(repeated.data,row.data,'repeated key cannot change pending/rejected to redeemed');
    const list=await api('/api/member');
    assert.deepEqual(list.data.entitlements,before.entitlements);
    assert.deepEqual(list.data.redemptions,before.redemptions);
  }
});
test('unbound member is guest and cannot preview, redeem or query another account',async()=>{
  memberState={account:{state:'guest'},entitlements:[]};
  const member=await api('/api/member');
  assert.deepEqual(member.data,{schemaVersion:1,serverNow:SERVER_NOW,
    account:{state:'guest'},entitlements:[],redemptions:[]});
  for(const [path,data] of [
    ['/api/preview',{code:'DEMO-VIP-01'}],
    ['/api/redeem',{previewId:randomUUID(),accountId:boundAccount.id,idempotencyKey:randomUUID()}],
    ['/api/status',{accountId:boundAccount.id,idempotencyKey:randomUUID()}]
  ])assert.equal((await api(path,'POST',data)).status,403,path);
  assert.equal(fixture.previews.size,0);assert.equal(fixture.ledger.size,0);
});
test('expired entitlement and exact preview expiry use server time without sleeping',async()=>{
  memberState={account:boundAccount,entitlements:[{
    type:'time',status:'expired',title:'已到期演示会员',expiresAt:SERVER_NOW-1
  }]};
  const member=await api('/api/member');
  assert.equal(member.data.entitlements[0].status,'expired');
  assert(member.data.entitlements[0].expiresAt<member.data.serverNow);
  const invalid=await api('/api/preview','POST',{code:'NOT-A-DEMO-CODE'});
  assert.equal(invalid.status,422);assert.equal(fixture.previews.size,0);
  const p=await api('/api/preview','POST',{code:'DEMO-VIP-01'});
  assert.equal(p.data.expiresAt,SERVER_NOW+120000);
  assert.deepEqual((await api('/api/member')).data,member.data);
  serverNow=p.data.expiresAt;
  const post={previewId:p.data.previewId,accountId:boundAccount.id,idempotencyKey:randomUUID()};
  const expired=await api('/api/redeem','POST',post);
  assert.equal(expired.status,409);assert.equal(expired.data.error,'E_PREVIEW_INVALID');
  const status=await api('/api/status','POST',post);
  assert.equal(status.data.status,'unknown');assert.notEqual(status.data.final,true);
  assert.equal(fixture.ledger.size,0);
});
test('account switching isolates previews, history, entitlements and recovery receipts',async()=>{
  const p=await api('/api/preview','POST',{code:'DEMO-VIP-01'});
  const post={previewId:p.data.previewId,accountId:boundAccount.id,idempotencyKey:randomUUID()};
  const redeemed=await api('/api/redeem','POST',post);
  const stale=await api('/api/preview','POST',{code:'DEMO-VIP-01'});
  memberState={account:{state:'bound',id:'other-fixture-account',displayNameMasked:'o***@fixture.test'},entitlements:[]};
  const other=(await api('/api/member')).data;
  assert.deepEqual(other.redemptions,[]);assert.deepEqual(other.entitlements,[]);
  assert.equal((await api('/api/status','POST',post)).status,403);
  assert.equal((await api('/api/status','POST',{...post,accountId:other.account.id})).data.status,'unknown');
  assert.equal((await api('/api/redeem','POST',{...post,previewId:stale.data.previewId})).status,403);
  assert.equal((await api('/api/redeem','POST',{
    ...post,previewId:stale.data.previewId,accountId:other.account.id,idempotencyKey:randomUUID()
  })).status,409);
  const pOther=await api('/api/preview','POST',{code:'DEMO-VIP-01'});
  const otherPost={...post,previewId:pOther.data.previewId,accountId:other.account.id};
  assert.equal((await api('/api/redeem','POST',otherPost)).status,409,'a key cannot cross accounts');
  const otherRedeemed=await api('/api/redeem','POST',{...otherPost,idempotencyKey:randomUUID()});
  assert.equal(otherRedeemed.data.status,'redeemed');
  assert.deepEqual((await api('/api/member')).data.redemptions.map(row=>row.redemptionId),[otherRedeemed.data.redemptionId]);
  memberState={account:boundAccount,entitlements:[]};
  assert.deepEqual((await api('/api/status','POST',post)).data,redeemed.data);
  assert.deepEqual((await api('/api/member')).data.redemptions.map(row=>row.redemptionId),[redeemed.data.redemptionId]);
});
test('proxy activation fixture returns schema only, not an actual local proxy host',async()=>{
  const a=await api('/api/activate','POST',{deviceId:'local-demo-device',code:'DEMO-VIP-01'});
  assert.equal(a.status,200);assert.equal(a.data.endpoint.host,'proxy.fixture.test');
  assert.equal(a.data.endpoint.scheme,'socks5');
  const v=await api('/api/verify','POST',{deviceId:'local-demo-device',leaseId:a.data.leaseId});
  assert.equal(v.data.active,true);assert.equal(v.data.lease.leaseId,a.data.leaseId);
});
test('explicit fixed development activation code returns the local HTTP endpoint and verifies unchanged',async()=>{
  const a=await api('/api/activate','POST',{deviceId:'development-device',code:'LOCAL-DEV-ONLY'});
  assert.equal(a.status,200);
  assert.deepEqual(a.data.endpoint,{scheme:'http',host:'127.0.0.1',port:7897});
  assert.equal(a.data.expiresAt,SERVER_NOW+3600000);
  const v=await api('/api/verify','POST',{deviceId:'development-device',leaseId:a.data.leaseId});
  assert.equal(v.status,200);assert.equal(v.data.active,true);assert.deepEqual(v.data.lease,a.data);
  assert.equal((await api('/api/verify','POST',{deviceId:'other-device',leaseId:a.data.leaseId})).status,403);
  assert.equal((await api('/api/activate','POST',{deviceId:'development-device',code:'local-dev-only'})).status,403);
});
test('bounded one-shot verify delay exposes an in-flight development response for STOP races',async()=>{
  const a=await api('/api/activate','POST',{deviceId:'race-device',code:'LOCAL-DEV-ONLY'});
  const body={deviceId:'race-device',leaseId:a.data.leaseId};
  assert.equal((await api('/api/fixture/verify-delay','POST',{delayMs:200})).status,200);
  let completed=false;
  const started=performance.now();
  const verifying=api('/api/verify','POST',body).then(result=>{completed=true;return result;});
  let state;
  for(let i=0;i<50;i++){
    state=(await api('/api/fixture/verify-delay')).data;
    if(state.verificationsInFlight||completed)break;
  }
  assert.equal(state.verificationsInFlight,1);
  assert.equal(state.nextVerifyDelayMs,0,'delay is consumed when development verification starts');
  assert.equal(completed,false);
  const result=await verifying;
  assert.equal(result.status,200);assert.deepEqual(result.data.lease,a.data);
  assert(performance.now()-started>=190,'the verification response was actually delayed');
  assert.deepEqual(fixture.getVerificationState(),{nextVerifyDelayMs:0,verificationsInFlight:0});
  assert.equal((await api('/api/verify','POST',body)).status,200);
});
test('verify delay controls are bounded, header-gated and cannot change endpoints',async()=>{
  for(const delayMs of [-1,5001,1.5,'100']){
    assert.equal((await api('/api/fixture/verify-delay','POST',{delayMs})).status,400);
    assert.throws(()=>fixture.setNextVerifyDelay(delayMs),/0 to 5000/);
  }
  assert.equal((await api('/api/fixture/verify-delay','POST',{
    delayMs:1,endpoint:{scheme:'http',host:'attacker.invalid',port:80}
  })).status,400);
  assert.equal((await fetch(addr+'/api/fixture/verify-delay')).status,403);
  assert.equal((await api('/api/fixture/verify-delay','POST',{delayMs:1},{Origin:'null'})).status,403);
  assert.deepEqual(fixture.setNextVerifyDelay(5000),{nextVerifyDelayMs:5000,verificationsInFlight:0});
  const demo=await api('/api/activate','POST',{deviceId:'schema-device',code:'DEMO-VIP-01'});
  assert.equal((await api('/api/verify','POST',{deviceId:'schema-device',leaseId:demo.data.leaseId})).status,200);
  assert.equal(fixture.getVerificationState().nextVerifyDelayMs,5000,'production-shape example does not consume development delay');
  fixture.setNextVerifyDelay(0);
  const a=await api('/api/activate','POST',{deviceId:'header-device',code:'LOCAL-DEV-ONLY',
    endpoint:{scheme:'http',host:'attacker.invalid',port:80}});
  assert.deepEqual(a.data.endpoint,{scheme:'http',host:'127.0.0.1',port:7897});
  const body={deviceId:'header-device',leaseId:a.data.leaseId};
  for(const value of ['5001','-1','invalid'])
    assert.equal((await api('/api/verify','POST',body,{'X-Fixture-Verify-Delay-Ms':value})).status,400);
  assert.equal((await api('/api/verify','POST',body,{'X-Fixture-Verify-Delay-Ms':'1'})).status,200);
});
test('mutating API refuses cross-site Origin and missing local test header',async()=>{
  const noHeader=await fetch(addr+'/api/preview',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
  assert.equal(noHeader.status,403);
  const origin=await fetch(addr+'/api/preview',{method:'POST',headers:{Origin:'https://attacker.invalid','X-OpenDesk-Local-Test':'1','Content-Type':'application/json'},body:'{}'});
  assert.equal(origin.status,403);
  for(const path of ['/api/activate','/api/verify']){
    const denied=await api(path,'POST',{deviceId:'development-device',code:'LOCAL-DEV-ONLY'},
      {Origin:'http://127.0.0.1:7898'});
    assert.equal(denied.status,403);assert.equal(denied.data.error,'E_BROWSER_ORIGIN_DISABLED');
  }
});

test('explicit isolated extension Origin opt-in never accepts another browser origin',async()=>{
  const extensionOrigin='chrome-extension://'+'a'.repeat(32);
  assert.throws(()=>createLocalFixture({extensionOrigin:'https://attacker.invalid'}),/exact isolated/);
  const allowed=createLocalFixture({extensionOrigin});
  await new Promise(resolve=>allowed.server.listen(0,'127.0.0.1',resolve));
  try{
    const url=`http://127.0.0.1:${allowed.server.address().port}/api/activate`;
    for(const origin of [extensionOrigin,'chrome-extension://'+'b'.repeat(32),'null','http://127.0.0.1:7898']){
      const response=await fetch(url,{method:'POST',headers:{Origin:origin,
        'X-OpenDesk-Local-Test':'1','Content-Type':'application/json'},
        body:JSON.stringify({deviceId:'origin-device',code:'LOCAL-DEV-ONLY'})});
      assert.equal(response.status,origin===extensionOrigin?200:403);
    }
    assert.equal((await fetch(url,{method:'POST',headers:{Origin:extensionOrigin},body:'{}'})).status,403);
  }finally{await new Promise(resolve=>allowed.server.close(resolve));}
});
