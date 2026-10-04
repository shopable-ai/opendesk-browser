/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ "./src/framework/sdk/bridge.js":
/*!*************************************!*\
  !*** ./src/framework/sdk/bridge.js ***!
  \*************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   CHROME_PAGE_TYPE: () => (/* binding */ CHROME_PAGE_TYPE),
/* harmony export */   createSdkBridge: () => (/* binding */ createSdkBridge),
/* harmony export */   generateEventId: () => (/* binding */ generateEventId),
/* harmony export */   legacyResult: () => (/* binding */ legacyResult)
/* harmony export */ });
/* harmony import */ var _registry_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./registry.js */ "./src/framework/sdk/registry.js");
/* harmony import */ var _platform_page_port_codec_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../platform/page-port/codec.js */ "./src/platform/page-port/codec.js");



const CHROME_PAGE_TYPE = 'CHROME_EXTENSION';
function generateEventId(cryptoApi = globalThis.crypto) { return cryptoApi.randomUUID(); }
function legacyResult(value) {
  return {PageBrigeCode: 0, message: '', data: value};
}
function createSdkBridge({transport, decodeBase64Json = value => {
  const text = (0,_platform_page_port_codec_js__WEBPACK_IMPORTED_MODULE_1__.decodeBase64)(value);
  try { return JSON.parse(text); } catch { throw (0,_registry_js__WEBPACK_IMPORTED_MODULE_0__.fail)('E_VALUE_SERIALIZATION', 'Invalid callback JSON', {stage: 'json'}); }
}, clock = Date, makeId = generateEventId,
  setTimer = setTimeout, clearTimer = clearTimeout, timeoutMs = _registry_js__WEBPACK_IMPORTED_MODULE_0__.SDK_LIMITS.timeoutMs} = {}) {
  if (!transport || typeof transport.request !== 'function' || typeof transport.hello !== 'function') throw (0,_registry_js__WEBPACK_IMPORTED_MODULE_0__.fail)('E_SCHEMA', 'Explicit SDK transport required');
  const pending = new Map(), ChromeBridgeEvents = new Map();
  let disposed = false, hello, allowedMethods;
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
          if (!decodeBase64Json) throw (0,_registry_js__WEBPACK_IMPORTED_MODULE_0__.fail)('E_VALUE_SERIALIZATION', 'Base64 codec unavailable', {stage: 'base64'});
          body = decodeBase64Json(result);
        } else {
          try { body = JSON.parse(result); } catch { throw (0,_registry_js__WEBPACK_IMPORTED_MODULE_0__.fail)('E_VALUE_SERIALIZATION', 'Invalid callback JSON', {stage: 'json'}); }
        }
      }
      if (!body || typeof body !== 'object' || !Object.hasOwn(body, 'PageBrigeCode')) throw (0,_registry_js__WEBPACK_IMPORTED_MODULE_0__.fail)('E_VALUE_SERIALIZATION', 'Invalid legacy result shape', {stage: 'json'});
      // Keep old business rejection values and falsy/undefined result values exactly.
      settle(requestId, Boolean(body.PageBrigeCode), body.PageBrigeCode ? body.message : body.data);
    } catch (error) { settle(requestId, true, error.code ? error : (0,_registry_js__WEBPACK_IMPORTED_MODULE_0__.fail)('E_VALUE_SERIALIZATION', 'Invalid callback', {stage: 'json'})); }
    return '';
  }
  const ready = () => {
    if (disposed) return Promise.reject((0,_registry_js__WEBPACK_IMPORTED_MODULE_0__.fail)('E_CANCELLED', 'SDK document disposed'));
    hello ??= Promise.resolve().then(() => transport.hello({sdkVersion: _registry_js__WEBPACK_IMPORTED_MODULE_0__.SDK_VERSION})).then(result => {
      if (!result || result.sdkVersion !== _registry_js__WEBPACK_IMPORTED_MODULE_0__.SDK_VERSION || result.ready !== true || !Array.isArray(result.methods) ||
          result.methods.length > Object.keys(_registry_js__WEBPACK_IMPORTED_MODULE_0__.SDK_METHODS).length || new Set(result.methods).size !== result.methods.length ||
          !result.methods.every(method => Object.hasOwn(_registry_js__WEBPACK_IMPORTED_MODULE_0__.SDK_METHODS, method))) throw (0,_registry_js__WEBPACK_IMPORTED_MODULE_0__.fail)('E_VERSION', 'SDK Hello was not accepted');
      allowedMethods = new Set(result.methods);
      return result;
    });
    return hello;
  };
  async function call(method, args = {}) {
    if (disposed) throw (0,_registry_js__WEBPACK_IMPORTED_MODULE_0__.fail)('E_CANCELLED', 'SDK document disposed');
    const normalized = (0,_registry_js__WEBPACK_IMPORTED_MODULE_0__.normalizeMethod)(method, args);
    if (pending.size >= _registry_js__WEBPACK_IMPORTED_MODULE_0__.SDK_LIMITS.pending) throw (0,_registry_js__WEBPACK_IMPORTED_MODULE_0__.fail)('E_LIMIT', 'SDK pending budget exceeded');
    const requestId = makeId();
    if (pending.has(requestId)) throw (0,_registry_js__WEBPACK_IMPORTED_MODULE_0__.fail)('E_REQUEST_CONFLICT', 'SDK request ID collision');
    return new Promise((resolve, reject) => {
      const deadlineAt = clock.now() + timeoutMs;
      const timer = setTimer(() => settle(requestId, true, (0,_registry_js__WEBPACK_IMPORTED_MODULE_0__.fail)('E_TIMEOUT', 'SDK request deadline exceeded')), timeoutMs);
      pending.set(requestId, {resolve, reject, timer, deadlineAt});
      Map.prototype.set.call(ChromeBridgeEvents, requestId, Object.freeze({
        resolve: value => settle(requestId, false, value), reject: error => settle(requestId, true, error)
      }));
      ready().then(() => {
        if (!pending.has(requestId)) return;
        if (!allowedMethods.has(method)) throw (0,_registry_js__WEBPACK_IMPORTED_MODULE_0__.fail)('E_CAPABILITY', 'Method is absent from broker Hello allowlist');
        return transport.request({requestId, method, args: normalized, deadlineAt});
      }).then(response => {
        if (!pending.has(requestId) || response === undefined) return;
        // Admission ACK is not the operation result. Async transport calls complete later.
        if (response.accepted === true && !Object.hasOwn(response, 'result')) return;
        if (response.requestId !== requestId || !Object.hasOwn(response, 'result')) throw (0,_registry_js__WEBPACK_IMPORTED_MODULE_0__.fail)('E_VALUE_SERIALIZATION', 'Missing final SDK result', {stage: 'json'});
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
    executeScript() { throw (0,_registry_js__WEBPACK_IMPORTED_MODULE_0__.fail)('E_CAPABILITY', 'Raw page scripts are not an admitted SDK service'); },
    dispose(error = (0,_registry_js__WEBPACK_IMPORTED_MODULE_0__.fail)('E_CANCELLED', 'SDK document disposed')) {
      if (disposed) return; disposed = true;
      for (const requestId of pending.keys()) settle(requestId, true, error);
      transport.dispose?.();
    }, diagnostics: () => ({pending: pending.size, disposed})});
}


/***/ }),

