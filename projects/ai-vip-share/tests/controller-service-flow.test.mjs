import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {runtime,fixtureRequest,deferred,ORIGIN,RECOVERY,EXTENSION_ORIGIN} from './helpers/controller-fixture.mjs';
import {createLocalFixture} from '../dev/local-test/local-fixture-server.mjs';

const SERVICE_URL='https://vip.example.com/';
const TARGET='https://chatgpt.com/';
const CONNECTION='aiVipServiceConnectionR1';
const JOURNAL='aiVipCookieDeliveryR137';
const CODE='DEMO-VIP-01';
const ACTIVATION=SERVICE_URL+'activate?activation_code='+CODE;
const service={id:'reviewed-vip',label:'Reviewed VIP',url:SERVICE_URL,
  endpoints:{member:SERVICE_URL+'api/member',voucherPreview:SERVICE_URL+'api/preview',
    voucherRedeem:SERVICE_URL+'api/redeem',voucherStatus:SERVICE_URL+'api/status'},
  activation:{path:'/activate',parameter:'activation_code'},cookieTargets:[TARGET],
  catalogUrl:'',desktopClientUrl:''};
const choice={schemaVersion:1,serviceId:service.id,url:SERVICE_URL};
const cookies=['vip_session','vip_context'].map((name,index)=>({name,value:'synthetic-private-'+index,
  path:'/',secure:true,httpOnly:true,sameSite:'lax',expirationDate:Date.now()/1000+3600}));

// Call the real HTTP handler through streams only: no listener or external IO.
// Adapt its synthetic local delivery into the fixed reviewed production scope.
async function productionNetwork(args,fixture){
  const url=new URL(args.url);
  assert.equal(url.origin,new URL(SERVICE_URL).origin);
  assert.equal(args.config.headers?.['X-OpenDesk-Local-Test'],undefined);
  assert.ok(Object.values(service.endpoints).includes(args.url));
  const result=await fixtureRequest(fixture,{...args,url:ORIGIN+url.pathname,
    headers:{'X-OpenDesk-Local-Test':'1'}});
  for(const row of result.data.sharedAccounts?.accounts??[]){
    row.targetUrl=TARGET;
    row.cookieScope=cookies.map(({name,path})=>({name,path}));
  }
  if(result.data.cookieDelivery)result.data.cookieDelivery={...result.data.cookieDelivery,
    targetUrl:TARGET,cookies:cookies.map(row=>({...row}))};
  return result;
}
const requests=e=>e.calls.map(row=>[row.method,new URL(row.url).pathname]);
const sessions=e=>e.calls.filter(row=>row.data?.operation==='sharedSession');
const writes=e=>e.storageCalls.filter(row=>row.operation==='storage.set');
function noBrowserEffects(e){
  assert.deepEqual(e.cookieCalls,[]);
  assert.deepEqual(e.tabCalls,[]);
  assert.deepEqual(e.proxyCalls,[]);
}
function noSecrets(e){
  const saved=JSON.stringify([...e.store]);
  for(const secret of [CODE,ACTIVATION,...cookies.map(row=>row.value)])assert.ok(!saved.includes(secret));
  assert.deepEqual(e.store.get(CONNECTION),choice);
}
async function settle(e,predicate){
  for(let i=0;i<100&&!predicate();i++)await e.flush();
  assert.ok(predicate(),'controller operation settles');
}
async function connect(e,url=SERVICE_URL,trusted=true){
  e.get('service-link').value=url;
  await e.click('connect',trusted);
}
async function create(options={}){
  return runtime({reviewedService:service,productionNetwork,developmentProfile:null,...options});
}
async function assigned(options={}){
  const fixture=createLocalFixture({extensionOrigin:EXTENSION_ORIGIN});
  const preview=await fixtureRequest(fixture,{method:'POST',url:ORIGIN+'/api/preview',
    data:{code:CODE},headers:{'X-OpenDesk-Local-Test':'1'}});
  assert.equal(preview.status,200);
  const redeemed=await fixtureRequest(fixture,{method:'POST',url:ORIGIN+'/api/redeem',
    data:{previewId:preview.data.previewId,accountId:preview.data.accountId,idempotencyKey:randomUUID()},
    headers:{'X-OpenDesk-Local-Test':'1'}});
  assert.equal(redeemed.data.status,'redeemed');
  return create({fixture,store:new Map([[CONNECTION,choice]]),...options});
}

test('unconfigured and unsupported links cause no network or persistent writes',async()=>{
  for(const reviewedService of [null,service]){
    const e=await create({reviewedService});
    const before=JSON.stringify([...e.store]);
    assert.deepEqual(e.calls,[]);
    for(const url of [TARGET,'https://unknown.example.com/',SERVICE_URL+'other',
      SERVICE_URL+'activate?activation_code='+CODE+'&redirect='+TARGET])await connect(e,url);
    if(reviewedService===null)await connect(e,SERVICE_URL);
    await e.preview();await e.click('redeem-confirm');await e.click('site-receive');
    assert.deepEqual(e.calls,[]);
    assert.deepEqual(writes(e),[]);
    assert.equal(JSON.stringify([...e.store]),before);
    noBrowserEffects(e);
  }
});

