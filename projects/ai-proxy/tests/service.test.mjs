import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

// Compile the actual TS service in memory with the existing project toolchain.
const bundled = await build({ entryPoints: [new URL('../src/service.ts', import.meta.url).pathname], bundle: true, write: false, platform: 'node', format: 'esm' });
const { createProxyService } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
const copy = value => structuredClone(value);
const disabled = { state: 'disabled', canStop: false, control: 'controllable_by_this_extension', reason: null };
const enabled = { state: 'enabled', canStop: true, control: 'controlled_by_this_extension', reason: null };
const endpoint = { id: 'a', name: 'A', host: 'proxy.example.com', scheme: 'socks5', port: 1080, sourceId: 'manual' };
const profile = { id: 'profile-a', name: 'A', kind: 'endpoint', endpointId: 'a', sourceId: 'manual' };
const empty = () => ({ schemaVersion: 2, sources: [{ id: 'manual', kind: 'manual', displayName: 'Manual', trustedByUser: true }], endpoints: [], profiles: [], rules: [], defaultTarget: { action: 'direct' }, selection: { mode: 'system' }, managed: false });
const populated = () => ({ ...empty(), endpoints: [copy(endpoint)], profiles: [copy(profile)], selection: { mode: 'profile', profileId: 'profile-a' } });
const sleep = () => new Promise(resolve => setTimeout(resolve, 45));
function fixture({ config = populated(), preview = false, receipt = true } = {}) {
  const calls = [];
  let stored = copy(config), version = 0, native = copy(disabled);
  const options = {
    preview,
    async load() { calls.push(['load']); return { config: copy(stored), etag: `etag-${version}` }; },
    async save(value, etag) {
      calls.push(['save', copy(value), etag]);
      assert.equal(etag, `etag-${version}`);
      stored = copy(value); version++;
      return receipt ? `etag-${version}` : { saved: true };
    },
    async status() { calls.push(['status']); return copy(native); },
    async apply(value) { calls.push(['apply', copy(value)]); native = copy(enabled); return copy(native); },
    async stop() { calls.push(['stop']); native = copy(disabled); return copy(native); }
  };
  // Mutable adapter delegates allow fault injection without global mocks.
  const service = createProxyService(Object.fromEntries(Object.keys(options).map(key => [key,
    typeof options[key] === 'function' ? (...args) => options[key](...args) : options[key]])));
  return { service, calls, options, stored: () => copy(stored), setNative: value => { native = copy(value); }, replace: value => { stored = copy(value); version++; } };
}
async function ok(service, message) {
  const result = await service.request(message);
  assert.equal(result.ok, true, JSON.stringify(result));
  return result;
}
const operations = (f, name) => f.calls.filter(([type]) => type === name);

test('closing a UI service drops queued operations and late diagnostic notifications without releasing the route', async () => {
  const f = fixture({preview:true});
  let notifications=0;
  f.service.subscribe(()=>notifications++);
  await ok(f.service,{type:'GET_STATE'});
  const queued=f.service.request({type:'APPLY'});
  f.service.dispose();
  await assert.rejects(queued,{code:'E_TOOL_CHANGED'});
  assert.equal(operations(f,'apply').length,0);
  assert.equal(operations(f,'stop').length,0);
  const count=notifications;
  await sleep();
  assert.equal(notifications,count);
  await assert.rejects(f.service.request({type:'STOP'}),{code:'E_TOOL_CHANGED'});
});

test('open, sequential endpoint/profile save and both select commands never apply', async () => {
  const f = fixture({ config: empty() });
  assert.equal(f.calls.length, 0);
  await ok(f.service, { type: 'GET_STATE' });
  await ok(f.service, { type: 'SAVE_ENDPOINT', endpoint });
  await ok(f.service, { type: 'SAVE_PROFILE', profile });
  await ok(f.service, { type: 'SELECT', selection: { mode: 'direct' } });
  const selected = await ok(f.service, { type: 'SELECT_AND_APPLY', selection: { mode: 'profile', profileId: profile.id } });
  assert.equal(selected.state.config.profiles.length, 1);
  assert.equal(selected.state.runtime.applied, false);
  assert.equal(operations(f, 'apply').length, 0);
  assert.equal(operations(f, 'stop').length, 0);
  assert.deepEqual(operations(f, 'save').map(row => row[2]), ['etag-0', 'etag-1', 'etag-2', 'etag-3']);
});

test('Apply passes full ConfigState once; draft edits retain activeSelection and STOP clears it', async () => {
  const f = fixture();
  await ok(f.service, { type: 'SAVE_RULE', rule: { id: 'r', domain: 'chatgpt.com', action: 'endpoint', endpointId: 'a', includeSubdomains: true, enabled: true, priority: 8 } });
  await ok(f.service, { type: 'SET_DEFAULT', target: { action: 'endpoint', endpointId: 'a' } });
  const before = f.stored();
  const applied = await ok(f.service, { type: 'APPLY' });
  assert.deepEqual(operations(f, 'apply')[0][1], before);
  assert.equal(applied.state.runtime.applied, true);
  assert.equal(applied.state.config.managed, true);
  await ok(f.service, { type: 'SAVE_ENDPOINT', endpoint: { ...endpoint, name: 'Edited', host: 'other.example.com' } });
  const draft = await ok(f.service, { type: 'SELECT_AND_APPLY', selection: { mode: 'direct' } });
  assert.deepEqual(draft.state.runtime.activeSelection, before.selection);
  assert.deepEqual(draft.state.runtime.desired, { mode: 'direct' });
  assert.equal(draft.state.runtime.browserMode, before.selection.mode);
  assert.equal(draft.state.runtime.applied, true);
  assert.equal(draft.state.config.endpoints[0].host, 'other.example.com');
  assert.equal(operations(f, 'apply').length, 1);
  const stopped = await ok(f.service, { type: 'STOP' });
  assert.equal(stopped.state.runtime.applied, false);
  assert.equal(stopped.state.runtime.activeSelection, undefined);
  assert.equal(stopped.state.config.managed, false);
  assert.equal(operations(f, 'stop').length, 1);
});

