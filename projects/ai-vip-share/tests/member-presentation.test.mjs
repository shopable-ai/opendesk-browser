import test from 'node:test';
import assert from 'node:assert/strict';
import {runtime,fixtureRequest,EXTENSION_ORIGIN} from './helpers/controller-fixture.mjs';
import {createLocalFixture} from '../dev/local-test/local-fixture-server.mjs';

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
  assert.match(e.get('site-status').textContent,/未取得.*网站授权.*刷新.*未写入 Cookie/);
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

test('activation delivery shows its actual target and missing website identity before any site selection',async()=>{
  const e=await runtime({network:async(args,fixture)=>{
    const response=await fixtureRequest(fixture,{...args,headers:args.config.headers});
    for(const row of response.data.sharedAccounts?.accounts??[])delete row.displayNameMasked;
    return response;
  }});
  await e.click('local-connect');await e.preview();await e.click('redeem-confirm');
  assert.equal(e.get('site-select').value,'commercial');
  assert.match(e.get('site-source').textContent,/127\.0\.0\.1:7903/);
  assert.match(e.get('site-account').textContent,/未提供脱敏账号.*身份未核验/);
  assert.doesNotMatch(e.get('site-account').textContent,/尚未取得会话/);
  assert.equal(e.get('site-open').disabled,false);
  assert.deepEqual(e.cookieCalls,[]);assert.deepEqual(e.proxyCalls,[]);assert.deepEqual(e.tabCalls,[]);
  await e.click('site-open');
  assert.deepEqual(e.tabCalls,[{url:'http://127.0.0.1:7903/session/'}]);
  assert.deepEqual(e.cookieCalls,[],'opening for website authorization does not write');
  await e.click('site-cancel');
  assert.equal(e.get('site-account-row').hidden,true);
  assert.equal(e.get('cookie-install').hidden,true);
  assert.equal(e.fixture.ledger.size,1,'cancelling a session does not undo or repeat redemption');
});

test('server masked identity is reviewable without claiming website verification or causing side effects',async()=>{
  const e=await runtime();
  await e.click('local-connect');await e.preview();await e.click('redeem-confirm');
  assert.match(e.get('site-account').textContent,/服务端提供：a\*\*\*@fixture\.test.*网站身份未核验/);
  assert.doesNotMatch(e.get('site-account').textContent,/未提供|身份已核验|登录成功|VIP有效/);
  assert.equal(e.get('site-account-row').hidden,false);
  assert.deepEqual(e.cookieCalls,[]);assert.deepEqual(e.proxyCalls,[]);assert.deepEqual(e.tabCalls,[]);
  const before=JSON.stringify([...e.store]);
  assert(!before.includes('a***@fixture.test'),'review identity stays out of recovery storage');
  await e.click('site-cancel');
  assert.equal(e.get('site-account-row').hidden,true);
  assert.equal(e.get('cookie-install').hidden,true);
  assert.equal(JSON.stringify([...e.store]),before,'display metadata never enters secret or recovery storage');
});

test('unchanged reviewed identity permits one explicit write and reopening does not replay it',async()=>{
  const e=await runtime();
  await e.click('local-connect');await e.preview();await e.click('redeem-confirm');
  await e.click('cookie-install');await e.flush();
  assert.equal(e.cookieCalls.length,1);
  assert.deepEqual(e.tabCalls,[{url:'http://127.0.0.1:7903/session/'}]);
  assert.equal(e.fixture.ledger.size,1);
  const before=JSON.stringify([...e.store]);
  const reopened=await runtime({store:e.store,fixture:e.fixture});
  assert.equal(reopened.cookieCalls.length,0);assert.equal(reopened.tabCalls.length,0);
  assert.equal(reopened.proxyCalls.length,0);
  assert.equal(reopened.calls.filter(row=>row.method==='POST').length,0);
  assert.equal(reopened.get('site-account-row').hidden,true);
  assert.equal(JSON.stringify([...e.store]),before);
});

test('changed or removed website identity invalidates a prepared delivery before Cookie dispatch',async()=>{
  for(const replacement of ['b***@fixture.test',null]){
    let changed=false;
    const e=await runtime({network:async(args,fixture)=>{
      const response=await fixtureRequest(fixture,{...args,headers:args.config.headers});
      if(changed)for(const row of response.data.sharedAccounts?.accounts??[]){
        if(replacement===null)delete row.displayNameMasked;
        else row.displayNameMasked=replacement;
      }
      return response;
    }});
    await e.click('local-connect');await e.preview();await e.click('redeem-confirm');
    assert.equal(e.get('cookie-install').hidden,false);
    changed=true;await e.click('cookie-install');await e.flush();
    assert.equal(e.cookieCalls.length,0,'the pre-dispatch member refresh must cancel the old review');
    assert.equal(e.get('cookie-install').hidden,true);
    assert.equal(e.get('site-account-row').hidden,true);
    assert.equal(e.fixture.ledger.size,1);
    assert.deepEqual(e.tabCalls,[]);assert.deepEqual(e.proxyCalls,[]);
  }
});

test('unmasked or misleading identity metadata fails closed and cannot be submitted',async()=>{
  for(const identity of ['full-account@fixture.test','a***@fixture.test\nVIP有效','a***\u202e@fixture.test',42]){
    let changed=false;
    const e=await runtime({network:async(args,fixture)=>{
      const response=await fixtureRequest(fixture,{...args,headers:args.config.headers});
      if(changed)for(const row of response.data.sharedAccounts?.accounts??[])row.displayNameMasked=identity;
      return response;
    }});
    await e.click('local-connect');await e.preview();await e.click('redeem-confirm');
    changed=true;await e.click('refresh');
    assert.equal(e.get('cookie-install').hidden,true);
    assert.equal(e.get('site-account-row').hidden,true);
    assert.match(e.get('redeem-status').textContent,/权益刷新失败/);
    await e.click('cookie-install');
    assert.deepEqual(e.cookieCalls,[]);assert.deepEqual(e.tabCalls,[]);
    assert.equal(e.fixture.ledger.size,1);
  }
});

test('lost or expired allocation is explained without denying retained quota or repeating redemption',async()=>{
  for(const reason of ['revoked','expired']){
    let allowed=true,now=Date.now();
    const fixture=createLocalFixture({extensionOrigin:EXTENSION_ORIGIN,sessionTarget:'http://127.0.0.1:7903/session/',
      now:()=>now,isSharedAccessAllowed:()=>allowed});
    const e=await runtime({fixture});
    await e.click('local-connect');await e.preview();await e.click('redeem-confirm');
    if(reason==='revoked')allowed=false;else now+=3600001;
    await e.click('refresh');
    assert.match(e.get('login-flow').textContent,/没有可用的网站会话分配.*服务方.*不会自动重复兑换/);
    assert.doesNotMatch(e.get('login-flow').textContent,/激活权益 →/);
    assert.equal(e.get('remaining').textContent,'20','retained quota is a separate fact');
    assert.equal(e.get('cookie-install').hidden,true);
    assert.equal(e.get('site-account-row').hidden,true);
    assert.equal(fixture.ledger.size,1);
    assert.equal(e.calls.filter(row=>new URL(row.url).pathname==='/api/redeem').length,1);
    assert.deepEqual(e.cookieCalls,[]);assert.deepEqual(e.tabCalls,[]);assert.deepEqual(e.proxyCalls,[]);
  }
});
