import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto, createPublicKey, createPrivateKey, sign as nodeSign, verify as nodeVerify} from 'node:crypto';
import {createEntitlementService, entitlementSigningPayload, revocationSigningPayload, TRUSTED_KEYS, OFFLINE_GRACE_MS} from '../../src/platform/entitlement/index.js';
import {canonical, digest, validate, BUDGETS} from '../../src/platform/protocol.js';

if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', {value: webcrypto});
// TEST_ONLY: private keys exist only in test-process memory, never on disk or in the product.
const pair = await webcrypto.subtle.generateKey({name: 'ECDSA', namedCurve: 'P-256'}, true, ['sign', 'verify']);
const publicJwk = await webcrypto.subtle.exportKey('jwk', pair.publicKey);
const SUBJECT = 'TEST_ONLY.subject';
const ISSUER = 'TEST_ONLY.issuer';
const KEY_ID = 'TEST_ONLY.p256';
const START = Date.parse('2026-10-02T00:00:00.000Z');
const CAPS = ['dom.top.v1', 'read.text.v1', 'read.attribute.v1', 'transform.safe.v1', 'pagination.none.v1',
  'pagination.next-link.v1', 'pagination.next-button.v1', 'page.stage-seal.v1', 'download.receipt.v1'];
const LIMITS = Object.fromEntries(['maxPages', 'maxRecords', 'maxDurationMs', 'maxStoredBytes'].map(key => [key, BUDGETS[key]]));
const KEYS = {[KEY_ID]: {issuer: ISSUER, jwk: publicJwk}};
const clone = value => structuredClone(value);
const iso = ms => new Date(ms).toISOString();
const policyError = error => error.code === 'E_ENTITLEMENT' || error.code === 'E_SCHEMA';

// Deliberately a unit transaction double. This is not real IndexedDB or Chrome evidence.
function memoryStorage() {
  const maps = new Map(['entitlements', 'templates', 'records', 'pageSnapshots', 'exportJobs'].map(store => [store, new Map()]));
  let tail = Promise.resolve();
  const operations = [];
  return {
    maps, operations,
    transaction(stores, mode, callback) {
      const run = tail.then(async () => {
        const working = clone(maps);
        const check = (store, mutation = false) => {
          assert.ok(stores.includes(store));
          if (mutation) assert.equal(mode, 'readwrite');
          operations.push(store);
        };
        const tx = {
          async get(store, key) { check(store); return clone(working.get(store).get(key)); },
          async put(store, value, key) { check(store, true); assert.notEqual(key, undefined); working.get(store).set(key, clone(value)); },
          async delete(store, key) { check(store, true); working.get(store).delete(key); },
          async all(store) { check(store); return clone([...working.get(store).values()]); }
        };
        const result = await callback(tx);
        if (mode === 'readwrite') for (const store of stores) maps.set(store, working.get(store));
        return result;
      });
      tail = run.catch(() => {});
      return run;
    }
  };
}
function setup({trusted = true, keys = KEYS, storage = memoryStorage(), subject = SUBJECT} = {}) {
  const time = {ms: START, mono: 0};
  const clock = {now: () => time.ms, monotonicNow: () => time.mono};
  if (trusted) clock.trustedNow = () => time.ms;
  const service = createEntitlementService({storage, clock, keys, subject});
  return {service, storage, time, clock, advance(ms) { time.ms += ms; time.mono += ms; }};
}
async function signed(overrides = {}, privateKey = pair.privateKey) {
  const claim = {tier: 'pro', issuer: ISSUER, subject: SUBJECT, audience: 'opendesk-browser', features: [...CAPS],
    issuedAt: iso(START - 1000), expiresAt: iso(START + 10 * OFFLINE_GRACE_MS),
    keyId: KEY_ID, revocationVersion: 0, formatVersion: '1.0.0', signature: '',
    verification: 'ecdsa-p256-sha256', verifiedAt: iso(START + 100000), lastTrustedTime: iso(START + 100000), ...overrides};
  claim.signature = Buffer.from(await webcrypto.subtle.sign({name: 'ECDSA', hash: 'SHA-256'}, privateKey,
    new TextEncoder().encode(canonical(entitlementSigningPayload(claim))))).toString('base64url');
  return claim;
}
async function revocation(version, overrides = {}) {
  const evidence = {kind: 'entitlement-revocation', issuer: ISSUER, subject: SUBJECT, audience: 'opendesk-browser',
    keyId: KEY_ID, revocationVersion: version, formatVersion: '1.0.0', issuedAt: iso(START), ...overrides};
  evidence.signature = Buffer.from(await webcrypto.subtle.sign({name: 'ECDSA', hash: 'SHA-256'}, pair.privateKey,
    new TextEncoder().encode(canonical(revocationSigningPayload(evidence))))).toString('base64url');
  return evidence;
}
async function save(harness, templateId, snapshot) {
  return harness.storage.transaction(['templates', 'entitlements'], 'readwrite', async tx => {
    await harness.service.admitTemplate({templateId, tx, snapshot});
    await tx.put('templates', {head: {templateId, revision: 1}}, `head:${templateId}`);
  });
}

