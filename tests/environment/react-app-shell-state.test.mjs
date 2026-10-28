import test from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {loadSidebarReact} from '../helpers/sidebar-react-fixture.mjs';
import {parseHTML} from 'linkedom';
import {createDeveloperView} from '../../src/ui/develop-view.js';
import {createMyWorkbenchView} from '../../src/ui/my-workbench-view.js';

test('App Shell preserves a Page preview Stop across tabs and restores the idle dock',async t=>{
  const {SidebarAppShell}=await loadSidebarReact();
  const developerView=createDeveloperView(),myView=createMyWorkbenchView();
  myView.project('runDock',{taskHidden:true,developHidden:true,hidden:true,stopOnly:false});
  const render=()=>parseHTML(renderToStaticMarkup(React.createElement(SidebarAppShell,{
    activeTab:'cloud',developerView,myView
  }))).document;
  developerView.patch('script-stop',{disabled:false,hidden:false,textContent:'停止受管 UI'});
  let doc=render();
  assert.equal(doc.getElementById('workspace-dock').hidden,false);
  assert.equal(doc.getElementById('workspace-dock').dataset.stopOnly,'true');
  assert.equal(doc.getElementById('develop-dock').hidden,false);
  assert.equal(doc.getElementById('task-dock').hidden,true);
  assert.equal(doc.getElementById('script-stop').disabled,false);
  developerView.patch('script-stop',{disabled:true});
  doc=render();
  assert.equal(doc.getElementById('workspace-dock').hidden,true);
  developerView.patch('site-access-status',{data:{websites:false}});
  doc=render();
  assert.equal(doc.getElementById('site-access-recovery').hidden,false);
});

test('pending market requests and list errors do not insert content into any workbench tab',async()=>{
  const {SidebarAppShell,createSidebarToolsView}=await loadSidebarReact();
  const toolView=createSidebarToolsView(),developerView=createDeveloperView(),myView=createMyWorkbenchView();
  const render=activeTab=>parseHTML(renderToStaticMarkup(React.createElement(SidebarAppShell,{
    activeTab,developerView,myView,toolView
  }))).document;
  try{
    const pending=[{reviewId:'review-alpha',subject:{kind:'app',marketId:'opendesk/alpha',version:'1.0.0'}}];
    for(const state of [{pending,error:''},{pending:[],error:'LIST 失败 <script>不可执行</script>'}]){
      toolView.setMarketInstall(state);
      for(const activeTab of ['tasks','tools','workflow','develop','cloud']){
        const doc=render(activeTab);
        assert.equal(doc.querySelector('.workbench-nav').nextElementSibling.id,'workspace-content');
        assert.equal(doc.querySelector('[aria-label="待审阅的市场安装"]'),null);
        assert.doesNotMatch(doc.documentElement.textContent,/opendesk\/alpha|审阅安装|LIST 失败/);
      }
      assert.deepEqual(toolView.getSnapshot().market,{...state,review:null},'presentation must not discard pending transactions');
    }
  }finally{toolView.dispose();developerView.dispose?.();myView.dispose?.();}
});

