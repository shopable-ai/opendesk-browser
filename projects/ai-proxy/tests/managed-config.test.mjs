import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const bundled = await build({ entryPoints: [new URL('../src/domain/managed-config.ts', import.meta.url).pathname], bundle: true, write: false, platform: 'node', format: 'esm' });
const { configForManagedRoute, toManagedRoute } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
const endpoint = { scheme: 'socks5', host: 'proxy.example.com', port: 1080 };
const fixed = { mode: 'fixed_servers', endpoint };
const rules = { endpoint, domains: ['example.com', 'openai.com'] };
function fixture() {
  return {
    schemaVersion: 2,
    sources: [{ id: 'manual', kind: 'manual', displayName: 'Manual', trustedByUser: true }],
    endpoints: [{ id: 'a', name: 'Proxy', sourceId: 'manual', ...endpoint }],
    profiles: [
      { id: 'pac', name: 'PAC', kind: 'pac-inline', sourceId: 'manual', pacText: 'function FindProxyForURL(){return "DIRECT";}' },
      { id: 'first', name: 'First', kind: 'endpoint', sourceId: 'manual', endpointId: 'a' },
      { id: 'second', name: 'Second', kind: 'endpoint', sourceId: 'manual', endpointId: 'a' }
    ],
    rules: ['openai.com', 'example.com'].map((domain, i) => ({ id: `r${i}`, domain, includeSubdomains: true, priority: i, enabled: true, action: 'endpoint', endpointId: 'a' })),
    defaultTarget: { action: 'direct' }, selection: { mode: 'system' }, managed: false
  };
}

test('exports read-only recovery and preserves the current matching profile over duplicate profiles', () => {
  assert.equal(typeof configForManagedRoute, 'function');
  const config = fixture();
  config.selection = { mode: 'profile', profileId: 'second' };
  const before = structuredClone(config);
  const result = configForManagedRoute(config, { endpoint: { port: 1080, host: endpoint.host, scheme: 'socks5' }, mode: 'fixed_servers' });
  assert.deepEqual(result, { ...before, managed: true });
  assert.deepEqual(config, before);
  result.sources[0].displayName = 'Changed';
  result.endpoints[0].port = 1;
  result.profiles[0].name = 'Changed';
  result.rules[0].domain = 'changed.com';
  result.defaultTarget.action = 'endpoint';
  result.selection.profileId = 'first';
  assert.deepEqual(config, before);
});

test('falls back to direct, the first supported endpoint profile, or rules without guessing a profile', () => {
  for (const [route, selection] of [
    [{ mode: 'direct' }, { mode: 'direct' }],
    [fixed, { mode: 'profile', profileId: 'first' }],
    [rules, { mode: 'rules' }],
    [{ ...rules, mode: 'rules' }, { mode: 'rules' }]
  ]) {
    const config = fixture();
    config.selection = { mode: 'profile', profileId: 'pac' };
    assert.deepEqual(configForManagedRoute(config, route), { ...config, managed: true, selection });
  }
  const config = fixture();
  config.profiles = config.profiles.slice(0, 1);
  assert.equal(configForManagedRoute(config, fixed), null);
});

test('rules compare independently of domain order, preserve selection, and convert with sorted domains', () => {
  const config = fixture();
  config.selection = { mode: 'rules', profileId: 'second' };
  assert.deepEqual(toManagedRoute(config).domains, ['example.com', 'openai.com']);
  for (const route of [rules, { mode: 'rules', domains: [...rules.domains].reverse(), endpoint }]) {
    const before = structuredClone(route);
    assert.deepEqual(configForManagedRoute(config, route).selection, config.selection);
    assert.deepEqual(route, before);
  }
});

test('rejects unsupported modes, mismatches, malformed shapes, extra fields and authentication', () => {
  const routes = [null, undefined, false, [], {}, { mode: 'system' },
    { mode: 'pac_script', pacScript: { data: 'DIRECT' } },
    { mode: 'direct', endpoint }, { mode: 'direct', extra: undefined },
    { ...fixed, extra: true }, { ...rules, mode: 'auto_detect' },
    { endpoint }, { mode: 'rules', endpoint, domains: [] },
    { ...rules, domains: ['example.com', 'example.com'] },
    { ...rules, domains: ['example.com', 4] },
    { ...rules, domains: ['other.com'] },
    { ...rules, extra: false },
    ...[{ ...endpoint, username: 'user' }, { ...endpoint, password: '' },
      { ...endpoint, credentialRef: 'secret' }, { ...endpoint, extra: undefined },
      { ...endpoint, port: '1080' }, { ...endpoint, port: 0 },
      { ...endpoint, host: 'other.example.com' }].map(endpoint => ({ mode: 'fixed_servers', endpoint }))
  ];
  for (const route of routes) assert.equal(configForManagedRoute(fixture(), route), null, JSON.stringify(route));
});

test('restores only supported unauthenticated endpoints and explicitly trusted exact loopback', () => {
  for (const [host, scheme, local, trusted, credentialRef, allowed] of [
    ['proxy.example.com', 'https', false, true, undefined, true],
    ['proxy.example.com', 'http', false, true, undefined, false],
    ['proxy.example.com', 'socks4', false, true, undefined, false],
    ['proxy.example.com', 'socks5', false, true, 'secret', false],
    ['127.0.0.1', 'http', true, true, undefined, true],
    ['127.0.0.1', 'socks5', true, true, undefined, true],
    ['127.0.0.1', 'https', true, true, undefined, false],
    ['127.0.0.1', 'http', false, true, undefined, false],
    ['127.0.0.1', 'http', true, false, undefined, false],
    ['127.1', 'http', true, true, undefined, false],
    ['localhost', 'socks5', true, true, undefined, false],
    ['127.0.0.1.evil.com', 'http', true, true, undefined, false],
    ['192.168.1.1', 'socks5', false, true, undefined, false]
  ]) {
    const config = fixture();
    Object.assign(config.sources[0], { kind: local ? 'local-client' : 'manual', trustedByUser: trusted });
    Object.assign(config.endpoints[0], { host, scheme, credentialRef });
    const routeEndpoint = { host, scheme, port: 1080 };
    const recovered = configForManagedRoute(config, { mode: 'fixed_servers', endpoint: routeEndpoint });
    assert.equal(recovered !== null, allowed, `${host}/${scheme}/${local}/${trusted}`);
    const explicit = configForManagedRoute(config, { mode: 'rules', endpoint: routeEndpoint, domains: rules.domains });
    assert.equal(explicit !== null, allowed);
    if (local) assert.equal(configForManagedRoute(config, { endpoint: routeEndpoint, domains: rules.domains }), null);
  }
});

test('rules unsupported by the forward conversion cannot be restored', () => {
  for (const change of [
    config => { config.defaultTarget = { action: 'endpoint', endpointId: 'a' }; },
    config => { config.rules[0].includeSubdomains = false; },
    config => { config.rules[0].action = 'direct'; },
    config => { config.rules[0].enabled = false; },
    config => { config.rules[0].domain = 'localhost'; }
  ]) {
    const config = fixture(); change(config);
    assert.equal(configForManagedRoute(config, rules), null);
  }
});
