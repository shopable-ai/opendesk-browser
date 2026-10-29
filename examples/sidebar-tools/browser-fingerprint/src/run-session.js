// R2.1 gated Browser SDK lifecycle. No page monkey patches or fake Host.
// These exact methods are RESERVED for a future reviewed native binding.
// Until admitted in the trusted Browser operation contract, apply is BLOCKED.
import {validConfig,checkedVerification,classifyVerification} from './env-config.js';
import {safeContext} from './model.js';
const fail=(code,message)=>Object.assign(new Error(message),{code});
const REF=/^[A-Za-z0-9_-]{16,160}$/;
export const CONTROL_METHODS=Object.freeze({
  apply:'browser.fingerprint.apply',verify:'browser.fingerprint.readback',
  restore:'browser.fingerprint.restore'
});
export const ACTIVE_STATES=Object.freeze(['applying','applied_unverified','verified_limited','partial',
  'unknown','invalidated','restoring','restore_unknown']);
const blocked=new Set(['E_SERVICE_UNSUPPORTED','E_NOT_IMPLEMENTED','E_TOOL_CAPABILITY_REQUIRED',
  'E_CHROME_PERMISSION_REQUIRED','E_CHROME_UNSUPPORTED','E_UNSUPPORTED']);
const denied=new Set(['E_PERMISSION','E_SITE_GRANT_REQUIRED','E_USER_DENIED',
  'E_GRANT_REVOKED','E_USER_GESTURE_REQUIRED']);
export function classifyFailure(error,phase){
  if(blocked.has(error?.code))return 'blocked';
  if(denied.has(error?.code))return phase==='restore'?'restore_unknown':'denied';
  if(['E_CONTEXT','E_DOCUMENT_STALE','E_DOCUMENT_CHANGED','E_TARGET_INVALIDATED'].includes(error?.code))
    return phase==='restore'?'restore_unknown':'invalidated';
  return phase==='restore'?'restore_unknown':'unknown';
}
export function checkedTarget(raw){
  const target=safeContext(raw);
  if(!REF.test(target.volatile.documentRef||'')||!REF.test(target.volatile.tabRef||''))
    throw fail('E_DOCUMENT_STALE','可信 Host 没有提供稳定 Tab 与文档引用');
  return target;
}
export function sameTarget(a,b){
  if(!a||!b)return false;
  return a.origin===b.origin&&a.volatile.url===b.volatile.url&&
    a.volatile.documentRef===b.volatile.documentRef&&
    a.volatile.tabRef===b.volatile.tabRef;
}
export function checkedAck(ack,target){
  if(ack?.accepted!==true||ack?.source!=='trusted-browser-host'||ack?.preview===true||
     !REF.test(ack.sessionRef||'')||ack.documentRef!==target.volatile.documentRef)
    throw fail('E_OUTCOME_UNKNOWN','未获得与当前文档绑定的可信执行回执');
  return {sessionRef:ack.sessionRef,target};
}
export async function admitted(adapter,operation){
  let status;
  try{status=await adapter.request('browser.capabilities.getStatus',{operation});}
  catch(error){throw fail('E_SERVICE_UNSUPPORTED','可信 Browser Host 不支持环境配置能力');}
  if(status?.operation!==operation||status?.implementation!=='implemented'||
     status?.callableNow!==true||status?.authorization?.tool!=='granted')
    throw fail('E_SERVICE_UNSUPPORTED','尚无经过审查的当前 Tab 环境配置 Host 接口；未修改网页');
}
export async function applyEnvironment(adapter,config){
  if(!validConfig(config))throw fail('E_CONFIG','环境参数非法');
  await admitted(adapter,CONTROL_METHODS.apply);
  const raw=await adapter.context(),target=checkedTarget(raw);
  let ack;
  try{ack=await adapter.request(CONTROL_METHODS.apply,{
    config,tabRef:target.volatile.tabRef,documentRef:target.volatile.documentRef});}
  catch(error){throw error;}
  const session=checkedAck(ack,target);
  const after=checkedTarget(await adapter.context());
  if(!sameTarget(target,after))throw fail('E_DOCUMENT_CHANGED','网页发生变化；应用结果不能再用于旧文档');
  return session;
}
export async function verifyEnvironment(adapter,session,config,{restore=false}={}){
  await admitted(adapter,CONTROL_METHODS.verify);
  const current=checkedTarget(await adapter.context());
  if(!sameTarget(session.target,current))throw fail('E_DOCUMENT_CHANGED','目标文档已失效');
  const observation=await adapter.request(CONTROL_METHODS.verify,{
    sessionRef:session.sessionRef,documentRef:current.volatile.documentRef,
    mode:restore?'restore':'applied'});
  const after=checkedTarget(await adapter.context());
  if(!sameTarget(current,after))throw fail('E_DOCUMENT_CHANGED','读回过程中网页已变化');
  const rows=checkedVerification(config,observation,{
    sessionRef:session.sessionRef,documentRef:current.volatile.documentRef});
  return {rows,status:classifyVerification(rows),source:'trusted-browser-host',
    capturedAt:new Date().toISOString(),kind:restore?'restore':'apply'};
}
export async function restoreEnvironment(adapter,session){
  await admitted(adapter,CONTROL_METHODS.restore);
  const before=checkedTarget(await adapter.context());
  if(!sameTarget(session.target,before))throw fail('E_DOCUMENT_CHANGED','原始文档已失效；拒绝对新文档执行旧操作');
  const ack=await adapter.request(CONTROL_METHODS.restore,{
    sessionRef:session.sessionRef,documentRef:before.volatile.documentRef});
  if(ack?.accepted!==true||ack?.source!=='trusted-browser-host'||
    ack?.sessionRef!==session.sessionRef||ack?.preview===true)
    throw fail('E_OUTCOME_UNKNOWN','恢复执行回执未知');
  // Not "restored": must call verifyEnvironment(..., {restore:true}) afterwards.
  return {pendingReadback:true};
}
