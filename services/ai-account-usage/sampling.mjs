// Plan sampling without running a hidden background task. The trusted native
// coordinator decides when/if to call runDueSamples after explicit opt-in.
const HOUR=3600_000;
export function nextSampleDecision(account, nowMs=Date.now()) {
  if (!account || !Number.isFinite(nowMs)) return {dueAt:null,reason:'INVALID_ACCOUNT'};
  const status=account.lastAttempt?.status;
  if (status==='AUTH_REQUIRED' || status==='IDENTITY_UNVERIFIED')
    return {dueAt:null,reason:'PAUSED_AUTH'};
  if (status==='RATE_LIMITED') return {dueAt:null,reason:'PAUSED_RATE_LIMIT'};
  if (status==='SCHEMA_UNKNOWN') return {dueAt:null,reason:'PAUSED_SCHEMA'};
  const prior=account.lastAttempt?.checkedAt ? Date.parse(account.lastAttempt.checkedAt) : null;
  if (prior===null || !Number.isFinite(prior)) return {dueAt:new Date(nowMs).toISOString(),reason:'FIRST_SAMPLE'};
  const resets=(account.windows||[]).map(x=>Date.parse(x.resetsAt)).filter(Number.isFinite);
  const near=resets.some(x=>x>=nowMs-30*60_000 && x<=nowMs+90*60_000);
  const interval=status==='UNAVAILABLE'?4*HOUR:near?10*60_000:2*HOUR;
  const dueAt=new Date(Math.max(nowMs,prior+interval)).toISOString();
  return {dueAt,reason:status==='UNAVAILABLE'?'NETWORK_BACKOFF':near?'NEAR_RESET':'NORMAL'};
}

export async function runDueSamples({store,collector,nowMs=Date.now(),authorizedAliases=[]}={}) {
  if (!store || !collector || typeof collector.refresh!=='function' ||
    !Array.isArray(authorizedAliases) || authorizedAliases.length>64)
    throw new Error('E_SAMPLER_CONFIG');
  const allow=new Set(authorizedAliases);
  const rows=await store.accounts();
  const outcomes=[];
  // Serial by design; a single tick does not retry failed requests or loop.
  for(const row of rows) {
    if (!allow.has(row.alias)) continue;
    const plan=nextSampleDecision(row,nowMs);
    if (!plan.dueAt || Date.parse(plan.dueAt)>nowMs) continue;
    try {
      const value=await collector.refresh(row.alias);
      outcomes.push({alias:row.alias,status:value.lastAttempt?.status||'UNAVAILABLE'});
    } catch {outcomes.push({alias:row.alias,status:'UNAVAILABLE'});}
  }
  return outcomes;
}
