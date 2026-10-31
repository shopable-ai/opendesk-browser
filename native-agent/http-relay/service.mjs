import http from 'node:http';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, renameSync, chmodSync, lstatSync, rmSync, openSync, fsyncSync, closeSync } from 'node:fs';
import { join } from 'node:path';
import { LIMIT, HOST, PORT, TARGET, random, canonical, hash, mac, equal, secretBytes, proof, deriveKey, sign, unsigned, check, keys, identifier, nonce } from './protocol.mjs';

const MAX_LEASE = 2000;
const SENSITIVE = /^(authorization|proxy-authorization|cookie|set-cookie|www-authenticate|proxy-authenticate)$/i;
const RESERVED_HEADERS = /^(host|connection|content-length|transfer-encoding|trailer|te|upgrade|expect|user-agent|origin|referer|accept-encoding|forwarded|via|proxy-.*|sec-.*|x-forwarded-.*|x-opendesk-.*)$/i;
// Deterministic identity of the executor's actual loaded implementation, not caller Task source.
export const EXECUTOR_SOURCE_HASH = createHash('sha256')
  .update('service.mjs\0').update(readFileSync(new URL('./service.mjs', import.meta.url)))
  .update('protocol.mjs\0').update(readFileSync(new URL('./protocol.mjs', import.meta.url))).digest('hex');
function operation(input) {
  keys(input, ['operationId', 'runId', 'requestId', 'taskId', 'revision', 'sourceHash', 'url', 'method', 'headers', 'userAgent', 'deadlineAt', 'leaseMs', 'authority']);
  for (const k of ['operationId', 'runId', 'requestId', 'taskId']) identifier(input[k]);
  check(Number.isSafeInteger(input.revision) && input.revision >= 0);
  keys(input.authority, ['mode', 'installation', 'namespace', 'principal', 'grantIncarnation', 'resultId', 'browserSessionIncarnation', 'appBindingHash']);
  check(['installedTask', 'draftRun'].includes(input.authority.mode), 'AUTHORITY_BINDING');
  for (const name of ['namespace', 'principal', 'grantIncarnation', 'resultId', 'browserSessionIncarnation']) check(typeof input.authority[name] === 'string' && input.authority[name].length > 0, 'AUTHORITY_BINDING');
  check(input.authority.appBindingHash === null || (typeof input.authority.appBindingHash === 'string' && /^[a-f0-9]{64}$/.test(input.authority.appBindingHash)), 'AUTHORITY_BINDING');
  if (input.authority.mode === 'draftRun') check(input.authority.installation === null && input.authority.appBindingHash === null, 'AUTHORITY_BINDING');
  else {
    keys(input.authority.installation, ['version', 'manifestHash', 'installationId', 'generation']);
    check(typeof input.authority.installation.installationId === 'string' && input.authority.installation.installationId.length > 0, 'AUTHORITY_BINDING');
    check(Number.isSafeInteger(input.authority.installation.generation) && input.authority.installation.generation >= 0, 'AUTHORITY_BINDING');
    check(typeof input.authority.installation.version === 'string' && /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(input.authority.installation.version), 'AUTHORITY_BINDING');
    check(typeof input.authority.installation.manifestHash === 'string' && /^[a-f0-9]{64}$/.test(input.authority.installation.manifestHash), 'AUTHORITY_BINDING');
  }
  check(typeof input.sourceHash === 'string' && /^[a-f0-9]{64}$/.test(input.sourceHash));
  check(typeof input.url === 'string' && Buffer.byteLength(input.url) <= 512);
  const url = new URL(input.url);
  check(url.origin === TARGET && url.protocol === 'http:' && !url.username && !url.password && !url.hash && input.url.startsWith(TARGET + '/'), 'TARGET_BLOCKED');
  check(input.method === 'GET', 'METHOD_BLOCKED');
  check(input.headers && typeof input.headers === 'object' && !Array.isArray(input.headers));
  const seen = new Set();
  for (const [name, value] of Object.entries(input.headers)) {
    const lower = name.toLowerCase();
    check(!RESERVED_HEADERS.test(lower) && !SENSITIVE.test(lower) && !seen.has(lower), 'HEADER_BLOCKED');
    seen.add(lower);
    http.validateHeaderName(name); http.validateHeaderValue(name, value);
    check(typeof value === 'string' && /^[\x20-\x7e]*$/.test(value) && value.length <= 512, 'HEADER_BLOCKED');
  }
  check(Buffer.byteLength(canonical(input.headers)) <= 1024, 'HEADER_BLOCKED');
  check(typeof input.userAgent === 'string' && /^[\x20-\x7e]{0,512}$/.test(input.userAgent), 'HEADER_BLOCKED');
  check(Number.isSafeInteger(input.deadlineAt) && input.deadlineAt > Date.now() && input.deadlineAt <= Date.now() + 15000, 'DEADLINE');
  check(Number.isSafeInteger(input.leaseMs) && input.leaseMs >= 100 && input.leaseMs <= MAX_LEASE, 'LEASE');
  return structuredClone(input);
}

