import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRelayChannel } from '../../src/native-agent/http-relay-channel.js';
import { startRelay, EXECUTOR_SOURCE_HASH } from '../../native-agent/http-relay/service.mjs';

// Real WebCrypto and real loopback HTTP. Injecting Origin is a Node-only adapter;
// this suite does not establish Chrome Origin, UI, or IndexedDB isolation evidence.
const origin = `chrome-extension://${'a'.repeat(32)}`;
const cli = fileURLToPath(new URL('../../native-agent/http-relay/cli.mjs', import.meta.url));
const executeFile = promisify(execFile);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function privateStore() {
  let value;
  const writes = [];
  return {
    writes,
    async read() { return structuredClone(value); },
    async write(next) { value = structuredClone(next); writes.push(structuredClone(next)); },
    async clear() { value = undefined; },
  };
}

function serialLock() {
  let tail = Promise.resolve(), active = 0, maximum = 0;
  return {
    get maximum() { return maximum; },
    run(work) {
      const result = tail.then(async () => {
        active++; maximum = Math.max(maximum, active);
        try { return await work(); } finally { active--; }
      });
      tail = result.catch(() => {});
      return result;
    },
  };
}

async function fixture(t, { target = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'native-http-channel-'));
  const store = privateStore(), lock = serialLock(), wire = [], effects = [];
  const faults = { rewrite: null };
  let relay, server;
  t.after(async () => {
    try { await relay?.close(); }
    finally {
      if (server?.listening) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
      rmSync(dir, { recursive: true, force: true });
    }
  });
  if (target) {
    server = http.createServer((req, res) => {
      const received = { method: req.method, url: req.url, headers: req.headers };
      effects.push(received);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(received));
    });
    server.listen(43121, '127.0.0.1'); await once(server, 'listening');
  }
  relay = await startRelay({ stateDir: dir, origin });
  const fetchImpl = async (url, options) => {
    assert.equal(new URL(url).origin, 'http://127.0.0.1:43122');
    assert(['GET', 'POST'].includes(options.method));
    const headers = new Headers(options.headers); headers.set('Origin', origin);
    headers.set('Connection', 'close'); // No stale Node fetch pool socket across relay restarts.
    const request = options.body ? JSON.parse(options.body) : null;
    if (new URL(url).pathname === '/hello') {
      assert.equal(options.method, 'POST', 'Chrome discovery must carry Origin through JSON POST');
      assert.deepEqual(request, { v: 1 });
    }
    const response = await fetch(url, { ...options, headers });
    const body = await response.json();
    const entry = { path: new URL(url).pathname, request, response: structuredClone(body) };
    wire.push(entry);
    // Faults run after the real service has handled the complete request.
    const output = faults.rewrite ? await faults.rewrite(entry, body) : body;
    return new Response(JSON.stringify(output), { status: response.status, headers: { 'Content-Type': 'application/json' } });
  };
  const channel = () => createRelayChannel({ store, fetchImpl, withLock: work => lock.run(work), origin });
  async function invitation() {
    const { stdout } = await executeFile(process.execPath, [cli, 'invite', '--state-dir', dir]);
    return JSON.parse(stdout).invitation;
  }
  return {
    store, lock, wire, effects, faults, channel, invitation,
    readState: () => JSON.parse(readFileSync(join(dir, 'state.json'), 'utf8')),
    async restart() { await relay.close(); relay = await startRelay({ stateDir: dir, origin }); },
  };
}

function operation() {
  return {
    operationId: 'operation:channel-proof', runId: 'run:channel-proof', requestId: 'request:channel-proof',
    taskId: 'scrapyjs.capture', revision: 1, sourceHash: 'a'.repeat(64),
    url: 'http://127.0.0.1:43121/http-echo', method: 'GET',
    headers: { 'X-Client-Tag': 'browser-webcrypto' }, userAgent: '',
    deadlineAt: Date.now() + 5000, leaseMs: 2000,
    authority: {
      mode: 'installedTask', installation: { version: '0.6.0', manifestHash: 'b'.repeat(64), installationId: 'installation:channel-proof', generation: 1 },
      namespace: 'tasks', principal: 'task:scrapyjs.capture', grantIncarnation: 'grant:channel-proof',
      resultId: 'result:channel-proof', browserSessionIncarnation: 'browser:channel-proof', appBindingHash: null,
    },
  };
}

