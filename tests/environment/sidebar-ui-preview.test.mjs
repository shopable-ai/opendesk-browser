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
test('R15 official sidebar preserves five views, privileged controls, compact discovery and task history',async()=>{
  const [html,css,work]=await Promise.all([
    read('src/ui/tool.html'),read('src/ui/tool-shell.css'),read('src/ui/task-workbench.js')
  ]);
  const ids=[...html.matchAll(/id="([^"]+)"/g)].map(match=>match[1]);
  assert.equal(ids.length,new Set(ids).size,'no duplicate DOM IDs');
  for(const value of ['tab-my-tasks','tab-discover','tab-workflow','tab-develop','tab-tools','workbench-workflow','workbench-tools','workbench-local-discover',
    'task-selected-workspace','task-history','task-params-form','task-run','task-stop',
    'workspace-dock','task-result-panel','task-history-panel','local-discover-open-catalog','script-source','script-run','script-save',
    'page-preview-run','sdk-install','task-install-feedback'])assert(ids.includes(value),'preserved '+value);
  assert.doesNotMatch(html,/id="discover-dock"|id="discover-to-catalog"/,'idle Discover should have no persistent footer');
  assert.match(work,/function renderLocalDiscovery\(/);
  assert.match(work,/group\.append\(workspace\)/,'active task owns its details');
  assert.match(work,/new BroadcastChannel|new globalThis\.BroadcastChannel/);
  assert.match(work,/listTaskCatalog/,'broadcast does not replace authoritative data');
  assert.match(css,/task-history-entry/);
  assert.match(css,/grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
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

test('R19 Sidebar spacing and corner system is consistent across all five tabs',async()=>{
  const [html,css]=await Promise.all([read('src/ui/tool.html'),read('src/ui/tool-shell.css')]);
  const body=selector=>{
    const at=css.indexOf(selector+'{');
    assert.ok(at>=0,'missing CSS rule '+selector);
    return css.slice(at+selector.length+1,css.indexOf('}',at));
  };
  for(const tab of ['tasks','local-discover','workflow','develop','tools'])
    assert.match(html,new RegExp('data-workbench-page="'+tab+'"'),'preserved view '+tab);
  assert.match(body(':root'),/--space-2:8px;--space-3:12px/);
  assert.match(body(':root'),/--radius-control:8px;--radius-surface:12px;--radius-pill:999px/);
  assert.match(body('button'),/border-radius:var\(--radius-control\)/);
  assert.match(body('.dock-buttons button'),/border-radius:var\(--radius-control\)/);
  assert.match(body('#workspace-content #workbench-develop'),/display:grid;gap:var\(--space-2\)/);
  assert.match(body('#workbench-develop .developer-editor'),/display:grid;gap:var\(--space-2\)/);
  assert.match(body('#workbench-develop #manual-source-editor'),/display:grid;gap:var\(--space-2\)/);
  assert.match(body('#workbench-develop .local-project-tools>:not([hidden])'),/margin-block:0/);
  for(const selector of ['#developer-target-detail','.developer-source-switch','#script-source','.program-source-toolbar','.developer-params','.developer-results','#script-library-tools,#page-preview-tools,#script-advanced','#tool-diagnostics'])
    assert.match(body(selector),/margin:(?:0|0;)/,'no competing vertical margins: '+selector);
  assert.match(body('.local-discovery-filters'),/display:inline-flex;[^}]*border-radius:var\(--radius-surface\)/);
  assert.match(body('.local-discovery-filters button'),/border-radius:var\(--radius-control\)/);
  assert.doesNotMatch(body('.local-discovery-filters button'),/border-radius:18px/);
  assert.match(body('.local-discovery-import'),/border-radius:var\(--radius-control\)/);
  for(const selector of ['.task-card-group','.local-discovery-list','.sidebar-tool-row','.sidebar-tool-official','.workflow-card','.workflow-composer'])
    assert.match(body(selector),/border-radius:var\(--radius-surface\)/,'consistent card corners: '+selector);
  for(const selector of ['.task-card-state,.local-discovery-state','.local-project-switch-track','.workflow-pill','.catalog-card-state'])
    assert.match(body(selector),/border-radius:var\(--radius-pill\)/,'semantic pill corners: '+selector);
  for(const selector of ['.workflow-chat-entry','.workflow-ai-approval','.sidebar-tool-capabilities','.workflow-target-warning'])
    assert.match(body(selector),/border-radius:var\(--radius-control\)/,'shared inside-control radius: '+selector);
  assert.match(body('#script-source'),/border-radius:var\(--radius-surface\)/,'editor is a code surface');
  assert.match(body('.catalog-reader-note'),/border-radius:var\(--radius-control\)/,'catalog hints share control radius');
  assert.match(body('.workbench-nav button'),/border-radius:0/,'tab underline remains square intentionally');
  assert.match(body('.local-discovery-card'),/border-radius:0!important/,'list rows stay flush intentionally');
  assert.match(css,/:focus-visible/,'keyboard focus state remains visible');
});
