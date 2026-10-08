import {AGENT_VERSION,AGENT_HOST,AGENT_CONFIG_PROTOCOL,AGENT_LEDGER_KEY,AGENT_ENABLED_KEY,
  AGENT_MAX_LEDGER,AGENT_MUTATIONS,AgentBridgeError,agentValidateRequest,agentDigest} from './protocol.js';

const errorReply = (requestId,error,outcome) => ({v:AGENT_VERSION,kind:'response',requestId,
  error:{code:error?.code || 'E_EFFECT_UNKNOWN',message:error?.message || 'Native bridge operation failed',
    outcome:outcome || error?.outcome || 'FAILED_CONFIRMED'}});
const successReply = (requestId,result) => ({v:AGENT_VERSION,kind:'response',requestId,result});

// Chrome SW handles IPC and idempotence only. It NEVER admits Controller Runs directly.
export function createNativeAgentService({api = globalThis.chrome,hostPorts = new Map(),clock = {now:()=>Date.now()}} = {}) {
  let enabled = false, nativePort = null, nativeReady = false, disposed = false, serial = Promise.resolve();
  const pending = new Map();
  function exclusive(fn) {
    const next = serial.then(fn);
    serial = next.catch(() => {});
    return next;
  }
  const ports = () => [...hostPorts.values()].filter(p => typeof p?.registrationId === 'string');
  function selectHost(params) {
    const available = ports(), requested = params?.registrationId;
    if (requested !== undefined && (typeof requested !== 'string' || !requested))
      throw new AgentBridgeError('E_SCHEMA','Invalid registrationId');
    const matches = requested ? available.filter(p => p.registrationId === requested) : available;
    if (!matches.length) throw new AgentBridgeError('E_HOST_NOT_READY','Open the real Sidebar Host before calling this API');
    if (matches.length !== 1) throw new AgentBridgeError('E_HOST_AMBIGUOUS','Select an exact registrationId');
    return matches[0];
  }
  async function readLedger() {
    const value = (await api.storage.local.get(AGENT_LEDGER_KEY))[AGENT_LEDGER_KEY];
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }
  async function reserve(request,host) {
    const digest = await agentDigest({method:request.method,params:request.params,registrationId:host.registrationId});
    return exclusive(async () => {
      const ledger = await readLedger(), old = ledger[request.requestId];
      if (old) {
        if (old.digest !== digest) throw new AgentBridgeError('E_REQUEST_CONFLICT','Same requestId has different frozen inputs');
        return {duplicate:true,record:old};
      }
      if (Object.keys(ledger).length >= AGENT_MAX_LEDGER)
        throw new AgentBridgeError('E_LIMIT','Bridge request journal full: investigate and rotate in a controlled way');
      const record = {digest,method:request.method,registrationId:host.registrationId,
        state:'OUTCOME_UNKNOWN',createdAt:clock.now()};
      ledger[request.requestId] = record;
      await api.storage.local.set({[AGENT_LEDGER_KEY]:ledger});
      return {duplicate:false,record};
    });
  }
  async function finalize(requestId,reply) {
    return exclusive(async () => {
      const ledger = await readLedger(), record = ledger[requestId];
      if (!record || record.state !== 'OUTCOME_UNKNOWN') return;
      const next = {...record,state:reply.error ? (reply.error.outcome === 'OUTCOME_UNKNOWN' ? 'OUTCOME_UNKNOWN' : 'FAILED_CONFIRMED') : 'ACKNOWLEDGED',
        ...(reply.result?.runId ? {runId:reply.result.runId} : {}),
        ...(reply.error && reply.error.outcome !== 'OUTCOME_UNKNOWN' ? {reply} : {}),
        ...(!reply.error ? {reply} : {}),
        updatedAt:clock.now()};
      ledger[requestId] = next;
      await api.storage.local.set({[AGENT_LEDGER_KEY]:ledger});
    });
  }
  async function assertOwnedRun(runId) {
    if (typeof runId !== 'string' || !runId) throw new AgentBridgeError('E_SCHEMA','Explicit runId required');
    const ledger = await readLedger();
    if (!Object.values(ledger).some(item => item.method === 'run.start' && item.runId === runId))
      throw new AgentBridgeError('E_PERMISSION','Native Agent can only inspect/stop its own acknowledged runs');
  }
  async function dispatch(host,request) {
    return new Promise((resolve,reject) => {
      const timeout = setTimeout(() => {
        pending.delete(request.requestId);
        reject(new AgentBridgeError('E_EFFECT_UNKNOWN','Host response timed out; never replay side effects','OUTCOME_UNKNOWN'));
      },135000);
      pending.set(request.requestId,{host,resolve,reject,timeout});
      try {
        host.postMessage({type:'native-agent.request',registrationId:host.registrationId,request});
      } catch (error) {
        clearTimeout(timeout);pending.delete(request.requestId);
        reject(new AgentBridgeError('E_EFFECT_UNKNOWN','Host port closed during dispatch','OUTCOME_UNKNOWN'));
      }
    });
  }
  function acceptHostResponse(port,message) {
    if (message?.type !== 'native-agent.response' || typeof message.requestId !== 'string') return false;
    const operation = pending.get(message.requestId);
    if (!operation || operation.host !== port || message.registrationId !== port.registrationId) return true;
    pending.delete(message.requestId);clearTimeout(operation.timeout);
    if (!!message.error === !!Object.hasOwn(message,'result')) {
      operation.reject(new AgentBridgeError('E_EFFECT_UNKNOWN','Host response schema invalid','OUTCOME_UNKNOWN'));
    } else operation.resolve(message);
    return true;
  }
  async function handleNative(request) {
    agentValidateRequest(request);
    if (!enabled) throw new AgentBridgeError('E_PERMISSION','Native Agent integration is disabled');
    if (request.method === 'bridge.status') return {extensionId:api.runtime.id,bridgeVersion:AGENT_VERSION,
      nativeConnected:nativeReady,enabled,hostRegistrations:ports().map(p=>p.registrationId)};
    if (['run.get','run.stop'].includes(request.method)) await assertOwnedRun(request.params.runId);
    const host = selectHost(request.params);
    if (AGENT_MUTATIONS.includes(request.method)) {
      const existing = await reserve(request,host);
      if (existing.duplicate) {
        if (existing.record.reply) return existing.record.reply;
        throw new AgentBridgeError('E_EFFECT_UNKNOWN','This request was dispatched earlier; use run.get with a known runId, do not retry','OUTCOME_UNKNOWN');
      }
    }
    let reply;
    try { reply = await dispatch(host,request); }
    catch (error) {
      if (AGENT_MUTATIONS.includes(request.method)) {
        // Persist the unknown state. Even a lost ACK may follow a real effect.
        throw error;
      }
      throw error;
    }
    if (AGENT_MUTATIONS.includes(request.method)) await finalize(request.requestId,reply);
    return reply;
  }
  async function receive(message) {
    let requestId = typeof message?.requestId === 'string' ? message.requestId : '';
    let reply;
    try {
      const value = await handleNative(message);
      reply = value?.kind === 'response' ? value : successReply(requestId,value);
    } catch (error) {
      reply = errorReply(requestId,error,error?.outcome);
      if (AGENT_MUTATIONS.includes(message?.method) && error?.code !== 'E_EFFECT_UNKNOWN') {
        // A pre-dispatch error does not create a journal. Existing dispatched errors
        // are finalized only when the authenticated Host supplied its real reply.
      }
    }
    try {nativePort?.postMessage(reply);}catch {/* Native disconnect: no replay. */}
  }
  function connect() {
    if (disposed || !enabled || nativePort) return;
    let port;
    try {port = api.runtime.connectNative(AGENT_HOST);} catch {return;}
    nativePort = port;
    port.onMessage.addListener(message => {
      if (nativePort !== port) return;
      if (message?.v === AGENT_VERSION && message.kind === 'hello') {
        if (nativeReady) {port.disconnect();return;}
        nativeReady = true;
        try {port.postMessage({v:AGENT_VERSION,kind:'welcome',extensionId:api.runtime.id,
          extensionVersion:api.runtime.getManifest().version});}catch {port.disconnect();}
      } else if (nativeReady && message?.kind === 'request') {void receive(message);}
      else port.disconnect();
    });
    port.onDisconnect.addListener(() => {
      if (nativePort === port) {nativePort=null;nativeReady=false;}
      for (const [id,entry] of pending) {
        clearTimeout(entry.timeout);entry.reject(new AgentBridgeError('E_EFFECT_UNKNOWN','Native disconnected','OUTCOME_UNKNOWN'));
        pending.delete(id);
      }
      // No automatic re-dispatch or hidden restart after an uncertain disconnect.
    });
  }
  async function initial() {
    const config = await api.storage.local.get(AGENT_ENABLED_KEY);
    const granted = await api.permissions.contains({permissions:['nativeMessaging']});
    enabled = config[AGENT_ENABLED_KEY] === true && granted;
    if (enabled) connect();
  }
  const ready = initial();
  ready.catch(() => {});
  async function handleSettings(message,sender) {
    if (sender?.id !== api.runtime.id || sender?.url !== api.runtime.getURL('native-agent/settings.html') ||
      typeof sender.documentId !== 'string') throw new AgentBridgeError('E_OWNER','Only the packaged bridge settings page can configure it');
    await ready;
    if (message?.type === 'status') return {enabled,nativeConnected:nativeReady,hostCount:ports().length,
      extensionId:api.runtime.id,bridgeVersion:AGENT_VERSION};
    if (message?.type === 'enable') {
      if (!await api.permissions.contains({permissions:['nativeMessaging']}))
        throw new AgentBridgeError('E_PERMISSION_REQUIRED','Grant Native Messaging from the real Settings click');
      enabled=true;await api.storage.local.set({[AGENT_ENABLED_KEY]:true});connect();
      return {enabled,nativeConnected:nativeReady};
    }
    if (message?.type === 'disable') {
      enabled=false;await api.storage.local.set({[AGENT_ENABLED_KEY]:false});
      const port = nativePort;nativePort=null;nativeReady=false;port?.disconnect();
      return {enabled:false,nativeConnected:false};
    }
    throw new AgentBridgeError('E_CAPABILITY','Unknown bridge settings operation');
  }
  const onPermissionsRemoved = removed => {
    if (removed?.permissions?.includes('nativeMessaging')) {
      enabled=false;api.storage.local.set({[AGENT_ENABLED_KEY]:false}).catch(()=>{});
      const p=nativePort;nativePort=null;nativeReady=false;p?.disconnect();
    }
  };
  api.permissions.onRemoved?.addListener(onPermissionsRemoved);
  return {ready,handleSettings,acceptHostResponse,dispose() {
    disposed=true;enabled=false;const p=nativePort;nativePort=null;p?.disconnect();
    api.permissions.onRemoved?.removeListener(onPermissionsRemoved);
  }};
}
