import {invariant, validate, canonical, digest, newId, sameIdentity, BUDGETS, PROTOCOL, CONTRACT_VERSION} from '../protocol.js';
import {authenticatedDocument, httpUrl, requireGrant, sessionIncarnation} from '../target/index.js';
import {createSourcePort} from './source.js';

const bytes = value => new TextEncoder().encode(canonical(value)).byteLength;
export async function validatePlan(template, plan) {
  validate('TemplateRevision', template); validate('RulePlan', plan);
  const {contentHash, ...content} = template;
  const {planHash, ...planContent} = plan;
  invariant(await digest(content) === contentHash && await digest(planContent) === planHash, 'E_HASH');
  invariant(plan.templateHash === contentHash && plan.contractVersion === CONTRACT_VERSION && plan.compilerVersion === CONTRACT_VERSION, 'E_HASH');
  invariant(canonical(plan.capabilities) === canonical(template.requiredCapabilities), 'E_CAPABILITY');
  for (const field of ['list', 'fields', 'pagination', 'columns', 'limits']) {
    invariant(canonical(plan[field]) === canonical(template[field]), 'E_SEMANTIC', `Plan ${field} differs from immutable template`);
  }
  const required = new Set(['dom.top.v1', 'transform.safe.v1', `pagination.${template.pagination.mode}.v1`]);
  for (const field of template.fields) required.add(`read.${field.read}.v1`);
  invariant(required.size === plan.capabilities.length && plan.capabilities.every(c => required.has(c)), 'E_CAPABILITY');
  invariant(new Set(template.columns).size === template.fields.length && template.columns.every(id => template.fields.some(f => f.id === id)), 'E_SEMANTIC');
  invariant(httpUrl(template.startUrl).origin === template.allowedOrigin, 'E_TARGET');
  return plan;
}

