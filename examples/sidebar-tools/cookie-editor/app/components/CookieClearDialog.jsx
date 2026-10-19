import * as React from 'react';

// Shared presentation only. Neither the preview nor the native Host's scope,
// permission, preview token or deletion algorithm belongs to this component.
export default function CookieClearDialog({
  hostname, count, scopeText, busy=false, onCancel, onConfirm
}){
  const dialogRef=React.useRef(null);
  const cancelRef=React.useRef(null);
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
    cancelRef.current?.focus();
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
      <p id={descriptionId}>将清理 <strong>{count}</strong> 条 Cookie。</p>
      <p className="cookie-clear-dialog-scope">{scopeText||
        '仅处理当前主机符合清理规则的 Host-only Cookie，其他 Cookie 保留。'}</p>
      <div className="cookie-clear-dialog-actions">
        <button ref={cancelRef} type="button" className="text-btn od-button od-button--secondary"
          disabled={busy} onClick={()=>onCancel?.()}>取消</button>
        <button type="button" className="text-btn danger od-button od-button--danger"
          disabled={busy} onClick={()=>onConfirm?.()}>
          {busy?'清理中…':'清理 '+count+' 条'}
        </button>
      </div>
    </div>
  </dialog>;
}
