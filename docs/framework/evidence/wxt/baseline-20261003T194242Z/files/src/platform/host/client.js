import {PROTOCOL, CONTRACT_VERSION, CONTRACT_HASH, FoundationError, newId} from '../protocol.js';

export function createHostClient(api = chrome) {
  const hostInstanceId = newId();
  const sourceListeners = new Map(), commandListeners = new Map(), runListeners = new Set();
  const port = api.runtime.connect({name:PROTOCOL});
  let registration, disposed = false;
  async function send(type, payload, registered = true) {
    if (disposed) throw new FoundationError('E_OWNER', 'RunHost disposed');
    if (registered) await ready;
    const response = await api.runtime.sendMessage({protocol:PROTOCOL, type, payload,
      ...(registration ? {registrationId:registration.registrationId} : {})});
    if (!response?.ok) throw new FoundationError(response?.error?.code || 'E_EFFECT_UNKNOWN', response?.error?.message || 'Worker response missing');
    return response.data;
  }
  const ready = send('registerHost', {hostInstanceId, claimedContractVersion:CONTRACT_VERSION, claimedContractHash:CONTRACT_HASH}, false)
    .then(value => { registration=value; port.postMessage({type:'bind-host',registrationId:value.registrationId}); return value; });
  port.onMessage.addListener(message => {
    if (!registration || message.registrationId !== registration.registrationId) return;
    const event = message.event;
    if (event?.selectionId) for (const listener of sourceListeners.get(event.selectionId) || []) listener(event);
    if (event?.commandId) for (const listener of commandListeners.get(event.commandId) || []) listener(event);
    if (event?.runId) for (const listener of runListeners) listener(event);
  });
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
  const controller = Object.fromEntries(['commitControllerScript','getControllerScript','tombstoneControllerScript','garbageCollectControllerScript','startControllerRun',
    'controllerOperation','stopControllerRun','finishControllerRun','snapshotControllerRun','retireControllerTarget']
    .map(method => [method, request => send(method, request)]));
  return {ready, request:send, pagePort, storage, exportBridge,
    controller,
    entitlement:{getSnapshot:()=>send('getEntitlementSnapshot',{}), install:request=>send('installEntitlement',request)},
    runCommands:Object.fromEntries(['claimRun','stopRun','abandonUnknown','retireTarget','snapshotRun','finishRun'].map(method=>[method,request=>send(method,request)])),
    subscribeRun:listener=>{runListeners.add(listener);return()=>runListeners.delete(listener);},
    get registration(){return registration;}, get hostInstanceId(){return hostInstanceId;},
    dispose(){disposed=true;sourceListeners.clear();commandListeners.clear();runListeners.clear();port.disconnect();}};
}
