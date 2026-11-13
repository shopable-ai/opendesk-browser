import * as React from 'react';

// Opening this low-frequency action never starts or stops the bounded observer.
export default function CookieMonitorPopover({phase='idle',remaining=0,gap=false,
  supported=true,available=true,onStart=()=>{},onStop=()=>{}}){
  const [open,setOpen]=React.useState(false);
  const root=React.useRef(null),trigger=React.useRef(null),panel=React.useRef(null);
  const panelId=React.useId(),noteId=React.useId();
  const running=phase==='running',starting=phase==='starting',failed=phase==='error';
  const status=running?'监听中':starting?'正在开启监听':failed?'监听未完成':
    phase==='ended'?'监听已结束':'';
  const label='更多 Cookie 操作'+(status?'，'+status:'');
  const close=restore=>{setOpen(false);if(restore)trigger.current?.focus({preventScroll:true});};
  React.useEffect(()=>{
    if(!open)return;
    const outside=event=>{if(!root.current?.contains(event.target))setOpen(false);};
    const escape=event=>{
      if(event.key!=='Escape')return;
      event.preventDefault();event.stopPropagation();close(true);
    };
    const blur=()=>setOpen(false);
    document.addEventListener('pointerdown',outside,true);
    document.addEventListener('focusin',outside,true);
    document.addEventListener('keydown',escape,true);
    window.addEventListener('blur',blur);
    return ()=>{
      document.removeEventListener('pointerdown',outside,true);
      document.removeEventListener('focusin',outside,true);
      document.removeEventListener('keydown',escape,true);
      window.removeEventListener('blur',blur);
    };
  },[open]);
  React.useLayoutEffect(()=>{
    if(open)(panel.current?.querySelector('button:not(:disabled)')||panel.current)?.focus({preventScroll:true});
  },[open]);
  const note=!supported?'当前环境不支持短时监听，列表仍会自动同步。':
    !available&&!running?'完成或关闭当前编辑、导入或导出后可监听。':
    failed?'监听未完成，可重试；网站权限可在顶部设置中检查。':
    running?'监听中 · '+remaining+' 秒后自动停止'+(gap?'；部分变化可能未捕获。':'。'):
    '列表默认自动同步；短时监听补充内容变化提醒。';
  return <div className="cookie-monitor" ref={root}>
    <button ref={trigger} type="button"
      className={'cookie-react-icon icon-btn od-icon-button od-icon-button--quiet cookie-monitor-trigger'+
        (running||starting?' is-listening':'')+(failed?' has-warning':'')}
      aria-label={label} title={label} aria-haspopup="dialog" aria-expanded={open}
      aria-controls={open?panelId:undefined} onClick={()=>setOpen(value=>!value)}>
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none"
        stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        {[5,12,19].map(cx=><circle key={cx} cx={cx} cy="12" r="1"/>)}
      </svg>
      {(failed||running||starting)&&<span className="cookie-monitor-badge" aria-hidden="true">
        {failed?'!':starting?'…':'■'}
      </span>}
    </button>
    {open&&<section className="cookie-monitor-popover" id={panelId} ref={panel}
      role="dialog" aria-modal="false" aria-label="更多 Cookie 操作" aria-describedby={noteId} tabIndex={-1}>
      <button type="button" className="od-button od-button--quiet cookie-monitor-action"
        disabled={starting||(!running&&(!available||!supported))}
        onClick={()=>{if(running)onStop();else onStart();close(true);}}>
        {running?'停止监听':starting?'正在开启…':failed?'重试监听（30 秒）':'监听 Cookie 变化（30 秒）'}
      </button>
      <p className={'cookie-monitor-note'+(failed?' cookie-monitor-error':'')} id={noteId}
        role={failed||!supported||!available?'status':undefined}>{note}</p>
    </section>}
    <span className="cookie-monitor-announcement" role="status" aria-live="polite" aria-atomic="true">
      {status}
    </span>
  </div>;
}
