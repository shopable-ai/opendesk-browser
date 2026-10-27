import {createDeveloperHostControls} from './develop-host-controls.js';
import {createDebugWorkbench} from './debug-workbench.js';
import {BROWSER_HOST_PROTOCOL,BROWSER_MENU_LAUNCH_STORE} from '../framework/sdk/browser-contract.js';
import {createHostClient} from '../platform/host/client.js';
import {createScriptEditor} from './script-editor.js';
import {createRunHost} from '../run-host.js';
import {snapshotToolResources} from './resource-diagnostics.js';
import {createCurrentPageTarget} from './current-page-target.js';
import {createSidebarTabMemory} from './sidebar-tab-memory.js';
import {createWorkflowView} from './workflow/workflow-view.js';
import {createSharedAIProviderRuntime} from './ai/provider-runtime.js';
import {createBusinessConversation} from './conversation/provider-consumer.js';
import {createTrustedKnowledgeHost} from '../../examples/sidebar-tools/ai-knowledge-answers/trusted/host.js';
import {createSidebarTools} from './sidebar-tools-loader.js';
import {createPanelToolIntentReceiver} from './sidebar-tools/panel-tool-intent.js';
import {createMarketInstallSheet} from './market-install-sheet.js';
import {createExtensionCenter} from './extension-center.js';
import {mountSidebarApp} from './react/main.tsx';
import {createDeveloperView} from './develop-view.js';
import {createMyWorkbenchView} from './my-workbench-view.js';
import {createMyTaskAgent} from './my-task-agent.js';
import {createSidebarToolsView} from './sidebar-tools-view.js';
import {TRUSTED_BOOKMARK_COMPONENT_VERSION} from './trusted-bookmark-admission.js';
import {isActualSidePanelContext} from './sidepanel-context.js';
import {ANALYTICS_PROTOCOL} from '../analytics/contract.js';
import {createUiLocaleController} from './app-localization.js';
import {createToolLocaleService} from './sidebar-tools/locale-packs.js';
import {requestedToolId,requestedPreviewId,canonicalToolHostUrl} from './sidebar-tools/navigation.js';
import {subscribePreviewSession} from './sidebar-tools/live-preview.js';
import {createToolDevelopmentControls} from './sidebar-tools/development-controls.js';
import {createNativeAgentHostAdapter} from '../native-agent/host-adapter.js';
import {AGENT_CONFIG_PROTOCOL} from '../native-agent/protocol.js';
import {createChatGPTFixedBridgeHost} from '../native-agent/chatgpt-fixed-bridge-host.js';
import {CHATGPT_BRIDGE_PROTOCOL} from '../native-agent/chatgpt-bridge-trigger-gate.js';
import {SIDEPANEL_DOCUMENT_PATH} from '../tool-document-url.js';
import {isToolSender} from '../environment.js';

// The Side Panel and full-size tool/catalog share the official document.
// Chrome can expose a tab-like current context in some builds; classify the
// exact current document positively before choosing the catalog-only UI.
// Match the full hostInstanceId URL, not just the extension origin/path.
export {isActualSidePanelContext};

