import {getEnvironment} from '../environment';
import type { ErrorCode } from './error-codes';
import type { DiagnosticsSnapshot, SitePriority } from '../diagnostics/types';
import type { UsageSnapshot, UsageSort } from '../usage/types';
import type { ConfigState, LocalClientInput, ProxyEndpoint, ProbeResult, Profile, RouteSelection, SiteRule, SubscriptionSource, ViewState } from './types';
export type Request =
  | { type: 'GET_STATE' }
  | { type: 'SAVE_ENDPOINT'; endpoint: ProxyEndpoint }
  | { type: 'SAVE_LOCAL_CLIENT'; client: LocalClientInput }
  | { type: 'SAVE_SUBSCRIPTION'; source: SubscriptionSource }
  | { type: 'DELETE_SUBSCRIPTION'; id: string }
  | { type: 'DELETE_ENDPOINT'; id: string }
  | { type: 'SAVE_PROFILE'; profile: Profile }
  | { type: 'DELETE_PROFILE'; id: string }
  | { type: 'SAVE_RULE'; rule: SiteRule }
  | { type: 'DELETE_RULE'; id: string }
  | { type: 'SET_DEFAULT'; target: ConfigState['defaultTarget'] }
  | { type: 'SELECT'; selection: RouteSelection }
  /** One-click use: select and apply a saved route in one serialized background operation. */
  | { type: 'SELECT_AND_APPLY'; selection: RouteSelection; approvedPac?: boolean }
  | { type: 'APPLY'; approvedPac?: boolean }
  | { type: 'STOP' }
  | { type: 'SET_CREDENTIAL'; endpointId: string; username: string; password: string }
  | { type: 'PROBE' }
  | { type: 'GET_DIAGNOSTICS' }
  | { type: 'RUN_DIAGNOSTICS'; siteIds: string[] }
  | { type: 'CANCEL_DIAGNOSTICS' }
  | { type: 'SAVE_DIAGNOSTIC_SITE'; domain: string; priority: SitePriority; name?: string }
  | { type: 'REMOVE_DIAGNOSTIC_SITE'; id: string }
  | { type: 'MOVE_DIAGNOSTIC_SITE'; id: string; direction: 'up' | 'down' }
  | { type: 'GET_USAGE' }
  | { type: 'SET_USAGE_SETTINGS'; settings: { enabled?: boolean; topLimit?: 5 | 10; sort?: UsageSort } }
  | { type: 'CLEAR_USAGE' }
  | { type: 'IGNORE_USAGE_SITE'; domain: string; ignored: boolean }
  | { type: 'IMPORT'; config: unknown }
  | { type: 'EXPORT' };
export type Response =
  | { ok: true; state: ViewState; share?: ConfigState; probe?: ProbeResult; diagnostics?: DiagnosticsSnapshot; usage?: UsageSnapshot }
  | { ok: false; error: string; errorCode?: ErrorCode };
export async function request(message: Request): Promise<Response> {
  const response: unknown = await getEnvironment().request(message);
  if (!response || typeof response !== 'object' || !('ok' in response)) throw new Error('后台返回了无效响应');
  return response as Response;
}

