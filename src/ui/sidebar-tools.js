import {SIDEBAR_TOOL_ENABLE_STORE,requireToolEnableRecords,sidebarToolEnabled,assertSidebarToolEnabled} from './sidebar-tools/lifecycle.js';
import {SIDEBAR_TOOL_PROTOCOL,SIDEBAR_TOOL_STORE,MAX_INSTALLED_TOOLS,SIDEBAR_TOOL_DATA_LIMITS,
  sidebarToolStorageKey,validateSidebarToolPackage} from './sidebar-tools/package.js';
import {writeVerifiedLocalValue} from './sidebar-tools/storage-state.js';
import {toolPageHref} from './sidebar-tools/navigation.js';
import {loadOfficialCatalog,loadOfficialTool,verifyReviewedOfficialTool,officialToolStatus,matchesOfficialRelease} from '../sidebar-tools/official-catalog.js';
import {resumeDefaultPreinstall,DEFAULT_PREINSTALL_STORE} from '../sidebar-tools/default-preinstall.js';
import {installReviewedSidebarTool,admittedSidebarToolPackages,sameSidebarToolPackage,compareToolVersions,
  recordToolUninstall,cleanupUninstalledToolLocked,TOOL_REVOCATION_EPOCHS_STORE,
  requireCompleteInstalledSidebarTools,setInstalledSidebarToolEnabled} from './sidebar-tools/installation.js';
import {READING_TOC_SITE_STORE,READING_TOC_TOOL_ID,READING_TOC_PROTOCOL,TOC_CAPABILITY,
  websiteOrigin,grantedOrigins,changeTocGrant,READING_TOC_PLACEMENT_PREFIX,
  READING_TOC_VISIBILITY_STORE,readingTocPageScope,readingTocDisplayState,
  changeReadingTocVisibility,READING_TOC_PAGE_RULES_STORE,readingTocPageAllowed,
  disabledTocPages,changeTocPageAllowed} from '../reading-toc/policy.js';
import {CLIP_SITE_STORE,CLIP_CAPABILITY,CLIP_PROTOCOL,CLIP_OPERATIONS,changeClipGrant} from '../page-clip/policy.js';
import {CAPTURE_SITE_STORE,CAPTURE_CAPABILITY,KNOWLEDGE_TOOL_ID,KNOWLEDGE_CAPABILITY,KNOWLEDGE_PROTOCOL,
  KNOWLEDGE_OPERATIONS,KNOWLEDGE_WORKSPACE_PREFIX,changeCaptureGrant,chatCaptureOrigin,knowledgePackageHash} from '../knowledge/policy.js';
import {TIME_REVIEW_ID,TIME_REVIEW_CAPABILITY,TIME_REVIEW_PROTOCOL,TIME_REVIEW_OPERATIONS,timeReviewPackageHash} from '../time-review/policy.js';
import {createTimeReviewPermissionControls} from '../time-review/host-controls.js';

