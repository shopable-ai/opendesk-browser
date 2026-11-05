export const LOCAL_CHATGPT = Object.freeze({
  key: 'local-chatgpt',
  site: Object.freeze({siteId: 'chatgpt', label: 'ChatGPT', targetUrl: 'https://chatgpt.com/', policyVersion: '1'})
});

const FIELDS = new Set(['name', 'value', 'domain', 'path', 'hostOnly', 'secure', 'httpOnly',
  'sameSite', 'expirationDate', 'session', 'storeId', 'partitionKey', 'valueRedacted']);
const encoder = new TextEncoder();
const bytes = value => encoder.encode(value).length;
const own = (value, key) => Object.hasOwn(value, key);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function reject(line) {
  const error = new Error(line ? `第 ${line} 行 Cookie 数据无效或不安全` : 'Cookie 文件格式无效或超过限制');
  error.code = 'E_COOKIE_FILE';
  throw error;
}

/** Pure preflight only. Context fields are export claims, never proof of current context.
 * earliestExpiry is Unix milliseconds, or null when every cookie is a session cookie.
 * Each returned batch requires its own explicit user confirmation before setMany.
 */
export function preflightCookieFile(text, now = Date.now()) {
  if (typeof text !== 'string' || bytes(text) > 64 * 1024 || !Number.isFinite(now)) reject();
  let rows;
  try { rows = JSON.parse(text); } catch { reject(); }
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > 50) reject();

  const groups = new Map(), seen = new Set();
  rows.forEach((row, index) => {
    const line = index + 1;
    if (!record(row) || Object.keys(row).some(key => !FIELDS.has(key)) ||
        typeof row.name !== 'string' || row.name.length > 256 ||
        !/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(row.name) ||
        typeof row.value !== 'string' || /[\x00-\x1f\x7f-\x9f;]/.test(row.value) ||
        /[\uD800-\uDFFF]/u.test(row.value) || bytes(row.value) > 4096 ||
        /^(?:\*+|\[redacted\]|<redacted>|redacted|\[opaque\]|<opaque>)$/i.test(row.value) ||
        !['chatgpt.com', '.chatgpt.com'].includes(row.domain) || row.path !== '/' ||
        ['hostOnly', 'secure', 'httpOnly', 'session'].some(key => typeof row[key] !== 'boolean') ||
        row.hostOnly !== (row.domain === 'chatgpt.com') ||
        !['unspecified', 'lax', 'strict', 'no_restriction'].includes(row.sameSite) ||
        (own(row, 'valueRedacted') && row.valueRedacted !== false) ||
        (row.sameSite === 'no_restriction' && !row.secure) ||
        (row.name.startsWith('__Secure-') && !row.secure) ||
        (row.name.startsWith('__Host-') && (!row.secure || !row.hostOnly)) ||
        (row.name.startsWith('__Http-') && (!row.secure || !row.httpOnly)) ||
        (row.name.startsWith('__Host-Http-') && !row.httpOnly)) reject(line);

    if (row.session ? own(row, 'expirationDate') :
        (!Number.isFinite(row.expirationDate) || row.expirationDate <= 0 ||
         row.expirationDate > 4102444800)) reject(line);
    if (own(row, 'storeId') && (typeof row.storeId !== 'string' ||
        !/^[A-Za-z0-9_-]{1,64}$/.test(row.storeId))) reject(line);
    // Omitted stores may resolve to an explicit store; reject ambiguity before batching.
    if (own(row, 'storeId') !== own(rows[0], 'storeId')) reject(line);
    if (row.storeId !== rows[0].storeId) reject(line);
    if (own(row, 'partitionKey') && (!record(row.partitionKey) ||
        Object.keys(row.partitionKey).length !== 2 ||
        row.partitionKey.topLevelSite !== 'https://chatgpt.com' ||
        typeof row.partitionKey.hasCrossSiteAncestor !== 'boolean')) reject(line);

    const partition = own(row, 'partitionKey') ?
      [row.partitionKey.topLevelSite, row.partitionKey.hasCrossSiteAncestor] : null;
    const groupKey = JSON.stringify([row.storeId ?? null, partition]);
    // Domain spelling and security attributes cannot bypass duplicate-slot detection.
    const identity = JSON.stringify([groupKey, row.name, 'chatgpt.com', row.path]);
    if (seen.has(identity)) reject(line);
    seen.add(identity);

    const cookie = {name: row.name, value: row.value, path: row.path, secure: row.secure,
      httpOnly: row.httpOnly, sameSite: row.sameSite};
    if (!row.hostOnly) cookie.domain = row.domain;
    if (!row.session) {
      cookie.expirationDate = row.expirationDate;
    }
    if (own(row, 'storeId')) cookie.storeId = row.storeId;
    if (own(row, 'partitionKey')) cookie.partitionKey = {...row.partitionKey};
    if (!groups.has(groupKey)) groups.set(groupKey, {url: LOCAL_CHATGPT.site.targetUrl, cookies: []});
    groups.get(groupKey).cookies.push(cookie);
  });
  const validated = [...groups.values()];
  // Validate the complete export (including request budgets) before excluding any
  // expired records. Filtering must never hide unsafe or ambiguous input.
  if (validated.some(batch => batch.cookies.length > 50 || bytes(JSON.stringify(batch)) > 12000)) reject();
  // Non-secret claims allow the controller to check the complete export's
  // browser context even when every cookie in one partition is expired.
  const contexts = validated.map(batch => ({storeId: batch.cookies[0].storeId,
    partitionKey: batch.cookies[0].partitionKey ?? null}));
  let earliestExpiry = null, count = 0;
  const batches = validated.map(batch => ({...batch, cookies: batch.cookies.filter(cookie => {
    if (cookie.expirationDate !== undefined) {
      if (cookie.expirationDate <= now / 1000) return false;
      earliestExpiry = Math.min(earliestExpiry ?? Infinity, cookie.expirationDate * 1000);
    }
    count++;
    return true;
  })})).filter(batch => batch.cookies.length);
  return {batches, contexts, count, totalCount: rows.length, skippedCount: rows.length - count, earliestExpiry};
}
