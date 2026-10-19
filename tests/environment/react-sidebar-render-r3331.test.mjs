import test from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';
import {load} from 'cheerio';
import {createDeveloperView} from '../../src/ui/develop-view.js';

// These are actual React 19 renders of the production TSX components.
// Client click/focus/installed-extension behavior requires separate Chromium
// evidence and is not inferred from static markup.
test('R33.3.1 renders extension toolbar, rows and detail as real React elements',async t=>{
  const vite=await createServer({configFile:false,root:process.cwd(),
    appType:'custom',server:{middlewareMode:true,ws:false},logLevel:'error'});
  t.after(()=>vite.close());
  const {ExtensionToolbar,ExtensionRows,ExtensionDetail,ExtensionEmpty,
    ExtensionRecoveries,ExtensionStatus,ExtensionRowMenu,ExtensionCenterPage}=
    await vite.ssrLoadModule('/src/ui/react/tabs/tools.tsx');
  // R35: the Extension Center is rendered once as one React-owned page,
  // not split into toolbar/list/detail portals attached to static HTML.
  const full=renderToStaticMarkup(React.createElement(ExtensionCenterPage,{
    toolbarModel:{query:'x <script>bad()</script>',kind:'all',scope:'smart'},
    rowsModel:{rows:[],busy:true,pendingKey:null,onOpenRow:()=>{},onMore:()=>{}},
    recoveryModel:{ids:[],busy:false},feedbackModel:{showEmpty:true,
      emptyText:'没有匹配的扩展',countText:'0 个扩展'},
    statusModel:{text:'读取失败',state:'error'},view:'detail'
  }));
  for(const id of ['extension-center-list-view','extension-center-list',
    'extension-center-detail','extension-center-back','extension-center-status',
    'extension-center-import-host','extension-center-search']){
    assert.equal([...full.matchAll(new RegExp('id="'+id+'"','g'))].length,1,id);
  }
  assert.match(full,/<div id="extension-center-list-view" hidden=""/);
  assert.match(full,/id="extension-center-list"[^>]*aria-busy="true"/);
  assert.match(full,/id="extension-center-status"[^>]*data-state="error"/);
  assert.match(full,/&lt;script&gt;bad\(\)&lt;\/script&gt;/);
  assert.doesNotMatch(full,/<script\b/);
  const toolbar=renderToStaticMarkup(React.createElement(ExtensionToolbar,{model:{
    query:'文件 <img src=x onerror=alert(1)>',kind:'page',scope:'available',
    language:'en',menuOpen:true
  }}));
  assert.match(toolbar,/id="extension-center-search"/);
  assert.match(toolbar,/id="extension-center-menu"/);
  assert.match(toolbar,/data-ec-kind="page"[^>]*aria-pressed="true"/);
  assert.match(toolbar,/data-ec-scope="available"[^>]*aria-pressed="true"/);
  assert.match(toolbar,/aria-expanded="true"/);
  assert.match(toolbar,/&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(toolbar,/<img\b/i);

  const row={key:'app:sample',title:'名称 <script>evil()</script>',
    description:'不能执行 <svg onload=evil()>',kind:'app',type:'应用',
    installed:true,primaryAction:'打开'};
  const list=renderToStaticMarkup(React.createElement(ExtensionRows,{
    rows:[row],busy:false,pendingKey:null,menuKey:row.key,
    onOpenRow:()=>{},onMore:()=>{}
  }));
  assert.match(list,/data-extension-id="app:sample"/);
  assert.match(list,/aria-expanded="true"/);
  assert.match(list,/&lt;script&gt;/);
  assert.doesNotMatch(list,/<script\b/i);
  assert.match(list,/data-extension-action="primary"/);

  const detail=renderToStaticMarkup(React.createElement(ExtensionDetail,{
    container:null,model:{key:row.key,title:row.title,description:row.description,
      kind:'app',type:'应用',installed:true,busy:false,version:'1.0.0',
      installationText:'本机已安装',actions:[{label:'设置与权限',id:'settings',onClick:()=>{}}],
      source:{label:'本地安装',sha256:'a'.repeat(64)}
    }
  }));
  assert.match(detail,/data-ec-detail-action="settings"/);
  assert.match(detail,/固定包 SHA-256/);
  const readerDetail=renderToStaticMarkup(React.createElement(ExtensionDetail,{
    container:null,model:{kind:'app',type:'应用',installed:true,busy:false,
      version:'1.0.7',title:'阅读目录',description:'章节导航',
      installationText:'本机已安装',actions:[],usageText:'安装后自动显示目录'}
  }));
  assert.match(readerDetail,/安装后自动显示目录/,'React detail explains page auto-activation');
  assert.match(detail,/&lt;script&gt;/);
  assert.doesNotMatch(detail,/<script\b/i);

  const empty=renderToStaticMarkup(React.createElement(ExtensionEmpty,{
    container:null,model:{showEmpty:true,emptyText:'筛选 <img src=x onerror=evil()>'}
  }));
  assert.match(empty,/id="extension-center-empty-text"/);
  assert.match(empty,/&lt;img src=x onerror=evil\(\)&gt;/);
  assert.doesNotMatch(empty,/<img\b/i);
  const cleanups=renderToStaticMarkup(React.createElement(ExtensionRecoveries,{
    container:null,model:{ids:['tool<script>x</script>'],busy:false,onRetry:()=>{}}
  }));
  assert.match(cleanups,/恢复清理/);
  assert.match(cleanups,/&lt;script&gt;/);
  assert.doesNotMatch(cleanups,/<script\b/i);
  const status=renderToStaticMarkup(React.createElement(ExtensionStatus,{
    container:null,model:{text:'异常 <img onerror=evil()>',state:'error'}
  }));
  assert.match(status,/&lt;img onerror=evil\(\)&gt;/);
  const rowMenu=renderToStaticMarkup(React.createElement(ExtensionRowMenu,{items:[
    {id:'toggle',label:'停用 <script>evil()</script>',onClick:()=>{}}
  ]}));
  assert.match(rowMenu,/data-ec-context-action="toggle"/);
  assert.match(rowMenu,/role="menuitem"/);
  assert.match(rowMenu,/&lt;script&gt;/);
  assert.doesNotMatch(rowMenu,/<script\b/i);
});

test('R35.1 React owns accessible five-tab navigation markup',async t=>{
  const vite=await createServer({configFile:false,root:process.cwd(),
    appType:'custom',server:{middlewareMode:true,ws:false},logLevel:'error'});
  t.after(()=>vite.close());
  const {SidebarNavigation}=await vite.ssrLoadModule('/src/ui/react/tabs/navigation.tsx');
  const html=renderToStaticMarkup(React.createElement(SidebarNavigation,{
    activeTab:'develop',debugEnabled:false,onNavigate:()=>true
  }));
  for(const id of ['tab-my-tasks','tab-tools','tab-workflow','tab-develop','tab-cloud'])
    assert.equal([...html.matchAll(new RegExp('id="'+id+'"','g'))].length,1,id);
  assert.match(html,/id="tab-develop"[^>]*aria-selected="true"[^>]*tabindex="0"/);
  assert.match(html,/id="tab-tools"[^>]*aria-selected="false"[^>]*tabindex="-1"/);
  assert.match(html,/id="tab-debug"[^>]*hidden=""/);
  assert.equal((html.match(/role="tab"/g)||[]).length,6);
  assert.doesNotMatch(html,/onClick=|dangerouslySetInnerHTML/);
});


test('developer page and dock render the same view with safe text and controlled fields',async t=>{
  const vite=await createServer({configFile:false,root:process.cwd(),
    appType:'custom',server:{middlewareMode:true,ws:false},logLevel:'error'});
  t.after(()=>vite.close());
  const {DeveloperPage,DeveloperDock}=await vite.ssrLoadModule('/src/ui/react/tabs/develop.tsx');
  const view=createDeveloperView();
  t.after(()=>view.dispose());
  let runs=0;
  view.actions['script-run']=()=>runs++;
  view.patch('script-source',{value:'async function main() { return "<script>source</script>"; }'});
  view.patch('script-params',{value:'{"draft":true}'});
  view.patch('script-current-page-host',{textContent:'example.com',title:'https://example.com/view'});
  view.patch('script-current-page-title',{textContent:'网页标题 <svg onload=alert(1)>'});
  view.patch('script-current-page-status',{textContent:'网页可运行',data:{state:'available'}});
  view.patch('script-run',{textContent:'运行 <img onerror=evil()>',disabled:true});
  view.patch('script-save',{disabled:false,title:'保存草稿'});
  view.patch('script-stop',{disabled:true});
  view.patch('page-component-javascript',{checked:false});
  view.patch('page-component-react',{checked:true});
  view.patch('script-result',{textContent:'返回值 <script>alert(1)</script>'});
  view.patch('script-result-kind',{textContent:'JSON'});
  view.patch('script-status',{textContent:'运行错误 <script>evil()</script>',data:{state:'error'}});
  const render=(hidden=false)=>load(renderToStaticMarkup(React.createElement(React.Fragment,null,
    React.createElement(DeveloperPage,{view,hidden}),React.createElement(DeveloperDock,{view,hidden}))));
  let $=render();
  const ids=$('[id]').map((_,node)=>$(node).attr('id')).get();
  assert.equal(new Set(ids).size,ids.length,'one owner for each developer control');
  assert.equal($('#script-current-page-host').text(),'example.com');
  assert.equal($('#script-current-page-host').attr('title'),'https://example.com/view');
  assert.equal($('#script-current-page-title').text(),'网页标题 <svg onload=alert(1)>');
  assert.equal($('#script-current-page-title svg').length,0);
  assert.equal($('#script-current-page-status').attr('data-state'),'available');
  assert.equal($('#script-run').prop('disabled'),true);
  assert.equal($('#script-run').text(),'运行 <img onerror=evil()>');
  assert.equal($('#script-run img').length,0);
  assert.equal($('#script-save').prop('disabled'),false);
  assert.equal($('#script-save').attr('title'),'保存草稿');
  assert.equal($('#script-stop').prop('disabled'),true);
  assert.equal($('#page-component-framework input').length,3);
  assert.equal($('#page-component-react').prop('checked'),true);
  assert.equal($('#page-component-react').attr('aria-label'),'React JSX');
  assert.equal($('#script-result').text(),'返回值 <script>alert(1)</script>');
  assert.equal($('#script-result-kind').text(),'JSON');
  assert.equal($('#script-status').attr('data-state'),'error');
  assert.equal($('#script-status').text(),'运行错误 <script>evil()</script>');
  assert.equal($('script').length,0);
  view.patch('script-result',{textContent:'新结果'});
  $=render(true);
  assert.equal($('#workbench-develop').prop('hidden'),true);
  assert.equal($('#develop-dock').prop('hidden'),true);
  assert.equal($('#script-result').text(),'新结果');
  assert.equal($('#script-source').val(),view.fields['script-source'].value);
  assert.equal($('#script-params').val(),'{"draft":true}');
  assert.equal(runs,0,'rendering and view patches never run the draft');
});
