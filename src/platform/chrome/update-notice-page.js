// Serialized by chrome.scripting.executeScript in the fixed, trusted Worker.
// No page script, tool iframe, dynamic HTML, or remote release text is executed.
export function showTrustedUpdateToast(payload){
  try{
    if(!payload||typeof payload.token!=='string'||typeof payload.message!=='string'||
       payload.message.length>140||typeof payload.origin!=='string'||
       location.origin!==payload.origin||window!==window.top||
       document.visibilityState!=='visible'||document.fullscreenElement||
       !document.body||!globalThis.chrome?.runtime?.sendMessage)return false;
    const selected=window.getSelection?.();
    if(selected&&!selected.isCollapsed)return false;
    const active=document.activeElement;
    if(active&&(active.matches?.('input,textarea,select,[role="textbox"]')||
       active.isContentEditable||active.closest?.('[contenteditable="true"],[role="textbox"]')))return false;
    if(document.querySelector('[aria-modal="true"],dialog[open]'))return false;
    // Avoid covering a native page control at the chosen corner.
    const atCorner=document.elementFromPoint(24,Math.max(4,innerHeight-24));
    if(atCorner?.closest?.('button,a,input,textarea,select,[role="button"],[contenteditable]'))
      return false;
    if(document.getElementById('opendesk-trusted-update-toast-root'))return false;
    const host=document.createElement('div');
    host.id='opendesk-trusted-update-toast-root';
    host.setAttribute('data-opendesk-presentation','update-toast');
    host.style.cssText='all:initial;position:fixed;bottom:16px;left:16px;z-index:2147483000;width:min(344px,calc(100vw - 32px));pointer-events:none';
    const shadow=host.attachShadow({mode:'closed'});
    const style=document.createElement('style');
    style.textContent='*{box-sizing:border-box}.notice{font:14px/1.5 system-ui,-apple-system,sans-serif;color:#202b39;background:#fff;border:1px solid #cbd5e1;border-radius:12px;box-shadow:0 8px 32px #0f172a33;padding:12px 14px;pointer-events:auto}.line{display:flex;align-items:flex-start;gap:12px}.text{flex:1;min-width:0;font-weight:600;overflow-wrap:anywhere}.close{border:0;background:transparent;color:#475569;cursor:pointer;font-size:20px;padding:0 3px;line-height:1}.actions{display:flex;gap:8px;margin-top:10px}.actions button{font:inherit;border-radius:7px;padding:6px 10px;cursor:pointer;border:1px solid #cbd5e1;background:#fff;color:#0f172a}.actions button:first-child{background:#1d4ed8;color:#fff;border-color:#1d4ed8}button:focus-visible{outline:2px solid #2563eb;outline-offset:2px}@media(prefers-reduced-motion:no-preference){.notice{animation:enter .15s ease-out}@keyframes enter{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}}';
    const panel=document.createElement('section');
    panel.className='notice';panel.setAttribute('role','status');panel.setAttribute('aria-label','OpenDesk 更新通知');
    const line=document.createElement('div');line.className='line';
    const message=document.createElement('span');message.className='text';message.textContent=payload.message;
    const close=document.createElement('button');close.className='close';close.type='button';
    close.textContent='×';close.setAttribute('aria-label','关闭本版本更新提醒');
    line.append(message,close);
    const actions=document.createElement('div');actions.className='actions';
    const view=document.createElement('button');view.type='button';view.textContent='查看更新';
    const snooze=document.createElement('button');snooze.type='button';snooze.textContent='稍后';
    actions.append(view,snooze);panel.append(line,actions);shadow.append(style,panel);
    // Shadow DOM retargets events, but composed clicks would otherwise reach
    // the site's global handlers. Keep update-button input isolated without
    // blocking its own click listeners or changing the page's focus/selection.
    for(const type of ['click','pointerdown','pointerup','keydown','keyup'])
      shadow.addEventListener(type,event=>event.stopPropagation());
    let removed=false,timer=null,entered=false;
    const protocol='opendesk.update-notice.v1';
    const remove=()=>{
      if(removed)return;removed=true;
      if(timer!==null)clearTimeout(timer);
      chrome.runtime.onMessage.removeListener(onHostMessage);
      document.removeEventListener('visibilitychange',onVisibility);
      host.remove();
    };
    const signal=action=>{
      if(removed)return;
      remove();
      try{void chrome.runtime.sendMessage({protocol,kind:'page-action',token:payload.token,action})
        .catch?.(()=>{});}catch{/* A lost message cannot install a package. */}
    };
    const onHostMessage=message=>{
      if(message?.protocol===protocol&&message.kind==='hide'&&message.token===payload.token)
        remove();
    };
    const onVisibility=()=>{if(document.visibilityState!=='visible')signal('timeout');};
    const schedule=()=>{
      if(timer!==null)clearTimeout(timer);
      timer=setTimeout(()=>{timer=null;signal('timeout');},12000);
    };
    close.addEventListener('click',()=>signal('close'));
    view.addEventListener('click',()=>signal('view'));
    snooze.addEventListener('click',()=>signal('snooze'));
    panel.addEventListener('pointerenter',()=>{entered=true;if(timer!==null)clearTimeout(timer);timer=null;});
    panel.addEventListener('pointerleave',()=>{entered=false;if(!panel.contains(shadow.activeElement))schedule();});
    panel.addEventListener('focusin',()=>{if(timer!==null)clearTimeout(timer);timer=null;});
    panel.addEventListener('focusout',()=>{if(!entered)setTimeout(()=>{
      if(!removed&&!panel.contains(shadow.activeElement))schedule();
    },0);});
    panel.addEventListener('keydown',event=>{
      if(event.key==='Escape'){event.stopPropagation();event.preventDefault();signal('close');}
    });
    document.body.append(host);
    chrome.runtime.onMessage.addListener(onHostMessage);
    document.addEventListener('visibilitychange',onVisibility);
    // ACK only after the actual DOM node is connected and visible.
    Promise.resolve(chrome.runtime.sendMessage({protocol,kind:'page-visible',token:payload.token}))
      .then(reply=>{if(!reply?.ok)remove();else if(!removed)schedule();},remove);
    return true;
  }catch{return false;}
}
