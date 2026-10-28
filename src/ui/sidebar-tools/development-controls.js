// Opening the existing debug entry supplies the intent. The Host still admits
// each new sandbox against the exact source, capabilities and Native owner.
import {createDevelopmentStorageSession} from './development-session.js';
export function createToolDevelopmentControls({api,view,tools,surface='tab',windowId=null,createSession=createDevelopmentStorageSession}){
  let storageSession=null,closed=false,openedScope=null,blocked=false;
  const scope=value=>JSON.stringify([value.previewId,value.workspaceId,value.sourceId,value.tool.id,
    [...value.tool.capabilities].sort()]);
  const status=(text='')=>view.patch('sidebar-tool-development-status',{
    textContent:text,hidden:!text,data:{state:'error'}});
  function invalidate(){
    // Keep the callback attached while retiring: a pending write can make the
    // outcome unknown, in which case a later build must not restart the app.
    storageSession?.revoke('调试快照或连接已变化',true);
    storageSession=null;
  }
  function snapshot(value){
    if(closed||!openedScope)return;
    if(openedScope!==scope(value))return mount(value);
    if(!blocked&&!storageSession&&value.tool.capabilities.includes('storage.local')&&!tools.isPreviewEditing())
      return mount(value);
  }
  function mount(value){
    if(closed||blocked)return false;
    if(openedScope&&openedScope!==scope(value)){
      blocked=true;invalidate();status('调试来源或能力范围已变化，请停止调试后重新打开。');return false;
    }
    if(tools.isPreviewEditing()){
      status('请先保存或结束当前编辑；当前内容保留。');return false;
    }
    openedScope=scope(value);
    invalidate();
    if(blocked)return false;
    status();
    if(!value.tool.capabilities.includes('storage.local'))return tools.openReadOnlyPreview(value.tool);
    const candidate=createSession({api,session:{...value,surface,windowId},onState:(active,reason,details)=>{
      if(closed||storageSession!==candidate)return;
      if(active){status();return;}
      if(details?.canRebind!==true)blocked=true;
      storageSession=null;status(reason);
    }});
    storageSession=candidate;
    try{
      if(tools.openReadOnlyPreview(value.tool,{developmentSession:candidate})===false)
        throw new Error('当前界面尚不能安全重新打开');
      return true;
    }catch(error){
      blocked=true;invalidate();status(String(error.message||error));return false;
    }
  }
  return Object.freeze({invalidate,snapshot,mount,dispose(){
    if(closed)return;closed=true;invalidate();status();
  }});
}
