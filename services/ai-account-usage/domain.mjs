// Pure quota, subscription and history projection. This module never accepts
// or persists Cookie values, access tokens or upstream response bodies.
export const SCHEMA_VERSION = 1;
export const MAX_OBSERVATIONS = 20_000;
export const MAX_ROLLOVERS = 3_000;

const isObject = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const iso = x => typeof x === 'string' && Number.isFinite(Date.parse(x)) && new Date(x).toISOString() === x;
const percentage = x => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 100;
const fail = code => Object.assign(new Error(code), {code});
const MAX_LEAD_SECONDS = duration => duration >= 172_800 ? 2 * 3600 : 15 * 60;
export const validateAlias = x => typeof x === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{2,47}$/.test(x);
export const emptyState = () => ({schemaVersion: SCHEMA_VERSION, accounts: {}, observations: [], rollovers: []});

// Business profile only. Cached claims remain labelled as cached, even after the
// server independently confirms the user/account IDs. No JWT is persisted.
export function normalizeIdentity(input) {
  if (input == null) return null;
  const fields = ['userId','accountId','email','emailSource','displayName','displayNameSource','observedAt'];
  if (!isObject(input) || Object.keys(input).some(k=>!fields.includes(k)) ||
      ![input.userId,input.accountId].every(x=>typeof x==='string' && /^[A-Za-z0-9_.:@|+-]{1,256}$/.test(x)) ||
      typeof input.email !== 'string' || input.email.length>320 || !/^[^\s@]+@[^\s@]+$/.test(input.email) ||
      !['USAGE_RESPONSE','OAUTH_CACHE'].includes(input.emailSource) || !iso(input.observedAt) ||
      (input.displayName !== null && (typeof input.displayName!=='string' || !input.displayName.trim() ||
        input.displayName.length>128 || /[\x00-\x1f\x7f]/.test(input.displayName))) ||
      !(input.displayName===null ? input.displayNameSource==='UNKNOWN' :
        ['USAGE_RESPONSE','OAUTH_CACHE'].includes(input.displayNameSource))) throw fail('E_ACCOUNT_IDENTITY');
  return Object.fromEntries(fields.map(k=>[k,input[k]]));
}

export function normalizeProviderPlan(raw) {
  const planCode = typeof raw === 'string' && /^[A-Za-z0-9_ -]{1,40}$/.test(raw) ? raw.trim().toLowerCase() : null;
  if (!planCode) return {family: 'UNKNOWN', code: null, multiplier: null, source: 'UNKNOWN'};
  const family = /^(pro|prolite|pro[-_ ]?\d+x)/.test(planCode) ? 'PRO' :
    /^(plus|free|go|business|team|enterprise|edu)$/.test(planCode) ? planCode.toUpperCase() : 'UNKNOWN';
  const matched = /^pro[-_ ]?(5|10|20)x$/.exec(planCode);
  return {family, code: planCode, multiplier: matched ? Number(matched[1]) : null, source: 'QUOTA_RESPONSE'};
}

export function normalizeSubscription(input) {
  if (input == null) return {tierLabel: null, multiplier: null, membershipExpiresAt: null,
    nextBillingAt: null, source: 'UNKNOWN'};
  if (!isObject(input) || input.source !== 'ADMIN_ENTERED') throw fail('E_SUBSCRIPTION_SOURCE');
  const tierLabel = input.tierLabel == null ? null : input.tierLabel;
  if (tierLabel !== null && (typeof tierLabel !== 'string' || !/^[\w\s+.-]{1,40}$/.test(tierLabel)))
    throw fail('E_SUBSCRIPTION_TIER');
  const multiplier = input.multiplier == null ? null : input.multiplier;
  if (multiplier !== null && ![5, 10, 20].includes(multiplier)) throw fail('E_SUBSCRIPTION_MULTIPLIER');
  const membershipExpiresAt = input.membershipExpiresAt ?? null;
  const nextBillingAt = input.nextBillingAt ?? null;
  if ((membershipExpiresAt !== null && !iso(membershipExpiresAt)) ||
      (nextBillingAt !== null && !iso(nextBillingAt))) throw fail('E_SUBSCRIPTION_DATE');
  return {tierLabel, multiplier, membershipExpiresAt, nextBillingAt, source: 'ADMIN_ENTERED'};
}

