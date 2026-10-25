// Extension-owned Host transport only. Never exposed to dynamic tool code.
import {TOOL_DEVELOPMENT_STORAGE_PORT} from '../../native-agent/tool-development-storage.js';
const failure=(code,message)=>Object.assign(new Error(message),{code});
export function createDevelopmentStorageSession({api,session,onState=()=>{},timeoutMs=10000}){
  let port=null,instance=null,approved=false,sequence=0,expiresAt=0,expiryTimer=null;
  let retired=false,started=false,lastGeneration=0;
  const pending=new Map();
  function clear(reason='隔离存储调试已停止',notify=true){
    approved=false;instance=null;expiresAt=0;clearTimeout(expiryTimer);
    const previous=port;port=null;
    for(const row of pending.values()){
      clearTimeout(row.timer);row.reject(failure(row.write?'E_OUTCOME_UNKNOWN':'E_PREVIEW_GRANT',
        row.write?'保存结果未知，请重新批准后只读核对；不会自动重试':reason));
    }
    pending.clear();try{previous?.disconnect();}catch{}
    if(notify)onState(false,reason);
  }
  function revoke(reason){retired=true;clear(reason);}
  function send(type,values={}){
    if(!port)return Promise.reject(failure('E_PREVIEW_GRANT','开发存储连接不可用'));
    const requestId=++sequence,write=type==='storage'&&values.operation==='storage.set';
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>revoke('开发存储连接超时，请重新批准当前预览'),timeoutMs);
      pending.set(requestId,{resolve,reject,timer,write});
      try{port.postMessage({type,requestId,sha256:session.sha256,instance,...values});}
      catch{revoke('开发存储连接已断开');}
    });
  }
  async function start(token){
    if(retired||started)throw failure('E_PREVIEW_GRANT','该开发界面已停止，请重新明确批准');
    started=true;clear(undefined,false);instance=token;
    let opened;
    try{opened=api.runtime.connect({name:TOOL_DEVELOPMENT_STORAGE_PORT+session.previewId});}
    catch(error){revoke('开发存储连接不可用，请重新打开预览');throw error;}
    port=opened;
    opened.onDisconnect.addListener(()=>{if(port===opened)revoke('开发存储连接已断开');});
    opened.onMessage.addListener(message=>{
      if(port!==opened)return;
      if(message?.type==='revoked'){
        // Approval starts by revoking the previous generation. A later
        // revocation must also invalidate an approval result still in flight.
        if(!Number.isSafeInteger(message.generation)||message.generation<=0){revoke('开发批准代际无效');return;}
        lastGeneration=Math.max(lastGeneration,message.generation);
        if(approved)revoke(message.reason);return;
      }
      if(message?.type!=='result')return;
      const row=pending.get(message.requestId);if(!row)return;
      pending.delete(message.requestId);clearTimeout(row.timer);
      if(message.ok===true)row.resolve(message.result);
      else row.reject(failure(message.error?.code||'E_PREVIEW_GRANT',message.error?.message||'批准已失效'));
    });
    try{
      const result=await send('approve');
      if(retired||port!==opened||instance!==token||result?.approved!==true||
        !Number.isSafeInteger(result.generation)||result.generation!==lastGeneration||
        !Number.isSafeInteger(result.expiresAt)||result.expiresAt<=Date.now())
        throw failure('E_PREVIEW_GRANT','批准未能绑定当前界面');
      approved=true;expiresAt=result.expiresAt;
      expiryTimer=setTimeout(()=>revoke('隔离存储批准已到期，请重新批准'),Math.max(1,expiresAt-Date.now()));
      onState(true,'隔离存储调试已批准；仅保留本次浏览器会话的测试数据');
    }catch(error){if(port===opened)revoke(error.message);throw error;}
  }
  function request(operation,payload,token){
    if(!approved||instance!==token||Date.now()>=expiresAt||!['storage.get','storage.set'].includes(operation))
      return Promise.reject(failure('E_PREVIEW_GRANT','请重新批准当前快照的隔离存储调试'));
    return send('storage',{operation,payload});
  }
  return Object.freeze({start,request,revoke,get approved(){return approved;}});
}
