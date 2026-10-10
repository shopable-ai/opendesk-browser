import {PageError, requireValue, encodeValue, decodeValue, frozenCopy} from '../../framework/control/value.js';
import {relayContextRequest} from '../../framework/context.js';
import {createResultAssembler} from '../../framework/control/result-transfer.js';
import {BUILTIN_CATALOG} from '../../runtime/builtin-libraries/catalog.js';
import {loadBuiltinWorkerSource} from '../../runtime/builtin-libraries/loader.js';

function safeErrorCause(error) {
 const cause = error && Object.getOwnPropertyDescriptor(error, 'cause')?.value;
 if (!cause || typeof cause !== 'object') return undefined;
 if (Object.getOwnPropertyDescriptor(error, 'code')?.value === 'E_HTTP') {
  const status = Object.getOwnPropertyDescriptor(cause, 'status')?.value;
  const response = Object.getOwnPropertyDescriptor(cause, 'response')?.value;
  if (Number.isInteger(status) && status >= 100 && status <= 599 && response && typeof response === 'object' && !Array.isArray(response) &&
      Object.getOwnPropertyDescriptor(response, 'status')?.value === status) {
   // The official control codec rejects accessors and enforces the Worker
   // value byte/depth budget. Never clone or traverse arbitrary error causes.
   try { return decodeValue(encodeValue({status, response})); } catch {}
  }
 }
 const name = Object.getOwnPropertyDescriptor(cause, 'name')?.value;
 const message = Object.getOwnPropertyDescriptor(cause, 'message')?.value;
 const out = {};
 if (typeof name === 'string') out.name = name;
 if (typeof message === 'string') out.message = message;
 return Object.keys(out).length ? out : undefined;
}

function replyError(error) {
 const out = {code: error.code || 'E_PAGE_EXECUTION', name: error.name || 'Error', message: error.message};
 const cause = safeErrorCause(error);
 if (cause) out.cause = cause;
 return out;
}

