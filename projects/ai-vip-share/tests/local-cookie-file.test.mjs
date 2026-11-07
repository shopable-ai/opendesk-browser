import test from 'node:test';
import assert from 'node:assert/strict';
import {LOCAL_CHATGPT, preflightCookieFile} from '../src/local-cookie-file.js';

const now = 1800000000000;
const partitionKey = {topLevelSite: 'https://chatgpt.com', hasCrossSiteAncestor: false};
const row = (overrides = {}) => ({name: 'session', value: 'synthetic-cookie', domain: 'chatgpt.com',
  path: '/', hostOnly: true, secure: true, httpOnly: true, sameSite: 'lax', session: false,
  expirationDate: now / 1000 + 3600, ...overrides});
const run = rows => preflightCookieFile(JSON.stringify(rows), now);
function rejected(input) {
  assert.throws(() => preflightCookieFile(typeof input === 'string' ? input : JSON.stringify(input), now), error => {
    assert.equal(error.code, 'E_COOKIE_FILE');
    assert.match(error.message, /^(?:Cookie 文件格式无效或超过限制|第 \d+ 行 Cookie 数据无效或不安全)$/);
    assert.ok(!String(error).includes('DO_NOT_LEAK'));
    return true;
  });
}

test('exports the fixed site and preserves host/domain/partition attributes in two ordered batches', () => {
  assert.deepEqual(LOCAL_CHATGPT, {key: 'local-chatgpt', site: {siteId: 'chatgpt', label: 'ChatGPT',
    targetUrl: 'https://chatgpt.com/', policyVersion: '1'}});
  const rows = [row({storeId: '0'}), row({name: 'partitioned', storeId: '0', partitionKey}),
    row({name: 'domain', domain: '.chatgpt.com', hostOnly: false, storeId: '0',
      httpOnly: false, secure: false, sameSite: 'strict', expirationDate: now / 1000 + 60}),
    row({name: 'partitioned-second', storeId: '0', partitionKey, sameSite: 'no_restriction'})];
  const original = structuredClone(rows);
  const result = run(rows);
  assert.deepEqual(rows, original);
  assert.equal(result.count, 4);
  assert.equal(result.earliestExpiry, now + 60000);
  assert.equal(result.batches.length, 2);
  assert.deepEqual(result.batches.map(batch => batch.cookies.map(cookie => cookie.name)),
    [['session', 'domain'], ['partitioned', 'partitioned-second']]);
  for (const batch of result.batches) assert.equal(batch.url, 'https://chatgpt.com/');
  assert.deepEqual(result.batches[0].cookies[0], {name: 'session', value: 'synthetic-cookie', path: '/',
    secure: true, httpOnly: true, sameSite: 'lax', expirationDate: now / 1000 + 3600, storeId: '0'});
  assert.deepEqual(result.batches[0].cookies[1], {name: 'domain', value: 'synthetic-cookie', path: '/',
    secure: false, httpOnly: false, sameSite: 'strict', expirationDate: now / 1000 + 60,
    storeId: '0', domain: '.chatgpt.com'});
  assert.deepEqual(result.batches[1].cookies[0].partitionKey, partitionKey);
});

test('session cookies omit expiry, omitted context remains omitted', () => {
  const session = row({session: true});
  delete session.expirationDate;
  const result = run([session]);
  assert.equal(result.earliestExpiry, null);
  const cookie = result.batches[0].cookies[0];
  for (const key of ['session', 'hostOnly', 'domain', 'expirationDate', 'storeId', 'partitionKey'])
    assert.equal(Object.hasOwn(cookie, key), false);
  assert.equal(run([row({valueRedacted: false})]).count, 1);
});

test('both partition dimensions define separate batches; mixed stores are rejected before filtering', () => {
  const result = run([row({storeId: '0'}), row({storeId: '0', partitionKey}),
    row({storeId: '0', partitionKey: {...partitionKey, hasCrossSiteAncestor: true}})]);
  assert.equal(result.batches.length, 3);
  assert.equal(result.batches[2].cookies[0].partitionKey.hasCrossSiteAncestor, true);
  rejected([row({storeId: '0'}), row({storeId: '1'})]);
  rejected([row({storeId: '0'}), row({storeId: '1', expirationDate: 1})]);
});