test('serial queue snapshots caller input, preserves edits and recovers after a rejected mutation', async () => {
  const f = fixture();
  const first = { type: 'SAVE_ENDPOINT', endpoint: { ...endpoint, name: 'First' } };
  const one = f.service.request(first);
  first.endpoint.name = 'Caller changed after enqueue';
  const two = f.service.request({ type: 'SAVE_PROFILE', profile: { ...profile, name: 'Second' } });
  assert.equal((await one).ok, true);
  assert.equal((await two).ok, true);
  assert.equal(f.stored().endpoints[0].name, 'First');
  assert.equal(f.stored().profiles[0].name, 'Second');
  const prior = f.stored();
  const bad = await f.service.request({ type: 'SAVE_RULE', rule: { id: 'bad', domain: 'chatgpt.com', priority: 0, action: 'endpoint', endpointId: 'missing' } });
  assert.equal(bad.ok, false);
  assert.deepEqual(f.stored(), prior);
  await ok(f.service, { type: 'SELECT', selection: { mode: 'rules' } });
});

test('missing save ETag reloads; external edits survive; conflict and unknown writes are not replayed', async () => {
  const f = fixture({ receipt: false });
  await ok(f.service, { type: 'SELECT', selection: { mode: 'rules' } });
  const external = f.stored(); external.endpoints[0].name = 'Other window'; f.replace(external);
  await ok(f.service, { type: 'SELECT', selection: { mode: 'direct' } });
  assert.equal(f.stored().endpoints[0].name, 'Other window');
  assert.deepEqual(operations(f, 'save').map(row => row[2]), ['etag-0', 'etag-2']);
  for (const code of ['E_CONFLICT', 'E_OUTCOME_UNKNOWN']) {
    let writes = 0;
    f.options.save = async () => { writes++; throw Object.assign(Error(code), { code }); };
    const response = await f.service.request({ type: 'SELECT', selection: { mode: 'system' } });
    assert.equal(response.errorCode, code);
    assert.equal(writes, 1);
  }
});

test('unknown Enable fences further Enable until a confirmed disabled observation', async () => {
  const f = fixture();
  let attempts = 0;
  f.options.apply = async () => { attempts++; f.setNative(enabled); throw Object.assign(Error('Lost acknowledgement'), { code: 'E_OUTCOME_UNKNOWN' }); };
  assert.equal((await f.service.request({ type: 'APPLY' })).errorCode, 'E_OUTCOME_UNKNOWN');
  const state = await ok(f.service, { type: 'GET_STATE' });
  assert.equal(state.state.runtime.outcomeUnknown, true);
  await ok(f.service, { type: 'SELECT', selection: { mode: 'direct' } });
  assert.equal((await f.service.request({ type: 'APPLY' })).errorCode, 'E_OUTCOME_UNKNOWN');
  assert.equal(attempts, 1);
  f.setNative({ ...disabled, control: 'unknown' });
  await ok(f.service, { type: 'GET_STATE' });
  assert.equal((await f.service.request({ type: 'APPLY' })).errorCode, 'E_OUTCOME_UNKNOWN');
  f.setNative(disabled);
  assert.equal((await ok(f.service, { type: 'GET_STATE' })).state.runtime.outcomeUnknown, false);
  f.options.apply = async () => { attempts++; f.setNative(enabled); return enabled; };
  await ok(f.service, { type: 'APPLY' });
  assert.equal(attempts, 2);
});

test('failed STOP retains unknown fence, confirmed STOP clears it, and broken reads cannot block release', async () => {
  const f = fixture();
  await ok(f.service, { type: 'APPLY' });
  f.options.stop = async () => { throw Object.assign(Error('Uncertain stop'), { code: 'E_OUTCOME_UNKNOWN' }); };
  assert.equal((await f.service.request({ type: 'STOP' })).ok, false);
  assert.equal((await ok(f.service, { type: 'GET_STATE' })).state.runtime.outcomeUnknown, true);
  assert.equal((await f.service.request({ type: 'APPLY' })).errorCode, 'E_OUTCOME_UNKNOWN');
  f.options.stop = async () => { f.setNative(disabled); return disabled; };
  const stopped = await ok(f.service, { type: 'STOP' });
  assert.equal(stopped.state.runtime.outcomeUnknown, false);
  await ok(f.service, { type: 'APPLY' });
  let stops = 0;
  f.options.load = async () => { throw Error('Storage unavailable'); };
  f.options.status = async () => { throw Error('Status unavailable'); };
  f.options.stop = async () => { stops++; return disabled; };
  assert.equal((await f.service.request({ type: 'STOP' })).ok, false);
  assert.equal(stops, 1);
});

test('no startup Enable or fabricated active snapshot; conflict and read failures remain visible', async () => {
  const f = fixture({ config: { ...populated(), managed: true } });
  f.setNative(enabled);
  const initial = await ok(f.service, { type: 'GET_STATE' });
  assert.equal(initial.state.runtime.applied, false);
  assert.equal(initial.state.runtime.activeSelection, undefined);
  f.setNative({ state: 'conflict', control: 'controlled_by_other_extensions', canStop: false, reason: 'Other owner' });
  const conflict = await ok(f.service, { type: 'GET_STATE' });
  assert.equal(conflict.state.runtime.control, 'controlled_by_other_extensions');
  assert.equal(conflict.state.runtime.reason, 'Other owner');
  assert.equal((await f.service.request({ type: 'APPLY' })).ok, false);
  f.options.status = async () => { throw Error('No connection'); };
  const unavailable = await ok(f.service, { type: 'GET_STATE' });
  assert.equal(unavailable.state.config.endpoints.length, 1);
  assert.equal(unavailable.state.runtime.control, 'unknown');
  assert.equal(unavailable.state.runtime.applied, false);
  assert.ok(unavailable.state.runtime.proxyError);
  assert.equal(unavailable.state.runtime.outcomeUnknown, true);
  await ok(f.service, { type: 'SAVE_PROFILE', profile: { ...profile, name: 'Saved offline' } });
  assert.equal(f.stored().profiles[0].name, 'Saved offline');
  assert.equal(operations(f, 'apply').length, 0);
});

test('import v2 resets managed intent and selection without applying; bad import is atomic', async () => {
  const f = fixture({ config: empty() });
  const incoming = { ...populated(), managed: true };
  const result = await ok(f.service, { type: 'IMPORT', config: incoming });
  assert.deepEqual(result.state.config.endpoints, incoming.endpoints);
  assert.deepEqual(result.state.config.profiles, incoming.profiles);
  assert.deepEqual(result.state.config.selection, { mode: 'system' });
  assert.equal(result.state.config.managed, false);
  assert.equal(operations(f, 'apply').length, 0);
  const before = f.stored();
  assert.equal((await f.service.request({ type: 'IMPORT', config: { ...incoming, endpoints: [] } })).ok, false);
  assert.deepEqual(f.stored(), before);
  f.setNative(enabled);
  assert.equal((await f.service.request({ type: 'IMPORT', config: incoming })).ok, false);
  assert.deepEqual(f.stored(), before);
});

