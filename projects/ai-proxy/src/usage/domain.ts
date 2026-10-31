import { AI_SITES } from '../diagnostics/catalog';
import list from './vendor/public_suffix_list.dat?raw';

const exact = new Set<string>();
const wildcard = new Set<string>();
const exceptions = new Set<string>();
const roots = new Set<string>();
for (const line of list.split('\n')) {
  const rule = line.trim().split(/\s/)[0];
  if (!rule || rule.startsWith('//')) continue;
  const name = rule.replace(/^(?:!|\*\.)/, '');
  // WHATWG URL applies the same IDNA conversion to rules and observed hosts.
  const ascii = new URL('https://' + name).hostname;
  roots.add(ascii.split('.').at(-1)!);
  (rule.startsWith('!') ? exceptions : rule.startsWith('*.') ? wildcard : exact).add(ascii);
}

const special = new Set([
  'localhost', 'local', 'localdomain', 'internal', 'intranet', 'invalid', 'test',
  'lan', 'onion', 'home', 'arpa', 'example', 'corp', 'alt', 'i2p',
]);

/** ICANN + PRIVATE PSL: longest rule wins; exceptions remove their first label.
 * Unknown TLDs fail closed rather than applying PSL's implicit '*' fallback.
 * This classifies names only; it never performs DNS resolution or network I/O.
 */
export function registrableDomain(hostname: string): string | null {
  const labels = hostname.split('.');
  if (!roots.has(labels.at(-1)!) || special.has(labels.at(-1)!)) return null;
  let suffixLength = 1;
  for (let i = 0; i < labels.length; i++) {
    const tail = labels.slice(i).join('.');
    if (exceptions.has(tail)) return labels.slice(-(labels.length - i)).join('.');
    if (exact.has(tail)) suffixLength = Math.max(suffixLength, labels.length - i);
    if (i > 0 && wildcard.has(tail)) suffixLength = Math.max(suffixLength, labels.length - i + 1);
  }
  return labels.length > suffixLength ? labels.slice(-suffixLength - 1).join('.') : null;
}

export interface UsageDomain { siteKey: string; domain: string }

export function usageDomainFromUrl(raw: string): UsageDomain | null {
  if (typeof raw !== 'string' || raw.length > 8192 || /[\s\\\u0000-\u001f\u007f]/.test(raw)) return null;
  let url: URL;
  try { url = new URL(raw); } catch { return null; }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
  // Reject percent-escaped authorities instead of hiding an IP or credential separator.
  const authority = raw.match(/^https?:\/\/([^/?#]*)/i)?.[1];
  if (!authority || authority.includes('%')) return null;
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (host.length > 253 || host.split('.').some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) return null;
  const domain = registrableDomain(host);
  if (!domain) return null;
  const known = AI_SITES.find(site => host === site.domain || host.endsWith('.' + site.domain));
  return known ? { siteKey: known.id, domain: known.domain } : { siteKey: 'custom:' + domain, domain };
}

/** For ignore controls, accept a hostname only, never a URL or path. */
export function usageDomainFromHostname(raw: string): UsageDomain | null {
  if (typeof raw !== 'string' || /[\s/:@?#%\\]/.test(raw)) return null;
  return usageDomainFromUrl('https://' + raw + '/');
}
