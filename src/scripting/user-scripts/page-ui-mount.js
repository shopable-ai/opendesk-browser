// Optional DOM placement for @opendesk/ui. No framework introspection, page globals or privileged APIs.
const error=(code,message)=>Object.assign(new Error(message),{code});
const INTERACTIVE='form,button,a,input,select,textarea,label,summary,[contenteditable],[role="button"]';
const POSITIONS=new Set(['before','after','append']);
const MODES=new Set(['auto','inline','anchored','floating']);

function uniqueTarget(doc,selector){
  let matches;
  try{matches=doc.querySelectorAll(selector);}catch{throw error('E_UI_TARGET','Invalid target selector');}
  if(matches.length>1)throw error('E_UI_TARGET_AMBIGUOUS','Target selector must match exactly one element');
  return matches[0]||null;
}
export function preparePageUIMount(doc,mount){
  if(mount===undefined)return {requested:'floating',strategy:'floating',selector:null,position:null,target:null,reason:null};
  if(!mount||typeof mount!=='object'||Array.isArray(mount)||
    typeof mount.selector!=='string'||!mount.selector.trim()||mount.selector.length>200||
    !POSITIONS.has(mount.position||'after')||!MODES.has(mount.mode||'auto'))
    throw error('E_UI_TARGET','Invalid mount options');
  const selector=mount.selector,position=mount.position||'after',requested=mount.mode||'auto';
  const target=uniqueTarget(doc,selector);
  if(target&&(target.ownerDocument!==doc||!target.isConnected))
    throw error('E_UI_TARGET','Target belongs to a different or disconnected document');
  if(target&&(target.matches?.('[data-opendesk-ui-owner]')||
    target.closest?.('[data-opendesk-ui-owner]')))
    throw error('E_UI_TARGET','Cannot attach to another OpenDesk UI instance');
  if(requested==='floating')return {selector,position,requested,strategy:'floating',target,reason:'explicit_floating'};
  if(!target)return {selector,position,requested,strategy:'floating',target:null,reason:'target_missing'};
  const parent=position==='append'?target:target.parentElement;
  const unsafe=position==='append'
    ? target.matches?.(INTERACTIVE)||target.closest?.('form,[contenteditable]')
    : parent?.closest?.(INTERACTIVE);
  if(!parent||unsafe)return {selector,position,requested,strategy:'anchored',target,reason:'interactive_boundary'};
  return {selector,position,requested,strategy:requested==='anchored'?'anchored':'inline',target,reason:null};
}

