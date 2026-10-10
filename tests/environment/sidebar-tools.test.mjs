import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,writeFile,symlink} from 'node:fs/promises';
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
test('tool packer rejects traversal, symlink escape, oversized assets and duplicate assets',async()=>{
  const temp=await mkdtemp(join(tmpdir(),'opendesk-tool-boundary-'));
  const outside=await mkdtemp(join(tmpdir(),'opendesk-tool-outside-'));
  try{
    const meta={id:'safe-tool',version:'1.0.0',title:'测试',description:'边界',capabilities:[],files:{html:'view.html',css:'view.css',js:'view.js'},assets:[]};
    const config=async value=>writeFile(join(temp,'tool.config.json'),JSON.stringify(value));
    await writeFile(join(temp,'view.html'),'<p>{{asset:huge.png}}</p>');await writeFile(join(temp,'view.css'),'');await writeFile(join(temp,'view.js'),'void 0;');
    await config({...meta,files:{...meta.files,js:'../outside.js'}});
    await assert.rejects(buildSidebarTool(temp),/relative path/);
    await writeFile(join(outside,'external.js'),'void 0;');await symlink(join(outside,'external.js'),join(temp,'escape.js'));
    await config({...meta,files:{...meta.files,js:'escape.js'}});await assert.rejects(buildSidebarTool(temp),/symlink escaped/);
    await writeFile(join(temp,'huge.png'),Buffer.alloc(96*1024+1));
    await config({...meta,assets:['huge.png']});await assert.rejects(buildSidebarTool(temp),/exceeds budget/);
    await config({...meta,assets:['huge.png','huge.png']});await assert.rejects(buildSidebarTool(temp),/invalid asset list/);
  }finally{await rm(temp,{recursive:true,force:true});await rm(outside,{recursive:true,force:true});}
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
  assert.match(toolHtml,/id="sidebar-tool-list"/);
  assert.match(toolHtml,/id="tab-tools"/);
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


test('R14 Sidebar tool intake requires separate review, install and explicit launch',async()=>{
  const [html,css,host,work]=await Promise.all([
    readFile('src/ui/tool.html','utf8'),readFile('src/ui/tool-shell.css','utf8'),
    readFile('src/ui/sidebar-tools.js','utf8'),readFile('src/ui/task-workbench.js','utf8')
  ]);
  assert.match(html,/id="sidebar-tool-import" class="sidebar-tool-import od-surface" hidden/);
  assert.match(html,/id="sidebar-tool-preview" class="sidebar-tool-preview" hidden/);
  assert.match(html,/id="sidebar-tool-import-trigger" aria-expanded="false"/);
  assert.match(html,/id="sidebar-tool-list"/);
  assert.match(html,/id="sidebar-tool-back"/);
  assert.match(html,/id="workbench-tools" role="tabpanel"/);
  assert.doesNotMatch(html,/id="sidebar-tool-tabs"/);
  assert.match(html,/id="task-open-catalog"/);
  assert.match(css,/\.sidebar-tools-head\{margin:0 0 8px\}/,'Tools header uses the same 8px vertical rhythm as My');
  assert.match(css,/\.sidebar-tool-import\{min-width:0;margin:0 0 8px;padding:10px;/,'import panel stays compact below the header');
  assert.match(css,/\.sidebar-tool-list\{display:grid;gap:8px;margin:0\}/,'installed tools align to the same spacing as installed tasks');
  assert.match(css,/\.sidebar-tool-list:empty\{display:none\}/,'an empty grid cannot add phantom top spacing');
  assert.match(css,/\.sidebar-tool-empty\{margin:0;padding:16px 12px;/,'empty state is not separated by stacked margins');
  assert.match(css,/\.sidebar-tool-view-head\{[^}]*min-height:34px;margin-bottom:8px;/,'opened tool header matches the compact toolbar rhythm');
  assert.match(css,/\.task-section-head\{margin:0 0 8px/);
  assert.match(host,/empty\.hidden=installed\.length!==0/);
  assert.match(host,/setVisible\(next\)/);
  assert.match(host,/className='sidebar-tool-row'/,'each tool owns its Open and uninstall controls');
  assert.match(host,/action\(\(\)=>remove\(row\.id\)\)/,'uninstall works directly from the list');
  assert.match(css,/\.sidebar-tool-list-remove\{/,'list action remains compact without nesting a second tab bar');
  assert.match(html,/id="sidebar-tool-file-error"/);
  assert.match(html,/id="sidebar-tool-update-versions"/);
  assert.match(host,/preview\.hidden=false/);
  assert.match(host,/installButton\.disabled=identical/);
  assert.match(host,/if\(!visible\)\{suspendTool\(\);return;\}/);
  assert.doesNotMatch(host,/if\(!active && !listRequested/,'Tools tab may not auto-start a saved mini-app');
  assert.match(work,/listen\(get\('task-open-catalog'\),'click'/);
});
