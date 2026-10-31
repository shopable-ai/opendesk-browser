import test from 'node:test';
import assert from 'node:assert/strict';
import {runtime,profile,owned,released,PREFERENCE,fixtureRequest} from './helpers/controller-fixture.mjs';
import {ORDINARY_SITES} from '../src/site-session.js';
import {createScopeKey} from '../src/session-context.js';

const JOURNAL='aiVipCookieDeliveryR137';
const credential='Bearer offline-regression-disposable',secret='offline-cookie-disposable';
const offline=()=>{throw Object.assign(Error('service offline'),{code:'E_NETWORK'});};
const requests=e=>e.calls.map(row=>[row.method,new URL(row.url).pathname]);
async function settle(e,predicate){
  for(let i=0;i<100&&!predicate();i++)await e.flush();
  assert.ok(predicate(),'user operation settles');
}
function noEffects(e){
  assert.deepEqual(e.cookieCalls,[]);assert.deepEqual(e.tabCalls,[]);assert.deepEqual(e.proxyCalls,[]);
  assert.equal(e.get('source-credential').value,'');
  assert.equal(e.get('cookie-install').hidden,true);
}
function verifiedCookieRows(e){
  const rows=e.get('cookie-results').children;
  assert.equal(rows.length,2,'both Cookie result rows are visible');
  for(const [index,row] of rows.entries()){
    assert.equal(row.children[0].textContent,'第 '+(index+1)+' 项');
    assert.equal(row.children[1].textContent,'已写入并核验');
  }
}
// Only the SDK network boundary is simulated; the real controller builds and
// validates its own delivery journal. No fixture listens on the native ports.
async function ordinaryNetwork(args){
  assert.equal(args.config.headers['X-Ordinary-Session-Credential'],credential);
  const context=ORDINARY_SITES.find(row=>row.source.serviceOrigin===new URL(args.url).origin);
  assert.ok(context);
  const now=Date.now(),expiresAt=now+60000;
  const authorization={sourceId:context.source.sourceId,serviceOrigin:context.source.serviceOrigin,
    serviceRevision:'1',siteId:context.site.siteId,subjectId:'offline-test',authorizationRevision:'1',
    policy:'ordinary',policyVersion:'1',targetUrl:context.site.targetUrl,operationKinds:['setCookies'],
    authorized:true,issuedAt:now-1000,expiresAt:now+3599000};
  if(args.method==='GET')return {status:200,data:{authorization,serverNow:now}};
  return {status:200,data:{authorization,serverNow:now,displayNameMasked:'o***@fixture.test',
    metadata:{deliveryId:'offline-delivery',requestId:args.data.requestId,
      scopeKey:createScopeKey(context,authorization,'setCookies',now),serviceRevision:'1',policyVersion:'1',issuedAt:now,expiresAt},
    cookieDelivery:{schemaVersion:1,deliveryId:'offline-delivery',targetUrl:context.site.targetUrl,expiresAt,
      cookies:context.site.cookieSlots.map(({name,path,secure,httpOnly,sameSite})=>
        ({name,path,secure,httpOnly,sameSite,value:secret,expirationDate:(now+3600000)/1000}))}}};
}

test('offline reopen restores ordinary choice and successful history, never session authority',async()=>{
  const previous=await runtime({ordinaryNetwork});
  await previous.click('local-connect');
  await previous.chooseSite('ordinary-1');
  previous.get('source-credential').value=credential;await previous.click('site-receive');
  await settle(previous,()=>!previous.get('cookie-install').hidden);
  await previous.click('cookie-install');
  await settle(previous,()=>previous.store.get(JOURNAL)?.attempts.at(-1)?.state==='success'&&
    !previous.get('site-select').disabled);
  verifiedCookieRows(previous);
  assert.deepEqual(previous.store.get(PREFERENCE),{schemaVersion:1,enabled:true});
  const saved=JSON.stringify([...previous.store]);
  for(const value of [credential,secret])assert.ok(!saved.includes(value));
  const e=await runtime({store:previous.store,network:offline,ordinaryNetwork:offline});
  assert.equal(e.get('member-card').attributes['data-view'],'failed');
  assert.match(e.get('member-state').textContent,/无法核验/);
  assert.match(e.get('redeem-status').textContent,/兑换已暂停/);
  assert.equal(e.get('refresh').disabled,false);
  assert.equal(e.get('sites-section').hidden,false);
  assert.equal(e.get('site-select').value,'ordinary-1');
  assert.match(e.get('site-source').textContent,/127\.0\.0\.1:7902/);
  assert.match(e.get('cookie-status').textContent,/全部 Cookie 已写入并核验/);
  assert.match(e.get('site-account').textContent,/尚未取得会话/);
  verifiedCookieRows(e);
  assert.equal(JSON.stringify([...e.store]),saved);
  assert.deepEqual(requests(e),[['GET','/api/member']]);noEffects(e);
  // The real click handler must reject absent credentials even with success history.
  await e.click('site-receive');
  assert.deepEqual(requests(e),[['GET','/api/member']]);noEffects(e);
  assert.equal(e.get('redeem').disabled,true);
});