export function createPagePortService({storage, api, session, targetService, assertHost, emitToHost, admitIdentity}) {
  const stores = ['runs', 'commandJournal', 'templates', 'records', 'pageSnapshots'];
  const tx = (mode, callback) => storage.transaction(stores, mode, callback);
  const source = createSourcePort({storage, api, session, assertHost, emitToHost, validatePlan});

  async function registered(tx, run) {
    const host = await tx.get('commandJournal', `host:${run.registrationId}`);
    invariant(host && !host.revoked && host.hostDocumentId === run.hostDocumentId && host.hostInstanceId === run.hostInstanceId, 'E_OWNER');
    return host;
  }

  async function templateFor(tx, command) {
    const values = await tx.all('templates');
    const matches = values.map(v => v.template || v.revisionData || v).filter(v => v.contentHash === command.identity.templateHash);
    invariant(matches.length > 0 && matches.every(v => canonical(v) === canonical(matches[0])), 'E_HASH', 'Immutable template not found');
    return matches[0];
  }

  async function executeCommand(command) {
    // Strip no caller fields here: input must be the public frozen Command, not arbitrary code.
    validate('Command', command);
    invariant(command.state === 'dispatched', 'E_EFFECT_UNKNOWN', 'Commit dispatch before external invocation');
    invariant(await digest({commandId: command.commandId, identity: command.identity, kind: command.kind, payload: command.payload}) === command.digest, 'E_HASH');
    const incarnation = await sessionIncarnation(session);
    await requireGrant(api, command.identity.target.allowedOrigin);
    const authorization = await tx('readonly', async t => {
      const stored = await t.get('commandJournal', command.commandId);
      invariant(stored?.state === 'dispatched' && stored.digest === command.digest && sameIdentity(stored.identity, command.identity), 'E_EFFECT_UNKNOWN');
      const run = await t.get('runs', command.identity.runId);
      invariant(run && !run.retirementId && sameIdentity(run.identity, command.identity, {ignoreRevision: true}) && run.browserSessionIncarnation === incarnation, 'E_TARGET');
      await registered(t, run);
      return {template: await templateFor(t, command), run};
    });
    if (command.kind === 'read-page') await validatePlan(authorization.template, command.payload.plan);
    else {
      const pagination = authorization.template.pagination;
      invariant(command.kind === pagination.mode && command.payload.selector === pagination.selector && command.payload.endMarkerSelector === pagination.endMarkerSelector, 'E_SEMANTIC');
      if (command.kind === 'next-link') {
        invariant(command.payload.waitMs === pagination.waitMs && httpUrl(command.payload.url).origin === command.identity.target.allowedOrigin, 'E_TARGET');
      } else invariant(command.payload.userConfirmed === pagination.userConfirmed && command.payload.postcondition === pagination.postcondition.kind && command.payload.timeoutMs === pagination.postcondition.timeoutMs, 'E_SEMANTIC');
    }
    const admitted = await tx('readwrite', async t => {
      const stored = await t.get('commandJournal', command.commandId);
      const run = await t.get('runs', command.identity.runId);
      invariant(stored?.state === 'dispatched' && stored.digest === command.digest && run && !run.retirementId &&
        sameIdentity(run.identity, command.identity, {ignoreRevision: true}), 'E_TARGET');
      await registered(t, run);
      const key = `page-submit:${command.commandId}`;
      if (await t.get('commandJournal', key)) return false;
      await t.put('commandJournal', {tag: 'page-submit', commandId: command.commandId, digest: command.digest,
        browserSessionIncarnation: incarnation, submissionCount: 1, state: 'dispatched', dispatchAt: new Date().toISOString()}, key);
      return true;
    });
    if (!admitted) return {commandId: command.commandId, state: 'effect_unknown', duplicate: true};
    // Do not await a DOM read, navigation, or core loop. Only the fixed agent's immediate receipt is awaited.
    try {
      const target = command.identity.target;
      await api.scripting.executeScript({target: {tabId: target.tabId, documentIds: [target.documentId]}, world: 'ISOLATED', files: ['agents/page-agent.js']});
      await api.tabs.sendMessage(target.tabId, {protocol: PROTOCOL, type: 'PAGE_EXECUTE', payload: command}, {documentId: target.documentId, frameId: 0});
      return {commandId: command.commandId, state: 'dispatched', duplicate: false};
    } catch (error) {
      await tx('readwrite', async t => {
        const value = await t.get('commandJournal', `page-submit:${command.commandId}`);
        value.state = 'effect_unknown'; value.errorCode = error.code || 'E_TARGET';
        await t.put('commandJournal', value, `page-submit:${command.commandId}`);
      });
      return {commandId: command.commandId, state: 'effect_unknown', duplicate: false};
    }
  }

  async function handleAgentMessage(message, sender) {
    invariant(message?.protocol === PROTOCOL, 'E_VERSION');
    if (message.type === 'AGENT_READY' || message.type.startsWith('SOURCE_')) return source.handleAgentMessage(message, sender);
    invariant(['PAGE_DATA', 'PAGE_END', 'PAGE_EFFECT', 'PAGE_ERROR'].includes(message.type), 'E_SCHEMA');
    const frame = message.payload;
    const identity = frame?.identity;
    const run = await targetService.validateAgentSender(identity, sender);
    const document = authenticatedDocument(api, sender);
    const pageIdentity = httpUrl(sender.url).href;
    if (message.type === 'PAGE_DATA') {
      validate('PageReadData', frame);
      invariant(bytes(frame) <= BUDGETS.maxRawFrameBytes, 'E_LIMIT');
      invariant(await digest({snapshotId: frame.snapshotId, frameIndex: frame.frameIndex, rowStart: frame.rowStart, rawRows: frame.rawRows}) === frame.digest, 'E_HASH');
    } else if (message.type === 'PAGE_END') {
      validate('PageReadEnd', frame);
      invariant(frame.pageIdentity === pageIdentity, 'E_TARGET');
      const base = httpUrl(frame.documentBaseURI); invariant(base.origin === identity.target.allowedOrigin, 'E_TARGET');
    } else {
      invariant(typeof frame.commandId === 'string' && frame.identity && bytes(frame) <= BUDGETS.maxRawFrameBytes, 'E_SCHEMA');
      invariant(frame.pageIdentity === pageIdentity, 'E_TARGET');
    }
    const frameDigest = await digest(frame);
    const outcome = await tx('readwrite', async t => {
      const current = await t.get('runs', identity.runId);
      invariant(current && !current.retirementId && sameIdentity(current.identity, identity, {ignoreRevision: true}), 'E_TARGET');
      await registered(t, current);
      const command = await t.get('commandJournal', frame.commandId);
      invariant(command && ['dispatched', 'effect_unknown'].includes(command.state) && sameIdentity(command.identity, identity, {ignoreRevision: true}), 'E_OWNER');
      if (message.type === 'PAGE_DATA' || message.type === 'PAGE_END') {
        invariant(current.state === 'running' && (current.cancelSeq ?? 0) === 0, 'E_CANCELLED');
        invariant(command.kind === 'read-page' && frame.snapshotId === command.payload.snapshotId, 'E_TARGET');
        const page = await t.get('pageSnapshots', frame.snapshotId);
        invariant(page && page.readCommandId === command.commandId && page.state === 'open', 'E_TARGET');
        const plan = command.payload.plan;
        const rawKey = `page-raw:${command.commandId}`;
        const raw = await t.get('commandJournal', rawKey) || {tag: 'page-raw', commandId: command.commandId, frames: [], rows: [], bytes: 0, end: null};
        if (message.type === 'PAGE_DATA') {
          const existing = raw.frames[frame.frameIndex];
          if (existing) {
            if (existing.digest !== frame.digest) {
              raw.failed = 'E_BATCH_CONFLICT'; command.state = 'effect_unknown';
              await t.put('commandJournal', command, command.commandId);
              await t.put('commandJournal', raw, rawKey); return {conflict: true};
            }
            return {duplicate: true, acked: !!existing.acked};
          }
          invariant(!raw.end && !raw.failed && frame.frameIndex === raw.frames.length && frame.rowStart === raw.rows.length, 'E_SEAL_INCOMPLETE');
          invariant(raw.frames.filter(f => !f.acked).length < 1, 'E_LIMIT', 'Await durable stage/frame ACK');
          invariant(raw.rows.length + frame.rawRows.length <= plan.limits.maxRecords, 'E_LIMIT');
          for (const row of frame.rawRows) {
            invariant(Object.keys(row).length === plan.fields.length && plan.fields.every(field => Object.hasOwn(row, field.id)), 'E_SCHEMA');
            invariant(bytes(row) <= BUDGETS.maxRecordBytes, 'E_LIMIT');
            for (const field of plan.fields) invariant(!field.required || row[field.id] !== null, 'E_SEMANTIC');
          }
          raw.bytes += bytes(frame); invariant(raw.bytes <= BUDGETS.maxStoredBytes, 'E_LIMIT');
          raw.rows.push(...frame.rawRows); raw.frames.push({digest: frame.digest, rowStart: frame.rowStart, rowCount: frame.rawRows.length, frame, acked: false});
          await t.put('commandJournal', raw, rawKey);
          command.rawFrames = raw.frames.map(item => item.frame);
          await t.put('commandJournal', command, command.commandId);
        } else {
          if (raw.end) { invariant(canonical(raw.end) === canonical(frame), 'E_BATCH_CONFLICT'); return {duplicate: true}; }
          invariant(!raw.failed && raw.frames.every(f => f.acked) && frame.frameCount === raw.frames.length && frame.rowCount === raw.rows.length, 'E_SEAL_INCOMPLETE');
          invariant(frame.pageIdentity === command.payload.expectedPageIdentity, 'E_TARGET');
          invariant(frame.rowCount > 0 || plan.list.allowEmpty && frame.emptyEvidence === 'allow-empty' ||
            !!plan.list.emptyMarkerSelector && frame.emptyEvidence === `empty-marker:${plan.list.emptyMarkerSelector}`, 'E_SEAL_INCOMPLETE');
          // Compute outside the transaction below; recheck the immutable collected digest before commit.
          return {endCandidate: {raw, rawKey}};
        }
      } else {
        const effectKey = `page-effect:${command.commandId}`;
        const old = await t.get('commandJournal', effectKey);
        if (old) { invariant(old.digest === frameDigest, 'E_BATCH_CONFLICT'); return {duplicate: true}; }
        await t.put('commandJournal', {tag: 'page-effect', commandId: command.commandId, identity, sender: document,
          digest: frameDigest, result: frame, receivedAt: new Date().toISOString()}, effectKey);
      }
      return {duplicate: false};
    });
    if (outcome.conflict) invariant(false, 'E_BATCH_CONFLICT');
    if (outcome.endCandidate) {
      const {raw, rawKey} = outcome.endCandidate;
      invariant(await digest({pageIdentity, rawRows: raw.rows}) === frame.rawSignature, 'E_HASH');
      await tx('readwrite', async t => {
        const current = await t.get('runs', identity.runId);
        invariant(current?.state === 'running' && !current.retirementId && sameIdentity(current.identity, identity, {ignoreRevision: true}), 'E_CANCELLED');
        const latest = await t.get('commandJournal', rawKey);
        invariant(!latest.failed && canonical(latest.rows) === canonical(raw.rows), 'E_SEAL_INCOMPLETE');
        if (latest.end) invariant(canonical(latest.end) === canonical(frame), 'E_BATCH_CONFLICT');
        latest.end = frame; await t.put('commandJournal', latest, rawKey);
        const command = await t.get('commandJournal', frame.commandId); command.rawEnd = frame; command.pageEnd = frame;
        await t.put('commandJournal', command, frame.commandId);
      });
    }
    if (!outcome.duplicate) await emitToHost(run.registrationId, {protocol: PROTOCOL, type: message.type, payload: frame});
    return {received: true, duplicate: !!outcome.duplicate, frameAck: !!outcome.acked};
  }

  async function ackPageFrame(request, sender) {
    const host = await assertHost(sender);
    const authorization = await tx('readwrite', async t => {
      const run = await t.get('runs', request.identity.runId);
      invariant(run && run.registrationId === host.registrationId && host.hostDocumentId === run.hostDocumentId && run.state === 'running', 'E_OWNER');
      if (admitIdentity) await admitIdentity(t, request.identity, sender);
      else invariant(sameIdentity(run.identity, request.identity), 'E_TARGET');
      await registered(t, run);
      const raw = await t.get('commandJournal', `page-raw:${request.commandId}`);
      const frame = raw?.frames[request.frameIndex];
      invariant(frame && !raw.failed && frame.digest === request.digest, 'E_HASH');
      const records = (await t.all('records')).filter(r => r.snapshotId === frame.frame.snapshotId).sort((a, b) => a.rowIndex - b.rowIndex);
      for (let i = 0; i < frame.rowCount; i++) {
        const record = records.find(r => r.rowIndex === frame.rowStart + i);
        invariant(record && canonical(record.raw) === canonical(frame.frame.rawRows[i]), 'E_SEAL_INCOMPLETE', 'Raw ACK requires matching durable staged records');
      }
      frame.acked = true; await t.put('commandJournal', raw, `page-raw:${request.commandId}`);
      return {target: request.identity.target};
    });
    const target = authorization.target;
    await api.tabs.sendMessage(target.tabId, {protocol: PROTOCOL, type: 'PAGE_FRAME_ACK', payload: {commandId: request.commandId,
      frameIndex: request.frameIndex, digest: request.digest}}, {documentId: target.documentId, frameId: 0});
    return {acked: true};
  }

  async function invalidateTab(tabId) { await targetService.invalidateTab(tabId); return source.invalidateTab(tabId); }

  return Object.freeze({executeCommand, validatePlan, handleAgentMessage, ackPageFrame, invalidateTab,
    openSourceContext: source.openSourceContext, startSourceSelection: source.startSourceSelection,
    cancelSourceSelection: source.cancelSourceSelection, releaseSourceContext: source.releaseSourceContext,
    previewSource: source.previewSource, ackSourceFrame: source.ackSourceFrame,
    invalidateSourceTab: source.invalidateTab, invalidateHost: source.invalidateHost, expireSourceContexts: source.expireSourceContexts});
}
