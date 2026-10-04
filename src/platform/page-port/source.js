import {invariant, validate, canonical, digest, newId, BUDGETS, PROTOCOL} from '../protocol.js';
import {authenticatedDocument, httpUrl, sessionIncarnation} from '../target/index.js';

const stores = ['commandJournal'];
const contextKey = id => `source-context:${id}`;
const operationKey = (id, op) => `source-operation:${id}:${op}`;
const bytes = value => new TextEncoder().encode(canonical(value)).byteLength;
const now = () => new Date().toISOString();

export function createSourcePort({storage, api, session, assertHost, emitToHost, validatePlan}) {
  const transaction = (mode, cb) => storage.transaction(stores, mode, cb);
  const handshakes = new Map();
  const streams = new Map();

  async function hostFor(tx, context, host) {
    const stored = await tx.get('commandJournal', `host:${context.registrationId}`);
    invariant(stored && !stored.revoked && host.registrationId === context.registrationId &&
      host.hostDocumentId === context.hostDocumentId && stored.hostDocumentId === context.hostDocumentId &&
      stored.hostInstanceId === context.hostInstanceId, 'E_OWNER');
  }

  async function admit(tx, selectionId, host, incarnation, supplied, allowClosed = false) {
    const record = await tx.get('commandJournal', contextKey(selectionId));
    invariant(record, 'E_TARGET');
    await hostFor(tx, record.context, host);
    const context = record.context;
    invariant(context.browserSessionIncarnation === incarnation, 'E_TARGET');
    if (!allowClosed) invariant(context.state === 'active' && Date.parse(context.expiresAt) > Date.now(), 'E_CANCELLED');
    if (supplied) invariant(canonical(supplied) === canonical(context), 'E_TARGET', 'Stale or forged source capability');
    return record;
  }

  async function send(context, message) {
    if (context.browserSessionIncarnation !== await sessionIncarnation(session)) return;
    await api.tabs.sendMessage(context.sourceTabId, {protocol: PROTOCOL, type: message.type, payload: message.payload}, {documentId: context.sourceDocumentId, frameId: 0});
  }

  async function cleanup(context, operationId) {
    try { await send(context, {type: 'SOURCE_CLEANUP', payload: {selectionId: context.selectionId, operationId}}); } catch { /* Revocation is already durable. */ }
  }

  async function openSourceContext(request, sender) {
    validate('OpenSourceContextRequest', request);
    const host = await assertHost(sender, request.registrationId);
    const incarnation = await sessionIncarnation(session);
    const requestDigest = await digest(request);
    const selectionId = newId();
    const prepared = await transaction('readwrite', async tx => {
      const registered = await tx.get('commandJournal', `host:${host.registrationId}`);
      invariant(registered && !registered.revoked && registered.hostDocumentId === host.hostDocumentId, 'E_OWNER');
      const ticketKey = `gesture:${request.gestureTicketId}`;
      const ticket = await tx.get('commandJournal', ticketKey);
      invariant(ticket && ticket.browserSessionIncarnation === incarnation, 'E_PERMISSION', 'Real action gesture ticket required');
      if (ticket.consumed || ticket.consumedBy) {
        invariant(ticket.consumedBy === host.registrationId && ticket.requestDigest === requestDigest, 'E_OWNER');
        const old = await tx.get('commandJournal', contextKey(ticket.selectionId));
        invariant(old, 'E_TARGET'); return old;
      }
      const gestureAt = ticket.gestureAt || ticket.createdAt;
      invariant(Number.isFinite(Date.parse(gestureAt)) && Date.now() - Date.parse(gestureAt) >= 0 && Date.now() - Date.parse(gestureAt) <= 30000, 'E_PERMISSION');
      const sourceTabId = ticket.sourceTabId ?? ticket.tabId;
      invariant(Number.isSafeInteger(sourceTabId) && sourceTabId >= 0, 'E_PERMISSION');
      if (ticket.registrationId) invariant(ticket.registrationId === host.registrationId, 'E_OWNER');
      const origin = httpUrl(ticket.sourceUrl || ticket.url || ticket.origin).origin;
      const record = {tag: 'source-context', selectionId, handshakeState: 'pending', context: {
        selectionId, sourceTabId, frameId: 0, sourceDocumentId: null, origin, gestureAt,
        hostInstanceId: host.hostInstanceId, hostDocumentId: host.hostDocumentId, registrationId: host.registrationId,
        browserSessionIncarnation: incarnation, contextRevision: 1, expiresAt: new Date(Date.now() + 600000).toISOString(),
        state: 'active', allowedOperations: ['select-list', 'select-fields', 'select-next', 'preview', 'clear-own-overlay']},
        currentOperationId: null, requestId: request.requestId, requestDigest};
      ticket.consumed = true; ticket.consumedBy = host.registrationId; ticket.selectionId = selectionId; ticket.requestDigest = requestDigest;
      await tx.put('commandJournal', ticket, ticketKey);
      await tx.put('commandJournal', record, contextKey(selectionId));
      return record;
    });
    if (prepared.handshakeState === 'ready') {
      invariant(prepared.context.state === 'active' && Date.parse(prepared.context.expiresAt) > Date.now(), 'E_CANCELLED');
      return validate('SourceSelectionContext', prepared.context);
    }
    let resolve, reject;
    const ready = new Promise((yes, no) => { resolve = yes; reject = no; });
    // Register before injection: an authentic classic agent may handshake synchronously.
    const timer = setTimeout(() => reject(Object.assign(new Error('Source document handshake timed out'), {code: 'E_TARGET'})), 5000);
    handshakes.set(prepared.selectionId, resolve);
    try {
      await api.scripting.executeScript({target: {tabId: prepared.context.sourceTabId, frameIds: [0]}, world: 'ISOLATED', files: ['agents/page-agent.js']});
      return await ready;
    } finally { clearTimeout(timer); handshakes.delete(prepared.selectionId); }
  }

  async function handshake(sender) {
    const document = authenticatedDocument(api, sender);
    const origin = httpUrl(sender.url).origin;
    const incarnation = await sessionIncarnation(session);
    const ready = await transaction('readwrite', async tx => {
      const pending = (await tx.all('commandJournal')).filter(r => r.tag === 'source-context' && r.handshakeState === 'pending' &&
        r.context.sourceTabId === document.tabId && r.context.browserSessionIncarnation === incarnation && r.context.state === 'active');
      if (!pending.length) return [];
      for (const record of pending) {
        invariant(record.context.origin === origin && Date.parse(record.context.expiresAt) > Date.now(), 'E_TARGET');
        const host = await tx.get('commandJournal', `host:${record.context.registrationId}`);
        invariant(host && !host.revoked && host.hostDocumentId === record.context.hostDocumentId, 'E_OWNER');
        record.context.sourceDocumentId = document.documentId; record.handshakeState = 'ready';
        validate('SourceSelectionContext', record.context);
        await tx.put('commandJournal', record, contextKey(record.selectionId));
      }
      return pending.map(r => r.context);
    });
    for (const context of ready) handshakes.get(context.selectionId)?.(context);
    return {ok: true, source: ready.length > 0};
  }

  async function startOperation(request, sender, kind) {
    const host = await assertHost(sender, request.context.registrationId);
    const incarnation = await sessionIncarnation(session);
    const requestDigest = await digest(request);
    const operationId = kind === 'preview' ? request.requestId : request.operationId;
    const prepared = await transaction('readwrite', async tx => {
      const record = await admit(tx, request.context.selectionId, host, incarnation, request.context);
      invariant(record.context.allowedOperations.includes(kind === 'preview' ? 'preview' : request.kind), 'E_PERMISSION');
      const opKey = operationKey(record.selectionId, operationId);
      const previous = await tx.get('commandJournal', opKey);
      if (previous) {
        invariant(previous.requestDigest === requestDigest, 'E_BATCH_CONFLICT');
        return {context: record.context, operation: previous, duplicate: true, old: null};
      }
      const oldId = record.currentOperationId;
      if (oldId) {
        const old = await tx.get('commandJournal', operationKey(record.selectionId, oldId));
        if (old) { old.state = 'cancelled'; await tx.put('commandJournal', old, operationKey(record.selectionId, oldId)); }
      }
      const operation = {tag: 'source-operation', selectionId: record.selectionId, operationId, requestId: request.requestId,
        kind: kind === 'preview' ? kind : request.kind, fieldId: request.fieldId ?? null, requestDigest, state: 'accepted',
        deadlineAt: new Date(Math.min(Date.parse(record.context.expiresAt), Date.now() + 30000)).toISOString(),
        frames: [], rawRows: [], end: null, plan: request.plan || null};
      record.currentOperationId = operationId;
      await tx.put('commandJournal', operation, opKey); await tx.put('commandJournal', record, contextKey(record.selectionId));
      return {context: record.context, operation, duplicate: false, old: oldId};
    });
    if (prepared.old) {
      streams.get(`${prepared.context.selectionId}:${prepared.old}`)?.fail('E_CANCELLED');
      await cleanup(prepared.context, prepared.old);
      await emitToHost(prepared.context.registrationId, {protocol: PROTOCOL, type: 'SOURCE_OPERATION', payload: {selectionId: prepared.context.selectionId, operationId: prepared.old, state: 'cancelled', duplicate: false}});
    }
    return prepared;
  }

  async function startSourceSelection(request, sender) {
    validate('StartSourceSelectionRequest', request);
    const prepared = await startOperation(request, sender, 'selection');
    if (!prepared.duplicate) {
      try {
        await api.scripting.executeScript({target: {tabId: prepared.context.sourceTabId, documentIds: [prepared.context.sourceDocumentId]}, world: 'ISOLATED', files: ['agents/selection-entry.js']});
        await send(prepared.context, {type: 'SOURCE_START', payload: request});
      } catch {
        await cancelSourceSelection({selectionId: prepared.context.selectionId, operationId: request.operationId, requestId: `failed:${request.requestId}`}, sender);
        invariant(false, 'E_TARGET', 'Selection agent unavailable');
      }
    }
    return validate('SourceOperationAck', {selectionId: prepared.context.selectionId, operationId: request.operationId, state: prepared.operation.state === 'cancelled' ? 'cancelled' : 'accepted', duplicate: prepared.duplicate});
  }

  async function cancelSourceSelection(request, sender) {
    validate('CancelSourceSelectionRequest', request);
    const host = await assertHost(sender);
    const incarnation = await sessionIncarnation(session);
    const state = await transaction('readwrite', async tx => {
      const record = await admit(tx, request.selectionId, host, incarnation, null, true);
      const op = await tx.get('commandJournal', operationKey(request.selectionId, request.operationId));
      invariant(op, 'E_TARGET');
      const duplicate = op.state === 'cancelled'; op.state = 'cancelled';
      if (record.currentOperationId === request.operationId) record.currentOperationId = null;
      await tx.put('commandJournal', op, operationKey(request.selectionId, request.operationId));
      await tx.put('commandJournal', record, contextKey(request.selectionId));
      return {context: record.context, ack: {selectionId: request.selectionId, operationId: request.operationId, state: 'cancelled', duplicate}};
    });
    streams.get(`${request.selectionId}:${request.operationId}`)?.fail('E_CANCELLED');
    await cleanup(state.context, request.operationId);
    if (!state.ack.duplicate) await emitToHost(host.registrationId, {protocol: PROTOCOL, type: 'SOURCE_OPERATION', payload: state.ack});
    return validate('SourceOperationAck', state.ack);
  }

  async function releaseSourceContext(request, sender) {
    validate('ReleaseSourceContextRequest', request);
    const host = await assertHost(sender);
    const incarnation = await sessionIncarnation(session);
    const requestDigest = await digest(request);
    const result = await transaction('readwrite', async tx => {
      const record = await admit(tx, request.selectionId, host, incarnation, null, true);
      if (record.releaseAck) { invariant(record.releaseDigest === requestDigest, 'E_OWNER'); return {context: record.context, ack: {...record.releaseAck, duplicate: true}, operationId: null}; }
      invariant(record.context.contextRevision === request.expectedContextRevision, 'E_REVISION');
      const operationId = record.currentOperationId;
      if (operationId) {
        const op = await tx.get('commandJournal', operationKey(request.selectionId, operationId));
        if (op) { op.state = 'cancelled'; await tx.put('commandJournal', op, operationKey(request.selectionId, operationId)); }
      }
      record.context.state = 'released'; record.context.contextRevision++; record.currentOperationId = null;
      record.releaseAck = {selectionId: request.selectionId, operationId: null, state: 'released', duplicate: false}; record.releaseDigest = requestDigest;
      await tx.put('commandJournal', record, contextKey(request.selectionId));
      return {context: record.context, ack: record.releaseAck, operationId};
    });
    streams.get(`${request.selectionId}:${result.operationId}`)?.fail('E_CANCELLED');
    await cleanup(result.context, result.operationId);
    if (!result.ack.duplicate) await emitToHost(host.registrationId, {protocol: PROTOCOL, type: 'SOURCE_OPERATION', payload: result.ack});
    return validate('SourceOperationAck', result.ack);
  }

  async function previewSource(request, sender) {
    validate('PreviewSourceRequest', request);
    await validatePlan(request.draft, request.plan);
    invariant(request.context.origin === request.draft.allowedOrigin, 'E_TARGET');
    const prepared = await startOperation(request, sender, 'preview');
    invariant(!prepared.duplicate, 'E_EFFECT_UNKNOWN', 'A consumed preview request is not replayed');
    const streamKey = `${prepared.context.selectionId}:${request.requestId}`;
    const queue = []; let waiting = null, failure = null, closed = false, previous = null;
    const wake = () => { if (waiting) { waiting(); waiting = null; } };
    const stream = {push(frame) { queue.push(frame); wake(); }, fail(code) { failure = Object.assign(new Error(code), {code}); wake(); }};
    streams.set(streamKey, stream);
    const timer = setTimeout(() => stream.fail('E_CANCELLED'), 30000);
    const iterator = {
      [Symbol.asyncIterator]() { return this; },
      async next() {
        if (previous?.type === 'source-preview-data') await ackSourceFrame({context: prepared.context, requestId: request.requestId, frameIndex: previous.frameIndex, digest: previous.digest}, sender);
        previous = null;
        while (!queue.length && !failure && !closed) await new Promise(resolve => { waiting = resolve; });
        if (failure) { clearTimeout(timer); streams.delete(streamKey); await cleanup(prepared.context, request.requestId); throw failure; }
        if (!queue.length) return {done: true};
        const value = queue.shift(); previous = value;
        if (value.type === 'source-preview-end') { closed = true; clearTimeout(timer); streams.delete(streamKey); }
        return {done: false, value};
      },
      async return() { closed = true; clearTimeout(timer); streams.delete(streamKey); wake(); await cancelSourceSelection({selectionId: prepared.context.selectionId, operationId: request.requestId, requestId: `cancel:${request.requestId}`}, sender); return {done: true}; }
    };
    try { await send(prepared.context, {type: 'SOURCE_PREVIEW', payload: request}); }
    catch (error) { stream.fail(error.code || 'E_TARGET'); }
    return iterator;
  }

  async function handleAgentMessage(message, sender) {
    invariant(message?.protocol === PROTOCOL, 'E_VERSION');
    if (message.type === 'AGENT_READY') return handshake(sender);
    const document = authenticatedDocument(api, sender);
    const incarnation = await sessionIncarnation(session);
    const result = message.payload;
    const selectionId = result?.selectionId || result?.context?.selectionId;
    invariant(typeof selectionId === 'string', 'E_TARGET');
    const preview = ['SOURCE_PREVIEW_DATA', 'SOURCE_PREVIEW_END'].includes(message.type);
    const operationId = preview ? result.requestId : result.operationId;
    if (preview) {
      validate(message.type === 'SOURCE_PREVIEW_DATA' ? 'SourcePreviewData' : 'SourcePreviewEnd', result);
      invariant(bytes(result) <= BUDGETS.maxRawFrameBytes, 'E_LIMIT');
      if (message.type === 'SOURCE_PREVIEW_DATA') invariant(await digest({selectionId, requestId: result.requestId, frameIndex: result.frameIndex, rowStart: result.rowStart, rawRows: result.rawRows}) === result.digest, 'E_HASH');
      else invariant(result.pageIdentity === httpUrl(sender.url).href, 'E_TARGET');
    } else { invariant(message.type === 'SOURCE_RESULT', 'E_SCHEMA'); validate('SourceSelectionResult', result); }
    const resultDigest = await digest(result);
    const accepted = await transaction('readwrite', async tx => {
      const record = await tx.get('commandJournal', contextKey(selectionId));
      invariant(record && record.handshakeState === 'ready', 'E_TARGET');
      const context = record.context;
      invariant(context.browserSessionIncarnation === incarnation && context.sourceTabId === document.tabId &&
        context.sourceDocumentId === document.documentId && context.origin === httpUrl(sender.url).origin, 'E_TARGET');
      const host = await tx.get('commandJournal', `host:${context.registrationId}`);
      invariant(host && !host.revoked && host.hostDocumentId === context.hostDocumentId, 'E_OWNER');
      const op = await tx.get('commandJournal', operationKey(selectionId, operationId));
      if (!op || record.currentOperationId !== operationId || context.state !== 'active' || Date.parse(context.expiresAt) <= Date.now() ||
        Date.parse(op.deadlineAt) <= Date.now() || op.state === 'cancelled') {
        await tx.put('commandJournal', {tag: 'source-late-result', selectionId, operationId, digest: resultDigest, receivedAt: now()}, `source-late:${selectionId}:${operationId}:${resultDigest}`);
        return {late: true, context};
      }
      if (!preview) {
        invariant(op.kind === result.kind && result.sourceDocumentId === document.documentId, 'E_TARGET');
        if (op.result) { invariant(op.resultDigest === resultDigest, 'E_BATCH_CONFLICT'); return {duplicate: true, context}; }
        op.result = result; op.resultDigest = resultDigest; op.state = result.status === 'cancelled' ? 'cancelled' : 'finished';
      } else {
        invariant(op.kind === 'preview' && canonical(context) === canonical(result.context), 'E_TARGET');
        if (message.type === 'SOURCE_PREVIEW_DATA') {
          const old = op.frames[result.frameIndex];
          if (old) { invariant(old.digest === result.digest, 'E_BATCH_CONFLICT'); return {duplicate: true, context}; }
          invariant(!op.end && result.frameIndex === op.frames.length && result.rowStart === op.rawRows.length && op.frames.every(f => f.acked), 'E_SEAL_INCOMPLETE');
          invariant(op.rawRows.length + result.rawRows.length <= 10, 'E_LIMIT');
          for (const row of result.rawRows) {
            invariant(Object.keys(row).length === op.plan.fields.length && op.plan.fields.every(field => Object.hasOwn(row, field.id) && (!field.required || row[field.id] !== null)), 'E_SCHEMA');
            invariant(bytes(row) <= BUDGETS.maxRecordBytes, 'E_LIMIT');
          }
          op.rawRows.push(...result.rawRows); op.frames.push({digest: result.digest, acked: false});
        } else {
          if (op.end) { invariant(canonical(op.end) === canonical(result), 'E_BATCH_CONFLICT'); return {duplicate: true, context}; }
          invariant(op.frames.every(f => f.acked) && result.frameCount === op.frames.length && result.rowCount === op.rawRows.length, 'E_SEAL_INCOMPLETE');
          return {context, endCandidate: op};
        }
      }
      await tx.put('commandJournal', op, operationKey(selectionId, operationId));
      return {context};
    });
    if (accepted.late) invariant(false, 'E_CANCELLED', 'Late source result was audited and rejected');
    if (accepted.endCandidate) {
      const op = accepted.endCandidate;
      invariant(await digest({pageIdentity: result.pageIdentity, rawRows: op.rawRows}) === result.rawSignature, 'E_HASH');
      const base = httpUrl(result.documentBaseURI); invariant(base.origin === accepted.context.origin, 'E_TARGET');
      invariant(result.rowCount > 0 || op.plan.list.allowEmpty && result.emptyEvidence === 'allow-empty' ||
        op.plan.list.emptyMarkerSelector && result.emptyEvidence === `empty-marker:${op.plan.list.emptyMarkerSelector}`, 'E_SEAL_INCOMPLETE');
      await transaction('readwrite', async tx => {
        const record = await tx.get('commandJournal', contextKey(selectionId));
        const latest = await tx.get('commandJournal', operationKey(selectionId, operationId));
        invariant(record.context.state === 'active' && record.currentOperationId === operationId && latest.state === 'accepted' && canonical(latest.rawRows) === canonical(op.rawRows), 'E_CANCELLED');
        latest.end = result; latest.state = 'finished'; await tx.put('commandJournal', latest, operationKey(selectionId, operationId));
      });
    }
    if (!accepted.duplicate) {
      if (preview) streams.get(`${selectionId}:${operationId}`)?.push(result);
      await emitToHost(accepted.context.registrationId, {protocol: PROTOCOL, type: message.type, payload: result});
    }
    return {received: true, duplicate: !!accepted.duplicate};
  }

  async function ackSourceFrame(request, sender) {
    const host = await assertHost(sender, request.context.registrationId);
    const incarnation = await sessionIncarnation(session);
    const context = await transaction('readwrite', async tx => {
      const record = await admit(tx, request.context.selectionId, host, incarnation, request.context);
      invariant(record.currentOperationId === request.requestId, 'E_CANCELLED');
      const op = await tx.get('commandJournal', operationKey(record.selectionId, request.requestId));
      const frame = op?.frames[request.frameIndex];
      invariant(op?.kind === 'preview' && op.state === 'accepted' && frame?.digest === request.digest, 'E_HASH');
      frame.acked = true; await tx.put('commandJournal', op, operationKey(record.selectionId, request.requestId));
      return record.context;
    });
    await send(context, {type: 'SOURCE_FRAME_ACK', payload: {selectionId: context.selectionId, requestId: request.requestId, frameIndex: request.frameIndex, digest: request.digest}});
    return {acked: true};
  }

  async function invalidate(predicate) {
    const invalidated = await transaction('readwrite', async tx => {
      const results = [];
      for (const record of await tx.all('commandJournal')) {
        if (record.tag !== 'source-context' || record.context.state !== 'active' || !predicate(record.context)) continue;
        const operationId = record.currentOperationId;
        if (operationId) {
          const op = await tx.get('commandJournal', operationKey(record.selectionId, operationId));
          if (op) { op.state = 'cancelled'; await tx.put('commandJournal', op, operationKey(record.selectionId, operationId)); }
        }
        record.context.state = 'invalidated'; record.context.contextRevision++; record.currentOperationId = null;
        await tx.put('commandJournal', record, contextKey(record.selectionId)); results.push({context: record.context, operationId});
      }
      return results;
    });
    for (const {context, operationId} of invalidated) {
      streams.get(`${context.selectionId}:${operationId}`)?.fail('E_CANCELLED');
      await cleanup(context, operationId);
      await emitToHost(context.registrationId, {protocol: PROTOCOL, type: 'SOURCE_OPERATION', payload: {selectionId: context.selectionId, operationId, state: 'invalidated', duplicate: false}});
    }
  }

  const invalidateTab = tabId => invalidate(c => c.sourceTabId === tabId);
  const invalidateHost = registrationId => invalidate(c => c.registrationId === registrationId);
  async function expireSourceContexts() { const incarnation = await sessionIncarnation(session); return invalidate(c => Date.parse(c.expiresAt) <= Date.now() || c.browserSessionIncarnation !== incarnation); }
  return {openSourceContext, startSourceSelection, cancelSourceSelection, releaseSourceContext, previewSource,
    handleAgentMessage, ackSourceFrame, invalidateTab, invalidateHost, expireSourceContexts};
}
