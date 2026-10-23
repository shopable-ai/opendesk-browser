import test from 'node:test';
import assert from 'node:assert/strict';
import {createCookieClearIntentGate,COOKIE_CLEAR_INTENT_TTL_MS}
  from '../../src/ui/sidebar-tools/cookie-clear-intent.js';

const url='http://127.0.0.1:43111/account';
const previewRef='12345678-1234-1234-1234-123456789abc';
const doc={tabId:42,windowId:7,documentId:'document-one',url,origin:'http://127.0.0.1:43111'};
const owner='official-cookie-editor|installed-instance|epoch';
const request={owner,url,previewRef,expectedCount:2,grantEpoch:'grant-one',document};
const execution={...request,maxCookies:50};

test('first real clear-confirmation click consumes one exact Host-only intent, not another dialog',()=>{
  let now=1000;
  const gate=createCookieClearIntentGate({now:()=>now});
  assert.deepEqual(gate.start({...request,verifiedUserActivation:true}),{
    authorized:true,ref:1,expiresAt:1000+COOKIE_CLEAR_INTENT_TTL_MS
  });
  assert.equal(gate.consume(execution),true);
  assert.equal(gate.consume(execution),false,'replayed Cookie cleanup has no privilege');
  assert.equal(gate.close(owner,1).closed,false,'used authorization cannot be replayed');
});

test('untrusted or invalid clear confirmation cannot mint or consume a Host intent',()=>{
  const gate=createCookieClearIntentGate();
  assert.throws(()=>gate.start({...request,verifiedUserActivation:false}),
    {code:'E_USER_GESTURE_REQUIRED'});
  assert.throws(()=>gate.start({...request,previewRef:'forged',verifiedUserActivation:true}),
    {code:'E_SCHEMA'});
  assert.throws(()=>gate.start({...request,expectedCount:51,verifiedUserActivation:true}),
    {code:'E_SCHEMA'});
  assert.throws(()=>gate.start({...request,url:'file:///etc/passwd',verifiedUserActivation:true}),
    {code:'E_SCHEMA'});
  assert.equal(gate.consume(execution),false);
});

test('changed Cookie preview, count, bounds, grant or document burns intent without native execution',()=>{
  const changes=[
    {previewRef:'f0000000-0000-4000-8000-000000000000'},
    {expectedCount:1},{maxCookies:49},{url:'http://127.0.0.1:43111/changed'},
    {grantEpoch:'regranted'},
    {document:{...doc,documentId:'document-two'}},
    {document:{...doc,url:'http://127.0.0.1:43111/redirect'}}
  ];
  for(const change of changes){
    const gate=createCookieClearIntentGate();
    gate.start({...request,verifiedUserActivation:true});
    assert.throws(()=>gate.consume({...execution,...change}),{code:'E_DOCUMENT_CHANGED'},
      JSON.stringify(change));
    assert.equal(gate.consume(execution),false,'a forged attempt consumes the original scope');
  }
});

test('clear authorizations expire and are revoked when site, tool or Browser grant changes',()=>{
  let now=1000;const gate=createCookieClearIntentGate({now:()=>now});
  gate.start({...request,verifiedUserActivation:true});
  assert.throws(()=>gate.start({...request,verifiedUserActivation:true}),{code:'E_BUSY'});
  now+=COOKIE_CLEAR_INTENT_TTL_MS;
  assert.throws(()=>gate.consume(execution),{code:'E_DOCUMENT_CHANGED'});
  assert.equal(gate.consume(execution),false);
  gate.start({...request,verifiedUserActivation:true});
  gate.revoke();
  assert.equal(gate.consume(execution),false);
});

test('retiring confirmed dialog cannot cancel a different tool or create a wider right',()=>{
  const gate=createCookieClearIntentGate();
  const receipt=gate.start({...request,verifiedUserActivation:true});
  assert.equal(gate.consume({...execution,owner:'forged-other-tool'}),false);
  assert.equal(gate.close('forged-other-tool',receipt.ref).closed,false);
  assert.deepEqual(gate.close(owner,receipt.ref),{closed:true});
  assert.equal(gate.consume(execution),false);
});
