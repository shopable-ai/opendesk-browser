// Extension-owned Host transport only. Never exposed to dynamic tool code.
import {toolDocumentIdentity,SIDEPANEL_DOCUMENT_PATH} from '../../tool-document-url.js';
import {TOOL_DEVELOPMENT_STORAGE_PORT} from '../../native-agent/tool-development-storage.js';
const failure=(code,message)=>Object.assign(new Error(message),{code});
export function createDevelopmentStorageSession({api,session,onState=()=>{},timeoutMs=10000,documentUrl=globalThis.location?.href}){
  let port=null,instance=null,approved=false,sequence=0,expiresAt=0,expiryTimer=null;
  let retired=false,started=false,lastGeneration=0;
  const pending=new Map();
  function clear(reason='隔离存储调试已停止',notify=true,canRebind=false){
    approved=false;instance=null;expiresAt=0;clearTimeout(expiryTimer);
    const previous=port;port=null;
    const unknownWrite=[...pending.values()].some(row=>row.write);
    for(const row of pending.values()){
      clearTimeout(row.timer);row.reject(failure(row.write?'E_OUTCOME_UNKNOWN':'E_PREVIEW_GRANT',
        row.write?'保存结果未知，请重新打开调试后只读核对；不会自动重试':reason));
    }
    pending.clear();try{previous?.disconnect();}catch{}
    if(notify)onState(false,unknownWrite?'保存结果未知，请重新打开调试后只读核对；不会自动重试':reason,{canRebind:canRebind&&!unknownWrite});
  }
  function revoke(reason,canRebind=false){retired=true;clear(reason,true,canRebind);}
  function send(type,values={}){
    if(!port)return Promise.reject(failure('E_PREVIEW_GRANT','开发存储连接不可用'));
    const requestId=++sequence,write=type==='storage'&&values.operation==='storage.set';
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>revoke('调试连接超时，请重新打开调试'),timeoutMs);
      pending.set(requestId,{resolve,reject,timer,write});
      try{port.postMessage({type,requestId,sha256:session.sha256,instance,...values});}
      catch{revoke('开发存储连接已断开');}
    });
  }
  async function start(token){
    if(retired||started)throw failure('E_PREVIEW_GRANT','该开发界面已停止，请重新打开调试');
    started=true;clear(undefined,false);instance=token;
    let opened,transport={};
    try{
      if(session.surface==='sidepanel'){
        const window=await api.windows.getCurrent();
        const identity=toolDocumentIdentity(api.runtime.getURL(SIDEPANEL_DOCUMENT_PATH),documentUrl);
        if(!identity?.hostInstanceId||identity.hasLocator||window.incognito||
          !Number.isSafeInteger(session.windowId)||session.windowId<0||window.id!==session.windowId)
          throw failure('E_PREVIEW_GRANT','开发界面窗口已变化');
        const contexts=await api.runtime.getContexts({contextTypes:['SIDE_PANEL'],documentUrls:[documentUrl]});
        const matches=contexts.filter(context=>context.contextType==='SIDE_PANEL'&&
          context.documentUrl===documentUrl&&context.frameId===0&&!context.incognito&&
          (!context.documentLifecycle||context.documentLifecycle==='active'));
        const context=matches[0];
        if(matches.length!==1||typeof context.documentId!=='string'||!context.documentId||
          typeof context.contextId!=='string'||!context.contextId||context.tabId!==-1||
          context.windowId!==-1&&context.windowId!==window.id)
          throw failure('E_PREVIEW_GRANT','开发界面原生文档已变化');
        transport={surface:'sidepanel',windowId:window.id,hostInstanceId:identity.hostInstanceId,
          documentId:context.documentId,contextId:context.contextId};
      }
      if(retired||instance!==token)throw failure('E_PREVIEW_GRANT','开发界面已停止');
      opened=api.runtime.connect({name:TOOL_DEVELOPMENT_STORAGE_PORT+session.previewId});}
    catch(error){revoke('开发存储连接不可用，请重新打开预览');throw error;}
    port=opened;
    opened.onDisconnect.addListener(()=>{if(port===opened)revoke('开发存储连接已断开');});
    opened.onMessage.addListener(message=>{
      if(port!==opened)return;
      if(message?.type==='revoked'){
        // Approval starts by revoking the previous generation. A later
        // revocation must also invalidate an approval result still in flight.
        if(!Number.isSafeInteger(message.generation)||message.generation<=0){revoke('调试会话代际无效');return;}
        lastGeneration=Math.max(lastGeneration,message.generation);
        if(approved)revoke(message.reason,message.canRebind===true);return;
      }
      if(message?.type!=='result')return;
      const row=pending.get(message.requestId);if(!row)return;
      pending.delete(message.requestId);clearTimeout(row.timer);
      if(message.ok===true)row.resolve(message.result);
      else row.reject(failure(message.error?.code||'E_PREVIEW_GRANT',message.error?.message||'调试会话已失效'));
    });
    try{
      const result=await send('approve',transport);
      if(retired||port!==opened||instance!==token||result?.approved!==true||
        !Number.isSafeInteger(result.generation)||result.generation!==lastGeneration||
        !Number.isSafeInteger(result.expiresAt)||result.expiresAt<=Date.now())
        throw failure('E_PREVIEW_GRANT','调试会话未能绑定当前界面');
      approved=true;expiresAt=result.expiresAt;
      expiryTimer=setTimeout(()=>revoke('调试会话已到期，请重新打开调试'),Math.max(1,expiresAt-Date.now()));
      onState(true,'');
    }catch(error){if(port===opened)revoke(error.message);throw error;}
  }
  function request(operation,payload,token){
    if(!approved||instance!==token||Date.now()>=expiresAt||!['storage.get','storage.set','currentPage.info'].includes(operation))
      return Promise.reject(failure('E_PREVIEW_GRANT','当前调试会话已失效，请重新打开调试'));
    return send('storage',{operation,payload});
  }
  return Object.freeze({start,request,assertCurrent:token=>request('currentPage.info',{},token),revoke,get approved(){return approved;}});
}
