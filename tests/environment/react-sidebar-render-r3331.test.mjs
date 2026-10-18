import test from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';

// These are actual React 19 renders of the production TSX components.
// Client click/focus/installed-extension behavior requires separate Chromium
// evidence and is not inferred from static markup.
test('R33.3.1 renders extension toolbar, rows and detail as real React elements',async t=>{
  const vite=await createServer({configFile:false,root:process.cwd(),
    appType:'custom',server:{middlewareMode:true},logLevel:'error'});
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
  const {DeveloperTargetText,DeveloperActions,DeveloperFramework,DeveloperRunStatus,DeveloperResultText}=await vite.ssrLoadModule('/src/ui/react/tabs/develop.tsx');
  const devIndicator=renderToStaticMarkup(React.createElement(DeveloperTargetText,{
    value:'网页标题 <svg onload=alert(1)>',node:null,title:'bad',state:'available'
  }));
  assert.match(devIndicator,/&lt;svg onload=alert\(1\)&gt;/);
  assert.doesNotMatch(devIndicator,/<svg\b/i);
  const actions=renderToStaticMarkup(React.createElement(DeveloperActions,{model:{
    runLabel:'运行 <img onerror=evil()>',runDisabled:true,
    saveLabel:'保存版本',saveDisabled:false,saveHidden:false,saveTitle:'保存草稿',
    stopLabel:'停止',stopDisabled:true
  }}));
  assert.match(actions,/id="script-run"[^>]*disabled=""/);
  assert.match(actions,/id="script-save"/);
  assert.match(actions,/id="script-stop"[^>]*disabled=""/);
  assert.match(actions,/&lt;img onerror=evil\(\)&gt;/);
  assert.doesNotMatch(actions,/<img\b/i);
  const framework=renderToStaticMarkup(React.createElement(DeveloperFramework,{model:{
    mode:'react',compilerEnabled:true,onSelect:()=>{}
  }}));
  assert.match(framework,/id="page-component-javascript"/);
  assert.match(framework,/id="page-component-react"[^>]*checked=""/);
  assert.match(framework,/id="page-component-vue"/);
  assert.match(framework,/aria-label="React JSX"/);
  const safeResult=renderToStaticMarkup(React.createElement(DeveloperResultText,{
    value:'返回值 <script>alert(1)</script>'
  }));
  assert.match(safeResult,/&lt;script&gt;/);
  assert.doesNotMatch(safeResult,/<script\b/);
  const runStatus=renderToStaticMarkup(React.createElement(DeveloperRunStatus,{
    node:null,model:{state:'error',text:'运行错误 <script>evil()</script>'}
  }));
  assert.match(runStatus,/&lt;script&gt;/);
  assert.doesNotMatch(runStatus,/<script\b/i);
});
