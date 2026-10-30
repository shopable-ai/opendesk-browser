// Business-only migration at the original installed-tool storage boundary.
// This module never calls the Cookie SDK or infers that a website is logged in.
import {validateScopeKey,normalizeCookieScope,cookieScopesOverlap} from './session-context.js';
export const COOKIE_JOURNAL_KEY='aiVipCookieDeliveryR137';
const MAX_BYTES=8192;
const STATES=new Set(['success','partial','failed','unknown']);
const CODES=new Set(['E_OUTCOME_UNKNOWN','E_COOKIE_CONFLICT','E_COOKIE_SCOPE','E_COOKIE_STORE',
  'E_COOKIE_PARTITION','E_CHROME_UNSUPPORTED','E_CHROME_PERMISSION_REQUIRED','E_SITE_GRANT_REQUIRED',
  'E_GRANT_REVOKED','E_TOOL_CHANGED','E_TOOL_DISABLED','E_OWNER','E_CONTEXT','E_PERMISSION','E_SCHEMA','E_LIMIT']);
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&
  [Object.prototype,null].includes(Object.getPrototypeOf(v));
const exact=(v,keys)=>plain(v)&&Object.keys(v).every(k=>keys.includes(k));
const text=(v,max=120)=>typeof v==='string'&&v.trim()===v&&v.length>0&&v.length<=max&&
  !/[\x00-\x1f\x7f]/.test(v);
const date=v=>Number.isSafeInteger(v)&&v>=946684800000&&v<=4102444800000;
const copy=v=>JSON.parse(JSON.stringify(v));
function fail(code='E_COOKIE_STORAGE') {throw Object.assign(new Error(code),{code});}
function bounded(value){
  if(new TextEncoder().encode(JSON.stringify(value)).length>MAX_BYTES)fail('E_COOKIE_LIMIT');
  return value;
}
function target(value,originOnly=false){
  if(!text(value,2048))return false;
  try{
    const u=new URL(value);
    return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password&&!u.search&&!u.hash&&
      (originOnly?u.origin===value:u.href===value);
  }catch{return false;}
}

/** Preserve the old whitelist, including per-item facts and unscoped seen[]. */
export function validateLegacyCookieRecord(value){
  if(value===null)return null;
  if(!exact(value,['schemaVersion','deliveryId','attemptId','accountId','serviceOrigin','targetUrl',
    'state','count','results','seen','sharedAccountId','scope'])||value.schemaVersion!==1||
    !['deliveryId','attemptId','accountId'].every(k=>text(value[k]))||
    !target(value.serviceOrigin,true)||!target(value.targetUrl)||!STATES.has(value.state)||
    !Number.isInteger(value.count)||value.count<1||value.count>50||
    (value.sharedAccountId!==undefined&&(!text(value.sharedAccountId)||
      typeof value.scope!=='string'||value.scope.length>16000))||
    (value.scope!==undefined&&typeof value.scope!=='string')||
    !Array.isArray(value.results)||value.results.length>value.count||
    value.results.some((r,i)=>!exact(r,['index','saved','verified','code'])||r.index!==i||
      typeof r.saved!=='boolean'||typeof r.verified!=='boolean'||(r.verified&&!r.saved)||
      (r.code!==undefined&&!CODES.has(r.code)))||
    !Array.isArray(value.seen)||value.seen.length>50||value.seen.some(r=>
      !exact(r,['deliveryId','expiresAt'])||!text(r.deliveryId)||!date(r.expiresAt)))fail();
  // The legacy scope is a JSON tuple list; do not carry arbitrary strings that
  // could hide a payload into the new non-secret recovery container.
  if(value.scope!==undefined){
    let slots;
    try{slots=JSON.parse(value.scope);}catch{fail();}
    if(!Array.isArray(slots)||slots.length<1||slots.length>50||slots.some(s=>
      !Array.isArray(s)||s.length!==3||!text(s[0],256)||!text(s[1],512)||
      !s[1].startsWith('/')||typeof s[2]!=='string'||s[2].length>253))fail();
  }
  return bounded(copy(value));
}

