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

test('market LIST failure remains visible with no pending entries and clears after refresh',async()=>{
  const {SidebarAppShell,createSidebarToolsView}=await loadSidebarReact();
  const toolView=createSidebarToolsView(),developerView=createDeveloperView(),myView=createMyWorkbenchView();
  const render=()=>parseHTML(renderToStaticMarkup(React.createElement(SidebarAppShell,{
    developerView,myView,toolView
  }))).document;
  try{
    toolView.setMarketInstall({pending:[],error:'LIST 失败 <script>不可执行</script>'});
    const section=render().querySelector('[aria-label="待审阅的市场安装"]');
    assert.ok(section);assert.match(section.querySelector('[role="status"]').textContent,/无法读取/);
    assert.equal(section.querySelector('[role="alert"]').textContent,'LIST 失败 <script>不可执行</script>');
    assert.equal(section.querySelector('script'),null);
    assert.deepEqual([...section.querySelectorAll('button')].map(node=>node.textContent),['重试']);
    toolView.setMarketInstall({pending:[],error:''});
    assert.equal(render().querySelector('[aria-label="待审阅的市场安装"]'),null);
  }finally{toolView.dispose();developerView.dispose?.();myView.dispose?.();}
});

test('market retry calls refresh and same-version pending buttons open their distinct review IDs',async()=>{
  const {SidebarAppShell,createSidebarToolsView}=await loadSidebarReact();
  const toolView=createSidebarToolsView(),developerView=createDeveloperView(),myView=createMyWorkbenchView();
  const {document,window}=parseHTML('<html><body><div id="mount"></div></body></html>');
  const originals=new Map(['window','document','IS_REACT_ACT_ENVIRONMENT'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  Object.assign(globalThis,{window,document,IS_REACT_ACT_ENVIRONMENT:true});
  const {createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('mount'));
  const calls=[];
  toolView.connectMarketInstall({refresh:()=>calls.push('refresh'),open:id=>calls.push(id)});
  const section=()=>document.querySelector('[aria-label="待审阅的市场安装"]');
  try{
    toolView.setMarketInstall({pending:[],error:'首次 LIST 失败'});
    await React.act(async()=>root.render(React.createElement(SidebarAppShell,{developerView,myView,toolView})));
    await React.act(async()=>section().querySelector('button').dispatchEvent(new window.Event('click',{bubbles:true})));
    assert.deepEqual(calls,['refresh']);
    await React.act(async()=>toolView.setMarketInstall({error:'',pending:[
      {reviewId:'review-alpha',subject:{kind:'app',marketId:'opendesk/alpha',version:'1.0.0'}},
      {reviewId:'review-beta',title:'应用 B',subject:{kind:'app',marketId:'opendesk/beta',version:'1.0.0'}}
    ]}));
    const buttons=[...section().querySelectorAll('button')];
    assert.deepEqual(buttons.map(node=>node.textContent),[
      'opendesk/alpha · v1.0.0 · 审阅安装','应用 B · opendesk/beta · v1.0.0 · 审阅安装'
    ]);
    assert.equal(section().querySelector('[role="alert"]'),null);
    for(const button of buttons)await React.act(async()=>button.dispatchEvent(new window.Event('click',{bubbles:true})));
    assert.deepEqual(calls,['refresh','review-alpha','review-beta']);
  }finally{
    await React.act(async()=>root.unmount());
    toolView.dispose();developerView.dispose?.();myView.dispose?.();
    for(const [key,descriptor] of originals){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
  }
});
