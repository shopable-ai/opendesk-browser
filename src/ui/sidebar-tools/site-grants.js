// Browser-owned positive-only per-tool site grants, shared without importing another plugin's policy.
// Keep the validated origin and 64-site storage contract stable for existing installations.
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
