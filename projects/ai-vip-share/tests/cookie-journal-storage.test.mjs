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

// Independent old wire format, so capacity assertions cannot use the new codec.
function v5(value) {
  const scopes = [], slots = [];
  const intern = (list, value) => {
    let index = list.findIndex(item => JSON.stringify(item) === JSON.stringify(value));
    if (index < 0) { index = list.length; list.push(value); }
    return index;
  };
  const fields = ['scopeKey', 'attemptId', 'requestId', 'deliveryId', 'policyVersion', 'payloadHash',
    'expiresAt', 'count', 'slots', 'state', 'resolution', 'results'];
  const attempts = value.attempts.map(row => fields.map(key => key === 'scopeKey' ? intern(scopes, row[key]) :
    key === 'slots' ? intern(slots, row[key].map(slot =>
      ['name', 'domain', 'hostOnly', 'path', 'storeId', 'partitionKey'].map(field => slot[field]))) : row[key]));
  return {schemaVersion: 5, legacy: clone(value.legacy), scopes, slots, attempts};
}

function v6(value) {
  const wire = v5(value), results = list => list.map(r => r.code === undefined ?
    [r.index, r.saved, r.verified] : [r.index, r.saved, r.verified, r.code]);
  wire.schemaVersion = 6;
  wire.attempts.forEach(tuple => tuple[11] = results(tuple[11]));
  if (wire.legacy.record) wire.legacy.record.results = results(wire.legacy.record.results);
  return wire;
}

function v7(value) {
  const wire = v6(value), fields = [];
  const field = text => {
    if (!fields.includes(text)) fields.push(text);
    return fields.indexOf(text);
  };
  wire.schemaVersion = 7;
  wire.scopes = wire.scopes.map(key => {
    const tuple = JSON.parse(key);
    return [...tuple.slice(0, 7).map(field), tuple[7].map(field)];
  });
  wire.scopeFields = fields;
  wire.attempts.forEach(tuple => {
    const results = tuple[11], prefix = results.findIndex(r => !r[2]);
    tuple[11] = prefix < 0 ? [results.length] : [prefix, results[prefix].slice(1)];
  });
  return wire;
}

function v8(value) {
  const wire = v7(value), scopes = [];
  wire.schemaVersion = 8;
  wire.slots = wire.slots.map(list => list.map(([name, ...scope]) => {
    let index = scopes.findIndex(item => JSON.stringify(item) === JSON.stringify(scope));
    if (index < 0) { index = scopes.length; scopes.push(scope); }
    return [name, index];
  }));
  wire.slotScopes = scopes;
  return wire;
}

function v9(value) {
  const wire = v8(value), outcomes = ['unknown/pending', 'failed/not-submitted',
    'success/receipt', 'partial/receipt', 'failed/receipt', 'unknown/receipt'];
  wire.schemaVersion = 9;
  wire.attempts = wire.attempts.map(tuple => [...tuple.slice(0, 9),
    outcomes.indexOf(tuple[9] + '/' + tuple[10]), tuple[11]]);
  return wire;
}

function v10(value) {
  const wire = v9(value);
  wire.schemaVersion = 10;
  for (const attempt of wire.attempts) {
    for (const index of [1, 2, 3]) {
      const id = attempt[index];
      if (/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id))
        attempt[index] = '~' + Buffer.from(id.replaceAll('-', ''), 'hex').toString('base64url');
      else if (id.startsWith('~')) attempt[index] = '~' + id;
    }
    attempt[5] = Buffer.from(attempt[5], 'hex').toString('base64url');
  }
  return wire;
}

function v11(value) {
  const wire = v10(value);
  wire.schemaVersion = 11;
  wire.attempts = wire.attempts.map(tuple => {
    const [scope, attempt, request, delivery, policy, digest, ...rest] = tuple;
    if (![attempt, request, delivery].every(id => /^~[A-Za-z0-9_-]{22}$/.test(id))) return tuple;
    const packed = Buffer.concat([attempt.slice(1), request.slice(1), delivery.slice(1), digest]
      .map(part => Buffer.from(part, 'base64url'))).toString('base64url');
    return [scope, packed, policy, ...rest];
  });
  return wire;
}

