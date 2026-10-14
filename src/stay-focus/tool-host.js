// Precompiled Stay Focus adapter for the existing trusted tool host. The dynamic
// package can request an operation; only extension-owned controls approve it.
import {FOCUS_ID,FOCUS_CAPABILITY,FOCUS_PROTOCOL,FOCUS_PROBE_OPERATION,FOCUS_SERVICE_VERSION,FOCUS_OPERATIONS,focusPackageHash} from './policy.js';
import {SIDEBAR_TOOL_STORE} from '../ui/sidebar-tools/package.js';
import {TOOL_REVOCATION_EPOCHS_STORE,assertSidebarToolEnabled} from '../ui/sidebar-tools/lifecycle.js';
import {requireCompleteInstalledSidebarTools,sameSidebarToolPackage} from '../ui/sidebar-tools/installation.js';

const trustedOnly=['focus.enable','focus.disable','focus.clear'];
const error=(message,code)=>Object.assign(new Error(message),{code});
// Presence of a Side Panel adapter is not evidence of a running MV3 worker.
// A live, versioned handshake fails closed without granting Chrome authority.
export async function probeStayFocusService({api}){
  if(typeof api?.runtime?.sendMessage!=='function')
    throw error('当前扩展无法连接 Stay Focus 后台服务；请升级或重新加载扩展','E_TOOL_RUNTIME_UNAVAILABLE');
  let response;
  try{
    response=await api.runtime.sendMessage({protocol:FOCUS_PROTOCOL,toolId:FOCUS_ID,
      operation:FOCUS_PROBE_OPERATION,payload:{}});
  }catch{
    throw error('Stay Focus 后台无响应；请重新加载扩展后再安装','E_TOOL_RUNTIME_UNAVAILABLE');
  }
  if(response?.ok!==true||response.data?.protocol!==FOCUS_PROTOCOL||
     response.data?.serviceVersion!==FOCUS_SERVICE_VERSION||response.data?.serviceReady!==true)
    throw error('当前扩展未提供匹配的 Stay Focus 后台服务：'+
      String(response?.error?.code||'E_FOCUS_NO_SERVICE'),'E_TOOL_RUNTIME_UNAVAILABLE');
  return response.data;
}
function requireFocusTool(tool){
  if(tool?.id!==FOCUS_ID||!tool.capabilities.includes(FOCUS_CAPABILITY))
    throw error('专注工具未安装或页面已关闭','E_TOOL_CHANGED');
}

export async function runTrustedStayFocusOperation({api,tool,operation,payload,event,assertCurrent}){
  if(event?.isTrusted!==true||!trustedOnly.includes(operation))
    throw error('请在工具详情中主动点击专注权限操作','E_FOCUS_TRUSTED_CLICK');
  requireFocusTool(tool);assertCurrent('initial');
  await assertSidebarToolEnabled(api,tool.id);
  const [owned,epochs]=await Promise.all([api.storage.local.get(SIDEBAR_TOOL_STORE),
    api.storage.local.get(TOOL_REVOCATION_EPOCHS_STORE)]);
  if(!requireCompleteInstalledSidebarTools(owned[SIDEBAR_TOOL_STORE]).some(row=>sameSidebarToolPackage(row,tool)))
    throw error('工具已更新或卸载','E_TOOL_CHANGED');
  const installEpoch=epochs[TOOL_REVOCATION_EPOCHS_STORE]?.[tool.id]??null;
  const packageHash=await focusPackageHash(tool);
  assertCurrent('before-send');
  const result=await api.runtime.sendMessage({protocol:FOCUS_PROTOCOL,
    toolId:tool.id,operation,payload,packageHash,installEpoch});
  if(!result?.ok)throw error(result?.error?.message||'专注 Host 未确认',result?.error?.code||'E_FOCUS');
  try{assertCurrent('after-send');}catch{
    throw error('宿主已改变，请核查 Chrome 规则状态','E_OUTCOME_UNKNOWN');
  }
  return result.data;
}

export async function requestStayFocusOperation({api,tool,operation,payload,revocationEpoch,
  assertCurrent,requestBrowserClick,openSettings}){
  requireFocusTool(tool);
  if(!FOCUS_OPERATIONS.includes(operation))throw error('Stay Focus 请求格式无效','E_FOCUS_REQUEST');
  if(trustedOnly.includes(operation)){
    openSettings();
    throw error('请从工具详情中的受信任授权与清空按钮操作','E_FOCUS_TRUSTED_CLICK');
  }
  const send=async()=>{
    assertCurrent();
    const [owned,epochs]=await Promise.all([api.storage.local.get(SIDEBAR_TOOL_STORE),
      api.storage.local.get(TOOL_REVOCATION_EPOCHS_STORE)]);
    if(!requireCompleteInstalledSidebarTools(owned[SIDEBAR_TOOL_STORE]).some(row=>sameSidebarToolPackage(row,tool))||
       (epochs[TOOL_REVOCATION_EPOCHS_STORE]?.[tool.id]??null)!==revocationEpoch)
      throw error('工具身份或授权版本已变化','E_TOOL_CHANGED');
    const packageHash=await focusPackageHash(tool);
    assertCurrent();
    const response=await api.runtime.sendMessage({protocol:FOCUS_PROTOCOL,toolId:tool.id,
      operation,payload,packageHash,installEpoch:revocationEpoch});
    if(!response?.ok)throw error(response?.error?.message||'专注操作未确认',response?.error?.code||'E_FOCUS');
    assertCurrent();return response.data;
  };
  if(operation==='focus.status')return send();
  const target=operation==='focus.site.put'?'保存「'+String(payload?.site?.host||'').slice(0,80)+'」的网站限制':
    operation==='focus.site.remove'?'删除「'+String(payload?.host||'').slice(0,80)+'」的网站限制':
    operation==='focus.session.start'?'开始 '+String(payload?.minutes)+' 分钟的专注模式':
    operation==='focus.session.stop'?'结束当前专注模式':
    operation==='focus.schedule.set'?'修改工作时间限制':
    operation==='focus.whitelist.set'?'替换允许访问的域名白名单':
    operation==='focus.group.put'?'保存共享每日额度':
    operation==='focus.group.remove'?'删除共享每日额度组':'更改专注规则';
  return requestBrowserClick({toolId:tool.id,
    message:'「'+tool.title+'」请求'+target+'。此操作可能更新 Chrome 网站拦截规则；请确认。',
    button:'确认修改',run:event=>{
      if(!event?.isTrusted)throw error('需要真实用户点击','E_FOCUS_TRUSTED_CLICK');
      return send();
    }});
}
