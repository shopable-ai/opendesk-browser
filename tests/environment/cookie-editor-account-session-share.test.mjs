import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {createShareRelay, createShareHttpServer} from '../../services/cookie-share-relay/server.mjs';
import {COOKIE_SHARE_STORAGE_KEY} from '../../examples/sidebar-tools/cookie-editor/trusted/account-share.js';
import {createCookieAccountVault} from '../../examples/sidebar-tools/cookie-editor/trusted/account-vault.js';
import {createDeviceKeyStorage} from '../../src/platform/storage/device-keys.js';
import {createCookieSessionCrypto} from '../../examples/sidebar-tools/cookie-editor/trusted/account-session-crypto.js';
import {storageError} from '../../src/platform/storage/idb.js';
import {validateAccountCookieRow} from '../../examples/sidebar-tools/cookie-editor/trusted/account-service.js';

const module = await import('../../examples/sidebar-tools/cookie-editor/trusted/account-session-share.js')
  .catch(error => { if (error.code === 'ERR_MODULE_NOT_FOUND') return {}; throw error; });
const SITE = 'https://accounts.example.test', RELAY = 'https://relay.example.test';
const OWNER = 'cookie-editor:' + 'a'.repeat(64);
const fail = code => Object.assign(new Error(code), {code});
const jsonClone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const sessionCrypto = createCookieSessionCrypto({cryptoImpl: webcrypto});
const cookie = {name: 'synthetic_session', value: 'SYNTHETIC_SESSION_ONLY',
  domain: 'accounts.example.test', path: '/', hostOnly: true, secure: true,
  httpOnly: true, sameSite: 'lax', session: true, storeId: 'source-store',
  partitionKey: {topLevelSite: SITE, hasCrossSiteAncestor: false}};

