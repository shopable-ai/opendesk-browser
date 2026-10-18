// Code-free bounded package metadata; never a worker executable or Chrome grant.
export const SIDEBAR_TOOL_BACKGROUND_POLICY_KIND='site-budget.v1';
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
export function normalizeSidebarToolBackgroundPolicy(raw){
  if(raw===undefined)return undefined;
  if(!exact(raw,['kind','suggestions'])||raw.kind!==SIDEBAR_TOOL_BACKGROUND_POLICY_KIND||
     !Array.isArray(raw.suggestions)||raw.suggestions.length>SIDEBAR_TOOL_BACKGROUND_POLICY_MAX_SITES||
     new TextEncoder().encode(JSON.stringify(raw)).byteLength>8192)
    fail('后台策略模板格式或大小无效；仅支持有限的网站预算建议');
  const hosts=new Set();
  const suggestions=raw.suggestions.map(row=>{
    if(!exact(row,['host','name','category','suggestLimit','quick'])||
       !canonicalHost(row.host)||hosts.has(row.host)||!text(row.name)||
       !text(row.category)||row.category.length>40||
       typeof row.suggestLimit!=='boolean'||typeof row.quick!=='boolean'||
       row.quick&&!row.suggestLimit)
      fail('后台策略模板包含无效、重复或未经支持的网站条目');
    hosts.add(row.host);
    return {host:row.host,name:row.name,category:row.category,
      suggestLimit:row.suggestLimit,quick:row.quick};
  });
  return {kind:SIDEBAR_TOOL_BACKGROUND_POLICY_KIND,suggestions};
}