test('rejects mixed omitted and explicit stores before returning batches, including duplicate slots', () => {
  for (const storeId of ['0', '1']) {
    for (const explicit of [row({name: 'different', storeId}), row({storeId}),
      row({storeId, domain: '.chatgpt.com', hostOnly: false, httpOnly: false}),
      row({name: 'partitioned', storeId, partitionKey})]) {
      rejected([row(), explicit]);
      rejected([explicit, row()]);
    }
  }
  // Homogeneous omitted context is still valid across distinct slots and partitions.
  assert.equal(run([row(), row({name: 'second'}), row({partitionKey})]).batches.length, 2);
});

test('rejects invalid formats, file sizes and row counts without leaking parse content', () => {
  for (const input of ['DO_NOT_LEAK', '{"DO_NOT_LEAK":', 'null', '{}', '[]',
    ' '.repeat(65537), '界'.repeat(22000), [null], [3], [Array.of(row())],
    Array.from({length: 51}, (_, index) => row({name: `cookie${index}`}))]) rejected(input);
  assert.equal(run(Array.from({length: 50}, (_, i) => row({name: `c${i}`, value: ''}))).count, 50);
  assert.throws(() => preflightCookieFile(null, now), {code: 'E_COOKIE_FILE'});
  assert.throws(() => preflightCookieFile(JSON.stringify([row()]), NaN), {code: 'E_COOKIE_FILE'});
  const text = JSON.stringify([row()]);
  const padded = text + ' '.repeat(65536 - Buffer.byteLength(text));
  assert.equal(preflightCookieFile(padded, now).count, 1);
  rejected(padded + ' ');
});

test('rejects expiry contradictions, invalid domain/path, missing booleans and SameSite', () => {
  const bad = [    {expirationDate: null}, {expirationDate: '1900000000'}, {expirationDate: 4102444801},
    {expirationDate: undefined}, {session: true}, {session: true, expirationDate: -1},
    {domain: 'evil.chatgpt.com'}, {domain: '.chatgpt.com.evil'}, {domain: 'CHATGPT.COM'},
    {hostOnly: false}, {domain: '.chatgpt.com'}, {path: '/session'},
    ...['hostOnly', 'secure', 'httpOnly', 'session'].flatMap(key => [{[key]: undefined}, {[key]: 1}]),
    {sameSite: 'None'}, {sameSite: undefined}, {sameSite: 'no_restriction', secure: false}];
  for (const change of bad) rejected([row({value: 'DO_NOT_LEAK', ...change})]);
});

test('enforces secure, host and http prefixes and rejects controls, opaque/redacted and unknown fields', () => {
  for (const change of [{name: '__Secure-token', secure: false},
    {name: '__Host-token', domain: '.chatgpt.com', hostOnly: false},
    {name: '__Host-token', secure: false}, {name: '__Http-token', httpOnly: false},
    {name: '__Host-Http-token', httpOnly: false}, {name: 'bad name'}, {name: 'a=b'},
    {name: 'x'.repeat(257)}, {value: 'DO_NOT_LEAK\n'}, {value: 'DO_NOT_LEAK\u0085'},
    {value: 'DO_NOT_LEAK;'}, {value: '\ud800'}, {value: {opaque: 'DO_NOT_LEAK'}},
    {valueRedacted: true}, {valueRedacted: 'false'}, {opaque: 'DO_NOT_LEAK'},
    {value: '[REDACTED]'}, {value: '***'}, {value: '<opaque>'},
    {unknown: 'DO_NOT_LEAK'}, {url: 'DO_NOT_LEAK'}, {name: ''}]) rejected([row(change)]);
  assert.equal(run([row({name: '__Host-Http-token'})]).count, 1);
});

