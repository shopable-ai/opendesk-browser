import test from 'node:test';
import assert from 'node:assert/strict';
import {createCloudService} from '../../src/cloud-control/service.js';

const approval={
  taskId:'sample.form-fill',version:'1.0.0',
  manifestHash:'a'.repeat(64),sourceHash:'b'.repeat(64),
  installationId:'install-1',generation:1,
  siteOrigins:['https://example.org'],resultAllowed:false
};

test('Cloud Host rejects every omitted fixed Task pin before resolving, granting or writing',async()=>{
  let resolveCalls=0;
  const service=createCloudService({
    storage:{transaction(){assert.fail('Invalid approval must not open a storage transaction');}},
    api:{runtime:{id:'approval-contract-test'}},
    resolveTask:async()=>{resolveCalls++;assert.fail('Invalid approval must not resolve the Task');},
    assertHost:async()=>assert.fail('Invalid approval must not obtain Host authority'),
    currentHost:async()=>assert.fail('Invalid approval must not access Host state'),
    emitToHost:async()=>assert.fail('Invalid approval must not dispatch')
  });
  for(const field of Object.keys(approval)){
    const partial={...approval};delete partial[field];
    await assert.rejects(service.cloudApprove({tasks:[partial]},{}),{code:'E_SCHEMA'},
      'Missing '+field+' must fail closed');
  }
  for(const invalid of [
    {...approval,sourceHash:'invalid'},
    {...approval,generation:null},
    {...approval,siteOrigins:'https://example.org'},
    {...approval,resultAllowed:undefined},
    {...approval,sourceUtf8:'alert(1)'}
  ]){
    await assert.rejects(service.cloudApprove({tasks:[invalid]},{}),{code:'E_SCHEMA'});
  }
  await assert.rejects(service.cloudApprove({},{}),{code:'E_SCHEMA'});
  await assert.rejects(service.cloudApprove(null,{}),{code:'E_SCHEMA'});
  assert.equal(resolveCalls,0);
});
