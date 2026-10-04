/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ "./src/framework/ChromePage.js":
/*!*************************************!*\
  !*** ./src/framework/ChromePage.js ***!
  \*************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   ChromeElement: () => (/* binding */ ChromeElement),
/* harmony export */   ChromePage: () => (/* binding */ ChromePage),
/* harmony export */   Environment: () => (/* binding */ Environment),
/* harmony export */   Keyboard: () => (/* binding */ Keyboard),
/* harmony export */   createBoundPage: () => (/* binding */ createBoundPage),
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var _control_value_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./control/value.js */ "./src/framework/control/value.js");


const pages = new WeakMap(), elements = new WeakMap(), keyPages = new WeakMap();
const secret = Symbol('bound-page');
const Environment = Object.freeze({CHROME: 'CHROME', CAPACITOR: 'CAPACITOR', UNKNOWN: 'UNKNOWN'});
function state(page) { const binding = pages.get(page); (0,_control_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(binding, 'E_PAGE_CONTEXT_REQUIRED'); return binding; }
function dispatch(page, method, args, extra) { return state(page).request(method, args, extra); }
function navigationOptions(value = {}) {
  (0,_control_value_js__WEBPACK_IMPORTED_MODULE_0__.options)(value, ['timeout', 'waitUntil']);
  const timeout = value.timeout === undefined ? 30000 : (0,_control_value_js__WEBPACK_IMPORTED_MODULE_0__.duration)(value.timeout);
  const waitUntil = value.waitUntil === undefined ? 'complete' : value.waitUntil;
  (0,_control_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(['complete', 'load', 'domcontentloaded'].includes(waitUntil), 'E_OPTION_UNSUPPORTED');
  return {timeout, waitUntil};
}
function clickOptions(value = {}) {
  (0,_control_value_js__WEBPACK_IMPORTED_MODULE_0__.options)(value, ['button', 'clickCount', 'delay']);
  const {button = 'left', clickCount = 1, delay = 0} = value;
  (0,_control_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(['left', 'right', 'middle'].includes(button) && Number.isInteger(clickCount) && clickCount >= 1 && clickCount <= 100, 'E_ARGUMENT_TYPE');
  return {button, clickCount, delay: (0,_control_value_js__WEBPACK_IMPORTED_MODULE_0__.duration)(delay)};
}
function typeArgs(text, value = {}) {
  (0,_control_value_js__WEBPACK_IMPORTED_MODULE_0__.options)(value, ['delay']);
  (0,_control_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(text === null || ['undefined', 'string', 'boolean', 'number'].includes(typeof text), 'E_ARGUMENT_TYPE');
  (0,_control_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(typeof text !== 'number' || Number.isFinite(text), 'E_ARGUMENT_TYPE');
  return [String(text), {delay: (0,_control_value_js__WEBPACK_IMPORTED_MODULE_0__.duration)(value.delay === undefined ? 0 : value.delay)}];
}
function key(value) { (0,_control_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(typeof value === 'string' && value.length > 0, 'E_ARGUMENT_TYPE'); (0,_control_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(value.length === 1 || !value.includes('+'), 'E_KEY_UNSUPPORTED'); return value; }
function tagOptions(value, script) {
  (0,_control_value_js__WEBPACK_IMPORTED_MODULE_0__.options)(value, script ? ['url', 'content', 'type', 'onload'] : ['url', 'content']);
  (0,_control_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)((typeof value.url === 'string' && value.url.length > 0) !== (typeof value.content === 'string' && value.content.length > 0), 'E_ARGUMENT_TYPE');
  if (script) {
    (0,_control_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(value.onload === undefined, 'E_OPTION_UNSUPPORTED');
    (0,_control_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(value.type === undefined || value.type === 'text/javascript', 'E_OPTION_UNSUPPORTED');
  }
  if (value.url !== undefined) {
    (0,_control_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(typeof value.url === 'string' && value.url.startsWith('chrome-extension://'), 'E_RESOURCE_URL_UNSUPPORTED');
    return {url: value.url, ...(script && value.type ? {type: value.type} : {})};
  }
  (0,_control_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(typeof value.content === 'string' && value.content.length > 0, 'E_ARGUMENT_TYPE');
  if (!script) (0,_control_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(!/@import\b|url\s*\(/i.test(value.content), 'E_STYLE_URL_UNSUPPORTED');
  return {content: value.content};
}
function snapshotNode(page, snapshot) {
  if (snapshot === null) return null;
  const dom = state(page).dom;
  (0,_control_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(dom?.implementation, 'E_DOM_SNAPSHOT_CONTEXT');
  // Inert parsing in a detached document: no script execution or active DOM attachment.
  const doc = dom.implementation.createHTMLDocument('');
  const container = doc.createElement('template'); container.innerHTML = snapshot.outerHTML;
  return container.content.firstElementChild;
}
function createBoundPage(binding, opts) { return new ChromePage(opts, {secret, binding}); }
class ChromePage {
  constructor(opts, token) {
    (0,_control_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(token?.secret === secret, 'E_PAGE_CONTEXT_REQUIRED');
    opts = opts === undefined || opts === null ? {debug: true} : (0,_control_value_js__WEBPACK_IMPORTED_MODULE_0__.options)(opts, ['debug']);
    (0,_control_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(opts.debug === undefined || typeof opts.debug === 'boolean', 'E_ARGUMENT_TYPE');
    pages.set(this, token.binding);
    Object.defineProperties(this, {environment: {value: token.binding.environment, enumerable: true}, keyboard: {value: new Keyboard(this), enumerable: true}});
    this.debug = opts.debug;
  }
  handleMessage() { throw new _control_value_js__WEBPACK_IMPORTED_MODULE_0__.PageError('E_CALLBACK_UNAUTHORIZED'); }
  operationCompleted() { throw new _control_value_js__WEBPACK_IMPORTED_MODULE_0__.PageError('E_CALLBACK_UNAUTHORIZED'); }
  title() { return dispatch(this, 'title', []); }
  content() { return dispatch(this, 'content', []); }
  url() { return dispatch(this, 'url', []); }
  async reload(opts = {}) { await dispatch(this, 'reload', [navigationOptions(opts)], {kind: 'browser', navigation: true}); }
  async goto(url, opts = {}) { await dispatch(this, 'goto', [(0,_control_value_js__WEBPACK_IMPORTED_MODULE_0__.httpURL)(url), navigationOptions(opts)], {kind: 'browser', navigation: true}); }
  async $(css) { (0,_control_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(state(this).dom?.implementation, 'E_DOM_SNAPSHOT_CONTEXT'); return snapshotNode(this, await this.snapshot(css)); }
  async $$(css) { (0,_control_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(state(this).dom?.implementation, 'E_DOM_SNAPSHOT_CONTEXT'); return (await this.snapshots(css)).map(v => snapshotNode(this, v)); }
  snapshot(css) { return dispatch(this, 'snapshot', [(0,_control_value_js__WEBPACK_IMPORTED_MODULE_0__.selector)(css)]); }
  snapshots(css) { return dispatch(this, 'snapshots', [(0,_control_value_js__WEBPACK_IMPORTED_MODULE_0__.selector)(css)]); }
  $eval(css, fn, ...args) { return dispatch(this, '$eval', [(0,_control_value_js__WEBPACK_IMPORTED_MODULE_0__.selector)(css), (0,_control_value_js__WEBPACK_IMPORTED_MODULE_0__.functionSource)(fn), args], {kind: 'user-script'}); }
  $$eval(css, fn, ...args) { return dispatch(this, '$$eval', [(0,_control_value_js__WEBPACK_IMPORTED_MODULE_0__.selector)(css), (0,_control_value_js__WEBPACK_IMPORTED_MODULE_0__.functionSource)(fn), args], {kind: 'user-script'}); }
  async addScriptTag(opts) {
    const value = tagOptions(opts, true);
    if (value.content !== undefined) await dispatch(this, 'eval', [value.content, {mode: 'statement'}], {kind: 'user-script'});
    else await dispatch(this, 'addScriptTag', [value]);
  }
  async addStyleTag(opts) { await dispatch(this, 'addStyleTag', [tagOptions(opts, false)]); }
  cookies(...urls) { return dispatch(this, 'cookies', [urls.map(_control_value_js__WEBPACK_IMPORTED_MODULE_0__.httpURL)], {kind: 'browser'}); }
  async setCookie(...values) { await dispatch(this, 'setCookie', values, {kind: 'browser'}); }
  async deleteCookie(...values) { await dispatch(this, 'deleteCookie', values, {kind: 'browser'}); }
  click(css, opts = {}) { return dispatch(this, 'click', [(0,_control_value_js__WEBPACK_IMPORTED_MODULE_0__.selector)(css), clickOptions(opts)]); }
  type(css, text, opts = {}) { return dispatch(this, 'type', [(0,_control_value_js__WEBPACK_IMPORTED_MODULE_0__.selector)(css), ...typeArgs(text, opts)]); }
  waitFor(value, opts = {}, ...args) {
    if (typeof value === 'string') return this.waitForSelector(value, opts);
    if (typeof value === 'function') return this.waitForFunction(value, opts, ...args);
    if (typeof value === 'number') return this.waitForTimeout(value);
    throw new _control_value_js__WEBPACK_IMPORTED_MODULE_0__.PageError('E_ARGUMENT_TYPE');
  }
  waitForTimeout(ms) { return dispatch(this, 'waitForTimeout', [(0,_control_value_js__WEBPACK_IMPORTED_MODULE_0__.duration)(ms)]); }
  async waitForSelector(css, opts = {}) {
    (0,_control_value_js__WEBPACK_IMPORTED_MODULE_0__.options)(opts, ['visible', 'hidden', 'timeout']);
    const {visible = false, hidden = false, timeout = 30000} = opts;
    (0,_control_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(typeof visible === 'boolean' && typeof hidden === 'boolean' && !(visible && hidden), 'E_ARGUMENT_TYPE');
    const binding = state(this), target = binding.capture();
    await binding.request('waitForSelector', [(0,_control_value_js__WEBPACK_IMPORTED_MODULE_0__.selector)(css), {visible, hidden, timeout: (0,_control_value_js__WEBPACK_IMPORTED_MODULE_0__.duration)(timeout)}], {target});
    binding.guard(target); return createElement(this, css, target);
  }
  waitForFunction(fn, opts = {}, ...args) {
    (0,_control_value_js__WEBPACK_IMPORTED_MODULE_0__.options)(opts, ['polling', 'timeout']); const {polling = 'raf', timeout = 30000} = opts;
    (0,_control_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(polling === 'raf' || (typeof polling === 'number' && Number.isFinite(polling) && polling > 0), 'E_ARGUMENT_TYPE');
    return dispatch(this, 'waitForFunction', [(0,_control_value_js__WEBPACK_IMPORTED_MODULE_0__.functionSource)(fn), {polling, timeout: (0,_control_value_js__WEBPACK_IMPORTED_MODULE_0__.duration)(timeout)}, args], {kind: 'user-script'});
  }
  screenshot(opts = {}) { return this.screenshotInChrome(opts); }
  screenshotInWebview() { return Promise.reject(new _control_value_js__WEBPACK_IMPORTED_MODULE_0__.PageError('E_CAPABILITY_UNAVAILABLE')); }
  screenshotInChrome(opts = {}) {
    (0,_control_value_js__WEBPACK_IMPORTED_MODULE_0__.options)(opts, ['format', 'fullPage']); const {format = 'png', fullPage = false} = opts;
    (0,_control_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(['png', 'jpeg'].includes(format), 'E_OPTION_UNSUPPORTED');
    (0,_control_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(typeof fullPage === 'boolean', 'E_ARGUMENT_TYPE'); (0,_control_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(!fullPage, 'E_FULL_PAGE_UNSUPPORTED');
    return dispatch(this, 'screenshot', [{format, fullPage: false}], {kind: 'browser'});
  }
  async uploadFile(css, value) {
    (0,_control_value_js__WEBPACK_IMPORTED_MODULE_0__.selector)(css);
    if (typeof value === 'string') {
      if (value.startsWith('data:')) await this._uploadFromDataUrl(css, value);
      else await this._uploadFromUrl(css, value);
    } else await this._uploadFromBlob(css, value);
  }
  async _uploadFromBlob(css, value) {
    const binding = state(this), target = binding.capture(); binding.guard(target); (0,_control_value_js__WEBPACK_IMPORTED_MODULE_0__.selector)(css);
    (0,_control_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(value instanceof ArrayBuffer || (typeof Blob !== 'undefined' && value instanceof Blob), 'E_ARGUMENT_TYPE');
    (0,_control_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)((value.byteLength ?? value.size) <= _control_value_js__WEBPACK_IMPORTED_MODULE_0__.VALUE_LIMITS.uploadBytes, 'E_UPLOAD_TOO_LARGE');
    const bytes = value instanceof ArrayBuffer ? new Uint8Array(value.slice(0)) : new Uint8Array(await value.arrayBuffer());
    binding.guard(target);
    // Chunks stay under the approved JSON frame budget. The broker owns staging and cleanup.
    const uploadId = (0,_control_value_js__WEBPACK_IMPORTED_MODULE_0__.newPageRequestId)();
    for (let offset = 0; offset < bytes.length; offset += _control_value_js__WEBPACK_IMPORTED_MODULE_0__.VALUE_LIMITS.chunkBytes) {
      binding.guard(target);
      const chunk = bytes.subarray(offset, offset + _control_value_js__WEBPACK_IMPORTED_MODULE_0__.VALUE_LIMITS.chunkBytes);
      let binary = ''; for (const byte of chunk) binary += String.fromCharCode(byte);
      await binding.request('uploadChunk', [uploadId, offset, bytes.length, btoa(binary)], {target});
    }
    binding.guard(target); await binding.request('uploadCommit', [(0,_control_value_js__WEBPACK_IMPORTED_MODULE_0__.selector)(css), uploadId, bytes.length], {target}); return true;
  }
  async _uploadFromDataUrl(css, value) {
    (0,_control_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(typeof value === 'string' && /^data:[^,]*;base64,[A-Za-z0-9+/]*={0,2}$/.test(value), 'E_UPLOAD_FORMAT');
    const encoded = value.slice(value.indexOf(',') + 1); (0,_control_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(encoded.length % 4 === 0, 'E_UPLOAD_FORMAT');
    (0,_control_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(encoded.length <= Math.ceil(_control_value_js__WEBPACK_IMPORTED_MODULE_0__.VALUE_LIMITS.uploadBytes / 3) * 4, 'E_UPLOAD_TOO_LARGE');
    let binary; try { binary = atob(encoded); } catch { throw new _control_value_js__WEBPACK_IMPORTED_MODULE_0__.PageError('E_UPLOAD_FORMAT'); }
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    await this._uploadFromBlob(css, bytes.buffer);
  }
  async _uploadFromUrl(css, url) { await dispatch(this, 'uploadFromUrl', [(0,_control_value_js__WEBPACK_IMPORTED_MODULE_0__.selector)(css), (0,_control_value_js__WEBPACK_IMPORTED_MODULE_0__.httpURL)(url)], {kind: 'browser'}); return true; }
  eval(code, opts = {}) {
    (0,_control_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(typeof code === 'string' && code.length > 0, 'E_ARGUMENT_TYPE');
    (0,_control_value_js__WEBPACK_IMPORTED_MODULE_0__.options)(opts, ['mode', 'debug']);
    (0,_control_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(opts.mode !== undefined, 'E_LEGACY_AMBIGUOUS_EXECUTION');
    (0,_control_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(['expression', 'statement'].includes(opts.mode), 'E_OPTION_UNSUPPORTED');
    (0,_control_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(opts.debug === undefined || typeof opts.debug === 'boolean', 'E_ARGUMENT_TYPE');
    return dispatch(this, 'eval', [code, {mode: opts.mode}], {kind: 'user-script'});
  }
  evaluate(fnOrString, ...args) {
    if (typeof fnOrString === 'string') return dispatch(this, 'evaluate', [{mode: 'legacy-statement', source: fnOrString}, []], {kind: 'user-script'});
    return dispatch(this, 'evaluate', [{mode: 'function', source: (0,_control_value_js__WEBPACK_IMPORTED_MODULE_0__.functionSource)(fnOrString)}, args], {kind: 'user-script'});
  }
  evaluateExpression(expression, ...extra) {
    (0,_control_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(extra.length === 0 && typeof expression === 'string' && expression.trim().length > 0, 'E_ARGUMENT_TYPE');
    return dispatch(this, 'evaluateExpression', [expression], {kind: 'user-script'});
  }
  _execute() { throw new _control_value_js__WEBPACK_IMPORTED_MODULE_0__.PageError('E_INTERNAL_API_ONLY'); }
}
function createElement(page, css, target) { return new ChromeElement(page, css, target); }
class ChromeElement {
  constructor(page, css, captured) {
    const binding = state(page); (0,_control_value_js__WEBPACK_IMPORTED_MODULE_0__.selector)(css); const target = captured || binding.capture(); binding.guard(target);
    elements.set(this, {binding, target});
    Object.defineProperties(this, {page: {value: page, enumerable: true}, selector: {value: css, enumerable: true}});
  }
  click(opts = {}) { const {binding, target} = elements.get(this); return binding.request('click', [this.selector, clickOptions(opts)], {target}); }
  type(text, opts = {}) { const {binding, target} = elements.get(this); return binding.request('type', [this.selector, ...typeArgs(text, opts)], {target}); }
  uploadFile(value) {
    const {binding, target} = elements.get(this); binding.guard(target);
    // A bound view pins every helper request, including async Blob conversion and chunks.
    const view = createBoundPage({...binding, capture: () => target, guard: () => binding.guard(target), request: (method, args, extra) => binding.request(method, args, {...extra, target})});
    return view.uploadFile(this.selector, value);
  }
}
class Keyboard {
  constructor(page) { state(page); keyPages.set(this, page); Object.defineProperty(this, 'page', {value: page, enumerable: true}); }
  async type(text) { (0,_control_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(typeof text === 'string', 'E_ARGUMENT_TYPE'); const target = state(this.page).capture(); for (const char of text) await state(this.page).request('keyboard', ['press', key(char)], {target}); }
  press(value) { return dispatch(keyPages.get(this), 'keyboard', ['press', key(value)]); }
  down(value) { return dispatch(keyPages.get(this), 'keyboard', ['down', key(value)]); }
  up(value) { return dispatch(keyPages.get(this), 'keyboard', ['up', key(value)]); }
}
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (ChromePage);


/***/ }),

/***/ "./src/framework/context.js":
/*!**********************************!*\
  !*** ./src/framework/context.js ***!
  \**********************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   createRunContext: () => (/* binding */ createRunContext),
/* harmony export */   relayContextRequest: () => (/* binding */ relayContextRequest)
/* harmony export */ });
/* harmony import */ var _ChromePage_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./ChromePage.js */ "./src/framework/ChromePage.js");
/* harmony import */ var _control_value_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./control/value.js */ "./src/framework/control/value.js");



const relays = new WeakMap();
function same(a, b) {
  if (!a || !b) return a === b;
  const keys = Object.keys(a).sort(), other = Object.keys(b).sort();
  return keys.length === other.length && keys.every((key, i) => key === other[i] &&
    (a[key] && typeof a[key] === 'object' ? same(a[key], b[key]) : Object.is(a[key], b[key])));
}
// Internal host relay for a private Worker request; it uses the context's sole
// injected transport and the same owner/target fencing as host facade calls.
function relayContextRequest(context, envelope) {
  const relay = relays.get(context); (0,_control_value_js__WEBPACK_IMPORTED_MODULE_1__.requireValue)(relay, 'E_PAGE_CONTEXT_REQUIRED'); return relay(envelope);
}

// Admission, pinning and target authentication are performed by the one broker.
// The injected transport must be exclusive to this admitted owner, not an active-tab resolver.
function createRunContext({identity, revision, target = identity?.target, transport, signal, deadline = null, dom = globalThis.document}) {
  (0,_control_value_js__WEBPACK_IMPORTED_MODULE_1__.requireValue)(identity && typeof identity.runId === 'string' && identity.runId && Number.isSafeInteger(identity.ownerEpoch) && identity.ownerEpoch > 0,
    'E_PAGE_CONTEXT_REQUIRED', 'An admitted owner identity is required');
  (0,_control_value_js__WEBPACK_IMPORTED_MODULE_1__.requireValue)(revision && Number.isSafeInteger(revision.revision) && revision.revision > 0 && /^[a-f0-9]{64}$/.test(revision.sourceHash),
    'E_PAGE_CONTEXT_REQUIRED', 'A committed revision pin is required');
  (0,_control_value_js__WEBPACK_IMPORTED_MODULE_1__.requireValue)(target && Number.isSafeInteger(target.tabId) && target.tabId >= 0 && Number.isSafeInteger(target.frameId) && target.frameId >= 0 && typeof target.documentId === 'string' && target.documentId,
    'E_PAGE_CONTEXT_REQUIRED', 'An authenticated tab/frame/document is required');
  (0,_control_value_js__WEBPACK_IMPORTED_MODULE_1__.requireValue)(transport && typeof transport.request === 'function', 'E_PAGE_CONTEXT_REQUIRED', 'An owner-bound transport is required');
  (0,_control_value_js__WEBPACK_IMPORTED_MODULE_1__.requireValue)(deadline === null || (Number.isFinite(deadline) && deadline >= 0), 'E_ARGUMENT_TYPE');
  const owner = (0,_control_value_js__WEBPACK_IMPORTED_MODULE_1__.frozenCopy)(identity), pin = (0,_control_value_js__WEBPACK_IMPORTED_MODULE_1__.frozenCopy)(revision);
  let current = (0,_control_value_js__WEBPACK_IMPORTED_MODULE_1__.frozenCopy)(target), closed;
  const lifetime = new AbortController(), pending = new Set();
  function dispose(code = 'E_CANCELLED') {
    if (closed) return;
    closed = new _control_value_js__WEBPACK_IMPORTED_MODULE_1__.PageError(code); lifetime.abort(closed);
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
    (0,_control_value_js__WEBPACK_IMPORTED_MODULE_1__.requireValue)(same(bound, current), 'E_DOCUMENT_REPLACED');
  }
  async function exchange(envelope, navigation) {
    const captured = envelope.target, requestId = envelope.requestId; guard(captured);
    let rejectPending;
    const cancelled = new Promise((_, reject) => { rejectPending = reject; pending.add(reject); });
    try {
      guard(captured);
      const reply = await Promise.race([transport.request(envelope, {signal: lifetime.signal}), cancelled]);
      guard(captured);
      (0,_control_value_js__WEBPACK_IMPORTED_MODULE_1__.requireValue)(reply && reply.requestId === requestId, 'E_RESULT_FORMAT', 'Reply must correlate with the original request');
      if (reply.error) throw new _control_value_js__WEBPACK_IMPORTED_MODULE_1__.PageError(reply.error.code || 'E_PAGE_EXECUTION', reply.error.message, reply.error.cause);
      const result = (0,_control_value_js__WEBPACK_IMPORTED_MODULE_1__.decodeValue)(reply.value);
      if (navigation) {
        // Only a trusted transport may attest the broker's completed navigation handoff.
        const handoff = reply.handoff;
        (0,_control_value_js__WEBPACK_IMPORTED_MODULE_1__.requireValue)(handoff && handoff.from.documentId === captured.documentId && handoff.from.tabId === captured.tabId &&
          handoff.from.frameId === captured.frameId && handoff.to.tabId === captured.tabId && handoff.to.frameId === captured.frameId &&
          typeof handoff.to.documentId === 'string' && handoff.to.documentId && Number.isSafeInteger(handoff.to.targetVersion) &&
          handoff.to.targetVersion > (captured.targetVersion || 0), 'E_DOCUMENT_REPLACED', 'A trusted navigation handoff is required');
        guard(captured); current = (0,_control_value_js__WEBPACK_IMPORTED_MODULE_1__.frozenCopy)(handoff.to);
      }
      return {reply, result};
    } finally { pending.delete(rejectPending); }
  }
  async function request(method, args, {kind = 'packaged', target: bound = current, navigation = false} = {}) {
    guard(bound);
    // Serialization precedes request registration; malformed args never reach transport.
    const encoded = (0,_control_value_js__WEBPACK_IMPORTED_MODULE_1__.encodeValue)(args, {maxBytes: method === 'uploadChunk' ? 131072 : 65536});
    const captured = (0,_control_value_js__WEBPACK_IMPORTED_MODULE_1__.frozenCopy)(bound);
    const envelope = Object.freeze({requestId: (0,_control_value_js__WEBPACK_IMPORTED_MODULE_1__.newPageRequestId)(), identity: (0,_control_value_js__WEBPACK_IMPORTED_MODULE_1__.frozenCopy)({...owner, target: captured}), revision: pin, target: captured,
      operation: Object.freeze({kind, method, args: encoded})});
    return (await exchange(envelope, navigation)).result;
  }
  const binding = Object.freeze({request, guard, capture: () => current, dom, environment: 'CHROME'});
  class SessionChromePage {
    constructor(options) { return (0,_ChromePage_js__WEBPACK_IMPORTED_MODULE_0__.createBoundPage)(binding, options); }
  }
  const page = (0,_ChromePage_js__WEBPACK_IMPORTED_MODULE_0__.createBoundPage)(binding);
  const context = Object.freeze({identity: owner, revision: pin, get target() { return current; }, page, ChromePage: SessionChromePage,
    signal: lifetime.signal, dispose, snapshot: () => Object.freeze({closed: closed?.code || null, pending: pending.size, timer: timer === null || closed ? 0 : 1})});
  relays.set(context, async envelope => {
    guard();
    (0,_control_value_js__WEBPACK_IMPORTED_MODULE_1__.requireValue)(envelope && typeof envelope.requestId === 'string' && envelope.requestId && same(envelope.identity, {...owner, target: current}) && same(envelope.revision, pin), 'E_OWNER_CHANGED');
    guard(envelope.target);
    const captured = (0,_control_value_js__WEBPACK_IMPORTED_MODULE_1__.frozenCopy)(envelope);
    const args = (0,_control_value_js__WEBPACK_IMPORTED_MODULE_1__.decodeValue)(captured.operation.args, {maxBytes: captured.operation.method === 'uploadChunk' ? 131072 : 65536});
    (0,_control_value_js__WEBPACK_IMPORTED_MODULE_1__.requireValue)(Array.isArray(args), 'E_ARGUMENT_TYPE');
    return (await exchange(captured, captured.operation.kind === 'browser' && ['goto', 'reload'].includes(captured.operation.method))).reply;
  });
  return context;
}


/***/ }),

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

/***/ "./src/scripting/sandbox/page-proxy.js":
/*!*********************************************!*\
  !*** ./src/scripting/sandbox/page-proxy.js ***!
  \*********************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   createWorkerPageProxy: () => (/* binding */ createWorkerPageProxy)
/* harmony export */ });
/* harmony import */ var _framework_context_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../framework/context.js */ "./src/framework/context.js");
/* harmony import */ var _framework_control_value_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../framework/control/value.js */ "./src/framework/control/value.js");



// The transferred port is held only by this closure; no global RPC listener or
// runtime.sendMessage is exposed to user code. This is a client, not authority.
function createWorkerPageProxy({port, identity, revision, target, deadline = null}) {
  (0,_framework_control_value_js__WEBPACK_IMPORTED_MODULE_1__.requireValue)(port && typeof port.postMessage === 'function', 'E_PAGE_CONTEXT_REQUIRED');
  const send = port.postMessage.bind(port), add = port.addEventListener.bind(port), remove = port.removeEventListener.bind(port);
  const close = port.close.bind(port), start = port.start.bind(port), clone = structuredClone;
  const NativePromise = Promise, MapType = Map, pending = new MapType();
  const get = pending.get.bind(pending), put = pending.set.bind(pending), del = pending.delete.bind(pending);
  const identityPin = (0,_framework_control_value_js__WEBPACK_IMPORTED_MODULE_1__.frozenCopy)(identity); let sequence = 0, closed = false;
  const lifetime = new AbortController();
  const transport = Object.freeze({request(envelope, {signal}) {
    if (closed || signal.aborted) return NativePromise.reject(signal.reason || new _framework_control_value_js__WEBPACK_IMPORTED_MODULE_1__.PageError('E_CANCELLED'));
    const id = ++sequence;
    return new NativePromise((resolve, reject) => {
      const abort = () => { const waiter = get(id); if (!waiter) return; del(id); reject(signal.reason || new _framework_control_value_js__WEBPACK_IMPORTED_MODULE_1__.PageError('E_CANCELLED')); };
      put(id, {requestId: envelope.requestId, resolve, reject, signal, abort}); signal.addEventListener('abort', abort, {once: true});
      try { send({kind: 'operation', runId: identityPin.runId, ownerEpoch: identityPin.ownerEpoch, id, envelope: clone(envelope)}); }
      catch (error) { del(id); signal.removeEventListener('abort', abort); reject(new _framework_control_value_js__WEBPACK_IMPORTED_MODULE_1__.PageError('E_VALUE_SERIALIZATION', error.message)); }
    });
  }});
  const context = (0,_framework_context_js__WEBPACK_IMPORTED_MODULE_0__.createRunContext)({identity: identityPin, revision, target, deadline, transport, signal: lifetime.signal, dom: null});
  function receive({data}) {
    if (closed || data?.runId !== identityPin.runId || data?.ownerEpoch !== identityPin.ownerEpoch || data.kind !== 'reply' || !Number.isSafeInteger(data.id)) return;
    const waiter = get(data.id); if (!waiter || data.reply?.requestId !== waiter.requestId) return;
    del(data.id); waiter.signal.removeEventListener('abort', waiter.abort); waiter.resolve(data.reply);
  }
  add('message', receive); start();
  function dispose(code = 'E_CANCELLED') {
    if (closed) return; closed = true; lifetime.abort(new _framework_control_value_js__WEBPACK_IMPORTED_MODULE_1__.PageError(code)); context.dispose(code);
    remove('message', receive); close(); pending.clear();
  }
  return Object.freeze({page: context.page, context, dispose, snapshot: () => ({pending: pending.size, ...context.snapshot()})});
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
/*!*************************************************!*\
  !*** ./src/scripting/sandbox/worker-runtime.js ***!
  \*************************************************/
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   installControlWorker: () => (/* binding */ installControlWorker)
/* harmony export */ });
/* harmony import */ var _page_proxy_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./page-proxy.js */ "./src/scripting/sandbox/page-proxy.js");
/* harmony import */ var _framework_control_value_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../framework/control/value.js */ "./src/framework/control/value.js");



// Bundle this entry as a fixed classic script, fetch that packaged bundle in
// the extension host, then instantiate it as a Blob Worker in the opaque realm.
// AsyncFunction is captured and used ONLY here, never in host, sandbox or SW.
function installControlWorker(scope) {
  'use strict';
  const AsyncBody = Object.getPrototypeOf(async function () {}).constructor;
  const apply = Reflect.apply, clone = structuredClone, freeze = Object.freeze;
  const NativePromise = Promise, then = Function.call.bind(Promise.prototype.then);
  const add = scope.addEventListener.bind(scope), remove = scope.removeEventListener.bind(scope);
  const ready = scope.postMessage.bind(scope), identity = freeze({url: scope.location.href, name: scope.name, origin: scope.origin});
  let bound = false;
  function bind(event) {
    if (bound || event.data?.kind !== 'bind' || event.ports.length !== 1) return;
    bound = true; remove('message', bind);
    const port = event.ports[0], send = port.postMessage.bind(port), start = port.start.bind(port);
    const addPort = port.addEventListener.bind(port), pin = freeze(clone(event.data.identity));
    const proxy = (0,_page_proxy_js__WEBPACK_IMPORTED_MODULE_0__.createWorkerPageProxy)({port, identity: pin, revision: event.data.revision, target: event.data.target});
    let started = false;
    add('securitypolicyviolation', event => {
      if (event.isTrusted) send({kind: 'policy', runId: pin.runId, ownerEpoch: pin.ownerEpoch, directive: event.effectiveDirective, blockedURI: event.blockedURI, originalPolicy: event.originalPolicy});
    });
    addPort('message', ({data}) => {
      if (started || data?.kind !== 'execute' || data.runId !== pin.runId || data.ownerEpoch !== pin.ownerEpoch) return;
      started = true;
      function fail(error) {
        send({kind: 'error', runId: pin.runId, ownerEpoch: pin.ownerEpoch,
          error: {code: error?.code || 'E_CONTROL_EXECUTION', name: error?.name || 'Error', message: String(error?.message || error)}});
      }
      try {
        const body = new AsyncBody('page', 'params', data.body);
        const params = clone(data.params);
        then(NativePromise.resolve(apply(body, params, [proxy.page, params])), value => {
          try { send({kind: 'result', runId: pin.runId, ownerEpoch: pin.ownerEpoch, value: (0,_framework_control_value_js__WEBPACK_IMPORTED_MODULE_1__.encodeValue)(value)}); }
          catch (error) { fail(new _framework_control_value_js__WEBPACK_IMPORTED_MODULE_1__.PageError('E_VALUE_SERIALIZATION', error.message)); }
        }, fail);
      } catch (error) { fail(error); }
    });
    start(); send({kind: 'bound', runId: pin.runId, ownerEpoch: pin.ownerEpoch, identity});
  }
  add('message', bind); ready({kind: 'worker-ready'});
}
if (typeof WorkerGlobalScope !== 'undefined' && globalThis instanceof WorkerGlobalScope) installControlWorker(globalThis);

})();

/******/ })()
;