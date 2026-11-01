import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {storageError} from '../../src/platform/storage/idb.js';

// A transactional structured-clone reference model, not native IndexedDB.
// WebCrypto operations below are real. Chrome persistence remains NOT_TESTED.
const module = await import('../../src/platform/storage/device-keys.js').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});
function fixture() {
  const records = new Map(), calls = [], hooks = {};
  let tail = Promise.resolve(), authorized = true;
  const storageFactory = async options => {
    calls.push(options);
    return {readOnly: false, transaction(stores, mode, work) {
      const pending = tail.then(async () => {
        assert.deepEqual(stores, ['frameworkKV']);
        const draft = structuredClone(records);
        const tx = {
          async get(store, key) { await hooks.get?.(mode); return structuredClone(draft.get(key)); },
          async put(store, value, key) {
            assert.equal(mode, 'readwrite');
            draft.set(key, structuredClone(value));
          },
          async delete(store, key) { assert.equal(mode, 'readwrite'); await hooks.delete?.(key); draft.delete(key); },
          async countPrefix(store, prefix) { return [...draft.keys()].filter(key => key.startsWith(prefix)).length; },
          async keys(store, {prefix, limit}) {
            await hooks.keys?.({prefix, limit});
            return [...draft.keys()].filter(key => key.startsWith(prefix)).sort().slice(0, limit);
          }
        };
        const result = await work(tx);
        if (mode === 'readwrite') {
          records.clear(); for (const [key, value] of draft) records.set(key, value);
          await hooks.afterCommit?.();
        }
        return result;
      });
      tail = pending.catch(() => {}); return pending.catch(error => { throw storageError(error); });
    }};
  };
  const authorize = async () => {
    if (!authorized) throw Object.assign(new Error('revoked'), {code: 'E_REVOKED'});
  };
  return {records, calls, hooks, storageFactory, authorize,
    revoke() { authorized = false; }, restore() { authorized = true; }};
}
function service(f, owner = 'audited-tool:install-1') {
  assert.equal(typeof module.createDeviceKeyStorage, 'function',
    'Foundation needs a private device-key storage capability');
  return module.createDeviceKeyStorage({owner, authorize: f.authorize,
    storageFactory: f.storageFactory, cryptoImpl: webcrypto});
}

test('device ECDH identity survives service reconstruction without an exportable private key', async () => {
  const f = fixture(), store = service(f);
  const first = await store.create('receive-1', 'ECDH');
  const restored = await service(f).open('receive-1', 'ECDH');
  assert.equal(restored.fingerprint, first.fingerprint);
  assert.equal(restored.privateKey.extractable, false);
  assert.equal(restored.privateKey.type, 'private');
  await assert.rejects(webcrypto.subtle.exportKey('jwk', restored.privateKey));
  const peer = await webcrypto.subtle.generateKey({name: 'ECDH', namedCurve: 'P-256'}, false, ['deriveBits']);
  const a = await webcrypto.subtle.deriveBits({name: 'ECDH', public: peer.publicKey}, restored.privateKey, 256);
  const b = await webcrypto.subtle.deriveBits({name: 'ECDH', public: restored.publicKey}, peer.privateKey, 256);
  assert.deepEqual(new Uint8Array(a), new Uint8Array(b));
  assert.ok(f.calls.every(call => call.name === 'opendesk-browser.device-keys.v1'));
  assert.equal(store.rawBackup, undefined);
});

test('signing identity stays nonextractable and verifies after reconstruction', async () => {
  const f = fixture(), store = service(f);
  const first = await store.create('receive-sign-1', 'ECDSA');
  const key = await service(f).open('receive-sign-1', 'ECDSA');
  const bytes = new TextEncoder().encode('synthetic pairing challenge');
  const signature = await webcrypto.subtle.sign({name: 'ECDSA', hash: 'SHA-256'}, key.privateKey, bytes);
  assert.equal(await webcrypto.subtle.verify({name: 'ECDSA', hash: 'SHA-256'}, first.publicKey, signature, bytes), true);
  await assert.rejects(webcrypto.subtle.exportKey('pkcs8', key.privateKey));
});

