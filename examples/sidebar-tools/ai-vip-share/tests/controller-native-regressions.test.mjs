import test from 'node:test';
import assert from 'node:assert/strict';
import {runtime,profile,deferred,fixtureRequest} from './helpers/controller-fixture.mjs';

test('START reuses the exact route returned by the trusted development profile',async()=>{
  const approved={...profile,domains:[...profile.domains].sort()};
  const e=await runtime({developmentProfile:approved});
  await e.click('local-connect');await e.preview();await e.click('redeem-confirm');
  await e.click('proxy-toggle');
  assert.equal(e.proxyCalls.length,1);
  assert.deepEqual(e.proxyCalls[0].config,approved,'the remembered Host route must match the submitted route');
});

for(const moveElsewhere of [false,true])test(`trusted Cookie cancellation ${moveElsewhere?'preserves a newer focus choice':'returns focus to its original action'}`,async()=>{
  const body={},other={},documentState={activeElement:null,body,hasFocus:()=>true};
  const e=await runtime({documentState,cookieSetMany:async()=>{
    documentState.activeElement=moveElsewhere?other:body;
    throw Object.assign(Error('cancelled in trusted review'),{code:'E_COOKIE_NOT_SUBMITTED'});
  }});
  await e.click('local-connect');await e.preview();await e.click('redeem-confirm');
  const button=e.get('cookie-install');button.isConnected=true;
  let focuses=0;button.focus=()=>{focuses++;documentState.activeElement=button;};
  documentState.activeElement=button;
  await e.click('cookie-install');
  for(let i=0;i<100&&e.toolStates.at(-1)?.busy;i++)await e.flush();
  assert.match(e.get('cookie-status').textContent,/已取消 Cookie 确认，未提交写入/);
  assert.equal(e.store.get('aiVipCookieDeliveryR137').attempts.at(-1).resolution,'not-submitted');
  assert.equal(focuses,moveElsewhere?0:1);
  assert.equal(documentState.activeElement,moveElsewhere?other:button);
  assert.equal(e.cookieCalls.length,1,'cancellation never retries the SDK call');
  assert.equal(e.tabCalls.length,0);
});


// Only external SDK boundaries are simulated; the mounted controller and journal are real.
import {ORDINARY_SITES} from '../src/site-session.js';
import {createScopeKey} from '../src/session-context.js';

for(const outcome of ['success','trusted-cancel','preflight-failure'])test(`ordinary Cookie ${outcome} releases member refresh without replay`,async()=>{
  const preflight=deferred(),member=deferred();
  let holdPreflight=false,holdMember=false;
  const ordinaryNetwork=async args=>{
    if(holdPreflight){
      await preflight.promise;
      if(outcome==='preflight-failure')throw Error('authorization unavailable');
    }
    const context=ORDINARY_SITES[1],now=Date.now(),expiresAt=now+60000;
    const authorization={sourceId:context.source.sourceId,serviceOrigin:context.source.serviceOrigin,
      serviceRevision:'1',siteId:context.site.siteId,subjectId:'test-subject',authorizationRevision:'1',
      policy:'ordinary',policyVersion:'1',targetUrl:context.site.targetUrl,operationKinds:['setCookies'],
      authorized:true,issuedAt:now-1000,expiresAt:now+3599000};
    if(args.method==='GET')return {status:200,data:{authorization,serverNow:now}};
    const deliveryId='refresh-regression-delivery';
    return {status:200,data:{authorization,serverNow:now,displayNameMasked:'o***@fixture.test',
      metadata:{deliveryId,requestId:args.data.requestId,
        scopeKey:createScopeKey(context,authorization,'setCookies',now),serviceRevision:'1',policyVersion:'1',issuedAt:now,expiresAt},
      cookieDelivery:{schemaVersion:1,deliveryId,targetUrl:context.site.targetUrl,expiresAt,
        cookies:context.site.cookieSlots.map(({name,path,secure,httpOnly,sameSite})=>({name,path,secure,httpOnly,sameSite,value:'disposable-cookie',expirationDate:(now+3600000)/1000}))}}};
  };
  const e=await runtime({ordinaryNetwork,network:async(args,fixture)=>{
    if(holdMember)await member.promise;
    return fixtureRequest(fixture,{...args,headers:args.config.headers});
  },cookieSetMany:async args=>{
    if(outcome==='trusted-cancel')throw Object.assign(Error('trusted cancellation'),{code:'E_COOKIE_NOT_SUBMITTED'});
    return {saved:args.cookies.length,verified:args.cookies.length,
      results:args.cookies.map((_,index)=>({index,saved:true,verified:true}))};
  }});
  await e.click('local-connect');await e.chooseSite('ordinary-1');
  e.get('source-credential').value='Bearer disposable_refresh_test';await e.click('site-receive');
  assert.equal(e.get('cookie-install').disabled,false);
  holdPreflight=true;await e.click('cookie-install');
  assert.equal(e.get('refresh').disabled,true,'Cookie preflight blocks member refresh');
  const inFlight=e.calls.length;
  // Real disabled DOM buttons do not dispatch clicks; mirror that boundary in this helper.
  if(!e.get('refresh').disabled)await e.click('refresh');
  assert.equal(e.calls.length,inFlight);
  preflight.resolve();
  for(let i=0;i<100&&e.toolStates.at(-1)?.busy;i++)await e.flush();
  assert.equal(e.toolStates.at(-1)?.busy,false);
  assert.equal(e.cookieCalls.length,outcome==='preflight-failure'?0:1);
  if(outcome==='success')assert.equal(e.store.get('aiVipCookieDeliveryR137').attempts.at(-1).state,'success');
  if(outcome==='trusted-cancel')assert.equal(e.store.get('aiVipCookieDeliveryR137').attempts.at(-1).resolution,'not-submitted');
  if(outcome==='preflight-failure')assert.match(e.get('cookie-status').textContent,/Cookie 未提交/);
  assert.equal(e.get('refresh').disabled,false,'settled Cookie operation restores manual refresh');
  const before=e.calls.length,cookies=e.cookieCalls.length,tabs=e.tabCalls.length;
  holdMember=true;await e.click('refresh');
  assert.equal(e.get('refresh').disabled,true,'member GET remains disabled while pending');
  await e.click('refresh');
  assert.equal(e.calls.length,before+1,'repeated refresh cannot stack requests');
  member.resolve();await e.flush();
  assert.equal(e.get('refresh').disabled,false);
  assert.deepEqual(e.calls.slice(before).map(({method,url})=>[method,url]),[['GET','http://127.0.0.1:7898/api/member']]);
  assert.equal(e.cookieCalls.length,cookies,'refresh never repeats Cookie submission');
  assert.equal(e.tabCalls.length,tabs);
});

