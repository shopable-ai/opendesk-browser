import test from 'node:test';
import assert from 'node:assert/strict';
import {COOKIE_ACCOUNT_PROTOCOL,COOKIE_ACCOUNT_OPERATIONS,
  COOKIE_ACCOUNT_VAULT_KEY,COOKIE_ACCOUNT_SESSION_KEY,COOKIE_ACCOUNT_SEEN_KEY}
  from '../../examples/sidebar-tools/cookie-editor/trusted/account-contract.js';
import {planAccountCookieEffects}
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

test('one private Host protocol has no raw Cookie or key RPC',()=>{
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
