import {renderSidebarFixture} from '../helpers/sidebar-react-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {mkdtemp,readFile,rm,writeFile,symlink,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {validateSidebarToolPackage,sidebarToolStorageKey,SIDEBAR_TOOL_FORMAT} from '../../src/ui/sidebar-tools/package.js';
import {buildSidebarTool,promoteSidebarToolPackage,checkSidebarToolProjectPackage} from '../../scripts/build-sidebar-tool.mjs';
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
test('portable Sidebar Tool builds to candidate first and only explicit verified promotion updates one project JSON',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'opendesk-tool-distribution-'));
  const id='bundle-sync-test',version='1.0.0';
  const projectBundle=join(dir,id+'.opendesk-tool.json');
  const candidate=join(dir,'temporary','candidate.json');
  const artifactDir=join('artifacts','sidebar-tools',id);
  try{
    const config={id,version,title:'测试安装包',description:'发行文件一致性',capabilities:[],
      files:{html:'index.html',css:'style.css',js:'main.js'},assets:[]};
    await Promise.all([
      writeFile(join(dir,'tool.config.json'),JSON.stringify(config)),
      writeFile(join(dir,'index.html'),'<main>Test</main>'),
      writeFile(join(dir,'style.css'),''),
      writeFile(join(dir,'main.js'),'void 0;'),
      writeFile(projectBundle,'LAST_KNOWN_GOOD')
    ]);
    const staged=await buildSidebarTool(dir,{out:candidate});
    await assert.rejects(buildSidebarTool(dir,{out:projectBundle}),/do not write an untested installable JSON/);
    const aliasedProject=join(dir,'tool-alias');
    await symlink(dir,aliasedProject);
    await assert.rejects(buildSidebarTool(dir,{out:join(aliasedProject,id+'.opendesk-tool.json')}),
      /do not write an untested installable JSON/);
    assert.equal(staged.installed,false);
    assert.equal(await readFile(projectBundle,'utf8'),'LAST_KNOWN_GOOD',
      'normal build never overwrites the installable project package');
    assert.equal((await buildSidebarTool(dir)).projectOutput,undefined);
    assert.equal(await readFile(projectBundle,'utf8'),'LAST_KNOWN_GOOD');
    await assert.rejects(checkSidebarToolProjectPackage(dir),/differs from current source/);
    await assert.rejects(promoteSidebarToolPackage(dir,{from:join(dir,'missing.json')}),/ENOENT/);
    await writeFile(candidate,'corrupt candidate');
    await assert.rejects(promoteSidebarToolPackage(dir,{from:candidate}),/candidate is stale/);
    assert.equal(await readFile(projectBundle,'utf8'),'LAST_KNOWN_GOOD');
    await buildSidebarTool(dir,{out:candidate});
    await writeFile(join(dir,'main.js'),'void 1;');
    await assert.rejects(promoteSidebarToolPackage(dir,{from:candidate}),/candidate is stale/);
    assert.equal(await readFile(projectBundle,'utf8'),'LAST_KNOWN_GOOD',
      'an old candidate cannot overwrite the previous project package');
    await buildSidebarTool(dir,{out:candidate});
    const promoted=await promoteSidebarToolPackage(dir,{from:candidate});
    assert.equal(promoted.status,'PROJECT_PACKAGE_PROMOTED');
    assert.equal(promoted.output,await realpath(projectBundle));
    assert.equal(await readFile(projectBundle,'utf8'),await readFile(candidate,'utf8'));
    assert.equal((await checkSidebarToolProjectPackage(dir)).sha256,promoted.sha256);
    assert.equal((await promoteSidebarToolPackage(dir,{from:candidate})).unchanged,true);
    const conflicting=join(dir,id+'-old.opendesk-tool.json');
    await writeFile(conflicting,'obsolete');
    await assert.rejects(promoteSidebarToolPackage(dir,{from:candidate}),/multiple installable packages/);
    await rm(conflicting);
    await rm(projectBundle);
    await symlink(join(dir,'main.js'),projectBundle);
    await assert.rejects(promoteSidebarToolPackage(dir,{from:candidate}),/regular file/);
    assert.equal(await readFile(join(dir,'main.js'),'utf8'),'void 1;',
      'refusing a symlink cannot write through it');
  }finally{
    await rm(dir,{recursive:true,force:true});
    await rm(artifactDir,{recursive:true,force:true});
  }
});
test('new sandbox uses isolated Chrome MV3 resource and a narrow host message protocol',async()=>{
  const [manifest,runner,host,toolHtml,buildContract,verify,taskHost]=await Promise.all([
    readFile('manifest.json','utf8').then(JSON.parse),readFile('src/sidebar-tools/bridge.js','utf8'),
    readFile('src/ui/sidebar-tools.js','utf8'),renderSidebarFixture(),
    readFile('scripts/build-contract.mjs','utf8'),readFile('scripts/verify-package.mjs','utf8'),
    readFile('src/ui/task-workbench.js','utf8')
  ]);
  assert.deepEqual(manifest.sandbox.pages,['scripting/sandbox/sandbox.html','sidebar-tools/sandbox.html']);
  assert.equal(manifest.side_panel.default_path,'sidepanel.html');
  assert.doesNotMatch(toolHtml,/id="sidebar-tool-list"/,'the React extension list is the only list owner');
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
  const [html,css,host,design]=await Promise.all([
    renderSidebarFixture(),readFile('src/ui/tool-shell.css','utf8'),
    readFile('src/ui/sidebar-tools.js','utf8'),
    readFile('src/ui/design-system.css','utf8')
  ]);
  const {document}=parseHTML(html);
  assert.equal(document.getElementById('sidebar-tool-import').hidden,true);
  assert.equal(document.getElementById('sidebar-tool-preview').hidden,true);
  assert.ok(document.getElementById('extension-center-import'),'the React extension center owns the import trigger');
  assert.equal(document.getElementById('sidebar-tool-list'),null);
  assert.match(html,/id="sidebar-tool-back"/);
  assert.match(html,/id="workbench-tools" role="tabpanel"/);
  assert.doesNotMatch(html,/id="sidebar-tool-tabs"/);
  assert.match(html,/id="task-open-catalog"/);
  assert.match(css,/\.sidebar-tools-head\{margin:0 0 8px\}/,'Tools header uses the same 8px vertical rhythm as My');
  assert.match(css,/\.sidebar-tool-import\{min-width:0;margin:0 0 8px;padding:10px;/,'import panel stays compact below the header');
  assert.match(css,/\.sidebar-tool-view-head\{[^}]*min-height:34px;margin-bottom:8px;/,'opened tool header matches the compact toolbar rhythm');
  assert.match(css,/\.task-section-head\{margin:0 0 8px/);
  assert.match(host,/setVisible\(next(?:,destination=null)?\)/);
  assert.doesNotMatch(host,/function render(?:Installed|Official)Tools|className='sidebar-tool-row'/,'the Host cannot render a second extension list');
  assert.match(host,/view\.bind\(field\.key,type,fn\)/,'presentation events use the View action interface');
  assert.match(design,/\.od-icon-button\{[^}]*width:var\(--od-icon-size\)/,'the three compact actions reuse the shared 34px icon size');
  assert.doesNotMatch(css,/\.sidebar-tools-actions \.od-icon-button\{/,'tool CSS must not restyle shared icon buttons');
  assert.match(html,/id="sidebar-tool-file-error"/);
  assert.match(html,/id="sidebar-tool-update-versions"/);
  assert.match(host,/patchToolField\(view, preview, \{hidden: false\}\)/);
  assert.match(host,/patchToolField\(view, installButton, \{disabled: identical\}\)/);
  assert.match(host,/if\(!visible\)\{setImportOpen\(false\);suspendTool\(\);return;\}/,
    'Leaving Tools closes the trusted Bookmark Manager and retires the installed sandbox');
  assert.doesNotMatch(host,/if\(!active && !listRequested/,'Tools tab may not auto-start a saved mini-app');
});
