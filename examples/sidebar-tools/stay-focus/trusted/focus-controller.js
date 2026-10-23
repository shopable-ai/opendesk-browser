// Stay Focus app-side business Controller. React invokes this facade; the
// fixed Chrome Worker receives ONLY finite v3 policies and SHA-sealed models.
import {emptyFocus,readFocus,focusSummary} from './model.js';
import {FOCUS_CATALOG,FOCUS_DEFAULT_GROUP,FOCUS_DEFAULT_MINUTES} from './catalog.js';
import {compileFocusPolicy} from './compile-site-policy.js';
import {mutateFocusModel} from './mutations.js';
import {normalizeManagedSiteV3Policy} from '../../../../src/platform/chrome/managed-site-v3-policy.js';
const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
const isLegacyCapabilityError=e=>['E_TOOL_CAPABILITY_REQUIRED','E_CAPABILITY','E_TOOL_CAPABILITY'].includes(e?.code);
const hashModel=async model=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',
  new TextEncoder().encode(JSON.stringify(model)))),
  v=>v.toString(16).padStart(2,'0')).join('');
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
  return {model:state,summary:{...summary,permissions:receipt.permissions,
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
    if(legacy===true)return {kind:'legacy',summary:await request('focus.status',{})};
    try{
      const receipt=await siteBudget.getStatus({});
      if(receipt?.kind==='site-budget.v3'){legacy=false;return {kind:'v3',...reflect(receipt,now())};}
      fail('E_FOCUS_POLICY_KIND','当前应用没有 v3 合同，拒绝修改');
    }catch(error){
      // Only existing pre-v3 installations may use their old, separately
      // authorized tool operation. Never downgrade a known v3 instance.
      if(legacy!==false&&isLegacyCapabilityError(error)){
        legacy=true;return {kind:'legacy',summary:await request('focus.status',{})};
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
    const modelRef=await hashModel(model);
    try{
      const receipt=await siteBudget.setPolicy({expectedRev:current.revision,
        desiredPolicy,modelRef,sealedModel:model});
      const view=reflect(receipt,now());
      if(view.receipt.modelRef!==modelRef||view.revision!==current.revision+1&&
         JSON.stringify(current.receipt.desiredPolicy)!==JSON.stringify(desiredPolicy))
        fail('E_OUTCOME_UNKNOWN','v3 提交回执未能证明模型与策略已经同步');
      return view.summary;
    }catch(error){
      if(error?.code==='E_OUTCOME_UNKNOWN'){
        const observed=await siteBudget.getStatus({});
        if(observed?.kind==='site-budget.v3'&&observed.modelRef===modelRef)
          return reflect(observed,now()).summary;
      }
      throw error;
    }
  }
  return Object.freeze({readStatus:async()=>(await read()).summary,operate});
}
