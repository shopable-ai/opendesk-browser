import {requireTimeReviewSiteGrants} from './policy.js';
export const TIME_REVIEW_KEY='opendesk.time-review.v1';
export const MAX_OBSERVATION_GAP=45000;
export const MAX_MINUTE_DAYS=90;
export const MAX_MINUTE_ROWS=2000;
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
export function emptyReview(){return {version:1,authorizedHash:null,authorizedEpoch:null,highWater:0,paused:true,settings:{...DEFAULT_SETTINGS,excludedHosts:[]},days:{},checkpoint:null,discardedMs:0,categories:{},minuteConsent:false,minuteDays:{},siteGrants:{allSites:false,origins:[]}};}
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
  // Optional R1.3 fields preserve all legacy v1 totals without fabricating detail.
  if(raw.categories!==undefined){
    if(!raw.categories||typeof raw.categories!=='object'||Array.isArray(raw.categories)||Object.keys(raw.categories).length>5000)fail('网站分类记录无效');
    for(const [host,id] of Object.entries(raw.categories))if(reviewHost('https://'+host+'/')!==host||!Number.isInteger(id)||id<1||id>5)fail('网站分类记录无效');
  }
  if(raw.minuteConsent!==undefined&&typeof raw.minuteConsent!=='boolean')fail('分钟明细授权记录无效');
  if(raw.minuteDays!==undefined){
    if(!raw.minuteDays||typeof raw.minuteDays!=='object'||Array.isArray(raw.minuteDays)||Object.keys(raw.minuteDays).length>MAX_MINUTE_DAYS)fail('分钟明细记录无效');
    for(const [day,bucket] of Object.entries(raw.minuteDays)){
      if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!bucket||!Number.isInteger(bucket.offset)||Math.abs(bucket.offset)>1440||
        typeof bucket.ambiguous!=='boolean'||typeof bucket.truncated!=='boolean'||
        !Array.isArray(bucket.entries)||bucket.entries.length>MAX_MINUTE_ROWS)fail('分钟明细记录无效');
      const perMinute=new Map();
      for(const entry of bucket.entries){
        if(!Array.isArray(entry)||entry.length!==3||!Number.isInteger(entry[0])||entry[0]<0||entry[0]>1439||
          typeof entry[1]!=='string'||reviewHost('https://'+entry[1]+'/')!==entry[1]||
          !Number.isSafeInteger(entry[2])||entry[2]<1||entry[2]>60000)fail('分钟条目无效');
        perMinute.set(entry[0],(perMinute.get(entry[0])||0)+entry[2]);
      }
      if([...perMinute.values()].some(ms=>ms>60000))fail('分钟时长超过物理上限');
    }
  }
  const result=structuredClone(raw);
  result.siteGrants=requireTimeReviewSiteGrants(result.siteGrants);
  result.categories??={};
  result.minuteConsent??=false;
  result.minuteDays??={};
  // The absence of consent is the final authority. Do not surface stale
  // minute entries that may survive an interrupted/legacy opt-out write.
  // The next verified persistence operation will erase these rows at rest.
  if(!result.minuteConsent)result.minuteDays={};
  if(!Object.hasOwn(result,'authorizedEpoch')){result.authorizedHash=null;result.authorizedEpoch=null;result.paused=true;result.checkpoint=null;}
  if(!(result.authorizedEpoch===null||typeof result.authorizedEpoch==='string')||result.highWater!==undefined&&(!Number.isSafeInteger(result.highWater)||result.highWater<0))fail('时间授权或时钟记录无效');
  result.highWater??=0;
  return result;
}
export function reviewCategory(state,host){
  return Object.hasOwn(state.categories||{},host)?state.categories[host]:0;
}
export function reviewClassify(state,payload){
  const {host,category}=payload||{};
  if(typeof host!=='string'||reviewHost('https://'+host+'/')!==host||
    !Number.isInteger(category)||category<0||category>5||
    !Object.values(state.days).some(sites=>Object.hasOwn(sites,host)))fail('请选择已有网站及有效的分类');
  if(category===0)delete state.categories[host];
  else Object.defineProperty(state.categories,host,{value:category,enumerable:true,writable:true,configurable:true});
  return state;
}
export function reviewCategoryTotals(sites,categories={}){
  const ms=[0,0,0,0,0,0];
  for(const [host,duration] of Object.entries(sites)){
    const cat=Object.hasOwn(categories,host)?categories[host]:0;
    ms[cat]+=duration;
  }
  const total=ms.reduce((a,b)=>a+b,0);
  const classified=total-ms[0];
  return {categoryMs:ms,classifiedMs:classified,importantMs:ms[1]+ms[2],
    productivityPct:total>0&&classified===total?Math.round((ms[1]+ms[2])*100/total):null};
}
function addMinute(state,day,host,start,end){
  if(!state.minuteConsent)return;
  const midnight=new Date(start);midnight.setHours(0,0,0,0);
  const next=new Date(midnight);next.setDate(next.getDate()+1);
  // A 1440-slot civil-day timeline cannot represent a 23/25-hour DST day.
  if(next.getTime()-midnight.getTime()!==86400000)return;
  const offset=new Date(start).getTimezoneOffset();
  const bucket=state.minuteDays[day]||={offset,ambiguous:false,truncated:false,entries:[]};
  if(bucket.offset!==offset){bucket.ambiguous=true;return;}
  if(bucket.ambiguous||bucket.truncated)return;
  let cursor=start;
  while(cursor<end){
    const moment=new Date(cursor),minute=moment.getHours()*60+moment.getMinutes();
    const endOfMinute=Math.min(end,(Math.floor(cursor/60000)+1)*60000);
    const duration=endOfMinute-cursor;
    const existing=bucket.entries.find(row=>row[0]===minute&&row[1]===host);
    if(existing)existing[2]+=duration;
    else if(bucket.entries.length<MAX_MINUTE_ROWS)bucket.entries.push([minute,host,duration]);
    else {bucket.truncated=true;return;}
    cursor=endOfMinute;
  }
}
export function reviewDay(state,date){
  if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||
    Number.isNaN(Date.parse(date+'T12:00:00'))||localDay(new Date(date+'T12:00:00').getTime())!==date)fail('日期无效');
  const sites=state.days[date]||{},totals=reviewCategoryTotals(sites,state.categories);
  const bucket=state.minuteDays?.[date];
  const start=new Date(date+'T00:00:00'),end=new Date(start);end.setDate(end.getDate()+1);
  const representable=end.getTime()-start.getTime()===86400000;
  const usable=bucket&&!bucket.ambiguous&&representable&&bucket.offset===new Date(date+'T12:00:00').getTimezoneOffset();
  const byMinute=new Map();
  if(usable)for(const [minute,host,ms] of bucket.entries){
    let slot=byMinute.get(minute);if(!slot){slot=[];byMinute.set(minute,slot);}
    slot.push({host,ms,category:reviewCategory(state,host)});
  }
  const minuteSlots=[];
  let coveredMs=0;
  for(const [minute,rows] of [...byMinute].sort((a,b)=>a[0]-b[0])){
    const categories=Array(6).fill(0);let total=0,bestHost='',best=0;
    for(const row of rows){total+=row.ms;categories[row.category]+=row.ms;if(row.ms>best){best=row.ms;bestHost=row.host;}}
    const dominant=categories.indexOf(Math.max(...categories));
    minuteSlots.push([minute,dominant,total,rows.length===1?bestHost:'多个网站']);
    coveredMs+=total;
  }
  const totalMs=Object.values(sites).reduce((a,b)=>a+b,0);
  const timelineStatus=!representable?'dst':bucket?.ambiguous||bucket&&!usable?'timezone':
    !minuteSlots.length?'unavailable':
    bucket.truncated||coveredMs!==totalMs?'partial':'complete';
  return {date,totalMs,sites:Object.entries(sites).sort((a,b)=>b[1]-a[1]).map(([host,ms])=>({host,ms,category:reviewCategory(state,host)})),
    ...totals,minuteSlots,timelineStatus,minuteCoveredMs:coveredMs,minuteConsent:Boolean(state.minuteConsent)};
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
        if(Object.hasOwn(sites,cp.host)||Object.keys(sites).length<500){
          Object.defineProperty(sites,cp.host,{value:Math.min(86400000,(Object.hasOwn(sites,cp.host)?sites[cp.host]:0)+end-cursor),enumerable:true,configurable:true,writable:true});
          addMinute(next,day,cp.host,cursor,end);
        }else next.discardedMs+=end-cursor;
        cursor=end;
      }
    }else if(elapsed>0)next.discardedMs+=elapsed;
  }
  const cutoff=new Date(at);cutoff.setDate(cutoff.getDate()-next.settings.retentionDays+1);
  const oldest=localDay(cutoff.getTime());
  for(const day of Object.keys(next.days))if(day<oldest)delete next.days[day];
  const detailStart=new Date(at);detailStart.setDate(detailStart.getDate()-Math.min(next.settings.retentionDays,MAX_MINUTE_DAYS)+1);
  const oldestDetail=localDay(detailStart.getTime());
  for(const day of Object.keys(next.minuteDays))if(day<oldestDetail||!Object.hasOwn(next.days,day))delete next.minuteDays[day];
  return next;
}
export function reviewSummary(state,at){
  const today=localDay(at),start=new Date(at);start.setDate(start.getDate()-6);
  const first=localDay(start.getTime()),days=[];
  for(let i=0;i<7;i++){const day=new Date(start);day.setDate(day.getDate()+i);const date=localDay(day.getTime());days.push({date,ms:Object.values(state.days[date]||{}).reduce((a,b)=>a+b,0)});}
  const sites=new Map();for(const [day,rows] of Object.entries(state.days))if(day>=first&&day<=today)for(const [host,ms] of Object.entries(rows))sites.set(host,(sites.get(host)||0)+ms);
  const thisDay=reviewDay(state,today),weekRows=Object.fromEntries(sites);
  const yesterday=new Date(at);yesterday.setDate(yesterday.getDate()-1);
  const yesterdayKey=localDay(yesterday.getTime()),yesterdayMs=Object.hasOwn(state.days,yesterdayKey)?
    Object.values(state.days[yesterdayKey]).reduce((a,b)=>a+b,0):null;
  return {today,todayMs:thisDay.totalMs,weekMs:days.reduce((a,b)=>a+b.ms,0),days,
    todayCategoryMs:thisDay.categoryMs,todayImportantMs:thisDay.importantMs,todayProductivityPct:thisDay.productivityPct,
    todayClassifiedMs:thisDay.classifiedMs,weekCategories:reviewCategoryTotals(weekRows,state.categories),
    siteCategories:Object.fromEntries([...sites].map(([host])=>[host,reviewCategory(state,host)])),
    yesterdayMs,minuteConsent:Boolean(state.minuteConsent),
    todaySites:Object.entries(state.days[today]||{}).sort((a,b)=>b[1]-a[1]).map(([host,ms])=>({host,ms})),
    sites:[...sites].sort((a,b)=>b[1]-a[1]).map(([host,ms])=>({host,ms})),paused:state.paused,
    authorized:Boolean(state.authorizedHash),settings:state.settings,siteGrants:requireTimeReviewSiteGrants(state.siteGrants),trackingHost:state.checkpoint?.host||null,discardedMs:state.discardedMs};
}
export function reviewExport(state,format='json'){
  if(format==='json')return {name:'time-review.json',text:JSON.stringify({format:'opendesk.time-review.export.v1',days:state.days,settings:state.settings,discardedMs:state.discardedMs,categories:state.categories,minuteConsent:state.minuteConsent,minuteDays:state.minuteDays},null,2)};
  if(format!=='csv')fail('导出格式无效');
  const rows=['date,website,milliseconds,seconds,category'];
  for(const day of Object.keys(state.days).sort())for(const host of Object.keys(state.days[day]).sort()){
    const safeHost='"'+(/^[=+\-@\t\r]/.test(host)?"'":'')+host.replaceAll('"','""')+'"';
    rows.push([day,safeHost,state.days[day][host],(state.days[day][host]/1000).toFixed(3),reviewCategory(state,host)].join(','));
  }
  return {name:'time-review.csv',text:rows.join('\r\n')+'\r\n'};
}