test('near-full v11 preserves prior cancellations and reserves a cancelled and confirmed renewed login', async () => {
  const uuid = i => '00000000-0000-4000-8000-' + String(i).padStart(12, '0');
  const verified = [0, 1].map(index => ({index, saved: true, verified: true}));
  const journal = empty();
  journal.attempts = Array.from({length: 35}, (_, index) => {
    const previous = index % 5 === 1;
    const intent = previous ? index - 1 : index;
    return {...row(intent), attemptId: uuid(index), requestId: uuid(intent + 100),
      deliveryId: uuid(intent + 200), policyVersion: 'policy'.padEnd(79, 'x'),
      ...(index % 5 === 0 ? {} : {state: 'success', resolution: 'receipt', results: verified})};
  });
  const initial = v11(journal);
  assert.ok(bytes(initial) > 8000 && bytes(initial) <= 8192);
  const candidate = {...row(99), requestId: uuid(499), deliveryId: uuid(599),
    state: 'unknown', resolution: 'pending'};
  assert.ok(bytes(v11({...journal, attempts: [...journal.attempts, {...candidate, attemptId: uuid(399)}]})) > 8192);
  const s = storage(initial);
  const cancelled = await reserveCookieAttempt(s.request, candidate);
  await assert.rejects(reserveCookieAttempt(s.request, candidate), {code: 'E_COOKIE_UNRESOLVED'});
  await saveCookieReceipt(s.request, cancelled.reference, {notInvoked: true});
  const confirmed = await reserveCookieAttempt(s.request, candidate);
  const settled = await saveCookieReceipt(s.request, confirmed.reference, {receipt: {
    saved: 2, verified: 2, results: verified,
  }});
  assert.equal(s.value.schemaVersion, 12);
  assert.deepEqual(settled.value.attempts.slice(0, -2), journal.attempts);
  assert.deepEqual(settled.value.attempts.slice(-2).map(row => row.resolution), ['not-submitted', 'receipt']);
  await assert.rejects(reserveCookieAttempt(s.request, candidate), {code: 'E_COOKIE_REPLAY'});
  for (const mutate of [v => v.intents.push(v.intents[0]), v => v.attempts[0][0] = -1,
    v => v.intents[0][4] = -1, v => v.intents[0].push('bad'), v => v.digests.push(v.digests[0])]) {
    const corrupt = s.value;
    mutate(corrupt);
    await assert.rejects(readCookieJournal(storage(corrupt).request), {code: 'E_COOKIE_STORAGE'});
  }
});

test('near-full v9 preserves 26 settled records and reserves a new Cookie write', async () => {
  const journal = history24(), uuid = number => '00000000-0000-4000-8000-' + String(number).padStart(12, '0');
  for (let i = 0; i < 26; i++) {
    journal.attempts[i] = {...row(i), attemptId: uuid(i), requestId: uuid(i + 100),
      deliveryId: uuid(i + 200), policyVersion: '1'.padEnd(60, 'x'),
      state: 'success', resolution: 'receipt',
      results: [0, 1].map(index => ({index, saved: true, verified: true}))};
  }
  for (let i = 0; bytes(v9(journal)) < 8085; i++) journal.attempts[i % 26].policyVersion += 'x';
  const initial = v9(journal), s = storage(initial), candidate = {...row(99),
    requestId: '~literal-id', deliveryId: uuid(999), state: 'unknown', resolution: 'pending'};
  assert.equal(bytes(initial), 8085);
  assert.ok(bytes(v9({...journal, attempts: [...journal.attempts, candidate]})) > 8192);
  const reserved = await reserveCookieAttempt(s.request, candidate);
  assert.equal(s.value.schemaVersion, 10);
  const settled = await saveCookieReceipt(s.request, reserved.reference, {receipt: {
    saved: 2, verified: 2, results: journal.attempts[0].results,
  }});
  assert.deepEqual(settled.value.attempts.slice(0, -1), journal.attempts);
  assert.deepEqual((await readCookieJournal(s.request)).value, settled.value);
  for (const [index, invalid] of [[1, '~incorrect'], [5, 'x'], [5, 'z'.repeat(43)]]) {
    const malformed = s.value;
    malformed.attempts[0][index] = invalid;
    await assert.rejects(readCookieJournal(storage(malformed).request), {code: 'E_COOKIE_STORAGE'});
  }
});

test('near-full v10 preserves settled records and confirms a new fixture receipt', async () => {
  const journal = empty();
  const uuid = number => '00000000-0000-4000-8000-' + String(number).padStart(12, '0');
  journal.attempts = Array.from({length: 34}, (_, index) => ({
    ...row(index), attemptId: uuid(index), requestId: uuid(index + 100),
    deliveryId: uuid(index + 200), policyVersion: '1'.padEnd(65, 'x'),
    state: 'success', resolution: 'receipt', results: [0, 1].map(index => ({
      index, saved: true, verified: true,
    })),
  }));
  const legacyId = journal.attempts[0];
  legacyId.requestId = '~fixture-legacy-id';
  for (let index = 0; bytes(v10(journal)) < 8130; index++)
    journal.attempts[index % journal.attempts.length].policyVersion += 'x';
  const s = storage(v10(journal));
  const candidate = {...row(99), attemptId: uuid(399), requestId: uuid(499),
    deliveryId: uuid(599), state: 'unknown', resolution: 'pending'};
  assert.ok(bytes(v10({...journal, attempts: [...journal.attempts, candidate]})) > 8192);
  const reserved = await reserveCookieAttempt(s.request, candidate);
  assert.equal(s.value.schemaVersion, 11);
  const results = journal.attempts[0].results;
  const settled = await saveCookieReceipt(s.request, reserved.reference, {
    receipt: {saved: 2, verified: 2, results},
  });
  assert.deepEqual(settled.value.attempts.slice(0, -1), journal.attempts);
  assert.deepEqual((await readCookieJournal(s.request)).value, settled.value);
  const malformed = s.value;
  malformed.attempts[1][1] = 'invalid';
  await assert.rejects(readCookieJournal(storage(malformed).request), {code: 'E_COOKIE_STORAGE'});
});

