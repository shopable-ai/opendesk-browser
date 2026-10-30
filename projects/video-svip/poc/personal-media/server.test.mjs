import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, symlink, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPersonalMediaService, parseSingleRange } from './server.mjs';

const CODE = 'test-only-pairing-code-not-production';
const ORIGIN = { 'Origin': 'http://127.0.0.1', 'Content-Type': 'application/json' };

async function fixture(options = {}) {
  const folder = await mkdtemp(join(tmpdir(), 'video-svip-poc-'));
  const filePath = join(folder, 'self-created-test.mp4');
  const bytes = Buffer.from(Array.from({ length: 1024 }, (_, i) => i % 256));
  await writeFile(filePath, bytes);
  const events = [];
  const announcements = [];
  const service = await createPersonalMediaService({
    filePath, pairingCode: CODE, port: 0, maxRateBytesPerSecond: 100 * 1024 * 1024,
    audit: event => events.push(event),
    announce: msg => announcements.push(msg),
    ...options
  });
  return {
    base: service.url, bytes, service, filePath, events, announcements,
    clean: async () => { await service.close(); await rm(folder, { recursive: true, force: true }); }
  };
}

async function signIn(fx, code = CODE, origin = fx.base) {
  return fetch(fx.base + '/session', {
    method: 'POST',
    headers: { ...ORIGIN, Origin: origin },
    body: JSON.stringify({ code })
  });
}
function cookieOf(response) {
  return response.headers.get('set-cookie')?.split(';', 1)[0];
}
async function auth(fx) {
  const response = await signIn(fx);
  assert.equal(response.status, 200);
  const cookie = cookieOf(response);
  assert.match(cookie, /^svip_poc_session=[A-Za-z0-9_-]{32,}$/);
  return cookie;
}

test('range parser rejects multi-ranges, invalid/suffix zero and out of bounds', () => {
  assert.deepEqual(parseSingleRange(undefined, 1024), { start: 0, end: 1023, partial: false });
  assert.deepEqual(parseSingleRange('bytes=2-4', 1024), { start: 2, end: 4, partial: true });
  assert.deepEqual(parseSingleRange('bytes=10-', 1024), { start: 10, end: 1023, partial: true });
  assert.deepEqual(parseSingleRange('bytes=-3', 1024), { start: 1021, end: 1023, partial: true });
  for (const invalid of ['bytes=10-9', 'bytes=1024-', 'bytes=-0',
    'bytes=0-1,10-11', 'bytes=abc', 'bytes=-', 'bytes=9007199254740992-']) {
    assert.equal(parseSingleRange(invalid, 1024), null, invalid);
  }
});

test('one-file admission, no URL tokens, secure short session and Range bytes', async () => {
  const fx = await fixture();
  try {
    const noAuth = await fetch(fx.base + '/media');
    assert.equal(noAuth.status, 401);
    assert.equal((await noAuth.json()).error, 'AUTH_REQUIRED');
    assert.equal((await fetch(fx.base + '/?code=x')).status, 400);
    assert.equal((await signIn(fx, 'wrong-code')).status, 401);
    const xsite = await fetch(fx.base + '/session', {
      method: 'POST', headers: { Origin: 'https://attacker.example',
        'Sec-Fetch-Site': 'cross-site', 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: CODE })
    });
    assert.equal(xsite.status, 403);
    const signed = await signIn(fx);
    assert.equal(signed.status, 200);
    assert.match(signed.headers.get('set-cookie'), /HttpOnly; Secure; SameSite=Strict; Max-Age=900/);
    const cookie = cookieOf(signed);

    const head = await fetch(fx.base + '/media', { method: 'HEAD', headers: { Cookie: cookie } });
    assert.equal(head.status, 200);
    assert.equal(Number(head.headers.get('content-length')), 1024);
    assert.equal(head.headers.get('accept-ranges'), 'bytes');

    const range = await fetch(fx.base + '/media', {
      headers: { Cookie: cookie, Range: 'bytes=2-4' }
    });
    assert.equal(range.status, 206);
    assert.equal(range.headers.get('content-range'), 'bytes 2-4/1024');
    assert.deepEqual(Buffer.from(await range.arrayBuffer()), fx.bytes.subarray(2, 5));

    const suffix = await fetch(fx.base + '/media', {
      headers: { Cookie: cookie, Range: 'bytes=-7' }
    });
    assert.equal(suffix.status, 206);
    assert.deepEqual(Buffer.from(await suffix.arrayBuffer()), fx.bytes.subarray(-7));

    const invalid = await fetch(fx.base + '/media', {
      headers: { Cookie: cookie, Range: 'bytes=5000-' }
    });
    assert.equal(invalid.status, 416);
    assert.equal(invalid.headers.get('content-range'), 'bytes */1024');

    const total = await fetch(fx.base + '/media', { headers: { Cookie: cookie } });
    assert.equal(total.status, 200);
    assert.deepEqual(Buffer.from(await total.arrayBuffer()), fx.bytes);

    const missing = await fetch(fx.base + '/secret.txt', { headers: { Cookie: cookie } });
    assert.equal(missing.status, 404);
    const suspiciousHost = await fetch(fx.base + '/media', { headers: { Cookie: cookie, Host: 'attacker.example' } });
    assert.equal(suspiciousHost.status, 421);

    assert.equal(fx.events.some(event => JSON.stringify(event).includes(CODE)), false);
    assert.equal(fx.events.some(event => JSON.stringify(event).includes(fx.filePath)), false);
  } finally { await fx.clean(); }
});

