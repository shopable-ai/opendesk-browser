import type { ConfigState } from './types';

const unsupported = (): never => {
  throw Object.assign(new Error('此配置不在公开代理服务范围；配置已保留，未更改浏览器路由。'), { code: 'E_UNSUPPORTED' });
};
const publicDomain = (host: string) => host.length <= 253 && host.includes('.') &&
  !/^[\d.]+$/.test(host) &&
  !/(?:^|\.)(?:localhost|local|internal|private|lan|home|arpa)$/.test(host) &&
  host.split('.').every(part => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(part));

/** Convert validated fullconfig intent without changing storage or widening its route. */
export function toManagedRoute(config: ConfigState) {
  const mode = config.selection.mode;
  if (mode === 'direct') return { mode: 'direct' as const };
  let endpointId: string | undefined;
  let domains: string[] | undefined;
  if (mode === 'profile') {
    const profile = config.profiles.find(row => row.id === config.selection.profileId);
    if (!profile || profile.kind !== 'endpoint') return unsupported();
    endpointId = profile.endpointId;
  } else if (mode === 'rules') {
    const rules = config.rules.filter(row => row.enabled);
    if (config.defaultTarget.action !== 'direct' || rules.length < 1 || rules.length > 16 ||
        rules.some(row => row.action !== 'endpoint' || !row.includeSubdomains) ||
        new Set(rules.map(row => row.endpointId)).size !== 1) return unsupported();
    endpointId = rules[0].endpointId;
    domains = rules.map(row => row.domain).sort();
    if (!domains.every(publicDomain) || new Set(domains).size !== domains.length) return unsupported();
  } else return unsupported();

  const selected = config.endpoints.find(row => row.id === endpointId);
  if (!selected || selected.credentialRef) return unsupported();
  const { scheme, host, port } = selected;
  const source = config.sources.find(row => row.id === selected.sourceId);
  const loopback = host === '127.0.0.1';
  if (loopback) {
    if (source?.kind !== 'local-client' || !source.trustedByUser || !['http', 'socks5'].includes(scheme)) return unsupported();
  } else if (source?.kind === 'local-client' || !publicDomain(host) || !['https', 'socks5'].includes(scheme)) return unsupported();
  if (!Number.isInteger(port) || port < 1 || port > 65535) return unsupported();
  const endpoint = { scheme, host, port };
  if (mode === 'profile') return { mode: 'fixed_servers' as const, endpoint };
  // Preserve the existing public rules shape; loopback requires explicit mode.
  return loopback ? { mode: 'rules' as const, endpoint, domains: domains! } : { endpoint, domains: domains! };
}

const exactKeys = (value: unknown, keys: string[]): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).sort().join(',') === [...keys].sort().join(',');

/** Canonical comparison key for the exact public SDK shapes, never arbitrary PAC. */
function routeKey(route: unknown): string | null {
  if (exactKeys(route, ['mode']) && route.mode === 'direct') return 'direct';
  if (route === null || typeof route !== 'object' || Array.isArray(route)) return null;
  const value = route as Record<string, unknown>;
  const fixed = value.mode === 'fixed_servers';
  const explicit = fixed || value.mode === 'rules';
  if (!exactKeys(value, fixed ? ['mode', 'endpoint'] :
    explicit ? ['mode', 'endpoint', 'domains'] : ['endpoint', 'domains'])) return null;
  const endpoint = value.endpoint;
  if (!exactKeys(endpoint, ['scheme', 'host', 'port'])) return null;
  const { scheme, host, port } = endpoint;
  if (typeof scheme !== 'string' || typeof host !== 'string' || typeof port !== 'number' ||
      !Number.isInteger(port) || port < 1 || port > 65535) return null;
  const local = explicit && host === '127.0.0.1' && ['http', 'socks5'].includes(scheme);
  if (!local && (!['https', 'socks5'].includes(scheme) || !publicDomain(host))) return null;
  let domains: string[] = [];
  if (!fixed) {
    if (!Array.isArray(value.domains) || value.domains.length < 1 || value.domains.length > 16 ||
        !value.domains.every(domain => typeof domain === 'string' && publicDomain(domain)) ||
        new Set(value.domains).size !== value.domains.length) return null;
    domains = [...value.domains].sort();
  }
  return JSON.stringify([fixed ? 'fixed_servers' : 'rules', scheme, host, port, domains]);
}

/** Recover a verified active route's UI selection; never apply or persist it. */
export function configForManagedRoute(config: ConfigState, route: unknown): ConfigState | null {
  const key = routeKey(route);
  if (key === null) return null;
  const selections: ConfigState['selection'][] = [
    config.selection,
    { mode: 'direct' },
    ...config.profiles.filter(profile => profile.kind === 'endpoint')
      .map(profile => ({ mode: 'profile' as const, profileId: profile.id })),
    { mode: 'rules' }
  ];
  for (const selection of selections) {
    let candidateKey: string | null;
    try {
      candidateKey = routeKey(toManagedRoute({ ...config, selection }));
    } catch {
      // Unsupported intent (including authentication/PAC) is not recoverable.
      continue;
    }
    if (candidateKey === key) {
      const result = structuredClone(config);
      result.selection = structuredClone(selection);
      result.managed = true;
      return result;
    }
  }
  return null;
}
