// Trusted Stay Focus-only DNR ownership and readback; no time model or UI imports.
import {FOCUS_RULE_FIRST,FOCUS_RULE_LAST,focusError} from './policy.js';
import {reconcileManagedDynamicRules} from '../../../src/platform/chrome/browser-managed-site-policy.js';
export const isFocusRuleId=id=>Number.isInteger(id)&&id>=FOCUS_RULE_FIRST&&id<=FOCUS_RULE_LAST;
// Chrome can return fields in a different object order. Compare semantic
// condition/action values rather than serialization order or extra defaults.
// Compare *all* behavior-affecting fields, not only the fields we generate.
// Otherwise a cached Chrome rule with an unexpected requestDomains/redirect
// condition could be reported "verified" while silently allowing/redirecting
// different URLs. Ignore only Chrome's equivalent explicit default (false).
const extra=(value,fields)=>Object.entries(value||{})
  .filter(([name,item])=>!fields.includes(name)&&
    !(name==='isUrlFilterCaseSensitive'&&item===false))
  .sort(([a],[b])=>a.localeCompare(b));
const shape=rule=>JSON.stringify([
  rule.id,rule.priority,rule.action?.type,rule.action?.redirect?.extensionPath,
  rule.condition?.regexFilter,[...(rule.condition?.resourceTypes||[])].sort(),
  [...(rule.condition?.excludedRequestDomains||[])].sort(),
  extra(rule.action,['type','redirect']),
  extra(rule.action?.redirect,['extensionPath']),
  extra(rule.condition,['regexFilter','resourceTypes','excludedRequestDomains'])
]);
const mappedFocusDnrError=(message,code)=>focusError(message,
  code==='E_MANAGED_DNR_MISMATCH'?'E_FOCUS_DNR_MISMATCH':code);
export function reconcileFocusRules(api,wanted=[]){
  return reconcileManagedDynamicRules(api,{wanted,ownsRule:isFocusRuleId,
    signature:shape,error:mappedFocusDnrError});
}
export function clearFocusRules(api){return reconcileFocusRules(api,[]);}
