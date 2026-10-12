import {OFFICIAL_COLLECTIONS,officialMarketApps,getOfficialCollection} from './catalog.js';
import {loadOfficialCatalog,loadOfficialTool,verifyReviewedOfficialTool} from '../sidebar-tools/official-catalog.js';
import {validateSidebarToolPackage, SIDEBAR_TOOL_STORE,SIDEBAR_TOOL_DATA_PREFIX,MAX_INSTALLED_TOOLS} from '../ui/sidebar-tools/package.js';
import {readSidebarStorageUsage} from '../ui/sidebar-tools/storage-usage.js';
import {admittedSidebarToolPackages,sameSidebarToolPackage,compareToolVersions,
  installReviewedSidebarTool,recoverMarketOperation,retryUninstalledToolCleanup,
  requireCompleteInstalledSidebarTools,
  TOOL_CLEANUP_STORE,MARKET_OPERATIONS_STORE,MARKET_PROVENANCE_STORE} from '../ui/sidebar-tools/installation.js';
import {toolPageHref} from '../ui/sidebar-tools/navigation.js';
import {MARKET_INTENTS_STORE,loadReviewIntent,marketSubjectRoute,consumeReviewIntent,settleReviewIntent,closeUnjournaledReview} from './intent.js';
import {MARKET_BATCH_STORE,readMarketBatch,createMarketBatch,marketBatchUnresolved,
  reconcileQueuedAfterInterruption,withMarketBatchLock} from './batch.js';

const MY_COLLECTIONS_STORE='opendesk.market.collections.v1';
const TRANSFER_FORMAT='opendesk.market.transfer.v1';
const idPattern=/^[a-z][a-z0-9-]{1,39}$/;
const CAPABILITY_NAMES={
  'storage.local':'保存该工具的本机数据','currentPage.read':'读取用户当前网页的标题和地址',
  'tasks.open':'打开已安装任务','page.toc':'按网站授权读取标题目录',
  'page.clip':'按网站授权读取正文或选区','user.export':'复制内容或下载文件',
  'page.capture':'授权后在 ChatGPT 页面提供保存按钮',
  'knowledge.store':'管理本机知识收件箱',
  'time.review':'明确开始后在后台记录聚焦、非空闲网站的域名与时长（仅本机）'
};
const capabilityNames=values=>values.map(value=>CAPABILITY_NAMES[value]||value).join('；')||'无';
const BATCH_STATUS_NAMES={ready:'可安装',reviewed:'已审阅，待核对',skip:'已安装，跳过',blocked:'需要处理',queued:'等待安装',
  committing:'正在提交',succeeded:'安装完成',failed:'安装失败',cancelled:'已取消',
  interrupted:'已中断，未重新提交','outcome-unknown':'结果未知，需核对','already-installed':'相同发行已安装'};
