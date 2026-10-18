import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {relative,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createSidebarToolPackage} from '../../scripts/build-sidebar-tool.mjs';
import {validateSidebarToolPackage,SIDEBAR_TOOL_SHARED_UI_RUNTIME} from '../../src/ui/sidebar-tools/package.js';
import {PAGE_FRAMEWORK_RUNTIMES} from '../../src/libs/page-frameworks/contract.js';

// Unlike the optional R1.6 smoke test, this is a build-bound acceptance suite.
// Missing browser assets or JSX outputs are hard failures, never SKIP.
const read=path=>readFile(new URL('../../'+path,import.meta.url),'utf8');
const demo='examples/sidebar-tools/shared-ui-demo/';
const repoRoot=fileURLToPath(new URL('../../',import.meta.url));
const project=resolve(repoRoot,demo);
const extensionDir=resolve(repoRoot,process.env.OPENDESK_SHARED_UI_EXTENSION_DIR||'dist/development');
const staged=resolve(project,'.opendesk-preview/browser');
const record=(path,bytes)=>({path,bytes:bytes.length,
  sha256:createHash('sha256').update(bytes).digest('hex')});
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
  assert.match(vite,/opendesk-shared-ui-pinned-react/);
  assert.match(vite,/OpenDeskPageReact/);
  assert.match(vite,/config\.build\.rollupOptions\.external = \[\]/);
  assert.equal(lock.packages['node_modules/react-aria-components'].version,'1.22.1');
  assert.equal(lock.packages[''].dependencies['react-aria-components'],'1.22.1');
});
test('staged WXT bytes and JSX tool match the selected build and source receipt',async()=>{
  const receipt=JSON.parse(await readFile(resolve(staged,'receipt.json'),'utf8'));
  assert.equal(receipt.format,'opendesk.shared-ui-preview.v1');
  assert.equal(receipt.extensionDir,relative(repoRoot,extensionDir));
  const manifest=await readFile(resolve(extensionDir,'manifest.json'));
  assert.equal(JSON.parse(manifest).manifest_version,3);
  assert.deepEqual(receipt.extensionManifest,record('manifest.json',manifest));
  const expected=[
    PAGE_FRAMEWORK_RUNTIMES.react.output,'sidebar-shared-ui.js','ui/design-tokens.css',
    PAGE_FRAMEWORK_RUNTIMES.react.licensePath,'licenses/shared-ui-third-party-notices.txt'
  ];
  assert.deepEqual(receipt.browserAssets.map(row=>row.path),expected);
  const binaries=await Promise.all(expected.map(async(path,i)=>{
    const [compiled,preview]=await Promise.all([
      readFile(resolve(extensionDir,path)),readFile(resolve(staged,path))]);
    assert.deepEqual(preview,compiled,'Staged WXT bytes differ: '+path);
    assert.deepEqual(receipt.browserAssets[i],record(path,compiled));
    return preview;
  }));
  for(let i=0;i<binaries.length;i++)assert.ok(binaries[i].byteLength>0,
    'missing compiled asset '+expected[i]);
  assert.equal(binaries[0].byteLength,PAGE_FRAMEWORK_RUNTIMES.react.bytes);
  assert.equal(record(expected[0],binaries[0]).sha256,PAGE_FRAMEWORK_RUNTIMES.react.sha256);
  assert.deepEqual(receipt.sources.map(row=>row.path),[
    'package.json','tool.config.json','vite.config.mjs','preview/index.html',
    'src/App.jsx','src/main.jsx','src/root.html','src/style.css']);
  for(const source of receipt.sources)
    assert.deepEqual(source,record(source.path,await readFile(resolve(project,source.path))),
      'Preview source changed since build: '+source.path);
  assert.deepEqual(receipt.toolAssets.map(row=>row.path),['dist/tool.js','dist/tool.css']);
  const tool=await Promise.all(receipt.toolAssets.map(async row=>{
    const bytes=await readFile(resolve(project,row.path));
    assert.deepEqual(row,record(row.path,bytes),'Demo output changed since build: '+row.path);
    assert.ok(bytes.length>0);
    return bytes;
  }));
  const shared=binaries[1].toString('utf8'),js=tool[0].toString('utf8');
  assert.match(shared,/OpenDeskSidebarUI/);
  assert.doesNotMatch(shared,/ReactDOMRoot|ReactCurrentDispatcher|react\\.production\\.js/,
    'Bundled browser shared UI must not duplicate the separately published React runtime');
  assert.match(js,/OpenDeskSidebarUI/);
  assert.ok(binaries[1].byteLength<512*1024,'Shared UI resource exceeds fixed WXT budget');
  assert.ok(tool[0].byteLength<50000,'Demo JS includes unexpected bundled dependencies');
  assert.doesNotMatch(js,/ReactDOMRoot|ReactCurrentDispatcher|react\\.production\\.js/);
  const pkg=await createSidebarToolPackage(fileURLToPath(new URL('../../'+demo,import.meta.url)));
  assert.equal(pkg.uiRuntime,SIDEBAR_TOOL_SHARED_UI_RUNTIME);
  assert.deepEqual(pkg.capabilities,[]);
  assert.equal(pkg.html.trim(),'<div id="tool-app"></div>');
  assert.equal(pkg.js,js);
  assert.equal(pkg.css,tool[1].toString('utf8'));
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
  assert.deepEqual([...preview.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map(match=>match[1]),[
    '../.opendesk-preview/browser/'+PAGE_FRAMEWORK_RUNTIMES.react.output,
    '../.opendesk-preview/browser/sidebar-shared-ui.js','../dist/tool.js']);
  assert.deepEqual([...preview.matchAll(/<link\b[^>]*\bhref="([^"]+)"/g)].map(match=>match[1]),[
    '../.opendesk-preview/browser/ui/design-tokens.css','../dist/tool.css']);
  assert.doesNotMatch(preview,/dist\/(?:development|production)/);
  assert.doesNotMatch(preview,/<input[^>]+type=["']checkbox|role=["']switch/);
  await stat(new URL('../../'+demo+'preview/index.html',import.meta.url));
  const license=await read('docs/contracts/licenses/shared-ui-third-party-notices.txt');
  assert.match(license,/shadcn\/ui MIT License/);
  assert.match(license,/Apache License/);
  assert.equal(await readFile(resolve(staged,'licenses/shared-ui-third-party-notices.txt'),'utf8'),license);
  assert.equal(await readFile(resolve(staged,PAGE_FRAMEWORK_RUNTIMES.react.licensePath),'utf8'),
    await read(PAGE_FRAMEWORK_RUNTIMES.react.licenseSource));
});
