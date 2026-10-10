import {createScrapingModule} from './features/scraping/index.js';
import {CONTRACT_VERSION, CONTRACT_HASH} from './environment.js';
import {createHostClient} from './platform/host/client.js';
import {createHostBlobRegistry} from './platform/downloads/blob-lifecycle.js';
import {FoundationError, BUDGETS} from './platform/protocol.js';
import {createRunContext} from './framework/context.js';
import {createControlController} from './scripting/sandbox/controller.js';
import {encodeValue, decodeValue} from './platform/page-port/codec.js';
import {decodeValue as decodeControlValue} from './framework/control/value.js';
import {RESULT_TRANSFER_LIMITS} from './framework/control/result-transfer.js';

// Engineering entry only.02B supplies controller/services;03 supplies the domain module.
export function createEnvironmentHost() {
  const module = createScrapingModule({contracts: {contractVersion: CONTRACT_VERSION, contractHash: CONTRACT_HASH},
    storage: null, pagePort: null, runCommands: null, exportBridge: null, entitlement: null, clock: {now: () => Date.now()}});
  return {module, handshake: module.contractHandshake(), productionRunHostImplemented: false, dispose: () => module.dispose()};
}

// The visible extension document owns the long-lived core loop. The worker only
// commits short control operations and performs individually journalled effects.
export function createRunHost({api = globalThis.chrome, client: suppliedClient, clock = {now:()=>Date.now()},
  document: doc = globalThis.document, controllerFactory = createControlController,
  templateModuleFactory = createScrapingModule} = {}) {
  const client = suppliedClient || createHostClient(api);
  const controllerResources = new Set();
  const contextResources = new Set();
  const artifactResources = createHostBlobRegistry({clock});
  const ownsClient = !suppliedClient;
  const contracts = {contractVersion:CONTRACT_VERSION, contractHash:CONTRACT_HASH, compilerVersion:'1.0.0', budgets:BUDGETS,
    capabilities:['dom.top.v1','read.text.v1','read.attribute.v1','transform.safe.v1','pagination.none.v1',
      'pagination.next-link.v1','pagination.next-button.v1','page.stage-seal.v1','download.receipt.v1']};
  let active, disposed = false, lastCompletion = Promise.resolve(null);
  const observers = new Set(), admissions = new Set();
  const notify = value => { for (const observer of observers) { try { observer(value); } catch {} } };
  const runCommands = {...client.runCommands, start, stop};
  const services = {contracts, storage:client.storage, pagePort:client.pagePort, runCommands,
    exportBridge:client.exportBridge, entitlement:client.entitlement, clock};
  // The scraping module remains available only to the legacy template branch.
  // Ordinary JS admission/execution never compiles or admits a TemplateRevision.
  let scraping;
  const getModule = () => {
    if (typeof templateModuleFactory !== 'function')
      throw new FoundationError('E_MODULE_NOT_INSTALLED', 'Template module is disabled or unregistered');
    return scraping ||= templateModuleFactory(services);
  };
  const controls = client.controller || Object.fromEntries(['commitControllerScript','getControllerScript','tombstoneControllerScript','garbageCollectControllerScript','startControllerRun',
    'controllerOperation','stopControllerRun','finishControllerRun','snapshotControllerRun','retireControllerTarget']
    .map(method => [method, request => client.request(method, request)]));
  async function start(request) {
    if (request?.source !== undefined || request?.scriptId !== undefined)
      return startController(request);
    return startScraping(request);
  }
  async function startController({scriptId, revision, contentHash, source, params, target, expectedTaskGeneration, expectedTaskInstallationId,
    deadlineAt = clock.now() + 30000, requestId = crypto.randomUUID()}) {
    if (disposed || active) throw new FoundationError('E_OWNER', 'RunHost already owns a task or is disposed');
    // Reserve locally before the first await; the durable @slot remains the
    // cross-host authority. Serialization failure creates no admission.
    // Capture the caller's exact source variant before the first await. The
    // service worker hashes and durably authenticates draft bytes at admission.
    // Legacy saved runs retain their original r1 pin request unchanged.
    const sourceRequest = source === undefined ? {scriptId, revision, contentHash} : {source: structuredClone(source)};
    // Keep the exact target captured by the caller even while client.ready is pending.
    // The UI's trusted-click snapshot is necessary but must not rely on caller object ownership.
    const capturedTarget = structuredClone(target);
    const paramsWire = encodeValue(params), local = {controllerRun: true, state: 'preparing', controller: new AbortController()};
    let admitted, admissionDone;
    const admission = new Promise(resolve => { admissionDone = resolve; }); admissions.add(admission);
    active = local;
    try {
      await client.ready;
      if (disposed) throw new FoundationError('E_HOST_CLOSED', 'RunHost disposed during admission');
      const claim = await controls.startControllerRun({...sourceRequest, paramsWire, target: capturedTarget, deadlineAt, requestId,
        ...(expectedTaskGeneration!==undefined?{expectedTaskGeneration}:{}),
        ...(expectedTaskInstallationId!==undefined?{expectedTaskInstallationId}:{})});
      local.runId = claim.runId;
      if (claim.duplicate) throw new FoundationError('E_EFFECT_UNKNOWN', 'Existing run is observable; its script is never replayed');
      admitted = claim;
      if (disposed || local.controller.signal.aborted) {
        await controls.stopControllerRun({runId: claim.runId, requestId: crypto.randomUUID(), reason: 'E_HOST_CLOSED'});
        throw new FoundationError('E_HOST_CLOSED', 'RunHost closed during admission');
      }
      const context = createRunContext({identity: claim.identity, revision: claim.revision, target: claim.target,
        transport: {request: envelope => controls.controllerOperation({envelope})}, signal: local.controller.signal,
        deadline: performance.now() + Math.max(0, claim.deadlineAt - clock.now()), dom: doc});
      local.context = context;
      contextResources.add(context);
      const controller = controllerFactory({context, document: doc,
        sandboxURL: api.runtime.getURL('scripting/sandbox/sandbox.html'),
        workerURL: api.runtime.getURL('scripting/sandbox/worker-runtime.js')});
      local.control = controller; controllerResources.add(controller);
      Promise.resolve(controller.resourceReleased || controller.retired).then(()=>controllerResources.delete(controller),()=>{});
      local.state = 'running'; notify(claim);
      local.completion = lastCompletion = completeController(local, claim, controller);
      return claim;
    } catch (error) {
      if (admitted && !local.control) {
        local.context?.dispose(); contextResources.delete(local.context); local.runId=admitted.runId;
        local.settlementRequest={runId:admitted.runId,requestId:`${admitted.runId}:finish`,status:disposed?'host-closed':'error',
          error:{code:error.code||'E_CONTROL_EXECUTION',message:error.message},workerRetired:true};
        try {lastCompletion=Promise.resolve(await settleController(local));}
        catch (settlementError) {local.pendingSettlement=true;local.finishAttempted=true;
          lastCompletion=Promise.resolve({runId:admitted.runId,state:'paused_unknown',pendingSettlement:true,error:{code:settlementError.code,message:settlementError.message}});}
      }
      if (active === local && !local.pendingSettlement) active = undefined; throw error;
    } finally { admissions.delete(admission); admissionDone(); }
  }
  async function completeController(local, claim, controller) {
    try {
      // execute's source and params come only from the durable admission reply.
      // Saving another head cannot modify this in-flight committed revision.
      let terminal;
      try { terminal = await controller.execute(claim.sourceUtf8, decodeValue(claim.paramsWire)); }
      catch (error) {
        controller.stop();
        terminal = await controller.result;
        if (!terminal) terminal = {status: 'error', error: {code: error.code || 'E_CONTROL_EXECUTION', message: error.message}};
      }
      const cleanup = await controller.retired;
      const finishRequestId = `${claim.runId}:finish`;
      let status = terminal.status, wire;
      if(status === 'succeeded') {
        try {wire = encodeValue(decodeControlValue(terminal.value, {maxBytes:RESULT_TRANSFER_LIMITS.maxBytes}));}
        catch(error) {
          status = 'error';
          terminal.error = {code:error.code === 'E_VALUE_SERIALIZATION' ? 'E_RESULT_TOO_LARGE' :
            error.code || 'E_RESULT_FORMAT',message:'Final result cannot be persisted without loss'};
        }
      }
      const finishRequest = {runId:claim.runId,requestId:finishRequestId,status,
        ...(status === 'succeeded' ? {valueWire:wire} : {error:terminal.error ||
          {code:status === 'timeout' ? 'E_TIMEOUT' : status === 'host-closed' ? 'E_HOST_CLOSED' : 'E_CANCELLED',message:status}}),
        workerRetired:cleanup?.acknowledged === true || cleanup?.workerNeverCreated === true};
      local.settlementRequest = finishRequest;
      local.workerRetired = finishRequest.workerRetired;
      local.state = 'settling';
      return await settleController(local);
    } catch (error) {
      if (local.settlementRequest) { local.pendingSettlement = true; local.finishAttempted = true; }
      const outcome = {runId: claim.runId, state: 'paused_unknown', pendingSettlement: !!local.settlementRequest,
        error: {code: error.code || 'E_EFFECT_UNKNOWN', message: error.message}};
      notify(outcome); return outcome;
    } finally { local.context?.dispose(); contextResources.delete(local.context); if (active === local && !local.pendingSettlement) active = undefined; }
  }
  async function settleController(local) {
    let settled, failure;
    try {settled = await finishControllerRunWithRecovery(local.settlementRequest, local.finishAttempted);}
    catch (error) {failure=error;}
    local.finishAttempted = true;
    const retirement = await controls.retireControllerTarget({runId: local.settlementRequest.runId});
    if (failure) {local.pendingSettlement=retirement.state!=='released';if(!local.pendingSettlement && active===local) active=undefined;throw failure;}
    const outcome = {runId: local.settlementRequest.runId, state: settled.run.state, result: settled.result, retirement};
    local.pendingSettlement = retirement.state !== 'released';
    local.state = local.pendingSettlement ? 'retiring' : 'settled';
    if (active === local && !local.pendingSettlement) active = undefined;
    notify(outcome);
    return outcome;
  }
  async function finishControllerRunWithRecovery(request, observeFirst = false) {
    if (observeFirst) {
      const snapshot = await controls.snapshotControllerRun({runId:request.runId});
      const result = snapshot.results?.find(row => row.runId === request.runId);
      if (result && snapshot.run) return {run:snapshot.run,result};
    }
    try { return await controls.finishControllerRun(request); }
    catch (error) {
      const snapshot = await controls.snapshotControllerRun({runId: request.runId});
      const result = snapshot.results?.find(row => row.runId === request.runId);
      if (result && snapshot.run) return {run: snapshot.run, result};
      throw error;
    }
  }
  async function startScraping({template, originGrantEvidence, createTargetRequest}) {
    if (disposed || active) throw new FoundationError('E_OWNER','RunHost already owns a task or is disposed');
    await client.ready;
    // The exact same domain compiler used by preview is called before claiming.
    const module = getModule();
    const plan = await module.compileTemplate({template,capabilities:contracts.capabilities,compilerVersion:contracts.compilerVersion});
    const runner = module.createRunner({plan,template,...services});
    const claim = await client.runCommands.claimRun({registrationId:client.registration.registrationId,
      templateHash:template.contentHash, originGrantEvidence});
    const controller = new AbortController();
    active = {runId:claim.runId, controller, state:'preparing'};
    notify({...claim});
    const execution = async () => {
      try {
        const creation = await client.pagePort.createTarget({...createTargetRequest, runId:claim.runId,
          expectedRunRevision:claim.runRevision,registrationId:client.registration.registrationId,requestId:crypto.randomUUID()});
        const binding = await client.pagePort.bindTarget({runId:claim.runId,creationId:creation.creationId,registrationId:client.registration.registrationId});
        const identity = binding.identity;
        const outcome = await runner.run({identity,signal:controller.signal});
        const view = await client.runCommands.snapshotRun({runId:claim.runId});
        const retirement = await client.runCommands.finishRun({runId:claim.runId,expectedRunRevision:view.run.runRevision,
          state:controller.signal.aborted?'stopped':outcome.state, naturalEnd:outcome.naturalEnd === true, reason:outcome.reason ?? null});
        const retired = await client.runCommands.retireTarget({retirementId:retirement.retirementId});
        notify({runId:claim.runId,state:outcome.state,retirement:retired});
      } catch (error) {
        // Unknown effects/targets hold their slot; never silently start over.
        notify({runId:claim.runId,state:'paused_unknown',error:{code:error.code||'E_EFFECT_UNKNOWN',message:error.message}});
      } finally { active = undefined; }
    };
    active.completion = execution();
    return claim;
  }
  async function stop(request) {
    if (active?.controllerRun || request?.controller === true) {
      const {controller: ignored, ...payload} = request || {};
      if (active?.runId === payload.runId) {
        active.control?.stop?.();
        active.controller.abort(new FoundationError(payload.reason === 'E_TIMEOUT' ? 'E_TIMEOUT' : 'E_CANCELLED', 'Stopped'));
        if (active.settlementRequest) {
          const local=active, snapshot=await controls.snapshotControllerRun({runId:local.runId});
          if (!['completed','failed','stopped','interrupted'].includes(snapshot.run?.state))
            await controls.stopControllerRun({...payload,requestId:payload.requestId || `${local.runId}:stop`});
          return await settleController(local);
        }
      }
      const response = await controls.stopControllerRun({...payload, requestId: payload.requestId || crypto.randomUUID()});
      notify(response); return response;
    }
    const response = await client.runCommands.stopRun(request);
    // Abort local waits only after the durable cancel fence won its transaction.
    if (active?.runId === request.runId) active.controller.abort(new FoundationError('E_CANCELLED','Stopped'));
    notify({runId:request.runId,...response}); return response;
  }
  const unsubscribeConnection = client.subscribeConnection?.(event => {
    const local = active;
    if (!local?.controllerRun) return;
    if (!event.connected) {local.control?.stop?.(); local.controller.abort(new FoundationError('E_EFFECT_UNKNOWN','Host observation disconnected'));}
    else if (local.pendingSettlement && !local.reconciling) {
      local.reconciling=settleController(local).catch(error=>notify({runId:local.runId,state:'paused_unknown',pendingSettlement:true,error:{code:error.code||'E_EFFECT_UNKNOWN',message:error.message}}))
        .finally(()=>{local.reconciling=null;});
    }
  });
  const pagehide = () => dispose();
  doc?.defaultView?.addEventListener('pagehide', pagehide, {once: true});
  function dispose() {
    if (disposed) return; disposed = true; unsubscribeConnection?.();
    if (active?.controllerRun && active.runId) {
      const local = active;
      // Closing the actual host destroys its realm. Commit its cancel fence
      // while the document still exists; SW hostGone performs fallback recovery.
      local.control?.close?.();
      local.controller.abort(new FoundationError('E_HOST_CLOSED', 'RunHost closed'));
      controls.stopControllerRun({runId: local.runId, requestId: crypto.randomUUID(), reason: 'E_HOST_CLOSED'})
        .catch(() => { local.context?.dispose('E_HOST_CLOSED'); local.control?.close(); });
    } else active?.controller.abort(new FoundationError('E_HOST_CLOSED', 'RunHost closed'));
    scraping?.dispose(); doc?.defaultView?.removeEventListener('pagehide', pagehide);
    if (ownsClient) Promise.all([...admissions]).then(() => lastCompletion).finally(() => client.dispose()).catch(() => client.dispose());
    observers.clear();
  }
  return {...services, get module() { return getModule(); }, ready:client.ready,
    handshake:{contractVersion:CONTRACT_VERSION,contractHash:CONTRACT_HASH}, productionRunHostImplemented:true,
    controller: controls, artifactResources, get completion() { return lastCompletion; }, get currentRun() { return active?.runId || null; },
    get executionPending(){return Boolean(active)||admissions.size>0;},
    start, stop, subscribe:listener=>{observers.add(listener);return()=>observers.delete(listener);},
    resourceSnapshot: () => ({client: client.resourceSnapshot?.() ?? {}, blobs: artifactResources.resourceSnapshot?.() ?? {},
      controllers:[...controllerResources].map(control=>control.resourceSnapshot?.() || {}),
      contexts:[...contextResources].map(context=>context.resourceSnapshot()), host:{subscriptions:observers.size}}),
    dispose};
}
