import { BUDGETS, invariant } from '../protocol.js';

export async function hashArtifactBytes(bytes) {
  invariant(bytes instanceof Uint8Array, 'E_SCHEMA', 'Artifact bytes must be Uint8Array');
  const hash = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export function canReleaseBlob(attempt, now = Date.now(), { readerPinned = false } = {}) {
  if (readerPinned) return false;
  if (['complete', 'interrupted', 'abandoned'].includes(attempt.state)) return true;
  return attempt.downloadDeadline !== null && Number(now) >= Date.parse(attempt.downloadDeadline);
}

// RunHost owns this registry. Neither the SW nor the service creates object URLs.
export function createHostBlobRegistry({ url = globalThis.URL, BlobClass = globalThis.Blob, clock = Date.now } = {}) {
  const resources = new Map();
  const used = new Set();
  const now = () => Number(typeof clock === 'function' ? clock() : clock.now());
  return Object.freeze({
    create(bytes, mime) {
      invariant(bytes instanceof Uint8Array && bytes.byteLength <= BUDGETS.maxArtifactBytes,
        'E_SCHEMA', 'Invalid artifact bytes');
      invariant(['application/json', 'text/csv;charset=utf-8'].includes(mime), 'E_SCHEMA', 'Invalid artifact MIME');
      const blobUrl = url.createObjectURL(new BlobClass([bytes.slice()], { type: mime }));
      invariant(/^blob:chrome-extension:\/\//.test(blobUrl) && !used.has(blobUrl), 'E_TARGET', 'A fresh extension Blob URL is required');
      used.add(blobUrl);
      resources.set(blobUrl, { pins: 0 });
      return blobUrl;
    },
    pin(blobUrl) {
      const resource = resources.get(blobUrl);
      invariant(resource, 'E_SCHEMA', 'Blob URL is unavailable');
      resource.pins++;
      let active = true;
      return () => { if (active) { active = false; resource.pins--; } };
    },
    release(attempt, options = {}) {
      const resource = resources.get(attempt.blobUrl);
      if (!resource) return false;
      if (!canReleaseBlob(attempt, now(), { readerPinned: options.readerPinned || resource.pins > 0 })) return false;
      url.revokeObjectURL(attempt.blobUrl);
      resources.delete(attempt.blobUrl);
      return true;
    },
    has(blobUrl) { return resources.has(blobUrl); },
  });
}
