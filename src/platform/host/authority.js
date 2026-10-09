import {CONTRACT_VERSION, CONTRACT_HASH, FoundationError, invariant, newId, digest, canonical,
  sameIdentity, validate, projectRun, terminalStates, iso} from '../protocol.js';
import {isToolSender, httpUrl, permissionPattern} from '../../environment.js';
import {commandKey, commandRecordKey} from '../journal.js';
import {sdkMethods} from './sdk-methods.js';
import {controllerMethods} from './controller-methods.js';
import {taskMethods} from '../tasks/service.js';

// IDB commit order, rather than a worker-local mutex, orders stop/dispatch/seal.
export function createRunAuthority({storage, api, session, entitlement, validatePlan, clock = {now: () => Date.now()}}) {
  const now = () => iso(clock);
  function tool(sender) { invariant(isToolSender(api, sender), 'E_OWNER', 'Only an actual packaged tool document may own a run'); }
  const toolIdentity = () => ({namespace:`tool:${api.runtime.id}`,principal:`extension-tool:${api.runtime.id}`});
  async function assertHost(sender, registrationId) {
    tool(sender);
    return storage.transaction(['commandJournal'], 'readonly', async tx => {
      const rows = registrationId ? [await tx.get('commandJournal', `host:${registrationId}`)] : await tx.all('commandJournal');
      const host = rows.find(row => row?.tag === 'host' && row.hostDocumentId === sender.documentId && row.active && row.browserSessionIncarnation === session);
      invariant(host && host.hostUrl === sender.url, 'E_OWNER', 'Host registration has expired or belongs to another document');
      // Stable identity is derived from the actual extension, never a payload
      // namespace. It also upgrades old registered hosts after worker restart.
      return {...host,...toolIdentity()};
    });
  }
  async function currentHost(tx, host, sender) {
    const current = await tx.get('commandJournal', `host:${host.registrationId}`);
    invariant(current?.active && !current.revoked && current.hostDocumentId === sender.documentId &&
      current.hostUrl === sender.url && current.hostInstanceId === host.hostInstanceId &&
      current.browserSessionIncarnation === session, 'E_OWNER', 'Host changed before transaction commit');
    return current;
  }
  async function admitIdentity(tx, identity, sender, {ignoreRevision = false, allowSettled = false} = {}) {
    tool(sender); validate('Identity', identity);
    const run = await tx.get('runs', identity.runId);
    invariant(run && !run.tombstoned, 'E_TOMBSTONE', 'Run has been deleted');
    const host = await tx.get('commandJournal', `host:${run.registrationId}`);
    invariant(host?.active && host.hostDocumentId === sender.documentId && host.hostInstanceId === identity.hostInstanceId &&
      host.browserSessionIncarnation === session && run.browserSessionIncarnation === session, 'E_OWNER', 'Run owner/session is fenced');
    invariant(run.ownerEpoch === identity.ownerEpoch && run.hostDocumentId === sender.documentId, 'E_OWNER', 'Owner epoch differs');
    invariant(sameIdentity(run.identity, identity, {ignoreRevision}), 'E_TARGET', 'Command targets a different document or template');
    if (!ignoreRevision) invariant(run.runRevision === identity.runRevision, 'E_REVISION', 'Run revision differs');
    if (!allowSettled) invariant(!run.cancelSeq && ['preparing','running'].includes(run.state), 'E_CANCELLED', 'Run no longer admits new work');
    return run;
  }
  async function projection(runId, sender) {
    const host = await assertHost(sender);
    return storage.transaction(['runs','commandJournal','exportJobs'], 'readonly', async tx => {
      const slot = await tx.get('runs', '@slot');
      const run = runId ? await tx.get('runs', runId) : null;
      if (run) invariant(!run.tombstoned && run.registrationId === host.registrationId, 'E_OWNER', 'Projection belongs to another host');
      const commands = run ? (await tx.all('commandJournal')).filter(c => c.identity?.runId === runId && ['prepared','dispatched','effect_unknown'].includes(c.state)) : [];
      const jobs = (await tx.all('exportJobs')).filter(j => j.registrationId === host.registrationId && (!runId || j.runId === runId));
      return validate('Projection', {run: projectRun(run), pendingCommandIds: commands.map(c => c.commandId),
        exportJobIds: jobs.map(j => j.exportJobId), eventSeq: run?.eventSeq || 0, slotAvailable: !slot?.currentRunId});
    });
  }
  async function registerHost(request, sender) {
    tool(sender);
    invariant(request.claimedContractVersion === CONTRACT_VERSION && request.claimedContractHash === CONTRACT_HASH, 'E_VERSION', 'Host contract differs');
    invariant(typeof request.hostInstanceId === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(request.hostInstanceId), 'E_SCHEMA', 'Invalid host instance');
    const registrationId = await storage.transaction(['commandJournal'], 'readwrite', async tx => {
      const previous = (await tx.all('commandJournal')).find(r => r.tag === 'host' && r.hostDocumentId === sender.documentId && r.browserSessionIncarnation === session);
      if (previous) { invariant(previous.hostInstanceId === request.hostInstanceId && previous.active, 'E_OWNER', 'Document cannot replace its host identity'); return previous.registrationId; }
      const id = newId();
      await tx.put('commandJournal', {tag:'host', registrationId:id, hostInstanceId:request.hostInstanceId, hostDocumentId:sender.documentId,
        hostUrl:sender.url, hostTabId:sender.tab?.id ?? null,...toolIdentity(),browserSessionIncarnation:session, active:true, revoked:false, registeredAt:now()}, `host:${id}`);
      return id;
    });
    return validate('RegisterHostResponse', {hostDocumentId:sender.documentId, registrationId, projection:await projection(null, sender)});
  }
  async function claimRun(request, sender) {
    const host = await assertHost(sender, request.registrationId);
    const template = await storage.getTemplateByHash(request.templateHash);
    validate('TemplateRevision', template);
    const origin = httpUrl(template.startUrl).origin;
    invariant(origin === template.allowedOrigin && await api.permissions.contains({origins:[permissionPattern(origin)]}), 'E_PERMISSION', 'Formal run requires explicit origin permission');
    const snapshot = await entitlement.admitRun(template);
    validate('EntitlementSnapshot', snapshot);
    const runId = newId();
    const run = {runId, ownerEpoch:1, runRevision:1, eventSeq:0, commitSeq:0, hostInstanceId:host.hostInstanceId,
      hostDocumentId:host.hostDocumentId, templateHash:request.templateHash, state:'preparing', cancelSeq:0,
      committedCount:0, committedPages:0, storedBytes:0, checkpoint:null, target:null, entitlementSnapshot:snapshot,
      retirementState:'not-started', terminalReason:null, tombstoned:false, registrationId:host.registrationId,
      browserSessionIncarnation:session, startUrl:template.startUrl, createdAt:now(), identity:null};
    await storage.transaction(['runs','commandJournal'], 'readwrite', async tx => {
      const fresh = await tx.get('commandJournal', `host:${host.registrationId}`);
      invariant(fresh?.active, 'E_OWNER', 'Host closed before claiming');
      const slot = await tx.get('runs', '@slot');
      invariant(!slot?.currentRunId, 'E_OWNER', 'Previous target has not been retired');
      await tx.put('runs', run, runId);
      await tx.put('runs', {tag:'slot', currentRunId:runId, fencedEpoch:1, retirementId:null, releaseCount:0, state:'held'}, '@slot');
    });
    return {runId, ownerEpoch:1, runRevision:1, state:'preparing'};
  }
  async function prepareCommand(request, sender) {
    const {identity, commandId, kind, payload} = request;
    const command = {commandId, identity, kind, payload, digest:await digest({commandId,identity,kind,payload}),
      state:'prepared', preparedAt:now(), dispatchAt:null, resultDigest:null};
    validate('Command', command);
    const template = await storage.getTemplateByHash(identity.templateHash);
    if (kind === 'read-page') await validatePlan(template, payload.plan);
    else {
      invariant(template.pagination.mode === kind, 'E_SEMANTIC', 'Pagination command differs from saved template');
      invariant(payload.selector === template.pagination.selector, 'E_SEMANTIC', 'Pagination selector differs');
      invariant(payload.endMarkerSelector === template.pagination.endMarkerSelector, 'E_SEMANTIC', 'End marker differs');
      if (kind === 'next-link') invariant(httpUrl(payload.url).origin === identity.target.allowedOrigin, 'E_PERMISSION', 'Cross-origin pagination forbidden');
    }
    return storage.transaction(['runs','commandJournal','pageSnapshots'], 'readwrite', async tx => {
      const previous = await tx.get('commandJournal', commandKey(identity.runId, commandId));
      if (previous?.digest) {
        invariant(previous.digest === command.digest, 'E_HASH', 'Command ID has conflicting content');
        await admitIdentity(tx, identity, sender, {ignoreRevision:true, allowSettled:true});
        return {state:previous.state, digest:previous.digest};
      }
      await admitIdentity(tx, identity, sender);
      if (kind === 'read-page') {
        invariant(previous?.tag === 'read-reservation' && previous.snapshotId === payload.snapshotId && sameIdentity(previous.identity, identity),
          'E_SEAL_INCOMPLETE', 'Read must be reserved by beginPage');
        const page = await tx.get('pageSnapshots', payload.snapshotId);
        invariant(page && page.readCommandId === commandId && page.pageSequence === payload.pageSequence && page.pageIdentity === payload.expectedPageIdentity,
          'E_TARGET', 'Read plan differs from reserved page');
      }
      await tx.put('commandJournal', {...command, tag:'command', snapshotId:payload.snapshotId ?? null}, commandRecordKey(command));
      return {state:'prepared', digest:command.digest};
    });
  }
  async function authorizeDispatch(request, sender) {
    validate('Identity', request.identity);
    invariant(await api.permissions.contains({origins:[permissionPattern(request.identity.target.allowedOrigin)]}), 'E_PERMISSION', 'Origin permission revoked');
    const answer = await storage.transaction(['runs','commandJournal'], 'readwrite', async tx => {
      const command = await tx.get('commandJournal', commandKey(request.identity.runId, request.commandId));
      invariant(command?.tag === 'command' && sameIdentity(command.identity, request.identity), 'E_TARGET', 'Unknown command or target');
      if (command.state === 'dispatched' || command.state === 'confirmed' || command.state === 'effect_unknown') {
        await admitIdentity(tx, request.identity, sender, {ignoreRevision:true, allowSettled:true});
        return {call:false, command};
      }
      const run = await admitIdentity(tx, request.identity, sender);
      invariant(command.state === 'prepared', 'E_CANCELLED', 'Command cancelled');
      command.state = 'dispatched'; command.dispatchAt = now(); command.submissionCount = 1;
      await tx.put('commandJournal', command, commandRecordKey(command));
      if (run.state === 'preparing') { run.state = 'running'; run.eventSeq++; await tx.put('runs', run, run.runId); }
      return {call:true, command};
    });
    return answer;
  }
  async function markUnknown(command, error) {
    const key = commandRecordKey(command);
    return storage.transaction(['runs','commandJournal','pageSnapshots'], 'readwrite', async tx => {
      const command = await tx.get('commandJournal', key);
      if (!command || command.state !== 'dispatched') return;
      command.state = 'effect_unknown'; command.failure = {code:error?.code || 'E_EFFECT_UNKNOWN', message:String(error?.message || error)};
      await tx.put('commandJournal', command, key);
      const run = await tx.get('runs', command.identity.runId);
      if (run && !run.tombstoned && !terminalStates.has(run.state) && run.state !== 'retiring' && !run.cancelSeq) {
        run.state = 'paused_unknown'; run.runRevision++; run.eventSeq++; run.identity.runRevision = run.runRevision;
        await tx.put('runs', run, run.runId);
      }
    });
  }
  async function stopRun(request, sender) {
    validate('StopRequest', request);
    const host = await assertHost(sender);
    return storage.transaction(['runs','commandJournal','pageSnapshots'], 'readwrite', async tx => {
      await currentHost(tx, host, sender);
      const key = `stop:${request.runId}:${request.requestId}`;
      const old = await tx.get('commandJournal', key);
      if (old) { invariant(old.registrationId === host.registrationId && old.requestDigest === canonical(request), 'E_REVISION', 'Conflicting stop request'); return old.response; }
      const run = await tx.get('runs', request.runId);
      invariant(run && !run.tombstoned && run.registrationId === host.registrationId && run.browserSessionIncarnation === session, 'E_OWNER', 'Run belongs to another owner');
      if (!terminalStates.has(run.state) && run.state !== 'retiring' && !run.retirementId && run.state !== 'stopping') {
        invariant(run.runRevision === request.expectedRunRevision, 'E_REVISION', 'Stale stop revision');
        run.state = 'stopping'; run.cancelSeq++; run.runRevision++; run.eventSeq++;
        if (run.identity) run.identity.runRevision = run.runRevision;
        for (const c of await tx.all('commandJournal')) if (c.tag === 'command' && c.identity?.runId === run.runId && c.state === 'prepared') { c.state = 'cancelled'; await tx.put('commandJournal', c, commandRecordKey(c)); }
        for (const page of await tx.all('pageSnapshots')) if (page.runId === run.runId && !page.sealed && page.state === 'open') { page.state = 'aborted'; page.abortReason = 'E_CANCELLED'; await tx.put('pageSnapshots', page, page.snapshotId); }
        await tx.put('runs', run, run.runId);
      }
      const response = {state:run.state, cancelSeq:run.cancelSeq, runRevision:run.runRevision};
      await tx.put('commandJournal', {tag:'stop', registrationId:host.registrationId, requestDigest:canonical(request), response}, key);
      return response;
    });
  }
  async function fenceInTransaction(tx, run, terminal) {
      if (run.retirementId) return {state:run.state, retirementId:run.retirementId};
      const slot = await tx.get('runs', '@slot');
      invariant(slot?.currentRunId === run.runId, 'E_OWNER', 'Run does not own the slot');
      run.ownerEpoch++; run.runRevision++; run.eventSeq++; run.cancelSeq++; run.retirementId = newId();
      run.fencedEpoch = run.ownerEpoch; run.finalState = terminal; run.retirementState = 'fenced';
      if (!terminalStates.has(run.state)) run.state = 'retiring';
      slot.fencedEpoch = run.fencedEpoch; slot.retirementId = run.retirementId;
      for (const c of await tx.all('commandJournal')) if (c.tag === 'command' && c.identity?.runId === run.runId && c.state === 'prepared') { c.state = 'cancelled'; await tx.put('commandJournal', c, commandRecordKey(c)); }
      for (const page of await tx.all('pageSnapshots')) if (page.runId === run.runId && page.state === 'open') { page.state = 'aborted'; await tx.put('pageSnapshots', page, page.snapshotId); }
      await tx.put('runs', run, run.runId); await tx.put('runs', slot, '@slot');
      await tx.put('commandJournal', {tag:'retirement', retirementId:run.retirementId, runId:run.runId, fencedEpoch:run.fencedEpoch,
        registrationId:run.registrationId, target:run.target, creationId:run.creationId ?? null, browserSessionIncarnation:run.browserSessionIncarnation,
        state:'fenced', releaseCount:0, finalState:terminal}, `retirement:${run.retirementId}`);
      return {state:run.state, retirementId:run.retirementId};
  }
  async function fence(request, sender, terminal = 'abandoned_unknown') {
    const host = await assertHost(sender);
    return storage.transaction(['runs','commandJournal','pageSnapshots'], 'readwrite', async tx => {
      await currentHost(tx, host, sender);
      const run = await tx.get('runs', request.runId);
      invariant(run && !run.tombstoned && run.registrationId === host.registrationId, 'E_OWNER', 'Unknown run owner');
      if (run.retirementId) return {state:run.state, retirementId:run.retirementId};
      invariant(run.runRevision === request.expectedRunRevision, 'E_REVISION', 'Stale retirement revision');
      return fenceInTransaction(tx, run, terminal);
    });
  }
  async function abandonUnknown(request, sender) {
    validate('AbandonRequest', request);
    invariant(request.userExplicit === true, 'E_OWNER', 'Explicit abandonment required');
    return fence(request, sender);
  }
  async function finishRun(request, sender) {
    const host = await assertHost(sender);
    invariant(['completed','limit_reached','stopped','failed','interrupted'].includes(request.state), 'E_SCHEMA', 'Invalid terminal state');
    return storage.transaction(['runs','commandJournal','pageSnapshots','templates'], 'readwrite', async tx => {
      await currentHost(tx, host, sender);
      const run = await tx.get('runs', request.runId);
      invariant(run?.registrationId === host.registrationId && !run.tombstoned, 'E_OWNER', 'Unknown owner');
      if (run.retirementId) return {state:run.state, retirementId:run.retirementId};
      if (terminalStates.has(run.state)) return fenceInTransaction(tx, run, run.state);
      invariant(run.runRevision === request.expectedRunRevision, 'E_REVISION', 'Stale completion');
      if (request.state === 'completed') {
        invariant(!run.cancelSeq && request.naturalEnd === true, 'E_CANCELLED', 'Completion needs natural end evidence');
        invariant(run.identity && run.target && sameIdentity(run.identity.target, run.target),
          'E_TARGET', 'Completion needs an authenticated bound target');
        const snapshot = await tx.get('pageSnapshots', run.checkpoint?.lastSnapshotId ?? '');
        const template = (await tx.all('templates')).map(row => row.template || row.revisionData || row)
          .find(row => row.contentHash === run.templateHash);
        invariant(template && snapshot?.state === 'sealed' && snapshot.runId === run.runId &&
          sameIdentity(snapshot.sealIdentity, run.identity, {ignoreRevision:true}) && snapshot.immutableSealAck &&
          (template.pagination.mode === 'none' || snapshot.readEnd?.emptyEvidence === `end-marker:${template.pagination.endMarkerSelector}`),
          'E_SEAL_INCOMPLETE', 'Completion needs durable authenticated natural-end evidence');
        invariant(!(await tx.all('commandJournal')).some(c => c.identity?.runId === run.runId && ['prepared','dispatched','effect_unknown'].includes(c.state)), 'E_EFFECT_UNKNOWN', 'Unsettled commands prevent completion');
        invariant(!(await tx.all('pageSnapshots')).some(p => p.runId === run.runId && p.state === 'open'), 'E_SEAL_INCOMPLETE', 'Open page prevents completion');
      }
      run.state = run.cancelSeq ? 'stopped' : request.state; run.terminalReason = request.reason ?? null;
      run.runRevision++; run.eventSeq++; if (run.identity) run.identity.runRevision = run.runRevision;
      return fenceInTransaction(tx, run, run.state);
    });
  }
  async function loseHost(registrationId, {documentGone = false} = {}) {
    await storage.transaction(['runs','commandJournal','pageSnapshots'], 'readwrite', async tx => {
      const host = await tx.get('commandJournal', `host:${registrationId}`); if (!host) return;
      host.active = !documentGone; host.revoked = documentGone; await tx.put('commandJournal', host, `host:${registrationId}`);
      for (const run of await tx.all('runs')) if (run.tag !== 'controller-run' && run.registrationId === registrationId && !terminalStates.has(run.state) && run.state !== 'retiring') {
        if (run.retirementId) continue;
        if (!documentGone && ['stopping','paused_unknown'].includes(run.state)) continue;
        run.state = documentGone ? (run.cancelSeq ? 'stopped' : 'interrupted') : 'paused_unknown'; run.terminalReason = 'RunHost connection lost'; run.runRevision++; run.eventSeq++;
        if (run.identity) run.identity.runRevision = run.runRevision;
        if (documentGone) await fenceInTransaction(tx, run, run.state);
        else await tx.put('runs', run, run.runId);
      }
    });
    await controller.loseControllerHost(registrationId, {documentGone});
  }
  async function recover() {
    // Worker restart never creates a run or replays an authorized external effect.
    const pending = await storage.transaction(['commandJournal'], 'readonly', async tx => (await tx.all('commandJournal')).filter(c => c.tag === 'command' && c.state === 'dispatched'));
    for (const c of pending) await markUnknown(c, new FoundationError('E_EFFECT_UNKNOWN', 'Worker restart after dispatch'));
    await storage.transaction(['runs','commandJournal','pageSnapshots'], 'readwrite', async tx => {
      const slot = await tx.get('runs', '@slot');
      for (const run of await tx.all('runs')) {
        if (run.runId && run.tag !== 'controller-run' && terminalStates.has(run.state) && !run.retirementId && !run.tombstoned && slot?.currentRunId === run.runId) {
          await fenceInTransaction(tx, run, run.state);
        } else if (run.runId && run.tag !== 'sdk-service' && run.tag !== 'controller-run' && run.browserSessionIncarnation !== session && !terminalStates.has(run.state) &&
          !run.retirementId && !['retiring','stopping','paused_unknown'].includes(run.state)) {
        run.state = 'paused_unknown'; run.runRevision++; run.eventSeq++; run.terminalReason = 'cross-session-unverified';
        if (run.identity) run.identity.runRevision = run.runRevision;
        await tx.put('runs', run, run.runId);
        }
      }
    });
    await sdk.recoverSdk();
    await controller.recoverControllers();
  }
  const sdk = sdkMethods({storage,api,session,clock,assertHost,currentHost});
  const controller = controllerMethods({storage,api,session,clock,assertHost,currentHost});
  const tasks = taskMethods({storage,assertHost,currentHost,clock});
  return {...sdk, ...controller, ...tasks,
    registerHost, assertHost, admitIdentity, claimRun, prepareCommand, authorizeDispatch, markUnknown, stopRun,
    abandonUnknown, finishRun, loseHost, recover, snapshotRun:async (request,sender) => projection(request.runId ?? null,sender), projection};
}
