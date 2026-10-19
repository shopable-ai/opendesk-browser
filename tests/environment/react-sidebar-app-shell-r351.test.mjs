import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {load} from 'cheerio';
import * as React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer,transformWithEsbuild} from 'vite';
import {createDeveloperView} from '../../src/ui/develop-view.js';
import {createMyWorkbenchView} from '../../src/ui/my-workbench-view.js';

const read=path=>readFile(path,'utf8');

test('R35.1 official HTML has required safe adoption points (SOURCE_ONLY)',async()=>{
  const html=await read('src/ui/tool.html'),$=load(html);
  const selectors=[
    '.workbench-nav','#workspace-content','#workbench-tools',
    '#sidebar-tools','#sidebar-tool-list-view','#extension-center',
    '#workspace-dock','#workbench-tasks','#workbench-workflow',
    '#workbench-debug'
  ];
  for(const selector of selectors)
    assert.equal($(selector).length,1,selector);
  assert.equal($('#workbench-tools').parent().attr('id'),'workspace-content');
  assert.equal($('#sidebar-tools').parent().attr('id'),'workbench-tools');
  assert.equal($('#sidebar-tool-list-view').parent().attr('id'),'sidebar-tools');
  assert.equal($('#extension-center').parent().attr('id'),'sidebar-tool-list-view');
  assert.equal($('#extension-center').children().length,0,'extension content is owned by React');
  assert.equal($('#sidebar-tool-display,#sidebar-tool-import,#sidebar-tool-settings-view').length,0,
    'abandoned extension templates must not create a second DOM owner');
  // The complete Cloud page is supplied by React, including authorization.
  assert.equal($('#workbench-cloud').length,0);
  assert.equal($('#cloud-approval-section').length,0);
  assert.equal($('#cloud-request-samples').length,0);
  assert.equal($('#cloud-first-run').length,0);
  assert.equal($('#cloud-hosting').length,0);
  assert.equal($('#workspace-dock').children('.dock-actions').length,2);
  const shell=await read('src/ui/react/app-shell.tsx');
  const [tool,task,root]=await Promise.all([
    read('src/ui/tool-shell.js'),read('src/ui/task-workbench.js'),
    read('src/ui/react/main.tsx')
  ]);
  assert.match(tool,/mountExtensionList\(document,\{debugEnabled,appShell:true,/);
  assert.match(tool,/ownsPages:true/);
  assert.match(task,/if\(reactNavigation\?\.ownsPages\)/);
  assert.match(root,/const root=createRoot\(shell\?\.mount\|\|section\)/);
  assert.equal((root.match(/\bcreateRoot\(/g)||[]).length,1);
  assert.match(root,/shell\?<SidebarAppShell/);
  assert.doesNotMatch(root,/createPortal\(\s*<ExtensionCenterPage/);
  assert.match(shell,/export function prepareSidebarAppShell\(doc\)/);
  assert.match(shell,/export function SidebarAppShell\(/);
  assert.match(shell,/mount\.id='opendesk-react-app'/);
  assert.doesNotMatch(shell,/cloudLegacySections/);
  assert.match(shell,/<CloudConnectionPage model=\{cloudModel\}/);
  assert.match(root,/cloudPageMounted:Boolean\(shell\),cloudOverviewMounted:Boolean\(shell\)/);
  assert.match(shell,/<ExtensionCenterPage \{\.\.\.extensionProps\}\/>/);
  assert.doesNotMatch(shell,/createRoot\(|createPortal\(|chrome\.|browser\.|client\.request\(/);
  for(const path of ['src/ui/react/app-shell.tsx','src/ui/react/tabs/navigation.tsx',
    'src/ui/react/tabs/cloud.tsx']){
    const parsed=await transformWithEsbuild(await read(path),path,{
      loader:'tsx',jsx:'transform',target:'es2022'
    });
    assert.ok(parsed.code.length>100);
  }
});

test('R35.1 SSR renders one app shell with accessible navigation (SOURCE_ONLY)',async t=>{
  const vite=await createServer({
    configFile:false,root:process.cwd(),appType:'custom',
    server:{middlewareMode:true},logLevel:'error',
    optimizeDeps:{noDiscovery:true,entries:[]}
  });
  t.after(()=>vite.close());
  const {SidebarAppShell}=await vite.ssrLoadModule('/src/ui/react/app-shell.tsx');
  const scaffold={beforeTools:[],afterTools:[],beforeList:[],afterList:[],
    listRemainder:[],dock:{}};
  const views={developerView:createDeveloperView(),myView:createMyWorkbenchView()};
  const html=renderToStaticMarkup(React.createElement(SidebarAppShell,{
    scaffold,...views,activeTab:'tools',debugEnabled:false,onNavigate:()=>true
  }));
  const $=load(html);
  assert.equal($('.workbench-nav[role=tablist]').length,1);
  assert.equal($('.workbench-nav button[role=tab]').length,6);
  for(const key of ['tasks','tools','workflow','develop','cloud']){
    assert.equal($('[data-workbench-tab="'+key+'"]').length,1);
    assert.equal($('[data-workbench-tab="'+key+'"]').attr('aria-controls'),'workbench-'+key);
  }
  assert.equal($('#tab-tools').attr('aria-selected'),'true');
  assert.equal($('#tab-tools').attr('tabindex'),'0');
  assert.equal($('#tab-debug').is('[hidden]'),true);
  assert.equal($('#workspace-content').length,1);
  assert.equal($('#workbench-tools').length,1);
  assert.equal($('#workbench-tools').attr('hidden'),undefined);
  assert.equal($('#extension-center-list-view').length,1);
  assert.equal($('#extension-center-list').length,1);
  assert.equal($('#extension-center-import-host').length,1);
  assert.equal($('#extension-center-detail').length,1);
  assert.equal($('#extension-center-status').length,1);
  assert.equal($('#workbench-cloud').length,1);
  for(const id of ['cloud-first-run','cloud-configure','cloud-next-step',
    'cloud-request-samples','cloud-request-prev','cloud-request-next',
    'cloud-request-detail','cloud-request-open-result'])assert.equal($('#'+id).length,1,id);
  for(const id of ['cloud-overview-state','cloud-overview-provider',
    'cloud-overview-connection','cloud-overview-host','cloud-overview-slot',
    'cloud-overview-tasks','cloud-overview-requests','cloud-my-state'])
    assert.equal($('#'+id).length,1,id);
  assert.equal($('#workspace-content #sidebar-tool-list-view #extension-center').length,1);
  assert.equal($('#workspace-dock > #task-dock').length,1);
  assert.equal($('#workspace-dock > #develop-dock').length,1);
  const tasks=renderToStaticMarkup(React.createElement(SidebarAppShell,{
    scaffold,...views,activeTab:'tasks',debugEnabled:true
  }));
  const $tasks=load(tasks);
  assert.equal($tasks('#workbench-tools').is('[hidden]'),true);
  assert.equal($tasks('#workbench-cloud').is('[hidden]'),true);
  assert.equal($tasks('#tab-debug').attr('hidden'),undefined);
  assert.equal($tasks('#tab-my-tasks').attr('aria-selected'),'true');
});

test('R35.1 Cloud status remains escaped and cannot grant authority (SOURCE_ONLY)',async t=>{
  const vite=await createServer({
    configFile:false,root:process.cwd(),appType:'custom',
    server:{middlewareMode:true},logLevel:'error',
    optimizeDeps:{noDiscovery:true,entries:[]}
  });
  t.after(()=>vite.close());
  const {CloudConnectionPage}=await vite.ssrLoadModule('/src/ui/react/tabs/cloud.tsx');
  const html=renderToStaticMarkup(React.createElement(CloudConnectionPage,{
    hidden:false,model:{
      summary:'异常 <script>alert(1)</script>',
      connection:'断开 <img src=x onerror=evil()>',
      tasks:'0'
    }
  }));
  assert.match(html,/&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html,/&lt;img src=x onerror=evil\(\)&gt;/);
  assert.doesNotMatch(html,/<script\b|<img\b/i);
  assert.match(html,/id="cloud-open-console"/);
  const requests=renderToStaticMarkup(React.createElement(CloudConnectionPage,{
    model:{summary:'正在连接'},
    requestsModel:{
      rows:[{key:'r0',index:0,title:'<img src=x onerror=evil()>',summary:'状态未知'}],
      canPrev:false,canNext:true,pageText:'第 1 条',
      detail:{key:'r0',title:'<script>evil()</script>',state:'UNKNOWN',
        canOpenRun:false}
    }
  }));
  const $requests=load(requests);
  assert.equal($requests('#cloud-request-samples li').length,1);
  assert.equal($requests('#cloud-request-samples img').length,0);
  assert.equal($requests('#cloud-request-detail script').length,0);
  assert.equal($requests('#cloud-request-detail-title').text(),'<script>evil()</script>');
  assert.equal($requests('#cloud-request-prev').is(':disabled'),true);
  const withSetup=renderToStaticMarkup(React.createElement(CloudConnectionPage,{
    setupModel:{visible:true,nextStep:'连接 <script>阻止注入</script>',onConfigure:()=>{}}
  }));
  const $setup=load(withSetup);
  assert.equal($setup('#cloud-first-run').is('[hidden]'),false);
  assert.equal($setup('#cloud-next-step').text(),'连接 <script>阻止注入</script>');
  assert.equal($setup('#cloud-next-step script').length,0);
  assert.equal($requests('#cloud-request-next').is(':disabled'),false);
  assert.match(html,/id="cloud-overview-refresh"/);
  assert.match(html,/id="cloud-request-samples"/);
  assert.doesNotMatch(await read('src/ui/react/tabs/cloud.tsx'),
    /(?:globalThis\.chrome|chrome\.runtime|client\.request|cloud\.approve|cloud\.pair|new Worker)/);
});
