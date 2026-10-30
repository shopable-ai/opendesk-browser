// Trusted adapter only: package code never receives a Provider configuration or credential.
const fail=(code,message)=>Object.assign(new Error(message),{code});
const safeCodes=new Set(['E_AI_REQUEST','E_AI_IDENTITY','E_TOOL_CHANGED','E_MODEL_STALE','E_AI_BUSY','E_AI_REPLAY','E_AI_LIMIT','E_AI_TIMEOUT','E_AI_UNKNOWN','E_CANCELLED','E_HOST_CLOSED']);
// Fixed Native failure and trusted planner codes, never provider-controlled text.
const diagnosticCodes=new Set([...safeCodes,
  'E_CODEX_UNSUPPORTED','E_CODEX_MISSING','E_CODEX_LOGIN_REQUIRED','E_CODEX_POLICY',
  'E_MODEL_UNAVAILABLE','E_RATE_LIMITED','E_NETWORK','E_PROVIDER',
  'E_WORKFLOW_ORIGIN','E_AI_INPUT_LIMIT','E_AI_CONSENT','E_AI_PROTOCOL','E_AI_EVENTS_GAP',
  'E_AI_OUTCOME_UNKNOWN','E_AI_RESUME','E_AI_RESUME_SCOPE','E_AI_CONFIG','E_DOCUMENT_STALE',
  'E_AI_DISCONNECTED','E_AI_RESPONSE','E_AI_TOOL_RESULT','E_AI_OBSERVATION_REQUIRED','E_AI_PROVIDER']);
