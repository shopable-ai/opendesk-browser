import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Script} from 'node:vm';

const read=path=>readFile(path,'utf8');
test('R3 remains immutable reference; R4 preview keeps installed Discover and independent full catalog',async()=>{
  const [r3,r4]=await Promise.all([
    read('examples/ui/sidebar-r3-light-preview.html'),
    read('examples/ui/sidebar-r4-installed-discovery-preview.html')
  ]);
  assert.match(r3,/<title>OpenDesk Sidebar/,'R3 reference still exists');
  for(const value of ['tasks','discover','develop'])
    assert.match(r4,new RegExp('data-tab="'+value+'"'),'three Sidebar tabs: '+value);
  assert.match(r4,/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(r4,/drawLocalDiscovery\(/);
  assert.match(r4,/demo-card-group/);
  assert.match(r4,/data-action="catalog"/);
  assert.match(r4,/模拟点击不代表真实 Chrome/);
  const inline=r4.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert(inline,'R4 has real inline demo behavior');
  assert.doesNotThrow(()=>new Script(inline), 'R4 inline JavaScript must parse');
});
test('R5 official sidebar preserves three views, privileged controls, compact discovery and task history',async()=>{
  const [html,css,work]=await Promise.all([
    read('src/ui/tool.html'),read('src/ui/tool-shell.css'),read('src/ui/task-workbench.js')
  ]);
  const ids=[...html.matchAll(/id="([^"]+)"/g)].map(match=>match[1]);
  assert.equal(ids.length,new Set(ids).size,'no duplicate DOM IDs');
  for(const value of ['tab-my-tasks','tab-discover','tab-develop','workbench-local-discover',
    'task-selected-workspace','task-history','task-params-form','task-run','task-stop',
    'workspace-dock','task-result-panel','task-history-panel','local-discover-open-catalog','script-source','script-run','script-save',
    'page-preview-run','sdk-install','task-install-feedback'])assert(ids.includes(value),'preserved '+value);
  assert.doesNotMatch(html,/id="discover-dock"|id="discover-to-catalog"/,'idle Discover should have no persistent footer');
  assert.match(work,/function renderLocalDiscovery\(/);
  assert.match(work,/group\.append\(workspace\)/,'active task owns its details');
  assert.match(work,/new BroadcastChannel|new globalThis\.BroadcastChannel/);
  assert.match(work,/listTaskCatalog/,'broadcast does not replace authoritative data');
  assert.match(css,/task-history-entry/);
  assert.match(css,/grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
});

test('R5 keeps one derived interactive prototype with installed-only compact discovery',async()=>{
  const r5=await read('examples/ui/sidebar-r5-compact-preview.html');
  assert.match(r5,/drawLocalDiscoveryR5/);
  assert.match(r5,/renderDockR5/);
  assert.match(r5,/data-tab="discover"/);
  assert.match(r5,/r5-search/);
  assert.match(r5,/搜索已安装任务/);
  assert.match(r5,/ui\.tab==='discover'&&!active/,'idle Discover has no footer');
  assert.match(r5,/所有|模拟点击不代表真实 Chrome/);
  const inline=r5.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert(inline,'one self-contained clickable HTML demo');
  assert.doesNotThrow(()=>new Script(inline),'R5 prototype script must parse');
});

test('Developer source selector and new-script action use one narrow Sidebar toolbar',async()=>{
  const [html,css,source]=await Promise.all([
    read('src/ui/tool.html'),read('src/ui/tool-shell.css'),read('src/ui/program-source.js')
  ]);
  const toolbar=html.match(/<div id="program-source-toolbar"[\s\S]*?<\/div>/)?.[0];
  assert.ok(toolbar,'one shared toolbar exists');
  assert.match(toolbar,/role="group" aria-label="源码视图操作"/);
  assert.match(toolbar,/id="program-source-files"[\s\S]*id="program-new-script"/);
  assert.match(toolbar,/<button type="button" id="program-new-script" title="[^"]+" aria-label="新建 JavaScript 草稿" hidden>新建<\/button>/);
  assert.doesNotMatch(toolbar,/新建单文件草稿|aria-haspopup=/,'there is only one create action, not a multi-file creation menu');
  assert.match(css,/\.program-source-toolbar\{display:flex;flex-wrap:nowrap;/);
  assert.match(css,/\.program-source-toolbar #program-source-files\{[^}]*flex:1 1 0;min-width:0;/);
  assert.match(css,/\.program-source-toolbar #program-new-script\{[^}]*flex:0 0 auto;[^}]*white-space:nowrap;/);
  assert.match(css,/\.program-source-toolbar #program-new-script\{[^}]*font-size:12px;/,'new action remains legible in a narrow Sidebar');
  assert.match(source,/get\('program-source-toolbar'\)\.hidden = !value/);
});