/***/ "./src/framework/sdk/http.js":
/*!***********************************!*\
  !*** ./src/framework/sdk/http.js ***!
  \***********************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   createHttp: () => (/* binding */ createHttp)
/* harmony export */ });
function createHttp(call) {
  return Object.freeze({
    get: (url, config) => call('AXIOS_GET', {url, config}),
    post: (url, data, config) => call('AXIOS_POST', {url, data, config}),
    put: (url, data, config) => call('AXIOS_PUT', {url, data, config}),
    delete: (url, config) => call('AXIOS_DELETE', {url, config})
  });
}


/***/ }),

/***/ "./src/framework/sdk/notifications.js":
/*!********************************************!*\
  !*** ./src/framework/sdk/notifications.js ***!
  \********************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   createNotifications: () => (/* binding */ createNotifications)
/* harmony export */ });
/* harmony import */ var _registry_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./registry.js */ "./src/framework/sdk/registry.js");

function createNotifications(call) {
  return async function createNotify(title, content) {
    let description = '';
    if (typeof content === 'string') description = content;
    else if (typeof content === 'object') {
      if (content === null || typeof content.body !== 'string') throw (0,_registry_js__WEBPACK_IMPORTED_MODULE_0__.fail)('E_SCHEMA', 'Notification body must be a string');
      description = content.body;
    }
    return call('CREATE_NOTIFY', {title, content: description});
  };
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

/***/ "./src/framework/sdk/servers.js":
/*!**************************************!*\
  !*** ./src/framework/sdk/servers.js ***!
  \**************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   createServers: () => (/* binding */ createServers)
/* harmony export */ });
/* harmony import */ var _registry_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./registry.js */ "./src/framework/sdk/registry.js");

const address = server => {
  if (typeof server !== 'string') throw (0,_registry_js__WEBPACK_IMPORTED_MODULE_0__.fail)('E_SCHEMA');
  return server.startsWith('http') ? server : `http://${server}`;
};
function createServers(call) {
  const checkServer = (server, timeout = 5000) => call('SERVER_CHECK', {server: address(server), timeout});
  async function checkServers(servers, timeout = 5000) {
    if (!Array.isArray(servers) || servers.length > _registry_js__WEBPACK_IMPORTED_MODULE_0__.SDK_LIMITS.pending) throw (0,_registry_js__WEBPACK_IMPORTED_MODULE_0__.fail)('E_SCHEMA');
    const results = await Promise.all(servers.map(server => checkServer(server, timeout)));
    const fastestResult = results.reduce((best, result) => result.available && Number.isFinite(result.latency) &&
      (best === null || result.latency < best.latency) ? result : best, null);
    return {results, fastestResult};
  }
  return Object.freeze({checkServer, checkServers, getFastestServer: async (servers, timeout) => (await checkServers(servers, timeout)).fastestResult});
}


/***/ }),

/***/ "./src/framework/sdk/storage.js":
/*!**************************************!*\
  !*** ./src/framework/sdk/storage.js ***!
  \**************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   createStorageFacades: () => (/* binding */ createStorageFacades)
/* harmony export */ });
function createStorageFacades(call) {
  const AppStorage = Object.freeze({
    setItem: (key, value) => call('APPSTORAGE_SETITEM', {key, value}),
    getItem: key => call('APPSTORAGE_GETITEM', {key}),
    removeItem: key => call('APPSTORAGE_REMOVEITEM', {key}),
    clear: () => call('APPSTORAGE_CLEAR', {})
  });
  const AppLocal = Object.freeze({
    setItem: (key, value) => call('APPLOCAL_SETITEM', {key, value}),
    getItem: key => call('APPLOCAL_GETITEM', {key}),
    removeItem: key => call('APPLOCAL_REMOVEITEM', {key})
  });
  const storage = Object.freeze({get: key => call('CHROME_LOCAL_GET', {key}), set: values => call('CHROME_LOCAL_SET', {values}),
    remove: keys => call('CHROME_LOCAL_REMOVE', {keys}), clear: AppStorage.clear});
  return Object.freeze({AppStorage, AppLocal, storage,
    getObjectFromLocalStorage: key => call('CHROME_LOCAL_GET', {key}),
    saveObjectInLocalStorage: values => call('CHROME_LOCAL_SET', {values}),
    removeObjectFromLocalStorage: keys => call('CHROME_LOCAL_REMOVE', {keys})});
}


