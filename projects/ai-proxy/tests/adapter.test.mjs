import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdapter, STORAGE_KEY } from '../src/adapter.js';
import { createConfig, createDraft, saveDraft, cancelDraft, selectProfile, importConfig, exportConfig } from '../src/model.js';

const profile = { id: 'a', name: 'A', scheme: 'socks5', host: 'proxy.example.com', port: 1080, domains: ['example.com'] };
const config = { schemaVersion: 2, profiles: [profile], selectedProfileId: 'a' };
const disabled = { state: 'disabled', permission: true, control: 'controllable_by_this_extension', canStop: false, reason: null };

function fixture() {
  const calls = [];
  let value = null, version = 0, active = disabled;
  const managed = {
    async requestEnable(input) { calls.push(['enable', input]); active = { ...disabled, state: 'enabled', canStop: true }; return active; },
    async requestDisable() { calls.push(['disable']); active = disabled; return active; },
    async getStatus() { calls.push(['status']); return active; }
  };
  const tool = { async request(action, input) {
    calls.push([action, input]);
    if (action === 'storage.get') return { value: structuredClone(value), etag: `etag-${version}` };
    assert.equal(action, 'storage.set');
    if (input.ifMatch !== `etag-${version}`) throw Object.assign(new Error('Conflict'), { code: 'E_CONFLICT' });
    value = structuredClone(input.value); version++;
    return { saved: true };
  } };
  return { calls, managed, tool, adapter: createAdapter({ tool, sdk: { browser: { proxy: { managed } } } }) };
}

test('open/save/cancel/import/select never apply; apply/stop/status use exact public calls', async () => {
  const { adapter, calls } = fixture();
  assert.equal(calls.length, 0);
  const loaded = await adapter.load();
  assert.deepEqual(loaded, { config: createConfig(), etag: 'etag-0' });
  assert.deepEqual(calls[0], ['storage.get', { key: STORAGE_KEY, withEtag: true }]);
  const draft = createDraft(loaded.config, null, 'a');
  Object.assign(draft.profile, profile);
  const saved = selectProfile(saveDraft(loaded.config, draft), 'a');
  cancelDraft(saved);
  assert.deepEqual(await adapter.save(importConfig(exportConfig(saved)), loaded.etag), { saved: true });
  assert.equal(calls.some(([name]) => ['enable', 'disable'].includes(name)), false);
  assert.deepEqual(calls[1], ['storage.set', { key: STORAGE_KEY, value: config, ifMatch: 'etag-0' }]);
  assert.equal((await adapter.apply(profile)).state, 'enabled');
  assert.deepEqual(calls[2], ['enable', { config: { endpoint: { scheme: 'socks5', host: profile.host, port: 1080 }, domains: ['example.com'] } }]);
  const edit = createDraft(saved, 'a'); edit.profile.host = 'other.example.com';
  const next = saveDraft(saved, edit);
  await adapter.save(next, (await adapter.load()).etag);
  assert.equal(calls.filter(([name]) => name === 'enable').length, 1);
  assert.equal((await adapter.status()).state, 'enabled');
  assert.equal((await adapter.stop()).state, 'disabled');
  assert.equal((await adapter.status()).state, 'disabled');
});

test('conditional storage writes reject stale tabs, malformed imports and missing ETag', async () => {
  const { adapter, calls } = fixture();
  const { etag } = await adapter.load();
  await adapter.save(config, etag);
  await assert.rejects(adapter.save(config, etag), { code: 'E_CONFLICT' });
  assert.equal(calls.filter(([name]) => name === 'storage.set').length, 2);
  await assert.rejects(adapter.save(config), { code: 'E_CONFLICT' });
  await assert.rejects(adapter.save({ ...config, selectedProfileId: 'bad' }, etag));
  await assert.rejects(adapter.apply({ ...profile, scheme: 'http' }), { code: 'E_UNSUPPORTED' });
  assert.equal(calls.length, 3);
});

test('permission denial, revocation, conflict and unknown errors propagate once without retries', async () => {
  for (const code of ['E_PERMISSION_DENIED', 'E_TOOL_CHANGED', 'E_CONFLICT', 'E_OUTCOME_UNKNOWN', 'E_PROXY_PROFILE_NOT_APPROVED']) {
    for (const operation of ['apply', 'stop', 'status', 'load', 'save']) {
      const error = Object.assign(new Error(code), { code });
      let attempts = 0;
      const reject = async () => { attempts++; throw error; };
      const adapter = createAdapter({ tool: { request: reject }, sdk: { browser: { proxy: { managed: { requestEnable: reject, requestDisable: reject, getStatus: reject } } } } });
      const args = operation === 'save' ? [config, 'etag'] : operation === 'apply' ? [profile] : [];
      await assert.rejects(adapter[operation](...args), e => e === error);
      assert.equal(attempts, 1);
    }
  }
});

test('SDK conflict/unavailable status is returned intact and never treated as applied', async () => {
  const { adapter, managed, calls } = fixture();
  for (const status of [
    { ...disabled, state: 'conflict', control: 'controlled_by_other_extensions', reason: 'owned elsewhere' },
    { ...disabled, state: 'unavailable', permission: false, reason: 'permission denied' },
    { ...disabled, state: 'unavailable', control: 'unknown', reason: 'outcome unknown' }
  ]) {
    managed.requestEnable = async () => { calls.push(['enable']); return status; };
    assert.equal(await adapter.apply(profile), status);
  }
  assert.equal(calls.length, 3);
});

test('unconfirmed storage acknowledgement stays unknown and is not replayed', async () => {
  let calls = 0;
  const adapter = createAdapter({ tool: { async request() { calls++; return {}; } } });
  await assert.rejects(adapter.save(config, 'etag'), { code: 'E_OUTCOME_UNKNOWN' });
  assert.equal(calls, 1);
  await assert.rejects(adapter.load(), { code: 'E_OUTCOME_UNKNOWN' });
  assert.equal(calls, 2);
  await assert.rejects(adapter.status(), { code: 'E_UNAVAILABLE' });
});