test('revoke invalidates cookies and old code, rotates code without audit leakage', async () => {
  const fx = await fixture();
  try {
    const cookie = await auth(fx);
    const revoke = await fetch(fx.base + '/revoke', {
      method: 'POST', headers: { Cookie: cookie, Origin: fx.base, 'Content-Type': 'application/json' },
      body: '{}'
    });
    assert.equal(revoke.status, 200);
    assert.equal((await revoke.json()).revoked, true);
    assert.equal((await fetch(fx.base + '/status', { headers: { Cookie: cookie } })).status, 401);
    assert.equal((await signIn(fx, CODE)).status, 401);
    const fresh = fx.announcements.find(x => x.startsWith('NEW pairing code'));
    assert.ok(fresh && !fresh.includes(CODE));
    assert.equal(fx.events.some(event => JSON.stringify(event).includes(fresh.split(': ').at(-1))), false);
  } finally { await fx.clean(); }
});

test('upload budget is enforced and HEAD is not charged', async () => {
  const fx = await fixture({ maxUploadBytes: 1024 });
  try {
    const cookie = await auth(fx);
    assert.equal((await fetch(fx.base + '/media', {
      method: 'HEAD', headers: { Cookie: cookie }
    })).status, 200);
    const first = await fetch(fx.base + '/media', { headers: { Cookie: cookie } });
    assert.equal(first.status, 200);
    assert.equal((await first.arrayBuffer()).byteLength, 1024);
    const second = await fetch(fx.base + '/media', { headers: { Cookie: cookie } });
    assert.equal(second.status, 429);
    assert.equal((await second.json()).error, 'UPLOAD_BUDGET_EXCEEDED');
  } finally { await fx.clean(); }
});

test('session expiry and rate limiting are independent of path access', async () => {
  let now = 1_700_000_000_000;
  const fx = await fixture({ now: () => now });
  try {
    const cookie = await auth(fx);
    now += 15 * 60_000 + 1;
    assert.equal((await fetch(fx.base + '/media', { headers: { Cookie: cookie } })).status, 401);
    for (let i = 0; i < 8; i++) assert.equal((await signIn(fx, 'invalid-' + i)).status, 401);
    assert.equal((await signIn(fx, CODE)).status, 429);
    now += 60_001;
    assert.equal((await signIn(fx, CODE)).status, 200);
  } finally { await fx.clean(); }
});

test('modified file is rejected and symbolic link is not accepted as source', async () => {
  const fx = await fixture();
  try {
    const cookie = await auth(fx);
    await writeFile(fx.filePath, Buffer.alloc(1024, 77));
    await utimes(fx.filePath, new Date(1_600_000_000_000), new Date(1_600_000_000_000));
    const resp = await fetch(fx.base + '/media', { headers: { Cookie: cookie } });
    assert.equal(resp.status, 409);
    assert.equal((await resp.json()).error, 'FILE_CHANGED');
    const link = join(fx.filePath, '..', 'symlink.mp4');
    await symlink(fx.filePath, link);
    await assert.rejects(createPersonalMediaService({ filePath: link, port: 0, pairingCode: CODE }));
  } finally { await fx.clean(); }
});

test('private local-only HTTP has no external bind; active stream limit and revoke terminate stream', async () => {
  const fx = await fixture({ maxRateBytesPerSecond: 1024 });
  try {
    assert.match(fx.base, /^http:\/\/127\.0\.0\.1:\d+$/);
    const cookie = await auth(fx);
    const slow = await fetch(fx.base + '/media', { headers: { Cookie: cookie } });
    assert.equal(slow.status, 200);
    const concurrent = await fetch(fx.base + '/media', { headers: { Cookie: cookie } });
    assert.equal(concurrent.status, 429);
    assert.equal((await concurrent.json()).error, 'CONCURRENT_STREAM_LIMIT');
    fx.service.revoke();
    assert.equal(fx.service.metrics().revokedCount, 1);
    assert.equal((await fetch(fx.base + '/status', { headers: { Cookie: cookie } })).status, 401);
    try { await slow.arrayBuffer(); } catch { /* destroyed stream is expected */ }
  } finally { await fx.clean(); }
});
