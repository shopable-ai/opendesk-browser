import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { once } from 'node:events';
import { startRelay, EXECUTOR_SOURCE_HASH } from '../service.mjs';
import { post, envelope, verifyResponse } from '../client.mjs';
import { random, secretBytes, sign, proof, deriveKey, equal, LIMIT } from '../protocol.mjs';
const origin = 'chrome-extension://' + 'a'.repeat(32);
const cli = resolve('native-agent/http-relay/cli.mjs');
const exec = promisify(execFile);
const sleep = ms => new Promise(r => setTimeout(r, ms));
function op(overrides = {}) {
  return { operationId: random(), runId: random(), requestId: random(), taskId: 'scrapyjs.capture', revision: 1, sourceHash: 'a'.repeat(64), url: 'http://127.0.0.1:43121/echo', method: 'GET', headers: {}, userAgent: '', deadlineAt: Date.now() + 4000, leaseMs: 2000, authority: { mode: 'installedTask', installation: { version: '0.6.0', manifestHash: 'b'.repeat(64), installationId: 'install:' + random(), generation: 1 }, namespace: 'tasks', principal: 'task:task', grantIncarnation: random(), resultId: random(), browserSessionIncarnation: random(), appBindingHash: null }, ...overrides };
}
async function control(dir, method) {
  const state = JSON.parse(readFileSync(join(dir, 'state.json')));
  return post('/control', sign(secretBytes(state.controlKey), { id: random(), at: Date.now(), method, body: {} }));
}
async function invite(dir, expiresAt = Date.now() + 59000) {
  const state = JSON.parse(readFileSync(join(dir, 'state.json')));
  const invitation = { invitationId: random(), secret: random(), generation: state.generation, expiresAt };
  writeFileSync(join(dir, 'invitation.json'), JSON.stringify(invitation), { mode: 0o600 });
  const result = await control(dir, 'invite');
  assert.equal(result.error, undefined); assert.equal(JSON.stringify(result).includes(invitation.secret), false);
  return invitation;
}
function getHello() { return new Promise((resolve, reject) => { http.get('http://127.0.0.1:43122/hello', { headers: { Origin: origin }, agent: false }, res => { let body = ''; res.on('data', chunk => body += chunk); res.on('error', reject); res.on('end', () => { try { resolve(JSON.parse(body)); } catch (error) { reject(error); } }); }).on('error', reject); }); }
const pairPost = (method, body) => post('/rpc', { v: 1, method, body }, { origin });
async function pairing(dir) {
  const invitation = await invite(dir);
  const challenge = await pairPost('pair.challenge', { invitationId: invitation.invitationId, generation: invitation.generation, clientId: 'browser', clientNonce: random() });
  assert.equal(challenge.ok, true);
  const { serverProof, ...transcript } = challenge.body;
  assert(equal(serverProof, proof(secretBytes(invitation.secret), 'server', transcript)));
  const key = deriveKey(invitation.secret, transcript);
  const ready = await pairPost('pair.prove', { sessionId: transcript.sessionId, proof: proof(secretBytes(invitation.secret), 'client', transcript) });
  assert(equal(ready.body.proof, proof(key, 'ready', transcript)));
  assert.equal(JSON.parse(readFileSync(join(dir, 'state.json'))).pairing, null);
  const confirmed = await pairPost('pair.confirm', { sessionId: transcript.sessionId, proof: proof(key, 'confirm', transcript) });
  assert(equal(confirmed.body.proof, proof(key, 'paired', transcript)));
  const identity = { clientId: transcript.clientId, sessionId: transcript.sessionId, generation: transcript.generation };
  let seq = 0;
  async function reconnect() { const hello = await getHello(); identity.generation = hello.generation; identity.sessionId = hello.sessionId; seq = hello.lastSeq; return rpc('status', {}); }
  function request(method, body) { return envelope(key, identity, ++seq, random(), method, body); }
  async function rpc(method, body) { const req = request(method, body); return verifyResponse(key, req, await post('/rpc', req, { origin })); }
  return { rpc, request, identity, key, reconnect };
}
async function terminal(c, operationId, timeout = 3000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) { const response = await c.rpc('status', { operationId }); if (!['registered', 'running'].includes(response.body.status)) return response; await sleep(10); }
  throw new Error('terminal status timeout');
}
async function execute(c, operationId) { const ack = await c.rpc('execute', { operationId }); assert.deepEqual(ack.body, { operationId, status: 'running' }); return terminal(c, operationId); }
async function fixture(t, handler) {
  const dir = mkdtempSync(join(tmpdir(), 'http-relay-test-'));
  const target = http.createServer(handler);
  target.listen(43121, '127.0.0.1'); await once(target, 'listening');
  let relay;
  try { relay = await startRelay({ stateDir: dir, origin }); }
  catch (error) { target.close(); rmSync(dir, { recursive: true }); throw error; }
  t.after(async () => { await relay.close(); target.closeAllConnections(); await new Promise(r => target.close(r)); rmSync(dir, { recursive: true }); });
  return { dir, target, get relay() { return relay; }, async restart() { await relay.close(); relay = await startRelay({ stateDir: dir, origin }); } };
}

