// Privileged requests only from the extension-owned Side Panel controls.
// The installed opaque UI can read state but can never approve global proxy.
import {SIDEBAR_TOOL_STORE,sidebarToolPackageHash} from '../ui/sidebar-tools/package.js';
import {TOOL_REVOCATION_EPOCHS_STORE,assertSidebarToolEnabled}
  from '../ui/sidebar-tools/lifecycle.js';
import {requireCompleteInstalledSidebarTools,sameSidebarToolPackage}
  from '../ui/sidebar-tools/installation.js';
import {AI_ID,AI_CAPABILITY,AI_PROTOCOL,AI_VERSION,AI_OPERATIONS,aiError} from './policy.js';

const changes=new Set(['aiAccess.enable','aiAccess.disable','aiAccess.activate']);
function identity(tool){
  if(tool?.id!==AI_ID||!tool.capabilities.includes(AI_CAPABILITY))
    throw aiError('E_TOOL_CHANGED','AI 智能访问工具不再可用');
}
export async function probeAiAccessService({api}){
  let response;
  try{
    response=await api.runtime.sendMessage({
      protocol:AI_PROTOCOL,toolId:AI_ID,operation:'aiAccess.probe',payload:{}
    });
  }catch{
    throw aiError('E_TOOL_RUNTIME_UNAVAILABLE','可信代理后台无响应，请更新或重新加载扩展');
  }
  if(response?.ok!==true||response.data?.protocol!==AI_PROTOCOL||
     response.data?.serviceVersion!==AI_VERSION||response.data?.ready!==true)
    throw aiError('E_TOOL_RUNTIME_UNAVAILABLE','当前扩展缺少可信 AI 智能访问后台服务');
  return response.data;
}
async function currentMessage({api,tool,operation,payload,epoch,assertCurrent}){
  assertCurrent?.('initial');
  identity(tool);
  await assertSidebarToolEnabled(api,tool.id);
  const [saved,epochs]=await Promise.all([
    api.storage.local.get(SIDEBAR_TOOL_STORE),
    api.storage.local.get(TOOL_REVOCATION_EPOCHS_STORE)
  ]);
  const installed=requireCompleteInstalledSidebarTools(saved[SIDEBAR_TOOL_STORE]);
  if(!installed.some(row=>sameSidebarToolPackage(row,tool))||
     (epochs[TOOL_REVOCATION_EPOCHS_STORE]?.[tool.id]??null)!==epoch)
    throw aiError('E_TOOL_CHANGED','工具版本或安装身份已变化');
  const packageHash=await sidebarToolPackageHash(tool);
  assertCurrent?.('before-send');
  return {protocol:AI_PROTOCOL,toolId:tool.id,operation,
    payload,packageHash,installEpoch:epoch};
}
async function replyFor(api,message){
  const response=await api.runtime.sendMessage(message);
  if(!response?.ok)
    throw aiError(response?.error?.code||'E_AI_HOST',
      response?.error?.message||'可信代理后台尚未确认操作');
  return response.data;
}
export async function runTrustedAiAccessOperation({
  api,tool,operation,payload={},event,revocationEpoch,assertCurrent
}){
  if(!AI_OPERATIONS.includes(operation))throw aiError('E_AI_REQUEST','未知代理操作');
  if(changes.has(operation)&&event?.isTrusted!==true)
    throw aiError('E_AI_TRUSTED_CLICK','请使用工具上方的可信按钮操作');
  identity(tool);
  assertCurrent('initial');
  const msg=await currentMessage({api,tool,operation,payload,
    epoch:revocationEpoch,assertCurrent});
  const result=await replyFor(api,msg);
  try{assertCurrent('after-send');}
  catch{throw aiError('E_OUTCOME_UNKNOWN','代理操作可能已执行，请刷新 Chrome 实际状态');}
  return result;
}
export async function requestAiAccessOperation({
  api,tool,operation,payload={},revocationEpoch,assertCurrent,openSettings
}){
  identity(tool);
  if(!AI_OPERATIONS.includes(operation))
    throw aiError('E_AI_REQUEST','不允许的代理操作');
  if(operation!=='aiAccess.status'){
    openSettings();
    throw aiError('E_AI_TRUSTED_CLICK','代理启停和激活只允许在可信工具控制区完成');
  }
  const msg=await currentMessage({api,tool,operation,payload,
    epoch:revocationEpoch,assertCurrent});
  const result=await replyFor(api,msg);
  assertCurrent('after-send');
  return result;
}
