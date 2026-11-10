import * as React from 'react';
import {createPortal} from 'react-dom';
import {IconButton} from './ui/button.tsx';

// Reuse the existing bounded Host store. Only presentation moves outside the
// scrollable/hidden Tab; installed code still reaches it through the same Bridge.
export function NotificationViewport({view,snapshot,visible=true}) {
  const toasts=snapshot.toasts?.length?snapshot.toasts:(snapshot.toast?[snapshot.toast]:[]);
  if(!toasts.length||typeof document==='undefined')return null;
  return createPortal(<ToolToastStacks view={view} toasts={toasts} visible={visible}/>,document.body);
}

function ToolToastStacks({view,toasts,visible}){
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
  return <>{positions.map(position=><div key={position} className="sidebar-tool-toast-stack"
    data-position={position} aria-label="工具通知">
    {toasts.filter(row=>(row.position||'top-center')===position).map(toast=>
      <ToolToast key={toast.id} view={view} toast={toast} visible={visible} paused={modalOpen}/>)}
  </div>)}</>;
}

const TOOL_TOAST_LABELS={info:'提示',success:'成功',warning:'注意',error:'错误'};
const TOOL_TOAST_SYMBOLS={info:'i',success:'✓',warning:'!',error:'!'};
function ToolToast({view,toast,visible,paused}) {
  const [hovered,setHovered]=React.useState(false),[focused,setFocused]=React.useState(false);
  const priorFocus=React.useRef(null);
  const duration=Number.isSafeInteger(toast.timeout)?toast.timeout:5000;
  // Revisions reset a changed notice's time once. Hover/focus pause the same
  // countdown across unrelated React renders without resetting on every repaint.
  const remaining=React.useRef<{revision:number|null,ms:number}>({revision:null,ms:duration});
  React.useEffect(()=>{
    const revision=toast.revision??toast.count;
    if(remaining.current.revision!==revision)
      remaining.current={revision,ms:duration};
    if(!visible){view.dismissToast(toast.id);return;}
    if(paused||hovered||focused||duration===0)return;
    const start=Date.now(),delay=Math.max(1,remaining.current.ms);
    const timer=setTimeout(()=>view.dismissToast(toast.id),delay);
    return ()=>{
      if(remaining.current.revision===revision)
        remaining.current.ms=Math.max(1,remaining.current.ms-(Date.now()-start));
      clearTimeout(timer);
    };
  },[view,toast.id,toast.revision,toast.count,visible,paused,hovered,focused,duration]);
  if(!visible)return null;
  const type=Object.hasOwn(TOOL_TOAST_LABELS,toast.type)?toast.type:'info';
  return <div className="sidebar-tool-toast" data-type={type}
    onMouseEnter={()=>setHovered(true)} onMouseLeave={()=>setHovered(false)}
    onFocus={event=>{
      if(!event.currentTarget.contains(event.relatedTarget))priorFocus.current=event.relatedTarget;
      setFocused(true);
    }} onBlur={event=>{
      if(!event.currentTarget.contains(event.relatedTarget))setFocused(false);
    }}>
    <span className="sidebar-tool-toast-symbol" aria-hidden="true">{TOOL_TOAST_SYMBOLS[type]}</span>
    <div className="sidebar-tool-toast-body" role={type==='error'?'alert':'status'}
      aria-live={type==='error'?'assertive':'polite'} aria-atomic="true"
      aria-label={TOOL_TOAST_LABELS[type]}>
      <span className="sidebar-tool-toast-message">{toast.message}</span>
      {toast.caption&&<small className="sidebar-tool-toast-caption">{toast.caption}</small>}
    </div>
    {toast.count>1&&<span className="sidebar-tool-toast-count"
      aria-label={'同一通知出现 '+toast.count+' 次'}>×{toast.count}</span>}
    <IconButton label="关闭提示" onMouseDown={event=>event.preventDefault()}
      onClick={event=>{
        const doc=event.currentTarget.ownerDocument;
        if(event.currentTarget===doc.activeElement){
          // A focus transition from the opaque tool iframe has no relatedTarget.
          const target=[priorFocus.current,doc.getElementById('sidebar-tool-back'),
            doc.querySelector('[role=tab][aria-selected=true]')].find(node=>
            node?.isConnected&&!node.disabled&&!node.closest?.('[hidden],[inert]'));
          target?.focus?.({preventScroll:true});
        }
        view.dismissToast(toast.id);
      }}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
        strokeLinecap="round" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6"/></svg>
    </IconButton>
  </div>;
}
