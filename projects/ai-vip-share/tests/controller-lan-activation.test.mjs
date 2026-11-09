import test from 'node:test';
import assert from 'node:assert/strict';
import {runtime,ORIGIN,deferred,fixtureRequest} from './helpers/controller-fixture.mjs';

const LAN='http://192.168.30.3:7899';
const page=origin=>({status:'available',url:origin+'/activate?activation_code=DEMO-VIP-01'});
const posts=(e,path)=>e.calls.filter(row=>row.method==='POST'&&row.url.endsWith(path));

test('approved LAN activation link fills the installed controller and confirms through its existing service',async()=>{
  const e=await runtime({currentPage:page(LAN)});
  await e.click('local-connect');await e.checkPage();
  assert.equal(e.get('redeem-code').value,''); // cleared once preview is shown
  assert.equal(e.get('activation-hint').hidden,true);
  assert.equal(posts(e,'/preview').length,1); // safe automatic preflight
  assert.equal(posts(e,'/redeem').length,0);
  assert.equal(e.get('redeem-preview').hidden,false);
  await e.click('redeem-confirm');
  assert.equal(posts(e,'/redeem').length,1);
  assert.equal(e.fixture.ledger.size,1);
  assert.equal(e.cookieCalls.length,0);
  assert(e.calls.every(row=>new URL(row.url).origin==='http://127.0.0.1:7903'));
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
    LAN+'/activate?activation_code=DEMO-VIP-01#extra',
    LAN+'/activate?activation_code=DEMO%2DVIP-01',
    LAN+'/other/../activate?activation_code=DEMO-VIP-01',
    LAN+'/activate?activation_code=DEMO-VIP-01%00'
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
  await e.click('local-connect');await e.checkPage();
  assert.equal(posts(e,'/preview').length,1);
  e.setPage(page(LAN));await e.click('redeem-confirm');
  assert.equal(posts(e,'/redeem').length,0);
  assert.equal(e.fixture.ledger.size,0);
  assert.match(e.get('redeem-status').textContent,/未提交兑换/);
});

test('cancellation is durable for the account/service even after a changed link ticket, while manual redemption remains possible',async()=>{
  const e=await runtime({currentPage:page(LAN)});
  await e.click('local-connect');await e.checkPage();
  assert.equal(posts(e,'/preview').length,1);
  await e.click('redeem-cancel');
  assert.equal(posts(e,'/redeem').length,0);
  assert.equal(e.fixture.ledger.size,0);
  const reopened=await runtime({store:e.store,fixture:e.fixture,
    currentPage:{status:'available',url:LAN+'/activate?activation_code=DEMO-VIP-02'}});
  await reopened.checkPage();
  assert.equal(posts(reopened,'/preview').length,0);
  assert.equal(posts(reopened,'/redeem').length,0);
  assert.match(reopened.get('redeem-status').textContent,/取消自动继续/);
  await reopened.preview('DEMO-VIP-02'); // new explicit trusted user gesture
  assert.equal(posts(reopened,'/preview').length,1);
  await reopened.click('redeem-confirm');
  assert.equal(posts(reopened,'/redeem').length,1);
  assert.equal(reopened.fixture.ledger.size,1);
});

test('cancel during current-recipient recheck prevents an unsubmitted redemption',async()=>{
  let intercept=false,heldGet=null;
  const gate=deferred();
  const e=await runtime({currentPage:page(LAN),network:(args,fixture)=>{
    if(intercept&&args.method==='GET'&&args.url.endsWith('/api/member')){
      heldGet={args,fixture};return gate.promise;
    }
    return fixtureRequest(fixture,{...args,headers:args.config.headers||{}});
  }});
  await e.click('local-connect');await e.checkPage();
  intercept=true;
  await e.click('redeem-confirm'); // GET member held before write-ahead and redeem POST
  await e.click('redeem-cancel');
  intercept=false;
  assert.ok(heldGet,'original authenticated member GET was intercepted');
  gate.resolve(await fixtureRequest(heldGet.fixture,{...heldGet.args,
    headers:heldGet.args.config.headers||{}}));
  await e.flush();
  assert.equal(posts(e,'/redeem').length,0);
  assert.equal(e.fixture.ledger.size,0);
  assert.match(e.get('redeem-status').textContent,/停止尚未提交/);
});

test('cancel during side-effect-free preview suppresses its late response and pauses later automatic entry',async()=>{
  const gate=deferred();
  const e=await runtime({currentPage:page(LAN),network:(args,fixture)=>{
    if(args.method==='POST'&&args.url.endsWith('/api/preview'))return gate.promise;
    return fixtureRequest(fixture,{...args,headers:args.config.headers||{}});
  }});
  await e.click('local-connect');
  const preparing=e.checkPage(); // leave preview network response unresolved
  await e.flush();
  assert.equal(posts(e,'/preview').length,1);
  assert.equal(e.get('redeem-preview').hidden,false);
  assert.equal(e.get('redeem-cancel').hidden,false);
  await e.click('redeem-cancel');
  const original=e.calls.find(row=>row.url.endsWith('/api/preview'));
  gate.resolve(await fixtureRequest(e.fixture,{...original,headers:original.config.headers||{}}));
  await preparing;
  assert.equal(posts(e,'/redeem').length,0);
  assert.equal(e.fixture.ledger.size,0);
  assert.equal(e.get('redeem-preview').hidden,true);
  const reopened=await runtime({store:e.store,fixture:e.fixture,currentPage:page(LAN)});
  await reopened.checkPage();
  assert.equal(posts(reopened,'/preview').length,0);
});

test('cancel after redeem dispatch preserves original server receipt but blocks automatic website delivery',async()=>{
  const gate=deferred();
  const e=await runtime({currentPage:page(LAN),network:(args,fixture)=>{
    if(args.method==='POST'&&args.url.endsWith('/api/redeem'))return gate.promise;
    return fixtureRequest(fixture,{...args,headers:args.config.headers||{}});
  }});
  await e.click('local-connect');await e.checkPage();
  await e.click('redeem-confirm');
  const submitted=e.calls.find(row=>row.method==='POST'&&row.url.endsWith('/api/redeem'));
  assert.ok(submitted,'original redeem POST reached service boundary');
  await e.click('redeem-cancel');
  assert.match(e.get('redeem-status').textContent,/不能撤销/);
  gate.resolve(await fixtureRequest(e.fixture,{...submitted,headers:submitted.config.headers||{}}));
  await e.flush();
  assert.equal(posts(e,'/redeem').length,1);
  assert.equal(e.fixture.ledger.size,1);
  assert.equal(e.cookieCalls.length,0);
  assert.equal(e.tabCalls.length,0);
  assert.match(e.get('redeem-status').textContent,/已停止后续自动操作/);
});