/***/ }),

/***/ "./src/framework/sdk/transport.js":
/*!****************************************!*\
  !*** ./src/framework/sdk/transport.js ***!
  \****************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   createWindowTransport: () => (/* binding */ createWindowTransport)
/* harmony export */ });
/* harmony import */ var _platform_page_port_codec_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../platform/page-port/codec.js */ "./src/platform/page-port/codec.js");
/* harmony import */ var _registry_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./registry.js */ "./src/framework/sdk/registry.js");



function errorFromWire(value) {
  return (0,_registry_js__WEBPACK_IMPORTED_MODULE_1__.fail)(typeof value?.code === 'string' ? value.code : 'E_EFFECT_UNKNOWN', value?.message ?? 'SDK response unavailable',
    Object.fromEntries(['stage', 'status', 'response'].filter(key => Object.hasOwn(value ?? {}, key)).map(key => [key, value[key]])));
}
function createWindowTransport({window = globalThis.window, CustomEvent = globalThis.CustomEvent,
  setTimer = setTimeout, clearTimer = clearTimeout, helloTimeoutMs = _registry_js__WEBPACK_IMPORTED_MODULE_1__.SDK_LIMITS.timeoutMs} = {}) {
  if (!window || !CustomEvent) throw (0,_registry_js__WEBPACK_IMPORTED_MODULE_1__.fail)('E_RESOURCE_UNAVAILABLE', 'SDK window transport unavailable', {stage: 'lookup'});
  const waiting = new Map(); let disposed = false;
  const parse = detail => {
    if (typeof detail !== 'string' || new TextEncoder().encode(detail).byteLength > _registry_js__WEBPACK_IMPORTED_MODULE_1__.SDK_LIMITS.responseBytes * 2) throw (0,_registry_js__WEBPACK_IMPORTED_MODULE_1__.fail)('E_VALUE_SERIALIZATION', 'Invalid SDK response', {stage: 'json'});
    try { return JSON.parse(detail); } catch { throw (0,_registry_js__WEBPACK_IMPORTED_MODULE_1__.fail)('E_VALUE_SERIALIZATION', 'Invalid SDK response JSON', {stage: 'json'}); }
  };
  const receive = event => {
    let message;
    try { message = parse(event.detail); } catch { return; }
    if (message.protocol !== _registry_js__WEBPACK_IMPORTED_MODULE_1__.PROTOCOL) return;
    const id = event.type === _registry_js__WEBPACK_IMPORTED_MODULE_1__.SDK_READY_EVENT ? 'hello' : message.requestId;
    const entry = waiting.get(id); if (!entry) return;
    waiting.delete(id); clearTimer(entry.timer);
    try {
      if (message.response?.ok !== true) throw errorFromWire(message.response?.error);
      const data = message.response.data;
      if (id === 'hello') entry.resolve(data);
      else {
        if (!Object.hasOwn(data ?? {}, 'valueWire')) throw (0,_registry_js__WEBPACK_IMPORTED_MODULE_1__.fail)('E_VALUE_SERIALIZATION', 'Admission ACK is not a final result', {stage: 'json'});
        entry.resolve({requestId: id, result: (0,_platform_page_port_codec_js__WEBPACK_IMPORTED_MODULE_0__.decodeValue)(data.valueWire, {maxBytes: _registry_js__WEBPACK_IMPORTED_MODULE_1__.SDK_LIMITS.responseBytes})});
      }
    } catch (error) { entry.reject(error); }
  };
  window.addEventListener(_registry_js__WEBPACK_IMPORTED_MODULE_1__.SDK_READY_EVENT, receive);
  window.addEventListener(_registry_js__WEBPACK_IMPORTED_MODULE_1__.SDK_RESULT_EVENT, receive);
  const send = (eventName, message, id, timeoutMs) => {
    if (disposed) return Promise.reject((0,_registry_js__WEBPACK_IMPORTED_MODULE_1__.fail)('E_CANCELLED'));
    if (waiting.has(id)) return Promise.reject((0,_registry_js__WEBPACK_IMPORTED_MODULE_1__.fail)('E_REQUEST_CONFLICT'));
    return new Promise((resolve, reject) => {
      const timer = setTimer(() => { waiting.delete(id); reject((0,_registry_js__WEBPACK_IMPORTED_MODULE_1__.fail)('E_TIMEOUT', 'SDK transport deadline exceeded')); }, timeoutMs);
      waiting.set(id, {resolve, reject, timer});
      try { window.dispatchEvent(new CustomEvent(eventName, {detail: JSON.stringify(message)})); }
      catch (error) { waiting.delete(id); clearTimer(timer); reject(error); }
    });
  };
  const dispose = () => {
    if (disposed) return; disposed = true;
    window.removeEventListener(_registry_js__WEBPACK_IMPORTED_MODULE_1__.SDK_READY_EVENT, receive); window.removeEventListener(_registry_js__WEBPACK_IMPORTED_MODULE_1__.SDK_RESULT_EVENT, receive);
    window.removeEventListener('pagehide', dispose);
    for (const entry of waiting.values()) { clearTimer(entry.timer); entry.reject((0,_registry_js__WEBPACK_IMPORTED_MODULE_1__.fail)('E_CANCELLED', 'SDK document closed')); }
    waiting.clear();
  };
  window.addEventListener('pagehide', dispose, {once: true});
  return Object.freeze({hello: () => send(_registry_js__WEBPACK_IMPORTED_MODULE_1__.SDK_HELLO_EVENT, {protocol: _registry_js__WEBPACK_IMPORTED_MODULE_1__.PROTOCOL, type: 'SDK_HELLO', payload: {sdkVersion: _registry_js__WEBPACK_IMPORTED_MODULE_1__.SDK_VERSION}}, 'hello', helloTimeoutMs),
    request: request => send(_registry_js__WEBPACK_IMPORTED_MODULE_1__.SDK_REQUEST_EVENT, {protocol: _registry_js__WEBPACK_IMPORTED_MODULE_1__.PROTOCOL, type: 'SDK_REQUEST', payload: {
      requestId: request.requestId, method: request.method, argsWire: (0,_platform_page_port_codec_js__WEBPACK_IMPORTED_MODULE_0__.encodeValue)(request.args, {maxBytes: _registry_js__WEBPACK_IMPORTED_MODULE_1__.SDK_LIMITS.requestBytes}), deadlineAt: request.deadlineAt
    }}, request.requestId, Math.max(1, request.deadlineAt - Date.now())),
    cancel(id) {
      const entry = waiting.get(id); if (!entry) return;
      waiting.delete(id); clearTimer(entry.timer); entry.reject((0,_registry_js__WEBPACK_IMPORTED_MODULE_1__.fail)('E_CANCELLED', 'SDK request settled'));
    }, dispose, diagnostics: () => ({pending: waiting.size, disposed})});
}


