// Shared DOM primitive for Page UI and fixed ISOLATED-world adapters. Keep this
// function self-contained: Chrome serializes it, never arbitrary caller source.
export function showPageToast({id='opendesk',message,variant='info',duration=2000,position='top'}={},action='show'){
  const fail=()=>{throw Object.assign(new Error('Invalid page toast options'),{code:'E_UI_TOAST'});};
  if(typeof id!=='string'||!/^[A-Za-z0-9][\w.-]{0,79}$/.test(id)||!['show','dismiss'].includes(action))fail();
  const doc=globalThis.document,win=doc?.defaultView;
  const key='__opendeskPageToastV1';
  let state=doc?.[key];
  if(action==='dismiss'){
    if(state?.id===id)state.close();
    return {shown:false};
  }
  if(!doc?.documentElement?.isConnected||!win)
    throw Object.assign(new Error('Live Page document required'),{code:'E_UI_DOCUMENT'});
  const positions={
    'top-left':['16px auto auto 16px','none'],top:['16px auto auto 50%','translateX(-50%)'],
    'top-right':['16px 16px auto auto','none'],left:['50% auto auto 16px','translateY(-50%)'],
    center:['50% auto auto 50%','translate(-50%, -50%)'],right:['50% 16px auto auto','translateY(-50%)'],
    'bottom-left':['auto auto 16px 16px','none'],bottom:['auto auto 16px 50%','translateX(-50%)'],
    'bottom-right':['auto 16px 16px auto','none']
  };
  if(typeof message!=='string'||!message.trim()||message.length>240||
    !['info','success','warning','error'].includes(variant)||
    typeof position!=='string'||!Object.hasOwn(positions,position)||
    !Number.isFinite(duration)||duration<1000||duration>10000)fail();
  if(state&&!state.host.isConnected){state.close();state=null;}
  if(!state){
    const host=doc.createElement('div');
    host.setAttribute('data-opendesk-page-toast','1');
    host.setAttribute('popover','manual');
    // The top layer keeps feedback visible above webpage fullscreen players.
    // Pointer transparency and no autofocus preserve player input and focus.
    // Page author selectors can reach the host, including !important resets.
    // Limit the defensive priority to our own host; never reset the website.
    for(const [property,value] of Object.entries({all:'initial',position:'fixed',display:'block',
      margin:'0',padding:'0',border:'0',background:'transparent',
      width:'max-content','max-width':'min(480px, calc(100vw - 32px))',height:'auto',overflow:'visible',
      'z-index':'2147483647','pointer-events':'none',direction:doc.dir==='rtl'?'rtl':'ltr',
      'unicode-bidi':'normal','writing-mode':'horizontal-tb',zoom:'1'}))host.style.setProperty(property,value,'important');
    const shadow=host.attachShadow({mode:'closed'}),style=doc.createElement('style');
    // Map the canonical OpenDesk semantic palette locally; never inject the
    // trusted workbench stylesheet or inherit website custom properties.
    style.textContent=':host::before,:host::after{content:none!important;display:none!important}'+
      ':host::backdrop{all:initial!important;background:transparent!important;pointer-events:none!important}'+
      '.toast{all:initial;--od-paper:#fff;--od-ink:#1b2c49;--od-line:#e1e8f1;--od-positive:#117a5d;--od-warning:#80510d;--od-negative:#ae3d4b;'+
      'box-sizing:border-box;display:flex;gap:8px;align-items:center;padding:12px 16px;border:1px solid var(--od-line);border-radius:12px;'+
      'background:var(--od-paper);color:var(--od-ink);box-shadow:0 4px 16px #0003;font:600 14px/1.5 system-ui,-apple-system,"PingFang SC",sans-serif;overflow-wrap:anywhere;pointer-events:none}'+
      '.toast>span{all:initial;display:block;min-width:0;font:inherit;color:inherit;overflow-wrap:anywhere;direction:inherit;pointer-events:none}'+
      '.icon{flex:none}.toast[data-variant=success] .icon{color:var(--od-positive)}.toast[data-variant=warning] .icon{color:var(--od-warning)}.toast[data-variant=error] .icon{color:var(--od-negative)}'+
      '@media(prefers-color-scheme:dark){.toast{--od-paper:#151c28;--od-ink:#e9eef7;--od-line:#374457;--od-positive:#a1f3cc;--od-warning:#ffd08a;--od-negative:#ff9ea6}}';
    const notice=doc.createElement('div'),icon=doc.createElement('span'),text=doc.createElement('span');
    notice.className='toast';icon.className='icon';icon.setAttribute('aria-hidden','true');
    notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');notice.setAttribute('aria-atomic','true');
    notice.append(icon,text);shadow.append(style,notice);
    state={host,notice,icon,text,id,timer:null};
    const place=()=>{
      const fullscreen=doc.fullscreenElement;
      const parent=fullscreen&&!['VIDEO','AUDIO','IFRAME','IMG','CANVAS'].includes(fullscreen.tagName)?fullscreen:doc.body||doc.documentElement;
      if(host.parentNode!==parent)parent.appendChild(host);
      try{if(host.hidePopover)host.hidePopover();host.showPopover?.();}catch{/* Fixed-position fallback. */}
    };
    state.close=()=>{
      win.clearTimeout(state.timer);host.remove();
      doc.removeEventListener('fullscreenchange',place);win.removeEventListener('pagehide',state.close);
      if(doc[key]===state)delete doc[key];
    };
    state.place=place;doc[key]=state;
    doc.addEventListener('fullscreenchange',place);win.addEventListener('pagehide',state.close);
  }
  win.clearTimeout(state.timer);state.id=id;
  state.host.style.setProperty('inset',positions[position][0],'important');
  state.host.style.setProperty('transform',positions[position][1],'important');
  state.notice.setAttribute('data-variant',variant);
  state.icon.textContent={info:'ℹ',success:'✓',warning:'⚠',error:'!'}[variant];
  state.text.textContent=message;state.place();
  state.timer=win.setTimeout(state.close,duration);
  return {shown:true};
}
