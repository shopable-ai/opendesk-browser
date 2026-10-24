// Frozen, finite compatibility decoder for the *historical* 1.0.10 storage schema.
// Not a v3 product policy engine: current Stay Focus policies and mutations
// remain app-owned and flow through the public siteBudget SDK. This one-time
// decoder imports no app JavaScript, runs no candidate JS and has no Chrome API.
// Keep exact parity with the app-owned archived migrator in Node tests.
import {isManagedSiteV3Host,normalizeManagedSiteV3Policy,
  normalizeManagedSiteV3Usage} from '../../framework/sdk/site-budget-v3-policy.js';
import {normalizeManagedSiteV3Notices}
  from '../../framework/sdk/site-budget-v3-reminders.js';

const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const exact=(value,names)=>object(value)&&
  Object.keys(value).sort().join(',')===names.slice().sort().join(',');
const integer=(value,low,high=Number.MAX_SAFE_INTEGER)=>
  Number.isSafeInteger(value)&&value>=low&&value<=high;
const day=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value);
const group=value=>typeof value==='string'&&/^[a-z][a-z0-9-]{0,23}$/.test(value);
const pool=value=>typeof value==='string'&&
  /^(?:g:[a-z][a-z0-9-]{0,23}|s:[a-z0-9.-]{1,253})$/.test(value);
const host=value=>isManagedSiteV3Host(value);
const invalid=()=>fail('E_MIGRATION_SOURCE',
  '旧版 1.0.10 状态无法安全验证，原设置和历史额度保持不变');