const unknownError=error=>error?.code==='E_AI_OUTCOME_UNKNOWN'||error?.outcome==='OUTCOME_UNKNOWN'||error?.code==='E_AI_UNKNOWN';
const normalizeError=error=>unknownError(error)?fail('E_AI_UNKNOWN','AI 终态尚未确认，请查询原 requestId；不会自动重放'):error;
const safeError=original=>{
  const error=normalizeError(original);
  const diagnosticCode=diagnosticCodes.has(original?.code)?original.code:null;
  const message=error?.code==='E_AI_TIMEOUT'?'AI 请求超时，结果未知；不会自动重放':
    error?.code==='E_AI_UNKNOWN'?'AI 终态尚未确认，请查询原 requestId；不会自动重放':'AI 请求未完成；请检查状态，不会自动重放';
  return fail(safeCodes.has(error?.code)?error.code:'E_AI_PROVIDER',message+(diagnosticCode?' ('+diagnosticCode+')':''));
};
// Only bounded protocol identifiers/statuses cross the sandbox boundary.
const traceString=value=>typeof value==='string'&&/^[A-Za-z0-9_.:-]{1,200}$/.test(value)?value:null;
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
function safeUsage(value){
  if(!object(value))return null;
  const counts={};
  // Responses names and Chat Completions names; never copy provider extensions.
  for(const key of ['input_tokens','output_tokens','total_tokens','prompt_tokens','completion_tokens'])
    if(Object.hasOwn(value,key)&&Number.isSafeInteger(value[key])&&value[key]>=0)counts[key]=value[key];
  return Object.keys(counts).length?counts:null;
}
function schema(value,keys){
  if(!object(value)||Object.keys(value).some(k=>!keys.includes(k)))throw fail('E_AI_REQUEST','未知 AI 字段');
}
export function validateSidebarToolAIRequest(payload){
  schema(payload,['requestId','request','instructions','context','providerGeneration']);
  const {requestId,request,instructions,context}=payload;
  if(typeof requestId!=='string'||!/^[\w.-]{1,100}$/.test(requestId)||
    typeof request!=='string'||!request.trim()||request.length>4000||
    typeof instructions!=='string'||!instructions.trim()||instructions.length>10000||!object(context)||
    JSON.stringify({request,context}).length>20000)throw fail('E_AI_REQUEST','AI 请求格式或容量无效');
}
export function createSidebarToolAIAdapter({providerRuntime,instanceId,installEpoch,assertCurrent,confirm,timeoutMs=180000}){
  if(!providerRuntime||!instanceId||typeof installEpoch!=='string'||!installEpoch)
    throw fail('E_AI_IDENTITY','缺少安装代际');
  const lease=providerRuntime.acquire({consumerId:'sidebar-tools',instanceId,installEpoch});
  let disposed=false,active=null;
  const states=new Map();
  const settings=()=>providerRuntime.settingsSnapshot();
  function check(generation){
    if(disposed)throw fail('E_TOOL_CHANGED','工具已关闭');
    assertCurrent();
    if(!Number.isSafeInteger(settings().generation)||generation!==undefined&&settings().generation!==generation)
      throw fail('E_MODEL_STALE','Provider 代际已变化');
  }
  const terminalState=status=>({completed:'completed',failed:'failed',interrupted:'cancelled',cancelled:'cancelled'})[status];
  const release=row=>{
    if(row.workSettled&&row.source==='local_codex'&&row.terminal&&states.get(row.id)==='unknown')
      states.set(row.id,terminalState(row.terminal));
    // An aborted transport finishing is not proof that a remote turn retired.
    if(row.workSettled&&!row.stopping&&states.get(row.id)!=='unknown'&&active===row)active=null;
  };
  async function stop(){
    const row=active;
    if(!row)return;
    if(row.stopPromise)return row.stopPromise;
    row.stopping=true;
    // Ask the Native owner before aborting the delivery wait; abort is not a receipt.
    row.stopPromise=(async()=>{
      let cleanup;
      if(row.dispatched&&row.source==='local_codex'){
        try{cleanup=lease.cancelInference();}catch{cleanup=Promise.resolve(null);}
      }
      states.set(row.id,row.dispatched?'unknown':'cancelled');
      row.controller.abort(fail(row.dispatched?'E_AI_UNKNOWN':'E_CANCELLED','已停止交付；远端状态需以取消回执为准'));
      if(cleanup){
        try{
          const receipt=await cleanup;
          const terminal=terminalState(receipt?.terminalStatus);
          if(terminal)states.set(row.id,terminal);
          // IDLE can mean the planner forgot a failed-close session; it is not
          // retirement proof for this dispatched request. Keep unknown.
        }catch{/* No terminal proof: keep unknown. */}
      }
    })().finally(()=>{row.stopPromise=null;row.stopping=false;release(row);});
    return row.stopPromise;
  }
  const unsubscribe=providerRuntime.subscribeSettings(()=>{void stop();});
  return Object.freeze({
    async request(operation,payload){
      try{
      check();
      if(operation==='ai.info'){
        schema(payload,[]);const s=settings();
        return {provider:s.source,endpoint:s.source==='local_codex'?null:s.endpoint,model:s.model||null,generation:s.generation};
      }
      if(operation==='ai.cancel'){
        schema(payload,['requestId']);
        if(typeof payload.requestId!=='string'||!/^[\w.-]{1,100}$/.test(payload.requestId))throw fail('E_AI_REQUEST','无效 requestId');
        if(active?.id===payload.requestId)await stop();
        return {requestId:payload.requestId,state:states.get(payload.requestId)||'unknown'};
      }
      if(operation!=='ai.generate')throw fail('E_AI_REQUEST','未知 AI 操作');
      schema(payload,['requestId','request','instructions','context','providerGeneration']);
      const {requestId,request,instructions,context,providerGeneration}=payload;
      validateSidebarToolAIRequest(payload);
      if(!Number.isSafeInteger(providerGeneration))throw fail('E_MODEL_STALE','必须提供 Provider generation');
      check(providerGeneration);
      if(active)throw fail('E_AI_BUSY','此工具已有 AI 请求');
      if(states.has(requestId))throw fail('E_AI_REPLAY','请求不可重放，请使用新的 requestId');
      if(states.size>=128)throw fail('E_AI_LIMIT','本实例请求记录已满，请重新打开工具');
      const controller=new AbortController(),row={id:requestId,controller,source:settings().source,dispatched:false,workSettled:false,stopping:false};active=row;
      let timer;
      const interrupted=new Promise((_,reject)=>{
        controller.signal.addEventListener('abort',()=>reject(controller.signal.reason),{once:true});
        timer=setTimeout(()=>controller.abort(fail('E_AI_TIMEOUT','AI 请求超时，结果未知；不会自动重放')),timeoutMs);
      });
      try{
        const work=(async()=>{
          const s=settings();
          await confirm({provider:s.source,endpoint:s.source==='local_codex'?null:s.endpoint,model:s.model||null,
            requestId,request,instructions,context},controller.signal);
          check(providerGeneration);
          if(controller.signal.aborted)throw controller.signal.reason;
          let completed=null;
          row.dispatched=true;
          const result=await lease.requestStructured({request,instructions,context,signal:controller.signal,
            onEvent:event=>{if(event?.type==='turn.completed'){
              completed={turnId:event.turnId??null,status:event.status??null};
              if(typeof event.turnId==='string'&&event.turnId&&terminalState(event.status)&&!event.error?.outcome)
                row.terminal=event.status;
            }}});
          check(providerGeneration);
          if(controller.signal.aborted)throw controller.signal.reason;
          if(JSON.stringify(result.proposal).length>262144)throw fail('E_AI_LIMIT','AI 结果过大');
          const snapshot=lease.planner.snapshot();
          return {requestId,proposal:result.proposal,providerGeneration,metadata:{provider:s.source,
            usage:safeUsage(result.metadata?.usage),
            responseId:traceString(result.metadata?.responseId),upstreamStatus:traceString(result.metadata?.upstreamStatus),
            upstreamRequestId:traceString(result.metadata?.upstreamRequestId),turnId:completed?.turnId??null,status:completed?.status??'unknown',
            threadId:snapshot.threadId??null,sessionId:snapshot.sessionId??null,model:snapshot.model||s.model||null}};
        })().finally(()=>{row.workSettled=true;if(states.has(row.id))release(row);});
        const result=await Promise.race([work,interrupted]);states.set(requestId,'completed');return result;
      }catch(error){
        // Entering the lease is distinct from confirmation/preparation. A local
        // disconnect can erase the planner snapshot before this catch runs;
        // absence of a session (or a later IDLE receipt) proves no retirement.
        if(row.dispatched&&row.source==='local_codex'&&!row.terminal&&error?.code==='E_AI_DISCONNECTED')
          error=fail('E_AI_UNKNOWN','AI 终态尚未确认');
        if(!states.has(requestId))states.set(requestId,error.code==='E_AI_TIMEOUT'||unknownError(error)?'unknown':'failed');throw error;}
      finally{clearTimeout(timer);release(row);}
      }catch(error){throw safeError(error);}
    },
    dispose(){if(disposed)return;const cleanup=stop();disposed=true;unsubscribe();
      void cleanup.finally(()=>lease.dispose()).catch(()=>{});}
  });
}
