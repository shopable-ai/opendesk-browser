import {patchToolField,setToolFieldAttribute,requestToolFieldEffect} from './sidebar-tools-view.js';
import {BROWSER_HOST_PROTOCOL,BROWSER_MENU_GRANTS_STORE,normalizeBrowserOperation,browserOperation} from '../framework/sdk/browser-contract.js';
import {browserTextDownloadUrl} from '../framework/sdk/browser-schemas.js';
import readingTocCatalog from '../../examples/sidebar-tools/reading-toc/trusted/locales.generated.js';
import {uiMessage,resolveUiLocale} from './app-localization.js';
import {readingTocHostText} from './reading-toc-settings-localization.js';
import {createSidePanelOpenCoordinator} from '../platform/chrome/browser-side-panel.js';
import {createChromePermissionConsent,createToolPermissionConsent} from '../platform/chrome/permission-gate.js';
import {scheduleSpecFromExpression} from '../platform/tasks/schedule-time.js';
import {PROGRAM_DRAFT_FORMAT,PROGRAM_DRAFT_V2_FORMAT,PROGRAM_DRAFT_INPUT_LIMIT} from './program-source.js';
import {PAGE_INSTALL_FORMAT,validatePageInstallPackage} from '../scripting/user-scripts/page-install-package.js';
import {validateTaskParams} from '../platform/tasks/contract.js';
import {SIDEBAR_TOOL_ENABLE_STORE,requireToolEnableRecords,sidebarToolEnabled,assertSidebarToolEnabled} from './sidebar-tools/lifecycle.js';
import {SIDEBAR_TOOL_PROTOCOL,SIDEBAR_TOOL_STORE,MAX_INSTALLED_TOOLS,SIDEBAR_TOOL_DATA_LIMITS,
  sidebarToolStorageKey,sidebarToolPackageHash,validateSidebarToolPackage} from './sidebar-tools/package.js';
import {writeVerifiedLocalValue} from './sidebar-tools/storage-state.js';
import {describeSidebarToolBackgroundPolicyChange} from './sidebar-tools/background-policy-review.js';
import {toolPageHref} from './sidebar-tools/navigation.js';
import {loadOfficialCatalog,loadOfficialTool,verifyReviewedOfficialTool,matchesOfficialRelease} from '../sidebar-tools/official-catalog.js';
import {createCookieImportIntentGate} from './sidebar-tools/cookie-import-intent.js';
import {createCookieWriteIntentGate} from './sidebar-tools/cookie-write-intent.js';
import {resumeDefaultPreinstall,DEFAULT_PREINSTALL_STORE} from '../sidebar-tools/default-preinstall.js';
import {installReviewedSidebarTool,admittedSidebarToolPackages,sameSidebarToolPackage,compareToolVersions,
  recordToolUninstall,cleanupUninstalledToolLocked,retryUninstalledToolCleanup,getPendingToolCleanups,TOOL_REVOCATION_EPOCHS_STORE,
  requireCompleteInstalledSidebarTools,setInstalledSidebarToolEnabled,MARKET_PROVENANCE_STORE} from './sidebar-tools/installation.js';
import {READING_TOC_SITE_STORE,READING_TOC_TOOL_ID,READING_TOC_PROTOCOL,TOC_CAPABILITY,
  websiteOrigin,grantedOrigins,tocSiteAllowed,tocGrantAllowed,verifyOfficialReadingToc,blockedTocOrigins,changeTocSiteAllowed,READING_TOC_PLACEMENT_PREFIX,
  READING_TOC_VISIBILITY_STORE,readingTocPageScope,readingTocDisplayState,
  changeReadingTocVisibility,READING_TOC_PAGE_RULES_STORE,readingTocPageAllowed,
  disabledTocPages,changeTocPageAllowed} from '../../examples/sidebar-tools/reading-toc/trusted/policy.js';
import {CLIP_SITE_STORE,CLIP_CAPABILITY,CLIP_PROTOCOL,CLIP_OPERATIONS,changeClipGrant} from '../../examples/sidebar-tools/web-markdown-clipper/trusted/policy.js';
import {CAPTURE_SITE_STORE,CAPTURE_CAPABILITY,KNOWLEDGE_TOOL_ID,KNOWLEDGE_CAPABILITY,KNOWLEDGE_PROTOCOL,
  KNOWLEDGE_OPERATIONS,KNOWLEDGE_WORKSPACE_PREFIX,changeCaptureGrant,chatCaptureOrigin,knowledgePackageHash} from '../knowledge/policy.js';
import {TIME_REVIEW_ID,TIME_REVIEW_CAPABILITY,TIME_REVIEW_PROTOCOL,TIME_REVIEW_OPERATIONS,timeReviewPackageHash} from '../../examples/sidebar-tools/time-review/trusted/policy.js';
import {TIME_REVIEW_KEY} from '../../examples/sidebar-tools/time-review/trusted/model.js';
import {FOCUS_ID,FOCUS_CAPABILITY} from '../../examples/sidebar-tools/stay-focus/trusted/policy.js';
import {ADBLOCK_ID,ADBLOCK_CAPABILITY} from '../../examples/sidebar-tools/adblock/trusted/policy.js';
import {AI_ID,AI_CAPABILITY} from '../../examples/sidebar-tools/ai-vip-share/trusted/policy.js';
import {PROMPT_ID,PROMPT_CAPABILITY,PROMPT_PICKER_PROTOCOL,PROMPT_PAGE_OPERATIONS,CHATGPT_ORIGIN,supportedOrigin} from '../../examples/sidebar-tools/prompt-shortcuts/trusted/policy.js';
import {createTimeReviewPermissionControls} from '../../examples/sidebar-tools/time-review/trusted/host-controls.js';
import {admitsTrustedTimeReview,TRUSTED_TIME_REVIEW_VERSION,trustedTimeReviewProvenanceChanged} from '../../examples/sidebar-tools/time-review/trusted/trusted-admission.js';
import {admitsTrustedBookmark,TRUSTED_BOOKMARK_ID,TRUSTED_BOOKMARK_VERSION,TRUSTED_BOOKMARK_COMPONENT_VERSION,
  trustedBookmarkProvenanceChanged} from './trusted-bookmark-admission.js';

// Browser SDK maxRequestBytes is a UTF-8 JSON ARGUMENT budget, not the
// whole sandbox postMessage. The host adds a bounded envelope separately.
// Never silently drop a request: the sandbox must receive a definitive error.
export function checkSidebarToolRequestBudget(message){
  let serialized;
  try{serialized=JSON.stringify(message);}catch{return {ok:false,code:'E_SCHEMA'};}
  if(typeof serialized!=='string')return {ok:false,code:'E_SCHEMA'};
  const operation=typeof message?.operation==='string'?browserOperation(message.operation):null;
  if(operation){
    let input;
    try{input=JSON.stringify(message.payload??{});}catch{return {ok:false,code:'E_SCHEMA'};}
    if(typeof input!=='string')return {ok:false,code:'E_SCHEMA'};
    const encoder=new TextEncoder();
    const inputBytes=encoder.encode(input).byteLength;
    const envelopeBytes=encoder.encode(serialized).byteLength;
    // The trusted identity/operation envelope is bounded independently of
    // the Registry argument budget; extra untrusted fields cannot inflate it.
    if(inputBytes>operation.maxRequestBytes||envelopeBytes-inputBytes>512)
      return {ok:false,code:'E_LIMIT'};
    return {ok:true};
  }
  // Keep non-Browser tool request budgets unchanged in this scoped fix.
  return serialized.length<=(
    ['browser.clipboard.writeText','browser.downloads.text','knowledge.update','knowledge.create'].includes(message.operation)
      ?170000:12000
  )?{ok:true}:{ok:false,code:'E_LIMIT'};
}

// Trusted Side Panel shell for untrusted, opaque-origin UI documents.
// No user code, markup, or CSS is ever inserted into this extension document.
export function createSidebarTools(options={}) {
  if(!options.view)throw new Error('E_SIDEBAR_TOOLS_VIEW_REQUIRED');
  return options.view.connect(()=>createSidebarToolsController(options));
}

