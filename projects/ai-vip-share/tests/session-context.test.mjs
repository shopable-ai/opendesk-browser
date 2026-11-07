import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateDeclarations, validateAuthorization, createScopeKey, validateSessionResponse,
  createSourceClocks, createSelectionGuard, cookieScopesOverlap, validateScopeKey
} from '../src/session-context.js';

const NOW = 1_800_000_000_000;
// Synthetic metadata only: these labels do not identify or authorize any actual Chrome Store.
const TEST_STORE = 'test-authorized-store';
const slot = (overrides = {}) => ({name: 'session', domain: 'a.example.test', hostOnly: true,
  path: '/', storeId: TEST_STORE, partitionKey: null, secure: true, httpOnly: true, sameSite: 'lax', ...overrides});
function declarations(host = 'a.example.test', policy = 'ordinary') {
  return {
    site: {siteId: host, label: 'Workspace', targetUrl: `https://${host}/session/`,
      sourceIds: ['source'], cookieSlots: [slot({domain: host})], verification: 'user-check', policyVersion: 'p1'},
    source: {sourceId: 'source', serviceOrigin: 'https://source.example.test', serviceRevision: 's1', policy,
      endpoints: {authorization: 'https://source.example.test/authorization', session: 'https://source.example.test/session'},
      operationKinds: ['set-session'], maxAuthorizationMs: 60_000, maxDeliveryMs: 10_000}
  };
}
function authorization(context, overrides = {}) {
  const {site, source} = context;
  return {sourceId: source.sourceId, serviceOrigin: source.serviceOrigin, serviceRevision: source.serviceRevision,
    siteId: site.siteId, subjectId: 'same-account', authorizationRevision: 'grant-1', policy: source.policy,
    policyVersion: site.policyVersion, targetUrl: site.targetUrl, operationKinds: ['set-session'],
    authorized: true, issuedAt: NOW - 1000, expiresAt: NOW + 50_000,
    ...(source.policy === 'commercial' ? {companyId: 'company', redemptionId: 'redemption',
      sharedAccountId: 'assigned', assignmentRevision: 'assignment-1', membershipAuthorized: true} : {}), ...overrides};
}
function delivery(context, auth, overrides = {}) {
  return {deliveryId: 'same-delivery', requestId: 'same-request',
    scopeKey: createScopeKey(context, auth, 'set-session', NOW), serviceRevision: context.source.serviceRevision,
    policyVersion: context.site.policyVersion, issuedAt: NOW, expiresAt: NOW + 5000, ...overrides};
}
const options = {requestId: 'same-request', operationKind: 'set-session', now: NOW};

test('fixed declarations snapshot reviewed targets and reject remote policy/config expansion', () => {
  const context = declarations();
  const snapshot = validateDeclarations(context.site, context.source);
  context.site.targetUrl = 'https://evil.example.test/';
  assert.equal(snapshot.site.targetUrl, 'https://a.example.test/session/');
  assert.ok(Object.isFrozen(snapshot.site.cookieSlots[0]));
  for (const change of [
    c => { c.source.policy = undefined; c.source.requiresMembership = false; },
    c => { c.source.endpoints.session = 'https://evil.example.test/session'; },
    c => { c.site.sourceIds = ['unapproved']; },
    c => { c.site.targetUrl = 'https://user:secret@a.example.test/session/'; },
    c => { c.site.targetUrl += '?target=evil'; },
    c => { c.site.cookieSlots[0].domain = '.example.test'; },
    c => { c.site.cookieSlots[0].partitionKey = undefined; },
    c => { c.site.cookieSlots[0].value = 'never-accepted'; },
    c => { c.source.maxDeliveryMs = 0; }
  ]) {
    const changed = declarations(); change(changed);
    assert.throws(() => validateDeclarations(changed.site, changed.source));
  }
});

