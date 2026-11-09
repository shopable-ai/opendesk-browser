import {SIDEBAR_TOOL_DATA_LIMITS,sidebarToolStorageKey} from './package.js';
import {digestUtf8} from '../../platform/protocol.js';
import {writeVerifiedLocalValue,sameStorageValue} from './storage-state.js';

// One-time, fixed migration of the retired built-in reader. These keys are
// deliberately not exposed to imported applications as a storage capability.
const id='reading-toc',prefix='opendesk.sidebar-tools.toc-';
const stores={sites:prefix+'sites.v1',pages:prefix+'disabled-pages.v1',visibility:prefix+'visibility.v1'};
const placementPrefix=prefix+'placement.v1:',collapsePrefix=prefix+'collapse.v1:';
const fail=message=>Object.assign(new Error(message),{code:'E_MIGRATION_REQUIRED'});
const plain=value=>value&&typeof value==='object'&&!Array.isArray(value);
function origin(value){
  try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password&&url.origin===value;}catch{return false;}
}
function pageScope(value){
  try{const url=new URL(value);return origin(url.origin)&&value===url.origin+url.pathname&&value.length<=768;}catch{return false;}
}
function list(value,valid){
  if(value===undefined)return [];
  if(!Array.isArray(value)||value.length>64||!value.every(row=>typeof row==='string'&&valid(row)))
    throw fail('旧阅读目录范围设置无效；原数据保留，升级已停止');
  return [...new Set(value)];
}
function record(raw,key){
  if(raw[key]===undefined)return undefined;
  if(!plain(raw[key]))throw fail('旧阅读目录设置记录损坏；原数据保留，升级已停止');
  return raw[key][id];
}
function placement(value){
  if(!plain(value)||value.v!==1||!['free','left','right'].includes(value.dock)||
    !Number.isFinite(value.x)||!Number.isFinite(value.y)||value.x<0||value.x>1||value.y<0||value.y>1)
    throw fail('旧阅读目录位置无效；原数据保留，升级已停止');
  return {v:1,dock:value.dock,x:value.x,y:value.y};
}
export async function prepareLegacyReadingTocUpgrade({api,existing,candidate}){
  if(existing?.id!==id||!existing.capabilities.includes('page.toc')||candidate?.id!==id||!candidate.pageModule)return null;
  const raw=await api.storage.local.get(null),key=sidebarToolStorageKey(id),previous=raw[key];
  if(previous!==undefined&&!plain(previous))throw fail('阅读目录私有数据无效；升级已停止');
  const site=record(raw,stores.sites),visibility=record(raw,stores.visibility);
  let blockedOrigins=[];
  if(Array.isArray(site))list(site,origin); // Historical positive list meant all sites for the built-in reader.
  else if(site!==undefined){
    if(!plain(site)||site.mode!=='all-except'||Object.keys(site).some(key=>!['mode','blockedOrigins'].includes(key))||!Array.isArray(site.blockedOrigins))
      throw fail('旧阅读目录网站设置无效；原数据保留，升级已停止');
    blockedOrigins=list(site.blockedOrigins,origin);
  }
  if(visibility!==undefined&&(!plain(visibility)||Object.keys(visibility).some(key=>!['hiddenSites','hiddenPages'].includes(key))))
    throw fail('旧阅读目录显示设置无效；原数据保留，升级已停止');
  const next={...previous,preferences:{blockedOrigins,disabledPages:list(record(raw,stores.pages),pageScope),
    hiddenSites:list(visibility?.hiddenSites,origin),hiddenPages:list(visibility?.hiddenPages,pageScope)}};
  const saved=new Map();
  for(const [key,value] of Object.entries(raw)){
    const isPlacement=key.startsWith(placementPrefix),isCollapse=key.startsWith(collapsePrefix);
    if(!isPlacement&&!isCollapse)continue;
    let site;
    try{site=decodeURIComponent(key.slice((isPlacement?placementPrefix:collapsePrefix).length));}catch{throw fail('旧阅读目录网站位置键无效');}
    if(!origin(site))throw fail('旧阅读目录网站位置键无效');
    const row=saved.get(site)||{origin:site};
    if(isPlacement)row.placement=placement(value);
    else{if(typeof value!=='boolean')throw fail('旧阅读目录折叠偏好无效');row.collapsed=value;}
    saved.set(site,row);
  }
  for(const [site,row] of saved){
    const name='origin.'+(await digestUtf8(site)).slice(0,12);
    if(next[name]?.origin&&next[name].origin!==site)throw fail('阅读目录位置存储冲突；原数据保留');
    next[name]={...next[name],...row};
  }
  next.legacyMigration={version:1,fromVersion:existing.version};
  if(Object.keys(next).length>SIDEBAR_TOOL_DATA_LIMITS.maxKeys||
     Object.values(next).some(row=>new TextEncoder().encode(JSON.stringify(row)).byteLength>SIDEBAR_TOOL_DATA_LIMITS.itemBytes)||
     new TextEncoder().encode(JSON.stringify(next)).byteLength>SIDEBAR_TOOL_DATA_LIMITS.totalBytes)
    throw fail('旧阅读目录设置超过应用存储容量；原数据与安装保留，请先备份并整理设置');
  const legacy=Object.fromEntries(Object.entries(raw).filter(([key])=>Object.values(stores).includes(key)||key.startsWith(placementPrefix)||key.startsWith(collapsePrefix)));
  return {key,previous,next,legacy};
}
export async function writeLegacyReadingTocUpgrade(api,plan){
  if(!plan)return;
  const raw=await api.storage.local.get(null);
  const current=Object.fromEntries(Object.entries(raw).filter(([key])=>Object.values(stores).includes(key)||key.startsWith(placementPrefix)||key.startsWith(collapsePrefix)));
  if(!sameStorageValue(raw[plan.key],plan.previous)||!sameStorageValue(current,plan.legacy))
    throw fail('旧阅读目录设置在审阅期间发生变化；请重新审阅升级');
  await writeVerifiedLocalValue(api,plan.key,plan.next,plan.previous,'阅读目录设置迁移');
  // Original legacy records remain available for recovery until uninstall.
}