test('shared session acquisition keeps member refresh disabled until it settles',async()=>{
  const gate=deferred();let hold=false;
  const e=await runtime({network:async(args,fixture)=>{
    if(hold&&args.data?.operation==='sharedSession')await gate.promise;
    return fixtureRequest(fixture,{...args,headers:args.config.headers});
  }});
  await e.click('local-connect');await e.preview();await e.click('redeem-confirm');
  hold=true;await e.click('shared-receive');
  assert.equal(e.get('refresh').disabled,true,'shared session in flight blocks refresh');
  gate.resolve();await e.flush();
  assert.equal(e.get('refresh').disabled,false);
});

test('successful manual member refresh clears the stale post-redemption refresh failure only after verification',async()=>{
  let disconnected=false,hold=false;
  const gate=deferred();
  const e=await runtime({network:async(args,fixture)=>{
    if(disconnected)throw Error('member service offline');
    if(hold)await gate.promise;
    const result=await fixtureRequest(fixture,{...args,headers:args.config.headers});
    if(new URL(args.url).pathname==='/api/redeem')disconnected=true;
    return result;
  }});
  // Keep this member operation independent of commercial website acquisition.
  await e.chooseSite('ordinary-1');
  await e.click('local-connect');await e.preview();await e.click('redeem-confirm');
  const failure=e.get('redeem-status').textContent;
  assert.match(failure,/服务端已确认兑换成功，但权益刷新失败/);
  assert.equal(e.fixture.ledger.size,1);
  await e.click('refresh');
  assert.equal(e.get('redeem-status').textContent,failure,'a failed retry must retain the warning');
  const before=e.calls.length,ledger=JSON.stringify([...e.fixture.ledger]);
  disconnected=false;hold=true;await e.click('refresh');
  assert.equal(e.get('refresh').disabled,true);
  assert.equal(e.get('redeem-status').textContent,failure,'starting a GET does not prove recovery');
  gate.resolve();await e.flush();
  assert.equal(e.get('remaining').textContent,'20');
  assert.equal(e.get('history-count').textContent,'1 条');
  assert.equal(e.get('refresh').disabled,false);
  assert.match(e.get('redeem-status').textContent,/输入兑换码并预检/);
  assert.equal(e.get('redeem-error').hidden,true);
  assert.deepEqual(e.calls.slice(before).map(({method,url})=>[method,new URL(url).pathname]),[['GET','/api/member']]);
  assert.equal(JSON.stringify([...e.fixture.ledger]),ledger);
  assert.deepEqual(e.cookieCalls,[]);assert.deepEqual(e.tabCalls,[]);assert.deepEqual(e.proxyCalls,[]);
});

