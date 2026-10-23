// Audited, fixed native DNR projection of a finite v3 site-budget policy.
// Installed applications submit only normalized data. Never run app JavaScript
// here or allow package code to select DNR IDs, Chrome operations or paths.
import {normalizeManagedSiteV3Policy,normalizeManagedSiteV3Usage,
  evaluateManagedSiteV3,matchesManagedSiteV3Host} from './managed-site-v3-policy.js';

// Only four fixed Browser-owned destinations, never app supplied.
const REASONS=Object.freeze({temporary:'session','weekly-window':'schedule',
  'constant-deny':'always','counter-limit':'quota'});
export function managedSiteV3BlockedPath(reason){
  const name=Object.hasOwn(REASONS,reason)?REASONS[reason]:null;
  return name?'/managed-site/blocked-'+name+'.html':null;
}
export const MANAGED_SITE_V3_RULE_FIRST=753000;
export const MANAGED_SITE_V3_RULES_PER_OWNER=60;

export function managedSiteV3RuleRange(slot){
  if(!Number.isInteger(slot)||slot<0||slot>=12)
    throw Object.assign(new Error('Invalid managed rule owner'),{code:'E_MANAGED_DNR_SCOPE'});
  const first=MANAGED_SITE_V3_RULE_FIRST+slot*MANAGED_SITE_V3_RULES_PER_OWNER;
  return {first,last:first+MANAGED_SITE_V3_RULES_PER_OWNER-1};
}
export function isManagedSiteV3RuleId(slot,id){
  const range=managedSiteV3RuleRange(slot);
  return Number.isInteger(id)&&id>=range.first&&id<=range.last;
}
export function desiredManagedSiteV3Rules(raw,rawUsage,at,slot){
  const policy=normalizeManagedSiteV3Policy(raw);
  const usage=normalizeManagedSiteV3Usage(rawUsage);
  const range=managedSiteV3RuleRange(slot);
  if(!Number.isSafeInteger(at)||at<0)
    throw Object.assign(new Error('Invalid native policy time'),{code:'E_MANAGED_TIME'});
  const rules=[],sorted=[...policy.sites].sort((a,b)=>a.host.localeCompare(b.host));
  for(const [index,site] of sorted.entries()){
    const effect=evaluateManagedSiteV3(policy,usage,site.host,at);
    if(!effect)continue;
    // RE2 expression is anchored at the URL hostname boundary. A paused
    // child or a more-specific site overrides its parent, even when its own
    // rule is inactive. DNR excludedRequestDomains also exempts descendants.
    const escape=site.host.replace(/\./g,'\\.');
    const scope=site.subdomains?'(?:[a-z0-9-]+\\.)*'+escape:escape;
    const exclude=[...new Set([...policy.whitelist,
      ...policy.sites.filter(child=>child!==site&&
        matchesManagedSiteV3Host(child.host,site.host,site.subdomains))
        .map(child=>child.host)])].filter(host=>host!==site.host);
    const condition={regexFilter:'^https?://'+scope+'\\.?(?::[0-9]{1,5})?(?:[/?#]|$)',
      resourceTypes:['main_frame']};
    if(exclude.length)condition.excludedRequestDomains=exclude;
    rules.push({id:range.first+index,
      priority:20+site.host.split('.').length*4+(site.subdomains?0:1),
      action:{type:'redirect',redirect:{
        extensionPath:managedSiteV3BlockedPath(effect.reason)}},condition});
  }
  return rules;
}