// Transactional reference models: the portable state is JSON serializable;
// the separate keys database clones real nonextractable CryptoKeys. NODE only.
function database(clone = jsonClone) {
  const records = new Map(); let tail = Promise.resolve();
  const storage = async () => ({readOnly: false, transaction(stores, mode, work) {
    assert.deepEqual(stores, ['frameworkKV']);
    const run = tail.then(async () => {
      const draft = new Map([...records].map(([k, v]) => [k, clone(v)]));
      const result = await work({
        get: async (_store, key) => clone(draft.get(key)),
        put: async (_store, value, key) => {
          assert.equal(mode, 'readwrite'); draft.set(key, clone(value));
        },
        delete: async (_store, key) => { assert.equal(mode, 'readwrite'); draft.delete(key); },
        countPrefix: async (_store, prefix) => [...draft.keys()].filter(key => key.startsWith(prefix)).length,
        keys: async (_store, {prefix, limit}) => [...draft.keys()].filter(key => key.startsWith(prefix)).sort().slice(0, limit)
      });
      if (mode === 'readwrite') {
        records.clear(); for (const [k, v] of draft) records.set(k, v);
      }
      return result;
    });
    tail = run.catch(() => {}); return run.catch(error => { throw storageError(error); });
  }});
  return {records, storage};
}

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'od-session-share-'));
  const dbPath = join(directory, 'relay.sqlite');
  let relay, server;
  async function start() {
    relay = createShareRelay({dbPath, publicOrigin: RELAY});
    server = createShareHttpServer(relay);
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
  }
  async function stop() {
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); relay.close();
  }
  await start();
  t.after(async () => { await stop(); await rm(directory, {recursive: true}); });
  const calls = [];
  async function http(path, options = {}) {
    const response = await fetch('http://127.0.0.1:' + server.address().port + path, {
      method: options.body === undefined ? 'GET' : 'POST',
      headers: {'content-type': 'application/json',
        ...(options.secret ? {'x-opendesk-invite-manager': options.secret} : {})},
      ...(options.body === undefined ? {} : {body: JSON.stringify(options.body)})
    });
    const result = await response.json();
    if (!response.ok) throw fail(result?.error?.code || 'E_SHARE_RESPONSE');
    return result;
  }
  function device(name) {
    const plain = database(), privateDB = database(structuredClone), hooks = {};
    const control = {authorized: true, permission: true, nativeWrites: 0};
    const authorize = async () => { if (!control.authorized) throw fail('E_TOOL_CHANGED'); };
    const api = {storage: {local: {get: async () => ({})}}, cookies: {
      set: async () => { control.nativeWrites++; throw fail('UNEXPECTED_NATIVE_WRITE'); },
      remove: async () => { control.nativeWrites++; throw fail('UNEXPECTED_NATIVE_WRITE'); }
    }};
    const vault = createCookieAccountVault({api, storage: plain.storage});
    const read = async () => jsonClone(plain.records.get(COOKIE_SHARE_STORAGE_KEY) ??
      {format: 1, items: [], claims: []});
    async function change(work) {
      await authorize();
      const service = await plain.storage();
      const result = await service.transaction(['frameworkKV'], 'readwrite', async tx => {
        const row = await tx.get('frameworkKV', COOKIE_SHARE_STORAGE_KEY) ?? {format: 1, items: [], claims: []};
        await hooks.beforeChange?.(row);
        const result = work(row);
        assert.ok(row.items.includes(result) || row.claims.includes(result),
          'original change callback is synchronous and returns an actual root record');
        await tx.put('frameworkKV', row, COOKIE_SHARE_STORAGE_KEY); return result;
      });
      if (hooks.afterWrite) await hooks.afterWrite(await read());
      const stored = await read();
      if (![...stored.items, ...stored.claims].some(x => JSON.stringify(x) === JSON.stringify(result)))
        throw fail('E_OUTCOME_UNKNOWN');
      await authorize(); return jsonClone(result);
    }
    async function request(origin, path, options = {}) {
      assert.equal(origin, RELAY); await authorize();
      await hooks.preflight?.(path, options);
      if (!control.permission) throw Object.assign(fail('E_SHARE_PERMISSION_REQUIRED'), {shareRequestUnsent: true});
      calls.push({device: name, path, ...jsonClone(options)});
      const result = await http(path, options);
      if (hooks.drop?.(path, options)) throw fail('E_OUTCOME_UNKNOWN');
      await authorize();
      if (!control.permission) throw fail(options.body === undefined ? 'E_SHARE_PERMISSION_REQUIRED' : 'E_OUTCOME_UNKNOWN');
      return hooks.response ? hooks.response(path, result) : result;
    }
    const keys = createDeviceKeyStorage({owner: OWNER, authorize,
      cryptoImpl: webcrypto, storageFactory: async options => {
        assert.equal(options.name, 'opendesk-browser.device-keys.v1');
        return privateDB.storage();
      }});
    async function mapSnapshot(snapshot) {
      await authorize(); await hooks.mapping?.(snapshot);
      assert.equal(snapshot.origin, SITE);
      return snapshot.cookies.map(row => validateAccountCookieRow({
        ...row, storeId: 'receiver-store'
      }, 'accounts.example.test', 'receiver-store', {topLevelSite: SITE, hasCrossSiteAncestor: false}, new Set()));
    }
    function create(overrides = {}) {
      assert.equal(typeof module.createCookieAccountSessionShare, 'function',
        'the trusted session helper must implement the existing Relay session flow');
      const service = module.createCookieAccountSessionShare({read, change, request,
        vault, authorize, keys, sessionCrypto, mapSnapshot,
        validateSnapshot: async snapshot => { await authorize(); await hooks.sourceValidation?.(snapshot); },
        ...overrides});
      return {...service, dispatch: (action, payload = {}, owner = OWNER) =>
        service.dispatch(action, {origin: SITE, ...payload}, owner)};
    }
    return {create, read, change, vault, control, hooks, keys,
      records: plain.records, keyRecords: privateDB.records};
  }
  const sender = device('sender'), receiver = device('receiver');
  const source = {alias: 'acct_source_session', origin: SITE, displayName: '合成账号',
    description: '仅用于 Node 测试', cookies: [cookie], version: 1, allowAuto: true};
  await sender.vault.update(0, data => data.accounts.push(source));
  const created = await http('/v1/invites', {body: {origin: SITE, displayName: source.displayName,
    description: source.description, mode: 'session', expiresInSeconds: 3600, maxClaims: 1}});
  const item = {ref: webcrypto.randomUUID(), owner: OWNER, relay: RELAY,
    alias: source.alias, siteOrigin: SITE, accountVersion: 1,
    url: created.url, id: created.invite.id, managerSecret: created.managerSecret,
    invite: created.invite, phase: 'active'};
  await sender.change(state => { state.items.push(item); return item; });
  const pair = () => receiver.create().dispatch('sharePair', {inviteUrl: item.url});
  const deliver = paired => sender.create().dispatch('shareDeliver', {
    ref: item.ref, requestId: paired.pair.requestId, receiverFingerprint: paired.pair.receiverFingerprint, revision: 1});
  const claim = delivered => receiver.create().dispatch('shareClaim', {
    inviteUrl: item.url, senderFingerprint: delivered.senderFingerprint, revision: 0});
  return {sender, receiver, calls, item, source, pair, deliver, claim,
    http, restart: async () => { await stop(); await start(); }};
}

