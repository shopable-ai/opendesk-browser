import { createConfig, validateConfig, toManagedConfig } from './model.js';

export const STORAGE_KEY = 'ai-proxy.config.v2';

function unknown(message) {
  throw Object.assign(new Error(message), { code: 'E_OUTCOME_UNKNOWN' });
}

// No retry, fallback, startup enable or cached active profile. UI owns read generations.
export function createAdapter({ tool = globalThis.OpenDeskTool, sdk = globalThis.OpenDeskSDK, storageKey = STORAGE_KEY } = {}) {
  const managed = () => {
    const api = sdk?.browser?.proxy?.managed;
    if (!api) throw Object.assign(new Error('Managed proxy SDK unavailable'), { code: 'E_UNAVAILABLE' });
    return api;
  };
  return {
    async load() {
      const result = await tool.request('storage.get', { key: storageKey, withEtag: true });
      if (!result || !Object.hasOwn(result, 'value') || typeof result.etag !== 'string') unknown('Storage read was not confirmed');
      return { config: result.value == null ? createConfig() : validateConfig(result.value), etag: result.etag };
    },
    async save(config, etag) {
      const value = validateConfig(config);
      if (typeof etag !== 'string' || !etag) throw Object.assign(new Error('Read storage ETag before saving'), { code: 'E_CONFLICT' });
      if (new TextEncoder().encode(JSON.stringify(value)).length > 8192) throw Object.assign(new Error('Configuration exceeds storage item quota'), { code: 'E_QUOTA' });
      const result = await tool.request('storage.set', { key: storageKey, value, ifMatch: etag });
      if (result?.saved !== true) unknown('Storage write outcome unknown; do not replay');
      // storage.set does not return a new ETag: UI must load before its next save.
      return { saved: true };
    },
    async apply(profile) {
      const config = toManagedConfig(profile);
      return managed().requestEnable({ config });
    },
    async stop() { return managed().requestDisable(); },
    async status() { return managed().getStatus(); }
  };
}
