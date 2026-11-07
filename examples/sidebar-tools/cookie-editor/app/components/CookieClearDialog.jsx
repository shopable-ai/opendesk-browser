import * as React from 'react';
import {Button} from '@opendesk/ui';

// Shared presentation only. Neither the preview nor the native Host's scope,
// permission, preview token or deletion algorithm belongs to this component.
export default function CookieClearDialog({
  hostname, count, excluded=0, includeShared=true, busy=false, onScopeChange, onCancel, onConfirm
}){
  const dialogRef=React.useRef(null);
  const triggerRef=React.useRef(null);
  const headingId=React.useId();
  const descriptionId=React.useId();
  React.useLayoutEffect(()=>{
    const dialog=dialogRef.current;
    if(!dialog)return;
    const active=dialog.ownerDocument.activeElement;
    triggerRef.current=active&&active!==dialog.ownerDocument.body?active:
      dialog.parentElement?.querySelector('[aria-label="安全清理本站 Cookie"]');
    dialog.showModal();
    dialog.querySelector('[data-clear-cancel]')?.focus();
    return ()=>{
      if(dialog.open)dialog.close();
      const trigger=triggerRef.current;
      if(trigger?.isConnected&&typeof trigger.focus==='function')trigger.focus();
    };
  },[]);
  return <dialog ref={dialogRef} className="cookie-clear-dialog od-surface"
    aria-labelledby={headingId} aria-describedby={descriptionId}
    onCancel={event=>{event.preventDefault();if(!busy)onCancel?.();}}>
    <div className="cookie-clear-dialog-body">
      <h2 id={headingId}>清理本站 Cookie</h2>
      <p className="cookie-clear-dialog-host">{hostname}</p>
      <label className="cookie-clear-dialog-option">
        <input type="checkbox" checked={includeShared} disabled={busy}
          onChange={event=>onScopeChange?.(event.target.checked)}/>
        <span>包含共享和分区 Cookie</span>
      </label>
      <p id={descriptionId} aria-live="polite">{count===null?'正在计算清理范围…':<>将清理 <strong>{count}</strong> 条 Cookie。</>}</p>
      <p className="cookie-clear-dialog-scope">{includeShared?
        '包括本主机全部路径，不清理父域 Cookie；共享 Cookie 可能影响其他子域登录。'+
          (excluded?' '+excluded+' 条 Cookie 因权限或连接限制保留。':''):
        '仅清理当前主机专用的 Cookie，保留共享及分区 Cookie。'}
        {' '}可能退出登录；刷新后网站也可能重新设置 Cookie。</p>
      <div className="cookie-clear-dialog-actions">
        <Button variant="secondary" data-clear-cancel disabled={busy} onClick={()=>onCancel?.()}>取消</Button>
        <Button variant="danger" disabled={busy||!count} onClick={()=>onConfirm?.()}>
          {busy?'计算中…':'清理 '+count+' 条'}
        </Button>
      </div>
    </div>
  </dialog>;
}
