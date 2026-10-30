import test from 'node:test';
import assert from 'node:assert/strict';
import {runtime,deferred,profile,released,fixtureRequest} from './helpers/controller-fixture.mjs';
import {ORDINARY_SITES} from '../src/site-session.js';
import {createScopeKey} from '../src/session-context.js';

const KEY='aiVipSiteSelectionR1',JOURNAL='aiVipCookieDeliveryR137';
const bearer='Bearer disposable_restore_test',cookie='disposable-cookie-secret';
const preference=selection=>({schemaVersion:1,selection});
// Fake the SDK response boundary only. Never listen on the native owner's ports.
async function ordinaryNetwork(args){
  assert.equal(args.config.headers['X-Ordinary-Session-Credential'],bearer);
  const context=ORDINARY_SITES.find(row=>row.source.serviceOrigin===new URL(args.url).origin);
  assert.ok(context);
  const now=Date.now(),expiresAt=now+60000;
  const authorization={sourceId:context.source.sourceId,serviceOrigin:context.source.serviceOrigin,
    serviceRevision:'1',siteId:context.site.siteId,subjectId:'test-subject',authorizationRevision:'1',
    policy:'ordinary',policyVersion:'1',targetUrl:context.site.targetUrl,operationKinds:['setCookies'],
    authorized:true,issuedAt:now-1000,expiresAt:now+3599000};
  if(args.method==='GET')return {status:200,data:{authorization,serverNow:now}};
  const deliveryId='delivery-'+context.key;
  return {status:200,data:{authorization,serverNow:now,displayNameMasked:'o***@fixture.test',
    metadata:{deliveryId,requestId:args.data.requestId,
      scopeKey:createScopeKey(context,authorization,'setCookies',now),serviceRevision:'1',policyVersion:'1',issuedAt:now,expiresAt},
    cookieDelivery:{schemaVersion:1,deliveryId,targetUrl:context.site.targetUrl,expiresAt,
      cookies:context.site.cookieSlots.map(({name,path,secure,httpOnly,sameSite})=>
        ({name,path,secure,httpOnly,sameSite,value:cookie,expirationDate:(now+3600000)/1000}))}}};
}
async function choose(e,value){
  e.get('site-select').value=value;
  e.get('site-select').listeners.change({isTrusted:true});await e.flush();
}
async function settle(e,predicate){
  for(let i=0;i<100&&!predicate();i++)await e.flush();
  assert.ok(predicate(),'operation settles');
}
async function installedReceipts(){
  const e=await runtime({ordinaryNetwork});
  for(const index of [0,1]){
    await choose(e,'ordinary-'+index);
    e.get('source-credential').value=bearer;await e.click('site-receive');
    assert.equal(e.get('cookie-install').hidden,false);
    await e.click('cookie-install');
    await settle(e,()=>e.store.get(JOURNAL)?.attempts.length===index+1&&
      e.store.get(JOURNAL).attempts.at(-1).state==='success'&&!e.get('site-select').disabled);
  }
  return e;
}
function noEffects(e){
  assert.deepEqual(e.calls,[]);assert.deepEqual(e.cookieCalls,[]);
  assert.deepEqual(e.tabCalls,[]);assert.deepEqual(e.proxyCalls,[]);
  assert.equal(e.get('source-credential').value,'');
  assert.equal(e.get('cookie-install').hidden,true);
}

test('reopen restores latest B choice and existing verified v2 receipt without replay or secrets',async()=>{
  const e=await installedReceipts();
  const before=JSON.stringify(e.store.get(JOURNAL));
  assert.equal(e.store.get(JOURNAL).attempts.length,2);
  const reopened=await runtime({store:e.store,ordinaryNetwork});
  assert.equal(reopened.get('site-select').value,'ordinary-1');
  assert.match(reopened.get('site-source').textContent,/127\.0\.0\.1:7902/);
  assert.equal(reopened.get('cookie-section').hidden,false);
  assert.match(reopened.get('cookie-status').textContent,/全部 Cookie 已写入并核验/);
  assert.equal(reopened.get('cookie-results').children.length,2);
  assert.equal(JSON.stringify(e.store.get(JOURNAL)),before);
  noEffects(reopened);
  assert.equal(reopened.storageCalls.filter(row=>row.operation==='storage.set').length,0);
  const saved=JSON.stringify([...e.store]);
  for(const secret of [bearer,cookie])assert.ok(!saved.includes(secret),'storage excludes source secrets');
  assert.deepEqual(e.store.get(KEY),preference('ordinary-1'));
  // A later explicit choice wins over the last successful (B) receipt.
  await choose(reopened,'ordinary-0');
  const latest=await runtime({store:e.store,ordinaryNetwork});
  assert.equal(latest.get('site-select').value,'ordinary-0');noEffects(latest);
  await choose(latest,'');
  const empty=await runtime({store:e.store,ordinaryNetwork});
  assert.equal(empty.get('site-select').value,'');noEffects(empty);
});

