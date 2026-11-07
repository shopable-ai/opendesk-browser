import * as React from 'react';

export function AiAccessSettings({model,actions}){
  if(!model)return null;
  return <section id="ai-access-trusted-controls" className="od-surface od-surface--padded" aria-label="AI 网站访问" hidden={!model.visible}>
    <div className="ai-access-proxy-head"><h2 className="od-title">AI 网站访问</h2><span className="od-note" role="status" aria-live="polite">{model.badge}</span></div>
    <p id="ai-access-status" className="od-note">{model.status}</p>
    <button type="button" id="ai-access-toggle" className="od-button" disabled={model.actionDisabled} aria-busy={model.busy} aria-pressed={model.pressed} onClick={event=>actions?.toggle(event.nativeEvent)}>{model.actionLabel}</button>
    <p id="ai-access-error" className="od-field-error" role="alert" hidden={!model.error}>{model.error}</p>
    <p className="od-note">仅控制本工具的 AI 网站代理，不修改系统 VPN 或其他扩展；会员有效期与代理启停互不影响。</p>
    {model.localTestEnabled&&<><p className="od-note">本地开发测试 · 模拟租约 127.0.0.1:7898 / HTTP 代理 127.0.0.1:7897；不代表生产会员授权。</p><button type="button" id="ai-access-local-activate" className="od-button" disabled={model.activateDisabled} onClick={event=>actions?.activate(event.nativeEvent)}>激活本地测试服务</button></>}
  </section>;
}
