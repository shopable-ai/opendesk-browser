import {AGENT_MAX_BYTES,AgentBridgeError,agentObject} from './protocol.js';

export const FILES_PROTOCOL='opendesk.local-files.v1';
const METHODS=new Set(['files.status','workspaces.list','files.list','files.read','files.write','files.create']);
const WRITES=new Set(['files.write','files.create']);

// A capability-specific adapter on the EXISTING Native Port. Never exposed to
// the page SDK, content scripts, USER_SCRIPT or untrusted preview frames.
export function createFileWorkspaceService({api,connection,timeoutMs=16000}) {
  let supported=false,sessionId=null,maxContentBytes=32768;
  const pending=new Map();
  const available=()=>{const c=connection();return !!(supported&&sessionId&&c.enabled&&c.ready&&c.port);};
  const state=()=>({supported,connected:available(),maxContentBytes});
  function settle(id,result,error){
    const item=pending.get(id);if(!item)return;
    pending.delete(id);clearTimeout(item.timer);
    if(error){const e=new AgentBridgeError(error.code||'E_FILES_IO',error.message||'Local file request failed',
      error.outcome||(item.write?'OUTCOME_UNKNOWN':'FAILED_CONFIRMED'));item.reject(e);}
    else item.resolve(result);
  }
  function disconnected(){
    for(const [id,item] of pending)settle(id,null,{code:'E_FILES_DISCONNECTED',
      message:item.write?'连接已中断，保存结果未知。请重新读取文件核对；不会自动重试保存。':'本机文件连接已中断',
      outcome:item.write?'OUTCOME_UNKNOWN':'FAILED_CONFIRMED'});
    sessionId=null;
  }
  function negotiate(version){disconnected();supported=version===1;}
  function receive(message){
    if(!['files.state','files.response'].includes(message?.kind))return false;
    if(message.v!==1||message.protocol!==FILES_PROTOCOL||!supported)return false;
    if(message.kind==='files.state'){
      if(typeof message.connected!=='boolean'||message.connected&&
        (typeof message.sessionId!=='string'||message.sessionId.length<16||message.sessionId.length>128))return false;
      if(message.maxContentBytes!==undefined&&message.maxContentBytes!==32768)return false;
      if(!message.connected||sessionId!==message.sessionId)disconnected();
      sessionId=message.connected?message.sessionId:null;
      return true;
    }
    const item=pending.get(message.requestId);if(!item)return true;
    const c=connection();
    const validError=!Object.hasOwn(message,'error')||(agentObject(message.error)&&
      typeof message.error.code==='string'&&message.error.code.length>0&&typeof message.error.message==='string'&&
      (!Object.hasOwn(message.error,'outcome')||['OUTCOME_UNKNOWN','FAILED_CONFIRMED','NOT_DISPATCHED'].includes(message.error.outcome)));
    const validResult=!Object.hasOwn(message,'result')||(agentObject(message.result)&&(!item.write||
      message.result.saved===true&&typeof message.result.sha256==='string'&&/^[a-f0-9]{64}$/.test(message.result.sha256)));
    if(!available()||item.sessionId!==sessionId||message.sessionId!==sessionId||item.port!==c.port||item.generation!==c.generation||
      Object.hasOwn(message,'result')===Object.hasOwn(message,'error')||
      !validError||!validResult||new TextEncoder().encode(JSON.stringify(message)).length>AGENT_MAX_BYTES){
      settle(message.requestId,null,{code:'E_FILES_SESSION',message:'文件响应的连接身份已变化'});return true;
    }
    settle(message.requestId,message.result,message.error);return true;
  }
  async function request(method,params={}){
    if(!METHODS.has(method)||!agentObject(params))throw new AgentBridgeError('E_SCHEMA');
    if(!supported)throw new AgentBridgeError('E_FILES_UNSUPPORTED','本机 OpenDesk 尚未提供文件工作区，请更新原生程序');
    if(!available())throw new AgentBridgeError('E_FILES_DISCONNECTED','请先在本机连接设置中连接 OpenDesk');
    const c={...connection()},epoch=sessionId,requestId=crypto.randomUUID();
    // Freeze caller-owned input before the permission await.
    const wire=JSON.stringify({v:1,kind:'files.request',protocol:FILES_PROTOCOL,requestId,sessionId:epoch,method,params});
    if(new TextEncoder().encode(wire).length>AGENT_MAX_BYTES)throw new AgentBridgeError('E_FILES_LIMIT','文件消息超过传输上限');
    if(!await api.permissions.contains({permissions:['nativeMessaging']}))throw new AgentBridgeError('E_PERMISSION');
    if(!available()||sessionId!==epoch||connection().port!==c.port||connection().generation!==c.generation)
      throw new AgentBridgeError('E_FILES_DISCONNECTED');
    if(pending.size>=4)throw new AgentBridgeError('E_LIMIT');
    return new Promise((resolve,reject)=>{
      const write=WRITES.has(method);
      const timer=setTimeout(()=>settle(requestId,null,{code:'E_FILES_TIMEOUT',
        message:write?'未收到保存回执。请重新读取文件核对；不会自动重试。':'文件读取超时',
        outcome:write?'OUTCOME_UNKNOWN':'FAILED_CONFIRMED'}),timeoutMs);
      pending.set(requestId,{resolve,reject,timer,write,sessionId:epoch,port:c.port,generation:c.generation});
      try{c.port.postMessage(JSON.parse(wire));}catch{settle(requestId,null,{code:'E_FILES_DISCONNECTED',message:'本机连接已断开'});}
    });
  }
  return {state,negotiate,receive,request,disconnected,dispose:disconnected};
}
