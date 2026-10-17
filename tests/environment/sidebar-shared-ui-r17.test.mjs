import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createSidebarToolPackage} from '../../scripts/build-sidebar-tool.mjs';
import {validateSidebarToolPackage,SIDEBAR_TOOL_SHARED_UI_RUNTIME} from '../../src/ui/sidebar-tools/package.js';
import {PAGE_FRAMEWORK_RUNTIMES} from '../../src/libs/page-frameworks/contract.js';

// Unlike the optional R1.6 smoke test, this is a build-bound acceptance suite.
// Missing browser assets or JSX outputs are hard failures, never SKIP.
const read=path=>readFile(new URL('../../'+path,import.meta.url),'utf8');
const demo='examples/sidebar-tools/shared-ui-demo/';
test('upstream React Aria primitive and canonical design tokens own Switch behavior',async()=>{
  const [component,card,style,vite,entry,lock]=await Promise.all([
    read('src/ui/react/components/ui/switch.tsx'),
    read('src/ui/react/components/ui/card.tsx'),
    read('src/ui/react/components/ui/sidebar-shared.css'),
    read('wxt.config.mjs'),
    read('src/entrypoints/sidebar-shared-ui.js'),
    read('package-lock.json').then(JSON.parse)
  ]);
  assert.match(component,/from 'react-aria-components'/);
  assert.match(component,/composeRenderProps/);
  assert.doesNotMatch(component,/<input\\b|type="checkbox"/);
  assert.match(card,/data-slot="card"/);
  assert.match(card,/data-slot="card-content"/);
  assert.match(style,/data-selected/);
  assert.match(style,/data-focus-visible/);
  assert.match(style,/data-disabled/);
  assert.match(entry,/ui\/react\/components\/ui\/switch\.tsx/);
  assert.match(vite,/sharedUI\?\['react','react-dom','react-dom\/client','react\/jsx-runtime'\]/);
  assert.equal(lock.packages['node_modules/react-aria-components'].version,'1.22.1');
  assert.equal(lock.packages[''].dependencies['react-aria-components'],'1.22.1');
});
test('actual WXT sandbox assets and JSX tool are present, linked and small',async()=>{
  const expected=[
    'dist/development/sidebar-shared-ui.js',
    'dist/development/libs/page-frameworks/react-19.2.0.js',
    demo+'dist/tool.js',demo+'dist/tool.css'
  ];
  const binaries=await Promise.all(expected.map(path=>
    readFile(new URL('../../'+path,import.meta.url))));
  for(let i=0;i<binaries.length;i++)assert.ok(binaries[i].byteLength>0,
    'missing compiled asset '+expected[i]);
  assert.equal(binaries[1].byteLength,PAGE_FRAMEWORK_RUNTIMES.react.bytes);
  const shared=binaries[0].toString('utf8'),js=binaries[2].toString('utf8');
  assert.match(shared,/OpenDeskSidebarUI/);
  assert.doesNotMatch(shared,/ReactDOMRoot|ReactCurrentDispatcher|react\\.production\\.js/,
    'Bundled browser shared UI must not duplicate the separately published React runtime');
  assert.match(js,/OpenDeskSidebarUI/);
  assert.ok(binaries[0].byteLength<512*1024,'Shared UI resource exceeds fixed WXT budget');
  assert.ok(binaries[2].byteLength<50000,'Demo JS includes unexpected bundled dependencies');
  assert.doesNotMatch(js,/ReactDOMRoot|ReactCurrentDispatcher|react\\.production\\.js/);
  const pkg=await createSidebarToolPackage(fileURLToPath(new URL('../../'+demo,import.meta.url)));
  assert.equal(pkg.uiRuntime,SIDEBAR_TOOL_SHARED_UI_RUNTIME);
  assert.deepEqual(pkg.capabilities,[]);
  assert.equal(pkg.html.trim(),'<div id="tool-app"></div>');
  assert.match(pkg.js,/OpenDeskSidebarUI/);
  assert.ok(Buffer.byteLength(JSON.stringify(pkg),'utf8')<320000);
  assert.deepEqual(validateSidebarToolPackage(pkg),pkg);
});
test('HTML preview references the same built files, never an alternate mocked toggle',async()=>{
  const [preview,app,bootstrap]=await Promise.all([
    read(demo+'preview/index.html'),read(demo+'src/App.jsx'),read(demo+'src/main.jsx')]);
  assert.match(app,/useState\(false\)/);
  assert.match(app,/<Switch isSelected=\{enabled\} onChange=\{setEnabled\}/);
  assert.match(bootstrap,/root\.unmount\(\)/);
  assert.match(preview,/dist\/development\/sidebar-shared-ui\.js/);
  assert.match(preview,/dist\/tool\.js/);
  assert.doesNotMatch(preview,/<input[^>]+type=["']checkbox|role=["']switch/);
  await stat(new URL('../../'+demo+'preview/index.html',import.meta.url));
  const license=await read('docs/contracts/licenses/shared-ui-third-party-notices.txt');
  assert.match(license,/shadcn\/ui MIT License/);
  assert.match(license,/Apache License/);
  await stat(new URL('../../dist/development/licenses/shared-ui-third-party-notices.txt',import.meta.url));
});
