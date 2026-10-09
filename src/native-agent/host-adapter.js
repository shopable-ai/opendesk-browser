import {AgentBridgeError, agentObject, agentTargetFromSnapshot, agentSameTarget} from './protocol.js';
import {permissionPattern} from '../environment.js';
import {sha256Utf8} from '../scripting/user-scripts/page-program-package.js';
import {validatePageProgramRules} from '../scripting/user-scripts/page-program-contract.js';

// A live Side Panel owns this adapter and the EXISTING RunHost instance.
// The SW forwards only to its authenticated registered host port.
export function createNativeAgentHostAdapter({client, host, currentPageTarget, api = globalThis.chrome} = {}) {
  let disposed = false;
  const previews=new Map();
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
    if(method==='page.preview') {
      if(host.currentRun)throw new AgentBridgeError('E_OWNER');
      if(typeof params.sourceUtf8!=='string'||!['async-main','classic-userscript'].includes(params.entryFormat)||!agentObject(params.target))throw new AgentBridgeError('E_SCHEMA');
      if(previews.size>=64)throw new AgentBridgeError('E_LIMIT');
      const current=await freshTarget();
      if(!agentSameTarget(current,params.target))throw new AgentBridgeError('E_DOCUMENT_STALE');
      if(!await api.permissions.contains({origins:[permissionPattern(current.url)]}))throw new AgentBridgeError('E_PERMISSION_REQUIRED');
      if(params.pageRules){
        const rules=validatePageProgramRules(params.pageRules);
        const included=await api.tabs.query({url:rules.matches});
        const excluded=rules.excludeMatches.length?await api.tabs.query({url:rules.excludeMatches}):[];
        if(!included.some(t=>t.id===current.tabId)||excluded.some(t=>t.id===current.tabId))throw new AgentBridgeError('E_DEV_ORIGIN');
      }
      if(params.sourceHash!==await sha256Utf8(params.sourceUtf8)||params.sourceBytes!==new TextEncoder().encode(params.sourceUtf8).length)
        throw new AgentBridgeError('E_DEV_HASH');
      await currentPageTarget.revalidate({...current,status:'available'});
      const previewId=crypto.randomUUID(),row={kind:'page-userscript',previewId,sourceHash:params.sourceHash,target:current,state:'preview-pending',durable:false};
      previews.set(previewId,row);
      // One existing USER_SCRIPT preview promise; this adapter neither starts a
      // Controller nor evaluates code. Page identities never masquerade as runId.
      Promise.resolve().then(()=>client.request('previewPageScript',{sourceUtf8:params.sourceUtf8,entryFormat:params.entryFormat,lockId:null,
        target:{tabId:current.tabId,frameId:0,documentId:current.documentId,expectedUrl:current.url,expectedWindowId:current.windowId}}))
        .then(result=>{
          if(result.sourceHash!==row.sourceHash||result.world!=='USER_SCRIPT'||result.documentId!==current.documentId||result.tabId!==current.tabId)
            throw new AgentBridgeError('E_DEV_HASH',undefined,'OUTCOME_UNKNOWN');
          Object.assign(row,{state:result.state,result});
        }).catch(error=>Object.assign(row,{state:error.code==='E_EFFECT_UNKNOWN'?'preview-unknown':'preview-failed',error:{code:error.code||'E_EFFECT_UNKNOWN',message:error.message,outcome:error.outcome||(error.code==='E_EFFECT_UNKNOWN'?'OUTCOME_UNKNOWN':'FAILED_CONFIRMED')}}));
      return {...row};
    }
    if(method==='page.get') {
      const row=previews.get(params.previewId);if(!row)throw new AgentBridgeError('E_DEV_PREVIEW','Preview belongs to another or closed Host');
      if(!await api.permissions.contains({origins:[permissionPattern(row.target.url)]}))throw new AgentBridgeError('E_PERMISSION');
      return structuredClone(row);
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
        if((params.sourceHash!==undefined||params.sourceBytes!==undefined) && (params.sourceHash!==await sha256Utf8(source.sourceUtf8)||
          params.sourceBytes!==new TextEncoder().encode(source.sourceUtf8).length))
          throw new AgentBridgeError('E_DEV_HASH','Local development execution bytes do not match their SHA-256');
      } else if (params.source.kind === 'saved' &&
          typeof params.source.scriptId === 'string' &&
          Number.isSafeInteger(params.source.revision) && params.source.revision > 0 &&
          /^[a-f0-9]{64}$/.test(params.source.contentHash || '')) {
        if(params.sourceHash!==undefined||params.sourceBytes!==undefined)throw new AgentBridgeError('E_SCHEMA','Saved runs use their pinned contentHash');
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
        completion:'PENDING',target:current,executionTarget:claim.target};
    }
    if (method === 'run.get') {
      if (typeof params.runId !== 'string' || !params.runId) throw new AgentBridgeError('E_SCHEMA');
      const snapshot=await host.controller.snapshotControllerRun({runId:params.runId});
      // Controller projection can include every historical run in this namespace.
      // External callers may only observe their specifically authorized run.
      return {run:snapshot.run,results:snapshot.results,downloads:snapshot.downloads,
        resultDeliveryDenied:(snapshot.resultDeliveryDenied||[]).filter(id=>id===params.runId),
        slotAvailable:snapshot.slotAvailable};
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
    try { client.replyNativeAgent({requestId:request.dispatchId??request.requestId,...(error ? {error} : {result})}); }
    catch { /* Browser host state is authoritative; never replay. */ }
  });
  return {handle,dispose() {disposed=true;unsubscribe();}};
}
