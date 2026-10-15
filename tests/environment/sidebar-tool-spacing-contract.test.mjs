import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createSidebarToolPackage} from '../../scripts/build-sidebar-tool.mjs';

const read=path=>readFile(path,'utf8');

test('Sidebar owns one horizontal inset and tool iframes use a full-width canvas',async()=>{
  const [tokens,shell]=await Promise.all([read('src/ui/design-tokens.css'),read('src/ui/tool-shell.css')]);
  assert.match(tokens,/--od-page-gutter:11px/);
  assert.match(shell,/#workspace-content\{[^}]*padding:10px var\(--od-page-gutter\)/);
  assert.match(shell,/#workspace-content\{--od-page-gutter:9px;padding:8px var\(--od-page-gutter\)/);
  assert.match(shell,/#workbench-tools\{width:calc\(100% \+ var\(--od-page-gutter\) \+ var\(--od-page-gutter\)\);margin-inline:calc\(0px - var\(--od-page-gutter\)\);padding-inline:var\(--od-page-gutter\)\}/);
  assert.match(shell,/\.sidebar-tool-frame\{[^}]*width:calc\(100% \+ var\(--od-page-gutter\) \+ var\(--od-page-gutter\)\)/);
  assert.match(shell,/\.sidebar-tool-frame\{[^}]*margin-inline:calc\(0px - var\(--od-page-gutter\)\)/);
  assert.match(shell,/\.sidebar-tool-iframe\{[^}]*border:0;border-radius:0/);
});

test('Quick notes consumes only the canonical spacing and control CSS at build time',async()=>{
  const [css,tokens,config,html,packageUi]=await Promise.all([
    read('examples/sidebar-tools/quick-notes/src/style.css'),
    read('src/ui/design-tokens.css'),
    read('examples/sidebar-tools/quick-notes/tool.config.json'),
    read('examples/sidebar-tools/quick-notes/src/index.html'),
    createSidebarToolPackage('examples/sidebar-tools/quick-notes')
  ]);
  assert.match(css,/^\/\* @opendesk-shared-design \*\//);
  assert.doesNotMatch(css,/:root\s*\{|--(?:space-|radius-|od-)[\w-]+\s*:/,
    'layout-only tool source must not duplicate canonical design tokens');
  for(const [token,value] of [
    ['--space-1','4px'],['--space-2','8px'],['--space-3','12px'],
    ['--space-4','16px'],['--od-icon-size','34px']])
    assert.ok(tokens.includes(token+':'+value) && packageUi.css.includes(token+':'+value),
      'built sandbox uses one canonical spacing token '+token);
  assert.match(packageUi.css,/opendesk\.shared-design\.v1/);
  assert.ok(packageUi.css.includes('.od-icon-button{'));
  assert.ok(packageUi.css.includes('input,select,textarea{'));
  assert.match(html,/id="note-text" class="od-field"/);
  assert.match(html,/id="save-note" class="od-icon-button od-icon-button--primary/);
  assert.match(css,/\.notes-app\{[^}]*padding:var\(--space-3\)/);
  assert.match(css,/#note-text\{[^}]*min-height:126px/);
  assert.match(css,/\.task-shortcut\{[^}]*margin-top:var\(--space-4\)/);
  assert.match(css,/@media\(max-width:220px\)\{/,'200%-equivalent narrow layout');
  for(const id of ['delete-note','save-note'])
    assert.ok(css.includes('.editor-actions #'+id+'{grid-column:'),
      'critical control remains visible in narrow layout: '+id);
  assert.match(css,/@media\(min-width:800px\)\{\.notes-app\{max-width:760px;margin-inline:auto\}\}/);
  assert.match(css,/\.confirm-actions\{[^}]*flex-wrap:wrap/);
  assert.match(css,/@media\(max-width:175px\)\{\.confirm-actions button\{flex:1 1 100%\}\}/,
    '160px view stacks full-label buttons, not half-visible actions');
  assert.doesNotMatch(css,/@import\b|url\(\s*['"]?\s*https?:/);
  assert.equal(JSON.parse(config).version,'1.1.9','visual change must be a real tool upgrade');
});

test('Tools list avoids long technical empty text and stale toggling notices',async()=>{
  const [installed,sidebar,shell,doc]=await Promise.all([
    read('src/ui/installed-page-tools.js'),read('src/ui/sidebar-tools.js'),
    read('src/ui/tool-shell.css'),read('docs/architecture/sidebar-design-system-r20.zh-CN.md')
  ]);
  assert.match(installed,/暂无已安装网页工具。可从「开发」中安装网页脚本。/);
  assert.match(installed,/installed-page-tool-technical/);
  assert.match(installed,/technicalTitle\.textContent='技术信息'/);
  const close=sidebar.slice(sidebar.indexOf('function closeTool'),sidebar.indexOf('function canLeave('));
  assert.match(close,/suspendTool\(\);notice\(''\)/);
  assert.match(shell,/#installed-page-tools-list>section\{[^}]*padding:var\(--space-3\)/);
  assert.match(doc,/R26 Side Panel 和隔离工具/);
  assert.match(doc,/工具隔离边界/);
});
