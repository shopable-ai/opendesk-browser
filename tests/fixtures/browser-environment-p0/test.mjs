// Node mocks only: these tests do not establish native Chrome/CDP behavior.
import test from 'node:test';
import assert from 'node:assert/strict';
import {setImmediate as nextTurn} from 'node:timers/promises';
import {request} from 'node:http';
import {once} from 'node:events';
import {mkdir, mkdtemp, readFile, readdir, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createController, isAllowedTab, OVERRIDE, readEnvironment} from './worker.js';
import {createServer} from './server.mjs';

const BASE = 'http://127.0.0.1:43128/browser-env-p0/';
const EXTENSION_ID = 'abcdefghijklmnopabcdefghijklmnop';
const PANEL_URL = `chrome-extension://${EXTENSION_ID}/panel.html`;
const TARGET = 11;
const CONTROL = 12;
const WINDOW = 7;
const RESET = [
  ['Emulation.clearDeviceMetricsOverride', {}],
  ['Emulation.setTimezoneOverride', {timezoneId: ''}],
  ['Emulation.setUserAgentOverride', {userAgent: ''}]
];
const START = [
  ['Emulation.setUserAgentOverride', OVERRIDE],
  ['Emulation.setTimezoneOverride', {timezoneId: 'Pacific/Honolulu'}],
  ['Emulation.setDeviceMetricsOverride', {width: 1024, height: 768, deviceScaleFactor: 1.5, mobile: false}]
];
const clone = value => structuredClone(value);

// Real local HTTP requests to the collector, never the active port 43128.
async function collectorFixture(t) {
  const evidenceDir = await mkdtemp(join(tmpdir(), 'p0-collector-test-'));
  const server = createServer({evidenceDir, extensionId: EXTENSION_ID});
  t.after(async () => {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await rm(evidenceDir, {recursive: true, force: true});
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const send = (path, {method = 'GET', headers = {}, payload} = {}) => new Promise((resolve, reject) => {
    const req = request({hostname: '127.0.0.1', port: server.address().port,
      path: `/browser-env-p0/${path}`, method,
      headers: {Host: '127.0.0.1:43128', ...headers}}, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('error', reject);
      res.on('end', () => resolve({status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString()}));
    });
    req.on('error', reject);
    req.end(payload === undefined ? undefined : JSON.stringify(payload));
  });
  const session = await send('evidence-session', {method: 'POST', headers: {Origin: `chrome-extension://${EXTENSION_ID}`}});
  assert.equal(session.status, 200);
  const token = JSON.parse(session.body).token;
  const headers = {Origin: `chrome-extension://${EXTENSION_ID}`, 'Content-Type': 'application/json', 'X-P0-Evidence-Token': token};
  const payload = {actionId: randomUUID(), trigger: {extensionId: EXTENSION_ID, href: PANEL_URL}, result: {ok: true}};
  return {send, token, headers, payload, evidenceDir};
}

test('issues an unpredictable evidence token scoped to each collector instance', async t => {
  const first = await collectorFixture(t);
  const second = await collectorFixture(t);
  assert.match(first.token, /^[a-f0-9-]{36}$/);
  assert.notEqual(first.token, second.token);
  const again = await first.send('evidence-session', {method: 'POST', headers: {Origin: first.headers.Origin}});
  assert.equal(JSON.parse(again.body).token, first.token);
});

for (const [name, changeHeaders] of [
  ['missing Origin', headers => { delete headers.Origin; }],
  ['a different extension Origin', headers => { headers.Origin = `chrome-extension://${'p'.repeat(32)}`; }],
  ['missing evidence token', headers => { delete headers['X-P0-Evidence-Token']; }],
  ['an incorrect evidence token', headers => { headers['X-P0-Evidence-Token'] = randomUUID(); }]
]) {
  test(`rejects evidence POST with ${name} without writing evidence`, async t => {
    const f = await collectorFixture(t);
    const headers = {...f.headers};
    changeHeaders(headers);
    const response = await f.send('evidence/after', {method: 'POST', headers, payload: f.payload});
    assert.equal(response.status, 403);
    assert.deepEqual(await readdir(f.evidenceDir), []);
  });
}

test('takes the authenticated evidence action from the route rather than payload fields', async t => {
  const f = await collectorFixture(t);
  const payload = {...f.payload, action: 'stop', collector: {origin: 'https://forged.invalid/'}};
  const response = await f.send('evidence/after', {method: 'POST', headers: f.headers, payload});
  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(response.body), {saved: true});
  const row = JSON.parse((await readFile(join(f.evidenceDir, 'actions.jsonl'), 'utf8')).trim());
  assert.equal(row.action, 'after');
  assert.equal(row.collector.origin, f.headers.Origin);
  assert.equal(row.actionId, payload.actionId);
  // Derived snapshots exclude the collector-owned routing/audit fields.
  assert.deepEqual(JSON.parse(await readFile(join(f.evidenceDir, 'after.json'), 'utf8')), f.payload);
  assert.deepEqual((await readdir(f.evidenceDir)).sort(), ['actions.jsonl', 'after.json']);
});