test('rejects invalid stores, partition shapes and duplicate actual slots', () => {
  for (const storeId of ['', null, 0, 'DO_NOT_LEAK\n', 'x'.repeat(65)]) rejected([row({storeId})]);
  for (const key of [null, 'opaque', {}, {topLevelSite: 'https://evil.test', hasCrossSiteAncestor: false},
    {...partitionKey, topLevelSite: 'https://chatgpt.com/'}, {topLevelSite: 'https://chatgpt.com'},
    {...partitionKey, hasCrossSiteAncestor: 0}, {...partitionKey, opaque: 'DO_NOT_LEAK'}])
    rejected([row({partitionKey: key})]);
  rejected([row(), row({domain: '.chatgpt.com', hostOnly: false, httpOnly: false})]);
  rejected([row({partitionKey}), row({partitionKey: {hasCrossSiteAncestor: false, topLevelSite: 'https://chatgpt.com'}})]);
  rejected([row(), row({name: 'second', unknown: 'DO_NOT_LEAK'})]);
});

test('enforces UTF-8 value and whole-request budgets without capacity splitting', () => {
  assert.equal(run([row({value: 'x'.repeat(4096)})]).count, 1);
  rejected([row({value: 'x'.repeat(4097)})]);
  rejected([row({value: '界'.repeat(1366)})]);
  const rows = Array.from({length: 3}, (_, i) => row({name: `cookie${i}`, value: 'x'.repeat(3900)}));
  rejected(rows); // Values fit individually; the single store/partition request does not.
  rejected(rows.map(cookie => ({...cookie, expirationDate: 1}))); // Expiry cannot bypass budgets.
  const boundary = Array.from({length: 3}, (_, i) => row({name: `cookie${i}`, value: ''}));
  const size = Buffer.byteLength(JSON.stringify(run(boundary).batches[0]));
  const remaining = 12000 - size;
  boundary.forEach((cookie, i) => { cookie.value = 'x'.repeat(Math.floor(remaining / 3) + (i < remaining % 3 ? 1 : 0)); });
  assert.equal(Buffer.byteLength(JSON.stringify(run(boundary).batches[0])), 12000);
  boundary[0].value += 'x';
  rejected(boundary);
});


test('validates every record before skipping expired ones, preserving all retained attributes and counts', () => {
  const session = row({name: 'session-only', session: true});
  delete session.expirationDate;
  const valid = row({storeId: '0', domain: '.chatgpt.com', hostOnly: false,
    secure: false, httpOnly: false, sameSite: 'strict', expirationDate: now / 1000 + 30});
  const partitioned = row({name: 'partitioned', storeId: '0', partitionKey});
  const rows = [row({name: 'past', storeId: '0', expirationDate: now / 1000 - 1}),
    valid, {...session, storeId: '0'}, partitioned,
    row({name: 'boundary', storeId: '0', expirationDate: now / 1000})];
  const text = JSON.stringify(rows), original = structuredClone(rows);
  const result = preflightCookieFile(text, now);
  assert.deepEqual(rows, original);
  assert.equal(JSON.stringify(rows), text);
  assert.deepEqual([result.totalCount, result.count, result.skippedCount], [5, 3, 2]);
  assert.equal(result.earliestExpiry, now + 30000);
  assert.deepEqual(result.batches, run([valid, {...session, storeId: '0'}, partitioned]).batches);
  assert.deepEqual(run([row({expirationDate: 1})]), {
    batches: [], contexts: [{storeId: undefined, partitionKey: null}],
    count: 0, totalCount: 1, skippedCount: 1, earliestExpiry: null
  });
});

test('expired rows cannot hide unsafe input, duplicate slots, or invalid later records', () => {
  const expired = row({name: 'expired', expirationDate: 1});
  for (const change of [{domain: 'evil.test'}, {path: '/wrong'}, {secure: 'true'},
    {value: '[REDACTED]'}, {valueRedacted: true}, {partitionKey: {...partitionKey, topLevelSite: 'https://evil.test'}},
    {unknown: 'DO_NOT_LEAK'}, {value: 'x'.repeat(4097)}]) rejected([row(), {...expired, ...change}]);
  rejected([row(), row({expirationDate: 1})]);
  rejected([expired, {...expired, domain: '.chatgpt.com', hostOnly: false}]);
  rejected([expired, row({domain: 'evil.test'})]);
  rejected(Array.from({length: 51}, (_, i) => ({...expired, name: `past${i}`})));
});
