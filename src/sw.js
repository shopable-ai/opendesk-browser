import {PROTOCOL, configureSidePanel, createHealthProbe, isToolSender, resolveToolSender, httpUrl, EnvironmentError} from './environment.js';
import {PROTOCOL as FOUNDATION_PROTOCOL, projectFoundationError} from './platform/protocol.js';
import {createFoundationBroker} from './platform/host/broker.js';
import {PAGE_BOOT_PROTOCOL} from './scripting/user-scripts/installed-programs.js';


export function initServiceWorker({development=null}={}) {
let pendingFoundation=0;

configureSidePanel(chrome).catch(error => console.error(`[side-panel ${error.code || 'E_TARGET'}] ${error.message}`));
const health = createHealthProbe(chrome);
// Validated foundation ports are shared only with the fixed local Native
// transport. Failure to load optional Native code cannot disable Sidebar.
const hostPorts=globalThis.__opendeskNativeHostPorts=new Map();
if(development)globalThis.__opendeskDevelopment=development;
try{importScripts('native-agent/transport.js');}catch(e){console.warn('E_NATIVE_TRANSPORT_LOAD',e);}
const foundation = createFoundationBroker({api:chrome, ports:hostPorts});
foundation.catch(error => console.error('foundation startup',error));
development?.start(async()=>{
  if(pendingFoundation||development.nativePending)return false;
  const broker=await foundation;
  const native=await chrome.storage.local.get('opendesk.native-agent.ledger.v1');
  if(Object.values(native['opendesk.native-agent.ledger.v1']||{}).some(row=>row.state==='OUTCOME_UNKNOWN'))return false;
  return broker.storage.transaction(['runs','commandJournal'],'readonly',async tx=>{
    const slot=await tx.get('runs','@slot');
    if(slot?.currentRunId||slot?.preview)return false;
    const journal=await tx.all('commandJournal');
    return !journal.some(row=>['dispatched','remove-dispatched','effect_unknown','OUTCOME_UNKNOWN','outcome-unknown'].includes(row.state));
  });
});
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
    .catch(error => console.error('SDK lifecycle',error));
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
  foundation.then(broker=>broker.reconcileInstalledPages()).catch(error=>console.error('Page registration reconciliation',error));
});
chrome.permissions.onAdded?.addListener(()=>{
  foundation.then(broker=>broker.reconcileInstalledPages()).catch(error=>console.error('Page registration reconciliation',error));
});
chrome.runtime.onInstalled?.addListener(details=>{
  if(details.reason==='update')foundation.then(broker=>broker.reconcileInstalledPages())
    .catch(error=>console.error('Page update reconciliation',error));
});
chrome.runtime.onUserScriptMessage?.addListener((message,sender,sendResponse)=>{
  if(message?.protocol!==PAGE_BOOT_PROTOCOL)return false;
  foundation.then(broker=>broker.handleInstalledPageBoot(message,sender)).then(
    data=>sendResponse({ok:true,data}),error=>sendResponse({ok:false,error:projectFoundationError(error)}));
  return true;
});
chrome.action.onClicked.addListener(tab => {
  const source = tab && !tab.incognito && tab.url && /^https?:/.test(tab.url) ? {tabId: tab.id, origin: httpUrl(tab.url).origin} : null;
  chrome.storage.session.set({environmentSource: source}).then(async () => {
    if (source) {
      try { await (await foundation).issueGestureTicket(tab); }
      catch (error) { console.error('foundation action',error); }
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
    if(development?.held){sendResponse({ok:false,error:{code:'E_DEV_RELOADING',message:'开发更新正在核对空闲宿主；请求未执行，请等待更新完成'}});return false;}
    pendingFoundation++;
    foundation.then(broker => broker.handle(message, sender)).then(
      data => sendResponse({ok:true, data}),
      error => sendResponse({ok:false, error:projectFoundationError(error)})).finally(()=>pendingFoundation--);
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
      port.postMessage({type:'host-bound',registrationId});
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
