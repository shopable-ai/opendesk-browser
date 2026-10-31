import { endpointFrom, validateDomain } from './config';
import type { ProxyEndpoint } from './types';

export type PacStarterMode = 'all' | 'site';

/** Generate inert PAC text from an existing validated endpoint. Never eval it here. */
export function createPacStarter(endpoint: ProxyEndpoint, mode: PacStarterMode, site = ''): string {
  const checked = endpointFrom(endpoint);
  const directive = ({http:'PROXY',https:'HTTPS',socks4:'SOCKS',socks5:'SOCKS5'} as const)[checked.scheme]
    + ' ' + checked.host + ':' + checked.port;
  if (mode === 'all') {
    return ['function FindProxyForURL(url, host) {',
      '  return ' + JSON.stringify(directive) + ';', '}'].join('\n');
  }
  if (mode !== 'site') throw new Error('Unsupported PAC starter mode');
  const domain = validateDomain(site);
  const escaped = JSON.stringify(domain);
  return ['function FindProxyForURL(url, host) {',
    '  host = String(host).toLowerCase().replace(/\\.$/, "");',
    '  if (host === ' + escaped + ' || dnsDomainIs(host, "." + ' + escaped + '))',
    '    return ' + JSON.stringify(directive) + ';',
    '  return "DIRECT";',
    '}'].join('\n');
}