test('an existing identity is reused atomically; simultaneous creation cannot replace it', async () => {
  const f = fixture();
  const [a, b] = await Promise.all([service(f).create('receive-1', 'ECDH'), service(f).create('receive-1', 'ECDH')]);
  assert.equal(a.fingerprint, b.fingerprint);
  assert.equal(f.records.size, 1);
  assert.equal((await service(f).create('receive-1', 'ECDH')).fingerprint, a.fingerprint);
});

test('missing keys and a different owner or purpose fail without generating replacements', async () => {
  const f = fixture(), store = service(f);
  await assert.rejects(store.open('missing', 'ECDH'), {code: 'E_DEVICE_KEY_NOT_FOUND'});
  const key = await store.create('receive-1', 'ECDH');
  await assert.rejects(service(f, 'audited-tool:install-2').open('receive-1', 'ECDH'), {code: 'E_DEVICE_KEY_NOT_FOUND'});
  await assert.rejects(store.open('receive-1', 'ECDSA'), {code: 'E_DEVICE_KEY_PURPOSE'});
  assert.equal((await store.open('receive-1', 'ECDH')).fingerprint, key.fingerprint);
  assert.equal(f.records.size, 1);
});

test('corrupt or mismatched key material is rejected without overwriting the stored record', async () => {
  for (const corruption of ['private', 'extractable', 'fingerprint', 'owner']) {
    const f = fixture(), store = service(f);
    await store.create('receive-1', 'ECDH');
    const [slot, row] = [...f.records][0];
    const other = await webcrypto.subtle.generateKey({name: 'ECDH', namedCurve: 'P-256'}, corruption === 'extractable', ['deriveBits']);
    if (corruption === 'private' || corruption === 'extractable') row.privateKey = other.privateKey;
    if (corruption === 'fingerprint') row.fingerprint = '0'.repeat(64);
    if (corruption === 'owner') row.owner = 'other-install';
    f.records.set(slot, row);
    await assert.rejects(store.open('receive-1', 'ECDH'), {code: 'E_DEVICE_KEY_CORRUPT'});
    await assert.rejects(store.create('receive-1', 'ECDH'), {code: 'E_DEVICE_KEY_CORRUPT'});
    assert.equal(f.records.size, 1);
    assert.equal(f.records.get(slot).owner, row.owner);
  }
});

test('revocation after a durable creation returns unknown and a later explicit read recovers the same key', async () => {
  const f = fixture(), store = service(f);
  f.hooks.afterCommit = () => f.revoke();
  await assert.rejects(store.create('receive-1', 'ECDH'), {code: 'E_DEVICE_KEY_OUTCOME_UNKNOWN'});
  assert.equal(f.records.size, 1);
  await assert.rejects(store.open('receive-1', 'ECDH'), {code: 'E_REVOKED'});
  f.restore(); delete f.hooks.afterCommit;
  const key = await store.open('receive-1', 'ECDH');
  assert.equal((await store.create('receive-1', 'ECDH')).fingerprint, key.fingerprint);
});

test('lost commit receipts never cause automatic re-creation or overwrite', async () => {
  const f = fixture(), store = service(f);
  f.hooks.afterCommit = () => { throw Error('lost receipt'); };
  await assert.rejects(store.create('receive-1', 'ECDH'), {code: 'E_DEVICE_KEY_OUTCOME_UNKNOWN'});
  assert.equal(f.records.size, 1);
  delete f.hooks.afterCommit;
  const key = await store.open('receive-1', 'ECDH');
  assert.equal((await store.create('receive-1', 'ECDH')).fingerprint, key.fingerprint);
});

test('removal requires the exact saved fingerprint and leaves other owners intact', async () => {
  const f = fixture(), a = service(f), b = service(f, 'other-tool:install-1');
  const key = await a.create('receive-1', 'ECDH');
  const other = await b.create('receive-1', 'ECDH');
  await assert.rejects(a.remove('receive-1', '0'.repeat(64)), {code: 'E_DEVICE_KEY_CONFLICT'});
  assert.equal(f.records.size, 2);
  await a.remove('receive-1', key.fingerprint);
  await assert.rejects(a.remove('receive-1', key.fingerprint), {code: 'E_DEVICE_KEY_NOT_FOUND'});
  await assert.rejects(a.open('receive-1', 'ECDH'), {code: 'E_DEVICE_KEY_NOT_FOUND'});
  assert.equal((await b.open('receive-1', 'ECDH')).fingerprint, other.fingerprint);
});

