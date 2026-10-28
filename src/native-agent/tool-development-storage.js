// A narrow adapter owned by the existing live-preview Workspace. It does not
// issue Native authority: every operation reuses that Workspace's assertion.
import {isToolSender} from '../environment.js';
import {toolDocumentIdentity,SIDEPANEL_DOCUMENT_PATH} from '../tool-document-url.js';
import {executeDevelopmentStorage} from '../ui/sidebar-tools/development-storage.js';

export const TOOL_DEVELOPMENT_STORAGE_PORT='opendesk.tool-development-storage.v1:';
const SHA=/^[a-f0-9]{64}$/;
const INSTANCE=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
const fail=(code='E_PREVIEW_GRANT',message='调试会话已失效，请重新打开调试')=>Object.assign(new Error(message),{code});

export function createToolDevelopmentStorageOwner({api,getCurrent,assertCurrent,verifySnapshot,
  lockManager=globalThis.navigator?.locks,now=Date.now,ttlMs=5*60*1000}){
  let closed=false,generation=0,grant=null;
  const connections=new Set();
  function revoke(reason='调试会话已撤销',canRebind=false){
    generation++;grant=null;
    for(const row of connections)try{row.port.postMessage({type:'revoked',generation,reason,canRebind});}catch{}
  }
  function currentFor(row,sha256){
    const current=getCurrent();
    if(closed||row.closed||!current||current.previewId!==row.previewId||
      (current.surface||'tab')!==row.surface||
      (row.surface==='sidepanel'?current.windowId!==row.windowId:current.tabId!==row.tabId)||current.sha256!==sha256||!current.available||
      !current.tool.capabilities.includes('storage.local')||
      current.nativeAuthority?.devLeaseEpoch!==1||
      typeof current.nativeAuthority?.sessionId!=='string'||!current.nativeAuthority.sessionId||
      typeof current.nativeAuthority?.leaseEpoch!=='string')
      throw fail();
    return current;
  }
  function connect(port){
    const current=getCurrent();
    if(!current||port.name!==TOOL_DEVELOPMENT_STORAGE_PORT+current.previewId)return;
    const sender=port.sender;
    const identity=toolDocumentIdentity(api.runtime.getURL(SIDEPANEL_DOCUMENT_PATH),sender?.url);
    const surface=current.surface||'tab';
    const panel=surface==='sidepanel';
    const panelSender=sender?.id===api.runtime.id&&!sender.tab&&identity?.hostInstanceId&&
      !identity.hasLocator&&(sender.frameId===undefined||sender.frameId===0)&&
      (!sender.documentLifecycle||sender.documentLifecycle==='active');
    if(closed||!identity?.hostInstanceId||(panel?!panelSender:
      !isToolSender(api,sender)||identity.previewId!==current.previewId||sender.tab.id!==current.tabId)){
      port.disconnect();return;
    }
    // A replacement browser document never inherits an old document's grant.
    revoke('开发预览文档已连接，正在核验当前快照');
    for(const previous of connections){previous.closed=true;try{previous.port.disconnect();}catch{}}
    connections.clear();
    const row={port,previewId:current.previewId,surface,windowId:current.windowId,
      tabId:sender.tab?.id,documentId:sender.documentId,contextId:null,
      hostInstanceId:identity.hostInstanceId,closed:false,pending:0,
      lastRequest:0,windowStart:now(),count:0};
    async function nativeContext(){
      if(!panel)return;
      const contexts=await api.runtime.getContexts({contextTypes:['SIDE_PANEL'],documentUrls:[sender.url]});
      const matches=contexts.filter(context=>context.contextType==='SIDE_PANEL'&&
        context.documentUrl===sender.url&&context.frameId===0&&!context.incognito&&
        (!context.documentLifecycle||context.documentLifecycle==='active'));
      const context=matches[0];
      if(matches.length!==1||typeof context.documentId!=='string'||!context.documentId||
        typeof context.contextId!=='string'||!context.contextId||
        !Number.isSafeInteger(context.tabId)||context.tabId!==-1||
        !Number.isSafeInteger(context.windowId)||context.windowId< -1||
        context.windowId!==-1&&context.windowId!==row.windowId||
        row.documentId&&context.documentId!==row.documentId||
        row.contextId&&context.contextId!==row.contextId)throw fail();
      row.documentId=context.documentId;row.contextId=context.contextId;
    }
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
        // Empty leaseEpoch is Native's explicit no-CLI state, still checked on
        // every request; it is not a wildcard for later CLI leases.
        const nativeSessionId=before.nativeAuthority.sessionId,leaseEpoch=before.nativeAuthority.leaseEpoch;
        const sourceId=before.sourceId,toolId=before.tool.id;
        await nativeContext();
        if(panel&&(message.surface!==row.surface||message.windowId!==row.windowId||
          message.documentId!==row.documentId||message.contextId!==row.contextId||
          message.hostInstanceId!==row.hostInstanceId))throw fail();
        // Chrome can report windowId=-1. Window proof then comes from the
        // compiled trusted Host's windows.getCurrent over this authenticated
        // port, never from sandbox payload. assertCurrent checks owner/pointer.
        await assertCurrent();
        await verifySnapshot(message.sha256);
        await assertCurrent();
        await nativeContext();
        const after=currentFor(row,message.sha256);
        if(generation!==epoch||before!==after||after.sourceId!==sourceId||after.tool.id!==toolId||
          after.nativeAuthority.sessionId!==nativeSessionId||after.nativeAuthority.leaseEpoch!==leaseEpoch)throw fail();
        // Native identity is frozen with this exact owner's admission. The
        // original assertCurrent rechecks session/lease on every request.
        grant={row,sourceId:after.sourceId,toolId:after.tool.id,previewId:row.previewId,
          sha256:message.sha256,instance:message.instance,documentId:row.documentId,
          surface:row.surface,windowId:row.windowId,contextId:row.contextId,
          tabId:row.tabId,hostInstanceId:row.hostInstanceId,nativeAuthority:after.nativeAuthority,
          nativeSessionId:after.nativeAuthority.sessionId,leaseEpoch:after.nativeAuthority.leaseEpoch,
          generation:epoch,expiresAt:now()+ttlMs};
        return {approved:true,expiresAt:grant.expiresAt,generation:epoch};
      }
      if(message.type!=='storage'||!['storage.get','storage.set','currentPage.info'].includes(message.operation))throw fail('E_CAPABILITY');
      const admitted=grant;
      const check=()=>{
        if(!admitted||grant!==admitted||admitted.row!==row||generation!==admitted.generation||
          now()>=admitted.expiresAt||message.instance!==admitted.instance||message.sha256!==admitted.sha256)
          throw fail();
        const current=currentFor(row,admitted.sha256);
        if(current.sourceId!==admitted.sourceId||current.tool.id!==admitted.toolId||
          current.nativeAuthority!==admitted.nativeAuthority||
          current.nativeAuthority.sessionId!==admitted.nativeSessionId||
          current.nativeAuthority.leaseEpoch!==admitted.leaseEpoch)throw fail();
      };
      const authorize=async()=>{
        check();
        try{await nativeContext();check();await assertCurrent();await nativeContext();}catch(error){revoke('原目录授权或 Native 连接已失效');throw error;}
        check(); // assertCommit repeats this after the caller's await too.
      };
      check();
      if(message.operation==='currentPage.info'){
        if(!currentFor(row,admitted.sha256).tool.capabilities.includes('currentPage.read'))throw fail('E_CAPABILITY');
        await authorize();check();return {authorized:true};
      }
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
