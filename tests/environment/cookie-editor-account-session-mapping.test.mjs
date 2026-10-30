import test from 'node:test';
import assert from 'node:assert/strict';
import * as service from '../../examples/sidebar-tools/cookie-editor/trusted/account-service.js';

const origin='https://example.com';
const context=()=>({origin,host:'example.com',storeId:'receiver-store',
  partition:{topLevelSite:origin,hasCrossSiteAncestor:false},parents:new Set()});
const cookie=(overrides={})=>({name:'synthetic',value:'fiction',domain:'example.com',path:'/account',
  storeId:'sender-store',hostOnly:true,session:true,secure:true,httpOnly:true,sameSite:'lax',...overrides});
const snapshot=rows=>({format:1,origin,cookies:rows});
function map(rows,scope=context()){
  assert.equal(typeof service.mapReceivedAccountCookies,'function',
    'Received snapshots require the existing trusted Cookie scope validator');
  return service.mapReceivedAccountCookies(snapshot(rows),scope);
}
test('receiver mapping explicitly binds Store while preserving authorized Cookie attributes',()=>{
  const row=cookie(),mapped=map([row]);
  assert.deepEqual(mapped,[{...row,storeId:'receiver-store'}]);
  assert.equal(row.storeId,'sender-store');
});
test('partitioned snapshots require the exact receiving native partition',()=>{
  const scope=context(),partitionKey=scope.partition;
  assert.deepEqual(map([cookie({partitionKey})]),[cookie({storeId:scope.storeId,partitionKey})]);
  for(const partition of [{topLevelSite:'https://other.example',hasCrossSiteAncestor:false},
    {topLevelSite:origin,hasCrossSiteAncestor:true}])
    assert.throws(()=>map([cookie({partitionKey:partition})]),{code:'E_ACCOUNT_COOKIE_SCOPE'});
});
test('foreign domains, unauthorized parents, duplicate slots and missing source Store are rejected',()=>{
  for(const rows of [[cookie({domain:'other.example'})],
    [cookie({domain:'.com',hostOnly:false})],[cookie(),cookie()],
    [cookie({storeId:undefined})],[cookie({path:'not-a-path'})]])
    assert.throws(()=>map(rows),{code:'E_ACCOUNT_COOKIE_SCOPE'});
  const scope={...context(),origin:'https://app.example.com',host:'app.example.com'};
  assert.throws(()=>service.mapReceivedAccountCookies({format:1,origin:scope.origin,
    cookies:[cookie({domain:'.example.com',hostOnly:false})]},scope),{code:'E_ACCOUNT_COOKIE_SCOPE'});
  scope.parents.add('example.com');
  assert.equal(service.mapReceivedAccountCookies({format:1,origin:scope.origin,
    cookies:[cookie({domain:'.example.com',hostOnly:false})]},scope)[0].storeId,scope.storeId);
});
test('snapshot origin and HTTP secure restrictions survive receiving mapping',()=>{
  assert.throws(()=>map([cookie()],{...context(),origin:'https://other.example'}),{code:'E_ACCOUNT_COOKIE_SCOPE'});
  const scope={...context(),origin:'http://example.com'};
  assert.throws(()=>service.mapReceivedAccountCookies({format:1,origin:scope.origin,cookies:[cookie()]},scope),
    {code:'E_ACCOUNT_COOKIE_SCOPE'});
});
