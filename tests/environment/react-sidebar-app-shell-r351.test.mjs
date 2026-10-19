import {renderSidebarFixture,loadSidebarReact} from '../helpers/sidebar-react-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {load} from 'cheerio';
import * as React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {transform} from 'esbuild';
import {createDeveloperView} from '../../src/ui/develop-view.js';
import {createMyWorkbenchView} from '../../src/ui/my-workbench-view.js';

const read=path=>readFile(path,'utf8');

test('R37 empty entry is populated entirely by the single React shell',async()=>{
  const entry=load(await read('src/ui/sidepanel.html'));
  assert.equal(entry('#opendesk-react-app').children().length,0);
  assert.equal(entry('[data-workbench-page],.workbench-nav,#workspace-dock').length,0);
  const $=load(await renderSidebarFixture());
  const ids=$('[id]').map((_,node)=>$(node).attr('id')).get();
  assert.equal(ids.length,new Set(ids).size,'rendered IDs must have one owner');
  for(const selector of ['.workbench-nav','#workspace-content','#workbench-tools',
    '#sidebar-tools','#sidebar-tool-list-view','#extension-center','#workspace-dock',
    '#workbench-tasks','#workbench-workflow','#workbench-debug','#task-dock','#develop-dock',
    '#workbench-cloud','#cloud-approval-section','#cloud-request-samples','#cloud-first-run','#cloud-hosting'])
    assert.equal($(selector).length,1,selector);
  for(const [child,parent]of [['workbench-tools','workspace-content'],['sidebar-tools','workbench-tools'],
    ['sidebar-tool-list-view','sidebar-tools'],['extension-center','sidebar-tool-list-view']])
    assert.equal($('#'+child).parent().attr('id'),parent);
  assert.ok($('#extension-center').children().length>0,'real ExtensionCenterPage renders content');
  for(const id of ['sidebar-tool-display','sidebar-tool-import','sidebar-tool-settings-view'])
    assert.equal($('#'+id).length,1,id+' belongs only to React');
  const [shell,tool,task,root]=await Promise.all(['src/ui/react/app-shell.tsx','src/ui/tool-shell.js',
    'src/ui/task-workbench.js','src/ui/react/main.tsx'].map(read));
  assert.match(tool,/mountSidebarApp\(document,\{debugEnabled,/);
  assert.match(tool,/extensionList\?\.renderNavigation\(view\)/);
  assert.match(task,/reactNavigation/);
  assert.match(root,/const root=createRoot\(mount\)/);
  assert.equal((root.match(/\bcreateRoot\(/g)||[]).length,1);
  assert.match(root,/<SidebarAppShell/);
  assert.doesNotMatch(root,/createPortal\(\s*<(?:ExtensionCenterPage|DebugDiagnosticText)/);
  assert.doesNotMatch(shell,/prepareSidebarAppShell|scaffold|cloudLegacySections/);
  assert.match(shell,/export function SidebarAppShell\(/);
  assert.match(shell,/<CloudConnectionPage model=\{cloudModel\}/);
  assert.match(root,/cloudPageMounted:true,cloudOverviewMounted:true/);
  assert.match(shell,/<ExtensionCenterPage \{\.\.\.extensionProps\}\/>/);
  assert.doesNotMatch(shell,/createRoot\(|createPortal\(|chrome\.|browser\.|client\.request\(/);
  for(const path of ['src/ui/react/app-shell.tsx','src/ui/react/tabs/navigation.tsx','src/ui/react/tabs/cloud.tsx']){
    const parsed=await transform(await read(path),{loader:'tsx',jsx:'transform',target:'es2022'});
    assert.ok(parsed.code.length>100);
  }
});

test('R35.1 SSR renders one app shell with accessible navigation (SOURCE_ONLY)',async t=>{
  const {SidebarAppShell}=await loadSidebarReact();
  const views={developerView:createDeveloperView(),myView:createMyWorkbenchView()};
  const html=renderToStaticMarkup(React.createElement(SidebarAppShell,{
    ...views,activeTab:'tools',debugEnabled:false,onNavigate:()=>true
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
    ...views,activeTab:'tasks',debugEnabled:true
  }));
  const $tasks=load(tasks);
  assert.equal($tasks('#workbench-tools').is('[hidden]'),true);
  assert.equal($tasks('#workbench-cloud').is('[hidden]'),true);
  assert.equal($tasks('#tab-debug').attr('hidden'),undefined);
  assert.equal($tasks('#tab-my-tasks').attr('aria-selected'),'true');
});

test('R35.1 Cloud status remains escaped and cannot grant authority (SOURCE_ONLY)',async t=>{
  const {CloudConnectionPage}=await loadSidebarReact();
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
