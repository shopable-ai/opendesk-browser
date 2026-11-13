import {scrollNavigationCatalog,scrollNavigationText,scrollNavigationMessageText} from '../../projects/ai-scroll-navigation/trusted/host-localization.js';
import {extensionCenterText} from './extension-center-localization.js';
import {describePageCleanup} from './page-cleanup-summary.js';
import {SIDEBAR_TOOL_STORE} from './sidebar-tools/package.js';
import {requireCompleteInstalledSidebarTools,requirePendingToolCleanups,MARKET_PROVENANCE_STORE,TOOL_CLEANUP_STORE,sameSidebarToolPackage} from './sidebar-tools/installation.js';
import {SIDEBAR_TOOL_ENABLE_STORE,requireToolEnableRecords} from './sidebar-tools/lifecycle.js';
import {loadOfficialCatalog} from '../sidebar-tools/official-catalog.js';
import {loadOfficialPageCatalog} from '../scripting/user-scripts/official-page-catalog.js';
import {installedPageEnableAction,setInstalledPageProgramEnabled} from './installed-page-tools.js';
import {composeExtensionEntries,isPinnedQueueRelease,filterExtensionEntries,describeInstalledAppSource,resolveExtensionRowIntent,resolveExtensionPrimaryAction,describeInstalledPageControl,prioritizePinnedExtensionEntries,EXTENSION_CENTER_PIN_STORAGE_PREFIX,extensionCenterPinStorageKey} from './extension-center-model.js';
import readingTocCatalog from '../../projects/reading-toc/trusted/locales.generated.js';
import {OFFICIAL_READING_TOC_RELEASE} from '../sidebar-tools/official-reading-toc.js';
import {uiMessage} from './app-localization.js';
import {PROGRAM_DRAFT_INPUT_LIMIT} from './program-source.js';
import {LOCALE_PACK_MAX_BYTES} from './sidebar-tools/locale-packs.js';
import {loadMarketChannel} from '../marketplace/external.js';
import {OFFICIAL_STORE_WEBSITE,navigateOfficialStore} from '../marketplace/store-website.js';
import {readMarketInstallStatus} from '../marketplace/status.js';
import {discoverCurrentPageMarketInstall} from '../marketplace/discovery.js';
import {SCROLL_CONFIG_PROGRAM_ID,scrollProgramUrlMatches} from '../scripting/user-scripts/scroll-config-contract.js';
import {loadSendQueuePageCandidate,queuePageIdentity,sameQueuePageIdentity} from './send-queue-product.js';
import {SEND_QUEUE_PIN} from '../platform/host/send-queue-admission.js';

