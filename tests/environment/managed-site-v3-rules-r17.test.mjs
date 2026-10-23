import test from 'node:test';
import assert from 'node:assert/strict';
import {desiredManagedSiteV3Rules,isManagedSiteV3RuleId,managedSiteV3RuleRange}
  from '../../src/platform/chrome/managed-site-v3-rules.js';
import {normalizeManagedSiteV3Commit,assertManagedSiteV3ModelRef,canonicalManagedSiteV3ModelBytes}
  from '../../src/framework/sdk/site-budget-v3-policy.js';
const site=(host,{subdomains=true,enabled=true,pool='g:shared',limitMs=60000}={})=>({
  host,subdomains,enabled,pool,conditions:[{type:'counter-limit',limitMs}]});
const plan=(sites,whitelist=[])=>({kind:'site-budget.v3',enabled:true,sites,whitelist});
test('v3 native DNR uses fixed disjoint owner IDs and rejects unbounded code',()=>{
  const policy=plan([site('example.com'),site('sub.example.com',{enabled:false})],['safe.example.net']);
  const rules=desiredManagedSiteV3Rules(policy,{'g:shared':60000},1234567,1);
  assert.equal(rules.length,1);
  assert.equal(rules[0].action.type,'block');
  assert.equal(rules[0].id,managedSiteV3RuleRange(1).first);
  assert.ok(rules[0].condition.excludedRequestDomains.includes('sub.example.com'));
  assert.ok(rules[0].condition.excludedRequestDomains.includes('safe.example.net'));
  assert.ok(isManagedSiteV3RuleId(1,rules[0].id));
  assert.ok(!isManagedSiteV3RuleId(0,rules[0].id));
  assert.equal(desiredManagedSiteV3Rules({...policy,enabled:false},{},1234567,1).length,0);
  assert.equal(desiredManagedSiteV3Rules(policy,{},1234567,1).length,0);
  assert.throws(()=>desiredManagedSiteV3Rules({...policy,chromeRule:{id:8}}, {},1234567,1),
    {code:'E_SITE_BUDGET_V3_POLICY'});
});
test('v3 immutable model hash is verified independently of claimed digest',async()=>{
  const sealedModel={version:1,sites:[{host:'example.com',minutes:30}],groups:{}};
  const digest=await crypto.subtle.digest('SHA-256',
    canonicalManagedSiteV3ModelBytes(sealedModel));
  const modelRef=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
  const commit=normalizeManagedSiteV3Commit({expectedRev:0,desiredPolicy:plan([]),
    modelRef,sealedModel});
  assert.equal(await assertManagedSiteV3ModelRef(commit),true);
  assert.equal(await assertManagedSiteV3ModelRef({...commit,
    sealedModel:{groups:{},sites:sealedModel.sites,version:1}}),true,
    'Storage key insertion order must not affect sealed model identity');
  await assert.rejects(()=>assertManagedSiteV3ModelRef({...commit,modelRef:'0'.repeat(64)}),
    {code:'E_SITE_BUDGET_V3_POLICY'});
  assert.throws(()=>normalizeManagedSiteV3Commit({...commit,sealedModel:JSON.parse('{"__proto__":"not allowed"}')}));
});
