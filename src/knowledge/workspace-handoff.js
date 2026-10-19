import {SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE,sidebarToolEnabled} from '../ui/sidebar-tools/lifecycle.js';
import {SIDEBAR_TOOL_STORE} from '../ui/sidebar-tools/package.js';
import {KNOWLEDGE_WORKSPACE_PREFIX,installedKnowledgeTool,knowledgePackageHash,knowledgeDigest} from './policy.js';

export async function validateKnowledgeHandoff(value,{installed,enableRecords,installEpoch=null,now=Date.now()}={}){
  const tool=installedKnowledgeTool(installed);
  if(!sidebarToolEnabled(enableRecords,'knowledge-inbox')||(value?.installEpoch??null)!==installEpoch||!value||value.version!==1||!tool||typeof value.expiresAt!=='number'||value.expiresAt<now||value.expiresAt>now+600000||
    typeof value.markdown!=='string'||!value.markdown||new TextEncoder().encode(value.markdown).length>32768||
    typeof value.filename!=='string'||value.filename.length>90||!/^[^\\/\x00-\x1f:?*"<>|]+\.md$/i.test(value.filename)||value.filename.startsWith('.')||
    typeof value.title!=='string'||value.title.length>160||
    await knowledgeDigest(value.markdown)!==value.sha256||await knowledgePackageHash(tool)!==value.packageHash)
    throw new Error('知识草稿已过期、内容不完整或工具已变化，请从收件箱重新发送');
  return structuredClone(value);
}
export function createKnowledgeWorkspaceHandoff({api,canImport,onImport,report,lockManager=globalThis.navigator?.locks}){
  let pending=null,key=null,busy=false,disposed=false;
  const listeners=new Set();
  let snapshot=Object.freeze({pending:null,busy:false,disabled:true});
  function controls(){
    if(disposed)return;
    snapshot=Object.freeze({pending:pending?Object.freeze({title:pending.title,filename:pending.filename}):null,
      busy,disabled:busy||!pending||!canImport()});
    for(const listener of [...listeners])listener();
  }
  async function read(){
    const tab=await api.tabs.getCurrent();if(!Number.isInteger(tab?.id)||disposed)return;
    key=KNOWLEDGE_WORKSPACE_PREFIX+tab.id;
    const value=(await api.storage.session.get(key))[key];if(!value)return;
    const saved=await api.storage.local.get([SIDEBAR_TOOL_STORE,SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE]);
    pending=await validateKnowledgeHandoff(value,{installed:saved[SIDEBAR_TOOL_STORE],enableRecords:saved[SIDEBAR_TOOL_ENABLE_STORE],installEpoch:saved[TOOL_REVOCATION_EPOCHS_STORE]?.['knowledge-inbox']??null});
    if(disposed)return;
    controls();
  }
  const click=async event=>{
    if(!event.isTrusted||busy||!pending||!canImport())return;
    busy=true;controls();
    try{
      if(!lockManager?.request)throw new Error('当前浏览器无法安全协调知识草稿');
      await lockManager.request('opendesk.sidebar-tools:tool:knowledge-inbox',async()=>{
        const stored=(await api.storage.session.get(key))[key];
        const saved=await api.storage.local.get([SIDEBAR_TOOL_STORE,SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE]);
        const value=await validateKnowledgeHandoff(stored,{installed:saved[SIDEBAR_TOOL_STORE],enableRecords:saved[SIDEBAR_TOOL_ENABLE_STORE],installEpoch:saved[TOOL_REVOCATION_EPOCHS_STORE]?.['knowledge-inbox']??null});
        if(value.sha256!==pending.sha256||value.packageHash!==pending.packageHash||value.filename!==pending.filename)
          throw new Error('待载入草稿已变化，请从收件箱重新发送');
        if(disposed)return;
        const imported=await onImport(value);
        if(imported===false)return;
        pending=null;
        await api.storage.session.remove(key);
      });
    }catch(error){report(error);}finally{busy=false;controls();}
  };
  const ready=api?.tabs?.getCurrent?read().catch(report):Promise.resolve();
  return {getSnapshot:()=>snapshot,subscribe(listener){listeners.add(listener);return ()=>listeners.delete(listener);},
    controls,importDraft:click,ready,dispose(){disposed=true;listeners.clear();}};
}

// Compatibility for the isolated legacy consumer; the official Workspace now
// subscribes to the controller above and owns its DOM entirely in React.
export function initKnowledgeWorkspaceHandoff({doc,...options}){
  const panel=doc.getElementById('knowledge-handoff'),button=doc.getElementById('knowledge-handoff-import');
  if(!panel||!button)return {controls(){}};
  const controller=createKnowledgeWorkspaceHandoff(options);
  const render=()=>{
    const state=controller.getSnapshot();panel.hidden=!state.pending;button.disabled=state.disabled;
    if(state.pending)doc.getElementById('knowledge-handoff-title').textContent='来自知识收件箱：'+state.pending.title;
  };
  const stop=controller.subscribe(render);render();
  button.addEventListener('click',controller.importDraft);
  return {controls:controller.controls,dispose(){stop();controller.dispose();button.removeEventListener('click',controller.importDraft);}};
}