test('production allowlist is empty; unsigned self-reports and unknown keys never become Pro', async () => {
  assert.deepEqual(TRUSTED_KEYS, {});
  assert.ok(Object.isFrozen(TRUSTED_KEYS));
  const h = setup({keys: undefined});
  // setup defaults must not accidentally inject TEST_ONLY keys in this test.
  const service = createEntitlementService({storage: h.storage, clock: h.clock, subject: SUBJECT});
  await assert.rejects(service.install(await signed()), policyError);
  const free = await service.get();
  assert.equal(free.tier, 'free');
  validate('Entitlement', free);
  assert.deepEqual((await service.getSnapshot()).effectiveLimits, {...LIMITS, maxPages: 1, maxRecords: 100});
  const forged = await signed(); forged.signature = 'A'.repeat(86);
  await assert.rejects(h.service.install(forged), policyError);
});

test('real P256/SHA256 P1363 signature; independent Node crypto oracle and claim hash', async () => {
  const h = setup(), claim = await signed();
  const payload = Buffer.from(canonical(entitlementSigningPayload(claim)));
  assert.equal(Buffer.from(claim.signature, 'base64url').length, 64);
  assert.equal(nodeVerify('sha256', payload, {key: createPublicKey({key: publicJwk, format: 'jwk'}), dsaEncoding: 'ieee-p1363'},
    Buffer.from(claim.signature, 'base64url')), true);
  const installed = await h.service.install(claim);
  assert.equal(installed.tier, 'pro');
  assert.equal(installed.verifiedAt, iso(START));
  assert.equal(installed.lastTrustedTime, iso(START));
  const snapshot = await h.service.admitRun({limits: LIMITS, requiredCapabilities: ['read.text.v1']});
  validate('EntitlementSnapshot', snapshot);
  assert.equal(snapshot.claimHash, await digest(entitlementSigningPayload(claim)));
  assert.equal(h.storage.maps.get('entitlements').has(SUBJECT), true);
  assert.equal(h.storage.maps.get('entitlements').size, 1);
});

for (const [field, value] of Object.entries({tier: 'free', issuer: 'other', subject: 'other', audience: 'other',
  features: ['read.text.v1'], issuedAt: iso(START - 999), expiresAt: iso(START + 1),
  keyId: 'unknown', revocationVersion: 1, formatVersion: '2.0.0'})) {
  test(`signed binding rejects tampered ${field}`, async () => {
    const h = setup(), claim = await signed(); claim[field] = value;
    await assert.rejects(h.service.install(claim), policyError);
    assert.equal((await h.service.get()).tier, 'free');
  });
}

test('signed but unexpected issuer/subject are rejected; signatures from another key fail', async () => {
  for (const overrides of [{issuer: 'untrusted'}, {subject: 'other-subject'}])
    await assert.rejects(setup().service.install(await signed(overrides)), policyError);
  const other = await webcrypto.subtle.generateKey({name: 'ECDSA', namedCurve: 'P-256'}, true, ['sign', 'verify']);
  await assert.rejects(setup().service.install(await signed({}, other.privateKey)), policyError);
});

test('reject altered signature bytes, padded/noncanonical base64url, DER and wrong hash algorithm', async () => {
  const valid = await signed();
  const flipped = Buffer.from(valid.signature, 'base64url'); flipped[0] ^= 1;
  const last = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'.indexOf(valid.signature.at(-1));
  const alias = valid.signature.slice(0, -1) + 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'[last + 1];
  const wrongHash = Buffer.from(await webcrypto.subtle.sign({name: 'ECDSA', hash: 'SHA-384'}, pair.privateKey,
    new TextEncoder().encode(canonical(entitlementSigningPayload(valid))))).toString('base64url');
  const der = nodeSign('sha256', Buffer.from(canonical(entitlementSigningPayload(valid))), {
    key: createPrivateKey({key: await webcrypto.subtle.exportKey('jwk', pair.privateKey), format: 'jwk'}), dsaEncoding: 'der'
  });
  for (const signature of [flipped.toString('base64url'), valid.signature + '=', alias, der.toString('base64url'), wrongHash])
    await assert.rejects(setup().service.install({...valid, signature}), policyError);
});

