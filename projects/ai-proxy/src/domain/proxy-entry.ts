import { validateHost } from './config';
import type { ProxyScheme } from './types';

export type ProxyAddressParts = { host: string; port: string; scheme?: ProxyScheme };
const proxySchemes = new Set<ProxyScheme>(['http', 'https', 'socks4', 'socks5']);

/** These are examples, not discovered open ports or a client's management API. */
export function portPresetsForScheme(scheme: ProxyScheme): readonly string[] {
  return scheme === 'socks4' || scheme === 'socks5' ? ['7891', '1080'] : ['7890', '8080'];
}

/** Examples only: these are never detected open ports. */
export const LOCAL_CLIENT_PRESETS = [
  { scheme:'http', port:'7890', label:'HTTP/Mixed · 7890' },
  { scheme:'socks5', port:'7891', label:'SOCKS5 · 7891' },
  { scheme:'socks5', port:'1080', label:'SOCKS5 · 1080' }
] as const;

export function isValidProxyPort(value: string): boolean {
  if (!/^\d{1,5}$/.test(value)) return false;
  const numeric = Number(value);
  return numeric >= 1 && numeric <= 65535;
}

/**
 * Accept pasted host:port or a supported protocol URI without credentials.
 * Never return credentials, log user input, or silently accept an IPv6 address:
 * the existing endpoint validator currently supports ASCII hosts and IPv4 only.
 */
export function parseProxyAddressPaste(value: string): ProxyAddressParts | null {
  const text = value.trim();
  if (!text || text.length > 2048 || /\s|@/.test(text)) return null;
  const fullUri = /^[a-z][a-z0-9+.-]*:\/\//i.test(text);
  const input = fullUri ? text : 'http://' + text;
  const portMatch = text.match(/:(\d{1,5})\/?$/);
  if (!portMatch || !isValidProxyPort(portMatch[1] ?? '')) return null;
  try {
    const url = new URL(input);
    const candidate = url.protocol.slice(0, -1).toLowerCase();
    if (!proxySchemes.has(candidate as ProxyScheme)) return null;
    if (url.username || url.password || (url.pathname && url.pathname !== '/') || url.search || url.hash) return null;
    const host = validateHost(url.hostname);
    return { host, port: String(Number(portMatch[1])), ...(fullUri ? { scheme: candidate as ProxyScheme } : {}) };
  } catch {
    return null;
  }
}
