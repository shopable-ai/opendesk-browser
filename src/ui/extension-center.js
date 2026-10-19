import {SIDEBAR_TOOL_STORE} from './sidebar-tools/package.js';
import {requireCompleteInstalledSidebarTools,requirePendingToolCleanups,MARKET_PROVENANCE_STORE,TOOL_CLEANUP_STORE,sameSidebarToolPackage} from './sidebar-tools/installation.js';
import {SIDEBAR_TOOL_ENABLE_STORE,requireToolEnableRecords} from './sidebar-tools/lifecycle.js';
import {loadOfficialCatalog} from '../sidebar-tools/official-catalog.js';
import {setInstalledPageProgramEnabled} from './installed-page-tools.js';
import {composeExtensionEntries,filterExtensionEntries,describeInstalledAppSource,resolveExtensionRowIntent,resolveExtensionPrimaryAction} from './extension-center-model.js';
import readingTocCatalog from '../reading-toc/locales.generated.js';
import {OFFICIAL_READING_TOC_RELEASE} from '../sidebar-tools/official-reading-toc.js';
import {uiMessage,resolveUiLocale} from './app-localization.js';

// One trusted presentation. All writes and launches delegate to the existing hosts.
export function createExtensionCenter({api,client,doc,sidebarTools,taskWorkbench,localeController=null,extensionList=null}){
  const get=id=>doc.getElementById(id);
  const list=get('extension-center-list'),search=get('extension-center-search');
  const more=get('extension-center-more'),workspace=get('workspace-content');
  if(!extensionList||extensionList.owner!=='extension-list'||list?.dataset.opendeskReactOwner!=='extension-list')
    throw new Error('E_REACT_LIST_OWNERSHIP');
  let disposed=false,sequence=0,officialSequence=0,busy=false,pendingKey=null,installed=[],pages=[],enabled={},official=[];
  let appStatusKnown=false,pageStatusKnown=false,pendingCleanups=new Set();
  let toolbarMenuOpen=false,searchText='';
  let sources={};
  let catalogError='',dataError='',statusOrigin='loading',hasLoaded=false,query='',kind='all',scope='smart',selectedKey=null,selectedInstalled=null;
  let listScroll=0,focusKey=null,focusAction=null,detailFocusAction=null,selectedIdentity=null;
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
  const typeOf=row=>row.kind==='page'?'网页增强':'应用';
  const all=()=>composeExtensionEntries({installed,pages,official:appStatusKnown?official:[],
    enabled,appStatusKnown,pageStatusKnown,cleanupPendingIds:[...pendingCleanups]});
  const find=key=>all().find(row=>row.key===key);
  const message=(value='',state='info',origin='action')=>{
    statusOrigin=origin;
    if(!disposed)extensionList.renderStatus({text:value,state});
  };
  function closeMenu(returnFocus=false){
    if(toolbarMenuOpen){toolbarMenuOpen=false;syncFilters();}
    if(returnFocus)more.focus({preventScroll:true});
  }
  function syncFilters(){
    extensionList.renderToolbar({
      query:searchText,kind,scope,menuOpen:toolbarMenuOpen,
      language:resolveUiLocale(language(),['zh-CN','en'],'zh-CN'),
      onSearch(value){if(disposed)return;searchText=value;query=value.trim();draw();},
      onMarket(){if(!disposed)openMarket();},
      onToggleMenu(){if(disposed)return;closeRowMenu();toolbarMenuOpen=!toolbarMenuOpen;syncFilters();},
      onCloseMenu:closeMenu,
      onKind(value){if(disposed)return;kind=value;draw();},
      onScope(value){if(disposed)return;scope=value;draw();},
      onReset(){if(disposed)return;kind='all';scope='smart';draw();},
      onImport(){if(disposed)return;closeMenu();backIfNeeded();sidebarTools.openImport();
        get('sidebar-tool-file')?.focus({preventScroll:true});},
      onReload(){if(disposed)return;closeMenu();message('正在刷新扩展…','loading','loading');
        void readOfficial();void refresh();},
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
        if(!event?.isTrusted||disposed||busy||pendingKey||find(row.key)?.record!==row.record)return;
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
        add('设置、权限与卸载…',()=>{backIfNeeded();sidebarTools.openSettings(row.id);},'settings');
      if(row.update&&row.release)add('审阅新版…',()=>openReview(row.key),'update');
    }else if(row.kind==='page'){
      if(row.stateKnown!==false)add(row.enabled?'停用自动运行':'启用自动运行',
        event=>{void togglePage(row,event);},'toggle');
      add('前往开发',()=>{if(taskWorkbench.navigate('develop')!==false)backIfNeeded();},'develop');
    }
    add('查看详情',()=>openDetail(key,'more'),'detail');
    extensionList.renderRowMenu(menuItems,{
      key,title:titleOf(row),trigger,onClose:closeRowMenu
    });
  }

  function rowDescription(row){
    const reason=pendingKey===row.key?'处理中':row.cleanupPending?'卸载清理待恢复':
      !row.installed?'可安装':row.stateKnown===false?'状态待核对':
      row.enabled===false?'已停用':row.update?'可更新':
      row.kind==='page'&&row.record?.installed?.authorization?.status==='suspended'?'网站访问受限':
      row.kind==='page'&&row.record?.installed?.nativeState&&
        row.record.installed.nativeState!=='registered'?'注册待核对':'';
    return reason?reason+' · '+descriptionOf(row):descriptionOf(row);
  }
  function draw(){
    if(disposed)return;
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
          description:rowDescription(row),installed:row.installed,
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
    if(!busy&&!pendingKey){
      if(key)restoreRowFocus(key,action);
      else if(menuFocusKey&&!restoreRowFocus(menuFocusKey,'more'))
        search.focus({preventScroll:true});
    }
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
    selectedInstalled=row.installed;
    // A detail belongs to one reviewed package/revision, not merely a reusable ID.
    // Enable/disable and Page authorization may change without replacing that identity.
    selectedIdentity=row.kind==='app'?
      (row.installed?{kind:'app-installed',package:structuredClone(row.record)}:
        {kind:'app-release',version:row.version,sha256:row.release?.sha256}):
      {kind:'page-installed',manifestHash:row.record?.manifestHash,
        revision:row.record?.installed?.revision,sourceHash:row.record?.installed?.sourceHash};
    focusKey=key;focusAction=returnAction;
    listScroll=workspace?.scrollTop||0;selectedKey=key;detailFocusAction=null;
    closeMenu();
    extensionList.renderView('detail');
    renderDetail();workspace?.scrollTo?.({top:0});
    get('extension-center-back')?.focus({preventScroll:true});
  }
  function back(){
    if(disposed)return;
    selectedKey=null;selectedInstalled=null;selectedIdentity=null;detailFocusAction=null;
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
        (selectedIdentity?.kind!=='page-installed'||
          row.record?.manifestHash!==selectedIdentity.manifestHash||
          row.record?.installed?.revision!==selectedIdentity.revision||
          row.record?.installed?.sourceHash!==selectedIdentity.sourceHash)
    ));
    if(!row||row.installed!==selectedInstalled||identityChanged){
      back();
      if(row)message('扩展安装状态或固定身份已变化，已返回列表；请重新核对后操作。','info');
      return;
    }
    {
      // React solely owns extension-center-detail-body; keep the authoritative
      // verified identity check and all existing Host/permission routes above.
      const focused=doc.activeElement?.dataset?.ecDetailAction||detailFocusAction;
      const actions=[];
      const identity=selectedIdentity;
      const add=(label,id,onClick)=>actions.push({label,id,onClick(event){
        const current=find(row.key);
        if(disposed||busy||pendingKey||selectedIdentity!==identity||
          current?.record!==row.record||current?.release!==row.release)return;
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
      }else if(row.installed){
        if(row.stateKnown!==false)
          add(row.enabled?'停用自动运行':'启用自动运行','toggle',
            event=>{void togglePage(row,event);});
        add('前往开发','develop',()=>{if(taskWorkbench.navigate('develop')!==false)backIfNeeded();});
      }
      extensionList.renderDetail({
        key:row.key,title:titleOf(row),type:typeOf(row),kind:row.kind,
        description:rowDescription(row),actions,busy:Boolean(busy||pendingKey),
        focusAction:focused,
        installed:row.installed,cleanupPending:row.cleanupPending,
        version:row.version,source:sources[row.id]||null,
        usageText:row.kind==='app'&&row.installed?installedAppUsage(row):'',
        sites:row.kind==='page'?(row.record?.installed?.pageRules?.matches||[]):[],
        suspended:row.kind==='page'&&row.record?.installed?.authorization?.status==='suspended',
        installationText:row.installed?
          ('本机已安装 · '+(row.stateKnown===false?'状态待核对':row.enabled?'已启用':'已停用')):
          (row.cleanupPending?'已从安装记录移除 · 卸载清理待恢复':
            '官方目录中的固定发行候选 · 尚未安装')
      });
      return;
    }
  }
  async function togglePage(row,event){
    if(disposed||!event?.isTrusted||busy||pendingKey||row.kind!=='page')return;
    if(row.stateKnown===false)return;
    if(find(row.key)?.record!==row.record){
      message('网页增强状态已变化，请刷新后重试。','error');void refresh();return;
    }
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
        current?.record?.manifestHash!==row.record.manifestHash||current.enabled!==!row.enabled)
        message('网页增强操作尚未由 Page Authority 读回确认；请刷新后检查注册状态。','error');
      else if(current.enabled&&current.record.installed.nativeState!=='registered')
        message('已确认启用设置，但 Chrome 原生注册状态仍待核对。','info');
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
      if(!Array.isArray(response?.catalog))throw new Error('Page 目录响应格式无效');
      pages=response.catalog;pageStatusKnown=true;
    }catch(error){pages=[];pageStatusKnown=false;errors.push('网页增强：'+String(error?.message||error));}
    dataError=errors.join('；');hasLoaded=true;
    if(dataError&&statusOrigin!=='action')
      message('读取失败，未核验的旧安装缓存已从列表撤下。'+dataError,'error','read');
    else if(statusOrigin==='read'||statusOrigin==='loading'||statusOrigin==='catalog')
      message(catalogError?'官方目录暂不可用：'+catalogError:'',
        catalogError?'error':'info',catalogError?'catalog':'read');
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
  const syncLanguage=()=>{if(disposed)return;draw();if(selectedKey)renderDetail();};
  const stopLanguage=localeController?.subscribe?.(syncLanguage);
  void localeController?.ready?.then(syncLanguage);
  extensionList.connectBack(back);
  function backIfNeeded(){if(selectedKey)back();}
  const storageChanged=(changes,area)=>{
    if(area==='local'&&(SIDEBAR_TOOL_STORE in changes||SIDEBAR_TOOL_ENABLE_STORE in changes||MARKET_PROVENANCE_STORE in changes||
      TOOL_CLEANUP_STORE in changes||
      Object.keys(changes).some(key=>key.startsWith('opendesk.page'))))void refresh();
  };
  const pageInstallationChanged=()=>{void refresh();};
  doc.addEventListener('opendesk:page-installation-changed',pageInstallationChanged);
  api.storage.onChanged?.addListener(storageChanged);
  const connChanged=client.subscribeConnection?.(state=>{if(state.connected)void refresh();});
  message('正在读取已安装扩展与授权状态…','loading','loading');draw();
  void readOfficial();void refresh();
  return {refresh,dispose(){if(disposed)return;disposed=true;sequence++;officialSequence++;closeRowMenu();
    doc.removeEventListener('opendesk:page-installation-changed',pageInstallationChanged);
    api.storage.onChanged?.removeListener(storageChanged);connChanged?.();stopLanguage?.();}};
}