test('no production private JWK and no mutation of injected allowlist after construction', async () => {
  const privateJwk = await webcrypto.subtle.exportKey('jwk', pair.privateKey);
  assert.throws(() => setup({keys: {[KEY_ID]: {issuer: ISSUER, jwk: privateJwk}}}), policyError);
  const keys = clone(KEYS), h = setup({keys});
  keys[KEY_ID].issuer = 'replacement'; keys[KEY_ID].jwk.x = 'invalid';
  assert.equal((await h.service.install(await signed())).tier, 'pro');
});

test('future issuedAt, inverted time interval and expiry at the exact boundary reject new Pro', async () => {
  for (const overrides of [{issuedAt: iso(START + 1)}, {expiresAt: iso(START)},
    {issuedAt: iso(START), expiresAt: iso(START - 1)}])
    await assert.rejects(setup().service.install(await signed(overrides)), policyError);
  const h = setup(); await h.service.install(await signed({expiresAt: iso(START + 1000)}));
  h.advance(999); assert.equal((await h.service.get()).tier, 'pro');
  h.advance(1); assert.equal((await h.service.status()).reason, 'expired');
  assert.equal((await h.service.getSnapshot()).tier, 'free');
});

test('impossible calendar dates and missing timestamp zones are rejected even when signed', async () => {
  for (const issuedAt of ['2026-02-31T00:00:00Z', '2026-10-01T24:00:00Z', '2026-10-01T00:00:00'])
    await assert.rejects(setup().service.install(await signed({issuedAt})), policyError);
});

test('signed metadata cannot establish trusted verification or extend grace', async () => {
  const h = setup({trusted: false});
  await assert.rejects(h.service.install(await signed()), policyError);
  assert.equal((await h.service.get()).tier, 'free');
  const valid = setup(); await valid.service.install(await signed());
  const row = valid.storage.maps.get('entitlements').get(SUBJECT);
  row.claim.verifiedAt = iso(START + 20 * OFFLINE_GRACE_MS);
  row.claim.lastTrustedTime = row.claim.verifiedAt;
  valid.advance(OFFLINE_GRACE_MS + 1);
  assert.equal((await valid.service.status()).reason, 'offline-grace-exceeded');
});

test('offline 72h inclusive boundary, +1ms fallback and no expiry extension', async () => {
  const h = setup(); await h.service.install(await signed());
  h.advance(OFFLINE_GRACE_MS - 1); assert.equal((await h.service.getSnapshot()).tier, 'pro');
  h.advance(1); assert.equal((await h.service.getSnapshot()).offlineAgeMs, OFFLINE_GRACE_MS);
  h.advance(1); assert.equal((await h.service.status()).reason, 'offline-grace-exceeded');
  assert.equal((await h.service.getSnapshot()).tier, 'free');
  const short = setup(); await short.service.install(await signed({expiresAt: iso(START + 100)}));
  short.advance(100); assert.equal((await short.service.status()).reason, 'expired');
});

test('offline reload keeps verification age; explicit trusted refresh reopens new Pro', async () => {
  const h = setup(); await h.service.install(await signed()); h.advance(OFFLINE_GRACE_MS + 1);
  const reloaded = createEntitlementService({storage: h.storage, clock: {now: h.clock.now, monotonicNow: h.clock.monotonicNow}, keys: KEYS, subject: SUBJECT});
  assert.equal((await reloaded.status()).reason, 'offline-grace-exceeded');
  await assert.rejects(reloaded.refresh(), policyError);
  assert.equal((await h.service.refresh()).tier, 'pro');
  assert.equal((await h.service.getSnapshot()).offlineAgeMs, 0);
});

test('wall rollback freezes Pro across reload; monotonic elapsed time expires a frozen wall', async () => {
  const h = setup(); await h.service.install(await signed()); h.advance(1000);
  await h.service.get(); h.time.ms -= 1;
  assert.equal((await h.service.status()).reason, 'clock-rollback');
  const reloaded = createEntitlementService({storage: h.storage, clock: h.clock, keys: KEYS, subject: SUBJECT});
  assert.equal((await reloaded.get()).tier, 'free');
  h.advance(100);
  h.time.ms += 1; // Restore wall time to the retained monotonic high-water mark.
  assert.equal((await h.service.get()).tier, 'free');
  assert.equal((await h.service.refresh()).tier, 'pro');
  const fixedWall = setup(); await fixedWall.service.install(await signed({expiresAt: iso(START + 100)}));
  fixedWall.time.mono += 100;
  assert.equal((await fixedWall.service.status()).reason, 'expired');
});

