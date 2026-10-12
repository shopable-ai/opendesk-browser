import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(path,'utf8');
const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255);
const luminance=hex=>rgb(hex).map(x=>x<=0.04045?x/12.92:((x+0.055)/1.055)**2.4)
  .reduce((sum,x,i)=>sum+x*[0.2126,0.7152,0.0722][i],0);
const contrast=(a,b)=>{const [hi,lo]=[luminance(a),luminance(b)].sort((x,y)=>y-x);return (hi+0.05)/(lo+0.05)};

test('R21/R4.9 tool list has one Open entry while detail and header actions use accessible icon primitives',async()=>{
  const [host,html,tokens,design,view]=await Promise.all([
    read('src/ui/sidebar-tools.js'),read('src/ui/tool.html'),
    read('src/ui/design-tokens.css'),read('src/ui/design-system.css'),read('src/ui/tool-shell.css')
  ]);
  const installed=host.slice(host.indexOf('function renderInstalledTools'),host.indexOf('function siteCapability'));
  assert.match(installed,/button\.dataset\.sidebarToolAction='open'/);
  assert.match(installed,/item\.append\(button\);list\.append\(item\)/);
  assert.doesNotMatch(installed,/sidebar-tool-list-remove|sidebar-tool-list-tab|sidebar-tool-site-manage/,'no destructive buttons on installed rows');
  assert.match(host,/removeButton\.setAttribute\('aria-label',removeButton\.title\)/,'destructive action is in detail with explicit accessible name');
  for(const id of ['sidebar-tool-back','sidebar-tool-open-tab','sidebar-tool-remove'])
    assert.match(html,new RegExp('id="'+id+'" class="sidebar-tool-icon-action od-icon-button"'));
  for(const [id,label] of [['sidebar-tool-discover-toggle','添加工具'],['sidebar-tool-market','打开应用市场'],['sidebar-tool-import-trigger','导入工具文件']])
    assert.match(html,new RegExp('id="'+id+'" class="od-icon-button" aria-label="'+label+'"'));
  assert.match(tokens,/--od-icon-size:34px/);
  assert.match(design,/\.od-icon-button\{[^}]*width:var\(--od-icon-size\);height:var\(--od-icon-size\);/);
  assert.match(view,/\.sidebar-tools-actions \.od-icon-button\{width:var\(--od-icon-size\);height:var\(--od-icon-size\);/);
  assert.match(view,/\.sidebar-tool-view-head \.sidebar-tool-icon-action\{flex:0 0 var\(--od-icon-size\)/);
});

test('R21 shared palette normal-text colors retain AA contrast against white',async()=>{
  const design=await read('src/ui/design-tokens.css');
  for(const key of ['od-ink','od-sub','od-brand','od-positive','od-negative']){
    const match=design.match(new RegExp('--'+key+':(#[0-9a-fA-F]{6})'));
    assert.ok(match,'color token '+key);
    assert.ok(contrast(match[1],'#ffffff')>=4.5,'WCAG normal text contrast '+key);
  }
});

test('R21 Chrome fixture adds full-width states without changing its native evidence label',async()=>{
  const visual=await read('scripts/tests/sidebar-r19-layout-visual.mjs');
  for(const name of ['my-empty','my-running','discover-long','discover-empty','discover-error',
    'workflow-approval','workflow-settings','workflow-result','develop-local-loading',
    'develop-details','develop-error','tools-empty','tools-import','tools-update',
    'tools-installed','tools-open','tools-error']){
    assert.ok(visual.includes("name:'"+name+"'"),'missing static state '+name);
  }
  assert.match(visual,/const widths=\[300,360,420,520\]/);
  assert.match(visual,/dockOverlap/);
  assert.match(visual,/iconButtons/);
  assert.match(visual,/evidence:'STATIC_MARKUP_CHROME',nativeExtension:false,nativeControlEvents:false/);
  assert.match(visual,/Expected script marker missing: refusing native JS execution/);
});

test('R21 product specification reflects six official tabs and archived R5',async()=>{
  const spec=await read('docs/product/sidebar-ui-spec.zh-CN.md');
  assert.ok(spec.startsWith('# OpenDesk Browser Sidebar UI SPEC · R21（生产六页签）'));
  for(const name of ['我的','发现','工作流','开发','工具','云控'])
    assert.match(spec,new RegExp('\\| '+name+' \\|'));
  assert.match(spec,/历史存档：OpenDesk Browser Sidebar UI SPEC · R5/);
  assert.match(spec,/STATIC_MARKUP_CHROME/);
});

test('R21 secondary text selectors use the AA-contrast token, not faint local overrides',async()=>{
  const css=await read('src/ui/tool-shell.css');
  const selectors=[
    '#task-installed-count','.sidebar-tool-preview-file','.sidebar-tool-import-hint',
    '.sidebar-tool-capabilities span','.catalog-reader-fact span',
    '.catalog-reader #task-catalog-detail summary','.catalog-intro .eyebrow',
    '.catalog-card small','.catalog-reader-note','.catalog-reader-desc',
    '.workflow-minor-note','.workflow-section-header span','.workflow-ai-step-preview li span',
    '.workflow-chat-entry strong','.workflow-provider summary','.workflow-chat-intro p'
  ];
  for(const selector of selectors){
    const start=css.indexOf(selector+'{');
    assert.ok(start>=0,'missing secondary text selector '+selector);
    const decl=css.slice(start+selector.length+1,css.indexOf('}',start));
    assert.match(decl,/color:var\(--od-sub\)/,'secondary text token '+selector);
  }
});
