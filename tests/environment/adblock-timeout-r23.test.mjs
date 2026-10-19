// R2.3 source and contract tests. These do NOT claim Chrome/DNR execution.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {sidebarToolRequestTimeout,ADBLOCK_CONFIRM_OPERATIONS}
  from '../../src/sidebar-tools/bridge.js';

test('all four AdBlock writes wait beyond the real host review deadline',()=>{
  assert.deepEqual([...ADBLOCK_CONFIRM_OPERATIONS],[
    'adblock.enable','adblock.disable','adblock.site.set','adblock.site.restore']);
  for(const operation of ADBLOCK_CONFIRM_OPERATIONS)
    assert.ok(sidebarToolRequestTimeout(operation,'adblock')>90000,operation);
});
test('AdBlock status and unrelated tool request timing do not change',()=>{
  assert.equal(sidebarToolRequestTimeout('adblock.status','adblock'),8000);
  assert.equal(sidebarToolRequestTimeout('adblock.enable','quick-notes'),8000);
  assert.equal(sidebarToolRequestTimeout('storage.get','adblock'),8000);
  assert.equal(sidebarToolRequestTimeout('focus.status','stay-focus'),8000);
  assert.equal(sidebarToolRequestTimeout('focus.enable','stay-focus'),120000);
});
test('timeout loss never masquerades as AdBlock cancellation',async()=>{
  const src=await readFile(new URL('../../src/sidebar-tools/bridge.js',import.meta.url),'utf8');
  assert.match(src,/error\.code=uncertain\?'E_OUTCOME_UNKNOWN':'E_TOOL_TIMEOUT'/);
  assert.match(src,/waiting\.delete\(requestId\)/);
});
test('trusted review expiry is distinguishable from user cancellation',async()=>{
  const src=await readFile(new URL('../../src/ui/sidebar-tools.js',import.meta.url),'utf8');
  assert.match(src,/code:'E_ADBLOCK_CONFIRM_TIMEOUT'/);
  assert.match(src,/pendingAction=null;actionReview\.hidden=true;/);
  assert.match(src,/if\(toolId===ADBLOCK_ID\)clearTimeout\(timer\)/);
  assert.match(src,/code:'E_CANCELLED'/);
});
test('React follows uncertain writes with a single status read, not replay',async()=>{
  const src=await readFile(new URL('../../examples/sidebar-tools/adblock/src/App.jsx',import.meta.url),'utf8');
  assert.match(src,/needsReadback=true/);
  assert.match(src,/if\(queued\.current\|\|needsReadback\)/);
  assert.match(src,/void refresh\(true\)/);
});