function attributionFor(record,mappings){
  if(!Array.isArray(mappings))fail('E_COOKIE_MAPPING');
  const candidates=mappings.map(m=>{
    if(!exact(m,['sourceId','siteId','serviceOrigin','targetUrl','accountId','sharedAccountId'])||
      !['sourceId','siteId','accountId'].every(k=>text(m[k]))||
      !target(m.serviceOrigin,true)||!target(m.targetUrl)||
      (m.sharedAccountId!==undefined&&!text(m.sharedAccountId)))fail('E_COOKIE_MAPPING');
    return m;
  }).filter(m=>m.serviceOrigin===record.serviceOrigin&&m.targetUrl===record.targetUrl&&
    m.accountId===record.accountId&&m.sharedAccountId===record.sharedAccountId);
  // Even duplicate approved declarations are ambiguous. Never pick the first.
  return candidates.length===1?{sourceId:candidates[0].sourceId,siteId:candidates[0].siteId}:null;
}

/** Pure projection: an attributable header does not attribute historical seen IDs. */
export function planCookieJournalMigration(value,mappings=[]){
  const record=validateLegacyCookieRecord(value);
  return bounded({schemaVersion:2,legacy:{record,
    attribution:record?attributionFor(record,mappings):null},attempts:[]});
}

export function validateMigratedCookieJournal(value){
  if(!exact(value,['schemaVersion','legacy','attempts'])||value.schemaVersion!==2||
    !exact(value.legacy,['record','attribution'])||!Object.hasOwn(value.legacy,'record')||
    !Object.hasOwn(value.legacy,'attribution')||!Array.isArray(value.attempts))fail();
  const record=validateLegacyCookieRecord(value.legacy.record),a=value.legacy.attribution;
  if(a!==null&&(!record||!exact(a,['sourceId','siteId'])||!text(a.sourceId)||!text(a.siteId)))fail();
  const attempts=value.attempts.map(validateCookieAttempt),seen=new Set();
  for(const row of attempts){
    const key=JSON.stringify([row.scopeKey,row.attemptId]);
    if(seen.has(key))fail();
    seen.add(key);
  }
  return bounded({schemaVersion:2,legacy:{record,attribution:a===null?null:copy(a)},attempts});
}

function validateCookieAttempt(row){
  if(!exact(row,['scopeKey','attemptId','requestId','deliveryId','policyVersion','payloadHash',
    'expiresAt','count','slots','state','resolution','results'])||
    !['attemptId','requestId','deliveryId','policyVersion'].every(k=>text(row[k]))||
    typeof row.payloadHash!=='string'||! /^[a-f0-9]{64}$/.test(row.payloadHash)||!date(row.expiresAt)||
    !Number.isInteger(row.count)||row.count<1||row.count>50||
    !Array.isArray(row.slots)||row.slots.length!==row.count||
    !Array.isArray(row.results)||row.results.length>row.count||!STATES.has(row.state))fail();
  try{validateScopeKey(row.scopeKey);}catch{fail();}
  const targetHost=new URL(JSON.parse(row.scopeKey)[6]).hostname,slotKeys=new Set();
  for(const slot of row.slots){
    if(!exact(slot,['name','domain','hostOnly','path','storeId','partitionKey'])||
      Object.keys(slot).length!==6)fail();
    const normalized=normalizeCookieScope(slot);
    // Current tool policy is target-host-only. Parent-domain SSO is not added here.
    if(!normalized||normalized.domain!==targetHost)fail();
    const key=JSON.stringify([normalized.name,normalized.domain,normalized.path,
      normalized.storeId,normalized.partition]);
    if(slotKeys.has(key))fail();slotKeys.add(key);
  }
  const results=row.results;
  if(results.some((r,i)=>!exact(r,['index','saved','verified','code'])||r.index!==i||
    typeof r.saved!=='boolean'||typeof r.verified!=='boolean'||(r.verified&&!r.saved)||
    (r.code!==undefined&&(!CODES.has(r.code)||r.verified))))fail();
  if(row.resolution==='pending'){
    if(row.state!=='unknown'||results.length)fail();
  }else if(row.resolution==='not-submitted'){
    if(row.state!=='failed'||results.length)fail();
  }else if(row.resolution==='receipt'){
    const saved=results.filter(r=>r.saved).length,verified=results.filter(r=>r.verified).length;
    if(results.length<1||results.some((r,i)=>!r.verified&&i!==results.length-1)||
      results.some(r=>!r.saved&&r.code===undefined))fail();
    const state=results.some(r=>r.code==='E_OUTCOME_UNKNOWN'||r.saved&&!r.verified)?'unknown':
      verified===row.count?'success':saved>0?'partial':'failed';
    if(row.state!==state)fail();
  }else fail();
  return copy(row);
}

