import {invariant, validate, canonical, newId, sameIdentity, PROTOCOL} from '../protocol.js';

const stores = ['runs', 'commandJournal'];
const liveStates = new Set(['preparing', 'running']);
const now = () => new Date().toISOString();
const key = id => `target-create:${id}`;

export async function sessionIncarnation(session) {
  const value = typeof session === 'function' ? await session() : await session;
  const id = typeof value === 'string' ? value : typeof value?.get === 'function' ? await value.get() : value?.browserSessionIncarnation;
  invariant(typeof id === 'string' && id.length > 0, 'E_TARGET', 'Trusted browser session is required');
  return id;
}

export function authenticatedDocument(api, sender) {
  invariant(sender?.id === api.runtime.id && Number.isSafeInteger(sender.tab?.id) && sender.tab.id >= 0 &&
    sender.frameId === 0 && typeof sender.documentId === 'string' && sender.documentId.length > 0,
  'E_TARGET', 'Actual extension/top-frame/tab/document sender required');
  return {tabId: sender.tab.id, frameId: 0, documentId: sender.documentId};
}

export function httpUrl(value) {
  let url;
  try { url = new URL(value); } catch { invariant(false, 'E_TARGET', 'Invalid document URL'); }
  invariant(['https:', 'http:'].includes(url.protocol) && !url.username && !url.password, 'E_TARGET', 'HTTP(S) URL required');
  url.hash = '';
  return url;
}

export async function requireGrant(api, origin) {
  const url = httpUrl(origin);
  invariant(await api.permissions.contains({origins: [`${url.protocol}//${url.hostname}/*`]}), 'E_PERMISSION', 'Formal execution requires an optional origin grant');
}

// Shared native observation for generic controllers. Selection is explicit;
// neither this helper nor its callers resolve the active tab.
export async function observeControllerTarget({api, tabId, frameId = 0, documentId, allowExtensionUrl = null}) {
  invariant(Number.isSafeInteger(tabId) && tabId >= 0 && Number.isSafeInteger(frameId) && frameId >= 0, 'E_TARGET');
  const tab = await api.tabs.get(tabId);
  invariant(tab && tab.incognito === false, 'E_TARGET', 'A normal selected tab is required');
  const frames = await api.webNavigation.getAllFrames({tabId});
  let frame = frames?.find(value => value.frameId === frameId && (!documentId || value.documentId === documentId));
  // webNavigation does not enumerate every extension bootstrap document.
  // runtime.getContexts is the same native extension-document observer used
  // by the unique broker for hostGone, never a payload identity fallback.
  if (!frame && allowExtensionUrl !== null && frameId === 0 && typeof api.runtime.getContexts === 'function') {
    const contexts = await api.runtime.getContexts({});
    const exact = contexts.filter(value => value.tabId === tabId && value.frameId === 0 && value.documentUrl === allowExtensionUrl &&
      (!documentId || value.documentId === documentId));
    if (exact.length === 1) frame = {frameId: 0, documentId: exact[0].documentId, url: exact[0].documentUrl};
  }
  invariant(frame && !frame.errorOccurred && (!frame.documentLifecycle || frame.documentLifecycle === 'active') &&
    typeof frame.documentId === 'string' && frame.documentId, 'E_DOCUMENT_REPLACED', 'Selected frame document is no longer current');
  if (allowExtensionUrl !== null) {
    invariant(frameId === 0 && frame.url === allowExtensionUrl && tab.url === allowExtensionUrl, 'E_TARGET', 'Owned bootstrap URL differs');
    return {tabId, frameId: 0, documentId: frame.documentId, url: frame.url};
  }
  const url = httpUrl(frame.url);
  invariant(frameId === 0 ? httpUrl(tab.url).origin === url.origin && (!tab.pendingUrl || httpUrl(tab.pendingUrl).origin === url.origin) : !tab.pendingUrl,
    'E_DOCUMENT_REPLACED', 'Selected tab is navigating outside its document');
  await requireGrant(api, url.origin);
  const root = frames.find(value => value.frameId === 0);
  invariant(root && typeof root.documentId === 'string' && root.documentId, 'E_DOCUMENT_REPLACED');
  return {tabId, frameId, documentId: frame.documentId, url: frame.url, allowedOrigin: url.origin,
    ...(frameId > 0 ? {rootDocumentId: root.documentId} : {})};
}