function history24() {
  const journal = empty();
  journal.attempts = Array.from({length: 24}, (_, i) => ({...row(i),
    attemptId: `history-${i}`.padEnd(36, 'a'), requestId: `request-${i}`.padEnd(36, 'b'),
    deliveryId: `delivery-${i}`.padEnd(36, 'c'),
    state: 'success', resolution: 'receipt',
    results: [0, 1].map(index => ({index, saved: true, verified: true})),
  }));
  // A distinct new allocation must fit alongside a near-full, settled v8 journal.
  for (let i = 0; bytes(v8(journal)) < 8000; i++) {
    const n = i % journal.attempts.length;
    journal.attempts[n].policyVersion += 'x';
  }
  return journal;
}

test('new allocation after 24 settled attempts preserves all history through reserve, receipt and reopen', async t => {
  const journal = history24(), initial = v8(journal), candidate = {...row(99),
    scopeKey: row(99).scopeKey.replaceAll('account', 'new-member').replaceAll('grant', 'new-allocation'),
    requestId: 'new-request'.padEnd(36, 'd'), deliveryId: 'new-delivery'.padEnd(36, 'e'),
    state: 'unknown', resolution: 'pending'};
  assert.ok(bytes(v8({...journal, attempts: [...journal.attempts, candidate]})) > 8192);
  const s = storage(initial, {lost: true}), reserved = await reserveCookieAttempt(s.request, candidate);
  assert.equal(s.value.schemaVersion, 9);
  assert.deepEqual(reserved.value.attempts.slice(0, -1), journal.attempts);
  const settled = await saveCookieReceipt(s.request, reserved.reference, {receipt: {saved: 2, verified: 2,
    results: candidate.slots.map((_, index) => ({index, saved: true, verified: true}))}});
  assert.deepEqual(settled.value.attempts.slice(0, -1), journal.attempts);
  assert.deepEqual((await readCookieJournal(s.request)).value, settled.value);
  const writes = s.writes;
  await assert.rejects(reserveCookieAttempt(s.request, candidate), {code: 'E_COOKIE_REPLAY'});
  assert.equal(s.writes, writes);
  const conflict = storage(initial, {conflict: true});
  await assert.rejects(reserveCookieAttempt(conflict.request, candidate), {code: 'E_COOKIE_MARKER_UNCONFIRMED'});
  assert.equal(conflict.writes, 1);
  assert.deepEqual(conflict.value, initial);
  t.diagnostic(`v8 history=${bytes(initial)}; v9 settled=${bytes(s.value)}; quota=8192`);
});

test('schema9 outcome tags preserve all six states and reject malformed or inconsistent receipts', async () => {
  const base = row(1), variants = [
    {state: 'unknown', resolution: 'pending', results: []},
    {state: 'failed', resolution: 'not-submitted', results: []},
    {state: 'success', resolution: 'receipt', results: [0, 1].map(index => ({index, saved: true, verified: true}))},
    {state: 'partial', resolution: 'receipt', results: [{index: 0, saved: true, verified: true},
      {index: 1, saved: false, verified: false, code: 'E_GRANT_REVOKED'}]},
    {state: 'failed', resolution: 'receipt', results: [{index: 0, saved: false, verified: false, code: 'E_GRANT_REVOKED'}]},
    {state: 'unknown', resolution: 'receipt', results: [{index: 0, saved: true, verified: false, code: 'E_OUTCOME_UNKNOWN'}]},
  ];
  for (const variant of variants) {
    const journal = {...empty(), attempts: [{...base, ...variant}]}, raw = v9(journal);
    assert.deepEqual((await readCookieJournal(storage(raw).request)).value, journal);
    if (['unknown', 'partial'].includes(variant.state)) {
      const s = storage(raw);
      await assert.rejects(reserveCookieAttempt(s.request, {...row(2), state: 'unknown', resolution: 'pending'}),
        {code: 'E_COOKIE_UNRESOLVED'});
      assert.equal(s.writes, 0);
    }
  }
  const raw = v9({...empty(), attempts: [{...base, ...variants[2]}]});
  for (const mutate of [
    ...[-1, 0.5, 6, '2', true, null].map(tag => v => v.attempts[0][9] = tag),
    v => v.attempts[0].push('extra'), v => v.attempts[0].pop(),
    v => v.attempts[0][9] = 1, v => v.slotScopes.push(v.slotScopes[0]),
  ]) {
    const bad = clone(raw); mutate(bad); const s = storage(bad);
    await assert.rejects(readCookieJournal(s.request), {code: 'E_COOKIE_STORAGE'});
    assert.equal(s.writes, 0);
  }
});

