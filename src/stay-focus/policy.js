// Product-owned identity, independent of Time Review and the public Browser SDK.
export const FOCUS_ID='stay-focus';
export const FOCUS_CAPABILITY='focus.control';
export const FOCUS_PROTOCOL='opendesk.stay-focus.v1';
export const FOCUS_STORE='opendesk.stay-focus.state.v1';
export const FOCUS_SESSION='opendesk.stay-focus.session.v1';
export const FOCUS_ALARM='opendesk.stay-focus.heartbeat.v1';
export const FOCUS_RULE_FIRST=730000;
export const FOCUS_RULE_LAST=730199;
export const FOCUS_MAX_SITES=60;
export const FOCUS_MAX_GAP_MS=45000;
export const FOCUS_OPERATIONS=Object.freeze(['focus.status','focus.enable','focus.disable','focus.site.put',
  'focus.site.remove','focus.group.put','focus.group.remove','focus.schedule.set','focus.whitelist.set',
  'focus.session.start','focus.session.stop','focus.clear']);
export const FOCUS_MUTATIONS=Object.freeze(FOCUS_OPERATIONS.filter(op=>op!=='focus.status'));
export const focusError=(message,code='E_FOCUS_DATA')=>Object.assign(new Error(message),{code});
export function focusHost(value){
  if(typeof value!=='string'||value.length>1024)return null;
  try{
    const input=value.trim(),url=new URL(/^https?:\/\//i.test(input)?input:'https://'+input);
    if(!['http:','https:'].includes(url.protocol)||url.username||url.password)return null;
    const host=url.hostname.toLowerCase().replace(/\.$/,'');
    if(host.length>253||!host||(!host.includes('.')&&host!=='localhost'))return null;
    if(!/^[a-z0-9.-]+$/.test(host)||host.split('.').some(part=>!part||part.length>63||!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(part)))return null;
    return host;
  }catch{return null;}
}
export function hostnameMatches(host,site,includeSubdomains=false){
  return host===site||Boolean(includeSubdomains&&host.endsWith('.'+site));
}
// Convert Chrome's permission-removal match patterns to the exact site
// policies they may cover. Unknown patterns never revoke unrelated sites.
export function focusRemovedOriginAffectsSite(pattern,site){
  if(typeof pattern!=='string'||!site||typeof site.host!=='string')return false;
  if(pattern==='<all_urls>'||/^(?:\*|https?)\:\/\/\*\/\*$/.test(pattern))return true;
  const match=/^(?:https?|\*):\/\/(\*\.)?([a-z0-9.-]+)\/\*$/i.exec(pattern);
  if(!match)return false;
  const removedHost=focusHost('https://'+match[2]);
  if(!removedHost)return false;
  // Removed exact host intersects a site that explicitly includes its children.
  if(hostnameMatches(removedHost,site.host,site.subdomains===true))return true;
  // A removed wildcard covers the site's base domain or its subdomains.
  if(match[1]&&hostnameMatches(site.host,removedHost,true))return true;
  return false;
}
export function focusLocalDay(at){
  const date=new Date(at);
  return [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
}
export function focusNextMidnight(at){
  const date=new Date(at);date.setHours(0,0,0,0);date.setDate(date.getDate()+1);return date.getTime();
}
export async function focusPackageHash(tool){
  const fields=['format','id','version','title','description','capabilities','html','css','js'];
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(fields.map(key=>tool[key]))));
  return Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
}