test('v1 migration retains safe proxies/rules; export removes PAC, credential refs and subscriptions', async () => {
  const f = fixture({ config: empty() });
  const v1 = { schemaVersion: 1, proxies: [{ id: 'a', name: 'A', protocol: 'http', host: endpoint.host, port: 8080 }], rules: [{ id: 'r', host: 'chatgpt.com', action: 'proxy', proxyId: 'a', priority: 2 }] };
  const migrated = await ok(f.service, { type: 'IMPORT', config: v1 });
  assert.equal(migrated.state.config.rules[0].endpointId, 'a');
  assert.equal(migrated.state.config.endpoints[0].scheme, 'http');
  await ok(f.service, { type: 'SAVE_ENDPOINT', endpoint: { ...endpoint, credentialRef: 'session-a' } });
  await ok(f.service, { type: 'SAVE_PROFILE', profile: { id: 'pac', name: 'Private PAC', kind: 'pac-inline', sourceId: 'manual', pacText: 'function FindProxyForURL(url,host){return "DIRECT";}' } });
  await ok(f.service, { type: 'SAVE_SUBSCRIPTION', source: { id: 'sub', displayName: 'Private provider', kind: 'subscription', originHost: 'provider.com', trustedByUser: true, format: 'auto', syncStatus: 'not-synced' } });
  const before = f.stored();
  const exported = await ok(f.service, { type: 'EXPORT' });
  assert.equal(exported.share.endpoints[0].credentialRef, undefined);
  assert.equal(exported.share.profiles.some(p => p.kind === 'pac-inline'), false);
  assert.equal(exported.share.sources.some(s => s.kind === 'subscription'), false);
  assert.equal(exported.share.managed, false);
  assert.deepEqual(exported.share.selection, { mode: 'system' });
  assert.deepEqual(f.stored(), before);
  assert.equal((await f.service.request({ type: 'IMPORT', config: { ...v1, proxies: [{ ...v1.proxies[0], password: 'secret' }] } })).ok, false);
});

test('local client collision checks, loopback constraint, rename and deletion preserve original business rules', async () => {
  const f = fixture({ config: empty() });
  const client = { id: 'local', name: 'Local', scheme: 'http', port: 7890 };
  await ok(f.service, { type: 'SAVE_LOCAL_CLIENT', client });
  assert.equal(f.stored().endpoints[0].host, '127.0.0.1');
  assert.equal(f.stored().profiles[0].id, 'profile-local');
  const before = f.stored();
  assert.equal((await f.service.request({ type: 'SAVE_LOCAL_CLIENT', client: { ...client, host: 'remote.com' } })).ok, false);
  assert.equal((await f.service.request({ type: 'SAVE_ENDPOINT', endpoint: { ...before.endpoints[0], name: 'Wrong editor' } })).ok, false);
  assert.deepEqual(f.stored(), before);
  await ok(f.service, { type: 'SAVE_LOCAL_CLIENT', client: { ...client, name: 'Renamed' } });
  assert.equal(f.stored().profiles[0].name, 'Renamed');
  await ok(f.service, { type: 'SELECT', selection: { mode: 'profile', profileId: 'profile-local' } });
  assert.equal((await f.service.request({ type: 'DELETE_PROFILE', id: 'profile-local' })).ok, false);
  await ok(f.service, { type: 'DELETE_ENDPOINT', id: 'local' });
  assert.equal(f.stored().sources.some(s => s.id === 'local-local'), false);
  assert.deepEqual(f.stored().selection, { mode: 'system' });
  const g = fixture();
  assert.equal((await g.service.request({ type: 'SAVE_LOCAL_CLIENT', client: { ...client, id: 'a' } })).ok, false);
});

test('referenced endpoints cannot be deleted; subscriptions, profiles and rules support safe deletion', async () => {
  const f = fixture();
  await ok(f.service, { type: 'SAVE_RULE', rule: { id: 'r', domain: 'chatgpt.com', action: 'endpoint', endpointId: 'a', priority: 0 } });
  assert.equal((await f.service.request({ type: 'DELETE_ENDPOINT', id: 'a' })).ok, false);
  await ok(f.service, { type: 'DELETE_RULE', id: 'r' });
  await ok(f.service, { type: 'SET_DEFAULT', target: { action: 'endpoint', endpointId: 'a' } });
  assert.equal((await f.service.request({ type: 'DELETE_ENDPOINT', id: 'a' })).ok, false);
  await ok(f.service, { type: 'SET_DEFAULT', target: { action: 'direct' } });
  await ok(f.service, { type: 'SELECT', selection: { mode: 'system' } });
  await ok(f.service, { type: 'DELETE_PROFILE', id: profile.id });
  await ok(f.service, { type: 'DELETE_ENDPOINT', id: endpoint.id });
  assert.equal(f.stored().endpoints.length, 0);
  await ok(f.service, { type: 'SAVE_SUBSCRIPTION', source: { id: 'sub', displayName: 'Provider', kind: 'subscription', originHost: 'provider.com', trustedByUser: true, format: 'auto', syncStatus: 'not-synced' } });
  await ok(f.service, { type: 'DELETE_SUBSCRIPTION', id: 'sub' });
  assert.equal((await f.service.request({ type: 'DELETE_SUBSCRIPTION', id: 'sub' })).ok, false);
});

test('PAC Apply needs approval, credentials and actual unwired networking always fail explicitly', async () => {
  for (const preview of [false, true]) {
    const f = fixture({ preview });
    await ok(f.service, { type: 'SAVE_PROFILE', profile: { id: 'pac', name: 'PAC', kind: 'pac-inline', sourceId: 'manual', pacText: 'function FindProxyForURL(url,host){return "DIRECT";}' } });
    await ok(f.service, { type: 'SELECT', selection: { mode: 'profile', profileId: 'pac' } });
    assert.equal((await f.service.request({ type: 'APPLY' })).errorCode, 'errPacRequiresConfirmation');
    assert.equal(operations(f, 'apply').length, 0);
    for (const message of [{ type: 'PROBE' }, { type: 'SET_CREDENTIAL', endpointId: 'a', username: 'u', password: 'never-persist' }]) {
      assert.equal((await f.service.request(message)).errorCode, 'E_NOT_CONNECTED');
    }
    assert.equal(JSON.stringify(f.stored()).includes('never-persist'), false);
    await ok(f.service, { type: 'APPLY', approvedPac: true });
    assert.equal(operations(f, 'apply').length, 1);
  }
  const f = fixture();
  for (const type of ['GET_DIAGNOSTICS', 'RUN_DIAGNOSTICS', 'GET_USAGE', 'SET_USAGE_SETTINGS', 'SAVE_DIAGNOSTIC_SITE']) {
    assert.equal((await f.service.request({ type })).errorCode, 'E_NOT_CONNECTED');
  }
});

