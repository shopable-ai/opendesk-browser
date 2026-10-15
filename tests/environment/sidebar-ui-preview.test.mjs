import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Script} from 'node:vm';
import {load} from 'cheerio';

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
test('R4.9 Tools has one navigation tier and three accessible add/import/market controls',async()=>{
  const [html,css,host,design]=await Promise.all([
    read('src/ui/tool.html'),read('src/ui/tool-shell.css'),read('src/ui/sidebar-tools.js'),read('src/ui/design-system.css')
  ]);
  const $=load(html),section=$('#sidebar-tools');
  assert.equal(section.length,1,'one installed-tools surface');
  // The following Cloud tab is a sibling, not a second Tools navigation tier.
  const tools=$.html(section);
  assert.doesNotMatch(tools,/role="tablist"|role="tab"|role="tabpanel"|我的工具|发现工具/);
  assert.match(tools,/id="sidebar-tool-my-panel" aria-label="已安装工具列表"/);
  assert.match(tools,/id="sidebar-tool-discover-panel"[^>]+hidden/);
  for(const [id,label] of [['sidebar-tool-discover-toggle','添加工具'],['sidebar-tool-market','打开应用市场'],['sidebar-tool-import-trigger','导入工具文件']])
    assert.match(tools,new RegExp('id="'+id+'"[^>]+aria-label="'+label+'"[^>]*>\\s*<svg'));
  assert.match(tools,/id="sidebar-tool-discover-toggle"[^>]+aria-expanded="false" aria-controls="sidebar-tool-discover-panel"/);
  assert.match(tools,/id="sidebar-tool-import-trigger"[^>]+aria-expanded="false" aria-controls="sidebar-tool-import"/);
  assert.match(host,/function setDiscoveryOpen\(open\)/);
  assert.doesNotMatch(host,/showToolPane\(|toolPane=|myTab|discoverTab/);
  assert.doesNotMatch(css,/\.sidebar-tool-subtabs/);
  assert.match(design,/\.od-icon-button\{[^}]*width:var\(--od-icon-size\)/);
  assert.match(design,/\.od-icon-button svg\{width:18px;height:18px;[^}]*stroke:currentColor;stroke-width:1\.8/);
  assert.doesNotMatch(css,/\.sidebar-tools-actions \.od-icon-button\{/);
  assert.match(css,/\.sidebar-tool-view-head \.sidebar-tool-icon-action\{flex:0 0 var\(--od-icon-size\)/);
});

test('R4 official sidebar preserves five product views, original host controls, local task search and history',async()=>{
  const [html,css,work]=await Promise.all([
    read('src/ui/tool.html'),read('src/ui/tool-shell.css'),read('src/ui/task-workbench.js')
  ]);
  const ids=[...html.matchAll(/id="([^"]+)"/g)].map(match=>match[1]);
  assert.equal(ids.length,new Set(ids).size,'no duplicate DOM IDs');
  for(const value of ['tab-my-tasks','tab-tools','tab-workflow','tab-develop','tab-cloud',
    'workbench-tasks','workbench-workflow','workbench-tools','workbench-cloud','cloud-hosting',
    'cloud-open-console','task-search-toggle','task-search-panel','extension-center','extension-center-search',
    'extension-center-list','extension-center-menu','task-selected-workspace','task-history',
    'task-params-form','task-run','task-stop','workspace-dock','task-result-panel','task-history-panel',
    'local-discover-search','script-source','script-run','script-save',
    'page-preview-run','sdk-install','task-install-feedback'])assert(ids.includes(value),'preserved '+value);
  const $=load(html),nav=$('.workbench-nav button:not([hidden])');
  assert.deepEqual(nav.toArray().map(el=>$(el).text().trim()),['我的','扩展','工作流','开发','云控']);
  assert.equal($('#task-search-panel').closest('.tasks-surface').length,1,'search is inside the same Tasks surface');
  assert.doesNotMatch(html,/id="task-local-discovery"|id="local-discover-cards"/,
    'there is no second Discover task list');
  assert.equal($('#extension-center').closest('#workbench-tools').length,1,'extension list retains trusted Tool host');
  assert.doesNotMatch(html,/id="discover-dock"|id="discover-to-catalog"/,'idle Discover should have no persistent footer');
  assert.match(work,/function renderInstalledCards\(/);
  assert.match(work,/localFilter='all'/);
  assert.match(work,/group\.append\(workspace\)/,'active task owns its details');
  assert.match(work,/new BroadcastChannel|new globalThis\.BroadcastChannel/);
  assert.match(work,/listTaskCatalog/,'broadcast does not replace authoritative data');
  assert.match(css,/task-history-entry/);
  assert.match(css,/\.workbench-nav\{[^}]*display:flex;[^}]*overflow-x:auto;/);
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

test('Developer source selector and new-script action belong to their respective headers',async()=>{
  const [html,css,design,source]=await Promise.all([
    read('src/ui/tool.html'),read('src/ui/tool-shell.css'),read('src/ui/design-system.css'),read('src/ui/program-source.js')
  ]);
  const toolbar=html.match(/<div id="program-source-toolbar"[\s\S]*?<\/div>/)?.[0];
  const header=html.slice(html.indexOf('<div id="developer-source-switch"'),html.indexOf('<section aria-label="当前网页"'));
  assert.ok(header,'developer source header exists before current-page details');
  assert.ok(html.indexOf('id="developer-source-switch"') < html.indexOf('id="developer-target-detail"'),
    'source title/action header must appear before current page details');
  assert.match(header,/class="developer-source-switch od-toolbar od-page-head" role="group" aria-label="代码来源" data-mode="manual"/);
  assert.match(header,/<span class="od-page-title">直接编辑<\/span>/);
  assert.match(header,/<div class="od-page-actions" role="group" aria-label="开发页操作">/);
  assert.match(header,/<button type="button" id="program-new-script" title="[^"]+" aria-label="新建 JavaScript 草稿" hidden class="od-icon-button">[\s\S]*?<svg[^>]*aria-hidden="true"/);
  assert.match(header,/id="local-project-mode" type="checkbox" role="switch"/);
  assert.equal([...html.matchAll(/id="program-new-script"/g)].length,1);
  assert.ok(toolbar,'one shared toolbar exists');
  assert.match(toolbar,/role="group" aria-label="源码视图操作"/);
  assert.match(toolbar,/id="program-source-files"/);
  assert.doesNotMatch(toolbar,/id="program-new-script"/);
  assert.doesNotMatch(toolbar,/新建单文件草稿|aria-haspopup=/,'there is only one create action, not a multi-file creation menu');
  assert.match(css,/\.program-source-toolbar\{display:flex;flex-wrap:nowrap;/);
  assert.match(css,/\.program-source-toolbar #program-source-files\{[^}]*flex:1 1 0;min-width:0;/);
  assert.doesNotMatch(css,/\.program-source-toolbar #program-new-script\{/);
  assert.match(design,/\.od-icon-button\{[^}]*width:var\(--od-icon-size\);height:var\(--od-icon-size\);/,
    'new action inherits the shared icon button component');
  assert.match(design,/:root\{[^}]*font-size:13px;/,
    'Side Panel default text remains readable at narrow widths');
  assert.match(source,/get\('program-source-toolbar'\)\.hidden = !value/);
  assert.match(source,/get\('program-new-script'\)\.hidden = !value/);
});

test('R19 Sidebar spacing and corner system is consistent across all five tabs',async()=>{
  const [html,css,design,tokens]=await Promise.all([read('src/ui/tool.html'),read('src/ui/tool-shell.css'),read('src/ui/design-system.css'),read('src/ui/design-tokens.css')]);
  const body=(selector,source=css)=>{
    const at=source.indexOf(selector+'{');
    assert.ok(at>=0,'missing CSS rule '+selector);
    return source.slice(at+selector.length+1,source.indexOf('}',at));
  };
  for(const tab of ['tasks','tools','workflow','develop','cloud'])
    assert.match(html,new RegExp('data-workbench-page="'+tab+'"'),'preserved view '+tab);
  assert.match(body(':root',tokens),/--space-2:8px;\s*--space-3:12px/);
  assert.match(body(':root',tokens),/--radius-control:8px;\s*--radius-surface:12px;\s*--radius-pill:999px/);
  assert.match(body('button',design),/border-radius:var\(--radius-control\)/);
  assert.match(body('.dock-buttons button'),/border-radius:var\(--radius-control\)/);
  // R31: independent sections use 16px; related subgroups keep the shared 8px rhythm.
  assert.match(body('#workspace-content #workbench-develop'),/display:grid;gap:var\(--space-4\)/);
  assert.match(body('#workbench-develop .developer-editor'),/display:grid;gap:var\(--space-4\)/);
  assert.ok(html.includes('class="developer-context od-stack"'));
  assert.ok(html.includes('class="developer-run-area od-stack"'));
  assert.match(body('.od-stack',design),/gap:var\(--space-2\)/);
  assert.match(body('#workbench-develop #manual-source-editor'),/display:grid;gap:var\(--space-2\)/);
  assert.match(body('#workbench-develop .local-project-tools>:not([hidden])'),/margin-block:0/);
  for(const selector of ['.developer-source-switch','#script-source','.program-source-toolbar','#tool-diagnostics'])
    assert.match(body(selector),/margin:(?:0|0;)/,'view-owned vertical margin: '+selector);
  assert.match(body('#workbench-develop .developer-context .developer-target>details,\n#workbench-develop .developer-run-area>:not([hidden])'),
    /margin-block:0/, 'related groups do not add default detail margins');
  for(const selector of ['.od-disclosure','.od-disclosure>summary'])
    assert.ok(body(selector,design).includes('var(--od-'), 'public appearance is in Design System: '+selector);
  assert.match(body('.local-discovery-filters'),/display:flex;flex-wrap:wrap;width:max-content;max-width:100%;[^}]*margin:0;[^}]*border-radius:var\(--radius-surface\)/);
  assert.match(body('.local-discovery-filters button'),/border-radius:var\(--radius-control\)/);
  assert.doesNotMatch(body('.local-discovery-filters button'),/border-radius:18px/);
  assert.match(body('.task-search-panel'),/display:grid;gap:var\(--space-2\)/);
  assert.match(body('#task-search-panel[hidden]'),/display:none!important/,'closed search consumes no vertical space');
  assert.match(body('#local-project-status:empty'),/display:none/,'empty local project message consumes no vertical space');
  for(const selector of ['.task-card-group','.sidebar-tool-row','.sidebar-tool-official','.workflow-composer'])
    assert.match(body(selector),/border-radius:var\(--radius-surface\)/,'consistent card corners: '+selector);
  assert.match(body('.od-surface',design),/border-radius:var\(--radius-surface\)/,
    'shared surface owns the card radius');
  assert.ok(load(html)('.workflow-card').toArray().every(card=>load(html)(card).hasClass('od-surface')),
    'workflow card must use shared od-surface instead of redefining radius');
  for(const selector of ['.task-card-state','.local-project-switch-track','.workflow-pill','.catalog-card-state'])
    assert.match(body(selector),/border-radius:var\(--radius-pill\)/,'semantic pill corners: '+selector);
  for(const selector of ['.workflow-chat-entry','.sidebar-tool-capabilities'])
    assert.match(body(selector),/border-radius:var\(--radius-control\)/,'shared inside-control radius: '+selector);
  assert.match(body('.od-alert',design),/border-radius:var\(--radius-control\)/,
    'warning components obtain radius from the public alert');
  for(const id of ['workflow-ai-approval','workflow-target-warning'])
    assert.ok(load(html)('#'+id).hasClass('od-alert'),'warning owns shared alert appearance: '+id);
  assert.match(body(':is(input,select,textarea).od-field',design),/border-radius:var\(--radius-control\)/,
    'code editor is a shared field control with the standard control radius');
  assert.ok(load(html)('#script-source').hasClass('od-field'),'editor retains shared field style');
  assert.match(body('.catalog-reader-note'),/border-radius:var\(--radius-control\)/,'catalog hints share control radius');
  assert.match(body('.workbench-nav button'),/border-radius:0/,'tab underline remains square intentionally');
  assert.match(body('.task-card'),/border-radius:0!important/,'the single installed list retains compact rows');
  assert.match(css,/:focus-visible/,'keyboard focus state remains visible');
});

test('R4/R23 five-tab design system has one token source and a strict trusted asset pipeline',async()=>{
  const [html,tokens,design,css,prepare,verify,visual]=await Promise.all([
    read('src/ui/tool.html'),read('src/ui/design-tokens.css'),read('src/ui/design-system.css'),read('src/ui/tool-shell.css'),
    read('scripts/prepare-public.mjs'),read('scripts/verify-package.mjs'),read('scripts/tests/sidebar-r19-layout-visual.mjs')
  ]);
  assert.match(html,/<link rel="stylesheet" href="design-tokens\.css"><link rel="stylesheet" href="design-system\.css"><link rel="stylesheet" href="tool-shell\.css">/);
  for(const view of ['tasks','tools','workflow','develop','cloud'])
    assert.ok(html.includes('class="od-page" data-workbench-page="'+view+'"'),'shared page layout '+view);
  for(const toolbar of ['task-section-head','local-discovery-search-row','workflow-head'])
    assert.ok(html.includes('class="'+toolbar+' od-toolbar"'),'shared toolbar '+toolbar);
  assert.ok(html.includes('class="developer-source-switch od-toolbar od-page-head"'),'shared page head developer-source-switch');
  assert.ok(html.includes('class="sidebar-tools-head od-toolbar od-page-head"'),'shared page head sidebar-tools-head');
  for(const card of ['catalog-reader'])
    assert.ok(html.includes('class="'+card+' od-surface"'),'shared surface '+card);
  assert.ok(html.includes('id="sidebar-tool-official-catalog"'),'official rows render from trusted Catalog');
  assert.match(await read('src/ui/sidebar-tools.js'),/row\.className='sidebar-tool-official od-surface'/,'dynamic official rows retain the shared surface');
  assert.ok(html.includes('class="local-discovery-filters od-segmented"'));
  assert.ok(html.includes('class="task-search-panel" hidden'));
  assert.doesNotMatch(html,/class="local-discovery-list od-surface"/);
  assert.ok(html.includes('class="task-card-list od-stack"'));
  assert.ok(html.includes('class="sidebar-tool-list od-stack"'));
  for(const token of ['--od-ink:','--od-sub:','--od-bg:','--od-line:','--od-brand:','--space-2:8px','--radius-control:8px','--radius-surface:12px']){
    const isThemeColor=token.startsWith('--od-');
    assert.equal((tokens.match(new RegExp(token,'g'))||[]).length,isThemeColor?2:1,
      (isThemeColor?'one value per color scheme: ':'one shared layout value: ')+token);
  }
  assert.match(tokens,/@media\(prefers-color-scheme:dark\)/,'dark semantic colors belong to tokens');
  assert.doesNotMatch(css,/:root\s*\{/,'no competing base tokens in per-view CSS');
  assert.doesNotMatch(design,/--od-brand:\s*#/,'R23 palette values stay in tokens');
  assert.doesNotMatch(tokens,/html,body|overflow:\s*hidden/,'R23 tokens cannot set page layout');
  assert.doesNotMatch(css,/^button\s*\{/m,'no global control reset in per-view CSS');
  assert.doesNotMatch(design,/@import\b|url\s*\(|expression\s*\(/i);
  assert.match(prepare,/'src\/ui\/design-tokens\.css':'ui\/design-tokens\.css'/);
  assert.match(prepare,/'src\/ui\/design-system\.css':'ui\/design-system\.css'/);
  assert.doesNotMatch(prepare,/bookmark-manager\.css/,
    'legacy bookmark styles must not be copied into the trusted package');
  assert.ok(verify.includes("'ui/tool.html': ['design-tokens.css', 'design-system.css', 'tool-shell.css', 'time-review.css', 'cloud-hosting.css', 'extension-center.css', 'sidebar-tool-host.js', 'stay-focus-controls.js', 'trusted-cookie-ui.js', 'tool-shell.js']"),
    'the fixed asset verifier must require cloud hosting CSS and the precise trusted sidecars before the main shell');
  assert.match(html, /<script src="sidebar-tool-host\.js"><\/script>\s*<script src="stay-focus-controls\.js"><\/script>\s*<script src="trusted-cookie-ui\.js"><\/script>\s*<script src="tool-shell\.js"><\/script>/,
    'the native Cookie/Stay Focus controls load in a verified order before the Side Panel shell');
  // Resource auditors may add newly trusted CSS (for example Cloud Console)
  // without weakening the original token, shell and workspace audit closure.
  const auditedCSS=[...verify.matchAll(/for\(const cssPath of \[([^\]]+)\]\)/g)]
    .flatMap(([,list])=>[...list.matchAll(/'([^']+\.css)'/g)].map(([,path])=>path));
  for(const path of ['ui/design-tokens.css','ui/design-system.css','ui/tool-shell.css','ui/extension-center.css',
    'ui/cloud-control-console.css','native-agent/settings.css','native-agent/workspace.css'])
    assert(auditedCSS.includes(path),'CSS build verification audits '+path);
  assert.match(verify,/if\(cssPath==='native-agent\/workspace\.css'\)inspectWorkspaceStyle\(css\)/,'Workspace CSS extends the original closed asset audit');
  assert.ok(visual.includes('document.styleSheets.length===document.querySelectorAll("link[rel=stylesheet]").length'),
    'static Chrome verifies all linked trusted stylesheets, not a hardcoded count');
  assert.ok(visual.includes('].every(link=>link.sheet)'),
    'static Chrome waits until every required stylesheet loads');
});
