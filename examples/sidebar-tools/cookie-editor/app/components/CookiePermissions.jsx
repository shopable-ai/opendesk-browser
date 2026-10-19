import * as React from 'react';
import {Button} from '@opendesk/ui';
// Consent is always granted by the trusted Host. A sandbox cannot self-grant.
export default function CookiePermissions({phase,target,disabled,onRetry}){
  if(phase==='ready')return null;
  if(phase==='loading'||phase==='idle')
    return <section className="cookie-permission" role="status" aria-live="polite">
      正在读取 Cookie…
    </section>;
  return <section className="cookie-permission od-surface od-surface--padded" role="status" aria-live="polite">
    <strong>{phase==='blocked'?'本站 Cookie 尚未就绪':'读取 Cookie 失败'}</strong>
    {phase==='blocked'&&target&&<p>请在扩展设置中允许本站访问，然后重试。</p>}
    {target&&<p className="cookie-editor-scope">{target.hostname}</p>}
    <Button type="button" disabled={disabled} onClick={onRetry}>重试</Button>
  </section>;
}
