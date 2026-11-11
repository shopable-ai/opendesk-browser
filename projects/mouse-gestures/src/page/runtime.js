import {mountGestures} from './gesture.js';

const POLICY_KEY='preferences';
const POLICY_POLL_MS=1200;

// App-owned policy. Bridge and storage calls are both bound to the installed
// parent tool and current document by the existing Page Authority.
export function createMouseGestureRuntime({ui,bridge=globalThis.OpenDeskAppPage,
  doc=globalThis.document,win=doc.defaultView,mount=mountGestures}={}){
  if(!bridge?.readContext||!bridge?.storage?.get||!bridge?.onRequest)
    throw Error('E_MOUSE_GESTURES_BRIDGE');
  let disposed=false,timer=0,version=0,unsubscribe=null;
  const gesture=mount({ui,doc,win,enabled:false,authorizeGesture:()=>readPolicy()});
  async function readPolicy(){
    const requested=++version;
    try{
      await bridge.readContext();
      const saved=await bridge.storage.get({key:POLICY_KEY,withEtag:true});
      if(disposed||requested!==version||!ui.active())return false;
      // No stored preferences means a newly installed, authorized app is ON.
      // Only an explicit user setting "enabled:false" disables gestures.
      // Failed reads or malformed data still fail closed in the catch branch.
      if(typeof saved?.etag!=='string'||!saved.etag||
        (saved.value!=null&&(typeof saved.value!=='object'||Array.isArray(saved.value))))
        throw Error('E_GESTURE_POLICY');
      const prefs=saved.value||{};
      if(prefs.enabled!==undefined&&typeof prefs.enabled!=='boolean')
        throw Error('E_GESTURE_POLICY_ENABLED');
      const enabled=prefs.enabled!==false;
      gesture.setOptions?.({
        trigger:prefs.trigger==='alt-left'?'alt-left':'right',
        showTrace:prefs.showTrace!==false
      });
      gesture.setEnabled(enabled);
      return enabled;
    }catch(error){
      if(!disposed){gesture.setEnabled(false);ui.destroy();}
      throw error;
    }
  }
  const poll=async()=>{
    try{await readPolicy();}
    catch{return;} // Authority/storage failure has already disposed the module.
    if(!disposed)timer=win.setTimeout(()=>{timer=0;void poll();},POLICY_POLL_MS);
  };
  const dispose=()=>{
    if(disposed)return;
    disposed=true;version++;
    if(timer)win.clearTimeout(timer);
    timer=0;
    unsubscribe?.();unsubscribe=null;
    gesture.setEnabled(false);
  };
  ui.onDispose(dispose);
  ui.on(win,'pagehide',()=>ui.destroy());
  const ready=(async()=>{
    try{
      unsubscribe=bridge.onRequest(async ({operation})=>{
        if(operation!=='gesture.refresh')throw Error('E_GESTURE_OPERATION');
        return {enabled:await readPolicy()};
      });
      if(typeof unsubscribe!=='function')unsubscribe=null;
      await readPolicy();
      if(!disposed)timer=win.setTimeout(()=>{timer=0;void poll();},POLICY_POLL_MS);
      return {state:disposed?'disposed':'ready',enabled:gesture.isActive()};
    }catch(error){ui.destroy();throw error;}
  })();
  return Object.freeze({ready,readPolicy,dispose,isActive:gesture.isActive});
}