test('real HTTP GET, custom/default UA, immutable registration, full binding and executor identity', async t => {
  const received = [];
  const f = await fixture(t, (req, res) => { received.push({ ua: req.headers['user-agent'], url: req.url, runId: req.headers['x-opendesk-run-id'], requestId: req.headers['x-opendesk-request-id'], tag: req.headers['x-client-tag'] }); res.setHeader('Set-Cookie', 'secret=value'); res.end('hello'); });
  const c = await pairing(f.dir);
  for (const ua of ['', 'U'.repeat(512)]) {
    const operation = op({ userAgent: ua, operationId: 'operation:' + random(), headers: { 'X-Client-Tag': 'test' } });
    assert.equal((await c.rpc('register', operation)).body.status, 'registered');
    assert.equal(received.length, ua ? 1 : 0);
    assert.equal((await c.rpc('register', { ...operation, userAgent: 'changed' })).body.code, 'OPERATION_EXISTS');
    const execution = await execute(c, operation.operationId);
    assert.equal(execution.body.status, 'completed');
    const result = execution.body.result;
    assert.equal(received.at(-1).runId, operation.runId); assert.equal(received.at(-1).requestId, operation.requestId); assert.equal(received.at(-1).tag, 'test');
    assert.equal(result.body, 'hello'); assert.equal(result.status, 200); assert.equal(result.headers['set-cookie'], undefined);
    assert.equal(result.executor.pid, process.pid); assert.equal(result.executor.nodeVersion, process.version);
    assert.equal(result.executor.sourceHash, EXECUTOR_SOURCE_HASH); assert.equal(result.executor.localAddress, '127.0.0.1');
    assert.equal(result.executor.remoteAddress, '127.0.0.1'); assert.equal(result.executor.remotePort, 43121);
    assert(result.executor.localPort > 0);
    assert.equal((await c.rpc('execute', { operationId: operation.operationId })).body.code, 'OPERATION_NOT_EXECUTABLE');
    assert.deepEqual((await c.rpc('renew', { operationId: operation.operationId, leaseMs: 500 })).body, { operationId: operation.operationId, status: 'completed' });
  }
  assert.deepEqual(received.map(x => x.ua), ['OpenDesk-NativeHTTP/1.0', 'U'.repeat(512)]);
  assert.equal(statSync(f.dir).mode & 0o777, 0o700); assert.equal(statSync(join(f.dir, 'state.json')).mode & 0o777, 0o600);
});

test('pair impostor, expired/single-use invitation, final confirmation, strict origins and tamper/replay', async t => {
  const f = await fixture(t, (_req, res) => res.end('ok'));
  assert.equal((await post('/rpc', { v: 1, method: 'pair.challenge', body: {} })).error, 'TRANSPORT');
  assert.equal((await post('/rpc', {}, { origin: 'null' })).error, 'TRANSPORT');
  assert.equal((await post('/rpc', {}, { origin: 'chrome-extension://' + 'b'.repeat(32) })).error, 'TRANSPORT');
  const inv = await invite(f.dir, Date.now() + 80);
  const challenge = await pairPost('pair.challenge', { invitationId: inv.invitationId, generation: inv.generation, clientId: 'impostor', clientNonce: random() });
  assert.equal((await pairPost('pair.prove', { sessionId: challenge.body.sessionId, proof: '0'.repeat(64) })).error, 'PAIR_PROOF');
  await sleep(100);
  assert.equal((await pairPost('pair.prove', { sessionId: challenge.body.sessionId, proof: '0'.repeat(64) })).error, 'PAIR_INVALID');
  const c = await pairing(f.dir);
  const hello = await post('/hello', { v: 1 }, { origin });
  assert.deepEqual(hello, await getHello(), 'POST discovery retains strict legacy GET metadata');
  assert.equal(hello.sessionId, c.identity.sessionId);
  assert.equal(hello.lastSeq, 0, 'discovery does not consume an authenticated sequence');
  for (const wrongOrigin of [undefined, 'null', 'chrome-extension://' + 'b'.repeat(32)]) {
    assert.equal((await post('/hello', { v: 1 }, { origin: wrongOrigin })).error, 'TRANSPORT');
  }
  for (const body of [{}, { v: 2 }, { v: 1, extra: true }, null]) {
    assert.equal((await post('/hello', body, { origin })).error, 'INVALID_REQUEST');
  }
  const req = c.request('status', {});
  const response = await post('/rpc', req, { origin }); verifyResponse(c.key, req, response);
  assert.equal((await post('/rpc', req, { origin })).error, 'REPLAY');
  const tampered = c.request('register', op()); tampered.body.url = 'http://example.com/';
  assert.equal((await post('/rpc', tampered, { origin })).error, 'AUTH');
  assert.throws(() => verifyResponse(c.key, req, { ...response, seq: 999 }), /RESPONSE_AUTH/);
  assert.equal((await control(f.dir, 'revoke')).generation, 2);
  assert.equal((await post('/rpc', c.request('status', {}), { origin })).error, 'AUTH');
});

