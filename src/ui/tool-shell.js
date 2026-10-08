import {PROTOCOL, permissionPattern} from '../environment.js';
import {createHostClient} from '../platform/host/client.js';
import {ADMITTED_METHODS} from '../framework/sdk/registry.js';
import {createScriptEditor} from './script-editor.js';
import {createSdkApproval, snapshotSdkApproval} from './sdk-approval.js';
import {snapshotToolResources} from './resource-diagnostics.js';
import {createCurrentPageTarget} from './current-page-target.js';
import {createTaskWorkbench} from './task-workbench.js';
import {createSiteAccess, siteAccessSatisfies} from './site-access.js';

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
const taskWorkbench = createTaskWorkbench({client:foundationClient,host:scriptEditor.host,currentPageTarget});
const listeners = [];
let browserListenersAttached = false;
const listen = (element, event, listener, options) => {
  element.addEventListener(event, listener, options); listeners.push({element, event, listener, options});
};
const accessStatus = document.querySelector('#site-access-status');
const accessGrant = document.querySelector('#site-access-grant');
const accessCookies = document.querySelector('#site-access-cookies');
const accessNotifications = document.querySelector('#site-access-notifications');
const siteAccessOptions = () => ({cookies:accessCookies.checked,notifications:accessNotifications.checked});
let siteAccessView = {phase:'checking',message:'正在查询 Chrome 网站权限',snapshot:null,busy:false};
function renderSiteAccess(view = siteAccessView) {
  siteAccessView = view;
  accessStatus.dataset.state = view.phase;
  accessStatus.textContent = view.message + (view.snapshot
    ? `（Cookie：${view.snapshot.cookies ? '已授权' : '未授权'}；通知：${view.snapshot.notifications ? '已授权' : '未授权'}）` : '');
  const satisfied = siteAccessSatisfies(view.snapshot, siteAccessOptions());
  accessGrant.disabled = view.busy || satisfied;
  accessGrant.textContent = satisfied ? '所选权限已授权' : '一次性授权全部网站';
}
const siteAccess = createSiteAccess({api:chrome,onState:renderSiteAccess});
listen(accessGrant,'click',event => {
  // grant() calls chrome.permissions.request synchronously in this click.
  siteAccess.grant(event,siteAccessOptions()).catch(error =>
    console.warn('Chrome site access not granted',error));
});
listen(document.querySelector('#site-access-refresh'),'click',() => {
  siteAccess.refresh().catch(error => console.warn('Chrome site access refresh failed',error));
});
listen(accessCookies,'change',() => renderSiteAccess());
listen(accessNotifications,'change',() => renderSiteAccess());
siteAccess.refresh().catch(error => console.warn('Chrome site access check failed',error));
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
const sdkTargets = document.querySelector('#sdk-target-origins');
const sdkPreview = document.querySelector('#sdk-approval-preview');
const capabilityLabels = {
  network: 'HTTP 网络请求（仅本次精确批准的来源与目标）', 'storage.persistent': '持久存储',
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
const sdkSelection = () => ({document:sdkDocuments.get(sdkDocument.value),
  capabilities:selectedCapabilities(), targetText:sdkTargets.value});
function sdkUpdateButton() {
  let valid = false;
  try { sdkPreview.textContent = JSON.stringify(snapshotSdkApproval(sdkSelection()), null, 2); valid = true; }
  catch (error) { sdkPreview.textContent = `${error.code || 'E_SCHEMA'}：${error.message}`; }
  sdkInstall.disabled = sdkBusy || !valid;
}
const sdkApproval = createSdkApproval({api:chrome, client:foundationClient, permissionPattern, readSelection:sdkSelection,
  onBusy(value) { sdkBusy = value; sdkUpdateButton(); },
  onState({state,message,snapshot,receipt,error,lastConfirmedReceipt}) {
    sdkDisplay(state,message,{approvalSnapshot:snapshot,receipt,error,
      lastConfirmedReceipt,historyNotice:'历史回执不证明当前授权仍有效，也不代表当前输入已批准'});
  }});
function sdkInputsChanged() {
  sdkApproval.invalidate(); sdkUpdateButton();
}
function clearSdkDocument() {
  sdkSelectionVersion++; sdkDocuments = new Map();
  sdkApproval.invalidate('文档列表已变化，请重新选择精确文档并批准');
  sdkDocument.replaceChildren(new Option('请选择当前精确文档', ''));
  sdkDocument.disabled = true; sdkUpdateButton();
}
async function refreshSdkTabs() {
  clearSdkDocument(); sdkTab.replaceChildren(new Option('请选择具体网页', ''));
  const version = sdkSelectionVersion;
  const tabs = await chrome.tabs.query({});
  if (version !== sdkSelectionVersion) return;
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
listen(sdkDocument, 'change', sdkInputsChanged);
listen(sdkCapabilities, 'change', sdkInputsChanged);
listen(sdkTargets, 'input', sdkInputsChanged);
listen(sdkInstall, 'click', event => {
  if (!event.isTrusted || sdkBusy || sdkInstall.disabled) return;
  // Permissions are requested synchronously by the approved snapshot handler.
  sdkApproval.approve(event).catch(error => {
    console.warn('SDK approval was not confirmed', error);
  });
});
const sdkPermissionsRemoved = () => sdkApproval.invalidate('浏览器权限撤销已被观察；当前显示不再证明授权有效，请重新批准');
chrome.permissions.onRemoved.addListener(sdkPermissionsRemoved);
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
  chrome.permissions.onRemoved.removeListener(sdkPermissionsRemoved); sdkApproval.dispose();
  browserListenersAttached = false;
  for (const {element, event, listener, options} of listeners) element.removeEventListener(event, listener, options);
  listeners.length = 0;
  siteAccess.dispose(); taskWorkbench.dispose(); scriptEditor.dispose(); currentPageTarget.dispose(); foundationClient.dispose();
}, {once: true});

}
