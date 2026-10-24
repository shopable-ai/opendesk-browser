// Stay Focus app-side business Controller. React invokes this facade; the
// fixed Chrome Worker receives ONLY finite v3 policies and SHA-sealed models.
import {emptyFocus,readFocus,focusSummary} from './model.js';
import {FOCUS_CATALOG,FOCUS_DEFAULT_GROUP,FOCUS_DEFAULT_MINUTES} from './catalog.js';
import {compileFocusPolicy} from './compile-site-policy.js';
import {mutateFocusModel} from './mutations.js';
import {normalizeManagedSiteV3Policy,canonicalManagedSiteV3ModelBytes}
  from '../../../../src/framework/sdk/site-budget-v3-policy.js';
const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
// The public Driver reports E_TOOL_CHANGED for a real legacy focus.control
// owner because it lacks browser.siteBudget. The private Host must independently
// prove the installed legacy identity before we cache the fallback.
const isLegacyCapabilityError=e=>['E_TOOL_CAPABILITY_REQUIRED','E_CAPABILITY',
  'E_TOOL_CAPABILITY','E_TOOL_CHANGED'].includes(e?.code);
const hashModel=async model=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',
  canonicalManagedSiteV3ModelBytes(model))),
  v=>v.toString(16).padStart(2,'0')).join('');
// A matching model SHA alone cannot prove that the finite native policy and
// its revision committed. Compare the normalized Driver policy as well.
function samePolicy(left,right){
  try{return JSON.stringify(normalizeManagedSiteV3Policy(left))===
    JSON.stringify(normalizeManagedSiteV3Policy(right));}
  catch{return false;}
}
function reflect(receipt,now){
  if(receipt?.kind!=='site-budget.v3'||!receipt.desiredPolicy||
     !Number.isSafeInteger(receipt.desiredPolicyRev)||
     !Number.isSafeInteger(receipt.appliedPolicyRev))
    fail('E_FOCUS_RECEIPT','公共 Driver 未返回完整 v3 状态');
  const original=receipt.sealedModel===null?emptyFocus(now):readFocus(receipt.sealedModel,now);
  const day=receipt.day??original.day;
  const state={...original,day,
    usage:receipt.usage??{},
    clockHighWater:receipt.clockHighWater??original.clockHighWater,
    enabled:original.enabled&&receipt.desiredPolicy.enabled,
    checkpoint:null};
  if(day!==original.day)state.notices={day,revision:original.notices.revision,budgetMs:null,thresholds:[]};
  const summary=focusSummary(state,now,FOCUS_CATALOG,FOCUS_DEFAULT_MINUTES);
  return {model:state,summary:{...summary,runtimeKind:'site-budget.v3',
    // The sealed product model deliberately drops legacy hash/epoch. Only the
    // authenticated public Driver may attest a current app-level site review.
    authorized:receipt.siteReviewActive===true,permissions:receipt.permissions,
    ruleReceipt:{verified:receipt.status==='applied'&&
      receipt.appliedPolicyRev===receipt.desiredPolicyRev},
    tabs:{moved:0,failed:0}},
    revision:receipt.desiredPolicyRev,receipt};
}
export function createFocusController({request,siteBudget,now=Date.now}={}){
  if(typeof request!=='function'||!siteBudget?.getStatus||!siteBudget?.setPolicy)
    throw Error('E_FOCUS_PUBLIC_SDK_REQUIRED');
  let legacy=null;
  const read=async()=>{
    if(legacy===true){
      try{return {kind:'legacy',summary:await request('focus.status',{})};}
      catch(error){
        // A still-open UI may observe the old tool being replaced by v3.
        // Accept ONLY an authenticated new public Driver lease. Never replay
        // the legacy mutation or treat an absent/revoked owner as migrated.
        if(!isLegacyCapabilityError(error))throw error;
        const receipt=await siteBudget.getStatus({});
        if(receipt?.kind!=='site-budget.v3')
          fail('E_FOCUS_POLICY_KIND','旧专注应用已失效，但新的公共 Driver 尚未核对');
        const view=reflect(receipt,now());
        legacy=false;return {kind:'v3',...view};
      }
    }
    try{
      const receipt=await siteBudget.getStatus({});
      if(receipt?.kind==='site-budget.v3'){legacy=false;return {kind:'v3',...reflect(receipt,now())};}
      fail('E_FOCUS_POLICY_KIND','当前应用没有 v3 合同，拒绝修改');
    }catch(error){
      // Only existing pre-v3 installations may use their old, separately
      // authorized tool operation. Never downgrade a known v3 instance.
      if(legacy!==false&&isLegacyCapabilityError(error)){
        // Do not pin the Controller to the legacy worker unless the original
        // trusted focus Host actually accepted this installed legacy owner.
        const summary=await request('focus.status',{});
        legacy=true;return {kind:'legacy',summary};
      }
      throw error;
    }
  };
  async function operate(operation,payload={}){
    if(operation==='focus.status')return (await read()).summary;
    if(operation==='focus.clear')
      fail('E_FOCUS_TRUSTED_ACTION','清空数据必须通过原可信扩展设置操作');
    const current=await read();
    if(current.kind==='legacy')return request(operation,payload);
    if(current.receipt.modelRef===null&&current.revision>0)
      fail('E_MIGRATION_REQUIRED','已有旧授权尚未迁移，拒绝清空原始数据');
    const model=mutateFocusModel(structuredClone(current.model),operation,payload,now(),
      current.model.groups[FOCUS_DEFAULT_GROUP]??FOCUS_DEFAULT_MINUTES);
    const desiredPolicy=normalizeManagedSiteV3Policy(compileFocusPolicy(model));
    // Native metering has ONE authority: the Driver ledger. Preserve the v1
    // model envelope for legacy migration but never seal a second usage copy.
    const sealedModel={...model,usage:{},checkpoint:null,clockHighWater:0,
      authorizedHash:null,authorizedEpoch:null};
    const modelRef=await hashModel(sealedModel);
    const unchanged=current.receipt.modelRef===modelRef&&
      samePolicy(current.receipt.desiredPolicy,desiredPolicy);
    // An idempotent no-op may retain its revision; a changed payload must
    // advance exactly once, not claim success from a stale or racing response.
    const expectedRevision=current.revision+(unchanged?0:1);
    try{
      const receipt=await siteBudget.setPolicy({expectedRev:current.revision,
        desiredPolicy,modelRef,sealedModel});
      const view=reflect(receipt,now());
      if(view.receipt.modelRef!==modelRef||
         view.revision!==expectedRevision||
         !samePolicy(view.receipt.desiredPolicy,desiredPolicy))
        fail('E_OUTCOME_UNKNOWN','v3 提交回执未能证明模型、策略和修订号一致');
      return view.summary;
    }catch(error){
      if(error?.code==='E_OUTCOME_UNKNOWN'){
        const observed=await siteBudget.getStatus({});
        if(observed?.kind==='site-budget.v3'&&observed.modelRef===modelRef&&
            observed.desiredPolicyRev===expectedRevision&&
            samePolicy(observed.desiredPolicy,desiredPolicy))
          return reflect(observed,now()).summary;
      }
      throw error;
    }
  }
  return Object.freeze({readStatus:async()=>(await read()).summary,operate});
}
