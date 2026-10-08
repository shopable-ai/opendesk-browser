import {createNetworkService} from '../chrome/network.js';
import {normalizeMethod, SDK_METHODS} from '../../framework/sdk/registry.js';
import {FoundationError, BUDGETS, invariant, newId, canonical, digest, digestUtf8} from '../protocol.js';
import {encodeValue, decodeValue} from '../page-port/codec.js';
import {decodeValue as decodeControlValue, encodeValue as encodeControlValue} from '../../framework/control/value.js';
import {observeControllerTarget, verifyControllerTarget, httpUrl, requireGrant} from '../target/index.js';
import {createControllerDriver,COOKIE_PREFLIGHT_METHODS,COOKIE_PREFLIGHT_CODES} from '../../framework/control/native-driver.js';
import {assertInstalledTask} from '../tasks/service.js';

const stores = ['runs', 'commandJournal', 'results'];
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
function fields(value, allowed, required = []) {
  invariant(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(key => allowed.includes(key)) &&
    required.every(key => Object.hasOwn(value, key)), 'E_SCHEMA', 'Invalid controller request fields');
}
function id(value) { invariant(typeof value === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(value), 'E_SCHEMA', 'Invalid controller id'); }
function same(a, b) { return canonical(a, wireCanonicalOptions) === canonical(b, wireCanonicalOptions); }
function typed(error) { return {code: error?.code || 'E_CONTROL_EXECUTION', name: error?.name || 'Error', message: String(error?.message || error)}; }
function hasNativeEffect(operation) {
  return operation?.nativeReceipts?.some(receipt => receipt.stage !== 'webNavigation.getAllFrames') === true;
}

