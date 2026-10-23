// Read-only natural-language routing. Saved Bundle v2 is an immutable execution
// candidate, not a model instruction or an additional RunHost authority.
import {WORKFLOW_DYNAMIC_BUNDLE_FORMAT,inferDynamicReplayPlan,
  dynamicReplayIntent,simpleCommerceReplayGoal,replayParameterSchema} from './segment-replay.js';

const missingProduct=/^(?:请)?(?:搜索|查找|检索) ([\p{L}\p{N} _.-]{2,120})，(?:打开|点开|进入) ?(?:商品详情页|商品详情|详情页)，(?:核对|检查|验证|确认)\s*(?:商品)?名称(?:和|与)(?:价格|售价|标价)$/u;
const safeQuery=/^[\p{L}\p{N} _.-]{2,120}$/u;
export const naturalProductReply=value=>
  typeof value==='string'&&/^[\p{L}\p{N}][\p{L}\p{N} _.-]{2,119}$/u.test(value.trim())?
    value.trim():null;

export function selectSavedWorkflowRoute({request,target,records=[]}={}) {
  const complete=simpleCommerceReplayGoal(request);
  const normalized=typeof request==='string'?request.trim()
    .replace(/[。.!！]+$/gu,'').replace(/[,，]\s*/gu,'，').replace(/\s+/gu,' '):'';
  const partial=complete?null:normalized.match(missingProduct);
  if(!complete&&!partial)return {state:'AI'};
  if(!target||target.status!=='available'||target.frameId!==0||
    typeof target.origin!=='string'||typeof target.url!=='string')return {state:'AI'};
  const candidates=(Array.isArray(records)?records:[]).filter(row=>
    row?.format===WORKFLOW_DYNAMIC_BUNDLE_FORMAT&&
    row.workflow?.siteOrigin===target.origin&&
    row.segments?.[0]?.entryUrl===target.url);
  if(!candidates.length)return {state:'AI'};
  for(const row of candidates){
    try{
      if(JSON.stringify(replayParameterSchema(row.segments))!==
         JSON.stringify(row.paramsSchema))
        return {state:'BLOCKED',code:'E_WORKFLOW_BUNDLE'};
      const plan=inferDynamicReplayPlan(row);
      if(!plan||JSON.stringify(plan)!==JSON.stringify(row.bindingPlan))
        return {state:'BLOCKED',code:'E_WORKFLOW_PARAM_BINDING'};
      if(complete)dynamicReplayIntent(row,complete);
    }catch(error){return {state:'BLOCKED',code:error?.code||'E_WORKFLOW_BUNDLE'};}
  }
  if(partial&&!safeQuery.test(partial[1]))return {state:'BLOCKED',code:'E_WORKFLOW_PARAMS'};
  if(candidates.length>1)
    return {state:'AMBIGUOUS',candidates,params:complete,
      ...(partial?{query:partial[1]}:{})};
  return complete?{state:'MATCH',record:candidates[0],params:complete}:
    {state:'MISSING_PRODUCT',record:candidates[0],query:partial[1]};
}