test('reject target/method/header/authority/oversize/deadline before HTTP effects', async t => {
  let effects = 0;
  const f = await fixture(t, (_req, res) => { effects++; res.end('ok'); });
  const c = await pairing(f.dir);
  for (const change of [
    { url: 'https://127.0.0.1:43121/' }, { url: 'http://example.com/' }, { url: 'http://127.0.0.1:43122/' },
    { method: 'POST' }, { headers: { Host: 'evil' } }, { headers: { Cookie: 'secret' } },
    { headers: { Accept: 'x\r\nInjected: y' } }, { headers: { Accept: 'a', accept: 'b' } },
    { userAgent: 'bad\nUA' }, { headers: { 'x-opendesk-run-id': 'forged' } }, { headers: { 'x-opendesk-request-id': 'forged' } }, { deadlineAt: Date.now() - 1 }, { deadlineAt: Date.now() + 20000 },
    { revision: '1' }, { authority: {} }, { leaseMs: 2001 },
  ]) assert.equal((await c.rpc('register', op(change))).ok, false);
  const large = c.request('register', op({ userAgent: 'x'.repeat(LIMIT) }));
  await assert.rejects(post('/rpc', large, { origin }), /REQUEST_TOO_LARGE/);
  // Exercise service budget independently of the client budget check.
  const raw = JSON.stringify(large);
  const oversize = await new Promise((resolveResult, reject) => {
    const req = http.request({ host: '127.0.0.1', port: 43122, path: '/rpc', method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(raw) } }, res => { let data = ''; res.on('data', c => data += c); res.on('end', () => resolveResult(JSON.parse(data))); });
    req.on('error', reject); req.end(raw);
  });
  assert.equal(oversize.error, 'REQUEST_TOO_LARGE'); assert.equal(effects, 0);
});

test('500 and redirect are HTTP results; no redirect follow; early close and response limits', async t => {
  let effects = 0;
  const f = await fixture(t, (req, res) => {
    effects++;
    if (req.url === '/500') { res.writeHead(500); res.end('failed'); }
    else if (req.url === '/redirect') { res.writeHead(302, { Location: 'http://example.com/' }); res.end('redirect'); }
    else if (req.url === '/early') { res.writeHead(200, { 'Content-Length': 100 }); res.write('partial'); setTimeout(() => res.destroy(), 10); }
    else res.end('x'.repeat(3073));
  });
  const c = await pairing(f.dir);
  for (const [path, status, httpStatus] of [['500', 'completed', 500], ['redirect', 'completed', 302], ['early', 'early_close'], ['large', 'response_too_large']]) {
    const operation = op({ url: `http://127.0.0.1:43121/${path}` });
    await c.rpc('register', operation);
    const result = (await execute(c, operation.operationId)).body;
    assert.equal(result.status, status); if (httpStatus) assert.equal(result.result.status, httpStatus);
  }
  assert.equal(effects, 4);
});

