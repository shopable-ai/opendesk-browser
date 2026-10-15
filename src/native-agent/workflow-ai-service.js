import {observeControllerTarget} from '../platform/target/index.js';
import {AGENT_MAX_BYTES} from './protocol.js';
import {WORKFLOW_AI_PROTOCOL,validateWorkflowAIRequest,workflowAIError,workflowAIBytes,workflowAIId,unavailableWorkflowAI} from './workflow-ai-protocol.js';

// A bounded reverse protocol on the existing authenticated Native Port. No DOM,
// Controller, model execution or second durable result store lives here.
export function createWorkflowAIService({api,hostPorts,connection,enable,refresh,timeoutMs=35000}) {
  const owners=new Map(),pending=new Map(),consumed=new Map(),epochs=new WeakMap();
  const retireEpoch=host=>epochs.set(host,(epochs.get(host)||0)+1);
  const live=host=>[...hostPorts.values()].includes(host)&&typeof host.registrationId==='string';
  function state() {
    const c=connection();
    const value=!c.enabled?'NATIVE_PERMISSION_REQUIRED':!c.ready?'HOST_NOT_PAIRED':
      c.workflowAiVersion!==1?'CODEX_UNSUPPORTED':'NATIVE_CONNECTED';
    return {...unavailableWorkflowAI(value),nativeConnected:Boolean(c.ready),enabled:Boolean(c.enabled),
      protocolAvailable:c.workflowAiVersion===1&&Boolean(c.ready),connecting:Boolean(c.enabled&&c.port&&!c.ready)};
  }
  const send=(host,data)=>{if(live(host))try{host.postMessage({protocol:WORKFLOW_AI_PROTOCOL,registrationId:host.registrationId,...data});}catch{}};
  function publish(){const value=state();for(const host of hostPorts.values())send(host,{type:'native-agent.ai.state',state:value});}
  function ownerFor(host,c) {
    let owner=owners.get(host);
    if(!owner||owner.generation!==c.generation) {
      owner={ownerId:crypto.randomUUID(),registrationId:host.registrationId,generation:c.generation,sessions:new Set(),activeSessions:new Set(),turnTargets:new Map(),host};
      owners.set(host,owner);
    }
    return owner;
  }
  function wire(owner,method,params,sessionId,requestId=crypto.randomUUID()) {
    if(method==='ai.approval.answer'&&params.decision==='approve'&&params.result?.summary) {
      // DocumentId belongs to the local proof and the separately fenced turn
      // target. Native v1's strict receipt summary has no documentId field.
      const {documentId,...summary}=params.result.summary;
      params={...params,result:{...params.result,summary}};
    }
    return {v:1,kind:'ai.request',protocol:WORKFLOW_AI_PROTOCOL,requestId,ownerId:owner.ownerId,
      registrationId:owner.registrationId,generation:owner.generation,method,params,...(sessionId?{sessionId}:{})};
  }
  function clearTurnTarget(owner,sessionId) {
    owner.turnTargets.get(sessionId)?.fence.dispose();
    owner.turnTargets.delete(sessionId);
  }
  function closeOwner(owner,reason={code:'E_AI_DISCONNECTED',message:'AI 会话已失效；未重新发送请求'},notify=true) {
    for(const id of owner.turnTargets.keys())clearTurnTarget(owner,id);
    const c=connection();
    if(owners.get(owner.host)===owner){owners.delete(owner.host);retireEpoch(owner.host);}
    for(const [id,row] of pending)if(row.owner===owner)settle(id,{error:reason});
    if(notify&&c.ready&&c.port&&c.workflowAiVersion===1&&c.generation===owner.generation)
      try{c.port.postMessage(wire(owner,'ai.session.close',{}));}catch{}
  }
  function settle(id,data) {
    const row=pending.get(id);if(!row)return;
    pending.delete(id);clearTimeout(row.timer);
    send(row.host,{type:'native-agent.ai.response',requestId:row.message.requestId,
      clientGeneration:row.message.clientGeneration,...(row.message.sessionId?{sessionId:row.message.sessionId}:{}),...data});
  }
  function disconnected() {
    for(const host of hostPorts.values())retireEpoch(host);
    for(const id of pending.keys())settle(id,{error:{code:'E_AI_DISCONNECTED',message:'Native 连接已断开；AI 请求未重发'}});
    // Native reconnection does not replace a still-live Sidebar Host. Preserve
    // its consumed mutation IDs until dropHost so an old turn cannot be replayed.
    for(const owner of owners.values())for(const id of owner.turnTargets.keys())clearTurnTarget(owner,id);
    owners.clear();publish();
  }
  function receive(message) {
    if(message?.kind!=='ai.response')return false;
    const row=pending.get(message.requestId);if(!row)return true;
    const c=connection(),owner=row.owner;
    let valid=false;
    try {valid=message.v===1&&message.protocol===WORKFLOW_AI_PROTOCOL&&workflowAIBytes(message)<=AGENT_MAX_BYTES&&
      c.enabled&&c.ready&&row.port===c.port&&owner.generation===c.generation&&owners.get(row.host)===owner&&live(row.host)&&
      message.ownerId===owner.ownerId&&message.registrationId===owner.registrationId&&message.generation===owner.generation&&
      (!row.message.sessionId||message.sessionId===row.message.sessionId)&&
      Object.hasOwn(message,'result')!==Object.hasOwn(message,'error');}catch{}
    if(!valid){closeOwner(owner,{code:'E_AI_PROTOCOL',message:'AI 回执身份、版本或大小不一致'});return true;}
    // Permission removal may race a previously dispatched read. Recheck before
    // delivering any model output to its exact Host; never replay the request.
    Promise.resolve(api.permissions.contains({permissions:['nativeMessaging']})).then(granted=>{
      const now=connection();
      if(!pending.has(message.requestId))return;
      if(!granted||now.port!==row.port||now.generation!==owner.generation||!now.enabled||!now.ready||!live(row.host)||owners.get(row.host)!==owner) {
        closeOwner(owner,{code:'E_PERMISSION',message:'本机 AI 授权或连接已变化'});return;
      }
      if(!message.error&&row.message.method==='ai.session.open') {
        if(!workflowAIId(message.result?.sessionId)) {
          closeOwner(owner,{code:'E_AI_PROTOCOL',message:'AI 会话回执无效'});return;
        }
        owner.sessions.add(message.result.sessionId);
        owner.activeSessions.add(message.result.sessionId);
        // Retain a bounded number of closed, explicitly resumable sessions.
        for(const id of owner.sessions)if(owner.sessions.size>16&&!owner.activeSessions.has(id))owner.sessions.delete(id);
      }
      if(row.message.method==='ai.plan.start') {
        const target=owner.turnTargets.get(row.message.sessionId);
        if(target?.requestId===row.message.requestId) {
          if(message.error)clearTurnTarget(owner,row.message.sessionId);
          else target.ready=true;
        }
      }
      if(row.message.method==='ai.session.close'&&row.message.sessionId) {
        if(!message.error)owner.activeSessions.delete(row.message.sessionId);
        clearTurnTarget(owner,row.message.sessionId);
      }
      settle(message.requestId,message.error?{error:{code:message.error.code||'E_AI_PROVIDER',message:message.error.message||'本机 AI 请求失败'}}:{result:message.result});
      if(row.message.method==='ai.session.close'&&!row.message.sessionId)
        closeOwner(owner,{code:'E_AI_DISCONNECTED',message:'AI 会话已关闭'},false);
    }).catch(()=>{closeOwner(owner,{code:'E_PERMISSION',message:'无法核对本机 AI 授权'});});
    return true;
  }
  function fenceObservation(target) {
    let changed=false;
    const removals=[];
    const watch=(event,listener)=>{
      if(!event?.addListener||!event?.removeListener)return;
      event.addListener(listener);removals.push(()=>event.removeListener(listener));
    };
    const invalidate=()=>{changed=true;};
    watch(api.tabs?.onActivated,info=>{if(info.windowId===target.windowId&&info.tabId!==target.tabId)invalidate();});
    watch(api.tabs?.onUpdated,(id,change)=>{if(id===target.tabId&&(change.status==='loading'||change.url))invalidate();});
    watch(api.tabs?.onRemoved,id=>{if(id===target.tabId)invalidate();});
    watch(api.windows?.onRemoved,id=>{if(id===target.windowId)invalidate();});
    for(const name of ['onBeforeNavigate','onCommitted','onHistoryStateUpdated','onReferenceFragmentUpdated'])
      watch(api.webNavigation?.[name],info=>{if(info.tabId===target.tabId&&(info.frameId===0||info.frameId===target.frameId))invalidate();});
    watch(api.permissions?.onRemoved,grant=>{if(grant.origins?.length||grant.permissions?.includes('nativeMessaging'))invalidate();});
    return {
      assert(){if(changed)throw workflowAIError('E_PERMISSION','网页目标或授权已变化，观察结果不会发送');},
      dispose(){changed=true;for(const remove of removals)remove();}
    };
  }

  function acceptHostRequest(host,message) {
    if(message?.type!=='native-agent.ai.request')return false;
    const fail=e=>send(host,{type:'native-agent.ai.response',requestId:message.requestId,clientGeneration:message.clientGeneration,
      ...(message.sessionId?{sessionId:message.sessionId}:{}),error:{code:e.code||'E_AI_DISCONNECTED',message:e.message||'本机 AI 不可用'}});
    (async()=>{
      if(!live(host)||message.registrationId!==host.registrationId)throw workflowAIError('E_OWNER','AI 请求必须来自已注册 Sidebar');
      validateWorkflowAIRequest(message);
      const epoch=epochs.get(host)||0;
      const assertCurrent=()=>{if(!live(host)||(epochs.get(host)||0)!==epoch)
        throw workflowAIError('E_AI_DISCONNECTED','AI 请求所属连接或会话已关闭；不会重新发送');};
      // Read polls may repeat, but an original Host mutation must never become
      // a new Native UUID and a second model turn or Browser approval.
      if(!['ai.connection.read','ai.capabilities.read','ai.events.read'].includes(message.method)) {
        const seen=consumed.get(host)||new Set(),key=message.clientGeneration+':'+message.requestId;
        if(seen.has(key))throw workflowAIError('E_AI_REQUEST_REPLAY','此 AI 请求已提交，不会重复发送');
        if(seen.size>=512) {
          if(['ai.plan.cancel','ai.session.close'].includes(message.method)) {
            // A full replay ledger must not strand a running model. Retire the
            // entire owner without allocating another ledger row or replaying
            // a turn; report uncertainty instead of inventing a stop receipt.
            const owner=owners.get(host);
            if(owner)closeOwner(owner,{code:'E_AI_OUTCOME_UNKNOWN',message:'AI 请求次数已达上限；已请求终止本窗口会话，未重发'});
            else retireEpoch(host);
            throw workflowAIError('E_AI_OUTCOME_UNKNOWN','AI 请求次数已达上限；已请求终止会话，请重新打开工作流');
          }
          throw workflowAIError('E_AI_LIMIT','本次 Sidebar 的 AI 请求次数已达上限，请结束会话后重新打开');
        }
        seen.add(key);consumed.set(host,seen);
      }
      if(message.method==='ai.plan.start') {
        const existing=owners.get(host);
        if(existing?.sessions.has(message.sessionId)) {
          clearTurnTarget(existing,message.sessionId);
          if(message.params.target) {
            const target={...message.params.target};
            existing.turnTargets.set(message.sessionId,{target,fence:fenceObservation(target),requestId:message.requestId,ready:false});
          }
        }
      }
      if(message.method==='ai.connection.read'||message.method==='ai.connection.enable') {
        if(Object.keys(message.params).length||message.sessionId)throw workflowAIError('E_AI_SCHEMA','连接请求不能包含内容');
        if(message.method==='ai.connection.enable')await enable(host);
        else await refresh();
        assertCurrent();
        send(host,{type:'native-agent.ai.response',requestId:message.requestId,clientGeneration:message.clientGeneration,result:state()});return;
      }
      await refresh();
      assertCurrent();
      const c=connection();
      if(!c.enabled||!c.ready||c.workflowAiVersion!==1) {
        if(message.method==='ai.capabilities.read') {
          send(host,{type:'native-agent.ai.response',requestId:message.requestId,clientGeneration:message.clientGeneration,result:state()});return;
        }
        throw workflowAIError(c.ready?'E_AI_UNSUPPORTED':'E_AI_DISCONNECTED','请在 AI 设置中连接新版 OpenDesk 并检查 Codex');
      }
      const granted=await api.permissions.contains({permissions:['nativeMessaging']});
      assertCurrent();
      const now=connection();
      if(!granted||!live(host)||message.registrationId!==host.registrationId||now.port!==c.port||now.generation!==c.generation||!now.enabled||!now.ready)
        throw workflowAIError('E_PERMISSION','本机 AI 权限或 Host 身份已变化');
      const owner=ownerFor(host,c);
      if(message.sessionId&&!owner.sessions.has(message.sessionId))throw workflowAIError('E_OWNER','AI 会话不属于当前 Sidebar');
      if(message.method==='ai.session.open'&&message.params.resumeSessionId&&!owner.sessions.has(message.params.resumeSessionId))
        throw workflowAIError('E_OWNER','只能恢复此 Sidebar 建立的会话');
      if(!['ai.capabilities.read','ai.session.open','ai.session.close'].includes(message.method)&&!message.sessionId)
        throw workflowAIError('E_AI_SCHEMA','AI 请求缺少当前会话');
      if(message.method==='ai.session.open'&&owner.activeSessions.size>=4)
        throw workflowAIError('E_AI_LIMIT','请先结束现有 AI 会话');
      const controls=new Set(['ai.plan.cancel','ai.session.close']);
      const control=controls.has(message.method),rows=[...pending.values()];
      const sameLane=rows.filter(row=>controls.has(row.message.method)===control);
      // A stalled read/open must not occupy the slots used to stop its process.
      if(sameLane.length>=(control?8:16)||sameLane.filter(row=>row.host===host).length>=(control?2:4))
        throw workflowAIError('E_AI_LIMIT','本机 AI 待处理请求过多');
      const request=wire(owner,message.method,message.params,message.sessionId);
      if(workflowAIBytes(request)>AGENT_MAX_BYTES)throw workflowAIError('E_AI_LIMIT','AI 请求过大');
      const timer=setTimeout(()=>closeOwner(owner,{code:'E_AI_OUTCOME_UNKNOWN',message:'AI 请求未获得终态回执；不会重发'}),timeoutMs);
      pending.set(request.requestId,{host,message,owner,port:c.port,timer});
      try {
        if(message.method==='ai.approval.answer'&&message.params.decision==='approve') {
          const row=owner.turnTargets.get(message.sessionId);
          if(!row?.ready)throw workflowAIError('E_AI_APPROVAL','观察审批缺少已确认的当前回合网页目标');
          const {target,fence}=row;
          if(message.params.result?.summary?.documentId!==undefined&&
            message.params.result.summary.documentId!==target.documentId)
            throw workflowAIError('E_DOCUMENT_STALE','观察回执的文档与当前回合不一致');
          fence.assert();
          await observeControllerTarget({api,tabId:target.tabId,frameId:target.frameId,documentId:target.documentId,
            expectedUrl:target.url,expectedWindowId:target.windowId});
          assertCurrent();
          const latest=connection();
          if(owners.get(host)!==owner||latest.port!==c.port||latest.generation!==c.generation||!latest.enabled||!latest.ready)
            throw workflowAIError('E_AI_DISCONNECTED','AI 连接已变化，观察结果不会发送');
          fence.assert();
        }
        if(!pending.has(request.requestId))return;
        try{c.port.postMessage(request);}catch{closeOwner(owner,{code:'E_AI_DISCONNECTED',message:'Native 请求未获得回执；不会重发'});}
      } catch(error) {
        if(pending.has(request.requestId))settle(request.requestId,{error:{code:error.code||'E_AI_DISCONNECTED',message:error.message||'观察审批已失效'}});
      }
    })().catch(fail);
    return true;
  }
  function dropHost(host) {
    const owner=owners.get(host);if(owner)closeOwner(owner);
    else retireEpoch(host);
    owners.delete(host);consumed.delete(host);
    for(const [id,row] of pending)if(row.host===host){clearTimeout(row.timer);pending.delete(id);}
  }
  return {receive,acceptHostRequest,disconnected,dropHost,publish,state};
}
