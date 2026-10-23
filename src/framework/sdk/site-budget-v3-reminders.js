// Generic finite time-threshold dedupe. Product code selects thresholds in
// its declarative policy. This has NO Chrome, SW, Host or app dependencies.
// Caller must persist the returned record BEFORE attempting a page notice.
const poolPattern=/^(?:g:[a-z][a-z0-9-]{0,23}|s:[a-z0-9.-]{1,253})$/;
const fail=()=>{throw Object.assign(new Error('受管提醒去重账本无效'),
  {code:'E_SITE_BUDGET_V3_NOTICES'});};
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&
  [Object.prototype,null].includes(Object.getPrototypeOf(v));
export function normalizeManagedSiteV3Notices(raw,day){
  if(typeof day!=='string'||!/^\d{4}-\d\d-\d\d$/.test(day))fail();
  if(raw===undefined)return {day,pools:{}};
  if(!plain(raw)||Object.keys(raw).sort().join(',')!=='day,pools'||
     typeof raw.day!=='string'||!/^\d{4}-\d\d-\d\d$/.test(raw.day)||
     !plain(raw.pools)||Object.keys(raw.pools).length>80)fail();
  const pools={};
  for(const [pool,item] of Object.entries(raw.pools)){
    if(!poolPattern.test(pool)||!plain(item)||
       Object.keys(item).sort().join(',')!=='limitMs,thresholds'||
       !Number.isSafeInteger(item.limitMs)||item.limitMs<60000||item.limitMs>86400000||
       !Array.isArray(item.thresholds)||item.thresholds.length>8||
       item.thresholds.some(min=>!Number.isInteger(min)||min<1||min>120)||
       new Set(item.thresholds).size!==item.thresholds.length)fail();
    pools[pool]={limitMs:item.limitMs,thresholds:[...item.thresholds]};
  }
  return {day:raw.day,pools};
}
export function nextManagedSiteV3Reminder({policy,previousUsage,currentUsage,site,record,day}){
  const normalized=normalizeManagedSiteV3Notices(record,day);
  if(normalized.day!==day)return {notices:{day,pools:{}},reminder:null};
  if(!policy?.enabled||!site?.enabled||!Array.isArray(policy.reminderMinutes)||
     !policy.reminderMinutes.length)return {notices:normalized,reminder:null};
  const condition=site.conditions?.find(row=>row.type==='counter-limit');
  if(!condition)return {notices:normalized,reminder:null};
  const pool=site.pool,limitMs=condition.limitMs;
  if(!poolPattern.test(pool)||!Number.isSafeInteger(limitMs))fail();
  const before=previousUsage?.[pool]??0,after=currentUsage?.[pool]??0;
  if(!Number.isSafeInteger(before)||!Number.isSafeInteger(after)||
     before<0||after<0||after<=before)return {notices:normalized,reminder:null};
  const previous=normalized.pools[pool];
  const seen=previous?.limitMs===limitMs?[...previous.thresholds]:[];
  const crossed=policy.reminderMinutes.filter(min=>
    limitMs>min*60000&&limitMs-before>min*60000&&
    limitMs-after<=min*60000&&limitMs-after>0&&!seen.includes(min));
  if(!crossed.length)return {notices:normalized,reminder:null};
  const pools={...normalized.pools,[pool]:{limitMs,
    thresholds:[...seen,...crossed]}};
  // Finite policy may introduce at most 80 pools. Never evict other owners'
  // records behind their backs; stop rather than losing dedupe provenance.
  if(Object.keys(pools).length>80)fail();
  return {notices:{day,pools},
    reminder:{minutes:Math.min(...crossed),pool,day}};
}
