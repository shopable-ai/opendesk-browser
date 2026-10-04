import {BUDGETS, FoundationError} from '../protocol.js';

export const VALUE_PROTOCOL = 'opendesk.value.v1';
const encoder = new TextEncoder();
const defaults = {maxDepth:12, maxBytes:BUDGETS.maxBatchBytes};

function fail(stage, message) {
  const error = new FoundationError('E_VALUE_SERIALIZATION', message);
  error.stage = stage;
  throw error;
}
function keys(value, expected, stage) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
    Object.keys(value).length !== expected.length || !expected.every(key => Object.hasOwn(value, key))) fail(stage, 'Invalid wire shape');
}
function validString(value, stage) {
  if (typeof value !== 'string') fail(stage, 'Expected a string');
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) fail(stage, 'Unpaired UTF-16 surrogate');
    } else if (code >= 0xdc00 && code <= 0xdfff) fail(stage, 'Unpaired UTF-16 surrogate');
  }
  return value;
}
function budget(value, options, stage) {
  let text;
  try { text = JSON.stringify(value); } catch { fail(stage, 'Wire value is not JSON'); }
  if (encoder.encode(text).byteLength > options.maxBytes) fail(stage, 'Wire byte budget exceeded');
  return value;
}

export function encodeValue(value, options = {}) {
  const limits = {...defaults, ...options}, seen = new Set();
  function encode(value, depth) {
    if (depth > limits.maxDepth) fail('encode', 'Value depth exceeded');
    if (value === undefined) return {type:'undefined'};
    if (value === null) return {type:'null'};
    if (typeof value === 'string') return {type:'string', value:validString(value, 'encode')};
    if (typeof value === 'boolean') return {type:'boolean', value};
    if (typeof value === 'number' && Number.isFinite(value)) return Object.is(value, -0)
      ? {type:'number', value:0, negativeZero:true} : {type:'number', value};
    if (!value || typeof value !== 'object') fail('encode', 'Value is not serializable');
    if (seen.has(value)) fail('encode', 'Cyclic value');
    if (!Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail('encode', 'Only plain objects are supported');
    if (Object.getOwnPropertySymbols(value).length) fail('encode', 'Symbol keys are not supported');
    seen.add(value);
    const own = key => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor) return undefined;
      if (!Object.hasOwn(descriptor, 'value')) fail('encode', 'Accessors are not supported');
      return descriptor.value;
    };
    const result = Array.isArray(value)
      ? {type:'array', value:Array.from({length:value.length}, (_, i) => encode(own(String(i)), depth + 1))}
      : {type:'object', value:Object.keys(value).sort().map(key => [validString(key, 'encode'), encode(own(key), depth + 1)])};
    seen.delete(value);
    return result;
  }
  return budget(encode(value, 0), limits, 'encode');
}

export function decodeValue(node, options = {}) {
  const limits = {...defaults, ...options};
  budget(node, limits, 'decode');
  function decode(node, depth) {
    if (depth > limits.maxDepth) fail('decode', 'Value depth exceeded');
    switch (node?.type) {
      case 'undefined': keys(node, ['type'], 'decode'); return undefined;
      case 'null': keys(node, ['type'], 'decode'); return null;
      case 'string': keys(node, ['type','value'], 'decode'); return validString(node.value, 'decode');
      case 'boolean': keys(node, ['type','value'], 'decode'); if (typeof node.value !== 'boolean') fail('decode', 'Invalid boolean'); return node.value;
      case 'number':
        keys(node, Object.hasOwn(node, 'negativeZero') ? ['type','value','negativeZero'] : ['type','value'], 'decode');
        if (typeof node.value !== 'number' || !Number.isFinite(node.value)) fail('decode', 'Invalid number');
        if (Object.hasOwn(node, 'negativeZero')) {
          if (node.value !== 0 || node.negativeZero !== true) fail('decode', 'Invalid negative zero');
          return -0;
        }
        return node.value;
      case 'array':
        keys(node, ['type','value'], 'decode'); if (!Array.isArray(node.value)) fail('decode', 'Invalid array');
        return node.value.map(item => decode(item, depth + 1));
      case 'object': {
        keys(node, ['type','value'], 'decode'); if (!Array.isArray(node.value)) fail('decode', 'Invalid object');
        const used = new Set(), entries = node.value.map(entry => {
          if (!Array.isArray(entry) || entry.length !== 2) fail('decode', 'Invalid object entry');
          const key = validString(entry[0], 'decode');
          if (used.has(key)) fail('decode', 'Duplicate object key');
          used.add(key);
          return [key, decode(entry[1], depth + 1)];
        });
        return Object.fromEntries(entries);
      }
      default: fail('decode', 'Unknown value tag');
    }
  }
  return decode(node, 0);
}

export function encodeOutcome(outcome, options = {}) {
  if (outcome?.ok === true) {
    keys(outcome, ['ok','value'], 'outcome');
    return budget({protocol:VALUE_PROTOCOL, ok:true, value:encodeValue(outcome.value, options)}, {...defaults, ...options}, 'outcome');
  }
  keys(outcome, ['ok','error'], 'outcome');
  if (outcome.ok !== false) fail('outcome', 'Invalid outcome status');
  const error = outcome.error;
  const fields = {name:String(error?.name || 'Error'), code:String(error?.code || 'E_PAGE_EXECUTION'), message:String(error?.message ?? error)};
  for (const value of Object.values(fields)) validString(value, 'outcome');
  return budget({protocol:VALUE_PROTOCOL, ok:false, error:fields}, {...defaults, ...options}, 'outcome');
}

export function decodeOutcome(outcome, options = {}) {
  if (outcome?.protocol !== VALUE_PROTOCOL) fail('outcome', 'Unknown outcome protocol');
  budget(outcome, {...defaults, ...options}, 'outcome');
  if (outcome.ok === true) {
    keys(outcome, ['protocol','ok','value'], 'outcome');
    return {ok:true, value:decodeValue(outcome.value, options)};
  }
  keys(outcome, ['protocol','ok','error'], 'outcome');
  if (outcome.ok !== false) fail('outcome', 'Invalid outcome status');
  keys(outcome.error, ['name','code','message'], 'outcome');
  for (const value of Object.values(outcome.error)) validString(value, 'outcome');
  return {ok:false, error:{...outcome.error}};
}

export const canonicalValue = (value, options) => JSON.stringify(encodeValue(value, options));

export function bytesToBase64(bytes, {maxBytes = BUDGETS.maxRawFrameBytes} = {}) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength > maxBytes) fail('base64', 'Invalid or oversized bytes');
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
export function base64ToBytes(value, {maxBytes = BUDGETS.maxRawFrameBytes} = {}) {
  if (typeof value !== 'string' || value.length > 4 * Math.ceil(maxBytes / 3) ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) fail('base64', 'Invalid base64');
  let binary;
  try { binary = atob(value); } catch { fail('base64', 'Invalid base64'); }
  if (binary.length > maxBytes || btoa(binary) !== value) fail('base64', 'Noncanonical or oversized base64');
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}
export const utf8ToBase64 = (text, options) => bytesToBase64(encoder.encode(validString(text, 'utf8')), options);
export function base64ToUtf8(value, options) {
  try { return new TextDecoder('utf-8', {fatal:true}).decode(base64ToBytes(value, options)); }
  catch (error) { if (error.code === 'E_VALUE_SERIALIZATION') throw error; fail('utf8', 'Invalid UTF-8'); }
}
export const encodeBase64 = utf8ToBase64;
export const decodeBase64 = base64ToUtf8;
