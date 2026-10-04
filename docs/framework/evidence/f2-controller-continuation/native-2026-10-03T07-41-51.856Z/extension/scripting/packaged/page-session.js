/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ "./src/framework/control/value.js":
/*!****************************************!*\
  !*** ./src/framework/control/value.js ***!
  \****************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   PageError: () => (/* binding */ PageError),
/* harmony export */   VALUE_LIMITS: () => (/* binding */ VALUE_LIMITS),
/* harmony export */   decodeValue: () => (/* binding */ decodeValue),
/* harmony export */   duration: () => (/* binding */ duration),
/* harmony export */   encodeValue: () => (/* binding */ encodeValue),
/* harmony export */   frozenCopy: () => (/* binding */ frozenCopy),
/* harmony export */   functionSource: () => (/* binding */ functionSource),
/* harmony export */   httpURL: () => (/* binding */ httpURL),
/* harmony export */   newPageRequestId: () => (/* binding */ newPageRequestId),
/* harmony export */   options: () => (/* binding */ options),
/* harmony export */   requireValue: () => (/* binding */ requireValue),
/* harmony export */   selector: () => (/* binding */ selector)
/* harmony export */ });
// Values, including explicit undefined, survive Chrome's JSON message transport.
class PageError extends Error {
  constructor(code, message = code, cause) {
    super(message, cause === undefined ? undefined : {cause});
    this.name = 'PageError'; this.code = code;
  }
}
function requireValue(condition, code, message) {
  if (!condition) throw new PageError(code, message);
}
const VALUE_LIMITS = Object.freeze({depth: 12, bytes: 65536, uploadBytes: 1048576, chunkBytes: 49152});
const randomValues = crypto.getRandomValues.bind(crypto);
function newPageRequestId() {
  // randomUUID is absent in opaque insecure contexts; getRandomValues is native
  // there too. The request ID is correlation only, never an authorization token.
  const bytes = randomValues(new Uint8Array(16));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}
function encodeValue(value, {maxBytes = VALUE_LIMITS.bytes} = {}) {
  const seen = new Set();
  function visit(v, depth) {
    requireValue(depth <= VALUE_LIMITS.depth, 'E_VALUE_SERIALIZATION', 'Value exceeds depth budget');
    if (v === undefined) return {t: 'undefined'};
    if (v === null) return {t: 'null'};
    if (typeof v === 'string' || typeof v === 'boolean') return {t: typeof v, v};
    if (typeof v === 'number') {
      requireValue(Number.isFinite(v), 'E_VALUE_SERIALIZATION', 'Only finite numbers are supported');
      return Object.is(v, -0) ? {t: 'negative-zero'} : {t: 'number', v};
    }
    requireValue(typeof v === 'object' && !seen.has(v), 'E_VALUE_SERIALIZATION', 'Unsupported or cyclic value');
    seen.add(v);
    let result;
    if (Array.isArray(v)) result = {t: 'array', v: Array.from(v, item => visit(item, depth + 1))};
    else {
      const proto = Object.getPrototypeOf(v);
      requireValue(proto === Object.prototype || proto === null, 'E_VALUE_SERIALIZATION', 'Only plain objects are supported');
      result = {t: 'object', v: Object.keys(v).map(key => {
        const descriptor = Object.getOwnPropertyDescriptor(v, key);
        requireValue(descriptor && 'value' in descriptor, 'E_VALUE_SERIALIZATION', 'Accessors are not serialized');
        return [key, visit(descriptor.value, depth + 1)];
      })};
    }
    seen.delete(v); return result;
  }
  const result = visit(value, 0);
  requireValue(new TextEncoder().encode(JSON.stringify(result)).byteLength <= maxBytes, 'E_VALUE_SERIALIZATION', 'Value exceeds byte budget');
  return result;
}
function decodeValue(value, options) {
  let nodes = 0;
  function visit(w, depth) {
    requireValue(w && typeof w === 'object' && depth <= VALUE_LIMITS.depth && ++nodes <= 65536, 'E_RESULT_FORMAT');
    switch (w.t) {
      case 'undefined': return undefined;
      case 'null': return null;
      case 'negative-zero': return -0;
      case 'boolean': requireValue(typeof w.v === 'boolean', 'E_RESULT_FORMAT'); return w.v;
      case 'string': requireValue(typeof w.v === 'string', 'E_RESULT_FORMAT'); return w.v;
      case 'number': requireValue(typeof w.v === 'number' && Number.isFinite(w.v), 'E_RESULT_FORMAT'); return w.v;
      case 'array': requireValue(Array.isArray(w.v), 'E_RESULT_FORMAT'); return w.v.map(v => visit(v, depth + 1));
      case 'object': {
        requireValue(Array.isArray(w.v), 'E_RESULT_FORMAT'); const result = {};
        for (const entry of w.v) {
          requireValue(Array.isArray(entry) && entry.length === 2 && typeof entry[0] === 'string' && !Object.hasOwn(result, entry[0]), 'E_RESULT_FORMAT');
          Object.defineProperty(result, entry[0], {value: visit(entry[1], depth + 1), enumerable: true, writable: true, configurable: true});
        }
        return result;
      }
      default: throw new PageError('E_RESULT_FORMAT');
    }
  }
  const result = visit(value, 0); encodeValue(result, options); return result;
}
function functionSource(fn) {
  requireValue(typeof fn === 'function', 'E_ARGUMENT_TYPE', 'Expected a function');
  const source = Function.prototype.toString.call(fn);
  requireValue(!source.includes('[native code]'), 'E_FUNCTION_SOURCE_UNSUPPORTED', 'Native and bound functions are unsupported');
  requireValue(new TextEncoder().encode(source).byteLength <= VALUE_LIMITS.bytes, 'E_VALUE_SERIALIZATION');
  return source;
}
function options(value, supported) {
  requireValue(value && typeof value === 'object' && !Array.isArray(value), 'E_ARGUMENT_TYPE', 'Options must be an object');
  for (const key of Object.keys(value)) requireValue(supported.includes(key), 'E_OPTION_UNSUPPORTED', `Unsupported option: ${key}`);
  return value;
}
function selector(value) {
  requireValue(typeof value === 'string' && value.length > 0 && value.length <= 4096, 'E_ARGUMENT_TYPE', 'Expected a nonempty CSS selector');
  return value;
}
function duration(value) {
  requireValue(typeof value === 'number' && Number.isFinite(value) && value >= 0, 'E_ARGUMENT_TYPE', 'Expected a finite nonnegative duration');
  return value;
}
function httpURL(value) {
  requireValue(typeof value === 'string', 'E_ARGUMENT_TYPE');
  let url; try { url = new URL(value); } catch { throw new PageError('E_URL_UNSUPPORTED'); }
  requireValue(['http:', 'https:'].includes(url.protocol) && !url.username && !url.password, 'E_URL_UNSUPPORTED');
  return url.href;
}
const nativeClone = structuredClone, nativeFreeze = Object.freeze, nativeKeys = Object.keys;
function frozenCopy(value) {
  let copy; try { copy = nativeClone(value); } catch (cause) { throw new PageError('E_VALUE_SERIALIZATION', cause.message); }
  function freeze(v, depth = 0) {
    requireValue(depth <= 64, 'E_VALUE_SERIALIZATION');
    if (v && typeof v === 'object') {
      requireValue(Array.isArray(v) || Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null, 'E_VALUE_SERIALIZATION');
      for (const key of nativeKeys(v)) freeze(v[key], depth + 1); nativeFreeze(v);
    } return v;
  }
  return freeze(copy);
}


/***/ }),

/***/ "./src/framework/sdk/registry.js":
/*!***************************************!*\
  !*** ./src/framework/sdk/registry.js ***!
  \***************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   PROTOCOL: () => (/* reexport safe */ _platform_protocol_js__WEBPACK_IMPORTED_MODULE_0__.PROTOCOL),
/* harmony export */   SDK_FILES: () => (/* binding */ SDK_FILES),
/* harmony export */   SDK_HELLO_EVENT: () => (/* binding */ SDK_HELLO_EVENT),
/* harmony export */   SDK_LIMITS: () => (/* binding */ SDK_LIMITS),
/* harmony export */   SDK_METHODS: () => (/* binding */ SDK_METHODS),
/* harmony export */   SDK_READY_EVENT: () => (/* binding */ SDK_READY_EVENT),
/* harmony export */   SDK_REQUEST_EVENT: () => (/* binding */ SDK_REQUEST_EVENT),
/* harmony export */   SDK_RESULT_EVENT: () => (/* binding */ SDK_RESULT_EVENT),
/* harmony export */   SDK_VERSION: () => (/* binding */ SDK_VERSION),
/* harmony export */   fail: () => (/* binding */ fail),
/* harmony export */   fields: () => (/* binding */ fields),
/* harmony export */   httpUrl: () => (/* binding */ httpUrl),
/* harmony export */   jsonValue: () => (/* binding */ jsonValue),
/* harmony export */   key: () => (/* binding */ key),
/* harmony export */   normalizeConfig: () => (/* binding */ normalizeConfig),
/* harmony export */   normalizeMethod: () => (/* binding */ normalizeMethod),
/* harmony export */   record: () => (/* binding */ record),
/* harmony export */   validateSdkRequest: () => (/* binding */ validateSdkRequest)
/* harmony export */ });
/* harmony import */ var _platform_protocol_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../platform/protocol.js */ "./src/platform/protocol.js");