async function terminal(channel, operationId) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const state = await channel.rpc('status', { operationId });
    if (state.status !== 'running') return state;
    await delay(10);
  }
  assert.fail('Node HTTP operation did not reach terminal status');
}

test('browser WebCrypto pairs with CLI invitation, shares serialized sequence, executes real HTTP, and verifies revoke acknowledgement', async t => {
  assert.equal(typeof crypto.subtle.deriveBits, 'function');
  const f = await fixture(t, { target: true }), channel = f.channel();
  assert.deepEqual(await channel.status(), { paired: false });
  const encoded = await f.invitation();
  const invitation = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  assert.deepEqual(await channel.pair(encoded), { paired: true });
  const pair = await f.store.read(), serverPair = f.readState().pairing;
  assert.equal(pair.key, serverPair.key, 'WebCrypto HKDF agrees with Node crypto');
  assert.equal(pair.phase, 'active'); assert.equal(pair.key.length, 64);
  assert.equal(pair.sessionId, serverPair.sessionId);
  assert(f.store.writes.some(value => value.phase === 'confirming'));
  assert.equal(JSON.stringify(f.wire).includes(invitation.secret), false);

  // Two trusted consumers share the same private store and lock, as UI + SW do.
  const other = f.channel();
  const statuses = await Promise.all([channel.status(), other.rpc('status'), channel.rpc('status')]);
  assert(statuses.every(status => status.paired && status.pid === process.pid));
  assert.equal(f.lock.maximum, 1);
  const sequences = f.wire.filter(entry => entry.request?.mac).map(entry => entry.request.seq);
  assert.deepEqual(sequences, [1, 2, 3]);

  const op = operation();
  assert.deepEqual(await channel.rpc('register', op), { operationId: op.operationId, status: 'registered' });
  assert.equal(f.effects.length, 0);
  assert.deepEqual(await channel.rpc('execute', { operationId: op.operationId }), { operationId: op.operationId, status: 'running' });
  const done = await terminal(channel, op.operationId);
  assert.equal(done.status, 'completed'); assert.equal(done.result.status, 200);
  assert.equal(done.result.executor.pid, process.pid); assert.equal(done.result.executor.sourceHash, EXECUTOR_SOURCE_HASH);
  assert.equal(done.result.executor.remotePort, 43121);
  const echoed = JSON.parse(done.result.body);
  assert.equal(echoed.headers['user-agent'], 'OpenDesk-NativeHTTP/1.0');
  assert.equal(echoed.headers['x-client-tag'], 'browser-webcrypto');
  assert.equal(echoed.headers['x-opendesk-run-id'], op.runId);
  assert.equal(echoed.headers['x-opendesk-request-id'], op.requestId);
  assert.equal(f.effects.length, 1);

  // A forged acknowledgement must not clear the saved channel key.
  f.faults.rewrite = (entry, body) => entry.request?.method === 'revoke' ? { ...body, mac: '0'.repeat(64) } : body;
  await assert.rejects(channel.revoke(), { code: 'E_NATIVE_AUTH' });
  assert.equal((await f.store.read()).key, pair.key);
  assert.equal(f.readState().pairing, null, 'real revoke happened despite forged/lost acknowledgement');
});

test('valid signed revoke acknowledgement clears private key and cannot be reused', async t => {
  const f = await fixture(t), channel = f.channel();
  await channel.pair(await f.invitation());
  assert.equal((await channel.status()).paired, true);
  assert.deepEqual(await channel.revoke(), { paired: false });
  const ack = f.wire.at(-1);
  assert.equal(ack.request.method, 'revoke'); assert.equal(ack.response.ok, true);
  assert.equal(ack.response.generation, ack.request.generation);
  assert.equal(ack.response.body.generation, ack.request.generation + 1);
  assert.equal(await f.store.read(), undefined); assert.equal(f.readState().pairing, null);
  assert.deepEqual(await channel.status(), { paired: false });
  await assert.rejects(channel.rpc('status'), { code: 'E_NATIVE_PAIR_REQUIRED' });
});

