const BACKGROUND_RESOURCE_ERROR="E_RESOURCE_UNAVAILABLE";
import {fail, SDK_LIMITS} from '../../framework/sdk/registry.js';
import {SDK_RESOURCE_PATHS, SDK_RESOURCE_ALIASES, SDK_RESOURCE_MANIFEST} from '../../framework/sdk/resource-contract.js';

const exactFields = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));

export function createBackgroundServices({api, clock, fetchImpl = globalThis.fetch, logger = console} = {}) {
  function root() {
    const value = api?.runtime?.getURL('/');
    if (typeof value !== 'string' || !/^chrome-extension:\/\/[a-p]{32}\/$/.test(value))
      throw fail(BACKGROUND_RESOURCE_ERROR, 'Extension runtime root is unavailable');
    return value;
  }
  function resourcePath(value) {
    const base = root();
    if (typeof value !== 'string' || !value || value.length > 1024 || /[\\%?#\s]/.test(value) || value.includes('..'))
      throw fail('E_SCHEMA', 'Invalid packaged resource URL');
    const path = value.startsWith(base) ? value.slice(base.length) : value;
    if (path.startsWith('/') || path.includes(':')) throw fail('E_SCHEMA', 'Only this extension package is readable');
    if (SDK_RESOURCE_PATHS.includes(path)) return path;
    if (Object.hasOwn(SDK_RESOURCE_ALIASES, path)) return SDK_RESOURCE_ALIASES[path];
    throw fail(BACKGROUND_RESOURCE_ERROR, 'Resource is outside the fixed package list');
  }
  async function bytesAt(path, limit) {
    if (typeof fetchImpl !== 'function') throw fail(BACKGROUND_RESOURCE_ERROR, 'Packaged resource reader is unavailable');
    let response;
    try { response = await fetchImpl(api.runtime.getURL(path), {redirect: 'error', credentials: 'omit'}); }
    catch { throw fail(BACKGROUND_RESOURCE_ERROR, 'Packaged resource could not be read'); }
    if (!response.ok) throw fail(BACKGROUND_RESOURCE_ERROR, 'Packaged resource is missing');
    const declared = Number(response.headers?.get('content-length'));
    if (Number.isFinite(declared) && declared > limit) throw fail(BACKGROUND_RESOURCE_ERROR, 'Packaged resource exceeds its size limit');
    const chunks = []; let size = 0;
    if (response.body?.getReader) {
      const reader = response.body.getReader();
      try {
        while (true) {
          const {done, value} = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > limit) { await reader.cancel(); throw fail(BACKGROUND_RESOURCE_ERROR, 'Packaged resource exceeds its size limit'); }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
    } else {
      const value = new Uint8Array(await response.arrayBuffer()); size = value.byteLength;
      if (size > limit) throw fail(BACKGROUND_RESOURCE_ERROR, 'Packaged resource exceeds its size limit');
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return bytes;
  }
  async function resource(path) {
    let manifest;
    try { manifest = JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(await bytesAt(SDK_RESOURCE_MANIFEST, 8192))); }
    catch (error) { if (error.code) throw error; throw fail(BACKGROUND_RESOURCE_ERROR, 'Invalid packaged resource manifest'); }
    if (!exactFields(manifest, ['schemaVersion', 'resources']) || manifest.schemaVersion !== 1 ||
        !Array.isArray(manifest.resources) || manifest.resources.length !== SDK_RESOURCE_PATHS.length ||
        !manifest.resources.every((entry, index) => exactFields(entry, ['path', 'bytes', 'sha256']) &&
          entry.path === SDK_RESOURCE_PATHS[index] && Number.isSafeInteger(entry.bytes) && entry.bytes > 0 &&
          entry.bytes <= SDK_LIMITS.responseBytes && /^[a-f0-9]{64}$/.test(entry.sha256)))
      throw fail(BACKGROUND_RESOURCE_ERROR, 'Resource manifest differs from the fixed contract');
    const entry = manifest.resources.find(item => item.path === path);
    const bytes = await bytesAt(path, entry.bytes);
    const sha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('');
    if (bytes.byteLength !== entry.bytes || sha256 !== entry.sha256) throw fail(BACKGROUND_RESOURCE_ERROR, 'Packaged resource integrity mismatch');
    try { return {success:true, data:new TextDecoder('utf-8', {fatal:true}).decode(bytes)}; }
    catch { throw fail(BACKGROUND_RESOURCE_ERROR, 'Packaged resource is not UTF-8'); }
  }
  return Object.freeze({async execute(method, args, context) {
    const capability = method === 'log' ? 'service.log' : method === 'getTime' ? 'service.time' : 'resources.packaged';
    // Resolve before dispatch: invalid or remote URLs never reach any fetch.
    const path = method === 'requestResource' ? resourcePath(args.url) : undefined;
    await context.authorize({capability, phase:'pre'});
    context.assertDispatch();
    let value;
    if (method === 'log') {
      if (typeof logger?.info !== 'function') throw fail(BACKGROUND_RESOURCE_ERROR, 'Trusted log sink is unavailable');
      logger.info('opendesk.sdk.log', Object.freeze({messageBytes:new TextEncoder().encode(args.message).byteLength, dataItems:args.data?.length ?? 0}));
      value = undefined;
    } else if (method === 'getTime') {
      value = clock?.now();
      if (!Number.isFinite(value)) throw fail(BACKGROUND_RESOURCE_ERROR, 'Trusted clock returned a non-finite value');
    } else if (method === 'bexUrl') value = {url:root()};
    else if (method === 'requestResource') value = await resource(path);
    else throw fail('E_SERVICE_UNSUPPORTED');
    await context.recordEffect(value);
    await context.authorize({capability, phase:'post'});
    context.assertDispatch();
    return value;
  }});
}
