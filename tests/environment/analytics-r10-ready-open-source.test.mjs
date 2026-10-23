import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Source regression: this does NOT substitute for a real Chrome ready/open test.
const source=await readFile(new URL('../../src/ui/sidebar-tools.js',import.meta.url),'utf8');
test('only trusted explicit launch produces pending intent, never mount alone',()=>{
  assert.match(source,/function openTool\(id,\{launchGate=null,userInitiated=false\}/);
  assert.match(source,/if\(userInitiated===true\|\|launchGate!==null\)pendingAnalyticsOpen=instance/);
  assert.match(source,/if\(event\?\.isTrusted!==true\)return;\s*action\(\(\)=>openTool\(active\?\.id,\{userInitiated:true\}\)\)\(\)/);
  const fn=source.slice(source.indexOf('  function openTool('),source.indexOf('  // Management never mounts untrusted code.'));
  assert(!fn.includes("reportAnalytics('event.host_report','tool.opened'"),'mount start must not count as ready');
});
test('sandbox and audited native UI report only after verified ready, once per token',()=>{
  assert.match(source,/if\(message\.state==='ready'\)\{notice\(''\);reportReadyOpen\(message\.instance\);\}/);
  assert.match(source,/frameRoot\.dataset\.bookmarkTrusted='true';\s*render\(\);notice\(''\);reportReadyOpen\(token\)/);
  assert.match(source,/frameRoot\.dataset\.timeReviewNative='true';\s*render\(\);notice\(''\);reportReadyOpen\(token\)/);
  assert.match(source,/pendingAnalyticsOpen=null; \/\/ consume before dispatch/);
  assert.match(source,/const carryOpen=forceSandbox&&instance!==null&&pendingAnalyticsOpen===instance/);
  assert.match(source,/function suspendTool\(\) \{pendingAnalyticsOpen=null/);
});
