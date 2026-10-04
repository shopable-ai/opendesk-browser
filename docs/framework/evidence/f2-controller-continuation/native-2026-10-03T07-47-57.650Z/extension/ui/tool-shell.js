/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ "./src/environment.js":
/*!****************************!*\
  !*** ./src/environment.js ***!
  \****************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   CONTRACT_HASH: () => (/* binding */ CONTRACT_HASH),
/* harmony export */   CONTRACT_VERSION: () => (/* binding */ CONTRACT_VERSION),
/* harmony export */   EnvironmentError: () => (/* binding */ EnvironmentError),
/* harmony export */   HEALTH_FILE: () => (/* binding */ HEALTH_FILE),
/* harmony export */   PROTOCOL: () => (/* binding */ PROTOCOL),
/* harmony export */   SELECTION_FILE: () => (/* binding */ SELECTION_FILE),
/* harmony export */   createHealthProbe: () => (/* binding */ createHealthProbe),
/* harmony export */   createWindowShell: () => (/* binding */ createWindowShell),
/* harmony export */   httpUrl: () => (/* binding */ httpUrl),
/* harmony export */   isToolSender: () => (/* binding */ isToolSender),
/* harmony export */   permissionPattern: () => (/* binding */ permissionPattern),
/* harmony export */   validTarget: () => (/* binding */ validTarget)
/* harmony export */ });
const PROTOCOL = 'opendesk.environment.v1';
const HEALTH_FILE = 'agents/health.js';
const SELECTION_FILE = 'agents/selection-entry.js';
const CONTRACT_VERSION = '1.0.0';
const CONTRACT_HASH = '1486ff9c442807c0d447e542252830731faeede5f81cd685c5f146daecdba2a1';

class EnvironmentError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
function httpUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new EnvironmentError('E_TARGET', '目标地址无效'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new EnvironmentError('E_TARGET', '仅支持无账户信息的 HTTP(S) 顶层页面');
  }
  return url;
}
function permissionPattern(value) { const url = httpUrl(value); return `${url.protocol}//${url.hostname}/*`; }
function isToolSender(api, sender) {
  return sender?.id === api.runtime.id && sender.url === api.runtime.getURL('ui/tool.html') &&
    typeof sender.documentId === 'string' && sender.documentId.length > 0 &&
    sender.frameId === 0 && (!sender.documentLifecycle || sender.documentLifecycle === 'active') && !sender.tab?.incognito;
}
function validTarget(target) {
  if (!target || !Number.isInteger(target.tabId) || target.tabId < 0 || target.frameId !== 0 ||
      typeof target.documentId !== 'string' || !target.documentId ||
      typeof target.agentInstanceId !== 'string' || !target.agentInstanceId ||
      httpUrl(target.origin).origin !== target.origin) {
    throw new EnvironmentError('E_TARGET', '缺少精确目标文档绑定');
  }
  return target;
}

function createWindowShell(api) {
  let opening;
  const url = api.runtime.getURL('ui/tool.html');
  async function discoverOrCreate() {
    const windows = await api.windows.getAll({populate: true, windowTypes: ['popup']});
    const existing = windows.find(win => !win.incognito && win.tabs?.some(tab => tab.url === url));
    if (existing) {
      try { await api.windows.update(existing.id, {focused: true}); return {windowId: existing.id, reused: true}; }
      catch { throw new EnvironmentError('E_TARGET', '现有工具窗口无法聚焦，请重试'); }
    }
    const created = await api.windows.create({url, type: 'popup', width: 1020, height: 740, focused: true});
    return {windowId: created.id, reused: false};
  }
  return {
    open() {
      if (!opening) opening = discoverOrCreate().finally(() => { opening = undefined; });
      return opening;
    }
  };
}

