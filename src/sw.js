import {configureSidePanel, resolveToolSender, httpUrl, permissionPattern, EnvironmentError} from './environment.js';
import {verifyWorkflowLinkBusinessProof} from './analytics/workflow-business-proof.js';
import {PROTOCOL as FOUNDATION_PROTOCOL, projectFoundationError} from './platform/protocol.js';
import {createFoundationBroker} from './platform/host/broker.js';
import {registerDownloadEvents} from './platform/downloads/events.js';
import {PAGE_BOOT_PROTOCOL} from './scripting/user-scripts/installed-programs.js';
import {reportBrowserCleanupError} from './platform/chrome/lifecycle-errors.js';
import {installStayFocusService} from '../projects/stay-focus/trusted/service.js';
import {installManagedSiteBudgetService} from './platform/chrome/browser-managed-site-budget.js';
import {installAdblockService} from '../projects/adblock/trusted/service.js';
import {installAiAccessService} from '../examples/sidebar-tools/ai-vip-share/trusted/service.js';
import {installCookieAccountService} from '../examples/sidebar-tools/cookie-editor/trusted/account-service.js';
import {reconcileManagedProxy,MANAGED_PROXY_ALARM} from './platform/chrome/browser-managed-proxy.js';
import {createCloudRunnerLifecycle} from './cloud-control/runner-lifecycle.js';
import {handlePromptRailOpen} from '../projects/prompt-shortcuts/trusted/rail-open.js';
import {installAnalyticsHost} from './analytics/host.js';
import {readAnalyticsAuthorityProjection} from './analytics/authority-projection.js';
import {installedKey as taskInstalledKey} from './platform/tasks/contract.js';
import {installChatGPTBridgeTriggerGate} from './native-agent/chatgpt-bridge-trigger-gate.js';
import {installGlobalVideoSpeedService} from '../projects/video-speed-controller/trusted/service.js';


