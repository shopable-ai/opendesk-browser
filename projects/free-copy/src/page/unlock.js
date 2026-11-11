// Page USER_SCRIPT: only restores the browser's native selection/copy behavior.
// Never reads selected text, never changes clipboard contents and never handles paste.
export const DRAG_GUARD_PX=56;
const TEXT_TARGETS=':where(html,body,article,main,section,header,footer,aside,p,div,span,li,dt,dd,blockquote,pre,code,h1,h2,h3,h4,h5,h6,strong,em,small,b,i,td,th,label)';
const EXCLUDE='input,textarea,select,option,button,canvas,svg,video,audio,[contenteditable],[contenteditable] *,[role="textbox"],[role="textbox"] *,[role="button"],[role="slider"],[draggable="true"],[draggable="true"] *,[data-opendesk-free-copy-ignore]';
const CSS=TEXT_TARGETS+':not(:is('+EXCLUDE+')){-webkit-user-select:text!important;user-select:text!important;-webkit-touch-callout:default!important}';

function staticTextTarget(event,doc) {
  const node=event?.target;
  const target=node?.nodeType===1?node:node?.parentElement||doc.activeElement;
  return Boolean(target&&typeof target.closest==='function'&&!target.closest(EXCLUDE));
}
function selectionExists(win) {
  try { return win.getSelection?.()?.isCollapsed===false; } catch { return false; }
}
function stopSiteHandlers(event) {
  // Do not preventDefault: the browser must still perform its native action.
  event.stopImmediatePropagation?.();
  event.stopPropagation?.();
}

export function mountFreeCopy({ui,doc=globalThis.document,win=doc.defaultView,enabled=false}={}) {
  if (!ui?.on||!ui?.onDispose||!ui?.active||!doc?.createElement||!win)
    throw Error('E_FREE_COPY_CONTEXT');
  let disposed=false,allowed=false,rightDrag=null;
  const style=doc.createElement('style');
  style.setAttribute('data-opendesk-free-copy','');
  style.textContent=CSS;
  const isActive=()=>allowed&&!disposed&&ui.active();
  const supports=event=>isActive()&&event?.isTrusted===true&&staticTextTarget(event,doc);
  const apply=()=>{
    if(isActive()){
      if(!style.isConnected) (doc.head||doc.documentElement)?.append(style);
    }else style.remove();
  };
  ui.on(win,'selectstart',event=>{
    if(supports(event))stopSiteHandlers(event);
  },true);
  ui.on(win,'copy',event=>{
    if(supports(event)&&selectionExists(win))stopSiteHandlers(event);
  },true);
  ui.on(win,'keydown',event=>{
    if(!supports(event)||!selectionExists(win)||event.altKey||event.shiftKey||
      !(event.ctrlKey||event.metaKey)||String(event.key).toLowerCase()!=='c')return;
    stopSiteHandlers(event);
  },true);
  ui.on(win,'mousedown',event=>{
    rightDrag=event?.isTrusted===true&&event.button===2?
      {x:event.clientX,y:event.clientY,dragged:false,at:Date.now()}:null;
  },true);
  ui.on(win,'mousemove',event=>{
    if(!rightDrag||!isActive())return;
    if(event?.isTrusted!==true||(event.buttons&2)===0){rightDrag=null;return;}
    if(Math.hypot(event.clientX-rightDrag.x,event.clientY-rightDrag.y)>=DRAG_GUARD_PX)
      rightDrag.dragged=true;
  },true);
  ui.on(win,'contextmenu',event=>{
    if(!supports(event))return;
    // Allow an already recognized right-button drag to reach Mouse Gestures.
    // Native OS menus raised before the first mousemove remain a browser limitation.
    if(rightDrag?.dragged&&Date.now()-rightDrag.at<900)return;
    stopSiteHandlers(event);
  },true);
  ui.on(win,'blur',()=>{rightDrag=null;});
  ui.onDispose(()=>{disposed=true;allowed=false;rightDrag=null;apply();});
  return Object.freeze({
    isActive,
    setEnabled(next){if(disposed)return;allowed=next===true;rightDrag=null;apply();}
  });
}
