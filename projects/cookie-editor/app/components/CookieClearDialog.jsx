import * as React from 'react';
import {Button} from '@opendesk/ui';

// Shared presentation only. Neither the preview nor the native Host's scope,
// permission, preview token or deletion algorithm belongs to this component.
export default function CookieClearDialog({
  trigger, hostname, count, excluded=0, includeShared=true, busy=false, problem=null,
  canRetry=true, onScopeChange, onRetry, onCancel, onConfirm
}){
  const dialogRef=React.useRef(null);
  const triggerRef=React.useRef(trigger);
  const headingId=React.useId();
  const descriptionId=React.useId();
  React.useLayoutEffect(()=>{
    const dialog=dialogRef.current;
    if(!dialog)return;
    const active=dialog.ownerDocument.activeElement;
    triggerRef.current??=active&&active!==dialog.ownerDocument.body?active:
      dialog.parentElement?.querySelector('[aria-label="安全清理本站 Cookie"]');
    dialog.showModal();
    dialog.querySelector('[data-clear-cancel]')?.focus();
    return ()=>{
      if(dialog.open)dialog.close();
      const trigger=triggerRef.current;
      // Cancel releases the pending preview and re-enables the trigger in
      // the same commit. Layout cleanup can run before that DOM update.
      queueMicrotask(()=>{
        const doc=dialog.ownerDocument;
        if(trigger?.isConnected&&!trigger.disabled&&doc.activeElement===doc.body)
          trigger.focus({preventScroll:true});
      });
    };
  },[]);
  return <dialog ref={dialogRef} className="cookie-clear-dialog od-surface"
    aria-labelledby={headingId} aria-describedby={descriptionId}
    onCancel={event=>{event.preventDefault();onCancel?.();}}>
    <div className="cookie-clear-dialog-body">
      <h2 id={headingId}>清理本站 Cookie</h2>
      <p className="cookie-clear-dialog-host">{hostname}</p>
      <label className="cookie-clear-dialog-option">
        <input type="checkbox" checked={includeShared} disabled={busy||!canRetry}
          onChange={event=>onScopeChange?.(event.target.checked)}/>
        <span>包含共享和分区 Cookie</span>
      </label>
      <p id={descriptionId} aria-live="polite">{busy?'正在计算清理范围…':problem||(!count?
        '当前清理范围内没有可删除的 Cookie。':<>将清理 <strong>{count}</strong> 条 Cookie。</>)}</p>
      <p className="cookie-clear-dialog-scope">{includeShared?
        '清理本主机全部路径、当前存储区和当前分区内的 Cookie。共享 Cookie 可能影响其他子域登录。'+
          (excluded?' 保留 '+excluded+' 条超出当前清理范围的 Cookie。':''):
        '仅清理当前主机专用的 Cookie，保留共享及分区 Cookie。'}
        {' '}可能退出登录；刷新后网站也可能重新设置 Cookie。</p>
      <div className="cookie-clear-dialog-actions">
        <Button variant="secondary" data-clear-cancel onClick={()=>onCancel?.()}>取消</Button>
        {problem&&canRetry&&<Button variant="secondary" onClick={()=>onRetry?.()}>重试</Button>}
        <Button variant="danger" disabled={busy||Boolean(problem)||!count} onClick={()=>onConfirm?.()}>
          {count?'清理 '+count+' 条':'清理'}
        </Button>
      </div>
    </div>
  </dialog>;
}
