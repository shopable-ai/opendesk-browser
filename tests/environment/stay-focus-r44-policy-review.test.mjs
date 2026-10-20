import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compareSidebarToolBackgroundPolicies,describeSidebarToolBackgroundPolicyChange}
  from '../../src/ui/sidebar-tools/background-policy-review.js';

const suggestion=(host,name=host)=>({host,name,category:'娱乐',suggestLimit:true,quick:false});
const schedule={enabled:false,days:[1,2,3,4,5],startMinute:540,endMinute:1020};
const policy=(sites=['youtube.com'],minutes=30)=>({
  kind:'site-budget.v2',dailyMinutes:minutes,defaultSites:sites,schedule,
  suggestions:[suggestion('youtube.com'),suggestion('pinterest.com'),suggestion('reddit.com')]
});
test('v2 package-only upgrade produces a bounded review of additions and removals',()=>{
  const previous=policy(['youtube.com','reddit.com'],30);
  const candidate={...policy(['youtube.com','pinterest.com'],42),
    suggestions:[suggestion('youtube.com'),suggestion('pinterest.com','Pinterest')]};
  const diff=compareSidebarToolBackgroundPolicies(previous,candidate);
  assert.deepEqual(diff.addedDefaults,['pinterest.com']);
  assert.deepEqual(diff.removedDefaults,['reddit.com']);
  assert.deepEqual(diff.removedSuggestions,['reddit.com']);
  assert.deepEqual(diff.changedSuggestions,['pinterest.com']);
  assert.equal(diff.dailyMinutesChanged,true);
  assert.equal(diff.scopeKnown,true);
  const description=describeSidebarToolBackgroundPolicyChange(previous,candidate);
  assert.match(description,/pinterest\.com/);
  assert.match(description,/reddit\.com/);
  assert.match(description,/30 → 42/);
  assert.match(description,/不会?.*自动覆盖|不因更新自动覆盖/);
  assert.deepEqual(previous.defaultSites,['youtube.com','reddit.com'],'comparison is read-only');
});
test('legacy policy cannot invent missing old default-site scopes',()=>{
  const old={kind:'site-budget.v1',suggestions:[suggestion('youtube.com')]};
  const diff=compareSidebarToolBackgroundPolicies(old,policy());
  assert.equal(diff.scopeKnown,false);
  assert.deepEqual(diff.addedDefaults,[]);
  assert.match(describeSidebarToolBackgroundPolicyChange(old,policy()),/人工核对/);
  assert.equal(compareSidebarToolBackgroundPolicies(undefined,undefined),null);
});
test('unsupported code or an out-of-contract site is denied before review',()=>{
  assert.throws(()=>compareSidebarToolBackgroundPolicies(undefined,
    {...policy(),backgroundJs:'eval(1)'}),{code:'E_TOOL_POLICY'});
  assert.throws(()=>compareSidebarToolBackgroundPolicies(undefined,
    {...policy(),defaultSites:['unaudited.example']}),{code:'E_TOOL_POLICY'});
});
test('installed Stay Focus offers explicit per-site review, without a sandbox Chrome rule writer',()=>{
  const app=readFileSync(new URL('../../examples/sidebar-tools/stay-focus/src/main.js',import.meta.url),'utf8');
  const html=readFileSync(new URL('../../examples/sidebar-tools/stay-focus/src/index.html',import.meta.url),'utf8');
  const host=readFileSync(new URL('../../src/ui/sidebar-tools.js',import.meta.url),'utf8');
  const controls=readFileSync(new URL('../../examples/sidebar-tools/stay-focus/trusted/host-controls.js',import.meta.url),'utf8');
  assert.match(app,/api\.request\('focus\.status'/,
    'React reads live worker status, not a local list of recommendations');
  assert.match(app,/const sites=state\?\.sites\|\|\[\]/,
    'rendered sites must come from explicit persisted rules, not catalog defaults');
  assert.match(app,/operate\('focus\.site\.put'/);
  assert.match(app,/SiteEditor/);
  assert.match(html,/id="tool-app"/);
  assert.match(controls,/const managedSite=\(/,
    'fixed trusted Side Panel owns host-to-site matching');
  assert.match(controls,/await pageTarget\.revalidate\(captured\)/,
    'trusted site writes must revalidate the current Chrome page');
  assert.match(controls,/runOperation\('focus\.site\.put'/,
    'trusted quick-add writes through the precompiled Host');
  assert.match(host,/describeSidebarToolBackgroundPolicyChange\(/);
  assert.doesNotMatch(app,/chrome\.(?:declarativeNetRequest|alarms|idle)\./);
});
