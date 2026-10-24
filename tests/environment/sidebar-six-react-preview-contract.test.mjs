import {renderSidebarFixture,loadSidebarReact} from '../helpers/sidebar-react-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {load} from 'cheerio';
import {transform} from 'esbuild';
import * as React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

const read=path=>readFile(path,'utf8');

test('R37 offline preview generates from the empty official root with working production ownership',async()=>{
  const {generateSidebarSixReactPreview}=await import('../../scripts/preview/build-sidebar-six-react-preview.mjs');
  const result=await generateSidebarSixReactPreview();
  const $=load(result.html);
  assert.equal($('#opendesk-react-app').length,1);
  assert.match($('#od-official-ui-css').text(),/\.ec-row--action-visible \.ec-row-actions/,
    'preview embeds production CSS for the last-hovered row affordance');
  assert.equal($('#opendesk-react-app').contents().length,0,'React receives an empty root, never an SSR template');
  assert.equal($('#od-sidebar-preview-shell').length,1,'one standalone wrapper owns the preview geometry');
  assert.equal($('#od-sidebar-preview-stage').length,1,'one bounded visible sidepanel viewport');
  assert.equal($('#od-sidebar-preview-width option').length,5,'320–520px review choices remain interactive');
  assert.equal($('#od-sidebar-preview-boot[role="status"]').length,1,
    'bootstrap failures must not show a blank page');
  assert.equal($('#od-sidebar-preview-error[role="alert"][hidden]').length,1,
    'pre-render runtime errors have a visible recovery surface');
  assert.match($('#od-official-ui-css').text(),/\.opendesk-react-app/);
  assert.match($('style').last().text(),/html,body\{height:auto;min-height:100%;overflow:auto!important\}/,
    'standalone HTML must not inherit hidden/height-constrained product document');
  assert.match($('style').last().text(),/\.od-sidebar-preview-stage\{display:flex;flex-direction:column/,
    'React needs a real flex host rather than an auto-height block');
  assert.match($('style').last().text(),/#opendesk-react-app\{flex:1 1 auto;min-height:0;height:100%/,
    'main React root must receive measurable viewport height');
  assert.equal($('#opendesk-react-app').attr('class'),load(await read('src/ui/sidepanel.html'))('#opendesk-react-app').attr('class'));
  assert.equal($('nav.workbench-nav').length,0,'navigation is mounted by the production shell');
  assert.equal($('meta[name="od-preview-proof"]').attr('content'),'UI_PREVIEW_ONLY');
  assert.equal($('meta[name="od-source-input-sha256"]').attr('content'),result.inputSha256);
  assert.equal($('iframe').length,0,'offline shell must not launch a dynamic tool');
  assert.equal($('script[src^="http"]').length,0);
  const scripts=$('script[src]').map((_,n)=>$(n).attr('src')).get();
  assert.equal(scripts.length,1,'one existing app root owns the preview');
  const compiled=Buffer.from(scripts[0].split(',')[1],'base64').toString();
  assert.match(compiled,/E_REACT_APP_SHELL_NAVIGATION/);
  assert.match(compiled,/UI_PREVIEW_ONLY/);
  const paths=result.sourceInputs.map(input=>input.path);
  assert.ok(paths.includes('src/ui/react/main.tsx'));
  assert.ok(paths.includes('src/ui/react/app-shell.tsx'));
  assert.ok(paths.includes('src/ui/react/tabs/tools.tsx'));
  assert.ok(paths.includes('src/ui/extension-center.css'));
  assert.ok(!paths.includes('src/ui/react/preview/sidebar-six-preview.tsx'),'retired Portal adapter is not a consumer');
  const previewSource=await read('scripts/preview/build-sidebar-six-react-preview.mjs');
  assert.match(previewSource,/app=mountSidebarApp\(document,\{debugEnabled:true,onNavigate/);
  assert.match(previewSource,/get\('ai-settings'\)==='1'\)\s*app\.openProviderSettings\(\)/,
    'AI settings deep link opens the real React sheet, never a duplicate prototype');
  assert.match(previewSource,/app\.connectBack\(closeDetail\)/);
  assert.match(previewSource,/app\.renderRows\(\{rows:shown\.map/);
  assert.match(previewSource,/onSearch:value=>\{toolbar\.query=value;publishToolbar\(\);publishRows\(\)/);
  assert.match(previewSource,/primaryAction:null/);
  assert.match(previewSource,/onMarket:previewNotice,onImport:previewOpenImport,onReload:previewNotice/);
  assert.match(previewSource,/toolView\.bind\('sidebar-tool-import-close'/);
  assert.match(previewSource,/opendesk\.page-install\.v1/,'preview recognizes Page install metadata without an Authority');
  assert.match(previewSource,/opendesk\.sidebar-tool\.v2/,'preview recognizes Tool package metadata');
  assert.match(previewSource,/仅预览 · 不执行安装/);
});
// Legacy design fixtures remain checked for historical layout regressions;
// the R37 generation and Chromium evidence above/below prove the active consumer.
test('R33.3.6 official panels and historical design fixtures retain their contracts',async()=>{
  const [installed,builder,adapter]=await Promise.all([
    renderSidebarFixture(),
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
  const production=load(await renderSidebarFixture({debugEnabled:false}));
  assert.ok(production('#tab-debug').is('[hidden]'),'Debug stays hidden in production navigation');
  assert.equal(production('#workbench-debug').length,0,'production does not mount diagnostics');
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
  for(const path of ['src/ui/sidepanel.html','src/ui/react/main.tsx',
    'src/ui/react/tabs/tools.tsx','src/ui/react/tabs/develop.tsx',
    'src/ui/react/tabs/debug.tsx','src/ui/react/tabs/workflow.tsx','src/ui/design-tokens.css',
    'src/ui/react/tabs/tasks.tsx','src/ui/react/tabs/cloud.tsx',
    'src/ui/design-system.css','src/ui/tool-shell.css',
    'src/ui/cloud-hosting.css','src/ui/extension-center.css'])
    assert.ok(builder.includes(path),'missing official input '+path);
  for(const name of ['ExtensionToolbar','ExtensionRows','ExtensionDetail',
    'WorkflowHeader','WorkflowTranscript',
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
  const compiled=await transform(adapter,
    {loader:'tsx',jsx:'transform',target:'es2022'});
  assert.ok(compiled.code.length>2500);
});
test('R33.3.6 planned preview guards missing/stale bundled inputs',async()=>{
  const src=await read('scripts/preview/build-sidebar-six-react-preview.mjs');
  assert.match(src,/current===result\.html/);
  assert.match(src,/stylePaths/);
  assert.match(src,/generated index\.html missing or stale/);
  assert.match(src,/frame-src/);
  assert.match(src,/form-action/);
  assert.match(src,/default-src/);
  assert.doesNotMatch(src,/force.*git|git\s+push/);
});

test('R23.14 six-tab Workflow shares compact disconnected controls and production-facing copy',async()=>{
  const [adapter,html]=await Promise.all([
    read('src/ui/react/preview/sidebar-six-preview.tsx'),renderSidebarFixture()
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
    renderSidebarFixture(),read('src/ui/tool-shell.css'),
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
  assert.deepEqual(exampleButtons.map((_,node)=>$(node).attr('data-workflow-example')).get(),['fill','read']);
  const {createWorkflowUIState}=await loadSidebarReact();
  const ui=createWorkflowUIState();
  const model={...ui.getSnapshot(),entryMode:'new-chat'};
  const chat=load(await renderSidebarFixture({workflowController:{getSnapshot:()=>model,subscribe:()=>()=>{},actions:{}}}));
  assert.deepEqual(chat('#workflow-intro-suggestions button').map((_,node)=>chat(node).attr('data-workflow-example')).get(),['continue','check']);
  ui.dispose();
  assert.match(css,/\.workflow-intro-suggestions\{display:grid;grid-template-columns:minmax\(0,1fr\)/);
  assert.match(css,/\.workflow-intro-suggestions button\{display:block;width:100%/);
  assert.match(prototype,/\.r2310-suggestions\{display:grid;grid-template-columns:minmax\(0,1fr\)/);
  const examplesStart=owner.indexOf('const chooseExample=');
  const examplesEnd=owner.indexOf('const onResumeSessionClick',examplesStart);
  assert(examplesStart>=0&&examplesEnd>examplesStart,'trusted suggestion action must be present');
  const exampleAction=owner.slice(examplesStart,examplesEnd);
  assert.match(exampleAction,/event\.isTrusted/);
  assert.match(exampleAction,/control\('workflow-ai-request'\)\.value=exampleRequests\[key\]/);
  assert.doesNotMatch(exampleAction,/client\.request|startPlanning|runWorkflow/,
    'suggestions can only fill the existing composer');
  assert.match(preview,/setWorkflowEntry\('new-chat'\)/);
  assert.match(preview,/setWorkflowEntry\('new-workflow'\)/);
  assert.match(flows,/setManagerOrigin\('detail'\)/);
  assert.match(flows,/setView\(managerOrigin\)/);
  assert.ok(owner.includes("control('workflow-chat-intro').hidden=hasMessages || phase==='planning' || (hasSteps && entryMode!=='new-chat');"),
    'new conversation suggestions should remain visible over an existing workflow draft');
  assert.match(presentation,/RUNNING:'positive',ADMITTED:'info'/);
  await transform(flows,
    {loader:'tsx',jsx:'transform',target:'es2022'});
});


test('developer preview uses the complete page and dock with isolated local-project state',async t=>{
  const {DeveloperPage,DeveloperDock,createDeveloperPreviewView}=await loadSidebarReact();
  const view=createDeveloperPreviewView();
  t.after(()=>view.dispose());
  const render=()=>load(renderToStaticMarkup(React.createElement(React.Fragment,null,
    React.createElement(DeveloperPage,{view}),React.createElement(DeveloperDock,{view}))));
  let $=render();
  assert.equal($('#workbench-develop').length,1);
  assert.equal($('#develop-dock').length,1);
  assert.equal($('#manual-source-editor').prop('hidden'),false);
  assert.equal($('#local-project-tools').prop('hidden'),true);
  assert.equal($('#local-project-select option').length,3);
  for(const id of ['script-run','script-save','script-stop','page-program-install'])
    assert.equal($('#'+id).prop('disabled'),true,id+' cannot invoke real capabilities');
  view.patch('script-source',{value:'preview draft <script>text</script>'});
  view.patch('local-project-mode',{checked:true});
  view.actions['local-project-mode']();
  view.patch('local-project-select',{value:'preview-controller'});
  view.actions['local-project-select']();
  $=render();
  assert.equal($('#developer-source-switch').attr('data-mode'),'local');
  assert.equal($('#manual-source-editor').prop('hidden'),true);
  assert.equal($('#local-project-tools').prop('hidden'),false);
  assert.equal($('#local-project-params-tools').prop('hidden'),false);
  assert.equal($('#script-run').text(),'运行本地项目');
  assert.equal($('#script-save').text(),'安装固定版本');
  assert.equal($('#local-project-status').attr('data-state'),'disconnected');
  assert.match($('#local-project-status').text(),/无法运行或安装/);
  view.actions['local-project-refresh']();
  assert.match(render()('#local-project-status').text(),/无法读取 Native/);
  view.actions['local-project-guide-open']();
  assert.equal(render()('#local-project-guide').prop('open'),true);
  view.actions['page-component-vue']();
  assert.equal(render()('#page-component-vue').prop('checked'),true);
  view.patch('local-project-mode',{checked:false});
  view.actions['local-project-mode']();
  $=render();
  assert.equal($('#manual-source-editor').prop('hidden'),false);
  assert.equal($('#script-source').val(),'preview draft <script>text</script>');
  assert.equal($('#script-run').prop('disabled'),true);
  assert.equal($('#script-save').prop('disabled'),true);
  assert.equal($('script').length,0);
});


test('unified tool management review uses formal ToolHost and memory-only adapters',async()=>{
  const [builder,adapter,host]=await Promise.all([
    read('scripts/preview/build-sidebar-six-react-preview.mjs'),
    read('src/ui/react/preview/clipper-preview.js'),
    read('src/ui/react/tabs/tool-host.tsx')
  ]);
  for(const id of ['bookmark-manager','cookie-editor','prompt-shortcuts','demo-generic']){
    assert.ok(builder.includes("'app:"+id+"'"),id);
    assert.ok(adapter.includes("'"+id+"'"),id);
  }
  assert.match(builder,/clipper\.openScenario\(key\.slice\(4\)\)/);
  assert.match(builder,/const previewTool=new URLSearchParams/);
  assert.match(adapter,/UI_PREVIEW_ONLY/);
  assert.match(adapter,/states=new Map\(\)/);
  assert.match(adapter,/view\.bind\('sidebar-tool-enable'/);
  assert.match(adapter,/view\.bind\('sidebar-tool-inline-remove-confirm'/);
  assert.match(host,/id="sidebar-tool-enable"/);
  assert.doesNotMatch(host,/id="sidebar-tool-more-open"/);
});
