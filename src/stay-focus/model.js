import {FOCUS_MAX_GAP_MS,FOCUS_MAX_SITES,focusHost,hostnameMatches,focusLocalDay,focusNextMidnight,focusError} from './policy.js';
const obj=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const keys=(value,expected)=>obj(value)&&Object.keys(value).sort().join(',')===expected.slice().sort().join(',');
const fail=()=>{throw focusError('Stay Focus 本机策略数据无效；已停止修改以保护原始数据');};
const groupId=value=>typeof value==='string'&&/^[a-z][a-z0-9-]{0,23}$/.test(value);
export function focusSite(raw){
  if(!keys(raw,['host','subdomains','enabled','mode','minutes','group'])||focusHost(raw.host)!==raw.host||
    typeof raw.subdomains!=='boolean'||typeof raw.enabled!=='boolean'||
    !['limit','always'].includes(raw.mode)||!Number.isInteger(raw.minutes)||raw.minutes<1||raw.minutes>1440||
    !(raw.group===''||groupId(raw.group)))fail();
  return structuredClone(raw);
}
export function focusSchedule(raw){
  if(!keys(raw,['enabled','days','startMinute','endMinute'])||typeof raw.enabled!=='boolean'||
     !Array.isArray(raw.days)||raw.days.length>7||new Set(raw.days).size!==raw.days.length||
     raw.days.some(d=>!Number.isInteger(d)||d<0||d>6)||
     !Number.isInteger(raw.startMinute)||raw.startMinute<0||raw.startMinute>1439||
     !Number.isInteger(raw.endMinute)||raw.endMinute<0||raw.endMinute>1440||
     raw.startMinute===raw.endMinute)fail();
  return structuredClone(raw);
}
// An explicit nested exception must cover its descendants. Otherwise DNR's
// excludedRequestDomains would exempt children from a parent restriction
// while the time model still expects that parent to own those URLs.
export function focusSiteScopesValid(sites){
  return Array.isArray(sites)&&!sites.some(child=>sites.some(parent=>
    parent!==child&&parent.subdomains&&child.host!==parent.host&&
    hostnameMatches(child.host,parent.host,true)&&!child.subdomains));
}
export function emptyFocus(at=Date.now()){
  return {version:1,authorizedHash:null,authorizedEpoch:null,enabled:false,
    day:focusLocalDay(at),clockHighWater:0,sites:[],groups:{},whitelist:[],
    schedule:{enabled:false,days:[1,2,3,4,5],startMinute:540,endMinute:1020},
    focusUntil:null,usage:{},checkpoint:null};
}
export function readFocus(raw,at=Date.now()){
  if(raw===undefined)return emptyFocus(at);
  if(!keys(raw,['version','authorizedHash','authorizedEpoch','enabled','day','clockHighWater','sites','groups','whitelist','schedule','focusUntil','usage','checkpoint'])||
     raw.version!==1||typeof raw.enabled!=='boolean'||
     !(raw.authorizedHash===null||typeof raw.authorizedHash==='string'&&/^[a-f0-9]{64}$/.test(raw.authorizedHash))||
     !(raw.authorizedEpoch===null||typeof raw.authorizedEpoch==='string')||
     !/^\d{4}-\d{2}-\d{2}$/.test(raw.day)||!Number.isSafeInteger(raw.clockHighWater)||raw.clockHighWater<0||
     !Array.isArray(raw.sites)||raw.sites.length>FOCUS_MAX_SITES||!obj(raw.groups)||Object.keys(raw.groups).length>20||
     !Array.isArray(raw.whitelist)||raw.whitelist.length>50||!obj(raw.usage)||Object.keys(raw.usage).length>80||
     !(raw.focusUntil===null||Number.isSafeInteger(raw.focusUntil)&&raw.focusUntil>0))fail();
  for(const site of raw.sites)focusSite(site);
  if(new Set(raw.sites.map(s=>s.host)).size!==raw.sites.length||!focusSiteScopesValid(raw.sites))fail();
  for(const [name,minutes] of Object.entries(raw.groups))
    if(!groupId(name)||!Number.isInteger(minutes)||minutes<1||minutes>1440)fail();
  for(const host of raw.whitelist)if(typeof host!=='string'||focusHost(host)!==host)fail();
  if(new Set(raw.whitelist).size!==raw.whitelist.length)fail();
  focusSchedule(raw.schedule);
  for(const [key,ms] of Object.entries(raw.usage))
    if(!/^(?:g:[a-z][a-z0-9-]{0,23}|s:[a-z0-9.-]{1,253})$/.test(key)||!Number.isSafeInteger(ms)||ms<0||ms>86400000)fail();
  const cp=raw.checkpoint;
  if(cp!==null&&(!keys(cp,['at','day','offset','session','host','tabId','windowId','pool'])||
     !Number.isSafeInteger(cp.at)||cp.at<0||!/^\d{4}-\d{2}-\d{2}$/.test(cp.day)||
     !Number.isInteger(cp.offset)||Math.abs(cp.offset)>1440||typeof cp.session!=='string'||
     focusHost(cp.host)!==cp.host||!Number.isInteger(cp.tabId)||!Number.isInteger(cp.windowId)||
     typeof cp.pool!=='string'||!/^(g:|s:)/.test(cp.pool)))fail();
  return structuredClone(raw);
}
export function focusMatchingSite(state,hostname){
  if(!hostname||state.whitelist.some(host=>hostnameMatches(hostname,host,true)))return null;
  const specific=[...state.sites].filter(s=>hostnameMatches(hostname,s.host,s.subdomains))
    .sort((a,b)=>b.host.length-a.host.length)[0]||null;
  // A paused child is an explicit exception to a broader parent policy.
  return specific?.enabled?specific:null;
}
export function focusPool(site){return site.group?'g:'+site.group:'s:'+site.host;}
export function focusBudget(state,site){
  return (site.group?state.groups[site.group]??site.minutes:site.minutes)*60000;
}
export function focusScheduleActive(schedule,at){
  if(!schedule.enabled)return false;
  const date=new Date(at),day=date.getDay(),minute=date.getHours()*60+date.getMinutes();
  if(schedule.startMinute<schedule.endMinute)
    return schedule.days.includes(day)&&minute>=schedule.startMinute&&minute<schedule.endMinute;
  const previous=(day+6)%7;
  return schedule.days.includes(day)&&minute>=schedule.startMinute||
    schedule.days.includes(previous)&&minute<schedule.endMinute;
}
export function focusReason(state,site,at){
  if(!site||!site.enabled||!state.enabled)return null;
  if(state.focusUntil!==null&&at<state.focusUntil)return 'session';
  if(focusScheduleActive(state.schedule,at))return 'schedule';
  if(site.mode==='always')return 'always';
  return (state.usage[focusPool(site)]||0)>=focusBudget(state,site)?'quota':null;
}
export function settleFocus(state,{at,session,current=null,boot=false}){
  const today=focusLocalDay(at),cp=state.checkpoint,offset=new Date(at).getTimezoneOffset();
  if(at<state.clockHighWater){state.checkpoint=null;return {state,clockRollback:true};}
  if(today>state.day){state.day=today;state.usage={};state.checkpoint=null;}
  if(today<state.day){state.checkpoint=null;return {state,clockRollback:true};}
  state.clockHighWater=at;
  // Recheck the *same foreground tab and window* before charging a checkpoint.
  // A hidden tab, unfocused Chrome, idle/locked state, or a tab switch must
  // never be charged just because an old timestamp still exists.
  if(cp&&current&&cp.host===current.host&&cp.tabId===current.tabId&&
      cp.windowId===current.windowId&&cp.pool===focusPool(current.site)&&
      cp.session===session&&!boot&&cp.day===today&&cp.offset===offset&&
      at>=cp.at&&at-cp.at<=FOCUS_MAX_GAP_MS&&state.enabled){
    const site=focusMatchingSite(state,cp.host);
    if(site&&focusPool(site)===cp.pool&&!focusReason(state,site,cp.at)){
      const duration=Math.min(at-cp.at,FOCUS_MAX_GAP_MS);
      state.usage[cp.pool]=Math.min(86400000,(state.usage[cp.pool]||0)+duration);
    }
  }
  state.checkpoint=null;
  if(current&&state.enabled&&current.site&&!focusReason(state,current.site,at))
    state.checkpoint={host:current.host,tabId:current.tabId,windowId:current.windowId,
      pool:focusPool(current.site),at,day:today,offset,session};
  return {state,clockRollback:false};
}
export function focusSummary(state,at=Date.now()){
  return {enabled:state.enabled,authorized:Boolean(state.authorizedHash),day:state.day,
    schedule:state.schedule,focusUntil:state.focusUntil,groups:state.groups,whitelist:state.whitelist,
    sites:state.sites.map(site=>{const budget=focusBudget(state,site),used=state.usage[focusPool(site)]||0;
      return {...site,usedMs:used,budgetMs:budget,remainingMs:Math.max(0,budget-used),
        reason:focusReason(state,site,at)};}),
    nextReset:focusNextMidnight(at),maximumObservationGapMs:FOCUS_MAX_GAP_MS};
}
