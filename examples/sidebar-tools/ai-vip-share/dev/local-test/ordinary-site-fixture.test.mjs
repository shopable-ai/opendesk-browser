/** Node HTTP service-contract tests only. Manually supplied Cookie headers do NOT
 * prove browser acceptance, SDK writes, site grants, Store/Partition, or Chrome login.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createOrdinarySiteFixture} from './ordinary-site-fixture.mjs';
import {validateDeclarations, validateAuthorization, createScopeKey, validateSessionResponse, createSourceClocks}
  from '../../src/session-context.js';

async function fixture(t, options) {
  const app = createOrdinarySiteFixture(options);
  t.after(() => app.close());
  const context = await app.listen();
  return {app, context, origin: context.source.serviceOrigin};
}
function request(url, {method = 'GET', headers = {}, data, raw} = {}) {
  const body = raw ?? (data === undefined ? undefined : JSON.stringify(data));
  return new Promise((resolve, reject) => {
    const req = http.request(url, {method, agent: false, headers: {
      ...(body !== undefined ? {'content-type': 'application/json', 'content-length': Buffer.byteLength(body)} : {}),
      ...headers
    }}, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        assert.equal(res.headers['set-cookie'], undefined, 'HTTP never installs Cookies');
        resolve({status: res.statusCode, headers: res.headers, text,
          json: res.headers['content-type']?.startsWith('application/json') ? JSON.parse(text) : null});
      });
    });
    req.on('error', reject);
    req.end(body);
  });
}
const apiHeaders = grant => ({'x-opendesk-local-test': '1', ...(grant ? {'x-ordinary-session-credential': grant.credential} : {})});
const intent = (grant, requestId = 'request-1') => ({requestId, subjectId: grant.authorization.subjectId,
  authorizationRevision: grant.authorization.authorizationRevision, targetUrl: grant.authorization.targetUrl,
  operationKind: 'setCookies'});
const deliver = (f, grant, data = intent(grant)) => request(`${f.origin}/api/session`, {
  method: 'POST', headers: apiHeaders(grant), data
});
const cookieHeader = delivery => delivery.cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
const page = (f, cookies) => request(f.context.site.targetUrl, {headers: cookies ? {cookie: cookies} : {}});
const validPage = response => assert.match(response.text, /data-session-state="valid"/);
const loggedOut = response => assert.match(response.text, /data-session-state="not-logged-in"/);
const receipt = ({serverNow: _sample, ...stable}) => stable;
// Boolean assertions keep a failed comparison from printing secret payloads in TAP.
const sameReceipt = (left, right) => assert.ok(JSON.stringify(receipt(left)) === JSON.stringify(receipt(right)),
  'same scoped delivery receipt (secret payload omitted)');

for (const host of ['localhost', '127.0.0.1']) {
  test(`${host}: actual random listener, explicit ordinary declarations, owner-authorized HTTP delivery`, async t => {
    const f = await fixture(t, {host});
    assert.equal(new URL(f.context.site.targetUrl).hostname, host);
    assert.notEqual(new URL(f.origin).port, '7898');
    const health = await request(`${f.origin}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(health.json.site, f.context.site);
    assert.equal(f.context.source.policy, 'ordinary');
    assert.deepEqual(Object.keys(f.context.site).sort(), ['siteId', 'label', 'targetUrl', 'sourceIds',
      'policyVersion', 'verification', 'cookieSlots'].sort());
    assert.deepEqual(Object.keys(f.context.source).sort(), ['sourceId', 'serviceOrigin', 'serviceRevision',
      'policy', 'endpoints', 'operationKinds', 'maxAuthorizationMs', 'maxDeliveryMs'].sort());
    for (const slot of f.context.site.cookieSlots) {
      assert.equal(slot.domain, host); assert.equal(slot.hostOnly, true);
    }
    const grant = f.app.authorize();
    const auth = await request(f.context.source.endpoints.authorization, {headers: apiHeaders(grant)});
    assert.equal(auth.status, 200);
    assert.deepEqual(auth.json.authorization, grant.authorization);
    assert.ok(Number.isSafeInteger(auth.json.serverNow));
    const result = await deliver(f, grant);
    assert.equal(result.status, 200);
    const {metadata: session, authorization, cookieDelivery} = result.json;
    const validated = validateDeclarations(f.context.site, f.context.source);
    validateAuthorization(validated, auth.json.authorization, auth.json.serverNow);
    assert.equal(createScopeKey(validated, authorization, 'setCookies', result.json.serverNow), session.scopeKey);
    validateSessionResponse(validated, authorization, session, {
      requestId: 'request-1', operationKind: 'setCookies', now: result.json.serverNow
    });
    assert.ok(validated.site.cookieSlots.every(slot => slot.storeId === null && slot.partitionKey === 'unresolved'));
    assert.ok(cookieDelivery.cookies.every(cookie => !Object.hasOwn(cookie, 'storeId') &&
      !Object.hasOwn(cookie, 'partitionKey')));
    assert.deepEqual(Object.keys(authorization).sort(), ['sourceId', 'serviceOrigin', 'serviceRevision',
      'siteId', 'subjectId', 'authorizationRevision', 'policy', 'policyVersion', 'targetUrl',
      'operationKinds', 'authorized', 'issuedAt', 'expiresAt'].sort());
    assert.deepEqual(Object.keys(session).sort(), ['deliveryId', 'requestId', 'scopeKey', 'serviceRevision',
      'policyVersion', 'issuedAt', 'expiresAt'].sort());
    assert.deepEqual(JSON.parse(session.scopeKey), [authorization.sourceId, f.origin, authorization.siteId,
      authorization.subjectId, authorization.authorizationRevision, 'setCookies', authorization.targetUrl,
      ['ordinary', 'no-assignment']]);
    assert.equal(cookieDelivery.targetUrl, f.context.site.targetUrl);
    assert.equal(cookieDelivery.deliveryId, session.deliveryId);
    assert.equal(cookieDelivery.expiresAt, session.expiresAt);
    assert.ok(session.expiresAt <= authorization.expiresAt);
    const target = await page(f, cookieHeader(cookieDelivery));
    validPage(target);
    assert.match(target.text, /o\*\*\*@fixture.test/);
    for (const cookie of cookieDelivery.cookies) assert.ok(!target.text.includes(cookie.value));
    assert.ok(!target.text.includes(grant.credential));
    // A read-only declaration/auth lookup never synthesizes a session Cookie.
    loggedOut(await page(f));
  });
}

test('no credential or wrong subject/revision/target/operation is refused without issuing a delivery', async t => {
  const f = await fixture(t);
  const grant = f.app.authorize();
  for (const headers of [apiHeaders(), apiHeaders({credential: 'Bearer ordinary-subject'})]) {
    const result = await request(`${f.origin}/api/session`, {method: 'POST', headers, data: intent(grant)});
    assert.equal(result.status, 403);
    assert.deepEqual(result.json, {error: 'E_AUTHORIZATION'});
  }
  const noAuth = await request(`${f.origin}/api/authorization`, {headers: apiHeaders()});
  assert.equal(noAuth.status, 403);
  for (const patch of [{subjectId: 'forged'}, {authorizationRevision: '0'},
    {targetUrl: `${f.origin}/other/`}, {operationKind: 'other'}]) {
    assert.equal((await deliver(f, grant, {...intent(grant), ...patch})).status, 403);
  }
  const ok = await deliver(f, grant);
  assert.equal(ok.status, 200, 'refused attempts did not reserve requestId');
  assert.equal((await request(`${f.origin}/api/authorize`, {method: 'POST', data: {subjectId: 'attacker'}})).status, 404);
});

test('only the fixed custom credential header authenticates; Authorization is rejected', async t => {
  const f = await fixture(t);
  const grant = f.app.authorize();
  for (const endpoint of ['authorization', 'session']) {
    const url = f.context.source.endpoints[endpoint];
    const options = endpoint === 'session' ? {method: 'POST', data: intent(grant)} : {};
    for (const headers of [apiHeaders(), apiHeaders({credential: 'Bearer invalid-custom-credential'})]) {
      const result = await request(url, {...options, headers});
      assert.equal(result.status, 403);
      assert.deepEqual(result.json, {error: 'E_AUTHORIZATION'});
    }
    for (const headers of [
      {'x-opendesk-local-test': '1', Authorization: grant.credential},
      {...apiHeaders(grant), Authorization: grant.credential}
    ]) {
      const result = await request(url, {...options, headers});
      assert.equal(result.status, 400);
      assert.deepEqual(result.json, {error: 'E_HEADERS'});
      assert.ok(!result.text.includes(grant.credential), 'error omits credential');
    }
    assert.equal((await request(url, {...options, headers: apiHeaders(grant)})).status, 200);
  }
  f.app.revoke(grant.authorization.subjectId);
  assert.equal((await request(f.context.source.endpoints.authorization, {headers: apiHeaders(grant)})).status, 403);
  assert.equal((await deliver(f, grant, intent(grant, 'after-revoke'))).status, 403);
});

test('POST idempotency binds request, real subject, generation and exact target', async t => {
  const f = await fixture(t);
  const firstGrant = f.app.authorize();
  const [a, b] = await Promise.all([deliver(f, firstGrant), deliver(f, firstGrant)]);
  assert.equal(a.status, 200); sameReceipt(b.json, a.json);
  const otherSubject = f.app.authorize({subjectId: 'other-subject'});
  assert.equal((await deliver(f, otherSubject)).status, 409);
  const freshGrant = f.app.authorize();
  assert.notEqual(freshGrant.authorization.authorizationRevision, firstGrant.authorization.authorizationRevision);
  assert.equal((await deliver(f, firstGrant)).status, 403);
  loggedOut(await page(f, cookieHeader(a.json.cookieDelivery)));
  assert.equal((await deliver(f, freshGrant)).status, 409);
  assert.equal((await deliver(f, freshGrant, intent(freshGrant, 'fresh-request'))).status, 200);
});

test('two real Hosts deliberately share account/delivery/request IDs but never credentials, Cookies or ledger', async t => {
  const a = await fixture(t, {host: 'localhost', accountId: 'same-account', fixedDeliveryId: 'same-delivery'});
  const b = await fixture(t, {host: '127.0.0.1', accountId: 'same-account', fixedDeliveryId: 'same-delivery'});
  const ga = a.app.authorize(), gb = b.app.authorize();
  const da = (await deliver(a, ga)).json, db = (await deliver(b, gb)).json;
  assert.equal(da.accountId, db.accountId);
  assert.equal(da.metadata.deliveryId, db.metadata.deliveryId);
  assert.equal(da.metadata.requestId, db.metadata.requestId);
  assert.notEqual(da.metadata.scopeKey, db.metadata.scopeKey);
  assert.equal((await deliver(b, ga, intent(gb))).status, 403);
  loggedOut(await page(a, cookieHeader(db.cookieDelivery)));
  loggedOut(await page(b, cookieHeader(da.cookieDelivery)));
  validPage(await page(a, cookieHeader(da.cookieDelivery)));
  validPage(await page(b, cookieHeader(db.cookieDelivery)));
  a.app.revoke(ga.authorization.subjectId);
  sameReceipt((await deliver(b, gb)).json, db);
  validPage(await page(b, cookieHeader(db.cookieDelivery)));
});

test('target parses full exact Cookie pairs from one delivery; malformed, mixed and duplicate pairs fail', async t => {
  const f = await fixture(t);
  const g = f.app.authorize();
  const a = (await deliver(f, g)).json.cookieDelivery;
  const b = (await deliver(f, g, intent(g, 'request-2'))).json.cookieDelivery;
  const [one, two] = a.cookies;
  for (const header of [`${one.name}=${one.value}`, `${two.name}=${two.value}`,
    `${one.name}=${one.value}; ${two.name}=${b.cookies[1].value}`,
    `${cookieHeader(a)}; ${one.name}=${one.value}`,
    `${one.name}x=${one.value}; ${two.name}=${two.value}`, `${cookieHeader(a)}; broken`,
    `${one.name}=${one.value}=suffix; ${two.name}=${two.value}`]) loggedOut(await page(f, header));
  validPage(await page(f, `${two.name}=${two.value}; ${one.name}=${one.value}`));
});

test('delivery deadline forbids new delivery replay but does not fake installed-Cookie expiry; revoke and auth expiry end login', async t => {
  let now = 1800000000000;
  const f = await fixture(t, {now: () => now});
  const g = f.app.authorize();
  const result = (await deliver(f, g)).json;
  assert.equal(result.metadata.expiresAt - now, 120000);
  assert.equal(g.authorization.expiresAt - now, 3600000);
  assert.ok(result.cookieDelivery.cookies.every(cookie => cookie.expirationDate * 1000 - now === 3600000));
  now += 1000;
  const replay = (await deliver(f, g)).json;
  assert.equal(replay.serverNow, now);
  sameReceipt(replay, result);
  now = result.metadata.expiresAt;
  assert.equal((await deliver(f, g)).status, 409);
  validPage(await page(f, cookieHeader(result.cookieDelivery)));
  now = g.authorization.expiresAt - 1;
  validPage(await page(f, cookieHeader(result.cookieDelivery)));
  f.app.revoke(g.authorization.subjectId);
  loggedOut(await page(f, cookieHeader(result.cookieDelivery)));
  assert.equal((await deliver(f, g, intent(g, 'new-request'))).status, 403);
  const renewed = f.app.authorize({expiresAt: now + 1000});
  const next = (await deliver(f, renewed, intent(renewed, 'renewed'))).json;
  now += 1000;
  loggedOut(await page(f, cookieHeader(next.cookieDelivery)));
  assert.equal((await request(`${f.origin}/api/authorization`, {headers: apiHeaders(renewed)})).status, 403);
});

test('strict HTTP Host/Origin/header/body/route guards and secret-free errors', async t => {
  const ext = `chrome-extension://${'a'.repeat(32)}`;
  const f = await fixture(t, {extensionOrigin: ext});
  const g = f.app.authorize();
  for (const headers of [{host: 'evil.test'}, {host: `localhost:${new URL(f.origin).port}`},
    {origin: 'null'}, {origin: 'https://evil.test'}, {'x-forwarded-host': 'evil.test'},
    {'x-arbitrary-header': '1'}, {'x-ordinary-session-credential': [g.credential, g.credential]}]) {
    const r = await request(`${f.origin}/api/authorization`, {headers: {...apiHeaders(g), ...headers}});
    assert.ok([400, 403].includes(r.status));
    assert.ok(!r.text.includes(g.credential));
  }
  assert.equal((await request(`${f.origin}/api/authorization`, {headers: {...apiHeaders(g), origin: ext}})).status, 200);
  assert.equal((await request(`${f.origin}/api/authorization`, {headers: {'x-ordinary-session-credential': g.credential, origin: ext}})).status, 403);
  const defaultOrigin = await fixture(t);
  assert.equal((await request(`${defaultOrigin.origin}/health`, {headers: {origin: ext}})).status, 403);
  for (const raw of ['{bad', '[]', JSON.stringify({...intent(g), requiresMembership: false}),
    JSON.stringify({...intent(g), requestId: 'x'.repeat(129)})]) {
    assert.equal((await request(`${f.origin}/api/session`, {method: 'POST', headers: apiHeaders(g), raw})).status, 400);
  }
  assert.equal((await request(`${f.origin}/api/session`, {method: 'POST', headers: apiHeaders(g), raw: 'x'.repeat(4097)})).status, 413);
  assert.equal((await request(`${f.origin}/api/session`, {method: 'POST', headers: {...apiHeaders(g),
    'content-type': 'text/plain'}, data: intent(g)})).status, 400);
  assert.equal((await request(`${f.origin}/health`, {headers: {'user-agent': 'x'.repeat(9000)}})).status, 400);
  for (const path of ['/api/session?target=evil', '/session/?cookie=secret', '/api/member', '/proxy.pac', '/api/redeem']) {
    assert.equal((await request(`${f.origin}${path}`)).status, 404);
  }
});

test('Cookie expiry ends target session even while source authorization stays valid', async t => {
  let now = 1800000000000;
  const f = await fixture(t, {now: () => now, cookieLifetimeMs: 1000});
  const g = f.app.authorize({expiresAt: now + 60000});
  const delivery = (await deliver(f, g)).json.cookieDelivery;
  validPage(await page(f, cookieHeader(delivery)));
  now += 1000;
  loggedOut(await page(f, cookieHeader(delivery)));
  assert.equal((await request(`${f.origin}/api/authorization`, {headers: apiHeaders(g)})).status, 200);
  assert.equal((await deliver(f, g)).status, 409, 'never return expired Cookies from a receipt');
});

test('each service samples its own clock and rejects another service authorization metadata', async t => {
  let timeA = 1800000000000, timeB = 1900000000000;
  const a = await fixture(t, {now: () => timeA});
  const b = await fixture(t, {now: () => timeB});
  const ga = a.app.authorize(), gb = b.app.authorize();
  const clocks = createSourceClocks(() => 100);
  const ticketA = clocks.begin(a.context.source), ticketB = clocks.begin(b.context.source);
  timeA += 1000; timeB += 2000;
  const sa = await request(a.context.source.endpoints.authorization, {headers: apiHeaders(ga)});
  const sb = await request(b.context.source.endpoints.authorization, {headers: apiHeaders(gb)});
  assert.equal(sa.json.serverNow, timeA); assert.equal(sb.json.serverNow, timeB);
  clocks.sample(a.context.source, ticketA, sa.json.serverNow);
  clocks.sample(b.context.source, ticketB, sb.json.serverNow);
  assert.equal(clocks.now(a.context.source), timeA);
  assert.equal(clocks.now(b.context.source), timeB);
  validateAuthorization(a.context, sa.json.authorization, sa.json.serverNow);
  validateAuthorization(b.context, sb.json.authorization, sb.json.serverNow);
  assert.throws(() => validateAuthorization(b.context, sa.json.authorization, sb.json.serverNow));
});

test('revocation during a partially received body is rechecked before delivery', async t => {
  const f = await fixture(t);
  const g = f.app.authorize();
  const body = JSON.stringify(intent(g));
  const status = await new Promise((resolve, reject) => {
    const req = http.request(`${f.origin}/api/session`, {method: 'POST', agent: false,
      headers: {...apiHeaders(g), 'content-type': 'application/json', 'content-length': Buffer.byteLength(body)}
    }, res => {
      assert.equal(res.headers['set-cookie'], undefined);
      res.resume(); res.on('end', () => resolve(res.statusCode));
    });
    req.on('error', reject);
    req.flushHeaders();
    req.write(body.slice(0, 1), () => {
      f.app.revoke(g.authorization.subjectId);
      req.end(body.slice(1));
    });
  });
  assert.equal(status, 403);
});

test('close during listener startup cleans its owned socket without leaking a service', async () => {
  const app = createOrdinarySiteFixture({host: 'localhost'});
  const listening = app.listen();
  const result = Promise.allSettled([listening, app.close()]);
  const [start, close] = await result;
  assert.equal(start.status, 'rejected');
  assert.equal(close.status, 'fulfilled');
  await app.close();
  assert.throws(() => app.declarations());
});

test('bounded private ledger, explicit close and no reuse of closed fixture', async t => {
  const f = await fixture(t);
  const g = f.app.authorize();
  for (let i = 0; i < 128; i++) assert.equal((await deliver(f, g, intent(g, `request-${i}`))).status, 200);
  assert.equal((await deliver(f, g, intent(g, 'over-budget'))).status, 429);
  assert.equal((await deliver(f, g)).status, 200, 'existing idempotent receipt survives budget');
  await f.app.close();
  await assert.rejects(request(`${f.origin}/health`));
  await assert.rejects(f.app.listen());
  assert.throws(() => f.app.authorize());
  for (const options of [{host: '0.0.0.0'}, {host: '::'}, {extensionOrigin: '*'}, {accountId: '<script>'},
    {cookieLifetimeMs: 0}, {cookieLifetimeMs: 3600001}]) {
    assert.throws(() => createOrdinarySiteFixture(options));
  }
});


test('port accepts 0..65535 integers only, with fixed Host/port declarations', async t => {
  for (const port of [-1, 65536, 1.5, NaN, Infinity, '7901', null]) {
    assert.throws(() => createOrdinarySiteFixture({port}));
  }
  // Validate intended owner options without starting either fixed service.
  for (const options of [{host: 'localhost', port: 7901}, {host: '127.0.0.1', port: 7902}, {port: 65535}]) {
    await createOrdinarySiteFixture(options).close();
  }
  for (const host of ['localhost', '127.0.0.1']) {
    const probe = http.createServer();
    await new Promise((resolve, reject) => { probe.once('error', reject); probe.listen({host, port: 0}, resolve); });
    const port = probe.address().port;
    await new Promise((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
    const f = await fixture(t, {host, port});
    assert.equal(f.origin, `http://${host}:${port}`);
    assert.equal((await request(`${f.origin}/health`)).status, 200);
    const alias = host === 'localhost' ? '127.0.0.1' : 'localhost';
    assert.equal((await request(`${f.origin}/health`, {headers: {host: `${alias}:${port}`}})).status, 403);
  }
  const random = await fixture(t, {port: 0});
  assert.ok(Number(new URL(random.origin).port) > 0);
});

test('observations count API attempts and valid target visits without retaining secrets', async t => {
  const f = await fixture(t);
  assert.deepEqual(f.app.observations(), {requests: [], authorizationRequests: 0, sessionRequests: 0, validTargetVisits: 0});
  const grant = f.app.authorize({subjectId: 'private-subject-marker'});
  await request(f.context.source.endpoints.authorization, {headers: apiHeaders()});
  await request(f.context.source.endpoints.authorization, {headers: apiHeaders(grant)});
  await request(`${f.origin}/api/session`, {method: 'POST', headers: apiHeaders(), data: intent(grant)});
  const delivery = (await deliver(f, grant)).json.cookieDelivery;
  loggedOut(await page(f));
  validPage(await page(f, cookieHeader(delivery)));
  f.app.revoke(grant.authorization.subjectId);
  loggedOut(await page(f, cookieHeader(delivery)));
  await request(`${f.origin}/private-subject-marker?credential=query-secret-marker`);
  await request(`${f.origin}/api/session?cookie=query-cookie-marker`);
  assert.equal((await request(`${f.origin}/api/authorize`, {method: 'POST', data: {subjectId: 'private-subject-marker'}})).status, 404);
  const snapshot = f.app.observations();
  assert.deepEqual(snapshot, {
    requests: [
      {method: 'GET', path: '/api/authorization', count: 2},
      {method: 'POST', path: '/api/session', count: 2},
      {method: 'GET', path: '/session/', count: 3},
      {method: 'GET', path: 'OTHER', count: 2},
      {method: 'POST', path: 'OTHER', count: 1}
    ], authorizationRequests: 2, sessionRequests: 2, validTargetVisits: 1
  });
  const serialized = JSON.stringify(snapshot);
  for (const secret of [grant.credential, grant.authorization.subjectId, 'query-secret-marker',
    'query-cookie-marker', ...delivery.cookies.map(cookie => cookie.value)]) {
    assert.ok(!serialized.includes(secret), 'observation snapshot excludes sensitive input');
  }
  snapshot.requests[0].count = 999;
  snapshot.requests.push({method: 'GET', path: '/forged', count: 1});
  snapshot.validTargetVisits = 999;
  assert.equal(f.app.observations().requests[0].count, 2);
  assert.equal(f.app.observations().requests.length, 5);
  assert.equal(f.app.observations().validTargetVisits, 1);
  const other = await fixture(t);
  assert.deepEqual(other.app.observations().requests, []);
});
