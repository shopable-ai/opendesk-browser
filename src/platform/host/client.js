import {PROTOCOL, CONTRACT_VERSION, CONTRACT_HASH, FoundationError, newId} from '../protocol.js';
import {createLocalProjectClient} from '../../native-agent/local-project-client.js';
import {createWorkflowAIClient} from '../../native-agent/workflow-ai-client.js';

export function createHostClient(api = chrome, {requestTimeoutMs = 35000, reconnectDelayMs = 250, hostInstanceId = newId()} = {}) {
  const sourceListeners = new Map(), commandListeners = new Map(), runListeners = new Set(), connectionListeners = new Set(), nativeAgentListeners = new Set();
  const pending = new Set(), requestTimers = new Set(), runDeadlines = new Map();
  const localProjects=createLocalProjectClient(),workflowAI=createWorkflowAIClient();
  let registration, port, disposed = false, connected = false, connecting, reconnectTimer = null;
  let messageListening = false, disconnectListening = false;
  let messageHandler,disconnectHandler;
  async function raw(type, payload) {
    if (disposed) throw new FoundationError('E_OWNER', 'RunHost disposed');
    const request = {}; pending.add(request); let timer, transportStarted = false;
    try {
      const transport=Promise.resolve(api.runtime.sendMessage({protocol:PROTOCOL,type,payload,...(registration ? {registrationId:registration.registrationId} : {})}));
      transportStarted = true;
      transport.then(()=>pending.delete(request),()=>pending.delete(request));
      const runDeadline=runDeadlines.get(payload?.envelope?.identity?.runId);
      const timeout=type==='controllerOperation' && runDeadline ? Math.max(1,runDeadline-Date.now()+1000) : requestTimeoutMs;
      const response = await Promise.race([transport, new Promise((_, reject) => {
        timer = setTimeout(() => reject(new FoundationError('E_EFFECT_UNKNOWN', 'Worker response deadline exceeded; request was not replayed')), timeout); requestTimers.add(timer);
      })]);
      if (!response?.ok) throw new FoundationError(response?.error?.code || 'E_EFFECT_UNKNOWN', response?.error?.message || 'Worker response missing');
      if(type==='startControllerRun' && response.data?.deadlineAt) runDeadlines.set(response.data.runId,response.data.deadlineAt);
      if(type==='retireControllerTarget' && response.data?.state==='released') runDeadlines.delete(payload.runId);
      return response.data;
    } finally { if (!transportStarted) pending.delete(request); clearTimeout(timer); requestTimers.delete(timer); }
  }
  function onMessage(message) {
    if (!registration || message.registrationId !== registration.registrationId) return;
    // Both reverse-protocol clients need the same authenticated bind ACK.
    if(message.type==='host-bound'){localProjects.receive(message);workflowAI.receive(message);return;}
    if(workflowAI.receive(message)||localProjects.receive(message))return;
    if (message.type === 'native-agent.request') {
      for (const listener of nativeAgentListeners) Promise.resolve().then(() => listener(message.request)).catch(() => {});
      return;
    }
    const event = message.event;
    if (event?.selectionId) for (const listener of sourceListeners.get(event.selectionId) || []) listener(event);
    if (event?.commandId) for (const listener of commandListeners.get(event.commandId) || []) listener(event);
    if (event?.runId) for (const listener of runListeners) listener(event);
  }
  function removePortListeners() {
    if (messageListening) { port?.onMessage.removeListener?.(messageHandler); messageListening = false; }
    if (disconnectListening) { port?.onDisconnect?.removeListener?.(disconnectHandler); disconnectListening = false; }
  }
  function scheduleReconnect() {
    if (disposed || reconnectTimer !== null) return;
    reconnectTimer = setTimeout(() => { reconnectTimer = null; connect().catch(scheduleReconnect); }, reconnectDelayMs);
  }
  function onDisconnect() {
    localProjects.disconnect();workflowAI.disconnect();
    connected = false; removePortListeners(); port = undefined;
    for (const listener of connectionListeners) listener({connected:false});
    scheduleReconnect();
  }
  async function connect() {
    if (disposed) throw new FoundationError('E_OWNER', 'RunHost disposed');
    if (connected && registration) return registration;
    if (connecting) return connecting;
    clearTimeout(reconnectTimer); reconnectTimer = null;
    connecting = (async () => {
      const value = await raw('registerHost', {hostInstanceId, claimedContractVersion:CONTRACT_VERSION, claimedContractHash:CONTRACT_HASH});
      if (disposed) throw new FoundationError('E_OWNER', 'RunHost disposed');
      if (registration && value.registrationId !== registration.registrationId) throw new FoundationError('E_OWNER', 'Original registration cannot be replaced');
      registration = value;
      port = api.runtime.connect({name:PROTOCOL});
      localProjects.connect(port,value.registrationId);workflowAI.connect(port,value.registrationId);
      const exactPort=port;
      messageHandler=message=>{if(port===exactPort)onMessage(message);};
      disconnectHandler=()=>{if(port===exactPort)onDisconnect();};
      port.onMessage.addListener(messageHandler); messageListening = true;
      port.onDisconnect?.addListener(disconnectHandler); disconnectListening = true;
      port.postMessage({type:'bind-host',registrationId:value.registrationId}); connected = true;
      for (const listener of connectionListeners) listener({connected:true,registration:value});
      return value;
    })().finally(() => { connecting = null; });
    return connecting;
  }
  const ready = connect(); ready.catch(scheduleReconnect);
  async function send(type, payload) { await connect(); return raw(type,payload); }
  const subscribe = (map,key,listener) => { const set=map.get(key)||new Set();set.add(listener);map.set(key,set);return()=>{set.delete(listener);if(!set.size)map.delete(key);}; };
  const pagePort = {};
  for (const method of ['openSourceContext','startSourceSelection','cancelSourceSelection','releaseSourceContext','previewSource',
    'prepareCommand','dispatchCommand','createTarget','reconcileTargetCreation','bindTarget','confirmCommand','ackPageFrame','ackSourceFrame']) {
    pagePort[method] = request => send(method, request);
  }
  pagePort.subscribeSourceSelection = ({selectionId}, listener) => subscribe(sourceListeners,selectionId,listener);
  pagePort.subscribeCommand = ({commandId}, listener) => subscribe(commandListeners,commandId,listener);
  const storage = {};
  for (const method of ['saveTemplate','listTemplates','getTemplateRevision','renameTemplate','beginPage','stagePageBatch','sealPage',
    'readRecords','openReaderPin','releaseReaderPin','deleteRun','exportTemplateBackup','importTemplateBackup']) {
    storage[method] = request => send(method, request);
  }
  const exportBridge = {};
  for (const method of ['prepareExport','dispatchDownload','reconcileDownload','retryExport','prepareArtifact','prepareAttempt','abandonExport']) {
    exportBridge[method] = request => send(method,request);
  }
  // These methods share this document's one registration and transport. A UI
  // injects this client into RunHost instead of registering a second owner.
  const controller = Object.fromEntries(['commitControllerScript','getControllerScript','listControllerScripts','tombstoneControllerScript','garbageCollectControllerScript','startControllerRun',
    'controllerOperation','stopControllerRun','finishControllerRun','snapshotControllerRun','retireControllerTarget']
    .map(method => [method, request => send(method, request)]));
  return {get ready(){return connect();}, request:send, reconnect:connect,
    requestLocalProject:async(method,params)=>{await connect();return localProjects.request(method,params);},
    subscribeLocalProjects:localProjects.subscribe,
    requestWorkflowAI:async(method,params={},sessionId=null)=>{await connect();return workflowAI.request(method,params,sessionId);},
    subscribeWorkflowAI:workflowAI.subscribe,
    subscribeConnection: listener => {connectionListeners.add(listener); return () => connectionListeners.delete(listener);},
    subscribeNativeAgent: listener => {nativeAgentListeners.add(listener);return () => nativeAgentListeners.delete(listener);},
    replyNativeAgent: reply => {if (!connected || !port || !registration) throw new FoundationError('E_HOST_CLOSED');
      port.postMessage({type:'native-agent.response',registrationId:registration.registrationId,...reply});},
    pagePort, storage, exportBridge,
    controller,
    entitlement:{getSnapshot:()=>send('getEntitlementSnapshot',{}), install:request=>send('installEntitlement',request)},
    runCommands:Object.fromEntries(['claimRun','stopRun','abandonUnknown','retireTarget','snapshotRun','finishRun'].map(method=>[method,request=>send(method,request)])),
    subscribeRun:listener=>{runListeners.add(listener);return()=>runListeners.delete(listener);},
    get registration(){return registration;}, get hostInstanceId(){return hostInstanceId;},
    resourceSnapshot: () => ({pending:pending.size+localProjects.snapshot().pending+workflowAI.snapshot().pending, subscriptions: [...sourceListeners.values(),...commandListeners.values()]
      .reduce((count,listeners)=>count+listeners.size,runListeners.size+connectionListeners.size+nativeAgentListeners.size) + Number(messageListening) + Number(disconnectListening)+localProjects.snapshot().subscriptions+workflowAI.snapshot().subscriptions,
      timers:requestTimers.size + Number(reconnectTimer !== null)+localProjects.snapshot().timers+workflowAI.snapshot().timers, ports:Number(connected)}),
    dispose(){if(disposed)return;disposed=true;localProjects.dispose();workflowAI.dispose();clearTimeout(reconnectTimer);reconnectTimer=null;connectionListeners.clear();sourceListeners.clear();commandListeners.clear();runListeners.clear();nativeAgentListeners.clear();removePortListeners();connected=false;port?.disconnect();port=undefined;}};
}