test('session pairing and encrypted snapshot import survive both helper and SQLite Relay reconstruction', async t => {
  const f = await fixture(t), paired = await f.pair();
  assert.equal(paired.sessionAvailable, true); assert.equal(paired.sessionImported, false);
  assert.equal(paired.localSavePending, false); assert.equal(paired.url, f.item.url);
  assert.match(paired.pair.receiverFingerprint, /^[a-f0-9]{64}$/);
  assert.match(paired.pair.requestId, /^[A-Za-z0-9_-]{22,80}$/);
  assert.equal(f.receiver.keyRecords.size, 2);
  for (const row of f.receiver.keyRecords.values()) assert.equal(row.privateKey.extractable, false);
  const pairs = await f.sender.create().dispatch('sharePairs', {ref: f.item.ref});
  assert.equal(pairs.pairs[0].receiverFingerprint, paired.pair.receiverFingerprint);
  assert.doesNotMatch(JSON.stringify(pairs), /ecdhPublic|verifyPublic|managerSecret|privateKey|SYNTHETIC/);
  await f.restart();
  const delivered = await f.deliver(paired);
  assert.match(delivered.senderFingerprint, /^[a-f0-9]{64}$/);
  await f.restart();
  const result = await f.claim(delivered);
  assert.equal(result.status, 'session_imported'); assert.equal(result.sessionImported, true);
  assert.equal(result.cookieWriteVerified, false); assert.equal(result.websiteLoginConfirmed, false);
  const saved = (await f.receiver.vault.read()).accounts[0];
  assert.equal(saved.cookies[0].value, 'SYNTHETIC_SESSION_ONLY');
  assert.equal(saved.cookies[0].storeId, 'receiver-store');
  assert.deepEqual(saved.cookies[0].partitionKey, {topLevelSite: SITE, hasCrossSiteAncestor: false});
  assert.equal(saved.allowAuto, false); assert.notEqual(saved.alias, f.source.alias);
  assert.equal(f.receiver.control.nativeWrites + f.sender.control.nativeWrites, 0);
  assert.deepEqual((await f.sender.vault.read()).accounts[0], f.source);
  assert.doesNotMatch(JSON.stringify(await f.receiver.read()), /SYNTHETIC_SESSION_ONLY|privateKey/);
  assert.doesNotMatch(JSON.stringify(f.calls), /SYNTHETIC_SESSION_ONLY|"cookies"|privateKey/);
  assert.doesNotMatch(JSON.stringify(result), /SYNTHETIC_SESSION_ONLY|encryptedPacket|ciphertext|privateKey/);
  assert.deepEqual(Object.keys(f.calls.find(x => x.path.endsWith('/deliver')).body).sort(),
    ['ciphertext', 'iv', 'requestId', 'senderPublic']);
});

test('paired and delivered receipts never repeat a POST; applied inspection checks the saved alias after deletion', async t => {
  const f = await fixture(t), paired = await f.pair(), delivered = await f.deliver(paired);
  assert.deepEqual(await f.pair(), paired); assert.deepEqual(await f.deliver(paired), delivered);
  const result = await f.claim(delivered), before = f.calls.length;
  assert.equal((await f.claim(delivered)).alias, result.alias);
  const prior = (await f.receiver.read()).claims[0];
  const inspect = await f.receiver.create().inspect(prior, {inviteUrl: f.item.url, origin: SITE}, OWNER);
  assert.equal(inspect.sessionImported, true); assert.equal(inspect.localSavePending, false);
  assert.equal(f.calls.length, before);
  await f.receiver.vault.update(1, data => { data.accounts = []; });
  await assert.rejects(f.claim(delivered), {code: 'E_ACCOUNT_NOT_FOUND'});
  await assert.rejects(f.receiver.create().inspect(prior, {inviteUrl: f.item.url, origin: SITE}, OWNER),
    {code: 'E_ACCOUNT_NOT_FOUND'});
  for (const action of ['pair', 'deliver', 'challenge', 'claim'])
    assert.equal(f.calls.filter(x => x.path.endsWith('/' + action)).length, 1);
});

test('owner, exact invitation URL and origin fences reject cross-context pairing, inspection and sending', async t => {
  const f = await fixture(t), r = f.receiver.create(), s = f.sender.create();
  await assert.rejects(r.dispatch('sharePair', {inviteUrl: f.item.url, origin: 'https://other.test'}), {code: 'E_SITE_MISMATCH'});
  assert.equal(f.receiver.keyRecords.size, 0);
  const paired = await f.pair(), prior = (await f.receiver.read()).claims[0];
  await assert.rejects(s.dispatch('sharePairs', {ref: f.item.ref}, 'other'), {code: 'E_SHARE_NOT_FOUND'});
  await assert.rejects(s.dispatch('sharePairs', {ref: f.item.ref, origin: 'https://other.test'}), {code: 'E_SITE_MISMATCH'});
  await assert.rejects(r.inspect(prior, {inviteUrl: f.item.url, origin: SITE}, 'other'), {code: 'E_SHARE_NOT_FOUND'});
  await assert.rejects(r.inspect(prior, {inviteUrl: RELAY + '/i/' + 'x'.repeat(32), origin: SITE}, OWNER), {code: 'E_SHARE_NOT_FOUND'});
  await assert.rejects(r.dispatch('shareClaim', {inviteUrl: f.item.url, senderFingerprint: 'a'.repeat(64), revision: 0}, 'other'), {code: 'E_SHARE_NOT_FOUND'});
  await assert.rejects(r.dispatch('shareClaim', {inviteUrl: f.item.url, origin: 'https://other.test', senderFingerprint: 'a'.repeat(64), revision: 0}), {code: 'E_SITE_MISMATCH'});
  await assert.rejects(s.dispatch('shareDeliver', {ref: f.item.ref, requestId: paired.pair.requestId,
    receiverFingerprint: paired.pair.receiverFingerprint, revision: 1}, 'other'), {code: 'E_SHARE_NOT_FOUND'});
});

