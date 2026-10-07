import {BUDGETS, FoundationError} from '../protocol.js';

export const VALUE_PROTOCOL = 'opendesk.value.v1';
const encoder = new TextEncoder();
const defaults = {maxDepth:12, maxBytes:BUDGETS.maxBatchBytes};

// Self-contained: this exact factory source is also embedded in userScripts.
// Profiles select wire spelling/compatibility, never a second recursive codec.
export function createValueCodec({profile = 'foundation', ErrorType, maxDepth = 12, maxBytes = 262144} = {}) {
  const compact = profile === 'control';
  const apply = Reflect.apply, objectPrototype = Object.prototype;
  const objectKeys = Object.keys, names = Object.getOwnPropertyNames, symbols = Object.getOwnPropertySymbols;
  const descriptor = Object.getOwnPropertyDescriptor, prototype = Object.getPrototypeOf;
  const hasOwn = Object.hasOwn, define = Object.defineProperty, freeze = Object.freeze;
  const isArray = Array.isArray, sort = Array.prototype.sort;
  const finite = Number.isFinite, is = Object.is, stringify = JSON.stringify;
  const charCode = String.prototype.charCodeAt, SetType = Set, NativeError = Error;
  const setHas = Set.prototype.has, setAdd = Set.prototype.add, setDelete = Set.prototype.delete;
  const utf8 = new TextEncoder(), utf8Encode = utf8.encode;
  const tagKey = compact ? 't' : 'type', valueKey = compact ? 'v' : 'value';
  function fail(stage, message, byteBudget = false) {
    const code = compact && stage === 'decode' && !byteBudget ? 'E_RESULT_FORMAT' : 'E_VALUE_SERIALIZATION';
    const error = ErrorType ? new ErrorType(code, message) : new NativeError(message);
    if (!ErrorType) { error.name = compact ? 'PageError' : 'FoundationError'; error.code = code; }
    if (!compact) error.stage = stage;
    throw error;
  }
  if (profile !== 'foundation' && !compact) fail('encode', 'Unknown value wire profile');
  function validateString(value, stage = 'encode') {
    if (typeof value !== 'string') fail(stage, 'Expected a string');
    for (let i = 0; i < value.length; i++) {
      const code = apply(charCode, value, [i]);
      if (code >= 0xd800 && code <= 0xdbff) {
        const next = apply(charCode, value, [++i]);
        if (!(next >= 0xdc00 && next <= 0xdfff)) fail(stage, 'Unpaired UTF-16 surrogate');
      } else if (code >= 0xdc00 && code <= 0xdfff) fail(stage, 'Unpaired UTF-16 surrogate');
    }
    return value;
  }
  function limits(options = {}) {
    return {maxDepth:compact ? maxDepth : options.maxDepth ?? maxDepth, maxBytes:options.maxBytes ?? maxBytes};
  }
  function budget(wire, limit, stage) {
    let text;
    try { text = stringify(wire); } catch { fail(stage, 'Wire value is not JSON', true); }
    if (apply(utf8Encode, utf8, [text]).byteLength > limit.maxBytes) fail(stage, 'Wire byte budget exceeded', true);
    return wire;
  }
  function own(value, key, stage) {
    const item = descriptor(value, key);
    if (!item) return undefined;
    if (!hasOwn(item, 'value')) fail(stage, 'Accessors are not supported');
    return item.value;
  }
  function inspectWire(value, stage, array = false) {
    // Tagged wire validation is structural across realms, as in both original
    // decoders. The plain-object restriction belongs to encoding business values.
    if (!value || typeof value !== 'object' || isArray(value) !== array) fail(stage, 'Invalid wire shape');
    if (symbols(value).length) fail(stage, 'Symbol keys are not supported');
    const keys = names(value);
    for (let i = 0; i < keys.length; i++) own(value, keys[i], stage);
  }
  function shape(value, fields) {
    if (compact) return; // Existing t/v consumers accept additional data fields.
    if (objectKeys(value).length !== fields.length) fail('decode', 'Invalid wire shape');
    for (let i = 0; i < fields.length; i++) if (!hasOwn(value, fields[i])) fail('decode', 'Invalid wire shape');
  }
  function node(tag, value, hasValue = true) {
    return hasValue ? {[tagKey]:tag, [valueKey]:value} : {[tagKey]:tag};
  }
  function encodeValue(value, options) {
    const limit = limits(options), seen = new SetType();
    function encode(value, depth) {
      if (depth > limit.maxDepth) fail('encode', 'Value depth exceeded');
      if (value === undefined) return node('undefined', undefined, false);
      if (value === null) return node('null', undefined, false);
      if (typeof value === 'string') return node('string', validateString(value));
      if (typeof value === 'boolean') return node('boolean', value);
      if (typeof value === 'number' && finite(value)) {
        if (!is(value, -0)) return node('number', value);
        return compact ? node('negative-zero', undefined, false) : {type:'number', value:0, negativeZero:true};
      }
      if (!value || typeof value !== 'object') fail('encode', 'Value is not serializable');
      if (apply(setHas, seen, [value])) fail('encode', 'Cyclic value');
      const array = isArray(value);
      if (!array && prototype(value) !== objectPrototype && prototype(value) !== null) fail('encode', 'Only plain objects are supported');
      if (symbols(value).length) fail('encode', 'Symbol keys are not supported');
      apply(setAdd, seen, [value]);
      const entries = [];
      if (array) {
        for (let i = 0; i < value.length; i++) entries[i] = encode(own(value, i, 'encode'), depth + 1);
      } else {
        const keys = objectKeys(value);
        if (!compact) apply(sort, keys, []);
        for (let i = 0; i < keys.length; i++) entries[i] = [validateString(keys[i]), encode(own(value, keys[i], 'encode'), depth + 1)];
      }
      apply(setDelete, seen, [value]);
      return node(array ? 'array' : 'object', entries);
    }
    return budget(encode(value, 0), limit, 'encode');
  }
  function decodeValue(wire, options) {
    const limit = limits(options); let nodes = 0;
    function decode(wire, depth) {
      if (depth > limit.maxDepth || ++nodes > 65536) fail('decode', 'Value depth or node budget exceeded');
      inspectWire(wire, 'decode');
      const tag = own(wire, tagKey, 'decode');
      if (tag === 'undefined' || tag === 'null' || (compact && tag === 'negative-zero')) {
        shape(wire, [tagKey]);
        return tag === 'undefined' ? undefined : tag === 'null' ? null : -0;
      }
      const negativeZero = !compact && tag === 'number' && hasOwn(wire, 'negativeZero');
      shape(wire, negativeZero ? [tagKey, valueKey, 'negativeZero'] : [tagKey, valueKey]);
      const value = own(wire, valueKey, 'decode');
      if (tag === 'string') return validateString(value, 'decode');
      if (tag === 'boolean') {
        if (typeof value !== 'boolean') fail('decode', 'Invalid boolean');
        return value;
      }
      if (tag === 'number') {
        if (typeof value !== 'number' || !finite(value)) fail('decode', 'Invalid number');
        if (negativeZero) {
          if (value !== 0 || own(wire, 'negativeZero', 'decode') !== true) fail('decode', 'Invalid negative zero');
          return -0;
        }
        return value;
      }
      if (tag !== 'array' && tag !== 'object') fail('decode', 'Unknown value tag');
      inspectWire(value, 'decode', true);
      const result = tag === 'array' ? [] : {}, used = new SetType();
      for (let i = 0; i < value.length; i++) {
        const entry = own(value, i, 'decode');
        if (tag === 'array') result[i] = decode(entry, depth + 1);
        else {
          inspectWire(entry, 'decode', true);
          if (entry.length !== 2) fail('decode', 'Invalid object entry');
          const key = validateString(own(entry, 0, 'decode'), 'decode');
          if (apply(setHas, used, [key])) fail('decode', 'Duplicate object key');
          apply(setAdd, used, [key]);
          define(result, key, {value:decode(own(entry, 1, 'decode'), depth + 1), enumerable:true, writable:true, configurable:true});
        }
      }
      return result;
    }
    const result = decode(wire, 0);
    // Control historically budgets the normalized value; foundation budgets its
    // strict wire envelope. Both reuse this factory's one encoder/decoder.
    if (compact) encodeValue(result, options); else budget(wire, limit, 'decode');
    return result;
  }
  return freeze({encodeValue, decodeValue, validateString});
}

const foundation = createValueCodec({ErrorType:FoundationError, ...defaults});
export const encodeValue = foundation.encodeValue;
export const decodeValue = foundation.decodeValue;

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
  return foundation.validateString(value, stage);
}
function budget(value, options, stage) {
  let text;
  try { text = JSON.stringify(value); } catch { fail(stage, 'Wire value is not JSON'); }
  if (encoder.encode(text).byteLength > options.maxBytes) fail(stage, 'Wire byte budget exceeded');
  return value;
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
