// Shared input contract, not an authority, permission store or SDK method.
// The trusted tool must show the normalized values before requesting approval.
// Only the existing host authority may attach this scope to a document grant.
export const MAX_SDK_TARGET_ORIGINS = 8;
export const MAX_SDK_ORIGIN_LENGTH = 2048;

function invalid(message) {
  const error = new TypeError(message);
  error.code = 'E_SCHEMA';
  throw error;
}

export function normalizeSdkOrigin(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_SDK_ORIGIN_LENGTH)
    invalid('An SDK target must be a nonempty origin string within the length budget');
  // Do not let URL's whitespace, backslash, empty-userinfo or dot-path cleanup
  // turn a visibly different approval into an origin-only approval.
  if (/[\u0000-\u0020\u007f-\u009f\s\\@*?#%]/u.test(value) || !/^https?:\/\/[^/]+\/?$/i.test(value))
    invalid('SDK origins require HTTP(S), without credentials, wildcards, paths, query or fragment');
  let url;
  try { url = new URL(value); }
  catch { invalid('Invalid SDK target origin'); }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.origin === 'null' ||
      url.username || url.password || url.pathname !== '/' || url.search || url.hash)
    invalid('Only exact HTTP(S) origins can be approved');
  return url.origin;
}

/**
 * targetOrigins is the COMPLETE additional approval set, not a patch/union with
 * an existing grant. Omission and [] both mean same-origin only. Every extra
 * origin, including loopback/LAN, must be individually listed by the trusted
 * tool; this parser never adds a host, subdomain, port or network range.
 *
 * This does not request browser permissions, resolve DNS, prevent DNS rebinding,
 * validate a sender or make an authorization decision. Native host patterns must
 * never be used instead of allowedOrigins' exact canonical string membership.
 */
export function normalizeSdkTargetScope(sourceOrigin, targetOrigins = []) {
  const source = normalizeSdkOrigin(sourceOrigin);
  if (!Array.isArray(targetOrigins) || targetOrigins.length > MAX_SDK_TARGET_ORIGINS)
    invalid(`SDK approval accepts at most ${MAX_SDK_TARGET_ORIGINS} additional origin entries`);
  // Bound raw entries as well as the output: deduplication is not an input budget.
  const targets = [...new Set(Array.from(targetOrigins, normalizeSdkOrigin))]
    .filter(origin => origin !== source).sort();
  return Object.freeze({
    sourceOrigin: source,
    targetOrigins: Object.freeze(targets),
    allowedOrigins: Object.freeze([source, ...targets].sort())
  });
}
