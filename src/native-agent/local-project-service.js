import {AGENT_MAX_BYTES,AgentBridgeError,agentObject} from './protocol.js';

// Reverse, read-only project transport on authenticated Native Messaging. Only
// the original broker's currently registered Host ports may request a binding.
export function createLocalProjectService({api,hostPorts,connection}) {
  let providerEpoch=null;
  const pending=new Map();
  const live=host=>[...hostPorts.values()].includes(host)&&typeof host.registrationId==='string';
  const available=()=>{const c=connection();return c.enabled&&c.ready&&c.port&&providerEpoch;};
  const state=()=>({connected:!!available(),providerEpoch:available()?providerEpoch:null});
  const send=(host,message)=>{if(live(host))try{host.postMessage({...message,registrationId:host.registrationId});}catch{}};
  function publish(){for(const host of hostPorts.values())send(host,{type:'native-agent.dev.state',state:state()});}
  function settle(id,data){
    const row=pending.get(id);if(!row)return;
    pending.delete(id);clearTimeout(row.timer);
    send(row.host,{type:'native-agent.dev.response',requestId:row.requestId,...data});
  }
  function disconnected(){
    providerEpoch=null;
    for(const id of pending.keys())settle(id,{error:{code:'E_DEV_DISCONNECTED',message:'Local project connection closed'}});
    publish();
  }
  function receive(message){
    if(message?.v!==1)return false;
    if(message.kind==='dev.state'){
      if(typeof message.connected!=='boolean'||message.connected&&typeof message.providerEpoch!=='string')return false;
      if(!message.connected||providerEpoch!==message.providerEpoch)disconnected();
      providerEpoch=message.connected?message.providerEpoch:null;publish();return true;
    }
    if(message.kind!=='dev.response')return false;
    const row=pending.get(message.requestId);if(!row)return true;
    const c=connection();
    if(!available()||row.port!==c.port||row.generation!==c.generation||row.epoch!==providerEpoch||message.providerEpoch!==row.epoch||
      Object.hasOwn(message,'result')===Object.hasOwn(message,'error')){
      settle(message.requestId,{error:{code:'E_DEV_DISCONNECTED',message:'Local source response identity changed'}});return true;
    }
    settle(message.requestId,{...(message.error?{error:message.error}:{result:message.result}),providerEpoch});return true;
  }
  function acceptHostRequest(host,message){
    if(message?.type!=='native-agent.dev.request')return false;
    const fail=error=>send(host,{type:'native-agent.dev.response',requestId:message.requestId,error:{code:error.code||'E_DEV_DISCONNECTED',message:error.message||'Local project unavailable'}});
    (async()=>{
      if(!live(host)||message.registrationId!==host.registrationId)throw new AgentBridgeError('E_OWNER');
      if(typeof message.requestId!=='string'||!['status','projects.list','project.resolve'].includes(message.method)||
        !agentObject(message.params)||Object.keys(message.params).some(key=>key!=='bindingId')||
        message.method==='project.resolve'&&typeof message.params.bindingId!=='string')throw new AgentBridgeError('E_SCHEMA');
      if(message.method==='status'){send(host,{type:'native-agent.dev.response',requestId:message.requestId,result:state()});return;}
      const c=connection(),epoch=providerEpoch;
      if(!available())throw new AgentBridgeError('E_DEV_DISCONNECTED');
      if(!await api.permissions.contains({permissions:['nativeMessaging']}))throw new AgentBridgeError('E_PERMISSION');
      if(!live(host)||!available()||connection().port!==c.port||connection().generation!==c.generation||providerEpoch!==epoch)throw new AgentBridgeError('E_DEV_DISCONNECTED');
      if(pending.size>=4)throw new AgentBridgeError('E_LIMIT');
      const requestId=crypto.randomUUID(),request={v:1,kind:'dev.request',requestId,providerEpoch:epoch,method:message.method,params:message.params};
      if(new TextEncoder().encode(JSON.stringify(request)).length>AGENT_MAX_BYTES)throw new AgentBridgeError('E_LIMIT');
      const timer=setTimeout(()=>settle(requestId,{error:{code:'E_DEV_TIMEOUT',message:'Local source read timed out; no program was started'}}),16000);
      pending.set(requestId,{host,requestId:message.requestId,port:c.port,generation:c.generation,epoch,timer});
      try{c.port.postMessage(request);}catch{settle(requestId,{error:{code:'E_DEV_DISCONNECTED',message:'Local project connection closed'}});}
    })().catch(fail);return true;
  }
  function dropHost(host){for(const [id,row] of pending)if(row.host===host){clearTimeout(row.timer);pending.delete(id);}}
  return {receive,acceptHostRequest,disconnected,dropHost};
}