test('submillisecond clock observations preserve elapsed monotonic time', async () => {
  const h = setup(); await h.service.install(await signed({expiresAt: iso(START + 5)}));
  for (let i = 0; i < 10; i++) {
    h.time.mono += 0.5;
    await h.service.get();
  }
  assert.equal((await h.service.status()).reason, 'expired');
});

test('monotonic rollback freezes Pro; trusted timestamp must not precede durable high water', async () => {
  const h = setup(); await h.service.install(await signed()); h.advance(100);
  await h.service.get(); h.time.mono -= 1;
  assert.equal((await h.service.get()).tier, 'free');
  const stale = setup(); stale.clock.trustedNow = () => START - 1001;
  await assert.rejects(stale.service.install(await signed()), policyError);
});

test('revocation is signed, bound, monotonic and durable; newer signed license may restore Pro', async () => {
  const h = setup(); await h.service.install(await signed());
  const invalid = await revocation(2); invalid.revocationVersion = 3;
  await assert.rejects(h.service.revoke(invalid), policyError);
  await assert.rejects(h.service.revoke(await revocation(2, {subject: 'other'})), policyError);
  await assert.rejects(h.service.revoke(await revocation(2, {issuedAt: iso(START + 1)})), policyError);
  const unsigned = await revocation(2); delete unsigned.signature;
  await assert.rejects(h.service.revoke(unsigned), policyError);
  assert.equal((await h.service.get()).tier, 'pro');
  assert.equal((await h.service.revoke(await revocation(2))).tier, 'free');
  assert.equal((await h.service.status()).reason, 'revoked');
  for (const version of [0, 1, 2]) await assert.rejects(h.service.revoke(await revocation(version)), policyError);
  await assert.rejects(h.service.install(await signed({revocationVersion: 2})), policyError);
  const reload = createEntitlementService({storage: h.storage, clock: h.clock, keys: KEYS, subject: SUBJECT});
  assert.equal((await reload.get()).tier, 'free');
  assert.equal((await h.service.install(await signed({revocationVersion: 3}))).tier, 'pro');
  await assert.rejects(h.service.install(await signed({revocationVersion: 1})), policyError);
});

test('cached claims and signed revocation are reverified; a persisted verification label grants nothing', async () => {
  const h = setup(); await h.service.install(await signed());
  h.storage.maps.get('entitlements').get(SUBJECT).claim.features = ['read.text.v1'];
  assert.equal((await h.service.status()).reason, 'invalid-signature-or-claims');
  const revoked = setup(); await revoked.service.install(await signed()); await revoked.service.revoke(await revocation(2));
  revoked.storage.maps.get('entitlements').get(SUBJECT).revocation.signature = 'A'.repeat(86);
  assert.equal((await revoked.service.get()).tier, 'free');
});

test('free and Pro limits clamp without changing template; signed features gate capabilities', async () => {
  const h = setup(), template = {limits: clone(LIMITS), requiredCapabilities: ['read.text.v1']};
  assert.deepEqual((await h.service.admitRun(template)).effectiveLimits, {...LIMITS, maxPages: 1, maxRecords: 100});
  assert.deepEqual(template.limits, LIMITS);
  await h.service.install(await signed());
  assert.deepEqual((await h.service.admitRun(template)).effectiveLimits, LIMITS);
  const smaller = {...LIMITS, maxRecords: 12, maxPages: 2};
  assert.deepEqual((await h.service.getSnapshot({limits: smaller})).effectiveLimits, smaller);
  const larger = Object.fromEntries(Object.entries(LIMITS).map(([key, value]) => [key, value + 1]));
  assert.deepEqual((await h.service.getSnapshot({limits: larger})).effectiveLimits, LIMITS);
  await h.service.install(await signed({features: ['read.text.v1']}));
  await assert.rejects(h.service.admitRun({limits: LIMITS, requiredCapabilities: ['read.attribute.v1']}), policyError);
  assert.deepEqual((await h.service.getSnapshot()).approvedCapabilities, ['read.text.v1']);
  await assert.rejects(h.service.getSnapshot({requiredCapabilities: ['unknown']}), policyError);
});

