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
test('inline updates preserve committed row order during list and portal menu interaction until search context changes',async()=>{
  const {SidebarAppShell}=await loadSidebarReact();
  const developerView=createDeveloperView(),myView=createMyWorkbenchView();
  const {document,window}=parseHTML('<html><body><div id="mount"></div></body></html>');
  const originals=new Map(['window','document','chrome','IS_REACT_ACT_ENVIRONMENT'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  const listeners=new Set(),hash='a'.repeat(64);
  const row=id=>({key:'app:'+id,id,kind:'app',title:id,installed:true,update:true,
    updateIdentity:{id,fromVersion:'1.0.0',version:'1.1.0',source:'opendesk/'+id,sha256:hash}});
  const candidate=id=>({kind:'sidebar-tool',id,title:id,status:'available',requiresReview:true,
    fromVersion:'1.0.0',version:'1.1.0',source:'opendesk/'+id,sha256:hash,
    newCapabilities:[],ignoredAt:null});
  const rows=[row('notes'),row('cookie')];
  let snapshot={verified:true,records:[candidate('cookie')],openRequestedAt:0};
  const requests=[];
  Object.assign(globalThis,{window,document,IS_REACT_ACT_ENVIRONMENT:true,chrome:{
    runtime:{sendMessage:async message=>{requests.push(message);return {ok:true,data:snapshot};}},
    storage:{onChanged:{addListener:listener=>listeners.add(listener),removeListener:listener=>listeners.delete(listener)}}
  }});
  // linkedom has no browser focus/layout: expose only the actual focused node.
  Object.defineProperty(document,'activeElement',{configurable:true,writable:true,value:document.body});
  const {createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('mount'));
  let controls={scope:'smart',kind:'all',query:''},list={rows,busy:false,pendingKey:null};
  let menu=null,menuKey=null,closeCount=0,closing;
  function ListShellFixture(props){
    // The shared helper stubs CSS imports as {}, which hidden tabs' Chat frames
    // render as invalid <style> children. Mount the real shell hooks and its
    // tools workspace only; no unrelated Chat/ToolHost is needed for this case.
    const shell=SidebarAppShell(props);
    const main=React.Children.toArray(shell.props.children).find(child=>child.type==='main');
    return React.cloneElement(main,{},React.Children.toArray(main.props.children)
      .filter(page=>page.props?.id==='workbench-tools'));
  }
  const render=()=>React.act(async()=>root.render(React.createElement(ListShellFixture,{
    activeTab:'tools',developerView,myView,
    extensionProps:{toolbarModel:controls,rowsModel:list,rowMenuModel:menu,menuKey}
  })));
  const publish=async records=>{
    snapshot={...snapshot,records};
    await React.act(async()=>{
      for(const listener of listeners)listener({'opendesk.update-notice.state.v1':{newValue:snapshot}},'local');
    });
  };
  const orders=[];
  const observe=stage=>orders.push({stage,keys:[...document.querySelectorAll('#extension-center-list > li')].map(node=>node.dataset.extensionId)});
  const update=id=>document.querySelector(`[data-extension-key="app:${id}"][data-extension-action="update"]`);
  try{
    await render();observe('initial promotion');
    assert.ok(update('cookie'),'verified identity match exposes the cookie update');
    assert.equal(update('notes'),null);
    const more=document.querySelector('[data-extension-key="app:cookie"][data-extension-action="more"]');
    document.activeElement=more;
    await render();observe('focus enters list');

    more.getBoundingClientRect=()=>({top:20,bottom:40,right:200,left:180});
    menuKey='app:cookie';
    menu={trigger:more,title:'cookie',items:[{id:'details',label:'详情'}],onClose:returnFocus=>{
      closeCount++;
      closing=(async()=>{
        assert.equal(returnFocus,true,'Escape requests focus restoration');
        // Model the Controller's separately committed adapter writes. Restore
        // focus before unmounting the portal, so no commit sees an idle body.
        document.activeElement=more;
        assert.ok(document.getElementById('extension-center-row-menu'),'focus returns before portal removal');
        await render();observe('focus returned before menu unmount');
        menu=null;
        await render();observe('portal removed with menu key retained');
        assert.equal(document.getElementById('extension-center-row-menu'),null);
        assert.equal(document.activeElement,more);
        await publish([{...candidate('notes'),status:'review_required',newCapabilities:['browser.tabs']}]);
        observe('eligibility changes during menu close');
        assert.equal(update('notes')?.textContent,'审阅','closing still projects the latest eligibility');
        assert.equal(update('cookie'),null);
        menuKey=null;
        await render();observe('menu key cleared after focus return');
        assert.equal(more.getAttribute('aria-expanded'),'false');
        assert.equal(document.activeElement,more,'clearing menu state keeps focus on the live trigger');
      })();
    }};
    await render();
    const portal=document.getElementById('extension-center-row-menu');
    assert.equal(portal.parentNode,document.body,'the real menu is portaled outside the list');
    document.activeElement=portal.querySelector('[role="menuitem"]');
    // Both rows now have candidates, so a fresh promoted sort would revert to base order.
    await publish([candidate('notes'),candidate('cookie')]);observe('new candidate while menu focused');
    assert.ok(update('notes'),'freezing keys must still project the latest update snapshot');
    assert.equal(document.getElementById('extension-center-row-menu'),portal);
    assert.equal(document.activeElement,portal.querySelector('[role="menuitem"]'));
    assert.equal(closeCount,0,'background refresh must not dismiss the open menu');

    // Losing eligibility removes the action even while its row position is frozen.
    await publish([candidate('notes'),{...candidate('cookie'),sha256:'b'.repeat(64)}]);
    observe('invalidated cookie candidate');
    assert.equal(update('cookie'),null,'a frozen row must not retain an invalid update');
    assert.ok(update('notes'));

    const escape=new window.Event('keydown',{bubbles:true,cancelable:true});
    Object.assign(escape,{key:'Escape'});
    await React.act(async()=>document.dispatchEvent(escape));
    assert.ok(closing,'the real portal Escape handler initiates close and focus return');
    await closing;
    assert.equal(closeCount,1);
    await render();observe('list focus after menu close');

    document.activeElement=document.getElementById('extension-center-search');
    menu=null;
    list={...list,pendingKey:'app:cookie'};
    await render();observe('pending menu action');
    list={...list,pendingKey:null,busy:true};
    await render();observe('busy menu action');
    list={...list,busy:false};
    await render();observe('search focus releases order');

    await publish([candidate('cookie')]);observe('search focus permits new promotion');
    controls={...controls,query:'cookie'};list={...list,rows:[rows[1]]};
    await render();observe('search results replace frozen keys');
    assert.ok(update('cookie'));
    document.activeElement=document.querySelector('[data-extension-action="more"]');
    controls={...controls,query:'',scope:'installed',kind:'app'};list={...list,rows};
    await render();observe('filter change preserves controller order');
    assert.ok(update('cookie'),'filtering does not discard a valid update projection');

    assert.ok(requests.length>0);
    assert.ok(requests.every(message=>message.protocol==='opendesk.update-notice.v1'&&message.kind==='list'),
      'background refresh only reads update snapshots; it never initiates an installation');
    assert.deepEqual(rows.map(row=>row.key),['app:notes','app:cookie'],'Registry input is never reordered');
    assert.deepEqual(orders,[
      ...['initial promotion','focus enters list','new candidate while menu focused',
        'invalidated cookie candidate','focus returned before menu unmount',
        'portal removed with menu key retained','eligibility changes during menu close',
        'menu key cleared after focus return','list focus after menu close',
        'pending menu action','busy menu action']
        .map(stage=>({stage,keys:['app:cookie','app:notes']})),
      {stage:'search focus releases order',keys:['app:notes','app:cookie']},
      {stage:'search focus permits new promotion',keys:['app:cookie','app:notes']},
      {stage:'search results replace frozen keys',keys:['app:cookie']},
      {stage:'filter change preserves controller order',keys:['app:notes','app:cookie']}
    ]);
  }finally{
    await React.act(async()=>root.unmount());
    developerView.dispose?.();myView.dispose?.();
    for(const [key,descriptor] of originals){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
  }
});
