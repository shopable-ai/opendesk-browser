// Trusted, DOM-independent Provider owner. One native transport, one lease per consumer instance.
import {createLocalCodexPlanner} from '../workflow/local-codex.js';
import {createWorkflowProviderFacade} from '../workflow/provider.js';

const fail=(code,message)=>Object.assign(new Error(message),{code});
const sources=new Set(['local_codex','cloud_responses','custom_https']);
const consumers=new Set(['workflow','bookmark','prompt','prompt-edit','tasks']);
const idle=()=>({sessionId:null,threadId:null,state:'IDLE',busy:false,resumable:false});

export function createSharedAIProviderRuntime({client,hostInstanceId,
  plannerFactory=createLocalCodexPlanner,facadeFactory=createWorkflowProviderFacade}={}) {
  if(!client||typeof client.requestWorkflowAI!=='function'||typeof hostInstanceId!=='string'||!hostInstanceId)
    throw fail('E_AI_RUNTIME','共享 Provider 缺少可信 Host 身份');
  let disposed=false,generation=1;
  let config={source:'local_codex',endpoint:'https://api.openai.com/v1/chat/completions',model:'',apiKey:''};
  const leases=new Map(),settingsListeners=new Set();
  let publicSettings=Object.freeze({source:config.source,endpoint:config.endpoint,
    model:config.model,hasApiKey:false,generation});
  const publishSettings=()=>{
    publicSettings=Object.freeze({source:config.source,endpoint:config.endpoint,
      model:config.model,hasApiKey:Boolean(config.apiKey),generation});
    for(const listener of [...settingsListeners])listener();
  };
  const ensure=()=>{if(disposed)throw fail('E_HOST_CLOSED','共享 Provider 已关闭');};
  const configuration=()=>({source:config.source,generation,
    settings:{endpoint:config.endpoint,model:config.model,apiKey:config.apiKey}});
  function configure(next={}) {
    ensure();
    const updated={source:next.source,endpoint:next.endpoint,model:next.model,apiKey:next.apiKey};
    if(!sources.has(updated.source)||['endpoint','model','apiKey'].some(k=>typeof updated[k]!=='string'))
      throw fail('E_AI_CONFIG','AI Provider 配置无效');
    if(Object.keys(updated).some(k=>updated[k]!==config[k])) {
      config=updated;generation++;
      for(const lease of leases.values())lease.invalidate();
      publishSettings();
    }
    return configuration();
  }
  function updateSettings(patch={}) {
    ensure();
    const allowed=new Set(['source','endpoint','model','apiKey']);
    if(!patch||typeof patch!=='object'||Array.isArray(patch)||
      Object.keys(patch).some(key=>!allowed.has(key)))
      throw fail('E_AI_CONFIG','未知 Provider 设置字段');
    configure({source:patch.source??config.source,
      endpoint:patch.endpoint??config.endpoint,model:patch.model??config.model,
      apiKey:Object.hasOwn(patch,'apiKey')?patch.apiKey:config.apiKey});
    // This method is also the public settings facade. Credentials stay in the
    // trusted configuration used by consumer adapters, including on save.
    return publicSettings;
  }
  function subscribeSettings(listener){
    ensure();if(typeof listener!=='function')throw fail('E_AI_CONFIG','设置监听器无效');
    settingsListeners.add(listener);return ()=>settingsListeners.delete(listener);
  }
  function acquire({consumerId,instanceId,hostInstanceId:owner=hostInstanceId,installEpoch=null}={}) {
    ensure();
    if(!consumers.has(consumerId)||typeof instanceId!=='string'||!instanceId||
      instanceId.length>160||owner!==hostInstanceId||
      installEpoch!==null&&typeof installEpoch!=='string')
      throw fail('E_AI_IDENTITY','Provider Lease 身份无效');
    const key=JSON.stringify([consumerId,instanceId,owner,installEpoch]);
    if(leases.has(key))throw fail('E_AI_LEASE_DUPLICATE','此实例已经持有 Provider Lease');
    let stopped=false,epoch=0,nativePlanner=null;
    const pending=new Set();
    const assertOpen=()=>{ensure();if(stopped)throw fail('E_TOOL_CHANGED','消费者已关闭');};
    const native=()=>{
      assertOpen();
      if(!nativePlanner)nativePlanner=plannerFactory({client});
      return nativePlanner;
    };
    // Existing workflow facade receives its own stable per-lease planner proxy.
    const planner=Object.freeze({
      plan:args=>native().plan(args),
      planStructured:args=>native().planStructured(args),
      probe:()=>native().probe(),
      snapshot:()=>nativePlanner?.snapshot()??idle(),
      cancel:()=>nativePlanner?.cancel()??Promise.resolve({state:'IDLE'}),
      close:args=>nativePlanner?.close(args)??Promise.resolve({state:'IDLE'}),
      resume:args=>native().resume(args)
    });
    const transport=facadeFactory({localPlanner:planner,conversationPlanner:planner,
      taskConversationPlanner:planner});
    function invalidate(){
      epoch++;
      for(const controller of pending)
        controller.abort(fail('E_MODEL_STALE','Provider 或实例改变，旧结果无效'));
      if(nativePlanner){nativePlanner.dispose();nativePlanner=null;}
    }
    async function guarded(dispatch,signal){
      assertOpen();
      const expectedEpoch=epoch,expectedGeneration=generation,controller=new AbortController();
      const abort=()=>controller.abort(signal?.reason||fail('E_CANCELLED','AI 已停止'));
      signal?.addEventListener('abort',abort,{once:true});
      if(signal?.aborted)abort();
      pending.add(controller);
      try{
        if(controller.signal.aborted)throw fail('E_CANCELLED','AI 已停止');
        const result=await dispatch(controller.signal);
        if(stopped||disposed||epoch!==expectedEpoch||generation!==expectedGeneration)
          throw fail('E_MODEL_STALE','旧 Provider 结果不能交付给新会话');
        if(controller.signal.aborted)throw controller.signal.reason||fail('E_CANCELLED','AI 已停止');
        return result;
      }finally{pending.delete(controller);signal?.removeEventListener('abort',abort);}
    }
    const lease=Object.freeze({
      identity:()=>Object.freeze({consumerId,instanceId,hostInstanceId:owner,installEpoch,
        providerGeneration:generation}),
      planner,
      facade:Object.freeze({
        probeCapabilities:(...args)=>transport.probeCapabilities(...args),
        generateWorkflow:input=>lease.generateWorkflow(input),
        generateStructured:input=>lease.requestStructured(input),
        cancel:source=>source==='local_codex'?lease.cancelInference():null,
        resume:(source,args)=>source==='local_codex'?planner.resume(args):
          Promise.reject(fail('E_AI_UNSUPPORTED','此 Provider 不支持恢复'))
      }),
      probe:()=>native().probe(),
      generateWorkflow(input={}){
        const selected=configuration();
        if(input.source!==selected.source||
          selected.source!=='local_codex'&&
          ['endpoint','model','apiKey'].some(k=>input.settings?.[k]!==selected.settings[k]))
          throw fail('E_MODEL_STALE','工作流 Provider 配置已切换，请重新发送');
        return guarded(signal=>transport.generateWorkflow({...input,signal}),input.signal);
      },
      requestStructured(input={}){
        const selected=configuration();
        const {source:_ignoredSource,settings:_ignoredSettings,...request}=input;
        return guarded(signal=>transport.generateStructured({...request,
          source:selected.source,settings:selected.settings,signal}),input.signal);
      },
      cancelInference(){
        assertOpen();
        // Start Native cleanup before forwarding abort (which also requests
        // cancellation). Preserve its exact promise, including UNKNOWN outcomes.
        const cleanup=planner.cancel();
        for(const controller of pending)controller.abort(fail('E_CANCELLED','AI 已停止'));
        return cleanup;
      },
      invalidate,
      dispose(){if(stopped)return;stopped=true;invalidate();leases.delete(key);}
    });
    leases.set(key,lease);
    return lease;
  }
  return Object.freeze({acquire,configure,configuration,updateSettings,
    settingsSnapshot:()=>publicSettings,subscribeSettings,
    dispose(){if(disposed)return;for(const lease of [...leases.values()])lease.dispose();
      disposed=true;settingsListeners.clear();
      config={source:'local_codex',endpoint:'',model:'',apiKey:''};}});
}
