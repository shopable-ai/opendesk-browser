// Video SVIP FUTURE-R1 PoC-1: independent, opt-in, single-file personal media server.
// No Chrome Host/Runtime changes. Never use for VIP/DRM content or public Funnel.
import { createServer } from 'node:http';
import { createReadStream, constants as fsConstants } from 'node:fs';
import { readFile, lstat, open, stat } from 'node:fs/promises';
import { randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname } from 'node:path';

const HERE = new URL('./', import.meta.url);
const MiB = 1024 * 1024;
const SESSION_MS = 15 * 60_000;
const FAILURE_WINDOW_MS = 60_000;
const MAX_BAD_LOGINS = 8;
const COOKIE_NAME = 'svip_poc_session';
const DEFAULT_PORT = 43188;

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

export function parseSingleRange(value, size) {
  if (value === undefined) return { start: 0, end: size - 1, partial: false };
  if (typeof value !== 'string') return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2])) return null;
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] ? (match[2] ? Number(match[2]) : size - 1) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) ||
      start >= size || end < start || (match[2] && Number(match[2]) === 0 && !match[1])) return null;
  return { start, end: Math.min(end, size - 1), partial: true };
}

function validHost(req) {
  try {
    const name = new URL('http://' + (req.headers.host || '')).hostname.toLowerCase();
    return name === '127.0.0.1' || name === 'localhost' || (name.endsWith('.ts.net') && name.length > 7);
  } catch {
    return false;
  }
}

function validPostOrigin(req) {
  const site = req.headers['sec-fetch-site'];
  if (site && site !== 'same-origin' && site !== 'none') return false;
  try {
    const source = new URL(req.headers.origin);
    const host = new URL('http://' + req.headers.host).hostname.toLowerCase();
    const sourceHost = source.hostname.toLowerCase();
    const local = host === 'localhost' || host === '127.0.0.1';
    if (source.protocol === 'http:' && local) return sourceHost === host;
    if (source.protocol === 'https:' && sourceHost.endsWith('.ts.net')) {
      return local || sourceHost === host; // Tailscale Serve may rewrite upstream Host.
    }
  } catch {
    return false;
  }
  return false;
}

function readSession(req, sessions, now) {
  const raw = (req.headers.cookie || '').split(';').map(s => s.trim())
    .find(s => s.startsWith(COOKIE_NAME + '='));
  if (!raw) return false;
  const token = raw.slice(COOKIE_NAME.length + 1);
  const expires = sessions.get(token);
  if (!expires) return false;
  if (expires <= now()) {
    sessions.delete(token);
    return false;
  }
  return true;
}

function securityHeaders(res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; connect-src 'self'; media-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
}

function json(res, status, value, extra = {}) {
  const data = Buffer.from(JSON.stringify(value));
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': data.length, ...extra });
  res.end(data);
}

async function readSmallJson(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk.toString('utf8');
    if (Buffer.byteLength(body) > 1024) throw new Error('BODY_TOO_LARGE');
  }
  return JSON.parse(body);
}

class UploadThrottle extends Transform {
  constructor(bytesPerSecond, onBytes) {
    super();
    this.rate = bytesPerSecond;
    this.onBytes = onBytes;
    this.started = Date.now();
    this.total = 0;
    this.pending = null;
  }
  _transform(chunk, encoding, done) {
    this.total += chunk.length;
    const delay = Math.max(0, Math.ceil(this.total * 1000 / this.rate - (Date.now() - this.started)));
    const emit = () => {
      this.pending = null;
      if (this.destroyed) return done();
      this.onBytes(chunk.length);
      done(null, chunk);
    };
    if (delay) this.pending = setTimeout(emit, delay);
    else emit();
  }
  _destroy(err, done) {
    if (this.pending) clearTimeout(this.pending);
    done(err);
  }
}

