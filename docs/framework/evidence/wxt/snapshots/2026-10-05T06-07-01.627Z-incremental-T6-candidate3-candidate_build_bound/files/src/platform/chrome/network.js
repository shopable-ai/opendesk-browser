import {fail, httpUrl, normalizeConfig, jsonValue, SDK_LIMITS} from '../../framework/sdk/registry.js';
import {IP_INFO_URL} from '../../framework/utils/network-info.js';

function abortable(operation, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason); return; }
    const aborted = () => { signal.removeEventListener('abort', aborted); reject(signal.reason); };
    signal.addEventListener('abort', aborted, {once: true});
    Promise.resolve(operation).then(value => { signal.removeEventListener('abort', aborted); resolve(value); }, error => {
      signal.removeEventListener('abort', aborted); reject(error);
    });
  });
}

async function readBody(response, maxBytes, signal) {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks = []; let length = 0;
  const cancel = () => { reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancel, {once: true});
  try {
    for (;;) {
      if (signal.aborted) throw signal.reason;
      const {value, done} = await reader.read(); if (done) break;
      length += value.byteLength;
      if (length > maxBytes) { await reader.cancel(); throw fail('E_LIMIT', 'HTTP response exceeds byte budget'); }
      chunks.push(value);
    }
    if (signal.aborted) throw signal.reason;
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    try { return new TextDecoder('utf-8', {fatal: true}).decode(bytes); } catch { throw fail('E_VALUE_SERIALIZATION', 'Invalid HTTP UTF8', {stage: 'utf8'}); }
  } finally { signal.removeEventListener('abort', cancel); reader.releaseLock(); }
}
export function createNetworkService({fetchImpl = globalThis.fetch, authorize, clock = Date,
  maxResponseBytes = SDK_LIMITS.responseBytes, setTimer = setTimeout, clearTimer = clearTimeout, networkInfoEnabled = false} = {}) {
  async function request({method, url, data, config}, context = {}) {
    if (!['GET', 'POST', 'PUT', 'DELETE'].includes(method)) throw fail('E_SERVICE_UNSUPPORTED');
    const normalized = normalizeConfig(config);
    if (data !== undefined) jsonValue(data);
    const target = new URL(httpUrl(url));
    for (const [name, value] of Object.entries(normalized.params ?? {})) {
      if (value === null || value === undefined) continue;
      for (const item of Array.isArray(value) ? value : [value]) {
        if (item !== null && item !== undefined) target.searchParams.append(Array.isArray(value) ? `${name}[]` : name, String(item));
      }
    }
    if (!authorize) throw fail('E_PERMISSION', 'HTTP driver requires broker authorization');
    if (context.signal?.aborted) throw fail('E_CANCELLED');
    const controller = new AbortController();
    const abort = () => controller.abort(fail('E_CANCELLED'));
    context.signal?.addEventListener('abort', abort, {once: true});
    const timeout = Math.min(normalized.timeout ?? SDK_LIMITS.serviceBudgetMs, SDK_LIMITS.serviceBudgetMs,
      context.deadlineAt === undefined ? SDK_LIMITS.maxTimeoutMs : context.deadlineAt - clock.now());
    if (timeout <= 0) { context.signal?.removeEventListener('abort', abort); throw fail('E_TIMEOUT'); }
    const timer = setTimer(() => controller.abort(fail('E_TIMEOUT')), timeout);
    try {
      await abortable(authorize({capability: 'network', url: target.href, method, phase: 'pre'}, context), controller.signal);
      const headers = {...normalized.headers};
      let body;
      if (data !== undefined && ['POST', 'PUT'].includes(method)) {
        body = typeof data === 'string' ? data : JSON.stringify(data);
        if (new TextEncoder().encode(body).byteLength > SDK_LIMITS.requestBytes) throw fail('E_LIMIT');
        if (typeof data !== 'string' && !headers['content-type']) headers['content-type'] = 'application/json';
      }
      context.assertDispatch?.();
      const response = await fetchImpl(target.href, {method, headers, body, credentials: 'omit', redirect: 'manual', signal: controller.signal});
      if (response.type === 'opaque' || response.type === 'opaqueredirect') throw fail('E_NETWORK', 'HTTP response is not observable');
      const text = await readBody(response, maxResponseBytes, controller.signal);
      let responseData = text;
      if (normalized.responseType === 'json') {
        try { responseData = text ? JSON.parse(text) : ''; } catch { throw fail('E_VALUE_SERIALIZATION', 'Invalid HTTP JSON', {stage: 'json'}); }
      } else if (normalized.responseType !== 'text' && text) {
        try { responseData = JSON.parse(text); } catch { /* Axios default also allows text. */ }
      }
      const responseHeaders = {};
      for (const [name, value] of response.headers.entries()) {
        if (!/^(set-cookie|set-cookie2|www-authenticate|proxy-authenticate)$/i.test(name)) responseHeaders[name] = value;
      }
      const projection = {data: responseData, status: response.status, statusText: response.statusText,
        headers: responseHeaders, config: {...normalized, method: method.toLowerCase(), url: target.href}};
      await abortable(context.recordNativeReceipt?.(projection), controller.signal);
      if (!response.ok) throw fail('E_HTTP', `HTTP ${response.status}`, {status: response.status, response: projection});
      if (context.method?.startsWith('AXIOS_')) await context.recordEffect?.(projection);
      await abortable(authorize({capability: 'network', url: target.href, method, phase: 'post'}, context), controller.signal);
      if (controller.signal.aborted) throw controller.signal.reason;
      return projection;
    } catch (error) {
      if (controller.signal.aborted) throw controller.signal.reason;
      if (error?.code) throw error;
      throw fail('E_NETWORK', 'HTTP transport failed');
    } finally { clearTimer(timer); context.signal?.removeEventListener('abort', abort); }
  }
  async function checkServer({server, timeout = 5000}, context) {
    const start = clock.now();
    try {
      await request({method: 'GET', url: server, config: {timeout}}, context);
      return {server, latency: Math.max(0, clock.now() - start), available: true};
    } catch (error) {
      if (!['E_NETWORK', 'E_HTTP', 'E_TIMEOUT', 'E_VALUE_SERIALIZATION', 'E_LIMIT'].includes(error.code)) throw error;
      return {server, latency: null, available: false, error: error.message, errorCode: error.code};
    }
  }
  async function getIpInfo({ip} = {}, context) {
    if (!networkInfoEnabled || !authorize) throw fail('E_CAPABILITY', 'External network information is disabled');
    const url = ip ? `${IP_INFO_URL}&ip=${ip}` : IP_INFO_URL;
    await authorize({capability: 'network.info', url, method: 'GET', phase: 'pre'}, context);
    return (await request({method: 'GET', url, config: {}}, context)).data;
  }
  return Object.freeze({request, checkServer, getIpInfo});
}
