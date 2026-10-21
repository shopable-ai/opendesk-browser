// Code-free, bounded, independently installable policy metadata.
// An installed JSON package is never a worker executable or a Chrome permission grant.
export const SIDEBAR_TOOL_BACKGROUND_POLICY_KIND='site-budget.v1';
export const SIDEBAR_TOOL_BACKGROUND_POLICY_KIND_V2='site-budget.v2';
export const SIDEBAR_TOOL_BACKGROUND_POLICY_MAX_SITES=40;
const fail=message=>{throw Object.assign(new Error(message),{code:'E_TOOL_POLICY'});};
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&
  (Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
const exact=(value,names)=>plain(value)&&Object.keys(value).sort().join(',')===names.slice().sort().join(',');
const text=value=>typeof value==='string'&&value.length>0&&value.length<=80&&
  value===value.trim()&&!/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(value);
function canonicalHost(host){
  if(typeof host!=='string'||host.length>253||!host.includes('.')||
     host!==host.toLowerCase()||!/^[a-z0-9.-]+$/.test(host)||
     /^\d+(?:\.\d+){3}$/.test(host))return false;
  return host.split('.').every(label=>label.length<=63&&
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label));
}
function schedule(raw){
  if(!exact(raw,['enabled','days','startMinute','endMinute'])||
     typeof raw.enabled!=='boolean'||!Array.isArray(raw.days)||raw.days.length>7||
     new Set(raw.days).size!==raw.days.length||
     raw.days.some(day=>!Number.isInteger(day)||day<0||day>6)||
     !Number.isInteger(raw.startMinute)||raw.startMinute<0||raw.startMinute>1439||
     !Number.isInteger(raw.endMinute)||raw.endMinute<0||raw.endMinute>1440||
     raw.startMinute===raw.endMinute)
    fail('网站预算模板的工作时段不合法');
  return {enabled:raw.enabled,days:[...raw.days],startMinute:raw.startMinute,endMinute:raw.endMinute};
}
export function normalizeSidebarToolBackgroundPolicy(raw){
  if(raw===undefined)return undefined;
  const v1=raw?.kind===SIDEBAR_TOOL_BACKGROUND_POLICY_KIND;
  const v2=raw?.kind===SIDEBAR_TOOL_BACKGROUND_POLICY_KIND_V2;
  if(!(v1&&exact(raw,['kind','suggestions'])||
       v2&&exact(raw,['kind','dailyMinutes','defaultSites','schedule','suggestions']))||
     !Array.isArray(raw.suggestions)||raw.suggestions.length>SIDEBAR_TOOL_BACKGROUND_POLICY_MAX_SITES||
     new TextEncoder().encode(JSON.stringify(raw)).byteLength>8192)
    fail('后台策略模板格式或大小无效；只允许有限的网站预算声明');
  const hosts=new Set(),limitHosts=new Set();
  const suggestions=raw.suggestions.map(row=>{
    if(!exact(row,['host','name','category','suggestLimit','quick'])||
       !canonicalHost(row.host)||hosts.has(row.host)||!text(row.name)||
       !text(row.category)||row.category.length>40||
       typeof row.suggestLimit!=='boolean'||typeof row.quick!=='boolean'||
       row.quick&&!row.suggestLimit)
      fail('后台策略模板包含无效、重复或未经支持的网站条目');
    hosts.add(row.host);
    if(row.suggestLimit)limitHosts.add(row.host);
    return {host:row.host,name:row.name,category:row.category,
      suggestLimit:row.suggestLimit,quick:row.quick};
  });
  if(v1)return {kind:SIDEBAR_TOOL_BACKGROUND_POLICY_KIND,suggestions};
  if(!Number.isInteger(raw.dailyMinutes)||raw.dailyMinutes<1||raw.dailyMinutes>1440||
     !Array.isArray(raw.defaultSites)||raw.defaultSites.length>SIDEBAR_TOOL_BACKGROUND_POLICY_MAX_SITES||
     new Set(raw.defaultSites).size!==raw.defaultSites.length||
     raw.defaultSites.some(host=>!canonicalHost(host)||!limitHosts.has(host)))
    fail('首次启用的网站与每日共享额度配置无效');
  return {kind:SIDEBAR_TOOL_BACKGROUND_POLICY_KIND_V2,dailyMinutes:raw.dailyMinutes,
    defaultSites:[...raw.defaultSites],schedule:schedule(raw.schedule),suggestions};
}

 // Public mutable site-budget configuration. App code cannot inject rules or
 // change native DNR actions; hostnames must already be reviewed in the package.
export function normalizeManagedSiteBudgetSettings(raw){
  const keys=['enabled','dailyMinutes','sites','schedule'];
  const hasRevision=plain(raw)&&Object.hasOwn(raw,'expectedRev');
  if(!exact(raw,hasRevision?[...keys,'expectedRev']:keys)||
     typeof raw.enabled!=='boolean'||
     !Number.isInteger(raw.dailyMinutes)||raw.dailyMinutes<1||raw.dailyMinutes>1440||
     !Array.isArray(raw.sites)||raw.sites.length>SIDEBAR_TOOL_BACKGROUND_POLICY_MAX_SITES||
     raw.sites.some(host=>!canonicalHost(host))||
     new Set(raw.sites).size!==raw.sites.length||
     hasRevision&&(!Number.isSafeInteger(raw.expectedRev)||raw.expectedRev<0))
    fail('受管网站预算设置无效；只能使用有限网站、每日额度和固定时段');
  return {enabled:raw.enabled,dailyMinutes:raw.dailyMinutes,
    sites:[...raw.sites],schedule:schedule(raw.schedule)};
}