test('restart authenticates hello before persisting, keeps long key, and never replays registered HTTP', async t => {
  const f = await fixture(t, { target: true }), channel = f.channel();
  await channel.pair(await f.invitation()); await channel.status();
  const op = operation(); await channel.rpc('register', op);
  const before = await f.store.read();
  await f.restart();
  assert.deepEqual(await f.store.read(), before);
  assert.equal(f.readState().generation, before.generation + 1);
  assert.notEqual(f.readState().pairing.sessionId, before.sessionId);
  assert.equal(f.readState().pairing.seq, 0);

  f.faults.rewrite = (entry, body) => entry.request?.method === 'status' ? { ...body, mac: 'f'.repeat(64) } : body;
  await assert.rejects(channel.status(), { code: 'E_NATIVE_AUTH' });
  assert.deepEqual(await f.store.read(), before, 'unverified candidate never reaches private store');
  assert.equal(f.readState().pairing.seq, 1, 'real service accepted candidate status');
  f.faults.rewrite = null;
  const status = await channel.status(), after = await f.store.read();
  assert.equal(status.generation, before.generation + 1);
  assert.equal(after.key, before.key); assert.equal(after.clientId, before.clientId);
  assert.equal(after.generation, status.generation); assert.equal(after.seq, 2);
  assert.notEqual(after.sessionId, before.sessionId);
  assert.equal((await channel.rpc('status', { operationId: op.operationId })).status, 'unknown');
  await assert.rejects(channel.rpc('execute', { operationId: op.operationId }), { code: 'E_NATIVE_REQUEST' });
  assert.equal(f.effects.length, 0);
});

test('lost signed-status response reconciles sequence through hello without key or manual sequence repair', async t => {
  const f = await fixture(t), channel = f.channel();
  await channel.pair(await f.invitation());
  const before = await f.store.read();
  let drop = true;
  f.faults.rewrite = (entry, body) => {
    if (entry.request?.method === 'status' && drop) { drop = false; throw new Error('simulated response loss after service acceptance'); }
    return body;
  };
  await assert.rejects(channel.status(), { code: 'E_NATIVE_UNAVAILABLE' });
  assert.deepEqual(await f.store.read(), before);
  assert.equal(f.readState().pairing.seq, before.seq + 1);
  assert.equal((await channel.status()).paired, true);
  const hello = f.wire.filter(entry => entry.path === '/hello').at(-1).response;
  assert.equal(hello.lastSeq, before.seq + 1);
  const after = await f.store.read();
  assert.equal(after.key, before.key); assert.equal(after.generation, before.generation);
  assert.equal(after.sessionId, before.sessionId); assert.equal(after.seq, before.seq + 2);
});

test('forged invitation server proof is rejected before client proof or key persistence', async t => {
  const f = await fixture(t), channel = f.channel();
  const invitation = await f.invitation();
  f.faults.rewrite = (entry, body) => entry.request?.method === 'pair.challenge'
    ? { ...body, body: { ...body.body, serverProof: '0'.repeat(64) } } : body;
  await assert.rejects(channel.pair(invitation), { code: 'E_NATIVE_AUTH' });
  assert.equal(await f.store.read(), undefined); assert.equal(f.store.writes.length, 0);
  assert.equal(f.readState().pairing, null);
  assert.deepEqual(f.wire.map(entry => entry.request?.method), ['pair.challenge']);
  // The impostor did not consume the invitation or poison the serialized lock.
  f.faults.rewrite = null;
  assert.deepEqual(await channel.pair(invitation), { paired: true });
  assert.equal((await channel.status()).paired, true);
});