test('cancel/timeout/lease destroy streaming; renew bounded; individual RPC disconnect does not cancel', async t => {
  let closed = 0, started = 0;
  const f = await fixture(t, (_req, res) => {
    started++; res.write('stream'); const interval = setInterval(() => res.write('.'), 20);
    res.on('close', () => { closed++; clearInterval(interval); });
  });
  const c = await pairing(f.dir);
  for (const kind of ['cancel', 'timeout', 'lease']) {
    const operation = op({ deadlineAt: Date.now() + (kind === 'timeout' ? 150 : 2000), leaseMs: kind === 'lease' ? 100 : 1000 });
    await c.rpc('register', operation);
    assert.equal((await c.rpc('execute', { operationId: operation.operationId })).body.status, 'running');
    while (started <= closed) await sleep(5);
    if (kind === 'cancel') await c.rpc('cancel', { operationId: operation.operationId });
    assert.equal((await terminal(c, operation.operationId)).body.status, { cancel: 'cancelled', timeout: 'timeout', lease: 'lease_expired' }[kind]);
    await sleep(25); assert.equal(started, closed);
  }
  const operation = op({ leaseMs: 150 }); await c.rpc('register', operation);
  const request = c.request('execute', { operationId: operation.operationId }); const data = JSON.stringify(request);
  const disconnected = http.request({ host: '127.0.0.1', port: 43122, path: '/rpc', method: 'POST', agent: false, headers: { Origin: origin, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } });
  disconnected.on('error', () => {}); disconnected.on('response', res => res.resume()); disconnected.end(data);
  while (started < 4) await sleep(5);
  disconnected.destroy();
  await sleep(80);
  assert.equal((await c.rpc('renew', { operationId: operation.operationId, leaseMs: 500 })).ok, true);
  await sleep(120); assert.equal((await c.rpc('status', { operationId: operation.operationId })).body.status, 'running');
  assert.equal((await c.rpc('renew', { operationId: operation.operationId, leaseMs: 2001 })).ok, false);
  await c.rpc('cancel', { operationId: operation.operationId });
  await sleep(25); assert.equal(closed, 4);
});

test('restart retains anti-replay and unknown operations; immutable run budget and draft binding', async t => {
  let effects = 0;
  const f = await fixture(t, (_req, res) => { effects++; res.end('ok'); });
  const c = await pairing(f.dir);
  const completedBeforeRestart = op();
  await c.rpc('register', completedBeforeRestart);
  assert.equal((await execute(c, completedBeforeRestart.operationId)).body.result.body, 'ok');
  const operation = op(); await c.rpc('register', operation);
  const statusReq = c.request('status', {}); await post('/rpc', statusReq, { origin });
  await f.restart();
  assert.equal((await post('/rpc', statusReq, { origin })).error, 'AUTH');
  assert.equal((await c.reconnect()).ok, true);
  assert.equal((await c.rpc('status', { operationId: operation.operationId })).body.status, 'unknown');
  assert.equal((await c.rpc('execute', { operationId: operation.operationId })).body.code, 'OPERATION_NOT_EXECUTABLE');
  async function assertHidden(client, old) {
    assert.deepEqual((await client.rpc('status', { operationId: old.operationId })).body, { operationId: old.operationId, status: 'unknown' });
    assert.equal((await client.rpc('execute', { operationId: old.operationId })).body.code, 'OPERATION_NOT_EXECUTABLE');
    const history = JSON.parse(readFileSync(join(f.dir, 'state.json'))).operations[old.operationId];
    assert.equal(history.status, 'completed', 'internal prior-generation history remains intact');
    assert.equal(history.result.body, 'ok');
  }
  await assertHidden(c, completedBeforeRestart);
  assert.equal(effects, 1);
  const draft = op(); draft.authority = { ...draft.authority, mode: 'draftRun', installation: null };
  assert.equal((await c.rpc('register', draft)).ok, true);
  const installed = op({ authority: { ...op().authority, appBindingHash: 'c'.repeat(64) } });
  assert.equal((await c.rpc('register', installed)).ok, true);
  for (const mutation of [{ installation: { ...installed.authority.installation, installationId: 'different' } }, { appBindingHash: 'd'.repeat(64) }]) {
    assert.equal((await c.rpc('register', { ...installed, operationId: random(), requestId: random(), authority: { ...installed.authority, ...mutation } })).body.code, 'RUN_BUDGET');
  }
  const changed = { ...draft, operationId: random(), requestId: random(), authority: { ...draft.authority, grantIncarnation: random() } };
  assert.equal((await c.rpc('register', changed)).body.code, 'RUN_BUDGET');
  const extended = { ...draft, operationId: random(), requestId: random(), deadlineAt: draft.deadlineAt + 1000 };
  assert.equal((await c.rpc('register', extended)).body.code, 'RUN_BUDGET');
  const completedBeforeRevoke = op();
  await c.rpc('register', completedBeforeRevoke);
  assert.equal((await execute(c, completedBeforeRevoke.operationId)).body.result.body, 'ok');
  assert.equal((await c.rpc('revoke', {})).body.status, 'revoked');
  const replacement = await pairing(f.dir);
  await assertHidden(replacement, completedBeforeRevoke);
  await assertHidden(replacement, completedBeforeRestart);
  assert.deepEqual((await replacement.rpc('status', { operationId: operation.operationId })).body, { operationId: operation.operationId, status: 'unknown' });
  assert.equal(effects, 2, 'restart and re-pair status queries never replay target HTTP');
});

