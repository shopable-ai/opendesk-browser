// Presentation-only release state. The only writer is the existing MV3 Worker.
// Never accept a release identity, installed status, or package bytes from a page/tool.
export const UPDATE_NOTICE_PROTOCOL='opendesk.update-notice.v1';
export const UPDATE_NOTICE_STORE='opendesk.update-notice.state.v1';
export const UPDATE_NOTICE_SCHEMA='opendesk.update-notice.state.v1';
export const UPDATE_NOTICE_LOCK='opendesk:update-notice:state';
export const NOTICE_DAY_MS=24*60*60*1000;
export const NOTICE_CLAIM_MS=30000;
export const NOTICE_MAX_IMPRESSIONS=2;
const modeSet=new Set(['toast+inbox','inbox-only','silent']);
const statusSet=new Set(['available','pending_browser_apply','review_required','applied','unknown']);
const version=/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const id=/^[a-z][a-z0-9-]{1,39}$/;
const digest=/^[a-f0-9]{64}$/;
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const fail=(code='E_UPDATE_STATE')=>{throw Object.assign(new Error(code),{code});};
const finiteTime=value=>Number.isSafeInteger(value)&&value>=0;
export const defaultUpdateNoticeState=()=>({
  schema:UPDATE_NOTICE_SCHEMA,revision:0,globalMode:'toast+inbox',
  toolModes:{},records:{},lastToastAt:0,openRequestedAt:0
});
export function readUpdateNoticeState(value){
  if(value===undefined)return defaultUpdateNoticeState();
  if(!plain(value)||value.schema!==UPDATE_NOTICE_SCHEMA||
     !Number.isSafeInteger(value.revision)||value.revision<0||
     !modeSet.has(value.globalMode)||!plain(value.toolModes)||
     !plain(value.records)||Object.keys(value.records).length>128||
     !finiteTime(value.lastToastAt)||!finiteTime(value.openRequestedAt))
    fail('E_UPDATE_STATE_CORRUPT');
  for(const [toolId,mode] of Object.entries(value.toolModes))
    if(!id.test(toolId)||!modeSet.has(mode))fail('E_UPDATE_STATE_CORRUPT');
  for(const [key,row] of Object.entries(value.records))
    if(typeof key!=='string'||key.length>200||!plain(row)||row.key!==key||
       !statusSet.has(row.status)||!['sidebar-tool','browser'].includes(row.kind)||
       typeof row.id!=='string'||typeof row.version!=='string'||
       !finiteTime(row.discoveredAt)||!Number.isSafeInteger(row.impressionCount)||
       row.impressionCount<0||row.impressionCount>NOTICE_MAX_IMPRESSIONS||
       !['viewedAt','ignoredAt','dismissedAt','snoozeUntil'].every(field=>
         row[field]===null||finiteTime(row[field]))||
       (row.claim!==null&&(!plain(row.claim)||typeof row.claim.token!=='string'||
         !finiteTime(row.claim.expiresAt)||!finiteTime(row.claim.ackedAt)||
         !Number.isSafeInteger(row.claim.tabId)||row.claim.tabId<0||
         typeof row.claim.documentId!=='string')))
      fail('E_UPDATE_STATE_CORRUPT');
  return structuredClone(value);
}
export function trustedUpdateReleaseKey(release){
  if(!plain(release)||!id.test(release.id)||!version.test(release.version)||
     !digest.test(release.sha256))fail('E_UPDATE_CANDIDATE');
  return 'sidebar-tool:'+release.id+':'+release.version+':'+release.sha256;
}
export function browserUpdateReleaseKey(browserId,versionValue){
  if(typeof browserId!=='string'||!/^[a-p]{32}$/.test(browserId)||
     typeof versionValue!=='string'||!/^(?:0|[1-9]\d*)(?:\.(?:0|[1-9]\d*)){2,3}$/.test(versionValue))
    fail('E_UPDATE_BROWSER_IDENTITY');
  return 'browser:'+browserId+':'+versionValue;
}
export function appendTrustedRelease(previous,candidate,now){
  const state=readUpdateNoticeState(previous);
  if(!finiteTime(now)||!plain(candidate)||!statusSet.has(candidate.status)||
     !['sidebar-tool','browser'].includes(candidate.kind)||typeof candidate.id!=='string'||
     typeof candidate.version!=='string'||typeof candidate.key!=='string')
    fail('E_UPDATE_CANDIDATE');
  const validKey=candidate.kind==='sidebar-tool'?
    trustedUpdateReleaseKey({id:candidate.id,version:candidate.version,sha256:candidate.sha256}):
    browserUpdateReleaseKey(candidate.id,candidate.version);
  if(validKey!==candidate.key)fail('E_UPDATE_CANDIDATE');
  const existing=state.records[validKey];
  // Same version with changed bytes is a conflict, never a new impression budget.
  if(candidate.kind==='sidebar-tool'){
    for(const row of Object.values(state.records))if(row.kind==='sidebar-tool'&&
      row.id===candidate.id&&row.version===candidate.version&&row.key!==validKey&&
      row.status!=='unknown')fail('E_UPDATE_RELEASE_CONFLICT');
  }
  const row=existing?{...existing}:{key:validKey,kind:candidate.kind,id:candidate.id,
    version:candidate.version,discoveredAt:now,impressionCount:0,viewedAt:null,
    ignoredAt:null,dismissedAt:null,snoozeUntil:null,claim:null};
  row.status=candidate.status;
  row.title=String(candidate.title||candidate.id).slice(0,80);
  row.fromVersion=typeof candidate.fromVersion==='string'?candidate.fromVersion.slice(0,32):null;
  row.source=typeof candidate.source==='string'?candidate.source.slice(0,160):null;
  row.sha256=candidate.kind==='sidebar-tool'?candidate.sha256:null;
  row.newCapabilities=Array.isArray(candidate.newCapabilities)?
    candidate.newCapabilities.filter(item=>typeof item==='string').slice(0,40):[];
  row.requiresReview=candidate.requiresReview===true;
  if(candidate.status==='applied'||candidate.status==='unknown'){
    row.claim=null;
    if(candidate.status==='applied')row.dismissedAt??=now;
  }
  state.records[validKey]=row;
  // Keep the complete live inventory; retain a bounded amount of applied history.
  const keys=Object.keys(state.records);
  if(keys.length>96){
    for(const old of Object.values(state.records).filter(item=>item.status==='applied'||
      item.status==='unknown').sort((a,b)=>a.discoveredAt-b.discoveredAt).slice(0,keys.length-96))
      delete state.records[old.key];
  }
  state.revision++;
  return state;
}
export function setNoticePreference(previous,{mode,toolId=null},now){
  const state=readUpdateNoticeState(previous);
  if(!finiteTime(now)||!modeSet.has(mode))fail('E_UPDATE_PREFERENCE');
  if(toolId===null)state.globalMode=mode;
  else{
    if(!id.test(toolId))fail('E_UPDATE_PREFERENCE');
    state.toolModes[toolId]=mode;
  }
  state.revision++;
  return state;
}
export function effectiveNoticeMode(state,row){
  if(state.globalMode!=='toast+inbox')return state.globalMode;
  return row.kind==='sidebar-tool'?(state.toolModes[row.id]||state.globalMode):state.globalMode;
}
export function noticeEligible(state,row,now){
  if(!finiteTime(now)||!['available','review_required'].includes(row.status)||
     row.ignoredAt!==null||row.viewedAt!==null||row.dismissedAt!==null||
     effectiveNoticeMode(state,row)!=='toast+inbox'||row.impressionCount>=NOTICE_MAX_IMPRESSIONS)
    return false;
  if(row.claim&&row.claim.expiresAt>now)return false;
  // The second impression is permitted ONLY after the explicit first snooze.
  if(row.snoozeUntil!==null&&row.snoozeUntil>now)return false;
  if(row.impressionCount===1&&!row.snoozeUntil)return false;
  return true;
}
export function claimUpdateToast(previous,{now,tabId,documentId,token}){
  const state=readUpdateNoticeState(previous);
  if(!finiteTime(now)||!Number.isSafeInteger(tabId)||tabId<0||
     typeof documentId!=='string'||documentId.length<12||
     typeof token!=='string'||!/^claim-[a-f0-9-]{24,60}$/.test(token))
    fail('E_UPDATE_CLAIM');
  // The single Worker serializes all claims under a shared Web Lock.
  if(Object.values(state.records).some(row=>row.claim?.expiresAt>now))return null;
  if(state.lastToastAt>0&&now-state.lastToastAt<NOTICE_DAY_MS)return null;
  const eligible=Object.values(state.records).filter(row=>noticeEligible(state,row,now));
  if(!eligible.length)return null;
  const releaseKeys=eligible.slice(0,16).map(row=>row.key);
  for(const key of releaseKeys)state.records[key].claim={
    token,tabId,documentId,expiresAt:now+NOTICE_CLAIM_MS,ackedAt:0};
  state.revision++;
  return {state,claim:{token,tabId,documentId,releaseKeys,
    count:eligible.length,label:eligible.length===1?eligible[0].title:
      String(eligible.length)+' 项扩展',message:eligible.length===1?
      eligible[0].title+' 有新版本':String(eligible.length)+' 项扩展有更新'}};
}
export function acknowledgeUpdateToast(previous,{now,token,tabId,documentId}){
  const state=readUpdateNoticeState(previous);
  if(!finiteTime(now))fail('E_UPDATE_ACK');
  const rows=Object.values(state.records).filter(row=>row.claim?.token===token&&
    row.claim.tabId===tabId&&row.claim.documentId===documentId&&
    row.claim.expiresAt>now);
  if(!rows.length)return null;
  if(rows.some(row=>row.claim.ackedAt!==0))return {state,duplicate:true};
  for(const row of rows){
    row.impressionCount++;
    if(row.impressionCount===1)row.snoozeUntil=null; // First actual display consumes an earlier inbox-only deferral.
    row.claim.ackedAt=now;
  }
  state.lastToastAt=now;
  state.revision++;
  return {state,duplicate:false};
}
export function actOnUpdateToast(previous,{now,action,token,tabId=null,documentId=null,key=null}){
  const state=readUpdateNoticeState(previous);
  if(!finiteTime(now)||!['close','timeout','snooze','view','ignore'].includes(action))
    fail('E_UPDATE_ACTION');
  let rows;
  if(token!==null&&token!==undefined){
    rows=Object.values(state.records).filter(row=>row.claim?.token===token&&
      row.claim.tabId===tabId&&row.claim.documentId===documentId&&row.claim.ackedAt>0);
    if(!rows.length)return null;
  }else{
    if(typeof key!=='string'||!state.records[key])return null;
    rows=[state.records[key]];
  }
  for(const row of rows){
    if(action==='snooze'){
      if(row.impressionCount<NOTICE_MAX_IMPRESSIONS&&row.snoozeUntil===null&&
         row.ignoredAt===null&&row.viewedAt===null)
        row.snoozeUntil=now+NOTICE_DAY_MS;
      else row.dismissedAt=now;
    }else if(action==='view')row.viewedAt=now;
    else if(action==='ignore')row.ignoredAt=now;
    else row.dismissedAt=now;
    row.claim=null;
  }
  if(action==='view')state.openRequestedAt=now;
  state.revision++;
  return state;
}
export function updateNoticeSnapshot(state){
  const valid=readUpdateNoticeState(state);
  const records=Object.values(valid.records).sort((a,b)=>b.discoveredAt-a.discoveredAt)
    .map(({claim,...row})=>({...row})); // Never send private claim tokens to the UI.
  return {revision:valid.revision,globalMode:valid.globalMode,toolModes:valid.toolModes,
    records,openRequestedAt:valid.openRequestedAt,
    newCount:records.filter(row=>['available','review_required','pending_browser_apply'].includes(row.status)&&
      row.ignoredAt===null&&row.viewedAt===null).length};
}
