import {FoundationError, canonical, invariant, validate} from '../protocol.js';

// No issuer has been provisioned for this product. Never ship a test trust key here.
export const TRUSTED_KEYS = Object.freeze({});
export const AUDIENCE = 'opendesk-browser';
export const POLICY_VERSION = '1.0.0';

export function entitlementSigningPayload(claim) {
  const {signature, verification, verifiedAt, lastTrustedTime, ...payload} = claim;
  return payload;
}

export function revocationSigningPayload(evidence) {
  const {signature, ...payload} = evidence;
  return payload;
}

function validTime(value) {
  if (typeof value !== 'string') return false;
  const parts = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)(?:\.\d+)?(Z|([+-])(\d\d):(\d\d))$/.exec(value);
  if (!parts || !Number.isFinite(Date.parse(value))) return false;
  const [, year, month, day, hours, minutes, seconds, zone, , offsetHours, offsetMinutes] = parts;
  const date = new Date(0); date.setUTCFullYear(+year, +month - 1, +day);
  return date.getUTCFullYear() === +year && date.getUTCMonth() === +month - 1 && date.getUTCDate() === +day &&
    +hours < 24 && +minutes < 60 && +seconds < 60 && (zone === 'Z' || (+offsetHours < 24 && +offsetMinutes < 60));
}

function signatureBytes(signature) {
  invariant(typeof signature === 'string' && /^[A-Za-z0-9_-]{86}$/.test(signature),
    'E_ENTITLEMENT', 'Expected a 64-byte unpadded base64url P1363 signature');
  const binary = atob(signature.replace(/-/g, '+').replace(/_/g, '/') + '==');
  invariant(binary.length === 64 && btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') === signature,
    'E_ENTITLEMENT', 'Noncanonical signature encoding');
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

export function createSignatureVerifier(keys = TRUSTED_KEYS) {
  const allowlist = new Map();
  for (const [keyId, entry] of Object.entries(keys)) {
    invariant(/^[A-Za-z0-9._:-]{1,128}$/.test(keyId) && entry && typeof entry.issuer === 'string' && entry.issuer.length > 0 && entry.jwk,
      'E_ENTITLEMENT', 'Trust entries require keyId and issuer');
    const jwk = JSON.parse(JSON.stringify(entry.jwk));
    invariant(jwk.kty === 'EC' && jwk.crv === 'P-256' && !Object.hasOwn(jwk, 'd'),
      'E_ENTITLEMENT', 'Only P-256 public JWKs may enter the trust allowlist');
    allowlist.set(keyId, {issuer: entry.issuer, jwk});
  }
  const imported = new Map();
  async function verify(payload, signature, subject) {
    const trusted = allowlist.get(payload.keyId);
    invariant(trusted && payload.issuer === trusted.issuer && payload.subject === subject && payload.audience === AUDIENCE,
      'E_ENTITLEMENT', 'Untrusted key, issuer, subject or audience');
    invariant(payload.formatVersion === POLICY_VERSION && Number.isSafeInteger(payload.revocationVersion) && payload.revocationVersion >= 0,
      'E_ENTITLEMENT', 'Invalid claim version');
    const bytes = signatureBytes(signature);
    try {
      if (!imported.has(payload.keyId)) imported.set(payload.keyId, globalThis.crypto.subtle.importKey(
        'jwk', trusted.jwk, {name: 'ECDSA', namedCurve: 'P-256'}, false, ['verify']));
      const key = await imported.get(payload.keyId);
      const valid = await globalThis.crypto.subtle.verify({name: 'ECDSA', hash: 'SHA-256'}, key,
        bytes, new TextEncoder().encode(canonical(payload)));
      invariant(valid, 'E_ENTITLEMENT', 'Invalid entitlement signature');
    } catch (error) {
      if (error instanceof FoundationError) throw error;
      throw new FoundationError('E_ENTITLEMENT', 'Signature verification unavailable or public key invalid');
    }
  }
  return {
    async claim(claim, subject) {
      validate('Entitlement', claim);
      invariant(claim.tier === 'pro', 'E_ENTITLEMENT', 'Pro requires a signed claim');
      invariant(validTime(claim.issuedAt) && validTime(claim.expiresAt), 'E_ENTITLEMENT', 'Invalid signed timestamp');
      await verify(entitlementSigningPayload(claim), claim.signature, subject);
    },
    async revocation(evidence, subject) {
      const fields = ['kind', 'formatVersion', 'audience', 'issuer', 'subject', 'keyId', 'revocationVersion', 'issuedAt', 'signature'];
      invariant(evidence && Object.keys(evidence).length === fields.length && fields.every(field => Object.hasOwn(evidence, field)) &&
        evidence.kind === 'entitlement-revocation' && validTime(evidence.issuedAt),
      'E_ENTITLEMENT', 'Invalid signed revocation evidence');
      await verify(revocationSigningPayload(evidence), evidence.signature, subject);
    }
  };
}
