import {CONTROLLER_SOURCE_LIMIT,TASK_PACKAGE_LIMIT} from '../source-budgets.js';
import {assertTaskDelegationApp,readTaskDelegationApp} from '../tasks/delegation-installation.js';
import {assertAppControllerBinding} from '../tasks/app-controller-installation.js';
import {validateTaskParams} from '../tasks/contract.js';
import {sameTaskPin,normalizeDelegatedTask} from '../tasks/delegation-contract.js';
import {createNetworkService} from '../chrome/network.js';
import {createIsolatedHttpTransport} from '../chrome/network-transport.js';
import {createNativeHttpTransport} from '../chrome/native-http-transport.js';
import {normalizeMethod, SDK_METHODS} from '../../framework/sdk/registry.js';
import {FoundationError, BUDGETS, invariant, newId, canonical, digest, digestUtf8} from '../protocol.js';
import {encodeValue, decodeValue} from '../page-port/codec.js';
import {decodeValue as decodeControlValue, encodeValue as encodeControlValue} from '../../framework/control/value.js';
import {observeControllerTarget, verifyControllerTarget, httpUrl, requireGrant} from '../target/index.js';
import {createControllerDriver,COOKIE_PREFLIGHT_METHODS,COOKIE_PREFLIGHT_CODES} from '../../framework/control/native-driver.js';
import {assertInstalledTask,assertRunTaskAuthorization} from '../tasks/service.js';
import {BUILTIN_ABI} from '../../libs/runtime-contract.js';
import {normalizeControllerNetworkOrigins,assertControllerNetworkTarget} from './controller-network-scope.js';
import {permissionPattern} from '../../environment.js';
import {loadBuiltinWorkerSource} from '../../libs/loader.js';
import {builtinIdentity,assertBuiltinIdentity} from '../../libs/identity.js';
import {readAppServiceInstallation,assertAppServiceBinding,APP_SERVICE_OPERATIONS} from '../tasks/app-service-installation.js';
import {requireCloudRunnerSender} from './cloud-observer.js';
import {normalizeBrowserOperation} from '../../framework/sdk/browser-contract.js';
import {isControllerNavigation} from '../../framework/control/locator-contract.js';
import {withRunAdmissionLock} from './run-admission-lock.js';
import {controllerMayRetainOwnedTarget} from './controller-target-retention.js';
import {assertRetainedControllerContinuation,retainedContinuationKey} from './controller-retained-continuation.js';
// Reuse exact literals within the fixed privileged bundle budget.
const RUN_STORE="runs",
  RUN_WRITE="readwrite",
  RUN_READ="readonly",
  CONTROLLER_RUN_TAG="controller-run",
  CONTROLLER_OWNER_ERROR="E_OWNER",
  CONTROLLER_PERMISSION_ERROR="E_PERMISSION",
  CONTROLLER_TIMEOUT_ERROR="E_TIMEOUT",
  CONTROLLER_SCHEMA_ERROR="E_SCHEMA";