function createHealthProbe(api, {timeoutMs = 8000} = {}) {
  // Environment-only readiness evidence, not a production PagePort/owner registry.
  const agents = new Map();
  const waiting = new Map();
  const generations = new Map();
  const key = (tabId, documentId) => `${tabId}:${documentId}`;
  function rememberReady(message, sender) {
    if (sender?.id !== api.runtime.id || !Number.isInteger(sender.tab?.id) || sender.tab.incognito ||
        sender.frameId !== 0 || !sender.documentId || sender.documentLifecycle !== 'active' ||
        typeof message.agentInstanceId !== 'string' || message.agentInstanceId.length > 80) {
      throw new EnvironmentError('E_TARGET', '健康探针来源不可信');
    }
    const origin = httpUrl(sender.url).origin;
    const registrationKey = key(sender.tab.id, sender.documentId);
    const existing = agents.get(registrationKey);
    if (!existing || existing.agentInstanceId !== message.agentInstanceId || existing.origin !== origin) {
      agents.set(registrationKey, {tabId: sender.tab.id, frameId: 0,
        documentId: sender.documentId, agentInstanceId: message.agentInstanceId, origin});
    }
    // Bound diagnostic memory; no durable run, loop, DB or recovery capability.
    if (agents.size > 32) agents.delete(agents.keys().next().value);
    for (const waiter of [...(waiting.get(registrationKey) || [])]) waiter.finish();
    return {registered: true};
  }
  async function requireTab(tabId, origin, authorizationMode) {
    let tab;
    try { tab = await api.tabs.get(tabId); } catch { throw new EnvironmentError('E_TARGET', '目标标签页已关闭'); }
    if (authorizationMode === 'optional' && !await api.permissions.contains({origins:[permissionPattern(origin)]})) {
      throw new EnvironmentError('E_PERMISSION', '读取目标标签页期间站点权限已撤销');
    }
    if (tab.incognito || httpUrl(tab.url).origin !== origin || (tab.pendingUrl && httpUrl(tab.pendingUrl).origin !== origin)) {
      throw new EnvironmentError('E_TARGET', '目标已离开获准 origin');
    }
    return tab;
  }
  async function ping(target) {
    validTarget(target);
    const generation = generations.get(target.tabId) || 0;
    const registered = agents.get(key(target.tabId, target.documentId));
    if (!registered || !['optional', 'activeTab'].includes(registered.authorizationMode) || registered.agentInstanceId !== target.agentInstanceId || registered.origin !== target.origin) {
      throw new EnvironmentError('E_TARGET', '目标登记已失效，请重新绑定健康探针');
    }
    if (registered.authorizationMode === 'optional' &&
        !await api.permissions.contains({origins: [permissionPattern(target.origin)]})) {
      throw new EnvironmentError('E_PERMISSION', '站点权限已撤销');
    }
    await requireTab(target.tabId, target.origin, registered.authorizationMode);
    const requestId = crypto.randomUUID();
    const response = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new EnvironmentError('E_TARGET', '健康消息超时')), timeoutMs);
      api.tabs.sendMessage(target.tabId, {protocol: PROTOCOL, type: 'HEALTH', requestId,
        agentInstanceId: target.agentInstanceId}, {documentId: target.documentId, frameId: 0})
        .then(resolve, () => reject(new EnvironmentError('E_TARGET', '目标文档已重载或无法接收消息')))
        .finally(() => clearTimeout(timer));
    });
    if (response?.protocol !== PROTOCOL || response.requestId !== requestId ||
        response.agentInstanceId !== target.agentInstanceId || response.origin !== target.origin) {
      throw new EnvironmentError('E_TARGET', '健康回包与精确目标不匹配');
    }
    if (registered.authorizationMode === 'optional' &&
        !await api.permissions.contains({origins: [permissionPattern(target.origin)]})) {
      throw new EnvironmentError('E_PERMISSION', '等待健康回包期间站点权限已撤销');
    }
    await requireTab(target.tabId, target.origin, registered.authorizationMode);
    if (agents.get(key(target.tabId, target.documentId)) !== registered || (generations.get(target.tabId) || 0) !== generation) {
      throw new EnvironmentError('E_TARGET', '等待健康回包期间目标文档已失效');
    }
    return {target, readyState: response.readyState, scope: 'environment-health-only', selectionImplemented: false};
  }
  async function bind(tabId, origin, authorizationMode = 'activeTab') {
    if (!['optional', 'activeTab'].includes(authorizationMode)) throw new EnvironmentError('E_PERMISSION', '健康目标授权模式无效');
    if (authorizationMode === 'optional' && !await api.permissions.contains({origins: [permissionPattern(origin)]})) throw new EnvironmentError('E_PERMISSION', '站点权限已撤销');
    const generation = generations.get(tabId) || 0;
    await requireTab(tabId, origin, authorizationMode);
    let results;
    try { results = await api.scripting.executeScript({target: {tabId, frameIds: [0]}, files: [HEALTH_FILE], world: 'ISOLATED'}); }
    catch { throw new EnvironmentError('E_PERMISSION', '无法注入：目标受限、已导航或站点权限不可用'); }
    const frame = results.find(item => item.frameId === 0);
    if (results.length !== 1 || !frame?.documentId) throw new EnvironmentError('E_TARGET', '浏览器未返回精确文档');
    // Only metadata from Chrome is used. File-evaluation result is never a selection/health result.
    const registrationKey = key(tabId, frame.documentId);
    if (!agents.has(registrationKey)) {
      await new Promise((resolve, reject) => {
        const set = waiting.get(registrationKey) || new Set();
        const waiter = {finish(error) {
          clearTimeout(timer); set.delete(waiter);
          if (!set.size) waiting.delete(registrationKey);
          error ? reject(error) : resolve();
        }};
        const timer = setTimeout(() => waiter.finish(new EnvironmentError('E_TARGET', 'agent 握手超时')), timeoutMs);
        set.add(waiter); waiting.set(registrationKey, set);
      });
    }
    if ((generations.get(tabId) || 0) !== generation) throw new EnvironmentError('E_TARGET', '注入握手期间目标文档已失效');
    const registered = agents.get(registrationKey);
    if (!registered || registered.origin !== origin) throw new EnvironmentError('E_TARGET', '未收到真实 sender 的 agent 握手');
    if (registered.authorizationMode !== 'optional') registered.authorizationMode = authorizationMode;
    return ping(registered);
  }
  function waitForPage(tabId) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error) => {
        if (settled) return; settled = true;
        clearTimeout(timer); api.tabs.onUpdated.removeListener(updated); api.tabs.onRemoved.removeListener(removed);
        error ? reject(error) : resolve();
      };
      const updated = (id, change) => { if (id === tabId && change.status === 'complete') finish(); };
      const removed = id => { if (id === tabId) finish(new EnvironmentError('E_TARGET', '目标在加载时已关闭')); };
      const timer = setTimeout(() => finish(new EnvironmentError('E_TARGET', '目标加载超时')), timeoutMs);
      api.tabs.onUpdated.addListener(updated); api.tabs.onRemoved.addListener(removed);
      api.tabs.get(tabId).then(tab => { if (tab.status === 'complete') finish(); }, () => removed(tabId));
    });
  }
  async function createTarget(value) {
    const url = httpUrl(value);
    if (!await api.permissions.contains({origins: [permissionPattern(url.href)]})) {
      throw new EnvironmentError('E_PERMISSION', '请先在用户点击中授予该站点权限');
    }
    const tab = await api.tabs.create({url: url.href, active: false});
    try { await waitForPage(tab.id); return await bind(tab.id, url.origin, 'optional'); }
    catch (error) { await api.tabs.remove(tab.id).catch(() => {}); throw error; }
  }
  function forgetTab(tabId) {
    generations.set(tabId, (generations.get(tabId) || 0) + 1);
    for (const [k, target] of agents) if (target.tabId === tabId) agents.delete(k);
    for (const [k, set] of waiting) if (k.startsWith(`${tabId}:`)) {
      for (const waiter of [...set]) waiter.finish(new EnvironmentError('E_TARGET', '等待握手期间目标失效'));
    }
  }
  return {rememberReady, bind, ping, createTarget, forgetTab};
}


/***/ }),

/***/ "./src/features/scraping/index.js":
/*!****************************************!*\
  !*** ./src/features/scraping/index.js ***!
  \****************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   createScrapingModule: () => (/* binding */ createScrapingModule)
/* harmony export */ });
function createScrapingModule({contracts}) {
  const unavailable = () => { const error = new Error('采集模块尚未接入'); error.code = 'MODULE_NOT_INSTALLED'; throw error; };
  return {
    mountToolPanel(root) {
      root.textContent = '采集模块尚未接入。当前仅提供基础工程和目标健康检查。';
      root.dataset.moduleStatus = 'MODULE_NOT_INSTALLED';
    },
    compileTemplate: unavailable, preview: unavailable, createRunner: unavailable, formatExport: unavailable,
    contractHandshake() { return {contractVersion: contracts.contractVersion, contractHash: contracts.contractHash,
      status: 'MODULE_NOT_INSTALLED', capabilities: []}; },
    dispose() {}
  };
}