const freeze=value=>{
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    for(const item of Object.values(value))freeze(item);
    Object.freeze(value);
  }
  return value;
};
function validatedLegacyFocus(raw,at){
  if(raw===undefined||!integer(at,0))invalid();
  const fields=['version','authorizedHash','authorizedEpoch','enabled','day',
    'clockHighWater','sites','groups','whitelist','schedule','focusUntil',
    'usage','checkpoint'];
  if(!(exact(raw,fields)||exact(raw,[...fields,'notices']))||
     raw.version!==1||typeof raw.enabled!=='boolean'||!day(raw.day)||
     !(raw.authorizedHash===null||typeof raw.authorizedHash==='string'&&
       /^[a-f0-9]{64}$/.test(raw.authorizedHash))||
     !(raw.authorizedEpoch===null||typeof raw.authorizedEpoch==='string')||
     !integer(raw.clockHighWater,0)||!Array.isArray(raw.sites)||
     raw.sites.length>60||!object(raw.groups)||Object.keys(raw.groups).length>20||
     !Array.isArray(raw.whitelist)||raw.whitelist.length>50||
     !object(raw.usage)||Object.keys(raw.usage).length>80||
     !(raw.focusUntil===null||integer(raw.focusUntil,1)))invalid();
  for(const site of raw.sites)
    if(!exact(site,['host','subdomains','enabled','mode','minutes','group'])||
       !host(site.host)||typeof site.subdomains!=='boolean'||
       typeof site.enabled!=='boolean'||!['limit','always'].includes(site.mode)||
       !integer(site.minutes,1,1440)||!(site.group===''||group(site.group)))
      invalid();
  if(new Set(raw.sites.map(site=>site.host)).size!==raw.sites.length||
     raw.sites.some(child=>raw.sites.some(parent=>parent!==child&&
       parent.subdomains&&child.host!==parent.host&&
       child.host.endsWith('.'+parent.host)&&!child.subdomains)))invalid();
  for(const [id,minutes] of Object.entries(raw.groups))
    if(!group(id)||!integer(minutes,1,1440))invalid();
  for(const white of raw.whitelist)if(!host(white))invalid();
  if(new Set(raw.whitelist).size!==raw.whitelist.length)invalid();
  const schedule=raw.schedule;
  if(!exact(schedule,['enabled','days','startMinute','endMinute'])||
     typeof schedule.enabled!=='boolean'||!Array.isArray(schedule.days)||
     schedule.days.length>7||new Set(schedule.days).size!==schedule.days.length||
     schedule.days.some(value=>!integer(value,0,6))||
     !integer(schedule.startMinute,0,1439)||
     !integer(schedule.endMinute,0,1440)||
     schedule.startMinute===schedule.endMinute)invalid();
  for(const [id,ms] of Object.entries(raw.usage))
    if(!pool(id)||!integer(ms,0,86400000))invalid();
  const cp=raw.checkpoint;
  if(cp!==null&&(!exact(cp,['at','day','offset','session','host',
      'tabId','windowId','pool'])||!integer(cp.at,0)||!day(cp.day)||
      !integer(cp.offset,-1440,1440)||typeof cp.session!=='string'||
      !host(cp.host)||!Number.isInteger(cp.tabId)||
      !Number.isInteger(cp.windowId)||typeof cp.pool!=='string'||
      !/^(g:|s:)/.test(cp.pool)))invalid();
  const notices=raw.notices;
  if(notices!==undefined&&(!exact(notices,['day','revision','budgetMs','thresholds'])||
     !day(notices.day)||!integer(notices.revision,0,1000000000)||
     !(notices.budgetMs===null||integer(notices.budgetMs,60000,86400000))||
     !Array.isArray(notices.thresholds)||notices.thresholds.length>3||
     new Set(notices.thresholds).size!==notices.thresholds.length||
     notices.thresholds.some(min=>![1,5,10].includes(min))))invalid();
  return {...structuredClone(raw),notices:notices===undefined?
    {day:raw.day,revision:0,budgetMs:null,thresholds:[]}:
    structuredClone(notices)};
}
// Historical bridge only: the public Driver receives a finite policy and a
// separately validated ledger, never an executable Stay Focus service.
export function migrateLegacyFocusV1Snapshot(raw,{at=Date.now()}={}){
  const state=validatedLegacyFocus(raw,at);
  if(state.enabled&&(!state.authorizedHash||!state.authorizedEpoch))
    fail('E_MIGRATION_GRANT','旧版启用授权缺少原始 Hash 或安装代际');
  const desiredPolicy=normalizeManagedSiteV3Policy({
    kind:'site-budget.v3',enabled:state.enabled,reminderMinutes:[10,5,1],
    whitelist:[...state.whitelist],
    sites:state.sites.map(site=>({
      host:site.host,subdomains:site.subdomains,enabled:site.enabled,
      pool:site.group?'g:'+site.group:'s:'+site.host,
      conditions:[
        ...(state.focusUntil===null?[]:[{type:'temporary',until:state.focusUntil}]),
        ...(state.schedule.enabled?[{type:'weekly-window',
          days:[...state.schedule.days],startMinute:state.schedule.startMinute,
          endMinute:state.schedule.endMinute}]:[]),
        ...(site.mode==='always'?[{type:'constant-deny'}]:[{
          type:'counter-limit',limitMs:
            (site.group?state.groups[site.group]??site.minutes:site.minutes)*60000
        }])
      ]
    }))
  });
  const usage=normalizeManagedSiteV3Usage(state.usage);
  const usedBefore=Object.values(state.usage).reduce((total,ms)=>total+ms,0);
  const usedAfter=Object.values(usage).reduce((total,ms)=>total+ms,0);
  if(usedBefore!==usedAfter||
     Object.entries(state.usage).some(([id,ms])=>usage[id]!==ms))
    fail('E_MIGRATION_LOSS','每个历史计量池未完整守恒');
  const previous=state.notices;
  if(previous.day===state.day&&previous.thresholds.length&&previous.budgetMs===null)
    fail('E_MIGRATION_NOTICE','历史提醒已触发但缺失原始额度');
  const pools=previous.day===state.day&&previous.budgetMs!==null?
    {'g:entertainment':{limitMs:previous.budgetMs,
      thresholds:[...previous.thresholds]}}:{};
  const notices=normalizeManagedSiteV3Notices({day:state.day,pools},state.day);
  // Historical settings are sealed for UI only; billing authority and old
  // checkpoints remain exclusively in the Driver and immutable audit snapshot.
  const sealedModel={...structuredClone(state),usage:{},checkpoint:null,
    clockHighWater:0,authorizedHash:null,authorizedEpoch:null,
    notices:{day:state.day,revision:0,budgetMs:null,thresholds:[]}};
  return freeze({model:structuredClone(state),sealedModel,desiredPolicy,
    usage,notices,day:state.day,clockHighWater:state.clockHighWater,
    checkpoint:state.checkpoint===null?null:structuredClone(state.checkpoint),
    legacyAuthorizedHash:state.authorizedHash,
    legacyAuthorizedEpoch:state.authorizedEpoch,
    enabled:state.enabled,usedBefore,usedAfter});
}