const COMMAND_JOURNAL = 'commandJournal';
const DOC_REPLACED = 'E_DOCUMENT_REPLACED';
const REQUEST_CONFLICT = 'E_REQUEST_CONFLICT';
const EFFECT_UNKNOWN = 'E_EFFECT_UNKNOWN';
const CANCELLED_CODE = 'E_CANCELLED';
const REVOKED_MESSAGE = 'Run permission revoked';
const stores = [RUN_STORE, COMMAND_JOURNAL, 'results', 'frameworkKV'];
const live = new Set(['preparing', 'running']);
const terminals = new Set(['completed', 'failed', 'stopped', 'interrupted']);
// Typed values still decode at semantic depth 12. Object tags add up to three
// JSON containers per level, plus the enclosing request/operation fields.
const wireCanonicalOptions = Object.freeze({maxDepth: 48});
const pinBindingFields = ['namespace', 'principal', 'grantIncarnation', 'runId', 'opId', 'requestId', 'resultId', 'browserSessionIncarnation'];
const scriptKey = (namespace, id, revision) => `script:${canonical(revision === undefined ? [namespace, id] : [namespace, id, revision])}`;
const opKey = (runId, requestId) => `controller-op:${canonical([runId, requestId])}`;
function originMatches(pattern, origin) {
  if (pattern === '<all_urls>') return true;
  const match = typeof pattern === 'string' && pattern.match(/^(\*|https?):\/\/([^/]+)\//);
  if (!match) return false;
  const url = new URL(origin), hostname = match[2].toLowerCase();
  return (match[1] === '*' || `${match[1]}:` === url.protocol) && (hostname === '*' ||
    hostname === url.hostname || hostname.startsWith('*.') &&
    (url.hostname === hostname.slice(2) || url.hostname.endsWith(`.${hostname.slice(2)}`)));
}
function runOrigins(run) {
  return [run.target?.allowedOrigin || run.startUrl && httpUrl(run.startUrl).origin,
    run.pageTaskSource&&httpUrl(run.pageTaskSource.url).origin,...(run.networkOrigins || [])].filter(Boolean);
}
function removedRunGrant(run, patterns) {
  return runOrigins(run).some(origin => patterns.some(pattern => originMatches(pattern, origin)));
}
function fields(value, allowed, required = []) {
  invariant(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(key => allowed.includes(key)) &&
    required.every(key => Object.hasOwn(value, key)), CONTROLLER_SCHEMA_ERROR, 'Invalid controller request fields');
}
function id(value) { invariant(typeof value === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(value), CONTROLLER_SCHEMA_ERROR, 'Invalid controller id'); }
function same(a, b) { return canonical(a, wireCanonicalOptions) === canonical(b, wireCanonicalOptions); }
function typed(error) { return {code: error?.code || 'E_CONTROL_EXECUTION', name: error?.name || 'Error', message: String(error?.message || error)}; }
function hasNativeEffect(operation) {
  return operation?.nativeReceipts?.some(receipt => receipt.stage !== 'webNavigation.getAllFrames') === true;
}

// Delegate of the unique authority. Every durable fence is ordered by its
// injected storage transaction; the maps below only correlate live promises.
export function controllerMethods({storage, api, session, clock, assertHost, currentHost,
  loadBuiltin=loadBuiltinWorkerSource,emitToHost=async()=>{},cloud,scheduled,readMediaAsset,withTaskRunRecovery=work=>work(),
  pageTaskSource,projectPageTaskResult}) {
  const isolatedTransport=createIsolatedHttpTransport({api});
  const nativeTransport=createNativeHttpTransport({api});
  const pending = new Map(), cancellations = new Map(), navigating = new Map(), boundTargets = new Map(), creatingTabs = new Map();
  const locatorWriters = new Set();
  const tabEpochs = new Map(), frameEpochs = new Map(), permissionRemovals = [];
  const pageSourceEpochs=new Map();
  const tx = (mode, work, names = stores) => storage.transaction([...new Set(names)], mode, work);
  const now = () => clock.now();
  async function requireRunGrants(run,lockedDelegation,{sourceDocument=true}={}) {
    if(sourceDocument&&run.pageTaskSource)await pageTaskSource.authorize(run.pageTaskSource);
    if(run.taskDelegation&&(!lockedDelegation||!same(run.taskDelegation,lockedDelegation)))
      await assertTaskDelegationApp(api,run.taskDelegation);
    for (const origin of runOrigins(run)) {
      try { await requireGrant(api, origin); }
      catch (error) {
        // Native events can arrive after contains(false). Persist the same
        // denial before delivery; restoring Chrome access cannot revive a run.
        if (error.code === CONTROLLER_PERMISSION_ERROR)
          await invalidateControllerTarget({permissionRemoved:true, origins:[permissionPattern(origin)]});
        throw error;
      }
    }
  }
  function namespace(host) {
    invariant(typeof host.namespace === 'string' && host.namespace && host.principal !== undefined,
      CONTROLLER_OWNER_ERROR, 'Tool namespace or principal missing');
    return host.namespace;
  }
  function nativeFence(tabId, origin, frameId = 0) {
    return {tabEpoch: tabEpochs.get(tabId) || 0,
      frameEpoch: frameEpochs.get(canonical([tabId ?? null, frameId])) || 0,
      rootFrameEpoch: frameId > 0 ? frameEpochs.get(canonical([tabId ?? null, 0])) || 0 : 0,
      permissionEpoch: permissionRemovals.filter(patterns => patterns.some(pattern => originMatches(pattern, origin))).length};
  }
  function checkFence(run) {
    if(run.pageTaskSource)checkFence({target:{...run.pageTaskSource,allowedOrigin:httpUrl(run.pageTaskSource.url).origin},
      selection:{frameId:0},nativeFence:run.pageTaskSourceFence});
    const origin = run.target?.allowedOrigin || run.startUrl && httpUrl(run.startUrl).origin;
    if (!origin || !run.nativeFence) return;
    const current = nativeFence(run.target?.tabId ?? run.nativeTabId, origin, run.target?.frameId ?? run.selection.frameId ?? 0);
    invariant(current.permissionEpoch === run.nativeFence.permissionEpoch, CONTROLLER_PERMISSION_ERROR, REVOKED_MESSAGE);
    for (const row of run.nativeNetworkFences || [])
      invariant(nativeFence(run.target?.tabId ?? run.nativeTabId, row.origin).permissionEpoch === row.permissionEpoch,
        CONTROLLER_PERMISSION_ERROR, REVOKED_MESSAGE);
    invariant(current.tabEpoch === run.nativeFence.tabEpoch && current.frameEpoch === run.nativeFence.frameEpoch &&
      current.rootFrameEpoch === run.nativeFence.rootFrameEpoch,
      DOC_REPLACED, 'Run document changed');
  }
  async function owner(transaction, run, host, sender, {active = false} = {}) {
    await currentHost(transaction, host, sender);
    invariant(run?.tag === CONTROLLER_RUN_TAG && !run.tombstoned && run.registrationId === host.registrationId &&
      run.hostDocumentId === host.hostDocumentId && run.hostInstanceId === host.hostInstanceId &&
      run.namespace === namespace(host) && run.browserSessionIncarnation === session,
    CONTROLLER_OWNER_ERROR, 'Controller host mismatch');
    if (active) {
      checkFence(run);
      await assertRunTaskAuthorization(transaction,run);
      if(run.pageRequestId)await assertPageRequestInTransaction(transaction,run.pageRequestId,run.namespace,{submission:true});
      await cloud?.assertActive(transaction,run);
      invariant(live.has(run.state) && !run.cancelSeq && !run.retirementId && now() < run.deadlineAt,
        now() >= run.deadlineAt ? CONTROLLER_TIMEOUT_ERROR : CANCELLED_CODE, 'Controller admission is fenced');
    }
    return run;
  }
  function scriptContext(host, sender, run, {retiring = false, scriptId, expectedRevision} = {}) {
    const binding = run || {runId: newId(), opId: newId(), requestId: newId(), resultId: newId()};
    const context = {namespace: namespace(host), principal: host.principal, grantIncarnation: host.registrationId,
      browserSessionIncarnation: session, runId: binding.runId, opId: binding.opId,
      requestId: binding.requestId, resultId: binding.resultId, opKey: `controller-pin:${binding.runId}`,
      deadlineAt: retiring || !run ? now() + 15000 : run.deadlineAt,
      async authorizeInTransaction(transaction) {
        await currentHost(transaction, host, sender);
        // GC has no revision argument in the storage API. Its trusted context
        // checks the UI's CAS in the same revision transaction as collection.
        if (scriptId !== undefined) {
          const head = await transaction.get('scriptHeads', scriptKey(context.namespace, scriptId));
          invariant(head?.revision === expectedRevision, 'E_REVISION', 'Script GC CAS conflict');
        }
        // Revision transactions deliberately contain no runs store. Their
        // durable lease mirror is fenced in the same transaction as run state.
        if (run) {
          const lease = await transaction.get(COMMAND_JOURNAL, `controller-pin:${run.runId}`);
          invariant(lease?.tag === 'controller-lease' && lease.registrationId === host.registrationId &&
            pinBindingFields.every(key => Object.hasOwn(lease, key) && same(lease[key], context[key])),
            CONTROLLER_OWNER_ERROR);
          if (!retiring) invariant(live.has(lease.state) && !lease.cancelSeq && now() < lease.deadlineAt,
            now() >= lease.deadlineAt ? CONTROLLER_TIMEOUT_ERROR : CANCELLED_CODE);
        }
        return true;
      },
      async authorize() {
        return tx(RUN_READ, async transaction => context.authorizeInTransaction(transaction),
          scriptId === undefined ? [RUN_STORE, COMMAND_JOURNAL] : ['scriptHeads', COMMAND_JOURNAL]);
      }};
    return context;
  }
  async function lease(transaction, run) {
    await transaction.put(COMMAND_JOURNAL, {tag: 'controller-lease', runId: run.runId, namespace: run.namespace,
      principal: run.principal, grantIncarnation: run.registrationId, opId: run.opId, requestId: run.requestId,
      resultId: run.resultId, browserSessionIncarnation: run.browserSessionIncarnation,
      registrationId: run.registrationId, cancelSeq: run.cancelSeq, state: run.state, deadlineAt: run.deadlineAt,
      workerRetired: run.workerRetired, retirementState: run.retirementState}, `controller-pin:${run.runId}`);
  }
  async function commitControllerScript(request, sender) {
    fields(request, ['scriptId', 'expectedRevision', 'sourceUtf8', 'contentHash'], ['scriptId', 'expectedRevision', 'sourceUtf8']);
    invariant(!request.scriptId?.startsWith('task:'),CONTROLLER_PERMISSION_ERROR,'Installed task IDs are reserved');
    const host = await assertHost(sender);
    const environment=builtinIdentity(await loadBuiltin({runtime:api.runtime}));
    return storage.commitScriptRevision(scriptContext(host, sender), {...request,builtinIdentity:environment});
  }
  function scriptMutation(request) {
    fields(request, ['scriptId', 'expectedRevision'], ['scriptId', 'expectedRevision']); id(request.scriptId);
    invariant(!request.scriptId.startsWith('task:'),CONTROLLER_PERMISSION_ERROR,'Installed task revisions are immutable');
    invariant(Number.isSafeInteger(request.expectedRevision) && request.expectedRevision > 0, 'E_REVISION', 'Exact script head required');
  }
  async function tombstoneControllerScript(request, sender) {
    scriptMutation(request);
    const host = await assertHost(sender);
    return storage.tombstoneScript(scriptContext(host, sender), request);
  }
  async function garbageCollectControllerScript(request, sender) {
    scriptMutation(request);
    const host = await assertHost(sender);
    return storage.garbageCollectScript(scriptContext(host, sender, undefined, request), {scriptId: request.scriptId});
  }
  async function getControllerScript(request, sender) {
    fields(request, ['scriptId', 'revision'], ['scriptId']); id(request.scriptId);
    const host = await assertHost(sender);
    return storage.transaction(['scriptHeads', 'scriptRevisions', COMMAND_JOURNAL], RUN_READ, async transaction => {
      await currentHost(transaction, host, sender);
      const head = await transaction.get('scriptHeads', scriptKey(namespace(host), request.scriptId));
      invariant(head && !head.tombstoned, 'E_TOMBSTONE', 'Script is not available');
      const revision = request.revision ?? head.revision;
      invariant(Number.isSafeInteger(revision) && revision > 0, 'E_REVISION');
      const row = await transaction.get('scriptRevisions', scriptKey(host.namespace, request.scriptId, revision));
      invariant(row && await digestUtf8(row.sourceUtf8) === row.contentHash, 'E_HASH', 'Stored script bytes differ');
      return row;
    });
  }
  async function listControllerScripts(request, sender) {
    fields(request ?? {}, []);
    const host = await assertHost(sender);
    return storage.transaction(['scriptHeads', COMMAND_JOURNAL], RUN_READ, async transaction => {
      await currentHost(transaction, host, sender);
      return (await transaction.all('scriptHeads'))
        .filter(row => row?.tag === 'script-head' && row.namespace === namespace(host) && !row.tombstoned && !row.scriptId.startsWith('task:'))
        .map(row => ({scriptId: row.scriptId, revision: row.revision, contentHash: row.contentHash}))
        .sort((a, b) => a.scriptId.localeCompare(b.scriptId));
    });
  }
  function project(run) {
    if (!run) return null;
    // Project only the exact installed Task identity; never its authority token.
    const installed=run.installedTaskAuthorization;
    const taskInstallation=installed?{taskId:installed.taskId,version:installed.version,
      manifestHash:installed.manifestHash,
      installationId:installed.authorization?.installationId,
      generation:installed.authorization?.generation}:null;
    return {...structuredClone(Object.fromEntries(['tag', 'runId', 'state', 'runRevision', 'requestId', 'ownerEpoch', 'cancelSeq', 'identity',
      'target', 'targetQuarantine', 'revision', 'deadlineAt', 'retirementId', 'retirementState', 'resultId', 'terminalReason', 'workerRetired',
      'scriptId', 'contentHash', 'sourceKind', 'networkOrigins','profile','appBinding',
      'targetDisposition','retainedTarget','retainedFrom','retainedContinuation','taskPreparationId'].filter(key => run[key] !== undefined).map(key => [key, run[key]]))),
      ...(taskInstallation?{taskInstallation}:{})};
  }
  async function snapshotControllerRun(request, sender) {
    const host=await assertHost(sender);
    return snapshotControllerRunInScope(request,namespace(host),transaction=>currentHost(transaction,host,sender));
  }
  // The Page path supplies a verified installed-source/read guard, not a
  // fabricated Host. Result projection and revocation policy remain identical.
  async function snapshotControllerRunInScope(request,ns,authorize) {
    fields(request, ['runId','requestId']);
    invariant(!(request.runId!==undefined&&request.requestId!==undefined),
      CONTROLLER_SCHEMA_ERROR,'Select one original Run or request ID');
    if(request.runId!==undefined)id(request.runId);
    if(request.requestId!==undefined)id(request.requestId);
    const permissionEpoch = permissionRemovals.length;
    const snapshot = await tx(RUN_READ, async transaction => {
      await authorize(transaction);
      const slot = await transaction.get(RUN_STORE, '@slot');
      const runs = (await transaction.all(RUN_STORE)).filter(run=>run.tag===CONTROLLER_RUN_TAG && !run.tombstoned && run.namespace===ns)
        .sort((a,b)=>(a.createdAt || 0)-(b.createdAt || 0) || a.runId.localeCompare(b.runId));
      const matches=request.requestId===undefined?[]:
        runs.filter(row=>row.requestId===request.requestId);
      invariant(matches.length<=1,CONTROLLER_OWNER_ERROR,'Original request ID is ambiguous');
      const run=request.runId?runs.find(row=>row.runId===request.runId):
        request.requestId?matches[0]??null:null;
      if(request.runId||request.requestId)invariant(run,CONTROLLER_OWNER_ERROR);
      const results = (await transaction.all('results')).filter(value=>{
        const original=runs.find(row=>row.runId===value.runId);
        return value.tag==='controller-result'&&value.namespace===ns&&
          (!run||value.runId===run.runId)&&original?.resultId===value.resultId&&
          same(original.principal,value.principal)&&original.state===value.state;
      });
      const ids = new Set((run ? [run] : runs).map(row=>row.runId));
      const downloads = (await transaction.all('downloadReceipts')).filter(row=>row.tag==='attempt' && ids.has(row.attempt.runId))
        .map(({attempt})=>Object.fromEntries(['attemptId','runId','state','downloadId','submissionCount','artifactHash','resourceReleasedAt'].map(key=>[key,attempt[key]])));
      return {run, runs, results, downloads, slotAvailable:!slot?.currentRunId&&!slot?.preview};
    }, [...stores,'downloadReceipts']);
    // A targeted read delivers only this Run's result. Unrelated historical
    // grants must not delay its settlement or resource retirement.
    const deliveryRuns = snapshot.run ? [snapshot.run] : snapshot.runs;
    const resultRuns=new Set(snapshot.results.map(result=>result.runId));
    return withDelegatedResultLocks(deliveryRuns.filter(run=>resultRuns.has(run.runId)),async()=>{
      const denied = new Set();
      for (const run of deliveryRuns) {
        try {
          invariant(!run.resultDeliveryRevoked,CONTROLLER_PERMISSION_ERROR); await requireRunGrants(run,undefined,{sourceDocument:false});
          if(run.taskPreparationId&&run.taskDelegation&&resultRuns.has(run.runId)){
            await verifyControllerTarget({api,target:run.target,expectedUrl:run.selection.expectedUrl,
              expectedWindowId:run.selection.expectedWindowId});
            checkFence(run);
          }
        }
        catch { denied.add(run.runId); }
      }
      // Native queries are outside the IDB transaction; recheck the durable fence before delivery.
      await tx(RUN_READ,async transaction=>{
        await authorize(transaction);
        for (const run of deliveryRuns) {
          const current=await transaction.get(RUN_STORE,run.runId);
          if(current?.resultDeliveryRevoked)denied.add(run.runId);
          if(run.taskDelegation||run.taskPreparationId){try{await assertRunTaskAuthorization(transaction,current);}catch{denied.add(run.runId);}}
        }
      });
      // Cover an event waiting for its durable transaction, without comparing
      // historical document/Worker epochs or hiding results after navigation.
      for (const run of deliveryRuns)
        if (permissionRemovals.slice(permissionEpoch).some(patterns => removedRunGrant(run, patterns))) denied.add(run.runId);
      // Exact request lookups must not return unrelated historical Runs or
      // full Result histories to the trusted Markdown reconciliation caller.
      const returnedRuns=request.requestId?snapshot.runs.filter(row=>row.runId===snapshot.run?.runId):
        snapshot.runs;
      return {...snapshot,run:project(snapshot.run),runs:returnedRuns.map(project),
        results:snapshot.results.filter(row=>!denied.has(row.runId)),resultDeliveryDenied:[...denied]};
    });
  }
  function selection(target) {
    fields(target, target?.mode === 'owned' ? ['mode', 'url'] : ['mode', 'tabId', 'frameId', 'documentId', 'expectedUrl', 'expectedWindowId']);
    invariant(['owned', 'borrowed'].includes(target.mode), 'E_TARGET', 'Explicit target ownership is required');
    if (target.mode === 'owned') httpUrl(target.url);
    else invariant(Number.isSafeInteger(target.tabId) && target.tabId >= 0 && Number.isSafeInteger(target.frameId) && target.frameId >= 0 &&
      typeof target.documentId === 'string' && target.documentId, 'E_TARGET', 'Exact borrowed document required');
    if (target.expectedUrl !== undefined) httpUrl(target.expectedUrl);
    if (target.expectedWindowId !== undefined) invariant(target.mode === 'borrowed' && Number.isSafeInteger(target.expectedWindowId) &&
      target.expectedWindowId >= 0 && target.frameId === 0 && target.expectedUrl !== undefined, 'E_TARGET', 'Current Page window required');
  }
  async function waitDocument(run, tabId, {bootstrapUrl, documentId, changedFrom} = {}) {
    for (;;) {
      await tx(RUN_READ, async transaction => {
        const current = await transaction.get(RUN_STORE, run.runId);
        checkFence(current);
        invariant(current?.tag === CONTROLLER_RUN_TAG && !current.cancelSeq && live.has(current.state) &&
          current.browserSessionIncarnation === session, CANCELLED_CODE);
        invariant(now() < current.deadlineAt, CONTROLLER_TIMEOUT_ERROR);
        await assertRunTaskAuthorization(transaction,current);
        await cloud?.assertActive(transaction,current);
      }, [RUN_STORE,'frameworkKV']);
      try {
        const observed = await observeControllerTarget({api, tabId, documentId, allowExtensionUrl: bootstrapUrl ?? null});
        if ((!changedFrom || observed.documentId !== changedFrom) && (!run.startUrl || bootstrapUrl ||
          httpUrl(observed.url).origin === httpUrl(run.startUrl).origin)) return observed;
      } catch (error) {
        if (![DOC_REPLACED, 'E_TARGET'].includes(error.code)) throw error;
      }
      await new Promise(resolve => setTimeout(resolve, 25));
    }
  }
  async function createOwned(run, host, sender) {
    const creationKey = `controller-create:${run.runId}`;
    const intent = await tx(RUN_WRITE, async transaction => {
      const current = await owner(transaction, await transaction.get(RUN_STORE, run.runId), host, sender, {active: true});
      const previous = await transaction.get(COMMAND_JOURNAL, creationKey);
      invariant(!previous, EFFECT_UNKNOWN, 'Owned creation dispatch is never replayed');
      const creationId = newId(), bootstrapUrl = api.runtime.getURL(`ui/target-bootstrap.html?creationId=${encodeURIComponent(creationId)}`);
      const value = {tag: 'controller-target-create', runId: current.runId, creationId, browserSessionIncarnation: session,
        bootstrapUrl, state: 'prepared', submissionCount: 0, tabId: null};
      await transaction.put(COMMAND_JOURNAL, value, creationKey);
      return value;
    });
    await requireGrant(api, httpUrl(run.startUrl).origin);
    const createEffect={requestId:run.requestId,requestDigest:run.requestDigest,effectId:`${intent.creationId}:create`,kind:'owned-create'};
    const createProof=run.cloudRequestId?await cloud.controlFence(run,createEffect):null;
    const createReady=await tx(RUN_WRITE,async transaction=>{
      const current=await owner(transaction,await transaction.get(RUN_STORE,run.runId),host,sender,{active:true});
      const journal=await transaction.get(COMMAND_JOURNAL,creationKey);
      invariant(journal?.state==='prepared'&&journal.submissionCount===0,EFFECT_UNKNOWN);
      const ready=await consumeCloudFence(transaction,current,journal,createProof,createEffect);
      journal.state='dispatched';journal.submissionCount=1;journal.dispatchAt=now();
      await transaction.put(COMMAND_JOURNAL,journal,creationKey);
      return ready;
    });
    try{createReady?.();}catch(error){
      // A consumed proof is never refreshed/replayed. Record definite absence
      // because tabs.create has not been invoked, preserving the consumed proof.
      await tx(RUN_WRITE,async transaction=>{
        const journal=await transaction.get(COMMAND_JOURNAL,creationKey);
        invariant(journal?.state==='dispatched'&&journal.submissionCount===1&&journal.tabId===null,EFFECT_UNKNOWN);
        journal.state='not-dispatched';journal.submissionCount=0;journal.deniedAt=now();
        await transaction.put(COMMAND_JOURNAL,journal,creationKey);
      });
      throw error;
    }
    const created = await api.tabs.create({url: intent.bootstrapUrl, active: false});
    invariant(Number.isSafeInteger(created?.id), EFFECT_UNKNOWN, 'No native owned tab receipt');
    creatingTabs.set(run.runId, created.id);
    await tx(RUN_WRITE, async transaction => {
      const value = await transaction.get(COMMAND_JOURNAL, creationKey);
      invariant(value.submissionCount === 1 && value.tabId === null, EFFECT_UNKNOWN);
      value.tabId = created.id; value.receiptAt = now(); value.state = 'created';
      await transaction.put(COMMAND_JOURNAL, value, creationKey);
      const current = await transaction.get(RUN_STORE, run.runId);
      current.nativeTabId = created.id; current.nativeFence.tabEpoch = tabEpochs.get(created.id) || 0;
      current.nativeFence.frameEpoch = frameEpochs.get(canonical([created.id, 0])) || 0;
      await transaction.put(RUN_STORE, current, current.runId);
    });
    const bootstrap = await waitDocument(run, created.id, {bootstrapUrl: intent.bootstrapUrl});
    await requireGrant(api, httpUrl(run.startUrl).origin);
    const navigateEffect={requestId:run.requestId,requestDigest:run.requestDigest,effectId:`${intent.creationId}:navigate`,kind:'owned-navigate'};
    const navigateProof=run.cloudRequestId?await cloud.controlFence(run,navigateEffect):null;
    const navigateReady=await tx(RUN_WRITE, async transaction => {
      const current=await owner(transaction, await transaction.get(RUN_STORE, run.runId), host, sender, {active: true});
      const value = await transaction.get(COMMAND_JOURNAL, creationKey);
      invariant(!value.navigationSubmissionCount, EFFECT_UNKNOWN);
      const ready=await consumeCloudFence(transaction,current,value,navigateProof,navigateEffect);
      value.bootstrapDocumentId = bootstrap.documentId; value.navigationSubmissionCount = 1; value.navigationState = 'dispatched';
      await transaction.put(COMMAND_JOURNAL, value, creationKey);
      return ready;
    });
    navigateReady?.();
    await api.tabs.update(created.id, {url: run.startUrl});
    const observed = await waitDocument(run, created.id, {changedFrom: bootstrap.documentId});
    return {...observed, creationId: intent.creationId};
  }
  async function consumeCloudFence(transaction,run,journal,proof,expected){
    if(!run.cloudRequestId)return;
    const ready=await cloud.assertControlFence(transaction,run,proof,expected);
    if(proof){
      invariant(!(journal.controlFences||[]).some(row=>row.proof.effectId===expected.effectId||row.proof.fenceId===proof.fenceId),EFFECT_UNKNOWN);
      (journal.controlFences||=[]).push({proof:structuredClone(proof),consumedAt:now()});
    }
    return ready;
  }
  async function withAppLifecycleLock(appId,work,lockedAppIds=[]){
    if(lockedAppIds.includes(appId))return work();
    const locks=globalThis.navigator?.locks;
    invariant(locks?.request,'E_TOOL_LOCK');
    return locks.request('opendesk.sidebar-tools:tool:'+appId,work);
  }
  async function withTaskDelegation(binding,work,lockedAppIds=[]){
    if(!binding)return work();
    return withAppLifecycleLock(binding.appId,async()=>{
      await assertTaskDelegationApp(api,binding);
      // Installation writers use this same lifecycle lock. The verified binding
      // remains current until work settles; site grants are checked separately.
      return work(binding);
    },lockedAppIds);
  }
  async function withDelegatedResultLocks(runs,work){
    // The trusted snapshot is also a result-disclosure route. Order App locks
    // consistently and hold them through the final IDB authorization decision,
    // just as INSPECT does, so a completed revocation cannot race a cached read.
    const appIds=[...new Set(runs.filter(run=>run.taskDelegation)
      .map(run=>run.taskDelegation.appId))].sort();
    const locks=globalThis.navigator?.locks;
    const acquire=index=>{
      if(index===appIds.length)return work();
      invariant(locks?.request,'E_TOOL_LOCK');
      return locks.request('opendesk.sidebar-tools:tool:'+appIds[index],()=>acquire(index+1));
    };
    return acquire(0);
  }

  // J06: this alias is only a lookup selector inside the currently installed App
  // generation. The trusted operationRef is minted by this Authority, never by
  // the sandbox or transport. The original Run/Result stores remain authoritative.
  const delegationKey=(binding,clientRequestId)=>
    'task-delegation-step:'+canonical([binding.appId,binding.packageHash,binding.generation,clientRequestId]);
  const delegationId=value=>invariant(typeof value==='string'&&/^[A-Za-z0-9._:-]{1,80}$/.test(value),'E_SCHEMA');
  const delegationHash=value=>invariant(typeof value==='string'&&/^[a-f0-9]{64}$/.test(value),'E_SCHEMA');
  function delegationFingerprint(binding,paramsDigest,target){
    return canonical({appId:binding.appId,packageHash:binding.packageHash,generation:binding.generation,
      ...(binding.controller?{controller:binding.controller}:{task:binding.task}),paramsDigest,target},wireCanonicalOptions);
  }
  function delegatedRequest(request,mode){
    fields(request,mode==='prepare'
      ?['binding','clientRequestId','paramsDigest','target','deadlineAt']
      :['binding','clientRequestId'],mode==='prepare'
      ?['binding','clientRequestId','paramsDigest','target','deadlineAt']
      :['binding','clientRequestId']);
    delegationId(request.clientRequestId);
    invariant(request.binding&&typeof request.binding.appId==='string','E_SCHEMA');
    const taskPin=request.binding.task;
    // In the originating iframe the live Task pin has six fields; after a
    // reload the App review supplies four immutable package fields. Both may
    // inspect/cancel; only a fresh PREPARE accepts six current installed fields.
    if(request.binding.controller){
      fields(request.binding.controller,['sourceHash'],['sourceHash']);
      delegationHash(request.binding.controller.sourceHash);
      invariant(!taskPin,'E_SCHEMA');
    }else normalizeDelegatedTask(taskPin,mode==='prepare'||
      Object.hasOwn(taskPin||{},'installationId')||Object.hasOwn(taskPin||{},'generation'));
    if(mode==='prepare'){
      delegationHash(request.paramsDigest);
      selection(request.target);
      invariant(request.target.mode==='borrowed','E_PERMISSION',
        'Delegated J06 operation requires a previously captured exact page');
      invariant(Number.isSafeInteger(request.deadlineAt)&&request.deadlineAt>now()&&
        request.deadlineAt<=now()+3600000,CONTROLLER_TIMEOUT_ERROR);
    }
  }
  async function prepareDelegatedStep(request,sender){
    delegatedRequest(request,'prepare');
    return withTaskDelegation(request.binding,async()=>{
      const host=await assertHost(sender),binding=request.binding;
      return tx(RUN_WRITE,async transaction=>{
        await currentHost(transaction,host,sender);
        const key=delegationKey(binding,request.clientRequestId);
        const previous=await transaction.get(COMMAND_JOURNAL,key);
        const fingerprint=delegationFingerprint(binding,request.paramsDigest,request.target);
        if(previous){
          invariant(previous.tag==='task-delegation-step','E_OWNER');
          // A stop arriving before the first prepare remains a permanent fence.
          if(!previous.prepared)invariant(false,CANCELLED_CODE,'Delegated step already cancelled');
          invariant(previous.fingerprint===fingerprint,REQUEST_CONFLICT,'Step alias has different arguments');
          return {operationRef:previous.operationRef,state:previous.state,runId:previous.runId,
            deadlineAt:previous.deadlineAt};
        }
        // An IDB journal cleanup must never turn an old J06 Run into a new
        // admissible step. During rollout, unretired legacy delegated Runs
        // have no clientRequestId index, so reject instead of guessing absence.
        const knownRuns=await transaction.all(RUN_STORE);
        invariant(knownRuns.length<=2048,'E_BUDGET','Delegated history requires review');
        invariant(!knownRuns.some(run=>run?.tag===CONTROLLER_RUN_TAG&&
          run.taskDelegation?.appId===binding.appId&&
          (run.taskDelegationStep?.clientRequestId===request.clientRequestId&&
            run.taskDelegation?.packageHash===binding.packageHash&&
            run.taskDelegation?.generation===binding.generation||
            !run.taskDelegationStep&&(!terminals.has(run.state)||
              run.retirementState!=='released'))),
          EFFECT_UNKNOWN,'Unlinked or unfinished original delegated run requires reconciliation');
        const row={tag:'task-delegation-step',schemaVersion:1,
          issuerDomain:'manual-sidebar-delegation',securityPartition:namespace(host),
          principalRef:host.principal,appId:binding.appId,packageHash:binding.packageHash,
          generation:binding.generation,clientRequestId:request.clientRequestId,
          operationRef:newId(),workflowOccurrence:newId(),stepId:request.clientRequestId,
          preparedHost:{registrationId:host.registrationId,hostDocumentId:host.hostDocumentId,
            hostInstanceId:host.hostInstanceId,iframeInstanceId:binding.instanceId,
            namespace:namespace(host),browserSessionIncarnation:session},
          ...(binding.controller?{controller:structuredClone(binding.controller)}:{task:structuredClone(binding.task)}),paramsDigest:request.paramsDigest,
          target:structuredClone(request.target),targetPolicy:'borrowed-exact-document',
          deadlineAt:request.deadlineAt,fingerprint,maxAdmissions:1,admissionCount:0,
          prepared:true,cancelled:false,state:'prepared',runId:null,resultId:null,
          ownerEpoch:0,createdAt:now()};
        await transaction.put(COMMAND_JOURNAL,row,key);
        return {operationRef:row.operationRef,state:row.state,runId:null,deadlineAt:row.deadlineAt};
      });
    });
  }
  async function inspectDelegatedStep(request,sender){
    delegatedRequest(request,'inspect');
    return withTaskDelegation(request.binding,async()=>{
      const host=await assertHost(sender),binding=request.binding,key=delegationKey(binding,request.clientRequestId);
      const observedPermissionEpoch=permissionRemovals.length;
      const snapshot=await tx(RUN_READ,async transaction=>{
        await currentHost(transaction,host,sender);
        const step=await transaction.get(COMMAND_JOURNAL,key);
        if(!step)return {step:null};
        invariant(step.tag==='task-delegation-step'&&step.appId===binding.appId&&
          step.packageHash===binding.packageHash&&step.generation===binding.generation,'E_OWNER');
        const run=step.runId?await transaction.get(RUN_STORE,step.runId):null;
        if(step.runId)invariant(run?.tag===CONTROLLER_RUN_TAG&&!run.tombstoned&&
          run.namespace===namespace(host)&&run.taskDelegationStep?.operationRef===step.operationRef&&
          run.taskDelegationStep.clientRequestId===step.clientRequestId&&
          run.resultId===step.resultId,'E_OWNER');
        const result=run?await transaction.get('results',run.resultId):null;
        return {step,run,result};
      });
      const {step,run}=snapshot;
      const base={clientRequestId:request.clientRequestId,operationRef:step?.operationRef??null,
        runId:run?.runId??null,resultId:run?.resultId??null,retirementState:run?.retirementState??null,
        workerRetired:run?.workerRetired??false,resourceReleased:run?.retirementState==='released',
        result:null,cancelled:step?.cancelled??false,continuationApproved:false,
        runOwnerEpoch:run?.ownerEpoch??null,cancelSeq:run?.cancelSeq??null,
        slotAvailable:null};
      if(!step)return {...base,semantic:'UNKNOWN',state:'unknown'};
      if(!run){
        return {...base,semantic:step.cancelled&&step.prepared?'NOT_SUBMITTED_FENCED':'UNKNOWN',
          state:step.state};
      }
      // Chrome storage and IDB are distinct authorities. Installation/revocation
      // is re-read under the lifecycle lock, and the result is delivered only
      // after a second durable check. No old Host is impersonated or transferred.
      await requireRunGrants(run);
      const checked=await tx(RUN_READ,async transaction=>{
        await currentHost(transaction,host,sender);
        const currentStep=await transaction.get(COMMAND_JOURNAL,key);
        const current=await transaction.get(RUN_STORE,run.runId);
        invariant(currentStep?.operationRef===step.operationRef&&currentStep.runId===run.runId&&
          currentStep.resultId===run.resultId&&current?.tag===CONTROLLER_RUN_TAG&&!current.tombstoned&&
          current.taskDelegationStep?.operationRef===step.operationRef,'E_OWNER');
        invariant(!current.resultDeliveryRevoked,CONTROLLER_PERMISSION_ERROR);
        await assertRunTaskAuthorization(transaction,current);
        const result=await transaction.get('results',current.resultId);
        const slot=await transaction.get(RUN_STORE,'@slot');
        const originalHost=await transaction.get(COMMAND_JOURNAL,`host:${current.registrationId}`);
        const originalHostActive=Boolean(originalHost?.active&&!originalHost.revoked&&
          originalHost.hostDocumentId===current.hostDocumentId&&
          originalHost.hostInstanceId===current.hostInstanceId&&
          originalHost.browserSessionIncarnation===session);
        invariant(!result||result.tag==='controller-result'&&result.runId===current.runId&&
          result.resultId===current.resultId&&result.namespace===namespace(host),'E_OWNER');
        return {run:current,result,slotAvailable:!slot?.currentRunId&&!slot?.preview,
          originalHostActive};
      },[RUN_STORE,COMMAND_JOURNAL,'results','frameworkKV']);
      if(checked.result){
        // Validate the result actually being delivered (it may have settled
        // since the first read). Retirement does not relax delegated delivery's
        // original-document scope, and a new iframe supplies no target identity.
        const target=checked.run.target;
        invariant(target?.tabId===step.target.tabId&&target.frameId===step.target.frameId&&
          target.documentId===step.target.documentId,DOC_REPLACED);
        await verifyControllerTarget({api,target,expectedUrl:step.target.expectedUrl,
          expectedWindowId:step.target.expectedWindowId});
      }
      invariant(!permissionRemovals.slice(observedPermissionEpoch).some(patterns=>
        removedRunGrant(checked.run,patterns)),CONTROLLER_PERMISSION_ERROR);
      if(checked.result)checkFence(checked.run);
      // A durable 'running' row alone cannot prove the old Host or Worker is
      // alive after an iframe/service-worker restart. An unavailable context
      // inventory is UNKNOWN, not FOUND_RUNNING.
      const contexts=checked.result?null:await Promise.resolve(api.runtime?.getContexts?.({})).catch(()=>null);
      const hostPresent=Array.isArray(contexts)&&
        contexts.some(context=>context.documentId===checked.run.hostDocumentId);
      // Host-document presence is not a signed live Worker heartbeat. Do not
      // promote a persisted 'running' bit to FOUND_RUNNING on that evidence.
      // The existing Host/RunOwner must supply an authenticated worker liveness
      // proof before that affirmative semantic is ever emitted.
      const hostRunObserved=checked.originalHostActive&&hostPresent&&
        checked.run.browserSessionIncarnation===session&&
        checked.run.state==='running'&&!checked.run.cancelSeq&&
        !checked.run.workerRetired&&now()<checked.run.deadlineAt;
      if(checked.result)invariant(new TextEncoder().encode(JSON.stringify(checked.result)).byteLength<=
        BUDGETS.maxRawFrameBytes,'E_BUDGET','Delegated result exceeds one transport frame');
      return {...base,runId:checked.run.runId,resultId:checked.run.resultId,
        retirementState:checked.run.retirementState??null,workerRetired:checked.run.workerRetired,
        resourceReleased:checked.run.retirementState==='released',
        cancelled:step.cancelled,continuationApproved:false,
        runOwnerEpoch:checked.run.ownerEpoch,cancelSeq:checked.run.cancelSeq,
        slotAvailable:checked.slotAvailable,
        semantic:checked.result?'FOUND_RESULT':'UNKNOWN',
        state:checked.run.state,result:checked.result??null,
        hostObserved:checked.result?null:hostPresent,
        hostRunObserved:checked.result?null:hostRunObserved,observedAt:now()};
    });
  }
  async function cancelDelegatedStep(request,sender){
    delegatedRequest(request,'cancel');
    return withTaskDelegation(request.binding,async()=>{
      const host=await assertHost(sender),binding=request.binding,key=delegationKey(binding,request.clientRequestId);
      const answer=await tx(RUN_WRITE,async transaction=>{
        await currentHost(transaction,host,sender);
        let step=await transaction.get(COMMAND_JOURNAL,key);
        if(!step){
          // A pre-prepare stop fences future J06 submissions but cannot prove
          // absence of a legacy in-flight submission from an older Host.
          step={tag:'task-delegation-step',schemaVersion:1,
            issuerDomain:'manual-sidebar-delegation',securityPartition:namespace(host),
            principalRef:host.principal,appId:binding.appId,packageHash:binding.packageHash,
            generation:binding.generation,clientRequestId:request.clientRequestId,
            operationRef:newId(),workflowOccurrence:newId(),stepId:request.clientRequestId,
            prepared:false,cancelled:true,state:'cancelled',runId:null,resultId:null,
            maxAdmissions:1,admissionCount:0,ownerEpoch:0,createdAt:now()};
        }else{
          invariant(step.tag==='task-delegation-step'&&step.appId===binding.appId&&
            step.packageHash===binding.packageHash&&step.generation===binding.generation,'E_OWNER');
          step={...step,cancelled:true,state:step.runId?'stopping':'cancelled'};
        }
        let run=null;
        if(step.runId){
          run=await transaction.get(RUN_STORE,step.runId);
          invariant(run?.tag===CONTROLLER_RUN_TAG&&run.namespace===namespace(host)&&
            run.taskDelegationStep?.operationRef===step.operationRef&&
            run.resultId===step.resultId,'E_OWNER');
          if(!run.cancelSeq&&!terminals.has(run.state)&&!run.retirementId){
            run.cancelSeq++;run.ownerEpoch++;run.runRevision++;run.eventSeq++;
            run.state='stopping';run.terminalReason=CANCELLED_CODE;
            await transaction.put(RUN_STORE,run,run.runId);await lease(transaction,run);
          }
        }
        if(run)step={...step,ownerEpoch:run.ownerEpoch,cancelSeq:run.cancelSeq};
        await transaction.put(COMMAND_JOURNAL,step,key);
        const slot=await transaction.get(RUN_STORE,'@slot');
        return {operationRef:step.operationRef,run,step,slotAvailable:!slot?.currentRunId&&!slot?.preview};
      });
      if(answer.run){
        abortOperations(answer.run.runId,CANCELLED_CODE);
        await createControllerDriver({api,clock,authorize:async()=>true}).cancel(answer.run).catch(()=>{});
      }
      return {clientRequestId:request.clientRequestId,operationRef:answer.operationRef,
        resultId:answer.run?.resultId??null,retirementState:answer.run?.retirementState??null,
        workerRetired:answer.run?.workerRetired??false,resourceReleased:answer.run?.retirementState==='released',
        slotAvailable:answer.slotAvailable,result:null,value:null,
        // A cancellation fence identifies the Run, not a live Worker.
        runId:answer.run?.runId??null,semantic:answer.run?'UNKNOWN':
          answer.step.prepared?'NOT_SUBMITTED_FENCED':'UNKNOWN',
        state:answer.step.state};
    });
  }

  const pageRequestKey=(ns,requestId)=>'page-task-request:'+canonical([ns,requestId]);
  // Installation changes cannot free the one-request source slot. They revoke
  // access to the old result; they never prove that its effects did not occur.
  const pageSlotMatches=(a,b)=>['namespace','programId','tabId','frameId','url','windowId'].every(key=>a?.[key]===b?.[key]);
  const pageReaderMatches=(a,b)=>['namespace','programId','revision','manifestHash','sourceHash','installationId','generation',
    'tabId','frameId','url','windowId'].every(key=>a?.[key]===b?.[key]);
  function pageRequestView(row,preparation=null,approvalAllowed=false){
    return {requestId:row.requestId,preparationId:row.preparationId,task:structuredClone(row.task),
      params:structuredClone(row.params),target:structuredClone(row.target),
      pageBinding:Object.fromEntries(['programId','revision','manifestHash','sourceHash','installationId','generation',
        'tabId','frameId','documentId','url','windowId'].map(key=>[key,row.pageSource[key]])),
      state:row.authorizationRevoked?'revoked':row.sourceInvalidated?'source-stale':preparation?.state??'pending-approval',
      approvalAllowed};
  }
  async function resolvePageTask(transaction,ns,pin,params,environment){
    const {candidate,installation}=await assertInstalledTask(transaction,ns,{
      scriptId:`task:${pin.taskId}:${pin.version}`,contentHash:pin.contentHash,
      origin:httpUrl(pin.targetUrl).origin,params,builtinIdentity:environment});
    invariant(installation.manifestHash===pin.manifestHash,'E_REVISION');
    const task={taskId:installation.taskId,version:installation.version,manifestHash:installation.manifestHash,
      contentHash:pin.contentHash,installationId:installation.authorization?.installationId,generation:installation.authorization?.generation};
    normalizeDelegatedTask(task,true);
    return {...task,scriptId:installation.scriptId,revision:candidate.package.manifest.program.revision,
      manifest:structuredClone(candidate.package.manifest)};
  }
  async function assertPageRequestInTransaction(transaction,requestId,ns,{submission=false,reader}={}){
    invariant(pageTaskSource,'E_PAGE_AUTHORIZATION');
    const row=await transaction.get(COMMAND_JOURNAL,pageRequestKey(ns,requestId));
    invariant(row?.tag==='page-task-request'&&row.namespace===ns,'E_OWNER');
    if(reader)invariant(pageReaderMatches(row.pageSource,reader),'E_REVISION','Request belongs to another Page installation grant');
    await pageTaskSource.inTransaction(transaction,reader??row.pageSource);
    invariant(!row.authorizationRevoked,'E_PERMISSION','Original Page request was revoked');
    if(submission){
      invariant(!row.sourceInvalidated&&row.browserSessionIncarnation===session,'E_DOCUMENT_STALE','Original approval source changed');
      invariant((pageSourceEpochs.get(row.pageSource.tabId)||0)===row.sourceEpoch,'E_DOCUMENT_STALE','Original Page navigation was fenced');
      checkFence({target:{...row.pageSource,allowedOrigin:httpUrl(row.pageSource.url).origin},selection:{frameId:0},nativeFence:row.sourceFence});
    }
    return row;
  }
  async function pageRequestStatus(row,{sender,reader}={}){
    const environment=builtinIdentity(await loadBuiltin({runtime:api.runtime}));
    const host=sender?await assertHost(sender):null;
    const authorize=async()=>{
      if(reader)await pageTaskSource.authorize(reader);
      return tx(RUN_READ,async transaction=>{
        if(host)await currentHost(transaction,host,sender);
        if(reader)await assertPageRequestInTransaction(transaction,row.requestId,row.namespace,{reader});
        const resolved=await resolvePageTask(transaction,row.namespace,{...row.task,targetUrl:row.target.url},row.params,environment);
        invariant(sameTaskPin(resolved,row.task)&&resolved.installationId===row.task.installationId&&resolved.generation===row.task.generation,'E_REVISION');
        return resolved;
      });
    };
    const resolvedInstallation=await authorize();
    const savedPreparation=await tx(RUN_READ,transaction=>transaction.get(COMMAND_JOURNAL,preparationKey(row.namespace,row.preparationId)));
    // Original Cancel may win before prepare saves any inputs. Its durable
    // tombstone still owns this exact ID; enrich only the read projection from
    // the original request so UI can show cancellation without reviving it.
    const tombstone=savedPreparation?.tag==='task-run-preparation'&&savedPreparation.namespace===row.namespace&&
      savedPreparation.preparationId===row.preparationId&&savedPreparation.state==='cancelled'&&
      !savedPreparation.task&&!savedPreparation.pageRequestId&&!savedPreparation.runId;
    const preparation=tombstone?{...savedPreparation,pageRequestId:row.requestId,task:row.task,params:row.params,target:row.target}:savedPreparation;
    if(preparation)invariant(preparation.pageRequestId===row.requestId&&preparation.preparationId===row.preparationId&&
      same(preparation.task,row.task)&&same(preparation.params,row.params)&&same(preparation.target,row.target),'E_OWNER');
    let approvalAllowed=false;
    if(!preparation?.runId&&(!preparation||preparation.state==='prepared'))try{
      await pageTaskSource.authorize(row.pageSource);
      await tx(RUN_READ,transaction=>assertPageRequestInTransaction(transaction,row.requestId,row.namespace,{submission:true}));
      approvalAllowed=true;
    }catch{}
    let snapshot=null;
    if(preparation?.runId){
      const guard=async transaction=>{
        if(host)await currentHost(transaction,host,sender);
        if(reader)await assertPageRequestInTransaction(transaction,row.requestId,row.namespace,{reader});
        const original=await transaction.get(COMMAND_JOURNAL,preparationKey(row.namespace,row.preparationId));
        invariant(original?.pageRequestId===row.requestId&&original.runId===preparation.runId&&original.resultId===preparation.resultId,'E_OWNER');
      };
      snapshot=await snapshotControllerRunInScope({runId:preparation.runId},row.namespace,guard);
      invariant(snapshot.run?.taskPreparationId===row.preparationId&&snapshot.run.resultId===preparation.resultId,'E_OWNER');
      snapshot.runs=snapshot.runs.filter(run=>run.runId===preparation.runId);
    }
    await authorize();
    const settled=preparation?await tx(RUN_READ,async transaction=>!await preparationUnresolved(transaction,preparation)):false;
    return {request:pageRequestView(row,preparation,approvalAllowed),preparation:preparation?preparationView(preparation):null,
      snapshot,resolvedInstallation,settled,authorize};
  }
  async function listPageTaskRequests(request={},sender){
    fields(request,[]);const host=await assertHost(sender);
    return tx(RUN_READ,async transaction=>{
      await currentHost(transaction,host,sender);
      const requests=(await transaction.all(COMMAND_JOURNAL)).filter(row=>row.tag==='page-task-request'&&row.namespace===namespace(host))
        .sort((a,b)=>b.createdAt-a.createdAt).slice(0,64);
      const result=[];
      for(const row of requests)result.push(pageRequestView(row,await transaction.get(COMMAND_JOURNAL,preparationKey(row.namespace,row.preparationId))));
      return {requests:result};
    });
  }
  async function readPageTaskRequest(request,sender){
    fields(request,['requestId'],['requestId']);id(request.requestId);const host=await assertHost(sender);
    const row=await tx(RUN_READ,async transaction=>{
      await currentHost(transaction,host,sender);
      const row=await transaction.get(COMMAND_JOURNAL,pageRequestKey(namespace(host),request.requestId));
      invariant(row?.tag==='page-task-request'&&row.namespace===namespace(host),'E_OWNER');return row;
    });
    const {authorize,...result}=await pageRequestStatus(row,{sender});return result;
  }
  // Called only by Installed Page's authenticated onUserScriptMessage path.
  // This method is deliberately absent from the Host/Content RPC route table.
  async function handlePageTaskRequest(message,source){
    invariant(pageTaskSource,'E_PAGE_AUTHORIZATION');
    const {operation}=message,payload=structuredClone(message.payload);
    const sourceEpoch=pageSourceEpochs.get(source.tabId)||0;
    invariant(['request','read','restore'].includes(operation),'E_SCHEMA');
    fields(payload,operation==='request'?['requestId','taskId','params']:operation==='read'?['requestId']:[],
      operation==='request'?['requestId','taskId','params']:operation==='read'?['requestId']:[]);
    await pageTaskSource.authorize(source);
    if(operation==='request'){
      invariant(typeof payload.requestId==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload.requestId),'E_SCHEMA');
      invariant(new TextEncoder().encode(canonical(payload.params,{maxDepth:12})).byteLength<=8192,'E_BUDGET');
      const pin=source.delegatedTasks.find(pin=>pin.taskId===payload.taskId);
      invariant(pin,'E_PERMISSION','Task is not pinned in this installed Page');
      await requireGrant(api,httpUrl(pin.targetUrl).origin);
      const environment=builtinIdentity(await loadBuiltin({runtime:api.runtime}));
      const sourceFence=nativeFence(source.tabId,httpUrl(source.url).origin,0);
      const row=await tx(RUN_WRITE,async transaction=>{
        await pageTaskSource.inTransaction(transaction,source);
        invariant((pageSourceEpochs.get(source.tabId)||0)===sourceEpoch,'E_DOCUMENT_STALE');
        const existing=await transaction.get(COMMAND_JOURNAL,pageRequestKey(source.namespace,payload.requestId));
        if(existing){
          invariant(existing.tag==='page-task-request'&&pageReaderMatches(existing.pageSource,source)&&
            existing.task.taskId===payload.taskId&&same(existing.params,payload.params),'E_REQUEST_CONFLICT');return existing;
        }
        const rows=(await transaction.all(COMMAND_JOURNAL)).filter(row=>row.tag==='page-task-request');
        invariant(rows.length<4096,'E_QUOTA');
        invariant(!rows.some(row=>pageSlotMatches(row.pageSource,source)),'E_EFFECT_UNKNOWN','Restore and query the original Page request');
        const resolved=await resolvePageTask(transaction,source.namespace,pin,payload.params,environment);
        const task=Object.fromEntries(['taskId','version','manifestHash','contentHash','installationId','generation'].map(key=>[key,resolved[key]]));
        const row={tag:'page-task-request',namespace:source.namespace,requestId:payload.requestId,
          preparationId:'page:'+payload.requestId,task,params:payload.params,target:{mode:'owned',url:pin.targetUrl},
          pageSource:structuredClone(source),sourceFence,sourceEpoch,browserSessionIncarnation:session,createdAt:now()};
        await transaction.put(COMMAND_JOURNAL,row,pageRequestKey(source.namespace,row.requestId));return row;
      });
      // Hints are best effort; the original journal is discoverable after loss.
      const hosts=await tx(RUN_READ,async transaction=>(await transaction.all(COMMAND_JOURNAL))
        .filter(host=>host.tag==='host'&&host.active&&host.namespace===source.namespace&&host.browserSessionIncarnation===session));
      await Promise.allSettled(hosts.map(host=>emitToHost(host.registrationId,{type:'page-task-requested',requestId:row.requestId})));
      await pageTaskSource.authorize(source);
      return {requestId:row.requestId,preparationId:row.preparationId,accepted:true,state:'pending-approval'};
    }
    const row=await tx(RUN_READ,async transaction=>{
      await pageTaskSource.inTransaction(transaction,source);
      if(operation==='read'){
        id(payload.requestId);return assertPageRequestInTransaction(transaction,payload.requestId,source.namespace,{reader:source});
      }
      const matches=(await transaction.all(COMMAND_JOURNAL)).filter(row=>row.tag==='page-task-request'&&pageSlotMatches(row.pageSource,source));
      invariant(matches.length<=1,'E_OWNER');
      if(matches[0])invariant(pageReaderMatches(matches[0].pageSource,source),'E_REVISION','Original Page request has another installation grant');
      return matches[0]??null;
    });
    if(!row)return {requestId:null,state:'idle'};
    const status=await pageRequestStatus(row,{reader:source});
    const reply={requestId:row.requestId,preparationId:row.preparationId,state:status.request.state,
      ...(status.preparation?.runId?{runId:status.preparation.runId,resultId:status.preparation.resultId}:{}),params:structuredClone(row.params)};
    if(status.snapshot?.run){
      reply.state=status.snapshot.results.length?status.snapshot.run.state:'unknown';
      if(typeof projectPageTaskResult==='function'&&status.snapshot.run.state==='completed'&&status.snapshot.results.length){
        const {authorize,...input}=status;
        await authorize();reply.projection=await projectPageTaskResult(input,{authorize});await authorize();
      }
    }
    return reply;
  }

  // Shared preparation is a commandJournal fence, never a second Run/runner.
  const preparationKey = (ns, preparationId) => `task-preparation:${canonical([ns,preparationId])}`;
  const preparationStartKey = (ns, preparationId) => `task-preparation-start:${canonical([ns,preparationId])}`;
  function preparationView(row) {
    return structuredClone(Object.fromEntries(['preparationId','task','params','target','binding','source','pageRequestId',
      'deadlineAt','expiresAt','state','runId','resultId','operationRef'].filter(key=>row[key]!==undefined).map(key=>[key,row[key]])));
  }
  async function runDurablySettled(transaction,run){
    if(!run||run.tag!==CONTROLLER_RUN_TAG||!terminals.has(run.state)||run.retirementState!=='released')return false;
    const result=await transaction.get('results',run.resultId);
    return result?.tag==='controller-result'&&result.runId===run.runId&&result.resultId===run.resultId&&
      result.namespace===run.namespace&&same(result.principal,run.principal)&&result.state===run.state;
  }
  async function preparationUnresolved(transaction,row) {
    if(!row.runId)return row.state!=='cancelled';
    const run=await transaction.get(RUN_STORE,row.runId);
    return run?.taskPreparationId!==row.preparationId||run?.resultId!==row.resultId||
      run?.namespace!==row.namespace||!same(run?.principal,row.principal)||!await runDurablySettled(transaction,run);
  }
  async function assertPreparationSlot(transaction,ns,exceptId) {
    for(const row of await transaction.all(COMMAND_JOURNAL))
      if(row.tag==='task-run-preparation'&&row.namespace===ns&&row.preparationId!==exceptId)
        invariant(!await preparationUnresolved(transaction,row),CONTROLLER_OWNER_ERROR,'An unresolved Task preparation owns admission');
    const slot=await transaction.get(RUN_STORE,'@slot');
    invariant(!slot?.currentRunId&&!slot?.preview,CONTROLLER_OWNER_ERROR,'Previous execution still owns the single slot');
    for(const run of await transaction.all(RUN_STORE))
      if(run.tag===CONTROLLER_RUN_TAG)
        invariant(await runDurablySettled(transaction,run),CONTROLLER_OWNER_ERROR,
          'An unsettled or unreleased Controller Run owns admission');
  }
  async function verifyRecoveryRecord(row,sender,appId){
    if(!row||typeof row!=='object'||Array.isArray(row)||typeof row.clientRequestId!=='string')return false;
    const host=await assertHost(sender);
    return tx(RUN_READ,async transaction=>{
      await currentHost(transaction,host,sender);
      const steps=(await transaction.all(COMMAND_JOURNAL)).filter(step=>step.tag==='task-delegation-step'&&
        step.appId===appId&&step.clientRequestId===row.clientRequestId&&step.securityPartition===namespace(host)&&
        same(step.principalRef,host.principal));
      if(!steps.length)return false;
      for(const step of steps){
        if(!step.runId){
          if(!(step.prepared===true&&step.cancelled===true&&step.state==='cancelled'&&step.admissionCount===0))return false;
          continue;
        }
        const run=await transaction.get(RUN_STORE,step.runId);
        if(run?.namespace!==namespace(host)||!same(run?.principal,host.principal)||run?.resultId!==step.resultId||
          run?.taskDelegationStep?.operationRef!==step.operationRef||
          run?.taskDelegationStep?.clientRequestId!==step.clientRequestId||!await runDurablySettled(transaction,run))return false;
      }
      return true;
    });
  }
  const withRecovery=(binding,sender,work)=>withTaskRunRecovery(work,
    {appId:binding?.appId,verifyRecovery:(row,appId)=>verifyRecoveryRecord(row,sender,appId)});
  async function withPreparationBinding(binding,work,lockedAppIds=[]) {
    if(!binding)return work();
    invariant(!binding.controller,CONTROLLER_SCHEMA_ERROR);
    // The public binding may omit the redundant installed App tasks list.
    return withAppLifecycleLock(binding.appId,async()=>{
      const app=await readTaskDelegationApp(api,binding.appId);
      const checked={...app,...binding};
      await assertTaskDelegationApp(api,checked);
      return work(checked);
    },lockedAppIds);
  }
  async function prepareTaskRun(request,sender) {
    request=structuredClone(request);
    fields(request,['preparationId','task','params','target','binding','pageRequestId'],['preparationId','task','params','target']);
    id(request.preparationId);normalizeDelegatedTask(request.task,true);selection(request.target);
    if(request.pageRequestId!==undefined){id(request.pageRequestId);invariant(!request.binding,'E_SCHEMA');}
    if(request.binding){
      normalizeDelegatedTask(request.binding.task,true);
      invariant(same(request.binding.task,request.task),CONTROLLER_OWNER_ERROR);
    }
    await withRecovery(request.binding,sender,(lockedAppIds=[])=>withPreparationBinding(request.binding,()=>withRunAdmissionLock(async()=>{
      const host=await assertHost(sender),environment=builtinIdentity(await loadBuiltin({runtime:api.runtime}));
      const pageRequest=request.pageRequestId?await tx(RUN_READ,transaction=>
        assertPageRequestInTransaction(transaction,request.pageRequestId,namespace(host),{submission:true})):null;
      if(pageRequest){
        invariant(pageRequest.preparationId===request.preparationId&&same(pageRequest.task,request.task)&&
          same(pageRequest.params,request.params)&&same(pageRequest.target,request.target),'E_OWNER');
        await pageTaskSource.authorize(pageRequest.pageSource);
      }
      // An owned preparation pins only the destination. Native tab creation
      // belongs to the original one-shot Run admission after approval.
      const observed=request.target.mode==='borrowed'?await observeControllerTarget({api,...request.target}):null;
      const origin=observed?.allowedOrigin??httpUrl(request.target.url).origin;
      if(request.target.mode==='owned')await requireGrant(api,origin);
      const fence=nativeFence(request.target.tabId,origin,request.target.frameId??0);
      const key=preparationKey(namespace(host),request.preparationId);
      await tx(RUN_WRITE,async transaction=>{
        await currentHost(transaction,host,sender);
        if(pageRequest)await assertPageRequestInTransaction(transaction,request.pageRequestId,namespace(host),{submission:true});
        const old=await transaction.get(COMMAND_JOURNAL,key);
        if(old){
          invariant(!(old.state==='cancelled'&&!old.task),CANCELLED_CODE,'Task preparation was cancelled before saving');
          invariant(old.tag==='task-run-preparation'&&same(old.principal,host.principal)&&
            same(old.task,request.task)&&same(old.params,request.params)&&same(old.target,request.target)&&
            same(old.binding??null,request.binding??null)&&old.pageRequestId===request.pageRequestId,REQUEST_CONFLICT);
          return;
        }
        await assertPreparationSlot(transaction,namespace(host));
        const source={kind:'saved',scriptId:`task:${request.task.taskId}:${request.task.version}`,revision:1,contentHash:request.task.contentHash};
        const installed=await assertInstalledTask(transaction,namespace(host),{...source,origin,
          params:request.params,migrate:true,builtinIdentity:environment,
          expectedGeneration:request.task.generation,expectedInstallationId:request.task.installationId});
        invariant(installed.installation.manifestHash===request.task.manifestHash,'E_REVISION');
        const at=now(),deadlineAt=at+(installed.candidate.package.manifest.deadlineMs??30000);
        const row={tag:'task-run-preparation',namespace:namespace(host),principal:host.principal,...request,source,
          builtinIdentity:environment,browserSessionIncarnation:session,nativeFence:fence,observedTarget:observed,
          createdAt:at,deadlineAt,expiresAt:deadlineAt,state:'prepared',runId:null,resultId:null,operationRef:newId()};
        await transaction.put(COMMAND_JOURNAL,row,key);
      });
      // Read the committed identity back; a lost reply is recovered by inspection.
    },{allowWithoutLocks:api!==globalThis.chrome}),lockedAppIds));
    return inspectTaskRun({preparationId:request.preparationId},sender);
  }
  async function inspectTaskRun(request={},sender) {
    fields(request,['preparationId']);
    if(request.preparationId!==undefined)id(request.preparationId);
    const host=await assertHost(sender);
    const row=await tx(RUN_READ,async transaction=>{
      await currentHost(transaction,host,sender);
      if(request.preparationId!==undefined){
        const row=await transaction.get(COMMAND_JOURNAL,preparationKey(namespace(host),request.preparationId));
        if(!row)return null;
        invariant(row.tag==='task-run-preparation'&&same(row.principal,host.principal),CONTROLLER_OWNER_ERROR);
        return row;
      }
      const rows=[];
      for(const row of await transaction.all(COMMAND_JOURNAL))
        if(row.tag==='task-run-preparation'&&row.namespace===namespace(host)&&
          await preparationUnresolved(transaction,row))rows.push(row);
      invariant(rows.length<=1,CONTROLLER_OWNER_ERROR,'Multiple unresolved Task preparations');
      return rows[0]??null;
    });
    if(!row)return {preparation:null,settled:false};
    const preparation=preparationView(row);
    if(!row.runId){
      if(row.state==='prepared'&&row.browserSessionIncarnation!==session)preparation.state='unknown';
      return {preparation,settled:row.state==='cancelled'};
    }
    const settled=await tx(RUN_READ,async transaction=>{
      await currentHost(transaction,host,sender);
      return !await preparationUnresolved(transaction,row);
    });
    // Reuse original snapshot result-disclosure guards; never transfer Run ownership.
    let snapshot;
    try { snapshot=await snapshotControllerRun({runId:row.runId},sender); }
    catch { return {preparation:{...preparation,state:'unknown'},settled}; }
    if(snapshot.run?.taskPreparationId!==row.preparationId||snapshot.run?.resultId!==row.resultId)
      return {preparation:{...preparation,state:'unknown'},settled:false};
    // A durable running row is not a live Worker proof after transport loss.
    if(!snapshot.results.length)preparation.state='unknown';
    return {preparation,settled,
      snapshot:{...snapshot,runs:snapshot.runs.filter(run=>run.runId===row.runId)}};
  }
  // Locators only, scoped to the caller's current reviewed App and exact Task.
  // Results remain behind inspectTaskRun's original disclosure guards.
  async function listTaskRunPreparations(request,sender){
    fields(request,['binding'],['binding']);
    normalizeDelegatedTask(request.binding?.task,true);
    return withPreparationBinding(request.binding,async()=>{
      const host=await assertHost(sender),binding=request.binding;
      return tx(RUN_READ,async transaction=>{
        await currentHost(transaction,host,sender);
        const rows=(await transaction.all(COMMAND_JOURNAL)).filter(row=>row.tag==='task-run-preparation'&&
          row.namespace===namespace(host)&&same(row.principal,host.principal)&&
          row.binding?.appId===binding.appId&&row.binding.packageHash===binding.packageHash&&
          row.binding.generation===binding.generation&&same(row.task,binding.task))
          .sort((a,b)=>b.createdAt-a.createdAt).slice(0,100);
        const preparations=[];
        for(const row of rows)preparations.push({...Object.fromEntries(
          ['preparationId','task','state','runId','resultId'].map(key=>[key,row[key]])),
          settled:!await preparationUnresolved(transaction,row)});
        return {preparations};
      });
    });
  }
  async function cancelTaskRun(request,sender) {
    fields(request,['preparationId'],['preparationId']);id(request.preparationId);
    const host=await assertHost(sender);
    const row=await tx(RUN_WRITE,async transaction=>{
      await currentHost(transaction,host,sender);
      const row=await transaction.get(COMMAND_JOURNAL,preparationKey(namespace(host),request.preparationId))??
        {tag:'task-run-preparation',namespace:namespace(host),principal:host.principal,
          preparationId:request.preparationId,state:'cancelled',runId:null,resultId:null,operationRef:newId(),createdAt:now()};
      invariant(row?.tag==='task-run-preparation'&&same(row.principal,host.principal),CONTROLLER_OWNER_ERROR);
      if(!row.runId){row.state='cancelled';row.cancelledAt=now();
        await transaction.put(COMMAND_JOURNAL,row,preparationKey(namespace(host),row.preparationId));}
      return row;
    });
    if(row.runId)await stopControllerRunInternal({runId:row.runId,requestId:`${row.operationRef}:cancel`},sender,row);
    return inspectTaskRun(request,sender);
  }

  async function startControllerRun(request, sender) {
    request=structuredClone(request);
    if(request?.taskPreparationId!==undefined)id(request.taskPreparationId);
    const operation=()=>request?.profile==='app-service'?prepareAppServiceRun(request,sender):
      withRecovery(request?.taskDelegation,sender,(lockedAppIds=[])=>request?.taskPreparationId?
        withPreparationBinding(request.taskDelegation,()=>startControllerRunDelegated(request,sender),lockedAppIds):
        withTaskDelegation(request?.taskDelegation,()=>startControllerRunDelegated(request,sender),lockedAppIds));
    return request?.cloudRequestId&&cloud?.withStartupFailure?
      cloud.withStartupFailure(request,sender,'admission',operation):operation();
  }
  async function startControllerRunDelegated(request, sender) {
    return withRunAdmissionLock(()=>startControllerRunLocked(request,sender),{allowWithoutLocks:api!==globalThis.chrome});
  }
  async function startControllerRunLocked(request, sender) {
    selection(request.target);
    let changed = false;
    const target = request.target;
    const activated = info => {if (info.windowId === target.expectedWindowId && info.tabId !== target.tabId) changed = true;};
    const updated = (tabId, change, tab) => {
      if (tabId !== target.tabId) return;
      if (['loading', 'unloaded'].includes(change.status) || change.pendingUrl ||
          (change.url !== undefined && change.url !== target.expectedUrl) || tab?.incognito) changed = true;
    };
    const navigated = details => {
      if (details.tabId === target.tabId && details.frameId === target.frameId &&
          ((details.documentId !== undefined && details.documentId !== target.documentId) || details.url !== target.expectedUrl)) changed = true;
    };
    const removed = tabId => {if (tabId === target.tabId) changed = true;};
    const navigating = details => {if (details.tabId === target.tabId && details.frameId === target.frameId) changed = true;};
    const windowRemoved = windowId => {if (windowId === target.expectedWindowId) changed = true;};
    const fences = [[api.tabs.onActivated, activated], [api.tabs.onUpdated, updated], [api.tabs.onRemoved, removed],
      [api.webNavigation.onBeforeNavigate, navigating], [api.webNavigation.onCommitted, navigated], [api.webNavigation.onHistoryStateUpdated, navigated],
      [api.webNavigation.onReferenceFragmentUpdated, navigated], [api.windows?.onRemoved, windowRemoved]];
    const assertCandidate = () => invariant(!changed, 'E_DOCUMENT_STALE', 'Captured Current Page changed during admission');
    if (target.expectedWindowId !== undefined) for (const [event, listener] of fences) event?.addListener(listener);
    try { return await prepareControllerRun(request, sender, assertCandidate); }
    finally { if (target.expectedWindowId !== undefined) for (const [event, listener] of fences) event?.removeListener(listener); }
  }
  async function prepareAppServiceRun(request,sender){
    fields(request,['profile','appId','scheduledFireId','expectedScheduleOwner','requestId','deadlineAt'],
      ['profile','appId','scheduledFireId','expectedScheduleOwner','requestId','deadlineAt']);
    id(request.requestId);
    invariant(request.requestId===request.scheduledFireId,'E_OWNER','App service requires an approved schedule occurrence');
    invariant(Number.isSafeInteger(request.deadlineAt)&&request.deadlineAt>now()&&request.deadlineAt<=now()+60000,CONTROLLER_TIMEOUT_ERROR);
    await requireCloudRunnerSender(api,sender);
    const locks=globalThis.navigator?.locks;
    invariant(locks?.request,'E_TOOL_LOCK');
    // Keep the lifecycle/recovery locks outside admission, including App services,
    // so the injected recovery adapter never reacquires an App lock we hold.
    return withRecovery({appId:request.appId},sender,(lockedAppIds=[])=>withAppLifecycleLock(request.appId,()=>
      locks.request('opendesk.sidebar-tools:catalog',()=>withRunAdmissionLock(async()=>{
      const {tool,binding}=await readAppServiceInstallation(api,request.appId);
      const expectedScheduleOwner=await scheduled.prepareAdmission(request.scheduledFireId,request.expectedScheduleOwner);
      const host=await assertHost(sender),environment=builtinIdentity(await loadBuiltin({runtime:api.runtime}));
      const requestDigest=await digest(request,wireCanonicalOptions),admissionKey=`scheduled-start:${request.scheduledFireId}`;
      return tx(RUN_WRITE,async transaction=>{
        await currentHost(transaction,host,sender);
        const old=await transaction.get(COMMAND_JOURNAL,admissionKey);
        if(old){
          invariant(old.requestDigest===requestDigest,REQUEST_CONFLICT);
          const run=await owner(transaction,await transaction.get(RUN_STORE,old.runId),host,sender);
          return {runId:run.runId,state:run.state,duplicate:true};
        }
        await assertPreparationSlot(transaction,namespace(host));
        const slot=await transaction.get(RUN_STORE,'@slot');
        invariant(!slot?.currentRunId&&!slot?.preview,CONTROLLER_OWNER_ERROR,'Previous execution still owns the single slot');
        const fire=await scheduled.admit(transaction,request.scheduledFireId,{...request,expectedScheduleOwner,paramsDecoded:{}},null,now());
        const runId=newId(),scriptId=`app:${binding.appId}`;
        const revision={kind:'app-service',scriptId,revision:1,sourceHash:binding.codeHash,builtinIdentity:environment};
        const identity={tag:CONTROLLER_RUN_TAG,profile:'app-service',appBinding:binding,runId,ownerEpoch:1,
          hostInstanceId:host.hostInstanceId,hostDocumentId:host.hostDocumentId,scriptId,revision:1,contentHash:binding.codeHash,target:null};
        const run={tag:CONTROLLER_RUN_TAG,profile:'app-service',appBinding:binding,runId,namespace:namespace(host),principal:host.principal,
          registrationId:host.registrationId,hostDocumentId:host.hostDocumentId,hostInstanceId:host.hostInstanceId,browserSessionIncarnation:session,
          scriptId,contentHash:binding.codeHash,builtinAbi:BUILTIN_ABI,builtinIdentity:environment,sourceKind:'app-service',
          opId:newId(),resultId:newId(),requestId:request.requestId,requestDigest,deadlineAt:request.deadlineAt,paramsWire:encodeValue({}),
          selection:{mode:'app-service'},startUrl:null,nativeTabId:null,networkOrigins:[],target:null,identity,revision,
          state:'running',ownerEpoch:1,runRevision:1,eventSeq:1,cancelSeq:0,workerRetired:false,retirementState:'not-started',createdAt:now(),scheduledFireId:fire.fireId};
        await transaction.put(RUN_STORE,run,runId);await lease(transaction,run);
        await transaction.put(RUN_STORE,{tag:'slot',currentRunId:runId,state:'held',releaseCount:0,fencedEpoch:1,retirementId:null},'@slot');
        await transaction.put(COMMAND_JOURNAL,{tag:'controller-start',runId,requestDigest},admissionKey);
        await scheduled.bind(transaction,fire,run);
        return {...project(run),sourceUtf8:tool.background.js,paramsWire:run.paramsWire};
      });
    },{allowWithoutLocks:api!==globalThis.chrome})),lockedAppIds));
  }
  async function prepareControllerRun(request, sender, assertCandidate) {
    const admissionStartedAt=now();
    // A single admission API supports exact saved revisions and immutable draft
    // snapshots. The original top-level saved request remains compatible.
    fields(request, ['requestId', 'scriptId', 'revision', 'contentHash', 'source', 'paramsWire', 'target', 'deadlineAt','networkOrigins','expectedTaskGeneration','expectedTaskInstallationId','taskDelegation','taskDelegationStep','cloudRequestId','scheduledFireId','expectedScheduleOwner','retainedFrom','taskPreparationId'],
      ['requestId', 'paramsWire', 'target', 'deadlineAt']);
    id(request.requestId); selection(request.target); const runParams=decodeValue(request.paramsWire);
    const environment=builtinIdentity(await loadBuiltin({runtime:api.runtime}));
    const variant = request.source, isDraft = variant?.kind === 'draft',isAppController=variant?.kind==='app-controller';
    let appController,executionParamsWire=request.paramsWire;
    if (variant !== undefined) {
      invariant(!['scriptId', 'revision', 'contentHash'].some(key => Object.hasOwn(request, key)),
        CONTROLLER_SCHEMA_ERROR, 'Mixed source variants');
      invariant(isDraft || isAppController || variant?.kind === 'saved', CONTROLLER_SCHEMA_ERROR, 'Unknown controller source variant');
      const sourceFields=isAppController?['kind','appId','packageHash','generation']:isDraft?['kind','sourceUtf8']:['kind','scriptId','revision','contentHash'];
      fields(variant,sourceFields,sourceFields);
    }
    if(isAppController){
      invariant(request.taskDelegation?.controller&&request.taskDelegationStep&&
        request.target.mode==='borrowed'&&!request.cloudRequestId&&!request.scheduledFireId&&
        (!request.networkOrigins||request.networkOrigins.length===0),'E_PERMISSION');
      const binding=request.taskDelegation;
      invariant(['appId','packageHash','generation'].every(key=>variant[key]===binding[key]),'E_OWNER');
      appController=(await assertAppControllerBinding(api,binding)).tool.controller;
      assertBuiltinIdentity(appController.builtinIdentity,environment);
      executionParamsWire=encodeValue(validateTaskParams(appController.paramsSchema,runParams));
      invariant(request.deadlineAt<=admissionStartedAt+appController.deadlineMs,CONTROLLER_TIMEOUT_ERROR);
    }
    const saved = isDraft||isAppController ? null : variant || request;
    const isInstalledTask = !isDraft&&!isAppController && saved.scriptId?.startsWith('task:');
    if(Object.hasOwn(request,'retainedFrom')){
      fields(request.retainedFrom,['runId','requestId'],['runId','requestId']);
      id(request.retainedFrom.runId);id(request.retainedFrom.requestId);
      invariant(isInstalledTask&&request.target.mode==='borrowed'&&
        !request.taskDelegation&&!request.taskDelegationStep&&
        !request.cloudRequestId&&!request.scheduledFireId,
        'E_PERMISSION','Retained continuation requires an independently admitted installed Task');
    }
    if(request.taskDelegation){
      invariant((isInstalledTask||isAppController)&&!request.cloudRequestId&&!request.scheduledFireId,'E_PERMISSION');
      if(!isAppController)normalizeDelegatedTask(request.taskDelegation.task,true);
      await assertTaskDelegationApp(api,request.taskPreparationId?
        {...await readTaskDelegationApp(api,request.taskDelegation.appId),...request.taskDelegation}:request.taskDelegation);
    }
    if(request.taskDelegationStep){
      invariant(request.taskDelegation&&!request.cloudRequestId&&!request.scheduledFireId&&
        request.target.mode==='borrowed','E_PERMISSION');
      fields(request.taskDelegationStep,['clientRequestId','operationRef'],
        ['clientRequestId','operationRef']);
      delegationId(request.taskDelegationStep.clientRequestId);
      id(request.taskDelegationStep.operationRef);
    }
    invariant(isInstalledTask?Object.hasOwn(request,'expectedTaskGeneration')&&Object.hasOwn(request,'expectedTaskInstallationId'):
      !Object.hasOwn(request,'expectedTaskGeneration')&&!Object.hasOwn(request,'expectedTaskInstallationId'),
      'E_REVISION','安装任务必须绑定点击时的安装身份和授权代次');
    invariant(!request.scheduledFireId || isInstalledTask && !request.cloudRequestId && request.requestId===request.scheduledFireId,
      'E_PERMISSION','Schedule admission requires an immutable installed task and FireId');
    invariant(request.scheduledFireId||request.expectedScheduleOwner===undefined,
      'E_OWNER','A schedule owner may only accompany a persisted scheduled occurrence');
    const frozenSource=isDraft||isAppController;
    const draftSourceUtf8 = isDraft ? variant.sourceUtf8 : appController?.sourceUtf8;
    if (frozenSource) {
      invariant(typeof draftSourceUtf8 === 'string' &&
        new TextEncoder().encode(draftSourceUtf8).byteLength <= CONTROLLER_SOURCE_LIMIT,
        'E_LIMIT', 'Draft source exceeds Controller source budget');
      // Only executable source gets the source allowance. Metadata and params
      // retain the ordinary admitted envelope and value codec limits.
      invariant(new TextEncoder().encode(canonical({...request,source:{kind:'draft',sourceUtf8:''}},wireCanonicalOptions)).byteLength <=
        BUDGETS.maxRawFrameBytes,'E_LIMIT','Controller admission metadata exceeds host message budget');
      invariant(new TextEncoder().encode(JSON.stringify(request)).byteLength <=
        TASK_PACKAGE_LIMIT,'E_LIMIT','Controller source admission envelope exceeds budget');
      // Escaped source uses the bounded source envelope, never the ordinary
      // value allowance. Reject unpaired surrogates before accepting its hash.
      encodeValue(draftSourceUtf8,{maxBytes:TASK_PACKAGE_LIMIT});
    } else {
      id(saved.scriptId);
      invariant(Number.isSafeInteger(saved.revision) && saved.revision > 0 &&
        /^[a-f0-9]{64}$/.test(saved.contentHash), 'E_REVISION');
    }
    invariant(Number.isSafeInteger(request.deadlineAt) && request.deadlineAt > now(), CONTROLLER_TIMEOUT_ERROR);
    const sourceHash = frozenSource ? await digestUtf8(draftSourceUtf8) : saved.contentHash;
    const host = await assertHost(sender), requestDigest = await digest(request, wireCanonicalOptions);
    const requestedPreparation=request.taskPreparationId?await tx(RUN_READ,transaction=>
      transaction.get(COMMAND_JOURNAL,preparationKey(namespace(host),request.taskPreparationId))):null;
    const pageRequest=requestedPreparation?.pageRequestId?await tx(RUN_READ,transaction=>
      assertPageRequestInTransaction(transaction,requestedPreparation.pageRequestId,namespace(host),{submission:true})):null;
    if(pageRequest)await pageTaskSource.authorize(pageRequest.pageSource);
    const selectedOrigin = request.target.mode === 'owned' ? httpUrl(request.target.url).origin : null;
    let observed;
    if (request.target.mode === 'borrowed') observed = await observeControllerTarget({api, ...request.target});
    else await requireGrant(api, httpUrl(request.target.url).origin);
    if(isAppController)invariant(appController.siteOrigins.includes(observed.allowedOrigin),'E_PERMISSION');
    const networkOrigins = normalizeControllerNetworkOrigins(selectedOrigin || observed.allowedOrigin,
      request.networkOrigins ?? [], {installedTask:isInstalledTask});
    for (const origin of networkOrigins) await requireGrant(api, origin);
    const nativeNetworkFences = networkOrigins.map(origin => ({origin,
      permissionEpoch:nativeFence(request.target.tabId,origin).permissionEpoch}));
    const capturedFence = nativeFence(request.target.tabId, selectedOrigin || observed.allowedOrigin, request.target.frameId ?? 0);
    const expectedScheduleOwner=request.scheduledFireId?
      await scheduled.prepareAdmission(request.scheduledFireId,request.expectedScheduleOwner):undefined;
    const admissionKey = request.taskPreparationId ? preparationStartKey(namespace(host),request.taskPreparationId) : request.taskDelegationStep ? 'delegated-start:'+request.taskDelegationStep.operationRef :
      request.scheduledFireId ? `scheduled-start:${request.scheduledFireId}` :
      request.cloudRequestId ? `cloud-start:${request.cloudRequestId}` : `controller-start:${canonical([host.registrationId, request.requestId])}`;
    invariant(!request.cloudRequestId || isInstalledTask && request.requestId===request.cloudRequestId && request.target.mode==='owned','E_TASK');
    const runDelegation=request.taskDelegation&&request.taskPreparationId?
      {...await readTaskDelegationApp(api,request.taskDelegation.appId),...request.taskDelegation}:request.taskDelegation;
    const admitted = await tx(RUN_WRITE, async transaction => {
      await currentHost(transaction, host, sender);
      assertCandidate();
      const installedTask=isInstalledTask?await assertInstalledTask(transaction,namespace(host),{
        scriptId:saved.scriptId,contentHash:saved.contentHash,
        origin:selectedOrigin || observed.allowedOrigin,params:runParams,migrate:true,builtinIdentity:environment,
        expectedGeneration:request.expectedTaskGeneration,expectedInstallationId:request.expectedTaskInstallationId}):null;
      if(request.taskDelegation&&!isAppController){
        const pin=request.taskDelegation.task,installation=installedTask.installation;
        invariant(sameTaskPin(pin,{...installation,contentHash:saved.contentHash})&&
          pin.installationId===installation.authorization?.installationId&&
          pin.generation===installation.authorization?.generation,'E_REVISION');
      }
      if(installedTask)invariant(request.deadlineAt<=admissionStartedAt+
        (installedTask.candidate.package.manifest.deadlineMs??30000),CONTROLLER_TIMEOUT_ERROR,
        'Installed Task deadline exceeds its reviewed manifest limit');
      const scheduledFire=request.scheduledFireId?
        await scheduled.admit(transaction,request.scheduledFireId,{...request,expectedScheduleOwner,paramsDecoded:runParams},
          selectedOrigin||observed.allowedOrigin,now()):null;
      const delegationStepKey=request.taskDelegationStep?
        delegationKey(request.taskDelegation,request.taskDelegationStep.clientRequestId):null;
      const step=delegationStepKey?await transaction.get(COMMAND_JOURNAL,delegationStepKey):null;
      if(delegationStepKey){
        invariant(step?.tag==='task-delegation-step'&&step.prepared&&
          step.operationRef===request.taskDelegationStep.operationRef&&
          step.appId===request.taskDelegation.appId&&
          step.packageHash===request.taskDelegation.packageHash&&
          step.generation===request.taskDelegation.generation&&
          step.deadlineAt===request.deadlineAt&&
          step.fingerprint===delegationFingerprint(request.taskDelegation,
            await digest(runParams,wireCanonicalOptions),request.target),'E_OWNER',
          'Prepared step does not match admission');
        if(isAppController)invariant(step.preparedHost?.registrationId===host.registrationId&&
          step.preparedHost?.hostDocumentId===host.hostDocumentId&&
          step.preparedHost?.hostInstanceId===host.hostInstanceId&&
          step.preparedHost?.iframeInstanceId===request.taskDelegation.instanceId&&
          step.preparedHost?.browserSessionIncarnation===session,'E_OWNER');
      }
      const preparation=request.taskPreparationId?await transaction.get(COMMAND_JOURNAL,
        preparationKey(namespace(host),request.taskPreparationId)):null;
      if(request.taskPreparationId){
        id(request.taskPreparationId);
        invariant(preparation?.tag==='task-run-preparation'&&same(preparation.principal,host.principal)&&
          isInstalledTask&&!request.taskDelegationStep&&!request.cloudRequestId&&!request.scheduledFireId&&
          same(preparation.source,{kind:'saved',scriptId:saved.scriptId,revision:saved.revision,contentHash:saved.contentHash})&&
          same(preparation.params,runParams)&&same(preparation.target,request.target)&&
          same(preparation.binding??null,request.taskDelegation??null)&&
          preparation.deadlineAt===request.deadlineAt&&
          preparation.task.generation===request.expectedTaskGeneration&&
          preparation.task.installationId===request.expectedTaskInstallationId&&
          preparation.task.manifestHash===installedTask.installation.manifestHash,CONTROLLER_OWNER_ERROR,
          'Task preparation does not match admission');
        assertBuiltinIdentity(preparation.builtinIdentity,environment);
      }
      const old = await transaction.get(COMMAND_JOURNAL, admissionKey);
      if (old) {
        if(preparation){
          const run=await transaction.get(RUN_STORE,old.runId);
          invariant(preparation.runId===old.runId&&run?.taskPreparationId===preparation.preparationId&&
            run.resultId===preparation.resultId,CONTROLLER_OWNER_ERROR);
          return {run,duplicate:true};
        }
        if(delegationStepKey){
          invariant(step.runId===old.runId,'E_OWNER');
          const previousRun=await transaction.get(RUN_STORE,old.runId);
          invariant(previousRun?.tag===CONTROLLER_RUN_TAG&&
            previousRun.taskDelegationStep?.operationRef===step.operationRef&&
            previousRun.resultId===step.resultId,'E_OWNER');
          // Do not transfer the previous Worker's ownership to this Host.
          return {run:previousRun,duplicate:true};
        }
        invariant(old.requestDigest === requestDigest, REQUEST_CONFLICT);
        const run=await owner(transaction, await transaction.get(RUN_STORE, old.runId), host, sender);
        assertBuiltinIdentity(run.builtinIdentity,environment);
        assertBuiltinIdentity(run.revision?.builtinIdentity,environment);
        return {run, duplicate: true};
      }
      if(preparation){
        invariant(preparation.state==='prepared'&&!preparation.runId,CANCELLED_CODE);
        invariant(now()<preparation.expiresAt&&preparation.browserSessionIncarnation===session,CONTROLLER_TIMEOUT_ERROR);
        checkFence({target:preparation.observedTarget,selection:preparation.target,nativeFence:preparation.nativeFence,
          startUrl:preparation.target.mode==='owned'?preparation.target.url:null});
        if(preparation.target.mode==='borrowed')invariant(same(observed,preparation.observedTarget),DOC_REPLACED);
        if(preparation.pageRequestId){
          const original=await assertPageRequestInTransaction(transaction,preparation.pageRequestId,namespace(host),{submission:true});
          invariant(pageRequest&&original.requestId===pageRequest.requestId&&original.preparationId===preparation.preparationId&&
            same(original.task,preparation.task)&&same(original.params,preparation.params)&&same(original.target,preparation.target)&&
            request.requestId===preparation.preparationId,'E_OWNER');
        }
      }
      await assertPreparationSlot(transaction,namespace(host),request.taskPreparationId);
      if(delegationStepKey)invariant(step.state==='prepared'&&!step.cancelled&&
        step.admissionCount===0&&step.maxAdmissions===1,CANCELLED_CODE,
        'Step is cancelled or already committed');
      // A retained target is usable by at most one new Run. The original
      // immutable owned/document identity is checked and consumed atomically
      // with admission; lost acknowledgements cannot create a second sender.
      let continuationKey=null,previousForContinuation=null;
      if(Object.hasOwn(request,'retainedFrom')){
        const previous=await transaction.get(RUN_STORE,request.retainedFrom.runId);
        assertRetainedControllerContinuation({previous,retainedFrom:request.retainedFrom,
          selection:request.target,observed,installedTask,current:saved,host,session});
        continuationKey=retainedContinuationKey(request.retainedFrom.runId);
        invariant(!previous.retainedContinuation,EFFECT_UNKNOWN,
          'Retained source Run has already consumed its continuation');
        invariant(!await transaction.get(COMMAND_JOURNAL,continuationKey),EFFECT_UNKNOWN,
          'Retained document already continued; inspect the original Run');
        previousForContinuation=previous;
      }
      const slot = await transaction.get(RUN_STORE, '@slot');
      invariant(!slot?.currentRunId&&!slot?.preview, CONTROLLER_OWNER_ERROR, 'Previous target or preview still active');
      const runId = newId(), scriptId = isAppController?`app-controller:${variant.appId}`:isDraft ? `draft:${runId}` : saved.scriptId;
      const run = {tag: CONTROLLER_RUN_TAG, runId, namespace: namespace(host), principal: host.principal,
        registrationId: host.registrationId, hostDocumentId: host.hostDocumentId, hostInstanceId: host.hostInstanceId,
        browserSessionIncarnation: session, scriptId, contentHash: sourceHash, builtinAbi: BUILTIN_ABI, sourceKind: isAppController?'app-controller':isDraft ? 'draft' : 'saved',
        builtinIdentity:environment,
        ...(frozenSource ? {draftSourceUtf8} : {}),
        ...(installedTask?{installedTaskAuthorization:{taskId:installedTask.installation.taskId,
          version:installedTask.installation.version,manifestHash:installedTask.installation.manifestHash,
          authorization:installedTask.installation.authorization},
          ...(installedTask.candidate.package.manifest.targetDisposition?
            {targetDisposition:installedTask.candidate.package.manifest.targetDisposition}:{})}:{}),
        ...(runDelegation?{taskDelegation:structuredClone(runDelegation)}:{}),
        ...(request.taskDelegationStep?{taskDelegationStep:structuredClone(request.taskDelegationStep)}:{}),
        ...(request.retainedFrom?{retainedFrom:structuredClone(request.retainedFrom)}:{}),
        ...(preparation?{taskPreparationId:preparation.preparationId}:{}),
        ...(pageRequest?{pageRequestId:pageRequest.requestId,pageTaskSource:structuredClone(pageRequest.pageSource),
          pageTaskSourceFence:structuredClone(pageRequest.sourceFence)}:{}),
        ...(scheduledFire?{scheduledFireId:scheduledFire.fireId}:{}),
        opId: newId(), resultId: newId(), requestId: request.requestId, requestDigest, deadlineAt: request.deadlineAt,
        paramsWire: structuredClone(executionParamsWire), selection: structuredClone(request.target),
        startUrl: request.target.mode === 'owned' ? httpUrl(request.target.url).href : null,
        nativeFence: capturedFence, nativeNetworkFences, networkOrigins, nativeTabId: request.target.tabId ?? null,
        state: 'preparing', ownerEpoch: 1, runRevision: 1, eventSeq: 0, cancelSeq: 0, workerRetired: false,
        retirementState: 'not-started', target: null, identity: null, revision: null, createdAt: now()};
      if(request.cloudRequestId) await cloud.bind(transaction,run,request,host);
      await transaction.put(RUN_STORE, run, runId);
      await lease(transaction, run);
      let pinned;
      if (frozenSource) {
        // Draft bytes live only on this authoritative run; never create an
        // apparent saved script head, revision or long-lived revision pin.
        invariant(await digestUtf8(run.draftSourceUtf8) === sourceHash, 'E_HASH', 'Draft source changed at admission');
        run.revision = {kind: isAppController?'app-controller':'draft', scriptId: run.scriptId, revision: 1, sourceHash,builtinIdentity:environment};
      } else {
        pinned = await storage.pinScriptRevision(scriptContext(host, sender, run), saved, transaction);
        assertBuiltinIdentity(pinned.revision.builtinIdentity,environment);
        run.revision = {scriptId: run.scriptId, revision: pinned.revision.revision,builtinIdentity:environment,
          sourceHash: pinned.revision.contentHash, pinKey: pinned.pinKey};
      }
      await transaction.put(RUN_STORE, run, runId);
      if(previousForContinuation)await transaction.put(RUN_STORE,{
        ...previousForContinuation,
        retainedContinuation:{runId,requestId:run.requestId,consumedAt:now()},
        runRevision:previousForContinuation.runRevision+1},previousForContinuation.runId);
      await transaction.put(RUN_STORE, {tag: 'slot', currentRunId: runId, state: 'held', releaseCount: 0, fencedEpoch: 1, retirementId: null}, '@slot');
      await transaction.put(COMMAND_JOURNAL, {tag: 'controller-start', runId, requestDigest}, admissionKey);
      if(continuationKey)await transaction.put(COMMAND_JOURNAL,{
        tag:'controller-retained-continuation',fromRunId:request.retainedFrom.runId,
        fromRequestId:request.retainedFrom.requestId,runId,requestId:run.requestId,
        requestDigest,consumed:true,createdAt:now()},continuationKey);
      if(delegationStepKey)await transaction.put(COMMAND_JOURNAL,
        {...step,state:'submitted',runId,resultId:run.resultId,ownerEpoch:run.ownerEpoch,
          admissionCount:1,submittedAt:now()},delegationStepKey);
      if(preparation)await transaction.put(COMMAND_JOURNAL,{...preparation,state:'submitted',runId,
        resultId:run.resultId,submittedAt:now()},preparationKey(namespace(host),preparation.preparationId));
      if(scheduledFire)await scheduled.bind(transaction,scheduledFire,run);
      return {run, pinned, duplicate: false};
    }, frozenSource ? stores : [...stores, 'scriptHeads', 'scriptRevisions', ...(isInstalledTask?['frameworkKV']:[])]);
    const run = admitted.run;
    if (admitted.duplicate) return {runId: run.runId, state: run.state, duplicate: true, runRevision: run.runRevision};
    try {
      const pinned = admitted.pinned;
      if(run.cloudRequestId){await cloud.permit(run);await cloud.start(run);}
      if (!observed) observed = await createOwned(run, host, sender);
      await verifyControllerTarget({api, target: observed, expectedUrl: request.target.expectedUrl, expectedWindowId:request.target.expectedWindowId});
      return await tx(RUN_WRITE, async transaction => {
        const current = await owner(transaction, await transaction.get(RUN_STORE, run.runId), host, sender, {active: true});
        assertCandidate();
        current.target = {...observed, targetSessionId: newId(), targetVersion: 1, mode: request.target.mode, browserSessionIncarnation: session};
        current.identity = {tag: CONTROLLER_RUN_TAG, runId: current.runId, hostInstanceId: host.hostInstanceId, hostDocumentId: host.hostDocumentId,
          ownerEpoch: current.ownerEpoch, scriptId: current.scriptId, revision: current.revision.revision, contentHash: current.contentHash, target: current.target};
        if (frozenSource) invariant(await digestUtf8(current.draftSourceUtf8) === current.revision.sourceHash,
          'E_HASH', 'Admitted draft bytes do not match their SHA-256');
        current.state = 'running'; current.runRevision++; current.eventSeq++;
        boundTargets.set(current.runId, current.target);
        creatingTabs.delete(current.runId);
        await transaction.put(RUN_STORE, current, current.runId);
        await lease(transaction, current);
        assertCandidate();
        return {...project(current), sourceUtf8: frozenSource ? current.draftSourceUtf8 : pinned.revision.sourceUtf8,
          paramsWire: current.paramsWire};
      });
    } catch (error) {
      // No control realm has been created yet. Preserve uncertain creation facts;
      // the host can explicitly retire known targets without guessing absence.
      const settled = await settleInternal(run.runId, 'failed', {error: typed(error)}, {workerRetired: true});
      await retire({...run, ...settled.run}, host, sender);
      error.runId = run.runId; throw error;
    }
  }
  async function admittedOperation(transaction, envelope, host, sender, {post = false, handoff} = {}) {
    const run = await owner(transaction, await transaction.get(RUN_STORE, envelope.identity.runId), host, sender, {active: true});
    invariant(envelope.identity.tag === CONTROLLER_RUN_TAG && same(envelope.identity, {...run.identity, target: envelope.target}) &&
      same(envelope.revision, run.revision), CONTROLLER_OWNER_ERROR, 'Controller operation binding differs');
    invariant(same(envelope.target, run.target), DOC_REPLACED);
    assertTaskCapability(run,envelope.operation);
    if (run.navigationRequestId) invariant(run.navigationRequestId === envelope.requestId, DOC_REPLACED, 'Navigation fenced old operations');
    if (handoff) invariant(post && handoff.from.documentId === run.target.documentId && handoff.to.tabId === run.target.tabId &&
      handoff.to.frameId === run.target.frameId && handoff.to.targetVersion === run.target.targetVersion + 1 &&
      handoff.to.browserSessionIncarnation === session && handoff.to.mode === run.target.mode,
    DOC_REPLACED, 'Native navigation handoff differs');
    return run;
  }
  function assertTaskCapability(run,operation){
    if(run.profile==='app-service'){
      invariant(operation.kind==='browser-sdk'&&APP_SERVICE_OPERATIONS.includes(operation.method),'E_CAPABILITY','App services cannot use Page, Controller or sensitive capabilities');
      return;
    }
    invariant(operation.kind!=='browser-sdk','E_CAPABILITY','Browser app operations require an installed app-service');
    // Only an installed, enabled, immutable Task with explicit media.read may
    // use one user-reviewed assetId bound to its admitted params.
    if(operation.kind==='browser'&&operation.method==='uploadFromAsset'){
      invariant(run.installedTaskAuthorization?.authorization?.scope?.capabilities?.includes('media.read') &&
        run.sourceKind==='saved','E_CAPABILITY','该安装任务未获素材读取权限');
      return;
    }
    if(run.sourceKind==='app-controller'){
      invariant(operation.kind!=='service'&&!(operation.kind==='browser'&&
        ['cookies','setCookie','deleteCookie','uploadFromUrl'].includes(operation.method)),'E_CAPABILITY',
        'App Controller only grants page.automation');
      return;
    }
    if(!run.installedTaskAuthorization)return;
    // Only the installed, hash-covered grant can authorize Task services.
    if(operation.kind==='service'){
      const capability=['AXIOS_GET','AXIOS_POST','AXIOS_PUT','AXIOS_DELETE'].includes(operation.method)
        ? 'network'
        : ['APPSTORAGE_GETITEM','APPSTORAGE_SETITEM','APPSTORAGE_REMOVEITEM','APPSTORAGE_CLEAR'].includes(operation.method)
          ? 'storage.persistent' : null;
      invariant(capability && run.installedTaskAuthorization.authorization?.scope?.capabilities?.includes(capability),
        'E_CAPABILITY','此安装任务未声明对应的网络或持久存储能力');
      return;
    }
    invariant(!(operation.kind==='browser'&&
      ['cookies','setCookie','deleteCookie','uploadFromUrl'].includes(operation.method)),
      'E_CAPABILITY','此安装任务未声明宿主网络或 Cookie 能力');
  }
  async function controllerOperation(request,sender){
    const runId=request?.envelope?.identity?.runId;
    id(runId);
    const host=await assertHost(sender);
    const run=await tx(RUN_READ,async transaction=>owner(transaction,await transaction.get(RUN_STORE,runId),host,sender));
    return withTaskDelegation(run.taskDelegation,lockedDelegation=>controllerOperationDelegated(request,sender,lockedDelegation));
  }
  async function controllerOperationDelegated(request, sender, lockedDelegation) {
    fields(request, ['envelope'], ['envelope']);
    const envelope = structuredClone(request.envelope);
    fields(envelope, ['requestId', 'identity', 'revision', 'target', 'operation'], ['requestId', 'identity', 'revision', 'target', 'operation']);
    id(envelope.requestId);
    invariant(envelope.identity?.tag === CONTROLLER_RUN_TAG, CONTROLLER_OWNER_ERROR);
    id(envelope.identity.runId);
    fields(envelope.operation, ['kind', 'method', 'args'], ['kind', 'method', 'args']);
    invariant(Array.isArray(decodeControlValue(envelope.operation.args, {maxBytes: envelope.operation.method === 'uploadChunk' ? 131072 : 65536})), CONTROLLER_SCHEMA_ERROR);
    const serviceCall = envelope.operation.kind === 'service',appCall=envelope.operation.kind==='browser-sdk';
    let serviceArgs;
    if(appCall){
      const args=decodeControlValue(envelope.operation.args);
      invariant(APP_SERVICE_OPERATIONS.includes(envelope.operation.method)&&args.length===1,'E_CAPABILITY');
      serviceArgs=normalizeBrowserOperation(envelope.operation.method,args[0]);
    }
    if (serviceCall) {
      const method = envelope.operation.method, args = decodeControlValue(envelope.operation.args);
      invariant(Object.hasOwn(SDK_METHODS, method) && /^(AXIOS_|APPSTORAGE_|APPLOCAL_|CHROME_LOCAL_)/.test(method), 'E_CAPABILITY');
      invariant(args.length === 1, CONTROLLER_SCHEMA_ERROR); serviceArgs = normalizeMethod(method, args[0]);
    }
    const host = await assertHost(sender), key = opKey(envelope.identity.runId, envelope.requestId), requestDigest = await digest(envelope, wireCanonicalOptions);
    const {previous, run: priorRun} = await tx(RUN_READ, async transaction => {
      const run = await owner(transaction, await transaction.get(RUN_STORE, envelope.identity.runId), host, sender);
      const value = await transaction.get(COMMAND_JOURNAL, key);
      if (value) invariant(value.requestDigest === requestDigest, REQUEST_CONFLICT);
      return {previous:value, run};
    });
    assertTaskCapability(priorRun,envelope.operation);
    if(serviceArgs?.config?.transport==='native-http' && priorRun.installedTaskAuthorization)
      invariant(priorRun.installedTaskAuthorization.authorization?.scope?.capabilities?.includes('network.localRelay'),
        'E_CAPABILITY','This installed Task has not approved network.localRelay');
    if(priorRun.profile==='app-service')await assertAppServiceBinding(api,priorRun.appBinding);
    if (serviceCall && previous?.state === 'durable' && !previous.reply && Object.hasOwn(previous,'valueWire')) {
      previous.reply = {requestId:envelope.requestId,value:encodeControlValue(decodeValue(previous.valueWire))};
    }
    if (previous?.reply) {
      const target = previous.reply.handoff?.to || envelope.target;
      await requireRunGrants(priorRun,lockedDelegation);
      if(priorRun.profile!=='app-service')await verifyControllerTarget({api, target});
      await tx(RUN_READ, async transaction => {
        const run = await owner(transaction, await transaction.get(RUN_STORE, envelope.identity.runId), host, sender, {active: true});
        assertTaskCapability(run,envelope.operation);
        invariant(same(envelope.identity, {...run.identity, target: envelope.target}) && same(envelope.revision, run.revision), CONTROLLER_OWNER_ERROR);
        invariant(same(target, run.target) && !run.navigationRequestId, DOC_REPLACED);
      });
      return previous.reply;
    }
    if (pending.has(key)) return pending.get(key);
    if (previous) throw new FoundationError(EFFECT_UNKNOWN, 'Cannot replay a dispatched operation');
    const completion = perform(); pending.set(key, completion);
    try { return await completion; } finally { if (pending.get(key) === completion) pending.delete(key); }
    async function perform() {
      const navigation = isControllerNavigation(envelope.operation);
      // A trusted Dev Run may request any HTTP(S) Origin through axiosx, but the
      // browser grant must exist before it becomes this run's durable exact scope.
      const autoOrigin = serviceCall && priorRun.sourceKind === 'draft' &&
        /^AXIOS_(GET|POST|PUT|DELETE)$/.test(envelope.operation.method)
        ? httpUrl(serviceArgs.url).origin : null;
      if (autoOrigin && autoOrigin !== envelope.target.allowedOrigin &&
          !(priorRun.networkOrigins || []).includes(autoOrigin)) await requireGrant(api, autoOrigin);
      const run = await tx(RUN_WRITE, async transaction => {
        const current = await admittedOperation(transaction, envelope, host, sender);
        invariant(!await transaction.get(COMMAND_JOURNAL, key), EFFECT_UNKNOWN);
        if (autoOrigin && autoOrigin !== current.target.allowedOrigin &&
            !current.networkOrigins.includes(autoOrigin)) {
          invariant(current.sourceKind === 'draft', CONTROLLER_PERMISSION_ERROR);
          invariant(current.networkOrigins.length < 32, 'E_LIMIT',
            '本次开发草稿已访问 32 个额外 Origin，请结束后重新运行');
          current.networkOrigins.push(autoOrigin);
          current.nativeNetworkFences.push({origin:autoOrigin,
            permissionEpoch:nativeFence(current.target.tabId ?? current.nativeTabId, autoOrigin).permissionEpoch});
          await transaction.put(RUN_STORE, current, current.runId);
        }
        if (navigation) {
          invariant(!current.navigationRequestId, DOC_REPLACED);
          current.navigationRequestId = envelope.requestId;
          await transaction.put(RUN_STORE, current, current.runId);
        }
        await transaction.put(COMMAND_JOURNAL, {tag: navigation ? 'controller-navigation' : 'controller-operation', runId: current.runId,
          ...(serviceCall||appCall ? {lifecycle:'controller',namespace:current.namespace,principal:current.principal,grantIncarnation:current.registrationId,
            browserSessionIncarnation:session,opId:key,requestId:envelope.requestId,resultId:`${key}:result`,method:envelope.operation.method} : {}),
          requestDigest, envelope, state: 'dispatched', submissionCount: 1, dispatchAt: now()}, key);
        return current;
      });
      if (navigation) navigating.set(run.runId, envelope.requestId);
      const abort = new AbortController(); cancellations.set(key, {runId: run.runId, abort});
      let appDispatched=false,cloudEffectsAuthorized=0,cloudDeniedBeforeDispatch=false;
      const authorizeOperation = async (captured, details = {}) => {
        invariant(same(captured, envelope), CONTROLLER_OWNER_ERROR);
        if(run.profile==='app-service'){
          await assertAppServiceBinding(api,run.appBinding);
          return tx(RUN_READ,transaction=>admittedOperation(transaction,envelope,host,sender));
        }
        if (details.url !== undefined) {
          assertControllerNetworkTarget({url:details.url,
            sourceOrigin:envelope.target.allowedOrigin, additionalOrigins:run.networkOrigins || [],
            serviceCall, method:envelope.operation.method, capability:details.capability});
        }
        await requireRunGrants(run,lockedDelegation);
        if (details.handoff) await verifyControllerTarget({api, target: details.handoff.to});
        else if (details.navigationPending) {
          invariant(navigation, CONTROLLER_OWNER_ERROR, 'Only the original navigation may cross documents');
          const observed = await observeControllerTarget({api, tabId: envelope.target.tabId, frameId: envelope.target.frameId});
          invariant(observed.allowedOrigin === envelope.target.allowedOrigin, CONTROLLER_PERMISSION_ERROR);
        } else await verifyControllerTarget({api, target: envelope.target});
        return tx(RUN_READ, transaction => admittedOperation(transaction, envelope, host, sender,
          {post: details.phase === 'post', handoff: details.handoff}));
      };
      const withLocatorWrite = async (identity, effect) => {
        const writeKey = identity.runId;
        invariant(!locatorWriters.has(writeKey), 'E_WRITE_CONFLICT');
        locatorWriters.add(writeKey);
        try { return await effect(); } finally { locatorWriters.delete(writeKey); }
      };
      const beforeEffect=async(captured,details)=>{
        invariant(same(captured,envelope),CONTROLLER_OWNER_ERROR);
        if(!run.cloudRequestId)return;
        try{
          const expected={requestId:envelope.requestId,requestDigest,effectId:details.effectId,kind:details.kind};
          const proof=await cloud.controlFence(run,expected);
          await authorizeOperation(envelope,{phase:'pre',...details});
          const ready=await tx(RUN_WRITE,async transaction=>{
            const current=await admittedOperation(transaction,envelope,host,sender);
            const operation=await transaction.get(COMMAND_JOURNAL,key);
            invariant(operation?.requestDigest===requestDigest&&operation.state==='dispatched',REQUEST_CONFLICT);
            const assertReady=await consumeCloudFence(transaction,current,operation,proof,expected);
            await transaction.put(COMMAND_JOURNAL,operation,key);
            return assertReady;
          });
          return submit=>{
            try{ready?.();const dispatched=submit();cloudEffectsAuthorized++;return dispatched;}
            catch(error){if(cloudEffectsAuthorized===0)cloudDeniedBeforeDispatch=true;throw error;}
          };
        }catch(error){
          // This trusted callback has not returned to the driver's dispatch.
          // Only the first submission window can prove the whole op had no effect.
          if(cloudEffectsAuthorized===0)cloudDeniedBeforeDispatch=true;
          throw error;
        }
      };
      const driver = createControllerDriver({api, clock, authorize:authorizeOperation, beforeEffect,
        withWrite:withLocatorWrite,
        readMediaAsset: async (assetId, captured) => {
          invariant(same(captured,envelope),'E_OWNER');
          // The package manifest, installed incarnation and current run state
          // were already checked before dispatch; repeat at the actual read.
          invariant(typeof readMediaAsset==='function','E_CAPABILITY_UNAVAILABLE');
          invariant(run.installedTaskAuthorization?.authorization?.scope?.capabilities?.includes('media.read') &&
            decodeValue(run.paramsWire)?.assetId===assetId,'E_MEDIA_SCOPE',
            '素材必须与已批准的运行参数一致');
          await authorizeOperation(envelope,{phase:'pre'});
          return readMediaAsset(assetId);
        }});
      const recordReceipt = async receipt => tx(RUN_WRITE, async transaction => {
        const operation = await transaction.get(COMMAND_JOURNAL, key);
        invariant(operation?.requestDigest === requestDigest, REQUEST_CONFLICT);
        // An explicitly rejected Locator commit closes all earlier intents.
        if (receipt.stage === 'locator.commitNoEffect') {
          operation.locatorNoEffectCount = (operation.locatorNoEffectCount || 0) + 1;
          operation.nativeReceipts = (operation.nativeReceipts || []).filter(row =>
            row.stage !== 'locator.commitIntent' && row.stage !== 'locator.commitNoEffect');
        }
        (operation.nativeReceipts ||= []).push(structuredClone(receipt));
        await transaction.put(COMMAND_JOURNAL, operation, key);
      }, [COMMAND_JOURNAL]);
      const recordServiceEffect = async value => {
        const valueWire = encodeValue(value), reply = {requestId:envelope.requestId,value:encodeControlValue(value)};
        await tx(RUN_WRITE, async transaction => {
          const operation = await transaction.get(COMMAND_JOURNAL, key);
          invariant(operation?.requestDigest === requestDigest, REQUEST_CONFLICT);
          await transaction.put('results',{...Object.fromEntries(pinBindingFields.map(field=>[field,operation[field]])),
            tag:'controller-service-result',opKey:key,requestDigest,state:'durable',valueWire,committedAt:now()},operation.resultId);
          operation.state='durable'; operation.valueWire=valueWire; operation.reply=reply; operation.receiptAt=now();
          await transaction.put(COMMAND_JOURNAL,operation,key);
        });
        return reply;
      };
      async function executeService() {
        const context = {lifecycle:'controller',namespace:run.namespace,principal:run.principal,grantIncarnation:run.registrationId,
          taskId:run.installedTaskAuthorization?.taskId??run.scriptId,
          revision:run.revision.revision,sourceHash:run.revision.sourceHash,
          installation:run.installedTaskAuthorization?{version:run.installedTaskAuthorization.version,
            manifestHash:run.installedTaskAuthorization.manifestHash,
            installationId:run.installedTaskAuthorization.authorization.installationId,
            generation:run.installedTaskAuthorization.authorization.generation}:null,
          taskDelegation:run.taskDelegation??null,
          browserSessionIncarnation:session,runId:run.runId,opId:key,requestId:envelope.requestId,resultId:`${key}:result`,
          opKey:key,method:envelope.operation.method,requestDigest,deadlineAt:run.deadlineAt,signal:abort.signal,
          authorize:details=>authorizeOperation(envelope,details),
          authorizeInTransaction:transaction=>admittedOperation(transaction,envelope,host,sender),
          assertDispatch(){checkFence(run);invariant(!abort.signal.aborted && now()<run.deadlineAt,CANCELLED_CODE);},
          recordNativeReceipt:recordReceipt,recordEffect:recordServiceEffect};
        const httpMethod = {AXIOS_GET:'GET',AXIOS_POST:'POST',AXIOS_PUT:'PUT',AXIOS_DELETE:'DELETE'}[context.method];
        const value = httpMethod
          ? await createNetworkService({clock,isolatedTransport,nativeTransport,authorize:(details,ctx)=>ctx.authorize(details)}).request({method:httpMethod,...serviceArgs},context)
          : await storage.executeSdk(context.method,serviceArgs,context);
        return {requestId:envelope.requestId,value:encodeControlValue(value)};
      }
      try {
        let reply;
        if(appCall){
          invariant(typeof globalThis.__opendeskBrowserAppService==='function','E_SERVICE_UNSUPPORTED');
          const value=await globalThis.__opendeskBrowserAppService({operation:envelope.operation.method,args:serviceArgs,binding:run.appBinding,
            authorize:()=>authorizeOperation(envelope),onDispatch:()=>{appDispatched=true;},recordEffect:recordServiceEffect});
          await recordServiceEffect(value);
          reply={requestId:envelope.requestId,value:encodeControlValue(value)};
        }else reply = serviceCall ? await executeService() : await driver.execute(envelope, {signal:abort.signal,deadlineAt:run.deadlineAt,recordReceipt});
        invariant(reply?.requestId === envelope.requestId, 'E_RESULT_FORMAT');
        const valueWire = reply.error ? undefined : encodeValue(decodeControlValue(reply.value));
        // Record observed native effect before checking delivery permission.
        // Cancellation cannot erase the receipt or make this request replayable.
        await tx(RUN_WRITE, async transaction => {
          const operation = await transaction.get(COMMAND_JOURNAL, key);
          invariant(operation?.requestDigest === requestDigest && operation.submissionCount === 1, REQUEST_CONFLICT);
          if(reply.error){
            const kind=envelope.operation.kind;
            const cookiePreflight=kind==='browser'&&COOKIE_PREFLIGHT_METHODS.includes(envelope.operation.method);
            const stage=kind==='user-script'?'userScripts.finalFailure':kind==='packaged'?'packaged.finalFailure':cookiePreflight?'cookies.preflightFailure':undefined;
            const failure=stage&&operation.nativeReceipts?.find(receipt=>receipt.stage===stage&&receipt.requestId===envelope.requestId);
            invariant(failure?.receipt?.frameId===envelope.target.frameId&&failure.receipt.documentId===envelope.target.documentId&&
              same(failure.receipt.error,reply.error)&&(kind!=='packaged'||(failure.receipt.runId===envelope.identity.runId&&
                failure.receipt.ownerEpoch===envelope.identity.ownerEpoch)),'E_RESULT_FORMAT',
            'Unverified target completion receipt');
            if(cookiePreflight) {
              const receipts=operation.nativeReceipts,results=receipts.filter(receipt=>receipt.stage==='result');
              invariant(receipts.filter(receipt=>receipt.stage===stage).length===1&&
                failure.receipt.phase==='input-preflight'&&failure.receipt.method===envelope.operation.method&&
                failure.receipt.runId===envelope.identity.runId&&failure.receipt.ownerEpoch===envelope.identity.ownerEpoch&&
                COOKIE_PREFLIGHT_CODES.includes(reply.error.code)&&results.length===1&&
                results[0].requestId===envelope.requestId&&same(results[0].receipt,reply)&&
                receipts.every(receipt=>receipt.requestId===envelope.requestId&&['webNavigation.getAllFrames',stage,'result'].includes(receipt.stage)),
                'E_RESULT_FORMAT','Cookie preflight lacks a no-dispatch receipt');
            }
            operation.effectState='failure-observed';operation.failure=structuredClone(reply.error);
          }else operation.valueWire=valueWire;
          operation.state = 'durable'; operation.receiptAt = now(); operation.reply = reply;
          if (reply.handoff) operation.targetTransition = {navigationIntentId: envelope.requestId,
            from: structuredClone(reply.handoff.from), to: structuredClone(reply.handoff.to)};
          await transaction.put(COMMAND_JOURNAL, operation, key);
        });
        if(appCall)await authorizeOperation(envelope,{phase:'post'});
        return await tx(RUN_WRITE, async transaction => {
          const current = await admittedOperation(transaction, envelope, host, sender, {post: true, handoff: reply.handoff});
          if (navigation) {
            if (!reply.error) {
              invariant(reply.handoff, DOC_REPLACED);
              current.target = structuredClone(reply.handoff.to); current.identity.target = current.target;
              boundTargets.set(current.runId, current.target);
            }
            delete current.navigationRequestId; current.runRevision++; current.eventSeq++;
            await transaction.put(RUN_STORE, current, current.runId);
          }
          return reply;
        });
      } catch (error) {
        const failureReply = await tx(RUN_WRITE, async transaction => {
          const operation = await transaction.get(COMMAND_JOURNAL, key);
          if (!operation || operation.state === 'durable') return;
          if(cloudDeniedBeforeDispatch){
            operation.state='failed';operation.effectState='not-dispatched';operation.failure=typed(error);
            operation.deliveryState='fenced';operation.receiptAt=now();
            await transaction.put(COMMAND_JOURNAL,operation,key);return;
          }
          // Only the trusted app Host can signal dispatch. Before that signal,
          // a rejected read or write preflight has no effect to reconcile.
          if (appCall && !appDispatched) {
            operation.state='durable'; operation.effectState='failure-observed'; operation.receiptAt=now();
            operation.failure=typed(error);
            operation.reply={requestId:envelope.requestId,error:operation.failure};
            await transaction.put(COMMAND_JOURNAL,operation,key); return operation.reply;
          }
          if (serviceCall && error.code==='E_HTTP' && operation.nativeReceipts?.some(receipt=>Number.isInteger(receipt.status))) {
            operation.state='durable'; operation.effectState='response-observed'; operation.receiptAt=now();
            operation.reply={requestId:envelope.requestId,error:{...typed(error),cause:{status:error.status,response:error.response}}};
            operation.failure=typed(error); await transaction.put(COMMAND_JOURNAL,operation,key); return operation.reply;
          }
          // Missing a receipt cannot prove a rejected native call had no effect.
          // Only the driver's explicit user-script availability failure, before
          // its execute receipt, is a known lookup failure.
          const failedWithoutEffect = error.code === 'E_USER_SCRIPTS_UNAVAILABLE' &&
            envelope.operation.kind === 'user-script' && !hasNativeEffect(operation);
          // A dispatched Locator commit may have changed the page even when its
          // callback was lost or a stop/timeout won the race. Only an explicit
          // same-document no-effect or confirmed scroll receipt resolves it.
          const lastLocatorCommit = (operation.nativeReceipts || []).filter(receipt =>
            ['locator.commitIntent', 'locator.commitNoEffect', 'locator.scrollCommitted'].includes(receipt.stage)).at(-1);
          const uncertainAction = envelope.operation.kind === 'packaged' &&
            envelope.operation.method === 'locatorAction' && lastLocatorCommit?.stage === 'locator.commitIntent';
          operation.state = uncertainAction || appCall&&appDispatched ? 'effect_unknown' :
            error.code === CANCELLED_CODE || error.code === CONTROLLER_TIMEOUT_ERROR ? 'cancelled' :
            failedWithoutEffect ? 'failed' : 'effect_unknown';
          operation.failure = typed(error); operation.deliveryState = 'fenced';
          await transaction.put(COMMAND_JOURNAL, operation, key);
          const current = await transaction.get(RUN_STORE, run.runId);
          if (current?.navigationRequestId === envelope.requestId) delete current.navigationRequestId;
          if (current && live.has(current.state) && !current.cancelSeq && operation.state === 'effect_unknown') {
            current.state = 'paused_unknown'; current.terminalReason = typed(error); current.runRevision++;
          }
          if (current) { await transaction.put(RUN_STORE, current, current.runId); await lease(transaction, current); }
        });
        if (failureReply) {
          // First delivery uses the saved error, behind the same native and
          // durable owner/permission/deadline fences as any service response.
          await authorizeOperation(envelope, {phase:'post'});
          return failureReply;
        }
        throw error;
      } finally { cancellations.delete(key); if (navigation) navigating.delete(run.runId); }
    }
  }
  function abortOperations(runId, code) {
    for (const value of cancellations.values()) if (value.runId === runId) value.abort.abort(new FoundationError(code, code));
  }
  async function stopControllerRun(request, sender) {
    return stopControllerRunInternal(request,sender);
  }
  async function stopControllerRunInternal(request, sender, preparation) {
    fields(request, ['runId', 'requestId', 'expectedRunRevision', 'reason'], ['runId', 'requestId']); id(request.runId); id(request.requestId);
    const host = await assertHost(sender), key = `controller-stop:${canonical([request.runId, request.requestId])}`;
    const answer = await tx(RUN_WRITE, async transaction => {
      let run=await transaction.get(RUN_STORE,request.runId);
      if(preparation){
        await currentHost(transaction,host,sender);
        invariant(run?.tag===CONTROLLER_RUN_TAG&&run.namespace===namespace(host)&&
          run.taskPreparationId===preparation.preparationId&&run.resultId===preparation.resultId,CONTROLLER_OWNER_ERROR);
      }else run=await owner(transaction,run,host,sender);
      const old = await transaction.get(COMMAND_JOURNAL, key);
      if (old) { invariant(old.requestDigest === canonical(request), REQUEST_CONFLICT); return old.response; }
      if (!run.cancelSeq && !terminals.has(run.state) && !run.retirementId) {
        invariant(request.expectedRunRevision === undefined || request.expectedRunRevision === run.runRevision, 'E_REVISION');
        run.cancelSeq++; run.ownerEpoch++; run.runRevision++; run.eventSeq++; run.state = 'stopping';
        run.terminalReason = request.reason || CANCELLED_CODE; await transaction.put(RUN_STORE, run, run.runId); await lease(transaction, run);
      }
      const response = {runId: run.runId, state: run.state, cancelSeq: run.cancelSeq, runRevision: run.runRevision};
      await transaction.put(COMMAND_JOURNAL, {tag: 'controller-stop', requestDigest: canonical(request), response}, key);
      return response;
    });
    abortOperations(request.runId, request.reason === CONTROLLER_TIMEOUT_ERROR ? CONTROLLER_TIMEOUT_ERROR : CANCELLED_CODE);
    const run = await tx(RUN_READ, transaction => transaction.get(RUN_STORE, request.runId), [RUN_STORE]);
    await emitToHost(run.registrationId,{type:'controller-fenced',runId:run.runId,reasonCode:run.terminalReason}).catch(()=>{});
    await createControllerDriver({api, clock, authorize: async () => true}).cancel(run).catch(() => {});
    return answer;
  }
  async function settleInternal(runId, status, outcome, {workerRetired = false, host, sender, requestId, requestDigest} = {}) {
    return tx(RUN_WRITE, async transaction => {
      const run = await transaction.get(RUN_STORE, runId);
      invariant(run?.tag === CONTROLLER_RUN_TAG, CONTROLLER_OWNER_ERROR);
      if (host) await owner(transaction, run, host, sender);
      if (requestId) {
        const key = `controller-finish:${canonical([runId, requestId])}`, previous = await transaction.get(COMMAND_JOURNAL, key);
        if (previous) invariant(previous.requestDigest === requestDigest, REQUEST_CONFLICT);
        else await transaction.put(COMMAND_JOURNAL, {tag: 'controller-finish', runId, requestDigest}, key);
      }
      const old = await transaction.get('results', run.resultId);
      if (old) {
        if (old.state === 'completed' && status === 'completed') invariant(same(old.outcome.valueWire, outcome.valueWire),
          REQUEST_CONFLICT, 'Terminal value is immutable');
        if (workerRetired && !run.workerRetired) { run.workerRetired = true; await transaction.put(RUN_STORE, run, runId); await lease(transaction, run); }
        return {run: project(run), result: old};
      }
      const terminal = run.cancelSeq ? (run.terminalReason === 'E_HOST_CLOSED' ? 'interrupted' : 'stopped') : status;
      invariant(terminals.has(terminal), CONTROLLER_SCHEMA_ERROR);
      const expired = now() >= run.deadlineAt;
      const state = expired && terminal === 'completed' ? 'stopped' : terminal;
      const result = {tag: 'controller-result', resultId: run.resultId, runId, namespace: run.namespace, principal: run.principal,
        revision: run.revision, builtinIdentity:run.builtinIdentity, sourceKind: run.sourceKind, state, outcome: state === 'completed' ? {ok: true, valueWire: outcome.valueWire} :
          {ok: false, error: run.cancelSeq || expired ? typed(new FoundationError(expired ? CONTROLLER_TIMEOUT_ERROR : run.terminalReason || CANCELLED_CODE, 'Controller fenced')) : outcome.error},
        committedAt: now()};
      if (result.outcome.ok) decodeValue(result.outcome.valueWire);
      if (state === 'completed') invariant(!(await transaction.all(COMMAND_JOURNAL)).some(value => value.runId === runId &&
        ['controller-operation', 'controller-navigation'].includes(value.tag) && ['dispatched', 'effect_unknown'].includes(value.state)),
      EFFECT_UNKNOWN, 'Unsettled effects prevent success');
      run.state = state; run.cancelSeq++; run.ownerEpoch++; run.runRevision++; run.eventSeq++;
      run.workerRetired = workerRetired; run.retirementId = newId(); run.retirementState = 'fenced';
      run.terminalReason = result.outcome.ok ? null : result.outcome.error;
      await transaction.put('results', result, run.resultId); await transaction.put(RUN_STORE, run, runId);
      await lease(transaction, run);
      const slot = await transaction.get(RUN_STORE, '@slot');
      invariant(slot?.currentRunId === runId, CONTROLLER_OWNER_ERROR);
      slot.retirementId = run.retirementId; slot.fencedEpoch = run.ownerEpoch;
      await transaction.put(RUN_STORE, slot, '@slot');
      return {run: project(run), result};
    });
  }
  async function finishControllerRun(request, sender) {
    fields(request, ['runId', 'requestId', 'status', 'valueWire', 'error', 'workerRetired'], ['runId', 'requestId', 'status', 'workerRetired']);
    id(request.runId); id(request.requestId);
    invariant(['succeeded', 'error', 'stopped', 'timeout', 'host-closed'].includes(request.status) && typeof request.workerRetired === 'boolean', CONTROLLER_SCHEMA_ERROR);
    if (request.status === 'succeeded') decodeValue(request.valueWire);
    const host = await assertHost(sender);
    const run=await tx(RUN_READ, async transaction => owner(transaction, await transaction.get(RUN_STORE, request.runId), host, sender));
    if(run.profile==='app-service'){
      const locks=globalThis.navigator?.locks;invariant(locks?.request,'E_TOOL_LOCK');
      return locks.request('opendesk.sidebar-tools:tool:'+run.appBinding.appId,()=>locks.request('opendesk.sidebar-tools:catalog',async()=>{
        if(request.status==='succeeded'){
          try{await assertAppServiceBinding(api,run.appBinding);}
          catch(error){request={...request,status:'error',error:typed(error)};delete request.valueWire;}
        }
        return finishControllerSettlement(request,sender,host);
      }));
    }
    return finishControllerSettlement(request,sender,host);
  }
  async function finishControllerSettlement(request,sender,host){
    const state = request.status === 'succeeded' ? 'completed' : request.status === 'error' ? 'failed' : request.status === 'host-closed' ? 'interrupted' : 'stopped';
    const answer = await settleInternal(request.runId, state, request.status === 'succeeded' ? {valueWire: request.valueWire} :
      {error: request.error || typed(new FoundationError(request.status === 'timeout' ? CONTROLLER_TIMEOUT_ERROR : CANCELLED_CODE, request.status))},
      {...request, host, sender, requestDigest: await digest(request, wireCanonicalOptions)});
    abortOperations(request.runId, request.status === 'timeout' ? CONTROLLER_TIMEOUT_ERROR : CANCELLED_CODE);
    if(answer.run.profile==='app-service'&&!answer.result.outcome.ok)return answer;
    // Settlement persists even if permission is lost; delivery is separately authorized.
    const delivery=await snapshotControllerRun({runId:request.runId},sender);
    invariant(delivery.results.some(result=>result.resultId===answer.result.resultId),CONTROLLER_PERMISSION_ERROR,REVOKED_MESSAGE);
    return answer;
  }
  async function retireControllerTarget(request, sender) {
    fields(request, ['runId'], ['runId']); id(request.runId);
    const host = await assertHost(sender);
    const run = await tx(RUN_READ, async transaction => owner(transaction, await transaction.get(RUN_STORE, request.runId), host, sender));
    return retire(run, host, sender);
  }
  async function retire(run, host, sender) {
    if (run.retirementState === 'released') return {state: 'released', releaseCount: 1};
    if (!run.retirementId || !run.workerRetired) return {state: 'pending', releaseCount: 0, reason: 'worker-not-retired'};
    const previousSession = run.browserSessionIncarnation !== session;
    if (!previousSession&&run.profile!=='app-service') await createControllerDriver({api, clock, authorize: async () => true}).cancel(run).catch(() => {});
    let absence = run.profile==='app-service'?'app-worker-retired':'borrowed-not-closed';
    let targetQuarantine = null, transferEvidence = null;
    if (run.selection.mode === 'owned') {
      const intent = await tx(RUN_READ, transaction => transaction.get(COMMAND_JOURNAL, `controller-create:${run.runId}`), [COMMAND_JOURNAL]);
      if(['prepared','not-dispatched'].includes(intent?.state)&&intent.submissionCount===0&&intent.tabId===null){
        absence='not-created-before-dispatch';
      } else if (intent && previousSession) {
        // Session changes also include extension reloads. They revoke old
        // authority, but cannot prove a restored numeric tab belongs to us.
        // Retain that unresolved resource in quarantine instead of closing it.
        // Only the conclusively retired execution realm releases its slot.
        const contexts = await api.runtime?.getContexts?.({}).catch(() => null);
        if (!Array.isArray(contexts) || contexts.some(value => value.documentId === run.hostDocumentId))
          return {state: 'pending', releaseCount: 0, reason: 'host-retirement-unverified'};
        invariant(intent.runId === run.runId && intent.browserSessionIncarnation === run.browserSessionIncarnation,
          CONTROLLER_OWNER_ERROR);
        targetQuarantine = {state: 'quarantined', reason: 'previous-session-ownership-unverified',
          browserSessionIncarnation: run.browserSessionIncarnation, creationId: intent.creationId,
          tabId: intent.tabId ?? null, documentId: run.target?.documentId ?? null,
          hostDocumentId: run.hostDocumentId, observedSession: session, observedAt: now()};
        absence = 'previous-session-execution-retired';
      } else if (intent && controllerMayRetainOwnedTarget(run)) {
        // Immutable installed Task manifest opts into transfer. No page action
        // occurs here: the worker is retired and the verified tab becomes a
        // user's ordinary browser tab. It must not be removed at settlement.
        invariant(intent.runId===run.runId && intent.tabId===run.target.tabId &&
          intent.browserSessionIncarnation===session && intent.state==='created',
          CONTROLLER_OWNER_ERROR,'Retained tab does not belong to the original Controller creation');
        const transferKey=`controller-retirement:${run.retirementId}`;
        let transfer=await tx(RUN_READ,transaction=>transaction.get(COMMAND_JOURNAL,transferKey),[COMMAND_JOURNAL]);
        if(!transfer){
          const observed=await verifyControllerTarget({api,target:run.target});
          const tab=await api.tabs.get(intent.tabId);
          invariant(tab?.id===intent.tabId && !tab.incognito && !tab.pendingUrl &&
            tab.url===observed.url && observed.allowedOrigin===run.target.allowedOrigin &&
            observed.documentId===run.target.documentId,
            'E_DOCUMENT_REPLACED','Retained browser tab changed before transfer');
          transfer=await tx(RUN_WRITE,async transaction=>{
            const current=await transaction.get(RUN_STORE,run.runId);
            invariant(current?.retirementId===run.retirementId && current.state==='completed' &&
              current.workerRetired && current.browserSessionIncarnation===session &&
              current.target?.tabId===intent.tabId && current.target?.documentId===observed.documentId,
              CONTROLLER_OWNER_ERROR,'Transfer is no longer bound to the completed run');
            const existing=await transaction.get(COMMAND_JOURNAL,transferKey);
            if(existing)return existing;
            const proof={tag:'controller-retirement',state:'retained-observed',runId:run.runId,
              retirementId:run.retirementId,tabId:intent.tabId,documentId:observed.documentId,
              url:observed.url,origin:observed.allowedOrigin,observedAt:now()};
            await transaction.put(COMMAND_JOURNAL,proof,transferKey);
            return proof;
          });
        }
        invariant(transfer?.state==='retained-observed' && transfer.runId===run.runId &&
          transfer.retirementId===run.retirementId && transfer.tabId===intent.tabId &&
          transfer.documentId===run.target.documentId && transfer.origin===run.target.allowedOrigin,
          CONTROLLER_OWNER_ERROR,'Retained tab proof is missing or ambiguous');
        absence='owned-transferred-to-user';
        transferEvidence={tabId:transfer.tabId,documentId:transfer.documentId,
          url:transfer.url,origin:transfer.origin,observedAt:transfer.observedAt};
      } else if (intent && !Number.isSafeInteger(intent.tabId))
        return {state: 'pending', releaseCount: 0, reason: 'creation-unknown'};
      else if (intent) {
        // The durable creation callback, same browser incarnation and committed
        // run fence establish ownership; borrowed selections never enter here.
        const call = await tx(RUN_WRITE, async transaction => {
          const current = await transaction.get(RUN_STORE, run.runId);
          invariant(current.retirementId === run.retirementId && current.workerRetired && current.browserSessionIncarnation === session, CONTROLLER_OWNER_ERROR);
          const key = `controller-retirement:${run.retirementId}`, old = await transaction.get(COMMAND_JOURNAL, key);
          if (old) return false;
          await transaction.put(COMMAND_JOURNAL, {tag: 'controller-retirement', runId: run.runId, retirementId: run.retirementId,
            submissionCount: 1, state: 'remove-dispatched', tabId: intent.tabId, dispatchAt: now()}, key);
          return true;
        });
        if (call) try { await api.tabs.remove(intent.tabId); } catch { /* Absence is verified independently. */ }
        try { await api.tabs.get(intent.tabId); return {state: 'pending', releaseCount: 0, reason: 'owned-tab-present'}; }
        catch (error) {
          invariant(/No tab with id|Invalid tab ID|tab not found/i.test(error?.message || ''), 'E_TARGET', 'Query error is not target absence');
        }
        absence = 'owned-tabs.get-not-found';
      } else absence = 'not-created-before-dispatch';
    }
    if (host && run.revision?.pinKey) await storage.releaseScriptRevisionPin(scriptContext(host, sender, run, {retiring: true}),
      {scriptId: run.scriptId, revision: run.revision.revision});
    return tx(RUN_WRITE, async transaction => {
      const current = await transaction.get(RUN_STORE, run.runId), slot = await transaction.get(RUN_STORE, '@slot');
      if (current.retirementState === 'released') return {state: 'released', releaseCount: 1};
      invariant(current.workerRetired && current.retirementId === run.retirementId && slot?.currentRunId === run.runId &&
        slot.retirementId === run.retirementId && slot.releaseCount === 0, CONTROLLER_OWNER_ERROR);
      if (transferEvidence) current.retainedTarget=structuredClone(transferEvidence);
      if (targetQuarantine) {
        invariant(current.cancelSeq > 0 && current.browserSessionIncarnation === targetQuarantine.browserSessionIncarnation &&
          current.browserSessionIncarnation !== session && current.hostDocumentId === targetQuarantine.hostDocumentId,
          CONTROLLER_OWNER_ERROR);
        current.targetQuarantine = targetQuarantine;
      }
      if (host) await owner(transaction, current, host, sender);
      current.retirementState = 'released'; current.runRevision++;
      // Once the Worker is conclusively retired, preserve sourceHash and
      // result identity but do not retain uncommitted draft source bytes.
      if (['draft','app-controller'].includes(current.sourceKind)) delete current.draftSourceUtf8;
      await transaction.put(RUN_STORE, current, current.runId);
      await lease(transaction, current);
      // Host disappearance cannot call a host-authorized revision API. Release
      // only this existing exact pin after realm/target retirement is proven.
      if (!host && current.revision?.pinKey) {
        const pin = await transaction.get(COMMAND_JOURNAL, current.revision.pinKey);
        invariant(pin?.runId === current.runId && pin.opKey === `controller-pin:${current.runId}`, CONTROLLER_OWNER_ERROR);
        await transaction.put(COMMAND_JOURNAL, {...pin, released: true}, current.revision.pinKey);
      }
      await transaction.put(RUN_STORE, {...slot, currentRunId: null, state: 'available', releaseCount: 1}, '@slot');
      boundTargets.delete(current.runId); navigating.delete(current.runId); creatingTabs.delete(current.runId);
      await transaction.put(COMMAND_JOURNAL, {tag: 'controller-retirement', runId: run.runId, retirementId: run.retirementId,
        releaseCount: 1, absence, ...(targetQuarantine ? {targetQuarantine} : {}), releasedAt: now()}, `controller-retirement:${run.retirementId}`);
      return {state: 'released', releaseCount: 1, retirementId: run.retirementId};
    });
  }
  async function loseControllerHost(registrationId, {documentGone = false} = {}) {
      const runs = await tx(RUN_READ, async transaction => (await transaction.all(RUN_STORE)).filter(run => run.tag === CONTROLLER_RUN_TAG &&
      run.registrationId === registrationId && run.retirementState !== 'released'), [RUN_STORE]);
    for (const run of runs) {
      abortOperations(run.runId, 'E_HOST_CLOSED');
      if (documentGone) {
        if (terminals.has(run.state)) {
          const answer = await settleInternal(run.runId, 'interrupted', {}, {workerRetired: true});
          await retire({...run, ...answer.run}, null, null);
          continue;
        }
        await tx(RUN_WRITE, async transaction => {
          const current = await transaction.get(RUN_STORE, run.runId);
          current.cancelSeq++; current.ownerEpoch++; current.terminalReason = 'E_HOST_CLOSED';
          await transaction.put(RUN_STORE, current, current.runId);
          await lease(transaction, current);
        }, [RUN_STORE, COMMAND_JOURNAL]);
        const answer = await settleInternal(run.runId, 'interrupted', {error: typed(new FoundationError('E_HOST_CLOSED', 'Host document is gone'))}, {workerRetired: true});
        if (run.browserSessionIncarnation === session)
          await createControllerDriver({api, clock, authorize: async () => true}).cancel(run).catch(() => {});
        await retire({...run, ...answer.run}, null, null);
      } else await tx(RUN_WRITE, async transaction => {
        const current = await transaction.get(RUN_STORE, run.runId);
        if (!terminals.has(current.state)) { current.state = 'paused_unknown'; current.runRevision++; await transaction.put(RUN_STORE, current, current.runId); await lease(transaction, current); }
      }, [RUN_STORE, COMMAND_JOURNAL]);
    }
  }
  async function invalidatePageTaskSource({tabId,frameId=0,permissionRemoved=false,origins=[]}={}){
    if(!permissionRemoved&&(!Number.isSafeInteger(tabId)||frameId!==0))return [];
    // Same-document SPA events never touch unrelated Controller target epochs.
    if(!permissionRemoved)pageSourceEpochs.set(tabId,(pageSourceEpochs.get(tabId)||0)+1);
    const fenced=await tx(RUN_WRITE,async transaction=>{
      const affected=new Set();
      for(const row of await transaction.all(COMMAND_JOURNAL)){
        if(row.tag!=='page-task-request')continue;
        const matches=permissionRemoved?[row.pageSource.url,row.target.url].some(url=>
          origins.some(pattern=>originMatches(pattern,httpUrl(url).origin))):row.pageSource.tabId===tabId;
        if(!matches)continue;
        if(permissionRemoved)row.authorizationRevoked=true;else row.sourceInvalidated=true;
        await transaction.put(COMMAND_JOURNAL,row,pageRequestKey(row.namespace,row.requestId));affected.add(row.requestId);
      }
      const runs=[];
      for(const run of await transaction.all(RUN_STORE)){
        if(!run.pageRequestId||!affected.has(run.pageRequestId))continue;
        if(permissionRemoved)run.resultDeliveryRevoked=true;
        if(live.has(run.state)){
          run.cancelSeq++;run.ownerEpoch++;run.runRevision++;run.state='stopping';
          run.terminalReason=permissionRemoved?'E_PERMISSION':'E_DOCUMENT_STALE';runs.push(run);await lease(transaction,run);
        }
        await transaction.put(RUN_STORE,run,run.runId);
      }
      return runs;
    },[RUN_STORE,COMMAND_JOURNAL]);
    for(const run of fenced){
      abortOperations(run.runId,run.terminalReason);
      await emitToHost(run.registrationId,{type:'controller-fenced',runId:run.runId,reasonCode:run.terminalReason}).catch(()=>{});
    }
    return fenced.map(project);
  }
  async function invalidateControllerTarget({tabId, frameId = 0, documentId, removed = false, permissionRemoved = false, origins = []} = {}) {
    // Synchronous event fences precede the first IDB await. Re-granting a site
    // cannot revive an operation waiting for that transaction to acquire a lock.
    if (permissionRemoved) {
      invariant(Array.isArray(origins) && origins.every(pattern => typeof pattern === 'string'), CONTROLLER_SCHEMA_ERROR);
      if (!origins.length) return [];
      permissionRemovals.push([...origins]);
    } else if (Number.isSafeInteger(tabId)) {
      const targets = [...boundTargets].filter(([, target]) => target.tabId === tabId && target.frameId === frameId);
      if (removed)
        tabEpochs.set(tabId, (tabEpochs.get(tabId) || 0) + 1);
      else if (!(frameId === 0 && [...creatingTabs.values()].includes(tabId)) && !targets.some(([runId, target]) => navigating.has(runId) || documentId === target.documentId)) {
        const key = canonical([tabId, frameId]); frameEpochs.set(key, (frameEpochs.get(key) || 0) + 1);
      }
    }
    await invalidatePageTaskSource({tabId,frameId,permissionRemoved,origins});
    const runs = await tx(RUN_WRITE, async transaction => {
      const invalidated = [];
      for (const run of await transaction.all(RUN_STORE)) {
        if (run.tag !== CONTROLLER_RUN_TAG) continue;
        if (permissionRemoved) {
          if (!removedRunGrant(run, origins)) continue;
        } else if ((run.target?.tabId !== tabId && run.nativeTabId !== tabId) || !removed && frameId !== 0 &&
          (run.target?.frameId ?? run.selection.frameId ?? 0) !== frameId) continue;
        if (permissionRemoved) {run.resultDeliveryRevoked=true; await transaction.put(RUN_STORE,run,run.runId);}
        if (!live.has(run.state)) continue;
        if (!removed && !permissionRemoved && (run.navigationRequestId || creatingTabs.get(run.runId) === tabId)) continue;
        if (!removed && !permissionRemoved && documentId === run.target?.documentId) continue;
        if (!removed && !permissionRemoved && frameId === 0 && documentId === run.target?.rootDocumentId) continue;
        run.cancelSeq++; run.ownerEpoch++; run.runRevision++; run.state = 'stopping';
        run.terminalReason = permissionRemoved ? CONTROLLER_PERMISSION_ERROR : DOC_REPLACED;
        await transaction.put(RUN_STORE, run, run.runId); invalidated.push(run);
        await lease(transaction, run);
      }
      return invalidated;
    }, [RUN_STORE, COMMAND_JOURNAL]);
    for (const run of runs) {
      abortOperations(run.runId, run.terminalReason);
      await emitToHost(run.registrationId,{type:'controller-fenced',runId:run.runId,reasonCode:run.terminalReason}).catch(()=>{});
    }
    return runs.map(project);
  }
  async function invalidateAppServices(){
    const runs=await tx(RUN_READ,async transaction=>(await transaction.all(RUN_STORE)).filter(run=>run.profile==='app-service'&&live.has(run.state)),[RUN_STORE]);
    for(const run of runs){
      try{await assertAppServiceBinding(api,run.appBinding);continue;}catch{}
      const fenced=await tx(RUN_WRITE,async transaction=>{
        const current=await transaction.get(RUN_STORE,run.runId);
        if(!live.has(current?.state))return null;
        current.cancelSeq++;current.ownerEpoch++;current.runRevision++;current.state='stopping';
        current.resultDeliveryRevoked=true;current.terminalReason='E_TOOL_CHANGED';
        await transaction.put(RUN_STORE,current,current.runId);await lease(transaction,current);return current;
      },[RUN_STORE,COMMAND_JOURNAL]);
      if(fenced){abortOperations(run.runId,'E_TOOL_CHANGED');await emitToHost(run.registrationId,{type:'controller-fenced',runId:run.runId,reasonCode:'E_TOOL_CHANGED'}).catch(()=>{});}
    }
  }
  async function recoverControllers() {
    const result=await tx(RUN_WRITE, async transaction => {
      for (const operation of await transaction.all(COMMAND_JOURNAL)) {
        if (['controller-operation', 'controller-navigation', 'controller-target-create'].includes(operation.tag) && operation.state === 'dispatched') {
          operation.state = 'effect_unknown'; await transaction.put(COMMAND_JOURNAL, operation,
            operation.tag === 'controller-target-create' ? `controller-create:${operation.runId}` : opKey(operation.runId, operation.envelope.requestId));
        }
      }
      for (const run of await transaction.all(RUN_STORE)) if (run.tag === CONTROLLER_RUN_TAG) {
        if (!terminals.has(run.state)) {
          run.state = 'paused_unknown'; run.runRevision++; run.terminalReason = 'worker-restart';
          await transaction.put(RUN_STORE, run, run.runId);
        }
        // Upgrade pre-binding leases from their original authority-issued run.
        // Preserve terminal/retirement facts and never resume execution.
        await lease(transaction, run);
      }
      return {replayed: 0};
    });
    // Chrome's exact host-document inventory proves a dedicated Worker lost
    // its owning document. Reuse the existing retirement path; live hosts and
    // unavailable inventories remain fenced and never resume automatically.
    const contexts=await api.runtime?.getContexts?.({}).catch(()=>null);
    if(Array.isArray(contexts)){
      const runs=await tx(RUN_READ,async transaction=>(await transaction.all(RUN_STORE))
        .filter(run=>run.tag===CONTROLLER_RUN_TAG&&run.retirementState!=='released'),[RUN_STORE]);
      for(const run of runs)if(!contexts.some(context=>context.documentId===run.hostDocumentId))
        await loseControllerHost(run.registrationId,{documentGone:true});
    }
    return result;
  }
  return Object.freeze({commitControllerScript, getControllerScript, listControllerScripts, tombstoneControllerScript, garbageCollectControllerScript,
    handlePageTaskRequest,listPageTaskRequests,readPageTaskRequest,invalidatePageTaskSource,
    prepareDelegatedStep, inspectDelegatedStep, cancelDelegatedStep,prepareTaskRun,inspectTaskRun,cancelTaskRun,listTaskRunPreparations,
    startControllerRun, controllerOperation, stopControllerRun,
    finishControllerRun, snapshotControllerRun, retireControllerTarget, loseControllerHost, invalidateControllerTarget, invalidateAppServices, recoverControllers});
}
