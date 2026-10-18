import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyMarketplaceToolRuntime} from '../../src/marketplace/page.js';
import {FOCUS_PROTOCOL,FOCUS_PROBE_OPERATION,FOCUS_SERVICE_VERSION}
  from '../../examples/sidebar-tools/stay-focus/trusted/policy.js';

const modern={id:'stay-focus',capabilities:['focus.control'],
  backgroundPolicy:{kind:'site-budget.v2'}};
const worker={protocol:FOCUS_PROTOCOL,serviceVersion:FOCUS_SERVICE_VERSION,
  serviceReady:true,permissions:{idle:false,dnr:true,ready:false}};
const managedSiteRuntime={contract:'opendesk.managed-site-runtime.v1',
  policyKinds:['site-budget.v1','site-budget.v2'],privilegedJs:false};

test('Marketplace single/batch install refuses a live legacy worker for new app policy',async()=>{
  let messages=0;
  const api={runtime:{sendMessage:async request=>{
    messages++;
    assert.equal(request.operation,FOCUS_PROBE_OPERATION);
    return {ok:true,data:worker};
  }}};
  await assert.rejects(verifyMarketplaceToolRuntime({api,tool:modern}),
    {code:'E_TOOL_RUNTIME_POLICY_UNSUPPORTED'});
  assert.equal(messages,1);
  assert.equal(await verifyMarketplaceToolRuntime({api,tool:{id:'other',capabilities:[]}}),null);
  assert.equal(messages,1);
  await assert.rejects(verifyMarketplaceToolRuntime({
    api,tool:{...modern,id:'not-stay-focus'}}),
    {code:'E_TOOL_RUNTIME_UNAVAILABLE'});
  assert.equal(messages,1);
});
test('Marketplace uses installed worker advertised rule kinds, not package claimed code',async()=>{
  const api={runtime:{sendMessage:async()=>({ok:true,data:{
    ...worker,managedSiteRuntime}})}};
  assert.equal((await verifyMarketplaceToolRuntime({api,tool:modern}))
    .managedSiteRuntime.privilegedJs,false);
  await assert.rejects(verifyMarketplaceToolRuntime({api,tool:{
    ...modern,backgroundPolicy:{kind:'site-budget.v3'}}}),
    {code:'E_TOOL_RUNTIME_POLICY_UNSUPPORTED'});
  const legacy={...modern,backgroundPolicy:undefined};
  assert.equal((await verifyMarketplaceToolRuntime({api,tool:legacy})).serviceReady,true);
});
