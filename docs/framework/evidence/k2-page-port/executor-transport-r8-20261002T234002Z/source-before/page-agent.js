import {invariant, canonical, digest, BUDGETS, PROTOCOL, validate} from '../platform/protocol.js';

const bytes = value => new TextEncoder().encode(canonical(value)).byteLength;
const pageUrl = location => { const url = new URL(location.href); url.hash = ''; return url.href; };

export function readRawPage({document, plan, maxRows = plan.limits.maxRecords}) {
  const containers = document.querySelectorAll(plan.list.containerSelector);
  invariant(containers.length === 1, 'E_SEMANTIC', 'List container must match exactly once');
  const rows = containers[0].querySelectorAll(plan.list.rowSelector);
  const rawRows = [];
  for (const row of Array.from(rows).slice(0, maxRows)) {
    const raw = Object.create(null);
    for (const field of plan.fields) {
      const nodes = field.selector === '' ? [row] : row.querySelectorAll(field.selector);
      invariant(nodes.length <= 1, 'E_SEMANTIC', 'Field selector matches multiple elements');
      const node = nodes[0];
      const value = !node ? null : field.read === 'text' ? node.textContent : node.getAttribute(field.attribute);
      invariant(value === null || typeof value === 'string', 'E_SCHEMA');
      invariant(!field.required || value !== null, 'E_SEMANTIC', 'Required field missing');
      raw[field.id] = value;
    }
    invariant(bytes(raw) <= BUDGETS.maxRecordBytes, 'E_LIMIT', 'A complete raw record exceeds the record budget');
    rawRows.push(raw);
  }
  let emptyEvidence = null;
  if (!rawRows.length) {
    if (plan.list.emptyMarkerSelector && document.querySelector(plan.list.emptyMarkerSelector)) emptyEvidence = `empty-marker:${plan.list.emptyMarkerSelector}`;
    else if (plan.list.allowEmpty) emptyEvidence = 'allow-empty';
    invariant(emptyEvidence, 'E_SEAL_INCOMPLETE', 'Empty page requires explicit evidence');
  }
  return {rawRows, hasMore: rows.length > maxRows, emptyEvidence};
}

