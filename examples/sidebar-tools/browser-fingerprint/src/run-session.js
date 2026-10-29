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
  const controlledKeys=Array.isArray(ack.controlledKeys)?ack.controlledKeys:[];
  const names=new Set(['ua','uaCH','language','acceptLanguage','timezone','geolocation','viewport','publicIp']);
  if(controlledKeys.length>8||new Set(controlledKeys).size!==controlledKeys.length||
    controlledKeys.some(x=>!names.has(x)))
    throw fail('E_OUTCOME_UNKNOWN','不可信的受控字段回执');
  return {sessionRef:ack.sessionRef,target,controlledKeys,
    fieldResults:Array.isArray(ack.fieldResults)?ack.fieldResults:[]};
}
export async function admitted(adapter,operation,{url,allowSiteConsent=false}={}){
  let status;
  try{status=await adapter.request('browser.capabilities.getStatus',{operation,...(url?{url}:{})});}
  catch(error){throw fail('E_SERVICE_UNSUPPORTED','可信 Browser Host 不支持环境配置能力');}
  if(status?.operation!==operation||status?.implementation!=='implemented'||
     status?.authorization?.tool!=='granted')
    throw fail('E_SERVICE_UNSUPPORTED','当前安装未批准环境修改能力；未修改网页');
  if(status.callableNow===true)return;
  // One initial site consent is allowed; it does not itself execute CDP.
  if(allowSiteConsent&&operation===CONTROL_METHODS.apply&&
     status.reasonCode==='E_SITE_GRANT_REQUIRED'&&
     status.authorization?.browser==='granted')return;
  throw fail(status.reasonCode||'E_SERVICE_UNSUPPORTED',
    status.reasonCode==='E_CHROME_PERMISSION_REQUIRED'?
    'Chrome 未批准 debugger 调试权限，请重新审阅并安装最新版扩展。':
    '浏览器环境修改尚未对当前网页授权或原生能力不可用');
}
export async function applyEnvironment(adapter,config){
  if(!validConfig(config))throw fail('E_CONFIG','环境参数非法');
  async function dispatch(reapproved=false){
    const target=checkedTarget(await adapter.context());
    await admitted(adapter,CONTROL_METHODS.apply,{url:target.volatile.url,
      allowSiteConsent:!reapproved});
    let ack;
    try{
      ack=await adapter.request(CONTROL_METHODS.apply,{
        config,tabRef:target.volatile.tabRef,documentRef:target.volatile.documentRef});
    }catch(error){
      // The only safe retry is after confirmed site consent, before ANY
      // native effect. Consent rotates opaque refs; never replay CDP unknowns.
      if(error?.code==='E_SITE_GRANT_UPDATED'&&!reapproved)return dispatch(true);
      throw error;
    }
    const session=checkedAck(ack,target);
    const after=checkedTarget(await adapter.context());
    if(!sameTarget(target,after))
      throw fail('E_DOCUMENT_CHANGED','网页发生变化；应用结果不能再用于旧文档');
    return session;
  }
  return dispatch();
}
export async function verifyEnvironment(adapter,session,config,{restore=false}={}){
  const current=checkedTarget(await adapter.context());
  await admitted(adapter,CONTROL_METHODS.verify,{url:current.volatile.url});
  if(!sameTarget(session.target,current))throw fail('E_DOCUMENT_CHANGED','目标文档已失效');
  const observation=await adapter.request(CONTROL_METHODS.verify,{
    sessionRef:session.sessionRef,documentRef:current.volatile.documentRef,
    mode:restore?'restore':'applied'});
  const after=checkedTarget(await adapter.context());
  if(!sameTarget(current,after))throw fail('E_DOCUMENT_CHANGED','读回过程中网页已变化');
  const rows=checkedVerification(config,observation,{
    sessionRef:session.sessionRef,documentRef:current.volatile.documentRef});
  const controlledKeys=observation.controlledKeys;
  const names=new Set(['ua','uaCH','language','acceptLanguage','timezone','geolocation','viewport','publicIp']);
  if(!Array.isArray(controlledKeys)||controlledKeys.length>8||
    new Set(controlledKeys).size!==controlledKeys.length||
    controlledKeys.some(key=>!names.has(key)))
    throw fail('E_UNVERIFIED_READBACK','Host 未提供可核对的受控字段清单');
  return {rows,status:classifyVerification(rows),controlledKeys,
    source:'trusted-browser-host',capturedAt:observation.capturedAt||new Date().toISOString(),
    kind:restore?'restore':'apply'};
}
export async function restoreEnvironment(adapter,session){
  const before=checkedTarget(await adapter.context());
  await admitted(adapter,CONTROL_METHODS.restore,{url:before.volatile.url});
  if(!sameTarget(session.target,before))throw fail('E_DOCUMENT_CHANGED','原始文档已失效；拒绝对新文档执行旧操作');
  const ack=await adapter.request(CONTROL_METHODS.restore,{
    sessionRef:session.sessionRef,documentRef:before.volatile.documentRef});
  if(ack?.accepted!==true||ack?.source!=='trusted-browser-host'||
    ack?.sessionRef!==session.sessionRef||ack?.preview===true)
    throw fail('E_OUTCOME_UNKNOWN','恢复执行回执未知');
  // Not "restored": must call verifyEnvironment(..., {restore:true}) afterwards.
  return {pendingReadback:true};
}