test('delivery requires an explicit matching receiver fingerprint and an unchanged source version/revision', async t => {
  const f = await fixture(t), paired = await f.pair(), s = f.sender.create();
  const input = {ref: f.item.ref, requestId: paired.pair.requestId, revision: 1};
  await assert.rejects(s.dispatch('shareDeliver', input), {code: 'E_SESSION_FINGERPRINT_REQUIRED'});
  await assert.rejects(s.dispatch('shareDeliver', {...input, receiverFingerprint: '0'.repeat(64)}), {code: 'E_SESSION_RECEIVER_MISMATCH'});
  await assert.rejects(s.dispatch('shareDeliver', {...input, receiverFingerprint: paired.pair.receiverFingerprint,
    revision: 0}), {code: 'E_VAULT_CONFLICT'});
  await f.sender.vault.update(1, data => { data.accounts[0].version++; });
  await assert.rejects(s.dispatch('shareDeliver', {...input, receiverFingerprint: paired.pair.receiverFingerprint,
    revision: 2}), {code: 'E_VAULT_CONFLICT'});
  assert.equal(f.calls.filter(x => x.path.endsWith('/deliver')).length, 0);
});

test('delivery fetches live pairs and validates both public keys and the pair-list bound', async t => {
  const f = await fixture(t), paired = await f.pair();
  const realPairs = await f.http('/v1/invites/' + f.item.id + '/pairs', {secret: f.item.managerSecret});
  for (const requests of [Array(21).fill(realPairs.requests[0]),
    [{...realPairs.requests[0], requestId: 'short'}],
    [{...realPairs.requests[0], verifyPublic: {...realPairs.requests[0].verifyPublic, d: 'private'}}],
    [realPairs.requests[0], realPairs.requests[0]]]) {
    f.sender.hooks.response = (path, result) => path.endsWith('/pairs') ? {requests} : result;
    await assert.rejects(f.sender.create().dispatch('sharePairs', {ref: f.item.ref}));
  }
  f.sender.hooks.response = (path, result) => path.endsWith('/pairs') ? {requests: []} : result;
  await assert.rejects(f.deliver(paired), {code: 'E_SESSION_PAIR_NOT_FOUND'});
  assert.equal(f.calls.filter(x => x.path.endsWith('/deliver')).length, 0);
});

test('unsent pair permission refusal reuses the same alias and keys only after a fresh invitation GET', async t => {
  const f = await fixture(t);
  f.receiver.hooks.preflight = path => { if (path.endsWith('/pair')) f.receiver.control.permission = false; };
  await assert.rejects(f.pair(), {code: 'E_SHARE_PERMISSION_REQUIRED'});
  const prior = (await f.receiver.read()).claims[0]; assert.equal(prior.phase, 'prepared');
  const keys = [...f.receiver.keyRecords.values()].map(x => x.fingerprint);
  f.receiver.control.permission = true; delete f.receiver.hooks.preflight;
  const paired = await f.pair(), row = (await f.receiver.read()).claims[0];
  assert.equal(row.alias, prior.alias); assert.equal(row.ref, prior.ref);
  assert.deepEqual([...f.receiver.keyRecords.values()].map(x => x.fingerprint), keys);
  assert.equal(row.receiverFingerprint, paired.pair.receiverFingerprint);
  assert.equal(f.calls.filter(x => /\/v1\/invites\/[^/]+$/.test(x.path)).length, 2);
  assert.equal(f.calls.filter(x => x.path.endsWith('/pair')).length, 1);
});

test('missing paired device keys fail closed without recreating an identity', async t => {
  const f = await fixture(t), paired = await f.pair(), delivered = await f.deliver(paired);
  f.receiver.keyRecords.clear();
  await assert.rejects(f.claim(delivered), {code: 'E_DEVICE_KEY_NOT_FOUND'});
  assert.equal(f.receiver.keyRecords.size, 0);
  assert.equal(f.calls.filter(x => x.path.endsWith('/challenge')).length, 0);
});