/** No expiry-based pruning: unknown effects and scoped replay evidence survive reopen. */
export function planCookieAttempt(value,candidate){
  const journal=validateMigratedCookieJournal(value),row=validateCookieAttempt(candidate);
  if(row.resolution!=='pending')fail('E_COOKIE_MARKER');
  const barrier=legacyCookieBarrier(journal,row.deliveryId);
  if(barrier)fail(barrier);
  if(journal.legacy.record?.state==='success'&&legacyMayOverlap(journal.legacy.record,row))
    fail('E_COOKIE_LEGACY_SCOPE_UNPROVEN');
  if(journal.attempts.some(r=>['unknown','partial'].includes(r.state)))fail('E_COOKIE_UNRESOLVED');
  const intent=r=>canonical([r.scopeKey,r.deliveryId,r.requestId,r.policyVersion,r.payloadHash,
    r.expiresAt,r.count,r.slots]);
  if(journal.attempts.some(r=>r.scopeKey===row.scopeKey&&(r.attemptId===row.attemptId||
    ((r.deliveryId===row.deliveryId||r.requestId===row.requestId)&&
      !(r.resolution==='not-submitted'&&intent(r)===intent(row))))))
    fail('E_COOKIE_REPLAY');
  // A new login may replace an approved scope, but cannot leave half of an old
  // login behind by changing the Cookie slot list. The original Host still
  // confirms every exact payload; this check never supplies approval itself.
  const slotKey=s=>canonical(normalizeCookieScope(s));
  for(const previous of journal.attempts){
    if(previous.state==='failed')continue; // A validated failed receipt establishes zero saves.
    if(attemptsMayShareSession(previous,row)&&
      previous.slots.some(old=>!row.slots.some(next=>slotKey(old)===slotKey(next))))
      fail('E_COOKIE_SCOPE');
  }
  const next=bounded({...journal,attempts:[...journal.attempts,row]});
  // A confirmed marker must leave enough room for ANY legal final item receipt.
  // Reserve capacity before setMany, never prune history after effects occur.
  const verified=Array.from({length:row.count-1},(_,index)=>({index,saved:true,verified:true}));
  const longest=[...CODES].sort((a,b)=>b.length-a.length)[0];
  for(const saved of [true,false]){
    const results=[...verified,{index:row.count-1,saved,verified:false,code:longest}];
    const outcome=receiptOutcome({saved:row.count-1+Number(saved),verified:row.count-1,
      stopped:true,results},row.count);
    bounded({...journal,attempts:[...journal.attempts,{...row,...outcome}]});
  }
  return next;
}

function legacyMayOverlap(legacy,row){
  // v1 did not bind Store/Partition. For its target-own-host policy, distinct
  // unrelated hosts are disjoint; related hosts cannot prove safe replacement.
  const a=new URL(legacy.targetUrl).hostname,b=new URL(JSON.parse(row.scopeKey)[6]).hostname;
  return a===b||a.endsWith('.'+b)||b.endsWith('.'+a);
}

function attemptsMayShareSession(previous,row){
  const a=JSON.parse(previous.scopeKey),b=JSON.parse(row.scopeKey);
  const sameSite=a[2]===b[2]&&new URL(a[6]).hostname===new URL(b[6]).hostname;
  return previous.slots.some(old=>row.slots.some(next=>
    cookieScopesOverlap({...old,name:'scope'},{...next,name:'scope'})||
    (sameSite&&cookieScopesOverlap({...old,name:'scope',path:'/'},{...next,name:'scope',path:'/'}))));
}

