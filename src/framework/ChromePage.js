import {PageError, requireValue, functionSource, options, selector, duration, httpURL, VALUE_LIMITS, newPageRequestId} from './control/value.js';
import {createLocator} from './locator.js';
import {validateObservationOptions, MODERN_PAGE_CAPABILITIES} from './control/locator-contract.js';

const pages = new WeakMap(), elements = new WeakMap(), keyPages = new WeakMap();
const secret = Symbol('bound-page');
export const Environment = Object.freeze({CHROME: 'CHROME', CAPACITOR: 'CAPACITOR', UNKNOWN: 'UNKNOWN'});
function state(page) { const binding = pages.get(page); requireValue(binding, 'E_PAGE_CONTEXT_REQUIRED'); return binding; }
function dispatch(page, method, args, extra) { return state(page).request(method, args, extra); }
function navigationOptions(value = {}) {
  options(value, ['timeout', 'waitUntil']);
  const timeout = value.timeout === undefined ? 30000 : duration(value.timeout);
  const waitUntil = value.waitUntil === undefined ? 'complete' : value.waitUntil;
  requireValue(['complete', 'load', 'domcontentloaded'].includes(waitUntil), 'E_OPTION_UNSUPPORTED');
  return {timeout, waitUntil};
}
function clickOptions(value = {}) {
  options(value, ['button', 'clickCount', 'delay']);
  const {button = 'left', clickCount = 1, delay = 0} = value;
  requireValue(['left', 'right', 'middle'].includes(button) && Number.isInteger(clickCount) && clickCount >= 1 && clickCount <= 100, 'E_ARGUMENT_TYPE');
  return {button, clickCount, delay: duration(delay)};
}
function typeArgs(text, value = {}) {
  options(value, ['delay']);
  requireValue(text === null || ['undefined', 'string', 'boolean', 'number'].includes(typeof text), 'E_ARGUMENT_TYPE');
  requireValue(typeof text !== 'number' || Number.isFinite(text), 'E_ARGUMENT_TYPE');
  return [String(text), {delay: duration(value.delay === undefined ? 0 : value.delay)}];
}
function key(value) { requireValue(typeof value === 'string' && value.length > 0, 'E_ARGUMENT_TYPE'); requireValue(value.length === 1 || !value.includes('+'), 'E_KEY_UNSUPPORTED'); return value; }
function tagOptions(value, script) {
  options(value, script ? ['url', 'content', 'type', 'onload'] : ['url', 'content']);
  if (!script) requireValue(value.url === undefined || value.content === undefined, 'E_OPTION_UNSUPPORTED');
  requireValue((typeof value.url === 'string' && value.url.length > 0) !== (typeof value.content === 'string' && value.content.length > 0), 'E_ARGUMENT_TYPE');
  if (script) {
    requireValue(value.onload === undefined, 'E_OPTION_UNSUPPORTED');
    requireValue(value.type === undefined || value.type === 'text/javascript', 'E_OPTION_UNSUPPORTED');
  }
  if (value.url !== undefined) {
    requireValue(typeof value.url === 'string' && value.url.startsWith('chrome-extension://'), script ? 'E_REMOTE_CODE_UNSUPPORTED' : 'E_REMOTE_RESOURCE_UNSUPPORTED');
    return {url: value.url, ...(script && value.type ? {type: value.type} : {})};
  }
  requireValue(typeof value.content === 'string' && value.content.length > 0, 'E_ARGUMENT_TYPE');
  if (!script) requireValue(!/@import\b|url\s*\(/i.test(value.content), 'E_REMOTE_RESOURCE_UNSUPPORTED');
  return {content: value.content};
}
function snapshotNode(page, snapshot) {
  if (snapshot === null) return null;
  const dom = state(page).dom;
  requireValue(dom?.implementation, 'E_DOM_SNAPSHOT_CONTEXT');
  // Inert parsing in a detached document: no script execution or active DOM attachment.
  const doc = dom.implementation.createHTMLDocument('');
  const container = doc.createElement('template'); container.innerHTML = snapshot.outerHTML;
  return container.content.firstElementChild;
}
export function createBoundPage(binding, opts) { return new ChromePage(opts, {secret, binding}); }
export class ChromePage {
  constructor(opts, token) {
    requireValue(token?.secret === secret, 'E_PAGE_CONTEXT_REQUIRED');
    opts = opts === undefined || opts === null ? {debug: true} : options(opts, ['debug']);
    requireValue(opts.debug === undefined || typeof opts.debug === 'boolean', 'E_ARGUMENT_TYPE');
    pages.set(this, token.binding);
    Object.defineProperties(this, {environment: {value: token.binding.environment, enumerable: true}, keyboard: {value: new Keyboard(this), enumerable: true}});
    this.debug = opts.debug;
  }
  handleMessage() { throw new PageError('E_CALLBACK_UNAUTHORIZED'); }
  operationCompleted() { throw new PageError('E_CALLBACK_UNAUTHORIZED'); }
  title() { return dispatch(this, 'title', []); }
  // Legacy full-body read remains unchanged; large values cannot cross the 64 KiB Control wire.
  content(opts) {
    if (opts === undefined) return dispatch(this, 'content', []);
    options(opts, ['maxChars']);
    requireValue(Number.isSafeInteger(opts.maxChars) && opts.maxChars >= 2 && opts.maxChars <= 8192,
      'E_ARGUMENT_TYPE', 'maxChars must be an integer between 2 and 8192');
    return dispatch(this, 'content', [{maxChars: opts.maxChars}]);
  }
  // Snapshot-backed streaming: each piece travels through the original authorized
  // Controller operation and remains subject to the ordinary per-message budget.
  async *contentChunks(opts = {}) {
    options(opts, ['chunkChars']);
    const chunkChars = opts.chunkChars === undefined ? 8192 : opts.chunkChars;
    requireValue(Number.isSafeInteger(chunkChars) && chunkChars >= 2 && chunkChars <= 8192,
      'E_ARGUMENT_TYPE', 'chunkChars must be an integer between 2 and 8192');
    const opened = await dispatch(this, 'contentOpen', [chunkChars]);
    try {
      let part = opened;
      for (;;) {
        yield part.html;
        if (part.done) break;
        part = await dispatch(this, 'contentRead', [opened.snapshotId, part.nextOffset, chunkChars]);
      }
    } finally {
      // Close on success, early break, exception and cancellation. The document
      // session additionally clears snapshots on abort/navigation/expiry.
      try { await dispatch(this, 'contentClose', [opened.snapshotId]); }
      catch { /* A fenced or destroyed session has already revoked the snapshot. */ }
    }
  }
  url() { return dispatch(this, 'url', []); }
  locator(css) { return createLocator(state(this), 'css', css); }
  getByTestId(id) { return createLocator(state(this), 'testId', id); }
  observe(opts = {}) { return dispatch(this, 'locatorObserve', [validateObservationOptions(opts)]); }
  get modernCapabilities() { return MODERN_PAGE_CAPABILITIES; }
  async reload(opts = {}) { await dispatch(this, 'reload', [navigationOptions(opts)], {kind: 'browser', navigation: true}); }
  async goto(url, opts = {}) { await dispatch(this, 'goto', [httpURL(url), navigationOptions(opts)], {kind: 'browser', navigation: true}); }
  async $(css) { requireValue(state(this).dom?.implementation, 'E_DOM_SNAPSHOT_CONTEXT'); return snapshotNode(this, await this.snapshot(css)); }
  async $$(css) { requireValue(state(this).dom?.implementation, 'E_DOM_SNAPSHOT_CONTEXT'); return (await this.snapshots(css)).map(v => snapshotNode(this, v)); }
  snapshot(css) { return dispatch(this, 'snapshot', [selector(css)]); }
  snapshots(css) { return dispatch(this, 'snapshots', [selector(css)]); }
  $eval(css, fn, ...args) { return dispatch(this, '$eval', [selector(css), functionSource(fn), args], {kind: 'user-script'}); }
  $$eval(css, fn, ...args) { return dispatch(this, '$$eval', [selector(css), functionSource(fn), args], {kind: 'user-script'}); }
  async addScriptTag(opts) {
    const value = tagOptions(opts, true);
    if (value.content !== undefined) await dispatch(this, 'eval', [value.content, {mode: 'statement'}], {kind: 'user-script'});
    else await dispatch(this, 'addScriptTag', [value]);
  }
  async addStyleTag(opts) { await dispatch(this, 'addStyleTag', [tagOptions(opts, false)]); }
  cookies(...urls) { return dispatch(this, 'cookies', [urls.map(httpURL)], {kind: 'browser'}); }
  async setCookie(...values) { await dispatch(this, 'setCookie', values, {kind: 'browser'}); }
  async deleteCookie(...values) { await dispatch(this, 'deleteCookie', values, {kind: 'browser'}); }
  click(css, opts = {}) { return dispatch(this, 'click', [selector(css), clickOptions(opts)]); }
  type(css, text, opts = {}) { return dispatch(this, 'type', [selector(css), ...typeArgs(text, opts)]); }
  waitFor(value, opts = {}, ...args) {
    if (typeof value === 'string') return this.waitForSelector(value, opts);
    if (typeof value === 'function') return this.waitForFunction(value, opts, ...args);
    if (typeof value === 'number') return this.waitForTimeout(value);
    throw new PageError('E_ARGUMENT_TYPE');
  }
  waitForTimeout(ms) { return dispatch(this, 'waitForTimeout', [duration(ms)]); }
  async waitForSelector(css, opts = {}) {
    options(opts, ['visible', 'hidden', 'timeout']);
    const {visible = false, hidden = false, timeout = 30000} = opts;
    requireValue(typeof visible === 'boolean' && typeof hidden === 'boolean' && !(visible && hidden), 'E_ARGUMENT_TYPE');
    const binding = state(this), target = binding.capture();
    await binding.request('waitForSelector', [selector(css), {visible, hidden, timeout: duration(timeout)}], {target});
    binding.guard(target); return createElement(this, css, target);
  }
  waitForFunction(fn, opts = {}, ...args) {
    options(opts, ['polling', 'timeout']); const {polling = 'raf', timeout = 30000} = opts;
    requireValue(polling === 'raf' || (typeof polling === 'number' && Number.isFinite(polling) && polling > 0), 'E_ARGUMENT_TYPE');
    return dispatch(this, 'waitForFunction', [functionSource(fn), {polling, timeout: duration(timeout)}, args], {kind: 'user-script'});
  }
  screenshot(opts = {}) { return this.screenshotInChrome(opts); }
  screenshotInWebview() { return Promise.reject(new PageError('E_CAPABILITY_UNAVAILABLE')); }
  screenshotInChrome(opts = {}) {
    options(opts, ['format', 'fullPage']); const {format = 'png', fullPage = false} = opts;
    requireValue(['png', 'jpeg'].includes(format), 'E_OPTION_UNSUPPORTED');
    requireValue(typeof fullPage === 'boolean', 'E_ARGUMENT_TYPE'); requireValue(!fullPage, 'E_FULL_PAGE_UNSUPPORTED');
    return dispatch(this, 'screenshot', [{format, fullPage: false}], {kind: 'browser'});
  }
  async uploadFile(css, value) {
    selector(css);
    if (typeof value === 'string') {
      if (value.startsWith('data:')) await this._uploadFromDataUrl(css, value);
      else await this._uploadFromUrl(css, value);
    } else await this._uploadFromBlob(css, value);
  }
  async _uploadFromBlob(css, value) {
    const binding = state(this), target = binding.capture(); binding.guard(target); selector(css);
    requireValue(value instanceof ArrayBuffer || (typeof Blob !== 'undefined' && value instanceof Blob), 'E_ARGUMENT_TYPE');
    requireValue((value.byteLength ?? value.size) <= VALUE_LIMITS.uploadBytes, 'E_UPLOAD_TOO_LARGE');
    const bytes = value instanceof ArrayBuffer ? new Uint8Array(value.slice(0)) : new Uint8Array(await value.arrayBuffer());
    binding.guard(target);
    // Chunks stay under the approved JSON frame budget. The broker owns staging and cleanup.
    const uploadId = newPageRequestId();
    for (let offset = 0; offset < bytes.length; offset += VALUE_LIMITS.chunkBytes) {
      binding.guard(target);
      const chunk = bytes.subarray(offset, offset + VALUE_LIMITS.chunkBytes);
      let binary = ''; for (const byte of chunk) binary += String.fromCharCode(byte);
      await binding.request('uploadChunk', [uploadId, offset, bytes.length, btoa(binary)], {target});
    }
    binding.guard(target); await binding.request('uploadCommit', [selector(css), uploadId, bytes.length], {target}); return true;
  }
  async _uploadFromDataUrl(css, value) {
    requireValue(typeof value === 'string' && /^data:[^,]*;base64,[A-Za-z0-9+/]*={0,2}$/.test(value), 'E_UPLOAD_FORMAT');
    const encoded = value.slice(value.indexOf(',') + 1); requireValue(encoded.length % 4 === 0, 'E_UPLOAD_FORMAT');
    requireValue(encoded.length <= Math.ceil(VALUE_LIMITS.uploadBytes / 3) * 4, 'E_UPLOAD_TOO_LARGE');
    let binary; try { binary = atob(encoded); } catch { throw new PageError('E_UPLOAD_FORMAT'); }
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    await this._uploadFromBlob(css, bytes.buffer);
  }
  async _uploadFromUrl(css, url) { await dispatch(this, 'uploadFromUrl', [selector(css), httpURL(url)], {kind: 'browser'}); return true; }
  eval(code, opts = {}) {
    requireValue(typeof code === 'string' && code.length > 0, 'E_ARGUMENT_TYPE');
    options(opts, ['mode', 'debug']);
    requireValue(opts.mode !== undefined, 'E_LEGACY_AMBIGUOUS_EXECUTION');
    requireValue(['expression', 'statement'].includes(opts.mode), 'E_OPTION_UNSUPPORTED');
    requireValue(opts.debug === undefined || typeof opts.debug === 'boolean', 'E_ARGUMENT_TYPE');
    return dispatch(this, 'eval', [code, {mode: opts.mode}], {kind: 'user-script'});
  }
  evaluate(fnOrString, ...args) {
    if (typeof fnOrString === 'string') return dispatch(this, 'evaluate', [{mode: 'legacy-statement', source: fnOrString}, []], {kind: 'user-script'});
    return dispatch(this, 'evaluate', [{mode: 'function', source: functionSource(fnOrString)}, args], {kind: 'user-script'});
  }
  evaluateExpression(expression, ...extra) {
    requireValue(extra.length === 0 && typeof expression === 'string' && expression.trim().length > 0, 'E_ARGUMENT_TYPE');
    return dispatch(this, 'evaluateExpression', [expression], {kind: 'user-script'});
  }
  _execute() { throw new PageError('E_INTERNAL_API_ONLY'); }
}
function createElement(page, css, target) { return new ChromeElement(page, css, target); }
export class ChromeElement {
  constructor(page, css, captured) {
    const binding = state(page); selector(css); const target = captured || binding.capture(); binding.guard(target);
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
export class Keyboard {
  constructor(page) { state(page); keyPages.set(this, page); Object.defineProperty(this, 'page', {value: page, enumerable: true}); }
  async type(text) { requireValue(typeof text === 'string', 'E_ARGUMENT_TYPE'); const target = state(this.page).capture(); for (const char of text) await state(this.page).request('keyboard', ['press', key(char)], {target}); }
  press(value) { return dispatch(keyPages.get(this), 'keyboard', ['press', key(value)]); }
  down(value) { return dispatch(keyPages.get(this), 'keyboard', ['down', key(value)]); }
  up(value) { return dispatch(keyPages.get(this), 'keyboard', ['up', key(value)]); }
}
// Share a single implementation across semantic selectors to respect the fixed MV3 SW budget.
for (const [method, kind] of [['getByRole','role'],['getByLabel','label'],['getByText','text'],
  ['getByPlaceholder','placeholder'],['getByTitle','title'],['getByAltText','alt']]) {
  Object.defineProperty(ChromePage.prototype, method, {
    value: function(value, opts = {}) { return createLocator(state(this), kind, value, opts); }
  });
}
export default ChromePage;
