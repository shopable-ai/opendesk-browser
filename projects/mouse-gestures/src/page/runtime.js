import {mountGestures} from './gesture.js';

const POLICY_KEY='preferences';
const POLICY_POLL_MS=1200;

// App-owned policy. Each storage read already checks the installed parent,
// current document and live Page Authority before returning its value.
export function createMouseGestureRuntime({ui,bridge=globalThis.OpenDeskAppPage,
  doc=globalThis.document,win=doc.defaultView,mount=mountGestures}={}){
  if(!bridge?.storage?.get||!bridge?.onRequest)
    throw Error('E_MOUSE_GESTURES_BRIDGE');
  let disposed=false,timer=0,version=0,unsubscribe=null,latestRead=null,activePolicyReads=0;
  const gesture=mount({ui,doc,win,enabled:false,authorizeGesture:()=>readPolicy()});
  function readPolicy(){
    if(disposed||!ui.active())return Promise.resolve(false);
    const requested=++version;
    activePolicyReads++;
    latestRead=loadPolicy(requested);
    return latestRead;
  }
  async function loadPolicy(requested){
    try{
      // readContext would repeat the same authority round trip and load unused
      // locale/catalog/data. Never replace this fresh read with a cached grant.
      const saved=await bridge.storage.get({key:POLICY_KEY,withEtag:true});
      if(disposed||!ui.active())return false;
      // A newer authenticated read decides policy; supersession is not denial.
      if(requested!==version)return latestRead;
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
        menuPolicy:'native-first', // Legacy gesture-first must preserve ordinary menus too.
        showTrace:prefs.showTrace!==false,
        gestureMappings:prefs.gestureMappings||{}
      });
      gesture.setEnabled(enabled);
      return enabled;
    }catch(error){
      if(!disposed){gesture.setEnabled(false);ui.destroy();}
      throw error;
    }finally{
      activePolicyReads--;
    }
  }
  const poll=async()=>{
    if(disposed)return;
    // A background refresh must not supersede a pending gesture's fresh read
    // and make it wait for another round trip. Explicit actions/refreshes still
    // start their own read, so a poll's older ON snapshot cannot authorize them.
    try{if(activePolicyReads===0)await readPolicy();}
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
