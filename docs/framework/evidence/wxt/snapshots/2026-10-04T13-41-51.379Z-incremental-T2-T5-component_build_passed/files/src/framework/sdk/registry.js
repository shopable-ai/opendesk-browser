import {FoundationError, PROTOCOL} from '../../platform/protocol.js';

export {PROTOCOL};
export const SDK_VERSION = '1.0.0';
export const SDK_REQUEST_EVENT = 'CHROME_BRIDGE_INTERFACE';
export const SDK_RESULT_EVENT = 'OPEN_DESK_SDK_RESULT';
export const SDK_HELLO_EVENT = 'OPEN_DESK_SDK_HELLO';
export const SDK_READY_EVENT = 'OPEN_DESK_SDK_READY';
export const SDK_FILES = Object.freeze({relay: 'agents/page-relay.js', main: 'framework/sdk-main.js'});
export const SDK_LIMITS = Object.freeze({pending: 100, requestBytes: 65536, responseBytes: 262144, timeoutMs: 30000, maxTimeoutMs: 60000, serviceBudgetMs: 15000});
export const fail = (code, message = code, details = {}) => {
  const error = new FoundationError(code, message);
  Object.assign(error, details);
  return error;
};
export function record(value, code = 'E_SCHEMA') {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw fail(code, 'Expected plain object');
  return value;
}
export function fields(value, allowed, required = [], code = 'E_SCHEMA') {
  record(value, code);
  if (Object.keys(value).some(key => !allowed.includes(key)) || required.some(key => !Object.hasOwn(value, key)))
    throw fail(code, 'Unknown or missing argument');
}
export function key(value) {
  if (typeof value !== 'string' || !value.length || value.length > 256 ||
      ['__proto__', 'constructor', 'prototype'].includes(value)) throw fail('E_SCHEMA', 'Unsafe storage key');
  return value;
}
export function jsonValue(value, seen = new Set(), depth = 0) {
  if (depth > 12) throw fail('E_VALUE_SERIALIZATION', 'Value exceeds depth limit');
  if (value === undefined || value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (!value || typeof value !== 'object' || seen.has(value)) throw fail('E_VALUE_SERIALIZATION', 'Expected JSON value or undefined');
  seen.add(value);
  if (!Array.isArray(value)) record(value, 'E_VALUE_SERIALIZATION');
  for (const name of Object.keys(value)) {
    if (['__proto__', 'constructor', 'prototype'].includes(name)) throw fail('E_VALUE_SERIALIZATION', 'Unsafe object key');
    jsonValue(value[name], seen, depth + 1);
  }
  seen.delete(value);
  return value;
}
export function httpUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw fail('E_SCHEMA', 'Expected absolute HTTP URL'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw fail('E_SCHEMA', 'Unsupported URL');
  return url.href;
}
export function normalizeConfig(config = {}) {
  fields(config, ['params', 'headers', 'timeout', 'responseType', 'withCredentials'], [], 'E_CONFIG_UNSUPPORTED');
  const out = {};
  if (config.params !== undefined) {
    record(config.params, 'E_CONFIG_UNSUPPORTED');
    out.params = {};
    for (const [name, value] of Object.entries(config.params)) {
      key(name);
      const values = Array.isArray(value) ? value : [value];
      if (values.some(v => v !== null && v !== undefined && !['string', 'number', 'boolean'].includes(typeof v) || typeof v === 'number' && !Number.isFinite(v)))
        throw fail('E_CONFIG_UNSUPPORTED', 'Unsupported query parameter');
      out.params[name] = value;
    }
  }
  if (config.headers !== undefined) {
    record(config.headers, 'E_CONFIG_UNSUPPORTED');
    out.headers = {};
    for (const [name, value] of Object.entries(config.headers)) {
      if (!/^[!#$%&'*+.^_`|~0-9a-z-]+$/i.test(name) || typeof value !== 'string' || /[\r\n]/.test(value) ||
          /^(cookie|authorization|proxy-authorization|host|origin|referer|sec-.*)$/i.test(name))
        throw fail('E_CONFIG_UNSUPPORTED', 'Unsupported header');
      out.headers[name.toLowerCase()] = value;
    }
  }
  if (config.timeout !== undefined) {
    if (!Number.isInteger(config.timeout) || config.timeout < 1 || config.timeout > SDK_LIMITS.maxTimeoutMs) throw fail('E_CONFIG_UNSUPPORTED', 'Invalid timeout');
    out.timeout = config.timeout;
  }
  if (config.responseType !== undefined) {
    if (!['json', 'text'].includes(config.responseType)) throw fail('E_CONFIG_UNSUPPORTED', 'Unsupported responseType');
    out.responseType = config.responseType;
  }
  if (config.withCredentials !== undefined) {
    if (config.withCredentials !== false) throw fail('E_CONFIG_UNSUPPORTED', 'Credentials are unavailable to page SDK');
    out.withCredentials = false;
  }
  return out;
}
const storage = (args, set = false) => {
  fields(args, set ? ['key', 'value'] : ['key'], set ? ['key', 'value'] : ['key']);
  key(args.key); jsonValue(args); return args;
};
const network = (args, data = false) => {
  fields(args, data ? ['url', 'data', 'config'] : ['url', 'config'], ['url']);
  const out = {url: httpUrl(args.url), config: normalizeConfig(args.config)};
  if (data && Object.hasOwn(args, 'data')) { jsonValue(args.data); out.data = args.data; }
  return out;
};
const empty = args => { fields(args, []); return args; };
const method = (capability, effect, normalize) => Object.freeze({capability, effect, normalize});
// This is an API schema, never a grant source. The broker admits every invocation.
export const SDK_METHODS = Object.freeze({
  AXIOS_GET: method('network', 'read', args => network(args)),
  AXIOS_POST: method('network', 'write', args => network(args, true)),
  AXIOS_PUT: method('network', 'write', args => network(args, true)),
  AXIOS_DELETE: method('network', 'write', args => network(args)),
  APPSTORAGE_GETITEM: method('storage.persistent', 'read', args => storage(args)),
  APPSTORAGE_SETITEM: method('storage.persistent', 'write', args => { storage(args, true); return {key: args.key, value: String(args.value)}; }),
  APPSTORAGE_REMOVEITEM: method('storage.persistent', 'write', args => storage(args)),
  APPSTORAGE_CLEAR: method('storage.persistent', 'write', empty),
  APPLOCAL_GETITEM: method('storage.session', 'read', args => storage(args)),
  APPLOCAL_SETITEM: method('storage.session', 'write', args => storage(args, true)),
  APPLOCAL_REMOVEITEM: method('storage.session', 'write', args => storage(args)),
  CHROME_LOCAL_CLEAR: method('storage.persistent', 'write', empty),
  CHROME_LOCAL_GET: method('storage.persistent', 'read', args => {
    fields(args, ['key'], ['key']); if (args.key !== null) key(args.key); return args;
  }),
  CHROME_LOCAL_SET: method('storage.persistent', 'write', args => {
    fields(args, ['values'], ['values']); record(args.values); Object.keys(args.values).forEach(key); jsonValue(args.values); return args;
  }),
  CHROME_LOCAL_REMOVE: method('storage.persistent', 'write', args => {
    fields(args, ['keys'], ['keys']); const keys = typeof args.keys === 'string' ? [args.keys] : args.keys;
    if (!Array.isArray(keys) || keys.length > 100) throw fail('E_SCHEMA'); keys.forEach(key); return {keys};
  }),
  CREATE_NOTIFY: method('notifications', 'write', args => {
    fields(args, ['title', 'content'], ['title', 'content']);
    if (typeof args.title !== 'string' || typeof args.content !== 'string' || args.title.length > 256 || args.content.length > 4096) throw fail('E_SCHEMA');
    return args;
  }),
  SERVER_CHECK: method('network', 'read', args => {
    fields(args, ['server', 'timeout'], ['server']); const config = normalizeConfig({timeout: args.timeout ?? 5000});
    return {server: httpUrl(args.server), timeout: config.timeout};
  }),
  DEVICE_GET_APP_ID: method('device.id', 'write', empty),
  NETWORK_INFO_GET: method('network.info', 'read', args => {
    fields(args, ['ip']); if (args.ip !== undefined && typeof args.ip !== 'string') throw fail('E_SCHEMA'); return args;
  })
});
export const BACKGROUND_SERVICE_METHODS = Object.freeze({
  log: method('service.log', 'write', args => {
    fields(args, ['message', 'data'], ['message']);
    if (typeof args.message !== 'string' || Object.hasOwn(args, 'data') && !Array.isArray(args.data)) throw fail('E_SCHEMA');
    if (new TextEncoder().encode(args.message).byteLength > 4096 || (args.data?.length ?? 0) > 100) throw fail('E_LIMIT');
    if (args.data) jsonValue(args.data);
    return args;
  }),
  getTime: method('service.time', 'read', empty),
  bexUrl: method('resources.packaged', 'read', empty),
  requestResource: method('resources.packaged', 'read', args => {
    fields(args, ['url'], ['url']);
    if (typeof args.url !== 'string' || !args.url || args.url.length > 1024) throw fail('E_SCHEMA');
    return args;
  })
});
export const ADMITTED_METHODS = Object.freeze({...SDK_METHODS, ...BACKGROUND_SERVICE_METHODS});
export function normalizeMethod(methodName, args = {}) {
  if (!Object.hasOwn(ADMITTED_METHODS, methodName)) throw fail('E_SERVICE_UNSUPPORTED', 'Unknown SDK service');
  return ADMITTED_METHODS[methodName].normalize(args);
}
export function validateSdkRequest(request) {
  fields(request, ['requestId', 'method', 'args', 'deadlineAt'], ['requestId', 'method', 'args', 'deadlineAt']);
  if (typeof request.requestId !== 'string' || !/^[a-zA-Z0-9:_-]{1,128}$/.test(request.requestId) || !Number.isSafeInteger(request.deadlineAt)) throw fail('E_SCHEMA');
  return {...request, args: normalizeMethod(request.method, request.args)};
}
