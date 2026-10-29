// Reviewed, extension-owned bridge. Routine controls use the once-reviewed
// official install; sensitive manual CSS editor writes still need trusted review.
import {SIDEBAR_TOOL_STORE,sidebarToolPackageHash} from '../../../src/ui/sidebar-tools/package.js';
import {TOOL_REVOCATION_EPOCHS_STORE,assertSidebarToolEnabled} from '../../../src/ui/sidebar-tools/lifecycle.js';
import {requireCompleteInstalledSidebarTools,sameSidebarToolPackage} from '../../../src/ui/sidebar-tools/installation.js';
import {ADBLOCK_ID,ADBLOCK_CAPABILITY,ADBLOCK_PROTOCOL,ADBLOCK_SERVICE_VERSION,
  ADBLOCK_OPERATIONS,adblockError,adblockHost} from './policy.js';
import {validCosmeticSelector} from './cosmetic-policy.js';
const requireTool=tool=>{
  if(tool?.id!==ADBLOCK_ID||!tool.capabilities?.includes(ADBLOCK_CAPABILITY))
    throw adblockError('E_TOOL_CHANGED','未安装可信 AdBlock 扩展工具');
};
async function currentHostWindowId(api){
  let window;
  // This runs in the trusted document, where Chrome returns its owning window.
  // A sandbox payload must never choose this binding.
  try{window=await api.windows.getCurrent();}
  catch{throw adblockError('E_ADBLOCK_SENDER','无法确认可信工具所属窗口');}
  if(!Number.isSafeInteger(window?.id)||window.id<0||window.incognito!==false)
    throw adblockError('E_ADBLOCK_SENDER','可信工具所属窗口不可用');
  return window.id;
}
async function authenticated({api,tool,operation,payload,revocationEpoch,assertCurrent,expectedWindowId}){
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
  const hostWindowId=await currentHostWindowId(api);
  if(expectedWindowId!==undefined&&hostWindowId!==expectedWindowId)
    throw adblockError('E_ADBLOCK_SENDER','确认期间可信工具所属窗口已改变，请重新读取');
  assertCurrent?.('before-send');
  return {protocol:ADBLOCK_PROTOCOL,toolId:ADBLOCK_ID,
    operation,payload,packageHash,installEpoch:revocationEpoch,hostWindowId};
}
async function verifiedSend(api,message,assertCurrent){
  const uncertain=()=>adblockError(message.operation==='adblock.status'?'E_ADBLOCK_HOST':'E_OUTCOME_UNKNOWN',
    'Chrome 服务回复无法确认，请读取实际 DNR 状态，不要重放变更');
  let result;
  try{result=await api.runtime.sendMessage(message);}
  catch{throw uncertain();}
  if(result?.ok===false&&typeof result.error?.code==='string'&&result.error.code&&
     typeof result.error?.message==='string')
    throw adblockError(result.error.code,result.error.message);
  if(result?.ok!==true||!result.data||typeof result.data!=='object'||Array.isArray(result.data)||
     typeof result.data.installed!=='boolean'||typeof result.data.toolEnabled!=='boolean'||
     typeof result.data.enabled!=='boolean'||typeof result.data.permissions?.dnr!=='boolean')
    throw uncertain();
  try{
    if(await currentHostWindowId(api)!==message.hostWindowId)
      throw adblockError('E_ADBLOCK_SENDER','可信工具所属窗口已改变');
    assertCurrent?.('after-send');
  }
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
  if(!['adblock.status','adblock.cosmetic.inspect','adblock.cosmetic.check','adblock.cosmetic.locate'].includes(operation)&&
     event?.isTrusted!==true)
    throw adblockError('E_ADBLOCK_TRUSTED_CLICK','请使用可信扩展工具按钮操作');
  const msg=await authenticated({api,tool,operation,payload,revocationEpoch,assertCurrent});
  return verifiedSend(api,msg,assertCurrent);
}
const sameArray=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&
  a.length===b.length&&a.every((item,index)=>item===b[index]);