/***/ }),

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

/***/ "./src/platform/host/client.js":
/*!*************************************!*\
  !*** ./src/platform/host/client.js ***!
  \*************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   createHostClient: () => (/* binding */ createHostClient)
/* harmony export */ });
/* harmony import */ var _protocol_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../protocol.js */ "./src/platform/protocol.js");


function createHostClient(api = chrome) {
  const hostInstanceId = (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.newId)();
  const sourceListeners = new Map(), commandListeners = new Map(), runListeners = new Set();
  const port = api.runtime.connect({name:_protocol_js__WEBPACK_IMPORTED_MODULE_0__.PROTOCOL});
  let registration, disposed = false;
  async function send(type, payload, registered = true) {
    if (disposed) throw new _protocol_js__WEBPACK_IMPORTED_MODULE_0__.FoundationError('E_OWNER', 'RunHost disposed');
    if (registered) await ready;
    const response = await api.runtime.sendMessage({protocol:_protocol_js__WEBPACK_IMPORTED_MODULE_0__.PROTOCOL, type, payload,
      ...(registration ? {registrationId:registration.registrationId} : {})});
    if (!response?.ok) throw new _protocol_js__WEBPACK_IMPORTED_MODULE_0__.FoundationError(response?.error?.code || 'E_EFFECT_UNKNOWN', response?.error?.message || 'Worker response missing');
    return response.data;
  }
  const ready = send('registerHost', {hostInstanceId, claimedContractVersion:_protocol_js__WEBPACK_IMPORTED_MODULE_0__.CONTRACT_VERSION, claimedContractHash:_protocol_js__WEBPACK_IMPORTED_MODULE_0__.CONTRACT_HASH}, false)
    .then(value => { registration=value; port.postMessage({type:'bind-host',registrationId:value.registrationId}); return value; });
  port.onMessage.addListener(message => {
    if (!registration || message.registrationId !== registration.registrationId) return;
    const event = message.event;
    if (event?.selectionId) for (const listener of sourceListeners.get(event.selectionId) || []) listener(event);
    if (event?.commandId) for (const listener of commandListeners.get(event.commandId) || []) listener(event);
    if (event?.runId) for (const listener of runListeners) listener(event);
  });
  const subscribe = (map,key,listener) => { const set=map.get(key)||new Set();set.add(listener);map.set(key,set);return()=>{set.delete(listener);if(!set.size)map.delete(key);}; };
  const pagePort = {};
  for (const method of ['openSourceContext','startSourceSelection','cancelSourceSelection','releaseSourceContext','previewSource',
    'prepareCommand','dispatchCommand','createTarget','reconcileTargetCreation','bindTarget','confirmCommand','ackPageFrame','ackSourceFrame']) {
    pagePort[method] = request => send(method, request);
  }
  pagePort.subscribeSourceSelection = ({selectionId}, listener) => subscribe(sourceListeners,selectionId,listener);
  pagePort.subscribeCommand = ({commandId}, listener) => subscribe(commandListeners,commandId,listener);
  const storage = {};
  for (const method of ['saveTemplate','listTemplates','getTemplateRevision','renameTemplate','beginPage','stagePageBatch','sealPage',
    'readRecords','openReaderPin','releaseReaderPin','deleteRun','exportTemplateBackup','importTemplateBackup']) {
    storage[method] = request => send(method, request);
  }
  const exportBridge = {};
  for (const method of ['prepareExport','dispatchDownload','reconcileDownload','retryExport','prepareArtifact','prepareAttempt','abandonExport']) {
    exportBridge[method] = request => send(method,request);
  }
  // These methods share this document's one registration and transport. A UI
  // injects this client into RunHost instead of registering a second owner.
  const controller = Object.fromEntries(['commitControllerScript','getControllerScript','startControllerRun',
    'controllerOperation','stopControllerRun','finishControllerRun','snapshotControllerRun','retireControllerTarget']
    .map(method => [method, request => send(method, request)]));
  return {ready, request:send, pagePort, storage, exportBridge,
    controller,
    entitlement:{getSnapshot:()=>send('getEntitlementSnapshot',{}), install:request=>send('installEntitlement',request)},
    runCommands:Object.fromEntries(['claimRun','stopRun','abandonUnknown','retireTarget','snapshotRun','finishRun'].map(method=>[method,request=>send(method,request)])),
    subscribeRun:listener=>{runListeners.add(listener);return()=>runListeners.delete(listener);},
    get registration(){return registration;}, get hostInstanceId(){return hostInstanceId;},
    dispose(){disposed=true;sourceListeners.clear();commandListeners.clear();runListeners.clear();port.disconnect();}};
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


/***/ }),

/***/ "./src/run-host.js":
/*!*************************!*\
  !*** ./src/run-host.js ***!
  \*************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   createEnvironmentHost: () => (/* binding */ createEnvironmentHost),
/* harmony export */   createRunHost: () => (/* binding */ createRunHost)
/* harmony export */ });
/* harmony import */ var _features_scraping_index_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./features/scraping/index.js */ "./src/features/scraping/index.js");
/* harmony import */ var _environment_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./environment.js */ "./src/environment.js");
/* harmony import */ var _platform_host_client_js__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./platform/host/client.js */ "./src/platform/host/client.js");
/* harmony import */ var _platform_protocol_js__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./platform/protocol.js */ "./src/platform/protocol.js");
/* harmony import */ var _framework_context_js__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ./framework/context.js */ "./src/framework/context.js");
/* harmony import */ var _scripting_sandbox_controller_js__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! ./scripting/sandbox/controller.js */ "./src/scripting/sandbox/controller.js");
/* harmony import */ var _platform_page_port_codec_js__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! ./platform/page-port/codec.js */ "./src/platform/page-port/codec.js");
/* harmony import */ var _framework_control_value_js__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! ./framework/control/value.js */ "./src/framework/control/value.js");









// Engineering entry only.02B supplies controller/services;03 supplies the domain module.
function createEnvironmentHost() {
  const module = (0,_features_scraping_index_js__WEBPACK_IMPORTED_MODULE_0__.createScrapingModule)({contracts: {contractVersion: _environment_js__WEBPACK_IMPORTED_MODULE_1__.CONTRACT_VERSION, contractHash: _environment_js__WEBPACK_IMPORTED_MODULE_1__.CONTRACT_HASH},
    storage: null, pagePort: null, runCommands: null, exportBridge: null, entitlement: null, clock: {now: () => Date.now()}});
  return {module, handshake: module.contractHandshake(), productionRunHostImplemented: false, dispose: () => module.dispose()};
}

