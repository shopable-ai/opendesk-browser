// Finite native event multiplexer for already approved installed background
// services. Callers are precompiled trusted code, never installable tool scripts.
// The one existing extension Service Worker owns all subscriptions; this helper
// neither dispatches RPC nor grants an app permission.
export function subscribeManagedSiteActivity(api,{
  alarmName,run,invalidate,onPermissionRemoved,onStorageChanged
}={}){
  if(typeof alarmName!=='string'||!alarmName||typeof run!=='function'||
     typeof invalidate!=='function')throw new TypeError('Trusted managed-site activity hooks required');
  const removers=[];
  const listen=(event,handler)=>{
    event?.addListener(handler);
    if(event?.removeListener)removers.push(()=>event.removeListener(handler));
  };
  const activity=()=>{invalidate();run();};
  listen(api.alarms?.onAlarm,alarm=>{if(alarm?.name===alarmName)run();});
  listen(api.tabs?.onActivated,activity);
  listen(api.tabs?.onUpdated,(_id,change)=>{if(change?.url||change?.status==='complete')activity();});
  listen(api.tabs?.onRemoved,activity);
  listen(api.windows?.onFocusChanged,activity);
  listen(api.idle?.onStateChanged,activity);
  listen(api.permissions?.onRemoved,removed=>onPermissionRemoved?.(removed));
  listen(api.permissions?.onAdded,activity);
  listen(api.runtime?.onStartup,()=>run({boot:true}));
  listen(api.storage?.onChanged,(changes,area)=>onStorageChanged?.(changes,area));
  run({boot:true});
  return ()=>{for(const remove of removers)remove();};
}