/***/ }),

/***/ "./src/framework/sdk/utils.js":
/*!************************************!*\
  !*** ./src/framework/sdk/utils.js ***!
  \************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   createSleep: () => (/* binding */ createSleep),
/* harmony export */   getFingerprint: () => (/* binding */ getFingerprint),
/* harmony export */   sleep: () => (/* binding */ sleep)
/* harmony export */ });
/* harmony import */ var _registry_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./registry.js */ "./src/framework/sdk/registry.js");

function createSleep({setTimer = setTimeout, clearTimer = clearTimeout} = {}) {
  return function sleep(milliseconds, {signal} = {}) {
    if (!Number.isFinite(milliseconds) || milliseconds < 0 || milliseconds > 2147483647) return Promise.reject((0,_registry_js__WEBPACK_IMPORTED_MODULE_0__.fail)('E_SCHEMA', 'Invalid sleep duration'));
    return new Promise((resolve, reject) => {
      if (signal?.aborted) return reject((0,_registry_js__WEBPACK_IMPORTED_MODULE_0__.fail)('E_CANCELLED'));
      const cleanup = () => { clearTimer(timer); signal?.removeEventListener('abort', cancel); };
      const cancel = () => { cleanup(); reject((0,_registry_js__WEBPACK_IMPORTED_MODULE_0__.fail)('E_CANCELLED')); };
      const timer = setTimer(() => { cleanup(); resolve(); }, milliseconds);
      signal?.addEventListener('abort', cancel, {once: true});
    });
  };
}
const sleep = createSleep();
async function getFingerprint() { throw (0,_registry_js__WEBPACK_IMPORTED_MODULE_0__.fail)('E_RESOURCE_UNAVAILABLE', 'Fingerprint resource is not in the approved resource allowlist', {stage: 'lookup'}); }


/***/ }),

/***/ "./src/framework/utils/device.js":
/*!***************************************!*\
  !*** ./src/framework/utils/device.js ***!
  \***************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   DeviceType: () => (/* binding */ DeviceType),
/* harmony export */   UtilDevice: () => (/* binding */ UtilDevice),
/* harmony export */   createDeviceUtils: () => (/* binding */ createDeviceUtils),
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__),
/* harmony export */   isChromeExtension: () => (/* binding */ isChromeExtension),
/* harmony export */   isElectron: () => (/* binding */ isElectron)
/* harmony export */ });
/* harmony import */ var _sdk_registry_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../sdk/registry.js */ "./src/framework/sdk/registry.js");
/* harmony import */ var _sdk_utils_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../sdk/utils.js */ "./src/framework/sdk/utils.js");


const DeviceType = Object.freeze({BROWSER: 0, DESKTOP: 1, APP_H5: 2, ANDROID: 3, IOS: 4});
const isElectron = (context = globalThis) => Boolean(context.process?.type);
const isChromeExtension = (context = globalThis) => Boolean(context.chrome?.runtime?.id);
function createDeviceUtils({call, navigator = globalThis.navigator, context = globalThis, extensionId = null, random = Math.random} = {}) {
  const getInfo = () => {
    if (isElectron(context)) throw (0,_sdk_registry_js__WEBPACK_IMPORTED_MODULE_0__.fail)('E_CAPABILITY', 'Native device information is unavailable');
    return {userAgent: navigator?.userAgent ?? '', platform: navigator?.platform ?? '', language: navigator?.language ?? '', online: navigator?.onLine ?? false};
  };
  const getBrowserInfo = userAgent => {
    if (typeof userAgent !== 'string') throw (0,_sdk_registry_js__WEBPACK_IMPORTED_MODULE_0__.fail)('E_SCHEMA');
    const browsers = [['Chrome Canary', /Chrome\/(\S+).*\s+Edg\//], ['Edge', /Edg\/(\S+)/],
      ['Chrome', /Chrome\/(\S+).*\s+Safari\//], ['Firefox', /Firefox\/(\S+)/], ['Safari', /Safari\/(\S+)/], ['IE', /MSIE (\S+);/]];
    for (const [name, regex] of browsers) { const match = userAgent.match(regex); if (match) return `${name} ${match[1]}`; }
    return userAgent;
  };
  const generateRandomString = length => {
    if (!Number.isInteger(length) || length < 0 || length > 4096) throw (0,_sdk_registry_js__WEBPACK_IMPORTED_MODULE_0__.fail)('E_SCHEMA');
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from({length}, () => alphabet[Math.floor(random() * alphabet.length)]).join('');
  };
  const getAppId = async () => {
    if (!call) throw (0,_sdk_registry_js__WEBPACK_IMPORTED_MODULE_0__.fail)('E_CAPABILITY', 'Device namespace requires admitted transport');
    return call('DEVICE_GET_APP_ID', {});
  };
  return Object.freeze({getInfo, getBrowserInfo, getInfoStr: () => getBrowserInfo(getInfo().userAgent), generateRandomString,
    getAppId, getFingerprint: _sdk_utils_js__WEBPACK_IMPORTED_MODULE_1__.getFingerprint, async getAppIdInfo() {
      // The optional extension ID is supplied only by the trusted packaged consumer.
      if (!extensionId) return {};
      const fingerId = await (0,_sdk_utils_js__WEBPACK_IMPORTED_MODULE_1__.getFingerprint)();
      return {type: DeviceType.BROWSER, chromeId: extensionId, appDeviceId: await getAppId(), fingerId};
    }});
}
const UtilDevice = createDeviceUtils();
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (UtilDevice);


/***/ }),

/***/ "./src/framework/utils/network-info.js":
/*!*********************************************!*\
  !*** ./src/framework/utils/network-info.js ***!
  \*********************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   IP_INFO_URL: () => (/* binding */ IP_INFO_URL),
