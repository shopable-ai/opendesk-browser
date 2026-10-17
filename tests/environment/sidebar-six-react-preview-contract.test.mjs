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
  // The current scheduler header uses one accessible icon, not retired text controls.
  const runner=$('#schedule-open-runner');
  assert.equal(runner.length,1,'official scheduler keeps a single runner launch action');
  assert.ok(runner.hasClass('od-icon-button'),'runner entry uses the official compact icon');
  assert.equal(runner.attr('aria-label'),'打开独立运行页');
  assert.equal(runner.text().trim(),'','the icon does not duplicate its tooltip as body text');
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
