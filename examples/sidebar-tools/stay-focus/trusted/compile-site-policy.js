// Stay Focus owns this product-specific translation. No Chrome API, manifest,
// DNR IDs, privileged Host callbacks or platform-private app branches here.
// The existing readFocus() is the source of truth for legacy v1 validation;
// the v3 Host must separately validate this finite output before any effect.
export function compileFocusPolicy(state){
  if(!state||state.version!==1||!Array.isArray(state.sites)||
     !Array.isArray(state.whitelist)||!state.schedule||
     !state.groups||typeof state.enabled!=='boolean')
    throw Object.assign(new Error('请先验证原有专注业务状态'),{code:'E_FOCUS_DATA'});
  const schedule=state.schedule;
  return {
    kind:'site-budget.v3',enabled:state.enabled,
    // This product alone chooses 10/5/1; Browser contains no Focus alert constants.
    reminderMinutes:[10,5,1],
    whitelist:[...state.whitelist],
    sites:state.sites.map(site=>({
      host:site.host,subdomains:site.subdomains,enabled:site.enabled,
      pool:site.group?'g:'+site.group:'s:'+site.host,
      conditions:[
        ...(state.focusUntil===null?[]:[{type:'temporary',until:state.focusUntil}]),
        ...(schedule.enabled?[{type:'weekly-window',days:[...schedule.days],
          startMinute:schedule.startMinute,endMinute:schedule.endMinute}]:[]),
        ...(site.mode==='always'?[{type:'constant-deny'}]:[
          {type:'counter-limit',limitMs:
            (site.group?state.groups[site.group]??site.minutes:site.minutes)*60000}
        ])
      ]
    }))
  };
}
