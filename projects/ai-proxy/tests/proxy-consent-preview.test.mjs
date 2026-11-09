import test from 'node:test';
import assert from 'node:assert/strict';
import {createPreviewProxyConsent} from '../preview/proxy-consent.js';
import {createPreviewBoundary} from '../preview/sdk-preview.js';

const direct={mode:'direct'};
const proxy={mode:'fixed_servers',endpoint:{scheme:'https',host:'proxy.example.com',port:443}};
const trusted={isTrusted:true};

test('preview direct selection only saves; explicit Apply and pause/re-enable need no modal',async()=>{
  const consent=createPreviewProxyConsent({requestReview(){assert.fail('Direct must not open a modal');}});
  const boundary=createPreviewBoundary('success',{authorize:()=>consent.authorize(direct)});
  const {config,etag}=await boundary.service.load();config.selection={mode:'direct'};
  await boundary.service.save(config,etag);
  assert.equal((await boundary.service.status()).state,'disabled');
  await boundary.service.apply(config);
  assert.equal((await boundary.service.status()).browserMode,'direct');
  await boundary.service.stop();
  assert.equal((await boundary.service.status()).browserMode,'system');
  await boundary.service.apply(config);
  assert.equal(consent.reviewCount,0);
});

test('preview still reviews changed proxy routes, cancellation and revocation',async()=>{
  let accept=false;
  const consent=createPreviewProxyConsent({requestReview:review=>{
    if(!accept)throw Object.assign(Error('cancelled'),{code:'E_CANCELLED'});
    return review.run(trusted);
  }});
  await assert.rejects(consent.authorize(proxy),{code:'E_CANCELLED'});
  accept=true;await consent.authorize(proxy);await consent.authorize(proxy);
  assert.equal(consent.reviewCount,2,'cancel must not remember the proxy route');
  await consent.authorize(direct);assert.equal(consent.reviewCount,2);
  await consent.authorize({...proxy,endpoint:{...proxy.endpoint,port:8443}});
  assert.equal(consent.reviewCount,3);
  consent.revoke();await consent.authorize(proxy);
  assert.equal(consent.reviewCount,4);
});

test('synthetic proxy review cannot remember; missing direct activation cannot enable or open a modal',async()=>{
  let active=true,trustedClick=false;
  const consent=createPreviewProxyConsent({requestReview:review=>review.run({isTrusted:trustedClick}),hasUserActivation:()=>active});
  await assert.rejects(consent.authorize(proxy),{code:'E_USER_GESTURE_REQUIRED'});
  trustedClick=true;await consent.authorize(proxy);
  assert.equal(consent.reviewCount,2);
  active=false;await assert.rejects(consent.authorize(direct),{code:'E_USER_GESTURE_REQUIRED'});
  assert.equal(consent.reviewCount,2);
});
