// Reviewed, extension-owned bridge: a sandbox may propose an AdBlock change,
// but only an explicit click on the trusted Side Panel can authorize it.
import {SIDEBAR_TOOL_STORE,sidebarToolPackageHash} from '../../../../src/ui/sidebar-tools/package.js';
import {TOOL_REVOCATION_EPOCHS_STORE,assertSidebarToolEnabled} from '../../../../src/ui/sidebar-tools/lifecycle.js';
import {requireCompleteInstalledSidebarTools,sameSidebarToolPackage} from '../../../../src/ui/sidebar-tools/installation.js';
import {ADBLOCK_ID,ADBLOCK_CAPABILITY,ADBLOCK_PROTOCOL,ADBLOCK_SERVICE_VERSION,
  ADBLOCK_OPERATIONS,adblockError,adblockHost} from './policy.js';
const requireTool=tool=>{
  if(tool?.id!==ADBLOCK_ID||!tool.capabilities?.includes(ADBLOCK_CAPABILITY))
    throw adblockError('E_TOOL_CHANGED','未安装可信 AdBlock 扩展工具');
};
async function authenticated({api,tool,operation,payload,revocationEpoch,assertCurrent}){
  requireTool(tool);
  assertCurrent?.('initial');
  await assertSidebarToolEnabled(api,ADBLOCK_ID);
  const [installed,epochs]=await Promise.all([
    api.storage.local.get(SIDEBAR_TOOL_STORE),
    api.storage.local.get(TOOL_REVOCATION_EPOCHS_STORE)]);
  if(!requireCompleteInstalledSidebarTools(installed[SIDEBAR_TOOL_STORE])
      .some(x=>sameSidebarToolPackage(x,tool))||
    (epochs[TOOL_REVOCATION_EPOCHS_STORE]?.[ADBLOCK_ID]??null)!==revocationEpoch)
    throw adblockError('E_TOOL_CHANGED','广告工具已更新、撤权、停用或卸载');
  const packageHash=await sidebarToolPackageHash(tool);
  assertCurrent?.('before-send');
  return {protocol:ADBLOCK_PROTOCOL,toolId:ADBLOCK_ID,
    operation,payload,packageHash,installEpoch:revocationEpoch};
}
async function verifiedSend(api,message,assertCurrent){
  const result=await api.runtime.sendMessage(message);
  if(!result?.ok)
    throw adblockError(result?.error?.code||'E_ADBLOCK_HOST',
      result?.error?.message||'Chrome 广告服务尚未确认');
  try{assertCurrent?.('after-send');}
  catch{throw adblockError('E_OUTCOME_UNKNOWN','浏览器窗口已切换，请重新读取实际 DNR 状态');}
  return result.data;
}
export async function probeAdblockService({api,tool}){
  requireTool(tool);
  let response;
  try{
    response=await api.runtime.sendMessage({protocol:ADBLOCK_PROTOCOL,toolId:ADBLOCK_ID,
      operation:'adblock.probe',payload:{},packageHash:await sidebarToolPackageHash(tool)});
  }catch{
    throw adblockError('E_TOOL_RUNTIME_UNAVAILABLE','AdBlock 原生服务不可用，请更新扩展后安装');
  }
  if(response?.ok!==true||response.data?.serviceReady!==true||
     response.data?.protocol!==ADBLOCK_PROTOCOL||
     response.data?.serviceVersion!==ADBLOCK_SERVICE_VERSION)
    throw adblockError('E_TOOL_RUNTIME_UNAVAILABLE',
      response?.error?.message||'AdBlock 固定版本或 DNR 原生服务缺失');
  return response.data;
}
export async function runTrustedAdblockOperation({
  api,tool,operation,payload={},event,revocationEpoch,assertCurrent
}){
  if(!ADBLOCK_OPERATIONS.includes(operation))
    throw adblockError('E_ADBLOCK_OPERATION','未批准的广告操作');
  if(operation!=='adblock.status'&&event?.isTrusted!==true)
    throw adblockError('E_ADBLOCK_TRUSTED_CLICK','请使用可信扩展工具按钮操作');
  const msg=await authenticated({api,tool,operation,payload,revocationEpoch,assertCurrent});
  return verifiedSend(api,msg,assertCurrent);
}
const sameArray=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&
  a.length===b.length&&a.every((item,index)=>item===b[index]);
