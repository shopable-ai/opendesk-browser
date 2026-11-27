import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {createCipheriv, createHash, randomBytes} from 'node:crypto';
import {mkdir, mkdtemp, readFile, readdir, rm, unlink, writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';
import {exportAuthorizedAes128} from '../scripts/export-authorized-aes128.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const source = await readFile(new URL('./fixtures/h264-aac.ts', import.meta.url));
const tsNull = Buffer.alloc(188, 0xff);
tsNull.set([0x47, 0x1f, 0xff, 0x10]);
const names = ['last-name.ts', 'middle-name.ts', 'first-name.ts'];
const durations = [1.125, 1.25, 0.625];
const firstSequence = 308;
const epoch = 1_800_000_000_000;
const manifestUrl = 'https://media.example/owner/list.m3u8';
const manifestPath = '/owner/list.m3u8';
const segmentPaths = names.map(name => '/owner/' + name);
const cli = fileURLToPath(new URL('../scripts/export-authorized-aes128.mjs', import.meta.url));

async function fixture(t, {mode, explicitIv, retain = false} = {}) {
  const temp = await mkdtemp(join(tmpdir(), 'opendesk-authorized-aes128-'));
  t.after(() => rm(temp, {recursive: true, force: true}));
  const outputRoot = retain && process.env.OPENDESK_AES128_TEST_OUTPUT
    ? resolve(process.env.OPENDESK_AES128_TEST_OUTPUT) : join(temp, 'exports');
  await mkdir(outputRoot, {recursive: true});
  const keyPath = join(temp, 'key'), grantPath = join(temp, 'grant.json');
  const key = randomBytes(16);
  await writeFile(keyPath, mode === 'wrong-key' ? key.map(byte => byte ^ 0xff) : key, {mode: 0o600});
  const plain = names.map((_, i) => Buffer.concat([source, ...Array(i).fill(tsNull)]));
  const cipher = plain.map((bytes, i) => {
    const iv = Buffer.alloc(16);
    if (explicitIv) iv[15] = 0xab;
    else iv.writeBigUInt64BE(BigInt(firstSequence + i), 8);
    const encrypt = createCipheriv('aes-128-cbc', key, iv);
    return Buffer.concat([encrypt.update(bytes), encrypt.final()]);
  });
  key.fill(0);
  const keyTag = mode === 'drm'
    ? '#EXT-X-KEY:METHOD=SAMPLE-AES,KEYFORMAT="com.example.drm",URI="no-key-request"'
    : '#EXT-X-KEY:METHOD=AES-128,URI="no-key-request"' + (explicitIv ? ',IV=0xAB' : '');
  const manifest = Buffer.from([
    '#EXTM3U', '#EXT-X-VERSION:3', '#EXT-X-TARGETDURATION:2', '#EXT-X-PLAYLIST-TYPE:VOD',
    '#EXT-X-MEDIA-SEQUENCE:' + firstSequence, keyTag,
    ...names.flatMap((name, i) => ['#EXTINF:' + durations[i] + ',',
      mode === 'origin' && i === 1 ? 'https://other.example/segment.ts' : name]), '#EXT-X-ENDLIST', '',
  ].join(String.fromCharCode(10)));
  const grant = {kind: 'authorized-aes128-export.v1', manifestUrl,
    manifestSha256: hash(manifest), expiresAtMs: epoch + 1000,
    segments: cipher.map((bytes, i) => ({encryptedSha256: hash(bytes), plainSha256: hash(plain[i])}))};
  if (mode === 'count') grant.segments.pop();
  if (mode === 'manifest-digest') grant.manifestSha256 = '0'.repeat(64);
  if (mode !== 'no-grant') await writeFile(grantPath, JSON.stringify(grant), {mode: 0o600});

  const requests = [];
  const server = createServer((req, res) => {
    requests.push(req.url);
    const index = segmentPaths.indexOf(req.url);
    if (index === 1 && mode === 'missing') { res.writeHead(404).end(); return; }
    if (index === 1 && mode === 'source-expired') { res.writeHead(403).end(); return; }
    let bytes = req.url === manifestPath ? manifest : cipher[index];
    if (!bytes) { res.writeHead(404).end(); return; }
    if (index === 1 && mode === 'wrong-order') bytes = cipher[2];
    if (index === 1 && mode === 'corrupt') {
      bytes = Buffer.from(bytes);
      bytes[0] ^= 0xff;
    }
    res.writeHead(200, {'content-length': bytes.length, 'content-type': req.url === manifestPath
      ? 'application/vnd.apple.mpegurl' : 'application/octet-stream'}).end(bytes);
  });
  await new Promise((ok, fail) => server.once('error', fail).listen(0, '127.0.0.1', ok));
  t.after(() => new Promise(ok => { server.close(ok); server.closeAllConnections(); }));
  let now = mode === 'expired' ? grant.expiresAtMs : epoch;
  const stagedOnSecondRequest = [];
  const fetcher = async (url, options) => {
    const request = new URL(url);
    assert.equal(request.origin, new URL(manifestUrl).origin);
    assert.equal(options.redirect, 'error');
    assert.equal(options.credentials, 'omit');
    const response = await fetch('http://127.0.0.1:' + server.address().port + request.pathname, options);
    if (request.pathname === segmentPaths[1]) {
      const [dir] = (await readdir(outputRoot)).filter(name => name.startsWith('.aes128-export-'));
      if (dir) stagedOnSecondRequest.push(...await readdir(join(outputRoot, dir)));
      if (mode === 'expires-midway') now = grant.expiresAtMs;
      if (mode === 'revoked-midway') await unlink(grantPath);
    }
    // Only the fixture transport maps the allowed HTTPS origin to loopback.
    return {url, status: response.status, redirected: response.redirected, headers: response.headers, body: response.body};
  };
  return {outputRoot, grantPath, keyPath, grant, requests, cipher, stagedOnSecondRequest,
    run: () => exportAuthorizedAes128({grantPath, keyPath, outputRoot, fetcher, now: () => now})};
}

for (const explicitIv of [false, true]) {
  test('complete encrypted VOD preserves every ciphertext byte in playlist order (' +
      (explicitIv ? 'explicit IV' : 'media-sequence IV') + ')', async t => {
    const f = await fixture(t, {explicitIv, retain: !explicitIv});
    const result = await f.run();
    assert.equal(result.segmentCount, names.length);
    assert.deepEqual(f.requests, [manifestPath, ...segmentPaths]);
    assert.deepEqual(result.segments.map(row => row.sequence), ['308', '309', '310']);
    assert.deepEqual(result.segments.map(row => row.duration), durations);
    assert.equal(result.method, 'AES-128');
    assert.deepEqual(result.segments.map(row => row.iv), (explicitIv ? ['ab', 'ab', 'ab'] : ['134', '135', '136'])
      .map(hex => hex.padStart(32, '0')));
    assert.equal(result.totalBytes, f.cipher.reduce((n, bytes) => n + bytes.length, 0));
    const files = ['00001.ts.enc', '00002.ts.enc', '00003.ts.enc'];
    assert.deepEqual(await readdir(result.output), [...files, 'receipt.json']);
    for (const [i, file] of files.entries()) {
      const actual = await readFile(join(result.output, file));
      assert.deepEqual(actual, f.cipher[i]);
      assert.equal(hash(actual), f.grant.segments[i].encryptedSha256);
      assert.equal(result.segments[i].sha256, hash(actual));
      assert.equal(result.segments[i].file, file);
    }
    const receipt = JSON.parse(await readFile(join(result.output, 'receipt.json'), 'utf8'));
    const {output, ...evidence} = result;
    assert.deepEqual(receipt, evidence);
    assert.equal(receipt.manifestSha256, f.grant.manifestSha256);
    if (!explicitIv && process.env.OPENDESK_AES128_TEST_OUTPUT) t.diagnostic('Saved: ' + output);
  });
}

for (const [mode, code, requested] of [
  ['missing', 'E_MEDIA_HTTP', 2], ['source-expired', 'E_MEDIA_HTTP', 2],
  ['corrupt', 'E_EXPORT_SEGMENT_DIGEST', 2], ['wrong-order', 'E_EXPORT_SEGMENT_DIGEST', 2],
  ['expires-midway', 'E_EXPORT_REVOKED', 2], ['revoked-midway', 'E_EXPORT_REVOKED', 2],
  ['wrong-key', 'E_EXPORT_KEY_MISMATCH', 1], ['count', 'E_EXPORT_SEGMENT_COUNT', 0],
  ['manifest-digest', 'E_EXPORT_MANIFEST_DIGEST', 0], ['origin', 'E_EXPORT_ORIGIN', 0],
  ['no-grant', 'E_EXPORT_GRANT', null], ['expired', 'E_EXPORT_REVOKED', null], ['drm', 'E_EXPORT_HLS_UNSUPPORTED', 0],
]) {
  test(mode + ' does not publish an export or leave staged data', async t => {
    const f = await fixture(t, {mode});
    await assert.rejects(f.run(), {code});
    assert.deepEqual(await readdir(f.outputRoot), []);
    assert.deepEqual(f.requests, requested === null ? [] : [manifestPath, ...segmentPaths.slice(0, requested)]);
    if (requested === 2) assert.deepEqual(f.stagedOnSecondRequest, ['00001.ts.enc']);
  });
}

test('the CLI requires explicit confirmation before using even a valid local grant', async t => {
  const f = await fixture(t);
  await assert.rejects(promisify(execFile)(process.execPath, [cli, f.grantPath, f.keyPath, f.outputRoot]), error =>
    error.code === 2 && /--rights-confirmed/.test(error.stderr) && !error.stdout);
  assert.deepEqual(await readdir(f.outputRoot), []);
  assert.deepEqual(f.requests, []);
});
