// Shared, pure history projection for both production React and its isolated demo.
// A forecast change or an unverified crossing is never a recognized reset.
export const FIXED_CYCLES = 7;
export const FOCUS_THRESHOLD = 80;
const sizes = new Set([7, 10, 20]);
const number = n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 100;

export function reliableEstimate(row) {
  return row?.type === 'CROSSED_PREDICTED_RESET' &&
    row.estimateQuality === 'NEAR_RESET_OBSERVATION' &&
    number(row.nearResetUnusedEstimatePercent) &&
    typeof row.lastPreResetSampleAt === 'string' &&
    Number.isFinite(Date.parse(row.lastPreResetSampleAt)) &&
    Number.isFinite(row.leadSeconds) && row.leadSeconds >= 0;
}
export function knownCycles(rollovers, windowKey) {
  if (!windowKey || !Array.isArray(rollovers)) return [];
  return rollovers.filter(row => row.windowKey === windowKey &&
    row.type === 'CROSSED_PREDICTED_RESET')
    .sort((a,b) => (Date.parse(a.priorResetsAt) || Date.parse(a.detectedAt) || 0) -
      (Date.parse(b.priorResetsAt) || Date.parse(b.detectedAt) || 0));
}
export function evaluateHistory(rollovers, windowKey, viewCount = 7) {
  const size = sizes.has(viewCount) ? viewCount : FIXED_CYCLES;
  const recognized = knownCycles(rollovers, windowKey);
  const fixed = recognized.slice(-FIXED_CYCLES);
  const reliable = fixed.filter(reliableEstimate);
  const high = reliable.filter(row => row.nearResetUnusedEstimatePercent >= FOCUS_THRESHOLD);
  const mean = reliable.length ?
    Math.round(reliable.reduce((sum,row)=>sum + row.nearResetUnusedEstimatePercent,0) * 10 / reliable.length) / 10 : null;
  const decision = reliable.length < 4 ? 'insufficient' : high.length >= 3 ? 'attention' : 'observe';
  return {
    displayed: recognized.slice(-size), displayedCount: size, totalRecognized: recognized.length,
    fixedCount: fixed.length, reliableCount: reliable.length, highCount: high.length,
    average: mean, decision,
    // 7-cycle attention rule NEVER changes when viewCount is 10 or 20.
    basis: 'LAST_7_RECOGNIZED_RESET_CYCLES'
  };
}
export function windowOptions(account, history) {
  const byKey = new Map();
  for (const row of [...(account?.windows ?? []), ...(history?.observations ?? [])]) {
    if (!row?.windowKey) continue;
    const seconds = Number(row.durationSeconds);
    if (!Number.isFinite(seconds) || seconds < 60) continue;
    byKey.set(row.windowKey, {key:row.windowKey, seconds, limitId:row.limitId ?? 'codex'});
  }
  for (const row of history?.rollovers ?? []) {
    if (typeof row?.windowKey !== 'string' || byKey.has(row.windowKey)) continue;
    const seconds = Number(row.windowKey.match(/:(\d{2,8})$/)?.[1]);
    if (Number.isFinite(seconds) && seconds >= 60)
      byKey.set(row.windowKey, {key:row.windowKey, seconds, limitId:row.windowKey.split(':')[0]});
  }
  return [...byKey.values()].sort((a,b)=>a.seconds-b.seconds || a.key.localeCompare(b.key));
}
export function windowLabel(option) {
  if (!option) return '未知窗口';
  const seconds = option.seconds;
  const dur = seconds % 86400 === 0 ? `${seconds/86400} 天` :
    seconds % 3600 === 0 ? `${seconds/3600} 小时` : `${Math.round(seconds/60)} 分钟`;
  return `${option.limitId === 'codex' ? '' : option.limitId + ' · '}${dur}`;
}
export function selectedWindow(account, history, scope = 'all') {
  const choices = windowOptions(account, history);
  if (scope === 'short') return choices.find(w=>w.seconds < 172800) ?? null;
  if (scope === 'long') return choices.find(w=>w.seconds >= 172800) ?? null;
  // The most recent published window comes first, not a guessed merged window.
  return choices.find(w=>account?.windows?.some(a=>a.windowKey === w.key)) ?? choices[0] ?? null;
}
export const canShowWorkspaceGuidance = account =>
  ['BUSINESS','ENTERPRISE','EDU'].includes(account?.providerPlan?.family?.toUpperCase?.()) ||
  ['business','enterprise','edu'].includes(account?.subscription?.tierLabel?.trim().toLowerCase());
export const OFFICIAL_WORKSPACE_URL = 'https://chatgpt.com/';
export const OFFICIAL_MEMBER_GUIDES = Object.freeze({
  BUSINESS: 'https://help.openai.com/en/articles/8542216-managing-members-seat-types-and-roles-in-chatgpt-business',
  ENTERPRISE: 'https://help.openai.com/en/articles/8266401-managing-members-workspace-roles-and-seats-in-chatgpt-enterprise-and-edu'
});