test('lost pair and delivery receipts retain durable fences across reconstruction without POST replay', async t => {
  const f = await fixture(t);
  f.receiver.hooks.drop = path => path.endsWith('/pair');
  await assert.rejects(f.pair(), {code: 'E_OUTCOME_UNKNOWN'});
  delete f.receiver.hooks.drop;
  await assert.rejects(f.pair(), {code: 'E_OUTCOME_UNKNOWN'});
  assert.equal(f.calls.filter(x => x.path.endsWith('/pair')).length, 1);
  // The live Relay reveals the synthetic pair whose local response was lost.
  const pending = await f.http('/v1/invites/' + f.item.id + '/pairs', {secret: f.item.managerSecret});
  const row = pending.requests[0];
  const paired = {pair: {requestId: row.requestId, receiverFingerprint:
    await sessionCrypto.deviceFingerprint(row.ecdhPublic, row.verifyPublic)}};
  f.sender.hooks.drop = path => path.endsWith('/deliver');
  await assert.rejects(f.deliver(paired), {code: 'E_OUTCOME_UNKNOWN'});
  delete f.sender.hooks.drop;
  await assert.rejects(f.deliver(paired), {code: 'E_OUTCOME_UNKNOWN'});
  assert.equal(f.calls.filter(x => x.path.endsWith('/deliver')).length, 1);
});

test('unsent delivery permission refusal retains the sender identity and permits an explicit retry', async t => {
  const f = await fixture(t), paired = await f.pair();
  f.sender.hooks.preflight = path => { if (path.endsWith('/deliver')) f.sender.control.permission = false; };
  await assert.rejects(f.deliver(paired), {code: 'E_SHARE_PERMISSION_REQUIRED'});
  const fingerprints = [...f.sender.keyRecords.values()].map(x => x.fingerprint);
  assert.equal((await f.sender.read()).items[0].deliveries[0].phase, 'prepared');
  f.sender.control.permission = true; delete f.sender.hooks.preflight;
  await f.deliver(paired);
  assert.deepEqual([...f.sender.keyRecords.values()].map(x => x.fingerprint), fingerprints);
  assert.equal(f.calls.filter(x => x.path.endsWith('/deliver')).length, 1);
  assert.equal(f.calls.filter(x => x.path.endsWith('/pairs')).length, 2);
});

test('a lost claim response remains unknown after remote consumption and cannot be resent', async t => {
  const f = await fixture(t), delivered = await f.deliver(await f.pair());
  f.receiver.hooks.drop = path => path.endsWith('/claim');
  await assert.rejects(f.claim(delivered), {code: 'E_OUTCOME_UNKNOWN'});
  delete f.receiver.hooks.drop; await f.restart();
  await assert.rejects(f.claim(delivered), {code: 'E_OUTCOME_UNKNOWN'});
  const prior = (await f.receiver.read()).claims[0];
  await assert.rejects(f.receiver.create().inspect(prior, {inviteUrl: f.item.url, origin: SITE}, OWNER), {code: 'E_OUTCOME_UNKNOWN'});
  assert.equal(f.calls.filter(x => x.path.endsWith('/claim')).length, 1);
  assert.equal((await f.receiver.vault.read()).accounts.length, 0);
});

test('only an unsent first challenge may restore paired; an unsent claim after a sent challenge stays unknown', async t => {
  const f = await fixture(t), delivered = await f.deliver(await f.pair());
  f.receiver.hooks.preflight = path => { if (path.endsWith('/challenge')) f.receiver.control.permission = false; };
  await assert.rejects(f.claim(delivered), {code: 'E_SHARE_PERMISSION_REQUIRED'});
  assert.equal((await f.receiver.read()).claims[0].phase, 'paired');
  f.receiver.control.permission = true;
  f.receiver.hooks.preflight = path => { if (path.endsWith('/claim')) f.receiver.control.permission = false; };
  await assert.rejects(f.claim(delivered), {code: 'E_SHARE_PERMISSION_REQUIRED'});
  assert.equal((await f.receiver.read()).claims[0].phase, 'claiming');
  f.receiver.control.permission = true; delete f.receiver.hooks.preflight;
  await assert.rejects(f.claim(delivered), {code: 'E_OUTCOME_UNKNOWN'});
  assert.equal(f.calls.filter(x => x.path.endsWith('/challenge')).length, 1);
  assert.equal(f.calls.filter(x => x.path.endsWith('/claim')).length, 0);
});

test('sender fingerprint is mandatory; a wrong human comparison cannot save plaintext or write Cookies', async t => {
  const f = await fixture(t), delivered = await f.deliver(await f.pair());
  await assert.rejects(f.receiver.create().dispatch('shareClaim', {inviteUrl: f.item.url, revision: 0}), {code: 'E_SESSION_FINGERPRINT_REQUIRED'});
  assert.equal(f.calls.filter(x => x.path.endsWith('/challenge')).length, 0);
  await assert.rejects(f.claim({senderFingerprint: '0'.repeat(64)}), {code: 'E_SESSION_SENDER_MISMATCH'});
  assert.equal((await f.receiver.read()).claims[0].phase, 'received');
  assert.equal((await f.receiver.vault.read()).accounts.length, 0);
  assert.equal(f.receiver.control.nativeWrites, 0);
  assert.notEqual(delivered.senderFingerprint, '0'.repeat(64));
});