test('trusted service selection verifies a fresh member GET and reopen restores by GET only',async()=>{
  const gate=deferred();
  const e=await create({productionNetwork:async(args,fixture)=>{
    if(args.method==='GET')await gate.promise;
    return productionNetwork(args,fixture);
  }});
  assert.deepEqual(e.calls,[]);
  await connect(e,SERVICE_URL,false);
  assert.deepEqual(e.calls,[]);assert.deepEqual(writes(e),[]);
  await connect(e);
  assert.deepEqual(requests(e),[['GET','/api/member']]);
  assert.equal(e.get('member-card').attributes['data-view'],'loading');
  assert.equal(e.get('redeem-confirm').disabled,true);
  noBrowserEffects(e);
  gate.resolve();
  await settle(e,()=>e.get('member-card').attributes['data-view']==='empty');
  assert.equal(e.get('account-name').textContent,'l***@fixture.test');
  assert.deepEqual([...e.store],[[CONNECTION,choice]]);
  assert.deepEqual(writes(e).map(row=>row.key),[CONNECTION]);
  noSecrets(e);noBrowserEffects(e);
  const reopened=await create({store:e.store,fixture:e.fixture});
  assert.deepEqual(requests(reopened),[['GET','/api/member']]);
  assert.equal(reopened.get('member-card').attributes['data-view'],'empty');
  assert.deepEqual(writes(reopened),[]);
  assert.deepEqual([...reopened.store],[[CONNECTION,choice]]);
  noBrowserEffects(reopened);
});

test('activation link preflights without redeeming; one trusted confirmation redeems once without session acquisition',async()=>{
  const e=await create();
  await connect(e,ACTIVATION);
  assert.deepEqual(requests(e),[['GET','/api/member'],['POST','/api/preview']]);
  assert.equal(e.get('redeem-preview').hidden,false);
  assert.equal(e.get('redeem-confirm').disabled,false);
  assert.equal(e.fixture.ledger.size,0);
  assert.equal(e.get('service-link').value,'');
  assert.deepEqual([...e.store],[[CONNECTION,choice]]);
  noBrowserEffects(e);noSecrets(e);
  await e.click('redeem-confirm',false);
  assert.equal(e.fixture.ledger.size,0);
  await e.click('redeem-confirm');
  await settle(e,()=>e.fixture.ledger.size===1&&!e.get('refresh').disabled);
  await e.click('redeem-confirm');
  assert.equal(e.calls.filter(row=>row.url===service.endpoints.voucherRedeem).length,1);
  assert.equal(sessions(e).length,0);
  assert.equal(e.fixture.ledger.size,1);
  assert.equal(e.store.get(RECOVERY),null);
  assert.equal(e.get('member-card').attributes['data-view'],'active');
  assert.equal(e.get('redeem-preview').hidden,true);
  assert.equal(e.get('remaining').textContent,'20');
  noBrowserEffects(e);noSecrets(e);
  const reopened=await create({store:e.store,fixture:e.fixture});
  assert.deepEqual(requests(reopened),[['GET','/api/member']]);
  assert.deepEqual(writes(reopened),[]);
  assert.equal(reopened.get('member-card').attributes['data-view'],'active');
  noBrowserEffects(reopened);
});

test('existing assignment logs in through one session request, original setMany and the exact target URL',async()=>{
  const e=await assigned();
  assert.deepEqual(requests(e),[['GET','/api/member']]);
  assert.equal(e.get('site-receive').disabled,false);
  assert.deepEqual(writes(e),[]);noBrowserEffects(e);
  await e.click('site-receive',false);
  assert.equal(sessions(e).length,0);noBrowserEffects(e);
  await e.click('site-receive');
  await settle(e,()=>e.tabCalls.length===1&&!e.get('site-select').disabled);
  assert.equal(sessions(e).length,1);
  assert.equal(e.calls.filter(row=>row.url===service.endpoints.voucherRedeem).length,0);
  assert.deepEqual(e.cookieCalls,[{url:TARGET,cookies}]);
  assert.deepEqual(e.tabCalls,[{url:TARGET}]);
  assert.deepEqual(e.proxyCalls,[]);
  assert.equal(e.store.get(JOURNAL).attempts.at(-1).state,'success');
  noSecrets(e);
  const saved=JSON.stringify([...e.store]);
  const reopened=await create({store:e.store,fixture:e.fixture});
  assert.deepEqual(requests(reopened),[['GET','/api/member']]);
  assert.equal(JSON.stringify([...reopened.store]),saved);
  noBrowserEffects(reopened);
});