export function registerAccount(state, {alias, displayName, subscription} = {}) {
  if (!validateAlias(alias) || typeof displayName !== 'string' ||
      displayName.trim() !== displayName || displayName.length < 1 || displayName.length > 64 ||
      /[\x00-\x1f\x7f]/.test(displayName)) throw fail('E_ACCOUNT_METADATA');
  const next = structuredClone(state);
  next.accounts[alias] = {
    displayName,
    subscription: normalizeSubscription(subscription),
    identity: next.accounts[alias]?.identity ?? null,
    providerPlan: next.accounts[alias]?.providerPlan ?? normalizeProviderPlan(null),
    lastAttempt: next.accounts[alias]?.lastAttempt ?? null,
    lastSuccessAt: next.accounts[alias]?.lastSuccessAt ?? null
  };
  return next;
}

function cleanWindow(window) {
  if (!isObject(window) || !/^(primary|secondary)$/.test(window.key) ||
      (window.limitId !== undefined && (typeof window.limitId !== 'string' ||
        !/^[A-Za-z0-9_-]{1,64}$/.test(window.limitId))) ||
      !Number.isInteger(window.durationSeconds) || window.durationSeconds < 60 ||
      window.durationSeconds > 366 * 86400 || !percentage(window.usedPercent) ||
      !percentage(window.remainingPercent) ||
      Math.abs(100 - window.usedPercent - window.remainingPercent) > 0.011 ||
      !iso(window.resetsAt)) throw fail('E_QUOTA_WINDOW_INVALID');
  const limitId = window.limitId ?? 'codex';
  return {windowKey: `${limitId}:${window.key}:${window.durationSeconds}`, limitId,
    slot: window.key, kind: window.durationSeconds >= 172_800 ? 'LONG_WINDOW' : 'SHORT_WINDOW',
    durationSeconds: window.durationSeconds, usedPercent: window.usedPercent,
    remainingPercent: window.remainingPercent, resetsAt: window.resetsAt};
}

function cleanAttempt(result) {
  if (!isObject(result) || !['OK','AUTH_REQUIRED','SCHEMA_UNKNOWN','RATE_LIMITED',
    'UNAVAILABLE','IDENTITY_UNVERIFIED'].includes(result.status) ||
    !['COOKIE_ONLY','CODEX_OAUTH'].includes(result.mode) ||
    !iso(result.checkedAt)) throw fail('E_PROBE_RESULT');
  const reason = typeof result.reason === 'string' && /^[A-Z0-9_]{1,80}$/.test(result.reason)
    ? result.reason : 'UNSPECIFIED';
  const http = x => Number.isInteger(x) && x >= 100 && x <= 599 ? x : null;
  return {mode: result.mode, status: result.status, reason, checkedAt: result.checkedAt,
    quotaHttpStatus: http(result.quotaHttpStatus), sessionHttpStatus: http(result.sessionHttpStatus)};
}

