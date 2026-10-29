// R1.1 read-only Cookie-only feasibility probe. No browser API, persisted secrets,
// OAuth fallback, redirects, alternate hosts, retry or HTTP server.
const ORIGIN = 'https://chatgpt.com';
const QUOTA_URL = `${ORIGIN}/backend-api/wham/usage`;
const SESSION_URL = `${ORIGIN}/api/auth/session`;
const MAX_BODY_BYTES = 96 * 1024;
const MAX_COOKIES = 100;
const TIMEOUT_MS = 10_000;

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const result = (status, reason, extra = {}) => ({status, reason, ...extra});
const validExpected = value => object(value) && (
  (typeof value.userId === 'string' && value.userId.length > 0 && value.userId.length <= 256) ||
  (typeof value.email === 'string' && value.email.includes('@') && value.email.length <= 320)
);

function scopedCookies(snapshot, pathname, now) {
  if (!object(snapshot) || snapshot.origin !== ORIGIN || !Array.isArray(snapshot.cookies) ||
      snapshot.cookies.length > MAX_COOKIES) return {error: 'SNAPSHOT_SCOPE_INVALID'};
  const selected = [];
  const stores = new Set();
  for (const row of snapshot.cookies) {
    if (!object(row) || typeof row.name !== 'string' || !/^[^\x00-\x20\x7f()<>@,;:\\"/\[\]?={}]+$/.test(row.name) ||
        typeof row.value !== 'string' || row.value.length > 4096 || /[\x00-\x1f\x7f;]/.test(row.value) ||
        typeof row.domain !== 'string' || typeof row.path !== 'string' || !row.path.startsWith('/') ||
        typeof row.hostOnly !== 'boolean' || typeof row.secure !== 'boolean' ||
        row.partitionKey !== undefined || typeof row.storeId !== 'string') {
      return {error: 'COOKIE_ROW_UNSAFE'};
    }
    stores.add(row.storeId);
    if (stores.size > 1) return {error: 'MIXED_COOKIE_STORES'};
    const domain = row.domain.replace(/^\./, '').toLowerCase();
    // A host-only Cookie is usable only on its exact host; domain Cookies
    // must also domain-match the *fixed* destination, never a supplied URL.
    if (domain !== 'chatgpt.com' || !row.secure) continue;
    if (row.hostOnly && row.domain.startsWith('.')) return {error: 'COOKIE_ROW_UNSAFE'};
    if (row.session === false && (!Number.isFinite(row.expirationDate) || row.expirationDate <= now / 1000)) continue;
    if (!pathname.startsWith(row.path) ||
        (row.path !== '/' && !row.path.endsWith('/') &&
         pathname.length > row.path.length && pathname[row.path.length] !== '/')) continue;
    selected.push(row);
  }
  selected.sort((a, b) => b.path.length - a.path.length);
  const header = selected.map(row => `${row.name}=${row.value}`).join('; ');
  if (header.length > 32_768) return {error: 'COOKIE_HEADER_TOO_LARGE'};
  return {header, count: selected.length};
}

async function boundedJson(response) {
  const type = response.headers.get('content-type') || '';
  if (!/\bapplication\/(?:[\w.-]+\+)?json\b/i.test(type)) return {error: 'NOT_JSON'};
  if (Number(response.headers.get('content-length')) > MAX_BODY_BYTES) return {error: 'BODY_TOO_LARGE'};
  const reader = response.body?.getReader();
  if (!reader) return {error: 'EMPTY_BODY'};
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        return {error: 'BODY_TOO_LARGE'};
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const part of chunks) { bytes.set(part, offset); offset += part.byteLength; }
    const parsed = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes));
    return object(parsed) ? {data: parsed} : {error: 'NOT_OBJECT'};
  } catch { return {error: 'BAD_JSON'}; }
}

function windowsFrom(data) {
  if (!object(data?.rate_limit)) return null;
  const windows = [];
  for (const [key, raw] of [['primary', data.rate_limit.primary_window], ['secondary', data.rate_limit.secondary_window]]) {
    if (raw == null) continue;
    if (!object(raw) || !Number.isFinite(raw.used_percent) || raw.used_percent < 0 || raw.used_percent > 100 ||
        !Number.isInteger(raw.limit_window_seconds) || raw.limit_window_seconds <= 0 ||
        !Number.isSafeInteger(raw.reset_at) || raw.reset_at <= 0) return null;
    const durationSeconds = raw.limit_window_seconds;
    windows.push({key, durationSeconds, usedPercent: raw.used_percent,
      remainingPercent: Math.round((100 - raw.used_percent) * 100) / 100,
      resetsAt: new Date(raw.reset_at * 1000).toISOString()});
  }
  return windows.length > 0 ? windows : null;
}

function matchIdentity(session, expected) {
  const user = session?.user;
  if (!object(user)) return 'SESSION_USER_MISSING';
  const idMatch = typeof expected.userId === 'string' && user.id === expected.userId;
  const emailMatch = typeof expected.email === 'string' &&
    typeof user.email === 'string' && user.email.toLowerCase() === expected.email.toLowerCase();
  // When both are provided BOTH must match. Never silently accept an alias.
  if (typeof expected.userId === 'string' && !idMatch) return 'USER_ID_MISMATCH';
  if (typeof expected.email === 'string' && !emailMatch) return 'EMAIL_MISMATCH';
  return idMatch || emailMatch ? null : 'EXPECTED_IDENTITY_REQUIRED';
}

