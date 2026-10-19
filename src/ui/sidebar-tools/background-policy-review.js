// Policy-only upgrade comparison for every installed Sidebar Tool using
// the bounded site-budget package contract. No browser permissions or code
// execution are granted by this read-only reviewer.
import {normalizeSidebarToolBackgroundPolicy,SIDEBAR_TOOL_BACKGROUND_POLICY_KIND_V2} from './background-policy.js';

export function compareSidebarToolBackgroundPolicies(previous,candidate){
  const before=normalizeSidebarToolBackgroundPolicy(previous);
  const after=normalizeSidebarToolBackgroundPolicy(candidate);
  if(before===undefined&&after===undefined)return null;
  const oldSites=new Map((before?.suggestions||[]).map(row=>[row.host,row]));
  const newSites=new Map((after?.suggestions||[]).map(row=>[row.host,row]));
  const sorted=values=>[...values].sort((a,b)=>a.localeCompare(b));
  const scopeKnown=before?.kind===SIDEBAR_TOOL_BACKGROUND_POLICY_KIND_V2&&
    after?.kind===SIDEBAR_TOOL_BACKGROUND_POLICY_KIND_V2;
  const from=new Set(scopeKnown?before.defaultSites:[]);
  const to=new Set(scopeKnown?after.defaultSites:[]);
  return Object.freeze({
    previousKind:before?.kind||null,
    candidateKind:after?.kind||null,
    scopeKnown,
    addedDefaults:sorted([...to].filter(host=>!from.has(host))),
    removedDefaults:sorted([...from].filter(host=>!to.has(host))),
    addedSuggestions:sorted([...newSites.keys()].filter(host=>!oldSites.has(host))),
    removedSuggestions:sorted([...oldSites.keys()].filter(host=>!newSites.has(host))),
    changedSuggestions:sorted([...newSites.keys()].filter(host=>
      oldSites.has(host)&&JSON.stringify(oldSites.get(host))!==JSON.stringify(newSites.get(host)))),
    dailyMinutesChanged:scopeKnown&&before.dailyMinutes!==after.dailyMinutes,
    scheduleChanged:scopeKnown&&JSON.stringify(before.schedule)!==JSON.stringify(after.schedule),
    changed:JSON.stringify(before)!==JSON.stringify(after)
  });
}

export function describeSidebarToolBackgroundPolicyChange(previous,candidate){
  const diff=compareSidebarToolBackgroundPolicies(previous,candidate);
  if(!diff||!diff.changed)return '';
  const parts=[];
  const hosts=(names)=>names.slice(0,10).join('、')+(names.length>10?' 等 '+names.length+' 个网站':'');
  if(!diff.scopeKnown&&diff.candidateKind===SIDEBAR_TOOL_BACKGROUND_POLICY_KIND_V2)
    parts.push('旧版本没有可比较的完整初始规则清单，需人工核对新模板');
  if(diff.addedDefaults.length)parts.push('新增建议受管站点：'+hosts(diff.addedDefaults));
  if(diff.removedDefaults.length)parts.push('从新模板移除的站点：'+hosts(diff.removedDefaults));
  if(diff.addedSuggestions.length)parts.push('新增推荐：'+hosts(diff.addedSuggestions));
  if(diff.removedSuggestions.length)parts.push('撤下推荐：'+hosts(diff.removedSuggestions));
  if(diff.changedSuggestions.length)parts.push('推荐属性调整：'+hosts(diff.changedSuggestions));
  if(diff.dailyMinutesChanged)parts.push('初始每日额度调整：'+previous.dailyMinutes+' → '+candidate.dailyMinutes+' 分钟');
  if(diff.scheduleChanged)parts.push('初始工作时段设置有变化');
  if(!parts.length)parts.push('模板内容或策略合同已更改');
  return '后台规则审阅：'+parts.join('；')+
    '。已保存的网站、额度、工作时段、白名单和暂停状态不因更新自动覆盖；任何新增限制仍需用户逐站确认并重新授权执行。';
}
