import * as React from 'react';

// Opening this low-frequency action never starts or stops the bounded observer.
export default function CookieMonitorPopover({phase='idle',remaining=0,gap=false,
  detected=false,supported=true,available=true,onStart=()=>{},onStop=()=>{}}){
  const [open,setOpen]=React.useState(false);
  const root=React.useRef(null),trigger=React.useRef(null),panel=React.useRef(null);
  const panelId=React.useId(),noteId=React.useId();
  const running=phase==='running',starting=phase==='starting',failed=phase==='error';
  const finished=phase==='ended'||phase==='stopped';
  const menuAvailable=!running&&!starting;
  const status=running?'监听中':starting?'正在开启':failed?'监听中断':
    phase==='ended'?'监听结束':phase==='stopped'?'监听已停止':'';
  const result=(detected?'已检测到 Cookie 变化。':gap?'监听记录不完整。':'本次未检测到 Cookie 变化。')+
    (gap&&detected?'部分变化可能未捕获。':'');
  const label=running?'监听中，停止监听':finished?status+'，查看结果':status||'更多 Cookie 操作';
  const close=restore=>{setOpen(false);if(restore)trigger.current?.focus({preventScroll:true});};
  const showPanel=open&&menuAvailable;
  React.useEffect(()=>{
    if(!showPanel)return;
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
  },[showPanel]);
  React.useLayoutEffect(()=>{
    if(showPanel)(panel.current?.querySelector('button:not(:disabled)')||panel.current)?.focus({preventScroll:true});
  },[showPanel]);
  const note=!supported?'当前环境不支持短时监听，列表仍会自动同步。':
    !available?'完成当前操作后可开启监听。':
    failed?'可重试，或在顶部设置检查网站权限。':
    '列表会自动同步。监听可额外发现仅内容变化的 Cookie，范围为当前页面可用的非分区 Cookie，最长 30 秒。';
  return <div className="cookie-monitor" ref={root}>
    <button ref={trigger} type="button"
      className={status?'od-button od-button--quiet cookie-monitor-status'+
        (running?' is-listening':'')+(failed?' has-warning':''):
        'cookie-react-icon icon-btn od-icon-button od-icon-button--quiet'}
      aria-label={label} title={running?'停止监听':finished?result:label}
      aria-disabled={starting||undefined}
      aria-haspopup={menuAvailable?'dialog':undefined} aria-expanded={menuAvailable?showPanel:undefined}
      aria-controls={showPanel?panelId:undefined} onClick={()=>{
        if(running)onStop();else if(menuAvailable)setOpen(value=>!value);
      }}>
      {running?<>
        <span>监听中 <span className="cookie-monitor-time">{remaining} 秒</span></span>
        <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <rect x="4" y="4" width="8" height="8" rx="1" fill="currentColor"/>
        </svg>
      </>:status||<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none"
        stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        {[5,12,19].map(cx=><circle key={cx} cx={cx} cy="12" r="1"/>)}
      </svg>}
    </button>
    {showPanel&&<section className="cookie-monitor-popover" id={panelId} ref={panel}
      role="dialog" aria-modal="false" aria-label="Cookie 变化监听" aria-describedby={noteId} tabIndex={-1}>
      <p className="cookie-monitor-note" id={noteId}>{finished?result+' '+note:note}</p>
      <button type="button" className="od-button od-button--quiet cookie-monitor-action"
        disabled={!available||!supported}
        onClick={()=>{onStart();close(true);}}>
        {failed?'重试监听':finished?'再次监听':'监听当前网站'}
      </button>
    </section>}
    <span className="cookie-monitor-announcement" role="status" aria-live="polite" aria-atomic="true">
      {finished?status+'。'+result:status}
    </span>
  </div>;
}
