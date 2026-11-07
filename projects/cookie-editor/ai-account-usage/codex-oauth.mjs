import https from 'node:https';

const URL = 'https://chatgpt.com/backend-api/wham/usage';
const MAX = 98304;
const TIMEOUT = 10000;
const AUTH = 'https://api.openai.com/auth';
const PROFILE = 'https://api.openai.com/profile';
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const id = x => typeof x === 'string' && /^[A-Za-z0-9_.:@|+-]{1,256}$/.test(x);
const limitIdValid = x => typeof x === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(x);
const email = x => typeof x === 'string' && x.length <= 320 && /^[^\s@]+@[^\s@]+$/.test(x);
const name = x => typeof x === 'string' && x.trim().length > 0 && x.length <= 128 && !/[\x00-\x1f\x7f]/.test(x);

// Claims are decoded for binding only; this is NOT independent JWT signature verification.
function claims(token) {
  if (typeof token !== 'string' || token.length > 32768 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) return null;
  try {
    const parts = token.split('.');
    const decode = part => {
      const bytes = Buffer.from(part, 'base64url');
      if (bytes.toString('base64url') !== part) throw Error();
      return JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes));
    };
    const header = decode(parts[0]);
    const data = decode(parts[1]);
    if (!object(header) || typeof header.alg !== 'string' || header.alg.toLowerCase() === 'none' ||
        !object(data) || data.iss !== 'https://auth.openai.com' || !id(data.sub) || !object(data[AUTH])) return null;
    return data;
  } catch { return null; }
}

function bound(snapshot, expected, now) {
  if (!object(snapshot) || snapshot.authMode !== 'chatgpt' ||
      Object.keys(snapshot).some(key => /refresh/i.test(key)) || !id(snapshot.accountId)) return false;
  const access = claims(snapshot.accessToken), identity = claims(snapshot.idToken);
  if (!access || !identity || !Number.isSafeInteger(access.exp) || access.exp <= now / 1000 ||
      (access.nbf !== undefined && (!Number.isSafeInteger(access.nbf) || access.nbf > now / 1000)) ||
      identity.sub !== access.sub) return false;
  const mail = data => data.email ?? data[PROFILE]?.email;
  const aMail = mail(access), iMail = mail(identity);
  if (!email(aMail) || !email(iMail) || aMail.toLowerCase() !== iMail.toLowerCase() ||
      (expected.email !== undefined && expected.email.toLowerCase() !== aMail.toLowerCase())) return false;
  return [access, identity].every(data => data[AUTH].chatgpt_user_id === expected.userId &&
    data[AUTH].chatgpt_account_id === expected.accountId && data[AUTH].chatgpt_account_id === snapshot.accountId);
}

// Single native request: no redirects, retries, refresh, proxy discovery or logging.
function nativeRequest(url, {headers, method, timeoutMs}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, {headers, method, agent: false}, res => {
      res.once('close', () => clearTimeout(timer));
      resolve({status: res.statusCode, headers: res.headers, body: res});
    });
    const timer = setTimeout(() => req.destroy(new Error('timeout')), timeoutMs);
    req.once('error', error => { clearTimeout(timer); reject(error); });
    req.setTimeout(timeoutMs, () => req.destroy(new Error('timeout')));
    req.end();
  });
}
const header = (response, name) => response.headers?.get?.(name) ?? response.headers?.[name];
function cancel(response) {
  try { response?.body?.destroy?.(); response?.body?.cancel?.()?.catch?.(() => {}); } catch {}
}
async function json(response) {
  if (!/^application\/(?:[\w.-]+\+)?json(?:\s*;|$)/i.test(header(response, 'content-type') || '')) throw Error('NOT_JSON');
  if (Number(header(response, 'content-length')) > MAX) throw Error('BODY_TOO_LARGE');
  const body = response.body;
  let bytes;
  if (typeof body === 'string' || Buffer.isBuffer(body) || body instanceof Uint8Array) {
    if (Buffer.byteLength(body) > MAX) throw Error('BODY_TOO_LARGE');
    bytes = Buffer.from(body);
  } else {
    if (!body?.[Symbol.asyncIterator]) throw Error('EMPTY_BODY');
    const chunks = []; let size = 0;
    for await (const chunk of body) {
      const part = Buffer.from(chunk); size += part.length;
      if (size > MAX) throw Error('BODY_TOO_LARGE');
      chunks.push(part);
    }
    bytes = Buffer.concat(chunks);
  }
  const data = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes));
  if (!object(data)) throw Error('NOT_OBJECT');
  return data;
}
function windowsFrom(data) {
  const windows = [], ids = new Set(['codex']);
  const buckets = [['codex', data.rate_limit]];
  if (data.additional_rate_limits != null) {
    if (!Array.isArray(data.additional_rate_limits) || data.additional_rate_limits.length > 15) return null;
    for (const row of data.additional_rate_limits) {
      // Upstream uses metered_feature for identity; limit_name is only a label.
      if (!object(row) || !limitIdValid(row.metered_feature) || ids.has(row.metered_feature)) return null;
      ids.add(row.metered_feature); buckets.push([row.metered_feature, row.rate_limit]);
    }
  }
  for (const [limitId, bucket] of buckets) {
    if (bucket == null) continue; // Missing quota is unknown, never zero usage.
    if (!object(bucket) || !('primary_window' in bucket || 'secondary_window' in bucket)) return null;
    for (const [key, raw] of [['primary', bucket.primary_window], ['secondary', bucket.secondary_window]]) {
      if (raw == null) continue;
      if (!object(raw) || typeof raw.used_percent !== 'number' || !Number.isFinite(raw.used_percent) ||
          raw.used_percent < 0 || raw.used_percent > 100 || !Number.isSafeInteger(raw.limit_window_seconds) ||
          raw.limit_window_seconds < 60 || raw.limit_window_seconds > 366 * 86400 ||
          !Number.isSafeInteger(raw.reset_at) || raw.reset_at <= 0 ||
          !Number.isFinite(new Date(raw.reset_at * 1000).getTime())) return null;
      windows.push({limitId, key, durationSeconds: raw.limit_window_seconds, usedPercent: raw.used_percent,
        remainingPercent: Math.round((100 - raw.used_percent) * 100) / 100,
        resetsAt: new Date(raw.reset_at * 1000).toISOString()});
    }
  }
  return windows.length ? windows : null;
}