export async function verifyControllerTarget({api, target}) {
  invariant(Number.isSafeInteger(target?.frameId) && target.frameId >= 0, 'E_TARGET');
  const observed = await observeControllerTarget({api, tabId: target.tabId, frameId: target.frameId, documentId: target.documentId});
  invariant(observed.allowedOrigin === target.allowedOrigin, 'E_TARGET', 'Controller origin differs');
  if (target.rootDocumentId) invariant(target.rootDocumentId === observed.rootDocumentId, 'E_DOCUMENT_REPLACED');
  return observed;
}

function hostMatches(run, host) {
  invariant(host && !host.revoked && run.registrationId === host.registrationId &&
    run.hostDocumentId === host.hostDocumentId && run.hostInstanceId === host.hostInstanceId,
  'E_OWNER', 'Registered host does not own run');
}

function creationResponse(intent, run) {
  return validate('CreateTargetResponse', {creationId: intent.creationId, state: intent.state, target: run.target ?? null});
}

export function createTargetService({storage, api, session, assertHost}) {
  const transaction = (mode, callback) => storage.transaction(stores, mode, callback);

  async function currentHost(tx, run, host) {
    const stored = await tx.get('commandJournal', `host:${host.registrationId}`);
    hostMatches(run, stored);
    invariant(stored.hostDocumentId === host.hostDocumentId, 'E_OWNER');
  }

  async function requireLive(tx, run, incarnation, epoch) {
    const slot = await tx.get('runs', '@slot');
    invariant(run && slot?.currentRunId === run.runId, 'E_OWNER');
    invariant(run.browserSessionIncarnation === incarnation && (!epoch || run.ownerEpoch === epoch), 'E_TARGET');
    invariant(liveStates.has(run.state) && !run.retirementId && (run.cancelSeq ?? 0) === 0, 'E_CANCELLED');
    return slot;
  }

  async function freeze(creationId, reason) {
    return transaction('readwrite', async tx => {
      const intent = await tx.get('commandJournal', key(creationId));
      if (!intent || intent.state === 'retired') return;
      intent.state = 'effect_unknown';
      intent.unknownReason = reason;
      if (intent.navigationState === 'dispatched') intent.navigationState = 'effect_unknown';
      await tx.put('commandJournal', intent, key(creationId));
      const run = await tx.get('runs', intent.runId);
      if (run && liveStates.has(run.state)) {
        run.state = 'paused_unknown';
        run.runRevision++;
        if (run.identity) run.identity.runRevision = run.runRevision;
        await tx.put('runs', run, run.runId);
      }
    });
  }

  async function createTarget(request, sender) {
    validate('CreateTargetRequest', request);
    const host = await assertHost(sender, request.registrationId);
    const incarnation = await sessionIncarnation(session);
    const creationId = newId();
    const prepared = await transaction('readwrite', async tx => {
      const run = await tx.get('runs', request.runId);
      await currentHost(tx, run, host);
      if (run.creationId) {
        const existing = await tx.get('commandJournal', key(run.creationId));
        if (existing) {
          invariant(existing.requestId === request.requestId, 'E_TARGET', 'A run has exactly one creation intent');
          return {intent: existing, run, duplicate: true};
        }
      }
      await requireLive(tx, run, incarnation);
      invariant(run.runRevision === request.expectedRunRevision, 'E_OWNER');
      const id = run.creationId || creationId;
      const intent = {tag: 'target-create', creationId: id, runId: run.runId, ownerEpoch: run.ownerEpoch,
        browserSessionIncarnation: incarnation, bootstrapUrl: api.runtime.getURL(`ui/target-bootstrap.html?creationId=${encodeURIComponent(id)}`),
        startUrl: run.startUrl, state: 'prepared', submissionCount: 0, createdAt: now(), dispatchAt: null,
        knownTabId: null, knownDocumentId: null, candidateTabIds: [], retirementId: null,
        navigationState: 'not-admitted', navigationSubmissionCount: 0, navigationDispatchAt: null,
        requestId: request.requestId, registrationId: host.registrationId, cancelSeq: run.cancelSeq ?? 0};
      httpUrl(intent.startUrl);
      run.creationId = id;
      await tx.put('runs', run, run.runId);
      await tx.put('commandJournal', intent, key(id));
      return {intent, run, duplicate: false};
    });
    if (prepared.duplicate && prepared.intent.state !== 'prepared') return creationResponse(prepared.intent, prepared.run);
    await requireGrant(api, httpUrl(prepared.intent.startUrl).origin);
    const intent = await transaction('readwrite', async tx => {
      const value = await tx.get('commandJournal', key(prepared.intent.creationId));
      const run = await tx.get('runs', value.runId);
      await currentHost(tx, run, host);
      await requireLive(tx, run, incarnation, value.ownerEpoch);
      invariant(value.state === 'prepared' && value.submissionCount === 0, 'E_TARGET');
      value.state = 'dispatched'; value.submissionCount = 1; value.dispatchAt = now();
      await tx.put('commandJournal', value, key(value.creationId));
      return value;
    });
    // Only this invocation receives the dispatch authorization. Reconciliation never replays it.
    try {
      const tab = await api.tabs.create({url: intent.bootstrapUrl, active: false});
      invariant(Number.isSafeInteger(tab?.id), 'E_TARGET');
      await transaction('readwrite', async tx => {
        const value = await tx.get('commandJournal', key(intent.creationId));
        invariant(!value.callbackTabId || value.callbackTabId === tab.id, 'E_TARGET');
        if (value.knownTabId !== null) invariant(value.knownTabId === tab.id, 'E_TARGET');
        value.callbackTabId = tab.id;
        if (!value.candidateTabIds.includes(tab.id)) value.candidateTabIds.push(tab.id);
        await tx.put('commandJournal', value, key(value.creationId));
      });
    } catch (error) { await freeze(intent.creationId, `create:${error.code || error.message}`); }
    return transaction('readonly', async tx => creationResponse(await tx.get('commandJournal', key(intent.creationId)), await tx.get('runs', intent.runId)));
  }

  async function reconcileTargetCreation(request, sender) {
    validate('ReconcileTargetCreationRequest', request);
    const host = await assertHost(sender);
    const incarnation = await sessionIncarnation(session);
    const intent = await transaction('readonly', async tx => {
      const value = await tx.get('commandJournal', key(request.creationId));
      invariant(value, 'E_TARGET'); await currentHost(tx, await tx.get('runs', value.runId), host); return value;
    });
    // Exact URL discovery supplies candidates, never document authority.
    let candidates = [];
    if (intent.browserSessionIncarnation === incarnation) {
      try { candidates = (await api.tabs.query({})).filter(tab => tab.url === intent.bootstrapUrl).map(tab => tab.id); }
      catch { /* A failed observation is not evidence of absence. */ }
    }
    await transaction('readwrite', async tx => {
      const value = await tx.get('commandJournal', key(intent.creationId));
      value.candidateTabIds = [...new Set([...value.candidateTabIds, ...candidates])];
      await tx.put('commandJournal', value, key(value.creationId));
    });
    if (intent.state === 'dispatched' || (intent.navigationState === 'dispatched' && !intent.knownAgentDocumentId)) await freeze(intent.creationId, 'dispatch-gap');
    return transaction('readonly', async tx => creationResponse(await tx.get('commandJournal', key(intent.creationId)), await tx.get('runs', intent.runId)));
  }

  async function bootstrapReady(message, sender) {
    message = message.payload || message;
    const document = authenticatedDocument(api, sender);
    invariant(typeof message.creationId === 'string', 'E_TARGET');
    const incarnation = await sessionIncarnation(session);
    const observed = await transaction('readonly', tx => tx.get('commandJournal', key(message.creationId)));
    if (observed && observed.browserSessionIncarnation !== incarnation) {
      const exact = (await api.tabs.query({})).filter(tab => tab.url === observed.bootstrapUrl);
      invariant(exact.length === 1 && exact[0].id === document.tabId, 'E_TARGET', 'Restored bootstrap nonce must be unique');
    }
    const registered = await transaction('readwrite', async tx => {
      const intent = await tx.get('commandJournal', key(message.creationId));
      invariant(intent && sender.url === intent.bootstrapUrl && intent.submissionCount === 1, 'E_TARGET');
      invariant(intent.knownTabId === null || intent.knownTabId === document.tabId || intent.browserSessionIncarnation !== incarnation, 'E_TARGET');
      if (intent.browserSessionIncarnation === incarnation && intent.knownDocumentId !== null) invariant(intent.knownDocumentId === document.documentId, 'E_TARGET');
      const run = await tx.get('runs', intent.runId);
      invariant(run, 'E_TARGET');
      const rebound = intent.browserSessionIncarnation !== incarnation;
      if (rebound) {
        // A restored exact nonce grants retirement ownership only, never business execution.
        intent.reboundSession = incarnation;
        intent.reboundTabId = document.tabId;
        intent.reboundDocumentId = document.documentId;
      } else {
        if (intent.callbackTabId !== undefined) invariant(intent.callbackTabId === document.tabId, 'E_TARGET');
        intent.knownTabId = document.tabId; intent.knownDocumentId = document.documentId;
        if (intent.state !== 'retired') intent.state = 'known';
      }
      if (run.retirementId) intent.retirementId = run.retirementId;
      await tx.put('commandJournal', intent, key(intent.creationId));
      return {intent, run, rebound};
    });
    if (message.phase !== 'navigate') return {ok: true, known: true, navigate: false, retirementOnly: registered.rebound || !!registered.run.retirementId};
    invariant(!registered.rebound, 'E_TARGET', 'Restored nonce only authorizes retirement');
    await requireGrant(api, httpUrl(registered.intent.startUrl).origin);
    return transaction('readwrite', async tx => {
      const intent = await tx.get('commandJournal', key(message.creationId));
      const run = await tx.get('runs', intent.runId);
      await requireLive(tx, run, incarnation, intent.ownerEpoch);
      const host = await tx.get('commandJournal', `host:${run.registrationId}`); hostMatches(run, host);
      invariant(intent.knownTabId === document.tabId && intent.knownDocumentId === document.documentId, 'E_TARGET');
      if (intent.navigationSubmissionCount !== 0) return {ok: true, navigate: false, state: intent.navigationState};
      invariant(intent.navigationState === 'not-admitted' && intent.state === 'known', 'E_TARGET');
      intent.navigationState = 'dispatched'; intent.navigationSubmissionCount = 1; intent.navigationDispatchAt = now();
      await tx.put('commandJournal', intent, key(intent.creationId));
      return {ok: true, navigate: true, creationId: intent.creationId, startUrl: intent.startUrl};
    });
  }

  async function agentReady(message, sender) {
    const document = authenticatedDocument(api, sender);
    const url = httpUrl(sender.url);
    const incarnation = await sessionIncarnation(session);
    const candidate = await transaction('readonly', async tx => {
      const values = await tx.all('commandJournal');
      const matches = values.filter(value => value.tag === 'target-create' && value.knownTabId === document.tabId && value.browserSessionIncarnation === incarnation && value.state !== 'retired');
      invariant(matches.length === 1, 'E_TARGET', 'Exact owned creation is required');
      return matches[0];
    });
    await requireGrant(api, url.origin);
    return transaction('readwrite', async tx => {
      const intent = await tx.get('commandJournal', key(candidate.creationId));
      const run = await tx.get('runs', intent.runId);
      await requireLive(tx, run, incarnation, intent.ownerEpoch);
      invariant(url.origin === httpUrl(intent.startUrl).origin, 'E_TARGET');
      invariant(intent.navigationSubmissionCount === 1, 'E_TARGET');
      const old = run.target;
      if (old?.documentId === document.documentId) return {ok: true, target: old, identity: run.identity};
      if (old) {
        const commands = await tx.all('commandJournal');
        invariant(commands.some(c => c.identity?.runId === run.runId && ['next-link', 'next-button'].includes(c.kind) &&
          ['dispatched', 'effect_unknown'].includes(c.state) && sameIdentity(c.identity, run.identity, {ignoreRevision: true})), 'E_TARGET', 'Unadmitted document change');
      } else invariant(url.href === httpUrl(intent.startUrl).href, 'E_TARGET', 'Initial document must match start URL');
      const target = {targetSessionId: old?.targetSessionId || newId(), ...document, allowedOrigin: url.origin,
        targetVersion: (old?.targetVersion || 0) + 1, browserSessionIncarnation: incarnation, creationId: intent.creationId};
      validate('Target', target);
      run.target = target; run.runRevision++; run.state = 'running';
      run.identity = {runId: run.runId, hostInstanceId: run.hostInstanceId, hostDocumentId: run.hostDocumentId,
        ownerEpoch: run.ownerEpoch, runRevision: run.runRevision, templateHash: run.templateHash, target};
      validate('Identity', run.identity);
      intent.navigationState = 'confirmed'; intent.knownAgentDocumentId = document.documentId;
      await tx.put('runs', run, run.runId); await tx.put('commandJournal', intent, key(intent.creationId));
      return {ok: true, target, identity: run.identity};
    });
  }

  async function bindTarget(request, sender) {
    const host = await assertHost(sender, request.registrationId);
    const incarnation = await sessionIncarnation(session);
    const binding = await transaction('readonly', async tx => {
      const run = await tx.get('runs', request.runId);
      await currentHost(tx, run, host); await requireLive(tx, run, incarnation);
      invariant(request.expectedRunRevision === undefined || request.expectedRunRevision === run.runRevision, 'E_OWNER');
      const intent = await tx.get('commandJournal', key(run.creationId));
      invariant(intent?.knownTabId !== null && intent?.navigationSubmissionCount === 1, 'E_TARGET');
      return {run, intent};
    });
    await requireGrant(api, httpUrl(binding.intent.startUrl).origin);
    if (!binding.run.target) await api.scripting.executeScript({target: {tabId: binding.intent.knownTabId, frameIds: [0]}, world: 'ISOLATED', files: ['agents/page-agent.js']});
    return transaction('readonly', async tx => {
      const run = await tx.get('runs', request.runId); await currentHost(tx, run, host);
      invariant(run.target && run.browserSessionIncarnation === incarnation, 'E_TARGET', 'Await authenticated agent handshake');
      return {target: run.target, identity: run.identity, runRevision: run.runRevision};
    });
  }

  async function validateAgentSender(identity, sender) {
    validate('Identity', identity);
    const document = authenticatedDocument(api, sender);
    const incarnation = await sessionIncarnation(session);
    const url = httpUrl(sender.url);
    invariant(identity.target.browserSessionIncarnation === incarnation && identity.target.tabId === document.tabId &&
      identity.target.documentId === document.documentId && identity.target.frameId === document.frameId && identity.target.allowedOrigin === url.origin, 'E_TARGET');
    return transaction('readonly', async tx => {
      const run = await tx.get('runs', identity.runId);
      invariant(run && !run.retirementId && run.ownerEpoch === identity.ownerEpoch && sameIdentity(run.identity, identity, {ignoreRevision: true}), 'E_TARGET');
      const host = await tx.get('commandJournal', `host:${run.registrationId}`); hostMatches(run, host);
      return run;
    });
  }

  async function retireTarget({retirementId}, sender) {
    const host = await assertHost(sender);
    return retireOwnedTarget(retirementId, host);
  }
  async function retireOwnedTarget(retirementId, host) {
    const incarnation = await sessionIncarnation(session);
    const retirementKey = `retirement:${retirementId}`;
    const prepared = await transaction('readwrite', async tx => {
      const old = await tx.get('commandJournal', retirementKey);
      if (old?.releaseResult) { if (host) invariant(old.registrationId === host.registrationId, 'E_OWNER'); return {old}; }
      const runs = await tx.all('runs');
      const run = runs.find(r => r.runId && r.retirementId === retirementId);
      invariant(run && !run.tombstoned, 'E_TARGET');
      if (host) await currentHost(tx, run, host);
      else invariant(old?.tag === 'retirement' && old.runId === run.runId && old.registrationId === run.registrationId &&
        old.fencedEpoch === run.fencedEpoch && run.cancelSeq > 0,
        'E_OWNER', 'Internal reconciliation requires an already committed retirement fence');
      const slot = await tx.get('runs', '@slot');
      invariant(slot?.currentRunId === run.runId && slot.retirementId === retirementId && slot.fencedEpoch === run.fencedEpoch && slot.releaseCount === 0, 'E_OWNER');
      const intent = await tx.get('commandJournal', key(run.creationId));
      invariant(intent, 'E_TARGET', 'Missing creation intent is not never-created evidence');
      const evidence = old || {tag: 'retirement', retirementId, runId: run.runId, fencedEpoch: run.fencedEpoch,
        registrationId: run.registrationId, creationId: intent.creationId, releaseCount: 0, fencedAt: now()};
      intent.retirementId = retirementId;
      await tx.put('commandJournal', intent, key(intent.creationId));
      await tx.put('commandJournal', evidence, retirementKey);
      return {run, intent, evidence};
    });
    if (prepared.old) return prepared.old.releaseResult;
    const {run, intent} = prepared;
    const neverCreated = intent.submissionCount === 0 && intent.dispatchAt === null && ['prepared', 'cancelled'].includes(intent.state);
    const rebound = intent.reboundSession === incarnation;
    const sameSession = intent.browserSessionIncarnation === incarnation;
    const tabId = rebound ? intent.reboundTabId : intent.knownTabId ?? intent.callbackTabId;
    let absence = neverCreated ? 'cancelled-before-create-dispatch' : null;
    if (!neverCreated && (!sameSession && !rebound || !Number.isSafeInteger(tabId))) return {retirementId, state: 'pending', reason: !sameSession && !rebound ? 'cross-session-unverified' : 'creation-unknown'};
    if (!absence) {
      // The registration is fenced before this exact, same-session remove. A remove error alone proves nothing.
      await transaction('readonly', async tx => {
        const current = await tx.get('runs', run.runId);
        const value = await tx.get('commandJournal', key(intent.creationId));
        invariant(current.retirementId === retirementId && current.fencedEpoch === run.fencedEpoch &&
          (value.browserSessionIncarnation === incarnation || value.reboundSession === incarnation), 'E_TARGET');
      });
      try { await api.tabs.remove(tabId); } catch { /* Verify absence separately. */ }
      try { await api.tabs.get(tabId); return {retirementId, state: 'pending', reason: 'tab-still-present'}; }
      catch (error) {
        invariant(/No tab with id|Invalid tab ID|tab not found/i.test(error?.message || ''), 'E_TARGET', 'Query failure is not absence');
        absence = rebound ? 'unique-bootstrap-current-session-removed' : 'tabs.get-not-found';
      }
    }
    return transaction('readwrite', async tx => {
      const evidence = await tx.get('commandJournal', retirementKey);
      if (evidence.releaseResult) return evidence.releaseResult;
      const current = await tx.get('runs', run.runId);
      const slot = await tx.get('runs', '@slot');
      invariant(current.retirementId === retirementId && current.fencedEpoch === evidence.fencedEpoch &&
        slot?.currentRunId === run.runId && slot.fencedEpoch === evidence.fencedEpoch && slot.retirementId === retirementId && slot.releaseCount === 0, 'E_OWNER');
      evidence.targetAbsenceAt = now(); evidence.targetAbsenceEvidence = absence; evidence.releaseCount = 1;
      evidence.slotReleasedAt = now(); evidence.releaseId = newId();
      evidence.releaseResult = {retirementId, state: 'released', releaseId: evidence.releaseId, releaseCount: 1};
      current.retirementState = 'released';
      if (current.state === 'retiring') current.state = current.finalState || 'abandoned_unknown';
      current.runRevision++; if (current.identity) current.identity.runRevision = current.runRevision;
      const value = await tx.get('commandJournal', key(intent.creationId)); value.state = 'retired';
      await tx.put('commandJournal', value, key(intent.creationId));
      await tx.put('commandJournal', evidence, retirementKey);
      await tx.put('runs', current, current.runId);
      await tx.put('runs', {...slot, currentRunId: null, state: 'available', releaseCount: 1}, '@slot');
      return evidence.releaseResult;
    });
  }
  async function reconcileRetirements() {
    const pending = await transaction('readonly', async tx => (await tx.all('commandJournal'))
      .filter(row => row.tag === 'retirement' && !row.releaseResult));
    const results = [];
    for (const row of pending) {
      try { results.push(await retireOwnedTarget(row.retirementId, null)); }
      catch (error) { results.push({retirementId:row.retirementId, state:'pending', reason:error.code || 'E_TARGET'}); }
    }
    return results;
  }

  async function invalidateTab(tabId) {
    return transaction('readwrite', async tx => {
      for (const run of await tx.all('runs')) {
        if (run.target?.tabId !== tabId || !liveStates.has(run.state)) continue;
        run.state = 'paused_unknown'; run.runRevision++;
        if (run.identity) run.identity.runRevision = run.runRevision;
        await tx.put('runs', run, run.runId);
      }
    });
  }

  return Object.freeze({createTarget, reconcileTargetCreation, bootstrapReady, agentReady, bindTarget, retireTarget,
    reconcileRetirements, validateAgentSender, invalidateTab});
}