/** Conservative metadata for the original UI/handler's replacement checks.
 * This is not a second confirmation or permission grant. Unknown legacy Store/
 * Partition cannot establish disjointness; no Cookie read/values permission is added.
 */
export function cookieAttemptConflicts(value,candidate){
  const journal=validateMigratedCookieJournal(value),row=validateCookieAttempt(candidate);
  const conflicts=journal.attempts.filter(previous=>
    previous.state!=='failed'&&attemptsMayShareSession(previous,row))
    .map(previous=>({scopeKey:previous.scopeKey,attemptId:previous.attemptId,state:previous.state}));
  if(journal.legacy.record&&journal.legacy.record.state!=='failed'&&legacyMayOverlap(journal.legacy.record,row))
    conflicts.push({legacy:true,state:journal.legacy.record.state,scopeKnown:false});
  return conflicts;
}

function receiptOutcome(value,count){
  if(!exact(value,['saved','verified','results','stopped'])||!Array.isArray(value.results)||
    value.results.length<1||value.results.length>count||
    (value.stopped!==undefined&&value.stopped!==true)||value.results.some((r,i)=>
      !exact(r,['index','saved','verified','code'])||r.index!==i||typeof r.saved!=='boolean'||
      typeof r.verified!=='boolean'||(r.verified&&!r.saved)||(!r.saved&&r.code===undefined)||
      (r.code!==undefined&&(!CODES.has(r.code)||r.verified))||(!r.verified&&i!==value.results.length-1))||
    value.saved!==value.results.filter(r=>r.saved).length||
    value.verified!==value.results.filter(r=>r.verified).length||
    ((value.results.length<count||value.results.some(r=>!r.verified))&&value.stopped!==true))
    fail('E_COOKIE_RECEIPT');
  return {resolution:'receipt',results:copy(value.results),state:
    value.results.some(r=>r.code==='E_OUTCOME_UNKNOWN'||r.saved&&!r.verified)?'unknown':
      value.verified===count?'success':value.saved>0?'partial':'failed'};
}

/** Reference the submitted attempt, never the UI's current site/selection. */
export function planCookieReceipt(value,reference,outcome){
  const journal=validateMigratedCookieJournal(value);
  if(!exact(reference,['scopeKey','attemptId'])||!text(reference.attemptId))fail('E_COOKIE_MARKER');
  const index=journal.attempts.findIndex(r=>r.scopeKey===reference.scopeKey&&r.attemptId===reference.attemptId);
  if(index<0)fail('E_COOKIE_MARKER');
  const record=journal.attempts[index];
  let settled;
  if(exact(outcome,['notInvoked'])&&Object.keys(outcome).length===1&&outcome.notInvoked===true){
    // Internal controller fact ONLY while its setMany call has not begun.
    // Never derive this from an SDK timeout, closure, or generic cancellation.
    settled={resolution:'not-submitted',state:'failed',results:[]};
  }else if(exact(outcome,['errorCode'])&&Object.keys(outcome).length===1){
    // Only the trusted pre-dispatch code establishes cancellation without effects.
    // Generic cancellation/closure/timeout remains the original unknown marker.
    if(outcome.errorCode!=='E_COOKIE_NOT_SUBMITTED')return journal;
    settled={resolution:'not-submitted',state:'failed',results:[]};
  }else if(exact(outcome,['receipt'])&&Object.keys(outcome).length===1){
    settled=receiptOutcome(outcome.receipt,record.count);
  }else fail('E_COOKIE_RECEIPT');
  const next={...record,...settled};
  if(record.resolution!=='pending'){
    if(canonical(next)!==canonical(record))fail('E_COOKIE_RECEIPT_CONFLICT');
    return journal;
  }
  const attempts=[...journal.attempts];attempts[index]=validateCookieAttempt(next);
  return bounded({...journal,attempts});
}

