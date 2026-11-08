// Source fixture: the real framework owns its DOM and Bridge. Only Chrome services are in memory.
import {mountSidebarApp} from '../../../../src/ui/react/main.tsx';
import {createSidebarToolsView} from '../../../../src/ui/sidebar-tools-view.js';
import {createSidebarTools} from '../../../../src/ui/sidebar-tools.js';
import {SIDEBAR_TOOL_STORE,sidebarToolStorageKey} from '../../../../src/ui/sidebar-tools/package.js';
import {SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE} from '../../../../src/ui/sidebar-tools/lifecycle.js';

const status=document.getElementById('preview-status');
try{
  const tool=await (await fetch('/tool.json')).json();
  const params=new URL(location.href).searchParams;
  const isPage=params.get('surface')==='page';
  const section=['preferences','about'].includes(params.get('section'))?params.get('section'):'preferences';
  document.documentElement.dataset.demoSurface=isPage?'page':'sidebar';
  const persistedKey='opendesk.header-actions-demo.source-fixture-storage.v1';
  const namespace=sidebarToolStorageKey(tool.id);
  const persisted=()=>{
    try{
      const value=JSON.parse(localStorage.getItem(persistedKey)||'{}');
      return value&&typeof value==='object'&&!Array.isArray(value)?value:{};
    }catch{return {};}
  };
  const store={[SIDEBAR_TOOL_STORE]:[tool],[SIDEBAR_TOOL_ENABLE_STORE]:{},[TOOL_REVOCATION_EPOCHS_STORE]:{}};
  const changes=new Set();
  const storageChanged=event=>{
    if(event.key!==persistedKey)return;
    for(const fn of changes)fn({[namespace]:{
      oldValue:JSON.parse(event.oldValue||'{}')[namespace],
      newValue:JSON.parse(event.newValue||'{}')[namespace]
    }},'local');
  };
  window.addEventListener('storage',storageChanged);
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
    storage:{local:{async get(keys){
        const read=key=>key===namespace?persisted()[namespace]:store[key];
        const names=keys===null?[...new Set([...Object.keys(store),...Object.keys(persisted())])]:Array.isArray(keys)?keys:[keys];
        return Object.fromEntries(names.map(key=>[key,clone(read(key))]));
      },
      async set(values){
        const diff=Object.fromEntries(Object.entries(values).map(([key,newValue])=>[key,{
          oldValue:clone(key===namespace?persisted()[namespace]:store[key]),
          newValue:clone(newValue)}]));
        for(const [key,newValue] of Object.entries(values)){
          if(key===namespace)localStorage.setItem(persistedKey,JSON.stringify({...persisted(),[namespace]:clone(newValue)}));
          else store[key]=clone(newValue);
        }
        for(const fn of changes)fn(diff,'local');
      },
      async remove(){throw Error('E_DEMO_NO_DELETE');}},
      session:{async get(){return {};},async set(){},async remove(){}},
      onChanged:{addListener:fn=>changes.add(fn),removeListener:fn=>changes.delete(fn)}},
    permissions:{async contains(){return false;},async request(){return false;},onRemoved:{addListener(){},removeListener(){}}},
    tabs:{async create({url}){
      const target=new URL(url);
      const page=target.searchParams.get('section');
      if(target.origin!==location.origin||target.pathname!=='/sidepanel.html'||
         target.searchParams.get('toolId')!==tool.id||
         target.searchParams.get('view')!=='settings'||!['preferences','about'].includes(page)||
         [...target.searchParams.keys()].sort().join(',')!=='section,toolId,view')
        throw Error('E_DEMO_PAGE_TARGET');
      // Only a source fixture. Installed Chrome uses its real tabs.create,
      // fixed extension URL and original tool installation identity.
      const href='/?surface=page&view=settings&section='+encodeURIComponent(page);
      const opened=window.open(href,'_blank');
      if(opened){opened.opener=null;return {id:1};}
      throw Error('E_DEMO_POPUP_BLOCKED: 浏览器阻止弹窗；原页面已保留，请使用顶部“直接打开 PC 演示”链接。');
    }}};
  const localeController={getLocale:()=> 'zh-CN',subscribe:()=>()=>{}};
  const view=createSidebarToolsView();
  let app;
  app=mountSidebarApp(document,{toolView:view,localeController,onNavigate:tab=>app.renderNavigation(tab)});
  const host=createSidebarTools({api,doc:document,view,localeController,taskWorkbench:{},
    displaySurface:isPage?'page':'sidebar',
    fetcher:async()=>new Response(JSON.stringify({schema:'opendesk.official-tools.releases.v1',sourceRepository:'https://github.com/shopable-ai/opendesk-browser',apps:[]}))});
  await host.ready;
  host.setVisible(true);
  await host.openTool(tool.id,{initialPage:isPage?{view:'settings',section}:null});
  status.textContent=isPage?'PC 源码演示：编辑 → 保存 → 读回 → 刷新。请勿当成已安装 Chrome 验收。':
    '侧栏源码演示：点击 PC 首选项 → 修改与保存 → 返回侧栏重新读取；原 More 动作仍可用。';
  window.addEventListener('pagehide',()=>{window.removeEventListener('storage',storageChanged);host.dispose();app.dispose();view.dispose();},{once:true});
}catch(error){status.textContent='演示加载失败：'+String(error?.message||error);throw error;}