test('received ciphertext can finish mapping and save locally after restart with a distinct alias/name', async t => {
  const f = await fixture(t), delivered = await f.deliver(await f.pair());
  await f.receiver.vault.update(0, data => data.accounts.push({...f.source, cookies: []}));
  f.receiver.hooks.mapping = () => { throw fail('E_ACCOUNT_COOKIE_SCOPE'); };
  const payload = {inviteUrl: f.item.url, revision: 1, senderFingerprint: delivered.senderFingerprint};
  await assert.rejects(f.receiver.create().dispatch('shareClaim', payload), {code: 'E_ACCOUNT_COOKIE_SCOPE'});
  const prior = (await f.receiver.read()).claims[0]; assert.equal(prior.phase, 'received');
  assert.ok(prior.encryptedPacket.ciphertext); assert.equal(prior.expectedSenderFingerprint, delivered.senderFingerprint);
  assert.doesNotMatch(JSON.stringify(prior), /SYNTHETIC_SESSION_ONLY/);
  const inspection = await f.receiver.create().inspect(prior, {inviteUrl: f.item.url, origin: SITE}, OWNER);
  assert.equal(inspection.localSavePending, true); assert.equal(inspection.sessionImported, false);
  assert.equal(inspection.senderFingerprint, delivered.senderFingerprint);
  const before = f.calls.length; delete f.receiver.hooks.mapping;
  const result = await f.receiver.create().dispatch('shareClaim', payload);
  assert.equal(f.calls.length, before);
  const data = await f.receiver.vault.read();
  assert.equal(data.accounts.length, 2); assert.equal(data.accounts[0].cookies.length, 0);
  assert.equal(data.accounts[1].displayName, '合成账号（领取 2）');
  assert.equal(data.accounts[1].alias, result.alias);
});

test('malformed or cross-origin claim metadata remains fenced and never reaches snapshot mapping', async t => {
  const f = await fixture(t), delivered = await f.deliver(await f.pair());
  f.receiver.hooks.response = (path, result) => path.endsWith('/claim') ?
    {...result, account: {...result.account, origin: 'https://other.test'}} : result;
  await assert.rejects(f.claim(delivered), {code: 'E_OUTCOME_UNKNOWN'});
  assert.equal((await f.receiver.read()).claims[0].phase, 'claiming');
  assert.equal((await f.receiver.vault.read()).accounts.length, 0);
  await assert.rejects(f.claim(delivered), {code: 'E_OUTCOME_UNKNOWN'});
  assert.equal(f.calls.filter(x => x.path.endsWith('/claim')).length, 1);
});

test('reopened pairs expose sender fingerprint only from a matching durable local delivery receipt', async t => {
  const f = await fixture(t), paired = await f.pair();
  const before = await f.sender.create().dispatch('sharePairs', {ref: f.item.ref});
  assert.equal(before.pairs[0].senderFingerprint, undefined);
  const delivered = await f.deliver(paired);
  const reopened = await f.sender.create().dispatch('sharePairs', {ref: f.item.ref});
  assert.equal(reopened.pairs[0].senderFingerprint, delivered.senderFingerprint);
  assert.equal(reopened.pairs[0].status, 'ready');
  const state = await f.sender.read();
  state.items[0].deliveries[0].phase = 'delivering';
  f.sender.records.set(COOKIE_SHARE_STORAGE_KEY, state);
  const unknown = await f.sender.create().dispatch('sharePairs', {ref: f.item.ref});
  assert.equal(unknown.pairs[0].status, 'ready'); assert.equal(unknown.pairs[0].senderFingerprint, undefined);
  state.items[0].deliveries[0].phase = 'delivered';
  state.items[0].deliveries[0].receiverFingerprint = '0'.repeat(64);
  f.sender.records.set(COOKIE_SHARE_STORAGE_KEY, state);
  assert.equal((await f.sender.create().dispatch('sharePairs', {ref: f.item.ref})).pairs[0].senderFingerprint, undefined);
});

test('received resume rejects altered human fingerprint or scope without a second remote claim', async t => {
  const f = await fixture(t), delivered = await f.deliver(await f.pair());
  f.receiver.hooks.mapping = () => { throw fail('E_ACCOUNT_COOKIE_SCOPE'); };
  await assert.rejects(f.claim(delivered), {code: 'E_ACCOUNT_COOKIE_SCOPE'});
  const count = f.calls.length;
  await assert.rejects(f.claim({senderFingerprint: '0'.repeat(64)}), {code: 'E_SESSION_SENDER_MISMATCH'});
  await assert.rejects(f.receiver.create().dispatch('shareClaim', {inviteUrl: f.item.url,
    senderFingerprint: delivered.senderFingerprint, revision: 0, origin: 'https://other.test'}), {code: 'E_SITE_MISMATCH'});
  assert.equal(f.calls.length, count); assert.equal((await f.receiver.vault.read()).accounts.length, 0);
});