// The visible extension document owns the long-lived core loop. The worker only
// commits short control operations and performs individually journalled effects.
function createRunHost({api = globalThis.chrome, client: suppliedClient, clock = {now:()=>Date.now()},
  document: doc = globalThis.document, controllerFactory = _scripting_sandbox_controller_js__WEBPACK_IMPORTED_MODULE_5__.createControlController} = {}) {
  const client = suppliedClient || (0,_platform_host_client_js__WEBPACK_IMPORTED_MODULE_2__.createHostClient)(api);
  const ownsClient = !suppliedClient;
  const contracts = {contractVersion:_environment_js__WEBPACK_IMPORTED_MODULE_1__.CONTRACT_VERSION, contractHash:_environment_js__WEBPACK_IMPORTED_MODULE_1__.CONTRACT_HASH, compilerVersion:'1.0.0', budgets:_platform_protocol_js__WEBPACK_IMPORTED_MODULE_3__.BUDGETS,
    capabilities:['dom.top.v1','read.text.v1','read.attribute.v1','transform.safe.v1','pagination.none.v1',
      'pagination.next-link.v1','pagination.next-button.v1','page.stage-seal.v1','download.receipt.v1']};
  let active, disposed = false, lastCompletion = Promise.resolve(null);
  const observers = new Set(), admissions = new Set();
  const notify = value => { for (const observer of observers) { try { observer(value); } catch {} } };
  const runCommands = {...client.runCommands, start, stop};
  const services = {contracts, storage:client.storage, pagePort:client.pagePort, runCommands,
    exportBridge:client.exportBridge, entitlement:client.entitlement, clock};
  // The scraping module remains available only to the legacy template branch.
  // Ordinary JS admission/execution never compiles or admits a TemplateRevision.
  let scraping;
  const getModule = () => scraping ||= (0,_features_scraping_index_js__WEBPACK_IMPORTED_MODULE_0__.createScrapingModule)(services);
  const controls = client.controller || Object.fromEntries(['commitControllerScript','getControllerScript','startControllerRun',
    'controllerOperation','stopControllerRun','finishControllerRun','snapshotControllerRun','retireControllerTarget']
    .map(method => [method, request => client.request(method, request)]));
  async function start(request) {
    if (request?.scriptId !== undefined) return startController(request);
    return startScraping(request);
  }
  async function startController({scriptId, revision, contentHash, params, target, deadlineAt = clock.now() + 30000, requestId = crypto.randomUUID()}) {
    if (disposed || active) throw new _platform_protocol_js__WEBPACK_IMPORTED_MODULE_3__.FoundationError('E_OWNER', 'RunHost already owns a task or is disposed');
    // Reserve locally before the first await; the durable @slot remains the
    // cross-host authority. Serialization failure creates no admission.
    const paramsWire = (0,_platform_page_port_codec_js__WEBPACK_IMPORTED_MODULE_6__.encodeValue)(params), local = {controllerRun: true, state: 'preparing', controller: new AbortController()};
    let admitted, admissionDone;
    const admission = new Promise(resolve => { admissionDone = resolve; }); admissions.add(admission);
    active = local;
    try {
      await client.ready;
      if (disposed) throw new _platform_protocol_js__WEBPACK_IMPORTED_MODULE_3__.FoundationError('E_HOST_CLOSED', 'RunHost disposed during admission');
      const claim = await controls.startControllerRun({scriptId, revision, contentHash, paramsWire, target, deadlineAt, requestId});
      local.runId = claim.runId;
      if (claim.duplicate) throw new _platform_protocol_js__WEBPACK_IMPORTED_MODULE_3__.FoundationError('E_EFFECT_UNKNOWN', 'Existing run is observable; its script is never replayed');
      admitted = claim;
      if (disposed || local.controller.signal.aborted) {
        await controls.stopControllerRun({runId: claim.runId, requestId: crypto.randomUUID(), reason: 'E_HOST_CLOSED'});
        throw new _platform_protocol_js__WEBPACK_IMPORTED_MODULE_3__.FoundationError('E_HOST_CLOSED', 'RunHost closed during admission');
      }
      const context = (0,_framework_context_js__WEBPACK_IMPORTED_MODULE_4__.createRunContext)({identity: claim.identity, revision: claim.revision, target: claim.target,
        transport: {request: envelope => controls.controllerOperation({envelope})}, signal: local.controller.signal,
        deadline: performance.now() + Math.max(0, claim.deadlineAt - clock.now()), dom: doc});
      local.context = context;
      const controller = controllerFactory({context, document: doc,
        sandboxURL: api.runtime.getURL('scripting/sandbox/sandbox.html'),
        workerURL: api.runtime.getURL('scripting/sandbox/worker-runtime.js')});
      local.control = controller;
      local.state = 'running'; notify(claim);
      local.completion = lastCompletion = completeController(local, claim, controller);
      return claim;
    } catch (error) {
      if (admitted && !local.control) {
        local.context?.dispose();
        const settled = await controls.finishControllerRun({runId: admitted.runId, requestId: crypto.randomUUID(),
          status: disposed ? 'host-closed' : 'error', error: {code: error.code || 'E_CONTROL_EXECUTION', message: error.message}, workerRetired: true});
        const retirement = await controls.retireControllerTarget({runId: admitted.runId});
        lastCompletion = Promise.resolve({runId: admitted.runId, state: settled.run.state, result: settled.result, retirement});
      }
      if (active === local) active = undefined; throw error;
    } finally { admissions.delete(admission); admissionDone(); }
  }
  async function completeController(local, claim, controller) {
    try {
      // execute's source and params come only from the durable admission reply.
      // Saving another head cannot modify this in-flight committed revision.
      let terminal;
      try { terminal = await controller.execute(claim.sourceUtf8, (0,_platform_page_port_codec_js__WEBPACK_IMPORTED_MODULE_6__.decodeValue)(claim.paramsWire)); }
      catch (error) {
        controller.stop();
        terminal = await controller.result;
        if (!terminal) terminal = {status: 'error', error: {code: error.code || 'E_CONTROL_EXECUTION', message: error.message}};
      }
      const cleanup = await controller.retired;
      const settled = await controls.finishControllerRun({runId: claim.runId, requestId: crypto.randomUUID(), status: terminal.status,
        ...(terminal.status === 'succeeded' ? {valueWire: (0,_platform_page_port_codec_js__WEBPACK_IMPORTED_MODULE_6__.encodeValue)((0,_framework_control_value_js__WEBPACK_IMPORTED_MODULE_7__.decodeValue)(terminal.value))} : {error: terminal.error ||
          {code: terminal.status === 'timeout' ? 'E_TIMEOUT' : terminal.status === 'host-closed' ? 'E_HOST_CLOSED' : 'E_CANCELLED', message: terminal.status}}),
        workerRetired: cleanup?.acknowledged === true || cleanup?.workerNeverCreated === true});
      const retirement = await controls.retireControllerTarget({runId: claim.runId});
      const outcome = {runId: claim.runId, state: settled.run.state, result: settled.result, retirement};
      notify(outcome); return outcome;
    } catch (error) {
      const outcome = {runId: claim.runId, state: 'paused_unknown', error: {code: error.code || 'E_EFFECT_UNKNOWN', message: error.message}};
      notify(outcome); return outcome;
    } finally { local.context?.dispose(); if (active === local) active = undefined; }
  }
  async function startScraping({template, originGrantEvidence, createTargetRequest}) {
    if (disposed || active) throw new _platform_protocol_js__WEBPACK_IMPORTED_MODULE_3__.FoundationError('E_OWNER','RunHost already owns a task or is disposed');
    await client.ready;
    // The exact same domain compiler used by preview is called before claiming.
    const module = getModule();
    const plan = await module.compileTemplate({template,capabilities:contracts.capabilities,compilerVersion:contracts.compilerVersion});
    const runner = module.createRunner({plan,template,...services});
    const claim = await client.runCommands.claimRun({registrationId:client.registration.registrationId,
      templateHash:template.contentHash, originGrantEvidence});
    const controller = new AbortController();
    active = {runId:claim.runId, controller, state:'preparing'};
    notify({...claim});
    const execution = async () => {
      try {
        const creation = await client.pagePort.createTarget({...createTargetRequest, runId:claim.runId,
          expectedRunRevision:claim.runRevision,registrationId:client.registration.registrationId,requestId:crypto.randomUUID()});
        const binding = await client.pagePort.bindTarget({runId:claim.runId,creationId:creation.creationId,registrationId:client.registration.registrationId});
        const identity = binding.identity;
        const outcome = await runner.run({identity,signal:controller.signal});
        const view = await client.runCommands.snapshotRun({runId:claim.runId});
        const retirement = await client.runCommands.finishRun({runId:claim.runId,expectedRunRevision:view.run.runRevision,
          state:controller.signal.aborted?'stopped':outcome.state, naturalEnd:outcome.naturalEnd === true, reason:outcome.reason ?? null});
        const retired = await client.runCommands.retireTarget({retirementId:retirement.retirementId});
        notify({runId:claim.runId,state:outcome.state,retirement:retired});
      } catch (error) {
        // Unknown effects/targets hold their slot; never silently start over.
        notify({runId:claim.runId,state:'paused_unknown',error:{code:error.code||'E_EFFECT_UNKNOWN',message:error.message}});
      } finally { active = undefined; }
    };
    active.completion = execution();
    return claim;
  }
  async function stop(request) {
    if (active?.controllerRun || request?.controller === true) {
      const {controller: ignored, ...payload} = request || {};
      const response = await controls.stopControllerRun({...payload, requestId: payload.requestId || crypto.randomUUID()});
      if (active?.runId === payload.runId) active.controller.abort(new _platform_protocol_js__WEBPACK_IMPORTED_MODULE_3__.FoundationError(payload.reason === 'E_TIMEOUT' ? 'E_TIMEOUT' : 'E_CANCELLED', 'Stopped'));
      notify(response); return response;
    }
    const response = await client.runCommands.stopRun(request);
    // Abort local waits only after the durable cancel fence won its transaction.
    if (active?.runId === request.runId) active.controller.abort(new _platform_protocol_js__WEBPACK_IMPORTED_MODULE_3__.FoundationError('E_CANCELLED','Stopped'));
    notify({runId:request.runId,...response}); return response;
  }
  const pagehide = () => dispose();
  doc?.defaultView?.addEventListener('pagehide', pagehide, {once: true});
  function dispose() {
    if (disposed) return; disposed = true;
    if (active?.controllerRun && active.runId) {
      const local = active;
      // Closing the actual host destroys its realm. Commit its cancel fence
      // while the document still exists; SW hostGone performs fallback recovery.
      controls.stopControllerRun({runId: local.runId, requestId: crypto.randomUUID(), reason: 'E_HOST_CLOSED'})
        .then(() => { local.controller.abort(new _platform_protocol_js__WEBPACK_IMPORTED_MODULE_3__.FoundationError('E_HOST_CLOSED', 'RunHost closed')); local.control?.close(); })
        .catch(() => { local.context?.dispose('E_HOST_CLOSED'); local.control?.close(); });
    } else active?.controller.abort(new _platform_protocol_js__WEBPACK_IMPORTED_MODULE_3__.FoundationError('E_HOST_CLOSED', 'RunHost closed'));
    scraping?.dispose(); doc?.defaultView?.removeEventListener('pagehide', pagehide);
    if (ownsClient) Promise.all([...admissions]).then(() => lastCompletion).finally(() => client.dispose()).catch(() => client.dispose());
    observers.clear();
  }
  return {...services, get module() { return getModule(); }, ready:client.ready,
    handshake:{contractVersion:_environment_js__WEBPACK_IMPORTED_MODULE_1__.CONTRACT_VERSION,contractHash:_environment_js__WEBPACK_IMPORTED_MODULE_1__.CONTRACT_HASH}, productionRunHostImplemented:true,
    controller: controls, get completion() { return lastCompletion; }, get currentRun() { return active?.runId || null; },
    start, stop, subscribe:listener=>{observers.add(listener);return()=>observers.delete(listener);},
    dispose};
}


