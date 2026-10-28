// Local development scope never grants Chrome permissions or installed Task scope.
function httpOrigin(value){
  if(typeof value!=='string')return false;
  try{
    const url=new URL(value);
    return ['http:','https:'].includes(url.protocol)&&!url.hostname.includes('*')&&url.origin===value;
  }catch{return false;}
}

export function validExactSiteOrigins(origins){
  return Array.isArray(origins)&&origins.length>=1&&origins.length<=8&&
    new Set(origins).size===origins.length&&[...origins].every(httpOrigin);
}

export function validControllerProjectOrigins(origins){
  return validExactSiteOrigins(origins)||
    Array.isArray(origins)&&origins.length===1&&origins[0]==='<all_urls>';
}

export function localProjectAllowsOrigin(source,origin){
  if(!httpOrigin(origin))return false;
  const origins=source?.siteOrigins;
  if(source?.runtimeKind==='controller')
    return validControllerProjectOrigins(origins)&&(origins[0]==='<all_urls>'||origins.includes(origin));
  // Page rules are still checked by the existing Page preview Authority.
  return source?.runtimeKind==='page-userscript'&&
    (!origins?.length||Array.isArray(origins)&&origins.includes(origin));
}