function createSidebarToolsController({api=globalThis.chrome,doc=globalThis.document,
  currentPageTarget,taskWorkbench,foundationClient,localeController=null,lockManager=globalThis.navigator?.locks,fetcher=globalThis.fetch,trustedBookmarkPilot=null,view,trustedSettingsUI=view.trustedSettings}) {
  // Native focus controls load from an audited extension-only classic WXT entry.
  // A missing sidecar fails closed; user-owned opaque sandbox cannot supply it.
  const focus=globalThis.__opendeskStayFocusTrustedUI||null;
  const adblock=globalThis.__opendeskAdblockTrustedUI||null;
  const aiAccess=globalThis.__opendeskAiAccessTrustedUI||null;
  // A dynamic tool package cannot supply its own privileged Chrome runtime.
  function requireToolRuntime(tool){
    if(tool?.capabilities?.includes(AI_CAPABILITY)&&
      (tool.id!==AI_ID||aiAccess?.id!==AI_ID||aiAccess.capability!==AI_CAPABILITY||
       !aiAccess.operations?.includes('aiAccess.status')||
       typeof aiAccess.request!=='function'||typeof aiAccess.runTrustedOperation!=='function'||
       typeof aiAccess.createPermissionControls!=='function'||typeof aiAccess.probe!=='function'))
      throw Object.assign(new Error('当前扩展缺少 AI 智能访问可信运行能力，请升级扩展后再安装。'),
        {code:'E_TOOL_RUNTIME_UNAVAILABLE'});
    if(tool?.capabilities?.includes(ADBLOCK_CAPABILITY)&&
       (tool.id!==ADBLOCK_ID||adblock?.id!==ADBLOCK_ID||
        adblock.capability!==ADBLOCK_CAPABILITY||
        !adblock.operations?.includes('adblock.status')||
        typeof adblock.probe!=='function'||typeof adblock.request!=='function'||
        typeof adblock.runTrustedOperation!=='function'))
      throw Object.assign(new Error('当前浏览器缺少可信 AdBlock DNR 服务，请更新扩展。'),
        {code:'E_TOOL_RUNTIME_UNAVAILABLE'});
    if(!tool?.capabilities?.includes(FOCUS_CAPABILITY))return;
    if(tool.id!==FOCUS_ID||focus?.id!==FOCUS_ID||focus.capability!==FOCUS_CAPABILITY||
       !Array.isArray(focus.operations)||!focus.operations.includes('focus.status')||
       typeof focus.request!=='function'||typeof focus.runTrustedOperation!=='function'||
       typeof focus.createPermissionControls!=='function'||typeof focus.probe!=='function')
      throw Object.assign(new Error('当前 OpenDesk Browser 缺少 Stay Focus 所需的可信运行能力；请升级扩展后再安装或打开工具。'),
        {code:'E_TOOL_RUNTIME_UNAVAILABLE'});
  }
  const nativeTimeReview=globalThis.__opendeskTrustedTimeReviewUI||null;
  // React owns presentation fields; only the existing iframe Host receives DOM.
  const backButton=view.fields['sidebar-tool-back'];
  const display=view.fields['sidebar-tool-display'],frameRoot=view.runtime.frameRoot;
  const status=view.fields["sidebar-tool-status"], fileInput=view.fields["sidebar-tool-file"];
  const importTrigger=view.fields["sidebar-tool-import-trigger"], importPanel=view.fields["sidebar-tool-import"];
  const importClose=view.fields["sidebar-tool-import-close"], preview=view.fields["sidebar-tool-preview"];
  const previewTitle=view.fields["sidebar-tool-preview-title"], previewVersion=view.fields["sidebar-tool-preview-version"];
  const previewDescription=view.fields["sidebar-tool-preview-description"];
  const previewCapabilities=view.fields["sidebar-tool-preview-capabilities"], previewFile=view.fields["sidebar-tool-preview-file"];
  const installButton=view.fields["sidebar-tool-install"], removeButton=view.fields["sidebar-tool-remove"];
  const removeReview=view.fields["sidebar-tool-inline-remove"];
  const removeReviewText=view.fields["sidebar-tool-inline-remove-text"];
  const removeReviewConfirm=view.fields["sidebar-tool-inline-remove-confirm"];
  const removeReviewCancel=view.fields["sidebar-tool-inline-remove-cancel"];
  const fileError=view.fields["sidebar-tool-file-error"], updatePanel=view.fields["sidebar-tool-update"];
  const updateVersions=view.fields["sidebar-tool-update-versions"];
  const updateCapabilities=view.fields["sidebar-tool-update-capabilities"];
  const updateWarning=view.fields["sidebar-tool-update-warning"];
  const title=view.fields["sidebar-tool-title"],openTabButton=view.fields["sidebar-tool-open-tab"];
  const actionReview=view.fields["sidebar-tool-action-review"],actionSummary=view.fields["sidebar-tool-action-summary"];
  const actionContinue=view.fields["sidebar-tool-action-continue"],actionCancel=view.fields["sidebar-tool-action-cancel"];
  let pendingAction=null,pendingPage=null;
  const cookieImportGate=createCookieImportIntentGate();
  const cookieWriteGate=createCookieWriteIntentGate();
  const pageConsent=api.permissions?createChromePermissionConsent({api}):null;
  const pageInstallStatus=view.fields["page-install-import-status"];
  const pageInstallReceipt=view.fields["page-install-import-receipt"];
  const pageInstallReceiptText=view.fields["page-install-import-receipt-text"];
  const settingsButton=view.fields["sidebar-tool-settings-open"],settingsView=view.fields["sidebar-tool-settings-view"];
  const tocLanguageRow=view.fields["sidebar-tool-toc-language"],tocLanguageSelect=view.fields["sidebar-tool-toc-language-select"];
  const menuButton=view.fields["sidebar-tool-context-menu"];
  const settingsScopeButton=view.fields["sidebar-tool-settings-scope"];
  const enableButton=view.fields["sidebar-tool-enable"],enableHint=view.fields["sidebar-tool-enable-hint"];
  const promptNativeRow=view.fields["sidebar-tool-prompt-native-row"],promptNativeAction=view.fields["sidebar-tool-prompt-native-action"];
  const promptWebRow=view.fields["sidebar-tool-prompt-web-row"],promptWebAction=view.fields["sidebar-tool-prompt-web-action"];
  const promptEnableLabel=view.fields["sidebar-tool-prompt-enable-label"],promptEnableDescription=view.fields["sidebar-tool-prompt-enable-description"];
  const launchButton=view.fields["sidebar-tool-launch"],eyeButton=view.fields["sidebar-tool-visibility"];
  const visibilitySection=view.fields["sidebar-tool-visibility-settings"];
  const pageExceptionSection=view.fields["sidebar-tool-page-exceptions"];
  const retiredDraft=view.fields["sidebar-tool-retired-draft"],retiredDraftText=view.fields["sidebar-tool-retired-draft-text"];
  const retiredDraftDismiss=view.fields["sidebar-tool-retired-draft-dismiss"];
  const recoverableDrafts=new Map();let frameDraft='';
  const settingsScopeLabel=view.fields["sidebar-tool-settings-scope-label"],settingsTarget=view.fields["sidebar-tool-settings-target"];
  const settingsAllow=view.fields["sidebar-tool-settings-allow"],settingsDeny=view.fields["sidebar-tool-settings-deny"];
  const settingsHint=view.fields["sidebar-tool-settings-hint"];
  const settingsSiteVisibility=view.fields["sidebar-tool-settings-site-visibility"];
  const settingsPageVisibility=view.fields["sidebar-tool-settings-page-visibility"];
  const settingsSites=view.fields["sidebar-tool-settings-sites"],settingsPages=view.fields["sidebar-tool-settings-pages"];
  const settingsSitesTitle=view.fields["sidebar-tool-settings-sites-title"];
  const readOnlyBanner=view.fields["sidebar-tool-readonly-banner"];
  let officialReleases=[],officialError='',officialLoaded=false;
  let siteGrants={},menuGrants={},siteEpoch=0,tocVisibility={},tocVisibilityEpoch=0;
  let tocPageRules={},tocPageRulesEpoch=0,tocSettingsOpen=false,tocScope='site',lastTocSettingsRows='';
  const siteTogglePending=new Set();
  let captureGrants={},enableRecords,enableReadEpoch=0,enableReadError=true;
  let promptWebButtons=null,promptWebPending=false,promptWebChanged=false;
  let knowledgeWindowStart=0,knowledgeRequestCount=0;
  let knowledgeDirty=false;
  const knowledgeOperation=operation=>KNOWLEDGE_OPERATIONS.includes(operation)||operation==='knowledge.editorState';
  let clipGrants={},clipSiteEpoch=0;
  let installed=[], pending=null, pendingBaseline=null, pendingRelease=null,pendingOperationId=null, active=null, frame=null, nativeUI=null, nativePending=false, instance=null, disposed=false, readOnlyPreview=false, previewDirty=false;
  let revocationEpochs={},frameRevocationEpoch=null,revocationReadEpoch=0;
  let requestCount=0,requestWindow=Date.now(), busy=false, fileSelection=0, catalogEpoch=0;
  let visible=false,toolDirty=false,toolSaving=false,installedReadError=false,preinstallBusy=false,preinstallQueued=false;
  let pendingUninstallId=null,pendingUninstallBaseline=null;
  const listeners=[];
  const listen=(field,type,fn)=>listeners.push(view.bind(field.key,type,fn));
  // Only Cookie Editor uses the available Side Panel height. Other tools
  // preserve their content-based resize policy.
  const fitCookieFrame=()=>{
    if(!frame||active?.id!=='cookie-editor'||frameRoot.hidden||disposed)return;
    const workspace=doc.getElementById('workspace-content');
    const bottom=workspace?.getBoundingClientRect?.().bottom??globalThis.innerHeight;
    const top=frame.getBoundingClientRect().top;
    if(!Number.isFinite(bottom)||!Number.isFinite(top))return;
    const height=Math.max(260,Math.min(1600,Math.floor(bottom-top-12)));
    if(frame.style.height!==height+'px')frame.style.height=height+'px';
  };
  if(typeof globalThis.addEventListener==='function'){
    globalThis.addEventListener('resize',fitCookieFrame);
    listeners.push(()=>globalThis.removeEventListener('resize',fitCookieFrame));
  }
  const notice=(message,problem=false)=>{
    if(disposed)return;
    patchToolField(view, status, {textContent: message});setToolFieldAttribute(view, status, 'data-state', problem?'error':'info');
    patchToolField(view, status, {hidden: !message});
  };
  const capabilities=Object.freeze({
    'storage.local':'保存此工具的数据',
    'currentPage.read':'读取当前网页标题和地址',
    'tasks.open':'打开已安装任务',
    'page.toc':'读取已授权网站的目录、定位章节和显示网页目录',
    'page.clip':'按点击读取单独授权网站的正文或选区',
    'user.export':'复制文本或请求文件下载',
    'page.capture':'在单独授权的 ChatGPT 网站显示保存按钮，按点击保存回答、选区或下载图片',
    'knowledge.store':'管理此工具的本机知识收件箱（200 条 / 4 MiB）',
    'time.review':'明确开始后在后台记录聚焦、非空闲网站的域名与时长（仅本机）',
    'focus.control':'按单独批准的网站执行每日额度、时段与专注限制，Chrome DNR 拦截（仅本机）',
    'adblock.control':'经可信 Chrome 授权启停第三方广告过滤，仅管理本工具规则',
    'ai.access':'仅由可信按钮管理 AI 网站自动代理，需要 Chrome 代理权限；其余网站直连',
    'browser.proxy.managed':'经可信确认管理浏览器级独占代理；仅提交有限域名及 HTTPS/SOCKS5 端点',
    'browser.runtime':'读取操作系统和处理器架构，用于工具兼容性判断',
    'browser.i18n':'读取浏览器语言偏好并识别工具提供的文本语言',
    'browser.contextMenu':'在明确授权的网站显示 Chrome 右键菜单（最多三项）',
    'page.prompts':'在 ChatGPT 主内容区域显示提示词快捷按钮（安装启用后直接可用，仅插入草稿）',
    'browser.scheduler':'经确认定时执行已安装的固定任务版本，只管理本工具的计划',
    'browser.tabs':'经用户单次批准打开或聚焦自己获准的标签页',
    'browser.sidePanel':'经真实点击打开 OpenDesk 自己的侧边栏',
    'network':'经用户单次批准向指定 Origin 发送受控 HTTP 请求',
    'browser.network.observe':'经用户授权观察自己打开的网页 HTTP 元数据（最多30秒）',
    'browser.events':'读取和关闭此工具持有的有界网络观察会话',
    'browser.operations':'查询和取消本工具持有的网络观察操作',
    'browser.screenshot':'用户主动截取本工具获准的可见网页并下载 PNG',
    'browser.storage':'独立保存本工具设置与数据（最多 32 项、32 KB）',
    'browser.bookmarks':'确认后收藏网站或删除本工具创建的 Chrome 书签（不读取书签树）',
    'browser.bookmarks.full':'读取、搜索、修改和删除 Chrome 全部书签；必须单独授予权限，危险删除仍需逐次确认',
  });

  // Cookies reuse the existing trusted tool-settings surface; sandbox JavaScript
  // cannot render a grant or forge a click in this extension-owned DOM.
  const cookieCaps=[
    ['read','读取 Cookie 元数据'],['values','读取敏感值'],
    ['write','新建、编辑及删除'],['observe','短时观察变化'],['clear','清理当前主机']];
  const cookiePermissions=view.fields['sidebar-tool-cookie-permissions'];
  patchToolField(view,cookiePermissions,{className:'sidebar-tool-cookie-permissions od-surface'});
  setToolFieldAttribute(view,cookiePermissions,'aria-label','Cookie 网站授权');
  patchToolField(view,cookiePermissions,{hidden:true});
  const cookieHeading=view.fields['sidebar-tool-cookie-heading'];
  patchToolField(view,cookieHeading,{textContent:'Cookie 网站权限'});
  const cookieTarget=view.fields['sidebar-tool-cookie-target'];
  patchToolField(view,cookieTarget,{className:'sidebar-toc-settings-hint'});
  const cookieHelp=view.fields['sidebar-tool-cookie-help'];
  patchToolField(view,cookieHelp,{className:'sidebar-toc-settings-hint'});
  patchToolField(view,cookieHelp,{textContent:''});
  // One trusted site decision covers only the installed package's declared
  // Cookie capabilities; sandbox code cannot grant its own permissions.
  const cookieFirstUse=view.fields['sidebar-tool-cookie-first-use'];
  patchToolField(view,cookieFirstUse,{className:'sidebar-tool-cookie-first-use'});
  const cookieSiteToggle=view.fields['sidebar-tool-cookie-site-toggle'];patchToolField(view,cookieSiteToggle,{type:'button'});
  patchToolField(view,cookieSiteToggle,{id:'sidebar-tool-cookie-site-toggle'});patchToolField(view,cookieSiteToggle,{className:'od-button'});
  let cookieGrantPending=false;
  const cookieOtherSites=view.fields['sidebar-tool-cookie-other-sites'];
  patchToolField(view,cookieOtherSites,{className:'sidebar-toc-settings-entries'});
  // Full Bookmarks belongs to the installed package, never inherited from Owned.
  const fullBookmarkSettings=view.fields['sidebar-tool-bookmark-permissions'];
  patchToolField(view,fullBookmarkSettings,{className:'sidebar-tool-cookie-permissions od-surface'});
  setToolFieldAttribute(view,fullBookmarkSettings,'aria-label','Chrome 完整书签独立授权');
  patchToolField(view,fullBookmarkSettings,{hidden:true});
  const fullBookmarkHeading=view.fields['sidebar-tool-bookmark-heading'];
  patchToolField(view,fullBookmarkHeading,{textContent:'完整 Chrome 书签访问'});
  const fullBookmarkInfo=view.fields['sidebar-tool-bookmark-info'];patchToolField(view,fullBookmarkInfo,{className:'sidebar-toc-settings-hint'});
  patchToolField(view,fullBookmarkInfo,{textContent:'可读取、编辑、移动及删除所有 Chrome 书签和文件夹（包括其他工具创建的）。仅此工具安装版本可用，递归删除仍需逐次确认。'});
  const fullBookmarkButton=view.fields['sidebar-tool-bookmark-grant'];
  patchToolField(view,fullBookmarkButton,{type:'button'});patchToolField(view,fullBookmarkButton,{className:'od-button'});
  const isFullBookmarkTool=tool=>tool?.capabilities?.includes('browser.bookmarks.full')===true;
  // The permission surface is generic to any installed tool that declares
  // Cookie capabilities; an official Cookie Editor is NOT a privileged exception.
  const isCookieTool=tool=>Array.isArray(tool?.capabilities)&&
    tool.capabilities.some(cap=>cap.startsWith('browser.cookies.'));
  const cookieSiteRecord=(tool,origin)=>{
    const row=menuGrants?.[tool?.id];
    return row?.version===tool?.version&&row?.installEpoch===(revocationEpochs[tool?.id]??null)
      ?row.cookieSites?.[origin]??null:null;
  };
  function renderCookieSettings(show){
    const tool=active,app=show&&isCookieTool(tool)&&!readOnlyPreview;
    patchToolField(view,cookiePermissions,{hidden:!app});
    if(!app)return;
    const origin=websiteOrigin(currentPageTarget?.snapshot?.url),record=cookieSiteRecord(tool,origin);
    patchToolField(view,cookieTarget,{textContent:origin?'当前网站：'+origin:'请选择普通 HTTP(S) 网页才能授权新网站'});
    const requested=cookieCaps.filter(([cap])=>tool.capabilities.includes('browser.cookies.'+cap));
    const allowed=requested.length>0&&requested.every(([cap])=>record?.[cap]===true);
    const granted=requested.filter(([cap])=>record?.[cap]===true);
    patchToolField(view,cookieTarget,{textContent:origin?'当前网站：'+origin+(allowed?' · 已授权':
      granted.length?' · 部分授权：'+granted.map(([,label])=>label).join('、'):' · 未授权'):
      '请选择普通 HTTP(S) 网页才能授权新网站'});
    patchToolField(view,cookieFirstUse,{hidden:!origin});
    patchToolField(view,cookieHelp,{textContent:tool.id==='cookie-editor'?'':(
      '一次授权本站：'+requested.map(([,label])=>label).join('、')+
      '。导入导出复用这些权限，删除和敏感导出仍需操作确认；可随时撤销。')});
    patchToolField(view,cookieSiteToggle,{textContent:cookieGrantPending?'正在处理…':allowed?'撤销本站授权':'允许管理本站 Cookie'});
    setToolFieldAttribute(view,cookieSiteToggle,'data-enabled',String(allowed));
    patchToolField(view,cookieSiteToggle,{disabled:busy||cookieGrantPending||!origin||requested.length===0});
    // Previously granted sites remain revocable after their tabs are closed.
    // Revocation is an explicit user click and never requires recreating a tab.
    const rows=Object.entries(menuGrants?.[tool.id]?.cookieSites||{})
      .filter(([site,row])=>!(site===origin&&allowed)&&Object.values(row||{}).some(v=>v===true))
      .map(([site])=>({id:site,text:site,label:'撤销网站权限',disabled:busy||cookieGrantPending}));
    view.setRows(cookieOtherSites.key,rows,'', (site,event)=>{
      if(!event?.isTrusted)return;
      return changeCookieSite({site,all:true}).catch(error=>notice((error.code||'E_COOKIE')+'：'+error.message,true));
    });
  }
  async function changeCookieSite({site=null,capability=null,all=false}={}){
    if(!active||!isCookieTool(active)||readOnlyPreview||busy)return;
    const tool=active,hostInstanceId=new URL(globalThis.location.href).searchParams.get('hostInstanceId');
    const current=site||websiteOrigin(currentPageTarget?.snapshot?.url);
    if(!current)throw Object.assign(new Error('请选择 HTTP(S) 网站'),{code:'E_SITE_GRANT_REQUIRED'});
    const granted=cookieSiteRecord(tool,current)||{};
    // One trusted Host transaction revokes every Cookie capability for a site.
    // Multiple sequential calls could leave lingering grants on partial failure.
    const capabilities=all?['all']:[capability];
    for(const cap of capabilities){
      const enabled=all?false:granted[cap]!==true;
      const snapshot=enabled?currentPageTarget?.capture?.():null;
      if(enabled&&(!snapshot||snapshot.origin!==current))
        throw Object.assign(new Error('请切换到目标网站的活动 Chrome 标签页'),{code:'E_DOCUMENT_CHANGED'});
      const response=await api.runtime.sendMessage({protocol:BROWSER_HOST_PROTOCOL,kind:'host',
        operation:'browser.cookies.userGrant',hostInstanceId,toolId:tool.id,toolVersion:tool.version,
        installEpoch:revocationEpochs[tool.id]??null,cookieCapability:cap,enabled,origin:current,
        ...(snapshot?{document:{
          tabId:snapshot.tabId,windowId:snapshot.windowId,documentId:snapshot.documentId,
          url:snapshot.url,origin:snapshot.origin}}:{})});
      if(!response?.ok)throw Object.assign(new Error(response?.error?.message||'Cookie 授权未确认'),
        {code:response?.error?.code||'E_BROWSER'});
    }
    const latest=(await api.storage.local.get(BROWSER_MENU_GRANTS_STORE))[BROWSER_MENU_GRANTS_STORE];
    menuGrants=latest||{};
    render();notice(all?'已撤销 '+current+' 的 Cookie 网站权限':
      (cookieSiteRecord(tool,current)?.[capability]?'已授权 ':'已撤销 ')+current+' 的 '+capability+' 能力');
  }
  listen(cookieSiteToggle,'click',event=>{
    if(!event?.isTrusted||cookieGrantPending||busy)return;
    const origin=websiteOrigin(currentPageTarget?.snapshot?.url),tool=active,token=instance;
    if(!tool||!origin)return;
    const requested=cookieCaps.map(([cap])=>cap).filter(cap=>tool.capabilities.includes('browser.cookies.'+cap));
    const revoke=requested.every(cap=>cookieSiteRecord(tool,origin)?.[cap]===true);
    cookieGrantPending=true;render();
    void (async()=>{
      if(revoke)await changeCookieSite({all:true});
      else for(const capability of requested){
        if(active!==tool||instance!==token||websiteOrigin(currentPageTarget?.snapshot?.url)!==origin)
          throw Object.assign(new Error('工具或当前网站已变化，请重新选择网站'),{code:'E_DOCUMENT_CHANGED'});
        if(cookieSiteRecord(tool,origin)?.[capability]!==true)await changeCookieSite({capability});
      }
      if(active===tool&&instance===token){
        tocSettingsOpen=revoke;render();
        // Cookie Editor already reflects grant state in its controls. Avoid
        // a second persistent success banner in the Tool shell.
        notice(tool.id==='cookie-editor'?'':revoke?'已撤销本站 Cookie 授权':
          '已授权管理本站 Cookie，后续操作复用此次网站授权。');
      }
    })().catch(error=>notice('网站授权未全部完成，请在设置中查看当前状态（'+
      (error?.code||'E_COOKIE')+'）：'+String(error?.message||error).slice(0,160),true))
      .finally(()=>{cookieGrantPending=false;render();});
  });
  const timePermissions=settingsView?createTimeReviewPermissionControls({api,ui:trustedSettingsUI?.timeReview,notice,runOperation:runTrustedTimeReviewOperation}):null;
  const focusPermissions=settingsView&&focus?.createPermissionControls
    ?focus.createPermissionControls({api,ui:trustedSettingsUI?.stayFocus,notice,
      pageTarget:currentPageTarget,
      readStatus:()=>{
        const tool=active,revocationEpoch=frameRevocationEpoch;
        if(!tool||tool.id!==FOCUS_ID||readOnlyPreview)
          throw Object.assign(new Error('Stay Focus 工具已关闭'),{code:'E_TOOL_CHANGED'});
        return focus.request({api,tool,operation:'focus.status',payload:{},revocationEpoch,
          assertCurrent:()=>{
            if(disposed||!samePackage(active,tool)||
               revocationEpoch!==(revocationEpochs[tool.id]??null)||readOnlyPreview)
              throw Object.assign(new Error('Stay Focus 安装身份已变化'),{code:'E_TOOL_CHANGED'});
          },requestBrowserClick,openSettings:()=>{}});
      },
      runOperation:(operation,payload,event)=>{
      const tool=active,revocationEpoch=frameRevocationEpoch;
      return focus.runTrustedOperation({api,tool,operation,payload,event,revocationEpoch,assertCurrent:phase=>{
        if(disposed||!tool||!samePackage(active,tool)||
           revocationEpoch!==(revocationEpochs[tool.id]??null)||
           phase==='initial'&&busy||phase!=='after-send'&&readOnlyPreview)
          throw Object.assign(new Error('工具已关闭或不可用'),{code:'E_TOOL_CHANGED'});
      }});
    }}):null;
  const aiPermissions=aiAccess?.createPermissionControls
    ?aiAccess.createPermissionControls({api,ui:trustedSettingsUI?.aiAccess,notice,
      runOperation:(operation,payload,event)=>{
        const tool=active;
        return aiAccess.runTrustedOperation({api,tool,operation,payload,event,
          revocationEpoch:frameRevocationEpoch,assertCurrent:phase=>{
            if(disposed||!tool||!samePackage(active,tool)||
               phase==='initial'&&busy||phase!=='after-send'&&readOnlyPreview)
              throw Object.assign(new Error('工具已关闭或不可用'),{code:'E_TOOL_CHANGED'});
          }});
      }}):null;
  const versionOrder=compareToolVersions;
  const readableCapability=id=>capabilities[id]||id;
  const addedCapabilities=(next,prior)=>next.capabilities.filter(id=>!prior.capabilities.includes(id));
  function resetReview() {
    pending=null;pendingBaseline=null;pendingRelease=null;pendingOperationId=null;pendingPage=null;
    patchToolField(view, pageInstallStatus, {textContent: ''});patchToolField(view, pageInstallStatus, {hidden: true});
    setToolFieldAttribute(view, pageInstallStatus, 'data-installation-id', null);setToolFieldAttribute(view, pageInstallStatus, 'data-manifest-hash', null);
    patchToolField(view, pageInstallReceipt, {hidden: true});patchToolField(view, pageInstallReceipt, {open: false});patchToolField(view, pageInstallReceiptText, {textContent: ''});
    patchToolField(view, preview, {hidden: true});patchToolField(view, updatePanel, {hidden: true});patchToolField(view, installButton, {disabled: true});
  }
  function setFileError(message='') {
    patchToolField(view, fileError, {textContent: message});patchToolField(view, fileError, {hidden: !message});
    setToolFieldAttribute(view, fileInput, 'aria-invalid', String(Boolean(message)));
  }
  function clearImport() {
    fileSelection++;resetReview();
    patchToolField(view, fileInput, {value: ''});setFileError();
  }
  function setImportOpen(open) {
    patchToolField(view, importPanel, {hidden: !open});
    setToolFieldAttribute(view, importTrigger, 'aria-expanded', String(open));
    if(!open)clearImport();
  }
  // Only a private Symbol lets statically compiled JSX reuse the existing
  // Browser SDK dispatcher; no postMessage or user package can forge it.
  const trustedBookmarkSource=Symbol('opendesk.trusted.bookmark');
  const sameInstance=(source,token)=>!disposed&&active&&instance===token&&
    ((frame&&frame.contentWindow===source)||
     (source===trustedBookmarkSource&&active.id===TRUSTED_BOOKMARK_ID&&
      (nativePending||nativeUI?.kind==='bookmark')));
  const toolById=id=>installed.find(row=>row.id===id);
  // A matching ID or user-supplied hash alone NEVER grants silent writes.
  // Bind to the installed, enabled, signed-off official release and epoch.
  async function admittedOfficialCookieImport(tool,expectedEpoch){
    if(tool?.id!=='cookie-editor'||!tool.capabilities?.includes('browser.cookies.write'))
      return false;
    const release=officialReleases.find(row=>row.toolId==='cookie-editor');
    if(!release||release.version!==tool.version)return false;
    const state=await api.storage.local.get([
      SIDEBAR_TOOL_STORE,SIDEBAR_TOOL_ENABLE_STORE,MARKET_PROVENANCE_STORE,TOOL_REVOCATION_EPOCHS_STORE]);
    const current=requireCompleteInstalledSidebarTools(state[SIDEBAR_TOOL_STORE]);
    const installed=current.some(row=>sameSidebarToolPackage(row,tool));
    const grant=state[MARKET_PROVENANCE_STORE]?.[tool.id];
    const enabled=sidebarToolEnabled(state[SIDEBAR_TOOL_ENABLE_STORE],tool.id);
    const epoch=state[TOOL_REVOCATION_EPOCHS_STORE]?.[tool.id]??null;
    return installed&&enabled&&epoch===expectedEpoch&&
      grant?.marketId===release.id&&grant?.version===release.version&&
      grant?.sha256===release.sha256&&await matchesOfficialRelease(release,tool);
  }
  const cookieImportOwner=(tool,token,epoch)=>JSON.stringify([tool.id,tool.version,token,epoch]);
  const captureCookieImportDocument=()=>{
    const captured=currentPageTarget?.capture?.();
    if(!captured||!Number.isSafeInteger(captured.tabId)||captured.tabId<0||
      !Number.isSafeInteger(captured.windowId)||captured.windowId<0||
      typeof captured.documentId!=='string'||!captured.documentId||
      websiteOrigin(captured.url)!==captured.origin)
      throw Object.assign(new Error('原始 Chrome 页面已变化，请重新点击导入'),
        {code:'E_DOCUMENT_CHANGED'});
    const {tabId,windowId,documentId,url,origin}=captured;
    return {captured,document:{tabId,windowId,documentId,url,origin}};
  };
  // In-page decisions replace synchronous browser dialogs. Every destructive
  // confirmation is bound to a reviewed action and rechecks identity on commit.
  function cancelActionReview(){
    const old=pendingAction;pendingAction=null;patchToolField(view, actionReview, {hidden: true});
    old?.cancel?.();
  }
  function requestActionReview({message,button='继续',run,toolId=null,cancel=null}){
    if(disposed||busy)return;
    if(pendingAction)cancelActionReview();
    pendingAction={run,toolId,cancel};
    patchToolField(view, actionSummary, {textContent: message});
    patchToolField(view, actionContinue, {textContent: button});
    patchToolField(view, actionReview, {hidden: false});
    requestToolFieldEffect(view, actionReview, 'scrollIntoView', {block:'nearest'});
  }
  async function applyActionReview(event){
    const choice=pendingAction;
    if(!choice||busy||disposed)return;
    pendingAction=null;patchToolField(view, actionReview, {hidden: true});
    await choice.run(event); // Do not defer actual Chrome user activation.
  }
  function requestBrowserClick({message,button,toolId,run}){
    if(disposed||busy)return Promise.reject(Object.assign(new Error('Tool UI unavailable'),{code:'E_HOST_CLOSED'}));
    return new Promise((resolve,reject)=>{
      let settled=false,timer=null;
      const settle=(ok,value)=>{
        if(settled)return;settled=true;clearTimeout(timer);
        if(ok)resolve(value);else reject(value);
      };
      const cancel=()=>settle(false,Object.assign(new Error('Browser action cancelled'),{code:'E_CANCELLED'}));
      requestActionReview({message,button,toolId,cancel,run:event=>{
        if(!event?.isTrusted){cancel();return;}
        // Expiration only applies while approval has not been clicked. Once
        // submitted, a slow Chrome write must resolve from its real receipt.
        if(toolId===ADBLOCK_ID)clearTimeout(timer);
        try{Promise.resolve(run(event)).then(v=>settle(true,v),e=>settle(false,e));}
        catch(e){settle(false,e);}
      }});
      timer=setTimeout(()=>{
        if(pendingAction?.cancel!==cancel)return;
        if(toolId===ADBLOCK_ID){
          pendingAction=null;patchToolField(view, actionReview, {hidden: true});
          settle(false,Object.assign(new Error('可信确认等待超时，操作尚未提交'),{
            code:'E_ADBLOCK_CONFIRM_TIMEOUT'}));
        }else cancelActionReview();
      },90000);
    });
  }
  // chrome.storage may reorder object properties; compare the validated schema values.
  const samePackage=sameSidebarToolPackage;
  function canCommitReview(){
    if(!pending||busy||disposed)return false;
    const previous=toolById(pending.id);
    if(Boolean(previous)!==Boolean(pendingBaseline)||
      (previous&&!samePackage(previous,pendingBaseline)))return false;
    if(previous&&samePackage(previous,pending))return false;
    return !pendingRelease||!previous||versionOrder(pending.version,previous.version)>0;
  }
  const locked=(name,work)=>{
    if(!lockManager?.request)throw new Error('当前浏览器无法安全协调工具存储');
    return lockManager.request('opendesk.sidebar-tools:'+name,work);
  };
  const assertSession=(source,token)=>{
    if(!sameInstance(source,token))throw new Error('工具界面已经切换');
  };
  // Only a genuine click on the trusted extension host can start background
  // tracking or authorize destructive clearing. Sandbox requests cannot forge it.
  async function runTrustedTimeReviewOperation(operation,payload,event){
    if(!TIME_REVIEW_OPERATIONS.includes(operation))
      throw Object.assign(new Error('未知时间回顾操作'),{code:'E_TIME_OPERATION'});
    if(['time.start','time.clear','time.minuteConsent','time.siteGrant'].includes(operation)&&event?.isTrusted!==true)
      throw Object.assign(new Error('请在工具详情中主动点击操作'),{code:'E_TIME_TRUSTED_CLICK'});
    if(operation==='time.clear'&&payload?.confirm!==true)
      throw Object.assign(new Error('请明确选择清空本机时间记录'),{code:'E_TIME_CONFIRM'});
    if(operation==='time.minuteConsent'&&(typeof payload?.enabled!=='boolean'||Object.keys(payload).join(',')!=='enabled'))
      throw Object.assign(new Error('请明确选择是否开启分钟明细'),{code:'E_TIME_CONSENT'});
    const tool=active;
    if(disposed||busy||readOnlyPreview||tool?.id!==TIME_REVIEW_ID||
       !tool.capabilities.includes(TIME_REVIEW_CAPABILITY))
      throw new Error('时间回顾工具已关闭或不可用');
    await assertSidebarToolEnabled(api,tool.id);
    const [owned,epochs]=await Promise.all([
      api.storage.local.get(SIDEBAR_TOOL_STORE),
      api.storage.local.get(TOOL_REVOCATION_EPOCHS_STORE)
    ]);
    if(!requireCompleteInstalledSidebarTools(owned[SIDEBAR_TOOL_STORE]).some(row=>samePackage(row,tool)))
      throw Object.assign(new Error('工具安装内容已变化，请重新打开'),{code:'E_TOOL_CHANGED'});
    const epoch=epochs[TOOL_REVOCATION_EPOCHS_STORE]?.[tool.id]??null;
    if(epoch!==frameRevocationEpoch)
      throw Object.assign(new Error('时间回顾安装代际已变化'),{code:'E_TOOL_CHANGED'});
    const packageHash=await timeReviewPackageHash(tool);
    if(disposed||!active||!samePackage(active,tool)||readOnlyPreview)
      throw Object.assign(new Error('时间回顾详情已变化'),{code:'E_TOOL_CHANGED'});
    const response=await api.runtime.sendMessage({
      protocol:TIME_REVIEW_PROTOCOL,toolId:tool.id,operation,
      payload:operation==='time.clear'?{confirm:true}:operation==='time.minuteConsent'?{enabled:payload.enabled}:payload??{},
      packageHash,installEpoch:epoch
    });
    if(!response?.ok)throw Object.assign(
      new Error(response?.error?.message||'时间回顾操作未确认，请核对当前状态'),
      {code:response?.error?.code||'E_TIME_REVIEW'});
    // The background may have committed already: never offer automatic retry
    // when the host navigates away during the response.
    if(disposed||!active||!samePackage(active,tool))
      throw Object.assign(new Error('宿主已切换，请核对时间记录，不要重复提交'),{code:'E_OUTCOME_UNKNOWN'});
    // Only the enrollment card closes; the active UI (native or sandbox)
    // stays mounted and re-reads verified Host state, never a forwarded token.
    if(operation==='time.start'&&tocSettingsOpen){tocSettingsOpen=false;render();}
    const changed=!['time.status','time.day','time.export'].includes(operation);
    if(changed&&nativeUI&&active?.id===TIME_REVIEW_ID)
      frameRoot.querySelector('main.review')?.dispatchEvent(new Event('opendesk-tool-state-changed'));
    if(changed&&frame?.contentWindow&&active?.id===TIME_REVIEW_ID)
      frame.contentWindow.postMessage({
        protocol:SIDEBAR_TOOL_PROTOCOL,kind:'state-changed',instance,toolId:tool.id
      },'*');
    return response.data;
  }
  function destroyFrame() {
    toolDirty=false;toolSaving=false;frameDraft='';
    nativePending=false;
    if(nativeUI){const old=nativeUI;nativeUI=null;try{old.dispose();}catch{}}
    if(frame){frame.onload=null;frame.remove();frame=null;}
    instance=null;requestCount=0;requestWindow=Date.now();
    frameRoot.replaceChildren();
    if(frameRoot.dataset){delete frameRoot.dataset.timeReviewNative;delete frameRoot.dataset.bookmarkTrusted;}
  }
  // The only admission for privileged Time Review rendering. Built-in code
  // never consumes the installed package's html/css/js as executable input.
  async function admittedNativeTimeReview(tool,expectedEpoch){
    if(nativeTimeReview?.version!==TRUSTED_TIME_REVIEW_VERSION||
       typeof nativeTimeReview.mount!=='function')return false;
    // An official first-open must wait for the built-in catalog to load;
    // catalog failure still fails closed, never enables native by title.
    if(!officialLoaded&&!officialError)await officialReady;
    if(!officialLoaded||officialError)return false;
    const release=officialReleases.find(row=>row.toolId===TIME_REVIEW_ID&&
      row.version===TRUSTED_TIME_REVIEW_VERSION);
    if(!release)return false;
    const saved=await api.storage.local.get([
      SIDEBAR_TOOL_STORE,SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE,MARKET_PROVENANCE_STORE
    ]);
    return admitsTrustedTimeReview({tool,release,expectedEpoch,
      installed:requireCompleteInstalledSidebarTools(saved[SIDEBAR_TOOL_STORE]),
      enableRecords:saved[SIDEBAR_TOOL_ENABLE_STORE],
      epochs:saved[TOOL_REVOCATION_EPOCHS_STORE],
      provenance:saved[MARKET_PROVENANCE_STORE]});
  }
  async function requestNativeTimeReview(tool,token,epoch,operation,payload={},event=null){
    const current=()=>!disposed&&instance===token&&active===tool&&!readOnlyPreview&&
      (nativePending||Boolean(nativeUI));
    if(!current())throw Object.assign(new Error('时间回顾界面已经关闭'),{code:'E_TOOL_CHANGED'});
    if(!TIME_REVIEW_OPERATIONS.includes(operation))
      throw Object.assign(new Error('未知时间回顾操作'),{code:'E_TIME_OPERATION'});
    // Reuse the existing trusted setting controls for destructive operations,
    // never accept an IIFE request as a replacement for a confirmation.
    if(['time.siteGrant','time.clear','time.minuteConsent'].includes(operation)){
      tocSettingsOpen=true;render();
      throw Object.assign(new Error('请在上方可信设置区完成授权或清空确认'),{code:'E_TIME_TRUSTED_CLICK'});
    }
    if(!await admittedNativeTimeReview(tool,epoch)||!current()){
      if(current()){destroyFrame();tocSettingsOpen=true;render();notice('官方 UI 身份或安装代际已变化，请重新打开工具。',true);}
      throw Object.assign(new Error('可信 UI 准入已失效'),{code:'E_TOOL_CHANGED'});
    }
    try{return await runTrustedTimeReviewOperation(operation,payload,event);}
    catch(error){
      if(['E_TIME_SITE_GRANT','E_TIME_PERMISSION'].includes(error?.code)&&current()){
        tocSettingsOpen=true;render();
        throw Object.assign(new Error('请在上方先单独批准网站范围及 Chrome 空闲检测权限，再开始记录。'),
          {code:'E_TIME_PERMISSION_SETUP'});
      }
      throw error;
    }
  }
// A verified release can opt into one React portal in developer mode. Every
  // SDK call still uses dispatch(), its original Host envelope and approval UI.
  async function admittedNativeBookmark(tool,expectedEpoch){
    if(trustedBookmarkPilot?.enabled!==true||
       trustedBookmarkPilot.componentVersion!==TRUSTED_BOOKMARK_COMPONENT_VERSION||
       typeof trustedBookmarkPilot.mount!=='function')return false;
    if(!officialLoaded&&!officialError)await officialReady;
    if(!officialLoaded||officialError)return false;
    const release=officialReleases.find(row=>row.toolId===TRUSTED_BOOKMARK_ID&&
      row.version===TRUSTED_BOOKMARK_VERSION);
    if(!release)return false;
    const saved=await api.storage.local.get([
      SIDEBAR_TOOL_STORE,SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE,MARKET_PROVENANCE_STORE]);
    return admitsTrustedBookmark({tool,release,expectedEpoch,
      installed:requireCompleteInstalledSidebarTools(saved[SIDEBAR_TOOL_STORE]),
      enableRecords:saved[SIDEBAR_TOOL_ENABLE_STORE],
      epochs:saved[TOOL_REVOCATION_EPOCHS_STORE],
      provenance:saved[MARKET_PROVENANCE_STORE]});
  }
  async function requestTrustedBookmark(tool,token,epoch,operation,payload={}){
    const current=()=>!disposed&&!readOnlyPreview&&active===tool&&instance===token&&
      (nativePending||nativeUI?.kind==='bookmark');
    if(!current())throw Object.assign(new Error('书签可信界面已关闭'),{code:'E_TOOL_CHANGED'});
    if(!await admittedNativeBookmark(tool,epoch)||!current()){
      if(current()){destroyFrame();tocSettingsOpen=true;render();
        notice('书签官方安装身份或授权已变化，可信界面已关闭。',true);}
      throw Object.assign(new Error('书签可信准入已失效'),{code:'E_TOOL_CHANGED'});
    }
    return dispatch(operation,payload,tool,trustedBookmarkSource,token,epoch);
  }
  function trustedBookmarkSDK(tool,token,epoch){
    const request=(operation,payload={})=>requestTrustedBookmark(tool,token,epoch,operation,payload);
    const names=['getTree','get','search','create','update','move','remove',
      'prepareRemoveTree','removeTree'];
    const bookmarks=Object.fromEntries(names.map(name=>[name,args=>
      request('browser.bookmarks.'+name,args)]));
    bookmarks.observe=Object.freeze({
      start:args=>request('browser.bookmarks.observe.start',args),
      read:args=>request('browser.bookmarks.observe.read',args),
      stop:args=>request('browser.bookmarks.observe.stop',args)
    });
    return Object.freeze({
      bookmarks:Object.freeze(bookmarks),
      capabilities:Object.freeze({
        list:()=>request('browser.capabilities.list'),
        getStatus:args=>request('browser.capabilities.getStatus',args)
      }),
      page:Object.freeze({getContext:()=>request('browser.page.getContext')})
    });
  }
  async function loadOfficial(){
    // Catalog data is also consumed by Extension Center installation reviews.
    // Its availability must not depend on the retired discovery DOM.
    try{
      const result=await loadOfficialCatalog({api,fetcher});
      if(disposed)return;
      officialReleases=result.apps;officialLoaded=true;officialError='';
    }catch(error){
      if(disposed)return;
      officialLoaded=false;officialError='官方工具目录读取失败：'+String(error.message||error);
    }
    render();
  }
  async function reviewOfficial(release){
    if(busy||disposed)return;
    setImportOpen(true);clearImport();notice('');
    const selection=++fileSelection;
    try{
      const {tool}=await loadOfficialTool(release,{api,fetcher});
      if(disposed||selection!==fileSelection)return;
      await reviewCandidate(tool,'来源：OpenDesk 官方发行 · 原始文件 SHA-256 '+release.sha256,release,selection);
    }catch(error){
      if(disposed||selection!==fileSelection)return;
      setFileError((error.code||'E_PACKAGE')+'：'+String(error.message||error));
    }
  }
  function siteCapability(tool){
    return tool?.capabilities.includes(CAPTURE_CAPABILITY)?CAPTURE_CAPABILITY:
      tool?.capabilities.includes(CLIP_CAPABILITY)?CLIP_CAPABILITY:
      tool?.capabilities.includes(TOC_CAPABILITY)?TOC_CAPABILITY:null;
  }
  function renderTocSettings(){
    const managed=Boolean(active&&!readOnlyPreview),id=active?.id,promptSettings=managed&&id===PROMPT_ID;
    setToolFieldAttribute(view, settingsView, 'data-tool', promptSettings?PROMPT_ID:'');
    const enabled=Boolean(managed&&!enableReadError&&sidebarToolEnabled(enableRecords,id));
    timePermissions?.render(active,readOnlyPreview,frameRoot?.dataset?.timeReviewNative==='true');
    focusPermissions?.render(active,readOnlyPreview,enabled);
    // Never revive the abandoned native controller for historical installs.
    const legacyAdblock=managed&&id===ADBLOCK_ID&&active?.uiRuntime!=='opendesk.react-ui.v1';
    view.setLegacyAdblockVisible(legacyAdblock&&!tocSettingsOpen);
    // Only legacy ai.access installations use the separately hosted control card.
    // v2 browser.proxy.managed tools own their visible UI via the audited SDK.
    const legacyAiProxyTool=managed&&id===AI_ID&&active?.capabilities?.includes(AI_CAPABILITY);
    aiPermissions?.render(active,readOnlyPreview,enabled,Boolean(legacyAiProxyTool&&enabled&&(frame||nativeUI)));
    const sitePending=siteTogglePending.has(id);
    const isToc=managed&&id===READING_TOC_TOOL_ID&&active.capabilities.includes(TOC_CAPABILITY);
    // Settings live in the trusted Host. Repaint text, never iframe content or permissions.
    const tocLocale=isToc?localeController?.getLocale?.()||'zh-CN':'zh-CN';
    const tocText=key=>readingTocHostText(tocLocale,key);
    if(tocLanguageRow)patchToolField(view, tocLanguageRow, {hidden: !isToc});
    if(tocLanguageSelect){
      patchToolField(view, tocLanguageSelect, {value: resolveUiLocale(tocLocale,['zh-CN','en'],'zh-CN')});
      patchToolField(view, tocLanguageSelect, {disabled: busy||!isToc});
      setToolFieldAttribute(view, tocLanguageSelect, 'aria-label', tocText('languageLabel'));
    }
    view.patchLabels(Object.fromEntries(Object.entries(view.labels).map(([key])=>[key,tocText(key)])));
    if(promptEnableLabel)patchToolField(view, promptEnableLabel, {textContent: promptSettings?'启用工具':tocText('toggleHeading')});
    if(promptEnableDescription)patchToolField(view, promptEnableDescription, {hidden: !promptSettings});
    setToolFieldAttribute(view, settingsView, 'aria-label', id===ADBLOCK_ID?'工具管理':tocText('settingsTitle'));
    const adblockManagement=managed&&id===ADBLOCK_ID&&tocSettingsOpen;
    patchToolField(view, settingsButton, {title: id===ADBLOCK_ID?
      adblockManagement?'返回 AdBlock 产品':'打开 AdBlock 产品设置':tocText('settingsTitle')});
    setToolFieldAttribute(view, settingsButton, 'aria-label', settingsButton.title);
    setToolFieldAttribute(view, settingsButton, 'aria-controls', id===ADBLOCK_ID&&!tocSettingsOpen?
      (active?.uiRuntime==='opendesk.react-ui.v1'?'sidebar-tool-frame':'sidebar-tool-adblock-native'):'sidebar-tool-settings-view');
    patchToolField(view, backButton, {title: tocText('backAction')});
    setToolFieldAttribute(view, backButton, 'aria-label', backButton.title);
    if(openTabButton){
      patchToolField(view, openTabButton, {title: tocText('openTabAction')});
      setToolFieldAttribute(view, openTabButton, 'aria-label', openTabButton.title);
    }
    setToolFieldAttribute(view, view.fields['sidebar-tool-generic-site-binary'], 'aria-label',isToc?tocText('siteGroup'):'当前网站授权');
    if(!managed)tocSettingsOpen=false;
    const show=managed&&tocSettingsOpen;
    // Exactly one tool title and one settings icon in the shared toolbar.
    // AdBlock product pages belong solely to the installed React sandbox.
    if(title)patchToolField(view, title, {hidden: false});
    patchToolField(view, settingsButton, {hidden: !managed});
    patchToolField(view, settingsButton, {disabled: busy||sitePending});
    setToolFieldAttribute(view, settingsButton, 'aria-expanded', String(show));
    // Time Review uses the same trusted static settings DOM as an inline
    // enrollment card. Do not replace/hide its live stats iframe.
    const trustedInline=show&&(id===TIME_REVIEW_ID||id===FOCUS_ID||id===AI_ID||isCookieTool(active)||isFullBookmarkTool(active));
    // Native approval/stop remains visible above a live sandbox, never inside it.
    setToolFieldAttribute(view, display, 'data-trusted-tool-inline', String(trustedInline));
    patchToolField(view, settingsView, {hidden: !show});
    if(promptNativeRow)patchToolField(view, promptNativeRow, {hidden: !(show&&promptSettings)});
    if(promptWebRow)patchToolField(view, promptWebRow, {hidden: !(show&&promptSettings)});
    if(promptWebAction){setToolFieldAttribute(view, promptWebAction, 'aria-checked', String(promptWebButtons===true));
      patchToolField(view, promptWebAction, {disabled: !promptSettings||busy||sitePending||!enabled||promptWebPending||promptWebButtons===null});
      patchToolField(view, promptWebAction, {title: promptWebButtons===null?'读取网页按钮设置中':'在已支持的网站显示快捷按钮'});}
    if(promptSettings&&promptNativeAction){
      const targetOrigin=supportedOrigin(currentPageTarget?.snapshot?.url);
      const record=menuGrants?.[PROMPT_ID],contextActive=Boolean(record?.version===active.version&&
        record?.origins?.includes(CHATGPT_ORIGIN)&&record?.activeActions?.length);
      patchToolField(view, promptNativeAction, {textContent: contextActive?'关闭右键快捷添加':'启用右键快捷添加'});
      setToolFieldAttribute(view, promptNativeAction, 'aria-pressed', String(contextActive));
      setToolFieldAttribute(view, promptNativeAction, 'role', 'switch');
      setToolFieldAttribute(view, promptNativeAction, 'aria-label', '选中文字快速添加');
      setToolFieldAttribute(view, promptNativeAction, 'aria-checked', String(contextActive));
      patchToolField(view, promptNativeAction, {disabled: busy||sitePending||!enabled||!targetOrigin});
      patchToolField(view, promptNativeAction, {title: !targetOrigin?'请先打开 chatgpt.com 网页':'仅影响 Chrome 原生右键快捷添加'});
    }
    // Visibility-only: retain the existing opaque iframe and its installation identity.
    frameRoot.hidden=(show&&!trustedInline)||!(frame||nativeUI)||
      legacyAdblock;
    renderCookieSettings(show);
    patchToolField(view,fullBookmarkSettings,{hidden:!(show&&managed&&isFullBookmarkTool(active))});
    const fullGrant=menuGrants?.[id],currentEpoch=revocationEpochs[id]??null;
    const hasFullBookmarkConsent=Boolean(fullGrant?.bookmarkFull===true&&
      fullGrant.version===active?.version&&fullGrant.installEpoch===currentEpoch);
    patchToolField(view,fullBookmarkButton,{textContent:hasFullBookmarkConsent?'撤销此工具的完整书签访问':'授权此工具访问全部书签'});
    patchToolField(view,fullBookmarkButton,{disabled:busy||!enabled||!isFullBookmarkTool(active)});
    setToolFieldAttribute(view,fullBookmarkButton,'aria-pressed',String(hasFullBookmarkConsent));
    patchToolField(view, removeButton, {hidden: readOnlyPreview});if(openTabButton)patchToolField(view, openTabButton, {hidden: readOnlyPreview});
    if(enableButton){patchToolField(view, enableButton, {textContent: promptSettings?'':isToc?tocText(enabled?'disable':'enable'):enabled?'停用工具':'启用工具'});patchToolField(view, enableButton, {disabled: busy||enableReadError});
      setToolFieldAttribute(view, enableButton, 'role', promptSettings?'switch':'button');
      setToolFieldAttribute(view, enableButton, 'aria-label', promptSettings?'启用工具':enableButton.textContent);
      if(promptSettings)setToolFieldAttribute(view, enableButton, 'aria-checked', String(enabled));else setToolFieldAttribute(view, enableButton, 'aria-checked', null);
      setToolFieldAttribute(view, enableButton, 'aria-pressed', String(enabled));}
    if(enableHint)patchToolField(view, enableHint, {hidden: promptSettings&&!enableReadError});
    if(enableHint)patchToolField(view, enableHint, {textContent: promptSettings?
      (enableReadError?'工具状态读取异常，已保护性停止运行。':enabled?'已启用 · 基础快捷按钮可直接使用':'已停用 · 已保存提示词保留'):
      isToc?tocText(enableReadError?'enableError':enabled?'enabledHint':'disabledHint'):
      enableReadError?'启停状态读取异常；已保护性停止运行。':
      enabled?'工具已启用。启用不会自动运行代码。':'工具已停用。数据、网站授权和显示偏好保留。'});
    if(launchButton){patchToolField(view, launchButton, {hidden: !managed||Boolean(frame||nativeUI||nativePending)});patchToolField(view, launchButton, {disabled: busy||!enabled});
      patchToolField(view, launchButton, {textContent: isToc?tocText(enabled?'launch':'launchDisabled'):enabled?'打开工具':'已停用，请在设置中启用'});}
    const url=currentPageTarget?.snapshot?.url,capability=siteCapability(active);
    const origin=capability===CAPTURE_CAPABILITY?chatCaptureOrigin(url):websiteOrigin(url);
    const grants=capability===CAPTURE_CAPABILITY?captureGrants:capability===CLIP_CAPABILITY?clipGrants:siteGrants;
    const grant=Boolean(capability&&origin&&(capability===TOC_CAPABILITY?
      tocSiteAllowed(grants,id,url):grantedOrigins(grants,id).includes(origin)));
    const appearance=readingTocDisplayState(tocVisibility,id,url);
    const pageAllowed=readingTocPageAllowed(tocPageRules,id,url);
    if(eyeButton){
      patchToolField(view, eyeButton, {hidden: !isToc});patchToolField(view, eyeButton, {disabled: busy||sitePending||!enabled||!origin||!grant||!pageAllowed});
      patchToolField(view, eyeButton, {title: tocText(!enabled?'eyeToolDisabled':!origin?'eyeUnsupported':
        !grant?'eyeSiteDisabled':!pageAllowed?'eyePageExcluded':
        appearance.show?'eyeHide':'eyeShow')});
      setToolFieldAttribute(view, eyeButton, 'aria-label', eyeButton.title);setToolFieldAttribute(view, eyeButton, 'aria-pressed', String(appearance.show));
    }
    if(!show)return;
    // Only tools with the generic TOC/Clip/Capture site capability use
    // these controls. Time Review and Stay Focus have independent trust scopes.
    const capabilityOnly=Boolean(siteCapability(active)&&!promptSettings);
    for(const id of ['sidebar-tool-generic-site-scope','sidebar-tool-generic-site-binary',
      'sidebar-tool-generic-site-advanced']){
      const field=view.fields[id];if(field)patchToolField(view,field,{hidden:!capabilityOnly});
    }
    patchToolField(view, settingsHint, {hidden: !capabilityOnly});
    patchToolField(view, settingsScopeLabel, {textContent: isToc?tocText('siteAvailability'):'当前网站授权'});
    patchToolField(view, settingsTarget, {textContent: capability?(origin||(isToc?tocText('selectPage'):'请选择适用网页')):'此工具不需要网站授权'});
    patchToolField(view, settingsScopeButton, {hidden: true});
    for(const [button,chosen] of [[settingsAllow,grant],[settingsDeny,!grant]]){
      patchToolField(view,button,{textContent:isToc?tocText(button===settingsAllow?'siteEnable':'siteDisable'):
        button===settingsAllow?'授权当前网站':'撤销当前网站授权',hidden:!capability,disabled:busy||sitePending||!origin});
      setToolFieldAttribute(view,button,'aria-pressed',String(Boolean(origin)&&chosen));
    }
    patchToolField(view, settingsHint, {textContent: promptSettings?'默认在 chatgpt.com 使用网页快捷按钮，无需二次网站授权；点击只填写草稿，不会自动发送。':isToc?tocText('tocIntro')+
      tocText(!origin?'unsupportedPage':grant?'siteAvailable':'siteDisabled'):
      !capability?'工具能力以安装时的审阅为准。':!origin?'请切换到适用网页，设置仍可管理。':
      grant?'当前网站已授权；授权与工具启停、外观显隐互相独立。':
        '点击授权后直接生效：'+readableCapability(capability)+'。仅适用于上方网站，可随时撤销。'});
    if(visibilitySection)patchToolField(view, visibilitySection, {hidden: !isToc});
    if(pageExceptionSection)patchToolField(view, pageExceptionSection, {hidden: !isToc});
    for(const [button,hidden] of [[settingsSiteVisibility,appearance.hiddenOnSite],[settingsPageVisibility,appearance.hiddenOnPage]]){
      patchToolField(view,button,{hidden:!isToc,textContent:isToc?tocText(hidden?'restoreVisibility':'hide'):hidden?'恢复显示':'隐藏',disabled:busy||sitePending||!enabled||!grant||!origin});
      setToolFieldAttribute(view,button,'aria-pressed',String(!hidden));
    }
    const origins=isToc?blockedTocOrigins(grants):capability?grantedOrigins(grants,id):[],denied=isToc?disabledTocPages(tocPageRules,id):[];
    if(settingsSitesTitle)patchToolField(view, settingsSitesTitle, {textContent: isToc?tocText('disabledSites'):'已授权的网站'});
    const identity=JSON.stringify([id,origins,denied,busy,sitePending,isToc?tocLocale:null]);
    if(identity===lastTocSettingsRows)return;lastTocSettingsRows=identity;
    const section=(container,items,handler,emptyLabel)=>{
      const label=container===settingsSites&&!isToc?'撤销':tocText('restore');
      view.setRows(container.key,items.map(entry=>({id:entry,text:entry,label,disabled:busy||sitePending})),emptyLabel,
        entry=>action(()=>runSiteToggle(id,()=>handler(entry)))());
    };
    section(settingsPages,denied,url=>setTocPageAvailability(true,url),isToc?tocText('noPages'):'没有排除的页面');
    section(settingsSites,origins,url=>capability===CAPTURE_CAPABILITY?changeCaptureSite(id,url,false):
      capability===CLIP_CAPABILITY?revokeClipOrigin(id,url):revokeTocOrigin(id,url,isToc),isToc?tocText('noSites'):'尚未授权任何网站');
  }
  function render() {
    if(disposed)return;
    if(pendingUninstallId&&!installed.some(row=>row.id===pendingUninstallId&&samePackage(row,pendingUninstallBaseline)))
      cancelRemovalReview();
    patchToolField(view, display, {hidden: !active});
    const trustedTocTitle=active?.id===READING_TOC_TOOL_ID&&
      active?.capabilities.includes(TOC_CAPABILITY)&&
      active?.title===readingTocCatalog.messages['zh-CN'].title;
    const currentTocLocale=localeController?.getLocale?.()||'zh-CN';
    const visibleTitle=trustedTocTitle?
      uiMessage(readingTocCatalog,currentTocLocale,'title'):active?.title;
    patchToolField(view, title, {textContent: active?visibleTitle+(readOnlyPreview?' · '+(trustedTocTitle?
      readingTocHostText(currentTocLocale,'readonly'):'只读预览'):''):''});
    patchToolField(view, title, {title: active?'v'+active.version:''});
    patchToolField(view, removeButton, {title: readOnlyPreview?'只读预览尚未安装，不能卸载':
      active?(trustedTocTitle?
        readingTocHostText(currentTocLocale,'uninstallPrefix')+visibleTitle+
        readingTocHostText(currentTocLocale,'uninstallSuffix'):
        '卸载「'+active.title+'」及其本地数据'):'卸载工具'});
    setToolFieldAttribute(view, removeButton, 'aria-label', removeButton.title);
    patchToolField(view, removeButton, {disabled: !active || busy || readOnlyPreview});
    if(openTabButton)patchToolField(view, openTabButton, {disabled: !active||busy||readOnlyPreview});
    if(readOnlyBanner)patchToolField(view, readOnlyBanner, {hidden: !readOnlyPreview});
    if(retiredDraft){patchToolField(view, retiredDraft, {hidden: !active||!recoverableDrafts.has(active.id)});
      patchToolField(view, retiredDraftText, {value: active?recoverableDrafts.get(active.id)||'':''});}
    if(menuButton){
      const actions=active?.contributes?.contextMenus;
      const hasActions=!readOnlyPreview&&active?.capabilities.includes('browser.contextMenu')&&
        Array.isArray(actions)&&actions.length>0;
      const origin=websiteOrigin(currentPageTarget?.snapshot?.url);
      const enabled=Boolean(active&&origin&&menuGrants[active.id]?.version===active.version&&
        menuGrants[active.id]?.origins?.includes(origin)&&menuGrants[active.id]?.activeActions?.length);
      patchToolField(view, menuButton, {hidden: !hasActions||active?.id===PROMPT_ID});
      patchToolField(view, menuButton, {disabled: busy||!origin||!hasActions||enableReadError||
        !sidebarToolEnabled(enableRecords,active?.id)});
      setToolFieldAttribute(view, menuButton, 'data-enabled', String(enabled));
      setToolFieldAttribute(view, menuButton, 'aria-pressed', String(enabled));
      patchToolField(view, menuButton, {title: enabled?'停用此网站的右键菜单':'为当前网站启用右键菜单'});
      setToolFieldAttribute(view, menuButton, 'aria-label', menuButton.title);
    }
    renderTocSettings();
    taskWorkbench.setToolActive?.(Boolean(visible && active));
    if(doc.documentElement?.dataset)doc.documentElement.dataset.opendeskTool=visible && active?'active':'list';
  }
  function focusToolInList(id) {
    // The list is still hidden until React commits the suspended ToolHost.
    // Resolve its current action (or search/import fallback) after that commit.
    requestToolFieldEffect(view,importTrigger,'focus',{preventScroll:true,extensionToolId:id??null});
  }
  function cancelRemovalReview(){
    pendingUninstallId=null;pendingUninstallBaseline=null;
    patchToolField(view, removeReview, {hidden: true});
  }
  // Revoking a hidden iframe also revokes its session token and pending responses.
  const isDirty=()=>!readOnlyPreview&&active?.id===KNOWLEDGE_TOOL_ID&&knowledgeDirty;
  const canLeaveTool=()=>!isDirty()||(notice('知识收件箱有未保存的编辑，请先保存；不会自动丢弃草稿。',true),false);
  function suspendTool() {cookieImportGate.revoke();cookieWriteGate.revoke();cancelRemovalReview();cancelActionReview();tocSettingsOpen=false;tocScope='site';destroyFrame();active=null;readOnlyPreview=false;previewDirty=false;knowledgeDirty=false;render();}
  function closeTool() {
    if(busy)return false;
    const previousId=active?.id;
    if(!canLeave(()=>{setImportOpen(false);suspendTool();notice('');focusToolInList(previousId);}))return false;
    setImportOpen(false);suspendTool();notice('');
    return true;
  }
  function canLeave(onApproved) {
    if(toolSaving){notice('当前工具正在保存，请完成后再切换。',true);return false;}
    if(toolDirty||isDirty()){
      const session=instance,toolId=active?.id;
      requestActionReview({
        message:'「'+(active?.title||'当前工具')+'」有未保存内容。继续会丢弃本次未保存的编辑；也可以取消并先保存。',
        button:'放弃未保存内容并继续',toolId,
        run:()=>{if(active?.id===toolId&&instance===session&&!toolSaving)return onApproved?.();}
      });
      return false;
    }
    return true;
  }
  function mountTool(tool,{readOnly=false,launchGate=null,forceSandbox=false}={}) {
    // An installed Focus tool opens with a visible trusted first-use grant.
    tocSettingsOpen=!readOnly&&(
      tool.id===FOCUS_ID&&tool.capabilities.includes(FOCUS_CAPABILITY)||
      isCookieTool(tool)&&cookieSiteRecord(tool,websiteOrigin(currentPageTarget?.snapshot?.url))?.read!==true);
    tocScope='site';destroyFrame();active=tool;readOnlyPreview=readOnly;previewDirty=false;knowledgeDirty=false;
    frameRevocationEpoch=readOnly?null:(revocationEpochs[tool.id]??null);
    instance=crypto.randomUUID();
    const token=instance;
    if(!forceSandbox&&!readOnly&&!launchGate&&tool.id===TIME_REVIEW_ID&&
       nativeTimeReview?.version===TRUSTED_TIME_REVIEW_VERSION&&typeof nativeTimeReview.mount==='function'){
      // Async fail-closed admission finishes BEFORE any privileged UI code
      // mounts. A modified/offline/legacy same-ID package keeps its sandbox.
      nativePending=true;render();requestToolFieldEffect(view, backButton, 'focus', {preventScroll:true});
      notice('正在校验当前扩展内置的 Time Review 官方发行身份…');
      void admittedNativeTimeReview(tool,frameRevocationEpoch).then(admitted=>{
        if(disposed||active!==tool||instance!==token)return;
        if(!admitted){
          mountTool(tool,{forceSandbox:true});
          notice('当前包不是已审批的内置 Time Review 发行，已在受限沙箱中打开。');
          return;
        }
        try{
          const dispose=nativeTimeReview.mount({doc,container:frameRoot,
            request:(operation,payload,event)=>requestNativeTimeReview(tool,token,frameRevocationEpoch,
              operation,payload,event)});
          if(disposed||active!==tool||instance!==token){dispose();return;}
          nativeUI={dispose};nativePending=false;
          if(frameRoot.dataset)frameRoot.dataset.timeReviewNative='true';
          render();notice('');
        }catch(error){
          destroyFrame();tocSettingsOpen=true;render();
          notice('已拒绝启动不完整的可信 UI：'+String(error?.message||error).slice(0,180),true);
        }
      }).catch(error=>{
        if(disposed||active!==tool||instance!==token)return;
        destroyFrame();tocSettingsOpen=true;render();
        notice('官方包身份校验失败，未执行特权 UI：'+String(error?.message||error).slice(0,180),true);
      });
      return;
    }
    if(!forceSandbox&&!readOnly&&!launchGate&&tool.id===TRUSTED_BOOKMARK_ID&&
       trustedBookmarkPilot?.enabled===true&&typeof trustedBookmarkPilot.mount==='function'){
      nativePending=true;render();requestToolFieldEffect(view, backButton, 'focus', {preventScroll:true});
      notice('正在核验书签管理官方安装身份…');
      void admittedNativeBookmark(tool,frameRevocationEpoch).then(admitted=>{
        if(disposed||active!==tool||instance!==token)return;
        if(!admitted){
          mountTool(tool,{forceSandbox:true});
          notice('书签正式工具仍在原有沙箱中运行；未授予可信 UI 准入。');
          return;
        }
        try{
          const sdk=trustedBookmarkSDK(tool,token,frameRevocationEpoch);
          const dispose=trustedBookmarkPilot.mount({container:frameRoot,sdk,
            onStateChange:state=>{
              if(disposed||active!==tool||instance!==token)return;
              toolDirty=Boolean(state?.dirty);toolSaving=Boolean(state?.saving);
              frameDraft=String(state?.draft||'').slice(0,8192);
            }});
          if(disposed||active!==tool||instance!==token){dispose();return;}
          nativeUI={dispose,kind:'bookmark'};nativePending=false;
          frameRoot.dataset.bookmarkTrusted='true';
          render();notice('');
        }catch(error){
          destroyFrame();tocSettingsOpen=true;render();
          notice('书签可信 React 试点拒绝挂载：'+String(error?.message||error).slice(0,160),true);
        }
      }).catch(error=>{
        if(disposed||active!==tool||instance!==token)return;
        destroyFrame();tocSettingsOpen=true;render();
        notice('书签官方身份校验失败：'+String(error?.message||error).slice(0,160),true);
      });
      return;
    }
    let initialized=false;
    frame=doc.createElement('iframe');
    frame.title=tool.title+'（独立受限界面）';
    frame.className='sidebar-tool-iframe';
    frame.referrerPolicy='no-referrer';
    frame.src=api.runtime.getURL('sidebar-tools/sandbox.html');
    frame.onload=async()=>{
      if(!frame||!sameInstance(frame.contentWindow,token))return;
      if(initialized){
        suspendTool();
        notice('工具页面发生导航，旧界面已关闭。',true);return;
      }
      initialized=true;
      // The native menu's one-shot ticket must bind to THIS instance before
      // any sandbox HTML/JS is dispatched; never retry launch.consume blindly.
      // The guard executes before the installed package/lifecycle recheck.
      if(launchGate){
        try{await launchGate;}
        catch(error){
          if(sameInstance(frame?.contentWindow,token)){
            suspendTool();
            notice('右键启动未确认，工具代码未运行：'+String(error?.message||error).slice(0,180),true);
          }
          return;
        }
        if(!sameInstance(frame?.contentWindow,token))return;
      }
      if(!readOnly){
        try{
          await assertSidebarToolEnabled(api,tool.id);
          const current=requireCompleteInstalledSidebarTools((await api.storage.local.get(SIDEBAR_TOOL_STORE))[SIDEBAR_TOOL_STORE]);
          const epochs=(await api.storage.local.get(TOOL_REVOCATION_EPOCHS_STORE))[TOOL_REVOCATION_EPOCHS_STORE];
          if(!current.some(row=>samePackage(row,tool))||(epochs?.[tool.id]??null)!==frameRevocationEpoch)
            throw new Error('工具身份已变化，请重新打开');
        }catch(error){
          if(sameInstance(frame?.contentWindow,token)){destroyFrame();tocSettingsOpen=true;render();notice(error.message,true);}
          return;
        }
        if(!sameInstance(frame?.contentWindow,token))return;
      }
      frame.contentWindow.postMessage({
        protocol:SIDEBAR_TOOL_PROTOCOL,kind:'load',instance:token,tool,
        locale:localeController?.getLocale()||'zh-CN'},'*');
    };
    frameRoot.append(frame);render();fitCookieFrame();requestToolFieldEffect(view, backButton, 'focus', {preventScroll:true});
    notice(readOnly?'正在加载隔离只读预览（不会安装或保存）…':'正在打开「'+tool.title+'」…');
  }
  function openTool(id,{launchGate=null}={}) {
    
    cancelRemovalReview();
    if(disposed||busy||!visible)return;
    if(installedReadError){notice('安装记录读取失败，请刷新核对后再打开应用。',true);return;}
    // An OD rail click on the already-open app must not remount its iframe,
    // discard its draft or introduce a redundant leave-confirmation dialog.
    if(!launchGate&&active?.id===id&&!readOnlyPreview&&!tocSettingsOpen&&frame?.isConnected)
      return instance;
    if(launchGate&&active&&(toolSaving||toolDirty||isDirty())){
      notice('当前工具有未保存内容，请先保存或关闭，再重新从右键菜单启动。',true);return;
    }
    if(active&&!canLeave(()=>{
      const target=toolById(id);
      if(target&&visible&&!busy)mountTool(target);
    }))return;
    const tool=toolById(id);
    if(!tool){notice('找不到已安装的工具',true);return;}
    try{requireToolRuntime(tool);}
    catch(error){notice((error.code||'E_TOOL_RUNTIME')+'：'+error.message,true);return;}
    if(enableReadError||!sidebarToolEnabled(enableRecords,id)){
      destroyFrame();active=tool;readOnlyPreview=false;tocSettingsOpen=true;render();requestToolFieldEffect(view, backButton, 'focus');return;
    }
    mountTool(tool,{launchGate});
    return instance;
  }
  // Management never mounts untrusted code. The existing trusted settings UI
  // owns site grants, enable/disable, version details and uninstall reviews.
  function openSettings(id){
    if(disposed||busy||!visible||installedReadError)return false;
    const tool=toolById(id);
    if(!tool){notice('找不到已安装的工具',true);return false;}
    const show=()=>{
      if(disposed||!visible||busy)return;
      cancelRemovalReview();setImportOpen(false);
      destroyFrame();active=tool;readOnlyPreview=false;previewDirty=false;
      tocSettingsOpen=true;tocScope='site';render();requestToolFieldEffect(view, backButton, 'focus', {preventScroll:true});
    };
    if(active&&!canLeave(show))return false;
    show();return true;
  }
  function openOfficialReview(id){
    if(disposed||busy||!visible||active||!officialLoaded)return false;
    const release=officialReleases.find(row=>row.toolId===id);
    if(!release)return false;
    void reviewOfficial(release);
    return true;
  }
  function openImport(){
    if(disposed||busy||!visible||active)return false;
    setImportOpen(true);notice('');return true;
  }
  function openReadOnlyPreview(value){
    
    if(disposed||busy||!visible)throw new Error('预览页面已经关闭或不可用');
    const tool=validateSidebarToolPackage(value);
    if(active&&!canLeave(()=>{if(visible&&!busy)mountTool(tool,{readOnly:true});}))return false;
    // Installed-tool ID collisions NEVER inherit installed rights in a preview.
    mountTool(tool,{readOnly:true});
  }
  async function openInTab(id=active?.id) {
    if(disposed||busy||!visible)return;
    const tool=toolById(id);
    if(!tool)throw new Error('工具未安装或已卸载');
    if(typeof api.tabs?.create!=='function')throw new Error('此环境不支持打开扩展标签页');
    await api.tabs.create({url:toolPageHref(api.runtime,tool.id)});
  }
  function setVisible(next,destination=null) {
    if(disposed)return;
    // Do not dismiss a trusted import while an installation is in flight.
    if(!next&&visible&&busy)return false;
    if(!next&&visible&&!canLeave(()=>{
      suspendTool();
      if(destination&&destination!=='tools')taskWorkbench.navigate?.(destination);
    }))return false;
    visible=Boolean(next);
    if(!visible){setImportOpen(false);suspendTool();return;}
    // Entering the Tools tab only shows the list: an iframe requires an explicit Open.
    render();
  }
  async function dispatch(operation,payload,tool,source,token,revocationEpoch,verifiedGesture=false) {
    assertSession(source,token);
    if(!readOnlyPreview)await assertSidebarToolEnabled(api,tool.id);
    assertSession(source,token);
    if(readOnlyPreview){
      // Mock reads only. No Chrome storage or Native/Task invocation from code
      // under development, even when an installed tool shares this ID.
      if(operation==='storage.get'&&tool.capabilities.includes('storage.local')&&
        typeof payload?.key==='string'&&/^[a-zA-Z][a-zA-Z0-9._-]{0,59}$/.test(payload.key))
        return {value:null,preview:true};
      if(operation==='currentPage.info'&&tool.capabilities.includes('currentPage.read'))
        return {status:'unavailable',message:'只读开发预览没有绑定业务网页'};
      throw new Error('开发预览不允许真实写入、打开任务或控制网页');
    }
    // The trusted parent samples browser userActivation synchronously on the
    // original sandbox message. No untrusted argument can claim a gesture.
    if(operation==='cookieEditor.import.begin'){
      if(!verifiedGesture)
        throw Object.assign(new Error('请通过导入按钮重新选择文件或提交文本'),
          {code:'E_USER_GESTURE_REQUIRED'});
      if(!payload||Object.keys(payload).join(',')!=='url'||
         typeof payload.url!=='string'||!tool.capabilities.includes('browser.cookies.write'))
        throw Object.assign(new Error('无效的 Cookie 导入操作'),{code:'E_SCHEMA'});
      const origin=websiteOrigin(payload.url);
      if(!origin||websiteOrigin(currentPageTarget?.snapshot?.url)!==origin||
         cookieSiteRecord(tool,origin)?.write!==true)
        throw Object.assign(new Error('请先在当前网站授权 Cookie 写入'),
          {code:'E_SITE_GRANT_REQUIRED'});
      if(!await admittedOfficialCookieImport(tool,revocationEpoch))
        throw Object.assign(new Error('仅正式 Cookie Editor 可使用一键导入'),
          {code:'E_TOOL_RUNTIME_UNAVAILABLE'});
      assertSession(source,token);
      if(websiteOrigin(currentPageTarget?.snapshot?.url)!==origin||
         cookieSiteRecord(tool,origin)?.write!==true)
        throw Object.assign(new Error('网站或授权已变化'),{code:'E_DOCUMENT_CHANGED'});
      const {captured,document}=captureCookieImportDocument();
      await currentPageTarget.revalidate(captured);
      assertSession(source,token);
      if(document.origin!==origin)throw Object.assign(
        new Error('原始 Chrome 页面已变化'),{code:'E_DOCUMENT_CHANGED'});
      return cookieImportGate.start({owner:cookieImportOwner(tool,token,revocationEpoch),
        origin,document,verifiedUserActivation:verifiedGesture,multiOrigin:true});
    }
    if(operation==='cookieEditor.import.finish'){
      if(!payload||Object.keys(payload).join(',')!=='ref'||
         !Number.isSafeInteger(payload.ref)||payload.ref<1)
        throw Object.assign(new Error('无效的导入会话'),{code:'E_SCHEMA'});
      return cookieImportGate.close(cookieImportOwner(tool,token,revocationEpoch),payload.ref);
    }
    // A single Save click admits one named/path-scoped write, never removal,
    // bulk import, cleanup, or unreviewed tools.
    if(operation==='cookieEditor.write.begin'){
      if(!verifiedGesture)
        throw Object.assign(new Error('请重新点击保存 Cookie'),{code:'E_USER_GESTURE_REQUIRED'});
      const writeAction=payload?.action??'set';
      if(!payload||!['set','remove'].includes(writeAction)||
         Object.keys(payload).sort().join(',')!==(writeAction==='remove'?'action,name,path,url':'name,path,url')||
         typeof payload.url!=='string'||typeof payload.name!=='string'||
         typeof payload.path!=='string'||!tool.capabilities.includes('browser.cookies.write'))
        throw Object.assign(new Error('无效的 Cookie 保存操作'),{code:'E_SCHEMA'});
      const origin=websiteOrigin(payload.url);
      if(!origin||websiteOrigin(currentPageTarget?.snapshot?.url)!==origin||
         cookieSiteRecord(tool,origin)?.write!==true)
        throw Object.assign(new Error('请先授权当前网站写入 Cookie'),{code:'E_SITE_GRANT_REQUIRED'});
      if(!await admittedOfficialCookieImport(tool,revocationEpoch))
        throw Object.assign(new Error('仅正式 Cookie Editor 可一键保存'),{code:'E_TOOL_RUNTIME_UNAVAILABLE'});
      assertSession(source,token);
      if(websiteOrigin(currentPageTarget?.snapshot?.url)!==origin||
         cookieSiteRecord(tool,origin)?.write!==true)
        throw Object.assign(new Error('网站或授权已变化'),{code:'E_DOCUMENT_CHANGED'});
      return cookieWriteGate.start({owner:cookieImportOwner(tool,token,revocationEpoch),
        origin,name:payload.name,path:payload.path,action:writeAction,verifiedUserActivation:verifiedGesture});
    }
    if(operation==='cookieEditor.write.finish'){
      if(!payload||Object.keys(payload).join(',')!=='ref'||
         !Number.isSafeInteger(payload.ref)||payload.ref<1)
        throw Object.assign(new Error('无效的保存会话'),{code:'E_SCHEMA'});
      return cookieWriteGate.close(cookieImportOwner(tool,token,revocationEpoch),payload.ref);
    }
    // Browser SDK requests use the same sandbox instance and installation
    // check, but cross the trusted Chrome host without acquiring a UI lock
    // that would deadlock the host's existing per-tool Web Lock.
    if(operation.startsWith('browser.')){
      normalizeBrowserOperation(operation,payload);
      const browserExport=operation==='browser.clipboard.writeText'||operation==='browser.downloads.text';
      const isDiscovery=['browser.capabilities.list','browser.capabilities.getStatus'].includes(operation);
      if(!isDiscovery&&(!browserOperation(operation)||!browserOperation(operation).requiredCapabilities.every(cap=>tool.capabilities.includes(cap))))
        throw Object.assign(new Error('此工具没有获准浏览器能力'),{code:'E_TOOL_CAPABILITY_REQUIRED'});
      const owned=(await api.storage.local.get(SIDEBAR_TOOL_STORE))[SIDEBAR_TOOL_STORE];
      if(!requireCompleteInstalledSidebarTools(owned).some(row=>samePackage(row,tool)))
        throw Object.assign(new Error('工具已更新或卸载'),{code:'E_TOOL_CHANGED'});
      const epochs=(await api.storage.local.get(TOOL_REVOCATION_EPOCHS_STORE))[TOOL_REVOCATION_EPOCHS_STORE]||{};
      if((epochs[tool.id]??null)!==revocationEpoch)
        throw Object.assign(new Error('当前工具实例已撤销'),{code:'E_TOOL_CHANGED'});
      assertSession(source,token);
      const hostInstanceId=new URL(globalThis.location.href).searchParams.get('hostInstanceId');
      const packageHash=await sidebarToolPackageHash(tool);
      assertSession(source,token);
      let importBatchOwner=null,importBatchDocument=null,writeIntentOwner=null;
      const envelope={protocol:BROWSER_HOST_PROTOCOL,kind:'tool',
        operation,args:payload||{},toolId:tool.id,toolVersion:tool.version,
        installEpoch:revocationEpoch,packageHash,toolInstance:token,hostInstanceId};
      if(operation==='browser.page.getContext'){
        const target=currentPageTarget?.snapshot;
        if(target?.status!=='available')return {status:'unavailable',
          message:String(target?.message||'当前没有可用的普通网页').slice(0,250)};
        const captured=currentPageTarget.capture();
        await currentPageTarget.revalidate(captured);
        assertSession(source,token);
        const response=await api.runtime.sendMessage({protocol:BROWSER_HOST_PROTOCOL,
          kind:'host',operation,hostInstanceId,toolId:tool.id,toolVersion:tool.version,
          toolInstance:token,installEpoch:revocationEpoch,packageHash,
          document:{tabId:captured.tabId,windowId:captured.windowId,
            documentId:captured.documentId,url:captured.url,origin:captured.origin,
            title:String(captured.title||'').slice(0,512)}});
        assertSession(source,token);
        if(!response?.ok)throw Object.assign(new Error(response?.error?.message||'当前页引用验证失败'),
          {code:response?.error?.code||'E_DOCUMENT_STALE'});
        return response.data;
      }
      if(operation==='browser.scheduler.create'){
        if(!foundationClient?.request||!currentPageTarget?.capture||!currentPageTarget?.revalidate)
          throw Object.assign(new Error('现有任务与当前网页服务不可用'),{code:'E_SERVICE_UNSUPPORTED'});
        const selected=currentPageTarget.capture();
        const resolved=await foundationClient.request('resolveInstalledTask',{taskId:payload.taskId});
        if(String(resolved.revision)!==payload.revision)
          throw Object.assign(new Error('请指定已安装的固定任务 Revision'),{code:'E_TOOL_CHANGED'});
        const params={};
        validateTaskParams(resolved.manifest.paramsSchema,params);
        const timezone=Intl.DateTimeFormat().resolvedOptions().timeZone;
        const timing=scheduleSpecFromExpression(payload.schedule,timezone);
        const schedulerIntent={kind:'trusted-scheduler-create-intent-v1',request:payload,
          task:{taskId:resolved.taskId,version:resolved.version,manifestHash:resolved.manifestHash,
            sourceHash:resolved.contentHash,installationId:resolved.installationId,generation:resolved.generation,
            revision:resolved.revision,targetUrl:selected.url,params},
          schedule:{title:(tool.title+' · '+resolved.manifest.title).slice(0,80),timezone,...timing,
            misfirePolicy:'skip',startDeadlineMs:60000,openIfMissing:false,paused:false}};
        await currentPageTarget.revalidate(selected);
        assertSession(source,token);
        envelope.approvalRef=await requestBrowserClick({toolId:tool.id,button:'创建此计划',
          message:'「'+tool.title+'」请求定时执行 '+resolved.manifest.title+' · v'+resolved.version+
            ' / Revision '+payload.revision+'，网站 '+selected.url+'，'+payload.schedule.kind+' '+
            payload.schedule.expression+'（'+timezone+'），源码 '+resolved.contentHash.slice(0,12)+
            '。使用此任务的空参数，网页与可见运行宿主就绪时执行；以后无需 AI。',
          run:async()=>{
            assertSession(source,token);
            const response=await api.runtime.sendMessage({protocol:BROWSER_HOST_PROTOCOL,kind:'host',
              operation:'browser.intent.confirm',toolId:tool.id,toolVersion:tool.version,installEpoch:revocationEpoch,
              hostInstanceId,toolInstance:token,targetOperation:operation,targetArgs:payload,schedulerIntent,
              document:{tabId:selected.tabId,windowId:selected.windowId,documentId:selected.documentId,
                url:selected.url,origin:selected.origin}});
            if(!response?.ok)throw Object.assign(new Error(response?.error?.message||'计划授权未确认'),
              {code:response?.error?.code||'E_BROWSER'});
            return response.data.approvalRef;
          }});
        assertSession(source,token);
      }
      if(browserExport){
        // A sandbox-initiated request is NOT a trusted click, even when the
        // request originated from an iframe button. The visible Side Panel
        // confirms one exact call; the Host then consumes that approval once.
        const label=operation==='browser.clipboard.writeText'?'复制文本到剪贴板':/\.csv$/i.test(payload?.filename)?'导出 CSV 文件':'导出文本文件';
        envelope.approvalRef=await requestBrowserClick({toolId:tool.id,
          message:'「'+tool.title+'」请求'+label+'。仅允许本次操作。',
          button:'允许本次导出',run:async event=>{
            if(!event?.isTrusted)throw Object.assign(new Error('需要真实用户点击'),{code:'E_USER_GESTURE_REQUIRED'});
            assertSession(source,token);
            const approval=await api.runtime.sendMessage({protocol:BROWSER_HOST_PROTOCOL,kind:'host',
              operation:'browser.intent.confirm',toolId:tool.id,toolVersion:tool.version,
              installEpoch:revocationEpoch,packageHash,toolInstance:token,hostInstanceId,
              targetOperation:operation,targetArgs:payload||{}});
            if(!approval?.ok)throw Object.assign(new Error(approval?.error?.message||'Browser Host denied export'),{
              code:approval?.error?.code||'E_BROWSER'});
            return approval.data.approvalRef;
          }});
        assertSession(source,token);
      }
      if(operation==='browser.sidePanel.openSelf'){
        const preflight=await api.runtime.sendMessage(envelope);
        if(!preflight?.ok||preflight.data?.requiresVisibleUserClick!==true)
          throw Object.assign(new Error(preflight?.error?.message||'Side Panel Host denied'),
            {code:preflight?.error?.code||'E_BROWSER'});
        const windowInfo=await api.windows.getCurrent();
        const coordinator=createSidePanelOpenCoordinator({api,
          isCurrent:()=>sameInstance(source,token)&&active?.id===tool.id&&
            !readOnlyPreview&&!busy&&sidebarToolEnabled(enableRecords,tool.id)&&
            (revocationEpochs[tool.id]??null)===revocationEpoch,
          authorize:async()=>{
          assertSession(source,token);
          await assertSidebarToolEnabled(api,tool.id);
          const saved=(await api.storage.local.get(SIDEBAR_TOOL_STORE))[SIDEBAR_TOOL_STORE];
          const epochs=(await api.storage.local.get(TOOL_REVOCATION_EPOCHS_STORE))[TOOL_REVOCATION_EPOCHS_STORE]||{};
          return requireCompleteInstalledSidebarTools(saved).some(row=>samePackage(row,tool))&&
            (epochs[tool.id]??null)===revocationEpoch;
        }});
        const prepared=await coordinator.prepare({toolId:tool.id,hostInstanceId,windowId:windowInfo?.id});
        try{return await requestBrowserClick({toolId:tool.id,
          message:'「'+tool.title+'」请求打开 OpenDesk 自己的侧边栏。仅此一次。',
          button:'打开侧边栏',run:event=>coordinator.confirm(prepared.requestRef,event)});
        }finally{coordinator.dispose();}
      }
      if(['browser.tabs.create','browser.tabs.activateOwned','browser.tabs.pinOwned','browser.tabs.reloadOwned','browser.tabs.navigateOwned','browser.tabs.removeOwned','browser.network.request',
        'browser.network.observe.start','browser.network.observe.export',
        'browser.screenshot.captureVisible','browser.downloads.download','browser.downloads.cancelOwned','browser.bookmarks.createOwned','browser.bookmarks.removeOwned','browser.bookmarks.create','browser.bookmarks.update','browser.bookmarks.move','browser.bookmarks.remove','browser.bookmarks.removeTree','browser.storage.local.clear',
        'browser.proxy.managed.requestEnable','browser.proxy.managed.requestDisable'].includes(operation)){
        const target=operation==='browser.tabs.navigateOwned'?'将本工具标签页导航到同源站点 '+new URL(payload.url).origin+'（原 TabRef 将失效）':
          operation==='browser.tabs.reloadOwned'?'重新加载本工具拥有的标签页（原 TabRef 将失效）':
          operation==='browser.tabs.pinOwned'?(payload.pinned?'固定此工具此前打开的标签页':'取消固定此工具此前打开的标签页'):
          operation==='browser.tabs.removeOwned'?'关闭此工具此前打开的标签页（不可撤销）':
          operation==='browser.tabs.activateOwned'?'聚焦此工具此前打开的标签页':
          operation==='browser.tabs.create'?'打开网页 '+new URL(payload.url).origin:
          operation==='browser.network.observe.start'?'观察已打开标签页内 '+payload.origins[0]+' 的 HTTP 元数据':
          operation==='browser.network.observe.export'?'导出本工具已停止的网络观察为 JSON 文件':
          operation==='browser.screenshot.captureVisible'?'截取当前可见且已授权的网页，并打开 PNG 保存对话框':
          operation==='browser.downloads.download'?'下载网站 '+new URL(payload.url).origin+' 的指定文件（仅此一次）':
          operation==='browser.downloads.cancelOwned'?'取消本工具已发起、编号为 '+payload.downloadRef.slice(0,8)+'… 的下载':
          operation==='browser.bookmarks.createOwned'?'收藏网站 '+new URL(payload.url).origin+' 的指定网址':
          operation==='browser.bookmarks.create'?'向 Chrome 创建'+(payload.url?'书签':'文件夹')+'「'+payload.title+'」':
          operation==='browser.bookmarks.update'?'更新 Chrome 书签或文件夹 '+payload.id:
          operation==='browser.bookmarks.move'?'移动 Chrome 书签或文件夹 '+payload.id:
          operation==='browser.bookmarks.remove'?'删除 Chrome 书签或空文件夹 '+payload.id:
          operation==='browser.bookmarks.removeTree'?'递归删除 Chrome 非空文件夹 '+payload.id+' 及其全部子项（不可撤销）':
          operation==='browser.bookmarks.removeOwned'?'删除本工具创建的书签 '+payload.bookmarkRef.slice(0,8)+'…':
          operation==='browser.storage.local.clear'?'清空本工具保存的数据（不影响其他工具）':
          operation==='browser.proxy.managed.requestEnable'?'启用 Chrome 浏览器级分流代理；端点 '+payload.config.endpoint.scheme+'://'+payload.config.endpoint.host+':'+payload.config.endpoint.port+'；目标域名 '+payload.config.domains.join('、')+'；将影响匹配网站的所有标签页':
          operation==='browser.proxy.managed.requestDisable'?'停止当前安装确实拥有的 Chrome 分流代理（不会清除其他工具或扩展的配置）':
            '向 '+new URL(payload.url).origin+' 发送 '+payload.method+' HTTP 请求';
        let bookmarkConsent,bookmarkPrepared,bookmarkSender;
        if(['browser.bookmarks.createOwned','browser.bookmarks.removeOwned'].includes(operation)){
          bookmarkConsent=createToolPermissionConsent({api});
          bookmarkPrepared=await bookmarkConsent.prepare({toolId:tool.id,toolVersion:tool.version,
            packageHash,installEpoch:revocationEpoch,capability:'browser.bookmarks',
            ...(operation==='browser.bookmarks.createOwned'?{origin:new URL(payload.url).origin}:{})});
          const contexts=await api.runtime.getContexts({contextTypes:['SIDE_PANEL'],documentUrls:[globalThis.location.href]});
          if(contexts.length!==1||!contexts[0].documentId)
            throw Object.assign(new Error('请在真实 Side Panel 中授权书签权限'),{code:'E_DOCUMENT_CHANGED'});
          bookmarkSender={id:api.runtime.id,url:globalThis.location.href,frameId:0,
            documentId:contexts[0].documentId,documentLifecycle:'active'};
          assertSession(source,token);
        }
        const approvalRef=await requestBrowserClick({toolId:tool.id,
          message:'「'+tool.title+'」请求'+target+'；确认仅批准这一次操作。',
          button:'允许本次操作',run:async event=>{
            if(operation.startsWith('browser.proxy.managed.')&&!event?.isTrusted)
              throw Object.assign(new Error('代理操作需要可信 Side Panel 的真实点击'),
                {code:'E_USER_GESTURE_REQUIRED'});
            assertSession(source,token);
            // Optional Chrome permission prompts must run in this real trusted click,
            // before any await or Host RPC. Missing site grants remain Host-denied.
            if(operation==='browser.network.observe.start'){
              if(!event?.isTrusted)throw Object.assign(new Error('需要用户点击'),{code:'E_USER_GESTURE_REQUIRED'});
              const request=api.permissions.request({permissions:['webRequest']});
              if(await request!==true)throw Object.assign(new Error('未获 webRequest 权限'),{code:'E_CHROME_PERMISSION_REQUIRED'});
            }
            if(['browser.bookmarks.createOwned','browser.bookmarks.removeOwned'].includes(operation)){
              if(!event?.isTrusted)throw Object.assign(new Error('需要用户真实点击'),{code:'E_USER_GESTURE_REQUIRED'});
              // Prepared installed identity; request runs before the first await.
              const request=bookmarkConsent.requestForTool(event,bookmarkPrepared,{sender:bookmarkSender,hostInstanceId});
              await request;
            }
            const approval=await api.runtime.sendMessage({protocol:BROWSER_HOST_PROTOCOL,kind:'host',
              operation:'browser.intent.confirm',toolId:tool.id,toolVersion:tool.version,
              installEpoch:revocationEpoch,packageHash,toolInstance:token,hostInstanceId,
              targetOperation:operation,targetArgs:payload||{}});
            if(!approval?.ok)throw Object.assign(new Error(approval?.error?.message||'Browser Host approval denied'),
              {code:approval?.error?.code||'E_BROWSER'});
            return approval.data.approvalRef;
          }});
        assertSession(source,token);
        envelope.approvalRef=approvalRef;
      }

      if(['browser.cookies.set','browser.cookies.setMany','browser.cookies.remove','browser.cookies.clearSite','browser.cookies.observe.start'].includes(operation)&&
         !(operation==='browser.cookies.clearSite'&&payload?.preview===true)){
        const origin=new URL(payload.url).origin;
        const requiredCookieGrant=operation==='browser.cookies.clearSite'?'clear':
          operation==='browser.cookies.observe.start'?'observe':'write';
        const officialBatch=operation==='browser.cookies.setMany'&&
          tool.id==='cookie-editor'&&await admittedOfficialCookieImport(tool,revocationEpoch);
        if(!officialBatch&&cookieSiteRecord(tool,origin)?.[requiredCookieGrant]!==true){
          tocSettingsOpen=true;render();
          const currentOrigin=websiteOrigin(currentPageTarget?.snapshot?.url);
          throw Object.assign(new Error(currentOrigin!==origin?
            '请先激活 '+origin+' 标签页，再通过上方可信 Cookie 网站权限区授权 '+requiredCookieGrant:
            '请通过上方可信 Cookie 网站权限区授权 '+requiredCookieGrant+'；未保存草稿可保留'),
          {code:'E_SITE_GRANT_REQUIRED'});
        }
        // Only the official Cookie Editor may consume a trusted one-click
        // import intent; all other callers still see the original Host review.
        // This trusted branch mints an EXACT one-shot Host approval per chunk.
        if(officialBatch){
          assertSession(source,token);
          const owner=cookieImportOwner(tool,token,revocationEpoch);
          const sourceOrigin=websiteOrigin(currentPageTarget?.snapshot?.url);
          if(!sourceOrigin||cookieSiteRecord(tool,sourceOrigin)?.write!==true)
            throw Object.assign(new Error('当前网站写入授权已改变'),{code:'E_SITE_GRANT_REQUIRED'});
          const {captured,document}=captureCookieImportDocument();
          await currentPageTarget.revalidate(captured);
          assertSession(source,token);
          if(document.origin!==sourceOrigin)
            throw Object.assign(new Error('原始 Chrome 页面已变化'),{code:'E_DOCUMENT_CHANGED'});
          if(!cookieImportGate.acquire({owner,origin,count:payload.cookies.length,sourceOrigin,document}))
            throw Object.assign(new Error('一键导入操作未授权或已结束'),
              {code:'E_USER_GESTURE_REQUIRED'});
          {
            importBatchOwner=owner;
            importBatchDocument=captured;
            try{
              if(websiteOrigin(currentPageTarget?.snapshot?.url)!==sourceOrigin||
                 cookieSiteRecord(tool,sourceOrigin)?.write!==true)
                throw Object.assign(new Error('网站或写入授权已改变'),
                  {code:'E_DOCUMENT_CHANGED'});
              const approval=await api.runtime.sendMessage({protocol:BROWSER_HOST_PROTOCOL,kind:'host',
                operation:'browser.intent.confirm',toolId:tool.id,toolVersion:tool.version,
                installEpoch:revocationEpoch,toolInstance:token,hostInstanceId,
                targetOperation:operation,targetArgs:payload||{},cookieImportSource:sourceOrigin,document});
              if(!approval?.ok||typeof approval.data?.approvalRef!=='string')
                throw Object.assign(new Error(approval?.error?.message||'可信 Host 拒绝本次写入'),
                  {code:approval?.error?.code||'E_BROWSER'});
              assertSession(source,token);
              envelope.approvalRef=approval.data.approvalRef;
            }catch(error){cookieImportGate.revoke();throw error;}
          }
        }
        if(['browser.cookies.set','browser.cookies.remove'].includes(operation)&&
           tool.id==='cookie-editor'&&
           await admittedOfficialCookieImport(tool,revocationEpoch)){
          const owner=cookieImportOwner(tool,token,revocationEpoch);
          if(cookieWriteGate.acquire({owner,origin,name:payload.name,path:payload.path,
               action:operation==='browser.cookies.remove'?'remove':'set'})){
            writeIntentOwner=owner;
            try{
              assertSession(source,token);
              if(websiteOrigin(currentPageTarget?.snapshot?.url)!==origin||
                 cookieSiteRecord(tool,origin)?.write!==true)
                throw Object.assign(new Error('网站或授权已改变'),{code:'E_DOCUMENT_CHANGED'});
              const approval=await api.runtime.sendMessage({protocol:BROWSER_HOST_PROTOCOL,kind:'host',
                operation:'browser.intent.confirm',toolId:tool.id,toolVersion:tool.version,
                installEpoch:revocationEpoch,toolInstance:token,hostInstanceId,
                targetOperation:operation,targetArgs:payload||{}});
              if(!approval?.ok||typeof approval.data?.approvalRef!=='string')
                throw Object.assign(new Error('可信 Host 拒绝本次保存'),
                  {code:approval?.error?.code||'E_BROWSER'});
              assertSession(source,token);
              envelope.approvalRef=approval.data.approvalRef;
            }catch(error){cookieWriteGate.revoke();throw error;}
          }
        }
        if(!importBatchOwner&&!writeIntentOwner){
          const kind=operation==='browser.cookies.clearSite'?'清理该网站的 Host-only Cookie':
            operation==='browser.cookies.observe.start'?'开始临时监听 Cookie 变化':
            operation==='browser.cookies.remove'?'删除指定 Cookie':
            operation==='browser.cookies.setMany'?'批量写入 '+payload.cookies.length+' 条 Cookie':'写入指定 Cookie';
          const ref=await requestBrowserClick({toolId:tool.id,
            message:'「'+tool.title+'」请求在 '+origin+' '+kind+
              '。将仅使用当前已授权的 Cookie Store/Partition。本次操作不可自动重试。',
            button:'确认本次 Cookie 操作',run:async event=>{
              if(!event?.isTrusted)throw Object.assign(new Error('需要真实用户点击'),{code:'E_USER_GESTURE_REQUIRED'});
              assertSession(source,token);
              const approval=await api.runtime.sendMessage({protocol:BROWSER_HOST_PROTOCOL,kind:'host',
                operation:'browser.intent.confirm',toolId:tool.id,toolVersion:tool.version,
                installEpoch:revocationEpoch,toolInstance:token,hostInstanceId,
                targetOperation:operation,targetArgs:payload||{}});
              if(!approval?.ok)throw Object.assign(new Error(approval?.error?.message||'Cookie intent denied'),{
                code:approval?.error?.code||'E_BROWSER'});
              return approval.data.approvalRef;
            }});
          assertSession(source,token);
          envelope.approvalRef=ref;
        }
      }
      let reply;
      try{
        reply=await api.runtime.sendMessage(envelope);
        assertSession(source,token);
        if(!reply?.ok)throw Object.assign(new Error(reply?.error?.message||'浏览器操作失败'),{
          code:reply?.error?.code||'E_BROWSER'});
        if(importBatchOwner){
          await currentPageTarget.revalidate(importBatchDocument);
          assertSession(source,token);
          const receipts=reply.data?.results;
          const complete=Array.isArray(receipts)&&receipts.length===payload.cookies.length&&
            receipts.every((row,index)=>row?.index===index&&row.saved===true&&row.verified===true);
          cookieImportGate.settle({owner:importBatchOwner,
            count:payload.cookies.length,confirmed:complete});
        }
        if(writeIntentOwner)cookieWriteGate.settle({owner:writeIntentOwner});
      }catch(error){
        if(importBatchOwner)cookieImportGate.revoke();
        if(writeIntentOwner)cookieWriteGate.revoke();
        throw error;
      }
      if(browserExport){
        if(reply.data?.authorized!==true)
          throw Object.assign(new Error('Browser Host did not authorize this exact export'),{code:'E_OWNER'});
        // The privileged Side Panel document is the existing Clipboard /
        // Download driver. SW cannot use navigator.clipboard; no sandbox
        // receives native browser access or may bypass the one-use Host intent.
        await assertSidebarToolEnabled(api,tool.id);
        assertSession(source,token);
        if(operation==='browser.clipboard.writeText'){
          if(!globalThis.navigator?.clipboard?.writeText)
            throw Object.assign(new Error('剪贴板在当前环境不可用'),{code:'E_CHROME_UNSUPPORTED'});
          try{await globalThis.navigator.clipboard.writeText(payload.text);}
          catch{throw Object.assign(new Error('复制结果未知，请自行检查剪贴板，勿自动重试'),{code:'E_OUTCOME_UNKNOWN'});}
          try{assertSession(source,token);}
          catch{throw Object.assign(new Error('复制可能已经生效，请检查剪贴板，不可自动重试'),{code:'E_OUTCOME_UNKNOWN'});}
          return {copied:true};
        }
        if(!api.downloads?.download)
          throw Object.assign(new Error('下载服务不可用'),{code:'E_CHROME_UNSUPPORTED'});
        const filename=payload.filename;
        const url=browserTextDownloadUrl(payload);
        let downloadId;
        try{downloadId=await api.downloads.download({url,filename,saveAs:true,conflictAction:'uniquify'});}
        catch{throw Object.assign(new Error('下载结果未知，请检查 Chrome 下载记录，勿自动重试'),{code:'E_OUTCOME_UNKNOWN'});}
        if(!Number.isInteger(downloadId))throw Object.assign(
          new Error('Chrome 未确认下载，请检查下载记录，勿自动重试'),{code:'E_OUTCOME_UNKNOWN'});
        try{assertSession(source,token);}
        catch{throw Object.assign(new Error('下载可能已经开始，请检查下载记录，不可自动重试'),{code:'E_OUTCOME_UNKNOWN'});}
        // Native download ID remains private to the trusted Side Panel.
        return {started:true};
      }
      const frontendStatus=state=>{
        // Never turn a missing Chrome permission, rejected Origin, or denied
        // installation into callableNow merely because the trusted UI has a
        // clipboard/download function. Host must first approve the context.
        if(state?.implementation!=='implemented'||state?.authorization?.tool!=='granted'||
           state.reasonCode!=='E_FRONTEND_CONTEXT_REQUIRED')return state;
        const available=state.operation==='browser.clipboard.writeText'
          ?Boolean(globalThis.navigator?.clipboard?.writeText)
          :state.operation==='browser.downloads.text'?Boolean(api.downloads?.download)
          :state.operation==='browser.page.getContext'?true:null;
        if(available===null)return state;
        return {...state,platform:available?'supported':'unsupported',callableNow:available,
          reasonCode:available?null:'E_CHROME_UNSUPPORTED',nextAction:null};
      };
      if(operation==='browser.capabilities.getStatus')return frontendStatus(reply.data);
      if(operation==='browser.capabilities.list')return reply.data.map(row=>{
        const state=frontendStatus({operation:row.operation,implementation:row.implementation.toLowerCase(),
          authorization:{tool:row.status.exposure==='allowed'?'granted':'missing'},...row.status});
        return {...row,status:{...row.status,callableNow:state.callableNow,reasonCode:state.reasonCode}};
      });
      return reply.data;
    }
    if(!tool.capabilities.includes(operation.startsWith('storage.')?'storage.local':
       operation==='currentPage.info'?'currentPage.read':
       operation==='tasks.open'?'tasks.open':
       ['toc.snapshot','toc.navigate'].includes(operation)?TOC_CAPABILITY:
        CLIP_OPERATIONS.includes(operation)?CLIP_CAPABILITY:
      knowledgeOperation(operation)?KNOWLEDGE_CAPABILITY:
      PROMPT_PAGE_OPERATIONS.includes(operation)?PROMPT_CAPABILITY:
      TIME_REVIEW_OPERATIONS.includes(operation)?TIME_REVIEW_CAPABILITY:
      focus?.operations?.includes(operation)?focus.capability:
      adblock?.operations?.includes(operation)?adblock.capability:
      aiAccess?.operations?.includes(operation)?aiAccess.capability:
        '__unapproved__'))
      throw new Error('此工具没有被批准使用该能力');
    if(TIME_REVIEW_OPERATIONS.includes(operation)){
      if(tool.id!==TIME_REVIEW_ID)throw new Error('时间回顾工具身份无效');
      // The sandbox may REQUEST a start, never authorize it. Preserve the
      // current Time Review page and wait for one genuine extension-owned
      // confirmation click. The reviewed action pins the original iframe.
      if(operation==='time.start'){
        assertSession(source,token);
        // Read-only preparation is allowed; the sandbox never grants a site,
        // requests Chrome idle, or simulates a trusted click. Missing consent
        // reveals the EXISTING static trusted controls above the live iframe.
        const stored=(await api.storage.local.get(TIME_REVIEW_KEY))[TIME_REVIEW_KEY];
        const scope=stored?.siteGrants;
        const hasScope=scope?.allSites===true||Array.isArray(scope?.origins)&&scope.origins.length>0;
        const idleGranted=await api.permissions.contains({permissions:['idle']});
        assertSession(source,token);
        if(!hasScope||!idleGranted){
          tocSettingsOpen=true;render();requestToolFieldEffect(view, settingsView, 'scrollIntoView', {block:'nearest'});
          throw Object.assign(new Error(!hasScope?
            '请在上方原位授权卡中选择可记录的网站，再点击「开始／恢复记录」。':
            '请在上方原位授权卡中批准 Chrome 空闲检测，再点击「开始／恢复记录」。'),
          {code:'E_TIME_PERMISSION_SETUP'});
        }
        return requestBrowserClick({
          message:'开始／恢复已授权网站的本机时间记录？仅统计 Chrome 前台非空闲的使用时间。权限范围沿用之前经你单独批准的选择。',
          button:'确认开始记录',toolId:tool.id,
          run:event=>{
            assertSession(source,token);
            return runTrustedTimeReviewOperation('time.start',{},event);
          }
        });
      }
      // Site grants, minute retention changes and irreversible deletion still
      // live exclusively in precompiled trusted Host settings controls.
      if(operation==='time.clear'||operation==='time.minuteConsent'||operation==='time.siteGrant'){
        tocSettingsOpen=true;render();
        throw Object.assign(new Error(operation==='time.siteGrant'
          ?'请在工具详情设置中明确选择网站采集范围'
          :operation==='time.minuteConsent'?'请在工具详情设置中明确选择开启或关闭分钟明细'
          :'请在工具设置中审阅并明确选择「清空全部记录」'),
        {code:'E_TIME_TRUSTED_CLICK'});
      }
      assertSession(source,token);
      const owned=(await api.storage.local.get(SIDEBAR_TOOL_STORE))[SIDEBAR_TOOL_STORE];
      if(!requireCompleteInstalledSidebarTools(owned).some(row=>samePackage(row,tool)))throw new Error('工具已更新或卸载');
      const packageHash=await timeReviewPackageHash(tool);
      assertSession(source,token);
      const response=await api.runtime.sendMessage({protocol:TIME_REVIEW_PROTOCOL,toolId:tool.id,operation,payload,packageHash,installEpoch:revocationEpoch});
      if(!response?.ok)throw Object.assign(new Error(response?.error?.message||'时间回顾请求失败'),{code:response?.error?.code||'E_TIME_REVIEW'});
      assertSession(source,token);return response.data;
    }
    if(focus?.operations?.includes(operation))return focus.request({
      api,tool,operation,payload,revocationEpoch,
      assertCurrent:()=>assertSession(source,token),requestBrowserClick,
      openSettings:()=>{tocSettingsOpen=true;render();}
    });
    if(adblock?.operations?.includes(operation)){
      return adblock.request({api,tool,operation,payload,revocationEpoch,
        assertCurrent:()=>assertSession(source,token),requestBrowserClick,
        openSettings:()=>{tocSettingsOpen=true;render();}});
    }
    if(aiAccess?.operations?.includes(operation))return aiAccess.request({
      api,tool,operation,payload,revocationEpoch,
      assertCurrent:()=>assertSession(source,token),
      openSettings:()=>{tocSettingsOpen=true;render();}
    });
    if(operation==='knowledge.editorState'){
      if(tool.id!==KNOWLEDGE_TOOL_ID||typeof payload?.dirty!=='boolean')throw new Error('编辑状态无效');
      knowledgeDirty=payload.dirty;
      return {dirty:knowledgeDirty};
    }
    // The SW owns the same per-tool lock as install/remove. Forward BEFORE
    // taking that lock here, otherwise a request would deadlock itself.
    if(KNOWLEDGE_OPERATIONS.includes(operation)){
      if(tool.id!==KNOWLEDGE_TOOL_ID)throw new Error('知识收件箱工具身份无效');
      const owned=(await api.storage.local.get(SIDEBAR_TOOL_STORE))[SIDEBAR_TOOL_STORE];
      if(!requireCompleteInstalledSidebarTools(owned).some(row=>samePackage(row,tool)))throw new Error('工具已更新或卸载');
      const generations=(await api.storage.local.get(TOOL_REVOCATION_EPOCHS_STORE))[TOOL_REVOCATION_EPOCHS_STORE]||{};
      if((generations[tool.id]??null)!==revocationEpoch)
        throw Object.assign(new Error('旧工具实例已撤销；请先保留草稿再重新打开'),{code:'E_TOOL_CHANGED'});
      const packageHash=await knowledgePackageHash(tool);
      assertSession(source,token);
      const response=await api.runtime.sendMessage({protocol:KNOWLEDGE_PROTOCOL,toolId:tool.id,operation,payload,packageHash,installEpoch:revocationEpoch});
      assertSession(source,token);
      if(!response?.ok){const error=new Error(response?.error?.message||'知识收件箱未确认操作，请刷新核对');
        error.code=response?.error?.code||'E_KNOWLEDGE';throw error;}
      return response.data;
    }
    return locked('tool:'+tool.id,async()=>{
      assertSession(source,token);
      await assertSidebarToolEnabled(api,tool.id);
      const owned=(await api.storage.local.get(SIDEBAR_TOOL_STORE))[SIDEBAR_TOOL_STORE];
      if(!requireCompleteInstalledSidebarTools(owned).some(row=>samePackage(row,tool)))
        throw new Error('工具已更新或卸载');
      const generations=(await api.storage.local.get(TOOL_REVOCATION_EPOCHS_STORE))[TOOL_REVOCATION_EPOCHS_STORE]||{};
      if((generations[tool.id]??null)!==revocationEpoch)
        throw Object.assign(new Error('旧工具实例已撤销；请先保留草稿再重新打开'),{code:'E_TOOL_CHANGED'});
      assertSession(source,token);

      if(PROMPT_PAGE_OPERATIONS.includes(operation)){
        if(tool.id!==PROMPT_ID||!currentPageTarget?.capture||!currentPageTarget?.revalidate)
          throw Object.assign(new Error('提示词网站配置需要已安装的正式工具与活动网页'),{code:'E_TOOL_CONTEXT'});
        const selected=currentPageTarget.capture();
        let url;
        try{url=new URL(selected.url);}catch{
          throw Object.assign(new Error('当前网页地址不可用'),{code:'E_SITE_UNAVAILABLE'});
        }
        if(!['https:','http:'].includes(url.protocol)||url.username||url.password||
           !selected.origin||selected.origin!==url.origin)
          throw Object.assign(new Error('请选择普通 HTTP(S) 网页'),{code:'E_SITE_UNAVAILABLE'});
        if(operation==='prompt.page.context'){
          await currentPageTarget.revalidate(selected);assertSession(source,token);
          return {status:'available',origin:url.origin,path:url.pathname};
        }
        if(!api.tabs?.sendMessage)
          throw Object.assign(new Error('当前浏览器不支持可信页面通信'),{code:'E_CHROME_UNSUPPORTED'});
        if(operation==='prompt.page.pick.start'){
          if(!payload||!['container','editor'].includes(payload.kind)||
             Object.keys(payload).some(key=>key!=='kind'))
            throw Object.assign(new Error('请选择要定位的容器或输入框'),{code:'E_SCHEMA'});
        }else if(['prompt.page.pick.status','prompt.page.pick.cancel'].includes(operation)){
          if(!payload||typeof payload.session!=='string'||
             !/^[a-f0-9-]{24,64}$/.test(payload.session)||
             Object.keys(payload).some(key=>key!=='session'))
            throw Object.assign(new Error('无效的网页选取会话'),{code:'E_SCHEMA'});
        }else{
          if(!payload||Object.keys(payload).some(key=>key!=='rule'))
            throw Object.assign(new Error('无效的网站测试请求'),{code:'E_SCHEMA'});
          const normalize=globalThis.OpenDeskPromptShortcutsModel?.siteRule;
          if(typeof normalize!=='function')throw new Error('网站配置校验模块缺失');
          const rule=normalize(payload.rule);
          if(rule.origin!==url.origin)
            throw Object.assign(new Error('只能测试当前活动网站的规则'),{code:'E_SITE_SCOPE'});
        }
        await currentPageTarget.revalidate(selected);assertSession(source,token);
        // Existing content script is already scoped to the selected Chrome
        // tab + document. The sandbox never receives tabId or DOM handles.
        const response=await api.tabs.sendMessage(selected.tabId,{
          protocol:PROMPT_PICKER_PROTOCOL,toolId:tool.id,operation,expectedUrl:selected.url,
          ...(operation==='prompt.page.pick.start'?{kind:payload.kind,
            session:globalThis.crypto.randomUUID()}:{}),
          ...(['prompt.page.pick.status','prompt.page.pick.cancel'].includes(operation)?
            {session:payload.session}:{}),
          ...(operation==='prompt.page.check'?{rule:payload.rule}:{})
        },{frameId:0,documentId:selected.documentId});
        assertSession(source,token);
        await currentPageTarget.revalidate(selected);
        if(response?.ok!==true||!response.data)
          throw Object.assign(new Error(String(response?.error||'网页尚未就绪或已经切换').slice(0,180)),
            {code:'E_PROMPT_PAGE'});
        if(JSON.stringify(response.data).length>1600)
          throw Object.assign(new Error('网页检查数据超出受限响应大小'),{code:'E_LIMIT'});
        return response.data;
      }

      if(operation==='currentPage.info'){
        const target=currentPageTarget?.snapshot;
        return target?.status==='available'
          ?{status:'available',title:String(target.title||'').slice(0,512),url:String(target.url||'').slice(0,4096)}
          :{status:'unavailable',message:String(target?.message||'当前没有可用的普通网页').slice(0,250)};
      }
      if(operation==='toc.snapshot'||operation==='toc.navigate'){
        if(!currentPageTarget?.capture||!currentPageTarget?.revalidate||!api.tabs?.sendMessage)
          throw new Error('当前网页的目录服务不可用');
        const target=currentPageTarget.capture();
        const sites=(await api.storage.local.get(READING_TOC_SITE_STORE))[READING_TOC_SITE_STORE];
        const pages=(await api.storage.local.get(READING_TOC_PAGE_RULES_STORE))[READING_TOC_PAGE_RULES_STORE];
        if(tool.id===READING_TOC_TOOL_ID){
          const saved=await api.storage.local.get([SIDEBAR_TOOL_STORE,SIDEBAR_TOOL_ENABLE_STORE,MARKET_PROVENANCE_STORE]);
          const verified=await verifyOfficialReadingToc(saved[SIDEBAR_TOOL_STORE],saved[MARKET_PROVENANCE_STORE]);
          // Only a verified official installation may reveal the user's
          // intentional site stop. Never grant page access on this path.
          if(verified&&!tocSiteAllowed(sites,tool.id,target.url))
            throw new Error('当前网站已停用，请在工具设置中恢复');
          if(!tocGrantAllowed(saved[SIDEBAR_TOOL_STORE],sites,tool.id,target.url,
            saved[SIDEBAR_TOOL_ENABLE_STORE],verified))
            throw new Error('官方阅读目录的安装身份或访问范围未通过校验，请通过官方目录重新安装');
        }
        if(!readingTocPageAllowed(pages,tool.id,target.url))throw new Error('当前页面已设置为不可用');
        if(!target.origin||!tocSiteAllowed(sites,tool.id,target.url))
          throw new Error(tool.id===READING_TOC_TOOL_ID?'当前网站已停用，请在工具设置中恢复':'请在工具详情设置中授权当前网站');
        let id,sourceId;
        if(operation==='toc.navigate'){
          id=payload?.id;sourceId=payload?.sourceId;
          if(typeof id!=='string'||!/^h-\d{1,8}$/.test(id)||
             typeof sourceId!=='string'||!/^s-\d{1,8}$/.test(sourceId))
            throw new Error('章节标识无效');
        }
        await currentPageTarget.revalidate(target);
        assertSession(source,token);
        let response;
        try{
          response=await api.tabs.sendMessage(target.tabId,{
            protocol:READING_TOC_PROTOCOL,operation,toolId:tool.id,expectedUrl:target.url,installEpoch:revocationEpoch,
            ...(id?{id,sourceId}:{}),
            ...(operation==='toc.snapshot'&&payload?.refresh===true?{forceRefresh:true}:{})
          },{frameId:0,documentId:target.documentId});
        }catch(error){
          if(/receiving end does not exist|could not establish connection|cannot access contents|cannot access a chrome/i.test(
            String(error?.message||error)))
            throw new Error('网页目录脚本未接入或 Chrome 网站访问已受限，请刷新网页，或在 Chrome 扩展详情恢复该网站访问');
          throw error;
        }
        assertSession(source,token);
        await currentPageTarget.revalidate(target);
        if(!response?.ok)throw new Error(String(response?.error||'目录读取或跳转失败').slice(0,200));
        const data=response.data;
        if(!data||JSON.stringify(data).length>85000)throw new Error('目录数据超出大小限制');
        return data;
      }
      if(CLIP_OPERATIONS.includes(operation)){
        if(!currentPageTarget?.capture||!currentPageTarget?.revalidate||!api.tabs?.sendMessage)
          throw new Error('网页剪藏不可用');
        const target=currentPageTarget.capture();
        const grants=(await api.storage.local.get(CLIP_SITE_STORE))[CLIP_SITE_STORE];
        if(!target.origin||!grantedOrigins(grants,tool.id).includes(target.origin))
          throw new Error('请先在工具列表授权当前网站的剪藏权限');
        await currentPageTarget.revalidate(target);
        assertSession(source,token);
        const response=await api.tabs.sendMessage(target.tabId,{
          protocol:CLIP_PROTOCOL,operation,toolId:tool.id,expectedUrl:target.url,
          installEpoch:revocationEpoch
        },{frameId:0,documentId:target.documentId});
        assertSession(source,token);
        await currentPageTarget.revalidate(target);
        if(!response?.ok)throw new Error(String(response?.error||'剪藏失败').slice(0,200));
        const data=response.data;
        if(!data||typeof data.markdown!=='string'||typeof data.source!=='string'||
          new TextEncoder().encode(JSON.stringify(data)).length>160000)
          throw new Error('剪藏响应过大或格式无效');
        const latest=(await api.storage.local.get(CLIP_SITE_STORE))[CLIP_SITE_STORE];
        if(!grantedOrigins(latest,tool.id).includes(target.origin))
          throw new Error('网站剪藏授权已撤销');
        assertSession(source,token);return data;
      }
      if(operation==='tasks.open'){
        if(typeof payload?.taskId!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,59}$/.test(payload.taskId))
          throw new Error('任务标识无效');
        const opened=taskWorkbench.focusInstalledTask(payload.taskId);
        if(!opened)throw new Error('该任务未安装或未启用');
        suspendTool();
        return {opened:true};
      }
      if(operation!=='storage.get'&&operation!=='storage.set')throw new Error('不支持此操作');
      const key=payload?.key;
      if(typeof key!=='string'||!/^[a-zA-Z][a-zA-Z0-9._-]{0,59}$/.test(key))
        throw new Error('存储字段名称无效');
      const namespace=sidebarToolStorageKey(tool.id);
      const stored=(await api.storage.local.get(namespace))[namespace]||{};
      if(!stored||typeof stored!=='object'||Array.isArray(stored))throw new Error('工具数据无效');
      const current=Object.hasOwn(stored,key)?stored[key]:null;
      if(operation==='storage.get')return payload?.withEtag===true
        ?{value:current,etag:await etagFor(current)}:{value:current};
      let encoded;
      try{encoded=JSON.stringify(payload.value);}
      catch{throw new Error('只能保存可序列化数据');}
      if(typeof encoded!=='string'||new TextEncoder().encode(encoded).byteLength>SIDEBAR_TOOL_DATA_LIMITS.itemBytes)
        throw Object.assign(new Error('单项工具数据超过 8 KB'),{code:'E_TOOL_DATA_LIMIT'});
      if(!sameInstance(source,token))throw new Error('工具界面已经切换');
      if(Object.hasOwn(payload||{},'ifMatch')){
        if(typeof payload.ifMatch!=='string'||!/^[a-f0-9]{64}$/.test(payload.ifMatch))
          throw new Error('存储版本参数无效');
        if(payload.ifMatch!==await etagFor(current))
          throw Object.assign(new Error('工具数据已在其他窗口修改，请重新打开确认'),{code:'E_STORAGE_CONFLICT'});
      }
      const next={...stored,[key]:JSON.parse(encoded)};
      if(Object.keys(next).length>SIDEBAR_TOOL_DATA_LIMITS.maxKeys||
        new TextEncoder().encode(JSON.stringify(next)).byteLength>SIDEBAR_TOOL_DATA_LIMITS.totalBytes)
        throw Object.assign(new Error('工具数据超过 32 KB'),{code:'E_TOOL_DATA_LIMIT'});
      assertSession(source,token);
      await writeVerifiedLocalValue(api,namespace,next,stored,'工具数据');
      assertSession(source,token);
      return Object.hasOwn(payload||{},'ifMatch')
        ?{saved:true,etag:await etagFor(next[key])}:{saved:true};
    });
  }
  // Optional conditional writes are compared under the existing per-tool Web Lock.
  // No R1 tool-data schema or namespace changes are required.
  const etagFor=async value=>{
    // Chrome Storage may reorder object keys. Tokens describe values, not insertion order.
    const encoded=JSON.stringify(value,(_key,row)=>row&&typeof row==='object'&&!Array.isArray(row)
      ?Object.fromEntries(Object.keys(row).sort().map(key=>[key,row[key]])):row);
    const digest=await globalThis.crypto.subtle.digest('SHA-256',
      new TextEncoder().encode(encoded));
    return Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
  };
  const queued=new Map();
  function onMessage(event) {
    // Sandbox pages have opaque origin; checking the claimed id/origin alone is insufficient.
    if(event.origin!=='null'||!sameInstance(event.source,event.data?.instance)||
       event.data?.protocol!==SIDEBAR_TOOL_PROTOCOL||event.data?.toolId!==active.id)return;
    const message=event.data;
    if(message.kind==='draft'){
      if(typeof message.text==='string'&&message.text.length<=150000)
        frameDraft=message.text+(message.truncated===true?'\n（内容过长，仅保留前 150000 字符）':'');
      return;
    }
    if(message.kind==='status'){
      if(message.state==='ready')notice('');
      else if(message.state==='error')notice(active.title+'：'+String(message.message||'').slice(0,240),true);
      return;
    }
    if(message.kind==='dirty'){
      toolDirty=true;
      if(readOnlyPreview)previewDirty=true;
      return;
    }
    if(message.kind==='edit-state'){
      if(typeof message.dirty==='boolean'&&typeof message.busy==='boolean'){
        toolDirty=message.dirty;toolSaving=message.busy;
      }
      return;
    }
    if(message.kind==='resize'){
      // Only live frame, null origin, matching tool ID and session are accepted above.
      if(active?.id==='cookie-editor'){fitCookieFrame();return;}
      if(Number.isInteger(message.height)&&message.height>=80&&message.height<=4000){
        // The Time Review long-form settings / zoomed Canvas can legitimately
        // exceed the general tool limit. Keep one outer workspace scroll,
        // without changing other installed tools' height policy.
        const isTimeReview=active?.id===TIME_REVIEW_ID;
        frame.style.height=Math.max(140,Math.min(isTimeReview?4000:1600,message.height))+'px';
        if(isTimeReview)frame.style.maxHeight='none';
      }
      return;
    }
    if(message.kind!=='request'||typeof message.requestId!=='string'||message.requestId.length>32||typeof message.operation!=='string')return;
    let rateExceeded=false;
    if(message.operation==='knowledge.editorState'){
      // This bounded notification has no content API cost or external effect.
      rateExceeded=false;
    }else if(knowledgeOperation(message.operation)){
      if(Date.now()-knowledgeWindowStart>=60000){knowledgeWindowStart=Date.now();knowledgeRequestCount=0;}
      rateExceeded=++knowledgeRequestCount>100;
    }else{
      if(Date.now()-requestWindow>=60000){requestCount=0;requestWindow=Date.now();}
      // Every accepted read must reply, never silently time out.
      rateExceeded=++requestCount>120;
    }
    const token=instance,source=event.source,tool=active,revocationEpoch=frameRevocationEpoch;
    const verifiedGesture=(message.operation==='cookieEditor.import.begin'||
      message.operation==='cookieEditor.write.begin')&&
      globalThis.navigator?.userActivation?.isActive===true;
    const reply=(ok,result,error)=>{
      if(sameInstance(source,token))source.postMessage({
        protocol:SIDEBAR_TOOL_PROTOCOL,kind:'response',instance:token,toolId:tool.id,
        requestId:message.requestId,ok,...(ok?{result}:{error:{code:String(error?.code||'E_TOOL').slice(0,64),
          message:String(error?.message||error).slice(0,250)}})
      },'*');
    };
    const budget=checkSidebarToolRequestBudget(message);
    if(!budget.ok){
      reply(false,null,Object.assign(new Error('工具请求未通过容量或格式检查'),{code:budget.code}));
      return;
    }
    if(message.operation==='knowledge.editorState'){
      // Set the guard immediately; do not queue it behind content operations.
      void dispatch(message.operation,message.payload,tool,source,token,revocationEpoch,verifiedGesture).then(result=>reply(true,result),error=>reply(false,null,error));
      return;
    }
    if(rateExceeded){reply(false,null,new Error(knowledgeOperation(message.operation)?'工具请求过于频繁，请稍后重试':'工具请求过于频繁，请一分钟后重试'));return;}
    // Serialize mutations for each tool; concurrent set operations cannot overwrite each other.
    const previous=queued.get(tool.id)||Promise.resolve();
    const work=previous.catch(()=>{}).then(()=>dispatch(message.operation,message.payload,tool,source,token,revocationEpoch,verifiedGesture));
    if(message.operation==='storage.set')queued.set(tool.id,work);
    work.then(async result=>{
      if(!readOnlyPreview){
        await assertSidebarToolEnabled(api,tool.id);
        const epochs=(await api.storage.local.get(TOOL_REVOCATION_EPOCHS_STORE))[TOOL_REVOCATION_EPOCHS_STORE];
        if((epochs?.[tool.id]??null)!==revocationEpoch)throw new Error('工具请求已撤销，请核对实际结果');
      }
      assertSession(source,token);
      if(['browser.launch.consume','browser.page.getSelection'].includes(message.operation)&&
         (!Number.isFinite(result?.expiresAt)||Date.now()>=result.expiresAt))
        throw Object.assign(new Error('选区在交付前已过期；不能重放旧领取'),{code:'E_LAUNCH_EXPIRED'});
      reply(true,result);
    }).catch(error=>reply(false,null,error));
    work.finally(()=>{if(queued.get(tool.id)===work)queued.delete(tool.id);}).catch(()=>{});
  }
  const admittedList=admittedSidebarToolPackages;
  // Other Side Panels may update/uninstall a tool. Revoke the old iframe immediately.
  const onToolStorageChanged=(changes,area)=>{
    if(disposed||area!=='local')return;
    // SW may record a genuine install intent while the first-party UI is open.
    if(changes?.[DEFAULT_PREINSTALL_STORE]?.newValue?.state==='pending')
      void runDefaultPreinstall();
    if([SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE,SIDEBAR_TOOL_STORE,
      MARKET_PROVENANCE_STORE,BROWSER_MENU_GRANTS_STORE].some(key=>Object.hasOwn(changes||{},key)))
      (cookieImportGate.revoke(),cookieWriteGate.revoke());
    if([SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE,SIDEBAR_TOOL_STORE].some(key=>Object.hasOwn(changes||{},key)))
      if(pendingAction?.cancel)cancelActionReview();
    if(Object.hasOwn(changes||{},SIDEBAR_TOOL_ENABLE_STORE)){
      enableReadEpoch++;enableRecords=changes[SIDEBAR_TOOL_ENABLE_STORE]?.newValue;
      try{requireToolEnableRecords(enableRecords);enableReadError=false;}catch{enableReadError=true;}
      if(active&&!readOnlyPreview&&(enableReadError||!sidebarToolEnabled(enableRecords,active.id))){
        if(toolDirty||toolSaving||knowledgeDirty)recoverableDrafts.set(active.id,frameDraft||'未收到可恢复的表单内容；工具已安全停止。');
        destroyFrame();toolDirty=false;toolSaving=false;knowledgeDirty=false;tocSettingsOpen=true;
      }
      render();
    }
    if(Object.hasOwn(changes||{},BROWSER_MENU_GRANTS_STORE)){
      menuGrants=changes[BROWSER_MENU_GRANTS_STORE]?.newValue||{};
      if(active?.id===TRUSTED_BOOKMARK_ID&&nativeUI?.kind==='bookmark'){
        const grant=menuGrants?.[TRUSTED_BOOKMARK_ID];
        if(grant?.bookmarkFull!==true||grant.version!==active.version||
           grant.installEpoch!==frameRevocationEpoch){
          destroyFrame();tocSettingsOpen=true;
          notice('完整书签授权已撤销，已清除可信视图中的书签数据。',true);
        }
      }
      render();
      if(isCookieTool(active)&&frame&&instance)
        frame.contentWindow?.postMessage({protocol:SIDEBAR_TOOL_PROTOCOL,
          kind:'cookie-grants-changed',instance,toolId:active.id},'*');
    }
    if(Object.hasOwn(changes||{},CAPTURE_SITE_STORE)){
      captureGrants=changes[CAPTURE_SITE_STORE]?.newValue||{};render();
      // Revoking capture stops future page reads; explicitly saved local assets remain available.
    }
    if(Object.hasOwn(changes||{},READING_TOC_SITE_STORE)){
      siteEpoch++;siteGrants=changes[READING_TOC_SITE_STORE]?.newValue||{};render();
    }
    if(Object.hasOwn(changes||{},READING_TOC_VISIBILITY_STORE)){
      tocVisibilityEpoch++;tocVisibility=changes[READING_TOC_VISIBILITY_STORE]?.newValue||{};render();
    }
    if(Object.hasOwn(changes||{},READING_TOC_PAGE_RULES_STORE)){
      tocPageRulesEpoch++;tocPageRules=changes[READING_TOC_PAGE_RULES_STORE]?.newValue||{};render();
    }
    if(Object.hasOwn(changes||{},CLIP_SITE_STORE)){
      const change=changes[CLIP_SITE_STORE];
      clipSiteEpoch++;clipGrants=change?.newValue||{};
      // A revoked body-read grant also discards already visible content
      // in the active clipper iframe; never leave cached body text on screen.
      if(active?.capabilities.includes(CLIP_CAPABILITY)&&!readOnlyPreview){
        const oldOrigins=grantedOrigins(change?.oldValue||{},active.id);
        const newOrigins=grantedOrigins(clipGrants,active.id);
        if(oldOrigins.some(origin=>!newOrigins.includes(origin))){
          suspendTool();notice('网站剪藏授权已撤销；已关闭含正文的工具界面。',true);
        }
      }
      render();
    }
    if(Object.hasOwn(changes||{},TOOL_REVOCATION_EPOCHS_STORE)){
      revocationReadEpoch++;
      revocationEpochs=changes[TOOL_REVOCATION_EPOCHS_STORE]?.newValue||{};
      if(active&&!readOnlyPreview&&frameRevocationEpoch!==(revocationEpochs[active.id]??null)){
        if(nativeUI||nativePending){
          destroyFrame();tocSettingsOpen=true;render();
          notice('可信工具安装代际已撤销；请重新打开已核验工具。',true);
        }else notice('当前工具实例已撤销；草稿仍在当前页面，请复制后重新打开。',true);
      }
    }
    if(Object.hasOwn(changes||{},MARKET_PROVENANCE_STORE)&&(nativeUI||nativePending)&&
       (active?.id===TIME_REVIEW_ID
         ?trustedTimeReviewProvenanceChanged(changes[MARKET_PROVENANCE_STORE])
         :active?.id===TRUSTED_BOOKMARK_ID
           ?trustedBookmarkProvenanceChanged(changes[MARKET_PROVENANCE_STORE])
           :false)){
      // Only this admitted tool's own provenance revokes its React/native UI.
      destroyFrame();tocSettingsOpen=true;render();
      notice('官方来源身份发生变化；可信 UI 已关闭。',true);
    }
    // Do not refresh the native view for every TIME_REVIEW_KEY write: the
    // Host persists status reads, and echoing them would form a poll loop.
    if(!Object.hasOwn(changes||{},SIDEBAR_TOOL_STORE))return;
    catalogEpoch++;
    let fresh;
    try{
      fresh=requireCompleteInstalledSidebarTools(changes[SIDEBAR_TOOL_STORE]?.newValue);
      installedReadError=false;
    }catch(error){
      installedReadError=true;
      render();
      notice((error?.code||'E_STORAGE_CORRUPT')+'：本机安装记录异常，已停止操作以保留原数据。',true);
      return;
    }
    const selected=active&&fresh.find(row=>row.id===active.id);
    const invalidated=active&&!readOnlyPreview&&(!selected||!samePackage(selected,active));
    if(invalidated)suspendTool();
    installed=fresh;
    if(pendingAction?.toolId&&!fresh.some(row=>row.id===pendingAction.toolId))cancelActionReview();
    if(!busy && pending) {
      const current=toolById(pending.id);
      const stillReviewed=(!current&&!pendingBaseline) ||
        (current&&pendingBaseline&&samePackage(current,pendingBaseline));
      if(!stillReviewed){
        fileSelection++;resetReview();patchToolField(view, fileInput, {value: ''});
        setFileError('已安装工具发生变化，请重新选择文件核对权限');
      }
    }
    render();
    if(invalidated){
      if(visible)requestToolFieldEffect(view, importTrigger, 'focus', {preventScroll:true});
      notice('工具已在其他窗口更新或卸载，旧界面已关闭。',true);
    }
  };
  if(api.storage.onChanged?.addListener){
    api.storage.onChanged.addListener(onToolStorageChanged);
    listeners.push(()=>api.storage.onChanged.removeListener(onToolStorageChanged));
  }
  async function runDefaultPreinstall(){
    if(disposed)return;
    if(preinstallBusy){preinstallQueued=true;return;}
    preinstallBusy=true;
    try{
      const result=await resumeDefaultPreinstall({api,lockManager,fetcher});
      if(disposed)return;
      if(result.state==='complete')await loadInstalled();
      if(result.state==='attention')notice('官方预装事务结果未确认，请到应用市场核对；不会重复安装。',true);
    }catch(error){
      if(!disposed)notice('官方预装未完成（不会盲目重试）：'+
        (error?.code||'E_PREINSTALL')+' '+String(error?.message||error),true);
    }finally{
      preinstallBusy=false;render();
      // onInstalled might record the marker while the first read is pending.
      // Do not lose that event or spin on unrelated storage notifications.
      if(preinstallQueued&&!disposed){preinstallQueued=false;void runDefaultPreinstall();}
    }
  }
  async function loadInstalled() {
    const epoch=catalogEpoch,revocationRead=revocationReadEpoch;
    try{
      const [result,epochs]=await Promise.all([
        api.storage.local.get(SIDEBAR_TOOL_STORE),
        api.storage.local.get(TOOL_REVOCATION_EPOCHS_STORE)]);
      if(disposed||catalogEpoch!==epoch)return;
      const fresh=requireCompleteInstalledSidebarTools(result[SIDEBAR_TOOL_STORE]);
      if(revocationRead===revocationReadEpoch)
        revocationEpochs=epochs[TOOL_REVOCATION_EPOCHS_STORE]||{};
      installed=fresh;installedReadError=false;
      render();
    }catch(error){
      installedReadError=true;
      render();
      throw error;
    }
  }
  async function loadEnableRecords(){
    const epoch=enableReadEpoch;
    try{const saved=await api.storage.local.get(SIDEBAR_TOOL_ENABLE_STORE);
      if(disposed||epoch!==enableReadEpoch)return;
      enableRecords=saved[SIDEBAR_TOOL_ENABLE_STORE];requireToolEnableRecords(enableRecords);enableReadError=false;
    }catch(error){if(epoch!==enableReadEpoch||disposed)return;enableReadError=true;throw error;}finally{render();}
  }
  async function loadSites(){
    const epoch=siteEpoch;
    const result=await api.storage.local.get(READING_TOC_SITE_STORE);
    if(disposed||epoch!==siteEpoch)return;
    siteGrants=result[READING_TOC_SITE_STORE]||{};render();
  }
  async function loadTocVisibility(){
    const epoch=tocVisibilityEpoch;
    const stored=await api.storage.local.get(READING_TOC_VISIBILITY_STORE);
    if(disposed||epoch!==tocVisibilityEpoch)return;
    tocVisibility=stored[READING_TOC_VISIBILITY_STORE]||{};render();
  }
  async function loadTocPageRules(){
    const epoch=tocPageRulesEpoch;
    const saved=await api.storage.local.get(READING_TOC_PAGE_RULES_STORE);
    if(disposed||epoch!==tocPageRulesEpoch)return;
    tocPageRules=saved[READING_TOC_PAGE_RULES_STORE]||{};render();
  }
  async function loadClipSites(){
    const epoch=clipSiteEpoch;
    const stored=await api.storage.local.get(CLIP_SITE_STORE);
    if(disposed||epoch!==clipSiteEpoch)return;
    clipGrants=stored[CLIP_SITE_STORE]||{};render();
  }
  // Clicking the precise-origin permission/visibility control is the user's
  // explicit choice. Serialize a tool's in-flight UI actions instead of asking
  // for a second blocking JavaScript confirm or racing two storage changes.
  async function runSiteToggle(id,perform){
    if(disposed||busy||!id||siteTogglePending.has(id))return;
    siteTogglePending.add(id);render();
    try{await perform();}
    finally{siteTogglePending.delete(id);render();}
  }

  async function changeCaptureSite(id,origin,enabled,target=null){
    const tool=toolById(id);
    if(id!==KNOWLEDGE_TOOL_ID||!tool?.capabilities.includes(CAPTURE_CAPABILITY))throw new Error('知识保存工具已变化');
    await locked('tool:'+id,()=>locked('catalog',async()=>{
      const current=admittedList((await api.storage.local.get(SIDEBAR_TOOL_STORE))[SIDEBAR_TOOL_STORE]);
      if(!current.some(row=>samePackage(row,tool)))throw new Error('知识保存工具已更新');
      if(target)await currentPageTarget.revalidate(target);
      const raw=(await api.storage.local.get(CAPTURE_SITE_STORE))[CAPTURE_SITE_STORE],saved=raw||{};
      const next=changeCaptureGrant(saved,id,origin,enabled);
      await writeVerifiedLocalValue(api,CAPTURE_SITE_STORE,next,raw,'知识保存网站授权');captureGrants=next;
    }));
    render();notice(enabled?'已启用回答下方的知识保存按钮':'已停用网页按钮，已保存的收件箱内容保留');
  }
  async function toggleCaptureSite(id){
    if(disposed||busy||!currentPageTarget?.capture||!currentPageTarget?.revalidate)return;
    const target=currentPageTarget.capture(),origin=chatCaptureOrigin(target.url);
    if(!origin)throw new Error('请先打开 ChatGPT 对话页面');
    const enabled=grantedOrigins(captureGrants,id).includes(origin);
    // The labeled site control already expresses the user's permission choice.
    // Chrome host permissions and operation-time checks remain separate.
    await changeCaptureSite(id,origin,!enabled,target);
  }
  async function toggleClipSite(id){
    if(disposed||busy)return;
    const tool=toolById(id);
    if(!tool?.capabilities.includes(CLIP_CAPABILITY)||!currentPageTarget?.capture||!currentPageTarget?.revalidate)
      throw new Error('剪藏工具或网页不可用');
    const target=currentPageTarget.capture(),origin=websiteOrigin(target.url);
    if(!origin)throw new Error('当前网站不支持剪藏授权');
    const enabled=grantedOrigins(clipGrants,id).includes(origin);
    // The user-initiated site toggle is the application-level permission decision.
    // Keep browser permissions, origin identity and document revalidation intact.
    await locked('tool:'+id,()=>locked('catalog',async()=>{
      const current=admittedList((await api.storage.local.get(SIDEBAR_TOOL_STORE))[SIDEBAR_TOOL_STORE]);
      if(!current.some(row=>samePackage(row,tool)))throw new Error('剪藏工具已变化');
      await currentPageTarget.revalidate(target);
      const raw=(await api.storage.local.get(CLIP_SITE_STORE))[CLIP_SITE_STORE],saved=raw||{};
      if(grantedOrigins(saved,id).includes(origin)!==enabled)throw new Error('剪藏授权已在其他窗口改变');
      const next=changeClipGrant(saved,id,target.url,!enabled);
      await writeVerifiedLocalValue(api,CLIP_SITE_STORE,next,raw,'剪藏网站授权');clipGrants=next;
    }));
    render();notice(enabled?'已撤销网站剪藏授权':'已授权当前网站剪藏');
  }
  async function revokeClipOrigin(id,origin){
    if(disposed||busy)return;
    const tool=toolById(id);
    if(!tool?.capabilities.includes(CLIP_CAPABILITY))throw new Error('剪藏工具已变化');
    await locked('tool:'+id,()=>locked('catalog',async()=>{
      const current=admittedList((await api.storage.local.get(SIDEBAR_TOOL_STORE))[SIDEBAR_TOOL_STORE]);
      if(!current.some(row=>samePackage(row,tool)))throw new Error('剪藏工具已变化');
      const raw=(await api.storage.local.get(CLIP_SITE_STORE))[CLIP_SITE_STORE],saved=raw||{};
      const next=changeClipGrant(saved,id,origin,false);
      await writeVerifiedLocalValue(api,CLIP_SITE_STORE,next,raw,'剪藏网站授权');clipGrants=next;
    }));
    render();notice('已撤销 '+origin+' 的剪藏授权');
  }
  async function toggleTocDisplay(id,scope){
    if(disposed||busy)return;
    const item=toolById(id);
    if(id!==READING_TOC_TOOL_ID||!item?.capabilities.includes(TOC_CAPABILITY)||
       !currentPageTarget?.capture||!currentPageTarget?.revalidate)
      throw new Error('阅读目录或当前网页不可用');
    const target=currentPageTarget.capture(),url=target.url;
    if(!websiteOrigin(url))throw new Error('当前网页不支持目录显示偏好');
    const before=readingTocDisplayState(tocVisibility,id,url);
    const wasHidden=scope==='quick'?!before.show:scope==='site'?before.hiddenOnSite:before.hiddenOnPage;
    await locked('tool:'+id,()=>locked('catalog',async()=>{
      const fresh=admittedList((await api.storage.local.get(SIDEBAR_TOOL_STORE))[SIDEBAR_TOOL_STORE]);
      if(!fresh.some(row=>samePackage(row,item)))throw new Error('工具安装状态已变化');
      await currentPageTarget.revalidate(target);
      const stored=(await api.storage.local.get(READING_TOC_VISIBILITY_STORE))[READING_TOC_VISIBILITY_STORE]||{};
      await assertSidebarToolEnabled(api,id);
      const grants=(await api.storage.local.get(READING_TOC_SITE_STORE))[READING_TOC_SITE_STORE];
      const pages=(await api.storage.local.get(READING_TOC_PAGE_RULES_STORE))[READING_TOC_PAGE_RULES_STORE];
      if(!tocSiteAllowed(grants,id,url)||!readingTocPageAllowed(pages,id,url))
        throw new Error('请先在设置中启用网站并恢复当前页面');
      const actual=readingTocDisplayState(stored,id,url);
      if((scope==='quick'?!actual.show:scope==='site'?actual.hiddenOnSite:actual.hiddenOnPage)!==wasHidden)
        throw new Error('目录显示偏好已在其他窗口发生变化，请重试');
      let next=changeReadingTocVisibility(stored,id,url,scope==='quick'?'site':scope,!wasHidden);
      if(scope==='quick'&&wasHidden)next=changeReadingTocVisibility(next,id,url,'page',false);
      await writeVerifiedLocalValue(api,READING_TOC_VISIBILITY_STORE,next,stored,'阅读目录显示偏好');
      tocVisibility=next;
    }));
    render();
    notice(wasHidden?(scope==='quick'?'已恢复本网站和当前页面的悬浮目录':'已恢复网页悬浮目录（其他隐藏规则仍适用）'):
      (scope==='site'?'已在此网站隐藏网页悬浮目录':'已在此页面隐藏网页悬浮目录')+
      '；Side Panel 目录仍可使用。');
  }
  async function setTocPageAvailability(allowed,requestedUrl=null){
    if(disposed||busy)return;
    const id=READING_TOC_TOOL_ID,tool=toolById(id);
    if(!tool?.capabilities.includes(TOC_CAPABILITY))throw new Error('阅读目录未安装');
    const target=requestedUrl?null:currentPageTarget?.capture?.();
    const url=requestedUrl||target?.url;
    if(!readingTocPageScope(url))throw new Error('请选择普通网页');
    if(!allowed&&(!target||!tocSiteAllowed(siteGrants,id,url)))
      throw new Error('请先允许当前网站');
    await locked('tool:'+id,()=>locked('catalog',async()=>{
      const current=admittedList((await api.storage.local.get(SIDEBAR_TOOL_STORE))[SIDEBAR_TOOL_STORE]);
      if(!current.some(row=>samePackage(row,tool)))throw new Error('工具安装状态已变化');
      if(target)await currentPageTarget.revalidate(target);
      const saved=(await api.storage.local.get(READING_TOC_PAGE_RULES_STORE))[READING_TOC_PAGE_RULES_STORE]||{};
      const before=readingTocPageAllowed(saved,id,url);
      if(before===allowed)return;
      const next=changeTocPageAllowed(saved,id,url,allowed);
      await writeVerifiedLocalValue(api,READING_TOC_PAGE_RULES_STORE,next,saved,'阅读目录页面规则');
      tocPageRules=next;
    }));
    render();notice(allowed?'已恢复当前页面的目录运行':'当前页面不可用，目录监听将停止');
  }
  async function setTocAvailability(allowed){
    if(disposed||busy)return;
    const url=currentPageTarget?.snapshot?.url,id=READING_TOC_TOOL_ID;
    const origin=websiteOrigin(url);
    if(!origin)throw new Error('当前未识别目标网页，请选中要设置的网站标签页');
    const siteEnabled=tocSiteAllowed(siteGrants,id,url);
    if(tocScope==='page'){
      if(!siteEnabled)throw new Error('请先启用当前网站');
      if(readingTocPageAllowed(tocPageRules,id,url)===allowed)return;
      return setTocPageAvailability(allowed);
    }
    if(siteEnabled===allowed)return;
    return toggleTocSite(id);
  }
  async function toggleTocSite(id){
    if(disposed||busy) return;
    const item=toolById(id);
    if(!item?.capabilities.includes(TOC_CAPABILITY)||!currentPageTarget?.capture||!currentPageTarget?.revalidate)
      throw new Error('目录工具或当前网页不可用');
    const target=currentPageTarget.capture(),origin=websiteOrigin(target.url);
    if(!origin)throw new Error('当前页面不支持目录授权');
    const wasEnabled=tocSiteAllowed(siteGrants,id,target.url);
    const enable=!wasEnabled;
    // Selecting 可用 or the site's enable control is already an explicit grant.
    // Per-origin locks and trusted document revalidation remain mandatory.
    await locked('tool:'+id,()=>locked('catalog',async()=>{
      const fresh=admittedList((await api.storage.local.get(SIDEBAR_TOOL_STORE))[SIDEBAR_TOOL_STORE]);
      if(!fresh.some(row=>samePackage(row,item)))throw new Error('工具安装状态已变化');
      await currentPageTarget.revalidate(target);
      const raw=(await api.storage.local.get(READING_TOC_SITE_STORE))[READING_TOC_SITE_STORE],saved=raw||{};
      if(tocSiteAllowed(saved,id,target.url)!==wasEnabled)throw new Error('站点授权已被其他窗口更改');
      const next=changeTocSiteAllowed(saved,id,target.url,enable);
      await writeVerifiedLocalValue(api,READING_TOC_SITE_STORE,next,raw,'目录网站授权');
      siteGrants=next;
    }));
    render();notice(enable?'已为当前网站启用目录':'已停用当前网站目录');
  }
  // Site revocation is independent of which website happens to be active.
  // It uses the same installation/catalog locks as TOC enable and uninstall,
  // so a stale or newly upgraded package cannot retain old site authority.
  async function revokeTocOrigin(id,origin,allow=false){
    if(disposed||busy)return;
    const item=toolById(id);
    if(!item?.capabilities.includes(TOC_CAPABILITY))throw new Error('目录工具已变化');
    await locked('tool:'+id,()=>locked('catalog',async()=>{
      const current=admittedList((await api.storage.local.get(SIDEBAR_TOOL_STORE))[SIDEBAR_TOOL_STORE]);
      if(!current.some(row=>samePackage(row,item)))throw new Error('工具安装状态已变化');
      const raw=(await api.storage.local.get(READING_TOC_SITE_STORE))[READING_TOC_SITE_STORE],saved=raw||{};
      if(tocSiteAllowed(saved,id,origin)===allow)return;
      const next=changeTocSiteAllowed(saved,id,origin,allow);
      await writeVerifiedLocalValue(api,READING_TOC_SITE_STORE,next,raw,'目录网站授权');
      siteGrants=next;
    }));
    render();notice(allow?'已恢复 '+origin+' 的目录':'已停用 '+origin+' 的目录');
  }
  async function reviewCandidate(candidate,sourceLabel,release=null,selection=fileSelection){
    requireToolRuntime(candidate);
    const previous=toolById(candidate.id);
    const [candidateHash,previousHash]=await Promise.all([
      sidebarToolPackageHash(candidate),previous?sidebarToolPackageHash(previous):null,
    ]);
    if(disposed||selection!==fileSelection)return;
    const current=toolById(candidate.id);
    if(Boolean(previous)!==Boolean(current)||(previous&&!samePackage(previous,current)))
      throw new Error('工具安装状态已变化，请重新选择安装包');
    pending=candidate;pendingBaseline=previous?structuredClone(previous):null;
    pendingRelease=release;pendingOperationId=release?crypto.randomUUID():null;
    patchToolField(view, previewTitle, {textContent: candidate.title});
    patchToolField(view, previewVersion, {textContent: 'v'+candidate.version});
    patchToolField(view, previewDescription, {textContent: candidate.description});
    patchToolField(view, previewCapabilities, {textContent: candidate.capabilities.length
      ?candidate.capabilities.map(readableCapability).join('、'):'无需额外能力'});
    patchToolField(view, previewFile, {textContent: sourceLabel+' · 候选包 SHA-256（规范序列化）：'+candidateHash+
      (previousHash?' · 当前包 SHA-256（规范序列化）：'+previousHash:'')+
      '。包 Hash 已规范化，文件空白或键顺序不影响此值。'});
    if(previous){
      const added=addedCapabilities(candidate,previous);
      const removed=previous.capabilities.filter(id=>!candidate.capabilities.includes(id));
      const change=versionOrder(candidate.version,previous.version);
      patchToolField(view, updatePanel, {hidden: false});
      patchToolField(view, updateVersions, {textContent: '当前 v'+previous.version+' → 新 v'+candidate.version});
      patchToolField(view, updateCapabilities, {textContent: '新增能力：'+(added.map(readableCapability).join('、')||'无')+
        '；移除能力：'+(removed.map(readableCapability).join('、')||'无')});
      const policyReview=describeSidebarToolBackgroundPolicyChange(previous.backgroundPolicy,candidate.backgroundPolicy);
      const risks=[...(policyReview?[policyReview]:[]),...(change<0?['版本回退']:[]),
        ...(added.length?['申请新增能力']:[]),
        ...(change===0&&!samePackage(candidate,previous)?['相同版本的内容发生变化']:[]),
        ...(!samePackage(candidate,previous)?['将替换同 ID 的已安装代码，请核对来源；现有工具数据保留']:[])];
      patchToolField(view, updateWarning, {textContent: risks.length?'点击确认更新前请核对：'+risks.join('；')+'。':''});
      patchToolField(view, updateWarning, {hidden: !risks.length});
      const identical=samePackage(candidate,previous);
      patchToolField(view, installButton, {textContent: identical?'已安装相同工具':'确认更新'});
      patchToolField(view, installButton, {disabled: identical});
      if(release&&!identical&&change<=0){
        patchToolField(view, installButton, {disabled: true});
        patchToolField(view, updateWarning, {hidden: false});
        patchToolField(view, updateWarning, {textContent: '当前同 ID 安装内容与官方发行不同；官方入口禁止同版本替换或降级。原安装和数据保留。'});
      }
    }else{patchToolField(view, installButton, {textContent: '确认安装'});patchToolField(view, installButton, {disabled: false});}
    patchToolField(view, preview, {hidden: false});
  }
  async function reviewPagePackage(value,file,selection) {
    const pkg=await validatePageInstallPackage(value);
    if(disposed||selection!==fileSelection)return;
    if(!foundationClient?.request||!pageConsent)throw new Error('网页增强安装服务未连接，请重新打开 OpenDesk。');
    const [response,access]=await Promise.all([
      foundationClient.request('listPagePrograms',{}),pageConsent.prepare({origins:pkg.pageRules.matches})
    ]);
    if(disposed||selection!==fileSelection)return;
    if(!Array.isArray(response?.catalog)||!Array.isArray(response?.installed)||!access)
      throw new Error('未能核对网页增强安装状态，请重新选择文件。');
    const installed=response.installed.find(row=>row.programId===pkg.programId)||null;
    pendingPage={pkg,installed};
    patchToolField(view, previewTitle, {textContent: pkg.title});
    patchToolField(view, previewVersion, {textContent: 'v'+pkg.version+' · r'+pkg.revision});
    patchToolField(view, previewDescription, {textContent: '网页增强 · 安装后在批准的网站自动运行。'});
    patchToolField(view, previewCapabilities, {textContent: '读取和修改以下网站的网页内容：'+pkg.pageRules.matches.join('、')+
      (pkg.pageRules.excludeMatches.length?'；排除：'+pkg.pageRules.excludeMatches.join('、'):'')+
      '。仅在顶层网页运行，不获得侧栏或 Native 权限。'});
    patchToolField(view, previewFile, {textContent: '身份：'+pkg.programId+'；文件：'+(file.name||'本地 JSON')});
    if(installed){
      patchToolField(view, previewDescription, {textContent: installed.revision===pkg.revision&&installed.sourceHash===pkg.sourceHash
        ?'此版本已经安装；确认后核对原安装与注册状态。'
        :'已安装 r'+installed.revision+'；确认后按原版本规则安装此固定版本。'});
      if(installed.enabled===false)patchToolField(view, previewDescription, {textContent: previewDescription.textContent + (' 原安装已被主动停用，将保留停用状态。')});
    }
    patchToolField(view, installButton, {textContent: installed?.revision===pkg.revision&&installed.sourceHash===pkg.sourceHash?'确认安装并核对':'确认安装'});
    patchToolField(view, installButton, {disabled: false});patchToolField(view, preview, {hidden: false});
  }
  function showPageInstallReceipt(pkg,result) {
    // The original Page Authority checks getScripts for both active and
    // intentionally disabled installs. Neither state grants new permissions.
    const active=result?.enabled===true&&result.nativeState==='registered'&&
      result.authorization?.status==='active';
    const disabled=result?.enabled===false&&result.nativeState==='disabled'&&
      result.authorization?.status==='disabled';
    if(result?.programId!==pkg.programId||result.revision!==pkg.revision||result.sourceHash!==pkg.sourceHash||
       !result.authorization?.installationId||!result.manifestHash||!(active||disabled)||result.error||
       JSON.stringify(result.pageRules)!==JSON.stringify(pkg.pageRules))
      throw Object.assign(new Error(result?.error?.message||'安装尚未获得确认的原生状态，请核对扩展详情。'),
        {code:'E_PAGE_INSTALL_PENDING'});
    setToolFieldAttribute(view, pageInstallStatus, 'data-state', disabled?'installed-disabled':'installed');
    setToolFieldAttribute(view, pageInstallStatus, 'data-installation-id', result.authorization.installationId);
    setToolFieldAttribute(view, pageInstallStatus, 'data-manifest-hash', result.manifestHash);
    patchToolField(view, pageInstallStatus, {textContent: '安装完成 · '+pkg.title+' v'+pkg.version+'（r'+pkg.revision+'）。'+
      (disabled?'保留原有停用状态；可在「扩展」中主动启用。':'打开或刷新批准的网站即可使用。')});
    patchToolField(view, pageInstallStatus, {hidden: false});
    patchToolField(view, pageInstallReceiptText, {textContent: '安装 ID：'+result.authorization.installationId+
      '；注册：'+result.nativeState+'；固定清单 SHA-256：'+result.manifestHash});
    patchToolField(view, pageInstallReceipt, {hidden: false});
    patchToolField(view, installButton, {textContent: disabled?'已安装（停用）':'已安装'});
    doc.dispatchEvent(new doc.defaultView.Event('opendesk:page-installation-changed'));
  }
  async function installPagePackage(event) {
    if(!pendingPage||busy||disposed||installButton.disabled)return;
    const reviewed=pendingPage,selection=fileSelection,{pkg,installed}=reviewed;
    // Request missing Chrome permissions synchronously from the real Install click.
    const permission=pageConsent.confirm(event,{origins:pkg.pageRules.matches});
    busy=true;patchToolField(view, installButton, {disabled: true});patchToolField(view, fileInput, {disabled: true});patchToolField(view, importClose, {disabled: true});
    patchToolField(view, pageInstallStatus, {textContent: '正在安装并核对注册状态…'});patchToolField(view, pageInstallStatus, {hidden: false});
    setToolFieldAttribute(view, pageInstallStatus, 'data-state', 'pending');
    let installationRequested=false;
    try{
      await permission;
      if(disposed||selection!==fileSelection)return;
      installationRequested=true;
      const result=await foundationClient.request('importPageInstallPackage',{package:pkg,
        expectedInstalledManifestHash:installed?.manifestHash??null,
        expectedGeneration:installed?.authorization?.generation??null});
      if(disposed||selection!==fileSelection)return;
      showPageInstallReceipt(pkg,result);
    }catch(error){
      if(disposed||selection!==fileSelection)return;
      // A stored readback alone cannot prove that this request registered in Chrome.
      // Query the original receipt, keep an explicit pending state, and never replay.
      let readback='';
      try{
        if(!installationRequested)throw error;
        const response=await foundationClient.request('listPagePrograms',{});
        if(disposed||selection!==fileSelection)return;
        const result=response.installed?.find(row=>row.programId===pkg.programId);
        if(result&&result.revision===pkg.revision&&result.sourceHash===pkg.sourceHash)
          readback=' 已查询到原安装 r'+result.revision+'（'+result.nativeState+'）；仍需核对本次安装结果。';
      }catch{/* Preserve the original failure; no mutation replay. */}
      setToolFieldAttribute(view, pageInstallStatus, 'data-state', 'pending-review');
      patchToolField(view, pageInstallStatus, {textContent: (error?.code||'E_PAGE_INSTALL')+'：'+String(error?.message||error)+
        readback+' 请核对扩展中的安装状态；未自动重试安装。'});
      patchToolField(view, installButton, {textContent: '需要核对'});
    }finally{
      busy=false;
      if(!disposed){patchToolField(view, fileInput, {disabled: false});patchToolField(view, importClose, {disabled: false});}
    }
  }
  async function chooseFile(selectedFile) {
    if(disposed||busy)return;
    const selection=++fileSelection,file=selectedFile;
    // Preserve the browser's selected filename; clearing .value here lies to the user.
    resetReview();setFileError();notice('');
    if(!file)return;
    try{
      if(file.size>PROGRAM_DRAFT_INPUT_LIMIT)throw new Error('文件超过程序草稿包大小上限');
      const text=await file.text();
      if(disposed||selection!==fileSelection)return;
      const byteLength=new TextEncoder().encode(text).byteLength;
      if(byteLength>PROGRAM_DRAFT_INPUT_LIMIT)throw new Error('文件超过程序草稿包大小上限');
      const parsed=JSON.parse(text);
      if(parsed?.format===PAGE_INSTALL_FORMAT){
        await reviewPagePackage(parsed,file,selection);return;
      }
      if([PROGRAM_DRAFT_FORMAT,PROGRAM_DRAFT_V2_FORMAT].includes(parsed?.format)){
        throw new Error('这是开发草稿，不是网页增强安装包。编辑源码请到「开发」导入草稿；安装请选择 .opendesk-page.json 安装包。');
      }
      if(file.size>320000||byteLength>320000)throw new Error('工具包超过 320 KB');
      const candidate=validateSidebarToolPackage(parsed);
      await reviewCandidate(candidate,'文件：'+(file.name||'本地 JSON'),null,selection);
    }catch(error){
      if(disposed||selection!==fileSelection)return;
      setFileError(error instanceof SyntaxError?'文件不是有效的扩展安装包 JSON':String(error?.message||error));
    }
  }
  async function install() {
    if(!canCommitReview()||installButton.disabled)return;
    busy=true;patchToolField(view, installButton, {disabled: true});patchToolField(view, fileInput, {disabled: true});patchToolField(view, importClose, {disabled: true});
    let accepted=null,officialTocInstalled=false;
    try{
      const candidate=validateSidebarToolPackage(pending),baseline=pendingBaseline;
      requireToolRuntime(candidate); // Revalidate before committing reviewed bytes.
      const release=pendingRelease,operationId=pendingOperationId;
      // Bind confirmation to the exact reviewed local resource even if the
      // extension updated while this review was open. No stale-byte fallback.
      if(release){
        await verifyReviewedOfficialTool(release,candidate,{api,fetcher});
      }
      // A static adapter cannot substitute for a live MV3 worker protocol.
      // Missing optional idle/DNR grants do not block installation.
      if(candidate.capabilities.includes(FOCUS_CAPABILITY))await focus.probe({api,tool:candidate});
      if(candidate.capabilities.includes(AI_CAPABILITY))await aiAccess.probe({api});
      if(candidate.capabilities.includes(ADBLOCK_CAPABILITY))await adblock.probe({api,tool:candidate});
      const result=await installReviewedSidebarTool({api,lockManager,candidate,
        baseline,reviewApproved:true,
        market:release?{marketId:release.id,sha256:release.sha256,operationId}:null,
        // Only the exact verified official release explicitly reviewed by the
        // user may replace a different local provenance (no modal, no autopush).
        approveSourceChange:()=>Boolean(release&&pendingRelease===release&&samePackage(candidate,pending)),
        approveUpdate:(previous,next)=>{
          const added=addedCapabilities(next,previous);
          const change=versionOrder(next.version,previous.version);
          const warnings=[...(change<0?['版本回退']:[]),
            ...(added.length?['新增能力：'+added.map(readableCapability).join('、')]:[]),
            ...(change===0&&!samePackage(next,previous)?['同版本内容变化']:[])];
          // The Confirm Update button follows the visible version/capability diff.
          return true;
        }});
      if(['installed','already-installed'].includes(result.state))accepted=result.tool;
      // An installed, verified official reader already runs in its page Content Script.
      // Opening the sidebar merely shows another view of that existing directory.
      officialTocInstalled=Boolean(accepted&&release?.toolId===READING_TOC_TOOL_ID&&
        accepted.id===READING_TOC_TOOL_ID&&accepted.capabilities.includes(TOC_CAPABILITY));
      installed=admittedList((await api.storage.local.get(SIDEBAR_TOOL_STORE))[SIDEBAR_TOOL_STORE]);
      await Promise.all([loadSites(),loadClipSites()]);
      const capture=(await api.storage.local.get(CAPTURE_SITE_STORE))[CAPTURE_SITE_STORE];
      captureGrants=capture||{};
    }catch(error){
      if(['E_TOOL_CHANGED','E_OUTCOME_UNKNOWN'].includes(error?.code)){
        clearImport();setFileError(error.message+(error.code==='E_OUTCOME_UNKNOWN'?'；请核对已安装列表与本机事务记录。本次批准已撤销，不会自动重试。':''));
        await loadInstalled();return;
      }
      if(accepted)clearImport(); // A consumed approval cannot survive a failed list refresh.
      throw error;
    }finally{
      busy=false;patchToolField(view, fileInput, {disabled: false});patchToolField(view, importClose, {disabled: false});
      patchToolField(view, installButton, {disabled: !canCommitReview()});render();
    }
    if(!accepted||disposed)return;
    setImportOpen(false);render();focusToolInList(accepted.id);
    notice(officialTocInstalled?
      '阅读目录已安装。符合条件的网页自动显示目录，无需再启用或逐站授权；“打开”仅查看侧边栏目录。':
      '已安装「'+accepted.title+'」。无需再次启用，可直接打开应用界面；额外敏感权限按需确认。');
  }
  async function remove(id=active?.id,{confirmed=false}={}) {
    if(installedReadError)throw new Error('安装记录待核对，无法卸载旧缓存中的工具');
    const item=toolById(id);
    if(!item||busy)return;
    if(active?.id===id&&toolSaving){notice('当前工具正在保存，请完成保存后再卸载。',true);return;}
    if(!confirmed){
      pendingUninstallId=id;pendingUninstallBaseline=structuredClone(item);
      patchToolField(view, removeReviewText, {textContent: '卸载「'+item.title+'」将删除本工具的安装包、本地数据与网站授权。此操作无法自动撤销。'});
      patchToolField(view, removeReview, {hidden: false});
      patchToolField(view, removeReviewConfirm, {disabled: false});
      notice('');
      requestToolFieldEffect(view, removeReview, 'scrollIntoView', {block:'nearest'});
      return;
    }
    if(pendingUninstallId!==id||!samePackage(pendingUninstallBaseline,item)){
      cancelRemovalReview();throw new Error('工具已变化，原卸载确认已失效');
    }
    cancelRemovalReview();
    const itemIndex=installed.findIndex(row=>row.id===item.id);
    busy=true;
    let removed=false;
    try{
      // A list removal never opens code; an active instance is revoked first.
      if(active?.id===item.id)suspendTool();
      await locked('tool:'+item.id,()=>locked('catalog',async()=>{
        installed=requireCompleteInstalledSidebarTools(
          (await api.storage.local.get(SIDEBAR_TOOL_STORE))[SIDEBAR_TOOL_STORE]);
        const current=toolById(item.id);
        if(!current)return;
        if(!samePackage(current,item))throw new Error('工具已在其他窗口更新，请重新确认卸载');
        // Durable intent first; a failed registry write must not delete data.
        await recordToolUninstall(api,current);
        const next=installed.filter(row=>row.id!==item.id);
        await writeVerifiedLocalValue(api,SIDEBAR_TOOL_STORE,next,installed,'卸载安装记录');
        installed=next;removed=true;
        render();
        // Only this tool ID, only while no installed package owns the ID.
        // If cleanup fails, the recovery marker is intentionally retained.
        await cleanupUninstalledToolLocked(api,item.id);
        notice('已卸载「'+item.title+'」，本地数据已清理。');

      }));
    }finally{
      busy=false;render();
      if(removed&&visible)focusToolInList(installed[Math.min(itemIndex,installed.length-1)]?.id);
    }
  }
  async function retryUninstallCleanup(id,event){
    if(!event?.isTrusted||disposed||busy||!visible||installedReadError)return {state:'blocked',toolId:id};
    if(!(await getPendingToolCleanups(api))[id])return {state:'not-pending',toolId:id};
    // Only fixed extension descriptors can prepare native cleanup. Installed
    // package bytes never supply hooks; the installer still rechecks ownership.
    const trusted=[focus,adblock,aiAccess,nativeTimeReview].find(owner=>owner?.id===id);
    await trusted?.prepareUninstallCleanup?.({api,event,requestBrowserClick});
    if(disposed||busy||!visible||installedReadError)return {state:'blocked',toolId:id};
    busy=true;render();
    try{
      const result=await retryUninstalledToolCleanup({api,lockManager,id});
      if(result.state==='cleaned')notice('卸载清理已确认完成；重新安装仍需审阅。');
      else notice('卸载恢复状态：'+result.state,true);
      return result;
    }finally{busy=false;render();}
  }
  const action=(fn)=>()=>Promise.resolve().then(fn).catch(error=>notice(
    (error?.code||'E_TOOL')+'：'+String(error?.message||error).slice(0,240),true));
  // No beforeunload modal: in-app navigation guards unsaved changes; direct
  // tab close cannot be blocked without a Chrome dialog, so edits must be saved.
  setImportOpen(false);
  cancelRemovalReview();
  cancelActionReview();
  notice('');
  listen(importTrigger,'click',()=>{
    if(busy)return;
    const next=importPanel.hidden;
    setImportOpen(next);notice('');
  });
  listen(importClose,'click',()=>{
    if(busy)return;
    setImportOpen(false);notice('');requestToolFieldEffect(view, importTrigger, 'focus');
  });
  listen(fileInput,'change',event=>chooseFile(event?.target?.files?.[0]).catch(error=>setFileError(String(error?.message||error))));
  listen(fileInput,'cancel',()=>{if(!busy)clearImport();});
  listen(installButton,'click',event=>{
    if(pendingPage){void installPagePackage(event);return;}
    void action(install)();
  });
  listen(backButton,'click',()=>{
    if(busy)return;
    if(tocSettingsOpen){closePromptSettings();requestToolFieldEffect(view, settingsButton, 'focus', {preventScroll:true});return;}
    const id=active?.id;
    if(closeTool())focusToolInList(id);
  });
  const toggleContextMenu=async event=>{
    if(!event.isTrusted||!active||readOnlyPreview||busy)return;
    // Native permission prompts must never be opened for a disabled tool.
    if(enableReadError||!sidebarToolEnabled(enableRecords,active.id))
      throw Object.assign(new Error('请先启用当前工具'),{code:'E_TOOL_DISABLED'});
    const tool=active,document=currentPageTarget?.capture?.();
    if(!document?.tabId||!document?.documentId||!websiteOrigin(document.url))
      throw new Error('请先打开普通 HTTP(S) 网页再启用右键菜单');
    const origin=websiteOrigin(document.url);
    if(!tool.contributes?.contextMenus?.some(action=>action.documentUrlPatterns?.some(pattern=>{
      try{const b=new URL(document.url);
        if(pattern===b.protocol+'//*/*')return true;
        const a=new URL(pattern);
        return a.protocol===b.protocol&&a.hostname===b.hostname;}catch{return false;}
    })))throw new Error('此工具没有声明当前网站的右键菜单');
    const enabled=!(menuGrants[tool.id]?.version===tool.version&&
      menuGrants[tool.id]?.origins?.includes(origin));
    // Permission request starts directly from this trusted user click. Do not
    // put an await, a sandbox message or a settings read before this call.
    const permission=enabled?api.permissions.request({permissions:['contextMenus']}):Promise.resolve(true);
    if(!await permission)throw Object.assign(new Error('没有批准 Chrome 右键菜单权限'),{code:'E_CHROME_PERMISSION_REQUIRED'});
    await currentPageTarget.revalidate(document);
    const response=await api.runtime.sendMessage({protocol:BROWSER_HOST_PROTOCOL,kind:'host',
      operation:'browser.contextMenu.userToggle',hostInstanceId:new URL(globalThis.location.href).searchParams.get('hostInstanceId'),
      toolId:tool.id,enabled,origin,document:{
        tabId:document.tabId,documentId:document.documentId,url:document.url}});
    if(!response?.ok)throw Object.assign(new Error(response?.error?.message||'右键菜单状态未确认'),{
      code:response?.error?.code||'E_BROWSER'});
    const updated=await api.storage.local.get(BROWSER_MENU_GRANTS_STORE);
    menuGrants=updated[BROWSER_MENU_GRANTS_STORE]||{};
    render();notice(enabled?'已为当前网站启用右键菜单':'已停用当前网站右键菜单');
  };
  if(promptNativeAction)listen(promptNativeAction,'click',event=>{
    void toggleContextMenu(event).catch(error=>notice(
      (error?.code||'E_BROWSER')+'：'+String(error?.message||error).slice(0,200),true));
  });
  if(menuButton)listen(menuButton,'click',event=>{
    // Preserve the original input event as a user gesture.
    void toggleContextMenu(event).catch(error=>notice(
      (error?.code||'E_BROWSER')+'：'+String(error?.message||error).slice(0,200),true));
  });
  // Optional Chrome permission must be requested in this real extension-owned
  // click, before any await. Package/epoch-bound Full consent is distinct.
  listen(fullBookmarkButton,'click',event=>{
    if(!event?.isTrusted||!active||readOnlyPreview||busy||enableReadError||
      !isFullBookmarkTool(active)||!sidebarToolEnabled(enableRecords,active.id))return;
    const tool=active,epoch=revocationEpochs[tool.id]??null;
    const grant=menuGrants?.[tool.id];
    const hadConsent=grant?.bookmarkFull===true&&grant.version===tool.version&&grant.installEpoch===epoch;
    const permission=hadConsent?Promise.resolve(true):api.permissions.request({permissions:['bookmarks']});
    patchToolField(view,fullBookmarkButton,{disabled:true});
    void (async()=>{
      if(await permission!==true)throw Object.assign(new Error('未授予 Chrome 全部书签权限'),{code:'E_CHROME_PERMISSION_REQUIRED'});
      if(disposed||!active||!samePackage(active,tool)||
        (revocationEpochs[tool.id]??null)!==epoch)
        throw Object.assign(new Error('工具已变化，请重新审阅完整书签授权'),{code:'E_TOOL_CHANGED'});
      const packageHash=await sidebarToolPackageHash(tool);
      const reply=await api.runtime.sendMessage({protocol:BROWSER_HOST_PROTOCOL,kind:'host',
        operation:'browser.bookmarks.fullConsent',
        hostInstanceId:new URL(globalThis.location.href).searchParams.get('hostInstanceId'),
        toolId:tool.id,toolVersion:tool.version,installEpoch:epoch,packageHash,enabled:!hadConsent});
      if(!reply?.ok)throw Object.assign(new Error(reply?.error?.message||'完整书签授权未确认'),
        {code:reply?.error?.code||'E_BROWSER'});
      const stored=await api.storage.local.get(BROWSER_MENU_GRANTS_STORE);
      menuGrants=stored[BROWSER_MENU_GRANTS_STORE]||{};
      notice(hadConsent?'已撤销本工具完整书签访问':'已授权本工具访问全部书签');
    })().catch(error=>notice((error?.code||'E_PERMISSION')+'：'+String(error?.message||error),true))
      .finally(()=>{render();});
  });
  async function readPromptWebButtons(){
    const namespace=sidebarToolStorageKey(PROMPT_ID);
    const current=(await api.storage.local.get(namespace))[namespace];
    if(current!==undefined&&(!current||typeof current!=='object'||Array.isArray(current)))
      throw new Error('提示词存储异常，不允许修改设置');
    const model=globalThis.OpenDeskPromptShortcutsModel;
    if(typeof model?.load!=='function')throw new Error('可信提示词数据模型不可用');
    return model.load(current?.library).settings.webButtons;
  }
  async function changePromptWebButtons(event){
    if(event?.isTrusted!==true||promptWebPending||promptWebButtons===null||busy||readOnlyPreview||
       active?.id!==PROMPT_ID||enableReadError||!sidebarToolEnabled(enableRecords,PROMPT_ID))return;
    const tool=active,expected=promptWebButtons;
    promptWebPending=true;render();
    try{
      const nextValue=await locked('tool:'+PROMPT_ID,async()=>{
        const registry=(await api.storage.local.get(SIDEBAR_TOOL_STORE))[SIDEBAR_TOOL_STORE];
        if(disposed||!active||!samePackage(active,tool)||!requireCompleteInstalledSidebarTools(registry)
          .some(row=>samePackage(row,tool)))throw new Error('工具已更新或卸载');
        const namespace=sidebarToolStorageKey(PROMPT_ID);
        const raw=(await api.storage.local.get(namespace))[namespace]??{};
        if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('工具存储损坏，拒绝覆盖');
        const model=globalThis.OpenDeskPromptShortcutsModel;
        const previous=model.load(raw.library);
        if(previous.settings.webButtons!==expected)
          throw Object.assign(new Error('设置已在其他窗口修改，请重新核对'),{code:'E_STORAGE_CONFLICT'});
        const nextLibrary=model.load({...previous,settings:{webButtons:!expected}});
        if(model.bytes(nextLibrary)>SIDEBAR_TOOL_DATA_LIMITS.itemBytes)
          throw Object.assign(new Error('工具数据已达上限'),{code:'E_TOOL_DATA_LIMIT'});
        const next={...raw,library:nextLibrary};
        if(new TextEncoder().encode(JSON.stringify(next)).byteLength>SIDEBAR_TOOL_DATA_LIMITS.totalBytes)
          throw Object.assign(new Error('工具数据超过上限'),{code:'E_TOOL_DATA_LIMIT'});
        await writeVerifiedLocalValue(api,namespace,next,raw,'提示词网页按钮设置');
        return nextLibrary.settings.webButtons;
      });
      if(disposed||!active||!samePackage(active,tool))return;
      promptWebButtons=nextValue;promptWebChanged=true;notice(nextValue?'网页快捷按钮已开启':'网页快捷按钮已关闭，提示词仍保留');
    }catch(error){
      notice((error?.code||'E_STORAGE')+'：'+(error?.message||error),true);
      try{if(!disposed&&active&&samePackage(active,tool)){
        const observed=await readPromptWebButtons();
        if(observed!==expected)promptWebChanged=true;
        promptWebButtons=observed;
      }}
      catch{promptWebButtons=null;promptWebChanged=true;}
    }finally{promptWebPending=false;render();}
  }
  if(promptWebAction)listen(promptWebAction,'click',event=>void changePromptWebButtons(event));
  function refreshPromptSettings(tool){
    promptWebButtons=null;promptWebChanged=false;promptWebPending=true;render();
    void readPromptWebButtons().then(value=>{
      if(disposed||!active||!samePackage(active,tool)||!tocSettingsOpen)return;
      promptWebButtons=value;
    },error=>notice('网页按钮设置读取失败：'+(error?.message||error),true))
      .finally(()=>{if(!disposed&&active&&samePackage(active,tool)){promptWebPending=false;render();}});
  }
  function closePromptSettings(){
    const tool=active,remount=tool?.id===PROMPT_ID&&promptWebChanged;
    tocSettingsOpen=false;promptWebChanged=false;
    if(remount&&!toolDirty&&!toolSaving)mountTool(tool);
    else render();
  }
  listen(settingsButton,'click',()=>{
    if(!active||readOnlyPreview||busy)return;
    if(active.id===ADBLOCK_ID&&!tocSettingsOpen){
      // Reuse the real trusted toolbar action adjacent to Uninstall.
      // Product settings cannot trigger a native permission request.
      if(active.uiRuntime==='opendesk.react-ui.v1'){
        // A navigation hint only; no DNR privilege or synthetic trusted click.
        // The tool owns the Settings page and remains inside its opaque iframe.
        frame?.contentWindow?.postMessage({protocol:'opendesk.adblock.ui.v1',
          kind:'settings',toolId:ADBLOCK_ID,instance},'*');
      }else{tocSettingsOpen=true;render();}
      return;
    }
    if(active.id===PROMPT_ID){
      if(tocSettingsOpen){closePromptSettings();requestToolFieldEffect(view, settingsButton, 'focus', {preventScroll:true});return;}
      if(toolDirty||toolSaving){notice('请先保存或取消未保存的提示词草稿，再打开工具设置。',true);return;}
      tocSettingsOpen=true;tocScope='site';refreshPromptSettings(active);requestToolFieldEffect(view, backButton, 'focus', {preventScroll:true});return;
    }
    tocSettingsOpen=!tocSettingsOpen;tocScope='site';render();requestToolFieldEffect(view, backButton, 'focus', {preventScroll:true});
  });
  listen(settingsScopeButton,'click',()=>{tocScope=tocScope==='site'?'page':'site';render();});
  const setSitePermission=allowed=>{
    const id=active?.id,capability=siteCapability(active),url=currentPageTarget?.snapshot?.url;
    if(!capability)return; // Basic prompt shortcuts use no per-site grant.
    const grants=capability===CAPTURE_CAPABILITY?captureGrants:capability===CLIP_CAPABILITY?clipGrants:siteGrants;
    const origin=capability===CAPTURE_CAPABILITY?chatCaptureOrigin(url):websiteOrigin(url);
    if(!origin)throw new Error('请选择适用网页');
    const permitted=capability===TOC_CAPABILITY?tocSiteAllowed(grants,id,url):grantedOrigins(grants,id).includes(origin);
    if(Boolean(permitted)===allowed)return;
    return capability===CAPTURE_CAPABILITY?toggleCaptureSite(id):capability===CLIP_CAPABILITY?toggleClipSite(id):toggleTocSite(id);
  };
  listen(settingsAllow,'click',action(()=>runSiteToggle(active?.id,()=>setSitePermission(true))));
  listen(settingsDeny,'click',action(()=>runSiteToggle(active?.id,()=>setSitePermission(false))));
  // The Extension Center overflow and this settings button share one guarded lifecycle.
  // Never expose the raw storage mutation to a presentation caller.
  async function toggleEnabled(id,event){
    if(!event?.isTrusted||disposed||busy||!visible||enableReadError||toolSaving)return false;
    const tool=toolById(id);
    if(!tool||readOnlyPreview&&active?.id===id){
      notice('工具不可用，请刷新扩展列表。',true);return false;
    }
    const wasEnabled=sidebarToolEnabled(enableRecords,id),enabled=!wasEnabled;
    const session=instance,activeId=active?.id;
    const apply=async()=>{
      // The user might confirm discarding a draft after a newer install, update
      // or state change. Lock down all original assumptions before the mutation.
      if(disposed||busy||toolSaving||!visible||enableReadError||
        !samePackage(toolById(id),tool)||active?.id!==activeId||
        (activeId===id&&instance!==session)||
        sidebarToolEnabled(enableRecords,id)!==wasEnabled){
        notice('工具状态或编辑内容已变化；请核对后重新点击启停。',true);
        return false;
      }
      busy=true;render();
      try{
        await setInstalledSidebarToolEnabled({api,lockManager,tool,enabled});
        if(active?.id===id){
          destroyFrame();toolDirty=false;toolSaving=false;knowledgeDirty=false;tocSettingsOpen=true;
        }
        await Promise.all([loadEnableRecords(),loadInstalled()]);
        notice(enabled?(id===READING_TOC_TOOL_ID?
          '阅读目录已恢复；符合条件的网页会自动显示目录。':
          '应用已恢复使用；可按需打开界面。'):'已停用；数据和授权保留');
        return true;
      }finally{busy=false;render();}
    };
    // Changing another tool never discards the current tool's unsaved draft.
    if(active?.id===id&&!canLeave(apply))return false;
    return apply();
  }
  if(enableButton)listen(enableButton,'click',event=>{
    void toggleEnabled(active?.id,event).catch(error=>notice(
      (error?.code||'E_TOOL')+'：'+String(error?.message||error).slice(0,240),true));
  });
  if(launchButton)listen(launchButton,'click',action(()=>openTool(active?.id)));
  if(eyeButton)listen(eyeButton,'click',action(()=>runSiteToggle(READING_TOC_TOOL_ID,
    ()=>toggleTocDisplay(READING_TOC_TOOL_ID,'quick'))));
  listen(settingsSiteVisibility,'click',action(()=>runSiteToggle(READING_TOC_TOOL_ID,
    ()=>toggleTocDisplay(READING_TOC_TOOL_ID,'site'))));
  listen(settingsPageVisibility,'click',action(()=>runSiteToggle(READING_TOC_TOOL_ID,
    ()=>toggleTocDisplay(READING_TOC_TOOL_ID,'page'))));
  listen(actionContinue,'click',event=>{void applyActionReview(event).catch(error=>notice(
    (error?.code||'E_TOOL')+'：'+String(error?.message||error).slice(0,240),true));});
  listen(actionCancel,'click',()=>{cancelActionReview();notice('已取消，原内容仍保留。');});
  listen(removeButton,'click',action(remove));
  listen(removeReviewConfirm,'click',action(()=>remove(pendingUninstallId,{confirmed:true})));
  listen(removeReviewCancel,'click',()=>{
    cancelRemovalReview();notice('已取消卸载。');
    requestToolFieldEffect(view, removeButton, 'focus', {preventScroll:true});
  });
  if(openTabButton)listen(openTabButton,'click',action(()=>openInTab()));
  const messageWindow=window;
  messageWindow.addEventListener('message',onMessage);
  listeners.push(()=>messageWindow.removeEventListener('message',onMessage));
  if(retiredDraftDismiss)listen(retiredDraftDismiss,'click',()=>{if(active)recoverableDrafts.delete(active.id);render();});
  // Knowledge drafts do not register browser-native exit confirmations.
  // Native Chrome permission removal must erase already-rendered private
  // bookmarks immediately, without waiting for the next observe poll.
  if(api.permissions?.onRemoved?.addListener){
    const onBookmarkChromeGrantRemoved=details=>{
      if(!details?.permissions?.includes('bookmarks')||
         active?.id!==TRUSTED_BOOKMARK_ID||
         !(nativeUI?.kind==='bookmark'||nativePending))return;
      destroyFrame();tocSettingsOpen=true;render();
      notice('Chrome 完整书签权限已撤销；可信界面及书签数据已清空。',true);
    };
    api.permissions.onRemoved.addListener(onBookmarkChromeGrantRemoved);
    listeners.push(()=>api.permissions.onRemoved.removeListener(onBookmarkChromeGrantRemoved));
  }
  const enableReady=loadEnableRecords().catch(error=>notice(error.message,true));
  const installedReady=loadInstalled().catch(error=>notice('工具列表读取失败：'+error.message,true));
  const sitesReady=loadSites().catch(error=>notice('网站授权读取失败：'+error.message,true));
  const menuReady=api.storage.local.get(BROWSER_MENU_GRANTS_STORE).then(row=>{
    if(!disposed){menuGrants=row[BROWSER_MENU_GRANTS_STORE]||{};render();}
  }).catch(error=>notice('右键菜单偏好读取失败：'+error.message,true));
  const tocVisibilityReady=loadTocVisibility().catch(error=>notice('目录显示偏好读取失败：'+error.message,true));
  const tocPagesReady=loadTocPageRules().catch(error=>notice('页面例外读取失败：'+error.message,true));
  const clipSitesReady=loadClipSites().catch(error=>notice('剪藏授权读取失败：'+error.message,true));
  const captureSitesReady=api.storage.local.get(CAPTURE_SITE_STORE).then(saved=>{
    if(disposed)return;captureGrants=saved[CAPTURE_SITE_STORE]||{};render();
  }).catch(error=>notice('知识保存授权读取失败：'+error.message,true));
  const officialReady=loadOfficial();
  const preinstallReady=runDefaultPreinstall();
  const ready=Promise.all([enableReady,installedReady,sitesReady,menuReady,tocVisibilityReady,tocPagesReady,clipSitesReady,captureSitesReady,officialReady,preinstallReady]);
  if(currentPageTarget?.subscribe){
    // revalidate() intentionally observes the same document before and after a
    // privileged read. Only an actual target transition invalidates tool output;
    // resolving/unavailable and same-URL reloads must still revoke pending work.
    const pageKey=()=>JSON.stringify(['status','windowId','tabId','frameId','documentId','url','origin','title','reason']
      .map(key=>currentPageTarget.snapshot?.[key]??null));
    let previousPage=pageKey();
    const unsubscribe=currentPageTarget.subscribe(()=>{
      render();
      const nextPage=pageKey();
      if(nextPage===previousPage)return;
      previousPage=nextPage;
       cookieImportGate.revoke();
       cookieWriteGate.revoke();
       // The React sandbox independently re-reads its current site after navigation.
      if(frame&&active&&instance)frame.contentWindow?.postMessage({
        protocol:SIDEBAR_TOOL_PROTOCOL,kind:'page-changed',instance,toolId:active.id
      },'*');
    });
    listeners.push(unsubscribe);
  }
  if(tocLanguageSelect){
    listen(tocLanguageSelect,'change',()=>{
      if(disposed||active?.id!==READING_TOC_TOOL_ID||!localeController?.setLocale)return;
      const requested=tocLanguageSelect.value;
      void Promise.resolve().then(()=>localeController.setLocale(requested)).catch(error=>{
        patchToolField(view, tocLanguageSelect, {value: resolveUiLocale(localeController.getLocale(),['zh-CN','en'],'zh-CN')});
        notice(readingTocHostText(localeController.getLocale(),'languageSaveError')+
          String(error?.message||error),true);
      });
    });
  }
  if(localeController?.subscribe){
    listeners.push(localeController.subscribe(locale=>{
      // Presentation-only: retain the live tool iframe, TOC snapshot, and website policy.
      if(active?.id===READING_TOC_TOOL_ID)render();
      if(frame&&active&&instance)frame.contentWindow?.postMessage({
        protocol:SIDEBAR_TOOL_PROTOCOL,kind:'locale-changed',instance,toolId:active.id,locale
      },'*');
    }));
  }
  render();
  return Object.freeze({ready,openTool,openSettings,toggleEnabled,retryUninstallCleanup,openOfficialReview,openImport,openReadOnlyPreview,isDirty,isPreviewActive:()=>readOnlyPreview&&!!frame&&!!active,isPreviewDirty:()=>readOnlyPreview&&previewDirty,openInTab,closeTool,setVisible,dispose(){
    if(disposed)return;
    cookieImportGate.revoke();cookieWriteGate.revoke();cancelActionReview();destroyFrame();fileSelection++;disposed=true;visible=false;pageConsent?.dispose();
    timePermissions?.dispose();focusPermissions?.dispose();aiPermissions?.dispose();
    for(const release of listeners.splice(0))release();
    queued.clear();
  }});
}
