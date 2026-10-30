import {createHash} from 'node:crypto';
import {isIP} from 'node:net';

export const SCHEMA = 'scrapyjs.private-cellular-poc.v1';
export const MAX_BODY_BYTES = 24 * 1024;
export const MAX_REPORT_BYTES = 128 * 1024;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = (code, description) => {const e = new Error(description); e.code = code; throw e;};
const plain = x => Boolean(x) && typeof x === 'object' && !Array.isArray(x);
const exactKeys = (x, keys) => plain(x) && Object.keys(x).sort().join('|') === [...keys].sort().join('|');

export function validateAllowedOrigin(origin) {
  if (typeof origin !== 'string' || origin.length > 200) fail('E_ORIGIN', 'Missing controlled test origin');
  let url;
  try {url = new URL(origin);} catch {fail('E_ORIGIN', 'Invalid origin');}
  if (url.protocol !== 'https:' || url.origin !== origin || url.username || url.password ||
      url.hostname === 'localhost' || url.hostname.endsWith('.local') || url.hostname.endsWith('.invalid') ||
      url.hostname.endsWith('.internal') || isIP(url.hostname) ||
      !url.hostname.includes('.')) fail('E_ORIGIN', 'Origin must be an exact public HTTPS hostname');
  return origin;
}

export function validateReport(report, allowedOrigin) {
  validateAllowedOrigin(allowedOrigin);
  if (!exactKeys(report, ['schema','runId','mode','shared','origin','wifiIp','cellularIp',
    'wifiNetworkHandle','cellularNetworkHandle','durationMs','pages']) ||
      report.schema !== SCHEMA || !uuid.test(report.runId) ||
      report.mode !== 'private' || report.shared !== false || report.origin !== allowedOrigin)
    fail('E_REPORT_SCHEMA', 'Unreviewed report or non-private node');
  if (typeof report.wifiIp !== 'string' || typeof report.cellularIp !== 'string' ||
      !isIP(report.wifiIp) || !isIP(report.cellularIp) || report.wifiIp === report.cellularIp)
    fail('E_EGRESS', 'Distinct network egress proof is missing');
  if (![report.wifiNetworkHandle,report.cellularNetworkHandle].every(h => typeof h === 'string' && /^[0-9]{1,22}$/.test(h)) ||
      report.wifiNetworkHandle === report.cellularNetworkHandle ||
      !Number.isInteger(report.durationMs) || report.durationMs < 0 || report.durationMs > 60000)
    fail('E_TRANSPORT', 'Network identity or time budget invalid');
  if (!Array.isArray(report.pages) || report.pages.length < 1 || report.pages.length > 3)
    fail('E_PAGE_BUDGET', 'Only 1 to 3 pages can be reported');
  const seen = new Set();
  let bytes = 0;
  for (const p of report.pages) {
    if (!exactKeys(p, ['url','status','bytes','sha256','bodyBase64']) ||
        typeof p.url !== 'string' || p.url.length > 2048 ||
        !Number.isInteger(p.status) || p.status !== 200 ||
        !Number.isInteger(p.bytes) || p.bytes < 1 || p.bytes > MAX_BODY_BYTES ||
        typeof p.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(p.sha256) ||
        typeof p.bodyBase64 !== 'string' || p.bodyBase64.length > MAX_BODY_BYTES * 2 ||
        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(p.bodyBase64))
      fail('E_PAGE_DATA', 'Page data or body budget invalid');
    let url;
    try {url = new URL(p.url);} catch {fail('E_PAGE_ORIGIN', 'Invalid page URL');}
    if (url.origin !== allowedOrigin || url.username || url.password || url.hash || seen.has(url.href))
      fail('E_PAGE_ORIGIN', 'Page outside approved origin or duplicated');
    seen.add(url.href);
    const body = Buffer.from(p.bodyBase64, 'base64');
    if (body.toString('base64') !== p.bodyBase64 || body.length !== p.bytes ||
        digest(body) !== p.sha256) fail('E_BODY_HASH', 'Page body differs from receipt');
    bytes += body.length;
  }
  if (bytes > 3 * MAX_BODY_BYTES || Buffer.byteLength(JSON.stringify(report)) > MAX_REPORT_BYTES)
    fail('E_TOTAL_BUDGET', 'Report exceeds fixed budget');
  return {runId:report.runId, pageCount:report.pages.length, capturedBytes:bytes,
    sha256:digest(Buffer.from(JSON.stringify(report)))};
}

export function isPrivateLanAddress(input) {
  if (typeof input !== 'string') return false;
  const ip = input.startsWith('::ffff:') ? input.slice(7) : input.split('%')[0];
  if (isIP(ip) === 6) return ip === '::1' || /^f[cd][0-9a-f:]+$/i.test(ip) || /^fe[89ab][0-9a-f:]+$/i.test(ip);
  if (isIP(ip) !== 4) return false;
  const a = ip.split('.').map(Number);
  return a[0] === 10 || a[0] === 127 || (a[0] === 192 && a[1] === 168) ||
    (a[0] === 172 && a[1] >= 16 && a[1] <= 31);
}
