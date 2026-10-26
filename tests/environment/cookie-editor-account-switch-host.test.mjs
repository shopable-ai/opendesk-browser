import test from 'node:test';
import assert from 'node:assert/strict';
import {COOKIE_ACCOUNT_PROTOCOL,COOKIE_ACCOUNT_OPERATIONS,
  COOKIE_ACCOUNT_VAULT_KEY,COOKIE_ACCOUNT_SESSION_KEY,COOKIE_ACCOUNT_SEEN_KEY}
  from '../../examples/sidebar-tools/cookie-editor/trusted/account-contract.js';
import {planAccountCookieEffects,validateAccountCookieRow,
  sameAccountAutoSwitchAttempt}
  from '../../examples/sidebar-tools/cookie-editor/trusted/account-service.js';
import {readFile} from 'node:fs/promises';

const original=(overrides={})=>({
  name:'demo',value:'fiction',domain:'example.com',path:'/',
  storeId:'0',hostOnly:true,session:true,secure:true,httpOnly:true,
  sameSite:'lax',...overrides
});

test('native Cookie switch plan is deterministic, exact and idempotent',()=>{
  const current=[original(),original({name:'theme',value:'light'})];
  assert.deepEqual(planAccountCookieEffects(current,current),[]);
  const desired=[original({value:'other'})];
  const actions=planAccountCookieEffects(current,desired);
  assert.deepEqual(actions.map(row=>[row.kind,row.row.name]),
    [['remove','theme'],['set','demo']]);
  assert.deepEqual(planAccountCookieEffects(desired,desired),[]);
  assert.deepEqual(planAccountCookieEffects([],desired),[{kind:'set',row:desired[0]}]);
});

test('Cookie name, path, Store and Partition remain independent in an operation plan',()=>{
  const base=original();
  const partition={topLevelSite:'https://example.com',hasCrossSiteAncestor:false};
  const current=[base,original({path:'/account'}),
    original({storeId:'1'}),original({partitionKey:partition})];
  const future=[base,original({path:'/account',value:'updated'})];
  const plan=planAccountCookieEffects(current,future);
  assert.deepEqual(plan.filter(item=>item.kind==='remove').map(item=>item.row.storeId),
    ['1','0']);
  assert.equal(plan.filter(item=>item.kind==='set').length,1);
  assert.equal(plan.find(item=>item.kind==='set')?.row.path,'/account');
});

test('one private Host protocol has no raw Cookie or key RPC',async()=>{
  assert.equal(COOKIE_ACCOUNT_PROTOCOL,'opendesk.cookie-accounts.v1');
  assert.equal(new Set(COOKIE_ACCOUNT_OPERATIONS).size,COOKIE_ACCOUNT_OPERATIONS.length);
  assert.ok(COOKIE_ACCOUNT_OPERATIONS.includes('status'));
  assert.ok(COOKIE_ACCOUNT_OPERATIONS.includes('switch'));
  assert.ok(!COOKIE_ACCOUNT_OPERATIONS.includes('readValue'));
  assert.equal(new Set([COOKIE_ACCOUNT_VAULT_KEY,COOKIE_ACCOUNT_SESSION_KEY,
    COOKIE_ACCOUNT_SEEN_KEY]).size,3);
  const [host,worker,app]=await Promise.all([
    readFile(new URL('../../src/ui/sidebar-tools.js',import.meta.url),'utf8'),
    readFile(new URL('../../src/sw.js',import.meta.url),'utf8'),
    readFile(new URL('../../examples/sidebar-tools/cookie-editor/app/CookieEditorApp.jsx',
      import.meta.url),'utf8')
  ]);
  assert.match(host,/COOKIE_ACCOUNT_PROTOCOL/);
  assert.match(host,/verifiedGesture/);
  assert.match(worker,/installCookieAccountService/);
  assert.doesNotMatch(app,/accounts=\{\[\]\}|vaultReady=\{false\}|switchReady=\{false\}/);
  assert.doesNotMatch(app,/chrome\.cookies|localStorage|sessionStorage/);
});

test('trusted validator accepts ordinary Cookie names and URL Paths',()=>{
  for(const name of ['session_id','csrftoken','locale','id2']){
    for(const path of ['/','/account','/orders','/profile/settings']){
      const row=original({name,path});
      assert.deepEqual(validateAccountCookieRow(row,'example.com','0'),row);
    }
  }
});

test('trusted validator rejects Cookie-name separators, whitespace and controls',()=>{
  for(const name of ['bad name','bad\tname','bad\rname','bad\nname',
    'bad;name','bad=name','bad\0name','bad\x7fname']){
    assert.throws(()=>validateAccountCookieRow(original({name}),
      'example.com','0'),{code:'E_ACCOUNT_COOKIE_SCOPE'});
  }
});

test('trusted validator rejects invalid Paths, changes of scope and prefixes',()=>{
  for(const path of ['orders','/bad;path','/bad\r','/bad\n','/bad\t',
    '/bad\0','/bad\x7f','/bad\\separator']){
    assert.throws(()=>validateAccountCookieRow(original({path}),
      'example.com','0'),{code:'E_ACCOUNT_COOKIE_SCOPE'});
  }
  for(const row of [
    original({domain:'evil.example'}),
    original({storeId:'1'}),
    original({partitionKey:{topLevelSite:'https://elsewhere.example'}}),
    original({name:'__Secure-auth',secure:false}),
    original({name:'__Host-auth',path:'/account'}),
    original({sameSite:'no_restriction',secure:false}),
    original({session:false,expirationDate:1})
  ])assert.throws(()=>validateAccountCookieRow(row,'example.com','0'),
    {code:'E_ACCOUNT_COOKIE_SCOPE'});
});

test('trusted auto-switch fence never replays the same old URL after TTL expiry',()=>{
  const target={url:'https://example.com/#od-account=acct_example',
    alias:'acct_example',version:2};
  for(const phase of ['in_flight','applied']){
    // Existing sessions may already contain a legacy expiresAt field.
    const previous={...target,phase,expiresAt:1};
    assert.equal(sameAccountAutoSwitchAttempt(previous,target),true);
  }
  assert.equal(sameAccountAutoSwitchAttempt(null,target),false);
  assert.equal(sameAccountAutoSwitchAttempt(
    {...target,phase:'in_flight'}, {...target,version:3}),false);
  assert.equal(sameAccountAutoSwitchAttempt(
    {...target,phase:'applied'}, {...target,alias:'acct_other'}),false);
  assert.equal(sameAccountAutoSwitchAttempt(
    {...target,phase:'applied'}, {...target,url:'https://example.com/'}),false);
});

test('trusted cookie prefixes require exact Secure and HttpOnly properties',()=>{
  for(const name of ['__Http-auth','__Host-Http-auth']){
    assert.equal(validateAccountCookieRow(original({name}), 'example.com','0').name,name);
    for(const patch of [{secure:false},{httpOnly:false}]){
      assert.throws(()=>validateAccountCookieRow(original({name,...patch}),
        'example.com','0'),{code:'E_ACCOUNT_COOKIE_SCOPE'});
    }
  }
  assert.throws(()=>validateAccountCookieRow(
    original({name:'__Host-Http-auth',path:'/account'}),
    'example.com','0'),{code:'E_ACCOUNT_COOKIE_SCOPE'});
});
