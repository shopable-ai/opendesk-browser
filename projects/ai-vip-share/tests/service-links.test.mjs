import test from 'node:test';
import assert from 'node:assert/strict';
import { REVIEWED_SERVICE, validateServiceDefinition, parseServiceLink }
  from '../src/service-links.js';

const origin = 'https://members.example.com';
function fixture() {
  return {
    id: 'reviewed-service_1.0', label: '获审服务', url: `${origin}/portal`,
    endpoints: {
      member: `${origin}/api/member`, voucherPreview: `${origin}/api/preview`,
      voucherRedeem: `${origin}/api/redeem`, voucherStatus: `${origin}/api/status`
    },
    activation: { path: '/activate', parameter: 'activation_code' },
    cookieTargets: ['https://chat.example.com', 'https://chat.example.com/session'],
    catalogUrl: '', desktopClientUrl: ''
  };
}
function error(code, action) { assert.throws(action, { name: 'Error', code, message: code }); }

test('fixed declaration is canonical, detached and deeply frozen', () => {
  const raw = fixture();
  raw.catalogUrl = 'https://shop.example.net/products';
  raw.desktopClientUrl = 'https://downloads.example.net/client';
  const service = validateServiceDefinition(raw);
  assert.equal(service.cookieTargets[0], 'https://chat.example.com/');
  assert.equal(service.catalogUrl, raw.catalogUrl);
  assert.equal(service.desktopClientUrl, raw.desktopClientUrl);
  for (const value of [service, service.endpoints, service.activation, service.cookieTargets]) {
    assert.ok(Object.isFrozen(value));
  }
  raw.endpoints.member = 'https://evil.example.net/member';
  raw.cookieTargets.push('https://evil.example.net');
  assert.equal(service.endpoints.member, `${origin}/api/member`);
  assert.equal(service.cookieTargets.length, 2);
  assert.throws(() => { service.activation.path = '/other'; }, TypeError);
});

test('only the exact service page and fixed activation route are accepted', () => {
  const service = fixture();
  assert.deepEqual(parseServiceLink(`  ${service.url}  `, service), {
    service: validateServiceDefinition(service), code: null, kind: 'service'
  });
  for (const code of ['Abc_09-.', 'a'.repeat(6), 'Z'.repeat(120)]) {
    const result = parseServiceLink(`${origin}/activate?activation_code=${code}`, service);
    assert.equal(result.kind, 'activation');
    assert.equal(result.code, code);
    assert.deepEqual(result.service, validateServiceDefinition(service));
  }
  const root = fixture(); root.url = origin;
  assert.equal(parseServiceLink(`${origin}/`, root).kind, 'service');
});

test('production stays unconfigured, after input syntax is validated', () => {
  assert.equal(REVIEWED_SERVICE, null);
  for (const input of [origin, `${origin}/unknown`, `${origin}/activate?activation_code=abcdef`]) {
    error('E_SERVICE_NOT_CONFIGURED', () => parseServiceLink(input));
  }
  error('E_SERVICE_LINK', () => parseServiceLink('not a URL'));
  error('E_SERVICE_LINK', () => parseServiceLink(`${origin}/?token=secret`));
});

const unsafeUrls = [
  '', 'example.com', '//example.com', 'http://example.com', 'javascript:alert(1)',
  'https:example.com', 'https:///example.com', 'https://user:pass@example.com',
  'https://@example.com', 'https://example.com:443', 'https://example.com:8443',
  'https://127.0.0.1', 'https://127.1', 'https://2130706433', 'https://0x7f000001',
  'https://[::1]', 'https://192.168.1.1', 'https://10.0.0.1', 'https://169.254.169.254',
  'https://localhost', 'https://service.localhost', 'https://service.local',
  'https://service.internal', 'https://service.lan', 'https://service.home.arpa',
  'https://service', 'https://example.com.', 'https://-bad.example.com',
  'https://example.com/#', 'https://example.com/#fragment',
  'https://example.com/a/../portal', 'https://example.com/./portal',
  'https://example.com/%2e%2e/portal', 'https://example.com/%2Fportal',
  'https://example.com//portal', 'https://example.com/por%74al',
  'https://%65xample.com/portal', 'https://example.com\\portal',
  'https://exam\tple.com/portal', 'https://example.com/\u007f',
  'https://example.com/\u0085', 'https://example.com/has space',
  '\nhttps://example.com', 'https://example.com\n', `https://example.com/${'x'.repeat(2048)}`
];

test('unsafe URLs are rejected in input and every fixed URL field', () => {
  for (const value of unsafeUrls) {
    error('E_SERVICE_LINK', () => parseServiceLink(value, fixture()));
    error('E_SERVICE_LINK', () => parseServiceLink(value));
    for (const key of ['url', 'catalogUrl', 'desktopClientUrl', 'cookieTargets', 'endpoints']) {
      if (value === '' && ['catalogUrl', 'desktopClientUrl'].includes(key)) continue;
      const raw = fixture();
      if (key === 'cookieTargets') raw.cookieTargets = [value];
      else if (key === 'endpoints') raw.endpoints.member = value;
      else raw[key] = value;
      error('E_SERVICE_CONFIG', () => validateServiceDefinition(raw));
    }
  }
});

