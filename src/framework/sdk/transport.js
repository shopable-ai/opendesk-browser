import {encodeValue, decodeValue} from '../../platform/page-port/codec.js';
import {projectFoundationError} from '../../platform/protocol.js';
import {PROTOCOL, SDK_VERSION, SDK_LIMITS, SDK_REQUEST_EVENT, SDK_RESULT_EVENT, SDK_HELLO_EVENT, SDK_READY_EVENT, fail} from './registry.js';

function errorFromWire(value) {
  const {code,message,...details} = projectFoundationError(value);
  return fail(typeof code === 'string' ? code : 'E_EFFECT_UNKNOWN',message,details);
}
export function createWindowTransport({window = globalThis.window, CustomEvent = globalThis.CustomEvent,
  setTimer = setTimeout, clearTimer = clearTimeout, helloTimeoutMs = SDK_LIMITS.timeoutMs} = {}) {
  if (!window || !CustomEvent) throw fail('E_RESOURCE_UNAVAILABLE', 'SDK window transport unavailable', {stage: 'lookup'});
  const waiting = new Map(), helloSlot = Symbol('sdk-hello'); let disposed = false;
  const counts = () => Object.freeze({pending: waiting.size, timers: waiting.size, subscriptions: disposed ? 0 : 3, ports: 0, workers: 0, blobs: 0});
  const resourceDiagnostics = () => Object.freeze({scope: 'transport.window', counts: counts(), observationMissing: null});
  const parse = detail => {
    if (typeof detail !== 'string' || new TextEncoder().encode(detail).byteLength > SDK_LIMITS.responseBytes * 2) throw fail('E_VALUE_SERIALIZATION', 'Invalid SDK response', {stage: 'json'});
    try { return JSON.parse(detail); } catch { throw fail('E_VALUE_SERIALIZATION', 'Invalid SDK response JSON', {stage: 'json'}); }
  };
  const receive = event => {
    let message;
    try { message = parse(event.detail); } catch { return; }
    if (message.protocol !== PROTOCOL) return;
    const isHello = event.type === SDK_READY_EVENT;
    const id = isHello ? helloSlot : message.requestId;
    const entry = waiting.get(id);
    if (!entry || isHello && message.helloId !== entry.helloId) return;
    waiting.delete(id); clearTimer(entry.timer);
    try {
      if (message.response?.ok !== true) throw errorFromWire(message.response?.error);
      const data = message.response.data;
      if (isHello) entry.resolve(data);
      else {
        if (!Object.hasOwn(data ?? {}, 'valueWire')) throw fail('E_VALUE_SERIALIZATION', 'Admission ACK is not a final result', {stage: 'json'});
        entry.resolve({requestId: id, result: decodeValue(data.valueWire, {maxBytes: SDK_LIMITS.responseBytes})});
      }
    } catch (error) { entry.reject(error); }
  };
  window.addEventListener(SDK_READY_EVENT, receive);
  window.addEventListener(SDK_RESULT_EVENT, receive);
  const send = (eventName, message, id, timeoutMs) => {
    if (disposed) return Promise.reject(fail('E_CANCELLED'));
    if (waiting.has(id)) return Promise.reject(fail('E_REQUEST_CONFLICT'));
    return new Promise((resolve, reject) => {
      const entry = {resolve, reject, helloId:message.helloId};
      entry.timer = setTimer(() => {
        if (waiting.get(id) !== entry) return;
        waiting.delete(id); reject(fail('E_TIMEOUT', 'SDK transport deadline exceeded'));
      }, timeoutMs);
      waiting.set(id, entry);
      try { window.dispatchEvent(new CustomEvent(eventName, {detail: JSON.stringify(message)})); }
      catch (error) { if (waiting.get(id) === entry) waiting.delete(id); clearTimer(entry.timer); reject(error); }
    });
  };
  const dispose = () => {
    if (disposed) return; disposed = true;
    window.removeEventListener(SDK_READY_EVENT, receive); window.removeEventListener(SDK_RESULT_EVENT, receive);
    window.removeEventListener('pagehide', dispose);
    for (const entry of waiting.values()) { clearTimer(entry.timer); entry.reject(fail('E_CANCELLED', 'SDK document closed')); }
    waiting.clear();
  };
  window.addEventListener('pagehide', dispose, {once: true});
  return Object.freeze({hello: () => {
    // Local correlation only. The relay strips it before the frozen native Hello.
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
    const helloId = [...bytes].map(byte => byte.toString(16).padStart(2,'0')).join('');
    return send(SDK_HELLO_EVENT, {protocol: PROTOCOL, type: 'SDK_HELLO', helloId,
      payload: {sdkVersion: SDK_VERSION}}, helloSlot, helloTimeoutMs);
  },
    request: request => send(SDK_REQUEST_EVENT, {protocol: PROTOCOL, type: 'SDK_REQUEST', payload: {
      requestId: request.requestId, method: request.method, argsWire: encodeValue(request.args, {maxBytes: SDK_LIMITS.requestBytes}), deadlineAt: request.deadlineAt
    }}, request.requestId, Math.max(1, request.deadlineAt - Date.now())),
    cancel(id) {
      const entry = waiting.get(id); if (!entry) return;
      waiting.delete(id); clearTimer(entry.timer); entry.reject(fail('E_CANCELLED', 'SDK request settled'));
    }, dispose, diagnostics: () => ({scope: 'transport.window', pending: waiting.size, disposed, counts: counts(), observationMissing: null, resources: [resourceDiagnostics()]}),
    resourceDiagnostics});
}