test('cookie-cleared login can append a fresh delivery to near-full history without losing facts', async t => {
  const {candidate} = batch21(), journal = empty();
  for (let i = 0; ; i++) {
    const history = {...candidate, attemptId: `history-${i}`.padEnd(36, 'a'),
      requestId: `request-${i}`.padEnd(36, 'b'), deliveryId: `delivery-${i}`.padEnd(36, 'c'),
      state: 'success', resolution: 'receipt',
      results: candidate.slots.map((_, index) => ({index, saved: true, verified: true}))};
    if (bytes(v7({...journal, attempts: [...journal.attempts, history]})) > 8100) break;
    journal.attempts.push(history);
  }
  const initial = v7(journal), s = storage(initial, {lost: true});
  assert.ok(bytes(initial) > 7700);
  assert.ok(bytes(v7({...journal, attempts: [...journal.attempts, candidate]})) > 8192);
  const cancelled = await reserveCookieAttempt(s.request, candidate);
  await saveCookieReceipt(s.request, cancelled.reference, {errorCode: 'E_COOKIE_NOT_SUBMITTED'});
  const retry = await reserveCookieAttempt(s.request, candidate);
  const settled = await saveCookieReceipt(s.request, retry.reference, {receipt: {
    saved: 21, verified: 21, results: candidate.slots.map((_, index) => ({index, saved: true, verified: true})),
  }});
  assert.equal(s.value.schemaVersion, 8);
  assert.deepEqual(settled.value.attempts.slice(0, -2), journal.attempts);
  assert.equal(settled.value.attempts.at(-2).resolution, 'not-submitted');
  assert.equal(settled.value.attempts.at(-1).state, 'success');
  assert.deepEqual((await readCookieJournal(s.request)).value, settled.value);
  const writes = s.writes;
  await assert.rejects(reserveCookieAttempt(s.request, candidate), {code: 'E_COOKIE_REPLAY'});
  assert.equal(s.writes, writes);
  t.diagnostic(`v7 history=${bytes(initial)} bytes; v8 with cancel/retry=${bytes(s.value)} bytes`);
});

function batch21() {
  const history = {...row(0), count: 21, state: 'success', resolution: 'receipt',
    slots: Array.from({length: 21}, (_, i) => ({...row(0).slots[0],
      name: 'synthetic_session_cookie_with_representative_length_' + i})),
    results: Array.from({length: 21}, (_, index) => ({index, saved: true, verified: true}))};
  const candidate = {...history, attemptId: '00000000-0000-4000-8000-000000000000',
    requestId: 'new-request', deliveryId: 'new-delivery', state: 'unknown', resolution: 'pending', results: [],
    scopeKey: history.scopeKey.replaceAll('a.example.test', 'chatgpt.com'),
    slots: history.slots.map(slot => ({...slot, domain: 'chatgpt.com'}))};
  const results = [...history.results.slice(0, -1),
    {index: 20, saved: true, verified: false, code: 'E_CHROME_PERMISSION_REQUIRED'}];
  const journal = {...empty(), attempts: [history]};
  while (bytes(v5({...journal, attempts: [...journal.attempts,
    {...candidate, resolution: 'receipt', results}]})) <= 8192) {
    journal.attempts.push(row(journal.attempts.length));
  }
  assert.ok(bytes(v5(journal)) <= 8192);
  assert.ok(bytes(v5({...journal, attempts: [...journal.attempts, candidate]})) <= 8192);
  return {journal, candidate, results};
}

test('accumulated 21-item login history permits cancellation and both new batches without losing facts', async t => {
  const {candidate} = batch21();
  const journal = empty();
  for (let i = 0; i < 3; i++) journal.attempts.push({...candidate,
    attemptId: `historical-${i}`, requestId: `historical-request-${i}`, deliveryId: `historical-delivery-${i}`,
    scopeKey: candidate.scopeKey.replace('"grant"', `"historical-grant-${i}"`),
    state: 'success', resolution: 'receipt',
    results: candidate.slots.map((_, index) => ({index, saved: true, verified: true}))});
  while (bytes(v6({...journal, attempts: [...journal.attempts, row(journal.attempts.length)]})) < 7800)
    journal.attempts.push(row(journal.attempts.length));
  const initial = v6(journal), s = storage(initial, {lost: true});
  assert.ok(bytes(initial) < 8192);
  const first = await reserveCookieAttempt(s.request, candidate);
  await saveCookieReceipt(s.request, first.reference, {errorCode: 'E_COOKIE_NOT_SUBMITTED'});
  const retry = await reserveCookieAttempt(s.request, candidate);
  await saveCookieReceipt(s.request, retry.reference, {receipt: {saved: 21, verified: 21,
    results: candidate.slots.map((_, index) => ({index, saved: true, verified: true}))}});
  const second = {...candidate, requestId: 'second-request', deliveryId: 'second-delivery', count: 1,
    slots: [{...candidate.slots[0], partitionKey: {topLevelSite: 'https://chatgpt.com', hasCrossSiteAncestor: false}}]};
  const last = await reserveCookieAttempt(s.request, second);
  const settled = await saveCookieReceipt(s.request, last.reference, {receipt: {saved: 1, verified: 1,
    results: [{index: 0, saved: true, verified: true}]}});
  assert.deepEqual(settled.value.attempts.slice(0, -3), journal.attempts);
  assert.equal(settled.value.attempts.at(-3).resolution, 'not-submitted');
  assert.equal(s.value.schemaVersion, 7);
  assert.deepEqual((await readCookieJournal(s.request)).value, settled.value);
  const writes = s.writes;
  await assert.rejects(reserveCookieAttempt(s.request, candidate), {code: 'E_COOKIE_REPLAY'});
  assert.equal(s.writes, writes);
  t.diagnostic(`old history=${bytes(initial)} bytes; full new history=${bytes(s.value)} bytes`);
});

