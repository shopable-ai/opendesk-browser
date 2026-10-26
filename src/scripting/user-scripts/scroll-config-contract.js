// Typed, inert data for one installed Page Program. This grants no website access.
export const SCROLL_CONFIG_PROGRAM_ID='opendesk.ai-scroll-navigation';
export const SCROLL_CONFIG_MIN_REVISION=3;
export const SCROLL_CONFIG_VERSION=1;
export const SCROLL_CONFIG_EMPTY=Object.freeze({version:1,sites:[]});
const error=(code,message)=>Object.assign(new Error(message),{code});
const requireValue=(ok,code,message)=>{if(!ok)throw error(code,message);};
const keys=(obj,expected)=>obj&&typeof obj==='object'&&!Array.isArray(obj)&&
  Object.keys(obj).every(k=>expected.includes(k))&&expected.every(k=>Object.hasOwn(obj,k));
const RULE_KEYS=['origin','pathScope','mainSelector','scrollSelector','messageSelector','anchorSelector','enabled'];
function urlOrigin(value) {
  requireValue(typeof value==='string'&&value.length<=256,'E_CONFIG_SCHEMA','站点 Origin 无效');
  let url;try{url=new URL(value);}catch{throw error('E_CONFIG_SCHEMA','站点 Origin 无效');}
  requireValue(['http:','https:'].includes(url.protocol)&&!url.username&&!url.password&&
    url.origin===value&&url.pathname==='/'&&!url.search&&!url.hash,
    'E_CONFIG_SCHEMA','必须使用精确的 HTTP(S) Origin');
  return url.origin;
}
function selector(value,required=false){
  requireValue(typeof value==='string','E_CONFIG_SCHEMA','CSS 选择器必须是字符串');
  const result=value.trim();
  requireValue((!required||result.length>0)&&result.length<=256&&
    !/[\u0000-\u001f\u007f{};]/.test(result),
    'E_CONFIG_SCHEMA','CSS 选择器为空、过长或包含不支持字符');
  return result;
}
function pathScope(value){
  requireValue(typeof value==='string'&&value.length>0&&value.length<=512&&
    value.startsWith('/')&&!value.startsWith('//')&&!/[?#\\\u0000-\u001f\u007f]/.test(value)&&
    !value.includes('/../')&&!value.endsWith('/..')&&!value.includes('/./'),
    'E_CONFIG_SCHEMA','路径范围应是明确的绝对路径前缀');
  return value;
}
export function scrollPathMatches(scope,pathname){
  if(typeof pathname!=='string')return false;
  return scope==='/'||pathname===scope||pathname.startsWith(scope.endsWith('/')?scope:scope+'/');
}
export function normalizeScrollConfig(input){
  requireValue(keys(input,['version','sites'])&&input.version===SCROLL_CONFIG_VERSION&&
    Array.isArray(input.sites)&&input.sites.length<=24,'E_CONFIG_SCHEMA','配置格式、版本或条目数无效');
  const seen=new Set(),sites=input.sites.map(value=>{
    requireValue(keys(value,RULE_KEYS)&&typeof value.enabled==='boolean',
      'E_CONFIG_SCHEMA','网站规则字段不完整或包含未知字段');
    const origin=urlOrigin(value.origin),scope=pathScope(value.pathScope);
    const unique=origin+'\n'+scope;
    requireValue(!seen.has(unique),'E_CONFIG_SCHEMA','同一网站路径规则不能重复');
    seen.add(unique);
    return {origin,pathScope:scope,
      mainSelector:selector(value.mainSelector,true),
      scrollSelector:selector(value.scrollSelector,true),
      messageSelector:selector(value.messageSelector),
      anchorSelector:selector(value.anchorSelector),
      enabled:value.enabled};
  });
  const normalized={version:SCROLL_CONFIG_VERSION,sites};
  requireValue(new TextEncoder().encode(JSON.stringify(normalized)).byteLength<=16384,
    'E_CONFIG_SCHEMA','网站规则数据超过 16 KiB');
  return normalized;
}
export function scrollConfigForUrl(input,href){
  let url;try{url=new URL(href);}catch{return null;}
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password)return null;
  const matches=(input?.sites||[]).filter(rule=>rule.enabled&&
    rule.origin===url.origin&&scrollPathMatches(rule.pathScope,url.pathname));
  matches.sort((a,b)=>b.pathScope.length-a.pathScope.length);
  return matches[0]||null;
}

/** Exact site Origin + segment-boundary path prefix. No wildcard Origin,
 * script grant, arbitrary JS or CSS-powered widening is possible here.
 */
export function scrollSiteInstallMatches(origin,scope='/'){
  const site=urlOrigin(origin),path=pathScope(scope);
  requireValue(!new URL(site).hostname.includes('*'),'E_CONFIG_SCOPE','必须使用无通配符的精确网站 Origin');
  requireValue(!new URL(site).port,'E_CONFIG_SCOPE','按端口独立授权尚未支持；请输入无自定义端口的 Origin');
  requireValue(!/[*?#\\u0000-\u001f\u007f]/.test(path)&&
    new URL(site+path).pathname===path,'E_CONFIG_SCOPE','网站路径不能包含通配符或隐式跳转');
  if(path==='/')return [site+'/*'];
  return [site+path,site+path+'?*',site+(path.endsWith('/')?path+'*':path+'/*')];
}