test('preview favorites/order and usage opt-in/ignore/clear stay session-local with no collection', async () => {
  const f = fixture({ preview: true });
  const first = await ok(f.service, { type: 'GET_DIAGNOSTICS' });
  assert.equal(first.preview, true);
  assert.equal(first.diagnostics.preview, true);
  const added = await ok(f.service, { type: 'SAVE_DIAGNOSTIC_SITE', domain: 'example.com', priority: 'P0', name: 'Custom' });
  const custom = added.diagnostics.favorites.at(-1);
  assert.equal(custom.pinnedByUser, true);
  const moved = await ok(f.service, { type: 'MOVE_DIAGNOSTIC_SITE', id: custom.id, direction: 'up' });
  assert.equal(moved.diagnostics.favorites.at(-2).id, custom.id);
  await ok(f.service, { type: 'REMOVE_DIAGNOSTIC_SITE', id: custom.id });
  assert.equal((await ok(f.service, { type: 'GET_USAGE' })).usage.settings.enabled, false);
  const usage = await ok(f.service, { type: 'SET_USAGE_SETTINGS', settings: { enabled: true, topLimit: 10, sort: 'recent' } });
  assert.equal(usage.usage.settings.enabled, true);
  assert.equal(typeof usage.usage.settings.enabledAt, 'number');
  assert.equal(usage.usage.permissionGranted, false);
  assert.deepEqual(usage.usage.sites, []);
  await ok(f.service, { type: 'IGNORE_USAGE_SITE', domain: 'example.com', ignored: true });
  const cleared = await ok(f.service, { type: 'CLEAR_USAGE' });
  assert.deepEqual(cleared.usage.settings.ignored, ['example.com']);
  assert.deepEqual(cleared.usage.sites, []);
  assert.equal((await f.service.request({ type: 'IGNORE_USAGE_SITE', domain: 'https://example.com/private?token=secret', ignored: true })).ok, false);
  assert.equal((await f.service.request({ type: 'SET_USAGE_SETTINGS', settings: { enabled: 'yes' } })).ok, false);
  const off = await ok(f.service, { type: 'SET_USAGE_SETTINGS', settings: { enabled: false } });
  assert.equal(off.usage.settings.enabledAt, null);
  assert.equal(operations(f, 'save').length, 0);
  const g = fixture({ preview: true });
  assert.equal((await ok(g.service, { type: 'GET_USAGE' })).usage.settings.enabled, false);
});

test('preview diagnostics generation/cancel and configuration revisions discard late simulated evidence', async () => {
  const f = fixture({ preview: true });
  const start = await ok(f.service, { type: 'RUN_DIAGNOSTICS', siteIds: ['chatgpt'] });
  assert.equal(start.diagnostics.activeRun.total, 1);
  const cancelled = await ok(f.service, { type: 'CANCEL_DIAGNOSTICS' });
  assert.ok(cancelled.diagnostics.generation > start.diagnostics.generation);
  await sleep();
  assert.deepEqual((await ok(f.service, { type: 'GET_DIAGNOSTICS' })).diagnostics.observations, []);
  const next = await ok(f.service, { type: 'RUN_DIAGNOSTICS', siteIds: ['claude'] });
  await ok(f.service, { type: 'SELECT', selection: { mode: 'direct' } });
  await sleep();
  const changed = await ok(f.service, { type: 'GET_DIAGNOSTICS' });
  assert.notEqual(changed.diagnostics.configRevision, next.diagnostics.configRevision);
  assert.equal(changed.diagnostics.activeRun, null);
  assert.deepEqual(changed.diagnostics.observations, []);
  await ok(f.service, { type: 'RUN_DIAGNOSTICS', siteIds: ['chatgpt'] });
  await sleep();
  const complete = await ok(f.service, { type: 'GET_DIAGNOSTICS' });
  assert.equal(complete.diagnostics.activeRun, null);
  assert.equal(complete.diagnostics.observations[0].configRevision, complete.diagnostics.configRevision);
  assert.equal(complete.diagnostics.observations[0].kind, 'network_error');
  assert.equal(complete.diagnostics.statistics.chatgpt.successes, 0);
  assert.equal(complete.preview, true);
});

test('subscriptions are isolated, unsubscribe works and read notifications do not loop', async () => {
  const f = fixture();
  let events = 0;
  const unsubscribe = f.service.subscribe(state => { events++; state.config.endpoints.length = 0; });
  f.service.subscribe(() => { throw Error('Broken UI'); });
  await ok(f.service, { type: 'GET_STATE' });
  assert.equal(events, 1);
  await ok(f.service, { type: 'GET_STATE' });
  assert.equal(events, 1);
  await ok(f.service, { type: 'SELECT', selection: { mode: 'direct' } });
  assert.equal(events, 2);
  assert.equal(f.stored().endpoints.length, 1);
  unsubscribe();
  await ok(f.service, { type: 'SELECT', selection: { mode: 'system' } });
  assert.equal(events, 2);
  assert.equal((await f.service.request(null)).errorCode, 'errBadMessage');
  assert.equal((await f.service.request({ type: 'BOGUS' })).errorCode, 'errUnknownMessage');
});


test('actual offline preview fixture integrates, including its failed-status scenario without loading lockup', async () => {
  const { createPreviewBoundary } = await import('../preview/sdk-preview.js');
  for (const scenario of ['success', 'error']) {
    const service = createProxyService(createPreviewBoundary(scenario).service);
    const response = await ok(service, { type: 'GET_STATE' });
    assert.equal(response.preview, true);
    assert.equal(response.state.config.endpoints.length, 3);
    if (scenario === 'error') {
      assert.equal(response.state.runtime.control, 'unknown');
      assert.equal(response.state.runtime.applied, false);
      assert.ok(response.state.runtime.proxyError);
    }
    const updated = await ok(service, { type: 'SAVE_ENDPOINT', endpoint: { ...response.state.config.endpoints[0], name: 'Preview edit' } });
    assert.equal(updated.state.config.endpoints[0].name, 'Preview edit');
  }
});


