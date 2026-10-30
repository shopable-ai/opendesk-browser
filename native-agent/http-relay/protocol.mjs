import { createHash, createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';
export const LIMIT = 8192;
export const HOST = '127.0.0.1';
export const PORT = 43122;
export const TARGET = 'http://127.0.0.1:43121';
export const random = () => randomBytes(32).toString('base64url');
export function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
export const hash = value => createHash('sha256').update(canonical(value)).digest('hex');
export const mac = (key, value) => createHmac('sha256', key).update(canonical(value)).digest('hex');
export function equal(a, b) {
  return typeof a === 'string' && typeof b === 'string' && /^[a-f0-9]{64}$/.test(a) && /^[a-f0-9]{64}$/.test(b) && timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}
export const secretBytes = secret => Buffer.from(secret, 'base64url');
export const proof = (key, label, transcript) => mac(key, { label, transcript });
export const deriveKey = (secret, transcript) => Buffer.from(hkdfSync('sha256', secretBytes(secret), Buffer.from(hash(transcript), 'hex'), 'opendesk-http-relay-v1', 32));
export const sign = (key, unsigned) => ({ ...unsigned, mac: mac(key, unsigned) });
export function unsigned(envelope) { const { mac: ignored, ...rest } = envelope; return rest; }
export function check(condition, code = 'INVALID_REQUEST') { if (!condition) throw new Error(code); }
export function keys(object, expected) {
  check(object && typeof object === 'object' && !Array.isArray(object));
  check(Object.keys(object).sort().join(',') === [...expected].sort().join(','));
}
export function identifier(value) { check(typeof value === 'string' && /^[A-Za-z0-9._:-]{1,256}$/.test(value)); }
export function nonce(value) { check(typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value)); }
