/** Loopback HTTP service-contract fixture only. SOURCE_NOT_WIRED / CHROME_NOT_TESTED.
 * No CLI/autostart, remote dependencies, commercial model, or HTTP Set-Cookie.
 * authorize() is an in-process owner action, never a public HTTP endpoint. Its bearer
 * credential proves the controlled subject; a caller-supplied subjectId alone does not.
 * Owners may supply disposable synthetic test bearers; never use production credentials.
 * Secrets exist only in private memory and authenticated delivery responses. Bearers
 * belong only in the test process/short-lived controller memory, never React/storage.
 * Never log credentials or deliveries. close() destroys the ledger; not durable recovery.
 * GET /api/authorization -> {authorization, serverNow}; POST /api/session takes exactly
 * {requestId, subjectId, authorizationRevision, targetUrl, operationKind:'setCookies'}.
 * Both require X-OpenDesk-Local-Test: 1 and the owner-issued X-Ordinary-Session-Credential (opaque Bearer value).
 * Validate response.authorization and response.metadata separately with session-context;
 * response.cookieDelivery is secret payload for the original SDK, never metadata/UI state.
 */
import http from 'node:http';
import {randomUUID} from 'node:crypto';

const MAX_BODY = 4096, MAX_HEADERS = 8192, MAX_ROWS = 128;
const MAX_AUTH_MS = 3600000, MAX_DELIVERY_MS = 120000;
const NAMES = ['ordinary_fixture_session', 'ordinary_fixture_context'];
const OPERATION = 'setCookies';
const id = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value);
const time = value => Number.isSafeInteger(value) && value >= 0;
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const fail = (status, code) => Object.assign(new Error(code), {status, code});

async function readBody(req) {
  let size = 0;
  const parts = [];
  for await (const part of req) {
    size += part.length;
    if (size > MAX_BODY) throw fail(413, 'E_BODY_BUDGET');
    parts.push(part);
  }
  try { return JSON.parse(Buffer.concat(parts).toString('utf8')); }
  catch { throw fail(400, 'E_JSON'); }
}
function reply(res, status, data, html = false) {
  res.writeHead(status, {
    'Content-Type': html ? 'text/html; charset=utf-8' : 'application/json; charset=utf-8',
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'"
  });
  res.end(html ? data : JSON.stringify(data));
}
function cookiePairs(header = '') {
  const pairs = new Map();
  for (const part of header.split(';')) {
    const pair = part.trim(), split = pair.indexOf('=');
    if (split <= 0) return null;
    const name = pair.slice(0, split), value = pair.slice(split + 1);
    if (!/^[a-zA-Z0-9_-]+$/.test(name) || pairs.has(name)) return null;
    pairs.set(name, value);
  }
  return pairs;
}

/** host is fixed for this instance; listen() uses the requested port (0 by default) and exact host.
 * localhost may resolve to IPv4 or IPv6. No Host alias is admitted, even on loopback.
 * fixedDeliveryId/accountId permit deliberate same-ID tests across private instances.
 * now is injectable for deterministic deadline tests. Declarations explicitly leave browser
 * Store/Partition unresolved; this HTTP service cannot establish the browser's context or grant.
 */