test('free template admission counts distinct IDs, permits revisions, rejects concurrent second template and allows delete/resave', async () => {
  const h = setup(), snapshot = await h.service.getSnapshot();
  const results = await Promise.allSettled([save(h, 'one', snapshot), save(h, 'two', snapshot)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  await save(h, 'one', snapshot);
  await assert.rejects(save(h, 'two', snapshot), policyError);
  await h.storage.transaction(['templates'], 'readwrite', tx => tx.delete('templates', 'head:one'));
  await save(h, 'two', snapshot);
});

test('public admitTemplate accepts SaveTemplateRequest and returns the quota for the storage transaction', async () => {
  const h = setup();
  const request = {template: {templateId: 'one'}};
  const quota = await h.service.admitTemplate(request);
  assert.equal(quota.maxSavedTemplates, 1);
  await save(h, 'one', quota);
  assert.equal((await h.service.admitTemplate(request)).maxSavedTemplates, 1);
  await assert.rejects(h.service.admitTemplate({template: {templateId: 'two'}}), policyError);
  await h.service.install(await signed());
  assert.equal((await h.service.admitTemplate({template: {templateId: 'two'}})).maxSavedTemplates, 50);
});

test('repository revision history consumes no additional quota and survives head deletion', async () => {
  const h = setup();
  h.storage.maps.get('templates').set('head:old', {metadata: {templateId: 'old', headRevision: 50}});
  for (let revision = 1; revision <= 50; revision++) h.storage.maps.get('templates').set(`revision:old:${revision}`,
    {metadata: {templateId: 'old'}, template: {templateId: 'old', revision}});
  assert.equal((await h.service.admitTemplate({templateId: 'old'})).maxSavedTemplates, 1);
  await assert.rejects(h.service.admitTemplate({templateId: 'new'}), policyError);
  h.storage.maps.get('templates').delete('head:old');
  assert.equal((await h.service.admitTemplate({templateId: 'new'})).maxSavedTemplates, 1);
  assert.equal(h.storage.maps.get('templates').size, 50);
});

test('Pro admission at 49/50/51 serializes template count and rejects stale or forged snapshots', async () => {
  const h = setup(); await h.service.install(await signed());
  const snapshot = await h.service.getSnapshot();
  for (let i = 0; i < 49; i++) await save(h, `t${i}`, snapshot);
  const results = await Promise.allSettled([save(h, 't49', snapshot), save(h, 't50', snapshot)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(h.storage.maps.get('templates').size, 50);
  await save(h, 't0', snapshot);
  await assert.rejects(save(h, 't51', snapshot), policyError);
  await assert.rejects(save(h, 't0', clone(snapshot)), policyError);
  await h.service.revoke(await revocation(1));
  await assert.rejects(save(h, 't0', snapshot), policyError);
});

test('freshness checked inside template transaction after expiry or offline grace ends', async () => {
  const h = setup(); await h.service.install(await signed({expiresAt: iso(START + 10)}));
  const snapshot = await h.service.getSnapshot(); h.advance(10);
  await assert.rejects(save(h, 'one', snapshot), policyError);
  const offline = setup(); await offline.service.install(await signed());
  const old = await offline.service.getSnapshot(); offline.advance(OFFLINE_GRACE_MS + 1);
  await assert.rejects(save(offline, 'one', old), policyError);
});

test('approved run remains frozen after expiry/revocation; sealed records, exports and retention are untouched', async () => {
  const h = setup(); await h.service.install(await signed({expiresAt: iso(START + 100)}));
  const snapshot = await h.service.admitRun({limits: {...LIMITS, maxPages: 2, maxRecords: 6}, requiredCapabilities: ['read.text.v1']});
  const serialized = canonical(snapshot);
  assert.equal(snapshot.runExpiryRevokes, false);
  assert.throws(() => { snapshot.effectiveLimits.maxRecords = 0; }, TypeError);
  h.storage.maps.get('records').set('sealed:0', {snapshotId: 'sealed', values: {x: 'retained'}});
  h.storage.maps.get('pageSnapshots').set('sealed', {state: 'sealed'});
  h.storage.maps.get('exportJobs').set('job', {state: 'complete'});
  const retained = clone([...h.storage.maps].filter(([store]) => ['records', 'pageSnapshots', 'exportJobs'].includes(store)));
  h.advance(100); await h.service.revoke(await revocation(1));
  assert.equal((await h.service.admitRun({limits: LIMITS, requiredCapabilities: ['read.text.v1']})).tier, 'free');
  const status = await h.service.status();
  for (const property of ['exportsAllowed', 'existingRecordsAllowed', 'deletionAllowed', 'previewAllowed']) assert.equal(status[property], true);
  assert.equal(canonical(snapshot), serialized);
  assert.deepEqual([...h.storage.maps].filter(([store]) => ['records', 'pageSnapshots', 'exportJobs'].includes(store)), retained);
  assert.equal(h.storage.operations.some(store => ['records', 'pageSnapshots', 'exportJobs'].includes(store)), false);
});
