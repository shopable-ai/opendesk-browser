// Public pure observation bookkeeping. This module has no Chrome APIs or
// product-specific policy. The privileged Driver supplies trusted observations.
export function settleManagedSiteBudget(state,{at,session,current=null,boot=false},{
  dayFor,poolFor,matchSite,blockedAt,maxGapMs
}){
  const today=dayFor(at),cp=state.checkpoint,offset=new Date(at).getTimezoneOffset();
  // Stay Focus stores enabled at root; public finite apps store settings.enabled.
  const enabled=typeof state.enabled==='boolean'?state.enabled:
    state.policy?.enabled===true||state.settings?.enabled===true;
  if(at<state.clockHighWater){state.checkpoint=null;return {state,clockRollback:true};}
  if(today>state.day){state.day=today;state.usage={};state.checkpoint=null;}
  if(today<state.day){state.checkpoint=null;return {state,clockRollback:true};}
  state.clockHighWater=at;
  if(cp&&current&&cp.host===current.host&&cp.tabId===current.tabId&&
      cp.windowId===current.windowId&&cp.pool===poolFor(current.site)&&
      cp.session===session&&!boot&&cp.day===today&&cp.offset===offset&&
      at>=cp.at&&at-cp.at<=maxGapMs&&enabled){
    const site=matchSite(state,cp.host);
    if(site&&poolFor(site)===cp.pool&&!blockedAt(state,site,cp.at)){
      const duration=Math.min(at-cp.at,maxGapMs);
      state.usage[cp.pool]=Math.min(86400000,(state.usage[cp.pool]||0)+duration);
    }
  }
  state.checkpoint=null;
  if(current&&enabled&&current.site&&!blockedAt(state,current.site,at))
    state.checkpoint={host:current.host,tabId:current.tabId,windowId:current.windowId,
      pool:poolFor(current.site),at,day:today,offset,session};
  return {state,clockRollback:false};
}

