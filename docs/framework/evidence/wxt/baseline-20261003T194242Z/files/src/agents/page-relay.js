import {decodeValue, encodeValue} from '../platform/page-port/codec.js';
import {PROTOCOL, SDK_VERSION, SDK_LIMITS, SDK_REQUEST_EVENT, SDK_RESULT_EVENT, SDK_HELLO_EVENT, SDK_READY_EVENT,
  validateSdkRequest, fields, fail} from '../framework/sdk/registry.js';
import {CHROME_PAGE_EXECUTE, CustomChromeEvt} from '../framework/events.js';

export function installPageRelay({window = globalThis.window, api = globalThis.chrome, CustomEvent = globalThis.CustomEvent,
  clock = Date, setTimer = setTimeout, clearTimer = clearTimeout} = {}) {
  const pending = new Map(); let disposed = false;
  const projectError = error => ({code: error?.code ?? 'E_EFFECT_UNKNOWN', message: error?.message ?? 'SDK relay failed',
    ...Object.fromEntries(['stage', 'status', 'response'].filter(key => Object.hasOwn(error ?? {}, key)).map(key => [key, error[key]]))});
  const publish = (type, requestId, response, helloId) => {
    window.dispatchEvent(new CustomEvent(type, {detail: JSON.stringify({protocol: PROTOCOL,
      ...(requestId ? {requestId} : {}), ...(helloId ? {helloId} : {}), response})}));
  };
  const finish = (entry, digest, response) => {
    // Timers and callbacks belong to this dispatch, never to the next use of its ID.
    if (pending.get(entry) !== digest) return;
    clearTimer(entry.timer); pending.delete(entry);
    publish(entry.responseEvent, entry.hello ? undefined : entry.id, response, entry.helloId);
  };
  const nativeSend = message => new Promise((resolve, reject) => {
    try {
      api.runtime.sendMessage(message, response => {
        if (api.runtime.lastError) reject(fail('E_EFFECT_UNKNOWN', api.runtime.lastError.message)); else resolve(response);
      });
    } catch (error) { reject(fail('E_EFFECT_UNKNOWN', error.message)); }
  });
  async function messager(event) {
    if (disposed) return;
    let id, helloId, entry, digest, responseEvent = event.type === SDK_HELLO_EVENT ? SDK_READY_EVENT : SDK_RESULT_EVENT;
    try {
      if ([CHROME_PAGE_EXECUTE, CustomChromeEvt].includes(event.type)) {
        publish(SDK_RESULT_EVENT, undefined, {ok: false, error: projectError(fail(event.type === CHROME_PAGE_EXECUTE ? 'E_CAPABILITY' : 'E_SERVICE_UNSUPPORTED'))});
        return;
      }
      if (typeof event.detail !== 'string' || new TextEncoder().encode(event.detail).byteLength > SDK_LIMITS.requestBytes * 2) throw fail('E_SCHEMA');
      let message;
      try { message = JSON.parse(event.detail); } catch { throw fail('E_VALUE_SERIALIZATION', 'Invalid SDK JSON', {stage: 'json'}); }
      id = event.type === SDK_HELLO_EVENT ? 'hello' : message.payload?.requestId;
      if (event.type === SDK_HELLO_EVENT) {
        helloId = message.helloId;
        if (helloId !== undefined && (typeof helloId !== 'string' || !/^[a-f0-9]{32}$/.test(helloId))) throw fail('E_SCHEMA');
        fields(message, ['protocol', 'type', 'payload', 'helloId'], ['protocol', 'type', 'payload']);
      } else fields(message, ['protocol', 'type', 'payload'], ['protocol', 'type', 'payload']);
      if (message.protocol !== PROTOCOL) throw fail('E_VERSION');
      let timeout = SDK_LIMITS.timeoutMs;
      if (event.type === SDK_HELLO_EVENT) {
        if (message.type !== 'SDK_HELLO') throw fail('E_SCHEMA');
        fields(message.payload, ['sdkVersion'], ['sdkVersion']);
        if (message.payload.sdkVersion !== SDK_VERSION) throw fail('E_VERSION');
        // Hello incarnation belongs only to this window/relay response channel.
        message = {protocol:message.protocol, type:message.type, payload:message.payload};
      } else if (event.type === SDK_REQUEST_EVENT) {
        if (message.type !== 'SDK_REQUEST') throw fail('E_SCHEMA');
        fields(message.payload, ['requestId', 'method', 'argsWire', 'deadlineAt'], ['requestId', 'method', 'argsWire', 'deadlineAt']);
        const {argsWire, ...request} = message.payload;
        const normalized = validateSdkRequest({...request, args: decodeValue(argsWire, {maxBytes: SDK_LIMITS.requestBytes})});
        timeout = normalized.deadlineAt - clock.now();
        if (timeout <= 0 || timeout > SDK_LIMITS.maxTimeoutMs) throw fail('E_TIMEOUT');
        message = {...message, payload: {...request, argsWire: encodeValue(normalized.args, {maxBytes: SDK_LIMITS.requestBytes})}};
      } else throw fail(event.type === CHROME_PAGE_EXECUTE ? 'E_CAPABILITY' : 'E_SERVICE_UNSUPPORTED');
      digest = JSON.stringify(event.type === SDK_HELLO_EVENT ? [message.payload.sdkVersion] :
        [message.payload.method, message.payload.argsWire, message.payload.deadlineAt]); // Canonical codec, method and original deadline.
      if (pending.size >= SDK_LIMITS.pending + 1) throw fail('E_LIMIT');
      entry = {id, responseEvent, hello: event.type === SDK_HELLO_EVENT, helloId};
      entry.timer = setTimer(() => finish(entry, digest, {ok: false, error: {code: 'E_TIMEOUT', message: 'Relay deadline exceeded'}}), timeout);
      pending.set(entry, digest);
      // Every valid event reaches the sole broker's atomic admission/digest check.
      // Identity, namespace, host registration and grants are never synthesized here.
      const response = await nativeSend(message);
      if (disposed) return;
      if (response?.ok !== true) finish(entry, digest, {ok: false, error: projectError(response?.error)});
      else if (entry.hello) {
        if (response.data?.sdkVersion !== SDK_VERSION || response.data?.ready !== true) throw fail('E_VERSION', 'Broker Hello is not ready');
        finish(entry, digest, response);
      } else {
        if (!Object.hasOwn(response.data ?? {}, 'valueWire')) throw fail('E_EFFECT_UNKNOWN', 'Broker has not supplied a final SDK result');
        decodeValue(response.data.valueWire, {maxBytes: SDK_LIMITS.responseBytes});
        finish(entry, digest, response);
      }
    } catch (error) {
      const response = {ok: false, error: projectError(error)};
      if (entry) finish(entry, digest, response);
      else if (id) publish(responseEvent, event.type === SDK_HELLO_EVENT ? undefined : id, response, helloId);
    }
  }
  const events = [SDK_HELLO_EVENT, SDK_REQUEST_EVENT, CHROME_PAGE_EXECUTE, CustomChromeEvt];
  const removeEventListeners = () => {
    if (disposed) return;
    disposed = true;
    for (const [entry, digest] of pending) finish(entry, digest,
      {ok: false, error: {code: 'E_CANCELLED', message: 'Relay document closed'}});
    events.forEach(type => window.removeEventListener(type, messager)); window.removeEventListener('pagehide', removeEventListeners);
  };
  events.forEach(type => window.addEventListener(type, messager));
  window.addEventListener('pagehide', removeEventListeners, {once: true});
  return Object.freeze({messager, removeEventListeners, diagnostics: () => ({pending: pending.size, subscriptions: disposed ? 0 : events.length + 1, disposed})});
}
if (typeof chrome !== 'undefined' && typeof window !== 'undefined') {
  const marker = '__openDeskSdkRelayV1';
  if (!globalThis[marker]) Object.defineProperty(globalThis, marker, {value: installPageRelay()});
}