// Deferred adapter boundaries exercise the real service, not a copied state machine.
for (const boundary of ['load', 'edit-load', 'status', 'save', 'save-reload', 'apply', 'stop']) {
  for (const rejected of [false, true]) {
    test(`dispose during ${boundary} (${rejected ? 'reject' : 'resolve'}) fences all continuations`, async () => {
      const f = fixture({ receipt: boundary !== 'save-reload' });
      if (boundary === 'stop') await ok(f.service, { type: 'APPLY' });
      let entered, finish;
      const started = new Promise(resolve => { entered = resolve; });
      const gate = new Promise((resolve, reject) => { finish = rejected ? () => reject(Error('secret late failure')) : resolve; });
      const method = ['edit-load', 'save-reload'].includes(boundary) ? 'load' : boundary;
      const original = f.options[method];
      let loads = 0;
      const target = boundary === 'edit-load' ? 2 : boundary === 'save-reload' ? 3 : 1;
      f.options[method] = async (...args) => {
        if (++loads !== target) return original(...args);
        const result = await original(...args);
        entered();
        await gate;
        return result;
      };
      let events = 0;
      f.service.subscribe(() => events++);
      const type = boundary === 'stop' ? 'STOP' : ['status', 'apply'].includes(boundary) ? 'APPLY' : 'SELECT';
      const pending = f.service.request({ type, selection: { mode: 'direct' } });
      await started;
      const calls = copy(f.calls);
      f.service.dispose();
      finish();
      await assert.rejects(pending, { code: 'E_TOOL_CHANGED' });
      assert.deepEqual(f.calls, calls, 'no later read, write, enable or stop');
      assert.equal(events, 0);
    });
  }
}

test('STOP requires known own canStop; unknown or another owner never releases', async () => {
  for (const native of [disabled, { ...enabled, canStop: false },
    { ...enabled, control: 'controlled_by_other_extensions', canStop: false },
    { ...enabled, control: 'controlled_by_other_extensions' },
    { ...disabled, control: 'unknown' }, { bad: true }]) {
    const f = fixture();
    f.setNative(native);
    await ok(f.service, { type: 'GET_STATE' });
    assert.equal((await f.service.request({ type: 'STOP' })).ok, false);
    assert.equal(operations(f, 'stop').length, 0);
  }
  const f = fixture();
  assert.equal((await f.service.request({ type: 'STOP' })).ok, false);
  assert.equal(operations(f, 'stop').length, 0);
});

test('known own release survives status/storage failures without automatic STOP', async () => {
  const f = fixture();
  await ok(f.service, { type: 'APPLY' });
  f.options.status = async () => { throw Object.assign(Error('secret status detail'), { code: 'E_PERMISSION_DENIED' }); };
  const state = await ok(f.service, { type: 'GET_STATE' });
  assert.equal(state.state.runtime.canStop, true);
  assert.equal(operations(f, 'stop').length, 0);
  f.options.load = async () => { throw Error('Storage failed'); };
  assert.equal((await f.service.request({ type: 'STOP' })).ok, false);
  assert.equal(operations(f, 'stop').length, 1);
});

test('status keeps safe codes and permission, rejects malformed status and hides raw errors', async () => {
  for (const permission of [false, null, true]) {
    const f = fixture();
    f.setNative({ ...disabled, state: 'unavailable', permission, statusErrorCode: 'E_PERMISSION_DENIED' });
    const state = await ok(f.service, { type: 'GET_STATE' });
    assert.equal(state.state.runtime.permission, permission);
    assert.equal(state.state.runtime.statusErrorCode, 'E_PERMISSION_DENIED');
    assert.equal(state.state.runtime.applied, false);
    assert.equal((await f.service.request({ type: 'APPLY' })).errorCode, 'E_PERMISSION_DENIED');
    assert.equal(operations(f, 'apply').length, 0);
  }
  for (const code of ['E_REVOKED', 'E_PERMISSION_DENIED', 'E_PREVIEW_GRANT', 'secret-token']) {
    const f = fixture();
    f.options.status = async () => { throw Object.assign(Error('secret raw status'), { code }); };
    const state = await ok(f.service, { type: 'GET_STATE' });
    assert.equal(state.state.config.endpoints.length, 1);
    assert.equal(state.state.runtime.statusErrorCode, code === 'secret-token' ? 'E_OUTCOME_UNKNOWN' : code);
    const refused = await f.service.request({ type: 'APPLY' });
    assert.equal(refused.ok, false);
    assert.equal(refused.errorCode, code === 'secret-token' ? 'E_OUTCOME_UNKNOWN' : code);
    assert.equal(JSON.stringify([state, refused, f.stored()]).includes('secret'), false);
  }
  const f = fixture();
  f.setNative({ ...disabled, statusErrorCode: 'secret-token', permission: 'secret', extra: 'secret' });
  const invalid = await ok(f.service, { type: 'GET_STATE' });
  assert.equal(invalid.state.runtime.state, 'unavailable');
  assert.equal(invalid.state.runtime.outcomeUnknown, true);
  assert.equal(invalid.state.runtime.statusErrorCode, 'E_OUTCOME_UNKNOWN');
  assert.equal(JSON.stringify(invalid).includes('secret'), false);
});


test('permission refusal on a previously active route never reports applied success', async () => {
  const f = fixture();
  await ok(f.service, { type: 'APPLY' });
  f.setNative({ ...enabled, permission: false, statusErrorCode: 'E_REVOKED' });
  const state = await ok(f.service, { type: 'GET_STATE' });
  assert.equal(state.state.runtime.applied, false);
  assert.equal(state.state.runtime.permission, false);
  assert.equal(state.state.runtime.statusErrorCode, 'E_REVOKED');
  assert.equal((await f.service.request({ type: 'APPLY' })).errorCode, 'E_REVOKED');
  assert.equal(operations(f, 'apply').length, 1);
});

test('malformed status cannot erase a previously confirmed own stop capability', async () => {
  const f = fixture();
  await ok(f.service, { type: 'APPLY' });
  f.setNative({ bad: true });
  const state = await ok(f.service, { type: 'GET_STATE' });
  assert.equal(state.state.runtime.canStop, true);
  await ok(f.service, { type: 'STOP' });
  assert.equal(operations(f, 'stop').length, 1);
});