test('fixed Cookie declarations reject bad basic syntax and invalid secure prefixes before SDK use', () => {
  for (const override of [
    ...['', 'a=b', 'a;b', 'a b', 'a,b', 'a/b', 'a:b', 'a"b', 'a\\b', 'a\nb', '名字', 'x'.repeat(257)]
      .map(name => ({name})),
    ...['', 'relative', '/a;b', '/a\nb', '/a\u007fb', '/名字', `/${'x'.repeat(512)}`].map(path => ({path})),
    ...['a..example.test', '-a.example.test', 'a-.example.test', 'a_b.example.test',
      'a.example.test.', '..a.example.test', `${'a'.repeat(64)}.example.test`].map(domain => ({domain})),
    {name: '__Secure-session', secure: false}, {name: '__Host-session', secure: false},
    {name: '__Host-session', hostOnly: false}, {name: '__Host-session', path: '/session/'},
    {sameSite: 'no_restriction', secure: false}, {storeId: ''}, {storeId: undefined}
  ]) {
    const context = declarations(); context.site.cookieSlots = [slot(override)];
    assert.throws(() => validateDeclarations(context.site, context.source), JSON.stringify(override));
  }
  for (const name of ['__Secure-session', '__Host-session', 'valid!#$%&\'*+-.^_`|~', 'x'.repeat(256)]) {
    const context = declarations(); context.site.cookieSlots = [slot({name})];
    assert.doesNotThrow(() => validateDeclarations(context.site, context.source));
  }
  const context = declarations();
  context.site.targetUrl = `https://a.example.test/${'x'.repeat(511)}`;
  context.site.cookieSlots = [slot({path: `/${'x'.repeat(511)}`})];
  assert.doesNotThrow(() => validateDeclarations(context.site, context.source));
});

test('fixed Cookie declarations reject duplicate browser slots and enforce 1..50 rows', () => {
  for (const rows of [[], Array.from({length: 51}, (_, i) => slot({name: `session-${i}`})),
    [slot(), slot()], [slot(), slot({secure: false})],
    [slot(), slot({domain: '.A.EXAMPLE.TEST', hostOnly: false})]]) {
    const context = declarations(); context.site.cookieSlots = rows;
    assert.throws(() => validateDeclarations(context.site, context.source));
  }
  const context = declarations();
  context.site.cookieSlots = Array.from({length: 50}, (_, i) => slot({name: `session-${i}`}));
  assert.doesNotThrow(() => validateDeclarations(context.site, context.source));
  context.site.cookieSlots = [slot(), slot({path: '/session/'})];
  assert.doesNotThrow(() => validateDeclarations(context.site, context.source));
});

test('ordinary sources require a real explicit subject/site/revision/time grant without membership', () => {
  const context = declarations(), auth = authorization(context);
  assert.deepEqual(validateAuthorization(context, auth, NOW), auth);
  for (const overrides of [
    {subjectId: ''}, {authorizationRevision: ''}, {authorized: false}, {authorized: undefined},
    {siteId: 'other-site'}, {targetUrl: 'https://evil.example.test/'}, {serviceOrigin: 'https://evil.example.test'},
    {sourceId: 'evil'}, {serviceRevision: 'old'}, {policyVersion: 'old'}, {policy: 'commercial'},
    {operationKinds: []}, {operationKinds: ['proxy-start']}, {expiresAt: NOW}, {issuedAt: NOW + 1},
    {expiresAt: NOW + 100_000}, {requiresMembership: false}, {token: 'no-secret-fields'},
    {membershipAuthorized: true}, {storeId: 'remote-store'}, {partitionKey: null}
  ]) assert.throws(() => validateAuthorization(context, {...auth, ...overrides}, NOW));
  assert.throws(() => validateAuthorization(context, {requiresMembership: false}, NOW));
});

test('commercial policy never falls back to ordinary when membership or allocation authority is missing', () => {
  const context = declarations('a.example.test', 'commercial'), auth = authorization(context);
  assert.deepEqual(validateAuthorization(context, auth, NOW), auth);
  for (const key of ['companyId', 'redemptionId', 'sharedAccountId', 'assignmentRevision', 'subjectId', 'authorizationRevision']) {
    assert.throws(() => validateAuthorization(context, {...auth, [key]: ''}, NOW));
    const missing = {...auth}; delete missing[key];
    assert.throws(() => validateAuthorization(context, missing, NOW));
  }
  for (const override of [{membershipAuthorized: false}, {requiresMembership: false}, {authorized: false}, {policy: 'ordinary'}])
    assert.throws(() => validateAuthorization(context, {...auth, ...override}, NOW));
});