test('21 successful historical items plus a full new 21-item worst receipt fit only after result compaction', async t => {
  const {journal, candidate, results} = batch21();
  for (const saved of [true, false]) await t.test(`last item saved=${saved}`, async t => {
    const worst = results.map(r => r.index === 20 ? {...r, saved} : r);
    const oldBytes = bytes(v5({...journal, attempts: [...journal.attempts,
      {...candidate, resolution: 'receipt', results: worst}]}));
    assert.ok(oldBytes > 8192);
    const s = storage(v5(journal), {lost: true});
    assert.deepEqual((await readCookieJournal(s.request)).value, journal);
    const reserved = await reserveCookieAttempt(s.request, candidate);
    assert.equal(s.writes, 1);
    assert.equal(reserved.value.schemaVersion, 2);
    assert.deepEqual(reserved.value.attempts.slice(0, -1), journal.attempts);
    assert.deepEqual((await readCookieJournal(s.request)).value, reserved.value);
    const settled = await saveCookieReceipt(s.request, reserved.reference, {receipt: {
      saved: 20 + Number(saved), verified: 20, stopped: true, results: worst,
    }});
    assert.equal(s.value.schemaVersion, 6);
    assert.equal(s.writes, 2);
    assert.ok(bytes(s.value) <= 8192);
    assert.deepEqual(settled.value.attempts.slice(0, -1), journal.attempts);
    assert.deepEqual(settled.value.attempts.at(-1).results, worst);
    assert.deepEqual((await readCookieJournal(s.request)).value, settled.value);
    t.diagnostic(`v5=${oldBytes} bytes; v6=${bytes(s.value)} bytes`);
    const writes = s.writes;
    await assert.rejects(reserveCookieAttempt(s.request, candidate), {code: 'E_COOKIE_UNRESOLVED'});
    assert.equal(s.writes, writes);
  });
});

test('schema6 preserves legacy results, expired seen and unresolved locks without normalization', async () => {
  const {journal, candidate} = batch21();
  journal.legacy = {attribution: {sourceId: 'old-source', siteId: 'old-site'}, record: {
    schemaVersion: 1, deliveryId: 'old-delivery', attemptId: 'old-attempt', accountId: 'old-account',
    serviceOrigin: 'https://old.example.test', targetUrl: 'https://old.example.test/',
    state: 'unknown', count: 2, results: [
      {index: 0, saved: true, verified: true},
      {index: 1, saved: true, verified: false, code: 'E_OUTCOME_UNKNOWN'},
    ], seen: [{deliveryId: 'expired', expiresAt: 1700000000000}],
    scope: JSON.stringify([['session', '/', 'old.example.test']]),
  }};
  const s = storage(v6(journal));
  assert.deepEqual((await readCookieJournal(s.request)).value, journal);
  await assert.rejects(reserveCookieAttempt(s.request, candidate), {code: 'E_COOKIE_UNRESOLVED'});
  assert.equal(s.writes, 0);
});

test('schema6 writes preserve legacy facts and a full successful receipt with replay protection', async () => {
  const {journal, candidate} = batch21();
  journal.legacy = {attribution: {sourceId: 'old-source', siteId: 'old-site'}, record: {
    schemaVersion: 1, deliveryId: 'old-delivery', attemptId: 'old-attempt', accountId: 'old-account',
    serviceOrigin: 'https://old.example.test', targetUrl: 'https://old.example.test/',
    state: 'failed', count: 1, results: [{index: 0, saved: false, verified: false, code: 'E_COOKIE_SCOPE'}],
    seen: [{deliveryId: 'expired', expiresAt: 1700000000000}],
  }};
  const s = storage(v5(journal), {lost: true});
  const reserved = await reserveCookieAttempt(s.request, candidate);
  const results = Array.from({length: 21}, (_, index) => ({index, saved: true, verified: true}));
  const settled = await saveCookieReceipt(s.request, reserved.reference, {receipt: {
    saved: 21, verified: 21, results,
  }});
  assert.equal(s.value.schemaVersion, 6);
  assert.deepEqual(s.value.legacy.record.results, [[0, false, false, 'E_COOKIE_SCOPE']]);
  assert.deepEqual(settled.value.legacy, journal.legacy);
  assert.deepEqual(settled.value.attempts.slice(0, -1), journal.attempts);
  assert.deepEqual(settled.value.attempts.at(-1).results, results);
  assert.deepEqual((await readCookieJournal(s.request)).value, settled.value);
  const writes = s.writes;
  await assert.rejects(reserveCookieAttempt(s.request, candidate), {code: 'E_COOKIE_REPLAY'});
  assert.equal(s.writes, writes);
});

test('schema6 receipt requires exact readback and never retries a conflicting CAS', async () => {
  const {journal, candidate, results} = batch21();
  for (const conflict of [true, false]) {
    const s = storage(v5(journal)), reserved = await reserveCookieAttempt(s.request, candidate);
    let sets = 0;
    const request = async (op, args) => {
      if (op === 'storage.set') {
        sets++;
        assert.equal(args.key, COOKIE_JOURNAL_KEY);
        assert.equal(args.value.schemaVersion, 6);
        if (conflict) throw Error('conflicting CAS');
        const changed = clone(args);
        changed.value.attempts.at(-1)[2] = 'concurrent-request';
        return s.request(op, changed);
      }
      return s.request(op, args);
    };
    await assert.rejects(saveCookieReceipt(request, reserved.reference, {receipt: {
      saved: 21, verified: 20, stopped: true, results,
    }}), {code: 'E_COOKIE_RECEIPT_UNCONFIRMED'});
    assert.equal(sets, 1);
    assert.deepEqual((await readCookieJournal(s.request)).value.attempts.slice(0, -1), journal.attempts);
    if (conflict) assert.deepEqual((await readCookieJournal(s.request)).value, reserved.value);
  }
});

