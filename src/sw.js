import {PROTOCOL, configureSidePanel, createHealthProbe, isToolSender, resolveToolSender, httpUrl, EnvironmentError} from './environment.js';
import {PROTOCOL as FOUNDATION_PROTOCOL, projectFoundationError} from './platform/protocol.js';
import {createFoundationBroker} from './platform/host/broker.js';

export function initServiceWorker() {

configureSidePanel(chrome).catch(error => console.error(`[side-panel ${error.code || 'E_TARGET'}] ${error.message}`));
const health = createHealthProbe(chrome);
const hostPorts = new Map();
const foundation = createFoundationBroker({api:chrome, ports:hostPorts});
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
  if (details.frameId === 0) foundation.then(broker => broker.cleanupPagePreviewWorlds({tabId:details.tabId,documentId:details.documentId}))
    .catch(error => console.error(`[page preview cleanup ${error.code || 'E_WORLD_ISOLATION'}] ${error.message}`));
});
chrome.permissions.onRemoved.addListener(removed => {
  invalidateSdk('permission-removed',{origins:removed.origins,permissions:removed.permissions});
});
chrome.action.onClicked.addListener(tab => {
  const source = tab && !tab.incognito && tab.url && /^https?:/.test(tab.url) ? {tabId: tab.id, origin: httpUrl(tab.url).origin} : null;
  chrome.storage.session.set({environmentSource: source}).then(async () => {
    if (source) {
      try { await (await foundation).issueGestureTicket(tab); }
      catch (error) { console.error(`[foundation action ${error.code || 'E_VERSION'}] ${error.message}`); }
    }
  }).catch(error => console.error(error.message));
});
chrome.tabs.onRemoved.addListener(tabId => {
  health.forgetTab(tabId);
  invalidateSdk('tab-removed',{tabId});
  foundation.then(broker => broker.recoverHostTab(tabId))
    .catch(error => console.error(`[foundation host tab ${error.code || 'E_OWNER'}] ${error.message}`));
  foundation.then(broker => broker.cleanupPagePreviewWorlds({tabId,removed:true}))
    .catch(error => console.error(`[page preview cleanup ${error.code || 'E_WORLD_ISOLATION'}] ${error.message}`));
});
chrome.tabs.onUpdated.addListener((tabId, change) => { if (change.status === 'loading') health.forgetTab(tabId); });
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.protocol === FOUNDATION_PROTOCOL) {
    foundation.then(broker => broker.handle(message, sender)).then(
      data => sendResponse({ok:true, data}),
      error => sendResponse({ok:false, error:projectFoundationError(error)}));
    return true;
  }
  if (message?.protocol !== PROTOCOL) return false;
  async function handle() {
    if (message.type === 'AGENT_READY') return health.rememberReady(message, sender);
    sender = await resolveToolSender(chrome, sender);
    if (!isToolSender(chrome, sender)) throw new EnvironmentError('E_TARGET', '仅包内工具窗口可调用环境检查');
    switch (message.type) {
      case 'CREATE_HEALTH_TARGET': return health.createTarget(message.url);
      case 'CHECK_HEALTH': return health.ping(message.target);
      case 'CHECK_SOURCE': {
        const {environmentSource} = await chrome.storage.session.get('environmentSource');
        if (!environmentSource) throw new EnvironmentError('E_TARGET', '请从 HTTP(S) 原页面点击扩展入口');
        return health.bind(environmentSource.tabId, environmentSource.origin);
      }
      default: throw new EnvironmentError('E_CAPABILITY', '环境阶段未实现该操作');
    }
  }
  handle().then(data => sendResponse({ok: true, data}), error => sendResponse({ok: false, error: {
    code: error.code || 'E_TARGET', message: error.message || '环境检查失败'
  }}));
  return true;
});

chrome.runtime.onConnect.addListener(port => {
  if (port.name !== FOUNDATION_PROTOCOL) return;
  const senderReady = resolveToolSender(chrome, port.sender);
  senderReady.catch(() => port.disconnect());
  let documentId;
  let closed = false, registrationId;
  port.onMessage.addListener(message => {
    if (message?.type !== 'bind-host' || typeof message.registrationId !== 'string') return;
    foundation.then(async broker => {
      const sender = await senderReady;
      documentId = sender.documentId;
      const host = await broker.authority.assertHost(sender, message.registrationId);
      if (closed) return broker.disconnectHost(host.registrationId, documentId);
      const existing = hostPorts.get(documentId);
      if (existing && existing !== port) throw new EnvironmentError('E_OWNER', '宿主端口已绑定');
      if (registrationId && registrationId !== host.registrationId) throw new EnvironmentError('E_OWNER', '端口不能替换宿主身份');
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

}
