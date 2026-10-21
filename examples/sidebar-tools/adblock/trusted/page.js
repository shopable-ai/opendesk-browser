import {SIDEBAR_TOOL_STORE} from '../../../../src/ui/sidebar-tools/package.js';
import {SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE}
  from '../../../../src/ui/sidebar-tools/lifecycle.js';
import {ADBLOCK_STORE,ADBLOCK_PAGE_PROTOCOL,adblockHost} from './policy.js';
import {ADBLOCK_COSMETIC_HOSTS,createAdblockCosmeticController} from './cosmetic.js';
import {ADBLOCK_COSMETIC_STORE,validCosmeticSelector} from './cosmetic-policy.js';
import {createAdblockElementPicker} from './picker.js';

const SLOT='__opendeskAdblockCosmeticsV1';
const keys=[SIDEBAR_TOOL_STORE,SIDEBAR_TOOL_ENABLE_STORE,
  TOOL_REVOCATION_EPOCHS_STORE,ADBLOCK_STORE,ADBLOCK_COSMETIC_STORE];

export function initAdblockCosmetics({api=globalThis.chrome,doc=globalThis.document,win=globalThis.window}={}){
  if(!doc||!win||win.top!==win||!adblockHost(win.location?.href,{asUrl:true})||
     !api?.runtime?.sendMessage||!api.storage?.onChanged)return null;
  if(win[SLOT])return win[SLOT];
  let runtimeId;
  try{runtimeId=api.runtime.id;}catch{return null;}
  if(!runtimeId)return null;
  const controller=createAdblockCosmeticController({document:doc,location:win.location});
  const deadlines=new Set();
  let disposed=false,paused=false,generation=0;
  let latest={enabled:false},pendingSelector=null;
  const temporarilyVisible=new Set();
  // Locator reveals a hidden match briefly without mutating stored rules or
  // a user's explicit temporary-visibility choice.
  let transientLocate=null;
  let previewMarker=null,previewTimer=null;
  const clearPreview=()=>{previewMarker?.remove();previewMarker=null;
    if(previewTimer!==null){win.clearTimeout(previewTimer);previewTimer=null;}
    if(transientLocate!==null){transientLocate=null;apply();}};
  function preview(selector,{reveal=false}={}){
    clearPreview();
    if(reveal&&!temporarilyVisible.has(selector)){
      transientLocate=selector;apply();
    }
    const match=doc.querySelector(selector);
    if(!match||!doc.documentElement){clearPreview();return;}
    match.scrollIntoView?.({behavior:'smooth',block:'center',inline:'nearest'});
    const rect=match.getBoundingClientRect?.();
    if(!rect||rect.width<1||rect.height<1){clearPreview();return;}
    previewMarker=doc.createElement('div');
    previewMarker.setAttribute('data-opendesk-adblock-picker-ui','');
    previewMarker.style.cssText='position:fixed!important;pointer-events:none!important;z-index:2147483646!important;border:2px solid #3675ef!important;box-sizing:border-box!important;border-radius:5px!important;background:#4a80ed18!important';
    doc.documentElement.append(previewMarker);
    Object.assign(previewMarker.style,{left:rect.left+'px',top:rect.top+'px',
      width:rect.width+'px',height:rect.height+'px'});
    previewTimer=win.setTimeout(clearPreview,2500);
  }
  const current=()=>{try{return !disposed&&api.runtime.id===runtimeId;}catch{return false;}};
  const apply=()=>controller.apply({...latest,pendingSelector,
    rules:(latest.rules||[]).filter(rule=>
      !temporarilyVisible.has(rule.selector)&&rule.selector!==transientLocate)});
  const picker=createAdblockElementPicker({api,doc,win,
    onPending:selector=>{pendingSelector=selector;apply();},
    onSaved:selector=>{
      temporarilyVisible.delete(selector);
      latest={...latest,rules:[...(latest.rules||[]).filter(v=>v.selector!==selector),{selector}]};
      apply();
    },
    onUndone:selector=>{
      latest={...latest,rules:(latest.rules||[]).filter(v=>v.selector!==selector)};
      apply();
    },
    onRefresh:()=>void refresh()});
  const clear=()=>{generation++;latest={enabled:false};pendingSelector=null;
    temporarilyVisible.clear();clearPreview();apply();picker.cancel();};
  async function refresh(){
    if(!current()){dispose();return;}
    if(paused)return;
    const token=++generation,href=win.location.href;
    let expired=false;
    const timeout=win.setTimeout(()=>{
      expired=true;deadlines.delete(timeout);
      if(token===generation){latest={enabled:false};pendingSelector=null;apply();}
    },3000);
    deadlines.add(timeout);
    try{
      const result=await api.runtime.sendMessage({protocol:ADBLOCK_PAGE_PROTOCOL});
      if(!current()){dispose();return;}
      if(expired||paused||token!==generation||href!==win.location.href)return;
      latest=result?.ok===true&&result.data?.version===1?result.data:{enabled:false};
      const known=new Set((latest.rules||[]).map(rule=>rule.selector));
      for(const selector of temporarilyVisible)if(!known.has(selector))temporarilyVisible.delete(selector);
      apply();
    }catch{
      if(token===generation){latest={enabled:false};pendingSelector=null;apply();}
      if(!current())dispose();
    }finally{
      win.clearTimeout(timeout);deadlines.delete(timeout);
    }
  }
  const invalidate=()=>{clear();void refresh();};
  const storageChanged=(changes,area)=>{
    if(area!=='local')return;
    if(keys.some(key=>key!==ADBLOCK_COSMETIC_STORE&&Object.hasOwn(changes,key))){
      invalidate();return;
    }
    // A confirmed cosmetic write should not erase the temporary CSS while
    // the click's acknowledgement and readback are still in flight.
    if(Object.hasOwn(changes,ADBLOCK_COSMETIC_STORE))void refresh();
  };
  const message=(value,sender,reply)=>{
    if(value?.protocol!==ADBLOCK_PAGE_PROTOCOL||sender?.id!==runtimeId||sender.tab)
      return false;
    if(['inspect-rules','check-selector','locate-selector','display-rule'].includes(value.type)){
      const selector=value.selector;
      const selectors=value.type==='inspect-rules'?value.selectors:[selector];
      if(!Array.isArray(selectors)||selectors.length>35||
         selectors.some(item=>!validCosmeticSelector(item))||
         value.type==='display-rule'&&typeof value.visible!=='boolean'){
        reply?.({ok:false,host:adblockHost(win.location?.href,{asUrl:true})});return false;
      }
      const counts=selectors.map(item=>{
        let matches=0;
        try{matches=doc.querySelectorAll(item).length;}catch{return null;}
        return {selector:item,matches,visible:temporarilyVisible.has(item)};
      });
      if(counts.some(x=>x===null)){reply?.({ok:false});return false;}
      if(value.type==='display-rule'){
        if(value.visible)temporarilyVisible.add(selector);
        else temporarilyVisible.delete(selector);
        apply();
        if(value.visible&&counts[0].matches)preview(selector);
      }else if(value.type==='check-selector'&&counts[0].matches)preview(selector);
      else if(value.type==='locate-selector'&&counts[0].matches)
        preview(selector,{reveal:true});
      reply?.({ok:true,host:adblockHost(win.location?.href,{asUrl:true}),
        inspection:counts.map(item=>({...item,visible:temporarilyVisible.has(item.selector)}))});
      return false;
    }
    if(value.type==='invalidate')invalidate();
    if(value.type==='cancel-pick')picker.cancel('切换标签页后已退出选择模式');
    if(value.type==='start-pick'&&value.host===adblockHost(win.location?.href,{asUrl:true})){
      const ok=latest.enabled===true&&picker.begin();
      reply?.({ok,host:value.host});
    }
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
    picker.dispose();clearPreview();temporarilyVisible.clear();controller.dispose();
    if(win[SLOT]===instance)delete win[SLOT];
  }
  // Existing fixed-site rules re-check frequently; other sites get local
  // storage invalidation and a slower fail-closed backstop.
  const timer=win.setInterval(()=>{void refresh();},
    ADBLOCK_COSMETIC_HOSTS.includes(adblockHost(win.location?.href,{asUrl:true}))?5000:30000);
  const instance={refresh,dispose};win[SLOT]=instance;
  api.storage.onChanged.addListener(storageChanged);
  api.runtime.onMessage?.addListener(message);
  win.addEventListener('pagehide',pagehide);win.addEventListener('pageshow',pageshow);
  doc.addEventListener('DOMContentLoaded',invalidate,{once:true});
  void refresh();
  return instance;
}