test('preference-free existing journals restore last successful fixed site including B',async()=>{
  const e=await installedReceipts();e.store.delete(KEY);
  const reopened=await runtime({store:e.store,ordinaryNetwork});
  assert.equal(reopened.get('site-select').value,'ordinary-1');
  assert.match(reopened.get('cookie-status').textContent,/全部 Cookie 已写入并核验/);
  noEffects(reopened);
});

test('commercial preference waits for the verified directory without replaying a session',async()=>{
  const e=await runtime();
  await e.click('local-connect');await e.preview();await e.click('redeem-confirm');
  await choose(e,'commercial');
  const gate=deferred();
  const reopened=await runtime({store:e.store,fixture:e.fixture,network:async(args,fixture)=>{
    if(args.method==='GET'&&new URL(args.url).pathname==='/api/member')await gate.promise;
    return fixtureRequest(fixture,{...args,headers:args.config.headers});
  }});
  assert.equal(reopened.get('site-select').value,'','preference cannot stand in for a verified directory');
  gate.resolve();await reopened.flush();
  assert.equal(reopened.get('site-select').value,'commercial');
  assert.match(reopened.get('site-source').textContent,/已核验的会员服务/);
  assert.deepEqual(reopened.calls.map(row=>[row.method,new URL(row.url).pathname]),[['GET','/api/member']]);
  assert.deepEqual(reopened.cookieCalls,[]);assert.deepEqual(reopened.tabCalls,[]);
  assert.deepEqual(reopened.proxyCalls,[]);
  assert.equal(reopened.get('cookie-install').hidden,true);
  assert.equal(reopened.storageCalls.filter(row=>row.operation==='storage.set').length,0);
});

test('commercial Cookie scope refusal after ordinary B explains no write and preserves journal',async()=>{
  const e=await installedReceipts();
  const before=JSON.stringify(e.store.get(JOURNAL)),writes=e.cookieCalls.length;
  await e.click('local-connect');
  await e.preview();await e.click('redeem-confirm');
  await settle(e,()=>!e.get('cookie-install').hidden);
  await e.click('cookie-install');
  await settle(e,()=>!e.get('site-select').disabled);
  assert.equal(e.cookieCalls.length,writes,'scope guard refuses before SDK');
  assert.equal(JSON.stringify(e.store.get(JOURNAL)),before,'no new marker or changed receipt');
  assert.match(e.get('cookie-status').textContent,/不同范围.*不能完整替换.*未写入 Cookie/);
  assert.match(e.get('cookie-status').textContent,/独立的浏览器配置/);
  assert.equal(e.get('cookie-install').hidden,true);
  // The existing recoverable pre-start path still allows an explicit acquisition.
  await choose(e,'ordinary-1');assert.equal(e.get('site-receive').disabled,false);
});

test('late preference and journal reads cannot override newer trusted selection',async()=>{
  const e=await installedReceipts(),gate=deferred();
  const reopened=await runtime({store:e.store,ordinaryNetwork,
    beforeStorageGet:async payload=>{if([KEY,JOURNAL].includes(payload.key))await gate.promise;}});
  await choose(reopened,'ordinary-0');
  assert.equal(reopened.get('site-select').value,'ordinary-0');
  gate.resolve();await reopened.flush();
  assert.equal(reopened.get('site-select').value,'ordinary-0');
  assert.deepEqual(e.store.get(KEY),preference('ordinary-0'));noEffects(reopened);
});