test('lost challenge receipt cannot trigger a new challenge after helper reconstruction', async t => {
  const f = await fixture(t), delivered = await f.deliver(await f.pair());
  f.receiver.hooks.drop = path => path.endsWith('/challenge');
  await assert.rejects(f.claim(delivered), {code: 'E_OUTCOME_UNKNOWN'});
  delete f.receiver.hooks.drop;
  await assert.rejects(f.claim(delivered), {code: 'E_OUTCOME_UNKNOWN'});
  assert.equal(f.calls.filter(x => x.path.endsWith('/challenge')).length, 1);
  assert.equal(f.calls.filter(x => x.path.endsWith('/claim')).length, 0);
});

test('source changes during device-key preparation prevent ciphertext delivery', async t => {
  const f = await fixture(t), paired = await f.pair();
  f.sender.hooks.afterWrite = async state => {
    if (state.items[0].deliveries?.[0]?.phase === 'prepared') {
      delete f.sender.hooks.afterWrite;
      await f.sender.vault.update(1, data => { data.accounts[0].version++; });
    }
  };
  await assert.rejects(f.deliver(paired), {code: 'E_VAULT_CONFLICT'});
  assert.equal(f.calls.filter(x => x.path.endsWith('/deliver')).length, 0);
});

test('an uncertain durable outbound fence blocks a POST even when its transaction actually committed', async t => {
  const f = await fixture(t);
  f.receiver.hooks.afterWrite = state => {
    if (state.claims[0]?.phase === 'pairing') throw fail('E_OUTCOME_UNKNOWN');
  };
  await assert.rejects(f.pair(), {code: 'E_OUTCOME_UNKNOWN'});
  delete f.receiver.hooks.afterWrite;
  await assert.rejects(f.pair(), {code: 'E_OUTCOME_UNKNOWN'});
  assert.equal(f.calls.filter(x => x.path.endsWith('/pair')).length, 0);
});

test('parallel explicit actions cannot double-pair, double-deliver or double-claim the same durable intent', async t => {
  const f = await fixture(t);
  const paired = await Promise.allSettled([f.pair(), f.pair()]);
  assert.equal(paired.filter(x => x.status === 'fulfilled').length, 1);
  const pair = paired.find(x => x.status === 'fulfilled').value;
  const delivered = await Promise.allSettled([f.deliver(pair), f.deliver(pair)]);
  assert.equal(delivered.filter(x => x.status === 'fulfilled').length, 1);
  const receipt = delivered.find(x => x.status === 'fulfilled').value;
  const claimed = await Promise.allSettled([f.claim(receipt), f.claim(receipt)]);
  assert.equal(claimed.filter(x => x.status === 'fulfilled').length, 1);
  for (const action of ['pair', 'deliver', 'challenge', 'claim'])
    assert.equal(f.calls.filter(x => x.path.endsWith('/' + action)).length, 1);
  assert.equal((await f.receiver.vault.read()).accounts.length, 1);
});

test('failed receiving validation or authorization leaves the encrypted receipt without importing an account', async t => {
  const f = await fixture(t), delivered = await f.deliver(await f.pair());
  f.receiver.hooks.mapping = snapshot => {
    snapshot.cookies[0].domain = 'other.test';
  };
  await assert.rejects(f.claim(delivered), {code: 'E_ACCOUNT_COOKIE_SCOPE'});
  assert.equal((await f.receiver.read()).claims[0].phase, 'received');
  assert.equal((await f.receiver.vault.read()).accounts.length, 0);
  f.receiver.hooks.mapping = snapshot => {
    snapshot.cookies[0].partitionKey.topLevelSite = 'https://other.test';
  };
  await assert.rejects(f.claim(delivered), {code: 'E_ACCOUNT_COOKIE_SCOPE'});
  f.receiver.hooks.mapping = snapshot => {
    snapshot.cookies[0].partitionKey.hasCrossSiteAncestor = true;
  };
  await assert.rejects(f.claim(delivered), {code: 'E_ACCOUNT_COOKIE_SCOPE'});
  f.receiver.hooks.mapping = () => { f.receiver.control.authorized = false; };
  await assert.rejects(f.claim(delivered), {code: 'E_TOOL_CHANGED'});
  assert.equal((await f.receiver.vault.read()).accounts.length, 0);
  assert.equal(f.calls.filter(x => x.path.endsWith('/claim')).length, 1);
  assert.equal(f.receiver.control.nativeWrites, 0);
});

