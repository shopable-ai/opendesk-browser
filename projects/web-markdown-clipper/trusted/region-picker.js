// One-shot, user-initiated DOM region picker. Runs only in the trusted page
// content-script world; never exposes a DOM node to the sidebar tool sandbox.
export const REGION_PICK_TIMEOUT_MS=90000;
const BLOCKED='input,textarea,select,option,button,[role="button"],[role="textbox"],[contenteditable]:not([contenteditable="false"]),nav,aside,header,footer,form,dialog,[inert],[aria-hidden="true"],[role="navigation"],[role="banner"],[role="toolbar"]';
const STREAMING='[aria-busy="true"],[data-streaming="true"],[data-state="streaming"]';
const TURN='article,[role="article"],[data-message-id],[data-turn-id],[data-message-author-role]';
const semantic=el=>Boolean(el.matches?.(TURN));
function topLevelTurns(container){
  const descendants=[...container.querySelectorAll?.(TURN)||[]];
  // A single message can have both an <article> and nested data markers.
  // Count only outermost descendants to avoid incorrectly treating one reply
  // as multiple conversation turns.
  return descendants.filter(el=>{
    for(let parent=el.parentElement;parent&&parent!==container;parent=parent.parentElement){
      if(semantic(parent))return false;
    }
    return true;
  }).length;
}
const chars=el=>String(el.textContent||'').trim().length;

export function regionCandidates(start,doc,win){
  if(!start||start.nodeType!==1||start.getRootNode()!==doc||
    start.closest?.(BLOCKED)||start.closest?.('[data-opendesk-clip-root]'))return [];
  const result=[];
  // A code fence is atomic; don't pick syntax-highlighted tokens inside it.
  let node=start.closest?.('pre')||start;
  while(node&&node!==doc.body&&node!==doc.documentElement&&result.length<32){
    if(node.nodeType!==1||node.matches?.(BLOCKED))break;
    const rect=node.getBoundingClientRect?.();
    if(!rect||rect.width<=0||rect.height<=0){node=node.parentElement;continue;}
    const length=chars(node);
    if((length>0||node.matches?.('img'))&&length<=2000000){
      // A conversation wrapper with multiple turns is never a default region.
      const turns=topLevelTurns(node);
      const ownTurn=semantic(node);
      const multipleTurns=turns>1||(!ownTurn&&turns>0&&node.matches?.('main,[role="main"]'));
      // Never use the full application shell as a region, even on a single-
      // message page; content is picked from children instead.
      const shell=node.matches?.('main,[role="main"]')&&
        (node.querySelector?.('nav,aside,form,[role="navigation"],[role="textbox"]')||length>80000);
      const editable=node.querySelector?.('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]');
      // Stop before conversation/app wrappers or editors. Keep the real hit
      // first; short inline text and headings are valid regions too.
      if(multipleTurns||shell||editable)break;
      const style=win.getComputedStyle?.(node);
      if(!node.hidden&&style?.visibility!=='hidden'&&style?.display!=='none')result.push(node);
    }
    node=node.parentElement;
  }
  return result;
}

export function preferredRegionIndex(candidates){
  return 0; // DOM hit first; parents are opt-in with ArrowUp.
}

