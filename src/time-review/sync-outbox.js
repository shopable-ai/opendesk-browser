// R1.4: privacy-limited, account-scoped durable daily upsert preparation.
// This is NOT a network uploader. Until an authenticated HTTPS server's atomic
// revision/upsert contract is verified, the trusted Host must not send records.
export const REVIEW_SYNC_PROTOCOL='opendesk.time-review.sync.v1';
export const MAX_REVIEW_SYNC_RECORDS=1000;
export const REVIEW_SYNC_MAX_FAILURES=12;
const DAY=/^\d{4}-\d{2}-\d{2}$/;
const HEX64=/^[a-f0-9]{64}$/;
const UUID=/^[a-f0-9-]{36}$/;
const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
const validDay=day=>typeof day==='string'&&DAY.test(day)&&!Number.isNaN(Date.parse(day+'T12:00:00'));
const validHost=host=>{
  if(typeof host!=='string'||!host||host.length>253)return false;
  try{const url=new URL('https://'+host+'/');return url.hostname===host&&!url.username&&!url.password&&url.port==='';}catch{return false;}
};
const validMs=ms=>Number.isSafeInteger(ms)&&ms>=0&&ms<=86400000;
const validCategory=category=>Number.isInteger(category)&&category>=0&&category<=5;
const dayAt=at=>{const d=new Date(at);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');};
const requireMs=at=>{if(!Number.isSafeInteger(at)||at<0)fail('E_SYNC_DATA','时间戳无效');};
const stableId=async(seed,date,host)=>{
  const bytes=new TextEncoder().encode(REVIEW_SYNC_PROTOCOL+'\0'+seed+'\0'+date+'\0'+host);
  const hash=await crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(hash),byte=>byte.toString(16).padStart(2,'0')).join('');
};

/** Validate untrusted on-disk state before it may become an HTTP payload. */
export function validateReviewSync(value){
  if(value===undefined)return null;
  if(!value||value.version!==1||value.mode!=='prepared-local-only'||!UUID.test(value.seed)||
    !HEX64.test(value.scope)||!validDay(value.sinceDay)||!Number.isSafeInteger(value.consentAt)||value.consentAt<0||
    typeof value.overflow!=='boolean'||!value.baselineToday||typeof value.baselineToday!=='object'||Array.isArray(value.baselineToday)||
    !value.records||typeof value.records!=='object'||Array.isArray(value.records)||
    Object.keys(value.records).length>MAX_REVIEW_SYNC_RECORDS||Object.keys(value.baselineToday).length>500)
    fail('E_SYNC_DATA','同步准备记录无效，已停止处理');
  for(const [host,ms] of Object.entries(value.baselineToday))if(!validHost(host)||!validMs(ms))
    fail('E_SYNC_DATA','同步授权时的基线无效');
  for(const [key,r] of Object.entries(value.records)){
    if(!HEX64.test(key)||!r||r.id!==key||!validDay(r.date)||r.date<value.sinceDay||!validHost(r.host)||
      !validMs(r.ms)||!validCategory(r.category)||!Number.isSafeInteger(r.revision)||r.revision<1||
      !Number.isSafeInteger(r.ackedRevision)||r.ackedRevision<0||r.ackedRevision>r.revision||
      !Number.isInteger(r.failures)||r.failures<0||r.failures>REVIEW_SYNC_MAX_FAILURES||
      !Number.isSafeInteger(r.nextAttemptAt)||r.nextAttemptAt<0)
      fail('E_SYNC_DATA','同步条目结构损坏，拒绝发送');
  }
  return value;
}

/** Explicit local preparation; cannot authorize a network upload. */
export function beginReviewSync(state,{at,scope,seed}={}){
  requireMs(at);
  if(!HEX64.test(scope)||!UUID.test(seed))fail('E_SYNC_AUTH','账户范围或随机设备标识无效');
  if(state.sync!==undefined)fail('E_SYNC_ALREADY_PREPARED','先停止既有连接并确认待发送队列去向');
  const sinceDay=dayAt(at),baselineToday={};
  for(const [host,ms] of Object.entries(state.days?.[sinceDay]||{})){
    if(!validHost(host)||!validMs(ms))fail('E_SYNC_DATA','计时基线无效');
    Object.defineProperty(baselineToday,host,{value:ms,enumerable:true,writable:true,configurable:true});
  }
  state.sync={version:1,mode:'prepared-local-only',seed,scope,sinceDay,consentAt:at,
    baselineToday,records:{},overflow:false};
  return state.sync;
}