test('query syntax cannot smuggle credentials, extra parameters or encoded variants', () => {
  for (const query of ['?', '?activation_code=', '?activation_code=short',
    `?activation_code=${'a'.repeat(121)}`, '?activation_code=abc%64ef',
    '?activation%5fcode=abcdef', '?activation_code=abcdef&activation_code=ghijkl',
    '?activation_code=abcdef&', '?activation_code=abcdef&token=secret',
    '?activation_code=abc+def', '?activation_code=abc/def', '?token=abcdef',
    '?Activation_code=abcdef', '?activation_code=abcdef#']) {
    error('E_SERVICE_LINK', () => parseServiceLink(`${origin}/activate${query}`, fixture()));
    error('E_SERVICE_LINK', () => parseServiceLink(`${origin}/activate${query}`));
  }
});

test('valid but unreviewed origins and routes cannot select a service', () => {
  for (const input of ['https://evil.example.com/portal', `${origin}/portal/`,
    `${origin}/Portal`, `${origin}/activate`, `${origin}/api/member`,
    `${origin}/portal?activation_code=abcdef`,
    'https://evil.example.com/activate?activation_code=abcdef',
    `${origin}/activate/extra?activation_code=abcdef`]) {
    error('E_SERVICE_UNSUPPORTED', () => parseServiceLink(input, fixture()));
  }
});

test('schema rejects dynamic fields, scripts, accessors and invalid metadata', () => {
  const mutations = [
    raw => { raw.id = ''; }, raw => { raw.id = 'a'.repeat(81); },
    raw => { raw.id = 'service/id'; }, raw => { raw.label = ''; },
    raw => { raw.label = 'a'.repeat(101); }, raw => { raw.label = 'bad\nlabel'; },
    raw => { raw.discoveryUrl = origin; }, raw => { raw.script = () => {}; },
    raw => { raw.endpoints.dynamic = origin; }, raw => { delete raw.endpoints.member; },
    raw => { raw.activation.parameter = 'token'; },
    raw => { raw.activation.script = 'alert(1)'; },
    raw => { raw.cookieTargets = 'https://chat.example.com'; },
    raw => { raw.cookieTargets = [ , ]; },
    raw => { raw.cookieTargets.extra = origin; },
    raw => { raw[Symbol('hidden')] = true; },
    raw => { Object.defineProperty(raw, 'label', { get() { throw new Error('getter'); } }); }
  ];
  for (const mutate of mutations) {
    const raw = fixture(); mutate(raw);
    error('E_SERVICE_CONFIG', () => validateServiceDefinition(raw));
  }
  for (const raw of [null, undefined, [], 'script', () => fixture(), new Date()]) {
    error('E_SERVICE_CONFIG', () => validateServiceDefinition(raw));
  }
  for (const path of ['activate', '//evil.example.com', '/a/../activate', '/%61ctivate',
    '/activate?x=1', '/activate#x', '/activate\\x', '/activate\n']) {
    const raw = fixture(); raw.activation.path = path;
    error('E_SERVICE_CONFIG', () => validateServiceDefinition(raw));
  }
});

test('all four endpoints must be fixed, distinct, query-free and same-origin', () => {
  for (const key of Object.keys(fixture().endpoints)) {
    for (const endpoint of ['https://api.example.com/member', `${origin}/api/member?x=1`,
      `${origin}/api/member#`, '/api/member']) {
      const raw = fixture(); raw.endpoints[key] = endpoint;
      error('E_SERVICE_CONFIG', () => validateServiceDefinition(raw));
    }
    const raw = fixture();
    const other = Object.keys(raw.endpoints).find(name => name !== key);
    raw.endpoints[key] = raw.endpoints[other];
    error('E_SERVICE_CONFIG', () => validateServiceDefinition(raw));
  }
  for (const key of ['url', 'catalogUrl', 'desktopClientUrl']) {
    const raw = fixture(); raw[key] = `${origin}/?token=secret`;
    error('E_SERVICE_CONFIG', () => validateServiceDefinition(raw));
  }
  const raw = fixture(); raw.id = 'a'.repeat(80); raw.label = '中'.repeat(100);
  raw.cookieTargets = [];
  assert.equal(validateServiceDefinition(raw).label.length, 100);
});

test('input validation precedes configuration validation and accepts only strings', () => {
  for (const input of [null, undefined, {}, new URL(origin), 12]) {
    error('E_SERVICE_LINK', () => parseServiceLink(input, {}));
  }
  error('E_SERVICE_CONFIG', () => parseServiceLink(origin, {}));
});
