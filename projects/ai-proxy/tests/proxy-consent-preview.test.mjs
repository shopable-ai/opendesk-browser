import test from 'node:test';
import assert from 'node:assert/strict';
import {createPreviewProxyConsent} from '../preview/proxy-consent.js';
import {createPreviewBoundary} from '../preview/sdk-preview.js';

const direct={mode:'direct'};
const proxy={mode:'fixed_servers',endpoint:{scheme:'https',host:'proxy.example.com',port:443}};
const trusted={isTrusted:true};

test('preview selection saves without review; cancelled review never applies or remembers',async()=>{
  let accept=false;
  const consent=createPreviewProxyConsent({requestReview:review=>{
    if(!accept)throw Object.assign(Error('cancelled'),{code:'E_CANCELLED'});
    return review.run(trusted);
  }});
  const boundary=createPreviewBoundary('success',{authorize:()=>consent.authorize(direct)});
  const {config,etag}=await boundary.service.load();config.selection={mode:'direct'};
  await boundary.service.save(config,etag);
  assert.equal(consent.reviewCount,0);
  await assert.rejects(boundary.service.apply(config),{code:'E_CANCELLED'});
  assert.equal((await boundary.service.status()).state,'disabled');
  accept=true;await boundary.service.apply(config);
  assert.equal(consent.reviewCount,2,'cancel must not remember consent');
  assert.equal((await boundary.service.status()).browserMode,'direct');
});

test('preview remembers exact route across pause/re-enable, while STOP has no review',async()=>{
  const consent=createPreviewProxyConsent({requestReview:review=>review.run(trusted)});
  const boundary=createPreviewBoundary('success',{authorize:()=>consent.authorize(direct)});
  const {config}=await boundary.service.load();config.selection={mode:'direct'};
  await boundary.service.apply(config);await boundary.service.stop();
  assert.equal((await boundary.service.status()).browserMode,'system');
  await boundary.service.apply(config);
  assert.equal(consent.reviewCount,1);
});

test('preview re-reviews changed routes and revoked grants without losing other exact routes',async()=>{
  const consent=createPreviewProxyConsent({requestReview:review=>review.run(trusted)});
  await consent.authorize(direct);await consent.authorize(proxy);
  await consent.authorize(direct);await consent.authorize(proxy);
  assert.equal(consent.reviewCount,2);
  await consent.authorize({...proxy,endpoint:{...proxy.endpoint,port:8443}});
  assert.equal(consent.reviewCount,3);
  consent.revoke();await consent.authorize(direct);
  assert.equal(consent.reviewCount,4);
});

test('preview uses production review gesture gate; synthetic approval never remembers',async()=>{
  let trustedClick=false;
  const consent=createPreviewProxyConsent({requestReview:review=>review.run({isTrusted:trustedClick})});
  await assert.rejects(consent.authorize(direct),{code:'E_USER_GESTURE_REQUIRED'});
  trustedClick=true;await consent.authorize(direct);
  assert.equal(consent.reviewCount,2);
});

test('remembered preview route still needs review when activation is absent',async()=>{
  let active=true;
  const consent=createPreviewProxyConsent({requestReview:review=>review.run(trusted),hasUserActivation:()=>active});
  await consent.authorize(direct);active=false;await consent.authorize(direct);
  assert.equal(consent.reviewCount,2);
});
