// A narrow adapter owned by the existing live-preview Workspace. It does not
// issue Native authority: every operation reuses that Workspace's assertion.
import {isToolSender} from '../environment.js';
import {toolDocumentIdentity,SIDEPANEL_DOCUMENT_PATH} from '../tool-document-url.js';
import {executeDevelopmentStorage} from '../ui/sidebar-tools/development-storage.js';

export const TOOL_DEVELOPMENT_STORAGE_PORT='opendesk.tool-development-storage.v1:';
const SHA=/^[a-f0-9]{64}$/;
const INSTANCE=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
const fail=(code='E_PREVIEW_GRANT',message='开发存储批准已失效，请重新明确批准当前预览')=>Object.assign(new Error(message),{code});

export function createToolDevelopmentStorageOwner({api,getCurrent,assertCurrent,verifySnapshot,
  lockManager=globalThis.navigator?.locks,now=Date.now,ttlMs=5*60*1000}){
  let closed=false,generation=0,grant=null;
  const connections=new Set();
  function revoke(reason='开发存储批准已撤销'){
    generation++;grant=null;
    for(const row of connections)try{row.port.postMessage({type:'revoked',generation,reason});}catch{}
  }
  function currentFor(row,sha256){
    const current=getCurrent();
    if(closed||row.closed||!current||current.previewId!==row.previewId||
      current.tabId!==row.tabId||current.sha256!==sha256||!current.available||
      !current.tool.capabilities.includes('storage.local')||
      current.nativeAuthority?.devLeaseEpoch!==1||
      typeof current.nativeAuthority?.sessionId!=='string'||!current.nativeAuthority.sessionId||
      typeof current.nativeAuthority?.leaseEpoch!=='string'||!current.nativeAuthority.leaseEpoch)
      throw fail();
    return current;
  }
  function connect(port){
    const current=getCurrent();
    if(!current||port.name!==TOOL_DEVELOPMENT_STORAGE_PORT+current.previewId)return;
    const sender=port.sender;
    const identity=toolDocumentIdentity(api.runtime.getURL(SIDEPANEL_DOCUMENT_PATH),sender?.url);
    if(closed||!isToolSender(api,sender)||!identity?.hostInstanceId||
      identity.previewId!==current.previewId||sender.tab.id!==current.tabId){port.disconnect();return;}
    // A replacement browser document never inherits an old document's grant.
    revoke('开发预览文档已连接，请明确批准当前快照');
    for(const previous of connections){previous.closed=true;try{previous.port.disconnect();}catch{}}
    connections.clear();
    const row={port,previewId:current.previewId,tabId:sender.tab.id,
      documentId:sender.documentId,hostInstanceId:identity.hostInstanceId,closed:false,pending:0,
      lastRequest:0,windowStart:now(),count:0};
    connections.add(row);
    const disconnected=()=>{
      row.closed=true;connections.delete(row);
      if(grant?.row===row)revoke('开发预览连接已断开');
    };
    port.onDisconnect.addListener(disconnected);
    const reply=(requestId,ok,value)=>{
      if(row.closed)return;
      try{port.postMessage({type:'result',requestId,ok,...(ok?{result:value}:{error:{code:value?.code||'E_PREVIEW_GRANT',
        message:String(value?.message||value).slice(0,240)}})});}catch{disconnected();}
    };
    async function handle(message){
      if(message.type==='revoke'){if(grant?.row===row)revoke();return {revoked:true};}
      if(message.type==='approve'){
        revoke();
        if(!SHA.test(message.sha256)||!INSTANCE.test(message.instance))throw fail('E_SCHEMA');
        const before=currentFor(row,message.sha256),epoch=generation;
        await assertCurrent();
        await verifySnapshot(message.sha256);
        await assertCurrent();
        const after=currentFor(row,message.sha256);
        if(generation!==epoch||before!==after)throw fail();
        // Native identity is frozen with this exact owner's admission. The
        // original assertCurrent rechecks session/lease on every request.
        grant={row,sourceId:after.sourceId,toolId:after.tool.id,previewId:row.previewId,
          sha256:message.sha256,instance:message.instance,documentId:row.documentId,
          tabId:row.tabId,hostInstanceId:row.hostInstanceId,nativeAuthority:after.nativeAuthority,
          generation:epoch,expiresAt:now()+ttlMs};
        return {approved:true,expiresAt:grant.expiresAt,generation:epoch};
      }
      if(message.type!=='storage'||!['storage.get','storage.set'].includes(message.operation))throw fail('E_CAPABILITY');
      const admitted=grant;
      const check=()=>{
        if(!admitted||grant!==admitted||admitted.row!==row||generation!==admitted.generation||
          now()>=admitted.expiresAt||message.instance!==admitted.instance||message.sha256!==admitted.sha256)
          throw fail();
        const current=currentFor(row,admitted.sha256);
        if(current.sourceId!==admitted.sourceId||current.tool.id!==admitted.toolId||
          current.nativeAuthority!==admitted.nativeAuthority)throw fail();
      };
      const authorize=async()=>{
        check();
        try{await assertCurrent();}catch(error){revoke('原目录授权或 Native 连接已失效');throw error;}
        check(); // assertCommit repeats this after the caller's await too.
      };
      check();
      return executeDevelopmentStorage({api,lockManager,sourceId:admitted.sourceId,toolId:admitted.toolId,
        operation:message.operation,payload:message.payload,authorize,assertCommit:check});
    }
    port.onMessage.addListener(message=>{
      if(row.closed||closed)return;
      const requestId=message?.requestId;
      if(!Number.isSafeInteger(requestId)||requestId<=row.lastRequest)return;
      row.lastRequest=requestId;
      if(now()-row.windowStart>=60000){row.windowStart=now();row.count=0;}
      if(++row.count>120||row.pending>=8){reply(requestId,false,fail('E_LIMIT','开发存储请求过多'));return;}
      let bytes;try{bytes=new TextEncoder().encode(JSON.stringify(message)).byteLength;}catch{}
      if(!bytes||bytes>12000){reply(requestId,false,fail('E_LIMIT'));return;}
      row.pending++;
      void handle(message).then(result=>reply(requestId,true,result),error=>reply(requestId,false,error))
        .finally(()=>row.pending--);
    });
  }
  api.runtime.onConnect?.addListener(connect);
  return Object.freeze({revoke,dispose(){
    if(closed)return;closed=true;revoke('开发会话已停止');
    api.runtime.onConnect?.removeListener(connect);
    for(const row of connections){row.closed=true;try{row.port.disconnect();}catch{}}
    connections.clear();
  }});
}