test('failed refresh keeps last verified member and history as stale read-only facts',async()=>{
  let disconnected=false;
  const e=await runtime({network:async(args,fixture)=>disconnected?offline():
    fixtureRequest(fixture,{...args,headers:args.config.headers})});
  await e.click('local-connect');await e.preview();await e.click('redeem-confirm');
  await settle(e,()=>e.get('history-list').children.length>0&&!e.get('refresh').disabled);
  const facts=()=>JSON.stringify(['account-name','remaining','expiry','history-count','history-list']
    .map(id=>{const n=e.get(id);return [n.textContent,n.children];}));
  assert.equal(e.get('member-card').attributes['data-view'],'active');
  assert.equal(e.get('proxy-toggle').hidden,false);
  assert.equal(e.get('proxy-toggle').disabled,false);
  const before=facts(),count=e.calls.length;
  disconnected=true;await e.click('refresh');
  assert.equal(e.get('member-card').attributes['data-view'],'stale');
  assert.equal(facts(),before);
  assert.match(e.get('verified').textContent,/上次服务端核验.*当前状态待核验/);
  assert.match(e.get('product-name').textContent,/上次核验.*当前状态待核验/);
  assert.equal(e.get('history-details').hidden,false);
  assert.equal(e.get('redeem').disabled,true);
  assert.equal(e.get('redeem-confirm').disabled,true);
  assert.equal(e.get('proxy-toggle').hidden,true);
  assert.equal(e.get('proxy-toggle').disabled,true);
  assert.deepEqual(requests(e).slice(count),[['GET','/api/member']]);
  await e.preview();await e.click('redeem-confirm');await e.click('proxy-toggle');
  assert.deepEqual(requests(e).slice(count),[['GET','/api/member']]);noEffects(e);
});

for(const mode of ['offline','missing-profile','missing-provider'])for(const lostAck of [false,true]){
  test(`owned STOP stays reachable with ${mode}; release acknowledgement ${lostAck?'lost':'confirmed'}`,async()=>{
    let releaseVisible=false;
    const statusReads=[];
    const developmentProfile=mode==='missing-profile'?null:profile;
    const e=await runtime({developmentProfile,getStatus:async()=>{
      const status={...(releaseVisible?released:owned),developmentProfile};
      statusReads.push(status);return status;
    },
      store:new Map(mode==='missing-provider'?[]:[[PREFERENCE,{schemaVersion:1,enabled:true}]]),network:offline,
      ...(lostAck?{proxyDisable:async()=>{
        releaseVisible=true;
        throw Object.assign(Error('disable acknowledgement lost'),{code:'E_OUTCOME_UNKNOWN'});
      }}:{})});
    assert.equal(e.get('proxy-toggle').hidden,false);
    assert.equal(e.get('proxy-toggle').disabled,false);
    assert.equal(e.get('proxy-toggle').attributes['data-action'],'stop');
    await e.click('proxy-toggle');
    assert.deepEqual(e.proxyCalls,[{action:'disable'}]);
    assert.deepEqual(e.cookieCalls,[]);assert.deepEqual(e.tabCalls,[]);
    assert.deepEqual(requests(e),mode==='offline'?[['GET','/api/member']]:[]);
    if(lostAck){
      assert.notEqual(e.get('proxy-state').textContent,'已停止');
      assert.match(e.get('proxy-alert-text').textContent,/STOP.*待确认/);
      assert.equal(e.get('proxy-toggle').attributes['data-action'],'stop');
      assert.equal(e.get('proxy-toggle').disabled,false);
      const before=statusReads.length;
      await e.click('proxy-refresh');
      assert.equal(statusReads.length,before+1,'the user refresh reads the current SDK state');
      assert.deepEqual(statusReads.at(-1),{...released,developmentProfile});
      assert.notEqual(e.get('proxy-state').textContent,'已停止','a later disabled status is not the lost STOP acknowledgement');
      assert.equal(e.get('proxy-toggle').hidden,false);
      assert.equal(e.get('proxy-toggle').disabled,false);
      assert.equal(e.get('proxy-toggle').attributes['data-action'],'stop');
    }else assert.equal(e.get('proxy-state').textContent,'已停止');
    assert.deepEqual(e.proxyCalls,[{action:'disable'}],'no automatic enable or disable retry');
  });
}
