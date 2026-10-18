import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {load} from 'cheerio';
import * as React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer,transformWithEsbuild} from 'vite';

const read=path=>readFile(path,'utf8');

test('R35.1 official HTML has required safe adoption points (SOURCE_ONLY)',async()=>{
  const html=await read('src/ui/tool.html'),$=load(html);
  const selectors=[
    '.workbench-nav','#workspace-content','#workbench-tools',
    '#sidebar-tools','#sidebar-tool-list-view','#extension-center',
    '#workspace-dock','#workbench-tasks','#workbench-workflow',
    '#workbench-develop','#workbench-cloud','#workbench-debug'
  ];
  for(const selector of selectors)
    assert.equal($(selector).length,1,selector);
  assert.equal($('#workbench-tools').parent().attr('id'),'workspace-content');
  assert.equal($('#sidebar-tools').parent().attr('id'),'workbench-tools');
  assert.equal($('#sidebar-tool-list-view').parent().attr('id'),'sidebar-tools');
  assert.equal($('#extension-center').parent().attr('id'),'sidebar-tool-list-view');
  assert.equal($('#workspace-dock').children('.dock-actions').length,3);
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
  assert.match(shell,/<ExtensionCenterPage \{\.\.\.extensionProps\}\/>/);
  assert.doesNotMatch(shell,/createRoot\(|createPortal\(|chrome\.|browser\.|client\.request\(/);
  for(const path of ['src/ui/react/app-shell.tsx','src/ui/react/tabs/navigation.tsx']){
    const parsed=await transformWithEsbuild(await read(path),path,{
      loader:'tsx',jsx:'transform',target:'es2022'
    });
    assert.ok(parsed.code.length>100);
  }
});

test('R35.1 SSR renders one app shell with accessible navigation (SOURCE_ONLY)',async t=>{
  const vite=await createServer({
    configFile:false,root:process.cwd(),appType:'custom',
    server:{middlewareMode:true},logLevel:'error'
  });
  t.after(()=>vite.close());
  const {SidebarAppShell}=await vite.ssrLoadModule('/src/ui/react/app-shell.tsx');
  const scaffold={beforeTools:[],afterTools:[],beforeList:[],afterList:[],
    listRemainder:[],dock:{}};
  const html=renderToStaticMarkup(React.createElement(SidebarAppShell,{
    scaffold,activeTab:'tools',debugEnabled:false,onNavigate:()=>true
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
  assert.equal($('#tab-debug').attr('hidden'),'');
  assert.equal($('#workspace-content').length,1);
  assert.equal($('#workbench-tools').length,1);
  assert.equal($('#workbench-tools').attr('hidden'),undefined);
  assert.equal($('#extension-center-list-view').length,1);
  assert.equal($('#extension-center-list').length,1);
  assert.equal($('#extension-center-import-host').length,1);
  assert.equal($('#extension-center-detail').length,1);
  assert.equal($('#extension-center-status').length,1);
  assert.equal($('#workspace-content #sidebar-tool-list-view #extension-center').length,1);
  assert.equal($('.opendesk-react-dock-host').length,1);
  const tasks=renderToStaticMarkup(React.createElement(SidebarAppShell,{
    scaffold,activeTab:'tasks',debugEnabled:true
  }));
  const $tasks=load(tasks);
  assert.equal($tasks('#workbench-tools').attr('hidden'),'');
  assert.equal($tasks('#tab-debug').attr('hidden'),undefined);
  assert.equal($tasks('#tab-my-tasks').attr('aria-selected'),'true');
});