test('appends an authenticated actionId only once when the evidence POST is retried', async t => {
  const f = await collectorFixture(t);
  for (let attempt = 0; attempt < 2; attempt++) {
    assert.equal((await f.send('evidence/after', {method: 'POST', headers: f.headers, payload: f.payload})).status, 200);
  }
  const rows = (await readFile(join(f.evidenceDir, 'actions.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].actionId, f.payload.actionId);
});

async function beforeWithFailedSnapshot(t) {
  const f = await collectorFixture(t);
  const snapshotPath = join(f.evidenceDir, 'before.json');
  await mkdir(snapshotPath);
  const post = payload => f.send('evidence/before', {method: 'POST', headers: f.headers, payload});
  assert.equal((await post(f.payload)).status, 500, 'the snapshot directory must cause the initial write to fail');
  const raw = await readFile(join(f.evidenceDir, 'actions.jsonl'), 'utf8');
  const rows = raw.trim().split('\n').map(line => JSON.parse(line));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].actionId, f.payload.actionId);
  await rm(snapshotPath, {recursive: true});
  return {...f, snapshotPath, post, raw};
}

test('repairs the missing before snapshot on retry without appending its raw action twice', async t => {
  const f = await beforeWithFailedSnapshot(t);
  assert.equal((await f.post(f.payload)).status, 200);
  assert.deepEqual(JSON.parse(await readFile(f.snapshotPath, 'utf8')), f.payload);
  assert.equal(await readFile(join(f.evidenceDir, 'actions.jsonl'), 'utf8'), f.raw);
});

test('keeps the newer before snapshot when an older repaired action is retried', async t => {
  const f = await beforeWithFailedSnapshot(t);
  assert.equal((await f.post(f.payload)).status, 200);
  const newer = {...f.payload, actionId: randomUUID(), result: {ok: true, observation: 'newer'}};
  assert.equal((await f.post(newer)).status, 200);
  const snapshot = await readFile(f.snapshotPath, 'utf8');
  assert.deepEqual(JSON.parse(snapshot), newer);
  const raw = await readFile(join(f.evidenceDir, 'actions.jsonl'), 'utf8');
  assert.deepEqual(raw.trim().split('\n').map(line => JSON.parse(line).actionId), [f.payload.actionId, newer.actionId]);
  assert.equal((await f.post(f.payload)).status, 200);
  assert.equal(await readFile(f.snapshotPath, 'utf8'), snapshot);
  assert.equal(await readFile(join(f.evidenceDir, 'actions.jsonl'), 'utf8'), raw);
});

function observation(tab, modified = false) {
  return {
    href: tab.url, observedAt: '2026-10-27T00:00:00.000Z',
    js: {
      userAgent: modified ? OVERRIDE.userAgent : 'Native Mac Chrome UA',
      platform: modified ? OVERRIDE.platform : 'MacIntel',
      language: modified ? 'en-US' : 'zh-CN',
      languages: modified ? ['en-US', 'en'] : ['zh-CN', 'zh'],
      userAgentData: modified ? {
        brands: OVERRIDE.userAgentMetadata.brands, mobile: false, platform: 'Linux',
        highEntropy: OVERRIDE.userAgentMetadata
      } : {
        brands: [{brand: 'Chromium', version: '131'}], mobile: false, platform: 'macOS',
        highEntropy: {platform: 'macOS', architecture: 'arm', bitness: '64'}
      },
      timeZone: modified ? 'Pacific/Honolulu' : 'Asia/Shanghai',
      viewport: {innerWidth: modified ? 1024 : 1280, innerHeight: modified ? 768 : 800,
        outerWidth: 1440, outerHeight: 900, devicePixelRatio: modified ? 1.5 : 2}
    },
    http: {headers: {
      'user-agent': modified ? OVERRIDE.userAgent : 'Native Mac Chrome UA',
      'accept-language': modified ? OVERRIDE.acceptLanguage : 'zh-CN,zh;q=0.9'
    }}
  };
}

function fixture(options = {}) {
  const tabs = new Map([
    [TARGET, {id: TARGET, windowId: WINDOW, url: `${BASE}?role=target`, status: 'complete'}],
    [CONTROL, {id: CONTROL, windowId: WINDOW, url: `${BASE}?role=control`, status: 'complete'}]
  ]);
  const calls = [];
  let stored = clone(options.stored ?? {});
  let attached = false;
  let modified = false;
  let failMethod = options.failMethod;
  let readHook;
  let commandHook;
  const documents = new Map([[TARGET, 1], [CONTROL, 1]]);
  const record = (name, ...args) => calls.push({name, args: clone(args)});
  const api = {
    runtime: {id: EXTENSION_ID, getURL: path => `chrome-extension://${EXTENSION_ID}/${path}`},
    storage: {session: {
      get: async key => { record('get', key); return clone(stored); },
      set: async value => { record('set', value); stored = {...stored, ...clone(value)}; }
    }},
    tabs: {
      get: async id => {
        record('tab.get', id);
        if (!tabs.has(id)) throw new Error('No tab with id');
        return clone(tabs.get(id));
      },
      query: async query => { record('query', query); return clone([...tabs.values()]); },
      reload: async (...args) => {
        record('reload', ...args);
        documents.set(args[0], documents.get(args[0]) + 1);
      },
      remove: async id => { record('remove', id); tabs.delete(id); }
    },
    debugger: {
      attach: async (...args) => {
        record('attach', ...args);
        if (options.attachConflict) throw new Error('Another debugger is already attached');
        assert.equal(attached, false, 'mock refuses duplicate attachment');
        attached = true;
      },
      sendCommand: async (source, method, params) => {
        record('command', source, method, params);
        assert.equal(attached, true, 'commands require ownership');
        if (method === failMethod) { failMethod = null; throw new Error(`Injected command failure: ${method}`); }
        if (method === 'Emulation.setDeviceMetricsOverride') modified = true;
        if (commandHook) await commandHook(source, method, params);
        return {};
      },
      detach: async source => {
        record('detach', source);
        assert.equal(attached, true, 'must never detach a foreign session');
        if (options.failDetach) throw new Error('Injected detach failure');
        attached = false;
        modified = false;
      }
    },
    scripting: {executeScript: async request => {
      const {target, world, func} = request;
      record('executeScript', {target, world});
      assert.equal(world, 'MAIN');
      assert.equal(func, readEnvironment);
      assert.deepEqual(Object.keys(target), ['tabId']);
      const value = observation(tabs.get(target.tabId), modified && target.tabId === TARGET);
      const rows = [{frameId: 0, documentId: `document-${target.tabId}-${documents.get(target.tabId)}`, result: clone(value)}];
      return readHook ? readHook(target.tabId, rows) : rows;
    }}
  };
  const controller = createController(api);
  const sender = {id: EXTENSION_ID, url: PANEL_URL};
  const dispatch = (type, fields = {}) => controller.dispatch({type, ...fields}, sender);
  return {
    api, controller, sender, dispatch, tabs, calls,
    named: name => calls.filter(call => call.name === name),
    commands: () => calls.filter(call => call.name === 'command').map(call => call.args.slice(1)),
    readWith: hook => { readHook = hook; },
    commandWith: hook => { commandHook = hook; },
    detachedExternally: () => { attached = false; modified = false; },
    bind: () => dispatch('P0_BIND', {targetId: TARGET, controlId: CONTROL}),
    async before() { await this.bind(); return dispatch('P0_OBSERVE'); },
    async start() { await this.before(); return dispatch('P0_START'); },
    state: async () => (await dispatch('P0_STATUS')).state
  };
}

for (const [name, sender] of [
  ['missing sender', undefined], ['missing id', {url: PANEL_URL}],
  ['foreign extension', {id: 'foreign', url: PANEL_URL}],
  ['website sender', {id: EXTENSION_ID, url: BASE}],
  ['another extension page', {id: EXTENSION_ID, url: PANEL_URL.replace('panel.html', 'worker.js')}],
  ['panel query suffix', {id: EXTENSION_ID, url: `${PANEL_URL}?spoof=1`}],
  ['panel fragment suffix', {id: EXTENSION_ID, url: `${PANEL_URL}#spoof`}]
]) {
  test(`rejects ${name} before accessing Chrome APIs`, async () => {
    const f = fixture();
    await assert.rejects(f.controller.dispatch({type: 'P0_LIST'}, sender), /UNTRUSTED_SENDER/);
    assert.deepEqual(f.calls, []);
  });
}

for (const [name, url] of [
  ['external origin', 'https://example.com/browser-env-p0/'],
  ['localhost alias', 'http://localhost:43128/browser-env-p0/'],
  ['other port', 'http://127.0.0.1:43129/browser-env-p0/'],
  ['HTTPS origin', 'https://127.0.0.1:43128/browser-env-p0/'],
  ['sibling path', `${BASE}other`], ['missing trailing slash', BASE.slice(0, -1)],
  ['encoded path', BASE.replace('browser-env-p0', '%62rowser-env-p0')],
  ['lookalike host', 'http://127.0.0.1.example.com:43128/browser-env-p0/'],
  ['invalid URL', 'not a URL']
]) {
  test(`rejects ${name} as a local target`, () => {
    assert.equal(isAllowedTab({id: TARGET, url}), false);
  });
}

test('accepts the exact local path with target/control role query parameters', () => {
  assert.equal(isAllowedTab({id: TARGET, url: `${BASE}?role=target`}), true);
});

test('rejects a tab without an integer identity', () => {
  assert.equal(isAllowedTab({id: String(TARGET), url: BASE}), false);
});

test('lists only tabs on the exact permitted local origin and path', async () => {
  const f = fixture();
  f.tabs.set(99, {id: 99, windowId: WINDOW, url: 'https://example.com/', status: 'complete'});
  assert.deepEqual((await f.dispatch('P0_LIST')).tabs.map(tab => tab.id), [TARGET, CONTROL]);
});

test('binds different target and control tabs in the same window', async () => {
  const f = fixture();
  assert.deepEqual((await f.bind()).state.binding, {
    target: {id: TARGET, windowId: WINDOW, url: `${BASE}?role=target`},
    control: {id: CONTROL, windowId: WINDOW, url: `${BASE}?role=control`}
  });
});

test('rejects binding the same tab as both target and control', async () => {
  const f = fixture();
  await assert.rejects(f.dispatch('P0_BIND', {targetId: TARGET, controlId: TARGET}), /INVALID_BINDING/);
  assert.equal((await f.state()).binding, null);
});

test('rejects target and control in different windows', async () => {
  const f = fixture();
  f.tabs.get(CONTROL).windowId++;
  await assert.rejects(f.bind(), /INVALID_BINDING/);
});

test('requires a before observation before attaching', async () => {
  const f = fixture();
  await f.bind();
  await assert.rejects(f.dispatch('P0_START'), /BEFORE_REQUIRED/);
  assert.equal(f.named('attach').length, 0);
});

test('uses the main-frame InjectionResult as the before observation', async () => {
  const f = fixture();
  f.readWith((id, rows) => [{frameId: 3, result: {wrongFrame: true}}, ...rows]);
  const result = await f.before();
  const {documentId, ...observed} = result.state.before.target;
  assert.deepEqual(observed, {tabId: TARGET, windowId: WINDOW, ...observation(f.tabs.get(TARGET))});
});

test('does not accept missing main-frame observation as a before baseline', async () => {
  const f = fixture();
  await f.bind();
  f.readWith(() => [{frameId: 3, result: {}}]);
  await assert.rejects(f.dispatch('P0_OBSERVE'), /OBSERVATION_MISSING/);
  assert.equal((await f.state()).before, null);
});

test('issues exactly the three fixed CDP overrides in order to the target only', async () => {
  const f = fixture();
  const result = await f.start();
  assert.deepEqual(f.named('attach').map(call => call.args), [[{tabId: TARGET}, '1.3']]);
  assert.deepEqual(f.commands(), START);
  assert(f.named('command').every(call => call.args[0].tabId === TARGET));
  assert.equal(result.state.phase, 'MODIFIED');
  assert.equal(result.observation.target.js.userAgent, OVERRIDE.userAgent);
  assert.equal(result.observation.control.js.userAgent, 'Native Mac Chrome UA');
});

test('does not reattach or replay override commands on repeated start', async () => {
  const f = fixture();
  await f.start();
  assert.equal((await f.dispatch('P0_START')).repeated, true);
  assert.equal(f.named('attach').length, 1);
  assert.deepEqual(f.commands(), START);
});

test('restores only after reset, detach, reload, and fresh observations of both tabs', async () => {
  const f = fixture();
  await f.start();
  const offset = f.calls.length;
  const result = await f.dispatch('P0_STOP');
  assert.deepEqual(f.commands().slice(3), RESET);
  const events = f.calls.slice(offset).filter(call => ['command', 'detach', 'reload', 'executeScript'].includes(call.name));
  assert.deepEqual(events.map(call => call.name), ['command', 'command', 'command', 'detach', 'reload', 'executeScript', 'executeScript']);
  assert.deepEqual(events.slice(-2).map(call => call.args[0].target.tabId).sort(), [TARGET, CONTROL]);
  assert.equal(result.state.phase, 'RESTORED_OBSERVED');
});

test('does not report restoration when the readback is missing', async () => {
  const f = fixture();
  await f.start();
  f.readWith(() => []);
  await assert.rejects(f.dispatch('P0_STOP'), /OBSERVATION_MISSING/);
  assert.equal((await f.state()).phase, 'RESTORE_UNVERIFIED');
});

test('does not detach or replay reset commands on repeated stop', async () => {
  const f = fixture();
  await f.start();
  await f.dispatch('P0_STOP');
  const commands = clone(f.commands());
  const reloads = f.named('reload').length;
  const result = await f.dispatch('P0_STOP');
  assert.equal(f.named('detach').length, 1);
  assert.deepEqual(f.commands(), commands);
  assert.equal(f.named('reload').length, reloads);
  assert.equal(result.state.phase, 'RESTORED_OBSERVED');
});

test('clears the binding without detaching a target that was removed', async () => {
  const f = fixture();
  await f.start();
  f.tabs.delete(TARGET);
  f.detachedExternally(); // Chrome destroys the debugger session with the tab.
  await f.controller.onRemoved(TARGET);
  const state = await f.state();
  assert.equal(state.phase, 'CLOSED');
  assert.equal(state.owned, false);
  assert.equal(state.binding, null);
  assert.equal(state.before, null);
  assert.equal(f.named('detach').length, 0);
  assert.deepEqual(f.commands(), START);
});

test('releases the owned session but retains its recovery lock and binding after control removal', async () => {
  const f = fixture();
  await f.start();
  const before = await f.state();
  f.tabs.delete(CONTROL);
  await f.controller.onRemoved(CONTROL);
  assert.deepEqual(f.commands().slice(3), RESET);
  assert.deepEqual(f.named('detach').map(call => call.args), [[{tabId: TARGET}]]);
  const state = await f.state();
  // Detach success does not establish restoration of the still-open target.
  assert.equal(state.phase, 'RESTORE_UNVERIFIED');
  assert.equal(state.owned, false);
  assert.deepEqual(state.binding, before.binding);
  assert.deepEqual(state.before, before.before);
  await assert.rejects(f.bind(), /STOP_OR_RECOVER/);
});

test('ignores removal of a tab outside the binding', async () => {
  const f = fixture();
  await f.start();
  const before = await f.state();
  const offset = f.calls.length;
  await f.controller.onRemoved(99);
  assert.equal(f.calls.length, offset);
  assert.deepEqual(await f.state(), before);
});

test('marks external target detach unverified and does not detach again on stop', async () => {
  const f = fixture();
  await f.start();
  f.detachedExternally();
  await f.controller.onDetached({tabId: TARGET}, 'canceled_by_user');
  const state = await f.state();
  assert.equal(state.phase, 'RESTORE_UNVERIFIED');
  assert.equal(state.owned, false);
  await f.dispatch('P0_STOP');
  assert.equal(f.named('detach').length, 0);
  assert.deepEqual(f.commands(), START);
});

test('refreshes a canceled target only on explicit Stop, then strictly verifies the replacement document', async () => {
  const f = fixture();
  await f.start();
  const reloads = f.named('reload').length;
  f.detachedExternally();
  f.readWith((id, rows) => {
    if (id === TARGET && f.named('reload').length === reloads) {
      rows[0].result.js.language = 'en-US';
      rows[0].result.js.languages = ['en-US', 'en'];
    }
    return rows;
  });
  await f.controller.onDetached({tabId: TARGET}, 'canceled_by_user');
  assert.equal(f.named('reload').length, reloads, 'onDetach must not reload automatically');
  const observed = await f.dispatch('P0_OBSERVE');
  assert.equal(observed.observation.target.js.language, 'en-US');
  await assert.rejects(f.dispatch('P0_START'), /RESTORE_VERIFICATION_REQUIRED/);
  await assert.rejects(f.bind(), /STOP_OR_RECOVER_FIRST/);
  const stopped = await f.dispatch('P0_STOP');
  assert.equal(stopped.state.phase, 'RESTORED_OBSERVED');
  assert.equal(f.named('reload').length, reloads + 1);
  assert.equal(f.named('reload').at(-1).args[0], TARGET);
  assert.equal(f.named('attach').length, 1);
  assert.equal(f.named('detach').length, 0);
  assert.deepEqual(f.commands(), START);
  await f.dispatch('P0_STOP');
  assert.equal(f.named('reload').length, reloads + 1, 'consume the refresh intent once');
});

test('keeps persistent canceled-language residue locked after its one explicit refresh', async () => {
  const f = fixture();
  await f.start();
  f.detachedExternally();
  await f.controller.onDetached({tabId: TARGET}, 'canceled_by_user');
  const baseline = (await f.state()).before;
  f.readWith((id, rows) => {
    if (id === TARGET) rows[0].result.js.languages = ['en-US', 'en'];
    return rows;
  });
  const reloads = f.named('reload').length;
  assert.equal((await f.dispatch('P0_STOP')).state.phase, 'RESTORE_UNVERIFIED');
  assert.equal((await f.dispatch('P0_STOP')).state.phase, 'RESTORE_UNVERIFIED');
  assert.equal(f.named('reload').length, reloads + 1);
  assert.deepEqual((await f.state()).before, baseline);
  await assert.rejects(f.bind(), /STOP_OR_RECOVER_FIRST/);
});

for (const changed of ['target URL', 'target window', 'control removed']) {
  test(`refuses canceled-target refresh after ${changed}`, async () => {
    const f = fixture();
    await f.start();
    f.detachedExternally();
    await f.controller.onDetached({tabId: TARGET}, 'canceled_by_user');
    if (changed === 'target URL') f.tabs.get(TARGET).url = BASE + '?role=replaced';
    if (changed === 'target window') f.tabs.get(TARGET).windowId++;
    if (changed === 'control removed') f.tabs.delete(CONTROL);
    const offset = f.calls.length;
    await assert.rejects(f.dispatch('P0_STOP'), /TARGET_IDENTITY_CHANGED|No tab/);
    assert.equal(f.calls.slice(offset).some(c => ['reload', 'attach', 'detach', 'command'].includes(c.name)), false);
    assert.equal((await f.state()).phase, 'RESTORE_UNVERIFIED');
  });
}

test('does not restore a canceled refresh intent from storage after Worker recovery', async () => {
  const source = fixture();
  await source.start();
  source.detachedExternally();
  await source.controller.onDetached({tabId: TARGET}, 'canceled_by_user');
  const f = fixture({stored: {p0: await source.state()}});
  assert.equal((await f.controller.recover()).phase, 'RECOVERY_REQUIRED');
  await assert.rejects(f.dispatch('P0_STOP'), /RECOVERY_REQUIRED/);
  assert.equal(f.named('reload').length, 0);
});

test('does not grant a refresh for an ambiguous or already-unowned detach', async () => {
  for (const reason of ['target_closed', 'canceled_by_user']) {
    const f = fixture();
    await f.start();
    f.detachedExternally();
    await f.controller.onDetached({tabId: TARGET}, 'target_closed');
    if (reason === 'canceled_by_user') await f.controller.onDetached({tabId: TARGET}, reason);
    const reloads = f.named('reload').length;
    await f.dispatch('P0_STOP');
    assert.equal(f.named('reload').length, reloads);
  }
});

test('ignores detach events for a tab outside the owned target', async () => {
  const f = fixture();
  await f.start();
  const before = await f.state();
  const offset = f.calls.length;
  await f.controller.onDetached({tabId: CONTROL}, 'canceled_by_user');
  assert.equal(f.calls.length, offset);
  assert.deepEqual(await f.state(), before);
});

// All of these fields are directly affected by the three overrides. Successful
// reset/detach promises cannot stand in for matching the observed baseline.
for (const [name, mutate] of [
  ['JavaScript user agent', value => { value.js.userAgent = 'still overridden'; }],
  ['HTTP user agent', value => { value.http.headers['user-agent'] = 'still overridden'; }],
  ['timezone', value => { value.js.timeZone = 'Pacific/Honolulu'; }],
  ['navigator platform', value => { value.js.platform = OVERRIDE.platform; }],
  ['navigator languages', value => { value.js.languages = ['en-US', 'en']; }],
  ['HTTP accept-language', value => { value.http.headers['accept-language'] = OVERRIDE.acceptLanguage; }],
  ['UA client hints', value => { value.js.userAgentData.highEntropy.platform = 'Linux'; }],
  ['device metrics', value => { value.js.viewport.devicePixelRatio = 1.5; }]
]) {
  test(`keeps restoration unverified when target ${name} differs from before`, async () => {
    const f = fixture();
    await f.start();
    f.readWith((id, rows) => { if (id === TARGET) mutate(rows[0].result); return rows; });
    const result = await f.dispatch('P0_STOP');
    assert.equal(result.state.phase, 'RESTORE_UNVERIFIED', `${name} mismatch must not be reported restored`);
  });
}

test('keeps restoration unverified when control readback changed', async () => {
  const f = fixture();
  await f.start();
  f.readWith((id, rows) => { if (id === CONTROL) rows[0].result.js.userAgent = 'control changed'; return rows; });
  assert.equal((await f.dispatch('P0_STOP')).state.phase, 'RESTORE_UNVERIFIED');
});

test('does not reset or detach a foreign debugger after attach conflict', async () => {
  const f = fixture({attachConflict: true});
  await f.before();
  await assert.rejects(f.dispatch('P0_START'), /Another debugger is already attached/);
  assert.deepEqual(f.commands(), []);
  assert.equal(f.named('detach').length, 0);
  assert.equal((await f.state()).owned, false);
});

for (const [index, [method]] of START.entries()) {
  test(`cleans up only its owned target session when ${method} fails`, async () => {
    const f = fixture({failMethod: method});
    await f.before();
    await assert.rejects(f.dispatch('P0_START'), /Injected command failure/);
    assert.deepEqual(f.commands(), [...START.slice(0, index + 1), ...RESET]);
    assert.deepEqual(f.named('detach').map(call => call.args), [[{tabId: TARGET}]]);
    assert(f.named('command').every(call => call.args[0].tabId === TARGET));
    assert.equal((await f.state()).owned, false);
  });
}

for (const id of [TARGET, CONTROL]) {
  for (const [change, mutate] of [
    ['navigation', tab => { tab.url = 'https://example.com/'; }],
    ['same-origin document URL change', tab => { tab.url = `${BASE}?role=replaced`; }],
    ['window movement', tab => { tab.windowId++; }]
  ]) {
    test(`cleans up the owned session after ${id === TARGET ? 'target' : 'control'} ${change}`, async () => {
      const f = fixture();
      await f.start();
      mutate(f.tabs.get(id));
      await f.controller.onUpdated(id, {}, clone(f.tabs.get(id)));
      assert.deepEqual(f.commands().slice(3), RESET);
      assert.deepEqual(f.named('detach').map(call => call.args), [[{tabId: TARGET}]]);
      // Cleanup is not readback proof: keep the baseline and recovery lock
      // until restoration is observed or the original target is closed.
      assert.equal((await f.state()).phase, 'RESTORE_UNVERIFIED');
      await assert.rejects(f.bind(), /STOP_OR_RECOVER/);
    });
  }
}

test('rejects a readback that races a change in target identity', async () => {
  const f = fixture();
  await f.bind();
  f.readWith((id, rows) => { if (id === TARGET) f.tabs.get(TARGET).url = `${BASE}?new-document`; return rows; });
  await assert.rejects(f.dispatch('P0_OBSERVE'), /TARGET_IDENTITY_CHANGED/);
  assert.equal((await f.state()).before, null);
});

test('rejects rebinding while restoration is unverified without clearing the before baseline', async () => {
  const f = fixture({failMethod: START[1][0]});
  await f.before();
  const before = (await f.state()).before;
  await assert.rejects(f.dispatch('P0_START'), /Injected command failure/);
  assert.equal((await f.state()).phase, 'RESTORE_UNVERIFIED');
  await assert.rejects(f.bind(), /RESTORE|STOP_OR_RECOVER/);
  assert.deepEqual((await f.state()).before, before);
});

async function recoveryRequiredFixture() {
  const source = fixture();
  await source.before();
  const stored = {...await source.state(), phase: 'MODIFIED', owned: true, detachedConfirmed: false};
  const f = fixture({stored: {p0: stored}});
  assert.equal((await f.controller.recover()).phase, 'RECOVERY_REQUIRED');
  return f;
}

test('preserves recovery required after a bound target navigates', async () => {
  const f = await recoveryRequiredFixture();
  f.tabs.get(TARGET).url = `${BASE}?role=replaced`;
  await f.controller.onUpdated(TARGET, {url: f.tabs.get(TARGET).url}, clone(f.tabs.get(TARGET)));
  assert.equal((await f.state()).phase, 'RECOVERY_REQUIRED');
  await assert.rejects(f.bind(), /RECOVERY|STOP_OR_RECOVER/);
  assert.equal(f.named('detach').length, 0);
});

test('preserves recovery required after the control tab is removed', async () => {
  const f = await recoveryRequiredFixture();
  f.tabs.delete(CONTROL);
  await f.controller.onRemoved(CONTROL);
  assert.equal((await f.state()).phase, 'RECOVERY_REQUIRED');
  await assert.rejects(f.dispatch('P0_START'), /RECOVERY_REQUIRED/);
  assert.equal(f.named('detach').length, 0);
});

test('preserves unverified restoration and its baseline after target navigation', async () => {
  const f = fixture({failMethod: START[1][0]});
  await f.before();
  await assert.rejects(f.dispatch('P0_START'), /Injected command failure/);
  const before = await f.state();
  f.tabs.get(TARGET).url = `${BASE}?role=replaced`;
  await f.controller.onUpdated(TARGET, {url: f.tabs.get(TARGET).url}, clone(f.tabs.get(TARGET)));
  const state = await f.state();
  assert.equal(state.phase, 'RESTORE_UNVERIFIED');
  assert.deepEqual(state.binding, before.binding);
  assert.deepEqual(state.before, before.before);
  await assert.rejects(f.bind(), /STOP_OR_RECOVER/);
});

for (const phase of ['RECOVERY_REQUIRED', 'RESTORE_UNVERIFIED']) {
  test(`clears ${phase} when the original target is removed`, async () => {
    let f;
    if (phase === 'RECOVERY_REQUIRED') {
      f = await recoveryRequiredFixture();
    } else {
      f = fixture({failMethod: START[1][0]});
      await f.before();
      await assert.rejects(f.dispatch('P0_START'), /Injected command failure/);
    }
    assert.equal((await f.state()).phase, phase);
    const detaches = f.named('detach').length;
    f.tabs.delete(TARGET);
    await f.controller.onRemoved(TARGET);
    const state = await f.state();
    assert.equal(state.phase, 'CLOSED');
    assert.equal(state.owned, false);
    assert.equal(state.binding, null);
    assert.equal(state.before, null);
    assert.equal(f.named('detach').length, detaches);
  });
}

test('retains the owned target binding when cleanup fails after control removal', async () => {
  const f = fixture({failDetach: true});
  await f.start();
  const before = await f.state();
  f.tabs.delete(CONTROL);
  await f.controller.onRemoved(CONTROL);
  const state = await f.state();
  assert.equal(state.phase, 'RESTORE_UNVERIFIED');
  assert.equal(state.owned, true);
  assert.deepEqual(state.binding, before.binding, 'failed detach must retain the target identity for cleanup');
  assert.deepEqual(state.before, before.before);
});

for (const index of [0, 1]) {
  test(`guards target identity before override ${index + 2} after navigation during override ${index + 1}`, async () => {
    const f = fixture();
    await f.before();
    f.commandWith((source, method, params) => {
      if (method === START[index][0] && JSON.stringify(params) === JSON.stringify(START[index][1])) {
        f.tabs.get(TARGET).url = 'https://example.com/';
      }
    });
    await assert.rejects(f.dispatch('P0_START'), /TARGET_IDENTITY_CHANGED/);
    const overrides = f.commands().filter(([method, params]) =>
      START.some(([expectedMethod, expectedParams]) => method === expectedMethod && JSON.stringify(params) === JSON.stringify(expectedParams)));
    assert.deepEqual(overrides, START.slice(0, index + 1), 'no further modifying override may reach the navigated target');
  });
}

test('only reads restoration after recovering a confirmed detach without reloading the target', async () => {
  const source = fixture();
  await source.start();
  source.readWith(() => []);
  await assert.rejects(source.dispatch('P0_STOP'), /OBSERVATION_MISSING/);
  const stored = await source.state();
  assert.equal(stored.owned, false);
  assert.equal(stored.detachedConfirmed, true);
  const f = fixture({stored: {p0: stored}});
  assert.equal((await f.controller.recover()).phase, 'RESTORE_UNVERIFIED');
  const result = await f.dispatch('P0_STOP');
  assert.equal(f.named('reload').length, 0, 'confirmed-detach recovery must not replay a reload side effect');
  assert.equal(f.named('attach').length, 0);
  assert.equal(f.named('detach').length, 0);
  assert.deepEqual(f.commands(), []);
  assert.deepEqual(f.named('executeScript').map(call => call.args[0].target.tabId).sort(), [TARGET, CONTROL]);
  assert.equal(result.state.phase, 'RESTORED_OBSERVED');
});

test('allows one extra owned-stop layout refresh but keeps a persistent mismatch unverified', async t => {
  const f = fixture();
  await f.start();
  f.readWith((id, rows) => {
    if (id === TARGET) rows[0].result.js.viewport.innerHeight--;
    return rows;
  });
  t.mock.timers.enable({apis: ['setTimeout']});
  const readCount = f.named('executeScript').length;
  const reloadCount = f.named('reload').length;
  let settled = false;
  const stopping = f.dispatch('P0_STOP').finally(() => { settled = true; });
  await nextTurn();
  for (let i = 0; i < 100; i++) {
    assert.equal(settled, false, 'layout mismatch must keep polling within the ten-second window');
    t.mock.timers.tick(100);
    await nextTurn();
  }
  assert.equal(settled, true, 'layout polling must terminate at the ten-second bound');
  assert.equal((await stopping).state.phase, 'RESTORE_UNVERIFIED');
  assert.equal(f.named('reload').length - reloadCount, 2, 'owned Stop may refresh once after its initial restoration reload');
  assert.equal(f.named('executeScript').length - readCount, 204, 'the extra refresh requires fresh readback of both tabs');
});

for (const phase of ['STARTING', 'MODIFIED', 'RESTORE_UNVERIFIED', 'RECOVERY_REQUIRED']) {
  for (const owned of [true, false]) {
  test(`does not attach or detach when recovering ${phase} with stored owned=${owned}`, async () => {
    const f = fixture({stored: {p0: {
      phase, owned, binding: {
        target: {id: TARGET, windowId: WINDOW, url: `${BASE}?role=target`},
        control: {id: CONTROL, windowId: WINDOW, url: `${BASE}?role=control`}
      }, before: null, logs: []
    }}});
    assert.equal((await f.controller.recover()).phase, 'RECOVERY_REQUIRED');
    await assert.rejects(f.dispatch('P0_START'), /RECOVERY_REQUIRED/);
    await assert.rejects(f.dispatch('P0_STOP'), /RECOVERY_REQUIRED/);
    await assert.rejects(f.bind(), /STOP_OR_RECOVER_FIRST/);
    assert.equal(f.named('attach').length, 0);
    assert.equal(f.named('detach').length, 0);
    assert.deepEqual(f.commands(), []);
  });
  }
}
