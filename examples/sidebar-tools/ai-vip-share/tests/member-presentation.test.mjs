import test from 'node:test';
import assert from 'node:assert/strict';
import {runtime} from './helpers/controller-fixture.mjs';

test('empty website directory stays out of the interface while configured sites are direct buttons',async()=>{
  const e=await runtime({developmentProfile:null});
  assert.equal(e.get('site-select').disabled,true);
  assert.equal(e.get('sites-section').hidden,true);
  assert.equal(e.get('site-options').children.length,0);
  assert.equal(e.get('site-open').disabled,true);
  assert.equal(e.get('site-receive').disabled,true);
  const configured=await runtime();
  assert.equal(configured.get('site-select').disabled,false);
  assert.equal(configured.get('sites-section').hidden,false);
  assert.deepEqual(configured.get('site-options').children.map(button=>button.textContent),['普通工作台 1','普通工作台 2']);
  await configured.chooseSite('ordinary-1');
  assert.equal(configured.get('site-options').children[1].attributes['aria-pressed'],'true');
  assert.equal(configured.get('site-select').value,'ordinary-1');
  assert.equal(configured.calls.length,0,'ordinary sites need no membership query');
  assert.equal(e.cookieCalls.length,0);
  assert.equal(e.tabCalls.length,0);
  assert.equal(e.proxyCalls.length,0);
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