// One controller owns exactly one opaque iframe/Worker, attached to one ctx.
// The sole broker remains the transport; this module has no chrome permissions,
// tabs, scripting or storage API and cannot select or retire borrowed pages.
export function createControlController({context, sandboxURL, workerURL, document: doc = document, observeResources = false, onEvent = () => {}}) {
  requireValue(context?.identity, 'E_PAGE_CONTEXT_REQUIRED');
  const root = new URL(doc.location.href);
  requireValue(workerURL===root.protocol+'//'+root.host+'/'+BUILTIN_CATALOG.controllerCore,'E_RESOURCE_URL_UNSUPPORTED');
  for (const value of [sandboxURL, workerURL]) {
    const url = new URL(value); requireValue(url.protocol === 'chrome-extension:' && url.host === root.host, 'E_RESOURCE_URL_UNSUPPORTED');
  }
  const identity = context.identity, revision = context.revision;
  const frame = doc.createElement('iframe'); frame.setAttribute('sandbox', 'allow-scripts'); frame.src = sandboxURL; frame.hidden = true;
  const win = doc.defaultView;
  const pending = new Set(); let port, send, active = true, executing = false, lastId = 0, settled = false, readyTimer, retiredTimer, retireResolve;
  let messageListening = true, abortListening = true, portOpen = false, workerAllocated = false, releaseResolve;
  const resourceReleased = new Promise(resolve => { releaseResolve = resolve; });
  const released = () => {
    if (!frame.isConnected && !pending.size && !readyTimer && !retiredTimer) releaseResolve();
  };
  const retired = new Promise(resolve => { retireResolve = resolve; });
  let readyResolve, readyReject, terminalResolve;
  const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
  const result = new Promise(resolve => { terminalResolve = resolve; });
  const resultAssembler = createResultAssembler();
  const workerSource = fetch(workerURL, {credentials: 'omit'}).then(response => { requireValue(response.ok, 'E_RESOURCE_LOAD'); return response.text(); });
  workerSource.catch(error => finish('error', {error: {code: error.code || 'E_RESOURCE_LOAD', message: error.message}}));
  function guard() { requireValue(active && !context.signal.aborted, context.signal.reason?.code || 'E_CANCELLED'); }
  function observe(event) { try { onEvent(frozenCopy(event)); } catch {} }
  function removeFrame(reason) {
    // Remove only the controller's owned opaque realm, never an execution tab.
    frame.remove(); port?.close(); portOpen = false; workerAllocated = false; clearTimeout(retiredTimer); retiredTimer = null;
    observe({kind: 'realm-retired', runId: identity.runId, reason, observedAt: Date.now(), observedMonoMs: performance.now()});
    released();
  }
  function finish(status, payload = {}) {
    if (settled) return; settled = true; active = false;
    resultAssembler.reset();
    const triggeredMonoMs = performance.now(), triggeredAt = Date.now();
    context.dispose(status === 'timeout' ? 'E_TIMEOUT' : status === 'host-closed' ? 'E_HOST_CLOSED' : 'E_CANCELLED');
    clearTimeout(readyTimer); readyTimer = null; win.removeEventListener('message', bind); messageListening = false;
    context.signal.removeEventListener('abort', abort); abortListening = false;
    send?.({kind: 'retire', runId: identity.runId, ownerEpoch: identity.ownerEpoch, reason: status});
    const record = {status, ...payload, identity, revision, triggeredAt, triggeredMonoMs};
    terminalResolve(record); readyReject(new PageError(status === 'error' ? payload.error?.code || 'E_CONTROL_EXECUTION' : context.signal.reason?.code || 'E_CANCELLED', payload.error?.message));
    // A bounded cleanup fallback if the realm cannot acknowledge. This is not a
    // claim of physical stop: native qualification observes CPU + exact target.
    retiredTimer = setTimeout(() => { removeFrame('retire-ack-timeout'); retireResolve({acknowledged: false}); }, 3000);
    if (!port) { removeFrame(status); retireResolve({acknowledged: false, workerNeverCreated: true}); }
    return record;
  }
  const abort = () => { const code = context.signal.reason?.code; finish(code === 'E_TIMEOUT' ? 'timeout' : code === 'E_HOST_CLOSED' ? 'host-closed' : 'stopped'); };
  async function operation(data) {
    guard(); requireValue(Number.isSafeInteger(data.id) && data.id === lastId + 1, 'E_OPERATION_REPLAY');
    const envelope = data.envelope;
    requireValue(envelope && envelope.identity.runId === identity.runId && envelope.identity.ownerEpoch === identity.ownerEpoch &&
      JSON.stringify(envelope.revision) === JSON.stringify(revision), 'E_OWNER_CHANGED');
    lastId = data.id;
    // Capture the original owner + target BEFORE any asynchronous permission work.
    // The injected broker must repeat this guard at every native effect dispatch.
    const captured = frozenCopy(envelope); decodeValue(captured.operation.args, {maxBytes: captured.operation.method === 'uploadChunk' ? 131072 : 65536});
    pending.add(data.id);
    try {
      guard(); const reply = await relayContextRequest(context, captured); guard();
      requireValue(reply?.requestId === captured.requestId, 'E_RESULT_FORMAT');
      send({kind: 'reply', runId: identity.runId, ownerEpoch: identity.ownerEpoch, id: data.id, reply});
    } catch (error) {
      if (active) send({kind: 'reply', runId: identity.runId, ownerEpoch: identity.ownerEpoch, id: data.id,
        reply: {requestId: captured.requestId, error: replyError(error)}});
    } finally { pending.delete(data.id); released(); }
  }
  function bind(event) {
    if (!active || event.source !== frame.contentWindow || event.origin !== 'null' || event.data?.kind !== 'sandbox-ready') return;
    requireValue(event.data.origin === 'null' && !event.data.extensionAPI && !event.data.parentAccess, 'E_SANDBOX_ISOLATION');
    win.removeEventListener('message', bind); messageListening = false;
    const channel = new MessageChannel(); port = channel.port1; portOpen = true; send = port.postMessage.bind(port);
    port.onmessage = ({data}) => {
      if (data.kind === 'host-bound') {
        workerSource.then(source => { if (active) send({kind: 'start', identity, revision, target: context.target, workerSource: source, observeResources}); }).catch(() => {}); return;
      }
      if (data.runId !== identity.runId || data.ownerEpoch !== identity.ownerEpoch) { observe({kind: 'rejected-peer'}); return; }
      if (data.kind === 'worker-created') workerAllocated = true;
      // Never mirror returned business values or HTML bytes into technical
      // event streams. Only the authorized durable result path displays them.
      const resultKind = ['result','result-begin','result-part','result-end'].includes(data.kind);
      if (!resultKind) observe(data);
      if (data.kind === 'retired') { removeFrame(data.reason); retireResolve({...data, acknowledged: true}); return; }
      if (!active) return;
      if (data.kind === 'bound') { clearTimeout(readyTimer); readyTimer = null; readyResolve(data.identity); return; }
      if (data.kind === 'operation') { operation(data).catch(error => observe({kind: 'rejected-operation', code: error.code})); return; }
      if (resultKind) {
        try {
          const completed=resultAssembler.accept(data);
          if(completed)finish('succeeded',{value:completed.wire});
        } catch(error) {finish('error',{error:{code:error.code||'E_RESULT_FORMAT',message:error.message}});}
        return;
      }
      if (data.kind === 'error') finish('error', {error: data.error});
    };
    port.start(); frame.contentWindow.postMessage({kind: 'bind-host'}, '*', [channel.port2]);
  }
  win.addEventListener('message', bind); context.signal.addEventListener('abort', abort, {once: true});
  readyTimer = setTimeout(() => finish('error', {error: {code: 'E_SANDBOX_TIMEOUT'}}), 10000);
  doc.body.append(frame); if (context.signal.aborted) abort();
  return Object.freeze({ready, result, retired, resourceReleased,
    async execute(body, params) {
      requireValue(typeof body === 'string' && !executing, 'E_ARGUMENT_TYPE'); encodeValue(params); await ready; guard(); executing = true;
      send({kind: 'execute', runId: identity.runId, ownerEpoch: identity.ownerEpoch, body, params: structuredClone(params)}); return result;
    },
    stop: () => finish('stopped'), close: () => finish('host-closed'),
    async observeResource() { await ready; guard(); send({kind: 'observe-resource', runId: identity.runId, ownerEpoch: identity.ownerEpoch}); },
    resourceSnapshot: () => ({pending:pending.size,timers:Number(readyTimer != null)+Number(retiredTimer != null),
      subscriptions:Number(messageListening)+Number(abortListening),ports:Number(portOpen),workers:Number(workerAllocated),blobs:0}),
    snapshot: () => ({active, settled, pending: pending.size, ownedFrames: frame.isConnected ? 1 : 0, hostPorts: port && frame.isConnected ? 1 : 0})});
}
