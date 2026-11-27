// Development-only entry. The browser's encrypted playback policy does not call this.
import {createHash, webcrypto} from 'node:crypto';
import {constants} from 'node:fs';
import {lstat, mkdir, mkdtemp, open, rename, rm, writeFile} from 'node:fs/promises';
import {basename, join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {HLS_MAX_SEGMENTS, parseHlsPlaylist} from '../trusted/hls.js';
import {mediaError, publicMediaUrl, readMediaBytes, STREAM_LIMITS, validateTs} from '../trusted/stream.js';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const isSha = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const maxGrantBytes = 512 * 1024;
const decode = bytes => new TextDecoder('utf-8', {fatal: true}).decode(bytes);
const invalid = () => mediaError('E_EXPORT_HLS_UNSUPPORTED');
const sameFile = (a, b) => ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs'].every(field => a[field] === b[field]);

async function readLocal(path, maxBytes, code) {
  const bytes = Buffer.alloc(maxBytes + 1);
  let file;
  try {
    file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const info = await file.stat();
    if (!info.isFile() || info.size > maxBytes) throw mediaError(code);
    let size = 0;
    while (size < bytes.length) {
      const {bytesRead} = await file.read(bytes, size, bytes.length - size, size);
      if (!bytesRead) break;
      size += bytesRead;
    }
    if (size !== info.size || !sameFile(info, await file.stat())) throw mediaError(code);
    return {info, bytes: bytes.subarray(0, size)};
  } catch {
    bytes.fill(0);
    throw mediaError(code);
  } finally { await file?.close(); }
}

function checkGrant(raw) {
  let grant;
  try { grant = JSON.parse(decode(raw)); } catch { throw mediaError('E_EXPORT_GRANT'); }
  if (grant?.kind !== 'authorized-aes128-export.v1' || typeof grant.manifestUrl !== 'string' ||
      !isSha(grant.manifestSha256) || !Number.isSafeInteger(grant.expiresAtMs) ||
      !Array.isArray(grant.segments) || !grant.segments.length || grant.segments.length > HLS_MAX_SEGMENTS ||
      !grant.segments.every(row => isSha(row?.encryptedSha256) && isSha(row?.plainSha256))) {
    throw mediaError('E_EXPORT_GRANT');
  }
  return grant;
}

function planSegments(bytes, url) {
  let source, playlist;
  try { source = decode(bytes); playlist = parseHlsPlaylist(source); } catch { throw invalid(); }
  if (playlist.kind !== 'media' || !playlist.vod || !playlist.segments || playlist.encryption !== 'encrypted' ||
      playlist.container !== 'ts' || playlist.unsupported.length || playlist.duration > STREAM_LIMITS.maxDuration) {
    throw invalid();
  }
  const lines = source.split('\n').map(line => line.trim());
  const firstMedia = lines.findIndex(line => line.startsWith('#EXTINF:'));
  const keys = lines.filter(line => /^#EXT-X-(?:SESSION-KEY|KEY):/.test(line));
  if (keys.length !== 1 || !keys[0].startsWith('#EXT-X-KEY:') || lines.indexOf(keys[0]) >= firstMedia) throw invalid();
  const attributes = keys[0].slice('#EXT-X-KEY:'.length);
  const entries = [...attributes.matchAll(/(?:^|,)(METHOD|URI|IV)=("[^"\r\n]*"|[^",\r\n]+)/g)];
  const key = new Map(entries.map(([, name, value]) => [name, value]));
  if (entries.map(entry => entry[0]).join('') !== attributes || entries.length !== key.size ||
      key.get('METHOD') !== 'AES-128' || !/^"[^"]+"$/.test(key.get('URI') || '') ||
      key.has('IV') && !/^0x[0-9a-fA-F]{1,32}$/.test(key.get('IV'))) throw invalid();
  const prefix = '#EXT-X-MEDIA-SEQUENCE:';
  const sequences = lines.filter(line => line.startsWith(prefix));
  const sequence = sequences[0]?.slice(prefix.length) ?? '0';
  if (sequences.length > 1 || sequences.length && lines.indexOf(sequences[0]) >= firstMedia ||
      !/^\d{1,20}$/.test(sequence) || BigInt(sequence) + BigInt(playlist.segments - 1) >= 2n ** 64n) throw invalid();
  const ivHex = key.get('IV')?.slice(2);
  return playlist.segmentList.map(({index, uri, duration}) => {
    const mediaSequence = BigInt(sequence) + BigInt(index);
    return {url: publicMediaUrl(uri, url), duration, sequence: mediaSequence.toString(),
      iv: Buffer.from((ivHex ?? mediaSequence.toString(16)).padStart(32, '0'), 'hex')};
  });
}

