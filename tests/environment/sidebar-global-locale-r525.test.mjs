import test from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import {parseHTML} from 'linkedom';
import {translateUiText} from '../../src/i18n/strings.js';
import {verifyLocaleCatalogs} from '../../src/i18n/index.js';
import {loadSidebarReact} from '../helpers/sidebar-react-fixture.mjs';

const tabs=[
  ['tab-my-tasks','tasks','sidebar.tab.tasks'],
  ['tab-tools','tools','sidebar.tab.tools'],
  ['tab-workflow','workflow','sidebar.tab.workflow'],
  ['tab-develop','develop','sidebar.tab.develop'],
  ['tab-app-debug','app-debug','sidebar.tab.appDebug'],
  ['tab-cloud','cloud','sidebar.tab.cloud'],
  ['tab-debug','debug','sidebar.tab.debug']
];

test('R5.25 four language catalogs contain all trusted navigation strings',()=>{
  assert.equal(verifyLocaleCatalogs().valid,true);
  for(const locale of ['zh-CN','zh-TW','en','ja']){
    for(const key of ['sidebar.navigation','sidebar.navigationHint',...tabs.map(row=>row[2])]){
      const text=translateUiText(key,{},locale);
      assert.ok(text&&text!=='Translation unavailable',locale+': '+key);
    }
  }
});

test('R5.25 changing OpenDesk default language updates the real React tablist without remounting or navigating',async()=>{
  const {SidebarAppShell,createDeveloperView,createMyWorkbenchView}=await loadSidebarReact();
  const {document,window}=parseHTML('<html lang="zh-CN"><body><div id="mount"></div></body></html>');
  const keys=['window','document','IS_REACT_ACT_ENVIRONMENT'];
  const originals=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  Object.assign(globalThis,{window,document,IS_REACT_ACT_ENVIRONMENT:true});
  const {createRoot}=await import('react-dom/client');
  const root=createRoot(document.getElementById('mount'));
  const developerView=createDeveloperView(),myView=createMyWorkbenchView();
  const subscribers=new Set();
  let language='zh-CN';
  const localeController={
    getLocale:()=>language,
    subscribe(fn){subscribers.add(fn);return ()=>subscribers.delete(fn);}
  };
  try{
    await React.act(async()=>root.render(React.createElement(SidebarAppShell,{
      activeTab:'workflow',debugEnabled:true,appDebugEnabled:true,
      localeController,developerView,myView
    })));
    const originalTabs=new Map(tabs.map(([id])=>[id,document.getElementById(id)]));
    for(const locale of ['zh-CN','en','ja','zh-TW','zh-CN']){
      await React.act(async()=>{language=locale;for(const notify of subscribers)notify(locale);});
      const nav=document.querySelector('nav.workbench-nav');
      assert.equal(nav.getAttribute('aria-label'),translateUiText('sidebar.navigation',{},locale));
      assert.equal(nav.getAttribute('aria-description'),translateUiText('sidebar.navigationHint',{},locale));
      assert.equal(document.documentElement.lang,locale);
      for(const [id,key,messageKey] of tabs){
        const node=document.getElementById(id);
        assert.equal(node,originalTabs.get(id),'React must preserve existing tab DOM');
        assert.equal(node.dataset.workbenchTab,key,'route keys must remain unchanged');
        assert.equal(node.textContent,translateUiText(messageKey,{},locale));
        assert.equal(node.getAttribute('aria-selected'),String(key==='workflow'));
      }
      assert.equal(document.getElementById('workspace-content').isConnected,true);
    }
    assert.equal(subscribers.size,1,'only one React subscription to the trusted locale owner');
  }finally{
    await React.act(async()=>root.unmount());
    assert.equal(subscribers.size,0,'unmount removes locale subscription');
    developerView.dispose?.();myView.dispose?.();
    for(const [key,descriptor] of originals){
      if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];
    }
  }
});
