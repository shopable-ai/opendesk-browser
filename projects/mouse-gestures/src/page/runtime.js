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
      const enabled=saved?.value?.enabled===true;
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
