// Reserved DNR rule IDs for Stay Focus. Never edit another module's rules.
import {FOCUS_RULE_FIRST,FOCUS_MAX_SITES,focusHost,focusError} from './policy.js';
import {focusReason} from './model.js';
import {isFocusRuleId} from './rule-ownership.js';
export {isFocusRuleId,reconcileFocusRules,clearFocusRules} from './rule-ownership.js';
const paths=Object.freeze({quota:'/stay-focus/blocked-quota.html',schedule:'/stay-focus/blocked-schedule.html',
  session:'/stay-focus/blocked-session.html',always:'/stay-focus/blocked-always.html'});
export function focusRuleForSite(site,id,reason,whitelist=[]){
  if(!isFocusRuleId(id)||focusHost(site.host)!==site.host||!paths[reason])
    throw focusError('无效的网站拦截规则','E_FOCUS_RULE');
  const quoted=site.host.replace(/\./g,'\\.');
  const host=site.subdomains?'(?:[a-z0-9-]+\\.)*'+quoted:quoted;
  const condition={regexFilter:'^https?://'+host+'\\.?(?::[0-9]{1,5})?(?:[/?#]|$)',
    resourceTypes:['main_frame']};
  if(whitelist.length)condition.excludedRequestDomains=whitelist;
  return {id,priority:20+site.host.split('.').length*4+(site.subdomains?0:1),
    action:{type:'redirect',redirect:{extensionPath:paths[reason]}},condition};
}
export function wantedFocusRules(state,at=Date.now()){
  const rules=[];
  if(!state.enabled)return rules;
  for(const site of state.sites.slice().sort((a,b)=>a.host.localeCompare(b.host))){
    const reason=focusReason(state,site,at);
    if(reason){
      const overrides=site.subdomains?state.sites.filter(child=>
        child.host!==site.host&&child.host.endsWith('.'+site.host)).map(child=>child.host):[];
      // Chrome excludedRequestDomains excludes descendants as well. The model
      // therefore requires an overriding child site to include subdomains.
      const excluded=[...new Set([...state.whitelist,...overrides])];
      rules.push(focusRuleForSite(site,FOCUS_RULE_FIRST+rules.length,reason,excluded));
    }
  }
  if(rules.length>FOCUS_MAX_SITES)throw focusError('限制网站数量超过安全上限','E_FOCUS_RULE');
  return rules;
}
