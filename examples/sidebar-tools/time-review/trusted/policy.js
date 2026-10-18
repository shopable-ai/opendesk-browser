export const TIME_REVIEW_ID='time-review';
export const TIME_REVIEW_PROTOCOL='opendesk.time-review.v1';
export const TIME_REVIEW_CAPABILITY='time.review';
export const TIME_REVIEW_ALARM='opendesk.time-review.heartbeat.v1';
export const TIME_REVIEW_SESSION='opendesk.time-review.session.v1';
export const TIME_REVIEW_OPERATIONS=Object.freeze(['time.status','time.start','time.pause','time.revoke','time.settings','time.clear','time.export','time.classify','time.day','time.minuteConsent','time.siteGrant']);
export async function timeReviewPackageHash(tool){
  const bytes=new TextEncoder().encode(JSON.stringify(['format','id','version','title','description','capabilities','html','css','js'].map(key=>tool[key])));
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
}

export const TIME_REVIEW_HOST_API='time.review/1.5.0';
export const TIME_REVIEW_MAX_SITE_GRANTS=64;
// Website authorization is independent of Chrome's manifest-wide origins.
export function timeReviewSiteOrigin(value){
  try{
    const url=new URL(value);
    return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password&&url.hostname&&url.hostname.length<=253
      ?url.origin:null;
  }catch{return null;}
}
function siteError(message){throw Object.assign(new Error(message),{code:'E_TIME_SITE_GRANT'});}
export function requireTimeReviewSiteGrants(value){
  if(value===undefined)return {allSites:false,origins:[]}; // legacy v1 is deny by default
  if(!value||typeof value!=='object'||Array.isArray(value)||
    Object.keys(value).sort().join(',')!=='allSites,origins'||
    typeof value.allSites!=='boolean'||!Array.isArray(value.origins)||
    value.origins.length>TIME_REVIEW_MAX_SITE_GRANTS||value.allSites&&value.origins.length||
    new Set(value.origins).size!==value.origins.length||
    value.origins.some(origin=>typeof origin!=='string'||timeReviewSiteOrigin(origin)!==origin))
    siteError('Time Review 的独立网站授权记录无效；已拒绝采集');
  return {allSites:value.allSites,origins:[...value.origins]};
}
export function timeReviewSiteGranted(value,url){
  const origin=timeReviewSiteOrigin(url);
  if(!origin)return false;
  const grants=requireTimeReviewSiteGrants(value);
  return grants.allSites||grants.origins.includes(origin);
}
export function changeTimeReviewSiteGrants(value,payload){
  const prior=requireTimeReviewSiteGrants(value);
  if(payload?.mode==='all'&&Object.keys(payload).sort().join(',')==='enabled,mode'&&
    typeof payload.enabled==='boolean')
    return {allSites:payload.enabled,origins:[]};
  if(payload?.mode!=='site'||Object.keys(payload||{}).sort().join(',')!=='allow,mode,origin'||
    typeof payload.allow!=='boolean'||typeof payload.origin!=='string'||
    timeReviewSiteOrigin(payload.origin)!==payload.origin)
    siteError('必须明确选择一个普通 HTTP(S) 网站或全部普通网站');
  if(prior.allSites)siteError('请先撤销全部网站授权，再单独管理指定网站');
  const origins=payload.allow?[...new Set([...prior.origins,payload.origin])]:
    prior.origins.filter(row=>row!==payload.origin);
  if(origins.length>TIME_REVIEW_MAX_SITE_GRANTS)siteError('最多单独授权 64 个网站');
  return {allSites:false,origins};
}
