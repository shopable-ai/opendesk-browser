import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {load} from 'cheerio';
import {renderSidebarFixture} from '../helpers/sidebar-react-fixture.mjs';
const read=path=>readFile(path,'utf8');
const rendered=async()=>load(await renderSidebarFixture());

test('manifest exposes sidepanel.html as a global Chrome Side Panel',async()=>{
  const manifest=JSON.parse(await read('manifest.json'));
  assert.ok(manifest.permissions.includes('sidePanel'));
  assert.deepEqual(manifest.side_panel,{default_path:'sidepanel.html'});
  assert.equal(manifest.action.default_popup,undefined);
});

test('product shell has no popup-window fallback',async()=>{
  const [environment,worker]=await Promise.all([read('src/environment.js'),read('src/sw.js')]);
  assert.match(environment,/configureSidePanel/);
  assert.doesNotMatch(environment,/createWindowShell|windows\.create\(/);
  assert.doesNotMatch(worker,/createWindowShell|shell\.open\(/);
});

test('default Run freezes Current Page then revalidates before existing RunHost',async()=>{
  const [$,editor,target]=await Promise.all([rendered(),read('src/ui/script-editor.js'),read('src/ui/current-page-target.js')]);
  assert.equal($('#script-target-mode option[value=current]').text(),'当前网页（默认）');
  assert.equal($('#script-target-mode option[value=current]').is('[selected]'),true);
  assert.equal($('#script-running-target').length,1);
  const capture=editor.indexOf('currentPageTarget.capture()');
  const revalidate=editor.indexOf('await currentPageTarget.revalidate(chosen.candidate)');
  const start=editor.indexOf('const claim = await host.start');
  assert.ok(capture>=0&&revalidate>capture&&start>revalidate);
  assert.match(target,/windows\.getCurrent\(\)/);
  assert.match(target,/tabs\.query\(\{active: true, windowId: boundWindowId\}\)/);
  assert.match(target,/documentId/);assert.match(target,/E_DOCUMENT_STALE/);
});

test('trusted Side Panel run sends the exact unsaved draft to the original Controller authority',async()=>{
  const [$,editor,host,broker]=await Promise.all([rendered(),read('src/ui/script-editor.js'),
    read('src/run-host.js'),read('src/platform/host/controller-methods.js')]);
  assert.equal($('#script-run').is(':disabled'),true);
  assert.equal($('#script-run').text(),'运行草稿');
  assert.match(editor,/sourceUtf8 = programSource\.source\(\)/);
  assert.match(editor,/host\.start\(\{source:\{kind:'draft',sourceUtf8\}/);
  assert.match(editor,/requireChromePermissions/);
  assert.doesNotMatch(editor,/permissions\.request/,'draft and local preview runs inspect existing Chrome grants');
  assert.doesNotMatch(editor,/请先保存或加载要运行的持久版本/);
  assert.match(host,/sourceRequest = source === undefined/);
  assert.match(broker,/sourceKind: isDraft \? 'draft' : 'saved'/);
  assert.match(broker,/digestUtf8\(run\.draftSourceUtf8\)/);
  assert.match(broker,/if \(host && run\.revision\?\.pinKey\)/);
  assert.doesNotMatch(editor,/\beval\s*\(|scripting\.executeScript/);
});

test('R37 React renders five labelled production tab panels',async()=>{
  const $=load(await renderSidebarFixture({debugEnabled:false}));
  assert.equal($('nav.workbench-nav[role=tablist]').length,1);
  for(const [id,panel]of [['tab-my-tasks','workbench-tasks'],['tab-tools','workbench-tools'],
    ['tab-workflow','workbench-workflow'],['tab-develop','workbench-develop'],['tab-cloud','workbench-cloud']]){
    assert.equal($('#'+id+'[role=tab]').length,1);
    assert.equal($('#'+id).attr('aria-controls'),panel);
    assert.equal($('#'+panel+'[role=tabpanel]').attr('aria-labelledby'),id);
  }
  assert.equal($('#workbench-debug').length,0);
  assert.equal($('#tab-debug').is('[hidden]'),true);
});

test('R4 Sidebar sections preserve consumer controls and keep engineering tools folded',async()=>{
  const [$,css]=await Promise.all([rendered(),read('src/ui/tool-shell.css')]);
  const ids=$('[id]').map((_,node)=>$(node).attr('id')).get();
  assert.equal(new Set(ids).size,ids.length);
  for(const id of ['script-current-page-title','developer-results-panel','script-task-status','tool-diagnostics',
    'script-advanced','task-search-toggle','task-search-panel','extension-center-search','task-selected-workspace',
    'task-result-panel','task-history-panel','local-discover-search','open-catalog','task-stop','script-stop','workflow-stop','workflow-run'])
    assert.equal($('#'+id).length,1,id);
  assert.equal($('#discover-dock,#discover-to-catalog,#task-local-discovery,#local-discover-cards,#local-discover-open-catalog').length,0);
  assert.doesNotMatch($.root().text(),/查找本机任务/);
  assert.equal($('#task-search-panel').is('[hidden]'),true);
  assert.equal($('#task-search-toggle').attr('aria-expanded'),'false');
  const taskIds=$('#workbench-tasks [id]').map((_,node)=>$(node).attr('id')).get();
  assert.ok(taskIds.indexOf('task-search-panel')<taskIds.indexOf('task-installed-cards'));
  assert.equal($('.local-discovery-search-row.od-toolbar').length,1);
  assert.equal($('#tab-my-tasks').text(),'我的');
  assert.equal($('#workbench-tools #sidebar-tools').length,1);
  assert.equal($('#workbench-tasks #local-discover-search').length,1);
  assert.equal($('#workbench-tasks #sidebar-tool-import,#workbench-tasks #sidebar-tools').length,0);
  assert.match(css,/\.workbench-nav\{[^}]*display:flex;[^}]*overflow-x:auto;/);
  assert.equal($('#task-history-panel.task-history-panel.od-disclosure').is('[hidden]'),true);
  assert.equal($('details#tool-diagnostics').length,1);
  assert.equal($('#tool-diagnostics').is('[open]'),false);
  for(const id of ['sdk-install','check-source','check-target','scraping-panel'])
    assert.equal($('#tool-diagnostics #'+id).length,1,id+' stays inside advanced diagnostics');
  assert.match(css,/min-width:0/);assert.match(css,/overflow-wrap:anywhere/);
});

test('developer mode uses one accessible switch and keeps page details folded by default',async()=>{
  const [$,css,design]=await Promise.all([rendered(),read('src/ui/tool-shell.css'),read('src/ui/design-system.css')]);
  assert.equal($('#local-project-mode[type=checkbox][role=switch]').length,1);
  assert.equal($('#developer-source-title.od-page-title').text(),'直接编辑');
  assert.doesNotMatch($.root().text(),/手工草稿|查看当前网页详细信息|源码来源|刷新连接/);
  assert.equal($('details#local-project-guide.local-project-guide').is('[open]'),false);
  assert.match($('#local-project-guide').text(),/首次使用：连接方法/);
  assert.equal($('#local-project-guide-open[type=button]').length,1);
  assert.equal($('#local-project-connect.local-project-connect[type=button]').length,1);
  assert.match(css,/\.local-project-connect\{[^}]*width:100%;text-align:center/);
  assert.match(design,/\.od-button\{[^}]*min-height:36px/);
  assert.equal($('a[href]').length,0,'trusted UI must not navigate remote resources');
  assert.match(css,/#workbench-develop select\{[^}]*appearance:none;[^}]*padding-right:34px;/);
  assert.match(css,/background-position:right 17px center,right 11px center;/);
  assert.doesNotMatch(css,/@import\b|url\s*\(|expression\s*\(/i);
  assert.equal($('#local-project-tools.local-project-tools').is('[hidden]'),true);
  assert.equal($('details#developer-target-detail.od-disclosure>summary.developer-page-summary').length,1);
  assert.equal($('#developer-target-detail').is('[open]'),false);
  assert.equal($('#script-current-page-host').length,1);
  assert.equal($('#script-current-page-status[role=status][aria-live=polite]').length,1);
  assert.equal($('#developer-source-switch.developer-source-switch.od-toolbar.od-page-head').length,1);
  const ids=$('#workbench-develop [id]').map((_,node)=>$(node).attr('id')).get();
  assert.ok(ids.indexOf('developer-source-switch')<ids.indexOf('developer-target-detail'));
  assert.equal($('#program-new-script[type=button].od-icon-button').length,1);
  assert.equal($('#program-new-script').attr('aria-label'),'新建 JavaScript 草稿');
  assert.equal($('#program-new-script').is('[hidden]'),true);
  assert.equal($('#program-new-script svg[aria-hidden=true]').length,1);
  assert.match(css,/\.developer-source-switch\[data-mode=local\] #program-new-script\{display:none\}/);
  assert.equal($('#local-project-mode option').length,0);
  assert.match(css,/input:focus-visible\+\.local-project-switch-track/);
  assert.match(design,/\.od-disclosure>summary\{display:flex;[^}]*min-height:44px/);
  assert.match(css,/#script-current-page-host\{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis/);
  assert.match(css,/#script-current-page-status\{flex:none;/);
  assert.match(css,/\.developer-source-switch label\{[^}]*min-height:var\(--od-icon-size\)/);
});

test('Sidebar starts at its five tabs without repeating Chrome extension identity',async()=>{
  const [manifest,$,css]=await Promise.all([read('manifest.json').then(JSON.parse),rendered(),read('src/ui/tool-shell.css')]);
  assert.equal(manifest.name,'OpenDesk Browser');
  assert.equal($('title').text(),'OpenDesk Browser');
  assert.equal($('#opendesk-react-app').children().first().is('nav.workbench-nav[role=tablist]'),true);
  assert.equal($('.workspace-header,.workspace-brand,.workspace-logo').length,0);
  assert.doesNotMatch(css,/\.workspace-(?:header|brand|logo)\b/);
  for(const id of ['tab-my-tasks','tab-tools','tab-workflow','tab-develop','tab-cloud','workspace-content','workspace-dock'])
    assert.equal($('#'+id).length,1,id);
});
