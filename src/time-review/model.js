export const TIME_REVIEW_KEY='opendesk.time-review.v1';
export const MAX_OBSERVATION_GAP=45000;
export const DEFAULT_SETTINGS=Object.freeze({idleSeconds:60,retentionDays:90,excludedHosts:[]});
const fail=message=>{throw Object.assign(new Error(message),{code:'E_TIME_DATA'});};
export function localDay(at){
  const date=new Date(at);
  return [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
}
export function reviewHost(value){
  try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password?url.hostname.toLowerCase():null;}catch{return null;}
}
export function reviewSettings(value){
  if(!value||Object.keys(value).sort().join(',')!=='excludedHosts,idleSeconds,retentionDays'||
    !Number.isInteger(value.idleSeconds)||value.idleSeconds<15||value.idleSeconds>3600||
    !Number.isInteger(value.retentionDays)||value.retentionDays<7||value.retentionDays>365||
    !Array.isArray(value.excludedHosts)||value.excludedHosts.length>100||
    value.excludedHosts.some(host=>typeof host!=='string'||host.length>253||reviewHost('https://'+host+'/')!==host))
    fail('设置无效：空闲阈值 15–3600 秒，保留 7–365 天，最多排除 100 个域名');
  return {...value,excludedHosts:[...new Set(value.excludedHosts)].sort()};
}
export function emptyReview(){return {version:1,authorizedHash:null,authorizedEpoch:null,highWater:0,paused:true,settings:{...DEFAULT_SETTINGS,excludedHosts:[]},days:{},checkpoint:null,discardedMs:0};}
export function readReview(raw){
  if(raw===undefined)return emptyReview();
  if(!raw||raw.version!==1||typeof raw.paused!=='boolean'||
    !(raw.authorizedHash===null||typeof raw.authorizedHash==='string'&&/^[a-f0-9]{64}$/.test(raw.authorizedHash))||
    !raw.days||typeof raw.days!=='object'||Array.isArray(raw.days)||Object.keys(raw.days).length>366||
    !Number.isSafeInteger(raw.discardedMs)||raw.discardedMs<0)fail('时间记录损坏；已停止修改以保护原始数据');
  reviewSettings(raw.settings);
  for(const [day,sites] of Object.entries(raw.days)){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!sites||typeof sites!=='object'||Array.isArray(sites)||Object.keys(sites).length>500)fail('时间记录日期或网站数量无效');
    for(const [host,ms] of Object.entries(sites))if(reviewHost('https://'+host+'/')!==host||!Number.isSafeInteger(ms)||ms<0||ms>86400000)fail('网站时间记录无效');
  }
  const cp=raw.checkpoint;
  if(cp!==null&&(!cp||reviewHost('https://'+cp.host+'/')!==cp.host||!Number.isSafeInteger(cp.at)||
    !Number.isInteger(cp.tabId)||!Number.isInteger(cp.windowId)||typeof cp.session!=='string'||!Number.isInteger(cp.offset)))fail('时间检查点无效');
  const result=structuredClone(raw);
  if(!Object.hasOwn(result,'authorizedEpoch')){result.authorizedHash=null;result.authorizedEpoch=null;result.paused=true;result.checkpoint=null;}
  if(!(result.authorizedEpoch===null||typeof result.authorizedEpoch==='string')||result.highWater!==undefined&&(!Number.isSafeInteger(result.highWater)||result.highWater<0))fail('时间授权或时钟记录无效');
  result.highWater??=0;
  return result;
}
export function settleReview(state,at,{session,recover=false}={}){
  const next=readReview(state),cp=next.checkpoint;next.checkpoint=null;
  next.highWater=Math.max(next.highWater,cp?.at||0,at);
  if(cp){
    const elapsed=at-cp.at;
    // Never infer activity across browser sessions, clock/zone changes or sleep.
    if(elapsed>0&&elapsed<=MAX_OBSERVATION_GAP&&cp.session===session&&cp.offset===new Date(at).getTimezoneOffset()&&!recover){
      let cursor=cp.at;
      while(cursor<at){
        const midnight=new Date(cursor);midnight.setHours(24,0,0,0);
        const end=Math.min(at,midnight.getTime()),day=localDay(cursor);
        const sites=next.days[day]||={};
        if(Object.hasOwn(sites,cp.host)||Object.keys(sites).length<500)Object.defineProperty(sites,cp.host,{value:Math.min(86400000,(Object.hasOwn(sites,cp.host)?sites[cp.host]:0)+end-cursor),enumerable:true,configurable:true,writable:true});
        else next.discardedMs+=end-cursor;
        cursor=end;
      }
    }else if(elapsed>0)next.discardedMs+=elapsed;
  }
  const cutoff=new Date(at);cutoff.setDate(cutoff.getDate()-next.settings.retentionDays+1);
  const oldest=localDay(cutoff.getTime());
  for(const day of Object.keys(next.days))if(day<oldest)delete next.days[day];
  return next;
}
export function reviewSummary(state,at){
  const today=localDay(at),start=new Date(at);start.setDate(start.getDate()-6);
  const first=localDay(start.getTime()),days=[];
  for(let i=0;i<7;i++){const day=new Date(start);day.setDate(day.getDate()+i);const date=localDay(day.getTime());days.push({date,ms:Object.values(state.days[date]||{}).reduce((a,b)=>a+b,0)});}
  const sites=new Map();for(const [day,rows] of Object.entries(state.days))if(day>=first&&day<=today)for(const [host,ms] of Object.entries(rows))sites.set(host,(sites.get(host)||0)+ms);
  return {today,todayMs:Object.values(state.days[today]||{}).reduce((a,b)=>a+b,0),weekMs:days.reduce((a,b)=>a+b.ms,0),days,
    todaySites:Object.entries(state.days[today]||{}).sort((a,b)=>b[1]-a[1]).map(([host,ms])=>({host,ms})),
    sites:[...sites].sort((a,b)=>b[1]-a[1]).map(([host,ms])=>({host,ms})),paused:state.paused,
    authorized:Boolean(state.authorizedHash),settings:state.settings,trackingHost:state.checkpoint?.host||null,discardedMs:state.discardedMs};
}
export function reviewExport(state,format='json'){
  if(format==='json')return {name:'time-review.json',text:JSON.stringify({format:'opendesk.time-review.export.v1',days:state.days,settings:state.settings,discardedMs:state.discardedMs},null,2)};
  if(format!=='csv')fail('导出格式无效');
  const rows=['date,website,milliseconds,seconds'];
  for(const day of Object.keys(state.days).sort())for(const host of Object.keys(state.days[day]).sort()){
    const safeHost='"'+(/^[=+\-@\t\r]/.test(host)?"'":'')+host.replaceAll('"','""')+'"';
    rows.push([day,safeHost,state.days[day][host],(state.days[day][host]/1000).toFixed(3)].join(','));
  }
  return {name:'time-review.csv',text:rows.join('\r\n')+'\r\n'};
}