test('schema6 rejects corrupt result indexes, tuples and noncanonical encodings without writes', async () => {
  const {journal} = batch21();
  journal.legacy = {record: {
    schemaVersion: 1, deliveryId: 'old', attemptId: 'old', accountId: 'old',
    serviceOrigin: 'https://old.example.test', targetUrl: 'https://old.example.test/',
    state: 'unknown', count: 1, results: [{index: 0, saved: true, verified: false}], seen: [],
  }, attribution: null};
  const raw = v6(journal);
  for (const mutate of [
    v => v.attempts[0][11][0][0] = 1,
    v => v.attempts[0][11][1][0] = 0,
    v => v.attempts[0][11][0][0] = '0',
    v => v.attempts[0][11].reverse(),
    v => v.attempts[0][11][0] = {index: 0, saved: true, verified: true},
    v => v.attempts[0][11][0].pop(),
    v => v.attempts[0][11][0].push(null),
    v => v.attempts[0][11][0].push(undefined),
    v => v.attempts[0][11][0].push('E_COOKIE_STORE'),
    v => v.attempts[0][11][0].push('E_COOKIE_STORE', 'secret'),
    v => v.attempts[0][11][0][1] = 1,
    v => v.attempts[0][11][0][1] = false,
    v => v.attempts[0][11] = null,
    v => v.attempts[0].push('secret'),
    v => v.attempts[0][0] = -1,
    v => v.attempts[0][8] = 999,
    v => v.slots.push(clone(v.slots[0])),
    v => v.scopes.push(v.scopes[0]),
    v => v.secret = 'secret',
    v => v.legacy.record.results[0][0] = 1,
    v => v.legacy.record.results[0].push(null),
    v => v.legacy.record.results[0].push(undefined),
    v => v.legacy.record.results[0].push('BAD_CODE'),
    v => v.legacy.record.results[0].push('E_OUTCOME_UNKNOWN', 'secret'),
    v => v.legacy.record.results[0] = {index: 0, saved: true, verified: false},
    v => v.legacy.record.secret = 'secret',
    v => v.legacy.record.results = null,
    v => delete v.legacy.record,
  ]) {
    const bad = clone(raw); mutate(bad); const s = storage(bad);
    await assert.rejects(readCookieJournal(s.request), {code: 'E_COOKIE_STORAGE'});
    assert.equal(s.writes, 0);
  }
});

test('true schema10 overflow reserves zero writes even though the pending marker fits', async t => {
  const candidate = {...row(99), count: 50, state: 'unknown', resolution: 'pending'};
  const results = Array.from({length: 50}, (_, index) => ({index, saved: true, verified: true}));
  results[49] = {index: 49, saved: false, verified: false, code: 'E_CHROME_PERMISSION_REQUIRED'};
  let marker, final;
  for (let extra = 0; extra < 7000; extra++) {
    candidate.slots = Array.from({length: 50}, (_, i) => ({...row(0).slots[0],
      name: ('cookie' + i).padEnd(60 + Math.floor(extra / 50) + Number(i < extra % 50), 'x')}));
    marker = v10({...empty(), attempts: [candidate]});
    final = v10({...empty(), attempts: [{...candidate, state: 'partial', resolution: 'receipt', results}]});
    if (bytes(final) > 8192) break;
  }
  assert.ok(bytes(marker) <= 8192);
  assert.ok(bytes(final) > 8192);
  const s = storage(empty());
  await assert.rejects(reserveCookieAttempt(s.request, candidate), {code: 'E_COOKIE_LIMIT'});
  assert.equal(s.writes, 0);
  assert.deepEqual(s.value, empty());
  const oversized = storage(final);
  await assert.rejects(readCookieJournal(oversized.request), {code: 'E_COOKIE_LIMIT'});
  assert.equal(oversized.writes, 0);
  t.diagnostic(`v10 pending=${bytes(marker)} bytes; worst receipt=${bytes(final)} bytes`);
});

test('schema8 keeps normal and partitioned Cookie identities distinct after storage roundtrip', async () => {
  const history = {...row(1), state: 'success', resolution: 'receipt',
    results: [0, 1].map(index => ({index, saved: true, verified: true}))};
  history.slots[1] = {...history.slots[0], partitionKey: {
    topLevelSite: 'https://top.example.test', hasCrossSiteAncestor: false,
  }};
  const journal = {...empty(), attempts: [history]}, s = storage(v8(journal));
  assert.deepEqual((await readCookieJournal(s.request)).value, journal);
  const reserved = await reserveCookieAttempt(s.request, {...history,
    attemptId: 'partition-retry', requestId: 'partition-request', deliveryId: 'partition-delivery',
    state: 'unknown', resolution: 'pending', results: []});
  assert.deepEqual(reserved.value.attempts[0], history);
  assert.deepEqual((await readCookieJournal(s.request)).value.attempts[0], history);
});

