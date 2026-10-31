import test from 'node:test';
import assert from 'node:assert/strict';
import {runtime,profile} from './helpers/controller-fixture.mjs';

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