test('trusted Cookie cancellation never retries automatically; an explicit confirmation can retry the same delivery',async()=>{
  let cancelled=true;
  const e=await assigned({cookieSetMany:async args=>{
    if(cancelled)throw Object.assign(Error('trusted user cancelled'),{code:'E_COOKIE_NOT_SUBMITTED'});
    return {saved:args.cookies.length,verified:args.cookies.length,
      results:args.cookies.map((_,index)=>({index,saved:true,verified:true}))};
  }});
  await e.click('site-receive');
  await settle(e,()=>e.store.get(JOURNAL)?.attempts.at(-1)?.state==='failed'&&!e.get('cookie-install').disabled);
  const count=e.calls.length;
  await e.flush();await e.flush();
  assert.equal(e.calls.length,count);
  assert.equal(sessions(e).length,1);
  assert.equal(e.cookieCalls.length,1);
  assert.deepEqual(e.tabCalls,[]);
  await e.click('cookie-install',false);
  assert.equal(e.cookieCalls.length,1);
  cancelled=false;await e.click('cookie-install');
  await settle(e,()=>e.tabCalls.length===1);
  assert.equal(e.cookieCalls.length,2);
  assert.equal(sessions(e).length,1);
  assert.deepEqual(e.cookieCalls[1],e.cookieCalls[0]);
  assert.equal(e.store.get(JOURNAL).attempts.at(-1).state,'success');
  assert.deepEqual(e.tabCalls,[{url:TARGET}]);
  assert.deepEqual(e.proxyCalls,[]);noSecrets(e);
});

test('unknown Cookie outcome blocks replay and further acquisition, including after reopen',async()=>{
  const e=await assigned({cookieSetMany:async()=>{throw Object.assign(Error('lost acknowledgement'),{code:'E_CANCELLED'});}});
  await e.click('site-receive');
  await settle(e,()=>e.store.get(JOURNAL)?.attempts.at(-1)?.state==='unknown'&&!e.get('site-select').disabled);
  assert.equal(e.cookieCalls.length,1);
  assert.equal(sessions(e).length,1);
  const saved=JSON.stringify([...e.store]);
  await e.click('cookie-install');await e.click('site-receive');await e.flush();
  assert.equal(e.cookieCalls.length,1);assert.equal(sessions(e).length,1);
  assert.deepEqual(e.tabCalls,[]);assert.deepEqual(e.proxyCalls,[]);
  assert.equal(JSON.stringify([...e.store]),saved);
  const reopened=await create({store:e.store,fixture:e.fixture});
  await reopened.click('site-receive');await reopened.click('cookie-install');
  assert.deepEqual(requests(reopened),[['GET','/api/member']]);
  assert.equal(JSON.stringify([...reopened.store]),saved);
  noBrowserEffects(reopened);noSecrets(reopened);
});

test('offline refresh retains verified member facts as stale and performs no writes or login effects',async()=>{
  let offline=false;
  const e=await assigned({productionNetwork:async(args,fixture)=>{
    if(offline)throw Object.assign(Error('offline'),{code:'E_NETWORK'});
    return productionNetwork(args,fixture);
  }});
  const facts=()=>JSON.stringify(['account-name','remaining','expiry','history-count','history-list']
    .map(id=>{const row=e.get(id);return [row.textContent,row.children];}));
  assert.equal(e.get('member-card').attributes['data-view'],'active');
  const before=facts(),saved=JSON.stringify([...e.store]),count=e.calls.length;
  offline=true;await e.click('refresh');
  assert.equal(e.get('member-card').attributes['data-view'],'stale');
  assert.equal(facts(),before);
  assert.equal(e.get('redeem-confirm').disabled,true);
  await e.preview();await e.click('redeem-confirm');await e.click('site-receive');await e.click('proxy-toggle');
  assert.deepEqual(requests(e).slice(count),[['GET','/api/member']]);
  assert.deepEqual(writes(e),[]);
  assert.equal(JSON.stringify([...e.store]),saved);
  noBrowserEffects(e);
});

test('schema 3 activation lock from another origin cannot be cleared, queried against this service or redeemed',async()=>{
  const recovery={schemaVersion:3,serviceOrigin:'https://previous.example.com',toolId:'ai-vip-share',
    packageVersion:'1.4.32',accountId:'local-fixture-account',idempotencyKey:randomUUID(),createdAt:Date.now()};
  const store=new Map([[CONNECTION,choice],[RECOVERY,recovery]]);
  const e=await create({store,productionNetwork:async(args,fixture)=>{
    if(args.url===service.endpoints.voucherStatus)return {status:200,data:{status:'rejected',final:true,
      accountId:recovery.accountId,idempotencyKey:recovery.idempotencyKey}};
    return productionNetwork(args,fixture);
  }});
  assert.equal(e.get('recovery-check').disabled,true);
  const saved=JSON.stringify([...store]);
  await e.click('recovery-check');await connect(e,ACTIVATION);
  await e.preview();await e.click('redeem-confirm');await e.click('code-clear');
  assert.deepEqual(requests(e),[['GET','/api/member']]);
  assert.deepEqual(writes(e),[]);
  assert.equal(JSON.stringify([...store]),saved);
  assert.deepEqual(store.get(RECOVERY),recovery);
  assert.equal(e.fixture.ledger.size,0);
  noBrowserEffects(e);
});
