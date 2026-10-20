import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {randomUUID} from 'node:crypto';
import {spawn,spawnSync} from 'node:child_process';
import {createLocalFixture} from './local-fixture-server.mjs';
const SERVER_NOW=Date.UTC(2026,9,15);
const boundAccount={state:'bound',id:'local-fixture-account',displayNameMasked:'l***@fixture.test'};
let serverNow=SERVER_NOW,memberState={account:boundAccount,entitlements:[]},sharedAccess=true;
const fixture=createLocalFixture({now:()=>serverNow,getMemberState:()=>memberState,
  isSharedAccessAllowed:()=>sharedAccess});
const {server,pac}=fixture;
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const addr=`http://127.0.0.1:${server.address().port}`;
const api=async(path,method='GET',data,headers={})=>{
  const r=await fetch(addr+path,{method,headers:{'X-OpenDesk-Local-Test':'1',...(data?{'Content-Type':'application/json'}:{}),...headers},
    ...(data?{body:JSON.stringify(data)}:{})});return {status:r.status,data:await r.json()};
};
const cookieHeader=delivery=>delivery.cookies.map(cookie=>cookie.name+'='+cookie.value).join('; ');
const sharedSession=async(redemptionId,requestId=randomUUID(),accountId=memberState.account.id)=>{
  redemptionId??=(await api('/api/member')).data.sharedAccounts?.redemptionId??randomUUID();
  return api('/api/status','POST',{operation:'sharedSession',accountId,redemptionId,requestId});
};
const redeemSession=async(code='DEMO-VIP-01')=>{
  const preview=await api('/api/preview','POST',{code});
  assert.equal(preview.status,200);
  const post={previewId:preview.data.previewId,accountId:memberState.account.id,idempotencyKey:randomUUID()};
  const response=await api('/api/redeem','POST',post);
  assert.equal(response.status,200);
  return {post,receipt:response.data};
};
const fixtureCliEnv=(overrides={})=>{
  const env={...process.env,VIP_TEST_PORT:'0',VIP_TEST_EXTENSION_ORIGIN:''};
  delete env.VIP_TEST_HOST;
  return {...env,...overrides};
};
const startFixtureCli=async(t,overrides={})=>{
  const child=spawn(process.execPath,[new URL('./local-fixture-server.mjs',import.meta.url).pathname],
    {env:fixtureCliEnv(overrides),stdio:['ignore','pipe','pipe']});
  const exited=new Promise(resolve=>child.once('close',resolve));
  t.after(async()=>{
    if(child.exitCode===null&&child.signalCode===null)child.kill();
    await exited;
  });
  let output='',timer;
  const origin=await new Promise((resolve,reject)=>{
    timer=setTimeout(()=>reject(Error('fixture CLI did not become ready')),5000);
    child.once('error',reject);
    child.once('exit',()=>reject(Error('fixture CLI exited before listening')));
    child.stdout.on('data',part=>{
      output+=part;
      const match=output.match(/\[local fixture\] (http:\/\/(?:127\.0\.0\.1|\[::1\]):\d+)\/health/);
      if(match)resolve(match[1]);
    });
    child.stderr.resume();
  }).finally(()=>clearTimeout(timer));
  return {origin,output:()=>output};
};
test.beforeEach(()=>{
  serverNow=SERVER_NOW;
  memberState={account:boundAccount,entitlements:[]};
  fixture.previews.clear();fixture.ledger.clear();fixture.leases.clear();
  fixture.sharedRequests.clear();fixture.sessions.clear();sharedAccess=true;
  fixture.setNextVerifyDelay(0);
});
test.after(()=>new Promise(resolve=>server.close(resolve)));
test('health is loopback only, mock mode is explicit',async()=>{
  const r=await fetch(addr+'/health');const data=await r.json();
  assert.equal(data.ok,true);assert.equal(data.proxyPort,7897);
  assert.equal(data.browserReleaseIntegration,false);
});
test('development activation URL is inert, exact and never reflects activation parameters',async()=>{
  const before=await api('/api/member');
  for(const code of ['DEMO-VIP-01','DEMO-VIP-02']){
    const response=await fetch(addr+'/activate?activation_code='+code);
    assert.equal(response.status,200);
    assert.equal(response.headers.get('cache-control'),'no-store');
    assert.equal(response.headers.get('referrer-policy'),'no-referrer');
    assert.equal(response.headers.get('content-security-policy'),"default-src 'none'");
    assert.equal(response.headers.get('set-cookie'),null);
    const html=await response.text();
    assert(html.includes('本地开发激活入口'));
    assert(!html.includes(code)&&!html.includes('activation_code')&&!html.includes('<script'));
  }
  for(const query of ['', '?code=DEMO-VIP-01', '?activation_code=', '?activation_code=INVALID',
    '?activation_code=DEMO-VIP-01&activation_code=DEMO-VIP-01',
    '?activation_code=DEMO-VIP-01&activation_code=DEMO-VIP-02',
    '?activation_code=DEMO-VIP-01&extra=1', '?activation_code=%3Cscript%3E',
    '?activation_code=DEMO-VIP-01%0A']){
    const response=await fetch(addr+'/activate'+query);
    assert.equal(response.status,400);
    assert.equal(response.headers.get('referrer-policy'),'no-referrer');
    assert.equal(response.headers.get('cache-control'),'no-store');
    const html=await response.text();
    assert(!html.includes('DEMO-VIP-')&&!html.includes('<script')&&!html.includes('activation_code'));
  }
  for(const path of ['/activate/','/session/activate','/Activate'])
    assert.equal((await api(path+'?activation_code=DEMO-VIP-01')).status,404);
  assert.deepEqual((await api('/api/member')).data,before.data,'opening a URL grants no entitlement or Cookie');
  assert.equal(fixture.previews.size,0);assert.equal(fixture.ledger.size,0);assert.equal(fixture.sessions.size,0);
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
  assert(JSON.stringify(again.data)===JSON.stringify(redeemed.data),'repeated receipt is unchanged');
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
  assert.equal(missing.data.cookieDelivery,undefined);
});
test('one code is consumed once across concurrent previews, new keys, expiry and accounts',async()=>{
  const previews=await Promise.all([1,2].map(()=>api('/api/preview','POST',{code:'DEMO-VIP-01'})));
  const posts=previews.map(({data})=>({previewId:data.previewId,accountId:boundAccount.id,idempotencyKey:randomUUID()}));
  const attempts=await Promise.all(posts.map(post=>api('/api/redeem','POST',post)));
  assert.deepEqual(attempts.map(row=>row.status).sort(),[200,409]);
  const index=attempts.findIndex(row=>row.status===200),receipt=attempts[index].data;
  const ledgerSize=fixture.ledger.size,sessionCount=fixture.sessions.size;
  assert.equal(ledgerSize,1);assert.equal(sessionCount,1);
  for(const elapsed of [0,3600001]){
    serverNow=SERVER_NOW+elapsed;
    const preview=await api('/api/preview','POST',{code:'DEMO-VIP-01'});
    assert.equal(preview.status,409);assert.equal(preview.data.error,'E_CODE_CONSUMED');
    const retry=await api('/api/redeem','POST',{...posts[index],idempotencyKey:randomUUID()});
    assert.equal(retry.status,409);
    const replay=await api('/api/redeem','POST',posts[index]);
    assert(JSON.stringify(replay.data)===JSON.stringify(receipt),'same key remains evidence of the sole effect');
  }
  memberState={account:{...boundAccount,id:'another-member'},entitlements:[]};
  assert.equal((await api('/api/preview','POST',{code:'DEMO-VIP-01'})).status,409);
  assert.equal(fixture.ledger.size,ledgerSize);assert.equal(fixture.sessions.size,sessionCount);
});
test('successful redemption issues a short-lived delivery with two ephemeral scoped cookies',async()=>{
  serverNow+=123;
  const {receipt}=await redeemSession();
  const delivery=receipt.cookieDelivery;
  assert.equal(receipt.redeemedAt,serverNow);
  assert.deepEqual(Object.keys(delivery).sort(),['cookies','deliveryId','expiresAt','schemaVersion','targetUrl']);
  assert.equal(delivery.schemaVersion,1);
  assert.match(delivery.deliveryId,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(delivery.targetUrl,'http://127.0.0.1:7898/session/');
  assert.equal(delivery.expiresAt,serverNow+120000);
  assert.equal(delivery.cookies.length,2);
  const {value,...attributes}=delivery.cookies[0];
  assert(typeof value==='string'&&value.length>=32,'session token is opaque and nonempty');
  assert.deepEqual(attributes,{name:'opendesk_fixture_session',path:'/session/',httpOnly:true,
    secure:false,sameSite:'lax',expirationDate:(serverNow+3600000)/1000});
  const {value:contextValue,...contextAttributes}=delivery.cookies[1];
  assert(typeof contextValue==='string'&&contextValue.length>=32&&contextValue!==value);
  assert.deepEqual(contextAttributes,{...attributes,name:'opendesk_fixture_context'});
  const other=(await redeemSession('DEMO-VIP-02')).receipt.cookieDelivery;
  assert(delivery.deliveryId!==other.deliveryId,'different receipts have different delivery IDs');
  assert(value!==other.cookies[0].value,'different receipts have different session tokens');
  const member=JSON.stringify((await api('/api/member')).data);
  assert(!member.includes(value)&&!member.includes(other.cookies[0].value),'member summaries omit cookie values');
});
test('delivery remains identical on repeated redemption and status even after delivery and cookie expiry',async()=>{
  const {post,receipt}=await redeemSession();
  const snapshot=JSON.stringify(receipt);
  for(const currentTime of [SERVER_NOW+1,receipt.cookieDelivery.expiresAt,
    receipt.cookieDelivery.cookies[0].expirationDate*1000]){
    serverNow=currentTime;
    for(const path of ['/api/redeem','/api/status']){
      const response=await api(path,'POST',post);
      assert.equal(response.status,200);
      assert(JSON.stringify(response.data)===snapshot,'delivery and cookie are never refreshed on lookup or retry');
    }
  }
  assert.equal(fixture.ledger.size,1);
});
test('session page requires an issued unexpired Cookie pair without the API test header',async()=>{
  const {receipt}=await redeemSession();
  const delivery=receipt.cookieDelivery,{name,value,expirationDate}=delivery.cookies[0];
  const check=async(headers,expected)=>{
    const response=await fetch(addr+'/session/',{headers});
    assert.equal(response.status,200);
    assert.equal(response.headers.get('cache-control'),'no-store');
    assert.equal(response.headers.get('content-type'),'text/html; charset=utf-8');
    assert.equal(response.headers.get('content-security-policy'),"default-src 'none'");
    assert.equal(response.headers.get('set-cookie'),null);
    const html=await response.text();
    assert(html.includes(expected),'page reports only the expected session state');
    assert(!html.includes(value)&&!html.includes(name),'page never reflects Cookie names or values');
    assert(!html.includes('<script'),'page has no scripts');
  };
  await check({},'未建立受控会话');
  await check({Cookie:`${name}=${randomUUID()}`},'未建立受控会话');
  await check({Cookie:`other_${name}=${value}`},'未建立受控会话');
  await check({Cookie:`${name}=${value}`},'未建立受控会话');
  await check({Cookie:`other=1; ${cookieHeader(delivery)}; another=2`},'受控会话有效');
  serverNow=delivery.expiresAt;
  await check({Cookie:cookieHeader(delivery)},'受控会话有效');
  serverNow=expirationDate*1000-1;
  await check({Cookie:cookieHeader(delivery)},'受控会话有效');
  serverNow++;
  await check({Cookie:`${name}=${value}`},'未建立受控会话');
  await check({'X-OpenDesk-Local-Test':'1',Cookie:`${name}=${value}`},'未建立受控会话');
  for(const origin of ['https://attacker.invalid','null','chrome-extension://'+'a'.repeat(32)]){
    const response=await fetch(addr+'/session/',{headers:{Origin:origin,'X-OpenDesk-Local-Test':'1'}});
    assert.equal(response.status,403);
    assert.equal(response.headers.get('cache-control'),'no-store');
    assert.equal((await response.json()).error,'E_BROWSER_ORIGIN_DISABLED');
  }
});
test('shared directory exposes only the server assignment bound to its redemption',async()=>{
  memberState.entitlements=[{type:'feature',featureId:'local-managed-proxy',status:'active',expiresAt:SERVER_NOW+3600000}];
  assert.equal((await api('/api/member')).data.sharedAccounts,undefined,'an injected entitlement alone cannot activate access');
  assert.equal((await sharedSession()).status,403);
  const {receipt}=await redeemSession();
  const directory=(await api('/api/member')).data.sharedAccounts;
  assert.deepEqual(directory,{schemaVersion:1,companyId:'fixture-company',
    assignedAccountId:'shared-a',redemptionId:receipt.redemptionId,accounts:[
      {id:'shared-a',label:'公司共享账号 A',targetUrl:'http://127.0.0.1:7898/session/',cookieScope:[
        {name:'opendesk_fixture_session',path:'/session/'},{name:'opendesk_fixture_context',path:'/session/'}]}
    ]});
  memberState={account:{...boundAccount,id:'other-member'},entitlements:memberState.entitlements};
  assert.equal((await api('/api/member')).data.sharedAccounts,undefined);
  assert.equal((await sharedSession(receipt.redemptionId)).status,403,'another member cannot borrow the first redemption');
  memberState={account:{state:'guest'},entitlements:[]};
  assert.equal((await api('/api/member')).data.sharedAccounts,undefined);
  assert.equal((await sharedSession(receipt.redemptionId,randomUUID(),boundAccount.id)).status,403);
});
test('server reassignment replaces both Cookie slots and invalidates all earlier assignment sessions',async()=>{
  const jar=new Map([['unrelated;/session/',{name:'unrelated',value:'keep',path:'/session/'}]]);
  const issued=[];
  for(const [code,id] of [['DEMO-VIP-01','shared-a'],['DEMO-VIP-02','shared-b']]){
    const {receipt}=await redeemSession(code);
    const directory=(await api('/api/member')).data.sharedAccounts;
    assert.equal(directory.assignedAccountId,id);
    assert.equal(directory.redemptionId,receipt.redemptionId);
    assert.deepEqual(directory.accounts.map(row=>row.id),[id]);
    const member=(await api('/api/member')).data;
    assert.equal(member.redemptions.at(-1).voucherPreviewMasked,id==='shared-a'?'****-01':'****-02');
    const response=await sharedSession(receipt.redemptionId);
    assert.equal(response.status,200);
    assert.deepEqual(Object.keys(response.data).sort(),[
      'accountId','cookieDelivery','redemptionId','requestId','schemaVersion','serverNow','sharedAccountId']);
    assert.equal(response.data.schemaVersion,1);
    assert.equal(response.data.accountId,boundAccount.id);
    assert.equal(response.data.sharedAccountId,id);
    assert.equal(response.data.redemptionId,receipt.redemptionId);
    assert.equal(response.data.serverNow,serverNow);
    const delivery=response.data.cookieDelivery;
    assert.equal(delivery.schemaVersion,1);
    assert.equal(delivery.targetUrl,'http://127.0.0.1:7898/session/');
    assert.equal(delivery.expiresAt,serverNow+120000);
    assert.deepEqual(delivery.cookies.map(({name,path})=>({name,path})),[
      {name:'opendesk_fixture_session',path:'/session/'},{name:'opendesk_fixture_context',path:'/session/'}]);
    for(const cookie of delivery.cookies){
      assert.equal(cookie.expirationDate,(serverNow+3600000)/1000);
      assert.equal(cookie.httpOnly,true);assert.equal(cookie.secure,false);assert.equal(cookie.sameSite,'lax');
      assert(typeof cookie.value==='string'&&cookie.value.length>=32);
      assert(issued.every(old=>old.cookieDelivery.cookies.every(prior=>prior.value!==cookie.value)));
      jar.set(cookie.name+';'+cookie.path,cookie);
    }
    const target=await fetch(addr+'/session/',{headers:{Cookie:cookieHeader({cookies:[...jar.values()]})}});
    const html=await target.text();
    assert.equal(target.status,200);
    assert(html.includes('受控会话有效')&&html.includes(`data-shared-account="${id}"`));
    assert(html.includes(id==='shared-a'?'公司共享账号 A':'公司共享账号 B'));
    assert(!html.includes(id==='shared-a'?'公司共享账号 B':'公司共享账号 A'));
    assert(!html.includes('<script')&&delivery.cookies.every(cookie=>!html.includes(cookie.value)));
    assert.equal(jar.size,3,'only the two contracted slots change');
    assert.equal(jar.get('unrelated;/session/').value,'keep');
    for(const old of issued){
      for(const requestId of [old.requestId,randomUUID()])
        assert.equal((await sharedSession(old.redemptionId,requestId)).status,403);
      const stale=await (await fetch(addr+'/session/',{headers:{Cookie:cookieHeader(old.cookieDelivery)}})).text();
      assert(stale.includes('未建立受控会话'),'a late old delivery cannot restore the old assignment');
    }
    issued.push(response.data);
  }
  // Receipt lookup is immutable evidence, not fresh authority to install the old session.
  const firstRow=[...fixture.ledger.values()][0];
  const lookup=await api('/api/status','POST',{accountId:boundAccount.id,idempotencyKey:firstRow.receipt.idempotencyKey});
  assert.equal(lookup.data.redemptionId,issued[0].redemptionId);
  assert.equal((await api('/api/member')).data.redemptions.length,2);
});
test('target rejects mixed, partial, duplicate and forged pairs without reflecting Cookie values',async()=>{
  await redeemSession();
  const a=(await sharedSession()).data.cookieDelivery;
  const b=(await sharedSession()).data.cookieDelivery;
  for(const cookies of [[],[a.cookies[0]],[a.cookies[1]],[a.cookies[0],b.cookies[1]],
    [b.cookies[0],a.cookies[1]],[...a.cookies,a.cookies[0]],
    [a.cookies[0],{...a.cookies[1],value:randomUUID()}]]){
    const html=await (await fetch(addr+'/session/',{headers:{Cookie:cookieHeader({cookies})}})).text();
    assert(html.includes('未建立受控会话')&&!html.includes('data-shared-account'));
    assert([...a.cookies,...b.cookies].every(cookie=>!html.includes(cookie.value)));
  }
});
test('sharedSession accepts only the exact redemption request and binds request IDs to member and redemption',async()=>{
  const {receipt}=await redeemSession();
  const requestId=randomUUID(),first=await sharedSession(receipt.redemptionId,requestId);
  assert.equal(first.status,200);
  serverNow++;
  const repeated=await sharedSession(receipt.redemptionId,requestId);
  assert.equal(repeated.status,200);
  assert(JSON.stringify(repeated.data)===JSON.stringify(first.data),'repeat preserves every response byte');
  assert.equal((await sharedSession(randomUUID(),requestId)).status,409);
  assert.equal((await sharedSession(randomUUID())).status,403);
  assert.equal((await sharedSession(receipt.redemptionId,randomUUID(),'wrong-member')).status,403);
  const body={operation:'sharedSession',accountId:boundAccount.id,redemptionId:receipt.redemptionId,requestId:randomUUID()};
  const {redemptionId,...missingRedemption}=body;
  for(const invalid of [{...body,extra:true},{...body,cookies:[]},{...body,requestId:''},
    {...body,requestId:' '},{...body,requestId:1},{...body,requestId:'x'.repeat(129)},
    {...body,redemptionId:''},{...body,redemptionId:null},{...body,redemptionId:'x'.repeat(129)},
    {...body,sharedAccountId:'shared-b'},missingRedemption,{...missingRedemption,sharedAccountId:'shared-a'}]){
    assert.equal((await api('/api/status','POST',invalid)).status,400);
  }
  memberState={account:{...boundAccount,id:'other-member'},entitlements:[]};
  assert.equal((await sharedSession(receipt.redemptionId,requestId)).status,409,'a request ID cannot move to another member');
  memberState={account:boundAccount,entitlements:[]};
  const next=(await redeemSession('DEMO-VIP-02')).receipt;
  assert.equal((await sharedSession(next.redemptionId,requestId)).status,409,'a request ID cannot move to a new assignment');
  assert.equal(fixture.sharedRequests.size,1);
});
test('expired shared requests cannot rotate their pair and revocation denies delivery and installed sessions',async()=>{
  const {receipt}=await redeemSession();
  const requestId=randomUUID(),first=(await sharedSession(receipt.redemptionId,requestId)).data;
  const target=async()=> (await fetch(addr+'/session/',{headers:{Cookie:cookieHeader(first.cookieDelivery)}})).text();
  serverNow=first.cookieDelivery.expiresAt;
  const repeated=await sharedSession(receipt.redemptionId,requestId);
  assert.equal(repeated.status,409);
  assert.equal(repeated.data.error,'E_DELIVERY_EXPIRED');
  assert(JSON.stringify(fixture.sharedRequests.get(requestId))===JSON.stringify(first),'expired request never issues new values');
  assert((await target()).includes('受控会话有效'),'a write deadline does not shorten an installed Cookie lifetime');
  sharedAccess=false;
  assert.equal((await api('/api/member')).data.sharedAccounts,undefined);
  assert.equal((await sharedSession(receipt.redemptionId,requestId)).status,403);
  assert.equal((await sharedSession()).status,403);
  assert((await target()).includes('未建立受控会话'));
  sharedAccess=true;
  serverNow=SERVER_NOW+3600000-1;
  assert((await target()).includes('受控会话有效'));
  serverNow++;
  assert((await target()).includes('未建立受控会话'));
  assert.equal((await api('/api/member')).data.sharedAccounts,undefined);
  assert.equal((await sharedSession(receipt.redemptionId,requestId)).status,403);
});
test('revoked granted entitlement stops directory, new deliveries and already installed sessions',async()=>{
  const {receipt}=await redeemSession();
  const delivery=(await sharedSession()).data.cookieDelivery;
  const stored=fixture.ledger.get(receipt.idempotencyKey).receipt;
  stored.grantedEntitlements.find(row=>row.featureId==='local-managed-proxy').status='revoked';
  assert.equal((await api('/api/member')).data.sharedAccounts,undefined);
  assert.equal((await sharedSession()).status,403);
  const html=await (await fetch(addr+'/session/',{headers:{Cookie:cookieHeader(delivery)}})).text();
  assert(html.includes('未建立受控会话'));
});
test('membership expiry denies a still-unexpired Cookie pair',async()=>{
  await redeemSession();
  serverNow+=60000;
  const delivery=(await sharedSession()).data.cookieDelivery;
  serverNow=SERVER_NOW+3600000;
  assert(delivery.cookies.every(cookie=>cookie.expirationDate*1000>serverNow));
  assert.equal((await sharedSession()).status,403);
  assert.equal((await api('/api/member')).data.sharedAccounts,undefined);
  const html=await (await fetch(addr+'/session/',{headers:{Cookie:cookieHeader(delivery)}})).text();
  assert(html.includes('未建立受控会话'));
});
test('reassignment revocation never falls back to an earlier still-valid entitlement',async()=>{
  const first=(await redeemSession()).receipt;
  const second=(await redeemSession('DEMO-VIP-02')).receipt;
  const delivery=(await sharedSession()).data.cookieDelivery;
  fixture.ledger.get(second.idempotencyKey).receipt.grantedEntitlements
    .find(row=>row.featureId==='local-managed-proxy').status='revoked';
  assert.equal((await api('/api/member')).data.sharedAccounts,undefined);
  assert.equal((await sharedSession(first.redemptionId)).status,403);
  assert.equal((await sharedSession(second.redemptionId)).status,403);
  const html=await (await fetch(addr+'/session/',{headers:{Cookie:cookieHeader(delivery)}})).text();
  assert(html.includes('未建立受控会话'));
});
test('separate browser jars can share one assignment but a consumed code cannot grant another member',async()=>{
  const {receipt}=await redeemSession();
  const first=(await sharedSession()).data.cookieDelivery;
  const sameMember=(await sharedSession()).data.cookieDelivery;
  memberState={account:{...boundAccount,id:'second-member'},entitlements:[]};
  assert.equal((await api('/api/preview','POST',{code:'DEMO-VIP-01'})).status,409);
  assert.equal((await sharedSession(receipt.redemptionId)).status,403);
  assert.equal((await api('/api/member')).data.sharedAccounts,undefined);
  for(const delivery of [first,sameMember]){
    const html=await (await fetch(addr+'/session/',{headers:{Cookie:cookieHeader(delivery)}})).text();
    assert(html.includes('受控会话有效')&&html.includes('data-shared-account="shared-a"'),
      'new deliveries for the same assignment do not revoke another browser jar');
  }
});
test('lost acknowledgement still has one authoritative receipt',async()=>{
  const p=await api('/api/preview','POST',{code:'DEMO-VIP-01'});
  const key=randomUUID(), accountId=p.data.accountId;
  const result=await api('/api/redeem','POST',{previewId:p.data.previewId,accountId,idempotencyKey:key},{'X-Fixture-Drop-Ack':'1'});
  assert.equal(result.status,504);
  const delivery=JSON.stringify(fixture.ledger.get(key).receipt.cookieDelivery);
  serverNow+=180000;
  const lookup=await api('/api/status','POST',{accountId,idempotencyKey:key});
  assert.equal(lookup.data.status,'redeemed');
  assert.equal(lookup.data.idempotencyKey,key);
  assert.equal(lookup.data.redeemedAt,SERVER_NOW);
  assert(JSON.stringify(lookup.data.cookieDelivery)===delivery,'lost acknowledgement preserves delivery');
  assert(JSON.stringify((await api('/api/status','POST',{accountId,idempotencyKey:key})).data)===
    JSON.stringify(lookup.data),'repeated status preserves the complete receipt');
  assert.equal(fixture.ledger.size,1);
  const member=await api('/api/member');
  assert.equal(member.data.redemptions.length,1);
  assert.equal(member.data.redemptions[0].redemptionId,lookup.data.redemptionId);
});
test('pending and authoritative final rejection never grant member entitlements',async()=>{
  for(const [outcome,expected,code] of [['pending','pending','DEMO-VIP-01'],['final-rejected','rejected','DEMO-VIP-02']]){
    const before=(await api('/api/member')).data;
    const p=await api('/api/preview','POST',{code});
    const parallelPreview=await api('/api/preview','POST',{code});
    const idempotencyKey=randomUUID();
    const row=await api('/api/redeem','POST',{
      previewId:p.data.previewId,accountId:p.data.accountId,idempotencyKey
    },{'X-Fixture-Outcome':outcome});
    assert.equal(row.data.status,expected);
    assert.equal(row.data.cookieDelivery,undefined);
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
    assert.equal((await api('/api/preview','POST',{code})).status,expected==='pending'?409:200);
    if(expected==='pending'){
      const retry=await api('/api/redeem','POST',{
        previewId:parallelPreview.data.previewId,accountId:p.data.accountId,idempotencyKey:randomUUID()
      });
      assert.equal(retry.status,409);
      assert.equal(retry.data.error,'E_CODE_PENDING');
    }
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
  const stale=await api('/api/preview','POST',{code:'DEMO-VIP-02'});
  const post={previewId:p.data.previewId,accountId:boundAccount.id,idempotencyKey:randomUUID()};
  const redeemed=await api('/api/redeem','POST',post);
  memberState={account:{state:'bound',id:'other-fixture-account',displayNameMasked:'o***@fixture.test'},entitlements:[]};
  const other=(await api('/api/member')).data;
  assert.deepEqual(other.redemptions,[]);assert.deepEqual(other.entitlements,[]);
  assert.equal((await api('/api/status','POST',post)).status,403);
  assert.equal((await api('/api/status','POST',{...post,accountId:other.account.id})).data.status,'unknown');
  assert.equal((await api('/api/redeem','POST',{...post,previewId:stale.data.previewId})).status,403);
  assert.equal((await api('/api/redeem','POST',{
    ...post,previewId:stale.data.previewId,accountId:other.account.id,idempotencyKey:randomUUID()
  })).status,409);
  assert.equal((await api('/api/preview','POST',{code:'DEMO-VIP-01'})).status,409,'codes are not reusable across accounts');
  const pOther=await api('/api/preview','POST',{code:'DEMO-VIP-02'});
  const otherPost={...post,previewId:pOther.data.previewId,accountId:other.account.id};
  assert.equal((await api('/api/redeem','POST',otherPost)).status,409,'a key cannot cross accounts');
  const otherRedeemed=await api('/api/redeem','POST',{...otherPost,idempotencyKey:randomUUID()});
  assert.equal(otherRedeemed.data.status,'redeemed');
  assert.deepEqual((await api('/api/member')).data.redemptions.map(row=>row.redemptionId),[otherRedeemed.data.redemptionId]);
  memberState={account:boundAccount,entitlements:[]};
  assert(JSON.stringify((await api('/api/status','POST',post)).data)===JSON.stringify(redeemed.data),
    'switching back recovers the same receipt');
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
    const sessionUrl=new URL('/session/',url);
    assert.equal((await fetch(sessionUrl)).status,200);
    for(const origin of [extensionOrigin,'chrome-extension://'+'b'.repeat(32),'null',
      'http://127.0.0.1:7898','https://attacker.invalid']){
      for(const testHeader of [false,true]){
        const response=await fetch(sessionUrl,{headers:{Origin:origin,
          ...(testHeader?{'X-OpenDesk-Local-Test':'1'}:{})}});
        assert.equal(response.status,origin===extensionOrigin&&testHeader?200:403);
        assert.equal(response.headers.get('cache-control'),'no-store');
      }
    }
  }finally{await new Promise(resolve=>allowed.server.close(resolve));}
});

test('CLI defaults to IPv4 loopback and accepts the exact IPv4 host',async t=>{
  for(const overrides of [{},{VIP_TEST_HOST:'127.0.0.1'}]){
    const child=await startFixtureCli(t,overrides);
    assert.match(child.origin,/^http:\/\/127\.0\.0\.1:\d+$/);
    const health=await fetch(child.origin+'/health');
    assert.equal(health.status,200);
    assert.equal((await health.json()).mode,'LOCAL_FIXTURE_NOT_PRODUCTION');
  }
});
test('CLI rejects every nonliteral or nonloopback VIP_TEST_HOST',()=>{
  for(const host of ['','localhost','0.0.0.0','::','[::1]','::ffff:127.0.0.1','127.1','127.0.0.2',
    '127.0.0.1 ','192.168.1.1','example.com']){
    const result=spawnSync(process.execPath,[new URL('./local-fixture-server.mjs',import.meta.url).pathname],{
      env:fixtureCliEnv({VIP_TEST_HOST:host}),encoding:'utf8',timeout:5000
    });
    assert.equal(result.status,1,'invalid host must fail before listening');
    assert(result.stderr.includes('VIP_TEST_HOST must be 127.0.0.1 or ::1'));
    assert.equal(result.stdout,'');
  }
});
test('IPv6-only CLI coexists on the IPv4 fixture port with a separate memory ledger',async t=>{
  const ipv4Receipt=(await redeemSession()).receipt;
  const child=await startFixtureCli(t,{VIP_TEST_HOST:'::1',VIP_TEST_PORT:String(server.address().port)});
  assert.equal(child.origin,`http://[::1]:${server.address().port}`);
  const ipv6Api=async(path,data)=>{
    const response=await fetch(child.origin+path,{method:data?'POST':'GET',headers:{
      'X-OpenDesk-Local-Test':'1',...(data?{'Content-Type':'application/json'}:{})
    },...(data?{body:JSON.stringify(data)}:{})});
    assert.equal(response.status,200);
    return response.json();
  };
  const member=await ipv6Api('/api/member');
  assert.equal(member.redemptions.length,0);
  const preview=await ipv6Api('/api/preview',{code:'DEMO-VIP-01'});
  const post={previewId:preview.previewId,accountId:preview.accountId,idempotencyKey:randomUUID()};
  const receipt=await ipv6Api('/api/redeem',post);
  assert.equal(receipt.cookieDelivery.targetUrl,'http://127.0.0.1:7898/session/');
  assert(JSON.stringify((await ipv6Api('/api/status',post)).cookieDelivery)===JSON.stringify(receipt.cookieDelivery),
    'IPv6 status retains the delivery');
  const cookie=receipt.cookieDelivery.cookies[0],ipv4Cookie=ipv4Receipt.cookieDelivery.cookies[0];
  for(const [origin,delivery,expected] of [
    [child.origin,receipt.cookieDelivery,'受控会话有效'],[child.origin,ipv4Receipt.cookieDelivery,'未建立受控会话'],
    [addr,ipv4Receipt.cookieDelivery,'受控会话有效'],[addr,receipt.cookieDelivery,'未建立受控会话']
  ]){
    const response=await fetch(origin+'/session/',{headers:{Cookie:cookieHeader(delivery)}});
    const html=await response.text();
    assert(html.includes(expected),'each listener accepts only its own issued token');
    assert(!html.includes(cookie.value)&&!html.includes(ipv4Cookie.value),'HTML contains no Cookie values');
  }
  const ipv4Member=await api('/api/member');
  assert.equal(ipv4Member.data.redemptions.length,1);
  assert.equal(ipv4Member.data.redemptions[0].redemptionId,ipv4Receipt.redemptionId);
  assert.equal(fixture.ledger.size,1,'IPv4 fixture ledger remains unchanged');
  assert(!child.output().includes(cookie.value)&&!child.output().includes(ipv4Cookie.value),
    'CLI logs contain no Cookie values');
  assert(!child.output().includes('DEMO-VIP-01')&&!child.output().includes('DEMO-VIP-02'),
    'CLI startup logs contain no activation codes');
});
