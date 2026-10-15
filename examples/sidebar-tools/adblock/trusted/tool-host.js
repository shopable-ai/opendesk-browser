// Extension-owned Side Panel adapter. Sandboxed AdBlock UI can only ask for
// read-only status and a separately confirmed restore of a listed exception.
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
export async function requestAdblockOperation({
  api,tool,operation,payload={},revocationEpoch,assertCurrent,
  requestBrowserClick,openSettings
}){
  requireTool(tool);
  if(operation==='adblock.status'){
    const msg=await authenticated({api,tool,operation,payload,revocationEpoch,assertCurrent});
    return verifiedSend(api,msg,assertCurrent);
  }
  if(operation==='adblock.site.restore'&&
     payload&&Object.keys(payload).sort().join(',')==='host'&&
     adblockHost(payload.host)===payload.host){
    return requestBrowserClick({toolId:ADBLOCK_ID,
      message:'恢复 '+payload.host+' 的广告过滤？Chrome 将重新阻止此网站匹配的广告请求；已有页面需要刷新。',
      button:'确认恢复',run:event=>{
        if(event?.isTrusted!==true)
          throw adblockError('E_ADBLOCK_TRUSTED_CLICK','请点击受信任的确认按钮');
        return authenticated({api,tool,operation,payload,revocationEpoch,assertCurrent})
          .then(msg=>verifiedSend(api,msg,assertCurrent));
      }});
  }
  openSettings?.();
  throw adblockError('E_ADBLOCK_TRUSTED_CLICK',
    '启停、本站开关必须在工具上方的可信控制区完成');
}
