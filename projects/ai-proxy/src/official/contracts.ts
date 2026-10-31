/** Public, non-secret Provider DTOs. Never persist them inside ConfigState or exports. */
export type OfficialFailure = 'not-configured' | 'offline' | 'invalid-response' |
  'unauthorized' | 'forbidden' | 'rate-limited' | 'cancelled' | 'invalid-callback' |
  'busy' | 'invalid-plan' | 'unsupported' | 'operation-failed';
export type OfficialAuth = 'guest' | 'signed-in' | 'expired' | 'unknown';
export type EntitlementState = 'none' | 'active' | 'expiring' | 'expired' | 'revoked' | 'unknown';
export interface OfficialAccount { id: string; email: string; displayName: string; }
export interface OfficialPlan {
  id: string; name: string; period: 'month' | 'year';
  currency: string; priceMinor: number;
}
export interface OfficialEntitlement {
  state: EntitlementState; planName?: string; expiresAt?: number;
  autoRenew?: boolean; remainingBytes?: number;
}
export interface OfficialLine {
  id: string; name: string; region: string;
  protocol: 'http' | 'https' | 'socks5' | 'vless' | 'vmess' | 'trojan';
  availability: 'available' | 'unavailable';
  /** Metadata is NOT a Chrome proxy configuration or a connection proof. */
  browserCompatible: boolean;
}
export type CheckoutState = 'none' | 'pending' | 'failed' | 'cancelled' | 'settled-unverified';
export interface OfficialSnapshot {
  configured: boolean;
  auth: OfficialAuth;
  availability: 'unconfigured' | 'online' | 'error';
  account?: OfficialAccount;
  plans: OfficialPlan[];
  entitlement?: OfficialEntitlement;
  lines: OfficialLine[];
  checkout: CheckoutState;
  failure?: OfficialFailure;
}
export type OfficialRequest =
  | { type: 'OFFICIAL_STATUS' }
  | { type: 'OFFICIAL_LOGIN' }
  | { type: 'OFFICIAL_REGISTER' }
  | { type: 'OFFICIAL_LOGOUT' }
  | { type: 'OFFICIAL_CHECKOUT'; planId: string }
  | { type: 'OFFICIAL_MANAGE' };
export type OfficialResponse =
  | { ok: true; snapshot: OfficialSnapshot }
  | { ok: false; failure: OfficialFailure };
