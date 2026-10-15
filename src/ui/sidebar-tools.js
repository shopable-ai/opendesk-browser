import {BROWSER_HOST_PROTOCOL,BROWSER_MENU_GRANTS_STORE,normalizeBrowserOperation,browserOperation} from '../framework/sdk/browser-contract.js';
import {browserTextDownloadUrl} from '../framework/sdk/browser-schemas.js';
import {createSidePanelOpenCoordinator} from '../platform/chrome/browser-side-panel.js';
import {createToolPermissionConsent} from '../platform/chrome/permission-gate.js';
import {scheduleSpecFromExpression} from '../platform/tasks/schedule-time.js';
import {validateTaskParams} from '../platform/tasks/contract.js';
import {SIDEBAR_TOOL_ENABLE_STORE,requireToolEnableRecords,sidebarToolEnabled,assertSidebarToolEnabled} from './sidebar-tools/lifecycle.js';
import {SIDEBAR_TOOL_PROTOCOL,SIDEBAR_TOOL_STORE,MAX_INSTALLED_TOOLS,SIDEBAR_TOOL_DATA_LIMITS,
  sidebarToolStorageKey,sidebarToolPackageHash,validateSidebarToolPackage} from './sidebar-tools/package.js';
import {writeVerifiedLocalValue} from './sidebar-tools/storage-state.js';
import {toolPageHref} from './sidebar-tools/navigation.js';
import {loadOfficialCatalog,loadOfficialTool,verifyReviewedOfficialTool,officialToolStatus,matchesOfficialRelease} from '../sidebar-tools/official-catalog.js';
import {resumeDefaultPreinstall,DEFAULT_PREINSTALL_STORE} from '../sidebar-tools/default-preinstall.js';
import {installReviewedSidebarTool,admittedSidebarToolPackages,sameSidebarToolPackage,compareToolVersions,
  recordToolUninstall,cleanupUninstalledToolLocked,TOOL_REVOCATION_EPOCHS_STORE,
  requireCompleteInstalledSidebarTools,setInstalledSidebarToolEnabled,MARKET_PROVENANCE_STORE} from './sidebar-tools/installation.js';
import {READING_TOC_SITE_STORE,READING_TOC_TOOL_ID,READING_TOC_PROTOCOL,TOC_CAPABILITY,
  websiteOrigin,grantedOrigins,tocSiteAllowed,blockedTocOrigins,changeTocSiteAllowed,READING_TOC_PLACEMENT_PREFIX,
  READING_TOC_VISIBILITY_STORE,readingTocPageScope,readingTocDisplayState,
  changeReadingTocVisibility,READING_TOC_PAGE_RULES_STORE,readingTocPageAllowed,
  disabledTocPages,changeTocPageAllowed} from '../reading-toc/policy.js';
import {CLIP_SITE_STORE,CLIP_CAPABILITY,CLIP_PROTOCOL,CLIP_OPERATIONS,changeClipGrant} from '../page-clip/policy.js';
import {CAPTURE_SITE_STORE,CAPTURE_CAPABILITY,KNOWLEDGE_TOOL_ID,KNOWLEDGE_CAPABILITY,KNOWLEDGE_PROTOCOL,
  KNOWLEDGE_OPERATIONS,KNOWLEDGE_WORKSPACE_PREFIX,changeCaptureGrant,chatCaptureOrigin,knowledgePackageHash} from '../knowledge/policy.js';
import {TIME_REVIEW_ID,TIME_REVIEW_CAPABILITY,TIME_REVIEW_PROTOCOL,TIME_REVIEW_OPERATIONS,timeReviewPackageHash} from '../time-review/policy.js';
import {TIME_REVIEW_KEY} from '../time-review/model.js';
import {FOCUS_ID,FOCUS_CAPABILITY} from '../stay-focus/policy.js';
import {ADBLOCK_ID,ADBLOCK_CAPABILITY} from '../../examples/sidebar-tools/adblock/trusted/policy.js';
import {AI_ID,AI_CAPABILITY} from '../ai-smart-access/policy.js';
import {PROMPT_ID,PROMPT_CAPABILITY,PROMPT_SITE_STORE,CHATGPT_ORIGIN,supportedOrigin,changePromptSiteGrant} from '../../examples/sidebar-tools/prompt-shortcuts/trusted/policy.js';
import {createTimeReviewPermissionControls} from '../time-review/host-controls.js';
import {admitsTrustedTimeReview,TRUSTED_TIME_REVIEW_VERSION,trustedTimeReviewProvenanceChanged} from '../time-review/trusted-admission.js';

