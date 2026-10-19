import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import {transform} from 'esbuild';

const read=path=>readFile(path,'utf8');

test('R33.3 pins one React 19 runtime and keeps existing fixed WXT entry',async()=>{
  const pkg=JSON.parse(await read('package.json'));
  const lock=JSON.parse(await read('package-lock.json'));
  assert.equal(pkg.dependencies.react,'19.2.0');
  assert.equal(pkg.dependencies['react-dom'],'19.2.0');
  for(const dependency of ['react','react-dom']){
    assert.equal(lock.packages[''].dependencies[dependency],pkg.dependencies[dependency]);
    assert.equal(lock.packages['node_modules/'+dependency].version,'19.2.0');
  }
  assert.equal(lock.packages['node_modules/scheduler'].version,'0.27.0');
  assert.match(await read('src/entrypoints/tool-shell.js'),/initToolShell/);
  const shell=await read('src/ui/tool-shell.js');
  assert.match(shell,/mountSidebarApp\(document,\{debugEnabled/);
  assert.match(shell,/reactNavigationRequest\?\.\(view\)/);
  assert.match(shell,/extensionCenter\.dispose\(\); sidebarTools\.dispose\(\); extensionList\.dispose\(\)/);
  await assert.rejects(access('packages/opendesk-ui-react'));
});

test('R33.3 real TSX transformation and privilege-free UI modules',async()=>{
  for(const path of ['src/ui/react/main.tsx','src/ui/react/tabs/tools.tsx',
    'src/ui/react/tabs/develop.tsx','src/ui/react/tabs/workflow.tsx',
    'src/ui/react/tabs/tasks.tsx','src/ui/react/tabs/cloud.tsx',
    'src/ui/react/tabs/navigation.tsx',
    'src/ui/react/components/ui/button.tsx']){
    const code=await read(path);
    const transformed=await transform(code,{loader:'tsx',jsx:'transform',target:'es2022'});
    assert.ok(transformed.code.length>0,'TSX transpiles: '+path);
    // The trusted bookmark pilot imports four fixed, reviewed first-party sources.
    // Exempt those exact statements only; arbitrary sidebar-tool imports remain forbidden.
    const auditedBookmarkImports=[
      "import '../../../examples/sidebar-tools/bookmark-manager/src/model.js';",
      "import '../../../examples/sidebar-tools/bookmark-manager/src/service.js';",
      "import BookmarkReactApp from '../../../examples/sidebar-tools/bookmark-manager/src/react/App.jsx';",
      "import bookmarkScopedCSS from '../../../examples/sidebar-tools/bookmark-manager/src/react/style.css?raw';"
    ];
    const checkedCode=path==='src/ui/react/main.tsx'
      ?auditedBookmarkImports.reduce((value,statement)=>value.replace(statement,''),code)
      :code;
    assert.doesNotMatch(checkedCode,/from ['"][^'"]*(?:framework\/sdk|platform\/host|sidebar-tools\/installation|chrome|examples\/sidebar-tools)/);
  }
});

test('R35.4 Extension Center React owns the list while existing Controller owns actions',async()=>{
  const [main,center,rows,html,docs,shell]=await Promise.all([
    read('src/ui/react/main.tsx'),read('src/ui/extension-center.js'),
    read('src/ui/react/tabs/tools.tsx'),read('src/ui/sidepanel.html'),
    read('docs/architecture/react-ui-shared-components-r33.zh-CN.md'),
    read('src/ui/tool-shell.js')
  ]);
  // The formal HTML must not regain the duplicated extension business UI.
  assert.doesNotMatch(html,/id="extension-center-list"/);
  assert.match(rows,/<ul id="extension-center-list"/);
  for(const id of ['extension-center-search','extension-center-detail','extension-center-status',
    'extension-center-import-host','extension-center-menu','extension-center-back'])
    assert.ok(rows.includes('id="'+id+'"'),id+' belongs to the React page');
  assert.equal((main.match(/\bcreateRoot\s*\(/g)||[]).length,1);
  assert.match(main,/createRoot\(mount\)/);
  assert.match(main,/<SidebarAppShell activeTab=\{navigationTab\}/);
  assert.match(await read('src/ui/react/app-shell.tsx'),/<ExtensionCenterPage \{\.\.\.extensionProps\}\/>/);
  assert.doesNotMatch(main,/createPortal\s*\(\s*<(?:ExtensionRows|ExtensionDetail|ExtensionToolbar|ExtensionStatus|ExtensionRecoveries|ExtensionRowMenu)/);
  assert.match(main,/bookmarkPilot&&createPortal\(/);
  assert.doesNotMatch(main,/createPortal\(<DebugDiagnosticText/);
  assert.match(main,/root\.unmount\(\)/);
  assert.match(main,/flushSync/);
  assert.match(rows,/export function ExtensionCenterPage/);
  assert.match(rows,/export function ExtensionDetail/);
  assert.match(rows,/return createPortal\(<div ref=\{ref\} id="extension-center-row-menu"/);
  assert.match(rows,/onClick=\{event=>onOpenRow\(row\.key,event\.nativeEvent\)\}/);
  assert.match(rows,/onClick=\{event=>onMore\(row\.key,event\.currentTarget,event\.nativeEvent\)\}/);
  assert.match(rows,/data-ec-detail-action/);
  // Retain exactly one real privileged operation chain: React event ->
  // ExtensionCenter Controller -> existing SidebarTools/Page Installer.
  for(const method of ['renderRows','renderToolbar','renderFeedback','renderRecoveries',
    'renderStatus','renderRowMenu','renderView','connectBack'])
    assert.ok(center.includes('extensionList.'+method+'('),method+' keeps Controller authority');
  assert.match(center,/sidebarTools\.toggleEnabled\(row\.id,event\)/);
  assert.match(center,/setInstalledPageProgramEnabled\(/);
  assert.match(center,/retryCleanup\(row,event\)/);
  assert.match(shell,/extensionCenter\.dispose\(\); sidebarTools\.dispose\(\); extensionList\.dispose\(\)/);
  assert.match(docs,/当前唯一生效的 React 源码路径决定/);
});
