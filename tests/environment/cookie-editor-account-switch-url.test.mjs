import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAccountSwitchUrl,inspectAccountSwitchUrl
} from '../../examples/sidebar-tools/cookie-editor/app/domain/account-switch-url.js';

const origin='https://example.com';
const approved={
  expectedOrigin:origin,enabled:true,approvedFragment:true,
  allowedAliases:['work_02']
};
const thrown=fn=>{try{fn();return null;}catch(error){return error.code;}};

test('one canonical URL is generated and parsed',()=>{
  const link=createAccountSwitchUrl(origin+'/','work_02',{
    expectedOrigin:origin,approvedFragment:true
  });
  assert.equal(link,origin+'/#od-account=work_02');
  assert.deepEqual(inspectAccountSwitchUrl(link,approved),{
    status:'eligible',alias:'work_02',origin
  });
});
test('no adapter approval disables link generation',()=>{
  assert.equal(thrown(()=>createAccountSwitchUrl(origin,'work_02')),
    'E_SITE_ADAPTER_REQUIRED');
  assert.equal(inspectAccountSwitchUrl(origin+'/#od-account=work_02',{
    ...approved,approvedFragment:false
  }).code,'E_SITE_ADAPTER_REQUIRED');
});
test('existing site routers and URL query state cannot be overwritten',()=>{
  assert.equal(thrown(()=>createAccountSwitchUrl(origin+'/#/orders',
    'work_02',{approvedFragment:true})),'E_ROUTE_CONFLICT');
  assert.equal(thrown(()=>createAccountSwitchUrl(origin+'/?route=orders',
    'work_02',{approvedFragment:true})),'E_ROUTE_CONFLICT');
});
test('Query and duplicated mixed account parameters are rejected',()=>{
  for(const path of [
    '/?od-account=work_02','/?od-account=work_02&od-account=other',
    '/?od-account=other#od-account=work_02'
  ])assert.equal(inspectAccountSwitchUrl(origin+path,approved).code,
    'E_QUERY_NOT_SUPPORTED');
});
test('strict URL origin, allowlist and opt-in guard',()=>{
  assert.equal(inspectAccountSwitchUrl('javascript:alert(1)',approved).code,
    'E_URL_INVALID');
  assert.equal(inspectAccountSwitchUrl(
    'https://evil.example/#od-account=work_02',approved).code,'E_SITE_MISMATCH');
  assert.equal(inspectAccountSwitchUrl(origin+'/#od-account=unknown',approved).code,
    'E_ALIAS_NOT_ALLOWED');
  assert.equal(inspectAccountSwitchUrl(origin+'/#od-account=work_02',{
    ...approved,enabled:false
  }).code,'E_AUTO_SWITCH_OFF');
});
test('bad or credential-looking aliases are never accepted',()=>{
  for(const alias of ['token_123','session123','bad%2Dname','x','A&x=1'])
    assert.equal(thrown(()=>createAccountSwitchUrl(origin,alias,{
      approvedFragment:true
    })),'E_ALIAS_INVALID');
  assert.equal(inspectAccountSwitchUrl(origin+'/#od-account=work_02&other=1',
    approved).code,'E_ALIAS_INVALID');
});
test('ordinary anchors do not trigger account requests',()=>{
  assert.deepEqual(inspectAccountSwitchUrl(origin+'/#/orders',approved),{status:'none'});
  assert.deepEqual(inspectAccountSwitchUrl(origin+'/',approved),{status:'none'});
});
test('no site grant or cross-origin link fails closed',()=>{
  assert.equal(inspectAccountSwitchUrl(origin+'/#od-account=work_02',{}).code,
    'E_SITE_NOT_APPROVED');
  assert.equal(thrown(()=>createAccountSwitchUrl(origin+'/','work_02',{
    expectedOrigin:'https://example.net',approvedFragment:true
  })),'E_SITE_MISMATCH');
});

test('generated and inspected auto-switch URLs both reject non-root paths',()=>{
  assert.equal(thrown(()=>createAccountSwitchUrl(origin+'/account','work_02',{
    expectedOrigin:origin,approvedFragment:true
  })),'E_ROUTE_CONFLICT');
  assert.equal(inspectAccountSwitchUrl(origin+'/account#od-account=work_02',approved).code,
    'E_ROUTE_CONFLICT');
});
