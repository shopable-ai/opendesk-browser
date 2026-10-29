import * as React from 'react';
import {Button} from '@opendesk/ui';

// Authorization is owned by the trusted Host. This surface only describes the
// current page/read state and offers a manual check or independent offline mode.
const noPage=new Set(['E_NO_ACTIVE_TAB','E_WINDOW_UNAVAILABLE']);
const restricted=new Set(['E_UNSUPPORTED_SCHEME','E_INCOGNITO']);
const granting=new Set(['E_SITE_GRANT_REQUIRED','E_GRANT_REVOKED','E_PERMISSION_REQUIRED']);
const chromeDenied=new Set(['E_CHROME_PERMISSION_REQUIRED','E_SITE_PERMISSION_REVOKED']);
const hostLost=new Set(['E_TOOL_CHANGED','E_TOOL_DISABLED','E_OWNER','E_CONTEXT',
  'E_HOST_CLOSED','E_COOKIE_SDK_NOT_READY']);
function content(phase,reason){
  if(phase==='idle')return ['需要重新检查','当前列表已失效，请手动检查当前网页。',true];
  if(noPage.has(reason))return ['没有可用的网站','请先打开普通 HTTP/HTTPS 网站；不需要反复重试。',false];
  if(restricted.has(reason))return ['当前页面不可管理 Cookie','Chrome 内部页、扩展页或隐身窗口不支持 Cookie 管理。请切换到普通网站。',false];
  if(reason==='E_DOCUMENT_CHANGED')return ['网页已发生变化','请重新确认活动网页后，再手动检查 Cookie。',true];
  if(reason==='E_DOCUMENT_UNRESOLVED')return ['网页正在切换','等待页面加载完成；如未自动恢复，可重新检查。',true];
  if(granting.has(reason))return ['Cookie 授权未生效','请通过顶部设置检查 Cookie 授权，然后重新检查。',true];
  if(chromeDenied.has(reason))return ['Chrome Cookie 权限不足','请在 Chrome 扩展权限中恢复 Cookie 或网站访问，再重新检查。',true];
  if(hostLost.has(reason))return ['工具宿主不可用','请核对工具启用状态与安装版本，重新打开 Cookie Editor。',true];
  if(reason==='E_OUTCOME_UNKNOWN')return ['读取结果未确认','请核对当前 Chrome Cookie 状态，不会自动重试。',true];
  return ['读取 Cookie 失败','请核对授权及 Cookie Store/Partition，按需手动重新检查。',true];
}
export default function CookiePermissions({phase,reason,target,disabled,onRetry,onOffline}){
  if(phase==='ready'||granting.has(reason))return null;
  if(phase==='loading')return <section className="cookie-permission od-surface od-surface--padded" role="status" aria-live="polite">
    正在读取 Cookie…
  </section>;
  const [heading,help,canRetry]=content(phase,reason);
  return <section className="cookie-permission od-surface od-surface--padded" role="status" aria-live="polite">
    <strong>{heading}</strong>
    <p>{help}</p>
    {target&&<p className="cookie-editor-scope">{target.hostname}</p>}
    {canRetry&&<div className="cookie-permission-actions">
      <Button type="button" disabled={disabled} onClick={onRetry}>重新检查</Button>
      <Button type="button" variant="secondary" disabled={disabled} onClick={onOffline}>离线文件</Button>
    </div>}
  </section>;
}
