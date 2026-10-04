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

/***/ "./src/framework/control/native-driver.js":
/*!************************************************!*\
  !*** ./src/framework/control/native-driver.js ***!
  \************************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   PACKAGED_PAGE_FILE: () => (/* binding */ PACKAGED_PAGE_FILE),
/* harmony export */   createControllerDriver: () => (/* binding */ createControllerDriver)
/* harmony export */ });
/* harmony import */ var _value_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./value.js */ "./src/framework/control/value.js");
/* harmony import */ var _platform_chrome_tabs_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../platform/chrome/tabs.js */ "./src/platform/chrome/tabs.js");
/* harmony import */ var _platform_chrome_cookies_js__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../../platform/chrome/cookies.js */ "./src/platform/chrome/cookies.js");
/* harmony import */ var _scripting_user_scripts_page_evaluator_js__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ../../scripting/user-scripts/page-evaluator.js */ "./src/scripting/user-scripts/page-evaluator.js");





const PACKAGED_PAGE_FILE = 'scripting/packaged/page-session.js';
const MESSAGE = 'OPENDESK_CONTROLLER_PAGE_SESSION_V1';
const unavailableByAPI = new WeakMap();
const methods = Object.freeze({
  packaged: new Set(['title', 'content', 'url', 'snapshot', 'snapshots', 'click', 'type', 'keyboard',
    'waitForTimeout', 'waitForSelector', 'uploadChunk', 'uploadCommit', 'addScriptTag', 'addStyleTag']),
  browser: new Set(['goto', 'reload', 'cookies', 'setCookie', 'deleteCookie', 'screenshot', 'uploadFromUrl']),
  'user-script': new Set(['evaluate', '$eval', '$$eval', 'evaluateExpression', 'eval', 'waitForFunction'])
});
const ownerKey = run => JSON.stringify([run.runId, run.ownerEpoch]);
const injectionTarget = target => ({tabId: target.tabId, documentIds: [target.documentId]});
const messageTarget = target => ({documentId: target.documentId, frameId: target.frameId});
const error = code => new _value_js__WEBPACK_IMPORTED_MODULE_0__.PageError(code);
function validate(envelope) {
  (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(envelope?.operation && Object.hasOwn(methods, envelope.operation.kind) &&
    methods[envelope.operation.kind].has(envelope.operation.method), 'E_OPERATION_UNSUPPORTED');
  const {identity, revision, target, requestId} = envelope;
  (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(identity?.tag === 'controller-run' && typeof identity.runId === 'string' && identity.runId &&
    Number.isSafeInteger(identity.ownerEpoch) && identity.ownerEpoch > 0, 'E_OWNER_CHANGED');
  (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(typeof requestId === 'string' && requestId && revision && typeof revision.scriptId === 'string' && revision.scriptId &&
    Number.isSafeInteger(revision.revision) && revision.revision > 0 && /^[a-f0-9]{64}$/.test(revision.sourceHash) &&
    typeof revision.pinKey === 'string' && revision.pinKey, 'E_PAGE_CONTEXT_REQUIRED');
  (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(Number.isSafeInteger(target?.tabId) && target.tabId >= 0 && Number.isSafeInteger(target.frameId) && target.frameId >= 0 &&
    typeof target.documentId === 'string' && target.documentId, 'E_TARGET');
  if (identity.target !== undefined) (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(JSON.stringify(identity.target) === JSON.stringify(target), 'E_TARGET');
  const args = (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.decodeValue)(envelope.operation.args, {maxBytes: envelope.operation.method === 'uploadChunk' ? 131072 : 65536});
  (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(Array.isArray(args), 'E_ARGUMENT_TYPE'); return args;
}

// Authority owns admission, revision/lease/grants, durable navigation intent and
// result persistence. This driver only observes and dispatches exact native APIs.
function createControllerDriver({api = globalThis.chrome, authorize, clock = Date} = {}) {
  (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(api && typeof authorize === 'function' && typeof clock.now === 'function', 'E_PAGE_CONTEXT_REQUIRED');
  const runs = new Map(), retired = new Set();
  if (!unavailableByAPI.has(api)) unavailableByAPI.set(api, new Set());
  const unavailable = unavailableByAPI.get(api);
  function guard(state) {
    if (state.controller.signal.aborted) throw state.controller.signal.reason;
    if (state.run.closed) throw state.run.closed;
    if (state.deadlineAt !== null && clock.now() >= state.deadlineAt) throw error('E_TIMEOUT');
  }
  async function permission(state, phase, extra = {}) {
    guard(state);
    const decision = await race(state, authorize(state.envelope, {phase,
      ...(state.navigationPending && (!state.handoff || phase === 'pre') ? {navigationPending: true} : {}),
      ...(state.handoff && phase === 'post' ? {handoff: state.handoff} : {}), ...extra}));
    (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(decision !== false, 'E_PERMISSION'); guard(state);
  }
  function race(state, promise) {
    const signal = state.controller.signal;
    return new Promise((resolve, reject) => {
      const abort = () => { signal.removeEventListener('abort', abort); reject(signal.reason); };
      Promise.resolve(promise).then(value => { signal.removeEventListener('abort', abort); resolve(value); }, cause => {
        signal.removeEventListener('abort', abort); reject(cause);
      });
      if (signal.aborted) abort(); else signal.addEventListener('abort', abort, {once: true});
    });
  }
  async function wait(state, promise, extra = {}) {
    let timer, ended = false;
    async function poll() {
      try { await permission(state, 'pre', extra); if (!ended) timer = setTimeout(poll, 25); }
      catch (cause) { state.controller.abort(cause); }
    }
    // Revalidate while an admitted native wait is pending, including when no
    // Chrome callback arrives. A late callback can never revive delivery.
    timer = setTimeout(poll, 25);
    try { const value = await race(state, promise); await permission(state, 'post', extra); return value; }
    finally { ended = true; clearTimeout(timer); }
  }
  async function saveReceipt(state, stage, receipt) {
    if (state.recordReceipt) await state.recordReceipt({requestId: state.envelope.requestId, stage, receipt: (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.frozenCopy)(receipt)});
  }
  async function step(state, dispatch, extra = {}, stage) {
    await permission(state, 'pre', extra); guard(state);
    const dispatched = Promise.resolve(dispatch()).then(async value => {
      if (stage) await saveReceipt(state, stage, value); return value;
    });
    return wait(state, dispatched, extra);
  }
  async function native(state, owner, method, args, extra) {
    const namespace = ['tabs', 'windows', 'cookies', 'scripting', 'webNavigation'].find(name => api[name] === owner);
    return step(state, () => (0,_platform_chrome_tabs_js__WEBPACK_IMPORTED_MODULE_1__.chromeCall)(api, owner, method, ...args), extra, `${namespace}.${method}`);
  }
  async function verifyTarget(state, target = state.handoff?.to || state.envelope.target) {
    const frames = await native(state, api.webNavigation, 'getAllFrames', [{tabId: target.tabId}]);
    const frame = frames?.find(row => row.frameId === target.frameId);
    (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(frame && frame.documentId === target.documentId && !frame.errorOccurred &&
      (!frame.documentLifecycle || frame.documentLifecycle === 'active'), 'E_DOCUMENT_REPLACED');
    const url = (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.httpURL)(frame.url);
    (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(!target.allowedOrigin || new URL(url).origin === target.allowedOrigin, 'E_DOCUMENT_REPLACED');
    await permission(state, 'post', {url}); return url;
  }
  async function pageReady(state) {
    const target = state.envelope.target, key = JSON.stringify([target.tabId, target.documentId]);
    if (state.run.pages.has(key)) { await wait(state, state.run.pages.get(key)); return; }
    const ready = (async () => {
      await verifyTarget(state);
      let reply;
      try { reply = await native(state, api.tabs, 'sendMessage', [target.tabId, {type: MESSAGE, action: 'ping'}, messageTarget(target)]); }
      catch (cause) {
        if (cause.code !== 'E_CHROME' || !/Receiving end does not exist|Could not establish connection/i.test(cause.message)) throw cause;
      }
      if (reply !== undefined) (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(reply?.type === MESSAGE && reply.ready === true, 'E_RESULT_FORMAT');
      else {
        await verifyTarget(state);
        const receipts = await native(state, api.scripting, 'executeScript', [{target: injectionTarget(target), world: 'ISOLATED', files: [PACKAGED_PAGE_FILE]}]);
        (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(Array.isArray(receipts) && receipts.length === 1 && receipts[0].documentId === target.documentId && receipts[0].frameId === target.frameId, 'E_TARGET');
      }
      await verifyTarget(state);
    })();
    state.run.pages.set(key, ready); state.run.pageTargets.set(key, state.envelope);
    try { await wait(state, ready); } catch (cause) { state.run.pages.delete(key); throw cause; }
  }
  async function packaged(state, method = state.envelope.operation.method, args = state.args) {
    await pageReady(state); await verifyTarget(state);
    const envelope = method === state.envelope.operation.method && args === state.args ? state.envelope :
      {...state.envelope, requestId: (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.newPageRequestId)(), operation: {kind: 'packaged', method,
        args: (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.encodeValue)(args, {maxBytes: method === 'uploadChunk' ? 131072 : 65536})}};
    const reply = await native(state, api.tabs, 'sendMessage', [envelope.target.tabId,
      {type: MESSAGE, action: 'execute', envelope}, messageTarget(envelope.target)]);
    await verifyTarget(state);
    (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(reply?.requestId === envelope.requestId && reply.runId === envelope.identity.runId &&
      reply.ownerEpoch === envelope.identity.ownerEpoch, 'E_RESULT_FORMAT');
    if (reply.error) throw new _value_js__WEBPACK_IMPORTED_MODULE_0__.PageError(reply.error.code || 'E_PAGE_EXECUTION', reply.error.message);
    return (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.decodeValue)(reply.value);
  }
  async function userScriptsAvailable(state) {
    (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(!unavailable.has(ownerKey(state.envelope.identity)), 'E_USER_SCRIPTS_UNAVAILABLE');
    await permission(state, 'pre');
    let scripts;
    try {
      (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(typeof api.userScripts?.getScripts === 'function' && typeof api.userScripts?.execute === 'function', 'E_USER_SCRIPTS_UNAVAILABLE');
      scripts = await race(state, api.userScripts.getScripts());
    } catch (cause) {
      if (state.controller.signal.aborted) throw state.controller.signal.reason;
      unavailable.add(ownerKey(state.envelope.identity)); throw new _value_js__WEBPACK_IMPORTED_MODULE_0__.PageError('E_USER_SCRIPTS_UNAVAILABLE', cause.message);
    }
    (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(Array.isArray(scripts), 'E_RESULT_FORMAT'); await permission(state, 'post');
  }
  async function userScript(state) {
    const descriptor = state.descriptor;
    await verifyTarget(state); await userScriptsAvailable(state);
    if (descriptor.wait) state.run.waits.set(state.envelope.requestId, {envelope: state.envelope, descriptor});
    try {
      const replies = await step(state, () => api.userScripts.execute({target: injectionTarget(state.envelope.target),
        world: descriptor.world, js: [{code: descriptor.code}]}), {}, 'userScripts.execute');
      await userScriptsAvailable(state); await verifyTarget(state);
      (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(Array.isArray(replies) && replies.length === 1 && replies[0].frameId === state.envelope.target.frameId &&
        replies[0].documentId === state.envelope.target.documentId, 'E_TARGET');
      if (replies[0].error) throw new _value_js__WEBPACK_IMPORTED_MODULE_0__.PageError('E_PAGE_EXECUTION', replies[0].error);
      return (0,_scripting_user_scripts_page_evaluator_js__WEBPACK_IMPORTED_MODULE_3__.readPageEvaluationResult)(replies[0].result);
    } finally { if (!state.controller.signal.aborted) state.run.waits.delete(state.envelope.requestId); }
  }
  async function listen(state, event, listener) {
    (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(typeof event?.addListener === 'function' && typeof event.removeListener === 'function', 'E_CAPABILITY_UNAVAILABLE');
    await permission(state, 'pre'); guard(state); event.addListener(listener);
    state.cleanups.push(() => event.removeListener(listener));
  }
  async function navigate(state) {
    const {method} = state.envelope.operation, from = state.envelope.target;
    const config = method === 'goto' ? state.args[1] : state.args[0];
    const startURL = await verifyTarget(state), url = method === 'goto' ? state.args[0] : startURL;
    let candidate, chain = Promise.resolve(), armed = false, resolve, reject;
    const completed = new Promise((yes, no) => { resolve = yes; reject = no; }); completed.catch(() => {});
    function observe(kind, details) {
      if (!armed || details.tabId !== from.tabId || details.frameId !== 0) return;
      // Chrome supplies the new binding at commit, before the method's selected
      // readiness event. Pre-checks during the remaining wait use that binding.
      if (kind === 'commit' && typeof details.documentId === 'string' && details.documentId !== from.documentId) {
        try {
          const observedURL = (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.httpURL)(details.url);
          candidate = {...from, documentId: details.documentId, url: observedURL, allowedOrigin: new URL(observedURL).origin,
            targetVersion: (from.targetVersion || 0) + 1};
          state.handoff = {from, to: (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.frozenCopy)(candidate)};
        } catch (cause) { reject(cause); state.controller.abort(cause); return; }
      }
      chain = chain.then(async () => {
        guard(state);
        if (kind === 'error') throw error('E_NAVIGATION');
        const observedURL = (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.httpURL)(details.url);
        await permission(state, 'pre', {url: observedURL});
        if (kind === 'commit') {
          (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(typeof details.documentId === 'string' && details.documentId && details.documentId !== from.documentId, 'E_DOCUMENT_REPLACED');
        }
        if ((kind === 'dom' && config.waitUntil === 'domcontentloaded') ||
          (kind === 'complete' && config.waitUntil !== 'domcontentloaded')) {
          if (!candidate || candidate.documentId !== details.documentId) return;
          state.handoff = {from, to: (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.frozenCopy)(candidate)};
          await verifyTarget(state); await permission(state, 'post', {url: observedURL}); resolve();
        }
      }).catch(cause => { reject(cause); state.controller.abort(cause); });
    }
    for (const [name, kind] of [['onBeforeNavigate', 'before'], ['onCommitted', 'commit'], ['onDOMContentLoaded', 'dom'], ['onCompleted', 'complete'], ['onErrorOccurred', 'error']]) {
      await listen(state, api.webNavigation?.[name], details => observe(kind, details));
    }
    await verifyTarget(state); await permission(state, 'pre', {url});
    // The parent's durable intent MUST already be admitted by this pre-check.
    armed = true; state.navigationPending = true;
    await native(state, api.tabs, method === 'goto' ? 'update' : 'reload', method === 'goto' ? [from.tabId, {url}] : [from.tabId], {url});
    await wait(state, completed, {url}); await verifyTarget(state); return undefined;
  }
  async function screenshot(state) {
    let changed = false, windowId;
    await listen(state, api.tabs.onActivated, details => { if (windowId === undefined || details.windowId === windowId) changed = true; });
    await listen(state, api.tabs.onUpdated, (tabId, changes) => { if (tabId === state.envelope.target.tabId && (changes.url !== undefined || changes.status === 'loading')) changed = true; });
    await listen(state, api.webNavigation.onCommitted, details => { if (details.tabId === state.envelope.target.tabId && details.frameId === 0) changed = true; });
    async function visible(after = false) {
      await verifyTarget(state);
      const tab = await native(state, api.tabs, 'get', [state.envelope.target.tabId]);
      (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(tab?.id === state.envelope.target.tabId && tab.active && !tab.hidden && Number.isInteger(tab.windowId), after ? 'E_CAPTURE_TARGET_CHANGED' : 'E_CAPTURE_TARGET_UNAVAILABLE');
      if (windowId !== undefined) (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(windowId === tab.windowId, 'E_CAPTURE_TARGET_CHANGED');
      windowId = tab.windowId;
      const win = await native(state, api.windows, 'get', [windowId]);
      (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(win?.id === windowId && win.state !== 'minimized', after ? 'E_CAPTURE_TARGET_CHANGED' : 'E_CAPTURE_TARGET_UNAVAILABLE');
      if (state.envelope.target.windowId !== undefined) (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(windowId === state.envelope.target.windowId, 'E_CAPTURE_TARGET_CHANGED');
      (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(!changed, 'E_CAPTURE_TARGET_CHANGED');
    }
    await visible();
    const value = await native(state, api.tabs, 'captureVisibleTab', [windowId, {format: state.args[0].format}]);
    await visible(true); (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(typeof value === 'string' && value.startsWith(`data:image/${state.args[0].format};base64,`), 'E_RESULT_FORMAT');
    return value;
  }
  async function cookieOperation(state) {
    const currentURL = await verifyTarget(state), method = state.envelope.operation.method;
    // Validate every input and grant before native cookie reads or writes.
    let values;
    if (method === 'cookies') {
      (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(state.args.length === 1 && Array.isArray(state.args[0]) && state.args[0].length <= 100, 'E_COOKIE_SCOPE');
      values = [...new Set((state.args[0].length ? state.args[0] : [currentURL]).map(_value_js__WEBPACK_IMPORTED_MODULE_0__.httpURL))];
    } else values = state.args.map(value => normalizeCookie(value, currentURL, method === 'deleteCookie', clock.now()));
    for (const value of values) await permission(state, 'pre', {url: typeof value === 'string' ? value : value.url});
    const stores = await native(state, api.cookies, 'getAllCookieStores', []);
    const matched = stores?.filter(store => store.tabIds?.includes(state.envelope.target.tabId));
    (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(matched?.length === 1 && typeof matched[0].id === 'string', 'E_COOKIE_SCOPE');
    const storeId = matched[0].id;
    for (const value of values) if (typeof value !== 'string') {
      (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(value.storeId === undefined || value.storeId === storeId, 'E_COOKIE_SCOPE'); value.storeId = storeId;
    }
    let fault, selection;
    // Only createCookieService drives getAll/set/remove. The local facade adds
    // the observed tab store and narrows delete candidates, without mutating api.
    const scopedAPI = {runtime: api.runtime, cookies: {
      getAll(details, callback) {
        guard(state);
        api.cookies.getAll({...details, storeId}, rows => {
          if (api.runtime.lastError) { callback(rows); return; }
          saveReceipt(state, 'cookies.getAll', rows).then(() => { try {
            if (Array.isArray(rows)) {
              (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(rows.every(row => row.storeId === storeId), 'E_COOKIE_SCOPE');
              (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(rows.every(row => row.partitionKey === undefined), 'E_COOKIE_PARTITION_UNSUPPORTED');
              if (selection) {
                const candidates = rows.filter(row => row.name === selection.name && row.path === selection.path);
                (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(candidates.length <= 1, 'E_COOKIE_SCOPE');
                rows = candidates.filter(row => !selection.domain || row.domain.replace(/^\./, '') === selection.domain.replace(/^\./, ''));
              }
            }
            callback(rows);
          } catch (cause) { fault = cause; callback(undefined); } }, cause => { fault = cause; callback(undefined); });
        });
      },
      set(details, callback) { guard(state); api.cookies.set({...details, storeId}, receipt => {
        if (api.runtime.lastError) { callback(receipt); return; }
        saveReceipt(state, 'cookies.set', receipt).then(() => callback(receipt), cause => { fault = cause; callback(undefined); });
      }); },
      remove(details, callback) { guard(state); api.cookies.remove({...details, storeId}, receipt => {
        if (api.runtime.lastError) { callback(receipt); return; }
        if (!receipt) fault = error('E_COOKIE_OPERATION');
        saveReceipt(state, 'cookies.remove', receipt).then(() => callback(receipt), cause => { fault = cause; callback(undefined); });
      }); }
    }};
    const service = (0,_platform_chrome_cookies_js__WEBPACK_IMPORTED_MODULE_2__.createCookieService)({api: scopedAPI, authorize: async request => {
      if (request.phase === 'pre') await verifyTarget(state);
      await permission(state, request.phase, {url: request.url});
    }});
    try {
      if (method === 'cookies') {
        const all = new Map();
        for (const url of values) for (const cookie of await wait(state, service.getCookies(url))) {
          all.set(JSON.stringify([cookie.storeId, cookie.name, cookie.domain, cookie.path]), {
            name: cookie.name, value: cookie.value, domain: cookie.domain, path: cookie.path,
            expires: cookie.expirationDate, httpOnly: cookie.httpOnly, secure: cookie.secure, sameSite: cookie.sameSite
          });
        }
        return [...all.values()];
      }
      if (method === 'setCookie') await wait(state, service.setCookies(values));
      else {
        // Preflight the whole batch before the first removal. Missing precise
        // candidates are harmless; ambiguous candidates never become guesses.
        const removals = [];
        for (const value of values) {
          selection = value; const rows = await wait(state, service.getCookies(value.url));
          if (rows.length) removals.push(value);
        }
        for (const value of removals) {
          selection = value; await wait(state, service.deleteCookiesByUrl(value.url));
          if (fault) throw fault;
        }
      }
      await verifyTarget(state); return undefined;
    } catch (cause) {
      if (fault) throw fault;
      if (cause.code === 'E_CHROME') throw new _value_js__WEBPACK_IMPORTED_MODULE_0__.PageError('E_COOKIE_OPERATION', cause.message);
      if (cause.code === 'E_SCHEMA') throw new _value_js__WEBPACK_IMPORTED_MODULE_0__.PageError('E_COOKIE_FORMAT', cause.message);
      throw cause;
    }
  }
  const fetchImpl = globalThis.fetch?.bind(globalThis);
  async function uploadFromURL(state) {
    const [css, input] = state.args; (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.selector)(css); let url = (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.httpURL)(input), response;
    (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(typeof fetchImpl === 'function', 'E_CAPABILITY_UNAVAILABLE');
    await verifyTarget(state);
    for (let redirects = 0;; redirects++) {
      try { response = await step(state, () => fetchImpl(url, {method: 'GET', redirect: 'manual', credentials: 'omit',
        signal: state.controller.signal}).then(async response => {
        await saveReceipt(state, 'fetch.response', {url, status: response.status, type: response.type}); return response;
      }), {url}); }
      catch (cause) { if (cause.code) throw cause; throw new _value_js__WEBPACK_IMPORTED_MODULE_0__.PageError('E_NETWORK', cause.message); }
      (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(!['opaque', 'opaqueredirect'].includes(response.type), 'E_NETWORK');
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      await response.body?.cancel(); (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(redirects < 5, 'E_LIMIT');
      const location = response.headers.get('location'); (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(location, 'E_NETWORK');
      const next = (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.httpURL)(new URL(location, url).href);
      (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(!(url.startsWith('https:') && next.startsWith('http:')), 'E_UPLOAD_URL_UNSUPPORTED');
      url = next;
    }
    if (!response.ok) { await response.body?.cancel(); throw new _value_js__WEBPACK_IMPORTED_MODULE_0__.PageError('E_HTTP', `HTTP ${response.status}`); }
    const length = Number(response.headers.get('content-length'));
    if (length > _value_js__WEBPACK_IMPORTED_MODULE_0__.VALUE_LIMITS.uploadBytes) { await response.body?.cancel(); throw error('E_LIMIT'); }
    const chunks = []; let total = 0;
    if (response.body) {
      const reader = response.body.getReader();
      const cancel = () => { reader.cancel().catch(() => {}); };
      state.controller.signal.addEventListener('abort', cancel, {once: true});
      try {
        for (;;) {
          const {done, value} = await step(state, () => reader.read(), {url}); if (done) break;
          total += value.byteLength; (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(total <= _value_js__WEBPACK_IMPORTED_MODULE_0__.VALUE_LIMITS.uploadBytes, 'E_LIMIT'); chunks.push(value);
        }
      } catch (cause) { await reader.cancel().catch(() => {}); if (cause.code) throw cause; throw error('E_NETWORK'); }
      finally { state.controller.signal.removeEventListener('abort', cancel); reader.releaseLock(); }
    }
    await permission(state, 'post', {url}); await verifyTarget(state);
    const uploadId = (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.newPageRequestId)(), bytes = new Uint8Array(total); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; } chunks.length = 0;
    try {
      for (offset = 0; offset < total; offset += _value_js__WEBPACK_IMPORTED_MODULE_0__.VALUE_LIMITS.chunkBytes) {
        let binary = ''; for (const byte of bytes.subarray(offset, offset + _value_js__WEBPACK_IMPORTED_MODULE_0__.VALUE_LIMITS.chunkBytes)) binary += String.fromCharCode(byte);
        await permission(state, 'pre', {url});
        await packaged(state, 'uploadChunk', [uploadId, offset, total, btoa(binary)]);
      }
      await permission(state, 'pre', {url}); await packaged(state, 'uploadCommit', [css, uploadId, total]); return true;
    } finally { bytes.fill(0); }
  }
  async function cleanupCall(envelope, dispatch) {
    let timer;
    try {
      await Promise.race([(async () => {
        const decision = await authorize(envelope, {phase: 'pre'}); (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(decision !== false, 'E_PERMISSION');
        await dispatch(); await authorize(envelope, {phase: 'post'});
      })(), new Promise(resolve => { timer = setTimeout(resolve, 250); })]);
    } catch { /* Authority/grant loss can prevent remote cleanup; pagehide still disposes the isolated registry. */ }
    finally { clearTimeout(timer); }
  }
  async function cancel(run) {
    const identity = run?.identity || run;
    (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(identity?.tag === 'controller-run' && typeof identity.runId === 'string' &&
      Number.isSafeInteger(identity.ownerEpoch), 'E_OWNER_CHANGED');
    const key = ownerKey(identity); retired.add(key); const record = runs.get(key);
    if (!record) {
      // Authority may create a fresh short-lived driver for retirement. It must
      // supply the original epoch identity and exact run binding, not an active
      // tab selection. The cleanup envelope is never passed to execute().
      if (!identity.target || !run?.revision) return;
      const envelope = {requestId: (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.newPageRequestId)(), identity, revision: run.revision, target: identity.target,
        operation: {kind: 'packaged', method: 'cancel', args: (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.encodeValue)([])}};
      await cleanupCall(envelope, () => (0,_platform_chrome_tabs_js__WEBPACK_IMPORTED_MODULE_1__.chromeCall)(api, api.tabs, 'sendMessage', envelope.target.tabId,
        {type: MESSAGE, action: 'cancel', run: identity}, messageTarget(envelope.target)));
      if (!unavailable.has(key)) await cancelWaits(envelope, {world: 'USER_SCRIPT', runId: key});
      return;
    }
    if (record.cancelling) return record.cancelling;
    record.closed = error('E_CANCELLED');
    for (const state of record.pending) state.controller.abort(record.closed);
    record.cancelling = (async () => {
      for (const envelope of record.pageTargets.values()) await cleanupCall(envelope, () => (0,_platform_chrome_tabs_js__WEBPACK_IMPORTED_MODULE_1__.chromeCall)(api, api.tabs, 'sendMessage',
        envelope.target.tabId, {type: MESSAGE, action: 'cancel', run: identity}, messageTarget(envelope.target)));
      for (const {envelope, descriptor} of record.waits.values()) {
        if (!unavailable.has(key)) await cancelWaits(envelope, descriptor);
      }
      record.pages.clear(); record.pageTargets.clear(); record.waits.clear(); runs.delete(key);
    })();
    return record.cancelling;
  }
  async function cancelWaits(envelope, descriptor) {
    await cleanupCall(envelope, async () => {
      // Only the generated framework wait harness is cancelled. This never
      // promises to interrupt arbitrary synchronous user page code.
      try { await api.userScripts.getScripts(); }
      catch (cause) { unavailable.add(ownerKey(envelope.identity)); throw cause; }
      const decision = await authorize(envelope, {phase: 'pre'}); (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(decision !== false, 'E_PERMISSION');
      await api.userScripts.execute({target: injectionTarget(envelope.target), world: descriptor.world,
        js: [{code: (0,_scripting_user_scripts_page_evaluator_js__WEBPACK_IMPORTED_MODULE_3__.buildCancelPageWaits)(descriptor.runId)}]});
      await authorize(envelope, {phase: 'pre'});
      try { await api.userScripts.getScripts(); }
      catch (cause) { unavailable.add(ownerKey(envelope.identity)); throw cause; }
    });
  }
  async function execute(input, {signal, deadlineAt = null, recordReceipt} = {}) {
    const envelope = (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.frozenCopy)(input), args = validate(envelope), {kind, method} = envelope.operation;
    (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(deadlineAt === null || Number.isFinite(deadlineAt), 'E_ARGUMENT_TYPE');
    (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(recordReceipt === undefined || typeof recordReceipt === 'function', 'E_ARGUMENT_TYPE');
    let descriptor;
    if (kind === 'user-script') descriptor = (0,_scripting_user_scripts_page_evaluator_js__WEBPACK_IMPORTED_MODULE_3__.buildPageEvaluation)(method, args,
      {operationId: envelope.requestId, runId: ownerKey(envelope.identity)});
    if (kind === 'browser' && ['goto', 'reload'].includes(method)) {
      (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(envelope.target.frameId === 0, 'E_TOP_FRAME_REQUIRED');
      (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(args.length === (method === 'goto' ? 2 : 1), 'E_ARGUMENT_TYPE');
      if (method === 'goto') args[0] = (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.httpURL)(args[0]);
      const config = args[method === 'goto' ? 1 : 0]; (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.options)(config, ['timeout', 'waitUntil']); (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.duration)(config.timeout);
      (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(['complete', 'load', 'domcontentloaded'].includes(config.waitUntil), 'E_OPTION_UNSUPPORTED');
      if (config.timeout > 0) deadlineAt = Math.min(deadlineAt ?? Infinity, clock.now() + config.timeout);
    }
    if (method === 'screenshot') {
      (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(envelope.target.frameId === 0, 'E_TOP_FRAME_REQUIRED');
      (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(args.length === 1, 'E_ARGUMENT_TYPE'); (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.options)(args[0], ['format', 'fullPage']);
      (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(args[0].fullPage === undefined || typeof args[0].fullPage === 'boolean', 'E_ARGUMENT_TYPE');
      (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(!args[0].fullPage, 'E_FULL_PAGE_UNSUPPORTED');
      (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(['png', 'jpeg'].includes(args[0].format), 'E_OPTION_UNSUPPORTED');
    }
    if (method === 'uploadFromUrl') { (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(args.length === 2, 'E_ARGUMENT_TYPE'); (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.selector)(args[0]); (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.httpURL)(args[1]); }
    const key = ownerKey(envelope.identity); (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(!retired.has(key), 'E_CANCELLED');
    let run = runs.get(key);
    if (!run) {
      run = {pending: new Set(), requests: new Set(), pages: new Map(), pageTargets: new Map(), waits: new Map(), userScriptsUnavailable: false}; runs.set(key, run);
    }
    (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(!run.requests.has(envelope.requestId), 'E_OPERATION_REPLAY'); run.requests.add(envelope.requestId);
    const controller = new AbortController(), state = {envelope, args, descriptor, run, controller, deadlineAt, recordReceipt, cleanups: []};
    const abort = () => controller.abort(signal.reason?.code ? signal.reason : error('E_CANCELLED'));
    let timer;
    if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, {once: true});
    if (deadlineAt !== null) timer = setTimeout(() => controller.abort(error('E_TIMEOUT')), Math.max(0, deadlineAt - clock.now()));
    run.pending.add(state);
    try {
      await permission(state, 'pre'); await verifyTarget(state);
      let result;
      if (kind === 'packaged') result = await packaged(state);
      else if (kind === 'user-script') result = await userScript(state);
      else if (['goto', 'reload'].includes(method)) result = await navigate(state);
      else if (method === 'screenshot') result = await screenshot(state);
      else if (method === 'uploadFromUrl') result = await uploadFromURL(state);
      else result = await cookieOperation(state);
      const reply = {requestId: envelope.requestId, value: (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.encodeValue)(result), ...(state.handoff ? {handoff: state.handoff} : {})};
      await saveReceipt(state, 'result', reply);
      await verifyTarget(state); await permission(state, 'pre');
      await permission(state, 'post'); guard(state); return reply;
    } catch (cause) {
      if (controller.signal.aborted) { const reason = controller.signal.reason; await cancel(envelope.identity); throw reason; }
      throw cause;
    } finally {
      clearTimeout(timer); signal?.removeEventListener('abort', abort); run.pending.delete(state);
      for (const dispose of state.cleanups.reverse()) dispose();
    }
  }
  return Object.freeze({execute, cancel});
}

function normalizeCookie(input, defaultURL, deleting, now) {
  let value;
  if (typeof input === 'string') {
    if (deleting) { (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(input && !/[;=\s]/.test(input), 'E_COOKIE_FORMAT'); value = {name: input, path: '/'}; }
    else {
      const [pair, ...attributes] = input.split(';'), index = pair.indexOf('=');
      (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(index > 0, 'E_COOKIE_FORMAT'); value = {name: pair.slice(0, index).trim(), value: pair.slice(index + 1).trim()};
      const seen = new Set();
      for (const attribute of attributes) {
        const index = attribute.indexOf('='), key = (index < 0 ? attribute : attribute.slice(0, index)).trim().toLowerCase();
        const text = index < 0 ? undefined : attribute.slice(index + 1).trim();
        (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(!seen.has(key), 'E_COOKIE_FORMAT'); seen.add(key);
        if (key === 'secure') { (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(text === undefined, 'E_COOKIE_FORMAT'); value.secure = true; }
        else if (key === 'path' || key === 'domain') { (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(text, 'E_COOKIE_FORMAT'); value[key] = text; }
        else if (key === 'samesite') value.sameSite = text;
        else if (key === 'expires') { const parsed = Date.parse(text); (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(Number.isFinite(parsed), 'E_COOKIE_FORMAT'); value.expires = parsed / 1000; }
        else if (key === 'max-age') { (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(/^-?\d+$/.test(text), 'E_COOKIE_FORMAT'); value.expirationDate = now / 1000 + Number(text); }
        else throw error(key === 'partitioned' ? 'E_COOKIE_PARTITION_UNSUPPORTED' : 'E_COOKIE_FORMAT');
      }
    }
  } else {
    (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(input && typeof input === 'object' && !Array.isArray(input), 'E_COOKIE_FORMAT'); value = {...input};
    (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(!Object.hasOwn(value, 'partitionKey') && !Object.hasOwn(value, 'partitioned'), 'E_COOKIE_PARTITION_UNSUPPORTED');
    for (const key of Object.keys(value)) (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(['name', 'value', 'url', 'domain', 'path', 'secure', 'httpOnly', 'sameSite',
      'expires', 'expirationDate', 'session', 'storeId', 'hostOnly'].includes(key), 'E_COOKIE_FORMAT');
  }
  (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(typeof value.name === 'string' && value.name && !/[;=\s\x00-\x1f\x7f]/.test(value.name), 'E_COOKIE_FORMAT');
  if (!deleting) (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(typeof value.value === 'string' && !/[;\r\n\x00]/.test(value.value), 'E_COOKIE_FORMAT');
  value.url = (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.httpURL)(value.url ?? defaultURL); const url = new URL(value.url);
  if (value.domain !== undefined) (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(typeof value.domain === 'string' && value.domain.replace(/^\./, '') === url.hostname, 'E_COOKIE_SCOPE');
  if (deleting && value.path === undefined) value.path = url.pathname.slice(0, url.pathname.lastIndexOf('/')) || '/';
  if (value.path !== undefined) (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(typeof value.path === 'string' && value.path.startsWith('/') && !/[;\r\n]/.test(value.path), 'E_COOKIE_FORMAT');
  if (deleting) { url.pathname = value.path; url.search = ''; url.hash = ''; value.url = url.href; }
  for (const key of ['secure', 'httpOnly', 'session', 'hostOnly']) if (value[key] !== undefined) (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(typeof value[key] === 'boolean', 'E_COOKIE_FORMAT');
  if (value.sameSite !== undefined) {
    const sites = {lax: 'lax', strict: 'strict', none: 'no_restriction', no_restriction: 'no_restriction', unspecified: 'unspecified'};
    (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(typeof value.sameSite === 'string' && Object.hasOwn(sites, value.sameSite.toLowerCase()), 'E_COOKIE_FORMAT'); value.sameSite = sites[value.sameSite.toLowerCase()];
  }
  if (value.expires !== undefined) { (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(Number.isFinite(value.expires), 'E_COOKIE_FORMAT'); value.expirationDate ??= value.expires; delete value.expires; }
  if (value.expirationDate !== undefined) (0,_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(Number.isFinite(value.expirationDate), 'E_COOKIE_FORMAT');
  return value;
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

/***/ "./src/framework/sdk/service.js":
/*!**************************************!*\
  !*** ./src/framework/sdk/service.js ***!
  \**************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   createSdkService: () => (/* binding */ createSdkService)
/* harmony export */ });
/* harmony import */ var _registry_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./registry.js */ "./src/framework/sdk/registry.js");
/* harmony import */ var _bridge_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./bridge.js */ "./src/framework/sdk/bridge.js");



// Called only after the unique broker has authenticated/admitted/journaled the request.
// The injected context and storage service belong to that broker, never the page payload.
function createSdkService({network, notifications, storage, device} = {}) {
  return Object.freeze({async execute(method, args, context) {
    args = (0,_registry_js__WEBPACK_IMPORTED_MODULE_0__.normalizeMethod)(method, args);
    let value;
    const httpMethod = {AXIOS_GET: 'GET', AXIOS_POST: 'POST', AXIOS_PUT: 'PUT', AXIOS_DELETE: 'DELETE'}[method];
    if (httpMethod) {
      if (!network) throw (0,_registry_js__WEBPACK_IMPORTED_MODULE_0__.fail)('E_RESOURCE_UNAVAILABLE');
      value = await network.request({method: httpMethod, ...args}, context);
    } else if (method.startsWith('APPSTORAGE_') || method.startsWith('APPLOCAL_') || method.startsWith('CHROME_LOCAL_')) {
      if (!storage?.executeSdk) throw (0,_registry_js__WEBPACK_IMPORTED_MODULE_0__.fail)('E_RESOURCE_UNAVAILABLE', 'Shared SDK storage adapter missing');
      value = await storage.executeSdk(method, args, context);
    } else if (method === 'CREATE_NOTIFY') {
      if (!notifications) throw (0,_registry_js__WEBPACK_IMPORTED_MODULE_0__.fail)('E_RESOURCE_UNAVAILABLE');
      value = await notifications.create(args, context);
    } else if (method === 'SERVER_CHECK') {
      if (!network) throw (0,_registry_js__WEBPACK_IMPORTED_MODULE_0__.fail)('E_RESOURCE_UNAVAILABLE');
      value = await network.checkServer(args, context);
    } else if (method === 'NETWORK_INFO_GET') {
      if (!network) throw (0,_registry_js__WEBPACK_IMPORTED_MODULE_0__.fail)('E_RESOURCE_UNAVAILABLE');
      value = await network.getIpInfo(args, context);
    } else if (method === 'DEVICE_GET_APP_ID') {
      if (!device?.getAppId) throw (0,_registry_js__WEBPACK_IMPORTED_MODULE_0__.fail)('E_RESOURCE_UNAVAILABLE', 'Shared atomic device namespace adapter missing');
      value = await device.getAppId(context);
    }
    return (0,_bridge_js__WEBPACK_IMPORTED_MODULE_1__.legacyResult)(value);
  }});
}


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

/***/ "./src/platform/chrome/cookies.js":
/*!****************************************!*\
  !*** ./src/platform/chrome/cookies.js ***!
  \****************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   createCookieService: () => (/* binding */ createCookieService),
/* harmony export */   extractDomainFromUrl: () => (/* binding */ extractDomainFromUrl)
/* harmony export */ });
/* harmony import */ var _framework_sdk_registry_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../framework/sdk/registry.js */ "./src/framework/sdk/registry.js");
/* harmony import */ var _tabs_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./tabs.js */ "./src/platform/chrome/tabs.js");



function extractDomainFromUrl(url) {
  if (typeof url !== 'string') throw (0,_framework_sdk_registry_js__WEBPACK_IMPORTED_MODULE_0__.fail)('E_SCHEMA');
  return new URL((0,_framework_sdk_registry_js__WEBPACK_IMPORTED_MODULE_0__.httpUrl)(/^https?:\/\//i.test(url) ? url : `http://${url}`)).hostname;
}
function createCookieService({api = globalThis.chrome, authorize} = {}) {
  const permission = async (url, method, phase, context) => {
    if (!authorize) throw (0,_framework_sdk_registry_js__WEBPACK_IMPORTED_MODULE_0__.fail)('E_PERMISSION');
    await authorize({capability: 'cookies', url: (0,_framework_sdk_registry_js__WEBPACK_IMPORTED_MODULE_0__.httpUrl)(url), method, phase}, context);
  };
  async function getCookies(url, context) {
    url = (0,_framework_sdk_registry_js__WEBPACK_IMPORTED_MODULE_0__.httpUrl)(url); await permission(url, 'get', 'pre', context);
    const cookies = await (0,_tabs_js__WEBPACK_IMPORTED_MODULE_1__.chromeCall)(api, api.cookies, 'getAll', {url});
    if (!Array.isArray(cookies)) throw (0,_framework_sdk_registry_js__WEBPACK_IMPORTED_MODULE_0__.fail)('E_CHROME', 'Missing native cookie read receipt');
    await permission(url, 'get', 'post', context);
    return cookies;
  }
  async function deleteCookiesByUrl(url, context) {
    const cookies = await getCookies(url, context);
    for (const cookie of cookies) {
      const cookieUrl = new URL(url); cookieUrl.pathname = cookie.path; cookieUrl.search = ''; cookieUrl.hash = '';
      await permission(cookieUrl.href, 'remove', 'pre', context);
      await (0,_tabs_js__WEBPACK_IMPORTED_MODULE_1__.chromeCall)(api, api.cookies, 'remove', {url: cookieUrl.href, name: cookie.name, ...(cookie.storeId ? {storeId: cookie.storeId} : {})});
      await permission(cookieUrl.href, 'remove', 'post', context);
    }
  }
  async function setCookies(cookies, context) {
    if (!Array.isArray(cookies) || cookies.length > 100) throw (0,_framework_sdk_registry_js__WEBPACK_IMPORTED_MODULE_0__.fail)('E_SCHEMA');
    // Validate the whole batch before producing any cookie side effect.
    const details = cookies.map(cookie => {
      (0,_framework_sdk_registry_js__WEBPACK_IMPORTED_MODULE_0__.fields)(cookie, ['url', 'name', 'value', 'domain', 'path', 'secure', 'httpOnly', 'sameSite', 'expirationDate', 'session', 'storeId', 'hostOnly']);
      if (typeof cookie.name !== 'string' || typeof cookie.value !== 'string') throw (0,_framework_sdk_registry_js__WEBPACK_IMPORTED_MODULE_0__.fail)('E_SCHEMA');
      const url = (0,_framework_sdk_registry_js__WEBPACK_IMPORTED_MODULE_0__.httpUrl)(cookie.url ?? `${cookie.secure ? 'https' : 'http'}://${String(cookie.domain ?? '').replace(/^\./, '')}${cookie.path ?? '/'}`);
      const host = new URL(url).hostname;
      const domain = cookie.domain?.replace(/^\./, '');
      if (domain !== undefined && domain !== host) throw (0,_framework_sdk_registry_js__WEBPACK_IMPORTED_MODULE_0__.fail)('E_SCHEMA', 'Cookie may not broaden authorized hostname');
      const item = {url, name: cookie.name, value: cookie.value};
      for (const name of ['path', 'secure', 'httpOnly', 'sameSite', 'storeId']) if (cookie[name] !== undefined) item[name] = cookie[name];
      if (cookie.domain !== undefined && cookie.hostOnly !== true) item.domain = cookie.domain;
      if (cookie.expirationDate !== undefined && cookie.session !== true) {
        if (!Number.isFinite(cookie.expirationDate)) throw (0,_framework_sdk_registry_js__WEBPACK_IMPORTED_MODULE_0__.fail)('E_SCHEMA'); item.expirationDate = cookie.expirationDate;
      }
      if (cookie.name.startsWith('__Host-')) {
        if (new URL(url).protocol !== 'https:') throw (0,_framework_sdk_registry_js__WEBPACK_IMPORTED_MODULE_0__.fail)('E_SCHEMA', '__Host- cookies require HTTPS');
        delete item.domain; item.path = '/'; item.secure = true;
      }
      return item;
    });
    for (const item of details) await permission(item.url, 'set', 'pre', context);
    for (const item of details) {
      await permission(item.url, 'set', 'pre', context);
      const receipt = await (0,_tabs_js__WEBPACK_IMPORTED_MODULE_1__.chromeCall)(api, api.cookies, 'set', item);
      if (!receipt) throw (0,_framework_sdk_registry_js__WEBPACK_IMPORTED_MODULE_0__.fail)('E_CHROME', 'Missing native cookie write receipt');
      await permission(item.url, 'set', 'post', context);
    }
  }
  return Object.freeze({getCookies, setCookies, deleteCookiesByUrl, extractDomainFromUrl});
}


/***/ }),

/***/ "./src/platform/chrome/network.js":
/*!****************************************!*\
  !*** ./src/platform/chrome/network.js ***!
  \****************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   createNetworkService: () => (/* binding */ createNetworkService)
/* harmony export */ });
/* harmony import */ var _framework_sdk_registry_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../framework/sdk/registry.js */ "./src/framework/sdk/registry.js");
/* harmony import */ var _framework_utils_network_info_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../framework/utils/network-info.js */ "./src/framework/utils/network-info.js");



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
      if (length > maxBytes) { await reader.cancel(); throw (0,_framework_sdk_registry_js__WEBPACK_IMPORTED_MODULE_0__.fail)('E_LIMIT', 'HTTP response exceeds byte budget'); }
      chunks.push(value);
    }
    if (signal.aborted) throw signal.reason;
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    try { return new TextDecoder('utf-8', {fatal: true}).decode(bytes); } catch { throw (0,_framework_sdk_registry_js__WEBPACK_IMPORTED_MODULE_0__.fail)('E_VALUE_SERIALIZATION', 'Invalid HTTP UTF8', {stage: 'utf8'}); }
  } finally { signal.removeEventListener('abort', cancel); reader.releaseLock(); }
}
function createNetworkService({fetchImpl = globalThis.fetch, authorize, clock = Date,
  maxResponseBytes = _framework_sdk_registry_js__WEBPACK_IMPORTED_MODULE_0__.SDK_LIMITS.responseBytes, setTimer = setTimeout, clearTimer = clearTimeout, networkInfoEnabled = false} = {}) {
  async function request({method, url, data, config}, context = {}) {
    if (!['GET', 'POST', 'PUT', 'DELETE'].includes(method)) throw (0,_framework_sdk_registry_js__WEBPACK_IMPORTED_MODULE_0__.fail)('E_SERVICE_UNSUPPORTED');
    const normalized = (0,_framework_sdk_registry_js__WEBPACK_IMPORTED_MODULE_0__.normalizeConfig)(config);
    if (data !== undefined) (0,_framework_sdk_registry_js__WEBPACK_IMPORTED_MODULE_0__.jsonValue)(data);
    const target = new URL((0,_framework_sdk_registry_js__WEBPACK_IMPORTED_MODULE_0__.httpUrl)(url));
    for (const [name, value] of Object.entries(normalized.params ?? {})) {
      if (value === null || value === undefined) continue;
      for (const item of Array.isArray(value) ? value : [value]) {
        if (item !== null && item !== undefined) target.searchParams.append(Array.isArray(value) ? `${name}[]` : name, String(item));
      }
    }
    if (!authorize) throw (0,_framework_sdk_registry_js__WEBPACK_IMPORTED_MODULE_0__.fail)('E_PERMISSION', 'HTTP driver requires broker authorization');
    if (context.signal?.aborted) throw (0,_framework_sdk_registry_js__WEBPACK_IMPORTED_MODULE_0__.fail)('E_CANCELLED');
    const controller = new AbortController();
    const abort = () => controller.abort((0,_framework_sdk_registry_js__WEBPACK_IMPORTED_MODULE_0__.fail)('E_CANCELLED'));
    context.signal?.addEventListener('abort', abort, {once: true});
    const timeout = Math.min(normalized.timeout ?? _framework_sdk_registry_js__WEBPACK_IMPORTED_MODULE_0__.SDK_LIMITS.serviceBudgetMs, _framework_sdk_registry_js__WEBPACK_IMPORTED_MODULE_0__.SDK_LIMITS.serviceBudgetMs,
      context.deadlineAt === undefined ? _framework_sdk_registry_js__WEBPACK_IMPORTED_MODULE_0__.SDK_LIMITS.maxTimeoutMs : context.deadlineAt - clock.now());
    if (timeout <= 0) { context.signal?.removeEventListener('abort', abort); throw (0,_framework_sdk_registry_js__WEBPACK_IMPORTED_MODULE_0__.fail)('E_TIMEOUT'); }
    const timer = setTimer(() => controller.abort((0,_framework_sdk_registry_js__WEBPACK_IMPORTED_MODULE_0__.fail)('E_TIMEOUT')), timeout);
    try {
      await abortable(authorize({capability: 'network', url: target.href, method, phase: 'pre'}, context), controller.signal);
      const headers = {...normalized.headers};
      let body;
      if (data !== undefined && ['POST', 'PUT'].includes(method)) {
        body = typeof data === 'string' ? data : JSON.stringify(data);
        if (new TextEncoder().encode(body).byteLength > _framework_sdk_registry_js__WEBPACK_IMPORTED_MODULE_0__.SDK_LIMITS.requestBytes) throw (0,_framework_sdk_registry_js__WEBPACK_IMPORTED_MODULE_0__.fail)('E_LIMIT');
        if (typeof data !== 'string' && !headers['content-type']) headers['content-type'] = 'application/json';
      }
      context.assertDispatch?.();
      const response = await fetchImpl(target.href, {method, headers, body, credentials: 'omit', redirect: 'manual', signal: controller.signal});
      if (response.type === 'opaque' || response.type === 'opaqueredirect') throw (0,_framework_sdk_registry_js__WEBPACK_IMPORTED_MODULE_0__.fail)('E_NETWORK', 'HTTP response is not observable');
      const text = await readBody(response, maxResponseBytes, controller.signal);
      let responseData = text;
      if (normalized.responseType === 'json') {
        try { responseData = text ? JSON.parse(text) : ''; } catch { throw (0,_framework_sdk_registry_js__WEBPACK_IMPORTED_MODULE_0__.fail)('E_VALUE_SERIALIZATION', 'Invalid HTTP JSON', {stage: 'json'}); }
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
      if (!response.ok) throw (0,_framework_sdk_registry_js__WEBPACK_IMPORTED_MODULE_0__.fail)('E_HTTP', `HTTP ${response.status}`, {status: response.status, response: projection});
      if (context.method?.startsWith('AXIOS_')) await context.recordEffect?.(projection);
      await abortable(authorize({capability: 'network', url: target.href, method, phase: 'post'}, context), controller.signal);
      if (controller.signal.aborted) throw controller.signal.reason;
      return projection;
    } catch (error) {
      if (controller.signal.aborted) throw controller.signal.reason;
      if (error?.code) throw error;
      throw (0,_framework_sdk_registry_js__WEBPACK_IMPORTED_MODULE_0__.fail)('E_NETWORK', 'HTTP transport failed');
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
    if (!networkInfoEnabled || !authorize) throw (0,_framework_sdk_registry_js__WEBPACK_IMPORTED_MODULE_0__.fail)('E_CAPABILITY', 'External network information is disabled');
    const url = ip ? `${_framework_utils_network_info_js__WEBPACK_IMPORTED_MODULE_1__.IP_INFO_URL}&ip=${ip}` : _framework_utils_network_info_js__WEBPACK_IMPORTED_MODULE_1__.IP_INFO_URL;
    await authorize({capability: 'network.info', url, method: 'GET', phase: 'pre'}, context);
    return (await request({method: 'GET', url, config: {}}, context)).data;
  }
  return Object.freeze({request, checkServer, getIpInfo});
}


/***/ }),

/***/ "./src/platform/chrome/notifications.js":
/*!**********************************************!*\
  !*** ./src/platform/chrome/notifications.js ***!
  \**********************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   createNotificationService: () => (/* binding */ createNotificationService)
/* harmony export */ });
/* harmony import */ var _framework_sdk_registry_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../framework/sdk/registry.js */ "./src/framework/sdk/registry.js");

function createNotificationService({api = globalThis.chrome, authorize, iconUrl, onLifecycle = () => {}} = {}) {
  const active = new Map(); let disposed = false;
  const emit = event => { try { onLifecycle(event); } catch { /* Receipt observation cannot repeat the effect. */ } };
  const onClosed = (notificationId, byUser) => {
    const context = active.get(notificationId); if (!context) return;
    active.delete(notificationId); emit({kind: 'closed', notificationId, byUser, requestId: context.requestId});
  };
  const onClicked = notificationId => {
    const context = active.get(notificationId); if (!context) return;
    emit({kind: 'clicked', notificationId, requestId: context.requestId});
    // CREATE_NOTIFY carries no URL; its click never opens a page.
    active.delete(notificationId); api.notifications.clear?.(notificationId, () => { void api.runtime?.lastError; });
  };
  api?.notifications?.onClosed?.addListener(onClosed);
  api?.notifications?.onClicked?.addListener(onClicked);
  return Object.freeze({async create({title, content}, context = {}) {
    if (disposed) throw (0,_framework_sdk_registry_js__WEBPACK_IMPORTED_MODULE_0__.fail)('E_CANCELLED');
    if (!authorize) throw (0,_framework_sdk_registry_js__WEBPACK_IMPORTED_MODULE_0__.fail)('E_PERMISSION', 'Notification driver requires broker authorization');
    await authorize({capability: 'notifications', phase: 'pre'}, context);
    context.assertDispatch?.();
    if (!api?.notifications?.create || !iconUrl) throw (0,_framework_sdk_registry_js__WEBPACK_IMPORTED_MODULE_0__.fail)('E_RESOURCE_UNAVAILABLE', 'Notification driver or fixed icon missing', {stage: 'lookup'});
    if (typeof title !== 'string' || typeof content !== 'string') throw (0,_framework_sdk_registry_js__WEBPACK_IMPORTED_MODULE_0__.fail)('E_SCHEMA');
    const notificationId = await new Promise((resolve, reject) => {
      try {
        api.notifications.create('', {type: 'basic', title, message: content, iconUrl}, notificationId => {
          const error = api.runtime?.lastError;
          if (error) reject((0,_framework_sdk_registry_js__WEBPACK_IMPORTED_MODULE_0__.fail)('E_NOTIFICATION', error.message));
          else if (typeof notificationId !== 'string' || !notificationId) reject((0,_framework_sdk_registry_js__WEBPACK_IMPORTED_MODULE_0__.fail)('E_NOTIFICATION', 'Missing native notification receipt'));
          else {
            if (!disposed) active.set(notificationId, context);
            emit({kind: 'created', notificationId, requestId: context.requestId, delivery: 'unobserved'});
            resolve(notificationId);
          }
        });
      } catch (error) { reject((0,_framework_sdk_registry_js__WEBPACK_IMPORTED_MODULE_0__.fail)('E_NOTIFICATION', error.message)); }
    });
    await context.recordNativeReceipt?.({notificationId});
    await context.recordEffect?.(undefined);
    await authorize({capability: 'notifications', phase: 'post'}, context);
    // Old createNotify resolves undefined. No page is opened on a notification click.
  }, dispose() {
    if (disposed) return; disposed = true;
    api?.notifications?.onClosed?.removeListener(onClosed); api?.notifications?.onClicked?.removeListener(onClicked); active.clear();
  }, diagnostics: () => ({active: active.size, disposed})});
}


/***/ }),

/***/ "./src/platform/chrome/tabs.js":
/*!*************************************!*\
  !*** ./src/platform/chrome/tabs.js ***!
  \*************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   checkLastError: () => (/* binding */ checkLastError),
/* harmony export */   chromeCall: () => (/* binding */ chromeCall),
/* harmony export */   createTabsService: () => (/* binding */ createTabsService)
/* harmony export */ });
/* harmony import */ var _framework_sdk_registry_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../framework/sdk/registry.js */ "./src/framework/sdk/registry.js");


function checkLastError(api = globalThis.chrome) {
  const error = api?.runtime?.lastError;
  if (error) throw (0,_framework_sdk_registry_js__WEBPACK_IMPORTED_MODULE_0__.fail)('E_CHROME', error.message);
}
function chromeCall(api, owner, method, ...args) {
  if (typeof owner?.[method] !== 'function') return Promise.reject((0,_framework_sdk_registry_js__WEBPACK_IMPORTED_MODULE_0__.fail)('E_CAPABILITY', `Chrome ${method} unavailable`));
  return new Promise((resolve, reject) => {
    try { owner[method](...args, value => { try { checkLastError(api); resolve(value); } catch (error) { reject(error); } }); }
    catch (error) { reject(error.code ? error : (0,_framework_sdk_registry_js__WEBPACK_IMPORTED_MODULE_0__.fail)('E_CHROME', error.message)); }
  });
}
// Fixed resource driver; target/permission ownership remains with the existing PagePort.
function createTabsService({api = globalThis.chrome, authorize} = {}) {
  return Object.freeze({async injectFixed({target, file, world}, context) {
    if (!authorize) throw (0,_framework_sdk_registry_js__WEBPACK_IMPORTED_MODULE_0__.fail)('E_PERMISSION');
    (0,_framework_sdk_registry_js__WEBPACK_IMPORTED_MODULE_0__.fields)(target, ['tabId', 'documentIds'], ['tabId', 'documentIds']);
    if (!target || !Number.isInteger(target.tabId) || target.tabId < 0 || !Array.isArray(target.documentIds) ||
      target.documentIds.length !== 1 || typeof target.documentIds[0] !== 'string' ||
      !((file === _framework_sdk_registry_js__WEBPACK_IMPORTED_MODULE_0__.SDK_FILES.relay && world === 'ISOLATED') || (file === _framework_sdk_registry_js__WEBPACK_IMPORTED_MODULE_0__.SDK_FILES.main && world === 'MAIN')))
      throw (0,_framework_sdk_registry_js__WEBPACK_IMPORTED_MODULE_0__.fail)('E_SCHEMA', 'Exact document and fixed world/resource required');
    await authorize({capability: 'sdk.inject', target, file, world, phase: 'pre'}, context);
    const result = await chromeCall(api, api.scripting, 'executeScript', {target, world, files: [file]});
    await authorize({capability: 'sdk.inject', target, file, world, phase: 'post'}, context);
    return result;
  }});
}


/***/ }),

/***/ "./src/platform/downloads/blob-lifecycle.js":
/*!**************************************************!*\
  !*** ./src/platform/downloads/blob-lifecycle.js ***!
  \**************************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   canReleaseBlob: () => (/* binding */ canReleaseBlob),
/* harmony export */   createHostBlobRegistry: () => (/* binding */ createHostBlobRegistry),
/* harmony export */   hashArtifactBytes: () => (/* binding */ hashArtifactBytes)
/* harmony export */ });
/* harmony import */ var _protocol_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../protocol.js */ "./src/platform/protocol.js");


async function hashArtifactBytes(bytes) {
  (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(bytes instanceof Uint8Array, 'E_SCHEMA', 'Artifact bytes must be Uint8Array');
  const hash = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function canReleaseBlob(attempt, now = Date.now(), { readerPinned = false } = {}) {
  if (readerPinned) return false;
  if (['complete', 'interrupted', 'abandoned'].includes(attempt.state)) return true;
  return attempt.downloadDeadline !== null && Number(now) >= Date.parse(attempt.downloadDeadline);
}

// RunHost owns this registry. Neither the SW nor the service creates object URLs.
function createHostBlobRegistry({ url = globalThis.URL, BlobClass = globalThis.Blob, clock = Date.now } = {}) {
  const resources = new Map();
  const used = new Set();
  const now = () => Number(typeof clock === 'function' ? clock() : clock.now());
  return Object.freeze({
    create(bytes, mime) {
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(bytes instanceof Uint8Array && bytes.byteLength <= _protocol_js__WEBPACK_IMPORTED_MODULE_0__.BUDGETS.maxArtifactBytes,
        'E_SCHEMA', 'Invalid artifact bytes');
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(['application/json', 'text/csv;charset=utf-8', 'text/plain;charset=utf-8', 'application/octet-stream'].includes(mime), 'E_SCHEMA', 'Invalid artifact MIME');
      const blobUrl = url.createObjectURL(new BlobClass([bytes.slice()], { type: mime }));
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(/^blob:chrome-extension:\/\//.test(blobUrl) && !used.has(blobUrl), 'E_TARGET', 'A fresh extension Blob URL is required');
      used.add(blobUrl);
      resources.set(blobUrl, { pins: 0 });
      return blobUrl;
    },
    pin(blobUrl) {
      const resource = resources.get(blobUrl);
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(resource, 'E_SCHEMA', 'Blob URL is unavailable');
      resource.pins++;
      let active = true;
      return () => { if (active) { active = false; resource.pins--; } };
    },
    release(attempt, options = {}) {
      const resource = resources.get(attempt.blobUrl);
      if (!resource) return false;
      if (!canReleaseBlob(attempt, now(), { readerPinned: options.readerPinned || resource.pins > 0 })) return false;
      url.revokeObjectURL(attempt.blobUrl);
      resources.delete(attempt.blobUrl);
      return true;
    },
    has(blobUrl) { return resources.has(blobUrl); },
  });
}


/***/ }),

/***/ "./src/platform/downloads/index.js":
/*!*****************************************!*\
  !*** ./src/platform/downloads/index.js ***!
  \*****************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   canReleaseBlob: () => (/* reexport safe */ _blob_lifecycle_js__WEBPACK_IMPORTED_MODULE_1__.canReleaseBlob),
/* harmony export */   createDownloadService: () => (/* binding */ createDownloadService),
/* harmony export */   createHostBlobRegistry: () => (/* reexport safe */ _blob_lifecycle_js__WEBPACK_IMPORTED_MODULE_1__.createHostBlobRegistry),
/* harmony export */   hashArtifactBytes: () => (/* reexport safe */ _blob_lifecycle_js__WEBPACK_IMPORTED_MODULE_1__.hashArtifactBytes)
/* harmony export */ });
/* harmony import */ var _protocol_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../protocol.js */ "./src/platform/protocol.js");
/* harmony import */ var _blob_lifecycle_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./blob-lifecycle.js */ "./src/platform/downloads/blob-lifecycle.js");
/* harmony import */ var _page_port_codec_js__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../page-port/codec.js */ "./src/platform/page-port/codec.js");






const STORES = ['runs', 'commandJournal', 'exportJobs', 'artifacts', 'downloadReceipts'];
const GENERIC_STORES = [...STORES, 'results'];
const generic = value => value?.kind === 'controller-artifact';
const artifactMimes = ['application/json', 'text/plain;charset=utf-8', 'application/octet-stream'];
const jobStates = ['preparing', 'ready', 'delivering', 'delivery_complete', 'delivery_partial', 'delivery_unknown', 'delivery_failed', 'abandoned'];
const id = value => (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(typeof value === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(value), 'E_SCHEMA', 'Invalid artifact id');
const key = (tag, id) => `${tag}:${id}`;
const intentKey = id => key('export-intent', id);
const pinId = id => key('export', id);
const pinKey = id => key('reader', pinId(id));
const terminal = state => ['complete', 'interrupted', 'abandoned', 'conflict'].includes(state);
const frozen = state => ['abandoned', 'conflict'].includes(state);
const iso = ms => new Date(ms).toISOString();
const copy = value => structuredClone(value);

function exact(value, fields) {
  (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(value && typeof value === 'object' && !Array.isArray(value), 'E_SCHEMA', 'Expected object');
  (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(Object.keys(value).length === fields.length && fields.every(f => Object.hasOwn(value, f)), 'E_SCHEMA', 'Unexpected request fields');
}

function filename(value) {
  (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(typeof value === 'string' && value.length > 0 && value.length <= 128 && !/[\\/\u0000-\u001f\u007f]/.test(value) && !['.', '..'].includes(value),
    'E_SCHEMA', 'Filename must be a safe basename');
}

function checkJob(job) {
  if (!generic(job)) return (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.validate)('ExportJob', job);
  exact(job, ['kind', 'exportJobId', 'runId', 'resultId', 'namespace', 'principal', 'format', 'artifactIds', 'activeAttemptIds', 'state']);
  for (const field of ['exportJobId', 'runId', 'resultId']) id(job[field]);
  (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(typeof job.namespace === 'string' && job.namespace && typeof job.principal === 'string' && job.principal &&
    ['typed-json', 'data'].includes(job.format) && jobStates.includes(job.state), 'E_SCHEMA', 'Invalid controller artifact job');
  (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(Array.isArray(job.artifactIds) && job.artifactIds.length === 1 && Array.isArray(job.activeAttemptIds) && job.activeAttemptIds.length <= 1,
    'E_SCHEMA', 'Generic job requires one artifact and at most one active attempt');
  for (const value of [...job.artifactIds, ...job.activeAttemptIds]) id(value);
  (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(job.activeAttemptIds.length > 0 || ['preparing', 'abandoned'].includes(job.state), 'E_SCHEMA', 'Missing active artifact attempt');
  return job;
}

function checkArtifact(artifact) {
  if (!generic(artifact)) return (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.validate)('Artifact', artifact);
  exact(artifact, ['kind', 'artifactId', 'exportJobId', 'runId', 'resultId', 'namespace', 'principal', 'format', 'mime', 'bytes', 'byteCount',
    'sha256', 'storageEncoding', 'chunkKeys', 'filename']);
  for (const field of ['artifactId', 'exportJobId', 'runId', 'resultId']) id(artifact[field]);
  filename(artifact.filename);
  (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(typeof artifact.namespace === 'string' && artifact.namespace && typeof artifact.principal === 'string' && artifact.principal &&
    ['typed-json', 'data'].includes(artifact.format) && artifactMimes.includes(artifact.mime) &&
    (artifact.format !== 'typed-json' || artifact.mime === 'application/json'), 'E_SCHEMA', 'Invalid generic artifact type');
  (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(Number.isSafeInteger(artifact.bytes) && artifact.bytes >= 0 && artifact.bytes <= _protocol_js__WEBPACK_IMPORTED_MODULE_0__.BUDGETS.maxArtifactBytes && artifact.byteCount === artifact.bytes &&
    /^[a-f0-9]{64}$/.test(artifact.sha256) && artifact.storageEncoding === 'Uint8Array-chunks', 'E_SCHEMA', 'Invalid generic artifact bytes');
  (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(Array.isArray(artifact.chunkKeys) && artifact.chunkKeys.length >= 1 && artifact.chunkKeys.length <= 64 &&
    new Set(artifact.chunkKeys).size === artifact.chunkKeys.length, 'E_SCHEMA', 'Artifact exceeds chunk budget');
  artifact.chunkKeys.forEach(id);
  return artifact;
}

function aggregate(job, attempts) {
  if (job.state === 'abandoned' || attempts.length === 0) return job;
  if (attempts.some(a => ['interrupted', 'conflict', 'abandoned'].includes(a.state))) job.state = 'delivery_failed';
  else if (attempts.every(a => a.state === 'complete')) job.state = 'delivery_complete';
  else if (attempts.some(a => ['mapping_unknown', 'deadline_unknown'].includes(a.state))) job.state = 'delivery_unknown';
  else if (attempts.every(a => a.state === 'prepared')) job.state = 'ready';
  else job.state = 'delivering';
  checkJob(job);
  return job;
}

function createDownloadService({ storage, api, clock = Date.now, assertHost }) {
  (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(storage?.transaction && api?.downloads && typeof assertHost === 'function', 'E_SCHEMA', 'Download service requires storage, Chrome API and host authentication');
  const extensionId = api.runtime?.id;
  (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(typeof extensionId === 'string' && extensionId.length > 0, 'E_TARGET', 'Extension identity is required');
  const pending = new Set();
  const failures = [];
  let detach = null;
  const now = () => {
    const ms = Number(typeof clock === 'function' ? clock() : clock.now());
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(Number.isSafeInteger(ms) && ms >= 0, 'E_SCHEMA', 'Invalid clock');
    return ms;
  };
  const transaction = (mode, callback) => storage.transaction(STORES, mode, callback);
  const genericTransaction = (mode, callback) => storage.transaction(GENERIC_STORES, mode, callback);
  const track = promise => {
    pending.add(promise);
    promise.catch(error => failures.push(error)).finally(() => pending.delete(promise));
  };
  const chromeCall = (name, argument) => new Promise((resolve, reject) => {
    const callback = value => {
      const error = api.runtime?.lastError;
      if (error) reject(new Error(error.message)); else resolve(value);
    };
    try {
      const result = api.downloads[name](argument, callback);
      if (result?.then) result.then(resolve, reject);
    } catch (error) { reject(error); }
  });

  async function liveRun(tx, runId) {
    const run = await tx.get('runs', runId);
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(run && !run.tombstoned && !(await tx.get('commandJournal', key('tombstone', runId))), 'E_TOMBSTONE', 'Run is deleted or unavailable');
    return run;
  }

  async function downloadRows(tx) {
    const rows = await tx.all('downloadReceipts');
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(rows.every(row => ['attempt', 'receipt', 'candidate'].includes(row?.tag)), 'E_SCHEMA', 'Unknown download record tag');
    return rows;
  }

  function hostMatches(auth, record) {
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(auth && ['registrationId', 'hostInstanceId', 'hostDocumentId', 'browserSessionIncarnation']
      .every(field => typeof record[field] === 'string' && auth[field] === record[field]), 'E_OWNER', 'Host registration does not own this export');
  }

  async function authenticate(sender, record) {
    const auth = await assertHost(sender, record.registrationId);
    hostMatches(auth, record);
    return auth;
  }

  async function currentGenericHost(tx, auth, sender) {
    const host = await tx.get('commandJournal', key('host', auth.registrationId));
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(host?.tag === 'host' && host.active === true && host.revoked === false &&
      host.hostDocumentId === sender?.documentId && host.hostUrl === sender?.url && host.hostTabId === (sender?.tab?.id ?? null),
    'E_OWNER', 'Registered host document changed before artifact transaction');
    hostMatches(auth, host);
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(typeof host.namespace === 'string' && host.namespace && typeof host.principal === 'string' && host.principal &&
      host.namespace === auth.namespace && host.principal === auth.principal, 'E_OWNER', 'Unique authority must issue a stable namespace and principal');
    return host;
  }

  async function controllerResult(tx, request, host) {
    const run = await liveRun(tx, request.runId);
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(run.tag === 'controller-run' && run.runId === request.runId && run.resultId === request.resultId &&
      run.namespace === host.namespace && run.principal === host.principal && run.browserSessionIncarnation === host.browserSessionIncarnation,
    'E_OWNER', 'Controller result belongs to another namespace or browser session');
    const result = await tx.get('results', request.resultId);
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(result?.tag === 'controller-result' && result.resultId === run.resultId && result.runId === run.runId &&
      result.namespace === host.namespace && result.principal === host.principal && JSON.stringify(result.revision) === JSON.stringify(run.revision),
    'E_OWNER', 'Durable controller result binding differs');
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(run.state === 'completed' && result.state === 'completed' && result.outcome?.ok === true && Object.hasOwn(result.outcome, 'valueWire'),
      'E_OWNER', 'Only a durable successful controller result can produce an artifact');
    return {run, result};
  }

  async function currentIntentHost(tx, auth, intent, sender) {
    hostMatches(auth, intent);
    if (generic(intent)) {
      const host = await currentGenericHost(tx, auth, sender);
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(host.namespace === intent.namespace && host.principal === intent.principal, 'E_OWNER', 'Artifact namespace has been fenced');
    }
  }

  // Artifact preparation reads the immutable result from the shared store. The
  // privileged worker persists bytes only; the owning host creates the Blob.
  async function prepareArtifact(request, sender) {
    exact(request, request?.format === 'data' ? ['requestId', 'runId', 'resultId', 'filename', 'format', 'data'] :
      ['requestId', 'runId', 'resultId', 'filename', 'format']);
    for (const field of ['requestId', 'runId', 'resultId']) id(request[field]);
    filename(request.filename);
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(['typed-json', 'data'].includes(request.format), 'E_SCHEMA', 'Unknown artifact format');
    request = copy(request);
    const auth = await assertHost(sender);
    const snapshot = await genericTransaction('readonly', async tx => {
      const host = await currentGenericHost(tx, auth, sender);
      return controllerResult(tx, request, host);
    });
    (0,_page_port_codec_js__WEBPACK_IMPORTED_MODULE_2__.decodeValue)(snapshot.result.outcome.valueWire);
    const sourceJson = JSON.stringify(snapshot.result);
    let chunks, mime;
    if (request.format === 'data') {
      exact(request.data, ['mime', 'blocks']);
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(artifactMimes.includes(request.data.mime) && Array.isArray(request.data.blocks) && request.data.blocks.length > 0 && request.data.blocks.length <= 64,
        'E_SCHEMA', 'Explicit artifact data requires an approved MIME and 1..64 blocks');
      chunks = request.data.blocks.map(block => (0,_page_port_codec_js__WEBPACK_IMPORTED_MODULE_2__.base64ToBytes)(block));
      mime = request.data.mime;
    } else {
      const bytes = new TextEncoder().encode(JSON.stringify({protocol: _page_port_codec_js__WEBPACK_IMPORTED_MODULE_2__.VALUE_PROTOCOL, runId: request.runId, resultId: request.resultId,
        valueWire: snapshot.result.outcome.valueWire}) + '\n');
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(bytes.byteLength <= _protocol_js__WEBPACK_IMPORTED_MODULE_0__.BUDGETS.maxArtifactBytes, 'E_LIMIT', 'Artifact exceeds 8 MiB');
      chunks = [];
      for (let offset = 0; offset < bytes.byteLength; offset += _protocol_js__WEBPACK_IMPORTED_MODULE_0__.BUDGETS.maxRawFrameBytes) chunks.push(bytes.slice(offset, offset + _protocol_js__WEBPACK_IMPORTED_MODULE_0__.BUDGETS.maxRawFrameBytes));
      mime = 'application/json';
    }
    const size = chunks.reduce((sum, bytes) => sum + bytes.byteLength, 0);
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(size <= _protocol_js__WEBPACK_IMPORTED_MODULE_0__.BUDGETS.maxArtifactBytes && chunks.length <= 64, 'E_LIMIT', 'Artifact exceeds 8 MiB/64 blocks');
    const requestCanonical = (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.canonical)(request);
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const exportJobId = (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.newId)(), artifactId = (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.newId)(), preparedAt = iso(now()), sha256 = await (0,_blob_lifecycle_js__WEBPACK_IMPORTED_MODULE_1__.hashArtifactBytes)(bytes);
    const resultSha256 = await (0,_blob_lifecycle_js__WEBPACK_IMPORTED_MODULE_1__.hashArtifactBytes)(new TextEncoder().encode(sourceJson));
    const artifact = checkArtifact({kind: 'controller-artifact', artifactId, exportJobId, runId: request.runId, resultId: request.resultId,
      namespace: auth.namespace, principal: auth.principal, format: request.format, mime, bytes: size, byteCount: size, sha256,
      storageEncoding: 'Uint8Array-chunks', chunkKeys: chunks.map((_, index) => key('chunk', `${artifactId}:${index}`)), filename: request.filename});
    const job = checkJob({kind: 'controller-artifact', exportJobId, runId: request.runId, resultId: request.resultId, namespace: auth.namespace,
      principal: auth.principal, format: request.format, artifactIds: [artifactId], activeAttemptIds: [], state: 'preparing'});
    const requestKey = key('export-request', (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.canonical)(['artifact', auth.registrationId, request.requestId]));
    return genericTransaction('readwrite', async tx => {
      const host = await currentGenericHost(tx, auth, sender), current = await controllerResult(tx, request, host);
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(JSON.stringify(current.result) === sourceJson, 'E_REQUEST_CONFLICT', 'Controller result changed before artifact commit');
      const previous = await tx.get('commandJournal', requestKey);
      if (previous) {
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(previous.requestCanonical === requestCanonical, 'E_REQUEST_CONFLICT', 'Artifact request ID has different content');
        const intent = await tx.get('commandJournal', intentKey(previous.exportJobId));
        await currentIntentHost(tx, auth, intent, sender);
        const row = await tx.get('artifacts', previous.artifactId);
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(row?.tag === 'artifact', 'E_SCHEMA', 'Prepared artifact is missing');
        checkArtifact(row.artifact);
        return {exportJobId: intent.exportJobId, artifactId: row.artifact.artifactId, artifact: copy(row.artifact), job: copy(await tx.get('exportJobs', intent.exportJobId))};
      }
      const runs = await tx.all('runs'), artifacts = await tx.all('artifacts'), journal = await tx.all('commandJournal');
      const stored = artifacts.filter(row => row.tag === 'artifact').reduce((sum, row) => sum + (row.artifact.byteCount ?? row.artifact.bytes), 0);
      const profile = stored + runs.reduce((sum, row) => sum + (row.storedBytes ?? 0), 0) +
        journal.filter(row => row.tag === 'migration-backup').reduce((sum, row) => sum + row.utf8Bytes, 0);
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(profile + size <= _protocol_js__WEBPACK_IMPORTED_MODULE_0__.BUDGETS.profileStoredBytes &&
        artifacts.filter(row => row.tag === 'artifact' && row.artifact.runId === request.runId).reduce((sum, row) => sum + row.artifact.bytes, 0) + size <= _protocol_js__WEBPACK_IMPORTED_MODULE_0__.BUDGETS.maxStoredBytes,
      'E_QUOTA', 'Artifact exceeds shared storage budget');
      const intent = {tag: 'export-intent', kind: 'controller-artifact', exportJobId, runId: request.runId, resultId: request.resultId,
        resultSha256, namespace: host.namespace, principal: host.principal, registrationId: host.registrationId, hostInstanceId: host.hostInstanceId,
        hostDocumentId: host.hostDocumentId, browserSessionIncarnation: host.browserSessionIncarnation,
        ownerEpochAtCreation: current.run.ownerEpoch, preparedAt, frozen: false, readerPinId: pinId(exportJobId)};
      await tx.put('commandJournal', intent, intentKey(exportJobId));
      await tx.put('commandJournal', {tag: 'reader-pin', readerPinId: pinId(exportJobId), runId: request.runId, resultId: request.resultId,
        exportJobId, released: false, createdAt: Date.parse(preparedAt)}, pinKey(exportJobId));
      await tx.put('artifacts', {tag: 'artifact', artifact}, artifactId);
      for (const [index, chunk] of chunks.entries()) await tx.put('artifacts', {tag: 'artifact-chunk', parentArtifactId: artifactId,
        exportJobId, runId: request.runId, bytes: chunk}, artifact.chunkKeys[index]);
      await tx.put('exportJobs', job, exportJobId);
      await tx.put('commandJournal', {tag: 'export-request', requestCanonical, exportJobId, artifactId}, requestKey);
      return {exportJobId, artifactId, artifact: copy(artifact), job: copy(job)};
    });
  }

  async function prepareAttempt(request, sender) {
    exact(request, ['requestId', 'artifactId', 'blobUrl']); id(request.requestId); id(request.artifactId);
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(typeof request.blobUrl === 'string' && request.blobUrl.startsWith(`blob:chrome-extension://${extensionId}/`) &&
      request.blobUrl.length > `blob:chrome-extension://${extensionId}/`.length && !/[\u0000-\u0020\u007f]/.test(request.blobUrl),
    'E_SCHEMA', 'RunHost must provide a fresh same-extension Blob URL');
    request = copy(request);
    const read = await readArtifact({artifactId: request.artifactId}, sender);
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(generic(read.artifact), 'E_SCHEMA', 'Generic attempt requires a generic artifact');
    const intent = await transaction('readonly', tx => tx.get('commandJournal', intentKey(read.artifact.exportJobId)));
    const auth = await authenticate(sender, intent), requestCanonical = (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.canonical)(request);
    const requestKey = key('export-request', (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.canonical)(['attempt', auth.registrationId, request.requestId])), at = now();
    return genericTransaction('readwrite', async tx => {
      const storedIntent = await tx.get('commandJournal', intentKey(intent.exportJobId));
      await currentIntentHost(tx, auth, storedIntent, sender);
      const binding = await controllerResult(tx, storedIntent, auth);
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(await (0,_blob_lifecycle_js__WEBPACK_IMPORTED_MODULE_1__.hashArtifactBytes)(new TextEncoder().encode(JSON.stringify(binding.result))) === storedIntent.resultSha256,
        'E_HASH', 'Controller result changed after artifact preparation');
      const descriptor = await tx.get('artifacts', request.artifactId);
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(descriptor?.tag === 'artifact' && JSON.stringify(descriptor.artifact) === JSON.stringify(read.artifact), 'E_HASH', 'Artifact changed before attempt commit');
      // Recheck bytes within the attempt transaction; a corruption between read
      // and commit cannot acquire native dispatch authority.
      let offset = 0;
      for (const chunkKey of read.artifact.chunkKeys) {
        const chunk = await tx.get('artifacts', chunkKey);
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(chunk?.tag === 'artifact-chunk' && chunk.parentArtifactId === request.artifactId && chunk.exportJobId === intent.exportJobId &&
          chunk.bytes instanceof Uint8Array && chunk.bytes.length <= _protocol_js__WEBPACK_IMPORTED_MODULE_0__.BUDGETS.maxRawFrameBytes && offset + chunk.bytes.length <= read.bytes.length &&
          chunk.bytes.every((byte, index) => byte === read.bytes[offset + index]), 'E_HASH', 'Artifact bytes changed before attempt commit');
        offset += chunk.bytes.length;
      }
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(offset === read.bytes.length, 'E_HASH', 'Artifact byte count changed');
      const previous = await tx.get('commandJournal', requestKey);
      if (previous) {
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(previous.requestCanonical === requestCanonical, 'E_REQUEST_CONFLICT', 'Attempt request ID has different content');
        const row = await tx.get('downloadReceipts', key('attempt', previous.attemptId));
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(row?.tag === 'attempt' && row.attempt.artifactId === request.artifactId, 'E_SCHEMA', 'Prepared attempt is missing');
        return copy(row.attempt);
      }
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(!storedIntent.frozen && at >= Date.parse(storedIntent.preparedAt), 'E_OWNER', 'Artifact is abandoned or its clock is fenced');
      const job = checkJob(await tx.get('exportJobs', intent.exportJobId));
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(job.state !== 'abandoned' && job.artifactIds[0] === request.artifactId, 'E_OWNER', 'Artifact job is unavailable');
      const rows = await downloadRows(tx);
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(!rows.some(row => row.tag === 'attempt' && row.attempt.blobUrl === request.blobUrl), 'E_SCHEMA', 'Each attempt requires a fresh Blob URL');
      for (const attemptId of job.activeAttemptIds) {
        const row = await tx.get('downloadReceipts', key('attempt', attemptId));
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(row?.tag === 'attempt' && (0,_blob_lifecycle_js__WEBPACK_IMPORTED_MODULE_1__.canReleaseBlob)(row.attempt, at), 'E_OWNER', 'Previous download still needs its artifact');
      }
      const attempt = {attemptId: (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.newId)(), exportJobId: intent.exportJobId, runId: intent.runId, artifactId: request.artifactId,
        artifactHash: read.artifact.sha256, artifactBytes: read.artifact.bytes, rowCount: 0,
        hostInstanceId: auth.hostInstanceId, hostDocumentId: auth.hostDocumentId, ownerEpochAtCreation: storedIntent.ownerEpochAtCreation,
        blobUrl: request.blobUrl, filename: read.artifact.filename, preparedAt: iso(at), dispatchAt: null, mappingDeadline: null, downloadDeadline: null,
        state: 'prepared', downloadId: null, resourceReleasedAt: null, timedOutAt: null, candidateDownloadIds: [], mappedAt: null, submissionCount: 0};
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.validate)('DownloadAttempt', attempt);
      job.activeAttemptIds = [attempt.attemptId]; job.state = 'ready';
      await tx.put('exportJobs', checkJob(job), job.exportJobId);
      await tx.put('downloadReceipts', {tag: 'attempt', attempt, callbackDownloadId: null, lastObservedAt: null, attemptId: attempt.attemptId,
        exportJobId: attempt.exportJobId, runId: attempt.runId, artifactId: attempt.artifactId, state: attempt.state, fullBlobUrl: attempt.blobUrl,
        mappingSearchCount: 0, nextMappingSearchAt: null}, key('attempt', attempt.attemptId));
      const pin = await tx.get('commandJournal', pinKey(job.exportJobId));
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(pin?.tag === 'reader-pin', 'E_SCHEMA', 'Artifact reader pin is missing');
      await tx.put('commandJournal', {...pin, released: false, releasedAt: null}, pinKey(job.exportJobId));
      await tx.put('commandJournal', {tag: 'export-request', requestCanonical, exportJobId: job.exportJobId, artifactId: request.artifactId,
        attemptId: attempt.attemptId}, requestKey);
      return copy(attempt);
    });
  }

  async function projection(tx, row) {
    return { attempt: copy(row.attempt), receipt: copy((await tx.get('downloadReceipts', key('receipt', row.attempt.attemptId)))?.receipt ?? null),
      job: copy(await tx.get('exportJobs', row.attempt.exportJobId) ?? null) };
  }

  async function saveAttempt(tx, row, observedAt) {
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.validate)('DownloadAttempt', row.attempt);
    Object.assign(row, { attemptId: row.attempt.attemptId, exportJobId: row.attempt.exportJobId, runId: row.attempt.runId,
      artifactId: row.attempt.artifactId, state: row.attempt.state, fullBlobUrl: row.attempt.blobUrl });
    if (row.attempt.downloadId === null) delete row.boundDownloadId;
    else row.boundDownloadId = row.attempt.downloadId;
    await tx.put('downloadReceipts', row, key('attempt', row.attempt.attemptId));
    const job = await tx.get('exportJobs', row.attempt.exportJobId);
    if (!job) return;
    const attempts = [];
    for (const id of job.activeAttemptIds) {
      const record = await tx.get('downloadReceipts', key('attempt', id));
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(record?.tag === 'attempt', 'E_SCHEMA', 'Missing active download attempt');
      attempts.push(record.attempt);
    }
    await tx.put('exportJobs', aggregate(job, attempts), job.exportJobId);
    if (attempts.every(a => (0,_blob_lifecycle_js__WEBPACK_IMPORTED_MODULE_1__.canReleaseBlob)(a, Date.parse(observedAt)))) {
      const pin = await tx.get('commandJournal', pinKey(job.exportJobId));
      if (pin && !pin.released) await tx.put('commandJournal', { ...pin, released: true, releasedAt: Date.parse(observedAt) }, pinKey(job.exportJobId));
    }
  }

  async function prepareExport(request, sender) {
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.validate)('ExportRequest', request);
    const snapshot = await transaction('readonly', tx => liveRun(tx, request.runId));
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(snapshot.tag !== 'controller-run', 'E_SCHEMA', 'Controller results require prepareArtifact');
    const auth = await authenticate(sender, snapshot);
    const requestCanonical = (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.canonical)(request);
    const exportJobId = (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.newId)();
    const preparedAt = iso(now());
    return transaction('readwrite', async tx => {
      const run = await liveRun(tx, request.runId);
      hostMatches(auth, run);
      const requestKey = key('export-request', request.requestId);
      const previous = await tx.get('commandJournal', requestKey);
      if (previous) {
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(previous.requestCanonical === requestCanonical, 'E_REVISION', 'Export request ID already has different content');
        const intent = await tx.get('commandJournal', intentKey(previous.exportJobId));
        hostMatches(auth, intent);
        return copy(intent);
      }
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(run.state === 'completed' || request.partialConfirmed === true, 'E_SEMANTIC', 'Partial export must be confirmed');
      const intent = { tag: 'export-intent', exportJobId, runId: run.runId, templateHash: run.templateHash,
        sealWatermark: run.commitSeq, committedCount: run.committedCount, format: request.format, csvMode: request.csvMode,
        partial: run.state !== 'completed', registrationId: auth.registrationId, hostInstanceId: auth.hostInstanceId,
        hostDocumentId: auth.hostDocumentId, browserSessionIncarnation: auth.browserSessionIncarnation,
        ownerEpochAtCreation: run.ownerEpoch, preparedAt, frozen: false, readerPinId: pinId(exportJobId) };
      await tx.put('commandJournal', intent, intentKey(exportJobId));
      await tx.put('commandJournal', { tag: 'reader-pin', readerPinId: pinId(exportJobId), runId: run.runId,
        sealWatermark: run.commitSeq, committedCount: run.committedCount, committedPages: run.committedPages,
        exportJobId, released: false, createdAt: Date.parse(preparedAt) }, pinKey(exportJobId));
      await tx.put('commandJournal', { tag: 'export-request', requestCanonical, exportJobId }, requestKey);
      return copy(intent);
    });
  }

  async function buildVolumes(intent, volumes) {
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(Array.isArray(volumes) && volumes.length > 0 && volumes.length <= _protocol_js__WEBPACK_IMPORTED_MODULE_0__.BUDGETS.maxRecords + 1, 'E_SCHEMA', 'Nonempty bounded volumes required');
    const result = [];
    const urls = new Set();
    for (const [volumeIndex, volume] of volumes.entries()) {
      exact(volume, ['bytes', 'filename', 'blobUrl', 'rowCount']);
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(volume.bytes instanceof Uint8Array && volume.bytes.byteLength <= _protocol_js__WEBPACK_IMPORTED_MODULE_0__.BUDGETS.maxArtifactBytes, 'E_SCHEMA', 'Invalid artifact bytes');
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(typeof volume.filename === 'string' && volume.filename.length > 0 && !/[\\/\u0000-\u001f]/.test(volume.filename) && !['.', '..'].includes(volume.filename), 'E_SCHEMA', 'Invalid download filename');
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(typeof volume.blobUrl === 'string' && volume.blobUrl.startsWith(`blob:chrome-extension://${extensionId}/`) && !urls.has(volume.blobUrl), 'E_TARGET', 'A unique fresh extension Blob URL is required');
      urls.add(volume.blobUrl);
      const bytes = volume.bytes.slice();
      const artifactId = (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.newId)();
      const artifact = { artifactId, exportJobId: intent.exportJobId, volumeIndex, format: intent.format,
        mime: intent.format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json', bytes: bytes.byteLength,
        rowCount: volume.rowCount, sha256: await (0,_blob_lifecycle_js__WEBPACK_IMPORTED_MODULE_1__.hashArtifactBytes)(bytes), storageEncoding: 'Uint8Array-chunks',
        chunkKeys: [key('chunk', artifactId)], filename: volume.filename, templateHash: intent.templateHash, sealWatermark: intent.sealWatermark };
      const attempt = { attemptId: (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.newId)(), exportJobId: intent.exportJobId, runId: intent.runId, artifactId,
        artifactHash: artifact.sha256, artifactBytes: artifact.bytes, rowCount: artifact.rowCount, hostInstanceId: intent.hostInstanceId,
        hostDocumentId: intent.hostDocumentId, ownerEpochAtCreation: intent.ownerEpochAtCreation, blobUrl: volume.blobUrl,
        filename: artifact.filename, preparedAt: iso(now()), dispatchAt: null, mappingDeadline: null, downloadDeadline: null,
        state: 'prepared', downloadId: null, resourceReleasedAt: null, timedOutAt: null, candidateDownloadIds: [], mappedAt: null, submissionCount: 0 };
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.validate)('Artifact', artifact);
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.validate)('DownloadAttempt', attempt);
      result.push({ artifact, attempt, bytes });
    }
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(result.reduce((sum, v) => sum + v.artifact.rowCount, 0) === intent.committedCount, 'E_SEMANTIC', 'Artifact row counts differ from pinned export');
    return result;
  }

  async function storeVolumes(tx, intent, built) {
    const existing = await tx.get('exportJobs', intent.exportJobId);
    if (existing) {
      const attempts = [], artifacts = [];
      for (const id of existing.artifactIds) artifacts.push((await tx.get('artifacts', id)).artifact);
      for (const id of existing.activeAttemptIds) attempts.push((await tx.get('downloadReceipts', key('attempt', id))).attempt);
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(artifacts.length === built.length && artifacts.every((a, i) => a.sha256 === built[i].artifact.sha256 && a.rowCount === built[i].artifact.rowCount && a.filename === built[i].artifact.filename && attempts[i].blobUrl === built[i].attempt.blobUrl), 'E_REVISION', 'Prepared export cannot be changed');
      return { job: copy(existing), artifacts: copy(artifacts), attempts: copy(attempts) };
    }
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(!intent.frozen, 'E_OWNER', 'Export submission authority is frozen');
    const rows = await downloadRows(tx);
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(built.every(v => !rows.some(r => r.tag === 'attempt' && r.attempt.blobUrl === v.attempt.blobUrl)), 'E_DOWNLOAD_MAPPING', 'Blob URLs cannot be reused');
    const job = { exportJobId: intent.exportJobId, runId: intent.runId, templateHash: intent.templateHash,
      sealWatermark: intent.sealWatermark, committedCount: intent.committedCount, format: intent.format, csvMode: intent.csvMode,
      partial: intent.partial, artifactIds: built.map(v => v.artifact.artifactId), activeAttemptIds: built.map(v => v.attempt.attemptId), state: 'ready' };
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.validate)('ExportJob', job);
    for (const { artifact, attempt, bytes } of built) {
      await tx.put('artifacts', { tag: 'artifact', artifactId: artifact.artifactId, exportJobId: artifact.exportJobId, artifact }, artifact.artifactId);
      await tx.put('artifacts', { tag: 'artifact-chunk', artifactId: artifact.chunkKeys[0], parentArtifactId: artifact.artifactId,
        exportJobId: artifact.exportJobId, bytes }, artifact.chunkKeys[0]);
      await tx.put('downloadReceipts', { tag: 'attempt', attempt, callbackDownloadId: null, lastObservedAt: null,
        attemptId: attempt.attemptId, exportJobId: attempt.exportJobId, runId: attempt.runId, artifactId: attempt.artifactId,
        state: attempt.state, fullBlobUrl: attempt.blobUrl, mappingSearchCount: 0, nextMappingSearchAt: null }, key('attempt', attempt.attemptId));
    }
    await tx.put('exportJobs', job, job.exportJobId);
    return { job: copy(job), artifacts: built.map(v => copy(v.artifact)), attempts: built.map(v => copy(v.attempt)) };
  }

  async function prepareAttempts(request, sender) {
    exact(request, ['exportJobId', 'volumes']);
    const intent = await transaction('readonly', tx => tx.get('commandJournal', intentKey(request.exportJobId)));
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(intent?.tag === 'export-intent', 'E_SCHEMA', 'Export intent is missing');
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(!generic(intent), 'E_SCHEMA', 'Controller artifacts require prepareAttempt');
    const auth = await authenticate(sender, intent);
    const built = await buildVolumes(intent, request.volumes);
    return transaction('readwrite', async tx => {
      const stored = await tx.get('commandJournal', intentKey(intent.exportJobId));
      hostMatches(auth, stored);
      await liveRun(tx, intent.runId);
      return storeVolumes(tx, stored, built);
    });
  }

  async function readArtifact(request, sender) {
    exact(request, ['artifactId']);
    const { artifactId } = request;
    const descriptor = await transaction('readonly', tx => tx.get('artifacts', artifactId));
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(descriptor?.tag === 'artifact', 'E_SCHEMA', 'Artifact is missing');
    checkArtifact(descriptor.artifact);
    const intent = await transaction('readonly', tx => tx.get('commandJournal', intentKey(descriptor.artifact.exportJobId)));
    const auth = await authenticate(sender, intent);
    const readTransaction = generic(descriptor.artifact) ? genericTransaction : transaction;
    let resultBytes, expectedResultHash;
    const bytes = await readTransaction('readonly', async tx => {
      await liveRun(tx, intent.runId);
      const currentIntent = await tx.get('commandJournal', intentKey(intent.exportJobId));
      await currentIntentHost(tx, auth, currentIntent, sender);
      const current = await tx.get('artifacts', artifactId);
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(current?.tag === 'artifact' && JSON.stringify(current.artifact) === JSON.stringify(descriptor.artifact), 'E_HASH', 'Artifact descriptor changed');
      if (generic(descriptor.artifact)) {
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(generic(currentIntent) && descriptor.artifact.runId === currentIntent.runId && descriptor.artifact.resultId === currentIntent.resultId &&
          descriptor.artifact.namespace === currentIntent.namespace && descriptor.artifact.principal === currentIntent.principal,
        'E_OWNER', 'Artifact provenance differs from its export intent');
        const binding = await controllerResult(tx, currentIntent, auth);
        resultBytes = new TextEncoder().encode(JSON.stringify(binding.result)); expectedResultHash = currentIntent.resultSha256;
      }
      const output = new Uint8Array(descriptor.artifact.bytes);
      let offset = 0;
      for (const chunkKey of descriptor.artifact.chunkKeys) {
        const chunk = await tx.get('artifacts', chunkKey);
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(chunk?.tag === 'artifact-chunk' && chunk.parentArtifactId === artifactId && chunk.exportJobId === intent.exportJobId &&
          chunk.bytes instanceof Uint8Array && offset + chunk.bytes.length <= output.length &&
          (!generic(descriptor.artifact) || chunk.bytes.length <= _protocol_js__WEBPACK_IMPORTED_MODULE_0__.BUDGETS.maxRawFrameBytes), 'E_SCHEMA', 'Artifact chunk missing or oversized');
        output.set(chunk.bytes, offset); offset += chunk.bytes.length;
      }
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(offset === output.length, 'E_SCHEMA', 'Artifact byte count mismatch');
      return output;
    });
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(await (0,_blob_lifecycle_js__WEBPACK_IMPORTED_MODULE_1__.hashArtifactBytes)(bytes) === descriptor.artifact.sha256, 'E_HASH', 'Artifact bytes changed');
    if (resultBytes) (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(await (0,_blob_lifecycle_js__WEBPACK_IMPORTED_MODULE_1__.hashArtifactBytes)(resultBytes) === expectedResultHash, 'E_HASH', 'Controller result changed after artifact preparation');
    return { artifact: descriptor.artifact, bytes };
  }

  async function dispatchDownload(request, sender) {
    exact(request, ['attemptId']);
    const snapshot = await transaction('readonly', tx => tx.get('downloadReceipts', key('attempt', request.attemptId)));
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(snapshot?.tag === 'attempt', 'E_SCHEMA', 'Download attempt is missing');
    const intent = await transaction('readonly', tx => tx.get('commandJournal', intentKey(snapshot.attempt.exportJobId)));
    const auth = await authenticate(sender, intent);
    const at = now();
    const dispatched = await transaction('readwrite', async tx => {
      const row = await tx.get('downloadReceipts', key('attempt', request.attemptId));
      const storedIntent = await tx.get('commandJournal', intentKey(row.attempt.exportJobId));
      await currentIntentHost(tx, auth, storedIntent, sender);
      await liveRun(tx, row.attempt.runId);
      if (row.attempt.submissionCount === 1) return null;
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(!storedIntent.frozen && row.attempt.state === 'prepared', 'E_OWNER', 'Attempt cannot be submitted');
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(at >= Date.parse(row.attempt.preparedAt), 'E_SEMANTIC', 'Clock moved backwards');
      Object.assign(row.attempt, { state: 'dispatched', submissionCount: 1, dispatchAt: iso(at),
        mappingDeadline: iso(at + _protocol_js__WEBPACK_IMPORTED_MODULE_0__.BUDGETS.mappingWindowMs), downloadDeadline: iso(at + _protocol_js__WEBPACK_IMPORTED_MODULE_0__.BUDGETS.downloadDeadlineMs) });
      await saveAttempt(tx, row, iso(at));
      return copy(row.attempt);
    });
    // Only the invocation that committed prepared -> dispatched has call authority.
    if (dispatched) track(submit(dispatched));
    return { accepted: true, state: 'dispatched' };
  }

  async function submit(attempt) {
    let downloadId;
    try { downloadId = await chromeCall('download', { url: attempt.blobUrl, filename: attempt.filename, conflictAction: 'uniquify', saveAs: false }); }
    catch { return; } // A rejected/lost callback does not prove that Chrome made no file.
    if (!Number.isSafeInteger(downloadId) || downloadId < 0) return;
    await transaction('readwrite', async tx => {
      const row = await tx.get('downloadReceipts', key('attempt', attempt.attemptId));
      if (!row) return;
      if (row.callbackDownloadId !== null && row.callbackDownloadId !== downloadId) row.attempt.state = frozen(row.attempt.state) ? row.attempt.state : 'conflict';
      row.callbackDownloadId = downloadId;
      await saveAttempt(tx, row, iso(now()));
    });
    await reconcileDownload({ attemptId: attempt.attemptId });
  }

  function match(item, attempt) {
    const started = Date.parse(item?.startTime);
    return Number.isSafeInteger(item?.id) && item.id >= 0 && item.url === attempt.blobUrl && item.byExtensionId === extensionId &&
      Number.isFinite(started) && started >= Date.parse(attempt.dispatchAt) - 2000 && started <= Date.parse(attempt.mappingDeadline);
  }

  function candidate(item) {
    return { tag: 'candidate', downloadId: item.id, fullBlobUrl: item.url, byExtensionId: item.byExtensionId,
      startTime: item.startTime, state: item.state, interruptReason: typeof item.error === 'string' ? item.error : null };
  }

  async function reconcileDownload(request, options = {}) {
    const { evidence = 'search', force = false } = options;
    exact(request, ['attemptId']);
    const at = now();
    const snapshot = await transaction('readonly', tx => tx.get('downloadReceipts', key('attempt', request.attemptId)));
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(snapshot?.tag === 'attempt', 'E_SCHEMA', 'Download attempt is missing');
    const a = snapshot.attempt;
    // The broker passes the actual sender as the second argument. Internal
    // Chrome callbacks/recovery pass evidence options, and must still reconcile
    // durable native receipts after an owning host disappears.
    const sender = typeof options.documentId === 'string' ? options : null;
    let publicAuth, publicIntent;
    if (sender) {
      const intent = await transaction('readonly', tx => tx.get('commandJournal', intentKey(a.exportJobId)));
      if (generic(intent)) { publicIntent = intent; publicAuth = await authenticate(sender, intent); }
    }
    const fence = async tx => {
      if (publicAuth) await currentIntentHost(tx, publicAuth, await tx.get('commandJournal', intentKey(publicIntent.exportJobId)), sender);
    };
    if (publicAuth) await transaction('readonly', fence);
    if (a.submissionCount === 0 || (terminal(a.state) && !frozen(a.state))) return transaction('readonly', async tx => {
      await fence(tx); return projection(tx, snapshot);
    });
    const knownId = snapshot.callbackDownloadId ?? a.downloadId;
    const deadlineDue = at >= Date.parse(a.downloadDeadline) && a.state !== 'deadline_unknown';
    const mappingDue = at >= Date.parse(a.mappingDeadline) && a.state === 'dispatched';
    const throttled = knownId === null && !force && !deadlineDue && !mappingDue && at < (snapshot.nextMappingSearchAt ?? 0);
    let items = [], searched = false;
    if (!throttled) {
      try {
        items = await chromeCall('search', knownId === null
          ? { url: a.blobUrl, startedAfter: iso(Date.parse(a.dispatchAt) - 2001), startedBefore: iso(Date.parse(a.mappingDeadline) + 1), limit: 0 }
          : { id: knownId });
        searched = Array.isArray(items);
        if (!searched) items = [];
      } catch { /* A failed search is unknown evidence. */ }
    }
    return transaction('readwrite', async tx => {
      await fence(tx);
      const row = await tx.get('downloadReceipts', key('attempt', request.attemptId));
      if (!row) return { attempt: null, receipt: null, job: null };
      const attempt = row.attempt;
      if (terminal(attempt.state) && !frozen(attempt.state)) return projection(tx, row);
      const run = await tx.get('runs', attempt.runId);
      const deleted = !run || run.tombstoned || Boolean(await tx.get('commandJournal', key('tombstone', attempt.runId)));
      if (deleted && !terminal(attempt.state)) attempt.state = 'abandoned';
      const backwards = at < Date.parse(attempt.dispatchAt) || (row.lastObservedAt !== null && at < Date.parse(row.lastObservedAt));
      const matches = new Map();
      const candidates = await downloadRows(tx);
      for (const c of candidates) {
        if (c.tag === 'candidate' && match({ id: c.downloadId, url: c.fullBlobUrl, byExtensionId: c.byExtensionId, startTime: c.startTime }, attempt))
          matches.set(c.downloadId, { id: c.downloadId });
      }
      const verified = new Map();
      if (!backwards) for (const item of items) {
        if (match(item, attempt)) {
          matches.set(item.id, item); verified.set(item.id, item);
          await tx.put('downloadReceipts', candidate(item), key('candidate', item.id));
        }
      }
      attempt.candidateDownloadIds = [...matches.keys()].sort((x, y) => x - y);
      const authoritativeId = row.callbackDownloadId ?? attempt.downloadId;
      const conflicting = matches.size > 1 || candidates.some(c => c.tag === 'attempt' && c.attempt.attemptId !== attempt.attemptId &&
        c.attempt.downloadId !== null && matches.has(c.attempt.downloadId)) ||
        (authoritativeId !== null && [...matches.keys()].some(id => id !== authoritativeId)) ||
        (row.callbackDownloadId !== null && attempt.downloadId !== null && row.callbackDownloadId !== attempt.downloadId) ||
        items.some(item => item?.id === authoritativeId && !match(item, attempt));
      if (conflicting && !frozen(attempt.state)) attempt.state = 'conflict';
      let item = null;
      if (!backwards && !conflicting && matches.size === 1) {
        const id = [...matches.keys()][0];
        item = verified.get(id) ?? null; // onCreated alone never establishes a receipt.
        if (item && !frozen(attempt.state) && !deleted) {
          attempt.downloadId = id;
          attempt.mappedAt ??= iso(at);
        }
      }
      if (item && ['in_progress', 'complete', 'interrupted'].includes(item.state)) {
        const receipt = { attemptId: attempt.attemptId, downloadId: item.id, observedState: item.state, observedAt: iso(at), evidence,
          byExtensionId: extensionId, late: Boolean(attempt.timedOutAt || attempt.state === 'mapping_unknown' || at >= Date.parse(attempt.downloadDeadline)),
          browserDownloadComplete: item.state === 'complete', diskHashVerified: false,
          interruptReason: item.state === 'interrupted' && typeof item.error === 'string' ? item.error : null };
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.validate)('Receipt', receipt);
        const prior = await tx.get('downloadReceipts', key('receipt', attempt.attemptId));
        if (!prior || prior.receipt.observedState === 'in_progress') await tx.put('downloadReceipts', { tag: 'receipt', receipt }, key('receipt', attempt.attemptId));
        if (!frozen(attempt.state) && !deleted) attempt.state = item.state;
      }
      if (!terminal(attempt.state)) {
        if (at >= Date.parse(attempt.downloadDeadline)) {
          attempt.state = 'deadline_unknown'; attempt.timedOutAt ??= iso(at);
        } else if (attempt.downloadId === null && at >= Date.parse(attempt.mappingDeadline)) {
          attempt.state = 'mapping_unknown'; attempt.timedOutAt ??= iso(at);
        }
      }
      if (!backwards) row.lastObservedAt = iso(at);
      if (!throttled) {
        row.mappingSearchCount++;
        row.nextMappingSearchAt = at + (at >= Date.parse(attempt.mappingDeadline) ? 60000 : 1000);
      }
      await saveAttempt(tx, row, iso(at));
      return projection(tx, row);
    });
  }

  async function handleCreated(item) {
    if (!Number.isSafeInteger(item?.id) || item.id < 0 || item.byExtensionId !== extensionId || typeof item.url !== 'string' || !Number.isFinite(Date.parse(item.startTime))) return;
    const ids = await transaction('readwrite', async tx => {
      const rows = await downloadRows(tx);
      const attempts = rows.filter(r => r.tag === 'attempt' && r.attempt.submissionCount === 1 && match(item, r.attempt));
      if (attempts.length) await tx.put('downloadReceipts', candidate(item), key('candidate', item.id));
      return attempts.map(r => r.attempt.attemptId);
    });
    for (const attemptId of ids) await reconcileDownload({ attemptId }, { force: true });
  }

  async function handleChanged(delta) {
    if (!Number.isSafeInteger(delta?.id) || delta.id < 0) return;
    const ids = await transaction('readonly', async tx => (await downloadRows(tx)).filter(r => r.tag === 'attempt' &&
      (r.attempt.downloadId === delta.id || r.callbackDownloadId === delta.id || r.attempt.candidateDownloadIds.includes(delta.id))).map(r => r.attempt.attemptId));
    for (const attemptId of ids) await reconcileDownload({ attemptId }, { evidence: 'onChanged+search', force: true });
  }

  function attach() {
    if (detach) return detach;
    const created = item => { track(handleCreated(item)); };
    const changed = delta => { track(handleChanged(delta)); };
    api.downloads.onCreated.addListener(created);
    api.downloads.onChanged.addListener(changed);
    detach = () => { api.downloads.onCreated.removeListener(created); api.downloads.onChanged.removeListener(changed); detach = null; };
    return detach;
  }

  async function reconcilePending() {
    const at = now();
    const ids = await transaction('readonly', async tx => (await downloadRows(tx)).filter(r => r.tag === 'attempt' && r.attempt.submissionCount === 1 &&
      (!['complete', 'interrupted', 'abandoned', 'conflict', 'deadline_unknown'].includes(r.attempt.state) ||
        (r.attempt.state === 'conflict' && at >= Date.parse(r.attempt.downloadDeadline) &&
          Date.parse(r.lastObservedAt ?? r.attempt.dispatchAt) < Date.parse(r.attempt.downloadDeadline)))).map(r => r.attempt.attemptId));
    const results = [];
    for (const attemptId of ids) results.push(await reconcileDownload({ attemptId }));
    return results;
  }

  // Call only after registry.release(attempt) returned true (or authenticated
  // RunHost observed that its document already revoked the URL). This is an
  // acknowledgment from the owning packaged host, not SW create/revoke work.
  async function recordResourceRelease(request, sender) {
    exact(request, ['attemptId']);
    const snapshot = await transaction('readonly', tx => tx.get('downloadReceipts', key('attempt', request.attemptId)));
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(snapshot?.tag === 'attempt', 'E_SCHEMA', 'Download attempt is missing');
    const intent = await transaction('readonly', tx => tx.get('commandJournal', intentKey(snapshot.attempt.exportJobId)));
    const auth = await authenticate(sender, intent);
    const at = now();
    return transaction('readwrite', async tx => {
      const row = await tx.get('downloadReceipts', key('attempt', request.attemptId));
      await currentIntentHost(tx, auth, await tx.get('commandJournal', intentKey(row.attempt.exportJobId)), sender);
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(at >= Date.parse(row.lastObservedAt ?? row.attempt.preparedAt), 'E_SEMANTIC', 'Clock moved backwards');
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)((0,_blob_lifecycle_js__WEBPACK_IMPORTED_MODULE_1__.canReleaseBlob)(row.attempt, at), 'E_OWNER', 'Blob is still needed by an active download');
      row.attempt.resourceReleasedAt ??= iso(at);
      await saveAttempt(tx, row, iso(at));
      return copy(row.attempt);
    });
  }

  async function retryExport(request, sender, { blobUrls } = {}) {
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.validate)('RetryExportRequest', request);
    const old = await transaction('readonly', async tx => ({ job: await tx.get('exportJobs', request.exportJobId), intent: await tx.get('commandJournal', intentKey(request.exportJobId)) }));
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(old.job && old.intent, 'E_SCHEMA', 'Original export is missing');
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(!generic(old.job), 'E_SCHEMA', 'Controller artifacts retry through prepareAttempt with a fresh Blob URL');
    const auth = await authenticate(sender, old.intent);
    const requestCanonical = (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.canonical)(request);
    const requestKey = key('export-request', request.requestId);
    const prior = await transaction('readonly', tx => tx.get('commandJournal', requestKey));
    if (prior) {
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(prior.requestCanonical === requestCanonical, 'E_REVISION', 'Retry request ID conflict');
      return transaction('readonly', async tx => {
        await liveRun(tx, old.job.runId);
        const job = await tx.get('exportJobs', prior.exportJobId);
        return { newExportJobId: job.exportJobId, attemptIds: [...job.activeAttemptIds] };
      });
    }
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(Array.isArray(blobUrls) && blobUrls.length === old.job.artifactIds.length, 'E_SCHEMA', 'RunHost must supply one fresh Blob URL per retry volume');
    const newExportJobId = (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.newId)();
      const newIntent = { ...old.intent, exportJobId: newExportJobId, frozen: false, preparedAt: iso(now()), readerPinId: pinId(newExportJobId) };
    const volumes = [];
    for (const [i, artifactId] of old.job.artifactIds.entries()) {
      const { artifact, bytes } = await readArtifact({ artifactId }, sender);
      volumes.push({ bytes, rowCount: artifact.rowCount, filename: artifact.filename, blobUrl: blobUrls[i] });
    }
    const built = await buildVolumes(newIntent, volumes);
    return transaction('readwrite', async tx => {
      await liveRun(tx, old.job.runId);
      const storedIntent = await tx.get('commandJournal', intentKey(old.job.exportJobId));
      hostMatches(auth, storedIntent);
      const duplicate = await tx.get('commandJournal', requestKey);
      if (duplicate) {
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(duplicate.requestCanonical === requestCanonical, 'E_REVISION', 'Retry request ID conflict');
        const job = await tx.get('exportJobs', duplicate.exportJobId);
        return { newExportJobId: job.exportJobId, attemptIds: [...job.activeAttemptIds] };
      }
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)((await tx.get('exportJobs', old.job.exportJobId)).state !== 'abandoned', 'E_OWNER', 'Abandoned export cannot be retried');
      const result = await storeVolumes(tx, newIntent, built);
      await tx.put('commandJournal', { ...storedIntent, frozen: true }, intentKey(old.job.exportJobId));
      await tx.put('commandJournal', newIntent, intentKey(newExportJobId));
      const oldPin = await tx.get('commandJournal', pinKey(old.job.exportJobId));
      await tx.put('commandJournal', { tag: 'reader-pin', readerPinId: pinId(newExportJobId), runId: newIntent.runId,
        sealWatermark: newIntent.sealWatermark, committedCount: newIntent.committedCount, committedPages: oldPin?.committedPages ?? 0,
        exportJobId: newExportJobId, released: false, createdAt: Date.parse(newIntent.preparedAt) }, pinKey(newExportJobId));
      await tx.put('commandJournal', { tag: 'export-request', requestCanonical, exportJobId: newExportJobId }, requestKey);
      return { newExportJobId, attemptIds: result.job.activeAttemptIds };
    });
  }

  async function abandonJob(tx, job, at, wholeJob) {
    if (wholeJob) job.state = 'abandoned';
    await tx.put('exportJobs', job, job.exportJobId);
    const intent = await tx.get('commandJournal', intentKey(job.exportJobId));
    if (intent) await tx.put('commandJournal', { ...intent, frozen: true }, intentKey(job.exportJobId));
    // A generic retry retains earlier attempts in this job for late receipts.
    // Explicit abandonment also fences that history for shared run deletion.
    const attemptIds = generic(job) ? (await downloadRows(tx)).filter(row => row.tag === 'attempt' && row.attempt.exportJobId === job.exportJobId)
      .map(row => row.attempt.attemptId) : job.activeAttemptIds;
    for (const id of attemptIds) {
      const row = await tx.get('downloadReceipts', key('attempt', id));
      if (!row || terminal(row.attempt.state)) continue;
      row.attempt.state = 'abandoned';
      await saveAttempt(tx, row, at);
    }
    const pin = await tx.get('commandJournal', pinKey(job.exportJobId));
    if (pin) await tx.put('commandJournal', { ...pin, released: true, releasedAt: Date.parse(at) }, pinKey(job.exportJobId));
  }

  async function abandonExport(request, sender) {
    exact(request, ['exportJobId', 'explicitUserAction']);
    const { exportJobId, explicitUserAction } = request;
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(explicitUserAction === true, 'E_OWNER', 'Explicit abandon action required');
    const intent = await transaction('readonly', tx => tx.get('commandJournal', intentKey(exportJobId)));
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(intent, 'E_SCHEMA', 'Export intent is missing');
    const auth = await authenticate(sender, intent);
    const at = iso(now());
    return transaction('readwrite', async tx => {
      await currentIntentHost(tx, auth, await tx.get('commandJournal', intentKey(exportJobId)), sender);
      await liveRun(tx, intent.runId);
      const job = await tx.get('exportJobs', exportJobId);
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(job, 'E_SCHEMA', 'Export job is missing');
      await abandonJob(tx, job, at, true);
      return copy(await tx.get('exportJobs', exportJobId));
    });
  }

  // Internal foundation deletion hook. Caller fences/retireTarget first. This
  // never creates/deletes runs or releases @slot.
  async function abandonRun(request) {
    exact(request, ['runId']);
    const { runId } = request;
    const at = iso(now());
    return transaction('readwrite', async tx => {
      const run = await tx.get('runs', runId);
      const slot = await tx.get('runs', '@slot');
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(run?.tombstoned || await tx.get('commandJournal', key('tombstone', runId)) ||
        (run?.retirementState === 'released' && ['completed', 'limit_reached', 'stopped', 'failed', 'interrupted', 'abandoned_unknown'].includes(run.state) && slot?.currentRunId !== runId), 'E_OWNER', 'Deletion fence is required');
      for (const job of await tx.all('exportJobs')) if (job.runId === runId) await abandonJob(tx, job, at, true);
      for (const record of await tx.all('commandJournal')) if (record.tag === 'export-intent' && record.runId === runId) {
        await tx.put('commandJournal', { ...record, frozen: true }, intentKey(record.exportJobId));
        const pin = await tx.get('commandJournal', pinKey(record.exportJobId));
        if (pin) await tx.put('commandJournal', { ...pin, released: true, releasedAt: Date.parse(at) }, pinKey(record.exportJobId));
      }
      return { runId, abandoned: true };
    });
  }

  async function drain() {
    while (pending.size) await Promise.allSettled([...pending]);
    if (failures.length) throw failures.shift();
  }

  return Object.freeze({ prepareArtifact, prepareAttempt, prepareExport, prepareAttempts, readArtifact, dispatchDownload, reconcileDownload,
    reconcilePending, recordResourceRelease, retryExport, abandonExport, abandonRun, handleCreated, handleChanged, attach, drain });
}


/***/ }),

/***/ "./src/platform/entitlement/crypto.js":
/*!********************************************!*\
  !*** ./src/platform/entitlement/crypto.js ***!
  \********************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   AUDIENCE: () => (/* binding */ AUDIENCE),
/* harmony export */   POLICY_VERSION: () => (/* binding */ POLICY_VERSION),
/* harmony export */   TRUSTED_KEYS: () => (/* binding */ TRUSTED_KEYS),
/* harmony export */   createSignatureVerifier: () => (/* binding */ createSignatureVerifier),
/* harmony export */   entitlementSigningPayload: () => (/* binding */ entitlementSigningPayload),
/* harmony export */   revocationSigningPayload: () => (/* binding */ revocationSigningPayload)
/* harmony export */ });
/* harmony import */ var _protocol_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../protocol.js */ "./src/platform/protocol.js");


// No issuer has been provisioned for this product. Never ship a test trust key here.
const TRUSTED_KEYS = Object.freeze({});
const AUDIENCE = 'opendesk-browser';
const POLICY_VERSION = '1.0.0';

function entitlementSigningPayload(claim) {
  const {signature, verification, verifiedAt, lastTrustedTime, ...payload} = claim;
  return payload;
}

function revocationSigningPayload(evidence) {
  const {signature, ...payload} = evidence;
  return payload;
}

function validTime(value) {
  if (typeof value !== 'string') return false;
  const parts = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)(?:\.\d+)?(Z|([+-])(\d\d):(\d\d))$/.exec(value);
  if (!parts || !Number.isFinite(Date.parse(value))) return false;
  const [, year, month, day, hours, minutes, seconds, zone, , offsetHours, offsetMinutes] = parts;
  const date = new Date(0); date.setUTCFullYear(+year, +month - 1, +day);
  return date.getUTCFullYear() === +year && date.getUTCMonth() === +month - 1 && date.getUTCDate() === +day &&
    +hours < 24 && +minutes < 60 && +seconds < 60 && (zone === 'Z' || (+offsetHours < 24 && +offsetMinutes < 60));
}

function signatureBytes(signature) {
  (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(typeof signature === 'string' && /^[A-Za-z0-9_-]{86}$/.test(signature),
    'E_ENTITLEMENT', 'Expected a 64-byte unpadded base64url P1363 signature');
  const binary = atob(signature.replace(/-/g, '+').replace(/_/g, '/') + '==');
  (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(binary.length === 64 && btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') === signature,
    'E_ENTITLEMENT', 'Noncanonical signature encoding');
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

function createSignatureVerifier(keys = TRUSTED_KEYS) {
  const allowlist = new Map();
  for (const [keyId, entry] of Object.entries(keys)) {
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(/^[A-Za-z0-9._:-]{1,128}$/.test(keyId) && entry && typeof entry.issuer === 'string' && entry.issuer.length > 0 && entry.jwk,
      'E_ENTITLEMENT', 'Trust entries require keyId and issuer');
    const jwk = JSON.parse(JSON.stringify(entry.jwk));
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(jwk.kty === 'EC' && jwk.crv === 'P-256' && !Object.hasOwn(jwk, 'd'),
      'E_ENTITLEMENT', 'Only P-256 public JWKs may enter the trust allowlist');
    allowlist.set(keyId, {issuer: entry.issuer, jwk});
  }
  const imported = new Map();
  async function verify(payload, signature, subject) {
    const trusted = allowlist.get(payload.keyId);
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(trusted && payload.issuer === trusted.issuer && payload.subject === subject && payload.audience === AUDIENCE,
      'E_ENTITLEMENT', 'Untrusted key, issuer, subject or audience');
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(payload.formatVersion === POLICY_VERSION && Number.isSafeInteger(payload.revocationVersion) && payload.revocationVersion >= 0,
      'E_ENTITLEMENT', 'Invalid claim version');
    const bytes = signatureBytes(signature);
    try {
      if (!imported.has(payload.keyId)) imported.set(payload.keyId, globalThis.crypto.subtle.importKey(
        'jwk', trusted.jwk, {name: 'ECDSA', namedCurve: 'P-256'}, false, ['verify']));
      const key = await imported.get(payload.keyId);
      const valid = await globalThis.crypto.subtle.verify({name: 'ECDSA', hash: 'SHA-256'}, key,
        bytes, new TextEncoder().encode((0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.canonical)(payload)));
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(valid, 'E_ENTITLEMENT', 'Invalid entitlement signature');
    } catch (error) {
      if (error instanceof _protocol_js__WEBPACK_IMPORTED_MODULE_0__.FoundationError) throw error;
      throw new _protocol_js__WEBPACK_IMPORTED_MODULE_0__.FoundationError('E_ENTITLEMENT', 'Signature verification unavailable or public key invalid');
    }
  }
  return {
    async claim(claim, subject) {
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.validate)('Entitlement', claim);
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(claim.tier === 'pro', 'E_ENTITLEMENT', 'Pro requires a signed claim');
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(validTime(claim.issuedAt) && validTime(claim.expiresAt), 'E_ENTITLEMENT', 'Invalid signed timestamp');
      await verify(entitlementSigningPayload(claim), claim.signature, subject);
    },
    async revocation(evidence, subject) {
      const fields = ['kind', 'formatVersion', 'audience', 'issuer', 'subject', 'keyId', 'revocationVersion', 'issuedAt', 'signature'];
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(evidence && Object.keys(evidence).length === fields.length && fields.every(field => Object.hasOwn(evidence, field)) &&
        evidence.kind === 'entitlement-revocation' && validTime(evidence.issuedAt),
      'E_ENTITLEMENT', 'Invalid signed revocation evidence');
      await verify(revocationSigningPayload(evidence), evidence.signature, subject);
    }
  };
}


/***/ }),

/***/ "./src/platform/entitlement/index.js":
/*!*******************************************!*\
  !*** ./src/platform/entitlement/index.js ***!
  \*******************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   OFFLINE_GRACE_MS: () => (/* binding */ OFFLINE_GRACE_MS),
/* harmony export */   TRUSTED_KEYS: () => (/* reexport safe */ _crypto_js__WEBPACK_IMPORTED_MODULE_1__.TRUSTED_KEYS),
/* harmony export */   createEntitlementService: () => (/* binding */ createEntitlementService),
/* harmony export */   entitlementSigningPayload: () => (/* reexport safe */ _crypto_js__WEBPACK_IMPORTED_MODULE_1__.entitlementSigningPayload),
/* harmony export */   revocationSigningPayload: () => (/* reexport safe */ _crypto_js__WEBPACK_IMPORTED_MODULE_1__.revocationSigningPayload)
/* harmony export */ });
/* harmony import */ var _protocol_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../protocol.js */ "./src/platform/protocol.js");
/* harmony import */ var _crypto_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./crypto.js */ "./src/platform/entitlement/crypto.js");




const OFFLINE_GRACE_MS = 259200000;
const CAPABILITIES = Object.freeze(['dom.top.v1', 'read.text.v1', 'read.attribute.v1', 'transform.safe.v1',
  'pagination.none.v1', 'pagination.next-link.v1', 'pagination.next-button.v1', 'page.stage-seal.v1', 'download.receipt.v1']);
const LIMIT_KEYS = ['maxPages', 'maxRecords', 'maxDurationMs', 'maxStoredBytes'];
const copy = value => structuredClone(value);
const iso = ms => new Date(ms).toISOString();
function freeze(value) {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
  return value;
}
function timestamp(value) {
  (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(Number.isSafeInteger(value) && value >= 0 && value <= 253402300799999,
    'E_ENTITLEMENT', 'Clock must supply epoch milliseconds');
  return value;
}
function limitsFor(limits, tier) {
  (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(limits && Object.keys(limits).length === LIMIT_KEYS.length && LIMIT_KEYS.every(key =>
    Number.isSafeInteger(limits[key]) && limits[key] > 0), 'E_ENTITLEMENT', 'Invalid requested limits');
  const result = Object.fromEntries(LIMIT_KEYS.map(key => [key, Math.min(limits[key], _protocol_js__WEBPACK_IMPORTED_MODULE_0__.BUDGETS[key],
    key === 'maxPages' && tier === 'free' ? 1 : key === 'maxRecords' && tier === 'free' ? 100 : _protocol_js__WEBPACK_IMPORTED_MODULE_0__.BUDGETS[key])]));
  (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.validate)('Limits', result);
  return result;
}

// clock.trustedNow is supplied only by a trusted verification transport, never by a runtime message.
// A function clock is a wall clock only and cannot establish or refresh trusted Pro verification.
function createEntitlementService({storage, clock, keys, subject}) {
  (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(storage && typeof storage.transaction === 'function' && typeof subject === 'string' && subject.length > 0,
    'E_ENTITLEMENT', 'Storage and a bound subject are required');
  const time = typeof clock === 'function' ? {now: clock} : clock ?? {
    now: () => Date.now(), monotonicNow: () => performance.now()
  };
  (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(typeof time.now === 'function', 'E_ENTITLEMENT', 'clock.now is required');
  const verifier = (0,_crypto_js__WEBPACK_IMPORTED_MODULE_1__.createSignatureVerifier)(keys);
  const monotonicNow = time.monotonicNow ? () => time.monotonicNow() : () => performance.now();
  const issuedSnapshots = new WeakMap();
  let anchor = null;
  let queue = Promise.resolve();
  const serial = action => { const result = queue.then(action); queue = result.catch(() => {}); return result; };
  const initial = () => ({kind: 'entitlement-policy', version: 1, subject, revision: 0, claim: null, claimHash: null,
    verifiedAtMs: null, lastTrustedTimeMs: 0, lastWallTimeMs: null, rollback: false,
    revocationVersion: 0, revokedThrough: -1, revocation: null});
  async function read() {
    return storage.transaction(['entitlements'], 'readonly', async tx => (await tx.get('entitlements', subject)) ?? initial());
  }
  function observe(row) {
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(row.kind === 'entitlement-policy' && row.version === 1 && row.subject === subject,
      'E_ENTITLEMENT', 'Unexpected entitlement persistence record');
    const wall = timestamp(time.now());
    const sampledMono = monotonicNow();
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(Number.isFinite(sampledMono) && sampledMono >= 0, 'E_ENTITLEMENT', 'Invalid monotonic clock');
    const mono = Math.floor(sampledMono);
    let now = Math.max(wall, row.lastTrustedTimeMs);
    let regressed = row.lastWallTimeMs !== null && wall < row.lastWallTimeMs;
    if (anchor) {
      regressed ||= wall < anchor.wall || mono < anchor.mono;
      now = Math.max(now, anchor.now + Math.max(0, mono - anchor.mono));
    }
    timestamp(now);
    anchor = {wall, mono, now, regressed};
    row.lastWallTimeMs = Math.max(wall, row.lastWallTimeMs ?? wall);
    row.lastTrustedTimeMs = now;
    row.rollback ||= regressed;
    return now;
  }
  async function commit(expected, update, resetRollbackAt) {
    return storage.transaction(['entitlements'], 'readwrite', async tx => {
      const current = (await tx.get('entitlements', subject)) ?? initial();
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(current.revision === expected.revision, 'E_ENTITLEMENT', 'Entitlement changed; retry admission');
      // Observation must never overwrite a newer high-water mark from another host.
      update.lastWallTimeMs = Math.max(update.lastWallTimeMs ?? 0, current.lastWallTimeMs ?? 0);
      update.lastTrustedTimeMs = Math.max(update.lastTrustedTimeMs, current.lastTrustedTimeMs);
      if (resetRollbackAt !== undefined) (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(resetRollbackAt >= current.lastTrustedTimeMs,
        'E_ENTITLEMENT', 'Trusted refresh predates a concurrent clock observation');
      else update.rollback ||= current.rollback;
      observe(update);
      await tx.put('entitlements', update, subject);
      return update;
    });
  }
  async function evaluated() {
    const before = await read();
    const row = copy(before);
    observe(row);
    let reason = 'no-claim';
    let tier = 'free';
    if (row.claim) {
      try {
        await verifier.claim(row.claim, subject);
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(await (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.digest)((0,_crypto_js__WEBPACK_IMPORTED_MODULE_1__.entitlementSigningPayload)(row.claim)) === row.claimHash, 'E_ENTITLEMENT', 'Cached claim changed');
        if (row.revocation) await verifier.revocation(row.revocation, subject);
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(row.revokedThrough < 0 || (row.revocation && row.revocation.revocationVersion === row.revokedThrough),
          'E_ENTITLEMENT', 'Missing signed revocation');
        reason = null;
      } catch { reason = 'invalid-signature-or-claims'; }
    }
    await commit(before, row);
    const now = row.lastTrustedTimeMs;
    // Crypto and transaction admission can take time: classify only after the final observation.
    if (row.claim && reason === null) {
        const issuedAt = Date.parse(row.claim.issuedAt), expiresAt = Date.parse(row.claim.expiresAt);
        if (row.rollback) reason = 'clock-rollback';
        else if (!Number.isSafeInteger(issuedAt) || !Number.isSafeInteger(expiresAt) || issuedAt >= expiresAt || issuedAt > now) reason = 'invalid-time';
        else if (now >= expiresAt) reason = 'expired';
        else if (row.claim.revocationVersion < row.revocationVersion || row.claim.revocationVersion <= row.revokedThrough) reason = 'revoked';
        else if (row.verifiedAtMs === null || row.verifiedAtMs > now || row.verifiedAtMs < issuedAt) reason = 'no-trusted-verification';
        else if (now - row.verifiedAtMs > OFFLINE_GRACE_MS) reason = 'offline-grace-exceeded';
        else { tier = 'pro'; reason = null; }
    }
    return {row, now, tier, reason};
  }
  function asEntitlement(state) {
    const {row, now, tier} = state;
    const result = tier === 'pro' ? {...copy(row.claim), verification: 'ecdsa-p256-sha256',
      verifiedAt: iso(row.verifiedAtMs), lastTrustedTime: iso(now)} : {
      tier: 'free', issuer: 'opendesk-browser.local', subject, features: [...CAPABILITIES],
      issuedAt: iso(0), expiresAt: '9999-12-31T23:59:59.999Z', verifiedAt: iso(now), signature: null, keyId: null,
      verification: 'local-free', revocationVersion: row.revocationVersion, formatVersion: _crypto_js__WEBPACK_IMPORTED_MODULE_1__.POLICY_VERSION,
      audience: _crypto_js__WEBPACK_IMPORTED_MODULE_1__.AUDIENCE, lastTrustedTime: iso(now)
    };
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.validate)('Entitlement', result);
    return freeze(result);
  }
  async function trustedTime() {
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(typeof time.trustedNow === 'function', 'E_ENTITLEMENT', 'No trusted verification time source');
    return timestamp(await time.trustedNow());
  }
  async function installClaim(input) {
    const claim = copy(input);
    await verifier.claim(claim, subject);
    const verifiedAtMs = await trustedTime();
    const before = await read(), row = copy(before);
    const now = observe(row);
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(!anchor.regressed && verifiedAtMs >= before.lastTrustedTimeMs && verifiedAtMs <= now &&
      Date.parse(claim.issuedAt) <= verifiedAtMs && Date.parse(claim.issuedAt) < Date.parse(claim.expiresAt) && now < Date.parse(claim.expiresAt),
    'E_ENTITLEMENT', 'Untrusted, future, expired or rolled-back verification time');
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(claim.revocationVersion >= row.revocationVersion && claim.revocationVersion > row.revokedThrough,
      'E_ENTITLEMENT', 'Stale or revoked license version');
    row.claim = claim;
    row.claimHash = await (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.digest)((0,_crypto_js__WEBPACK_IMPORTED_MODULE_1__.entitlementSigningPayload)(claim));
    row.verifiedAtMs = verifiedAtMs;
    // Only an explicit trusted refresh may clear a durable rollback freeze.
    row.rollback = false;
    row.revocationVersion = claim.revocationVersion;
    row.revision += 1;
    await commit(before, row, verifiedAtMs);
    return asEntitlement(await evaluated());
  }
  async function snapshot({limits = Object.fromEntries(LIMIT_KEYS.map(key => [key, _protocol_js__WEBPACK_IMPORTED_MODULE_0__.BUDGETS[key]])), requiredCapabilities = []} = {}) {
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(Array.isArray(requiredCapabilities) && new Set(requiredCapabilities).size === requiredCapabilities.length &&
      requiredCapabilities.every(capability => CAPABILITIES.includes(capability)), 'E_ENTITLEMENT', 'Unknown required capability');
    const state = await evaluated();
    const approvedCapabilities = state.tier === 'pro' ? CAPABILITIES.filter(capability => state.row.claim.features.includes(capability)) : [...CAPABILITIES];
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(requiredCapabilities.every(capability => approvedCapabilities.includes(capability)),
      'E_ENTITLEMENT', 'License does not grant a required capability');
    const result = freeze({policyVersion: _crypto_js__WEBPACK_IMPORTED_MODULE_1__.POLICY_VERSION, tier: state.tier, approvedAt: iso(state.now),
      claimHash: state.tier === 'pro' ? state.row.claimHash : null,
      offlineAgeMs: state.tier === 'pro' ? state.now - state.row.verifiedAtMs : 0,
      effectiveLimits: limitsFor(limits, state.tier), maxSavedTemplates: state.tier === 'pro' ? 50 : 1,
      approvedCapabilities, runExpiryRevokes: false});
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.validate)('EntitlementSnapshot', result);
    issuedSnapshots.set(result, {revision: state.row.revision, claim: state.row.claim && (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.canonical)(state.row.claim),
      verifiedAtMs: state.row.verifiedAtMs, revokedThrough: state.row.revokedThrough});
    return result;
  }
  const service = {
    get: () => serial(async () => asEntitlement(await evaluated())),
    status: () => serial(async () => {
      const state = await evaluated();
      return freeze({tier: state.tier, reason: state.reason, revocationVersion: state.row.revocationVersion,
        trustedNowMs: state.now, lastTrustedVerifiedAt: state.row.verifiedAtMs === null ? null : iso(state.row.verifiedAtMs),
        exportsAllowed: true, existingRecordsAllowed: true, previewAllowed: true, deletionAllowed: true});
    }),
    install: claim => serial(() => installClaim(claim)),
    refresh: () => serial(async () => {
      const row = await read();
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(row.claim, 'E_ENTITLEMENT', 'No cached signed claim to refresh');
      return installClaim(row.claim);
    }),
    revoke: evidence => serial(async () => {
      const signed = copy(evidence);
      await verifier.revocation(signed, subject);
      const before = await read(), row = copy(before), now = observe(row);
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(Date.parse(signed.issuedAt) <= now && signed.revocationVersion > row.revocationVersion,
        'E_ENTITLEMENT', 'Future or non-increasing revocation evidence');
      row.revocation = signed;
      row.revocationVersion = signed.revocationVersion;
      row.revokedThrough = signed.revocationVersion;
      row.revision += 1;
      await commit(before, row);
      return asEntitlement(await evaluated());
    }),
    getSnapshot: request => serial(() => snapshot(request)),
    admitRun: template => serial(() => {
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(template && template.limits && Array.isArray(template.requiredCapabilities), 'E_ENTITLEMENT', 'Template admission requires limits and capabilities');
      return snapshot({limits: template.limits, requiredCapabilities: template.requiredCapabilities});
    }),
    admitTemplate(request) {
      const templateId = request?.templateId ?? request?.template?.templateId;
      // The public SaveTemplateRequest call prepares a quota. The storage owner must
      // recheck it in the actual write transaction with the optional tx/snapshot bridge.
      if (!request?.tx) return serial(async () => {
        const approved = await snapshot();
        return storage.transaction(['templates', 'entitlements'], 'readwrite', tx =>
          checkTemplate({templateId, tx, snapshot: approved}));
      });
      return checkTemplate({...request, templateId});
    }
  };
  async function checkTemplate({templateId, tx, snapshot: approved}) {
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(typeof templateId === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(templateId) && tx && issuedSnapshots.has(approved),
        'E_ENTITLEMENT', 'Template admission requires a service-issued snapshot and the template write transaction');
      const row = (await tx.get('entitlements', subject)) ?? initial();
      const ticket = issuedSnapshots.get(approved);
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(row.revision === ticket.revision && row.verifiedAtMs === ticket.verifiedAtMs && row.revokedThrough === ticket.revokedThrough &&
        (!row.claim || (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.canonical)(row.claim) === ticket.claim), 'E_ENTITLEMENT', 'Entitlement changed; prepare a new snapshot');
      const now = observe(row);
      if (approved.tier === 'pro') (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(!row.rollback && now < Date.parse(row.claim.expiresAt) &&
        now - row.verifiedAtMs <= OFFLINE_GRACE_MS && row.claim.revocationVersion > row.revokedThrough,
      'E_ENTITLEMENT', 'Pro template admission expired or revoked');
      const templates = await tx.all('templates');
      // The storage repository retains immutable revision rows separately from heads.
      // Only live heads consume template quota, including after a head is deleted.
      const repositoryRows = templates.some(template => template.metadata && (template.template || !template.head));
      const heads = repositoryRows ? templates.filter(template => template.metadata && !template.template) : templates;
      const ids = new Set(heads.filter(template => !template.tombstone && !template.deletedAt).map(template =>
        template.templateId ?? template.metadata?.templateId ?? template.head?.templateId ?? template.template?.templateId).filter(Boolean));
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(ids.has(templateId) || ids.size < approved.maxSavedTemplates, 'E_ENTITLEMENT', 'Saved template limit reached');
      await tx.put('entitlements', row, subject);
      return approved;
  }
  return Object.freeze(service);
}


/***/ }),

/***/ "./src/platform/host/authority.js":
/*!****************************************!*\
  !*** ./src/platform/host/authority.js ***!
  \****************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   createRunAuthority: () => (/* binding */ createRunAuthority)
/* harmony export */ });
/* harmony import */ var _protocol_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../protocol.js */ "./src/platform/protocol.js");
/* harmony import */ var _environment_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../environment.js */ "./src/environment.js");
/* harmony import */ var _journal_js__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../journal.js */ "./src/platform/journal.js");
/* harmony import */ var _sdk_methods_js__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./sdk-methods.js */ "./src/platform/host/sdk-methods.js");
/* harmony import */ var _controller_methods_js__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ./controller-methods.js */ "./src/platform/host/controller-methods.js");






// IDB commit order, rather than a worker-local mutex, orders stop/dispatch/seal.
function createRunAuthority({storage, api, session, entitlement, validatePlan, clock = {now: () => Date.now()}}) {
  const now = () => (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.iso)(clock);
  function tool(sender) { (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)((0,_environment_js__WEBPACK_IMPORTED_MODULE_1__.isToolSender)(api, sender), 'E_OWNER', 'Only an actual packaged tool document may own a run'); }
  const toolIdentity = () => ({namespace:`tool:${api.runtime.id}`,principal:`extension-tool:${api.runtime.id}`});
  async function assertHost(sender, registrationId) {
    tool(sender);
    return storage.transaction(['commandJournal'], 'readonly', async tx => {
      const rows = registrationId ? [await tx.get('commandJournal', `host:${registrationId}`)] : await tx.all('commandJournal');
      const host = rows.find(row => row?.tag === 'host' && row.hostDocumentId === sender.documentId && row.active && row.browserSessionIncarnation === session);
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(host && host.hostUrl === sender.url, 'E_OWNER', 'Host registration has expired or belongs to another document');
      // Stable identity is derived from the actual extension, never a payload
      // namespace. It also upgrades old registered hosts after worker restart.
      return {...host,...toolIdentity()};
    });
  }
  async function currentHost(tx, host, sender) {
    const current = await tx.get('commandJournal', `host:${host.registrationId}`);
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(current?.active && !current.revoked && current.hostDocumentId === sender.documentId &&
      current.hostUrl === sender.url && current.hostInstanceId === host.hostInstanceId &&
      current.browserSessionIncarnation === session, 'E_OWNER', 'Host changed before transaction commit');
    return current;
  }
  async function admitIdentity(tx, identity, sender, {ignoreRevision = false, allowSettled = false} = {}) {
    tool(sender); (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.validate)('Identity', identity);
    const run = await tx.get('runs', identity.runId);
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(run && !run.tombstoned, 'E_TOMBSTONE', 'Run has been deleted');
    const host = await tx.get('commandJournal', `host:${run.registrationId}`);
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(host?.active && host.hostDocumentId === sender.documentId && host.hostInstanceId === identity.hostInstanceId &&
      host.browserSessionIncarnation === session && run.browserSessionIncarnation === session, 'E_OWNER', 'Run owner/session is fenced');
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(run.ownerEpoch === identity.ownerEpoch && run.hostDocumentId === sender.documentId, 'E_OWNER', 'Owner epoch differs');
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)((0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.sameIdentity)(run.identity, identity, {ignoreRevision}), 'E_TARGET', 'Command targets a different document or template');
    if (!ignoreRevision) (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(run.runRevision === identity.runRevision, 'E_REVISION', 'Run revision differs');
    if (!allowSettled) (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(!run.cancelSeq && ['preparing','running'].includes(run.state), 'E_CANCELLED', 'Run no longer admits new work');
    return run;
  }
  async function projection(runId, sender) {
    const host = await assertHost(sender);
    return storage.transaction(['runs','commandJournal','exportJobs'], 'readonly', async tx => {
      const slot = await tx.get('runs', '@slot');
      const run = runId ? await tx.get('runs', runId) : null;
      if (run) (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(!run.tombstoned && run.registrationId === host.registrationId, 'E_OWNER', 'Projection belongs to another host');
      const commands = run ? (await tx.all('commandJournal')).filter(c => c.identity?.runId === runId && ['prepared','dispatched','effect_unknown'].includes(c.state)) : [];
      const jobs = (await tx.all('exportJobs')).filter(j => j.registrationId === host.registrationId && (!runId || j.runId === runId));
      return (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.validate)('Projection', {run: (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.projectRun)(run), pendingCommandIds: commands.map(c => c.commandId),
        exportJobIds: jobs.map(j => j.exportJobId), eventSeq: run?.eventSeq || 0, slotAvailable: !slot?.currentRunId});
    });
  }
  async function registerHost(request, sender) {
    tool(sender);
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(request.claimedContractVersion === _protocol_js__WEBPACK_IMPORTED_MODULE_0__.CONTRACT_VERSION && request.claimedContractHash === _protocol_js__WEBPACK_IMPORTED_MODULE_0__.CONTRACT_HASH, 'E_VERSION', 'Host contract differs');
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(typeof request.hostInstanceId === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(request.hostInstanceId), 'E_SCHEMA', 'Invalid host instance');
    const registrationId = await storage.transaction(['commandJournal'], 'readwrite', async tx => {
      const previous = (await tx.all('commandJournal')).find(r => r.tag === 'host' && r.hostDocumentId === sender.documentId && r.browserSessionIncarnation === session);
      if (previous) { (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(previous.hostInstanceId === request.hostInstanceId && previous.active, 'E_OWNER', 'Document cannot replace its host identity'); return previous.registrationId; }
      const id = (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.newId)();
      await tx.put('commandJournal', {tag:'host', registrationId:id, hostInstanceId:request.hostInstanceId, hostDocumentId:sender.documentId,
        hostUrl:sender.url, hostTabId:sender.tab?.id ?? null,...toolIdentity(),browserSessionIncarnation:session, active:true, revoked:false, registeredAt:now()}, `host:${id}`);
      return id;
    });
    return (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.validate)('RegisterHostResponse', {hostDocumentId:sender.documentId, registrationId, projection:await projection(null, sender)});
  }
  async function claimRun(request, sender) {
    const host = await assertHost(sender, request.registrationId);
    const template = await storage.getTemplateByHash(request.templateHash);
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.validate)('TemplateRevision', template);
    const origin = (0,_environment_js__WEBPACK_IMPORTED_MODULE_1__.httpUrl)(template.startUrl).origin;
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(origin === template.allowedOrigin && await api.permissions.contains({origins:[(0,_environment_js__WEBPACK_IMPORTED_MODULE_1__.permissionPattern)(origin)]}), 'E_PERMISSION', 'Formal run requires explicit origin permission');
    const snapshot = await entitlement.admitRun(template);
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.validate)('EntitlementSnapshot', snapshot);
    const runId = (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.newId)();
    const run = {runId, ownerEpoch:1, runRevision:1, eventSeq:0, commitSeq:0, hostInstanceId:host.hostInstanceId,
      hostDocumentId:host.hostDocumentId, templateHash:request.templateHash, state:'preparing', cancelSeq:0,
      committedCount:0, committedPages:0, storedBytes:0, checkpoint:null, target:null, entitlementSnapshot:snapshot,
      retirementState:'not-started', terminalReason:null, tombstoned:false, registrationId:host.registrationId,
      browserSessionIncarnation:session, startUrl:template.startUrl, createdAt:now(), identity:null};
    await storage.transaction(['runs','commandJournal'], 'readwrite', async tx => {
      const fresh = await tx.get('commandJournal', `host:${host.registrationId}`);
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(fresh?.active, 'E_OWNER', 'Host closed before claiming');
      const slot = await tx.get('runs', '@slot');
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(!slot?.currentRunId, 'E_OWNER', 'Previous target has not been retired');
      await tx.put('runs', run, runId);
      await tx.put('runs', {tag:'slot', currentRunId:runId, fencedEpoch:1, retirementId:null, releaseCount:0, state:'held'}, '@slot');
    });
    return {runId, ownerEpoch:1, runRevision:1, state:'preparing'};
  }
  async function prepareCommand(request, sender) {
    const {identity, commandId, kind, payload} = request;
    const command = {commandId, identity, kind, payload, digest:await (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.digest)({commandId,identity,kind,payload}),
      state:'prepared', preparedAt:now(), dispatchAt:null, resultDigest:null};
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.validate)('Command', command);
    const template = await storage.getTemplateByHash(identity.templateHash);
    if (kind === 'read-page') await validatePlan(template, payload.plan);
    else {
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(template.pagination.mode === kind, 'E_SEMANTIC', 'Pagination command differs from saved template');
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(payload.selector === template.pagination.selector, 'E_SEMANTIC', 'Pagination selector differs');
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(payload.endMarkerSelector === template.pagination.endMarkerSelector, 'E_SEMANTIC', 'End marker differs');
      if (kind === 'next-link') (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)((0,_environment_js__WEBPACK_IMPORTED_MODULE_1__.httpUrl)(payload.url).origin === identity.target.allowedOrigin, 'E_PERMISSION', 'Cross-origin pagination forbidden');
    }
    return storage.transaction(['runs','commandJournal','pageSnapshots'], 'readwrite', async tx => {
      const previous = await tx.get('commandJournal', (0,_journal_js__WEBPACK_IMPORTED_MODULE_2__.commandKey)(identity.runId, commandId));
      if (previous?.digest) {
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(previous.digest === command.digest, 'E_HASH', 'Command ID has conflicting content');
        await admitIdentity(tx, identity, sender, {ignoreRevision:true, allowSettled:true});
        return {state:previous.state, digest:previous.digest};
      }
      await admitIdentity(tx, identity, sender);
      if (kind === 'read-page') {
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(previous?.tag === 'read-reservation' && previous.snapshotId === payload.snapshotId && (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.sameIdentity)(previous.identity, identity),
          'E_SEAL_INCOMPLETE', 'Read must be reserved by beginPage');
        const page = await tx.get('pageSnapshots', payload.snapshotId);
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(page && page.readCommandId === commandId && page.pageSequence === payload.pageSequence && page.pageIdentity === payload.expectedPageIdentity,
          'E_TARGET', 'Read plan differs from reserved page');
      }
      await tx.put('commandJournal', {...command, tag:'command', snapshotId:payload.snapshotId ?? null}, (0,_journal_js__WEBPACK_IMPORTED_MODULE_2__.commandRecordKey)(command));
      return {state:'prepared', digest:command.digest};
    });
  }
  async function authorizeDispatch(request, sender) {
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.validate)('Identity', request.identity);
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(await api.permissions.contains({origins:[(0,_environment_js__WEBPACK_IMPORTED_MODULE_1__.permissionPattern)(request.identity.target.allowedOrigin)]}), 'E_PERMISSION', 'Origin permission revoked');
    const answer = await storage.transaction(['runs','commandJournal'], 'readwrite', async tx => {
      const command = await tx.get('commandJournal', (0,_journal_js__WEBPACK_IMPORTED_MODULE_2__.commandKey)(request.identity.runId, request.commandId));
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(command?.tag === 'command' && (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.sameIdentity)(command.identity, request.identity), 'E_TARGET', 'Unknown command or target');
      if (command.state === 'dispatched' || command.state === 'confirmed' || command.state === 'effect_unknown') {
        await admitIdentity(tx, request.identity, sender, {ignoreRevision:true, allowSettled:true});
        return {call:false, command};
      }
      const run = await admitIdentity(tx, request.identity, sender);
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(command.state === 'prepared', 'E_CANCELLED', 'Command cancelled');
      command.state = 'dispatched'; command.dispatchAt = now(); command.submissionCount = 1;
      await tx.put('commandJournal', command, (0,_journal_js__WEBPACK_IMPORTED_MODULE_2__.commandRecordKey)(command));
      if (run.state === 'preparing') { run.state = 'running'; run.eventSeq++; await tx.put('runs', run, run.runId); }
      return {call:true, command};
    });
    return answer;
  }
  async function markUnknown(command, error) {
    const key = (0,_journal_js__WEBPACK_IMPORTED_MODULE_2__.commandRecordKey)(command);
    return storage.transaction(['runs','commandJournal','pageSnapshots'], 'readwrite', async tx => {
      const command = await tx.get('commandJournal', key);
      if (!command || command.state !== 'dispatched') return;
      command.state = 'effect_unknown'; command.failure = {code:error?.code || 'E_EFFECT_UNKNOWN', message:String(error?.message || error)};
      await tx.put('commandJournal', command, key);
      const run = await tx.get('runs', command.identity.runId);
      if (run && !run.tombstoned && !_protocol_js__WEBPACK_IMPORTED_MODULE_0__.terminalStates.has(run.state) && run.state !== 'retiring' && !run.cancelSeq) {
        run.state = 'paused_unknown'; run.runRevision++; run.eventSeq++; run.identity.runRevision = run.runRevision;
        await tx.put('runs', run, run.runId);
      }
    });
  }
  async function stopRun(request, sender) {
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.validate)('StopRequest', request);
    const host = await assertHost(sender);
    return storage.transaction(['runs','commandJournal','pageSnapshots'], 'readwrite', async tx => {
      await currentHost(tx, host, sender);
      const key = `stop:${request.runId}:${request.requestId}`;
      const old = await tx.get('commandJournal', key);
      if (old) { (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(old.registrationId === host.registrationId && old.requestDigest === (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.canonical)(request), 'E_REVISION', 'Conflicting stop request'); return old.response; }
      const run = await tx.get('runs', request.runId);
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(run && !run.tombstoned && run.registrationId === host.registrationId && run.browserSessionIncarnation === session, 'E_OWNER', 'Run belongs to another owner');
      if (!_protocol_js__WEBPACK_IMPORTED_MODULE_0__.terminalStates.has(run.state) && run.state !== 'retiring' && !run.retirementId && run.state !== 'stopping') {
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(run.runRevision === request.expectedRunRevision, 'E_REVISION', 'Stale stop revision');
        run.state = 'stopping'; run.cancelSeq++; run.runRevision++; run.eventSeq++;
        if (run.identity) run.identity.runRevision = run.runRevision;
        for (const c of await tx.all('commandJournal')) if (c.tag === 'command' && c.identity?.runId === run.runId && c.state === 'prepared') { c.state = 'cancelled'; await tx.put('commandJournal', c, (0,_journal_js__WEBPACK_IMPORTED_MODULE_2__.commandRecordKey)(c)); }
        for (const page of await tx.all('pageSnapshots')) if (page.runId === run.runId && !page.sealed && page.state === 'open') { page.state = 'aborted'; page.abortReason = 'E_CANCELLED'; await tx.put('pageSnapshots', page, page.snapshotId); }
        await tx.put('runs', run, run.runId);
      }
      const response = {state:run.state, cancelSeq:run.cancelSeq, runRevision:run.runRevision};
      await tx.put('commandJournal', {tag:'stop', registrationId:host.registrationId, requestDigest:(0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.canonical)(request), response}, key);
      return response;
    });
  }
  async function fenceInTransaction(tx, run, terminal) {
      if (run.retirementId) return {state:run.state, retirementId:run.retirementId};
      const slot = await tx.get('runs', '@slot');
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(slot?.currentRunId === run.runId, 'E_OWNER', 'Run does not own the slot');
      run.ownerEpoch++; run.runRevision++; run.eventSeq++; run.cancelSeq++; run.retirementId = (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.newId)();
      run.fencedEpoch = run.ownerEpoch; run.finalState = terminal; run.retirementState = 'fenced';
      if (!_protocol_js__WEBPACK_IMPORTED_MODULE_0__.terminalStates.has(run.state)) run.state = 'retiring';
      slot.fencedEpoch = run.fencedEpoch; slot.retirementId = run.retirementId;
      for (const c of await tx.all('commandJournal')) if (c.tag === 'command' && c.identity?.runId === run.runId && c.state === 'prepared') { c.state = 'cancelled'; await tx.put('commandJournal', c, (0,_journal_js__WEBPACK_IMPORTED_MODULE_2__.commandRecordKey)(c)); }
      for (const page of await tx.all('pageSnapshots')) if (page.runId === run.runId && page.state === 'open') { page.state = 'aborted'; await tx.put('pageSnapshots', page, page.snapshotId); }
      await tx.put('runs', run, run.runId); await tx.put('runs', slot, '@slot');
      await tx.put('commandJournal', {tag:'retirement', retirementId:run.retirementId, runId:run.runId, fencedEpoch:run.fencedEpoch,
        registrationId:run.registrationId, target:run.target, creationId:run.creationId ?? null, browserSessionIncarnation:run.browserSessionIncarnation,
        state:'fenced', releaseCount:0, finalState:terminal}, `retirement:${run.retirementId}`);
      return {state:run.state, retirementId:run.retirementId};
  }
  async function fence(request, sender, terminal = 'abandoned_unknown') {
    const host = await assertHost(sender);
    return storage.transaction(['runs','commandJournal','pageSnapshots'], 'readwrite', async tx => {
      await currentHost(tx, host, sender);
      const run = await tx.get('runs', request.runId);
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(run && !run.tombstoned && run.registrationId === host.registrationId, 'E_OWNER', 'Unknown run owner');
      if (run.retirementId) return {state:run.state, retirementId:run.retirementId};
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(run.runRevision === request.expectedRunRevision, 'E_REVISION', 'Stale retirement revision');
      return fenceInTransaction(tx, run, terminal);
    });
  }
  async function abandonUnknown(request, sender) {
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.validate)('AbandonRequest', request);
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(request.userExplicit === true, 'E_OWNER', 'Explicit abandonment required');
    return fence(request, sender);
  }
  async function finishRun(request, sender) {
    const host = await assertHost(sender);
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(['completed','limit_reached','stopped','failed','interrupted'].includes(request.state), 'E_SCHEMA', 'Invalid terminal state');
    return storage.transaction(['runs','commandJournal','pageSnapshots','templates'], 'readwrite', async tx => {
      await currentHost(tx, host, sender);
      const run = await tx.get('runs', request.runId);
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(run?.registrationId === host.registrationId && !run.tombstoned, 'E_OWNER', 'Unknown owner');
      if (run.retirementId) return {state:run.state, retirementId:run.retirementId};
      if (_protocol_js__WEBPACK_IMPORTED_MODULE_0__.terminalStates.has(run.state)) return fenceInTransaction(tx, run, run.state);
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(run.runRevision === request.expectedRunRevision, 'E_REVISION', 'Stale completion');
      if (request.state === 'completed') {
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(!run.cancelSeq && request.naturalEnd === true, 'E_CANCELLED', 'Completion needs natural end evidence');
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(run.identity && run.target && (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.sameIdentity)(run.identity.target, run.target),
          'E_TARGET', 'Completion needs an authenticated bound target');
        const snapshot = await tx.get('pageSnapshots', run.checkpoint?.lastSnapshotId ?? '');
        const template = (await tx.all('templates')).map(row => row.template || row.revisionData || row)
          .find(row => row.contentHash === run.templateHash);
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(template && snapshot?.state === 'sealed' && snapshot.runId === run.runId &&
          (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.sameIdentity)(snapshot.sealIdentity, run.identity, {ignoreRevision:true}) && snapshot.immutableSealAck &&
          (template.pagination.mode === 'none' || snapshot.readEnd?.emptyEvidence === `end-marker:${template.pagination.endMarkerSelector}`),
          'E_SEAL_INCOMPLETE', 'Completion needs durable authenticated natural-end evidence');
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(!(await tx.all('commandJournal')).some(c => c.identity?.runId === run.runId && ['prepared','dispatched','effect_unknown'].includes(c.state)), 'E_EFFECT_UNKNOWN', 'Unsettled commands prevent completion');
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(!(await tx.all('pageSnapshots')).some(p => p.runId === run.runId && p.state === 'open'), 'E_SEAL_INCOMPLETE', 'Open page prevents completion');
      }
      run.state = run.cancelSeq ? 'stopped' : request.state; run.terminalReason = request.reason ?? null;
      run.runRevision++; run.eventSeq++; if (run.identity) run.identity.runRevision = run.runRevision;
      return fenceInTransaction(tx, run, run.state);
    });
  }
  async function loseHost(registrationId, {documentGone = false} = {}) {
    await storage.transaction(['runs','commandJournal','pageSnapshots'], 'readwrite', async tx => {
      const host = await tx.get('commandJournal', `host:${registrationId}`); if (!host) return;
      host.active = !documentGone; host.revoked = documentGone; await tx.put('commandJournal', host, `host:${registrationId}`);
      for (const run of await tx.all('runs')) if (run.tag !== 'controller-run' && run.registrationId === registrationId && !_protocol_js__WEBPACK_IMPORTED_MODULE_0__.terminalStates.has(run.state) && run.state !== 'retiring') {
        if (run.retirementId) continue;
        if (!documentGone && ['stopping','paused_unknown'].includes(run.state)) continue;
        run.state = documentGone ? (run.cancelSeq ? 'stopped' : 'interrupted') : 'paused_unknown'; run.terminalReason = 'RunHost connection lost'; run.runRevision++; run.eventSeq++;
        if (run.identity) run.identity.runRevision = run.runRevision;
        if (documentGone) await fenceInTransaction(tx, run, run.state);
        else await tx.put('runs', run, run.runId);
      }
    });
    await controller.loseControllerHost(registrationId, {documentGone});
  }
  async function recover() {
    // Worker restart never creates a run or replays an authorized external effect.
    const pending = await storage.transaction(['commandJournal'], 'readonly', async tx => (await tx.all('commandJournal')).filter(c => c.tag === 'command' && c.state === 'dispatched'));
    for (const c of pending) await markUnknown(c, new _protocol_js__WEBPACK_IMPORTED_MODULE_0__.FoundationError('E_EFFECT_UNKNOWN', 'Worker restart after dispatch'));
    await storage.transaction(['runs','commandJournal','pageSnapshots'], 'readwrite', async tx => {
      const slot = await tx.get('runs', '@slot');
      for (const run of await tx.all('runs')) {
        if (run.runId && run.tag !== 'controller-run' && _protocol_js__WEBPACK_IMPORTED_MODULE_0__.terminalStates.has(run.state) && !run.retirementId && !run.tombstoned && slot?.currentRunId === run.runId) {
          await fenceInTransaction(tx, run, run.state);
        } else if (run.runId && run.tag !== 'sdk-service' && run.tag !== 'controller-run' && run.browserSessionIncarnation !== session && !_protocol_js__WEBPACK_IMPORTED_MODULE_0__.terminalStates.has(run.state) &&
          !run.retirementId && !['retiring','stopping','paused_unknown'].includes(run.state)) {
        run.state = 'paused_unknown'; run.runRevision++; run.eventSeq++; run.terminalReason = 'cross-session-unverified';
        if (run.identity) run.identity.runRevision = run.runRevision;
        await tx.put('runs', run, run.runId);
        }
      }
    });
    await sdk.recoverSdk();
    await controller.recoverControllers();
  }
  const sdk = (0,_sdk_methods_js__WEBPACK_IMPORTED_MODULE_3__.sdkMethods)({storage,api,session,clock,assertHost,currentHost});
  const controller = (0,_controller_methods_js__WEBPACK_IMPORTED_MODULE_4__.controllerMethods)({storage,api,session,clock,assertHost,currentHost});
  return {...sdk, ...controller,
    registerHost, assertHost, admitIdentity, claimRun, prepareCommand, authorizeDispatch, markUnknown, stopRun,
    abandonUnknown, finishRun, loseHost, recover, snapshotRun:async (request,sender) => projection(request.runId ?? null,sender), projection};
}


/***/ }),

/***/ "./src/platform/host/broker.js":
/*!*************************************!*\
  !*** ./src/platform/host/broker.js ***!
  \*************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   createFoundationBroker: () => (/* binding */ createFoundationBroker)
/* harmony export */ });
/* harmony import */ var _storage_index_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../storage/index.js */ "./src/platform/storage/index.js");
/* harmony import */ var _storage_session_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../storage/session.js */ "./src/platform/storage/session.js");
/* harmony import */ var _entitlement_index_js__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../entitlement/index.js */ "./src/platform/entitlement/index.js");
/* harmony import */ var _downloads_index_js__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ../downloads/index.js */ "./src/platform/downloads/index.js");
/* harmony import */ var _target_index_js__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ../target/index.js */ "./src/platform/target/index.js");
/* harmony import */ var _page_port_index_js__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! ../page-port/index.js */ "./src/platform/page-port/index.js");
/* harmony import */ var _authority_js__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! ./authority.js */ "./src/platform/host/authority.js");
/* harmony import */ var _sdk_broker_js__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! ./sdk-broker.js */ "./src/platform/host/sdk-broker.js");
/* harmony import */ var _chrome_tabs_js__WEBPACK_IMPORTED_MODULE_8__ = __webpack_require__(/*! ../chrome/tabs.js */ "./src/platform/chrome/tabs.js");
/* harmony import */ var _framework_sdk_registry_js__WEBPACK_IMPORTED_MODULE_9__ = __webpack_require__(/*! ../../framework/sdk/registry.js */ "./src/framework/sdk/registry.js");
/* harmony import */ var _protocol_js__WEBPACK_IMPORTED_MODULE_10__ = __webpack_require__(/*! ../protocol.js */ "./src/platform/protocol.js");
/* harmony import */ var _environment_js__WEBPACK_IMPORTED_MODULE_11__ = __webpack_require__(/*! ../../environment.js */ "./src/environment.js");
/* harmony import */ var _page_port_codec_js__WEBPACK_IMPORTED_MODULE_12__ = __webpack_require__(/*! ../page-port/codec.js */ "./src/platform/page-port/codec.js");















async function createFoundationBroker({api = chrome, ports = new Map(), clock = {now:()=>Date.now()}, indexedDB = globalThis.indexedDB,
  entitlementSubject} = {}) {
  let {browserSessionIncarnation:session} = await api.storage.session.get('browserSessionIncarnation');
  if (!session) { session = (0,_protocol_js__WEBPACK_IMPORTED_MODULE_10__.newId)(); await api.storage.session.set({browserSessionIncarnation:session}); }
  const storage = await (0,_storage_index_js__WEBPACK_IMPORTED_MODULE_0__.createStorage)({clock,indexedDB,sessionTyped:(0,_storage_session_js__WEBPACK_IMPORTED_MODULE_1__.createSessionTyped)({api})});
  // Licensing belongs to the explicitly registered template consumer. SDK and
  // ordinary controllers must start without a business subject or paid claim.
  let entitlementService;
  const entitlement = Object.fromEntries(['getSnapshot','status','install','revoke','admitRun','admitTemplate']
    .map(method => [method, (...args) => {
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_10__.invariant)(typeof entitlementSubject === 'string' && entitlementSubject.length > 0,
        'E_MODULE_NOT_INSTALLED', 'The template entitlement consumer has not been registered');
      entitlementService ||= (0,_entitlement_index_js__WEBPACK_IMPORTED_MODULE_2__.createEntitlementService)({storage,clock,subject:entitlementSubject});
      return entitlementService[method](...args);
    }]));
  const emitToHost = async (registrationId,event) => {
    const host = await storage.transaction(['commandJournal'], 'readonly', tx => tx.get('commandJournal',`host:${registrationId}`));
    if (!host?.active || host.browserSessionIncarnation !== session) return;
    const port = ports.get(host.hostDocumentId);
    if (!port || port.registrationId !== registrationId) return;
    try { port.postMessage({protocol:_protocol_js__WEBPACK_IMPORTED_MODULE_10__.PROTOCOL,registrationId,event}); } catch { /* The durable facts remain queryable. */ }
  };
  const authority = (0,_authority_js__WEBPACK_IMPORTED_MODULE_6__.createRunAuthority)({storage,api,session,entitlement,validatePlan: _page_port_index_js__WEBPACK_IMPORTED_MODULE_5__.validatePlan,clock});
  const targets = (0,_target_index_js__WEBPACK_IMPORTED_MODULE_4__.createTargetService)({storage,api,session,assertHost:authority.assertHost});
  const pagePort = (0,_page_port_index_js__WEBPACK_IMPORTED_MODULE_5__.createPagePortService)({storage,api,session,targetService:targets,assertHost:authority.assertHost,
    admitIdentity:authority.admitIdentity,emitToHost});
  const downloads = (0,_downloads_index_js__WEBPACK_IMPORTED_MODULE_3__.createDownloadService)({storage,api,clock,assertHost:authority.assertHost});
  const sdk = (0,_sdk_broker_js__WEBPACK_IMPORTED_MODULE_7__.createSdkBroker)({authority,storage,api,clock});
  await authority.recover();
  await targets.reconcileRetirements();
  downloads.attach();
  await downloads.reconcilePending();
  const background = operation => Promise.resolve(operation).catch(error => console.error(`[foundation ${error.code || 'E_EFFECT_UNKNOWN'}] ${error.message}`));
  const authenticate = (request,sender) => authority.assertHost(sender, request.registrationId);
  const routes = {
    commitControllerScript:(p,s)=>authority.commitControllerScript(p,s),
    getControllerScript:(p,s)=>authority.getControllerScript(p,s),
    startControllerRun:(p,s)=>authority.startControllerRun(p,s),
    controllerOperation:(p,s)=>authority.controllerOperation(p,s),
    stopControllerRun:(p,s)=>authority.stopControllerRun(p,s),
    finishControllerRun:(p,s)=>authority.finishControllerRun(p,s),
    snapshotControllerRun:(p,s)=>authority.snapshotControllerRun(p,s),
    retireControllerTarget:(p,s)=>authority.retireControllerTarget(p,s),
    grantSdk:(p,s)=>authority.grantSdk(p,s),
    async installSdk(p,s) {
      const grant = await authority.grantSdk(p,s);
      const driver = (0,_chrome_tabs_js__WEBPACK_IMPORTED_MODULE_8__.createTabsService)({api,authorize:() => authority.authorizeSdkInjection(p,s,grant.grantIncarnation)});
      const target = {tabId:p.tabId,documentIds:[p.documentId]};
      try {
        await driver.injectFixed({target,file:_framework_sdk_registry_js__WEBPACK_IMPORTED_MODULE_9__.SDK_FILES.relay,world:'ISOLATED'});
        await driver.injectFixed({target,file:_framework_sdk_registry_js__WEBPACK_IMPORTED_MODULE_9__.SDK_FILES.main,world:'MAIN'});
        return {...grant,installed:true,files:[_framework_sdk_registry_js__WEBPACK_IMPORTED_MODULE_9__.SDK_FILES.relay,_framework_sdk_registry_js__WEBPACK_IMPORTED_MODULE_9__.SDK_FILES.main]};
      } catch (error) {
        await authority.revokeSdkGrants({tabId:p.tabId,frameId:p.frameId,documentId:p.documentId,reason:'installation-failed'});
        throw error;
      }
    },
    registerHost:(p,s)=>authority.registerHost(p,s),
    claimRun:(p,s)=>authority.claimRun(p,s),
    snapshotRun:(p,s)=>authority.snapshotRun(p,s),
    prepareCommand:(p,s)=>authority.prepareCommand(p,s),
    async dispatchCommand(p,s) {
      const authorization = await authority.authorizeDispatch(p,s);
      if (authorization.call) background(pagePort.executeCommand((0,_protocol_js__WEBPACK_IMPORTED_MODULE_10__.projectCommand)(authorization.command))
        .catch(async error=>{await authority.markUnknown(authorization.command,error);throw error;}));
      return {accepted:true,state:authorization.command.state};
    },
    stopRun:(p,s)=>authority.stopRun(p,s),
    abandonUnknown:(p,s)=>authority.abandonUnknown(p,s),
    finishRun:(p,s)=>authority.finishRun(p,s),
    createTarget:(p,s)=>targets.createTarget(p,s),
    reconcileTargetCreation:(p,s)=>targets.reconcileTargetCreation(p,s),
    bindTarget:(p,s)=>targets.bindTarget(p,s),
    retireTarget:(p,s)=>targets.retireTarget(p,s),
    ackPageFrame:(p,s)=>pagePort.ackPageFrame(p,s),
    ackSourceFrame:(p,s)=>pagePort.ackSourceFrame(p,s),
    openSourceContext:(p,s)=>pagePort.openSourceContext(p,s),
    startSourceSelection:(p,s)=>pagePort.startSourceSelection(p,s),
    cancelSourceSelection:(p,s)=>pagePort.cancelSourceSelection(p,s),
    releaseSourceContext:(p,s)=>pagePort.releaseSourceContext(p,s),
    async previewSource(p,s) {
      const stream = await pagePort.previewSource(p,s);
      const host = await authority.assertHost(s);
      background((async()=>{for await (const frame of stream) await emitToHost(host.registrationId,frame);})());
      return {accepted:true,selectionId:p.context.selectionId,requestId:p.requestId};
    },
    async saveTemplate(p) {
      const snapshot = await entitlement.getSnapshot();
      return storage.saveTemplate(p,{admitTemplate:({templateId,tx})=>entitlement.admitTemplate({templateId,tx,snapshot})});
    },
    listTemplates:p=>storage.listTemplates(p),
    getTemplateRevision:p=>storage.getTemplateRevision(p),
    renameTemplate:p=>storage.renameTemplate(p),
    beginPage:p=>storage.beginPage(p),
    stagePageBatch:p=>storage.stagePageBatch(p),
    sealPage:p=>storage.sealPage(p),
    readRecords:p=>storage.readRecords(p),
    openReaderPin:p=>storage.openReaderPin(p),
    releaseReaderPin:p=>storage.releaseReaderPin(p),
    prepareExport:(p,s)=>downloads.prepareExport(p,s),
    prepareArtifact:(p,s)=>downloads.prepareArtifact(p,s),
    prepareAttempt:(p,s)=>downloads.prepareAttempt(p,s),
    prepareAttempts:(p,s)=>downloads.prepareAttempts(p,s),
    dispatchDownload:(p,s)=>downloads.dispatchDownload(p,s),
    reconcileDownload:(p,s)=>downloads.reconcileDownload(p,s),
    retryExport:(p,s)=>downloads.retryExport(p,s),
    abandonExport:(p,s)=>downloads.abandonExport(p,s),
    async readArtifact(p,s) {
      const {artifact,bytes} = await downloads.readArtifact(p,s);
      const blocks = [];
      for (let offset = 0; offset < bytes.length; offset += _protocol_js__WEBPACK_IMPORTED_MODULE_10__.BUDGETS.maxRawFrameBytes)
        blocks.push((0,_page_port_codec_js__WEBPACK_IMPORTED_MODULE_12__.bytesToBase64)(bytes.slice(offset,offset + _protocol_js__WEBPACK_IMPORTED_MODULE_10__.BUDGETS.maxRawFrameBytes)));
      if (!blocks.length) blocks.push((0,_page_port_codec_js__WEBPACK_IMPORTED_MODULE_12__.bytesToBase64)(new Uint8Array()));
      return {artifact,blocks};
    },
    recordResourceRelease:(p,s)=>downloads.recordResourceRelease(p,s),
    getEntitlementSnapshot:()=>entitlement.getSnapshot(),
    entitlementStatus:()=>entitlement.status(),
    installEntitlement:p=>entitlement.install(p),
    revokeEntitlement:p=>entitlement.revoke(p),
    async getGestureTicket() {
      const {foundationGestureTicketId} = await api.storage.session.get('foundationGestureTicketId');
      return {gestureTicketId:foundationGestureTicketId ?? null};
    },
    async deleteRun(p,s) {
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_10__.invariant)(p.explicitUserAction === true, 'E_OWNER', 'Deletion needs an explicit user action');
      let run = await storage.transaction(['runs'], 'readonly', tx=>tx.get('runs',p.runId));
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_10__.invariant)(run && !run.tombstoned,'E_TOMBSTONE','Run unavailable');
      if (run.retirementState !== 'released') {
        const retired = await authority.abandonUnknown({runId:p.runId,expectedRunRevision:run.runRevision,requestId:(0,_protocol_js__WEBPACK_IMPORTED_MODULE_10__.newId)(),userExplicit:true},s);
        const result = await targets.retireTarget({retirementId:retired.retirementId},s);
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_10__.invariant)(result.slotReleased === true,'E_EFFECT_UNKNOWN','Target retirement still unresolved');
      }
      await downloads.abandonRun({runId:p.runId},s);
      return storage.deleteRun(p);
    }
  };
  async function handle(message,sender) {
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_10__.invariant)(message?.protocol === _protocol_js__WEBPACK_IMPORTED_MODULE_10__.PROTOCOL,'E_VERSION','Unknown foundation protocol');
    // Tagged values preserve undefined across Chrome's JSON hop. Validate these
    // envelopes before legacy canonical JSON, whose domain intentionally excludes it.
    if (message.type === 'SDK_HELLO') return sdk.hello(message.payload,sender);
    if (message.type === 'SDK_REQUEST') return sdk.request(message.payload,sender);
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_10__.canonical)(message.payload ?? {});
    if (message.type === 'BOOTSTRAP_READY') return targets.bootstrapReady(message.payload,sender);
    if (message.type === 'TARGET_READY') return targets.agentReady(message.payload,sender);
    if (['AGENT_READY','PAGE_DATA','PAGE_END','PAGE_EFFECT','PAGE_ERROR','SOURCE_RESULT','SOURCE_PREVIEW_DATA','SOURCE_PREVIEW_END','SOURCE_ERROR'].includes(message.type)) return pagePort.handleAgentMessage(message,sender);
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_10__.invariant)((0,_environment_js__WEBPACK_IMPORTED_MODULE_11__.isToolSender)(api,sender),'E_OWNER','Only actual packaged tool documents may invoke foundation services');
    const route = Object.hasOwn(routes, message.type) ? routes[message.type] : undefined;
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_10__.invariant)(route,'E_CAPABILITY','Unknown or unavailable foundation operation');
    if (message.type !== 'registerHost') await authenticate(message,sender);
    const p = message.payload ?? {};
    if (p.identity) await storage.transaction(['runs','commandJournal'], 'readonly',tx=>authority.admitIdentity(tx,p.identity,sender,
      {ignoreRevision:['ackPageFrame'].includes(message.type),allowSettled:['ackPageFrame'].includes(message.type)}));
    return route(p,sender);
  }
  async function issueGestureTicket(tab) {
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_10__.invariant)(tab && !tab.incognito && Number.isInteger(tab.id),'E_PERMISSION','Action source tab unavailable');
    const source = (0,_environment_js__WEBPACK_IMPORTED_MODULE_11__.httpUrl)(tab.url);
    const gestureTicketId = (0,_protocol_js__WEBPACK_IMPORTED_MODULE_10__.newId)();
    await storage.transaction(['commandJournal'],'readwrite',tx=>tx.put('commandJournal',{tag:'gesture-ticket',gestureTicketId,
      sourceTabId:tab.id,sourceUrl:source.href,origin:source.origin,gestureAt:new Date(clock.now()).toISOString(),
      browserSessionIncarnation:session,consumed:false},`gesture:${gestureTicketId}`));
    await api.storage.session.set({foundationGestureTicketId:gestureTicketId});
    return gestureTicketId;
  }
  async function disconnectHost(registrationId,documentId) {
    const contexts = await api.runtime.getContexts({documentIds:[documentId]});
    const documentGone = contexts.length === 0;
    await authority.loseHost(registrationId,{documentGone});
    if (documentGone) {
      await pagePort.invalidateHost(registrationId);
      await targets.reconcileRetirements();
    }
  }
  return {handle,issueGestureTicket,disconnectHost,authority,storage,pagePort,targets,downloads,entitlement,session,emitToHost,sdk};
}


/***/ }),

/***/ "./src/platform/host/controller-methods.js":
/*!*************************************************!*\
  !*** ./src/platform/host/controller-methods.js ***!
  \*************************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   controllerMethods: () => (/* binding */ controllerMethods)
/* harmony export */ });
/* harmony import */ var _protocol_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../protocol.js */ "./src/platform/protocol.js");
/* harmony import */ var _page_port_codec_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../page-port/codec.js */ "./src/platform/page-port/codec.js");
/* harmony import */ var _framework_control_value_js__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../../framework/control/value.js */ "./src/framework/control/value.js");
/* harmony import */ var _target_index_js__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ../target/index.js */ "./src/platform/target/index.js");
/* harmony import */ var _framework_control_native_driver_js__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ../../framework/control/native-driver.js */ "./src/framework/control/native-driver.js");






const stores = ['runs', 'commandJournal', 'results'];
const live = new Set(['preparing', 'running']);
const terminals = new Set(['completed', 'failed', 'stopped', 'interrupted']);
const scriptKey = (namespace, id, revision) => `script:${(0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.canonical)(revision === undefined ? [namespace, id] : [namespace, id, revision])}`;
const opKey = (runId, requestId) => `controller-op:${(0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.canonical)([runId, requestId])}`;
function originMatches(pattern, origin) {
  if (pattern === '<all_urls>') return true;
  const match = typeof pattern === 'string' && pattern.match(/^(\*|https?):\/\/([^/]+)\//);
  if (!match) return false;
  const url = new URL(origin), hostname = match[2].toLowerCase();
  return (match[1] === '*' || `${match[1]}:` === url.protocol) && (hostname === '*' ||
    hostname === url.hostname || hostname.startsWith('*.') &&
    (url.hostname === hostname.slice(2) || url.hostname.endsWith(`.${hostname.slice(2)}`)));
}
function fields(value, allowed, required = []) {
  (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(key => allowed.includes(key)) &&
    required.every(key => Object.hasOwn(value, key)), 'E_SCHEMA', 'Invalid controller request fields');
}
function id(value) { (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(typeof value === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(value), 'E_SCHEMA', 'Invalid controller id'); }
function same(a, b) { return (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.canonical)(a) === (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.canonical)(b); }
function typed(error) { return {code: error?.code || 'E_CONTROL_EXECUTION', name: error?.name || 'Error', message: String(error?.message || error)}; }

// Delegate of the unique authority. Every durable fence is ordered by its
// injected storage transaction; the maps below only correlate live promises.
function controllerMethods({storage, api, session, clock, assertHost, currentHost}) {
  const pending = new Map(), cancellations = new Map(), navigating = new Map(), boundTargets = new Map(), creatingTabs = new Map();
  const tabEpochs = new Map(), frameEpochs = new Map(), permissionRemovals = [];
  const tx = (mode, work, names = stores) => storage.transaction(names, mode, work);
  const now = () => clock.now();
  function namespace(host) {
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(typeof host.namespace === 'string' && host.namespace && host.principal !== undefined,
      'E_OWNER', 'Unique authority must issue the tool namespace and principal');
    return host.namespace;
  }
  function nativeFence(tabId, origin, frameId = 0) {
    return {tabEpoch: tabEpochs.get(tabId) || 0,
      frameEpoch: frameEpochs.get((0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.canonical)([tabId ?? null, frameId])) || 0,
      rootFrameEpoch: frameId > 0 ? frameEpochs.get((0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.canonical)([tabId ?? null, 0])) || 0 : 0,
      permissionEpoch: permissionRemovals.filter(patterns => patterns.some(pattern => originMatches(pattern, origin))).length};
  }
  function checkFence(run) {
    const origin = run.target?.allowedOrigin || run.startUrl && (0,_target_index_js__WEBPACK_IMPORTED_MODULE_3__.httpUrl)(run.startUrl).origin;
    if (!origin || !run.nativeFence) return;
    const current = nativeFence(run.target?.tabId ?? run.nativeTabId, origin, run.target?.frameId ?? run.selection.frameId ?? 0);
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(current.permissionEpoch === run.nativeFence.permissionEpoch, 'E_PERMISSION', 'Observed permission removal permanently fenced this run');
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(current.tabEpoch === run.nativeFence.tabEpoch && current.frameEpoch === run.nativeFence.frameEpoch &&
      current.rootFrameEpoch === run.nativeFence.rootFrameEpoch,
      'E_DOCUMENT_REPLACED', 'Observed native document loss fenced this run');
  }
  async function owner(transaction, run, host, sender, {active = false} = {}) {
    await currentHost(transaction, host, sender);
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(run?.tag === 'controller-run' && !run.tombstoned && run.registrationId === host.registrationId &&
      run.hostDocumentId === host.hostDocumentId && run.hostInstanceId === host.hostInstanceId &&
      run.namespace === namespace(host) && run.browserSessionIncarnation === session,
    'E_OWNER', 'Controller belongs to another registered host');
    if (active) {
      checkFence(run);
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(live.has(run.state) && !run.cancelSeq && !run.retirementId && now() < run.deadlineAt,
        now() >= run.deadlineAt ? 'E_TIMEOUT' : 'E_CANCELLED', 'Controller admission is fenced');
    }
    return run;
  }
  function scriptContext(host, sender, run, {retiring = false} = {}) {
    const binding = run || {runId: (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.newId)(), opId: (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.newId)(), requestId: (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.newId)(), resultId: (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.newId)()};
    const context = {namespace: namespace(host), principal: host.principal, grantIncarnation: host.registrationId,
      browserSessionIncarnation: session, runId: binding.runId, opId: binding.opId,
      requestId: binding.requestId, resultId: binding.resultId, opKey: `controller-pin:${binding.runId}`,
      deadlineAt: retiring || !run ? now() + 15000 : run.deadlineAt,
      async authorizeInTransaction(transaction) {
        await currentHost(transaction, host, sender);
        // Revision transactions deliberately contain no runs store. Their
        // durable lease mirror is fenced in the same transaction as run state.
        if (run) {
          const lease = await transaction.get('commandJournal', `controller-pin:${run.runId}`);
          (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(lease?.tag === 'controller-lease' && lease.namespace === host.namespace && lease.registrationId === host.registrationId,
            'E_OWNER');
          if (!retiring) (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(live.has(lease.state) && !lease.cancelSeq && now() < lease.deadlineAt,
            now() >= lease.deadlineAt ? 'E_TIMEOUT' : 'E_CANCELLED');
        }
        return true;
      },
      async authorize() {
        return tx('readonly', async transaction => context.authorizeInTransaction(transaction), ['runs', 'commandJournal']);
      }};
    return context;
  }
  async function lease(transaction, run) {
    await transaction.put('commandJournal', {tag: 'controller-lease', runId: run.runId, namespace: run.namespace,
      registrationId: run.registrationId, cancelSeq: run.cancelSeq, state: run.state, deadlineAt: run.deadlineAt,
      workerRetired: run.workerRetired, retirementState: run.retirementState}, `controller-pin:${run.runId}`);
  }
  async function commitControllerScript(request, sender) {
    fields(request, ['scriptId', 'expectedRevision', 'sourceUtf8', 'contentHash'], ['scriptId', 'expectedRevision', 'sourceUtf8']);
    const host = await assertHost(sender);
    return storage.commitScriptRevision(scriptContext(host, sender), request);
  }
  async function getControllerScript(request, sender) {
    fields(request, ['scriptId', 'revision'], ['scriptId']); id(request.scriptId);
    const host = await assertHost(sender);
    return storage.transaction(['scriptHeads', 'scriptRevisions', 'commandJournal'], 'readonly', async transaction => {
      await currentHost(transaction, host, sender);
      const head = await transaction.get('scriptHeads', scriptKey(namespace(host), request.scriptId));
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(head && !head.tombstoned, 'E_TOMBSTONE', 'Script is not available');
      const revision = request.revision ?? head.revision;
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(Number.isSafeInteger(revision) && revision > 0, 'E_REVISION');
      const row = await transaction.get('scriptRevisions', scriptKey(host.namespace, request.scriptId, revision));
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(row && await (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.digestUtf8)(row.sourceUtf8) === row.contentHash, 'E_HASH', 'Stored script bytes differ');
      return row;
    });
  }
  function project(run) {
    if (!run) return null;
    return structuredClone(Object.fromEntries(['tag', 'runId', 'state', 'runRevision', 'ownerEpoch', 'cancelSeq', 'identity',
      'target', 'revision', 'deadlineAt', 'retirementId', 'retirementState', 'resultId', 'terminalReason', 'workerRetired',
      'scriptId', 'contentHash'].filter(key => run[key] !== undefined).map(key => [key, run[key]])));
  }
  async function snapshotControllerRun(request, sender) {
    fields(request, ['runId']); if (request.runId !== undefined) id(request.runId);
    const host = await assertHost(sender);
    return tx('readonly', async transaction => {
      await currentHost(transaction, host, sender);
      const slot = await transaction.get('runs', '@slot');
      const run = request.runId ? await transaction.get('runs', request.runId) : null;
      if (request.runId) (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(run?.tag === 'controller-run' && !run.tombstoned && run.namespace === namespace(host), 'E_OWNER');
      const results = (await transaction.all('results')).filter(value => value.tag === 'controller-result' &&
        value.namespace === namespace(host) && (!run || value.runId === run.runId));
      return {run: project(run), results, slotAvailable: !slot?.currentRunId};
    });
  }
  function selection(target) {
    fields(target, target?.mode === 'owned' ? ['mode', 'url'] : ['mode', 'tabId', 'frameId', 'documentId']);
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(['owned', 'borrowed'].includes(target.mode), 'E_TARGET', 'Explicit target ownership is required');
    if (target.mode === 'owned') (0,_target_index_js__WEBPACK_IMPORTED_MODULE_3__.httpUrl)(target.url);
    else (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(Number.isSafeInteger(target.tabId) && target.tabId >= 0 && Number.isSafeInteger(target.frameId) && target.frameId >= 0 &&
      typeof target.documentId === 'string' && target.documentId, 'E_TARGET', 'Exact borrowed document required');
  }
  async function waitDocument(run, tabId, {bootstrapUrl, documentId, changedFrom} = {}) {
    for (;;) {
      await tx('readonly', async transaction => {
        const current = await transaction.get('runs', run.runId);
        checkFence(current);
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(current?.tag === 'controller-run' && !current.cancelSeq && live.has(current.state) &&
          current.browserSessionIncarnation === session, 'E_CANCELLED');
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(now() < current.deadlineAt, 'E_TIMEOUT');
      }, ['runs']);
      try {
        const observed = await (0,_target_index_js__WEBPACK_IMPORTED_MODULE_3__.observeControllerTarget)({api, tabId, documentId, allowExtensionUrl: bootstrapUrl ?? null});
        if ((!changedFrom || observed.documentId !== changedFrom) && (!run.startUrl || bootstrapUrl ||
          (0,_target_index_js__WEBPACK_IMPORTED_MODULE_3__.httpUrl)(observed.url).origin === (0,_target_index_js__WEBPACK_IMPORTED_MODULE_3__.httpUrl)(run.startUrl).origin)) return observed;
      } catch (error) {
        if (!['E_DOCUMENT_REPLACED', 'E_TARGET'].includes(error.code)) throw error;
      }
      await new Promise(resolve => setTimeout(resolve, 25));
    }
  }
  async function createOwned(run, host, sender) {
    const creationKey = `controller-create:${run.runId}`;
    const intent = await tx('readwrite', async transaction => {
      const current = await owner(transaction, await transaction.get('runs', run.runId), host, sender, {active: true});
      const previous = await transaction.get('commandJournal', creationKey);
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(!previous, 'E_EFFECT_UNKNOWN', 'Owned creation dispatch is never replayed');
      const creationId = (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.newId)(), bootstrapUrl = api.runtime.getURL(`ui/target-bootstrap.html?creationId=${encodeURIComponent(creationId)}`);
      const value = {tag: 'controller-target-create', runId: current.runId, creationId, browserSessionIncarnation: session,
        bootstrapUrl, state: 'dispatched', submissionCount: 1, tabId: null, dispatchAt: now()};
      await transaction.put('commandJournal', value, creationKey);
      return value;
    });
    await (0,_target_index_js__WEBPACK_IMPORTED_MODULE_3__.requireGrant)(api, (0,_target_index_js__WEBPACK_IMPORTED_MODULE_3__.httpUrl)(run.startUrl).origin);
    const created = await api.tabs.create({url: intent.bootstrapUrl, active: false});
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(Number.isSafeInteger(created?.id), 'E_EFFECT_UNKNOWN', 'No native owned tab receipt');
    creatingTabs.set(run.runId, created.id);
    await tx('readwrite', async transaction => {
      const value = await transaction.get('commandJournal', creationKey);
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(value.submissionCount === 1 && value.tabId === null, 'E_EFFECT_UNKNOWN');
      value.tabId = created.id; value.receiptAt = now(); value.state = 'created';
      await transaction.put('commandJournal', value, creationKey);
      const current = await transaction.get('runs', run.runId);
      current.nativeTabId = created.id; current.nativeFence.tabEpoch = tabEpochs.get(created.id) || 0;
      current.nativeFence.frameEpoch = frameEpochs.get((0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.canonical)([created.id, 0])) || 0;
      await transaction.put('runs', current, current.runId);
    });
    const bootstrap = await waitDocument(run, created.id, {bootstrapUrl: intent.bootstrapUrl});
    await (0,_target_index_js__WEBPACK_IMPORTED_MODULE_3__.requireGrant)(api, (0,_target_index_js__WEBPACK_IMPORTED_MODULE_3__.httpUrl)(run.startUrl).origin);
    await tx('readwrite', async transaction => {
      await owner(transaction, await transaction.get('runs', run.runId), host, sender, {active: true});
      const value = await transaction.get('commandJournal', creationKey);
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(!value.navigationSubmissionCount, 'E_EFFECT_UNKNOWN');
      value.bootstrapDocumentId = bootstrap.documentId; value.navigationSubmissionCount = 1; value.navigationState = 'dispatched';
      await transaction.put('commandJournal', value, creationKey);
    });
    await api.tabs.update(created.id, {url: run.startUrl});
    const observed = await waitDocument(run, created.id, {changedFrom: bootstrap.documentId});
    return {...observed, creationId: intent.creationId};
  }
  async function startControllerRun(request, sender) {
    fields(request, ['requestId', 'scriptId', 'revision', 'contentHash', 'paramsWire', 'target', 'deadlineAt'],
      ['requestId', 'scriptId', 'revision', 'contentHash', 'paramsWire', 'target', 'deadlineAt']);
    id(request.requestId); id(request.scriptId); selection(request.target); (0,_page_port_codec_js__WEBPACK_IMPORTED_MODULE_1__.decodeValue)(request.paramsWire);
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(Number.isSafeInteger(request.revision) && request.revision > 0 && /^[a-f0-9]{64}$/.test(request.contentHash), 'E_REVISION');
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(Number.isSafeInteger(request.deadlineAt) && request.deadlineAt > now(), 'E_TIMEOUT');
    const host = await assertHost(sender), requestDigest = await (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.digest)(request);
    const selectedOrigin = request.target.mode === 'owned' ? (0,_target_index_js__WEBPACK_IMPORTED_MODULE_3__.httpUrl)(request.target.url).origin : null;
    let observed;
    if (request.target.mode === 'borrowed') observed = await (0,_target_index_js__WEBPACK_IMPORTED_MODULE_3__.observeControllerTarget)({api, ...request.target});
    else await (0,_target_index_js__WEBPACK_IMPORTED_MODULE_3__.requireGrant)(api, (0,_target_index_js__WEBPACK_IMPORTED_MODULE_3__.httpUrl)(request.target.url).origin);
    const capturedFence = nativeFence(request.target.tabId, selectedOrigin || observed.allowedOrigin, request.target.frameId ?? 0);
    const admissionKey = `controller-start:${(0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.canonical)([host.registrationId, request.requestId])}`;
    const admitted = await tx('readwrite', async transaction => {
      await currentHost(transaction, host, sender);
      const old = await transaction.get('commandJournal', admissionKey);
      if (old) {
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(old.requestDigest === requestDigest, 'E_REQUEST_CONFLICT');
        return {run: await owner(transaction, await transaction.get('runs', old.runId), host, sender), duplicate: true};
      }
      const slot = await transaction.get('runs', '@slot');
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(!slot?.currentRunId, 'E_OWNER', 'Previous controller target has not retired');
      const runId = (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.newId)(), run = {tag: 'controller-run', runId, namespace: namespace(host), principal: host.principal,
        registrationId: host.registrationId, hostDocumentId: host.hostDocumentId, hostInstanceId: host.hostInstanceId,
        browserSessionIncarnation: session, scriptId: request.scriptId, contentHash: request.contentHash,
        opId: (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.newId)(), resultId: (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.newId)(), requestId: request.requestId, requestDigest, deadlineAt: request.deadlineAt,
        paramsWire: structuredClone(request.paramsWire), selection: structuredClone(request.target),
        startUrl: request.target.mode === 'owned' ? (0,_target_index_js__WEBPACK_IMPORTED_MODULE_3__.httpUrl)(request.target.url).href : null,
        nativeFence: capturedFence, nativeTabId: request.target.tabId ?? null,
        state: 'preparing', ownerEpoch: 1, runRevision: 1, eventSeq: 0, cancelSeq: 0, workerRetired: false,
        retirementState: 'not-started', target: null, identity: null, revision: null, createdAt: now()};
      await transaction.put('runs', run, runId);
      await lease(transaction, run);
      await transaction.put('runs', {tag: 'slot', currentRunId: runId, state: 'held', releaseCount: 0, fencedEpoch: 1, retirementId: null}, '@slot');
      await transaction.put('commandJournal', {tag: 'controller-start', runId, requestDigest}, admissionKey);
      return {run, duplicate: false};
    });
    const run = admitted.run;
    if (admitted.duplicate) return {runId: run.runId, state: run.state, duplicate: true, runRevision: run.runRevision};
    try {
      const pinned = await storage.pinScriptRevision(scriptContext(host, sender, run), request);
      await tx('readwrite', async transaction => {
        const current = await owner(transaction, await transaction.get('runs', run.runId), host, sender, {active: true});
        current.revision = {scriptId: run.scriptId, revision: pinned.revision.revision, sourceHash: pinned.revision.contentHash, pinKey: pinned.pinKey};
        await transaction.put('runs', current, current.runId);
      });
      if (!observed) observed = await createOwned(run, host, sender);
      await (0,_target_index_js__WEBPACK_IMPORTED_MODULE_3__.verifyControllerTarget)({api, target: observed});
      return tx('readwrite', async transaction => {
        const current = await owner(transaction, await transaction.get('runs', run.runId), host, sender, {active: true});
        current.target = {...observed, targetSessionId: (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.newId)(), targetVersion: 1, mode: request.target.mode, browserSessionIncarnation: session};
        current.identity = {tag: 'controller-run', runId: current.runId, hostInstanceId: host.hostInstanceId, hostDocumentId: host.hostDocumentId,
          ownerEpoch: current.ownerEpoch, scriptId: current.scriptId, revision: current.revision.revision, contentHash: current.contentHash, target: current.target};
        current.state = 'running'; current.runRevision++; current.eventSeq++;
        boundTargets.set(current.runId, current.target);
        creatingTabs.delete(current.runId);
        await transaction.put('runs', current, current.runId);
        return {...project(current), sourceUtf8: pinned.revision.sourceUtf8, paramsWire: current.paramsWire};
      });
    } catch (error) {
      // No control realm has been created yet. Preserve uncertain creation facts;
      // the host can explicitly retire known targets without guessing absence.
      const settled = await settleInternal(run.runId, 'failed', {error: typed(error)}, {workerRetired: true});
      await retire({...run, ...settled.run}, host, sender);
      error.runId = run.runId; throw error;
    }
  }
  async function admittedOperation(transaction, envelope, host, sender, {post = false, handoff} = {}) {
    const run = await owner(transaction, await transaction.get('runs', envelope.identity.runId), host, sender, {active: true});
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(envelope.identity.tag === 'controller-run' && same(envelope.identity, {...run.identity, target: envelope.target}) &&
      same(envelope.revision, run.revision), 'E_OWNER', 'Controller operation binding differs');
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(same(envelope.target, run.target), 'E_DOCUMENT_REPLACED');
    if (run.navigationRequestId) (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(run.navigationRequestId === envelope.requestId, 'E_DOCUMENT_REPLACED', 'Navigation fenced old operations');
    if (handoff) (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(post && handoff.from.documentId === run.target.documentId && handoff.to.tabId === run.target.tabId &&
      handoff.to.frameId === run.target.frameId && handoff.to.targetVersion === run.target.targetVersion + 1 &&
      handoff.to.browserSessionIncarnation === session && handoff.to.mode === run.target.mode,
    'E_DOCUMENT_REPLACED', 'Native navigation handoff differs');
    return run;
  }
  async function controllerOperation(request, sender) {
    fields(request, ['envelope'], ['envelope']);
    const envelope = structuredClone(request.envelope);
    fields(envelope, ['requestId', 'identity', 'revision', 'target', 'operation'], ['requestId', 'identity', 'revision', 'target', 'operation']);
    id(envelope.requestId);
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(envelope.identity?.tag === 'controller-run', 'E_OWNER');
    id(envelope.identity.runId);
    fields(envelope.operation, ['kind', 'method', 'args'], ['kind', 'method', 'args']);
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(Array.isArray((0,_framework_control_value_js__WEBPACK_IMPORTED_MODULE_2__.decodeValue)(envelope.operation.args, {maxBytes: envelope.operation.method === 'uploadChunk' ? 131072 : 65536})), 'E_SCHEMA');
    const host = await assertHost(sender), key = opKey(envelope.identity.runId, envelope.requestId), requestDigest = await (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.digest)(envelope);
    const previous = await tx('readonly', async transaction => {
      await owner(transaction, await transaction.get('runs', envelope.identity.runId), host, sender);
      const value = await transaction.get('commandJournal', key);
      if (value) (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(value.requestDigest === requestDigest, 'E_REQUEST_CONFLICT');
      return value;
    });
    if (previous?.reply) {
      const target = previous.reply.handoff?.to || envelope.target;
      await (0,_target_index_js__WEBPACK_IMPORTED_MODULE_3__.verifyControllerTarget)({api, target});
      await tx('readonly', async transaction => {
        const run = await owner(transaction, await transaction.get('runs', envelope.identity.runId), host, sender, {active: true});
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(same(envelope.identity, {...run.identity, target: envelope.target}) && same(envelope.revision, run.revision), 'E_OWNER');
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(same(target, run.target) && !run.navigationRequestId, 'E_DOCUMENT_REPLACED');
      });
      return previous.reply;
    }
    if (pending.has(key)) return pending.get(key);
    if (previous) throw new _protocol_js__WEBPACK_IMPORTED_MODULE_0__.FoundationError('E_EFFECT_UNKNOWN', 'Dispatched controller operation is not replayable');
    const completion = perform(); pending.set(key, completion);
    try { return await completion; } finally { if (pending.get(key) === completion) pending.delete(key); }
    async function perform() {
      const navigation = envelope.operation.kind === 'browser' && ['goto', 'reload'].includes(envelope.operation.method);
      const run = await tx('readwrite', async transaction => {
        const current = await admittedOperation(transaction, envelope, host, sender);
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(!await transaction.get('commandJournal', key), 'E_EFFECT_UNKNOWN');
        if (navigation) {
          (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(!current.navigationRequestId, 'E_DOCUMENT_REPLACED');
          current.navigationRequestId = envelope.requestId;
          await transaction.put('runs', current, current.runId);
        }
        await transaction.put('commandJournal', {tag: navigation ? 'controller-navigation' : 'controller-operation', runId: current.runId,
          requestDigest, envelope, state: 'dispatched', submissionCount: 1, dispatchAt: now()}, key);
        return current;
      });
      if (navigation) navigating.set(run.runId, envelope.requestId);
      const abort = new AbortController(); cancellations.set(key, {runId: run.runId, abort});
      const driver = (0,_framework_control_native_driver_js__WEBPACK_IMPORTED_MODULE_4__.createControllerDriver)({api, clock, authorize: async (captured, details = {}) => {
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(same(captured, envelope), 'E_OWNER');
        if (details.url !== undefined) {
          (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)((0,_target_index_js__WEBPACK_IMPORTED_MODULE_3__.httpUrl)(details.url).origin === envelope.target.allowedOrigin, 'E_PERMISSION', 'Cross-origin controller operation denied');
          await (0,_target_index_js__WEBPACK_IMPORTED_MODULE_3__.requireGrant)(api, (0,_target_index_js__WEBPACK_IMPORTED_MODULE_3__.httpUrl)(details.url).origin);
        }
        await (0,_target_index_js__WEBPACK_IMPORTED_MODULE_3__.requireGrant)(api, envelope.target.allowedOrigin);
        if (details.handoff) await (0,_target_index_js__WEBPACK_IMPORTED_MODULE_3__.verifyControllerTarget)({api, target: details.handoff.to});
        else if (details.navigationPending) {
          (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(navigation, 'E_OWNER', 'Only the original navigation intent may wait across documents');
          const observed = await (0,_target_index_js__WEBPACK_IMPORTED_MODULE_3__.observeControllerTarget)({api, tabId: envelope.target.tabId, frameId: envelope.target.frameId});
          (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(observed.allowedOrigin === envelope.target.allowedOrigin, 'E_PERMISSION');
        } else await (0,_target_index_js__WEBPACK_IMPORTED_MODULE_3__.verifyControllerTarget)({api, target: envelope.target});
        return tx('readonly', transaction => admittedOperation(transaction, envelope, host, sender,
          {post: details.phase === 'post', handoff: details.handoff}));
      }});
      try {
        const reply = await driver.execute(envelope, {signal: abort.signal, deadlineAt: run.deadlineAt,
          recordReceipt: async receipt => tx('readwrite', async transaction => {
            const operation = await transaction.get('commandJournal', key);
            (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(operation?.requestDigest === requestDigest && operation.submissionCount === 1, 'E_REQUEST_CONFLICT');
            (operation.nativeReceipts ||= []).push(structuredClone(receipt));
            await transaction.put('commandJournal', operation, key);
          }, ['commandJournal'])});
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(reply?.requestId === envelope.requestId, 'E_RESULT_FORMAT');
        if (reply.error) throw Object.assign(new Error(reply.error.message), reply.error);
        const valueWire = (0,_page_port_codec_js__WEBPACK_IMPORTED_MODULE_1__.encodeValue)((0,_framework_control_value_js__WEBPACK_IMPORTED_MODULE_2__.decodeValue)(reply.value));
        // Record observed native effect before checking delivery permission.
        // Cancellation cannot erase the receipt or make this request replayable.
        await tx('readwrite', async transaction => {
          const operation = await transaction.get('commandJournal', key);
          (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(operation?.requestDigest === requestDigest && operation.submissionCount === 1, 'E_REQUEST_CONFLICT');
          operation.state = 'durable'; operation.valueWire = valueWire; operation.receiptAt = now(); operation.reply = reply;
          if (reply.handoff) operation.targetTransition = {navigationIntentId: envelope.requestId,
            from: structuredClone(reply.handoff.from), to: structuredClone(reply.handoff.to)};
          await transaction.put('commandJournal', operation, key);
        });
        return await tx('readwrite', async transaction => {
          const current = await admittedOperation(transaction, envelope, host, sender, {post: true, handoff: reply.handoff});
          if (navigation) {
            (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(reply.handoff, 'E_DOCUMENT_REPLACED');
            current.target = structuredClone(reply.handoff.to); current.identity.target = current.target;
            boundTargets.set(current.runId, current.target);
            delete current.navigationRequestId; current.runRevision++; current.eventSeq++;
            await transaction.put('runs', current, current.runId);
          }
          return reply;
        });
      } catch (error) {
        await tx('readwrite', async transaction => {
          const operation = await transaction.get('commandJournal', key);
          if (!operation || operation.state === 'durable') return;
          operation.state = error.code === 'E_CANCELLED' || error.code === 'E_TIMEOUT' ? 'cancelled' : 'effect_unknown';
          operation.failure = typed(error); operation.deliveryState = 'fenced';
          await transaction.put('commandJournal', operation, key);
          const current = await transaction.get('runs', run.runId);
          if (current?.navigationRequestId === envelope.requestId) delete current.navigationRequestId;
          if (current && live.has(current.state) && !current.cancelSeq && operation.state === 'effect_unknown') {
            current.state = 'paused_unknown'; current.terminalReason = typed(error); current.runRevision++;
          }
          if (current) { await transaction.put('runs', current, current.runId); await lease(transaction, current); }
        });
        throw error;
      } finally { cancellations.delete(key); if (navigation) navigating.delete(run.runId); }
    }
  }
  function abortOperations(runId, code) {
    for (const value of cancellations.values()) if (value.runId === runId) value.abort.abort(new _protocol_js__WEBPACK_IMPORTED_MODULE_0__.FoundationError(code, code));
  }
  async function stopControllerRun(request, sender) {
    fields(request, ['runId', 'requestId', 'expectedRunRevision', 'reason'], ['runId', 'requestId']); id(request.runId); id(request.requestId);
    const host = await assertHost(sender), key = `controller-stop:${(0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.canonical)([request.runId, request.requestId])}`;
    const answer = await tx('readwrite', async transaction => {
      const run = await owner(transaction, await transaction.get('runs', request.runId), host, sender);
      const old = await transaction.get('commandJournal', key);
      if (old) { (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(old.requestDigest === (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.canonical)(request), 'E_REQUEST_CONFLICT'); return old.response; }
      if (!run.cancelSeq && !terminals.has(run.state) && !run.retirementId) {
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(request.expectedRunRevision === undefined || request.expectedRunRevision === run.runRevision, 'E_REVISION');
        run.cancelSeq++; run.ownerEpoch++; run.runRevision++; run.eventSeq++; run.state = 'stopping';
        run.terminalReason = request.reason || 'E_CANCELLED'; await transaction.put('runs', run, run.runId); await lease(transaction, run);
      }
      const response = {runId: run.runId, state: run.state, cancelSeq: run.cancelSeq, runRevision: run.runRevision};
      await transaction.put('commandJournal', {tag: 'controller-stop', requestDigest: (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.canonical)(request), response}, key);
      return response;
    });
    abortOperations(request.runId, request.reason === 'E_TIMEOUT' ? 'E_TIMEOUT' : 'E_CANCELLED');
    const run = await tx('readonly', transaction => transaction.get('runs', request.runId), ['runs']);
    await (0,_framework_control_native_driver_js__WEBPACK_IMPORTED_MODULE_4__.createControllerDriver)({api, clock, authorize: async () => true}).cancel(run).catch(() => {});
    return answer;
  }
  async function settleInternal(runId, status, outcome, {workerRetired = false, host, sender, requestId, requestDigest} = {}) {
    return tx('readwrite', async transaction => {
      const run = await transaction.get('runs', runId);
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(run?.tag === 'controller-run', 'E_OWNER');
      if (host) await owner(transaction, run, host, sender);
      if (requestId) {
        const key = `controller-finish:${(0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.canonical)([runId, requestId])}`, previous = await transaction.get('commandJournal', key);
        if (previous) (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(previous.requestDigest === requestDigest, 'E_REQUEST_CONFLICT');
        else await transaction.put('commandJournal', {tag: 'controller-finish', runId, requestDigest}, key);
      }
      const old = await transaction.get('results', run.resultId);
      if (old) {
        if (old.state === 'completed' && status === 'completed') (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(same(old.outcome.valueWire, outcome.valueWire),
          'E_REQUEST_CONFLICT', 'Controller terminal value is immutable');
        if (workerRetired && !run.workerRetired) { run.workerRetired = true; await transaction.put('runs', run, runId); await lease(transaction, run); }
        return {run: project(run), result: old};
      }
      const terminal = run.cancelSeq ? (run.terminalReason === 'E_HOST_CLOSED' ? 'interrupted' : 'stopped') : status;
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(terminals.has(terminal), 'E_SCHEMA');
      const expired = now() >= run.deadlineAt;
      const state = expired && terminal === 'completed' ? 'stopped' : terminal;
      const result = {tag: 'controller-result', resultId: run.resultId, runId, namespace: run.namespace, principal: run.principal,
        revision: run.revision, state, outcome: state === 'completed' ? {ok: true, valueWire: outcome.valueWire} :
          {ok: false, error: run.cancelSeq || expired ? typed(new _protocol_js__WEBPACK_IMPORTED_MODULE_0__.FoundationError(expired ? 'E_TIMEOUT' : run.terminalReason || 'E_CANCELLED', 'Controller fenced')) : outcome.error},
        committedAt: now()};
      if (result.outcome.ok) (0,_page_port_codec_js__WEBPACK_IMPORTED_MODULE_1__.decodeValue)(result.outcome.valueWire);
      if (state === 'completed') (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(!(await transaction.all('commandJournal')).some(value => value.runId === runId &&
        ['controller-operation', 'controller-navigation'].includes(value.tag) && ['dispatched', 'effect_unknown'].includes(value.state)),
      'E_EFFECT_UNKNOWN', 'Unsettled controller effects prevent success');
      run.state = state; run.cancelSeq++; run.ownerEpoch++; run.runRevision++; run.eventSeq++;
      run.workerRetired = workerRetired; run.retirementId = (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.newId)(); run.retirementState = 'fenced';
      run.terminalReason = result.outcome.ok ? null : result.outcome.error;
      await transaction.put('results', result, run.resultId); await transaction.put('runs', run, runId);
      await lease(transaction, run);
      const slot = await transaction.get('runs', '@slot');
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(slot?.currentRunId === runId, 'E_OWNER');
      slot.retirementId = run.retirementId; slot.fencedEpoch = run.ownerEpoch;
      await transaction.put('runs', slot, '@slot');
      return {run: project(run), result};
    });
  }
  async function finishControllerRun(request, sender) {
    fields(request, ['runId', 'requestId', 'status', 'valueWire', 'error', 'workerRetired'], ['runId', 'requestId', 'status', 'workerRetired']);
    id(request.runId); id(request.requestId);
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(['succeeded', 'error', 'stopped', 'timeout', 'host-closed'].includes(request.status) && typeof request.workerRetired === 'boolean', 'E_SCHEMA');
    const host = await assertHost(sender);
    await tx('readonly', async transaction => owner(transaction, await transaction.get('runs', request.runId), host, sender));
    const state = request.status === 'succeeded' ? 'completed' : request.status === 'error' ? 'failed' : request.status === 'host-closed' ? 'interrupted' : 'stopped';
    const answer = await settleInternal(request.runId, state, request.status === 'succeeded' ? {valueWire: request.valueWire} :
      {error: request.error || typed(new _protocol_js__WEBPACK_IMPORTED_MODULE_0__.FoundationError(request.status === 'timeout' ? 'E_TIMEOUT' : 'E_CANCELLED', request.status))},
      {...request, host, sender, requestDigest: await (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.digest)(request)});
    abortOperations(request.runId, request.status === 'timeout' ? 'E_TIMEOUT' : 'E_CANCELLED');
    return answer;
  }
  async function retireControllerTarget(request, sender) {
    fields(request, ['runId'], ['runId']); id(request.runId);
    const host = await assertHost(sender);
    const run = await tx('readonly', async transaction => owner(transaction, await transaction.get('runs', request.runId), host, sender));
    return retire(run, host, sender);
  }
  async function retire(run, host, sender) {
    if (run.retirementState === 'released') return {state: 'released', releaseCount: 1};
    if (!run.retirementId || !run.workerRetired) return {state: 'pending', releaseCount: 0, reason: 'worker-not-retired'};
    await (0,_framework_control_native_driver_js__WEBPACK_IMPORTED_MODULE_4__.createControllerDriver)({api, clock, authorize: async () => true}).cancel(run).catch(() => {});
    let absence = 'borrowed-not-closed';
    if (run.selection.mode === 'owned') {
      const intent = await tx('readonly', transaction => transaction.get('commandJournal', `controller-create:${run.runId}`), ['commandJournal']);
      if (intent && (!Number.isSafeInteger(intent.tabId) || intent.browserSessionIncarnation !== session))
        return {state: 'pending', releaseCount: 0, reason: 'creation-unknown'};
      if (intent) {
        // The durable creation callback, same browser incarnation and committed
        // run fence establish ownership; borrowed selections never enter here.
        const call = await tx('readwrite', async transaction => {
          const current = await transaction.get('runs', run.runId);
          (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(current.retirementId === run.retirementId && current.workerRetired && current.browserSessionIncarnation === session, 'E_OWNER');
          const key = `controller-retirement:${run.retirementId}`, old = await transaction.get('commandJournal', key);
          if (old) return false;
          await transaction.put('commandJournal', {tag: 'controller-retirement', runId: run.runId, retirementId: run.retirementId,
            submissionCount: 1, state: 'remove-dispatched', tabId: intent.tabId, dispatchAt: now()}, key);
          return true;
        });
        if (call) try { await api.tabs.remove(intent.tabId); } catch { /* Absence is verified independently. */ }
        try { await api.tabs.get(intent.tabId); return {state: 'pending', releaseCount: 0, reason: 'owned-tab-present'}; }
        catch (error) {
          (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(/No tab with id|Invalid tab ID|tab not found/i.test(error?.message || ''), 'E_TARGET', 'Query error is not target absence');
        }
        absence = 'owned-tabs.get-not-found';
      } else absence = 'not-created-before-dispatch';
    }
    if (host && run.revision) await storage.releaseScriptRevisionPin(scriptContext(host, sender, run, {retiring: true}),
      {scriptId: run.scriptId, revision: run.revision.revision});
    return tx('readwrite', async transaction => {
      const current = await transaction.get('runs', run.runId), slot = await transaction.get('runs', '@slot');
      if (current.retirementState === 'released') return {state: 'released', releaseCount: 1};
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(current.workerRetired && current.retirementId === run.retirementId && slot?.currentRunId === run.runId &&
        slot.retirementId === run.retirementId && slot.releaseCount === 0, 'E_OWNER');
      if (host) await owner(transaction, current, host, sender);
      current.retirementState = 'released'; current.runRevision++;
      await transaction.put('runs', current, current.runId);
      await lease(transaction, current);
      // Host disappearance cannot call a host-authorized revision API. Release
      // only this existing exact pin after realm/target retirement is proven.
      if (!host && current.revision) {
        const pin = await transaction.get('commandJournal', current.revision.pinKey);
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(pin?.runId === current.runId && pin.opKey === `controller-pin:${current.runId}`, 'E_OWNER');
        await transaction.put('commandJournal', {...pin, released: true}, current.revision.pinKey);
      }
      await transaction.put('runs', {...slot, currentRunId: null, state: 'available', releaseCount: 1}, '@slot');
      boundTargets.delete(current.runId); navigating.delete(current.runId); creatingTabs.delete(current.runId);
      await transaction.put('commandJournal', {tag: 'controller-retirement', runId: run.runId, retirementId: run.retirementId,
        releaseCount: 1, absence, releasedAt: now()}, `controller-retirement:${run.retirementId}`);
      return {state: 'released', releaseCount: 1, retirementId: run.retirementId};
    });
  }
  async function loseControllerHost(registrationId, {documentGone = false} = {}) {
      const runs = await tx('readonly', async transaction => (await transaction.all('runs')).filter(run => run.tag === 'controller-run' &&
      run.registrationId === registrationId && run.retirementState !== 'released'), ['runs']);
    for (const run of runs) {
      abortOperations(run.runId, 'E_HOST_CLOSED');
      if (documentGone) {
        if (terminals.has(run.state)) {
          const answer = await settleInternal(run.runId, 'interrupted', {}, {workerRetired: true});
          await retire({...run, ...answer.run}, null, null);
          continue;
        }
        await tx('readwrite', async transaction => {
          const current = await transaction.get('runs', run.runId);
          current.cancelSeq++; current.ownerEpoch++; current.terminalReason = 'E_HOST_CLOSED';
          await transaction.put('runs', current, current.runId);
          await lease(transaction, current);
        }, ['runs', 'commandJournal']);
        const answer = await settleInternal(run.runId, 'interrupted', {error: typed(new _protocol_js__WEBPACK_IMPORTED_MODULE_0__.FoundationError('E_HOST_CLOSED', 'Host document is gone'))}, {workerRetired: true});
        await (0,_framework_control_native_driver_js__WEBPACK_IMPORTED_MODULE_4__.createControllerDriver)({api, clock, authorize: async () => true}).cancel(run).catch(() => {});
        await retire({...run, ...answer.run}, null, null);
      } else await tx('readwrite', async transaction => {
        const current = await transaction.get('runs', run.runId);
        if (!terminals.has(current.state)) { current.state = 'paused_unknown'; current.runRevision++; await transaction.put('runs', current, current.runId); await lease(transaction, current); }
      }, ['runs', 'commandJournal']);
    }
  }
  async function invalidateControllerTarget({tabId, frameId = 0, documentId, removed = false, permissionRemoved = false, origins = []} = {}) {
    // Synchronous event fences precede the first IDB await. Re-granting a site
    // cannot revive an operation waiting for that transaction to acquire a lock.
    if (permissionRemoved) {
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(Array.isArray(origins) && origins.every(pattern => typeof pattern === 'string'), 'E_SCHEMA');
      if (!origins.length) return [];
      permissionRemovals.push([...origins]);
    } else if (Number.isSafeInteger(tabId)) {
      const targets = [...boundTargets].filter(([, target]) => target.tabId === tabId && target.frameId === frameId);
      if (removed)
        tabEpochs.set(tabId, (tabEpochs.get(tabId) || 0) + 1);
      else if (!(frameId === 0 && [...creatingTabs.values()].includes(tabId)) && !targets.some(([runId, target]) => navigating.has(runId) || documentId === target.documentId)) {
        const key = (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.canonical)([tabId, frameId]); frameEpochs.set(key, (frameEpochs.get(key) || 0) + 1);
      }
    }
    const runs = await tx('readwrite', async transaction => {
      const invalidated = [];
      for (const run of await transaction.all('runs')) {
        if (run.tag !== 'controller-run' || !live.has(run.state)) continue;
        if (permissionRemoved) {
          const origin = run.target?.allowedOrigin || run.startUrl && (0,_target_index_js__WEBPACK_IMPORTED_MODULE_3__.httpUrl)(run.startUrl).origin;
          if (!origin || !origins.some(pattern => originMatches(pattern, origin))) continue;
        } else if ((run.target?.tabId !== tabId && run.nativeTabId !== tabId) || !removed && frameId !== 0 &&
          (run.target?.frameId ?? run.selection.frameId ?? 0) !== frameId) continue;
        if (!removed && !permissionRemoved && (run.navigationRequestId || creatingTabs.get(run.runId) === tabId)) continue;
        if (!removed && !permissionRemoved && documentId === run.target?.documentId) continue;
        if (!removed && !permissionRemoved && frameId === 0 && documentId === run.target?.rootDocumentId) continue;
        run.cancelSeq++; run.ownerEpoch++; run.runRevision++; run.state = 'stopping';
        run.terminalReason = permissionRemoved ? 'E_PERMISSION' : 'E_DOCUMENT_REPLACED';
        await transaction.put('runs', run, run.runId); invalidated.push(run);
        await lease(transaction, run);
      }
      return invalidated;
    }, ['runs', 'commandJournal']);
    for (const run of runs) abortOperations(run.runId, run.terminalReason);
    return runs.map(project);
  }
  async function recoverControllers() {
    return tx('readwrite', async transaction => {
      for (const operation of await transaction.all('commandJournal')) {
        if (['controller-operation', 'controller-navigation', 'controller-target-create'].includes(operation.tag) && operation.state === 'dispatched') {
          operation.state = 'effect_unknown'; await transaction.put('commandJournal', operation,
            operation.tag === 'controller-target-create' ? `controller-create:${operation.runId}` : opKey(operation.runId, operation.envelope.requestId));
        }
      }
      for (const run of await transaction.all('runs')) if (run.tag === 'controller-run' && !terminals.has(run.state)) {
        run.state = 'paused_unknown'; run.runRevision++; run.terminalReason = 'worker-restart';
        await transaction.put('runs', run, run.runId);
        await lease(transaction, run);
      }
      return {replayed: 0};
    });
  }
  return Object.freeze({commitControllerScript, getControllerScript, startControllerRun, controllerOperation, stopControllerRun,
    finishControllerRun, snapshotControllerRun, retireControllerTarget, loseControllerHost, invalidateControllerTarget, recoverControllers});
}


/***/ }),

/***/ "./src/platform/host/sdk-broker.js":
/*!*****************************************!*\
  !*** ./src/platform/host/sdk-broker.js ***!
  \*****************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   createSdkBroker: () => (/* binding */ createSdkBroker)
/* harmony export */ });
/* harmony import */ var _protocol_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../protocol.js */ "./src/platform/protocol.js");
/* harmony import */ var _page_port_codec_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../page-port/codec.js */ "./src/platform/page-port/codec.js");
/* harmony import */ var _framework_sdk_registry_js__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../../framework/sdk/registry.js */ "./src/framework/sdk/registry.js");
/* harmony import */ var _framework_sdk_bridge_js__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ../../framework/sdk/bridge.js */ "./src/framework/sdk/bridge.js");
/* harmony import */ var _framework_sdk_service_js__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ../../framework/sdk/service.js */ "./src/framework/sdk/service.js");
/* harmony import */ var _chrome_network_js__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! ../chrome/network.js */ "./src/platform/chrome/network.js");
/* harmony import */ var _chrome_notifications_js__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! ../chrome/notifications.js */ "./src/platform/chrome/notifications.js");








// This is a delegate of the unique broker. Identity, admission and receipts belong
// to its authority and storage; the page can supply neither context nor namespace.
function createSdkBroker({authority, storage, api, fetchImpl = globalThis.fetch,
  clock = {now:()=>Date.now()}, setTimer = setTimeout, clearTimer = clearTimeout}) {
  const pending = new Map();
  const authorize = (request, context) => context.authorize(request);
  const network = (0,_chrome_network_js__WEBPACK_IMPORTED_MODULE_5__.createNetworkService)({fetchImpl, authorize, clock, networkInfoEnabled:false});
  const notifications = (0,_chrome_notifications_js__WEBPACK_IMPORTED_MODULE_6__.createNotificationService)({api, authorize, iconUrl:api.runtime.getURL('icons/notification.png')});
  const service = (0,_framework_sdk_service_js__WEBPACK_IMPORTED_MODULE_4__.createSdkService)({network, notifications, storage,
    device:{getAppId:context => storage.getAppId(context)}});
  function ready() {
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(typeof storage.executeSdk === 'function' && typeof storage.getAppId === 'function',
      'E_RESOURCE_UNAVAILABLE', 'Shared SDK storage is unavailable');
  }
  async function execute(admission, request) {
    const {context} = admission;
    try {
      const result = await service.execute(request.method, request.args, context);
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(result?.PageBrigeCode === 0 && Object.hasOwn(result, 'data'), 'E_SCHEMA', 'Invalid driver result');
      // Drivers commit storage effects and receipts atomically. Native drivers may
      // record a fact before post-authorization; final API value is recorded here.
      return await context.recordEffect(result.data);
    } catch (error) {
      await authority.failSdk(context, error);
      throw error;
    }
  }
  async function requestSdk(payload, sender) {
    ready();
    (0,_framework_sdk_registry_js__WEBPACK_IMPORTED_MODULE_2__.fields)(payload, ['requestId','method','argsWire','deadlineAt'], ['requestId','method','argsWire','deadlineAt']);
    const request = (0,_framework_sdk_registry_js__WEBPACK_IMPORTED_MODULE_2__.validateSdkRequest)({requestId:payload.requestId, method:payload.method,
      args:(0,_page_port_codec_js__WEBPACK_IMPORTED_MODULE_1__.decodeValue)(payload.argsWire), deadlineAt:payload.deadlineAt});
    const admission = await authority.admitSdk(request, sender);
    const {operation, context} = admission;
    let receipt = admission.receipt;
    if (!receipt) {
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(operation.state !== 'effect_unknown' && operation.state !== 'dispatched' || pending.has(operation.opKey),
        'E_EFFECT_UNKNOWN', 'Dispatched SDK effect has no durable result; it cannot be repeated');
      if (operation.state === 'failed') throw new _protocol_js__WEBPACK_IMPORTED_MODULE_0__.FoundationError(operation.deliveryError?.code || 'E_EFFECT_UNKNOWN',
        operation.deliveryError?.message || 'SDK request failed');
      let execution = pending.get(operation.opKey);
      if (!execution) {
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(pending.size < 100, 'E_LIMIT', 'SDK short service concurrency limit');
        let timer;
        const timeout = Math.max(0,context.deadlineAt - clock.now());
        execution = Promise.race([execute(admission, request),new Promise((_,reject) => {
          timer = setTimer(() => reject(new _protocol_js__WEBPACK_IMPORTED_MODULE_0__.FoundationError('E_DEADLINE','SDK hard service deadline exceeded')),timeout);
        })]).catch(async error => { await authority.failSdk(context,error); throw error; })
          .finally(() => clearTimer(timer));
        pending.set(operation.opKey, execution);
        execution.finally(() => { if (pending.get(operation.opKey) === execution) pending.delete(operation.opKey); }).catch(() => {});
      }
      receipt = await execution;
    }
    // A stored success is an effect fact, never an authority to deliver after a
    // grant/document fence or the original service deadline.
    try {
      await context.authorize();
      const response = {valueWire:(0,_page_port_codec_js__WEBPACK_IMPORTED_MODULE_1__.encodeValue)((0,_framework_sdk_bridge_js__WEBPACK_IMPORTED_MODULE_3__.legacyResult)((0,_page_port_codec_js__WEBPACK_IMPORTED_MODULE_1__.decodeValue)(receipt.valueWire)))};
      await authority.settleSdkDelivery(context);
      context.assertDispatch();
      return response;
    } catch (error) {
      await authority.settleSdkDelivery(context,error); throw error;
    }
  }
  return Object.freeze({
    async hello(payload, sender) { ready(); return authority.helloSdk(payload, sender); },
    request:requestSdk,
    dispose:() => notifications.dispose(),
    diagnostics:() => ({pending:pending.size,notifications:notifications.diagnostics()})
  });
}


/***/ }),

/***/ "./src/platform/host/sdk-methods.js":
/*!******************************************!*\
  !*** ./src/platform/host/sdk-methods.js ***!
  \******************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   sdkMethods: () => (/* binding */ sdkMethods)
/* harmony export */ });
/* harmony import */ var _protocol_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../protocol.js */ "./src/platform/protocol.js");
/* harmony import */ var _environment_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../environment.js */ "./src/environment.js");
/* harmony import */ var _page_port_codec_js__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../page-port/codec.js */ "./src/platform/page-port/codec.js");
/* harmony import */ var _framework_sdk_registry_js__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ../../framework/sdk/registry.js */ "./src/framework/sdk/registry.js");






// Methods of the one run authority; this module owns no connection, router or slot.
function sdkMethods({storage, api, session, clock, assertHost, currentHost}) {
  const contexts = new WeakMap(), now = () => (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.iso)(clock);
  const tabEpochs = new Map(), frameEpochs = new Map(), permissionBases = new Map(), permissionRemovals = [];
  let notificationEpoch = 0;
  const frameKey = doc => (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.canonical)([doc.tabId, doc.frameId]);
  const removalCount = origin => permissionRemovals.filter(origins => origins.some(pattern => matchesOrigin(pattern,origin))).length;
  const epochs = doc => ({tabEpoch:tabEpochs.get(doc.tabId) || 0,
    frameEpoch:frameEpochs.get(frameKey(doc)) || 0,
    permissionEpoch:(permissionBases.get(doc.origin) || 0) + removalCount(doc.origin), notificationEpoch});
  function assertFence(captured, deadline = true) {
    const current = epochs(captured.doc);
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(current.tabEpoch === captured.tabEpoch && current.frameEpoch === captured.frameEpoch,
      'E_DOCUMENT_STALE', 'Observed document invalidation fences this SDK operation');
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(current.permissionEpoch === captured.permissionEpoch &&
      (!(captured.capability === 'notifications' || captured.capabilities?.includes('notifications')) ||
        current.notificationEpoch === captured.notificationEpoch),
    'E_GRANT_REVOKED', 'Observed permission removal fences this SDK operation');
    if (deadline) (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(clock.now() < captured.deadlineAt, 'E_DEADLINE', 'SDK short service expired');
  }
  const grantKey = doc => `sdk-grant:${(0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.canonical)([doc.tabId, doc.frameId, doc.documentId])}`;
  function document(sender) {
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(sender?.id === api.runtime.id && Number.isSafeInteger(sender.tab?.id) && sender.tab.id >= 0 &&
      sender.tab.incognito === false && Number.isSafeInteger(sender.frameId) && sender.frameId >= 0 &&
      typeof sender.documentId === 'string' && sender.documentId.length > 0 && sender.documentLifecycle === 'active',
      'E_OWNER', 'SDK needs the actual active Chrome document sender');
    const origin = (0,_environment_js__WEBPACK_IMPORTED_MODULE_1__.httpUrl)(sender.url).origin;
    return {tabId:sender.tab.id, frameId:sender.frameId, documentId:sender.documentId, origin, principal:`sdk:${origin}`};
  }
  async function native(doc) {
    const frames = await api.webNavigation.getAllFrames({tabId:doc.tabId});
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(frames?.some(frame => frame.frameId === doc.frameId && frame.documentId === doc.documentId &&
      (0,_environment_js__WEBPACK_IMPORTED_MODULE_1__.httpUrl)(frame.url).origin === doc.origin), 'E_DOCUMENT_STALE', 'SDK document is no longer current');
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(await api.permissions.contains({origins:[(0,_environment_js__WEBPACK_IMPORTED_MODULE_1__.permissionPattern)(doc.origin)]}), 'E_PERMISSION', 'SDK site permission was revoked');
  }
  async function activeGrant(tx, doc, incarnation) {
    const grant = await tx.get('commandJournal', grantKey(doc));
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(grant?.active && grant.browserSessionIncarnation === session && grant.principal === doc.principal &&
      (incarnation === undefined || grant.grantIncarnation === incarnation), 'E_GRANT_REVOKED', 'SDK grant is absent or fenced');
    assertFence({...grant,doc}, false);
    return grant;
  }
  async function grantSdk(request, sender) {
    const host = await assertHost(sender);
    (0,_framework_sdk_registry_js__WEBPACK_IMPORTED_MODULE_3__.fields)(request,['tabId','frameId','documentId','capabilities'],['tabId','frameId','documentId','capabilities']);
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(request && Number.isSafeInteger(request.tabId) && Number.isSafeInteger(request.frameId) &&
      typeof request.documentId === 'string' && Array.isArray(request.capabilities), 'E_SCHEMA', 'Invalid SDK grant');
    const frames = await api.webNavigation.getAllFrames({tabId:request.tabId});
    const frame = frames?.find(frame => frame.frameId === request.frameId && frame.documentId === request.documentId);
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(frame, 'E_DOCUMENT_STALE', 'Selected SDK document is no longer current');
    const origin = (0,_environment_js__WEBPACK_IMPORTED_MODULE_1__.httpUrl)(frame.url).origin;
    const doc = {tabId:request.tabId, frameId:request.frameId, documentId:request.documentId, origin, principal:`sdk:${origin}`};
    const capturedEpochs = epochs(doc);
    await native(doc);
    const supported = new Set(Object.values(_framework_sdk_registry_js__WEBPACK_IMPORTED_MODULE_3__.SDK_METHODS).map(method => method.capability));
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(request.capabilities.length > 0 && request.capabilities.every(capability => supported.has(capability)), 'E_CAPABILITY', 'Unknown SDK grant capability');
    const capabilities = [...new Set(request.capabilities)].sort(), key = grantKey(doc);
    return storage.transaction(['commandJournal'], 'readwrite', async tx => {
      await currentHost(tx, host, sender);
      assertFence({...capturedEpochs,doc}, false);
      const previous = await tx.get('commandJournal', key);
      if (previous?.active && previous.browserSessionIncarnation === session &&
        previous.tabEpoch === capturedEpochs.tabEpoch && previous.frameEpoch === capturedEpochs.frameEpoch &&
        previous.permissionEpoch === capturedEpochs.permissionEpoch && previous.notificationEpoch === capturedEpochs.notificationEpoch &&
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.canonical)(previous.capabilities) === (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.canonical)(capabilities))
        return {grantIncarnation:previous.grantIncarnation, documentId:doc.documentId};
      if (previous) await tx.put('commandJournal', {...previous, active:false, closedAt:now()}, `sdk-closed-grant:${previous.grantIncarnation}`);
      const grant = {tag:'sdk-grant', ...doc, ...capturedEpochs, key, namespace:`page:${origin}`, capabilities, allowedOrigins:[origin],
        grantIncarnation:(0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.newId)(), browserSessionIncarnation:session, active:true, grantedAt:now(), registrationId:host.registrationId};
      await tx.put('commandJournal', grant, key);
      return {grantIncarnation:grant.grantIncarnation, documentId:doc.documentId};
    });
  }
  async function helloSdk(request, sender) {
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(request && Object.keys(request).length === 1 && request.sdkVersion === _framework_sdk_registry_js__WEBPACK_IMPORTED_MODULE_3__.SDK_VERSION, 'E_VERSION', 'SDK version differs');
    const doc = document(sender);
    await native(doc);
    return storage.transaction(['commandJournal'], 'readonly', async tx => {
      const grant = await activeGrant(tx, doc);
      return {sdkVersion:_framework_sdk_registry_js__WEBPACK_IMPORTED_MODULE_3__.SDK_VERSION, ready:true, methods:Object.entries(_framework_sdk_registry_js__WEBPACK_IMPORTED_MODULE_3__.SDK_METHODS)
        .filter(([,method]) => grant.capabilities.includes(method.capability)).map(([name]) => name)};
    });
  }
  async function authorizeSdkInjection(request, sender, grantIncarnation) {
    const host = await assertHost(sender);
    const doc = {tabId:request.tabId,frameId:request.frameId,documentId:request.documentId};
    const frames = await api.webNavigation.getAllFrames({tabId:doc.tabId});
    const frame = frames?.find(frame => frame.frameId === doc.frameId && frame.documentId === doc.documentId);
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(frame,'E_DOCUMENT_STALE','SDK installation document changed');
    doc.origin = (0,_environment_js__WEBPACK_IMPORTED_MODULE_1__.httpUrl)(frame.url).origin; doc.principal = `sdk:${doc.origin}`;
    await native(doc);
    return storage.transaction(['commandJournal'],'readonly',async tx => {
      await currentHost(tx,host,sender);
      return activeGrant(tx,doc,grantIncarnation);
    });
  }
  async function authorizeSdkInTransaction(tx, context) {
    const captured = contexts.get(context);
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(captured, 'E_OWNER', 'SDK context was not issued by the shared authority');
    assertFence(captured);
    const grant = await activeGrant(tx, captured.doc, captured.grantIncarnation);
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(grant.namespace === captured.namespace && grant.capabilities.includes(captured.capability), 'E_PERMISSION', 'SDK capability is not granted');
    const operation = await tx.get('commandJournal', captured.opKey);
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(operation?.opId === captured.opId && operation.requestDigest === captured.requestDigest &&
      operation.grantIncarnation === captured.grantIncarnation, 'E_REQUEST_CONFLICT', 'SDK admission changed');
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(operation.state !== 'effect_unknown' && !operation.cancelSeq, 'E_EFFECT_UNKNOWN', 'Unknown SDK effect cannot be replayed');
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(clock.now() < captured.deadlineAt, 'E_DEADLINE', 'SDK short service expired');
    return {grant, operation};
  }
  async function authorizeSdk(context, request = {}) {
    const captured = contexts.get(context);
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(captured, 'E_OWNER', 'SDK context was not issued by the shared authority');
    await native(captured.doc);
    let targetOrigin;
    if (request.url !== undefined) {
      targetOrigin = (0,_environment_js__WEBPACK_IMPORTED_MODULE_1__.httpUrl)(request.url).origin;
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(await api.permissions.contains({origins:[(0,_environment_js__WEBPACK_IMPORTED_MODULE_1__.permissionPattern)(targetOrigin)]}), 'E_PERMISSION', 'SDK request origin is not permitted');
    }
    if (request.capability === 'notifications') (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(await api.permissions.contains({permissions:['notifications']}), 'E_PERMISSION', 'Notifications permission is absent');
    return storage.transaction(['commandJournal'], request.phase === 'pre' ? 'readwrite' : 'readonly', async tx => {
      const admitted = await authorizeSdkInTransaction(tx, context);
      if (request.capability) (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(admitted.grant.capabilities.includes(request.capability), 'E_PERMISSION', 'SDK request capability is not granted');
      if (targetOrigin) (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(admitted.grant.allowedOrigins.includes(targetOrigin), 'E_PERMISSION', 'SDK cross-origin capability is absent');
      if (request.phase === 'pre' && ['network','notifications','storage.session'].includes(request.capability)) {
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(admitted.operation.state === 'admitted', 'E_EFFECT_UNKNOWN', 'SDK external effect already dispatched');
        admitted.operation.state = 'dispatched'; admitted.operation.submissionCount = 1; admitted.operation.dispatchAt = now();
        await tx.put('commandJournal', admitted.operation, captured.opKey);
      }
      return admitted;
    });
  }
  async function recordSdkEffect(context, value) {
    const captured = contexts.get(context);
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(captured, 'E_OWNER', 'Effect receipt requires the original trusted driver context');
    const valueWire = (0,_page_port_codec_js__WEBPACK_IMPORTED_MODULE_2__.encodeValue)(value);
    return storage.transaction(['commandJournal','results','runs'], 'readwrite', async tx => {
      const operation = await tx.get('commandJournal', captured.opKey);
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(operation?.opId === captured.opId && operation.requestDigest === captured.requestDigest &&
        (['admitted','dispatched','durable'].includes(operation.state) ||
          operation.state === 'effect_unknown' && operation.submissionCount === 1), 'E_EFFECT_UNKNOWN', 'Effect receipt differs from admission');
      const old = await tx.get('results', captured.resultId);
      if (old) {
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(old.tag === 'sdk-result' && old.state === 'durable' && old.resultId === captured.resultId &&
          old.runId === captured.runId && old.opId === captured.opId && old.namespace === captured.namespace &&
          old.grantIncarnation === captured.grantIncarnation && old.requestDigest === captured.requestDigest,
        'E_EFFECT_UNKNOWN', 'Existing SDK result differs from admission');
        const run = await tx.get('runs',captured.runId);
        if (run && run.state !== 'completed') await tx.put('runs',{...run,state:'completed',resultId:old.resultId,completedAt:now()},run.runId);
        return old;
      }
      const result = {tag:'sdk-result', state:'durable', resultId:captured.resultId, opId:captured.opId, runId:captured.runId,
        namespace:captured.namespace, principal:captured.principal, requestId:captured.requestId,
        opKey:captured.opKey, requestDigest:captured.requestDigest, browserSessionIncarnation:captured.browserSessionIncarnation,
        valueWire, receiptAt:now(), grantIncarnation:captured.grantIncarnation};
      operation.state = 'durable'; operation.resultId = result.resultId; operation.receiptAt = result.receiptAt;
      await tx.put('results', result, result.resultId);
      await tx.put('commandJournal', operation, captured.opKey);
      const run = await tx.get('runs', captured.runId);
      if (run) await tx.put('runs', {...run,state:'completed',resultId:result.resultId,completedAt:now()}, run.runId);
      return result;
    });
  }
  async function recordSdkNativeReceipt(context, receipt) {
    const captured = contexts.get(context);
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(captured, 'E_OWNER', 'Native receipt requires the original driver context');
    const receiptWire = (0,_page_port_codec_js__WEBPACK_IMPORTED_MODULE_2__.encodeValue)(receipt);
    return storage.transaction(['commandJournal'], 'readwrite', async tx => {
      const operation = await tx.get('commandJournal', captured.opKey);
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(operation?.opId === captured.opId && operation.requestDigest === captured.requestDigest &&
        (['dispatched','durable'].includes(operation.state) ||
          operation.state === 'effect_unknown' && operation.submissionCount === 1), 'E_EFFECT_UNKNOWN', 'Native receipt has no matching dispatch');
      operation.nativeReceiptWire = receiptWire; operation.nativeReceiptAt = now();
      await tx.put('commandJournal', operation, captured.opKey);
    });
  }
  async function failSdk(context, error) {
    const captured = contexts.get(context);
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(captured, 'E_OWNER', 'Failure requires the original driver context');
    return storage.transaction(['commandJournal','runs'], 'readwrite', async tx => {
      const operation = await tx.get('commandJournal', captured.opKey);
      if (!operation || operation.opId !== captured.opId) return;
      operation.deliveryError = {code:error.code || 'E_EFFECT_UNKNOWN', message:String(error.message || error)};
      operation.deliveryState = 'denied';
      if (!['durable','effect_unknown'].includes(operation.state)) operation.state = operation.state === 'dispatched' ? 'effect_unknown' : 'failed';
      await tx.put('commandJournal', operation, captured.opKey);
      const run = await tx.get('runs', captured.runId);
      if (run) await tx.put('runs', {...run,
        state:operation.state === 'durable' ? 'completed' : operation.state === 'effect_unknown' ? 'paused_unknown' : 'failed',
        ...(operation.state === 'durable' ? {resultId:operation.resultId} : {terminalReason:operation.deliveryError.message})},run.runId);
    });
  }
  async function admitSdk(request, sender) {
    const doc = document(sender);
    await native(doc);
    const method = Object.hasOwn(_framework_sdk_registry_js__WEBPACK_IMPORTED_MODULE_3__.SDK_METHODS, request.method) && _framework_sdk_registry_js__WEBPACK_IMPORTED_MODULE_3__.SDK_METHODS[request.method];
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(method, 'E_SERVICE_UNSUPPORTED', 'Unknown SDK method');
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(Number.isSafeInteger(request.deadlineAt) && request.deadlineAt > clock.now(), 'E_DEADLINE', 'SDK request expired');
    const requestDigest = await (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.digestUtf8)((0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.canonical)([request.method, (0,_page_port_codec_js__WEBPACK_IMPORTED_MODULE_2__.canonicalValue)(request.args), request.deadlineAt]));
    const result = await storage.transaction(['commandJournal','runs','results'], 'readwrite', async tx => {
      const grant = await activeGrant(tx, doc);
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(grant.capabilities.includes(method.capability), 'E_PERMISSION', 'SDK method capability is not granted');
      const lockKey = `sdk-request:${(0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.canonical)([doc.principal, doc.tabId, doc.frameId, doc.documentId, request.requestId])}`;
      const lock = await tx.get('commandJournal', lockKey);
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(!lock || lock.grantIncarnation === grant.grantIncarnation, 'E_GRANT_REVOKED', 'Old request belongs to a closed grant');
      const opKey = `sdk-operation:${(0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.canonical)([doc.principal, doc.tabId, doc.frameId, doc.documentId, grant.grantIncarnation, request.requestId])}`;
      let operation = await tx.get('commandJournal', opKey);
      if (operation) (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(operation.requestDigest === requestDigest, 'E_REQUEST_CONFLICT', 'SDK request ID has conflicting arguments');
      else {
        operation = {tag:'sdk-operation', opKey, ...doc, namespace:grant.namespace, grantIncarnation:grant.grantIncarnation,
          runId:(0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.newId)(), opId:(0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.newId)(), resultId:(0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.newId)(), requestId:request.requestId, requestDigest, method:request.method,
          capability:method.capability, effect:method.effect, deadlineAt:Math.min(request.deadlineAt, clock.now() + 15000),
          browserSessionIncarnation:session, state:'admitted', cancelSeq:0, submissionCount:0, admittedAt:now()};
        await tx.put('commandJournal', operation, opKey);
        await tx.put('commandJournal', {tag:'sdk-request', grantIncarnation:grant.grantIncarnation, opKey}, lockKey);
        await tx.put('runs', {tag:'sdk-service', driver:'framework.sdk-service.v1', runId:operation.runId, opId:operation.opId,
          namespace:operation.namespace, browserSessionIncarnation:session, state:'preparing', createdAt:now()}, operation.runId);
      }
      return {operation, receipt:await tx.get('results', operation.resultId)};
    });
    const captured = {...result.operation, ...epochs(doc), doc};
    let context;
    context = Object.freeze({...result.operation,
      authorize:request => authorizeSdk(context, request), authorizeInTransaction:tx => authorizeSdkInTransaction(tx, context),
      recordEffect:value => recordSdkEffect(context, value), recordNativeReceipt:receipt => recordSdkNativeReceipt(context, receipt),
      assertDispatch:() => assertFence(captured)});
    contexts.set(context, captured);
    return {...result, context};
  }
  async function revokeSdkGrants({tabId, frameId, documentId, origins, permissions, reason = 'revoked'} = {}) {
    // Called synchronously by native listeners: invalidate in-flight closures
    // before an asynchronous IDB transaction or a native permission regrant.
    if (tabId !== undefined && frameId !== undefined) {
      const key = (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.canonical)([tabId,frameId]); frameEpochs.set(key,(frameEpochs.get(key) || 0) + 1);
    } else if (tabId !== undefined) tabEpochs.set(tabId,(tabEpochs.get(tabId) || 0) + 1);
    if (permissions?.includes('notifications')) notificationEpoch++;
    if (origins?.length) permissionRemovals.push([...origins]);
    return storage.transaction(['commandJournal'], 'readwrite', async tx => {
      for (const grant of await tx.all('commandJournal')) {
        if (grant.tag !== 'sdk-grant' || !grant.active) continue;
        if (tabId !== undefined && grant.tabId !== tabId) continue;
        if (frameId !== undefined && grant.frameId !== frameId) continue;
        if (documentId !== undefined && grant.documentId !== documentId) continue;
        if (origins || permissions) {
          const originRemoved = origins?.some(pattern => matchesOrigin(pattern,grant.origin));
          const permissionRemoved = permissions?.some(permission => grant.capabilities.includes(permission));
          if (!originRemoved && !permissionRemoved) continue;
        }
        grant.active = false; grant.closedAt = now(); grant.closeReason = reason;
        await tx.put('commandJournal', grant, grant.key);
      }
    });
  }
  function matchesOrigin(pattern, origin) {
    if (pattern === '<all_urls>') return true;
    const match = /^(\*|https?|file):\/\/([^/]+)\//.exec(pattern);
    if (!match) return false;
    const url = new URL(origin), host = match[2];
    return (match[1] === '*' || `${match[1]}:` === url.protocol) &&
      (host === '*' || host === url.hostname || host.startsWith('*.') &&
        (url.hostname === host.slice(2) || url.hostname.endsWith(`.${host.slice(2)}`)));
  }
  async function settleSdkDelivery(context, error) {
    const captured = contexts.get(context);
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(captured, 'E_OWNER', 'Delivery requires original SDK context');
    return storage.transaction(['commandJournal'], 'readwrite', async tx => {
      const operation = await tx.get('commandJournal',captured.opKey);
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(operation?.opId === captured.opId, 'E_REQUEST_CONFLICT', 'SDK delivery admission changed');
      if (error) {
        if (operation.deliveryState !== 'delivered') {
          operation.deliveryState = 'denied'; operation.deliveryError = {code:error.code || 'E_EFFECT_UNKNOWN',message:String(error.message || error)};
        }
      } else {
        await authorizeSdkInTransaction(tx,context);
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(operation.state === 'durable','E_EFFECT_UNKNOWN','SDK result is not durable');
        // Returning a response proves authorization, not page Promise receipt.
        operation.deliveryState = 'response_ready'; operation.responseReadyAt = now(); delete operation.deliveryError;
      }
      await tx.put('commandJournal',operation,captured.opKey);
    });
  }
  async function recoverSdk() {
    return storage.transaction(['commandJournal','runs','results'], 'readwrite', async tx => {
      const rows = await tx.all('commandJournal');
      // Active grants already contain committed event baselines. Restore only
      // their current-session epochs, never a closed incarnation. Native frame
      // and permission facts are still rechecked by Hello and every dispatch.
      for (const grant of rows) {
        if (grant.tag !== 'sdk-grant' || !grant.active || grant.browserSessionIncarnation !== session) continue;
        for (const field of ['tabEpoch','frameEpoch','permissionEpoch','notificationEpoch'])
          (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(Number.isSafeInteger(grant[field]) && grant[field] >= 0,'E_GRANT_REVOKED','SDK grant epoch is malformed');
        tabEpochs.set(grant.tabId,Math.max(tabEpochs.get(grant.tabId) || 0,grant.tabEpoch));
        const key = frameKey(grant);
        frameEpochs.set(key,Math.max(frameEpochs.get(key) || 0,grant.frameEpoch));
        permissionBases.set(grant.origin,Math.max(permissionBases.get(grant.origin) || 0,
          grant.permissionEpoch - removalCount(grant.origin)));
        notificationEpoch = Math.max(notificationEpoch,grant.notificationEpoch);
      }
      for (const operation of rows) {
        if (operation.tag !== 'sdk-operation') continue;
        if (operation.state === 'dispatched') {
          operation.state = 'effect_unknown'; operation.recoveredAt = now();
          operation.deliveryState = 'denied';
          operation.deliveryError = {code:'E_EFFECT_UNKNOWN', message:'Worker restarted after SDK dispatch; no effect replay'};
          await tx.put('commandJournal', operation, operation.opKey);
        }
        const run = await tx.get('runs',operation.runId);
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(run?.tag === 'sdk-service' && run.opId === operation.opId && run.namespace === operation.namespace,
          'E_EFFECT_UNKNOWN','SDK recovery run binding differs');
        if (operation.state === 'durable') {
          const result = await tx.get('results',operation.resultId);
          (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(result?.tag === 'sdk-result' && result.state === 'durable' && result.resultId === operation.resultId &&
            result.runId === operation.runId && result.opId === operation.opId && result.namespace === operation.namespace &&
            result.grantIncarnation === operation.grantIncarnation && result.opKey === operation.opKey &&
            result.requestDigest === operation.requestDigest,'E_EFFECT_UNKNOWN','SDK durable result binding differs');
          await tx.put('runs',{...run,state:'completed',resultId:operation.resultId},run.runId);
        } else if (operation.state === 'effect_unknown' || operation.state === 'failed') {
          await tx.put('runs',{...run,state:operation.state === 'effect_unknown' ? 'paused_unknown' : 'failed',
            terminalReason:operation.deliveryError?.message || operation.state},run.runId);
        }
      }
    });
  }
  return {grantSdk, helloSdk, authorizeSdkInjection, admitSdk, authorizeSdk, authorizeSdkInTransaction, recordSdkEffect,
    recordSdkNativeReceipt, failSdk, revokeSdkGrants, recoverSdk, settleSdkDelivery};
}


/***/ }),

/***/ "./src/platform/journal.js":
/*!*********************************!*\
  !*** ./src/platform/journal.js ***!
  \*********************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   commandKey: () => (/* binding */ commandKey),
/* harmony export */   commandRecordKey: () => (/* binding */ commandRecordKey),
/* harmony export */   pageCommandKey: () => (/* binding */ pageCommandKey)
/* harmony export */ });
/* harmony import */ var _protocol_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./protocol.js */ "./src/platform/protocol.js");


function commandKey(runId, commandId) {
  (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(typeof runId === 'string' && runId.length > 0 && typeof commandId === 'string' && commandId.length > 0,
    'E_SCHEMA', 'Command keys require a run and command ID');
  return `command:${(0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.canonical)([runId, commandId])}`;
}

function commandRecordKey(command) {
  return commandKey(command.identity?.runId, command.commandId);
}

function pageCommandKey(kind, runId, commandId) {
  (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(['submit', 'raw', 'effect'].includes(kind), 'E_SCHEMA', 'Unknown page journal namespace');
  return `page-${kind}:${(0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.canonical)([runId, commandId])}`;
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

/***/ "./src/platform/page-port/index.js":
/*!*****************************************!*\
  !*** ./src/platform/page-port/index.js ***!
  \*****************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   createPagePortService: () => (/* binding */ createPagePortService),
/* harmony export */   validatePlan: () => (/* binding */ validatePlan)
/* harmony export */ });
/* harmony import */ var _protocol_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../protocol.js */ "./src/platform/protocol.js");
/* harmony import */ var _target_index_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../target/index.js */ "./src/platform/target/index.js");
/* harmony import */ var _source_js__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./source.js */ "./src/platform/page-port/source.js");
/* harmony import */ var _journal_js__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ../journal.js */ "./src/platform/journal.js");





const bytes = value => new TextEncoder().encode((0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.canonical)(value)).byteLength;
async function validatePlan(template, plan) {
  (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.validate)('TemplateRevision', template); (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.validate)('RulePlan', plan);
  const {contentHash, ...content} = template;
  const {planHash, ...planContent} = plan;
  (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(await (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.digest)(content) === contentHash && await (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.digest)(planContent) === planHash, 'E_HASH');
  (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(plan.templateHash === contentHash && plan.contractVersion === _protocol_js__WEBPACK_IMPORTED_MODULE_0__.CONTRACT_VERSION && plan.compilerVersion === _protocol_js__WEBPACK_IMPORTED_MODULE_0__.CONTRACT_VERSION, 'E_HASH');
  (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)((0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.canonical)(plan.capabilities) === (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.canonical)(template.requiredCapabilities), 'E_CAPABILITY');
  for (const field of ['list', 'fields', 'pagination', 'columns', 'limits']) {
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)((0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.canonical)(plan[field]) === (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.canonical)(template[field]), 'E_SEMANTIC', `Plan ${field} differs from immutable template`);
  }
  const required = new Set(['dom.top.v1', 'transform.safe.v1', `pagination.${template.pagination.mode}.v1`]);
  for (const field of template.fields) required.add(`read.${field.read}.v1`);
  (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(required.size === plan.capabilities.length && plan.capabilities.every(c => required.has(c)), 'E_CAPABILITY');
  (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(new Set(template.columns).size === template.fields.length && template.columns.every(id => template.fields.some(f => f.id === id)), 'E_SEMANTIC');
  (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)((0,_target_index_js__WEBPACK_IMPORTED_MODULE_1__.httpUrl)(template.startUrl).origin === template.allowedOrigin, 'E_TARGET');
  return plan;
}

function createPagePortService({storage, api, session, targetService, assertHost, emitToHost, admitIdentity}) {
  const stores = ['runs', 'commandJournal', 'templates', 'records', 'pageSnapshots'];
  const tx = (mode, callback) => storage.transaction(stores, mode, callback);
  const source = (0,_source_js__WEBPACK_IMPORTED_MODULE_2__.createSourcePort)({storage, api, session, assertHost, emitToHost, validatePlan});

  async function registered(tx, run) {
    const host = await tx.get('commandJournal', `host:${run.registrationId}`);
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(host && !host.revoked && host.hostDocumentId === run.hostDocumentId && host.hostInstanceId === run.hostInstanceId, 'E_OWNER');
    return host;
  }

  async function commandRun(tx, identity, committed = false) {
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.validate)('Identity', identity);
    const run = await tx.get('runs', identity.runId);
    const slot = await tx.get('runs', '@slot');
    // A previously dispatched command may submit once during Stop; its identity is never rewritten.
    const ignoreRevision = committed && run?.state === 'stopping' && (run.cancelSeq ?? 0) > 0;
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(run && !run.retirementId && slot?.currentRunId === identity.runId &&
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.sameIdentity)(run.identity, identity, {ignoreRevision}), 'E_TARGET');
    return run;
  }

  async function templateFor(tx, command) {
    const values = await tx.all('templates');
    const matches = values.map(v => v.template || v.revisionData || v).filter(v => v.contentHash === command.identity.templateHash);
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(matches.length > 0 && matches.every(v => (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.canonical)(v) === (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.canonical)(matches[0])), 'E_HASH', 'Immutable template not found');
    return matches[0];
  }

  async function executeCommand(command) {
    // Strip no caller fields here: input must be the public frozen Command, not arbitrary code.
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.validate)('Command', command);
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(command.state === 'dispatched', 'E_EFFECT_UNKNOWN', 'Commit dispatch before external invocation');
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(await (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.digest)({commandId: command.commandId, identity: command.identity, kind: command.kind, payload: command.payload}) === command.digest, 'E_HASH');
    const incarnation = await (0,_target_index_js__WEBPACK_IMPORTED_MODULE_1__.sessionIncarnation)(session);
    await (0,_target_index_js__WEBPACK_IMPORTED_MODULE_1__.requireGrant)(api, command.identity.target.allowedOrigin);
    const authorization = await tx('readonly', async t => {
      const stored = await t.get('commandJournal', (0,_journal_js__WEBPACK_IMPORTED_MODULE_3__.commandRecordKey)(command));
      const previous = await t.get('commandJournal', (0,_journal_js__WEBPACK_IMPORTED_MODULE_3__.pageCommandKey)('submit', command.identity.runId, command.commandId));
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(stored && (stored.state === 'dispatched' || stored.state === 'effect_unknown' && previous) &&
        stored.digest === command.digest && (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.sameIdentity)(stored.identity, command.identity), 'E_EFFECT_UNKNOWN');
      const run = await commandRun(t, command.identity, true);
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(run.browserSessionIncarnation === incarnation, 'E_TARGET');
      await registered(t, run);
      return {template: await templateFor(t, command), run};
    });
    if (command.kind === 'read-page') await validatePlan(authorization.template, command.payload.plan);
    else {
      const pagination = authorization.template.pagination;
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(command.kind === pagination.mode && command.payload.selector === pagination.selector && command.payload.endMarkerSelector === pagination.endMarkerSelector, 'E_SEMANTIC');
      if (command.kind === 'next-link') {
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(command.payload.waitMs === pagination.waitMs && (0,_target_index_js__WEBPACK_IMPORTED_MODULE_1__.httpUrl)(command.payload.url).origin === command.identity.target.allowedOrigin, 'E_TARGET');
      } else (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(command.payload.userConfirmed === pagination.userConfirmed && command.payload.postcondition === pagination.postcondition.kind && command.payload.timeoutMs === pagination.postcondition.timeoutMs, 'E_SEMANTIC');
    }
    const admitted = await tx('readwrite', async t => {
      const stored = await t.get('commandJournal', (0,_journal_js__WEBPACK_IMPORTED_MODULE_3__.commandRecordKey)(command));
      const run = await commandRun(t, command.identity, true);
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(stored && ['dispatched', 'effect_unknown'].includes(stored.state) && stored.digest === command.digest && (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.sameIdentity)(stored.identity, command.identity), 'E_TARGET');
      await registered(t, run);
      const key = (0,_journal_js__WEBPACK_IMPORTED_MODULE_3__.pageCommandKey)('submit', command.identity.runId, command.commandId);
      const previous = await t.get('commandJournal', key);
      if (previous) { (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(previous.digest === command.digest && (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.sameIdentity)(previous.identity, command.identity), 'E_BATCH_CONFLICT'); return false; }
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(stored.state === 'dispatched', 'E_EFFECT_UNKNOWN');
      await t.put('commandJournal', {tag: 'page-submit', operationCommandId: command.commandId, identity: command.identity, digest: command.digest,
        browserSessionIncarnation: incarnation, submissionCount: 1, state: 'dispatched', dispatchAt: new Date().toISOString()}, key);
      return true;
    });
    if (!admitted) return {commandId: command.commandId, state: 'effect_unknown', duplicate: true};
    // Do not await a DOM read, navigation, or core loop. Only the fixed agent's immediate receipt is awaited.
    try {
      const target = command.identity.target;
      await api.scripting.executeScript({target: {tabId: target.tabId, documentIds: [target.documentId]}, world: 'ISOLATED', files: ['agents/page-agent.js']});
      const receipt = await api.tabs.sendMessage(target.tabId, {protocol: _protocol_js__WEBPACK_IMPORTED_MODULE_0__.PROTOCOL, type: 'PAGE_EXECUTE', payload: command}, {documentId: target.documentId, frameId: 0});
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(receipt?.accepted && !receipt.error, 'E_TARGET', 'Fixed page agent did not accept the command');
      return {commandId: command.commandId, state: 'dispatched', duplicate: false};
    } catch (error) {
      await tx('readwrite', async t => {
        const value = await t.get('commandJournal', (0,_journal_js__WEBPACK_IMPORTED_MODULE_3__.pageCommandKey)('submit', command.identity.runId, command.commandId));
        value.state = 'effect_unknown'; value.errorCode = error.code || 'E_TARGET';
        await t.put('commandJournal', value, (0,_journal_js__WEBPACK_IMPORTED_MODULE_3__.pageCommandKey)('submit', command.identity.runId, command.commandId));
      });
      return {commandId: command.commandId, state: 'effect_unknown', duplicate: false};
    }
  }

  async function handleAgentMessage(message, sender) {
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(message?.protocol === _protocol_js__WEBPACK_IMPORTED_MODULE_0__.PROTOCOL, 'E_VERSION');
    if (message.type === 'AGENT_READY' || message.type.startsWith('SOURCE_')) return source.handleAgentMessage(message, sender);
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(['PAGE_DATA', 'PAGE_END', 'PAGE_EFFECT', 'PAGE_ERROR'].includes(message.type), 'E_SCHEMA');
    const frame = message.payload;
    const identity = frame?.identity;
    const run = await targetService.validateAgentSender(identity, sender);
    const document = (0,_target_index_js__WEBPACK_IMPORTED_MODULE_1__.authenticatedDocument)(api, sender);
    const pageIdentity = (0,_target_index_js__WEBPACK_IMPORTED_MODULE_1__.httpUrl)(sender.url).href;
    if (message.type === 'PAGE_DATA') {
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.validate)('PageReadData', frame);
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(bytes(frame) <= _protocol_js__WEBPACK_IMPORTED_MODULE_0__.BUDGETS.maxRawFrameBytes, 'E_LIMIT');
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(await (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.digest)({snapshotId: frame.snapshotId, frameIndex: frame.frameIndex, rowStart: frame.rowStart, rawRows: frame.rawRows}) === frame.digest, 'E_HASH');
    } else if (message.type === 'PAGE_END') {
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.validate)('PageReadEnd', frame);
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(frame.pageIdentity === pageIdentity, 'E_TARGET');
      const base = (0,_target_index_js__WEBPACK_IMPORTED_MODULE_1__.httpUrl)(frame.documentBaseURI); (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(base.origin === identity.target.allowedOrigin, 'E_TARGET');
    } else {
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(typeof frame.commandId === 'string' && frame.identity && bytes(frame) <= _protocol_js__WEBPACK_IMPORTED_MODULE_0__.BUDGETS.maxRawFrameBytes, 'E_SCHEMA');
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(frame.pageIdentity === pageIdentity, 'E_TARGET');
    }
    const frameDigest = await (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.digest)(frame);
    const outcome = await tx('readwrite', async t => {
      const reading = message.type === 'PAGE_DATA' || message.type === 'PAGE_END';
      const current = await commandRun(t, identity, !reading);
      await registered(t, current);
      const command = await t.get('commandJournal', (0,_journal_js__WEBPACK_IMPORTED_MODULE_3__.commandRecordKey)(frame));
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(command && ['dispatched', 'effect_unknown'].includes(command.state) && (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.sameIdentity)(command.identity, identity), 'E_OWNER');
      if (reading) {
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(current.state === 'running' && (current.cancelSeq ?? 0) === 0, 'E_CANCELLED');
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(command.kind === 'read-page' && frame.snapshotId === command.payload.snapshotId, 'E_TARGET');
        const page = await t.get('pageSnapshots', frame.snapshotId);
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(page && page.readCommandId === command.commandId && page.state === 'open' && (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.sameIdentity)(page.sourceIdentity, identity), 'E_TARGET');
        const plan = command.payload.plan;
        const rawKey = (0,_journal_js__WEBPACK_IMPORTED_MODULE_3__.pageCommandKey)('raw', command.identity.runId, command.commandId);
        const raw = await t.get('commandJournal', rawKey) || {tag: 'page-raw', operationCommandId: command.commandId, identity, frames: [], rows: [], bytes: 0, end: null};
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)((0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.sameIdentity)(raw.identity, identity), 'E_OWNER');
        if (message.type === 'PAGE_DATA') {
          const existing = raw.frames[frame.frameIndex];
          if (existing) {
            if (existing.digest !== frame.digest) {
              raw.failed = 'E_BATCH_CONFLICT'; command.state = 'effect_unknown';
              await t.put('commandJournal', command, (0,_journal_js__WEBPACK_IMPORTED_MODULE_3__.commandRecordKey)(command));
              await t.put('commandJournal', raw, rawKey); return {conflict: true};
            }
            return {duplicate: true, acked: !!existing.acked};
          }
          (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(!raw.end && !raw.failed && frame.frameIndex === raw.frames.length && frame.rowStart === raw.rows.length, 'E_SEAL_INCOMPLETE');
          (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(raw.frames.filter(f => !f.acked).length < 1, 'E_LIMIT', 'Await durable stage/frame ACK');
          (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(raw.rows.length + frame.rawRows.length <= plan.limits.maxRecords, 'E_LIMIT');
          for (const row of frame.rawRows) {
            (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(Object.keys(row).length === plan.fields.length && plan.fields.every(field => Object.hasOwn(row, field.id)), 'E_SCHEMA');
            (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(bytes(row) <= _protocol_js__WEBPACK_IMPORTED_MODULE_0__.BUDGETS.maxRecordBytes, 'E_LIMIT');
            for (const field of plan.fields) (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(!field.required || row[field.id] !== null, 'E_SEMANTIC');
          }
          raw.bytes += bytes(frame); (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(raw.bytes <= _protocol_js__WEBPACK_IMPORTED_MODULE_0__.BUDGETS.maxStoredBytes, 'E_LIMIT');
          raw.rows.push(...frame.rawRows); raw.frames.push({digest: frame.digest, rowStart: frame.rowStart, rowCount: frame.rawRows.length, frame, acked: false});
          await t.put('commandJournal', raw, rawKey);
          command.rawFrames = raw.frames.map(item => item.frame);
          await t.put('commandJournal', command, (0,_journal_js__WEBPACK_IMPORTED_MODULE_3__.commandRecordKey)(command));
        } else {
          if (raw.end) { (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)((0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.canonical)(raw.end) === (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.canonical)(frame), 'E_BATCH_CONFLICT'); return {duplicate: true}; }
          (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(!raw.failed && raw.frames.every(f => f.acked) && frame.frameCount === raw.frames.length && frame.rowCount === raw.rows.length, 'E_SEAL_INCOMPLETE');
          (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(frame.pageIdentity === command.payload.expectedPageIdentity, 'E_TARGET');
          (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(frame.rowCount > 0 || plan.list.allowEmpty && frame.emptyEvidence === 'allow-empty' ||
            !!plan.list.emptyMarkerSelector && frame.emptyEvidence === `empty-marker:${plan.list.emptyMarkerSelector}`, 'E_SEAL_INCOMPLETE');
          // Compute outside the transaction below; recheck the immutable collected digest before commit.
          return {endCandidate: {raw, rawKey}};
        }
      } else {
        const effectKey = (0,_journal_js__WEBPACK_IMPORTED_MODULE_3__.pageCommandKey)('effect', command.identity.runId, command.commandId);
        const old = await t.get('commandJournal', effectKey);
        if (old) { (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(old.digest === frameDigest, 'E_BATCH_CONFLICT'); return {duplicate: true}; }
        await t.put('commandJournal', {tag: 'page-effect', operationCommandId: command.commandId, identity, sender: document,
          digest: frameDigest, result: frame, receivedAt: new Date().toISOString()}, effectKey);
      }
      return {duplicate: false};
    });
    if (outcome.conflict) (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(false, 'E_BATCH_CONFLICT');
    if (outcome.endCandidate) {
      const {raw, rawKey} = outcome.endCandidate;
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(await (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.digest)({pageIdentity, rawRows: raw.rows}) === frame.rawSignature, 'E_HASH');
      await tx('readwrite', async t => {
        const current = await commandRun(t, identity);
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(current.state === 'running' && (current.cancelSeq ?? 0) === 0, 'E_CANCELLED');
        await registered(t, current);
        const latest = await t.get('commandJournal', rawKey);
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(!latest.failed && (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.canonical)(latest.rows) === (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.canonical)(raw.rows), 'E_SEAL_INCOMPLETE');
        if (latest.end) (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)((0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.canonical)(latest.end) === (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.canonical)(frame), 'E_BATCH_CONFLICT');
        latest.end = frame; await t.put('commandJournal', latest, rawKey);
        const command = await t.get('commandJournal', (0,_journal_js__WEBPACK_IMPORTED_MODULE_3__.commandRecordKey)(frame));
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(command && (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.sameIdentity)(command.identity, identity), 'E_OWNER');
        command.rawEnd = frame; command.pageEnd = frame;
        await t.put('commandJournal', command, (0,_journal_js__WEBPACK_IMPORTED_MODULE_3__.commandRecordKey)(command));
      });
    }
    if (!outcome.duplicate) await emitToHost(run.registrationId, {protocol: _protocol_js__WEBPACK_IMPORTED_MODULE_0__.PROTOCOL, type: message.type, payload: frame});
    return {received: true, duplicate: !!outcome.duplicate, frameAck: !!outcome.acked};
  }

  async function ackPageFrame(request, sender) {
    const host = await assertHost(sender);
    const authorization = await tx('readwrite', async t => {
      const run = await commandRun(t, request.identity);
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(run && run.registrationId === host.registrationId && host.hostDocumentId === run.hostDocumentId && run.state === 'running', 'E_OWNER');
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)((run.cancelSeq ?? 0) === 0, 'E_CANCELLED');
      if (admitIdentity) await admitIdentity(t, request.identity, sender);
      else (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)((0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.sameIdentity)(run.identity, request.identity), 'E_TARGET');
      await registered(t, run);
      const command = await t.get('commandJournal', (0,_journal_js__WEBPACK_IMPORTED_MODULE_3__.commandRecordKey)(request));
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(command && (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.sameIdentity)(command.identity, request.identity), 'E_OWNER');
      const raw = await t.get('commandJournal', (0,_journal_js__WEBPACK_IMPORTED_MODULE_3__.pageCommandKey)('raw', request.identity.runId, request.commandId));
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(raw && (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.sameIdentity)(raw.identity, request.identity), 'E_OWNER');
      const frame = raw?.frames[request.frameIndex];
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(frame && !raw.failed && frame.digest === request.digest, 'E_HASH');
      const records = (await t.all('records')).filter(r => r.snapshotId === frame.frame.snapshotId).sort((a, b) => a.rowIndex - b.rowIndex);
      for (let i = 0; i < frame.rowCount; i++) {
        const record = records.find(r => r.rowIndex === frame.rowStart + i);
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(record && (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.canonical)(record.raw) === (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.canonical)(frame.frame.rawRows[i]), 'E_SEAL_INCOMPLETE', 'Raw ACK requires matching durable staged records');
      }
      frame.acked = true; await t.put('commandJournal', raw, (0,_journal_js__WEBPACK_IMPORTED_MODULE_3__.pageCommandKey)('raw', request.identity.runId, request.commandId));
      return {target: request.identity.target};
    });
    const target = authorization.target;
    await api.tabs.sendMessage(target.tabId, {protocol: _protocol_js__WEBPACK_IMPORTED_MODULE_0__.PROTOCOL, type: 'PAGE_FRAME_ACK', payload: {identity: request.identity, commandId: request.commandId,
      frameIndex: request.frameIndex, digest: request.digest}}, {documentId: target.documentId, frameId: 0});
    return {acked: true};
  }

  async function invalidateTab(tabId) { await targetService.invalidateTab(tabId); return source.invalidateTab(tabId); }

  return Object.freeze({executeCommand, validatePlan, handleAgentMessage, ackPageFrame, invalidateTab,
    openSourceContext: source.openSourceContext, startSourceSelection: source.startSourceSelection,
    cancelSourceSelection: source.cancelSourceSelection, releaseSourceContext: source.releaseSourceContext,
    previewSource: source.previewSource, ackSourceFrame: source.ackSourceFrame,
    invalidateSourceTab: source.invalidateTab, invalidateHost: source.invalidateHost, expireSourceContexts: source.expireSourceContexts});
}


/***/ }),

/***/ "./src/platform/page-port/source.js":
/*!******************************************!*\
  !*** ./src/platform/page-port/source.js ***!
  \******************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   createSourcePort: () => (/* binding */ createSourcePort)
/* harmony export */ });
/* harmony import */ var _protocol_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../protocol.js */ "./src/platform/protocol.js");
/* harmony import */ var _target_index_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../target/index.js */ "./src/platform/target/index.js");



const stores = ['commandJournal'];
const contextKey = id => `source-context:${id}`;
const operationKey = (id, op) => `source-operation:${id}:${op}`;
const bytes = value => new TextEncoder().encode((0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.canonical)(value)).byteLength;
const now = () => new Date().toISOString();

function createSourcePort({storage, api, session, assertHost, emitToHost, validatePlan}) {
  const transaction = (mode, cb) => storage.transaction(stores, mode, cb);
  const handshakes = new Map();
  const streams = new Map();

  async function hostFor(tx, context, host) {
    const stored = await tx.get('commandJournal', `host:${context.registrationId}`);
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(stored && !stored.revoked && host.registrationId === context.registrationId &&
      host.hostDocumentId === context.hostDocumentId && stored.hostDocumentId === context.hostDocumentId &&
      stored.hostInstanceId === context.hostInstanceId, 'E_OWNER');
  }

  async function admit(tx, selectionId, host, incarnation, supplied, allowClosed = false) {
    const record = await tx.get('commandJournal', contextKey(selectionId));
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(record, 'E_TARGET');
    await hostFor(tx, record.context, host);
    const context = record.context;
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(context.browserSessionIncarnation === incarnation, 'E_TARGET');
    if (!allowClosed) (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(context.state === 'active' && Date.parse(context.expiresAt) > Date.now(), 'E_CANCELLED');
    if (supplied) (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)((0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.canonical)(supplied) === (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.canonical)(context), 'E_TARGET', 'Stale or forged source capability');
    return record;
  }

  async function send(context, message) {
    if (context.browserSessionIncarnation !== await (0,_target_index_js__WEBPACK_IMPORTED_MODULE_1__.sessionIncarnation)(session)) return;
    await api.tabs.sendMessage(context.sourceTabId, {protocol: _protocol_js__WEBPACK_IMPORTED_MODULE_0__.PROTOCOL, type: message.type, payload: message.payload}, {documentId: context.sourceDocumentId, frameId: 0});
  }

  async function cleanup(context, operationId) {
    try { await send(context, {type: 'SOURCE_CLEANUP', payload: {selectionId: context.selectionId, operationId}}); } catch { /* Revocation is already durable. */ }
  }

  async function openSourceContext(request, sender) {
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.validate)('OpenSourceContextRequest', request);
    const host = await assertHost(sender, request.registrationId);
    const incarnation = await (0,_target_index_js__WEBPACK_IMPORTED_MODULE_1__.sessionIncarnation)(session);
    const requestDigest = await (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.digest)(request);
    const selectionId = (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.newId)();
    const prepared = await transaction('readwrite', async tx => {
      const registered = await tx.get('commandJournal', `host:${host.registrationId}`);
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(registered && !registered.revoked && registered.hostDocumentId === host.hostDocumentId, 'E_OWNER');
      const ticketKey = `gesture:${request.gestureTicketId}`;
      const ticket = await tx.get('commandJournal', ticketKey);
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(ticket && ticket.browserSessionIncarnation === incarnation, 'E_PERMISSION', 'Real action gesture ticket required');
      if (ticket.consumed || ticket.consumedBy) {
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(ticket.consumedBy === host.registrationId && ticket.requestDigest === requestDigest, 'E_OWNER');
        const old = await tx.get('commandJournal', contextKey(ticket.selectionId));
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(old, 'E_TARGET'); return old;
      }
      const gestureAt = ticket.gestureAt || ticket.createdAt;
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(Number.isFinite(Date.parse(gestureAt)) && Date.now() - Date.parse(gestureAt) >= 0 && Date.now() - Date.parse(gestureAt) <= 30000, 'E_PERMISSION');
      const sourceTabId = ticket.sourceTabId ?? ticket.tabId;
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(Number.isSafeInteger(sourceTabId) && sourceTabId >= 0, 'E_PERMISSION');
      if (ticket.registrationId) (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(ticket.registrationId === host.registrationId, 'E_OWNER');
      const origin = (0,_target_index_js__WEBPACK_IMPORTED_MODULE_1__.httpUrl)(ticket.sourceUrl || ticket.url || ticket.origin).origin;
      const record = {tag: 'source-context', selectionId, handshakeState: 'pending', context: {
        selectionId, sourceTabId, frameId: 0, sourceDocumentId: null, origin, gestureAt,
        hostInstanceId: host.hostInstanceId, hostDocumentId: host.hostDocumentId, registrationId: host.registrationId,
        browserSessionIncarnation: incarnation, contextRevision: 1, expiresAt: new Date(Date.now() + 600000).toISOString(),
        state: 'active', allowedOperations: ['select-list', 'select-fields', 'select-next', 'preview', 'clear-own-overlay']},
        currentOperationId: null, requestId: request.requestId, requestDigest};
      ticket.consumed = true; ticket.consumedBy = host.registrationId; ticket.selectionId = selectionId; ticket.requestDigest = requestDigest;
      await tx.put('commandJournal', ticket, ticketKey);
      await tx.put('commandJournal', record, contextKey(selectionId));
      return record;
    });
    if (prepared.handshakeState === 'ready') {
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(prepared.context.state === 'active' && Date.parse(prepared.context.expiresAt) > Date.now(), 'E_CANCELLED');
      return (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.validate)('SourceSelectionContext', prepared.context);
    }
    let resolve, reject;
    const ready = new Promise((yes, no) => { resolve = yes; reject = no; });
    // Register before injection: an authentic classic agent may handshake synchronously.
    const timer = setTimeout(() => reject(Object.assign(new Error('Source document handshake timed out'), {code: 'E_TARGET'})), 5000);
    handshakes.set(prepared.selectionId, resolve);
    try {
      await api.scripting.executeScript({target: {tabId: prepared.context.sourceTabId, frameIds: [0]}, world: 'ISOLATED', files: ['agents/page-agent.js']});
      return await ready;
    } finally { clearTimeout(timer); handshakes.delete(prepared.selectionId); }
  }

  async function handshake(sender) {
    const document = (0,_target_index_js__WEBPACK_IMPORTED_MODULE_1__.authenticatedDocument)(api, sender);
    const origin = (0,_target_index_js__WEBPACK_IMPORTED_MODULE_1__.httpUrl)(sender.url).origin;
    const incarnation = await (0,_target_index_js__WEBPACK_IMPORTED_MODULE_1__.sessionIncarnation)(session);
    const ready = await transaction('readwrite', async tx => {
      const pending = (await tx.all('commandJournal')).filter(r => r.tag === 'source-context' && r.handshakeState === 'pending' &&
        r.context.sourceTabId === document.tabId && r.context.browserSessionIncarnation === incarnation && r.context.state === 'active');
      if (!pending.length) return [];
      for (const record of pending) {
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(record.context.origin === origin && Date.parse(record.context.expiresAt) > Date.now(), 'E_TARGET');
        const host = await tx.get('commandJournal', `host:${record.context.registrationId}`);
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(host && !host.revoked && host.hostDocumentId === record.context.hostDocumentId, 'E_OWNER');
        record.context.sourceDocumentId = document.documentId; record.handshakeState = 'ready';
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.validate)('SourceSelectionContext', record.context);
        await tx.put('commandJournal', record, contextKey(record.selectionId));
      }
      return pending.map(r => r.context);
    });
    for (const context of ready) handshakes.get(context.selectionId)?.(context);
    return {ok: true, source: ready.length > 0};
  }

  async function startOperation(request, sender, kind) {
    const host = await assertHost(sender, request.context.registrationId);
    const incarnation = await (0,_target_index_js__WEBPACK_IMPORTED_MODULE_1__.sessionIncarnation)(session);
    const requestDigest = await (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.digest)(request);
    const operationId = kind === 'preview' ? request.requestId : request.operationId;
    const prepared = await transaction('readwrite', async tx => {
      const record = await admit(tx, request.context.selectionId, host, incarnation, request.context);
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(record.context.allowedOperations.includes(kind === 'preview' ? 'preview' : request.kind), 'E_PERMISSION');
      const opKey = operationKey(record.selectionId, operationId);
      const previous = await tx.get('commandJournal', opKey);
      if (previous) {
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(previous.requestDigest === requestDigest, 'E_BATCH_CONFLICT');
        return {context: record.context, operation: previous, duplicate: true, old: null};
      }
      const oldId = record.currentOperationId;
      if (oldId) {
        const old = await tx.get('commandJournal', operationKey(record.selectionId, oldId));
        if (old) { old.state = 'cancelled'; await tx.put('commandJournal', old, operationKey(record.selectionId, oldId)); }
      }
      const operation = {tag: 'source-operation', selectionId: record.selectionId, operationId, requestId: request.requestId,
        kind: kind === 'preview' ? kind : request.kind, fieldId: request.fieldId ?? null, requestDigest, state: 'accepted',
        deadlineAt: new Date(Math.min(Date.parse(record.context.expiresAt), Date.now() + 30000)).toISOString(),
        frames: [], rawRows: [], end: null, plan: request.plan || null};
      record.currentOperationId = operationId;
      await tx.put('commandJournal', operation, opKey); await tx.put('commandJournal', record, contextKey(record.selectionId));
      return {context: record.context, operation, duplicate: false, old: oldId};
    });
    if (prepared.old) {
      streams.get(`${prepared.context.selectionId}:${prepared.old}`)?.fail('E_CANCELLED');
      await cleanup(prepared.context, prepared.old);
      await emitToHost(prepared.context.registrationId, {protocol: _protocol_js__WEBPACK_IMPORTED_MODULE_0__.PROTOCOL, type: 'SOURCE_OPERATION', payload: {selectionId: prepared.context.selectionId, operationId: prepared.old, state: 'cancelled', duplicate: false}});
    }
    return prepared;
  }

  async function startSourceSelection(request, sender) {
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.validate)('StartSourceSelectionRequest', request);
    const prepared = await startOperation(request, sender, 'selection');
    if (!prepared.duplicate) {
      try {
        await api.scripting.executeScript({target: {tabId: prepared.context.sourceTabId, documentIds: [prepared.context.sourceDocumentId]}, world: 'ISOLATED', files: ['agents/selection-entry.js']});
        await send(prepared.context, {type: 'SOURCE_START', payload: request});
      } catch {
        await cancelSourceSelection({selectionId: prepared.context.selectionId, operationId: request.operationId, requestId: `failed:${request.requestId}`}, sender);
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(false, 'E_TARGET', 'Selection agent unavailable');
      }
    }
    return (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.validate)('SourceOperationAck', {selectionId: prepared.context.selectionId, operationId: request.operationId, state: prepared.operation.state === 'cancelled' ? 'cancelled' : 'accepted', duplicate: prepared.duplicate});
  }

  async function cancelSourceSelection(request, sender) {
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.validate)('CancelSourceSelectionRequest', request);
    const host = await assertHost(sender);
    const incarnation = await (0,_target_index_js__WEBPACK_IMPORTED_MODULE_1__.sessionIncarnation)(session);
    const state = await transaction('readwrite', async tx => {
      const record = await admit(tx, request.selectionId, host, incarnation, null, true);
      const op = await tx.get('commandJournal', operationKey(request.selectionId, request.operationId));
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(op, 'E_TARGET');
      const duplicate = op.state === 'cancelled'; op.state = 'cancelled';
      if (record.currentOperationId === request.operationId) record.currentOperationId = null;
      await tx.put('commandJournal', op, operationKey(request.selectionId, request.operationId));
      await tx.put('commandJournal', record, contextKey(request.selectionId));
      return {context: record.context, ack: {selectionId: request.selectionId, operationId: request.operationId, state: 'cancelled', duplicate}};
    });
    streams.get(`${request.selectionId}:${request.operationId}`)?.fail('E_CANCELLED');
    await cleanup(state.context, request.operationId);
    if (!state.ack.duplicate) await emitToHost(host.registrationId, {protocol: _protocol_js__WEBPACK_IMPORTED_MODULE_0__.PROTOCOL, type: 'SOURCE_OPERATION', payload: state.ack});
    return (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.validate)('SourceOperationAck', state.ack);
  }

  async function releaseSourceContext(request, sender) {
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.validate)('ReleaseSourceContextRequest', request);
    const host = await assertHost(sender);
    const incarnation = await (0,_target_index_js__WEBPACK_IMPORTED_MODULE_1__.sessionIncarnation)(session);
    const requestDigest = await (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.digest)(request);
    const result = await transaction('readwrite', async tx => {
      const record = await admit(tx, request.selectionId, host, incarnation, null, true);
      if (record.releaseAck) { (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(record.releaseDigest === requestDigest, 'E_OWNER'); return {context: record.context, ack: {...record.releaseAck, duplicate: true}, operationId: null}; }
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(record.context.contextRevision === request.expectedContextRevision, 'E_REVISION');
      const operationId = record.currentOperationId;
      if (operationId) {
        const op = await tx.get('commandJournal', operationKey(request.selectionId, operationId));
        if (op) { op.state = 'cancelled'; await tx.put('commandJournal', op, operationKey(request.selectionId, operationId)); }
      }
      record.context.state = 'released'; record.context.contextRevision++; record.currentOperationId = null;
      record.releaseAck = {selectionId: request.selectionId, operationId: null, state: 'released', duplicate: false}; record.releaseDigest = requestDigest;
      await tx.put('commandJournal', record, contextKey(request.selectionId));
      return {context: record.context, ack: record.releaseAck, operationId};
    });
    streams.get(`${request.selectionId}:${result.operationId}`)?.fail('E_CANCELLED');
    await cleanup(result.context, result.operationId);
    if (!result.ack.duplicate) await emitToHost(host.registrationId, {protocol: _protocol_js__WEBPACK_IMPORTED_MODULE_0__.PROTOCOL, type: 'SOURCE_OPERATION', payload: result.ack});
    return (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.validate)('SourceOperationAck', result.ack);
  }

  async function previewSource(request, sender) {
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.validate)('PreviewSourceRequest', request);
    await validatePlan(request.draft, request.plan);
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(request.context.origin === request.draft.allowedOrigin, 'E_TARGET');
    const prepared = await startOperation(request, sender, 'preview');
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(!prepared.duplicate, 'E_EFFECT_UNKNOWN', 'A consumed preview request is not replayed');
    const streamKey = `${prepared.context.selectionId}:${request.requestId}`;
    const queue = []; let waiting = null, failure = null, closed = false, previous = null;
    const wake = () => { if (waiting) { waiting(); waiting = null; } };
    const stream = {push(frame) { queue.push(frame); wake(); }, fail(code) { failure = Object.assign(new Error(code), {code}); wake(); }};
    streams.set(streamKey, stream);
    const timer = setTimeout(() => stream.fail('E_CANCELLED'), 30000);
    const iterator = {
      [Symbol.asyncIterator]() { return this; },
      async next() {
        if (previous?.type === 'source-preview-data') await ackSourceFrame({context: prepared.context, requestId: request.requestId, frameIndex: previous.frameIndex, digest: previous.digest}, sender);
        previous = null;
        while (!queue.length && !failure && !closed) await new Promise(resolve => { waiting = resolve; });
        if (failure) { clearTimeout(timer); streams.delete(streamKey); await cleanup(prepared.context, request.requestId); throw failure; }
        if (!queue.length) return {done: true};
        const value = queue.shift(); previous = value;
        if (value.type === 'source-preview-end') { closed = true; clearTimeout(timer); streams.delete(streamKey); }
        return {done: false, value};
      },
      async return() { closed = true; clearTimeout(timer); streams.delete(streamKey); wake(); await cancelSourceSelection({selectionId: prepared.context.selectionId, operationId: request.requestId, requestId: `cancel:${request.requestId}`}, sender); return {done: true}; }
    };
    try { await send(prepared.context, {type: 'SOURCE_PREVIEW', payload: request}); }
    catch (error) { stream.fail(error.code || 'E_TARGET'); }
    return iterator;
  }

  async function handleAgentMessage(message, sender) {
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(message?.protocol === _protocol_js__WEBPACK_IMPORTED_MODULE_0__.PROTOCOL, 'E_VERSION');
    if (message.type === 'AGENT_READY') return handshake(sender);
    const document = (0,_target_index_js__WEBPACK_IMPORTED_MODULE_1__.authenticatedDocument)(api, sender);
    const incarnation = await (0,_target_index_js__WEBPACK_IMPORTED_MODULE_1__.sessionIncarnation)(session);
    const result = message.payload;
    const selectionId = result?.selectionId || result?.context?.selectionId;
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(typeof selectionId === 'string', 'E_TARGET');
    const preview = ['SOURCE_PREVIEW_DATA', 'SOURCE_PREVIEW_END'].includes(message.type);
    const operationId = preview ? result.requestId : result.operationId;
    if (preview) {
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.validate)(message.type === 'SOURCE_PREVIEW_DATA' ? 'SourcePreviewData' : 'SourcePreviewEnd', result);
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(bytes(result) <= _protocol_js__WEBPACK_IMPORTED_MODULE_0__.BUDGETS.maxRawFrameBytes, 'E_LIMIT');
      if (message.type === 'SOURCE_PREVIEW_DATA') (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(await (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.digest)({selectionId, requestId: result.requestId, frameIndex: result.frameIndex, rowStart: result.rowStart, rawRows: result.rawRows}) === result.digest, 'E_HASH');
      else (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(result.pageIdentity === (0,_target_index_js__WEBPACK_IMPORTED_MODULE_1__.httpUrl)(sender.url).href, 'E_TARGET');
    } else { (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(message.type === 'SOURCE_RESULT', 'E_SCHEMA'); (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.validate)('SourceSelectionResult', result); }
    const resultDigest = await (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.digest)(result);
    const accepted = await transaction('readwrite', async tx => {
      const record = await tx.get('commandJournal', contextKey(selectionId));
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(record && record.handshakeState === 'ready', 'E_TARGET');
      const context = record.context;
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(context.browserSessionIncarnation === incarnation && context.sourceTabId === document.tabId &&
        context.sourceDocumentId === document.documentId && context.origin === (0,_target_index_js__WEBPACK_IMPORTED_MODULE_1__.httpUrl)(sender.url).origin, 'E_TARGET');
      const host = await tx.get('commandJournal', `host:${context.registrationId}`);
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(host && !host.revoked && host.hostDocumentId === context.hostDocumentId, 'E_OWNER');
      const op = await tx.get('commandJournal', operationKey(selectionId, operationId));
      if (!op || record.currentOperationId !== operationId || context.state !== 'active' || Date.parse(context.expiresAt) <= Date.now() ||
        Date.parse(op.deadlineAt) <= Date.now() || op.state === 'cancelled') {
        await tx.put('commandJournal', {tag: 'source-late-result', selectionId, operationId, digest: resultDigest, receivedAt: now()}, `source-late:${selectionId}:${operationId}:${resultDigest}`);
        return {late: true, context};
      }
      if (!preview) {
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(op.kind === result.kind && result.sourceDocumentId === document.documentId, 'E_TARGET');
        if (op.result) { (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(op.resultDigest === resultDigest, 'E_BATCH_CONFLICT'); return {duplicate: true, context}; }
        op.result = result; op.resultDigest = resultDigest; op.state = result.status === 'cancelled' ? 'cancelled' : 'finished';
      } else {
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(op.kind === 'preview' && (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.canonical)(context) === (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.canonical)(result.context), 'E_TARGET');
        if (message.type === 'SOURCE_PREVIEW_DATA') {
          const old = op.frames[result.frameIndex];
          if (old) { (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(old.digest === result.digest, 'E_BATCH_CONFLICT'); return {duplicate: true, context}; }
          (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(!op.end && result.frameIndex === op.frames.length && result.rowStart === op.rawRows.length && op.frames.every(f => f.acked), 'E_SEAL_INCOMPLETE');
          (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(op.rawRows.length + result.rawRows.length <= 10, 'E_LIMIT');
          for (const row of result.rawRows) {
            (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(Object.keys(row).length === op.plan.fields.length && op.plan.fields.every(field => Object.hasOwn(row, field.id) && (!field.required || row[field.id] !== null)), 'E_SCHEMA');
            (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(bytes(row) <= _protocol_js__WEBPACK_IMPORTED_MODULE_0__.BUDGETS.maxRecordBytes, 'E_LIMIT');
          }
          op.rawRows.push(...result.rawRows); op.frames.push({digest: result.digest, acked: false});
        } else {
          if (op.end) { (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)((0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.canonical)(op.end) === (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.canonical)(result), 'E_BATCH_CONFLICT'); return {duplicate: true, context}; }
          (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(op.frames.every(f => f.acked) && result.frameCount === op.frames.length && result.rowCount === op.rawRows.length, 'E_SEAL_INCOMPLETE');
          return {context, endCandidate: op};
        }
      }
      await tx.put('commandJournal', op, operationKey(selectionId, operationId));
      return {context};
    });
    if (accepted.late) (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(false, 'E_CANCELLED', 'Late source result was audited and rejected');
    if (accepted.endCandidate) {
      const op = accepted.endCandidate;
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(await (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.digest)({pageIdentity: result.pageIdentity, rawRows: op.rawRows}) === result.rawSignature, 'E_HASH');
      const base = (0,_target_index_js__WEBPACK_IMPORTED_MODULE_1__.httpUrl)(result.documentBaseURI); (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(base.origin === accepted.context.origin, 'E_TARGET');
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(result.rowCount > 0 || op.plan.list.allowEmpty && result.emptyEvidence === 'allow-empty' ||
        op.plan.list.emptyMarkerSelector && result.emptyEvidence === `empty-marker:${op.plan.list.emptyMarkerSelector}`, 'E_SEAL_INCOMPLETE');
      await transaction('readwrite', async tx => {
        const record = await tx.get('commandJournal', contextKey(selectionId));
        const latest = await tx.get('commandJournal', operationKey(selectionId, operationId));
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(record.context.state === 'active' && record.currentOperationId === operationId && latest.state === 'accepted' && (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.canonical)(latest.rawRows) === (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.canonical)(op.rawRows), 'E_CANCELLED');
        latest.end = result; latest.state = 'finished'; await tx.put('commandJournal', latest, operationKey(selectionId, operationId));
      });
    }
    if (!accepted.duplicate) {
      if (preview) streams.get(`${selectionId}:${operationId}`)?.push(result);
      await emitToHost(accepted.context.registrationId, {protocol: _protocol_js__WEBPACK_IMPORTED_MODULE_0__.PROTOCOL, type: message.type, payload: result});
    }
    return {received: true, duplicate: !!accepted.duplicate};
  }

  async function ackSourceFrame(request, sender) {
    const host = await assertHost(sender, request.context.registrationId);
    const incarnation = await (0,_target_index_js__WEBPACK_IMPORTED_MODULE_1__.sessionIncarnation)(session);
    const context = await transaction('readwrite', async tx => {
      const record = await admit(tx, request.context.selectionId, host, incarnation, request.context);
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(record.currentOperationId === request.requestId, 'E_CANCELLED');
      const op = await tx.get('commandJournal', operationKey(record.selectionId, request.requestId));
      const frame = op?.frames[request.frameIndex];
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(op?.kind === 'preview' && op.state === 'accepted' && frame?.digest === request.digest, 'E_HASH');
      frame.acked = true; await tx.put('commandJournal', op, operationKey(record.selectionId, request.requestId));
      return record.context;
    });
    await send(context, {type: 'SOURCE_FRAME_ACK', payload: {selectionId: context.selectionId, requestId: request.requestId, frameIndex: request.frameIndex, digest: request.digest}});
    return {acked: true};
  }

  async function invalidate(predicate) {
    const invalidated = await transaction('readwrite', async tx => {
      const results = [];
      for (const record of await tx.all('commandJournal')) {
        if (record.tag !== 'source-context' || record.context.state !== 'active' || !predicate(record.context)) continue;
        const operationId = record.currentOperationId;
        if (operationId) {
          const op = await tx.get('commandJournal', operationKey(record.selectionId, operationId));
          if (op) { op.state = 'cancelled'; await tx.put('commandJournal', op, operationKey(record.selectionId, operationId)); }
        }
        record.context.state = 'invalidated'; record.context.contextRevision++; record.currentOperationId = null;
        await tx.put('commandJournal', record, contextKey(record.selectionId)); results.push({context: record.context, operationId});
      }
      return results;
    });
    for (const {context, operationId} of invalidated) {
      streams.get(`${context.selectionId}:${operationId}`)?.fail('E_CANCELLED');
      await cleanup(context, operationId);
      await emitToHost(context.registrationId, {protocol: _protocol_js__WEBPACK_IMPORTED_MODULE_0__.PROTOCOL, type: 'SOURCE_OPERATION', payload: {selectionId: context.selectionId, operationId, state: 'invalidated', duplicate: false}});
    }
  }

  const invalidateTab = tabId => invalidate(c => c.sourceTabId === tabId);
  const invalidateHost = registrationId => invalidate(c => c.registrationId === registrationId);
  async function expireSourceContexts() { const incarnation = await (0,_target_index_js__WEBPACK_IMPORTED_MODULE_1__.sessionIncarnation)(session); return invalidate(c => Date.parse(c.expiresAt) <= Date.now() || c.browserSessionIncarnation !== incarnation); }
  return {openSourceContext, startSourceSelection, cancelSourceSelection, releaseSourceContext, previewSource,
    handleAgentMessage, ackSourceFrame, invalidateTab, invalidateHost, expireSourceContexts};
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

/***/ "./src/platform/storage/idb.js":
/*!*************************************!*\
  !*** ./src/platform/storage/idb.js ***!
  \*************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   STORE_NAMES: () => (/* binding */ STORE_NAMES),
/* harmony export */   STORE_SCHEMA: () => (/* binding */ STORE_SCHEMA),
/* harmony export */   V1_STORE_NAMES: () => (/* binding */ V1_STORE_NAMES),
/* harmony export */   V1_STORE_SCHEMA: () => (/* binding */ V1_STORE_SCHEMA),
/* harmony export */   captureBackup: () => (/* binding */ captureBackup),
/* harmony export */   decodeRawBackup: () => (/* binding */ decodeRawBackup),
/* harmony export */   openConnection: () => (/* binding */ openConnection),
/* harmony export */   storageError: () => (/* binding */ storageError),
/* harmony export */   transact: () => (/* binding */ transact)
/* harmony export */ });
/* harmony import */ var _protocol_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../protocol.js */ "./src/platform/protocol.js");


// Sparse indexes deliberately do not index tagged metadata rows.
const V1_STORE_SCHEMA = Object.freeze({
  templates: {templateRevision: [['template.templateId', 'template.revision'], true], contentHash: ['template.contentHash', false]},
  runs: {runId: ['runId', true], slotKey: ['slotKey', true], retirementId: ['retirementId', false], state: ['state', false]},
  commandJournal: {commandId: ['commandId', true], runId: ['identity.runId', false], runOwnerState: [['identity.runId', 'identity.ownerEpoch', 'state'], false]},
  pageSnapshots: {snapshotId: ['snapshotId', true], runSealSeq: [['runId', 'sealSeq'], false], runPageSequence: [['runId', 'pageSequence'], true], readCommandId: ['readCommandId', false]},
  records: {snapshotRow: [['snapshotId', 'rowIndex'], true], runId: ['runId', false]},
  batches: {batchId: ['batchId', true], snapshotBatch: [['snapshotId', 'batchIndex'], true]},
  exportJobs: {exportJobId: ['exportJobId', true], runId: ['runId', false]},
  artifacts: {artifactId: ['artifact.artifactId', true], exportJobId: ['artifact.exportJobId', false]},
  // Only a bound attempt has attempt.downloadId. Receipts/candidates may share
  // downloadId without making the unique attempt binding index conflict.
  downloadReceipts: {downloadId: ['attempt.downloadId', true], fullBlobUrl: ['fullBlobUrl', false]},
  entitlements: {subject: ['subject', true]}
});
const V1_STORE_NAMES = Object.freeze(Object.keys(V1_STORE_SCHEMA));
const STORE_SCHEMA = Object.freeze({...V1_STORE_SCHEMA,
  commandJournal: {...V1_STORE_SCHEMA.commandJournal, commandId: [['identity.runId', 'commandId'], true]},
  scriptHeads: {}, scriptRevisions: {}, results: {}, frameworkKV: {}});
const STORE_NAMES = Object.freeze(Object.keys(STORE_SCHEMA));

function storageError(error) {
  if (error instanceof _protocol_js__WEBPACK_IMPORTED_MODULE_0__.FoundationError) return error;
  const failure = new _protocol_js__WEBPACK_IMPORTED_MODULE_0__.FoundationError(error?.name === 'QuotaExceededError' ? 'E_QUOTA' : 'E_SCHEMA',
    error?.name === 'QuotaExceededError' ? 'Storage quota exceeded' : 'IndexedDB operation failed');
  failure.cause = error;
  return failure;
}

function installSchema(db, upgrade, oldVersion) {
  (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(db.version === 1 || db.version === 2, 'E_VERSION', 'No reviewed migration exists for this database version');
  const schema = db.version === 1 ? V1_STORE_SCHEMA : STORE_SCHEMA;
  if (oldVersion === 1 && db.version === 2) {
    const journal = upgrade.objectStore('commandJournal');
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(journal.indexNames.contains('commandId'), 'E_VERSION', 'Missing legacy command index');
    const index = journal.index('commandId');
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(index.keyPath === 'commandId' && index.unique && !index.multiEntry, 'E_VERSION', 'Incompatible legacy command index');
    journal.deleteIndex('commandId');
  }
  for (const [name, indexes] of Object.entries(schema)) {
    const store = db.objectStoreNames.contains(name) ? upgrade.objectStore(name) : db.createObjectStore(name);
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(store.keyPath === null && !store.autoIncrement, 'E_VERSION', 'Storage requires explicit keys');
    for (const [indexName, [keyPath, unique]] of Object.entries(indexes)) {
      if (store.indexNames.contains(indexName)) {
        const index = store.index(indexName);
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(JSON.stringify(index.keyPath) === JSON.stringify(keyPath) && index.unique === unique && !index.multiEntry,
          'E_VERSION', 'Incompatible storage index');
      } else store.createIndex(indexName, keyPath, {unique});
    }
  }
}

async function validateOpenedSchema(db) {
  const schema = db.version === 1 ? V1_STORE_SCHEMA : STORE_SCHEMA;
  const tx = db.transaction(Object.keys(schema), 'readonly');
  const finished = new Promise((resolve, reject) => {tx.oncomplete = resolve; tx.onabort = () => reject(tx.error);});
  let failure;
  try {
    for (const [name, indexes] of Object.entries(schema)) {
      const store = tx.objectStore(name);
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(store.keyPath === null && !store.autoIncrement, 'E_VERSION', 'Storage requires explicit keys');
      for (const [name, [keyPath, unique]] of Object.entries(indexes)) {
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(store.indexNames.contains(name), 'E_VERSION', 'Storage index missing');
        const index = store.index(name);
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(JSON.stringify(index.keyPath) === JSON.stringify(keyPath) && index.unique === unique && !index.multiEntry,
          'E_VERSION', 'Incompatible storage index');
      }
    }
  } catch (error) {failure = error;}
  await finished;
  if (failure) throw failure;
}

// A reversible representation for native keys and the stored JSON contract.
// Unsupported structured-clone values fail closed before migration, never drop.
function encode(value, key = false, seen = new Set()) {
  if (value === null) { (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(!key, 'E_VERSION', 'Invalid backup key'); return {type: 'null'}; }
  if (value === undefined) { (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(!key, 'E_VERSION', 'Invalid backup key'); return {type: 'undefined'}; }
  if (typeof value === 'string' || typeof value === 'boolean') {
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(!key || typeof value === 'string', 'E_VERSION', 'Invalid backup key');
    return {type: typeof value, value};
  }
  if (typeof value === 'number') {
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(!key || !Number.isNaN(value), 'E_VERSION', 'Invalid backup key');
    return {type: 'number', value: Object.is(value, -0) ? '-0' : String(value)};
  }
  if (value instanceof Date) {
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(Number.isFinite(value.getTime()), 'E_VERSION', 'Invalid backup date');
    return {type: 'date', value: value.getTime()};
  }
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
    const bytes = value instanceof ArrayBuffer ? new Uint8Array(value) : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(key || value instanceof ArrayBuffer, 'E_VERSION', 'Unsupported backup value view');
    return {type: 'binary', value: Array.from(bytes)};
  }
  (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(typeof value === 'object' && !seen.has(value), 'E_VERSION', 'Unsupported or cyclic backup value');
  seen.add(value);
  let result;
  if (Array.isArray(value)) {
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(Object.keys(value).length === value.length && Array.from({length: value.length}, (_, i) => Object.hasOwn(value, i)).every(Boolean),
      'E_VERSION', 'Unsupported sparse backup array');
    result = {type: 'array', value: value.map(item => encode(item, key, seen))};
  } else {
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(!key && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null), 'E_VERSION', 'Unsupported backup value');
    result = {type: 'object', value: Object.keys(value).sort().map(name => [name, encode(value[name], false, seen)])};
  }
  seen.delete(value);
  return result;
}

function decode(node) {
  switch (node.type) {
    case 'null': return null;
    case 'undefined': return undefined;
    case 'number': return Number(node.value);
    case 'string': case 'boolean': return node.value;
    case 'date': return new Date(node.value);
    case 'binary': return new Uint8Array(node.value).buffer;
    case 'array': return node.value.map(decode);
    case 'object': return Object.fromEntries(node.value.map(([key, value]) => [key, decode(value)]));
    default: throw new _protocol_js__WEBPACK_IMPORTED_MODULE_0__.FoundationError('E_VERSION', 'Invalid backup encoding');
  }
}

function serializeBackup(backup) {
  return JSON.stringify({format: 'opendesk.raw-backup.v1', name: backup.name, version: backup.version,
    stores: backup.stores.map(store => ({name: store.name, records: store.records.map(row => ({key: encode(row.key, true), value: encode(row.value)}))}))});
}

function decodeRawBackup(utf8) {
  const value = JSON.parse(utf8);
  (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(value.format === 'opendesk.raw-backup.v1', 'E_VERSION', 'Unsupported backup format');
  return {name: value.name, version: value.version, stores: value.stores.map(store => ({name: store.name,
    records: store.records.map(row => ({key: decode(row.key), value: decode(row.value)}))}))};
}

async function captureBackup(db, {readOnly = false} = {}) {
  const names = Array.from(db.objectStoreNames);
  const backup = {name: db.name, version: db.version, readOnly,
    stores: names.length ? await transact(db, names, 'readonly', null, {raw: true}) : []};
  const utf8 = serializeBackup(backup), bytes = new TextEncoder().encode(utf8);
  const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
  (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(serializeBackup(decodeRawBackup(utf8)) === utf8, 'E_VERSION', 'Backup roundtrip failed');
  return {...backup, encoding: {format: 'opendesk.raw-backup.v1', utf8, byteLength: bytes.length, sha256}};
}

// Run the last check inside the exclusive upgrade transaction, before any schema
// mutation. No digest await is issued inside a native versionchange transaction.
function checkUpgradeBackup(db, transaction, previousVersion, backup, install, abort) {
  const names = Array.from(db.objectStoreNames), stores = [], pending = {count: names.length};
  const finish = () => {
    try {
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(backup && backup.version === previousVersion && backup.name === db.name, 'E_VERSION', 'Missing migration backup');
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(serializeBackup({name: db.name, version: previousVersion, stores}) === backup.encoding.utf8,
        'E_VERSION', 'Database changed after migration backup');
      install();
    } catch (error) {abort(error);}
  };
  if (!names.length) {finish(); return;}
  for (const name of names) {
    const records = [], request = transaction.objectStore(name).openCursor();
    stores.push({name, records});
    request.onerror = () => abort(request.error);
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {records.push({key: cursor.primaryKey, value: cursor.value}); cursor.continue();}
      else if (--pending.count === 0) finish();
    };
  }
}

function openRequest(factory, name, version, install, backup) {
  return new Promise((resolve, reject) => {
    let request, failure, settled = false, previousVersion = 0;
    try { request = version === undefined ? factory.open(name) : factory.open(name, version); }
    catch (error) { reject(error); return; }
    request.onupgradeneeded = event => {
      previousVersion = event.oldVersion;
      // A blocked request cannot be cancelled by IDBFactory. It may wake later;
      // reject/settle is permanent and this guard prevents a late installation.
      if (settled) { try { request.transaction.abort(); } catch {} return; }
      const abort = error => { failure ||= error; try { request.transaction.abort(); } catch {} };
      try {
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(install, 'E_VERSION', 'Cannot create a recovery database');
        const apply = () => installSchema(request.result, request.transaction, previousVersion);
        if (previousVersion === 1 && request.result.version === 2) checkUpgradeBackup(request.result, request.transaction, previousVersion, backup, apply, abort);
        else apply();
      } catch (error) { abort(error); }
    };
    request.onblocked = () => {
      settled = true;
      const error = new _protocol_js__WEBPACK_IMPORTED_MODULE_0__.FoundationError('E_VERSION', 'Storage upgrade blocked by another connection');
      error.blocked = true;
      error.migrationBackup = backup;
      reject(error);
    };
    request.onerror = () => {
      if (settled) return;
      settled = true;
      const error = failure || request.error || new _protocol_js__WEBPACK_IMPORTED_MODULE_0__.FoundationError('E_VERSION', 'Storage upgrade failed');
      error.previousVersion = previousVersion;
      reject(error);
    };
    request.onsuccess = () => {
      if (settled) { request.result.close(); return; }
      settled = true;
      resolve(request.result);
    };
  });
}

async function openConnection(factory, name, version, {readOnly = false} = {}) {
  let migrationBackup, existing;
  try {
    if (readOnly) return {db: await openRequest(factory, name, undefined, false), readOnly: true, migrationError: null, migrationBackup: null};
    if (version === 2) {
      try {existing = await openRequest(factory, name, undefined, false);}
      catch (error) {if (error.previousVersion !== 0) throw error;}
      if (existing?.version === 1) {
        try {migrationBackup = await captureBackup(existing, {readOnly: true});}
        catch (error) {existing.close(); error.previousVersion = 1; throw error;}
        existing.close();
      } else if (existing) existing.close();
    }
    const db = await openRequest(factory, name, version, true, migrationBackup);
    try {await validateOpenedSchema(db);}
    catch (error) {error.previousVersion = db.version; db.close(); throw error;}
    return {db, readOnly: false, migrationError: null, migrationBackup: migrationBackup || null};
  }
  catch (error) {
    // An aborted versionchange rolls back stores, indexes, data and version.
    // Never delete/recreate on failure. Recover at the *existing* version.
    if (!error.blocked && (error.previousVersion > 0 || error.name === 'VersionError')) {
      const db = await openRequest(factory, name, undefined, false);
      return {db, readOnly: true, migrationError: {code: 'E_VERSION', message: 'Upgrade failed; previous database preserved read-only',
        cause: {name: error.name, code: error.code || null, message: error.message}}, migrationBackup: migrationBackup || null};
    }
    throw error instanceof _protocol_js__WEBPACK_IMPORTED_MODULE_0__.FoundationError ? error : new _protocol_js__WEBPACK_IMPORTED_MODULE_0__.FoundationError('E_VERSION', 'Storage could not be opened');
  }
}

// Work may await SHA-256. Merely keeping one request pending is insufficient:
// a transaction can be inactive in the task that resolves that digest. Queue
// every operation and issue it inside the keepalive request's success event.
function transact(db, stores, mode, work, {raw = false} = {}) {
  return new Promise((resolve, reject) => {
    let native, result, failure, workDone = false, ended = false;
    const queue = [];
    try { native = db.transaction(stores, mode); } catch (error) { reject(storageError(error)); return; }
    const enqueue = action => new Promise((yes, no) => {
      if (ended || workDone) { no(new _protocol_js__WEBPACK_IMPORTED_MODULE_0__.FoundationError('E_SCHEMA', 'Transaction already finished')); return; }
      queue.push({action, yes, no});
    });
    const object = store => {
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(stores.includes(store), 'E_SCHEMA', 'Store outside transaction scope');
      return native.objectStore(store);
    };
    const keyRequired = key => (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(key !== undefined && key !== null, 'E_SCHEMA', 'Explicit key required');
    const api = Object.freeze({
      get: (store, key) => enqueue(() => { keyRequired(key); return object(store).get(key); }),
      put: (store, value, key) => enqueue(() => { keyRequired(key); return object(store).put(value, key); }),
      delete: (store, key) => enqueue(() => { keyRequired(key); return object(store).delete(key); }),
      all: store => enqueue(() => object(store).getAll())
    });
    const abort = error => {
      failure ||= error;
      try { native.abort(); } catch { /* oncomplete/onabort settles the result */ }
    };
    const finish = error => {
      ended = true;
      for (const item of queue.splice(0)) item.no(error || new _protocol_js__WEBPACK_IMPORTED_MODULE_0__.FoundationError('E_SCHEMA', 'Transaction finished'));
      if (error) reject(error); else resolve(result);
    };
    native.onabort = () => finish(storageError(failure || native.error));
    native.onerror = () => { failure ||= native.error; };
    native.oncomplete = () => finish(workDone ? failure : new _protocol_js__WEBPACK_IMPORTED_MODULE_0__.FoundationError('E_SCHEMA', 'Transaction completed before work'));
    const pump = () => {
      if (ended) return;
      for (const item of queue.splice(0)) {
        try {
          const request = item.action();
          request.onsuccess = () => item.yes(request.result);
          request.onerror = () => { const error = request.error; item.no(storageError(error)); abort(error); };
        } catch (error) { item.no(storageError(error)); abort(error); return; }
      }
      if (!workDone) {
        try {
          const request = native.objectStore(stores[0]).get('@storage-keepalive');
          request.onsuccess = pump;
          request.onerror = () => abort(request.error);
        } catch (error) { abort(error); }
      }
    };
    if (raw) {
      // Consistent backup retains original explicit keys, including unknown
      // pre-migration records, without exposing extra transaction API methods.
      Promise.all(stores.map(store => new Promise((yes, no) => {
        const rows = [], request = native.objectStore(store).openCursor();
        request.onerror = () => no(request.error);
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) { yes({name: store, records: rows}); return; }
          rows.push({key: cursor.primaryKey, value: cursor.value});
          cursor.continue();
        };
      }))).then(value => { result = value; workDone = true; }, abort);
    } else {
      pump();
      Promise.resolve().then(() => work(api)).then(value => { result = value; workDone = true; }, abort);
    }
  });
}


/***/ }),

/***/ "./src/platform/storage/index.js":
/*!***************************************!*\
  !*** ./src/platform/storage/index.js ***!
  \***************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   STORAGE_KEYS: () => (/* reexport safe */ _repository_js__WEBPACK_IMPORTED_MODULE_2__.STORAGE_KEYS),
/* harmony export */   STORE_NAMES: () => (/* reexport safe */ _idb_js__WEBPACK_IMPORTED_MODULE_1__.STORE_NAMES),
/* harmony export */   STORE_SCHEMA: () => (/* reexport safe */ _idb_js__WEBPACK_IMPORTED_MODULE_1__.STORE_SCHEMA),
/* harmony export */   V1_STORE_NAMES: () => (/* reexport safe */ _idb_js__WEBPACK_IMPORTED_MODULE_1__.V1_STORE_NAMES),
/* harmony export */   V1_STORE_SCHEMA: () => (/* reexport safe */ _idb_js__WEBPACK_IMPORTED_MODULE_1__.V1_STORE_SCHEMA),
/* harmony export */   createStorage: () => (/* binding */ createStorage),
/* harmony export */   decodeRawBackup: () => (/* reexport safe */ _idb_js__WEBPACK_IMPORTED_MODULE_1__.decodeRawBackup)
/* harmony export */ });
/* harmony import */ var _protocol_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../protocol.js */ "./src/platform/protocol.js");
/* harmony import */ var _idb_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./idb.js */ "./src/platform/storage/idb.js");
/* harmony import */ var _repository_js__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./repository.js */ "./src/platform/storage/repository.js");







const connections = new WeakMap();

async function createStorage({indexedDB = globalThis.indexedDB, name = 'opendesk-browser', version = 2, readOnly = false,
  clock = {now: () => Date.now()}, admission, admitTemplate, sessionTyped} = {}) {
  (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(indexedDB && typeof indexedDB.open === 'function', 'E_SCHEMA', 'IndexedDB unavailable');
  (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(typeof name === 'string' && name.length > 0 && [1, 2].includes(version) && typeof readOnly === 'boolean', 'E_VERSION', 'Invalid database identity');
  (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(typeof clock.now === 'function', 'E_SCHEMA', 'clock.now required');
  let registry = connections.get(indexedDB);
  if (!registry) { registry = new Map(); connections.set(indexedDB, registry); }
  const existing = registry.get(name);
  if (existing) {
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(existing.version === version && existing.readOnly === readOnly && existing.admission === admission && existing.admitTemplate === admitTemplate && existing.sessionTyped === sessionTyped, 'E_VERSION', 'Database already owned with different configuration');
    return existing.promise;
  }
  const owner = {version, readOnly, admission, admitTemplate, sessionTyped};
  registry.set(name, owner);
  owner.promise = (async () => {
    const {db, readOnly: effectiveReadOnly, migrationError, migrationBackup} = await (0,_idb_js__WEBPACK_IMPORTED_MODULE_1__.openConnection)(indexedDB, name, version, {readOnly});
    let closed = false;
    const close = () => { if (!closed) { closed = true; db.close(); if (registry.get(name) === owner) registry.delete(name); } };
    db.onversionchange = close;
    db.onclose = close;
    const service = {
      name, version: db.version, readOnly: effectiveReadOnly, migrationError, migrationBackup,
      close,
      transaction(stores, mode, work) {
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(!closed, 'E_VERSION', 'Storage connection closed');
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(Array.isArray(stores) && stores.length > 0 && new Set(stores).size === stores.length && stores.every(s => db.objectStoreNames.contains(s)), 'E_SCHEMA', 'Invalid transaction stores');
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(mode === 'readonly' || mode === 'readwrite', 'E_SCHEMA', 'Invalid transaction mode');
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(!effectiveReadOnly || mode === 'readonly', 'E_VERSION', 'Recovery database is read-only; preserve backup before migration');
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(typeof work === 'function', 'E_SCHEMA', 'Transaction callback required');
        return (0,_idb_js__WEBPACK_IMPORTED_MODULE_1__.transact)(db, stores, mode, work);
      },
      async rawBackup() {
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(!closed, 'E_VERSION', 'Storage connection closed');
        return (0,_idb_js__WEBPACK_IMPORTED_MODULE_1__.captureBackup)(db, {readOnly: effectiveReadOnly});
      }
    };
    return Object.freeze(Object.assign(service, (0,_repository_js__WEBPACK_IMPORTED_MODULE_2__.createStorageMethods)(service, {clock, admission, admitTemplate, sessionTyped})));
  })();
  try { return await owner.promise; } catch (error) { if (registry.get(name) === owner) registry.delete(name); throw error; }
}


/***/ }),

/***/ "./src/platform/storage/repository.js":
/*!********************************************!*\
  !*** ./src/platform/storage/repository.js ***!
  \********************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   STORAGE_KEYS: () => (/* binding */ STORAGE_KEYS),
/* harmony export */   createStorageMethods: () => (/* binding */ createStorageMethods)
/* harmony export */ });
/* harmony import */ var _protocol_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../protocol.js */ "./src/platform/protocol.js");
/* harmony import */ var _idb_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./idb.js */ "./src/platform/storage/idb.js");
/* harmony import */ var _journal_js__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../journal.js */ "./src/platform/journal.js");
/* harmony import */ var _page_port_codec_js__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ../page-port/codec.js */ "./src/platform/page-port/codec.js");





const STORAGE_KEYS = Object.freeze({
  slot: '@slot', host: id => `host:${id}`, templateHead: id => `head:${id}`,
  templateRevision: (id, revision) => `${id}:${revision}`,
  begin: (runId, requestId) => `begin:${runId}:${requestId}`,
  reader: id => `reader:${id}`, tombstone: id => `tombstone:${id}`, retention: id => `retention:${id}`,
  migration: id => `migration:${id}`
});
const terminal = new Set(['completed', 'limit_reached', 'stopped', 'failed', 'interrupted', 'abandoned_unknown']);
const encoder = new TextEncoder();
const clone = value => structuredClone(value);
const bytes = value => encoder.encode((0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.canonical)(value)).byteLength;
const record = value => ({rowIndex: value.rowIndex, recordKey: value.recordKey, raw: value.raw, values: value.values});
const pick = (value, keys) => Object.fromEntries(keys.map(key => [key, value[key]]));
const commandKeys = ['commandId', 'identity', 'kind', 'payload', 'digest', 'state', 'preparedAt', 'dispatchAt', 'resultDigest'];
const headKey = STORAGE_KEYS.templateHead;
const revisionKey = STORAGE_KEYS.templateRevision;
const checkId = id => (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(typeof id === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(id), 'E_SCHEMA', 'Invalid id');
const equal = (a, b) => (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.canonical)(a) === (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.canonical)(b);
const sdkStores = ['frameworkKV', 'commandJournal', 'results'];
const kvKey = (namespace, area, key) => `kv:${(0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.canonical)([namespace, area, key])}`;
const scriptKey = (namespace, id, revision) => `script:${(0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.canonical)(revision === undefined ? [namespace, id] : [namespace, id, revision])}`;
const pinKey = (context, id, revision) => `script-pin:${(0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.canonical)([context.namespace, context.runId, context.opId, id, revision])}`;
const contextFields = ['namespace', 'principal', 'grantIncarnation', 'runId', 'opId', 'requestId', 'resultId', 'browserSessionIncarnation'];

function pageUrl(value, origin) {
  let url;
  try { url = new URL(value); } catch { throw new _protocol_js__WEBPACK_IMPORTED_MODULE_0__.FoundationError('E_TARGET', 'Invalid authenticated page URL'); }
  (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(['https:', 'http:'].includes(url.protocol) && !url.username && !url.password && url.origin === origin,
    'E_TARGET', 'Page outside target origin');
  url.hash = '';
  (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(url.href === value, 'E_TARGET', 'Page URL must be normalized without fragment');
  return url.href;
}

async function checkedTemplate(row) {
  (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(row?.template && row?.metadata, 'E_SCHEMA', 'Template revision missing');
  const template = row.template;
  (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.validate)('TemplateRevision', template);
  (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.validate)('TemplateMetadata', row.metadata);
  (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(template.templateId === row.metadata.templateId && template.revision === row.metadata.headRevision,
    'E_SCHEMA', 'Template metadata mismatch');
  const {contentHash, ...body} = template;
  (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(await (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.digest)(body) === contentHash, 'E_HASH', 'Template hash mismatch');
  return template;
}

function templateSemantics(template) {
  (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(template.parentRevision === (template.revision === 1 ? null : template.revision - 1), 'E_PARENT_CONFLICT', 'Revision ancestry must be contiguous');
  const ids = template.fields.map(field => field.id);
  (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(new Set(ids).size === ids.length && template.columns.length === ids.length && new Set(template.columns).size === ids.length && template.columns.every(id => ids.includes(id)), 'E_SEMANTIC', 'Columns must be the exact field permutation');
  (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(!ids.some(id => ['__proto__', 'prototype', 'constructor'].includes(id)), 'E_SCHEMA', 'Unsafe field id');
  let origin, start;
  try { origin = new URL(template.allowedOrigin); start = new URL(template.startUrl); }
  catch { throw new _protocol_js__WEBPACK_IMPORTED_MODULE_0__.FoundationError('E_SEMANTIC', 'Template URL invalid'); }
  (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(['https:', 'http:'].includes(origin.protocol) && origin.origin === template.allowedOrigin && start.origin === origin.origin && !start.username && !start.password && start.href === template.startUrl, 'E_SEMANTIC', 'Template URLs must be canonical and same-origin');
  const capabilities = new Set(['dom.top.v1', `pagination.${template.pagination.mode}.v1`]);
  for (const field of template.fields) {
    capabilities.add(`read.${field.read}.v1`);
    if (field.transforms.length) capabilities.add('transform.safe.v1');
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)((field.read === 'attribute' && typeof field.attribute === 'string' && field.attribute.length > 0) || (field.read === 'text' && field.attribute === null), 'E_SEMANTIC', 'Invalid attribute read configuration');
  }
  const infrastructure = new Set(['page.stage-seal.v1', 'download.receipt.v1', 'transform.safe.v1']);
  (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)([...capabilities].every(c => template.requiredCapabilities.includes(c)) && template.requiredCapabilities.every(c => capabilities.has(c) || infrastructure.has(c)), 'E_CAPABILITY', 'Template capabilities do not cover its operations');
}

function createStorageMethods(service, {clock = {now: () => Date.now()}, admission, admitTemplate, sessionTyped} = {}) {
  const sessionExecute = typeof sessionTyped?.executeSdk === 'function' ? sessionTyped.executeSdk.bind(sessionTyped) : null;
  const hooks = {admission, admitTemplate};
  const pending = new Map();
  const gate = async (operation, request, tx, run, historical = false) => {
    const decision = hooks.admission ? await hooks.admission({operation, request: clone(request), tx, run: run && clone(run), historical}) : undefined;
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(decision !== false, 'E_OWNER', 'Storage admission rejected');
    return decision || {};
  };
  const now = () => {
    const value = clock.now();
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(Number.isSafeInteger(value) && value >= 0, 'E_SCHEMA', 'Invalid storage clock');
    return value;
  };
  const untombstoned = async (tx, runId) => {
    const run = await tx.get('runs', runId);
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(run && !run.tombstoned && !await tx.get('commandJournal', STORAGE_KEYS.tombstone(runId)), 'E_TOMBSTONE', 'Run unavailable or deleted');
    return run;
  };
  const auth = async (tx, identity, historical = false, allowPreparing = false) => {
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.validate)('Identity', identity);
    const run = await untombstoned(tx, identity.runId);
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(run.runId === identity.runId && run.ownerEpoch === identity.ownerEpoch && run.hostInstanceId === identity.hostInstanceId && run.hostDocumentId === identity.hostDocumentId,
      'E_OWNER', 'Run owner fenced');
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(run.templateHash === identity.templateHash && run.identity?.templateHash === identity.templateHash, 'E_HASH', 'Run template mismatch');
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(run.identity && (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.sameIdentity)(run.identity, identity, {ignoreRevision: true}) && equal(run.target, identity.target) && run.browserSessionIncarnation === identity.target.browserSessionIncarnation,
      'E_TARGET', 'Run target or document changed');
    const host = await tx.get('commandJournal', STORAGE_KEYS.host(run.registrationId));
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(host?.active === true && host.registrationId === run.registrationId && host.hostInstanceId === identity.hostInstanceId && host.hostDocumentId === identity.hostDocumentId,
      'E_OWNER', 'Original host registration unavailable');
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(host.browserSessionIncarnation === run.browserSessionIncarnation, 'E_OWNER', 'Host session fenced');
    if (!historical) {
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(run.cancelSeq === 0 && !['stopping', 'stopped', 'retiring'].includes(run.state), 'E_CANCELLED', 'Run cancelled');
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(run.runRevision === identity.runRevision, 'E_REVISION', 'Run revision changed');
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(run.state === 'running' || (allowPreparing && run.state === 'preparing'), 'E_OWNER', 'Run is not collecting');
    }
    return run;
  };
  const templateForRun = async (tx, run) => {
    const rows = (await tx.all('templates')).filter(row => row.template?.contentHash === run.templateHash);
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(rows.length === 1, 'E_SCHEMA', 'Stored template hash must match exactly one revision');
    return checkedTemplate(rows[0]);
  };
  const limits = run => ({...run.entitlementSnapshot.effectiveLimits});
  const duration = run => {
    const approved = Date.parse(run.entitlementSnapshot.approvedAt);
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(Number.isFinite(approved) && now() >= approved, 'E_LIMIT', 'Run clock changed');
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(now() - approved < limits(run).maxDurationMs, 'E_LIMIT', 'Run duration limit reached');
  };
  const profileBytes = async tx => {
    const runs = await tx.all('runs'), artifacts = await tx.all('artifacts'), journal = await tx.all('commandJournal');
    return runs.reduce((n, row) => n + (row.runId ? row.storedBytes : 0), 0) +
      artifacts.reduce((n, row) => n + (row.tag === 'artifact' ? row.artifact.byteCount : 0), 0) +
      journal.reduce((n, row) => n + (row.tag === 'migration-backup' ? row.utf8Bytes : 0), 0);
  };
  const abortOpen = async (tx, snapshot, code) => {
    if (snapshot?.state === 'open') {
      snapshot.state = 'aborted'; snapshot.abortReason = code;
      await tx.put('pageSnapshots', snapshot, snapshot.snapshotId);
    }
  };
  const pageStores = ['runs', 'commandJournal', 'pageSnapshots', 'batches', 'records', 'templates', 'artifacts'];
  const pageMutation = async (operation, request, work) => {
    let outcome;
    try {
      outcome = await service.transaction(pageStores, 'readwrite', async tx => {
        let snapshot, trusted = false;
        try {
          await gate(operation, request, tx);
          await auth(tx, request.identity, true);
          snapshot = await tx.get('pageSnapshots', request.snapshotId);
          (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(snapshot && snapshot.runId === request.identity.runId && (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.sameIdentity)(snapshot.sourceIdentity, request.identity, {ignoreRevision: true}), 'E_TARGET', 'Snapshot source binding mismatch');
          trusted = true;
          return {value: await work(tx, snapshot)};
        } catch (error) {
          const failure = (0,_idb_js__WEBPACK_IMPORTED_MODULE_1__.storageError)(error);
          if (trusted) await abortOpen(tx, snapshot, failure.code);
          return {error: failure};
        }
      });
    } catch (error) {
      const failure = (0,_idb_js__WEBPACK_IMPORTED_MODULE_1__.storageError)(error);
      if (failure.code === 'E_QUOTA') {
        // The failing IDB transaction rolled back. Persist only the abort in a
        // fresh small transaction; even if disk refuses it, no rows are sealed.
        try {
          await service.transaction(['runs', 'commandJournal', 'pageSnapshots'], 'readwrite', async tx => {
            await gate(operation, request, tx);
            await auth(tx, request.identity, true);
            const snapshot = await tx.get('pageSnapshots', request.snapshotId);
            if (snapshot && (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.sameIdentity)(snapshot.sourceIdentity, request.identity, {ignoreRevision: true})) await abortOpen(tx, snapshot, 'E_QUOTA');
          });
        } catch { failure.pageAbortPersisted = false; }
      }
      throw failure;
    }
    if (outcome.error) throw outcome.error;
    return outcome.value;
  };

  const fields = (template, raw, values) => {
    const ids = template.fields.map(field => field.id);
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(Object.keys(raw).length === ids.length && ids.every(id => Object.hasOwn(raw, id)) &&
      (!values || (Object.keys(values).length === ids.length && ids.every(id => Object.hasOwn(values, id)))), 'E_SCHEMA', 'Record field keys must match the stored template');
    for (const field of template.fields) {
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(!field.required || raw[field.id] !== null, 'E_SEMANTIC', 'Required raw field missing');
      if (values) (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(raw[field.id] === null ? values[field.id] === null : typeof values[field.id] === field.type, 'E_SEMANTIC', 'Typed value differs from template field type');
    }
  };
  const readEvidence = async (tx, snapshot, template, requireEnd) => {
    const command = await tx.get('commandJournal', (0,_journal_js__WEBPACK_IMPORTED_MODULE_2__.commandKey)(snapshot.runId, snapshot.readCommandId));
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(command?.tag !== 'read-reservation' && command?.kind === 'read-page' && ['dispatched', 'confirmed'].includes(command.state), 'E_SEAL_INCOMPLETE', 'Authenticated read has not been dispatched');
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.validate)('Command', pick(command, commandKeys));
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(command.dispatchAt && command.snapshotId === snapshot.snapshotId && command.payload.snapshotId === snapshot.snapshotId && command.payload.pageSequence === snapshot.pageSequence && command.payload.expectedPageIdentity === snapshot.pageIdentity &&
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.sameIdentity)(command.identity, snapshot.sourceIdentity), 'E_TARGET', 'Read command bound to a different page');
    const {digest: commandDigest} = command;
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(await (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.digest)(pick(command, ['commandId', 'identity', 'kind', 'payload'])) === commandDigest, 'E_HASH', 'Stored read command digest mismatch');
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(command.payload.plan.templateHash === template.contentHash, 'E_HASH', 'Read plan template mismatch');
    const {planHash, ...planContent} = command.payload.plan;
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(command.payload.plan.contractVersion === _protocol_js__WEBPACK_IMPORTED_MODULE_0__.CONTRACT_VERSION && command.payload.plan.compilerVersion === _protocol_js__WEBPACK_IMPORTED_MODULE_0__.CONTRACT_VERSION && await (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.digest)(planContent) === planHash, 'E_HASH', 'Read plan version or hash mismatch');
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(equal(command.payload.plan.capabilities, template.requiredCapabilities), 'E_CAPABILITY', 'Read plan capability mismatch');
    for (const key of ['list', 'fields', 'pagination', 'columns', 'limits']) (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(equal(command.payload.plan[key], template[key]), 'E_SEMANTIC', 'Read plan differs from stored template');
    const rawRows = [], frames = command.rawFrames;
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(Array.isArray(frames), 'E_SEAL_INCOMPLETE', 'Authenticated raw frame evidence missing');
    for (let index = 0; index < frames.length; index++) {
      const frame = frames[index];
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.validate)('PageReadData', frame);
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(frame.frameIndex === index && frame.rowStart === rawRows.length, 'E_SEAL_INCOMPLETE', 'Raw frame gap or overlap');
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(frame.commandId === command.commandId && frame.snapshotId === snapshot.snapshotId && (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.sameIdentity)(frame.identity, snapshot.sourceIdentity), 'E_TARGET', 'Raw frame source mismatch');
      const envelope = pick(frame, ['snapshotId', 'frameIndex', 'rowStart', 'rawRows']);
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(bytes(envelope) <= _protocol_js__WEBPACK_IMPORTED_MODULE_0__.BUDGETS.maxRawFrameBytes && await (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.digest)(envelope) === frame.digest, 'E_HASH', 'Raw frame bytes or digest mismatch');
      for (const raw of frame.rawRows) { fields(template, raw); rawRows.push(raw); }
    }
    const end = command.pageEnd;
    if (requireEnd || end) {
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(end, 'E_SEAL_INCOMPLETE', 'Authenticated page end missing');
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.validate)('PageReadEnd', end);
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(end.commandId === command.commandId && end.snapshotId === snapshot.snapshotId && (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.sameIdentity)(end.identity, snapshot.sourceIdentity) && end.pageIdentity === snapshot.pageIdentity, 'E_TARGET', 'Page end source mismatch');
      pageUrl(end.pageIdentity, snapshot.sourceIdentity.target.allowedOrigin);
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(end.rowCount === rawRows.length && end.frameCount === frames.length && await (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.digest)({pageIdentity: end.pageIdentity, rawRows}) === end.rawSignature, 'E_SEAL_INCOMPLETE', 'Page end is not the complete raw read');
      if (command.state === 'confirmed') (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(command.resultDigest === await (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.digest)(end), 'E_HASH', 'Confirmed read result differs from end evidence');
    }
    return {rawRows, end};
  };
  const readSnapshotRecords = async (tx, snapshot, batches) => {
    const records = [];
    for (let index = 0; index < batches.length; index++) {
      const batch = batches[index];
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(batch.batchIndex === index && batch.rowStart === records.length && batch.rowCount > 0 && batch.batchId === `${snapshot.snapshotId}:${index}`, 'E_SEAL_INCOMPLETE', 'Stage batch gap or overlap');
      const part = [];
      for (let offset = 0; offset < batch.rowCount; offset++) {
        const rowIndex = batch.rowStart + offset;
        const stored = await tx.get('records', `${snapshot.snapshotId}:${rowIndex}`);
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(stored && stored.snapshotId === snapshot.snapshotId && stored.runId === snapshot.runId && stored.batchId === batch.batchId && stored.rowIndex === rowIndex && stored.recordKey === `${snapshot.snapshotId}:${rowIndex}`, 'E_SEAL_INCOMPLETE', 'Stored row missing or out of order');
        const value = record(stored); (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.validate)('Record', value); part.push(value);
      }
      const envelope = {snapshotId: snapshot.snapshotId, batchIndex: index, records: part};
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(bytes(envelope) === batch.utf8Bytes && await (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.digest)(envelope) === batch.digest, 'E_HASH', 'Stored batch bytes or digest mismatch');
      records.push(...part);
    }
    return records;
  };

  // This surface receives only the broker's per-call closures. Legacy mutable
  // foundation admission hooks are deliberately not consulted by SDK storage.
  const trustedContext = context => {
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(context && typeof context.authorize === 'function' && typeof context.authorizeInTransaction === 'function',
      'E_OWNER', 'Trusted storage authorization callbacks required');
    for (const key of [...contextFields.filter(key => key !== 'principal'), 'opKey']) {
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(typeof context[key] === 'string' && context[key].length > 0, 'E_OWNER', `Trusted context ${key} required`);
    }
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(context.principal !== undefined && context.principal !== null, 'E_OWNER', 'Trusted principal required');
    (0,_page_port_codec_js__WEBPACK_IMPORTED_MODULE_3__.encodeValue)(context.principal);
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(Number.isSafeInteger(context.deadlineAt) && context.deadlineAt > now(), 'E_TIMEOUT', 'Storage operation deadline exceeded');
    return Object.freeze({...context, principal: clone(context.principal)});
  };
  const authorize = async (context, tx) => {
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(context.deadlineAt > now(), 'E_TIMEOUT', 'Storage operation deadline exceeded');
    const decision = tx ? await context.authorizeInTransaction(tx) : await context.authorize();
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(decision !== false, 'E_OWNER', 'Storage authorization revoked');
  };
  const bindings = context => Object.fromEntries(contextFields.map(key => [key, clone(context[key])]));
  const bound = (row, context) => row && contextFields.every(key =>
    JSON.stringify((0,_page_port_codec_js__WEBPACK_IMPORTED_MODULE_3__.encodeValue)(row[key])) === JSON.stringify((0,_page_port_codec_js__WEBPACK_IMPORTED_MODULE_3__.encodeValue)(context[key])));
  const operation = async (tx, context) => {
    const row = await tx.get('commandJournal', context.opKey);
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(row?.tag === 'sdk-operation' && bound(row, context), 'E_OWNER', 'SDK operation binding mismatch');
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(!['cancelled', 'revoked', 'effect_unknown', 'failed', 'interrupted'].includes(row.state), 'E_OWNER', 'SDK operation fenced');
    return row;
  };
  const durable = async (tx, context, op, requestDigest, outcomeWire) => {
    const old = await tx.get('results', context.resultId);
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(!old, 'E_REQUEST_CONFLICT', 'Result ID already occupied');
    const result = {tag: 'sdk-result', ...bindings(context), opKey: context.opKey, requestDigest: op.requestDigest,
      storageRequestDigest: requestDigest,
      state: 'durable', outcomeWire, committedAt: now()};
    result.receiptAt = new Date(result.committedAt).toISOString();
    if (outcomeWire.ok) result.valueWire = outcomeWire.value;
    await tx.put('results', result, context.resultId);
    await tx.put('commandJournal', {...op, storageRequestDigest: requestDigest, state: 'durable',
      durableAt: result.committedAt, receiptAt: result.receiptAt, resultId: context.resultId, receipt: {resultId: context.resultId, state: 'durable'}}, context.opKey);
    return result;
  };
  const originalResult = async (tx, context, op, requestDigest) => {
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(op.storageRequestDigest === requestDigest, 'E_REQUEST_CONFLICT', 'SDK request digest conflict');
    const result = await tx.get('results', context.resultId);
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(result?.tag === 'sdk-result' && bound(result, context) && result.opKey === context.opKey &&
      result.state === 'durable' && result.storageRequestDigest === requestDigest && result.requestDigest === op.requestDigest,
      'E_OWNER', 'Durable result binding mismatch');
    (0,_page_port_codec_js__WEBPACK_IMPORTED_MODULE_3__.decodeOutcome)(result.outcomeWire);
    return result;
  };
  const persistentSdk = async (method, args, sourceContext) => {
    const context = trustedContext(sourceContext), input = clone(args);
    // Wire encoding already sorts object keys and enforces the value budget.
    // Do not feed its tag nesting through the legacy JSON depth-12 canonicalizer.
    const requestDigest = await (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.digestUtf8)(JSON.stringify([method, (0,_page_port_codec_js__WEBPACK_IMPORTED_MODULE_3__.encodeValue)(input)]));
    await authorize(context);
    const result = await service.transaction(sdkStores, 'readwrite', async tx => {
      await authorize(context, tx);
      const op = await operation(tx, context);
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(op.method === method && context.method === method, 'E_REQUEST_CONFLICT', 'SDK admitted method mismatch');
      if (op.storageRequestDigest !== undefined || op.state === 'durable') {
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(op.state === 'durable', 'E_OWNER', 'Storage operation is not replayable');
        const result = await originalResult(tx, context, op, requestDigest);
        await authorize(context, tx);
        return result;
      }
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(['admitted', 'pending', 'prepared', 'dispatched'].includes(op.state), 'E_OWNER', 'Storage operation not admitted');
      const read = key => tx.get('frameworkKV', kvKey(context.namespace, 'user', key));
      const put = (key, value) => tx.put('frameworkKV', {tag: 'framework-kv', namespace: context.namespace,
        area: 'user', key, valueWire: (0,_page_port_codec_js__WEBPACK_IMPORTED_MODULE_3__.encodeValue)(value)}, kvKey(context.namespace, 'user', key));
      const key = value => (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(typeof value === 'string' && value.length > 0, 'E_SCHEMA', 'Storage key required');
      let value;
      if (method === 'APPSTORAGE_GETITEM') {
        key(input.key); const row = await read(input.key); value = row ? String((0,_page_port_codec_js__WEBPACK_IMPORTED_MODULE_3__.decodeValue)(row.valueWire)) : null;
      } else if (method === 'APPSTORAGE_SETITEM') {
        key(input.key); await put(input.key, String(input.value));
      } else if (method === 'APPSTORAGE_REMOVEITEM') {
        key(input.key); await tx.delete('frameworkKV', kvKey(context.namespace, 'user', input.key));
      } else if (method === 'APPSTORAGE_CLEAR' || method === 'CHROME_LOCAL_CLEAR') {
        for (const row of await tx.all('frameworkKV')) if (row.tag === 'framework-kv' && row.namespace === context.namespace && row.area === 'user') {
          await tx.delete('frameworkKV', kvKey(context.namespace, 'user', row.key));
        }
      } else if (method === 'CHROME_LOCAL_GET') {
        if (input.key === null) value = (await tx.all('frameworkKV')).filter(row => row.tag === 'framework-kv' &&
          row.namespace === context.namespace && row.area === 'user').map(row => (0,_page_port_codec_js__WEBPACK_IMPORTED_MODULE_3__.decodeValue)(row.valueWire));
        else {key(input.key); const row = await read(input.key); value = row ? (0,_page_port_codec_js__WEBPACK_IMPORTED_MODULE_3__.decodeValue)(row.valueWire) : undefined;}
      } else if (method === 'CHROME_LOCAL_SET') {
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(input.values && !Array.isArray(input.values) && typeof input.values === 'object', 'E_SCHEMA', 'Storage values object required');
        for (const [name, item] of Object.entries(input.values)) {key(name); await put(name, item);}
      } else if (method === 'CHROME_LOCAL_REMOVE') {
        const names = Array.isArray(input.keys) ? input.keys : [input.keys];
        for (const name of names) {key(name); await tx.delete('frameworkKV', kvKey(context.namespace, 'user', name));}
      } else if (method === 'DEVICE_GET_APP_ID') {
        const storageKey = kvKey(context.namespace, 'device', 'deviceID'), old = await tx.get('frameworkKV', storageKey);
        if (old) value = (0,_page_port_codec_js__WEBPACK_IMPORTED_MODULE_3__.decodeValue)(old.valueWire);
        else {value = (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.newId)(); await tx.put('frameworkKV', {tag: 'device-id', namespace: context.namespace,
          area: 'device', key: 'deviceID', valueWire: (0,_page_port_codec_js__WEBPACK_IMPORTED_MODULE_3__.encodeValue)(value)}, storageKey);}
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(typeof value === 'string' && value.length > 0, 'E_SCHEMA', 'Invalid persistent device ID');
      } else throw new _protocol_js__WEBPACK_IMPORTED_MODULE_0__.FoundationError('E_CAPABILITY', 'Unsupported persistent storage method');
      const outcomeWire = (0,_page_port_codec_js__WEBPACK_IMPORTED_MODULE_3__.encodeOutcome)({ok: true, value});
      // This final grant/incarnation/op CAS is in the same native transaction
      // as every effect and the durable result. A denial aborts all writes.
      await authorize(context, tx);
      const finalOp = await operation(tx, context);
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(finalOp.state === op.state && finalOp.storageRequestDigest === op.storageRequestDigest, 'E_OWNER', 'SDK operation CAS changed');
      return durable(tx, context, finalOp, requestDigest, outcomeWire);
    });
    // Revocation here prevents delivery, while preserving the committed fact.
    await authorize(context);
    const outcome = (0,_page_port_codec_js__WEBPACK_IMPORTED_MODULE_3__.decodeOutcome)(result.outcomeWire);
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(outcome.ok, 'E_SCHEMA', 'Storage result is not successful');
    return outcome.value;
  };
  const revisionMutation = async (sourceContext, work) => {
    const context = trustedContext(sourceContext);
    await authorize(context);
    const value = await service.transaction(['scriptHeads', 'scriptRevisions', 'commandJournal'], 'readwrite', async tx => {
      await authorize(context, tx); const result = await work(tx, context); await authorize(context, tx); return result;
    });
    await authorize(context); return value;
  };
  const methods = {
    async executeSdk(method, args, context) {
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(typeof method === 'string', 'E_CAPABILITY', 'Storage method required');
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(args && typeof args === 'object' && !Array.isArray(args), 'E_SCHEMA', 'Storage arguments required');
      if (method.startsWith('APPLOCAL_')) {
        const trusted = trustedContext(context);
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(sessionExecute, 'E_RESOURCE_UNAVAILABLE', 'Broker native storage.session adapter required');
        // Session effects cannot be atomic with IDB. The broker's native session
        // driver owns receipt/unknown handling; this layer never persists them
        // in a second DB or pretends they share the KV transaction.
        await authorize(trusted);
        const value = await sessionExecute(method, clone(args), context);
        await authorize(trusted); return value;
      }
      return persistentSdk(method, args, context);
    },
    getAppId(context) { return persistentSdk('DEVICE_GET_APP_ID', {}, context); },
    async commitResult(sourceContext, {requestDigest, outcome}) {
      const context = trustedContext(sourceContext), outcomeWire = (0,_page_port_codec_js__WEBPACK_IMPORTED_MODULE_3__.encodeOutcome)(outcome);
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(typeof requestDigest === 'string' && /^[a-f0-9]{64}$/.test(requestDigest), 'E_HASH', 'Result request digest required');
      await authorize(context);
      const result = await service.transaction(sdkStores, 'readwrite', async tx => {
        await authorize(context, tx); const op = await operation(tx, context);
        if (op.state === 'durable') {
          const old = await originalResult(tx, context, op, requestDigest);
          (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(JSON.stringify(old.outcomeWire) === JSON.stringify(outcomeWire), 'E_REQUEST_CONFLICT', 'Result outcome is immutable');
          await authorize(context, tx); return old;
        }
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(['admitted', 'pending', 'prepared', 'dispatched'].includes(op.state), 'E_OWNER', 'Result operation not admitted');
        await authorize(context, tx); return durable(tx, context, op, requestDigest, outcomeWire);
      });
      await authorize(context); return (0,_page_port_codec_js__WEBPACK_IMPORTED_MODULE_3__.decodeOutcome)(result.outcomeWire);
    },
    async getResult(sourceContext) {
      const context = trustedContext(sourceContext); await authorize(context);
      const result = await service.transaction(sdkStores, 'readonly', async tx => {
        await authorize(context, tx); const op = await operation(tx, context);
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(op.state === 'durable', 'E_OWNER', 'Result is not durable');
        const result = await originalResult(tx, context, op, op.storageRequestDigest);
        await authorize(context, tx); return result;
      });
      await authorize(context); return (0,_page_port_codec_js__WEBPACK_IMPORTED_MODULE_3__.decodeOutcome)(result.outcomeWire);
    },
    async commitScriptRevision(sourceContext, input) {
      const request = clone(input); checkId(request.scriptId);
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(typeof request.sourceUtf8 === 'string' && encoder.encode(request.sourceUtf8).byteLength <= _protocol_js__WEBPACK_IMPORTED_MODULE_0__.BUDGETS.maxRawFrameBytes,
        'E_SCHEMA', 'Script source UTF8 exceeds limit');
      // Validate surrogates before hashing exact bytes, not JSON string syntax.
      (0,_page_port_codec_js__WEBPACK_IMPORTED_MODULE_3__.encodeValue)(request.sourceUtf8);
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(Number.isSafeInteger(request.expectedRevision) && request.expectedRevision >= 0, 'E_REVISION', 'Expected revision required');
      const contentHash = await (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.digestUtf8)(request.sourceUtf8);
      if (request.contentHash !== undefined) (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(request.contentHash === contentHash, 'E_HASH', 'Script bytes hash mismatch');
      return revisionMutation(sourceContext, async (tx, context) => {
        const key = scriptKey(context.namespace, request.scriptId), old = await tx.get('scriptHeads', key);
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(!old?.tombstoned, 'E_TOMBSTONE', 'Script deleted');
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)((old?.revision || 0) === request.expectedRevision, 'E_REVISION', 'Script head CAS conflict');
        const row = {tag: 'script-revision', namespace: context.namespace, scriptId: request.scriptId,
          revision: request.expectedRevision + 1, parentRevision: request.expectedRevision, contentHash, sourceUtf8: request.sourceUtf8};
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(!await tx.get('scriptRevisions', scriptKey(context.namespace, row.scriptId, row.revision)), 'E_REVISION', 'Immutable revision exists');
        await tx.put('scriptRevisions', row, scriptKey(context.namespace, row.scriptId, row.revision));
        await tx.put('scriptHeads', {tag: 'script-head', namespace: context.namespace, scriptId: row.scriptId,
          revision: row.revision, contentHash, tombstoned: false}, key);
        return row;
      });
    },
    pinScriptRevision(context, input) {
      const request = clone(input); checkId(request.scriptId);
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(Number.isSafeInteger(request.revision) && request.revision > 0, 'E_REVISION', 'Exact revision required');
      return revisionMutation(context, async (tx, context) => {
        const head = await tx.get('scriptHeads', scriptKey(context.namespace, request.scriptId));
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(head && !head.tombstoned, 'E_TOMBSTONE', 'Script unavailable');
        const row = await tx.get('scriptRevisions', scriptKey(context.namespace, request.scriptId, request.revision));
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(row && row.contentHash === request.contentHash && await (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.digestUtf8)(row.sourceUtf8) === row.contentHash, 'E_HASH', 'Pinned revision hash mismatch');
        const key = pinKey(context, request.scriptId, request.revision), old = await tx.get('commandJournal', key);
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(!old?.released, 'E_OWNER', 'Released pin cannot be revived');
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(!old || bound(old, context), 'E_OWNER', 'Revision pin binding mismatch');
        const pin = old || {tag: 'script-revision-pin', ...bindings(context),
          opKey: context.opKey, scriptId: request.scriptId, revision: request.revision, contentHash: row.contentHash, released: false};
        await tx.put('commandJournal', pin, key); return {pinKey: key, revision: row};
      });
    },
    releaseScriptRevisionPin(context, input) {
      const request = clone(input); checkId(request.scriptId);
      return revisionMutation(context, async (tx, context) => {
        const key = pinKey(context, request.scriptId, request.revision), pin = await tx.get('commandJournal', key);
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(pin && pin.opKey === context.opKey, 'E_OWNER', 'Revision pin unavailable');
        await tx.put('commandJournal', {...pin, released: true}, key); return {released: true};
      });
    },
    tombstoneScript(context, {scriptId, expectedRevision}) {
      checkId(scriptId);
      return revisionMutation(context, async (tx, context) => {
        const key = scriptKey(context.namespace, scriptId), head = await tx.get('scriptHeads', key);
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(head?.revision === expectedRevision, 'E_REVISION', 'Script tombstone CAS conflict');
        await tx.put('scriptHeads', {...head, tombstoned: true}, key); return {tombstoned: true};
      });
    },
    garbageCollectScript(context, {scriptId}) {
      checkId(scriptId);
      return revisionMutation(context, async (tx, context) => {
        const head = await tx.get('scriptHeads', scriptKey(context.namespace, scriptId));
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(head?.tombstoned, 'E_TOMBSTONE', 'GC requires tombstone');
        for (const pin of await tx.all('commandJournal')) if (pin.tag === 'script-revision-pin' && pin.namespace === context.namespace && pin.scriptId === scriptId) {
          const op = await tx.get('commandJournal', pin.opKey);
          (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(op?.tag === 'sdk-operation' && pin.released && !['admitted', 'pending', 'prepared', 'dispatched', 'effect_unknown'].includes(op.state) &&
            (op.state !== 'durable' || op.deliveryState === 'delivered') && op.deliveryState !== 'pending', 'E_OWNER', 'Pinned or unresolved operation blocks GC');
        }
        let removed = 0;
        for (const row of await tx.all('scriptRevisions')) if (row.namespace === context.namespace && row.scriptId === scriptId) {
          await tx.delete('scriptRevisions', scriptKey(context.namespace, scriptId, row.revision)); removed++;
        }
        return {removed};
      });
    },
    configureAdmission(options) {
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(options && Object.keys(options).every(key => ['admission', 'admitTemplate'].includes(key)), 'E_SCHEMA', 'Unknown admission option');
      for (const key of Object.keys(options)) {
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(options[key] === undefined || typeof options[key] === 'function', 'E_SCHEMA', 'Admission hook must be a function');
        hooks[key] = options[key];
      }
    },
    async saveTemplate(input, {admitTemplate: perCallAdmission} = {}) {
      const request = clone(input); (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.validate)('SaveTemplateRequest', request); templateSemantics(request.template);
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(request.name.trim().length > 0, 'E_SCHEMA', 'Template name must be nonempty');
      const {contentHash, ...body} = request.template;
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(await (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.digest)(body) === contentHash, 'E_HASH', 'Template content hash mismatch');
      return service.transaction(['templates', 'entitlements'], 'readwrite', async tx => {
        const policy = perCallAdmission || hooks.admitTemplate;
        const quota = policy ? await policy({templateId: request.template.templateId, request: clone(request), tx}) : await gate('saveTemplate', request, tx);
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(quota && [1, 50].includes(quota.maxSavedTemplates ?? 1), 'E_ENTITLEMENT', 'Invalid template admission result');
        const template = request.template, key = revisionKey(template.templateId, template.revision);
        const existing = await tx.get('templates', key), head = await tx.get('templates', headKey(template.templateId));
        if (existing) {
          await checkedTemplate(existing);
          (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(equal(existing.template, template) && existing.metadata.name === request.name, 'E_PARENT_CONFLICT', 'Immutable template revision conflict');
          // Save request CAS evidence is persisted separately from frozen output.
          (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(existing.saveDigest === await (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.digest)(request), 'E_PARENT_CONFLICT', 'Duplicate save differs from original request');
          return {metadata: clone(existing.metadata), head: clone(existing.template)};
        }
        const parent = head?.metadata.headRevision ?? null;
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(request.expectedParentRevision === parent && template.parentRevision === parent && template.revision === (parent === null ? 1 : parent + 1), 'E_PARENT_CONFLICT', 'Template head changed');
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(request.expectedNameRevision === (head?.metadata.nameRevision ?? null), 'E_REVISION', 'Template name revision changed');
        if (!head) {
          const maxSavedTemplates = quota.maxSavedTemplates ?? 1;
          (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)([1, 50].includes(maxSavedTemplates), 'E_ENTITLEMENT', 'Invalid template entitlement');
          (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)((await tx.all('templates')).filter(row => row.metadata && !row.template).length < maxSavedTemplates, 'E_ENTITLEMENT', 'Saved template limit reached');
        }
        const metadata = {templateId: template.templateId, name: request.name, headRevision: template.revision,
          nameRevision: head ? head.metadata.nameRevision + (head.metadata.name === request.name ? 0 : 1) : 1};
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.validate)('TemplateMetadata', metadata);
        await tx.put('templates', {template, metadata, saveDigest: await (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.digest)(request)}, key);
        await tx.put('templates', {metadata}, headKey(template.templateId));
        return {metadata: clone(metadata), head: clone(template)};
      });
    },
    async listTemplates(input) {
      const request = clone(input); (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.validate)('ListTemplatesRequest', request);
      return service.transaction(['templates'], 'readonly', async tx => {
        await gate('listTemplates', request, tx);
        const heads = (await tx.all('templates')).filter(row => row.metadata && !row.template).sort((a, b) => a.metadata.templateId < b.metadata.templateId ? -1 : a.metadata.templateId > b.metadata.templateId ? 1 : 0);
        const after = request.cursor === null ? -1 : heads.findIndex(row => row.metadata.templateId === request.cursor);
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(request.cursor === null || after >= 0, 'E_SCHEMA', 'Unknown template cursor');
        const selected = heads.slice(after + 1, after + 1 + request.limit), templates = [];
        for (const row of selected) {
          (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.validate)('TemplateMetadata', row.metadata);
          const head = await checkedTemplate(await tx.get('templates', revisionKey(row.metadata.templateId, row.metadata.headRevision)));
          templates.push({metadata: clone(row.metadata), head});
        }
        return {templates, nextCursor: after + 1 + selected.length < heads.length ? selected.at(-1).metadata.templateId : null};
      });
    },
    async getTemplateRevision(input) {
      const request = clone(input); (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.validate)('GetTemplateRevisionRequest', request);
      return service.transaction(['templates'], 'readonly', async tx => {
        await gate('getTemplateRevision', request, tx);
        return checkedTemplate(await tx.get('templates', revisionKey(request.templateId, request.revision)));
      });
    },
    async getTemplateByHash(hash) {
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(typeof hash === 'string' && /^[0-9a-f]{64}$/.test(hash), 'E_SCHEMA', 'Invalid template hash');
      return service.transaction(['templates'], 'readonly', async tx => {
        const rows = (await tx.all('templates')).filter(row => row.template?.contentHash === hash);
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(rows.length === 1, 'E_SCHEMA', 'Hash must match exactly one stored revision');
        return checkedTemplate(rows[0]);
      });
    },
    async renameTemplate(input) {
      const request = clone(input); (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.validate)('RenameTemplateRequest', request);
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(request.name.trim().length > 0, 'E_SCHEMA', 'Template name must be nonempty');
      return service.transaction(['templates'], 'readwrite', async tx => {
        await gate('renameTemplate', request, tx);
        const row = await tx.get('templates', headKey(request.templateId));
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(row?.metadata, 'E_SCHEMA', 'Template missing');
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(row.metadata.nameRevision === request.expectedNameRevision, 'E_REVISION', 'Template name changed');
        const metadata = {...row.metadata, name: request.name, nameRevision: row.metadata.nameRevision + 1};
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.validate)('TemplateMetadata', metadata);
        await tx.put('templates', {metadata}, headKey(request.templateId));
        return metadata;
      });
    },
    async beginPage(input) {
      const request = clone(input); (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.validate)('BeginPageRequest', request);
      return service.transaction(pageStores, 'readwrite', async tx => {
        await gate('beginPage', request, tx);
        const run = await auth(tx, request.identity, false, true), requestKey = STORAGE_KEYS.begin(run.runId, request.requestId);
        const beginDigest = await (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.digest)(request), previous = await tx.get('commandJournal', requestKey);
        if (previous) {
          (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(previous.beginDigest === beginDigest, 'E_BATCH_CONFLICT', 'beginPage requestId conflict');
          const snapshot = await tx.get('pageSnapshots', previous.snapshotId);
          (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(snapshot?.state === 'open', 'E_SEAL_INCOMPLETE', 'Reserved snapshot is no longer open');
          return clone(snapshot);
        }
        duration(run);
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(request.pageSequence === run.committedPages + 1 && request.pageSequence <= limits(run).maxPages, 'E_LIMIT', 'Page sequence or budget exhausted');
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(request.expectedCheckpointSnapshotId === (run.checkpoint?.lastSnapshotId ?? null), 'E_REVISION', 'Checkpoint changed');
        pageUrl(request.expectedPageIdentity, run.target.allowedOrigin);
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(!(await tx.all('pageSnapshots')).some(row => row.runId === run.runId && (row.state === 'open' || row.pageSequence === request.pageSequence)), 'E_SEAL_INCOMPLETE', 'Run already reserved this page sequence');
        const readKey = (0,_journal_js__WEBPACK_IMPORTED_MODULE_2__.commandKey)(run.runId, request.readCommandId);
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(!await tx.get('commandJournal', readKey), 'E_BATCH_CONFLICT', 'readCommandId already reserved');
        const snapshotId = (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.newId)();
        const snapshot = {snapshotId, runId: run.runId, ownerEpoch: run.ownerEpoch, pageSequence: request.pageSequence,
          state: 'open', pageIdentity: request.expectedPageIdentity, batchCount: 0, stagedRowCount: 0, stagedBytes: 0,
          sealSeq: null, sealDigest: null, pageSignature: null, abortReason: null, sourceIdentity: request.identity,
          readCommandId: request.readCommandId, expectedCheckpointSnapshotId: request.expectedCheckpointSnapshotId,
          readEnd: null, sealIdentity: null, immutableSealAck: null};
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.validate)('PageSnapshot', snapshot);
        await tx.put('pageSnapshots', snapshot, snapshotId);
        await tx.put('commandJournal', {tag: 'read-reservation', commandId: request.readCommandId, identity: request.identity,
          runId: run.runId, ownerEpoch: run.ownerEpoch, snapshotId, requestId: request.requestId, beginDigest}, readKey);
        await tx.put('commandJournal', {tag: 'begin-request', runId: run.runId, requestId: request.requestId, snapshotId, beginDigest}, requestKey);
        return clone(snapshot);
      });
    },
    async stagePageBatch(input) {
      const request = clone(input), runId = request.identity?.runId, count = pending.get(runId) || 0;
      pending.set(runId, count + 1);
      try {
        return await pageMutation('stagePageBatch', request, async (tx, snapshot) => {
          const run = await auth(tx, request.identity);
          (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(count < _protocol_js__WEBPACK_IMPORTED_MODULE_0__.BUDGETS.maxPendingACKs, 'E_LIMIT', 'At most two unacknowledged stage batches');
          (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.validate)('StageRequest', request);
          (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(snapshot.state === 'open', 'E_SEAL_INCOMPLETE', 'Page is not open');
          (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(request.batchId === `${snapshot.snapshotId}:${request.batchIndex}`, 'E_BATCH_CONFLICT', 'Noncanonical batchId');
          const envelope = pick(request, ['snapshotId', 'batchIndex', 'records']), size = bytes(envelope);
          (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(size <= _protocol_js__WEBPACK_IMPORTED_MODULE_0__.BUDGETS.maxBatchBytes && size === request.utf8Bytes && request.records.length > 0 && await (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.digest)(envelope) === request.digest, 'E_HASH', 'Batch digest or exact UTF-8 bytes mismatch');
          const old = await tx.get('batches', request.batchId);
          if (old) {
            (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(old.digest === request.digest && old.utf8Bytes === size && old.rowCount === request.records.length, 'E_BATCH_CONFLICT', 'Duplicate batch content differs');
            return {ack: 'durable-staged', snapshotId: snapshot.snapshotId, batchIndex: request.batchIndex, digest: request.digest, duplicate: true};
          }
          duration(run);
          (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(request.batchIndex === snapshot.batchCount, 'E_SEAL_INCOMPLETE', 'Stage batches must be contiguous');
          const template = await templateForRun(tx, run), evidence = await readEvidence(tx, snapshot, template, false);
          for (let offset = 0; offset < request.records.length; offset++) {
            const value = request.records[offset], rowIndex = snapshot.stagedRowCount + offset;
            (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(value.rowIndex === rowIndex && value.recordKey === `${snapshot.snapshotId}:${rowIndex}`, 'E_SEAL_INCOMPLETE', 'Rows must be contiguous with exact record keys');
            fields(template, value.raw, value.values);
            (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(bytes({raw: value.raw, values: value.values}) <= _protocol_js__WEBPACK_IMPORTED_MODULE_0__.BUDGETS.maxRecordBytes, 'E_LIMIT', 'Record byte budget exceeded');
            (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(evidence.rawRows[rowIndex] && equal(evidence.rawRows[rowIndex], value.raw), 'E_SEAL_INCOMPLETE', 'Stage raw values do not match authenticated read');
          }
          (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(run.committedCount + snapshot.stagedRowCount + request.records.length <= limits(run).maxRecords &&
            (run.entitlementSnapshot.tier !== 'free' || snapshot.stagedRowCount + request.records.length <= 100) &&
            run.storedBytes + size <= limits(run).maxStoredBytes, 'E_LIMIT', 'Whole page exceeds run budget');
          (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(await profileBytes(tx) + size <= _protocol_js__WEBPACK_IMPORTED_MODULE_0__.BUDGETS.profileStoredBytes, 'E_QUOTA', 'Profile storage budget exceeded');
          for (const value of request.records) await tx.put('records', {...value, runId: run.runId, snapshotId: snapshot.snapshotId, batchId: request.batchId}, value.recordKey);
          await tx.put('batches', {batchId: request.batchId, runId: run.runId, snapshotId: snapshot.snapshotId,
            batchIndex: request.batchIndex, rowStart: snapshot.stagedRowCount, rowCount: request.records.length, digest: request.digest, utf8Bytes: size}, request.batchId);
          snapshot.batchCount++; snapshot.stagedRowCount += request.records.length; snapshot.stagedBytes += size;
          run.storedBytes += size;
          await tx.put('pageSnapshots', snapshot, snapshot.snapshotId); await tx.put('runs', run, run.runId);
          return {ack: 'durable-staged', snapshotId: snapshot.snapshotId, batchIndex: request.batchIndex, digest: request.digest, duplicate: false};
        });
      } finally { const remaining = (pending.get(runId) || 1) - 1; if (remaining) pending.set(runId, remaining); else pending.delete(runId); }
    },
    async sealPage(input) {
      const request = clone(input);
      return pageMutation('sealPage', request, async (tx, snapshot) => {
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.validate)('SealRequest', request);
        const identity = {...request.identity}; delete identity.runRevision;
        const sealDigest = await (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.digest)({...request, identity});
        if (snapshot.state === 'sealed') {
          await auth(tx, request.identity, true);
          (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)((0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.sameIdentity)(snapshot.sealIdentity, request.identity, {ignoreRevision: true}) && snapshot.sealDigest === sealDigest && snapshot.immutableSealAck, 'E_BATCH_CONFLICT', 'Historic seal request differs');
          return {...clone(snapshot.immutableSealAck), duplicate: true};
        }
        const run = await auth(tx, request.identity);
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(snapshot.state === 'open', 'E_SEAL_INCOMPLETE', 'Page was aborted');
        duration(run);
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(snapshot.pageSequence === run.committedPages + 1 && snapshot.expectedCheckpointSnapshotId === (run.checkpoint?.lastSnapshotId ?? null), 'E_REVISION', 'Seal checkpoint CAS failed');
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(request.pageIdentity === snapshot.pageIdentity && request.nextCheckpoint.url === snapshot.pageIdentity && request.nextCheckpoint.pageNumber === snapshot.pageSequence && request.nextCheckpoint.lastSnapshotId === snapshot.snapshotId, 'E_TARGET', 'Checkpoint must identify this authenticated sealed page');
        const template = await templateForRun(tx, run), {rawRows, end} = await readEvidence(tx, snapshot, template, true);
        const batches = (await tx.all('batches')).filter(batch => batch.snapshotId === snapshot.snapshotId).sort((a, b) => a.batchIndex - b.batchIndex);
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(request.batchCount === batches.length && snapshot.batchCount === batches.length && request.batchDigests.length === batches.length && request.rowCount === snapshot.stagedRowCount && request.byteCount === snapshot.stagedBytes && end.rowCount === request.rowCount && equal(end.emptyEvidence, request.emptyEvidence), 'E_SEAL_INCOMPLETE', 'Seal count/end evidence mismatch');
        const records = await readSnapshotRecords(tx, snapshot, batches);
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(records.length === request.rowCount && rawRows.length === records.length && batches.reduce((n, batch) => n + batch.utf8Bytes, 0) === request.byteCount && batches.every((batch, i) => batch.digest === request.batchDigests[i]), 'E_SEAL_INCOMPLETE', 'Seal is not the entire contiguous page');
        for (let i = 0; i < records.length; i++) {
          fields(template, records[i].raw, records[i].values);
          (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(equal(records[i].raw, rawRows[i]), 'E_HASH', 'Sealed raw record differs from agent read');
        }
        if (records.length === 0) (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(batches.length === 0 && request.byteCount === 0 && end.frameCount === 0 && typeof end.emptyEvidence === 'string' && end.emptyEvidence.trim().length > 0 && (template.list.allowEmpty || template.list.emptyMarkerSelector), 'E_SEAL_INCOMPLETE', 'Empty page needs authenticated allowed-empty/marker evidence');
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(await (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.digest)({pageIdentity: snapshot.pageIdentity, records: records.map(row => ({raw: row.raw, values: row.values}))}) === request.pageSignature, 'E_HASH', 'Page signature must cover every raw and typed row');
        const naturalEnd = template.pagination.mode === 'none' || (end.emptyEvidence === `end-marker:${template.pagination.endMarkerSelector}`);
        const prior = (await tx.all('pageSnapshots')).filter(row => row.runId === run.runId && row.state === 'sealed');
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(naturalEnd || !prior.some(row => row.pageSignature === request.pageSignature), 'E_EFFECT_UNKNOWN', 'Repeated full page signature without natural end evidence');
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(run.committedPages + 1 <= limits(run).maxPages && run.committedCount + records.length <= limits(run).maxRecords && run.storedBytes <= limits(run).maxStoredBytes, 'E_LIMIT', 'Seal exceeds budget');
        // Exactly at a limit without end proof is a limit event, not success.
        // Complete page stays available; the coordinator chooses the terminal state.
        run.committedPages++; run.committedCount += records.length; run.commitSeq++; run.eventSeq++;
        run.checkpoint = clone(request.nextCheckpoint);
        const ack = {ack: 'page-sealed', snapshotId: snapshot.snapshotId, committedCount: run.committedCount,
          committedPages: run.committedPages, checkpoint: clone(run.checkpoint), sealSeq: run.commitSeq, duplicate: false};
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.validate)('SealAck', ack);
        snapshot.state = 'sealed'; snapshot.sealSeq = ack.sealSeq; snapshot.sealDigest = sealDigest;
        snapshot.pageSignature = request.pageSignature; snapshot.readEnd = clone(end); snapshot.sealIdentity = clone(request.identity); snapshot.immutableSealAck = clone(ack);
        await tx.put('pageSnapshots', snapshot, snapshot.snapshotId); await tx.put('runs', run, run.runId);
        return ack;
      });
    },
    async openReaderPin({runId, readerPinId = (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.newId)(), sealWatermark = null}) {
      checkId(runId); checkId(readerPinId);
      return service.transaction(['runs', 'commandJournal', 'pageSnapshots'], 'readwrite', async tx => {
        await gate('openReaderPin', {runId, readerPinId, sealWatermark}, tx);
        const run = await untombstoned(tx, runId), key = STORAGE_KEYS.reader(readerPinId), previous = await tx.get('commandJournal', key);
        const watermark = sealWatermark === null ? (previous?.sealWatermark ?? run.commitSeq) : sealWatermark;
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(Number.isSafeInteger(watermark) && watermark >= 0 && watermark <= run.commitSeq, 'E_SCHEMA', 'Invalid reader watermark');
        if (previous) { (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(previous.runId === runId && previous.sealWatermark === watermark && !previous.released, 'E_REVISION', 'Reader pin conflict'); return clone(previous); }
        const snapshots = (await tx.all('pageSnapshots')).filter(row => row.runId === runId && row.state === 'sealed' && row.sealSeq <= watermark);
        const pin = {tag: 'reader-pin', readerPinId, runId, sealWatermark: watermark, committedCount: snapshots.reduce((n, row) => n + row.stagedRowCount, 0), committedPages: snapshots.length, released: false, createdAt: now()};
        await tx.put('commandJournal', pin, key); return pin;
      });
    },
    async releaseReaderPin({runId, readerPinId}) {
      checkId(runId); checkId(readerPinId);
      return service.transaction(['commandJournal'], 'readwrite', async tx => {
        await gate('releaseReaderPin', {runId, readerPinId}, tx);
        const key = STORAGE_KEYS.reader(readerPinId), pin = await tx.get('commandJournal', key);
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(pin?.tag === 'reader-pin' && pin.runId === runId, 'E_SCHEMA', 'Reader pin missing');
        if (!pin.released) { pin.released = true; pin.releasedAt = now(); await tx.put('commandJournal', pin, key); }
        return {released: true, readerPinId};
      });
    },
    async readRecords(input) {
      const request = clone(input); (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.validate)('ReadRecordsRequest', request);
      return service.transaction(['runs', 'commandJournal', 'pageSnapshots', 'records'], 'readonly', async tx => {
        await gate('readRecords', request, tx); await untombstoned(tx, request.runId);
        const pin = await tx.get('commandJournal', STORAGE_KEYS.reader(request.readerPinId));
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(pin?.tag === 'reader-pin' && !pin.released && pin.runId === request.runId && pin.sealWatermark === request.sealWatermark, 'E_REVISION', 'Reader pin or watermark mismatch');
        const snapshots = (await tx.all('pageSnapshots')).filter(row => row.runId === request.runId && row.state === 'sealed' && row.sealSeq <= pin.sealWatermark).sort((a, b) => a.sealSeq - b.sealSeq);
        let offset = 0;
        if (request.cursor !== null) {
          let cursor;
          try { cursor = JSON.parse(request.cursor); } catch { throw new _protocol_js__WEBPACK_IMPORTED_MODULE_0__.FoundationError('E_SCHEMA', 'Invalid reader cursor'); }
          (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(equal(Object.keys(cursor).sort(), ['offset', 'readerPinId', 'runId', 'sealWatermark']) && cursor.runId === request.runId && cursor.readerPinId === request.readerPinId && cursor.sealWatermark === pin.sealWatermark && Number.isSafeInteger(cursor.offset) && cursor.offset >= 0 && cursor.offset <= pin.committedCount, 'E_SCHEMA', 'Reader cursor does not belong to this pin');
          offset = cursor.offset;
        }
        const records = []; let position = 0;
        for (const snapshot of snapshots) {
          for (let rowIndex = 0; rowIndex < snapshot.stagedRowCount; rowIndex++, position++) {
            if (position < offset || records.length >= request.limit) continue;
            const stored = await tx.get('records', `${snapshot.snapshotId}:${rowIndex}`);
            (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(stored && stored.runId === request.runId && stored.snapshotId === snapshot.snapshotId, 'E_SCHEMA', 'Sealed record missing');
            const value = record(stored); (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.validate)('Record', value); records.push(value);
          }
        }
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(position === pin.committedCount, 'E_SCHEMA', 'Reader pinned count changed');
        const next = offset + records.length;
        return {records, nextCursor: next < pin.committedCount ? (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.canonical)({runId: request.runId, readerPinId: request.readerPinId, sealWatermark: pin.sealWatermark, offset: next}) : null, committedCount: pin.committedCount};
      });
    },
    async deleteRun({runId, explicitUserAction}) {
      checkId(runId); (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(explicitUserAction === true, 'E_SCHEMA', 'Explicit delete required');
      return service.transaction(_idb_js__WEBPACK_IMPORTED_MODULE_1__.STORE_NAMES.filter(name => name !== 'templates' && name !== 'entitlements'), 'readwrite', async tx => {
        await gate('deleteRun', {runId, explicitUserAction}, tx);
        const existing = await tx.get('commandJournal', STORAGE_KEYS.tombstone(runId));
        if (existing) return {deleted: true, tombstoneId: existing.tombstoneId};
        const run = await tx.get('runs', runId);
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(run && terminal.has(run.state) && run.retirementState === 'released', 'E_OWNER', 'Fence and retire target before deleting run');
        const slot = await tx.get('runs', STORAGE_KEYS.slot);
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(slot?.currentRunId !== runId, 'E_OWNER', 'Run still owns slot');
        const journal = await tx.all('commandJournal');
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(!journal.some(row => (row.runId === runId || row.identity?.runId === runId) && ((row.tag === 'reader-pin' && !row.released) || ['prepared', 'dispatched', 'effect_unknown'].includes(row.state))), 'E_OWNER', 'Run has active reader or unresolved journal');
        const jobs = (await tx.all('exportJobs')).filter(row => row.runId === runId);
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(jobs.every(row => ['delivery_complete', 'delivery_failed', 'abandoned'].includes(row.state)), 'E_OWNER', 'Run has an open export');
        const attempts = (await tx.all('downloadReceipts')).filter(row => row.tag === 'attempt' && row.attempt.runId === runId);
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(attempts.every(row => ['complete', 'interrupted', 'conflict', 'abandoned'].includes(row.attempt.state)), 'E_OWNER', 'Abandon unresolved download attempts before delete');
        const tombstoneId = (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.newId)(), timestamp = now();
        await tx.put('commandJournal', {tag: 'run-tombstone', runId, tombstoneId, deletedAt: timestamp, retainUntil: timestamp + _protocol_js__WEBPACK_IMPORTED_MODULE_0__.BUDGETS.retentionDays * 86400000}, STORAGE_KEYS.tombstone(runId));
        for (const store of ['records', 'batches', 'pageSnapshots', 'artifacts']) {
          const rows = await tx.all(store), jobIds = new Set(jobs.map(job => job.exportJobId));
          for (const row of rows) {
            if (store === 'artifacts') {
              if (row.tag === 'artifact' && jobIds.has(row.artifact.exportJobId)) {
                await tx.delete(store, row.artifact.artifactId);
                for (const key of row.artifact.chunkKeys) await tx.delete(store, key);
              }
            } else if (row.runId === runId) await tx.delete(store, store === 'records' ? row.recordKey : store === 'batches' ? row.batchId : row.snapshotId);
          }
        }
        // Keep run/commands/export/attempt receipt history for late audit. A
        // tombstone blocks every reader/writer from resurrecting product data.
        run.tombstoned = true; run.storedBytes = 0;
        await tx.put('runs', run, runId);
        return {deleted: true, tombstoneId};
      });
    },
    async setRetention({runId, terminalAt}) {
      checkId(runId); (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(Number.isSafeInteger(terminalAt) && terminalAt >= 0 && terminalAt <= now(), 'E_SCHEMA', 'Invalid terminal time');
      return service.transaction(['runs', 'commandJournal'], 'readwrite', async tx => {
        const run = await untombstoned(tx, runId); (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(terminal.has(run.state), 'E_OWNER', 'Retention only applies to terminal runs');
        const key = STORAGE_KEYS.retention(runId), old = await tx.get('commandJournal', key);
        if (old) { (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(old.terminalAt === terminalAt, 'E_REVISION', 'Retention time is immutable'); return old; }
        const policy = {tag: 'retention-policy', runId, terminalAt, retainUntil: terminalAt + _protocol_js__WEBPACK_IMPORTED_MODULE_0__.BUDGETS.retentionDays * 86400000};
        await tx.put('commandJournal', policy, key); return policy;
      });
    },
    async cleanupRetention() {
      const policies = await service.transaction(['commandJournal'], 'readonly', async tx => (await tx.all('commandJournal')).filter(row => row.tag === 'retention-policy' && row.retainUntil <= now()));
      const result = {deletedRunIds: [], protectedRunIds: []};
      for (const policy of policies) {
        try { await methods.deleteRun({runId: policy.runId, explicitUserAction: true}); result.deletedRunIds.push(policy.runId); }
        catch (error) { if (error.code !== 'E_OWNER') throw error; result.protectedRunIds.push(policy.runId); }
      }
      return result;
    },
    async preserveMigrationBackup({backupId, rawUtf8Backup}) {
      checkId(backupId); (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(typeof rawUtf8Backup === 'string', 'E_SCHEMA', 'Raw migration backup required');
      // Validate encoding, not legacy JSON/executable interpretation. Duplicate
      // keys and malformed legacy templates remain raw until migration review.
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.canonical)(rawUtf8Backup);
      const utf8Bytes = encoder.encode(rawUtf8Backup).byteLength, rawHash = await (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.digest)(rawUtf8Backup);
      return service.transaction(['commandJournal', 'runs', 'artifacts'], 'readwrite', async tx => {
        const key = STORAGE_KEYS.migration(backupId), old = await tx.get('commandJournal', key);
        if (old) { (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(old.rawUtf8Backup === rawUtf8Backup, 'E_BATCH_CONFLICT', 'Migration backup id conflict'); return old; }
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(await profileBytes(tx) + utf8Bytes <= _protocol_js__WEBPACK_IMPORTED_MODULE_0__.BUDGETS.profileStoredBytes, 'E_QUOTA', 'Migration backup exceeds profile budget');
        const backup = {tag: 'migration-backup', backupId, rawUtf8Backup, rawHash, utf8Bytes, createdAt: now(), executable: false};
        await tx.put('commandJournal', backup, key); return backup;
      });
    }
  };
  return methods;
}


/***/ }),

/***/ "./src/platform/storage/session.js":
/*!*****************************************!*\
  !*** ./src/platform/storage/session.js ***!
  \*****************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   createSessionTyped: () => (/* binding */ createSessionTyped)
/* harmony export */ });
/* harmony import */ var _protocol_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../protocol.js */ "./src/platform/protocol.js");
/* harmony import */ var _page_port_codec_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../page-port/codec.js */ "./src/platform/page-port/codec.js");
/* harmony import */ var _chrome_tabs_js__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../chrome/tabs.js */ "./src/platform/chrome/tabs.js");




// The namespace/session are issued by the shared authority. Only values live in
// Chrome session storage; admission, receipts and results remain in the one IDB.
const adapters = new WeakMap();
function createSessionTyped({api}) {
  const area = api?.storage?.session;
  (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(area, 'E_RESOURCE_UNAVAILABLE', 'Native storage.session unavailable');
  if (adapters.has(area)) return adapters.get(area);
  const adapter = Object.freeze({async executeSdk(method, args, context) {
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(['APPLOCAL_GETITEM', 'APPLOCAL_SETITEM', 'APPLOCAL_REMOVEITEM'].includes(method),
      'E_CAPABILITY', 'Unsupported session storage method');
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(context?.namespace && context.browserSessionIncarnation &&
      typeof context.recordNativeReceipt === 'function' && typeof context.recordEffect === 'function',
    'E_OWNER', 'Session storage requires the original authority context');
    const key = `framework-session:${(0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.canonical)([context.browserSessionIncarnation, context.namespace, args.key])}`;
    // Encode before admission so serialization failure cannot dispatch an effect.
    const wire = method === 'APPLOCAL_SETITEM' ? (0,_page_port_codec_js__WEBPACK_IMPORTED_MODULE_1__.encodeValue)(args.value) : undefined;
    await context.authorize({capability:'storage.session', phase:'pre'});
    context.assertDispatch?.();
    let value;
    if (method === 'APPLOCAL_GETITEM') {
      const result = await (0,_chrome_tabs_js__WEBPACK_IMPORTED_MODULE_2__.chromeCall)(api, area, 'get', key);
      value = Object.hasOwn(result, key) ? (0,_page_port_codec_js__WEBPACK_IMPORTED_MODULE_1__.decodeValue)(result[key]) : undefined;
    } else if (method === 'APPLOCAL_SETITEM') await (0,_chrome_tabs_js__WEBPACK_IMPORTED_MODULE_2__.chromeCall)(api, area, 'set', {[key]:wire});
    else await (0,_chrome_tabs_js__WEBPACK_IMPORTED_MODULE_2__.chromeCall)(api, area, 'remove', key);
    await context.recordNativeReceipt({method, value});
    // Preserve the completed effect even if delivery is subsequently fenced.
    await context.recordEffect(value);
    await context.authorize({capability:'storage.session', phase:'post'});
    return value;
  }});
  adapters.set(area, adapter);
  return adapter;
}


/***/ }),

/***/ "./src/platform/target/index.js":
/*!**************************************!*\
  !*** ./src/platform/target/index.js ***!
  \**************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   authenticatedDocument: () => (/* binding */ authenticatedDocument),
/* harmony export */   createTargetService: () => (/* binding */ createTargetService),
/* harmony export */   httpUrl: () => (/* binding */ httpUrl),
/* harmony export */   observeControllerTarget: () => (/* binding */ observeControllerTarget),
/* harmony export */   requireGrant: () => (/* binding */ requireGrant),
/* harmony export */   sessionIncarnation: () => (/* binding */ sessionIncarnation),
/* harmony export */   verifyControllerTarget: () => (/* binding */ verifyControllerTarget)
/* harmony export */ });
/* harmony import */ var _protocol_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../protocol.js */ "./src/platform/protocol.js");


const stores = ['runs', 'commandJournal'];
const liveStates = new Set(['preparing', 'running']);
const now = () => new Date().toISOString();
const key = id => `target-create:${id}`;

async function sessionIncarnation(session) {
  const value = typeof session === 'function' ? await session() : await session;
  const id = typeof value === 'string' ? value : typeof value?.get === 'function' ? await value.get() : value?.browserSessionIncarnation;
  (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(typeof id === 'string' && id.length > 0, 'E_TARGET', 'Trusted browser session is required');
  return id;
}

function authenticatedDocument(api, sender) {
  (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(sender?.id === api.runtime.id && Number.isSafeInteger(sender.tab?.id) && sender.tab.id >= 0 &&
    sender.frameId === 0 && typeof sender.documentId === 'string' && sender.documentId.length > 0,
  'E_TARGET', 'Actual extension/top-frame/tab/document sender required');
  return {tabId: sender.tab.id, frameId: 0, documentId: sender.documentId};
}

function httpUrl(value) {
  let url;
  try { url = new URL(value); } catch { (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(false, 'E_TARGET', 'Invalid document URL'); }
  (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(['https:', 'http:'].includes(url.protocol) && !url.username && !url.password, 'E_TARGET', 'HTTP(S) URL required');
  url.hash = '';
  return url;
}

async function requireGrant(api, origin) {
  const url = httpUrl(origin);
  (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(await api.permissions.contains({origins: [`${url.protocol}//${url.hostname}/*`]}), 'E_PERMISSION', 'Formal execution requires an optional origin grant');
}

// Shared native observation for generic controllers. Selection is explicit;
// neither this helper nor its callers resolve the active tab.
async function observeControllerTarget({api, tabId, frameId = 0, documentId, allowExtensionUrl = null}) {
  (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(Number.isSafeInteger(tabId) && tabId >= 0 && Number.isSafeInteger(frameId) && frameId >= 0, 'E_TARGET');
  const tab = await api.tabs.get(tabId);
  (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(tab && tab.incognito === false, 'E_TARGET', 'A normal selected tab is required');
  const frames = await api.webNavigation.getAllFrames({tabId});
  let frame = frames?.find(value => value.frameId === frameId && (!documentId || value.documentId === documentId));
  // webNavigation does not enumerate every extension bootstrap document.
  // runtime.getContexts is the same native extension-document observer used
  // by the unique broker for hostGone, never a payload identity fallback.
  if (!frame && allowExtensionUrl !== null && frameId === 0 && typeof api.runtime.getContexts === 'function') {
    const contexts = await api.runtime.getContexts({});
    const exact = contexts.filter(value => value.tabId === tabId && value.frameId === 0 && value.documentUrl === allowExtensionUrl &&
      (!documentId || value.documentId === documentId));
    if (exact.length === 1) frame = {frameId: 0, documentId: exact[0].documentId, url: exact[0].documentUrl};
  }
  (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(frame && !frame.errorOccurred && (!frame.documentLifecycle || frame.documentLifecycle === 'active') &&
    typeof frame.documentId === 'string' && frame.documentId, 'E_DOCUMENT_REPLACED', 'Selected frame document is no longer current');
  if (allowExtensionUrl !== null) {
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(frameId === 0 && frame.url === allowExtensionUrl && tab.url === allowExtensionUrl, 'E_TARGET', 'Owned bootstrap URL differs');
    return {tabId, frameId: 0, documentId: frame.documentId, url: frame.url};
  }
  const url = httpUrl(frame.url);
  (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(frameId === 0 ? httpUrl(tab.url).origin === url.origin && (!tab.pendingUrl || httpUrl(tab.pendingUrl).origin === url.origin) : !tab.pendingUrl,
    'E_DOCUMENT_REPLACED', 'Selected tab is navigating outside its document');
  await requireGrant(api, url.origin);
  const root = frames.find(value => value.frameId === 0);
  (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(root && typeof root.documentId === 'string' && root.documentId, 'E_DOCUMENT_REPLACED');
  return {tabId, frameId, documentId: frame.documentId, url: frame.url, allowedOrigin: url.origin,
    ...(frameId > 0 ? {rootDocumentId: root.documentId} : {})};
}

async function verifyControllerTarget({api, target}) {
  (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(Number.isSafeInteger(target?.frameId) && target.frameId >= 0, 'E_TARGET');
  const observed = await observeControllerTarget({api, tabId: target.tabId, frameId: target.frameId, documentId: target.documentId});
  (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(observed.allowedOrigin === target.allowedOrigin, 'E_TARGET', 'Controller origin differs');
  if (target.rootDocumentId) (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(target.rootDocumentId === observed.rootDocumentId, 'E_DOCUMENT_REPLACED');
  return observed;
}

function hostMatches(run, host) {
  (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(host && !host.revoked && run.registrationId === host.registrationId &&
    run.hostDocumentId === host.hostDocumentId && run.hostInstanceId === host.hostInstanceId,
  'E_OWNER', 'Registered host does not own run');
}

function creationResponse(intent, run) {
  return (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.validate)('CreateTargetResponse', {creationId: intent.creationId, state: intent.state, target: run.target ?? null});
}

function createTargetService({storage, api, session, assertHost}) {
  const transaction = (mode, callback) => storage.transaction(stores, mode, callback);

  async function currentHost(tx, run, host) {
    const stored = await tx.get('commandJournal', `host:${host.registrationId}`);
    hostMatches(run, stored);
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(stored.hostDocumentId === host.hostDocumentId, 'E_OWNER');
  }

  async function requireLive(tx, run, incarnation, epoch) {
    const slot = await tx.get('runs', '@slot');
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(run && slot?.currentRunId === run.runId, 'E_OWNER');
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(run.browserSessionIncarnation === incarnation && (!epoch || run.ownerEpoch === epoch), 'E_TARGET');
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(liveStates.has(run.state) && !run.retirementId && (run.cancelSeq ?? 0) === 0, 'E_CANCELLED');
    return slot;
  }

  async function freeze(creationId, reason) {
    return transaction('readwrite', async tx => {
      const intent = await tx.get('commandJournal', key(creationId));
      if (!intent || intent.state === 'retired') return;
      intent.state = 'effect_unknown';
      intent.unknownReason = reason;
      if (intent.navigationState === 'dispatched') intent.navigationState = 'effect_unknown';
      await tx.put('commandJournal', intent, key(creationId));
      const run = await tx.get('runs', intent.runId);
      if (run && liveStates.has(run.state)) {
        run.state = 'paused_unknown';
        run.runRevision++;
        if (run.identity) run.identity.runRevision = run.runRevision;
        await tx.put('runs', run, run.runId);
      }
    });
  }

  async function createTarget(request, sender) {
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.validate)('CreateTargetRequest', request);
    const host = await assertHost(sender, request.registrationId);
    const incarnation = await sessionIncarnation(session);
    const creationId = (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.newId)();
    const prepared = await transaction('readwrite', async tx => {
      const run = await tx.get('runs', request.runId);
      await currentHost(tx, run, host);
      if (run.creationId) {
        const existing = await tx.get('commandJournal', key(run.creationId));
        if (existing) {
          (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(existing.requestId === request.requestId, 'E_TARGET', 'A run has exactly one creation intent');
          return {intent: existing, run, duplicate: true};
        }
      }
      await requireLive(tx, run, incarnation);
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(run.runRevision === request.expectedRunRevision, 'E_OWNER');
      const id = run.creationId || creationId;
      const intent = {tag: 'target-create', creationId: id, runId: run.runId, ownerEpoch: run.ownerEpoch,
        browserSessionIncarnation: incarnation, bootstrapUrl: api.runtime.getURL(`ui/target-bootstrap.html?creationId=${encodeURIComponent(id)}`),
        startUrl: run.startUrl, state: 'prepared', submissionCount: 0, createdAt: now(), dispatchAt: null,
        knownTabId: null, knownDocumentId: null, candidateTabIds: [], retirementId: null,
        navigationState: 'not-admitted', navigationSubmissionCount: 0, navigationDispatchAt: null,
        requestId: request.requestId, registrationId: host.registrationId, cancelSeq: run.cancelSeq ?? 0};
      httpUrl(intent.startUrl);
      run.creationId = id;
      await tx.put('runs', run, run.runId);
      await tx.put('commandJournal', intent, key(id));
      return {intent, run, duplicate: false};
    });
    if (prepared.duplicate && prepared.intent.state !== 'prepared') return creationResponse(prepared.intent, prepared.run);
    await requireGrant(api, httpUrl(prepared.intent.startUrl).origin);
    const intent = await transaction('readwrite', async tx => {
      const value = await tx.get('commandJournal', key(prepared.intent.creationId));
      const run = await tx.get('runs', value.runId);
      await currentHost(tx, run, host);
      await requireLive(tx, run, incarnation, value.ownerEpoch);
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(value.state === 'prepared' && value.submissionCount === 0, 'E_TARGET');
      value.state = 'dispatched'; value.submissionCount = 1; value.dispatchAt = now();
      await tx.put('commandJournal', value, key(value.creationId));
      return value;
    });
    // Only this invocation receives the dispatch authorization. Reconciliation never replays it.
    try {
      const tab = await api.tabs.create({url: intent.bootstrapUrl, active: false});
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(Number.isSafeInteger(tab?.id), 'E_TARGET');
      await transaction('readwrite', async tx => {
        const value = await tx.get('commandJournal', key(intent.creationId));
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(!value.callbackTabId || value.callbackTabId === tab.id, 'E_TARGET');
        if (value.knownTabId !== null) (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(value.knownTabId === tab.id, 'E_TARGET');
        value.callbackTabId = tab.id;
        if (!value.candidateTabIds.includes(tab.id)) value.candidateTabIds.push(tab.id);
        await tx.put('commandJournal', value, key(value.creationId));
      });
    } catch (error) { await freeze(intent.creationId, `create:${error.code || error.message}`); }
    return transaction('readonly', async tx => creationResponse(await tx.get('commandJournal', key(intent.creationId)), await tx.get('runs', intent.runId)));
  }

  async function reconcileTargetCreation(request, sender) {
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.validate)('ReconcileTargetCreationRequest', request);
    const host = await assertHost(sender);
    const incarnation = await sessionIncarnation(session);
    const intent = await transaction('readonly', async tx => {
      const value = await tx.get('commandJournal', key(request.creationId));
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(value, 'E_TARGET'); await currentHost(tx, await tx.get('runs', value.runId), host); return value;
    });
    // Exact URL discovery supplies candidates, never document authority.
    let candidates = [];
    if (intent.browserSessionIncarnation === incarnation) {
      try { candidates = (await api.tabs.query({})).filter(tab => tab.url === intent.bootstrapUrl).map(tab => tab.id); }
      catch { /* A failed observation is not evidence of absence. */ }
    }
    await transaction('readwrite', async tx => {
      const value = await tx.get('commandJournal', key(intent.creationId));
      value.candidateTabIds = [...new Set([...value.candidateTabIds, ...candidates])];
      await tx.put('commandJournal', value, key(value.creationId));
    });
    if (intent.state === 'dispatched' || (intent.navigationState === 'dispatched' && !intent.knownAgentDocumentId)) await freeze(intent.creationId, 'dispatch-gap');
    return transaction('readonly', async tx => creationResponse(await tx.get('commandJournal', key(intent.creationId)), await tx.get('runs', intent.runId)));
  }

  async function bootstrapReady(message, sender) {
    message = message.payload || message;
    const document = authenticatedDocument(api, sender);
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(typeof message.creationId === 'string', 'E_TARGET');
    const incarnation = await sessionIncarnation(session);
    const observed = await transaction('readonly', tx => tx.get('commandJournal', key(message.creationId)));
    if (observed && observed.browserSessionIncarnation !== incarnation) {
      const exact = (await api.tabs.query({})).filter(tab => tab.url === observed.bootstrapUrl);
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(exact.length === 1 && exact[0].id === document.tabId, 'E_TARGET', 'Restored bootstrap nonce must be unique');
    }
    const registered = await transaction('readwrite', async tx => {
      const intent = await tx.get('commandJournal', key(message.creationId));
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(intent && sender.url === intent.bootstrapUrl && intent.submissionCount === 1, 'E_TARGET');
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(intent.knownTabId === null || intent.knownTabId === document.tabId || intent.browserSessionIncarnation !== incarnation, 'E_TARGET');
      if (intent.browserSessionIncarnation === incarnation && intent.knownDocumentId !== null) (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(intent.knownDocumentId === document.documentId, 'E_TARGET');
      const run = await tx.get('runs', intent.runId);
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(run, 'E_TARGET');
      const rebound = intent.browserSessionIncarnation !== incarnation;
      if (rebound) {
        // A restored exact nonce grants retirement ownership only, never business execution.
        intent.reboundSession = incarnation;
        intent.reboundTabId = document.tabId;
        intent.reboundDocumentId = document.documentId;
      } else {
        if (intent.callbackTabId !== undefined) (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(intent.callbackTabId === document.tabId, 'E_TARGET');
        intent.knownTabId = document.tabId; intent.knownDocumentId = document.documentId;
        if (intent.state !== 'retired') intent.state = 'known';
      }
      if (run.retirementId) intent.retirementId = run.retirementId;
      await tx.put('commandJournal', intent, key(intent.creationId));
      return {intent, run, rebound};
    });
    if (message.phase !== 'navigate') return {ok: true, known: true, navigate: false, retirementOnly: registered.rebound || !!registered.run.retirementId};
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(!registered.rebound, 'E_TARGET', 'Restored nonce only authorizes retirement');
    await requireGrant(api, httpUrl(registered.intent.startUrl).origin);
    return transaction('readwrite', async tx => {
      const intent = await tx.get('commandJournal', key(message.creationId));
      const run = await tx.get('runs', intent.runId);
      await requireLive(tx, run, incarnation, intent.ownerEpoch);
      const host = await tx.get('commandJournal', `host:${run.registrationId}`); hostMatches(run, host);
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(intent.knownTabId === document.tabId && intent.knownDocumentId === document.documentId, 'E_TARGET');
      if (intent.navigationSubmissionCount !== 0) return {ok: true, navigate: false, state: intent.navigationState};
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(intent.navigationState === 'not-admitted' && intent.state === 'known', 'E_TARGET');
      intent.navigationState = 'dispatched'; intent.navigationSubmissionCount = 1; intent.navigationDispatchAt = now();
      await tx.put('commandJournal', intent, key(intent.creationId));
      return {ok: true, navigate: true, creationId: intent.creationId, startUrl: intent.startUrl};
    });
  }

  async function agentReady(message, sender) {
    const document = authenticatedDocument(api, sender);
    const url = httpUrl(sender.url);
    const incarnation = await sessionIncarnation(session);
    const candidate = await transaction('readonly', async tx => {
      const values = await tx.all('commandJournal');
      const matches = values.filter(value => value.tag === 'target-create' && value.knownTabId === document.tabId && value.browserSessionIncarnation === incarnation && value.state !== 'retired');
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(matches.length === 1, 'E_TARGET', 'Exact owned creation is required');
      return matches[0];
    });
    await requireGrant(api, url.origin);
    return transaction('readwrite', async tx => {
      const intent = await tx.get('commandJournal', key(candidate.creationId));
      const run = await tx.get('runs', intent.runId);
      await requireLive(tx, run, incarnation, intent.ownerEpoch);
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(url.origin === httpUrl(intent.startUrl).origin, 'E_TARGET');
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(intent.navigationSubmissionCount === 1, 'E_TARGET');
      const old = run.target;
      if (old?.documentId === document.documentId) return {ok: true, target: old, identity: run.identity};
      if (old) {
        const commands = await tx.all('commandJournal');
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(commands.some(c => c.identity?.runId === run.runId && ['next-link', 'next-button'].includes(c.kind) &&
          ['dispatched', 'effect_unknown'].includes(c.state) && (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.sameIdentity)(c.identity, run.identity, {ignoreRevision: true})), 'E_TARGET', 'Unadmitted document change');
      } else (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(url.href === httpUrl(intent.startUrl).href, 'E_TARGET', 'Initial document must match start URL');
      const target = {targetSessionId: old?.targetSessionId || (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.newId)(), ...document, allowedOrigin: url.origin,
        targetVersion: (old?.targetVersion || 0) + 1, browserSessionIncarnation: incarnation, creationId: intent.creationId};
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.validate)('Target', target);
      run.target = target; run.runRevision++; run.state = 'running';
      run.identity = {runId: run.runId, hostInstanceId: run.hostInstanceId, hostDocumentId: run.hostDocumentId,
        ownerEpoch: run.ownerEpoch, runRevision: run.runRevision, templateHash: run.templateHash, target};
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.validate)('Identity', run.identity);
      intent.navigationState = 'confirmed'; intent.knownAgentDocumentId = document.documentId;
      await tx.put('runs', run, run.runId); await tx.put('commandJournal', intent, key(intent.creationId));
      return {ok: true, target, identity: run.identity};
    });
  }

  async function bindTarget(request, sender) {
    const host = await assertHost(sender, request.registrationId);
    const incarnation = await sessionIncarnation(session);
    const binding = await transaction('readonly', async tx => {
      const run = await tx.get('runs', request.runId);
      await currentHost(tx, run, host); await requireLive(tx, run, incarnation);
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(request.expectedRunRevision === undefined || request.expectedRunRevision === run.runRevision, 'E_OWNER');
      const intent = await tx.get('commandJournal', key(run.creationId));
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(intent?.knownTabId !== null && intent?.navigationSubmissionCount === 1, 'E_TARGET');
      return {run, intent};
    });
    await requireGrant(api, httpUrl(binding.intent.startUrl).origin);
    if (!binding.run.target) await api.scripting.executeScript({target: {tabId: binding.intent.knownTabId, frameIds: [0]}, world: 'ISOLATED', files: ['agents/page-agent.js']});
    return transaction('readonly', async tx => {
      const run = await tx.get('runs', request.runId); await currentHost(tx, run, host);
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(run.target && run.browserSessionIncarnation === incarnation, 'E_TARGET', 'Await authenticated agent handshake');
      return {target: run.target, identity: run.identity, runRevision: run.runRevision};
    });
  }

  async function validateAgentSender(identity, sender) {
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.validate)('Identity', identity);
    const document = authenticatedDocument(api, sender);
    const incarnation = await sessionIncarnation(session);
    const url = httpUrl(sender.url);
    (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(identity.target.browserSessionIncarnation === incarnation && identity.target.tabId === document.tabId &&
      identity.target.documentId === document.documentId && identity.target.frameId === document.frameId && identity.target.allowedOrigin === url.origin, 'E_TARGET');
    return transaction('readonly', async tx => {
      const run = await tx.get('runs', identity.runId);
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(run && !run.retirementId && run.ownerEpoch === identity.ownerEpoch && (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.sameIdentity)(run.identity, identity, {ignoreRevision: true}), 'E_TARGET');
      const host = await tx.get('commandJournal', `host:${run.registrationId}`); hostMatches(run, host);
      return run;
    });
  }

  async function retireTarget({retirementId}, sender) {
    const host = await assertHost(sender);
    return retireOwnedTarget(retirementId, host);
  }
  async function retireOwnedTarget(retirementId, host) {
    const incarnation = await sessionIncarnation(session);
    const retirementKey = `retirement:${retirementId}`;
    const prepared = await transaction('readwrite', async tx => {
      const old = await tx.get('commandJournal', retirementKey);
      if (old?.releaseResult) { if (host) (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(old.registrationId === host.registrationId, 'E_OWNER'); return {old}; }
      const runs = await tx.all('runs');
      const run = runs.find(r => r.runId && r.retirementId === retirementId);
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(run && !run.tombstoned, 'E_TARGET');
      if (host) await currentHost(tx, run, host);
      else (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(old?.tag === 'retirement' && old.runId === run.runId && old.registrationId === run.registrationId &&
        old.fencedEpoch === run.fencedEpoch && run.cancelSeq > 0,
        'E_OWNER', 'Internal reconciliation requires an already committed retirement fence');
      const slot = await tx.get('runs', '@slot');
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(slot?.currentRunId === run.runId && slot.retirementId === retirementId && slot.fencedEpoch === run.fencedEpoch && slot.releaseCount === 0, 'E_OWNER');
      const intent = await tx.get('commandJournal', key(run.creationId));
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(intent, 'E_TARGET', 'Missing creation intent is not never-created evidence');
      const evidence = old || {tag: 'retirement', retirementId, runId: run.runId, fencedEpoch: run.fencedEpoch,
        registrationId: run.registrationId, creationId: intent.creationId, releaseCount: 0, fencedAt: now()};
      intent.retirementId = retirementId;
      await tx.put('commandJournal', intent, key(intent.creationId));
      await tx.put('commandJournal', evidence, retirementKey);
      return {run, intent, evidence};
    });
    if (prepared.old) return prepared.old.releaseResult;
    const {run, intent} = prepared;
    const neverCreated = intent.submissionCount === 0 && intent.dispatchAt === null && ['prepared', 'cancelled'].includes(intent.state);
    const rebound = intent.reboundSession === incarnation;
    const sameSession = intent.browserSessionIncarnation === incarnation;
    const tabId = rebound ? intent.reboundTabId : intent.knownTabId ?? intent.callbackTabId;
    let absence = neverCreated ? 'cancelled-before-create-dispatch' : null;
    if (!neverCreated && (!sameSession && !rebound || !Number.isSafeInteger(tabId))) return {retirementId, state: 'pending', reason: !sameSession && !rebound ? 'cross-session-unverified' : 'creation-unknown'};
    if (!absence) {
      // The registration is fenced before this exact, same-session remove. A remove error alone proves nothing.
      await transaction('readonly', async tx => {
        const current = await tx.get('runs', run.runId);
        const value = await tx.get('commandJournal', key(intent.creationId));
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(current.retirementId === retirementId && current.fencedEpoch === run.fencedEpoch &&
          (value.browserSessionIncarnation === incarnation || value.reboundSession === incarnation), 'E_TARGET');
      });
      try { await api.tabs.remove(tabId); } catch { /* Verify absence separately. */ }
      try { await api.tabs.get(tabId); return {retirementId, state: 'pending', reason: 'tab-still-present'}; }
      catch (error) {
        (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(/No tab with id|Invalid tab ID|tab not found/i.test(error?.message || ''), 'E_TARGET', 'Query failure is not absence');
        absence = rebound ? 'unique-bootstrap-current-session-removed' : 'tabs.get-not-found';
      }
    }
    return transaction('readwrite', async tx => {
      const evidence = await tx.get('commandJournal', retirementKey);
      if (evidence.releaseResult) return evidence.releaseResult;
      const current = await tx.get('runs', run.runId);
      const slot = await tx.get('runs', '@slot');
      (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.invariant)(current.retirementId === retirementId && current.fencedEpoch === evidence.fencedEpoch &&
        slot?.currentRunId === run.runId && slot.fencedEpoch === evidence.fencedEpoch && slot.retirementId === retirementId && slot.releaseCount === 0, 'E_OWNER');
      evidence.targetAbsenceAt = now(); evidence.targetAbsenceEvidence = absence; evidence.releaseCount = 1;
      evidence.slotReleasedAt = now(); evidence.releaseId = (0,_protocol_js__WEBPACK_IMPORTED_MODULE_0__.newId)();
      evidence.releaseResult = {retirementId, state: 'released', releaseId: evidence.releaseId, releaseCount: 1};
      current.retirementState = 'released';
      if (current.state === 'retiring') current.state = current.finalState || 'abandoned_unknown';
      current.runRevision++; if (current.identity) current.identity.runRevision = current.runRevision;
      const value = await tx.get('commandJournal', key(intent.creationId)); value.state = 'retired';
      await tx.put('commandJournal', value, key(intent.creationId));
      await tx.put('commandJournal', evidence, retirementKey);
      await tx.put('runs', current, current.runId);
      await tx.put('runs', {...slot, currentRunId: null, state: 'available', releaseCount: 1}, '@slot');
      return evidence.releaseResult;
    });
  }
  async function reconcileRetirements() {
    const pending = await transaction('readonly', async tx => (await tx.all('commandJournal'))
      .filter(row => row.tag === 'retirement' && !row.releaseResult));
    const results = [];
    for (const row of pending) {
      try { results.push(await retireOwnedTarget(row.retirementId, null)); }
      catch (error) { results.push({retirementId:row.retirementId, state:'pending', reason:error.code || 'E_TARGET'}); }
    }
    return results;
  }

  async function invalidateTab(tabId) {
    return transaction('readwrite', async tx => {
      for (const run of await tx.all('runs')) {
        if (run.target?.tabId !== tabId || !liveStates.has(run.state)) continue;
        run.state = 'paused_unknown'; run.runRevision++;
        if (run.identity) run.identity.runRevision = run.runRevision;
        await tx.put('runs', run, run.runId);
      }
    });
  }

  return Object.freeze({createTarget, reconcileTargetCreation, bootstrapReady, agentReady, bindTarget, retireTarget,
    reconcileRetirements, validateAgentSender, invalidateTab});
}


/***/ }),

/***/ "./src/scripting/user-scripts/page-evaluator.js":
/*!******************************************************!*\
  !*** ./src/scripting/user-scripts/page-evaluator.js ***!
  \******************************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   buildCancelPageWaits: () => (/* binding */ buildCancelPageWaits),
/* harmony export */   buildPageEvaluation: () => (/* binding */ buildPageEvaluation),
/* harmony export */   readPageEvaluationResult: () => (/* binding */ readPageEvaluationResult)
/* harmony export */ });
/* harmony import */ var _framework_control_value_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../framework/control/value.js */ "./src/framework/control/value.js");


// Build code for chrome.userScripts.execute only. No host/SW evaluator exists.
// The broker owns switch/grant/document checks and passes this descriptor to its
// one userScripts adapter, including cancellation of admitted page waits.
function buildPageEvaluation(method, args, {operationId, runId} = {}) {
  (0,_framework_control_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(typeof operationId === 'string' && operationId && typeof runId === 'string' && runId, 'E_ARGUMENT_TYPE');
  (0,_framework_control_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(Array.isArray(args), 'E_ARGUMENT_TYPE');
  const serialize = value => JSON.stringify((0,_framework_control_value_js__WEBPACK_IMPORTED_MODULE_0__.encodeValue)(value));
  let body, mode = 'USER_SCRIPT', wait = false;
  switch (method) {
    case 'evaluate': {
      const [descriptor, values] = args;
      (0,_framework_control_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(descriptor && typeof descriptor.source === 'string', 'E_ARGUMENT_TYPE');
      (0,_framework_control_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(!descriptor.source.includes('[native code]'), 'E_FUNCTION_SOURCE_UNSUPPORTED');
      if (descriptor.mode === 'legacy-statement') body = `${descriptor.source}\n;return true;`;
      else { (0,_framework_control_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(descriptor.mode === 'function', 'E_ARGUMENT_TYPE'); body = `return await (${descriptor.source})(...decodeValue(${serialize(values)}));`; }
      break;
    }
    case '$eval': case '$$eval': {
      const [css, source, values] = args; (0,_framework_control_value_js__WEBPACK_IMPORTED_MODULE_0__.selector)(css); (0,_framework_control_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(typeof source === 'string' && !source.includes('[native code]'), 'E_FUNCTION_SOURCE_UNSUPPORTED');
      body = method === '$eval' ? `const el=document.querySelector(${JSON.stringify(css)});requireValue(el,'E_ELEMENT_NOT_FOUND');return await (${source})(el,...decodeValue(${serialize(values)}));`
        : `return await (${source})(Array.from(document.querySelectorAll(${JSON.stringify(css)})),...decodeValue(${serialize(values)}));`;
      break;
    }
    case 'evaluateExpression': (0,_framework_control_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(args.length === 1 && typeof args[0] === 'string' && args[0].trim(), 'E_ARGUMENT_TYPE'); mode = 'MAIN'; body = `return await (${args[0]}\n);`; break;
    case 'eval': {
      const [source, config] = args; (0,_framework_control_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(typeof source === 'string' && source.length, 'E_ARGUMENT_TYPE'); (0,_framework_control_value_js__WEBPACK_IMPORTED_MODULE_0__.options)(config, ['mode']);
      (0,_framework_control_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(['expression', 'statement'].includes(config.mode), 'E_LEGACY_AMBIGUOUS_EXECUTION'); mode = 'MAIN';
      body = config.mode === 'expression' ? `return await (${source}\n);` : `await (async()=>{${source}\n})();return undefined;`; break;
    }
    case 'waitForFunction': {
      const [source, config, values] = args; (0,_framework_control_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(typeof source === 'string' && !source.includes('[native code]'), 'E_FUNCTION_SOURCE_UNSUPPORTED');
      (0,_framework_control_value_js__WEBPACK_IMPORTED_MODULE_0__.options)(config, ['timeout', 'polling']); (0,_framework_control_value_js__WEBPACK_IMPORTED_MODULE_0__.duration)(config.timeout);
      (0,_framework_control_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(config.polling === 'raf' || (Number.isFinite(config.polling) && config.polling > 0), 'E_ARGUMENT_TYPE'); wait = true;
      body = `const predicate=(${source}),values=decodeValue(${serialize(values)});const started=performance.now();for(;;){check();if(await Promise.race([Promise.resolve().then(()=>predicate(...values)),cancelled])){check();return true;}check();if(${config.timeout}!==0&&performance.now()-started>=${config.timeout})throw new PageError('E_TIMEOUT');await tick(${JSON.stringify(config.polling)});}`;
      break;
    }
    default: throw new _framework_control_value_js__WEBPACK_IMPORTED_MODULE_0__.PageError('E_OPERATION_UNSUPPORTED');
  }
  const constants = `const VALUE_LIMITS=${JSON.stringify({depth: 12, bytes: 65536})};const PageError=${_framework_control_value_js__WEBPACK_IMPORTED_MODULE_0__.PageError.toString()};const requireValue=${_framework_control_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue.toString()};const encodeValue=${_framework_control_value_js__WEBPACK_IMPORTED_MODULE_0__.encodeValue.toString()};const decodeValue=${_framework_control_value_js__WEBPACK_IMPORTED_MODULE_0__.decodeValue.toString()};`;
  const lifecycle = wait ? `
    const key=Symbol.for('opendesk.userScripts.waits.v1');const waits=globalThis[key]||(globalThis[key]=new Map());
    let stopped=false,timer=null,raf=null,deadlineTimer=null,rejectCancel;const cancelled=new Promise((_,reject)=>rejectCancel=reject);cancelled.catch(()=>{});
    const owner={runId:${JSON.stringify(runId)},cancel(){if(stopped)return;stopped=true;clearTimeout(timer);clearTimeout(deadlineTimer);if(raf!==null)cancelAnimationFrame(raf);rejectCancel(new PageError('E_CANCELLED'));}};
    ${wait && args[1].timeout > 0 ? `deadlineTimer=setTimeout(()=>{stopped=true;rejectCancel(new PageError('E_TIMEOUT'));},${args[1].timeout});` : ''}
    requireValue(!waits.has(${JSON.stringify(operationId)}),'E_OPERATION_CONFLICT');waits.set(${JSON.stringify(operationId)},owner);
    function check(){requireValue(!stopped,'E_CANCELLED');}
    function tick(polling){return Promise.race([new Promise(resolve=>{if(polling==='raf')raf=requestAnimationFrame(()=>{raf=null;resolve();});else timer=setTimeout(()=>{timer=null;resolve();},polling);}),cancelled]);}
  ` : '';
  const code = `(async()=>{${constants}${lifecycle}try{const value=await(async()=>{${body}\n})();return {ok:true,value:encodeValue(value)};}catch(error){return {ok:false,error:{code:error.code||'E_PAGE_EXECUTION',name:error.name,message:String(error.message),cause:{name:error.name,message:String(error.message)}}};}${wait ? `finally{clearTimeout(timer);clearTimeout(deadlineTimer);if(raf!==null)cancelAnimationFrame(raf);waits.delete(${JSON.stringify(operationId)});}` : ''}})()`;
  return Object.freeze({world: mode, code, wait, operationId, runId});
}

// Only called by the admitted broker's userScripts adapter in the same world.
// Cancellation of a wait fences future delivery, not a synchronous MAIN loop.
function buildCancelPageWaits(runId) {
  (0,_framework_control_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(typeof runId === 'string', 'E_ARGUMENT_TYPE');
  return `(()=>{const waits=globalThis[Symbol.for('opendesk.userScripts.waits.v1')];if(waits)for(const owner of waits.values())if(owner.runId===${JSON.stringify(runId)})owner.cancel();return true;})()`;
}
function readPageEvaluationResult(reply) {
  (0,_framework_control_value_js__WEBPACK_IMPORTED_MODULE_0__.requireValue)(reply && typeof reply.ok === 'boolean', 'E_RESULT_FORMAT');
  if (!reply.ok) throw new _framework_control_value_js__WEBPACK_IMPORTED_MODULE_0__.PageError(reply.error?.code || 'E_PAGE_EXECUTION', reply.error?.message, reply.error?.cause);
  return (0,_framework_control_value_js__WEBPACK_IMPORTED_MODULE_0__.decodeValue)(reply.value);
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
/*!*******************!*\
  !*** ./src/sw.js ***!
  \*******************/
__webpack_require__.r(__webpack_exports__);
/* harmony import */ var _environment_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./environment.js */ "./src/environment.js");
/* harmony import */ var _platform_protocol_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./platform/protocol.js */ "./src/platform/protocol.js");
/* harmony import */ var _platform_host_broker_js__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./platform/host/broker.js */ "./src/platform/host/broker.js");




const shell = (0,_environment_js__WEBPACK_IMPORTED_MODULE_0__.createWindowShell)(chrome);
const health = (0,_environment_js__WEBPACK_IMPORTED_MODULE_0__.createHealthProbe)(chrome);
const hostPorts = new Map();
const foundation = (0,_platform_host_broker_js__WEBPACK_IMPORTED_MODULE_2__.createFoundationBroker)({api:chrome, ports:hostPorts});
foundation.catch(error => console.error(`[foundation startup ${error.code || 'E_VERSION'}] ${error.message}`));
function invalidateSdk(reason, selector) {
  foundation.then(broker => Promise.all([
    broker.authority.revokeSdkGrants(reason === 'navigation' && selector.frameId === 0
      ? {tabId:selector.tabId,reason}
      : {...selector,documentId:reason === 'navigation' ? undefined : selector.documentId,reason}),
    broker.authority.invalidateControllerTarget(reason === 'permission-removed'
      ? {permissionRemoved:true,origins:selector.origins || []}
      : reason === 'tab-removed' ? {tabId:selector.tabId,removed:true}
      : {tabId:selector.tabId,frameId:selector.frameId || 0,documentId:selector.documentId})
  ]))
    .catch(error => console.error(`[SDK lifecycle ${error.code || 'E_EFFECT_UNKNOWN'}] ${error.message}`));
}
chrome.webNavigation.onCommitted.addListener(details => {
  // A top-frame navigation also disposes every child document grant.
  // SDK grants are document-bound; controller navigation additionally retains
  // the native document fact for its separately journalled controlled handoff.
  invalidateSdk('navigation',{tabId:details.tabId,frameId:details.frameId,documentId:details.documentId});
});
chrome.permissions.onRemoved.addListener(removed => {
  invalidateSdk('permission-removed',{origins:removed.origins,permissions:removed.permissions});
});
chrome.action.onClicked.addListener(tab => {
  const source = tab && !tab.incognito && tab.url && /^https?:/.test(tab.url) ? {tabId: tab.id, origin: (0,_environment_js__WEBPACK_IMPORTED_MODULE_0__.httpUrl)(tab.url).origin} : null;
  chrome.storage.session.set({environmentSource: source}).then(async () => {
    if (source) {
      try { await (await foundation).issueGestureTicket(tab); }
      catch (error) { console.error(`[foundation action ${error.code || 'E_VERSION'}] ${error.message}`); }
    }
    return shell.open();
  }).catch(error => console.error(error.message));
});
chrome.tabs.onRemoved.addListener(tabId => { health.forgetTab(tabId); invalidateSdk('tab-removed',{tabId}); });
chrome.tabs.onUpdated.addListener((tabId, change) => { if (change.status === 'loading') health.forgetTab(tabId); });
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.protocol === _platform_protocol_js__WEBPACK_IMPORTED_MODULE_1__.PROTOCOL) {
    foundation.then(broker => broker.handle(message, sender)).then(
      data => sendResponse({ok:true, data}),
      error => sendResponse({ok:false, error:{code:error.code || 'E_EFFECT_UNKNOWN', message:error.message || '后台服务失败'}}));
    return true;
  }
  if (message?.protocol !== _environment_js__WEBPACK_IMPORTED_MODULE_0__.PROTOCOL) return false;
  async function handle() {
    if (message.type === 'AGENT_READY') return health.rememberReady(message, sender);
    if (!(0,_environment_js__WEBPACK_IMPORTED_MODULE_0__.isToolSender)(chrome, sender)) throw new _environment_js__WEBPACK_IMPORTED_MODULE_0__.EnvironmentError('E_TARGET', '仅包内工具窗口可调用环境检查');
    switch (message.type) {
      case 'OPEN_TOOL': return shell.open();
      case 'CREATE_HEALTH_TARGET': return health.createTarget(message.url);
      case 'CHECK_HEALTH': return health.ping(message.target);
      case 'CHECK_SOURCE': {
        const {environmentSource} = await chrome.storage.session.get('environmentSource');
        if (!environmentSource) throw new _environment_js__WEBPACK_IMPORTED_MODULE_0__.EnvironmentError('E_TARGET', '请从 HTTP(S) 原页面点击扩展入口');
        return health.bind(environmentSource.tabId, environmentSource.origin);
      }
      default: throw new _environment_js__WEBPACK_IMPORTED_MODULE_0__.EnvironmentError('E_CAPABILITY', '环境阶段未实现该操作');
    }
  }
  handle().then(data => sendResponse({ok: true, data}), error => sendResponse({ok: false, error: {
    code: error.code || 'E_TARGET', message: error.message || '环境检查失败'
  }}));
  return true;
});

chrome.runtime.onConnect.addListener(port => {
  if (port.name !== _platform_protocol_js__WEBPACK_IMPORTED_MODULE_1__.PROTOCOL) return;
  if (!(0,_environment_js__WEBPACK_IMPORTED_MODULE_0__.isToolSender)(chrome, port.sender)) { port.disconnect(); return; }
  const documentId = port.sender.documentId;
  let closed = false, registrationId;
  port.onMessage.addListener(message => {
    if (message?.type !== 'bind-host' || typeof message.registrationId !== 'string') return;
    foundation.then(async broker => {
      const host = await broker.authority.assertHost(port.sender, message.registrationId);
      if (closed) return broker.disconnectHost(host.registrationId, documentId);
      const existing = hostPorts.get(documentId);
      if (existing && existing !== port) throw new _environment_js__WEBPACK_IMPORTED_MODULE_0__.EnvironmentError('E_OWNER', '宿主端口已绑定');
      if (registrationId && registrationId !== host.registrationId) throw new _environment_js__WEBPACK_IMPORTED_MODULE_0__.EnvironmentError('E_OWNER', '端口不能替换宿主身份');
      registrationId = host.registrationId;
      port.registrationId = registrationId;
      hostPorts.set(documentId, port);
    }).catch(error => {
      console.error(`[foundation port ${error.code || 'E_OWNER'}] ${error.message}`);
      if (!closed) port.disconnect();
    });
  });
  port.onDisconnect.addListener(() => {
    closed = true;
    if (hostPorts.get(documentId) !== port) return;
    hostPorts.delete(documentId);
    if (registrationId) foundation.then(broker => broker.disconnectHost(registrationId, documentId))
      .catch(error => console.error(`[foundation disconnect ${error.code || 'E_OWNER'}] ${error.message}`));
  });
});

})();

/******/ })()
;