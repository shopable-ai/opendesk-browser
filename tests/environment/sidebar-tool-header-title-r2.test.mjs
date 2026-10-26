import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {formatSidebarToolTitle,sidebarToolTitleParts} from '../../src/ui/sidebar-tools/title-path.js';

const read=p=>readFile(new URL('../../'+p,import.meta.url),'utf8');

test('root, settings, child view and full paths always have the correct title',()=>{
  assert.equal(formatSidebarToolTitle({toolTitle:'书签管理'}),'书签管理');
  assert.equal(formatSidebarToolTitle({toolTitle:'书签管理',isSettings:true}),'书签管理 / 设置');
  assert.equal(formatSidebarToolTitle({toolTitle:'知识收件箱',pageTitle:'编辑知识'}),'知识收件箱 / 编辑知识');
  assert.equal(formatSidebarToolTitle({toolTitle:'网页剪藏',pageTitle:'网页剪藏',isHome:true}),'网页剪藏');
  assert.equal(formatSidebarToolTitle({toolTitle:'书签管理',pageTitle:'首页'}),'书签管理');
  assert.equal(formatSidebarToolTitle({toolTitle:'书签管理',pageTitle:'书签管理 / 编辑书签'}),'书签管理 / 编辑书签');
  assert.equal(formatSidebarToolTitle({toolTitle:'书签管理',pageTitle:'编辑书签',isSettings:true}),'书签管理 / 设置');
  assert.equal(formatSidebarToolTitle({toolTitle:'书签管理',readOnlyLabel:'只读预览'}),'书签管理 · 只读预览');
  assert.equal(formatSidebarToolTitle({toolTitle:'  '}),'');
});

test('long names remain full in model and current page is a separate visible part',()=>{
  const name='非常长的书签管理工具名称和多个业务分类'.repeat(6);
  const leaf='编辑一个同样很长的子页面标题'.repeat(4);
  assert.deepEqual(sidebarToolTitleParts({toolTitle:name,pageTitle:leaf}),{tool:name,page:leaf});
  assert.deepEqual(sidebarToolTitleParts({toolTitle:name,pageTitle:leaf,isSettings:true}),{tool:name,page:'设置'});
  assert.deepEqual(sidebarToolTitleParts({toolTitle:name,pageTitle:name+' / '+leaf}),{tool:name,page:leaf});
  assert.equal(formatSidebarToolTitle({toolTitle:name,pageTitle:leaf}),name+' / '+leaf);
});

test('host keeps real back, signed sandbox admission and one trusted title',async()=>{
  const [host,bridge,react]=await Promise.all([
    read('src/ui/sidebar-tools.js'),read('src/sidebar-tools/bridge.js'),
    read('src/ui/react/tabs/tool-host.tsx')
  ]);
  assert.ok(host.includes('const titleParts=sidebarToolTitleParts(titleOptions)'));
  assert.ok(host.includes('formatSidebarToolTitle({...titleOptions'));
  assert.ok(host.includes('isSettings:tocSettingsOpen'));
  assert.ok(host.includes('pageTitle:nativeBookmarkNavigation?.title'));
  assert.ok(host.includes('approvedNavigation=Boolean(release&&await matchesOfficialRelease(release,tool))'));
  assert.ok(host.includes("if(tocSettingsOpen){closePromptSettings();"));
  assert.ok(host.includes("const backLabel=tocSettingsOpen?'返回上一页'"));
  assert.ok(bridge.includes('navigationAllowed=message.navigationAllowed===true'));
  assert.equal((react.match(/id="sidebar-tool-title"/g)||[]).length,1);
  assert.equal((react.match(/id="sidebar-tool-back"/g)||[]).length,1);
  assert.match(react,/sidebar-tool-title-parent/);
  assert.match(react,/sidebar-tool-title-current/);
  assert.match(react,/aria-label=\{snapshot\.fields\['sidebar-tool-title'\]\?\.textContent/);
});

test('title flexes into remaining width, child is preferred and fixed action hit targets remain',async()=>{
  const css=await read('src/ui/tool-shell.css');
  assert.match(css,/#sidebar-tool-title\{flex:1 1 0;min-width:0/);
  assert.match(css,/container:tool-title \/ inline-size/);
  assert.match(css,/\.sidebar-tool-title-parent\{[^}]*text-overflow:ellipsis/);
  assert.match(css,/\.sidebar-tool-title-current\{[^}]*text-overflow:ellipsis/);
  assert.match(css,/@container tool-title \(max-width:100px\)/);
  assert.match(css,/@media\(max-width:240px\)\{\s*#sidebar-tool-title\{flex:1 1 calc/);
  assert.match(css,/@container tool-title[\s\S]*?\.sidebar-tool-title-parent,\.sidebar-tool-title-divider\{display:none\}/);
  assert.match(css,/\.sidebar-tool-header-actions\{display:flex/);
  assert.match(css,/@media\(pointer:coarse\)\{[\s\S]*?flex-basis:44px/);
});
