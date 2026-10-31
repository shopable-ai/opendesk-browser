import source from './product-links.defaults.json';
import approvedHosts from './public-hosts.allowlist.json';

// Production allowlist is intentionally empty until an operator verifies ownership
// of the HTTPS service and explicitly reviews each approved domain in source control.
// A remote JSON document must NEVER be allowed to extend this trust boundary.
export const APPROVED_PUBLIC_HOSTS: readonly string[] = approvedHosts;
export const PUBLIC_CONFIG_STORAGE_KEY = 'aiProxy.publicDisplay.v2';
export const PUBLIC_CONFIG_SCHEMA = 2;
export const PUBLIC_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const PUBLIC_MAX_STALE_MS = 7 * 24 * 60 * 60 * 1000;
export const PUBLIC_CONFIG_MAX_BYTES = 32 * 1024;

export const PUBLIC_LINK_KEYS = [
  'collector', 'support', 'officialService', 'pricing', 'documentation'
] as const;
export type PublicLinkKey = typeof PUBLIC_LINK_KEYS[number];
export type PublicDisplayConfig = {
  schemaVersion: 2;
  revision: number;
  links: Record<PublicLinkKey, string>;
  announcement?: string;
  release?: { latestVersion?: string; releaseNotesUrl?: string };
};

const DEFAULT = source as PublicDisplayConfig;
const own = (object: Record<string, unknown>, key: string) =>
  Object.prototype.hasOwnProperty.call(object, key);
function record(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('Invalid public config object');
  return input as Record<string, unknown>;
}
function onlyKeys(input: Record<string, unknown>, keys: readonly string[]): void {
  if (Object.keys(input).some(key => !keys.includes(key)))
    throw new Error('Unrecognized public config field');
}
export function safePublicUrl(raw: unknown, hosts: readonly string[] = APPROVED_PUBLIC_HOSTS): string | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 2048) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash ||
      !hosts.includes(url.hostname.toLowerCase()) || !url.hostname.includes('.')) return null;
    return url.href;
  } catch { return null; }
}
export function defaultPublicConfig(): PublicDisplayConfig {
  return {schemaVersion:2, revision:DEFAULT.revision, links:{...DEFAULT.links}};
}

/** Remote JSON is a small *partial display override*. Unknown fields fail closed. */
export function validatePublicConfig(
  value: unknown, hosts: readonly string[] = APPROVED_PUBLIC_HOSTS
): PublicDisplayConfig {
  const input = record(value);
  onlyKeys(input, ['schemaVersion','revision','links','announcement','release']);
  if (input.schemaVersion !== PUBLIC_CONFIG_SCHEMA || !Number.isSafeInteger(input.revision) ||
    (input.revision as number) < 1) throw new Error('Unsupported public config revision');
  const result = defaultPublicConfig();
  result.revision = input.revision as number;
  if (own(input,'links')) {
    const links = record(input.links);
    onlyKeys(links, PUBLIC_LINK_KEYS);
    for (const key of PUBLIC_LINK_KEYS) {
      if (!own(links,key)) continue;
      const raw = links[key];
      if (typeof raw !== 'string') throw new Error('Invalid public display link');
      // Empty means hidden. Unsafe non-empty URLs invalidate the full document.
      const url = raw === '' ? '' : safePublicUrl(raw,hosts);
      if (url === null) throw new Error('Unsafe public display link');
      result.links[key] = url;
    }
  }
  if (own(input,'announcement')) {
    if (typeof input.announcement !== 'string' || input.announcement.length > 240 ||
      /[<>\u0000-\u001f]/.test(input.announcement)) throw new Error('Invalid announcement');
    result.announcement = input.announcement;
  }
  if (own(input,'release')) {
    const release = record(input.release);
    onlyKeys(release,['latestVersion','releaseNotesUrl']);
    const item: NonNullable<PublicDisplayConfig['release']> = {};
    if (own(release,'latestVersion')) {
      if (typeof release.latestVersion !== 'string' ||
        !/^\d{1,3}\.\d{1,3}\.\d{1,3}(?:-[a-zA-Z0-9.-]{1,40})?$/.test(release.latestVersion))
        throw new Error('Invalid display-only version');
      item.latestVersion = release.latestVersion;
    }
    if (own(release,'releaseNotesUrl')) {
      const url = safePublicUrl(release.releaseNotesUrl, hosts);
      if (!url) throw new Error('Unsafe release notes');
      item.releaseNotesUrl = url;
    }
    result.release = item;
  }
  return result;
}