test('a delivered local receipt can reopen after the source invitation is marked consumed', async t => {
  const f = await fixture(t), paired = await f.pair(), delivered = await f.deliver(paired);
  await f.claim(delivered);
  const state = await f.sender.read(); state.items[0].phase = 'consumed';
  f.sender.records.set(COOKIE_SHARE_STORAGE_KEY, state);
  const count = f.calls.length;
  assert.deepEqual(await f.deliver(paired), delivered);
  assert.equal(f.calls.length, count);
});

test('a paired record with a missing receiver binding is rejected before a challenge consumes its session', async t => {
  const f = await fixture(t), delivered = await f.deliver(await f.pair());
  const state = await f.receiver.read(); delete state.claims[0].receiverFingerprint;
  f.receiver.records.set(COOKIE_SHARE_STORAGE_KEY, state);
  await assert.rejects(f.claim(delivered), {code: 'E_SHARE_STORAGE'});
  assert.equal(f.calls.filter(x => x.path.endsWith('/challenge')).length, 0);
  assert.equal(f.calls.filter(x => x.path.endsWith('/claim')).length, 0);
});

test('a wrong reviewed sender fingerprint can be corrected locally after restart without another claim', async t => {
  const f=await fixture(t),delivered=await f.deliver(await f.pair());
  await assert.rejects(f.receiver.create().dispatch('shareClaim',{
    inviteUrl:f.item.url,senderFingerprint:'0'.repeat(64),revision:0}),{code:'E_SESSION_SENDER_MISMATCH'});
  const before=await f.receiver.read(),count=f.calls.length;
  assert.equal(before.claims[0].phase,'received');
  const imported=await f.claim(delivered);
  assert.equal(imported.sessionImported,true);assert.equal(f.calls.length,count);
  const after=await f.receiver.read();
  for(const field of ['url','owner','requestId','receiverFingerprint','encryptedPacket'])
    assert.deepEqual(after.claims[0][field],before.claims[0][field]);
  assert.equal(after.claims[0].expectedSenderFingerprint,delivered.senderFingerprint);
  assert.equal(f.calls.filter(row=>row.path.endsWith('/claim')).length,1);
  await assert.rejects(f.receiver.create().dispatch('shareClaim',{
    inviteUrl:f.item.url,senderFingerprint:'0'.repeat(64),revision:1}),{code:'E_SESSION_SENDER_MISMATCH'});
});

test('receipt compare failures retain the unknown-outcome code across real storage error wrapping', async t => {
  await t.test('pair receipt changed inside the transaction',async t=>{
    const f=await fixture(t);
    f.receiver.hooks.beforeChange=state=>{
      if(state.claims[0]?.phase==='prepared')state.claims[0].alias='acct_changed';
    };
    await assert.rejects(f.pair(),{code:'E_OUTCOME_UNKNOWN'});
    assert.equal(f.calls.filter(row=>row.path.endsWith('/pair')).length,0);
  });
  await t.test('delivery receipt changed inside the transaction',async t=>{
    const f=await fixture(t),paired=await f.pair();
    f.sender.hooks.beforeChange=state=>{
      if(state.items[0]?.deliveries?.[0]?.phase==='prepared')
        state.items[0].deliveries[0].receiverFingerprint='0'.repeat(64);
    };
    await assert.rejects(f.deliver(paired),{code:'E_OUTCOME_UNKNOWN'});
    assert.equal(f.calls.filter(row=>row.path.endsWith('/deliver')).length,0);
  });
});

test('local fingerprint correction authenticates the packet and compares the whole received receipt before saving', async t => {
  for (const scenario of ['ciphertext changed', 'receipt changed during correction']) {
    await t.test(scenario, async t => {
      const f = await fixture(t), delivered = await f.deliver(await f.pair());
      await assert.rejects(f.receiver.create().dispatch('shareClaim', {
        inviteUrl: f.item.url, senderFingerprint: '0'.repeat(64), revision: 0
      }), {code: 'E_SESSION_SENDER_MISMATCH'});
      const before = await f.receiver.read(), count = f.calls.length;
      if (scenario === 'ciphertext changed') {
        const packet = before.claims[0].encryptedPacket;
        packet.ciphertext = (packet.ciphertext[0] === 'A' ? 'B' : 'A') + packet.ciphertext.slice(1);
        f.receiver.records.set(COOKIE_SHARE_STORAGE_KEY, before);
      } else {
        f.receiver.hooks.beforeChange = state => {
          if (state.claims[0]?.phase === 'received') state.claims[0].requestId = 'x'.repeat(32);
        };
      }
      await assert.rejects(f.claim(delivered), {
        code: scenario === 'ciphertext changed' ? 'E_SESSION_PACKET' : 'E_OUTCOME_UNKNOWN'
      });
      assert.deepEqual(await f.receiver.read(), before);
      assert.equal((await f.receiver.vault.read()).accounts.length, 0);
      assert.equal(f.receiver.control.nativeWrites, 0);
      assert.equal(f.calls.length, count);
    });
  }
});