// Only a verified workspace AND independently matched user may be written as OK.
export function recordProbeResult(state, alias, result) {
  if (!validateAlias(alias) || !Object.hasOwn(state.accounts, alias)) throw fail('E_ACCOUNT_UNKNOWN');
  const next = structuredClone(state);
  const account = next.accounts[alias];
  const attempt = cleanAttempt(result);
  if (account.lastAttempt && Date.parse(attempt.checkedAt) <= Date.parse(account.lastAttempt.checkedAt))
    throw fail('E_SAMPLE_NOT_NEWER');
  if (attempt.status !== 'OK') {
    account.lastAttempt = attempt;
    return next; // Failure is retained without clearing last success or pretending usage=0.
  }
  const identityVerified = result.mode === 'COOKIE_ONLY'
    ? result.workspaceEvidence === 'QUOTA_ACCOUNT_ID'
    : result.workspaceEvidence === 'OAUTH_USAGE_USER_AND_ACCOUNT_IDS' &&
      result.identityEvidence === 'OAUTH_TOKEN_CLAIMS_AND_USAGE_RESPONSE_USER_ACCOUNT_IDS';
  if (result.sessionUserVerified !== true || result.workspaceVerified !== true || !identityVerified ||
      !Array.isArray(result.windows) || result.windows.length < 1 ||
      result.windows.length > (result.mode === 'COOKIE_ONLY' ? 2 : 32))
    throw fail('E_PROBE_UNVERIFIED');
  const windows = result.windows.map(cleanWindow);
  if (result.identity != null) {
    const identity = normalizeIdentity(result.identity);
    if (result.mode !== 'CODEX_OAUTH' || identity.observedAt !== attempt.checkedAt) throw fail('E_ACCOUNT_IDENTITY');
    if (account.identity && (identity.userId !== account.identity.userId || identity.accountId !== account.identity.accountId ||
        identity.email.toLowerCase() !== account.identity.email.toLowerCase())) throw fail('E_ACCOUNT_IDENTITY_CHANGED');
    account.identity = identity;
  }
  if (new Set(windows.map(x=>x.windowKey)).size !== windows.length) throw fail('E_QUOTA_DUPLICATE');
  const plan = normalizeProviderPlan(result.planType);
  const samples = windows.map(x => ({accountAlias: alias, mode: result.mode,
    observedAt: attempt.checkedAt, ...x}));

  for (const sample of samples) {
    const prior = next.observations.findLast(x => x.accountAlias === alias && x.windowKey === sample.windowKey);
    if (!prior) continue;
    const oldReset = Date.parse(prior.resetsAt), newReset = Date.parse(sample.resetsAt);
    if (newReset <= oldReset + 60_000) continue;
    // A changed server reset forecast is NOT in itself evidence of a reset.
    const boundaryCrossed = Date.parse(sample.observedAt) >= oldReset && Date.parse(prior.observedAt) < oldReset;
    // A rolling-window forecast can move without a real reset. Require BOTH
    // a meaningful reset-time jump and a usage counter drop (or stable zero).
    const usageResetEvidence = sample.usedPercent <= prior.usedPercent - 1 ||
      (sample.usedPercent === 0 && prior.usedPercent === 0);
    const resetTimeEvidence = newReset - oldReset >= sample.durationSeconds * 500;
    const crossed = boundaryCrossed && usageResetEvidence && resetTimeEvidence;
    const leadSeconds = crossed ? Math.max(0, Math.floor((oldReset - Date.parse(prior.observedAt)) / 1000)) : null;
    const closeEnough = crossed && leadSeconds <= MAX_LEAD_SECONDS(sample.durationSeconds);
    next.rollovers.push({accountAlias: alias, windowKey: sample.windowKey,
      priorResetsAt: prior.resetsAt, detectedAt: sample.observedAt,
      type: crossed ? 'CROSSED_PREDICTED_RESET' :
        boundaryCrossed ? 'CROSSED_BUT_UNVERIFIED' : 'FORECAST_MOVED_UNCONFIRMED',
      lastPreResetSampleAt: crossed ? prior.observedAt : null,
      leadSeconds, lastObservedRemainingPercent: crossed ? prior.remainingPercent : null,
      nearResetUnusedEstimatePercent: closeEnough ? prior.remainingPercent : null,
      estimateQuality: closeEnough ? 'NEAR_RESET_OBSERVATION' : 'INSUFFICIENT_EVIDENCE'});
  }
  next.observations.push(...samples);
  account.lastSuccessAt = attempt.checkedAt;
  if (next.observations.length > MAX_OBSERVATIONS) {
    // Historical retention must not remove another account's current snapshot.
    // Latest sets cost at most 64 accounts * 32 independent windows.
    const current = row => row.observedAt === next.accounts[row.accountAlias]?.lastSuccessAt;
    const protectedCount = next.observations.filter(current).length;
    const historical = next.observations.filter(row=>!current(row)).slice(-(MAX_OBSERVATIONS-protectedCount));
    const retained = new Set(historical);
    next.observations = next.observations.filter(row=>current(row) || retained.has(row));
  }
  if (next.rollovers.length > MAX_ROLLOVERS)
    next.rollovers.splice(0, next.rollovers.length - MAX_ROLLOVERS);
  account.providerPlan = plan;
  account.lastAttempt = attempt;
  return next;
}