/***/ }),

/***/ "./src/scripting/sandbox/controller.js":
/*!*********************************************!*\
  !*** ./src/scripting/sandbox/controller.js ***!
  \*********************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   createControlController: () => (/* binding */ createControlController)
/* harmony export */ });
/* harmony import */ var _framework_control_value_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../framework/control/value.js */ "./src/framework/control/value.js");
/* harmony import */ var _framework_context_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../framework/context.js */ "./src/framework/context.js");



// One controller owns exactly one opaque iframe/Worker, attached to one ctx.
// The sole broker remains the transport; this module has no chrome permissions,
// tabs, scripting or storage API and cannot select or retire borrowed pages.
function createControlController({context, sandboxURL, workerURL, document: doc = document, observeResources = false, onEvent = () => {}}) {
  (0,_framework_control_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(context?.identity, 'E_PAGE_CONTEXT_REQUIRED');
  const root = new URL(doc.location.href);
  for (const value of [sandboxURL, workerURL]) {
    const url = new URL(value); (0,_framework_control_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(url.protocol === 'chrome-extension:' && url.host === root.host, 'E_RESOURCE_URL_UNSUPPORTED');
  }
  const identity = context.identity, revision = context.revision;
  const frame = doc.createElement('iframe'); frame.setAttribute('sandbox', 'allow-scripts'); frame.src = sandboxURL; frame.hidden = true;
  const win = doc.defaultView;
  const pending = new Set(); let port, send, active = true, executing = false, lastId = 0, settled = false, readyTimer, retiredTimer, retireResolve;
  const retired = new Promise(resolve => { retireResolve = resolve; });
  let readyResolve, readyReject, terminalResolve;
  const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
  const result = new Promise(resolve => { terminalResolve = resolve; });
  const workerSource = fetch(workerURL, {credentials: 'omit'}).then(response => { (0,_framework_control_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(response.ok, 'E_RESOURCE_LOAD'); return response.text(); });
  workerSource.catch(error => finish('error', {error: {code: error.code || 'E_RESOURCE_LOAD', message: error.message}}));
  function guard() { (0,_framework_control_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(active && !context.signal.aborted, context.signal.reason?.code || 'E_CANCELLED'); }
  function observe(event) { try { onEvent((0,_framework_control_value_js__WEBPACK_IMPORTED_MODULE_0__.frozenCopy)(event)); } catch {} }
  function removeFrame(reason) {
    // Remove only the controller's owned opaque realm, never an execution tab.
    frame.remove(); port?.close(); clearTimeout(retiredTimer); retiredTimer = null;
    observe({kind: 'realm-retired', runId: identity.runId, reason, observedAt: Date.now(), observedMonoMs: performance.now()});
  }
  function finish(status, payload = {}) {
    if (settled) return; settled = true; active = false;
    const triggeredMonoMs = performance.now(), triggeredAt = Date.now();
    context.dispose(status === 'timeout' ? 'E_TIMEOUT' : status === 'host-closed' ? 'E_HOST_CLOSED' : 'E_CANCELLED');
    clearTimeout(readyTimer); win.removeEventListener('message', bind);
    context.signal.removeEventListener('abort', abort);
    send?.({kind: 'retire', runId: identity.runId, ownerEpoch: identity.ownerEpoch, reason: status});
    const record = {status, ...payload, identity, revision, triggeredAt, triggeredMonoMs};
    terminalResolve(record); readyReject(new _framework_control_value_js__WEBPACK_IMPORTED_MODULE_0__.PageError(status === 'error' ? payload.error?.code || 'E_CONTROL_EXECUTION' : context.signal.reason?.code || 'E_CANCELLED', payload.error?.message));
    // A bounded cleanup fallback if the realm cannot acknowledge. This is not a
    // claim of physical stop: native qualification observes CPU + exact target.
    retiredTimer = setTimeout(() => { removeFrame('retire-ack-timeout'); retireResolve({acknowledged: false}); }, 3000);
    if (!port) { removeFrame(status); retireResolve({acknowledged: false, workerNeverCreated: true}); }
    return record;
  }
  const abort = () => { const code = context.signal.reason?.code; finish(code === 'E_TIMEOUT' ? 'timeout' : code === 'E_HOST_CLOSED' ? 'host-closed' : 'stopped'); };
  async function operation(data) {
    guard(); (0,_framework_control_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(Number.isSafeInteger(data.id) && data.id === lastId + 1, 'E_OPERATION_REPLAY');
    const envelope = data.envelope;
    (0,_framework_control_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(envelope && envelope.identity.runId === identity.runId && envelope.identity.ownerEpoch === identity.ownerEpoch &&
      JSON.stringify(envelope.revision) === JSON.stringify(revision), 'E_OWNER_CHANGED');
    lastId = data.id;
    // Capture the original owner + target BEFORE any asynchronous permission work.
    // The injected broker must repeat this guard at every native effect dispatch.
    const captured = (0,_framework_control_value_js__WEBPACK_IMPORTED_MODULE_0__.frozenCopy)(envelope); (0,_framework_control_value_js__WEBPACK_IMPORTED_MODULE_0__.decodeValue)(captured.operation.args, {maxBytes: captured.operation.method === 'uploadChunk' ? 131072 : 65536});
    pending.add(data.id);
    try {
      guard(); const reply = await (0,_framework_context_js__WEBPACK_IMPORTED_MODULE_1__.relayContextRequest)(context, captured); guard();
      (0,_framework_control_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(reply?.requestId === captured.requestId, 'E_RESULT_FORMAT');
      send({kind: 'reply', runId: identity.runId, ownerEpoch: identity.ownerEpoch, id: data.id, reply});
    } catch (error) {
      if (active) send({kind: 'reply', runId: identity.runId, ownerEpoch: identity.ownerEpoch, id: data.id,
        reply: {requestId: captured.requestId, error: {code: error.code || 'E_PAGE_EXECUTION', message: error.message}}});
    } finally { pending.delete(data.id); }
  }
  function bind(event) {
    if (!active || event.source !== frame.contentWindow || event.origin !== 'null' || event.data?.kind !== 'sandbox-ready') return;
    (0,_framework_control_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(event.data.origin === 'null' && !event.data.extensionAPI && !event.data.parentAccess, 'E_SANDBOX_ISOLATION');
    win.removeEventListener('message', bind);
    const channel = new MessageChannel(); port = channel.port1; send = port.postMessage.bind(port);
    port.onmessage = ({data}) => {
      if (data.kind === 'host-bound') {
        workerSource.then(source => { if (active) send({kind: 'start', identity, revision, target: context.target, workerSource: source, observeResources}); }).catch(() => {}); return;
      }
      if (data.runId !== identity.runId || data.ownerEpoch !== identity.ownerEpoch) { observe({kind: 'rejected-peer'}); return; }
      observe(data);
      if (data.kind === 'retired') { removeFrame(data.reason); retireResolve({...data, acknowledged: true}); return; }
      if (!active) return;
      if (data.kind === 'bound') { clearTimeout(readyTimer); readyResolve(data.identity); return; }
      if (data.kind === 'operation') { operation(data).catch(error => observe({kind: 'rejected-operation', code: error.code})); return; }
      if (data.kind === 'result') { try { (0,_framework_control_value_js__WEBPACK_IMPORTED_MODULE_0__.decodeValue)(data.value); finish('succeeded', {value: data.value}); } catch (error) { finish('error', {error: {code: error.code, message: error.message}}); } }
      if (data.kind === 'error') finish('error', {error: data.error});
    };
    port.start(); frame.contentWindow.postMessage({kind: 'bind-host'}, '*', [channel.port2]);
  }
  win.addEventListener('message', bind); context.signal.addEventListener('abort', abort, {once: true});
  readyTimer = setTimeout(() => finish('error', {error: {code: 'E_SANDBOX_TIMEOUT'}}), 10000);
  doc.body.append(frame); if (context.signal.aborted) abort();
  return Object.freeze({ready, result, retired,
    async execute(body, params) {
      (0,_framework_control_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(typeof body === 'string' && !executing, 'E_ARGUMENT_TYPE'); (0,_framework_control_value_js__WEBPACK_IMPORTED_MODULE_0__.encodeValue)(params); await ready; guard(); executing = true;
      send({kind: 'execute', runId: identity.runId, ownerEpoch: identity.ownerEpoch, body, params: structuredClone(params)}); return result;
    },
    stop: () => finish('stopped'), close: () => finish('host-closed'),
    async observeResource() { await ready; guard(); send({kind: 'observe-resource', runId: identity.runId, ownerEpoch: identity.ownerEpoch}); },
    snapshot: () => ({active, settled, pending: pending.size, ownedFrames: frame.isConnected ? 1 : 0, hostPorts: port && frame.isConnected ? 1 : 0})});
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
/*!******************************************************!*\
  !*** ./tests/framework/k3-controller-native-page.js ***!
  \******************************************************/
__webpack_require__.r(__webpack_exports__);
/* harmony import */ var _src_platform_host_client_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../src/platform/host/client.js */ "./src/platform/host/client.js");
/* harmony import */ var _src_run_host_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../src/run-host.js */ "./src/run-host.js");
/* harmony import */ var _src_scripting_sandbox_controller_js__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../../src/scripting/sandbox/controller.js */ "./src/scripting/sandbox/controller.js");
/* harmony import */ var _src_platform_page_port_codec_js__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ../../src/platform/page-port/codec.js */ "./src/platform/page-port/codec.js");





const events=[],cases=[];
globalThis.__controllerProgress={events,cases};
const base=globalThis.__controllerFixtureBase;
const foundationClient=(0,_src_platform_host_client_js__WEBPACK_IMPORTED_MODULE_0__.createHostClient)(chrome);
const host=(0,_src_run_host_js__WEBPACK_IMPORTED_MODULE_1__.createRunHost)({client:foundationClient,controllerFactory:options=>(0,_src_scripting_sandbox_controller_js__WEBPACK_IMPORTED_MODULE_2__.createControlController)({...options,
  onEvent:event=>events.push({...event,hostObservedMonoMs:performance.now()})})});
globalThis.__controllerHost=host;
const expect=(condition,message)=>{if(!condition)throw new Error(message);};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function documentTarget(tabId,frameId=0) {
  for(let i=0;i<200;i++) {
    const frames=await chrome.webNavigation.getAllFrames({tabId});const frame=frames?.find(f=>f.frameId===frameId);
    if(frame?.documentId&&frame.url.startsWith(base))return {mode:'borrowed',tabId,frameId,documentId:frame.documentId};
    await sleep(25);
  } throw new Error('No exact native fixture document');
}
let count=0;
async function revision(sourceUtf8,scriptId='native-'+(++count),expectedRevision=0) {
  return host.controller.commitControllerScript({scriptId,expectedRevision,sourceUtf8});
}
async function run(row,{params={},target,deadlineAt=Date.now()+15000}={}) {
  const admission=await host.start({scriptId:row.scriptId,revision:row.revision,contentHash:row.contentHash,params,target,deadlineAt});
  const result=await host.completion;expect(result.result,'No durable result: '+JSON.stringify(result));
  expect(result.retirement.state==='released','Target retirement incomplete');return {admission,result};
}
async function check(id,body) {
  try {const actual=await body();cases.push({id,status:'PASS',actual});}
  catch(error){cases.push({id,status:'FAIL',error:{code:error.code,message:error.message,stack:error.stack}});}
}
(async()=>{
  await host.ready;const tab=await chrome.tabs.create({url:base+'/page',active:false});let target=await documentTarget(tab.id);
  await check('ordinary-js-typed-dom',async()=>{
    const row=await revision('return {title:await page.title(), no:params.no, zero:params.zero, absent:params.absent, list:params.list};');
    const {admission,result}=await run(row,{target,params:{no:false,zero:0,absent:undefined,list:[undefined,null]}});
    const value=(0,_src_platform_page_port_codec_js__WEBPACK_IMPORTED_MODULE_3__.decodeValue)(result.result.outcome.valueWire);
    expect(value.title==='Top fixture'&&value.no===false&&value.zero===0&&Object.hasOwn(value,'absent')&&value.absent===undefined&&value.list[0]===undefined,'Typed value changed');
    expect(!Object.hasOwn(admission.identity,'templateHash'),'Generic identity has template hash');
    return {runId:admission.runId,state:result.result.state,valueWire:result.result.outcome.valueWire,target:admission.target};
  });
  await check('borrowed-child-exact-document',async()=>{
    let frame;for(let i=0;i<200;i++){frame=(await chrome.webNavigation.getAllFrames({tabId:tab.id}))?.find(f=>f.frameId>0&&f.url===base+'/child');if(frame)break;await sleep(25);}
    expect(frame?.documentId,'Child document missing');
    const child={mode:'borrowed',tabId:tab.id,frameId:frame.frameId,documentId:frame.documentId};
    const {admission,result}=await run(await revision('await page.type("#input",params.text); return {title:await page.title(),text:await page.$eval("#input",e=>e.value)};'),{target:child,params:{text:'子页'}});
    if(!result.result.outcome.ok) {
      expect(result.result.outcome.error.code==='E_USER_SCRIPTS_UNAVAILABLE','Unexpected child failure '+JSON.stringify(result));
      const dom=await run(await revision('return await page.title();'),{target:child});expect((0,_src_platform_page_port_codec_js__WEBPACK_IMPORTED_MODULE_3__.decodeValue)(dom.result.result.outcome.valueWire)==='Child fixture','Wrong child selected');
      return {target:admission.target,userScripts:result.result.outcome.error.code,domRun:dom.admission.runId};
    }
    const value=(0,_src_platform_page_port_codec_js__WEBPACK_IMPORTED_MODULE_3__.decodeValue)(result.result.outcome.valueWire);expect(value.title==='Child fixture'&&value.text==='子页','Cross-frame dispatch');return {target:admission.target,value};
  });
  await check('headcas-r1-pinned-during-r2-save',async()=>{
    const row=await revision('await page.waitForTimeout(300); return params;','pin-race');
    const admission=await host.start({scriptId:row.scriptId,revision:row.revision,contentHash:row.contentHash,params:false,target});
    const next=await revision('return "r2";',row.scriptId,1),result=await host.completion;
    expect(result.result.outcome.ok&&(0,_src_platform_page_port_codec_js__WEBPACK_IMPORTED_MODULE_3__.decodeValue)(result.result.outcome.valueWire)===false,'Pinned r1 changed');
    expect(admission.revision.sourceHash===row.contentHash&&next.revision===2,'Pin/head wrong');
    let conflict;try{await revision('return 0;',row.scriptId,1);}catch(error){conflict=error.code;}expect(conflict==='E_REVISION','Missing head CAS');
    return {runId:admission.runId,pin:admission.revision,head:next.revision,conflict};
  });
  await check('owned-navigation-handoff-old-element-fenced',async()=>{
    const row=await revision('const old=await page.$("#button"); await page.goto(params.url,{timeout:5000,waitUntil:"complete"}); let code;try{await old.click();}catch(error){code=error.code;}return {title:await page.title(),code};');
    const {admission,result}=await run(row,{target:{mode:'owned',url:base+'/page'},params:{url:base+'/next'}});
    expect(result.result.outcome.ok,'Navigation failed '+JSON.stringify(result.result.outcome));
    const value=(0,_src_platform_page_port_codec_js__WEBPACK_IMPORTED_MODULE_3__.decodeValue)(result.result.outcome.valueWire);expect(value.title==='Next fixture'&&value.code==='E_DOCUMENT_REPLACED','Root/old element differs');
    let absent=false;try{await chrome.tabs.get(admission.target.tabId);}catch{absent=true;}expect(absent,'Owned tab remains');
    return {runId:admission.runId,originalTarget:admission.target,value,ownedAbsent:absent};
  });
  await check('throw-durable-once',async()=>{
    const {admission,result}=await run(await revision('throw new Error("native boom");'),{target});
    expect(result.result.state==='failed'&&result.result.outcome.error.message==='native boom','Throw changed');
    const snapshot=await host.controller.snapshotControllerRun({runId:admission.runId});expect(snapshot.results.length===1&&snapshot.slotAvailable,'Throw settle duplicated');
    return {runId:admission.runId,result:result.result};
  });
  await check('busy-worker-stop-durable-then-retire',async()=>{
    const row=await revision('while(true) {}');
    const admission=await host.start({scriptId:row.scriptId,revision:row.revision,contentHash:row.contentHash,params:{},target,deadlineAt:Date.now()+20000});
    for(let i=0;i<200&&!events.some(e=>e.kind==='bound'&&e.runId===admission.runId);i++)await sleep(25);
    const bound=events.find(e=>e.kind==='bound'&&e.runId===admission.runId);expect(bound,'Worker never bound');await sleep(100);
    globalThis.__controllerProbe={stage:'busy',runId:admission.runId,bound,hostMonoMs:performance.now()};
    for(let i=0;i<600&&!globalThis.__controllerStop;i++)await sleep(25);expect(globalThis.__controllerStop,'External observation did not request stop');
    const trigger={at:Date.now(),monoMs:performance.now()};await host.stop({runId:admission.runId});
    const result=await host.completion;expect(result.result.state==='stopped'&&result.retirement.state==='released','Busy result not durable/released');
    const retired=events.find(e=>e.kind==='retired'&&e.runId===admission.runId);expect(retired,'Physical Worker cleanup acknowledgement missing');
    const snapshot=await host.controller.snapshotControllerRun({runId:admission.runId});expect(snapshot.results.length===1&&snapshot.slotAvailable,'Busy settled more than once');
    globalThis.__controllerProbe={...globalThis.__controllerProbe,stage:'stopped',trigger,result,retired,hostMonoMs:performance.now()};
    for(let i=0;i<200&&!globalThis.__controllerContinue;i++)await sleep(25);
    expect(globalThis.__controllerContinue,'Physical stop observer did not finish');
    return {runId:admission.runId,trigger,retired,result};
  });
  await check('deadline-forces-worker-stop',async()=>{
    const {admission,result}=await run(await revision('while(true) {}'),{target,deadlineAt:Date.now()+1200});
    expect(result.result.state==='stopped'&&result.result.outcome.error.code==='E_TIMEOUT','Deadline result differs');
    expect(events.some(e=>e.kind==='retired'&&e.runId===admission.runId),'Deadline Worker not retired');return {runId:admission.runId,result};
  });
  await check('borrowed-tab-survives-all-retirements',async()=>{const borrowed=await chrome.tabs.get(tab.id);expect(borrowed.id===tab.id,'Borrowed closed');return {tabId:tab.id};});
  await chrome.tabs.remove(tab.id);host.dispose();foundationClient.dispose();
  globalThis.__k3ControllerReport={cases,events,summary:{PASS:cases.filter(c=>c.status==='PASS').length,FAIL:cases.filter(c=>c.status==='FAIL').length},finalProductPassed:false};
})().catch(error=>{globalThis.__k3ControllerReport={cases,events,error:{code:error.code,message:error.message,stack:error.stack},summary:{PASS:0,FAIL:1},finalProductPassed:false};});

})();

/******/ })()
;