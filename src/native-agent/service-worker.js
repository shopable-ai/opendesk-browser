import {AGENT_VERSION,AGENT_HOST,AGENT_LEDGER_KEY,AGENT_ENABLED_KEY,AGENT_MAX_LEDGER,AGENT_MAX_BYTES,
  AGENT_MUTATIONS,AgentBridgeError,agentValidateRequest,agentDigest} from './protocol.js';
import {createLocalProjectService} from './local-project-service.js';

// Durable admission fence for optional external callers, NOT a second executor.
export function createNativeAgentService({api=globalThis.chrome,hostPorts=new Map()}={}) {
  let enabled=false,port=null,ready=false,disposed=false,generation=0,settingsGeneration=0;
  const pending=new Map(),store=api.storage.local;
  const projects=createLocalProjectService({api,hostPorts,connection:()=>({enabled,ready,port,generation})});
  const sequences={ledger:Promise.resolve(),settings:Promise.resolve()};
  function exclusive(action,key='ledger') {
    const next=sequences[key].then(action);
    sequences[key]=next.catch(()=>{});
    return next;
  }
  const writeEnabled=(value,intent)=>exclusive(()=>{
    if(value&&(disposed||intent!==settingsGeneration))throw new AgentBridgeError('E_PERMISSION');
    return store.set({[AGENT_ENABLED_KEY]:value});
  },'settings');
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
      const rows=await ledger(),previous=Object.hasOwn(rows,req.requestId)?rows[req.requestId]:null;
      if(previous) {
        if(previous.digest!==digest)throw new AgentBridgeError('E_REQUEST_CONFLICT');
        return previous;
      }
      if(Object.keys(rows).length>=AGENT_MAX_LEDGER)throw new AgentBridgeError('E_LIMIT');
      await store.set({[AGENT_LEDGER_KEY]:{...rows,[req.requestId]:{digest,method:req.method,registrationId:host.registrationId,state:'OUTCOME_UNKNOWN',
        createdAt:Date.now()}}});
      return null;
    });
  }
  async function finalize(req,reply) {
    await exclusive(async()=>{
      const rows=await ledger(),entry=Object.hasOwn(rows,req.requestId)?rows[req.requestId]:null;
      if(!entry||entry.state!=='OUTCOME_UNKNOWN')return;
      const updated={...entry,
        state:reply.error?(reply.error.outcome==='OUTCOME_UNKNOWN'?'OUTCOME_UNKNOWN':'FAILED_CONFIRMED'):'ACKNOWLEDGED',
        ...(reply.result?.runId?{runId:reply.result.runId}:{}),
        ...(reply.result?.previewId?{previewId:reply.result.previewId}:{}),
        ...(reply.error?.outcome==='OUTCOME_UNKNOWN'?{}:{reply}),
        updatedAt:Date.now()};
      await store.set({[AGENT_LEDGER_KEY]:{...rows,[req.requestId]:updated}});
    });
  }
  async function readAdmission(params){
    const keys=['registrationId','admissionRequestId','admissionMethod','requestDigest'];
    if(Object.keys(params).length!==keys.length||keys.some(k=>typeof params[k]!=='string')||
      !/^[A-Za-z0-9._:-]{1,100}$/.test(params.admissionRequestId)||!['run.start','page.preview'].includes(params.admissionMethod)||
      !/^[a-f0-9]{64}$/.test(params.requestDigest))throw new AgentBridgeError('E_SCHEMA');
    const rows=await ledger(),entry=Object.hasOwn(rows,params.admissionRequestId)?rows[params.admissionRequestId]:null;
    const identity={format:'opendesk.native-admission.v1',...params,hostAvailable:live().some(host=>host.registrationId===params.registrationId)};
    if(!entry)return {...identity,state:'NOT_FOUND'};
    if(entry.registrationId!==params.registrationId||entry.method!==params.admissionMethod||entry.digest!==params.requestDigest)throw new AgentBridgeError('E_PERMISSION');
    if(!['OUTCOME_UNKNOWN','ACKNOWLEDGED','FAILED_CONFIRMED'].includes(entry.state))throw new AgentBridgeError('E_EFFECT_UNKNOWN',undefined,'OUTCOME_UNKNOWN');
    if(entry.state!=='ACKNOWLEDGED')return {...identity,state:entry.state,...(entry.reply?.error?{error:entry.reply.error}:{})};
    const result=entry.reply?.result;if(!result)throw new AgentBridgeError('E_EFFECT_UNKNOWN',undefined,'OUTCOME_UNKNOWN');
    const allowed=entry.method==='run.start'?['runId','state','sourceKind','revision','target','executionTarget']:['kind','previewId','sourceHash','target','state','durable'];
    return {...identity,state:entry.state,admission:Object.fromEntries(allowed.filter(key=>Object.hasOwn(result,key)).map(key=>[key,result[key]]))};
  }
  async function assertRun(runId,host,preview=false) {
    if(typeof runId!=='string'||!runId)throw new AgentBridgeError('E_SCHEMA');
    // A run is owned by the exact registered Sidebar Host that admitted it.
    if(!Object.values(await ledger()).some(x=>x.method===(preview?'page.preview':'run.start')&&x[preview?'previewId':'runId']===runId&&
      x.registrationId===host.registrationId&&x.state==='ACKNOWLEDGED'))
      throw new AgentBridgeError('E_PERMISSION');
  }
  function dispatch(host,req) {
    // External request IDs may be reused by reads after reconnect. The Host ACK
    // must identify this exact dispatch, while the CLI still receives its own ID.
    const dispatchId=crypto.randomUUID();
    return new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>{
        pending.delete(dispatchId);
        reject(new AgentBridgeError('E_EFFECT_UNKNOWN',undefined,'OUTCOME_UNKNOWN'));
      },135000);
      pending.set(dispatchId,{host,resolve,reject,timeout});
      try{host.postMessage({type:'native-agent.request',registrationId:host.registrationId,
        request:{...req,dispatchId}});}
      catch{
        clearTimeout(timeout);pending.delete(dispatchId);
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
  function assertConnection(source,epoch) {
    if(disposed||!enabled)throw new AgentBridgeError('E_PERMISSION');
    if(!ready||port!==source||generation!==epoch)throw new AgentBridgeError('E_NATIVE_NOT_READY');
  }
  function invalidateConnection() {
    generation++;
    const old=port;port=null;ready=false;
    projects.disconnected();
    for(const [id,item] of pending) {
      clearTimeout(item.timeout);item.reject(new AgentBridgeError('E_EFFECT_UNKNOWN',undefined,'OUTCOME_UNKNOWN'));
      pending.delete(id);
    }
    return old;
  }
  async function handle(req,source,epoch) {
    agentValidateRequest(req);
    assertConnection(source,epoch);
    if(req.method==='bridge.status')return {extensionId:api.runtime.id,bridgeVersion:AGENT_VERSION,
      nativeConnected:ready,enabled,hostRegistrations:live().map(p=>p.registrationId)};
    if(req.method==='request.get'){
      if(!await api.permissions.contains({permissions:['nativeMessaging']}))throw new AgentBridgeError('E_PERMISSION');
      assertConnection(source,epoch);
      const result=await readAdmission(req.params);assertConnection(source,epoch);return result;
    }
    const host=hostFor(req.params);
    if(req.method==='run.get'||req.method==='run.stop')await assertRun(req.params.runId,host);
    if(req.method==='page.get')await assertRun(req.params.previewId,host,true);
    if(AGENT_MUTATIONS.includes(req.method)) {
      const old=await reserve(req,host);
      if(old) {
        assertConnection(source,epoch);
        if(old.reply)return normalize(req.requestId,old.reply);
        throw new AgentBridgeError('E_EFFECT_UNKNOWN',undefined,'OUTCOME_UNKNOWN');
      }
    }
    try {
      const granted=await api.permissions.contains({permissions:['nativeMessaging']});
      assertConnection(source,epoch);
      if(!granted)throw new AgentBridgeError('E_PERMISSION');
    }catch(e){
      // Reservation alone has no business effect. Persist its confirmed rejection
      // so a reconnect cannot turn this old admission into a first dispatch.
      if(AGENT_MUTATIONS.includes(req.method))try{await finalize(req,{error:error(e)});}catch{}
      throw e;
    }
    const reply=await dispatch(host,req);
    if(AGENT_MUTATIONS.includes(req.method)) {
      // The Host may have performed an action even if the ACK cannot be made durable.
      // Do not misreport a storage failure after dispatch as FAILED_CONFIRMED.
      try {await finalize(req,reply);}
      catch {throw new AgentBridgeError('E_EFFECT_UNKNOWN',undefined,'OUTCOME_UNKNOWN');}
    }
    return normalize(req.requestId,reply);
  }
  async function receive(req,source) {
    const id=typeof req?.requestId==='string'?req.requestId:'';
    let reply;
    try {
      const data=await handle(req,source,generation);
      reply=data?.kind==='response'?data:response(id,{result:data});
    }catch(e){reply=response(id,{error:error(e)});}
    if(new TextEncoder().encode(JSON.stringify(reply)).length>AGENT_MAX_BYTES)
      reply=response(id,{error:{code:'E_RESULT_LIMIT',message:'Native result exceeds 60 KiB; inspect the original run in OpenDesk. The program was not repeated.',outcome:'FAILED_CONFIRMED',...(req.params?.runId?{runId:req.params.runId}:{})}});
    if(port===source&&ready)try{source.postMessage(reply);}catch{}
  }
  function connect() {
    if(disposed||!enabled||port)return;
    let connected;
    try{connected=api.runtime.connectNative(AGENT_HOST);}catch{return;}
    port=connected;generation++;
    connected.onMessage.addListener(msg=>{
      if(port!==connected)return;
      if(msg?.v===AGENT_VERSION&&msg.kind==='hello'&&!ready) {
        ready=true;
        try{connected.postMessage({v:AGENT_VERSION,kind:'welcome',extensionId:api.runtime.id,
          extensionVersion:api.runtime.getManifest().version,localDevVersion:1});}catch{connected.disconnect();}
      }else if(ready&&projects.receive(msg)){ /* read-only project transport */ }
      else if(ready&&msg?.kind==='request')void receive(msg,connected);
      else connected.disconnect();
    });
    connected.onDisconnect.addListener(()=>{
      if(port===connected)invalidateConnection();
    });
  }
  const initial=(async()=>{
    const intent=settingsGeneration;
    const configuration=await store.get(AGENT_ENABLED_KEY);
    const granted=configuration[AGENT_ENABLED_KEY]===true&&
      await api.permissions.contains({permissions:['nativeMessaging']});
    if(disposed||intent!==settingsGeneration)return;
    enabled=granted;
    if(enabled)connect();
  })();
  initial.catch(()=>{});
  async function handleSettings(msg,sender) {
    if(sender?.id!==api.runtime.id||sender?.url!==api.runtime.getURL('native-agent/settings.html')||
      typeof sender.documentId!=='string')throw new AgentBridgeError('E_OWNER');
    await initial;
    if(msg?.type==='status')return {enabled,nativeConnected:ready,hostCount:live().length,
      extensionId:api.runtime.id,bridgeVersion:AGENT_VERSION,
      requiresReload:enabled&&!ready&&typeof api.runtime.connectNative!=='function'};
    if(msg?.type==='enable') {
      const intent=++settingsGeneration;
      const granted=await api.permissions.contains({permissions:['nativeMessaging']});
      if(disposed||intent!==settingsGeneration)throw new AgentBridgeError('E_PERMISSION');
      if(!granted)
        throw new AgentBridgeError('E_PERMISSION_REQUIRED');
      await writeEnabled(true,intent);
      if(disposed||intent!==settingsGeneration)throw new AgentBridgeError('E_PERMISSION');
      enabled=true;connect();
      return {enabled,nativeConnected:ready};
    }
    if(msg?.type==='disable') {
      settingsGeneration++;enabled=false;invalidateConnection()?.disconnect();
      await writeEnabled(false);
      return {enabled:false,nativeConnected:false};
    }
    throw new AgentBridgeError('E_CAPABILITY');
  }
  const onRemoved=permissions=>{
    if(!permissions?.permissions?.includes('nativeMessaging'))return;
    settingsGeneration++;enabled=false;invalidateConnection()?.disconnect();
    writeEnabled(false).catch(()=>{});
  };
  api.permissions.onRemoved?.addListener(onRemoved);
  return {ready:initial,handleSettings,acceptHostResponse,acceptHostRequest:projects.acceptHostRequest,dropHost:projects.dropHost,dispose() {
    settingsGeneration++;disposed=true;enabled=false;invalidateConnection()?.disconnect();
    api.permissions.onRemoved?.removeListener(onRemoved);
  }};
}
