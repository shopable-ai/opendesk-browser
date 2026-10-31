import {VIDEO_SPEED_GLOBAL_PROTOCOL} from './policy.js';

// Fixed isolated-world signaler only. All writes remain in the admitted SW.
export function initGlobalVideoSpeed({api=globalThis.chrome,doc=globalThis.document,
  win=globalThis.window}={}){
  if(!api?.runtime?.sendMessage||!doc||!win)return;
  let timer=null,closed=false,inflight=false,again=false;
  const signal=()=>{
    if(closed||doc.visibilityState!=='visible')return;
    if(inflight){again=true;return;}
    if(timer!==null)return;
    timer=win.setTimeout(async()=>{
      timer=null;if(closed||doc.visibilityState!=='visible')return;
      inflight=true;again=false;
      try{await api.runtime.sendMessage({protocol:VIDEO_SPEED_GLOBAL_PROTOCOL,operation:'page.apply'});}
      catch{/* No retry of unknown writes. A new media/user event may recheck. */}
      finally{inflight=false;if(again){again=false;signal();}}
    },100);
  };
  const media=event=>{if(event?.target?.tagName==='VIDEO'||event?.type==='visibilitychange')signal();};
  for(const name of ['play','loadedmetadata','emptied','visibilitychange'])doc.addEventListener(name,media,true);
  const observer=new win.MutationObserver(records=>{
    if(records.some(row=>[...row.addedNodes].some(node=>node.nodeType===1&&
      (node.tagName==='VIDEO'||node.querySelector?.('video')))))signal();
  });
  observer.observe(doc,{childList:true,subtree:true});
  const change=(changes,area)=>{
    if(area==='local'&&Object.keys(changes||{}).some(key=>key===VIDEO_SPEED_GLOBAL_PROTOCOL||
      key==='opendesk.sidebar-tools.installed.v1'||key==='opendesk.sidebar-tools.enabled.v1'||
      key==='opendesk.sidebar-tools.revocation-epochs.v1'||key==='opendesk.market.provenance.v1'))signal();
  };
  api.storage?.onChanged?.addListener(change);
  const recheck=message=>{if(message?.protocol===VIDEO_SPEED_GLOBAL_PROTOCOL&&message.operation==='recheck')signal();};
  api.runtime.onMessage?.addListener(recheck);
  win.addEventListener('pagehide',()=>{closed=true;again=false;if(timer!==null)win.clearTimeout(timer);timer=null;});
  win.addEventListener('pageshow',()=>{closed=false;signal();});
  signal();
  return {signal,dispose(){closed=true;observer.disconnect();if(timer!==null)win.clearTimeout(timer);
    for(const name of ['play','loadedmetadata','emptied','visibilitychange'])doc.removeEventListener(name,media,true);
    api.storage?.onChanged?.removeListener(change);api.runtime.onMessage?.removeListener(recheck);}};
}
