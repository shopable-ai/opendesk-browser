import * as React from 'react';
import {Button} from '@opendesk/ui';
// Consent is always granted by the trusted Host. A sandbox cannot self-grant.
export default function CookiePermissions({phase,target,disabled,onRetry}){
  if(phase==='ready')return null;
  if(phase==='loading')
    return <section className="cookie-permission" role="status" aria-live="polite">
      正在读取 Cookie…
    </section>;
  if(phase==='idle')
    return <section className="cookie-permission od-surface od-surface--padded" role="status" aria-live="polite">
      <strong>需要重新读取 Cookie</strong>
      <p>重新读取当前网站的 Cookie。</p>
      <Button type="button" disabled={disabled} onClick={onRetry}>重新读取 Cookie</Button>
    </section>;
  return <section className="cookie-permission od-surface od-surface--padded" role="status" aria-live="polite">
    <strong>{phase==='blocked'?'本站 Cookie 尚未就绪':'读取 Cookie 失败'}</strong>
    {phase==='blocked'&&target&&<p>请在上方设置允许管理 Cookie，并确认 Chrome 允许访问当前网站。</p>}
    {target&&<p className="cookie-editor-scope">{target.hostname}</p>}
    <Button type="button" disabled={disabled} onClick={onRetry}>重试</Button>
  </section>;
}
