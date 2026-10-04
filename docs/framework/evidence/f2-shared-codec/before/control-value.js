// Values, including explicit undefined, survive Chrome's JSON message transport.
export class PageError extends Error {
  constructor(code, message = code, cause) {
    super(message, cause === undefined ? undefined : {cause});
    this.name = 'PageError'; this.code = code;
  }
}
export function requireValue(condition, code, message) {
  if (!condition) throw new PageError(code, message);
}
export const VALUE_LIMITS = Object.freeze({depth: 12, bytes: 65536, uploadBytes: 1048576, chunkBytes: 49152});
const randomValues = crypto.getRandomValues.bind(crypto);
export function newPageRequestId() {
  // randomUUID is absent in opaque insecure contexts; getRandomValues is native
  // there too. The request ID is correlation only, never an authorization token.
  const bytes = randomValues(new Uint8Array(16));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}
export function encodeValue(value, {maxBytes = VALUE_LIMITS.bytes} = {}) {
  const seen = new Set();
  function visit(v, depth) {
    requireValue(depth <= VALUE_LIMITS.depth, 'E_VALUE_SERIALIZATION', 'Value exceeds depth budget');
    if (v === undefined) return {t: 'undefined'};
    if (v === null) return {t: 'null'};
    if (typeof v === 'string' || typeof v === 'boolean') return {t: typeof v, v};
    if (typeof v === 'number') {
      requireValue(Number.isFinite(v), 'E_VALUE_SERIALIZATION', 'Only finite numbers are supported');
      return Object.is(v, -0) ? {t: 'negative-zero'} : {t: 'number', v};
    }
    requireValue(typeof v === 'object' && !seen.has(v), 'E_VALUE_SERIALIZATION', 'Unsupported or cyclic value');
    seen.add(v);
    let result;
    if (Array.isArray(v)) result = {t: 'array', v: Array.from(v, item => visit(item, depth + 1))};
    else {
      const proto = Object.getPrototypeOf(v);
      requireValue(proto === Object.prototype || proto === null, 'E_VALUE_SERIALIZATION', 'Only plain objects are supported');
      result = {t: 'object', v: Object.keys(v).map(key => {
        const descriptor = Object.getOwnPropertyDescriptor(v, key);
        requireValue(descriptor && 'value' in descriptor, 'E_VALUE_SERIALIZATION', 'Accessors are not serialized');
        return [key, visit(descriptor.value, depth + 1)];
      })};
    }
    seen.delete(v); return result;
  }
  const result = visit(value, 0);
  requireValue(new TextEncoder().encode(JSON.stringify(result)).byteLength <= maxBytes, 'E_VALUE_SERIALIZATION', 'Value exceeds byte budget');
  return result;
}
export function decodeValue(value, options) {
  let nodes = 0;
  function visit(w, depth) {
    requireValue(w && typeof w === 'object' && depth <= VALUE_LIMITS.depth && ++nodes <= 65536, 'E_RESULT_FORMAT');
    switch (w.t) {
      case 'undefined': return undefined;
      case 'null': return null;
      case 'negative-zero': return -0;
      case 'boolean': requireValue(typeof w.v === 'boolean', 'E_RESULT_FORMAT'); return w.v;
      case 'string': requireValue(typeof w.v === 'string', 'E_RESULT_FORMAT'); return w.v;
      case 'number': requireValue(typeof w.v === 'number' && Number.isFinite(w.v), 'E_RESULT_FORMAT'); return w.v;
      case 'array': requireValue(Array.isArray(w.v), 'E_RESULT_FORMAT'); return w.v.map(v => visit(v, depth + 1));
      case 'object': {
        requireValue(Array.isArray(w.v), 'E_RESULT_FORMAT'); const result = {};
        for (const entry of w.v) {
          requireValue(Array.isArray(entry) && entry.length === 2 && typeof entry[0] === 'string' && !Object.hasOwn(result, entry[0]), 'E_RESULT_FORMAT');
          Object.defineProperty(result, entry[0], {value: visit(entry[1], depth + 1), enumerable: true, writable: true, configurable: true});
        }
        return result;
      }
      default: throw new PageError('E_RESULT_FORMAT');
    }
  }
  const result = visit(value, 0); encodeValue(result, options); return result;
}
export function functionSource(fn) {
  requireValue(typeof fn === 'function', 'E_ARGUMENT_TYPE', 'Expected a function');
  const source = Function.prototype.toString.call(fn);
  requireValue(!source.includes('[native code]'), 'E_FUNCTION_SOURCE_UNSUPPORTED', 'Native and bound functions are unsupported');
  requireValue(new TextEncoder().encode(source).byteLength <= VALUE_LIMITS.bytes, 'E_VALUE_SERIALIZATION');
  return source;
}
export function options(value, supported) {
  requireValue(value && typeof value === 'object' && !Array.isArray(value), 'E_ARGUMENT_TYPE', 'Options must be an object');
  for (const key of Object.keys(value)) requireValue(supported.includes(key), 'E_OPTION_UNSUPPORTED', `Unsupported option: ${key}`);
  return value;
}
export function selector(value) {
  requireValue(typeof value === 'string' && value.length > 0 && value.length <= 4096, 'E_ARGUMENT_TYPE', 'Expected a nonempty CSS selector');
  return value;
}
export function duration(value) {
  requireValue(typeof value === 'number' && Number.isFinite(value) && value >= 0, 'E_ARGUMENT_TYPE', 'Expected a finite nonnegative duration');
  return value;
}
export function httpURL(value) {
  requireValue(typeof value === 'string', 'E_ARGUMENT_TYPE');
  let url; try { url = new URL(value); } catch { throw new PageError('E_URL_UNSUPPORTED'); }
  requireValue(['http:', 'https:'].includes(url.protocol) && !url.username && !url.password, 'E_URL_UNSUPPORTED');
  return url.href;
}
const nativeClone = structuredClone, nativeFreeze = Object.freeze, nativeKeys = Object.keys;
export function frozenCopy(value) {
  let copy; try { copy = nativeClone(value); } catch (cause) { throw new PageError('E_VALUE_SERIALIZATION', cause.message); }
  function freeze(v, depth = 0) {
    requireValue(depth <= 64, 'E_VALUE_SERIALIZATION');
    if (v && typeof v === 'object') {
      requireValue(Array.isArray(v) || Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null, 'E_VALUE_SERIALIZATION');
      for (const key of nativeKeys(v)) freeze(v[key], depth + 1); nativeFreeze(v);
    } return v;
  }
  return freeze(copy);
}
