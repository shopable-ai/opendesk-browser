import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {formatSidebarToolTitle} from '../../src/ui/sidebar-tools/title-path.js';

test('root, trusted settings and actual child pages share one compact title',()=>{
  assert.equal(formatSidebarToolTitle({toolTitle:'书签管理'}),'书签管理');
  assert.equal(formatSidebarToolTitle({toolTitle:'书签管理',isSettings:true}),'书签管理 / 设置');
  assert.equal(formatSidebarToolTitle({toolTitle:'知识收件箱',pageTitle:'编辑知识'}),'知识收件箱 / 编辑知识');
  assert.equal(formatSidebarToolTitle({toolTitle:'网页剪藏',pageTitle:'网页剪藏',isHome:true}),'网页剪藏');
  assert.equal(formatSidebarToolTitle({toolTitle:'书签管理',pageTitle:'首页'}),'书签管理');
  assert.equal(formatSidebarToolTitle({toolTitle:'书签管理',pageTitle:'书签管理 / 设置'}),'书签管理 / 设置');
  assert.equal(formatSidebarToolTitle({toolTitle:'书签管理',pageTitle:'详情',isSettings:true}),'书签管理 / 设置');
  assert.equal(formatSidebarToolTitle({toolTitle:'书签管理',readOnlyLabel:'只读预览'}),'书签管理 · 只读预览');
  assert.equal(formatSidebarToolTitle({toolTitle:'  '}),'');
});

test('Host keeps one trusted title/back, verified navigation and genuine settings back',async()=>{
  const [host,bridge,react]=await Promise.all([
    readFile(new URL('../../src/ui/sidebar-tools.js',import.meta.url),'utf8'),
    readFile(new URL('../../src/sidebar-tools/bridge.js',import.meta.url),'utf8'),
    readFile(new URL('../../src/ui/react/tabs/tool-host.tsx',import.meta.url),'utf8')
  ]);
  assert.ok(host.includes('formatSidebarToolTitle({toolTitle:visibleTitle'));
  assert.ok(host.includes('isSettings:tocSettingsOpen'));
  assert.ok(host.includes('pageTitle:navigation?.title'));
  assert.ok(host.includes('approvedNavigation=Boolean(release&&await matchesOfficialRelease(release,tool))'));
  assert.ok(host.includes("if(tocSettingsOpen){closePromptSettings();"));
  assert.ok(host.includes("const backLabel=tocSettingsOpen?'返回上一页'"));
  assert.ok(bridge.includes('navigationAllowed=message.navigationAllowed===true'));
  assert.equal((react.match(/id="sidebar-tool-title"/g)||[]).length,1);
  assert.equal((react.match(/id="sidebar-tool-back"/g)||[]).length,1);
});
