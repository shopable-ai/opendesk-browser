import {SEGMENT_LIMITS,ARROWS,DIRECTION_NAMES,createGestureTrack,updateGestureTrack,gestureOutcome,normalizeGestureMappings} from './segments.js';

// Only same-document, trusted mouse input. No Chrome/Tab APIs or synthetic menus.
export const GESTURE_LIMITS=Object.freeze({
  ...SEGMENT_LIMITS,jitterPx:8,menuMatchPx:16,menuGuardMs:450
});
export const GESTURE_TRIGGERS=Object.freeze({RIGHT:'right',ALT_LEFT:'alt-left'});
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
  enabled=true,trigger=GESTURE_TRIGGERS.RIGHT,showTrace=true,gestureMappings={},authorizeGesture=()=>true,
  navigateBack=()=>win.history.back(),navigateForward=()=>win.history.forward(),
  reloadPage=()=>win.location.reload(),scrollBottom=()=>win.scrollTo(0,pageBottom(doc))}={}){
  if(!ui?.on||!ui?.onDispose||!ui?.host||!ui?.content||!doc?.createElementNS||!win||
    typeof authorizeGesture!=='function')throw Error('E_GESTURE_CONTEXT');
  let disposed=false,allowed=enabled===true;
  let activeTrigger=trigger===GESTURE_TRIGGERS.ALT_LEFT?trigger:GESTURE_TRIGGERS.RIGHT;
  let displayTrace=showTrace!==false,mappings=normalizeGestureMappings(gestureMappings);
  let session=null,releaseGuard=null,epoch=0,frame=null;
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
  // Each recognized segment gets ONE independent arrow in a rounded square.
  // Never draw joined or double-ended arrow glyphs.
  const badges=Array.from({length:2},()=>{
    const group=doc.createElementNS(NS,'g');group.setAttribute('visibility','hidden');
    const square=doc.createElementNS(NS,'rect');
    for(const [name,value] of Object.entries({width:'36',height:'36',rx:'9',fill:'#2563eb',
      'fill-opacity':'0.96'}))square.setAttribute(name,value);
    const glyph=doc.createElementNS(NS,'text');
    for(const [name,value] of Object.entries({x:'18',y:'25',fill:'#fff',
      'font-size':'23','font-weight':'650','font-family':'system-ui,sans-serif',
      'text-anchor':'middle'}))glyph.setAttribute(name,value);
    group.append(square);group.append(glyph);return {group,glyph};
  });
  svg.append(path);
  for(const badge of badges)svg.append(badge.group);
  svg.append(bubble);svg.append(label);ui.content.append(svg);
  const alive=()=>!disposed&&allowed&&ui.active();
  function hide(){
    if(frame!==null&&typeof win.cancelAnimationFrame==='function')win.cancelAnimationFrame(frame);
    frame=null;host.style.setProperty('display','none','important');path.setAttribute('d','');
    label.textContent='';for(const badge of badges)badge.group.setAttribute('visibility','hidden');
  }
  function reset({clearGuard=true}={}){
    epoch++;session=null;if(clearGuard)releaseGuard=null;hide();
  }
  function render(){
    frame=null;
    if(!alive()||!session?.intent||!displayTrace)return hide();
    const s=session,outcome=gestureOutcome(s,mappings);
    host.style.setProperty('display','block','important');
    const stroke=s.invalid?'#d97757':outcome.state==='unmapped'?'#d97757':
      s.segments.length?'#2586ef':'#94a3b8';
    path.setAttribute('stroke',stroke);
    path.setAttribute('stroke-dasharray',s.segments.length?'none':'5 4');
    path.setAttribute('d',s.points.map(([x,y],i)=>(i?'L':'M')+x+' '+y).join(' '));
    const w=Math.max(44,win.innerWidth||800),h=Math.max(44,win.innerHeight||600);
    for(const [index,badge] of badges.entries()){
      const segment=s.segments[index];
      if(!segment||s.invalid){badge.group.setAttribute('visibility','hidden');continue;}
      const x=Math.max(4,Math.min(segment.x+12,w-40));
      const y=Math.max(4,Math.min(segment.y-44,h-40));
      badge.group.setAttribute('transform','translate('+x+' '+y+')');
      badge.glyph.textContent=ARROWS[segment.dir];
      badge.group.setAttribute('visibility','visible');
    }
    const names=s.segments.map(segment=>DIRECTION_NAMES[segment.dir]).join(' / ');
    label.textContent=s.invalid?'手势无效 · 松开取消':
      outcome.state==='incomplete'?'转向未完成 · 松开取消':
      outcome.state==='unmapped'?names+' · 未配置动作':
      s.segments.length===2?names+' · 执行'+
        ({left:'后退',right:'前进',up:'刷新',down:'到底'}[outcome.action]||'') :
      s.segments.length===1?'已识别'+names+' · 松开执行':'继续拖动';
    const width=Math.min(Math.max(150,label.textContent.length*12+20),Math.max(40,w-8));
    bubble.setAttribute('width',String(width));
    const x=Math.max(4,Math.min(s.lastX+18,w-width-4));
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
    session=createGestureTrack(event.clientX,event.clientY);
    session.target=event.target;session.button=event.button;
  },true);
  ui.on(doc,'mousemove',event=>{
    if(!session||session.stage==='canceled')return;
    if(!alive()||event.isTrusted!==true||(event.buttons&buttonMask(activeTrigger))===0)return reset();
    if(activeTrigger===GESTURE_TRIGGERS.ALT_LEFT&&!event.altKey)return reset();
    updateGestureTrack(session,event.clientX,event.clientY);
    if(session.intent)scheduleRender();
  },true);
  ui.on(doc,'mouseup',event=>{
    if(!session||event.button!==session.button)return;
    const s=session;
    const trusted=event.isTrusted===true&&alive()&&
      (activeTrigger!==GESTURE_TRIGGERS.ALT_LEFT||event.altKey);
    if(trusted&&s.stage!=='canceled')
      updateGestureTrack(s,event.clientX,event.clientY);
    const selected=gestureOutcome(s,mappings);
    const chosen=trusted&&s.stage!=='canceled'?selected.action:null;
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
    if(event.key!=='Escape')return;
    if(!session){epoch++;return;}
    const hadIntent=session.intent;
    if(hadIntent){
      session.stage='canceled';epoch++;hide();event.preventDefault();
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
      const nextMappings=normalizeGestureMappings(next.gestureMappings??mappings);
      if(requested!==activeTrigger||visible!==displayTrace||
        JSON.stringify(nextMappings)!==JSON.stringify(mappings))reset();
      activeTrigger=requested;displayTrace=visible;mappings=nextMappings;
    }
  });
}

// Historical internal name retained for the original pilot consumer.
export const mountBackGesture=mountGestures;
