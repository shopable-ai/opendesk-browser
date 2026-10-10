import {SIDEBAR_TOOL_STORE,validateSidebarToolPackage} from '../ui/sidebar-tools/package.js';

export const READING_TOC_SITE_STORE='opendesk.sidebar-tools.toc-sites.v1';
export const READING_TOC_TOOL_ID='reading-toc';
export const READING_TOC_PROTOCOL='opendesk.reading-toc.v1';
export const TOC_CAPABILITY='page.toc';

export function websiteOrigin(value) {
  try {
    const url=new URL(value);
    return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password?url.origin:null;
  }catch{return null;}
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
export function tocGrantAllowed(installed,settings,id,url) {
  const origin=websiteOrigin(url);
  return Boolean(origin&&admittedTocTool(installed,id)&&grantedOrigins(settings,id).includes(origin));
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