function requestShape(operation,payload){
  const keys=Object.keys(payload).sort().join(',');
  if((operation==='adblock.enable'||operation==='adblock.disable'||operation==='adblock.status'||
      operation==='adblock.cosmetic.pick'||operation==='adblock.cosmetic.cancel')&&keys==='')return;
  if(operation==='adblock.cosmetic.inspect'&&keys==='host'&&adblockHost(payload.host)===payload.host)return;
  if((operation==='adblock.cosmetic.check'||operation==='adblock.cosmetic.locate'||operation==='adblock.cosmetic.display'||
       operation==='adblock.cosmetic.add')&&
       (operation==='adblock.cosmetic.add'&&keys==='allowUnmatched,host,selector'&&
         typeof payload.allowUnmatched==='boolean'||
        ['adblock.cosmetic.check','adblock.cosmetic.locate'].includes(operation)&&keys==='host,selector'||
        operation==='adblock.cosmetic.display'&&keys==='host,selector,visible'&&
         typeof payload.visible==='boolean')&&
       adblockHost(payload.host)===payload.host&&validCosmeticSelector(payload.selector))return;
  if(operation==='adblock.cosmetic.replace'&&
       keys==='allowUnmatched,host,oldSelector,selector'&&
       typeof payload.allowUnmatched==='boolean'&&
       adblockHost(payload.host)===payload.host&&
       validCosmeticSelector(payload.oldSelector)&&validCosmeticSelector(payload.selector))return;
  if(operation==='adblock.cosmetic.restore'&&keys==='host,selector'&&
      adblockHost(payload.host)===payload.host&&validCosmeticSelector(payload.selector))return;
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
export async function requestAdblockOperation({
  api,tool,operation,payload={},revocationEpoch,assertCurrent,requestBrowserClick
}){
  requireTool(tool);
  if(!ADBLOCK_OPERATIONS.includes(operation))
    throw adblockError('E_ADBLOCK_OPERATION','未批准的广告操作');
  if(!payload||typeof payload!=='object'||Array.isArray(payload))
    throw adblockError('E_ADBLOCK_REQUEST','广告拦截操作参数不合法');
  requestShape(operation,payload);
  let expectedWindowId;
  const send=async(op,data)=>{
    const message=await authenticated({api,tool,operation:op,payload:data,revocationEpoch,
      assertCurrent,expectedWindowId});
    expectedWindowId??=message.hostWindowId;
    return verifiedSend(api,message,assertCurrent);
  };
  if(operation==='adblock.status')return send(operation,payload);
  if(['adblock.cosmetic.pick','adblock.cosmetic.cancel','adblock.cosmetic.restore',
      'adblock.cosmetic.inspect','adblock.cosmetic.check','adblock.cosmetic.locate','adblock.cosmetic.display'].includes(operation)){
    // Start only enters highlight mode. A real trusted click on the *webpage*
    // authorizes saving; removing one's own rule is reversible and needs no
    // secondary confirmation dialog.
    const before=await send('adblock.status',{});
    if(before.toolEnabled!==true||before.permissions?.dnr!==true||
       before.rules?.verified!==true||before.restartRequired)
      throw adblockError('E_ADBLOCK_UNAVAILABLE','广告过滤状态尚未确认');
    if(operation==='adblock.cosmetic.pick'&&
       (before.enabled!==true||before.currentSite?.status!=='ready'||
        before.exceptions.includes(before.currentHost)))
      throw adblockError('E_ADBLOCK_COSMETIC_SITE','本站广告保护未开启');
    if(operation==='adblock.cosmetic.restore'&&
       (before.currentHost!==payload.host||
        !before.cosmeticRules?.some(row=>row.selector===payload.selector)))
      throw adblockError('E_ADBLOCK_COSMETIC_CHANGED','网页或隐藏规则已经变化');
    return send(operation,payload);
  }
  if(['adblock.cosmetic.add','adblock.cosmetic.replace'].includes(operation)){
    // A sandbox must never manufacture a CSS-hiding write: manual editor
    // changes require a real click in the trusted Side Panel confirmation.
    const before=await send('adblock.status',{});
    if(before.enabled!==true||before.currentSite?.status!=='ready'||
       before.currentHost!==payload.host||before.exceptions.includes(payload.host)||
       before.rules?.verified!==true||before.toolEnabled!==true)
      throw adblockError('E_ADBLOCK_UNAVAILABLE','本站广告过滤尚未开启');
    if(typeof requestBrowserClick!=='function')
      throw adblockError('E_ADBLOCK_TRUSTED_CLICK','高级 CSS 操作需要可信确认界面');
    return requestBrowserClick({toolId:ADBLOCK_ID,
      message:operation==='adblock.cosmetic.add'?'保存这条高级 CSS 屏蔽规则？':
        '替换本站已有的 CSS 屏蔽规则？',
      button:'确认保存规则',run:async event=>{
        if(event?.isTrusted!==true)
          throw adblockError('E_ADBLOCK_TRUSTED_CLICK','只接受可信侧边栏真实点击');
        const latest=await send('adblock.status',{});
        if(!sameDecision(before,latest)||
           JSON.stringify(before.cosmeticRules)!==JSON.stringify(latest.cosmeticRules))
          throw adblockError('E_ADBLOCK_STATE_CHANGED','确认期间网页或规则已变化，请重新核对');
        return send(operation,payload);
      }});
  }
  // The reviewed official installation authorizes bounded routine controls.
  // Keep identity, window, live-site and native DNR checks; no second popup.
  const before=await send('adblock.status',{});
  canApply(operation,payload,before);
  const latest=await send('adblock.status',{});
  if(!sameDecision(before,latest))
    throw adblockError('E_ADBLOCK_STATE_CHANGED','操作前 Chrome 状态或网站已变化，请重新读取');
  canApply(operation,payload,latest);
  return send(operation,payload);
}
