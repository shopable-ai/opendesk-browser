// Pure fixed-SW cryptography for the original Cookie Share Relay packet.
// No network, storage, Cookie API, UI projection or private-key export here.
// Both devices must explicitly compare receiver and sender fingerprints.
const fail = code => Object.assign(new Error(code), {code});
const enc = new TextEncoder(), dec = new TextDecoder('utf-8', {fatal: true});
const ID = /^[A-Za-z0-9_-]{22,80}$/, FP = /^[a-f0-9]{64}$/;
const id = value => typeof value === 'string' && ID.test(value);
const fingerprintText = value => typeof value === 'string' && FP.test(value);
const MAX_PLAIN = 512000;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const b64 = bytes => {
  let text = '';
  for (const byte of new Uint8Array(bytes)) text += String.fromCharCode(byte);
  return btoa(text).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
};
const unb64 = (text, min, max) => {
  if (typeof text !== 'string' || text.length > Math.ceil(max * 4 / 3) + 4 ||
      !/^[A-Za-z0-9_-]+$/.test(text)) throw fail('E_SESSION_PACKET');
  let bytes;
  try { bytes = Uint8Array.from(atob(text.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0)); }
  catch { throw fail('E_SESSION_PACKET'); }
  if (bytes.length < min || bytes.length > max || b64(bytes) !== text) throw fail('E_SESSION_PACKET');
  return bytes;
};
function publicFields(value) {
  if (!object(value) || value.kty !== 'EC' || value.crv !== 'P-256' ||
      typeof value.x !== 'string' || typeof value.y !== 'string' ||
      !/^[A-Za-z0-9_-]{43}$/.test(value.x) || !/^[A-Za-z0-9_-]{43}$/.test(value.y) ||
      Object.hasOwn(value, 'd')) throw fail('E_SESSION_PUBLIC_KEY');
  return {kty: 'EC', crv: 'P-256', x: value.x, y: value.y};
}
function checkedContext(value) {
  if (!object(value) || !id(value.inviteId) || !id(value.requestId) ||
      !fingerprintText(value.receiverFingerprint) || typeof value.origin !== 'string' ||
      value.origin.length > 320) throw fail('E_SESSION_CONTEXT');
  let origin;
  try { origin = new URL(value.origin); } catch { throw fail('E_SESSION_CONTEXT'); }
  if (!['https:', 'http:'].includes(origin.protocol) || origin.origin !== value.origin ||
      origin.username || origin.password) throw fail('E_SESSION_CONTEXT');
  return {inviteId: value.inviteId, requestId: value.requestId,
    origin: value.origin, receiverFingerprint: value.receiverFingerprint};
}
function checkedSnapshot(value, origin) {
  if (!object(value) || value.format !== 1 || value.origin !== origin ||
      Object.keys(value).length !== 3 || !Array.isArray(value.cookies) ||
      value.cookies.length < 1 || value.cookies.length > 100 ||
      value.cookies.some(row => !object(row))) throw fail('E_SESSION_SNAPSHOT');
  // Native Cookie identity/scope validation belongs to the original service,
  // before encryption and again after receiver Store/Partition mapping.
  return value;
}

