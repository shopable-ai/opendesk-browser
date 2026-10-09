import {PROTOCOL as FOUNDATION_PROTOCOL} from '../platform/protocol.js';
import {AGENT_CONFIG_PROTOCOL} from './protocol.js';
import {createNativeAgentService} from './service-worker.js';
import {createManagedUIPreview} from './managed-preview.js';

// Fixed, extension-internal classic script. Side Panel RunHost registrations are
// still validated by the original foundation broker and held in the SAME map.
export const NATIVE_TRANSPORT_KEY='__opendeskNativeTransportInstalled';

export function installNativeTransport(scope=globalThis) {
  if(Object.hasOwn(scope,NATIVE_TRANSPORT_KEY))throw Error('E_NATIVE_TRANSPORT_CONFLICT');
  const api=scope.chrome,hostPorts=scope.__opendeskNativeHostPorts;
  if(!api?.runtime || !(hostPorts instanceof Map))throw Error('E_HOST_NOT_READY');
  Object.defineProperty(scope,'__opendeskNativeManagedUI',{value:createManagedUIPreview,writable:false,configurable:false});
  const agent=createNativeAgentService({api,hostPorts,development:scope.__opendeskDevelopment});
  api.runtime.onMessage.addListener((message,sender,sendResponse)=>{
    if(message?.protocol!==AGENT_CONFIG_PROTOCOL)return false;
    agent.handleSettings(message,sender).then(
      data=>sendResponse({ok:true,data}),
      error=>sendResponse({ok:false,error:{code:error.code||'E_EFFECT_UNKNOWN',message:error.message||'Native unavailable'}})
    );
    return true;
  });
  api.runtime.onConnect.addListener(port=>{
    if(port.name!==FOUNDATION_PROTOCOL)return;
    // In parallel, core SW binds the same port only after broker.assertHost;
    // unregistered ports cannot be selected for native dispatch.
    port.onMessage.addListener(msg=>{agent.acceptHostResponse(port,msg)||agent.acceptHostRequest(port,msg);});
    port.onDisconnect.addListener(()=>agent.dropHost(port));
  });
  Object.defineProperty(scope,NATIVE_TRANSPORT_KEY,{
    value:true,configurable:false,writable:false,enumerable:false
  });
  return agent;
}
