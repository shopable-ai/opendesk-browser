import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {validateSidebarToolPackage,sidebarToolStorageKey,SIDEBAR_TOOL_FORMAT} from '../../src/ui/sidebar-tools/package.js';
import {buildSidebarTool} from '../../scripts/build-sidebar-tool.mjs';
const example={format:SIDEBAR_TOOL_FORMAT,id:'notes-test',version:'1.0.0',title:'我的笔记',
  description:'demo',capabilities:['storage.local'],html:'<main><p>hello</p></main>',css:'.x{color:blue}',js:'void 0;'};
test('tool contract is independent of Task v1 and is closed by default',()=>{
  assert.equal(validateSidebarToolPackage(example).id,'notes-test');
  assert.equal(sidebarToolStorageKey('notes-test'),'opendesk.sidebar-tools.data.v1:notes-test');
  assert.throws(()=>validateSidebarToolPackage({...example,permissions:['cookies']}),/字段/);
  assert.throws(()=>validateSidebarToolPackage({...example,capabilities:['chrome.tabs']}),/能力/);
  assert.throws(()=>validateSidebarToolPackage({...example,html:'<script>alert(1)</script>'}),/HTML/);
  assert.throws(()=>validateSidebarToolPackage({...example,html:'<img src="x" onerror="alert(1)">' }),/HTML/);
  assert.throws(()=>validateSidebarToolPackage({...example,css:'@import url(https://evil.example/x.css)'}),/样式/);
  assert.throws(()=>validateSidebarToolPackage({...example,id:'../other'}),/格式/);
  assert.throws(()=>validateSidebarToolPackage({...example,js:'x'.repeat(220001)}),/过大/);
});
test('native tool directory packs JS/CSS/HTML and a local image into a portable JSON',async()=>{
  const temp=await mkdtemp(join(tmpdir(),'opendesk-tool-test-'));
  try{
    const path=join(temp,'test.opendesk-tool.json');
    const report=await buildSidebarTool('examples/sidebar-tools/quick-notes',{out:path});
    assert.equal(report.validated,true);
    assert.equal(report.installed,false);
    const parsed=validateSidebarToolPackage(JSON.parse(await readFile(path,'utf8')));
    assert.equal(parsed.id,'quick-notes');
    assert.ok(parsed.html.includes('data:image/png;base64,'));
    assert.ok(parsed.js.includes('OpenDeskTool'));
    assert.ok(!parsed.html.includes('{{asset:'));
    assert.deepEqual(parsed.capabilities,['storage.local','currentPage.read','tasks.open']);
  }finally{await rm(temp,{recursive:true,force:true});}
});
test('new sandbox uses isolated Chrome MV3 resource and a narrow host message protocol',async()=>{
  const [manifest,runner,host,toolHtml,buildContract,verify,taskHost]=await Promise.all([
    readFile('manifest.json','utf8').then(JSON.parse),readFile('src/sidebar-tools/bridge.js','utf8'),
    readFile('src/ui/sidebar-tools.js','utf8'),readFile('src/ui/tool.html','utf8'),
    readFile('scripts/build-contract.mjs','utf8'),readFile('scripts/verify-package.mjs','utf8'),
    readFile('src/ui/task-workbench.js','utf8')
  ]);
  assert.deepEqual(manifest.sandbox.pages,['scripting/sandbox/sandbox.html','sidebar-tools/sandbox.html']);
  assert.equal(manifest.side_panel.default_path,'ui/tool.html');
  assert.match(toolHtml,/id="sidebar-tool-tabs"/);
  assert.match(toolHtml,/id="sidebar-tool-frame"/);
  assert.match(toolHtml,/id="tab-my-tasks"/);
  assert.match(host,/event.origin!=='null'/);
  assert.match(host,/frame.contentWindow===source/);
  assert.match(host,/taskWorkbench.focusInstalledTask/);
  assert.match(host,/sidebarToolStorageKey\(tool.id\)/);
  assert.match(runner,/new Blob\(\[tool.js\]/);
  assert.match(runner,/event.source!==parent/);
  assert.match(buildContract,/'sidebar-tools\/bridge'/);
  assert.match(verify,/TOOL_SANDBOX_META_CSP/);
  assert.match(taskHost,/focusInstalledTask\(taskId\)/);
});