// Trusted Side Panel shell for untrusted, opaque-origin UI documents.
// No user code, markup, or CSS is ever inserted into this extension document.
export function createSidebarTools({api=globalThis.chrome,doc=globalThis.document,
  currentPageTarget,taskWorkbench,foundationClient,lockManager=globalThis.navigator?.locks,fetcher=globalThis.fetch}) {
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
        typeof adblock.runTrustedOperation!=='function'||
        typeof adblock.createPermissionControls!=='function'))
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
  const get=id=>doc.getElementById(id);
  const list=get('sidebar-tool-list'), listView=get('sidebar-tool-list-view');
  const empty=get('sidebar-tool-empty'), backButton=get('sidebar-tool-back');
  const display=get('sidebar-tool-display'), frameRoot=get('sidebar-tool-frame');
  // The existing extension Host owns the trusted proxy card, never installed HTML/JS.
  const aiProxyContainer=doc.createElement('section');
  aiProxyContainer.id='sidebar-tool-ai-proxy-native';
  aiProxyContainer.className='sidebar-tool-ai-proxy-native';
  aiProxyContainer.setAttribute('aria-label','AI 网站访问可信控制');
  aiProxyContainer.hidden=true;
  frameRoot.after?.(aiProxyContainer);
  const status=get('sidebar-tool-status'), fileInput=get('sidebar-tool-file');
  const importTrigger=get('sidebar-tool-import-trigger'), importPanel=get('sidebar-tool-import');
  const importClose=get('sidebar-tool-import-close'), preview=get('sidebar-tool-preview');
  const previewTitle=get('sidebar-tool-preview-title'), previewVersion=get('sidebar-tool-preview-version');
  const previewDescription=get('sidebar-tool-preview-description');
  const previewCapabilities=get('sidebar-tool-preview-capabilities'), previewFile=get('sidebar-tool-preview-file');
  const installButton=get('sidebar-tool-install'), removeButton=get('sidebar-tool-remove');
  const removeReview=get('sidebar-tool-inline-remove');
  const removeReviewText=get('sidebar-tool-inline-remove-text');
  const removeReviewConfirm=get('sidebar-tool-inline-remove-confirm');
  const removeReviewCancel=get('sidebar-tool-inline-remove-cancel');
  const fileError=get('sidebar-tool-file-error'), updatePanel=get('sidebar-tool-update');
  const updateVersions=get('sidebar-tool-update-versions');
  const updateCapabilities=get('sidebar-tool-update-capabilities');
  const updateWarning=get('sidebar-tool-update-warning');
  const title=get('sidebar-tool-title'),openTabButton=get('sidebar-tool-open-tab');
  const actionReview=get('sidebar-tool-action-review'),actionSummary=get('sidebar-tool-action-summary');
  const actionContinue=get('sidebar-tool-action-continue'),actionCancel=get('sidebar-tool-action-cancel');
  let pendingAction=null;
  const settingsButton=get('sidebar-tool-settings-open'),settingsView=get('sidebar-tool-settings-view');
  const menuButton=get('sidebar-tool-context-menu');
  const settingsScopeButton=get('sidebar-tool-settings-scope');
  const enableButton=get('sidebar-tool-enable'),enableHint=get('sidebar-tool-enable-hint');
  const launchButton=get('sidebar-tool-launch'),eyeButton=get('sidebar-tool-visibility');
  const visibilitySection=get('sidebar-tool-visibility-settings');
  const pageExceptionSection=get('sidebar-tool-page-exceptions');
  const retiredDraft=get('sidebar-tool-retired-draft'),retiredDraftText=get('sidebar-tool-retired-draft-text');
  const retiredDraftDismiss=get('sidebar-tool-retired-draft-dismiss');
  const recoverableDrafts=new Map();let frameDraft='';
  const settingsScopeLabel=get('sidebar-tool-settings-scope-label'),settingsTarget=get('sidebar-tool-settings-target');
  const settingsAllow=get('sidebar-tool-settings-allow'),settingsDeny=get('sidebar-tool-settings-deny');
  const settingsHint=get('sidebar-tool-settings-hint');
  const settingsSiteVisibility=get('sidebar-tool-settings-site-visibility');
  const settingsPageVisibility=get('sidebar-tool-settings-page-visibility');
  const settingsSites=get('sidebar-tool-settings-sites'),settingsPages=get('sidebar-tool-settings-pages');
  const settingsSitesTitle=get('sidebar-tool-settings-sites-title');
  const readOnlyBanner=get('sidebar-tool-readonly-banner');
  const officialRoot=get('sidebar-tool-official-catalog');
  const discoverPanel=get('sidebar-tool-discover-panel'),discoverToggle=get('sidebar-tool-discover-toggle');
  const search=get('sidebar-tool-search'),filterAvailable=get('sidebar-tool-filter-available'),filterAll=get('sidebar-tool-filter-all');
  let officialFilter='available',officialQuery='';
  let officialReleases=[],officialError='',officialLoaded=false;
  let officialMatches=new Set(),checkedInstalled=null,checkedReleases=null,matchEpoch=0,lastOfficialView='';
  let siteGrants={},menuGrants={},promptGrants={},siteEpoch=0,tocVisibility={},tocVisibilityEpoch=0,expandedSiteTool='';
  let tocPageRules={},tocPageRulesEpoch=0,tocSettingsOpen=false,tocScope='site',lastTocSettingsRows='';
  const siteTogglePending=new Set();
  let captureGrants={},enableRecords,enableReadEpoch=0,enableReadError=true;
  let knowledgeWindowStart=0,knowledgeRequestCount=0;
  let knowledgeDirty=false;
  const knowledgeOperation=operation=>KNOWLEDGE_OPERATIONS.includes(operation)||operation==='knowledge.editorState';
  let clipGrants={},clipSiteEpoch=0;
  let installed=[], pending=null, pendingBaseline=null, pendingRelease=null,pendingOperationId=null, active=null, frame=null, nativeUI=null, nativePending=false, instance=null, disposed=false, readOnlyPreview=false, previewDirty=false,lastInstalledView='';
  let revocationEpochs={},frameRevocationEpoch=null,revocationReadEpoch=0;
  let requestCount=0,requestWindow=Date.now(), busy=false, fileSelection=0, catalogEpoch=0;
  let visible=false,toolDirty=false,toolSaving=false,installedReadError=false,preinstallBusy=false,preinstallQueued=false;
  let pendingUninstallId=null,pendingUninstallBaseline=null;
  const listeners=[];
  const listen=(node,type,fn)=>{
    node.addEventListener(type,fn);
    listeners.push(()=>node.removeEventListener(type,fn));
  };
  const notice=(message,problem=false)=>{
    if(disposed)return;
    status.textContent=message;status.dataset.state=problem?'error':'info';
    status.hidden=!message;
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
    'browser.runtime':'读取操作系统和处理器架构，用于工具兼容性判断',
    'browser.i18n':'读取浏览器语言偏好并识别工具提供的文本语言',
    'browser.contextMenu':'在明确授权的网站显示 Chrome 右键菜单（最多三项）',
    'page.prompts':'在授权的 ChatGPT 主内容区域显示提示词快捷按钮（仅插入草稿）',
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
  const cookiePermissions=doc.createElement('section');
  cookiePermissions.className='sidebar-tool-cookie-permissions od-surface';
  cookiePermissions.setAttribute('aria-label','Cookie 网站独立授权');
  cookiePermissions.hidden=true;
  const cookieHeading=doc.createElement('strong');
  cookieHeading.textContent='Cookie 网站权限';
  const cookieTarget=doc.createElement('p');
  cookieTarget.className='sidebar-toc-settings-hint';
  const cookieHelp=doc.createElement('p');
  cookieHelp.className='sidebar-toc-settings-hint';
  cookieHelp.textContent='只有在目标网站的活动 Chrome 标签页才能授权；授权后可切换标签继续管理。敏感值单独授权，全部权限可随时撤销。';
  cookiePermissions.append(cookieHeading,cookieTarget,cookieHelp);
  // Trusted Side Panel first-use actions; an iframe cannot forge a grant.
  const cookieFirstUse=doc.createElement('div');
  cookieFirstUse.className='sidebar-tool-cookie-first-use';
  const cookieReadWrite=doc.createElement('button');cookieReadWrite.type='button';
  cookieReadWrite.className='od-button';cookieReadWrite.textContent='允许查看与编辑本站 Cookie';
  const cookieReadOnly=doc.createElement('button');cookieReadOnly.type='button';
  cookieReadOnly.className='od-button';cookieReadOnly.textContent='仅查看 Cookie';
  cookieFirstUse.append(cookieReadWrite,cookieReadOnly);cookiePermissions.append(cookieFirstUse);
  const cookieButtons=new Map();
  for(const [cap,label] of cookieCaps){
    const row=doc.createElement('div');
    row.className='sidebar-toc-settings-row';
    const name=doc.createElement('span');name.textContent=label;
    const button=doc.createElement('button');button.type='button';
    button.className='sidebar-toc-visibility-toggle';button.dataset.cookieCapability=cap;
    button.setAttribute('aria-label',label+'网站授权');
    cookieButtons.set(cap,button);row.append(name,button);cookiePermissions.append(row);
  }
  const cookieOtherSites=doc.createElement('div');
  cookieOtherSites.className='sidebar-toc-settings-entries';
  cookiePermissions.append(cookieOtherSites);
  settingsView?.append(cookiePermissions);
  // Full Bookmarks belongs to the installed package, never inherited from Owned.
  const fullBookmarkSettings=doc.createElement('section');
  fullBookmarkSettings.className='sidebar-tool-cookie-permissions od-surface';
  fullBookmarkSettings.setAttribute('aria-label','Chrome 完整书签独立授权');
  fullBookmarkSettings.hidden=true;
  const fullBookmarkHeading=doc.createElement('strong');
  fullBookmarkHeading.textContent='完整 Chrome 书签访问';
  const fullBookmarkInfo=doc.createElement('p');fullBookmarkInfo.className='sidebar-toc-settings-hint';
  fullBookmarkInfo.textContent='可读取、编辑、移动及删除所有 Chrome 书签和文件夹（包括其他工具创建的）。仅此工具安装版本可用，递归删除仍需逐次确认。';
  const fullBookmarkButton=doc.createElement('button');
  fullBookmarkButton.type='button';fullBookmarkButton.className='od-button';
  fullBookmarkSettings.append(fullBookmarkHeading,fullBookmarkInfo,fullBookmarkButton);
  settingsView?.append(fullBookmarkSettings);
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
    cookiePermissions.hidden=!app;
    if(!app)return;
    const origin=websiteOrigin(currentPageTarget?.snapshot?.url),record=cookieSiteRecord(tool,origin);
    cookieTarget.textContent=origin?'当前网站：'+origin:'请选择普通 HTTP(S) 网页才能授权新网站';
    cookieFirstUse.hidden=record?.read===true||!origin;
    cookieReadOnly.disabled=busy||!origin||!tool.capabilities.includes('browser.cookies.read');
    cookieReadWrite.disabled=busy||!origin||
      !tool.capabilities.includes('browser.cookies.read')||
      !tool.capabilities.includes('browser.cookies.write');
    for(const [cap,button] of cookieButtons){
      const allowed=record?.[cap]===true;
      button.textContent=allowed?'撤销授权':'授权此网站';
      button.dataset.enabled=String(allowed);
      button.setAttribute('aria-pressed',String(allowed));
      button.disabled=busy||!origin||!tool.capabilities.includes('browser.cookies.'+cap)||
        (!allowed&&cap==='values'&&record?.read!==true);
    }
    // Previously granted sites remain revocable after their tabs are closed.
    // Revocation is an explicit user click and never requires recreating a tab.
    cookieOtherSites.replaceChildren();
    const sites=menuGrants?.[tool.id]?.cookieSites||{};
    for(const [site,row] of Object.entries(sites)){
      if(site===origin||!Object.values(row||{}).some(v=>v===true))continue;
      const line=doc.createElement('div');line.className='sidebar-toc-settings-row';
      const name=doc.createElement('span');name.textContent=site;
      const revoke=doc.createElement('button');revoke.type='button';revoke.textContent='撤销网站权限';
      revoke.setAttribute('aria-label','撤销 '+site+' 的全部 Cookie 权限');
      revoke.disabled=busy;
      revoke.addEventListener('click',event=>{if(!event.isTrusted)return;
        void changeCookieSite({site,all:true}).catch(error=>notice((error.code||'E_COOKIE')+'：'+error.message,true));});
      line.append(name,revoke);cookieOtherSites.append(line);
    }
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
  cookieReadOnly.addEventListener('click',event=>{
    if(!event?.isTrusted)return;
    void changeCookieSite({capability:'read'}).then(()=>{
      tocSettingsOpen=false;render();
    }).catch(error=>notice((error?.code||'E_COOKIE')+'：'+String(error?.message||error).slice(0,180),true));
  });
  cookieReadWrite.addEventListener('click',event=>{
    if(!event?.isTrusted)return;
    // One choice, two independent Host authorizations; partial failure is visible.
    void (async()=>{
      const origin=websiteOrigin(currentPageTarget?.snapshot?.url),tool=active;
      if(!tool||!origin)return;
      if(cookieSiteRecord(tool,origin)?.read!==true)
        await changeCookieSite({capability:'read'});
      if(active!==tool||websiteOrigin(currentPageTarget?.snapshot?.url)!==origin)return;
      if(cookieSiteRecord(tool,origin)?.write!==true)
        await changeCookieSite({capability:'write'});
      if(active===tool){tocSettingsOpen=false;render();}
    })().catch(error=>notice('组合授权未全部完成，已授权项目以可信设置为准（'+
      (error?.code||'E_COOKIE')+'）：'+String(error?.message||error).slice(0,160),true));
  });
  for(const [cap,button] of cookieButtons)button.addEventListener('click',event=>{
    if(!event.isTrusted)return;
    void changeCookieSite({capability:cap}).catch(error=>
      notice((error?.code||'E_COOKIE')+'：'+String(error?.message||error).slice(0,180),true));
  });
  const timePermissions=settingsView?createTimeReviewPermissionControls({api,doc,container:settingsView,notice,runOperation:runTrustedTimeReviewOperation}):null;
  const focusPermissions=settingsView&&focus?.createPermissionControls
    ?focus.createPermissionControls({api,doc,container:settingsView,notice,runOperation:(operation,payload,event)=>{
      const tool=active;
      return focus.runTrustedOperation({api,tool,operation,payload,event,assertCurrent:phase=>{
        if(disposed||!tool||!samePackage(active,tool)||
           phase==='initial'&&busy||phase!=='after-send'&&readOnlyPreview)
          throw Object.assign(new Error('工具已关闭或不可用'),{code:'E_TOOL_CHANGED'});
      }});
    }}):null;
  const adblockContainer=get('sidebar-tool-adblock-native');
  const adblockControls=adblockContainer&&adblock?.createPermissionControls?
    adblock.createPermissionControls({api,doc,container:adblockContainer,notice,
      runOperation:(operation,payload,event)=>{
        const tool=active;
        return adblock.runTrustedOperation({api,tool,operation,payload,event,
          revocationEpoch:frameRevocationEpoch,assertCurrent:phase=>{
            if(disposed||!tool||!samePackage(active,tool)||
               phase==='initial'&&busy||phase!=='after-send'&&readOnlyPreview)
              throw Object.assign(new Error('当前工具已变更或关闭'),{code:'E_TOOL_CHANGED'});
          }});
      }}):null;
  const aiPermissions=aiAccess?.createPermissionControls
    ?aiAccess.createPermissionControls({api,doc,container:aiProxyContainer,notice,
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
    pending=null;pendingBaseline=null;pendingRelease=null;pendingOperationId=null;
    preview.hidden=true;updatePanel.hidden=true;installButton.disabled=true;
  }
  function setFileError(message='') {
    fileError.textContent=message;fileError.hidden=!message;
    fileInput.setAttribute('aria-invalid',String(Boolean(message)));
  }
  function clearImport() {
    fileSelection++;resetReview();
    fileInput.value='';setFileError();
  }
  function setImportOpen(open) {
    importPanel.hidden=!open;
    importTrigger.setAttribute('aria-expanded',String(open));
    if(!open)clearImport();
  }
  const sameInstance=(source,token)=>!disposed&&active&&frame&&frame.contentWindow===source&&instance===token;
  const toolById=id=>installed.find(row=>row.id===id);
  // In-page decisions replace synchronous browser dialogs. Every destructive
  // confirmation is bound to a reviewed action and rechecks identity on commit.
  function cancelActionReview(){
    const old=pendingAction;pendingAction=null;actionReview.hidden=true;
    old?.cancel?.();
  }
  function requestActionReview({message,button='继续',run,toolId=null,cancel=null}){
    if(disposed||busy)return;
    if(pendingAction)cancelActionReview();
    pendingAction={run,toolId,cancel};
    actionSummary.textContent=message;
    actionContinue.textContent=button;
    actionReview.hidden=false;
    actionReview.scrollIntoView?.({block:'nearest'});
  }
  async function applyActionReview(event){
    const choice=pendingAction;
    if(!choice||busy||disposed)return;
    pendingAction=null;actionReview.hidden=true;
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
        try{Promise.resolve(run(event)).then(v=>settle(true,v),e=>settle(false,e));}
        catch(e){settle(false,e);}
      }});
      timer=setTimeout(()=>{if(pendingAction?.cancel===cancel)cancelActionReview();},90000);
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
    if(frameRoot.dataset)delete frameRoot.dataset.timeReviewNative;
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
  // An optional installed-list companion, never another top-level tab.
  function setDiscoveryOpen(open){
    if(disposed)return;
    discoverPanel.hidden=!open;
    discoverToggle.setAttribute('aria-expanded',String(Boolean(open)));
  }
  function marketDetail(release){
    return api.tabs.create({url:api.runtime.getURL('ui/marketplace.html')+
      '#/apps/'+release.id+'/versions/'+release.version});
  }
  function renderOfficialTools(){
    if(!officialRoot)return;
    if(checkedInstalled!==installed||checkedReleases!==officialReleases){
      checkedInstalled=installed;checkedReleases=officialReleases;officialMatches=new Set();
      const epoch=++matchEpoch;
      Promise.all(officialReleases.map(async release=>[
        release.id,await matchesOfficialRelease(release,toolById(release.toolId))
      ])).then(rows=>{
        if(disposed||epoch!==matchEpoch)return;
        officialMatches=new Set(rows.filter(([,matches])=>matches).map(([id])=>id));render();
      }).catch(()=>{/* A failed digest never grants official attribution. */});
    }
    const view=JSON.stringify([officialLoaded,officialError,busy,officialReleases,officialFilter,officialQuery,
      officialReleases.map(release=>[officialToolStatus(release,installed),officialMatches.has(release.id)])]);
    // Keep DOM controls mounted across unrelated page observations and pointer gestures.
    if(view===lastOfficialView)return;
    lastOfficialView=view;
    const focusId=doc.activeElement?.dataset?.officialInstall;
    officialRoot.replaceChildren();
    if(!officialLoaded){
      const message=doc.createElement('p');message.className='sidebar-tool-discovery-message';
      message.textContent=officialError||'正在读取内置工具…';officialRoot.append(message);
      if(officialError){
        const retry=doc.createElement('button');retry.type='button';retry.className='od-button';retry.textContent='重新读取';
        retry.addEventListener('click',action(loadOfficial));officialRoot.append(retry);
      }
      return;
    }
    const candidates=officialReleases.filter(release=>{
      const state=officialToolStatus(release,installed);
      if(officialFilter==='available'&&state!=='available')return false;
      return !officialQuery||[release.packageTitle,release.description,release.toolId]
        .some(value=>value.toLocaleLowerCase().includes(officialQuery));
    });
    if(!candidates.length){
      const emptyResult=doc.createElement('p');emptyResult.className='sidebar-tool-discovery-message';
      emptyResult.textContent=officialQuery?'没有找到匹配的工具':
        officialFilter==='available'?'内置工具已全部安装。可前往应用市场发现更多工具。':'没有可展示的工具';
      officialRoot.append(emptyResult);return;
    }
    for(const release of candidates){
      const state=officialToolStatus(release,installed),row=doc.createElement('div');
      row.className='sidebar-tool-official od-surface';row.dataset.officialToolId=release.toolId;
      row.dataset.installationState=state;
      const copy=doc.createElement('div');copy.className='sidebar-tool-official-copy';
      const name=doc.createElement('button');name.type='button';name.className='sidebar-tool-official-title';
      name.textContent=release.packageTitle;name.title='查看「'+release.packageTitle+'」详情';
      name.addEventListener('click',action(()=>marketDetail(release)));
      const description=doc.createElement('span');description.className='sidebar-tool-official-description';
      description.textContent=release.description;
      copy.append(name,description);
      const button=doc.createElement('button');button.type='button';button.className='od-button';
      button.id='sidebar-tool-official-'+release.toolId+'-install';button.dataset.officialInstall=release.toolId;
      const matched=officialMatches.has(release.id);
      button.textContent=state==='available'?'安装':state==='update'?'更新':
        state==='installed'&&matched?'打开':'管理';
      button.disabled=busy;
      button.setAttribute('aria-label',button.textContent+'官方'+release.packageTitle);
      button.addEventListener('click',action(()=>['available','update'].includes(state)?reviewOfficial(release):
        state==='installed'&&matched?(setDiscoveryOpen(false),openTool(release.toolId)):marketDetail(release)));
      row.append(copy,button);officialRoot.append(row);
      if(focusId===release.toolId)button.focus?.({preventScroll:true});
    }
  }
  async function loadOfficial(){
    if(!officialRoot)return;
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
      reviewCandidate(tool,'来源：OpenDesk 官方发行 · SHA-256 '+release.sha256,release);
    }catch(error){
      if(disposed||selection!==fileSelection)return;
      setFileError((error.code||'E_PACKAGE')+'：'+String(error.message||error));
    }
  }
  function renderInstalledTools() {
    const view=JSON.stringify([busy,enableReadError,enableRecords,installed,officialReleases]);
    if(view===lastInstalledView)return;
    lastInstalledView=view;
    const focusedId=doc.activeElement?.dataset?.sidebarToolId;
    list.replaceChildren();
    for(const row of installed){
      const item=doc.createElement('div');item.className='sidebar-tool-row';item.dataset.sidebarToolId=row.id;
      const button=doc.createElement('button');button.type='button';button.className='sidebar-tool-item';
      button.dataset.sidebarToolId=row.id;button.dataset.sidebarToolAction='open';button.title=row.description;
      button.setAttribute('aria-label','打开工具「'+row.title+'」的详情');
      const icon=doc.createElement('span');icon.className='sidebar-tool-item-icon';icon.setAttribute('aria-hidden','true');
      icon.innerHTML='<svg viewBox="0 0 24 24"><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/></svg>';
      const copy=doc.createElement('span');copy.className='sidebar-tool-item-copy';
      const heading=doc.createElement('strong');heading.textContent=row.title;
      const newerRelease=officialReleases.find(release=>release.toolId===row.id&&officialToolStatus(release,installed)==='update');
      if(newerRelease){const marker=doc.createElement('span');marker.className='sidebar-tool-update-mark';marker.textContent='可更新';heading.append(marker);}
      const subtitle=doc.createElement('small');subtitle.textContent=row.description;copy.append(heading,subtitle);
      if(installed.some(other=>other.id!==row.id&&other.title===row.title)){
        const identity=doc.createElement('span');identity.className='sidebar-tool-item-identity';
        identity.textContent='安装 ID：'+row.id;copy.append(identity);
        button.setAttribute('aria-label','打开工具「'+row.title+'」的详情，安装 ID：'+row.id);
      }
      const version=doc.createElement('span');version.className='sidebar-tool-item-version';
      version.textContent='v'+row.version+(enableReadError?' · 状态异常':sidebarToolEnabled(enableRecords,row.id)?'':' · 已停用');
      button.append(icon,copy,version);button.addEventListener('click',()=>openTool(row.id));item.append(button);list.append(item);
      if(row.id===focusedId&&!active)button.focus?.({preventScroll:true});
    }
  }
  function siteCapability(tool){
    return tool?.id===PROMPT_ID&&tool?.capabilities.includes(PROMPT_CAPABILITY)?PROMPT_CAPABILITY:
      tool?.capabilities.includes(CAPTURE_CAPABILITY)?CAPTURE_CAPABILITY:
      tool?.capabilities.includes(CLIP_CAPABILITY)?CLIP_CAPABILITY:
      tool?.capabilities.includes(TOC_CAPABILITY)?TOC_CAPABILITY:null;
  }
  function renderTocSettings(){
    const managed=Boolean(active&&!readOnlyPreview),id=active?.id;
    const enabled=Boolean(managed&&!enableReadError&&sidebarToolEnabled(enableRecords,id));
    timePermissions?.render(active,readOnlyPreview);
    focusPermissions?.render(active,readOnlyPreview,enabled);
    adblockControls?.render(active,readOnlyPreview,enabled);
    aiPermissions?.render(active,readOnlyPreview,enabled);
    aiProxyContainer.hidden=!(managed&&id===AI_ID&&enabled&&(frame||nativeUI));
    const sitePending=siteTogglePending.has(id);
    const isToc=managed&&id===READING_TOC_TOOL_ID&&active.capabilities.includes(TOC_CAPABILITY);
    if(!managed)tocSettingsOpen=false;
    const show=managed&&tocSettingsOpen;
    settingsButton.hidden=!managed;settingsButton.disabled=busy||sitePending;
    settingsButton.setAttribute('aria-expanded',String(show));
    // Time Review uses the same trusted static settings DOM as an inline
    // enrollment card. Do not replace/hide its live stats iframe.
    const trustedInline=show&&(id===TIME_REVIEW_ID||id===FOCUS_ID||id===AI_ID||isCookieTool(active)||isFullBookmarkTool(active));
    // Native approval/stop remains visible above a live sandbox, never inside it.
    if(trustedInline&&settingsView.nextElementSibling!==frameRoot)frameRoot.before?.(settingsView);
    else if(!trustedInline&&settingsView.previousElementSibling!==retiredDraft)retiredDraft.after?.(settingsView);
    display.setAttribute('data-trusted-tool-inline',String(trustedInline));
    settingsView.hidden=!show;frameRoot.hidden=(show&&!trustedInline)||!(frame||nativeUI);
    renderCookieSettings(show);
    fullBookmarkSettings.hidden=!(show&&managed&&isFullBookmarkTool(active));
    const fullGrant=menuGrants?.[id],currentEpoch=revocationEpochs[id]??null;
    const hasFullBookmarkConsent=Boolean(fullGrant?.bookmarkFull===true&&
      fullGrant.version===active?.version&&fullGrant.installEpoch===currentEpoch);
    fullBookmarkButton.textContent=hasFullBookmarkConsent?'撤销此工具的完整书签访问':'授权此工具访问全部书签';
    fullBookmarkButton.disabled=busy||!enabled||!isFullBookmarkTool(active);
    fullBookmarkButton.setAttribute('aria-pressed',String(hasFullBookmarkConsent));
    removeButton.hidden=readOnlyPreview;if(openTabButton)openTabButton.hidden=readOnlyPreview;
    if(enableButton){enableButton.textContent=enabled?'停用工具':'启用工具';enableButton.disabled=busy||enableReadError;
      enableButton.setAttribute('aria-pressed',String(enabled));}
    if(enableHint)enableHint.textContent=enableReadError?'启停状态读取异常；已保护性停止运行。':
      enabled?'工具已启用。启用不会自动运行代码。':'工具已停用。数据、网站授权和显示偏好保留。';
    if(launchButton){launchButton.hidden=!managed||Boolean(frame||nativeUI||nativePending);launchButton.disabled=busy||!enabled;
      launchButton.textContent=enabled?'打开工具':'已停用，请在设置中启用';}
    const url=currentPageTarget?.snapshot?.url,capability=siteCapability(active);
    const origin=capability===PROMPT_CAPABILITY?supportedOrigin(url):
      capability===CAPTURE_CAPABILITY?chatCaptureOrigin(url):websiteOrigin(url);
    const grants=capability===PROMPT_CAPABILITY?promptGrants:
      capability===CAPTURE_CAPABILITY?captureGrants:capability===CLIP_CAPABILITY?clipGrants:siteGrants;
    const promptGrant=grants?.[PROMPT_ID];
    const grant=Boolean(capability&&origin&&(capability===PROMPT_CAPABILITY?
      promptGrant?.version===active?.version&&promptGrant?.installEpoch===(revocationEpochs[id]??null)&&
        promptGrant?.origins?.includes(origin):capability===TOC_CAPABILITY?
      tocSiteAllowed(grants,id,url):grantedOrigins(grants,id).includes(origin)));
    const appearance=readingTocDisplayState(tocVisibility,id,url);
    const pageAllowed=readingTocPageAllowed(tocPageRules,id,url);
    if(eyeButton){
      eyeButton.hidden=!isToc;eyeButton.disabled=busy||sitePending||!enabled||!origin||!grant||!pageAllowed;
      eyeButton.title=!enabled?'工具已停用，请先在设置中启用':!origin?'请切换到普通 HTTP(S) 网页':
        !grant?'当前网站已停用，请在设置中恢复':!pageAllowed?'当前页面已排除，请在设置中恢复':
        appearance.show?'隐藏此网站的悬浮目录':'显示此网站的悬浮目录（同时恢复当前页面）';
      eyeButton.setAttribute('aria-label',eyeButton.title);eyeButton.setAttribute('aria-pressed',String(appearance.show));
    }
    if(!show)return;
    // Only tools with the generic TOC/Clip/Capture site capability use
    // these controls. Time Review and Stay Focus have independent trust scopes.
    const capabilityOnly=Boolean(siteCapability(active));
    for(const id of ['sidebar-tool-generic-site-scope','sidebar-tool-generic-site-binary',
      'sidebar-tool-generic-site-advanced']){
      const node=get(id);if(node)node.hidden=!capabilityOnly;
    }
    settingsHint.hidden=!capabilityOnly;
    settingsScopeLabel.textContent=isToc?'当前网站可用性':'当前网站授权';
    settingsTarget.textContent=capability?(origin||'请选择适用网页'):'此工具不需要网站授权';
    settingsScopeButton.hidden=true;
    for(const [button,chosen] of [[settingsAllow,grant],[settingsDeny,!grant]]){
      button.textContent=isToc?(button===settingsAllow?'启用当前网站':'停用当前网站'):
        button===settingsAllow?'授权当前网站':'撤销当前网站授权';
      button.hidden=!capability;button.disabled=busy||sitePending||!origin;button.setAttribute('aria-pressed',String(Boolean(origin)&&chosen));
    }
    settingsHint.textContent=isToc?'阅读目录默认可用于所有 HTTP(S) 网页；可在此停用当前网站或排除单页。'+
      (!origin?'当前页面不支持目录。':grant?'当前网站可用。':'当前网站已停用。'):
      !capability?'工具能力以安装时的审阅为准。':!origin?'请切换到适用网页，设置仍可管理。':
      grant?'当前网站已授权；授权与工具启停、外观显隐互相独立。':
        '点击授权后直接生效：'+readableCapability(capability)+'。仅适用于上方网站，可随时撤销。';
    if(visibilitySection)visibilitySection.hidden=!isToc;
    if(pageExceptionSection)pageExceptionSection.hidden=!isToc;
    for(const [button,hidden] of [[settingsSiteVisibility,appearance.hiddenOnSite],[settingsPageVisibility,appearance.hiddenOnPage]]){
      button.hidden=!isToc;button.textContent=hidden?'恢复显示':'隐藏';button.setAttribute('aria-pressed',String(!hidden));
      button.disabled=busy||sitePending||!enabled||!grant||!origin;
    }
    const origins=isToc?blockedTocOrigins(grants):capability===PROMPT_CAPABILITY?
      (grant?[CHATGPT_ORIGIN]:[]):capability?grantedOrigins(grants,id):[],denied=isToc?disabledTocPages(tocPageRules,id):[];
    if(settingsSitesTitle)settingsSitesTitle.textContent=isToc?'已停用的网站':'已授权的网站';
    const identity=JSON.stringify([id,origins,denied,busy,sitePending]);
    if(identity===lastTocSettingsRows)return;lastTocSettingsRows=identity;
    const section=(container,items,handler,emptyLabel)=>{
      container.replaceChildren();
      if(!items.length){const label=doc.createElement('p');label.textContent=emptyLabel;container.append(label);}
      for(const entry of items){
        const row=doc.createElement('div');row.className='sidebar-tool-site-entry';
        const label=doc.createElement('span');label.textContent=entry;label.title=entry;
        const button=doc.createElement('button');button.type='button';button.className='sidebar-tool-site-revoke';
        button.textContent=container===settingsSites&&!isToc?'撤销':'恢复';button.setAttribute('aria-label',button.textContent+' '+entry);
        button.disabled=busy||sitePending;
        button.addEventListener('click',action(()=>runSiteToggle(id,()=>handler(entry))));
        row.append(label,button);container.append(row);
      }
    };
    section(settingsPages,denied,url=>setTocPageAvailability(true,url),'没有排除的页面');
    section(settingsSites,origins,url=>capability===PROMPT_CAPABILITY?changePromptSite(id,url,false):
      capability===CAPTURE_CAPABILITY?changeCaptureSite(id,url,false):
      capability===CLIP_CAPABILITY?revokeClipOrigin(id,url):revokeTocOrigin(id,url,isToc),isToc?'没有停用的网站；默认全部可用':'尚未授权任何网站');
  }
  function render() {
    if(disposed)return;
    if(pendingUninstallId&&!installed.some(row=>row.id===pendingUninstallId&&samePackage(row,pendingUninstallBaseline)))
      cancelRemovalReview();
    renderInstalledTools();
    empty.hidden=installed.length!==0||installedReadError;
    renderOfficialTools();
    listView.hidden=Boolean(active);
    display.hidden=!active;
    title.textContent=active?active.title+(readOnlyPreview?' · 只读预览':''):'';
    title.title=active?'v'+active.version:'';
    removeButton.title=readOnlyPreview?'只读预览尚未安装，不能卸载':active?'卸载「'+active.title+'」及其本地数据':'卸载工具';
    removeButton.setAttribute('aria-label',removeButton.title);
    removeButton.disabled=!active || busy || readOnlyPreview;
    if(openTabButton)openTabButton.disabled=!active||busy||readOnlyPreview;
    if(readOnlyBanner)readOnlyBanner.hidden=!readOnlyPreview;
    if(retiredDraft){retiredDraft.hidden=!active||!recoverableDrafts.has(active.id);
      retiredDraftText.value=active?recoverableDrafts.get(active.id)||'':'';}
    if(menuButton){
      const actions=active?.contributes?.contextMenus;
      const hasActions=!readOnlyPreview&&active?.capabilities.includes('browser.contextMenu')&&
        Array.isArray(actions)&&actions.length>0;
      const origin=websiteOrigin(currentPageTarget?.snapshot?.url);
      const enabled=Boolean(active&&origin&&menuGrants[active.id]?.version===active.version&&
        menuGrants[active.id]?.origins?.includes(origin)&&menuGrants[active.id]?.activeActions?.length);
      menuButton.hidden=!hasActions;
      menuButton.disabled=busy||!origin||!hasActions||enableReadError||
        !sidebarToolEnabled(enableRecords,active?.id);
      menuButton.dataset.enabled=String(enabled);
      menuButton.setAttribute('aria-pressed',String(enabled));
      menuButton.title=enabled?'停用此网站的右键菜单':'为当前网站启用右键菜单';
      menuButton.setAttribute('aria-label',menuButton.title);
    }
    renderTocSettings();
    taskWorkbench.setToolActive?.(Boolean(visible && active));
    if(doc.documentElement?.dataset)doc.documentElement.dataset.opendeskTool=visible && active?'active':'list';
  }
  function focusToolInList(id) {
    // R4 uses one visible list; legacy rows remain in the DOM for the original host.
    const controls=[...doc.querySelectorAll('#extension-center-list button[data-extension-key]')]
      .filter(button=>button.dataset.extensionKey==='app:'+id);
    const action=controls.find(button=>button.dataset.extensionAction==='primary')||
      controls.find(button=>button.dataset.extensionAction==='more')||
      controls.find(button=>button.dataset.extensionAction==='main');
    const item=[...list.children].find(node=>node.dataset?.sidebarToolId===id);
    (action || item?.children?.[0] || doc.getElementById('extension-center-search') || importTrigger)
      .focus?.({preventScroll:true});
  }
  function cancelRemovalReview(){
    pendingUninstallId=null;pendingUninstallBaseline=null;
    removeReview.hidden=true;
  }
  // Revoking a hidden iframe also revokes its session token and pending responses.
  const isDirty=()=>!readOnlyPreview&&active?.id===KNOWLEDGE_TOOL_ID&&knowledgeDirty;
  const canLeaveTool=()=>!isDirty()||(notice('知识收件箱有未保存的编辑，请先保存；不会自动丢弃草稿。',true),false);
  function suspendTool() {cancelRemovalReview();cancelActionReview();tocSettingsOpen=false;tocScope='site';destroyFrame();active=null;readOnlyPreview=false;previewDirty=false;knowledgeDirty=false;render();}
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
      nativePending=true;render();backButton.focus?.({preventScroll:true});
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
        protocol:SIDEBAR_TOOL_PROTOCOL,kind:'load',instance:token,tool},'*');
    };
    frameRoot.append(frame);render();backButton.focus?.({preventScroll:true});
    notice(readOnly?'正在加载隔离只读预览（不会安装或保存）…':'正在打开「'+tool.title+'」…');
  }
  function openTool(id,{launchGate=null}={}) {
    
    cancelRemovalReview();
    if(disposed||busy||!visible)return;
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
      destroyFrame();active=tool;readOnlyPreview=false;tocSettingsOpen=true;render();backButton.focus?.();return;
    }
    mountTool(tool,{launchGate});
    return instance;
  }
  // Management never mounts untrusted code. The existing trusted settings UI
  // owns site grants, enable/disable, version details and uninstall reviews.
  function openSettings(id){
    if(disposed||busy||!visible)return false;
    const tool=toolById(id);
    if(!tool){notice('找不到已安装的工具',true);return false;}
    const show=()=>{
      if(disposed||!visible||busy)return;
      cancelRemovalReview();setImportOpen(false);
      destroyFrame();active=tool;readOnlyPreview=false;previewDirty=false;
      tocSettingsOpen=true;tocScope='site';render();backButton.focus?.({preventScroll:true});
    };
    if(active&&!canLeave(show))return false;
    show();return true;
  }
  function openOfficialReview(id){
    if(disposed||busy||!visible||active||!officialLoaded)return false;
    const release=officialReleases.find(row=>row.toolId===id);
    if(!release)return false;
    setDiscoveryOpen(false);
    void reviewOfficial(release);
    return true;
  }
  function openImport(){
    if(disposed||busy||!visible||active)return false;
    setDiscoveryOpen(false);setImportOpen(true);notice('');return true;
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
    if(!next&&visible&&!canLeave(()=>{
      suspendTool();
      if(destination&&destination!=='tools')taskWorkbench.navigate?.(destination);
    }))return false;
    visible=Boolean(next);
    if(!visible){suspendTool();return;}
    // Entering the Tools tab only shows the list: an iframe requires an explicit Open.
    render();
  }
  async function dispatch(operation,payload,tool,source,token,revocationEpoch) {
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
        'browser.screenshot.captureVisible','browser.downloads.download','browser.downloads.cancelOwned','browser.bookmarks.createOwned','browser.bookmarks.removeOwned','browser.bookmarks.create','browser.bookmarks.update','browser.bookmarks.move','browser.bookmarks.remove','browser.bookmarks.removeTree','browser.storage.local.clear'].includes(operation)){
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

      if(['browser.cookies.set','browser.cookies.remove','browser.cookies.clearSite','browser.cookies.observe.start'].includes(operation)&&
         !(operation==='browser.cookies.clearSite'&&payload?.preview===true)){
        const origin=new URL(payload.url).origin;
        const requiredCookieGrant=operation==='browser.cookies.clearSite'?'clear':
          operation==='browser.cookies.observe.start'?'observe':'write';
        if(cookieSiteRecord(tool,origin)?.[requiredCookieGrant]!==true){
          tocSettingsOpen=true;render();
          const currentOrigin=websiteOrigin(currentPageTarget?.snapshot?.url);
          throw Object.assign(new Error(currentOrigin!==origin?
            '请先激活 '+origin+' 标签页，再通过上方可信 Cookie 网站权限区授权 '+requiredCookieGrant:
            '请通过上方可信 Cookie 网站权限区授权 '+requiredCookieGrant+'；未保存草稿可保留'),
          {code:'E_SITE_GRANT_REQUIRED'});
        }
        const kind=operation==='browser.cookies.clearSite'?'清理该网站的 Host-only Cookie':
          operation==='browser.cookies.observe.start'?'开始临时监听 Cookie 变化':
          operation==='browser.cookies.remove'?'删除指定 Cookie':'写入指定 Cookie';
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
      const reply=await api.runtime.sendMessage(envelope);
      assertSession(source,token);
      if(!reply?.ok)throw Object.assign(new Error(reply?.error?.message||'浏览器操作失败'),{
        code:reply?.error?.code||'E_BROWSER'});
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
          tocSettingsOpen=true;render();settingsView.scrollIntoView?.({block:'nearest'});
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
      const result=await adblock.request({api,tool,operation,payload,revocationEpoch,
        assertCurrent:()=>assertSession(source,token),requestBrowserClick,
        openSettings:()=>{tocSettingsOpen=true;render();}});
      if(operation==='adblock.site.restore')void adblockControls?.refresh?.();
      return result;
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
        const response=await api.tabs.sendMessage(target.tabId,{
          protocol:READING_TOC_PROTOCOL,operation,toolId:tool.id,expectedUrl:target.url,installEpoch:revocationEpoch,
          ...(id?{id,sourceId}:{}),
          ...(operation==='toc.snapshot'&&payload?.refresh===true?{forceRefresh:true}:{})
        },{frameId:0,documentId:target.documentId});
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
    let bytes;
    try{bytes=JSON.stringify(message).length;}catch{return;}
    if(bytes>(['browser.clipboard.writeText','browser.downloads.text','knowledge.update','knowledge.create'].includes(message.operation)?170000:12000))return;
    const reply=(ok,result,error)=>{
      if(sameInstance(source,token))source.postMessage({
        protocol:SIDEBAR_TOOL_PROTOCOL,kind:'response',instance:token,toolId:tool.id,
        requestId:message.requestId,ok,...(ok?{result}:{error:{code:String(error?.code||'E_TOOL').slice(0,64),
          message:String(error?.message||error).slice(0,250)}})
      },'*');
    };
    if(message.operation==='knowledge.editorState'){
      // Set the guard immediately; do not queue it behind content operations.
      void dispatch(message.operation,message.payload,tool,source,token,revocationEpoch).then(result=>reply(true,result),error=>reply(false,null,error));
      return;
    }
    if(rateExceeded){reply(false,null,new Error(knowledgeOperation(message.operation)?'工具请求过于频繁，请稍后重试':'工具请求过于频繁，请一分钟后重试'));return;}
    // Serialize mutations for each tool; concurrent set operations cannot overwrite each other.
    const previous=queued.get(tool.id)||Promise.resolve();
    const work=previous.catch(()=>{}).then(()=>dispatch(message.operation,message.payload,tool,source,token,revocationEpoch));
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
      menuGrants=changes[BROWSER_MENU_GRANTS_STORE]?.newValue||{};render();
      if(isCookieTool(active)&&frame&&instance)
        frame.contentWindow?.postMessage({protocol:SIDEBAR_TOOL_PROTOCOL,
          kind:'cookie-grants-changed',instance,toolId:active.id},'*');
    }
    if(Object.hasOwn(changes||{},CAPTURE_SITE_STORE)){
      captureGrants=changes[CAPTURE_SITE_STORE]?.newValue||{};render();
      // Revoking capture stops future page reads; explicitly saved local assets remain available.
    }
    if(Object.hasOwn(changes||{},PROMPT_SITE_STORE)){
      promptGrants=changes[PROMPT_SITE_STORE]?.newValue||{};render();
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
          notice('时间回顾安装代际已撤销；请重新打开已核验工具。',true);
        }else notice('当前工具实例已撤销；草稿仍在当前页面，请复制后重新打开。',true);
      }
    }
    if(Object.hasOwn(changes||{},MARKET_PROVENANCE_STORE)&&(nativeUI||nativePending)&&
       trustedTimeReviewProvenanceChanged(changes[MARKET_PROVENANCE_STORE])){
      // Retire only when this exact tool's own trusted source changed or the
      // map cannot be checked. Another tool's install must not close Time Review.
      destroyFrame();tocSettingsOpen=true;render();
      notice('Time Review 官方来源身份发生变化；可信 UI 已关闭。',true);
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
        fileSelection++;resetReview();fileInput.value='';
        setFileError('已安装工具发生变化，请重新选择文件核对权限');
      }
    }
    render();
    if(invalidated){
      if(visible)importTrigger.focus?.({preventScroll:true});
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

  // Fixed trusted consent: package hash, installation incarnation and the
  // exact ChatGPT origin are bound under the existing tool/catalog locks.
  async function changePromptSite(id,origin,enabled,target=null){
    if(disposed||busy||id!==PROMPT_ID||supportedOrigin(origin)!==CHATGPT_ORIGIN)
      throw new Error('提示词工具仅允许授权 chatgpt.com');
    const tool=toolById(id);
    if(!tool?.capabilities.includes(PROMPT_CAPABILITY))throw new Error('提示词工具已更新或不存在');
    await locked('tool:'+id,()=>locked('catalog',async()=>{
      const current=admittedList((await api.storage.local.get(SIDEBAR_TOOL_STORE))[SIDEBAR_TOOL_STORE]);
      if(!current.some(row=>samePackage(row,tool)))throw new Error('工具安装状态已变化');
      if(enabled)await assertSidebarToolEnabled(api,id);
      if(target)await currentPageTarget.revalidate(target);
      const persisted=await api.storage.local.get([PROMPT_SITE_STORE,TOOL_REVOCATION_EPOCHS_STORE]);
      const raw=persisted[PROMPT_SITE_STORE],prior=raw||{};
      if(prior!==null&&(typeof prior!=='object'||Array.isArray(prior)))
        throw new Error('提示词授权存储无效，已拒绝覆盖');
      const record=prior[PROMPT_ID];
      const has=record?.version===tool.version&&
        record?.installEpoch===(persisted[TOOL_REVOCATION_EPOCHS_STORE]?.[id]??null)&&
        record?.origins?.includes(CHATGPT_ORIGIN);
      if(Boolean(has)===enabled)return;
      const next=await changePromptSiteGrant(prior,tool,
        persisted[TOOL_REVOCATION_EPOCHS_STORE]?.[id]??null,enabled);
      await writeVerifiedLocalValue(api,PROMPT_SITE_STORE,next,raw,'ChatGPT 提示词网站授权');
      promptGrants=next;
    }));
    render();
    notice(enabled?'已允许 ChatGPT 网页显示提示词按钮（不自动发送）':'已撤销 ChatGPT 网页按钮授权，已保存内容保留');
  }
  async function togglePromptSite(id){
    if(!currentPageTarget?.capture||!currentPageTarget?.revalidate)
      throw new Error('请先选择有效的 ChatGPT 标签页');
    const target=currentPageTarget.capture(),origin=supportedOrigin(target.url);
    if(origin!==CHATGPT_ORIGIN)throw new Error('请先打开 https://chatgpt.com/');
    const record=promptGrants?.[PROMPT_ID];
    const installed=toolById(id);
    const on=record?.version===installed?.version&&record?.origins?.includes(origin)&&
      record?.installEpoch===(revocationEpochs[id]??null);
    await changePromptSite(id,origin,!on,target);
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
  function reviewCandidate(candidate,sourceLabel,release=null){
    requireToolRuntime(candidate);
    const previous=toolById(candidate.id);
    pending=candidate;pendingBaseline=previous?structuredClone(previous):null;
    pendingRelease=release;pendingOperationId=release?crypto.randomUUID():null;
    previewTitle.textContent=candidate.title;
    previewVersion.textContent='v'+candidate.version;
    previewDescription.textContent=candidate.description;
    previewCapabilities.textContent=candidate.capabilities.length
      ?candidate.capabilities.map(readableCapability).join('、'):'无需额外能力';
    previewFile.textContent=sourceLabel;
    if(previous){
      const added=addedCapabilities(candidate,previous);
      const removed=previous.capabilities.filter(id=>!candidate.capabilities.includes(id));
      const change=versionOrder(candidate.version,previous.version);
      updatePanel.hidden=false;
      updateVersions.textContent='当前 v'+previous.version+' → 新 v'+candidate.version;
      updateCapabilities.textContent='新增能力：'+(added.map(readableCapability).join('、')||'无')+
        '；移除能力：'+(removed.map(readableCapability).join('、')||'无');
      const risks=[...(change<0?['版本回退']:[]),
        ...(added.length?['申请新增能力']:[]),
        ...(change===0&&!samePackage(candidate,previous)?['相同版本的内容发生变化']:[]),
        ...(!samePackage(candidate,previous)?['将替换同 ID 的已安装代码，请核对来源；现有工具数据保留']:[])];
      updateWarning.textContent=risks.length?'点击确认更新前请核对：'+risks.join('；')+'。':'';
      updateWarning.hidden=!risks.length;
      const identical=samePackage(candidate,previous);
      installButton.textContent=identical?'已安装相同工具':'确认更新';
      installButton.disabled=identical;
      if(release&&!identical&&change<=0){
        installButton.disabled=true;
        updateWarning.hidden=false;
        updateWarning.textContent='当前同 ID 安装内容与官方发行不同；官方入口禁止同版本替换或降级。原安装和数据保留。';
      }
    }else{installButton.textContent='确认安装';installButton.disabled=false;}
    preview.hidden=false;
  }
  async function chooseFile() {
    const selection=++fileSelection,file=fileInput.files?.[0];
    // Preserve the browser's selected filename; clearing .value here lies to the user.
    resetReview();setFileError();notice('');
    if(!file||disposed||busy)return;
    try{
      if(file.size>320000)throw new Error('工具包超过 320 KB');
      const candidate=validateSidebarToolPackage(JSON.parse(await file.text()));
      if(disposed||selection!==fileSelection)return;
      reviewCandidate(candidate,'文件：'+(file.name||'本地 JSON'));
    }catch(error){
      if(disposed||selection!==fileSelection)return;
      setFileError(error instanceof SyntaxError?'文件不是有效的工具包 JSON':String(error?.message||error));
    }
  }
  async function install() {
    if(!canCommitReview()||installButton.disabled)return;
    busy=true;installButton.disabled=true;fileInput.disabled=true;importClose.disabled=true;
    let accepted=null;
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
      if(candidate.capabilities.includes(FOCUS_CAPABILITY))await focus.probe({api});
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
      busy=false;fileInput.disabled=false;importClose.disabled=false;
      installButton.disabled=!canCommitReview();render();
    }
    if(!accepted||disposed)return;
    setImportOpen(false);setDiscoveryOpen(false);render();focusToolInList(accepted.id);
    notice('已安装「'+accepted.title+'」。点击“打开”启动工具。');
  }
  async function remove(id=active?.id,{confirmed=false}={}) {
    const item=toolById(id);
    if(!item||busy)return;
    if(active?.id===id&&toolSaving){notice('当前工具正在保存，请完成保存后再卸载。',true);return;}
    if(!confirmed){
      pendingUninstallId=id;pendingUninstallBaseline=structuredClone(item);
      removeReviewText.textContent='卸载「'+item.title+'」将删除本工具的安装包、本地数据与网站授权。此操作无法自动撤销。';
      removeReview.hidden=false;
      removeReviewConfirm.disabled=false;
      notice('');
      removeReview.scrollIntoView?.({block:'nearest'});
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
  const action=(fn)=>()=>Promise.resolve().then(fn).catch(error=>notice(
    (error?.code||'E_TOOL')+'：'+String(error?.message||error).slice(0,240),true));
  // No beforeunload modal: in-app navigation guards unsaved changes; direct
  // tab close cannot be blocked without a Chrome dialog, so edits must be saved.
  setImportOpen(false);
  cancelRemovalReview();
  cancelActionReview();
  notice('');
  setDiscoveryOpen(false);
  listen(discoverToggle,'click',()=>{
    if(busy)return;
    const next=discoverPanel.hidden;
    if(next&&!importPanel.hidden)setImportOpen(false);
    setDiscoveryOpen(next);
    if(next)search.focus?.({preventScroll:true});
    else discoverToggle.focus?.({preventScroll:true});
  });
  if(search)listen(search,'input',()=>{
    officialQuery=(search.value||'').trim().toLocaleLowerCase();renderOfficialTools();
  });
  if(filterAvailable)listen(filterAvailable,'click',()=>{
    officialFilter='available';filterAvailable.setAttribute('aria-pressed','true');
    filterAll?.setAttribute('aria-pressed','false');renderOfficialTools();
  });
  if(filterAll)listen(filterAll,'click',()=>{
    officialFilter='all';filterAll.setAttribute('aria-pressed','true');
    filterAvailable?.setAttribute('aria-pressed','false');renderOfficialTools();
  });
  const marketButton=get('sidebar-tool-market');
  if(marketButton)listen(marketButton,'click',action(()=>api.tabs.create({url:api.runtime.getURL('ui/marketplace.html')})));
  listen(importTrigger,'click',()=>{
    if(busy)return;
    const next=importPanel.hidden;
    if(next)setDiscoveryOpen(false);
    setImportOpen(next);notice('');
  });
  listen(importClose,'click',()=>{
    if(busy)return;
    setImportOpen(false);notice('');importTrigger.focus?.();
  });
  listen(fileInput,'change',()=>chooseFile().catch(error=>setFileError(String(error?.message||error))));
  listen(installButton,'click',action(install));
  listen(backButton,'click',()=>{
    if(busy)return;
    if(tocSettingsOpen){tocSettingsOpen=false;render();settingsButton.focus?.({preventScroll:true});return;}
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
      try{const a=new URL(pattern),b=new URL(document.url);
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
    fullBookmarkButton.disabled=true;
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
  listen(settingsButton,'click',()=>{
    if(!active||readOnlyPreview||busy)return;
    tocSettingsOpen=!tocSettingsOpen;tocScope='site';render();backButton.focus?.({preventScroll:true});
  });
  listen(settingsScopeButton,'click',()=>{tocScope=tocScope==='site'?'page':'site';render();});
  const setSitePermission=allowed=>{
    const id=active?.id,capability=siteCapability(active),url=currentPageTarget?.snapshot?.url;
    const grants=capability===PROMPT_CAPABILITY?promptGrants:
      capability===CAPTURE_CAPABILITY?captureGrants:capability===CLIP_CAPABILITY?clipGrants:siteGrants;
    const origin=capability===PROMPT_CAPABILITY?supportedOrigin(url):
      capability===CAPTURE_CAPABILITY?chatCaptureOrigin(url):websiteOrigin(url);
    if(!origin)throw new Error('请选择适用网页');
    const record=grants?.[PROMPT_ID];
    const permitted=capability===PROMPT_CAPABILITY?
      record?.version===active?.version&&record?.installEpoch===(revocationEpochs[id]??null)&&
      record?.origins?.includes(origin):capability===TOC_CAPABILITY?tocSiteAllowed(grants,id,url):
      grantedOrigins(grants,id).includes(origin);
    if(Boolean(permitted)===allowed)return;
    return capability===PROMPT_CAPABILITY?togglePromptSite(id):
      capability===CAPTURE_CAPABILITY?toggleCaptureSite(id):
      capability===CLIP_CAPABILITY?toggleClipSite(id):toggleTocSite(id);
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
        notice(enabled?'已启用；点击“打开工具”后运行':'已停用；数据和授权保留');
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
    removeButton.focus?.({preventScroll:true});
  });
  if(openTabButton)listen(openTabButton,'click',action(()=>openInTab()));
  listen(window,'message',onMessage);
  if(retiredDraftDismiss)listen(retiredDraftDismiss,'click',()=>{if(active)recoverableDrafts.delete(active.id);render();});
  // Knowledge drafts do not register browser-native exit confirmations.
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
  const promptSitesReady=api.storage.local.get(PROMPT_SITE_STORE).then(saved=>{
    if(disposed)return;promptGrants=saved[PROMPT_SITE_STORE]||{};render();
  }).catch(error=>notice('提示词网站授权读取失败：'+error.message,true));
  const officialReady=loadOfficial();
  const preinstallReady=runDefaultPreinstall();
  const ready=Promise.all([enableReady,installedReady,sitesReady,menuReady,tocVisibilityReady,tocPagesReady,clipSitesReady,captureSitesReady,promptSitesReady,officialReady,preinstallReady]);
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
      // Refresh trusted AdBlock current hostname after real tab navigation.
      if(active?.id===ADBLOCK_ID)void adblockControls?.refresh?.();
      if(frame&&active&&instance)frame.contentWindow?.postMessage({
        protocol:SIDEBAR_TOOL_PROTOCOL,kind:'page-changed',instance,toolId:active.id
      },'*');
    });
    listeners.push(unsubscribe);
  }
  render();
  return Object.freeze({ready,openTool,openSettings,toggleEnabled,openOfficialReview,openImport,openReadOnlyPreview,isDirty,isPreviewActive:()=>readOnlyPreview&&!!frame&&!!active,isPreviewDirty:()=>readOnlyPreview&&previewDirty,openInTab,closeTool,setVisible,dispose(){
    if(disposed)return;
    cancelActionReview();destroyFrame();fileSelection++;disposed=true;visible=false;
    adblockControls?.dispose?.();
    for(const release of listeners.splice(0))release();
    queued.clear();
  }});
}