/** Offline injection: requestImpl(url, {headers, method, timeoutMs}) returns a
 * Response-like object or {status, headers, body} (UTF-8 string/bytes or async
 * iterable). It must honor the fixed URL and single-request/no-redirect contract.
 * The deadline also bounds injected transports; their late bodies are discarded.
 */
export async function probeCodexOAuth({snapshot, expectedIdentity, requestImpl = nativeRequest, clock = Date.now} = {}) {
  const now = clock();
  const base = {mode: 'CODEX_OAUTH', checkedAt: new Date(now).toISOString(), quotaHttpStatus: null, sessionHttpStatus: null};
  const result = (status, reason, extra = {}) => ({status, reason, ...base, ...extra});
  if (!object(expectedIdentity) || !id(expectedIdentity.userId) || !id(expectedIdentity.accountId) ||
      (expectedIdentity.email !== undefined && !email(expectedIdentity.email))) return result('IDENTITY_UNVERIFIED', 'EXPECTED_IDENTITY_REQUIRED');
  if (!bound(snapshot, expectedIdentity, now)) return result('AUTH_REQUIRED', 'OAUTH_AUTH_INVALID');
  let response, timer, expired = false;
  const deadline = new Promise((_, reject) => { timer = setTimeout(() => {
    expired = true; cancel(response); reject(Error('timeout'));
  }, TIMEOUT); });
  try {
    const work = (async () => {
      response = await requestImpl(URL, {method: 'GET', timeoutMs: TIMEOUT,
        headers: {accept: 'application/json', authorization: `Bearer ${snapshot.accessToken}`,
          'ChatGPT-Account-Id': snapshot.accountId, 'User-Agent': 'codex-cli'}});
      if (expired) { cancel(response); return; }
      const status = response.status;
      if (!Number.isInteger(status) || status < 100 || status > 599) return result('UNAVAILABLE', 'QUOTA_HTTP_ERROR');
      base.quotaHttpStatus = status;
      if (status === 429) return result('RATE_LIMITED', 'QUOTA_RATE_LIMITED');
      if (status === 401 || status === 403) return result('AUTH_REQUIRED', 'QUOTA_REJECTED_OAUTH');
      if (status < 200 || status >= 300) return result('UNAVAILABLE', status < 400 && status >= 300 ? 'REDIRECT_BLOCKED' : 'QUOTA_HTTP_ERROR');
      let data;
      try { data = await json(response); } catch { return result('SCHEMA_UNKNOWN', 'QUOTA_BODY_INVALID'); }
      if (data.user_id !== expectedIdentity.userId || data.account_id !== expectedIdentity.accountId)
        return result('IDENTITY_UNVERIFIED', 'QUOTA_IDENTITY_MISMATCH');
      const cached = claims(snapshot.idToken);
      const cachedEmail = cached.email ?? cached[PROFILE]?.email;
      if (data.email != null && (!email(data.email) || data.email.toLowerCase() !== cachedEmail.toLowerCase()))
        return result('IDENTITY_UNVERIFIED', 'QUOTA_EMAIL_MISMATCH');
      if (data.name != null && !name(data.name)) return result('SCHEMA_UNKNOWN', 'QUOTA_PROFILE_INVALID');
      const profile = {userId: data.user_id, accountId: data.account_id,
        email: data.email ?? cachedEmail, emailSource: data.email != null ? 'USAGE_RESPONSE' : 'OAUTH_CACHE',
        displayName: data.name ?? (name(cached.name) ? cached.name : null),
        displayNameSource: data.name != null ? 'USAGE_RESPONSE' : name(cached.name) ? 'OAUTH_CACHE' : 'UNKNOWN',
        observedAt: base.checkedAt};
      const windows = windowsFrom(data);
      if (!windows) return result('SCHEMA_UNKNOWN', 'QUOTA_WINDOWS_UNRECOGNIZED');
      return result('OK', 'CODEX_OAUTH_CONFIRMED', {sessionUserVerified: true, workspaceVerified: true,
        workspaceEvidence: 'OAUTH_USAGE_USER_AND_ACCOUNT_IDS', identityEvidence: 'OAUTH_TOKEN_CLAIMS_AND_USAGE_RESPONSE_USER_ACCOUNT_IDS',
        planType: typeof data.plan_type === 'string' && /^[A-Za-z0-9_ -]{1,40}$/.test(data.plan_type) ? data.plan_type : null,
        identity: profile, windows, lastSuccessAt: base.checkedAt});
    })();
    return await Promise.race([work, deadline]);
  } catch { return result('UNAVAILABLE', 'QUOTA_NETWORK_ERROR'); }
  finally { clearTimeout(timer); cancel(response); }
}
