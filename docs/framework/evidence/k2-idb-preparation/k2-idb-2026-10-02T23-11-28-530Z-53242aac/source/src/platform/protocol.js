import schema from './schema.js';

export const CONTRACT_VERSION = '1.0.0';
export const CONTRACT_HASH = '1486ff9c442807c0d447e542252830731faeede5f81cd685c5f146daecdba2a1';
export const PROTOCOL = 'opendesk.foundation.v1';
export const BUDGETS = Object.freeze({activeRuns:1, executionTabs:1, maxPages:50, maxRecords:10000,
  maxDurationMs:600000, maxStoredBytes:20971520, maxBatchBytes:262144, maxPendingACKs:2,
  maxArtifactBytes:8388608, profileStoredBytes:209715200, retentionDays:7, mappingWindowMs:60000,
  downloadDeadlineMs:600000, commandReconcileMs:30000, maxRecordBytes:65536, maxRawFrameBytes:131072});
export class FoundationError extends Error {
  constructor(code, message) { super(message); this.name = 'FoundationError'; this.code = code; }
}
export function invariant(condition, code = 'E_SCHEMA', message = code) {
  if (!condition) throw new FoundationError(code, message);
}
export const newId = () => crypto.randomUUID();
const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
function string(value) {
  for (let i = 0; i < value.length; i++) {
    const n = value.charCodeAt(i);
    if (n >= 0xd800 && n <= 0xdbff) {
      const next = value.charCodeAt(++i);
      invariant(next >= 0xdc00 && next <= 0xdfff, 'E_SCHEMA', 'Unpaired UTF-16 surrogate');
    } else invariant(n < 0xdc00 || n > 0xdfff, 'E_SCHEMA', 'Unpaired UTF-16 surrogate');
  }
  return JSON.stringify(value);
}
export function canonical(value) {
  function encode(v, depth) {
    invariant(depth <= 12, 'E_SCHEMA', 'JSON exceeds depth limit');
    if (v === null) return 'null';
    if (typeof v === 'string') return string(v);
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    if (typeof v === 'number') { invariant(Number.isFinite(v), 'E_SCHEMA', 'Non-finite number'); return JSON.stringify(v); }
    invariant(typeof v === 'object', 'E_SCHEMA', 'Non-JSON value');
    if (Array.isArray(v)) return '[' + Array.from(v, item => encode(item, depth + 1)).join(',') + ']';
    invariant(Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null,
      'E_SCHEMA', 'Only plain JSON objects are allowed');
    const keys = Object.keys(v).sort();
    for (const key of keys) invariant(!forbidden.has(key) && /^[\x20-\x7e]+$/.test(key), 'E_SCHEMA', 'Unsafe JSON key');
    return '{' + keys.map(key => string(key) + ':' + encode(v[key], depth + 1)).join(',') + '}';
  }
  return encode(value, 0);
}
export async function digest(value) {
  const bytes = new TextEncoder().encode(canonical(value));
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
}
export function sameIdentity(a, b, {ignoreRevision = false} = {}) {
  if (!a || !b) return false;
  const clean = value => { const copy = structuredClone(value); if (ignoreRevision) delete copy.runRevision; return copy; };
  return canonical(clean(a)) === canonical(clean(b));
}
function conforms(rule, value, path) {
  const fail = message => invariant(false, 'E_SCHEMA', `${path}: ${message}`);
  if (rule === true) return;
  if (rule === false) return fail('value forbidden');
  if (rule.$ref) return conforms(schema.$defs[rule.$ref.split('/').at(-1)], value, path);
  if (Object.hasOwn(rule, 'const') && canonical(value) !== canonical(rule.const)) fail('wrong constant');
  if (rule.enum && !rule.enum.some(item => canonical(item) === canonical(value))) fail('unknown enum');
  const accepts = r => { try { conforms(r, value, path); return true; } catch (e) { if (e.code !== 'E_SCHEMA') throw e; return false; } };
  if (rule.oneOf && rule.oneOf.filter(accepts).length !== 1) fail('must match exactly one variant');
  if (rule.anyOf && !rule.anyOf.some(accepts)) fail('no matching variant');
  for (const child of rule.allOf || []) conforms(child, value, path);
  if (rule.if) { if (accepts(rule.if) && rule.then) conforms(rule.then, value, path); else if (!accepts(rule.if) && rule.else) conforms(rule.else, value, path); }
  if (rule.not && accepts(rule.not)) fail('forbidden variant');
  const types = Array.isArray(rule.type) ? rule.type : rule.type ? [rule.type] : [];
  const is = t => t === 'null' ? value === null : t === 'array' ? Array.isArray(value) : t === 'object' ? value !== null && typeof value === 'object' && !Array.isArray(value) : t === 'integer' ? Number.isSafeInteger(value) : t === 'number' ? typeof value === 'number' && Number.isFinite(value) : typeof value === t;
  if (types.length && !types.some(is)) fail('wrong type');
  if (typeof value === 'string') {
    if (rule.minLength !== undefined && [...value].length < rule.minLength) fail('too short');
    if (rule.maxLength !== undefined && [...value].length > rule.maxLength) fail('too long');
    if (rule.pattern && !new RegExp(rule.pattern).test(value)) fail('pattern mismatch');
    if (rule.format === 'date-time' && (!/^\d{4}-\d\d-\d\dT/.test(value) || !Number.isFinite(Date.parse(value)))) fail('invalid timestamp');
    if (rule.format === 'uri') { try { new URL(value); } catch { fail('invalid URL'); } }
  }
  if (typeof value === 'number') {
    if (rule.minimum !== undefined && value < rule.minimum) fail('below minimum');
    if (rule.maximum !== undefined && value > rule.maximum) fail('above maximum');
    if (rule.exclusiveMinimum !== undefined && value <= rule.exclusiveMinimum) fail('below exclusive minimum');
    if (rule.exclusiveMaximum !== undefined && value >= rule.exclusiveMaximum) fail('above exclusive maximum');
  }
  if (Array.isArray(value)) {
    if (rule.minItems !== undefined && value.length < rule.minItems) fail('too few items');
    if (rule.maxItems !== undefined && value.length > rule.maxItems) fail('too many items');
    if (rule.uniqueItems && new Set(value.map(canonical)).size !== value.length) fail('duplicate items');
    if (rule.items) value.forEach((item, i) => conforms(rule.items, item, `${path}[${i}]`));
  } else if (value !== null && typeof value === 'object') {
    for (const key of rule.required || []) if (!Object.hasOwn(value, key)) fail(`missing ${key}`);
    for (const [key, item] of Object.entries(value)) {
      if (rule.properties?.[key]) conforms(rule.properties[key], item, `${path}.${key}`);
      else if (rule.additionalProperties === false) fail(`unknown ${key}`);
      else if (typeof rule.additionalProperties === 'object') conforms(rule.additionalProperties, item, `${path}.${key}`);
      if (rule.propertyNames) conforms(rule.propertyNames, key, `${path}.${key}`);
    }
    if (rule.minProperties !== undefined && Object.keys(value).length < rule.minProperties) fail('too few properties');
    if (rule.maxProperties !== undefined && Object.keys(value).length > rule.maxProperties) fail('too many properties');
  }
}
export function validate(name, value) {
  invariant(schema.$defs[name], 'E_SCHEMA', `Unknown schema ${name}`);
  canonical(value);
  conforms(schema.$defs[name], value, name);
  return value;
}
export function projectRun(run) {
  if (!run) return null;
  const result = {};
  for (const key of Object.keys(schema.$defs.Run.properties)) result[key] = run[key];
  return validate('Run', result);
}
export function projectCommand(command) {
  const result = {};
  for (const key of Object.keys(schema.$defs.Command.properties)) result[key] = command[key];
  return validate('Command', result);
}
export const iso = clock => new Date(clock.now()).toISOString();
export const terminalStates = new Set(['completed', 'limit_reached', 'stopped', 'failed', 'interrupted', 'abandoned_unknown']);