test('market state updates leave the app workspace intact while the original review still dispatches confirmation',async()=>{
  const {SidebarAppShell,createSidebarToolsView}=await loadSidebarReact();
  const toolView=createSidebarToolsView(),developerView=createDeveloperView(),myView=createMyWorkbenchView();
  const {document,window}=parseHTML('<html><body><div id="mount"></div></body></html>');
  const originals=new Map(['window','document','IS_REACT_ACT_ENVIRONMENT'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  Object.assign(globalThis,{window,document,IS_REACT_ACT_ENVIRONMENT:true});
  const {createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('mount'));
  const calls=[];
  toolView.connectMarketInstall({act:id=>calls.push(id)});
  toolView.patch('sidebar-tool-display',{hidden:false});
  toolView.patch('sidebar-tool-title',{textContent:'Markdown 工作台'});
  try{
    await React.act(async()=>root.render(React.createElement(SidebarAppShell,{activeTab:'tools',developerView,myView,toolView})));
    const workspace=document.getElementById('sidebar-tool-display');
    for(const error of ['', '首次 LIST 失败']){
      await React.act(async()=>toolView.setMarketInstall({error,pending:[
        {reviewId:'review-alpha',subject:{kind:'app',marketId:'opendesk/alpha',version:'1.0.0'}}
      ]}));
      assert.equal(document.getElementById('sidebar-tool-display'),workspace);
      assert.equal(workspace.hidden,false);
      assert.equal(document.querySelector('[aria-label="待审阅的市场安装"]'),null);
      assert.doesNotMatch(document.body.textContent,/opendesk\/alpha|首次 LIST 失败/);
      assert.deepEqual(calls,[],'pending updates must not initiate installation');
    }
    await React.act(async()=>toolView.setMarketInstall({review:{title:'Markdown 工作台',phase:'review',busy:false,
      summary:['固定版本 1.0.0'],technical:[],actions:[{id:'install',label:'确认安装'}]}}));
    const dialog=document.querySelector('#sidebar-tool-import');
    assert.equal(dialog.getAttribute('role'),'dialog');
    assert.equal(document.querySelectorAll('#sidebar-tool-import').length,1);
    const confirm=[...dialog.querySelectorAll('button')].find(button=>button.textContent==='确认安装');
    assert.ok(confirm);
    await React.act(async()=>confirm.dispatchEvent(new window.Event('click',{bubbles:true})));
    assert.deepEqual(calls,['install']);
    await React.act(async()=>toolView.setMarketInstall({review:null}));
    assert.equal(document.getElementById('sidebar-tool-display'),workspace);
    assert.equal(workspace.hidden,false);
    assert.equal(document.querySelector('[aria-label="待审阅的市场安装"]'),null);
  }finally{
    await React.act(async()=>root.unmount());
    toolView.dispose();developerView.dispose?.();myView.dispose?.();
    for(const [key,descriptor] of originals){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
  }
});

test('language settings conceal the existing ToolHost and restore the same runtime and settings',async()=>{
  const {SidebarAppShell,createSidebarToolsView}=await loadSidebarReact();
  const toolView=createSidebarToolsView(),developerView=createDeveloperView(),myView=createMyWorkbenchView();
  const {document,window}=parseHTML('<html><body><div id="mount"></div></body></html>');
  const originals=new Map(['window','document','IS_REACT_ACT_ENVIRONMENT'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  Object.assign(globalThis,{window,document,IS_REACT_ACT_ENVIRONMENT:true});
  const {createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('mount'));
  toolView.patch('sidebar-tool-display',{hidden:false});
  toolView.patch('sidebar-tool-settings-view',{hidden:false});
  const render=localeManager=>React.act(async()=>root.render(React.createElement(SidebarAppShell,{
    activeTab:'tools',developerView,myView,toolView,extensionProps:{toolbarModel:{localeManager}}
  })));
  try{
    await render(null);
    const host=document.getElementById('sidebar-tool-display'),frame=document.getElementById('sidebar-tool-frame');
    const marker=document.createElement('iframe');frame.append(marker);
    await render({session:1,tools:[],onClose(){}});
    assert.equal(document.getElementById('sidebar-tool-list-view').hidden,false,'language page ancestor must be visible');
    assert.equal(host.hidden,true);
    assert.equal(document.getElementById('sidebar-tool-frame'),frame);assert.equal(frame.firstChild,marker);
    await render(null);
    assert.equal(host.hidden,false);assert.equal(frame.firstChild,marker);
    assert.equal(document.getElementById('sidebar-tool-settings-view').hidden,false);
    assert.equal(toolView.getSnapshot().fields['sidebar-tool-display'].hidden,false,'presentation must not rewrite runtime state');
  }finally{
    await React.act(async()=>root.unmount());toolView.dispose();
    for(const [key,descriptor] of originals){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
  }
});