function requestShape(operation,payload){
  const keys=Object.keys(payload).sort().join(',');
  if((operation==='adblock.enable'||operation==='adblock.disable'||operation==='adblock.status')&&keys==='')return;
  if(operation==='adblock.site.restore'&&keys==='host'&&adblockHost(payload.host)===payload.host)return;
  if(operation==='adblock.site.set'&&keys==='filtering,host'&&
      adblockHost(payload.host)===payload.host&&typeof payload.filtering==='boolean')return;
  throw adblockError('E_ADBLOCK_REQUEST','广告拦截操作参数不合法');
}
function canApply(operation,payload,status){
  if(!status||status.toolEnabled!==true||status.permissions?.dnr!==true||
      status.rules?.verified!==true||status.restartRequired||
      typeof status.enabled!=='boolean'||!Array.isArray(status.exceptions))
    throw adblockError('E_ADBLOCK_UNAVAILABLE','Chrome 过滤状态尚未确认，请检查权限、重载扩展或重新读取');
  if(operation==='adblock.enable'&&status.enabled!==false||
     operation==='adblock.disable'&&status.enabled!==true)
    throw adblockError('E_ADBLOCK_STATE_CHANGED','全局保护状态已变化，请重新读取');
  if(operation==='adblock.site.set'){
    if(status.enabled!==true||status.currentSite?.status!=='ready'||
       status.currentHost!==payload.host)
      throw adblockError('E_ADBLOCK_SITE_CHANGED','当前网站或全局状态已变化，请重新读取');
    if(status.exceptions.includes(payload.host)===!payload.filtering)
      throw adblockError('E_ADBLOCK_STATE_CHANGED','当前网站开关已变化，请重新读取');
  }
  if(operation==='adblock.site.restore'&&!status.exceptions.includes(payload.host))
    throw adblockError('E_ADBLOCK_STATE_CHANGED','网站不在例外列表中，请重新读取');
}
function sameDecision(a,b){
  return a?.enabled===b?.enabled&&a?.currentHost===b?.currentHost&&
    a?.currentSite?.status===b?.currentSite?.status&&
    a?.toolEnabled===b?.toolEnabled&&a?.restartRequired===b?.restartRequired&&
    a?.permissions?.dnr===b?.permissions?.dnr&&a?.rules?.verified===b?.rules?.verified&&
    sameArray(a?.exceptions,b?.exceptions);
}
function reviewCopy(operation,payload){
  if(operation==='adblock.enable')return ['开启全局过滤？Chrome 将应用 AdBlock 自有 DNR 广告规则。','确认开启'];
  if(operation==='adblock.disable')return ['关闭全局过滤？Chrome 将移除 AdBlock 自有规则，不影响 Stay Focus。','确认关闭'];
  if(operation==='adblock.site.restore')return ['恢复 '+payload.host+' 的广告过滤？已有网页可能需要刷新。','确认恢复'];
  return [payload.filtering?'恢复 '+payload.host+' 的广告过滤？':'关闭 '+payload.host+' 的广告过滤？此网站将加入例外列表。',
    payload.filtering?'确认恢复':'确认设为例外'];
}
export async function requestAdblockOperation({
  api,tool,operation,payload={},revocationEpoch,assertCurrent,requestBrowserClick
}){
  requireTool(tool);
  if(!ADBLOCK_OPERATIONS.includes(operation))
    throw adblockError('E_ADBLOCK_OPERATION','未批准的广告操作');
  if(!payload||typeof payload!=='object'||Array.isArray(payload))
    throw adblockError('E_ADBLOCK_REQUEST','广告拦截操作参数不合法');
  requestShape(operation,payload);
  const send=async(op,data)=>verifiedSend(api,
    await authenticated({api,tool,operation:op,payload:data,revocationEpoch,assertCurrent}),assertCurrent);
  if(operation==='adblock.status')return send(operation,payload);
  // A sandbox cannot provide user activation, a Chrome permission, or a false
  // UI snapshot. Read the trusted service and pin one precise requested action.
  const before=await send('adblock.status',{});
  canApply(operation,payload,before);
  const [message,button]=reviewCopy(operation,payload);
  if(typeof requestBrowserClick!=='function')
    throw adblockError('E_ADBLOCK_TRUSTED_CLICK','可信操作确认界面不可用');
  return requestBrowserClick({toolId:ADBLOCK_ID,message,button,run:async event=>{
    if(event?.isTrusted!==true)
      throw adblockError('E_ADBLOCK_TRUSTED_CLICK','仅可信 Side Panel 的真实确认可修改 Chrome DNR');
    // Revalidate AFTER confirmation; tab/installation/exception drift cancels
    // the approval rather than silently acting on a different site or state.
    const latest=await send('adblock.status',{});
    if(!sameDecision(before,latest))
      throw adblockError('E_ADBLOCK_STATE_CHANGED','确认期间 Chrome 状态已变化，操作未提交；请重新读取');
    canApply(operation,payload,latest);
    return send(operation,payload);
  }});
}
