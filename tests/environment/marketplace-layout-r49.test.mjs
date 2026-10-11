import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('R4.9 tool header groups storefront and import as accessible icon-only actions',async()=>{
  const [html,css]=await Promise.all([read('src/ui/tool.html'),read('src/ui/tool-shell.css')]);
  const view=html.match(/<div class="sidebar-tools-head od-toolbar">([\s\S]*?)<\/div>\s*<\/div>/)?.[0];
  assert.ok(view,'tool list header and actions group');
  assert.match(view,/<strong>已安装工具<\/strong>/);
  assert.match(view,/<div class="sidebar-tools-actions od-toolbar" role="group" aria-label="添加和管理工具">/);
  for(const [id,label] of [['sidebar-tool-market','打开应用市场'],['sidebar-tool-import-trigger','导入工具文件']]){
    const button=view.match(new RegExp('<button[^>]*id="'+id+'"[^>]*>[\\s\\S]*?<\\/button>'))?.[0];
    assert.ok(button,id+' button is present');
    assert.match(button,/class="od-icon-button"/);
    assert.ok(button.includes('aria-label="'+label+'"'));
    assert.match(button,/title="[^"]+"/);
    assert.match(button,/<svg[^>]*aria-hidden="true"/);
    assert.doesNotMatch(button,/>\s*(?:应用市场|导入|＋)/,'visible button text not allowed');
    assert.equal([...html.matchAll(new RegExp('id="'+id+'"','g'))].length,1);
  }
  assert.match(view,/id="sidebar-tool-import-trigger"[^>]*aria-expanded="false" aria-controls="sidebar-tool-import"/);
  assert.match(html,/id="installed-page-tools-refresh"[^>]*aria-label="刷新已安装网页工具"[^>]*><svg/);
  assert.match(css,/\.sidebar-tools-actions\{display:flex;align-items:center;justify-content:flex-end;/);
  assert.match(css,/\.sidebar-tools-actions \.od-icon-button\{width:var\(--od-icon-size\);height:var\(--od-icon-size\);/);
});

test('R4.9 market full-tab CSS owns scrolling, breakpoints and only a local scrollable table',async()=>{
  const [html,css,verify,page]=await Promise.all([
    read('src/marketplace/marketplace.html'),
    read('src/marketplace/marketplace.css'),
    read('scripts/verify-package.mjs'),
    read('src/marketplace/page.js')
  ]);
  assert.match(html,/href="design-tokens\.css"/);
  assert.match(html,/href="marketplace\.css"/);
  assert.doesNotMatch(html,/href="design-system\.css"/,'Side Panel overflow:hidden must not affect marketplace');
  assert.match(verify,/'ui\/marketplace.html': \['design-tokens\.css', 'marketplace\.css', 'marketplace\.js'\]/);
  assert.match(css,/\.market-shell\{[^}]*max-width:1280px;[^}]*min-height:100vh;/);
  assert.match(css,/#market-root\{[^}]*min-width:0;flex:1;/);
  assert.match(css,/\.market-grid\{[^}]*grid-template-columns:repeat\(auto-fill,minmax\(min\(100%,252px\),1fr\)\)/);
  assert.match(css,/@media\(max-width:900px\)/);
  assert.match(css,/@media\(max-width:520px\)/);
  assert.match(css,/@media\(prefers-color-scheme:dark\)/);
  assert.match(css,/\.market-table-scroll\{[^}]*overflow-x:auto;/);
  assert.doesNotMatch(css,/html\s*,\s*body\s*\{[^}]*overflow\s*:\s*hidden/);
  assert.match(page,/section\.append\(add\(elem\('div','market-table-scroll'\),table\)\)/);
  assert.match(page,/search\.className='market-search'/);
  assert.match(page,/control\.setAttribute\('aria-current','page'\)/);
  assert.match(page,/root\.focus\?\.\(\{preventScroll:true\}\);window\.scrollTo\?\.\(0,0\)/);
});