test('adapter returned authorization refusals cannot commit successful Apply or STOP', async () => {
  const f = fixture();
  f.options.apply = async () => ({ ...enabled, permission: false, statusErrorCode: 'E_PERMISSION_DENIED' });
  const refused = await f.service.request({ type: 'APPLY' });
  assert.equal(refused.ok, false);
  assert.equal(refused.errorCode, 'E_PERMISSION_DENIED');
  assert.equal(operations(f, 'save').length, 0);
  const g = fixture();
  await ok(g.service, { type: 'APPLY' });
  const saves = operations(g, 'save').length;
  g.options.stop = async () => ({ ...disabled, permission: false, statusErrorCode: 'E_REVOKED' });
  const stopped = await g.service.request({ type: 'STOP' });
  assert.equal(stopped.ok, false);
  assert.equal(stopped.errorCode, 'E_REVOKED');
  assert.equal(operations(g, 'save').length, saves);
});


test('preview grant code stays visible but does not prove an Apply had no side effect', async () => {
  const f = fixture();
  let attempts = 0;
  f.options.apply = async () => { attempts++; throw Object.assign(Error('private grant details'), { code: 'E_PREVIEW_GRANT' }); };
  assert.equal((await f.service.request({ type: 'APPLY' })).errorCode, 'E_PREVIEW_GRANT');
  f.setNative(enabled);
  const state = await ok(f.service, { type: 'GET_STATE' });
  assert.equal(state.state.runtime.outcomeUnknown, true);
  assert.equal((await f.service.request({ type: 'APPLY' })).errorCode, 'E_OUTCOME_UNKNOWN');
  assert.equal(attempts, 1);
});


for (const code of ['E_PREVIEW_READONLY', 'E_PREVIEW_CAPABILITY', 'E_PREVIEW_CHANGED', 'E_UNRECOGNIZED_SDK_42']) {
  test(`diagnostic ${code} is preserved without classifying it as no-effect refusal`, async () => {
    const f = fixture();
    f.options.status = async () => { throw Object.assign(Error('private native detail'), { code }); };
    const state = await ok(f.service, { type: 'GET_STATE' });
    assert.equal(state.state.runtime.statusErrorCode, code);
    assert.equal(state.state.runtime.outcomeUnknown, true);
    assert.equal(state.state.runtime.canStop, false);
    assert.equal(JSON.stringify(state).includes('private'), false);
    assert.equal((await f.service.request({ type: 'STOP' })).ok, false);
    assert.equal(operations(f, 'stop').length, 0);

    const g = fixture();
    g.setNative({ ...disabled, statusErrorCode: code, permission: null });
    const returned = await ok(g.service, { type: 'GET_STATE' });
    assert.equal(returned.state.runtime.statusErrorCode, code);
    assert.equal(returned.state.runtime.permission, null);
    assert.equal(returned.state.runtime.outcomeUnknown, true);
    assert.equal(returned.state.runtime.applied, false);

    const h = fixture();
    let attempts = 0;
    h.options.apply = async () => { attempts++; throw Object.assign(Error('private native detail'), { code }); };
    assert.equal((await h.service.request({ type: 'APPLY' })).ok, false);
    h.setNative(enabled);
    assert.equal((await ok(h.service, { type: 'GET_STATE' })).state.runtime.outcomeUnknown, true);
    assert.equal((await h.service.request({ type: 'APPLY' })).errorCode, 'E_OUTCOME_UNKNOWN');
    assert.equal(attempts, 1);
  });
}

test('diagnostic code syntax and length reject details rather than storing them', async () => {
  for (const code of ['E_PRIVATE token', 'E_' + 'A'.repeat(61), 'E_private', 'E_', 'E_BAD\n']) {
    const f = fixture();
    f.options.status = async () => { throw Object.assign(Error('private native detail'), { code }); };
    const response = await ok(f.service, { type: 'GET_STATE' });
    assert.equal(response.state.runtime.statusErrorCode, 'E_OUTCOME_UNKNOWN');
    assert.equal(JSON.stringify(response).includes('private'), false);
  }
});

for (const field of ['sources', 'endpoints', 'profiles', 'rules']) {
  test(`corrupt ${field} cannot be normalized and overwritten by a later edit`, async () => {
    for (const value of [null, {}, 'broken', 42, false, undefined]) {
      const damaged = { ...empty(), [field]: value };
      const f = fixture({ config: damaged });
      const result = await f.service.request({ type: 'SELECT', selection: { mode: 'direct' } });
      assert.equal(result.ok, false, `${field}=${JSON.stringify(value)} must be rejected`);
      assert.equal(operations(f, 'save').length, 0);
      assert.deepEqual(f.stored(), damaged);
    }
  });
}

for (const failure of ['load', 'save', 'readback']) {
  test(`confirmed STOP retries only config finalization after ${failure} failure`, async () => {
    const f = fixture({ receipt: failure !== 'readback' });
    await ok(f.service, { type: 'APPLY' });
    const load = f.options.load, save = f.options.save;
    let loads = 0;
    if (failure === 'save') f.options.save = async () => { throw Object.assign(Error('Conflict'), { code: 'E_CONFLICT' }); };
    else f.options.load = async () => {
      if (++loads === (failure === 'readback' ? 2 : 1)) throw Error('Storage unavailable');
      return load();
    };
    assert.equal((await f.service.request({ type: 'STOP' })).ok, false);
    assert.equal(operations(f, 'stop').length, 1);
    f.options.load = load; f.options.save = save;
    const pending = await ok(f.service, { type: 'GET_STATE' });
    assert.equal(pending.state.runtime.stopFinalizationPending, true);
    assert.equal(pending.state.runtime.canStop, false);
    const external = f.stored(); external.endpoints[0].name = 'Other window'; f.replace(external);
    const responses = await Promise.all([f.service.request({ type: 'STOP' }), f.service.request({ type: 'SELECT', selection: { mode: 'direct' } })]);
    assert.equal(responses[0].ok, true, JSON.stringify(responses[0]));
    assert.equal(responses[0].state.runtime.stopFinalizationPending, false);
    assert.equal(responses[1].ok, true);
    assert.equal(f.stored().managed, false);
    assert.equal(f.stored().endpoints[0].name, 'Other window');
    assert.equal(operations(f, 'stop').length, 1);
    assert.equal(operations(f, 'apply').length, 1);
  });
}