test('schema8 rejects corrupt slot dictionaries and preserves partial/unknown and legacy barriers', async () => {
  const journal = empty(), history = {...row(1), state: 'success', resolution: 'receipt',
    results: [0, 1].map(index => ({index, saved: true, verified: true}))};
  journal.attempts.push(history);
  const raw = v8(journal);
  assert.deepEqual((await readCookieJournal(storage(raw).request)).value, journal);
  for (const mutate of [
    v => v.slotScopes.push(clone(v.slotScopes[0])),
    v => v.slotScopes[0].push('secret'),
    v => v.slotScopes[0][1] = 'true',
    v => v.slotScopes[0][4] = {topLevelSite: 'invalid', hasCrossSiteAncestor: false},
    v => v.slots[0][0][1] = -1,
    v => v.slots[0][0][1] = 0.5,
    v => v.slots[0][0][1] = 999,
    v => v.slots[0][0].push('secret'),
    v => v.extra = 'secret',
  ]) {
    const bad = clone(raw); mutate(bad); const s = storage(bad);
    await assert.rejects(readCookieJournal(s.request), {code: 'E_COOKIE_STORAGE'});
    assert.equal(s.writes, 0);
  }
  for (const state of ['partial', 'unknown']) {
    const results = [{index: 0, saved: true, verified: true},
      {index: 1, saved: state === 'unknown', verified: false,
        code: state === 'unknown' ? 'E_OUTCOME_UNKNOWN' : 'E_GRANT_REVOKED'}];
    const locked = {...journal, attempts: [{...history, state, results}]}, s = storage(v8(locked));
    assert.deepEqual((await readCookieJournal(s.request)).value, locked);
    await assert.rejects(reserveCookieAttempt(s.request, {...row(2), state: 'unknown', resolution: 'pending'}),
      {code: 'E_COOKIE_UNRESOLVED'});
    assert.equal(s.writes, 0);
  }
  journal.legacy = {attribution: {sourceId: 'old', siteId: 'old'}, record: {
    schemaVersion: 1, deliveryId: 'old', attemptId: 'old', accountId: 'old',
    serviceOrigin: 'https://old.example.test', targetUrl: 'https://old.example.test/',
    state: 'unknown', count: 1, results: [{index: 0, saved: true, verified: false}],
    seen: [{deliveryId: 'expired', expiresAt: 1600000000000}],
  }};
  const legacy = storage(v8(journal));
  assert.deepEqual((await readCookieJournal(legacy.request)).value, journal);
  await assert.rejects(reserveCookieAttempt(legacy.request, {...row(2), state: 'unknown', resolution: 'pending'}),
    {code: 'E_COOKIE_UNRESOLVED'});
  assert.equal(legacy.writes, 0);
});

test('schema7 rejects corrupt scope dictionaries and result runs while preserving unknown locks and legacy facts', async () => {
  const {journal, candidate} = batch21();
  journal.legacy = {record: null, attribution: null};
  journal.attempts.push({...candidate, resolution: 'receipt', state: 'unknown', results: [
    {index: 0, saved: true, verified: true},
    {index: 1, saved: true, verified: false, code: 'E_OUTCOME_UNKNOWN'},
  ]});
  const raw = v7(journal), s = storage(raw);
  assert.deepEqual((await readCookieJournal(s.request)).value, journal);
  await assert.rejects(reserveCookieAttempt(s.request, {...candidate, deliveryId: 'different'}),
    {code: 'E_COOKIE_UNRESOLVED'});
  assert.equal(s.writes, 0);
  for (const mutate of [
    v => v.scopeFields.push(v.scopeFields[0]),
    v => v.scopeFields[0] = 1,
    v => v.scopes[0][0] = -1,
    v => v.scopes[0][7].push(0),
    v => v.scopes[0].push(0),
    v => v.attempts.at(-1)[11][0] = 51,
    v => v.attempts.at(-1)[11][0] = -1,
    v => v.attempts.at(-1)[11][0] = 0.5,
    v => v.attempts.at(-1)[11].push([]),
    v => v.attempts.at(-1)[11][1].push('secret'),
    v => v.attempts.at(-1)[11][1][1] = true,
    v => v.attempts[0][11] = [20, [true, true]],
  ]) {
    const bad = clone(raw); mutate(bad); const rejected = storage(bad);
    await assert.rejects(readCookieJournal(rejected.request), {code: 'E_COOKIE_STORAGE'});
    assert.equal(rejected.writes, 0);
  }
  journal.legacy = {attribution: {sourceId: 'old', siteId: 'old'}, record: {
    schemaVersion: 1, deliveryId: 'old', attemptId: 'old', accountId: 'old',
    serviceOrigin: 'https://old.example.test', targetUrl: 'https://old.example.test/',
    state: 'unknown', count: 1, results: [{index: 0, saved: true, verified: false}],
    seen: [{deliveryId: 'expired', expiresAt: 1600000000000}],
  }};
  assert.deepEqual((await readCookieJournal(storage(v7(journal)).request)).value, journal);
});

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