export async function createPersonalMediaService({
  filePath,
  port = DEFAULT_PORT,
  pairingCode = randomBytes(24).toString('base64url'),
  maxFileBytes = 64 * MiB,
  maxUploadBytes = 256 * MiB,
  maxRateBytesPerSecond = 2 * MiB,
  now = () => Date.now(),
  audit = event => process.stdout.write(JSON.stringify(event) + '\n'),
  announce = message => process.stderr.write(message + '\n')
} = {}) {
  if (!filePath || !Number.isSafeInteger(port) || port < 0 || port > 65535 ||
      !Number.isSafeInteger(maxFileBytes) || maxFileBytes <= 0 ||
      !Number.isSafeInteger(maxUploadBytes) || maxUploadBytes <= 0 ||
      !Number.isFinite(maxRateBytesPerSecond) || maxRateBytesPerSecond <= 0 ||
      typeof pairingCode !== 'string' || pairingCode.length < 16) {
    throw new Error('INVALID_POC_CONFIGURATION');
  }
  const mediaPath = resolve(filePath);
  const suffix = extname(mediaPath).toLowerCase();
  if (!['.mp4', '.webm'].includes(suffix)) throw new Error('ONLY_MP4_OR_WEBM');
  const initial = await lstat(mediaPath);
  if (!initial.isFile() || initial.isSymbolicLink() || !initial.size ||
      initial.size > maxFileBytes) throw new Error('FILE_MUST_BE_REGULAR_NONEMPTY_AND_SMALL');
  const mime = suffix === '.mp4' ? 'video/mp4' : 'video/webm';
  const index = await readFile(new URL('index.html', HERE));
  const client = await readFile(new URL('client.js', HERE));
  const sessions = new Map();
  const active = new Set();
  let secret = pairingCode;
  let bytesScheduled = 0;
  let bytesReserved = 0;
  let failedAt = [];
  let revokedCount = 0;
  let server;

  function record(event, fields = {}) {
    audit({ product: 'video-svip', experiment: 'personal-media-poc',
      at: new Date(now()).toISOString(), event, ...fields });
  }
  function rotate() {
    secret = randomBytes(24).toString('base64url');
    announce('NEW pairing code for device B (DO NOT LOG/SHARE PUBLICLY): ' + secret);
  }
  function revoke() {
    sessions.clear();
    revokedCount++;
    rotate();
    for (const response of active) response.destroy();
    record('REVOKED', { revokedCount });
  }
  async function media(req, res) {
    let handle;
    try {
      handle = await open(mediaPath, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW || 0));
      const current = await handle.stat();
      if (!current.isFile() || current.dev !== initial.dev || current.ino !== initial.ino ||
          current.size !== initial.size || current.mtimeMs !== initial.mtimeMs) {
        json(res, 409, { error: 'FILE_CHANGED' });
        return;
      }
      const range = parseSingleRange(req.headers.range, current.size);
      if (!range) {
        res.setHeader('Content-Range', 'bytes */' + current.size);
        json(res, 416, { error: 'INVALID_RANGE' });
        return;
      }
      const length = range.end - range.start + 1;
      const headers = {
        'Accept-Ranges': 'bytes', 'Content-Type': mime,
        'Content-Length': length,
        ...(range.partial ? { 'Content-Range': 'bytes ' + range.start + '-' + range.end + '/' + current.size } : {})
      };
      if (req.method === 'HEAD') {
        res.writeHead(range.partial ? 206 : 200, headers);
        res.end();
        return;
      }
      if (active.size >= 1) {
        json(res, 429, { error: 'CONCURRENT_STREAM_LIMIT' });
        return;
      }
      if (bytesScheduled + bytesReserved + length > maxUploadBytes) {
        json(res, 429, { error: 'UPLOAD_BUDGET_EXCEEDED' });
        return;
      }
      bytesReserved += length;
      active.add(res);
      let counted = 0;
      res.writeHead(range.partial ? 206 : 200, headers);
      record('STREAM_START', { partial: range.partial, start: range.start, end: range.end, bytes: length });
      try {
        const limiter = new UploadThrottle(maxRateBytesPerSecond, bytes => {
          counted += bytes;
          bytesReserved -= bytes;
          bytesScheduled += bytes;
        });
        await pipeline(handle.createReadStream({ start: range.start, end: range.end, autoClose: false }),
          limiter, res);
        record('STREAM_END', { bytesStreamedApprox: counted });
      } catch {
        record('STREAM_ABORTED', { bytesStreamedApprox: counted });
      } finally {
        bytesReserved -= length - counted;
        active.delete(res);
      }
    } finally {
      if (handle) await handle.close().catch(() => {});
    }
  }

  async function dispatch(req, res) {
    securityHeaders(res);
    if (!validHost(req)) return json(res, 421, { error: 'HOST_REJECTED' });
    if (!['GET', 'HEAD', 'POST'].includes(req.method)) {
      res.setHeader('Allow', 'GET, HEAD, POST');
      return json(res, 405, { error: 'METHOD_NOT_ALLOWED' });
    }
    const url = new URL(req.url, 'http://local.invalid');
    if (url.search || url.hash) return json(res, 400, { error: 'QUERY_NOT_ALLOWED' });
    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': index.length });
      return res.end(index);
    }
    if (req.method === 'GET' && url.pathname === '/client.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Content-Length': client.length });
      return res.end(client);
    }
    if (req.method === 'POST' && ['/session', '/revoke'].includes(url.pathname) &&
        (!validPostOrigin(req) || !String(req.headers['content-type'] || '').startsWith('application/json'))) {
      return json(res, 403, { error: 'ORIGIN_OR_CONTENT_TYPE_REJECTED' });
    }
    if (req.method === 'POST' && url.pathname === '/session') {
      failedAt = failedAt.filter(t => now() - t < FAILURE_WINDOW_MS);
      if (failedAt.length >= MAX_BAD_LOGINS) return json(res, 429, { error: 'LOGIN_RATE_LIMIT' });
      let data;
      try { data = await readSmallJson(req); }
      catch { return json(res, 400, { error: 'INVALID_BODY' }); }
      if (!data || typeof data.code !== 'string' || !safeEqual(data.code, secret)) {
        failedAt.push(now());
        record('LOGIN_DENIED');
        return json(res, 401, { error: 'INVALID_PAIRING_CODE' });
      }
      failedAt = [];
      const token = randomBytes(32).toString('base64url');
      sessions.set(token, now() + SESSION_MS);
      record('SESSION_CREATED');
      return json(res, 200, { authenticated: true, expiresInSeconds: SESSION_MS / 1000 }, {
        'Set-Cookie': COOKIE_NAME + '=' + token + '; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=900'
      });
    }
    if (!readSession(req, sessions, now)) return json(res, 401, { error: 'AUTH_REQUIRED' });
    if (req.method === 'GET' && url.pathname === '/status') {
      return json(res, 200, {
        authenticated: true, bytesStreamedApprox: bytesScheduled,
        bytesReserved, uploadBudget: maxUploadBytes, activeStreams: active.size,
        revokedCount, note: 'Only the single explicitly approved file; no title or path disclosed.'
      });
    }
    if ((req.method === 'GET' || req.method === 'HEAD') && url.pathname === '/media') return media(req, res);
    if (req.method === 'POST' && url.pathname === '/revoke') {
      revoke();
      return json(res, 200, { revoked: true }, {
        'Set-Cookie': COOKIE_NAME + '=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0'
      });
    }
    return json(res, 404, { error: 'NOT_FOUND' });
  }

  server = createServer((req, res) => {
    void dispatch(req, res).catch(err => {
      record('SERVER_ERROR', { code: err.code || 'UNKNOWN' });
      if (res.headersSent) res.destroy();
      else json(res, 500, { error: 'SERVER_ERROR' });
    });
  });
  server.headersTimeout = 10_000;
  server.requestTimeout = 15_000;
  await new Promise((ok, fail) => {
    server.once('error', fail);
    server.listen(port, '127.0.0.1', ok);
  });
  const address = server.address();
  record('READY', { port: address.port, mediaBytes: initial.size, maxUploadBytes, maxRateBytesPerSecond });
  return {
    url: 'http://127.0.0.1:' + address.port,
    pairingCode: secret, revoke,
    metrics: () => ({ bytesStreamedApprox: bytesScheduled, activeStreams: active.size, revokedCount }),
    close: async () => {
      for (const res of active) res.destroy();
      server.closeAllConnections();
      await new Promise(resolveClose => server.close(resolveClose));
    }
  };
}

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!['--file', '--port'].includes(argv[i]) || !argv[i + 1]) throw new Error('USAGE: node server.mjs --file /absolute/path/to/owned.mp4 [--port 43188]');
    parsed[argv[i].slice(2)] = argv[i + 1];
  }
  if (!parsed.file) throw new Error('USAGE: --file REQUIRED');
  return { filePath: parsed.file, port: parsed.port === undefined ? DEFAULT_PORT : Number(parsed.port) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const service = await createPersonalMediaService(parseArgs(process.argv.slice(2)));
    process.stderr.write('LOCAL URL: ' + service.url + '\n');
    process.stderr.write('PAIRING CODE (ONLY ON DEVICE A, NEVER COMMIT/LOG): ' + service.pairingCode + '\n');
    process.stderr.write('Tailnet-only: tailscale serve ' + new URL(service.url).port +
      ' (do not use tailscale funnel). Ctrl+C to end.\n');
    for (const sig of ['SIGINT', 'SIGTERM']) {
      process.once(sig, () => { void service.close().then(() => process.exit(0)); });
    }
  } catch (err) {
    process.stderr.write('POC_START_FAILED: ' + (err.code || err.message) + '\n');
    process.exitCode = 1;
  }
}