const elem=(tag,cls='',label='')=>{
  const node=document.createElement(tag);if(cls)node.className=cls;if(label)node.textContent=label;return node;
};
const add=(parent,...nodes)=>{parent.append(...nodes);return parent;};
const button=(label,act,primary=false)=>{
  const node=elem('button','market-button'+(primary?' primary':''),label);node.type='button';node.addEventListener('click',act);return node;
};
const link=(label,href,cls='')=>{
  const node=elem('a',cls,label);node.href=href;return node;
};
const para=(s,cls='')=>elem('p',cls,s);
const badge=s=>elem('span','chip',s);
const fail=(message,code='E_MARKET')=>Object.assign(new Error(message),{code});
const copy=async value=>{
  if(!navigator.clipboard?.writeText)throw fail('当前浏览器不支持写入剪贴板');
  await navigator.clipboard.writeText(value);
};
function route(hash=location.hash) {
  let raw=hash.slice(1)||'/';
  try{raw=decodeURI(raw);}catch{return {kind:'missing'};}
  if(raw==='/'||raw==='')return {kind:'home'};
  if(raw==='/my')return {kind:'my'};
  let m=/^\/apps\/(opendesk\/[a-z][a-z0-9-]{1,39})(?:\/versions\/([0-9]+\.[0-9]+\.[0-9]+))?$/.exec(raw);
  if(m)return {kind:'app',id:m[1],version:m[2]||null};
  m=/^\/collections\/([a-z][a-z0-9-]{1,39})\/revisions\/([1-9][0-9]*)$/.exec(raw);
  if(m)return {kind:'collection',id:m[1],revision:Number(m[2])};
  return {kind:'missing'};
}
const appHref=app=>'#/apps/'+app.id+'/versions/'+app.version;
const collectionHref=item=>'#/collections/'+item.id+'/revisions/'+item.revision;
export function strictTransfer(value,releases=[]) {
  if(!value||typeof value!=='object'||Array.isArray(value)||
    Object.keys(value).sort().join(',')!=='apps,format'||value.format!==TRANSFER_FORMAT||
    !Array.isArray(value.apps)||value.apps.length>MAX_INSTALLED_TOOLS)
    throw fail('迁移清单格式错误或包含额外字段','E_TRANSFER');
  const ids=new Set();
  const apps=value.apps.map(item=>{
    if(!item||typeof item!=='object'||Array.isArray(item)||
      Object.keys(item).sort().join(',')!=='marketId,version')
      throw fail('迁移清单包含未允许的字段','E_TRANSFER');
    const app=releases.find(row=>row.id===item.marketId);
    if(!app||item.version!==app.version||ids.has(app.id))
      throw fail('迁移清单中存在无效、重复或未随扩展提供的版本','E_TRANSFER');
    ids.add(app.id);return {marketId:app.id,version:app.version};
  });
  return {format:TRANSFER_FORMAT,apps};
}
export function initMarketplace({api=globalThis.chrome,root=globalThis.document?.getElementById('market-root'),
  lockManager=globalThis.navigator?.locks}={}){
  if(!api?.runtime?.getURL||!root)throw fail('请在已安装的 OpenDesk 扩展内使用应用市场');
  let matchGeneration=0,localReadGeneration=0,disposed=false;
  const reviewId=new URLSearchParams(location.search||'').get('intent');
  const state={installed:[],catalog:null,apps:[],notice:'',error:false,review:null,busy:false,batchPlan:null,batch:null,
    batchRunning:false,batchRecovering:false,cancel:false,selected:new Set(),matched:new Set(),personalCollections:{},transfer:'',
    localStatus:'loading',localError:'',catalogStatus:'loading',catalogError:'',
    usageStatus:'loading',usage:null,usageError:'',cleanups:{},operations:{},
    handoff:null,handoffStatus:reviewId?'loading':'none',handoffError:'',handoffCancelled:false};
  const currentRoute=()=>route(state.handoff?marketSubjectRoute(state.handoff.subject):location.hash);
  const getOfficialApp=id=>state.apps.find(row=>row.id===id)||null;
  const say=(message='',isError=false)=>{state.notice=message;state.error=isError;render();};
  const installedTool=app=>state.installed.find(tool=>tool.id===app.toolId)||null;
  const settleHandoff=()=>state.handoff?settleReviewIntent({api,lockManager,reviewId:state.handoff.reviewId}).catch(()=>{}):Promise.resolve();
  const installedStatus=app=>{
    const current=installedTool(app);
    if(!current)return '未安装';
    if(current.version!==app.version)return '版本不同 · '+current.version;
    return state.matched.has(app.id)?'已安装 v'+current.version:'已有同 ID 版本 · 来源待核对';
  };
  async function packageFor(app){
    const row=state.catalog?.apps.find(item=>item.id===app?.id&&item.version===app?.version);
    if(!row)throw fail('当前扩展未发行这个固定版本','E_PACKAGE_MISSING');
    return loadOfficialTool(row,{api});
  }
  async function reloadInstalled(){
    const generation=++localReadGeneration;
    const fixed=state.handoff;
    const [stored,handoff]=await Promise.all([
      api.storage.local.get([SIDEBAR_TOOL_STORE,MARKET_BATCH_STORE,MY_COLLECTIONS_STORE,
        TOOL_CLEANUP_STORE,MARKET_OPERATIONS_STORE]),
      fixed?loadReviewIntent(api,fixed.reviewId).then(value=>({value}),error=>({error})):null
    ]);
    if(disposed||generation!==localReadGeneration)return false;
    // A write may commit even when its acknowledgement is lost. Read the durable
    // intent with the local journals so recovery appears in this page immediately.
    // Storage changes can update status, never the user's fixed candidate.
    if(handoff){
      const next=handoff.value;
      const changed=next&&(next.intentId!==fixed.intentId||next.operationId!==fixed.operationId||
        next.origin!==fixed.origin||marketSubjectRoute(next.subject)!==marketSubjectRoute(fixed.subject));
      if(handoff.error||changed){
        const error=handoff.error||fail('本机交接身份与当前固定审阅不一致','E_INTENT_CONFLICT');
        state.handoffStatus='error';state.handoffError=(error.code||'E_HANDOFF')+'：'+error.message;
        state.review=null;state.batchPlan=null;
      }else{state.handoff=next;state.handoffStatus='ready';state.handoffError='';}
    }
    const raw=stored[SIDEBAR_TOOL_STORE];
    const admitted=requireCompleteInstalledSidebarTools(raw);
    state.installed=admitted;
    state.cleanups=stored[TOOL_CLEANUP_STORE]||{};
    state.operations=stored[MARKET_OPERATIONS_STORE]||{};
    // Official publisher matching is optional metadata: a slow or missing
    // package resource must never delay the locally installed tool list.
    scheduleOfficialMatches();
    if(!state.batchRunning&&!state.batchRecovering)
      state.batch=readMarketBatch(stored[MARKET_BATCH_STORE]);
    const personal=stored[MY_COLLECTIONS_STORE];
    state.personalCollections=personal&&typeof personal==='object'&&!Array.isArray(personal)?personal:{};
    return true;
  }
  async function loadCatalog(){
    state.catalog=await loadOfficialCatalog({api});
    state.apps=officialMarketApps(state.catalog);
  }
  function scheduleOfficialMatches(){
    const generation=++matchGeneration;
    const catalog=state.catalog,apps=state.apps,installed=state.installed;
    state.matched=new Set();
    if(!catalog||state.catalogStatus!=='ready')return;
    const targets=apps.flatMap(app=>{
      const tool=installed.find(row=>row.id===app.toolId&&row.version===app.version);
      const release=catalog.apps.find(row=>row.id===app.id&&row.version===app.version);
      return tool&&release?[{app,tool,release}]:[];
    });
    // Detached from the local registry read; stale responses have no effect.
    void Promise.all(targets.map(async({app,tool,release})=>{
      try{return sameSidebarToolPackage(tool,(await loadOfficialTool(release,{api})).tool)?app.id:null;}
      catch{return null;}
    })).then(ids=>{
      if(disposed||generation!==matchGeneration)return;
      state.matched=new Set(ids.filter(Boolean));
      render();
    }).catch(()=>{/* Optional display verification never blocks installed tools. */});
  }
  const formatBytes=value=>value>=1024*1024?(value/1024/1024).toFixed(2)+' MiB':
    value>=1024?(value/1024).toFixed(1)+' KiB':value+' B';
  async function refreshUsage(){
    if(state.localStatus!=='ready')return;
    state.usageStatus='loading';state.usageError='';
    try{state.usage=await readSidebarStorageUsage(api,state.installed,Object.keys(state.cleanups||{}));state.usageStatus='ready';}
    catch(e){state.usage=null;state.usageStatus='error';state.usageError=String(e?.message||e);}
    render();
  }
  async function refreshLocal(){
    const request=reloadInstalled(),generation=localReadGeneration;
    try{
      if(!await request||disposed||generation!==localReadGeneration)return;
      state.localStatus='ready';state.localError='';
      render();void refreshUsage();
    }catch(e){
      if(disposed||generation!==localReadGeneration)return;
      state.localStatus='error';state.localError=(e.code||'E_STORAGE_READ')+'：'+String(e?.message||e);
      state.usageStatus='error';state.usage=null;render();
    }
  }
  async function refreshCatalog(){
    state.catalogStatus='loading';state.catalogError='';render();
    try{
      await loadCatalog();state.catalogStatus='ready';
      scheduleOfficialMatches();
    }catch(e){
      state.catalog=null;state.apps=[];state.catalogStatus='error';
      scheduleOfficialMatches();
      state.catalogError=(e.code||'E_CATALOG')+'：'+String(e?.message||e);
    }
    render();
  }
  function storagePanel(){
    const box=elem('section','surface');
    box.append(elem('h2','','本机存储'),para('工具安装包和数据保存在当前 Chrome 扩展的本地存储；无需连接市场即可使用。','minor'));
    if(state.usageStatus==='ready'&&state.usage){
      const u=state.usage;
      box.append(para('扩展 local 总占用：'+formatBytes(u.totalBytes)),
        para('已安装工具包：'+formatBytes(u.packageBytes)),
        para('工具数据：'+formatBytes(u.toolDataBytes)+'（含待清理工具及知识收件箱）'),
        para('大容量存储权限：'+(u.unlimited===true?'已启用':u.unlimited===false?'未启用':'暂时无法读取')));
    }else box.append(para(state.usageStatus==='loading'?'正在读取容量…':
      '暂时无法读取'+(state.usageError?'：'+state.usageError:''),'minor'));
    box.append(add(elem('div','actions'),button('刷新容量',refreshUsage)));
    return box;
  }
  async function recoverPending(operationId){
    if(state.busy)return;state.busy=true;render();
    try{
      const result=await recoverMarketOperation({api,lockManager,operationId});
      await refreshLocal();
      say(result.state==='succeeded'?'已核对本地包、哈希及来源；不会再次安装或运行工具。':
        '事务仍未确认：'+result.state+'。已保留记录，不会自动重试。',result.state!=='succeeded');
    }catch(e){say((e.code||'E_RECOVER')+'：'+e.message,true);}
    finally{state.busy=false;render();}
  }
  async function recoverCleanup(id){
    if(state.busy)return;state.busy=true;render();
    try{
      const result=await retryUninstalledToolCleanup({api,lockManager,id});
      await refreshLocal();
      say(result.state==='cleaned'?'已完成目标工具的卸载残留清理。':
        result.state==='still-installed'?'该 ID 已安装工具；为保护当前数据，未执行旧清理。':
        '当前没有待清理记录。',result.state==='still-installed');
    }catch(e){await refreshLocal();say((e.code||'E_CLEANUP')+'：'+e.message,true);}
    finally{state.busy=false;render();}
  }
  function pendingPanel(){
    const cleanups=Object.entries(state.cleanups||{}).filter(([id,row])=>
      idPattern.test(id)&&row&&typeof row.version==='string');
    const operations=Object.entries(state.operations||{}).filter(([id,row])=>
      /^[a-f0-9-]{36}$/.test(id)&&row&&['reviewed','committing','outcome-unknown'].includes(row.state));
    if(!cleanups.length&&!operations.length)return null;
    const box=elem('section','surface');box.append(elem('h2','','待核对的本地操作'));
    for(const [id,row] of operations){
      const line=elem('div','action-row');
      line.append(para((row.toolId||'工具')+' · 安装事务 '+(BATCH_STATUS_NAMES[row.state]||row.state),'minor'),
        button('核对安装结果',()=>recoverPending(id)));box.append(line);
    }
    for(const [id,row] of cleanups){
      const line=elem('div','action-row');
      line.append(para(id+' · 卸载残留待核对（原 v'+row.version+'）','minor'),
        button('恢复清理',()=>recoverCleanup(id)));box.append(line);
    }
    return box;
  }
  function container(eyebrow,title,description){
    const content=elem('section','market-content');content.append(elem('p','eyebrow',eyebrow),elem('h1','',title));
    if(description)content.append(para(description,'market-lead'));return content;
  }
  function toolbar(parent){
    if(!state.notice)return;
    const node=para(state.notice,'state-message');node.dataset.state=state.error?'error':'success';
    node.setAttribute('role',state.error?'alert':'status');parent.append(node);
  }
  function card(app){
    const content=elem('article','surface app-card');
    content.append(elem('span','category',app.category),add(elem('h3'),link(app.title,appHref(app))),para(app.summary),para(installedStatus(app),'minor'));
    content.append(add(elem('div','actions'),link('查看详情 →',appHref(app))));
    return content;
  }
  function home(){
    const content=container('OFFICIAL APPS','让浏览器多做一点事','安装经过校验的官方工具；离线浏览、选择权限，使用时再明确打开。');
    const search=elem('input');search.type='search';search.placeholder='按名称、功能查找';search.setAttribute('aria-label','筛选应用');
    search.className='market-search';
    const listing=elem('div','market-grid');content.append(search,listing);
    const update=()=>{
      const text=search.value.trim().toLowerCase();
      listing.replaceChildren(...state.apps.filter(app=>
        (app.title+' '+app.summary+' '+app.category+' '+app.sites).toLowerCase().includes(text)).map(card));
      if(!listing.children.length)listing.append(para('没有找到匹配的应用。'));
    };search.addEventListener('input',update);update();
    const collection=OFFICIAL_COLLECTIONS[0];
    const more=elem('div','surface');
    more.append(elem('h2','',collection.title+' · 官方套装'),para(collection.description),
      link('查看固定版本套装 →',collectionHref(collection)));
    content.append(more);
    const mine=Object.values(state.personalCollections).at(-1);
    if(mine?.id==='my-selection')content.append(add(elem('div','surface'),elem('h2','',mine.title),link('打开我的固定版本套装 →',collectionHref(mine))));
    return content;
  }
  function drawDemo(app){
    const box=elem('div','screen-demo');
    box.dataset.kind=app.media;box.setAttribute('role','img');
    box.setAttribute('aria-label',app.title+'界面结构示意图，非实际截图');
    box.append(add(elem('div','demo-toolbar'),elem('strong','',app.title),elem('span','',app.category)));
    const inner=elem('div','demo-content');
    for(let i=0;i<4;i++)inner.append(elem('div','demo-line'));
    box.append(inner,elem('span','demo-label','界面结构示意 · 非真实截图'));
    return box;
  }
  function infoSpecs(app){
    const list=elem('dl','spec-list');
    for(const [key,value] of [
      ['版本','v'+app.version],['发布者',app.author],['适用网页',app.sites],
      ['运行位置',app.surfaces.join('、')],['交付方式','随 OpenDesk 扩展打包；可离线安装'],
      ['站点授权','安装后独立授权，不自动读取网页']
    ])list.append(elem('dt','',key),elem('dd','',value));
    return list;
  }
  function detail(app){
    const current=installedTool(app),content=container('APPLICATION',app.title,app.summary);
    content.prepend(link('← 返回应用市场','#/','back-link'));
    const layout=elem('div','detail-layout'),main=elem('section','surface');
    main.append(drawDemo(app),elem('h2','','主要功能'));
    const featureList=elem('ul');for(const f of app.features)featureList.append(elem('li','',f));
    main.append(featureList,elem('h2','','安全与权限'),
      para('只有审阅并确认后才能安装。安装本身不运行工具、不授予站点授权，也不会读取网页内容。','minor'));
    const side=elem('aside','side'),meta=elem('section','surface');meta.append(infoSpecs(app));
    const acts=elem('div','actions');
    const open=button('打开使用',()=>api.tabs.create({url:toolPageHref(api.runtime,app.toolId)}),true);
    if(current&&state.matched.has(app.id))acts.append(open);
    else acts.append(button(current?'审阅版本更新':'审阅并安装',()=>reviewApp(app)));
    acts.append(button('复制详情链接',()=>copy(location.href).then(()=>say('已复制此扩展内详情链接；跨设备分享请使用部署后的公网地址。')).catch(e=>say(e.message,true))));
    if(app.toolId==='time-review'&&app.externalWeb?.url==='https://todo6.com/'){
      acts.append(button(app.externalWeb.label,()=>api.tabs.create({url:app.externalWeb.url})));
      meta.append(para('旧版外部网页入口，独立打开；本机统计不会上传或自动登录。','minor'));
    }
    meta.append(acts);
    side.append(meta);
    const perm=elem('section','surface');perm.append(elem('h3','','权限说明'),para('正式能力列表以已验证发行包为准。站点授权在工具页面独立管理。','minor'));
    side.append(perm);layout.append(main,side);content.append(layout);
    if(state.review?.app.id===app.id)content.append(renderReview(state.review));
    return content;
  }
  function handoffDetail(app){
    const content=container('OPENDESK · 可信安装审阅',app.title,'固定版本 v'+app.version+' · '+app.surfaces.join('、'));
    content.append(para('来自 '+state.handoff.origin+' 的安装请求。此候选不会被其他网页请求替换。','minor'));
    if(state.review)content.append(renderReview(state.review));
    else if(state.matched.has(app.id)){
      content.append(para('已核对本机安装：v'+app.version+'。安装不会自动运行。'));
      const open=button('打开使用',()=>api.tabs.create({url:toolPageHref(api.runtime,app.toolId)}),true);
      open.dataset.marketAction='open-installed';content.append(add(elem('div','actions'),open));
    }else if(state.handoffCancelled){
      content.append(para('已取消本次审阅，未提交安装。'));
      if(!state.operations[state.handoff.operationId]&&!state.handoff.recoveryOnly&&state.handoff.consumedAt===null)
        content.append(button('重新核对此固定版本',()=>reviewApp(app)));
    }
    else if(!state.busy&&!state.operations[state.handoff.operationId]&&!state.handoff.recoveryOnly&&state.handoff.consumedAt===null){
      content.append(button('重新核对固定候选',()=>reviewApp(app)));
    }
    const pending=pendingPanel();if(pending)content.append(pending);
    return content;
  }
  function handoffNavigation(){
    const controls=elem('div','actions');
    for(const [label,hash] of [['打开本机应用管理','#/my'],['打开扩展内市场','#/'],
      ...(state.handoff?.settledAt?[['重新选择此固定版本',marketSubjectRoute(state.handoff.subject)]]:[])]){
      const item=link(label,api.runtime.getURL('ui/marketplace.html')+hash);
      item.target='_blank';item.rel='noopener';controls.append(item);
    }
    return controls;
  }
  function missingHandoffRecovery(){
    if(!state.handoff||state.handoff.consumedAt===null||state.handoff.settledAt!==null||
      state.operations[state.handoff.operationId]||state.batch?.batchId===state.handoff.operationId)return null;
    const box=elem('section','surface');box.append(elem('h2','','原事务日志不可用'),
      para('无法据此判定安装成功或失败。下方操作会在原安装锁下核对当前本机状态，并结束此次交接；不会再次安装或清除原批准标记。','minor'));
    const action=button('核对本机状态并结束此交接',async()=>{
      if(state.busy)return;state.busy=true;render();
      try{
        const result=await closeUnjournaledReview({api,lockManager,reviewId:state.handoff.reviewId,
          operationId:state.handoff.operationId,subject:state.handoff.subject,approved:true});
        state.handoff=result.handoff;state.review=null;state.batchPlan=null;
        const observed=result.observed.map(row=>row.id+' v'+row.version+'（'+row.source+'）').join('；')||'未发现对应的本机安装';
        say('已结束这次交接，原安装结果仍未知。当前核对：'+observed+'。再次安装请重新选择固定版本并进行新的审阅。');
      }catch(error){say((error.code||'E_RECOVER')+'：'+error.message,true);}
      finally{state.busy=false;render();}
    });action.dataset.marketAction='close-unjournaled';action.disabled=state.busy;box.append(action);return box;
  }
  async function reviewApp(app) {
    if(state.busy)return;
    state.busy=true;say('正在核对随扩展发行的固定版本包…');
    try{
      await reloadInstalled();
      const candidate=await packageFor(app);
      const operationId=state.handoff?.operationId||crypto.randomUUID();
      const prior=state.operations[operationId];
      state.handoffCancelled=false;
      if(state.handoff&&(!prior||prior.state==='succeeded')&&sameSidebarToolPackage(installedTool(app),candidate.tool)){
        state.review=null;state.matched.add(app.id);state.notice='相同官方发行已经安装，可以主动打开。';state.error=false;return;
      }
      state.review={app,...candidate,baseline:installedTool(app),operationId,
        unknown:Boolean(state.handoff&&(prior||state.handoff.recoveryOnly||state.handoff.consumedAt!==null))};
      state.notice=state.review.unknown?'等待核对原安装结果；不会自动重试。':
        '安装前请检查版本、所需能力与站点授权说明。';state.error=false;
    }catch(e){state.review=null;state.notice=(e.code||'E_PACKAGE')+'：'+e.message;state.error=true;}
    finally{state.busy=false;render();}
  }
  function renderReview(review){
    const parent=elem('section','surface review');parent.tabIndex=-1;parent.append(elem('h2','','安装审阅 · '+review.app.title));
    const current=review.baseline,tool=review.tool;
    parent.append(para('发布者：OpenDesk · 制品来源：当前扩展内的官方发行包。网站只负责提出安装请求。','minor'));
    parent.append(para('当前：'+(current?'v'+current.version:'未安装')+' → 发行：v'+tool.version));
    parent.append(para('申请能力：'+capabilityNames(tool.capabilities)));
    if(current){
      const added=tool.capabilities.filter(v=>!current.capabilities.includes(v));
      parent.append(para('新增能力：'+capabilityNames(added)+'；原工具数据保留。','minor'));
      parent.append(para('将替换此 ID 已安装的代码，可能变更来源。请核对发行者与能力后点击下方确认；不会再二次弹窗。','minor'));
      if(compareToolVersions(tool.version,current.version)<=0){
        parent.append(para('市场不允许用同版本不同内容或旧版本覆盖现有工具。','minor'));
      }
    }
    parent.append(para('网站授权需在工具列表另行确认；安装完成后不会自动打开工具。','minor'));
    const identity=elem('details');identity.append(elem('summary','','固定发行信息'),
      para(review.app.id+' · v'+tool.version,'minor'),para('SHA-256：'+review.release.sha256,'minor'));
    parent.append(identity);
    if(review.unknown){
      if(state.operations[review.operationId]){
        parent.append(para('此请求已有持久安装事务。先核对原结果，不创建新操作或自动重试。','minor'));
        parent.append(button('恢复核对安装结果',()=>recover(review)));
      }else parent.append(para('原事务日志暂不可用。请使用下方的本机状态核对入口；不会自动重试安装。','minor'));
      return parent;
    }
    if(review.stale){
      parent.append(para('本机安装状态已变化，本次尚未提交。请重新核对此固定版本及当前状态，再决定安装。','minor'));
      const retry=button('重新核对此固定版本',()=>reviewApp(review.app),true);
      retry.dataset.marketAction='review-again';retry.disabled=state.busy;parent.append(retry);return parent;
    }
    const controls=elem('div','actions');
    const install=button('确认安装此固定版本',()=>commitApp(review),true);
    install.dataset.marketAction='confirm-install';
    install.disabled=state.busy||Boolean(current&&compareToolVersions(tool.version,current.version)<=0);
    const cancel=button('取消',()=>{if(state.busy)return;state.review=null;state.handoffCancelled=true;say('已取消本次安装。');});
    cancel.dataset.marketAction='cancel-install';
    cancel.disabled=state.busy;controls.append(install,cancel);
    parent.append(controls);return parent;
  }
  async function recover(review){
    if(state.busy||state.review!==review)return;
    state.busy=true;render();
    try{
      const result=await recoverMarketOperation({api,lockManager,operationId:review.operationId,
        expectedIdentity:{toolId:review.tool.id,marketId:review.app.id,version:review.tool.version,sha256:review.release.sha256}});
      await reloadInstalled();
      if(result.state==='succeeded'){
        state.review=null;say('经实际安装记录核对：已安装 v'+review.tool.version+'；尚未运行。');
      }else say('事务状态：'+result.state+'。不自动重试；请核对我的应用与本机日志。',true);
    }catch(e){say(e.message,true);}
    finally{await settleHandoff();state.busy=false;render();}
  }
  async function commitApp(review){
    if(state.busy||state.review!==review)return;
    state.busy=true;render();
    try{
      await verifyReviewedOfficialTool(review.release,review.tool,{api});
      const result=await installReviewedSidebarTool({api,lockManager,candidate:review.tool,baseline:review.baseline,
        reviewApproved:true,market:{marketId:review.app.id,sha256:review.release.sha256,operationId:review.operationId},
        commitIntent:state.handoff?async()=>{state.handoff=await consumeReviewIntent({api,lockManager,
          reviewId:state.handoff.reviewId,operationId:review.operationId,subject:state.handoff.subject});}:null,
        approveSourceChange:()=>true,
        approveUpdate:()=>true});
      await reloadInstalled();
      state.localStatus='ready';state.localError='';
      if(result.state==='installed'&&!state.installed.some(row=>sameSidebarToolPackage(row,review.tool)))
        throw fail('安装状态读回不一致，请先恢复核对','E_OUTCOME_UNKNOWN');
      state.review=null;void refreshUsage();
      state.notice=result.state==='cancelled'?'已取消更新。':result.state==='already-installed'?'已经安装相同工具。':
        '安装完成。点击“打开使用”开始；需要网站访问能力时请单独授权。';state.error=false;
    }catch(e){
      if(['E_OUTCOME_UNKNOWN','E_HANDOFF_UNKNOWN','E_INTENT_CONSUMED'].includes(e.code))review.unknown=true;
      if(e.code==='E_TOOL_CHANGED')review.stale=true;
      state.notice=(e.code||'E_INSTALL')+'：'+e.message;state.error=true;
      await reloadInstalled().catch(()=>{});
    }finally{await settleHandoff();state.busy=false;render();}
  }
  function selectedTransfer(){
    return strictTransfer({format:TRANSFER_FORMAT,
      apps:state.apps.filter(app=>state.selected.has(app.id)).map(app=>({marketId:app.id,version:app.version}))},state.apps);
  }
  async function importTransfer(){
    try{
      const transfer=strictTransfer(JSON.parse(state.transfer),state.apps);
      const uninstalled=transfer.apps.filter(item=>!installedTool(getOfficialApp(item.marketId)));
      if(!uninstalled.length)return say('清单对应应用均已安装；已有版本差异需要逐项审阅。');
      // An imported list is data-only. Never install or grant permissions on import.
      state.selected=new Set(transfer.apps.map(item=>item.marketId));
      say('已验证清单，选择了 '+transfer.apps.length+' 个官方应用。点击“创建所选套装”可以进行批量预检。');
    }catch(e){say((e.code||'E_TRANSFER')+'：'+e.message,true);}
  }
  async function createPersonalCollection(){
    try{
      const items=selectedTransfer().apps;
      if(!items.length)throw fail('请先选择至少一个官方应用','E_COLLECTION_EMPTY');
      const revision=Date.now();
      const before=(await api.storage.local.get(MY_COLLECTIONS_STORE))[MY_COLLECTIONS_STORE]||{};
      if(Object.keys(before).length>=64)throw fail('个人套装快照已达 64 份上限，请另行备份，不自动覆盖分享过的 revision','E_COLLECTION_CAPACITY');
      if(Object.hasOwn(before,revision))throw fail('套装 revision 已存在，不能覆盖','E_REVISION_CONFLICT');
      const collection={id:'my-selection',revision,title:'我的应用套装',
        description:'仅包含固定官方应用身份与版本；不含个人内容或站点授权',
        members:items.map(item=>({id:item.marketId,version:item.version}))};
      state.personalCollections={...before,[revision]:collection};
      await api.storage.local.set({[MY_COLLECTIONS_STORE]:state.personalCollections});
      location.hash=collectionHref(collection);
    }catch(e){say((e.code||'E_COLLECTION')+'：'+e.message,true);}
  }
  function myApps(){
    const content=container('MY APPS','我的应用','以下安装记录来自本机扩展存储。市场目录异常不会阻止打开已有工具。迁移清单不包含笔记、Token、站点授权或本机路径。');
    if(state.localStatus==='loading'){
      content.append(add(elem('section','surface'),para('正在读取本机安装记录…')));return content;
    }
    if(state.localStatus==='error'){
      const box=elem('section','surface');
      box.append(para('本机安装记录读取失败，无法确认安装状态；不要清空数据或重复安装。','minor'),
        para(state.localError,'state-message'),button('重新读取本机应用',refreshLocal,true));
      content.append(box);return content;
    }
    if(state.catalogStatus==='error'){
      content.append(add(elem('section','surface'),
        para('官方目录无法读取。下列本机应用仍可直接打开。','minor'),
        button('重试市场目录',refreshCatalog)));
    }
    content.append(storagePanel());
    const pending=pendingPanel();if(pending)content.append(pending);
    const listing=elem('div','surface'),table=elem('div');
    for(const tool of state.installed){
      const app=state.apps.find(item=>item.toolId===tool.id&&item.version===tool.version&&state.matched.has(item.id));
      const line=elem('div','action-row');line.style.padding='8px 0';
      const label=elem('label','checkbox-line');
      const cb=elem('input');cb.type='checkbox';cb.disabled=!app;cb.checked=Boolean(app&&state.selected.has(app.id));
      if(app)cb.addEventListener('change',()=>{if(cb.checked)state.selected.add(app.id);else state.selected.delete(app.id);});
      label.append(cb,elem('span','',tool.title+' · v'+tool.version+(app?'':'（非当前官方发行版本）')));
      line.append(label,button('打开',()=>api.tabs.create({url:toolPageHref(api.runtime,tool.id)})));
      table.append(line);
    }
    if(!state.installed.length)table.append(para('尚无已安装应用。'));
    listing.append(table);
    const exportButtons=add(elem('div','actions'),
      button('复制所选迁移清单',async()=>{
        try{await copy(JSON.stringify(selectedTransfer(),null,2));say('已复制纯数据迁移清单；不包含网站授权或用户内容。');}
        catch(e){say(e.message,true);}
      }),
      button('创建所选套装',createPersonalCollection),
      button('打开官方套装',()=>{location.hash=collectionHref(OFFICIAL_COLLECTIONS[0]);}));
    if(state.catalogStatus!=='ready'){exportButtons.children[0].disabled=true;exportButtons.children[1].disabled=true;}
    listing.append(exportButtons);
    const form=elem('div','surface');form.append(elem('h2','','导入迁移清单'),
      para('粘贴由 OpenDesk 导出的纯数据 JSON。导入只校验与选择，不执行安装或恢复授权。','minor'));
    const field=elem('textarea');field.setAttribute('aria-label','迁移清单 JSON');
    field.value=state.transfer;field.addEventListener('input',()=>{state.transfer=field.value;});
    const check=button('检查并选择清单',importTransfer);check.disabled=state.catalogStatus!=='ready';
    form.append(field,add(elem('div','actions'),check));
    content.append(listing,form);
    return content;
  }
  function collectionPage(collection){
    const content=container('COLLECTION · REVISION '+collection.revision,collection.title,collection.description);
    if(!state.handoff)content.prepend(link('← 返回探索','#/','back-link'));
    const table=elem('table'),head=elem('thead'),row=elem('tr');
    for(const title of ['固定成员','发行版本','实际状态'])row.append(elem('th','',title));
    head.append(row);table.append(head);
    const body=elem('tbody');
    for(const item of collection.members){
      const app=getOfficialApp(item.id);
      const line=elem('tr');
      const memberLink=link(app?.title||item.id,app?'#/apps/'+app.id+'/versions/'+item.version:'#/');
      if(state.handoff){memberLink.href=api.runtime.getURL('ui/marketplace.html')+memberLink.getAttribute('href');memberLink.target='_blank';memberLink.rel='noopener';}
      line.append(add(elem('td'),memberLink),elem('td','','v'+item.version),elem('td','',!app||app.version!==item.version?'当前扩展未提供此固定版本':installedStatus(app)));
      body.append(line);
    }table.append(body);
    const section=elem('section','surface');section.append(add(elem('div','market-table-scroll'),table));
    section.append(para('预检会逐一核对包、固定版本、容量与权限；明确确认后才逐项安装。成功的项目不会因其他失败被卸载。','minor'));
    const controls=elem('div','actions');
    const consumed=state.handoff&&state.handoff.consumedAt!==null;
    if(!state.handoff?.recoveryOnly&&!consumed)controls.append(button('预检全部成员',()=>preflightCollection(collection),true));
    if(consumed)content.append(para('此网站请求已经开始过批次。下方只核对现有结果；旧批次归档后也不会用同一请求重新安装。','minor'));
    controls.append(button('复制套装详情链接',()=>copy(api.runtime.getURL('ui/marketplace.html')+collectionHref(collection)).then(()=>say('已复制固定套装的扩展内详情链接；不包含临时安装意图。跨设备分享请使用市场网站。')).catch(e=>say(e.message,true))));
    section.append(controls);content.append(section);
    if(!consumed&&state.batchPlan?.collection.id===collection.id&&state.batchPlan.collection.revision===collection.revision)content.append(renderBatchPlan());
    if(state.batch?.collectionId===collection.id&&state.batch.revision===collection.revision&&
      (!state.handoff||state.batch.batchId===state.handoff.operationId))
      content.append(renderBatchProgress());
    else if(state.handoff&&marketBatchUnresolved(state.batch))content.append(para(
      '另一个安装请求的批次有待处理。本页不会把它作为当前请求的结果，也不会在此恢复它。请在下方独立应用管理入口核对。','minor'));
    return content;
  }
  async function preflightCollection(collection){
    if(state.busy)return;
    state.busy=true;say('正在逐项校验安装包和现有安装状态…');
    const rows=[];let count=0;
    try{
      await reloadInstalled();
      const provenance=(await api.storage.local.get(MARKET_PROVENANCE_STORE))[MARKET_PROVENANCE_STORE]||{};
      for(const member of collection.members){
        const app=getOfficialApp(member.id);let row={app:app?{...app,version:member.version}:{id:member.id,title:member.id,version:member.version},status:'ready',reason:'',baseline:app?installedTool(app):null};
        if(!app||app.version!==member.version){row.status='blocked';row.reason='当前扩展不包含这个固定版本';rows.push(row);continue;}
        try{
          const {tool,release}=await packageFor(app);row.tool=tool;row.release=release;
          if(row.baseline&&sameSidebarToolPackage(row.baseline,tool)){row.status='skip';row.reason='相同发行已安装';}
          else if(row.baseline){
            if(provenance[tool.id]?.marketId!==app.id||compareToolVersions(tool.version,row.baseline.version)<=0){
              row.status='blocked';row.reason='来源或版本差异，需要先单独审阅';
            }else row.reason='将保留原工具数据；申请能力：'+capabilityNames(tool.capabilities)+
              '；新增能力：'+capabilityNames(tool.capabilities.filter(value=>!row.baseline.capabilities.includes(value)));
          }else if(state.installed.length+count>=MAX_INSTALLED_TOOLS){
            row.status='blocked';row.reason='超过本机 12 个工具上限';
          }else{count++;row.reason='申请能力：'+capabilityNames(tool.capabilities);}
        }catch(e){row.status='blocked';row.reason=(e.code||'E_PACKAGE')+' '+e.message;}
        rows.push(row);
      }
      state.batchPlan={collection,rows};state.notice='预检完成：准备 '+rows.filter(r=>r.status==='ready').length+' 项，已安装 '+rows.filter(r=>r.status==='skip').length+' 项。';state.error=rows.some(r=>r.status==='blocked');
    }catch(e){state.notice=e.message;state.error=true;state.batchPlan=null;}
    finally{state.busy=false;render();}
  }
  function renderBatchPlan(){
    const plan=state.batchPlan,box=elem('section','surface review');
    box.append(elem('h2','','批量安装审阅'),
      para('发布者：OpenDesk · 制品来源：当前扩展内的官方发行包。安装保留已有工具数据，不自动运行，也不授予网站权限。','minor'));
    for(const row of plan.rows)box.append(para(row.app.title+' · v'+row.app.version+' · '+
      (BATCH_STATUS_NAMES[row.status]||row.status)+' · '+row.reason));
    const actions=elem('div','actions'),start=button('确认逐项安装',()=>runBatch(plan),true);
    start.dataset.marketAction='confirm-batch';
    start.disabled=state.busy||!plan.rows.some(r=>r.status==='ready');
    const cancel=button('取消预检',()=>{if(state.busy)return;state.batchPlan=null;render();});
    cancel.disabled=state.busy;
    actions.append(start,cancel);box.append(actions);return box;
  }
  // A whole batch holds a separate non-blocking Web Lock. One market tab
  // cannot replace another tab's in-flight operation ID or start it twice.
  async function runBatch(plan){
    if(state.busy||state.batchPlan!==plan)return;
    state.busy=true;state.batchRunning=true;state.cancel=false;render();
    try{
      await withMarketBatchLock(lockManager,async()=>{
        const prior=readMarketBatch((await api.storage.local.get(MARKET_BATCH_STORE))[MARKET_BATCH_STORE]);
        if(state.handoff&&prior?.batchId===state.handoff.operationId)
          throw fail('此网站请求已经创建过批次，请核对原批次结果；不能重复提交','E_BATCH_REPLAY');
        if(marketBatchUnresolved(prior))
          throw fail('已有未结清的批次，请先恢复核对；不能覆盖其操作 ID','E_BATCH_UNRESOLVED');
        let firstIdentity=true;
        const batch=createMarketBatch(plan.collection,plan.rows,{releases:state.apps,
          idFactory:()=>{if(firstIdentity&&state.handoff){firstIdentity=false;return state.handoff.operationId;}firstIdentity=false;return crypto.randomUUID();}});
        if(state.handoff)state.handoff=await consumeReviewIntent({api,lockManager,
          reviewId:state.handoff.reviewId,operationId:state.handoff.operationId,subject:state.handoff.subject});
        const save=async()=>{
          batch.updatedAt=Date.now();
          // A rejected storage write can still have committed. Never retry a
          // committing item based only on a lost write acknowledgement.
          await api.storage.local.set({[MARKET_BATCH_STORE]:batch});
          state.batch=batch;
        };
        await save();render();
        for(let i=0;i<plan.rows.length;i++){
          const item=batch.items[i],row=plan.rows[i];
          if(item.status!=='queued')continue;
          if(state.cancel){
            item.status='cancelled';item.reason='用户取消尚未派发的项目';
            await save();render();continue;
          }
          item.status='committing';
          await save();render();
          try{
            await verifyReviewedOfficialTool(row.release,row.tool,{api});
            const result=await installReviewedSidebarTool({api,lockManager,candidate:row.tool,baseline:row.baseline,
              reviewApproved:true,market:{marketId:row.app.id,sha256:row.release.sha256,operationId:item.operationId},
              approveUpdate:()=>true});
            item.status=result.state==='installed'?'succeeded':result.state;
            item.reason='经安装服务完成；未自动运行或授予网站权限';
          }catch(e){
            item.status=e.code==='E_OUTCOME_UNKNOWN'?'outcome-unknown':'failed';
            item.reason=((e.code||'E_INSTALL')+': '+String(e.message||e)).slice(0,300);
            if(item.status==='outcome-unknown')state.cancel=true;
          }
          await save();
          await reloadInstalled();
          render();
        }
      });
      state.batchPlan=null;
      state.notice='批量安装处理结束。成功和已有安装保留；其他结果见下方记录。';
      state.error=false;
    }catch(e){
      state.notice=(e.code||'E_BATCH')+'：'+String(e.message||e).slice(0,210);
      state.error=true;
      // A write or acknowledgement may have been lost. Keep the exact durable
      // journal for explicit recovery, not an automatic second attempt.
    }finally{
      state.batchRunning=false;state.busy=false;
      await settleHandoff();
      await reloadInstalled().catch(e=>{state.notice='批次状态读取失败：'+e.message;state.error=true;});
      render();
    }
  }
  async function recoverBatch(){
    if(state.busy||!state.batch)return;
    const expectedBatchId=state.batch.batchId;
    if(state.handoff&&expectedBatchId!==state.handoff.operationId)
      return say('E_BATCH_IDENTITY：此批次属于另一个请求，请在独立应用管理中核对。',true);
    state.busy=true;state.batchRecovering=true;render();
    try{
      await withMarketBatchLock(lockManager,async()=>{
        const original=readMarketBatch((await api.storage.local.get(MARKET_BATCH_STORE))[MARKET_BATCH_STORE]);
        if(!original)throw fail('批次记录已不存在；没有需要重放的项目','E_BATCH_MISSING');
        if(original.batchId!==expectedBatchId||state.handoff&&
          (original.batchId!==state.handoff.operationId||original.collectionId!==state.handoff.subject.collectionId||
           original.revision!==state.handoff.subject.revision))
          throw fail('批次身份已变化，请重新核对原请求；未恢复其他批次','E_BATCH_IDENTITY');
        const batch=reconcileQueuedAfterInterruption(original);
        for(const item of batch.items){
          if(!['committing','outcome-unknown'].includes(item.status))continue;
          try{
            const result=await recoverMarketOperation({api,lockManager,operationId:item.operationId,
              expectedIdentity:{marketId:item.id,version:item.version}});
            item.status=result.state==='succeeded'?'succeeded':'outcome-unknown';
            item.reason=('恢复核对：'+result.state+'。未自动重试。').slice(0,300);
          }catch(e){
            item.status='outcome-unknown';
            item.reason=('无法确认：'+String(e.message||e)).slice(0,300);
          }
        }
        batch.updatedAt=Date.now();
        await api.storage.local.set({[MARKET_BATCH_STORE]:batch});
        state.batch=batch;
      });
      state.notice='已从实际安装记录核对；未派发项目已标记中断，仍未知的项目不能自动重试。';
      state.error=marketBatchUnresolved(state.batch);
    }catch(e){
      state.notice=(e.code||'E_BATCH')+'：'+String(e.message||e).slice(0,210);
      state.error=true;
    }finally{
      state.batchRecovering=false;state.busy=false;
      await settleHandoff();
      await reloadInstalled().catch(e=>{state.notice='批次状态读取失败：'+e.message;state.error=true;});
      render();
    }
  }
  function renderBatchProgress(){
    const box=elem('section','surface');box.append(elem('h2','','批量安装与恢复'));
    for(const item of state.batch.items){
      const app=getOfficialApp(item.id);
      box.append(para((app?.title||item.id)+'：'+(BATCH_STATUS_NAMES[item.status]||item.status)+' · '+item.reason));
    }
    const controls=elem('div','actions');
    if(state.batchRunning)controls.append(button(state.cancel?'已申请停止剩余项目':'停止剩余项目',()=>{
      state.cancel=true;
      state.notice='当前在途项目完成核对后，剩余项目不会再派发。';
      render();
    }));
    else if(!state.busy&&marketBatchUnresolved(state.batch))
      controls.append(button('恢复核对中断与未知结果',recoverBatch));
    if(!state.busy)controls.append(para('需要继续安装未派发或明确失败的成员时，请重新预检，不会盲目重放旧事务。','minor'));
    box.append(controls);
    return box;
  }
  function render(){
    if(!root)return;
    const page=currentRoute();let content;
    const activeNav=page.kind==='my'?'market-my':page.kind==='collection'?'market-collection':'market-home';
    for(const id of ['market-home','market-collection','market-my']){
      const control=document.getElementById(id);
      if(!control)continue;
      control.hidden=Boolean(reviewId);
      if(id===activeNav)control.setAttribute('aria-current','page');
      else control.removeAttribute('aria-current');
    }
    if(state.handoffStatus==='loading')content=container('INSTALL HANDOFF','正在核对安装请求','正在读取本机保存的固定候选…');
    else if(state.handoffStatus==='error')content=container('INSTALL HANDOFF','无法继续此安装请求',state.handoffError);
    else if(page.kind==='my')content=myApps();
    else if(state.catalogStatus==='error'){
      content=container('CATALOG UNAVAILABLE','官方市场目录暂时不可用',
        state.catalogError+'。已安装本地工具可以继续使用。');
      content.append(add(elem('div','actions'),button('重试官方目录',refreshCatalog)));
      if(!reviewId)content.append(link('打开我的应用 →','#/my'));
    }else if(!state.catalog)content=container('APPLICATIONS','官方应用市场','正在读取扩展离线目录…');
    else if(page.kind==='home')content=home();
    else if(page.kind==='app'){
      const app=getOfficialApp(page.id);
      content=app&&(!page.version||page.version===app.version)?(state.handoff?handoffDetail(app):detail(app)):
        container('RELEASE UNAVAILABLE','固定版本不可用','当前扩展不包含此固定版本，不能新安装。请更新主扩展或在市场选择当前版本；本机已有版本仍可使用。');
    }else if(page.kind==='collection'){
      const collection=getOfficialCollection(page.id,page.revision)||
        (page.id==='my-selection'&&state.personalCollections[page.revision]?.revision===page.revision?state.personalCollections[page.revision]:null);
      content=collection?collectionPage(collection):container('NOT FOUND','套装版本不存在','旧 revision 不得默默替换成最新版本。');
    }else content=container('NOT FOUND','找不到该页面','检查链接中的应用身份与固定版本。');
    toolbar(content);
    if(reviewId){const stranded=missingHandoffRecovery();if(stranded)content.append(stranded);content.append(handoffNavigation());}
    root.replaceChildren(content);
  }
  const onHash=()=>{if(reviewId){render();return;}state.review=null;state.batchPlan=null;state.notice='';render();
    root.focus?.({preventScroll:true});window.scrollTo?.(0,0);
    if(currentRoute().kind==='my'&&state.localStatus==='ready')void refreshUsage();};
  const onStorage=(changes,area)=>{
    if(area!=='local')return;
    const keys=Object.keys(changes||{});
    if(keys.some(key=>[SIDEBAR_TOOL_STORE,MARKET_BATCH_STORE,TOOL_CLEANUP_STORE,MARKET_INTENTS_STORE,
      MARKET_OPERATIONS_STORE].includes(key))){void refreshLocal();return;}
    if(keys.some(key=>key.startsWith(SIDEBAR_TOOL_DATA_PREFIX))&&currentRoute().kind==='my')
      void refreshUsage();
  };
  for(const [id,href] of [['market-home','#/'],['market-collection',collectionHref(OFFICIAL_COLLECTIONS[0])],['market-my','#/my']]){
    const nav=document.getElementById(id);
    nav?.addEventListener('click',()=>{location.hash=href;});
  }
  window.addEventListener('hashchange',onHash);
  api.storage.onChanged.addListener(onStorage);
  const ready=Promise.all([refreshLocal(),refreshCatalog()]);
  if(reviewId)void ready.then(async()=>{
    state.handoff=await loadReviewIntent(api,reviewId);state.handoffStatus='ready';
    if(state.localStatus!=='ready'||state.catalogStatus!=='ready')return render();
    const subject=state.handoff.subject;
    if(subject.kind==='app'){
      const app=getOfficialApp(subject.marketId);
      if(app?.version===subject.version)await reviewApp(app);else render();
    }else{
      const collection=getOfficialCollection(subject.collectionId,subject.revision);
      if(collection&&!state.handoff.recoveryOnly&&state.handoff.consumedAt===null&&state.batch?.batchId!==state.handoff.operationId&&!marketBatchUnresolved(state.batch))await preflightCollection(collection);
      else render();
    }
    root.querySelector('.review')?.focus({preventScroll:true});
  }).catch(error=>{state.handoffStatus='error';state.handoffError=(error.code||'E_HANDOFF')+'：'+error.message;render();});
  render();
  return {dispose(){
    disposed=true;matchGeneration++;localReadGeneration++;
    window.removeEventListener('hashchange',onHash);
    api.storage.onChanged.removeListener(onStorage);
  }};
}
