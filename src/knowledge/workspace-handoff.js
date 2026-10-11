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
export function initKnowledgeWorkspaceHandoff({api,doc,canImport,onImport,report,lockManager=globalThis.navigator?.locks}){
  const panel=doc.getElementById('knowledge-handoff'),button=doc.getElementById('knowledge-handoff-import');
  if(!panel||!button||!api?.tabs?.getCurrent)return {controls(){}};
  let pending=null,key=null,busy=false,disposed=false;
  function controls(){button.disabled=busy||!pending||!canImport();}
  async function read(){
    const tab=await api.tabs.getCurrent();if(!Number.isInteger(tab?.id)||disposed)return;
    key=KNOWLEDGE_WORKSPACE_PREFIX+tab.id;
    const value=(await api.storage.session.get(key))[key];if(!value)return;
    const saved=await api.storage.local.get([SIDEBAR_TOOL_STORE,SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE]);
    pending=await validateKnowledgeHandoff(value,{installed:saved[SIDEBAR_TOOL_STORE],enableRecords:saved[SIDEBAR_TOOL_ENABLE_STORE],installEpoch:saved[TOOL_REVOCATION_EPOCHS_STORE]?.['knowledge-inbox']??null});
    if(disposed)return;
    panel.hidden=false;doc.getElementById('knowledge-handoff-title').textContent='来自知识收件箱：'+pending.title;
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
        pending=null;panel.hidden=true;
        await api.storage.session.remove(key);
      });
    }catch(error){report(error);}finally{busy=false;controls();}
  };
  button.addEventListener('click',click);
  void read().catch(report);
  return {controls,dispose(){disposed=true;button.removeEventListener('click',click);}};
}