export function listAccounts(state) {
  return Object.entries(state.accounts).map(([alias, account]) => {
    const latest = state.observations.filter(x=>x.accountAlias === alias && x.observedAt === account.lastSuccessAt);
    const windows = [...new Map(latest.map(x=>[x.windowKey,x])).values()]
      .map(({windowKey,limitId,mode,slot,kind,durationSeconds,usedPercent,remainingPercent,resetsAt,observedAt})=>
        ({windowKey,limitId:limitId ?? 'codex',mode:mode ?? 'COOKIE_ONLY',slot,kind,durationSeconds,
          usedPercent,remainingPercent,resetsAt,observedAt}));
    return {alias, displayName: account.displayName, identity: account.identity ?? null, providerPlan: account.providerPlan,
      subscription: account.subscription, lastSuccessAt: account.lastSuccessAt,
      lastAttempt: account.lastAttempt ? {mode:'COOKIE_ONLY',...account.lastAttempt} : null, windows};
  });
}

export function accountHistory(state, alias, {limit=100, windowKey=null}={}) {
  if (!validateAlias(alias) || !Object.hasOwn(state.accounts,alias)) throw fail('E_ACCOUNT_UNKNOWN');
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw fail('E_LIMIT');
  if (windowKey !== null && (typeof windowKey !== 'string' || !/^[A-Za-z0-9_-]{1,64}:(primary|secondary):\d{2,8}$/.test(windowKey)))
    throw fail('E_WINDOW_KEY');
  const chosen = x=>x.accountAlias === alias && (windowKey===null || x.windowKey===windowKey);
  return {observations:state.observations.filter(chosen).slice(-limit),
    rollovers:state.rollovers.filter(chosen).slice(-limit)};
}

export function underuseInsights(state, {cycles=5, threshold=80}={}) {
  if (!Number.isInteger(cycles) || cycles < 1 || cycles > 20 || !percentage(threshold)) throw fail('E_INSIGHT_QUERY');
  const keyMap = new Map();
  for (const row of state.rollovers) {
    if (row.type !== 'CROSSED_PREDICTED_RESET') continue;
    const id = `${row.accountAlias}/${row.windowKey}`;
    if (!keyMap.has(id)) keyMap.set(id,[]);
    keyMap.get(id).push(row);
  }
  const summaries=[];
  for (const [id,rows] of keyMap) {
    const selected = rows.slice(-cycles);
    const measurable = selected.filter(x=>x.nearResetUnusedEstimatePercent !== null);
    const average = measurable.length ? Math.round(100 * measurable.reduce((s,x)=>s+x.nearResetUnusedEstimatePercent,0) / measurable.length)/100 : null;
    const last=selected.at(-1);
    summaries.push({accountAlias:last.accountAlias,windowKey:last.windowKey,
      cyclesObserved:selected.length,cyclesNearReset:measurable.length,
      cyclesWithoutReliableEstimate:selected.length-measurable.length,
      averageNearResetRemainingPercent:average,
      highUnusedCycles:measurable.filter(x=>x.nearResetUnusedEstimatePercent>=threshold).length,
      basis:'NEAR_RESET_SAMPLES_ONLY',notExactWaste:true});
  }
  return summaries;
}
