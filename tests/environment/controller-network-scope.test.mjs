import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeControllerNetworkOrigins,assertControllerNetworkTarget} from '../../src/platform/host/controller-network-scope.js';
const source='http://127.0.0.1:43111',target='https://httpbingo.org';
test('exact cross-origin Controller network allowlist and no installed task escalation',()=>{
  assert.deepEqual(normalizeControllerNetworkOrigins(source,[target,target,source]),[target]);
  for(const origin of [target+'/get','https://*.httpbingo.org','https://httpbingo.org?x=1'])
    assert.throws(()=>normalizeControllerNetworkOrigins(source,[origin]),error=>error.code==='E_SCHEMA');
  assert.throws(()=>normalizeControllerNetworkOrigins(source,[target],{installedTask:true}),error=>error.code==='E_PERMISSION');
  assert.deepEqual(normalizeControllerNetworkOrigins(source,[],{installedTask:true}),[]);
});
test('extra Origin never applies to unknown method, normal page operation or subdomain',()=>{
  const args={url:target+'/get',sourceOrigin:source,additionalOrigins:[target],serviceCall:true,method:'AXIOS_GET',capability:'network'};
  assert.equal(assertControllerNetworkTarget(args),target);
  assert.equal(assertControllerNetworkTarget({...args,method:'AXIOS_POST'}),target);
  assert.equal(assertControllerNetworkTarget({...args,url:source+'/a',additionalOrigins:[]}),source);
  for(const override of [{additionalOrigins:[]},{url:'http://httpbingo.org/get'},{url:'https://sub.httpbingo.org/get'},
    {serviceCall:false},{method:'goto'},{capability:'page.navigate'}])
    assert.throws(()=>assertControllerNetworkTarget({...args,...override}),error=>error.code==='E_PERMISSION');
});