export function activatePageUIMount({doc,win,host,shadowRoot,content,prepared,onDispose,isAlive,destroy}){
  let {selector,position,target}=prepared;
  let strategy='unmounted',reason=prepared.reason,cleaned=false,restored=false;
  const changes=[];
  let stopWatching=()=>{};
  const note=(next,why)=>{
    if(strategy!==next){changes.push({strategy:next,reason:why||null});if(changes.length>4)changes.shift();}
    if(strategy!=='unmounted'&&next!==strategy)restored=true;
    strategy=next;reason=why||null;
  };
  const live=()=>isAlive()&&doc.documentElement?.isConnected&&doc.defaultView===win;
  function stop(){stopWatching();stopWatching=()=>{};}
  onDispose(()=>{cleaned=true;stop();});
  function putFloating(why){
    stop();
    Object.assign(host.style,{position:'fixed',display:'block',top:'16px',right:'16px',left:'auto',
      bottom:'auto',margin:'0',verticalAlign:'baseline',visibility:'visible'});
    (doc.body||doc.documentElement).appendChild(host);
    note('floating',why);
  }
  function retarget(){
    if(target?.isConnected)return true;
    try{target=selector?uniqueTarget(doc,selector):null;}
    catch{target=null;reason='ambiguous_target';}
    return !!target?.isConnected;
  }
  function align(){
    if(strategy!=='anchored'||!live())return;
    if(!retarget()){putFloating('target_disconnected');return;}
    let rect;
    try{rect=target.getBoundingClientRect?.();}catch{rect=null;}
    if(!rect||![rect.top,rect.right,rect.width,rect.height].every(Number.isFinite)||
      rect.width<=0||rect.height<=0){putFloating('anchor_geometry_unavailable');return;}
    const width=win.innerWidth||doc.documentElement.clientWidth||1024;
    const height=win.innerHeight||doc.documentElement.clientHeight||768;
    // Fit the real managed host in the viewport, not an assumed 48px button.
    const hostRect=host.getBoundingClientRect?.();
    const hostWidth=Number.isFinite(hostRect?.width)?Math.max(0,hostRect.width):0;
    const hostHeight=Number.isFinite(hostRect?.height)?Math.max(0,hostRect.height):0;
    const gap=8,remaining=Math.max(gap,width-gap-hostWidth);
    const right=rect.right+gap,left=rect.right-rect.width-gap-hostWidth;
    const x=right+hostWidth<=width-gap?right:left>=gap?left:
      Math.max(gap,Math.min(rect.right-rect.width,remaining));
    host.style.left=Math.round(Math.max(gap,Math.min(x,remaining)))+'px';
    host.style.top=Math.round(Math.max(gap,Math.min(rect.top,Math.max(gap,height-gap-hostHeight))))+'px';
  }
  function watch(){
    stop();
    if(typeof win.MutationObserver!=='function')return false;
    const observer=new win.MutationObserver(()=>{
      if(!live()){destroy();return;}
      if(strategy==='inline'){
        const stillPlaced=host.isConnected&&target?.isConnected&&
          (position==='append'?host.parentNode===target:host.parentNode===target.parentNode);
        if(!stillPlaced){putAnchored('inline_target_rerendered');return;}
      }else if(strategy==='anchored'){
        const previous=target;
        if(!retarget()){putFloating('target_disconnected');return;}
        if(target!==previous)watch();
        if(!host.isConnected){note('stopped','host_removed');destroy();return;}
        align();
      }
    });
    const seen=new Set();
    let node=target?.parentNode;
    // Watch only the target's closest parent boundaries, not the whole document subtree.
    for(let i=0;i<3&&node;i++,node=node.parentNode){
      if(!seen.has(node)){observer.observe(node,{childList:true});seen.add(node);}
    }
    if(strategy==='inline'&&position==='append'&&!seen.has(target))observer.observe(target,{childList:true});
    let frame=0;
    const schedule=()=>{
      if(frame||strategy!=='anchored')return;
      if(typeof win.requestAnimationFrame==='function')frame=win.requestAnimationFrame(()=>{frame=0;align();});
      else align();
    };
    if(strategy==='anchored'){
      win.addEventListener('scroll',schedule,true);
      win.addEventListener('resize',schedule);
    }
    const resize= strategy==='anchored'&&typeof win.ResizeObserver==='function'
      ?new win.ResizeObserver(schedule):null;
    resize?.observe(target);
    resize?.observe(host);
    stopWatching=()=>{
      observer.disconnect();resize?.disconnect();
      win.removeEventListener('scroll',schedule,true);win.removeEventListener('resize',schedule);
      if(frame&&typeof win.cancelAnimationFrame==='function')win.cancelAnimationFrame(frame);
    };
    return true;
  }
  function putAnchored(why){
    stop();
    if(!retarget()||typeof target.getBoundingClientRect!=='function'){
      putFloating(!target?'target_disconnected':'anchor_geometry_unavailable');return;
    }
    Object.assign(host.style,{position:'fixed',display:'block',top:'16px',right:'auto',left:'8px',
      bottom:'auto',margin:'0',verticalAlign:'baseline',visibility:'visible'});
    (doc.body||doc.documentElement).appendChild(host);
    note('anchored',why);
    align();
    if(strategy==='anchored')watch();
  }
  function putInline(){
    if(!target?.isConnected){putAnchored('target_disconnected');return;}
    Object.assign(host.style,{position:'relative',display:'inline-block',top:'auto',right:'auto',left:'auto',
      bottom:'auto',margin:position==='after'?'0 0 0 8px':position==='before'?'0 8px 0 0':'4px',
      verticalAlign:'middle',visibility:'visible'});
    try{
      if(position==='append')target.appendChild(host);
      else target.parentNode.insertBefore(host,position==='before'?target:target.nextSibling);
    }catch{putAnchored('inline_insertion_failed');return;}
    note('inline',null);
    if(!watch())putAnchored('observer_unavailable');
  }
  if(prepared.strategy==='inline')putInline();
  else if(prepared.strategy==='anchored')putAnchored(prepared.reason||'explicit_anchored');
  else putFloating(prepared.reason);

  let lastChecks=null;
  function verifyMount(){
    const checks={hostConnected:!!host.isConnected,shadowReady:!!shadowRoot&&host.shadowRoot===shadowRoot,
      targetConnected:selector?!!target?.isConnected:null,visible:null,cssReady:null,imagesReady:null};
    if(typeof win.getComputedStyle==='function'&&typeof host.getBoundingClientRect==='function'){
      try{
        const computed=win.getComputedStyle(host),rect=host.getBoundingClientRect();
        checks.visible=computed.display!=='none'&&computed.visibility!=='hidden'&&
          computed.opacity!=='0'&&rect.width>0&&rect.height>0;
      }catch{checks.visible=null;}
    }
    const styles=shadowRoot.querySelectorAll?.('style');
    if(styles?.length){
      try{checks.cssReady=[...styles].every(style=>style.sheet!==null&&style.sheet!==undefined);}
      catch{checks.cssReady=null;}
    }
    const images=shadowRoot.querySelectorAll?.('img');
    if(images?.length){
      checks.imagesReady=[...images].every(img=>img.complete&&img.naturalWidth>0);
    }
    lastChecks=checks;
    return getMountDiagnostics();
  }
  function getMountDiagnostics(){
    const checks=lastChecks?{...lastChecks}:null;
    return {selector,requested:prepared.requested,strategy,reason,restored,cleaned,
      checks,transitions:changes.map(x=>({...x})),
      suggestion:reason==='interactive_boundary'?'Use an adjacent non-interactive container or anchored mode'
        :reason==='target_disconnected'||reason==='target_missing'?'Choose a stable unique selector'
        :reason==='anchor_geometry_unavailable'?'Use floating mode':'none'};
  }
  function fallbackMount(why='host_not_visible'){
    if(!live()){note('stopped','document_gone');destroy();return;}
    if(strategy==='inline')putAnchored(why);
    else if(strategy==='anchored')putFloating(why);
    else {note('stopped',why);destroy();}
  }
  function stopMount(why){note('stopped',why);destroy();}
  onDispose(()=>{lastChecks=null;});
  return {verifyMount,getMountDiagnostics,fallbackMount,stopMount};
}
