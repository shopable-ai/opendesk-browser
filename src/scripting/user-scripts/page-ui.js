import {preparePageUIMount,activatePageUIMount} from './page-ui-mount.js';
// Opt-in USER_SCRIPT helper, bundled only for projects importing @opendesk/ui.
// Not a privileged extension API, DOM security sandbox or Task stop mechanism.
export const PAGE_UI_VERSION='1';
const OWNER='opendesk.page-ui.v1',CLOSE='opendesk:page-ui:dispose:v1';
const BASE=[
':host{--od-bg:#fff;--od-fg:#18212e;--od-muted:#566273;--od-line:#d6dde5;--od-primary:#315fd5;',
'color:var(--od-fg);font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color-scheme:light}',
':host *,:host *::before,:host *::after{box-sizing:border-box}',
'.od-card{background:var(--od-bg);color:var(--od-fg);border:1px solid var(--od-line);border-radius:14px;',
'box-shadow:0 10px 36px #10203729;padding:16px;max-width:100%}',
'.od-field{display:grid;gap:5px;margin:12px 0}.od-label{display:block;color:var(--od-muted);font-weight:600}',
'.od-input{display:block;width:100%;max-width:100%;padding:9px 11px;min-height:38px;border:1px solid var(--od-line);',
'border-radius:9px;background:#fff;color:var(--od-fg);font:inherit}',
'.od-button{padding:8px 12px;min-height:36px;border:1px solid var(--od-line);border-radius:9px;',
'background:#fff;color:var(--od-fg);font-family:inherit;font-size:13px;font-weight:600;cursor:pointer}',
'.od-button--primary{background:var(--od-primary);border-color:var(--od-primary);color:#fff}',
'.od-button:disabled{opacity:.5;cursor:not-allowed}',
'.od-input:focus-visible,.od-button:focus-visible{outline:2px solid #2669e8;outline-offset:2px}',
'.od-status{color:var(--od-muted);font-size:13px}.od-status[data-state="success"]{color:#116a42}',
'.od-status[data-state="error"]{color:#aa3030}.od-status[data-state="busy"]{color:#925b06}',
'.od-result{white-space:pre-wrap;overflow-wrap:anywhere;padding:10px;border-radius:8px;',
'background:#f1f4f9;font:13px/1.5 ui-monospace,monospace}',
'.od-overlay{position:relative;z-index:1;pointer-events:none}.od-overlay>*{pointer-events:auto}',
'[hidden]{display:none!important}'
].join('');
const err=(code,message)=>Object.assign(new Error(message),{code});
function check(ok,code,message){if(!ok)throw err(code,message);}
export function createPageUI({id,baseStyles=true,css='',assets={},mount}={}){
  check(typeof id==='string'&&/^[A-Za-z0-9][\w.-]{0,79}$/.test(id),'E_UI_ID','Invalid UI id');
  check(typeof baseStyles==='boolean'&&typeof css==='string'&&css.length<=49152,'E_UI_STYLE','Invalid CSS');
  check(assets&&typeof assets==='object'&&!Array.isArray(assets),'E_UI_RESOURCE','Invalid assets');
  const doc=globalThis.document,win=doc?.defaultView;
  check(doc?.createElement&&doc.documentElement?.isConnected&&win,'E_UI_DOCUMENT','Live Page document required');
  // Preflight must finish before removing any same-id prior instance.
  const prepared=preparePageUIMount(doc,mount);
  // DOM events work across named USER_SCRIPT worlds. A same-id mount retires
  // previous managed callbacks, not just previous visible HTML.
  for(const node of doc.querySelectorAll('[data-opendesk-ui-owner]')){
    if(node.getAttribute('data-opendesk-ui-owner')!==OWNER||node.getAttribute('data-od-id')!==id)continue;
    node.dispatchEvent(new Event(CLOSE));node.remove();
  }
  const host=doc.createElement('div');
  host.setAttribute('data-opendesk-ui-owner',OWNER);host.setAttribute('data-od-id',id);
  Object.assign(host.style,{all:'initial',position:'fixed',top:'16px',right:'16px',zIndex:'2147483646',
    maxWidth:'calc(100vw - 24px)',fontSize:'16px',direction:doc.dir==='rtl'?'rtl':'ltr'});
  const shadowRoot=host.attachShadow({mode:'open'});
  const content=doc.createElement('div'),overlay=doc.createElement('div');
  overlay.className='od-overlay';const cleanups=new Set();let alive=true;
  const active=()=>alive&&host.isConnected&&doc.documentElement.isConnected&&doc.defaultView===win;
  function destroy(){
    if(!alive)return;alive=false;
    for(const cleanup of [...cleanups].reverse()){
      cleanups.delete(cleanup);
      try{cleanup();}catch(error){console.error('OpenDesk UI cleanup',error);}
    }
    host.remove();
  }
  function onDispose(callback){
    check(alive&&typeof callback==='function','E_UI_CLEANUP','Invalid cleanup callback');
    cleanups.add(callback);return ()=>cleanups.delete(callback);
  }
  function addStyle(text){
    check(alive&&typeof text==='string'&&text.length<=49152,'E_UI_STYLE','Invalid CSS');
    const node=doc.createElement('style');node.textContent=text;
    shadowRoot.insertBefore(node,content);onDispose(()=>node.remove());return node;
  }
  function on(target,type,callback,options){
    check(alive&&target?.addEventListener&&typeof type==='string'&&type&&typeof callback==='function',
      'E_UI_LISTENER','Invalid event listener');
    const wrapped=event=>{
      if(!active()){destroy();return;}
      try{const result=callback(event);result?.catch?.(error=>console.error('OpenDesk UI event',error));}
      catch(error){console.error('OpenDesk UI event',error);}
    };
    target.addEventListener(type,wrapped,options);
    const cleanup=()=>target.removeEventListener(type,wrapped,options);
    onDispose(cleanup);return ()=>{if(cleanups.delete(cleanup))cleanup();};
  }
  function setTimeoutManaged(callback,ms){
    check(alive&&typeof callback==='function'&&Number.isFinite(ms)&&ms>=0,'E_UI_TIMER','Invalid timeout');
    const token=win.setTimeout(()=>{cleanups.delete(cleanup);if(active())callback();else destroy();},ms);
    const cleanup=()=>win.clearTimeout(token);onDispose(cleanup);return token;
  }
  function setIntervalManaged(callback,ms){
    check(alive&&typeof callback==='function'&&Number.isFinite(ms)&&ms>=1,'E_UI_TIMER','Invalid interval');
    const token=win.setInterval(()=>{if(active())callback();else destroy();},ms);
    onDispose(()=>win.clearInterval(token));return token;
  }
  function observe(target,callback,options={childList:true}){
    check(alive&&target&&typeof callback==='function'&&typeof win.MutationObserver==='function',
      'E_UI_OBSERVER','MutationObserver unavailable');
    const observer=new win.MutationObserver(records=>{if(active())callback(records);else destroy();});
    observer.observe(target,options);onDispose(()=>observer.disconnect());return observer;
  }
  function objectURL(blob){
    check(alive&&typeof win.URL?.createObjectURL==='function','E_UI_RESOURCE','Object URL unavailable');
    const url=win.URL.createObjectURL(blob);onDispose(()=>win.URL.revokeObjectURL(url));return url;
  }
  function getAsset(path){
    check(typeof path==='string'&&Object.prototype.hasOwnProperty.call(assets,path),
      'E_UI_RESOURCE','Undeclared asset: '+path);
    const value=assets[path];
    check(value&&['css','json','image'].includes(value.kind),'E_UI_RESOURCE','Malformed asset');
    if(value.kind==='image'){
      check(typeof value.url==='string'&&value.url.startsWith('data:image/'),'E_UI_RESOURCE','Invalid image URL');
      return value.url;
    }
    check(typeof value.text==='string','E_UI_RESOURCE','Malformed text asset');
    return value.kind==='json'?JSON.parse(value.text):value.text;
  }
  shadowRoot.append(content,overlay);
  host.addEventListener(CLOSE,destroy);onDispose(()=>host.removeEventListener(CLOSE,destroy));
  win.addEventListener('pagehide',destroy);onDispose(()=>win.removeEventListener('pagehide',destroy));
  if(baseStyles)addStyle(BASE);if(css)addStyle(css);
  let placement;
  try{
    placement=activatePageUIMount({doc,win,host,shadowRoot,content,prepared,onDispose,
      isAlive:()=>alive,destroy});
  }catch(error){destroy();throw error;}
  // One post-render CSS check for every instance; placement fallback is opt-in.
  {
    const timer=win.setTimeout(()=>{
      if(!alive||doc.defaultView!==win||!doc.documentElement.isConnected){destroy();return;}
      const report=placement.verifyMount();
      if(report.checks?.cssReady===false){placement.stopMount('css_blocked');return;}
      if(mount!==undefined&&(!report.checks?.hostConnected ||
        (report.checks?.visible===false&&content.children.length>0)))
        placement.fallbackMount('host_not_visible');
    },180);
    onDispose(()=>win.clearTimeout(timer));
  }
  return Object.freeze({id,host,shadowRoot,content,overlay,active,destroy,close:destroy,onDispose,
    addStyle,getAsset,on,setTimeout:setTimeoutManaged,setInterval:setIntervalManaged,observe,objectURL,
    verifyMount:placement.verifyMount,getMountDiagnostics:placement.getMountDiagnostics});
}