export function createCookieSessionCrypto({cryptoImpl = globalThis.crypto} = {}) {
  if (!cryptoImpl?.subtle || typeof cryptoImpl.getRandomValues !== 'function')
    throw fail('E_SESSION_CRYPTO_UNAVAILABLE');
  const subtle = cryptoImpl.subtle;
  const hash = async bytes => Array.from(new Uint8Array(await subtle.digest('SHA-256', bytes)),
    byte => byte.toString(16).padStart(2, '0')).join('');
  async function publicJwk(key) {
    if (key?.type !== 'public' || key.algorithm?.namedCurve !== 'P-256') throw fail('E_SESSION_PUBLIC_KEY');
    return publicFields(await subtle.exportKey('jwk', key));
  }
  async function imported(value, purpose = 'ECDH') {
    try { return await subtle.importKey('jwk', publicFields(value),
      {name: purpose, namedCurve: 'P-256'}, true, purpose === 'ECDSA' ? ['verify'] : []); }
    catch { throw fail('E_SESSION_PUBLIC_KEY'); }
  }
  const fingerprint = async key => hash(await subtle.exportKey('spki', key));
  async function deviceFingerprint(ecdh, signing) {
    await imported(ecdh); await imported(signing, 'ECDSA');
    return hash(enc.encode(JSON.stringify([publicFields(ecdh), publicFields(signing)])));
  }
  async function keyFor(privateKey, publicKey, context, senderFingerprint) {
    if (privateKey?.type !== 'private' || privateKey.extractable !== false ||
        privateKey.algorithm?.name !== 'ECDH' || privateKey.algorithm?.namedCurve !== 'P-256')
      throw fail('E_SESSION_PRIVATE_KEY');
    const shared = await subtle.deriveBits({name: 'ECDH', public: publicKey}, privateKey, 256);
    try {
      const material = await subtle.importKey('raw', shared, 'HKDF', false, ['deriveKey']);
      const info = enc.encode(JSON.stringify({protocol: 'opendesk-cookie-share:v1', ...context, senderFingerprint}));
      const salt = await subtle.digest('SHA-256', enc.encode('opendesk-cookie-share:v1:' + context.inviteId));
      const key = await subtle.deriveKey({name: 'HKDF', hash: 'SHA-256', salt, info}, material,
        {name: 'AES-GCM', length: 256}, false, ['encrypt', 'decrypt']);
      return {key, aad: info};
    } finally { new Uint8Array(shared).fill(0); }
  }
  return Object.freeze({publicJwk, fingerprint, deviceFingerprint,
    async encrypt({snapshot, sender, receiverPublic, context}) {
      const bound = checkedContext(context);
      checkedSnapshot(snapshot, bound.origin);
      const plain = enc.encode(JSON.stringify(snapshot));
      if (plain.byteLength > MAX_PLAIN) { plain.fill(0); throw fail('E_SESSION_SNAPSHOT'); }
      try {
        const receiver = await imported(receiverPublic), senderPublic = await publicJwk(sender.publicKey);
        const senderFingerprint = await fingerprint(sender.publicKey);
        const {key, aad} = await keyFor(sender.privateKey, receiver, bound, senderFingerprint);
        const iv = cryptoImpl.getRandomValues(new Uint8Array(12));
        const ciphertext = await subtle.encrypt({name: 'AES-GCM', iv, additionalData: aad, tagLength: 128}, key, plain);
        return {packet: {senderPublic, iv: b64(iv), ciphertext: b64(ciphertext)}, senderFingerprint};
      } finally { plain.fill(0); }
    },
    async decrypt({packet, receiver, context, expectedSenderFingerprint}) {
      const bound = checkedContext(context);
      if (typeof expectedSenderFingerprint !== 'string' || !FP.test(expectedSenderFingerprint))
        throw fail('E_SESSION_FINGERPRINT_REQUIRED');
      if (!object(packet)) throw fail('E_SESSION_PACKET');
      const sender = await imported(packet.senderPublic);
      if (await fingerprint(sender) !== expectedSenderFingerprint) throw fail('E_SESSION_SENDER_MISMATCH');
      let plain;
      try {
        const iv = unb64(packet.iv, 12, 12), ciphertext = unb64(packet.ciphertext, 17, MAX_PLAIN + 16);
        const {key, aad} = await keyFor(receiver.privateKey, sender, bound, expectedSenderFingerprint);
        plain = new Uint8Array(await subtle.decrypt({name: 'AES-GCM', iv,
          additionalData: aad, tagLength: 128}, key, ciphertext));
        if (plain.length > MAX_PLAIN) throw fail('E_SESSION_PACKET');
        return checkedSnapshot(JSON.parse(dec.decode(plain)), bound.origin);
      } catch { throw fail('E_SESSION_PACKET'); }
      finally { plain?.fill(0); }
    },
    async signClaim({privateKey, inviteId, requestId, challenge}) {
      if (!id(inviteId) || !id(requestId) || !id(challenge) ||
          privateKey?.type !== 'private' || privateKey.extractable !== false ||
          privateKey.algorithm?.name !== 'ECDSA' || privateKey.algorithm?.namedCurve !== 'P-256')
        throw fail('E_SESSION_DEVICE_PROOF');
      const data = enc.encode('opendesk-cookie-share:v1:' + inviteId + ':' + requestId + ':' + challenge);
      return b64(await subtle.sign({name: 'ECDSA', hash: 'SHA-256'}, privateKey, data));
    }
  });
}
