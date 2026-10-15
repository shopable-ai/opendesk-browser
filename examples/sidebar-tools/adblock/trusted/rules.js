// One dynamic MV3 DNR engine. AdBlock owns only 741000-741199.
// Priority: AdBlock block=1 < AdBlock site exception=2 < Stay Focus redirect>=20.
// allowAllRequests is confined to exact HTTP(S) top frame/subframe hostname;
// Chrome propagates it to subresources/descendant frames at equal/lower priority.
import {ADBLOCK_REQUEST_DOMAINS} from '../rules/domains.js';
import {ADBLOCK_RULE_FIRST,ADBLOCK_RULE_LAST,ADBLOCK_MAX_EXCEPTIONS,adblockError,adblockHost} from './policy.js';
export const isAdblockRuleId=id=>Number.isInteger(id)&&id>=ADBLOCK_RULE_FIRST&&id<=ADBLOCK_RULE_LAST;
const safeResources=Object.freeze(['script','image','xmlhttprequest','sub_frame','ping','media','other']);
const normalize=rule=>JSON.stringify({
  id:rule.id,priority:rule.priority??1,action:rule.action,
  condition:Object.fromEntries(Object.entries(rule.condition||{})
    .filter(([key,val])=>!(key==='isUrlFilterCaseSensitive'&&val===false))
    .map(([key,val])=>[key,Array.isArray(val)?[...val].sort():val])
    .sort(([a],[b])=>a.localeCompare(b)))
});
const same=(a,b)=>a.length===b.length&&a.every((r,i)=>normalize(r)===normalize(b[i]));
export function wantedAdblockRules(state){
  if(!state.enabled)return [];
  const exceptions=[...state.exceptions].sort();
  if(exceptions.length>ADBLOCK_MAX_EXCEPTIONS)throw adblockError('E_ADBLOCK_LIMIT','网站例外数量超过上限');
  const blocked={id:ADBLOCK_RULE_FIRST,priority:1,action:{type:'block'},
    condition:{requestDomains:[...ADBLOCK_REQUEST_DOMAINS],domainType:'thirdParty',
      resourceTypes:[...safeResources]}};
  const sites=exceptions.map((host,index)=>{
    if(adblockHost(host)!==host)throw adblockError('E_ADBLOCK_HOST','无效网站域名');
    const escaped=host.replace(/\./g,'\\.');
    return {id:ADBLOCK_RULE_FIRST+index+1,priority:2,action:{type:'allowAllRequests'},
      condition:{regexFilter:'^https?://'+escaped+'(?::[0-9]{1,5})?(?:[/?#]|$)',
        resourceTypes:['main_frame','sub_frame']}};
  });
  return [blocked,...sites];
}
export async function reconcileAdblockRules(api,wanted=[]){
  const dnr=api?.declarativeNetRequest;
  if(!dnr?.getDynamicRules||!dnr?.updateDynamicRules)
    throw adblockError('E_ADBLOCK_DNR','Chrome DNR 接口不可用');
  let all;
  try{all=await dnr.getDynamicRules();}
  catch{throw adblockError('E_OUTCOME_UNKNOWN','Chrome DNR 现有规则读取失败，不能确认或修改规则');}
  const owned=all.filter(x=>isAdblockRuleId(x.id)).sort((a,b)=>a.id-b.id);
  const desired=[...wanted].sort((a,b)=>a.id-b.id);
  if(desired.some(x=>!isAdblockRuleId(x.id)||!Number.isInteger(x.id))||
     new Set(desired.map(x=>x.id)).size!==desired.length)
    throw adblockError('E_ADBLOCK_RULE_ID','AdBlock 规则超出专属 ID 空间');
  // The extension shares one DNR identity: a site allowAllRequests must NEVER
  // out-prioritize another product's block/redirect. Fail closed, including on boot.
  if(desired.some(x=>x.action.type==='allowAllRequests')&&
     all.some(x=>!isAdblockRuleId(x.id)&&
       ['block','redirect','upgradeScheme','modifyHeaders'].includes(x.action?.type)&&
       (x.priority??1)<=2)){
    if(owned.length){
      await dnr.updateDynamicRules({removeRuleIds:owned.map(x=>x.id),addRules:[]});
      const remaining=(await dnr.getDynamicRules()).filter(x=>isAdblockRuleId(x.id));
      if(remaining.length)throw adblockError('E_OUTCOME_UNKNOWN','跨工具冲突后无法确认 AdBlock 安全清理');
    }
    throw adblockError('E_ADBLOCK_PRIORITY_CONFLICT','检测到其他工具低优先级规则，已安全关闭 AdBlock；不会用本站例外覆盖其他工具');
  }
  if(same(owned,desired))return {verified:true,changed:false,ruleIds:owned.map(x=>x.id)};
  let failure=null;
  try{await dnr.updateDynamicRules({removeRuleIds:owned.map(x=>x.id),addRules:desired});}
  catch(error){failure=error;}
  let after;
  try{after=(await dnr.getDynamicRules()).filter(x=>isAdblockRuleId(x.id)).sort((a,b)=>a.id-b.id);}
  catch{throw adblockError('E_OUTCOME_UNKNOWN','Chrome DNR 状态无法回读；不能确认请求过滤结果');}
  if(!same(after,desired))throw adblockError('E_OUTCOME_UNKNOWN',
    'Chrome DNR 写入与回读不一致，需再次核对（不会报告成功）'+(failure?'：'+String(failure.message||failure).slice(0,100):''));
  return {verified:true,changed:true,acknowledgementLost:Boolean(failure),ruleIds:after.map(x=>x.id)};
}
export async function clearAdblockRules(api){return reconcileAdblockRules(api,[]);}
