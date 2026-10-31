import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {
  COOKIE_JOURNAL_KEY,
  readCookieJournal,
  reserveCookieAttempt,
  saveCookieReceipt,
  migrateCookieJournal,
  planCookieJournalMigration,
} from '../src/cookie-journal.js';

const clone = structuredClone;
const bytes = value => Buffer.byteLength(JSON.stringify(value));
const empty = () => planCookieJournalMigration(null);

function row(i) {
  return {
    scopeKey: JSON.stringify([
      'source', 'https://source.example.test', 'a.example.test', 'account', 'grant',
      'setCookies', 'https://a.example.test/session/', ['ordinary', 'no-assignment'],
    ]),
    attemptId: `attempt-${i}`,
    requestId: `request-${i}`,
    deliveryId: `delivery-${i}`,
    policyVersion: '1',
    payloadHash: 'a'.repeat(64),
    expiresAt: 1700000000000,
    count: 2,
    slots: ['session', 'context'].map(name => ({
      name,
      domain: 'a.example.test',
      hostOnly: true,
      path: '/session/',
      storeId: 'authorized-store',
      partitionKey: null,
    })),
    state: 'failed',
    resolution: 'not-submitted',
    results: [],
  };
}

function storage(initial, {lost = false, conflict = false} = {}) {
  let value = clone(initial), writes = 0;
  const etag = () => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  return {
    get value() { return clone(value); },
    get writes() { return writes; },
    request: async (op, args) => {
      assert.equal(args.key, COOKIE_JOURNAL_KEY);
      if (op === 'storage.get') return {value: clone(value), etag: etag()};
      assert.equal(op, 'storage.set');
      writes++;
      assert.ok(bytes(args.value) <= 8192);
      if (conflict) throw Error('conflict');
      assert.equal(args.ifMatch, etag());
      value = clone(args.value);
      if (lost) throw Error('lost');
    },
  };
}

function near() {
  const value = empty();
  while (bytes({...value, attempts: [...value.attempts, row(value.attempts.length)]}) <= 8192)
    value.attempts.push(row(value.attempts.length));
  return value;
}

test('near-full v2 reserves into same-key v3, expands beyond 8 KiB and retains every fact', async () => {
  const initial = near();
  assert.ok(bytes(initial) > 7300);
  assert.ok(bytes({...initial, attempts: [...initial.attempts, row(99)]}) > 8192);
  const s = storage(initial, {lost: true});
  const reserved = await reserveCookieAttempt(s.request, {
    ...row(99), state: 'unknown', resolution: 'pending',
  });
  assert.equal(s.value.schemaVersion, 3);
  assert.deepEqual(reserved.value.attempts.slice(0, -1), initial.attempts);
  assert.ok(bytes(reserved.value) > 8192);
  assert.deepEqual((await readCookieJournal(s.request)).value, reserved.value);

  const results = [
    {index: 0, saved: true, verified: true},
    {index: 1, saved: false, verified: false, code: 'E_CHROME_PERMISSION_REQUIRED'},
  ];
  const final = await saveCookieReceipt(s.request, reserved.reference, {
    receipt: {saved: 1, verified: 1, stopped: true, results},
  });
  assert.equal(final.value.attempts.at(-1).state, 'partial');
  assert.deepEqual(final.value.attempts.at(-1).results, results);
  assert.ok(bytes(s.value) <= 8192);
  await assert.rejects(
    reserveCookieAttempt(s.request, {...row(100), state: 'unknown', resolution: 'pending'}),
    {code: 'E_COOKIE_UNRESOLVED'},
  );
});

test('legacy unknown and expired seen facts survive migration and v3 reopen', async () => {
  const legacy = {
    schemaVersion: 1,
    deliveryId: 'old',
    attemptId: 'old',
    accountId: 'account',
    serviceOrigin: 'https://source.example.test',
    targetUrl: 'https://a.example.test/session/',
    state: 'unknown',
    count: 1,
    results: [{index: 0, saved: true, verified: false, code: 'E_OUTCOME_UNKNOWN'}],
    seen: [{deliveryId: 'expired', expiresAt: 1700000000000}],
  };
  const s = storage(legacy, {lost: true});
  const result = await migrateCookieJournal(s.request, [{
    sourceId: 'source',
    siteId: 'a.example.test',
    accountId: 'account',
    serviceOrigin: legacy.serviceOrigin,
    targetUrl: legacy.targetUrl,
  }]);
  assert.equal(s.value.schemaVersion, 3);
  assert.deepEqual(result.value.legacy.record, legacy);
  assert.deepEqual((await readCookieJournal(s.request)).value, result.value);
  assert.equal(s.writes, 1);
});

