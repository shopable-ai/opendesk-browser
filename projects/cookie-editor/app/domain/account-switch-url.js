// Cookie Editor R2.3: one canonical URL contract, no Cookie secrets.
// This pure module never performs an account switch itself. A privileged,
// always-on Host must explicitly authorize both site and account before use.
export const ACCOUNT_SWITCH_KEY = 'od-account';
const ALIAS = /^[A-Za-z0-9][A-Za-z0-9_-]{2,47}$/;
const failure = code => Object.assign(new Error(code), {code});

function urlOf(value) {
  if (typeof value !== 'string' || value.length > 2048 ||
      value !== value.trim()) throw failure('E_URL_INVALID');
  let url;
  try { url = new URL(value); } catch { throw failure('E_URL_INVALID'); }
  if (!['http:', 'https:'].includes(url.protocol) ||
      url.username || url.password || !url.hostname)
    throw failure('E_URL_INVALID');
  return url;
}
function originOf(value) {
  const url = urlOf(value);
  if (url.origin !== value) throw failure('E_SITE_MISMATCH');
  return url.origin;
}
function aliasOf(value) {
  if (typeof value !== 'string' || !ALIAS.test(value) ||
      /session|token/i.test(value))
    throw failure('E_ALIAS_INVALID');
  return value;
}
// The user never selects Query/Fragment. Existing URL routers and query
// state must not be overwritten or accidentally carry credential-like data.
export function createAccountSwitchUrl(siteUrl, alias, {
  approvedFragment = false, expectedOrigin
} = {}) {
  if (!approvedFragment) throw failure('E_SITE_ADAPTER_REQUIRED');
  const url = urlOf(siteUrl);
  aliasOf(alias);
  if (expectedOrigin && url.origin !== originOf(expectedOrigin))
    throw failure('E_SITE_MISMATCH');
  if (url.pathname !== '/' || url.hash || url.search)
    throw failure('E_ROUTE_CONFLICT');
  url.hash = ACCOUNT_SWITCH_KEY + '=' + alias;
  return url.href;
}
// For the always-on runtime to call after it has obtained trusted settings.
// "eligible" is NOT confirmation that Cookies were written or page reloaded.
export function inspectAccountSwitchUrl(value, {
  expectedOrigin, enabled = false, approvedFragment = false, allowedAliases = []
} = {}) {
  let url;
  try { url = urlOf(value); }
  catch { return {status: 'invalid', code: 'E_URL_INVALID'}; }
  if (url.searchParams.has(ACCOUNT_SWITCH_KEY))
    return {status: 'invalid', code: 'E_QUERY_NOT_SUPPORTED'};
  if (!url.hash.startsWith('#' + ACCOUNT_SWITCH_KEY + '='))
    return {status: 'none'};
  const raw = url.hash.slice(('#' + ACCOUNT_SWITCH_KEY + '=').length);
  try { aliasOf(raw); }
  catch { return {status: 'invalid', code: 'E_ALIAS_INVALID'}; }
  if (url.pathname !== '/' || url.hash !== '#' + ACCOUNT_SWITCH_KEY + '=' + raw || url.search)
    return {status: 'invalid', code: 'E_ROUTE_CONFLICT'};
  if (!expectedOrigin) return {status: 'blocked', code: 'E_SITE_NOT_APPROVED'};
  let origin;
  try { origin = originOf(expectedOrigin); }
  catch { return {status: 'blocked', code: 'E_SITE_NOT_APPROVED'}; }
  if (url.origin !== origin)
    return {status: 'blocked', code: 'E_SITE_MISMATCH'};
  if (!approvedFragment)
    return {status: 'blocked', code: 'E_SITE_ADAPTER_REQUIRED'};
  if (!enabled)
    return {status: 'blocked', code: 'E_AUTO_SWITCH_OFF'};
  if (!Array.isArray(allowedAliases) || !allowedAliases.includes(raw))
    return {status: 'blocked', code: 'E_ALIAS_NOT_ALLOWED'};
  return {status: 'eligible', alias: raw, origin: url.origin};
}
