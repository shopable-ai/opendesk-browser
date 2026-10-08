import {AgentBridgeError, agentObject, agentTargetFromSnapshot, agentSameTarget} from './protocol.js';
import {permissionPattern} from '../environment.js';

// A live Side Panel owns this adapter and the EXISTING RunHost instance.
// The SW forwards only to its authenticated registered host port.
export function createNativeAgentHostAdapter({client, host, currentPageTarget, api = globalThis.chrome} = {}) {
  let disposed = false;
  const requireReady = async () => {
    if (disposed) throw new AgentBridgeError('E_HOST_NOT_READY');
    await client.ready;
    if (!client.registration?.registrationId) throw new AgentBridgeError('E_HOST_NOT_READY');
  };
  async function freshTarget() {
    await currentPageTarget.ready;
    await currentPageTarget.refresh();
    return agentTargetFromSnapshot(currentPageTarget.capture());
  }
  async function handle(request) {
    await requireReady();
    const {method, params = {}} = request;
    if (method === 'target.current') {
      const target = await freshTarget();
      return {registrationId:client.registration.registrationId,target};
    }
    if (method === 'script.save') {
      if (!/^[a-zA-Z0-9._:-]{1,128}$/.test(params.scriptId || '') ||
        !Number.isSafeInteger(params.expectedRevision) || params.expectedRevision < 0 ||
        typeof params.sourceUtf8 !== 'string' || !params.sourceUtf8.trim())
        throw new AgentBridgeError('E_SCHEMA', 'Explicit scriptId, expectedRevision and sourceUtf8 required');
      return host.controller.commitControllerScript({scriptId:params.scriptId,
        expectedRevision:params.expectedRevision,sourceUtf8:params.sourceUtf8});
    }
    if (method === 'run.start') {
      if (!agentObject(params.source) || !agentObject(params.target) ||
        !agentObject(params.params) || host.currentRun) throw new AgentBridgeError(host.currentRun ? 'E_OWNER' : 'E_SCHEMA');
      const current = await freshTarget();
      if (!agentSameTarget(current, params.target)) throw new AgentBridgeError('E_DOCUMENT_STALE', 'Target snapshot must match the live Sidebar window');
      // Native callbacks MUST NOT call permissions.request. Users grant hosts in Chrome UI.
      if (!await api.permissions.contains({origins:[permissionPattern(current.url)]}))
        throw new AgentBridgeError('E_PERMISSION_REQUIRED', 'Grant this website in the Sidebar first');
      await currentPageTarget.revalidate({...current,status:'available'});
      let source;
      if (params.source.kind === 'draft' && typeof params.source.sourceUtf8 === 'string' && params.source.sourceUtf8.trim()) {
        source = {kind:'draft',sourceUtf8:params.source.sourceUtf8};
      } else if (params.source.kind === 'saved' &&
          typeof params.source.scriptId === 'string' &&
          Number.isSafeInteger(params.source.revision) && params.source.revision > 0 &&
          /^[a-f0-9]{64}$/.test(params.source.contentHash || '')) {
        source = {kind:'saved',scriptId:params.source.scriptId,revision:params.source.revision,contentHash:params.source.contentHash};
      } else throw new AgentBridgeError('E_SCHEMA', 'Specify frozen draft source or saved revision/hash');
      const deadlineMs = params.deadlineMs === undefined ? 30000 : params.deadlineMs;
      if (!Number.isSafeInteger(deadlineMs) || deadlineMs < 1000 || deadlineMs > 120000)
        throw new AgentBridgeError('E_SCHEMA', 'deadlineMs must be 1000..120000');
      const claim = await host.start({source,params:params.params,
        target:{mode:'borrowed',tabId:current.tabId,frameId:0,documentId:current.documentId,
          expectedUrl:current.url,expectedWindowId:current.windowId},
        deadlineAt:Date.now()+deadlineMs,requestId:request.requestId});
      // Admission is not script completion. Query the original durable controller result.
      return {runId:claim.runId,state:claim.state,sourceKind:claim.sourceKind,revision:claim.revision,
        completion:'PENDING',target:current};
    }
    if (method === 'run.get') {
      if (typeof params.runId !== 'string' || !params.runId) throw new AgentBridgeError('E_SCHEMA');
      return host.controller.snapshotControllerRun({runId:params.runId});
    }
    if (method === 'run.stop') {
      if (typeof params.runId !== 'string' || !params.runId) throw new AgentBridgeError('E_SCHEMA');
      return host.stop({runId:params.runId,controller:true,reason:'E_CANCELLED',requestId:request.requestId});
    }
    throw new AgentBridgeError('E_CAPABILITY', 'No authorized Host method');
  }
  const unsubscribe = client.subscribeNativeAgent(async request => {
    let result, error;
    try { result = await handle(request); }
    catch (e) { error = {code:e.code || 'E_EFFECT_UNKNOWN',message:e.message || 'Bridge request failed',
      outcome:e.outcome || (e.code === 'E_EFFECT_UNKNOWN' ? 'OUTCOME_UNKNOWN' : 'FAILED_CONFIRMED')}; }
    try { client.replyNativeAgent({requestId:request.requestId,...(error ? {error} : {result})}); }
    catch { /* Browser host state is authoritative; never replay. */ }
  });
  return {handle,dispose() {disposed=true;unsubscribe();}};
}