const SDK_VERSION = '1.0.0';
const SDK_REQUEST_EVENT = 'CHROME_BRIDGE_INTERFACE';
const SDK_RESULT_EVENT = 'OPEN_DESK_SDK_RESULT';
const SDK_HELLO_EVENT = 'OPEN_DESK_SDK_HELLO';
const SDK_READY_EVENT = 'OPEN_DESK_SDK_READY';
const SDK_FILES = Object.freeze({relay: 'agents/page-relay.js', main: 'framework/sdk-main.js'});
const SDK_LIMITS = Object.freeze({pending: 100, requestBytes: 65536, responseBytes: 262144, timeoutMs: 30000, maxTimeoutMs: 60000, serviceBudgetMs: 15000});
const fail = (code, message = code, details = {}) => {
  const error = new _platform_protocol_js__WEBPACK_IMPORTED_MODULE_0__.FoundationError(code, message);
  Object.assign(error, details);
  return error;
};
function record(value, code = 'E_SCHEMA') {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw fail(code, 'Expected plain object');
  return value;
}
function fields(value, allowed, required = [], code = 'E_SCHEMA') {
  record(value, code);
  if (Object.keys(value).some(key => !allowed.includes(key)) || required.some(key => !Object.hasOwn(value, key)))
    throw fail(code, 'Unknown or missing argument');
}
function key(value) {
  if (typeof value !== 'string' || !value.length || value.length > 256 ||
      ['__proto__', 'constructor', 'prototype'].includes(value)) throw fail('E_SCHEMA', 'Unsafe storage key');
  return value;
}
function jsonValue(value, seen = new Set(), depth = 0) {
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
function httpUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw fail('E_SCHEMA', 'Expected absolute HTTP URL'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw fail('E_SCHEMA', 'Unsupported URL');
  return url.href;
}
function normalizeConfig(config = {}) {
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
const SDK_METHODS = Object.freeze({
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
function normalizeMethod(methodName, args = {}) {
  if (!Object.hasOwn(SDK_METHODS, methodName)) throw fail('E_SERVICE_UNSUPPORTED', 'Unknown SDK service');
  return SDK_METHODS[methodName].normalize(args);
}
function validateSdkRequest(request) {
  fields(request, ['requestId', 'method', 'args', 'deadlineAt'], ['requestId', 'method', 'args', 'deadlineAt']);
  if (typeof request.requestId !== 'string' || !/^[a-zA-Z0-9:_-]{1,128}$/.test(request.requestId) || !Number.isSafeInteger(request.deadlineAt)) throw fail('E_SCHEMA');
  return {...request, args: normalizeMethod(request.method, request.args)};
}


/***/ }),

/***/ "./src/platform/protocol.js":
/*!**********************************!*\
  !*** ./src/platform/protocol.js ***!
  \**********************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   BUDGETS: () => (/* binding */ BUDGETS),
/* harmony export */   CONTRACT_HASH: () => (/* binding */ CONTRACT_HASH),
/* harmony export */   CONTRACT_VERSION: () => (/* binding */ CONTRACT_VERSION),
/* harmony export */   FoundationError: () => (/* binding */ FoundationError),
/* harmony export */   PROTOCOL: () => (/* binding */ PROTOCOL),
/* harmony export */   canonical: () => (/* binding */ canonical),
/* harmony export */   digest: () => (/* binding */ digest),
/* harmony export */   digestUtf8: () => (/* binding */ digestUtf8),
/* harmony export */   invariant: () => (/* binding */ invariant),
/* harmony export */   iso: () => (/* binding */ iso),
/* harmony export */   newId: () => (/* binding */ newId),
/* harmony export */   projectCommand: () => (/* binding */ projectCommand),
/* harmony export */   projectRun: () => (/* binding */ projectRun),
/* harmony export */   sameIdentity: () => (/* binding */ sameIdentity),
/* harmony export */   terminalStates: () => (/* binding */ terminalStates),
/* harmony export */   validate: () => (/* binding */ validate)
/* harmony export */ });
/* harmony import */ var _schema_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./schema.js */ "./src/platform/schema.js");


const CONTRACT_VERSION = '1.0.0';
const CONTRACT_HASH = '1486ff9c442807c0d447e542252830731faeede5f81cd685c5f146daecdba2a1';
const PROTOCOL = 'opendesk.foundation.v1';
const BUDGETS = Object.freeze({activeRuns:1, executionTabs:1, maxPages:50, maxRecords:10000,
  maxDurationMs:600000, maxStoredBytes:20971520, maxBatchBytes:262144, maxPendingACKs:2,
  maxArtifactBytes:8388608, profileStoredBytes:209715200, retentionDays:7, mappingWindowMs:60000,
  downloadDeadlineMs:600000, commandReconcileMs:30000, maxRecordBytes:65536, maxRawFrameBytes:131072});
class FoundationError extends Error {
  constructor(code, message) { super(message); this.name = 'FoundationError'; this.code = code; }
}
function invariant(condition, code = 'E_SCHEMA', message = code) {
  if (!condition) throw new FoundationError(code, message);
}
const newId = () => crypto.randomUUID();
const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
function string(value) {
  for (let i = 0; i < value.length; i++) {
    const n = value.charCodeAt(i);
    if (n >= 0xd800 && n <= 0xdbff) {
      const next = value.charCodeAt(++i);
      invariant(next >= 0xdc00 && next <= 0xdfff, 'E_SCHEMA', 'Unpaired UTF-16 surrogate');
    } else invariant(n < 0xdc00 || n > 0xdfff, 'E_SCHEMA', 'Unpaired UTF-16 surrogate');
  }
  return JSON.stringify(value);
}
function canonical(value) {
  function encode(v, depth) {
    invariant(depth <= 12, 'E_SCHEMA', 'JSON exceeds depth limit');
    if (v === null) return 'null';
    if (typeof v === 'string') return string(v);
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    if (typeof v === 'number') { invariant(Number.isFinite(v), 'E_SCHEMA', 'Non-finite number'); return JSON.stringify(v); }
    invariant(typeof v === 'object', 'E_SCHEMA', 'Non-JSON value');
    if (Array.isArray(v)) return '[' + Array.from(v, item => encode(item, depth + 1)).join(',') + ']';
    invariant(Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null,
      'E_SCHEMA', 'Only plain JSON objects are allowed');
    const keys = Object.keys(v).sort();
    for (const key of keys) invariant(!forbidden.has(key) && /^[\x20-\x7e]+$/.test(key), 'E_SCHEMA', 'Unsafe JSON key');
    return '{' + keys.map(key => string(key) + ':' + encode(v[key], depth + 1)).join(',') + '}';
  }
  return encode(value, 0);
}
async function digest(value) {
  const bytes = new TextEncoder().encode(canonical(value));
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
}
async function digestUtf8(value) {
  invariant(typeof value === 'string', 'E_VALUE_SERIALIZATION', 'Expected UTF-8 text');
  string(value);
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}
function sameIdentity(a, b, {ignoreRevision = false} = {}) {
  if (!a || !b) return false;
  const clean = value => { const copy = structuredClone(value); if (ignoreRevision) delete copy.runRevision; return copy; };
  return canonical(clean(a)) === canonical(clean(b));
}
function resolveReference(reference) {
  invariant(typeof reference === 'string' && reference.startsWith('#/'),
    'E_SCHEMA', 'Only local schema references are supported');
  let resolved = _schema_js__WEBPACK_IMPORTED_MODULE_0__["default"];
  for (const token of reference.slice(2).split('/')) {
    invariant(!/~(?:[^01]|$)/.test(token), 'E_SCHEMA', 'Invalid schema reference');
    const key = token.replace(/~1/g, '/').replace(/~0/g, '~');
    invariant(resolved !== null && typeof resolved === 'object' && Object.hasOwn(resolved, key),
      'E_SCHEMA', `Unknown schema reference ${reference}`);
    resolved = resolved[key];
  }
  return resolved;
}
function validTimestamp(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-](\d{2}):(\d{2}))$/.exec(value);
  if (!match) return false;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, , offsetHour, offsetMinute] = match;
  const [year, month, day, hour, minute, second] = [yearText, monthText, dayText, hourText, minuteText, secondText].map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1] &&
    hour <= 23 && minute <= 59 && second <= 59 &&
    (offsetHour === undefined || (Number(offsetHour) <= 23 && Number(offsetMinute) <= 59)) &&
    Number.isFinite(Date.parse(value));
}
function conforms(rule, value, path, traversal = {active:[],steps:0}) {
  invariant(++traversal.steps <= 1000000 && traversal.active.length < 128,
    'E_SCHEMA', `${path}: schema traversal budget exceeded`);
  invariant(!traversal.active.some(pair => pair.rule === rule && pair.value === value),
    'E_SCHEMA', `${path}: cyclic schema reference`);
  traversal.active.push({rule,value});
  try { return checkRule(rule,value,path,traversal); }
  finally { traversal.active.pop(); }
}
function checkRule(rule, value, path, traversal) {
  const fail = message => invariant(false, 'E_SCHEMA', `${path}: ${message}`);
  if (rule === true) return;
  if (rule === false) return fail('value forbidden');
  invariant(rule !== null && typeof rule === 'object', 'E_SCHEMA', `${path}: invalid schema`);
  if (Object.hasOwn(rule,'$ref')) return conforms(resolveReference(rule.$ref), value, path, traversal);
  if (Object.hasOwn(rule, 'const') && canonical(value) !== canonical(rule.const)) fail('wrong constant');
  if (rule.enum && !rule.enum.some(item => canonical(item) === canonical(value))) fail('unknown enum');
  const accepts = r => { try { conforms(r, value, path, traversal); return true; } catch (e) { if (e.code !== 'E_SCHEMA') throw e; return false; } };
  if (rule.oneOf && rule.oneOf.filter(accepts).length !== 1) fail('must match exactly one variant');
  if (rule.anyOf && !rule.anyOf.some(accepts)) fail('no matching variant');
  for (const child of rule.allOf || []) conforms(child, value, path, traversal);
  if (rule.if) { if (accepts(rule.if) && rule.then) conforms(rule.then, value, path, traversal); else if (!accepts(rule.if) && rule.else) conforms(rule.else, value, path, traversal); }
  if (rule.not && accepts(rule.not)) fail('forbidden variant');
  const types = Array.isArray(rule.type) ? rule.type : rule.type ? [rule.type] : [];
  const is = t => t === 'null' ? value === null : t === 'array' ? Array.isArray(value) : t === 'object' ? value !== null && typeof value === 'object' && !Array.isArray(value) : t === 'integer' ? Number.isSafeInteger(value) : t === 'number' ? typeof value === 'number' && Number.isFinite(value) : typeof value === t;
  if (types.length && !types.some(is)) fail('wrong type');
  if (typeof value === 'string') {
    if (rule.minLength !== undefined && [...value].length < rule.minLength) fail('too short');
    if (rule.maxLength !== undefined && [...value].length > rule.maxLength) fail('too long');
    if (rule.pattern && !new RegExp(rule.pattern).test(value)) fail('pattern mismatch');
    if (rule.format === 'date-time' && !validTimestamp(value)) fail('invalid timestamp');
    if (rule.format === 'uri') { try { new URL(value); } catch { fail('invalid URL'); } }
  }
  if (typeof value === 'number') {
    if (rule.minimum !== undefined && value < rule.minimum) fail('below minimum');
    if (rule.maximum !== undefined && value > rule.maximum) fail('above maximum');
    if (rule.exclusiveMinimum !== undefined && value <= rule.exclusiveMinimum) fail('below exclusive minimum');
    if (rule.exclusiveMaximum !== undefined && value >= rule.exclusiveMaximum) fail('above exclusive maximum');
  }
  if (Array.isArray(value)) {
    if (rule.minItems !== undefined && value.length < rule.minItems) fail('too few items');
    if (rule.maxItems !== undefined && value.length > rule.maxItems) fail('too many items');
    if (rule.uniqueItems && new Set(value.map(canonical)).size !== value.length) fail('duplicate items');
    if (rule.items) value.forEach((item, i) => conforms(rule.items, item, `${path}[${i}]`, traversal));
  } else if (value !== null && typeof value === 'object') {
    for (const key of rule.required || []) if (!Object.hasOwn(value, key)) fail(`missing ${key}`);
    for (const [key, item] of Object.entries(value)) {
      if (rule.properties && Object.hasOwn(rule.properties, key)) conforms(rule.properties[key], item, `${path}.${key}`, traversal);
      else if (rule.additionalProperties === false) fail(`unknown ${key}`);
      else if (typeof rule.additionalProperties === 'object') conforms(rule.additionalProperties, item, `${path}.${key}`, traversal);
      if (rule.propertyNames) conforms(rule.propertyNames, key, `${path}.${key}`, traversal);
    }
    if (rule.minProperties !== undefined && Object.keys(value).length < rule.minProperties) fail('too few properties');
    if (rule.maxProperties !== undefined && Object.keys(value).length > rule.maxProperties) fail('too many properties');
  }
}
function validate(name, value) {
  invariant(Object.hasOwn(_schema_js__WEBPACK_IMPORTED_MODULE_0__["default"].$defs, name), 'E_SCHEMA', `Unknown schema ${name}`);
  canonical(value);
  conforms(_schema_js__WEBPACK_IMPORTED_MODULE_0__["default"].$defs[name], value, name);
  return value;
}
function projectRun(run) {
  if (!run) return null;
  const result = {};
  for (const key of Object.keys(_schema_js__WEBPACK_IMPORTED_MODULE_0__["default"].$defs.Run.properties)) result[key] = run[key];
  return validate('Run', result);
}
function projectCommand(command) {
  const result = {};
  for (const key of Object.keys(_schema_js__WEBPACK_IMPORTED_MODULE_0__["default"].$defs.Command.properties)) result[key] = command[key];
  return validate('Command', result);
}
const iso = clock => new Date(clock.now()).toISOString();
const terminalStates = new Set(['completed', 'limit_reached', 'stopped', 'failed', 'interrupted', 'abandoned_unknown']);