test('real different hosts with identical account/delivery/request IDs cannot share records or responses', () => {
  const a = declarations(), b = declarations('b.example.test');
  const aa = authorization(a), ba = authorization(b);
  const ad = delivery(a, aa), bd = delivery(b, ba);
  assert.notEqual(ad.scopeKey, bd.scopeKey);
  const records = new Map([[JSON.stringify([ad.scopeKey, ad.deliveryId, ad.requestId]), 'A saved']]);
  assert.equal(records.get(JSON.stringify([bd.scopeKey, bd.deliveryId, bd.requestId])), undefined);
  assert.throws(() => validateSessionResponse(b, ba, ad, options));
  assert.deepEqual(validateSessionResponse(b, ba, bd, options), bd);
});

test('scope uses structured tuples and binds every identity, revision, operation and target', () => {
  const context = declarations('a.example.test', 'commercial'), auth = authorization(context);
  const original = createScopeKey(context, auth, 'set-session', NOW);
  assert.deepEqual(JSON.parse(original).slice(0, 7), ['source', 'https://source.example.test', 'a.example.test',
    'same-account', 'grant-1', 'set-session', 'https://a.example.test/session/']);
  for (const key of ['subjectId', 'authorizationRevision', 'companyId', 'redemptionId', 'sharedAccountId', 'assignmentRevision'])
    assert.notEqual(createScopeKey(context, {...auth, [key]: `other:${key}`}, 'set-session', NOW), original);
  const otherSource = declarations(); otherSource.source.sourceId = 'other'; otherSource.site.sourceIds = ['other'];
  assert.notEqual(createScopeKey(otherSource, authorization(otherSource), 'set-session', NOW), original);
  const ordinary = declarations(), ordinaryAuth = authorization(ordinary);
  assert.deepEqual(JSON.parse(createScopeKey(ordinary, ordinaryAuth, 'set-session', NOW)).at(-1), ['ordinary', 'no-assignment']);
  const delimiterA = {...ordinaryAuth, subjectId: 'a|b', authorizationRevision: 'c'};
  const delimiterB = {...ordinaryAuth, subjectId: 'a', authorizationRevision: 'b|c'};
  assert.notEqual(createScopeKey(ordinary, delimiterA, 'set-session', NOW), createScopeKey(ordinary, delimiterB, 'set-session', NOW));
  const base = createScopeKey(ordinary, ordinaryAuth, 'set-session', NOW);
  for (const mutate of [
    c => { c.site.targetUrl = 'https://a.example.test/session/other'; },
    c => { c.site.siteId = 'other-site'; },
    c => {
      c.source.serviceOrigin = 'https://other-source.example.test';
      c.source.endpoints = {authorization: `${c.source.serviceOrigin}/authorization`, session: `${c.source.serviceOrigin}/session`};
    }
  ]) {
    const changed = declarations(); mutate(changed);
    assert.notEqual(createScopeKey(changed, authorization(changed), 'set-session', NOW), base);
  }
  ordinary.source.operationKinds.push('inspect-session');
  assert.notEqual(createScopeKey(ordinary, {...ordinaryAuth, operationKinds: ['inspect-session']}, 'inspect-session', NOW), base);
});

test('journal key validator accepts only canonical typed tuples and returns the same key', () => {
  const context = declarations(), auth = authorization(context);
  const key = createScopeKey(context, auth, 'set-session', NOW);
  assert.equal(validateScopeKey(key), key);
  const tuple = JSON.parse(key);
  for (const invalid of [null, '', '{}', JSON.stringify(tuple.slice(0, 7)), ` ${key}`,
    JSON.stringify([...tuple.slice(0, 7), ['ordinary', '']]),
    JSON.stringify([...tuple.slice(0, 7), ['commercial', 'c', 'r', 'a', '']]),
    JSON.stringify([...tuple.slice(0, 7), ['unknown', 'no-assignment']]),
    JSON.stringify(tuple.map((v, i) => i === 1 ? 'https://user:secret@source.example.test' : v)),
    JSON.stringify(tuple.map((v, i) => i === 6 ? 'javascript:alert(1)' : v))])
    assert.throws(() => validateScopeKey(invalid));
});

