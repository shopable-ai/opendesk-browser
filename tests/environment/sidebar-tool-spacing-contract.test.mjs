import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

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

test('Quick notes uses a matching 4-step density without loading trusted host CSS',async()=>{
  const [css,config,html]=await Promise.all([
    read('examples/sidebar-tools/quick-notes/src/style.css'),
    read('examples/sidebar-tools/quick-notes/tool.config.json'),
    read('examples/sidebar-tools/quick-notes/src/index.html')
  ]);
  for(const [token,value] of [['--space-1','4px'],['--space-2','8px'],['--space-3','12px'],['--space-4','16px'],['--notes-icon-size','34px']])
    assert(css.includes(token+':'+value),'sandbox spacing token '+token);
  assert.match(css,/body\{margin:0\}/);
  assert.match(css,/\.notes-app\{[^}]*width:100%;min-width:0;margin:0;padding:var\(--space-3\)/);
  assert.match(css,/#note-text\{[^}]*padding:var\(--space-3\) var\(--space-2\)/);
  assert.match(css,/\.task-shortcut\{[^}]*margin-top:var\(--space-4\)/);
  assert.match(css,/@media\(max-width:220px\)\{\.editor-actions\{display:grid;/,'200%-equivalent narrow layout');
  assert.match(css,/\.editor-actions \.page-attach\{grid-column:1\/-1;justify-self:start;white-space:nowrap\}/);
  assert.match(css,/\.editor-actions \.icon-button\.danger\{grid-column:2\}/);
  assert.match(css,/\.editor-actions \.icon-button\.primary\{grid-column:3\}/);
  assert.match(css,/@media\(min-width:800px\)\{\.notes-app\{max-width:760px;margin-inline:auto\}\}/);
  assert.doesNotMatch(css,/@import\b|url\(\s*['"]?\s*https?:/);
  assert.equal(JSON.parse(config).version,'1.1.7');
  assert.match(html,/id="note-text"/);
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
