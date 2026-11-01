import test from 'node:test';
import assert from 'node:assert/strict';
import {runtime,ORIGIN} from './helpers/controller-fixture.mjs';

const LAN='http://192.168.30.3:7899';
const page=origin=>({status:'available',url:origin+'/activate?activation_code=DEMO-VIP-01'});
const posts=(e,path)=>e.calls.filter(row=>row.method==='POST'&&row.url.endsWith(path));

test('approved LAN activation link fills the installed controller and confirms through its existing service',async()=>{
  const e=await runtime({currentPage:page(LAN)});
  await e.click('local-connect');await e.checkPage();
  assert.equal(e.get('redeem-code').value,'DEMO-VIP-01');
  assert.equal(e.get('activation-hint').hidden,false);
  assert.equal(posts(e,'/preview').length,0);
  assert.equal(posts(e,'/redeem').length,0);
  await e.preview();
  assert.equal(e.get('redeem-preview').hidden,false);
  await e.click('redeem-confirm');
  assert.equal(posts(e,'/redeem').length,1);
  assert.equal(e.fixture.ledger.size,1);
  assert.equal(e.cookieCalls.length,0);
  assert(e.calls.every(row=>new URL(row.url).origin===ORIGIN));
  const reopened=await runtime({store:e.store,fixture:e.fixture,currentPage:page(LAN)});
  await reopened.checkPage();
  assert.equal(posts(reopened,'/redeem').length,0);
  assert.equal(reopened.cookieCalls.length,0);
});

test('LAN links require the approved development profile and exact origin, path and single parameter',async()=>{
  const e=await runtime();await e.click('local-connect');
  for(const url of [
    'http://192.168.30.4:7899/activate?activation_code=DEMO-VIP-01',
    'http://192.168.30.3:7900/activate?activation_code=DEMO-VIP-01',
    'http://192.168.30.3.evil.test:7899/activate?activation_code=DEMO-VIP-01',
    LAN+'/activate/?activation_code=DEMO-VIP-01',
    LAN+'/activate?activation_code=DEMO-VIP-01&activation_code=DEMO-VIP-02',
    LAN+'/activate?activation_code=DEMO-VIP-01&redirect=https://example.com',
    LAN+'/activate?activation_code=DEMO-VIP-01#extra'
  ]){
    e.setPage({status:'available',url});await e.checkPage();
    assert.equal(e.get('redeem-code').value,'');
  }
  assert.equal(posts(e,'/preview').length,0);
  const production=await runtime({developmentProfile:null,currentPage:page(LAN)});
  await production.checkPage();
  assert.equal(production.pageCalls.length,0);
  assert.equal(production.calls.length,0);
});

test('changing between approved activation origins with the same code invalidates the reviewed source',async()=>{
  const e=await runtime({currentPage:page(ORIGIN)});
  await e.click('local-connect');await e.checkPage();await e.preview();
  e.setPage(page(LAN));await e.click('redeem-confirm');
  assert.equal(posts(e,'/redeem').length,0);
  assert.equal(e.fixture.ledger.size,0);
  assert.match(e.get('redeem-status').textContent,/未提交兑换/);
});
