import * as React from 'react';
// Consent is always granted by the trusted Host. A sandbox cannot self-grant.
export default function CookiePermissions({phase,target,disabled,onRetry}){
  if(phase==='ready')return null;
  return <section className="cookie-permission" role="status" aria-live="polite">
    <strong>{phase==='blocked'?'需要网站 Cookie 授权':
      phase==='loading'?'正在检查 Cookie 服务':'浏览器 Cookie 未就绪'}</strong>
    <p>授权与撤权只能在 OpenDesk Browser 的扩展设置中完成。选择网站不代表获得访问授权；敏感值需要独立授权。</p>
    {target&&<p className="cookie-editor-scope">目标：{target.hostname}</p>}
    <button type="button" disabled={disabled} onClick={onRetry}>重新检查授权</button>
  </section>;
}
