// Fixed, read-only MAIN-world collector. Never accept executable code from callers.
function collectPageEnvironment() {
  const bytes = value => new TextEncoder().encode(value).byteLength;
  const text = (value, limit) => typeof value === 'string' && bytes(value) <= limit;
  const size = value => value && typeof value === 'object' &&
    Number.isFinite(value.width) && value.width >= 0 &&
    Number.isFinite(value.height) && value.height >= 0;
  const read = (get, valid) => {
    try {
      const value = get();
      return valid(value) ? {status: 'available', value, reasonCode: null} :
        {status: 'unknown', value: null, reasonCode: 'E_VALUE_INVALID'};
    } catch {
      return {status: 'unavailable', value: null, reasonCode: 'E_FIELD_UNAVAILABLE'};
    }
  };
  return {
    userAgent: read(() => navigator.userAgent, value => text(value, 1024)),
    languages: read(() => {
      const value = navigator.languages;
      // Copy only bounded string data; never pass page-owned objects through.
      if (!Array.isArray(value) || value.length > 16) return null;
      const result = [];
      for (let i = 0; i < value.length; i++) {
        const item = value[i];
        if (!text(item, 64)) return null;
        result.push(item);
      }
      return result;
    }, value => Array.isArray(value)),
    timeZone: read(() => Intl.DateTimeFormat().resolvedOptions().timeZone,
      value => text(value, 128)),
    viewport: read(() => ({width: window.innerWidth, height: window.innerHeight}), size),
    screen: read(() => ({width: window.screen.width, height: window.screen.height}), size),
    devicePixelRatio: read(() => window.devicePixelRatio,
      value => Number.isFinite(value) && value > 0)
  };
}

