// Trusted Stay Focus-only DNR ownership and readback; no time model or UI imports.
import {FOCUS_RULE_FIRST,FOCUS_RULE_LAST,focusError} from './policy.js';
export const isFocusRuleId=id=>Number.isInteger(id)&&id>=FOCUS_RULE_FIRST&&id<=FOCUS_RULE_LAST;
// Chrome can return fields in a different object order. Compare semantic
// condition/action values rather than serialization order or extra defaults.
const shape=rule=>JSON.stringify([
  rule.id,rule.priority,rule.action?.type,rule.action?.redirect?.extensionPath,
  rule.condition?.regexFilter,[...(rule.condition?.resourceTypes||[])].sort(),
  [...(rule.condition?.excludedRequestDomains||[])].sort()
]);
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