function matchWorkspace(data, expected) {
  const actual = data?.account_id;
  if (actual == null) return {verified: false, reason: 'QUOTA_ACCOUNT_ID_NOT_RETURNED'};
  if (typeof actual !== 'string' || actual.length > 256) return {verified: false, reason: 'QUOTA_ACCOUNT_ID_INVALID'};
  if (typeof expected.accountId !== 'string' || !expected.accountId) return {verified: false, reason: 'EXPECTED_ACCOUNT_ID_MISSING'};
  return actual === expected.accountId
    ? {verified: true, reason: null}
    : {verified: false, reason: 'QUOTA_ACCOUNT_ID_MISMATCH'};
}

// The optional fetchImpl is for dependency-injected offline tests. Production
// always sends to two hardcoded chatgpt.com URLs, with no redirect following.
export async function probeCookieOnly({snapshot, expectedIdentity, fetchImpl = globalThis.fetch,
  clock = Date.now} = {}) {
  const checkedAt = new Date(clock()).toISOString();
  const base = {mode: 'COOKIE_ONLY', checkedAt, quotaHttpStatus: null, sessionHttpStatus: null};
  if (!validExpected(expectedIdentity))
    return result('IDENTITY_UNVERIFIED', 'EXPECTED_IDENTITY_REQUIRED', base);
  const quotaCookies = scopedCookies(snapshot, '/backend-api/wham/usage', clock());
  const sessionCookies = scopedCookies(snapshot, '/api/auth/session', clock());
  if (quotaCookies.error || sessionCookies.error)
    return result('UNAVAILABLE', quotaCookies.error || sessionCookies.error, base);
  if (!quotaCookies.count || !sessionCookies.count)
    return result('AUTH_REQUIRED', 'NO_ELIGIBLE_COOKIES', base);

  async function request(url, header) {
    const response = await fetchImpl(url, {
      method: 'GET', headers: {'accept': 'application/json', 'cookie': header},
      redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS), cache: 'no-store'
    });
    return response;
  }
  let quota;
  try { quota = await request(QUOTA_URL, quotaCookies.header); }
  catch { return result('UNAVAILABLE', 'QUOTA_NETWORK_ERROR', base); }
  base.quotaHttpStatus = quota.status;
  if (quota.status === 429) return result('RATE_LIMITED', 'QUOTA_RATE_LIMITED', base);
  if (quota.status === 401 || quota.status === 403) return result('AUTH_REQUIRED', 'QUOTA_REJECTED_COOKIE_ONLY', base);
  if (quota.status < 200 || quota.status >= 300)
    return result('UNAVAILABLE', quota.status >= 300 && quota.status < 400 ? 'REDIRECT_BLOCKED' : 'QUOTA_HTTP_ERROR', base);
  const quotaBody = await boundedJson(quota);
  if (quotaBody.error) return result('SCHEMA_UNKNOWN', `QUOTA_${quotaBody.error}`, base);
  const windows = windowsFrom(quotaBody.data);
  if (!windows) return result('SCHEMA_UNKNOWN', 'QUOTA_WINDOWS_UNRECOGNIZED', base);

  let session;
  try { session = await request(SESSION_URL, sessionCookies.header); }
  catch { return result('IDENTITY_UNVERIFIED', 'SESSION_NETWORK_ERROR', base); }
  base.sessionHttpStatus = session.status;
  if (session.status === 429) return result('RATE_LIMITED', 'SESSION_RATE_LIMITED', base);
  if (session.status === 401 || session.status === 403)
    return result('IDENTITY_UNVERIFIED', 'SESSION_REJECTED_COOKIES', base);
  if (session.status < 200 || session.status >= 300)
    return result('IDENTITY_UNVERIFIED', session.status >= 300 && session.status < 400 ? 'SESSION_REDIRECT_BLOCKED' : 'SESSION_HTTP_ERROR', base);
  const sessionBody = await boundedJson(session);
  if (sessionBody.error) return result('IDENTITY_UNVERIFIED', `SESSION_${sessionBody.error}`, base);
  const identityProblem = matchIdentity(sessionBody.data, expectedIdentity);
  if (identityProblem) return result('IDENTITY_UNVERIFIED', identityProblem, base);
  // If the quota payload supplies a workspace/account ID, it must match the
  // separately asserted ID. Never report success against an unknown workspace.
  const workspace = matchWorkspace(quotaBody.data, expectedIdentity);
  if (!workspace.verified)
    return result('IDENTITY_UNVERIFIED', workspace.reason, {
      ...base, sessionUserVerified: true, quotaSchemaRecognized: true
    });
  return result('OK', 'COOKIE_ONLY_CONFIRMED', {
    ...base, sessionUserVerified: true, workspaceVerified: true,
    workspaceEvidence: 'QUOTA_ACCOUNT_ID',
    windows, lastSuccessAt: checkedAt
  });
}
