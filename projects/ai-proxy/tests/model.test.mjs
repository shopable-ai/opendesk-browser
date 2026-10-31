import test from 'node:test';
import assert from 'node:assert/strict';
import { createConfig, validateConfig, validateProfile, createDraft, saveDraft, cancelDraft, selectProfile, importConfig, exportConfig, detectImportFormat, toManagedConfig } from '../src/model.js';

const profile = (id = 'a') => ({ id, name: 'Proxy', scheme: 'https', host: 'proxy.example.com', port: 443, domains: ['example.com'] });
const config = () => ({ schemaVersion: 2, profiles: [profile()], selectedProfileId: 'a' });

test('add/edit/cancel keep persisted and active snapshots isolated', () => {
  const saved = config();
  const active = toManagedConfig(saved.profiles[0]);
  const edit = createDraft(saved, 'a');
  edit.profile.host = 'other.example.com';
  edit.profile.domains.push('other.example.com');
  assert.deepEqual(cancelDraft(saved), config());
  const changed = saveDraft(saved, edit);
  assert.equal(changed.profiles[0].host, 'other.example.com');
  assert.deepEqual(saved, config());
  assert.deepEqual(active, toManagedConfig(profile()));
  const add = createDraft(saved, null, 'b');
  Object.assign(add.profile, profile('b'));
  const added = saveDraft(saved, add);
  assert.equal(added.profiles.length, 2);
  assert.equal(added.selectedProfileId, 'a');
  assert.equal(selectProfile(added, 'b').selectedProfileId, 'b');
  assert.equal(added.selectedProfileId, 'a');
});

test('only supported explicit protocols and safe host/port/domain shapes pass', () => {
  for (const scheme of ['https', 'socks5']) assert.equal(validateProfile({ ...profile(), scheme }).scheme, scheme);
  for (const scheme of ['http', 'socks4', 'pac', 'HTTPS']) {
    assert.throws(() => validateProfile({ ...profile(), scheme }), { code: 'E_UNSUPPORTED' });
  }
  for (const fields of [
    { port: '443' }, { port: 0 }, { port: 65536 }, { port: 1.5 },
    { host: 'https://proxy.example.com' }, { host: 'user:pass@proxy.example.com' },
    { host: '256.1.1.1' }, { host: '-bad.example.com' }, { domains: [] },
    { domains: ['*.example.com'] }, { domains: ['example.com/path'] },
    { domains: ['example.com', 'example.com'] }, { domains: ['127.0.0.1'] },
    { domains: Array.from({ length: 17 }, (_, i) => `a${i}.com`) }
  ]) assert.throws(() => validateProfile({ ...profile(), ...fields }), { code: 'E_CONFIG' });
  for (const key of ['password', 'username', 'auth', 'credentialRef', 'pacText']) {
    assert.throws(() => validateProfile({ ...profile(), [key]: 'secret' }), { code: 'E_UNSUPPORTED' });
  }
});

test('schema v2 import is atomic, strict and cannot enable routing/statistics', () => {
  const saved = config();
  assert.deepEqual(importConfig(exportConfig(saved)), saved);
  assert.deepEqual(createConfig(), { schemaVersion: 2, profiles: [], selectedProfileId: null });
  const invalid = [
    { ...saved, selectedProfileId: 'missing' },
    { ...saved, profiles: [profile(), profile()] },
    { ...saved, profiles: [profile(), { ...profile('b'), port: 0 }] },
    { ...saved, schemaVersion: 3 }, { ...saved, active: 'a' },
    { ...saved, statsEnabled: true }, { ...saved, managed: true },
    { ...saved, profiles: null }, { ...saved, selectedProfileId: undefined }
  ];
  for (const raw of invalid) {
    assert.throws(() => importConfig(JSON.stringify(raw)));
    assert.deepEqual(saved, config());
  }
  assert.throws(() => importConfig('{broken'), { code: 'E_CONFIG' });
  const clone = validateConfig(saved);
  clone.profiles[0].domains.push('extra.example.com');
  assert.deepEqual(saved, config());
});

test('bad draft references and ID changes are rejected without mutation', () => {
  const saved = config();
  assert.throws(() => createDraft(saved, 'missing'));
  assert.throws(() => saveDraft(saved, { editingId: 'missing', profile: profile() }));
  assert.throws(() => saveDraft(saved, { editingId: 'a', profile: profile('b') }));
  assert.throws(() => saveDraft(saved, { editingId: null, profile: profile() }));
  assert.throws(() => selectProfile(saved, 'missing'));
  assert.deepEqual(saved, config());
});

test('public DNS is required for both endpoint and scope; test gateway is an ordinary DNS fixture', () => {
  for (const value of ['127.0.0.1', '10.0.0.1', '192.168.1.1', '8.8.8.8', '2130706433',
    '[::1]', 'localhost', 'proxy', 'proxy.localhost', 'proxy.local', 'proxy.internal', 'proxy.private', 'proxy.lan', 'proxy.home']) {
    for (const fields of [{ host: value }, { domains: [value] }]) {
      assert.throws(() => validateProfile({ ...profile(), ...fields }), { code: 'E_CONFIG', message: /DNS/ });
    }
  }
  assert.equal(validateProfile({ ...profile(), host: 'gateway.ai-proxy.test' }).host, 'gateway.ai-proxy.test');
});

test('legacy v1/v2 backups are recognized and refused without silently losing semantics', () => {
  for (const [raw, format] of [
    [{ schemaVersion: 1, proxies: [], rules: [] }, 'legacy-v1'],
    [{ schemaVersion: 2, endpoints: [], profiles: [], rules: [], selection: { mode: 'rules' } }, 'legacy-v2']
  ]) {
    assert.equal(detectImportFormat(raw), format);
    assert.throws(() => importConfig(JSON.stringify(raw)), { code: 'E_LEGACY_FORMAT' });
  }
  assert.equal(detectImportFormat(config()), 'managed-v2');
  assert.equal(detectImportFormat(null), 'unknown');
});
