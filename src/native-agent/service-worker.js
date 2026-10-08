import {AGENT_VERSION,AGENT_HOST,AGENT_LEDGER_KEY,AGENT_ENABLED_KEY,AGENT_MAX_LEDGER,
  AGENT_MUTATIONS,AgentBridgeError,agentValidateRequest,agentDigest} from './protocol.js';

// Durable admission fence for optional external callers, NOT a second executor.
export function createNativeAgentService({api=globalThis.chrome,hostPorts=new Map()}={}) {
  let enabled=false,port=null,ready=false,disposed=false,sequence=Promise.resolve();
  const pending=new Map(),store=api.storage.local;
  function exclusive(action) {
    const next=sequence.then(action);
    sequence=next.catch(()=>{});
    return next;
  }
  const live=()=>[...hostPorts.values()].filter(p=>typeof p?.registrationId==='string');
  function hostFor(params) {
    const id=params?.registrationId,registered=live();
    if(id!==undefined&&(typeof id!=='string'||!id))throw new AgentBridgeError('E_SCHEMA');
    const matches=id?registered.filter(p=>p.registrationId===id):registered;
    if(!matches.length)throw new AgentBridgeError('E_HOST_NOT_READY');
    if(matches.length!==1)throw new AgentBridgeError('E_HOST_AMBIGUOUS');
    return matches[0];
  }
  const ledger=async()=>{
    const entries=(await store.get(AGENT_LEDGER_KEY))[AGENT_LEDGER_KEY];
    return entries&&typeof entries==='object'&&!Array.isArray(entries)?entries:{};
  };
  const error=(e)=>({code:e?.code||'E_EFFECT_UNKNOWN',message:e?.message||'E_EFFECT_UNKNOWN',
    outcome:e?.outcome||'FAILED_CONFIRMED'});
  const response=(requestId,data)=>({v:AGENT_VERSION,kind:'response',requestId,...data});
  const normalize=(id,msg)=>response(id,msg?.error?{error:msg.error}:{result:msg.result});
  async function reserve(req,host) {
    const digest=await agentDigest({method:req.method,params:req.params,registrationId:host.registrationId});
    return exclusive(async()=>{
      const rows=await ledger(),previous=rows[req.requestId];
      if(previous) {
        if(previous.digest!==digest)throw new AgentBridgeError('E_REQUEST_CONFLICT');
        return previous;
      }
      if(Object.keys(rows).length>=AGENT_MAX_LEDGER)throw new AgentBridgeError('E_LIMIT');
      rows[req.requestId]={digest,method:req.method,registrationId:host.registrationId,state:'OUTCOME_UNKNOWN',
        createdAt:Date.now()};
      await store.set({[AGENT_LEDGER_KEY]:rows});
      return null;
    });
  }
  async function finalize(req,reply) {
    await exclusive(async()=>{
      const rows=await ledger(),entry=rows[req.requestId];
      if(!entry||entry.state!=='OUTCOME_UNKNOWN')return;
      rows[req.requestId]={...entry,
        state:reply.error?(reply.error.outcome==='OUTCOME_UNKNOWN'?'OUTCOME_UNKNOWN':'FAILED_CONFIRMED'):'ACKNOWLEDGED',
        ...(reply.result?.runId?{runId:reply.result.runId}:{}),
        ...(reply.error?.outcome==='OUTCOME_UNKNOWN'?{}:{reply}),
        updatedAt:Date.now()};
      await store.set({[AGENT_LEDGER_KEY]:rows});
    });
  }
  async function assertRun(runId) {
    if(typeof runId!=='string'||!runId)throw new AgentBridgeError('E_SCHEMA');
    if(!Object.values(await ledger()).some(x=>x.method==='run.start'&&x.runId===runId))
      throw new AgentBridgeError('E_PERMISSION');
  }
  function dispatch(host,req) {
    return new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>{
        pending.delete(req.requestId);
        reject(new AgentBridgeError('E_EFFECT_UNKNOWN',undefined,'OUTCOME_UNKNOWN'));
      },135000);
      pending.set(req.requestId,{host,resolve,reject,timeout});
      try{host.postMessage({type:'native-agent.request',registrationId:host.registrationId,request:req});}
      catch{
        clearTimeout(timeout);pending.delete(req.requestId);
        reject(new AgentBridgeError('E_EFFECT_UNKNOWN',undefined,'OUTCOME_UNKNOWN'));
      }
    });
  }
  function acceptHostResponse(from,msg) {
    if(msg?.type!=='native-agent.response'||typeof msg.requestId!=='string')return false;
    const item=pending.get(msg.requestId);
    if(!item||item.host!==from||msg.registrationId!==from.registrationId)return true;
    pending.delete(msg.requestId);clearTimeout(item.timeout);
    if(Object.hasOwn(msg,'result')===Object.hasOwn(msg,'error'))
      item.reject(new AgentBridgeError('E_EFFECT_UNKNOWN',undefined,'OUTCOME_UNKNOWN'));
    else item.resolve(msg);
    return true;
  }
  async function handle(req) {
    agentValidateRequest(req);
    if(!enabled)throw new AgentBridgeError('E_PERMISSION');
    if(req.method==='bridge.status')return {extensionId:api.runtime.id,bridgeVersion:AGENT_VERSION,
      nativeConnected:ready,enabled,hostRegistrations:live().map(p=>p.registrationId)};
    if(req.method==='run.get'||req.method==='run.stop')await assertRun(req.params.runId);
    const host=hostFor(req.params);
    if(AGENT_MUTATIONS.includes(req.method)) {
      const old=await reserve(req,host);
      if(old) {
        if(old.reply)return normalize(req.requestId,old.reply);
        throw new AgentBridgeError('E_EFFECT_UNKNOWN',undefined,'OUTCOME_UNKNOWN');
      }
    }
    const reply=await dispatch(host,req);
    if(AGENT_MUTATIONS.includes(req.method))await finalize(req,reply);
    return normalize(req.requestId,reply);
  }
  async function receive(req,source) {
    const id=typeof req?.requestId==='string'?req.requestId:'';
    let reply;
    try {
      const data=await handle(req);
      reply=data?.kind==='response'?data:response(id,{result:data});
    }catch(e){reply=response(id,{error:error(e)});}
    if(port===source&&ready)try{source.postMessage(reply);}catch{}
  }
  function connect() {
    if(disposed||!enabled||port)return;
    let connected;
    try{connected=api.runtime.connectNative(AGENT_HOST);}catch{return;}
    port=connected;
    connected.onMessage.addListener(msg=>{
      if(port!==connected)return;
      if(msg?.v===AGENT_VERSION&&msg.kind==='hello'&&!ready) {
        ready=true;
        try{connected.postMessage({v:AGENT_VERSION,kind:'welcome',extensionId:api.runtime.id,
          extensionVersion:api.runtime.getManifest().version});}catch{connected.disconnect();}
      }else if(ready&&msg?.kind==='request')void receive(msg,connected);
      else connected.disconnect();
    });
    connected.onDisconnect.addListener(()=>{
      if(port===connected){port=null;ready=false;}
      for(const [id,item] of pending) {
        clearTimeout(item.timeout);item.reject(new AgentBridgeError('E_EFFECT_UNKNOWN',undefined,'OUTCOME_UNKNOWN'));
        pending.delete(id);
      }
    });
  }
  const initial=(async()=>{
    const configuration=await store.get(AGENT_ENABLED_KEY);
    enabled=configuration[AGENT_ENABLED_KEY]===true&&
      await api.permissions.contains({permissions:['nativeMessaging']});
    if(enabled)connect();
  })();
  initial.catch(()=>{});
  async function handleSettings(msg,sender) {
    if(sender?.id!==api.runtime.id||sender?.url!==api.runtime.getURL('native-agent/settings.html')||
      typeof sender.documentId!=='string')throw new AgentBridgeError('E_OWNER');
    await initial;
    if(msg?.type==='status')return {enabled,nativeConnected:ready,hostCount:live().length,
      extensionId:api.runtime.id,bridgeVersion:AGENT_VERSION};
    if(msg?.type==='enable') {
      if(!await api.permissions.contains({permissions:['nativeMessaging']}))
        throw new AgentBridgeError('E_PERMISSION_REQUIRED');
      enabled=true;await store.set({[AGENT_ENABLED_KEY]:true});connect();
      return {enabled,nativeConnected:ready};
    }
    if(msg?.type==='disable') {
      enabled=false;await store.set({[AGENT_ENABLED_KEY]:false});
      const old=port;port=null;ready=false;old?.disconnect();
      return {enabled:false,nativeConnected:false};
    }
    throw new AgentBridgeError('E_CAPABILITY');
  }
  const onRemoved=permissions=>{
    if(!permissions?.permissions?.includes('nativeMessaging'))return;
    enabled=false;store.set({[AGENT_ENABLED_KEY]:false}).catch(()=>{});
    const old=port;port=null;ready=false;old?.disconnect();
  };
  api.permissions.onRemoved?.addListener(onRemoved);
  return {ready:initial,handleSettings,acceptHostResponse,dispose() {
    disposed=true;enabled=false;const old=port;port=null;old?.disconnect();
    api.permissions.onRemoved?.removeListener(onRemoved);
  }};
}