test('profile unavailable or lost hides dev selection and receipts, including a late restore',async()=>{
  const e=await installedReceipts();
  const unavailable=await runtime({store:e.store,developmentProfile:null,ordinaryNetwork});
  assert.equal(unavailable.get('site-select').value,'');
  assert.ok(unavailable.get('site-select').children.every(row=>!row.value.startsWith('ordinary-')));
  assert.equal(unavailable.get('cookie-section').hidden,true);noEffects(unavailable);
  const active=await runtime({store:e.store,ordinaryNetwork});
  assert.equal(active.get('site-select').value,'ordinary-1');
  active.setStatus({...released,developmentProfile:null});await active.click('proxy-refresh');
  assert.equal(active.get('site-select').value,'');
  assert.equal(active.get('cookie-section').hidden,true);noEffects(active);
  const gate=deferred();
  const late=await runtime({store:e.store,ordinaryNetwork,
    beforeStorageGet:async payload=>{if(payload.key===KEY)await gate.promise;}});
  late.setStatus({...released,developmentProfile:null});await late.click('proxy-refresh');
  gate.resolve();await late.flush();
  assert.equal(late.get('site-select').value,'');assert.equal(late.get('cookie-section').hidden,true);
  late.setStatus({...released,developmentProfile:profile});await late.click('proxy-refresh');
  assert.equal(late.get('site-select').value,'','profile return does not apply stale restoration');
  noEffects(late);
  await choose(late,'ordinary-1');assert.equal(late.get('site-select').value,'ordinary-1');
});

test('invalid preferences and storage read/write errors leave explicit selection usable without authority',async()=>{
  for(const bad of [preference('https://evil.test/'),{...preference('ordinary-1'),credential:bearer}]){
    const e=await runtime({store:new Map([[KEY,bad]]),ordinaryNetwork});
    assert.equal(e.get('site-select').value,'');
    await choose(e,'ordinary-1');assert.equal(e.get('site-select').value,'ordinary-1');noEffects(e);
    assert.equal(e.storageCalls.filter(row=>row.operation==='storage.set').length,0);
  }
  const failed=await runtime({ordinaryNetwork,beforeStorageGet:async payload=>{
    if(payload.key===KEY)throw Error('storage unavailable');
  }});
  await choose(failed,'ordinary-1');assert.equal(failed.get('site-select').value,'ordinary-1');noEffects(failed);
  // A concurrent owner changes the key after our initial read. CAS must fail closed.
  const e=await runtime({ordinaryNetwork});e.store.set(KEY,preference('ordinary-0'));
  await choose(e,'ordinary-1');
  assert.deepEqual(e.store.get(KEY),preference('ordinary-0'));
  assert.equal(e.get('site-select').value,'ordinary-1');
  assert.match(e.get('site-status').textContent,/未能保存/);noEffects(e);
  await choose(e,'ordinary-0');
  assert.equal(e.storageCalls.filter(row=>row.operation==='storage.set'&&row.key===KEY).length,1,
    'no automatic retry after CAS conflict');
});

test('in-flight saves coalesce in order and untrusted change never persists',async()=>{
  const gate=deferred();let hold=true;
  const e=await runtime({ordinaryNetwork,afterStorageSet:async payload=>{
    if(payload.key===KEY&&hold){hold=false;await gate.promise;}
  }});
  await choose(e,'ordinary-0');await choose(e,'ordinary-1');await choose(e,'ordinary-0');await choose(e,'ordinary-1');
  gate.resolve();await e.flush();
  assert.deepEqual(e.store.get(KEY),preference('ordinary-1'));
  assert.equal(e.storageCalls.filter(row=>row.operation==='storage.set'&&row.key===KEY).length,2);
  e.get('site-select').value='ordinary-0';e.get('site-select').listeners.change({isTrusted:false});await e.flush();
  assert.deepEqual(e.store.get(KEY),preference('ordinary-1'));noEffects(e);
});

test('ambiguous storage acknowledgement never retries or grants authority',async()=>{
  const e=await runtime({ordinaryNetwork,afterStorageSet:async payload=>{
    if(payload.key===KEY)throw Object.assign(Error('ack lost'),{code:'E_OUTCOME_UNKNOWN'});
  }});
  await choose(e,'ordinary-0');await choose(e,'ordinary-1');
  assert.equal(e.get('site-select').value,'ordinary-1');
  assert.deepEqual(e.store.get(KEY),preference('ordinary-0'));
  assert.equal(e.storageCalls.filter(row=>row.operation==='storage.set'&&row.key===KEY).length,1);
  assert.match(e.get('site-status').textContent,/未能保存/);noEffects(e);
});