/***/ }),

/***/ "./src/platform/schema.js":
/*!********************************!*\
  !*** ./src/platform/schema.js ***!
  \********************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
// Frozen contract 1.0.0 schema; generated from docs/contracts/schema.json.
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = ({"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"https://opendesk.local/contracts/1.0.0/schema.json","title":"OpenDesk Browser protocol objects (not runtime implementation)","$defs":{"Limits":{"type":"object","properties":{"maxPages":{"type":"integer","minimum":1,"maximum":50},"maxRecords":{"type":"integer","minimum":1,"maximum":10000},"maxDurationMs":{"type":"integer","minimum":1,"maximum":600000},"maxStoredBytes":{"type":"integer","minimum":1,"maximum":20971520}},"required":["maxPages","maxRecords","maxDurationMs","maxStoredBytes"],"additionalProperties":false},"Field":{"type":"object","properties":{"id":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"},"label":{"type":"string","minLength":1,"maxLength":128},"selector":{"type":"string","maxLength":4096},"read":{"enum":["text","attribute"]},"attribute":{"type":["string","null"],"maxLength":128},"type":{"enum":["string","number","boolean"]},"required":{"type":"boolean"},"transforms":{"type":"array","items":{"enum":["trim","normalize-space","resolve-url"]},"maxItems":3,"uniqueItems":true}},"required":["id","label","selector","read","attribute","type","required","transforms"],"additionalProperties":false,"allOf":[{"if":{"properties":{"read":{"const":"text"}}},"then":{"properties":{"attribute":{"type":"null"}}}},{"if":{"properties":{"read":{"const":"attribute"}}},"then":{"properties":{"attribute":{"type":"string","minLength":1}}}}]},"Pagination":{"oneOf":[{"type":"object","properties":{"mode":{"const":"none"}},"required":["mode"],"additionalProperties":false},{"type":"object","properties":{"mode":{"const":"next-link"},"selector":{"type":"string","minLength":1,"maxLength":4096},"endMarkerSelector":{"type":"string","minLength":1,"maxLength":4096},"waitMs":{"type":"integer","minimum":1,"maximum":30000}},"required":["mode","selector","endMarkerSelector","waitMs"],"additionalProperties":false},{"type":"object","properties":{"mode":{"const":"next-button"},"selector":{"type":"string","minLength":1,"maxLength":4096},"endMarkerSelector":{"type":"string","minLength":1,"maxLength":4096},"userConfirmed":{"const":true},"postcondition":{"type":"object","properties":{"kind":{"const":"page-signature-change"},"timeoutMs":{"type":"integer","minimum":1,"maximum":30000}},"required":["kind","timeoutMs"],"additionalProperties":false}},"required":["mode","selector","endMarkerSelector","userConfirmed","postcondition"],"additionalProperties":false}]},"TemplateRevision":{"type":"object","properties":{"formatVersion":{"const":"1.0.0"},"templateId":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"},"revision":{"type":"integer","minimum":1,"maximum":9007199254740991},"parentRevision":{"type":["integer","null"],"minimum":1,"maximum":9007199254740991},"selectorDialect":{"const":"css"},"requiredCapabilities":{"type":"array","items":{"enum":["dom.top.v1","read.text.v1","read.attribute.v1","transform.safe.v1","pagination.none.v1","pagination.next-link.v1","pagination.next-button.v1","page.stage-seal.v1","download.receipt.v1"]},"minItems":1,"uniqueItems":true},"allowedOrigin":{"type":"string"},"startUrl":{"type":"string"},"list":{"type":"object","properties":{"containerSelector":{"type":"string","minLength":1,"maxLength":4096},"rowSelector":{"type":"string","minLength":1,"maxLength":4096},"emptyMarkerSelector":{"type":["string","null"],"maxLength":4096},"allowEmpty":{"type":"boolean"}},"required":["containerSelector","rowSelector","emptyMarkerSelector","allowEmpty"],"additionalProperties":false},"fields":{"type":"array","items":{"$ref":"#/$defs/Field"},"minItems":1,"maxItems":20},"pagination":{"$ref":"#/$defs/Pagination"},"columns":{"type":"array","items":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"},"minItems":1,"maxItems":20,"uniqueItems":true},"limits":{"$ref":"#/$defs/Limits"},"detail":{"type":"null"},"contentHash":{"type":"string","pattern":"^[0-9a-f]{64}$"}},"required":["formatVersion","templateId","revision","parentRevision","selectorDialect","requiredCapabilities","allowedOrigin","startUrl","list","fields","pagination","columns","limits","detail","contentHash"],"additionalProperties":false},"Target":{"type":"object","properties":{"targetSessionId":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"},"tabId":{"type":"integer","minimum":0,"maximum":9007199254740991},"frameId":{"const":0},"documentId":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"},"allowedOrigin":{"type":"string"},"targetVersion":{"type":"integer","minimum":1,"maximum":9007199254740991},"browserSessionIncarnation":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"},"creationId":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"}},"required":["targetSessionId","tabId","frameId","documentId","allowedOrigin","targetVersion","browserSessionIncarnation","creationId"],"additionalProperties":false},"Identity":{"type":"object","properties":{"runId":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"},"hostInstanceId":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"},"hostDocumentId":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"},"ownerEpoch":{"type":"integer","minimum":1,"maximum":9007199254740991},"runRevision":{"type":"integer","minimum":1,"maximum":9007199254740991},"templateHash":{"type":"string","pattern":"^[0-9a-f]{64}$"},"target":{"$ref":"#/$defs/Target"}},"required":["runId","hostInstanceId","hostDocumentId","ownerEpoch","runRevision","templateHash","target"],"additionalProperties":false},"RulePlan":{"type":"object","properties":{"contractVersion":{"const":"1.0.0"},"compilerVersion":{"const":"1.0.0"},"templateHash":{"type":"string","pattern":"^[0-9a-f]{64}$"},"capabilities":{"type":"array","items":{"enum":["dom.top.v1","read.text.v1","read.attribute.v1","transform.safe.v1","pagination.none.v1","pagination.next-link.v1","pagination.next-button.v1","page.stage-seal.v1","download.receipt.v1"]},"uniqueItems":true},"list":{"$ref":"#/$defs/TemplateRevision/properties/list"},"fields":{"type":"array","items":{"$ref":"#/$defs/Field"},"minItems":1,"maxItems":20},"pagination":{"$ref":"#/$defs/Pagination"},"columns":{"type":"array","items":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"},"minItems":1,"maxItems":20},"limits":{"$ref":"#/$defs/Limits"},"planHash":{"type":"string","pattern":"^[0-9a-f]{64}$"}},"required":["contractVersion","compilerVersion","templateHash","capabilities","list","fields","pagination","columns","limits","planHash"],"additionalProperties":false},"Command":{"type":"object","properties":{"commandId":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"},"identity":{"$ref":"#/$defs/Identity"},"kind":{"enum":["read-page","next-link","next-button"]},"payload":{"oneOf":[{"$ref":"#/$defs/ReadPagePayload"},{"$ref":"#/$defs/NextLinkPayload"},{"$ref":"#/$defs/NextButtonPayload"}]},"digest":{"type":"string","pattern":"^[0-9a-f]{64}$"},"state":{"enum":["prepared","dispatched","confirmed","cancelled","effect_unknown"]},"preparedAt":{"type":"string","format":"date-time"},"dispatchAt":{"type":["string","null"],"format":"date-time"},"resultDigest":{"type":["string","null"],"pattern":"^[0-9a-f]{64}$"}},"required":["commandId","identity","kind","payload","digest","state","preparedAt","dispatchAt","resultDigest"],"additionalProperties":false,"allOf":[{"if":{"properties":{"kind":{"const":"read-page"}}},"then":{"properties":{"payload":{"$ref":"#/$defs/ReadPagePayload"}}}},{"if":{"properties":{"kind":{"const":"next-link"}}},"then":{"properties":{"payload":{"$ref":"#/$defs/NextLinkPayload"}}}},{"if":{"properties":{"kind":{"const":"next-button"}}},"then":{"properties":{"payload":{"$ref":"#/$defs/NextButtonPayload"}}}}]},"Record":{"type":"object","properties":{"rowIndex":{"type":"integer","minimum":0,"maximum":9999},"recordKey":{"type":"string"},"raw":{"type":"object","additionalProperties":{"type":["string","null"]}},"values":{"type":"object","additionalProperties":{"type":["string","number","boolean","null"]}}},"required":["rowIndex","recordKey","raw","values"],"additionalProperties":false},"StageRequest":{"type":"object","properties":{"identity":{"$ref":"#/$defs/Identity"},"snapshotId":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"},"batchIndex":{"type":"integer","minimum":0,"maximum":9007199254740991},"batchId":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"},"digest":{"type":"string","pattern":"^[0-9a-f]{64}$"},"records":{"type":"array","items":{"$ref":"#/$defs/Record"},"maxItems":10000},"utf8Bytes":{"type":"integer","minimum":0,"maximum":262144}},"required":["identity","snapshotId","batchIndex","batchId","digest","records","utf8Bytes"],"additionalProperties":false},"SealRequest":{"type":"object","properties":{"identity":{"$ref":"#/$defs/Identity"},"snapshotId":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"},"batchCount":{"type":"integer","minimum":0,"maximum":9007199254740991},"rowCount":{"type":"integer","minimum":0,"maximum":10000},"byteCount":{"type":"integer","minimum":0,"maximum":20971520},"batchDigests":{"type":"array","items":{"type":"string","pattern":"^[0-9a-f]{64}$"}},"pageSignature":{"type":"string","pattern":"^[0-9a-f]{64}$"},"pageIdentity":{"type":"string"},"nextCheckpoint":{"type":"object","properties":{"pageNumber":{"type":"integer","minimum":1,"maximum":50},"url":{"type":"string"},"lastSnapshotId":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"}},"required":["pageNumber","url","lastSnapshotId"],"additionalProperties":false},"emptyEvidence":{"type":["string","null"]}},"required":["identity","snapshotId","batchCount","rowCount","byteCount","batchDigests","pageSignature","pageIdentity","nextCheckpoint","emptyEvidence"],"additionalProperties":false},"DownloadAttempt":{"type":"object","properties":{"attemptId":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"},"exportJobId":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"},"runId":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"},"artifactId":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"},"artifactHash":{"type":"string","pattern":"^[0-9a-f]{64}$"},"artifactBytes":{"type":"integer","minimum":0,"maximum":8388608},"rowCount":{"type":"integer","minimum":0,"maximum":10000},"hostInstanceId":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"},"hostDocumentId":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"},"ownerEpochAtCreation":{"type":"integer","minimum":1,"maximum":9007199254740991},"blobUrl":{"type":"string","pattern":"^blob:chrome-extension://"},"filename":{"type":"string"},"preparedAt":{"type":"string","format":"date-time"},"dispatchAt":{"type":["string","null"],"format":"date-time"},"mappingDeadline":{"type":["string","null"],"format":"date-time"},"downloadDeadline":{"type":["string","null"],"format":"date-time"},"state":{"enum":["prepared","dispatched","mapping_unknown","in_progress","complete","interrupted","deadline_unknown","abandoned","conflict"]},"downloadId":{"type":["integer","null"],"minimum":0},"resourceReleasedAt":{"type":["string","null"],"format":"date-time"},"timedOutAt":{"type":["string","null"],"format":"date-time"},"candidateDownloadIds":{"type":"array","items":{"type":"integer","minimum":0,"maximum":9007199254740991},"uniqueItems":true},"mappedAt":{"type":["string","null"],"format":"date-time"},"submissionCount":{"type":"integer","minimum":0,"maximum":1}},"required":["attemptId","exportJobId","runId","artifactId","artifactHash","artifactBytes","rowCount","hostInstanceId","hostDocumentId","ownerEpochAtCreation","blobUrl","filename","preparedAt","dispatchAt","mappingDeadline","downloadDeadline","state","downloadId","resourceReleasedAt","timedOutAt","candidateDownloadIds","mappedAt","submissionCount"],"additionalProperties":false},"Receipt":{"type":"object","properties":{"attemptId":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"},"downloadId":{"type":"integer","minimum":0,"maximum":9007199254740991},"observedState":{"enum":["in_progress","complete","interrupted"]},"observedAt":{"type":"string","format":"date-time"},"evidence":{"enum":["onChanged+search","search"]},"byExtensionId":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"},"late":{"type":"boolean"},"browserDownloadComplete":{"type":"boolean"},"diskHashVerified":{"const":false},"interruptReason":{"type":["string","null"]}},"required":["attemptId","downloadId","observedState","observedAt","evidence","byExtensionId","late","browserDownloadComplete","diskHashVerified","interruptReason"],"additionalProperties":false},"ExportJob":{"type":"object","properties":{"exportJobId":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"},"runId":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"},"templateHash":{"type":"string","pattern":"^[0-9a-f]{64}$"},"sealWatermark":{"type":"integer","minimum":0,"maximum":9007199254740991},"committedCount":{"type":"integer","minimum":0,"maximum":10000},"format":{"enum":["csv","json"]},"csvMode":{"enum":["spreadsheet-safe","raw"]},"partial":{"type":"boolean"},"artifactIds":{"type":"array","items":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"},"minItems":1},"activeAttemptIds":{"type":"array","items":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"},"minItems":1},"state":{"enum":["preparing","ready","delivering","delivery_complete","delivery_partial","delivery_unknown","delivery_failed","abandoned"]}},"required":["exportJobId","runId","templateHash","sealWatermark","committedCount","format","csvMode","partial","artifactIds","activeAttemptIds","state"],"additionalProperties":false},"Entitlement":{"type":"object","properties":{"tier":{"enum":["free","pro"]},"issuer":{"type":"string"},"subject":{"type":"string"},"features":{"type":"array","items":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"},"uniqueItems":true},"issuedAt":{"type":"string","format":"date-time"},"expiresAt":{"type":"string","format":"date-time"},"verifiedAt":{"type":"string","format":"date-time"},"signature":{"type":["string","null"]},"keyId":{"type":["string","null"]},"verification":{"enum":["local-free","ecdsa-p256-sha256"]},"revocationVersion":{"type":"integer","minimum":0,"maximum":9007199254740991},"formatVersion":{"const":"1.0.0"},"audience":{"const":"opendesk-browser"},"lastTrustedTime":{"type":"string","format":"date-time"}},"required":["tier","issuer","subject","features","issuedAt","expiresAt","verifiedAt","signature","keyId","verification","revocationVersion","formatVersion","audience","lastTrustedTime"],"additionalProperties":false,"allOf":[{"if":{"properties":{"tier":{"const":"pro"}}},"then":{"properties":{"verification":{"const":"ecdsa-p256-sha256"},"signature":{"type":"string","minLength":86,"maxLength":86,"pattern":"^[A-Za-z0-9_-]+$"},"keyId":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"}}}},{"if":{"properties":{"tier":{"const":"free"}}},"then":{"properties":{"verification":{"const":"local-free"},"signature":{"type":"null"},"keyId":{"type":"null"}}}}]},"EntitlementSnapshot":{"type":"object","properties":{"policyVersion":{"const":"1.0.0"},"tier":{"enum":["free","pro"]},"approvedAt":{"type":"string","format":"date-time"},"claimHash":{"type":["string","null"],"pattern":"^[0-9a-f]{64}$"},"offlineAgeMs":{"type":"integer","minimum":0,"maximum":259200000},"effectiveLimits":{"$ref":"#/$defs/Limits"},"maxSavedTemplates":{"enum":[1,50]},"approvedCapabilities":{"type":"array","items":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"},"uniqueItems":true},"runExpiryRevokes":{"const":false}},"required":["policyVersion","tier","approvedAt","claimHash","offlineAgeMs","effectiveLimits","maxSavedTemplates","approvedCapabilities","runExpiryRevokes"],"additionalProperties":false},"Artifact":{"type":"object","properties":{"artifactId":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"},"exportJobId":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"},"volumeIndex":{"type":"integer","minimum":0,"maximum":9007199254740991},"format":{"enum":["csv","json"]},"mime":{"enum":["text/csv;charset=utf-8","application/json"]},"bytes":{"type":"integer","minimum":0,"maximum":8388608},"rowCount":{"type":"integer","minimum":0,"maximum":10000},"sha256":{"type":"string","pattern":"^[0-9a-f]{64}$"},"storageEncoding":{"const":"Uint8Array-chunks"},"chunkKeys":{"type":"array","items":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"},"minItems":1},"filename":{"type":"string","maxLength":128},"templateHash":{"type":"string","pattern":"^[0-9a-f]{64}$"},"sealWatermark":{"type":"integer","minimum":0,"maximum":9007199254740991}},"required":["artifactId","exportJobId","volumeIndex","format","mime","bytes","rowCount","sha256","storageEncoding","chunkKeys","filename","templateHash","sealWatermark"],"additionalProperties":false},"PageSnapshot":{"type":"object","properties":{"snapshotId":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"},"runId":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"},"ownerEpoch":{"type":"integer","minimum":1,"maximum":9007199254740991},"pageSequence":{"type":"integer","minimum":1,"maximum":50},"state":{"enum":["open","sealed","aborted"]},"pageIdentity":{"type":"string"},"batchCount":{"type":"integer","minimum":0,"maximum":9007199254740991},"stagedRowCount":{"type":"integer","minimum":0,"maximum":10000},"stagedBytes":{"type":"integer","minimum":0,"maximum":20971520},"sealSeq":{"type":["integer","null"],"minimum":1},"sealDigest":{"type":["string","null"],"pattern":"^[0-9a-f]{64}$"},"pageSignature":{"type":["string","null"],"pattern":"^[0-9a-f]{64}$"},"abortReason":{"type":["string","null"]},"sourceIdentity":{"$ref":"#/$defs/Identity"},"readCommandId":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"},"expectedCheckpointSnapshotId":{"type":["string","null"]},"readEnd":{"oneOf":[{"$ref":"#/$defs/PageReadEnd"},{"type":"null"}]},"sealIdentity":{"oneOf":[{"$ref":"#/$defs/Identity"},{"type":"null"}]},"immutableSealAck":{"oneOf":[{"$ref":"#/$defs/SealAck"},{"type":"null"}]}},"required":["snapshotId","runId","ownerEpoch","pageSequence","state","pageIdentity","batchCount","stagedRowCount","stagedBytes","sealSeq","sealDigest","pageSignature","abortReason","sourceIdentity","readCommandId","expectedCheckpointSnapshotId","readEnd","sealIdentity","immutableSealAck"],"additionalProperties":false},"Checkpoint":{"type":"object","properties":{"pageNumber":{"type":"integer","minimum":1,"maximum":50},"url":{"type":"string"},"lastSnapshotId":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"}},"required":["pageNumber","url","lastSnapshotId"],"additionalProperties":false},"Run":{"type":"object","properties":{"runId":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"},"ownerEpoch":{"type":"integer","minimum":1,"maximum":9007199254740991},"runRevision":{"type":"integer","minimum":1,"maximum":9007199254740991},"eventSeq":{"type":"integer","minimum":0,"maximum":9007199254740991},"commitSeq":{"type":"integer","minimum":0,"maximum":9007199254740991},"hostInstanceId":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"},"hostDocumentId":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"},"templateHash":{"type":"string","pattern":"^[0-9a-f]{64}$"},"state":{"enum":["preparing","running","stopping","paused_unknown","retiring","completed","limit_reached","stopped","failed","interrupted","abandoned_unknown"]},"cancelSeq":{"type":"integer","minimum":0,"maximum":9007199254740991},"committedCount":{"type":"integer","minimum":0,"maximum":10000},"committedPages":{"type":"integer","minimum":0,"maximum":50},"storedBytes":{"type":"integer","minimum":0,"maximum":20971520},"checkpoint":{"oneOf":[{"$ref":"#/$defs/Checkpoint"},{"type":"null"}]},"target":{"oneOf":[{"$ref":"#/$defs/Target"},{"type":"null"}]},"entitlementSnapshot":{"$ref":"#/$defs/EntitlementSnapshot"},"retirementState":{"enum":["not-started","fenced","closing","absence-proven","released"]},"terminalReason":{"type":["string","null"]},"tombstoned":{"type":"boolean"}},"required":["runId","ownerEpoch","runRevision","eventSeq","commitSeq","hostInstanceId","hostDocumentId","templateHash","state","cancelSeq","committedCount","committedPages","storedBytes","checkpoint","target","entitlementSnapshot","retirementState","terminalReason","tombstoned"],"additionalProperties":false},"TemplateMetadata":{"type":"object","properties":{"templateId":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"},"name":{"type":"string","minLength":1,"maxLength":128},"headRevision":{"type":"integer","minimum":1,"maximum":9007199254740991},"nameRevision":{"type":"integer","minimum":1,"maximum":9007199254740991}},"required":["templateId","name","headRevision","nameRevision"],"additionalProperties":false},"RetirementEvidence":{"type":"object","properties":{"retirementId":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"},"runId":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"},"fencedEpoch":{"type":"integer","minimum":1,"maximum":9007199254740991},"oldTarget":{"oneOf":[{"$ref":"#/$defs/Target"},{"type":"null"}]},"fencedAt":{"type":"string","format":"date-time"},"targetAbsenceAt":{"type":["string","null"],"format":"date-time"},"targetAbsenceEvidence":{"enum":["pending","tabs.get-not-found","onRemoved","never-created","cancelled-before-create-dispatch","unique-bootstrap-current-session-removed"]},"slotReleasedAt":{"type":["string","null"],"format":"date-time"},"browserSessionIncarnation":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"},"creationId":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"},"releaseId":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"},"releaseCount":{"type":"integer","minimum":0,"maximum":1},"identityStatus":{"enum":["same-session-owned","unique-bootstrap-rebound","cross-session-unverified"]}},"required":["retirementId","runId","fencedEpoch","oldTarget","fencedAt","targetAbsenceAt","targetAbsenceEvidence","slotReleasedAt","browserSessionIncarnation","creationId","releaseId","releaseCount","identityStatus"],"additionalProperties":false},"SourceSelectionContext":{"type":"object","properties":{"selectionId":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"},"sourceTabId":{"type":"integer","minimum":0,"maximum":9007199254740991},"frameId":{"const":0},"sourceDocumentId":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"},"origin":{"type":"string"},"gestureAt":{"type":"string","format":"date-time"},"hostInstanceId":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"},"allowedOperations":{"type":"array","items":{"enum":["select-list","select-fields","select-next","preview","clear-own-overlay"]},"uniqueItems":true},"hostDocumentId":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"},"registrationId":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"},"browserSessionIncarnation":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"},"contextRevision":{"type":"integer","minimum":1},"expiresAt":{"type":"string","format":"date-time"},"state":{"enum":["active","cancelled","released","invalidated"]}},"required":["selectionId","sourceTabId","frameId","sourceDocumentId","origin","gestureAt","hostInstanceId","allowedOperations","hostDocumentId","registrationId","browserSessionIncarnation","contextRevision","expiresAt","state"],"additionalProperties":false},"Error":{"type":"object","properties":{"code":{"enum":["E_VERSION","E_CAPABILITY","E_SCHEMA","E_SEMANTIC","E_HASH","E_PARENT_CONFLICT","E_OWNER","E_REVISION","E_TARGET","E_PERMISSION","E_CANCELLED","E_EFFECT_UNKNOWN","E_BATCH_CONFLICT","E_SEAL_INCOMPLETE","E_QUOTA","E_LIMIT","E_DOWNLOAD_MAPPING","E_MIGRATION_RECONFIGURE","E_TOMBSTONE","MODULE_NOT_INSTALLED","E_ENTITLEMENT","E_MIGRATION_NOT_EXECUTABLE"]},"message":{"type":"string","maxLength":1024},"retryable":{"type":"boolean"},"details":{"type":"object","maxProperties":20}},"required":["code","message","retryable","details"],"additionalProperties":false},"Projection":{"type":"object","properties":{"run":{"oneOf":[{"$ref":"#/$defs/Run"},{"type":"null"}]},"pendingCommandIds":{"type":"array","items":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"}},"exportJobIds":{"type":"array","items":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"}},"eventSeq":{"type":"integer","minimum":0,"maximum":9007199254740991},"slotAvailable":{"type":"boolean"}},"required":["run","pendingCommandIds","exportJobIds","eventSeq","slotAvailable"],"additionalProperties":false,"allOf":[{"if":{"properties":{"run":{"type":"null"}}},"then":{"properties":{"pendingCommandIds":{"maxItems":0}}}}]},"StageAck":{"type":"object","properties":{"ack":{"const":"durable-staged"},"snapshotId":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"},"batchIndex":{"type":"integer","minimum":0,"maximum":9007199254740991},"digest":{"type":"string","pattern":"^[0-9a-f]{64}$"},"duplicate":{"type":"boolean"}},"required":["ack","snapshotId","batchIndex","digest","duplicate"],"additionalProperties":false},"SealAck":{"type":"object","properties":{"ack":{"const":"page-sealed"},"snapshotId":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"},"committedCount":{"type":"integer","minimum":0,"maximum":10000},"committedPages":{"type":"integer","minimum":0,"maximum":50},"checkpoint":{"$ref":"#/$defs/Checkpoint"},"sealSeq":{"type":"integer","minimum":1,"maximum":9007199254740991},"duplicate":{"type":"boolean"}},"required":["ack","snapshotId","committedCount","committedPages","checkpoint","sealSeq","duplicate"],"additionalProperties":false},"ReadRecordsRequest":{"type":"object","properties":{"runId":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"},"sealWatermark":{"type":"integer","minimum":0,"maximum":9007199254740991},"cursor":{"type":["string","null"]},"limit":{"type":"integer","minimum":1,"maximum":500},"readerPinId":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"}},"required":["runId","sealWatermark","cursor","limit","readerPinId"],"additionalProperties":false},"ReadRecordsResponse":{"type":"object","properties":{"records":{"type":"array","items":{"$ref":"#/$defs/Record"},"maxItems":500},"nextCursor":{"type":["string","null"]},"committedCount":{"type":"integer","minimum":0,"maximum":10000}},"required":["records","nextCursor","committedCount"],"additionalProperties":false},"StopRequest":{"type":"object","properties":{"runId":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"},"expectedRunRevision":{"type":"integer","minimum":1,"maximum":9007199254740991},"requestId":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"}},"required":["runId","expectedRunRevision","requestId"],"additionalProperties":false},"AbandonRequest":{"type":"object","properties":{"runId":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"},"expectedRunRevision":{"type":"integer","minimum":1,"maximum":9007199254740991},"requestId":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"},"userExplicit":{"const":true}},"required":["runId","expectedRunRevision","requestId","userExplicit"],"additionalProperties":false},"ExportRequest":{"type":"object","properties":{"runId":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"},"format":{"enum":["csv","json"]},"csvMode":{"enum":["spreadsheet-safe","raw"]},"partialConfirmed":{"type":"boolean"},"requestId":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"}},"required":["runId","format","csvMode","partialConfirmed","requestId"],"additionalProperties":false},"RetryExportRequest":{"type":"object","properties":{"exportJobId":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"},"explicitUserAction":{"const":true},"requestId":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"}},"required":["exportJobId","explicitUserAction","requestId"],"additionalProperties":false},"Handshake":{"type":"object","properties":{"contractVersion":{"const":"1.0.0"},"contractHash":{"type":"string","pattern":"^[0-9a-f]{64}$"},"compilerVersion":{"const":"1.0.0"},"requiredCapabilities":{"type":"array","items":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"},"uniqueItems":true}},"required":["contractVersion","contractHash","compilerVersion","requiredCapabilities"],"additionalProperties":false},"ReadPagePayload":{"type":"object","properties":{"plan":{"$ref":"#/$defs/RulePlan"},"snapshotId":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"},"pageSequence":{"type":"integer","minimum":1,"maximum":50},"expectedPageIdentity":{"type":"string"}},"required":["plan","snapshotId","pageSequence","expectedPageIdentity"],"additionalProperties":false},"NextLinkPayload":{"type":"object","properties":{"selector":{"type":"string","minLength":1,"maxLength":4096},"url":{"type":"string"},"endMarkerSelector":{"type":"string","minLength":1,"maxLength":4096},"priorPageSignature":{"type":"string","pattern":"^[0-9a-f]{64}$"},"waitMs":{"type":"integer","minimum":1,"maximum":30000}},"required":["selector","url","endMarkerSelector","priorPageSignature","waitMs"],"additionalProperties":false},"NextButtonPayload":{"type":"object","properties":{"selector":{"type":"string","minLength":1,"maxLength":4096},"endMarkerSelector":{"type":"string","minLength":1,"maxLength":4096},"priorPageSignature":{"type":"string","pattern":"^[0-9a-f]{64}$"},"userConfirmed":{"const":true},"postcondition":{"const":"page-signature-change"},"timeoutMs":{"type":"integer","minimum":1,"maximum":30000}},"required":["selector","endMarkerSelector","priorPageSignature","userConfirmed","postcondition","timeoutMs"],"additionalProperties":false},"PageReadData":{"type":"object","properties":{"type":{"const":"page-data"},"identity":{"$ref":"#/$defs/Identity"},"commandId":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"},"snapshotId":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"},"frameIndex":{"type":"integer","minimum":0,"maximum":9007199254740991},"rowStart":{"type":"integer","minimum":0,"maximum":9999},"rawRows":{"type":"array","items":{"type":"object","additionalProperties":{"type":["string","null"]}},"minItems":1,"maxItems":10000},"digest":{"type":"string","pattern":"^[0-9a-f]{64}$"}},"required":["type","identity","commandId","snapshotId","frameIndex","rowStart","rawRows","digest"],"additionalProperties":false},"PageReadEnd":{"type":"object","properties":{"type":{"const":"page-end"},"identity":{"$ref":"#/$defs/Identity"},"commandId":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"},"snapshotId":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"},"frameCount":{"type":"integer","minimum":0,"maximum":9007199254740991},"rowCount":{"type":"integer","minimum":0,"maximum":10000},"pageIdentity":{"type":"string"},"documentBaseURI":{"type":"string"},"emptyEvidence":{"type":["string","null"]},"rawSignature":{"type":"string","pattern":"^[0-9a-f]{64}$"}},"required":["type","identity","commandId","snapshotId","frameCount","rowCount","pageIdentity","documentBaseURI","emptyEvidence","rawSignature"],"additionalProperties":false},"PageReadFrame":{"oneOf":[{"$ref":"#/$defs/PageReadData"},{"$ref":"#/$defs/PageReadEnd"}]},"SaveTemplateRequest":{"type":"object","properties":{"expectedParentRevision":{"type":["integer","null"],"minimum":1,"maximum":9007199254740991},"expectedNameRevision":{"type":["integer","null"],"minimum":1,"maximum":9007199254740991},"name":{"type":"string","minLength":1,"maxLength":128},"template":{"$ref":"#/$defs/TemplateRevision"}},"required":["expectedParentRevision","expectedNameRevision","name","template"],"additionalProperties":false},"ListTemplatesRequest":{"type":"object","properties":{"cursor":{"type":["string","null"]},"limit":{"type":"integer","minimum":1,"maximum":50}},"required":["cursor","limit"],"additionalProperties":false},"TemplateEntry":{"type":"object","properties":{"metadata":{"$ref":"#/$defs/TemplateMetadata"},"head":{"$ref":"#/$defs/TemplateRevision"}},"required":["metadata","head"],"additionalProperties":false},"ListTemplatesResponse":{"type":"object","properties":{"templates":{"type":"array","items":{"$ref":"#/$defs/TemplateEntry"},"maxItems":50},"nextCursor":{"type":["string","null"]}},"required":["templates","nextCursor"],"additionalProperties":false},"GetTemplateRevisionRequest":{"type":"object","properties":{"templateId":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"},"revision":{"type":"integer","minimum":1,"maximum":9007199254740991}},"required":["templateId","revision"],"additionalProperties":false},"RenameTemplateRequest":{"type":"object","properties":{"templateId":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"},"expectedNameRevision":{"type":"integer","minimum":1},"name":{"type":"string","minLength":1,"maxLength":128}},"required":["templateId","expectedNameRevision","name"],"additionalProperties":false},"RegisterHostResponse":{"type":"object","properties":{"hostDocumentId":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"},"registrationId":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"},"projection":{"$ref":"#/$defs/Projection"}},"required":["hostDocumentId","registrationId","projection"],"additionalProperties":false},"SnapshotRunResponse":{"$ref":"#/$defs/Projection"},"BeginPageRequest":{"type":"object","properties":{"identity":{"$ref":"#/$defs/Identity"},"requestId":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"},"readCommandId":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"},"pageSequence":{"type":"integer","minimum":1,"maximum":50},"expectedPageIdentity":{"type":"string","minLength":1},"expectedCheckpointSnapshotId":{"type":["string","null"]}},"required":["identity","requestId","readCommandId","pageSequence","expectedPageIdentity","expectedCheckpointSnapshotId"],"additionalProperties":false},"BeginPageResponse":{"$ref":"#/$defs/PageSnapshot"},"TargetCreationIntent":{"type":"object","properties":{"tag":{"const":"target-create"},"creationId":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"},"runId":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"},"ownerEpoch":{"type":"integer","minimum":1},"browserSessionIncarnation":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"},"bootstrapUrl":{"type":"string"},"startUrl":{"type":"string"},"state":{"enum":["prepared","dispatched","known","effect_unknown","cancelled","retired"]},"submissionCount":{"type":"integer","minimum":0,"maximum":1},"createdAt":{"type":"string","format":"date-time"},"dispatchAt":{"type":["string","null"],"format":"date-time"},"knownTabId":{"type":["integer","null"],"minimum":0},"knownDocumentId":{"type":["string","null"]},"candidateTabIds":{"type":"array","items":{"type":"integer","minimum":0,"maximum":9007199254740991},"uniqueItems":true},"retirementId":{"type":["string","null"]},"navigationState":{"enum":["not-admitted","dispatched","confirmed","effect_unknown","cancelled"]},"navigationSubmissionCount":{"type":"integer","minimum":0,"maximum":1},"navigationDispatchAt":{"type":["string","null"],"format":"date-time"}},"required":["tag","creationId","runId","ownerEpoch","browserSessionIncarnation","bootstrapUrl","startUrl","state","submissionCount","createdAt","dispatchAt","knownTabId","knownDocumentId","candidateTabIds","retirementId","navigationState","navigationSubmissionCount","navigationDispatchAt"],"additionalProperties":false},"CreateTargetRequest":{"type":"object","properties":{"runId":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"},"expectedRunRevision":{"type":"integer","minimum":1},"registrationId":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"},"requestId":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"}},"required":["runId","expectedRunRevision","registrationId","requestId"],"additionalProperties":false},"ReconcileTargetCreationRequest":{"type":"object","properties":{"creationId":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"}},"required":["creationId"],"additionalProperties":false},"CreateTargetResponse":{"type":"object","properties":{"creationId":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"},"state":{"enum":["prepared","dispatched","known","effect_unknown","cancelled","retired"]},"target":{"oneOf":[{"$ref":"#/$defs/Target"},{"type":"null"}]}},"required":["creationId","state","target"],"additionalProperties":false},"OpenSourceContextRequest":{"type":"object","properties":{"gestureTicketId":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"},"registrationId":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"},"requestId":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"}},"required":["gestureTicketId","registrationId","requestId"],"additionalProperties":false},"StartSourceSelectionRequest":{"type":"object","properties":{"context":{"$ref":"#/$defs/SourceSelectionContext"},"operationId":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"},"requestId":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"},"kind":{"enum":["select-list","select-fields","select-next"]},"fieldId":{"type":["string","null"]}},"required":["context","operationId","requestId","kind","fieldId"],"additionalProperties":false},"SourceSelectionResult":{"type":"object","properties":{"selectionId":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"},"operationId":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"},"sourceDocumentId":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"},"kind":{"enum":["select-list","select-fields","select-next"]},"status":{"enum":["selected","cancelled","failed"]},"selectors":{"type":"object","properties":{"containerSelector":{"type":["string","null"],"maxLength":4096},"rowSelector":{"type":["string","null"],"maxLength":4096},"fieldSelector":{"type":["string","null"],"maxLength":4096},"nextSelector":{"type":["string","null"],"maxLength":4096}},"required":["containerSelector","rowSelector","fieldSelector","nextSelector"],"additionalProperties":false},"error":{"oneOf":[{"$ref":"#/$defs/Error"},{"type":"null"}]}},"required":["selectionId","operationId","sourceDocumentId","kind","status","selectors","error"],"additionalProperties":false},"CancelSourceSelectionRequest":{"type":"object","properties":{"selectionId":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"},"operationId":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"},"requestId":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"}},"required":["selectionId","operationId","requestId"],"additionalProperties":false},"ReleaseSourceContextRequest":{"type":"object","properties":{"selectionId":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"},"expectedContextRevision":{"type":"integer","minimum":1},"requestId":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"}},"required":["selectionId","expectedContextRevision","requestId"],"additionalProperties":false},"SourceOperationAck":{"type":"object","properties":{"selectionId":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"},"operationId":{"type":["string","null"]},"state":{"enum":["accepted","cancelled","released","invalidated"]},"duplicate":{"type":"boolean"}},"required":["selectionId","operationId","state","duplicate"],"additionalProperties":false},"PreviewSourceRequest":{"type":"object","properties":{"context":{"$ref":"#/$defs/SourceSelectionContext"},"requestId":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"},"draft":{"$ref":"#/$defs/TemplateRevision"},"plan":{"$ref":"#/$defs/RulePlan"},"maxPreviewRows":{"const":10}},"required":["context","requestId","draft","plan","maxPreviewRows"],"additionalProperties":false},"SourcePreviewData":{"type":"object","properties":{"type":{"const":"source-preview-data"},"frameIndex":{"type":"integer","minimum":0,"maximum":9007199254740991},"rowStart":{"type":"integer","minimum":0,"maximum":9},"rawRows":{"type":"array","items":{"type":"object","additionalProperties":{"type":["string","null"]}},"minItems":1,"maxItems":10},"digest":{"type":"string","pattern":"^[0-9a-f]{64}$"},"context":{"$ref":"#/$defs/SourceSelectionContext"},"requestId":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"}},"required":["type","frameIndex","rowStart","rawRows","digest","context","requestId"],"additionalProperties":false},"SourcePreviewEnd":{"type":"object","properties":{"type":{"const":"source-preview-end"},"frameCount":{"type":"integer","minimum":0,"maximum":9007199254740991},"rowCount":{"type":"integer","minimum":0,"maximum":10},"pageIdentity":{"type":"string"},"documentBaseURI":{"type":"string"},"emptyEvidence":{"type":["string","null"]},"rawSignature":{"type":"string","pattern":"^[0-9a-f]{64}$"},"context":{"$ref":"#/$defs/SourceSelectionContext"},"requestId":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"},"hasMore":{"type":"boolean"}},"required":["type","frameCount","rowCount","pageIdentity","documentBaseURI","emptyEvidence","rawSignature","context","requestId","hasMore"],"additionalProperties":false},"SourcePreviewFrame":{"oneOf":[{"$ref":"#/$defs/SourcePreviewData"},{"$ref":"#/$defs/SourcePreviewEnd"}]},"SourcePreviewResult":{"type":"object","properties":{"selectionId":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"},"requestId":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._:-]+$"},"templateHash":{"type":"string","pattern":"^[0-9a-f]{64}$"},"planHash":{"type":"string","pattern":"^[0-9a-f]{64}$"},"rows":{"type":"array","maxItems":10,"items":{"type":"object","properties":{"rowIndex":{"type":"integer","minimum":0,"maximum":9},"raw":{"type":"object","additionalProperties":{"type":["string","null"]}},"values":{"type":"object","additionalProperties":{"type":["string","number","boolean","null"]}}},"required":["rowIndex","raw","values"],"additionalProperties":false}},"hasMore":{"type":"boolean"},"persisted":{"const":false}},"required":["selectionId","requestId","templateHash","planHash","rows","hasMore","persisted"],"additionalProperties":false}}});


/***/ }),