test('CAS conflict never confirms or changes history', async () => {
  const initial = near(), s = storage(initial, {conflict: true});
  await assert.rejects(
    reserveCookieAttempt(s.request, {...row(99), state: 'unknown', resolution: 'pending'}),
    {code: 'E_COOKIE_MARKER_UNCONFIRMED'},
  );
  assert.deepEqual(s.value, initial);
  assert.equal(s.writes, 1);
});

test('corrupt v3 references, unknown keys and expanded facts fail closed without writes', async () => {
  const s = storage(empty());
  await reserveCookieAttempt(s.request, {...row(1), state: 'unknown', resolution: 'pending'});
  assert.equal(s.value.schemaVersion, 3);
  const raw = s.value;
  for (const mutate of [
    v => v.attempts[0].scopeKey = -1,
    v => v.attempts[0].slots = 0.5,
    v => v.attempts[0].scopeKey = 999,
    v => v.secret = 'x',
    v => v.attempts[0].secret = 'x',
    v => v.slots[0][0].value = 'secret',
    v => v.scopes[0] = 'invalid',
    v => v.attempts.push(clone(v.attempts[0])),
    v => v.slots.push([]),
  ]) {
    const bad = clone(raw);
    mutate(bad);
    const store = storage(bad);
    await assert.rejects(readCookieJournal(store.request));
    assert.equal(store.writes, 0);
  }
});

test('compact capacity remains finite and refuses before any write when worst receipt cannot fit', async () => {
  const s = storage(empty());
  let count = 0;
  for (; count < 100; count++) {
    try {
      const next = await reserveCookieAttempt(s.request, {
        ...row(count), state: 'unknown', resolution: 'pending',
      });
      await saveCookieReceipt(s.request, next.reference, {notInvoked: true});
    } catch (e) {
      assert.equal(e.code, 'E_COOKIE_LIMIT');
      break;
    }
  }
  assert.ok(count > 10 && count < 100);
  const before = s.value, writes = s.writes;
  await assert.rejects(
    reserveCookieAttempt(s.request, {...row(999), state: 'unknown', resolution: 'pending'}),
    {code: 'E_COOKIE_LIMIT'},
  );
  assert.equal(s.writes, writes);
  assert.deepEqual(s.value, before);
  assert.equal((await readCookieJournal(s.request)).value.attempts.length, count);
});

test('identical concurrent reservations confirm one canonical owner and receipt', async () => {
  const s = storage(empty()), candidate = {...row(1), state: 'unknown', resolution: 'pending'};
  const raced = await Promise.allSettled([
    reserveCookieAttempt(s.request, candidate),
    reserveCookieAttempt(s.request, candidate),
  ]);
  const winners = raced.filter(r => r.status === 'fulfilled');
  assert.equal(winners.length, 1);
  const reopened = await readCookieJournal(s.request);
  assert.equal(reopened.value.attempts.length, 1);
  assert.deepEqual(winners[0].value.reference, {
    scopeKey: reopened.value.attempts[0].scopeKey,
    attemptId: reopened.value.attempts[0].attemptId,
  });
  const settled = await saveCookieReceipt(s.request, winners[0].value.reference, {notInvoked: true});
  assert.equal(settled.value.attempts[0].resolution, 'not-submitted');
});

test('oversized raw legacy v2 is rejected even when dictionary encoding would fit', async () => {
  const initial = near();
  initial.attempts.push(row(99));
  assert.ok(bytes(initial) > 8192);
  const s = storage(initial);
  await assert.rejects(readCookieJournal(s.request), {code: 'E_COOKIE_LIMIT'});
  assert.equal(s.writes, 0);
});

test('unknown receipt remains unknown after compressed reopen and cannot be rewritten', async () => {
  const s = storage(near()), reserved = await reserveCookieAttempt(s.request, {
    ...row(99), state: 'unknown', resolution: 'pending',
  });
  const outcome = {
    receipt: {
      saved: 1,
      verified: 0,
      stopped: true,
      results: [{index: 0, saved: true, verified: false, code: 'E_OUTCOME_UNKNOWN'}],
    },
  };
  const result = await saveCookieReceipt(s.request, reserved.reference, outcome);
  assert.deepEqual((await readCookieJournal(s.request)).value, result.value);
  assert.equal(result.value.attempts.at(-1).state, 'unknown');
  const writes = s.writes;
  await saveCookieReceipt(s.request, reserved.reference, outcome);
  assert.equal(s.writes, writes);
  await assert.rejects(
    saveCookieReceipt(s.request, reserved.reference, {notInvoked: true}),
    {code: 'E_COOKIE_RECEIPT_CONFLICT'},
  );
});
