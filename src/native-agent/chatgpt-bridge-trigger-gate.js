import {chatGPTConversationId} from './workspace-chatgpt.js';

// This is a one-use *trigger fence*, not a Task permission issuer or a second
// execution Authority. The installed Task, site grants and immutable revision
// are still authorized solely by the existing Foundation Controller admission.
export const CHATGPT_BRIDGE_PROTOCOL='opendesk.chatgpt.bridge.r12.v1';
export const CHATGPT_BRIDGE_LEDGER_KEY='opendesk.chatgpt.bridge.r12.trigger-ledger.v1';
const MAX_RECORDS=512;
const TOKEN=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const fail=(code,message)=>Object.assign(new Error(message),{code});
const plain=value=>Boolean(value&&typeof value==='object'&&!Array.isArray(value));
export function validChatGPTBridgeSource(value){
  return plain(value)&&Object.keys(value).sort().join(',')==='documentId,tabId,url'&&
    Number.isSafeInteger(value.tabId)&&value.tabId>=0&&
    typeof value.documentId==='string'&&value.documentId.length>0&&value.documentId.length<=128&&
    typeof value.url==='string'&&value.url.length<=2048&&!!chatGPTConversationId(value.url);
}
const sameSource=(a,b)=>a?.tabId===b?.tabId&&a?.documentId===b?.documentId&&a?.url===b?.url;

// Serial admission belongs to the one MV3 service worker; persist BEFORE ACK.
// Worker restart loses no admitted/consumed decisions. An ACK lost after a
// durable write intentionally fails closed rather than replaying an effect.
export function createChatGPTBridgeTriggerLedger({storage,clock=()=>Date.now(),
  generateId=()=>crypto.randomUUID()}={}){
  if(!storage?.get||!storage?.set)throw fail('E_BRIDGE_STORAGE','缺少受信持久存储');
  let pending=Promise.resolve();
  const sequence=task=>{
    const next=pending.then(task);
    pending=next.catch(()=>{});
    return next;
  };
  const load=async()=>{
    const value=(await storage.get(CHATGPT_BRIDGE_LEDGER_KEY))?.[CHATGPT_BRIDGE_LEDGER_KEY];
    return plain(value)?{...value}:{};
  };
  const save=rows=>storage.set({[CHATGPT_BRIDGE_LEDGER_KEY]:rows});
  const prune=(rows,now)=>{
    for(const [key,row] of Object.entries(rows))
      if(!plain(row)||!Number.isFinite(row.createdAt)||
        now-row.createdAt>7*86400000)delete rows[key];
    const sorted=Object.keys(rows).sort((a,b)=>(rows[a].createdAt||0)-(rows[b].createdAt||0));
    for(const key of sorted.slice(0,Math.max(0,sorted.length-MAX_RECORDS)))delete rows[key];
  };
  const requireSource=source=>{
    if(!validChatGPTBridgeSource(source))throw fail('E_BRIDGE_SOURCE','原对话来源身份不合法');
  };
  const requireRequestId=requestId=>{
    if(typeof requestId!=='string'||!TOKEN.test(requestId))throw fail('E_BRIDGE_REQUEST','请求身份不合法');
  };
  return Object.freeze({
    prepare(source){
      requireSource(source);
      return sequence(async()=>{
        const rows=await load(),now=clock();
        prune(rows,now);
        for(const row of Object.values(rows))
          if(sameSource(row.source,source)&&['prepared','approved'].includes(row.status))
            row.status='revoked';
        const requestId=generateId();
        requireRequestId(requestId);
        if(rows[requestId])throw fail('E_BRIDGE_REPLAY','随机请求身份出现冲突');
        rows[requestId]={source:structuredClone(source),createdAt:now,
          expiresAt:now+600000,status:'prepared'};
        prune(rows,now);
        await save(rows);
        return {requestId,expiresAt:rows[requestId].expiresAt,source:structuredClone(source)};
      });
    },
    authorize({source,requestId,mode}){
      requireSource(source);requireRequestId(requestId);
      if(!['manual','auto'].includes(mode))throw fail('E_BRIDGE_MODE','触发模式不合法');
      return sequence(async()=>{
        const rows=await load(),row=rows[requestId],now=clock();
        if(!sameSource(row?.source,source)||row.status!=='prepared'||now>=row.expiresAt)
          throw fail('E_BRIDGE_APPROVAL','请求已失效或已批准，不会重新授权');
        row.status='approved';row.mode=mode;row.approvedAt=now;
        row.approvalExpiresAt=Math.min(row.expiresAt,now+(mode==='auto'?300000:120000));
        await save(rows);
        return {mode,requestId,expiresAt:row.approvalExpiresAt};
      });
    },
    reserve({source,requestId,mode,turnKey,answerKey}){
      requireSource(source);requireRequestId(requestId);
      if(!['manual','auto'].includes(mode)||typeof turnKey!=='string'||!turnKey||
        typeof answerKey!=='string'||!answerKey||answerKey.length>2048||turnKey.length>128)
        throw fail('E_BRIDGE_CONTEXT','回答版本或触发范围不合法');
      return sequence(async()=>{
        const rows=await load(),row=rows[requestId],now=clock();
        if(!sameSource(row?.source,source)||row.status!=='approved'||row.mode!==mode||
          now>=row.approvalExpiresAt)
          throw fail('E_BRIDGE_REPLAY','没有当前轮次的一次性批准，或批准已消费／失效');
        row.status='consumed';row.consumedAt=now;row.turnKey=turnKey;row.answerKey=answerKey;
        await save(rows);
        return {requestId,consumed:true,mode};
      });
    },
    revokeSource(tabId){
      if(!Number.isSafeInteger(tabId))return Promise.resolve();
      return sequence(async()=>{
        const rows=await load();
        let changed=false;
        for(const row of Object.values(rows))if(row.source?.tabId===tabId&&
          ['prepared','approved'].includes(row.status)){row.status='revoked';changed=true;}
        if(changed)await save(rows);
      });
    },
    revokeApprovals(){
      return sequence(async()=>{
        const rows=await load();
        let changed=false;
        for(const row of Object.values(rows))if(['prepared','approved'].includes(row.status)){
          row.status='revoked';changed=true;
        }
        if(changed)await save(rows);
      });
    }
  });
}

