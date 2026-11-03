import {chatGPTConversationId,assertWebFlowReplyCandidate} from './workspace-chatgpt.js';
import {resolveToolSender} from '../environment.js';
import {toolDocumentIdentity,SIDEPANEL_DOCUMENT_PATH} from '../tool-document-url.js';
import {validateChatGPTTaskRequest,CHATGPT_TASK_REQUEST_PROTOCOL,
  FIXED_PAGE_TASK_ID,validateChatGPTTaskIntent,validateWebFlowTaskIntent} from './chatgpt-task-request.js';
import {WEBFLOW_AUTO_GRANTS_KEY,validateAutoSettings,normalizeAutoScope,assertAutoGrant}
  from '../../projects/webflow/src/auto-grants.js';
import {decodeValue} from '../platform/page-port/codec.js';

// This is a one-use *trigger fence*, not a Task permission issuer or a second
// execution Authority. The installed Task, site grants and immutable revision
// are still authorized solely by the existing Foundation Controller admission.
export const CHATGPT_BRIDGE_PROTOCOL='opendesk.chatgpt.bridge.r12.v1';
export const CHATGPT_BRIDGE_LEDGER_KEY='opendesk.chatgpt.bridge.r12.trigger-ledger.v1';
const MAX_RECORDS=512;
const MAX_CANDIDATE_RECORDS=512;
const CONVERSATION_GRANT_TTL=30*60000;
const CONVERSATION_GRANT_RUNS=10;
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
// A prepared nonce has one immutable user-selected task and parameter set.
// Older R1.2 ledger entries with no scope are only eligible for the fixed task.
function requestScope(requestId,taskId=FIXED_PAGE_TASK_ID,args={},targetUrl,installation){
  const request=validateChatGPTTaskRequest(JSON.stringify({
    protocol:CHATGPT_TASK_REQUEST_PROTOCOL,kind:'opendesk.task.request',
    version:1,requestId,taskId,args,
    ...(targetUrl!==undefined?{targetUrl}:{}),...(installation!==undefined?{installation}:{})
  }));
  return {taskId:request.taskId,args:{...request.args},
    ...(request.installation?{targetUrl:request.targetUrl,installation:{...request.installation}}:{})};
}
function candidateSnapshot(value){
  if(!plain(value)||Object.keys(value).sort().join(',')!=='answerKey,candidateId,text,turnKey'||
    typeof value.turnKey!=='string'||!value.turnKey||value.turnKey.length>128||
    typeof value.answerKey!=='string'||!value.answerKey||value.answerKey.length>2048||
    (JSON.parse(value.text).protocol==='webflow.task.intent.v1'?validateWebFlowTaskIntent(value.text):
      validateChatGPTTaskIntent(value.text)).candidateId!==value.candidateId)
    throw fail('E_BRIDGE_CONTEXT','候选身份或回答上下文不合法');
  return {candidateId:value.candidateId,text:value.text,turnKey:value.turnKey,answerKey:value.answerKey};
}
function replyBaseline(value){
  if(!plain(value)||Object.keys(value).sort().join(',')!=='answerKey,turnKey'||
    typeof value.turnKey!=='string'||!value.turnKey||value.turnKey.length>128||
    typeof value.answerKey!=='string'||!value.answerKey||value.answerKey.length>2048)
    throw fail('E_BRIDGE_CONTEXT','预批准必须绑定完整空闲回答');
  return {turnKey:value.turnKey,answerKey:value.answerKey};
}
function sameCandidate(row,candidate){
  if(!row.candidate&&!candidate)return true;
  return !!candidate&&!!row.candidate&&JSON.stringify(candidateSnapshot(row.candidate))===JSON.stringify(candidateSnapshot(candidate));
}
function sameScope(row,requestId,taskId,args,targetUrl,installation){
  const desired=requestScope(requestId,taskId,args,targetUrl,installation);
  const scope=row.scope||{taskId:FIXED_PAGE_TASK_ID,args:{}};
  // Storage may reorder dictionary keys. Validate both scopes through the same
  // strict parser before comparing their canonical task arguments.
  const stored=requestScope(requestId,scope.taskId,scope.args,scope.targetUrl,scope.installation);
  return JSON.stringify(stored)===JSON.stringify(desired);
}
const officialURL=value=>{
  try{const url=new URL(value);return url.origin==='https://chatgpt.com'&&!url.username&&!url.password;}catch{return false;}
};

