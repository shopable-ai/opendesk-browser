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
/*!******************************!*\
  !*** ./src/agents/health.js ***!
  \******************************/
__webpack_require__.r(__webpack_exports__);
/* harmony import */ var _environment_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../environment.js */ "./src/environment.js");

// Single isolated-world listener even after repeated file injection. No DOM mutation or selection.
const key = '__openDeskEnvironmentHealthV1';
let agent = globalThis[key];
if (!agent) {
  agent = {instanceId: crypto.randomUUID()};
  agent.listener = (message, sender, respond) => {
    if (sender.id !== chrome.runtime.id || message?.protocol !== _environment_js__WEBPACK_IMPORTED_MODULE_0__.PROTOCOL || message.type !== 'HEALTH' ||
        message.agentInstanceId !== agent.instanceId || typeof message.requestId !== 'string') return false;
    respond({protocol: _environment_js__WEBPACK_IMPORTED_MODULE_0__.PROTOCOL, requestId: message.requestId, agentInstanceId: agent.instanceId,
      origin: location.origin, readyState: document.readyState});
    return false;
  };
  chrome.runtime.onMessage.addListener(agent.listener);
  globalThis[key] = agent;
}
// Promise completion lets the worker observe authentic sender metadata before sending its ping.
chrome.runtime.sendMessage({protocol: _environment_js__WEBPACK_IMPORTED_MODULE_0__.PROTOCOL, type: 'AGENT_READY', agentInstanceId: agent.instanceId})
  .then(reply => { if (!reply?.ok) throw new Error(reply?.error?.code || 'E_TARGET'); });

})();

/******/ })()
;