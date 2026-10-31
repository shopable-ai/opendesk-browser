import type { ConfigState, ProxyEndpoint, RuleTarget } from './types';
import { pacTextFrom, validateConfig } from './config';

/** Declared PAC output only. Never eval/import remote PAC in the extension. */
function proxyDirective(endpoint: ProxyEndpoint): string {
  const scheme = ({ http: 'PROXY', https: 'HTTPS', socks4: 'SOCKS', socks5: 'SOCKS5' } as const)[endpoint.scheme];
  return scheme + ' ' + endpoint.host + ':' + endpoint.port;
}
function targetDirective(target: RuleTarget, config: ConfigState): string {
  if (target.action === 'direct') return 'DIRECT';
  const endpoint = config.endpoints.find(v => v.id === target.endpointId);
  if (!endpoint) throw new Error('PAC 引用了不存在的端点');
  return proxyDirective(endpoint);
}
export function compileRulesPac(configRaw: ConfigState): string {
  const config = validateConfig(configRaw);
  const rules = config.rules.filter(r => r.enabled).sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
  if (rules.length > 1000) throw new Error('规则数量超过 1000 条上限');
  const lines = ['function FindProxyForURL(url, host) {', '  host = String(host).toLowerCase().replace(/\\.$/, "");'];
  for (const r of rules) {
    const domain = JSON.stringify(r.domain);
    const check = r.includeSubdomains
      ? '(host === ' + domain + ' || dnsDomainIs(host, "." + ' + domain + '))'
      : 'host === ' + domain;
    lines.push('  if (' + check + ') return ' + JSON.stringify(targetDirective(r, config)) + ';');
  }
  lines.push('  return ' + JSON.stringify(targetDirective(config.defaultTarget, config)) + ';');
  lines.push('}');
  return lines.join('\n');
}
/** Lightweight structural check only: not an interpreter, formal validator or threat scanner. */
export function validateUserPac(text: string): string {
  return pacTextFrom(text);
}

