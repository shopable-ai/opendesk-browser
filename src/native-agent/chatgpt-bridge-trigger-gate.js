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
const officialURL=value=>{
  try{const url=new URL(value);return url.origin==='https://chatgpt.com'&&!url.username&&!url.password;}catch{return false;}
};

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
    assertConsumed({source,requestId,mode,turnKey,answerKey}){
      requireSource(source);requireRequestId(requestId);
      return sequence(async()=>{
        const row=(await load())[requestId];
        if(!sameSource(row?.source,source)||row.status!=='consumed'||row.mode!==mode||
          row.turnKey!==turnKey||row.answerKey!==answerKey)
          throw fail('E_BRIDGE_REVOKED','本次已消费请求的来源批准已撤销或不匹配');
        return {allowed:true};
      });
    },
    revokeSource(tabId){
      if(!Number.isSafeInteger(tabId))return Promise.resolve();
      return sequence(async()=>{
        const rows=await load();
        let changed=false;
        for(const row of Object.values(rows))if(row.source?.tabId===tabId&&
          ['prepared','approved','consumed'].includes(row.status)){row.status='revoked';changed=true;}
        if(changed)await save(rows);
      });
    },
    revokeApprovals(){
      return sequence(async()=>{
        const rows=await load();
        let changed=false;
        for(const row of Object.values(rows))if(['prepared','approved','consumed'].includes(row.status)){
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
    if(!officialURL(sender.url))throw fail('E_BRIDGE_SOURCE','不是合法的官方来源');
    // MessageSender retains its injection URL across same-document history.
    // Freeze the browser-observed current URL, never the initial sender path.
    return currentSource({tabId:sender.tab.id,documentId:sender.documentId});
  };
  const currentSource=async({tabId,documentId})=>{
    const [frame,tab]=await Promise.all([
      api.webNavigation.getFrame({tabId,frameId:0}),api.tabs.get(tabId)]);
    if(frame?.documentId!==documentId||frame.documentLifecycle!=='active'||frame.errorOccurred)
      throw fail('E_BRIDGE_SOURCE','原对话主文档身份或生命周期已变更');
    if(tab?.id!==tabId||tab.url!==frame.url||tab.incognito||tab.pendingUrl)
      throw fail('E_BRIDGE_SOURCE','原对话标签地址或窗口身份已变更');
    const source={tabId,documentId,url:frame.url};
    if(!validChatGPTBridgeSource(source)||!officialURL(source.url)||
      !/^\/c\/[A-Za-z0-9-]+\/?$/.test(new URL(source.url).pathname))
      throw fail('E_BRIDGE_SOURCE','不是合法的官方对话');
    return source;
  };
  const assertSource=async source=>{
    if(!validChatGPTBridgeSource(source))throw fail('E_BRIDGE_SOURCE','原会话来源不合法');
    if(!sameSource(await currentSource(source),source))
      throw fail('E_BRIDGE_SOURCE','浏览器文档地址与请求来源不一致');
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
  let permissionEpoch=0;
  const sourceEpochs=new Map();
  const revokeTab=tabId=>{
    if(sourceEpochs.has(tabId))sourceEpochs.set(tabId,sourceEpochs.get(tabId)+1);
    void ledger.revokeSource(tabId).catch(()=>{});
  };
  const listener=(message,sender,reply)=>{
    if(message?.protocol!==CHATGPT_BRIDGE_PROTOCOL||
      !['prepare','authorize','reserve','check-consumed'].includes(message.kind))return false;
    const process=async()=>{
      if(['reserve','check-consumed'].includes(message.kind)){
        if(!sidepanelSender(sender))throw fail('E_BRIDGE_SENDER','必须由现有可信侧边栏确认运行');
        const tabId=message.source?.tabId;
        if(!sourceEpochs.has(tabId))sourceEpochs.set(tabId,0);
        const epoch=sourceEpochs.get(tabId),permissions=permissionEpoch;
        await assertSource(message.source);
        const data=await (message.kind==='reserve'?ledger.reserve(message):ledger.assertConsumed(message));
        if(epoch!==sourceEpochs.get(tabId)||permissions!==permissionEpoch)
          throw fail('E_BRIDGE_REVOKED','核验期间来源批准已失效');
        return data;
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
    if(event.frameId===0)revokeTab(event.tabId);
  });
  api.webNavigation.onHistoryStateUpdated?.addListener(event=>{
    if(event.frameId===0)revokeTab(event.tabId);
  });
  api.tabs.onRemoved.addListener(revokeTab);
  api.permissions.onRemoved.addListener(()=>{permissionEpoch++;void ledger.revokeApprovals().catch(()=>{});});
  return ledger;
}
