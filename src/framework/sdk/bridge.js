import {fail, normalizeMethod, SDK_LIMITS, SDK_VERSION, ADMITTED_METHODS} from './registry.js';
import {decodeBase64} from '../../platform/page-port/codec.js';

export const CHROME_PAGE_TYPE = 'CHROME_EXTENSION';
export function generateEventId(cryptoApi = globalThis.crypto) { return cryptoApi.randomUUID(); }
export function legacyResult(value) {
  return {PageBrigeCode: 0, message: '', data: value};
}
export function createSdkBridge({transport, decodeBase64Json = value => {
  const text = decodeBase64(value);
  try { return JSON.parse(text); } catch { throw fail('E_VALUE_SERIALIZATION', 'Invalid callback JSON', {stage: 'json'}); }
}, clock = Date, makeId = generateEventId,
  setTimer = setTimeout, clearTimer = clearTimeout, timeoutMs = SDK_LIMITS.timeoutMs} = {}) {
  if (!transport || typeof transport.request !== 'function' || typeof transport.hello !== 'function') throw fail('E_SCHEMA', 'Explicit SDK transport required');
  const pending = new Map(), ChromeBridgeEvents = new Map();
  let disposed = false, hello, allowedMethods;
  const counts = () => Object.freeze({pending: pending.size, timers: pending.size, subscriptions: ChromeBridgeEvents.size, ports: 0, workers: 0, blobs: 0});
  const resourceDiagnostics = () => Object.freeze({scope: 'bridge', counts: counts(), observationMissing: null});
  const settle = (requestId, failed, value) => {
    const entry = pending.get(requestId);
    if (!entry) return false;
    pending.delete(requestId); clearTimer(entry.timer);
    Map.prototype.delete.call(ChromeBridgeEvents, requestId);
    transport.cancel?.(requestId);
    if (failed) entry.reject(value); else entry.resolve(value);
    return true;
  };
  function ChromeBridgeOperationCompleted(requestId, result, isBase64 = false) {
    if (!pending.has(requestId)) return '';
    try {
      let body = result;
      if (typeof result === 'string') {
        if (isBase64) {
          if (!decodeBase64Json) throw fail('E_VALUE_SERIALIZATION', 'Base64 codec unavailable', {stage: 'base64'});
          body = decodeBase64Json(result);
        } else {
          try { body = JSON.parse(result); } catch { throw fail('E_VALUE_SERIALIZATION', 'Invalid callback JSON', {stage: 'json'}); }
        }
      }
      if (!body || typeof body !== 'object' || !Object.hasOwn(body, 'PageBrigeCode')) throw fail('E_VALUE_SERIALIZATION', 'Invalid legacy result shape', {stage: 'json'});
      // Keep old business rejection values and falsy/undefined result values exactly.
      settle(requestId, Boolean(body.PageBrigeCode), body.PageBrigeCode ? body.message : body.data);
    } catch (error) { settle(requestId, true, error.code ? error : fail('E_VALUE_SERIALIZATION', 'Invalid callback', {stage: 'json'})); }
    return '';
  }
  const ready = () => {
    if (disposed) return Promise.reject(fail('E_CANCELLED', 'SDK document disposed'));
    hello ??= Promise.resolve().then(() => transport.hello({sdkVersion: SDK_VERSION})).then(result => {
      if (!result || result.sdkVersion !== SDK_VERSION || result.ready !== true || !Array.isArray(result.methods) ||
          result.methods.length > Object.keys(ADMITTED_METHODS).length || new Set(result.methods).size !== result.methods.length ||
          !result.methods.every(method => Object.hasOwn(ADMITTED_METHODS, method))) throw fail('E_VERSION', 'SDK Hello was not accepted');
      allowedMethods = new Set(result.methods);
      return result;
    });
    return hello;
  };
  async function call(method, args = {}) {
    if (disposed) throw fail('E_CANCELLED', 'SDK document disposed');
    const normalized = normalizeMethod(method, args);
    if (pending.size >= SDK_LIMITS.pending) throw fail('E_LIMIT', 'SDK pending budget exceeded');
    const requestId = makeId();
    if (pending.has(requestId)) throw fail('E_REQUEST_CONFLICT', 'SDK request ID collision');
    return new Promise((resolve, reject) => {
      const deadlineAt = clock.now() + timeoutMs;
      const timer = setTimer(() => settle(requestId, true, fail('E_TIMEOUT', 'SDK request deadline exceeded')), timeoutMs);
      pending.set(requestId, {resolve, reject, timer, deadlineAt});
      Map.prototype.set.call(ChromeBridgeEvents, requestId, Object.freeze({
        resolve: value => settle(requestId, false, value), reject: error => settle(requestId, true, error)
      }));
      ready().then(() => {
        if (!pending.has(requestId)) return;
        if (!allowedMethods.has(method)) throw fail('E_CAPABILITY', 'Method is absent from broker Hello allowlist');
        return transport.request({requestId, method, args: normalized, deadlineAt});
      }).then(response => {
        if (!pending.has(requestId) || response === undefined) return;
        // Admission ACK is not the operation result. Async transport calls complete later.
        if (response.accepted === true && !Object.hasOwn(response, 'result')) return;
        if (response.requestId !== requestId || !Object.hasOwn(response, 'result')) throw fail('E_VALUE_SERIALIZATION', 'Missing final SDK result', {stage: 'json'});
        ChromeBridgeOperationCompleted(requestId, response.result);
      }).catch(error => settle(requestId, true, error));
    });
  }
  const callChromeBridgeInterface = (method, params = {}) => {
    const args = {...params};
    if (method.startsWith('AXIOS_')) { args.url = args.BridgeUrl_Inject; delete args.BridgeUrl_Inject; }
    return call(method, args);
  };
  return Object.freeze({call, callChromeBridgeInterface, ready, ChromeBridgeOperationCompleted, ChromeBridgeEvents,
    executeScript() { throw fail('E_CAPABILITY', 'Raw page scripts are not an admitted SDK service'); },
    dispose(error = fail('E_CANCELLED', 'SDK document disposed')) {
      if (disposed) return; disposed = true;
      for (const requestId of pending.keys()) settle(requestId, true, error);
      transport.dispose?.();
    }, diagnostics: () => ({scope: 'bridge', pending: pending.size, disposed, counts: counts(), observationMissing: null, resources: [resourceDiagnostics()]}),
    resourceDiagnostics});
}
