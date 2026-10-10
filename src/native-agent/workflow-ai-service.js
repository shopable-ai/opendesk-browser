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
      owner={ownerId:crypto.randomUUID(),registrationId:host.registrationId,generation:c.generation,sessions:new Set(),activeSessions:new Set(),host};
      owners.set(host,owner);
    }
    return owner;
  }
  function wire(owner,method,params,sessionId,requestId=crypto.randomUUID()) {
    return {v:1,kind:'ai.request',protocol:WORKFLOW_AI_PROTOCOL,requestId,ownerId:owner.ownerId,
      registrationId:owner.registrationId,generation:owner.generation,method,params,...(sessionId?{sessionId}:{})};
  }
  function closeOwner(owner,reason={code:'E_AI_DISCONNECTED',message:'AI 会话已失效；未重新发送请求'},notify=true) {
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
      if(!message.error&&row.message.method==='ai.session.close'&&row.message.sessionId)owner.activeSessions.delete(row.message.sessionId);
      settle(message.requestId,message.error?{error:{code:message.error.code||'E_AI_PROVIDER',message:message.error.message||'本机 AI 请求失败'}}:{result:message.result});
      if(row.message.method==='ai.session.close'&&!row.message.sessionId)
        closeOwner(owner,{code:'E_AI_DISCONNECTED',message:'AI 会话已关闭'},false);
    }).catch(()=>{closeOwner(owner,{code:'E_PERMISSION',message:'无法核对本机 AI 授权'});});
    return true;
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
      if(workflowAIBytes(request)>AGENT_MAX_BYTES)throw workflowAIError('E_AI_LIMIT','AI 请求超过 Native 帧上限');
      const timer=setTimeout(()=>{
        closeOwner(owner,{code:'E_AI_OUTCOME_UNKNOWN',message:'AI 请求超时；已请求关闭会话，没有重新发送'});
      },timeoutMs);
      pending.set(request.requestId,{host,message,owner,port:c.port,timer});
      try{c.port.postMessage(request);}catch{closeOwner(owner,{code:'E_AI_DISCONNECTED',message:'Native 请求未获得回执；不会重发'});}
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