test('CLI start/status/invite/revoke/stop and collision never kill the foreign listener', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'http-relay-cli-'));
  const child = spawn(process.execPath, [cli, 'start', '--origin', origin, '--state-dir', dir], { stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(async () => { if (child.exitCode === null) { child.kill('SIGTERM'); await once(child, 'exit'); } rmSync(dir, { recursive: true }); });
  let stderr = ''; child.stderr.on('data', c => stderr += c);
  await Promise.race([once(child.stdout, 'data'), once(child, 'exit').then(() => { throw new Error(stderr); })]);
  const run = command => exec(process.execPath, [cli, command, '--state-dir', dir]);
  assert.equal(JSON.parse((await run('status')).stdout).pid, child.pid);
  const invited = JSON.parse((await run('invite')).stdout);
  const invitation = JSON.parse(Buffer.from(invited.invitation, 'base64url'));
  assert.equal(invitation.secret.length, 43);
  const collisionDir = mkdtempSync(join(tmpdir(), 'http-relay-collision-'));
  try { await assert.rejects(exec(process.execPath, [cli, 'start', '--origin', origin, '--state-dir', collisionDir]), /EADDRINUSE/); }
  finally { rmSync(collisionDir, { recursive: true }); }
  assert.equal(JSON.parse((await run('status')).stdout).pid, child.pid);
  assert.equal(JSON.parse((await run('revoke')).stdout).generation, 2);
  const exit = once(child, 'exit'); await run('stop'); await exit;
  assert.equal(child.exitCode, 0);
});

test('real process crash retains long key, rotates generation/session, authenticates hello, never replays running effect', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'http-relay-crash-'));
  let effects = 0, closed = 0, child;
  const target = http.createServer((_req, res) => {
    effects++; res.write('stream');
    const timer = setInterval(() => res.write('.'), 25);
    res.on('close', () => { closed++; clearInterval(timer); });
  });
  target.listen(43121, '127.0.0.1'); await once(target, 'listening');
  t.after(async () => {
    if (child && child.exitCode === null && child.signalCode === null) { const exit = once(child, 'exit'); child.kill('SIGTERM'); await exit; }
    target.closeAllConnections(); await new Promise(r => target.close(r)); rmSync(dir, { recursive: true });
  });
  async function boot() {
    child = spawn(process.execPath, [cli, 'start', '--origin', origin, '--state-dir', dir], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = ''; child.stderr.on('data', c => stderr += c);
    await Promise.race([once(child.stdout, 'data'), once(child, 'exit').then(() => { throw new Error(stderr); })]);
  }
  await boot(); const c = await pairing(dir);
  const before = { ...c.identity };
  assert.equal((await getHello()).sessionId, before.sessionId);
  const key = JSON.parse(readFileSync(join(dir, 'state.json'))).pairing.key;
  const operation = op(); await c.rpc('register', operation);
  assert.equal((await c.rpc('execute', { operationId: operation.operationId })).body.status, 'running');
  for (let i = 0; effects === 0 && i < 100; i++) await sleep(10);
  assert.equal(effects, 1);
  const oldRequest = c.request('status', {});
  const crashed = once(child, 'exit'); child.kill('SIGKILL'); await crashed;
  await boot();
  const saved = JSON.parse(readFileSync(join(dir, 'state.json')));
  const after = { generation: saved.generation, sessionId: saved.pairing.sessionId };
  assert.equal(after.generation, before.generation + 1); assert.notEqual(after.sessionId, before.sessionId);
  assert.equal(saved.pairing.seq, 0);
  assert.deepEqual(await getHello(), { v: 1, generation: after.generation, sessionId: after.sessionId, lastSeq: 0 });
  assert.equal(JSON.parse(readFileSync(join(dir, 'state.json'))).pairing.key, key);
  assert.equal((await post('/rpc', oldRequest, { origin })).error, 'AUTH');
  assert.equal((await c.reconnect()).body.generation, after.generation);
  assert.equal((await getHello()).lastSeq, 1);
  assert.equal((await c.rpc('resume', {})).body.code, 'METHOD_BLOCKED');
  assert.equal((await c.rpc('status', { operationId: operation.operationId })).body.status, 'unknown');
  assert.equal((await c.rpc('execute', { operationId: operation.operationId })).body.code, 'OPERATION_NOT_EXECUTABLE');
  assert.equal(effects, 1); assert.equal(closed, 1);
  const stopExit = once(child, 'exit'); await control(dir, 'stop'); await stopExit;
});
