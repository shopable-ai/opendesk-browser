// Production is deliberately unconfigured until one fixed service is reviewed.
// This declaration and parser grant no permissions and perform no discovery or IO.
export const REVIEWED_SERVICE = null;

const SERVICE_KEYS = ['id', 'label', 'url', 'endpoints', 'activation', 'cookieTargets',
  'catalogUrl', 'desktopClientUrl'];
const ENDPOINT_KEYS = ['member', 'voucherPreview', 'voucherRedeem', 'voucherStatus'];
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/u;
const CODE = /^[A-Za-z0-9._-]{6,120}$/u;

function fail(code) { throw Object.assign(new Error(code), { code }); }
function requireConfig(ok) { if (!ok) fail('E_SERVICE_CONFIG'); }

function exactObject(value, keys) {
  requireConfig(value !== null && typeof value === 'object' &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value)));
  const own = Reflect.ownKeys(value);
  requireConfig(own.length === keys.length && keys.every(key => own.includes(key) &&
    Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value')));
}

function fixedPath(path) {
  // No percent decoding, dot-segment removal, backslashes or repeated separators.
  return typeof path === 'string' && /^\/[A-Za-z0-9._~!$&'()*+,;=:@/-]*$/u.test(path) &&
    !path.includes('//') && !path.split('/').some(part => part === '.' || part === '..');
}

function publicDns(host) {
  if (host.length > 253 || !host.includes('.')) return false;
  const labels = host.split('.');
  if (!labels.every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(label)) ||
      !/^[a-z][a-z0-9-]*$/u.test(labels.at(-1))) return false;
  return !labels.some(label => ['localhost', 'local', 'localdomain', 'internal',
    'intranet', 'lan', 'home', 'corp', 'onion', 'invalid', 'test', 'arpa'].includes(label));
}

function strictUrl(value, errorCode, allowQuery = false) {
  const reject = () => fail(errorCode);
  if (typeof value !== 'string' || value.length > 2048 || CONTROL.test(value) ||
      /[\s\\%#]/u.test(value)) reject();
  // Inspect the original authority: URL.port drops explicit default ports.
  const parts = /^https:\/\/([^/?#]+)([^?#]*)(\?[^#]*)?$/u.exec(value);
  if (!parts || !/^[A-Za-z0-9.-]+$/u.test(parts[1]) ||
      (!allowQuery && parts[3]) || !fixedPath(parts[2] || '/')) reject();
  let url;
  try { url = new URL(value); } catch { reject(); }
  if (!publicDns(url.hostname) || url.protocol !== 'https:' || url.username ||
      url.password || url.port || url.hash || url.pathname !== (parts[2] || '/')) reject();
  return url;
}

/** Validate fixed, release-owned metadata; never call this with page-discovered policy.
 * Returns a detached deeply frozen definition, with canonical HTTPS URLs.
 * DNS syntax validation does not establish network authorization or DNS resolution.
 */
export function validateServiceDefinition(raw) {
  try {
    exactObject(raw, SERVICE_KEYS);
    requireConfig(typeof raw.id === 'string' && /^[A-Za-z0-9._-]{1,80}$/u.test(raw.id));
    requireConfig(typeof raw.label === 'string' && raw.label.length >= 1 &&
      raw.label.length <= 100 && raw.label.trim() === raw.label && !CONTROL.test(raw.label));
    const base = strictUrl(raw.url, 'E_SERVICE_CONFIG');
    exactObject(raw.endpoints, ENDPOINT_KEYS);
    const endpoints = {};
    for (const key of ENDPOINT_KEYS) {
      const endpoint = strictUrl(raw.endpoints[key], 'E_SERVICE_CONFIG');
      requireConfig(endpoint.origin === base.origin);
      endpoints[key] = endpoint.href;
    }
    requireConfig(new Set(Object.values(endpoints)).size === ENDPOINT_KEYS.length);
    exactObject(raw.activation, ['path', 'parameter']);
    requireConfig(fixedPath(raw.activation.path) && raw.activation.path.length <= 2048 &&
      raw.activation.parameter === 'activation_code');
    requireConfig(Array.isArray(raw.cookieTargets));
    // Reject sparse arrays, accessor entries and additional dynamic metadata.
    requireConfig(Reflect.ownKeys(raw.cookieTargets).length === raw.cookieTargets.length + 1);
    const cookieTargets = Array.from({ length: raw.cookieTargets.length }, (_, index) => {
      const entry = Object.getOwnPropertyDescriptor(raw.cookieTargets, String(index));
      requireConfig(entry && Object.hasOwn(entry, 'value'));
      return strictUrl(entry.value, 'E_SERVICE_CONFIG').href;
    });
    const promotion = value => value === '' ? '' : strictUrl(value, 'E_SERVICE_CONFIG').href;
    return Object.freeze({
      id: raw.id, label: raw.label, url: base.href,
      endpoints: Object.freeze(endpoints),
      activation: Object.freeze({ path: raw.activation.path, parameter: 'activation_code' }),
      cookieTargets: Object.freeze(cookieTargets),
      catalogUrl: promotion(raw.catalogUrl), desktopClientUrl: promotion(raw.desktopClientUrl)
    });
  } catch { fail('E_SERVICE_CONFIG'); }
}

/** Pure parsing only: the activation code is returned in memory, never persisted.
 * The optional service argument is for an already reviewed fixed declaration, not discovery.
 */
export function parseServiceLink(input, service = REVIEWED_SERVICE) {
  // Reject control characters before trimming so newlines cannot disguise an input.
  if (typeof input !== 'string' || input.length > 2048 || CONTROL.test(input)) {
    fail('E_SERVICE_LINK');
  }
  const url = strictUrl(input.trim(), 'E_SERVICE_LINK', true);
  let code = null;
  if (url.search || input.trim().includes('?')) {
    // Compare raw syntax instead of URLSearchParams' percent/plus decoding.
    const match = /^\?activation_code=([A-Za-z0-9._-]{6,120})$/u.exec(url.search);
    if (!match || !CODE.test(match[1])) fail('E_SERVICE_LINK');
    code = match[1];
  }
  if (service === null || service === undefined) fail('E_SERVICE_NOT_CONFIGURED');
  const definition = validateServiceDefinition(service);
  if (code === null && url.href === definition.url) {
    return { service: definition, code: null, kind: 'service' };
  }
  if (code !== null && url.origin === new URL(definition.url).origin &&
      url.pathname === definition.activation.path) {
    return { service: definition, code, kind: 'activation' };
  }
  fail('E_SERVICE_UNSUPPORTED');
}