export function isOfficialRequest(input: unknown): input is OfficialRequest {
  if (!input || typeof input !== 'object' || !('type' in input)) return false;
  const value = input as Record<string, unknown>;
  if (value.type === 'OFFICIAL_CHECKOUT')
    return typeof value.planId === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value.planId);
  return ['OFFICIAL_STATUS', 'OFFICIAL_LOGIN', 'OFFICIAL_REGISTER',
    'OFFICIAL_LOGOUT', 'OFFICIAL_MANAGE'].includes(String(value.type));
}
export class OfficialApiError extends Error {
  constructor(public readonly failure: OfficialFailure) { super(failure); }
}
function row(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new OfficialApiError('invalid-response');
  return input as Record<string, unknown>;
}
function string(input: unknown, max = 160): string {
  if (typeof input !== 'string' || !input.trim() || input.length > max)
    throw new OfficialApiError('invalid-response');
  return input.trim();
}
const ID = /^[a-zA-Z0-9_-]{1,80}$/;
export function readAccount(input: unknown): OfficialAccount {
  const v = row(input), id = string(v.id, 80), email = string(v.email, 254);
  if (!ID.test(id) || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    throw new OfficialApiError('invalid-response');
  return { id, email, displayName: string(v.displayName ?? email, 100) };
}
/** ISO-4217 allowlist: fail closed on unknown currency and negative/fractional prices. */
const CURRENCIES = new Set(['USD', 'EUR', 'GBP', 'JPY', 'CNY', 'HKD', 'TWD', 'SGD', 'AUD', 'CAD']);
export function readPlans(input: unknown): OfficialPlan[] {
  if (!Array.isArray(input) || input.length > 100) throw new OfficialApiError('invalid-response');
  const seen = new Set<string>();
  return input.map(item => {
    const v = row(item), id = string(v.id, 80), currency = string(v.currency, 3);
    if (!ID.test(id) || seen.has(id) || !CURRENCIES.has(currency) ||
      (v.period !== 'month' && v.period !== 'year') ||
      typeof v.priceMinor !== 'number' || !Number.isSafeInteger(v.priceMinor) ||
      v.priceMinor < 0 || v.priceMinor > 1_000_000_000) throw new OfficialApiError('invalid-response');
    seen.add(id);
    return { id, name: string(v.name, 80), period: v.period,
      currency, priceMinor: v.priceMinor };
  });
}
export function readEntitlement(input: unknown, now = Date.now()): OfficialEntitlement {
  const v = row(input);
  const valid: EntitlementState[] = ['none', 'active', 'expiring', 'expired', 'revoked', 'unknown'];
  if (!valid.includes(v.state as EntitlementState)) throw new OfficialApiError('invalid-response');
  let state = v.state as EntitlementState;
  const expiresAt = typeof v.expiresAt === 'string' ? Date.parse(v.expiresAt) : undefined;
  if (v.expiresAt != null && (!Number.isFinite(expiresAt) || !/^\d{4}-\d\d-\d\dT/.test(v.expiresAt as string)))
    throw new OfficialApiError('invalid-response');
  if ((state === 'active' || state === 'expiring') && expiresAt === undefined)
    throw new OfficialApiError('invalid-response');
  if (expiresAt !== undefined && (state === 'active' || state === 'expiring')) {
    if (expiresAt <= now) state = 'expired';
    else if (expiresAt - now <= 7 * 86400_000) state = 'expiring';
    else state = 'active';
  }
  if (v.autoRenew !== undefined && typeof v.autoRenew !== 'boolean')
    throw new OfficialApiError('invalid-response');
  if (v.remainingBytes !== undefined &&
    (typeof v.remainingBytes !== 'number' || !Number.isSafeInteger(v.remainingBytes) ||
      v.remainingBytes < 0 || v.remainingBytes > 1_000_000_000_000_000))
    throw new OfficialApiError('invalid-response');
  return {
    state, ...(v.planName !== undefined ? { planName:string(v.planName,80) } : {}),
    ...(expiresAt !== undefined ? { expiresAt } : {}),
    ...(typeof v.autoRenew === 'boolean' ? { autoRenew: v.autoRenew } : {}),
    ...(typeof v.remainingBytes === 'number' ? { remainingBytes: v.remainingBytes } : {})
  };
}
export function readLines(input: unknown): OfficialLine[] {
  if (!Array.isArray(input) || input.length > 200) throw new OfficialApiError('invalid-response');
  const protocols = ['http','https','socks5','vless','vmess','trojan'] as const;
  const seen = new Set<string>();
  return input.map(item => {
    const v = row(item), id = string(v.id,80);
    if (!ID.test(id) || seen.has(id) ||
      !protocols.some(p => p === v.protocol) || !['available','unavailable'].includes(String(v.availability)))
      throw new OfficialApiError('invalid-response');
    seen.add(id);
    const protocol = v.protocol as OfficialLine['protocol'];
    return { id, name:string(v.name,100), region:string(v.region,80), protocol,
      availability: v.availability as OfficialLine['availability'],
      browserCompatible: ['http','https','socks5'].includes(protocol) };
  });
}
export function emptyOfficial(configured: boolean): OfficialSnapshot {
  return {configured, auth:'guest', availability:configured?'error':'unconfigured',
    plans:[], lines:[], checkout:'none', ...(!configured ? {failure:'not-configured' as const} : {}) };
}
