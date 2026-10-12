import {BROWSER_HOST_PROTOCOL,BROWSER_MENU_GRANTS_STORE,normalizeBrowserOperation,browserOperation} from '../framework/sdk/browser-contract.js';
import {createSidePanelOpenCoordinator} from '../platform/chrome/browser-side-panel.js';
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
  const readOnlyBanner=get('sidebar-tool-readonly-banner');
  const officialRoot=get('sidebar-tool-official-catalog');
  const discoverPanel=get('sidebar-tool-discover-panel'),discoverToggle=get('sidebar-tool-discover-toggle');
  const search=get('sidebar-tool-search'),filterAvailable=get('sidebar-tool-filter-available'),filterAll=get('sidebar-tool-filter-all');
  let officialFilter='available',officialQuery='';
  let officialReleases=[],officialError='',officialLoaded=false;
  let officialMatches=new Set(),checkedInstalled=null,checkedReleases=null,matchEpoch=0,lastOfficialView='';
  let siteGrants={},menuGrants={},siteEpoch=0,tocVisibility={},tocVisibilityEpoch=0,lastTocRead=0,expandedSiteTool='';
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
    'browser.contextMenu':'在明确授权的网站显示 Chrome 右键菜单（最多三项）',
    'browser.tabs':'经用户单次批准打开或聚焦自己获准的标签页',
    'browser.sidePanel':'经真实点击打开 OpenDesk 自己的侧边栏',
    'network':'经用户单次批准向指定 Origin 发送受控 HTTP 请求',
  });
  const timePermissions=settingsView?createTimeReviewPermissionControls({api,doc,container:settingsView,notice,runOperation:runTrustedTimeReviewOperation}):null;
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
    if(event?.isTrusted!==true||!['time.start','time.clear','time.minuteConsent'].includes(operation))
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
    const packageHash=await timeReviewPackageHash(tool);
    if(disposed||!active||!samePackage(active,tool)||readOnlyPreview)
      throw Object.assign(new Error('时间回顾详情已变化'),{code:'E_TOOL_CHANGED'});
    const response=await api.runtime.sendMessage({
      protocol:TIME_REVIEW_PROTOCOL,toolId:tool.id,operation,
      payload:operation==='time.clear'?{confirm:true}:operation==='time.minuteConsent'?{enabled:payload.enabled}:{},
      packageHash,installEpoch:epoch
    });
    if(!response?.ok)throw Object.assign(
      new Error(response?.error?.message||'时间回顾操作未确认，请核对当前状态'),
      {code:response?.error?.code||'E_TIME_REVIEW'});
    // The background may have committed already: never offer automatic retry
    // when the host navigates away during the response.
    if(disposed||!active||!samePackage(active,tool))
      throw Object.assign(new Error('宿主已切换，请核对时间记录，不要重复提交'),{code:'E_OUTCOME_UNKNOWN'});
    return response.data;
  }
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
    }
    const origins=capability?grantedOrigins(grants,id):[],denied=isToc?disabledTocPages(tocPageRules,id):[];
    const identity=JSON.stringify([id,origins,denied,busy,sitePending]);
    if(identity===lastTocSettingsRows)return;lastTocSettingsRows=identity;
    const section=(container,items,handler,emptyLabel)=>{
      container.replaceChildren();
      if(!items.length){const label=doc.createElement('p');label.textContent=emptyLabel;container.append(label);}
      for(const entry of items){
        const row=doc.createElement('div');row.className='sidebar-tool-site-entry';
        const label=doc.createElement('span');label.textContent=entry;label.title=entry;
        const button=doc.createElement('button');button.type='button';button.className='sidebar-tool-site-revoke';
        button.textContent=container===settingsSites?'撤销':'恢复';button.setAttribute('aria-label',button.textContent+' '+entry);
        button.disabled=busy||sitePending;
        button.addEventListener('click',action(()=>runSiteToggle(id,()=>handler(entry))));
        row.append(label,button);container.append(row);
      }
    };
    section(settingsPages,denied,url=>setTocPageAvailability(true,url),'没有排除的页面');
    section(settingsSites,origins,url=>capability===CAPTURE_CAPABILITY?changeCaptureSite(id,url,false):
      capability===CLIP_CAPABILITY?revokeClipOrigin(id,url):revokeTocOrigin(id,url),'尚未授权任何网站');
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
    const item=[...list.children].find(node=>node.dataset?.sidebarToolId===id);
    (item?.children?.[0] || importTrigger).focus?.({preventScroll:true});
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
  function mountTool(tool,{readOnly=false,launchGate=null}={}) {
    tocSettingsOpen=false;tocScope='site';destroyFrame();active=tool;readOnlyPreview=readOnly;previewDirty=false;knowledgeDirty=false;
    frameRevocationEpoch=readOnly?null:(revocationEpochs[tool.id]??null);
    instance=crypto.randomUUID();
    const token=instance;
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
    if(enableReadError||!sidebarToolEnabled(enableRecords,id)){
      destroyFrame();active=tool;readOnlyPreview=false;tocSettingsOpen=true;render();backButton.focus?.();return;
    }
    mountTool(tool,{launchGate});
    return instance;
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
      const isDiscovery=['browser.capabilities.list','browser.capabilities.getStatus'].includes(operation);
      if(!isDiscovery&&(!browserOperation(operation)||!browserOperation(operation).requiredCapabilities.every(cap=>tool.capabilities.includes(cap))))
        throw Object.assign(new Error('此工具没有获准浏览器能力'),{code:'E_TOOL_CAPABILITY_REQUIRED'});
      if(operation==='browser.page.getContext')
        return dispatch('currentPage.info',{},tool,source,token,revocationEpoch);
      const owned=(await api.storage.local.get(SIDEBAR_TOOL_STORE))[SIDEBAR_TOOL_STORE];
      if(!requireCompleteInstalledSidebarTools(owned).some(row=>samePackage(row,tool)))
        throw Object.assign(new Error('工具已更新或卸载'),{code:'E_TOOL_CHANGED'});
      const epochs=(await api.storage.local.get(TOOL_REVOCATION_EPOCHS_STORE))[TOOL_REVOCATION_EPOCHS_STORE]||{};
      if((epochs[tool.id]??null)!==revocationEpoch)
        throw Object.assign(new Error('当前工具实例已撤销'),{code:'E_TOOL_CHANGED'});
      assertSession(source,token);
      const hostInstanceId=new URL(globalThis.location.href).searchParams.get('hostInstanceId');
      const envelope={protocol:BROWSER_HOST_PROTOCOL,kind:'tool',
        operation,args:payload||{},toolId:tool.id,toolVersion:tool.version,
        installEpoch:revocationEpoch,toolInstance:token,hostInstanceId};
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
      if(['browser.tabs.open','browser.tabs.focus','browser.network.request'].includes(operation)){
        const target=operation==='browser.tabs.focus'?'聚焦此工具此前打开的标签页':
          operation==='browser.tabs.open'?'打开网页 '+new URL(payload.url).origin:
            '向 '+new URL(payload.url).origin+' 发送 '+payload.method+' HTTP 请求';
        const approvalRef=await requestBrowserClick({toolId:tool.id,
          message:'「'+tool.title+'」请求'+target+'；确认仅批准这一次操作。',
          button:'允许本次操作',run:async()=>{
            assertSession(source,token);
            const approval=await api.runtime.sendMessage({protocol:BROWSER_HOST_PROTOCOL,kind:'host',
              operation:'browser.intent.confirm',toolId:tool.id,toolVersion:tool.version,
              installEpoch:revocationEpoch,toolInstance:token,hostInstanceId,
              targetOperation:operation,targetArgs:payload||{}});
            if(!approval?.ok)throw Object.assign(new Error(approval?.error?.message||'Browser Host approval denied'),
              {code:approval?.error?.code||'E_BROWSER'});
            return approval.data.approvalRef;
          }});
        assertSession(source,token);
        envelope.approvalRef=approvalRef;
      }
      const reply=await api.runtime.sendMessage(envelope);
      assertSession(source,token);
      if(!reply?.ok)throw Object.assign(new Error(reply?.error?.message||'浏览器操作失败'),{
        code:reply?.error?.code||'E_BROWSER'});
      return reply.data;
    }
    if(!tool.capabilities.includes(operation.startsWith('storage.')?'storage.local':
       operation==='currentPage.info'?'currentPage.read':
       operation==='tasks.open'?'tasks.open':
       ['toc.snapshot','toc.navigate'].includes(operation)?TOC_CAPABILITY:
        CLIP_OPERATIONS.includes(operation)?CLIP_CAPABILITY:
      knowledgeOperation(operation)?KNOWLEDGE_CAPABILITY:
      TIME_REVIEW_OPERATIONS.includes(operation)?TIME_REVIEW_CAPABILITY:
        ['clipboard.writeText','file.download'].includes(operation)?'user.export':'__unapproved__'))
      throw new Error('此工具没有被批准使用该能力');
    if(TIME_REVIEW_OPERATIONS.includes(operation)){
      if(tool.id!==TIME_REVIEW_ID)throw new Error('时间回顾工具身份无效');
      // Neither the sandbox's script nor a synthetic DOM event is a trusted
      // browser gesture. Use the explicit non-modal controls in host settings.
      if(operation==='time.start'||operation==='time.clear'||operation==='time.minuteConsent'){
        tocSettingsOpen=true;render();
        throw Object.assign(new Error(operation==='time.start'
          ?'请在工具设置中点击「开始／恢复记录」'
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
        if(!target.origin||!grantedOrigins(sites,tool.id).includes(target.origin))
          throw new Error('请在工具详情设置中授权当前网站');
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
          ...(id?{id,sourceId}:{})
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
      if(operation==='clipboard.writeText'||operation==='file.download'){
        const value=payload?.text;
        if(typeof value!=='string'||!value||new TextEncoder().encode(value).length>150000)
          throw new Error('导出内容为空或超过 150 KB');
        if(operation==='clipboard.writeText'){
          if(!globalThis.navigator?.clipboard?.writeText)
            throw new Error('此环境不允许自动复制；请选中文本手动复制');
          await globalThis.navigator.clipboard.writeText(value);
          assertSession(source,token);return {copied:true};
        }
        if(!api.downloads?.download)throw new Error('下载服务不可用');
        const filename=payload?.filename;
        if(typeof filename!=='string'||filename.length>90||
          !/^[^\/\x00-\x1f:?*"<>|]+\.(?:md|txt|json)$/i.test(filename)||filename.startsWith('.'))
          throw new Error('仅允许安全的 Markdown / TXT / JSON 文件名');
        const mime=/\.json$/i.test(filename)?'application/json':/\.txt$/i.test(filename)?'text/plain':'text/markdown';
        const url='data:'+mime+';charset=utf-8,'+encodeURIComponent(value);
        const downloadId=await api.downloads.download({url,filename,saveAs:true,conflictAction:'uniquify'});
        assertSession(source,token);
        if(!Number.isInteger(downloadId))throw new Error('Chrome 未确认下载');
        return {downloadId};
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
      rateExceeded=message.operation!=='toc.snapshot'&&++requestCount>120;
    }
    if(message.operation==='toc.snapshot'){
      if(Date.now()-lastTocRead<1200)return;
      lastTocRead=Date.now();
    }
    const token=instance,source=event.source,tool=active,revocationEpoch=frameRevocationEpoch;
    let bytes;
    try{bytes=JSON.stringify(message).length;}catch{return;}
    if(bytes>(['clipboard.writeText','file.download','knowledge.update','knowledge.create'].includes(message.operation)?170000:12000))return;
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
      assertSession(source,token);reply(true,result);
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
      // Keep unsaved UI text visible for manual copying; writes from the old
      // instance are fenced by the durable revocation marker.
      if(active&&!readOnlyPreview&&frameRevocationEpoch!==(revocationEpochs[active.id]??null))
        notice('当前工具实例已撤销；草稿仍在当前页面，请复制后重新打开。',true);
    }
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
      if(!grantedOrigins(grants,id).includes(websiteOrigin(url))||!readingTocPageAllowed(pages,id,url))
        throw new Error('请先在设置中授权网站并恢复当前页面');
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
    if(!allowed&&(!target||!grantedOrigins(siteGrants,id).includes(websiteOrigin(url))))
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
    const siteEnabled=grantedOrigins(siteGrants,id).includes(origin);
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
    const wasEnabled=grantedOrigins(siteGrants,id).includes(origin);
    const enable=!wasEnabled;
    // Selecting 可用 or the site's enable control is already an explicit grant.
    // Per-origin locks and trusted document revalidation remain mandatory.
    await locked('tool:'+id,()=>locked('catalog',async()=>{
      const fresh=admittedList((await api.storage.local.get(SIDEBAR_TOOL_STORE))[SIDEBAR_TOOL_STORE]);
      if(!fresh.some(row=>samePackage(row,item)))throw new Error('工具安装状态已变化');
      await currentPageTarget.revalidate(target);
      const raw=(await api.storage.local.get(READING_TOC_SITE_STORE))[READING_TOC_SITE_STORE],saved=raw||{};
      if(grantedOrigins(saved,id).includes(origin)!==wasEnabled)throw new Error('站点授权已被其他窗口更改');
      const next=changeTocGrant(saved,id,target.url,enable);
      await writeVerifiedLocalValue(api,READING_TOC_SITE_STORE,next,raw,'目录网站授权');
      siteGrants=next;
    }));
    render();notice(enable?'已为当前网站启用目录':'已停用当前网站目录');
  }
  // Site revocation is independent of which website happens to be active.
  // It uses the same installation/catalog locks as TOC enable and uninstall,
  // so a stale or newly upgraded package cannot retain old site authority.
  async function revokeTocOrigin(id,origin){
    if(disposed||busy)return;
    const item=toolById(id);
    if(!item?.capabilities.includes(TOC_CAPABILITY))throw new Error('目录工具已变化');
    await locked('tool:'+id,()=>locked('catalog',async()=>{
      const current=admittedList((await api.storage.local.get(SIDEBAR_TOOL_STORE))[SIDEBAR_TOOL_STORE]);
      if(!current.some(row=>samePackage(row,item)))throw new Error('工具安装状态已变化');
      const raw=(await api.storage.local.get(READING_TOC_SITE_STORE))[READING_TOC_SITE_STORE],saved=raw||{};
      if(!grantedOrigins(saved,id).includes(origin))return;
      const next=changeTocGrant(saved,id,origin,false);
      await writeVerifiedLocalValue(api,READING_TOC_SITE_STORE,next,raw,'目录网站授权');
      siteGrants=next;
    }));
    render();notice('已撤销 '+origin+' 的目录授权');
  }
  function reviewCandidate(candidate,sourceLabel,release=null){
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
      const release=pendingRelease,operationId=pendingOperationId;
      // Bind confirmation to the exact reviewed local resource even if the
      // extension updated while this review was open. No stale-byte fallback.
      if(release){
        await verifyReviewedOfficialTool(release,candidate,{api,fetcher});
      }
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
  listen(settingsButton,'click',()=>{
    if(!active||readOnlyPreview||busy)return;
    tocSettingsOpen=!tocSettingsOpen;tocScope='site';render();backButton.focus?.({preventScroll:true});
  });
  listen(settingsScopeButton,'click',()=>{tocScope=tocScope==='site'?'page':'site';render();});
  const setSitePermission=allowed=>{
    const id=active?.id,capability=siteCapability(active),url=currentPageTarget?.snapshot?.url;
    const grants=capability===CAPTURE_CAPABILITY?captureGrants:capability===CLIP_CAPABILITY?clipGrants:siteGrants;
    const origin=capability===CAPTURE_CAPABILITY?chatCaptureOrigin(url):websiteOrigin(url);
    if(!origin)throw new Error('请选择适用网页');
    if(grantedOrigins(grants,id).includes(origin)===allowed)return;
    return capability===CAPTURE_CAPABILITY?toggleCaptureSite(id):capability===CLIP_CAPABILITY?toggleClipSite(id):toggleTocSite(id);
  };
  listen(settingsAllow,'click',action(()=>runSiteToggle(active?.id,()=>setSitePermission(true))));
  listen(settingsDeny,'click',action(()=>runSiteToggle(active?.id,()=>setSitePermission(false))));
  if(enableButton)listen(enableButton,'click',action(async()=>{
    if(!active||readOnlyPreview||busy||enableReadError)return;
    const tool=active,session=instance;
    const wasEnabled=sidebarToolEnabled(enableRecords,tool.id),enabled=!wasEnabled;
    const apply=async()=>{
      // The inline "discard and continue" may be clicked after the tool was
      // saved, replaced or closed. Never commit an outdated or busy action.
      if(disposed||busy||toolSaving||enableReadError||!active||
         !samePackage(active,tool)||instance!==session||
         sidebarToolEnabled(enableRecords,tool.id)!==wasEnabled){
        notice('工具状态或编辑内容已变化；请核对后重新点击启停。',true);
        return;
      }
      busy=true;render();
      try{
        await setInstalledSidebarToolEnabled({api,lockManager,tool,enabled});
        destroyFrame();toolDirty=false;toolSaving=false;knowledgeDirty=false;tocSettingsOpen=true;
        await Promise.all([loadEnableRecords(),loadInstalled()]);
        notice(enabled?'已启用；点击“打开工具”后运行':'已停用；数据和授权保留');
      }finally{busy=false;render();}
    };
    // Pass the deferred mutation into the existing non-modal review. Previously
    // canLeave() without a callback showed a Continue button that did nothing.
    if(!canLeave(apply))return;
    await apply();
  }));
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
      if(frame&&active&&instance)frame.contentWindow?.postMessage({
        protocol:SIDEBAR_TOOL_PROTOCOL,kind:'page-changed',instance,toolId:active.id
      },'*');
    });
    listeners.push(unsubscribe);
  }
  render();
  return Object.freeze({ready,openTool,openReadOnlyPreview,isDirty,isPreviewActive:()=>readOnlyPreview&&!!frame&&!!active,isPreviewDirty:()=>readOnlyPreview&&previewDirty,openInTab,closeTool,setVisible,dispose(){
    if(disposed)return;
    cancelActionReview();destroyFrame();fileSelection++;disposed=true;visible=false;
    for(const release of listeners.splice(0))release();
    queued.clear();
  }});
}
