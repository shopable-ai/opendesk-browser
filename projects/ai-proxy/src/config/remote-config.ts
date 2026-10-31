import {getEnvironment} from '../environment';
import {
  APPROVED_PUBLIC_HOSTS, PUBLIC_CONFIG_STORAGE_KEY, PUBLIC_CHECK_INTERVAL_MS,
  PUBLIC_MAX_STALE_MS, PUBLIC_CONFIG_MAX_BYTES,
  defaultPublicConfig, safePublicUrl, validatePublicConfig,
  type PublicDisplayConfig
} from './public-config';

// Set ONLY after verifying the project-owned HTTPS JSON endpoint and adding its
// exact hostname to APPROVED_PUBLIC_HOSTS. No URL => no network traffic.
const OFFICIAL_JSON_URL = ''; // No official endpoint configured; never auto-fetch.

type Cache = { source: string; document?: unknown; fetchedAt?: number; checkedAt: number; etag?: string };
type Store = Pick<chrome.storage.StorageArea,'get'|'set'>;
type Dependencies = {
  url?: string; hosts?: readonly string[];
  store?: Store; fetcher?: typeof fetch; now?: number;
};
const pendingLoads = new WeakMap<Store, Promise<PublicDisplayConfig>>();

function cacheFrom(raw: unknown, source: string, now: number): Cache | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const cache = raw as Partial<Cache>;
  if (cache.source !== source || !Number.isFinite(cache.checkedAt) ||
    !cache.checkedAt || cache.checkedAt > now + 300000 || cache.checkedAt < 0) return null;
  return cache as Cache;
}
function cachedDocument(cache: Cache | null, hosts: readonly string[], now: number):
  PublicDisplayConfig | null {
  if (!cache || !Number.isFinite(cache.fetchedAt) || !cache.fetchedAt ||
    cache.fetchedAt > now + 300000 || now - cache.fetchedAt > PUBLIC_MAX_STALE_MS)
    return null;
  try { return validatePublicConfig(cache.document,hosts); } catch { return null; }
}
async function boundedJson(response: Response): Promise<unknown> {
  const size = Number(response.headers.get('content-length'));
  if (Number.isFinite(size) && size > PUBLIC_CONFIG_MAX_BYTES) throw new Error('Oversize public config');
  if (!(response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() === 'application/json') ||
    !response.body) throw new Error('Not a JSON response');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      total += item.value.byteLength;
      if (total > PUBLIC_CONFIG_MAX_BYTES) throw new Error('Oversize public config');
      chunks.push(item.value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(bytes)) as unknown;
}

/**
 * One-shot lazy refresh on UI request. No timers, persistent workers or access to
 * routing state. Refuses cross-origin redirects (including any untrusted target).
 */
export async function loadPublicConfig(deps: Dependencies = {}): Promise<PublicDisplayConfig> {
  const hosts = deps.hosts ?? APPROVED_PUBLIC_HOSTS;
  const official = safePublicUrl(deps.url ?? OFFICIAL_JSON_URL, hosts);
  const defaults = defaultPublicConfig();
  if (!official) return defaults; // Strictly offline, even if old storage exists.
  const store = deps.store ?? getEnvironment().storage.local;
  const refresh = () => refreshPublicConfig(deps,store,official,hosts);
  // Pages share extension storage, so the lock must span independent UI contexts.
  if (globalThis.navigator?.locks)
    return navigator.locks.request(PUBLIC_CONFIG_STORAGE_KEY,refresh);
  // Keep non-browser callers serialized too, without sharing injected stores.
  const pending = pendingLoads.get(store) ?? Promise.resolve();
  const task = pending.catch(() => {}).then(refresh);
  pendingLoads.set(store,task);
  try { return await task; }
  finally { if (pendingLoads.get(store) === task) pendingLoads.delete(store); }
}

async function refreshPublicConfig(
  deps: Dependencies, store: Store, official: string, hosts: readonly string[]
): Promise<PublicDisplayConfig> {
  const defaults = defaultPublicConfig();
  const time = () => deps.now ?? Date.now();
  let cache: Cache | null = null;
  try {
    const raw = (await store.get(PUBLIC_CONFIG_STORAGE_KEY))[PUBLIC_CONFIG_STORAGE_KEY];
    cache = cacheFrom(raw,official,time());
  } catch { return defaults; }
  const now = time();
  const previous = cachedDocument(cache,hosts,now);
  if (cache && now - cache.checkedAt >= 0 && now - cache.checkedAt < PUBLIC_CHECK_INTERVAL_MS)
    return previous ?? defaults;
  const metadata: Cache = {...(cache ?? {}),source:official,checkedAt:now};
  const validator = previous && cache?.etag;
  try {
    const response = await (deps.fetcher ?? fetch)(official,{
      method:'GET',redirect:'manual',cache:'no-store',credentials:'omit',
      headers:{Accept:'application/json',
        ...(validator ? {'If-None-Match':validator} : {})},
      signal:AbortSignal.timeout(4000)
    });
    if (response.redirected || (response.url && response.url !== official))
      throw new Error('Public config redirect blocked');
    if (response.status === 304 && previous && cache && validator) {
      const confirmedAt = time();
      await store.set({[PUBLIC_CONFIG_STORAGE_KEY]:{
        ...metadata,fetchedAt:confirmedAt,checkedAt:confirmedAt,document:previous
      }});
      return previous;
    }
    if (response.status !== 200) throw new Error('Public config HTTP error');
    const candidate = validatePublicConfig(await boundedJson(response),hosts);
    const etag = response.headers.get('etag');
    const fetchedAt = time();
    const next: Cache = {source:official,document:candidate,fetchedAt,checkedAt:fetchedAt,
      ...(etag && etag.length <= 160 && /^[\x20-\x7e]+$/.test(etag) ? {etag} : {})};
    await store.set({[PUBLIC_CONFIG_STORAGE_KEY]:next});
    return candidate;
  } catch {
    // Fail without overwriting the last valid payload; back off until next check.
    metadata.checkedAt = time();
    try { await store.set({[PUBLIC_CONFIG_STORAGE_KEY]:metadata}); } catch { /* storage unavailable */ }
    return cachedDocument(cache,hosts,time()) ?? defaults;
  }
}

