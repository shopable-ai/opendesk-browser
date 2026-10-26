import {SIDEBAR_TOOL_STORE} from './sidebar-tools/package.js';
import {requireCompleteInstalledSidebarTools,requirePendingToolCleanups,MARKET_PROVENANCE_STORE,TOOL_CLEANUP_STORE,sameSidebarToolPackage} from './sidebar-tools/installation.js';
import {SIDEBAR_TOOL_ENABLE_STORE,requireToolEnableRecords} from './sidebar-tools/lifecycle.js';
import {loadOfficialCatalog} from '../sidebar-tools/official-catalog.js';
import {loadOfficialPageCatalog} from '../scripting/user-scripts/official-page-catalog.js';
import {installedPageEnableAction,setInstalledPageProgramEnabled} from './installed-page-tools.js';
import {composeExtensionEntries,filterExtensionEntries,describeInstalledAppSource,resolveExtensionRowIntent,resolveExtensionPrimaryAction} from './extension-center-model.js';
import readingTocCatalog from '../../examples/sidebar-tools/reading-toc/trusted/locales.generated.js';
import {OFFICIAL_READING_TOC_RELEASE} from '../sidebar-tools/official-reading-toc.js';
import {uiMessage} from './app-localization.js';
import {PROGRAM_DRAFT_INPUT_LIMIT} from './program-source.js';
import {loadMarketChannel} from '../marketplace/external.js';
import {discoverCurrentPageMarketInstall} from '../marketplace/discovery.js';

