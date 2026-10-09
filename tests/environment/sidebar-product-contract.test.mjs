import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read = path => readFile(path, 'utf8');

test('manifest exposes tool.html as a global Chrome Side Panel', async () => {
  const manifest=JSON.parse(await read('manifest.json'));
  assert.ok(manifest.permissions.includes('sidePanel'));
  assert.deepEqual(manifest.side_panel,{default_path:'ui/tool.html'});
  assert.equal(manifest.action.default_popup,undefined);
});

test('product shell has no popup-window fallback', async () => {
  const [environment,worker]=await Promise.all([read('src/environment.js'),read('src/sw.js')]);
  assert.match(environment,/configureSidePanel/);
  assert.doesNotMatch(environment,/createWindowShell|windows\.create\(/);
  assert.doesNotMatch(worker,/createWindowShell|shell\.open\(/);
});

test('default Run freezes Current Page then revalidates before existing RunHost', async () => {
  const [html,editor,target]=await Promise.all([read('src/ui/tool.html'),read('src/ui/script-editor.js'),read('src/ui/current-page-target.js')]);
  assert.match(html,/<option value="current">当前网页（默认）<\/option>/);
  assert.match(html,/id="script-running-target"/);
  const capture=editor.indexOf('currentPageTarget.capture()');
  const revalidate=editor.indexOf('await currentPageTarget.revalidate(chosen.candidate)');
  const start=editor.indexOf('const claim = await host.start');
  assert.ok(capture>=0 && revalidate>capture && start>revalidate);
  assert.match(target,/windows\.getCurrent\(\)/);
  assert.match(target,/tabs\.query\(\{active: true, windowId: boundWindowId\}\)/);
  assert.match(target,/documentId/);
  assert.match(target,/E_DOCUMENT_STALE/);
});

test('trusted Side Panel run sends the exact unsaved draft to the original Controller authority', async () => {
  const [html, editor, host, broker]=await Promise.all([
    read('src/ui/tool.html'), read('src/ui/script-editor.js'),
    read('src/run-host.js'), read('src/platform/host/controller-methods.js')]);
  assert.match(html,/id="script-run" disabled>运行草稿/);
  assert.match(editor,/sourceUtf8 = programSource\.source\(\)/);
  assert.match(editor,/host\.start\(\{source:\{kind:'draft',sourceUtf8\}/);
  assert.match(editor,/permissions\.request/);
  assert.doesNotMatch(editor,/请先保存或加载要运行的持久版本/);
  assert.match(host,/sourceRequest = source === undefined/);
  assert.match(broker,/sourceKind: isDraft \? 'draft' : 'saved'/);
  assert.match(broker,/digestUtf8\(run\.draftSourceUtf8\)/);
  assert.match(broker,/if \(host && run\.revision\?\.pinKey\)/);
  assert.doesNotMatch(editor,/\beval\s*\(|scripting\.executeScript/);
});

test('R6 uses valid tab roles with labelled content panels',async()=>{
  const html=await read('src/ui/tool.html');
  assert.match(html,/<nav class="workbench-nav" role="tablist"/);
  for(const [id,panel] of [['tab-my-tasks','workbench-tasks'],['tab-discover','workbench-local-discover'],['tab-develop','workbench-develop'],['tab-tools','workbench-tools']]){
    assert.match(html,new RegExp('id="'+id+'" role="tab"'));
    assert.match(html,new RegExp('id="'+panel+'" role="tabpanel" aria-labelledby="'+id+'"'));
  }
});

test('R4 Sidebar sections preserve consumer controls and keep engineering tools folded',async()=>{
  const html=await read('src/ui/tool.html'), css=await read('src/ui/tool-shell.css');
  const ids=[...html.matchAll(/id="([^"]+)"/g)].map(([,id])=>id);
  assert.equal(new Set(ids).size,ids.length);
  for(const id of ['script-current-page-title','developer-results-panel','script-task-status','tool-diagnostics','script-advanced','tab-discover','workbench-local-discover','task-selected-workspace','task-result-panel','task-history-panel','local-discover-open-catalog','open-catalog','task-stop','script-stop'])assert(ids.includes(id),id);
  assert.doesNotMatch(html, /id="discover-dock"|id="discover-to-catalog"/,'R5 Discover must not reserve an idle navigation dock');
  assert.doesNotMatch(html, /发现已安装任务<\/h2>|仅展示你明确安装的版本|找到.*个已安装任务.*本机共/);
  assert.match(html, /class="local-discovery-search-row"/);
  assert.match(html,/id="tab-my-tasks"[^>]*>我的<\/button>/);
  assert.ok(html.indexOf('id="sidebar-tools"')>html.indexOf('id="workbench-tools"'));
  assert.match(css,/grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(html, /id="task-history-panel" class="task-history-panel" hidden/);
  const advanced=html.slice(html.indexOf('<details id="tool-diagnostics">'));
  for(const id of ['sdk-install','check-source','check-target','scraping-panel'])assert(advanced.includes(`id="${id}"`));
  assert.match(css,/min-width:0/);assert.match(css,/overflow-wrap:anywhere/);
});

test('developer mode uses one accessible switch and keeps page details folded by default',async()=>{
  const [html,css]=await Promise.all([read('src/ui/tool.html'),read('src/ui/tool-shell.css')]);
  assert.match(html,/id="local-project-mode" type="checkbox" role="switch"/);
  assert.match(html,/id="local-project-tools" class="local-project-tools"[^>]* hidden/);
  assert.match(html,/<details id="developer-target-detail">\s*<summary class="developer-page-summary">/);
  assert.match(html,/id="script-current-page-host"/);
  assert.match(html,/id="script-current-page-status" role="status" aria-live="polite"/);
  assert.match(html,/id="developer-source-switch" class="developer-source-switch"/);
  assert.doesNotMatch(html,/id="local-project-mode"><option/);
  assert.doesNotMatch(html,/查看当前网页详细信息|源码来源|刷新连接/);
  assert.match(css,/input:focus-visible\+\.local-project-switch-track/);
  assert.match(css,/\.developer-page-summary\{display:flex;/);
  assert.match(css,/#script-current-page-host\{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis/);
  assert.match(css,/#script-current-page-status\{flex:none;/);
  assert.match(css,/\.developer-source-switch label\{[^}]*min-height:40px/);
});

test('Sidebar starts at its four tabs without repeating Chrome extension identity',async()=>{
  const [manifest,html,css]=await Promise.all([
    read('manifest.json').then(JSON.parse),read('src/ui/tool.html'),read('src/ui/tool-shell.css')
  ]);
  assert.equal(manifest.name,'OpenDesk Browser','retain Chrome-hosted extension name');
  assert.match(html,/<title>OpenDesk Browser<\/title>/,'retain document metadata title');
  assert.match(html,/<body>\s*<nav class="workbench-nav" role="tablist"/,'tabs should be the first visible row');
  assert.doesNotMatch(html,/class="workspace-(?:header|brand|logo)"/,'no duplicate in-page brand');
  assert.doesNotMatch(css,/\.workspace-(?:header|brand|logo)\b/,'remove orphaned header styles');
  for(const id of ['tab-my-tasks','tab-discover','tab-develop','tab-tools','workspace-content','workspace-dock'])
    assert.match(html,new RegExp('id="'+id+'"'));
});
