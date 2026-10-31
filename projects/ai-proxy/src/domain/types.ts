/** 配置只存储非秘密数据；凭证值另存于 storage.session。 */
export type ProxyScheme = 'http' | 'https' | 'socks4' | 'socks5';
export type RouteMode = 'system' | 'direct' | 'profile' | 'rules';
export interface CredentialRef { id: string; kind: 'session'; }
export type SubscriptionFormat = 'auto' | 'clash' | 'sing-box' | 'uri-list' | 'unknown';
interface BaseSource { id: string; displayName: string; trustedByUser: boolean; }
export type ConfigSource =
  | (BaseSource & { kind: 'manual' | 'import' })
  | (BaseSource & { kind: 'local-client' })
  | (BaseSource & { kind: 'subscription'; originHost: string; format: SubscriptionFormat; syncStatus: 'not-synced' });
export type SubscriptionSource = Extract<ConfigSource, { kind: 'subscription' }>;
/** No supplied host or secrets: the gateway is always bound to 127.0.0.1. */
export interface LocalClientInput { id: string; name: string; scheme: ProxyScheme; port: number; }
export interface ProxyEndpoint {
  id: string;
  name: string;
  scheme: ProxyScheme;
  host: string;
  port: number;
  credentialRef?: string;
  sourceId: string;
}
export type Profile =
  | { id: string; name: string; kind: 'endpoint'; endpointId: string; sourceId: string }
  | { id: string; name: string; kind: 'pac-inline'; pacText: string; sourceId: string };
export interface RuleTarget {
  action: 'direct' | 'endpoint';
  endpointId?: string;
}
export interface SiteRule extends RuleTarget {
  id: string;
  domain: string;
  includeSubdomains: boolean;
  priority: number;
  enabled: boolean;
}
export interface RouteSelection { mode: RouteMode; profileId?: string; }
export interface ConfigState {
  schemaVersion: 2;
  sources: ConfigSource[];
  endpoints: ProxyEndpoint[];
  profiles: Profile[];
  rules: SiteRule[];
  defaultTarget: RuleTarget;
  selection: RouteSelection;
  /** false = do not set chrome.proxy on startup, even if a selection remains. */
  managed: boolean;
}
export type ControlLevel =
  | 'not_controllable' | 'controlled_by_other_extensions'
  | 'controllable_by_this_extension' | 'controlled_by_this_extension'
  | 'unknown';
export interface ProbeResult {
  checkedAt: number;
  ok: boolean;
  detail: string;
  messageCode?: 'probeSuccess' | 'probeFailure';
  exitIp?: string;
  /** This only checks a request made by the extension; not proof of a tab's proxy path. */
  scope: 'extension-request-only';
}
export interface RuntimeStatus {
  desired: RouteSelection;
  /** Last route verified against Chrome API, which may differ from an edited selection. */
  activeSelection?: RouteSelection;
  managedIntent: boolean;
  control: ControlLevel;
  /** Actual SDK observation; absent/null means permission was not confirmed. */
  permission?: boolean | null;
  statusErrorCode?: string;
  canStop?: boolean;
  outcomeUnknown?: boolean;
  /** A historical release needs config cleanup; current control is reported separately. */
  stopFinalizationPending?: boolean;
  browserMode: string | null;
  applied: boolean;
  /** Current route differs from the confirmed active route, or no active route is confirmed. */
  pendingChanges: boolean;
  proxyError: string | null;
  probe: ProbeResult | null;
  credentialRequired: boolean;
}
export interface ViewState { config: ConfigState; runtime: RuntimeStatus; }
