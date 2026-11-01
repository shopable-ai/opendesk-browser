import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { createLanActivationServer } from '../dev/local-test/lan-activation-server.mjs';
import { DEVELOPMENT_ACTIVATION_URLS } from '../src/activation-links.js';

const lan = DEVELOPMENT_ACTIVATION_URLS.find(rule => rule.origin === 'http://192.168.30.3:7899');
const code = 'Secret.Code_123-456';
async function fixture(t, options = {}) {
  const server = createLanActivationServer({ testOnlyEphemeralLoopback: true, ...options });
  server.listen();
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  assert.equal(server.address().address, '127.0.0.1');
  return (path, { method = 'GET', headers = {} } = {}) => new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port: server.address().port, path, method,
      headers: { Host: new URL(options.origin || lan.origin).host, ...headers } }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}
function secure(response) {
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(response.headers['referrer-policy'], 'no-referrer');
  assert.equal(response.headers['x-content-type-options'], 'nosniff');
  assert.equal(response.headers['x-frame-options'], 'DENY');
  for (const directive of ["default-src 'none'", "script-src 'none'", "connect-src 'none'", "form-action 'none'", "frame-ancestors 'none'", "base-uri 'none'"]) {
    assert.ok(response.headers['content-security-policy'].includes(directive));
  }
  assert.equal(response.headers['access-control-allow-origin'], undefined);
  assert.equal(response.headers['set-cookie'], undefined);
  assert.ok(!JSON.stringify(response).includes(code));
}

test('activation is a static guide to the installed sidebar, with restrictive headers', async t => {
  const request = await fixture(t);
  for (const value of [code, 'a'.repeat(6), 'z'.repeat(120)]) {
    const result = await request(`/activate?activation_code=${value}`);
    assert.equal(result.status, 200);
    secure(result);
    assert.match(result.body, /1\.4\.14/);
    assert.match(result.body, /侧栏/);
    assert.match(result.body, /活动状态/);
    assert.match(result.body, /预检激活/);
    assert.match(result.body, /确认激活/);
    assert.doesNotMatch(result.body, /<script|<form|<iframe|activation_code=/i);
  }
  for (const path of ['/', '/health']) {
    const result = await request(path);
    assert.equal(result.status, 200);
    secure(result);
    if (path === '/health') assert.deepEqual(JSON.parse(result.body), { app: 'AI VIP Share', protocol: 'http:', origin: lan.origin });
  }
});

test('reject malformed links, extra parameters, routes, API paths and methods without echoes', async t => {
  const request = await fixture(t);
  for (const query of ['', '?activation_code=', '?activation_code=short', `?activation_code=${'a'.repeat(121)}`,
    '?activation_code=abc%20def', '?activation_code=%3Cscript%3E', '?activation_code=abc%00def',
    `?activation_code=${encodeURIComponent('中文中文中文')}`, '?activation_code=abc%ZZ', `?activation_code=${code}&activation_code=abcdef`,
    `?activation_code=${code}&token=private`, '?code=abcdef']) {
    const result = await request(`/activate${query}`);
    assert.equal(result.status, 400, query);
    secure(result);
    assert.doesNotMatch(result.body, /private|<script|token=/);
  }
  for (const path of ['/api/member', '/api/cookie', '/proxy', '/members', '/cookies', '/activate/', '/%61ctivate', `/x?activation_code=${code}`]) {
    const result = await request(path);
    assert.equal(result.status, 404, path);
    secure(result);
  }
  for (const method of ['POST', 'PUT', 'DELETE', 'OPTIONS', 'HEAD']) {
    const result = await request(`/activate?activation_code=${code}`, { method });
    assert.equal(result.status, 405);
    secure(result);
  }
  assert.equal((await request(`/?activation_code=${code}`)).status, 400);
});

test('fixed Host and same-origin checks reject cross-origin requests without CORS', async t => {
  const request = await fixture(t);
  for (const headers of [{ Host: 'evil.example' }, { Host: '192.168.30.3:7900' }, { Host: '127.0.0.1:7898' },
    { Origin: 'https://evil.example' }, { Origin: 'null' }, { Origin: 'http://127.0.0.1:7898' }]) {
    const result = await request(`/activate?activation_code=${code}`, { headers });
    assert.equal(result.status, 403);
    secure(result);
  }
  assert.equal((await request('/health', { headers: { Origin: lan.origin } })).status, 200);
  assert.equal((await request(`http://evil.example/activate?activation_code=${code}`)).status, 400);
});

test('configuration permits only exact approved origins and forbids broad listen overrides', async t => {
  for (const origin of ['http://0.0.0.0:7899', 'http://8.8.8.8:7899', 'http://192.168.30.4:7899',
    'http://localhost:7898', `${lan.origin}/`, 'http://user:password@192.168.30.3:7899', 'https://192.168.30.3:7899']) {
    assert.throws(() => createLanActivationServer({ origin }), /Unapproved/);
  }
  const server = createLanActivationServer();
  assert.throws(() => server.listen(7899, '0.0.0.0'), /overrides/);
  assert.throws(() => server.listen({ host: '0.0.0.0', port: 0 }), /overrides/);
  const request = await fixture(t, { origin: DEVELOPMENT_ACTIVATION_URLS[0].origin });
  assert.equal((await request('/activate?activation_code=abcdef')).status, 200);
});
