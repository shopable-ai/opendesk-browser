import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(path,'utf8');
const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255);
const luminance=hex=>rgb(hex).map(x=>x<=0.04045?x/12.92:((x+0.055)/1.055)**2.4)
  .reduce((sum,x,i)=>sum+x*[0.2126,0.7152,0.0722][i],0);
const contrast=(a,b)=>{const [hi,lo]=[luminance(a),luminance(b)].sort((x,y)=>y-x);return (hi+0.05)/(lo+0.05)};

test('R21 dynamic installed-tool actions use one icon primitive with names and titles',async()=>{
  const [host,html,design,view]=await Promise.all([
    read('src/ui/sidebar-tools.js'),read('src/ui/tool.html'),
    read('src/ui/design-system.css'),read('src/ui/tool-shell.css')
  ]);
  for(const cls of ['sidebar-tool-list-remove','sidebar-tool-site','sidebar-tool-list-tab'])
    assert.ok(host.includes("className='"+cls+" od-icon-button'"),'dynamic icon uses shared primitive: '+cls);
  assert.match(host,/setAttribute\('aria-label',toggle\.title\)/);
  assert.match(host,/setAttribute\('aria-label',inTab\.title\)/);
  assert.match(host,/uninstall\.title='卸载/);
  assert.match(html,/id="sidebar-tool-back" class="sidebar-tool-icon-action od-icon-button"/);
  assert.match(design,/--od-icon-size:34px/);
  assert.match(design,/\.od-icon-button\{[^}]*width:var\(--od-icon-size\);height:var\(--od-icon-size\);/);
  assert.match(view,/\.sidebar-tool-list-remove\{/);
  assert.match(view,/\.sidebar-tool-site:focus-visible::after/);
  assert.match(view,/\.sidebar-tool-list-tab:focus-visible::after/);
  assert.match(view,/max-width:min\(160px,calc\(100vw - 24px\)\)/);
  assert.doesNotMatch(view,/\.sidebar-tool-site\{[^}]*width:30px/);
  assert.doesNotMatch(view,/\.sidebar-tool-list-tab\{[^}]*width:30px/);
});

test('R21 shared palette normal-text colors retain AA contrast against white',async()=>{
  const design=await read('src/ui/design-system.css');
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

test('R21 current product spec has five tabs with historical R5 retained',async()=>{
  const spec=await read('docs/product/sidebar-ui-spec.zh-CN.md');
  assert.ok(spec.startsWith('# OpenDesk Browser Sidebar UI SPEC · R21（现行五页签）'));
  for(const name of ['我的','发现','工作流','开发','工具'])
    assert.match(spec,new RegExp('\\| '+name+' \\|'));
  assert.match(spec,/历史存档：OpenDesk Browser Sidebar UI SPEC · R5/);
  assert.match(spec,/STATIC_MARKUP_CHROME/);
});
