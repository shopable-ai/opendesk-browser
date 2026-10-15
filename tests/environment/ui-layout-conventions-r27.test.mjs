import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createSidebarToolPackage} from '../../scripts/build-sidebar-tool.mjs';

const read=path=>readFile(path,'utf8');

test('R27 canonical 4px spacing and Tailwind Workspace rem baseline do not drift',async()=>{
  const [tokens,source,pkg]=await Promise.all([
    read('src/ui/design-tokens.css'),
    read('src/native-agent/workspace.tailwind.css'),
    read('package.json')
  ]);
  for(const [key,value] of [['space-1','4px'],['space-2','8px'],['space-3','12px'],['space-4','16px'],
    ['radius-control','8px'],['radius-surface','12px'],['od-icon-size','34px']])
    assert.match(tokens,new RegExp('--'+key+':'+value+';'),'canonical '+key);
  const root=source.match(/@layer base\s*\{\s*:root\s*\{([^}]*)\}/)?.[1];
  assert.ok(root,'Workspace root CSS not found');
  assert.match(root,/font-size:16px;/,'Tailwind rem ruler must stay 16px, not compact UI font');
  assert.doesNotMatch(root,/font-size:13px;/);
  assert.match(source,/\bbody\s*\{[^}]*font-size:13px;/,'compact Workspace body size is independent');
  assert.match(source,/@import "tailwindcss" source\(none\);/);
  assert.match(source,/@import "\.\.\/ui\/design-tokens\.css";/);
  for(const input of ['./workspace.html','./workspace.js','./workspace-chat-edit-ui.js'])
    assert.ok(source.includes('@source "'+input+'";'),'fixed Tailwind input '+input);
  const dependencies=JSON.parse(pkg).devDependencies;
  assert.equal(dependencies.tailwindcss,dependencies['@tailwindcss/cli']);
  assert.match(dependencies.tailwindcss,/^4\./);
});

test('R27 Side Panel base controls consume spacing tokens, not unrelated one-off paddings',async()=>{
  const css=await read('src/ui/design-system.css');
  for(const selector of [
    'p{margin:var(--space-2) 0;',
    'label{display:block;margin:var(--space-2) 0 var(--space-1)}',
    'input,select,textarea{',
    'padding:var(--space-2) var(--space-3)',
    'details{margin:var(--space-2) 0}',
    'details>section{margin-top:var(--space-3)}'
  ])
    assert.ok(css.includes(selector),'shared control spacing should use a semantic token: '+selector);
  assert.ok(!css.includes('padding:8px 10px'),'legacy inline control padding must not return');
});

test('R27 each trusted page uses only its appropriate stylesheet and sandbox stays independent',async()=>{
  const [sidebar,workspace,settings,market,sandbox,notes]=await Promise.all([
    read('src/ui/tool.html'),read('src/native-agent/workspace.html'),
    read('src/native-agent/settings.html'),read('src/marketplace/marketplace.html'),
    read('src/sidebar-tools/sandbox.html'),read('examples/sidebar-tools/quick-notes/src/style.css')
  ]);
  assert.match(sidebar,/href="design-tokens\.css"><link rel="stylesheet" href="design-system\.css"/);
  assert.match(workspace,/href="workspace\.css"/);
  assert.doesNotMatch(workspace,/<link[^>]+design-tokens\.css/,'Workspace tokens are inlined at build time');
  assert.match(settings,/href="\.\.\/ui\/design-tokens\.css"/);
  assert.match(market,/href="design-tokens\.css"/);
  assert.match(sandbox,/default-src 'none'/);
  assert.doesNotMatch(sandbox,/tailwind|design-system\.css|design-tokens\.css/i);
  assert.match(notes,/^\/\* @opendesk-shared-design \*\//);
  assert.doesNotMatch(notes,/:root\s*\{|--space-1\s*:/,
    'sandbox sources must not duplicate the shared palette/spacing tokens');
  const tool=await createSidebarToolPackage('examples/sidebar-tools/quick-notes');
  const official=await read('src/ui/design-tokens.css');
  assert.ok(tool.css.includes(official),'the isolated sandbox package embeds canonical token bytes');
  assert.match(tool.css,/\.od-icon-button\{/,'public visuals were compiled into sandbox CSS');
  assert.doesNotMatch(notes,/@import\b|url\(\s*['"]?\s*https?:/);
});

test('R27 developer documentation is linked and covers boundaries, sizing and actual acceptance',async()=>{
  const [standard,sidebarGuide,agents]=await Promise.all([
    read('docs/architecture/ui-layout-conventions-r27.zh-CN.md'),
    read('docs/architecture/sidebar-design-system-r20.zh-CN.md'),
    read('AGENTS.md')
  ]);
  assert.match(standard,/现行跨界面规范/);
  for(const phrase of ['Native Workspace','Native Settings','应用市场','Side Panel','隔离工具','4px','16px','640px','缩放','NOT_TESTED'])
    assert.ok(standard.includes(phrase),'missing R27 explanation '+phrase);
  assert.match(standard,/媒体查询中的 `rem`/,'media-query units are distinct from element rem values');
  assert.match(sidebarGuide,/ui-layout-conventions-r27\.zh-CN\.md/);
  assert.match(agents,/ui-layout-conventions-r27\.zh-CN\.md/);
});