test('lost final pairing response recovers confirming key through authenticated status', async t => {
  const f = await fixture(t), channel = f.channel();
  f.faults.rewrite = (entry, body) => {
    if (entry.request?.method === 'pair.confirm') throw new Error('simulated final pairing response loss');
    return body;
  };
  await assert.rejects(channel.pair(await f.invitation()), { code: 'E_NATIVE_UNAVAILABLE' });
  const confirming = await f.store.read();
  assert.equal(confirming.phase, 'confirming');
  assert.equal(confirming.key, f.readState().pairing.key);
  f.faults.rewrite = null;
  assert.equal((await channel.status()).paired, true);
  const active = await f.store.read();
  assert.equal(active.phase, 'active'); assert.equal(active.key, confirming.key);
  assert.equal(f.wire.filter(entry => entry.request?.method === 'pair.confirm').length, 1);
});

test('Stop while execute waits for the shared lock is checked before dispatch and prevents the target effect', async t => {
  const f = await fixture(t, { target: true }), channel = f.channel();
  await channel.pair(await f.invitation());
  const op = operation(); await channel.rpc('register', op);
  const before = await f.store.read();
  let release, entered, stopped = false, checks = 0;
  const gate = new Promise(resolve => { release = resolve; });
  const inside = new Promise(resolve => { entered = resolve; });
  const held = f.lock.run(async () => { entered(); await gate; });
  await inside;
  const pending = channel.rpc('execute', { operationId: op.operationId }, async () => {
    checks++;
    assert.equal((await f.store.read()).seq, before.seq + 1, 'sequence reserved before last authority/Stop check');
    assert.equal(f.readState().pairing.seq, before.seq, 'execute has not reached the real service');
    if (stopped) throw Object.assign(new Error('Run stopped while waiting for channel lock'), { code: 'E_STOPPED' });
  });
  const rejected = assert.rejects(pending, { code: 'E_STOPPED' });
  assert.equal(checks, 0, 'guard must wait for the shared lock');
  stopped = true;
  release(); await held; await rejected;
  assert.equal(checks, 1);
  assert.equal(f.wire.filter(entry => entry.request?.method === 'execute').length, 0);
  assert.equal(f.effects.length, 0);
  assert.equal(f.readState().operations[op.operationId].status, 'registered');
  assert.deepEqual(await channel.rpc('cancel', { operationId: op.operationId }), { operationId: op.operationId, status: 'cancelled' });
  assert.equal(f.effects.length, 0);
});

test('explicit revoke clears a stranded confirming record when Node is unreachable and reports CLI cleanup', async () => {
  const store = privateStore(), lock = serialLock();
  const pair = { clientId: 'confirming-client', sessionId: 's'.repeat(43), generation: 1, key: 'a'.repeat(64), seq: 0, phase: 'confirming' };
  await store.write(pair);
  let calls = 0;
  const channel = createRelayChannel({ store, origin, withLock: work => lock.run(work), fetchImpl: async (_url, options) => {
    calls++; assert.equal(JSON.parse(options.body).method, 'revoke');
    throw new Error('Node service unreachable');
  } });
  assert.deepEqual(await store.read(), pair, 'record remains until explicit revoke');
  const result = await channel.revoke();
  assert.equal(result.paired, false);
  assert.match(result.notice, /状态未知/);
  assert.match(result.notice, /本机执行 revoke/);
  assert.equal(await store.read(), undefined);
  assert.equal(calls, 1, 'failed revoke is never retried');
  assert.deepEqual(await channel.status(), { paired: false });
  assert.equal(calls, 1, 'cleared local state requires no further network request');
});

test('failed revoke of an active pair preserves its key and reserved sequence instead of clearing it', async () => {
  const store = privateStore(), lock = serialLock();
  const pair = { clientId: 'active-client', sessionId: 's'.repeat(43), generation: 1, key: 'b'.repeat(64), seq: 5, phase: 'active' };
  await store.write(pair);
  let calls = 0;
  const channel = createRelayChannel({ store, origin, withLock: work => lock.run(work), fetchImpl: async (_url, options) => {
    calls++; assert.equal(JSON.parse(options.body).method, 'revoke');
    throw new Error('Node service unreachable');
  } });
  await assert.rejects(channel.revoke(), { code: 'E_NATIVE_UNAVAILABLE' });
  assert.deepEqual(await store.read(), { ...pair, seq: pair.seq + 1 });
  assert.equal(calls, 1, 'uncertain revoke is never retried');
});