/** Independent of time, selection, current account, and apparent website login. */
export function legacyCookieBarrier(value,deliveryId){
  const {legacy:{record,attribution}}=validateMigratedCookieJournal(value);
  if(!record)return null;
  const fullSuccess=record.results.length===record.count&&record.results.every(r=>
    r.saved&&r.verified&&r.code===undefined);
  // Preserve inconsistent old facts verbatim, but do not trust the state label
  // to release a lock when item evidence is missing or contradicts it.
  if(['unknown','partial'].includes(record.state)||
    record.results.some(r=>r.saved&&!r.verified||r.code==='E_OUTCOME_UNKNOWN')||
    (record.state==='success'&&!fullSuccess)||
    (record.state==='failed'&&record.results.some(r=>r.saved)))return 'E_COOKIE_UNRESOLVED';
  if(!attribution)return 'E_COOKIE_LEGACY_UNATTRIBUTED';
  // Old seen IDs have no site/source. Keep a compatibility replay barrier,
  // including expired IDs: this module never silently prunes old evidence.
  if(record.deliveryId===deliveryId||record.seen.some(r=>r.deliveryId===deliveryId))
    return 'E_COOKIE_REPLAY';
  return null;
}

function canonical(value){
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(plain(value))return '{'+Object.keys(value).sort().map(k=>
    JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
  return JSON.stringify(value);
}
export async function readCookieJournal(request){
  const result=await request('storage.get',{key:COOKIE_JOURNAL_KEY,withEtag:true});
  if(!plain(result)||result.preview===true||!Object.hasOwn(result,'value')||
    typeof result.etag!=='string'||! /^[a-f0-9]{64}$/.test(result.etag))fail();
  return {etag:result.etag,value:result.value?.schemaVersion===2?
    validateMigratedCookieJournal(result.value):validateLegacyCookieRecord(result.value)};
}
const read=readCookieJournal;

async function save(request,before,value,code){
  try{await request('storage.set',{key:COOKIE_JOURNAL_KEY,value,ifMatch:before.etag});}
  catch{/* One CAS attempt only; exact readback resolves a lost write acknowledgement. */}
  const after=await read(request);
  if(canonical(after.value)!==canonical(value))fail(code);
  return after;
}

/** Storage helpers for the ORIGINAL handler. They never dispatch setMany/retry Cookies. */
export async function reserveCookieAttempt(request,candidate){
  // Generate ownership inside EACH reservation call. If two callers accidentally
  // reuse one intent object, identical readback must not confirm both CAS claims.
  const row={...candidate,attemptId:crypto.randomUUID()};
  const before=await read(request);
  if(before.value?.schemaVersion!==2)fail('E_COOKIE_MIGRATION_REQUIRED');
  const after=await save(request,before,planCookieAttempt(before.value,row),'E_COOKIE_MARKER_UNCONFIRMED');
  return {...after,reference:{scopeKey:row.scopeKey,attemptId:row.attemptId}};
}
export async function saveCookieReceipt(request,reference,outcome){
  const before=await read(request);
  if(before.value?.schemaVersion!==2)fail('E_COOKIE_MIGRATION_REQUIRED');
  const value=planCookieReceipt(before.value,reference,outcome);
  if(canonical(value)===canonical(before.value))return before;
  return save(request,before,value,'E_COOKIE_RECEIPT_UNCONFIRMED');
}

/**
 * Call only after the original controller understands v2. Uses the SAME key,
 * CAS, one write, and exact readback. No retry, deletion, Cookie call, or lock
 * release; a conflict/unknown result leaves the caller's new-write gate closed.
 */
export async function migrateCookieJournal(request,mappings=[]){
  const before=await read(request);
  if(before.value?.schemaVersion===2)return before;
  const next=planCookieJournalMigration(before.value,mappings);
  // Keep the original v1 intact until attribution is actually available.
  // Persisting an unattributed wrapper would strand it behind the v2 fast path.
  if(next.legacy.record&&!next.legacy.attribution)fail('E_COOKIE_LEGACY_UNATTRIBUTED');
  return save(request,before,next,'E_COOKIE_MIGRATION_UNCONFIRMED');
}
