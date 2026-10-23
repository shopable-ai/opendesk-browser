import test from 'node:test';
import assert from 'node:assert/strict';
import {MANAGED_SITE_REVIEWED_SCOPE_STORE,reviewedManagedSiteScopeCovers,
  extendReviewedManagedSiteScopes,managedSiteV3RequiredOrigins}
  from '../../src/framework/host/managed-site-reviewed-scopes.js';

const hash='a'.repeat(64),epoch='epoch-one';
const site=(host,subdomains=false)=>({host,subdomains,enabled:true,
  pool:'s:'+host,conditions:[{type:'counter-limit',limitMs:60000}]});
const policy=(sites,enabled=true)=>({kind:'site-budget.v3',enabled,
  sites,whitelist:[]});
test('an extension-wide native grant never substitutes app+epoch+hash-specific review',()=>{
  const wanted=policy([site('video.example.com',true)]);
  assert.equal(MANAGED_SITE_REVIEWED_SCOPE_STORE,'opendesk.browser.site-budget.reviewed-sites.v1');
  assert.equal(reviewedManagedSiteScopeCovers(undefined,'stay-focus',epoch,hash,wanted),false);
  const updated=extendReviewedManagedSiteScopes(undefined,{
    id:'stay-focus',installEpoch:epoch,packageHash:hash,policy:wanted});
  assert.equal(reviewedManagedSiteScopeCovers(updated,'stay-focus',epoch,hash,wanted),true);
  assert.equal(reviewedManagedSiteScopeCovers(updated,'stay-focus','other-epoch',hash,wanted),false);
  assert.equal(reviewedManagedSiteScopeCovers(updated,'stay-focus',epoch,'b'.repeat(64),wanted),false);
  assert.equal(reviewedManagedSiteScopeCovers(updated,'other-app',epoch,hash,wanted),false);
  assert.equal(reviewedManagedSiteScopeCovers(updated,'stay-focus',epoch,hash,
    policy([site('new.example.com')])),false);
  assert.equal(reviewedManagedSiteScopeCovers(updated,'stay-focus',epoch,hash,
    policy([site('video.example.com',false)])),true);
  assert.equal(reviewedManagedSiteScopeCovers(updated,'stay-focus',epoch,hash,
    policy([site('nested.video.example.com',true)])),true);
  assert.equal(reviewedManagedSiteScopeCovers(updated,'stay-focus',epoch,hash,
    policy([site('example.com',true)])),false);
  assert.deepEqual(managedSiteV3RequiredOrigins(wanted),['*://*.video.example.com/*']);
});
test('scope widening requires explicit committed review; malformed scopes fail closed',()=>{
  const narrow=policy([site('video.example.com',false)]);
  const wide=policy([site('video.example.com',true)]);
  const saved=extendReviewedManagedSiteScopes(undefined,{
    id:'stay-focus',installEpoch:epoch,packageHash:hash,policy:narrow});
  assert.equal(reviewedManagedSiteScopeCovers(saved,'stay-focus',epoch,hash,wide),false);
  const widened=extendReviewedManagedSiteScopes(saved,{
    id:'stay-focus',installEpoch:epoch,packageHash:hash,policy:wide});
  assert.equal(reviewedManagedSiteScopeCovers(widened,'stay-focus',epoch,hash,wide),true);
  assert.equal(saved['stay-focus'].sites[0].subdomains,false,
    'building a new reviewed scope must not mutate older durable storage');
  for(const corrupt of [[],{'stay-focus':{sites:[]}},{
    'stay-focus':{...widened['stay-focus'],sites:[{host:'example.com',subdomains:'yes'}]}
  }]){
    assert.equal(reviewedManagedSiteScopeCovers(corrupt,'stay-focus',epoch,hash,wide),false);
    assert.throws(()=>extendReviewedManagedSiteScopes(corrupt,{
      id:'stay-focus',installEpoch:epoch,packageHash:hash,policy:wide}),
      {code:'E_SITE_SCOPE_CORRUPT'});
  }
});
test('paused policy requires no new scope but revocation does not activate anything',()=>{
  const paused=policy([site('example.com')],false);
  assert.equal(reviewedManagedSiteScopeCovers(undefined,'stay-focus',epoch,hash,paused),true);
  assert.deepEqual(managedSiteV3RequiredOrigins(paused),[]);
  assert.deepEqual(extendReviewedManagedSiteScopes(undefined,{
    id:'stay-focus',installEpoch:epoch,packageHash:hash,policy:paused}),{});
});