test('a new website fits beside real-sized settled history without dropping facts or enlarging storage quota', async () => {
  const slots = Array.from({length: 21}, (_, i) => ({name: 'synthetic_session_cookie_with_representative_length_' + i,
    domain: 'a.example.test', hostOnly: true, path: '/', storeId: 'authorized-store', partitionKey: null}));
  const initial = {schemaVersion: 3, legacy: {record: null, attribution: null}, scopes: [row(0).scopeKey], slots: [slots],
    attempts: Array.from({length: 7}, (_, i) => ({...row(i), scopeKey: 0, slots: 0, count: 21,
      ...(i === 1 || i === 5 ? {state: 'success', resolution: 'receipt',
        results: slots.map((_, index) => ({index, saved: true, verified: true}))} : {})}))};
  assert.ok(bytes(initial) > 7400 && bytes(initial) <= 8192);
  const s = storage(initial), history = (await readCookieJournal(s.request)).value;
  const candidate = {...row(99), scopeKey: row(99).scopeKey.replaceAll('a.example.test', 'b.example.test'),
    slots: row(99).slots.map(slot => ({...slot, domain: 'b.example.test'})), state: 'unknown', resolution: 'pending'};
  const reserved = await reserveCookieAttempt(s.request, candidate);
  assert.equal(s.value.schemaVersion, 4);
  assert.ok(bytes(s.value) <= 8192);
  assert.deepEqual(reserved.value.attempts.slice(0, -1), history.attempts);
  assert.deepEqual((await readCookieJournal(s.request)).value, reserved.value);
  await assert.rejects(reserveCookieAttempt(s.request, candidate), {code: 'E_COOKIE_UNRESOLVED'});
  const settled = await saveCookieReceipt(s.request, reserved.reference, {receipt: {saved: 2, verified: 2,
    results: candidate.slots.map((_, index) => ({index, saved: true, verified: true}))}});
  assert.deepEqual((await readCookieJournal(s.request)).value, settled.value);
  assert.deepEqual(settled.value.attempts.slice(0, -1), history.attempts);
  const raw = s.value;
  for (const mutate of [v => v.slots[0][0].push('secret'), v => v.slots[0][0][2] = 'true',
    v => v.slots[0][0][5] = {unknown: true}, v => v.slots.push(v.slots[0])]) {
    const bad = clone(raw); mutate(bad); const rejected = storage(bad);
    await assert.rejects(readCookieJournal(rejected.request));
    assert.equal(rejected.writes, 0);
  }
});

test('a new delivery fits a near-full v4 history by encoding attempt field names once', async () => {
  const fields = ['name', 'domain', 'hostOnly', 'path', 'storeId', 'partitionKey'];
  const slots = Array.from({length: 21}, (_, i) => ({...row(0).slots[0],
    name: 'synthetic_session_cookie_with_representative_length_' + i}));
  const initial = {schemaVersion: 4, legacy: {record: null, attribution: null},
    scopes: [row(0).scopeKey], slots: [slots.map(slot => fields.map(key => slot[key]))], attempts: []};
  for (let i = 0; ; i++) {
    const next = {...row(i), scopeKey: 0, slots: 0, count: 21,
      ...(i < 2 ? {state: 'success', resolution: 'receipt',
        results: slots.map((_, index) => ({index, saved: true, verified: true}))} : {})};
    if (bytes({...initial, attempts: [...initial.attempts, next]}) > 8192) break;
    initial.attempts.push(next);
  }
  assert.ok(bytes(initial) > 7800 && bytes(initial) <= 8192);
  const s = storage(initial), history = (await readCookieJournal(s.request)).value;
  const candidate = {...row(99), scopeKey: row(99).scopeKey.replaceAll('a.example.test', 'b.example.test'),
    slots: row(99).slots.map(slot => ({...slot, domain: 'b.example.test'})), state: 'unknown', resolution: 'pending'};
  const reserved = await reserveCookieAttempt(s.request, candidate);
  assert.equal(s.value.schemaVersion, 5);
  assert.deepEqual(reserved.value.attempts.slice(0, -1), history.attempts);
  assert.deepEqual((await readCookieJournal(s.request)).value, reserved.value);
  await assert.rejects(reserveCookieAttempt(s.request, candidate), {code: 'E_COOKIE_UNRESOLVED'});
  const settled = await saveCookieReceipt(s.request, reserved.reference, {receipt: {saved: 2, verified: 2,
    results: candidate.slots.map((_, index) => ({index, saved: true, verified: true}))}});
  assert.ok(bytes(s.value) <= 8192);
  assert.deepEqual(settled.value.attempts.slice(0, -1), history.attempts);
  assert.deepEqual((await readCookieJournal(s.request)).value, settled.value);
  await assert.rejects(reserveCookieAttempt(s.request, candidate), {code: 'E_COOKIE_REPLAY'});
  for (const mutate of [v => v.attempts[0].push('secret'), v => v.attempts[0][0] = -1,
    v => v.attempts[0][8] = 999, v => v.attempts[0][11] = [{index: 0, saved: false, verified: true}],
    v => v.scopes.push(v.scopes[0])]) {
    const bad = clone(s.value); mutate(bad); const rejected = storage(bad);
    await assert.rejects(readCookieJournal(rejected.request));
    assert.equal(rejected.writes, 0);
  }
});