test('delivery metadata rejects altered scope, request, revision, deadline and any secret payload', () => {
  const context = declarations(), auth = authorization(context), response = delivery(context, auth);
  for (const change of [{requestId: 'old'}, {scopeKey: 'other'}, {serviceRevision: 'old'}, {policyVersion: 'old'},
    {expiresAt: NOW}, {expiresAt: NOW + 11_000}, {issuedAt: NOW + 1}, {cookiePayload: 'forbidden'},
    {storeId: 'remote-store'}, {partitionKey: null}])
    assert.throws(() => validateSessionResponse(context, auth, {...response, ...change}, options));
  assert.throws(() => validateSessionResponse(context, {...auth, authorizationRevision: 'revoked-generation'}, response, options));
  assert.throws(() => validateSessionResponse(context, auth, response, {...options, now: NOW + 5000}));
  // Cookie expiry is deliberately not substituted for a delivery/authorization deadline.
  assert.throws(() => validateSessionResponse(context, auth, {...response, expiresAt: NOW, cookieExpiresAt: NOW + 86400000}, options));
});

test('independent source clocks resist server rollback and stale/duplicate samples', () => {
  let tick = 0;
  const clocks = createSourceClocks(() => tick), a = declarations().source;
  const b = {...a, sourceId: 'ordinary-b'}, c = {...a, serviceOrigin: 'https://other-source.example.test'};
  assert.equal(clocks.now(a), null);
  clocks.sample(a, clocks.begin(a), NOW);
  clocks.sample(b, clocks.begin(b), NOW - 100_000);
  assert.equal(clocks.now(c), null);
  tick = 100;
  assert.equal(clocks.now(a), NOW + 100);
  assert.equal(clocks.now(b), NOW - 99_900);
  const old = clocks.begin(a), latest = clocks.begin(a);
  assert.throws(() => clocks.sample(a, old, NOW + 100_000));
  assert.equal(clocks.sample(a, latest, NOW - 5000), NOW + 100);
  assert.throws(() => clocks.sample(a, latest, NOW + 100_000));
  tick = 200;
  assert.equal(clocks.now(a), NOW + 200);
  tick = 200.25;
  assert.equal(clocks.now(a), NOW + 201);
  assert.doesNotThrow(() => validateAuthorization(declarations(), authorization(declarations()), clocks.now(a)));
});

test('monotonic rollback latches source closed rather than extending authorization validity', () => {
  let tick = 100;
  const clocks = createSourceClocks(() => tick), a = declarations().source;
  clocks.sample(a, clocks.begin(a), NOW);
  tick = 90;
  assert.throws(() => clocks.now(a));
  tick = 200;
  assert.throws(() => clocks.sample(a, clocks.begin(a), NOW));
  assert.equal(clocks.now({...a, sourceId: 'separate-source'}), null);
});

test('selection generations reject late A after B or A again, older requests and teardown', () => {
  const guard = createSelectionGuard();
  const selection = host => {
    const context = declarations(`${host.toLowerCase()}.example.test`);
    return {scopeKey: createScopeKey(context, authorization(context), 'set-session', NOW),
      policyVersion: 'p1', serviceRevision: 's1', pageIdentity: 'document-1'};
  };
  guard.select(selection('A')); const a = guard.capture('same-request');
  assert.equal(guard.isCurrent(a), true);
  assert.equal(guard.isCurrent({...a}), false);
  guard.select(selection('B')); const b = guard.capture('same-request');
  assert.equal(guard.isCurrent(a), false); assert.equal(guard.isCurrent(b), true);
  guard.select(selection('A')); const again = guard.capture('same-request');
  assert.equal(guard.isCurrent(a), false);
  const newest = guard.capture('same-request');
  assert.equal(guard.isCurrent(again), false); assert.equal(guard.isCurrent(newest), true);
  guard.select({...selection('A'), pageIdentity: 'document-2'});
  assert.equal(guard.isCurrent(newest), false);
  const navigated = guard.capture('new'); guard.invalidate();
  assert.equal(guard.isCurrent(navigated), false); assert.throws(() => guard.capture('after-revoke'));
});