export async function startRelay({ stateDir, origin, onStop = () => {} }) {
  check(process.versions.node.split('.')[0] === '24', 'NODE_24_REQUIRED');
  check(typeof origin === 'string' && /^chrome-extension:\/\/[a-p]{32}$/.test(origin), 'EXTENSION_ORIGIN_REQUIRED');
  check(typeof stateDir === 'string');
  mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  check(lstatSync(stateDir).isDirectory() && !lstatSync(stateDir).isSymbolicLink(), 'UNSAFE_STATE');
  chmodSync(stateDir, 0o700);
  const lock = join(stateDir, 'service.lock');
  try { mkdirSync(lock, { mode: 0o700 }); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const recovery = join(stateDir, 'lock-recovery');
    mkdirSync(recovery, { mode: 0o700 });
    try {
      const owner = JSON.parse(readFileSync(join(lock, 'owner.json'), 'utf8'));
      check(Number.isSafeInteger(owner.pid) && owner.pid > 0, 'LOCKED');
      try { process.kill(owner.pid, 0); throw new Error('LOCKED'); }
      catch (probe) { if (probe.code !== 'ESRCH') throw probe; }
      rmSync(lock, { recursive: true }); mkdirSync(lock, { mode: 0o700 });
    } finally { rmSync(recovery, { recursive: true }); }
  }
  writeFileSync(join(lock, 'owner.json'), JSON.stringify({ pid: process.pid }), { mode: 0o600, flag: 'wx' });
  const file = join(stateDir, 'state.json');
  let state;
  try {
    try { check(lstatSync(file).isFile() && !lstatSync(file).isSymbolicLink(), 'UNSAFE_STATE'); state = JSON.parse(readFileSync(file, 'utf8')); chmodSync(file, 0o600); }
    catch (error) { if (error.code !== 'ENOENT') throw error; state = { v: 1, generation: 0, controlKey: random(), pairing: null, operations: {}, runs: {} }; }
    check(state.v === 1 && Number.isSafeInteger(state.generation), 'INVALID_STATE');
    check(!state.origin || state.origin === origin, 'ORIGIN_CHANGED_REVOKE_REQUIRED');
    state.origin = origin;
    check(state.generation < Number.MAX_SAFE_INTEGER, 'GENERATION_EXHAUSTED');
    state.generation++;
    state.sessionId = random();
    if (state.pairing) { state.pairing.sessionId = state.sessionId; state.pairing.seq = 0; }
  } catch (error) { rmSync(lock, { recursive: true }); throw error; }
  function persist() {
    const tmp = join(stateDir, `state-${random()}.tmp`);
    writeFileSync(tmp, JSON.stringify(state), { mode: 0o600, flag: 'wx', flush: true });
    renameSync(tmp, file);
    const directory = openSync(stateDir, 'r');
    try { fsyncSync(directory); } finally { closeSync(directory); }
  }
  for (const op of Object.values(state.operations)) if (op.status === 'running' || op.status === 'registered') { op.status = 'unknown'; delete op.result; }
  const live = new Map();
  const pending = new Map();
  const controlReplay = new Set();
  let invitation = null;
  let stopping = false;
  function settle(id, status, result) {
    const record = state.operations[id];
    if (!record || !['registered', 'running'].includes(record.status)) return;
    const active = live.get(id);
    if (status === 'completed' && Date.now() >= record.deadlineAt) { status = 'timeout'; result = undefined; }
    else if (status === 'completed' && active && Date.now() >= active.leaseUntil) { status = 'lease_expired'; result = undefined; }
    live.delete(id);
    if (active) { clearTimeout(active.timer); active.request?.destroy(); }
    record.status = status;
    if (result) record.result = result;
    persist();
  }
  function arm(id) {
    const active = live.get(id), record = state.operations[id];
    clearTimeout(active.timer);
    const at = Math.min(record.deadlineAt, active.leaseUntil);
    active.timer = setTimeout(() => settle(id, Date.now() >= record.deadlineAt ? 'timeout' : 'lease_expired'), Math.max(1, at - Date.now()));
  }
  function revoke() {
    for (const id of [...live.keys()]) settle(id, 'revoked');
    for (const record of Object.values(state.operations)) if (record.status === 'registered') record.status = 'revoked';
    check(state.generation < Number.MAX_SAFE_INTEGER, 'GENERATION_EXHAUSTED');
    state.generation++; state.sessionId = random(); state.pairing = null; invitation = null; pending.clear(); persist();
  }
  function pair(method, body) {
    if (method === 'pair.challenge') {
      keys(body, ['invitationId', 'generation', 'clientId', 'clientNonce']); identifier(body.clientId); nonce(body.clientNonce);
      check(!state.pairing, 'ALREADY_PAIRED');
      check(invitation && invitation.expiresAt > Date.now() && body.invitationId === invitation.invitationId && body.generation === state.generation, 'INVITATION_INVALID');
      for (const [id, entry] of pending) if (entry.expiresAt <= Date.now()) pending.delete(id);
      check(pending.size < 16, 'PAIR_BUSY');
      const transcript = { ...body, sessionId: random(), serverNonce: random(), origin };
      pending.set(transcript.sessionId, { transcript, secret: invitation.secret, expiresAt: invitation.expiresAt });
      return { ...transcript, serverProof: proof(secretBytes(invitation.secret), 'server', transcript) };
    }
    keys(body, ['sessionId', 'proof']);
    const entry = pending.get(body.sessionId);
    check(entry && entry.expiresAt > Date.now() && entry.transcript.generation === state.generation, 'PAIR_INVALID');
    if (method === 'pair.prove') {
      check(!entry.key && invitation && invitation.invitationId === entry.transcript.invitationId, 'INVITATION_INVALID');
      check(equal(body.proof, proof(secretBytes(entry.secret), 'client', entry.transcript)), 'PAIR_PROOF');
      entry.key = deriveKey(entry.secret, entry.transcript);
      invitation = null;
      for (const id of pending.keys()) if (id !== body.sessionId) pending.delete(id);
      delete entry.secret;
      return { sessionId: body.sessionId, proof: proof(entry.key, 'ready', entry.transcript) };
    }
    check(method === 'pair.confirm' && entry.key && equal(body.proof, proof(entry.key, 'confirm', entry.transcript)), 'PAIR_PROOF');
    check(!state.pairing, 'ALREADY_PAIRED');
    state.pairing = { clientId: entry.transcript.clientId, sessionId: body.sessionId, key: entry.key.toString('hex'), seq: 0, generation: state.generation };
    persist(); pending.clear();
    return { sessionId: body.sessionId, generation: state.generation, proof: proof(entry.key, 'paired', entry.transcript) };
  }
  function recordFor(body, fields = ['operationId']) {
    keys(body, fields); identifier(body.operationId);
    const record = state.operations[body.operationId];
    check(record, 'OPERATION_UNKNOWN');
    return record;
  }
  async function dispatch(method, body) {
    check(['register', 'execute', 'cancel', 'renew', 'revoke', 'status'].includes(method), 'METHOD_BLOCKED');
    if (method === 'register') {
      const op = operation(body);
      check(!state.operations[op.operationId], 'OPERATION_EXISTS');
      check(Object.keys(state.operations).length < 128, 'CAPACITY');
      check(!Object.values(state.operations).some(r => r.operation.runId === op.runId && r.operation.requestId === op.requestId), 'REQUEST_EXISTS');
      const run = state.runs[op.runId];
      if (run) check(run.taskId === op.taskId && run.revision === op.revision && run.sourceHash === op.sourceHash && run.authorityHash === hash({ ...op.authority, resultId: '' }) && op.deadlineAt <= run.deadlineAt && Date.now() < run.deadlineAt, 'RUN_BUDGET');
      else { check(Object.keys(state.runs).length < 64, 'CAPACITY'); state.runs[op.runId] = { taskId: op.taskId, revision: op.revision, sourceHash: op.sourceHash, authorityHash: hash({ ...op.authority, resultId: '' }), deadlineAt: op.deadlineAt }; }
      state.operations[op.operationId] = { operation: op, generation: state.generation, deadlineAt: op.deadlineAt, status: 'registered' };
      persist(); return { operationId: op.operationId, status: 'registered' };
    }
    if (method === 'revoke') { keys(body, []); revoke(); return { generation: state.generation, status: 'revoked' }; }
    if (method === 'status' && Object.keys(body).length === 0) return { generation: state.generation, paired: !!state.pairing, pid: process.pid, nodeVersion: process.version };
    const record = recordFor(body, method === 'renew' ? ['operationId', 'leaseMs'] : ['operationId']);
    const id = body.operationId;
    if (method === 'status') {
      if (record.generation !== state.generation) return { operationId: id, status: 'unknown' };
      return { operationId: id, status: record.status, ...(record.result ? { result: record.result } : {}) };
    }
    if (method === 'renew' && !['running', 'registered'].includes(record.status)) return { operationId: id, status: record.status };
    check(record.generation === state.generation, 'OPERATION_NOT_EXECUTABLE');
    if (method === 'cancel') { settle(id, 'cancelled'); return { operationId: id, status: record.status }; }
    if (method === 'renew') {
      check(Number.isSafeInteger(body.leaseMs) && body.leaseMs >= 100 && body.leaseMs <= MAX_LEASE, 'LEASE');
      const active = live.get(id);
      check(active && record.status === 'running' && Date.now() < Math.min(active.leaseUntil, record.deadlineAt), 'LEASE_EXPIRED');
      active.leaseUntil = Math.min(Date.now() + body.leaseMs, record.deadlineAt); arm(id);
      return { operationId: id, leaseUntil: active.leaseUntil };
    }
    check(method === 'execute', 'METHOD_BLOCKED');
    check(record.status === 'registered', 'OPERATION_NOT_EXECUTABLE');
    check(Date.now() < record.deadlineAt, 'RUN_BUDGET');
    check(live.size < 8, 'CAPACITY');
    record.status = 'running'; persist(); // Durable intent precedes the single HTTP effect.
    if (Date.now() >= record.deadlineAt) { settle(id, 'timeout'); throw new Error('RUN_BUDGET'); }
    {
      const active = { leaseUntil: Math.min(Date.now() + record.operation.leaseMs, record.deadlineAt), timer: null, request: null };
      live.set(id, active); arm(id);
      const op = record.operation;
      const request = http.request(op.url, { method: 'GET', agent: false, headers: { ...op.headers, 'User-Agent': op.userAgent || 'OpenDesk-NativeHTTP/1.0', 'x-opendesk-run-id': op.runId, 'x-opendesk-request-id': op.requestId, Connection: 'close' }, maxHeaderSize: 4096 }, response => {
        const chunks = []; let size = 0;
        const socket = response.socket;
        const executor = { pid: process.pid, nodeVersion: process.version, sourceHash: EXECUTOR_SOURCE_HASH, localAddress: socket.localAddress, localPort: socket.localPort, remoteAddress: socket.remoteAddress, remotePort: socket.remotePort };
        const headers = {};
        for (const [name, value] of Object.entries(response.headers)) if (!SENSITIVE.test(name) && ['content-type', 'content-length', 'location', 'cache-control'].includes(name)) headers[name] = value;
        if (Buffer.byteLength(canonical(headers)) > 768) return settle(id, 'response_too_large');
        response.on('data', chunk => { size += chunk.length; if (size > 3072) settle(id, 'response_too_large'); else chunks.push(chunk); });
        response.on('error', () => settle(id, 'early_close'));
        response.on('aborted', () => settle(id, 'early_close'));
        response.on('end', () => {
          const result = { status: response.statusCode, statusText: response.statusMessage, headers, body: Buffer.concat(chunks).toString('utf8'), executor };
          if (Buffer.byteLength(canonical(result)) > 6000) settle(id, 'response_too_large');
          else settle(id, 'completed', result);
        });
      });
      active.request = request;
      request.on('error', () => settle(id, 'network_error'));
      request.end();
    }
    return { operationId: id, status: 'running' };
  }
  async function authenticated(envelope) {
    keys(envelope, ['v', 'clientId', 'generation', 'sessionId', 'seq', 'id', 'method', 'body', 'mac']);
    const pairing = state.pairing;
    check(pairing && envelope.v === 1 && envelope.clientId === pairing.clientId && envelope.sessionId === pairing.sessionId && envelope.generation === state.generation, 'AUTH');
    identifier(envelope.id); check(Number.isSafeInteger(envelope.seq) && envelope.seq > pairing.seq, 'REPLAY');
    const key = Buffer.from(pairing.key, 'hex'), request = unsigned(envelope);
    check(equal(envelope.mac, mac(key, request)), 'AUTH');
    check(envelope.body && typeof envelope.body === 'object' && !Array.isArray(envelope.body));
    pairing.seq = envelope.seq; persist();
    let ok = true, body;
    try { body = await dispatch(envelope.method, envelope.body); } catch (error) { ok = false; body = { code: error.message }; }
    // Revocation/cancellation can settle a pending execute; do not deliver old-generation results.
    check(envelope.method === 'revoke' || (state.pairing === pairing && state.generation === envelope.generation), 'GENERATION_REVOKED');
    return sign(key, { v: 1, clientId: envelope.clientId, generation: envelope.generation, sessionId: envelope.sessionId, seq: envelope.seq, id: envelope.id, requestHash: hash(request), ok, body });
  }
  async function control(envelope) {
    keys(envelope, ['id', 'method', 'body', 'at', 'mac']); identifier(envelope.id);
    keys(envelope.body, []);
    check(Number.isSafeInteger(envelope.at) && Math.abs(Date.now() - envelope.at) <= 10000, 'AUTH');
    check(equal(envelope.mac, mac(secretBytes(state.controlKey), unsigned(envelope))), 'AUTH');
    check(!controlReplay.has(envelope.id), 'REPLAY');
    check(controlReplay.size < 1024, 'CAPACITY'); controlReplay.add(envelope.id);
    if (envelope.method === 'status') return { pid: process.pid, nodeVersion: process.version, generation: state.generation, paired: !!state.pairing };
    if (envelope.method === 'invite') {
      check(!state.pairing, 'ALREADY_PAIRED');
      const inviteFile = join(stateDir, 'invitation.json');
      check(lstatSync(inviteFile).isFile() && !lstatSync(inviteFile).isSymbolicLink(), 'UNSAFE_STATE');
      const candidate = JSON.parse(readFileSync(inviteFile, 'utf8'));
      keys(candidate, ['invitationId', 'secret', 'generation', 'expiresAt']);
      nonce(candidate.invitationId); nonce(candidate.secret);
      check(candidate.generation === state.generation && candidate.expiresAt > Date.now() && candidate.expiresAt <= Date.now() + 60000, 'INVITATION_INVALID');
      invitation = candidate;
      rmSync(inviteFile); pending.clear();
      return { invitationId: invitation.invitationId, expiresAt: invitation.expiresAt };
    }
    if (envelope.method === 'revoke') { revoke(); return { generation: state.generation }; }
    check(envelope.method === 'stop', 'METHOD_BLOCKED');
    setImmediate(() => close().then(onStop)); return { status: 'stopping' };
  }
  const server = http.createServer({ maxHeaderSize: 4096, requestTimeout: 5000, headersTimeout: 5000 }, async (req, res) => {
    const send = (value, status = 200) => {
      if (res.destroyed) return;
      const data = JSON.stringify(value);
      if (Buffer.byteLength(data) > LIMIT) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end('{"v":1,"ok":false,"error":"RESPONSE_TOO_LARGE"}'); return; }
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...(['/rpc', '/hello'].includes(req.url) && req.headers.origin === origin ? { 'Access-Control-Allow-Origin': origin } : {}) }); res.end(data);
    };
    try {
      if (req.method === 'GET' && req.url === '/hello' && req.headers.origin === origin && !stopping && req.socket.remoteAddress === HOST) {
        send({ v: 1, generation: state.generation, sessionId: state.pairing?.sessionId || state.sessionId, lastSeq: state.pairing?.seq || 0 }); return;
      }
      if (req.method === 'OPTIONS' && ['/rpc', '/hello'].includes(req.url) && req.headers.origin === origin && req.headers['access-control-request-method'] === 'POST' && (req.headers['access-control-request-headers'] || '').toLowerCase() === 'content-type') {
        res.writeHead(204, { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '0' }); res.end(); return;
      }
      check(!stopping && req.socket.remoteAddress === HOST && req.method === 'POST' && ['/rpc', '/hello', '/control'].includes(req.url), 'TRANSPORT');
      check((req.url === '/control' ? !req.headers.origin : req.headers.origin === origin) && !req.headers['transfer-encoding'] && req.headers['content-type'] === 'application/json', 'TRANSPORT');
      check(/^\d+$/.test(req.headers['content-length'] || '') && Number(req.headers['content-length']) <= LIMIT, 'REQUEST_TOO_LARGE');
      let size = 0; const chunks = [];
      for await (const chunk of req) { size += chunk.length; check(size <= LIMIT, 'REQUEST_TOO_LARGE'); chunks.push(chunk); }
      const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (req.url === '/hello') {
        keys(value, ['v']); check(value.v === 1);
        send({ v: 1, generation: state.generation, sessionId: state.pairing?.sessionId || state.sessionId, lastSeq: state.pairing?.seq || 0 });
      }
      else if (req.url === '/control') send(await control(value));
      else if (typeof value.method === 'string' && value.method.startsWith('pair.')) { keys(value, ['v', 'method', 'body']); check(value.v === 1); send({ v: 1, ok: true, body: pair(value.method, value.body) }); }
      else send(await authenticated(value));
    } catch (error) { send({ v: 1, ok: false, error: error.message }, 400); }
  });
  server.maxConnections = 32;
  server.on('clientError', (_error, socket) => socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n'));
  async function close() {
    if (stopping) return;
    stopping = true;
    for (const id of [...live.keys()]) settle(id, 'unknown');
    await new Promise(resolve => { server.close(resolve); server.closeIdleConnections(); });
    rmSync(lock, { recursive: true });
  }
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(PORT, HOST, resolve); });
    persist();
  } catch (error) { server.close(); rmSync(lock, { recursive: true }); throw error; }
  return { close, address: server.address() };
}
