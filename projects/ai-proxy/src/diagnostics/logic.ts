import type { CheckKind, DiagnosticStatistics, HttpObservation } from './types';

/** HTTP observations older than 10 minutes cannot describe the current route. */
export const DIAGNOSTIC_RESULT_TTL_MS = 10 * 60 * 1000;
export function observationIsCurrent(
  observation: Pick<HttpObservation, 'configRevision' | 'checkedAt'>,
  revision: string, now = Date.now()
): boolean {
  return observation.configRevision === revision &&
    Number.isFinite(observation.checkedAt) &&
    observation.checkedAt <= now &&
    observation.checkedAt >= now - DIAGNOSTIC_RESULT_TTL_MS;
}

export function classifyHttp(status: number, responseType = 'basic'): CheckKind {
  if (responseType === 'opaqueredirect' || (status >= 300 && status < 400)) return 'redirect';
  if (status === 401) return 'auth_required';
  if (status === 403) return 'forbidden';
  if (status === 407) return 'proxy_auth';
  if (status === 429) return 'rate_limited';
  if (status >= 200 && status < 300) return 'http_ok';
  return 'http_error';
}
export function percentile(samples: number[], fraction: number): number | null {
  if (!samples.length) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  const position = Math.max(0, Math.ceil(sorted.length * fraction) - 1);
  return Math.round(sorted[position]!);
}
export function statistics(observations: HttpObservation[]): DiagnosticStatistics {
  const successes = observations.filter(v => v.kind === 'http_ok').length;
  const latencies = observations.filter(v => v.kind === 'http_ok' && v.elapsedMs !== null)
    .map(v => v.elapsedMs!);
  return {
    attempts: observations.length,
    successes,
    failures: observations.length - successes,
    // Percentiles on < 3 successful observations convey false precision.
    p50Ms: latencies.length >= 3 ? percentile(latencies, 0.5) : null,
    p95Ms: latencies.length >= 3 ? percentile(latencies, 0.95) : null
  };
}
export type DiagnosisCode = 'control_conflict' | 'not_applied' | 'credentials'
  | 'local_gateway' | 'proxy_auth' | 'site_blocked' | 'site_rate_limited'
  | 'network_failure' | 'limited_evidence';
export function diagnosisCodes(input: {
  control: string; managedIntent: boolean; applied: boolean; credentialRequired: boolean;
  localEndpoint: boolean; results: HttpObservation[];
}): DiagnosisCode[] {
  const issues: DiagnosisCode[] = [];
  if (input.control === 'controlled_by_other_extensions' || input.control === 'not_controllable')
    issues.push('control_conflict');
  if (input.managedIntent && !input.applied) issues.push('not_applied');
  if (input.credentialRequired) issues.push('credentials');
  const latest = input.results.filter(r => r.kind !== 'cancelled');
  if (latest.some(r => r.kind === 'proxy_auth')) issues.push('proxy_auth');
  if (latest.some(r => r.kind === 'forbidden')) issues.push('site_blocked');
  if (latest.some(r => r.kind === 'rate_limited')) issues.push('site_rate_limited');
  if (latest.some(r => r.kind === 'network_error' || r.kind === 'timeout')) {
    issues.push(input.localEndpoint ? 'local_gateway' : 'network_failure');
  }
  return issues.length ? [...new Set(issues)] : ['limited_evidence'];
}