test('Cookie conflicts ignore port/site IDs, include root paths, parent domains and name/store/partition', () => {
  const overlap = (a, b) => {
    assert.equal(cookieScopesOverlap(a, b), true);
    assert.equal(cookieScopesOverlap(b, a), true);
  };
  overlap(slot({targetUrl: 'https://a.example.test:123/session/', siteId: 'a'}),
    slot({targetUrl: 'https://a.example.test:456/workspace/', siteId: 'b'}));
  overlap(slot({path: '/'}), slot({path: '/workspace/'}));
  overlap(slot({domain: '.example.test', hostOnly: false}), slot());
  overlap(slot({domain: '.example.test', hostOnly: false}), slot({domain: '.a.example.test', hostOnly: false}));
  overlap(slot({path: '/session'}), slot({path: '/session/child'}));
  assert.equal(cookieScopesOverlap(slot({path: '/session/'}), slot({path: '/workspace/'})), false);
  assert.equal(cookieScopesOverlap(slot({path: '/session'}), slot({path: '/sessions'})), false);
  assert.equal(cookieScopesOverlap(slot({domain: 'example.test'}), slot()), false);
  assert.equal(cookieScopesOverlap(slot(), slot({domain: 'b.example.test'})), false);
  assert.equal(cookieScopesOverlap(slot(), slot({domain: 'notexample.test'})), false);
  assert.equal(cookieScopesOverlap(slot(), slot({name: 'other'})), false);
  assert.equal(cookieScopesOverlap(slot(), slot({storeId: 'other-test-authorized-store'})), false);
  const partition = {topLevelSite: 'https://top.example.test', hasCrossSiteAncestor: false};
  overlap(slot({partitionKey: partition}), slot({partitionKey: {...partition}}));
  assert.equal(cookieScopesOverlap(slot(), slot({partitionKey: partition})), false);
  assert.equal(cookieScopesOverlap(slot({partitionKey: partition}), slot({partitionKey: {...partition, hasCrossSiteAncestor: true}})), false);
});

test('missing or ambiguous Cookie scope conservatively conflicts, even with apparently different sites', () => {
  for (const uncertain of [null, {}, slot({storeId: undefined}), slot({hostOnly: undefined}),
    slot({partitionKey: undefined}), slot({partitionKey: {topLevelSite: 'https://top.example.test'}}),
    slot({partitionKey: {topLevelSite: 'https://top.example.test:7898', hasCrossSiteAncestor: false}}),
    slot({domain: 'a.example.test:7898'}), slot({domain: '.example.test', hostOnly: true}), slot({path: ''}),
    slot({name: 'bad=name'}), slot({domain: 'bad_domain.test'}), slot({path: '/bad;path'})])
    assert.equal(cookieScopesOverlap(uncertain, slot({domain: 'unrelated.test'})), true);
});

test('explicit unresolved browser context admits metadata without inventing Store or Partition isolation', () => {
  const unresolved = slot({storeId: null, partitionKey: 'unresolved'});
  const context = declarations(); context.site.cookieSlots = [unresolved];
  assert.doesNotThrow(() => validateDeclarations(context.site, context.source));
  const partition = {topLevelSite: 'https://top.example.test', hasCrossSiteAncestor: false};
  for (const known of [slot(), slot({storeId: 'another-store'}), slot({partitionKey: partition}), unresolved]) {
    assert.equal(cookieScopesOverlap(unresolved, known), true);
    assert.equal(cookieScopesOverlap(known, unresolved), true);
  }
  // Host/path evidence still proves unrelated targets disjoint; a fake Store is unnecessary.
  assert.equal(cookieScopesOverlap(unresolved, {...unresolved, domain: 'b.example.test'}), false);
  assert.equal(cookieScopesOverlap({...unresolved, path: '/one/'}, {...unresolved, path: '/two/'}), false);
  for (const mixed of [{storeId: null, partitionKey: null}, {storeId: TEST_STORE, partitionKey: 'unresolved'}]) {
    context.site.cookieSlots = [slot(mixed)];
    assert.throws(() => validateDeclarations(context.site, context.source));
    assert.equal(cookieScopesOverlap(slot(mixed), slot({domain: 'unrelated.test'})), true);
  }
});
