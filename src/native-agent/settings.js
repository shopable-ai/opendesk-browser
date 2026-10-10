import {AGENT_CONFIG_PROTOCOL} from './protocol.js';
export function initNativeAgentSettings({api=globalThis.chrome,document:doc=globalThis.document}={}) {
  const status=doc.getElementById('bridge-status'),enable=doc.getElementById('bridge-enable'),
    disable=doc.getElementById('bridge-disable'),refresh=doc.getElementById('bridge-refresh');
  const show=value=>{status.textContent=value};
  const controls = busy=>{enable.disabled=disable.disabled=refresh.disabled=busy};
  async function request(type) {
    const response=await api.runtime.sendMessage({protocol:AGENT_CONFIG_PROTOCOL,type});
    if (!response?.ok) throw response?.error || {code:'E_EFFECT_UNKNOWN',message:'未收到设置回执'};
    return response.data;
  }
  let settleTimer,connectingPolls=0;
  async function update() {
    clearTimeout(settleTimer);settleTimer=null;
    const state=await request('status');
    show('Native Agent：'+(state.enabled ? '已启用' : '关闭')+
      '\nNative Host：'+(state.nativeConnected ? '已连接' : state.requiresReload
        ? '权限已授予，当前浏览器尚未刷新 Native API。结束运行中的任务后，在 chrome://extensions 重新加载扩展，再刷新状态。'
        : state.connecting ? '正在尝试与本机 OpenDesk 建立连接…'
          : '未连接。请确认本机程序已安装并完成可信扩展配对，然后点击「检测连接」。')+
      '\n已注册工作台：'+state.hostCount+'\nExtension ID：'+state.extensionId);
    // A connecting Port may not have delivered its hello yet. Observe only
    // briefly while this Options document is visible; no background polling.
    if(state.connecting&&connectingPolls++<6){
      settleTimer=setTimeout(()=>{if(!doc.hidden)void update().catch(e=>show((e.code||'E_NATIVE_NOT_READY')+'：'+(e.message||e)));},500);
    }else connectingPolls=0;
  }
  enable.addEventListener('click',event=>{
    if (!event.isTrusted) return;
    // Browser permission prompts MUST originate directly from a real click.
    const grant=api.permissions.request({permissions:['nativeMessaging']});
    controls(true);
    (async()=>{
      if (!await grant) throw {code:'E_PERMISSION_REQUIRED',message:'浏览器 Native Messaging 权限被拒绝'};
      await request('enable');await update();
    })().catch(e=>show((e.code||'E_PERMISSION')+'：'+(e.message||e)))
      .finally(()=>controls(false));
  });
  disable.addEventListener('click',()=>{
    controls(true);request('disable').then(update).catch(e=>show((e.code||'E_EFFECT_UNKNOWN')+'：'+e.message)).finally(()=>controls(false));
  });
  refresh.addEventListener('click',()=>{connectingPolls=0;update().catch(e=>show((e.code||'E_EFFECT_UNKNOWN')+'：'+e.message));});
  update().catch(e=>show((e.code||'E_EFFECT_UNKNOWN')+'：'+e.message));
}
