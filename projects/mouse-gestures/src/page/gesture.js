// Only same-document, trusted mouse input. No Chrome/Tab APIs or synthetic menus.
export const GESTURE_LIMITS=Object.freeze({
  jitterPx:8,intentPx:12,activatePx:56,maxCrossPx:28,reversalPx:12,
  menuMatchPx:16,menuGuardMs:450
});
export const GESTURE_TRIGGERS=Object.freeze({RIGHT:'right',ALT_LEFT:'alt-left'});
const LABELS=Object.freeze({left:'← 后退',right:'→ 前进',up:'↑ 刷新',down:'↓ 到底'});
const EXCLUDED_TARGETS='input,textarea,select,option,button,a,[contenteditable],[role="textbox"],[role="slider"],[draggable="true"],canvas,video';
const NS='http://www.w3.org/2000/svg';
const cssName=name=>name.replace(/[A-Z]/g,c=>'-'+c.toLowerCase());

function excluded(event,win,trigger){
  if(event.ctrlKey||event.metaKey||event.shiftKey)return true;
  if(trigger===GESTURE_TRIGGERS.RIGHT&&event.altKey)return true;
  if(trigger===GESTURE_TRIGGERS.ALT_LEFT&&!event.altKey)return true;
  if(win.getSelection?.()?.isCollapsed===false)return true;
  const path=typeof event.composedPath==='function'?event.composedPath():[event.target];
  return path.some(node=>typeof node?.closest==='function'&&node.closest(EXCLUDED_TARGETS));
}
const primaryButton=trigger=>trigger===GESTURE_TRIGGERS.RIGHT?2:0;
const buttonMask=trigger=>trigger===GESTURE_TRIGGERS.RIGHT?2:1;

function recordPoint(session,x,y){
  const dx=x-session.x,dy=y-session.y;
  session.minDx=Math.min(session.minDx,dx);
  session.maxDx=Math.max(session.maxDx,dx);
  session.minDy=Math.min(session.minDy,dy);
  session.maxDy=Math.max(session.maxDy,dy);
  session.maxX=Math.max(session.maxX,Math.abs(dx));
  session.maxY=Math.max(session.maxY,Math.abs(dy));
  session.lastX=x;session.lastY=y;
  if(session.points.length>=80)session.points.shift();
  session.points.push([x,y]);
  return {dx,dy,distance:Math.hypot(dx,dy)};
}
function reversed(session){
  return (session.maxDx>GESTURE_LIMITS.reversalPx&&
    -session.minDx>GESTURE_LIMITS.reversalPx)||
    (session.maxDy>GESTURE_LIMITS.reversalPx&&
    -session.minDy>GESTURE_LIMITS.reversalPx)||session.backtracked;
}
function monitorReversal(session,dx,dy){
  // Also invalidate backtracking on one side of the origin, not just crossings.
  if(!session.candidate){
    if(Math.abs(dx)>=GESTURE_LIMITS.intentPx&&Math.abs(dx)>Math.abs(dy)*1.2)
      session.candidate=dx<0?'left':'right';
    else if(Math.abs(dy)>=GESTURE_LIMITS.intentPx&&Math.abs(dy)>Math.abs(dx)*1.2)
      session.candidate=dy<0?'up':'down';
    session.peak=0;
  }
  if(!session.candidate)return;
  const progress=session.candidate==='left'?-dx:session.candidate==='right'?dx:
    session.candidate==='up'?-dy:dy;
  session.peak=Math.max(session.peak,progress);
  if(session.peak-progress>GESTURE_LIMITS.reversalPx)session.backtracked=true;
}
function direction(session,dx,dy){
  if(reversed(session))return null;
  if(Math.abs(dx)>=GESTURE_LIMITS.activatePx&&
    Math.abs(dy)<=GESTURE_LIMITS.maxCrossPx&&
    session.maxY<=GESTURE_LIMITS.maxCrossPx&&Math.abs(dx)>Math.abs(dy)*1.5)
    return dx<0?'left':'right';
  if(Math.abs(dy)>=GESTURE_LIMITS.activatePx&&
    Math.abs(dx)<=GESTURE_LIMITS.maxCrossPx&&
    session.maxX<=GESTURE_LIMITS.maxCrossPx&&Math.abs(dy)>Math.abs(dx)*1.5)
    return dy<0?'up':'down';
  return null;
}
function sameRelease(event,release){
  return event?.isTrusted===true&&event.button===release.button&&
    event.target===release.target&&Number.isFinite(event.clientX)&&
    Number.isFinite(event.clientY)&&
    Math.hypot(event.clientX-release.x,event.clientY-release.y)<=GESTURE_LIMITS.menuMatchPx&&
    Date.now()-release.at<=GESTURE_LIMITS.menuGuardMs;
}
function pageBottom(doc){
  return Math.max(0,doc.scrollingElement?.scrollHeight||0,
    doc.documentElement?.scrollHeight||0,doc.body?.scrollHeight||0);
}