// A source-only UI handoff. It never grants permissions, saves or starts a run.
export function receiveSidebarDraft({message,sender,windowId,sidebarSurface,api,receiveDraft}) {
  if(message?.protocol!=='opendesk.sidebar.draft-import.v1' || !sidebarSurface ||
    sender?.id!==api.runtime.id || !sender.tab || sender.tab.incognito ||
    !Number.isSafeInteger(windowId) || sender.tab.windowId!==windowId)return;
  try {
    if(!isToolSender(api,sender)||!new URL(sender.url).searchParams.has('hostInstanceId'))return;
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
  // The trusted Host shell, not any business View, owns Provider resources.
  const providerRuntime=createSharedAIProviderRuntime({client:foundationClient,hostInstanceId});
  // React receives only the public settings surface, never configuration() or Provider Lease authority.
  const providerSettings=Object.freeze({
    settingsSnapshot:providerRuntime.settingsSnapshot,
    subscribeSettings:providerRuntime.subscribeSettings,
    updateSettings:providerRuntime.updateSettings
  });
 const localeController=createUiLocaleController(chrome);
 const toolLocaleService=createToolLocaleService({api:chrome});
const currentPageTarget = createCurrentPageTarget({api:chrome});
const historyUI=globalThis.__opendeskTrustedHistoryUI;
if(!historyUI?.createScheduledTaskHost)throw new Error('E_TRUSTED_SCHEDULE_HOST_MISSING');
const createScheduledTaskHost=historyUI.createScheduledTaskHost;
if(!historyUI?.createCloudHosting)throw new Error('E_TRUSTED_CLOUD_UI_MISSING');
const createCloudHosting=historyUI.createCloudHosting;
if(!historyUI?.createTaskWorkbench||!historyUI?.createScheduledTaskWorkbench)
  throw new Error('E_TRUSTED_TASK_UI_MISSING');
const {createTaskWorkbench,createScheduledTaskWorkbench}=historyUI;
let trustedHistoryWorkbench=null,shellClosed=false,verifiedSidePanel=false,panelToolIntents=null,livePreview=null,toolDevelopmentControls=null,marketInstallSheet=null;
// Do not construct or query the privileged History controller while Extensions
// (or any ordinary tab) is active. Leaving Debug also clears private results.
function syncTrustedHistory(view=pendingReactTab){
  if(shellClosed)return;
  if(!verifiedSidePanel||!debugEnabled||view!=='debug'){
    trustedHistoryWorkbench?.dispose();
    trustedHistoryWorkbench=null;
    return;
  }
  if(!trustedHistoryWorkbench)
    trustedHistoryWorkbench=historyUI?.create({api:chrome,hostInstanceId,reactUI:extensionList})??null;
}
window.addEventListener('pagehide',()=>{shellClosed=true;trustedHistoryWorkbench?.dispose();},{once:true});
const developerView=createDeveloperView();
const myView=createMyWorkbenchView();
  const toolView=createSidebarToolsView();
const sharedRunHost=createRunHost({api:chrome,client:foundationClient,document,templateModuleFactory:null});
const scriptEditor = createScriptEditor({client:foundationClient,currentPageTarget,sharedRunHost,
  development:Boolean(installDevelopment),view:developerView});
let debugWorkbench=null;
let extensionList=null,reactNavigationRequest=null,pendingReactTab='tasks';
const reactNavigation=Object.freeze({
  ownsPages:true,
  connect(handler){
    if(reactNavigationRequest||typeof handler!=='function')
      throw new Error('E_REACT_NAVIGATION_ACTION_OWNER');
    reactNavigationRequest=handler;
  },
  select(view){
    pendingReactTab=view;
    extensionList?.renderNavigation(view);
    syncTrustedHistory(view);
  }
});
// The full-size tool/catalog page must never overwrite the Side Panel's last tab.
const tabMemory=createSidebarTabMemory({
  storage:chrome.storage.local,
  debugEnabled,
  getActiveTab:()=>document.documentElement.dataset.opendeskTab,
  selectTab:view=>taskWorkbench.navigate(view),
  onError:error=>console.warn('Sidebar tab preference unavailable',error)
});
let scheduleUI=null,scheduleHost=null;
// Same trusted Native Agent settings authority as the packaged Options page.
// The permission prompt starts synchronously from the user's Switch gesture.
const nativeConnection=Object.freeze({
  async readStatus(){
    const reply=await chrome.runtime.sendMessage({protocol:AGENT_CONFIG_PROTOCOL,type:'status'});
    if(!reply?.ok)throw Object.assign(new Error(reply?.error?.message||'连接状态读取失败'),
      {code:reply?.error?.code||'E_NATIVE_STATUS'});
    if(typeof reply.data?.enabled!=='boolean'||typeof reply.data?.nativeConnected!=='boolean')
      throw new Error('本机连接状态回执无效');
    return reply.data;
  },
  async setEnabled(shouldEnable){
    if(typeof shouldEnable!=='boolean')throw new Error('本机连接设置无效');
    if(shouldEnable){
      const permission=chrome.permissions.request({permissions:['nativeMessaging']});
      if(!await permission)throw new Error('未授予本机连接权限，保持原设置');
    }
    const reply=await chrome.runtime.sendMessage({protocol:AGENT_CONFIG_PROTOCOL,
      type:shouldEnable?'enable':'disable'});
    if(!reply?.ok)throw Object.assign(new Error(reply?.error?.message||'本机连接修改失败'),
      {code:reply?.error?.code||'E_NATIVE_CONFIG'});
    return reply.data;
  }
});
// Create the complete interface before controllers attach their real hosts.
extensionList=mountSidebarApp(document,{debugEnabled,developerView,myView,toolView,providerSettings,
  nativeConnection,
  openNativeSettings:()=>chrome.tabs.create({url:chrome.runtime.getURL('native-agent/settings.html')}),
  onNavigate:view=>reactNavigationRequest?.(view)??false});
const taskWorkbench = createTaskWorkbench({client:foundationClient,host:scriptEditor.host,currentPageTarget,
  importDraft:sourceUtf8=>scriptEditor.importDraft(sourceUtf8),executionSource:scriptEditor.executionSource,
  onTaskInstalled:taskId=>void scheduleUI?.onInstalled(taskId),
  debugEnabled,onNavigate:view=>{if(view==='debug')void debugWorkbench?.refresh();},
  onTabSelected:(view,options)=>tabMemory.record(view,options),
  reactNavigation,myView,developerView});
extensionList.renderNavigation(pendingReactTab);
// R1.2 is one business adapter on the existing trusted Client and exact RunHost.
// Only the positively verified Side Panel in the source tab's window responds.
const fixedPageChatBridge=createChatGPTFixedBridgeHost({api:chrome,client:foundationClient,
  host:scriptEditor.host,currentPageTarget,
  isVerifiedSidePanel:()=>verifiedSidePanel&&!shellClosed});
const fixedPageChatBridgeListener=(message,sender,sendResponse)=>{
  if(message?.protocol!==CHATGPT_BRIDGE_PROTOCOL||!['execute','cancel','check-delivery','list-tasks','prepare-task','adopt-task','authorize-task','show-execution-page'].includes(message.kind)||
    !verifiedSidePanel||shellClosed||
    sender?.tab?.windowId!==currentPageTarget.snapshot?.windowId)return false;
  Promise.resolve().then(()=>message.kind==='list-tasks'?fixedPageChatBridge.listTasks(message,sender):
    message.kind==='show-execution-page'?fixedPageChatBridge.showExecutionPage(message,sender):
    message.kind==='adopt-task'?fixedPageChatBridge.adoptTask(message,sender):
    message.kind==='authorize-task'?fixedPageChatBridge.authorizeTask(message,sender):
    message.kind==='prepare-task'?fixedPageChatBridge.prepareTask(message,sender):message.kind==='check-delivery'?
    fixedPageChatBridge.checkDelivery(message,sender):message.kind==='cancel'?
    fixedPageChatBridge.cancel(message,sender):fixedPageChatBridge.handle(message,sender)).then(
    data=>sendResponse({ok:true,data}),
    error=>sendResponse({ok:false,error:{code:error?.code||'E_BRIDGE_FAILURE',
      message:error?.message||'受信任务调用未能完成，未知结果不会重放'}}));
  return true;
};
chrome.runtime.onMessage.addListener(fixedPageChatBridgeListener);
// Installed extensions retain their existing sandbox and SDK Hosts.
let workflowView=null,promptConversation=null,bookmarkDisplayCache=null;
const sidebarTools=createSidebarTools({api:chrome,currentPageTarget,taskWorkbench,foundationClient,localeController,toolLocaleService,view:toolView,
  trustedKnowledgePilot:{enabled:true,mount:args=>{
    const conversation=createBusinessConversation({providerRuntime,api:chrome,hostInstanceId,
      consumerId:'knowledge',instanceId:args.instanceId,installEpoch:args.installEpoch});
    let host,portal;
    try{
      host=createTrustedKnowledgeHost({...args,conversation,api:chrome,currentPageTarget,
        subscribeConnection:foundationClient.subscribeWorkflowAI});
      portal=extensionList.mountKnowledgeWorkspace({container:args.container,host});
      return {...portal,invalidate:host.invalidate,
        dispose(){try{portal.dispose();}finally{host.dispose();}}};
    }catch(error){host?.dispose();conversation.dispose();throw error;}
  }},
  // Normal opens try the compiled React UI. The controller MUST still verify
  // the exact official installed package, catalog SHA, enabled state and
  // revocation epoch before mounting; other packages stay in opaque iframes.
  trustedBookmarkPilot:{
    componentVersion:TRUSTED_BOOKMARK_COMPONENT_VERSION,
    enabled:true,
    mount:args=>{
      if(!extensionList?.mountBookmarkPilot)throw new Error('E_BOOKMARK_REACT_ROOT_MISSING');
      const installEpoch=args.installEpoch??null;
      const conversation=createBusinessConversation({providerRuntime,api:chrome,hostInstanceId,
        consumerId:'bookmark',
        instanceId:args.instanceId||crypto.randomUUID(),installEpoch});
      // Preserve the historical display-only draft/transcript on re-open of
      // the SAME installation epoch, never its executable Bookmark references.
      if(bookmarkDisplayCache?.installEpoch===installEpoch)
        conversation.saveSession({...bookmarkDisplayCache.session,open:false,needsReview:false,
          refs:{folderId:null,bookmarkId:null,matches:[]}});
      try {
        const unmount=extensionList.mountBookmarkPilot({...args,conversation});
        return ()=>{try{unmount();}finally{
          const snapshot=conversation.readSession();
          bookmarkDisplayCache={installEpoch,session:{open:false,
            draft:snapshot.draft,rows:snapshot.rows,needsReview:false,
            refs:{folderId:null,bookmarkId:null,matches:[]}}};
          conversation.dispose();
        }};;
      }catch(error){conversation.dispose();throw error;}
    }
  },
  trustedPromptPilot:{
    enabled:true,
    conversation:({instanceId=crypto.randomUUID(),installEpoch=null}={})=>{
      promptConversation?.dispose();
      promptConversation=createBusinessConversation({providerRuntime,api:chrome,hostInstanceId,
        consumerId:'prompt',instanceId,installEpoch});
      return promptConversation;
    },
    releaseConversation(){
      const owned=promptConversation;promptConversation=null;owned?.dispose();
    },
    mount:args=>{
      if(!extensionList?.mountPromptConversation||!promptConversation)
        throw new Error('E_PROMPT_REACT_ROOT_MISSING');
      const owned=promptConversation;
      try {
        const portal=extensionList.mountPromptConversation({...args,conversation:owned});
        return {...portal,dispose(){
          try{portal.dispose();}finally{
            if(promptConversation===owned)promptConversation=null;
            owned.dispose();
          }
        }};
      }catch(error){if(promptConversation===owned)promptConversation=null;
        owned.dispose();throw error;}
    }
  }});
// React owns the whole page; the original workflow controller retains Authority.
workflowView=createWorkflowView({api:chrome,client:foundationClient,host:scriptEditor.host,
  providerRuntime,hostInstanceId,currentPageTarget,taskWorkbench,
  openAIProviderSettings:()=>extensionList?.openProviderSettings?.(),
  onRunOwner:id=>taskWorkbench.setWorkflowRunOwner(id),
  openDeveloper:sourceUtf8=>taskWorkbench.receiveDraft(sourceUtf8),
  openCatalog:()=>taskWorkbench.navigate('catalog')});
extensionList.connectWorkflowPage(workflowView);
const extensionCenter=createExtensionCenter({api:chrome,client:foundationClient,doc:document,sidebarTools,taskWorkbench,currentPageTarget,localeController,toolLocaleService,extensionList});
const scheduleStatus=message=>{
  for(const id of ['schedule-host-status','schedule-runner-host-status']){
    myView.setText(id,message);
  }
};
scheduleUI=createScheduledTaskWorkbench({client:foundationClient,host:scriptEditor.host,taskWorkbench,
  api:chrome,document,myView,developerView,onOpen:()=>scheduleStatus(scheduleHost?
    scheduleHost.status:'没有活动运行页')});
const myConversation=createBusinessConversation({providerRuntime,api:chrome,hostInstanceId,
  consumerId:'tasks',
  instanceId:'my-'+crypto.randomUUID()});
const myAgent=createMyTaskAgent({client:foundationClient,taskWorkbench,
  provider:myConversation,currentPageTarget,api:chrome,
  onScheduleChange:()=>void scheduleUI?.refresh().catch(error=>console.warn('AI schedule refresh',error))});
extensionList.connectMyAgent(myAgent);
function startScheduledHost(){
  if(shellClosed||scheduleHost)return;
  scheduleHost=createScheduledTaskHost({client:foundationClient,host:scriptEditor.host,api:chrome,
    onStatus:scheduleStatus,
    onChange:()=>{if(scheduleUI?.shown)void scheduleUI.refresh().catch(()=>{});},
    onRun:runId=>scheduleUI?.setRun(runId)});
}

// A full catalog/tool tab also loads the official document. It must never become a second
// cloud-claiming Host merely because the extension's trusted UI is open.
let cloudHosting=null;
debugWorkbench=debugEnabled?createDebugWorkbench({client:foundationClient,host:scriptEditor.host,reactUI:extensionList}):null;
window.addEventListener('pagehide',()=>cloudHosting?.dispose(),{once:true});
taskWorkbench.connectToolsView((visible,destination)=>{
  const accepted=sidebarTools.setVisible(visible,destination);
  if(visible&&accepted!==false){
    void extensionCenter.refresh();
  }
  return accepted;
});
const nativeAgentHost=createNativeAgentHostAdapter({client:foundationClient,host:scriptEditor.host,currentPageTarget});
scriptEditor.connectLocalProjects(nativeAgentHost,{onInstalled:({kind,id})=>{
  if(shellClosed)return;
  if(kind==='controller'){
    void scheduleUI?.onInstalled(id);
    void taskWorkbench.refresh().then(()=>{if(!shellClosed)taskWorkbench.focusInstalledTask(id);}).catch(console.warn);
  }else{
    taskWorkbench.navigate('tools');
    void extensionCenter.refresh();
  }
}});
const disposeDevelopment=installDevelopment?.({api:chrome,onStatus:value=>extensionList.renderDevelopmentStatus(value),prepareReload:async()=>
  !sidebarTools.isDirty()&&nativeAgentHost.developmentIdle()&&await scriptEditor.prepareDevelopmentReload()&&nativeAgentHost.developmentIdle()});
let sidebarSurface=false, draftImportAttached=false;
const draftImportListener=(message,sender,sendResponse)=>{
  if(shellClosed)return false;
  const response=receiveSidebarDraft({message,sender,windowId:currentPageTarget.snapshot.windowId,sidebarSurface,
    api:chrome,receiveDraft:sourceUtf8=>{
      if(shellClosed)throw Object.assign(new Error('Sidebar 已关闭'),{code:'E_HOST_CLOSED'});
      return taskWorkbench.receiveDraft(sourceUtf8);
    }});
  if(response?.then) {response.then(sendResponse);return true;}
  if(response)sendResponse(response);
  return false;
};
chrome.runtime.onMessage.addListener(draftImportListener);draftImportAttached=true;
/* The same authorized sidepanel.html can be opened in a full Chrome tab.
 * A tab is the complete local catalog; the Side Panel stays lightweight.
 * No new document allowlist, authority, or storage instance is introduced.
 */
Promise.resolve(chrome.tabs.getCurrent?.()).then(async tab => {
  if(shellClosed)return;
  // Native Chrome context identity wins over tab-like heuristics; this keeps
  // the visible Developer/Tools tabs in a genuine Side Panel and prevents
  // catalog-only layout from hiding them after an asynchronous reclassification.
  const actualSidePanel=await isActualSidePanelContext({api:chrome,href:hostUrl.href});
  if(shellClosed)return;
  if(actualSidePanel||!tab?.id){
    sidebarSurface=true;
    if(actualSidePanel){
      verifiedSidePanel=true;
      // Count a verified Side Panel document, never React renders or SW wakeups.
      // The trusted collector deduplicates this canonical hostInstanceId on reload.
      try{void Promise.resolve(chrome.runtime.sendMessage({
        protocol:ANALYTICS_PROTOCOL,kind:'event.host_report',
        event:'app.opened',toolId:'opendesk',channel:'sidepanel'
      })).catch(()=>{});}catch{/* Telemetry must never break the panel. */}
      syncTrustedHistory(pendingReactTab);
    }
    cloudHosting=createCloudHosting({client:foundationClient,host:scriptEditor.host,reactUI:extensionList,
      currentPageTarget,onTaskInstalled:taskId=>{
        void taskWorkbench.refresh().catch(error=>console.warn('Task catalog refresh after Cloud installation',error));
        void scheduleUI?.onInstalled(taskId);
      },
      onManageTasks:()=>taskWorkbench.navigate('tasks'),
       onReviewCandidates:()=>taskWorkbench.navigate('catalog'),
      onOpenRun:async runId=>{
        if(taskWorkbench.navigate('develop')===false)return;
        await scriptEditor.openRun(runId);
      }});
    startScheduledHost();
    await tabMemory.restore().catch(error=>console.warn('Sidebar tab restoration unavailable',error));
    if(shellClosed)return;
    if(actualSidePanel){
      await sidebarTools.ready;
      if(shellClosed)return;
      marketInstallSheet=createMarketInstallSheet({api:chrome,view:toolView,
        assertCanInstall:id=>sidebarTools.assertCanInstallMarketTool(id),
        hasOtherReview:()=>sidebarTools.hasInstallReview()||Boolean(document.querySelector('[role="dialog"][aria-modal="true"]')),
        // The Sheet overlays the existing workspace without disposing editors.
        // A blurred search field or the Developer tab is not an editing lock.
        canAutoOpen:()=>sidebarTools.canPresentMarketReview(),
        openInstalledAppDetail:async identity=>{
          if(shellClosed||!verifiedSidePanel||!sidebarTools.canPresentMarketReview())return false;
          if(taskWorkbench.navigate('tools')===false)return false;
          return extensionCenter.openInstalledAppDetail(identity);
        }});
    }
    // The React ToolHost already renders a selected installed app. A trusted,
    // short-lived toolId locator drives its existing Host, not a second router.
    panelToolIntents=createPanelToolIntentReceiver({api:chrome,
      onOpen:async toolId=>{
        await sidebarTools.ready;
        if(shellClosed||!sidebarSurface)return;
        if(taskWorkbench.navigate('tools')===false)return;
        sidebarTools.openTool(toolId);
      },
      onError:error=>console.warn('Sidebar targeted tool navigation',error)
    });
    try{
      const currentWindow=await chrome.windows.getCurrent();
      if(!shellClosed&&Number.isSafeInteger(currentWindow?.id))
        panelToolIntents.start(currentWindow.id);
    }catch(error){console.warn('Sidebar targeted tool navigation unavailable',error);}
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
    const button=myView.field('catalog-open-dev-sidebar');
    const status=text=>myView.setText('catalog-dev-sidebar-status',text);
    myView.actions.catalogOpenSidebarClick=myView.action(event=>{
      if(shellClosed||!event.isTrusted||button.disabled)return;
      const windowId=Number.isSafeInteger(tab.windowId)?tab.windowId:currentPageTarget.windowId;
      if(!Number.isSafeInteger(windowId)||typeof chrome.sidePanel?.open!=='function'){
        status('无法打开侧栏，请从 Chrome 扩展按钮打开 OpenDesk');return;
      }
      button.disabled=true;status('正在打开侧栏…');
      let request;
      try{request=chrome.sidePanel.open({windowId});}
      catch(error){status('侧栏不可用：'+(error.message||error));button.disabled=false;return;}
      return Promise.resolve(request).then(()=>{
        if(shellClosed)return;
        status('已打开 OpenDesk 侧栏，请选择「开发」');
      },error=>{if(!shellClosed)status('侧栏不可用：'+(error.message||error));})
        .finally(()=>{if(!shellClosed)button.disabled=false;});
    });
    return;
  }
  document.documentElement.dataset.opendeskSurface='tool-page';
  taskWorkbench.navigate('tools');
  if(previewId){
    try{
      await sidebarTools.ready;
      if(shellClosed)return;
      toolDevelopmentControls=createToolDevelopmentControls({api:chrome,view:toolView,tools:sidebarTools});
      livePreview=subscribePreviewSession({api:chrome,previewId,
        mount:tool=>sidebarTools.openReadOnlyPreview(tool),
        onInvalidate:()=>toolDevelopmentControls.invalidate(),onSnapshot:value=>toolDevelopmentControls.snapshot(value),
        isActive:()=>sidebarTools.isPreviewActive(),isDirty:()=>sidebarTools.isPreviewEditing(),
        onStatus:(text,error)=>toolView.patch('sidebar-tool-readonly-banner',{
          textContent:text+'。沙箱隔离；存储调试需单独批准，网页和其他能力仍被禁止。',hidden:false,data:{state:error?'error':'readonly'}})});
      await livePreview.ready;
    }catch(error){
      if(shellClosed)return;
      toolView.patch('sidebar-tool-status',{
        textContent:'预览不存在、已失效或加载失败：'+String(error.message||error).slice(0,160),
        hidden:false,data:{state:'error'}});
    }
    return;
  }
  await sidebarTools.ready;
  if(shellClosed)return;
  sidebarTools.openTool(toolId);
}).catch(error => console.warn('Tool tab surface unavailable',error));
// Native menu launch context is never posted to the sandbox. The trusted host
// binds a one-shot ticket to the exact iframe instance first.
let lastMenuTicket='',menuOpening=false;
async function receiveMenuLaunch(){
  if(shellClosed||menuOpening)return;
  const tab=await chrome.tabs.getCurrent?.();
  if(shellClosed||tab?.id)return; // A context menu opens its window's Side Panel, not arbitrary tool tabs.
  const stored=(await chrome.storage.session.get(BROWSER_MENU_LAUNCH_STORE))[BROWSER_MENU_LAUNCH_STORE]||{};
  if(shellClosed)return;
  const windowId=currentPageTarget.snapshot?.windowId ??
    (await chrome.windows.getCurrent()).id;
  if(shellClosed)return;
  const row=Object.values(stored).filter(value=>value?.state==='pending'&&!value.boundTo&&
    value.windowId===windowId&&Date.now()<value.expiresAt).sort((a,b)=>b.issuedAt-a.issuedAt)[0];
  if(!row||row.ticketId===lastMenuTicket)return;
  lastMenuTicket=row.ticketId;menuOpening=true;
  let binding=null;
  try{
    await sidebarTools.ready;
    if(shellClosed)return;
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
    if(shellClosed)throw Object.assign(new Error('Sidebar 已关闭'),{code:'E_HOST_CLOSED'});
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
const listen = (element, event, listener, options) => {
  element.addEventListener(event, listener, options); listeners.push({element, event, listener, options});
};
const developHostControls = createDeveloperHostControls({api:chrome, client:foundationClient, view:developerView});
Object.defineProperty(globalThis, 'OpenDeskResourceDiagnostics', {value: Object.freeze({
  snapshot: () => snapshotToolResources(scriptEditor.resourceSnapshot(),
    {subscriptions: listeners.length + developHostControls.resourceSnapshot().subscriptions + Number(draftImportAttached) + currentPageTarget.resourceSnapshot().subscriptions})
})});
listen(window, 'pagehide', () => {
  fixedPageChatBridge.dispose();
  marketInstallSheet?.dispose();
  livePreview?.dispose();
  toolDevelopmentControls?.dispose();
  disposeDevelopment?.();
  chrome.runtime.onMessage.removeListener(fixedPageChatBridgeListener);
  chrome.runtime.onMessage.removeListener(draftImportListener);draftImportAttached=false;sidebarSurface=false;
  chrome.storage.onChanged.removeListener(onMenuLaunchChanged);
  delete myView.actions.catalogOpenSidebarClick;
  developHostControls.dispose();
  for (const {element, event, listener, options} of listeners) element.removeEventListener(event, listener, options);
  listeners.length = 0;
  myAgent.dispose();myConversation.dispose();scheduleHost?.dispose();scheduleUI?.dispose();
  panelToolIntents?.dispose();tabMemory.dispose(); localeController.dispose();toolLocaleService.dispose(); debugWorkbench?.dispose(); promptConversation?.dispose();workflowView.dispose();providerRuntime.dispose(); extensionCenter.dispose(); sidebarTools.dispose(); extensionList.dispose(); toolView.dispose(); nativeAgentHost.dispose(); taskWorkbench.dispose(); scriptEditor.dispose(); sharedRunHost.dispose(); developerView.dispose(); currentPageTarget.dispose(); foundationClient.dispose();
}, {once: true});

}