/* harmony export */   createNetworkInfo: () => (/* binding */ createNetworkInfo)
/* harmony export */ });
const IP_INFO_URL = 'http://whois.pconline.com.cn/ipJson.jsp?json=true';
function createNetworkInfo(call) {
  return Object.freeze({getIpInfo: ip => call('NETWORK_INFO_GET', ip === undefined ? {} : {ip})});
}


/***/ }),

/***/ "./src/framework/utils/script.js":
/*!***************************************!*\
  !*** ./src/framework/utils/script.js ***!
  \***************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   formatJSON: () => (/* binding */ formatJSON),
/* harmony export */   wrapAsync: () => (/* binding */ wrapAsync)
/* harmony export */ });
function formatJSON(input) {
  try { return JSON.stringify(JSON.parse(input)); } catch { return input; }
}
// Source transformation only. Execution belongs to the admitted RunHost Worker.
function wrapAsync(code) {
  if (typeof code !== 'string') throw new TypeError('Script source must be a string');
  return `(async function() {\n${code}\n})()`;
}


/***/ }),

/***/ "./src/platform/page-port/codec.js":
/*!*****************************************!*\
  !*** ./src/platform/page-port/codec.js ***!
  \*****************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   VALUE_PROTOCOL: () => (/* binding */ VALUE_PROTOCOL),
/* harmony export */   base64ToBytes: () => (/* binding */ base64ToBytes),
/* harmony export */   base64ToUtf8: () => (/* binding */ base64ToUtf8),
/* harmony export */   bytesToBase64: () => (/* binding */ bytesToBase64),
/* harmony export */   canonicalValue: () => (/* binding */ canonicalValue),
/* harmony export */   decodeBase64: () => (/* binding */ decodeBase64),
/* harmony export */   decodeOutcome: () => (/* binding */ decodeOutcome),
/* harmony export */   decodeValue: () => (/* binding */ decodeValue),
/* harmony export */   encodeBase64: () => (/* binding */ encodeBase64),
/* harmony export */   encodeOutcome: () => (/* binding */ encodeOutcome),
/* harmony export */   encodeValue: () => (/* binding */ encodeValue),
/* harmony export */   utf8ToBase64: () => (/* binding */ utf8ToBase64)
/* harmony export */ });
/* harmony import */ var _protocol_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../protocol.js */ "./src/platform/protocol.js");


const VALUE_PROTOCOL = 'opendesk.value.v1';
const encoder = new TextEncoder();
const defaults = {maxDepth:12, maxBytes:_protocol_js__WEBPACK_IMPORTED_MODULE_0__.BUDGETS.maxBatchBytes};

function fail(stage, message) {
  const error = new _protocol_js__WEBPACK_IMPORTED_MODULE_0__.FoundationError('E_VALUE_SERIALIZATION', message);
  error.stage = stage;
  throw error;
}
function keys(value, expected, stage) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
    Object.keys(value).length !== expected.length || !expected.every(key => Object.hasOwn(value, key))) fail(stage, 'Invalid wire shape');
}
function validString(value, stage) {
  if (typeof value !== 'string') fail(stage, 'Expected a string');
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) fail(stage, 'Unpaired UTF-16 surrogate');
    } else if (code >= 0xdc00 && code <= 0xdfff) fail(stage, 'Unpaired UTF-16 surrogate');
  }
  return value;
}
function budget(value, options, stage) {
  let text;
  try { text = JSON.stringify(value); } catch { fail(stage, 'Wire value is not JSON'); }
  if (encoder.encode(text).byteLength > options.maxBytes) fail(stage, 'Wire byte budget exceeded');
  return value;
}

