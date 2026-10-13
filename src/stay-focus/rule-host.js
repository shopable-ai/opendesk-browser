// Reserved DNR rule IDs for Stay Focus. Never edit another module's rules.
import {FOCUS_RULE_FIRST,FOCUS_RULE_LAST,FOCUS_MAX_SITES,focusHost,focusError} from './policy.js';
import {focusReason} from './model.js';
export const isFocusRuleId=id=>Number.isInteger(id)&&id>=FOCUS_RULE_FIRST&&id<=FOCUS_RULE_LAST;
const paths=Object.freeze({quota:'/stay-focus/blocked-quota.html',schedule:'/stay-focus/blocked-schedule.html',
  session:'/stay-focus/blocked-session.html',always:'/stay-focus/blocked-always.html'});
export function focusRuleForSite(site,id,reason,whitelist=[]){
  if(!isFocusRuleId(id)||focusHost(site.host)!==site.host||!paths[reason])
    throw focusError('无效的网站拦截规则','E_FOCUS_RULE');
  const quoted=site.host.replace(/\./g,'\\.');
  const host=site.subdomains?'(?:[a-z0-9-]+\\.)*'+quoted:quoted;
  const condition={regexFilter:'^https?://'+host+'(?::[0-9]{1,5})?(?:[/?#]|$)',
    resourceTypes:['main_frame']};
  if(whitelist.length)condition.excludedRequestDomains=whitelist;
  return {id,priority:20,action:{type:'redirect',redirect:{extensionPath:paths[reason]}},condition};
}
export function wantedFocusRules(state,at=Date.now()){
  const rules=[];
  if(!state.enabled)return rules;
  for(const site of state.sites.slice().sort((a,b)=>a.host.localeCompare(b.host))){
    const reason=focusReason(state,site,at);
    if(reason)rules.push(focusRuleForSite(site,FOCUS_RULE_FIRST+rules.length,reason,state.whitelist));
  }
  if(rules.length>FOCUS_MAX_SITES)throw focusError('限制网站数量超过安全上限','E_FOCUS_RULE');
  return rules;
}
const shape=rule=>JSON.stringify({id:rule.id,priority:rule.priority,action:rule.action,
  condition:rule.condition});
export async function reconcileFocusRules(api,wanted=[]){
  const dnr=api?.declarativeNetRequest;
  if(!dnr?.getDynamicRules||!dnr?.updateDynamicRules)
    throw focusError('浏览器未提供可信 DNR 规则接口','E_FOCUS_DNR_UNAVAILABLE');
  const actual=(await dnr.getDynamicRules()).filter(row=>isFocusRuleId(row.id)).sort((a,b)=>a.id-b.id);
  const proposed=wanted.slice().sort((a,b)=>a.id-b.id);
  if(actual.length===proposed.length&&actual.every((row,index)=>shape(row)===shape(proposed[index])))
    return {changed:false,ruleIds:actual.map(row=>row.id),verified:true};
  await dnr.updateDynamicRules({removeRuleIds:actual.map(row=>row.id),addRules:proposed});
  const readback=(await dnr.getDynamicRules()).filter(row=>isFocusRuleId(row.id)).sort((a,b)=>a.id-b.id);
  if(readback.length!==proposed.length||readback.some((row,index)=>shape(row)!==shape(proposed[index])))
    throw focusError('DNR 写入回执与真实规则不一致，请重新对账','E_FOCUS_DNR_MISMATCH');
  return {changed:true,ruleIds:readback.map(row=>row.id),verified:true};
}
export function clearFocusRules(api){return reconcileFocusRules(api,[]);}