export function createOrdinarySiteFixture({host = '127.0.0.1', port = 0, now = Date.now,
  extensionOrigin = null, accountId = 'ordinary-account', fixedDeliveryId = null,
  cookieLifetimeMs = MAX_AUTH_MS} = {}) {
  if (!Number.isInteger(port) || port < 0 || port > 65535 ||
    !['localhost', '127.0.0.1'].includes(host) || typeof now !== 'function' || !id(accountId) ||
    (fixedDeliveryId !== null && !id(fixedDeliveryId)) ||
    !Number.isSafeInteger(cookieLifetimeMs) || cookieLifetimeMs < 1 || cookieLifetimeMs > MAX_AUTH_MS ||
    (extensionOrigin !== null && !/^chrome-extension:\/\/[a-p]{32}$/.test(extensionOrigin)))
    throw Error('Invalid ordinary fixture options');
  const grants = new Map(), subjects = new Map(), requests = new Map();
  const requestCounts = new Map();
  let authorizationRequests = 0, sessionRequests = 0, validTargetVisits = 0;
  // Count API attempts, including refusals; only verified target visits count as valid.
  // Fixed buckets never retain raw URLs/query strings, arbitrary methods, headers or bodies.
  function observeRequest(req) {
    const method = ['GET', 'POST'].includes(req.method) ? req.method : 'OTHER';
    const path = ['/health', '/api/authorization', '/api/session', '/session/'].includes(req.url) ? req.url : 'OTHER';
    const key = `${method} ${path}`;
    requestCounts.set(key, (requestCounts.get(key) ?? 0) + 1);
    if (method === 'GET' && path === '/api/authorization') authorizationRequests++;
    if (method === 'POST' && path === '/api/session') sessionRequests++;
  }
  let origin = null, closed = false, generation = 0, starting = false, pendingListen = null;
  const clock = () => {
    const value = now();
    if (!time(value)) throw fail(500, 'E_CLOCK');
    return value;
  };
  function declarations() {
    if (!origin || closed) throw Error('Fixture is not listening');
    return {
      site: {siteId: 'ordinary-workspace', label: '普通工作台', targetUrl: `${origin}/session/`,
        sourceIds: ['ordinary-controlled-source'], policyVersion: '1', verification: 'controlled-target-page',
        cookieSlots: NAMES.map(name => ({name, domain: host, hostOnly: true, path: '/session/',
          storeId: null, partitionKey: 'unresolved', secure: false, httpOnly: true, sameSite: 'lax'}))},
      source: {sourceId: 'ordinary-controlled-source', serviceOrigin: origin, serviceRevision: '1',
        policy: 'ordinary', endpoints: {authorization: `${origin}/api/authorization`, session: `${origin}/api/session`},
        operationKinds: [OPERATION], maxAuthorizationMs: MAX_AUTH_MS, maxDeliveryMs: MAX_DELIVERY_MS}
    };
  }
  function active(grant, currentTime) {
    return grant && !grant.revoked && subjects.get(grant.subjectId) === grant &&
      grant.issuedAt <= currentTime && currentTime < grant.expiresAt;
  }
  function authorization(grant) {
    const {site, source} = declarations();
    return {sourceId: source.sourceId, serviceOrigin: origin, serviceRevision: source.serviceRevision,
      siteId: site.siteId, subjectId: grant.subjectId, authorizationRevision: grant.revision,
      policy: source.policy, policyVersion: site.policyVersion, targetUrl: site.targetUrl,
      operationKinds: [OPERATION], authorized: true, issuedAt: grant.issuedAt, expiresAt: grant.expiresAt};
  }
  const server = http.createServer({maxHeaderSize: MAX_HEADERS, requestTimeout: 5000,
    headersTimeout: 5000, keepAliveTimeout: 1000}, async (req, res) => {
    observeRequest(req);
    try {
      // Header names are allowlisted, duplicate singleton fields refused. Neither
      // Forwarded nor X-Forwarded-Host may redefine the actual listener's identity.
      const allowed = new Set(['host', 'connection', 'accept', 'accept-encoding', 'accept-language',
        'user-agent', 'origin', 'referer', 'cookie', 'x-ordinary-session-credential', 'content-type', 'content-length',
        'x-opendesk-local-test', 'sec-fetch-site', 'sec-fetch-mode', 'sec-fetch-dest',
        'sec-fetch-user', 'upgrade-insecure-requests', 'cache-control', 'pragma', 'dnt',
        'sec-ch-ua', 'sec-ch-ua-mobile', 'sec-ch-ua-platform']);
      const seen = new Set();
      for (let i = 0; i < req.rawHeaders.length; i += 2) {
        const name = req.rawHeaders[i].toLowerCase();
        if (!allowed.has(name) || seen.has(name)) throw fail(400, 'E_HEADERS');
        seen.add(name);
      }
      if (!origin || closed || req.headers.host !== new URL(origin).host) throw fail(403, 'E_HOST');
      const path = req.url;
      const api = path === '/api/authorization' || path === '/api/session';
      if (req.headers.origin !== undefined && !(req.headers.origin === origin ||
        (api && extensionOrigin !== null && req.headers.origin === extensionOrigin &&
          req.headers['x-opendesk-local-test'] === '1'))) throw fail(403, 'E_ORIGIN');
      const length = req.headers['content-length'];
      if (length !== undefined && (!/^\d+$/.test(length) || Number(length) > MAX_BODY))
        throw fail(413, 'E_BODY_BUDGET');
      if (req.method === 'GET' && length !== undefined && Number(length) !== 0) throw fail(400, 'E_BODY');
      if (req.method === 'GET' && path === '/health') {
        reply(res, 200, {ok: true, mode: 'ORDINARY_LOCAL_FIXTURE_NOT_PRODUCTION', ...declarations()});
        return;
      }
      if (req.method === 'GET' && path === '/session/') {
        const pairs = cookiePairs(req.headers.cookie), currentTime = clock();
        const row = pairs && [...requests.values()].find(row => active(row.grant, currentTime) &&
          row.cookieExpiresAt > currentTime && row.cookieDelivery.cookies.every(cookie => pairs.get(cookie.name) === cookie.value));
        if (row) validTargetVisits++;
        // Static masked identity, never subject/account input or Cookie values in HTML.
        reply(res, 200, '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><body>' +
          (row ? '<p data-session-state="valid">受控会话有效</p><p data-identity="ordinary">o***@fixture.test</p>' :
            '<p data-session-state="not-logged-in">未登录</p>') + '</body></html>', true);
        return;
      }
      if (!api || !((req.method === 'GET' && path === '/api/authorization') ||
        (req.method === 'POST' && path === '/api/session'))) throw fail(404, 'E_ROUTE');
      if (req.headers['x-opendesk-local-test'] !== '1') throw fail(403, 'E_LOCAL_TEST_HEADER');
      const bearer = req.headers['x-ordinary-session-credential'];
      const grant = typeof bearer === 'string' && grants.get(bearer);
      const currentTime = clock();
      if (!active(grant, currentTime)) throw fail(403, 'E_AUTHORIZATION');
      if (req.method === 'GET') { reply(res, 200, {authorization: authorization(grant), serverNow: currentTime}); return; }
      if (req.headers['content-type'] !== 'application/json' || length === undefined) throw fail(400, 'E_CONTENT_TYPE_OR_LENGTH');
      const data = await readBody(req);
      if (!exact(data, ['requestId', 'subjectId', 'authorizationRevision', 'targetUrl', 'operationKind']) ||
        !id(data.requestId)) throw fail(400, 'E_SESSION_REQUEST');
      // Recheck after the asynchronous body read: in-process revoke/reauthorize may run meanwhile.
      const issuedAt = clock();
      if (!active(grant, issuedAt)) throw fail(403, 'E_AUTHORIZATION');
      const auth = authorization(grant);
      if (data.subjectId !== auth.subjectId || data.authorizationRevision !== auth.authorizationRevision ||
        data.targetUrl !== auth.targetUrl || data.operationKind !== OPERATION) throw fail(403, 'E_SCOPE');
      const scopeKey = JSON.stringify([auth.sourceId, origin, auth.siteId, auth.subjectId,
        auth.authorizationRevision, OPERATION, auth.targetUrl, ['ordinary', 'no-assignment']]);
      const previous = requests.get(data.requestId);
      if (previous && previous.response.metadata.scopeKey !== scopeKey) throw fail(409, 'E_IDEMPOTENCY_CONFLICT');
      if (previous && previous.response.metadata.expiresAt <= issuedAt) throw fail(409, 'E_DELIVERY_EXPIRED');
      if (previous) { reply(res, 200, {...previous.response, serverNow: issuedAt}); return; }
      if (requests.size >= MAX_ROWS) throw fail(429, 'E_LEDGER_BUDGET');
      const deliveryId = fixedDeliveryId ?? randomUUID();
      const cookieExpiresAt = Math.min(issuedAt + cookieLifetimeMs, grant.expiresAt);
      const expiresAt = Math.min(issuedAt + MAX_DELIVERY_MS, cookieExpiresAt);
      const cookieDelivery = {schemaVersion: 1, deliveryId, targetUrl: auth.targetUrl, expiresAt,
        cookies: NAMES.map(name => ({name, value: randomUUID(), path: '/session/', httpOnly: true,
          secure: false, sameSite: 'lax', expirationDate: cookieExpiresAt / 1000}))};
      const response = {schemaVersion: 1, serverNow: issuedAt, authorization: auth,
        metadata: {deliveryId, requestId: data.requestId, scopeKey, serviceRevision: auth.serviceRevision,
          policyVersion: auth.policyVersion, issuedAt, expiresAt},
        accountId, displayNameMasked: 'o***@fixture.test', cookieDelivery};
      requests.set(data.requestId, {grant, cookieExpiresAt, cookieDelivery, response});
      reply(res, 200, response);
    } catch (error) {
      if (!res.destroyed && !res.headersSent) reply(res, error.status ?? 500, {error: error.code ?? 'E_INTERNAL'});
      // Never echo request content, credentials, parser messages or Cookie values.
    }
  });
  server.maxConnections = 32;
  server.on('clientError', (_error, socket) => {
    socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
  });
  return {
    async listen() {
      if (starting || origin || closed) throw Error('Fixture cannot listen again');
      starting = true;
      try {
        pendingListen = new Promise((resolve, reject) => {
          const failed = error => { server.off('listening', ready); reject(error); };
          const ready = () => { server.off('error', failed); resolve(); };
          server.once('error', failed); server.once('listening', ready);
          server.listen({host, port});
        });
        await pendingListen;
        if (!['127.0.0.1', '::1'].includes(server.address().address)) {
          await new Promise(resolve => server.close(resolve));
          closed = true;
          throw Error('Listener must be loopback');
        }
        origin = `http://${host}:${server.address().port}`;
        return declarations();
      } finally { starting = false; }
    },
    declarations,
    // A detached, non-sensitive snapshot; no HTTP observation/authorization endpoint.
    observations() {
      return {requests: [...requestCounts].map(([key, count]) => {
        const [method, path] = key.split(' ');
        return {method, path, count};
      }), authorizationRequests, sessionRequests, validTargetVisits};
    },
    authorize({subjectId = 'ordinary-subject', expiresAt = clock() + MAX_AUTH_MS,
      credential = `Bearer ${randomUUID()}`} = {}) {
      declarations();
      const issuedAt = clock();
      if (!id(subjectId) || !time(expiresAt) || expiresAt <= issuedAt || expiresAt - issuedAt > MAX_AUTH_MS)
        throw Error('Invalid controlled authorization');
      if (typeof credential !== 'string' || !/^Bearer [A-Za-z0-9_-]{1,200}$/.test(credential))
        throw Error('Invalid controlled credential');
      // Retain old credentials until close(): never overwrite or rebind any generation.
      if (grants.has(credential)) throw Error('Controlled credential already used');
      if (grants.size >= MAX_ROWS) throw Error('Authorization budget exhausted');
      const grant = {subjectId, revision: String(++generation), issuedAt, expiresAt, revoked: false};
      subjects.set(subjectId, grant); grants.set(credential, grant);
      return {credential, authorization: authorization(grant)};
    },
    revoke(subjectId) {
      const grant = subjects.get(subjectId);
      if (grant) grant.revoked = true;
      return Boolean(grant);
    },
    async close() {
      closed = true;
      grants.clear(); subjects.clear(); requests.clear();
      if (pendingListen) await pendingListen.catch(() => {});
      if (server.listening) await new Promise((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve());
        server.closeAllConnections();
      });
    }
  };
}
