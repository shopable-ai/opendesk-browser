import {createDebugWorkbench} from './debug-workbench.js';
import {PROTOCOL, permissionPattern} from '../environment.js';
import {BROWSER_HOST_PROTOCOL,BROWSER_MENU_LAUNCH_STORE} from '../framework/sdk/browser-contract.js';
import {createHostClient} from '../platform/host/client.js';
import {ADMITTED_METHODS} from '../framework/sdk/registry.js';
import {createScriptEditor} from './script-editor.js';
import {createSdkApproval, snapshotSdkApproval, sdkHttpLabPreset} from './sdk-approval.js';
import {snapshotToolResources} from './resource-diagnostics.js';
import {createCurrentPageTarget} from './current-page-target.js';
import {createTaskWorkbench} from './task-workbench.js';
import {createScheduledTaskWorkbench} from './scheduled-task-workbench.js';
import {createSidebarTabMemory} from './sidebar-tab-memory.js';
import {createWorkflowView} from './workflow/workflow-view.js';
import {createSidebarTools} from './sidebar-tools-loader.js';
import {createInstalledPageTools} from './installed-page-tools.js';
import {requestedToolId,requestedPreviewId,canonicalToolHostUrl} from './sidebar-tools/navigation.js';
import {previewStorageKey} from '../native-agent/tool-snapshot.js';
import {validatePreviewSession} from './sidebar-tools/preview-session.js';
import {createNativeAgentHostAdapter} from '../native-agent/host-adapter.js';
import {createSiteAccess} from './site-access.js';
import {requireChromePermissions} from '../platform/chrome/permission-gate.js';

// An extension's Side Panel and its full-size catalog share tool.html.
// Chrome can expose a tab-like current context in some builds; classify the
// exact current document positively before choosing the catalog-only UI.
// Match the full hostInstanceId URL, not just the extension origin/path.
export async function isActualSidePanelContext({api,href}={}){
  if(!api?.runtime?.getContexts||typeof href!=='string'||!href)return false;
  try{
    const contexts=await api.runtime.getContexts({
      contextTypes:['SIDE_PANEL'],documentUrls:[href]
    });
    return Array.isArray(contexts)&&contexts.some(row=>
      row?.contextType==='SIDE_PANEL'&&row.documentUrl===href&&
      typeof row.documentId==='string'&&row.documentId.length>0);
  }catch{return false;}
}

// A source-only UI handoff. It never grants permissions, saves or starts a run.
export function receiveSidebarDraft({message,sender,windowId,sidebarSurface,api,receiveDraft}) {
  if(message?.protocol!=='opendesk.sidebar.draft-import.v1' || !sidebarSurface ||
    sender?.id!==api.runtime.id || !sender.tab || sender.tab.incognito ||
    !Number.isSafeInteger(windowId) || sender.tab.windowId!==windowId)return;
  try {
    const sourceUrl=new URL(sender.url),toolUrl=new URL(api.runtime.getURL('ui/tool.html'));
    if(sourceUrl.protocol!==toolUrl.protocol || sourceUrl.host!==toolUrl.host || sourceUrl.pathname!==toolUrl.pathname)return;
    const applied = receiveDraft(message.draft ?? message.sourceUtf8);
    if (applied?.then) return applied.then(() => ({ok:true}),error =>
      ({ok:false,error:{code:error.code || 'E_DRAFT_IMPORT',message:error.message || String(error)}}));
    return {ok:true};
  }catch(error){return {ok:false,error:{code:error.code || 'E_DRAFT_IMPORT',message:error.message || String(error)}};}
}

