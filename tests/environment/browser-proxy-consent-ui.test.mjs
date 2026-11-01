import test from 'node:test';
import assert from 'node:assert/strict';
import {requestManagedProxyIntent,createManagedProxyActionGate} from '../../src/ui/sidebar-tools/managed-proxy-consent.js';

const operation='browser.proxy.managed.requestEnable',payload={config:{mode:'direct'}};
function fixture({remembered=false,active=true,denied=false}={}){
  const messages=[],reviews=[];
  const api={runtime:{sendMessage:async request=>{
    messages.push(request);
    if(denied)return {ok:false,error:{code:'E_TOOL_CHANGED'}};
    if(request.proxyConsent==='reuse'&&!remembered)
      return {ok:false,error:{code:'E_PROXY_CONSENT_REQUIRED'}};
    remembered=true;return {ok:true,data:{approvalRef:'intent-'+messages.length}};
  }}};
  const run=(op=operation,extra={})=>requestManagedProxyIntent({api,
    identity:{toolId:'proxy-probe'},title:'Proxy probe',operation:op,payload,
    hasUserActivation:active,assertCurrent(){},
    requestReview:async review=>{reviews.push(review);return review.run({isTrusted:true});},...extra});
  return {run,messages,reviews};
}
test('first exact route review is remembered, subsequent Apply uses no second review',async()=>{
  const f=fixture();assert.equal(await f.run(),'intent-2');
  assert.equal(f.reviews.length,1);assert.equal(f.messages[1].proxyConsent,'remember');
  assert.equal(await f.run(),'intent-3');assert.equal(f.reviews.length,1);
});
test('owned STOP has zero reviews and still requests an exact one-use Host intent',async()=>{
  const f=fixture();await f.run('browser.proxy.managed.requestDisable');
  assert.equal(f.reviews.length,0);assert.equal(f.messages.length,1);
  assert.equal(f.messages[0].targetOperation,'browser.proxy.managed.requestDisable');
});
test('missing activation cannot silently enable even a remembered route',async()=>{
  const f=fixture({remembered:true,active:false});await f.run();
  assert.equal(f.reviews.length,1);
  assert.equal(f.messages.length,1);
});
test('untrusted review and changed installation never mint fallback approvals',async()=>{
  const f=fixture({active:false});
  await assert.rejects(f.run(operation,{requestReview:review=>review.run({isTrusted:false})}),
    error=>error.code==='E_USER_GESTURE_REQUIRED');
  assert.equal(f.messages.length,0);
  const g=fixture({denied:true});
  await assert.rejects(g.run(),error=>error.code==='E_TOOL_CHANGED');
  assert.equal(g.reviews.length,0);assert.equal(g.messages.length,1);
});

test('STOP and revoke fence earlier ENABLE before admission, during consent and before final RPC',async()=>{
  const gate=createManagedProxyActionGate(),stale=error=>error.code==='E_PROXY_ACTION_CANCELLED';
  const beforeAdmission=gate.begin('proxy-probe',operation);
  gate.stop('proxy-probe');
  assert.throws(beforeAdmission.assertCurrent,stale);
  const duringConsent=gate.begin('proxy-probe',operation),f=fixture({active:false});
  await assert.rejects(f.run(operation,{assertCurrent:duringConsent.assertCurrent,
    requestReview:review=>{gate.stop('proxy-probe');return review.run({isTrusted:true});}}),stale);
  assert.equal(f.messages.length,0,'a cancelled review cannot remember consent or mint an intent');
  const beforeRPC=gate.begin('proxy-probe',operation),g=fixture({remembered:true});
  await g.run(operation,{assertCurrent:beforeRPC.assertCurrent});
  gate.begin('proxy-probe','browser.proxy.managed.requestDisable');
  assert.throws(beforeRPC.assertCurrent,stale);
  const newer=gate.begin('proxy-probe',operation);newer.assertCurrent();
  gate.stop('other-tool');newer.assertCurrent();
});

test('STOP while a reuse denial is pending terminates without opening a fallback review',async()=>{
  const gate=createManagedProxyActionGate(),action=gate.begin('proxy-probe',operation),f=fixture();
  const api={runtime:{sendMessage:async()=>{gate.stop('proxy-probe');
    return {ok:false,error:{code:'E_PROXY_CONSENT_REQUIRED'}};}}};
  await assert.rejects(f.run(operation,{api,assertCurrent:action.assertCurrent}),
    error=>error.code==='E_PROXY_ACTION_CANCELLED');
  assert.equal(f.reviews.length,0);
});