test('transaction-time revocation preserves its authority error and writes no identity', async () => {
  const f = fixture(), store = service(f);
  f.hooks.get = mode => { if (mode === 'readwrite') f.revoke(); };
  await assert.rejects(store.create('receive-1', 'ECDH'), {code: 'E_REVOKED'});
  assert.equal(f.records.size, 0);
});

test('device-key owner quota blocks new slots while preserving existing identities and other owners', async () => {
  const f = fixture(), store = service(f), key = await store.create('slot-0', 'ECDH');
  const [firstSlot, firstRow] = [...f.records][0];
  for (let n = 1; n < 768; n++) {
    const id = 'slot-' + n;
    f.records.set('device-key:' + JSON.stringify([firstRow.owner, id]), {...firstRow, id});
  }
  await service(f, 'other-owner').create('independent', 'ECDH');
  await assert.rejects(store.create('overflow', 'ECDH'), {code: 'E_DEVICE_KEY_LIMIT'});
  assert.equal((await store.create('slot-0', 'ECDH')).fingerprint, key.fingerprint);
  assert.equal(f.records.get(firstSlot).fingerprint, key.fingerprint);
  assert.equal(f.records.size, 769);
});

test('private lifecycle clearing is exact-owner, independently verified and resumable after an unknown commit', async () => {
  const f = fixture(), store = service(f), other = service(f, 'other-owner');
  await store.create('receive-1', 'ECDH'); await store.create('verify-1', 'ECDSA');
  const independent = await other.create('receive-1', 'ECDH');
  assert.equal(typeof store.clear, 'function');
  f.hooks.afterCommit = () => { throw Error('lost deletion receipt'); };
  await assert.rejects(store.clear(), {code: 'E_DEVICE_KEY_OUTCOME_UNKNOWN'});
  delete f.hooks.afterCommit;
  await store.clear(); await store.clear();
  assert.equal(f.records.size, 1);
  assert.equal((await other.open('receive-1', 'ECDH')).fingerprint, independent.fingerprint);
  f.revoke(); await assert.rejects(store.clear(), {code: 'E_REVOKED'});
});

test('legacy over-quota identities clear in bounded explicit passes and preserve recovery after a lost batch receipt', async () => {
  const f = fixture(), store = service(f), other = service(f, 'other-owner');
  await store.create('slot-0', 'ECDH');
  const [, row] = [...f.records][0];
  for (let n = 1; n < 1540; n++) {
    const id = 'slot-' + n;
    f.records.set('device-key:' + JSON.stringify([row.owner, id]), {...row, id});
  }
  const independent = await other.create('independent', 'ECDH'), limits = [];
  f.hooks.keys = ({limit}) => limits.push(limit);
  await assert.rejects(store.clear(), {code: 'E_DEVICE_KEY_CLEANUP_PENDING'});
  assert.equal(f.records.size, 773, 'one pass removes at most 768 owner keys');
  f.hooks.afterCommit = () => { throw Error('lost batch receipt'); };
  await assert.rejects(service(f).clear(), {code: 'E_DEVICE_KEY_OUTCOME_UNKNOWN'});
  assert.equal(f.records.size, 5, 'committed batch is not rolled back by a lost reply');
  delete f.hooks.afterCommit;
  await service(f).clear();
  assert.equal(f.records.size, 1);
  assert.ok(limits.every(limit => limit === 768));
  assert.equal((await other.open('independent', 'ECDH')).fingerprint, independent.fingerprint);
});

test('revocation within a cleanup batch aborts it before later keys can be deleted', async () => {
  const f = fixture(), store = service(f);
  await store.create('receive-1', 'ECDH'); await store.create('verify-1', 'ECDSA');
  let deletions = 0;
  f.hooks.delete = () => { if (++deletions === 1) f.revoke(); };
  await assert.rejects(store.clear(), {code: 'E_DEVICE_KEY_OUTCOME_UNKNOWN'});
  assert.equal(deletions, 1);
  assert.equal(f.records.size, 2, 'the strict transaction abort preserves the entire batch');
  f.restore(); delete f.hooks.delete;
  await store.clear();
  assert.equal(f.records.size, 0);
});
