// Same-document, trusted right-button gestures only. No Chrome/Tab APIs here.
export const GESTURE_LIMITS = Object.freeze({activatePx:56, maxCrossPx:28, menuGuardMs:600});

const EXCLUDED_TARGETS = 'input,textarea,select,option,button,a,[contenteditable],[role="textbox"],[role="slider"],[draggable="true"],canvas,video';

function excluded(event, win) {
  if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return true;
  if (win.getSelection?.()?.isCollapsed === false) return true;
  const path = typeof event.composedPath === 'function' ? event.composedPath() : [event.target];
  return path.some(node => typeof node?.closest === 'function' && node.closest(EXCLUDED_TARGETS));
}

function direction(state, x, y) {
  const dx = x - state.x, dy = y - state.y;
  const horizontal = Math.abs(dx) >= GESTURE_LIMITS.activatePx &&
    Math.abs(dy) <= GESTURE_LIMITS.maxCrossPx &&
    state.maxY <= GESTURE_LIMITS.maxCrossPx && Math.abs(dx) > Math.abs(dy) * 1.5;
  const vertical = Math.abs(dy) >= GESTURE_LIMITS.activatePx &&
    Math.abs(dx) <= GESTURE_LIMITS.maxCrossPx &&
    state.maxX <= GESTURE_LIMITS.maxCrossPx && Math.abs(dy) > Math.abs(dx) * 1.5;
  if (horizontal) return dx < 0 ? 'left' : 'right';
  if (vertical) return dy < 0 ? 'up' : 'down';
  return null;
}

function bottomOfPage(doc) {
  return Math.max(0, doc.scrollingElement?.scrollHeight || 0,
    doc.documentElement?.scrollHeight || 0, doc.body?.scrollHeight || 0);
}

export function mountGestures({ui, doc=globalThis.document, win=doc.defaultView,
  enabled=true, authorizeGesture=()=>true,
  navigateBack=()=>win.history.back(), navigateForward=()=>win.history.forward(),
  reloadPage=()=>win.location.reload(), scrollBottom=()=>win.scrollTo(0,bottomOfPage(doc))}={}) {
  if (!ui?.on || !ui?.onDispose || !ui?.host || !ui?.content || !doc?.createElementNS || !win ||
    typeof authorizeGesture !== 'function')
    throw Error('E_GESTURE_CONTEXT: managed Page UI and document required');
  let state=null, disposed=false, allowed=enabled===true, epoch=0, menuGuardUntil=0;
  const host=ui.host;
  for (const [name,value] of Object.entries({position:'fixed',inset:'0',width:'100vw',height:'100vh',
    maxWidth:'none',zIndex:'2147483646',pointerEvents:'none',display:'none'}))
    host.style.setProperty(name.replace(/[A-Z]/g,c=>'-'+c.toLowerCase()),value,'important');
  const trace=doc.createElementNS('http://www.w3.org/2000/svg','svg');
  trace.setAttribute('aria-hidden','true');
  trace.setAttribute('width','100%');
  trace.setAttribute('height','100%');
  trace.style.cssText='position:fixed;inset:0;pointer-events:none;overflow:visible';
  const path=doc.createElementNS('http://www.w3.org/2000/svg','path');
  for (const [name,value] of Object.entries({'stroke':'#2586ef','stroke-width':'4',
    'stroke-linecap':'round','stroke-linejoin':'round','fill':'none'})) path.setAttribute(name,value);
  trace.append(path);ui.content.append(trace);

  const hide=()=>{host.style.setProperty('display','none','important');path.setAttribute('d','');};
  const cancel=()=>{epoch++;state=null;hide();};
  const alive=()=>!disposed && allowed && ui.active();
  const draw=(gesture,x,y)=>{
    if(gesture.points.length>=80)gesture.points.shift();
    gesture.points.push([x,y]);
    path.setAttribute('d',gesture.points.map(([px,py],i)=>(i?'L':'M')+px+' '+py).join(' '));
  };
  function updateRange(gesture,x,y){
    gesture.maxX=Math.max(gesture.maxX,Math.abs(x-gesture.x));
    gesture.maxY=Math.max(gesture.maxY,Math.abs(y-gesture.y));
  }
  function execute(which){
    if(which==='left' && win.history?.length>1)navigateBack();
    else if(which==='right' && win.history?.length>1)navigateForward();
    else if(which==='up')reloadPage();
    else if(which==='down')scrollBottom();
  }
  function finish(which,token){
    // The final check uses the installed app's current private settings and authority.
    // A pending asynchronous result never outlives a new gesture, blur, or disposal.
    if(token!==epoch || !alive())return;
    let approval;
    try{approval=authorizeGesture();}catch{return;}
    if(approval===true){if(token===epoch&&alive())execute(which);return;}
    if(approval===false)return;
    Promise.resolve(approval).then(ok=>{
      if(ok===true && token===epoch && alive())execute(which);
    }).catch(()=>{});
  }
  ui.on(doc,'mousedown',event=>{
    if(event.button!==2)return;
    menuGuardUntil=0; // A subsequent ordinary right click always keeps its native menu.
    cancel();
    if(!alive()||event.isTrusted!==true||excluded(event,win))return;
    state={x:event.clientX,y:event.clientY,maxX:0,maxY:0,
      selected:null,points:[[event.clientX,event.clientY]]};
  },true);
  ui.on(doc,'mousemove',event=>{
    if(!state)return;
    if(!alive()||event.isTrusted!==true||(event.buttons&2)===0)return cancel();
    updateRange(state,event.clientX,event.clientY);
    const current=direction(state,event.clientX,event.clientY);
    if(!state.selected && current){state.selected=current;host.style.setProperty('display','block','important');}
    if(state.selected)draw(state,event.clientX,event.clientY);
  },true);
  ui.on(doc,'mouseup',event=>{
    if(!state||event.button!==2)return;
    updateRange(state,event.clientX,event.clientY);
    const selected=state.selected;
    const completed=alive()&&event.isTrusted===true&&selected &&
      direction(state,event.clientX,event.clientY)===selected;
    cancel();
    if(!selected)return;
    menuGuardUntil=Date.now()+GESTURE_LIMITS.menuGuardMs;
    event.preventDefault();
    if(completed)finish(selected,epoch);
  },true);
  ui.on(doc,'contextmenu',event=>{
    if(event.isTrusted===true&&(state?.selected||Date.now()<menuGuardUntil)){
      event.preventDefault();event.stopPropagation();
    }
  },true);
  ui.on(doc,'keydown',event=>{
    if(event.key!=='Escape'||!state)return;
    const engaged=Boolean(state.selected);cancel();
    if(engaged){menuGuardUntil=Date.now()+GESTURE_LIMITS.menuGuardMs;event.preventDefault();}
  },true);
  ui.on(win,'blur',cancel);
  ui.on(doc,'visibilitychange',()=>{if(doc.visibilityState==='hidden')cancel();});
  ui.onDispose(()=>{disposed=true;menuGuardUntil=0;cancel();});
  return Object.freeze({isActive:alive,setEnabled(next){if(disposed)return;allowed=next===true;if(!allowed)cancel();}});
}

// Historical internal name, retained so the original pilot tests remain meaningful.
export const mountBackGesture=mountGestures;
