// Bounded F1 adapter: no product authority, journal, storage or implicit target.
export const protocol = 'opendesk.f1.user-scripts-v2';

export function encode(value, seen = new Set()) {
  if (value === undefined) return {type: 'undefined'};
  if (value === null) return {type: 'null'};
  if (typeof value === 'boolean' || typeof value === 'string') return {type: typeof value, value};
  if (typeof value === 'number' && Number.isFinite(value)) return {type: 'number', value};
  if (typeof value !== 'object') throw new TypeError('E_VALUE_UNSERIALIZABLE');
  if (seen.has(value)) throw new TypeError('E_VALUE_CYCLE');
  const proto = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && proto !== Object.prototype && proto !== null) throw new TypeError('E_VALUE_OBJECT');
  seen.add(value);
  const result = Array.isArray(value)
    ? {type: 'array', value: Array.from(value, item => encode(item, seen))}
    : {type: 'object', value: Object.keys(value).map(key => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !('value' in descriptor)) throw new TypeError('E_VALUE_ACCESSOR');
      return [key, encode(descriptor.value, seen)];
    })};
  seen.delete(value);
  return result;
}

export function decode(node) {
  switch (node.type) {
    case 'undefined': return undefined;
    case 'null': return null;
    case 'boolean': case 'string': case 'number': return node.value;
    case 'array': return node.value.map(decode);
    case 'object': return Object.fromEntries(node.value.map(([key, value]) => [key, decode(value)]));
    default: throw new TypeError('E_VALUE_TAG');
  }
}

export function functionCode(fnOrSource, args) {
  const source = typeof fnOrSource === 'function' ? Function.prototype.toString.call(fnOrSource) : fnOrSource;
  if (typeof source !== 'string' || source.includes('[native code]')) throw new TypeError('E_FUNCTION_SOURCE');
  if (new TextEncoder().encode(source).byteLength > 128 * 1024) throw new RangeError('E_SOURCE_LIMIT');
  const encodedArgs = encode(args);
  // Chrome parses this ScriptSource in the explicitly selected page world.
  // The extension never evals the source or rebuilds the user's closure.
  return `(async () => {
    const encode = ${encode.toString()};
    const decode = ${decode.toString()};
    try {
      const fn = (${source});
      const result = await fn(...decode(${JSON.stringify(encodedArgs)}));
      return {protocol: ${JSON.stringify(protocol)}, ok: true, value: encode(result)};
    } catch (error) {
      return {protocol: ${JSON.stringify(protocol)}, ok: false,
        error: {name: String(error?.name || 'Error'), message: String(error?.message || error)}};
    }
  })()`;
}

export function exactTarget(target) {
  if (!Number.isInteger(target?.tabId) || typeof target?.documentId !== 'string' || !Number.isInteger(target?.frameId)) {
    throw new TypeError('E_TARGET_EXACT_REQUIRED');
  }
  return {tabId: target.tabId, documentIds: [target.documentId]};
}

export async function verifyCurrent(target) {
  // getScripts() checks the real browser's switch, including cached API objects.
  await chrome.userScripts.getScripts();
  const frames = await chrome.webNavigation.getAllFrames({tabId: target.tabId});
  if (!frames?.some(frame => frame.documentId === target.documentId && frame.frameId === target.frameId)) {
    throw new Error('E_DOCUMENT_STALE');
  }
  const frame = frames.find(frame => frame.documentId === target.documentId);
  const origin = new URL(frame.url).origin;
  if (!await chrome.permissions.contains({origins: [`${origin}/*`]})) throw new Error('E_HOST_PERMISSION_REVOKED');
  return {documentId: frame.documentId, frameId: frame.frameId, url: frame.url, origin, hostPermission: true};
}

export function accept(raw, target) {
  if (raw.kind !== 'resolved') throw new Error(`E_INJECTION: ${raw.error?.message}`);
  if (raw.results.length !== 1 || raw.results[0].documentId !== target.documentId || raw.results[0].frameId !== target.frameId) {
    throw new Error('E_INJECTION_TARGET');
  }
  const item = raw.results[0];
  if (item.hasError) throw new Error(`E_EVALUATION: ${item.error}`);
  const envelope = item.result;
  if (!item.hasResult || envelope?.protocol !== protocol || typeof envelope.ok !== 'boolean') throw new Error('E_RESULT_CODEC');
  if (!envelope.ok) return {kind: 'evaluation-error', error: envelope.error};
  return {kind: 'value', value: envelope.value};
}
