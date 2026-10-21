// Browser-owned site preferences. Installation owns capability approval; these
// preferences may stop an installed capability, but never grant a capability.
export function websiteOrigin(value) {
  try {
    const url=new URL(value);
    return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password?url.origin:null;
  }catch{return null;}
}
export function grantedOrigins(settings,id) {
  if(!settings || typeof settings!=='object' || Array.isArray(settings) ||
     !Array.isArray(settings[id]))return [];
  return [...new Set(settings[id].filter(value=>
    typeof value==='string'&&value.length<300&&websiteOrigin(value)===value))].slice(0,64);
}
export function changeSiteGrant(settings,id,url,allow) {
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

// Basic installed capabilities reuse the installation review on every supported
// site. Legacy positive arrays are readable; new writes record explicit opt-outs.
// Callers must separately verify installation, capability, Chrome access and the
// current document. Corrupt preferences fail closed instead of erasing denials.
function installedSiteBlocks(settings,id) {
  if(!/^[a-z][a-z0-9-]{1,39}$/.test(id)||
     settings!==undefined&&(!settings||typeof settings!=='object'||Array.isArray(settings)))return null;
  const record=settings?.[id];
  if(record===undefined)return [];
  const validOrigins=origins=>Array.isArray(origins)&&origins.length<=64&&origins.every(origin=>
    typeof origin==='string'&&origin.length<300&&websiteOrigin(origin)===origin);
  if(Array.isArray(record))return validOrigins(record)?[]:null;
  if(!record||typeof record!=='object'||record.mode!=='all-except'||
     Object.keys(record).some(key=>!['mode','blockedOrigins'].includes(key))||
     !validOrigins(record.blockedOrigins))return null;
  return [...new Set(record.blockedOrigins)];
}
export function installedSiteAllowed(settings,id,url) {
  const origin=websiteOrigin(url),blocked=installedSiteBlocks(settings,id);
  return Boolean(origin&&blocked!==null&&!blocked.includes(origin));
}
export function blockedInstalledOrigins(settings,id) {
  return installedSiteBlocks(settings,id)||[];
}
export function changeInstalledSiteAccess(settings,id,url,allow) {
  const origin=websiteOrigin(url),previous=installedSiteBlocks(settings,id);
  if(!origin||typeof allow!=='boolean')throw Error('无效的网站或工具 ID');
  if(previous===null)throw Error('工具网站设置损坏；已保留原设置并停止修改');
  const blocked=allow?previous.filter(value=>value!==origin):[...new Set([...previous,origin])];
  if(blocked.length>64)throw Error('单工具最多停用 64 个网站');
  const next={...settings};
  if(blocked.length)next[id]={mode:'all-except',blockedOrigins:blocked};else delete next[id];
  return next;
}
