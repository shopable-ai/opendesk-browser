import {ANALYTICS_PROTOCOL} from './contract.js';
// A privacy switch inside the EXISTING options page, not an analytics dashboard.
export function initAnalyticsConsentControls({api,doc}){
  const toggle=doc.getElementById('analytics-consent');
  const status=doc.getElementById('analytics-consent-status');
  if(!toggle||!status)return;
  let working=false;
  const show=message=>{status.textContent=message;};
  const request=async(kind,enabled)=>{
    const response=await api.runtime.sendMessage({
      protocol:ANALYTICS_PROTOCOL,kind,...(enabled===undefined?{}:{enabled})
    });
    if(response?.ok!==true)throw Object.assign(Error('统计服务未就绪'),{code:response?.code||'E_ANALYTICS'});
    return response.data;
  };
  const render=data=>{
    toggle.checked=data.consent===true;
    toggle.disabled=working||!data.configured;
    show(!data.configured?'尚未配置云端统计接收服务，统计保持关闭。':
      data.consent?'已同意发送最小使用统计。可随时关闭。':
      '统计默认关闭；不会发送任何产品使用事件。');
  };
  toggle.addEventListener('change',event=>{
    if(!event.isTrusted||working)return;
    working=true;toggle.disabled=true;
    request('consent.set',toggle.checked).then(render,error=>{
      show('保存统计设置失败：'+(error.code||'E_ANALYTICS')+'，请重试。');
      return request('consent.status').then(render,()=>{toggle.checked=false;});
    }).finally(()=>{working=false;void request('consent.status').then(render,
      ()=>{toggle.disabled=true;show('无法核实统计授权，已禁用此开关。');});});
  });
  void request('consent.status').then(render,
    ()=>{toggle.checked=false;toggle.disabled=true;show('无法连接可信统计服务，统计不可启用。');});
}
