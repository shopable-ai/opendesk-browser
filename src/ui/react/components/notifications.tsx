import * as React from 'react';
import {createPortal} from 'react-dom';
import {Button,IconButton} from './ui/button.tsx';

// Reuse the existing bounded Host store. Only presentation moves outside the
// scrollable/hidden Tab; installed code still reaches it through the same Bridge.
export function NotificationViewport({view,snapshot,visible=true,locale}) {
  const toasts=snapshot.toasts?.length?snapshot.toasts:(snapshot.toast?[snapshot.toast]:[]);
  if(!toasts.length||typeof document==='undefined')return null;
  const language=locale||document.documentElement.lang||'zh-CN';
  return createPortal(<ToolToastStacks view={view} toasts={toasts} visible={visible} locale={language}/>,document.body);
}

function ToolToastStacks({view,toasts,visible,locale}){
  // The existing modal CSS hides notices. Keep their remaining reading time
  // while a review is open, including receipts that arrive behind that review.
  const [modalOpen,setModalOpen]=React.useState(()=>Boolean(document.querySelector('[aria-modal=true]')));
  React.useLayoutEffect(()=>{
    const check=()=>setModalOpen(Boolean(document.querySelector('[aria-modal=true]')));
    const observer=new document.defaultView.MutationObserver(check);
    check();
    observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['aria-modal']});
    return ()=>observer.disconnect();
  },[]);
  const positions=[...new Set(toasts.map(row=>row.position||'top-center'))];
  const opposed=positions.some(position=>position.startsWith('top'))&&
    positions.some(position=>position.startsWith('bottom'));
  return <>{positions.map(position=><div key={position} className="sidebar-tool-toast-stack"
    data-position={position} data-opposed={opposed} aria-label={toastCopy(locale).stack}>
    {toasts.filter(row=>(row.position||'top-center')===position).map(toast=>
      <ToolToast key={toast.id} view={view} toast={toast} visible={visible} paused={modalOpen} locale={locale}/>)}
  </div>)}</>;
}