export function initToolShell(installDevelopment=null,{debugEnabled=false}={}) {
  const hostUrl = new URL(location.href);
  const hostInstanceId = hostUrl.searchParams.get('hostInstanceId');
  if (!hostInstanceId) {
    // Commit a new sender identity, preserving only a validated installed-tool
    // locator. Clearing all search parameters used to erase toolId on first load.
    location.replace(canonicalToolHostUrl(hostUrl.href,crypto.randomUUID()));
    return;
  }
  const foundationClient = createHostClient(chrome, {hostInstanceId});
const currentPageTarget = createCurrentPageTarget({api:chrome});
const historyUI=globalThis.__opendeskTrustedHistoryUI;
if(!historyUI?.createScheduledTaskHost)throw new Error('E_TRUSTED_SCHEDULE_HOST_MISSING');
const createScheduledTaskHost=historyUI.createScheduledTaskHost;
if(!historyUI?.createCloudHosting)throw new Error('E_TRUSTED_CLOUD_UI_MISSING');
const createCloudHosting=historyUI.createCloudHosting;
historyUI?.mount(document);
const trustedHistoryWorkbench=historyUI?.create({api:chrome,doc:document,hostInstanceId})??Object.freeze({dispose(){}});
window.addEventListener('pagehide',()=>trustedHistoryWorkbench.dispose(),{once:true});
const cookieUI=globalThis.__opendeskTrustedCookieUI;
 if(!cookieUI?.create)console.warn('E_TRUSTED_COOKIE_UI_UNAVAILABLE');
 const trustedCookieWorkbench=cookieUI?.create
  ?cookieUI.create({api:chrome,currentPageTarget,doc:document,hostInstanceId})
  :Object.freeze({dispose(){}});
window.addEventListener('pagehide',()=>trustedCookieWorkbench.dispose(),{once:true});
const scriptEditor = createScriptEditor({client:foundationClient,currentPageTarget,development:Boolean(installDevelopment)});
let debugWorkbench=null;
// The full-size tool/catalog page must never overwrite the Side Panel's last tab.
const tabMemory=createSidebarTabMemory({
  storage:chrome.storage.local,
  debugEnabled,
  getActiveTab:()=>document.documentElement.dataset.opendeskTab,
  selectTab:view=>taskWorkbench.navigate(view),
  onError:error=>console.warn('Sidebar tab preference unavailable',error)
});
let scheduleUI=null,scheduleHost=null;
const taskWorkbench = createTaskWorkbench({client:foundationClient,host:scriptEditor.host,currentPageTarget,
  importDraft:sourceUtf8=>scriptEditor.importDraft(sourceUtf8),executionSource:scriptEditor.executionSource,
  onTaskInstalled:taskId=>void scheduleUI?.onInstalled(taskId),
  debugEnabled,onNavigate:view=>{if(view==='debug')void debugWorkbench?.refresh();},
  onTabSelected:(view,options)=>tabMemory.record(view,options)});
const workflowView=createWorkflowView({api:chrome,client:foundationClient,host:scriptEditor.host,currentPageTarget,
  onRunOwner:id=>taskWorkbench.setWorkflowRunOwner(id),
  openDeveloper:sourceUtf8=>taskWorkbench.receiveDraft(sourceUtf8),
  openCatalog:()=>taskWorkbench.navigate('catalog')});
const sidebarTools=createSidebarTools({api:chrome,currentPageTarget,taskWorkbench,foundationClient});
const installedPageTools=createInstalledPageTools({client:foundationClient,api:chrome,doc:document});
const scheduleStatus=message=>{
  for(const id of ['schedule-host-status','schedule-runner-host-status']){
    const label=document.getElementById(id);
    if(label)label.textContent=message;
  }
};
scheduleUI=createScheduledTaskWorkbench({client:foundationClient,host:scriptEditor.host,taskWorkbench,
  api:chrome,document,onOpen:()=>scheduleStatus(scheduleHost?
    '宿主已连接；到期时将通过现有执行槽运行':'没有活动运行页')});
function startScheduledHost(){
  if(scheduleHost)return;
  scheduleHost=createScheduledTaskHost({client:foundationClient,host:scriptEditor.host,api:chrome,
    onStatus:scheduleStatus,
    onChange:()=>{if(scheduleUI?.shown)void scheduleUI.refresh().catch(()=>{});},
    onRun:runId=>scheduleUI?.setRun(runId)});
}

// A full catalog/tool tab also loads tool.html. It must never become a second
// cloud-claiming Host merely because the extension's trusted UI is open.
let cloudHosting=null;
debugWorkbench=debugEnabled?createDebugWorkbench({client:foundationClient,host:scriptEditor.host}):null;
window.addEventListener('pagehide',()=>cloudHosting?.dispose(),{once:true});
taskWorkbench.connectToolsView((visible,destination)=>{
  const accepted=sidebarTools.setVisible(visible,destination);
  if(visible)void installedPageTools.refresh();
  return accepted;
});
const pageRefresh=document.getElementById('installed-page-tools-refresh');
pageRefresh?.addEventListener('click',()=>void installedPageTools.refresh());
const nativeAgentHost=createNativeAgentHostAdapter({client:foundationClient,host:scriptEditor.host,currentPageTarget});
scriptEditor.connectLocalProjects(nativeAgentHost,{onInstalled:({kind,id})=>{
  if(kind==='controller'){
    void scheduleUI?.onInstalled(id);
    void taskWorkbench.refresh().then(()=>taskWorkbench.focusInstalledTask(id)).catch(console.warn);
  }else{
    taskWorkbench.navigate('tools');
    void installedPageTools.refresh();
  }
}});
const disposeDevelopment=installDevelopment?.({api:chrome,prepareReload:async()=>
  !sidebarTools.isDirty()&&nativeAgentHost.developmentIdle()&&await scriptEditor.prepareDevelopmentReload()&&nativeAgentHost.developmentIdle()});
let sidebarSurface=false, draftImportAttached=false;
const draftImportListener=(message,sender,sendResponse)=>{
  const response=receiveSidebarDraft({message,sender,windowId:currentPageTarget.snapshot.windowId,sidebarSurface,
    api:chrome,receiveDraft:sourceUtf8=>taskWorkbench.receiveDraft(sourceUtf8)});
  if(response?.then) {response.then(sendResponse);return true;}
  if(response)sendResponse(response);
  return false;
};
chrome.runtime.onMessage.addListener(draftImportListener);draftImportAttached=true;
/* The same authorized tool.html can be opened in a full Chrome tab.
 * A tab is the complete local catalog; the Side Panel stays lightweight.
 * No new document allowlist, authority, or storage instance is introduced.
 */
Promise.resolve(chrome.tabs.getCurrent?.()).then(async tab => {
  // Native Chrome context identity wins over tab-like heuristics; this keeps
  // the visible Developer/Tools tabs in a genuine Side Panel and prevents
  // catalog-only layout from hiding them after an asynchronous reclassification.
  const actualSidePanel=await isActualSidePanelContext({api:chrome,href:hostUrl.href});
  if(actualSidePanel||!tab?.id){
    sidebarSurface=true;
    cloudHosting=createCloudHosting({client:foundationClient,host:scriptEditor.host});
    startScheduledHost();
    void tabMemory.restore().catch(error=>console.warn('Sidebar tab restoration unavailable',error));
    return;
  }
  if(hostUrl.searchParams.get('scheduledRunner')==='1'){
    document.documentElement.dataset.opendeskSurface='scheduled-runner';
    taskWorkbench.navigate('tasks');
    startScheduledHost();
    void scheduleUI.open('runner').catch(error=>console.warn('Visible runner page',error));
    return;
  }
  const toolId=requestedToolId(hostUrl.href),previewId=requestedPreviewId(hostUrl.href);
  if(!toolId&&!previewId){
    taskWorkbench.showCatalogPage();
    const opener=document.getElementById('catalog-open-dev-sidebar');
    const status=document.getElementById('catalog-dev-sidebar-status');
    if(opener)listen(opener,'click',event=>{
      if(!event.isTrusted||opener.disabled)return;
      // An actual user gesture opens the ORIGINAL Side Panel in this window.
      // No new host authority, tab permission or extension page is created.
      const windowId=currentPageTarget.windowId;
      if(!Number.isSafeInteger(windowId)||typeof chrome.sidePanel?.open!=='function'){
        status.textContent='无法打开侧栏，请从 Chrome 扩展按钮打开 OpenDesk';
        return;
      }
      opener.disabled=true;status.textContent='正在打开侧栏…';
      let request;
      try{request=chrome.sidePanel.open({windowId});}
      catch(error){status.textContent='侧栏不可用：'+(error.message||error);opener.disabled=false;return;}
      Promise.resolve(request).then(()=>{status.textContent='已打开侧栏，请选择「开发」';},
        error=>{status.textContent='侧栏不可用：'+(error.message||error);})
        .finally(()=>{opener.disabled=false;});
    });
    return;
  }
  document.documentElement.dataset.opendeskSurface='tool-page';
  taskWorkbench.navigate('tools');
  if(previewId){
    try{
      const key=previewStorageKey(previewId);
      const row=(await chrome.storage.session.get(key))[key];
      const preview=validatePreviewSession(row,previewId);
      await sidebarTools.ready;
      sidebarTools.openReadOnlyPreview(preview.tool);
      await chrome.storage.session.remove(key);
    }catch(error){
      const target=document.getElementById('sidebar-tool-status');
      target.textContent='预览不存在、已失效或加载失败：'+String(error.message||error).slice(0,160);
      target.hidden=false;target.dataset.state='error';
    }
    return;
  }
  await sidebarTools.ready;
  sidebarTools.openTool(toolId);
}).catch(error => console.warn('Tool tab surface unavailable',error));
// Native menu launch context is never posted to the sandbox. The trusted host
// binds a one-shot ticket to the exact iframe instance first.
let lastMenuTicket='',menuOpening=false;
async function receiveMenuLaunch(){
  if(menuOpening)return;
  const tab=await chrome.tabs.getCurrent?.();
  if(tab?.id)return; // A context menu opens its window's Side Panel, not arbitrary tool tabs.
  const stored=(await chrome.storage.session.get(BROWSER_MENU_LAUNCH_STORE))[BROWSER_MENU_LAUNCH_STORE]||{};
  const windowId=currentPageTarget.snapshot?.windowId ??
    (await chrome.windows.getCurrent()).id;
  const row=Object.values(stored).filter(value=>value?.state==='pending'&&!value.boundTo&&
    value.windowId===windowId&&Date.now()<value.expiresAt).sort((a,b)=>b.issuedAt-a.issuedAt)[0];
  if(!row||row.ticketId===lastMenuTicket)return;
  lastMenuTicket=row.ticketId;menuOpening=true;
  let binding=null;
  try{
    await sidebarTools.ready;
    if(taskWorkbench.navigate('tools')===false)return;
    // A trusted gate prevents sandbox JS starting before launch.bind ACK.
    // Bind failures never publish sensitive selection to the iframe.
    const launchGate=new Promise((resolve,reject)=>{binding={resolve,reject};});
    void launchGate.catch(()=>{}); // A detached iframe still leaves a settled gate.
    const token=sidebarTools.openTool(row.toolId,{launchGate});
    if(!token)throw new Error('目标工具未启用、已切换或无法启动');
    const result=await chrome.runtime.sendMessage({protocol:BROWSER_HOST_PROTOCOL,kind:'host',
      operation:'browser.launch.bind',hostInstanceId,toolId:row.toolId,
      launchId:row.ticketId,toolInstance:token});
    if(!result?.ok)throw Object.assign(new Error(result?.error?.message||'右键启动绑定失败'),
      {code:result?.error?.code||'E_BROWSER'});
    binding.resolve();
  }catch(error){
    binding?.reject(error);
    console.warn('OpenDesk menu launch',error);
  }finally{menuOpening=false;}
}
const onMenuLaunchChanged=(changes,area)=>{
  if(area==='session'&&Object.hasOwn(changes,BROWSER_MENU_LAUNCH_STORE))
    void receiveMenuLaunch().catch(error=>console.warn('Menu delivery',error));
};
chrome.storage.onChanged.addListener(onMenuLaunchChanged);
void receiveMenuLaunch().catch(error=>console.warn('Menu startup',error));
const listeners = [];
let browserListenersAttached = false;
const listen = (element, event, listener, options) => {
  element.addEventListener(event, listener, options); listeners.push({element, event, listener, options});
};
const accessStatus=document.querySelector('#site-access-status');
const accessGrant=document.querySelector('#site-access-grant');
const accessRecovery=document.querySelector('#site-access-recovery');
const accessRestore=document.querySelector('#site-access-restore');
let siteAccessView={phase:'checking',message:'正在查询 Chrome 网站权限',snapshot:null,busy:false};
function renderSiteAccess(view=siteAccessView){
  siteAccessView=view;
  accessStatus.dataset.state=view.phase;
  accessStatus.textContent=view.message+(view.snapshot
    ? `（Cookie：${view.snapshot.cookies?'已授权':'未授权'}；通知：${view.snapshot.notifications?'已授权':'未授权'}）` : '');
  const satisfied=view.snapshot?.websites===true;
  accessGrant.disabled=view.busy||!view.snapshot||satisfied;
  accessGrant.textContent=satisfied?'全部网站已授权':'恢复全部网站访问';
  accessRecovery.hidden=view.snapshot?.websites!==false;
  accessRestore.disabled=view.busy||!view.snapshot||satisfied;
  accessRestore.textContent=view.busy?'正在恢复访问…':'恢复全部网站访问';
}
const siteAccess=createSiteAccess({api:chrome,onState:renderSiteAccess});
for(const button of [accessGrant,accessRestore])listen(button,'click',event=>{
  // permissions.request must be invoked synchronously in a trusted click.
  siteAccess.grant(event).catch(error=>
    console.warn('Chrome site access not granted',error));
});
listen(document.querySelector('#site-access-refresh'),'click',()=>
  siteAccess.refresh().catch(error=>console.warn('Chrome site access refresh failed',error)));
siteAccess.refresh().catch(error=>console.warn('Chrome site access check failed',error));

Object.defineProperty(globalThis, 'OpenDeskResourceDiagnostics', {value: Object.freeze({
  snapshot: () => snapshotToolResources(scriptEditor.resourceSnapshot(),
    {subscriptions: listeners.length + 2 * Number(browserListenersAttached) + Number(draftImportAttached) + currentPageTarget.resourceSnapshot().subscriptions})
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
  let pattern,url;
  try { url=document.querySelector('#target-url').value;pattern=permissionPattern(url); } catch (error) { display(error); return; }
  action(async () => {
    await requireChromePermissions({api:chrome,request:{origins:[pattern]}});
    return request('CREATE_HEALTH_TARGET', {url});
  });
});
listen(document.querySelector('#check-source'), 'click', () => action(() => request('CHECK_SOURCE')));
listen(document.querySelector('#check-target'), 'click', () => action(() => request('CHECK_HEALTH', {target})));
const sdkTab = document.querySelector('#sdk-tab');
const sdkDocument = document.querySelector('#sdk-document');
const sdkInstall = document.querySelector('#sdk-install');
const sdkInspect = document.querySelector('#sdk-inspect');
const sdkRevoke = document.querySelector('#sdk-revoke');
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
let sdkDocuments = new Map(), sdkSelectionVersion = 0, sdkBusy = false, autoLabPreset = null;
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
  sdkInspect.disabled = sdkBusy || !sdkDocuments.has(sdkDocument.value);
  sdkRevoke.disabled = sdkBusy || !sdkApproval.currentGrant;
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
// Preselect ONLY the exact, local first-party demo. This is input convenience,
// not background authorization, an SDK install or an HTTP request.
function sdkDocumentChanged() {
  const doc = sdkDocuments.get(sdkDocument.value);
  const preset = doc?.frameId === 0 ? sdkHttpLabPreset(doc.url) : null;
  const network = sdkCapabilities.querySelector('input[value="network"]');
  if (!preset && autoLabPreset && sdkTargets.value === autoLabPreset.targetText &&
      selectedCapabilities().length === 1 && selectedCapabilities()[0] === 'network') {
    sdkTargets.value = ''; if (network) network.checked = false;
  }
  autoLabPreset = null;
  if (preset && !sdkTargets.value.trim() && selectedCapabilities().length === 0 &&
      network && !network.disabled) {
    network.checked = true;
    sdkTargets.value = preset.targetText;
    autoLabPreset = preset;
  }
  sdkInputsChanged();
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
  const demoTabs = [];
  for (const tab of tabs) {
    if (tab.incognito || !Number.isInteger(tab.id) || !/^https?:\/\//.test(tab.url || '')) continue;
    sdkTab.append(new Option(`[${tab.id}] ${tab.title || tab.url} — ${tab.url}`, String(tab.id)));
    if (sdkHttpLabPreset(tab.url)) demoTabs.push(tab);
  }
  const demo = demoTabs.find(tab => tab.active) || demoTabs[0];
  if (demo) {
    sdkTab.value = String(demo.id);
    await refreshSdkDocuments();
  } else sdkDisplay('idle', '请选择网页、当前文档和服务');
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
  const root = [...sdkDocuments.values()].find(doc => doc.frameId === 0);
  if (root) {
    sdkDocument.value = root.documentId;
    sdkDocumentChanged();
  }
  sdkDisplay('idle', autoLabPreset
    ? '已预填本地 HTTP 实验页的 network 与目标 Origin；请核对后点击明确批准并安装（尚未授权或发送 HTTP）'
    : root ? '已选择当前主文档；请核对并选择要授权的服务' : '没有可自动选择的当前 HTTP(S) 主文档');
}
foundationClient.ready.catch(sdkError);
listen(document.querySelector('#sdk-refresh'), 'click', () => refreshSdkTabs().catch(sdkError));
listen(sdkTab, 'change', () => refreshSdkDocuments().catch(sdkError));
listen(sdkDocument, 'change', sdkDocumentChanged);
listen(sdkCapabilities, 'change', () => {autoLabPreset = null; sdkInputsChanged();});
listen(sdkTargets, 'input', () => {autoLabPreset = null; sdkInputsChanged();});
listen(sdkInstall, 'click', event => {
  if (!event.isTrusted || sdkBusy || sdkInstall.disabled) return;
  // Permissions are requested synchronously by the approved snapshot handler.
  sdkApproval.approve(event).catch(error => {
    console.warn('SDK approval was not confirmed', error);
  });
});
listen(sdkInspect, 'click', event => {
  if (!event.isTrusted || sdkBusy || sdkInspect.disabled) return;
  sdkApproval.inspectGrant().catch(error=>console.warn('SDK grant inspection was not confirmed',error));
});
listen(sdkRevoke, 'click', event => {
  if (!event.isTrusted || sdkBusy || sdkRevoke.disabled) return;
  sdkApproval.revoke(event).catch(error=>console.warn('SDK grant revocation was not confirmed',error));
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
  disposeDevelopment?.();
  chrome.runtime.onMessage.removeListener(draftImportListener);draftImportAttached=false;sidebarSurface=false;
  chrome.storage.onChanged.removeListener(onMenuLaunchChanged);
  chrome.webNavigation.onCommitted.removeListener(sdkNavigation); chrome.tabs.onRemoved.removeListener(sdkTabRemoved);
  chrome.permissions.onRemoved.removeListener(sdkPermissionsRemoved); sdkApproval.dispose();
  browserListenersAttached = false;
  for (const {element, event, listener, options} of listeners) element.removeEventListener(event, listener, options);
  listeners.length = 0;
  scheduleHost?.dispose();scheduleUI?.dispose();
  tabMemory.dispose(); debugWorkbench?.dispose(); workflowView.dispose(); installedPageTools.dispose(); sidebarTools.dispose(); nativeAgentHost.dispose(); siteAccess.dispose(); taskWorkbench.dispose(); scriptEditor.dispose(); currentPageTarget.dispose(); foundationClient.dispose();
}, {once: true});

}
