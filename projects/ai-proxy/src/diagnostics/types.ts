/** Only user-initiated, extension-context HTTP observations; no model or tab access proof. */
export type CheckKind = 'http_ok' | 'auth_required' | 'forbidden' | 'rate_limited'
  | 'proxy_auth' | 'redirect' | 'http_error' | 'timeout' | 'network_error'
  | 'permission' | 'cancelled';
export type SitePriority = 'P0' | 'P1';
export interface DiagnosticSite {
  id: string;
  domain: string;
  name: string;
  priority: SitePriority;
  kind: 'ai' | 'custom';
  /** Legacy records without provenance are conservatively treated as user intent. */
  provenance?: 'builtin' | 'user' | 'auto';
  pinnedByUser?: boolean;
}
export interface HttpObservation {
  siteId: string;
  domain: string;
  checkedAt: number;
  configRevision: string;
  kind: CheckKind;
  httpStatus: number | null;
  elapsedMs: number | null;
  /** Evidence level L2. Never infer a tab route, account login or a working AI model. */
  scope: 'extension-http-only';
}
export interface DiagnosticStatistics {
  attempts: number;
  successes: number;
  failures: number;
  p50Ms: number | null;
  p95Ms: number | null;
}
export interface DiagnosticRun {
  startedAt: number;
  total: number;
  completed: number;
}
export interface DiagnosticsSnapshot {
  configRevision: string;
  favorites: DiagnosticSite[];
  observations: HttpObservation[];
  statistics: Record<string, DiagnosticStatistics>;
  activeRun: DiagnosticRun | null;
}
