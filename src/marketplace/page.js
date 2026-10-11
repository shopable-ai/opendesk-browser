import {OFFICIAL_APPS,OFFICIAL_COLLECTIONS,getOfficialApp,getOfficialCollection,officialPackagePath,MARKET_SCHEMA} from './catalog.js';
import {validateSidebarToolPackage, SIDEBAR_TOOL_STORE,MAX_INSTALLED_TOOLS} from '../ui/sidebar-tools/package.js';
import {admittedSidebarToolPackages,sameSidebarToolPackage,compareToolVersions,
  installReviewedSidebarTool,reconcileMarketOperation,MARKET_PROVENANCE_STORE} from '../ui/sidebar-tools/installation.js';
import {toolPageHref} from '../ui/sidebar-tools/navigation.js';

const BATCH_STORE='opendesk.market.batch.v1';
const MY_COLLECTIONS_STORE='opendesk.market.collections.v1';
const TRANSFER_FORMAT='opendesk.market.transfer.v1';
const idPattern=/^[a-z][a-z0-9-]{1,39}$/;
const CAPABILITY_NAMES={
  'storage.local':'保存该工具的本机数据','currentPage.read':'读取用户当前网页的标题和地址',
  'tasks.open':'打开已安装任务','page.toc':'按网站授权读取标题目录',
  'page.clip':'按网站授权读取正文或选区','user.export':'复制内容或下载文件',
  'page.capture':'授权后在 ChatGPT 页面提供保存按钮',
  'knowledge.store':'管理本机知识收件箱'
};
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
function route() {
  let raw=location.hash.slice(1)||'/';
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
async function sha256(bytes) {
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
}
export function strictTransfer(value) {
  if(!value||typeof value!=='object'||Array.isArray(value)||
    Object.keys(value).sort().join(',')!=='apps,format'||value.format!==TRANSFER_FORMAT||
    !Array.isArray(value.apps)||value.apps.length>MAX_INSTALLED_TOOLS)
    throw fail('迁移清单格式错误或包含额外字段','E_TRANSFER');
  const ids=new Set();
  const apps=value.apps.map(item=>{
    if(!item||typeof item!=='object'||Array.isArray(item)||
      Object.keys(item).sort().join(',')!=='marketId,version')
      throw fail('迁移清单包含未允许的字段','E_TRANSFER');
    const app=getOfficialApp(item.marketId);
    if(!app||item.version!==app.version||ids.has(app.id))
      throw fail('迁移清单中存在无效、重复或未随扩展提供的版本','E_TRANSFER');
    ids.add(app.id);return {marketId:app.id,version:app.version};
  });
  return {format:TRANSFER_FORMAT,apps};
}
export function initMarketplace({api=globalThis.chrome,root=globalThis.document?.getElementById('market-root'),
  lockManager=globalThis.navigator?.locks}={}){
  if(!api?.runtime?.getURL||!root)throw fail('请在已安装的 OpenDesk 扩展内使用应用市场');
  const state={installed:[],catalog:null,notice:'',error:false,review:null,busy:false,batchPlan:null,batch:null,
    cancel:false,selected:new Set(),matched:new Set(),personalCollections:{},transfer:''};
  const say=(message='',isError=false)=>{state.notice=message;state.error=isError;render();};
  const installedTool=app=>state.installed.find(tool=>tool.id===app.toolId)||null;
  const installedStatus=app=>{
    const current=installedTool(app);
    if(!current)return '未安装';
    if(current.version!==app.version)return '版本不同 · '+current.version;
    return state.matched.has(app.id)?'已安装 v'+current.version:'已有同 ID 版本 · 来源待核对';
  };
  const currentCatalog=app=>{
    const item=state.catalog?.apps?.find(row=>row.id===app.id&&row.version===app.version);
    if(!item||item.toolId!==app.toolId||!(/^[0-9a-f]{64}$/.test(item.sha256)))
      throw fail('当前扩展未发行这个固定版本','E_PACKAGE_MISSING');
    return item;
  };
  async function packageFor(app){
    const row=currentCatalog(app);
    const path=officialPackagePath(app);
    if(row.packagePath!==path)throw fail('发行包来源与官方目录不一致','E_PACKAGE_SOURCE');
    const response=await fetch(api.runtime.getURL(path),{cache:'no-store'});
    if(!response.ok)throw fail('扩展安装包缺失：'+app.id,'E_PACKAGE_MISSING');
    const bytes=await response.arrayBuffer();
    if(bytes.byteLength>320000)throw fail('发行包超过限制','E_TOOL_LIMIT');
    if(await sha256(bytes)!==row.sha256)throw fail('发行包内容与固定版本哈希不符','E_PACKAGE_INTEGRITY');
    let raw;try{raw=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
    catch{throw fail('发行包 JSON 或编码无效','E_PACKAGE_SCHEMA');}
    const tool=validateSidebarToolPackage(raw);
    if(tool.id!==app.toolId||tool.version!==app.version||tool.title!==row.packageTitle)
      throw fail('工具身份、标题或版本与发行目录不一致','E_PACKAGE_IDENTITY');
    return {tool,release:row};
  }
  async function reloadInstalled(){
    const stored=await api.storage.local.get([SIDEBAR_TOOL_STORE,BATCH_STORE,MY_COLLECTIONS_STORE]);
    state.installed=admittedSidebarToolPackages(stored[SIDEBAR_TOOL_STORE]);
    state.matched=new Set();
    if(state.catalog)for(const app of OFFICIAL_APPS){
      const current=state.installed.find(row=>row.id===app.toolId&&row.version===app.version);
      if(!current)continue;
      try{if(sameSidebarToolPackage(current,(await packageFor(app)).tool))state.matched.add(app.id);}
      catch{/* Mismatched or missing release must not be represented as official. */}
    }
    const batch=stored[BATCH_STORE];
    state.batch=Array.isArray(batch?.items)&&['reading-kit','my-selection'].includes(batch?.collectionId)?batch:null;
    const personal=stored[MY_COLLECTIONS_STORE];
    state.personalCollections=personal&&typeof personal==='object'&&!Array.isArray(personal)?personal:{};
  }
  async function loadCatalog(){
    const response=await fetch(api.runtime.getURL('market/catalog.json'),{cache:'no-store'});
    if(!response.ok)throw fail('无法读取随包发行的应用目录');
    const data=await response.json();
    if(data.schema!==MARKET_SCHEMA||!Array.isArray(data.apps)||data.apps.length!==OFFICIAL_APPS.length)
      throw fail('随包发行的应用目录版本错误');
    for(const app of OFFICIAL_APPS)currentCatalogAfter(data,app);
    state.catalog=data;
  }
  function currentCatalogAfter(data,app){
    const found=data.apps.filter(item=>item.id===app.id&&item.toolId===app.toolId&&item.version===app.version);
    if(found.length!==1)throw fail('官方目录缺失或重复发行版本：'+app.id);
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
    search.className='market-button';search.style.width='min(100%,390px)';
    const listing=elem('div','market-grid');content.append(search,listing);
    const update=()=>{
      const text=search.value.trim().toLowerCase();
      listing.replaceChildren(...OFFICIAL_APPS.filter(app=>
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
    meta.append(acts);
    side.append(meta);
    const perm=elem('section','surface');perm.append(elem('h3','','权限说明'),para('正式能力列表以已验证发行包为准。站点授权在工具页面独立管理。','minor'));
    side.append(perm);layout.append(main,side);content.append(layout);
    if(state.review?.app.id===app.id)content.append(renderReview(state.review));
    return content;
  }
  async function reviewApp(app) {
    if(state.busy)return;
    state.busy=true;say('正在核对随扩展发行的固定版本包…');
    try{
      await reloadInstalled();
      const candidate=await packageFor(app);
      state.review={app,...candidate,baseline:installedTool(app),operationId:crypto.randomUUID(),unknown:false};
      state.notice='安装前请检查版本、所需能力与站点授权说明。';state.error=false;
    }catch(e){state.review=null;state.notice=(e.code||'E_PACKAGE')+'：'+e.message;state.error=true;}
    finally{state.busy=false;render();}
  }
  function renderReview(review){
    const parent=elem('section','surface review');parent.append(elem('h2','','安装审阅 · '+review.app.title));
    const current=review.baseline,tool=review.tool;
    parent.append(para('当前：'+(current?'v'+current.version:'未安装')+' → 发行：v'+tool.version));
    parent.append(para('申请能力：'+(tool.capabilities.map(v=>CAPABILITY_NAMES[v]||v).join('；')||'无额外能力')));
    if(current){
      const added=tool.capabilities.filter(v=>!current.capabilities.includes(v));
      parent.append(para('新增能力：'+(added.join('、')||'无')+'；原工具数据保留。','minor'));
      if(compareToolVersions(tool.version,current.version)<=0){
        parent.append(para('市场不允许用同版本不同内容或旧版本覆盖现有工具。','minor'));
      }
    }
    parent.append(para('网站授权需在工具列表另行确认；安装完成后不会自动打开工具。','minor'));
    if(review.unknown){
      parent.append(button('恢复核对安装结果',()=>recover(review)));return parent;
    }
    const controls=elem('div','actions');
    const install=button('确认安装此固定版本',()=>commitApp(review),true);
    if(current&&compareToolVersions(tool.version,current.version)<=0)install.disabled=true;
    controls.append(install,button('取消',()=>{state.review=null;say('已取消本次安装。');}));
    parent.append(controls);return parent;
  }
  async function recover(review){
    try{
      const result=await reconcileMarketOperation(api,review.operationId,review.tool);
      await reloadInstalled();
      if(result.state==='succeeded'){
        state.review=null;say('经实际安装记录核对：已安装 v'+review.tool.version+'；尚未运行。');
      }else say('事务状态：'+result.state+'。不自动重试；请核对我的应用与本机日志。',true);
    }catch(e){say(e.message,true);}
  }
  async function commitApp(review){
    if(state.busy||state.review!==review)return;
    state.busy=true;render();
    try{
      const result=await installReviewedSidebarTool({api,lockManager,candidate:review.tool,baseline:review.baseline,
        reviewApproved:true,market:{marketId:review.app.id,sha256:review.release.sha256,operationId:review.operationId},
        approveUpdate:()=>globalThis.confirm('请再次确认：更新 '+review.app.title+' 到 v'+review.tool.version+'，保留原工具数据？')});
      state.review=null;await reloadInstalled();
      state.notice=result.state==='cancelled'?'已取消更新。':result.state==='already-installed'?'已经安装相同工具。':
        '安装完成。请从我的应用主动点击打开；网站访问还需独立授权。';state.error=false;
    }catch(e){
      if(e.code==='E_OUTCOME_UNKNOWN')review.unknown=true;
      state.notice=(e.code||'E_INSTALL')+'：'+e.message;state.error=true;
      await reloadInstalled().catch(()=>{});
    }finally{state.busy=false;render();}
  }
  function selectedTransfer(){
    return strictTransfer({format:TRANSFER_FORMAT,
      apps:OFFICIAL_APPS.filter(app=>state.selected.has(app.id)).map(app=>({marketId:app.id,version:app.version}))});
  }
  async function importTransfer(){
    try{
      const transfer=strictTransfer(JSON.parse(state.transfer));
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
    const content=container('MY APPS','我的应用','以下安装记录来自真实扩展存储。勾选后只能导出固定官方应用身份与版本，不包含笔记、Token、站点授权或本机路径。');
    const listing=elem('div','surface'),table=elem('div');
    for(const tool of state.installed){
      const app=OFFICIAL_APPS.find(item=>item.toolId===tool.id&&item.version===tool.version&&state.matched.has(item.id));
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
    listing.append(add(elem('div','actions'),
      button('复制所选迁移清单',async()=>{
        try{await copy(JSON.stringify(selectedTransfer(),null,2));say('已复制纯数据迁移清单；不包含网站授权或用户内容。');}
        catch(e){say(e.message,true);}
      }),
      button('创建所选套装',createPersonalCollection),
      button('打开官方套装',()=>{location.hash=collectionHref(OFFICIAL_COLLECTIONS[0]);})));
    const form=elem('div','surface');form.append(elem('h2','','导入迁移清单'),
      para('粘贴由 OpenDesk 导出的纯数据 JSON。导入只校验与选择，不执行安装或恢复授权。','minor'));
    const field=elem('textarea');field.setAttribute('aria-label','迁移清单 JSON');
    field.value=state.transfer;field.addEventListener('input',()=>{state.transfer=field.value;});
    form.append(field,add(elem('div','actions'),button('检查并选择清单',importTransfer)));
    content.append(listing,form);
    return content;
  }
  function collectionPage(collection){
    const content=container('COLLECTION · REVISION '+collection.revision,collection.title,collection.description);
    content.prepend(link('← 返回探索','#/','back-link'));
    const table=elem('table'),head=elem('thead'),row=elem('tr');
    for(const title of ['固定成员','发行版本','实际状态'])row.append(elem('th','',title));
    head.append(row);table.append(head);
    const body=elem('tbody');
    for(const item of collection.members){
      const app=getOfficialApp(item.id);
      const line=elem('tr');
      line.append(add(elem('td'),link(app.title,appHref(app))),elem('td','','v'+item.version),elem('td','',installedStatus(app)));
      body.append(line);
    }table.append(body);
    const section=elem('section','surface');section.append(table);
    section.append(para('预检会逐一核对包、固定版本、容量与权限；明确确认后才逐项安装。成功的项目不会因其他失败被卸载。','minor'));
    const controls=elem('div','actions');
    controls.append(button('预检全部成员',()=>preflightCollection(collection),true));
    controls.append(button('复制套装详情链接',()=>copy(location.href).then(()=>say('已复制当前扩展内部链接；跨设备请导出清单或部署公网市场。')).catch(e=>say(e.message,true))));
    section.append(controls);content.append(section);
    if(state.batchPlan?.collection.id===collection.id)content.append(renderBatchPlan());
    if(state.batch?.collectionId===collection.id)content.append(renderBatchProgress());
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
        const app=getOfficialApp(member.id);let row={app,status:'ready',reason:'',baseline:installedTool(app)};
      if(!app||app.version!==member.version){row.status='blocked';row.reason='当前扩展不包含这个固定版本';rows.push(row);continue;}
        try{
          const {tool,release}=await packageFor(app);row.tool=tool;row.release=release;
          if(row.baseline&&sameSidebarToolPackage(row.baseline,tool)){row.status='skip';row.reason='相同发行已安装';}
          else if(row.baseline){
            if(provenance[tool.id]?.marketId!==app.id||compareToolVersions(tool.version,row.baseline.version)<=0){
              row.status='blocked';row.reason='来源或版本差异，需要先单独审阅';
            }else row.reason='将保留原工具数据；申请权限：'+tool.capabilities.join('、');
          }else if(state.installed.length+count>=MAX_INSTALLED_TOOLS){
            row.status='blocked';row.reason='超过本机 12 个工具上限';
          }else{count++;row.reason='申请权限：'+(tool.capabilities.join('、')||'无');}
        }catch(e){row.status='blocked';row.reason=(e.code||'E_PACKAGE')+' '+e.message;}
        rows.push(row);
      }
      state.batchPlan={collection,rows};state.notice='预检完成：准备 '+rows.filter(r=>r.status==='ready').length+' 项，已安装 '+rows.filter(r=>r.status==='skip').length+' 项。';state.error=rows.some(r=>r.status==='blocked');
    }catch(e){state.notice=e.message;state.error=true;state.batchPlan=null;}
    finally{state.busy=false;render();}
  }
  function renderBatchPlan(){
    const plan=state.batchPlan,box=elem('section','surface review');
    box.append(elem('h2','','批量安装审阅'));
    for(const row of plan.rows)box.append(para(row.app.title+' · '+row.status+' · '+row.reason));
    const actions=elem('div','actions'),start=button('确认逐项安装',()=>runBatch(plan),true);
    start.disabled=state.busy||!plan.rows.some(r=>r.status==='ready');
    actions.append(start,button('取消预检',()=>{state.batchPlan=null;render();}));box.append(actions);return box;
  }
  async function saveBatch(){await api.storage.local.set({[BATCH_STORE]:state.batch});}
  async function runBatch(plan){
    if(state.busy||state.batchPlan!==plan)return;
    state.busy=true;state.cancel=false;
    state.batch={collectionId:plan.collection.id,revision:plan.collection.revision,
      items:plan.rows.map(r=>({id:r.app.id,version:r.app.version,operationId:crypto.randomUUID(),
        status:r.status==='ready'?'queued':r.status,reason:r.reason})),updatedAt:Date.now()};
    await saveBatch();render();
    for(let i=0;i<plan.rows.length;i++){
      const item=state.batch.items[i],row=plan.rows[i];
      if(item.status!=='queued')continue;
      if(state.cancel){item.status='cancelled';item.reason='用户取消了剩余项目';continue;}
      item.status='committing';state.batch.updatedAt=Date.now();await saveBatch();render();
      try{
        const result=await installReviewedSidebarTool({api,lockManager,candidate:row.tool,baseline:row.baseline,
          reviewApproved:true,market:{marketId:row.app.id,sha256:row.release.sha256,operationId:item.operationId},
          approveUpdate:()=>true});
        item.status=result.state==='installed'?'succeeded':result.state;
        item.reason='操作完成；安装后不会自动运行';
      }catch(e){
        item.status=e.code==='E_OUTCOME_UNKNOWN'?'outcome-unknown':'failed';
        item.reason=(e.code||'E_TOOL')+': '+e.message;
        if(item.status==='outcome-unknown')state.cancel=true;
      }
      state.batch.updatedAt=Date.now();await saveBatch();
      await reloadInstalled();render();
    }
    await saveBatch();await reloadInstalled();state.batchPlan=null;state.busy=false;
    state.notice='批量安装处理结束。逐项结果如下；失败项不影响已经成功安装的工具。';state.error=false;
    render();
  }
  async function recoverBatch(){
    if(state.busy||!state.batch)return;
    state.busy=true;
    try{
      for(const item of state.batch.items){
        if(!['committing','outcome-unknown'].includes(item.status))continue;
        const app=getOfficialApp(item.id);
        try{
          const {tool}=await packageFor(app),result=await reconcileMarketOperation(api,item.operationId,tool);
          item.status=result.state==='succeeded'?'succeeded':'outcome-unknown';
          item.reason='实际核对结果：'+result.state+'；未自动重新提交';
        }catch(e){item.status='outcome-unknown';item.reason=e.message;}
      }
      await saveBatch();await reloadInstalled();
      state.notice='恢复核对结束。仍未知的事务不得自动重试。';state.error=false;
    }catch(e){state.notice=e.message;state.error=true;}
    finally{state.busy=false;render();}
  }
  function renderBatchProgress(){
    const box=elem('section','surface');box.append(elem('h2','','批量安装结果'));
    for(const item of state.batch.items){
      const app=getOfficialApp(item.id);
      box.append(para((app?.title||item.id)+'：'+item.status+' · '+item.reason));
    }
    const controls=elem('div','actions');
    if(state.busy)controls.append(button('停止剩余项目',()=>{state.cancel=true;state.notice='将在当前项目完成核对后取消剩余任务。';render();}));
    else controls.append(button('恢复核对未知事务',recoverBatch));
    box.append(controls);
    return box;
  }
  function render(){
    if(!root)return;
    const page=route();let content;
    if(!state.catalog)content=container('APPLICATIONS','官方应用市场',state.notice||'正在读取扩展离线目录…');
    else if(page.kind==='home')content=home();
    else if(page.kind==='my')content=myApps();
    else if(page.kind==='app'){
      const app=getOfficialApp(page.id);
      content=app&&(!page.version||page.version===app.version)?detail(app):
        container('RELEASE UNAVAILABLE','固定版本不可用','此版本未随当前扩展发行，不能从网页下载任意代码。');
    }else if(page.kind==='collection'){
      const collection=getOfficialCollection(page.id,page.revision)||
        (page.id==='my-selection'&&state.personalCollections[page.revision]?.revision===page.revision?state.personalCollections[page.revision]:null);
      content=collection?collectionPage(collection):container('NOT FOUND','套装版本不存在','旧 revision 不得默默替换成最新版本。');
    }else content=container('NOT FOUND','找不到该页面','检查链接中的应用身份与固定版本。');
    toolbar(content);
    root.replaceChildren(content);
  }
  const onHash=()=>{state.review=null;state.batchPlan=null;state.notice='';render();};
  const onStorage=(changes,area)=>{
    if(area!=='local'||(!Object.hasOwn(changes,SIDEBAR_TOOL_STORE)&&!Object.hasOwn(changes,BATCH_STORE)))return;
    reloadInstalled().then(render).catch(e=>say(e.message,true));
  };
  for(const [id,href] of [['market-home','#/'],['market-collection',collectionHref(OFFICIAL_COLLECTIONS[0])],['market-my','#/my']]){
    const nav=document.getElementById(id);
    nav?.addEventListener('click',()=>{location.hash=href;});
  }
  window.addEventListener('hashchange',onHash);
  api.storage.onChanged.addListener(onStorage);
  Promise.all([loadCatalog(),reloadInstalled()]).then(()=>reloadInstalled()).then(render).catch(e=>say((e.code||'E_MARKET')+'：'+e.message,true));
  render();
  return {dispose(){
    window.removeEventListener('hashchange',onHash);
    api.storage.onChanged.removeListener(onStorage);
  }};
}
