// Shared, precompiled MV3 primitives for managed site policies.
// This is not an installed-tool JavaScript loader or a new Host/Authority.
// Only trusted extensions with an independently validated tool lease may call it.
export async function observeManagedForeground(api,{ready,hostFromUrl,siteForHost}){
  if(!ready)return null;
  if(await api.idle.queryState(60)!=='active')return null;
  const win=await api.windows.getLastFocused();
  if(!win?.focused||win.incognito||win.type!=='normal')return null;
  const tabs=await api.tabs.query({active:true,windowId:win.id});
  const tab=tabs.length===1?tabs[0]:null;
  if(!tab?.url||tab.incognito||tab.pendingUrl)return null;
  const host=hostFromUrl(tab.url),site=siteForHost(host);
  if(!site)return null;
  const address=new URL(tab.url);
  const originPattern=address.protocol+'//'+address.hostname+'/*';
  if(!await api.permissions.contains({origins:[originPattern]}))return null;
  return {host,site,tabId:tab.id,windowId:win.id};
}

// Persist the returned state with the caller's existing verified storage
// transaction. No elapsed time is inferred after a Worker/Chrome gap,
// tab switch, idle transition, local-day boundary or timezone change.
export function settleManagedSiteBudget(state,{at,session,current=null,boot=false},{
  dayFor,poolFor,matchSite,blockedAt,maxGapMs
}){
  const today=dayFor(at),cp=state.checkpoint,offset=new Date(at).getTimezoneOffset();
  if(at<state.clockHighWater){state.checkpoint=null;return {state,clockRollback:true};}
  if(today>state.day){state.day=today;state.usage={};state.checkpoint=null;}
  if(today<state.day){state.checkpoint=null;return {state,clockRollback:true};}
  state.clockHighWater=at;
  if(cp&&current&&cp.host===current.host&&cp.tabId===current.tabId&&
      cp.windowId===current.windowId&&cp.pool===poolFor(current.site)&&
      cp.session===session&&!boot&&cp.day===today&&cp.offset===offset&&
      at>=cp.at&&at-cp.at<=maxGapMs&&state.enabled){
    const site=matchSite(state,cp.host);
    if(site&&poolFor(site)===cp.pool&&!blockedAt(state,site,cp.at)){
      const duration=Math.min(at-cp.at,maxGapMs);
      state.usage[cp.pool]=Math.min(86400000,(state.usage[cp.pool]||0)+duration);
    }
  }
  state.checkpoint=null;
  if(current&&state.enabled&&current.site&&!blockedAt(state,current.site,at))
    state.checkpoint={host:current.host,tabId:current.tabId,windowId:current.windowId,
      pool:poolFor(current.site),at,day:today,offset,session};
  return {state,clockRollback:false};
}

// DNR is a shared Chrome extension resource. Each app owns only a fixed,
// audited ID range. Perform a fresh native readback after every change.
// The app supplies its already-vetted rule shape and error domain; no
// dynamically installed package can choose ownsRule, sign its own scope,
// or execute code in this privileged module.
export async function reconcileManagedDynamicRules(api,{
  wanted=[],ownsRule,signature,error
}){
  const problem=typeof error==='function'?error:
    (message,code)=>Object.assign(new Error(message),{code});
  const dnr=api?.declarativeNetRequest;
  if(!dnr?.getDynamicRules||!dnr?.updateDynamicRules)
    throw problem('浏览器未提供可信 DNR 规则接口','E_MANAGED_DNR_UNAVAILABLE');
  if(!Array.isArray(wanted)||typeof ownsRule!=='function'||typeof signature!=='function'||
     wanted.some(row=>!ownsRule(row?.id))||
     new Set(wanted.map(row=>row.id)).size!==wanted.length)
    throw problem('受管规则超出应用拥有的 ID 范围或包含重复 ID','E_MANAGED_DNR_SCOPE');
  const actual=(await dnr.getDynamicRules()).filter(row=>ownsRule(row.id))
    .sort((a,b)=>a.id-b.id);
  const proposed=wanted.slice().sort((a,b)=>a.id-b.id);
  if(actual.length===proposed.length&&
     actual.every((row,index)=>signature(row)===signature(proposed[index])))
    return {changed:false,ruleIds:actual.map(row=>row.id),verified:true};
  await dnr.updateDynamicRules({removeRuleIds:actual.map(row=>row.id),addRules:proposed});
  const readback=(await dnr.getDynamicRules()).filter(row=>ownsRule(row.id))
    .sort((a,b)=>a.id-b.id);
  if(readback.length!==proposed.length||
     readback.some((row,index)=>signature(row)!==signature(proposed[index])))
    throw problem('DNR 写入回执与真实规则不一致，请重新对账','E_MANAGED_DNR_MISMATCH');
  return {changed:true,ruleIds:readback.map(row=>row.id),verified:true};
}
