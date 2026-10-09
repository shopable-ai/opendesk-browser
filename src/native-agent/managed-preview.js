import {FoundationError,invariant,canonical} from '../platform/protocol.js';
import {managedUIBootstrapSource,managedUIRetireSource} from '../scripting/user-scripts/managed-ui-lifecycle.js';

// Optional local-development control, packaged in the EXISTING fixed Native
// transport script. The original preview service owns admission/target checks
// and all project execution. These injections contain only fixed UI lifecycle
// control and share its exact named-world ledger; no new runner or service.
export function createManagedUIPreview({worlds,assertHost,verifyTarget}){
  const format='opendesk.managed-ui.v1';
  const read=async(previewId,host)=>{
    const row=(await worlds.records()).find(row=>row.managed?.previewId===previewId),data=row?.managed;
    invariant(data&&data.registrationId===host.registrationId,'E_UI_OWNER','受管界面不属于当前工作台；请重新加载目标网页');
    invariant(/^[a-f0-9-]{36}$/.test(data.nonce)&&/^[a-f0-9]{64}$/.test(data.sourceHash)&&
      data.target?.tabId===row.tabId&&data.target.documentId===row.documentId&&typeof data.bindingId==='string'&&
      ['ready','executing','evaluated','retiring','retired','failed','discarded'].includes(data.state),'E_UI_LIFECYCLE','受管界面记录不完整');
    return {...data,worldId:row.worldId};
  };
  const mark=(record,state,receipt)=>worlds.editRecords(rows=>{
    const row=rows.find(row=>row.worldId===record.worldId);
    invariant(row?.managed?.nonce===record.nonce,'E_UI_LIFECYCLE','受管界面身份已变化');
    invariant(({executing:['ready'],evaluated:['executing','retiring'],retiring:['evaluated'],retired:['retiring'],failed:['retiring'],discarded:['ready','executing']})[state]?.includes(row.managed.state),'E_UI_LIFECYCLE','受管生命周期状态已变化');
    row.managed={...row.managed,state,...(receipt?{receipt}:{})};
  });
  async function inspect(frozen,host){
    const value=frozen.managedUI;
    invariant(value&&typeof value==='object'&&Object.keys(value).every(key=>['previewId','bindingId','enabled'].includes(key))&&
      (value.enabled===undefined||typeof value.enabled==='boolean')&&
      /^[a-f0-9-]{36}$/.test(value.previewId)&&/^local-[a-f0-9]{20}$/.test(value.bindingId),'E_SCHEMA','Invalid managed preview identity');
    const prior=(await worlds.records()).filter(row=>row.documentId===frozen.target.documentId&&row.managed?.bindingId===value.bindingId&&!['retired','discarded'].includes(row.managed.state));
    if(value.enabled===false){invariant(!prior.length,'E_UI_MODE_CONFLICT','移除 UI SDK 前请先停止旧受管预览，或重新加载目标网页');return null;}
    invariant(prior.length<=1,'E_UI_OWNER','旧受管预览仍需原工作台确认清理');
    const previous=prior.length?await read(prior[0].managed.previewId,host):null;
    if(previous)invariant(canonical(previous.target)===canonical(frozen.target),'E_DOCUMENT_STALE','受管预览目标已变化');
    return {previewId:value.previewId,bindingId:value.bindingId,registrationId:host.registrationId,nonce:crypto.randomUUID(),target:frozen.target,previous};
  }
  function exact(results,target){
    invariant(Array.isArray(results)&&results.length===1&&results[0]?.frameId===0&&results[0]?.documentId===target.documentId&&results[0].error===undefined,'E_EFFECT_UNKNOWN','缺少原文档的受管清理回执');
    return results[0].result;
  }
  async function bootstrap(native,record,worldId,sourceHash){
    const {target,nonce}=record;
    const reply=exact(await native.execute({target:{tabId:target.tabId,documentIds:[target.documentId]},world:'USER_SCRIPT',worldId,js:[{code:managedUIBootstrapSource(nonce)}]}),target);
    invariant(reply?.format===format&&reply.nonce===nonce&&reply.ready===true,'E_UI_LIFECYCLE','浏览器未确认受管生命周期初始化');
    const stored={previewId:record.previewId,bindingId:record.bindingId,registrationId:record.registrationId,nonce,target,sourceHash,state:'ready'};
    await worlds.editRecords(rows=>{
      const row=rows.find(row=>row.worldId===worldId);
      invariant(row&&!row.managed&&!rows.some(row=>row.managed?.previewId===record.previewId),'E_UI_LIFECYCLE','受管身份已被使用');
      row.managed=stored;
    });
    return {...stored,worldId};
  }
  async function prepare(native,context,worldId,sourceHash,requestNonce,sender){
    const record=await bootstrap(native,context,worldId,sourceHash);
    try{
      await mark(record,'executing');await verifyTarget(record.target,requestNonce);
      invariant((await assertHost(sender)).registrationId===record.registrationId,'E_HOST_STALE','工作台身份已变化');
      return record;
    }catch(error){await mark(record,'discarded');throw error;}
  }
  async function retire(native,record,requestNonce,{sender,dispatch,confirm}){
    if(record.state==='retired')return record.receipt;
    invariant(record.state!=='failed','E_UI_CLEANUP_FAILED','旧 UI 清理已失败；不会重试清理或挂载新版本，请重新加载目标网页');
    invariant(record.state==='evaluated','E_EFFECT_UNKNOWN','原预览或清理尚未确认结束，不能重新执行');
    await mark(record,'retiring');
    try{
      await verifyTarget(record.target,requestNonce);
      invariant((await assertHost(sender)).registrationId===record.registrationId,'E_HOST_STALE','工作台身份已变化');
    }catch(error){await mark(record,'evaluated');throw error;}
    dispatch();
    const reply=exact(await native.execute({target:{tabId:record.target.tabId,documentIds:[record.target.documentId]},world:'USER_SCRIPT',worldId:record.worldId,js:[{code:managedUIRetireSource(record.nonce,requestNonce)}]}),record.target);
    invariant(reply?.format===format&&reply.nonce===record.nonce&&reply.requestNonce===requestNonce&&reply.scope==='managed-ui-only'&&typeof reply.ok==='boolean'&&Number.isSafeInteger(reply.instances),'E_EFFECT_UNKNOWN','旧 UI 清理身份不一致');
    if(reply.code==='E_UI_CLEANUP_TIMEOUT')throw new FoundationError('E_EFFECT_UNKNOWN','旧 UI 清理超时，不能确认旧回调已结束；请关闭原标签页');
    await mark(record,reply.ok?'retired':'failed',reply);confirm();
    invariant(reply.ok,'E_UI_CLEANUP_FAILED',reply.message||'旧 UI 清理失败，新源码未执行');
    return reply;
  }
  // Called only by the original preview service while its active guard is held.
  // All authority/slot/browser checks remain that service's existing callbacks.
  async function retirePreview(request,sender,{assertHost,verifyTarget,nativeAPI,admission}){
    let reserved=false,dispatched=false,confirmed=false,nonce;
    try{
      invariant(request&&typeof request==='object'&&!Array.isArray(request)&&Object.keys(request).length===1&&typeof request.previewId==='string','E_SCHEMA','Expected one managed previewId');
      const host=await assertHost(sender),record=await read(request.previewId,host);
      await verifyTarget(record.target);const native=await nativeAPI();nonce=crypto.randomUUID();
      await admission.reserve({nonce,tabId:record.target.tabId,documentId:record.target.documentId,sourceHash:record.sourceHash},sender);reserved=true;
      await verifyTarget(record.target,nonce);
      invariant((await assertHost(sender)).registrationId===host.registrationId,'E_HOST_STALE','工作台身份已变化');
      const receipt=await retire(native,record,nonce,{sender,dispatch:()=>{dispatched=true;},confirm:()=>{confirmed=true;}});
      return {previewId:record.previewId,sourceHash:record.sourceHash,state:'preview-retired',receipt};
    }catch(error){if(dispatched&&!confirmed)throw new FoundationError('E_EFFECT_UNKNOWN',error.message+'；旧 UI 清理结果未知，不能重复执行');throw error;}
    finally{if(reserved&&(!dispatched||confirmed))await admission.release({nonce});}
  }
  return Object.freeze({inspect,read,mark,prepare,retire,retirePreview});
}
