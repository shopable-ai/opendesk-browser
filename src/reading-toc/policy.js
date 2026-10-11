import {sidebarToolEnabled} from '../ui/sidebar-tools/lifecycle.js';
import {SIDEBAR_TOOL_STORE,validateSidebarToolPackage} from '../ui/sidebar-tools/package.js';

export const READING_TOC_SITE_STORE='opendesk.sidebar-tools.toc-sites.v1';
// A distinct storage key per HTTP(S) origin prevents unrelated sites from
// overwriting one another's position when separate tabs save concurrently.
export const READING_TOC_PLACEMENT_PREFIX='opendesk.sidebar-tools.toc-placement.v1:';
export const READING_TOC_TOOL_ID='reading-toc';
export const READING_TOC_PROTOCOL='opendesk.reading-toc.v1';
export const TOC_CAPABILITY='page.toc';

export function websiteOrigin(value) {
  try {
    const url=new URL(value);
    return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password?url.origin:null;
  }catch{return null;}
}
export function readingTocPlacementKey(url) {
  const origin=websiteOrigin(url);
  return origin?READING_TOC_PLACEMENT_PREFIX+encodeURIComponent(origin):null;
}
export function admittedTocTool(rows,id) {
  if(!Array.isArray(rows)||typeof id!=='string')return null;
  for(const row of rows) {
    if(row?.id!==id)continue;
    try {
      const item=validateSidebarToolPackage(row);
      return item.capabilities.includes(TOC_CAPABILITY)?item:null;
    }catch{return null;}
  }
  return null;
}
export function grantedOrigins(settings,id) {
  if(!settings || typeof settings!=='object' || Array.isArray(settings) ||
     !Array.isArray(settings[id]))return [];
  return [...new Set(settings[id].filter(value=>
    typeof value==='string'&&value.length<300&&websiteOrigin(value)===value))].slice(0,64);
}
export function tocGrantAllowed(installed,settings,id,url,enableRecords) {
  const origin=websiteOrigin(url);
  return Boolean(sidebarToolEnabled(enableRecords,id)&&origin&&admittedTocTool(installed,id)&&grantedOrigins(settings,id).includes(origin));
}
export function changeTocGrant(settings,id,url,allow) {
  const origin=websiteOrigin(url);
  if(!origin || !/^[a-z][a-z0-9-]{1,39}$/.test(id))throw Error('无效的网站或工具 ID');
  const prior=settings&&typeof settings==='object'&&!Array.isArray(settings)?settings:{};
  const next={...prior};
  const previous=grantedOrigins(prior,id);
  const sites=allow?[...new Set([...previous,origin])]:previous.filter(value=>value!==origin);
  if(sites.length>64)throw Error('单工具最多授权 64 个网站');
  if(sites.length)next[id]=sites;else delete next[id];
  return next;
}

// Per-page "unavailable" is a runtime denial, not an overlay preference.
// It prevents the trusted observer and the Side Panel from reading this page.
export const READING_TOC_PAGE_RULES_STORE='opendesk.sidebar-tools.toc-disabled-pages.v1';
const MAX_TOC_DISABLED_PAGES=64;
export function disabledTocPages(settings,id){
  const raw=settings?.[id];
  if(!Array.isArray(raw))return [];
  return [...new Set(raw.filter(value=>
    typeof value==='string'&&readingTocPageScope(value)===value))].slice(0,MAX_TOC_DISABLED_PAGES);
}
export function readingTocPageAllowed(settings,id,url){
  const scope=readingTocPageScope(url);
  return Boolean(scope&&!disabledTocPages(settings,id).includes(scope));
}
export function changeTocPageAllowed(settings,id,url,allowed){
  if(typeof id!=='string'||!/^[a-z][a-z0-9-]{1,39}$/.test(id)||typeof allowed!=='boolean')
    throw Error('无效的阅读目录页面设置');
  const scope=readingTocPageScope(url);
  if(!scope)throw Error('当前页面无法保存目录运行范围');
  const original=settings&&typeof settings==='object'&&!Array.isArray(settings)?settings:{};
  const previous=disabledTocPages(original,id);
  const pages=allowed?previous.filter(item=>item!==scope):[...new Set([...previous,scope])];
  if(pages.length>MAX_TOC_DISABLED_PAGES)throw Error('单个工具最多排除 64 个页面');
  const next={...original};
  if(pages.length)next[id]=pages;else delete next[id];
  return next;
}

// Appearance preferences are not authorization: a hidden overlay still leaves
// the separately granted Side Panel TOC service available. Scoped by tool ID.
export const READING_TOC_VISIBILITY_STORE='opendesk.sidebar-tools.toc-visibility.v1';
const MAX_TOC_HIDDEN_SCOPES=64;

// Deliberately omit search parameters and fragments to avoid retaining private
// queries and answer fragments. SPA path changes re-evaluate this exact key.
export function readingTocPageScope(value) {
  const origin=websiteOrigin(value);
  if(!origin)return null;
  try {
    const key=origin+new URL(value).pathname;
    return key.length<=768?key:null;
  }catch{return null;}
}
function tocHiddenScopes(preferences,id,field){
  const values=preferences?.[id]?.[field];
  if(!Array.isArray(values))return [];
  const valid=field==='hiddenSites'
    ? value=>typeof value==='string'&&websiteOrigin(value)===value
    : value=>typeof value==='string'&&readingTocPageScope(value)===value;
  return [...new Set(values.filter(valid))].slice(0,MAX_TOC_HIDDEN_SCOPES);
}
export function readingTocDisplayState(preferences,id,url){
  const origin=websiteOrigin(url),page=readingTocPageScope(url);
  const hiddenOnSite=Boolean(origin&&tocHiddenScopes(preferences,id,'hiddenSites').includes(origin));
  const hiddenOnPage=Boolean(page&&tocHiddenScopes(preferences,id,'hiddenPages').includes(page));
  return {hiddenOnSite,hiddenOnPage,show:!hiddenOnSite&&!hiddenOnPage};
}
export function changeReadingTocVisibility(preferences,id,url,scope,hidden){
  if(typeof id!=='string'||!/^[a-z][a-z0-9-]{1,39}$/.test(id)||
     !['site','page'].includes(scope)||typeof hidden!=='boolean')
    throw Error('无效的阅读目录显示设置');
  const target=scope==='site'?websiteOrigin(url):readingTocPageScope(url);
  if(!target)throw Error('当前网页无法保存显示偏好');
  const original=preferences&&typeof preferences==='object'&&!Array.isArray(preferences)?preferences:{};
  const previousSites=tocHiddenScopes(original,id,'hiddenSites');
  const previousPages=tocHiddenScopes(original,id,'hiddenPages');
  const update=values=>hidden?[...new Set([...values,target])]:values.filter(value=>value!==target);
  const hiddenSites=scope==='site'?update(previousSites):previousSites;
  const hiddenPages=scope==='page'?update(previousPages):previousPages;
  if(hiddenSites.length>MAX_TOC_HIDDEN_SCOPES||hiddenPages.length>MAX_TOC_HIDDEN_SCOPES)
    throw Error('单个工具最多隐藏 64 个网站或页面');
  const next={...original};
  if(hiddenSites.length||hiddenPages.length)next[id]={hiddenSites,hiddenPages};
  else delete next[id];
  return next;
}
