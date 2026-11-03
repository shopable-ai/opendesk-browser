import * as React from 'react';
import {createPortal} from 'react-dom';
import {IconButton} from '../../../src/ui/react/components/ui/button.tsx';

// Presentation within the existing trusted root, using the existing Sheet
// styles. The sandbox remains mounted and never receives this controller.
export function WebflowRuntimePanel({open,onClose,children}){
 const panel=React.useRef<HTMLElement>(null);
 React.useLayoutEffect(()=>{
  if(!open||!panel.current)return;
  const current=panel.current,doc=current.ownerDocument,restore=doc.activeElement as HTMLElement;
  const app=doc.getElementById('opendesk-react-app'),wasInert=app?.inert;
  const overflow=doc.body.style.overflow;
  if(app)app.inert=true;
  doc.body.style.overflow='hidden';
  const keydown=(event:KeyboardEvent)=>{
   if(event.isComposing||event.keyCode===229)return;
   if(event.key==='Escape'){event.preventDefault();event.stopPropagation();onClose();return;}
   if(event.key!=='Tab')return;
   const controls=[...current.querySelectorAll<HTMLElement>(
    'button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])')]
    .filter(node=>node.tabIndex>=0&&!node.closest('[hidden],[inert],details:not([open]) > :not(summary)')&&node.getClientRects().length);
   const first=controls[0],last=controls.at(-1);
   if(!first){event.preventDefault();current.focus();return;}
   if(!controls.includes(doc.activeElement as HTMLElement)||event.shiftKey&&doc.activeElement===first){
    event.preventDefault();(event.shiftKey?last:first).focus();
   }else if(!event.shiftKey&&doc.activeElement===last){event.preventDefault();first.focus();}
  };
  doc.addEventListener('keydown',keydown,true);
  current.focus({preventScroll:true});
  return ()=>{
   doc.removeEventListener('keydown',keydown,true);
   if(app)app.inert=wasInert;
   doc.body.style.overflow=overflow;
   if(restore?.isConnected&&!restore.closest('[hidden],[inert]'))restore.focus?.({preventScroll:true});
  };
 },[open,onClose]);
 if(typeof document==='undefined')return null;
 return createPortal(<div className="workflow-sheet-overlay" hidden={!open}>
  <div className="workflow-sheet-backdrop" aria-hidden="true" onClick={onClose}/>
  <section id="webflow-runtime-panel" ref={panel} role="dialog" aria-modal="true" aria-labelledby="webflow-runtime-title"
   className="workflow-sheet-panel" tabIndex={-1} style={{maxHeight:'88dvh'}}>
   <div className="workflow-sheet-heading od-toolbar" style={{paddingInline:'var(--space-4)'}}>
    <h3 id="webflow-runtime-title">运行与授权</h3>
    <IconButton label="关闭运行与授权" onClick={onClose}>
     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6"/></svg>
    </IconButton>
   </div>
   <div className="workflow-sheet-content od-stack" style={{padding:'var(--space-4)'}}>{children}</div>
  </section>
 </div>,document.body);
}
