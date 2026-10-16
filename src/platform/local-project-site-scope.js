// Local development scope never grants Chrome permissions or installed Task scope.
function httpOrigin(value){
  if(typeof value!=='string')return false;
  try{
    const url=new URL(value);
    return ['http:','https:'].includes(url.protocol)&&url.origin===value;
  }catch{return false;}
}

export function validControllerProjectOrigins(origins){
  return Array.isArray(origins)&&origins.length===1&&
    (origins[0]==='<all_urls>'||httpOrigin(origins[0]));
}

export function localProjectAllowsOrigin(source,origin){
  if(!httpOrigin(origin))return false;
  const origins=source?.siteOrigins;
  if(source?.runtimeKind==='controller')
    return validControllerProjectOrigins(origins)&&(origins[0]==='<all_urls>'||origins[0]===origin);
  // Page rules are still checked by the existing Page preview Authority.
  return source?.runtimeKind==='page-userscript'&&
    (!origins?.length||Array.isArray(origins)&&origins.includes(origin));
}
