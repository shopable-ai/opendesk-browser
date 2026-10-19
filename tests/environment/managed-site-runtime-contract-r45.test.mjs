import test from 'node:test';
import assert from 'node:assert/strict';
import {MANAGED_SITE_RUNTIME_CONTRACT,assertManagedSitePolicySupported}
  from '../../src/platform/host/managed-site-runtime-contract.js';
const runtime={managedSiteRuntime:{contract:MANAGED_SITE_RUNTIME_CONTRACT,
  policyKinds:['site-budget.v1','site-budget.v2'],privilegedJs:false}};
const packageWith=kind=>({backgroundPolicy:{kind}});
test('public runtime admission accepts only advertised code-free policy kinds',()=>{
  for(const kind of ['site-budget.v1','site-budget.v2'])
    assert.doesNotThrow(()=>assertManagedSitePolicySupported(packageWith(kind),runtime));
  for(const kind of ['site-budget.v3','arbitrary-js.v1'])
    assert.throws(()=>assertManagedSitePolicySupported(packageWith(kind),runtime),
      {code:'E_TOOL_RUNTIME_POLICY_UNSUPPORTED'});
});
test('runtime contract refuses missing or spoofed declarations and privileged JS',()=>{
  for(const invalid of [null,{},
    {managedSiteRuntime:{...runtime.managedSiteRuntime,contract:'other'}},
    {managedSiteRuntime:{...runtime.managedSiteRuntime,policyKinds:'site-budget.v2'}},
    {managedSiteRuntime:{...runtime.managedSiteRuntime,privilegedJs:true}}])
    assert.throws(()=>assertManagedSitePolicySupported(packageWith('site-budget.v2'),invalid),
      {code:'E_TOOL_RUNTIME_POLICY_UNSUPPORTED'});
  assert.doesNotThrow(()=>assertManagedSitePolicySupported({id:'legacy'},{}));
});