/***/ "./src/scripting/packaged/registry.js":
/*!********************************************!*\
  !*** ./src/scripting/packaged/registry.js ***!
  \********************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   createPackagedPageSession: () => (/* binding */ createPackagedPageSession)
/* harmony export */ });
/* harmony import */ var _framework_control_value_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../framework/control/value.js */ "./src/framework/control/value.js");


// This registry runs only in the broker-selected ISOLATED document agent. It is
// fixed packaged code; function source from a caller is never evaluated here.
function createPackagedPageSession({document: doc = document, window: win = window, signal, guard = () => {}, packageURLs = []} = {}) {
  const waits = new Set(), uploads = new Map(), nodes = new Set(), resources = new Set();
  const allowed = new Set(packageURLs); let disposed = false;
  const cancelCode = () => typeof signal?.reason?.code === 'string' ? signal.reason.code : 'E_CANCELLED';
  function check() {
    (0,_framework_control_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(!disposed && !signal?.aborted, cancelCode()); guard();
  }
  function element(css) {
    check(); (0,_framework_control_value_js__WEBPACK_IMPORTED_MODULE_0__.selector)(css); let found;
    try { found = doc.querySelector(css); } catch (cause) { throw new _framework_control_value_js__WEBPACK_IMPORTED_MODULE_0__.PageError('E_SELECTOR_INVALID', cause.message); }
    (0,_framework_control_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(found, 'E_ELEMENT_NOT_FOUND'); return found;
  }
  function editable(el) {
    (0,_framework_control_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)((el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && ['text', 'search', 'email', 'url', 'tel', 'password'].includes(el.type))) && !el.disabled && !el.readOnly, 'E_INPUT_TARGET_UNSUPPORTED');
  }
  function event(el, value) { check(); el.dispatchEvent(value); }
  function delay(ms) {
    check(); (0,_framework_control_value_js__WEBPACK_IMPORTED_MODULE_0__.duration)(ms);
    return new Promise((resolve, reject) => {
      const wait = {cancel: reason => finish(reason || new _framework_control_value_js__WEBPACK_IMPORTED_MODULE_0__.PageError('E_CANCELLED'))};
      const abort = () => wait.cancel(new _framework_control_value_js__WEBPACK_IMPORTED_MODULE_0__.PageError(cancelCode()));
      let timer;
      function finish(error) { clearTimeout(timer); waits.delete(wait); signal?.removeEventListener('abort', abort); if (error) reject(error); else { try { check(); resolve(); } catch (cause) { reject(cause); } } }
      waits.add(wait); signal?.addEventListener('abort', abort, {once: true}); timer = setTimeout(() => finish(), ms);
      if (signal?.aborted) abort();
    });
  }
  async function selectWait(css, value) {
    (0,_framework_control_value_js__WEBPACK_IMPORTED_MODULE_0__.selector)(css); (0,_framework_control_value_js__WEBPACK_IMPORTED_MODULE_0__.options)(value, ['visible', 'hidden', 'timeout']);
    const {visible = false, hidden = false, timeout = 30000} = value;
    (0,_framework_control_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(typeof visible === 'boolean' && typeof hidden === 'boolean' && !(visible && hidden), 'E_ARGUMENT_TYPE'); (0,_framework_control_value_js__WEBPACK_IMPORTED_MODULE_0__.duration)(timeout);
    const started = performance.now();
    for (;;) {
      check(); let el; try { el = doc.querySelector(css); } catch (cause) { throw new _framework_control_value_js__WEBPACK_IMPORTED_MODULE_0__.PageError('E_SELECTOR_INVALID', cause.message); }
      if (el) {
        const style = win.getComputedStyle(el), isHidden = style.display === 'none' || style.visibility === 'hidden';
        if ((!visible && !hidden) || (visible && !isHidden) || (hidden && isHidden)) return true;
      }
      if (timeout !== 0 && performance.now() - started >= timeout) throw new _framework_control_value_js__WEBPACK_IMPORTED_MODULE_0__.PageError('E_TIMEOUT', 'Selector wait timed out');
      await delay(timeout === 0 ? 25 : Math.min(25, Math.max(0, timeout - (performance.now() - started))));
    }
  }
  async function click(css, value) {
    const el = element(css); (0,_framework_control_value_js__WEBPACK_IMPORTED_MODULE_0__.options)(value, ['button', 'clickCount', 'delay']);
    const {button = 'left', clickCount = 1, delay: ms = 0} = value;
    (0,_framework_control_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(['left', 'right', 'middle'].includes(button) && Number.isInteger(clickCount) && clickCount >= 1 && clickCount <= 100, 'E_ARGUMENT_TYPE'); (0,_framework_control_value_js__WEBPACK_IMPORTED_MODULE_0__.duration)(ms);
    const init = {bubbles: true, cancelable: true, detail: clickCount};
    for (let i = 0; i < clickCount; i++) {
      event(el, new win.MouseEvent('mousedown', init)); await delay(ms);
      event(el, new win.MouseEvent('mouseup', init));
      event(el, new win.MouseEvent(button === 'right' ? 'contextmenu' : button === 'middle' ? 'mouseup' : 'click', init));
    }
    return 'clicked';
  }
  async function type(css, text, value) {
    const el = element(css); editable(el); (0,_framework_control_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(typeof text === 'string', 'E_ARGUMENT_TYPE'); (0,_framework_control_value_js__WEBPACK_IMPORTED_MODULE_0__.options)(value, ['delay']);
    const ms = (0,_framework_control_value_js__WEBPACK_IMPORTED_MODULE_0__.duration)(value.delay ?? 0); check(); el.focus();
    for (const char of text) {
      const init = {key: char, char, code: 'Key' + char.toUpperCase(), bubbles: true, cancelable: true};
      event(el, new win.KeyboardEvent('keydown', init)); check(); editable(el); el.value += char;
      let input;
      if (typeof win.InputEvent === 'function') input = new win.InputEvent('input', {data: char, inputType: 'insertText', bubbles: true});
      else input = new win.Event('input', {bubbles: true});
      event(el, input); event(el, new win.KeyboardEvent('keypress', init)); event(el, new win.KeyboardEvent('keyup', init));
      if (ms > 0) await delay(ms);
    }
    return 'Typed';
  }
  function keyboard(action, key) {
    (0,_framework_control_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(['press', 'down', 'up'].includes(action) && typeof key === 'string' && key, 'E_ARGUMENT_TYPE');
    (0,_framework_control_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(key.length === 1 || !key.includes('+'), 'E_KEY_UNSUPPORTED');
    const events = action === 'press' ? ['keydown', 'keypress', 'keyup'] : [action === 'down' ? 'keydown' : 'keyup'];
    for (const type of events) event(doc, new win.KeyboardEvent(type, {key}));
    // Preserve the old document-event behavior, including Backspace value unchanged.
    return undefined;
  }
  function uploadChunk(id, offset, total, base64) {
    (0,_framework_control_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(typeof id === 'string' && Number.isSafeInteger(total) && total >= 0 && total <= _framework_control_value_js__WEBPACK_IMPORTED_MODULE_0__.VALUE_LIMITS.uploadBytes && Number.isSafeInteger(offset) && offset >= 0 && typeof base64 === 'string', 'E_UPLOAD_FORMAT');
    (0,_framework_control_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(/^[A-Za-z0-9+/]*={0,2}$/.test(base64) && base64.length % 4 === 0, 'E_UPLOAD_FORMAT');
    let binary; try { binary = atob(base64); } catch { throw new _framework_control_value_js__WEBPACK_IMPORTED_MODULE_0__.PageError('E_UPLOAD_FORMAT'); }
    (0,_framework_control_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(binary.length > 0 && binary.length <= _framework_control_value_js__WEBPACK_IMPORTED_MODULE_0__.VALUE_LIMITS.chunkBytes && offset + binary.length <= total, 'E_UPLOAD_FORMAT');
    let upload = uploads.get(id);
    if (!upload) { (0,_framework_control_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(offset === 0 && uploads.size === 0, 'E_UPLOAD_FORMAT'); upload = {total, offset: 0, bytes: new Uint8Array(total)}; uploads.set(id, upload); }
    (0,_framework_control_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(upload.total === total && upload.offset === offset, 'E_UPLOAD_FORMAT');
    upload.bytes.set(Uint8Array.from(binary, c => c.charCodeAt(0)), offset); upload.offset += binary.length; return undefined;
  }
  function uploadCommit(css, id, total) {
    const upload = uploads.get(id); uploads.delete(id);
    (0,_framework_control_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)((total === 0 && !upload) || (upload && upload.total === total && upload.offset === total), 'E_UPLOAD_FORMAT');
    const el = element(css); (0,_framework_control_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(el.tagName === 'INPUT' && el.type === 'file' && !el.disabled && !el.multiple && !el.webkitdirectory, 'E_INPUT_TARGET_UNSUPPORTED');
    const transfer = new win.DataTransfer(); transfer.items.add(new win.File([upload?.bytes || new Uint8Array()], 'filename.jpg', {type: 'image/jpeg'}));
    check(); el.files = transfer.files; event(el, new win.Event('change', {bubbles: true})); return undefined;
  }
  async function addTag(method, value) {
    const isScript = method === 'addScriptTag'; (0,_framework_control_value_js__WEBPACK_IMPORTED_MODULE_0__.options)(value, isScript ? ['url', 'type'] : ['url', 'content']);
    check(); const parent = isScript ? doc.body : doc.head; (0,_framework_control_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(parent, 'E_PAGE_NOT_READY');
    (0,_framework_control_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(isScript ? typeof value.url === 'string' : (typeof value.url === 'string') !== (typeof value.content === 'string'), 'E_ARGUMENT_TYPE');
    if (value.url !== undefined) (0,_framework_control_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(allowed.has(value.url), 'E_RESOURCE_URL_UNSUPPORTED', 'Resource must be in the packaged allowlist');
    if (!isScript && value.content !== undefined) (0,_framework_control_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(typeof value.content === 'string' && !/@import\b|url\s*\(/i.test(value.content), 'E_STYLE_URL_UNSUPPORTED');
    const node = doc.createElement(isScript ? 'script' : value.url ? 'link' : 'style'); nodes.add(node);
    if (value.url) {
      if (isScript) { node.src = value.url; if (value.type !== undefined) { (0,_framework_control_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(value.type === 'text/javascript', 'E_OPTION_UNSUPPORTED'); node.type = value.type; } }
      else { node.rel = 'stylesheet'; node.href = value.url; }
      await new Promise((resolve, reject) => {
        const resource = {cancel: () => finish(new _framework_control_value_js__WEBPACK_IMPORTED_MODULE_0__.PageError('E_CANCELLED'))};
        function finish(error) { node.onload = null; node.onerror = null; clearTimeout(timer); resources.delete(resource); if (error) { node.remove(); nodes.delete(node); reject(error); } else resolve(); }
        const timer = setTimeout(() => finish(new _framework_control_value_js__WEBPACK_IMPORTED_MODULE_0__.PageError('E_TIMEOUT')), 30000);
        node.onload = () => finish(); node.onerror = () => finish(new _framework_control_value_js__WEBPACK_IMPORTED_MODULE_0__.PageError('E_RESOURCE_LOAD'));
        resources.add(resource); check(); parent.append(node);
      });
    } else { node.textContent = value.content; check(); parent.append(node); }
    check(); return undefined;
  }
  async function execute(method, args) {
    check(); (0,_framework_control_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(Array.isArray(args), 'E_ARGUMENT_TYPE');
    switch (method) {
      case 'title': return doc.title;
      case 'content': (0,_framework_control_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(doc.body, 'E_PAGE_NOT_READY'); return doc.body.innerHTML;
      case 'url': return win.location.href;
      case 'snapshot': { (0,_framework_control_value_js__WEBPACK_IMPORTED_MODULE_0__.selector)(args[0]); let el; try { el = doc.querySelector(args[0]); } catch (cause) { throw new _framework_control_value_js__WEBPACK_IMPORTED_MODULE_0__.PageError('E_SELECTOR_INVALID', cause.message); } return el ? {outerHTML: el.outerHTML} : null; }
      case 'snapshots': { (0,_framework_control_value_js__WEBPACK_IMPORTED_MODULE_0__.selector)(args[0]); try { return Array.from(doc.querySelectorAll(args[0]), el => ({outerHTML: el.outerHTML})); } catch (cause) { throw new _framework_control_value_js__WEBPACK_IMPORTED_MODULE_0__.PageError('E_SELECTOR_INVALID', cause.message); } }
      case 'click': return click(...args);
      case 'type': return type(...args);
      case 'keyboard': return keyboard(...args);
      case 'waitForTimeout': await delay(args[0]); return undefined;
      case 'waitForSelector': return selectWait(...args);
      case 'uploadChunk': return uploadChunk(...args);
      case 'uploadCommit': return uploadCommit(...args);
      case 'addScriptTag': case 'addStyleTag': return addTag(method, args[0]);
      default: throw new _framework_control_value_js__WEBPACK_IMPORTED_MODULE_0__.PageError('E_OPERATION_UNSUPPORTED', `Not a packaged DOM operation: ${method}`);
    }
  }
  function dispose() {
    if (disposed) return; disposed = true;
    for (const wait of [...waits]) wait.cancel(new _framework_control_value_js__WEBPACK_IMPORTED_MODULE_0__.PageError(cancelCode()));
    for (const resource of [...resources]) resource.cancel();
    for (const node of nodes) node.remove(); nodes.clear(); uploads.clear();
    signal?.removeEventListener('abort', dispose);
  }
  signal?.addEventListener('abort', dispose, {once: true}); if (signal?.aborted) dispose();
  return Object.freeze({execute, dispose, snapshot: () => ({waits: waits.size, uploads: uploads.size, nodes: nodes.size, resources: resources.size})});
}


/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/define property getters */
/******/ 	(() => {
/******/ 		// define getter functions for harmony exports
/******/ 		__webpack_require__.d = (exports, definition) => {
/******/ 			for(var key in definition) {
/******/ 				if(__webpack_require__.o(definition, key) && !__webpack_require__.o(exports, key)) {
/******/ 					Object.defineProperty(exports, key, { enumerable: true, get: definition[key] });
/******/ 				}
/******/ 			}
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/hasOwnProperty shorthand */
/******/ 	(() => {
/******/ 		__webpack_require__.o = (obj, prop) => (Object.prototype.hasOwnProperty.call(obj, prop))
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/make namespace object */
/******/ 	(() => {
/******/ 		// define __esModule on exports
/******/ 		__webpack_require__.r = (exports) => {
/******/ 			if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 				Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 			}
/******/ 			Object.defineProperty(exports, '__esModule', { value: true });
/******/ 		};
/******/ 	})();
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
// This entry need to be wrapped in an IIFE because it need to be isolated against other modules in the chunk.
(() => {
/*!************************************************!*\
  !*** ./src/scripting/packaged/page-session.js ***!
  \************************************************/
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   PAGE_SESSION_MESSAGE: () => (/* binding */ PAGE_SESSION_MESSAGE),
/* harmony export */   installPackagedPageSession: () => (/* binding */ installPackagedPageSession)
/* harmony export */ });
/* harmony import */ var _registry_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./registry.js */ "./src/scripting/packaged/registry.js");
/* harmony import */ var _framework_control_value_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../framework/control/value.js */ "./src/framework/control/value.js");
/* harmony import */ var _framework_sdk_registry_js__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../../framework/sdk/registry.js */ "./src/framework/sdk/registry.js");




const PAGE_SESSION_MESSAGE = 'OPENDESK_CONTROLLER_PAGE_SESSION_V1';
const methods = new Set(['title', 'content', 'url', 'snapshot', 'snapshots', 'click', 'type', 'keyboard',
  'waitForTimeout', 'waitForSelector', 'uploadChunk', 'uploadCommit', 'addScriptTag', 'addStyleTag']);
const installations = new WeakMap();
const ownerKey = run => JSON.stringify([run.runId, run.ownerEpoch]);
function owner(run) {
  (0,_framework_control_value_js__WEBPACK_IMPORTED_MODULE_1__.requireValue)(run?.tag === 'controller-run' && typeof run.runId === 'string' && run.runId &&
    Number.isSafeInteger(run.ownerEpoch) && run.ownerEpoch > 0, 'E_OWNER_CHANGED');
  return ownerKey(run);
}

// Independently bundled, ISOLATED-only entry. No property is installed on the
// user's window, and no DOM/event payload is accepted as an extension sender.
function installPackagedPageSession({api = globalThis.chrome, document: doc = globalThis.document,
  window: win = doc?.defaultView, packageURLs = api?.runtime?.getURL ? [api.runtime.getURL(_framework_sdk_registry_js__WEBPACK_IMPORTED_MODULE_2__.SDK_FILES.main)] : []} = {}) {
  (0,_framework_control_value_js__WEBPACK_IMPORTED_MODULE_1__.requireValue)(api?.runtime?.onMessage && doc && win, 'E_CAPABILITY_UNAVAILABLE');
  if (installations.has(doc)) return installations.get(doc);
  const sessions = new Map(), retired = new Set(); let disposed = false;
  function trusted(sender) {
    if (sender?.id !== api.runtime.id || sender.tab) return false;
    if (sender.url === undefined) return true; // A service worker may omit URL.
    try { const url = new URL(sender.url); return url.protocol === 'chrome-extension:' && url.host === api.runtime.id; }
    catch { return false; }
  }
  function cancel(run) {
    const key = owner(run); retired.add(key);
    const session = sessions.get(key);
    session?.controller.abort(new _framework_control_value_js__WEBPACK_IMPORTED_MODULE_1__.PageError('E_CANCELLED')); session?.registry.dispose(); sessions.delete(key);
  }
  async function execute(input) {
    const envelope = (0,_framework_control_value_js__WEBPACK_IMPORTED_MODULE_1__.frozenCopy)(input), key = owner(envelope.identity);
    (0,_framework_control_value_js__WEBPACK_IMPORTED_MODULE_1__.requireValue)(!disposed && !retired.has(key), 'E_CANCELLED');
    (0,_framework_control_value_js__WEBPACK_IMPORTED_MODULE_1__.requireValue)(Number.isSafeInteger(envelope.target?.frameId) && envelope.target.frameId >= 0 && typeof envelope.target.documentId === 'string' &&
      typeof envelope.requestId === 'string' && envelope.requestId, 'E_TARGET');
    (0,_framework_control_value_js__WEBPACK_IMPORTED_MODULE_1__.requireValue)(envelope.operation?.kind === 'packaged' && methods.has(envelope.operation.method), 'E_OPERATION_UNSUPPORTED');
    const args = (0,_framework_control_value_js__WEBPACK_IMPORTED_MODULE_1__.decodeValue)(envelope.operation.args, {maxBytes: envelope.operation.method === 'uploadChunk' ? 131072 : 65536});
    (0,_framework_control_value_js__WEBPACK_IMPORTED_MODULE_1__.requireValue)(Array.isArray(args), 'E_ARGUMENT_TYPE');
    let session = sessions.get(key);
    if (!session) {
      const controller = new AbortController();
      session = {controller, documentId: envelope.target.documentId, frameId: envelope.target.frameId, revision: JSON.stringify(envelope.revision), requests: new Map(),
        registry: (0,_registry_js__WEBPACK_IMPORTED_MODULE_0__.createPackagedPageSession)({document: doc, window: win, signal: controller.signal, packageURLs})};
      sessions.set(key, session);
    }
    (0,_framework_control_value_js__WEBPACK_IMPORTED_MODULE_1__.requireValue)(session.documentId === envelope.target.documentId && session.frameId === envelope.target.frameId, 'E_DOCUMENT_REPLACED');
    (0,_framework_control_value_js__WEBPACK_IMPORTED_MODULE_1__.requireValue)(session.revision === JSON.stringify(envelope.revision), 'E_OWNER_CHANGED');
    const fingerprint = JSON.stringify(envelope), previous = session.requests.get(envelope.requestId);
    if (previous) { (0,_framework_control_value_js__WEBPACK_IMPORTED_MODULE_1__.requireValue)(previous.fingerprint === fingerprint, 'E_OPERATION_REPLAY'); return previous.result; }
    const result = Promise.resolve().then(async () => {
      (0,_framework_control_value_js__WEBPACK_IMPORTED_MODULE_1__.requireValue)(!disposed && !retired.has(key), 'E_CANCELLED');
      const value = await session.registry.execute(envelope.operation.method, args);
      (0,_framework_control_value_js__WEBPACK_IMPORTED_MODULE_1__.requireValue)(!disposed && !retired.has(key), 'E_CANCELLED');
      return {requestId: envelope.requestId, runId: envelope.identity.runId, ownerEpoch: envelope.identity.ownerEpoch, value: (0,_framework_control_value_js__WEBPACK_IMPORTED_MODULE_1__.encodeValue)(value)};
    });
    session.requests.set(envelope.requestId, {fingerprint, result}); return result;
  }
  function listener(message, sender, respond) {
    if (disposed || message?.type !== PAGE_SESSION_MESSAGE || !trusted(sender)) return false;
    if (message.action === 'ping') { respond({type: PAGE_SESSION_MESSAGE, ready: true}); return false; }
    if (message.action === 'cancel') {
      try { cancel(message.run); respond({type: PAGE_SESSION_MESSAGE, cancelled: true}); }
      catch (error) { respond({error: {code: error.code || 'E_ARGUMENT_TYPE', message: error.message}}); }
      return false;
    }
    if (message.action !== 'execute') return false;
    let settled = false;
    const finish = reply => { if (!settled) { settled = true; respond(reply); } };
    execute(message.envelope).then(finish, error => finish({requestId: message.envelope?.requestId,
      runId: message.envelope?.identity?.runId, ownerEpoch: message.envelope?.identity?.ownerEpoch,
      error: {code: error.code || 'E_PAGE_EXECUTION', message: String(error.message)}}));
    return true;
  }
  function dispose() {
    if (disposed) return; disposed = true;
    api.runtime.onMessage.removeListener(listener); win.removeEventListener('pagehide', dispose);
    for (const session of sessions.values()) { session.controller.abort(new _framework_control_value_js__WEBPACK_IMPORTED_MODULE_1__.PageError('E_DOCUMENT_REPLACED')); session.registry.dispose(); }
    sessions.clear(); retired.clear(); installations.delete(doc);
  }
  const installation = Object.freeze({dispose, snapshot: () => ({disposed, sessions: sessions.size,
    waits: [...sessions.values()].reduce((n, session) => n + session.registry.snapshot().waits, 0),
    uploads: [...sessions.values()].reduce((n, session) => n + session.registry.snapshot().uploads, 0)})});
  api.runtime.onMessage.addListener(listener); win.addEventListener('pagehide', dispose, {once: true});
  installations.set(doc, installation); return installation;
}

if (typeof chrome !== 'undefined' && typeof document !== 'undefined' &&
  ['http:', 'https:'].includes(globalThis.location?.protocol)) {
  installPackagedPageSession({api: chrome, document, window});
}

})();

/******/ })()
;