export async function exportAuthorizedAes128({grantPath, keyPath, outputRoot, signal,
  fetcher = globalThis.fetch, now = Date.now}) {
  const {info: initial, bytes: grantBytes} = await readLocal(grantPath, maxGrantBytes, 'E_EXPORT_GRANT');
  const grant = checkGrant(grantBytes);
  const grantHash = sha(grantBytes);
  const manifestUrl = publicMediaUrl(grant.manifestUrl);
  const origin = new URL(manifestUrl).origin;
  if (!origin.startsWith('https://')) throw mediaError('E_EXPORT_ORIGIN');
  const assertGrant = async () => {
    signal?.throwIfAborted();
    const info = await lstat(grantPath).catch(() => { throw mediaError('E_EXPORT_REVOKED'); });
    if (now() >= grant.expiresAtMs || !info.isFile() || !sameFile(info, initial)) {
      throw mediaError('E_EXPORT_REVOKED');
    }
  };
  const allowed = new Set([manifestUrl]);
  const authorize = async url => {
    if (!allowed.has(url)) throw mediaError('E_EXPORT_ORIGIN');
    await assertGrant();
  };
  const options = {authorize, fetcher, signal};
  await assertGrant();
  const {bytes: keyBytes} = await readLocal(keyPath, 16, 'E_EXPORT_KEY');
  let key;
  try {
    if (keyBytes.length !== 16) throw mediaError('E_EXPORT_KEY');
    key = await webcrypto.subtle.importKey('raw', keyBytes, 'AES-CBC', false, ['decrypt']);
  } finally { keyBytes.fill(0); }

  const manifestBytes = await readMediaBytes(manifestUrl, {...options, manifest: true, maxBytes: STREAM_LIMITS.manifestBytes});
  if (sha(manifestBytes) !== grant.manifestSha256) throw mediaError('E_EXPORT_MANIFEST_DIGEST');
  const plan = planSegments(manifestBytes, manifestUrl);
  if (plan.length !== grant.segments.length) throw mediaError('E_EXPORT_SEGMENT_COUNT');
  for (const row of plan) {
    if (new URL(row.url).origin !== origin) throw mediaError('E_EXPORT_ORIGIN');
    allowed.add(row.url);
  }

  const root = resolve(outputRoot);
  await mkdir(root, {recursive: true});
  const staging = await mkdtemp(join(root, '.aes128-export-'));
  let committed = false;
  try {
    const segments = [];
    let totalBytes = 0;
    for (const [index, row] of plan.entries()) {
      const {encryptedSha256, plainSha256} = grant.segments[index];
      const bytes = await readMediaBytes(row.url, {...options, onBytes: count => {
        totalBytes += count;
        if (totalBytes > STREAM_LIMITS.totalBytes) throw mediaError('E_MEDIA_TOTAL_SIZE');
      }});
      if (sha(bytes) !== encryptedSha256) throw mediaError('E_EXPORT_SEGMENT_DIGEST');
      let plain;
      try {
        const decrypted = await webcrypto.subtle.decrypt({name: 'AES-CBC', iv: row.iv}, key, bytes)
          .catch(() => { throw mediaError('E_EXPORT_KEY_MISMATCH'); });
        plain = new Uint8Array(decrypted);
        if (sha(plain) !== plainSha256) throw mediaError('E_EXPORT_KEY_MISMATCH');
        validateTs(plain);
      } finally { plain?.fill(0); }
      await assertGrant();
      const file = String(index + 1).padStart(5, '0') + '.ts.enc';
      await writeFile(join(staging, file), bytes, {flag: 'wx', mode: 0o600});
      segments.push({index, sequence: row.sequence, duration: row.duration, iv: row.iv.toString('hex'),
        file, bytes: bytes.length, sha256: encryptedSha256});
    }
    const receipt = {kind: grant.kind, method: 'AES-128', manifestSha256: grant.manifestSha256,
      segmentCount: segments.length, totalBytes, segments};
    await writeFile(join(staging, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n', {flag: 'wx', mode: 0o600});
    const {bytes: finalGrant} = await readLocal(grantPath, maxGrantBytes, 'E_EXPORT_REVOKED');
    if (sha(finalGrant) !== grantHash) throw mediaError('E_EXPORT_REVOKED');
    await assertGrant();
    const output = join(root, basename(staging).slice(1));
    await rename(staging, output);
    committed = true;
    return {output, ...receipt};
  } finally {
    if (!committed) await rm(staging, {recursive: true, force: true});
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const [confirmation, grantPath, keyPath, outputRoot, ...extra] = process.argv.slice(2);
  if (confirmation !== '--rights-confirmed' || !grantPath || !keyPath || !outputRoot || extra.length) {
    console.error('Usage: node export-authorized-aes128.mjs --rights-confirmed <owner-grant.json> <local-aes128-key> <output-dir>');
    process.exitCode = 2;
  } else {
    const controller = new AbortController();
    const stop = () => controller.abort(mediaError('E_MEDIA_STOPPED'));
    process.once('SIGINT', stop);
    try {
      const {output, segmentCount, totalBytes} = await exportAuthorizedAes128({grantPath, keyPath, outputRoot, signal: controller.signal});
      console.log(JSON.stringify({output, segmentCount, totalBytes}));
    } catch (error) {
      console.error(error?.code || 'E_EXPORT_FAILED');
      process.exitCode = 1;
    } finally { process.off('SIGINT', stop); }
  }
}
