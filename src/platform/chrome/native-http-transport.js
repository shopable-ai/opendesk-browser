import {createRelayChannel,sha} from '../../native-agent/http-relay-channel.js';
import {fail} from '../../framework/sdk/registry.js';
const instances=new WeakMap(),TARGET='http://127.0.0.1:43121';
export function createNativeHttpTransport({api,channel,enabled=import.meta.env?.MODE==='development',now=Date.now,pollMs=200}={}){
  if(!enabled)return {request:async()=>{throw fail('E_SERVICE_UNSUPPORTED','Native HTTP is currently local development only');}};
  if(!channel&&instances.has(api))return instances.get(api);
  const rpc=channel??createRelayChannel(),runs=new Map();
  async function request(url,options,context,beforeDispatch){
    const target=new URL(url);
    if(target.origin!==TARGET||!url.startsWith(TARGET+'/')||target.username||target.password||target.href.includes('#')||options.method!=='GET')
      throw fail('E_PERMISSION','Native HTTP permits only fixed local GET');
    if(!context.runId||!context.requestId||!context.sourceHash||!context.taskId||typeof beforeDispatch!=='function')throw fail('E_OWNER');
    if(options.signal.aborted)throw options.signal.reason??fail('E_CANCELLED');
    const service=rpc.status?await rpc.status():{paired:true,generation:1};
    if(!service.paired)throw fail('E_NATIVE_PAIR_REQUIRED','Pair local Node HTTP service first');
    const previous=runs.get(context.runId);
    if(previous&&previous.generation!==service.generation)throw fail('E_EFFECT_UNKNOWN','Node service restarted during this Run; do not replay');
    const bound=previous?.deadline??Math.min(now()+15000,context.deadlineAt);
    runs.set(context.runId,{deadline:bound,generation:service.generation});
    // Keep only bounded expired run deadlines; never extend an active deadline.
    for(const [id,row]of runs)if(row.deadline<now()-15000)runs.delete(id);
    const deadlineAt=Math.min(bound,context.deadlineAt),operationId=crypto.randomUUID();
    if(now()>=deadlineAt)throw fail('E_TIMEOUT');
    const operation={operationId,runId:context.runId,requestId:context.requestId,taskId:context.taskId,
      revision:context.revision,sourceHash:context.sourceHash,url:target.href,method:'GET',headers:{...options.headers},
      userAgent:options.userAgent||'OpenDesk-NativeHTTP/1.0',deadlineAt,leaseMs:2000,
      authority:{mode:context.installation?'installedTask':'draftRun',installation:context.installation??null,
        appBindingHash:context.taskDelegation?await sha(context.taskDelegation):null,
        namespace:context.namespace,principal:context.principal,grantIncarnation:context.grantIncarnation,
        resultId:context.resultId,browserSessionIncarnation:context.browserSessionIncarnation}};
    let registered=false,dispatched=false,settled=false,lastRenew=0;
    async function cancel(){
      if(!registered||settled)return;
      try{const receipt=await rpc.rpc('cancel',{operationId});
        if(receipt.operationId!==operationId||!['cancelled','completed','timeout','revoked','lease_expired','early_close','network_error','response_too_large'].includes(receipt.status))throw Error();
        settled=true;
      }catch{throw fail('E_EFFECT_UNKNOWN','Node request cancellation could not be confirmed; never replay');}
    }
    const assertLive=()=>{
      if(options.signal.aborted)throw options.signal.reason??fail('E_CANCELLED');
      if(now()>=deadlineAt)throw fail('E_TIMEOUT');
    };
    try{
      await beforeDispatch();assertLive();
      const receipt=await rpc.rpc('register',operation);registered=true;
      if(receipt.operationId!==operationId||receipt.status!=='registered')throw fail('E_NATIVE_AUTH');
      await beforeDispatch();assertLive();
      dispatched=true;
      const started=await rpc.rpc('execute',{operationId},async()=>{await beforeDispatch();assertLive();});
      if(started.operationId!==operationId||!['running','completed'].includes(started.status))throw fail('E_NATIVE_REQUEST','Node did not admit HTTP execution');
      lastRenew=now();
      for(;;){
        assertLive();
        if(now()-lastRenew>=500){
          // The existing Authority remains the only permission source. Stop,
          // Task disable, app disable, origin revoke or document change end lease.
          await beforeDispatch();assertLive();
          await rpc.rpc('renew',{operationId,leaseMs:2000},async()=>{await beforeDispatch();assertLive();});lastRenew=now();
        }
        const state=await rpc.rpc('status',{operationId});
        if(state.operationId!==operationId)throw fail('E_NATIVE_AUTH');
        if(state.status==='completed'){
          settled=true;assertLive();await beforeDispatch();assertLive();
          const result=state.result;
          if(!result||!Number.isInteger(result.status)||typeof result.body!=='string'||!result.executor)throw fail('E_NATIVE_AUTH');
          const response=new Response([204,205,304].includes(result.status)?null:result.body,
            {status:result.status,statusText:result.statusText,headers:result.headers});
          response.executor=result.executor;return response;
        }
        if(state.status!=='running'){
          settled=state.status!=='unknown';
          throw fail(state.status==='timeout'?'E_TIMEOUT':state.status==='unknown'?'E_EFFECT_UNKNOWN':'E_NETWORK','Node HTTP: '+state.status);
        }
        await new Promise(resolve=>{
          const done=()=>{clearTimeout(timer);options.signal.removeEventListener('abort',done);resolve();};
          const timer=setTimeout(done,pollMs);options.signal.addEventListener('abort',done,{once:true});
          if(options.signal.aborted)done();
        });
      }
    }catch(error){
      try{await cancel();}catch(unknown){throw unknown;}
      if(dispatched&&['E_NATIVE_UNAVAILABLE','E_NATIVE_AUTH'].includes(error.code))throw fail('E_EFFECT_UNKNOWN','Node HTTP outcome unknown; no browser fallback');
      throw error;
    }
  }
  const transport={request};if(!channel)instances.set(api,transport);return transport;
}