// One trusted presentation. All writes and launches delegate to the existing hosts.
export function createExtensionCenter({api,client,doc,sidebarTools,taskWorkbench,currentPageTarget,localeController=null,toolLocaleService=null,extensionList=null}){
  const get=id=>doc.getElementById(id);
  const list=get('extension-center-list'),search=get('extension-center-search');
  const more=get('extension-center-more'),workspace=get('workspace-content');
  if(!extensionList||extensionList.owner!=='extension-list'||list?.dataset.opendeskReactOwner!=='extension-list')
    throw new Error('E_REACT_LIST_OWNERSHIP');
  let disposed=false,sequence=0,officialSequence=0,pageOfficialSequence=0,busy=false,pendingKey=null,installed=[],pages=[],enabled={},official=[],officialPages=[];
  let appStatusKnown=false,pageStatusKnown=false,pendingCleanups=new Set();
  let toolbarMenuOpen=false,searchText='',languageManager=null,languageSession=0;
  let sources={};
  let catalogError='',pageCatalogError='',dataError='',statusOrigin='loading',hasLoaded=false,query='',kind='all',scope='smart',selectedKey=null,selectedInstalled=null;
  let listScroll=0,focusKey=null,focusAction=null,detailFocusAction=null,selectedIdentity=null,uninstallReview=null,listUninstallReview=null;
  let pageDiscovery=null,discoveryGeneration=0;
  let marketDiscoveryAvailable=false,discoveryChannelGeneration=0;
  const language=()=>localeController?.getLocale?.()||'zh-CN';
  const readingTocOfficial=row=>row.kind==='app'&&row.id==='reading-toc'&&
    row.title===readingTocCatalog.messages['zh-CN'].title&&
    row.release?.toolId==='reading-toc'&&
    row.release.sha256===OFFICIAL_READING_TOC_RELEASE.sha256&&
    row.release.version===OFFICIAL_READING_TOC_RELEASE.version&&
    (!row.installed||(
      sources[row.id]?.kind==='market'&&
      sources[row.id]?.sha256===row.release.sha256&&row.version===row.release.version
    ));
  const titleOf=row=>readingTocOfficial(row)?uiMessage(readingTocCatalog,language(),'title'):row.title||row.id;
  const descriptionOf=row=>readingTocOfficial(row)&&
    row.description===readingTocCatalog.messages['zh-CN'].description?
      uiMessage(readingTocCatalog,language(),'description'):row.description||'';
  const installedAppUsage=row=>{
    if(!readingTocOfficial(row))
      return '应用已安装，可按需打开界面；有额外权限需求的操作会独立检查。';
    if(row.stateKnown===false)return '安装状态尚待核对；不会据此自动恢复目录。';
    if(row.enabled===false)return '阅读目录已被主动停用；可在设置中恢复。';
    return '阅读目录安装后会在符合条件的网页自动显示；无需再次启用或逐站授权。“打开”仅查看侧边栏目录。';
  };
  // "Application" is a product identity; Page/Sidebar is the run mode.
  // This changes presentation only, never installed IDs or Authority records.
  const typeOf=row=>row.kind==='page'?'应用 · 网页增强':'应用 · 侧边栏';
  const all=()=>composeExtensionEntries({installed,pages,official:appStatusKnown?official:[],
    pageReleases:pageStatusKnown?officialPages:[],
    enabled,appStatusKnown,pageStatusKnown,cleanupPendingIds:[...pendingCleanups]});
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
  const message=(value='',state='info',origin='action')=>{
    statusOrigin=origin;
    if(!disposed)extensionList.renderStatus({text:value,state});
  };
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
        if(file.size>PROGRAM_DRAFT_INPUT_LIMIT)throw new Error('文件超过程序草稿包大小上限。');
        const text=await file.text();
        let value;
        try{value=JSON.parse(text);}catch{return null;}
        return value?.format==='opendesk.locale-pack.v1'?value:null;
      }));
      if(disposed)return;
      if(packs.some(Boolean)){
        if(inputs.length!==1)throw new Error('语言包请逐个导入，不可与代码安装包混合。');
        openLanguageSettings(packs[0].toolId,packs[0]);return;
      }
      backIfNeeded();
      if(sidebarTools.openImportFiles?.(inputs)!==true)
        message('当前无法打开扩展安装器，请稍后重试。','error');
    }catch(error){message('导入失败：'+String(error?.message||error),'error');}
  }
  function syncFilters(){
    extensionList.renderToolbar({
      query:searchText,kind,scope,menuOpen:toolbarMenuOpen,marketDiscoveryAvailable,
      language:localeController?.getPreference?.()||language(),
      onSearch(value){if(disposed)return;searchText=value;query=value.trim();draw();},
      onMarket(){if(!disposed)openMarket();},
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
            message('当前无法打开导入扩展弹窗；请完成正在进行的操作后重试。','error');
        }catch(error){
          message('无法打开导入扩展弹窗：'+String(error?.message||error),'error');
        }
      },
      onImportFiles:importFiles,
      localeManager:languageManager?{...languageManager,service:toolLocaleService,
        tools:installed.filter(tool=>tool.localization),localeController,
        onClose(){languageManager=null;syncFilters();}}:null,
      onReload(){if(disposed)return;closeMenu();message('正在刷新扩展…','loading','loading');
        void readDiscoveryChannel();void readOfficial();void readPageOfficial();void refresh();},
      onLanguage(value){if(disposed)return;void localeController?.setLocale(value).catch(error=>{
        message('语言保存失败：'+String(error?.message||error),'error');syncLanguage();
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
    extensionList.renderRowMenu([]);
    extensionList.setMenuKey(null);
    if(returnFocus){
      if(trigger?.isConnected)trigger.focus({preventScroll:true});
      else if(key)restoreRowFocus(key,'more');
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
      if(row.stateKnown!==false&&typeof sidebarTools.toggleEnabled==='function')
        add(row.enabled?'停用应用':'启用应用',event=>{
          if(pendingKey)return;
          // Dispatch under the originating trusted click, before any Promise
          // or await; the original Sidebar Host keeps package/epoch/draft authority.
          let result;
          try{result=sidebarTools.toggleEnabled(row.id,event);}
          catch(error){message((error?.code||'E_TOOL')+'：'+String(error?.message||error),'error');return;}
          pendingKey=row.key;draw();
          // Host false may mean an unsaved-draft confirmation is pending.
          // Only a true Host result AND a fresh matching persistent record earn success.
          void (async()=>{
            let outcome,operationError,readback=false;
            try{outcome=await result;}catch(error){
              operationError=error;
              if(!disposed)message((error?.code||'E_TOOL')+'：'+String(error?.message||error),'error');
            }
            try{readback=await refresh();}catch(error){operationError??=error;}
            pendingKey=null;
            if(disposed)return;
            const current=find(row.key);
            if(operationError)message((operationError?.code||'E_TOOL')+'：'+
              String(operationError?.message||operationError),'error');
            else if(outcome===true&&readback&&appStatusKnown&&current?.installed&&
              sameSidebarToolPackage(current.record,row.record)&&current.enabled===!row.enabled)
              message('已从本机安装记录确认应用'+(current.enabled?'启用':'停用')+'。','success');
            else if(outcome===false)
              message('启停尚未完成；如有未保存草稿，请先确认或取消，再核对应用状态。','error');
            else message('未从可信安装记录确认启停结果；请刷新后核对状态。','error');
            draw();
            if(selectedKey)renderDetail();
            else restoreRowFocus(row.key,'more');
          })();
        },'toggle');
      if(row.stateKnown!==false)
        add('设置与权限…',()=>{backIfNeeded();sidebarTools.openSettings(row.id);},'settings');
      if(row.update&&row.release)add('审阅新版…',()=>openReview(row.key),'update');
    }else if(row.kind==='page'){
      if(row.stateKnown!==false)add(installedPageEnableAction(row.record.installed).label,
        event=>{void togglePage(row,event);},'toggle');
      add('更新 / 导入新版…',()=>{backIfNeeded();sidebarTools.openImport();},'update');
      add('前往开发',()=>{if(taskWorkbench.navigate('develop')!==false)backIfNeeded();},'develop');
    }
    add('查看详情',()=>openDetail(key,'more'),'detail');
    if(row.stateKnown!==false)
      add('卸载…',event=>openListUninstallReview(row.key,event),'uninstall');
    extensionList.renderRowMenu(menuItems,{
      key,title:titleOf(row),trigger,onClose:closeRowMenu
    });
  }

  // List reviews pin the actual installed identity. The sole trusted Host
  // continues to own the app registry and Page Authority native deregistration.
  function syncListUninstallReview(){
    const review=listUninstallReview;
    extensionList.renderUninstall?.(review?{
      title:'卸载「'+review.title+'」？',
      text:review.kind==='page'
        ?'将停止该网页增强自动运行并移除本机安装记录；不会删除网站自己的数据。'
        :'将卸载该应用并清理其本地数据与网站授权；此操作不可撤销。',
      busy:Boolean(busy||pendingKey),
      identity:{key:review.key,kind:review.kind,version:review.kind==='page'
        ?find(review.key)?.version:review.package?.version},
      onCancel:cancelListUninstallReview,onConfirm:confirmListUninstallReview
    }:null);
  }
  function matchesListReview(row,review){
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
        message('安装授权身份不完整，不能卸载；请刷新后核对。','error');return;
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
      message('安装身份已变化，原卸载确认已失效；请刷新后重试。','error');return;
    }
    // Page uses the existing generation-bound native unregister + receipt
    // readback below. No alternate authority or duplicate removal sequence.
    if(review.kind==='page')return confirmPageUninstall(event);
    busy=true;pendingKey=review.key;draw();
    let outcome,operationError,readback=false;
    try{
      try{
        outcome=await sidebarTools.uninstallFromList(review.id,review.package,event);
      }catch(error){operationError=error;}
      try{readback=await refresh();}catch(error){operationError??=error;}
      if(disposed)return;
      if(operationError)message((operationError.code||'E_TOOL_UNINSTALL')+'：'+
        String(operationError.message||operationError)+
        '；不会自动重试。请核对已安装记录与清理恢复状态。','error');
      else if(outcome===true&&readback&&appStatusKnown&&!find(review.key)?.installed&&
        !pendingCleanups.has(review.id))
        message('已从本机安装记录读回确认卸载，数据与授权清理已完成。','success');
      else if(readback&&appStatusKnown&&!find(review.key)?.installed&&pendingCleanups.has(review.id))
        message('已从已安装列表移除，但清理未完成；可在「可安装 / 更新」中恢复清理。','error');
      else if(outcome===false)
        message('卸载尚未执行；如有未保存编辑请先处理，然后重新核对安装状态。','error');
      else message('卸载结果未完整确认；不会自动重试。请刷新后核对安装状态。','error');
    }finally{
      busy=false;pendingKey=null;listUninstallReview=null;
      if(!disposed){draw();if(selectedKey)renderDetail();else search?.focus?.({preventScroll:true});}
    }
  }

  function rowDescription(row){
    const reason=pendingKey===row.key?'处理中':row.cleanupPending?'卸载清理待恢复':
      !row.installed?(row.kind==='page'
        ?(row.release?.status==='blocked'?'暂不可安装：'+row.release.blockedReason:'可安装 · 待授权')
        :'可安装'):row.stateKnown===false?'状态待核对':
      row.kind==='page'&&row.record?.installed?.managedCleanup?.state==='unknown'?'受管界面清理待核对':
      row.kind==='page'&&row.record?.installed?.nativeState==='blocked'?'原生注册待恢复':
      row.kind==='page'&&row.record?.installed?.authorization?.status==='suspended'?'网站访问受限':
      row.enabled===false?'已停用':row.update?'可更新':
      row.kind==='page'&&row.record?.installed?.nativeState&&
        row.record.installed.nativeState!=='registered'?'注册待核对':'';
    return reason?reason+' · '+descriptionOf(row):descriptionOf(row);
  }
  function draw(){
    if(disposed)return;
    if(listUninstallReview&&!busy&&!pendingKey&&
      !matchesListReview(find(listUninstallReview.key),listUninstallReview)){
      listUninstallReview=null;uninstallReview=null;
      message('扩展安装身份已变化，原卸载确认已失效；请核对后重新点击。','error');
    }
    const active=doc.activeElement;
    const key=list.contains(active)?active?.dataset?.extensionKey:null;
    const action=active?.dataset?.extensionAction;
    const menuFocusKey=get('extension-center-row-menu')?.contains(active)?rowMenuKey:null;
    closeRowMenu();
    const rows=filterExtensionEntries(all().map(row=>({...row,title:titleOf(row),description:descriptionOf(row)})),{query,kind,scope});
    // A cleanup journal is not an installed app or a trusted Catalog release.
    // Show a recovery-only control in discovery even if the catalog is offline.
    const orphaned=scope==='available'&&appStatusKnown&&kind!=='page'?
      [...pendingCleanups].filter(id=>!official.some(release=>release.toolId===id)&&
        (!query||id.toLocaleLowerCase().replace(/[\s-]+/g,'').includes(
          query.toLocaleLowerCase().replace(/[\s-]+/g,''))||
          '卸载清理待恢复'.includes(query))):[];
    extensionList.renderRecoveries({
      ids:orphaned,busy:Boolean(busy||pendingKey),
      onRetry(id,event){void retryCleanup({id,key:'app:'+id,cleanupPending:true},event);}
    });
    extensionList.renderRows({
        rows:rows.map(row=>({
          key:row.key,title:titleOf(row),kind:row.kind,type:typeOf(row),
          description:rowDescription(row),installed:row.installed,stateKnown:row.stateKnown,
          primaryAction:resolveExtensionPrimaryAction(row)?.label||null
        })),
        busy:Boolean(busy||pendingKey),pendingKey,
        onOpenRow:openRow,onMore:showRowMenu
      });
    const showEmpty=rows.length===0&&orphaned.length===0&&hasLoaded;
    const emptyText=dataError?
      '安装状态读取失败或待核对；请刷新重试。不会将旧缓存当作已安装记录。':
      query?'没有找到匹配的扩展':scope==='available'?'没有可安装或可更新的官方候选':
      kind==='page'?'暂无已安装的网页增强':'还没有已安装扩展；请切换至「可安装 / 更新」发现官方工具。';
    const countText=!hasLoaded?'正在读取扩展…':
      dataError?'部分安装状态待核对':rows.length+' 个扩展';
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
      state:pageDiscovery.state,title:pageDiscovery.release?.packageTitle||pageDiscovery.title||'当前网页',
      version:pageDiscovery.subject?.version||null,origin:pageDiscovery.pageOrigin||null,
      message:pageDiscovery.message||'',busy:Boolean(pageDiscovery.busy),
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
        String(error?.message||'当前网页尚未准备好，请重新检测。')};
      renderPageDiscovery();return;
    }
    pageDiscovery={state:'loading',target,message:'正在核对当前网页的安装声明…'};renderPageDiscovery();
    try{
      const [channel,catalog]=await Promise.all([loadMarketChannel(api),loadOfficialCatalog({api})]);
      if(disposed||generation!==discoveryGeneration)return;
      const found=await discoverCurrentPageMarketInstall({
        api,currentPageTarget,channel,releases:catalog.apps,target
      });
      if(disposed||generation!==discoveryGeneration)return;
      pageDiscovery={...found,state:'found',
        message:'已匹配当前扩展内的官方固定发行。安装仍需在可信页面审阅确认。'};
    }catch(error){
      if(disposed||generation!==discoveryGeneration)return;
      // Preserve the captured document on every result (including empty/error).
      // The existing target subscription clears stale results after navigation.
      pageDiscovery=error?.code==='E_DISCOVERY_MISSING'
        ?{state:'empty',target,message:'此网页没有声明可安装的 OpenDesk 官方应用。你仍可从应用市场安装。'}
        :{state:'error',target,message:(error?.code||'E_DISCOVERY')+'：'+
          String(error?.message||'无法核验当前网页安装声明。')};
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
        throw Object.assign(new Error('当前网页的安装声明或官方发行已变化，请重新检测。'),{code:'E_DISCOVERY_CHANGED'});
      // Channel, page DOM and release bytes are all rechecked on the trusted
      // review gesture. Stale discoveries cannot open a different app.
      await currentPageTarget.revalidate(selected.target);
      if(disposed||generation!==discoveryGeneration||pageDiscovery?.subject!==selected.subject)return;
      // No untrusted URL reaches Chrome or the Installer. Existing trusted catalog owns review.
      await api.tabs.create({url:api.runtime.getURL('ui/marketplace.html')+
        '#/apps/'+selected.subject.marketId+'/versions/'+selected.subject.version});
      if(pageDiscovery?.subject===selected.subject)pageDiscovery={...selected,busy:false,
        message:'已打开可信应用详情。请在那里审阅并确认；此操作不代表安装成功。'};
    }catch(error){
      if(pageDiscovery?.subject===selected.subject)pageDiscovery={...selected,busy:false,
        message:(error?.code||'E_DISCOVERY_REVIEW')+'：'+String(error?.message||error)};
    }
    renderPageDiscovery();
  }
  function openMarket(release=null){
    const route=release?'#/apps/'+release.id+'/versions/'+release.version:'';
    void api.tabs.create({url:api.runtime.getURL('ui/marketplace.html')+route})
      .catch(error=>message('无法打开可信应用市场：'+String(error.message||error),'error'));
  }
  // The original trusted review owns installation; selecting never executes tool JS.
  function openReview(key){
    const row=find(key);if(!row||row.kind!=='app'||!row.release)return;
    if(row.cleanupPending){message('此应用卸载清理未完成，请先恢复清理，再重新审阅安装。','error');return;}
    backIfNeeded();
    if(!sidebarTools.openOfficialReview(row.id))openMarket(row.release);
  }
  function openPageReview(key){
    const row=find(key);
    if(!row||row.kind!=='page'||row.release?.status!=='available')return;
    backIfNeeded();
    if(sidebarTools.openOfficialPageReview?.(row.release)!==true)
      message('网页增强安装审阅暂不可用；请核对未保存编辑或安装器状态。','error');
  }
  // An installed, enabled, verified app may open; all other rows lead to details.
  function openRow(key){
    const row=find(key);if(disposed||!row||busy||pendingKey||(scope!=='available'&&!row.installed))return;
    if(resolveExtensionRowIntent(row)==='detail'){openDetail(key,'main');return;}
    if(resolveExtensionPrimaryAction(row)?.id==='open'){
      try{
        if(!sidebarTools.openTool(row.id))
          message('应用尚未打开；请处理未保存草稿或查看宿主提示后重试。','error');
      }catch(error){message((error?.code||'E_TOOL_OPEN')+'：'+String(error?.message||error),'error');}
    }
  }
  function openDetail(key,returnAction='main'){
    const row=find(key);if(disposed||!row||(scope!=='available'&&!row.installed))return;
    closeRowMenu();
    selectedInstalled=row.installed;uninstallReview=null;
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
  function back(){
    if(disposed)return;
    selectedKey=null;selectedInstalled=null;selectedIdentity=null;detailFocusAction=null;uninstallReview=null;
    extensionList.renderView('list');
    workspace?.scrollTo?.({top:listScroll});
    if(!restoreRowFocus(focusKey,focusAction))search.focus({preventScroll:true});
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
      if(row)message('扩展安装状态或固定身份已变化，已返回列表；请重新核对后操作。','info');
      return;
    }
    if(uninstallReview&&!samePageIdentity(row,uninstallReview)){
      uninstallReview=null;
      message('网页增强的安装身份或授权代数已变化；原卸载确认已失效，请重新审阅。','error');
    }
    const pendingReview=uninstallReview?.key===row.key?uninstallReview:null;
    const page=row.kind==='page'?row.record?.installed:null;
    const confirmation=pendingReview?{
      text:'卸载后将停止此网页增强自动运行，并从本机安装列表移除；不会自动删除网站自己的数据。',
      onConfirm:confirmPageUninstall,onCancel:cancelPageUninstall
    }:null;
    {
      // React solely owns extension-center-detail-body; keep the authoritative
      // verified identity check and all existing Host/permission routes above.
      const focused=detailFocusAction||doc.activeElement?.dataset?.ecDetailAction;
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
        if(!row.installed){
          if(row.cleanupPending)
            add('恢复卸载清理','cleanup',event=>{void retryCleanup(row,event);});
          else add('审阅并安装','install',()=>openReview(row.key));
        }else{
          if(row.stateKnown!==false)
            add('设置与权限','settings',()=>{backIfNeeded();sidebarTools.openSettings(row.id);});
          if(row.update&&row.release)add('审阅新版','update',()=>openReview(row.key));
        }
      }else if(row.kind==='page'&&!row.installed){
        if(row.release?.status==='available')add('审阅并安装','install',()=>openPageReview(row.key));
      }else if(row.installed&&!pendingReview){
        if(row.stateKnown!==false)
          add(installedPageEnableAction(row.record.installed).label,'toggle',
            event=>{void togglePage(row,event);});
        if(row.update&&row.release?.status==='available')
          add('审阅官方新版','update',()=>openPageReview(row.key));
        else add('更新 / 导入新版…','update',()=>{backIfNeeded();sidebarTools.openImport();});
        add('卸载网页增强…','uninstall',event=>openUninstallReview(row,event));
        add('前往开发','develop',()=>{if(taskWorkbench.navigate('develop')!==false)backIfNeeded();});
      }
      extensionList.renderDetail({
        key:row.key,title:titleOf(row),type:typeOf(row),kind:row.kind,
        description:rowDescription(row),actions,busy:Boolean(busy||pendingKey),
        focusAction:focused,
        installed:row.installed,cleanupPending:row.cleanupPending,
        version:row.version,source:sources[row.id]||null,
        usageText:row.kind==='app'&&row.installed?installedAppUsage(row):'',
        sites:page?.pageRules?.matches||(row.kind==='page'?row.release?.sites:[])||[],
        suspended:page?.authorization?.status==='suspended',
        confirmation,
        pageInfo:page?{
          source:'来源未记录',excluded:page.pageRules?.excludeMatches||[],
          capabilities:page.authorization?.scope?.capabilities||[],
          networkOrigins:page.authorization?.scope?.networkOrigins||[],
          authorization:page.authorization?.status||'未知',
          nativeState:page.nativeState||'未知',nativeId:page.nativeId||null,
          installationId:page.authorization?.installationId||null,
          sourceHash:page.sourceHash||null,
          cleanupState:page.managedCleanup?.state||null,
          error:page.error?.message||null,
          dataRule:'卸载撤销本机安装与受管网页界面；不自动删除网站自身存储或脚本已产生的数据。'
        }:null,
        appDataText:row.kind==='app'&&row.installed?
          '应用存储用量：未知（没有可信的单应用 Chrome 存储统计）。':'',
        installationText:row.installed?
          ('本机已安装 · '+(row.stateKnown===false?'状态待核对':
            row.kind==='page'&&row.enabled&&
              (page?.nativeState!=='registered'||page?.authorization?.status!=='active'||page?.error)
              ?'自动运行未就绪':row.enabled?'已启用':'已停用')):
          (row.cleanupPending?'已从安装记录移除 · 卸载清理待恢复':
            row.kind==='page'&&row.release?.status==='blocked'?
              '官方 Page 产品 · 尚未开放安装：'+row.release.blockedReason:
              '官方目录中的固定发行候选 · 尚未安装，需审阅权限')
      });
      return;
    }
  }
  function openUninstallReview(row,event){
    if(!event?.isTrusted||busy||pendingKey||row?.kind!=='page')return;
    if(selectedKey!==row.key)openDetail(row.key,'more');
    const identity=pageIdentity(find(row.key));
    if(!identity?.installationId||!Number.isSafeInteger(identity.expectedGeneration)){
      message('安装授权身份不完整，不能卸载；请先刷新核对真实 Page 安装记录。','error');return;
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
      message('卸载前安装身份已改变；原确认无效。请刷新后重新审阅。','error');return;
    }
    busy=true;pendingKey=expected.key;detailFocusAction=null;
    draw();if(selectedKey)renderDetail();
    let outcome,operationError,readback=false;
    try{
      try{
        outcome=await client.request('uninstallPageProgram',{
          programId:expected.programId,manifestHash:expected.manifestHash,
          installationId:expected.installationId,expectedGeneration:expected.expectedGeneration});
        if(outcome?.error)throw Object.assign(new Error(outcome.error.message||'卸载失败'),
          {code:outcome.error.code||'E_PAGE_UNINSTALL_PENDING'});
      }catch(error){operationError=error;}
      try{readback=await refresh();}catch(error){operationError??=error;}
      if(disposed)return;
      if(operationError)message((operationError.code||'E_PAGE_UNINSTALL_PENDING')+'：'+
        String(operationError.message||operationError)+
        '；未自动重试，请核对安装状态后主动重新操作。','error');
      else if(outcome?.uninstalled===true&&outcome.nativeState==='unregistered'&&
        outcome.manifestHash===expected.manifestHash&&
        outcome.installationId===expected.installationId&&
        (!outcome.managedCleanup||outcome.managedCleanup.state==='retired')&&
        readback&&pageStatusKnown&&!find(expected.key))
        message('已从 Page Authority 回执和持久安装列表确认卸载。已打开的网页可能仍有旧效果，请刷新网页。','success');
      else message('卸载结果未得到完整确认；不会自动重试，请刷新后核对原生注册及安装状态。','error');
    }finally{
      busy=false;pendingKey=null;uninstallReview=null;listUninstallReview=null;
      if(!disposed){draw();if(selectedKey)renderDetail();else if(!restoreRowFocus(expected.key,'more'))
        search?.focus?.({preventScroll:true});}
    }
  }
  async function togglePage(row,event){
    if(disposed||!event?.isTrusted||busy||pendingKey||row.kind!=='page')return;
    if(row.stateKnown===false)return;
    if(!samePageIdentity(find(row.key),pageIdentity(row))){
      message('网页增强状态已变化，请刷新后重试。','error');void refresh();return;
    }
    const targetEnabled=installedPageEnableAction(row.record.installed).enabled;
    const inDetail=selectedKey===row.key;
    detailFocusAction=inDetail?'toggle':null;
    busy=true;pendingKey=row.key;draw();if(inDetail)renderDetail();
    try{
      let result,operationError,readback=false;
      try{result=await setInstalledPageProgramEnabled({api,client,row:row.record});}
      catch(error){
        operationError=error;
        if(!disposed)message((error?.code||'E_PAGE_INSTALLATION')+'：'+
          String(error?.message||error),'error');
      }
      try{readback=await refresh();}catch(error){operationError??=error;}
      if(disposed)return;
      const current=find(row.key);
      if(operationError)
        message((operationError.code||'E_PAGE_INSTALLATION')+'：'+String(operationError.message||operationError),'error');
      else if(result===false||result==null||!readback||!pageStatusKnown||
        current?.record?.manifestHash!==row.record.manifestHash||current.enabled!==targetEnabled)
        message('网页增强操作尚未由 Page Authority 读回确认；请刷新后检查注册状态。','error');
      else if(targetEnabled&&(current.record.installed.nativeState!=='registered'||
        current.record.installed.authorization?.status!=='active'||current.record.installed.error))
        message('已确认启用设置，但 Chrome 原生注册状态仍待核对。','info');
      else if(!targetEnabled&&(current.record.installed.nativeState!=='disabled'||
        current.record.installed.authorization?.status!=='disabled'||
        current.record.installed.managedCleanup?.state==='unknown'||current.record.installed.error))
        message('已确认停用设置，但 Chrome 原生注销或受管清理仍待核对。','info');
      else message('已从 Page Authority 确认自动运行状态。','success');
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
      message('已从存储读回确认卸载清理完成；需要重新安装时请主动审阅。','success');
    else message('卸载清理尚未确认完成；请刷新后核对恢复状态。','error');
    draw();if(selectedKey)renderDetail();
  }
  async function refresh(){
    if(disposed)return false;
    const id=++sequence;
    const results=await Promise.allSettled([
      api.storage.local.get([SIDEBAR_TOOL_STORE,SIDEBAR_TOOL_ENABLE_STORE,MARKET_PROVENANCE_STORE,TOOL_CLEANUP_STORE]),
      client.request('listPagePrograms',{})
    ]);
    if(disposed||id!==sequence)return false;
    let errors=[];
    try{
      if(results[0].status!=='fulfilled')throw results[0].reason;
      const saved=results[0].value;
      const nextInstalled=requireCompleteInstalledSidebarTools(saved[SIDEBAR_TOOL_STORE]);
      const nextEnabled=requireToolEnableRecords(saved[SIDEBAR_TOOL_ENABLE_STORE]);
      const cleanups=requirePendingToolCleanups(saved[TOOL_CLEANUP_STORE]);
      const nextCleanups=new Set(Object.keys(cleanups));
      const nextSources=Object.fromEntries(await Promise.all(nextInstalled.map(async tool=>
        [tool.id,await describeInstalledAppSource(tool,saved[MARKET_PROVENANCE_STORE]?.[tool.id])])));
      if(disposed||id!==sequence)return false;
      installed=nextInstalled;enabled=nextEnabled;sources=nextSources;
      pendingCleanups=nextCleanups;appStatusKnown=true;
    }catch(error){
      // Do not advertise a previously cached registry as a current installation.
      installed=[];enabled={};sources={};pendingCleanups=new Set();appStatusKnown=false;
      errors.push('应用：'+String(error?.message||error));
    }
    try{
      if(results[1].status!=='fulfilled')throw results[1].reason;
      const response=results[1].value;
      if(!Array.isArray(response?.installed))throw new Error('Page 已安装清单响应格式无效');
      pages=response.installed;pageStatusKnown=true;
    }catch(error){pages=[];pageStatusKnown=false;errors.push('网页增强：'+String(error?.message||error));}
    dataError=errors.join('；');hasLoaded=true;
    if(dataError&&statusOrigin!=='action')
      message('读取失败，未核验的旧安装缓存已从列表撤下。'+dataError,'error','read');
    else if(statusOrigin==='read'||statusOrigin==='loading'||statusOrigin==='catalog')
      message(catalogError||pageCatalogError?'官方目录部分暂不可用：'+[catalogError,pageCatalogError].filter(Boolean).join('；'):'',
        catalogError||pageCatalogError?'error':'info',catalogError||pageCatalogError?'catalog':'read');
    draw();if(selectedKey)renderDetail();
    return !dataError;
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
      official=[];catalogError=String(error?.message||error);
      if(statusOrigin!=='action')message(
        '内置官方目录暂不可用，不会显示或安装未经核验的候选：'+catalogError,'error','catalog');
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
      officialPages=[];pageCatalogError=String(error?.message||error);
      if(statusOrigin!=='action')message('官方 Page 目录不可用；不会提供未经核验的安装候选：'+pageCatalogError,'error','catalog');
      draw();if(selectedKey)renderDetail();
    }
  }
  const syncLanguage=()=>{if(disposed)return;draw();if(selectedKey)renderDetail();};
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
  function backIfNeeded(){if(selectedKey)back();}
  const storageChanged=(changes,area)=>{
    if(area==='local'&&(SIDEBAR_TOOL_STORE in changes||SIDEBAR_TOOL_ENABLE_STORE in changes||MARKET_PROVENANCE_STORE in changes||
      TOOL_CLEANUP_STORE in changes||
      Object.keys(changes).some(key=>key.startsWith('opendesk.page'))))void refresh();
  };
  const pageInstallationChanged=()=>{void refresh();};
  const languageSettingsRequested=event=>openLanguageSettings(event.detail?.toolId);
  doc.addEventListener('opendesk-language-settings',languageSettingsRequested);
  doc.addEventListener('opendesk:page-installation-changed',pageInstallationChanged);
  api.storage.onChanged?.addListener(storageChanged);
  const connChanged=client.subscribeConnection?.(state=>{if(state.connected)void refresh();});
  message('正在读取已安装扩展与授权状态…','loading','loading');draw();
  void readDiscoveryChannel();void readOfficial();void readPageOfficial();void refresh();
  return {refresh,dispose(){if(disposed)return;disposed=true;sequence++;officialSequence++;pageOfficialSequence++;discoveryGeneration++;discoveryChannelGeneration++;
    listUninstallReview=null;uninstallReview=null;closeRowMenu();
    doc.removeEventListener('opendesk-language-settings',languageSettingsRequested);
    doc.removeEventListener('opendesk:page-installation-changed',pageInstallationChanged);
    api.storage.onChanged?.removeListener(storageChanged);connChanged?.();stopLanguage?.();stopPageDiscovery?.();},openLanguageSettings};
}
