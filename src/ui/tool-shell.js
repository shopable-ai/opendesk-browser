import {PROTOCOL, permissionPattern} from '../environment.js';
import {createHostClient} from '../platform/host/client.js';
import {ADMITTED_METHODS} from '../framework/sdk/registry.js';
import {createScriptEditor} from './script-editor.js';
import {snapshotToolResources} from './resource-diagnostics.js';
import {createCurrentPageTarget} from './current-page-target.js';

export function initToolShell() {
  const hostUrl = new URL(location.href);
  const hostInstanceId = hostUrl.searchParams.get('hostInstanceId');
  if (!hostInstanceId) {
    hostUrl.search = ''; hostUrl.hash = ''; hostUrl.searchParams.set('hostInstanceId', crypto.randomUUID());
    // A committed document navigation is required: Chrome 138 MessageSender
    // retains the original URL after history.replaceState.
    location.replace(hostUrl.href);
    return;
  }
  const foundationClient = createHostClient(chrome, {hostInstanceId});
const currentPageTarget = createCurrentPageTarget({api:chrome});
const scriptEditor = createScriptEditor({client:foundationClient,currentPageTarget});
const listeners = [];
let browserListenersAttached = false;
const listen = (element, event, listener, options) => {
  element.addEventListener(event, listener, options); listeners.push({element, event, listener, options});
};
Object.defineProperty(globalThis, 'OpenDeskResourceDiagnostics', {value: Object.freeze({
  snapshot: () => snapshotToolResources(scriptEditor.resourceSnapshot(),
    {subscriptions: listeners.length + 2 * Number(browserListenersAttached) + currentPageTarget.resourceSnapshot().subscriptions})
})});
const scrapingPanel = document.querySelector('#scraping-panel');
scrapingPanel.dataset.moduleStatus = 'MODULE_NOT_INSTALLED';
scrapingPanel.textContent = '采集模块未注册；普通 JavaScript 与网页 SDK 可独立使用。';
let target;
const status = document.querySelector('#status');
const result = document.querySelector('#health-result');
function display(error, data) {
  status.dataset.error = String(Boolean(error));
  status.textContent = error ? `${error.code || 'E_TARGET'}：${error.message}` : data?.scope === 'environment-health-only' ? '目标健康检查通过（仅环境通信）' : '工具窗口已聚焦';
  result.textContent = data ? JSON.stringify(data, null, 2) : '';
}
async function request(type, payload = {}) {
  const response = await chrome.runtime.sendMessage({protocol: PROTOCOL, type, ...payload});
  if (!response?.ok) throw response?.error || {code: 'E_TARGET', message: '未收到扩展响应'};
  return response.data;
}
async function action(operation) {
  try {
    status.textContent = '正在检查…';
    const data = await operation();
    if (data.target) { target = data.target; document.querySelector('#check-target').disabled = false; }
    display(null, data);
  } catch (error) { display(error); }
}
listen(document.querySelector('#create-target'), 'click', () => {
  // Invoke permissions.request directly in the user gesture, before async broker work.
  let pattern;
  try { pattern = permissionPattern(document.querySelector('#target-url').value); } catch (error) { display(error); return; }
  const granted = chrome.permissions.request({origins: [pattern]});
  action(async () => {
    if (!await granted) throw {code: 'E_PERMISSION', message: '站点授权被拒绝，未创建检查页'};
    return request('CREATE_HEALTH_TARGET', {url: document.querySelector('#target-url').value});
  });
});
listen(document.querySelector('#check-source'), 'click', () => action(() => request('CHECK_SOURCE')));
listen(document.querySelector('#check-target'), 'click', () => action(() => request('CHECK_HEALTH', {target})));
const sdkTab = document.querySelector('#sdk-tab');
const sdkDocument = document.querySelector('#sdk-document');
const sdkInstall = document.querySelector('#sdk-install');
const sdkStatus = document.querySelector('#sdk-status');
const sdkResult = document.querySelector('#sdk-result');
const sdkCapabilities = document.querySelector('#sdk-capabilities');
const capabilityLabels = {
  network: 'HTTP 网络请求（仅选定站点）', 'storage.persistent': '持久存储',
  'storage.session': '浏览器会话存储', notifications: '通知', 'device.id': '稳定应用 ID',
  'network.info': '外部网络信息（当前未启用）'
};
let sdkDocuments = new Map(), sdkSelectionVersion = 0, sdkBusy = false;
for (const capability of new Set(Object.values(ADMITTED_METHODS).map(method => method.capability))) {
  const label = document.createElement('label'), input = document.createElement('input');
  input.type = 'checkbox'; input.value = capability; input.name = 'sdk-capability';
  // Registry metadata is an allowlist, never authority. Network info is disabled by the service.
  input.disabled = capability === 'network.info';
  label.append(input, document.createTextNode(` ${capabilityLabels[capability] || capability} `));
  sdkCapabilities.append(label);
}
const selectedCapabilities = () => [...sdkCapabilities.querySelectorAll('input:checked:not(:disabled)')].map(input => input.value);
function sdkDisplay(state, message, data) {
  sdkStatus.dataset.state = state; sdkStatus.textContent = message;
  sdkResult.textContent = data === undefined ? '' : JSON.stringify(data, null, 2);
}
function sdkError(error) { sdkDisplay('error', `${error.code || 'E_TARGET'}：${error.message || error}`); }
function sdkUpdateButton() { sdkInstall.disabled = sdkBusy || !sdkDocuments.has(sdkDocument.value) || !selectedCapabilities().length; }
function clearSdkDocument() {
  sdkSelectionVersion++; sdkDocuments = new Map();
  sdkDocument.replaceChildren(new Option('请选择当前精确文档', ''));
  sdkDocument.disabled = true; sdkUpdateButton();
}
async function refreshSdkTabs() {
  clearSdkDocument(); sdkTab.replaceChildren(new Option('请选择具体网页', ''));
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (tab.incognito || !Number.isInteger(tab.id) || !/^https?:\/\//.test(tab.url || '')) continue;
    sdkTab.append(new Option(`[${tab.id}] ${tab.title || tab.url} — ${tab.url}`, String(tab.id)));
  }
  sdkDisplay('idle', '请选择网页、当前文档和服务');
}
async function refreshSdkDocuments() {
  clearSdkDocument();
  if (!sdkTab.value) return;
  const tabId = Number(sdkTab.value), version = sdkSelectionVersion;
  const [tab, frames] = await Promise.all([chrome.tabs.get(tabId), chrome.webNavigation.getAllFrames({tabId})]);
  if (version !== sdkSelectionVersion || sdkTab.value !== String(tabId)) return;
  if (tab.incognito) throw {code: 'E_PERMISSION', message: '不支持隐身网页'};
  for (const frame of frames || []) {
    if (!frame.documentId || frame.errorOccurred || !/^https?:\/\//.test(frame.url || '') ||
        (frame.documentLifecycle && frame.documentLifecycle !== 'active')) continue;
    sdkDocuments.set(frame.documentId, {tabId, frameId: frame.frameId, documentId: frame.documentId, url: frame.url});
    sdkDocument.append(new Option(`frame ${frame.frameId} · ${frame.documentId} · ${frame.url}`, frame.documentId));
  }
  sdkDocument.disabled = sdkDocuments.size === 0;
  sdkDisplay('idle', sdkDocuments.size ? '请选择精确文档，并勾选服务' : '没有可授权的当前 HTTP(S) 文档');
}
foundationClient.ready.catch(sdkError);
listen(document.querySelector('#sdk-refresh'), 'click', () => refreshSdkTabs().catch(sdkError));
listen(sdkTab, 'change', () => refreshSdkDocuments().catch(sdkError));
listen(sdkDocument, 'change', sdkUpdateButton);
listen(sdkCapabilities, 'change', sdkUpdateButton);
listen(sdkInstall, 'click', event => {
  // permissions.request must run synchronously in this trusted click, before any await.
  const selected = sdkDocuments.get(sdkDocument.value), capabilities = selectedCapabilities();
  if (!event.isTrusted || sdkBusy || !selected || !capabilities.length) return;
  let permission;
  try {
    permission = chrome.permissions.request({origins: [permissionPattern(selected.url)],
      ...(capabilities.includes('notifications') ? {permissions: ['notifications']} : {})});
  } catch (error) { sdkError(error); return; }
  sdkBusy = true; sdkUpdateButton(); sdkDisplay('installing', '正在授权并安装选定文档…');
  const version = sdkSelectionVersion;
  (async () => {
    if (!await permission) throw {code: 'E_PERMISSION', message: '授权被拒绝，未安装 SDK'};
    if (version !== sdkSelectionVersion || sdkDocuments.get(selected.documentId) !== selected)
      throw {code: 'E_DOCUMENT_STALE', message: '选定文档已变更，请重新选择'};
    const data = await foundationClient.request('installSdk', {tabId: selected.tabId, frameId: selected.frameId,
      documentId: selected.documentId, capabilities});
    sdkDisplay('installed', '已向选定文档安装 SDK；网页 ready() 将验证真实授权', data);
  })().catch(sdkError).finally(() => { sdkBusy = false; sdkUpdateButton(); });
});
const sdkNavigation = details => {
  if (String(details.tabId) !== sdkTab.value) return;
  clearSdkDocument(); sdkDisplay('stale', '网页已导航，请重新选择当前文档并授权');
};
const sdkTabRemoved = tabId => {
  if (String(tabId) !== sdkTab.value) return;
  sdkTab.value = ''; clearSdkDocument(); sdkDisplay('stale', '选定网页已关闭');
};
chrome.webNavigation.onCommitted.addListener(sdkNavigation);
chrome.tabs.onRemoved.addListener(sdkTabRemoved);
browserListenersAttached = true;
refreshSdkTabs().catch(sdkError);
listen(window, 'pagehide', () => {
  chrome.webNavigation.onCommitted.removeListener(sdkNavigation); chrome.tabs.onRemoved.removeListener(sdkTabRemoved);
  browserListenersAttached = false;
  for (const {element, event, listener, options} of listeners) element.removeEventListener(event, listener, options);
  listeners.length = 0;
  scriptEditor.dispose(); currentPageTarget.dispose(); foundationClient.dispose();
}, {once: true});

}