// Delegate of the unique authority. Every durable fence is ordered by its
// injected storage transaction; the maps below only correlate live promises.
export function controllerMethods({storage, api, session, clock, assertHost, currentHost}) {
  const pending = new Map(), cancellations = new Map(), navigating = new Map(), boundTargets = new Map(), creatingTabs = new Map();
  const locatorWriters = new Set();
  const tabEpochs = new Map(), frameEpochs = new Map(), permissionRemovals = [];
  const tx = (mode, work, names = stores) => storage.transaction(names, mode, work);
  const now = () => clock.now();
  function namespace(host) {
    invariant(typeof host.namespace === 'string' && host.namespace && host.principal !== undefined,
      'E_OWNER', 'Unique authority must issue the tool namespace and principal');
    return host.namespace;
  }
  function nativeFence(tabId, origin, frameId = 0) {
    return {tabEpoch: tabEpochs.get(tabId) || 0,
      frameEpoch: frameEpochs.get(canonical([tabId ?? null, frameId])) || 0,
      rootFrameEpoch: frameId > 0 ? frameEpochs.get(canonical([tabId ?? null, 0])) || 0 : 0,
      permissionEpoch: permissionRemovals.filter(patterns => patterns.some(pattern => originMatches(pattern, origin))).length};
  }
  function checkFence(run) {
    const origin = run.target?.allowedOrigin || run.startUrl && httpUrl(run.startUrl).origin;
    if (!origin || !run.nativeFence) return;
    const current = nativeFence(run.target?.tabId ?? run.nativeTabId, origin, run.target?.frameId ?? run.selection.frameId ?? 0);
    invariant(current.permissionEpoch === run.nativeFence.permissionEpoch, 'E_PERMISSION', 'Observed permission removal permanently fenced this run');
    invariant(current.tabEpoch === run.nativeFence.tabEpoch && current.frameEpoch === run.nativeFence.frameEpoch &&
      current.rootFrameEpoch === run.nativeFence.rootFrameEpoch,
      'E_DOCUMENT_REPLACED', 'Observed native document loss fenced this run');
  }
  async function owner(transaction, run, host, sender, {active = false} = {}) {
    await currentHost(transaction, host, sender);
    invariant(run?.tag === 'controller-run' && !run.tombstoned && run.registrationId === host.registrationId &&
      run.hostDocumentId === host.hostDocumentId && run.hostInstanceId === host.hostInstanceId &&
      run.namespace === namespace(host) && run.browserSessionIncarnation === session,
    'E_OWNER', 'Controller belongs to another registered host');
    if (active) {
      checkFence(run);
      invariant(live.has(run.state) && !run.cancelSeq && !run.retirementId && now() < run.deadlineAt,
        now() >= run.deadlineAt ? 'E_TIMEOUT' : 'E_CANCELLED', 'Controller admission is fenced');
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
          const lease = await transaction.get('commandJournal', `controller-pin:${run.runId}`);
          invariant(lease?.tag === 'controller-lease' && lease.registrationId === host.registrationId &&
            pinBindingFields.every(key => Object.hasOwn(lease, key) && same(lease[key], context[key])),
            'E_OWNER');
          if (!retiring) invariant(live.has(lease.state) && !lease.cancelSeq && now() < lease.deadlineAt,
            now() >= lease.deadlineAt ? 'E_TIMEOUT' : 'E_CANCELLED');
        }
        return true;
      },
      async authorize() {
        return tx('readonly', async transaction => context.authorizeInTransaction(transaction),
          scriptId === undefined ? ['runs', 'commandJournal'] : ['scriptHeads', 'commandJournal']);
      }};
    return context;
  }
  async function lease(transaction, run) {
    await transaction.put('commandJournal', {tag: 'controller-lease', runId: run.runId, namespace: run.namespace,
      principal: run.principal, grantIncarnation: run.registrationId, opId: run.opId, requestId: run.requestId,
      resultId: run.resultId, browserSessionIncarnation: run.browserSessionIncarnation,
      registrationId: run.registrationId, cancelSeq: run.cancelSeq, state: run.state, deadlineAt: run.deadlineAt,
      workerRetired: run.workerRetired, retirementState: run.retirementState}, `controller-pin:${run.runId}`);
  }
  async function commitControllerScript(request, sender) {
    fields(request, ['scriptId', 'expectedRevision', 'sourceUtf8', 'contentHash'], ['scriptId', 'expectedRevision', 'sourceUtf8']);
    invariant(!request.scriptId?.startsWith('task:'),'E_PERMISSION','Installed tasks reserve their immutable script IDs');
    const host = await assertHost(sender);
    return storage.commitScriptRevision(scriptContext(host, sender), request);
  }
  function scriptMutation(request) {
    fields(request, ['scriptId', 'expectedRevision'], ['scriptId', 'expectedRevision']); id(request.scriptId);
    invariant(!request.scriptId.startsWith('task:'),'E_PERMISSION','Installed task revisions cannot be changed by the editor');
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
    return storage.transaction(['scriptHeads', 'scriptRevisions', 'commandJournal'], 'readonly', async transaction => {
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
    return storage.transaction(['scriptHeads', 'commandJournal'], 'readonly', async transaction => {
      await currentHost(transaction, host, sender);
      return (await transaction.all('scriptHeads'))
        .filter(row => row?.tag === 'script-head' && row.namespace === namespace(host) && !row.tombstoned && !row.scriptId.startsWith('task:'))
        .map(row => ({scriptId: row.scriptId, revision: row.revision, contentHash: row.contentHash}))
        .sort((a, b) => a.scriptId.localeCompare(b.scriptId));
    });
  }
  function project(run) {
    if (!run) return null;
    return structuredClone(Object.fromEntries(['tag', 'runId', 'state', 'runRevision', 'ownerEpoch', 'cancelSeq', 'identity',
      'target', 'revision', 'deadlineAt', 'retirementId', 'retirementState', 'resultId', 'terminalReason', 'workerRetired',
      'scriptId', 'contentHash', 'sourceKind'].filter(key => run[key] !== undefined).map(key => [key, run[key]])));
  }
  async function snapshotControllerRun(request, sender) {
    fields(request, ['runId']); if (request.runId !== undefined) id(request.runId);
    const host = await assertHost(sender);
    const snapshot = await tx('readonly', async transaction => {
      await currentHost(transaction, host, sender);
      const slot = await transaction.get('runs', '@slot');
      const runs = (await transaction.all('runs')).filter(run=>run.tag==='controller-run' && !run.tombstoned && run.namespace===namespace(host))
        .sort((a,b)=>(a.createdAt || 0)-(b.createdAt || 0) || a.runId.localeCompare(b.runId));
      const run = request.runId ? runs.find(run=>run.runId===request.runId) : null;
      if (request.runId) invariant(run,'E_OWNER');
      const results = (await transaction.all('results')).filter(value=>value.tag==='controller-result' &&
        value.namespace===namespace(host) && (!run || value.runId===run.runId));
      const ids = new Set((run ? [run] : runs).map(row=>row.runId));
      const downloads = (await transaction.all('downloadReceipts')).filter(row=>row.tag==='attempt' && ids.has(row.attempt.runId))
        .map(({attempt})=>Object.fromEntries(['attemptId','runId','state','downloadId','submissionCount','artifactHash','resourceReleasedAt'].map(key=>[key,attempt[key]])));
      return {run, runs, results, downloads, slotAvailable:!slot?.currentRunId};
    }, [...stores,'downloadReceipts']);
    const denied = new Set();
    for (const run of snapshot.runs) {
      try { invariant(!run.resultDeliveryRevoked,'E_PERMISSION'); await requireGrant(api,run.target?.allowedOrigin || httpUrl(run.startUrl).origin); }
      catch { denied.add(run.runId); }
    }
    // Native queries are outside the IDB transaction; recheck the durable fence before delivery.
    await tx('readonly',async transaction=>{
      await currentHost(transaction,host,sender);
      for (const run of snapshot.runs) if ((await transaction.get('runs',run.runId))?.resultDeliveryRevoked) denied.add(run.runId);
    });
    return {...snapshot,run:project(snapshot.run),runs:snapshot.runs.map(project),
      results:snapshot.results.filter(row=>!denied.has(row.runId)),resultDeliveryDenied:[...denied]};
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
      await tx('readonly', async transaction => {
        const current = await transaction.get('runs', run.runId);
        checkFence(current);
        invariant(current?.tag === 'controller-run' && !current.cancelSeq && live.has(current.state) &&
          current.browserSessionIncarnation === session, 'E_CANCELLED');
        invariant(now() < current.deadlineAt, 'E_TIMEOUT');
      }, ['runs']);
      try {
        const observed = await observeControllerTarget({api, tabId, documentId, allowExtensionUrl: bootstrapUrl ?? null});
        if ((!changedFrom || observed.documentId !== changedFrom) && (!run.startUrl || bootstrapUrl ||
          httpUrl(observed.url).origin === httpUrl(run.startUrl).origin)) return observed;
      } catch (error) {
        if (!['E_DOCUMENT_REPLACED', 'E_TARGET'].includes(error.code)) throw error;
      }
      await new Promise(resolve => setTimeout(resolve, 25));
    }
  }
  async function createOwned(run, host, sender) {
    const creationKey = `controller-create:${run.runId}`;
    const intent = await tx('readwrite', async transaction => {
      const current = await owner(transaction, await transaction.get('runs', run.runId), host, sender, {active: true});
      const previous = await transaction.get('commandJournal', creationKey);
      invariant(!previous, 'E_EFFECT_UNKNOWN', 'Owned creation dispatch is never replayed');
      const creationId = newId(), bootstrapUrl = api.runtime.getURL(`ui/target-bootstrap.html?creationId=${encodeURIComponent(creationId)}`);
      const value = {tag: 'controller-target-create', runId: current.runId, creationId, browserSessionIncarnation: session,
        bootstrapUrl, state: 'dispatched', submissionCount: 1, tabId: null, dispatchAt: now()};
      await transaction.put('commandJournal', value, creationKey);
      return value;
    });
    await requireGrant(api, httpUrl(run.startUrl).origin);
    const created = await api.tabs.create({url: intent.bootstrapUrl, active: false});
    invariant(Number.isSafeInteger(created?.id), 'E_EFFECT_UNKNOWN', 'No native owned tab receipt');
    creatingTabs.set(run.runId, created.id);
    await tx('readwrite', async transaction => {
      const value = await transaction.get('commandJournal', creationKey);
      invariant(value.submissionCount === 1 && value.tabId === null, 'E_EFFECT_UNKNOWN');
      value.tabId = created.id; value.receiptAt = now(); value.state = 'created';
      await transaction.put('commandJournal', value, creationKey);
      const current = await transaction.get('runs', run.runId);
      current.nativeTabId = created.id; current.nativeFence.tabEpoch = tabEpochs.get(created.id) || 0;
      current.nativeFence.frameEpoch = frameEpochs.get(canonical([created.id, 0])) || 0;
      await transaction.put('runs', current, current.runId);
    });
    const bootstrap = await waitDocument(run, created.id, {bootstrapUrl: intent.bootstrapUrl});
    await requireGrant(api, httpUrl(run.startUrl).origin);
    await tx('readwrite', async transaction => {
      await owner(transaction, await transaction.get('runs', run.runId), host, sender, {active: true});
      const value = await transaction.get('commandJournal', creationKey);
      invariant(!value.navigationSubmissionCount, 'E_EFFECT_UNKNOWN');
      value.bootstrapDocumentId = bootstrap.documentId; value.navigationSubmissionCount = 1; value.navigationState = 'dispatched';
      await transaction.put('commandJournal', value, creationKey);
    });
    await api.tabs.update(created.id, {url: run.startUrl});
    const observed = await waitDocument(run, created.id, {changedFrom: bootstrap.documentId});
    return {...observed, creationId: intent.creationId};
  }
  async function startControllerRun(request, sender) {
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
  async function prepareControllerRun(request, sender, assertCandidate) {
    // A single admission API supports exact saved revisions and immutable draft
    // snapshots. The original top-level saved request remains compatible.
    fields(request, ['requestId', 'scriptId', 'revision', 'contentHash', 'source', 'paramsWire', 'target', 'deadlineAt'],
      ['requestId', 'paramsWire', 'target', 'deadlineAt']);
    id(request.requestId); selection(request.target); const runParams=decodeValue(request.paramsWire);
    const variant = request.source, isDraft = variant?.kind === 'draft';
    if (variant !== undefined) {
      invariant(!['scriptId', 'revision', 'contentHash'].some(key => Object.hasOwn(request, key)),
        'E_SCHEMA', 'Select one source variant without legacy source fields');
      invariant(variant?.kind === 'draft' || variant?.kind === 'saved', 'E_SCHEMA', 'Unknown controller source variant');
      fields(variant, isDraft ? ['kind', 'sourceUtf8'] : ['kind', 'scriptId', 'revision', 'contentHash'],
        isDraft ? ['kind', 'sourceUtf8'] : ['kind', 'scriptId', 'revision', 'contentHash']);
    }
    const saved = isDraft ? null : variant || request;
    const isInstalledTask = !isDraft && saved.scriptId?.startsWith('task:');
    const draftSourceUtf8 = isDraft ? variant.sourceUtf8 : undefined;
    if (isDraft) {
      invariant(typeof draftSourceUtf8 === 'string' &&
        new TextEncoder().encode(draftSourceUtf8).byteLength <= BUDGETS.maxRawFrameBytes - 8192,
        'E_LIMIT', 'Draft source exceeds safe host message budget');
      // Reject unpaired surrogates, preserving an exact UTF-8 hash contract.
      encodeValue(draftSourceUtf8);
    } else {
      id(saved.scriptId);
      invariant(Number.isSafeInteger(saved.revision) && saved.revision > 0 &&
        /^[a-f0-9]{64}$/.test(saved.contentHash), 'E_REVISION');
    }
    invariant(Number.isSafeInteger(request.deadlineAt) && request.deadlineAt > now(), 'E_TIMEOUT');
    const sourceHash = isDraft ? await digestUtf8(draftSourceUtf8) : saved.contentHash;
    const host = await assertHost(sender), requestDigest = await digest(request, wireCanonicalOptions);
    const selectedOrigin = request.target.mode === 'owned' ? httpUrl(request.target.url).origin : null;
    let observed;
    if (request.target.mode === 'borrowed') observed = await observeControllerTarget({api, ...request.target});
    else await requireGrant(api, httpUrl(request.target.url).origin);
    const capturedFence = nativeFence(request.target.tabId, selectedOrigin || observed.allowedOrigin, request.target.frameId ?? 0);
    const admissionKey = `controller-start:${canonical([host.registrationId, request.requestId])}`;
    const admitted = await tx('readwrite', async transaction => {
      await currentHost(transaction, host, sender);
      assertCandidate();
      if (isInstalledTask) await assertInstalledTask(transaction,namespace(host),{
        scriptId:saved.scriptId,contentHash:saved.contentHash,
        origin:selectedOrigin || observed.allowedOrigin,params:runParams});
      const old = await transaction.get('commandJournal', admissionKey);
      if (old) {
        invariant(old.requestDigest === requestDigest, 'E_REQUEST_CONFLICT');
        return {run: await owner(transaction, await transaction.get('runs', old.runId), host, sender), duplicate: true};
      }
      const slot = await transaction.get('runs', '@slot');
      invariant(!slot?.currentRunId, 'E_OWNER', 'Previous controller target has not retired');
      const runId = newId(), scriptId = isDraft ? `draft:${runId}` : saved.scriptId;
      const run = {tag: 'controller-run', runId, namespace: namespace(host), principal: host.principal,
        registrationId: host.registrationId, hostDocumentId: host.hostDocumentId, hostInstanceId: host.hostInstanceId,
        browserSessionIncarnation: session, scriptId, contentHash: sourceHash, sourceKind: isDraft ? 'draft' : 'saved',
        ...(isDraft ? {draftSourceUtf8} : {}),
        opId: newId(), resultId: newId(), requestId: request.requestId, requestDigest, deadlineAt: request.deadlineAt,
        paramsWire: structuredClone(request.paramsWire), selection: structuredClone(request.target),
        startUrl: request.target.mode === 'owned' ? httpUrl(request.target.url).href : null,
        nativeFence: capturedFence, nativeTabId: request.target.tabId ?? null,
        state: 'preparing', ownerEpoch: 1, runRevision: 1, eventSeq: 0, cancelSeq: 0, workerRetired: false,
        retirementState: 'not-started', target: null, identity: null, revision: null, createdAt: now()};
      await transaction.put('runs', run, runId);
      await lease(transaction, run);
      let pinned;
      if (isDraft) {
        // Draft bytes live only on this authoritative run; never create an
        // apparent saved script head, revision or long-lived revision pin.
        invariant(await digestUtf8(run.draftSourceUtf8) === sourceHash, 'E_HASH', 'Draft source changed at admission');
        run.revision = {kind: 'draft', scriptId: run.scriptId, revision: 1, sourceHash};
      } else {
        pinned = await storage.pinScriptRevision(scriptContext(host, sender, run), saved, transaction);
        run.revision = {scriptId: run.scriptId, revision: pinned.revision.revision,
          sourceHash: pinned.revision.contentHash, pinKey: pinned.pinKey};
      }
      await transaction.put('runs', run, runId);
      await transaction.put('runs', {tag: 'slot', currentRunId: runId, state: 'held', releaseCount: 0, fencedEpoch: 1, retirementId: null}, '@slot');
      await transaction.put('commandJournal', {tag: 'controller-start', runId, requestDigest}, admissionKey);
      return {run, pinned, duplicate: false};
    }, isDraft ? stores : [...stores, 'scriptHeads', 'scriptRevisions', ...(isInstalledTask?['frameworkKV']:[])]);
    const run = admitted.run;
    if (admitted.duplicate) return {runId: run.runId, state: run.state, duplicate: true, runRevision: run.runRevision};
    try {
      const pinned = admitted.pinned;
      if (!observed) observed = await createOwned(run, host, sender);
      await verifyControllerTarget({api, target: observed, expectedUrl: request.target.expectedUrl, expectedWindowId:request.target.expectedWindowId});
      return await tx('readwrite', async transaction => {
        const current = await owner(transaction, await transaction.get('runs', run.runId), host, sender, {active: true});
        assertCandidate();
        current.target = {...observed, targetSessionId: newId(), targetVersion: 1, mode: request.target.mode, browserSessionIncarnation: session};
        current.identity = {tag: 'controller-run', runId: current.runId, hostInstanceId: host.hostInstanceId, hostDocumentId: host.hostDocumentId,
          ownerEpoch: current.ownerEpoch, scriptId: current.scriptId, revision: current.revision.revision, contentHash: current.contentHash, target: current.target};
        if (isDraft) invariant(await digestUtf8(current.draftSourceUtf8) === current.revision.sourceHash,
          'E_HASH', 'Admitted draft bytes do not match their SHA-256');
        current.state = 'running'; current.runRevision++; current.eventSeq++;
        boundTargets.set(current.runId, current.target);
        creatingTabs.delete(current.runId);
        await transaction.put('runs', current, current.runId);
        await lease(transaction, current);
        assertCandidate();
        return {...project(current), sourceUtf8: isDraft ? current.draftSourceUtf8 : pinned.revision.sourceUtf8,
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
    const run = await owner(transaction, await transaction.get('runs', envelope.identity.runId), host, sender, {active: true});
    invariant(envelope.identity.tag === 'controller-run' && same(envelope.identity, {...run.identity, target: envelope.target}) &&
      same(envelope.revision, run.revision), 'E_OWNER', 'Controller operation binding differs');
    invariant(same(envelope.target, run.target), 'E_DOCUMENT_REPLACED');
    if (run.navigationRequestId) invariant(run.navigationRequestId === envelope.requestId, 'E_DOCUMENT_REPLACED', 'Navigation fenced old operations');
    if (handoff) invariant(post && handoff.from.documentId === run.target.documentId && handoff.to.tabId === run.target.tabId &&
      handoff.to.frameId === run.target.frameId && handoff.to.targetVersion === run.target.targetVersion + 1 &&
      handoff.to.browserSessionIncarnation === session && handoff.to.mode === run.target.mode,
    'E_DOCUMENT_REPLACED', 'Native navigation handoff differs');
    return run;
  }
  async function controllerOperation(request, sender) {
    fields(request, ['envelope'], ['envelope']);
    const envelope = structuredClone(request.envelope);
    fields(envelope, ['requestId', 'identity', 'revision', 'target', 'operation'], ['requestId', 'identity', 'revision', 'target', 'operation']);
    id(envelope.requestId);
    invariant(envelope.identity?.tag === 'controller-run', 'E_OWNER');
    id(envelope.identity.runId);
    fields(envelope.operation, ['kind', 'method', 'args'], ['kind', 'method', 'args']);
    invariant(Array.isArray(decodeControlValue(envelope.operation.args, {maxBytes: envelope.operation.method === 'uploadChunk' ? 131072 : 65536})), 'E_SCHEMA');
    const serviceCall = envelope.operation.kind === 'service';
    let serviceArgs;
    if (serviceCall) {
      const method = envelope.operation.method, args = decodeControlValue(envelope.operation.args);
      invariant(Object.hasOwn(SDK_METHODS, method) && /^(AXIOS_|APPSTORAGE_|APPLOCAL_|CHROME_LOCAL_)/.test(method), 'E_CAPABILITY');
      invariant(args.length === 1, 'E_SCHEMA'); serviceArgs = normalizeMethod(method, args[0]);
    }
    const host = await assertHost(sender), key = opKey(envelope.identity.runId, envelope.requestId), requestDigest = await digest(envelope, wireCanonicalOptions);
    const previous = await tx('readonly', async transaction => {
      await owner(transaction, await transaction.get('runs', envelope.identity.runId), host, sender);
      const value = await transaction.get('commandJournal', key);
      if (value) invariant(value.requestDigest === requestDigest, 'E_REQUEST_CONFLICT');
      return value;
    });
    if (serviceCall && previous?.state === 'durable' && !previous.reply && Object.hasOwn(previous,'valueWire')) {
      previous.reply = {requestId:envelope.requestId,value:encodeControlValue(decodeValue(previous.valueWire))};
    }
    if (previous?.reply) {
      const target = previous.reply.handoff?.to || envelope.target;
      await verifyControllerTarget({api, target});
      await tx('readonly', async transaction => {
        const run = await owner(transaction, await transaction.get('runs', envelope.identity.runId), host, sender, {active: true});
        invariant(same(envelope.identity, {...run.identity, target: envelope.target}) && same(envelope.revision, run.revision), 'E_OWNER');
        invariant(same(target, run.target) && !run.navigationRequestId, 'E_DOCUMENT_REPLACED');
      });
      return previous.reply;
    }
    if (pending.has(key)) return pending.get(key);
    if (previous) throw new FoundationError('E_EFFECT_UNKNOWN', 'Dispatched controller operation is not replayable');
    const completion = perform(); pending.set(key, completion);
    try { return await completion; } finally { if (pending.get(key) === completion) pending.delete(key); }
    async function perform() {
      const navigation = envelope.operation.kind === 'browser' && ['goto', 'reload'].includes(envelope.operation.method);
      const run = await tx('readwrite', async transaction => {
        const current = await admittedOperation(transaction, envelope, host, sender);
        invariant(!await transaction.get('commandJournal', key), 'E_EFFECT_UNKNOWN');
        if (navigation) {
          invariant(!current.navigationRequestId, 'E_DOCUMENT_REPLACED');
          current.navigationRequestId = envelope.requestId;
          await transaction.put('runs', current, current.runId);
        }
        await transaction.put('commandJournal', {tag: navigation ? 'controller-navigation' : 'controller-operation', runId: current.runId,
          ...(serviceCall ? {lifecycle:'controller',namespace:current.namespace,principal:current.principal,grantIncarnation:current.registrationId,
            browserSessionIncarnation:session,opId:key,requestId:envelope.requestId,resultId:`${key}:result`,method:envelope.operation.method} : {}),
          requestDigest, envelope, state: 'dispatched', submissionCount: 1, dispatchAt: now()}, key);
        return current;
      });
      if (navigation) navigating.set(run.runId, envelope.requestId);
      const abort = new AbortController(); cancellations.set(key, {runId: run.runId, abort});
      const authorizeOperation = async (captured, details = {}) => {
        invariant(same(captured, envelope), 'E_OWNER');
        if (details.url !== undefined) {
          invariant(httpUrl(details.url).origin === envelope.target.allowedOrigin, 'E_PERMISSION', 'Cross-origin controller operation denied');
          await requireGrant(api, httpUrl(details.url).origin);
        }
        await requireGrant(api, envelope.target.allowedOrigin);
        if (details.handoff) await verifyControllerTarget({api, target: details.handoff.to});
        else if (details.navigationPending) {
          invariant(navigation, 'E_OWNER', 'Only the original navigation intent may wait across documents');
          const observed = await observeControllerTarget({api, tabId: envelope.target.tabId, frameId: envelope.target.frameId});
          invariant(observed.allowedOrigin === envelope.target.allowedOrigin, 'E_PERMISSION');
        } else await verifyControllerTarget({api, target: envelope.target});
        return tx('readonly', transaction => admittedOperation(transaction, envelope, host, sender,
          {post: details.phase === 'post', handoff: details.handoff}));
      };
      const withLocatorWrite = async (identity, effect) => {
        const writeKey = identity.runId;
        invariant(!locatorWriters.has(writeKey), 'E_WRITE_CONFLICT');
        locatorWriters.add(writeKey);
        try { return await effect(); } finally { locatorWriters.delete(writeKey); }
      };
      const driver = createControllerDriver({api, clock, authorize:authorizeOperation, withWrite:withLocatorWrite});
      const recordReceipt = async receipt => tx('readwrite', async transaction => {
        const operation = await transaction.get('commandJournal', key);
        invariant(operation?.requestDigest === requestDigest, 'E_REQUEST_CONFLICT');
        const rows = operation.nativeReceipts ||= [], copy = structuredClone(receipt);
        const locator = envelope.operation.kind === 'packaged' &&
          ['locatorAction','locatorWait'].includes(envelope.operation.method);
        if (locator && ['webNavigation.getAllFrames','tabs.sendMessage'].includes(receipt.stage)) {
          // Keep the last native poll evidence and its total count, rather
          // than growing the durable journal for the full 120-second wait.
          // Explicit commitIntent/commitNoEffect records are never sampled.
          const old = rows.findIndex(row => row.stage === receipt.stage && row.sampled === true);
          if (old >= 0) rows.splice(old, 1);
          rows.push({...copy, sampled:true});
          operation.locatorNativePollCount = (operation.locatorNativePollCount || 0) + 1;
        } else if (locator && receipt.stage === 'locator.commitNoEffect') {
          // Every earlier commit intent was explicitly cleared by a
          // no-effect receipt. Keep the newest checkpoint and a count.
          operation.locatorNoEffectCount = (operation.locatorNoEffectCount || 0) + 1;
          operation.nativeReceipts = rows.filter(row => !['locator.commitIntent','locator.commitNoEffect'].includes(row.stage));
          operation.nativeReceipts.push(copy);
        } else rows.push(copy);
        await transaction.put('commandJournal', operation, key);
      }, ['commandJournal']);
      const recordServiceEffect = async value => {
        const valueWire = encodeValue(value), reply = {requestId:envelope.requestId,value:encodeControlValue(value)};
        await tx('readwrite', async transaction => {
          const operation = await transaction.get('commandJournal', key);
          invariant(operation?.requestDigest === requestDigest, 'E_REQUEST_CONFLICT');
          await transaction.put('results',{...Object.fromEntries(pinBindingFields.map(field=>[field,operation[field]])),
            tag:'controller-service-result',opKey:key,requestDigest,state:'durable',valueWire,committedAt:now()},operation.resultId);
          operation.state='durable'; operation.valueWire=valueWire; operation.reply=reply; operation.receiptAt=now();
          await transaction.put('commandJournal',operation,key);
        });
        return reply;
      };
      async function executeService() {
        const context = {lifecycle:'controller',namespace:run.namespace,principal:run.principal,grantIncarnation:run.registrationId,
          browserSessionIncarnation:session,runId:run.runId,opId:key,requestId:envelope.requestId,resultId:`${key}:result`,
          opKey:key,method:envelope.operation.method,requestDigest,deadlineAt:run.deadlineAt,signal:abort.signal,
          authorize:details=>authorizeOperation(envelope,details),
          authorizeInTransaction:transaction=>admittedOperation(transaction,envelope,host,sender),
          assertDispatch(){checkFence(run);invariant(!abort.signal.aborted && now()<run.deadlineAt,'E_CANCELLED');},
          recordNativeReceipt:recordReceipt,recordEffect:recordServiceEffect};
        const httpMethod = {AXIOS_GET:'GET',AXIOS_POST:'POST',AXIOS_PUT:'PUT',AXIOS_DELETE:'DELETE'}[context.method];
        const value = httpMethod
          ? await createNetworkService({clock,authorize:(details,ctx)=>ctx.authorize(details)}).request({method:httpMethod,...serviceArgs},context)
          : await storage.executeSdk(context.method,serviceArgs,context);
        return {requestId:envelope.requestId,value:encodeControlValue(value)};
      }
      try {
        const reply = serviceCall ? await executeService() : await driver.execute(envelope, {signal:abort.signal,deadlineAt:run.deadlineAt,recordReceipt});
        invariant(reply?.requestId === envelope.requestId, 'E_RESULT_FORMAT');
        const valueWire = reply.error ? undefined : encodeValue(decodeControlValue(reply.value));
        // Record observed native effect before checking delivery permission.
        // Cancellation cannot erase the receipt or make this request replayable.
        await tx('readwrite', async transaction => {
          const operation = await transaction.get('commandJournal', key);
          invariant(operation?.requestDigest === requestDigest && operation.submissionCount === 1, 'E_REQUEST_CONFLICT');
          if(reply.error){
            const kind=envelope.operation.kind;
            const cookiePreflight=kind==='browser'&&COOKIE_PREFLIGHT_METHODS.includes(envelope.operation.method);
            const stage=kind==='user-script'?'userScripts.finalFailure':kind==='packaged'?'packaged.finalFailure':cookiePreflight?'cookies.preflightFailure':undefined;
            const failure=stage&&operation.nativeReceipts?.find(receipt=>receipt.stage===stage&&receipt.requestId===envelope.requestId);
            invariant(failure?.receipt?.frameId===envelope.target.frameId&&failure.receipt.documentId===envelope.target.documentId&&
              same(failure.receipt.error,reply.error)&&(kind!=='packaged'||(failure.receipt.runId===envelope.identity.runId&&
                failure.receipt.ownerEpoch===envelope.identity.ownerEpoch)),'E_RESULT_FORMAT',
            'A failed native reply requires its validated target-bound completion receipt');
            if(cookiePreflight) {
              const receipts=operation.nativeReceipts,results=receipts.filter(receipt=>receipt.stage==='result');
              invariant(receipts.filter(receipt=>receipt.stage===stage).length===1&&
                failure.receipt.phase==='input-preflight'&&failure.receipt.method===envelope.operation.method&&
                failure.receipt.runId===envelope.identity.runId&&failure.receipt.ownerEpoch===envelope.identity.ownerEpoch&&
                COOKIE_PREFLIGHT_CODES.includes(reply.error.code)&&results.length===1&&
                results[0].requestId===envelope.requestId&&same(results[0].receipt,reply)&&
                receipts.every(receipt=>receipt.requestId===envelope.requestId&&['webNavigation.getAllFrames',stage,'result'].includes(receipt.stage)),
                'E_RESULT_FORMAT','Cookie input failure requires its exact zero-dispatch checkpoint and result');
            }
            operation.effectState='failure-observed';operation.failure=structuredClone(reply.error);
          }else operation.valueWire=valueWire;
          operation.state = 'durable'; operation.receiptAt = now(); operation.reply = reply;
          if (reply.handoff) operation.targetTransition = {navigationIntentId: envelope.requestId,
            from: structuredClone(reply.handoff.from), to: structuredClone(reply.handoff.to)};
          await transaction.put('commandJournal', operation, key);
        });
        return await tx('readwrite', async transaction => {
          const current = await admittedOperation(transaction, envelope, host, sender, {post: true, handoff: reply.handoff});
          if (navigation) {
            invariant(reply.handoff, 'E_DOCUMENT_REPLACED');
            current.target = structuredClone(reply.handoff.to); current.identity.target = current.target;
            boundTargets.set(current.runId, current.target);
            delete current.navigationRequestId; current.runRevision++; current.eventSeq++;
            await transaction.put('runs', current, current.runId);
          }
          return reply;
        });
      } catch (error) {
        await tx('readwrite', async transaction => {
          const operation = await transaction.get('commandJournal', key);
          if (!operation || operation.state === 'durable') return;
          if (serviceCall && error.code==='E_HTTP' && operation.nativeReceipts?.some(receipt=>Number.isInteger(receipt.status))) {
            operation.state='durable'; operation.effectState='response-observed'; operation.receiptAt=now();
            operation.reply={requestId:envelope.requestId,error:{...typed(error),cause:{status:error.status,response:error.response}}};
            operation.failure=typed(error); await transaction.put('commandJournal',operation,key); return;
          }
          // Missing a receipt cannot prove a rejected native call had no effect.
          // Only the driver's explicit user-script availability failure, before
          // its execute receipt, is a known lookup failure.
          const failedWithoutEffect = error.code === 'E_USER_SCRIPTS_UNAVAILABLE' &&
            envelope.operation.kind === 'user-script' && !hasNativeEffect(operation);
          // A dispatched Locator commit may have changed the page even when its
          // callback was lost or a stop/timeout won the race. Only an explicit
          // same-document no-effect receipt clears the latest commit intent.
          const lastLocatorCommit = (operation.nativeReceipts || []).filter(receipt =>
            receipt.stage === 'locator.commitIntent' || receipt.stage === 'locator.commitNoEffect').at(-1);
          const uncertainAction = envelope.operation.kind === 'packaged' &&
            envelope.operation.method === 'locatorAction' && lastLocatorCommit?.stage === 'locator.commitIntent';
          operation.state = uncertainAction ? 'effect_unknown' :
            error.code === 'E_CANCELLED' || error.code === 'E_TIMEOUT' ? 'cancelled' :
            failedWithoutEffect ? 'failed' : 'effect_unknown';
          operation.failure = typed(error); operation.deliveryState = 'fenced';
          await transaction.put('commandJournal', operation, key);
          const current = await transaction.get('runs', run.runId);
          if (current?.navigationRequestId === envelope.requestId) delete current.navigationRequestId;
          if (current && live.has(current.state) && !current.cancelSeq && operation.state === 'effect_unknown') {
            current.state = 'paused_unknown'; current.terminalReason = typed(error); current.runRevision++;
          }
          if (current) { await transaction.put('runs', current, current.runId); await lease(transaction, current); }
        });
        throw error;
      } finally { cancellations.delete(key); if (navigation) navigating.delete(run.runId); }
    }
  }
  function abortOperations(runId, code) {
    for (const value of cancellations.values()) if (value.runId === runId) value.abort.abort(new FoundationError(code, code));
  }
  async function stopControllerRun(request, sender) {
    fields(request, ['runId', 'requestId', 'expectedRunRevision', 'reason'], ['runId', 'requestId']); id(request.runId); id(request.requestId);
    const host = await assertHost(sender), key = `controller-stop:${canonical([request.runId, request.requestId])}`;
    const answer = await tx('readwrite', async transaction => {
      const run = await owner(transaction, await transaction.get('runs', request.runId), host, sender);
      const old = await transaction.get('commandJournal', key);
      if (old) { invariant(old.requestDigest === canonical(request), 'E_REQUEST_CONFLICT'); return old.response; }
      if (!run.cancelSeq && !terminals.has(run.state) && !run.retirementId) {
        invariant(request.expectedRunRevision === undefined || request.expectedRunRevision === run.runRevision, 'E_REVISION');
        run.cancelSeq++; run.ownerEpoch++; run.runRevision++; run.eventSeq++; run.state = 'stopping';
        run.terminalReason = request.reason || 'E_CANCELLED'; await transaction.put('runs', run, run.runId); await lease(transaction, run);
      }
      const response = {runId: run.runId, state: run.state, cancelSeq: run.cancelSeq, runRevision: run.runRevision};
      await transaction.put('commandJournal', {tag: 'controller-stop', requestDigest: canonical(request), response}, key);
      return response;
    });
    abortOperations(request.runId, request.reason === 'E_TIMEOUT' ? 'E_TIMEOUT' : 'E_CANCELLED');
    const run = await tx('readonly', transaction => transaction.get('runs', request.runId), ['runs']);
    await createControllerDriver({api, clock, authorize: async () => true}).cancel(run).catch(() => {});
    return answer;
  }
  async function settleInternal(runId, status, outcome, {workerRetired = false, host, sender, requestId, requestDigest} = {}) {
    return tx('readwrite', async transaction => {
      const run = await transaction.get('runs', runId);
      invariant(run?.tag === 'controller-run', 'E_OWNER');
      if (host) await owner(transaction, run, host, sender);
      if (requestId) {
        const key = `controller-finish:${canonical([runId, requestId])}`, previous = await transaction.get('commandJournal', key);
        if (previous) invariant(previous.requestDigest === requestDigest, 'E_REQUEST_CONFLICT');
        else await transaction.put('commandJournal', {tag: 'controller-finish', runId, requestDigest}, key);
      }
      const old = await transaction.get('results', run.resultId);
      if (old) {
        if (old.state === 'completed' && status === 'completed') invariant(same(old.outcome.valueWire, outcome.valueWire),
          'E_REQUEST_CONFLICT', 'Controller terminal value is immutable');
        if (workerRetired && !run.workerRetired) { run.workerRetired = true; await transaction.put('runs', run, runId); await lease(transaction, run); }
        return {run: project(run), result: old};
      }
      const terminal = run.cancelSeq ? (run.terminalReason === 'E_HOST_CLOSED' ? 'interrupted' : 'stopped') : status;
      invariant(terminals.has(terminal), 'E_SCHEMA');
      const expired = now() >= run.deadlineAt;
      const state = expired && terminal === 'completed' ? 'stopped' : terminal;
      const result = {tag: 'controller-result', resultId: run.resultId, runId, namespace: run.namespace, principal: run.principal,
        revision: run.revision, sourceKind: run.sourceKind, state, outcome: state === 'completed' ? {ok: true, valueWire: outcome.valueWire} :
          {ok: false, error: run.cancelSeq || expired ? typed(new FoundationError(expired ? 'E_TIMEOUT' : run.terminalReason || 'E_CANCELLED', 'Controller fenced')) : outcome.error},
        committedAt: now()};
      if (result.outcome.ok) decodeValue(result.outcome.valueWire);
      if (state === 'completed') invariant(!(await transaction.all('commandJournal')).some(value => value.runId === runId &&
        ['controller-operation', 'controller-navigation'].includes(value.tag) && ['dispatched', 'effect_unknown'].includes(value.state)),
      'E_EFFECT_UNKNOWN', 'Unsettled controller effects prevent success');
      run.state = state; run.cancelSeq++; run.ownerEpoch++; run.runRevision++; run.eventSeq++;
      run.workerRetired = workerRetired; run.retirementId = newId(); run.retirementState = 'fenced';
      run.terminalReason = result.outcome.ok ? null : result.outcome.error;
      await transaction.put('results', result, run.resultId); await transaction.put('runs', run, runId);
      await lease(transaction, run);
      const slot = await transaction.get('runs', '@slot');
      invariant(slot?.currentRunId === runId, 'E_OWNER');
      slot.retirementId = run.retirementId; slot.fencedEpoch = run.ownerEpoch;
      await transaction.put('runs', slot, '@slot');
      return {run: project(run), result};
    });
  }
  async function finishControllerRun(request, sender) {
    fields(request, ['runId', 'requestId', 'status', 'valueWire', 'error', 'workerRetired'], ['runId', 'requestId', 'status', 'workerRetired']);
    id(request.runId); id(request.requestId);
    invariant(['succeeded', 'error', 'stopped', 'timeout', 'host-closed'].includes(request.status) && typeof request.workerRetired === 'boolean', 'E_SCHEMA');
    if (request.status === 'succeeded') decodeValue(request.valueWire);
    const host = await assertHost(sender);
    await tx('readonly', async transaction => owner(transaction, await transaction.get('runs', request.runId), host, sender));
    const state = request.status === 'succeeded' ? 'completed' : request.status === 'error' ? 'failed' : request.status === 'host-closed' ? 'interrupted' : 'stopped';
    const answer = await settleInternal(request.runId, state, request.status === 'succeeded' ? {valueWire: request.valueWire} :
      {error: request.error || typed(new FoundationError(request.status === 'timeout' ? 'E_TIMEOUT' : 'E_CANCELLED', request.status))},
      {...request, host, sender, requestDigest: await digest(request, wireCanonicalOptions)});
    abortOperations(request.runId, request.status === 'timeout' ? 'E_TIMEOUT' : 'E_CANCELLED');
    // Settlement persists even if permission is lost; delivery is separately authorized.
    const delivery=await snapshotControllerRun({runId:request.runId},sender);
    invariant(delivery.results.some(result=>result.resultId===answer.result.resultId),'E_PERMISSION','Result delivery is no longer authorized');
    return answer;
  }
  async function retireControllerTarget(request, sender) {
    fields(request, ['runId'], ['runId']); id(request.runId);
    const host = await assertHost(sender);
    const run = await tx('readonly', async transaction => owner(transaction, await transaction.get('runs', request.runId), host, sender));
    return retire(run, host, sender);
  }
  async function retire(run, host, sender) {
    if (run.retirementState === 'released') return {state: 'released', releaseCount: 1};
    if (!run.retirementId || !run.workerRetired) return {state: 'pending', releaseCount: 0, reason: 'worker-not-retired'};
    await createControllerDriver({api, clock, authorize: async () => true}).cancel(run).catch(() => {});
    let absence = 'borrowed-not-closed';
    if (run.selection.mode === 'owned') {
      const intent = await tx('readonly', transaction => transaction.get('commandJournal', `controller-create:${run.runId}`), ['commandJournal']);
      if (intent && (!Number.isSafeInteger(intent.tabId) || intent.browserSessionIncarnation !== session))
        return {state: 'pending', releaseCount: 0, reason: 'creation-unknown'};
      if (intent) {
        // The durable creation callback, same browser incarnation and committed
        // run fence establish ownership; borrowed selections never enter here.
        const call = await tx('readwrite', async transaction => {
          const current = await transaction.get('runs', run.runId);
          invariant(current.retirementId === run.retirementId && current.workerRetired && current.browserSessionIncarnation === session, 'E_OWNER');
          const key = `controller-retirement:${run.retirementId}`, old = await transaction.get('commandJournal', key);
          if (old) return false;
          await transaction.put('commandJournal', {tag: 'controller-retirement', runId: run.runId, retirementId: run.retirementId,
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
    return tx('readwrite', async transaction => {
      const current = await transaction.get('runs', run.runId), slot = await transaction.get('runs', '@slot');
      if (current.retirementState === 'released') return {state: 'released', releaseCount: 1};
      invariant(current.workerRetired && current.retirementId === run.retirementId && slot?.currentRunId === run.runId &&
        slot.retirementId === run.retirementId && slot.releaseCount === 0, 'E_OWNER');
      if (host) await owner(transaction, current, host, sender);
      current.retirementState = 'released'; current.runRevision++;
      // Once the Worker is conclusively retired, preserve sourceHash and
      // result identity but do not retain uncommitted draft source bytes.
      if (current.sourceKind === 'draft') delete current.draftSourceUtf8;
      await transaction.put('runs', current, current.runId);
      await lease(transaction, current);
      // Host disappearance cannot call a host-authorized revision API. Release
      // only this existing exact pin after realm/target retirement is proven.
      if (!host && current.revision?.pinKey) {
        const pin = await transaction.get('commandJournal', current.revision.pinKey);
        invariant(pin?.runId === current.runId && pin.opKey === `controller-pin:${current.runId}`, 'E_OWNER');
        await transaction.put('commandJournal', {...pin, released: true}, current.revision.pinKey);
      }
      await transaction.put('runs', {...slot, currentRunId: null, state: 'available', releaseCount: 1}, '@slot');
      boundTargets.delete(current.runId); navigating.delete(current.runId); creatingTabs.delete(current.runId);
      await transaction.put('commandJournal', {tag: 'controller-retirement', runId: run.runId, retirementId: run.retirementId,
        releaseCount: 1, absence, releasedAt: now()}, `controller-retirement:${run.retirementId}`);
      return {state: 'released', releaseCount: 1, retirementId: run.retirementId};
    });
  }
  async function loseControllerHost(registrationId, {documentGone = false} = {}) {
      const runs = await tx('readonly', async transaction => (await transaction.all('runs')).filter(run => run.tag === 'controller-run' &&
      run.registrationId === registrationId && run.retirementState !== 'released'), ['runs']);
    for (const run of runs) {
      abortOperations(run.runId, 'E_HOST_CLOSED');
      if (documentGone) {
        if (terminals.has(run.state)) {
          const answer = await settleInternal(run.runId, 'interrupted', {}, {workerRetired: true});
          await retire({...run, ...answer.run}, null, null);
          continue;
        }
        await tx('readwrite', async transaction => {
          const current = await transaction.get('runs', run.runId);
          current.cancelSeq++; current.ownerEpoch++; current.terminalReason = 'E_HOST_CLOSED';
          await transaction.put('runs', current, current.runId);
          await lease(transaction, current);
        }, ['runs', 'commandJournal']);
        const answer = await settleInternal(run.runId, 'interrupted', {error: typed(new FoundationError('E_HOST_CLOSED', 'Host document is gone'))}, {workerRetired: true});
        await createControllerDriver({api, clock, authorize: async () => true}).cancel(run).catch(() => {});
        await retire({...run, ...answer.run}, null, null);
      } else await tx('readwrite', async transaction => {
        const current = await transaction.get('runs', run.runId);
        if (!terminals.has(current.state)) { current.state = 'paused_unknown'; current.runRevision++; await transaction.put('runs', current, current.runId); await lease(transaction, current); }
      }, ['runs', 'commandJournal']);
    }
  }
  async function invalidateControllerTarget({tabId, frameId = 0, documentId, removed = false, permissionRemoved = false, origins = []} = {}) {
    // Synchronous event fences precede the first IDB await. Re-granting a site
    // cannot revive an operation waiting for that transaction to acquire a lock.
    if (permissionRemoved) {
      invariant(Array.isArray(origins) && origins.every(pattern => typeof pattern === 'string'), 'E_SCHEMA');
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
    const runs = await tx('readwrite', async transaction => {
      const invalidated = [];
      for (const run of await transaction.all('runs')) {
        if (run.tag !== 'controller-run') continue;
        if (permissionRemoved) {
          const origin = run.target?.allowedOrigin || run.startUrl && httpUrl(run.startUrl).origin;
          if (!origin || !origins.some(pattern => originMatches(pattern, origin))) continue;
        } else if ((run.target?.tabId !== tabId && run.nativeTabId !== tabId) || !removed && frameId !== 0 &&
          (run.target?.frameId ?? run.selection.frameId ?? 0) !== frameId) continue;
        if (permissionRemoved) {run.resultDeliveryRevoked=true; await transaction.put('runs',run,run.runId);}
        if (!live.has(run.state)) continue;
        if (!removed && !permissionRemoved && (run.navigationRequestId || creatingTabs.get(run.runId) === tabId)) continue;
        if (!removed && !permissionRemoved && documentId === run.target?.documentId) continue;
        if (!removed && !permissionRemoved && frameId === 0 && documentId === run.target?.rootDocumentId) continue;
        run.cancelSeq++; run.ownerEpoch++; run.runRevision++; run.state = 'stopping';
        run.terminalReason = permissionRemoved ? 'E_PERMISSION' : 'E_DOCUMENT_REPLACED';
        await transaction.put('runs', run, run.runId); invalidated.push(run);
        await lease(transaction, run);
      }
      return invalidated;
    }, ['runs', 'commandJournal']);
    for (const run of runs) abortOperations(run.runId, run.terminalReason);
    return runs.map(project);
  }
  async function recoverControllers() {
    return tx('readwrite', async transaction => {
      for (const operation of await transaction.all('commandJournal')) {
        if (['controller-operation', 'controller-navigation', 'controller-target-create'].includes(operation.tag) && operation.state === 'dispatched') {
          operation.state = 'effect_unknown'; await transaction.put('commandJournal', operation,
            operation.tag === 'controller-target-create' ? `controller-create:${operation.runId}` : opKey(operation.runId, operation.envelope.requestId));
        }
      }
      for (const run of await transaction.all('runs')) if (run.tag === 'controller-run') {
        if (!terminals.has(run.state)) {
          run.state = 'paused_unknown'; run.runRevision++; run.terminalReason = 'worker-restart';
          await transaction.put('runs', run, run.runId);
        }
        // Upgrade pre-binding leases from their original authority-issued run.
        // Preserve terminal/retirement facts and never resume execution.
        await lease(transaction, run);
      }
      return {replayed: 0};
    });
  }
  return Object.freeze({commitControllerScript, getControllerScript, listControllerScripts, tombstoneControllerScript, garbageCollectControllerScript,
    startControllerRun, controllerOperation, stopControllerRun,
    finishControllerRun, snapshotControllerRun, retireControllerTarget, loseControllerHost, invalidateControllerTarget, recoverControllers});
}