function encodeValue(value, options = {}) {
  const limits = {...defaults, ...options}, seen = new Set();
  function encode(value, depth) {
    if (depth > limits.maxDepth) fail('encode', 'Value depth exceeded');
    if (value === undefined) return {type:'undefined'};
    if (value === null) return {type:'null'};
    if (typeof value === 'string') return {type:'string', value:validString(value, 'encode')};
    if (typeof value === 'boolean') return {type:'boolean', value};
    if (typeof value === 'number' && Number.isFinite(value)) return Object.is(value, -0)
      ? {type:'number', value:0, negativeZero:true} : {type:'number', value};
    if (!value || typeof value !== 'object') fail('encode', 'Value is not serializable');
    if (seen.has(value)) fail('encode', 'Cyclic value');
    if (!Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail('encode', 'Only plain objects are supported');
    if (Object.getOwnPropertySymbols(value).length) fail('encode', 'Symbol keys are not supported');
    seen.add(value);
    const own = key => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor) return undefined;
      if (!Object.hasOwn(descriptor, 'value')) fail('encode', 'Accessors are not supported');
      return descriptor.value;
    };
    const result = Array.isArray(value)
      ? {type:'array', value:Array.from({length:value.length}, (_, i) => encode(own(String(i)), depth + 1))}
      : {type:'object', value:Object.keys(value).sort().map(key => [validString(key, 'encode'), encode(own(key), depth + 1)])};
    seen.delete(value);
    return result;
  }
  return budget(encode(value, 0), limits, 'encode');
}

function decodeValue(node, options = {}) {
  const limits = {...defaults, ...options};
  budget(node, limits, 'decode');
  function decode(node, depth) {
    if (depth > limits.maxDepth) fail('decode', 'Value depth exceeded');
    switch (node?.type) {
      case 'undefined': keys(node, ['type'], 'decode'); return undefined;
      case 'null': keys(node, ['type'], 'decode'); return null;
      case 'string': keys(node, ['type','value'], 'decode'); return validString(node.value, 'decode');
      case 'boolean': keys(node, ['type','value'], 'decode'); if (typeof node.value !== 'boolean') fail('decode', 'Invalid boolean'); return node.value;
      case 'number':
        keys(node, Object.hasOwn(node, 'negativeZero') ? ['type','value','negativeZero'] : ['type','value'], 'decode');
        if (typeof node.value !== 'number' || !Number.isFinite(node.value)) fail('decode', 'Invalid number');
        if (Object.hasOwn(node, 'negativeZero')) {
          if (node.value !== 0 || node.negativeZero !== true) fail('decode', 'Invalid negative zero');
          return -0;
        }
        return node.value;
      case 'array':
        keys(node, ['type','value'], 'decode'); if (!Array.isArray(node.value)) fail('decode', 'Invalid array');
        return node.value.map(item => decode(item, depth + 1));
      case 'object': {
        keys(node, ['type','value'], 'decode'); if (!Array.isArray(node.value)) fail('decode', 'Invalid object');
        const used = new Set(), entries = node.value.map(entry => {
          if (!Array.isArray(entry) || entry.length !== 2) fail('decode', 'Invalid object entry');
          const key = validString(entry[0], 'decode');
          if (used.has(key)) fail('decode', 'Duplicate object key');
          used.add(key);
          return [key, decode(entry[1], depth + 1)];
        });
        return Object.fromEntries(entries);
      }
      default: fail('decode', 'Unknown value tag');
    }
  }
  return decode(node, 0);
}

function encodeOutcome(outcome, options = {}) {
  if (outcome?.ok === true) {
    keys(outcome, ['ok','value'], 'outcome');
    return budget({protocol:VALUE_PROTOCOL, ok:true, value:encodeValue(outcome.value, options)}, {...defaults, ...options}, 'outcome');
  }
  keys(outcome, ['ok','error'], 'outcome');
  if (outcome.ok !== false) fail('outcome', 'Invalid outcome status');
  const error = outcome.error;
  const fields = {name:String(error?.name || 'Error'), code:String(error?.code || 'E_PAGE_EXECUTION'), message:String(error?.message ?? error)};
  for (const value of Object.values(fields)) validString(value, 'outcome');
  return budget({protocol:VALUE_PROTOCOL, ok:false, error:fields}, {...defaults, ...options}, 'outcome');
}

function decodeOutcome(outcome, options = {}) {
  if (outcome?.protocol !== VALUE_PROTOCOL) fail('outcome', 'Unknown outcome protocol');
  budget(outcome, {...defaults, ...options}, 'outcome');
  if (outcome.ok === true) {
    keys(outcome, ['protocol','ok','value'], 'outcome');
    return {ok:true, value:decodeValue(outcome.value, options)};
  }
  keys(outcome, ['protocol','ok','error'], 'outcome');
  if (outcome.ok !== false) fail('outcome', 'Invalid outcome status');
  keys(outcome.error, ['name','code','message'], 'outcome');
  for (const value of Object.values(outcome.error)) validString(value, 'outcome');
  return {ok:false, error:{...outcome.error}};
}

const canonicalValue = (value, options) => JSON.stringify(encodeValue(value, options));