test('STOP readback must confirm managed false before finalization succeeds', async () => {
  const f = fixture();
  await ok(f.service, { type: 'APPLY' });
  const save = f.options.save;
  f.options.save = async () => ({ saved: true }); // No confirmed write and old value on readback.
  assert.equal((await f.service.request({ type: 'STOP' })).ok, false);
  assert.equal(f.stored().managed, true);
  f.options.save = save;
  await ok(f.service, { type: 'STOP' });
  assert.equal(f.stored().managed, false);
  assert.equal(operations(f, 'stop').length, 1);
});

test('storage-only STOP finalization cannot clear a subsequent unknown status fence', async () => {
  const f = fixture();
  await ok(f.service, { type: 'APPLY' });
  const save = f.options.save;
  f.options.save = async () => { throw Error('Storage unavailable'); };
  assert.equal((await f.service.request({ type: 'STOP' })).ok, false);
  f.options.save = save;
  f.setNative({ ...enabled, control: 'unknown' });
  assert.equal((await ok(f.service, { type: 'GET_STATE' })).state.runtime.outcomeUnknown, true);
  const finalized = await ok(f.service, { type: 'STOP' });
  assert.equal(finalized.state.config.managed, false);
  assert.equal(finalized.state.runtime.outcomeUnknown, true);
  assert.equal((await f.service.request({ type: 'APPLY' })).errorCode, 'E_OUTCOME_UNKNOWN');
  assert.equal(operations(f, 'stop').length, 1);
  assert.equal(operations(f, 'apply').length, 1);
});

test('a new unknown Apply invalidates pending STOP finalization without replaying Apply', async () => {
  const f = fixture();
  await ok(f.service, { type: 'APPLY' });
  const save = f.options.save;
  f.options.save = async () => { throw Error('Storage unavailable'); };
  assert.equal((await f.service.request({ type: 'STOP' })).ok, false);
  f.options.save = save;
  f.options.apply = async () => {
    f.calls.push(['apply']); f.setNative(enabled);
    throw Object.assign(Error('Lost acknowledgment'), { code: 'E_OUTCOME_UNKNOWN' });
  };
  assert.equal((await f.service.request({ type: 'APPLY' })).ok, false);
  assert.equal((await ok(f.service, { type: 'GET_STATE' })).state.runtime.outcomeUnknown, true);
  assert.equal((await f.service.request({ type: 'APPLY' })).errorCode, 'E_OUTCOME_UNKNOWN');
  await ok(f.service, { type: 'STOP' });
  assert.equal(operations(f, 'stop').length, 2);
  assert.equal(operations(f, 'apply').length, 2);
});

test('dispose during STOP config retry read prevents saving and all queued side effects', async () => {
  const f = fixture();
  await ok(f.service, { type: 'APPLY' });
  const load = f.options.load;
  f.options.load = async () => { throw Error('Storage unavailable'); };
  assert.equal((await f.service.request({ type: 'STOP' })).ok, false);
  const saves = operations(f, 'save').length;
  let entered, resume;
  const started = new Promise(resolve => { entered = resolve; });
  const wait = new Promise(resolve => { resume = resolve; });
  f.options.load = async () => { entered(); await wait; return load(); };
  const retry = f.service.request({ type: 'STOP' });
  await started;
  const queued = f.service.request({ type: 'APPLY' });
  f.service.dispose(); resume();
  await assert.rejects(retry, { code: 'E_TOOL_CHANGED' });
  await assert.rejects(queued, { code: 'E_TOOL_CHANGED' });
  assert.equal(operations(f, 'save').length, saves);
  assert.equal(operations(f, 'stop').length, 1);
  assert.equal(operations(f, 'apply').length, 1);
});

for (const changed of [
  { state: 'conflict', canStop: false, control: 'controlled_by_other_extensions', reason: 'Other owner' },
  { state: 'unavailable', canStop: false, control: 'unknown', reason: 'Unconfirmed' }
]) {
  test(`config-only STOP refresh preserves current ${changed.control} instead of stale disabled status`, async () => {
    const f = fixture();
    await ok(f.service, { type: 'APPLY' });
    const save = f.options.save;
    f.options.save = async () => { throw Error('Storage unavailable'); };
    assert.equal((await f.service.request({ type: 'STOP' })).ok, false);
    f.options.save = save;
    f.setNative(changed);
    const result = await ok(f.service, { type: 'STOP' });
    assert.equal(result.state.runtime.state, changed.state);
    assert.equal(result.state.runtime.control, changed.control);
    assert.equal(result.state.runtime.canStop, false);
    assert.equal(result.state.runtime.applied, false);
    if (changed.control === 'unknown') assert.equal(result.state.runtime.outcomeUnknown, true);
    assert.equal(operations(f, 'stop').length, 1);
    assert.equal(operations(f, 'apply').length, 1);
  });
}

test('config-only STOP with failed status refresh remains unknown and never replays Disable', async () => {
  const f = fixture();
  await ok(f.service, { type: 'APPLY' });
  const save = f.options.save;
  f.options.save = async () => { throw Error('Storage unavailable'); };
  assert.equal((await f.service.request({ type: 'STOP' })).ok, false);
  f.options.save = save;
  f.options.status = async () => { throw Error('Status unavailable'); };
  const result = await ok(f.service, { type: 'STOP' });
  assert.equal(result.state.runtime.state, 'unavailable');
  assert.equal(result.state.runtime.outcomeUnknown, true);
  assert.equal(result.state.config.managed, false);
  assert.equal(operations(f, 'stop').length, 1);
});

for (const refreshFirst of [false, true]) {
  test(`renewed own control invalidates old release confirmation (refresh first: ${refreshFirst})`, async () => {
    const f = fixture();
    await ok(f.service, { type: 'APPLY' });
    const save = f.options.save;
    f.options.save = async () => { throw Error('Storage unavailable'); };
    assert.equal((await f.service.request({ type: 'STOP' })).ok, false);
    f.options.save = save;
    f.setNative(enabled);
    if (refreshFirst) {
      const current = await ok(f.service, { type: 'GET_STATE' });
      assert.equal(current.state.runtime.stopFinalizationPending, false);
    } else {
      const retry = await f.service.request({ type: 'STOP' });
      assert.equal(retry.ok, false);
      assert.equal(f.stored().managed, true);
      assert.equal(operations(f, 'stop').length, 1);
    }
    const stopped = await ok(f.service, { type: 'STOP' });
    assert.equal(stopped.state.runtime.state, 'disabled');
    assert.equal(operations(f, 'stop').length, 2);
  });
}

