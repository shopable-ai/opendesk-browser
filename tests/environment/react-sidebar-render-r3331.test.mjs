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
  const {ExtensionToolbar,ExtensionRows,ExtensionDetail}=
    await vite.ssrLoadModule('/src/ui/react/tabs/tools.tsx');
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
  assert.match(detail,/&lt;script&gt;/);
  assert.doesNotMatch(detail,/<script\b/i);
});
