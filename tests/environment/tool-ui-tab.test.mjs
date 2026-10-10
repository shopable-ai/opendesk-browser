import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {requestedToolId,toolPageHref,validToolId} from '../../src/ui/sidebar-tools/navigation.js';
const runtime={getURL:path=>'chrome-extension://abcdefghijklmnopabcdefghijklmnop/'+path};
test('fixed full-page routes carry an installed ID, not a path or credential',()=>{
  assert.equal(toolPageHref(runtime,'quick-notes'),'chrome-extension://abcdefghijklmnopabcdefghijklmnop/ui/tool.html?toolId=quick-notes');
  assert.equal(requestedToolId(toolPageHref(runtime,'quick-notes')),'quick-notes');
  for(const id of ['','../foo','foo/bar','foo?x=1','🔥','a'.repeat(41)]){
    assert.equal(validToolId(id),false);
    assert.throws(()=>toolPageHref(runtime,id),/工具 ID 无效/);
  }
  assert.equal(requestedToolId('chrome-extension://abc/ui/tool.html?toolId=foo&toolId=bar'),null);
  assert.equal(requestedToolId('chrome-extension://abc/ui/tool.html?toolId=%2Fetc%2Fpasswd'),null);
  assert.equal(requestedToolId('chrome-extension://abc/ui/tool.html'),null);
});
test('full-page routing retains original sandbox and manifest boundaries',async()=>{
  const [shell,tools,html,manifest]=await Promise.all([
    readFile('src/ui/tool-shell.js','utf8'),readFile('src/ui/sidebar-tools.js','utf8'),
    readFile('src/ui/tool.html','utf8'),readFile('manifest.json','utf8').then(JSON.parse)
  ]);
  assert.match(shell,/await sidebarTools\.ready/);
  assert.match(shell,/taskWorkbench\.navigate\('tools'\)/);
  assert.match(tools,/toolPageHref\(api\.runtime,tool\.id\)/);
  assert.match(tools,/frame\.src=api\.runtime\.getURL\('sidebar-tools\/sandbox\.html'\)/);
  assert.match(html,/id="sidebar-tool-open-tab"/);
  assert.deepEqual(manifest.sandbox.pages,['scripting/sandbox/sandbox.html','sidebar-tools/sandbox.html']);
});