/** Persist this in the SAME verified Chrome local write as the counted time. */
export async function stageReviewSync(state){
  const sync=validateReviewSync(state.sync);
  if(!sync)return {staged:0,blocked:false};
  let staged=0;
  for(const [date,sites] of Object.entries(state.days||{}).sort(([a],[b])=>a.localeCompare(b))){
    if(date<sync.sinceDay)continue; // NEVER backfill historical days
    for(const [host,total] of Object.entries(sites).sort(([a],[b])=>a.localeCompare(b))){
      if(!validDay(date)||!validHost(host)||!validMs(total))fail('E_SYNC_DATA','待同步源计时损坏');
      const base=date===sync.sinceDay?(Object.hasOwn(sync.baselineToday,host)?sync.baselineToday[host]:0):0;
      const ms=Math.max(0,total-base); // never reconstruct old visits
      if(!ms)continue;
      const category=Object.hasOwn(state.categories||{},host)?state.categories[host]:0;
      if(!validCategory(category))fail('E_SYNC_DATA','待同步分类损坏');
      const id=await stableId(sync.seed,date,host),existing=sync.records[id];
      if(existing){
        if(existing.date!==date||existing.host!==host)fail('E_SYNC_COLLISION','同步 ID 冲突');
        if(existing.ms!==ms||existing.category!==category){
          existing.ms=ms;existing.category=category;existing.revision++;
          existing.failures=0;existing.nextAttemptAt=0;staged++;
        }
      }else if(Object.keys(sync.records).length<MAX_REVIEW_SYNC_RECORDS){
        sync.records[id]={id,date,host,ms,category,revision:1,ackedRevision:0,failures:0,nextAttemptAt:0};staged++;
      }else sync.overflow=true; // fail closed; do not silently evict unsent data
    }
  }
  return {staged,blocked:sync.overflow};
}

export function reviewSyncStatus(state){
  const sync=validateReviewSync(state.sync);
  if(!sync)return {mode:'off',pending:0,overflow:false,networkEnabled:false};
  return {mode:sync.mode,pending:Object.values(sync.records).filter(row=>row.revision>row.ackedRevision).length,
    overflow:sync.overflow,networkEnabled:false};
}
export function pendingReviewSync(state,at,{limit=20}={}){
  requireMs(at);
  if(!Number.isInteger(limit)||limit<1||limit>100)fail('E_SYNC_DATA','批量大小无效');
  const sync=validateReviewSync(state.sync);
  if(!sync)return [];
  return Object.values(sync.records).filter(r=>r.revision>r.ackedRevision&&r.failures<REVIEW_SYNC_MAX_FAILURES&&r.nextAttemptAt<=at)
    .sort((a,b)=>a.date.localeCompare(b.date)||a.host.localeCompare(b.host)).slice(0,limit)
    .map(({id,date,host,ms,category,revision})=>({protocol:REVIEW_SYNC_PROTOCOL,scope:sync.scope,id,date,host,ms,category,revision}));
}

/** A client must demand this exact ACK from a server BEFORE marking durable success. */
export function acknowledgeReviewSync(state,receipt){
  const sync=validateReviewSync(state.sync);
  if(!sync||!receipt||receipt.protocol!==REVIEW_SYNC_PROTOCOL||receipt.scope!==sync.scope||
    receipt.accepted!==true||!HEX64.test(receipt.id)||!Number.isSafeInteger(receipt.revision))
    fail('E_SYNC_ACK','服务端确认格式无效，保持待发送');
  const record=sync.records[receipt.id];
  if(!record||receipt.revision<1||receipt.revision>record.revision)
    fail('E_SYNC_ACK','服务端确认指向未知或未来修订');
  record.ackedRevision=Math.max(record.ackedRevision,receipt.revision);
  if(record.ackedRevision===record.revision){record.failures=0;record.nextAttemptAt=0;}
  return record.ackedRevision===record.revision;
}

/** Unknown/lost ACK never changes ackedRevision: retry is only safe with PUT upsert. */
export function failReviewSyncAttempt(state,id,revision,at){
  requireMs(at);
  const sync=validateReviewSync(state.sync),record=sync?.records?.[id];
  if(!record||record.revision!==revision)return false;
  record.failures=Math.min(REVIEW_SYNC_MAX_FAILURES,record.failures+1);
  record.nextAttemptAt=at+Math.min(3600000,30000*2**(record.failures-1));
  return true;
}

/** Explicit disconnect: discard local queued records; remote deletion is NOT implied. */
export function stopReviewSync(state,{confirmDiscard=false}={}){
  const pending=reviewSyncStatus(state).pending;
  if(pending&&!confirmDiscard)fail('E_SYNC_UNSENT','还有待发送记录；需要明确确认丢弃');
  delete state.sync;
  return {discardedPending:pending,remoteDataDeleted:false};
}

/** Canonical payload, WITHOUT URL/title/token/cookies, for a verified future HTTPS adapter. */
export function dailyReviewUpsertPayload(record){
  if(!record||record.protocol!==REVIEW_SYNC_PROTOCOL||!HEX64.test(record.scope)||!HEX64.test(record.id)||
    !validDay(record.date)||!validHost(record.host)||!validMs(record.ms)||!validCategory(record.category)||
    !Number.isSafeInteger(record.revision)||record.revision<1)
    fail('E_SYNC_DATA','禁止发送非规范时间记录');
  return {protocol:REVIEW_SYNC_PROTOCOL,scope:record.scope,id:record.id,revision:record.revision,
    date:record.date,host:record.host,ms:record.ms,category:record.category};
}