// Serial admission belongs to the one MV3 service worker; persist BEFORE ACK.
// Worker restart loses no admitted/consumed decisions. An ACK lost after a
// durable write intentionally fails closed rather than replaying an effect.
export function createChatGPTBridgeTriggerLedger({storage,revocationStorage,clock=()=>Date.now(),
  generateId=()=>crypto.randomUUID()}={}){
  if(!storage?.get||!storage?.set)throw fail('E_BRIDGE_STORAGE','缺少受信持久存储');
  let pending=Promise.resolve(),revokeAll=false,revocationRevision=0;
  const revokedTabs=new Set(),revokedRequests=[];
  const sequence=task=>{
    const next=pending.then(task);
    pending=next.catch(()=>{});
    return next;
  };
  const load=async()=>{
    // Same key, separate existing Chrome session area: denial recovery only,
    // never a second grant/Authority. It survives worker suspension/recreation.
    if(revocationStorage){
      let fence;
      try{fence=(await revocationStorage.get(CHATGPT_BRIDGE_LEDGER_KEY))?.[CHATGPT_BRIDGE_LEDGER_KEY];}
      catch(error){
        if(!revokeAll&&!revokedTabs.size&&!revokedRequests.length)throw error;
        // An unreadable recovery marker may contain other denials. Persist a
        // conservative local revocation rather than skip the working store.
        revokeAll=true;
      }
      if(fence!==undefined&&fence!==null){
        if(!plain(fence)||fence.revocationFence!==1||typeof fence.all!=='boolean'||
          !Array.isArray(fence.tabIds)||!fence.tabIds.every(Number.isSafeInteger)||
          !Array.isArray(fence.requests)||!fence.requests.every(item=>plain(item)&&
            typeof item.requestId==='string'&&TOKEN.test(item.requestId)&&validChatGPTBridgeSource(item.source)))
          throw fail('E_BRIDGE_STORAGE','撤权恢复标记无法核验，禁止恢复批准');
        revokeAll ||= fence.all;
        for(const tabId of fence.tabIds)revokedTabs.add(tabId);
        for(const item of fence.requests)if(!revokedRequests.some(old=>old.requestId===item.requestId&&
          sameSource(old.source,item.source)))revokedRequests.push(item);
      }
    }
    const needsRevocation=revokeAll||revokedTabs.size||revokedRequests.length;
    const revision=revocationRevision;
    if(needsRevocation&&revocationStorage){
      try{
        await revocationStorage.set({[CHATGPT_BRIDGE_LEDGER_KEY]:{revocationFence:1,
          all:revokeAll,tabIds:[...revokedTabs],requests:structuredClone(revokedRequests)}});
      }catch{
        // Still attempt the local deny write. Either successful store can carry
        // the revocation across restart; simultaneous failure cannot be proven.
      }
    }
    const value=(await storage.get(CHATGPT_BRIDGE_LEDGER_KEY))?.[CHATGPT_BRIDGE_LEDGER_KEY];
    const rows=plain(value)?structuredClone(value):{};
    if(needsRevocation){
      for(const [requestId,row] of Object.entries(rows))if((revokeAll||revokedTabs.has(row?.source?.tabId)||
        revokedRequests.some(item=>(item.requestId===requestId||item.requestId===row?.conversationGrantId)&&
          sameSource(row?.source,item.source)))&&
        ['prepared','approved','consumed'].includes(row?.status))row.status='revoked';
      // Persist denial before clearing the recovery marker. Any failed write
      // keeps the in-worker fence; a successful session marker also fences a
      // new worker. Never ACK a revocation that is only held in memory.
      await storage.set({[CHATGPT_BRIDGE_LEDGER_KEY]:rows});
      if(revision===revocationRevision){
        if(revocationStorage)await revocationStorage.set({[CHATGPT_BRIDGE_LEDGER_KEY]:null});
        if(revision===revocationRevision){revokeAll=false;revokedTabs.clear();revokedRequests.length=0;}
      }
    }
    return rows;
  };
  const save=rows=>storage.set({[CHATGPT_BRIDGE_LEDGER_KEY]:rows});
  let autoDenialRevision=0,autoDenied=false;
  const readAutoFence=async()=>{
    const fence=revocationStorage?(await revocationStorage.get(WEBFLOW_AUTO_GRANTS_KEY))?.[WEBFLOW_AUTO_GRANTS_KEY]:null;
    if(fence!=null&&(!plain(fence)||fence.denied!==true||!Array.isArray(fence.revokedTaskIds)||
      !fence.revokedTaskIds.every(id=>typeof id==='string')))
      throw fail('E_WEBFLOW_AUTO_UNKNOWN','自动撤权恢复标记无法核验');
    return fence;
  };
  const applyAutoFence=(settings,fence)=>{
    if(fence?.allRevoked)for(const row of Object.values(settings.grants))row.state='revoked';
    for(const taskId of fence?.revokedTaskIds||[])if(Object.hasOwn(settings.grants,taskId))settings.grants[taskId].state='revoked';
  };
  const loadAuto=async()=>{
    const fence=await readAutoFence();
    const settings=validateAutoSettings((await storage.get(WEBFLOW_AUTO_GRANTS_KEY))?.[WEBFLOW_AUTO_GRANTS_KEY]);
    applyAutoFence(settings,fence);
    if(autoDenied||fence!=null){settings.enabled=false;settings.diagnostic='撤权恢复栅栏有效；需在可信设置重新审阅';}
    return settings;
  };
  const checkAuto=async row=>{
    if(!row.autoGrantId)return;
    const ticket=autoDenialRevision;
    assertAutoGrant(await loadAuto(),row.scope,{grantId:row.autoGrantId,epoch:row.autoEpoch});
    if(autoDenied||ticket!==autoDenialRevision)throw fail('E_WEBFLOW_AUTO_DENIED','持续批准已撤销');
  };
  const stableJSON=value=>JSON.stringify(value,(_key,item)=>plain(item)?
    Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
  const changeAuto=(update,{deny=false,recover=false,taskId,expectedDenialRevision=autoDenialRevision}={})=>{
    if(deny){autoDenied=true;autoDenialRevision++;}
    return sequence(async()=>{
      const ticket=autoDenialRevision;
      if(!deny&&ticket!==expectedDenialRevision)throw fail('E_WEBFLOW_AUTO_DENIED','该启用或批准操作早于最近撤权');
      let previousFence;
      try{previousFence=await readAutoFence();}catch(error){
        if(!deny)throw error;
        // An unreadable session marker may contain other denials. Persist a
        // conservative local shutdown even when the session area is broken.
        previousFence={denied:true,revokedTaskIds:[],allRevoked:true};
      }
      const fence=deny?{denied:true,revokedTaskIds:[...new Set([...(previousFence?.revokedTaskIds||[]),...(taskId?[taskId]:[])])],
        ...(previousFence?.allRevoked?{allRevoked:true}:{})}:previousFence;
      // Denial marker survives a failed local write and a replacement worker.
      if(deny&&revocationStorage){
        try{await revocationStorage.set({[WEBFLOW_AUTO_GRANTS_KEY]:fence});}catch{/* Still persist local denial below. */}
      }
      const settings=validateAutoSettings((await storage.get(WEBFLOW_AUTO_GRANTS_KEY))?.[WEBFLOW_AUTO_GRANTS_KEY]);
      applyAutoFence(settings,fence);
      if(deny&&previousFence){settings.enabled=false;}
      const pendingRows=await update(settings);settings.epoch++;
      if(!deny&&ticket!==autoDenialRevision)throw fail('E_WEBFLOW_AUTO_DENIED','写入前持续批准已撤销');
      await storage.set({[WEBFLOW_AUTO_GRANTS_KEY]:settings,
        ...(pendingRows?{[CHATGPT_BRIDGE_LEDGER_KEY]:pendingRows}:{})});
      const confirmed=validateAutoSettings((await storage.get(WEBFLOW_AUTO_GRANTS_KEY))?.[WEBFLOW_AUTO_GRANTS_KEY]);
      if(stableJSON(confirmed)!==stableJSON(settings)||ticket!==autoDenialRevision)
        throw fail('E_WEBFLOW_AUTO_UNKNOWN','批准写入回执不明；禁止自动准入');
      if(pendingRows&&stableJSON(await load())!==stableJSON(pendingRows))
        throw fail('E_WEBFLOW_AUTO_UNKNOWN','本次候选批准回执不明，禁止重试');
      if(deny||recover){
        if(revocationStorage){
          try{await revocationStorage.set({[WEBFLOW_AUTO_GRANTS_KEY]:null});}
          catch(error){if(!deny)throw error;} // Local denial is already confirmed durable.
        }
        if(ticket===autoDenialRevision)autoDenied=false;
      }
      return confirmed;
    });
  };
  const prune=(rows,now)=>{
    for(const [key,row] of Object.entries(rows))
      if(!row?.candidate&&(!plain(row)||!Number.isFinite(row.createdAt)||
        now-row.createdAt>7*86400000))delete rows[key];
    // Independent candidates are replay tombstones: expiry/restart must not make them reusable.
    // A live parent also fences duplicate approval after a lost ACK; ordinary
    // request churn must not erase that fence before its fixed expiry.
    const sorted=Object.keys(rows).filter(key=>!rows[key].candidate&&
      !(rows[key].kind==='conversation-grant'&&rows[key].status==='approved'&&now<rows[key].expiresAt))
      .sort((a,b)=>(rows[a].createdAt||0)-(rows[b].createdAt||0));
    for(const key of sorted.slice(0,Math.max(0,sorted.length-MAX_RECORDS)))delete rows[key];
  };
  const requireSource=source=>{
    if(!validChatGPTBridgeSource(source))throw fail('E_BRIDGE_SOURCE','原对话来源身份不合法');
  };
  const requireRequestId=requestId=>{
    if(typeof requestId!=='string'||!TOKEN.test(requestId))throw fail('E_BRIDGE_REQUEST','请求身份不合法');
  };
  const requireConversationGrant=(rows,grantId,source,scope,now,allocate=true)=>{
    requireRequestId(grantId);
    const grant=rows[grantId];
    if(grant?.kind!=='conversation-grant'||grant.status!=='approved'||
      !sameSource(grant.source,source)||!Number.isFinite(grant.expiresAt)||now>=grant.expiresAt||
      !Number.isSafeInteger(grant.remainingRuns)||grant.remainingRuns<0||
      grant.remainingRuns>CONVERSATION_GRANT_RUNS||allocate&&grant.remainingRuns===0)
      throw fail('E_BRIDGE_APPROVAL','当前聊天许可已失效、撤销或次数不足');
    if(!scope?.installation||!grant.scope?.installation||
      !sameScope(grant,grantId,scope.taskId,{},scope.targetUrl,scope.installation))
      throw fail('E_BRIDGE_CONTEXT','当前聊天许可与任务、精确目标或安装快照不匹配');
    return grant;
  };
  const requireConversationCandidate=(candidate,scope)=>{
    candidate=candidateSnapshot(candidate);
    const intent=validateChatGPTTaskIntent(candidate.text);
    // Host schema normalization can fill defaults absent in the original intent.
    if(intent.taskId!==scope.taskId||intent.targetUrl!==scope.targetUrl)
      throw fail('E_BRIDGE_CONTEXT','候选与本次任务或精确目标不匹配');
    return candidate;
  };
  const approveFromConversation=(row,grant,grantId,now)=>{
    grant.remainingRuns--;
    row.status='approved';row.mode='auto';row.approvedAt=now;row.conversationGrantId=grantId;
    row.approvalExpiresAt=Math.min(row.expiresAt,grant.expiresAt,now+300000);
  };
  return Object.freeze({
    // Generic Foundation submission guard: the request ID identifies the
    // existing row, never grants execution permission. Hold the same queue as
    // revocation THROUGH the original Authority admission; no stale page ACK
    // can submit a new run after a completed revoke.
    async withControllerAdmission(request,submit,verify=async()=>{}){
      // Classify by the durable row before consulting Bridge-only session
      // recovery. A broken Bridge fence must not block known unrelated runs.
      const existing=(await storage.get(CHATGPT_BRIDGE_LEDGER_KEY))?.[CHATGPT_BRIDGE_LEDGER_KEY];
      if(existing!==undefined&&!plain(existing))throw fail('E_BRIDGE_STORAGE','无法核实提交请求归属');
      if(!existing||!Object.hasOwn(existing,request?.requestId))return submit();
      if(!plain(existing[request.requestId]))throw fail('E_BRIDGE_STORAGE','提交请求记录无法核实');
      if(existing[request.requestId].pendingAuto&&!existing[request.requestId].autoGrantId)
        throw fail('E_BRIDGE_APPROVAL','本次候选尚待精确批准，未执行');
      if(!existing[request.requestId].autoGrantId)return submit();
      return sequence(async()=>{
        const rows=await load(),row=rows[request?.requestId];
        if(!row?.autoGrantId)throw fail('E_BRIDGE_STORAGE','自动提交记录消失，禁止运行');
        await verify(row);
        if(row.status!=='consumed'||row.controllerSubmitted)
          throw fail('E_BRIDGE_REPLAY','本次自动请求已撤销、已提交或结果未知');
        const scope=row.scope,pin=request.source||request;
        const args=decodeValue(request.paramsWire);
        const canonical=requestScope(request.requestId,scope.taskId,args,scope.targetUrl,scope.installation);
        if(pin.kind!=='saved'||pin.scriptId!==scope.installation.scriptId||pin.revision!==scope.installation.revision||
          pin.contentHash!==scope.installation.contentHash||request.target?.mode!=='owned'||
          request.target.url!==scope.targetUrl||request.expectedTaskGeneration!==scope.installation.generation||
          request.expectedTaskInstallationId!==scope.installation.installationId||
          JSON.stringify(canonical)!==JSON.stringify(requestScope(request.requestId,scope.taskId,scope.args,scope.targetUrl,scope.installation)))
          throw fail('E_BRIDGE_CONTEXT','实际 Controller 提交与持续批准范围不同');
        await checkAuto(row);
        row.controllerSubmitted=true;await save(rows);await checkAuto(row);
        const finalAutoEpoch=autoDenialRevision;
        const finalCheck=await verify(row);
        if(autoDenied||finalAutoEpoch!==autoDenialRevision)
          throw fail('E_WEBFLOW_AUTO_DENIED','最终回答核验期间持续批准已撤销');
        if(revokeAll||revokedTabs.has(row.source.tabId)||
          revokedRequests.some(item=>item.requestId===request.requestId&&sameSource(row.source,item.source)))
          throw fail('E_BRIDGE_REVOKED','最终提交前原文档或本次请求已撤销');
        finalCheck?.();
        return submit();
      });
    },
    readAutoSettings(){return sequence(loadAuto);},
    captureAutoDenialEpoch(){return autoDenialRevision;},
    setAutoEnabled(enabled,{expectedDenialRevision}={}){
      if(typeof enabled!=='boolean')throw fail('E_BRIDGE_SCHEMA','自动开关必须为布尔值');
      return changeAuto(state=>{state.enabled=enabled;},{deny:!enabled,recover:enabled,expectedDenialRevision});
    },
    approveAuto(value,{expectedDenialRevision,pendingRequest}={}){
      const scope=normalizeAutoScope(value);
      return changeAuto(async state=>{
        let rows,row;
        if(pendingRequest){
          requireSource(pendingRequest.source);requireRequestId(pendingRequest.requestId);
          rows=await load();row=rows[pendingRequest.requestId];
          if(!state.enabled||!sameSource(row?.source,pendingRequest.source)||!row.pendingAuto||
            row.status!=='prepared'||clock()>=row.expiresAt)
            throw fail('E_BRIDGE_APPROVAL','待批准候选已取消、失效或已处理，未执行');
          if(!sameCandidate(row,pendingRequest.candidate)||
            stableJSON(row.scope)!==stableJSON(scope))
            throw fail('E_BRIDGE_CONTEXT','审阅的候选、来源或精确安装范围已改变');
        }
        if(!Object.hasOwn(state.grants,scope.taskId)&&Object.keys(state.grants).length>=128)
          throw fail('E_BRIDGE_LIMIT','持续批准记录已满');
        state.grants[scope.taskId]={scope,grantId:generateId(),state:'active',approvedAt:clock()};
        if(row){
          row.status='approved';row.mode='auto';row.approvedAt=clock();
          row.approvalExpiresAt=row.expiresAt;row.autoGrantId=state.grants[scope.taskId].grantId;
          row.autoEpoch=state.epoch+1;
        }
        return rows;
      },{expectedDenialRevision});
    },
    revokeAuto(taskId){
      if(typeof taskId!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,59}$/u.test(taskId))
        throw fail('E_BRIDGE_SCHEMA','撤销必须指定准确任务 ID');
      return changeAuto(state=>{if(Object.hasOwn(state.grants,taskId))state.grants[taskId].state='revoked';},{deny:true,taskId});
    },
    admitAuto({source,candidate,allowPending=false,...value}){
      requireSource(source);candidate=candidateSnapshot(candidate);
      const intent=validateWebFlowTaskIntent(candidate.text),scope=normalizeAutoScope(value);
      if(intent.taskId!==scope.taskId||intent.targetUrl!==scope.targetUrl||
        JSON.stringify(intent.args)!==JSON.stringify(scope.args))throw fail('E_BRIDGE_CONTEXT','候选与批准范围不同');
      return sequence(async()=>{
        const ticket=autoDenialRevision,settings=await loadAuto();
        let grant;
        try{grant=assertAutoGrant(settings,scope);}catch(error){
          if(!allowPending||!settings.enabled||error.code!=='E_WEBFLOW_AUTO_DENIED')throw error;
        }
        const rows=await load(),now=clock();prune(rows,now);
        if(Object.values(rows).some(row=>row.candidate?.candidateId===candidate.candidateId))
          throw fail('E_BRIDGE_REPLAY','候选已准入或结果未知，禁止重放');
        if(Object.values(rows).filter(row=>row.candidate).length>=MAX_CANDIDATE_RECORDS)
          throw fail('E_BRIDGE_LIMIT','候选防重放记录已满');
        const requestId=generateId();requireRequestId(requestId);
        if(rows[requestId]||requestId===candidate.candidateId)throw fail('E_BRIDGE_REPLAY','请求身份冲突');
        const row=rows[requestId]={source:structuredClone(source),scope,candidate,createdAt:now,
          expiresAt:now+600000,...(grant?{approvalExpiresAt:now+600000,approvedAt:now,status:'approved',mode:'auto',
          autoGrantId:grant.grantId,autoEpoch:settings.epoch}:{status:'prepared',pendingAuto:true})};
        await checkAuto(row);await save(rows);
        if(ticket!==autoDenialRevision)throw fail('E_WEBFLOW_AUTO_DENIED','准入期间批准已撤销');
        return {requestId,source:structuredClone(source),...structuredClone(scope),candidate:structuredClone(candidate),
          persistentAuto:true,pendingApproval:!grant,expiresAt:row.expiresAt};
      });
    },
    approveConversation(source,{taskId,targetUrl,installation}={}){
      requireSource(source);
      return sequence(async()=>{
        const rows=await load(),now=clock();prune(rows,now);
        if(Object.values(rows).some(row=>row.kind==='conversation-grant'&&sameSource(row.source,source)&&
          row.status==='approved'&&now<row.expiresAt))
          throw fail('E_BRIDGE_REPLAY','当前聊天许可仍有效，禁止重复授权');
        const grantId=generateId();requireRequestId(grantId);
        if(rows[grantId])throw fail('E_BRIDGE_REPLAY','随机许可身份出现冲突');
        // Structural validation only. The trusted Host validates the installed
        // task schema for each candidate; a grant never fixes one args value.
        const scope=requestScope(grantId,taskId,{},targetUrl,installation);
        if(!scope.installation)throw fail('E_BRIDGE_CONTEXT','聊天许可必须固定安装身份和精确目标');
        rows[grantId]={kind:'conversation-grant',source:structuredClone(source),scope,
          createdAt:now,expiresAt:now+CONVERSATION_GRANT_TTL,status:'approved',
          remainingRuns:CONVERSATION_GRANT_RUNS,parameterPolicy:'installed-schema'};
        await save(rows);
        return {grantId,source:structuredClone(source),taskId:scope.taskId,targetUrl:scope.targetUrl,
          installation:structuredClone(scope.installation),expiresAt:rows[grantId].expiresAt,
          remainingRuns:CONVERSATION_GRANT_RUNS,parameterPolicy:'installed-schema'};
      });
    },
    authorizeConversation({source,requestId,grantId,taskId,args,targetUrl,installation,candidate}){
      requireSource(source);requireRequestId(requestId);
      return sequence(async()=>{
        const rows=await load(),row=rows[requestId],now=clock();
        if(!sameSource(row?.source,source)||row.status!=='prepared'||!row.candidate||now>=row.expiresAt)
          throw fail('E_BRIDGE_APPROVAL','候选请求已失效或已批准，禁止重复授权');
        if(!sameCandidate(row,candidate)||!sameScope(row,requestId,taskId,args,targetUrl,installation))
          throw fail('E_BRIDGE_CONTEXT','候选或采用的安装范围不匹配');
        requireConversationCandidate(candidate,row.scope);
        const grant=requireConversationGrant(rows,grantId,source,row.scope,now);
        approveFromConversation(row,grant,grantId,now);
        await save(rows);
        return {requestId,mode:'auto',expiresAt:row.approvalExpiresAt,remainingRuns:grant.remainingRuns};
      });
    },
    preapproveNext(source,{taskId,args,targetUrl,installation,baseline}={}){
      requireSource(source);baseline=replyBaseline(baseline);
      return sequence(async()=>{
        const rows=await load(),now=clock();prune(rows,now);
        if(Object.values(rows).some(row=>sameSource(row.source,source)&&row.baseline&&
          row.status==='approved'&&now<row.approvalExpiresAt))
          throw fail('E_BRIDGE_REPLAY','当前预批准仍待绑定或消费，禁止重复授权');
        const requestId=generateId();requireRequestId(requestId);
        if(rows[requestId])throw fail('E_BRIDGE_REPLAY','随机请求身份出现冲突');
        const scope=requestScope(requestId,taskId,args,targetUrl,installation);
        if(!scope.installation)throw fail('E_BRIDGE_CONTEXT','预批准必须固定安装身份和精确目标');
        for(const row of Object.values(rows))if(row.kind!=='conversation-grant'&&sameSource(row.source,source)&&
          ['prepared','approved'].includes(row.status))row.status='revoked';
        rows[requestId]={source:structuredClone(source),scope,baseline,createdAt:now,
          expiresAt:now+300000,approvalExpiresAt:now+300000,approvedAt:now,status:'approved',mode:'auto'};
        prune(rows,now);await save(rows);
        return {requestId,source:structuredClone(source),...structuredClone(scope),
          baseline:structuredClone(baseline),expiresAt:now+300000};
      });
    },
    bindPreapproved({source,requestId,candidate,taskId,args,targetUrl,installation}){
      requireSource(source);requireRequestId(requestId);candidate=candidateSnapshot(candidate);
      return sequence(async()=>{
        const rows=await load(),row=rows[requestId],now=clock();
        if(!sameSource(row?.source,source)||!row.baseline||row.status!=='approved'||
          row.mode!=='auto'||row.candidate||now>=row.approvalExpiresAt)
          throw fail('E_BRIDGE_REPLAY','预批准已失效、已绑定或结果未知，禁止重放');
        const baseline=replyBaseline(row.baseline),intent=validateChatGPTTaskIntent(candidate.text);
        if(candidate.turnKey===baseline.turnKey||candidate.answerKey===baseline.answerKey||
          !sameScope(row,requestId,taskId,args,targetUrl,installation)||
          intent.taskId!==row.scope.taskId||intent.targetUrl!==row.scope.targetUrl)
          throw fail('E_BRIDGE_CONTEXT','候选不是新轮次或与精确预批准范围不同');
        if(candidate.candidateId===requestId||Object.values(rows).some(other=>
          other.candidate?.candidateId===candidate.candidateId&&
          chatGPTConversationId(other.source?.url)===chatGPTConversationId(source.url)))
          throw fail('E_BRIDGE_REPLAY','同一对话候选已绑定，禁止重放');
        if(Object.values(rows).filter(other=>other.candidate).length>=MAX_CANDIDATE_RECORDS)
          throw fail('E_BRIDGE_LIMIT','候选防重放记录已满');
        row.candidate=candidate;await save(rows);
        return {requestId,source:structuredClone(source),...structuredClone(row.scope),
          baseline:structuredClone(baseline),candidate:structuredClone(candidate),expiresAt:row.approvalExpiresAt};
      });
    },
    prepare(source,{taskId=FIXED_PAGE_TASK_ID,args={},targetUrl,installation,candidate,conversationGrantId}={}){
      requireSource(source);
      return sequence(async()=>{
        const rows=await load(),now=clock();
        prune(rows,now);
        candidate=candidate?candidateSnapshot(candidate):undefined;
        if(candidate&&Object.values(rows).some(row=>row.candidate?.candidateId===candidate.candidateId&&
          chatGPTConversationId(row.source?.url)===chatGPTConversationId(source.url)))
          throw fail('E_BRIDGE_REPLAY','该对话候选已采用，结果未知或已消费时禁止生成新请求');
        // Candidate tombstones have their own quota; ordinary requests keep bounded eviction.
        if(candidate&&Object.values(rows).filter(row=>row.candidate).length>=MAX_CANDIDATE_RECORDS)
          throw fail('E_BRIDGE_LIMIT','候选防重放记录已满，不能采用新候选；普通请求仍可建立');
        const requestId=generateId();
        requireRequestId(requestId);
        if(rows[requestId]||requestId===candidate?.candidateId)throw fail('E_BRIDGE_REPLAY','随机请求身份出现冲突');
        const scope=requestScope(requestId,taskId,args,targetUrl,installation);
        let grant;
        if(conversationGrantId!==undefined){
          grant=requireConversationGrant(rows,conversationGrantId,source,scope,now);
          candidate=requireConversationCandidate(candidate,scope);
        }
        for(const row of Object.values(rows))
          if(row.kind!=='conversation-grant'&&sameSource(row.source,source)&&
            ['prepared','approved'].includes(row.status))row.status='revoked';
        rows[requestId]={source:structuredClone(source),scope,...(candidate?{candidate}:{}),createdAt:now,
          expiresAt:now+600000,status:'prepared'};
        if(grant)approveFromConversation(rows[requestId],grant,conversationGrantId,now);
        prune(rows,now);
        await save(rows);
        return {requestId,expiresAt:rows[requestId].expiresAt,source:structuredClone(source),
          ...structuredClone(scope),...(candidate?{candidate:structuredClone(candidate)}:{}),
          ...(grant?{mode:'auto',conversationGrantId,remainingRuns:grant.remainingRuns}:{})};
      });
    },
    authorize({source,requestId,mode,candidate,taskId,args,targetUrl,installation}){
      requireSource(source);requireRequestId(requestId);
      if(!['manual','auto'].includes(mode))throw fail('E_BRIDGE_MODE','触发模式不合法');
      return sequence(async()=>{
        const rows=await load(),row=rows[requestId],now=clock();
        if(!sameSource(row?.source,source)||row.status!=='prepared'||now>=row.expiresAt)
          throw fail('E_BRIDGE_APPROVAL','请求已失效或已批准，不会重新授权');
        if(!sameCandidate(row,candidate)||row.candidate&&!sameScope(row,requestId,taskId,args,targetUrl,installation))
          throw fail('E_BRIDGE_CONTEXT','候选或采用的安装范围不匹配');
        row.status='approved';row.mode=mode;row.approvedAt=now;
        row.approvalExpiresAt=Math.min(row.expiresAt,now+(mode==='auto'?300000:120000));
        await save(rows);
        return {mode,requestId,expiresAt:row.approvalExpiresAt};
      });
    },
    reserve({source,requestId,mode,turnKey,answerKey,taskId=FIXED_PAGE_TASK_ID,args={},targetUrl,installation,candidate}){
      requireSource(source);requireRequestId(requestId);
      if(!['manual','auto'].includes(mode)||typeof turnKey!=='string'||!turnKey||
        typeof answerKey!=='string'||!answerKey||answerKey.length>2048||turnKey.length>128)
        throw fail('E_BRIDGE_CONTEXT','回答版本或触发范围不合法');
      return sequence(async()=>{
        const rows=await load(),row=rows[requestId],now=clock();
        if(!sameSource(row?.source,source)||row.status!=='approved'||row.mode!==mode||
          now>=row.approvalExpiresAt)
          throw fail('E_BRIDGE_REPLAY','没有当前轮次的一次性批准，或批准已消费／失效');
        if(row.baseline&&!row.candidate||!sameCandidate(row,candidate)||row.candidate&&(row.candidate.turnKey!==turnKey||row.candidate.answerKey!==answerKey)||!sameScope(row,requestId,taskId,args,targetUrl,installation))
          throw fail('E_BRIDGE_CONTEXT','模型请求与用户建立的任务、参数、目标或安装快照不一致');
        await checkAuto(row);
        if(row.conversationGrantId!==undefined)
          requireConversationGrant(rows,row.conversationGrantId,source,row.scope,now,false);
        row.status='consumed';row.consumedAt=now;row.turnKey=turnKey;row.answerKey=answerKey;
        await save(rows);
        await checkAuto(row);
        return {requestId,consumed:true,mode};
      });
    },
    assertConsumed({source,requestId,mode,turnKey,answerKey,taskId=FIXED_PAGE_TASK_ID,args={},targetUrl,installation,candidate}){
      requireSource(source);requireRequestId(requestId);
      return sequence(async()=>{
        const rows=await load(),row=rows[requestId];
        if(!sameSource(row?.source,source)||row.status!=='consumed'||row.mode!==mode||
          row.turnKey!==turnKey||row.answerKey!==answerKey||!sameCandidate(row,candidate)||
          !sameScope(row,requestId,taskId,args,targetUrl,installation))
          throw fail('E_BRIDGE_REVOKED','本次已消费请求的来源批准已撤销或不匹配');
        await checkAuto(row);
        if(row.conversationGrantId!==undefined)
          requireConversationGrant(rows,row.conversationGrantId,source,row.scope,clock(),false);
        return {allowed:true};
      });
    },
    revokeRequest({source,requestId}){
      requireSource(source);requireRequestId(requestId);
      revokedRequests.push({requestId,source:structuredClone(source)});revocationRevision++;
      return sequence(async()=>{
        const rows=await load(),row=rows[requestId];
        if(!sameSource(row?.source,source)||
          !['prepared','approved','consumed','revoked'].includes(row.status))
          throw fail('E_BRIDGE_REQUEST','没有与原对话精确匹配的请求身份');
        if(row.status!=='revoked'){
          row.status='revoked';
          await save(rows);
        }
        return {requestId,revoked:true};
      });
    },
    revokeSource(tabId){
      if(!Number.isSafeInteger(tabId))return Promise.resolve();
      revokedTabs.add(tabId);revocationRevision++;
      return sequence(async()=>{
        const rows=await load();
        let changed=false;
        for(const row of Object.values(rows))if(row.source?.tabId===tabId&&
          ['prepared','approved','consumed'].includes(row.status)){row.status='revoked';changed=true;}
        if(changed)await save(rows);
      });
    },
    revokeApprovals(){
      revokeAll=true;revocationRevision++;
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
  const ledger=createChatGPTBridgeTriggerLedger({storage:api.storage.local,
    revocationStorage:api.storage.session,clock});
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
      !/^(?:\/g\/g-p-[A-Za-z0-9-]+)?\/c\/[A-Za-z0-9-]+\/?$/.test(new URL(source.url).pathname))
      throw fail('E_BRIDGE_SOURCE','不是合法的官方对话');
    return source;
  };
  const assertSource=async source=>{
    if(!validChatGPTBridgeSource(source))throw fail('E_BRIDGE_SOURCE','原会话来源不合法');
    if(!sameSource(await currentSource(source),source))
      throw fail('E_BRIDGE_SOURCE','浏览器文档地址与请求来源不一致');
  };
  const sidepanelSender=sender=>{
    const route=toolDocumentIdentity(api.runtime.getURL(SIDEPANEL_DOCUMENT_PATH),sender?.url);
    return sender?.id===api.runtime.id&&!sender.tab&&
      (sender.frameId===undefined||sender.frameId===0)&&
      (!sender.documentLifecycle||sender.documentLifecycle==='active')&&
      !!route?.hostInstanceId&&!route.hasLocator;
  };
  const actualSidepanel=async sender=>{
    if(!sidepanelSender(sender)||!api.runtime.getContexts)
      throw fail('E_BRIDGE_SENDER','自动授权仅允许真实可信 Side Panel');
    let resolved;
    try{resolved=Object.freeze({...await resolveToolSender(api,sender)});}
    catch{throw fail('E_BRIDGE_SENDER','无法唯一核对真实 Side Panel 文档');}
    const contexts=await api.runtime.getContexts({contextTypes:['SIDE_PANEL'],documentIds:[resolved.documentId]});
    if(contexts.length!==1||contexts[0].contextType!=='SIDE_PANEL'||
      contexts[0].documentId!==resolved.documentId||contexts[0].documentUrl!==resolved.url||
      contexts[0].frameId!==0||contexts[0].incognito)
      throw fail('E_BRIDGE_SENDER','不是当前唯一真实 Side Panel 文档');
    return resolved;
  };
  // Reuse the original submission guard. The immutable durable candidate is
  // read again after all guard writes, so a changed reply cannot spend a grant.
  const withControllerAdmission=(request,sender,submit)=>{
    const permissions=permissionEpoch;
    let panel;
    return ledger.withControllerAdmission(request,submit,async row=>{
      const tabId=row.source.tabId;
      if(!sourceEpochs.has(tabId))sourceEpochs.set(tabId,0);
      const epoch=sourceEpochs.get(tabId);
      panel=await actualSidepanel(panel||sender);
      await assertSource(row.source);
      await assertWebFlowReplyCandidate(api,row.source,row.candidate);
      return ()=>{
        if(permissions!==permissionEpoch||epoch!==sourceEpochs.get(tabId))
          throw fail('E_BRIDGE_REVOKED','最终回答核验期间来源或权限已改变');
      };
    });
  };
  let permissionEpoch=0;
  const sourceEpochs=new Map();
  const revokeTab=tabId=>{
    if(sourceEpochs.has(tabId))sourceEpochs.set(tabId,sourceEpochs.get(tabId)+1);
    void ledger.revokeSource(tabId).catch(()=>{});
  };
  const listener=(message,sender,reply)=>{
    if(message?.protocol!==CHATGPT_BRIDGE_PROTOCOL||
      !['prepare','authorize','revoke-request','reserve','check-consumed','preapprove-next','bind-preapproved',
        'auto-settings','auto-enable','auto-grant','auto-revoke','auto-admit',
        'approve-conversation','authorize-conversation'].includes(message.kind))return false;
    const receivedAutoEpoch=ledger.captureAutoDenialEpoch();
    const process=async()=>{
      if(['auto-settings','auto-enable','auto-grant','auto-revoke','auto-admit'].includes(message.kind)){
        const panel=await actualSidepanel(sender);
        if(message.kind==='auto-settings')return ledger.readAutoSettings();
        if(message.kind==='auto-enable')return ledger.setAutoEnabled(message.enabled,{expectedDenialRevision:receivedAutoEpoch});
        if(message.kind==='auto-grant'){
          if(message.pendingRequest){
            await assertSource(message.pendingRequest.source);
            await assertWebFlowReplyCandidate(api,message.pendingRequest.source,message.pendingRequest.candidate);
          }
          return ledger.approveAuto(message.scope,{expectedDenialRevision:receivedAutoEpoch,pendingRequest:message.pendingRequest});
        }
        if(message.kind==='auto-revoke')return ledger.revokeAuto(message.taskId);
        const permissions=permissionEpoch,tabId=message.source?.tabId;
        if(!sourceEpochs.has(tabId))sourceEpochs.set(tabId,0);
        const epoch=sourceEpochs.get(tabId);
        await assertSource(message.source);
        const data=await ledger.admitAuto(message);
        await assertSource(message.source);
        await actualSidepanel(panel);
        if(epoch!==sourceEpochs.get(tabId)||permissions!==permissionEpoch)
          throw fail('E_BRIDGE_REVOKED','自动准入期间来源或权限已改变');
        return data;
      }
      if(['reserve','check-consumed','preapprove-next','bind-preapproved','approve-conversation',
        'authorize-conversation'].includes(message.kind)||message.candidate||
        message.conversationGrantId!==undefined||message.kind==='revoke-request'&&sidepanelSender(sender)){
        if(!sidepanelSender(sender))throw fail('E_BRIDGE_SENDER','必须由现有可信侧边栏确认运行');
        const tabId=message.source?.tabId;
        if(!sourceEpochs.has(tabId))sourceEpochs.set(tabId,0);
        const epoch=sourceEpochs.get(tabId),permissions=permissionEpoch;
        await assertSource(message.source);
        if(epoch!==sourceEpochs.get(tabId)||permissions!==permissionEpoch)
          throw fail('E_BRIDGE_REVOKED','核验期间来源批准已失效');
        const data=await (message.kind==='approve-conversation'?ledger.approveConversation(message.source,message):
          message.kind==='authorize-conversation'?ledger.authorizeConversation(message):
          message.kind==='preapprove-next'?ledger.preapproveNext(message.source,message):
          message.kind==='bind-preapproved'?ledger.bindPreapproved(message):
          message.kind==='revoke-request'?ledger.revokeRequest(message):message.kind==='prepare'?ledger.prepare(message.source,message):
          message.kind==='authorize'?ledger.authorize(message):
          message.kind==='reserve'?ledger.reserve(message):ledger.assertConsumed(message));
        if(epoch!==sourceEpochs.get(tabId)||permissions!==permissionEpoch)
          throw fail('E_BRIDGE_REVOKED','核验期间来源批准已失效');
        return data;
      }
      const source=await pageSource(sender);
      if(message.kind==='revoke-request')return ledger.revokeRequest({source,requestId:message.requestId});
      if(message.kind==='prepare')return ledger.prepare(source,{
        taskId:message.taskId??FIXED_PAGE_TASK_ID,args:message.args??{},
        targetUrl:message.targetUrl,installation:message.installation
      });
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
  api.permissions.onRemoved.addListener(()=>{permissionEpoch++;void ledger.revokeApprovals().catch(()=>{});
    void ledger.setAutoEnabled(false).catch(()=>{});});
  return Object.freeze({...ledger,withControllerAdmission});
}
