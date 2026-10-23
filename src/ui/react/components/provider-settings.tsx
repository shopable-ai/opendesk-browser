import * as React from 'react';
import {createPortal} from 'react-dom';
import {IconButton} from './ui/button.tsx';

function focusableElements(panel){
 return [...panel.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')]
  .filter(item=>item.tabIndex>=0&&item.getAttribute('aria-hidden')!=='true'&&
   !item.closest('[hidden],[inert]')&&item.getClientRects().length>0);
}

// One trusted provider-settings Portal under the existing React root.
// The caller's existing trusted controller keeps the only Provider config.
export function SharedProviderSettingsSheet({open=false,onClose,doc=globalThis.document,children}){
 const panel=React.useRef(null);
 React.useLayoutEffect(()=>{
  if(!open||!panel.current||!doc)return;
  const current=panel.current,restore=doc.activeElement;
  const root=doc.getElementById('opendesk-react-app'),wasInert=root?.inert;
  if(root)root.inert=true;
  const onKeydown=event=>{
   if(event.key==='Escape'){event.preventDefault();event.stopPropagation();onClose?.();return;}
   if(event.key!=='Tab')return;
   const elements=focusableElements(current),first=elements[0],last=elements.at(-1);
   if(!first){event.preventDefault();current.focus();return;}
   if(!current.contains(doc.activeElement)||(event.shiftKey&&doc.activeElement===first)){
    event.preventDefault();(event.shiftKey?last:first).focus();
   }else if(!event.shiftKey&&doc.activeElement===last){event.preventDefault();first.focus();}
  };
  doc.addEventListener('keydown',onKeydown,true);
  (current.querySelector('[aria-pressed="true"]')||current).focus({preventScroll:true});
  return ()=>{
   doc.removeEventListener('keydown',onKeydown,true);
   if(root)root.inert=wasInert;
   if(restore?.isConnected&&(current.contains(doc.activeElement)||doc.activeElement===doc.body))
    restore.focus?.({preventScroll:true});
  };
 },[open,onClose,doc]);
 if(!open||!doc?.body)return null;
 return createPortal(<div className="workflow-sheet-overlay">
  <div className="workflow-sheet-backdrop" aria-hidden="true" onClick={()=>onClose?.()}/>
  <section className="workflow-sheet-panel" role="dialog" aria-modal="true"
   aria-labelledby="workflow-sheet-title" ref={panel} tabIndex={-1}>
   <div className="workflow-sheet-heading od-toolbar"><h3 id="workflow-sheet-title">AI 设置</h3>
    <IconButton label="关闭 AI 设置" onClick={()=>onClose?.()}>
     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>
    </IconButton>
   </div>
   <div className="workflow-sheet-content">{children}</div>
  </section>
 </div>,doc.body);
}