export function mountGestures({ui,doc=globalThis.document,win=doc.defaultView,
  enabled=true,trigger=GESTURE_TRIGGERS.RIGHT,showTrace=true,authorizeGesture=()=>true,
  navigateBack=()=>win.history.back(),navigateForward=()=>win.history.forward(),
  reloadPage=()=>win.location.reload(),scrollBottom=()=>win.scrollTo(0,pageBottom(doc))}={}){
  if(!ui?.on||!ui?.onDispose||!ui?.host||!ui?.content||!doc?.createElementNS||!win||
    typeof authorizeGesture!=='function')throw Error('E_GESTURE_CONTEXT');
  let disposed=false,allowed=enabled===true;
  let activeTrigger=trigger===GESTURE_TRIGGERS.ALT_LEFT?trigger:GESTURE_TRIGGERS.RIGHT;
  let displayTrace=showTrace!==false,session=null,releaseGuard=null,epoch=0,frame=null;
  const host=ui.host;
  for(const [name,value] of Object.entries({position:'fixed',inset:'0',width:'100vw',height:'100vh',
    maxWidth:'none',zIndex:'2147483646',pointerEvents:'none',display:'none'}))
    host.style.setProperty(cssName(name),value,'important');
  const svg=doc.createElementNS(NS,'svg');
  svg.setAttribute('aria-hidden','true');svg.setAttribute('width','100%');svg.setAttribute('height','100%');
  svg.style.cssText='position:fixed;inset:0;width:100%;height:100%;pointer-events:none;overflow:hidden';
  const path=doc.createElementNS(NS,'path');
  for(const [name,value] of Object.entries({stroke:'#94a3b8','stroke-width':'3.5',
    'stroke-linecap':'round','stroke-linejoin':'round',fill:'none'}))path.setAttribute(name,value);
  const bubble=doc.createElementNS(NS,'rect');
  for(const [name,value] of Object.entries({width:'148',height:'27',rx:'8',fill:'#1d293d','fill-opacity':'0.92'}))
    bubble.setAttribute(name,value);
  const label=doc.createElementNS(NS,'text');
  for(const [name,value] of Object.entries({fill:'#fff','font-size':'12','font-family':'system-ui,sans-serif'}))
    label.setAttribute(name,value);
  svg.append(path);svg.append(bubble);svg.append(label);ui.content.append(svg);
  const alive=()=>!disposed&&allowed&&ui.active();
  function hide(){
    if(frame!==null&&typeof win.cancelAnimationFrame==='function')win.cancelAnimationFrame(frame);
    frame=null;host.style.setProperty('display','none','important');path.setAttribute('d','');
    label.textContent='';
  }
  function reset({clearGuard=true}={}){
    epoch++;session=null;if(clearGuard)releaseGuard=null;hide();
  }
  function render(){
    frame=null;
    if(!alive()||!session?.intent||!displayTrace)return hide();
    const s=session;
    host.style.setProperty('display','block','important');
    const stroke=s.stage==='recognized'?'#2586ef':s.stage==='invalid'?'#d97757':'#94a3b8';
    path.setAttribute('stroke',stroke);
    path.setAttribute('stroke-dasharray',s.stage==='dragging'?'5 4':'none');
    path.setAttribute('d',s.points.map(([x,y],i)=>(i?'L':'M')+x+' '+y).join(' '));
    label.textContent=s.stage==='recognized'?LABELS[s.selected]+' · 松开执行':
      s.stage==='invalid'?'手势无效 · 松开取消':'继续拖动';
    const w=Math.max(148,Math.min(win.innerWidth||800,10000));
    const h=Math.max(30,Math.min(win.innerHeight||600,10000));
    const x=Math.max(4,Math.min(s.lastX+14,w-152));
    const y=Math.max(4,Math.min(s.lastY+18,h-31));
    bubble.setAttribute('x',String(x));bubble.setAttribute('y',String(y));
    label.setAttribute('x',String(x+9));label.setAttribute('y',String(y+18));
  }
  function scheduleRender(){
    if(!displayTrace)return;
    if(typeof win.requestAnimationFrame!=='function')return render();
    if(frame===null)frame=win.requestAnimationFrame(render);
  }
  function execute(which){
    if(which==='left'&&win.history?.length>1)navigateBack();
    else if(which==='right')navigateForward(); // Forward history may be unavailable; browser no-ops.
    else if(which==='up')reloadPage();
    else if(which==='down')scrollBottom();
  }
  function finish(which,token){
    if(token!==epoch||!alive())return;
    let approval;
    try{approval=authorizeGesture();}catch{return;}
    if(approval===true){if(token===epoch&&alive())execute(which);return;}
    if(approval===false)return;
    Promise.resolve(approval).then(ok=>{
      if(ok===true&&token===epoch&&alive())execute(which);
    }).catch(()=>{});
  }
  ui.on(doc,'mousedown',event=>{
    if(event.button!==primaryButton(activeTrigger))return;
    reset(); // New physical press invalidates an old correlated menu guard.
    if(!alive()||event.isTrusted!==true||excluded(event,win,activeTrigger))return;
    session={x:event.clientX,y:event.clientY,lastX:event.clientX,lastY:event.clientY,
      target:event.target,button:event.button,minDx:0,maxDx:0,minDy:0,maxDy:0,maxX:0,maxY:0,
      points:[[event.clientX,event.clientY]],intent:false,invalid:false,stage:'pending',selected:null,
      candidate:null,peak:0,backtracked:false};
  },true);
  ui.on(doc,'mousemove',event=>{
    if(!session||session.stage==='canceled')return;
    if(!alive()||event.isTrusted!==true||(event.buttons&buttonMask(activeTrigger))===0)return reset();
    if(activeTrigger===GESTURE_TRIGGERS.ALT_LEFT&&!event.altKey)return reset();
    const {dx,dy,distance}=recordPoint(session,event.clientX,event.clientY);
    monitorReversal(session,dx,dy);
    if(!session.intent&&distance<GESTURE_LIMITS.intentPx)return;
    session.intent=true;
    session.invalid=session.invalid||reversed(session)||
      (session.maxX>GESTURE_LIMITS.maxCrossPx&&session.maxY>GESTURE_LIMITS.maxCrossPx);
    session.selected=session.invalid?null:direction(session,dx,dy);
    session.stage=session.invalid?'invalid':session.selected?'recognized':'dragging';
    scheduleRender();
  },true);
  ui.on(doc,'mouseup',event=>{
    if(!session||event.button!==session.button)return;
    const s=session;
    const trusted=event.isTrusted===true&&alive()&&
      (activeTrigger!==GESTURE_TRIGGERS.ALT_LEFT||event.altKey);
    if(trusted&&s.stage!=='canceled'){
      const {dx,dy}=recordPoint(s,event.clientX,event.clientY);
      monitorReversal(s,dx,dy);
      if(Math.hypot(dx,dy)>=GESTURE_LIMITS.intentPx)s.intent=true;
      s.invalid=s.invalid||reversed(s)||
        (s.maxX>GESTURE_LIMITS.maxCrossPx&&s.maxY>GESTURE_LIMITS.maxCrossPx);
      s.selected=s.invalid?null:direction(s,dx,dy);
    }
    const chosen=trusted&&s.stage!=='canceled'&&s.intent&&!s.invalid?s.selected:null;
    const suppress=trusted&&s.intent;
    reset();
    if(suppress){
      releaseGuard={button:event.button,target:event.target,x:event.clientX,y:event.clientY,
        at:Date.now(),kind:activeTrigger===GESTURE_TRIGGERS.RIGHT?'menu':'click'};
      event.preventDefault();
    }
    if(chosen)finish(chosen,epoch);
  },true);
  ui.on(doc,'contextmenu',event=>{
    if(event.isTrusted!==true||event.button!==2)return; // Keyboard menus remain untouched.
    if(activeTrigger!==GESTURE_TRIGGERS.RIGHT)return;
    if(session){
      if(session.intent){event.preventDefault();event.stopPropagation();return;}
      // Some platforms dispatch contextmenu before movement. Once committed
      // to the native menu, a USER_SCRIPT cannot dismiss it reliably.
      reset();return;
    }
    if(releaseGuard?.kind==='menu'&&sameRelease(event,releaseGuard)){
      event.preventDefault();event.stopPropagation();releaseGuard=null;
    }
  },true);
  ui.on(doc,'click',event=>{
    if(releaseGuard?.kind==='click'&&sameRelease(event,releaseGuard)){
      event.preventDefault();event.stopPropagation();releaseGuard=null;
    }
  },true);
  ui.on(doc,'keydown',event=>{
    if(event.key!=='Escape'||!session)return;
    const hadIntent=session.intent;
    if(hadIntent){
      session.stage='canceled';session.selected=null;epoch++;hide();event.preventDefault();
    }else reset();
  },true);
  ui.on(win,'blur',reset);
  ui.on(doc,'visibilitychange',()=>{if(doc.visibilityState==='hidden')reset();});
  ui.onDispose(()=>{disposed=true;reset();});
  return Object.freeze({
    isActive:alive,
    setEnabled(next){if(disposed)return;allowed=next===true;if(!allowed)reset();},
    setOptions(next={}){
      if(disposed)return;
      const requested=next.trigger===GESTURE_TRIGGERS.ALT_LEFT?GESTURE_TRIGGERS.ALT_LEFT:GESTURE_TRIGGERS.RIGHT;
      const visible=next.showTrace!==false;
      if(requested!==activeTrigger||visible!==displayTrace)reset();
      activeTrigger=requested;displayTrace=visible;
    }
  });
}

// Historical internal name retained for the original pilot consumer.
export const mountBackGesture=mountGestures;