export function installPageAgent({api, document, location, selectionProvider = () => globalThis.__openDeskSelectionSlot}) {
  const commands = new Map();
  const sourceJobs = new Map();
  const pendingACKs = new Map();
  const send = (type, payload) => api.runtime.sendMessage({protocol: PROTOCOL, type, payload});

  function waitACK(key, expectedDigest, job) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pendingACKs.delete(key); reject(Object.assign(new Error('Frame ACK timed out'), {code: 'E_CANCELLED'})); }, 30000);
      pendingACKs.set(key, {digest: expectedDigest, job, resolve() { clearTimeout(timer); pendingACKs.delete(key); resolve(); },
        reject() { clearTimeout(timer); pendingACKs.delete(key); reject(Object.assign(new Error('Cancelled'), {code: 'E_CANCELLED'})); }});
    });
  }

  function cancelJob(job) {
    job.cancelled = true;
    for (const pending of pendingACKs.values()) if (pending.job === job) pending.reject();
    if (typeof job.dispose === 'function') job.dispose();
  }

  async function streamRaw(request, job, preview) {
    const plan = preview ? request.plan : request.payload.plan;
    validate('RulePlan', plan);
    const allowedOrigin = preview ? request.context.origin : request.identity.target.allowedOrigin;
    invariant(new URL(location.href).origin === allowedOrigin, 'E_TARGET');
    const pageIdentity = pageUrl(location);
    if (!preview) invariant(pageIdentity === request.payload.expectedPageIdentity, 'E_TARGET');
    const {rawRows, hasMore, emptyEvidence} = readRawPage({document, plan, maxRows: preview ? 10 : plan.limits.maxRecords});
    invariant(bytes(rawRows) <= BUDGETS.maxStoredBytes, 'E_LIMIT');
    const rawSignature = await digest({pageIdentity, rawRows});
    let frameIndex = 0, rowStart = 0;
    while (rowStart < rawRows.length) {
      invariant(!job.cancelled, 'E_CANCELLED');
      let end = rowStart, frame;
      while (end < rawRows.length) {
        const candidateRows = rawRows.slice(rowStart, end + 1);
        const candidate = preview ? {type: 'source-preview-data', context: request.context, requestId: request.requestId,
          frameIndex, rowStart, rawRows: candidateRows, digest: '0'.repeat(64)} : {type: 'page-data', identity: request.identity,
          commandId: request.commandId, snapshotId: request.payload.snapshotId, frameIndex, rowStart, rawRows: candidateRows, digest: '0'.repeat(64)};
        if (bytes(candidate) > BUDGETS.maxRawFrameBytes) break;
        frame = candidate; end++;
      }
      invariant(frame && end > rowStart, 'E_LIMIT', 'A whole row cannot fit in one frame');
      frame.digest = preview ? await digest({selectionId: request.context.selectionId, requestId: request.requestId, frameIndex, rowStart, rawRows: frame.rawRows}) :
        await digest({snapshotId: request.payload.snapshotId, frameIndex, rowStart, rawRows: frame.rawRows});
      const ackKey = preview ? `source:${request.context.selectionId}:${request.requestId}:${frameIndex}` : `page:${request.commandId}:${frameIndex}`;
      const acknowledgment = waitACK(ackKey, frame.digest, job);
      // Attach a rejection observer before sending, so a concurrent cancellation cannot become unhandled.
      acknowledgment.catch(() => {});
      const received = await send(preview ? 'SOURCE_PREVIEW_DATA' : 'PAGE_DATA', frame);
      invariant(received?.received && !received.error, 'E_TARGET');
      if (received.frameAck) pendingACKs.get(ackKey)?.resolve();
      await acknowledgment;
      rowStart = end; frameIndex++;
    }
    invariant(!job.cancelled, 'E_CANCELLED');
    const base = new URL(document.baseURI);
    invariant(['http:', 'https:'].includes(base.protocol) && !base.username && !base.password && base.origin === allowedOrigin, 'E_TARGET');
    const common = {frameCount: frameIndex, rowCount: rawRows.length, pageIdentity, documentBaseURI: base.href, emptyEvidence, rawSignature};
    await send(preview ? 'SOURCE_PREVIEW_END' : 'PAGE_END', preview ? {type: 'source-preview-end', context: request.context,
      requestId: request.requestId, hasMore, ...common} : {type: 'page-end', identity: request.identity, commandId: request.commandId,
      snapshotId: request.payload.snapshotId, ...common});
  }

  async function effect(command, job) {
    const payload = command.payload;
    const identity = command.identity;
    invariant(new URL(location.href).origin === identity.target.allowedOrigin, 'E_TARGET');
    const nodes = document.querySelectorAll(payload.selector);
    if (!nodes.length && document.querySelector(payload.endMarkerSelector)) {
      await send('PAGE_EFFECT', {identity, commandId: command.commandId, pageIdentity: pageUrl(location), outcome: 'ended'}); return;
    }
    invariant(nodes.length === 1 && !job.cancelled, 'E_SEMANTIC');
    if (command.kind === 'next-link') {
      const actual = new URL(nodes[0].getAttribute('href'), document.baseURI);
      const requested = new URL(payload.url);
      invariant(['https:', 'http:'].includes(actual.protocol) && !actual.username && !actual.password && actual.origin === identity.target.allowedOrigin && actual.href === requested.href, 'E_TARGET');
      // This receipt observes admission of the fixed effect, not page load or business success.
      await send('PAGE_EFFECT', {identity, commandId: command.commandId, pageIdentity: pageUrl(location), outcome: 'submitted', effect: 'goto'});
      invariant(!job.cancelled, 'E_CANCELLED'); location.assign(actual.href);
    } else {
      invariant(command.kind === 'next-button' && payload.userConfirmed === true && payload.postcondition === 'page-signature-change', 'E_SEMANTIC');
      nodes[0].click();
      await send('PAGE_EFFECT', {identity, commandId: command.commandId, pageIdentity: pageUrl(location), outcome: 'submitted', effect: 'click'});
    }
  }

  async function select(request, job) {
    const context = request.context;
    invariant(new URL(location.href).origin === context.origin, 'E_TARGET');
    const provider = selectionProvider();
    if (!provider || provider.selectionImplemented !== true || typeof provider.start !== 'function') {
      await send('SOURCE_RESULT', {selectionId: context.selectionId, operationId: request.operationId, sourceDocumentId: context.sourceDocumentId,
        kind: request.kind, status: 'failed', selectors: {containerSelector: null, rowSelector: null, fieldSelector: null, nextSelector: null},
        error: {code: 'MODULE_NOT_INSTALLED', message: 'Packaged SelectorUI is not installed', retryable: false, details: {}}});
      return;
    }
    // Provider is a packaged isolated-world callback only, never page-supplied code or a serialized function.
    const result = await provider.start(request, {cancelled: () => job.cancelled, setDispose: dispose => { job.dispose = dispose; }});
    invariant(!job.cancelled, 'E_CANCELLED');
    validate('SourceSelectionResult', result);
    invariant(result.selectionId === context.selectionId && result.operationId === request.operationId && result.sourceDocumentId === context.sourceDocumentId && result.kind === request.kind, 'E_TARGET');
    await send('SOURCE_RESULT', result);
  }

  function fail(error, request, preview) {
    if (preview) return; // A cancelled/failed preview never invents a completed result or raw end.
    send('PAGE_ERROR', {identity: request.identity, commandId: request.commandId, pageIdentity: pageUrl(location), outcome: 'failed',
      error: {code: error.code || 'E_SEMANTIC', message: String(error.message).slice(0, 1024)}}).catch(() => {});
  }

  function listener(message, sender, respond) {
    if (sender?.id !== api.runtime.id || message?.protocol !== PROTOCOL) return false;
    if (sender.url && !sender.url.startsWith(api.runtime.getURL(''))) return false;
    const request = message.payload;
    try {
      if (message.type === 'PAGE_FRAME_ACK' || message.type === 'SOURCE_FRAME_ACK') {
        const key = message.type === 'PAGE_FRAME_ACK' ? `page:${request.commandId}:${request.frameIndex}` : `source:${request.selectionId}:${request.requestId}:${request.frameIndex}`;
        const pending = pendingACKs.get(key);
        invariant(pending?.digest === request.digest, 'E_HASH'); pending.resolve(); respond({acked: true}); return false;
      }
      if (message.type === 'SOURCE_CLEANUP') {
        for (const [key, job] of sourceJobs) if (job.selectionId === request.selectionId && (!request.operationId || job.operationId === request.operationId)) { cancelJob(job); sourceJobs.delete(key); }
        respond({accepted: true}); return false;
      }
      if (message.type === 'PAGE_EXECUTE') {
        validate('Command', request); invariant(request.state === 'dispatched', 'E_EFFECT_UNKNOWN');
        const existing = commands.get(request.commandId);
        if (existing) { invariant(existing.digest === request.digest, 'E_BATCH_CONFLICT'); respond({accepted: true, duplicate: true}); return false; }
        const job = {digest: request.digest, cancelled: false}; commands.set(request.commandId, job);
        respond({accepted: true});
        Promise.resolve().then(() => request.kind === 'read-page' ? streamRaw(request, job, false) : effect(request, job)).catch(error => { cancelJob(job); fail(error, request, false); });
        return false;
      }
      if (message.type === 'SOURCE_PREVIEW' || message.type === 'SOURCE_START') {
        validate(message.type === 'SOURCE_PREVIEW' ? 'PreviewSourceRequest' : 'StartSourceSelectionRequest', request);
        const operationId = message.type === 'SOURCE_PREVIEW' ? request.requestId : request.operationId;
        const key = `${request.context.selectionId}:${operationId}`;
        if (sourceJobs.has(key)) { respond({accepted: true, duplicate: true}); return false; }
        const job = {selectionId: request.context.selectionId, operationId, cancelled: false}; sourceJobs.set(key, job);
        respond({accepted: true});
        Promise.resolve().then(() => message.type === 'SOURCE_PREVIEW' ? streamRaw(request, job, true) : select(request, job)).catch(() => { cancelJob(job); });
        return false;
      }
    } catch (error) { respond({error: {code: error.code || 'E_SCHEMA'}}); }
    return false;
  }

  api.runtime.onMessage.addListener(listener);
  const ready = () => send('AGENT_READY', {});
  const dispose = () => { api.runtime.onMessage.removeListener(listener); for (const job of commands.values()) cancelJob(job); for (const job of sourceJobs.values()) cancelJob(job); };
  return {ready, dispose};
}

if (typeof chrome !== 'undefined' && typeof document !== 'undefined' && ['http:', 'https:'].includes(globalThis.location?.protocol)) {
  const key = '__openDeskPageAgentV1';
  if (!globalThis[key]) globalThis[key] = installPageAgent({api: chrome, document, location});
  globalThis[key].ready().catch(() => {});
}