const routeRule = { id: 'route', domain: 'example.com', includeSubdomains: true, priority: 100, enabled: true, action: 'endpoint', endpointId: 'a' };
for (const [name, message] of [
  ['rule target', { type: 'SAVE_RULE', rule: { ...routeRule, action: 'direct' } }],
  ['endpoint', { type: 'SAVE_ENDPOINT', endpoint: { ...endpoint, host: 'changed.example.com' } }],
  ['selection', { type: 'SELECT', selection: { mode: 'direct' } }],
  ['default target', { type: 'SET_DEFAULT', target: { action: 'endpoint', endpointId: 'a' } }],
  ['enabled rule', { type: 'SAVE_RULE', rule: { ...routeRule, enabled: false } }]
]) {
  test(`pendingChanges tracks ${name} without discarding the active route or applying on save`, async () => {
    const f = fixture({ config: { ...populated(), selection: { mode: 'rules' }, rules: [routeRule] } });
    const applied = await ok(f.service, { type: 'APPLY' });
    assert.equal(applied.state.runtime.pendingChanges, false);
    const edited = await ok(f.service, message);
    assert.equal(edited.state.runtime.pendingChanges, true);
    assert.equal(edited.state.runtime.applied, true);
    assert.deepEqual(edited.state.runtime.activeSelection, { mode: 'rules' });
    assert.equal(operations(f, 'apply').length, 1);
    assert.equal((await ok(f.service, { type: 'APPLY' })).state.runtime.pendingChanges, false);
  });
}

test('pendingChanges ignores metadata, unused endpoints and disabled rules', async () => {
  const f = fixture({ config: { ...populated(), selection: { mode: 'rules' }, rules: [routeRule] } });
  await ok(f.service, { type: 'APPLY' });
  for (const message of [
    { type: 'SAVE_ENDPOINT', endpoint: { ...endpoint, name: 'Renamed' } },
    { type: 'SAVE_PROFILE', profile: { ...profile, name: 'Renamed profile' } },
    { type: 'SAVE_ENDPOINT', endpoint: { ...endpoint, id: 'unused', host: 'unused.example.com' } },
    { type: 'SAVE_RULE', rule: { ...routeRule, id: 'disabled', enabled: false, domain: 'unused.example.com' } }
  ]) assert.equal((await ok(f.service, message)).state.runtime.pendingChanges, false);
  const metadata = f.stored(); metadata.sources[0].displayName = 'Renamed source'; f.replace(metadata);
  assert.equal((await ok(f.service, { type: 'GET_STATE' })).state.runtime.pendingChanges, false);
  assert.equal(operations(f, 'apply').length, 1);
});

test('pendingChanges tracks selected profile endpoint, ignores routes outside direct mode, and clears on revert', async () => {
  const f = fixture();
  await ok(f.service, { type: 'APPLY' });
  assert.equal((await ok(f.service, { type: 'SAVE_ENDPOINT', endpoint: { ...endpoint, port: 8888 } })).state.runtime.pendingChanges, true);
  assert.equal((await ok(f.service, { type: 'SAVE_ENDPOINT', endpoint })).state.runtime.pendingChanges, false);
  await ok(f.service, { type: 'SELECT', selection: { mode: 'direct' } });
  await ok(f.service, { type: 'APPLY' });
  assert.equal((await ok(f.service, { type: 'SAVE_ENDPOINT', endpoint: { ...endpoint, port: 8888 } })).state.runtime.pendingChanges, false);
});

test('unknown active config cannot claim latest config applied, and unknown effects keep pendingChanges true', async () => {
  const f = fixture({ config: { ...populated(), managed: true } });
  f.setNative(enabled);
  const restored = await ok(f.service, { type: 'GET_STATE' });
  assert.equal(restored.state.runtime.pendingChanges, true);
  assert.equal(restored.state.runtime.applied, false);
  await ok(f.service, { type: 'APPLY' });
  f.options.apply = async () => { throw Object.assign(Error('Lost acknowledgment'), { code: 'E_OUTCOME_UNKNOWN' }); };
  assert.equal((await f.service.request({ type: 'APPLY' })).ok, false);
  assert.equal((await ok(f.service, { type: 'GET_STATE' })).state.runtime.pendingChanges, true);
});

test('pendingChanges compares selected PAC text while ignoring its name and unrelated drafts', async () => {
  const pac = { id: 'pac', name: 'PAC', kind: 'pac-inline', sourceId: 'manual', pacText: 'function FindProxyForURL(url,host){return "DIRECT";}' };
  const f = fixture({ config: { ...populated(), profiles: [profile, pac], selection: { mode: 'profile', profileId: 'pac' } } });
  assert.equal((await ok(f.service, { type: 'APPLY', approvedPac: true })).state.runtime.pendingChanges, false);
  // Simulate a separately persisted edit; the service still enforces its active-PAC editor guard.
  const changed = f.stored(); changed.profiles[1].name = 'Renamed'; f.replace(changed);
  assert.equal((await ok(f.service, { type: 'GET_STATE' })).state.runtime.pendingChanges, false);
  changed.profiles[1].pacText = 'function FindProxyForURL(url,host){return "SOCKS5 other.example.com:1080";}';
  f.replace(changed);
  const current = await ok(f.service, { type: 'GET_STATE' });
  assert.equal(current.state.runtime.pendingChanges, true);
  assert.equal(current.state.runtime.applied, true);
  assert.equal(operations(f, 'apply').length, 1);
  assert.equal((await ok(f.service, { type: 'APPLY', approvedPac: true })).state.runtime.pendingChanges, false);
});

test('pendingChanges compares effective rule ordering rather than array order or priority renumbering', async () => {
  const direct = { ...routeRule, id: 'first', action: 'direct', priority: 10 };
  const f = fixture({ config: { ...populated(), selection: { mode: 'rules' }, rules: [direct, routeRule] } });
  await ok(f.service, { type: 'APPLY' });
  const reordered = f.stored(); reordered.rules.reverse(); f.replace(reordered);
  assert.equal((await ok(f.service, { type: 'GET_STATE' })).state.runtime.pendingChanges, false);
  assert.equal((await ok(f.service, { type: 'SAVE_RULE', rule: { ...routeRule, priority: 500 } })).state.runtime.pendingChanges, false);
  assert.equal((await ok(f.service, { type: 'SAVE_RULE', rule: { ...routeRule, priority: 0 } })).state.runtime.pendingChanges, true);
  assert.equal(operations(f, 'apply').length, 1);
});
