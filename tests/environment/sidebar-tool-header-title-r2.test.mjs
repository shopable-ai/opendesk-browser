import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
  formatSidebarToolTitle,formatSidebarToolTitleContext,sidebarToolTitleParts
} from '../../src/ui/sidebar-tools/title-path.js';

const read=p=>readFile(new URL('../../'+p,import.meta.url),'utf8');

test('root names and concise child actions keep complete semantic context',()=>{
  const cases=[
    [{toolTitle:'书签管理'},'书签管理','书签管理'],
    [{toolTitle:'书签管理',isSettings:true},'设置','书签管理 / 设置'],
    [{toolTitle:'书签管理',pageTitle:'编辑书签'},'编辑','书签管理 / 编辑书签'],
    [{toolTitle:'书签管理',pageTitle:'书签管理 / 编辑文件夹'},'编辑','书签管理 / 编辑文件夹'],
    [{toolTitle:'书签管理',pageTitle:'新建书签'},'新建','书签管理 / 新建书签'],
    [{toolTitle:'提示词快捷按钮',pageTitle:'提示词详情'},'详情','提示词快捷按钮 / 提示词详情'],
    [{toolTitle:'提示词快捷按钮',pageTitle:'编辑提示词'},'编辑','提示词快捷按钮 / 编辑提示词'],
    [{toolTitle:'提示词快捷按钮',pageTitle:'新建提示词'},'新建','提示词快捷按钮 / 新建提示词'],
    [{toolTitle:'知识收件箱',pageTitle:'编辑知识'},'编辑','知识收件箱 / 编辑知识'],
    [{toolTitle:'网页剪藏',pageTitle:'摘录详情'},'详情','网页剪藏 / 摘录详情'],
    [{toolTitle:'网页剪藏',pageTitle:'我的摘录'},'我的摘录','网页剪藏 / 我的摘录'],
    [{toolTitle:'网页剪藏',pageTitle:'网页剪藏',isHome:true},'网页剪藏','网页剪藏'],
    [{toolTitle:'书签管理',pageTitle:'首页'},'书签管理','书签管理'],
    [{toolTitle:'书签管理',pageTitle:'编辑书签',isSettings:true},'设置','书签管理 / 设置'],
    [{toolTitle:'书签管理',pageTitle:'编辑书签',readOnlyLabel:'只读预览'},
      '编辑 · 只读预览','书签管理 / 编辑书签 · 只读预览']
  ];
  for(const [options,visible,context] of cases){
    assert.equal(formatSidebarToolTitle(options),visible);
    assert.equal(formatSidebarToolTitleContext(options),context);
  }
  assert.equal(formatSidebarToolTitle({toolTitle:'  '}),'');
  assert.equal(formatSidebarToolTitleContext({toolTitle:'  '}),'');
});

test('long or unknown titles do not get arbitrarily truncated before CSS overflow',()=>{
  const tool='非常长的书签管理工具名称和多个业务分类'.repeat(6);
  const leaf='编辑一个同样很长的子页面标题'.repeat(4);
  assert.deepEqual(sidebarToolTitleParts({toolTitle:tool,pageTitle:leaf}),{tool,page:leaf});
  assert.deepEqual(sidebarToolTitleParts({toolTitle:tool,pageTitle:leaf,isSettings:true}),
    {tool,page:'设置'});
  assert.deepEqual(sidebarToolTitleParts({toolTitle:tool,pageTitle:tool+' / '+leaf}),
    {tool,page:leaf});
  assert.equal(formatSidebarToolTitle({toolTitle:tool,pageTitle:leaf}),leaf);
  assert.equal(formatSidebarToolTitle({toolTitle:tool,pageTitle:tool+' / 文件夹 / '+leaf}),leaf);
  assert.equal(formatSidebarToolTitleContext({toolTitle:tool,pageTitle:leaf}),tool+' / '+leaf);
  assert.equal(formatSidebarToolTitleContext({toolTitle:tool,pageTitle:tool+' / 文件夹 / '+leaf}),
    tool+' / 文件夹 / '+leaf);
});

test('Host uses trusted navigation and one accessible heading, not a nested path',async()=>{
  const [host,bridge,react,prompt]=await Promise.all([
    read('src/ui/sidebar-tools.js'),read('src/sidebar-tools/bridge.js'),
    read('src/ui/react/tabs/tool-host.tsx'),
    read('examples/sidebar-tools/prompt-shortcuts/src/main.js')
  ]);
  assert.ok(host.includes('formatSidebarToolTitle(labelOptions)'));
  assert.ok(host.includes('formatSidebarToolTitleContext(labelOptions)'));
  assert.ok(host.includes("attributes:{'aria-label':fullTitle}"));
  assert.ok(host.includes("title:active?fullTitle+' · v'+active.version"));
  assert.ok(host.includes('isSettings:tocSettingsOpen'));
  assert.ok(host.includes("['home','index'].includes(navigation?.page)"));
  assert.ok(host.includes('pageTitle:nativeBookmarkNavigation?.title'));
  assert.match(host,/const hasCurrentNavigation=\(\)=>navigationAllowed&&!readOnlyPreview&&active&&\s*frameRevocationEpoch===\(revocationEpochs\[active.id\]\?\?null\)&&\s*samePackage\(active,toolById\(active.id\)\)/);
  assert.ok(host.includes('const navigation=hasCurrentNavigation()&&frame&&toolNavigation?toolNavigation:null'));
  assert.ok(host.includes('navigationAllowed=false;toolNavigation=null;clipPage=null;'));
  assert.ok(host.includes('approvedNavigation=Boolean(release&&await matchesOfficialRelease(release,tool))'));
  assert.ok(host.includes("if(tocSettingsOpen){closePromptSettings();"));
  assert.ok(host.includes("const backLabel=tocSettingsOpen?'返回上一页'"));
  assert.ok(bridge.includes('navigationAllowed=message.navigationAllowed===true'));
  assert.equal((react.match(/id="sidebar-tool-title"/g)||[]).length,1);
  assert.equal((react.match(/id="sidebar-tool-back"/g)||[]).length,1);
  assert.match(react,/id="sidebar-tool-title" className="od-page-title"[\s\S]*?role="heading" aria-level=\{2\}\/>/);
  assert.doesNotMatch(react,/sidebar-tool-title-parent|sidebar-tool-title-divider|sidebar-tool-title-current/);
  assert.doesNotMatch(react,/className="sidebar-tool-settings-title"/);
  assert.match(react,/id="sidebar-tool-settings-view"[\s\S]*?aria-label="工具设置"/);
  assert.match(prompt,/detail:'提示词详情'/,
    'preserve the business label; simplify only the trusted presentation');
});

test('short header uses remaining width and retains fixed action targets',async()=>{
  const css=await read('src/ui/tool-shell.css');
  assert.match(css,/#sidebar-tool-title\{flex:1 1 0;min-width:0;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap\}/);
  assert.doesNotMatch(css,/\.sidebar-tool-title-parent|\.sidebar-tool-title-current|@container tool-title/);
  assert.match(css,/@media\(max-width:240px\)\{\s*#sidebar-tool-title\{flex:1 1 calc/);
  assert.match(css,/\.sidebar-tool-header-actions\{display:flex/);
  assert.match(css,/@media\(pointer:coarse\)\{[\s\S]*?flex-basis:44px/);
  assert.doesNotMatch(css,/\.sidebar-tool-settings-title\{/);
});
