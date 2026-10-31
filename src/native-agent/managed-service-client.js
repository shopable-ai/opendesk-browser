import {AgentBridgeError,AGENT_MAX_BYTES} from './protocol.js';
import {MANAGED_SERVICES_PROTOCOL as protocol,SERVICE_READS,serviceCall,serviceDescriptor,serviceExact,serviceObject,serviceID} from './managed-service-protocol.js';

// Held only by the fixed SW; dynamic tools cannot obtain this object or a Port.
export function createManagedServiceClient({api,connection,timeoutMs=16000,development}={}){
  let supported=false,services=[];
  const pending=new Map(),copy=value=>JSON.parse(JSON.stringify(value));
  const available=()=>{const c=connection();return supported&&c.enabled&&c.ready&&!!c.port;};
  const sameProvider=(id,epoch)=>services.some(s=>s.serviceId===id&&s.providerEpoch===epoch);
  function settle(id,result,error){const p=pending.get(id);if(!p)return;
    pending.delete(id);clearTimeout(p.timer);p.finish?.();
    if(error)p.reject(new AgentBridgeError(error.code,error.message||error.code,error.outcome||(p.write?'OUTCOME_UNKNOWN':'FAILED_CONFIRMED')));
    else p.resolve(result);
  }
  function disconnected(){services=[];
    for(const id of pending.keys())settle(id,null,{code:'E_SERVICE_DISCONNECTED'});
  }
  function negotiate(version){disconnected();supported=version===1;}
  function receive(message){
    if(!['services.state','services.response'].includes(message?.kind))return false;
    if(!supported||message.v!==1||message.protocol!==protocol)return false;
    if(new TextEncoder().encode(JSON.stringify(message)).length>AGENT_MAX_BYTES)return false;
    if(message.kind==='services.state'){
      if(!serviceExact(message,['v','kind','protocol','services'])||!Array.isArray(message.services)||message.services.length>8||
        message.services.some(s=>!serviceDescriptor(s,{registered:true}))||new Set(message.services.map(s=>s.serviceId)).size!==message.services.length)return false;
      services=copy(message.services);
      for(const [id,p] of pending)if(!sameProvider(p.serviceId,p.providerEpoch))settle(id,null,{code:'E_SERVICE_DISCONNECTED'});
      return true;
    }
    const p=pending.get(message.requestId);if(!p)return serviceID(message.requestId);
    const c=connection(),hasResult=Object.hasOwn(message,'result'),hasError=Object.hasOwn(message,'error');
    const validError=!hasError||serviceObject(message.error)&&typeof message.error.code==='string'&&
      /^[A-Z][A-Z0-9_]{0,63}$/.test(message.error.code)&&typeof message.error.message==='string'&&message.error.message.length<=240&&
      ['OUTCOME_UNKNOWN','FAILED_CONFIRMED','NOT_DISPATCHED'].includes(message.error.outcome);
    if(!available()||p.port!==c.port||p.generation!==c.generation||message.serviceId!==p.serviceId||
      message.providerEpoch!==p.providerEpoch||!sameProvider(p.serviceId,p.providerEpoch)||hasResult===hasError||
      !serviceExact(message,['v','kind','protocol','requestId','serviceId','providerEpoch',hasResult?'result':'error'])||
      hasResult&&!serviceObject(message.result)||!validError){settle(message.requestId,null,{code:'E_SERVICE_SESSION'});return true;}
    settle(message.requestId,copy(message.result??null),message.error);return true;
  }
  async function request(input){
    if(!serviceCall(input))throw new AgentBridgeError('E_SERVICE_SCHEMA');
    if(development?.held)throw new AgentBridgeError('E_DEV_RELOADING');
    if(!supported)throw new AgentBridgeError('E_SERVICE_UNSUPPORTED');
    if(!available()||!sameProvider(input.serviceId,input.providerEpoch))throw new AgentBridgeError('E_SERVICE_DISCONNECTED');
    const c={...connection()},requestId=crypto.randomUUID();
    const wire=JSON.stringify({v:1,kind:'services.request',protocol,requestId,...input});
    const frozen=JSON.parse(wire);
    if(new TextEncoder().encode(wire).length>AGENT_MAX_BYTES)throw new AgentBridgeError('E_SERVICE_LIMIT');
    if(!await api.permissions.contains({permissions:['nativeMessaging']}))throw new AgentBridgeError('E_PERMISSION');
    if(!available()||connection().port!==c.port||connection().generation!==c.generation||!sameProvider(frozen.serviceId,frozen.providerEpoch))
      throw new AgentBridgeError('E_SERVICE_DISCONNECTED');
    if(development?.held)throw new AgentBridgeError('E_DEV_RELOADING');
    if(pending.size>=4)throw new AgentBridgeError('E_LIMIT');
    const write=!SERVICE_READS.includes(frozen.action);
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>settle(requestId,null,{code:'E_SERVICE_TIMEOUT'}),timeoutMs);
      pending.set(requestId,{resolve,reject,timer,write,port:c.port,generation:c.generation,
        serviceId:frozen.serviceId,providerEpoch:frozen.providerEpoch,finish:development?.nativeStarted()});
      try{c.port.postMessage(frozen);}catch{settle(requestId,null,{code:'E_SERVICE_DISCONNECTED'});}
    });
  }
  return Object.freeze({state:()=>({supported,connected:available(),services:copy(services)}),negotiate,receive,request,disconnected,dispose:disconnected});
}
