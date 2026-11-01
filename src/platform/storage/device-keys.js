// Private Foundation capability for fixed, audited extension consumers only.
// Reuse createStorage and its strict frameworkKV transactions. Device-bound
// CryptoKeys live in a separate database namespace, never the portable main
// database/backup. Losing this namespace requires explicit re-pairing; open()
// must not regenerate a missing identity. No SDK/RPC or backup method is exposed.
import {createStorage} from './index.js';
import {FoundationError} from '../protocol.js';

const DATABASE = 'opendesk-browser.device-keys.v1';
const STORE = 'frameworkKV';
// Bounded independently of any consumer's own receipt limits.
const OWNER_LIMIT = 768;
const fail = code => new FoundationError(code, code);
const purposes = Object.freeze({ECDH: ['deriveBits'], ECDSA: ['sign']});
const equal = (a, b) => a.length === b.length && a.every((value, i) => value === b[i]);
const validId = id => typeof id === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(id);

export function createDeviceKeyStorage({owner, authorize, storageFactory = createStorage,
  cryptoImpl = globalThis.crypto} = {}) {
  if (typeof owner !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9:._/-]{0,159}$/.test(owner) ||
      typeof authorize !== 'function' || typeof storageFactory !== 'function' ||
      !cryptoImpl?.subtle || typeof cryptoImpl.getRandomValues !== 'function')
    throw fail('E_DEVICE_KEY_REQUEST');
  const subtle = cryptoImpl.subtle;
  const guard = async () => {
    try { await authorize(); }
    catch (error) { throw fail(error?.code || 'E_DEVICE_KEY_AUTHORIZATION'); }
  };
  const slot = id => 'device-key:' + JSON.stringify([owner, id]);
  const prefix = 'device-key:' + JSON.stringify([owner]).slice(0, -1) + ',';
  const request = (id, purpose) => {
    if (!validId(id) || !Object.hasOwn(purposes, purpose)) throw fail('E_DEVICE_KEY_REQUEST');
  };
  async function storage() {
    await guard();
    const result = await storageFactory({name: DATABASE, version: 2, readOnly: false});
    if (!result?.transaction || result.readOnly) throw fail('E_DEVICE_KEY_STORAGE');
    return result;
  }
  async function fingerprint(publicKey) {
    const bytes = await subtle.exportKey('spki', publicKey);
    return Array.from(new Uint8Array(await subtle.digest('SHA-256', bytes)),
      byte => byte.toString(16).padStart(2, '0')).join('');
  }
  async function checked(row, id, purpose) {
    if (row === undefined) throw fail('E_DEVICE_KEY_NOT_FOUND');
    if (!row || row.format !== 1 || row.owner !== owner || row.id !== id ||
        !Object.hasOwn(purposes, row.purpose)) throw fail('E_DEVICE_KEY_CORRUPT');
    if (row.purpose !== purpose) throw fail('E_DEVICE_KEY_PURPOSE');
    try {
      const {privateKey, publicKey} = row;
      if (privateKey?.type !== 'private' || privateKey.extractable !== false ||
          publicKey?.type !== 'public' || publicKey.extractable !== true ||
          [privateKey, publicKey].some(key => key.algorithm?.name !== purpose ||
            key.algorithm?.namedCurve !== 'P-256') ||
          !equal(privateKey.usages, purposes[purpose]) ||
          !equal(publicKey.usages, purpose === 'ECDSA' ? ['verify'] : []) ||
          row.fingerprint !== await fingerprint(publicKey)) throw fail('E_DEVICE_KEY_CORRUPT');
      // Real operations establish CryptoKey brands and the private/public pair;
      // metadata or a matching public fingerprint alone cannot establish this.
      if (purpose === 'ECDSA') {
        const challenge = cryptoImpl.getRandomValues(new Uint8Array(32));
        const algorithm = {name: 'ECDSA', hash: 'SHA-256'};
        const signature = await subtle.sign(algorithm, privateKey, challenge);
        if (!await subtle.verify(algorithm, publicKey, signature, challenge)) throw fail('E_DEVICE_KEY_CORRUPT');
      } else {
        const peer = await subtle.generateKey({name: 'ECDH', namedCurve: 'P-256'}, false, ['deriveBits']);
        const a = await subtle.deriveBits({name: 'ECDH', public: peer.publicKey}, privateKey, 256);
        const b = await subtle.deriveBits({name: 'ECDH', public: publicKey}, peer.privateKey, 256);
        if (!equal(new Uint8Array(a), new Uint8Array(b))) throw fail('E_DEVICE_KEY_CORRUPT');
      }
      return Object.freeze({privateKey, publicKey, fingerprint: row.fingerprint});
    } catch { throw fail('E_DEVICE_KEY_CORRUPT'); }
  }
  async function read(service, id, purpose) {
    await guard();
    const row = await service.transaction([STORE], 'readonly', tx => tx.get(STORE, slot(id)));
    const result = await checked(row, id, purpose);
    await guard();
    return result;
  }
  return Object.freeze({
    async open(id, purpose) {
      request(id, purpose);
      return read(await storage(), id, purpose);
    },
    async create(id, purpose) {
      request(id, purpose);
      const service = await storage();
      // A corrupt/unreadable record is not an absent identity. Never replace it.
      try { return await read(service, id, purpose); }
      catch (error) { if (error.code !== 'E_DEVICE_KEY_NOT_FOUND') throw error; }
      const keys = await subtle.generateKey({name: purpose, namedCurve: 'P-256'}, false,
        purpose === 'ECDSA' ? ['sign', 'verify'] : purposes[purpose]);
      const row = {format: 1, owner, id, purpose, ...keys,
        fingerprint: await fingerprint(keys.publicKey)};
      await checked(row, id, purpose);
      await guard();
      let attempted = false;
      try {
        const expected = await service.transaction([STORE], 'readwrite', async tx => {
          const current = await tx.get(STORE, slot(id));
          if (current !== undefined) return (await checked(current, id, purpose)).fingerprint;
          const count = await tx.countPrefix(STORE, prefix);
          if (!Number.isSafeInteger(count) || count < 0) throw fail('E_DEVICE_KEY_STORAGE');
          if (count >= OWNER_LIMIT) throw fail('E_DEVICE_KEY_LIMIT');
          await guard();
          attempted = true;
          await tx.put(STORE, row, slot(id));
          return row.fingerprint;
        });
        const receipt = await read(service, id, purpose);
        if (receipt.fingerprint !== expected) throw fail('E_DEVICE_KEY_CONFLICT');
        return receipt;
      } catch (error) {
        if (attempted) throw fail('E_DEVICE_KEY_OUTCOME_UNKNOWN');
        throw error;
      }
    },
    // Fixed lifecycle callers may supply their independently authorized cleanup
    // guard. Ordinary revoked handles retain their original guard and fail.
    async clear() {
      const service = await storage();
      let attempted = false, remaining;
      try {
        await service.transaction([STORE], 'readwrite', async tx => {
          // Old consumers may have left more records than the creation quota.
          // One explicit call removes a bounded batch, even in that case.
          const rows = await tx.keys(STORE, {prefix, limit: OWNER_LIMIT});
          await guard();
          for (const key of rows) {
            await guard();
            attempted = true;
            await tx.delete(STORE, key);
          }
        });
        remaining = await service.transaction([STORE], 'readonly', tx => tx.countPrefix(STORE, prefix));
        if (!Number.isSafeInteger(remaining) || remaining < 0) throw fail('E_DEVICE_KEY_STORAGE');
        await guard();
      } catch (error) {
        if (attempted) throw fail('E_DEVICE_KEY_OUTCOME_UNKNOWN');
        throw error;
      }
      // A verified partial cleanup is resumable. Lifecycle callers must keep
      // their owner references until a later explicit clear verifies zero.
      if (remaining > 0) throw fail('E_DEVICE_KEY_CLEANUP_PENDING');
    },
    async remove(id, expectedFingerprint) {
      if (!validId(id) || typeof expectedFingerprint !== 'string' ||
          !/^[a-f0-9]{64}$/.test(expectedFingerprint)) throw fail('E_DEVICE_KEY_REQUEST');
      const service = await storage();
      let attempted = false;
      try {
        await service.transaction([STORE], 'readwrite', async tx => {
          const row = await tx.get(STORE, slot(id));
          if (row === undefined) throw fail('E_DEVICE_KEY_NOT_FOUND');
          if (row.owner !== owner || row.id !== id || row.fingerprint !== expectedFingerprint)
            throw fail('E_DEVICE_KEY_CONFLICT');
          await guard();
          attempted = true;
          await tx.delete(STORE, slot(id));
        });
        const row = await service.transaction([STORE], 'readonly', tx => tx.get(STORE, slot(id)));
        if (row !== undefined) throw fail('E_DEVICE_KEY_CONFLICT');
        await guard();
      } catch (error) {
        if (attempted) throw fail('E_DEVICE_KEY_OUTCOME_UNKNOWN');
        throw error;
      }
    }
  });
}
