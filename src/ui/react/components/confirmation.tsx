import * as React from 'react';
import {ModalOverlay,Modal,Dialog,Heading} from 'react-aria-components';
import {Button} from './ui/button.tsx';
import './confirmation.css';

// Presentation only. The original Host owns pending requests and execution;
// ordinary choices never carry a browser event back to an SDK consumer.
export function Confirmation({open,identity,title,message,confirmLabel,cancelLabel='取消',
  tone='neutral',source,onConfirm,onCancel}) {
  const panel=React.useRef(null),cancel=React.useRef(null);
  const pressedInside=React.useRef(new Set());
  const titleId=React.useId(),messageId=React.useId();
  // Capture before child FocusScope/layout effects move focus into the portal.
  // Focusing the retained iframe restores its own last focused business control.
  const returnFocus=React.useMemo(()=>open?globalThis.document?.activeElement:null,[open,identity]);
  React.useLayoutEffect(()=>{
    if(!open||!panel.current)return;
    const node=panel.current,doc=node.ownerDocument,previous=returnFocus;
    pressedInside.current.clear();
    // Dialog's React Aria DOM filter does not forward capture-handler props.
    // Install native capture listeners before browser button default actions.
    node.addEventListener('keydown',suppress,true);
    node.addEventListener('keyup',suppress,true);
    let portal=node;
    while(portal.parentElement&&portal.parentElement!==doc.body)portal=portal.parentElement;
    const isolated=new Map(),overflow=doc.body.style.overflow;
    const isolate=()=>{
      for(const sibling of doc.body.children){
        if(sibling===portal||sibling.contains(node)||isolated.has(sibling))continue;
        isolated.set(sibling,sibling.inert);sibling.inert=true;
      }
    };
    isolate();doc.body.style.overflow='hidden';
    const observer=new doc.defaultView.MutationObserver(isolate);
    observer.observe(doc.body,{childList:true});
    cancel.current?.focus({preventScroll:true});
    return ()=>{
      observer.disconnect();
      node.removeEventListener('keydown',suppress,true);
      node.removeEventListener('keyup',suppress,true);
      for(const [sibling,inert] of isolated)sibling.inert=Boolean(inert);
      doc.body.style.overflow=overflow;
      if(previous?.isConnected&&!previous.disabled&&!previous.closest?.('[inert],[hidden]'))
        previous.focus?.({preventScroll:true});
    };
  },[open,identity,returnFocus]);
  const suppress=event=>{
    // Composition and a held opening key cannot approve or escape this layer.
    if(!['Enter',' ','Escape'].includes(event.key))return;
    const invalid=event.isComposing||event.nativeEvent?.isComposing||event.repeat;
    // A keyup from the iframe's opening key must not press the newly focused
    // safe button. Only a fresh keydown inside this dialog may begin a press.
    const orphan=event.type==='keyup'&&!pressedInside.current.has(event.key);
    if(event.type==='keyup')pressedInside.current.delete(event.key);
    else if(!invalid)pressedInside.current.add(event.key);
    if(invalid||orphan){
      event.preventDefault();event.stopPropagation();
    }
  };
  return <ModalOverlay isOpen={Boolean(open)} isDismissable={false}
    onOpenChange={next=>{if(!next)onCancel?.('escape');}}
    className="od-uninstall-overlay od-confirm-overlay">
    <Modal className="od-uninstall-dialog od-confirm-surface">
      <Dialog ref={panel} role="alertdialog" aria-labelledby={titleId} aria-describedby={messageId}
        className="od-confirm-dialog">
        <Heading slot="title" id={titleId}>{title}</Heading>
        {source&&<p className="od-confirm-source">{source}</p>}
        <p id={messageId} className="od-confirm-message">{message}</p>
        <div className="sidebar-tool-action-buttons">
          <Button ref={cancel} autoFocus id="sidebar-tool-action-cancel" onClick={()=>onCancel?.('user')}>
            {cancelLabel}
          </Button>
          <Button id="sidebar-tool-action-continue" variant={tone==='danger'?'danger':'primary'}
            onClick={event=>onConfirm?.(event.nativeEvent||event)}>{confirmLabel}</Button>
        </div>
      </Dialog>
    </Modal>
  </ModalOverlay>;
}
