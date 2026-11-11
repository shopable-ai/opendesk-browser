import {mountFreeCopy} from './unlock.js';

export const PREFERENCES_KEY='preferences';
const POLICY_POLL_MS=1200;

export function originFromUrl(href) {
  const url=new URL(href);
  if (!['http:','https:'].includes(url.protocol)||url.username||url.password)
    throw Error('E_FREE_COPY_ORIGIN');
  return url.origin;
}
export function normalizeFreeCopySettings(value) {
  if(value===null||value===undefined)return {enabled:true,disabledOrigins:[]};
  if(typeof value!=='object'||Array.isArray(value)||
    (value.enabled!==undefined&&typeof value.enabled!=='boolean')||
    (value.disabledOrigins!==undefined&&(!Array.isArray(value.disabledOrigins)||
      value.disabledOrigins.length>64||value.disabledOrigins.some(origin=>{
        if(typeof origin!=='string')return true;
        try{return originFromUrl(origin)!==origin;}catch{return true;}
      }))))throw Error('E_FREE_COPY_SETTINGS');
  return {enabled:value.enabled!==false,disabledOrigins:value.disabledOrigins||[]};
}
export function effectiveFreeCopy(value,href) {
  const settings=normalizeFreeCopySettings(value);
  return settings.enabled&&!settings.disabledOrigins.includes(originFromUrl(href));
}

export function createFreeCopyRuntime({ui,bridge=globalThis.OpenDeskAppPage,
  doc=globalThis.document,win=doc.defaultView,mount=mountFreeCopy}={}) {
  if (!bridge?.readContext||!bridge?.storage?.get||!bridge?.onRequest)
    throw Error('E_FREE_COPY_BRIDGE');
  let disposed=false,timer=0,version=0,unsubscribe=null;
  const engine=mount({ui,doc,win,enabled:false});
  async function readPolicy() {
    const turn=++version;
    try {
      await bridge.readContext();
      const saved=await bridge.storage.get({key:PREFERENCES_KEY,withEtag:true});
      const active=effectiveFreeCopy(saved?.value,win.location.href);
      if(disposed||turn!==version||!ui.active())return false;
      engine.setEnabled(active);
      return active;
    } catch(error) {
      if(!disposed){engine.setEnabled(false);ui.destroy();}
      throw error;
    }
  }
  const poll=async()=>{
    try{await readPolicy();}catch{return;}
    if(!disposed)timer=win.setTimeout(()=>{timer=0;void poll();},POLICY_POLL_MS);
  };
  function dispose() {
    if(disposed)return;
    disposed=true;version++;
    if(timer)win.clearTimeout(timer);
    timer=0;unsubscribe?.();unsubscribe=null;engine.setEnabled(false);
  }
  ui.onDispose(dispose);
  ui.on(win,'pagehide',()=>ui.destroy());
  const ready=(async()=>{
    try {
      unsubscribe=bridge.onRequest(async({operation})=>{
        if(operation!=='copy.refresh')throw Error('E_FREE_COPY_OPERATION');
        return {enabled:await readPolicy()};
      });
      if(typeof unsubscribe!=='function')unsubscribe=null;
      const active=await readPolicy();
      if(!disposed)timer=win.setTimeout(()=>{timer=0;void poll();},POLICY_POLL_MS);
      return {state:disposed?'disposed':'ready',enabled:active};
    }catch(error){ui.destroy();throw error;}
  })();
  return Object.freeze({ready,readPolicy,dispose,isActive:engine.isActive});
}
