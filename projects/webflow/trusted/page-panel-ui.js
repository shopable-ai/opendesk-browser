// Web Flow owns this fixed, UI-only ChatGPT projection. It never authorizes a Task.
import {SIDEBAR_TOOL_STORE,sidebarToolStorageKey} from '../../../src/ui/sidebar-tools/package.js';
import {SIDEBAR_TOOL_ENABLE_STORE,sidebarToolEnabled} from '../../../src/ui/sidebar-tools/lifecycle.js';

export const WEBFLOW_PAGE_PANEL_KEY='webflow.pagePanelVisible.v1';
const TOOL_ID='webflow';
const TOOL_DATA_KEY=sidebarToolStorageKey(TOOL_ID);
const OBSERVED_KEYS=new Set([TOOL_DATA_KEY,SIDEBAR_TOOL_STORE,SIDEBAR_TOOL_ENABLE_STORE]);

export function webFlowPagePanelAllowed(snapshot){
  const installed=snapshot?.[SIDEBAR_TOOL_STORE];
  if(!Array.isArray(installed))return false;
  const own=installed.filter(item=>item?.id===TOOL_ID);
  if(own.length!==1||own[0]?.format!=='opendesk.sidebar-tool.v2'||
     !Array.isArray(own[0]?.capabilities)||!own[0].capabilities.includes('storage.local'))return false;
  if(!sidebarToolEnabled(snapshot[SIDEBAR_TOOL_ENABLE_STORE],TOOL_ID))return false;
  const stored=snapshot[TOOL_DATA_KEY];
  if(stored==null)return false;
  if(typeof stored!=='object'||Array.isArray(stored))return false;
  // Invalid or absent preferences fail closed; no migration from file settings.
  return stored[WEBFLOW_PAGE_PANEL_KEY]===true;
}

function createPagePanel(doc){
  const root=doc.createElement('div');
  root.id='opendesk-webflow-page-assist';
  root.setAttribute('data-opendesk-ui-owner','webflow-page-assist');
  root.style.cssText='position:fixed;right:12px;top:76px;z-index:2147483600;max-width:calc(100vw - 24px);pointer-events:none';
  const shadow=root.attachShadow({mode:'closed'});
  const style=doc.createElement('style');
  style.textContent=`:host{all:initial}*{box-sizing:border-box}.assist{max-width:min(248px,calc(100vw - 24px));padding:10px 12px;background:#fff;color:#1b2c49;font:12px/1.5 system-ui,-apple-system,sans-serif;border:1px solid #dfe6ef;border-radius:12px;box-shadow:0 4px 14px #0002}.title{font-size:13px;font-weight:700}.state{color:#28694c;margin-top:2px}.hint{font-size:11px;color:#52627b;margin-top:5px;overflow-wrap:anywhere}@media(prefers-color-scheme:dark){.assist{background:#1b2b40;color:#edf3fd;border-color:#35485e}.state{color:#80d6a8}.hint{color:#b1c1d8}}`;
  const area=doc.createElement('section');
  area.className='assist';
  area.setAttribute('role','status');
  area.setAttribute('aria-label','Web Flow 网页辅助面板');
  const heading=doc.createElement('div');heading.className='title';heading.textContent='Web Flow';
  const state=doc.createElement('div');state.className='state';state.textContent='网页辅助面板已开启';
  const hint=doc.createElement('p');hint.className='hint';
  hint.textContent='任务状态、文件审阅与停止操作请在扩展 → Web Flow 的可信界面查看。此区域只负责显示，不触发任务。';
  area.append(heading,state,hint);shadow.append(style,area);
  return root;
}

// Exactly one Web Flow UI owner per document; the Headless bridge remains independent.
// Reading the fixed tool namespace is allowed only in this reviewed content adapter,
// never in sandbox code or a page-provided script.
export function initWebFlowPagePanel({api=globalThis.chrome,doc=globalThis.document,win=globalThis.window}={}){
  if(!api?.storage?.local?.get||!api.storage?.onChanged?.addListener||
     !doc?.createElement||!win?.location||win!==win.top||
     win.location.origin!=='https://chatgpt.com')return Object.freeze({dispose(){},ready:Promise.resolve()});
  let disposed=false,revision=0,root=null;
  const unmount=()=>{root?.remove();root=null;};
  const show=visible=>{
    if(disposed)return;
    if(!visible){unmount();return;}
    if(!root)root=createPagePanel(doc);
    if(!root.isConnected)(doc.body||doc.documentElement).append(root);
  };
  const refresh=async()=>{
    const current=++revision;
    try{
      const snapshot=await api.storage.local.get([...OBSERVED_KEYS]);
      if(disposed||current!==revision)return;
      show(webFlowPagePanelAllowed(snapshot));
    }catch{
      if(!disposed&&current===revision)show(false);
    }
  };
  const changed=(changes,area)=>{
    if(disposed||area!=='local'||!changes||
       !Object.keys(changes).some(key=>OBSERVED_KEYS.has(key)))return;
    // Re-read all three keys: enablement, installation and display preference.
    void refresh();
  };
  api.storage.onChanged.addListener(changed);
  const ready=refresh();
  const dispose=()=>{
    if(disposed)return;
    disposed=true;revision++;
    api.storage.onChanged.removeListener(changed);
    unmount();
  };
  return Object.freeze({dispose,ready});
}
