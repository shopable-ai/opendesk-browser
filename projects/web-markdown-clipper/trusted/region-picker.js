// One-shot, user-initiated DOM region picker. Runs only in the trusted page
// content-script world; never exposes a DOM node to the sidebar tool sandbox.
export const REGION_PICK_TIMEOUT_MS=90000;
const BLOCKED='input,textarea,select,option,button,[role="button"],[role="textbox"],[contenteditable]:not([contenteditable="false"]),nav,aside,header,footer,form,dialog,[inert],[aria-hidden="true"],[role="navigation"],[role="banner"],[role="toolbar"]';
const STRUCTURAL='h1,h2,h3,h4,h5,h6,p,pre,ul,ol,table,blockquote,li';
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
  let node=start;
  while(node&&node!==doc.body&&node!==doc.documentElement&&result.length<14){
    if(node.nodeType!==1||node.matches?.(BLOCKED))break;
    const rect=node.getBoundingClientRect?.();
    if(!rect||rect.width<50||rect.height<10){node=node.parentElement;continue;}
    const length=chars(node);
    if(length>=16&&length<=2000000){
      // A conversation wrapper with multiple turns is never a default region.
      const turns=topLevelTurns(node);
      const ownTurn=semantic(node);
      const multipleTurns=turns>1||(!ownTurn&&turns>0&&node.matches?.('main,[role="main"]'));
      // Never use the full application shell as a region, even on a single-
      // message page; content is picked from children instead.
      const shell=node.matches?.('main,[role="main"]')&&
        (node.querySelector?.('nav,aside,form,[role="navigation"],[role="textbox"]')||length>80000);
      const editable=node.querySelector?.('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]');
      const hasBlocks=Boolean(node.querySelector?.(STRUCTURAL));
      if(!multipleTurns&&!shell&&!editable&&(hasBlocks||ownTurn||node.matches?.(STRUCTURAL))){
        // A long reply commonly jumps from a short paragraph directly to its
        // containing 50-screen <div>; don't stop at the paragraph. The first
        // multi-turn wrapper, edit surface or outer shell remains excluded.
        result.push(node);previous=length;
      }
    }
    node=node.parentElement;
  }
  return result;
}

export function preferredRegionIndex(candidates){
  const turn=candidates.findIndex(semantic);
  if(turn>=0)return turn;
  // The outermost bounded content wrapper, not just a single text leaf.
  return Math.max(0,candidates.length-1);
}

export function beginRegionPick({doc=globalThis.document,win=globalThis.window,extract,timeoutMs=REGION_PICK_TIMEOUT_MS}={}){
  if(!doc?.documentElement||!doc.body||typeof extract!=='function')
    throw new Error('当前网页不能进行区域点选');
  let finished=false,timer=null,candidates=[],index=0,lastTarget=null,lastMoveAt=0;
  let resolvePromise,rejectPromise;
  const promise=new Promise((resolve,reject)=>{resolvePromise=resolve;rejectPromise=reject;});
  const overlay=doc.createElement('div');
  overlay.setAttribute('data-opendesk-clip-root','');
  overlay.setAttribute('aria-hidden','true');
  overlay.style.cssText='all:initial!important;position:fixed!important;inset:auto!important;display:none!important;z-index:2147483647!important;pointer-events:none!important;border:2px solid #2563eb!important;background:rgba(37,99,235,.07)!important;box-sizing:border-box!important;border-radius:6px!important;';
  const label=doc.createElement('div');
  label.style.cssText='all:initial!important;position:absolute!important;left:0!important;top:0!important;transform:translateY(-100%)!important;white-space:nowrap!important;max-width:90vw!important;overflow:hidden!important;background:#1d4ed8!important;color:white!important;padding:4px 8px!important;border-radius:5px!important;font:12px/1.35 system-ui,sans-serif!important;box-shadow:0 1px 5px #0003!important;pointer-events:none!important;';
  label.textContent='点击选中 · ↑扩大 ↓缩小 · Esc取消';
  overlay.append(label);
  doc.documentElement.append(overlay);
  const listeners=[];
  const listen=(target,name,fn)=>{target.addEventListener(name,fn,true);listeners.push([target,name,fn]);};
  const cleanup=()=>{
    if(timer!==null)win.clearTimeout(timer);
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
  const highlight=()=>{
    const node=candidates[index];
    if(!node?.isConnected){overlay.style.setProperty('display','none','important');return;}
    const r=node.getBoundingClientRect();
    const left=Math.max(0,Math.min(win.innerWidth-2,r.left));
    const top=Math.max(0,Math.min(win.innerHeight-2,r.top));
    const right=Math.max(left+2,Math.min(win.innerWidth,r.right));
    const bottom=Math.max(top+2,Math.min(win.innerHeight,r.bottom));
    if(right-left<2||bottom-top<2){overlay.style.setProperty('display','none','important');return;}
    overlay.style.setProperty('display','block','important');
    overlay.style.setProperty('left',left+'px','important');
    overlay.style.setProperty('top',top+'px','important');
    overlay.style.setProperty('width',(right-left)+'px','important');
    overlay.style.setProperty('height',(bottom-top)+'px','important');
    label.style.setProperty('top',top<24?'0px':'0px','important');
    label.style.setProperty('transform',top<24?'none':'translateY(-100%)','important');
    label.textContent=(index+1)+'/'+candidates.length+' · 点击整块剪藏 · ↑扩大 ↓缩小 · Esc取消';
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
    if(finished||event.isTrusted===false)return;
    const now=Date.now();
    if(event.target!==lastTarget||now-lastMoveAt>60){lastMoveAt=now;update(event.target);}
  };
  const consume=event=>{
    if(finished||event.isTrusted===false)return;
    event.preventDefault?.();event.stopImmediatePropagation?.();event.stopPropagation?.();
  };
  const onClick=event=>{
    if(finished||event.isTrusted===false||event.button!==0)return;
    consume(event);
    if(!candidates[index]||!candidates[index].contains(event.target))update(event.target);
    const node=candidates[index];
    if(!node||!node.isConnected)return;
    // Conversion is synchronous at click time: the result is a DOM snapshot,
    // not a later re-read that could include new streamed tokens.
    const streaming=Boolean(node.matches?.('[aria-busy="true"],[data-streaming="true"],[data-state="streaming"]')||
      node.querySelector?.('[aria-busy="true"],[data-streaming="true"],[data-state="streaming"]'));
    try{settle(null,{markdown:extract(node),streaming,loadedOnly:true});}
    catch(error){settle(error);}
  };
  const onKey=event=>{
    if(finished||event.isTrusted===false)return;
    if(event.key==='Escape'){consume(event);cancel();return;}
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
  listen(win,'scroll',highlight);
  listen(win,'resize',highlight);
  listen(win,'pagehide',onHide);
  timer=win.setTimeout(()=>cancel('区域点选超时，请重新开始'),timeoutMs);
  return Object.freeze({promise,cancel});
}
