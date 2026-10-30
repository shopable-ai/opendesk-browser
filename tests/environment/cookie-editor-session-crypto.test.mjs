import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';

const module = await import('../../examples/sidebar-tools/cookie-editor/trusted/account-session-crypto.js').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});
async function fixture() {
  assert.equal(typeof module.createCookieSessionCrypto, 'function', 'Encrypted Cookie delivery needs an authenticated envelope');
  const crypto = module.createCookieSessionCrypto({cryptoImpl: webcrypto});
  const pair = () => webcrypto.subtle.generateKey({name: 'ECDH', namedCurve: 'P-256'}, false, ['deriveBits']);
  const sender = await pair(), receiver = await pair();
  const signing = await webcrypto.subtle.generateKey({name: 'ECDSA', namedCurve: 'P-256'}, false, ['sign', 'verify']);
  const receiverPublic = await crypto.publicJwk(receiver.publicKey);
  const verifyPublic = await crypto.publicJwk(signing.publicKey);
  const context = {inviteId: 'i'.repeat(32), requestId: 'r'.repeat(32), origin: 'https://example.com',
    receiverFingerprint: await crypto.deviceFingerprint(receiverPublic, verifyPublic)};
  const snapshot = {format: 1, origin: context.origin,
    cookies: [{name: 'synthetic', value: 'FICTIONAL_COOKIE_VALUE', domain: 'example.com', path: '/'}]};
  return {crypto, sender, receiver, signing, receiverPublic, verifyPublic, context, snapshot, pair};
}

test('ECDH/HKDF/AES-GCM envelope roundtrips without exposing Cookie bytes or private keys', async () => {
  const f = await fixture();
  const result = await f.crypto.encrypt({sender: f.sender, receiverPublic: f.receiverPublic,
    context: f.context, snapshot: f.snapshot});
  assert.doesNotMatch(JSON.stringify(result), /FICTIONAL_COOKIE_VALUE|privateKey|cookies/);
  assert.deepEqual(await f.crypto.decrypt({receiver: f.receiver, context: f.context,
    expectedSenderFingerprint: result.senderFingerprint, packet: result.packet}), f.snapshot);
  assert.equal(f.sender.privateKey.extractable, false);
  assert.equal(f.receiver.privateKey.extractable, false);
});

test('origin, invitation, pair and receiver fingerprint are authenticated independently', async () => {
  const f = await fixture();
  const result = await f.crypto.encrypt({...f, receiverPublic: f.receiverPublic});
  for (const change of [{origin: 'https://other.example'}, {inviteId: 'j'.repeat(32)},
    {requestId: 's'.repeat(32)}, {receiverFingerprint: '0'.repeat(64)}]) {
    await assert.rejects(f.crypto.decrypt({receiver: f.receiver,
      context: {...f.context, ...change}, packet: result.packet,
      expectedSenderFingerprint: result.senderFingerprint}), {code: 'E_SESSION_PACKET'});
  }
});

test('a substituted sender key or absent human-reviewed sender fingerprint is rejected', async () => {
  const f = await fixture(), result = await f.crypto.encrypt({...f});
  await assert.rejects(f.crypto.decrypt({receiver: f.receiver, context: f.context,
    packet: result.packet, expectedSenderFingerprint: '0'.repeat(64)}), {code: 'E_SESSION_SENDER_MISMATCH'});
  await assert.rejects(f.crypto.decrypt({receiver: f.receiver, context: f.context,
    packet: result.packet}), {code: 'E_SESSION_FINGERPRINT_REQUIRED'});
  const substituted = await f.crypto.publicJwk((await f.pair()).publicKey);
  await assert.rejects(f.crypto.decrypt({receiver: f.receiver, context: f.context,
    packet: {...result.packet, senderPublic: substituted},
    expectedSenderFingerprint: result.senderFingerprint}), {code: 'E_SESSION_SENDER_MISMATCH'});
});

test('tampered ciphertext, IV and an unrelated receiver cannot decrypt', async () => {
  const f = await fixture(), result = await f.crypto.encrypt({...f});
  for (const packet of [{...result.packet, ciphertext:
    (result.packet.ciphertext[0] === 'A' ? 'B' : 'A') + result.packet.ciphertext.slice(1)},
    {...result.packet, iv: Buffer.alloc(12, 9).toString('base64url')}]) {
    await assert.rejects(f.crypto.decrypt({receiver: f.receiver, context: f.context, packet,
      expectedSenderFingerprint: result.senderFingerprint}), {code: 'E_SESSION_PACKET'});
  }
  await assert.rejects(f.crypto.decrypt({receiver: await f.pair(), context: f.context,
    packet: result.packet, expectedSenderFingerprint: result.senderFingerprint}), {code: 'E_SESSION_PACKET'});
});

test('pair fingerprint binds both public keys; private JWK material and oversized snapshots fail closed', async () => {
  const f = await fixture();
  const other = await webcrypto.subtle.generateKey({name: 'ECDSA', namedCurve: 'P-256'}, false, ['sign', 'verify']);
  assert.notEqual(await f.crypto.deviceFingerprint(f.receiverPublic, await f.crypto.publicJwk(other.publicKey)),
    f.context.receiverFingerprint);
  await assert.rejects(f.crypto.encrypt({...f, receiverPublic: {...f.receiverPublic, d: 'never-accept-private'}}), {code: 'E_SESSION_PUBLIC_KEY'});
  await assert.rejects(f.crypto.encrypt({...f, snapshot: {...f.snapshot,
    cookies: [{value: 'x'.repeat(512001)}]}}), {code: 'E_SESSION_SNAPSHOT'});
});

test('claim signature binds the original Relay invitation, request and fresh challenge', async () => {
  const f = await fixture(), challenge = 'c'.repeat(32);
  const signature = await f.crypto.signClaim({privateKey: f.signing.privateKey,
    ...f.context, challenge});
  const bytes = new TextEncoder().encode('opendesk-cookie-share:v1:' +
    f.context.inviteId + ':' + f.context.requestId + ':' + challenge);
  assert.equal(await webcrypto.subtle.verify({name: 'ECDSA', hash: 'SHA-256'},
    f.signing.publicKey, Buffer.from(signature, 'base64url'), bytes), true);
  const wrong = new TextEncoder().encode(new TextDecoder().decode(bytes) + 'changed');
  assert.equal(await webcrypto.subtle.verify({name: 'ECDSA', hash: 'SHA-256'},
    f.signing.publicKey, Buffer.from(signature, 'base64url'), wrong), false);
});

test('protocol identifiers and fingerprints must be strings rather than coercible arrays', async () => {
  const f = await fixture();
  for (const field of ['inviteId', 'requestId', 'receiverFingerprint']) {
    await assert.rejects(f.crypto.encrypt({...f,
      context: {...f.context, [field]: [f.context[field]]}}), {code: 'E_SESSION_CONTEXT'});
  }
  await assert.rejects(f.crypto.signClaim({privateKey: f.signing.privateKey,
    ...f.context, challenge: ['c'.repeat(32)]}), {code: 'E_SESSION_DEVICE_PROOF'});
});