function bytesToBase64(bytes, {maxBytes = _protocol_js__WEBPACK_IMPORTED_MODULE_0__.BUDGETS.maxRawFrameBytes} = {}) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength > maxBytes) fail('base64', 'Invalid or oversized bytes');
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
function base64ToBytes(value, {maxBytes = _protocol_js__WEBPACK_IMPORTED_MODULE_0__.BUDGETS.maxRawFrameBytes} = {}) {
  if (typeof value !== 'string' || value.length > 4 * Math.ceil(maxBytes / 3) ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) fail('base64', 'Invalid base64');
  let binary;
  try { binary = atob(value); } catch { fail('base64', 'Invalid base64'); }
  if (binary.length > maxBytes || btoa(binary) !== value) fail('base64', 'Noncanonical or oversized base64');
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}
const utf8ToBase64 = (text, options) => bytesToBase64(encoder.encode(validString(text, 'utf8')), options);
function base64ToUtf8(value, options) {
  try { return new TextDecoder('utf-8', {fatal:true}).decode(base64ToBytes(value, options)); }
  catch (error) { if (error.code === 'E_VALUE_SERIALIZATION') throw error; fail('utf8', 'Invalid UTF-8'); }
}
const encodeBase64 = utf8ToBase64;
const decodeBase64 = base64ToUtf8;


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
/*!************************************!*\
  !*** ./src/framework/sdk/entry.js ***!
  \************************************/
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   installPageSdk: () => (/* binding */ installPageSdk)
/* harmony export */ });
/* harmony import */ var _bridge_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./bridge.js */ "./src/framework/sdk/bridge.js");
/* harmony import */ var _transport_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./transport.js */ "./src/framework/sdk/transport.js");
/* harmony import */ var _http_js__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./http.js */ "./src/framework/sdk/http.js");
/* harmony import */ var _storage_js__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./storage.js */ "./src/framework/sdk/storage.js");
/* harmony import */ var _notifications_js__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ./notifications.js */ "./src/framework/sdk/notifications.js");
/* harmony import */ var _servers_js__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! ./servers.js */ "./src/framework/sdk/servers.js");
/* harmony import */ var _utils_js__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! ./utils.js */ "./src/framework/sdk/utils.js");
/* harmony import */ var _utils_device_js__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! ../utils/device.js */ "./src/framework/utils/device.js");
/* harmony import */ var _utils_network_info_js__WEBPACK_IMPORTED_MODULE_8__ = __webpack_require__(/*! ../utils/network-info.js */ "./src/framework/utils/network-info.js");
/* harmony import */ var _utils_script_js__WEBPACK_IMPORTED_MODULE_9__ = __webpack_require__(/*! ../utils/script.js */ "./src/framework/utils/script.js");
/* harmony import */ var _platform_page_port_codec_js__WEBPACK_IMPORTED_MODULE_10__ = __webpack_require__(/*! ../../platform/page-port/codec.js */ "./src/platform/page-port/codec.js");
/* harmony import */ var _registry_js__WEBPACK_IMPORTED_MODULE_11__ = __webpack_require__(/*! ./registry.js */ "./src/framework/sdk/registry.js");













// This immutable lifecycle survives fixed-file evaluation. It identifies an intact
// installation, not a grant: every replacement bridge obtains its own native Hello.
const installationKey = Symbol.for('opendesk.sdk.lifecycle.v1');
const installations = new WeakMap();
const names = ['OpenDeskSDK', 'service', 'CHROME_PAGE_TYPE', 'axiosx', 'AppStorage', 'AppLocal', 'createNotify', 'serverUtils', 'sleep', 'getFingerprint',
  'generateEventId', 'decodeBase64', 'ChromeBridgeEvents', 'ChromeBridgeOperationCompleted', 'callChromeBridgeInterface', 'executeInBg', 'executeScript',
  'getObjectFromLocalStorage', 'saveObjectInLocalStorage', 'removeObjectFromLocalStorage'];
