// Source fixture: the real framework owns its DOM and Bridge. Only Chrome services are in memory.
import {mountSidebarApp} from '../../../../src/ui/react/main.tsx';
import {createSidebarToolsView} from '../../../../src/ui/sidebar-tools-view.js';
import {createSidebarTools} from '../../../../src/ui/sidebar-tools.js';
import {SIDEBAR_TOOL_STORE} from '../../../../src/ui/sidebar-tools/package.js';
import {SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE} from '../../../../src/ui/sidebar-tools/lifecycle.js';

const status=document.getElementById('preview-status');
try{
  const tool=await (await fetch('/tool.json')).json();
  const store={[SIDEBAR_TOOL_STORE]:[tool],[SIDEBAR_TOOL_ENABLE_STORE]:{},[TOOL_REVOCATION_EPOCHS_STORE]:{}};
  const changes=new Set();
  const clone=value=>value===undefined?undefined:structuredClone(value);
  // Opaque data document avoids the shared Ego Profile's installed HTTP Page SDK injection.
  // Keep sandbox allow-scripts and connect-src none; only this server supplies fixed Bridge code.
  const sandbox=await (await fetch('/sandbox.html')).text();
  const sandboxURL='data:text/html;charset=utf-8,'+encodeURIComponent(sandbox
    .replace("script-src 'self' blob:","script-src 'self' blob: "+location.origin)
    .replace('src="bridge.js"','crossorigin="anonymous" src="'+location.origin+'/bridge.js"'));
  const api={runtime:{id:'header-demo-source-fixture',getURL:path=>path==='sidebar-tools/sandbox.html'?sandboxURL:location.origin+'/'+path,
    async sendMessage(){throw Error('E_DEMO_NO_RUNTIME: 源码演示不连接真实浏览器服务');},
    onMessage:{addListener(){},removeListener(){}},async getContexts(){return [];}},
    storage:{local:{async get(keys){return keys===null?clone(store):Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(key=>[key,clone(store[key])]));},
      async set(values){const diff=Object.fromEntries(Object.entries(values).map(([key,newValue])=>[key,{oldValue:clone(store[key]),newValue:clone(newValue)}]));Object.assign(store,clone(values));for(const fn of changes)fn(diff,'local');},
      async remove(){throw Error('E_DEMO_NO_DELETE');}},
      session:{async get(){return {};},async set(){},async remove(){}},
      onChanged:{addListener:fn=>changes.add(fn),removeListener:fn=>changes.delete(fn)}},
    permissions:{async contains(){return false;},async request(){return false;},onRemoved:{addListener(){},removeListener(){}}},
    tabs:{async create(){throw Error('E_DEMO_NO_TABS');}}};
  const localeController={getLocale:()=> 'zh-CN',subscribe:()=>()=>{}};
  const view=createSidebarToolsView();
  let app;
  app=mountSidebarApp(document,{toolView:view,localeController,onNavigate:tab=>app.renderNavigation(tab)});
  const host=createSidebarTools({api,doc:document,view,localeController,taskWorkbench:{},
    fetcher:async()=>new Response(JSON.stringify({schema:'opendesk.official-tools.releases.v1',sourceRepository:'https://github.com/shopable-ai/opendesk-browser',apps:[]}))});
  await host.ready;
  host.setVisible(true);
  await host.openTool(tool.id);
  status.textContent='操作：更多操作 → 打开资料库 → 左侧返回；再取消「使用右上角插槽」。';
  window.addEventListener('pagehide',()=>{host.dispose();app.dispose();view.dispose();},{once:true});
}catch(error){status.textContent='演示加载失败：'+String(error?.message||error);throw error;}