export function initServiceWorker({development=null}={}) {
let pendingFoundation=0;
configureSidePanel(chrome).catch(error => console.error(`[side-panel ${error.code || 'E_TARGET'}] ${error.message}`));
// One-use bridge trigger fence only. Foundation Authority/RunHost remain the sole executors.
installChatGPTBridgeTriggerGate({api:chrome});
installGlobalVideoSpeedService({api:chrome});
// Isolated trusted telemetry sidecar attaches after the single Foundation
// instance is created. This must never create a second IndexedDB owner.
// Validated foundation ports are shared only with the fixed local Native
// transport. Failure to load optional Native code cannot disable Sidebar.
const hostPorts=globalThis.__opendeskNativeHostPorts=new Map();
if(development)globalThis.__opendeskDevelopment=development;
try{importScripts('sidebar-tools/preinstall-intent.js')}catch(e){console.warn('E_BOOTSTRAP',e)}
try{importScripts('marketplace/market-host.js')}catch(e){console.warn('E_MARKET_HOST_LOAD',e)}
try{importScripts('agents/health-host.js')}catch(e){console.warn('E_HEALTH_HOST_LOAD',e)}
try{importScripts('native-agent/transport.js');}catch(e){console.warn('E_NATIVE_TRANSPORT_LOAD',e);}
try{importScripts('knowledge/knowledge-host.js');}catch(e){console.warn('E_KNOWLEDGE_HOST_LOAD',e);}
try{importScripts('platform/context-menus.js');}catch(e){console.warn('E_BROWSER_MENU_HOST_LOAD',e);}
  try{importScripts('time-review/time-review-host.js');}catch(e){console.warn('E_TIME_REVIEW_HOST_LOAD',e);}
try{installManagedSiteBudgetService({api:chrome});}catch(e){console.warn('E_SITE_BUDGET_HOST_LOAD',e);}
try{installStayFocusService({api:chrome});}catch(e){console.warn('E_STAY_FOCUS_HOST_LOAD',e);}
try{installAdblockService({api:chrome});}catch(e){console.warn('E_ADBLOCK_HOST_LOAD',e);}
try{installAiAccessService({api:chrome});}catch(e){console.warn('E_AI_ACCESS_HOST_LOAD',e);}
let cookieAccounts;
try{cookieAccounts=installCookieAccountService({api:chrome,
  storage:async()=>(await foundation).storage});}
catch(e){console.warn('E_COOKIE_ACCOUNT_HOST_LOAD',e?.code||'E_ACCOUNT');}
const recoverManagedProxy=()=>void reconcileManagedProxy(chrome).catch(error=>
  console.warn('E_MANAGED_PROXY_RECOVER',error?.code||'E_PROXY'));
chrome.runtime.onStartup?.addListener(recoverManagedProxy);
chrome.runtime.onInstalled?.addListener(recoverManagedProxy);
chrome.alarms?.onAlarm?.addListener(alarm=>{if(alarm?.name===MANAGED_PROXY_ALARM)recoverManagedProxy();});
recoverManagedProxy();
try{importScripts('cloud-control/cloud-host.js');}catch(e){console.warn('E_CLOUD_LOAD',e);}
const foundation = createFoundationBroker({api:chrome, ports:hostPorts,downloadEventsAttached:true,
  onToolUninstalled:async({toolId})=>{
    if(toolId==='cookie-editor'){
      if(!cookieAccounts)throw Object.assign(Error('E_ACCOUNT_HOST'),{code:'E_ACCOUNT_HOST'});
      await cookieAccounts.cleanup();
    }
  }});
const analyticsNamespace='tool:'+chrome.runtime.id;
installAnalyticsHost({api:chrome,loadAuthority:async({since}={})=>
  readAnalyticsAuthorityProjection({storage:(await foundation).storage,api:chrome,since}),
  verifyManualTask:async taskId=>{
    const storage=(await foundation).storage;
    const row=await storage.transaction(['frameworkKV'],'readonly',tx=>
      tx.get('frameworkKV',taskInstalledKey(analyticsNamespace,taskId)));
    // A failed user-initiated Task attempt still counts if a real installed
    // enabled Task was selected. Site grant/Run success are NOT prerequisites.
    return row?.tag==='task-installed-v1'&&row.namespace===analyticsNamespace&&
      row.enabled===true&&typeof row.authorization?.installationId==='string';
  },
  readManualResult:async(taskId,runId,sender)=>{
    const storage=(await foundation).storage;
    const [run,result]=await storage.transaction(['runs','results'],'readonly',async tx=>{
      const row=await tx.get('runs',runId);
      const result=row?.resultId?await tx.get('results',row.resultId):null;
      return [row,result];
    });
    if(run?.tag!=='controller-run'||run.namespace!==analyticsNamespace||
      run.runId!==runId||run.hostDocumentId!==sender?.documentId||
      run.scheduledFireId||run.profile==='app-service'||
      run.installedTaskAuthorization?.taskId!==taskId||
      !run.scriptId?.startsWith('task:'))return null;
    if(result){
      if(result.tag!=='controller-result'||result.namespace!==analyticsNamespace||
        result.runId!==runId||result.resultId!==run.resultId||
        result.state!==run.state)return null;
      return {status:result.state==='completed'&&result.outcome?.ok===true?'completed':
        result.state==='failed'?'failed':'outcome_unknown'};
    }
    // A missing durable Result is UNKNOWN only after the original authority
    // durably fenced/stopped this Run. Never invent success or pre-empt a live Run.
    return ['paused_unknown','stopped','interrupted','failed'].includes(run.state)?
      {status:'outcome_unknown'}:null;
  },
  verifyManualPage:async programId=>{
    const storage=(await foundation).storage;
    const installed=await storage.transaction(['frameworkKV'],'readonly',tx=>tx.all('frameworkKV'));
    // Count a genuine attempted click even when the permission grant has just
    // expired or the installed script is disabled. Never count a draft.
    return installed.some(row=>row?.tag==='page-installed-v1'&&
      row.namespace===analyticsNamespace&&row.programId===programId&&
      typeof row.authorization?.installationId==='string');
  },
  readManualPageResult:async(programId,receiptId,sender)=>{
    const storage=(await foundation).storage;
    const installed=await storage.transaction(['frameworkKV'],'readonly',tx=>tx.all('frameworkKV'));
    const receipt=installed.find(row=>row?.tag==='page-execution-v1'&&
      row.namespace===analyticsNamespace&&row.source==='manual'&&
      row.programId===programId&&row.receiptId===receiptId&&
      row.manualHostDocumentId===sender?.documentId);
    const origin=installed.find(row=>row?.tag==='page-installed-v1'&&
      row.namespace===analyticsNamespace&&row.programId===programId&&
      row.authorization?.installationId===receipt?.installationId);
    // Both the durable receipt and the original installation version must
    // agree. Reject old/pre-consent records replayed through another Host.
    if(!origin||!receipt||receipt.manifestHash!==origin.manifestHash||
      receipt.sourceHash!==origin.sourceHash||
      !Number.isFinite(receipt.createdAt)||!Number.isFinite(receipt.finishedAt)||
      receipt.finishedAt<receipt.createdAt||Date.now()-receipt.finishedAt>60*60*1000||
      receipt.finishedAt>Date.now()+300000)return null;
    const status=receipt.state==='outcome-unknown'?'outcome_unknown':receipt.state;
    return ['completed','failed','outcome_unknown'].includes(status)?{status}:null;
  },
  verifyWorkflowResult:async(runId,sender,{beforeRunId,afterRunId}={})=>{
    // Each ID resolves to an actual original Controller journal record; the
    // observer is the one fixed, read-only Workflow script, never a UI claim.
    const storage=(await foundation).storage;
    const evidence=await storage.transaction(['runs','results','commandJournal'],'readonly',async tx=>{
      const [actionRun,beforeRun,afterRun]=await Promise.all([
        tx.get('runs',runId),tx.get('runs',beforeRunId),tx.get('runs',afterRunId)]);
      const [actionResult,beforeResult,afterResult]=await Promise.all([
        actionRun?.resultId?tx.get('results',actionRun.resultId):null,
        beforeRun?.resultId?tx.get('results',beforeRun.resultId):null,
        afterRun?.resultId?tx.get('results',afterRun.resultId):null]);
      const operations=(await tx.all('commandJournal')).filter(row=>row?.runId===runId);
      return {actionRun,beforeRun,afterRun,actionResult,beforeResult,afterResult,operations};
    });
    if(evidence.actionRun?.namespace!==analyticsNamespace||
      evidence.beforeRun?.namespace!==analyticsNamespace||
      evidence.afterRun?.namespace!==analyticsNamespace)return false;
    const proof=verifyWorkflowLinkBusinessProof({...evidence,
      hostDocumentId:sender?.documentId});
    if(!proof)return false; // Run completed alone never produces B-grade.
    const target=proof.resultTarget;
    try{
      const [frame,tab,granted]=await Promise.all([
        chrome.webNavigation.getFrame({tabId:target.tabId,frameId:0}),
        chrome.tabs.get(target.tabId),
        chrome.permissions.contains({origins:[
          permissionPattern(proof.actionTarget.url),permissionPattern(target.url)]})]);
      return granted===true&&frame?.documentId===target.documentId&&
        frame.url===target.url&&frame.documentLifecycle==='active'&&
        !frame.errorOccurred&&tab?.id===target.tabId&&tab.active===true&&
        tab.windowId===target.windowId&&tab.url===target.url&&
        tab.incognito===false&&!tab.pendingUrl;
    }catch{return false;}
  }});
// Lifecycle only: this adapter never claims Tasks or runs a second Controller.
// Keep the original RunHost alive while any durable @slot retirement is pending.
const cloudRunnerLifecycle=createCloudRunnerLifecycle({api:chrome});
const ensureCloudRunner=broker=>cloudRunnerLifecycle.reconcile(broker);
// Fixed Browser Host sidecar reuses the sole foundation Scheduler instance.
// No user code executes in this worker or can replace this trusted closure.
globalThis.__opendeskBrowserSchedule=async(operation,args,owner,intent)=>{
  const schedules=(await foundation).authority.schedules;
  const method={'browser.scheduler.create':'create','browser.scheduler.listOwn':'listOwn',
    'browser.scheduler.cancelOwn':'cancelOwn'}[operation];
  if(!method)throw Object.assign(new Error('Unsupported schedule operation'),{code:'E_SERVICE_UNSUPPORTED'});
  return schedules[method](args,owner,intent);
};
registerDownloadEvents(chrome,foundation);
let readyFoundation;
foundation.then(async broker=>{
  readyFoundation=broker;
  if(broker.authority.cloud)globalThis.__opendeskCloudConnection({service:broker.authority.cloud,api:chrome});
  await ensureCloudRunner(broker);
}).catch(error=>console.warn('[cloud runner recovery]',error?.code||error?.message));
// Reuse the existing MV3 cloud wake alarm, not a second transport or scheduler.
chrome.alarms?.onAlarm?.addListener(alarm=>{
  if(alarm.name==='opendesk.cloud.recover.v1')
    foundation.then(ensureCloudRunner).catch(error=>console.warn('[cloud runner wake]',error?.code||error?.message));
});
foundation.catch(error => console.error('foundation startup',error));
development?.start(async()=>{
  if(pendingFoundation||development.nativePending)return false;
  const broker=await foundation;
  const native=await chrome.storage.local.get('opendesk.native-agent.ledger.v1');
  if(Object.values(native['opendesk.native-agent.ledger.v1']||{}).some(row=>row.state==='OUTCOME_UNKNOWN'))return false;
  return development.runHostIdle(broker.storage);
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
  readyFoundation?.authority.cloud?.invalidate();
  invalidateSdk('permission-removed',{origins:removed.origins,permissions:removed.permissions});
  // Once initialized, revoke synchronously fences installed dispatch before
  // the durable suspension waits on storage. Startup events remain ordered.
  const revoked=readyFoundation?readyFoundation.revokeInstalledPagePermissions(removed):
    foundation.then(broker=>broker.revokeInstalledPagePermissions(removed));
  revoked.catch(error=>console.error('Page permission revocation',error));
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
  if(development?.held){sendResponse({ok:false,error:{code:'E_DEV_RELOADING',message:'开发更新正在核对空闲宿主；本次自动执行未派发'}});return false;}
  pendingFoundation++;
  foundation.then(broker=>broker.handleInstalledPageBoot(message,sender)).then(
    data=>sendResponse({ok:true,data}),error=>sendResponse({ok:false,error:projectFoundationError(error)})).finally(()=>pendingFoundation--);
  return true;
});
// Chrome alarms are wake hints only; the durable FireId transaction is authoritative.
chrome.alarms.onAlarm.addListener(alarm=>{
  if(!alarm.name?.startsWith('opendesk.schedule.v1:'))return;
  foundation.then(async broker=>{await broker.authority.schedules.onAlarm(alarm);await ensureCloudRunner(broker);})
    .catch(error=>console.error('[scheduled alarm]',error));
});
chrome.storage.onChanged.addListener((changes,area)=>{
  if(area!=='local'||!['opendesk.sidebar-tools.installed.v1','opendesk.sidebar-tools.enabled.v1','opendesk.sidebar-tools.revocation-epochs.v1','opendesk.market.provenance.v1'].some(key=>Object.hasOwn(changes,key)))return;
  void foundation.then(async broker=>{
    await broker.authority.invalidateAppServices();
    await broker.authority.schedules.reconcile();
    await ensureCloudRunner(broker);
  }).catch(error=>console.warn('[app service revoke]',error?.code||error?.message));
});
chrome.runtime.onStartup?.addListener(()=>{
  foundation.then(async broker=>{await broker.authority.schedules.reconcile();await ensureCloudRunner(broker);})
    .catch(error=>console.error('[scheduled startup]',error));
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
  invalidateSdk('tab-removed',{tabId});
  foundation.then(broker => broker.recoverHostTab(tabId))
    .catch(error => reportBrowserCleanupError(error,{phase:'foundation-tab-removed',
      label:`[foundation host tab ${error.code || 'E_OWNER'}] ${error.message}`}));
  foundation.then(broker => broker.cleanupPagePreviewWorlds({tabId,removed:true}))
    .catch(error => reportBrowserCleanupError(error,{phase:'page-preview-tab-removed',
      label:`[page preview cleanup ${error.code || 'E_WORLD_ISOLATION'}] ${error.message}`}));
});
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if(handlePromptRailOpen({api:chrome,message,sender,respond:sendResponse}))return true;
  // The independent fixed health-host listener owns only the environment
  // protocol. This host continues to own Foundation RPC and its dispatch fence.
  if(message?.protocol!==FOUNDATION_PROTOCOL)return false;
  if(development?.held){
    sendResponse({ok:false,error:{code:'E_DEV_RELOADING',message:'开发更新正在核对空闲宿主；请求未执行，请等待更新完成'}});
    return false;
  }
  pendingFoundation++;
  foundation.then(async broker=>{
    const data=await broker.handle(message,sender);
    if(message.type==='cloudApprove')await ensureCloudRunner(broker);
    if(message.type==='cloudStop'||message.type==='cloudUnpair'){
      // Stop is already durable. A cleanup failure must not misreport the
      // completed revocation; the existing Cloud wake alarm retries cleanup.
      try{await ensureCloudRunner(broker);}
      catch(error){console.warn('[cloud runner cleanup]',error?.code||error?.message);}
    }
    return data;
  }).then(
    data=>{sendResponse({ok:true,data});
      if(message.type==='listDueSchedules'&&message.payload?.profile==='app-service'&&!data.fires?.length)
        void foundation.then(ensureCloudRunner).catch(error=>console.warn('[shared RunHost release]',error?.code||error?.message));
    },
    error=>sendResponse({ok:false,error:projectFoundationError(error)})
  ).finally(()=>pendingFoundation--);
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
      .catch(error => reportBrowserCleanupError(error,{phase:'foundation-port-disconnected',
        label:`[foundation disconnect ${error.code || 'E_OWNER'}] ${error.message}`}));
  });
});

}
