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
  assert.match(css,/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
});
