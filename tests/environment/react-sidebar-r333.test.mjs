import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import {transformWithEsbuild} from 'vite';

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
  assert.match(shell,/mountExtensionList\(document\)/);
  assert.match(shell,/extensionCenter\.dispose\(\); extensionList\.dispose\(\)/);
  await assert.rejects(access('packages/opendesk-ui-react'));
});

test('R33.3 real TSX transformation and privilege-free UI modules',async()=>{
  for(const path of ['src/ui/react/main.tsx','src/ui/react/tabs/tools.tsx',
    'src/ui/react/tabs/develop.tsx','src/ui/react/tabs/workflow.tsx',
    'src/ui/react/tabs/tasks.tsx','src/ui/react/tabs/cloud.tsx',
    'src/ui/react/components/ui/button.tsx']){
    const code=await read(path);
    const transformed=await transformWithEsbuild(code,path,{loader:'tsx',jsx:'transform',target:'es2022'});
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

test('R33.3 single DOM child owner and original privileged operations',async()=>{
  const [main,center,rows,html,docs]=await Promise.all([
    read('src/ui/react/main.tsx'),read('src/ui/extension-center.js'),
    read('src/ui/react/tabs/tools.tsx'),read('src/ui/tool.html'),
    read('docs/architecture/react-ui-shared-components-r33.zh-CN.md')
  ]);
  assert.match(html,/id="extension-center-list" class="ec-list"/);
  assert.match(main,/createRoot\(host\)/);
  assert.match(main,/createPortal\(<ExtensionRows/);
  assert.match(main,/createPortal\(<ExtensionRowMenu/);
  assert.match(main,/attachRowMenu\(element\)/);
  assert.match(main,/renderRowMenu\(items\)/);
  assert.match(main,/createPortal\(<ExtensionDetail/);
  assert.match(main,/createPortal\(<ExtensionToolbar/);
  assert.match(main,/createPortal\(<ExtensionRecoveries/);
  assert.match(main,/createPortal\(<ExtensionEmpty/);
  assert.match(main,/createPortal\(<ExtensionStatus/);
  assert.match(main,/createPortal\(\s*<DeveloperTargetText/);
  assert.match(main,/developerTargetMounted/);
  assert.match(main,/renderDeveloperTarget\(next\)/);
  assert.match(main,/createPortal\(\s*<DeveloperActions/);
  assert.match(main,/renderDeveloperActions\(next\)/);
  assert.match(main,/createPortal\(\s*<DeveloperFramework/);
  assert.match(main,/renderDeveloperFramework\(next\)/);
  assert.match(main,/createPortal\(\s*<DeveloperRunStatus/);
  assert.match(main,/renderDeveloperStatus\(next\)/);
  assert.match(main,/renderDeveloperResult\(next\)/);
  assert.match(main,/createPortal\(\s*<DeveloperResultText/);
  assert.match(main,/developerRunStatus\.replaceChildren\(\)/);
  assert.match(main,/node\.replaceChildren\(\)/);
  assert.match(main,/renderFeedback\(next\)/);
  assert.match(center,/extensionList\.renderFeedback\(/);
  assert.match(center,/extensionList\.renderRecoveries\(/);
  assert.match(center,/extensionList\.attachRowMenu\(rowMenu\)/);
  assert.match(center,/extensionList\.renderRowMenu\(menuItems\)/);
  assert.match(center,/if\(extensionList\)\{menuItems\.push\(/);
  assert.match(center,/extensionList\.renderStatus\(/);
  const [shell,scriptEditor]=await Promise.all([
    read('src/ui/tool-shell.js'),read('src/ui/script-editor.js')
  ]);
  assert.match(shell,/scriptEditor\.connectReactDeveloperResult\(/);
  assert.match(scriptEditor,/connectReactDeveloperResult\(render\)/);
  assert.match(scriptEditor,/if\(reactDeveloperResult\)reactDeveloperResult\(/);
  assert.doesNotMatch(scriptEditor,/\b(?:output|resultKind)\.textContent\s*=(?!=)/);
  assert.match(shell,/scriptEditor\.connectReactDeveloperTarget\(/);
  assert.match(scriptEditor,/connectReactDeveloperTarget\(render\)/);
  assert.match(shell,/scriptEditor\.connectReactDeveloperActions\(/);
  assert.match(scriptEditor,/connectReactDeveloperActions\(render\)/);
  assert.match(shell,/scriptEditor\.connectReactDeveloperFramework\(/);
  assert.match(scriptEditor,/connectReactDeveloperFramework\(render\)/);
  assert.match(shell,/scriptEditor\.connectReactDeveloperStatus\(/);
  assert.match(scriptEditor,/connectReactDeveloperStatus\(render\)/);
  assert.match(scriptEditor,/if\(reactDeveloperStatus\)reactDeveloperStatus\(/);
  assert.match(scriptEditor,/chooseComponentMode\(next\)/);
  assert.match(scriptEditor,/entry\.element\.removeEventListener/);
  assert.match(scriptEditor,/onRun:start,onSave:saveClick/);
  assert.match(scriptEditor,/if\(reactDeveloperTarget\)reactDeveloperTarget\(ui\)/);
  assert.doesNotMatch(main,/createRoot\(container\)|createRoot\(detailContainer\)/);
  assert.match(main,/root\.unmount\(\)/);
  assert.match(main,/flushSync/);
  assert.match(center,/if\(!extensionList\)list\.replaceChildren\(\)/);
  assert.match(center,/extensionList\.renderRows\(/);
  assert.match(center,/extensionList\.renderToolbar\(/);
  assert.match(center,/if\(!extensionList\)\{/);
  assert.match(center,/extensionList\.renderDetail\(/);
  assert.match(rows,/export function ExtensionDetail/);
  assert.match(rows,/data-ec-detail-action/);
  assert.match(rows,/onClick=\{event=>onMore\(row\.key,event\.currentTarget\)\}/);
  assert.match(rows,/aria-expanded=\{menuKey===row\.key\}/);
  assert.match(center,/sidebarTools\.toggleEnabled\(row\.id,event\)/);
  assert.match(center,/setInstalledPageProgramEnabled\(/);
  assert.match(center,/if\(!row\|\|row\.installed!==selectedInstalled\|\|identityChanged\)/);
  assert.match(center,/retryCleanup\(row,event\)/);
  assert.match(center,/rowMenu\.contains\(doc\.activeElement\).*ArrowDown/);
  assert.match(center,/event\.key==='Tab'&&rowMenu\.contains\(doc\.activeElement\)/);
  assert.match(center,/togglePage\(row,event\)/);
  assert.match(docs,/当前唯一生效的 React 源码路径决定/);
});
