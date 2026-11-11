import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {parseHTML} from 'linkedom';
import {SIDEBAR_TOOL_STORE,sidebarToolStorageKey} from '../../../src/ui/sidebar-tools/package.js';
import {SIDEBAR_TOOL_ENABLE_STORE} from '../../../src/ui/sidebar-tools/lifecycle.js';
import {initWebFlowPagePanel,WEBFLOW_PAGE_PANEL_KEY,webFlowPagePanelAllowed}
  from '../trusted/page-panel-ui.js';

const DATA=sidebarToolStorageKey('webflow');
const packageRow={id:'webflow',format:'opendesk.sidebar-tool.v2',capabilities:['storage.local']};
const source=readFileSync(fileURLToPath(new URL('../src/ui/main.js',import.meta.url)),'utf8');
const pause=()=>new Promise(resolve=>setTimeout(resolve,0));

function fixture(extra={}){
  const data={ [SIDEBAR_TOOL_STORE]:[packageRow],...extra};
  const subscribers=new Set();
  const onChanged={addListener:listener=>subscribers.add(listener),
    removeListener:listener=>subscribers.delete(listener)};
  const local={
    async get(keys){return Object.fromEntries(keys.map(key=>[key,data[key]]));},
    async set(changes){
      const delta={};
      for(const [key,value] of Object.entries(changes)){
        delta[key]={oldValue:data[key],newValue:value};data[key]=value;
      }
      for(const listener of subscribers)listener(delta,'local');
    }
  };
  const {document}=parseHTML('<html><head></head><body></body></html>');
  const win={location:{origin:'https://chatgpt.com'}};
  win.top=win;
  const navigationListeners=new Map();
  win.navigation={
    addEventListener:(name,cb)=>navigationListeners.set(name,cb),
    removeEventListener:(name,cb)=>{if(navigationListeners.get(name)===cb)navigationListeners.delete(name);},
    dispatch:name=>navigationListeners.get(name)?.()
  };
  const api={storage:{local,onChanged}};
  return {api,document,win,local,subscribers,selector:()=>document.getElementById('opendesk-webflow-page-assist')};
}

test('settings entry uses R1.5 Host gear with safe header fallback and independent CAS storage',()=>{
  assert.ok(source.includes("tool.navigationFeatures?.settingsPage===true"));
  assert.ok(source.includes("settingsPage:'settings'"));
  assert.ok(source.includes("info?.action==='settings'&&info.page==='settings'"));
  assert.ok(source.includes("request('storage.set',{key:pagePanelKey,value:visible,ifMatch:previous.etag})"));
  assert.ok(source.includes("request('storage.get',{key:pagePanelKey,withEtag:true})"));
  assert.ok(source.includes("const pagePanelKey='"+WEBFLOW_PAGE_PANEL_KEY+"'"));
  assert.ok(!source.includes('chrome.storage.local'),'sandbox must use reviewed SDK');
});

test('page panel defaults off, responds to local storage changes and never duplicates DOM',async()=>{
  const f=fixture();
  const panel=initWebFlowPagePanel({api:f.api,doc:f.document,win:f.win});
  await panel.ready;
  assert.equal(f.selector(),null);
  await f.local.set({[DATA]:{[WEBFLOW_PAGE_PANEL_KEY]:true}});
  await pause();
  const first=f.selector();
  assert.ok(first);
  assert.equal(first.getAttribute('data-opendesk-ui-owner'),'webflow-page-assist');
  assert.equal(f.document.querySelectorAll('#opendesk-webflow-page-assist').length,1);
  await f.local.set({[DATA]:{[WEBFLOW_PAGE_PANEL_KEY]:true}});
  await pause();
  assert.equal(f.selector(),first);
  await f.local.set({[DATA]:{[WEBFLOW_PAGE_PANEL_KEY]:false}});
  await pause();
  assert.equal(f.selector(),null,'disable must unmount, not CSS-hide');
  panel.dispose();
  assert.equal(f.subscribers.size,0);
});

test('SPA body replacement reattaches one existing DOM root and disposes navigation listener',async()=>{
  const f=fixture({[DATA]:{[WEBFLOW_PAGE_PANEL_KEY]:true}});
  const panel=initWebFlowPagePanel({api:f.api,doc:f.document,win:f.win});
  await panel.ready;
  const original=f.selector();assert.ok(original);
  original.remove();
  assert.equal(f.selector(),null);
  f.win.navigation.dispatch('currententrychange');
  await pause();
  assert.equal(f.selector(),original,'reattach original UI without creating duplicate observers');
  assert.equal(f.document.querySelectorAll('#opendesk-webflow-page-assist').length,1);
  panel.dispose();
  assert.equal(f.selector(),null);
});

test('tool disabled, uninstalled or malformed preferences always unmount page UI',async()=>{
  const f=fixture({[DATA]:{[WEBFLOW_PAGE_PANEL_KEY]:true}});
  const panel=initWebFlowPagePanel({api:f.api,doc:f.document,win:f.win});
  await panel.ready;
  assert.ok(f.selector());
  await f.local.set({[SIDEBAR_TOOL_ENABLE_STORE]:{webflow:false}});
  await pause();assert.equal(f.selector(),null);
  await f.local.set({[SIDEBAR_TOOL_ENABLE_STORE]:{webflow:true}});
  await pause();assert.ok(f.selector());
  await f.local.set({[SIDEBAR_TOOL_STORE]:[]});
  await pause();assert.equal(f.selector(),null);
  await f.local.set({[SIDEBAR_TOOL_STORE]:[packageRow],[DATA]:{[WEBFLOW_PAGE_PANEL_KEY]:'true'}});
  await pause();assert.equal(f.selector(),null);
  assert.equal(webFlowPagePanelAllowed({[SIDEBAR_TOOL_STORE]:[packageRow],[DATA]:{[WEBFLOW_PAGE_PANEL_KEY]:true}}),true);
  panel.dispose();
});

test('unsupported origins and frames never install the Web Flow panel or storage observers',async()=>{
  for(const origin of ['https://evil.example','https://chatgpt.com.evil.example']){
    const f=fixture({[DATA]:{[WEBFLOW_PAGE_PANEL_KEY]:true}});
    f.win.location.origin=origin;
    const panel=initWebFlowPagePanel({api:f.api,doc:f.document,win:f.win});
    await panel.ready;
    assert.equal(f.selector(),null);assert.equal(f.subscribers.size,0);
  }
  const f=fixture({[DATA]:{[WEBFLOW_PAGE_PANEL_KEY]:true}});
  f.win.top={};
  const panel=initWebFlowPagePanel({api:f.api,doc:f.document,win:f.win});
  await panel.ready;assert.equal(f.selector(),null);assert.equal(f.subscribers.size,0);
});
