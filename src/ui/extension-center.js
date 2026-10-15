import {SIDEBAR_TOOL_STORE} from './sidebar-tools/package.js';
import {requireCompleteInstalledSidebarTools,MARKET_PROVENANCE_STORE} from './sidebar-tools/installation.js';
import {SIDEBAR_TOOL_ENABLE_STORE,requireToolEnableRecords} from './sidebar-tools/lifecycle.js';
import {loadOfficialCatalog} from '../sidebar-tools/official-catalog.js';
import {setInstalledPageProgramEnabled} from './installed-page-tools.js';
import {composeExtensionEntries,filterExtensionEntries,describeInstalledAppSource} from './extension-center-model.js';

// One trusted presentation. All writes and launches delegate to the existing hosts.
export function createExtensionCenter({api,client,doc,sidebarTools,taskWorkbench}){
  const get=id=>doc.getElementById(id);
  const list=get('extension-center-list'),search=get('extension-center-search');
  const listing=get('extension-center-list-view'),detail=get('extension-center-detail');
  const more=get('extension-center-more'),menu=get('extension-center-menu');
  const notice=get('extension-center-status'),workspace=get('workspace-content');
  if(!list)return {refresh:async()=>{},dispose(){}};
  let disposed=false,sequence=0,busy=false,installed=[],pages=[],enabled={},official=[];
  let sources={};
  let catalogError='',dataError='',query='',kind='all',scope='smart',selectedKey=null;
  let listScroll=0,focusKey=null,focusAction=null,detailFocusAction=null;
  const node=(tag,cls='',value)=>{const element=doc.createElement(tag);if(cls)element.className=cls;
    if(value!==undefined)element.textContent=String(value);return element;};
  const button=(value,fn,cls='')=>{const b=node('button',cls,value);b.type='button';b.addEventListener('click',fn);return b;};
  const titleOf=row=>row.title||row.id;
  const typeOf=row=>row.kind==='page'?'网页增强':'应用';
  const all=()=>composeExtensionEntries({installed,pages,official,enabled});
  const find=key=>all().find(row=>row.key===key);
  const message=(value='',state='info')=>{notice.textContent=value;notice.dataset.state=state;};
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
    const target=[...list.querySelectorAll('button[data-extension-key]')]
      .find(b=>b.dataset.extensionKey===key&&b.dataset.extensionAction===action);
    target?.focus({preventScroll:true});
  };
  function draw(){
    if(disposed)return;
    const active=doc.activeElement;
    const key=list.contains(active)?active?.dataset?.extensionKey:null;
    const action=active?.dataset?.extensionAction;
    const rows=filterExtensionEntries(all(),{query,kind,scope});
    list.replaceChildren();
    for(const row of rows){
      const item=node('li','ec-row');item.dataset.extensionId=row.key;
      const glyph=node('span','ec-glyph');glyph.setAttribute('aria-hidden','true');
      glyph.textContent=row.kind==='page'?'◇':'▦';
      const copy=node('div','ec-copy'),line=node('div','ec-name-line');
      const name=button(titleOf(row),()=>openDetail(row.key),'ec-name');
      name.title=titleOf(row);
      name.dataset.extensionKey=row.key;name.dataset.extensionAction='detail';
      const type=node('span','ec-type',typeOf(row));
      const description=node('span','ec-description',row.installed?
        (row.enabled?row.description:'已停用 · '+row.description):row.description);
      line.append(name,type);copy.append(line,description);
      const actionName=!row.installed?'安装':row.kind==='page'?'管理':
        !row.enabled?'设置':'打开';
      const primary=button(actionName,()=>primaryAction(row.key),'ec-action');
      primary.dataset.extensionKey=row.key;primary.dataset.extensionAction='primary';
      primary.setAttribute('aria-label',actionName+'「'+titleOf(row)+'」');
      const manage=button('⋮',()=>openDetail(row.key),'ec-row-more');
      manage.dataset.extensionKey=row.key;manage.dataset.extensionAction='more';
      manage.setAttribute('aria-label','查看「'+titleOf(row)+'」管理详情');
      item.append(glyph,copy,primary,manage);list.append(item);
    }
    get('extension-center-empty').hidden=rows.length>0;
    get('extension-center-empty-text').textContent=dataError?
      '读取部分安装记录失败；请重试，原安装数据不会被修改。':
      query?'没有找到匹配的扩展':scope==='available'?'没有可安装的官方候选':
      kind==='page'?'暂无符合条件的网页增强':'还没有已安装扩展，可搜索官方目录或打开应用市场。';
    get('extension-center-count').textContent=rows.length+' 个扩展';
    syncFilters();
    if(key)restoreRowFocus(key,action);
  }
  function openMarket(release=null){
    const route=release?'#/apps/'+release.id+'/versions/'+release.version:'';
    void api.tabs.create({url:api.runtime.getURL('ui/marketplace.html')+route})
      .catch(error=>message('无法打开可信应用市场：'+String(error.message||error),'error'));
  }
  // The original trusted review owns installation; selecting never executes tool JS.
  function openReview(key){
    const row=find(key);if(!row||row.kind!=='app'||!row.release)return;
    backIfNeeded();
    if(!sidebarTools.openOfficialReview(row.id))openMarket(row.release);
  }
  function primaryAction(key){
    const row=find(key);if(!row||busy)return;
    if(!row.installed){openReview(key);return;}
    if(row.kind==='page'){openDetail(key);return;}
    if(!row.enabled){sidebarTools.openSettings(row.id);return;}
    // A newer release cannot hide or replace the runnable installed version.
    sidebarTools.openTool(row.id);
  }
  function openDetail(key){
    const row=find(key);if(!row)return;
    focusKey=key;focusAction=doc.activeElement?.dataset?.extensionAction||'detail';
    listScroll=workspace?.scrollTop||0;selectedKey=key;detailFocusAction=null;
    closeMenu();listing.hidden=true;detail.hidden=false;
    renderDetail();workspace?.scrollTo?.({top:0});
    get('extension-center-back')?.focus({preventScroll:true});
  }
  function back(){
    selectedKey=null;detailFocusAction=null;detail.hidden=true;listing.hidden=false;
    workspace?.scrollTo?.({top:listScroll});
    restoreRowFocus(focusKey,focusAction);
  }
  function renderDetail(){
    const row=find(selectedKey);
    if(!row){back();return;}
    const area=get('extension-center-detail-body'),focused=doc.activeElement?.dataset?.ecDetailAction||detailFocusAction;
    area.replaceChildren();
    const head=node('div','ec-detail-head'),glyph=node('span','ec-glyph');
    glyph.textContent=row.kind==='page'?'◇':'▦';glyph.setAttribute('aria-hidden','true');
    const copy=node('div','ec-detail-copy');
    copy.append(node('strong','',titleOf(row)),node('span','ec-type',typeOf(row)));
    head.append(glyph,copy);area.append(head,node('p','',row.description));
    const actions=node('div','ec-detail-actions');
    function detailButton(label,fn,action){
      const b=button(label,fn);b.dataset.ecDetailAction=action;b.disabled=busy;return b;
    }
    if(row.kind==='app'){
      if(!row.installed)actions.append(detailButton('审阅并安装',()=>openReview(row.key),'install'));
      else{
        if(row.enabled)actions.append(detailButton('打开应用',()=>{backIfNeeded();sidebarTools.openTool(row.id);},'open'));
        actions.append(detailButton('设置与权限',()=>{backIfNeeded();sidebarTools.openSettings(row.id);},'settings'));
        if(row.update&&row.release)actions.append(detailButton('审阅新版',()=>openReview(row.key),'update'));
      }
    }else if(row.installed){
      actions.append(detailButton(row.enabled?'停用自动运行':'启用自动运行',
        event=>togglePage(row,event),'toggle'));
      actions.append(detailButton('前往开发',()=>{if(taskWorkbench.navigate('develop')!==false)backIfNeeded();},'develop'));
    }
    area.append(actions);
    const meta=node('section','ec-detail-card');
    meta.append(node('h3','','安装与来源'));
    meta.append(node('p','',row.installed?'本机已安装 · '+(row.enabled?'已启用':'已停用'):'官方目录中的固定发行候选 · 尚未安装'));
    meta.append(node('p','',row.kind==='app'?'版本：v'+row.version:
      '修订：r'+row.version));
    if(row.kind==='app'){
      if(row.installed){
        const source=sources[row.id];
        meta.append(node('p','','来源：'+(source?.label||'暂未读取安装来源')));
        if(source?.sha256)meta.append(node('p','','固定包 SHA-256：'+source.sha256));
        meta.append(node('p','','设置不会自动运行应用。'));
      }else meta.append(node('p','','正式安装必须在现有应用市场审阅固定包和能力清单。'));
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
    if(!event.isTrusted||busy||row.kind!=='page')return;
    detailFocusAction='toggle';busy=true;renderDetail();
    try{
      await setInstalledPageProgramEnabled({api,client,row:row.record});
      message('已按原 Page 授权服务确认自动运行状态。','success');
      await refresh();
    }catch(error){message((error.code||'E_PAGE_INSTALLATION')+'：'+String(error.message||error),'error');}
    finally{busy=false;if(!disposed)renderDetail();}
  }
  async function refresh(){
    const id=++sequence;
    const results=await Promise.allSettled([
      api.storage.local.get([SIDEBAR_TOOL_STORE,SIDEBAR_TOOL_ENABLE_STORE,MARKET_PROVENANCE_STORE]),
      client.request('listPagePrograms',{})
    ]);
    if(disposed||id!==sequence)return;
    let errors=[];
    try{
      if(results[0].status!=='fulfilled')throw results[0].reason;
      const saved=results[0].value;
      const nextInstalled=requireCompleteInstalledSidebarTools(saved[SIDEBAR_TOOL_STORE]);
      const nextEnabled=requireToolEnableRecords(saved[SIDEBAR_TOOL_ENABLE_STORE]);
      const nextSources=Object.fromEntries(await Promise.all(nextInstalled.map(async tool=>
        [tool.id,await describeInstalledAppSource(tool,saved[MARKET_PROVENANCE_STORE]?.[tool.id])])));
      if(disposed||id!==sequence)return;
      installed=nextInstalled;enabled=nextEnabled;sources=nextSources;
    }catch(error){errors.push('应用：'+String(error?.message||error));}
    try{
      if(results[1].status!=='fulfilled')throw results[1].reason;
      const response=results[1].value;
      if(!Array.isArray(response?.catalog))throw new Error('Page 目录响应格式无效');
      pages=response.catalog;
    }catch(error){errors.push('网页增强：'+String(error?.message||error));}
    dataError=errors.join('；');
    if(dataError)message('读取失败，保留最近一次显示。'+dataError,'error');
    else if(notice.dataset.state==='error')message('');
    draw();if(selectedKey)renderDetail();
  }
  async function readOfficial(){
    try{const result=await loadOfficialCatalog({api});if(!disposed){official=result.apps;catalogError='';draw();}}
    catch(error){if(!disposed){catalogError=String(error?.message||error);
      message('内置官方目录暂不可用，不会显示或安装未经核验的候选：'+catalogError,'error');draw();}}
  }
  search.addEventListener('input',()=>{query=search.value.trim();draw();});
  more.addEventListener('click',()=>menu.hidden?showMenu():closeMenu());
  for(const b of menu.querySelectorAll('[data-ec-kind]'))b.addEventListener('click',()=>{kind=b.dataset.ecKind;draw();});
  for(const b of menu.querySelectorAll('[data-ec-scope]'))b.addEventListener('click',()=>{scope=b.dataset.ecScope;draw();});
  get('extension-center-reset').addEventListener('click',()=>{kind='all';scope='smart';draw();});
  get('extension-center-import').addEventListener('click',()=>{
    closeMenu();backIfNeeded();sidebarTools.openImport();get('sidebar-tool-file')?.focus({preventScroll:true});
  });
  get('extension-center-bookmarks').addEventListener('click',()=>{
    closeMenu();backIfNeeded();sidebarTools.openBookmarks();
  });
  get('extension-center-reload').addEventListener('click',()=>{
    closeMenu();void readOfficial();void refresh();
  });
  get('extension-center-market').addEventListener('click',()=>openMarket());
  get('extension-center-back').addEventListener('click',back);
  function backIfNeeded(){if(selectedKey)back();}
  const clickOutside=event=>{if(!menu.hidden&&!get('extension-center-menu-wrap').contains(event.target))closeMenu();};
  const keyDown=event=>{if(event.key==='Escape'){
    if(!menu.hidden){event.preventDefault();closeMenu(true);}
    else if(selectedKey&&!detail.hidden){event.preventDefault();back();}
  }};
  doc.addEventListener('click',clickOutside);doc.addEventListener('keydown',keyDown);
  const storageChanged=(changes,area)=>{
    if(area==='local'&&(SIDEBAR_TOOL_STORE in changes||SIDEBAR_TOOL_ENABLE_STORE in changes||MARKET_PROVENANCE_STORE in changes||
      Object.keys(changes).some(key=>key.startsWith('opendesk.page'))))void refresh();
  };
  api.storage.onChanged?.addListener(storageChanged);
  const connChanged=client.subscribeConnection?.(state=>{if(state.connected)void refresh();});
  void readOfficial();void refresh();
  return {refresh,dispose(){disposed=true;sequence++;doc.removeEventListener('click',clickOutside);
    doc.removeEventListener('keydown',keyDown);api.storage.onChanged?.removeListener(storageChanged);connChanged?.();}};
}
