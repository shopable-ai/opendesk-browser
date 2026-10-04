import {createBoundPage} from './ChromePage.js';
import {PageError, requireValue, frozenCopy, encodeValue, decodeValue, newPageRequestId} from './control/value.js';

const relays = new WeakMap();
function same(a, b) {
  if (!a || !b) return a === b;
  const keys = Object.keys(a).sort(), other = Object.keys(b).sort();
  return keys.length === other.length && keys.every((key, i) => key === other[i] &&
    (a[key] && typeof a[key] === 'object' ? same(a[key], b[key]) : Object.is(a[key], b[key])));
}
// Internal host relay for a private Worker request; it uses the context's sole
// injected transport and the same owner/target fencing as host facade calls.
export function relayContextRequest(context, envelope) {
  const relay = relays.get(context); requireValue(relay, 'E_PAGE_CONTEXT_REQUIRED'); return relay(envelope);
}

// Admission, pinning and target authentication are performed by the one broker.
// The injected transport must be exclusive to this admitted owner, not an active-tab resolver.
export function createRunContext({identity, revision, target = identity?.target, transport, signal, deadline = null, dom = globalThis.document}) {
  requireValue(identity && typeof identity.runId === 'string' && identity.runId && Number.isSafeInteger(identity.ownerEpoch) && identity.ownerEpoch > 0,
    'E_PAGE_CONTEXT_REQUIRED', 'An admitted owner identity is required');
  requireValue(revision && Number.isSafeInteger(revision.revision) && revision.revision > 0 && /^[a-f0-9]{64}$/.test(revision.sourceHash),
    'E_PAGE_CONTEXT_REQUIRED', 'A committed revision pin is required');
  requireValue(target && Number.isSafeInteger(target.tabId) && target.tabId >= 0 && Number.isSafeInteger(target.frameId) && target.frameId >= 0 && typeof target.documentId === 'string' && target.documentId,
    'E_PAGE_CONTEXT_REQUIRED', 'An authenticated tab/frame/document is required');
  requireValue(transport && typeof transport.request === 'function', 'E_PAGE_CONTEXT_REQUIRED', 'An owner-bound transport is required');
  requireValue(deadline === null || (Number.isFinite(deadline) && deadline >= 0), 'E_ARGUMENT_TYPE');
  const owner = frozenCopy(identity), pin = frozenCopy(revision);
  let current = frozenCopy(target), closed;
  const lifetime = new AbortController(), pending = new Set();
  function dispose(code = 'E_CANCELLED') {
    if (closed) return;
    closed = new PageError(code); lifetime.abort(closed);
    if (timer !== null) clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
    for (const reject of pending) reject(closed);
    pending.clear();
  }
  const abort = () => dispose(typeof signal.reason?.code === 'string' ? signal.reason.code : 'E_CANCELLED');
  let timer = null;
  if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, {once: true});
  if (!closed && deadline !== null) timer = setTimeout(() => dispose('E_TIMEOUT'), Math.max(0, deadline - performance.now()));
  function guard(bound = current) {
    if (closed) throw closed;
    if (deadline !== null && performance.now() >= deadline) { dispose('E_TIMEOUT'); throw closed; }
    requireValue(same(bound, current), 'E_DOCUMENT_REPLACED');
  }
  async function exchange(envelope, navigation) {
    const captured = envelope.target, requestId = envelope.requestId; guard(captured);
    let rejectPending;
    const cancelled = new Promise((_, reject) => { rejectPending = reject; pending.add(reject); });
    try {
      guard(captured);
      const reply = await Promise.race([transport.request(envelope, {signal: lifetime.signal}), cancelled]);
      guard(captured);
      requireValue(reply && reply.requestId === requestId, 'E_RESULT_FORMAT', 'Reply must correlate with the original request');
      if (reply.error) throw new PageError(reply.error.code || 'E_PAGE_EXECUTION', reply.error.message, reply.error.cause);
      const result = decodeValue(reply.value);
      if (navigation) {
        // Only a trusted transport may attest the broker's completed navigation handoff.
        const handoff = reply.handoff;
        requireValue(handoff && handoff.from.documentId === captured.documentId && handoff.from.tabId === captured.tabId &&
          handoff.from.frameId === captured.frameId && handoff.to.tabId === captured.tabId && handoff.to.frameId === captured.frameId &&
          typeof handoff.to.documentId === 'string' && handoff.to.documentId && Number.isSafeInteger(handoff.to.targetVersion) &&
          handoff.to.targetVersion > (captured.targetVersion || 0), 'E_DOCUMENT_REPLACED', 'A trusted navigation handoff is required');
        guard(captured); current = frozenCopy(handoff.to);
      }
      return {reply, result};
    } finally { pending.delete(rejectPending); }
  }
  async function request(method, args, {kind = 'packaged', target: bound = current, navigation = false} = {}) {
    guard(bound);
    // Serialization precedes request registration; malformed args never reach transport.
    const encoded = encodeValue(args, {maxBytes: method === 'uploadChunk' ? 131072 : 65536});
    const captured = frozenCopy(bound);
    const envelope = Object.freeze({requestId: newPageRequestId(), identity: frozenCopy({...owner, target: captured}), revision: pin, target: captured,
      operation: Object.freeze({kind, method, args: encoded})});
    return (await exchange(envelope, navigation)).result;
  }
  const binding = Object.freeze({request, guard, capture: () => current, dom, environment: 'CHROME'});
  class SessionChromePage {
    constructor(options) { return createBoundPage(binding, options); }
  }
  const page = createBoundPage(binding);
  const context = Object.freeze({identity: owner, revision: pin, get target() { return current; }, page, ChromePage: SessionChromePage,
    signal: lifetime.signal, dispose, snapshot: () => Object.freeze({closed: closed?.code || null, pending: pending.size, timer: timer === null || closed ? 0 : 1})});
  relays.set(context, async envelope => {
    guard();
    requireValue(envelope && typeof envelope.requestId === 'string' && envelope.requestId && same(envelope.identity, {...owner, target: current}) && same(envelope.revision, pin), 'E_OWNER_CHANGED');
    guard(envelope.target);
    const captured = frozenCopy(envelope);
    const args = decodeValue(captured.operation.args, {maxBytes: captured.operation.method === 'uploadChunk' ? 131072 : 65536});
    requireValue(Array.isArray(args), 'E_ARGUMENT_TYPE');
    return (await exchange(captured, captured.operation.kind === 'browser' && ['goto', 'reload'].includes(captured.operation.method))).reply;
  });
  return context;
}
