import {SIDEBAR_TOOL_STORE} from '../../../../src/ui/sidebar-tools/package.js';
import {SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE}
  from '../../../../src/ui/sidebar-tools/lifecycle.js';
import {ADBLOCK_STORE,ADBLOCK_PAGE_PROTOCOL,adblockHost} from './policy.js';
import {ADBLOCK_COSMETIC_HOSTS,createAdblockCosmeticController} from './cosmetic.js';

const SLOT='__opendeskAdblockCosmeticsV1';
const keys=[SIDEBAR_TOOL_STORE,SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE,ADBLOCK_STORE];

export function initAdblockCosmetics({api=globalThis.chrome,doc=globalThis.document,win=globalThis.window}={}){
  if(!doc||!win||win.top!==win||!ADBLOCK_COSMETIC_HOSTS.includes(adblockHost(win.location?.href,{asUrl:true}))||
     !api?.runtime?.sendMessage||!api.storage?.onChanged)return null;
  if(win[SLOT])return win[SLOT];
  let runtimeId;
  try{runtimeId=api.runtime.id;}catch{return null;}
  if(!runtimeId)return null;
  const controller=createAdblockCosmeticController({document:doc,location:win.location});
  const deadlines=new Set();
  let disposed=false,paused=false,generation=0;
  const current=()=>{try{return !disposed&&api.runtime.id===runtimeId;}catch{return false;}};
  const clear=()=>{generation++;controller.apply({enabled:false});};
  async function refresh(){
    if(!current()){dispose();return;}
    if(paused)return;
    const token=++generation,href=win.location.href;
    let expired=false;
    const timeout=win.setTimeout(()=>{
      expired=true;deadlines.delete(timeout);
      if(token===generation)controller.apply({enabled:false});
    },3000);
    deadlines.add(timeout);
    try{
      const result=await api.runtime.sendMessage({protocol:ADBLOCK_PAGE_PROTOCOL});
      if(!current()){dispose();return;}
      if(expired||paused||token!==generation||href!==win.location.href)return;
      controller.apply(result?.ok===true&&result.data?.version===1?result.data:{enabled:false});
    }catch{
      if(token===generation)controller.apply({enabled:false});
      if(!current())dispose();
    }finally{
      win.clearTimeout(timeout);deadlines.delete(timeout);
    }
  }
  const invalidate=()=>{clear();void refresh();};
  const storageChanged=(changes,area)=>{
    if(area==='local'&&keys.some(key=>Object.hasOwn(changes,key)))invalidate();
  };
  const message=(value,sender)=>{
    if(value?.protocol===ADBLOCK_PAGE_PROTOCOL&&value.type==='invalidate'&&
       sender?.id===runtimeId&&!sender.tab)invalidate();
    return false;
  };
  const pagehide=event=>{paused=true;clear();if(!event.persisted)dispose();};
  const pageshow=event=>{if(event.persisted&&!disposed){paused=false;invalidate();}};
  function dispose(){
    if(disposed)return;
    disposed=true;clear();win.clearInterval(timer);
    for(const id of deadlines)win.clearTimeout(id);deadlines.clear();
    api.storage.onChanged.removeListener(storageChanged);
    api.runtime.onMessage?.removeListener(message);
    win.removeEventListener('pagehide',pagehide);win.removeEventListener('pageshow',pageshow);
    doc.removeEventListener('DOMContentLoaded',invalidate);
    controller.dispose();
    if(win[SLOT]===instance)delete win[SLOT];
  }
  // A revoked origin can prevent a push from reaching an existing document.
  // Recheck the same authority periodically; failed reads always restore CSS.
  const timer=win.setInterval(()=>{void refresh();},5000);
  const instance={refresh,dispose};win[SLOT]=instance;
  api.storage.onChanged.addListener(storageChanged);
  api.runtime.onMessage?.addListener(message);
  win.addEventListener('pagehide',pagehide);win.addEventListener('pageshow',pageshow);
  doc.addEventListener('DOMContentLoaded',invalidate,{once:true});
  void refresh();
  return instance;
}
