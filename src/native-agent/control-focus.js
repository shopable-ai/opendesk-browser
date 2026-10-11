// Busy controls lose focus when Chrome disables them. Restore only that loss;
// later user navigation and background documents keep their own focus.
export function recoverControlFocus(doc,fallback){
  const origin=doc.activeElement;
  if(!origin||origin===doc.body||typeof origin.focus!=='function'||doc.hidden||!doc.hasFocus?.())return {disabled(){},restore(){}};
  let moved=false,lost=false;
  const focus=()=>{if(doc.activeElement!==origin&&doc.activeElement!==doc.body)moved=true;};
  const pointer=event=>{if(event.target!==origin&&!origin.contains?.(event.target))moved=true;};
  const key=event=>{if(event.key==='Tab')moved=true;};
  const blur=()=>{moved=true;};
  const visibility=()=>{if(doc.hidden)moved=true;};
  doc.addEventListener('focusin',focus,true);
  doc.addEventListener('pointerdown',pointer,true);
  doc.addEventListener('keydown',key,true);
  doc.addEventListener('visibilitychange',visibility);
  doc.defaultView?.addEventListener('blur',blur);
  // Chrome may defer the resulting BODY focus until this call stack unwinds.
  return {disabled(){lost=origin.disabled;},restore(enabled=true){
    doc.removeEventListener('focusin',focus,true);
    doc.removeEventListener('pointerdown',pointer,true);
    doc.removeEventListener('keydown',key,true);
    doc.removeEventListener('visibilitychange',visibility);
    doc.defaultView?.removeEventListener('blur',blur);
    if(!enabled||!lost||moved||doc.hidden||!doc.hasFocus()||doc.activeElement!==doc.body)return;
    const target=origin.isConnected&&!origin.disabled?origin:fallback;
    if(target?.isConnected&&!target.disabled&&!target.hidden&&target.getClientRects().length)target.focus({preventScroll:true});
  }};
}