// Trusted Side Panel shell for untrusted, opaque-origin UI documents.
// No user code, markup, or CSS is ever inserted into this extension document.
export function createSidebarTools({api=globalThis.chrome,doc=globalThis.document,
  currentPageTarget,taskWorkbench,lockManager=globalThis.navigator?.locks,fetcher=globalThis.fetch}) {
  const get=id=>doc.getElementById(id);
  const list=get('sidebar-tool-list'), listView=get('sidebar-tool-list-view');
  const empty=get('sidebar-tool-empty'), backButton=get('sidebar-tool-back');
  const display=get('sidebar-tool-display'), frameRoot=get('sidebar-tool-frame');
  const status=get('sidebar-tool-status'), fileInput=get('sidebar-tool-file');
  const importTrigger=get('sidebar-tool-import-trigger'), importPanel=get('sidebar-tool-import');
  const importClose=get('sidebar-tool-import-close'), preview=get('sidebar-tool-preview');
  const previewTitle=get('sidebar-tool-preview-title'), previewVersion=get('sidebar-tool-preview-version');
  const previewDescription=get('sidebar-tool-preview-description');
  const previewCapabilities=get('sidebar-tool-preview-capabilities'), previewFile=get('sidebar-tool-preview-file');
  const installButton=get('sidebar-tool-install'), removeButton=get('sidebar-tool-remove');
  const fileError=get('sidebar-tool-file-error'), updatePanel=get('sidebar-tool-update');
  const updateVersions=get('sidebar-tool-update-versions');
  const updateCapabilities=get('sidebar-tool-update-capabilities');
  const updateWarning=get('sidebar-tool-update-warning');
  const title=get('sidebar-tool-title'),openTabButton=get('sidebar-tool-open-tab');
  const settingsButton=get('sidebar-tool-settings-open'),settingsView=get('sidebar-tool-settings-view');
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
  const readOnlyBanner=get('sidebar-tool-readonly-banner');
  const officialRoot=get('sidebar-tool-official-catalog');
  const discoverPanel=get('sidebar-tool-discover-panel'),discoverToggle=get('sidebar-tool-discover-toggle');
  const search=get('sidebar-tool-search'),filterAvailable=get('sidebar-tool-filter-available'),filterAll=get('sidebar-tool-filter-all');
  let officialFilter='available',officialQuery='';
  let officialReleases=[],officialError='',officialLoaded=false;
  let officialMatches=new Set(),checkedInstalled=null,checkedReleases=null,matchEpoch=0,lastOfficialView='';
  let siteGrants={},siteEpoch=0,tocVisibility={},tocVisibilityEpoch=0,lastTocRead=0,expandedSiteTool='';
  let tocPageRules={},tocPageRulesEpoch=0,tocSettingsOpen=false,tocScope='site',lastTocSettingsRows='';
  const siteTogglePending=new Set();
  let captureGrants={},enableRecords,enableReadEpoch=0,enableReadError=true;
  let knowledgeWindowStart=0,knowledgeRequestCount=0;
  let knowledgeDirty=false;
  const knowledgeOperation=operation=>KNOWLEDGE_OPERATIONS.includes(operation)||operation==='knowledge.editorState';
  let clipGrants={},clipSiteEpoch=0;
  let installed=[], pending=null, pendingBaseline=null, pendingRelease=null,pendingOperationId=null, active=null, frame=null, instance=null, disposed=false, readOnlyPreview=false, previewDirty=false,lastInstalledView='';
  let revocationEpochs={},frameRevocationEpoch=null,revocationReadEpoch=0;
  let requestCount=0,requestWindow=Date.now(), busy=false, fileSelection=0, catalogEpoch=0;
  let visible=false,toolDirty=false,toolSaving=false,installedReadError=false,preinstallBusy=false,preinstallQueued=false;
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
    'time.review':'明确开始后在后台记录聚焦、非空闲网站的域名与时长（仅本机）'
  });
  const timePermissions=settingsView?createTimeReviewPermissionControls({api,doc,container:settingsView,notice}):null;
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
  function destroyFrame() {
    toolDirty=false;toolSaving=false;
    frameDraft='';
    if(frame){frame.onload=null;frame.remove();frame=null;}
    instance=null;requestCount=0;requestWindow=Date.now();lastTocRead=0;
    frameRoot.replaceChildren();
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
      const version=doc.createElement('span');version.className='sidebar-tool-item-version';
      version.textContent='v'+row.version+(enableReadError?' · 状态异常':sidebarToolEnabled(enableRecords,row.id)?'':' · 已停用');
      button.append(icon,copy,version);button.addEventListener('click',()=>openTool(row.id));item.append(button);list.append(item);
      if(row.id===focusedId&&!active)button.focus?.({preventScroll:true});
    }
  }
  function siteCapability(tool){
    return tool?.capabilities.includes(CAPTURE_CAPABILITY)?CAPTURE_CAPABILITY:
      tool?.capabilities.includes(CLIP_CAPABILITY)?CLIP_CAPABILITY:
      tool?.capabilities.includes(TOC_CAPABILITY)?TOC_CAPABILITY:null;
  }
  function renderTocSettings(){
    timePermissions?.render(active,readOnlyPreview);
    const managed=Boolean(active&&!readOnlyPreview),id=active?.id;
    const sitePending=siteTogglePending.has(id);
    const isToc=managed&&id===READING_TOC_TOOL_ID&&active.capabilities.includes(TOC_CAPABILITY);
    if(!managed)tocSettingsOpen=false;
    const show=managed&&tocSettingsOpen;
    settingsButton.hidden=!managed;settingsButton.disabled=busy||sitePending;
    settingsButton.setAttribute('aria-expanded',String(show));
    settingsView.hidden=!show;frameRoot.hidden=show||!frame;
    removeButton.hidden=readOnlyPreview;if(openTabButton)openTabButton.hidden=readOnlyPreview;
    const enabled=!enableReadError&&sidebarToolEnabled(enableRecords,id);
    if(enableButton){enableButton.textContent=enabled?'停用工具':'启用工具';enableButton.disabled=busy||enableReadError;
      enableButton.setAttribute('aria-pressed',String(enabled));}
    if(enableHint)enableHint.textContent=enableReadError?'启停状态读取异常；已保护性停止运行。':
      enabled?'工具已启用。启用不会自动运行代码。':'工具已停用。数据、网站授权和显示偏好保留。';
    if(launchButton){launchButton.hidden=!managed||!!frame;launchButton.disabled=busy||!enabled;
      launchButton.textContent=enabled?'打开工具':'已停用，请在设置中启用';}
    const url=currentPageTarget?.snapshot?.url,capability=siteCapability(active);
    const origin=capability===CAPTURE_CAPABILITY?chatCaptureOrigin(url):websiteOrigin(url);
    const grants=capability===CAPTURE_CAPABILITY?captureGrants:capability===CLIP_CAPABILITY?clipGrants:siteGrants;
    const grant=Boolean(capability&&origin&&grantedOrigins(grants,id).includes(origin));
    const appearance=readingTocDisplayState(tocVisibility,id,url);
    const pageAllowed=readingTocPageAllowed(tocPageRules,id,url);
    if(eyeButton){
      eyeButton.hidden=!isToc;eyeButton.disabled=busy||sitePending||!enabled||!origin||!grant||!pageAllowed;
      eyeButton.title=!enabled?'工具已停用，请先在设置中启用':!origin?'请切换到普通 HTTP(S) 网页':
        !grant?'请先在设置中授权当前网站':!pageAllowed?'当前页面已排除，请在设置中恢复':
        appearance.show?'隐藏此网站的悬浮目录':'显示此网站的悬浮目录（同时恢复当前页面）';
      eyeButton.setAttribute('aria-label',eyeButton.title);eyeButton.setAttribute('aria-pressed',String(appearance.show));
    }
    if(!show)return;
    settingsScopeLabel.textContent='当前网站授权';settingsTarget.textContent=capability?(origin||'请选择适用网页'):'此工具不需要网站授权';
    settingsScopeButton.hidden=true;
    for(const [button,chosen] of [[settingsAllow,grant],[settingsDeny,!grant]]){
      button.textContent=button===settingsAllow?'授权当前网站':'撤销当前网站授权';
      button.hidden=!capability;button.disabled=busy||sitePending||!origin;button.setAttribute('aria-pressed',String(Boolean(origin)&&chosen));
    }
    settingsHint.textContent=!capability?'工具能力以安装时的审阅为准。':!origin?'请切换到适用网页，设置仍可管理。':
      grant?'当前网站已授权；授权与工具启停、外观显隐互相独立。':
        '点击授权后直接生效：'+readableCapability(capability)+'。仅适用于上方网站，可随时撤销。';
    if(visibilitySection)visibilitySection.hidden=!isToc;
    if(pageExceptionSection)pageExceptionSection.hidden=!isToc;
    for(const [button,hidden] of [[settingsSiteVisibility,appearance.hiddenOnSite],[settingsPageVisibility,appearance.hiddenOnPage]]){
      button.hidden=!isToc;button.textContent=hidden?'恢复显示':'隐藏';button.setAttribute('aria-pressed',String(!hidden));
      button.disabled=busy||sitePending||!enabled||!grant||!origin;