export function installChatGPTBridgeTriggerGate({api=chrome,clock}={}){
  const ledger=createChatGPTBridgeTriggerLedger({storage:api.storage.local,clock});
  const pageSource=async sender=>{
    if(sender?.id!==api.runtime.id||sender?.frameId!==0||
      !Number.isSafeInteger(sender?.tab?.id)||sender.tab.incognito||
      typeof sender.documentId!=='string'||typeof sender.url!=='string')
      throw fail('E_BRIDGE_SENDER','触发请求并非来自受信的主文档脚本');
    const source={tabId:sender.tab.id,documentId:sender.documentId,url:sender.url};
    if(!validChatGPTBridgeSource(source))throw fail('E_BRIDGE_SOURCE','不是合法的官方对话');
    await assertSource(source);
    return source;
  };
  const assertSource=async source=>{
    if(!validChatGPTBridgeSource(source))throw fail('E_BRIDGE_SOURCE','原会话来源不合法');
    const [frame,tab]=await Promise.all([
      api.webNavigation.getFrame({tabId:source.tabId,frameId:0}),api.tabs.get(source.tabId)]);
    if(frame?.documentId!==source.documentId||frame.url!==source.url||
      tab?.id!==source.tabId||tab.url!==source.url||tab.incognito)
      throw fail('E_BRIDGE_SOURCE','原对话文档或标签已变更');
  };
  const sidepanelSender=sender=>{
    try{
      const url=new URL(sender.url),root=new URL(api.runtime.getURL('/'));
      return sender.id===api.runtime.id&&!sender.tab&&url.origin===root.origin&&
        url.pathname==='/sidepanel.html'&&url.searchParams.has('hostInstanceId')&&
        !url.searchParams.has('scheduledRunner')&&!url.searchParams.has('toolId')&&
        !url.searchParams.has('previewId');
    }catch{return false;}
  };
  const listener=(message,sender,reply)=>{
    if(message?.protocol!==CHATGPT_BRIDGE_PROTOCOL||
      !['prepare','authorize','reserve'].includes(message.kind))return false;
    const process=async()=>{
      if(message.kind==='reserve'){
        if(!sidepanelSender(sender))throw fail('E_BRIDGE_SENDER','必须由现有可信侧边栏确认运行');
        await assertSource(message.source);
        return ledger.reserve(message);
      }
      const source=await pageSource(sender);
      if(message.kind==='prepare')return ledger.prepare(source);
      return ledger.authorize({source,requestId:message.requestId,mode:message.mode});
    };
    Promise.resolve().then(process).then(data=>reply({ok:true,data}),
      error=>reply({ok:false,error:{code:error.code||'E_BRIDGE_GATE',message:error.message||'触发验证失败'}}));
    return true;
  };
  api.runtime.onMessage.addListener(listener);
  api.webNavigation.onCommitted.addListener(event=>{
    if(event.frameId===0)void ledger.revokeSource(event.tabId).catch(()=>{});
  });
  api.webNavigation.onHistoryStateUpdated?.addListener(event=>{
    if(event.frameId===0)void ledger.revokeSource(event.tabId).catch(()=>{});
  });
  api.tabs.onRemoved.addListener(tabId=>void ledger.revokeSource(tabId).catch(()=>{}));
  api.permissions.onRemoved.addListener(()=>void ledger.revokeApprovals().catch(()=>{}));
  return ledger;
}
