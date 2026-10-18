import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {load} from 'cheerio';
import {transformWithEsbuild} from 'vite';

const read=path=>readFile(path,'utf8');
test('R33.3.6 six official panels (development Debug only) are source-bound',async()=>{
  const [installed,builder,adapter]=await Promise.all([
    read('src/ui/tool.html'),
    read('scripts/preview/build-sidebar-six-react-preview.mjs'),
    read('src/ui/react/preview/sidebar-six-preview.tsx')
  ]);
  const $=load(installed);
  const tabs=[
    ['tasks','tab-my-tasks'],['tools','tab-tools'],['workflow','tab-workflow'],
    ['develop','tab-develop'],['cloud','tab-cloud'],['debug','tab-debug']
  ];
  for(const [key,id] of tabs){
    assert.equal($('#'+id).attr('aria-controls'),'workbench-'+key);
    assert.equal($('#workbench-'+key).attr('role'),'tabpanel');
    assert.match(builder,new RegExp("'"+key+"'"));
  }
  assert.ok($('#tab-debug').is('[hidden]'),'Debug stays hidden in official production DOM');
  // The run overview remains available but secondary to header management.
  const runner=$('#schedule-open-runner');
  assert.equal(runner.length,1,'one authoritative runner launch entry');
  assert.ok(runner.parent().hasClass('schedule-runner-secondary'),
    'runner lives behind a secondary disclosure, not at header top right');
  assert.equal(runner.attr('aria-label'),'打开独立运行页');
  assert.equal(runner.text().trim(),'打开运行概览');
  assert.equal($('#scheduled-panel > .schedule-header #schedule-open-manager').length,1);
  assert.equal($('#scheduled-panel > .schedule-header #schedule-detail-delete').length,1);
  assert.match(builder,/data-preview-development-only/);
  assert.match(builder,/UI_PREVIEW_ONLY/);
  assert.match(builder,/--check/);
  assert.match(builder,/inputSha256/);
  assert.match(builder,/connect-src/);
  for(const path of ['src/ui/tool.html','src/ui/react/main.tsx',
    'src/ui/react/tabs/tools.tsx','src/ui/react/tabs/develop.tsx',
    'src/ui/react/tabs/debug.tsx','src/ui/react/tabs/workflow.tsx','src/ui/design-tokens.css',
    'src/ui/react/tabs/tasks.tsx','src/ui/react/tabs/cloud.tsx',
    'src/ui/design-system.css','src/ui/tool-shell.css',
    'src/ui/cloud-hosting.css','src/ui/extension-center.css'])
    assert.ok(builder.includes(path),'missing official input '+path);
  for(const name of ['ExtensionToolbar','ExtensionRows','ExtensionDetail',
    'DeveloperFramework','DeveloperActions','WorkflowHeader','WorkflowTranscript',
    'WorkflowSettingsSheet','DebugDiagnosticText'])
    assert.match(adapter,new RegExp('createPortal\\(<'+name+'\\b'));
  assert.match(adapter,/const root=createRoot\(/);
  assert.match(adapter,/realHost:false/);
  assert.match(adapter,/realPermission:false/);
  assert.match(adapter,/realResult:false/);
  // AI settings must expose the existing <details> controls in the trusted
  // React portal, matching WorkflowView openAISettings/closeAISettings.
  assert.match(installed,/id="workflow-provider-settings"/);
  assert.match(installed,/id="workflow-source-https"/);
  assert.match(adapter,/workflowSettings\.open=true;/,
    'opening preview AI sheet must reveal the real HTTPS source selector');
  assert.match(adapter,/workflowSettings\.open=false;setSheetOpen\(false\)/,
    'closing preview AI sheet must close the original details panel');
  const withoutComments=adapter.replace(/^\s*\/\/[^\n]*$/gm,'');
  assert.doesNotMatch(withoutComments,/chrome\.|fetch\(|localStorage|sessionStorage|\bRunHost\s*\(|new Worker\(/);
  assert.doesNotMatch(withoutComments,/from ['"][^'"]*(?:platform\/host|framework\/sdk|sandbox|installer)/);
  const compiled=await transformWithEsbuild(adapter,'sidebar-six-preview.tsx',
    {loader:'tsx',jsx:'transform',target:'es2022'});
  assert.ok(compiled.code.length>2500);
});
test('R33.3.6 planned preview guards missing/stale bundled inputs',async()=>{
  const src=await read('scripts/preview/build-sidebar-six-react-preview.mjs');
  assert.match(src,/current===result\.html/);
  assert.match(src,/stylePaths/);
  assert.match(src,/generated index\.html missing or stale/);
  assert.match(src,/iframe/);
  assert.match(src,/srcdoc/);
  assert.match(src,/default-src/);
  assert.doesNotMatch(src,/force.*git|git\s+push/);
});

test('R23.14 six-tab Workflow shares compact disconnected controls and production-facing copy',async()=>{
  const [adapter,html]=await Promise.all([
    read('src/ui/react/preview/sidebar-six-preview.tsx'),read('src/ui/tool.html')
  ]);
  assert.match(adapter,/get\('workflow-local-status'\)\.textContent='未连接'/);
  assert.match(adapter,/get\('workflow-local-connect'\)\.disabled=true/);
  assert.match(adapter,/get\('workflow-local-connected'\)\.hidden=true/);
  assert.doesNotMatch(adapter,/仅预览工作流界面。发送和执行需要正式扩展|E_PREVIEW_ONLY：无真实 Provider|已切换到演示空工作流/);
  assert.match(html,/class="workflow-connection-line"/);
  assert.match(html,/id="workflow-local-status-detail"/);
});

test('R33.3.16 source-owned task manager and dual workflow examples are not a parallel preview',async()=>{
  const [html,css,owner,preview,flows,prototype,presentation]=await Promise.all([
    read('src/ui/tool.html'),read('src/ui/tool-shell.css'),
    read('src/ui/workflow/workflow-view.js'),
    read('src/ui/react/preview/sidebar-six-preview.tsx'),
    read('src/ui/react/preview/sidebar-six-my-flows.tsx'),
    read('prototypes/sidebar/workflow.html'),
    read('src/ui/schedule-plan-presentation.js')
  ]);
  const $=load(html);
  assert.equal($('#schedule-manager-count').length,1);
  assert.equal($('#scheduled-panel > .schedule-header .od-page-actions > #schedule-manager-create').length,1,
    'new task action belongs at page-title top right, not on a separate empty management row');
  assert.equal($('#schedule-task-manager > .schedule-actions').length,0,
    'manager body must not reserve space for a redundant action row');
  assert.equal($('#schedule-manager-create[hidden]').length,1,
    'header create action must remain hidden outside manager view');
  assert.equal($('#schedule-manager-list').length,1);
  assert.equal($('#schedule-manager-search').length,1);
  assert.equal($('#schedule-manager-filter').length,1);
  assert.equal($('#schedule-task-manager .schedule-manager-controls').length,1);
  assert.match(css,/\.schedule-manager-controls\{display:grid;grid-template-columns:minmax\(0,1fr\)/);
  assert.match(css,/\.schedule-manager-card\{width:100%/);
  assert.match(flows,/createPortal\(<ScheduleManagerRows/);
  assert.match(await read('src/ui/react/tabs/schedule.tsx'),/schedule-manager-card od-surface/);
  assert.match(flows,/setManagerRemoving\(row\.taskId\)/);
  const shared=await read('src/ui/react/tabs/schedule.tsx');
  assert.match(shared,/schedulePlanIconPath\(presentation\)/);
  assert.match(shared,/schedulePlanStatusLabel\(presentation\)/);
  assert.match(flows,/get\('schedule-detail-delete'\)\.hidden=view!=='detail'/);
  assert.match(flows,/bind\('schedule-open-manager','click'/);
  assert.match(flows,/bind\('schedule-detail-delete','click'/);
  assert.doesNotMatch(flows,/schedule-danger-link/,
    'dangerous delete can only be launched from the formal detail header');
  assert.match(css,/\.schedule-manager-menu-panel\{position:absolute/);
  assert.match(css,/\.schedule-plan-title-row/);
  assert.match(flows,/onTaskAction\('uninstall',managerRemoving\)/);
  assert.match(preview,/setInstalledTaskIds\(old=>old\.filter\(/);
  assert.match(preview,/\[320,360,400,420,440,520\]/);
  const exampleButtons=$('#workflow-intro-suggestions button');
  assert.equal(exampleButtons.length,4);
  assert.equal(exampleButtons.filter('[data-example-mode="new-chat"]').length,2);
  assert.equal(exampleButtons.filter('[data-example-mode="new-workflow"]').length,2);
  assert.match(css,/\.workflow-intro-suggestions\{display:grid;grid-template-columns:minmax\(0,1fr\)/);
  assert.match(css,/\.workflow-intro-suggestions button\{display:block;width:100%/);
  assert.match(prototype,/\.r2310-suggestions\{display:grid;grid-template-columns:minmax\(0,1fr\)/);
  assert.match(owner,/get\('workflow-intro-suggestions'\)/);
  assert.match(owner,/draft\.value=requestText/);
  const examplesStart=owner.lastIndexOf('  for(const button of get(\'workflow-intro-suggestions\')');
  assert(examplesStart>=0,'trusted suggestion handler must be present');
  assert.doesNotMatch(owner.slice(examplesStart,
    owner.indexOf('  const onResumeSessionClick',examplesStart)), /client\.request|startPlanning|runWorkflow/,
    'suggestions can only fill the existing composer');
  assert.match(preview,/setWorkflowEntry\('new-chat'\)/);
  assert.match(preview,/setWorkflowEntry\('new-workflow'\)/);
  assert.match(flows,/setManagerOrigin\('detail'\)/);
  assert.match(flows,/setView\(managerOrigin\)/);
  assert.ok(owner.includes("get('workflow-chat-intro').hidden=hasMessages || phase==='planning' || (hasSteps && entryMode!=='new-chat');"),
    'new conversation suggestions should remain visible over an existing workflow draft');
  assert.match(presentation,/RUNNING:'positive',ADMITTED:'info'/);
  await transformWithEsbuild(flows,'sidebar-six-my-flows.tsx',
    {loader:'tsx',jsx:'transform',target:'es2022'});
});
