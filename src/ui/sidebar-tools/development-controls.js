// Trusted controls in the existing React ToolHost. No tool-supplied event can
// approve storage, and approval always remounts through the original Host.
import {createDevelopmentStorageSession} from './development-session.js';
export function createToolDevelopmentControls({api,view,tools,createSession=createDevelopmentStorageSession}){
  let current=null,storageSession=null,closed=false,starting=false;
  const status=(text,error=false)=>view.patch('sidebar-tool-development-status',{
    textContent:text,hidden:false,data:{state:error?'error':'readonly'}});
  function render(){
    if(closed)return;
    const active=storageSession?.approved===true;
    view.patch('sidebar-tool-development-approve',{hidden:!current||!current.tool.capabilities.includes('storage.local')||active,disabled:starting});
    view.patch('sidebar-tool-development-stop',{hidden:!storageSession,disabled:false});
  }
  function invalidate(){
    current=null;starting=false;
    const old=storageSession;storageSession=null;old?.revoke('快照、构建或连接变化，隔离存储批准已撤销');
    render();
  }
  function snapshot(value){
    if(closed)return;
    current=value;render();
    if(value.tool.capabilities.includes('storage.local'))status(
      '隔离存储调试：'+value.tool.title+' · '+value.sourceId+' · SHA '+value.sha256+
      '。批准后重新打开当前界面；测试数据仅保留在本次浏览器会话，与正式数据分开。');
  }
  const releaseApprove=view.bind('sidebar-tool-development-approve','click',event=>{
    if(closed||event?.isTrusted!==true||starting||!current||storageSession?.approved)return;
    if(tools.isPreviewEditing()){
      status('请先结束当前编辑或保存，再批准重新打开预览；当前内容保留。',true);return;
    }
    const approvedSnapshot=current;
    starting=true;
    const old=storageSession;storageSession=null;old?.revoke();
    const candidate=createSession({api,session:approvedSnapshot,onState:(active,reason)=>{
      if(closed||storageSession!==candidate)return;
      starting=false;status(reason,!active);render();
    }});
    storageSession=candidate;render();
    status('正在核验当前源码和目录授权，并启动新的隔离界面…');
    try{
      if(tools.openReadOnlyPreview(approvedSnapshot.tool,{developmentSession:candidate})===false)
        throw new Error('当前界面尚不能安全重新打开');
    }catch(error){
      candidate.revoke();storageSession=null;starting=false;status(String(error.message||error),true);render();
    }
  });
  const releaseStop=view.bind('sidebar-tool-development-stop','click',event=>{
    if(closed||event?.isTrusted!==true)return;
    const old=storageSession;storageSession=null;old?.revoke();starting=false;
    status('隔离存储调试已停止；测试数据保留，重新打开需再次批准。');render();
  });
  return Object.freeze({invalidate,snapshot,dispose(){
    if(closed)return;invalidate();closed=true;releaseApprove();releaseStop();
    for(const key of ['sidebar-tool-development-approve','sidebar-tool-development-stop','sidebar-tool-development-status'])
      view.patch(key,{hidden:true});
  }});
}