test('successful member refresh cannot resolve an unknown redemption or erase its warning',async()=>{
  const e=await runtime({network:async(args,fixture)=>{
    const result=await fixtureRequest(fixture,{...args,headers:args.config.headers});
    if(new URL(args.url).pathname==='/api/redeem')throw Error('receipt lost after server commit');
    return result;
  }});
  await e.chooseSite('ordinary-1');
  await e.click('local-connect');await e.preview();await e.click('redeem-confirm');
  const warning=e.get('redeem-status').textContent;
  assert.match(warning,/兑换结果未确认/);
  const journal=JSON.stringify(e.store.get('aiVipRedeemR52')),before=e.calls.length;
  await e.click('refresh');
  assert.equal(e.get('remaining').textContent,'20');
  assert.equal(e.get('redeem-status').textContent,warning);
  assert.equal(e.get('redeem-error').hidden,false);
  assert.equal(e.get('recovery').hidden,false);
  assert.equal(e.get('redeem-code').disabled,true);
  assert.equal(JSON.stringify(e.store.get('aiVipRedeemR52')),journal);
  assert.deepEqual(e.calls.slice(before).map(({method,url})=>[method,new URL(url).pathname]),[['GET','/api/member']]);
  assert.equal(e.fixture.ledger.size,1);assert.deepEqual(e.cookieCalls,[]);
});

test('successful member refresh preserves a recovery storage fault and its error lock',async()=>{
  let fault=false;
  const e=await runtime({beforeStorageGet:async({key})=>{
    if(fault&&key==='aiVipRedeemR52')throw Error('storage unavailable');
  }});
  await e.click('local-connect');await e.preview();fault=true;await e.click('redeem-confirm');
  assert.equal(e.get('recovery').hidden,false);
  const warning=e.get('redeem-status').textContent;
  assert.match(warning,/无法确认本地兑换状态/);
  await e.click('refresh');
  assert.equal(e.get('refresh').disabled,false);
  assert.equal(e.get('redeem-status').textContent,warning);
  assert.equal(e.get('redeem-error').hidden,false);
  assert.equal(e.get('recovery').hidden,false);
  assert.equal(e.get('redeem-code').disabled,true);
  assert.equal(e.fixture.ledger.size,0);
});

// Use the journal's real byte budget, including its current storage codec.
import {createHash} from 'node:crypto';
import {COOKIE_JOURNAL_KEY,readCookieJournal,reserveCookieAttempt,saveCookieReceipt} from '../src/cookie-journal.js';

test('full bounded Cookie journal reports capacity before dispatch and preserves every original record',async()=>{
  const e=await runtime();
  await e.click('local-connect');await e.preview();await e.click('redeem-confirm');
  await e.click('cookie-install');
  for(let i=0;i<100&&e.toolStates.at(-1)?.busy;i++)await e.flush();
  assert.equal(e.cookieCalls.length,1);
  const request=async(operation,args)=>{
    const value=e.store.get(args.key)??null;
    const etag=createHash('sha256').update(JSON.stringify(value)).digest('hex');
    if(operation==='storage.get')return {value:structuredClone(value),etag};
    assert.equal(operation,'storage.set');assert.equal(args.ifMatch,etag);
    assert.ok(Buffer.byteLength(JSON.stringify(args.value))<=8192,'same bounded storage contract');
    e.store.set(args.key,structuredClone(args.value));return {saved:true};
  };
  const template=(await readCookieJournal(request)).value.attempts[0];
  let full=false;
  for(let i=0;i<100;i++){
    try{
      const next=await reserveCookieAttempt(request,{...template,requestId:'r'+i,deliveryId:'d'+i,
        state:'unknown',resolution:'pending',results:[]});
      await saveCookieReceipt(request,next.reference,{notInvoked:true});
    }catch(error){assert.equal(error.code,'E_COOKIE_LIMIT');full=true;break;}
  }
  assert.equal(full,true,'reach the actual finite byte budget');
  const saved=JSON.stringify(e.store.get(COOKIE_JOURNAL_KEY));
  const decoded=JSON.stringify((await readCookieJournal(request)).value);
  await e.click('shared-receive');
  assert.equal(e.get('cookie-install').disabled,false);
  const before=e.cookieCalls.length,tabs=e.tabCalls.length;
  await e.click('cookie-install');
  for(let i=0;i<100&&e.toolStates.at(-1)?.busy;i++)await e.flush();
  assert.equal(e.get('cookie-status').textContent,'恢复记录容量不足，未提交Cookie；原记录已保留');
  assert.equal(e.cookieCalls.length,before,'capacity failure must occur before Cookie SDK dispatch');
  assert.equal(e.tabCalls.length,tabs);
  assert.equal(JSON.stringify(e.store.get(COOKIE_JOURNAL_KEY)),saved);
  assert.equal(JSON.stringify((await readCookieJournal(request)).value),decoded);
  assert.equal(e.get('refresh').disabled,false);
});
