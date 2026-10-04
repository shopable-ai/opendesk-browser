import {createRunContext} from '../../framework/context.js';
import {PageError, requireValue, frozenCopy} from '../../framework/control/value.js';

// The transferred port is held only by this closure; no global RPC listener or
// runtime.sendMessage is exposed to user code. This is a client, not authority.
export function createWorkerPageProxy({port, identity, revision, target, deadline = null}) {
  requireValue(port && typeof port.postMessage === 'function', 'E_PAGE_CONTEXT_REQUIRED');
  const send = port.postMessage.bind(port), add = port.addEventListener.bind(port), remove = port.removeEventListener.bind(port);
  const close = port.close.bind(port), start = port.start.bind(port), clone = structuredClone;
  const NativePromise = Promise, MapType = Map, pending = new MapType();
  const get = pending.get.bind(pending), put = pending.set.bind(pending), del = pending.delete.bind(pending);
  const identityPin = frozenCopy(identity); let sequence = 0, closed = false;
  const lifetime = new AbortController();
  const transport = Object.freeze({request(envelope, {signal}) {
    if (closed || signal.aborted) return NativePromise.reject(signal.reason || new PageError('E_CANCELLED'));
    const id = ++sequence;
    return new NativePromise((resolve, reject) => {
      const abort = () => { const waiter = get(id); if (!waiter) return; del(id); reject(signal.reason || new PageError('E_CANCELLED')); };
      put(id, {requestId: envelope.requestId, resolve, reject, signal, abort}); signal.addEventListener('abort', abort, {once: true});
      try { send({kind: 'operation', runId: identityPin.runId, ownerEpoch: identityPin.ownerEpoch, id, envelope: clone(envelope)}); }
      catch (error) { del(id); signal.removeEventListener('abort', abort); reject(new PageError('E_VALUE_SERIALIZATION', error.message)); }
    });
  }});
  const context = createRunContext({identity: identityPin, revision, target, deadline, transport, signal: lifetime.signal, dom: null});
  function receive({data}) {
    if (closed || data?.runId !== identityPin.runId || data?.ownerEpoch !== identityPin.ownerEpoch || data.kind !== 'reply' || !Number.isSafeInteger(data.id)) return;
    const waiter = get(data.id); if (!waiter || data.reply?.requestId !== waiter.requestId) return;
    del(data.id); waiter.signal.removeEventListener('abort', waiter.abort); waiter.resolve(data.reply);
  }
  add('message', receive); start();
  function dispose(code = 'E_CANCELLED') {
    if (closed) return; closed = true; lifetime.abort(new PageError(code)); context.dispose(code);
    remove('message', receive); close(); pending.clear();
  }
  return Object.freeze({page: context.page, context, dispose, snapshot: () => ({pending: pending.size, ...context.snapshot()})});
}
