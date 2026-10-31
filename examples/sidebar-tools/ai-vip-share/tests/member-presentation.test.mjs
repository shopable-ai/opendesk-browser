import test from 'node:test';
import assert from 'node:assert/strict';
import {runtime,fixtureRequest} from './helpers/controller-fixture.mjs';

test('ordinary sites require a trusted test action even with a development profile',async()=>{
  const e=await runtime();
  assert.equal(e.get('site-select').disabled,true);
  assert.equal(e.get('sites-section').hidden,true);
  assert.equal(e.get('site-options').children.length,0);
  await e.click('test-sites',false);
  assert.equal(e.get('sites-section').hidden,true);
  assert.equal(e.get('site-options').children.length,0);
  await e.click('test-sites');
  assert.equal(e.get('site-select').disabled,false);
  assert.equal(e.get('sites-section').hidden,false);
  assert.deepEqual(e.get('site-options').children.map(button=>button.textContent),['普通工作台 1','普通工作台 2']);
  assert.equal(e.storageCalls.filter(row=>row.operation==='storage.set').length,0,'revealing sites does not persist an action');
  await e.chooseSite('ordinary-1');
  assert.equal(e.get('site-options').children[1].attributes['aria-pressed'],'true');
  assert.equal(e.get('site-select').value,'ordinary-1');
  assert.equal(e.calls.length,0,'revealing and selecting ordinary sites need no membership query');
  assert.equal(e.cookieCalls.length,0);
  assert.equal(e.tabCalls.length,0);
  assert.equal(e.proxyCalls.length,0);
});

test('ordinary sites cannot be enabled without a development profile',async()=>{
  const e=await runtime({developmentProfile:null});
  await e.click('test-sites');
  assert.equal(e.get('site-select').disabled,true);
  assert.equal(e.get('sites-section').hidden,true);
  assert.equal(e.get('site-options').children.length,0);
  assert.equal(e.get('site-open').disabled,true);
  assert.equal(e.get('site-receive').disabled,true);
  assert.equal(e.calls.length,0);
  assert.equal(e.storageCalls.filter(row=>row.operation==='storage.set').length,0);
});

test('verified member replaces the initial unavailable hint while empty code stays disabled',async()=>{
  const e=await runtime();
  assert.match(e.get('redeem-status').textContent,/服务尚未接入/);
  await e.click('local-connect');
  assert.equal(e.get('redeem-code').disabled,false);
  assert.equal(e.get('redeem').disabled,true);
  assert.match(e.get('redeem-status').textContent,/输入兑换码并预检/);
  assert.equal(e.get('redeem-error').hidden,true);
  assert.equal(e.calls.filter(row=>row.method==='POST').length,0);
});

test('refresh retains actionable preview errors and unsubmitted confirmation',async()=>{
  const e=await runtime();await e.click('local-connect');
  await e.preview('INVALID-CODE');
  const failure=e.get('redeem-error').textContent;
  assert.equal(e.get('redeem-error').hidden,false);
  await e.click('refresh');
  assert.equal(e.get('redeem-error').textContent,failure);
  assert.equal(e.get('redeem-error').hidden,false);
  await e.preview();
  const pending=e.get('redeem-status').textContent;
  assert.equal(e.get('redeem-preview').hidden,false);
  await e.click('refresh');
  assert.equal(e.get('redeem-status').textContent,pending);
  assert.equal(e.get('redeem-preview').hidden,false);
  assert.equal(e.calls.filter(row=>new URL(row.url).pathname==='/api/redeem').length,0);
});

test('commercial preparation failure is visible without a delivery or Cookie side effects',async()=>{
  const e=await runtime({network:async(args,fixture)=>{
    if(args.data?.operation==='sharedSession')throw Error('service offline');
    return fixtureRequest(fixture,{...args,headers:args.config.headers});
  }});
  await e.click('local-connect');await e.preview();await e.click('redeem-confirm');
  await e.chooseSite('commercial');await e.click('site-receive');
  assert.equal(e.get('site-status').hidden,false);
  assert.match(e.get('site-status').textContent,/未取得.*刷新授权目录.*未写入 Cookie/);
  assert.equal(e.get('cookie-install').hidden,true);
  assert.deepEqual(e.cookieCalls,[]);assert.deepEqual(e.tabCalls,[]);
  assert.equal(e.get('site-receive').disabled,false);
});

test('login confirmation opens once and unrelated renders preserve user collapse',async()=>{
  const e=await runtime();
  await e.click('local-connect');await e.preview();await e.click('redeem-confirm');
  await e.chooseSite('commercial');await e.click('site-receive');
  assert.equal(e.get('sites-section').open,true);
  e.get('sites-section').open=false;
  await e.click('proxy-refresh');
  assert.equal(e.get('sites-section').open,false);
  assert.deepEqual(e.cookieCalls,[]);assert.deepEqual(e.tabCalls,[]);
});
