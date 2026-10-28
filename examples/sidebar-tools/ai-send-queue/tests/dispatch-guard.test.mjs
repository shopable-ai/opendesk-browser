import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../../../../src/scripting/user-scripts/installed-programs.js',import.meta.url),'utf8');
const start=source.indexOf('  async function sendQueueOperation(');
const end=source.indexOf('  function handleBoot(',start);
const method=source.slice(start,end);
test('queue uses the existing installed Page USER_SCRIPT only, no second sender',()=>{
  assert.ok(start>0&&end>start);
  assert.match(method,/admitsPinnedQueuePage\(row\)/);
  assert.match(method,/world:'USER_SCRIPT'/);
  assert.match(method,/execution\.managedUI\.worldId/);
  assert.doesNotMatch(method,/world:'MAIN'|window\.postMessage|chrome\.storage\.local\.set/);
});
test('sidepanel active tab is reread after async admission but before native dispatch',()=>{
  const recheck=method.indexOf('const [dispatchTab,dispatchFrames,dispatchSelected]');
  const lastInvoke=method.indexOf('const completion=Promise.resolve(native.execute(');
  assert.ok(recheck>0&&lastInvoke>recheck);
  const between=method.slice(recheck,lastInvoke);
  assert.match(between,/api\.tabs\.query\(\{active:true,windowId:target\.expectedWindowId\}\)/);
  assert.match(between,/dispatchSelected\[0\]\?\.id===target\.tabId/);
  assert.match(between,/dispatchFrame\?\.url===target\.expectedUrl/);
  assert.match(between,/permissionEpoch\(latest\)===epoch/);
  assert.match(between,/E_DOCUMENT_STALE/);
});
test('post-dispatch receipt rechecks exact document, active tab and grant; not claim effect from completed',()=>{
  const after=method.slice(method.indexOf('const [latest,afterTab,afterFrames,afterSelected]'));
  assert.match(after,/afterSelected\?\.length===1/);
  assert.match(after,/afterFrames\?\.some/);
  assert.match(after,/currentGrant|permissionEpoch\(latest\)===epoch/);
  assert.match(after,/await requireSiteGrant\(latest\)/);
});