// One trusted presentation. All writes and launches delegate to the existing hosts.
export function createExtensionCenter({api,client,doc,sidebarTools,taskWorkbench,currentPageTarget,localeController=null,toolLocaleService=null,extensionList=null,
  createScrollConversation=null,openAIProviderSettings=null,notify=null,
  openTrustedUpdateReview=null}){
  const get=id=>doc.getElementById(id);
  const list=get('extension-center-list'),search=get('extension-center-search');
  const more=get('extension-center-more'),workspace=get('workspace-content');
  if(!extensionList||extensionList.owner!=='extension-list'||list?.dataset.opendeskReactOwner!=='extension-list')
    throw new Error('E_REACT_LIST_OWNERSHIP');
  let disposed=false,sequence=0,officialSequence=0,pageOfficialSequence=0,busy=false,pendingKey=null,installed=[],pages=[],enabled={},official=[],officialPages=[];
  let appStatusKnown=false,pageStatusKnown=false,pendingCleanups=new Set(),pageCleanupPending=[];
  let pinnedKeys=new Set(),pinStateKnown=false,pinReadSequence=0;
  let connectionSeen=false,pendingPageReads=0;
  let pageRemovalPending=false,deferredInstallationRefresh=false;
  let toolbarMenuOpen=false,searchText='',languageManager=null,languageSession=0;
  let sources={};
  let catalogError='',pageCatalogError='',dataError='',statusOrigin='loading',hasLoaded=false,query='',kind='all',scope='smart',selectedKey=null,selectedInstalled=null;
  let listScroll=0,focusKey=null,focusAction=null,detailFocusAction=null,selectedIdentity=null,uninstallReview=null,listUninstallReview=null;
  let siteUpgradeError='',scrollDraft=null,scrollAwaitingReview=false,scrollWriteUnknown=false;
  // An unresolved turn remains fenced across closing/reopening its detail view.
  const scrollAIUnknown=new Set();
  let pageDiscovery=null,discoveryGeneration=0;
  let marketDiscoveryAvailable=false,discoveryChannelGeneration=0;
  const language=()=>localeController?.getLocale?.()||'zh-CN';
  const t=(key,params={})=>extensionCenterText(language(),key,params);
  const uiError=key=>Object.assign(new Error(t(key)),{uiMessageKey:key});
  const errorText=error=>error?.uiMessageKey?t(error.uiMessageKey):String(error?.message||error);
  const dataErrorText=()=>Array.isArray(dataError)?dataError.map(row=>t(row.key)+errorText(row.error)).join('；'):'';
  const scrollText=(key,params={})=>scrollNavigationText(language(),key,params);
  const scrollError=(key,code,parameters={})=>Object.assign(
    new Error(scrollNavigationMessageText(language(),{key,parameters})),{code,scrollMessage:{key,parameters}});
  const scrollErrorDetail=error=>error?.scrollMessage||errorText(error);
  const pageActionLabel=page=>{
    const action=installedPageEnableAction(page);
    return t(page?.authorization?.status==='suspended'?'restoreAuto':action.enabled?'enableAuto':'disableAuto');
  };
  const readingTocOfficial=row=>row.kind==='app'&&row.id==='reading-toc'&&
    row.title===readingTocCatalog.messages['zh-CN'].title&&
    row.release?.toolId==='reading-toc'&&
    row.release.sha256===OFFICIAL_READING_TOC_RELEASE.sha256&&
    row.release.version===OFFICIAL_READING_TOC_RELEASE.version&&
    (!row.installed||(
      sources[row.id]?.kind==='market'&&
      sources[row.id]?.sha256===row.release.sha256&&row.version===row.release.version
    ));
  const scrollSource=scrollNavigationCatalog.messages[scrollNavigationCatalog.sourceLocale];
  // Translate only known default copy. User titles and package identity stay intact.
  const titleOf=row=>row.id===SCROLL_CONFIG_PROGRAM_ID&&row.title===scrollSource.appTitle
    ?scrollText('appTitle'):readingTocOfficial(row)?uiMessage(readingTocCatalog,language(),'title'):row.title||row.id;
  const descriptionOf=row=>row.id===SCROLL_CONFIG_PROGRAM_ID&&
    [scrollSource.appDescription,scrollSource.packageDescription].includes(row.description)
      ?scrollText(row.description===scrollSource.packageDescription?'packageDescription':'appDescription'):
    readingTocOfficial(row)&&
    row.description===readingTocCatalog.messages['zh-CN'].description?
      uiMessage(readingTocCatalog,language(),'description'):row.description||'';
  const installedAppUsage=row=>{
    if(row.queueProduct)return row.queueProduct.summary+' 官方发布仍受原目录状态限制；候选审阅不代表上架。';
    if(row.id===SEND_QUEUE_PIN.toolId&&!row.record?.pageModule&&row.enabled===false)
      return '队列管理界面已停用；已安装的网页发送能力由 Page 单独运行，不会因此自动停用。';
    if(row.id===SEND_QUEUE_PIN.toolId&&!row.record?.pageModule&&row.stateKnown===false)
      return '队列管理界面状态尚未核对；不能声称整个产品就绪。';
    if(row.pageCompanion){
      const state=row.pageCompanion.state;
      if(state==='missing')return '管理界面已安装，网页发送能力尚未安装。请在「网页能力」入口审阅 Page 安装包。';
      if(state==='version-mismatch')return '网页能力不是已审阅的 R5.8 版本；旧授权和队列不会自动迁移。';
      if(state==='disabled')return '网页能力已停用；可进入「网页能力」管理现有授权。';
      if(state==='restricted'||state==='unknown')
        return '网页能力授权或原生注册未核实；管理界面不能发送消息。';
      if(state==='registered')
        return '管理界面与网页能力均已安装启用；当前对话是否正在运行仍需打开应用核查。';
    }
    if(row.enabled===false&&!readingTocOfficial(row))
      return t('appDisabledUsage');
    if(!readingTocOfficial(row))
      return t('appInstalledUsage');
    if(row.stateKnown===false)return '安装状态尚待核对；不会据此自动恢复目录。';
    if(row.enabled===false)return '阅读目录已被主动停用；可在设置中恢复。';
    return '阅读目录安装后会在符合条件的网页自动显示；无需再次启用或逐站授权。“打开”仅查看侧边栏目录。';
  };
  // Keep ordinary applications labeled simply "应用"; the distinct Page kind retains its context.
  // This changes presentation only, never installed IDs or Authority records.
  const typeOf=row=>row.queueProduct?t('appCompanionType'):row.kind==='page'?t('appPageType'):t('app');
  const all=()=>composeExtensionEntries({locale:language(),installed,pages,official:appStatusKnown?official:[],
    pageReleases:pageStatusKnown?officialPages:[],
    enabled,appStatusKnown,pageStatusKnown,cleanupPendingIds:[...pendingCleanups],
    queueToolHash:sources[SEND_QUEUE_PIN.toolId]?.sha256??null});
  const find=key=>all().find(row=>row.key===key);
  const pageIdentity=row=>{
    const p=row?.kind==='page'?row.record?.installed:null;
    return p?{key:row.key,programId:row.id,manifestHash:p.manifestHash,
      installationId:p.authorization?.installationId??null,
      expectedGeneration:p.authorization?.generation??null,
      revision:p.revision,sourceHash:p.sourceHash,enabled:p.enabled}:null;
  };
  const samePageIdentity=(row,identity)=>{
    const current=pageIdentity(row);
    return Boolean(current&&identity&&
      ['key','programId','manifestHash','installationId','expectedGeneration',
        'revision','sourceHash','enabled'].every(field=>current[field]===identity[field]));
  };
  const confirmedPageRemoval=(receipt,identity)=>receipt?.uninstalled===true&&
    receipt.nativeState==='unregistered'&&receipt.manifestHash===identity.manifestHash&&
    receipt.installationId===identity.installationId&&(!receipt.managedCleanup||
      receipt.managedCleanup.state==='retired'||receipt.cleanupPending===true&&
      receipt.managedCleanup.scope==='managed-ui-only'&&receipt.managedCleanup.state==='unknown');
  let lastMessage=null;
  const message=(value='',state='info',origin='action',{hostNotified=false}={})=>{
    if(disposed)return;
    // App lifecycle receipts already notify through the trusted Host. Page
    // receipts use that same viewport; neither leaves success below the list.
    if(origin==='action'&&state==='success'&&typeof notify==='function'){
      try{
        if(!hostNotified)notify(typeof value==='function'?value():value,{
          type:'success',position:'bottom-center',timeout:5000,pauseOnInteraction:false});
        // A different operation's success must not erase a persistent error.
        if(lastMessage?.state==='error')return;
        statusOrigin='action';clearActionMessage();return;
      }catch{/* Keep the visible inline fallback when notification is unavailable. */}
    }
    lastMessage={value,state,origin};
    statusOrigin=origin;
    extensionList.renderStatus({text:typeof value==='function'?value():value,state});
  };
  function clearActionMessage(){
    if(statusOrigin!=='action')return;
    if(dataError)message(()=>t('readFailed')+dataErrorText(),'error','read');
    else if(catalogError||pageCatalogError)
      message(()=>t('catalogPartial')+[catalogError,pageCatalogError].filter(Boolean).join('；'),'error','catalog');
    else message('','info','read');
  }
  function closeMenu(returnFocus=false){
    if(toolbarMenuOpen){toolbarMenuOpen=false;syncFilters();}
    if(returnFocus)more.focus({preventScroll:true});
  }
  function openLanguageSettings(toolId=null,importPack=null){
    if(disposed)return false;
    closeMenu();closeRowMenu();
    languageManager={toolId:typeof toolId==='string'?toolId:null,importPack,session:++languageSession,
      returnFocusSelector:toolId&&!importPack?'#sidebar-tool-language-manage':'#extension-center-search'};
    syncFilters();return true;
  }
  // Inspect every file before dispatch: language data never reaches a code installer,
  // including mixed drops and failed language previews.
  async function importFiles(files){
    if(disposed||busy||pendingKey)return;
    closeMenu();closeRowMenu();
    try{
      const inputs=Array.from(files||[]);
      if(!inputs.length)return;
      const packs=await Promise.all(inputs.map(async file=>{
        if(file.size>PROGRAM_DRAFT_INPUT_LIMIT)throw uiError('fileTooLarge');
        const text=await file.text();
        let value;
        try{value=JSON.parse(text);}catch{return null;}
        if(value?.format!=='opendesk.locale-pack.v1')return null;
        if(file.size>LOCALE_PACK_MAX_BYTES||new TextEncoder().encode(text).byteLength>LOCALE_PACK_MAX_BYTES)
          throw uiError('languageTooLarge');
        return value;
      }));
      if(disposed)return;
      if(packs.some(Boolean)){
        if(inputs.length!==1)throw uiError('languageOneAtATime');
        openLanguageSettings(packs[0].toolId,packs[0]);return;
      }
      backIfNeeded();
      if(sidebarTools.openImportFiles?.(inputs)!==true)
        message(()=>t('installerUnavailable'),'error');
    }catch(error){message(()=>t('importFailed')+errorText(error),'error');}
  }
  function syncFilters(){
    extensionList.renderToolbar({
      query:searchText,kind,scope,menuOpen:toolbarMenuOpen,marketDiscoveryAvailable,
      storeWebsiteStatus:OFFICIAL_STORE_WEBSITE.status,locale:language(),
      language:localeController?.getPreference?.()||language(),
      onSearch(value){if(disposed)return;searchText=value;query=value.trim();draw();},
      onMarket(){if(!disposed)openStoreWebsite();},
      onLanguageSettings(event){if(event?.isTrusted===true&&!disposed)openLanguageSettings();},
      onDiscover(event){if(!disposed)void detectPageInstall(event);},
      onToggleMenu(){if(disposed)return;closeRowMenu();toolbarMenuOpen=!toolbarMenuOpen;syncFilters();},
      onCloseMenu:closeMenu,
      onKind(value){if(disposed)return;kind=value;draw();},
      onScope(value){if(disposed)return;scope=value;draw();},
      onReset(){if(disposed)return;kind='all';scope='smart';draw();},
      onImport(){
        if(disposed)return;
        // Close the menu, keeping its visible trigger as ToolHost's focus return target.
        // Only the existing trusted Host may open ImportSheet or review install bytes.
        closeMenu();closeRowMenu();
        if(more?.isConnected&&!more.closest?.('[hidden]'))more.focus({preventScroll:true});
        try{
          if(sidebarTools.openImport?.()!==true)
            message(()=>t('importBusy'),'error');
        }catch(error){
          message(()=>t('importOpenFailed')+errorText(error),'error');
        }
      },
      onImportFiles:importFiles,
      localeManager:languageManager?{...languageManager,service:toolLocaleService,
        tools:installed.filter(tool=>tool.localization),localeController,
        onClose(){languageManager=null;syncFilters();}}:null,
      onReload(){if(disposed)return;closeMenu();message(()=>t('refreshing'),'loading','loading');
        void readDiscoveryChannel();void readOfficial();void readPageOfficial();void refresh();},
      onLanguage(value){if(disposed)return;void localeController?.setLocale(value).catch(error=>{
        message(()=>t('languageSaveFailed')+errorText(error),'error');syncLanguage();
      });}
    });
  }
  const restoreRowFocus=(key,action)=>{
    const buttons=[...list.querySelectorAll('button[data-extension-key]')]
      .filter(b=>b.dataset.extensionKey===key);
    const target=buttons.find(b=>b.dataset.extensionAction===action)||
      buttons.find(b=>b.dataset.extensionAction==='more')||
      buttons.find(b=>b.dataset.extensionAction==='main');
    if(!target)return false;
    target.focus({preventScroll:true});return true;
  };
  let rowMenuKey=null,rowMenuTrigger=null;
  function closeRowMenu(returnFocus=false){
    const key=rowMenuKey,trigger=rowMenuTrigger;
    rowMenuKey=null;rowMenuTrigger=null;
    if(returnFocus){
      if(trigger?.isConnected)trigger.focus({preventScroll:true});
      else if(key)restoreRowFocus(key,'more');
    }
    extensionList.renderRowMenu([]);
    extensionList.setMenuKey(null);
  }
  async function readPinnedState(){
    const id=++pinReadSequence;
    if(!appStatusKnown&&!pageStatusKnown)return false;
    const keys=[
      ...(appStatusKnown?installed.map(tool=>'app:'+tool.id):[]),
      ...(pageStatusKnown?pages.map(row=>'page:'+row.programId):[])
    ];
    try{
      const saved=keys.length?await api.storage.local.get(keys.map(extensionCenterPinStorageKey)):{};
      if(disposed||id!==pinReadSequence)return false;
      const next=new Set(pinnedKeys);
      if(appStatusKnown)for(const key of next)if(key.startsWith('app:'))next.delete(key);
      if(pageStatusKnown)for(const key of next)if(key.startsWith('page:'))next.delete(key);
      for(const key of keys)if(saved[extensionCenterPinStorageKey(key)]===true)next.add(key);
      pinnedKeys=next;pinStateKnown=true;
      return true;
    }catch(error){
      if(disposed||id!==pinReadSequence)return false;
      pinnedKeys=new Set();pinStateKnown=false;
      // A preference read must never overwrite an active install/Host action receipt.
      return false;
    }
  }
  async function setExtensionPinned(row,pinned,event){
    if(!event?.isTrusted||disposed||busy||pendingKey||!pinStateKnown||!row?.installed)return;
    const current=find(row.key);
    if(!current?.installed||current.kind!==row.kind)return;
    pendingKey=row.key;draw();
    const storageKey=extensionCenterPinStorageKey(row.key);
    try{
      await api.storage.local.set({[storageKey]:Boolean(pinned)});
      const saved=await api.storage.local.get([storageKey]);
      if(saved[storageKey]!==Boolean(pinned))throw uiError('pinSaveUnconfirmed');
      if(pinned)pinnedKeys.add(row.key);else pinnedKeys.delete(row.key);
      message(()=>t(pinned?'pinSaved':'unpinSaved',{title:titleOf(row)}),'success','action');
    }catch(error){
      await readPinnedState();
      message(()=>t('pinSaveFailed')+errorText(error),'error');
    }finally{
      pendingKey=null;
      if(!disposed){draw();if(selectedKey)renderDetail();else restoreRowFocus(row.key,'more');}
    }
  }
  function showRowMenu(key,trigger){
    if(busy||pendingKey||disposed)return;
    if(rowMenuKey===key){closeRowMenu(true);return;}
    const row=find(key);if(!row?.installed)return;
    closeRowMenu();closeMenu();
    rowMenuKey=key;rowMenuTrigger=trigger;
    extensionList.setMenuKey(key);
    const menuItems=[];
    const add=(label,fn,actionId)=>{
      const activate=event=>{
        const current=find(row.key);
        if(!event?.isTrusted||disposed||busy||pendingKey||(row.kind==='page'
          ?!samePageIdentity(current,pageIdentity(row)):current?.record!==row.record))return;
        closeRowMenu(true);fn(event);
      };
      menuItems.push({id:actionId,label,onClick:activate});
    };
    if(row.kind==='app'){
      if(row.queueProduct){
        add(t('manageAction'),()=>openDetail(key,'more'),'product');
      }
      if(!row.queueProduct&&row.stateKnown!==false&&typeof sidebarTools.toggleEnabled==='function')
        add(row.enabled?t('disableApp'):t('enableApp'),event=>{
          if(pendingKey)return;
          // Dispatch under the originating trusted click, before any Promise
          // or await; the original Sidebar Host keeps package/epoch/draft authority.
          let result;
          try{result=sidebarTools.toggleEnabled(row.id,event);}
          catch(error){message((error?.code||'E_TOOL')+'：'+errorText(error),'error');return;}
          pendingKey=row.key;draw();
          // Host false may mean an unsaved-draft confirmation is pending.
          // Only a true Host result AND a fresh matching persistent record earn success.
          void (async()=>{
            let outcome,operationError,readback=false;
            try{outcome=await result;}catch(error){
              operationError=error;
              if(!disposed)message((error?.code||'E_TOOL')+'：'+errorText(error),'error');
            }
            try{readback=await refresh();}catch(error){operationError??=error;}
            pendingKey=null;
            if(disposed)return;
            const current=find(row.key);
            if(operationError)message((operationError?.code||'E_TOOL')+'：'+
              String(operationError?.message||operationError),'error');
            else if(outcome===true&&readback&&appStatusKnown&&current?.installed&&
              sameSidebarToolPackage(current.record,row.record)&&current.enabled===!row.enabled)
              message(()=>t('appToggleConfirmed',{state:current.enabled?t('enableVerb'):t('disableVerb')}),'success','action',{hostNotified:true});
            else if(outcome===false)
              message(()=>t('toggleDeferred'),'error');
            else message(()=>t('toggleUnconfirmed'),'error');
            draw();
            if(selectedKey)renderDetail();
            else restoreRowFocus(row.key,'more');
          })();
        },'toggle');
      if(row.stateKnown!==false)
        add(t('settingsAction'),()=>{backIfNeeded();sidebarTools.openSettings(row.id);},'settings');
      if(row.queueReviewRelease)
        add(t('reviewUpdateAction'),event=>{void reviewQueueProduct(row,event);},'queue-review');
      else if(row.update&&row.release)add(t('reviewUpdateAction'),event=>openReview(row.key,event),'update');
    }else if(row.kind==='page'){
      if(row.stateKnown!==false)add(pageActionLabel(row.record.installed),
        event=>{void togglePage(row,event);},'toggle');
      if(row.id!==SCROLL_CONFIG_PROGRAM_ID&&row.update&&row.release?.status==='available')
        add(row.officialReview?t('reviewOfficialRelease'):t('reviewOfficialUpdate'),
          ()=>openPageReview(row.key),'update');
      else add(t('updateImport'),()=>{backIfNeeded();sidebarTools.openImport();},'update');
      add(t('goDevelop'),()=>{if(taskWorkbench.navigate('develop')!==false)backIfNeeded();},'develop');
    }
    add(t('viewAction'),()=>openDetail(key,'more'),'detail');
    if(row.stateKnown!==false&&!row.queueProduct)
      add(t('uninstallAction'),event=>openListUninstallReview(row.key,event),'uninstall');
    // Keep all existing lifecycle actions first; pinning is a secondary display preference.
    if(pinStateKnown){
      const pinned=pinnedKeys.has(row.key);
      add(t(pinned?'unpinAction':'pinAction'),event=>{void setExtensionPinned(row,!pinned,event);},pinned?'unpin':'pin');
    }
    extensionList.renderRowMenu(menuItems,{
      key,title:titleOf(row),trigger,onClose:closeRowMenu
    });
  }

  // List reviews pin the actual installed identity. The sole trusted Host
  // continues to own the app registry and Page Authority native deregistration.
  function syncListUninstallReview(){
    const review=listUninstallReview;
    extensionList.renderUninstall?.(review?{
      title:t('uninstallNamed',{title:find(review.key)?titleOf(find(review.key)):review.title}),
      text:review.kind==='queue'?'将依次撤销网页能力与侧栏安装。任一步失败立即停止，不自动重试；网页中的旧效果可能需要刷新。':review.kind==='page'
        ?t('pageListUninstall')
        :review.id===SEND_QUEUE_PIN.toolId&&find(review.key)?.pageCompanion?.installed
          ?'本操作仅卸载队列管理界面；已安装的 Page 网页发送能力仍保留，可在「网页增强」中单独停用或卸载。不会自动迁移或覆盖消息。'
          :t('appUninstallConsequence'),
      busy:Boolean(busy||pendingKey),
      identity:{key:review.key,kind:review.kind,version:review.kind==='page'
        ?find(review.key)?.version:review.package?.version},
      onCancel:cancelListUninstallReview,onConfirm:confirmListUninstallReview
    }:null);
  }
  function matchesListReview(row,review){
    if(review?.kind==='queue')return Boolean(row?.installed&&row.queueProduct&&
      sameSidebarToolPackage(row.record,review.package)&&
      (review.pageIdentity?sameQueuePageIdentity(find('page:'+SEND_QUEUE_PIN.pageProgramId)?.record?.installed,review.pageIdentity):
        !find('page:'+SEND_QUEUE_PIN.pageProgramId)?.installed));
    return Boolean(row?.installed&&row.kind===review?.kind&&
      (review.kind==='page'?samePageIdentity(row,review.identity):
        sameSidebarToolPackage(row.record,review.package)));
  }
  function openListUninstallReview(key,event){
    if(!event?.isTrusted||disposed||busy||pendingKey||listUninstallReview||uninstallReview)return;
    const row=find(key);
    if(!row?.installed||row.stateKnown===false)return;
    if(row.kind==='page'){
      const identity=pageIdentity(row);
      if(!identity?.installationId||!Number.isSafeInteger(identity.expectedGeneration)){
        message(()=>t('uninstallIdentityIncomplete'),'error');return;
      }
      uninstallReview=Object.freeze(identity);
      listUninstallReview=Object.freeze({key,kind:'page',id:row.id,title:titleOf(row),identity});
    }else{
      listUninstallReview=Object.freeze({key,kind:'app',id:row.id,title:titleOf(row),
        package:structuredClone(row.record)});
    }
    closeRowMenu();closeMenu();syncListUninstallReview();
  }
  function cancelListUninstallReview(event){
    if(!event?.isTrusted||busy||pendingKey)return;
    if(listUninstallReview?.kind==='page')uninstallReview=null;
    listUninstallReview=null;syncListUninstallReview();
  }
  async function confirmListUninstallReview(event){
    if(!event?.isTrusted||disposed||busy||pendingKey||!listUninstallReview)return;
    const review=listUninstallReview;
    if(!matchesListReview(find(review.key),review)){
      cancelListUninstallReview(event);
      message(()=>t('uninstallIdentityChanged'),'error');return;
    }
    // Page uses the existing generation-bound native unregister + receipt
    // readback below. No alternate authority or duplicate removal sequence.
    if(review.kind==='page')return confirmPageUninstall(event);
    if(review.kind==='queue')return removeQueueProduct(review,event);
    busy=true;pendingKey=review.key;draw();
    let outcome,operationError,readback=false;
    try{
      try{
        outcome=await sidebarTools.uninstallFromList(review.id,review.package,event);
      }catch(error){operationError=error;}
      try{readback=await refresh();}catch(error){operationError??=error;}
      if(disposed)return;
      if(operationError)message(()=>(operationError.code||'E_TOOL_UNINSTALL')+'：'+
        String(operationError.message||operationError)+
        t('noAutoRetry'),'error');
      else if(outcome===true&&readback&&appStatusKnown&&!find(review.key)?.installed&&
        !pendingCleanups.has(review.id))
        message(()=>t('uninstallComplete'),'success','action',{hostNotified:true});
      else if(readback&&appStatusKnown&&!find(review.key)?.installed&&pendingCleanups.has(review.id))
        message(()=>t('uninstallCleanupPending'),'error');
      else if(outcome===false)
        message(()=>t('uninstallDeferred'),'error');
      else message(()=>t('uninstallUnconfirmed'),'error');
    }finally{
      busy=false;pendingKey=null;listUninstallReview=null;
      if(!disposed){draw();if(selectedKey)renderDetail();else search?.focus?.({preventScroll:true});}
    }
  }

  function rowDescription(row){
    const reason=pendingKey===row.key?t('processing'):row.cleanupPending?t('cleanupPending'):
      !row.installed?(row.kind==='page'
        ?(row.release?.status==='blocked'?t('installBlocked')+row.release.blockedReason:t('installNeedsPermission'))
        :t('installAvailable')):row.stateKnown===false?t('stateUnverified'):
      row.kind==='page'&&row.record?.installed?.nativeState==='blocked'?t('nativeRestore'):
      row.kind==='page'&&row.record?.installed?.authorization?.status==='suspended'?t('siteAccessRestricted'):
      row.enabled===false?t('disabled'):
      row.pageCompanion&&row.pageCompanion.state!=='registered'?'网页发送能力未就绪':
      row.kind==='page'&&row.record?.installed?.nativeState&&
        row.record.installed.nativeState!=='registered'?t('registrationPending'):'';
    return reason?reason+' · '+descriptionOf(row):descriptionOf(row);
  }
  function draw(){
    if(disposed)return;
    if(listUninstallReview&&!busy&&!pendingKey&&
      !matchesListReview(find(listUninstallReview.key),listUninstallReview)){
      listUninstallReview=null;uninstallReview=null;
      message(()=>t('listIdentityChanged'),'error');
    }
    const active=doc.activeElement;
    const key=list.contains(active)?active?.dataset?.extensionKey:null;
    const action=active?.dataset?.extensionAction;
    const menuFocusKey=get('extension-center-row-menu')?.contains(active)?rowMenuKey:null;
    closeRowMenu();
    const rows=prioritizePinnedExtensionEntries(
      filterExtensionEntries(all().map(row=>({...row,title:titleOf(row),description:descriptionOf(row)})),{query,kind,scope}),pinnedKeys);
    // A cleanup journal is not an installed app or a trusted Catalog release.
    // Show a recovery-only control in discovery even if the catalog is offline.
    const orphaned=scope==='available'&&appStatusKnown&&kind!=='page'?
      [...pendingCleanups].filter(id=>!official.some(release=>release.toolId===id)&&
        (!query||id.toLocaleLowerCase().replace(/[\s-]+/g,'').includes(
          query.toLocaleLowerCase().replace(/[\s-]+/g,''))||
          t('cleanupPending').includes(query))):[];
    extensionList.renderRecoveries({
      ids:orphaned,busy:Boolean(busy||pendingKey),
      onRetry(id,event){void retryCleanup({id,key:'app:'+id,cleanupPending:true},event);}
    });
    extensionList.renderRows({
        rows:rows.map(row=>({
          key:row.key,title:titleOf(row),kind:row.kind,type:typeOf(row),
          description:rowDescription(row),installed:row.installed,stateKnown:row.stateKnown,pinned:row.pinned,
          updateIdentity:row.kind==='app'&&row.installed&&appStatusKnown&&
            row.stateKnown!==false&&!row.queueReviewRelease&&
            !row.queueProduct&&!row.cleanupPending&&row.update===true&&
            sources[row.id]?.kind==='market'&&row.release?.id==='opendesk/'+row.id&&
            /^[a-f0-9]{64}$/.test(row.release?.sha256||'')?
            {id:row.id,fromVersion:row.version,source:row.release.id,
              version:row.release.version,sha256:row.release.sha256}:null,
          primaryAction:resolveExtensionPrimaryAction(row)?t('open'):null
        })),
        busy:Boolean(busy||pendingKey),pendingKey,
        onOpenRow:openRow,onMore:showRowMenu
      });
    const showEmpty=rows.length===0&&orphaned.length===0&&hasLoaded;
    const emptyText=dataError?
      t('readStateFailed'):
      query?t('noMatches'):scope==='available'?t('noCandidates'):
      kind==='page'?t('noInstalledPages'):t('noInstalled');
    const countText=!hasLoaded?t('loading'):
      dataError?t('partialStatus'):t('count',{count:rows.length});
    extensionList.renderFeedback({showEmpty,emptyText,countText});
    syncFilters();
    syncListUninstallReview();
    if(!busy&&!pendingKey){
      if(key)restoreRowFocus(key,action);
      else if(menuFocusKey&&!restoreRowFocus(menuFocusKey,'more'))
        search.focus({preventScroll:true});
    }
  }
  async function readDiscoveryChannel(){
    const generation=++discoveryChannelGeneration;
    try{
      const channel=await loadMarketChannel(api);
      if(disposed||generation!==discoveryChannelGeneration)return;
      marketDiscoveryAvailable=channel?.enabled===true;
    }catch{
      if(disposed||generation!==discoveryChannelGeneration)return;
      // A missing or untrusted release channel is not a usable install entry.
      marketDiscoveryAvailable=false;
    }
    syncFilters();
  }
  function renderPageDiscovery(){
    if(disposed)return;
    extensionList.renderDiscovery?.(pageDiscovery?{
      state:pageDiscovery.state,title:pageDiscovery.release?.packageTitle||pageDiscovery.title||t('currentPage'),
      version:pageDiscovery.subject?.version||null,origin:pageDiscovery.pageOrigin||null,
      message:typeof pageDiscovery.message==='function'?pageDiscovery.message():pageDiscovery.message||'',busy:Boolean(pageDiscovery.busy),
      onReview:reviewDiscoveredPage,onRetry:detectPageInstall,onDismiss(){
        discoveryGeneration++;pageDiscovery=null;renderPageDiscovery();
        // Return keyboard focus to the persistent contextual action after close.
        get('extension-center-discover')?.focus({preventScroll:true});
      }
    }:null);
  }
  async function detectPageInstall(event){
    if(disposed||busy||pendingKey||pageDiscovery?.busy||
      pageDiscovery?.state==='loading'||event?.isTrusted!==true)return;
    closeMenu();
    const generation=++discoveryGeneration;
    // Capture synchronously at the actual user action, not after slow
    // catalog/channel fetches that could observe a different active tab.
    let target;
    try{target=currentPageTarget.capture();}
    catch(error){
      pageDiscovery={state:'error',message:(error?.code||'E_DISCOVERY_TARGET')+'：'+
        String(error?.message||t('pageNotReady'))};
      renderPageDiscovery();return;
    }
    pageDiscovery={state:'loading',target,message:()=>t('checkingDeclaration')};renderPageDiscovery();
    try{
      const [channel,catalog]=await Promise.all([loadMarketChannel(api),loadOfficialCatalog({api})]);
      if(disposed||generation!==discoveryGeneration)return;
      const found=await discoverCurrentPageMarketInstall({
        api,currentPageTarget,channel,releases:catalog.apps,target
      });
      if(disposed||generation!==discoveryGeneration)return;
      pageDiscovery={...found,state:'found',
        message:()=>t('matchedDeclaration')};
    }catch(error){
      if(disposed||generation!==discoveryGeneration)return;
      // Preserve the captured document on every result (including empty/error).
      // The existing target subscription clears stale results after navigation.
      pageDiscovery=error?.code==='E_DISCOVERY_MISSING'
        ?{state:'empty',target,message:()=>t('noDeclaration')}
        :{state:'error',target,message:(error?.code||'E_DISCOVERY')+'：'+
          String(error?.message||t('invalidDeclaration'))};
    }
    renderPageDiscovery();
  }
  async function reviewDiscoveredPage(event){
    const selected=pageDiscovery;
    if(event?.isTrusted!==true||disposed||busy||pendingKey||selected?.state!=='found'||selected.busy)return;
    const generation=discoveryGeneration;
    pageDiscovery={...selected,busy:true};renderPageDiscovery();
    try{
      await currentPageTarget.revalidate(selected.target);
      const [channel,{apps}]=await Promise.all([
        loadMarketChannel(api),loadOfficialCatalog({api})
      ]);
      const fresh=await discoverCurrentPageMarketInstall({
        api,currentPageTarget,channel,releases:apps,target:selected.target
      });
      if(fresh.href!==selected.href||fresh.release.sha256!==selected.release.sha256)
        throw Object.assign(new Error(t('declarationChanged')),{code:'E_DISCOVERY_CHANGED'});
      // Channel, page DOM and release bytes are all rechecked on the trusted
      // review gesture. Stale discoveries cannot open a different app.
      await currentPageTarget.revalidate(selected.target);
      if(disposed||generation!==discoveryGeneration||pageDiscovery?.subject!==selected.subject)return;
      // Discovery is already inside the native Side Panel. Keep its verified
      // document, release and editor intact; use the original ImportSheet host.
      if(!sidebarTools.canPresentMarketReview()||
        sidebarTools.openOfficialReview(selected.release.toolId)!==true)
        throw Object.assign(new Error(t('reviewDeferred')),{code:'E_REVIEW_DEFERRED'});
      if(pageDiscovery?.subject===selected.subject)pageDiscovery={...selected,busy:false,
        message:()=>t('reviewStarted')};
    }catch(error){
      if(pageDiscovery?.subject===selected.subject)pageDiscovery={...selected,busy:false,
        message:(error?.code||'E_DISCOVERY_REVIEW')+'：'+errorText(error)};
    }
    renderPageDiscovery();
  }
  // Store navigation is not an installation action. Prefer the existing
  // nonblocking Host toast near the user instead of a status below the list.
  function storeNotice(key,type='info',error=null){
    const content=()=>t(key)+(error?errorText(error):'');
    let shown=false;
    if(typeof notify==='function'){
      try{notify(content(),{type,position:'bottom-center'});shown=true;}catch{/* Keep inline fallback. */}
    }
    if(!shown||type==='error')message(content,type);
  }
  function openStoreWebsite(){
    void navigateOfficialStore(api).then(result=>{
      if(disposed)return;
      if(result.status==='coming_soon')storeNotice('storeComingSoon');
      else if(result.status==='invalid')storeNotice('storeConfigInvalid','error');
      else if(result.status==='failed')storeNotice('storeOpenFailed','error',result.error);
    });
  }
  // The original trusted review owns installation; selecting never executes tool JS.
  function openReview(key,event){
    const row=find(key);if(!row||row.kind!=='app'||!row.release)return;
    if(row.queueReviewRelease)return;
    if(row.cleanupPending){message(()=>t('cleanupBeforeInstall'),'error');return;}
    if(row.installed){
      // Menu and details use the same fresh Worker check as the inline button.
      // The old boolean "row.update" alone is never permission to update.
      if(event?.isTrusted!==true||row.update!==true||!appStatusKnown||
        sources[row.id]?.kind!=='market'||row.release.id!=='opendesk/'+row.id||
        !/^[a-f0-9]{64}$/.test(row.release.sha256||'')){
        message(()=>t('appReviewUnavailable'),'error');return;
      }
      const extra=(row.release.capabilities||[]).some(cap=>
        !row.record?.capabilities?.includes(cap));
      const candidate={
        kind:'sidebar-tool',id:row.id,fromVersion:row.version,
        version:row.release.version,sha256:row.release.sha256,
        source:row.release.id,ignoredAt:null,
        status:extra?'review_required':'available'
      };
      backIfNeeded();
      let attempt;
      try{attempt=openTrustedUpdateReview?.(candidate);}
      catch(error){message(errorText(error),'error');return;}
      void Promise.resolve(attempt).then(opened=>{
        if(!disposed&&opened!==true)message(()=>t('appReviewUnavailable'),'error');
      },error=>{if(!disposed)message(errorText(error),'error');});
      return;
    }
    backIfNeeded();
    if(sidebarTools.openOfficialReview(row.id)!==true)
      message(()=>t('appReviewUnavailable'),'error');
  }
  function openPageReview(key){
    const row=find(key);
    if(!row||row.kind!=='page'||row.release?.status!=='available')return;
    backIfNeeded();
    if(sidebarTools.openOfficialPageReview?.(row.release)!==true)
      message(()=>t('pageReviewUnavailable'),'error');
  }
  // Product management opens in the existing trusted root; Page code is never
  // passed to the sandbox ToolHost or executed by this presentation action.
  function openRow(key){
    const row=find(key);if(disposed||!row||busy||pendingKey||(scope!=='available'&&!row.installed&&!row.queueProduct?.pageInstalled))return;
    if(resolveExtensionRowIntent(row)==='detail'){openDetail(key,'main');return;}
    if(resolveExtensionPrimaryAction(row)?.id==='manage'){openDetail(key,'main');return;}
    if(resolveExtensionPrimaryAction(row)?.id==='open'){
      try{
        if(!sidebarTools.openTool(row.id))
          message(()=>t('appOpenDeferred'),'error');
      }catch(error){message((error?.code||'E_TOOL_OPEN')+'：'+errorText(error),'error');}
    }
  }
  function openDetail(key,returnAction='main'){
    const row=find(key);if(disposed||!row||(scope!=='available'&&!row.installed&&!row.queueProduct?.pageInstalled))return;
    closeRowMenu();
    clearActionMessage();
    selectedInstalled=row.installed;uninstallReview=null;siteUpgradeError='';
    // A detail belongs to one reviewed package/revision, not merely a reusable ID.
    // Enable/disable and Page authorization may change without replacing that identity.
    selectedIdentity=row.kind==='app'?
      (row.installed?{kind:'app-installed',package:structuredClone(row.record)}:
        {kind:'app-release',version:row.version,sha256:row.release?.sha256}):
      (row.installed?{kind:'page-installed',manifestHash:row.record?.manifestHash,
        revision:row.record?.installed?.revision,sourceHash:row.record?.installed?.sourceHash,
        installationId:row.record?.installed?.authorization?.installationId??null}:
        {kind:'page-release',version:row.release?.version,revision:row.release?.revision,
          sha256:row.release?.sha256??null,status:row.release?.status});
    focusKey=key;focusAction=returnAction;
    listScroll=workspace?.scrollTop||0;selectedKey=key;detailFocusAction=null;
    closeMenu();
    extensionList.renderView('detail');
    renderDetail();workspace?.scrollTo?.({top:0});
    get('extension-center-back')?.focus({preventScroll:true});
  }
  async function openInstalledAppDetail({marketId,id,version,sha256}={}){
    if(disposed||busy||pendingKey||typeof id!=='string'||!id||
      marketId!=='opendesk/'+id||typeof version!=='string'||!version||
      typeof sha256!=='string'||!/^[a-f0-9]{64}$/.test(sha256))return false;
    // Fresh installed registry and pinned market provenance, never the market page.
    if(!await refresh({appReadback:true})||disposed)return false;
    const row=find('app:'+id),source=sources[id];
    if(!row||row.kind!=='app'||row.installed!==true||row.stateKnown!==true||
      row.version!==version||source?.kind!=='market'||source.sha256!==sha256){
      message('当前已安装应用的版本或发行身份已变化，请核对原安装结果。','error');
      return false;
    }
    // Return navigation must reveal the newly installed row, despite older filters.
    if(!filterExtensionEntries(all(),{query,kind,scope}).some(item=>item.key===row.key)){
      query='';searchText='';kind='all';scope='smart';draw();
    }
    openDetail(row.key,'main');
    return selectedKey===row.key;
  }
  async function openInstalledMarketApp({marketId,id,version,sha256}={}){
    if(disposed||busy||pendingKey||marketId!=='opendesk/'+id||
      typeof id!=='string'||typeof version!=='string'||!/^[a-f0-9]{64}$/.test(sha256||''))
      return false;
    // The Side Panel rechecks the actual persisted bytes/provenance/enablement,
    // never trusts an external publisher's claimed same-ID/same-version match.
    const observed=await readMarketInstallStatus(api,{subject:{kind:'app',marketId,version},consumedAt:null});
    if(observed.currentInstallation!=='installed'||observed.enabled!==true)return false;
    if(!await refresh({appReadback:true})||disposed)return false;
    const row=find('app:'+id),source=sources[id];
    if(!row||row.kind!=='app'||row.installed!==true||row.stateKnown!==true||
      row.enabled!==true||row.version!==version||source?.kind!=='market'||source.sha256!==sha256)
      return false;
    if(taskWorkbench.navigate('tools')===false)return false;
    try{return Boolean(sidebarTools.openTool(id,{userInitiated:true}));}
    catch(error){message((error?.code||'E_TOOL_OPEN')+'：'+errorText(error),'error');return false;}
  }
  async function openInstalledLocalTool({id,version}={}){
    if(disposed||busy||pendingKey||typeof id!=='string'||typeof version!=='string'||
      !await refresh({appReadback:true})||disposed)return false;
    const row=find('app:'+id);
    if(!row||row.kind!=='app'||row.installed!==true||row.stateKnown!==true||
      row.enabled!==true||row.version!==version)return false;
    if(taskWorkbench.navigate('tools')===false)return false;
    try{return Boolean(sidebarTools.openTool(id,{userInitiated:true}));}
    catch(error){message((error?.code||'E_TOOL_OPEN')+'：'+errorText(error),'error');return false;}
  }
  function back(reason){
    if(disposed)return;
    if(reason!==true&&scrollDraft&&selectedKey==='page:'+SCROLL_CONFIG_PROGRAM_ID){
      scrollDraft=null;scrollAwaitingReview=false;
    }
    clearActionMessage();
    selectedKey=null;selectedInstalled=null;selectedIdentity=null;detailFocusAction=null;uninstallReview=null;
    // Retire the actual detail consumer, including its pending AI lease, when
    // leaving or uninstalling it. Hiding a stale model keeps effects alive.
    extensionList.renderDetail(null);
    extensionList.renderView('list');
    workspace?.scrollTo?.({top:listScroll});
    if(!restoreRowFocus(focusKey,focusAction))search.focus({preventScroll:true});
  }
  // UI requests may create only a draft package. The original Installer owns
  // approval and cannot be bypassed by adding CSS selection data.
  async function reviewScrollSite(values,event,baseline){
    if(event?.isTrusted!==true||disposed||busy||pendingKey||
      selectedKey!==baseline?.key||!samePageIdentity(find(baseline?.key),baseline))return;
    const row=find(baseline.key),install=row?.record?.installed;
    if(row?.id!==SCROLL_CONFIG_PROGRAM_ID||!install||row.stateKnown===false||
      install.enabled!==true||install.authorization?.status!=='active'||
      install.nativeState!=='registered'||install.error)return;
    const detailIdentity=selectedIdentity;
    busy=true;siteUpgradeError='';renderDetail();
    try{
      const pkg=await client.request('prepareScrollSitePackage',{
        programId:SCROLL_CONFIG_PROGRAM_ID,
        origin:values.origin.trim(),
        pathScope:values.pathScope.trim()||'/',
        expectedInstalledManifestHash:install.manifestHash,
        expectedGeneration:install.authorization?.generation
      });
      if(disposed||selectedKey!==baseline.key||selectedIdentity!==detailIdentity)return;
      if(!samePageIdentity(find(baseline.key),baseline))
        throw scrollError('revisionChanged','E_REVISION');
      if(pkg?.programId!==SCROLL_CONFIG_PROGRAM_ID||!Number.isSafeInteger(pkg.revision)||pkg.revision===install.revision)
        throw scrollError('candidateMissing','E_SITE_REVIEW');
      backIfNeeded();
      if(sidebarTools.openPagePackageReview?.(pkg,values.origin.trim(),async()=>{
        // Closing either a cancelled/denied review or a successful review
        // returns the same draft. Only a fresh Authority read decides access.
        if(disposed||!scrollAwaitingReview||!scrollDraft||selectedKey)return;
        scrollAwaitingReview=false;
        await refresh();
        if(!disposed&&find(baseline.key)?.installed&&!selectedKey)openDetail(baseline.key,'main');
      })!==true)
        throw scrollError('installerUnavailable','E_SITE_REVIEW');
      if(scrollDraft)scrollAwaitingReview=true;
      return true;
    }catch(error){
      if(!disposed){
        const description={key:'operationFailed',parameters:{code:error?.code||'E_SITE_REVIEW',detail:scrollErrorDetail(error)}};
        if(selectedKey){siteUpgradeError=description;renderDetail();}
        else message(()=>scrollNavigationMessageText(language(),description),'error');
      }
    }finally{
      busy=false;
      if(!disposed){if(selectedKey)renderDetail();else draw();}
    }
    return false;
  }
  function renderDetail(){
    if(disposed)return;
    const row=find(selectedKey);
    const identityChanged=Boolean(row&&row.installed===selectedInstalled&&(
      row.kind==='app'?
        (row.installed?
          (selectedIdentity?.kind!=='app-installed'||
            !sameSidebarToolPackage(row.record,selectedIdentity.package)):
          (selectedIdentity?.kind!=='app-release'||row.version!==selectedIdentity.version||
            row.release?.sha256!==selectedIdentity.sha256)):
        (row.installed?(selectedIdentity?.kind!=='page-installed'||
          row.record?.manifestHash!==selectedIdentity.manifestHash||
          row.record?.installed?.revision!==selectedIdentity.revision||
          row.record?.installed?.sourceHash!==selectedIdentity.sourceHash||
          (row.record?.installed?.authorization?.installationId??null)!==selectedIdentity.installationId):
          (selectedIdentity?.kind!=='page-release'||
          row.release?.version!==selectedIdentity.version||
          row.release?.revision!==selectedIdentity.revision||
          (row.release?.sha256??null)!==selectedIdentity.sha256||
          row.release?.status!==selectedIdentity.status))
    ));
    if(!row||row.installed!==selectedInstalled||identityChanged){
      back();
      if(row)message(()=>t('returnedToList'),'info');
      return;
    }
    if(uninstallReview&&!samePageIdentity(row,uninstallReview)){
      uninstallReview=null;
      message(()=>t('pageReviewExpired'),'error');
    }
    const pendingReview=uninstallReview?.key===row.key?uninstallReview:null;
    const page=row.kind==='page'?row.record?.installed:null;
    const cleanupProgramId=page?.programId||row.pageCompanion?.programId;
    const cleanupRecord=pages.find(item=>(item.installed??item).programId===cleanupProgramId);
    const cleanupPage=page||cleanupRecord?.installed||cleanupRecord;
    const pageControl=page&&pageStatusKnown?describeInstalledPageControl(page,pages,language()):null;
    const confirmation=pendingReview?{
      text:t('pageUninstallConsequence'),
      onConfirm:confirmPageUninstall,onCancel:cancelPageUninstall
    }:null;
    {
      // React solely owns extension-center-detail-body; keep the authoritative
      // verified identity check and all existing Host/permission routes above.
      const focused=detailFocusAction||doc.activeElement?.dataset?.ecDetailAction;
      if(!busy&&!pendingKey)detailFocusAction=null;
      const actions=[];
      const identity=selectedIdentity;
      const add=(label,id,onClick)=>actions.push({label,id,onClick(event){
        const current=find(row.key);
        // Page rows are fresh projections. Compare the pinned installation
        // identity, including its authorization generation, rather than wrappers.
        if(disposed||busy||pendingKey||selectedIdentity!==identity||
          (row.kind==='page'&&row.installed
            ?!samePageIdentity(current,pageIdentity(row))
            :row.kind==='page'
              ?current?.installed!==false||current?.release!==row.release
              :current?.record!==row.record||current?.release!==row.release))return;
        onClick(event);
      }});
      if(row.kind==='app'){
        if(row.queueReviewRelease)
          add('联合安装 / 更新审阅','queue-review',event=>{void reviewQueueProduct(row,event);});
        if(row.queueProduct){
          const companion=find('page:'+SEND_QUEUE_PIN.pageProgramId);
          if(companion?.installed){
            add(pageActionLabel(companion.record.installed),'queue-page-toggle',
              event=>{void togglePage(companion,event);});
            add('卸载网页能力…','queue-page-remove',event=>openUninstallReview(companion,event));
          }
          if(row.installed&&row.stateKnown!==false){
            add(row.queueProduct.state==='ready'?'停用整个产品':'恢复整个产品','queue-toggle',event=>{void toggleQueueProduct(row,event);});
            if(row.queueProduct.state!=='ready')add('停用整个产品','queue-disable',
              event=>{void toggleQueueProduct(row,event,false);});
            add('卸载整个产品…','queue-remove',event=>openQueueUninstall(row,event));
          }
        }
        if(!row.installed){
          if(row.cleanupPending)
            add(t('resumeCleanup'),'cleanup',event=>{void retryCleanup(row,event);});
          else if(!row.queueProduct&&!row.queueReviewRelease)add(t('reviewInstall'),'install',()=>openReview(row.key));
        }else{
          if(row.pageCompanion&&!row.queueProduct){
            add('网页能力','page-setup',()=>{
              const other=find('page:'+SEND_QUEUE_PIN.pageProgramId);
              if(other?.installed){openDetail(other.key,'main');return;}
              backIfNeeded();
              if(sidebarTools.openImport?.()!==true)
                message('请打开扩展导入区审阅 Page 候选包；当前没有已批准的自动安装发行。','error');
            });
          }
          if(row.stateKnown!==false)
            add(t('settings'),'settings',()=>{backIfNeeded();sidebarTools.openSettings(row.id);});
          if(row.update&&row.release&&!row.queueReviewRelease)add(t('reviewUpdate'),'update',event=>openReview(row.key,event));
        }
      }else if(row.kind==='page'&&!row.installed){
        if(row.release?.status==='available')add(t('reviewInstall'),'install',()=>openPageReview(row.key));
      }else if(row.installed&&!pendingReview){
        // These AI Page apps use one visible master switch, not two enable controls.
        if(row.stateKnown!==false&&!pageControl)
          add(pageActionLabel(row.record.installed),'toggle',
            event=>{void togglePage(row,event);});
        add(t('uninstallPageAction'),'uninstall',event=>openUninstallReview(row,event));
        if(!pageControl)
          add(t('goDevelop'),'develop',()=>{if(taskWorkbench.navigate('develop')!==false)backIfNeeded();});
      }
      extensionList.renderDetail({
        key:row.key,title:titleOf(row),type:typeOf(row),kind:row.kind,locale:language(),
        description:row.kind==='page'?descriptionOf({...row,description:row.release?.description||''}):rowDescription(row),actions,busy:Boolean(busy||pendingKey),
        focusAction:focused,
        pageControl:pageControl?{
          ...pageControl,
          busy:Boolean(busy||pendingKey),
          officialBlock:row.release?.status==='blocked'?row.release.blockedReason||t('releaseNotApproved'):null,
          onToggle:(value,event)=>{
            if(typeof value==='boolean'&&value!==page.enabled)void togglePage(row,event,value);
          },
          onRestore:event=>{
            if(pageControl.canRestore)void togglePage(row,event,true);
          },
          onRefresh:event=>{
            if(event?.isTrusted===true&&!disposed&&!busy&&!pendingKey)void refresh();
          }
        }:null,
        installed:row.installed,enabled:row.enabled,cleanupPending:row.cleanupPending,
        oldPageCleanup:describePageCleanup(cleanupProgramId,cleanupPage,pageCleanupPending),
        version:row.version,source:sources[row.id]?{...sources[row.id],label:
          sources[row.id].kind==='unknown'?t('unknownSource'):sources[row.id].kind==='market'?
            t('sourceMarket',{id:'opendesk/'+row.id}):t('sourceMismatch')}:null,
        usageText:row.kind==='app'&&(row.installed||row.queueProduct)?installedAppUsage(row):'',
        sites:page?.pageRules?.matches||(row.kind==='page'?row.release?.sites:[])||[],
        scrollManager:row.kind==='page'&&row.installed&&row.id===SCROLL_CONFIG_PROGRAM_ID?(()=>{
          const pinned=pageIdentity(row);
          const versionParts=String(row.record?.installed?.version||'').split('.').map(Number);
          const supportsTurnPaging=versionParts.length===3&&versionParts.every(Number.isSafeInteger)&&
            (versionParts[0]>0||versionParts[1]>4||
              versionParts[1]===4&&versionParts[2]>=15);
          const supportsTurnCount=supportsTurnPaging&&
            (versionParts[0]>0||versionParts[1]>4||
              versionParts[1]===4&&versionParts[2]>=16);
          const request={programId:pinned.programId,manifestHash:pinned.manifestHash,
            installationId:pinned.installationId,expectedGeneration:pinned.expectedGeneration};
          const ensure=()=>{
            if(disposed||!samePageIdentity(find(row.key),pinned))
              throw scrollError('identityChanged','E_REVISION');
          };
          const target=async()=>{
            if(!currentPageTarget)throw scrollError('pageStateUnavailable','E_DOCUMENT_STALE');
            const captured=currentPageTarget.capture();
            const live=await currentPageTarget.revalidate(captured);
            return {tabId:live.tabId,frameId:0,documentId:live.documentId,
              expectedUrl:live.url,expectedWindowId:live.windowId};
          };
          // Observation handles stay local to this installed model. The model
          // receives only structural candidates, never the full page URL.
          const observations=new WeakMap();
          const assertObservation=async observation=>{
            const where=observations.get(observation);
            if(!where)throw scrollError('pageStateUnavailable','E_DOCUMENT_STALE');
            ensure();
            const live=await target();
            if(JSON.stringify(live)!==JSON.stringify(where))
              throw scrollError('pageStateUnavailable','E_DOCUMENT_STALE');
            ensure();return where;
          };
          const unknown=error=>scrollError('unknownWrite','E_CONFIG_UNKNOWN',{detail:scrollErrorDetail(error)});
          const mutate=async(method,payload,verify,authorization=null)=>{
            if(scrollWriteUnknown)throw unknown(scrollError('previousWriteUnknown'));
            if(authorization)await authorization.assertWrite();
            ensure();
            let result;
            try{result=await client.request(method,payload);}
            catch(error){
              // Explicit pre-commit rejections are safe. Lost/transport replies
              // might follow a committed CAS and must never be auto-replayed.
              if(['E_CONFIG_SCHEMA','E_CONFIG_SCOPE','E_CONFIG_DOM','E_CONFIG_CONFLICT',
                'E_PAGE_AUTHORIZATION','E_PERMISSION','E_GESTURE','E_DOCUMENT_STALE',
                'E_REVISION','E_SCROLL_RESTORE_SCOPE'].includes(error?.code))throw error;
              scrollWriteUnknown=true;throw unknown(error);
            }
            try{
              if(typeof result?.etag!=='string'||result?.value?.version!==1||
                !Array.isArray(result.value.sites)||!verify(result.value))
                throw scrollError('mismatchedReceipt');
              const confirmed=await client.request('readScrollSiteConfig',request);
              ensure();
              if(confirmed?.etag!==result.etag||JSON.stringify(confirmed.value)!==JSON.stringify(result.value))
                throw scrollError('mismatchedReadback');
              return confirmed;
            }catch(error){scrollWriteUnknown=true;throw unknown(error);}
          };
          return {
            locale:language(),turnPagingSupported:supportsTurnPaging,
            showTurnCountSupported:supportsTurnCount,
            identityKey:pinned.installationId+':'+pinned.manifestHash+':'+pinned.expectedGeneration,
            createConversation:()=>{
              ensure();
              return createScrollConversation?.({instanceId:crypto.randomUUID(),
                installEpoch:pinned.installationId+':'+pinned.expectedGeneration})||null;
            },
            openAIProviderSettings,
            aiUnknown:()=>scrollAIUnknown.has(JSON.stringify(pinned)),
            markAIUnknown:()=>scrollAIUnknown.add(JSON.stringify(pinned)),
            resumeDraft:scrollDraft?{...scrollDraft}:null,
            async onCurrentPage(){
              if(!currentPageTarget)throw scrollError('pageUnavailable','E_DOCUMENT_STALE');
              const live=await currentPageTarget.refresh();
              if(live.status!=='available')throw Object.assign(
                new Error(live.message||scrollText('noPage')),{code:live.reason||'E_DOCUMENT_STALE'});
              return live.origin;
            },
            async onCurrentPageDetails(){
              if(!currentPageTarget)throw scrollError('pageUnavailable','E_DOCUMENT_STALE');
              const live=await currentPageTarget.refresh();
              if(live.status!=='available'||typeof live.url!=='string')throw Object.assign(
                new Error(live.message||scrollText('noPage')),{code:live.reason||'E_DOCUMENT_STALE'});
              const url=new URL(live.url);
              if(url.origin!==live.origin||!['http:','https:'].includes(url.protocol))
                throw scrollError('pageInvalid','E_CONFIG_SCOPE');
              return {origin:live.origin,url:live.url};
            },
            async onObserveCurrentPage(authorization){
              if(!authorization)throw scrollError('saveGesture','E_GESTURE');
              await authorization.assertWrite();ensure();
              const where=await target();
              const result=await client.request('observeScrollSitePage',{...request,target:where});
              await authorization.assertWrite();ensure();
              if(result?.state!=='observed'||!Array.isArray(result.candidates)||!result.candidates.length)
                throw scrollError('pageStateUnavailable','E_CONFIG_DOM');
              const handle={observation:{origin:new URL(where.expectedUrl).origin,...result},
                assertCurrent:()=>assertObservation(handle)};
              observations.set(handle,where);
              await handle.assertCurrent();
              return handle;
            },
            isApproved(origin,pathScope){
              try{
                const url=new URL(origin);
                return url.origin===origin&&scrollProgramUrlMatches(page.pageRules,
                  origin+(pathScope||'/'));
              }catch{return false;}
            },
            disabledReason:!page?.enabled?scrollText('disabledApp'):
              page?.authorization?.status!=='active'||page?.nativeState!=='registered'||page?.error?
                scrollText('disabledAuthorization'):null,
            async onRead(){
              ensure();const result=await client.request('readScrollSiteConfig',request);ensure();
              if(result?.value?.version!==1||!Array.isArray(result.value.sites)||typeof result.etag!=='string')
                throw scrollError('invalidReadback','E_CONFIG_UNKNOWN');
              scrollWriteUnknown=false;return result;
            },
            async onSaveNavigation(navigation,etag,event,authorization=null){
              if(event?.isTrusted!==true)throw scrollError('navigationGesture','E_GESTURE');
              ensure();
              const flagCount=Object.keys(navigation||{}).length;
              if(flagCount!==5&&!(supportsTurnPaging&&flagCount===6)&&
                !(supportsTurnCount&&flagCount===7))
                throw scrollError('navigationGesture','E_CONFIG_SCHEMA');
              return mutate('saveScrollNavigationSettings',{...request,etag,navigation},value=>
                Object.keys(value.navigation||{}).length===flagCount&&
                Object.entries(navigation).every(([key,flag])=>
                  typeof flag==='boolean'&&value.navigation?.[key]===flag),authorization);
            },
            onDraftChange(draft,editKey){
              if(draft)scrollDraft={...draft,editKey:editKey??null};
              else {scrollDraft=null;scrollAwaitingReview=false;}
            },
            async onReviewSite(values,event){
              if(event?.isTrusted!==true)
                throw scrollError('reviewGesture','E_GESTURE');
              ensure();
              const ok=await reviewScrollSite(values,event,pinned);
              if(!ok)throw scrollError('reviewBlocked','E_SITE_REVIEW');
              return true;
            },
            async onPick(field,origin,mainSelector,event){
              if(event?.isTrusted!==true)throw scrollError('pickGesture','E_GESTURE');
              ensure();const where=await target();
              if(new URL(where.expectedUrl).origin!==new URL(origin).origin)
                throw scrollError('openConfiguredSite','E_CONFIG_SCOPE');
              ensure();return client.request('pickScrollSiteElement',{...request,target:where,field,mainSelector});
            },
            async onSave(rule,etag,editKey,event,authorization=null,pageObservation=null){
              if(event?.isTrusted!==true)throw scrollError('saveGesture','E_GESTURE');
              ensure();
              if(pageObservation)await assertObservation(pageObservation);
              if(rule!==null&&!(editKey&&rule.enabled===false)&&
                !scrollProgramUrlMatches(page.pageRules,rule.origin+rule.pathScope)){
                if(authorization)await authorization.assertWrite();
                ensure();
                scrollDraft={...rule,editKey:editKey??null};
                const reviewed=await reviewScrollSite(
                  {origin:rule.origin,pathScope:rule.pathScope},event,pinned);
                if(!reviewed)throw scrollError('reviewIncomplete','E_SITE_REVIEW');
                return {review:true};
              }
              // Management of saved rules need not require an active webpage.
              // The Host decides which edits still require live DOM validation.
              let where=null;
              if(pageObservation)where=await assertObservation(pageObservation);
              else if(rule!==null){try{where=await target();}catch(error){if(!editKey)throw error;}}
              ensure();
              const confirmed=await mutate('saveScrollSiteRule',{
                ...request,target:where,rule,etag,editKey:editKey??null},value=>{
                const at=key=>value.sites.find(site=>site.origin+'\n'+site.pathScope===key);
                if(rule===null)return !at(editKey);
                const key=rule.origin+'\n'+rule.pathScope;
                return JSON.stringify(at(key))===JSON.stringify(rule)&&(!editKey||editKey===key||!at(editKey));
              },authorization);
              scrollDraft=null;scrollAwaitingReview=false;
              return confirmed;
            }
          };
        })():null,
        siteUpgrade:row.kind==='page'&&row.installed&&row.id===SCROLL_CONFIG_PROGRAM_ID?{
          // Only the trusted scroll-site review provides this capability.
          title:scrollText('siteUpgradeTitle'),
          summary:scrollText('siteUpgradeSummary'),
          description:scrollText('siteUpgradeDescription'),
          permissionNote:scrollText('siteUpgradePermissionNote'),
          onSubmit:(value,event)=>void reviewScrollSite(value,event,pageIdentity(row)),
          busy:Boolean(busy||pendingKey),error:scrollNavigationMessageText(language(),siteUpgradeError),
          disabledReason:!page?.enabled?scrollText('siteUpgradeDisabled'):
            page?.authorization?.status!=='active'||page?.nativeState!=='registered'||page?.error?
              scrollText('siteUpgradeUnauthorized'):null
        }:null,
        suspended:page?.authorization?.status==='suspended',
        confirmation,
        pageInfo:page?{
          source:t('unknownSource'),excluded:page.pageRules?.excludeMatches||[],
          capabilities:page.authorization?.scope?.capabilities||[],
          networkOrigins:page.authorization?.scope?.networkOrigins||[],
          authorization:page.authorization?.status||t('unknown'),
          nativeState:page.nativeState||t('unknown'),nativeId:page.nativeId||null,
          installationId:page.authorization?.installationId||null,
          sourceHash:page.sourceHash||null,
          manifestHash:page.manifestHash||null,packageHash:page.packageHash||null,
          cleanupState:page.managedCleanup?.state||null,
          error:page.error?.message||null,
          dataRule:t('pageDataRule')
        }:null,
        appDataText:row.kind==='app'&&row.installed?
          t('appStorageUnknown'):'',
        installationText:row.queueProduct?row.queueProduct.summary:row.installed?
          (t('installedState',{state:row.stateKnown===false?t('stateUnverified'):
            row.kind==='page'&&row.enabled&&
              (page?.nativeState!=='registered'||page?.authorization?.status!=='active'||page?.error)
              ?t('autorunNotReady'):row.enabled?t('enabled'):t('disabled')})):
          (row.cleanupPending?t('removedCleanupPending'):
            row.kind==='page'&&row.release?.status==='blocked'?
              t('pageReleaseBlocked')+row.release.blockedReason:
              t('releaseCandidate'))
      });
      return;
    }
  }
  async function reviewQueueProduct(row,event){
    if(!event?.isTrusted||disposed||busy||pendingKey||!isPinnedQueueRelease(row.queueReviewRelease)||
      row.queueReviewRelease!==row.release||row.cleanupPending||!appStatusKnown||!pageStatusKnown)return;
    busy=true;pendingKey=row.key;draw();if(selectedKey)renderDetail();
    try{
      const pkg=await loadSendQueuePageCandidate({api});
      if(disposed)return;
      const current=find(row.key);
      if(current?.installed!==row.installed||current?.release!==row.release||
        !isPinnedQueueRelease(current?.queueReviewRelease)||
        row.installed&&!sameSidebarToolPackage(current.record,row.record))
        throw new Error('产品安装身份或固定发行已变化，请重新审阅');
      backIfNeeded();
      // One original ImportSheet confirmation owns both existing installers.
      // Missing facade fails closed; never fall back to two permission reviews.
      if(sidebarTools.openSendQueueProductReview?.(pkg,row.release)!==true)
        throw new Error('联合安装审阅暂不可用；请先处理当前草稿或其他安装审阅');
      message('已打开产品统一版本与权限审阅；尚未安装，官方 Page 发布仍为 blocked。','info');
    }catch(error){message((error.code||'E_QUEUE_REVIEW')+'：'+String(error.message||error),'error');}
    finally{busy=false;pendingKey=null;if(!disposed){draw();if(selectedKey)renderDetail();}}
  }
  function openQueueUninstall(row,event){
    if(!event?.isTrusted||disposed||busy||pendingKey||listUninstallReview||!row.queueProduct||
      !appStatusKnown||!pageStatusKnown)return;
    const page=find('page:'+SEND_QUEUE_PIN.pageProgramId);
    const identity=queuePageIdentity(page?.record?.installed);
    if(page?.installed&&!identity){message('网页安装身份不完整，不能联合卸载。','error');return;}
    listUninstallReview=Object.freeze({key:row.key,id:row.id,kind:'queue',title:titleOf(row),
      package:structuredClone(row.record),pageIdentity:identity});
    syncListUninstallReview();
  }
  async function removeQueueProduct(review,event){
    busy=true;pendingKey=review.key;pageRemovalPending=true;draw();if(selectedKey)renderDetail();
    let pageCleanupPending=false;
    try{
      if(review.pageIdentity){
        const receipt=await client.request('uninstallPageProgram',review.pageIdentity);
        const read=await refresh();
        if(receipt?.error||!confirmedPageRemoval(receipt,review.pageIdentity)||
          !read||find('page:'+SEND_QUEUE_PIN.pageProgramId)?.installed)
          throw new Error('网页卸载未完整确认；侧栏保留，请核对部分状态');
        pageCleanupPending=receipt.cleanupPending===true;
      }
      const current=find(review.key);
      if(!current?.installed||!sameSidebarToolPackage(current.record,review.package))
        throw new Error('侧栏安装身份已变化，停止联合卸载');
      const outcome=await sidebarTools.uninstallFromList(review.id,review.package,event);
      const read=await refresh();
      if(outcome!==true||!read||find(review.key)?.installed||pendingCleanups.has(review.id)||
        find('page:'+SEND_QUEUE_PIN.pageProgramId)?.installed)
        throw new Error('侧栏卸载或清理未完整确认，请核对部分状态');
      message(pageCleanupPending?()=>t('pageUninstallCleanupPending'):
        '两份安装记录均已读回确认卸载；旧网页效果可能需要刷新。',pageCleanupPending?'info':'success');
    }catch(error){
      await refresh();
      message((error.code||'E_QUEUE_PARTIAL')+'：'+String(error.message||error)+'；不会自动重试。','error');
    }finally{
      busy=false;pendingKey=null;listUninstallReview=null;
      if(!disposed){draw();if(selectedKey)renderDetail();}
      finishPageRemoval();
    }
  }
  async function toggleQueueProduct(row,event,desiredEnabled){
    if(!event?.isTrusted||disposed||busy||pendingKey||!row.queueProduct||
      !appStatusKnown||!pageStatusKnown)return;
    const page=find('page:'+SEND_QUEUE_PIN.pageProgramId),identity=queuePageIdentity(page?.record?.installed);
    const target=desiredEnabled??(row.queueProduct.state!=='ready');
    if(page?.installed?!sameQueuePageIdentity(page.record.installed,row.pageCompanion.identity):row.pageCompanion.installed){
      message('网页安装身份已变化，请重新审阅产品状态。','error');return;
    }
    if(!identity&&(target||page?.installed)){message('网页能力缺失或安装身份不完整，请先审阅安装。','error');return;}
    // Never auto-upgrade an unreviewed revision while restoring the product.
    if(target&&row.pageCompanion.state==='version-mismatch'){
      message('网页版本不匹配，请先审阅固定候选。','error');return;
    }
    busy=true;pendingKey=row.key;draw();if(selectedKey)renderDetail();
    try{
      if(identity&&(page.enabled!==target||page.record.installed.nativeState!==(target?'registered':'disabled')||
        page.record.installed.authorization?.status!==(target?'active':'disabled')||
        page.record.installed.error)){
        const receipt=await setInstalledPageProgramEnabled({api,client,row:page.record,enabled:target});
        const read=await refresh(),current=find(page.key)?.record?.installed;
        if(!receipt||receipt.error||!read||current?.authorization?.installationId!==identity.installationId||
          current.manifestHash!==identity.manifestHash||current.enabled!==target||current.error||
          current.nativeState!==(target?'registered':'disabled')||
          current.authorization?.status!==(target?'active':'disabled'))
          throw new Error('网页启停尚未确认，侧栏保持原状态');
      }
      const current=find(row.key);
      if(!current?.installed||!sameSidebarToolPackage(current.record,row.record)||current.enabled!==row.enabled)
        throw new Error('侧栏安装或启停状态已变化，请重新核对');
      const outcome=current.enabled===target?true:await sidebarTools.toggleEnabled(row.id,event);
      const read=await refresh();
      const confirmed=find('page:'+SEND_QUEUE_PIN.pageProgramId)?.record?.installed;
      const pageConfirmed=identity?confirmed?.manifestHash===identity.manifestHash&&
        confirmed?.authorization?.installationId===identity.installationId&&confirmed.enabled===target&&
        confirmed.nativeState===(target?'registered':'disabled')&&
        confirmed.authorization?.status===(target?'active':'disabled')&&!confirmed.error:!confirmed;
      if(outcome!==true||!read||find(row.key)?.enabled!==target||!pageConfirmed)
        throw new Error('侧栏启停尚未确认，请核对部分状态和未保存草稿');
      message('已从两份安装记录确认产品'+(target?'恢复':'停用')+'；没有迁移或重发消息。','success');
    }catch(error){await refresh();message((error.code||'E_QUEUE_PARTIAL')+'：'+String(error.message||error)+'；不会自动重试。','error');}
    finally{busy=false;pendingKey=null;if(!disposed){draw();if(selectedKey)renderDetail();}}
  }
  function openUninstallReview(row,event){
    if(!event?.isTrusted||busy||pendingKey||row?.kind!=='page')return;
    if(selectedKey!==row.key)openDetail(row.key,'more');
    const identity=pageIdentity(find(row.key));
    if(!identity?.installationId||!Number.isSafeInteger(identity.expectedGeneration)){
      message(()=>t('pageIdentityIncomplete'),'error');return;
    }
    uninstallReview=Object.freeze(identity);
    detailFocusAction='confirm-uninstall';
    renderDetail();
  }
  function cancelPageUninstall(event){
    if(!event?.isTrusted||busy||pendingKey)return;
    uninstallReview=null;detailFocusAction='uninstall';renderDetail();
  }
  async function confirmPageUninstall(event){
    if(!event?.isTrusted||busy||pendingKey||!uninstallReview)return;
    const expected=uninstallReview,row=find(expected.key);
    if(!samePageIdentity(row,expected)){
      uninstallReview=null;detailFocusAction='uninstall';renderDetail();
      message(()=>t('preUninstallChanged'),'error');return;
    }
    busy=true;pendingKey=expected.key;pageRemovalPending=true;detailFocusAction=null;
    draw();if(selectedKey)renderDetail();
    let outcome,operationError,readback=false;
    try{
      try{
        outcome=await client.request('uninstallPageProgram',{
          programId:expected.programId,manifestHash:expected.manifestHash,
          installationId:expected.installationId,expectedGeneration:expected.expectedGeneration});
        if(outcome?.error)throw Object.assign(new Error(outcome.error.message||t('uninstallFailed')),
          {code:outcome.error.code||'E_PAGE_UNINSTALL_PENDING'});
      }catch(error){operationError=error;}
      try{readback=await refresh({pageReadback:true});}catch(error){operationError??=error;}
      if(disposed)return;
      if(operationError)message(()=>(operationError.code||'E_PAGE_UNINSTALL_PENDING')+'：'+
        String(operationError.message||operationError)+
        t('verifyBeforeRetry'),'error');
      else if(confirmedPageRemoval(outcome,expected)&&
        readback&&pageStatusKnown&&!find(expected.key)?.installed)
        message(()=>t(outcome.cleanupPending?'pageUninstallCleanupPending':'pageUninstallConfirmed'),
          outcome.cleanupPending?'info':'success');
      else message(()=>t('pageUninstallUnconfirmed'),'error');
    }finally{
      busy=false;pendingKey=null;uninstallReview=null;listUninstallReview=null;
      if(!disposed){draw();if(selectedKey)renderDetail();else if(!restoreRowFocus(expected.key,'more'))
        search?.focus?.({preventScroll:true});}
      finishPageRemoval();
    }
  }
  async function togglePage(row,event,desiredEnabled){
    if(disposed||!event?.isTrusted||busy||pendingKey||row.kind!=='page')return;
    if(row.stateKnown===false)return;
    if(!samePageIdentity(find(row.key),pageIdentity(row))){
      message(()=>t('pageStateChanged'),'error');void refresh();return;
    }
    const installed=row.record.installed;
    const targetEnabled=typeof desiredEnabled==='boolean'?desiredEnabled:installedPageEnableAction(installed).enabled;
    if(typeof desiredEnabled==='boolean'&&desiredEnabled===installed.enabled&&
      !(desiredEnabled&&describeInstalledPageControl(installed,pages)?.canRestore))return;
    const inDetail=selectedKey===row.key;
    detailFocusAction=inDetail?'toggle':null;
    busy=true;pendingKey=row.key;draw();if(inDetail)renderDetail();
    try{
      let result,operationError,readback=false;
      try{result=await setInstalledPageProgramEnabled({api,client,row:row.record,enabled:desiredEnabled});}
      catch(error){
        operationError=error;
        if(!disposed)message((error?.code||'E_PAGE_INSTALLATION')+'：'+
          errorText(error),'error');
      }
      try{readback=await refresh({pageReadback:true});}catch(error){operationError??=error;}
      if(disposed)return;
      const current=find(row.key);
      if(operationError)
        message((operationError.code||'E_PAGE_INSTALLATION')+'：'+String(operationError.message||operationError),'error');
      else if(result===false||result==null||!readback||!pageStatusKnown||
        current?.record?.manifestHash!==row.record.manifestHash||
        current?.record?.installed?.authorization?.installationId!==installed.authorization?.installationId||
        current.enabled!==targetEnabled)
        message(()=>t('pageToggleUnconfirmed'),'error');
      else if(targetEnabled&&(current.record.installed.nativeState!=='registered'||
        current.record.installed.authorization?.status!=='active'||current.record.installed.error))
        message(()=>t('pageEnablePending'),'info');
      else if(!targetEnabled&&(current.record.installed.nativeState!=='disabled'||
        current.record.installed.authorization?.status!=='disabled'||
        current.record.installed.error||current.record.installed.managedCleanup&&
          current.record.installed.managedCleanup.state!=='retired'))
        message(()=>t('pageDisablePending'),'info');
      else message(()=>t('pageToggleConfirmed'),'success');
    }finally{busy=false;pendingKey=null;if(!disposed){draw();if(selectedKey)renderDetail();
      else restoreRowFocus(row.key,'more');}}
  }
  async function retryCleanup(row,event){
    if(disposed||!event?.isTrusted||busy||pendingKey||!row.cleanupPending||
      typeof sidebarTools.retryUninstallCleanup!=='function')return;
    busy=true;pendingKey=row.key;draw();if(selectedKey)renderDetail();
    let outcome,operationError,readback=false;
    try{
      try{outcome=await sidebarTools.retryUninstallCleanup(row.id,event);}
      catch(error){operationError=error;}
      try{readback=await refresh();}catch(error){operationError??=error;}
    }finally{busy=false;pendingKey=null;}
    if(disposed)return;
    if(operationError)message((operationError?.code||'E_TOOL_CLEANUP')+'：'+
      String(operationError?.message||operationError),'error');
    else if(outcome?.state==='cleaned'&&readback&&!find(row.key)?.cleanupPending)
      message(()=>t('cleanupComplete'),'success','action',{hostNotified:true});
    else message(()=>t('cleanupUnconfirmed'),'error');
    draw();if(selectedKey)renderDetail();
  }
  async function refresh({pageReadback=false,appReadback=false}={}){
    if(disposed)return false;
    const id=++sequence;
    const current=()=>!disposed&&id===sequence;
    let appsDone=false,pagesDone=false,appsError=null,pagesError=null;
    function publish(){
      if(!current())return;
      const errors=[appsError,pagesError].filter(Boolean);
      dataError=errors.length?errors:null;hasLoaded=appsDone&&pagesDone;
      if(dataError&&statusOrigin!=='action')
        message(()=>t('readFailed')+dataErrorText(),'error','read');
      else if(hasLoaded&&(statusOrigin==='read'||statusOrigin==='loading'||statusOrigin==='catalog'))
        message(()=>catalogError||pageCatalogError?t('catalogPartial')+[catalogError,pageCatalogError].filter(Boolean).join('；'):'',
          catalogError||pageCatalogError?'error':'info',catalogError||pageCatalogError?'catalog':'read');
      draw();
      if(pagesDone&&scrollAwaitingReview&&scrollDraft&&!selectedKey){
        const updated=find('page:'+SCROLL_CONFIG_PROGRAM_ID);
        const installation=updated?.record?.installed;
        if(updated?.installed&&installation?.authorization?.status==='active'&&
          installation.nativeState==='registered'&&
          scrollProgramUrlMatches(installation.pageRules,scrollDraft.origin+scrollDraft.pathScope)){
          scrollAwaitingReview=false;
          openDetail(updated.key,'main');
        }
      }
      if(selectedKey)renderDetail();
    }
    // Local applications do not depend on the Page Authority's connection or
    // native readback. Publish each validated source as soon as it is ready;
    // completion/readback still waits for both, and stale refreshes cannot paint.
    const readApps=(async()=>{try{
      const saved=await api.storage.local.get([
        SIDEBAR_TOOL_STORE,SIDEBAR_TOOL_ENABLE_STORE,MARKET_PROVENANCE_STORE,TOOL_CLEANUP_STORE]);
      if(!current())return;
      const nextInstalled=requireCompleteInstalledSidebarTools(saved[SIDEBAR_TOOL_STORE]);
      const nextEnabled=requireToolEnableRecords(saved[SIDEBAR_TOOL_ENABLE_STORE]);
      const cleanups=requirePendingToolCleanups(saved[TOOL_CLEANUP_STORE]);
      const nextCleanups=new Set(Object.keys(cleanups));
      const nextSources=Object.fromEntries(await Promise.all(nextInstalled.map(async tool=>
        [tool.id,await describeInstalledAppSource(tool,saved[MARKET_PROVENANCE_STORE]?.[tool.id],language())])));
      if(!current())return;
      installed=nextInstalled;enabled=nextEnabled;sources=nextSources;
      pendingCleanups=nextCleanups;appStatusKnown=true;
    }catch(error){
      if(!current())return;
      // Do not advertise a previously cached registry as a current installation.
      installed=[];enabled={};sources={};pendingCleanups=new Set();appStatusKnown=false;
      appsError={key:'appsError',error};
    }
    appsDone=true;publish();})();
    const readPages=(async()=>{pendingPageReads++;try{
      const response=await client.request('listPagePrograms',{});
      if(!current())return;
      if(!Array.isArray(response?.installed))throw uiError('invalidPageList');
      // Embedded Page modules share their parent application's install and
      // lifecycle; they are not a second independently manageable extension.
      pages=response.installed.filter(row=>!row.appOwner);pageStatusKnown=true;
      pageCleanupPending=Array.isArray(response.cleanupPending)?response.cleanupPending:[];
    }catch(error){
      if(!current())return;
      pages=[];pageCleanupPending=[];pageStatusKnown=false;pagesError={key:'pagesError',error};
    }finally{pendingPageReads--;}
    pagesDone=true;publish();})();
    await Promise.all([readApps,readPages]);
    if(!current())return false;
    await readPinnedState();
    if(!current())return false;
    draw();
    return appReadback?appStatusKnown:pageReadback?pageStatusKnown:!dataError;
  }
  async function readOfficial(){
    const id=++officialSequence;
    try{const result=await loadOfficialCatalog({api});if(!disposed&&id===officialSequence){
      official=result.apps;catalogError='';
      if(statusOrigin==='catalog'&&!dataError)message('','info','read');
      draw();if(selectedKey)renderDetail();
    }}
    catch(error){if(!disposed&&id===officialSequence){
      // Fail closed; a prior catalog is not proof of the current refresh.
      official=[];catalogError=errorText(error);
      if(statusOrigin!=='action')message(
        ()=>t('catalogUnavailable')+catalogError,'error','catalog');
      draw();if(selectedKey)renderDetail();
    }}
  }
  async function readPageOfficial(){
    const id=++pageOfficialSequence;
    try{
      const result=await loadOfficialPageCatalog({api});
      if(disposed||id!==pageOfficialSequence)return;
      officialPages=result.apps;pageCatalogError='';draw();if(selectedKey)renderDetail();
    }catch(error){
      if(disposed||id!==pageOfficialSequence)return;
      officialPages=[];pageCatalogError=errorText(error);
      if(statusOrigin!=='action')message(()=>t('pageCatalogUnavailable')+pageCatalogError,'error','catalog');
      draw();if(selectedKey)renderDetail();
    }
  }
  const syncLanguage=()=>{if(disposed)return;draw();if(selectedKey)renderDetail();
    if(typeof lastMessage?.value==='function')message(lastMessage.value,lastMessage.state,lastMessage.origin);
  };
  const stopLanguage=localeController?.subscribe?.(syncLanguage);
  const stopPageDiscovery=currentPageTarget?.subscribe?.(state=>{
    if(!pageDiscovery?.target)return;
    const pinned=pageDiscovery.target;
    if(state.status!=='available'||['windowId','tabId','documentId','url','origin'].some(k=>state[k]!==pinned[k])){
      discoveryGeneration++;pageDiscovery=null;renderPageDiscovery();
    }
  });
  void localeController?.ready?.then(syncLanguage);
  extensionList.connectBack(back);
  function backIfNeeded(){if(selectedKey)back(true);}
  // The action owns its fresh readback. Coalesce passive notifications until
  // it finishes so they cannot supersede confirmation or lose later changes.
  function refreshFromInstallationChange(){
    if(pageRemovalPending){deferredInstallationRefresh=true;return;}
    void refresh();
  }
  function finishPageRemoval(){
    pageRemovalPending=false;
    if(deferredInstallationRefresh){deferredInstallationRefresh=false;if(!disposed)void refresh();}
  }
  const storageChanged=(changes,area)=>{
    if(area==='local'&&Object.keys(changes).some(key=>key.startsWith(EXTENSION_CENTER_PIN_STORAGE_PREFIX)))
      void readPinnedState().then(()=>{if(!disposed)draw();});
    if(area==='local'&&(SIDEBAR_TOOL_STORE in changes||SIDEBAR_TOOL_ENABLE_STORE in changes||MARKET_PROVENANCE_STORE in changes||
      TOOL_CLEANUP_STORE in changes||
      Object.keys(changes).some(key=>key.startsWith('opendesk.page'))))refreshFromInstallationChange();
  };
  const pageInstallationChanged=refreshFromInstallationChange;
  const languageSettingsRequested=event=>openLanguageSettings(event.detail?.toolId);
  doc.addEventListener('opendesk-language-settings',languageSettingsRequested);
  doc.addEventListener('opendesk:page-installation-changed',pageInstallationChanged);
  api.storage.onChanged?.addListener(storageChanged);
  // The initial Page request already waits for Host registration. Restarting
  // it on that same connection discards the first local application read.
  const connChanged=client.subscribeConnection?.(state=>{
    const initialReadOwnsConnection=!connectionSeen&&pendingPageReads>0;
    connectionSeen=true;
    if(state.connected&&!initialReadOwnsConnection)refreshFromInstallationChange();
  });
  message(()=>t('loadingInstalled'),'loading','loading');draw();
  void readDiscoveryChannel();void readOfficial();void readPageOfficial();void refresh();
  return {refresh,openInstalledAppDetail,openInstalledMarketApp,openInstalledLocalTool,
    reportPanelNavigation:value=>message(value?String(value):()=>t('marketDeferred'),'error'),
    dispose(){if(disposed)return;disposed=true;sequence++;officialSequence++;pageOfficialSequence++;discoveryGeneration++;discoveryChannelGeneration++;
    listUninstallReview=null;uninstallReview=null;closeRowMenu();
    doc.removeEventListener('opendesk-language-settings',languageSettingsRequested);
    doc.removeEventListener('opendesk:page-installation-changed',pageInstallationChanged);
    api.storage.onChanged?.removeListener(storageChanged);connChanged?.();stopLanguage?.();stopPageDiscovery?.();},openLanguageSettings};
}
