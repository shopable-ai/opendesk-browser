import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {requestedToolId,toolPageHref,validToolId,canonicalToolHostUrl,requestedPreviewId,toolPreviewHref} from '../../src/ui/sidebar-tools/navigation.js';
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

test('first committed full-tab host URL retains only a valid tool locator',()=>{
  const host='host-4fdd02c4-9ca4-4d05-9339-b83519872636';
  const start='chrome-extension://abcdefghijklmnopabcdefghijklmnop/ui/tool.html?toolId=quick-notes&junk=unsafe#fragment';
  const next=new URL(canonicalToolHostUrl(start,host));
  assert.equal(next.searchParams.get('toolId'),'quick-notes','the first location.replace must not silently drop toolId');
  assert.equal(next.searchParams.get('hostInstanceId'),host);
  assert.equal(next.searchParams.has('junk'),false);
  assert.equal(next.hash,'');
  const rejected=new URL(canonicalToolHostUrl(start.replace('quick-notes','..%2Fmalicious'),host));
  assert.equal(rejected.searchParams.has('toolId'),false);
  assert.equal(canonicalToolHostUrl(start.replace('quick-notes','quick-notes&toolId=evil'),host).includes('toolId='),false);
});

test('ephemeral read-only preview route survives first navigation and excludes installed-tool routes',()=>{
  const id='00000000-0000-4000-8000-000000000001';
  const route=toolPreviewHref(runtime,id);
  assert.equal(requestedPreviewId(route),id);
  const canonical=canonicalToolHostUrl(route,'host-4fdd02c4-9ca4-4d05-9339-b83519872636');
  assert.equal(requestedPreviewId(canonical),id);
  assert.equal(requestedToolId(canonical),null);
  assert.equal(requestedPreviewId(route+'&previewId='+id),null);
  const mixed=canonicalToolHostUrl(route+'&toolId=quick-notes','host-4fdd02c4-9ca4-4d05-9339-b83519872636');
  assert.equal(requestedToolId(mixed),null);assert.equal(requestedPreviewId(mixed),null);
  assert.throws(()=>toolPreviewHref(runtime,'../../etc'),/invalid preview ID/);
});