function refreshInstallation(transport, global) {
  const state = installations.get(this);
  if (!state || state.global !== global) throw (0,_registry_js__WEBPACK_IMPORTED_MODULE_11__.fail)('E_SDK_GLOBAL_CONFLICT', 'SDK installation belongs to another global');
  if (state.disposed) throw (0,_registry_js__WEBPACK_IMPORTED_MODULE_11__.fail)('E_CANCELLED', 'SDK document disposed');
  const previous = state.current;
  // The fixed Hello envelope has no request ID. Serialize native Hellos so an old
  // ready event cannot fulfill the fresh transport's Hello after reinjection.
  const gate = previous ? previous.bridge.ready().catch(() => {}) : Promise.resolve();
  const frame = {transport, helloDone: false};
  frame.bridge = (0,_bridge_js__WEBPACK_IMPORTED_MODULE_0__.createSdkBridge)({transport: {
    hello: payload => gate.then(() => transport.hello(payload)).finally(() => { frame.helloDone = true; state.cleanup(); }),
    request: payload => transport.request(payload), cancel: id => transport.cancel?.(id)
  }});
  state.current = frame; state.frames.add(frame);
  if (previous) frame.bridge.ready().catch(() => {});
  state.cleanup();
  return this.exports.OpenDeskSDK;
}
function ownInstallation(global) {
  const slot = Object.getOwnPropertyDescriptor(global, installationKey);
  if (!slot) return;
  const record = slot.value;
  const exports = Object.getOwnPropertyDescriptor(record ?? {}, 'exports')?.value;
  const refresh = Object.getOwnPropertyDescriptor(record ?? {}, 'refresh')?.value;
  if (!record || typeof record !== 'object' || !exports || typeof exports !== 'object' ||
      slot.writable || slot.configurable || !Object.isFrozen(record) || !Object.isFrozen(exports) ||
      typeof refresh !== 'function' || Function.prototype.toString.call(refresh) !== Function.prototype.toString.call(refreshInstallation) ||
      Object.keys(exports).length !== names.length || !names.every(name => {
        const descriptor = Object.getOwnPropertyDescriptor(global, name);
        return descriptor && !descriptor.writable && !descriptor.configurable && Object.hasOwn(descriptor, 'value') && descriptor.value === Object.getOwnPropertyDescriptor(exports, name)?.value && Object.hasOwn(Object.getOwnPropertyDescriptor(exports, name) ?? {}, 'value');
      })) throw (0,_registry_js__WEBPACK_IMPORTED_MODULE_11__.fail)('E_SDK_GLOBAL_CONFLICT', 'SDK installation is incompatible');
  return record;
}
function installPageSdk({global = globalThis, transport} = {}) {
  const existing = ownInstallation(global);
  if (!existing) for (const name of names) {
    if (name in global) throw (0,_registry_js__WEBPACK_IMPORTED_MODULE_11__.fail)('E_SDK_GLOBAL_CONFLICT', `SDK global already exists: ${name}`);
  }
  if (transport && (typeof transport.hello !== 'function' || typeof transport.request !== 'function')) throw (0,_registry_js__WEBPACK_IMPORTED_MODULE_11__.fail)('E_SCHEMA', 'Explicit SDK transport required');
  const nextTransport = transport ?? (0,_transport_js__WEBPACK_IMPORTED_MODULE_1__.createWindowTransport)({window: global.window, CustomEvent: global.CustomEvent});
  if (existing) {
    try { return existing.refresh(nextTransport, global); }
    catch (error) { nextTransport.dispose?.(); throw error; }
  }
  const state = {global, frames: new Set(), current: undefined, disposed: false};
  const ChromeBridgeEvents = new Map();
  state.cleanup = () => {
    for (const frame of state.frames) {
      if (frame === state.current || !frame.helloDone || frame.bridge.diagnostics().pending) continue;
      state.frames.delete(frame); frame.bridge.dispose();
      if (![...state.frames].some(other => other.transport === frame.transport)) frame.transport.dispose?.();
    }
  };
  const invoke = (method, ...args) => {
    const frame = state.current, before = new Set(frame.bridge.ChromeBridgeEvents.keys());
    const result = frame.bridge[method](...args), ids = [];
    for (const [id, callback] of frame.bridge.ChromeBridgeEvents) if (!before.has(id)) { ids.push(id); ChromeBridgeEvents.set(id, callback); }
    return result.finally(() => { ids.forEach(id => ChromeBridgeEvents.delete(id)); state.cleanup(); });
  };
  const call = (...args) => invoke('call', ...args);
  const callChromeBridgeInterface = (...args) => invoke('callChromeBridgeInterface', ...args);
  const ChromeBridgeOperationCompleted = (...args) => {
    for (const frame of state.frames) frame.bridge.ChromeBridgeOperationCompleted(...args);
    return '';
  };
  const executeScript = () => { throw (0,_registry_js__WEBPACK_IMPORTED_MODULE_11__.fail)('E_CAPABILITY', 'Raw page scripts are not an admitted SDK service'); };
  const dispose = error => {
    if (state.disposed) return; state.disposed = true;
    global.window?.removeEventListener('pagehide', onPageHide);
    const transports = new Set();
    for (const frame of state.frames) { frame.bridge.dispose(error); transports.add(frame.transport); }
    transports.forEach(value => value.dispose?.()); ChromeBridgeEvents.clear();
  };
  const onPageHide = () => dispose();
  const storage = (0,_storage_js__WEBPACK_IMPORTED_MODULE_3__.createStorageFacades)(call);
  const service = Object.freeze({storage: storage.storage});
  const sdk = Object.freeze({sdkVersion: _registry_js__WEBPACK_IMPORTED_MODULE_11__.SDK_VERSION, ready: () => state.current.bridge.ready(), call, service,
    axiosx: (0,_http_js__WEBPACK_IMPORTED_MODULE_2__.createHttp)(call), ...storage, createNotify: (0,_notifications_js__WEBPACK_IMPORTED_MODULE_4__.createNotifications)(call), serverUtils: (0,_servers_js__WEBPACK_IMPORTED_MODULE_5__.createServers)(call),
    sleep: (0,_utils_js__WEBPACK_IMPORTED_MODULE_6__.createSleep)(), getFingerprint: _utils_js__WEBPACK_IMPORTED_MODULE_6__.getFingerprint, UtilDevice: (0,_utils_device_js__WEBPACK_IMPORTED_MODULE_7__.createDeviceUtils)({call, navigator: global.navigator, context: global}),
    UtilInfo: (0,_utils_network_info_js__WEBPACK_IMPORTED_MODULE_8__.createNetworkInfo)(call), formatJSON: _utils_script_js__WEBPACK_IMPORTED_MODULE_9__.formatJSON, dispose,
    diagnostics: () => ({pending: [...state.frames].reduce((sum, frame) => sum + frame.bridge.diagnostics().pending, 0), disposed: state.disposed})});
  const storageExports = {AppStorage: storage.AppStorage, AppLocal: storage.AppLocal, getObjectFromLocalStorage: storage.getObjectFromLocalStorage,
    saveObjectInLocalStorage: storage.saveObjectInLocalStorage, removeObjectFromLocalStorage: storage.removeObjectFromLocalStorage};
  const exports = Object.freeze({OpenDeskSDK: sdk, service, CHROME_PAGE_TYPE: _bridge_js__WEBPACK_IMPORTED_MODULE_0__.CHROME_PAGE_TYPE, axiosx: sdk.axiosx, ...storageExports, createNotify: sdk.createNotify, serverUtils: sdk.serverUtils,
    sleep: sdk.sleep, getFingerprint: _utils_js__WEBPACK_IMPORTED_MODULE_6__.getFingerprint, generateEventId: _bridge_js__WEBPACK_IMPORTED_MODULE_0__.generateEventId, decodeBase64: _platform_page_port_codec_js__WEBPACK_IMPORTED_MODULE_10__.decodeBase64, ChromeBridgeEvents,
    ChromeBridgeOperationCompleted, callChromeBridgeInterface, executeInBg: executeScript, executeScript});
  const record = Object.freeze({exports, refresh: refreshInstallation});
  installations.set(record, state);
  record.refresh(nextTransport, global);
  for (const [name, value] of Object.entries(exports)) Object.defineProperty(global, name, {value, enumerable: true, writable: false, configurable: false});
  Object.defineProperty(global, installationKey, {value: record});
  global.window?.addEventListener('pagehide', onPageHide, {once: true});
  return sdk;
}
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  // Failed Hello remains a typed refusal; a later trusted regrant can refresh it.
  const sdk = installPageSdk();
  sdk.ready().catch(() => {});
}

})();

/******/ })()
;