const fail = code => Object.assign(new Error(code), {code});
const REF = /^[A-Za-z0-9_-]{16,160}$/;
const FIELD_NAMES = ['userAgent', 'languages', 'timeZone', 'viewport', 'screen', 'devicePixelRatio'];
const bytes = value => new TextEncoder().encode(value).byteLength;
const text = (value, limit) => typeof value === 'string' && bytes(value) <= limit;
function exact(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return false;
  const actual = Reflect.ownKeys(value);
  return actual.length === keys.length && keys.every(key =>
    Object.hasOwn(value, key) && Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value'));
}
const size = value => exact(value, ['width', 'height']) &&
  Number.isFinite(value.width) && value.width >= 0 &&
  Number.isFinite(value.height) && value.height >= 0;
const validValue = (name, value) => {
  switch (name) {
    case 'userAgent': return text(value, 1024);
    case 'timeZone': return text(value, 128);
    case 'languages': return Array.isArray(value) && value.length <= 16 &&
      Reflect.ownKeys(value).length === value.length + 1 &&
      Array.from({length: value.length}, (_, i) => i).every(i =>
        Object.hasOwn(Object.getOwnPropertyDescriptor(value, String(i)) || {}, 'value') && text(value[i], 64));
    case 'viewport': case 'screen': return size(value);
    case 'devicePixelRatio': return Number.isFinite(value) && value > 0;
    default: return false;
  }
};
function validateFields(fields) {
  if (!exact(fields, FIELD_NAMES)) throw fail('E_ENVIRONMENT_UNAVAILABLE');
  for (const name of FIELD_NAMES) {
    const row = fields[name];
    if (!exact(row, ['status', 'value', 'reasonCode']) ||
        (row.status === 'available' ? row.reasonCode !== null || !validValue(name, row.value) :
          !['unavailable', 'unknown'].includes(row.status) || row.value !== null ||
          typeof row.reasonCode !== 'string' || !/^[A-Z][A-Z0-9_]{0,63}$/.test(row.reasonCode)))
      throw fail('E_ENVIRONMENT_UNAVAILABLE');
  }
  // Copy validated JSON data before awaiting any further trusted checks.
  return JSON.parse(JSON.stringify(fields));
}
function validateTarget(target) {
  if (!target || !Number.isSafeInteger(target.tabId) || target.tabId < 0 ||
      !Number.isSafeInteger(target.windowId) || target.windowId < 0 ||
      typeof target.documentId !== 'string' || !target.documentId || target.documentId.length > 160 ||
      typeof target.url !== 'string') throw fail('E_DOCUMENT_STALE');
  let url;
  try { url = new URL(target.url); } catch { throw fail('E_DOCUMENT_STALE'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.href !== target.url)
    throw fail('E_DOCUMENT_STALE');
  return {tabId: target.tabId, windowId: target.windowId, documentId: target.documentId, url: target.url};
}
const sameTarget = (a, b) => ['tabId', 'windowId', 'documentId', 'url'].every(key => a[key] === b[key]);

export function createPageEnvironmentReader({api, resolveTarget, authorize, timeoutMs = 3000, clock = Date} = {}) {
  if (typeof resolveTarget !== 'function' || typeof authorize !== 'function' ||
      !Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2147483647 || typeof clock?.now !== 'function')
    throw new TypeError('Trusted page environment driver configuration required');
  async function readEnvironment(args, context) {
    if (!exact(args, ['tabRef', 'documentRef']) ||
        typeof args.tabRef !== 'string' || !REF.test(args.tabRef) ||
        typeof args.documentRef !== 'string' || !REF.test(args.documentRef)) throw fail('E_SCHEMA');
    const refs = Object.freeze({tabRef: args.tabRef, documentRef: args.documentRef});
    let expired = false, timer;
    const deadline = clock.now() + timeoutMs;
    const check = () => { if (expired || clock.now() >= deadline) throw fail('E_TIMEOUT'); };
    const resolve = async () => {
      const target = await resolveTarget(refs, context);
      check();
      return validateTarget(target);
    };
    const permit = async target => {
      const allowed = await authorize({origin: new URL(target.url).origin, context});
      check();
      if (allowed !== true) throw fail('E_PERMISSION');
    };
    const operation = async () => {
      const target = await resolve();
      await permit(target);
      if (!sameTarget(target, await resolve())) throw fail('E_DOCUMENT_STALE');
      let rows;
      try {
        check();
        rows = await api.scripting.executeScript({
          target: {tabId: target.tabId, documentIds: [target.documentId]},
          world: 'MAIN', func: collectPageEnvironment
        });
      } catch (error) {
        check();
        throw fail('E_ENVIRONMENT_UNAVAILABLE');
      }
      check();
      if (!Array.isArray(rows) || rows.length !== 1 ||
          !exact(rows[0], ['frameId', 'documentId', 'result'])) throw fail('E_ENVIRONMENT_UNAVAILABLE');
      if (rows[0].frameId !== 0 || rows[0].documentId !== target.documentId) throw fail('E_DOCUMENT_STALE');
      const fields = validateFields(rows[0].result);
      if (!sameTarget(target, await resolve())) throw fail('E_DOCUMENT_STALE');
      await permit(target);
      // Authorization can yield while the page navigates: check once more before delivery.
      if (!sameTarget(target, await resolve())) throw fail('E_DOCUMENT_STALE');
      check();
      const receipt = {...refs, capturedAt: new Date(clock.now()).toISOString(),
        source: {kind: 'target-page-js', world: 'MAIN', frameId: 0}, fields};
      if (bytes(JSON.stringify(receipt)) > 8192) throw fail('E_LIMIT');
      return receipt;
    };
    try {
      return await Promise.race([operation(), new Promise((_, reject) => {
        timer = setTimeout(() => { expired = true; reject(fail('E_TIMEOUT')); }, timeoutMs);
      })]);
    } finally {
      // Stops delivery/continuations only; executeScript cannot interrupt page JS.
      expired = true;
      clearTimeout(timer);
    }
  }
  return Object.freeze({readEnvironment});
}
