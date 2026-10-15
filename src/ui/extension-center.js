import {SIDEBAR_TOOL_STORE} from './sidebar-tools/package.js';
import {requireCompleteInstalledSidebarTools,MARKET_PROVENANCE_STORE,TOOL_CLEANUP_STORE,sameSidebarToolPackage} from './sidebar-tools/installation.js';
import {SIDEBAR_TOOL_ENABLE_STORE,requireToolEnableRecords} from './sidebar-tools/lifecycle.js';
import {loadOfficialCatalog} from '../sidebar-tools/official-catalog.js';
import {setInstalledPageProgramEnabled} from './installed-page-tools.js';
import {composeExtensionEntries,filterExtensionEntries,describeInstalledAppSource,resolveExtensionRowIntent,resolveExtensionPrimaryAction} from './extension-center-model.js';
import readingTocCatalog from '../reading-toc/locales.generated.js';
import {uiMessage,resolveUiLocale} from './app-localization.js';

// One trusted presentation. All writes and launches delegate to the existing hosts.
export function createExtensionCenter({api,client,doc,sidebarTools,taskWorkbench,localeController=null}){
  const get=id=>doc.getElementById(id);
  const list=get('extension-center-list'),search=get('extension-center-search');
  const listing=get('extension-center-list-view'),detail=get('extension-center-detail');
  const more=get('extension-center-more'),menu=get('extension-center-menu');
  const notice=get('extension-center-status'),workspace=get('workspace-content');
  if(!list)return {refresh:async()=>{},dispose(){}};
  let disposed=false,sequence=0,officialSequence=0,busy=false,pendingKey=null,installed=[],pages=[],enabled={},official=[];
  let appStatusKnown=false,pageStatusKnown=false,pendingCleanups=new Set();
  let sources={};
  let catalogError='',dataError='',statusOrigin='loading',hasLoaded=false,query='',kind='all',scope='smart',selectedKey=null,selectedInstalled=null;
  let listScroll=0,focusKey=null,focusAction=null,detailFocusAction=null,selectedIdentity=null;
  const node=(tag,cls='',value)=>{const element=doc.createElement(tag);if(cls)element.className=cls;
    if(value!==undefined)element.textContent=String(value);return element;};
  const button=(value,fn,cls='')=>{const b=node('button',cls,value);b.type='button';b.addEventListener('click',fn);return b;};
  const language=()=>localeController?.getLocale?.()||'zh-CN';
  const readingTocOfficial=row=>row.kind==='app'&&row.id==='reading-toc'&&
    row.title===readingTocCatalog.messages['zh-CN'].title&&
    row.release?.toolId==='reading-toc'&&
    (!row.installed||(
      sources[row.id]?.sha256===row.release.sha256&&row.version===row.release.version
    ));
  const titleOf=row=>readingTocOfficial(row)?uiMessage(readingTocCatalog,language(),'title'):row.title||row.id;
  const descriptionOf=row=>readingTocOfficial(row)&&
    row.description===readingTocCatalog.messages['zh-CN'].description?
      uiMessage(readingTocCatalog,language(),'description'):row.description||'';
  const typeOf=row=>row.kind==='page'?'网页增强':'应用';
  const all=()=>composeExtensionEntries({installed,pages,official:appStatusKnown?official:[],
    enabled,appStatusKnown,pageStatusKnown,cleanupPendingIds:[...pendingCleanups]});
  const find=key=>all().find(row=>row.key===key);
  const message=(value='',state='info',origin='action')=>{
    statusOrigin=origin;notice.textContent=value;notice.dataset.state=state;
  };
  function closeMenu(returnFocus=false){menu.hidden=true;more.setAttribute('aria-expanded','false');if(returnFocus)more.focus({preventScroll:true});}
  function showMenu(){menu.hidden=false;more.setAttribute('aria-expanded','true');}
  function syncFilters(){
    for(const b of menu.querySelectorAll('button[data-ec-kind]'))
      b.setAttribute('aria-pressed',String(b.dataset.ecKind===kind));
    for(const b of menu.querySelectorAll('button[data-ec-scope]'))
      b.setAttribute('aria-pressed',String(b.dataset.ecScope===scope));
    more.dataset.active=String(kind!=='all'||scope!=='smart');
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
  const rowMenu=node('div','ec-context-menu');
  rowMenu.id='extension-center-row-menu';rowMenu.setAttribute('role','menu');rowMenu.hidden=true;
  doc.body.append(rowMenu);
  let rowMenuKey=null,rowMenuTrigger=null;
  function closeRowMenu(returnFocus=false){
    const key=rowMenuKey,trigger=rowMenuTrigger;
    rowMenu.hidden=true;rowMenu.replaceChildren();rowMenuKey=null;rowMenuTrigger=null;
    trigger?.setAttribute('aria-expanded','false');
    if(returnFocus){
      if(trigger?.isConnected)trigger.focus({preventScroll:true});
      else if(key)restoreRowFocus(key,'more');
    }
  }
  function showRowMenu(key,trigger){
    if(busy||pendingKey||disposed)return;
    if(!rowMenu.hidden&&rowMenuKey===key){closeRowMenu(true);return;}
    const row=find(key);if(!row?.installed)return;
    closeRowMenu();closeMenu();
    rowMenuKey=key;rowMenuTrigger=trigger;
    trigger.setAttribute('aria-expanded','true');
    rowMenu.setAttribute('aria-label','管理「'+titleOf(row)+'」');
    const add=(label,fn,actionId)=>{
      const b=button(label,event=>{
        if(!event.isTrusted||busy)return;
        closeRowMenu(true);fn(event);
      },'ec-context-action');
      b.dataset.ecContextAction=actionId;b.setAttribute('role','menuitem');
      rowMenu.append(b);
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
    rowMenu.hidden=false;
    // Fixed positioning escapes the clipped list and fits inside the Side Panel.
    const rect=trigger.getBoundingClientRect();
    const view=doc.defaultView,screenW=view?.innerWidth||doc.documentElement.clientWidth;
    const screenH=view?.innerHeight||doc.documentElement.clientHeight;
    const width=rowMenu.offsetWidth,height=rowMenu.offsetHeight,gutter=8;
    rowMenu.style.left=Math.max(gutter,Math.min(rect.right-width,screenW-width-gutter))+'px';
    rowMenu.style.top=(rect.bottom+height+gutter<=screenH?rect.bottom+3:
      Math.max(gutter,rect.top-height-3))+'px';
    rowMenu.querySelector('button')?.focus({preventScroll:true});
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
    const menuFocusKey=!rowMenu.hidden&&rowMenu.contains(active)?rowMenuKey:null;
    closeRowMenu();
    const rows=filterExtensionEntries(all().map(row=>({...row,title:titleOf(row),description:descriptionOf(row)})),{query,kind,scope});
    list.setAttribute('aria-busy',String(Boolean(busy||pendingKey)));
    list.replaceChildren();
    // A cleanup journal is not an installed app or a trusted Catalog release.
    // Show a recovery-only control in discovery even if the catalog is offline.
    const recovery=get('extension-center-cleanups');
    const orphaned=scope==='available'&&appStatusKnown&&kind!=='page'?
      [...pendingCleanups].filter(id=>!official.some(release=>release.toolId===id)&&
        (!query||id.toLocaleLowerCase().replace(/[\s-]+/g,'').includes(
          query.toLocaleLowerCase().replace(/[\s-]+/g,''))||
          '卸载清理待恢复'.includes(query))):[];
    if(recovery){
      recovery.hidden=orphaned.length===0;
      recovery.replaceChildren();
      if(orphaned.length){
        recovery.append(node('p','','以下扩展已从安装记录移除，但清理仍待完成：'));
        for(const id of orphaned){
          const line=node('p','',id+' · 卸载清理待恢复');
          const retry=button('恢复清理',event=>{
            void retryCleanup({id,key:'app:'+id,cleanupPending:true},event);
          },'od-button od-button--secondary');
          retry.disabled=busy||Boolean(pendingKey);
          retry.setAttribute('aria-label','恢复「'+id+'」的卸载清理');
          line.append(retry);recovery.append(line);
        }
      }
    }
    for(const row of rows){
      const item=node('li','ec-row');item.dataset.extensionId=row.key;
      const primaryAction=resolveExtensionPrimaryAction(row);
      if(primaryAction)item.classList.add('ec-row--has-primary');
      const rowBusy=busy||Boolean(pendingKey);
      if(busy||pendingKey===row.key)item.setAttribute('aria-busy','true');
      // The full row and explicit primary button share one handler.
      const main=button('',()=>openRow(row.key),'ec-row-main');
      main.dataset.extensionKey=row.key;main.dataset.extensionAction='main';
      main.disabled=rowBusy;
      main.setAttribute('aria-label',(primaryAction?.label||'查看详情')+'「'+titleOf(row)+'」');
      main.title=main.getAttribute('aria-label');
      const glyph=node('span','ec-glyph');glyph.setAttribute('aria-hidden','true');
      glyph.textContent=row.kind==='page'?'◇':'▦';
      const copy=node('span','ec-copy'),line=node('span','ec-name-line');
      const name=node('span','ec-name');
      name.append(node('span','ec-name-text',titleOf(row)));
      name.title=titleOf(row);
      const type=node('span','ec-type',typeOf(row));
      const description=node('span','ec-description',rowDescription(row));
      line.append(name,type);copy.append(line,description);
      description.title=description.textContent;
      main.append(glyph,copy);
      const actions=node('span','ec-row-actions');
      if(primaryAction){
        const primary=button(primaryAction.label,()=>openRow(row.key),
          'ec-action od-button od-button--secondary');
        primary.dataset.extensionKey=row.key;primary.dataset.extensionAction='primary';
        primary.setAttribute('aria-label',primaryAction.label+'「'+titleOf(row)+'」');
        primary.title=primary.getAttribute('aria-label');primary.disabled=rowBusy;
        actions.append(primary);
      }
      if(row.installed){
        const manage=button('⋮',event=>showRowMenu(row.key,event.currentTarget),
          'ec-row-more od-icon-button');
        manage.dataset.extensionKey=row.key;manage.dataset.extensionAction='more';
        manage.setAttribute('aria-label','管理「'+titleOf(row)+'」');
        manage.setAttribute('aria-haspopup','menu');manage.setAttribute('aria-expanded','false');
        manage.setAttribute('aria-controls',rowMenu.id);
        manage.title=manage.getAttribute('aria-label');manage.disabled=rowBusy;
        actions.append(manage);
      }
      if(!actions.childElementCount)item.classList.add('ec-row--no-actions');
      item.append(main,actions);list.append(item);
    }
    get('extension-center-empty').hidden=rows.length>0||orphaned.length>0||!hasLoaded;
    get('extension-center-empty-text').textContent=dataError?
      '安装状态读取失败或待核对；请刷新重试。不会将旧缓存当作已安装记录。':
      query?'没有找到匹配的扩展':scope==='available'?'没有可安装或可更新的官方候选':
      kind==='page'?'暂无已安装的网页增强':'还没有已安装扩展；请切换至「可安装 / 更新」发现官方工具。';
    get('extension-center-count').textContent=!hasLoaded?'正在读取扩展…':
      dataError?'部分安装状态待核对':rows.length+' 个扩展';
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
    const row=find(key);if(!row||busy||pendingKey||(scope!=='available'&&!row.installed))return;
    if(resolveExtensionRowIntent(row)==='detail'){openDetail(key,'main');return;}
    if(resolveExtensionPrimaryAction(row)?.id==='open'){
      try{
        if(!sidebarTools.openTool(row.id))
          message('应用尚未打开；请处理未保存草稿或查看宿主提示后重试。','error');
      }catch(error){message((error?.code||'E_TOOL_OPEN')+'：'+String(error?.message||error),'error');}
    }
  }
  function openDetail(key,returnAction='main'){
    const row=find(key);if(!row||(scope!=='available'&&!row.installed))return;
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
    closeMenu();listing.hidden=true;detail.hidden=false;
    renderDetail();workspace?.scrollTo?.({top:0});
    get('extension-center-back')?.focus({preventScroll:true});
  }
  function back(){
    selectedKey=null;selectedInstalled=null;selectedIdentity=null;detailFocusAction=null;detail.hidden=true;listing.hidden=false;
    workspace?.scrollTo?.({top:listScroll});
    if(!restoreRowFocus(focusKey,focusAction))search.focus({preventScroll:true});
  }
  function renderDetail(){
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
    const area=get('extension-center-detail-body'),focused=doc.activeElement?.dataset?.ecDetailAction||detailFocusAction;
    area.replaceChildren();
    const head=node('div','ec-detail-head'),glyph=node('span','ec-glyph');
    glyph.textContent=row.kind==='page'?'◇':'▦';glyph.setAttribute('aria-hidden','true');
    const copy=node('div','ec-detail-copy');
    copy.append(node('strong','',titleOf(row)),node('span','ec-type',typeOf(row)));
    head.append(glyph,copy);area.append(head,node('p','',rowDescription(row)));
    const actions=node('div','ec-detail-actions');
    function detailButton(label,fn,action){
      const b=button(label,fn,'od-button od-button--secondary');
      b.dataset.ecDetailAction=action;b.disabled=busy||Boolean(pendingKey);return b;
    }
    if(row.kind==='app'){
      if(!row.installed){
        if(row.cleanupPending)
          actions.append(detailButton('恢复卸载清理',event=>{void retryCleanup(row,event);},'cleanup'));
        else actions.append(detailButton('审阅并安装',()=>openReview(row.key),'install'));
      }else{
        if(row.stateKnown!==false)
          actions.append(detailButton('设置与权限',()=>{backIfNeeded();sidebarTools.openSettings(row.id);},'settings'));
        if(row.update&&row.release)actions.append(detailButton('审阅新版',()=>openReview(row.key),'update'));
      }
    }else if(row.installed){
      if(row.stateKnown!==false)actions.append(detailButton(row.enabled?'停用自动运行':'启用自动运行',
        event=>togglePage(row,event),'toggle'));
      actions.append(detailButton('前往开发',()=>{if(taskWorkbench.navigate('develop')!==false)backIfNeeded();},'develop'));
    }
    area.append(actions);
    const meta=node('section','ec-detail-card');
    meta.append(node('h3','','安装与来源'));
    meta.append(node('p','',row.installed?'本机已安装 · '+(row.stateKnown===false?'状态待核对':row.enabled?'已启用':'已停用'):
      row.cleanupPending?'已从安装记录移除 · 卸载清理待恢复':'官方目录中的固定发行候选 · 尚未安装'));
    meta.append(node('p','',row.kind==='app'?'版本：v'+row.version:
      '修订：r'+row.version));
    if(row.kind==='app'){
      if(row.installed){
        const source=sources[row.id];
        meta.append(node('p','','来源：'+(source?.label||'暂未读取安装来源')));
        if(source?.sha256)meta.append(node('p','','固定包 SHA-256：'+source.sha256));
        meta.append(node('p','','设置不会自动运行应用。'));
      }else meta.append(node('p','',row.cleanupPending?
        '请先恢复上次卸载的数据与权限清理，不会自动重新安装。':
        '正式安装必须在现有应用市场审阅固定包和能力清单。'));
    }else{
      const installedPage=row.record.installed;
      const sites=node('section','ec-detail-card');
      sites.append(node('h3','','网站范围与授权'));
      const matches=installedPage.pageRules?.matches||[];
      const ul=node('ul','ec-sites');
      for(const pattern of matches)ul.append(node('li','',pattern));
      sites.append(ul,node('p','',installedPage.authorization?.status==='suspended'?
        '网站访问受限；需要按照原授权规则重新授权。':
        '启用时仅按现有固定网站规则申请必要权限，不扩大安装范围。'));
      area.append(meta,sites);
      if(focused&&!busy)area.querySelector('[data-ec-detail-action="'+focused+'"]')?.focus({preventScroll:true});
      return;
    }
    area.append(meta);
    if(focused&&!busy)area.querySelector('[data-ec-detail-action="'+focused+'"]')?.focus({preventScroll:true});
  }
  async function togglePage(row,event){
    if(!event.isTrusted||busy||pendingKey||row.kind!=='page')return;
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
    if(!event?.isTrusted||busy||pendingKey||!row.cleanupPending||
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
      const cleanups=saved[TOOL_CLEANUP_STORE];
      if(cleanups!==undefined&&(!cleanups||typeof cleanups!=='object'||Array.isArray(cleanups)))
        throw new Error('卸载恢复记录结构异常');
      const nextCleanups=new Set(Object.entries(cleanups||{}).filter(([,row])=>
        row&&typeof row==='object'&&/^\d+\.\d+\.\d+$/.test(row.version)).map(([toolId])=>toolId));
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
  const languageInput=get('extension-center-language');
  const syncLanguage=()=>{if(disposed)return;
    if(languageInput)languageInput.value=resolveUiLocale(language(),['zh-CN','en'],'zh-CN');
    draw();if(selectedKey)renderDetail();
  };
  const stopLanguage=localeController?.subscribe?.(syncLanguage);
  void localeController?.ready?.then(syncLanguage);
  languageInput?.addEventListener('change',()=>{
    void localeController?.setLocale(languageInput.value).catch(error=>{
      message('语言保存失败：'+String(error?.message||error),'error');syncLanguage();
    });
  });
  search.addEventListener('input',()=>{query=search.value.trim();draw();});
  more.addEventListener('click',()=>{closeRowMenu();menu.hidden?showMenu():closeMenu();});
  for(const b of menu.querySelectorAll('[data-ec-kind]'))b.addEventListener('click',()=>{kind=b.dataset.ecKind;draw();});
  for(const b of menu.querySelectorAll('[data-ec-scope]'))b.addEventListener('click',()=>{scope=b.dataset.ecScope;draw();});
  get('extension-center-reset').addEventListener('click',()=>{kind='all';scope='smart';draw();});
  get('extension-center-import').addEventListener('click',()=>{
    closeMenu();backIfNeeded();sidebarTools.openImport();get('sidebar-tool-file')?.focus({preventScroll:true});
  });
  get('extension-center-reload').addEventListener('click',()=>{
    closeMenu();message('正在刷新扩展…','loading','loading');void readOfficial();void refresh();
  });
  get('extension-center-market').addEventListener('click',()=>openMarket());
  get('extension-center-back').addEventListener('click',back);
  function backIfNeeded(){if(selectedKey)back();}
  const clickOutside=event=>{
    if(!menu.hidden&&!get('extension-center-menu-wrap').contains(event.target))closeMenu();
    if(!rowMenu.hidden&&!rowMenu.contains(event.target)&&
       !rowMenuTrigger?.contains(event.target))closeRowMenu();
  };
  const keyDown=event=>{
    if(!rowMenu.hidden){
      if(event.key==='Escape'){event.preventDefault();closeRowMenu(true);return;}
      if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
        event.preventDefault();
        const buttons=[...rowMenu.querySelectorAll('button')],index=buttons.indexOf(doc.activeElement);
        const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:
          (index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;
        buttons[next]?.focus({preventScroll:true});return;
      }
      if(event.key==='Tab')closeRowMenu();
    }
    if(event.key==='Escape'){
      if(!menu.hidden){event.preventDefault();closeMenu(true);}
      else if(selectedKey&&!detail.hidden){event.preventDefault();back();}
    }
  };
  const onScroll=()=>{if(!rowMenu.hidden)closeRowMenu();};
  doc.addEventListener('click',clickOutside);doc.addEventListener('keydown',keyDown);
  doc.addEventListener('scroll',onScroll,true);
  const storageChanged=(changes,area)=>{
    if(area==='local'&&(SIDEBAR_TOOL_STORE in changes||SIDEBAR_TOOL_ENABLE_STORE in changes||MARKET_PROVENANCE_STORE in changes||
      TOOL_CLEANUP_STORE in changes||
      Object.keys(changes).some(key=>key.startsWith('opendesk.page'))))void refresh();
  };
  api.storage.onChanged?.addListener(storageChanged);
  const connChanged=client.subscribeConnection?.(state=>{if(state.connected)void refresh();});
  message('正在读取已安装扩展与授权状态…','loading','loading');draw();
  void readOfficial();void refresh();
  return {refresh,dispose(){disposed=true;sequence++;officialSequence++;closeRowMenu();rowMenu.remove();
    doc.removeEventListener('click',clickOutside);
    doc.removeEventListener('keydown',keyDown);doc.removeEventListener('scroll',onScroll,true);
    api.storage.onChanged?.removeListener(storageChanged);connChanged?.();stopLanguage?.();}};
}