export function beginRegionPick({doc=globalThis.document,win=globalThis.window,extract,timeoutMs=REGION_PICK_TIMEOUT_MS}={}){
  if(!doc?.documentElement||!doc.body||typeof extract!=='function')
    throw new Error('当前网页不能进行区域点选');
  const startUrl=win.location?.href;
  let finished=false,timer=null,monitor=null,candidates=[],index=0,lastTarget=null,lastMoveAt=0,appendMode=false;
  let resolvePromise,rejectPromise;
  const promise=new Promise((resolve,reject)=>{resolvePromise=resolve;rejectPromise=reject;});
  const overlay=doc.createElement('div');
  overlay.setAttribute('data-opendesk-clip-root','');
  overlay.setAttribute('aria-hidden','true');
  overlay.style.cssText='all:initial!important;position:fixed!important;inset:auto!important;display:none!important;z-index:2147483647!important;pointer-events:none!important;border:2px solid #2563eb!important;background:rgba(37,99,235,.07)!important;box-sizing:border-box!important;border-radius:6px!important;';
  const plus=doc.createElement('span');
  plus.textContent='+';
  plus.style.cssText='all:initial!important;display:none!important;position:absolute!important;right:0!important;top:0!important;width:15px!important;height:15px!important;text-align:center!important;font: bold 13px/15px system-ui,sans-serif!important;background:#0284c7!important;color:white!important;border-radius:3px!important;pointer-events:none!important;';
  overlay.append(plus);
  const setAppend=value=>{
    if(appendMode===Boolean(value))return;
    appendMode=Boolean(value);
    overlay.style.setProperty('border-color',appendMode?'#0ea5e9':'#2563eb','important');
    overlay.style.setProperty('background',appendMode?'rgba(14,165,233,.09)':'rgba(37,99,235,.07)','important');
    plus.style.setProperty('display',appendMode?'block':'none','important');
  };
  const wantsAppend=event=>event.ctrlKey===true||event.metaKey===true;
  doc.documentElement.append(overlay);
  const listeners=[];
  const listen=(target,name,fn)=>{target.addEventListener(name,fn,true);listeners.push([target,name,fn]);};
  const cleanup=()=>{
    if(timer!==null)win.clearTimeout(timer);
    if(monitor!==null)win.clearInterval(monitor);
    for(const [target,name,fn] of listeners)target.removeEventListener(name,fn,true);
    overlay.remove();candidates=[];lastTarget=null;
  };
  const settle=(error,result)=>{
    if(finished)return;
    finished=true;cleanup();
    if(error)rejectPromise(error instanceof Error?error:new Error(String(error)));
    else resolvePromise(result);
  };
  const cancel=(message='已取消区域点选')=>settle(new Error(message));
  const currentDocument=()=>{
    if(finished)return false;
    if(win.location?.href!==startUrl||doc.visibilityState==='hidden'){
      cancel('网页已变化或离开，区域点选取消');return false;
    }
    return true;
  };
  const highlight=()=>{
    const node=candidates[index];
    if(!node?.isConnected){overlay.style.setProperty('display','none','important');return;}
    const r=node.getBoundingClientRect();
    const left=Math.max(0,r.left),top=Math.max(0,r.top);
    const right=Math.min(win.innerWidth,r.right),bottom=Math.min(win.innerHeight,r.bottom);
    if(right<=left||bottom<=top){overlay.style.setProperty('display','none','important');return;}
    overlay.style.setProperty('display','block','important');
    overlay.style.setProperty('left',left+'px','important');
    overlay.style.setProperty('top',top+'px','important');
    overlay.style.setProperty('width',(right-left)+'px','important');
    overlay.style.setProperty('height',(bottom-top)+'px','important');

  };
  const update=(target)=>{
    if(!target||target===overlay||overlay.contains(target))return;
    if(target===lastTarget&&candidates[index]?.isConnected){highlight();return;}
    const next=regionCandidates(target,doc,win);
    lastTarget=target;
    candidates=next;
    index=preferredRegionIndex(next);
    highlight();
  };
  const onMove=event=>{
    if(event.isTrusted===false||!currentDocument())return;
    setAppend(wantsAppend(event));
    const now=Date.now();
    if(event.target!==lastTarget||now-lastMoveAt>60){lastMoveAt=now;update(event.target);}
  };
  const consume=event=>{
    if(finished||event.isTrusted===false)return;
    event.preventDefault?.();event.stopImmediatePropagation?.();event.stopPropagation?.();
  };
  const commit=(target,append=false,keepHighlighted=false)=>{
    if(!currentDocument())return;
    if(!keepHighlighted&&(target!==lastTarget||!candidates[index]?.isConnected))update(target);
    const node=candidates[index];
    if(!node||!node.isConnected)return;
    // Conversion is synchronous at click time: the result is a DOM snapshot,
    // not a later re-read that could include new streamed tokens.
    const streaming=Boolean(node.closest?.(STREAMING)||node.querySelector?.(STREAMING));
    try{settle(null,{markdown:extract(node),streaming,loadedOnly:true,append:append===true});}
    catch(error){settle(error);}
  };
  const onClick=event=>{
    if(finished||event.isTrusted===false||event.button!==0)return;
    consume(event);
    if(!currentDocument())return;
    setAppend(wantsAppend(event));
    commit(event.target,wantsAppend(event));
  };
  const onKey=event=>{
    if(finished||event.isTrusted===false)return;
    // Consume picker controls before document validation can settle and clean
    // the session, so a stale Enter/Space cannot activate the focused page link.
    if(['Escape','Enter',' '].includes(event.key)||
      ((event.key==='ArrowUp'||event.key==='ArrowDown')&&candidates.length))consume(event);
    if(!currentDocument())return;
    setAppend(wantsAppend(event)||event.key==='Control'||event.key==='Meta');
    if(event.key==='Escape'){consume(event);cancel();return;}
    if(event.key==='Enter'||event.key===' '){
      // Commit the highlighted range, including ↑/↓ adjustments. A stale
      // focus (for example the launch button or an editor) must not replace it.
      const focus=doc.activeElement;
      consume(event);
      if(candidates[index]?.isConnected)commit(candidates[index],wantsAppend(event),true);
      else if(focus&&focus!==doc.body&&focus!==doc.documentElement)commit(focus,wantsAppend(event));
      return;
    }
    if((event.key==='ArrowUp'||event.key==='ArrowDown')&&candidates.length){
      consume(event);
      index=Math.max(0,Math.min(candidates.length-1,index+(event.key==='ArrowUp'?1:-1)));
      highlight();
    }
  };
  const onHide=()=>cancel('网页已离开，区域点选取消');
  for(const name of ['pointerdown','mousedown','pointerup','mouseup','auxclick','contextmenu'])
    listen(doc,name,consume);
  listen(doc,'click',onClick);
  listen(doc,'pointermove',onMove);
  listen(doc,'mousemove',onMove);
  listen(doc,'keydown',onKey);
  listen(doc,'keyup',event=>{if(event.isTrusted!==false&&currentDocument())setAppend(wantsAppend(event));});
  listen(win,'blur',()=>setAppend(false));
  listen(win,'scroll',highlight);
  listen(win,'resize',highlight);
  listen(win,'pagehide',onHide);
  listen(win,'popstate',currentDocument);
  listen(win,'hashchange',currentDocument);
  listen(doc,'visibilitychange',currentDocument);
  // pushState/replaceState emit no navigation event. Keep the one-shot
  // session bounded without patching the website's History API.
  monitor=win.setInterval(currentDocument,250);
  timer=win.setTimeout(()=>cancel('区域点选超时，请重新开始'),timeoutMs);
  return Object.freeze({promise,cancel});
}