const TOOL_TOAST_COPY={
  'zh-CN':{info:'提示',success:'成功',warning:'注意',error:'错误',stack:'通知',expand:'展开详情',collapse:'收起详情',details:'通知完整内容',close:'关闭提示',count:'同一通知出现 {count} 次'},
  en:{info:'Information',success:'Success',warning:'Warning',error:'Error',stack:'Notifications',expand:'Show details',collapse:'Hide details',details:'Full notification',close:'Dismiss notification',count:'Repeated {count} times'},
  ja:{info:'お知らせ',success:'成功',warning:'注意',error:'エラー',stack:'通知',expand:'詳細を表示',collapse:'詳細を閉じる',details:'通知の全文',close:'通知を閉じる',count:'同じ通知が{count}回'},
  'zh-TW':{info:'提示',success:'成功',warning:'注意',error:'錯誤',stack:'通知',expand:'展開詳情',collapse:'收起詳情',details:'通知完整內容',close:'關閉提示',count:'同一通知出現 {count} 次'}
};
const toastCopy=locale=>TOOL_TOAST_COPY[locale]||TOOL_TOAST_COPY['zh-CN'];
const TOOL_TOAST_SYMBOLS={info:'i',success:'✓',warning:'!',error:'!'};
// Restore focus when an auto-expiring success notice has keyboard focus.
function restoreToastFocus(node,priorFocus){
  const doc=node?.ownerDocument;
  if(!doc||!node.contains(doc.activeElement))return;
  const target=[priorFocus.current,doc.getElementById('sidebar-tool-back'),
    doc.querySelector('[role=tab][aria-selected=true]')].find(item=>
    item?.isConnected&&!item.disabled&&!item.closest?.('[hidden],[inert]'));
  target?.focus?.({preventScroll:true});
}
function ToolToast({view,toast,visible,paused,locale}) {
  const [hovered,setHovered]=React.useState(false),[focused,setFocused]=React.useState(false);
  const [expanded,setExpanded]=React.useState(false),[overflowing,setOverflowing]=React.useState(false);
  const priorFocus=React.useRef(null),toastNode=React.useRef<HTMLDivElement|null>(null);
  const messageNode=React.useRef<HTMLSpanElement|null>(null),captionNode=React.useRef<HTMLElement|null>(null);
  const contentNode=React.useRef<HTMLDivElement|null>(null),expandButton=React.useRef<HTMLButtonElement|null>(null);
  const closeButton=React.useRef<HTMLButtonElement|null>(null),contentId=React.useId();
  const copy=toastCopy(locale);
  React.useLayoutEffect(()=>{
    const node=toastNode.current;
    return ()=>restoreToastFocus(node,priorFocus);
  },[]);
  React.useLayoutEffect(()=>{
    const doc=toastNode.current?.ownerDocument,win=doc?.defaultView;
    let live=true;
    const measure=()=>{
      // Modal-hidden and detached notices have no measurable preview. Keep
      // their reading state and focus until the same host becomes visible.
      if(!live||paused||toastNode.current?.getClientRects?.().length===0)return;
      const overflow=[messageNode.current,captionNode.current].some(node=>{
        if(!node)return false;
        // Measure the rendered two-line preview in every locale/width, also
        // while expanded. Never guess a summary from an extension ID or text.
        const lineHeight=parseFloat(win?.getComputedStyle?.(node).lineHeight);
        const limit=Number.isFinite(lineHeight)?lineHeight*2:node.clientHeight;
        return node.scrollHeight>limit+1;
      });
      if(!overflow){
        const active=toastNode.current?.ownerDocument.activeElement;
        if(active===expandButton.current||active===contentNode.current)closeButton.current?.focus();
        setExpanded(false);
      }
      setOverflowing(overflow);
    };
    measure();
    const Observer=win?.ResizeObserver||globalThis.ResizeObserver;
    const observer=Observer?new Observer(measure):null;
    for(const node of [toastNode.current,messageNode.current,captionNode.current])
      if(node)observer?.observe(node);
    win?.addEventListener('resize',measure);
    doc?.fonts?.addEventListener('loadingdone',measure);
    void doc?.fonts?.ready?.then(measure,()=>{});
    return ()=>{
      live=false;observer?.disconnect();win?.removeEventListener('resize',measure);
      doc?.fonts?.removeEventListener('loadingdone',measure);
    };
  },[toast.message,toast.caption,toast.count,expanded,locale,paused]);
  const duration=Number.isSafeInteger(toast.timeout)?toast.timeout:5000;
  const pauseOnInteraction=toast.pauseOnInteraction!==false;
  // Revisions reset a changed notice's time once. Hover/focus pause the same
  // countdown across unrelated React renders without resetting on every repaint.
  const remaining=React.useRef<{revision:number|null,ms:number}>({revision:null,ms:duration});
  React.useEffect(()=>{
    const revision=toast.revision??toast.count;
    if(remaining.current.revision!==revision)
      remaining.current={revision,ms:duration};
    if(!visible){view.dismissToast(toast.id);return;}
    if(paused||(pauseOnInteraction&&(hovered||focused))||duration===0)return;
    const start=Date.now(),delay=Math.max(1,remaining.current.ms);
    const timer=setTimeout(()=>{
      if(!pauseOnInteraction)restoreToastFocus(toastNode.current,priorFocus);
      view.dismissToast(toast.id);
    },delay);
    return ()=>{
      if(remaining.current.revision===revision)
        remaining.current.ms=Math.max(1,remaining.current.ms-(Date.now()-start));
      clearTimeout(timer);
    };
  },[view,toast.id,toast.revision,toast.count,visible,paused,hovered,focused,duration,pauseOnInteraction]);
  if(!visible)return null;
  const type=['info','success','warning','error'].includes(toast.type)?toast.type:'info';
  return <div ref={toastNode} className="sidebar-tool-toast" data-type={type} data-expanded={expanded}
    onMouseEnter={()=>setHovered(true)} onMouseLeave={()=>setHovered(false)}
    onFocus={event=>{
      if(!event.currentTarget.contains(event.relatedTarget))priorFocus.current=event.relatedTarget;
      setFocused(true);
    }} onBlur={event=>{
      if(!event.currentTarget.contains(event.relatedTarget))setFocused(false);
    }}>
    <span className="sidebar-tool-toast-symbol" aria-hidden="true">{TOOL_TOAST_SYMBOLS[type]}</span>
    <div className="sidebar-tool-toast-body">
      <div id={contentId} ref={contentNode} className="sidebar-tool-toast-content"
        tabIndex={expanded?0:undefined} role={expanded?'region':undefined}
        aria-label={expanded?copy.details:undefined}>
        <div className="sidebar-tool-toast-text" role={type==='error'?'alert':'status'}
          aria-live={type==='error'?'assertive':'polite'} aria-atomic="true" aria-label={copy[type]}>
          <span ref={messageNode} className="sidebar-tool-toast-message">{toast.message}</span>
          {toast.caption&&<small ref={captionNode} className="sidebar-tool-toast-caption">{toast.caption}</small>}
        </div>
      </div>
      {(overflowing||expanded)&&<Button ref={expandButton} variant="quiet" className="sidebar-tool-toast-expand"
        aria-expanded={expanded} aria-controls={contentId} onClick={()=>{
          if(contentNode.current)contentNode.current.scrollTop=0;
          setExpanded(value=>!value);
        }}>{expanded?copy.collapse:copy.expand}</Button>}
    </div>
    {toast.count>1&&<span className="sidebar-tool-toast-count"
      aria-label={copy.count.replace('{count}',toast.count)}>×{toast.count}</span>}
    <IconButton ref={closeButton} label={copy.close} onMouseDown={event=>event.preventDefault()}
      onClick={event=>{
        if(event.currentTarget===event.currentTarget.ownerDocument.activeElement)
          restoreToastFocus(toastNode.current,priorFocus);
        view.dismissToast(toast.id);
      }}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
        strokeLinecap="round" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6"/></svg>
    </IconButton>
  </div>;
}
